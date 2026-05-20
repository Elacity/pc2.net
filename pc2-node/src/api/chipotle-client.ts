/**
 * chipotle-client.ts — Minimal REST client for Lit Protocol Chipotle (v3)
 *
 * Replaces the entire Lit SDK (@lit-protocol/*) with a single HTTP call.
 * No SIWE, no session sigs, no capacity credits, no WebSocket connections.
 *
 * Execution is routed through an Elacity-hosted proxy that holds the
 * X-Api-Key server-side — the client never handles the key.
 *
 * Config resolution is now two-source only:
 *   - data/.chipotle-provision.json (signed envelope from supernode)
 *   - in-code constants (hardcoded fallbacks below)
 *
 * The supernode-served `usageKey` is no longer persisted to disk.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { createPublicKey, randomBytes, verify as cryptoVerify } from 'crypto';
import { createLogger } from '../utils/logger.js';
import { getBaseRpcUrl } from '../utils/rpc.js';
import { recordMetricCounter, recordMetricHistogram } from '../utils/metrics.js';

const logger = createLogger('chipotle');

/**
 * Map a thrown error from a Lit Action call to a low-cardinality reason
 * tag suitable for metric labelling. Anything not on the allow-list
 * collapses to "other" so the tag value space stays bounded — this is a
 * privacy + cardinality concern (uncapped error strings would let raw
 * KIDs / addresses leak into telemetry tags).
 */
function classifyChipotleError(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  if (msg.includes('lit action denied')) return 'action_denied';
  if (msg.includes('invalid cek')) return 'bad_cek';
  if (msg.includes('rate') && msg.includes('limit')) return 'rate_limited';
  if (msg.includes('timeout') || msg.includes('etimedout')) return 'timeout';
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('econnrefused')) return 'network';
  if (msg.includes('unauthorized') || msg.includes('401')) return 'unauthorized';
  if (msg.includes('forbidden') || msg.includes('403')) return 'forbidden';
  if (msg.includes('500') || msg.includes('502') || msg.includes('503')) return 'server_error';
  return 'other';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '../../data');

// ── File Paths ───────────────────────────────────────────────────────────────

const PROVISION_CACHE_PATH = join(DATA_DIR, '.chipotle-provision.json');

// ── Constants ────────────────────────────────────────────────────────────────

// Allowlist values for `apiUrl` in supernode-served provision blobs. The
// field is validated for defense-in-depth even though execution always
// routes through LIT_ACTION_PROXY_URL below.
const DEFAULT_API_URL = 'https://api.chipotle.litprotocol.com';
const DEV_API_URL = 'https://api.dev.litprotocol.com';

// Lit action execution is routed through an Elacity-hosted proxy that holds
// the X-Api-Key server-side. The proxy forwards to the Lit API verbatim, so
// callers append the same `/core/v1/...` path.
const LIT_ACTION_PROXY_URL = 'https://europe-west1-elacity.cloudfunctions.net/chipotle-proxy';

// Universal Lit Action CIDs — V3 unified encrypt/decrypt
export const UNIVERSAL_ENCRYPT_CID = 'QmVEz3dDnQD1n96gMd2mFZWXdEDsRiPMumx86qMzhT35gY';
export const UNIVERSAL_DECRYPT_CID = 'QmPBjQD7V4aFTZPxUwZ9gDPFJtcJ4SvsJdTh3QexTyRBbj';

const DEFAULT_AUTHORITY = '0x09dBe796f40ECEffEAccf243c3d758C4c1d8D87D';
const DEFAULT_CHAIN = 'base';
const DEFAULT_CHAIN_ID = 8453;
const DEFAULT_PKP_ID = '0x68dcf3dc3c38d726e8a7cdca8ab318f49552c05d';

// CIDs that have been live in supernode-served provision blobs at some point
// but are NOT production-active in Chipotle's group-1 allowlist. Any one of
// these surfacing in a cached `data/.chipotle-provision.json` would make
// `getActionCid()` hand back a CID that produces `access_denied` on every
// asset (the v1.2.1 → v1.2.2 footgun). We hard-reject them at Tier 3 so a
// stale cache or a slow supernode rotation can never re-trigger it.
//
// CHIPOTLE-REJECT-KNOWN-BAD-CID — see docs/handover/HANDOVER_2026-05-03_V1272_FRESH_MAC_HOTPATCH.md
const KNOWN_BAD_NON_MEDIA_DECRYPT_CIDS = new Set<string>([
  'QmX5JxcFhyasptCWMA6unFPm3TRYjPSkJb5HhN8289r5uk',
]);

const SUPERNODE_PROVISION_URLS = [
  'https://69.164.241.210/api/ddrm/provision',
  'https://38.242.211.112/api/ddrm/provision',
];

// ── Wave 8 (H-01.2) provision signing ────────────────────────────────────────
// Supernodes serve dDRM provision config to fresh PC2 nodes. Without a
// signature, a supernode operator (or anyone who compromises one) can inject
// arbitrary config — malicious `apiUrl`, wrong PKP, attacker-controlled RPC.
// Wave 8 adds a detached Ed25519 signature over a canonical envelope; only
// blobs signed by Elacity Labs' provision key are accepted.
//
// The corresponding 32-byte Ed25519 seed lives on each supernode at
// /etc/pc2/elacity-provision.ed25519 (mode 0600, root-only). The public key
// below is derived from that seed and pinned here; rotating the key means
// updating this constant + redeploying both supernodes.
const ELACITY_LABS_PROVISION_PUBKEY_HEX =
  '1ab060ba7578261355504300c1193c484ed8a46a30499c3fa3cb9065930367eb';

const PROVISION_SIG_REQUIRED = process.env.PROVISION_SIG_REQUIRED !== '0';

const ALLOWED_PROVISION_API_URLS = new Set([
  DEFAULT_API_URL,
  DEV_API_URL,
]);

const PROVISION_ENVELOPE_DOMAIN = 'elacity.pc2.chipotle-provision.v1';
const PROVISION_MAX_AGE_SECONDS = 90 * 24 * 3600; // 90 days

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChipotleConfig {
  pkpId?: string;
}

export interface LitActionParams {
  code: string;
  /**
   * Optional IPFS CID of the Lit Action. When present, executeLitAction
   * first attempts to invoke the action by CID reference (server-cached),
   * and falls back to sending the full `code` only if Chipotle returns a
   * "No cached code found" error. Saves bandwidth on hot actions.
   */
  ipfsId?: string;
  jsParams: Record<string, unknown>;
}

export interface LitActionResult {
  response: string;
  logs: string;
  hasError: boolean;
}

/**
 * Session-key delegation bundle (Option C  see
 * `.cursor/tasks/LIT-ACTION-SIGNATURE-AUTH/DESIGN.md` §2.7).
 *
 * When present, both halves are forwarded to the Lit Action as
 * canonical JSON strings exactly as the owner signed them. The
 * new verifying Lit Action uses these; the legacy action ignores them.
 */
export interface SecureViewSessionBundle {
  delegationCanonical: string;
  delegationSig: `0x${string}`;
  requestCanonical: string;
  requestSig: `0x${string}`;
}

export interface MediaDecryptParams {
  litCiphertext: string;
  dataToEncryptHash: string;
  kid: string;
  buyerAddress: string;
  actionCid: string;
  publicKeyHex: string;
  authority?: string;
  chain?: string;
  chainId?: number;
  rpc?: string;
  secureViewSession?: SecureViewSessionBundle;
}

export interface EncryptParams {
  dataToEncrypt: Uint8Array;
  kid?: string;
  authority?: string;
  accessControlConditions: Record<string, unknown>[];
}

export interface EncryptResult {
  ciphertext: string;
  dataToEncryptHash: string;
  issuer?: string;
  signature?: string;
}

// ── Auto-Provisioning from Supernode ─────────────────────────────────────────

interface ProvisionConfig {
  version: number;
  network: string;
  apiUrl: string;
  // usageKey is intentionally NOT part of the persisted shape — the proxy
  // holds it server-side. Supernodes may still include it in the signed
  // envelope (legacy), in which case it's stripped before write.
  pkpId: string;
  authority: string;
  chain: string;
  chainId: number;
  rpc: string;
  actions: {
    encrypt: string;
    decrypt: string;
  };
}

/**
 * Signed-envelope shape returned by Wave 8+ supernodes. The signature is
 * detached and covers `canonicalize({v, domain, signedAt, payload})` — i.e.
 * every field except `sig` itself, in canonical-JSON byte order. Supernodes
 * generate this envelope by signing with Elacity Labs' Ed25519 private key.
 */
interface SignedProvisionEnvelope {
  v: 1;
  domain: typeof PROVISION_ENVELOPE_DOMAIN;
  signedAt: number;
  payload: ProvisionConfig;
  sig: string;
}

/**
 * Canonical-JSON serialiser. Keys sorted ASCII-ascending at every object
 * level, arrays preserved positionally, no whitespace. Must match the
 * signer's canonical form byte-for-byte.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalize(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

function isPlaceholderPubKey(hex: string): boolean {
  return /^0{64}$/.test(hex);
}

/**
 * Verify an Ed25519 signature over the canonical bytes of an envelope.
 * Uses Node's native crypto.verify — 64-byte signature, 32-byte SEC1 raw
 * public key wrapped in the Ed25519 SPKI DER prefix.
 */
function verifyProvisionSignature(envelope: SignedProvisionEnvelope): boolean {
  if (isPlaceholderPubKey(ELACITY_LABS_PROVISION_PUBKEY_HEX)) {
    logger.warn('[Chipotle] Provision pubkey is still the all-zeros sentinel; signature check cannot pass.');
    return false;
  }
  if (typeof envelope.sig !== 'string' || envelope.sig.length === 0) return false;

  const pubKeyBytes = Buffer.from(ELACITY_LABS_PROVISION_PUBKEY_HEX, 'hex');
  if (pubKeyBytes.length !== 32) return false;

  const spkiDer = Buffer.concat([ED25519_SPKI_PREFIX, pubKeyBytes]);
  const pubKey = createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });

  // Sign over the canonical bytes of the envelope minus the sig field.
  const { sig: _sig, ...signed } = envelope;
  const message = Buffer.from(canonicalize(signed), 'utf8');
  const sigBytes = Buffer.from(envelope.sig, 'base64');
  if (sigBytes.length !== 64) return false;

  try {
    return cryptoVerify(null, message, pubKey, sigBytes);
  } catch {
    return false;
  }
}

/**
 * Validate a ProvisionConfig payload for field-level sanity. Even with a
 * verified signature, we want structural guards in case a future key compromise
 * lets an attacker mint valid signatures.
 */
function validateProvisionPayload(p: ProvisionConfig): { ok: true } | { ok: false; reason: string } {
  if (!p || typeof p !== 'object') return { ok: false, reason: 'payload_not_object' };
  if (typeof p.apiUrl !== 'string' || !ALLOWED_PROVISION_API_URLS.has(p.apiUrl)) {
    return { ok: false, reason: `apiUrl_not_allowlisted:${p.apiUrl}` };
  }
  if (typeof p.pkpId !== 'string' || !p.pkpId.startsWith('0x')) {
    return { ok: false, reason: 'pkpId_invalid' };
  }
  if (typeof p.authority !== 'string' || !p.authority.startsWith('0x')) {
    return { ok: false, reason: 'authority_invalid' };
  }
  return { ok: true };
}

let cachedProvision: ProvisionConfig | null = null;

function loadCachedProvision(): ProvisionConfig | null {
  if (cachedProvision) return cachedProvision;

  if (existsSync(PROVISION_CACHE_PATH)) {
    try {
      const raw = readFileSync(PROVISION_CACHE_PATH, 'utf8').trim();
      if (raw) {
        cachedProvision = JSON.parse(raw);
        return cachedProvision;
      }
    } catch {
      // Corrupted cache — will re-provision
    }
  }
  return null;
}

function httpsGet(url: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false, timeout: timeoutMs }, (res) => {
      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/**
 * Extract a validated ProvisionConfig from a supernode response body.
 *
 * Wave 8 (H-01.2): only accept the signed-envelope form by default. In
 * emergency bootstrap scenarios (PROVISION_SIG_REQUIRED=0) we fall back
 * to accepting a bare ProvisionConfig with a loud warning — this exists
 * purely so a fresh fleet can bootstrap before Elacity Labs' key ceremony
 * completes and should never be used in steady state.
 */
function parseProvisionResponse(
  sourceUrl: string,
  body: string,
): { ok: true; config: ProvisionConfig } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, reason: 'body_not_json' };
  }

  const looksLikeEnvelope = (
    parsed !== null &&
    typeof parsed === 'object' &&
    'sig' in (parsed as Record<string, unknown>) &&
    'payload' in (parsed as Record<string, unknown>)
  );

  if (looksLikeEnvelope) {
    const envelope = parsed as SignedProvisionEnvelope;

    if (envelope.v !== 1 || envelope.domain !== PROVISION_ENVELOPE_DOMAIN) {
      return { ok: false, reason: 'envelope_bad_domain_or_version' };
    }
    if (typeof envelope.signedAt !== 'number') {
      return { ok: false, reason: 'envelope_bad_signedAt' };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - envelope.signedAt) > PROVISION_MAX_AGE_SECONDS) {
      return { ok: false, reason: `envelope_stale_or_future:${nowSec - envelope.signedAt}s` };
    }
    if (!verifyProvisionSignature(envelope)) {
      return { ok: false, reason: 'provision_sig_invalid' };
    }
    const valid = validateProvisionPayload(envelope.payload);
    if (!valid.ok) return { ok: false, reason: valid.reason };

    logger.info(`[Chipotle] Signed provision accepted from ${sourceUrl} (signedAt=${envelope.signedAt})`);
    return { ok: true, config: envelope.payload };
  }

  // Unsigned legacy path — only tolerated if strict-mode is explicitly off.
  if (PROVISION_SIG_REQUIRED) {
    return { ok: false, reason: 'unsigned_provision_rejected' };
  }

  const config = parsed as ProvisionConfig;
  const valid = validateProvisionPayload(config);
  if (!valid.ok) return { ok: false, reason: valid.reason };

  logger.warn(`[Chipotle] Accepted UNSIGNED provision from ${sourceUrl} — PROVISION_SIG_REQUIRED=0. This is an emergency bootstrap mode; set PROVISION_SIG_REQUIRED=1 in steady state.`);
  return { ok: true, config };
}

async function fetchProvisionFromSupernode(): Promise<ProvisionConfig | null> {
  for (const url of SUPERNODE_PROVISION_URLS) {
    try {
      logger.info(`[Chipotle] Fetching dDRM config from ${url}...`);
      const body = await httpsGet(url);

      const result = parseProvisionResponse(url, body);
      if (!result.ok) {
        logger.warn(`[Chipotle] Supernode ${url} rejected: ${result.reason}`);
        continue;
      }
      // Strip usageKey before persisting — proxy holds the API key
      // server-side; PC2 never needs it on disk.
      const { usageKey: _unused, ...persistable } = result.config as ProvisionConfig & { usageKey?: string };
      const config = persistable as ProvisionConfig;

      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(PROVISION_CACHE_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });

      cachedProvision = config;
      logger.info(`[Chipotle] Auto-provisioned from supernode (network: ${config.network}, pkpId: ${config.pkpId.substring(0, 10)}...)`);
      return config;
    } catch (err: any) {
      logger.warn(`[Chipotle] Failed to fetch from ${url}: ${err.message}`);
    }
  }
  return null;
}

let provisionPromise: Promise<ProvisionConfig | null> | null = null;

async function ensureProvisioned(): Promise<ProvisionConfig | null> {
  const cached = loadCachedProvision();
  if (cached) return cached;

  if (!provisionPromise) {
    provisionPromise = fetchProvisionFromSupernode().finally(() => {
      provisionPromise = null;
    });
  }
  return provisionPromise;
}

// ── PKP Resolution ───────────────────────────────────────────────────────────

function resolvePkpId(config?: ChipotleConfig): string {
  if (config?.pkpId) return config.pkpId;
  const provision = loadCachedProvision();
  if (provision?.pkpId) return provision.pkpId;
  return DEFAULT_PKP_ID;
}

// ── Lit Action Code Loading ──────────────────────────────────────────────────

let cachedNonMediaCode: string | null = null;
let cachedChipotleNonMediaCode: string | null = null;
let cachedChipotleEncryptCode: string | null = null;
let cachedUniversalEncryptCode: string | null = null;

function getNonMediaActionCode(): string {
  if (cachedNonMediaCode) return cachedNonMediaCode;

  const actionPath = join(DATA_DIR, 'lit-actions/non-media-decrypt.js');
  if (!existsSync(actionPath)) {
    throw new Error(
      `Non-media Lit Action not found at ${actionPath}. ` +
      'Deploy it first via POST /api/storage/lit/deploy-action.',
    );
  }
  cachedNonMediaCode = readFileSync(actionPath, 'utf8');
  return cachedNonMediaCode;
}

/**
 * Load the non-media Chipotle Lit Action source. Callers must supply a
 * signed SecureViewDelegation + request bundle; the action verifies both
 * before releasing a CEK. See
 * `.cursor/tasks/LIT-ACTION-SIGNATURE-AUTH/DESIGN.md` for the attack the
 * sigauth verification closes (V1.1 → V1.2 cutover).
 */
function getChipotleNonMediaActionCode(): string {
  if (cachedChipotleNonMediaCode) return cachedChipotleNonMediaCode;
  const actionPath = join(DATA_DIR, 'lit-actions/non-media-decrypt-chipotle.js');
  if (!existsSync(actionPath)) {
    throw new Error(
      `Chipotle non-media Lit Action not found at ${actionPath}.`,
    );
  }
  // See getNonMediaActionCode() for why trailing whitespace is stripped.
  cachedChipotleNonMediaCode = readFileSync(actionPath, 'utf8').replace(/\s+$/, '');
  return cachedChipotleNonMediaCode;
}

function getChipotleEncryptCode(): string {
  if (cachedChipotleEncryptCode) return cachedChipotleEncryptCode;

  const actionPath = join(DATA_DIR, 'lit-actions/non-media-encrypt-chipotle.js');
  if (!existsSync(actionPath)) {
    throw new Error(
      `Chipotle encrypt Lit Action not found at ${actionPath}.`,
    );
  }
  // The encrypt action was registered in Chipotle's allowlist against the
  // raw (trailing-newline-preserving) file bytes. Stripping whitespace
  // here produces a different code hash and triggers HTTP 403. The
  // decrypt actions were re-registered via a 403-probe ceremony that
  // stripped the newline — hence the asymmetry with the other loaders.
  cachedChipotleEncryptCode = readFileSync(actionPath, 'utf8');
  return cachedChipotleEncryptCode;
}

function getUniversalEncryptCode(): string {
  if (cachedUniversalEncryptCode) return cachedUniversalEncryptCode;
  const actionPath = join(DATA_DIR, 'lit-actions/universal-encrypt-chipotle.js');
  if (!existsSync(actionPath)) {
    throw new Error(`Universal encrypt Lit Action not found at ${actionPath}.`);
  }
  cachedUniversalEncryptCode = readFileSync(actionPath, 'utf8');
  return cachedUniversalEncryptCode;
}

function getActionCid(): string {
  // Tier 1: supernode-provisioned config. The signed ProvisionConfig
  // delivered by `/api/ddrm/provision` carries `actions.decrypt` — the
  // universal decrypt CID Elacity Labs has registered with Chipotle for
  // the current fleet. Honouring it here means a future rotation requires
  // only updating the supernode payload; no PC2 redeploy.
  //
  // Defensive: a stale cache or a supernode that briefly served a
  // known-bad CID would otherwise propagate the v1.2.1 access_denied
  // footgun to every existing PC2 node. Reject those CIDs explicitly
  // and fall through to Tier 2 (the trusted hardcoded default) with a
  // loud warn log so the issue is visible in `pc2 logs`.
  const provision = loadCachedProvision();
  const provisionedCid = provision?.actions?.decrypt;
  if (provisionedCid) {
    if (KNOWN_BAD_NON_MEDIA_DECRYPT_CIDS.has(provisionedCid)) {
      logger.warn(
        `[Chipotle] Cached supernode provision contains known-bad decrypt CID "${provisionedCid}" — ignoring and using hardcoded fallback. Delete data/.chipotle-provision.json to re-fetch from supernode.`,
      );
    } else {
      return provisionedCid;
    }
  }

  // Tier 2: hardcoded fallback — must stay in lock-step with `storage.ts`
  // → `DEFAULT_NON_MEDIA_ACTION_CID`. Rotation procedure: update BOTH in
  // the same commit.
  return UNIVERSAL_DECRYPT_CID;
}

/**
 * Returns the active universal-encrypt Lit Action CID.
 * Priority: provision config (`actions.encrypt`) → hardcoded constant.
 */
export const getEncryptActionCid = (): string => {
  const provision = loadCachedProvision();
  const provisionedCid = provision?.actions?.encrypt;
  if (provisionedCid) {
    return provisionedCid;
  }
  return UNIVERSAL_ENCRYPT_CID;
};

/**
 * Returns the active universal-decrypt Lit Action CID.
 * Same tier resolution as `getActionCid()`, clearer name for V3 unified flow.
 */
export const getDecryptActionCid = (): string => getActionCid();

// ── Core REST Client ─────────────────────────────────────────────────────────

class ChipotleError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ChipotleError';
  }
}

// ── ipfs_id Negative Cache ───────────────────────────────────────────────────
// Chipotle keeps an in-memory cache of Lit Action code keyed by IPFS CID.
// Once we have seen "no cached code found" for a CID, we skip the ipfs_id
// attempt for a short TTL — avoids paying a wasted roundtrip on every call
// while the cache is cold. After TTL we probe again so a server warm-up
// (someone else's call, or a deploy) gets noticed.
const NO_CACHED_CODE_TTL_MS = 60_000; // 1 minute
const noCachedCodeMisses = new Map<string, number>(); // cid -> expiry epoch ms

function isIpfsIdNegativelyCached(cid: string): boolean {
  const expiry = noCachedCodeMisses.get(cid);
  if (!expiry) return false;
  if (Date.now() < expiry) return true;
  noCachedCodeMisses.delete(cid); // expired — retry the fast path
  return false;
}

function markIpfsIdNotCached(cid: string): void {
  noCachedCodeMisses.set(cid, Date.now() + NO_CACHED_CODE_TTL_MS);
}

async function executeLitAction(params: LitActionParams, _config?: ChipotleConfig): Promise<LitActionResult> {
  const url = `${LIT_ACTION_PROXY_URL}/core/v1/lit_action`;

  const postBody = async (body: Record<string, unknown>): Promise<{ status: number; text: string; json: any }> => {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    // Don't throw on non-JSON — some Chipotle error paths return a raw
    // text body and we still want isNoCachedCodeError() to match. The
    // outer status check decides whether to surface an error.
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: resp.status, text, json };
  };

  /**
   * Extract a raw error message string from a Chipotle response.
   * Handles every shape we have observed:
   *   - JSON-encoded string body: `"No cached code found..."` → json is a string
   *   - Wrapped error object: `{ "error": "..." }` or `{ "message": "..." }`
   *   - Raw text body (no JSON parse): use `text` directly
   *   - Nested detail: `{ "error": { "message": "..." } }`
   *
   * Returns the message verbatim — callers decide whether to match
   * case-sensitively or not.
   */
  const extractErrorMessage = (json: any, text: string): string => {
    if (typeof json === 'string') return json;
    if (json && typeof json === 'object') {
      const candidates = [json.error, json.message, json.detail, json.reason];
      for (const c of candidates) {
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object' && typeof c.message === 'string') return c.message;
      }
    }
    return text || '';
  };

  /**
   * Detect Chipotle's "ipfs_id submitted but no cached code available"
   * response. Canonical body observed in production:
   *
   *   "No cached code found. Submit the action code at least once
   *    before referencing it by IPFS ID.: cache miss for IPFS ID <cid>"
   *
   * Strict matcher — requires the exact anchor phrase. We do NOT match
   * looser variants ("code not cached", isolated "cache miss") because:
   *   - They could occur inside an unrelated Lit Action error bubble.
   *   - A false positive silently retries with `code`, which would
   *     replace a real error with a delayed, mis-attributed one.
   * If Chipotle changes the wording we will see the original error,
   * the fast path will hard-fail, and we update the anchor here.
   */
  const NO_CACHED_CODE_ANCHOR = /No cached code found/i;
  const isNoCachedCodeError = (status: number, json: any, text: string): boolean => {
    // Restrict to 4xx — server errors (5xx) should propagate, not silently
    // trigger a fallback that would shadow the underlying problem.
    if (status < 400 || status >= 500) return false;
    return NO_CACHED_CODE_ANCHOR.test(extractErrorMessage(json, text));
  };

  // 1. Prefer ipfs_id reference when caller provides it — avoids shipping
  //    the full Lit Action source on every call. Skip the attempt entirely
  //    if we recently learned this CID is not cached server-side (negative
  //    cache, see executeLitAction state below).
  let attempt: { status: number; text: string; json: any } | null = null;
  const shouldSkipIpfsId = params.ipfsId ? isIpfsIdNegativelyCached(params.ipfsId) : false;
  if (params.ipfsId && !shouldSkipIpfsId) {
    logger.debug(`[Chipotle] POST ${url} (ipfs_id: ${params.ipfsId}, params: ${Object.keys(params.jsParams).join(',')})`);
    attempt = await postBody({
      ipfs_id: params.ipfsId,
      js_params: params.jsParams || {},
    });

    if (isNoCachedCodeError(attempt.status, attempt.json, attempt.text)) {
      logger.info(`[Chipotle] ipfs_id ${params.ipfsId} not cached server-side — falling back to inline code`);
      markIpfsIdNotCached(params.ipfsId);
      attempt = null;
    }
  } else if (params.ipfsId && shouldSkipIpfsId) {
    logger.debug(`[Chipotle] Skipping ipfs_id ${params.ipfsId} (negative cache hit)`);
  }

  // 2. Fallback (or default) — send the full source.
  if (!attempt) {
    logger.debug(`[Chipotle] POST ${url} (code: ${params.code.length} chars, params: ${Object.keys(params.jsParams).join(',')})`);
    attempt = await postBody({
      code: params.code,
      js_params: params.jsParams || {},
    });
  }

  const { status, text, json } = attempt;

  if (status >= 400) {
    const errMsg = typeof json === 'string'
      ? json
      : (json?.error || json?.message || json?.detail || text.substring(0, 300));
    throw new ChipotleError(
      `Chipotle HTTP ${status}: ${errMsg}`,
      status,
      json,
    );
  }

  // Some success responses return non-JSON bodies (raw text) — surface that
  // explicitly instead of returning the literal string "null".
  if (json === null) {
    throw new ChipotleError(
      `Chipotle returned non-JSON success body: ${text.substring(0, 200)}`,
      status,
    );
  }

  if (json.has_error) {
    logger.warn(`[Chipotle] Lit Action had errors. Logs: ${json.logs?.substring(0, 200)}`);
  }

  return {
    response: typeof json.response === 'string' ? json.response : JSON.stringify(json.response),
    logs: json.logs || '',
    hasError: json.has_error || false,
  };
}

// ── High-Level Operations ────────────────────────────────────────────────────

/**
 * Recover the Content Encryption Key for a media asset via ECDH envelope.
 * Replaces: recoverMediaCEK() with its ECDH key pair + client.executeJs()
 *
 * The caller still handles ECDH key generation and envelope unwrapping.
 * This function just runs the Lit Action and returns the raw base64 envelope.
 */
export async function recoverMediaCEKEnvelope(
  params: MediaDecryptParams,
  mediaActionCode: string,
  config?: ChipotleConfig,
): Promise<Buffer> {
  // Phase 5 cutover: sigauth bundle is mandatory. See recoverNonMediaCEK.
  if (!params.secureViewSession) {
    throw new Error(
      '[Chipotle] recoverMediaCEKEnvelope requires params.secureViewSession (signed delegation + request).',
    );
  }

  const __metricStart = Date.now();

  try {
    const jsParams: Record<string, unknown> = {
      keyAlg: { name: 'ECDH', namedCurve: 'P-256' },
      publicKey: params.publicKeyHex,
      ciphertext: params.litCiphertext,
      dataToEncryptHash: params.dataToEncryptHash,
      kid: params.kid.startsWith('0x') ? params.kid : `0x${params.kid}`,
      actionIpfsId: params.actionCid,
      authority: params.authority || DEFAULT_AUTHORITY,
      chain: params.chain || DEFAULT_CHAIN,
      chainId: params.chainId || DEFAULT_CHAIN_ID,
      rpc: params.rpc || getBaseRpcUrl(),
      delegation: params.secureViewSession.delegationCanonical,
      delegationSig: params.secureViewSession.delegationSig,
      request: params.secureViewSession.requestCanonical,
      requestSig: params.secureViewSession.requestSig,
    };

    const result = await executeLitAction({ code: mediaActionCode, ipfsId: params.actionCid, jsParams }, config);

    // Media Lit Action returns a base64-encoded binary ECDH envelope
    const envelope = Buffer.from(result.response, 'base64');
    logger.info(`[Chipotle] Media CEK envelope received (${envelope.length} bytes)`);
    recordMetricCounter(undefined, 'chipotle.cek_recovery', 1, { kind: 'media', outcome: 'success' });
    recordMetricHistogram(undefined, 'chipotle.cek_recovery_ms', Date.now() - __metricStart, { kind: 'media', outcome: 'success' });
    return envelope;
  } catch (err) {
    const reason = classifyChipotleError(err);
    recordMetricCounter(undefined, 'chipotle.cek_recovery', 1, { kind: 'media', outcome: 'failure', reason });
    recordMetricHistogram(undefined, 'chipotle.cek_recovery_ms', Date.now() - __metricStart, { kind: 'media', outcome: 'failure' });
    throw err;
  }
}

/**
 * Encrypt data using Chipotle's PKP-AES encryption (Lit.Actions.Encrypt).
 *
 * This replaces Datil's client.encrypt() for new assets. The CEK is encrypted
 * by the TEE using the master PKP's AES key, producing a ciphertext string
 * that can only be decrypted by the same PKP via Lit.Actions.Decrypt.
 *
 * Note: assets encrypted with this method are NOT compatible with Datil's
 * decryptAndCombine. A litBackend metadata field tracks which scheme was used.
 */
export async function encryptWithLitAction(
  params: EncryptParams,
  config?: ChipotleConfig,
): Promise<EncryptResult> {
  const __metricStart = Date.now();

  try {
    const pkpId = resolvePkpId(config);

    // params.dataToEncrypt is the raw bytes of the CEK.
    // Convert to base64 string to send to Lit Action.
    const plaintext = Buffer.from(params.dataToEncrypt).toString("base64");

    const code = getUniversalEncryptCode();

    const jsParams: Record<string, unknown> = {
      pkpId,
      plaintext,
      kid: params.kid,           // base64-encoded KID bytes
      authority: params.authority, // hex, 0x-prefixed
      outputFormat: 'hex',
    };

    const result = await executeLitAction(
      { code, ipfsId: UNIVERSAL_ENCRYPT_CID, jsParams },
      config,
    );

    let parsed: { ciphertext?: string; error?: string; hash?: string; issuer?: string; signature?: string };
    try {
      parsed = JSON.parse(result.response);
    } catch {
      throw new Error(`Chipotle encrypt returned unparseable response: ${result.response.substring(0, 200)}`);
    }

    if (parsed.error) {
      throw new ChipotleError(`Chipotle encrypt failed: ${parsed.error}`, 500);
    }

    if (!parsed.ciphertext) {
      throw new Error('Chipotle encrypt returned no ciphertext');
    }

    let hash = parsed.hash;

    if (!hash) {
      const crypto = await import('crypto');
      const toHashCompisite = new Uint8Array(params.dataToEncrypt.byteLength + 16 + 20);
      toHashCompisite.set(params.dataToEncrypt);
      toHashCompisite.set(Buffer.from(params.kid || '0x00000000000000000000000000000000', 'hex'), params.dataToEncrypt.byteLength);
      toHashCompisite.set(Buffer.from(params.authority || '0x0000000000000000000000000000000000000000', 'hex'), params.dataToEncrypt.byteLength + 16);
      hash = crypto.createHash('sha256').update(toHashCompisite).digest('hex');
    }

    logger.info(`[Chipotle] Encrypted ${params.dataToEncrypt.length} bytes via PKP-AES (pkpId: ${pkpId.substring(0, 10)}...)`);

    recordMetricCounter(undefined, 'chipotle.encrypt', 1, { outcome: 'success' });
    recordMetricHistogram(undefined, 'chipotle.encrypt_ms', Date.now() - __metricStart, { outcome: 'success' });
    return {
      ciphertext: parsed.ciphertext,
      dataToEncryptHash: hash,
      ...(parsed as { issuer?: string; signature?: string }),
    };
  } catch (err) {
    const reason = classifyChipotleError(err);
    recordMetricCounter(undefined, 'chipotle.encrypt', 1, { outcome: 'failure', reason });
    recordMetricHistogram(undefined, 'chipotle.encrypt_ms', Date.now() - __metricStart, { outcome: 'failure' });
    throw err;
  }
}

// ── Lit Action Code Fetching ─────────────────────────────────────────────────

const litActionCodeCache = new Map<string, string>();

/**
 * Fetch and cache Lit Action JavaScript code by IPFS CID.
 * Tries local file first, then IPFS gateways. Moved from media.ts to share
 * across all decrypt paths.
 */
async function fetchLitActionCode(cid: string): Promise<string> {
  // Check local file first (for actions shipped with the node)
  const localPath = join(DATA_DIR, `lit-actions/${cid}.js`);
  if (existsSync(localPath)) {
    const code = readFileSync(localPath, 'utf8').replace(/\s+$/, '');
    if (code && code.length > 10) {
      litActionCodeCache.set(cid, code);
      return code;
    }
  }

  const cached = litActionCodeCache.get(cid);
  if (cached) return cached;

  const gateways = [
    `https://gateway.pinata.cloud/ipfs/${cid}`,
    `https://ipfs.io/ipfs/${cid}`,
    `http://localhost:4200/ipfs/${cid}`,
    `https://ipfs.ela.city/ipfs/${cid}`,
  ];

  for (const url of gateways) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const code = (await resp.text()).replace(/\s+$/, '');
        if (code && code.length > 10) {
          litActionCodeCache.set(cid, code);
          logger.info(`[Chipotle] Fetched Lit Action code from ${url.includes('localhost') ? 'local' : 'remote'} IPFS (${code.length} chars)`);
          return code;
        }
      }
    } catch { /* try next gateway */ }
  }

  // Fallback: try loading universal-decrypt from local disk
  const universalPath = join(DATA_DIR, 'lit-actions/universal-decrypt-chipotle.js');
  if (cid === UNIVERSAL_DECRYPT_CID && existsSync(universalPath)) {
    const code = readFileSync(universalPath, 'utf8').replace(/\s+$/, '');
    litActionCodeCache.set(cid, code);
    return code;
  }

  throw new Error(`Failed to fetch Lit Action code: ${cid}`);
}

/**
 * Server-owned ECDH envelope CEK recovery. Used by the media path
 * (`/api/media/init`) where no client-side wallet bridge is involved.
 *
 * The server itself plays both the "owner" and "session" roles:
 *  - generates an ephemeral ECDSA P-256 keypair (extractable so it can be
 *    re-imported as ECDH for the envelope unwrap, matching the technique
 *    used by `tools/lit-direct-decrypt.mjs`),
 *  - signs the delegation with `getServerWallet()` (ownerAddress = server),
 *  - signs the per-request bundle with the ephemeral session key,
 *  - calls the Lit Action,
 *  - unwraps the envelope locally with the same ephemeral key.
 *
 * The on-chain access gate inside the Lit Action still enforces
 * `hasAccessByContentId(buyerAddress, kid)`, so buyers without the
 * AccessToken are denied regardless of who signed the delegation.
 */
export async function recoverCEKWithServerSession(
  params: {
    litCiphertext: string;
    dataToEncryptHash: string;
    kid: string;
    buyerAddress: string;
    actionCid?: string;
    authority?: string;
    chain?: string;
    chainId?: number;
    rpc?: string;
    signature?: string;
    issuer?: string;
  },
  config?: ChipotleConfig,
): Promise<string> {
  const __metricStart = Date.now();

  try {
    const effectiveCid = params.actionCid || UNIVERSAL_DECRYPT_CID;
    const effectiveChainId = params.chainId || DEFAULT_CHAIN_ID;
    const normalizedKid = params.kid.startsWith('0x')
      ? params.kid.toLowerCase()
      : '0x' + params.kid.toLowerCase();

    // 1. Generate ephemeral session keypair (ECDSA for signing). `extractable: true`
    //    so we can re-import the private scalar as ECDH for envelope unwrap.
    const { subtle } = globalThis.crypto;
    const sessionKeyPair = await subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    );
    const rawPub = new Uint8Array(await subtle.exportKey('raw', sessionKeyPair.publicKey));
    const sessionPublicKey = ('0x' + Buffer.from(rawPub).toString('hex')) as `0x${string}`;

    // 2. Build + sign delegation with the server wallet.
    const { Wallet } = await import('ethers');
    const wallet = new Wallet((await subtle.exportKey('pkcs8', sessionKeyPair.privateKey)).toString());
    const now = Math.floor(Date.now() / 1000);
    const delegation = {
      domain: 'pc2.secure-view.v1',
      ownerAddress: wallet.address,
      coveredAddresses: [params.buyerAddress],
      sessionPublicKey,
      actionIpfsId: effectiveCid,
      chainId: effectiveChainId,
      issuedAt: now,
      expiresAt: now + 3600,
      nonce: '0x' + randomBytes(16).toString('hex'),
    };
    const delegationCanonical = canonicalize(delegation);
    const delegationSig = (await wallet.signMessage(delegationCanonical)) as `0x${string}`;

    // 3. Build + sign per-request bundle with the ephemeral session key.
    const request = {
      domain: 'pc2.secure-view.request.v1',
      kid: normalizedKid,
      actionIpfsId: effectiveCid,
      requestedAt: now,
      requestNonce: '0x' + randomBytes(8).toString('hex'),
    };
    const requestCanonical = canonicalize(request);
    const reqSigBuf = await subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      sessionKeyPair.privateKey,
      new TextEncoder().encode(requestCanonical),
    );
    const requestSig = ('0x' + Buffer.from(reqSigBuf).toString('hex')) as `0x${string}`;

    // 4. Re-import the ECDSA private scalar as ECDH so we can run deriveKey
    //    against the PKP ephemeral public key in `unwrapECDHEnvelope`.
    const jwk = await subtle.exportKey('jwk', sessionKeyPair.privateKey);
    delete (jwk as Record<string, unknown>).alg;
    delete (jwk as Record<string, unknown>).key_ops;
    const keyAlg = { name: 'ECDH', namedCurve: 'P-256' } as const;
    const ecdhPrivateKey = await subtle.importKey('jwk', jwk, keyAlg, false, ['deriveKey']);

    // 5. Call the Lit Action.
    const code = await fetchLitActionCode(effectiveCid);
    const pkpId = resolvePkpId(config);
    const jsParams: Record<string, unknown> = {
      keyAlg,
      ciphertext: params.litCiphertext,
      dataToEncryptHash: params.dataToEncryptHash,
      kid: normalizedKid,
      pkpId,
      actionIpfsId: effectiveCid,
      authority: params.authority || DEFAULT_AUTHORITY,
      chain: params.chain || DEFAULT_CHAIN,
      chainId: effectiveChainId,
      rpc: params.rpc || getBaseRpcUrl(),
      delegation: delegationCanonical,
      delegationSig,
      request: requestCanonical,
      requestSig,
    };
    if (params.signature) jsParams.signature = params.signature;
    if (params.issuer) jsParams.issuer = params.issuer;

    logger.info(`[Chipotle] Server-session decrypt via ${effectiveCid}, kid=${params.kid}`);
    const result = await executeLitAction({ code, ipfsId: effectiveCid, jsParams }, config);

    let parsed: any;
    try {
      parsed = JSON.parse(result.response);
    } catch {
      throw new Error(`Unparseable decrypt response: ${result.response.substring(0, 200)}`);
    }
    if (parsed.error) {
      throw new Error(`Lit Action denied: ${parsed.error} (code=${parsed.code || 'unknown'})`);
    }

    const dataB64 = parsed.data || result.response;
    const dataBytes = Buffer.from(dataB64, 'base64');
    if (dataBytes.length <= 32) {
      logger.info(`[Chipotle] Legacy plaintext CEK detected (${dataBytes.length} bytes) — returning as-is`);
      recordMetricCounter(undefined, 'chipotle.cek_recovery', 1, { kind: 'server_session', outcome: 'success', legacy: 'true' });
      recordMetricHistogram(undefined, 'chipotle.cek_recovery_ms', Date.now() - __metricStart, { kind: 'server_session', outcome: 'success' });
      return dataB64;
    }

    const cekBase64 = await unwrapECDHEnvelope(dataBytes, ecdhPrivateKey, rawPub, keyAlg);
    logger.info(`[Chipotle] CEK recovered via server-session ECDH envelope (${dataBytes.length} bytes envelope)`);

    recordMetricCounter(undefined, 'chipotle.cek_recovery', 1, { kind: 'server_session', outcome: 'success' });
    recordMetricHistogram(undefined, 'chipotle.cek_recovery_ms', Date.now() - __metricStart, { kind: 'server_session', outcome: 'success' });
    return cekBase64;
  } catch (err) {
    const reason = classifyChipotleError(err);
    recordMetricCounter(undefined, 'chipotle.cek_recovery', 1, { kind: 'server_session', outcome: 'failure', reason });
    recordMetricHistogram(undefined, 'chipotle.cek_recovery_ms', Date.now() - __metricStart, { kind: 'server_session', outcome: 'failure' });
    throw err;
  }
}

// ── ECDH Envelope Unwrapping ─────────────────────────────────────────────────
// Shared by both media and non-media decrypt paths. Extracted from media.ts.

/**
 * Unwrap an ECDH-wrapped license envelope from the Lit Action.
 *
 * Envelope format:
 *   HEADER: format (3 bytes) + flag (1 byte)
 *   METADATA:
 *     ephemeral_pubkey_len (u16be) + ephemeral_pubkey
 *     signature_len (u16be) + signature + signer_compressed_pubkey (33 bytes)
 *   BODY:
 *     encrypted_cek_len (u32be) + encrypted_cek (AES-CBC)
 *
 * Decrypted payload (rawLicenseBytes):
 *   metadata_size (u32be) + metadata (issuer + exp + audience) + key_count (u32be) + keys
 */
export async function unwrapECDHEnvelope(
  envelope: Buffer,
  privateKey: CryptoKey,
  ourRawPubKey: Uint8Array,
  keyAlg: { name: string; namedCurve: string },
): Promise<string> {
  const { subtle } = globalThis.crypto;
  let offset = 4; // skip header (3 bytes format + 1 byte flag)

  // Read ephemeral public key
  const ephPubKeyLen = (envelope[offset] << 8) | envelope[offset + 1];
  offset += 2;
  const ephPubKeyRaw = envelope.subarray(offset, offset + ephPubKeyLen);
  offset += ephPubKeyLen;

  // Skip signature
  const sigLen = (envelope[offset] << 8) | envelope[offset + 1];
  offset += 2;
  offset += sigLen;
  offset += 33; // compressed signer public key

  // Read encrypted CEK
  const encCekLen = (envelope[offset] << 24) | (envelope[offset + 1] << 16) |
    (envelope[offset + 2] << 8) | envelope[offset + 3];
  offset += 4;
  const encryptedCek = envelope.subarray(offset, offset + encCekLen);

  logger.info(`[Chipotle] Envelope: ephPubKey=${ephPubKeyLen}B, sig=${sigLen}B, encCEK=${encCekLen}B`);

  // Decompress P-256 point if needed (Lit Action compresses for P-256)
  const litPubKeyUncompressed = (ephPubKeyRaw[0] === 0x02 || ephPubKeyRaw[0] === 0x03)
    ? decompressP256Point(ephPubKeyRaw)
    : new Uint8Array(ephPubKeyRaw);

  // Import Lit's ephemeral public key
  const litPubKey = await subtle.importKey(
    'raw',
    litPubKeyUncompressed as BufferSource,
    { name: keyAlg.name, namedCurve: keyAlg.namedCurve },
    false,
    [],
  );

  // Derive shared AES-CBC-256 key via ECDH
  const sharedKey = await subtle.deriveKey(
    { name: keyAlg.name, namedCurve: keyAlg.namedCurve, public: litPubKey } as any,
    privateKey,
    { name: 'AES-CBC', length: 256 },
    false,
    ['decrypt'],
  );

  // IV = first 16 bytes of OUR raw public key (matches Lit Action's pubKeyBuff.subarray(0, 16))
  const iv = ourRawPubKey.slice(0, 16);

  // Decrypt — copy to fresh ArrayBuffers to satisfy strict BufferSource typing
  const encCekCopy = new Uint8Array(encryptedCek);
  const decrypted = new Uint8Array(
    await subtle.decrypt(
      { name: 'AES-CBC', iv: iv as unknown as ArrayBuffer },
      sharedKey,
      encCekCopy as unknown as ArrayBuffer,
    ),
  );

  // Parse rawLicenseBytes: metadataSize(u32) | metadata | keyCount(u32) | keys
  const metaSize = (decrypted[0] << 24) | (decrypted[1] << 16) | (decrypted[2] << 8) | decrypted[3];
  const bodyOffset = 4 + metaSize;
  const keyCount = (decrypted[bodyOffset] << 24) | (decrypted[bodyOffset + 1] << 16) |
    (decrypted[bodyOffset + 2] << 8) | decrypted[bodyOffset + 3];
  const cekStart = bodyOffset + 4;

  // Read all key bytes — total remaining bytes after keyCount header
  const cekBytes = decrypted.subarray(cekStart);
  logger.info(`[Chipotle] Unwrapped license: metaSize=${metaSize}, keyCount=${keyCount}, cekLen=${cekBytes.length}`);

  const result = Buffer.from(cekBytes).toString('base64');

  // Zero sensitive memory
  decrypted.fill(0);
  return result;
}

/**
 * Decompress a compressed P-256 EC point (33 bytes → 65 bytes uncompressed).
 * P-256 curve: y² = x³ - 3x + b (mod p)
 */
export function decompressP256Point(compressed: Uint8Array): Uint8Array {
  if (compressed.length !== 33) throw new Error(`Invalid compressed point length: ${compressed.length}`);
  const prefix = compressed[0];
  if (prefix !== 0x02 && prefix !== 0x03) throw new Error(`Invalid prefix: 0x${prefix.toString(16)}`);

  const p = BigInt('0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF');
  const b = BigInt('0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B');
  const a = p - 3n;

  let x = 0n;
  for (let i = 1; i < 33; i++) {
    x = (x << 8n) | BigInt(compressed[i]);
  }

  const x3 = modPow(x, 3n, p);
  const rhs = (x3 + a * x + b) % p;
  let y = modSqrt(rhs, p);

  const isOdd = (y & 1n) === 1n;
  if ((prefix === 0x03) !== isOdd) {
    y = p - y;
  }

  const result = new Uint8Array(65);
  result[0] = 0x04;
  result.set(bigintToBytes32(x), 1);
  result.set(bigintToBytes32(y), 33);
  return result;
}

function bigintToBytes32(n: bigint): Uint8Array {
  const hex = n.toString(16).padStart(64, '0');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

/** Tonelli-Shanks modular square root for P-256 (p === 3 mod 4 → simple formula). */
function modSqrt(a: bigint, p: bigint): bigint {
  return modPow(a, (p + 1n) / 4n, p);
}

// ── Utility: Build Self-Referential Conditions ───────────────────────────────

export function buildSelfRefConditions(actionCid: string, chain = 'base') {
  return [
    {
      conditionType: 'evmBasic',
      contractAddress: '',
      standardContractType: '',
      chain,
      method: '',
      parameters: [':currentActionIpfsId'],
      returnValueTest: {
        comparator: '=',
        value: actionCid,
      },
    },
  ];
}

// ── Utility: Get Current Config Info ─────────────────────────────────────────

export function getChipotleInfo() {
  return {
    apiUrl: LIT_ACTION_PROXY_URL,
    actionCid: getActionCid(),
    authority: DEFAULT_AUTHORITY,
    chain: DEFAULT_CHAIN,
    chainId: DEFAULT_CHAIN_ID,
  };
}

// ── Exports ──────────────────────────────────────────────────────────────────

export {
  executeLitAction,
  getActionCid,
  getNonMediaActionCode,
  getChipotleNonMediaActionCode,
  getChipotleEncryptCode,
  getUniversalEncryptCode,
  ChipotleError,
  DEFAULT_PKP_ID,
  DEFAULT_AUTHORITY,
};
