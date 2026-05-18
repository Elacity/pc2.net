/**
 * DASH Packager for PC2 Node — WASM-native pipeline (Phase 2).
 *
 * Replaces the previous mp4dash Python pipeline with:
 *   mp4split (TypeScript fMP4 parser) → cenc-encrypt (Rust WASM) → mpdGenerator (TypeScript)
 *
 * Pipeline: CEK generation → Chipotle CEK escrow → Split fMP4 → WASM encrypt segments →
 *           WASM transform init → Generate MPD → Write DASH dir → IPFS upload
 *
 * Zero Python dependency. Zero mp4encrypt dependency.
 */

import * as crypto from 'crypto';
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import { encryptWithLitAction, buildSelfRefConditions, type EncryptResult } from '../../api/chipotle-client.js';
import { splitFragmentedMP4WASM } from './mp4split.js';
import { generateMPD, buildMPDTracks } from './mpdGenerator.js';
import { getWASMRuntime } from '../wasm/WASMRuntime.js';
import { resolve as pathResolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ELACITY_SYSTEM_ID = 'bf2c86c1d9ff4ab1b4be45ae4d99e1fe';

const MEDIA_DECRYPT_ACTION_CID = 'QmSHMSxPogSsNki51fenDzsrkKB3eJfRMHXEPZKqPk6EAb';
const MEDIA_ENCRYPT_ACTION_CID = 'QmdwzJvfgCRvNh9pQ63zroFozR9CfJdiweqTCkVMubD47U';

import { getBaseRpcUrl } from '../../utils/rpc.js';

// V3 AuthorityGateway on Base — must stay in lock-step with the same
// constant in `storage.ts` and `chipotle-client.ts`. The env var override
// is supported for future per-deploy authority swaps, but pc2-node does
// not currently load dotenv (so any `pc2-node/.env` value is ignored at
// runtime) — without the hardcoded default below, every video packaged
// by the Creator embedded `authority: undefined` in its PSSH and only
// played because `media.ts` falls back to the URL-param `clientAuthority`.
// V1.3 contract migration checklist (`.cursor/tasks/V1.3-RELEASE`) calls
// out updating all three call sites in lock-step.
const DEFAULT_AUTHORITY = process.env.DDRM_AUTHORITY || '0x09dBe796f40ECEffEAccf243c3d758C4c1d8D87D';
const DEFAULT_CHAIN_ID = parseInt(process.env.DDRM_CHAIN_ID || '8453', 10);
// Env var override for PSSH-embedded RPC; falls back to shared pool
const DEFAULT_RPC = process.env.DDRM_RPC || getBaseRpcUrl();

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DashPackageResult {
  cid: string;
  mpdUri: string;
  kid: string;
  ciphertext: string;
  dataToEncryptHash: string;
  litBackend: 'chipotle';
  size: number;
}

interface PSSHProtectionData {
  protocolVersion: string;
  protectionType: string;
  variant: string;
  ciphersuite: string;
  data: {
    authority: string;
    chainId: number;
    rpc: string;
    actionIpfsId: string;
    litBackend: string;
    ciphertext: string;
    hash: string;
    kid: string;
  };
}

// ─── WASM Binary Loading ────────────────────────────────────────────────────

let cachedCENCEncryptWasm: ArrayBuffer | null = null;

async function loadCENCEncryptWasm(): Promise<ArrayBuffer> {
  if (cachedCENCEncryptWasm) return cachedCENCEncryptWasm;
  const wasmPath = pathResolve(__dirname, '../../../wasm-apps/cenc-encrypt/cenc-encrypt.wasm');
  if (!existsSync(wasmPath)) {
    throw new Error(`cenc-encrypt WASM not found: ${wasmPath} — run scripts/build-wasm.sh`);
  }
  cachedCENCEncryptWasm = readFileSync(wasmPath).buffer;
  logger.info(`[DASHPackager] Loaded cenc-encrypt WASM (${(cachedCENCEncryptWasm.byteLength / 1024).toFixed(0)} KB)`);
  return cachedCENCEncryptWasm;
}

loadCENCEncryptWasm().catch((err) =>
  logger.warn(`[DASHPackager] WASM preload skipped: ${err.message}`)
);

// ─── CEK Generation ─────────────────────────────────────────────────────────

export function generateCEK(): { cek: Buffer; kid: string } {
  const cek = crypto.randomBytes(16);
  const kid = crypto.randomUUID().replace(/-/g, '');
  return { cek, kid };
}

// ─── CEK Encryption via Chipotle ────────────────────────────────────────────

export async function encryptMediaCEK(cek: Buffer): Promise<EncryptResult> {
  const cekBase64 = cek.toString('base64');
  const dataToEncrypt = new TextEncoder().encode(cekBase64);
  const conditions = buildSelfRefConditions(MEDIA_ENCRYPT_ACTION_CID);

  const MAX_RETRIES = 5;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await encryptWithLitAction({
        dataToEncrypt,
        accessControlConditions: conditions,
      });
      logger.info(`[DASHPackager] CEK encrypted via Chipotle (hash: ${result.dataToEncryptHash.substring(0, 12)}...)`);
      return result;
    } catch (err: any) {
      const msg = err.message || '';
      const isRetryable = msg.includes('fetch failed') ||
        msg.includes('ECONNRESET') ||
        msg.includes('TLS') ||
        msg.includes('SSL') ||
        msg.includes('socket disconnected') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('ECONNREFUSED');
      if (isRetryable && attempt < MAX_RETRIES) {
        const delayMs = Math.min(attempt * 3000, 15000);
        logger.warn(`[DASHPackager] CEK encrypt attempt ${attempt}/${MAX_RETRIES} failed (${msg}), retrying in ${delayMs / 1000}s...`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('encryptMediaCEK: unreachable');
}

// ─── PSSH Construction ──────────────────────────────────────────────────────

export function buildPSSHJson(outputDir: string, encryptResult: { ciphertext: string; dataToEncryptHash: string }): string {
  const cleanHash = encryptResult.dataToEncryptHash.startsWith('0x')
    ? encryptResult.dataToEncryptHash.slice(2)
    : encryptResult.dataToEncryptHash;
  const contractKid = '0x' + cleanHash.slice(0, 32).padEnd(32, '0');

  const protectionData: PSSHProtectionData = {
    protocolVersion: '2.0',
    protectionType: 'cenc:lit-aes-gcm-v3',
    variant: 'eth.web3.clearkey',
    ciphersuite: 'e8582013',
    data: {
      authority: DEFAULT_AUTHORITY,
      chainId: DEFAULT_CHAIN_ID,
      rpc: DEFAULT_RPC,
      actionIpfsId: MEDIA_DECRYPT_ACTION_CID,
      litBackend: 'chipotle',
      ciphertext: encryptResult.ciphertext,
      hash: encryptResult.dataToEncryptHash,
      kid: contractKid,
    },
  };

  const psshPath = join(outputDir, `pssh-${ELACITY_SYSTEM_ID}.json`);
  writeFileSync(psshPath, JSON.stringify(protectionData));
  return psshPath;
}

// ─── PSSH Box Injection ─────────────────────────────────────────────────────

const ELACITY_SYSTEM_ID_BYTES = Buffer.from([
  0xbf, 0x2c, 0x86, 0xc1, 0xd9, 0xff, 0x4a, 0xb1,
  0xb4, 0xbe, 0x45, 0xae, 0x4d, 0x99, 0xe1, 0xfe,
]);

function buildBinaryPSSHBox(kidHex: string, jsonPayload: string): Buffer {
  const kidBytes = Buffer.from(kidHex, 'hex');
  const dataBytes = Buffer.from(jsonPayload, 'utf-8');

  const contentSize = 16 + 4 + 16 + 4 + dataBytes.length;
  const boxSize = 12 + contentSize;
  const buf = Buffer.alloc(boxSize);
  let off = 0;

  buf.writeUInt32BE(boxSize, off); off += 4;
  buf.write('pssh', off, 4, 'ascii'); off += 4;
  buf.writeUInt8(1, off); off += 1;
  buf.writeUInt8(0, off); off += 1;
  buf.writeUInt16BE(0, off); off += 2;

  ELACITY_SYSTEM_ID_BYTES.copy(buf, off); off += 16;

  buf.writeUInt32BE(1, off); off += 4;
  kidBytes.copy(buf, off, 0, 16); off += 16;

  buf.writeUInt32BE(dataBytes.length, off); off += 4;
  dataBytes.copy(buf, off); off += dataBytes.length;

  return buf;
}

function injectPSSHBox(
  initData: Buffer,
  contractKidHex: string,
  encryptResult: { ciphertext: string; dataToEncryptHash: string },
): Buffer {
  const psshJson = JSON.stringify({
    protocolVersion: '2.0',
    protectionType: 'cenc:lit-aes-gcm-v3',
    variant: 'eth.web3.clearkey',
    ciphersuite: 'e8582013',
    data: {
      authority: DEFAULT_AUTHORITY,
      chainId: DEFAULT_CHAIN_ID,
      rpc: DEFAULT_RPC,
      actionIpfsId: MEDIA_DECRYPT_ACTION_CID,
      litBackend: 'chipotle',
      ciphertext: encryptResult.ciphertext,
      hash: encryptResult.dataToEncryptHash,
      kid: '0x' + contractKidHex,
    },
  });

  const psshBox = buildBinaryPSSHBox(contractKidHex, psshJson);

  let moovOffset = -1;
  let moovSize = 0;
  let pos = 0;
  while (pos + 8 <= initData.length) {
    const size = initData.readUInt32BE(pos);
    const type = initData.toString('ascii', pos + 4, pos + 8);
    if (size < 8) break;
    if (type === 'moov') {
      moovOffset = pos;
      moovSize = size;
      break;
    }
    pos += size;
  }

  if (moovOffset === -1) {
    return Buffer.concat([initData, psshBox]);
  }

  const moovEnd = moovOffset + moovSize;
  const result = Buffer.alloc(initData.length + psshBox.length);
  initData.copy(result, 0, 0, moovEnd);
  psshBox.copy(result, moovEnd);
  if (moovEnd < initData.length) {
    initData.copy(result, moovEnd + psshBox.length, moovEnd);
  }

  const newMoovSize = moovSize + psshBox.length;
  result.writeUInt32BE(newMoovSize, moovOffset);

  return result;
}

// ─── WASM-based DASH Packaging ──────────────────────────────────────────────

export async function packageDASH(
  fragmentedFiles: string[],
  outputDir: string,
  cekHex: string,
  kid: string,
  encryptResult: { ciphertext: string; dataToEncryptHash: string },
): Promise<string> {
  const wasmBinary = await loadCENCEncryptWasm();
  // Phase 2-D-helpers: INTENTIONAL service-internal ambient.
  // This packager is a service-module helper called from the deep media
  // encoding pipeline (services/media/ → pipeline/ → encoder steps).
  // Threading wasmRuntime through every pipeline stage would require
  // modifying 3+ services and is out of scope for Phase 2-D-helpers'
  // route-chain mandate. Audit-permitted as architectural-boundary
  // ambient; future ProposalStore-style extraction would inject the
  // runtime at service construction. See PHASE-2-D-HELPERS-CLEANUP.md
  // §"Intentional service-internal ambient sites".
  const wasmRuntime = getWASMRuntime();
  const dashDir = join(outputDir, 'dash');

  const cekB64 = Buffer.from(cekHex, 'hex').toString('base64');

  const cleanHash = encryptResult.dataToEncryptHash.startsWith('0x')
    ? encryptResult.dataToEncryptHash.slice(2)
    : encryptResult.dataToEncryptHash;
  const contractKidHex = cleanHash.slice(0, 32).padEnd(32, '0');

  logger.info(`[DASHPackager] Splitting fragmented MP4(s) via WASM...`);
  const splitResult = await splitFragmentedMP4WASM(fragmentedFiles[0]);

  const { tracks, initSegment, segments, totalDuration } = splitResult;
  if (tracks.length === 0) throw new Error('No tracks found in fragmented MP4');

  logger.info(`[DASHPackager] Encrypting init segment via WASM (transform_init)...`);
  const initCommand = JSON.stringify({
    cek_b64: cekB64,
    kid_hex: contractKidHex,
    mode: 'transform_init',
  });

  const initResult = await wasmRuntime.executeCENCEncrypt(
    wasmBinary, initCommand, initSegment, { timeoutMs: 30000 }
  );
  if (!initResult.success || !initResult.outputBytes) {
    throw new Error(`WASM init transform failed: ${initResult.error}`);
  }

  const transformedInit = injectPSSHBox(initResult.outputBytes, contractKidHex, encryptResult);
  logger.info(`[DASHPackager] Init segment transformed: ${initSegment.length} → ${transformedInit.length} bytes (${initResult.executionTimeMs}ms)`);

  const encryptedSegments: Map<number, Buffer[]> = new Map();
  let totalEncryptTimeMs = 0;
  let segIdx = 0;

  for (const seg of segments) {
    segIdx++;
    const ivSeedBytes = Buffer.alloc(8);
    ivSeedBytes.writeUInt32BE(segIdx, 4);

    const segCommand = JSON.stringify({
      cek_b64: cekB64,
      kid_hex: contractKidHex,
      mode: 'encrypt_segment',
      iv_seed_b64: ivSeedBytes.toString('base64'),
    });

    const segResult = await wasmRuntime.executeCENCEncrypt(
      wasmBinary, segCommand, seg.data, { timeoutMs: 60000 }
    );
    if (!segResult.success || !segResult.outputBytes) {
      throw new Error(`WASM encrypt failed for segment ${segIdx}: ${segResult.error}`);
    }

    totalEncryptTimeMs += segResult.executionTimeMs;

    if (!encryptedSegments.has(seg.trackId)) {
      encryptedSegments.set(seg.trackId, []);
    }
    encryptedSegments.get(seg.trackId)!.push(segResult.outputBytes);

    if (segIdx % 10 === 0) {
      logger.info(`[DASHPackager] Encrypted ${segIdx}/${segments.length} segments...`);
    }
  }

  logger.info(`[DASHPackager] All ${segments.length} segments encrypted in ${totalEncryptTimeMs}ms (avg ${Math.round(totalEncryptTimeMs / segments.length)}ms/seg)`);

  logger.info(`[DASHPackager] Writing DASH directory structure...`);
  const mpdTracks = buildMPDTracks(tracks, segments);

  for (const track of mpdTracks) {
    const dirType = track.info.type === 'video' ? 'video' : 'audio';
    const trackDir = join(dashDir, dirType, String(track.info.trackId));
    mkdirSync(trackDir, { recursive: true });

    await writeFile(join(trackDir, 'init.mp4'), transformedInit);

    const trackEncSegs = encryptedSegments.get(track.info.trackId) || [];
    for (let i = 0; i < trackEncSegs.length; i++) {
      await writeFile(join(trackDir, `seg-${i + 1}.m4s`), trackEncSegs[i]);
    }
  }

  const mpdXml = generateMPD(mpdTracks, totalDuration);
  await writeFile(join(dashDir, 'stream.mpd'), mpdXml, 'utf-8');

  const psshJson = JSON.stringify({
    protocolVersion: '2.0',
    protectionType: 'cenc:lit-aes-gcm-v3',
    variant: 'eth.web3.clearkey',
    ciphersuite: 'e8582013',
    data: {
      authority: DEFAULT_AUTHORITY,
      chainId: DEFAULT_CHAIN_ID,
      rpc: DEFAULT_RPC,
      actionIpfsId: MEDIA_DECRYPT_ACTION_CID,
      litBackend: 'chipotle',
      ciphertext: encryptResult.ciphertext,
      hash: encryptResult.dataToEncryptHash,
      kid: '0x' + contractKidHex,
    },
  });
  await writeFile(join(dashDir, `pssh-${ELACITY_SYSTEM_ID}.json`), psshJson, 'utf-8');

  logger.info(`[DASHPackager] DASH package created at ${dashDir} (${mpdTracks.length} tracks)`);
  return dashDir;
}

// ─── IPFS Upload ────────────────────────────────────────────────────────────

export async function uploadDashToIPFS(
  dashDir: string,
  ipfs: any,
): Promise<{ cid: string; size: number }> {
  logger.info(`[DASHPackager] Uploading DASH directory to IPFS...`);

  const files: Record<string, Buffer> = {};
  let totalSize = 0;

  const walkDir = (dir: string, basePath: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walkDir(fullPath, relPath);
      } else {
        const content = readFileSync(fullPath);
        files[relPath] = content;
        totalSize += content.length;
      }
    }
  };
  walkDir(dashDir, '');

  if (ipfs?.storeDirectory) {
    const cid = await ipfs.storeDirectory(files, { pin: true });
    logger.info(`[DASHPackager] Uploaded to IPFS via Helia: ${cid} (${(totalSize / 1024 / 1024).toFixed(1)} MB, ${Object.keys(files).length} files)`);
    return { cid, size: totalSize };
  }

  const { execFile: execFileCb } = await import('child_process');
  const { promisify: pfy } = await import('util');
  const execFileAsync = pfy(execFileCb);

  const { stdout } = await execFileAsync('ipfs', [
    'add', '-r', '-Q', '--cid-version', '0', dashDir,
  ], { timeout: 600000 });

  const cid = stdout.trim();
  logger.info(`[DASHPackager] Uploaded to IPFS via CLI: ${cid} (${(totalSize / 1024 / 1024).toFixed(1)} MB)`);
  return { cid, size: totalSize };
}

// ─── Full DASH Pipeline ─────────────────────────────────────────────────────

export async function createEncryptedDASH(
  fragmentedFiles: string[],
  outputDir: string,
  _bento4: any,
  ipfs: any,
): Promise<DashPackageResult> {
  const { cek, kid } = generateCEK();
  const cekHex = cek.toString('hex');

  let encryptResult: EncryptResult;
  try {
    encryptResult = await encryptMediaCEK(cek);
  } finally {
    cek.fill(0);
  }

  const dashDir = await packageDASH(fragmentedFiles, outputDir, cekHex, kid, encryptResult);

  const { cid, size } = await uploadDashToIPFS(dashDir, ipfs);

  return {
    cid,
    mpdUri: `ipfs://${cid}/stream.mpd`,
    kid,
    ciphertext: encryptResult.ciphertext,
    dataToEncryptHash: encryptResult.dataToEncryptHash,
    litBackend: 'chipotle',
    size,
  };
}

// ─── Cleartext Pipeline (free content — upload fragmented MP4 directly) ──────

export async function createCleartextDASH(
  fragmentedFiles: string[],
  _outputDir: string,
  ipfs: any,
): Promise<DashPackageResult & { cleartext: boolean; directPlayback?: boolean }> {
  const fragmentedPath = fragmentedFiles[0];
  const { readFileSync } = await import('fs');
  const fileData = readFileSync(fragmentedPath);
  logger.info(`[DASHPackager] Cleartext: uploading fragmented MP4 directly (${(fileData.length / 1024 / 1024).toFixed(1)} MB)`);

  const contentHash = '0x' + crypto.createHash('sha256').update(fileData).digest('hex');

  const cidStr = await ipfs.storeFile(new Uint8Array(fileData), { pin: true });
  logger.info(`[DASHPackager] Cleartext file uploaded to IPFS: ${cidStr}`);

  return {
    cid: cidStr,
    mpdUri: '',
    kid: '',
    ciphertext: '',
    dataToEncryptHash: contentHash,
    litBackend: 'chipotle',
    size: fileData.length,
    cleartext: true,
    directPlayback: true,
  };
}
