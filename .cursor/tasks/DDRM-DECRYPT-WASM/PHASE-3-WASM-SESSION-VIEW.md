# Phase 3 — `WasmSessionView` and Backend Selection

**Parent**: [DDRM-DECRYPT-WASM.md](DDRM-DECRYPT-WASM.md)
**Depends on**: Phase 1 (runtime bridge), Phase 2 (interface split)
**Status**: Planned

## Objective

Add `WasmSessionView` (implements `ISessionView & ICencDecryptor`) backed by `WasmDdrmDecryptRuntime`. Wire backend selection through `BackendSessionService` and `/lit/begin-session`. After this phase, both backends are functional and selectable per session.

## Steps

### 3.1 — `WasmSessionView` class (in `chipotle-client.ts`)

```ts
import { WasmDdrmDecryptRuntime } from '../services/wasm/WasmDdrmDecryptRuntime.js';

export class WasmSessionView implements ISessionView, ICencDecryptor {
  static async createNew(ownerAddress: string): Promise<{
    view: WasmSessionView;
    sessionId: string;
    publicKeyJwk: any;
  }> {
    const rt = WasmDdrmDecryptRuntime.get();
    const { handle, sessionId, publicKeyJwk } = await rt.sessionCreate();
    const view = new WasmSessionView(rt, handle, sessionId, ownerAddress, publicKeyJwk);
    return { view, sessionId, publicKeyJwk };
  }

  static async resurrect(sessionId: string, ownerAddress: string, publicKeyJwk: any): Promise<WasmSessionView | null> {
    const rt = WasmDdrmDecryptRuntime.get();
    const handle = await rt.sessionLookup(sessionId);
    if (handle === null) return null;
    return new WasmSessionView(rt, handle, sessionId, ownerAddress, publicKeyJwk);
  }

  private _requestHandle: number | null = null;

  private constructor(
    private readonly rt: WasmDdrmDecryptRuntime,
    private readonly handle: number,
    public readonly sessionId: string,
    public readonly ownerAddress: string,
    private readonly publicKeyJwk: any,
  ) {}

  get publicKeyHex(): string { return jwkToCompressedHex(this.publicKeyJwk); }

  async signRequest(payload: object): Promise<{ signature: string; publicKey: string }> {
    const bytes = new TextEncoder().encode(canonicalize(payload));
    const sig = await this.rt.sessionSign(this.handle, bytes);
    return { signature: bytesToHex(sig), publicKey: this.publicKeyHex };
  }

  async unwrapEnvelope(envelope: Buffer): Promise<void> {
    this._requestHandle = await this.rt.sessionUnwrapEnvelope(this.handle, new Uint8Array(envelope));
  }

  async decryptChunk(kid: Uint8Array, iv: Uint8Array, ct: Uint8Array): Promise<Buffer> {
    this._requireRequest();
    return this.rt.requestDecryptChunk(this._requestHandle!, kid, iv, ct);
  }

  async decryptSegment(_init: Buffer | null, seg: Buffer): Promise<Buffer> {
    // CENC walking happens inside WASM. The init segment is currently used by
    // cenc-decrypt to extract tenc/kid; for the WASM path we either:
    //   (a) parse tenc in JS once and cache kid on this view, then pass per-chunk
    //   (b) add a `request_decrypt_segment` export that takes the full segment + init
    // Choose (b) — keeps mp4box logic inside WASM and matches cenc-decrypt's existing layout.
    return this.rt.requestDecryptSegment(this._requestHandle!, _init, seg);
  }

  async decryptAsset(ct: Buffer, iv?: Uint8Array): Promise<Buffer> {
    // Full-asset AES-CTR (non-CENC). Add export `request_decrypt_asset` to ddrm-decrypt.
    return this.rt.requestDecryptAsset(this._requestHandle!, ct, iv ?? ZERO_IV);
  }

  async dispose(): Promise<void> {
    if (this._requestHandle !== null) {
      await this.rt.requestDrop(this._requestHandle);
      this._requestHandle = null;
    }
    // L1 (session) stays alive until token expiry or explicit revoke.
  }

  private _requireRequest(): void {
    if (this._requestHandle === null) throw new Error('decrypt called before unwrapEnvelope');
  }
}
```

**Note**: 3.1 reveals two extra exports needed in `ddrm-decrypt`:
- `request_decrypt_segment(req, init_ptr, init_len, seg_ptr, seg_len, out_ptr, out_cap)`
- `request_decrypt_asset(req, iv_ptr, iv_len, ct_ptr, ct_len, out_ptr, out_cap)`

Add to Phase 0 deliverable. Both call into the same internal CENC / AES-CTR code; just different I/O shapes.

### 3.2 — Extend `StoredSession`

```ts
// BackendSessionService.ts
export type SessionBackend = 'js' | 'wasm';

export interface StoredSession {
  sessionId: string;
  ownerAddress: string;
  publicKey: string;          // 33-byte compressed hex
  publicKeyJwk?: JsonWebKey;  // for 'js' backend (used to re-import via WebCrypto)
  expiresAt: number;
  backend: SessionBackend;
  // 'js' only:
  privateKeyJwk?: JsonWebKey;
  privateKeyRaw?: string;
  // 'wasm' only: no key material on disk
}
```

File-store reads/writes pass through unchanged; older session files without `backend` default to `'js'` on read (forward-compat).

### 3.3 — `BackendSessionService.createSession` dispatch

```ts
async createSession(opts: { ownerAddress: string; backend: SessionBackend; ttlSec?: number; }): Promise<StoredSession> {
  if (opts.backend === 'wasm') {
    const { sessionId, publicKeyJwk } = await WasmDdrmDecryptRuntime.get().sessionCreate();
    const stored: StoredSession = {
      sessionId,
      ownerAddress: opts.ownerAddress.toLowerCase(),
      publicKey: jwkToCompressedHex(publicKeyJwk),
      publicKeyJwk,
      expiresAt: nowSec() + (opts.ttlSec ?? DEFAULT_TTL),
      backend: 'wasm',
    };
    await this.store.put(stored);
    return stored;
  }
  // existing 'js' path unchanged
  return this._createJsSession(opts);
}
```

### 3.4 — Factory for `getSessionByToken`

```ts
async getSessionView(token: string): Promise<SessionWithDecrypt | null> {
  const stored = await this.getSessionByToken(token);
  if (!stored) return null;
  if (stored.backend === 'wasm') {
    return await WasmSessionView.resurrect(stored.sessionId, stored.ownerAddress, stored.publicKeyJwk!);
    // resurrect may return null if WASM was restarted — caller handles 401
  }
  return await BackendSessionView.fromStoredSession(stored);
}
```

### 3.5 — `requireSecureViewSession` middleware

Update to call the new factory:

```ts
const view = await sessionService.getSessionView(token);
if (!view) {
  return res.status(401).json({ error: 'session_token_invalid' });
}
(req as SecureViewRequest).secureViewSession = { stored, view };
next();
```

### 3.6 — `/lit/begin-session` accepts and signs `backend`

```ts
// Request body
{
  ownerAddress: string,
  backend: 'js' | 'wasm',          // NEW (default 'js' if absent)
  ttl: number,
  // ...
  signature: string                  // EIP-191 sig over canonicalize({ ownerAddress, backend, ttl, ... })
}
```

`canonicalize` already exists and serialises object keys in stable order. The `backend` field is included naturally. Signature verification (`verifyMessage`) already covers the whole payload.

Server-side:
```ts
const verified = ethers.verifyMessage(canonicalize(canonicalPayload), signature);
if (verified.toLowerCase() !== body.ownerAddress.toLowerCase()) {
  return res.status(401).json({ error: 'invalid_signature' });
}
const session = await sessionService.createSession({
  ownerAddress: body.ownerAddress,
  backend: body.backend ?? 'js',
  ttlSec: clampedTtl,
});
// existing token issuance flow
```

### 3.7 — `/lit/renew-session` preserves backend

The renew flow currently rotates the token but keeps the session. No change to backend — renewal does not let the client switch backend mid-session.

### 3.8 — Decrypt sweeper

When `WasmSessionView.dispose()` is called, also clear any equivalent of `cekSessionCache` entry for `(contentId, sessionId)`. For WASM-backed sessions there's no JS-side CEK cache (the L2 cache lives in WASM as `REQUESTS`); the JS map entries used for L2 in the old design get replaced with `{ requestHandle, exp }` for the WASM path, and the WASM internal sweeper handles TTL eviction.

## Verification

- Create session with `backend: 'wasm'` → succeeds, `StoredSession.backend === 'wasm'`, no `privateKeyJwk` on disk.
- Resurrect after process restart → returns null → middleware emits `session_token_invalid` → client re-bootstraps.
- Mixed traffic: one session with `'js'`, one with `'wasm'`, both decrypt the same content successfully via `decryptChunk`.
- Tampering: change `backend` after signing → `invalid_signature` 401.

## Exit criteria

- `WasmSessionView` operational, satisfies `ISessionView & ICencDecryptor`.
- Backend selection wired through `/lit/begin-session` and signed.
- Factory in `BackendSessionService` returns the right view per stored backend.
- No regression on existing `'js'` flow.
- Default remains `'js'` — flip happens in Phase 5.
