/**
 * chipotle-client.ts — Minimal REST client for Lit Protocol Chipotle (v3)
 *
 * Replaces the entire Lit SDK (@lit-protocol/*) with a single HTTP call.
 * No SIWE, no session sigs, no capacity credits, no WebSocket connections.
 *
 * Three-tier API key resolution:
 *   Tier 1: Elacity-provided shared key (default for all PC2 nodes)
 *   Tier 2: User-provided key (self-sovereign, set in Settings UI)
 *   Tier 3: Future — Elacity dDRM API product key
 *
 * Auto-provisioning: If no key is found locally, the client fetches
 * the shared config from an Elacity supernode on first use.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { createPublicKey, verify as cryptoVerify } from 'crypto';
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
function classifyChipotleError (err: unknown): string {
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

const CHIPOTLE_KEY_PATH = join(DATA_DIR, '.chipotle-api-key');
const USER_KEY_PATH = join(DATA_DIR, '.chipotle-user-key');
const LIT_ACTION_CID_PATH = join(DATA_DIR, '.lit-action-cid');
const PROVISION_CACHE_PATH = join(DATA_DIR, '.chipotle-provision.json');

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_API_URL = 'https://api.chipotle.litprotocol.com';
const DEV_API_URL = 'https://api.dev.litprotocol.com';

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
  apiUrl?: string;
  apiKey?: string;
  pkpId?: string;
}

export interface LitActionParams {
  code: string;
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

export interface NonMediaDecryptParams {
  litCiphertext: string;
  dataToEncryptHash: string;
  kid: string;
  buyerAddress: string;
  actionCid?: string;
  authority?: string;
  chain?: string;
  chainId?: number;
  rpc?: string;
  secureViewSession?: SecureViewSessionBundle;
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
  accessControlConditions: Record<string, unknown>[];
}

export interface EncryptResult {
  ciphertext: string;
  dataToEncryptHash: string;
}

// ── Auto-Provisioning from Supernode ─────────────────────────────────────────

interface ProvisionConfig {
  version: number;
  network: string;
  apiUrl: string;
  usageKey: string;
  pkpId: string;
  authority: string;
  chain: string;
  chainId: number;
  rpc: string;
  actions: {
    nonMediaEncrypt: string;
    nonMediaDecrypt: string;
    mediaDecrypt?: string;
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
  if (typeof p.usageKey !== 'string' || p.usageKey.length < 16 || p.usageKey === 'REPLACE_WITH_USAGE_API_KEY') {
    return { ok: false, reason: 'usageKey_missing_or_placeholder' };
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
      const config = result.config;

      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(PROVISION_CACHE_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
      writeFileSync(CHIPOTLE_KEY_PATH, config.usageKey, { mode: 0o600 });

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

// ── API Key Resolution ───────────────────────────────────────────────────────

function resolveApiKey(): string {
  // Tier 2: User-provided key takes priority (self-sovereign)
  const envUserKey = process.env.LIT_CHIPOTLE_USER_KEY;
  if (envUserKey) return envUserKey;

  if (existsSync(USER_KEY_PATH)) {
    const key = readFileSync(USER_KEY_PATH, 'utf8').trim();
    if (key) {
      logger.info('[Chipotle] Using user-provided API key (Tier 2 self-sovereign)');
      return key;
    }
  }

  // Tier 1: Shared Elacity key (default for all PC2 nodes)
  const envSharedKey = process.env.LIT_CHIPOTLE_USAGE_KEY;
  if (envSharedKey) return envSharedKey;

  if (existsSync(CHIPOTLE_KEY_PATH)) {
    const key = readFileSync(CHIPOTLE_KEY_PATH, 'utf8').trim();
    if (key) return key;
  }

  // Tier 0: Check cached provision (from supernode auto-fetch)
  const provision = loadCachedProvision();
  if (provision?.usageKey) return provision.usageKey;

  throw new Error(
    'No Chipotle API key configured. ' +
    'The node will auto-provision from a supernode on the next dDRM operation, ' +
    'or set LIT_CHIPOTLE_USAGE_KEY env var, or place the key in data/.chipotle-api-key',
  );
}

function resolvePkpId(config?: ChipotleConfig): string {
  if (config?.pkpId) return config.pkpId;
  const provision = loadCachedProvision();
  if (provision?.pkpId) return provision.pkpId;
  return DEFAULT_PKP_ID;
}

function resolveApiUrl(): string {
  return process.env.LIT_CHIPOTLE_API_URL || DEFAULT_API_URL;
}

// ── Lit Action Code Loading ──────────────────────────────────────────────────

let cachedNonMediaCode: string | null = null;
let cachedChipotleNonMediaCode: string | null = null;
let cachedChipotleEncryptCode: string | null = null;

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

function getActionCid(): string {
  // Tier 1: explicit env override (operator/dev workflow).
  const envCid = process.env.LIT_ACTION_CID;
  if (envCid) return envCid;

  // Tier 2: on-disk override file written by `/api/storage/lit/deploy-action`
  // or by an operator dropping a CID into `data/.lit-action-cid`.
  if (existsSync(LIT_ACTION_CID_PATH)) {
    const cid = readFileSync(LIT_ACTION_CID_PATH, 'utf8').trim();
    if (cid) return cid;
  }

  // Tier 3: supernode-provisioned config (Wave 8+). The signed
  // ProvisionConfig delivered by `/api/ddrm/provision` carries
  // `actions.nonMediaDecrypt` — the CID Elacity Labs has registered
  // with Chipotle for the current fleet. Honouring it here means a
  // future rotation requires only updating the supernode payload; no
  // PC2 redeploy or env juggling on every node in the world.
  //
  // Defensive: a stale cache or a supernode that briefly served a
  // known-bad CID would otherwise propagate the v1.2.1 access_denied
  // footgun to every existing PC2 node. Reject those CIDs explicitly
  // and fall through to Tier 4 (the trusted hardcoded default) with a
  // loud warn log so the issue is visible in `pc2 logs`.
  const provision = loadCachedProvision();
  const provisionedCid = provision?.actions?.nonMediaDecrypt;
  if (provisionedCid) {
    if (KNOWN_BAD_NON_MEDIA_DECRYPT_CIDS.has(provisionedCid)) {
      logger.warn(
        `[Chipotle] Cached supernode provision contains known-bad nonMediaDecrypt CID "${provisionedCid}" — ignoring and using hardcoded fallback. Delete data/.chipotle-provision.json to re-fetch from supernode.`,
      );
    } else {
      return provisionedCid;
    }
  }

  // Tier 4: hardcoded fallback — must stay in lock-step with `storage.ts`
  // → `DEFAULT_NON_MEDIA_ACTION_CID`. The `bafkrei…` value is the
  // canonical V1.2 sigauth action registered with Chipotle group 1 and
  // pinned to ≥2 IPFS providers. Rotation procedure: update BOTH in the
  // same commit, see V12_SIGAUTH_HANDOVER.md §6.2.
  //
  // (v1.2.1 incorrectly hardcoded `QmX5JxcF…r5uk` here, which is a
  // Wave-8 re-pin that was registered but not production-active. Fresh
  // nodes saw `access_denied` on every asset. Fixed in v1.2.2.)
  return 'bafkreihvm4zkyuefnuptlbdins6cmd2mbslj2xgnyzz3ssdg2ggg3jtkk4';
}

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

async function executeLitAction(params: LitActionParams, config?: ChipotleConfig): Promise<LitActionResult> {
  let apiKey = config?.apiKey;
  let apiUrl = config?.apiUrl;

  if (!apiKey) {
    try {
      apiKey = resolveApiKey();
    } catch {
      const provision = await ensureProvisioned();
      if (provision?.usageKey) {
        apiKey = provision.usageKey;
        if (!apiUrl) apiUrl = provision.apiUrl;
      } else {
        throw new Error(
          'No Chipotle API key configured and auto-provisioning from supernodes failed. ' +
          'Set LIT_CHIPOTLE_USAGE_KEY env var or place the key in data/.chipotle-api-key',
        );
      }
    }
  }

  apiUrl = apiUrl || resolveApiUrl();
  const url = `${apiUrl}/core/v1/lit_action`;

  logger.debug(`[Chipotle] POST ${url} (code: ${params.code.length} chars, params: ${Object.keys(params.jsParams).join(',')})`);

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({
      code: params.code,
      js_params: params.jsParams || {},
    }),
  });

  const text = await resp.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ChipotleError(
      `Chipotle returned non-JSON: ${text.substring(0, 200)}`,
      resp.status,
    );
  }

  if (!resp.ok) {
    const errMsg = typeof json === 'string' ? json : json?.error || json?.message || text.substring(0, 300);
    throw new ChipotleError(
      `Chipotle HTTP ${resp.status}: ${errMsg}`,
      resp.status,
      json,
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
 * Recover the Content Encryption Key for a non-media asset.
 * Replaces: getLitClient() + getExecuteSessionSigs() + client.executeJs()
 */
export async function recoverNonMediaCEK(
  params: NonMediaDecryptParams,
  config?: ChipotleConfig,
): Promise<string> {
  // Phase 5 cutover: sigauth action is mandatory. A caller without a
  // SecureViewDelegation bundle is a programming error — we reject here
  // rather than silently falling through to a userAddress-trusting
  // action (that action no longer exists).
  if (!params.secureViewSession) {
    throw new Error(
      '[Chipotle] recoverNonMediaCEK requires params.secureViewSession (signed delegation + request). ' +
        'Bundle-less callers must be migrated before invoking the Lit action.',
    );
  }

  // T-1C Phase 2: metric recording. Singleton DB handle is wired at boot;
  // recorders no-op when the kill switch is set. Reason tag uses the
  // classifyChipotleError() allow-list, never raw error text.
  const __metricStart = Date.now();

  try {
    const code = getChipotleNonMediaActionCode();
    const pkpId = resolvePkpId(config);
    logger.info(`[Chipotle] Non-media action kid=${params.kid}`);

    // Session-key delegation fields (Option C). The sigauth Lit Action
    // derives the effective user from delegation.coveredAddresses, so
    // no `userAddress` is sent here — a caller cannot pretend to be
    // someone else by naming their address.
    const jsParams: Record<string, unknown> = {
      ciphertext: params.litCiphertext,
      dataToEncryptHash: params.dataToEncryptHash,
      kid: params.kid.startsWith('0x') ? params.kid : `0x${params.kid}`,
      pkpId,
      authority: params.authority || DEFAULT_AUTHORITY,
      chain: params.chain || DEFAULT_CHAIN,
      chainId: params.chainId || DEFAULT_CHAIN_ID,
      rpc: params.rpc || getBaseRpcUrl(),
      // The sigauth Lit Action verifies del.actionIpfsId matches its
      // own CID; the server must forward the CID explicitly since
      // Chipotle v3 doesn't expose getIpfsId() to action code.
      actionIpfsId: params.actionCid,
      delegation: params.secureViewSession.delegationCanonical,
      delegationSig: params.secureViewSession.delegationSig,
      request: params.secureViewSession.requestCanonical,
      requestSig: params.secureViewSession.requestSig,
    };

    const result = await executeLitAction({ code, jsParams }, config);

    // Sigauth action returns `{ data: base64, authorizedAddress, delegationNonce, requestNonce }`.
    let cekBase64: string;
    try {
      const parsed = JSON.parse(result.response);
      if (parsed.error) {
        const detail = parsed.code ? ` (code=${parsed.code})` : '';
        throw new Error(`Lit Action denied: ${parsed.error}${detail}`);
      }
      cekBase64 = parsed.data || parsed;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Lit Action denied')) throw e;
      cekBase64 = result.response;
    }

    if (!cekBase64 || cekBase64.length < 10) {
      throw new Error(`Invalid CEK response: ${result.response?.substring(0, 100)}`);
    }

    logger.info(`[Chipotle] Non-media CEK recovered (${cekBase64.length} chars)`);
    recordMetricCounter(undefined, 'chipotle.cek_recovery', 1, { kind: 'non_media', outcome: 'success' });
    recordMetricHistogram(undefined, 'chipotle.cek_recovery_ms', Date.now() - __metricStart, { kind: 'non_media', outcome: 'success' });
    return cekBase64;
  } catch (err) {
    const reason = classifyChipotleError(err);
    recordMetricCounter(undefined, 'chipotle.cek_recovery', 1, { kind: 'non_media', outcome: 'failure', reason });
    recordMetricHistogram(undefined, 'chipotle.cek_recovery_ms', Date.now() - __metricStart, { kind: 'non_media', outcome: 'failure' });
    throw err;
  }
}

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

    const result = await executeLitAction({ code: mediaActionCode, jsParams }, config);

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

    // params.dataToEncrypt is the UTF-8 bytes of the base64 CEK string.
    // Pass it directly as a string to the Lit Action so Decrypt returns
    // the same string — no double-base64 encoding.
    const plaintext = new TextDecoder().decode(params.dataToEncrypt);

    const code = getChipotleEncryptCode();

    const result = await executeLitAction(
      { code, jsParams: { pkpId, plaintext } },
      config,
    );

    let parsed: { ciphertext?: string; error?: string };
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

    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(plaintext).digest('hex');

    logger.info(`[Chipotle] Encrypted ${params.dataToEncrypt.length} bytes via PKP-AES (pkpId: ${pkpId.substring(0, 10)}...)`);

    recordMetricCounter(undefined, 'chipotle.encrypt', 1, { outcome: 'success' });
    recordMetricHistogram(undefined, 'chipotle.encrypt_ms', Date.now() - __metricStart, { outcome: 'success' });
    return {
      ciphertext: parsed.ciphertext,
      dataToEncryptHash: hash,
    };
  } catch (err) {
    const reason = classifyChipotleError(err);
    recordMetricCounter(undefined, 'chipotle.encrypt', 1, { outcome: 'failure', reason });
    recordMetricHistogram(undefined, 'chipotle.encrypt_ms', Date.now() - __metricStart, { outcome: 'failure' });
    throw err;
  }
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

// ── Utility: Save/Read User Key ──────────────────────────────────────────────

export function saveUserApiKey(key: string): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(USER_KEY_PATH, key, { mode: 0o600 });
  logger.info('[Chipotle] User API key saved (Tier 2 self-sovereign)');
}

export function getUserApiKey(): string | null {
  if (existsSync(USER_KEY_PATH)) {
    const key = readFileSync(USER_KEY_PATH, 'utf8').trim();
    return key || null;
  }
  return null;
}

export function clearUserApiKey(): void {
  if (existsSync(USER_KEY_PATH)) {
    writeFileSync(USER_KEY_PATH, '', { mode: 0o600 });
    logger.info('[Chipotle] User API key cleared (reverted to Tier 1)');
  }
}

// ── Utility: Get Current Config Info ─────────────────────────────────────────

export function getChipotleInfo() {
  const userKey = getUserApiKey();
  return {
    apiUrl: resolveApiUrl(),
    tier: userKey ? 2 : 1,
    tierLabel: userKey ? 'Self-sovereign (user-provided key)' : 'Shared Elacity key',
    actionCid: getActionCid(),
    authority: DEFAULT_AUTHORITY,
    chain: DEFAULT_CHAIN,
    chainId: DEFAULT_CHAIN_ID,
  };
}

// ── Exports ──────────────────────────────────────────────────────────────────

export {
  executeLitAction,
  resolveApiKey,
  resolveApiUrl,
  getActionCid,
  getNonMediaActionCode,
  getChipotleNonMediaActionCode,
  getChipotleEncryptCode,
  ChipotleError,
  DEFAULT_PKP_ID,
};
