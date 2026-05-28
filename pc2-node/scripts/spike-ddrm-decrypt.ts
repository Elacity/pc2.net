/**
 * Phase 1 spike — confirm `WasmDdrmDecryptRuntime` instantiates the binary once
 * and reuses the instance across multiple calls (state persists in WASM linear
 * memory). Verifies:
 *   - Lazy load + sha256 pin against capsule.json
 *   - session_create produces unique handles + sessionIds
 *   - session_lookup round-trips after multiple creates
 *   - session_sign returns a verifiable DER signature
 *   - Concurrent calls are serialized correctly (no handle collisions)
 *   - Diagnostic counters match expected state
 *
 * Run with:
 *   npx tsx pc2-node/scripts/spike-ddrm-decrypt.ts
 */
import { WasmDdrmDecryptRuntime } from '../src/services/wasm/WasmDdrmDecryptRuntime.js';

async function main() {
  const rt = WasmDdrmDecryptRuntime.get();

  console.log('[spike] loading WASM…');
  await rt.ensureLoaded();
  console.log('[spike] loaded OK');

  // Single create
  const s1 = await rt.sessionCreate();
  console.log(`[spike] session1: handle=${s1.handle} id=${s1.sessionId} pk[0]=0x${s1.publicKey[0].toString(16)} pkLen=${s1.publicKey.length}`);
  if (s1.handle <= 0) throw new Error('expected positive handle');
  if (s1.sessionId.length !== 36) throw new Error(`sessionId length expected 36, got ${s1.sessionId.length}`);
  if (s1.publicKey.length !== 33) throw new Error(`publicKey length expected 33, got ${s1.publicKey.length}`);
  if (s1.publicKey[0] !== 0x02 && s1.publicKey[0] !== 0x03) throw new Error('compressed prefix expected 0x02/0x03');

  // Second create — must produce a different sessionId (state persists; ids are not regenerated against the same RNG seed)
  const s2 = await rt.sessionCreate();
  console.log(`[spike] session2: id=${s2.sessionId}`);
  if (s2.sessionId === s1.sessionId) throw new Error('second sessionId duplicated the first — state did not persist?');
  if (s2.handle === s1.handle) throw new Error('second handle duplicated the first');

  // Lookup
  const found = await rt.sessionLookup(s1.sessionId);
  if (found !== s1.handle) throw new Error(`lookup expected ${s1.handle}, got ${found}`);
  const notFound = await rt.sessionLookup('00000000-0000-0000-0000-000000000000');
  if (notFound !== null) throw new Error(`unknown id should return null, got ${notFound}`);
  console.log('[spike] lookup round-trip OK');

  // Sign + verify with WebCrypto using the returned compressed pubkey.
  // WASM returns raw IEEE P1363 signatures (r || s, 64 bytes) — same shape
  // as WebCrypto's subtle.sign and what the Lit Action verifier expects.
  const payload = new TextEncoder().encode('hello pc2 wasm');
  const sigRaw = await rt.sessionSign(s1.handle, payload);
  console.log(`[spike] raw IEEE sig len=${sigRaw.length}`);
  if (sigRaw.length !== 64) throw new Error(`unexpected sig length: ${sigRaw.length} (expected 64 for P-256 raw IEEE)`);

  const pkUncompressed = decompressP256(s1.publicKey);
  const pubKey = await globalThis.crypto.subtle.importKey(
    'raw',
    pkUncompressed.buffer.slice(pkUncompressed.byteOffset, pkUncompressed.byteOffset + pkUncompressed.byteLength) as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const sigBuf = new Uint8Array(sigRaw).buffer as ArrayBuffer;
  const payloadBuf = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer;
  const verified = await globalThis.crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    pubKey,
    sigBuf,
    payloadBuf,
  );
  if (!verified) throw new Error('signature failed verification');
  console.log('[spike] sign + verify OK');

  // Concurrency: 8 parallel creates must all succeed with unique handles
  const burst = await Promise.all(Array.from({ length: 8 }, () => rt.sessionCreate()));
  const ids = new Set(burst.map((s) => s.sessionId));
  if (ids.size !== 8) throw new Error(`concurrent creates dropped a session: ${ids.size}/8 unique`);
  console.log('[spike] concurrent creates OK');

  // Diagnostics
  const beforeDrop = await rt.sessionCount();
  console.log(`[spike] live session count = ${beforeDrop}`);
  await rt.sessionDrop(s1.handle);
  await rt.sessionDrop(s2.handle);
  for (const s of burst) await rt.sessionDrop(s.handle);
  const afterDrop = await rt.sessionCount();
  console.log(`[spike] live session count after drop = ${afterDrop}`);
  if (afterDrop !== beforeDrop - (2 + burst.length)) {
    throw new Error(`session_drop did not free entries: before=${beforeDrop} after=${afterDrop}`);
  }

  console.log('\n[spike] all checks passed.');
}

// ── Helpers ────────────────────────────────────────────────────────────

function decompressP256(compressed: Uint8Array): Uint8Array {
  if (compressed.length !== 33) throw new Error('expected 33-byte compressed point');
  const p = BigInt('0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF');
  const b = BigInt('0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B');
  const a = p - 3n;
  let x = 0n;
  for (let i = 1; i < 33; i++) x = (x << 8n) | BigInt(compressed[i]);
  const rhs = (modPow(x, 3n, p) + a * x + b) % p;
  let y = modSqrt(rhs, p);
  const isOdd = (y & 1n) === 1n;
  if ((compressed[0] === 0x03) !== isOdd) y = p - y;
  const out = new Uint8Array(65);
  out[0] = 0x04;
  putBig(out, 1, x);
  putBig(out, 33, y);
  return out;
}

function putBig(out: Uint8Array, off: number, n: bigint) {
  const hex = n.toString(16).padStart(64, '0');
  for (let i = 0; i < 32; i++) out[off + i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let r = 1n; base = base % mod;
  while (exp > 0n) { if (exp & 1n) r = (r * base) % mod; exp >>= 1n; base = (base * base) % mod; }
  return r;
}

function modSqrt(n: bigint, p: bigint): bigint {
  // p = 3 mod 4 shortcut (P-256's prime satisfies this)
  return modPow(n, (p + 1n) / 4n, p);
}

// Kept for reference — WASM now returns raw IEEE directly, but this helper
// documents how to convert DER → r||s if a future change needs it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function derSignatureToRaw(der: Uint8Array): Uint8Array {
  // DER: 0x30 len 0x02 rLen r 0x02 sLen s
  if (der[0] !== 0x30) throw new Error('not DER');
  let off = 2;
  if (der[off] !== 0x02) throw new Error('expected INTEGER r');
  const rLen = der[off + 1];
  let r = der.subarray(off + 2, off + 2 + rLen);
  off += 2 + rLen;
  if (der[off] !== 0x02) throw new Error('expected INTEGER s');
  const sLen = der[off + 1];
  let s = der.subarray(off + 2, off + 2 + sLen);
  // Strip a leading zero byte from r/s (DER pads to keep sign bit), pad to 32
  if (r.length > 32) r = r.subarray(r.length - 32);
  if (s.length > 32) s = s.subarray(s.length - 32);
  const out = new Uint8Array(64);
  out.set(r, 32 - r.length);
  out.set(s, 64 - s.length);
  return out;
}

main().catch((err) => {
  console.error('[spike] FAILED:', err);
  process.exit(1);
});
