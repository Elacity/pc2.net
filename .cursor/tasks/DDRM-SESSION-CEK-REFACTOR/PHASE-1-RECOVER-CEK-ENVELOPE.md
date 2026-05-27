# Phase 1: Server — `recoverCEKEnvelope` + `ISessionView` + `BackendSessionService`

**Status**: Not started
**Estimated effort**: ~4 hours
**Files**: `chipotle-client.ts`, `media.ts`, `storage.ts`, `src/services/session/BackendSessionService.ts` (new)

---

## Context

Four changes in one phase:

1. Add the `ISessionView` abstraction + concrete implementations (`BackendSessionView`, `ClientBundleSessionView`).
2. Add `BackendSessionService` — manages persistent P-256 sessions on the server filesystem.
3. Rename `recoverCEKWithServerSession` → `recoverCEKEnvelope`, take `ISessionView`, return `Buffer`.
4. Delete the dead `recoverMediaCEKEnvelope` and wire both callers to the new function.

**Architecture shift**: Session keypairs are now generated and stored server-side (P-256, Node.js crypto).
The client never holds key material — only an opaque bearer token. The Lit Action encrypts the CEK
envelope to `del.sessionPublicKey` which IS the backend session key, so no override mechanism is needed.

Future: ddrm WASM will gain P-256 support, enabling a browser to resume a server-generated P-256 session
client-side (out of scope for this refactor — noted in PHASE-2).

---

## Implementation

### 1. `chipotle-client.ts` — add `ISessionView` interface

Add immediately after the `SecureViewSessionBundle` interface (line ~171):

```typescript
/**
 * Abstraction over a secure-view session for CEK envelope recovery.
 *
 * Implementations:
 *   - ClientBundleSessionView  — wraps a client-provided {delegation, request} bundle.
 *   - ServerEphemeralSessionView — server-owned P-256 ephemeral keypair; CEK stays in Node memory.
 */
export interface ISessionView {
  /** Canonical delegation JSON (sorted keys, no whitespace), wallet-signed. */
  readonly delegationCanonical: string;
  readonly delegationSig: `0x${string}`;
  /** ECDH algorithm forwarded to the Lit Action as jsParams.keyAlg. */
  readonly keyAlg: { name: string; namedCurve?: string };
  /**
   * Build + sign a per-asset request. Must use fresh nonce + requestedAt.
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
   * - Client (ddrm WASM): stores at session->license->keys[0] in WASM linear memory.
   * - Server (ServerEphemeralSessionView): stores in a private Node-heap field;
   *   accessible only via ServerEphemeralSessionView.cekBase64 (not part of this interface).
   * - ClientBundleSessionView: throws — the server must not unwrap using a key
   *   it does not hold. Use ServerEphemeralSessionView alongside this.
   *
   * Future: ISessionView will gain decrypt methods that consume the stored CEK
   * (e.g. decryptMedia / decryptContent). Shape TBD — needs further analysis
   * to determine whether media and non-media paths share an API.
   */
  unwrapEnvelope(envelope: Buffer): Promise<void>;
}
```

Also add `keyAlg?` to `SecureViewSessionBundle` (line ~166):

```typescript
export interface SecureViewSessionBundle {
  delegationCanonical: string;
  delegationSig: `0x${string}`;
  requestCanonical: string;
  requestSig: `0x${string}`;
  /** ECDH algorithm the client session key supports. Defaults to P-256 if absent. */
  keyAlg?: { name: string; namedCurve?: string };
}
```

---

### 2. `chipotle-client.ts` — add `ClientBundleSessionView`

Add after `ISessionView`:

```typescript
/**
 * ISessionView backed by a pre-signed bundle from the client (412 handshake
 * or /api/storage/lit/secure-view request body).
 *
 * signRequest() returns the bundle's pre-built request — valid within the Lit
 * Action's 60-second requestedAt freshness window. Callers must invoke
 * recoverCEKEnvelope within a few seconds of receiving the bundle.
 *
 * unwrapEnvelope() intentionally throws: the server must not unwrap using the
 * client's private key (it doesn't have it). Use ServerEphemeralSessionView
 * alongside this for the actual ECDH unwrap.
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

  async signRequest(_params: { kid: string; actionIpfsId: string }) {
    return { requestCanonical: this._requestCanonical, requestSig: this._requestSig };
  }

  async unwrapEnvelope(_envelope: Buffer): Promise<void> {
    throw new Error(
      'ClientBundleSessionView.unwrapEnvelope: the server does not hold the client ' +
      'session private key. Use ServerEphemeralSessionView.unwrapEnvelope instead.',
    );
  }
}
```

---

### 3. `chipotle-client.ts` — add `BackendSessionView`

Add after `ClientBundleSessionView`. This replaces `ServerEphemeralSessionView`.

**Ownership proof**: the session delegation is signed by the user's wallet (`personal_sign` over
`delegationCanonical`). The wallet signature establishes: "I, wallet `ownerAddress`, authorize session
key `sessionPublicKey`." `BackendSessionService.confirmSession()` verifies
`ecrecover(delegationSig) === session.ownerAddress` before issuing the bearer token. The Lit Action
performs the same check independently. The bearer token is a server-side lookup convenience; the
cryptographic ground truth is always the wallet signature.

```typescript
/**
 * ISessionView backed by a persistent server-side P-256 session.
 *
 * Session lifecycle:
 *   1. BackendSessionService.createSession()  → generates P-256 keypair, returns delegationCanonical
 *   2. Client wallet personal_sign(delegationCanonical) → delegationSig (ownership proof)
 *   3. BackendSessionService.confirmSession() → verifies sig, stores session, issues bearer token
 *   4. Subsequent requests: Authorization: Bearer <token> → load BackendSessionView → sign + unwrap
 *
 * The P-256 public key is del.sessionPublicKey. The Lit Action encrypts the CEK envelope to it.
 * BackendSessionView unwraps using the stored private key — no publicKeyHex override needed.
 *
 * Future: ddrm WASM will gain P-256 support so a browser can resume a server-generated P-256
 * session client-side (out of scope for this phase).
 */
export class BackendSessionView implements ISessionView {
  readonly delegationCanonical: string;
  readonly delegationSig: `0x${string}`;
  readonly keyAlg = { name: 'ECDH', namedCurve: 'P-256' } as const;

  private readonly _signingKey: CryptoKey;  // P-256 ECDSA — signs per-asset requests
  private readonly _ecdhKey: CryptoKey;      // P-256 ECDH  — unwraps CEK envelope
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

  static async fromStoredSession(session: StoredSession): Promise<BackendSessionView> {
    const { subtle } = globalThis.crypto;
    // Node.js path: re-import from JWK (fast, no scalar arithmetic).
    // Other-language path: use session.curve + session.privateKeyRaw (32-byte big-endian hex scalar).
    // Strip usage fields from stored JWK before re-importing with specific usage.
    const base = { kty: session.privateKeyJwk.kty, crv: session.privateKeyJwk.crv,
                   x: session.privateKeyJwk.x, y: session.privateKeyJwk.y, d: session.privateKeyJwk.d };
    const signingKey = await subtle.importKey(
      'jwk', { ...base, key_ops: ['sign'] },
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
    );
    const ecdhKey = await subtle.importKey(
      'jwk', { ...base, key_ops: ['deriveKey'] },
      { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey'],
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
    const req = {
      actionIpfsId: params.actionIpfsId,
      domain: REQUEST_DOMAIN,
      kid: params.kid.startsWith('0x') ? params.kid.toLowerCase() : '0x' + params.kid.toLowerCase(),
      requestNonce: randomHex(8),
      requestedAt: Math.floor(Date.now() / 1000),
    };
    const canonical = canonicalize(req);
    const bytes = new TextEncoder().encode(canonical);
    const sig = await globalThis.crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' }, this._signingKey, bytes,
    );
    return {
      requestCanonical: canonical,
      requestSig: ('0x' + Buffer.from(sig).toString('hex')) as `0x${string}`,
    };
  }

  /** P-256 ECDH unwrap. CEK stored in Node heap only — never returned to callers. */
  async unwrapEnvelope(envelope: Buffer): Promise<void> {
    this._cekBase64 = await unwrapECDHEnvelope(envelope, this._ecdhKey, { name: 'ECDH', namedCurve: 'P-256' });
  }

  /** Only exit point for the CEK. Write directly to MediaSession.cekBase64; do not log. */
  get cekBase64(): string {
    if (!this._cekBase64) throw new Error('BackendSessionView: call unwrapEnvelope() before reading cekBase64');
    return this._cekBase64;
  }
}
```

---

### 4. `src/services/session/BackendSessionService.ts` — new file

Manages session lifecycle: generate → wallet-sign (client) → confirm → use → renew.

Sessions are held in process heap by default. Callers that need durability (server restarts, multi-process
deployments) supply a custom `ISessionStore`. The `StoredSession` structure is fully serializable — its
`curve + privateKeyRaw` fields let any language reconstruct the keypair from whatever persistence layer
the application uses.

```typescript
import { randomBytes } from 'node:crypto';
import { ethers } from 'ethers';

// ── Storage interface ─────────────────────────────────────────────────────────

/**
 * Pluggable session store. The default implementation is InMemorySessionStore.
 * Implement this to persist sessions to a database, Redis, or the filesystem.
 */
export interface ISessionStore {
  get(id: string): StoredSession | null;
  set(session: StoredSession): void;
  /** Return an active (confirmed + not expired) session for the given token, or null. */
  getByToken(token: string): StoredSession | null;
  /** Return all stored sessions — used for bulk export / persistence. */
  all(): StoredSession[];
}

/**
 * Default in-memory store. Two Maps: sessions by ID and a token→ID index
 * for O(1) token lookup. Private key material lives only in process heap.
 */
export class InMemorySessionStore implements ISessionStore {
  private readonly _sessions = new Map<string, StoredSession>();
  private readonly _tokenIdx = new Map<string, string>(); // bearer token → session id

  get(id: string): StoredSession | null {
    return this._sessions.get(id) ?? null;
  }

  set(session: StoredSession): void {
    // Keep token index consistent: remove the old token if it changed.
    const prev = this._sessions.get(session.id);
    if (prev?.token && prev.token !== session.token) {
      this._tokenIdx.delete(prev.token);
    }
    this._sessions.set(session.id, session);
    if (session.token) this._tokenIdx.set(session.token, session.id);
  }

  getByToken(token: string): StoredSession | null {
    const id = this._tokenIdx.get(token);
    if (!id) return null;
    const s = this._sessions.get(id);
    if (!s || !s.delegationSig || s.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return s;
  }

  all(): StoredSession[] {
    return Array.from(this._sessions.values());
  }
}

// ── StoredSession ─────────────────────────────────────────────────────────────

export interface StoredSession {
  id: string;              // = publicKeyHex (P-256 uncompressed 0x04||X||Y, 65 bytes)
  curve: string;           // explicit curve identifier — 'P-256'; allows any language to resurrect
  publicKeyHex: string;    // 65-byte uncompressed point hex (0x04||X||Y)
  privateKeyJwk: JsonWebKey; // Node.js WebCrypto convenience format
  privateKeyRaw: string;   // 32-byte big-endian private scalar, hex (no 0x prefix) — language-agnostic
  ownerAddress: string;    // checksummed — from PC2 auth context, never from request body
  token: string;           // opaque bearer token (32 random bytes hex); '' until confirmed
  delegationCanonical: string; // canonical delegation JSON; set at createSession
  delegationSig: string;       // wallet personal_sign over delegationCanonical; '' until confirmed
  createdAt: number;       // unix seconds
  expiresAt: number;       // unix seconds — matches delegation.expiresAt
}

// ── Service ───────────────────────────────────────────────────────────────────

export class BackendSessionService {
  private readonly store: ISessionStore;

  /**
   * @param store  Storage backend. Defaults to InMemorySessionStore (process heap).
   *               Pass a custom ISessionStore for filesystem, Redis, or DB persistence.
   */
  constructor(store: ISessionStore = new InMemorySessionStore()) {
    this.store = store;
  }

  /**
   * Step 1 — generate P-256 keypair + delegation payload.
   *
   * The returned delegationCanonical must be signed by the user's wallet (personal_sign)
   * and the sig submitted to confirmSession(). The wallet signature is the cryptographic
   * proof that ownerAddress authorises sessionPublicKey — the same check the Lit Action runs.
   *
   * ownerAddress comes from the authenticated request context (PC2 auth middleware), not
   * from the request body. The server knows who is asking.
   */
  async createSession(params: {
    ownerAddress: string;
    chainId: number;
    ttlSeconds?: number;
  }): Promise<{ sessionId: string; delegationCanonical: string }> {
    const { subtle } = globalThis.crypto;

    const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const rawPub = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
    const publicKeyHex = '0x' + Buffer.from(rawPub).toString('hex');
    const privateKeyJwk = await subtle.exportKey('jwk', kp.privateKey);
    // d is base64url big-endian 32-byte scalar — hex for language-agnostic portability.
    const privateKeyRaw = Buffer.from(privateKeyJwk.d as string, 'base64url').toString('hex');

    const nowSec = Math.floor(Date.now() / 1000);
    const ttl = Math.min(params.ttlSeconds ?? MAX_DELEGATION_TTL_SECONDS, MAX_DELEGATION_TTL_SECONDS);
    const delegation = {
      chainId: params.chainId,
      domain: DELEGATION_DOMAIN,
      expiresAt: nowSec + ttl,
      issuedAt: nowSec,
      nonce: '0x' + randomBytes(16).toString('hex'),
      ownerAddress: ethers.utils.getAddress(params.ownerAddress),
      sessionPublicKey: publicKeyHex,
    };
    const delegationCanonical = canonicalize(delegation);

    this.store.set({
      id: publicKeyHex, curve: 'P-256', publicKeyHex, privateKeyJwk, privateKeyRaw,
      ownerAddress: delegation.ownerAddress,
      token: '', delegationCanonical, delegationSig: '',
      createdAt: nowSec, expiresAt: delegation.expiresAt,
    });
    return { sessionId: publicKeyHex, delegationCanonical };
  }

  /**
   * Step 2 — verify wallet signature, issue opaque bearer token.
   *
   * ecrecover(delegationSig, delegationCanonical) must equal session.ownerAddress.
   * This mirrors the Lit Action's own check — only the wallet that signed the delegation
   * can activate it.
   */
  confirmSession(params: {
    sessionId: string;
    delegationSig: string;
  }): { token: string; expiresAt: number } {
    const session = this.store.get(params.sessionId);
    if (!session) throw Object.assign(new Error('Session not found'), { statusCode: 404 });

    const recovered = ethers.utils.verifyMessage(session.delegationCanonical, params.delegationSig);
    if (recovered.toLowerCase() !== session.ownerAddress.toLowerCase()) {
      throw Object.assign(new Error('delegationSig signer does not match ownerAddress'), { statusCode: 403 });
    }
    const token = randomBytes(32).toString('hex');
    this.store.set({ ...session, token, delegationSig: params.delegationSig });
    return { token, expiresAt: session.expiresAt };
  }

  /**
   * Renew — same P-256 keypair, fresh delegation (new timestamps + nonce), new wallet sig required.
   * Call after delegation expiry; avoids generating a new keypair and keeps session continuity.
   */
  async renewSession(params: {
    sessionId: string;
    ownerAddress: string;
    chainId: number;
    ttlSeconds?: number;
  }): Promise<{ delegationCanonical: string }> {
    const session = this.store.get(params.sessionId);
    if (!session) throw Object.assign(new Error('Session not found'), { statusCode: 404 });
    if (session.ownerAddress.toLowerCase() !== params.ownerAddress.toLowerCase()) {
      throw Object.assign(new Error('ownerAddress mismatch — only original wallet can renew'), { statusCode: 403 });
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const ttl = Math.min(params.ttlSeconds ?? MAX_DELEGATION_TTL_SECONDS, MAX_DELEGATION_TTL_SECONDS);
    const delegation = {
      chainId: params.chainId,
      domain: DELEGATION_DOMAIN,
      expiresAt: nowSec + ttl,
      issuedAt: nowSec,
      nonce: '0x' + randomBytes(16).toString('hex'),
      ownerAddress: session.ownerAddress,
      sessionPublicKey: session.publicKeyHex,   // same key — only timestamps + nonce change
    };
    const delegationCanonical = canonicalize(delegation);
    // Reset token and sig — caller must confirmSession() with the new wallet sig.
    this.store.set({ ...session, delegationCanonical, delegationSig: '', token: '',
                     expiresAt: delegation.expiresAt });
    return { delegationCanonical };
  }

  /** Return an active (confirmed + not expired) session for the given bearer token. */
  getSessionByToken(token: string): StoredSession | null {
    return this.store.getByToken(token);
  }

  getSessionById(id: string): StoredSession | null {
    return this.store.get(id);
  }

  /**
   * Import a previously exported StoredSession into this store.
   * Use on startup to restore sessions from an external persistence layer.
   * Callers are responsible for validating expiry before importing.
   */
  importSession(session: StoredSession): void {
    this.store.set(session);
  }

  /**
   * Export all sessions as plain serializable objects.
   * Use to snapshot the store to an external persistence layer
   * (database, filesystem, Redis). The exported records can be
   * re-imported via importSession() on the next startup.
   */
  exportAll(): StoredSession[] {
    return this.store.all();
  }
}

// Module-level default instance — in-memory, suitable for most deployments.
// Replace with `new BackendSessionService(customStore)` where needed.
export const sessionService = new BackendSessionService();
```

---

### 4. `chipotle-client.ts` — rename + refactor `recoverCEKWithServerSession` → `recoverCEKEnvelope`

Replace the entire function (lines ~986–1123) with:

```typescript
/**
 * Execute the Lit Action decrypt and return the raw ECDH envelope Buffer.
 *
 * The Lit Action encrypts the envelope to del.sessionPublicKey (the backend session's
 * P-256 public key). The caller must then call session.unwrapEnvelope(envelope) to
 * store the CEK internally, then read (session as BackendSessionView).cekBase64.
 *
 * The CEK is NEVER present in the return value of this function.
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
    const effectiveCid = params.actionCid || UNIVERSAL_DECRYPT_CID;
    assertAllowedDecryptCid(effectiveCid);
    const effectiveChainId = params.chainId || DEFAULT_CHAIN_ID;
    const normalizedKid = params.kid.startsWith('0x')
      ? params.kid.toLowerCase()
      : '0x' + params.kid.toLowerCase();

    // Build + sign the per-asset request bundle (signed by session's P-256 key server-side).
    const { requestCanonical, requestSig } = await session.signRequest({
      kid: normalizedKid,
      actionIpfsId: effectiveCid,
    });

    const code = await fetchLitActionCode(effectiveCid);
    const pkpId = resolvePkpId(config);

    // The Lit Action uses del.sessionPublicKey as the ECDH target — no publicKey override needed.
    // del.sessionPublicKey IS the backend session's P-256 public key (set at createSession).
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

    // Legacy short payload: the old Lit Actions returned plaintext CEK ≤ 32 bytes.
    // Wrap it in a trivial buffer so callers can detect it with envelope.length ≤ 32.
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
```

---

### 5. `chipotle-client.ts` — delete `recoverMediaCEKEnvelope`

Verify no callers exist first:

```bash
grep -rn "recoverMediaCEKEnvelope" /Users/maciz/www/pc2.net/pc2-node/src/ /Users/maciz/www/pc2.net/packages/
```

Expected: zero results. Then delete lines ~783–832 (the entire function + its JSDoc).

---

### 6. `media.ts` — load `BackendSessionView` from Authorization header

**Current problem**: `recoverMediaCEK` calls `recoverCEKWithServerSession` with a random-wallet session.

**Fix**: extract the bearer token from `Authorization: Bearer <token>`, load the backend session, and
pass it directly. The backend session's P-256 key is already in `del.sessionPublicKey`, so the Lit
Action encrypts the envelope to the right key automatically.

```typescript
async function recoverMediaCEK(
  litParams: {
    litCiphertext: string;
    dataToEncryptHash: string;
    kid: string;
    actionCid: string;
    authority: string;
    chain: string;
    chainId: number;
    rpc: string;
    litBackend: string;
    issuer?: string;
    signature?: string;
  },
  authToken: string,   // extracted from Authorization: Bearer <token>
): Promise<string> {
  const { recoverCEKEnvelope, BackendSessionView } = await import('./chipotle-client.js');
  const { sessionService } = await import('../services/session/BackendSessionService.js');

  const stored = sessionService.getSessionByToken(authToken);
  if (!stored) throw Object.assign(new Error('Invalid or expired session token'), { statusCode: 401 });

  const session = await BackendSessionView.fromStoredSession(stored);

  const envelope = await recoverCEKEnvelope(
    {
      litCiphertext: litParams.litCiphertext,
      dataToEncryptHash: litParams.dataToEncryptHash,
      kid: litParams.kid,
      actionCid: litParams.actionCid,
      authority: litParams.authority,
      chain: litParams.chain,
      chainId: litParams.chainId,
      rpc: litParams.rpc,
      issuer: litParams.issuer,
      signature: litParams.signature,
    },
    session,
  );

  // Legacy short payload: plaintext CEK returned as-is.
  if (envelope.length <= 32) {
    logger.info(`[Media] Legacy plaintext CEK (${envelope.length} bytes) — returning as-is`);
    return envelope.toString('base64');
  }

  await session.unwrapEnvelope(envelope);
  // CEK in session._cekBase64 (Node heap only). Do not log or forward it.
  return session.cekBase64;
}
```

In the `/api/media/init` handler: extract `Authorization` header → pass token to `recoverMediaCEK`.
Return 401 if header is absent or malformed. Remove the 412 "provide session bundle" path.

---

### 7. `storage.ts` — replace server-session call in `recoverCEKAndFetchData`

Same pattern as `media.ts`: load `BackendSessionView` from the bearer token.

Locate the call at line ~1918 and replace with:

```typescript
const { recoverCEKEnvelope, BackendSessionView } = await import('./chipotle-client.js');
const { sessionService } = await import('../services/session/BackendSessionService.js');

const authToken = params.authToken; // extracted from Authorization header by the route handler
const stored = sessionService.getSessionByToken(authToken);
if (!stored) {
  throw Object.assign(new Error('Invalid or expired session token'), { statusCode: 401 });
}

const session = await BackendSessionView.fromStoredSession(stored);

const envelope = await recoverCEKEnvelope(
  {
    litCiphertext: params.litCiphertext ?? params.ciphertext,
    dataToEncryptHash: params.dataToEncryptHash,
    kid: params.kid,
    actionCid: effectiveCid,
    authority: effectiveAuthority,
    chain: effectiveChain,
    chainId: effectiveChainId,
    rpc: effectiveRpc,
    issuer: params.issuer,
    signature: params.signature,
  },
  session,
);

let cekBase64: string;
if (envelope.length <= 32) {
  cekBase64 = envelope.toString('base64');
} else {
  await session.unwrapEnvelope(envelope);
  cekBase64 = session.cekBase64;
}
```

---

### 8. `storage.ts` — rewrite `/lit/begin-session` and `/lit/complete-session`

**`/lit/begin-session`** (line ~2329): backend now generates the P-256 keypair. Client no longer
sends `sessionPublicKey`. `ownerAddress` comes from the authenticated request context (PC2 auth
middleware), not the request body.

```typescript
// ownerAddress from PC2 auth context — never trust the request body for this.
const ownerAddress = req.user?.address;
if (!ownerAddress) return res.status(401).json({ error: 'authentication required' });

const { ttlSeconds, chainId } = req.body || {};

const { sessionService } = await import('../services/session/BackendSessionService.js');
const { sessionId, delegationCanonical } = await sessionService.createSession({
  ownerAddress,
  chainId: Number(chainId) || DEFAULT_CHAIN_ID,
  ttlSeconds: Number(ttlSeconds) || undefined,
});

// The client must have the user's wallet sign delegationCanonical (personal_sign)
// and submit the signature to /lit/complete-session. That signature is the
// cryptographic proof that ownerAddress owns session sessionId.
res.json({ sessionId, delegationCanonical });
```

**`/lit/complete-session`** (line ~2409): verify the wallet signature, issue bearer token.

```typescript
const { sessionId, delegationSig } = req.body || {};
if (!sessionId || !delegationSig) {
  return res.status(400).json({ error: 'sessionId and delegationSig required' });
}

const { sessionService } = await import('../services/session/BackendSessionService.js');
const { token, expiresAt } = sessionService.confirmSession({ sessionId, delegationSig });

// token is the opaque bearer token — client stores it and sends as Authorization: Bearer <token>.
res.json({ ok: true, token, sessionId, expiresAt });
```

**`/lit/renew-session`** (new endpoint): renew after delegation expiry — same keypair, new wallet sig.

```typescript
const ownerAddress = req.user?.address;
const { sessionId, chainId, ttlSeconds } = req.body || {};

const { sessionService } = await import('../services/session/BackendSessionService.js');
const { delegationCanonical } = await sessionService.renewSession({
  sessionId, ownerAddress,
  chainId: Number(chainId) || DEFAULT_CHAIN_ID,
  ttlSeconds: Number(ttlSeconds) || undefined,
});
// Client signs the new delegation and calls /lit/complete-session to get a new token.
res.json({ sessionId, delegationCanonical });
```

Remove `buildDelegationPayload` from `storage.ts` — no longer used here (delegation is built inside
`BackendSessionService.createSession`). Remove all `coveredAddresses` handling.

---

## Checklist

- [ ] `ISessionView` interface added to `chipotle-client.ts` (`unwrapEnvelope → Promise<void>`)
- [ ] `keyAlg?` added to `SecureViewSessionBundle`
- [ ] `ClientBundleSessionView` class added (legacy path — `unwrapEnvelope` throws)
- [ ] `BackendSessionView` class added — `fromStoredSession()`, `signRequest()`, `unwrapEnvelope()`, `cekBase64` getter
- [ ] `ISessionStore` interface exported — `get`, `set`, `getByToken`, `all`
- [ ] `InMemorySessionStore` class implements `ISessionStore` with `Map<id, session>` + `Map<token, id>` index
- [ ] `BackendSessionService` created at `src/services/session/BackendSessionService.ts` — instance-based, injected store (defaults to `InMemorySessionStore`); methods: `createSession`, `confirmSession`, `renewSession`, `getSessionByToken`, `getSessionById`, `importSession`, `exportAll`
- [ ] Module-level `export const sessionService = new BackendSessionService()` — callers import this singleton
- [ ] `StoredSession` includes `curve: 'P-256'`, `privateKeyRaw` (32-byte big-endian hex scalar) alongside `privateKeyJwk` — any language with a P-256 implementation can resurrect the session from `curve + privateKeyRaw`
- [ ] All `media.ts` / `storage.ts` callers use `sessionService` (not `BackendSessionService` static methods)
- [ ] `recoverCEKEnvelope` replaces `recoverCEKWithServerSession` — no `publicKeyHex` override; takes `ISessionView`, returns `Buffer`
- [ ] `recoverMediaCEKEnvelope` deleted (grep confirms zero callers first)
- [ ] `media.ts` `recoverMediaCEK` loads `BackendSessionView` from `Authorization` header token; 401 if absent
- [ ] `storage.ts` `recoverCEKAndFetchData` — same pattern; 401 if no token
- [ ] `/lit/begin-session` rewritten — backend generates P-256 keypair; returns `{ sessionId, delegationCanonical }`; no `sessionPublicKey` from client
- [ ] `/lit/complete-session` rewritten — verifies `delegationSig`; issues opaque bearer token
- [ ] `/lit/renew-session` added — same keypair, fresh delegation, new wallet sig required
- [ ] `buildDelegationPayload` removed from `storage.ts` (moved into `BackendSessionService`)
- [ ] `npx tsc --noEmit` — clean
- [ ] `grep -rn "recoverCEKWithServerSession\|recoverMediaCEKEnvelope\|ServerEphemeralSessionView" pc2-node/` — zero results
- [ ] `grep -rn "coveredAddresses" pc2-node/src/api/` — zero results in non-comment code
