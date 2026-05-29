/**
 * File URL Signer (A16, Wave 6 part 2)
 *
 * Cryptographic sign+verify for the `/file?uid=…&expires=…&signature=…`
 * "capability URL" surface used by `handleFile` and `handleWriteFile`.
 *
 * Why this exists
 * ---------------
 * Before this module the `signature` query param was a string like
 *   sig-uuid-0xWALLET-Desktop-foo.png-1234567890
 * with **no crypto** — just a label. The /file handler ignored it. That
 * meant the only thing standing between an attacker and another user's
 * file was the unpredictability of the filename, and filenames are not
 * secrets (they leak via thumbnails, NFT metadata, share links, etc.).
 *
 * What this module does
 * ---------------------
 * - Signs `(uid, expires)` with HMAC-SHA256 using a server-only key.
 * - Verifies with constant-time compare and TTL enforcement.
 * - Manages a single key on disk (mode 0600), generated on first call.
 *
 * Secure-by-default (security.mdc)
 * --------------------------------
 * Signing is REQUIRED by default: only HMAC-valid + non-expired URLs are
 * served. The launcher ships the node and its web GUI together, and every
 * mint site (backend, filesystem, gateway) signs — and apps can only ever
 * RECEIVE node-signed URLs (they hold no signing key), so they keep working.
 *
 * Operators with genuinely legacy/cached unsigned links can temporarily
 * re-open the rollout-compat path with `FILE_URL_SIGNING_ALLOW_LEGACY=true`
 * (or the historical `FILE_URL_SIGNING_REQUIRED=false`). While legacy is
 * allowed:
 *  - HMAC-shaped signatures still verify normally.
 *  - Anything else is treated as a legacy un-signed URL — served, but
 *    logged as `[file] legacy-unsigned` so operators can confirm zero
 *    legacy traffic before removing the escape hatch.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { dirname, join } from 'path';

/** 32 bytes — same length as a SHA-256 output. */
const KEY_BYTES = 32;
const KEY_FILENAME = '.file-url-signing-key';

/** HMAC signature is base64url(32 bytes) → 43 chars (no padding). */
const SIGNATURE_LENGTH = 43;

/** Default TTL applied at mint sites that don't specify one (24h). */
export const DEFAULT_FILE_URL_TTL_SECONDS = 24 * 60 * 60;

let cachedKey: Buffer | null = null;
let cachedKeyPath: string | null = null;

/**
 * Resolve the on-disk path for the signing key. Mirrors the dataDir
 * resolution used elsewhere (`process.env.PC2_DATA_DIR || cwd/data`).
 */
function resolveKeyPath(): string {
  const dataDir = process.env.PC2_DATA_DIR || join(process.cwd(), 'data');
  return join(dataDir, KEY_FILENAME);
}

/**
 * Read the signing key from disk, generating it on first call. The key
 * file is mode 0600 and lives next to node-config.json. Cached in
 * memory after first load to avoid disk hits on every verify.
 */
export function getFileUrlSigningKey(): Buffer {
  if (cachedKey && cachedKeyPath === resolveKeyPath()) return cachedKey;

  const keyPath = resolveKeyPath();
  const dir = dirname(keyPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (existsSync(keyPath)) {
    const raw = readFileSync(keyPath);
    if (raw.length !== KEY_BYTES) {
      throw new Error(`File URL signing key at ${keyPath} has wrong length (${raw.length} != ${KEY_BYTES})`);
    }
    cachedKey = raw;
  } else {
    const fresh = randomBytes(KEY_BYTES);
    writeFileSync(keyPath, fresh, { mode: 0o600 });
    try { chmodSync(keyPath, 0o600); } catch { /* noop on platforms without chmod */ }
    cachedKey = fresh;
  }
  cachedKeyPath = keyPath;
  return cachedKey;
}

/**
 * For tests only — wipe the in-memory cache so the next call re-reads
 * the key from disk. Not exported as part of the public surface.
 */
export function _resetSigningKeyCacheForTests(): void {
  cachedKey = null;
  cachedKeyPath = null;
}

/**
 * Compute the HMAC-SHA256 over the canonical string `${uid}\n${expires}`
 * and return it as a base64url-encoded 43-char string. Note: the
 * canonical separator is a newline so a uid that contains an `=` or `&`
 * can't be confused with the expires field.
 */
export function mintFileUrlSignature(uid: string, expiresEpochSeconds: number, key: Buffer = getFileUrlSigningKey()): string {
  const canonical = `${uid}\n${expiresEpochSeconds}`;
  return createHmac('sha256', key).update(canonical).digest('base64url');
}

export interface FileUrlVerifyResult {
  ok: boolean;
  /** The reason for rejection (if !ok) or 'verified' / 'legacy' (if ok). */
  reason: 'verified' | 'legacy-unsigned' | 'expired' | 'invalid-signature' | 'missing-fields';
  /**
   * True only when the URL is a pre-A16 ("legacy") URL that we accepted
   * because the kill-switch is OFF. Callers should log these so we can
   * confirm zero legitimate traffic before flipping the switch ON.
   */
  legacy: boolean;
}

/**
 * Whether signed `/file` URLs are mandatory. Secure-by-default: returns
 * `true` unless an operator explicitly opts back into the legacy rollout-
 * compat behaviour via `FILE_URL_SIGNING_ALLOW_LEGACY=true` (or the
 * historical `FILE_URL_SIGNING_REQUIRED=false`). The escape hatch exists
 * only for nodes still serving genuinely old/cached unsigned links.
 */
export function isFileUrlSigningRequired(): boolean {
  const allowLegacy =
    String(process.env.FILE_URL_SIGNING_ALLOW_LEGACY || '').toLowerCase() === 'true' ||
    String(process.env.FILE_URL_SIGNING_REQUIRED || '').toLowerCase() === 'false';
  return !allowLegacy;
}

/**
 * Heuristic: a string is "HMAC-shaped" if it's exactly the right length
 * and consists of base64url chars only. Lets us distinguish new signed
 * URLs from the legacy `sig-…` format during the rollout window.
 */
function looksLikeHmac(sig: string): boolean {
  return sig.length === SIGNATURE_LENGTH && /^[A-Za-z0-9_-]{43}$/.test(sig);
}

/**
 * Verify a `/file?uid=…&expires=…&signature=…` URL.
 *
 * Behaviour:
 *  - Valid HMAC + future expires → `{ ok: true, reason: 'verified' }`.
 *  - Valid HMAC + expired         → `{ ok: false, reason: 'expired' }`.
 *  - Invalid HMAC (right shape)   → `{ ok: false, reason: 'invalid-signature' }`.
 *  - Wrong shape / missing fields:
 *      - kill-switch OFF → `{ ok: true, reason: 'legacy-unsigned', legacy: true }`
 *      - kill-switch ON  → `{ ok: false, reason: 'invalid-signature' | 'missing-fields' }`
 *
 * Callers MUST log `legacy: true` results during the rollout window.
 */
export function verifyFileUrl(uid: string | undefined, expiresParam: string | undefined, signature: string | undefined, key: Buffer = getFileUrlSigningKey()): FileUrlVerifyResult {
  if (!uid) {
    return { ok: false, reason: 'missing-fields', legacy: false };
  }

  const required = isFileUrlSigningRequired();

  if (!expiresParam || !signature) {
    if (required) return { ok: false, reason: 'missing-fields', legacy: false };
    return { ok: true, reason: 'legacy-unsigned', legacy: true };
  }

  const expires = Number(expiresParam);
  if (!Number.isFinite(expires) || expires <= 0) {
    if (required) return { ok: false, reason: 'missing-fields', legacy: false };
    return { ok: true, reason: 'legacy-unsigned', legacy: true };
  }

  if (!looksLikeHmac(signature)) {
    // Pre-A16 `sig-…` shape — legacy.
    if (required) return { ok: false, reason: 'invalid-signature', legacy: false };
    return { ok: true, reason: 'legacy-unsigned', legacy: true };
  }

  // Real HMAC path — check signature first, then TTL. Doing it in this
  // order lets the caller surface 'invalid-signature' (forged URL) vs.
  // 'expired' (URL was real but is past its TTL) for cleaner alerting.
  const expected = mintFileUrlSignature(uid, expires, key);
  let signatureMatches = false;
  try {
    const actualBuf = Buffer.from(signature, 'base64url');
    const expectedBuf = Buffer.from(expected, 'base64url');
    if (actualBuf.length === expectedBuf.length) {
      signatureMatches = timingSafeEqual(actualBuf, expectedBuf);
    }
  } catch {
    signatureMatches = false;
  }

  if (!signatureMatches) {
    return { ok: false, reason: 'invalid-signature', legacy: false };
  }

  const nowEpoch = Math.ceil(Date.now() / 1000);
  if (nowEpoch > expires) {
    return { ok: false, reason: 'expired', legacy: false };
  }

  return { ok: true, reason: 'verified', legacy: false };
}

/**
 * Convenience: build the `expires` value `ttlSeconds` from now.
 */
export function buildExpires(ttlSeconds: number = DEFAULT_FILE_URL_TTL_SECONDS): number {
  return Math.ceil(Date.now() / 1000) + ttlSeconds;
}
