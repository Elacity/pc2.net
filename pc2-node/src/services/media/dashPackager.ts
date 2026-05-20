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

import { Buffer } from 'buffer';
import * as crypto from 'crypto';
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import { encryptWithLitAction, buildSelfRefConditions, type EncryptResult } from '../../api/chipotle-client.js';
import { splitFragmentedMP4WASM, splitInitForTrackWASM } from './mp4split.js';
import { generateMPD, buildMPDTracks } from './mpdGenerator.js';
import { getWASMRuntime } from '../wasm/WASMRuntime.js';
import { resolve as pathResolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ELACITY_SYSTEM_ID = 'bf2c86c1d9ff4ab1b4be45ae4d99e1fe';

import { getDecryptActionCid, getEncryptActionCid } from '../../api/chipotle-client.js';

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
  algorithm: string;
  data: {
    actionIpfsId: string;
    litBackend: string;
    chainId: number;
    authority: string;
    rpc: string;
    kid: string;
    dataToEncryptHash: string;
    ciphertext: string;
    issuer: string;
    signature: string;
    format: string;
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
  // KID must be independent of CEK — random UUID sanitised to 32 hex chars
  const kid = crypto.randomUUID().replace(/-/g, '');
  return { cek, kid };
}

// ─── CEK Encryption via Chipotle ────────────────────────────────────────────

export async function encryptMediaCEK(cek: Buffer, kid: string): Promise<EncryptResult> {
  const conditions = buildSelfRefConditions(getEncryptActionCid());

  const MAX_RETRIES = 5;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await encryptWithLitAction({
        dataToEncrypt: cek,
        kid: Buffer.from(kid, 'hex').toString('base64'),
        authority: DEFAULT_AUTHORITY,
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

function buildProtectionData(kid: string, encryptResult: EncryptResult): PSSHProtectionData {
  return {
    protocolVersion: '3.0',
    protectionType: 'cenc:lit-aes-gcm-v3',
    variant: 'eth.web3.clearkey',
    algorithm: 'AES-128-CBC',
    data: {
      actionIpfsId: getDecryptActionCid(),
      litBackend: 'chipotle',
      chainId: DEFAULT_CHAIN_ID,
      authority: DEFAULT_AUTHORITY,
      rpc: DEFAULT_RPC,
      kid: kid.startsWith('0x') ? kid : `0x${kid}`,
      dataToEncryptHash: encryptResult.dataToEncryptHash,
      ciphertext: encryptResult.ciphertext,
      issuer: encryptResult.issuer || '',
      signature: encryptResult.signature || '',
      format: 'hex',
    },
  };
}

export function buildPSSHJson(outputDir: string, kid: string, encryptResult: EncryptResult): string {
  const protectionData = buildProtectionData(kid, encryptResult);
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

/**
 * Splice a pre-built pssh box into an init segment as the LAST child of
 * `moov` (after every `trak`). This matches bento4 / mp4encrypt's layout
 * (`Ap4CommonEncryption.cpp` ~L1554-1578) and is the canonical CENC slot.
 *
 * Why end-of-moov (not post-mvhd, not root-sibling):
 *   - libav `mov_read_pssh()` attaches `AVEncryptionInitInfo` to the
 *     last-registered `AVStream` at parse time. Placement before `trak`
 *     means no stream exists yet → side-data silently dropped.
 *   - Chromium MSE rejects init segments with an unexpected `pssh` at the
 *     file root (`CHUNK_DEMUXER_ERROR_APPEND_FAILED: Invalid top-level
 *     ISO BMFF box type pssh`). A root-level pssh sibling was tried earlier
 *     as belt-and-braces for non-ffmpeg parsers — it breaks dash.js /
 *     browser EME and is non-standard. Removed.
 *
 * See .cursor/tasks/MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.
 */
export function splicePSSHIntoInit (initData: Buffer, psshBox: Buffer): Buffer {
  let moovOffset = -1;
  let moovSize = 0;
  let pos = 0;
  while ( pos + 8 <= initData.length ) {
    const size = initData.readUInt32BE(pos);
    const type = initData.toString('ascii', pos + 4, pos + 8);
    if ( size < 8 ) break;
    if ( type === 'moov' ) {
      moovOffset = pos;
      moovSize = size;
      break;
    }
    pos += size;
  }

  if ( moovOffset === -1 ) {
    return Buffer.concat([initData, psshBox]);
  }

  const moovEnd = moovOffset + moovSize;
  const out = Buffer.alloc(initData.length + psshBox.length);
  initData.copy(out, 0, 0, moovEnd);
  psshBox.copy(out, moovEnd);
  if ( moovEnd < initData.length ) {
    initData.copy(out, moovEnd + psshBox.length, moovEnd);
  }

  // Grow moov's declared size by exactly one pssh (the in-moov copy).
  const newMoovSize = moovSize + psshBox.length;
  out.writeUInt32BE(newMoovSize, moovOffset);

  return out;
}

/**
 * Locate the first `pssh` box in an init segment (top-level scan first, then
 * walk inside `moov`). Returns null if absent. Used by the `/segment` init
 * delivery path to recover the box bytes that `stripInitViaWASM()` is about
 * to remove, so they can be re-spliced into the cleaned output.
 */
export function extractFirstPSSHBox (initData: Buffer): Buffer | null {
  let pos = 0;
  let moovOffset = -1;
  let moovSize = 0;
  while ( pos + 8 <= initData.length ) {
    const size = initData.readUInt32BE(pos);
    const type = initData.toString('ascii', pos + 4, pos + 8);
    if ( size < 8 ) break;
    if ( type === 'pssh' ) {
      return Buffer.from(initData.subarray(pos, pos + size));
    }
    if ( type === 'moov' ) {
      moovOffset = pos;
      moovSize = size;
    }
    pos += size;
  }

  if ( moovOffset === -1 ) return null;
  const moovEnd = moovOffset + moovSize;
  let inner = moovOffset + 8;
  while ( inner + 8 <= moovEnd ) {
    const csize = initData.readUInt32BE(inner);
    const ctype = initData.toString('ascii', inner + 4, inner + 8);
    if ( csize < 8 || inner + csize > moovEnd ) break;
    if ( ctype === 'pssh' ) {
      return Buffer.from(initData.subarray(inner, inner + csize));
    }
    inner += csize;
  }
  return null;
}

// ─── WASM-based DASH Packaging ──────────────────────────────────────────────

export async function packageDASH(
  fragmentedFiles: string[],
  outputDir: string,
  cekHex: string,
  kid: string,
  encryptResult: EncryptResult,
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

  // Use the independently generated KID for CENC encryption (padded to 32 hex chars)
  const contractKidHex = kid.padEnd(32, '0');

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

  // Multi-track init with sinf/tenc, NO pssh yet — pssh is spliced per-track
  // below so each per-Representation init.mp4 ends up with its own pssh box
  // attached to its single stream. See MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.
  const multiTrackTransformedInit = Buffer.from(initResult.outputBytes);

  // Build the pssh box bytes once; reused byte-identically across every
  // per-track init splice so libav extraction yields the same payload
  // regardless of which track's init the player reads.
  const protectionData = buildProtectionData(kid, encryptResult);
  const psshBox = buildBinaryPSSHBox(contractKidHex, JSON.stringify(protectionData));

  logger.info(`[DASHPackager] Init segment transformed: ${initSegment.length} → ${multiTrackTransformedInit.length} bytes (${initResult.executionTimeMs}ms; pssh ${psshBox.length}B will be spliced per-track)`);

  const encryptedSegments: Map<number, Buffer[]> = new Map();
  let totalEncryptTimeMs = 0;
  let segIdx = 0;

  // Map trackId → track type so per-segment encryption picks the right
  // clear-leader (codec frame headers MUST stay readable pre-decryption).
  const trackTypeById = new Map<number, 'video' | 'audio'>();
  for ( const t of tracks ) trackTypeById.set(t.trackId, t.type);

  // Clear-leader bytes per codec.
  //
  // Video (AV1): 32 B kept clear so libav can parse OBU headers + leb128
  // size + start of uncompressed_header before hitting encrypted payload.
  // Without this, dav1d errors with "obu_forbidden_bit out of range".
  //
  // Audio (AAC): 0 B — full-sample CTR encryption matching bento4
  // (`Ap4CommonEncryption.cpp` has no AAC subsample mapper). The cenc-encrypt
  // Rust side emits senc with NO subsample table (flag=0) when clear leader
  // is zero, exactly matching bento4 wire format. Subsample encryption for
  // raw AAC mp4a samples isn't broadly supported by decryption stacks — our
  // first attempt with clear_leader=16 caused MSE to blacklist every audio
  // segment and made the libav C-player reject decrypted AAC packets.
  //
  // See MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE for full analysis.
  const CLEAR_LEADER_VIDEO = 32;
  const CLEAR_LEADER_AUDIO = 0;

  // Global running sample counter across every segment (and every track) so
  // each sample gets a strictly increasing IV seed. The WASM derives per-sample
  // IV = (seed + sample_index_within_segment) as BE u64, matching bento4's
  // random-base+counter scheme. Bumping by seg.sampleCount before the next
  // segment guarantees no IV collision under the same CEK — required for
  // AES-CTR's {KID, IV} uniqueness per ISO/IEC 23001-7 §9.4.1.
  let globalSampleCounter = 0n;

  for (const seg of segments) {
    segIdx++;
    const ivSeedBytes = Buffer.alloc(8);
    ivSeedBytes.writeBigUInt64BE(globalSampleCounter);

    const trackType = trackTypeById.get(seg.trackId) || 'video';
    const clearLeader = trackType === 'audio' ? CLEAR_LEADER_AUDIO : CLEAR_LEADER_VIDEO;

    const segCommand = JSON.stringify({
      cek_b64: cekB64,
      kid_hex: contractKidHex,
      mode: 'encrypt_segment',
      iv_seed_b64: ivSeedBytes.toString('base64'),
      clear_leader: clearLeader,
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

    globalSampleCounter += BigInt(seg.sampleCount || 0);

    if ( segIdx % 10 === 0 ) {
      logger.info(`[DASHPackager] Encrypted ${segIdx}/${segments.length} segments...`);
    }
  }

  logger.info(`[DASHPackager] All ${segments.length} segments encrypted in ${totalEncryptTimeMs}ms (avg ${Math.round(totalEncryptTimeMs / segments.length)}ms/seg)`);

  logger.info(`[DASHPackager] Writing DASH directory structure...`);
  const mpdTracks = buildMPDTracks(tracks, segments);

  for (const track of mpdTracks) {
    const trackDir = join(dashDir, track.repId);
    mkdirSync(trackDir, { recursive: true });

    // Per-Representation init: reduce the multi-track transformed init down
    // to this track's trak only (mvex's trex filtered to the same), then
    // splice the shared pssh box bytes. Result: each init.mp4 declares one
    // AVStream and carries its own copy of the pssh — DASH demuxers see
    // exactly one stream per Representation, no ghosts.
    const singleTrackInit = await splitInitForTrackWASM(multiTrackTransformedInit, track.info.type);
    const trackInit = splicePSSHIntoInit(singleTrackInit, psshBox);
    await writeFile(join(trackDir, 'init.mp4'), trackInit);

    const trackEncSegs = encryptedSegments.get(track.info.trackId) || [];
    for ( let i = 0; i < trackEncSegs.length; i++ ) {
      await writeFile(join(trackDir, `seg-${i + 1}.m4s`), trackEncSegs[i]);
    }
  }

  const mpdXml = generateMPD(mpdTracks, totalDuration);
  await writeFile(join(dashDir, 'stream.mpd'), mpdXml, 'utf-8');

  await writeFile(join(dashDir, `pssh-${ELACITY_SYSTEM_ID}.json`), JSON.stringify(protectionData), 'utf-8');

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
    encryptResult = await encryptMediaCEK(cek, kid);
  } finally {
    cek.fill(0);
  }

  const dashDir = await packageDASH(fragmentedFiles, outputDir, cekHex, kid, encryptResult);

  const { cid, size } = await uploadDashToIPFS(dashDir, ipfs);

  return {
    cid,
    mpdUri: `ipfs://${cid}/stream.mpd`,
    kid,
    ...encryptResult,
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
