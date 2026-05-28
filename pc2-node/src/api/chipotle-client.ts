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
import type { StoredSession } from '../services/session/BackendSessionService.js';
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
export const UNIVERSAL_DECRYPT_CID = 'QmfQfBESVaKD9LAghGXYo768ih6ntaXFRpe88HdCoQ3t3M';

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
  'bafkreihvm4zkyuefnuptlbdins6cmd2mbslj2xgnyzz3ssdg2ggg3jtkk4',
  'QmSHMSxPogSsNki51fenDzsrkKB3eJfRMHXEPZKqPk6EAb',              // legacy media decrypt  
]);

// Known-good legacy decrypt Lit Action CIDs. A client-supplied `actionCid`
// (sourced from asset protection data / the request body) is honoured only
// when it is the current production CID or one of these. Any other CID is
// rejected before a Lit Action is invoked — an unrecognised CID could point
// at an action that skips the kid↔ciphertext binding check or the on-chain
// access gate. Keep in sync with storage.ts `LEGACY_NON_MEDIA_ACTION_CIDS`.
const LEGACY_DECRYPT_ACTION_CIDS = new Set<string>([
  'bafybeiamslb2nn53t3kjrhzkorhcvrhfwevuemk5bkgkbzvu7pq5sezeay',
  'QmPBjQD7V4aFTZPxUwZ9gDPFJtcJ4SvsJdTh3QexTyRBbj',
]);

const LEGACY_DECRYPT_ACTION_REMAP: Record<string, string> = {
  'bafybeiamslb2nn53t3kjrhzkorhcvrhfwevuemk5bkgkbzvu7pq5sezeay': UNIVERSAL_DECRYPT_CID,
  'QmPBjQD7V4aFTZPxUwZ9gDPFJtcJ4SvsJdTh3QexTyRBbj': UNIVERSAL_DECRYPT_CID,
  'QmSHMSxPogSsNki51fenDzsrkKB3eJfRMHXEPZKqPk6EAb': UNIVERSAL_DECRYPT_CID,
  'QmRSpGFftbiWQBkHFEi9FUhtigfPbcCkezuuEUNUJcFr6h': UNIVERSAL_DECRYPT_CID,
}

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
  /** ECDH algorithm the client session key supports. Defaults to P-256 if absent. */
  keyAlg?: { name: string; namedCurve?: string };
}

// ── Secure-View session constants (shared with BackendSessionService) ─────────

/** Canonical JSON `domain` for the wallet-signed delegation. */
export const DELEGATION_DOMAIN = 'pc2.secure-view.v1' as const;

/** Canonical JSON `domain` for the session-signed per-asset request. */
export const REQUEST_DOMAIN = 'pc2.secure-view.request.v1' as const;

/** Hard cap on delegation TTL — matches `MAX_DELEGATION_WINDOW_SECONDS` in `utils/secureViewSession.ts`. */
export const MAX_DELEGATION_TTL_SECONDS = 24 * 3600;

/** Generate a 0x-prefixed random hex string of `byteLength` bytes (CSPRNG-backed). */
export function randomHex(byteLength: number): `0x${string}` {
  return ('0x' + randomBytes(byteLength).toString('hex')) as `0x${string}`;
}

// ── ISessionView abstraction ──────────────────────────────────────────────────

/**
 * Decryption surface, separated from session lifecycle so WASM-backed
 * implementations don't have to expose CEK bytes via a getter. Both
 * `BackendSessionView` (CEK in Node heap) and `WasmSessionView` (CEK in WASM
 * linear memory) implement this — consumers depend on the interface, not on
 * `cekBase64`.
 *
 * Each method is a no-op until `unwrapEnvelope()` (from `ISessionView`) has
 * stored the CEK. Implementations throw if called before the unwrap.
 */
export interface ICencDecryptor {
  /**
   * Full-asset AES-256-GCM (Chipotle two-layer outer envelope). `ciphertext`
   * is `payload || authTag` (last 16 bytes are the GCM tag). `iv` is the
   * 12-byte (or larger) nonce from the asset metadata.
   */
  decryptAsset(ciphertext: Uint8Array, iv: Uint8Array): Promise<Buffer>;

  /**
   * fMP4/CENC segment decrypt. `initSegment` is consulted for `tenc` (IV size);
   * the segment's `senc` carries per-sample IVs. AES-128-CTR.
   *
   * **Phase-2 status:** implemented on `WasmSessionView` (Phase 3); on
   * `BackendSessionView` this throws until Phase 5 wires `WASMRuntime`
   * injection. Today the JS backend's media path still calls the standalone
   * `decryptSegmentViaWASM` helper in `media.ts` directly.
   */
  decryptSegment(initSegment: Uint8Array | null, segment: Uint8Array): Promise<Buffer>;

  /** Release any per-request key material (zero in WASM, GC in Node). */
  dispose(): Promise<void>;
}

/**
 * Abstraction over a secure-view session for CEK envelope recovery.
 *
 * Implementations:
 *   - ClientBundleSessionView — wraps a client-provided {delegation, request} bundle.
 *   - BackendSessionView      — server-owned P-256 session; CEK stays in Node heap.
 *   - WasmSessionView         — ddrm WASM (Phase 3); CEK in linear memory only.
 */
export interface ISessionView {
  /** Canonical delegation JSON (sorted keys, no whitespace), wallet-signed. */
  readonly delegationCanonical: string;
  readonly delegationSig: `0x${string}`;
  /** ECDH algorithm forwarded to the Lit Action as `jsParams.keyAlg`. */
  readonly keyAlg: { name: string; namedCurve?: string };
  /**
   * Build + sign a per-asset request. Must use a fresh nonce + `requestedAt`.
   * May return a pre-built request (client-bundle path) when the private key
   * is held client-side and only a one-shot bundle is available.
   */
  signRequest(params: { kid: string; actionIpfsId: string }): Promise<{
    requestCanonical: string;
    requestSig: `0x${string}`;
  }>;
  /**
   * Unwrap the Lit ECDH envelope and store the CEK in implementation-internal
   * memory. Never returns the CEK to the caller.
   *
   * - BackendSessionView: stores in a private Node-heap field; accessible only
   *   via the `cekBase64` getter (not part of this interface).
   * - ClientBundleSessionView: throws — the server must not unwrap using a key
   *   it does not hold.
   * - (future) Ddrm WASM path: stores at `session->license->keys[0]` in WASM
   *   linear memory; only consumed by WASM decrypt routines.
   */
  unwrapEnvelope(envelope: Buffer): Promise<void>;
}

/**
 * ISessionView backed by a pre-signed bundle from the client (412 handshake
 * or `/api/storage/lit/secure-view` request body).
 *
 * `signRequest()` returns the bundle's pre-built request — valid within the
 * Lit Action's 60-second `requestedAt` freshness window. Callers must invoke
 * `recoverCEKEnvelope` within a few seconds of receiving the bundle.
 *
 * `unwrapEnvelope()` intentionally throws: the server does not hold the
 * client's private key. Use `BackendSessionView` for the actual ECDH unwrap.
 */
export class ClientBundleSessionView implements ISessionView {
  readonly delegationCanonical: string;
  readonly delegationSig: `0x${string}`;
  readonly keyAlg: { name: string; namedCurve?: string };

  private readonly _requestCanonical: string;
  private readonly _requestSig: `0x${string}`;

  constructor(bundle: SecureViewSessionBundle) {
    this.delegationCanonical = bundle.delegationCanonical;
    this.delegationSig = bundle.delegationSig;
    this._requestCanonical = bundle.requestCanonical;
    this._requestSig = bundle.requestSig;
    this.keyAlg = bundle.keyAlg ?? { name: 'ECDH', namedCurve: 'P-256' };
  }

  async signRequest(_params: { kid: string; actionIpfsId: string }): Promise<{
    requestCanonical: string;
    requestSig: `0x${string}`;
  }> {
    return { requestCanonical: this._requestCanonical, requestSig: this._requestSig };
  }

  async unwrapEnvelope(_envelope: Buffer): Promise<void> {
    throw new Error(
      'ClientBundleSessionView.unwrapEnvelope: the server does not hold the client ' +
      'session private key. Use BackendSessionView.unwrapEnvelope instead.',
    );
  }
}

/**
 * ISessionView backed by a persistent server-side P-256 session.
 *
 * Session lifecycle:
 *   1. `BackendSessionService.createSession()` → generates P-256 keypair, returns delegationCanonical
 *   2. Client wallet `personal_sign(delegationCanonical)` → delegationSig (ownership proof)
 *   3. `BackendSessionService.confirmSession()` → verifies sig, stores session, issues bearer token
 *   4. Subsequent requests: `Authorization: Bearer <token>` → load BackendSessionView → sign + unwrap
 *
 * The P-256 public key is `del.sessionPublicKey`. The Lit Action encrypts the CEK envelope to it.
 * `BackendSessionView` unwraps using the stored private key — no publicKeyHex override needed.
 *
 * Ownership proof chain:
 *   - `delegationCanonical` includes `ownerAddress` + `sessionPublicKey`.
 *   - The wallet signature over it is the binding "owner authorises this session key".
 *   - `BackendSessionService.confirmSession` verifies `ecrecover(delegationSig) === ownerAddress`
 *     before issuing the bearer token; the Lit Action verifies the same check inside the TEE.
 */
export class BackendSessionView implements ISessionView, ICencDecryptor {
  readonly delegationCanonical: string;
  readonly delegationSig: `0x${string}`;
  readonly keyAlg = { name: 'ECDH', namedCurve: 'P-256' } as const;

  private readonly _signingKey: CryptoKey;
  private readonly _ecdhKey: CryptoKey;
  private _cekBase64: string | null = null;

  private constructor(
    delegationCanonical: string,
    delegationSig: `0x${string}`,
    signingKey: CryptoKey,
    ecdhKey: CryptoKey,
  ) {
    this.delegationCanonical = delegationCanonical;
    this.delegationSig = delegationSig;
    this._signingKey = signingKey;
    this._ecdhKey = ecdhKey;
  }

  /**
   * Re-import a stored P-256 session into two WebCrypto keys: one for ECDSA
   * signing (per-asset requests), one for ECDH (envelope unwrap).
   *
   * Uses `privateKeyJwk` directly on Node — the equivalent re-import in any
   * other language is `curve + privateKeyRaw` (32-byte big-endian scalar).
   */
  static async fromStoredSession(session: StoredSession): Promise<BackendSessionView> {
    const { subtle } = globalThis.crypto;
    const jwk = session.privateKeyJwk;
    if ( ! jwk ) {
      // The factory in BackendSessionService routes WASM-backed sessions to
      // WasmSessionView; if we got here without a JWK the caller bypassed
      // the factory and handed us a malformed record.
      throw new Error(
        'BackendSessionView.fromStoredSession: stored session has no privateKeyJwk ' +
        '— this is a WASM-backed session; use WasmSessionView.fromStoredSession instead.',
      );
    }
    const base: JsonWebKey = {
      kty: jwk.kty,
      crv: jwk.crv,
      x: jwk.x,
      y: jwk.y,
      d: jwk.d,
    };
    const signingKey = await subtle.importKey(
      'jwk',
      { ...base, key_ops: ['sign'] },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
    const ecdhKey = await subtle.importKey(
      'jwk',
      { ...base, key_ops: ['deriveKey'] },
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveKey'],
    );
    return new BackendSessionView(
      session.delegationCanonical,
      session.delegationSig as `0x${string}`,
      signingKey,
      ecdhKey,
    );
  }

  async signRequest(params: { kid: string; actionIpfsId: string }): Promise<{
    requestCanonical: string;
    requestSig: `0x${string}`;
  }> {
    const normalizedKid = params.kid.startsWith('0x')
      ? params.kid.toLowerCase()
      : '0x' + params.kid.toLowerCase();
    const req = {
      actionIpfsId: params.actionIpfsId,
      domain: REQUEST_DOMAIN,
      kid: normalizedKid,
      requestNonce: randomHex(8),
      requestedAt: Math.floor(Date.now() / 1000),
    };
    const canonical = canonicalize(req);
    const bytes = new TextEncoder().encode(canonical);
    const sig = await globalThis.crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      this._signingKey,
      bytes,
    );
    return {
      requestCanonical: canonical,
      requestSig: ('0x' + Buffer.from(sig).toString('hex')) as `0x${string}`,
    };
  }

  /** P-256 ECDH unwrap. CEK stored in Node heap only — never returned to callers. */
  async unwrapEnvelope(envelope: Buffer): Promise<void> {
    this._cekBase64 = await unwrapECDHEnvelope(envelope, this._ecdhKey, {
      name: 'ECDH',
      namedCurve: 'P-256',
    });
  }

  /**
   * Only direct exit point for the CEK. Phase-5 will migrate the remaining
   * callers (`media.ts /segment`, `storage.ts renderViaWASM`) to call
   * `decryptSegment` / `decryptAsset` instead so this getter can be deleted.
   * Until then it is the legacy bridge between this view and the existing
   * WASM-runtime / node:crypto invocations in those files.
   */
  get cekBase64(): string {
    if ( ! this._cekBase64 ) {
      throw new Error('BackendSessionView: call unwrapEnvelope() before reading cekBase64');
    }
    return this._cekBase64;
  }

  // ── ICencDecryptor ────────────────────────────────────────────────────────

  /**
   * AES-256-GCM decrypt of a full Chipotle two-layer asset blob. Mirrors the
   * node:crypto fallback in `storage.ts decryptAssetTwoLayer` so a future
   * consumer migration is a one-liner. The CEK is borrowed for the duration
   * of one `createDecipheriv` call and never returned.
   */
  async decryptAsset(ciphertext: Uint8Array, iv: Uint8Array): Promise<Buffer> {
    if ( ! this._cekBase64 ) {
      throw new Error('BackendSessionView.decryptAsset: call unwrapEnvelope() first');
    }
    const cekBytes = Buffer.from(this._cekBase64, 'base64');
    try {
      if (cekBytes.length !== 32) {
        throw new Error(`BackendSessionView.decryptAsset: expected 32-byte CEK, got ${cekBytes.length}`);
      }
      const AUTH_TAG_LEN = 16;
      if (ciphertext.length < AUTH_TAG_LEN) {
        throw new Error('BackendSessionView.decryptAsset: ciphertext shorter than GCM tag');
      }
      const ct = Buffer.from(ciphertext);
      const payload = ct.subarray(0, ct.length - AUTH_TAG_LEN);
      const tag = ct.subarray(ct.length - AUTH_TAG_LEN);

      // Import here to keep this module's top-level import surface narrow.
      const { createDecipheriv } = await import('node:crypto');
      const decipher = createDecipheriv('aes-256-gcm', cekBytes, Buffer.from(iv));
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(payload), decipher.final()]);
      if (plaintext.length === 0) {
        throw new Error('BackendSessionView.decryptAsset: AES-GCM produced empty plaintext');
      }
      return plaintext;
    } finally {
      cekBytes.fill(0);
    }
  }

  /**
   * Not implemented on the JS backend yet — `media.ts /segment` still calls
   * the `decryptSegmentViaWASM` helper directly with `view.cekBase64`.
   * Migration to this method requires threading `WASMRuntime` into the view
   * (constructor injection) and is deferred to Phase 5 of
   * `DDRM-DECRYPT-WASM` so this turn stays additive.
   *
   * The interface declares the method so `WasmSessionView` (Phase 3) can
   * implement it from day one and consumers gain a uniform call shape.
   */
  async decryptSegment(_initSegment: Uint8Array | null, _segment: Uint8Array): Promise<Buffer> {
    throw new Error(
      'BackendSessionView.decryptSegment: not yet wired — use the decryptSegmentViaWASM ' +
      'helper in media.ts for now. Full implementation lands in Phase 5 alongside the ' +
      'WASMRuntime injection.',
    );
  }

  /** Drop the CEK reference. V8 string GC is non-deterministic; treat as a hint. */
  async dispose(): Promise<void> {
    this._cekBase64 = null;
  }
}

/**
 * ISessionView backed by the `ddrm-decrypt` WASM runtime.
 *
 * The P-256 keypair lives entirely in WASM linear memory and is identified by
 * an opaque `wasmHandle: u32`. The CEK (after `unwrapEnvelope`) lives only in
 * the WASM L2 request registry — there is no JS-side cekBase64 anywhere on
 * this class. `decrypt*` methods are the only way to use it; they return
 * plaintext bytes only.
 *
 * Lifecycle parity with `BackendSessionView`:
 *   1. `createSession({ backend: 'wasm' })` → calls `WasmDdrmDecryptRuntime.sessionCreate`,
 *      stores `{ sessionId (uuid), publicKeyHex (decompressed) }` in `FileSessionStore`.
 *   2. Wallet signs the same delegation canonical JSON (the signed payload also
 *      includes `backend: 'wasm'` so an attacker cannot downgrade by stripping it).
 *   3. `confirmSession` issues a bearer token as today.
 *   4. Subsequent requests → middleware calls `WasmSessionView.fromStoredSession`,
 *      which uses `wasm.session_lookup(sessionId)`. If the lookup returns null
 *      (process restart since session creation), the middleware emits
 *      `session_token_invalid` and the client re-bootstraps.
 *
 * Failure mode: if the WASM runtime fails to load or traps mid-call, the
 * caller sees a `DdrmDecryptError`. The runtime singleton attempts one
 * auto-reload on a trap; a second trap exits the process.
 */
export class WasmSessionView implements ISessionView, ICencDecryptor {
  readonly delegationCanonical: string;
  readonly delegationSig: `0x${string}`;
  readonly keyAlg = { name: 'ECDH', namedCurve: 'P-256' } as const;
  /** UUID — `BackendSessionService.StoredSession.id` for WASM-backed sessions. */
  readonly sessionId: string;
  /** Decompressed `0x04||X||Y` — same shape as `BackendSessionView`'s publicKeyHex. */
  readonly publicKeyHex: string;

  /** WASM-side session handle, cached for the lifetime of this view. */
  private readonly _wasmHandle: number;
  /** WASM-side L2 request handle, set by `unwrapEnvelope`. */
  private _requestHandle: number | null = null;

  /**
   * The WASM L2 request handle from `unwrapEnvelope`, exposed for callers
   * that need to persist it across HTTP requests (e.g. `MediaSession`
   * holds it for the duration of playback so subsequent `/segment` calls
   * can decrypt without re-running the Lit action). Returns `null` until
   * `unwrapEnvelope()` has been called.
   *
   * The handle itself is opaque — it cannot be used to read the CEK; it
   * is only valid as the first argument to `request_decrypt_*` calls on
   * the same `WasmDdrmDecryptRuntime` instance.
   */
  get requestHandle(): number | null {
    return this._requestHandle;
  }

  /**
   * Attach an existing WASM L2 request handle to this view, skipping the
   * Lit-action call and `unwrapEnvelope`. Used by the JS-side cache in
   * `storage.ts recoverWithSession` so multi-page PDFs / EPUBs decrypting
   * the same content via the same session don't re-run the Lit action on
   * every page. The handle must come from a prior `unwrapEnvelope()` call
   * on the same WASM session and still be inside its L2 TTL (2h default).
   *
   * If the handle has expired by the time `decryptAsset` / `decryptSegment`
   * is called, the underlying WASM call will return `RequestExpired` and
   * the caller should retry by re-running the Lit action.
   */
  attachRequestHandle(handle: number): void {
    this._requestHandle = handle;
  }

  private constructor(
    delegationCanonical: string,
    delegationSig: `0x${string}`,
    sessionId: string,
    publicKeyHex: string,
    wasmHandle: number,
  ) {
    this.delegationCanonical = delegationCanonical;
    this.delegationSig = delegationSig;
    this.sessionId = sessionId;
    this.publicKeyHex = publicKeyHex;
    this._wasmHandle = wasmHandle;
  }

  /**
   * Create a fresh P-256 session inside WASM. Returns the new view plus the
   * `sessionId` (UUID) and the `publicKeyHex` (decompressed 65-byte hex with
   * `0x04` prefix) that `BackendSessionService` needs to persist.
   *
   * `delegationCanonical` + `delegationSig` are filled in by
   * `BackendSessionService.confirmSession` after the wallet signs.
   */
  static async createNew(): Promise<{
    sessionId: string;
    publicKeyHex: string;
    wasmHandle: number;
  }> {
    const { WasmDdrmDecryptRuntime } = await import('../services/wasm/WasmDdrmDecryptRuntime.js');
    const rt = WasmDdrmDecryptRuntime.get();
    const { handle, sessionId, publicKey } = await rt.sessionCreate();
    const uncompressed = decompressP256Point(new Uint8Array(publicKey));
    const publicKeyHex = '0x' + Buffer.from(uncompressed).toString('hex');
    return { sessionId, publicKeyHex, wasmHandle: handle };
  }

  /**
   * Resurrect a view from a stored record. Returns `null` when the WASM
   * runtime no longer has the session (typically a process restart between
   * session creation and request).
   */
  static async fromStoredSession(session: StoredSession): Promise<WasmSessionView | null> {
    if (session.backend !== 'wasm') {
      throw new Error('WasmSessionView.fromStoredSession: stored session has wrong backend');
    }
    const { WasmDdrmDecryptRuntime } = await import('../services/wasm/WasmDdrmDecryptRuntime.js');
    const rt = WasmDdrmDecryptRuntime.get();
    const handle = await rt.sessionLookup(session.id);
    if (handle === null) return null;
    return new WasmSessionView(
      session.delegationCanonical,
      session.delegationSig as `0x${string}`,
      session.id,
      session.publicKeyHex,
      handle,
    );
  }

  /** ECDSA-P256 sign via WASM. Returns canonical request JSON + DER hex signature. */
  async signRequest(params: { kid: string; actionIpfsId: string }): Promise<{
    requestCanonical: string;
    requestSig: `0x${string}`;
  }> {
    const { WasmDdrmDecryptRuntime } = await import('../services/wasm/WasmDdrmDecryptRuntime.js');
    const rt = WasmDdrmDecryptRuntime.get();

    const normalizedKid = params.kid.startsWith('0x')
      ? params.kid.toLowerCase()
      : '0x' + params.kid.toLowerCase();
    const req = {
      actionIpfsId: params.actionIpfsId,
      domain: REQUEST_DOMAIN,
      kid: normalizedKid,
      requestNonce: randomHex(8),
      requestedAt: Math.floor(Date.now() / 1000),
    };
    const canonical = canonicalize(req);
    const bytes = new TextEncoder().encode(canonical);
    const sig = await rt.sessionSign(this._wasmHandle, bytes);
    return {
      requestCanonical: canonical,
      requestSig: ('0x' + Buffer.from(sig).toString('hex')) as `0x${string}`,
    };
  }

  /** ECDH unwrap inside WASM. Stores the resulting CEK in L2 keyed by the returned request handle. */
  async unwrapEnvelope(envelope: Buffer): Promise<void> {
    const { WasmDdrmDecryptRuntime } = await import('../services/wasm/WasmDdrmDecryptRuntime.js');
    const rt = WasmDdrmDecryptRuntime.get();
    this._requestHandle = await rt.sessionUnwrapEnvelope(this._wasmHandle, new Uint8Array(envelope));
  }

  async decryptAsset(ciphertext: Uint8Array, iv: Uint8Array): Promise<Buffer> {
    if ( this._requestHandle === null ) {
      throw new Error('WasmSessionView.decryptAsset: call unwrapEnvelope() first');
    }
    const { WasmDdrmDecryptRuntime } = await import('../services/wasm/WasmDdrmDecryptRuntime.js');
    return WasmDdrmDecryptRuntime.get().requestDecryptAsset(this._requestHandle, iv, ciphertext);
  }

  async decryptSegment(initSegment: Uint8Array | null, segment: Uint8Array): Promise<Buffer> {
    if ( this._requestHandle === null ) {
      throw new Error('WasmSessionView.decryptSegment: call unwrapEnvelope() first');
    }
    const { WasmDdrmDecryptRuntime } = await import('../services/wasm/WasmDdrmDecryptRuntime.js');
    return WasmDdrmDecryptRuntime.get().requestDecryptSegment(
      this._requestHandle,
      initSegment,
      segment,
      true,
    );
  }

  /** Drop the L2 request (zeroes the CEK in WASM). The L1 session stays alive until token expiry. */
  async dispose(): Promise<void> {
    if ( this._requestHandle === null ) return;
    const { WasmDdrmDecryptRuntime } = await import('../services/wasm/WasmDdrmDecryptRuntime.js');
    await WasmDdrmDecryptRuntime.get().requestDrop(this._requestHandle);
    this._requestHandle = null;
  }
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
export function canonicalize(value: unknown): string {
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
 * Throws if `cid` is not an allowlisted decrypt Lit Action. The allowlist is
 * the current production CID (`getActionCid()`), the hardcoded fallback
 * (`UNIVERSAL_DECRYPT_CID`), and the known-good legacy CIDs. Callers pass a
 * client-influenced `actionCid`; without this gate an arbitrary CID could
 * select a Lit Action that skips the kid↔ciphertext binding or access checks.
 */
function assertAllowedDecryptCid(cid: string): void {
  if (
    cid === getActionCid() ||
    cid === UNIVERSAL_DECRYPT_CID ||
    LEGACY_DECRYPT_ACTION_CIDS.has(cid)
  ) {
    return;
  }
  throw new Error(`Rejected non-allowlisted decrypt actionCid: ${cid}`);
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

  if (status === 200 && typeof json === 'object') {
    // extract response
    // treat on-purpose response emitted by the implementation
    // HTTP response here is 200 but the content of the json is an error we need to decode
    // has_error and logs here are useless
    const { response: jsonResponse } = json || {};
    if (jsonResponse?.error) {
      throw new ChipotleError(
        (`Lit Execution Error: ${jsonResponse?.error} (code=${jsonResponse?.code}) ${jsonResponse?.detail || ''}`).trim(),
        403,
        json,
      );      
    }
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
 * Execute the Lit Action decrypt and return the raw ECDH envelope `Buffer`.
 *
 * The Lit Action encrypts the envelope to `del.sessionPublicKey` (the
 * backend session's P-256 public key). The caller must then call
 * `session.unwrapEnvelope(envelope)` to store the CEK internally, then
 * read `(session as BackendSessionView).cekBase64`.
 *
 * The CEK is NEVER present in the return value of this function. Legacy
 * Lit Actions returned plaintext CEK ≤ 32 bytes wrapped as a short buffer;
 * callers detect this via `envelope.length <= 32` and treat the buffer
 * itself as the CEK bytes rather than calling `unwrapEnvelope`.
 */
export async function recoverCEKEnvelope(
  params: {
    litCiphertext: string;
    dataToEncryptHash: string;
    kid: string;
    actionCid?: string;
    authority?: string;
    chain?: string;
    chainId?: number;
    rpc?: string;
    signature?: string;
    issuer?: string;
  },
  session: ISessionView,
  config?: ChipotleConfig,
): Promise<Buffer> {
  const __metricStart = Date.now();

  try {
    let effectiveCid = params.actionCid || UNIVERSAL_DECRYPT_CID;
    assertAllowedDecryptCid(effectiveCid);
    effectiveCid = LEGACY_DECRYPT_ACTION_REMAP[effectiveCid] || effectiveCid;
    const effectiveChainId = params.chainId || DEFAULT_CHAIN_ID;
    const normalizedKid = params.kid.startsWith('0x')
      ? params.kid.toLowerCase()
      : '0x' + params.kid.toLowerCase();

    // Build + sign the per-asset request bundle. For BackendSessionView this
    // produces a fresh ECDSA-signed request; for ClientBundleSessionView this
    // returns the pre-signed bundle from the client.
    const { requestCanonical, requestSig } = await session.signRequest({
      kid: normalizedKid,
      actionIpfsId: effectiveCid,
    });

    const code = await fetchLitActionCode(effectiveCid);
    const pkpId = resolvePkpId(config);

    // The Lit Action uses `del.sessionPublicKey` as the ECDH target — no
    // `publicKey` override needed. `del.sessionPublicKey` IS the backend
    // session's P-256 public key (set at createSession).
    const jsParams: Record<string, unknown> = {
      keyAlg: session.keyAlg,
      ciphertext: params.litCiphertext,
      dataToEncryptHash: params.dataToEncryptHash,
      kid: normalizedKid,
      pkpId,
      actionIpfsId: effectiveCid,
      authority: params.authority || DEFAULT_AUTHORITY,
      chain: params.chain || DEFAULT_CHAIN,
      chainId: effectiveChainId,
      rpc: params.rpc || getBaseRpcUrl(),
      delegation: session.delegationCanonical,
      delegationSig: session.delegationSig,
      request: requestCanonical,
      requestSig,
    };
    if (params.signature) jsParams.signature = params.signature;
    if (params.issuer) jsParams.issuer = params.issuer;

    logger.info(`[Chipotle] recoverCEKEnvelope via ${effectiveCid}, kid=${params.kid}`);
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
    const envelope = Buffer.from(dataB64, 'base64');

    logger.info(`[Chipotle] CEK envelope received (${envelope.length} bytes)`);
    recordMetricCounter(undefined, 'chipotle.cek_recovery', 1, { kind: 'envelope', outcome: 'success' });
    recordMetricHistogram(undefined, 'chipotle.cek_recovery_ms', Date.now() - __metricStart, { kind: 'envelope', outcome: 'success' });
    return envelope;
  } catch (err) {
    const reason = classifyChipotleError(err);
    recordMetricCounter(undefined, 'chipotle.cek_recovery', 1, { kind: 'envelope', outcome: 'failure', reason });
    recordMetricHistogram(undefined, 'chipotle.cek_recovery_ms', Date.now() - __metricStart, { kind: 'envelope', outcome: 'failure' });
    throw err;
  }
}

// ── ECDH Envelope Unwrapping ─────────────────────────────────────────────────
// Shared by both media and non-media decrypt paths. Extracted from media.ts.

/**
 * Unwrap an ECDH-wrapped license envelope from the Lit Action.
 *
 * Two wire-format versions are supported (byte 3 of the header is the version flag):
 *
 *   v2 (flag = 0x02) — legacy, fixed IV:
 *     HEADER(4) | pkLen(2) + pk(33) | sigLen(2) + sig(65) + signer(33) | bodyLen(4) + body
 *     IV = first 16 bytes of the session public key (predictable, fixed per session)
 *
 *   v3 (flag = 0x03) — random IV:
 *     HEADER(4) | pkLen(2) + pk(33) | iv(16) | sigLen(2) + sig(65) + signer(33) | bodyLen(4) + body
 *     IV = random 16 bytes generated by the Lit Action and embedded in the envelope
 */
export async function unwrapECDHEnvelope(
  envelope: Buffer,
  privateKey: CryptoKey,
  keyAlg: { name: string; namedCurve: string },
): Promise<string> {
  const { subtle } = globalThis.crypto;
  const version = envelope[3]; // 0x02 = legacy fixed-IV, 0x03 = random IV
  let offset = 4; // skip header (3 bytes format + 1 byte flag)

  // Read ephemeral public key
  const ephPubKeyLen = (envelope[offset] << 8) | envelope[offset + 1];
  offset += 2;
  const ephPubKeyRaw = envelope.subarray(offset, offset + ephPubKeyLen);
  offset += ephPubKeyLen;

  // Read AES-CBC IV: v3 embeds it in the envelope; v2 derives it from the ephemeral pubkey
  let iv: Uint8Array;
  if (version === 0x03) {
    iv = envelope.subarray(offset, offset + 16);
    offset += 16;
  } else {
    iv = new Uint8Array(ephPubKeyRaw.subarray(0, 16));
  }

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

  logger.info(`[Chipotle] Envelope: ephPubKey=${ephPubKeyLen}B, iv=16B, sig=${sigLen}B, encCEK=${encCekLen}B`);

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
