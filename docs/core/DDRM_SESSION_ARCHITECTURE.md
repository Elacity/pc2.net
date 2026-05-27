# dDRM Session & CEK Recovery Architecture

> Branch: `dev/fix-lit-actions`
> Task plan: `.cursor/tasks/DDRM-SESSION-CEK-REFACTOR/`
> Companion: [`CHIPOTLE_V3_PROTOCOL.md`](./CHIPOTLE_V3_PROTOCOL.md)

## 1. Why this changed

The pre-refactor `recoverCEKWithServerSession` minted a random `secp256k1` wallet for every Lit Action call and used its address as `del.ownerAddress`. After the V3 hardening landed (Phase 0 of this task), the deployed action enforces:

```js
hasAccessByContentId(del.ownerAddress, kid)  // on-chain
ecrecover(delegationSig) === del.ownerAddress
```

A random wallet owns no NFT, so every call returned `access_denied`. The companion client-side path (24 h ephemeral P-256 keypair in WebCrypto, IndexedDB-persisted as a `CryptoKey`) was also dead-ended: the private key was non-extractable, so the browser could neither export it nor unwrap a CEK envelope without leaking the CEK into JS heap.

Both halves are replaced with one model: **server-owned P-256 session keypair, browser holds only an opaque bearer token.**

## 2. Trust & ownership chain

```
wallet (EOA / smart account)
   │  personal_sign(delegationCanonical)
   ▼
delegationSig  ───────────────────────────► verified by:
                                              • BackendSessionService.confirmSession (ecrecover)
                                              • Lit Action TEE (ecrecover, independently)

server P-256 keypair   ═══════ ECDH envelope target ═══════►  Lit Action
   │
   ▼
StoredSession (file or memory)
   │
   ▼
opaque bearer token  ────► client (IndexedDB) ────► X-SecureView-Session header
```

The wallet signature is the only cryptographic ground truth. The bearer token is a server-side lookup convenience; deleting it locally is a no-op until it is also removed from the server's store. The Lit Action's `ecrecover` check inside the TEE is the authoritative access boundary.

## 3. `ISessionView` abstraction

Defined in [`pc2-node/src/api/chipotle-client.ts`](../../pc2-node/src/api/chipotle-client.ts):

| Member | Purpose |
|---|---|
| `delegationCanonical` | Wallet-signed canonical JSON, forwarded to Lit Action |
| `delegationSig` | EIP-191 sig over the canonical delegation |
| `keyAlg` | ECDH algorithm hint (`{ name: 'ECDH', namedCurve: 'P-256' }`) |
| `signRequest({ kid, actionIpfsId })` | Returns `{ requestCanonical, requestSig }` |
| `unwrapEnvelope(buf)` | Stores CEK in implementation-internal memory, returns `void` |

Two concrete implementations:

| Class | Owner | Unwrap |
|---|---|---|
| `BackendSessionView` | Server (Node heap) | P-256 ECDH; CEK accessible only via the `cekBase64` getter |
| `ClientBundleSessionView` | Server, wrapping a client-signed bundle | Throws — the server has no private key to unwrap with |

`recoverCEKEnvelope(params, session)` (renamed from `recoverCEKWithServerSession`) returns the raw `Buffer` envelope. The CEK is never the return value; the caller must call `session.unwrapEnvelope(envelope)` and then read the implementation's typed getter.

## 4. Lifecycle endpoints

All four endpoints live in [`storage.ts`](../../pc2-node/src/api/storage.ts) under the `/api/storage/` prefix, all guarded by the `authenticate` middleware (PC2 user auth).

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/lit/begin-session` | `{ chainId?, ttlSeconds? }` | `{ sessionId, delegationCanonical, expiresAt }` |
| POST | `/lit/complete-session` | `{ sessionId, delegationSig }` | `{ token, sessionId, expiresAt }` |
| POST | `/lit/renew-session` | `{ sessionId, chainId?, ttlSeconds? }` | `{ sessionId, delegationCanonical, expiresAt }` |
| POST | `/lit/revoke-session` | `{ delegationNonce, expiresAt? }` | `{ ok: true }` |

- `begin-session` generates the P-256 keypair server-side; `ownerAddress` is derived from `req.user.wallet_address` (never trusted from the body).
- `complete-session` verifies `ecrecover(delegationSig) === ownerAddress` (EIP-191) with an EIP-1271 fallback for smart-wallet owners.
- `renew-session` reuses the same keypair and only rotates timestamps + nonce; the previous token is cleared and the client must re-sign.

## 5. `BackendSessionService` and storage

[`pc2-node/src/services/session/BackendSessionService.ts`](../../pc2-node/src/services/session/BackendSessionService.ts) owns session lifecycle. The store is pluggable via `ISessionStore`:

| Store | Notes |
|---|---|
| `InMemorySessionStore` | Two `Map`s (`id → session`, `token → id`); private keys live only in process heap. Default for dev / ephemeral nodes. |
| `FileSessionStore` | Wraps the in-memory store and mirrors each `set()` to `data/sessions/<publicKeyHex>.json` (mode `0600`). Loads + prunes-expired on boot. **Current default for `sessionService`** — sessions survive process restarts. |

`StoredSession` includes both `privateKeyJwk` (Node WebCrypto convenience) and `privateKeyRaw` (32-byte big-endian hex scalar). The raw form is language-agnostic: any P-256 implementation can resurrect the keypair from `curve + privateKeyRaw`.

```ts
// Swap stores in one place — the rest of the codebase depends on the
// ISessionStore interface, not the implementation.
export const sessionService = new BackendSessionService(
  new FileSessionStore(SESSION_STORE_DIR),
);
```

## 6. `requireSecureViewSession` middleware

[`pc2-node/src/api/middleware/secureViewSession.ts`](../../pc2-node/src/api/middleware/secureViewSession.ts) is the single point of entry for any route that needs a CEK unwrap. It must run **after** `authenticate`.

| Step | Failure mode |
|---|---|
| Extract bearer token (`X-SecureView-Session` header first, then `req.body.sessionToken`) | `401 session_token_required` |
| `sessionService.getSessionByToken(token)` | `401 session_token_invalid` |
| Cross-check `session.ownerAddress` against `req.user.wallet_address` / `smart_account_address` | `403 session_owner_mismatch` |
| `BackendSessionView.fromStoredSession(stored)` | `500 session_resurrect_failed` |

On success: `req.secureViewSession = { stored, view }`. Downstream handlers pass `view` directly into `recoverCEKEnvelope` / `recoverWithSession` / `decryptAssetTwoLayer` / `renderViaWASM`. **No route should re-load by token.**

### Routes wired up

| File | Route | Notes |
|---|---|---|
| `storage.ts` | `POST /api/storage/lit/secure-view` | Doc / image / EPUB render path |
| `gateway.ts` | `POST /api/gateway/skills/install` | Encrypted SKILL.md install |
| `media.ts` | `POST /api/media/init` | DASH session bootstrap (CEK recovery) |
| `media.ts` | `POST /api/media/segment` | Per-segment re-validation (token + owner check on every fetch) |

## 7. Client-side (parent frame)

[`pc2-node/src/wallet-bridge/pc2-secure-view-session.js`](../../pc2-node/src/wallet-bridge/pc2-secure-view-session.js): reduced to `persistSession` / `loadSession` / `clearSession`. IndexedDB v2 upgrade drops the legacy keypair stores; the database now holds only `{ token, sessionId, expiresAt }`.

[`pc2-node/src/wallet-bridge/pc2-secure-view.js`](../../pc2-node/src/wallet-bridge/pc2-secure-view.js): owns the session bootstrap. Public surface:

| Method | Behaviour |
|---|---|
| `pc2SecureView.ensureSession()` | Idempotent bootstrap; concurrent callers share a single promise |
| `pc2SecureView.signRequest({ refresh? })` | Returns `{ token, sessionId }`. `refresh: true` clears IndexedDB + memory and re-bootstraps |
| `pc2SecureView.getToken()` | Bootstrap + pre-emptive renewal if within 60 s of expiry |
| `pc2SecureView.revoke()` | Local clear (memory + IndexedDB) |
| `pc2SecureView.getState()` | Inspector for debugging |

The `pc2_secureView_sign` RPC (handled by `pc2-wallet-bridge.js`) calls `signRequest()`. Iframes therefore never touch wallet APIs directly.

### Iframe consumers

- **ddrm-viewer** (`data/test-apps/ddrm-viewer/viewer.js` + `data/installed-apps/...`): asks for token via the RPC, attaches it as `X-SecureView-Session` on `/api/storage/lit/secure-view`. On `401 session_token_invalid` it retries once with `refresh: true`.
- **pc2-media-runtime** (`data/test-apps/pc2-media-runtime/player.js` + `data/installed-apps/...`): same pattern, applied to both `/api/media/init` and `/api/media/segment`. Invalidates the local token cache on 401 and re-asks the parent.

The HTML cache-buster on `pc2-secure-view.js` / `pc2-secure-view-session.js` is now `?v=20260527a` (both [`scripts/build-frontend.js`](../../pc2-node/scripts/build-frontend.js) and [`frontend/index.html`](../../pc2-node/frontend/index.html)).

## 8. Security invariants

- The CEK never enters the public API surface. It lives in `BackendSessionView._cekBase64` (Node heap) and only escapes via the `cekBase64` getter into the consuming subsystem (`MediaSession`, WASM renderer input, etc.). Never logged, never in HTTP response bodies.
- `recoverCEKEnvelope` returns `Buffer` (the envelope), not the CEK.
- The wallet signature is verified twice: by the server (defense-in-depth, fast-fail before a paid Lit call) and by the Lit Action TEE (authoritative).
- `BackendSessionService.confirmSession` only issues a bearer token after `ecrecover(delegationSig) === session.ownerAddress`. EIP-1271 fallback covers smart-wallet owners.
- `ownerAddress` is always sourced from `req.user.wallet_address` (PC2 auth middleware), never from the request body, at both `begin-session` and `renew-session`.
- The `X-SecureView-Session` header is rotated only via `complete-session` / `renew-session`; the middleware re-runs the owner cross-check on every request that touches a CEK.
- `FileSessionStore` files are written with `0o600`. The Node user is the only reader.

## 9. Files modified / created

| Path | Change |
|---|---|
| `pc2-node/data/lit-actions/universal-decrypt-chipotle.js` | (Phase 0) Removed `del.actionIpfsId` check; deployed as `QmfQfBESVaKD9LAghGXYo768ih6ntaXFRpe88HdCoQ3t3M` |
| `pc2-node/src/api/chipotle-client.ts` | Added `ISessionView`, `ClientBundleSessionView`, `BackendSessionView`; renamed `recoverCEKWithServerSession` → `recoverCEKEnvelope`; deleted `recoverMediaCEKEnvelope`; updated `UNIVERSAL_DECRYPT_CID` |
| `pc2-node/src/services/session/BackendSessionService.ts` | **New** — `ISessionStore`, `InMemorySessionStore`, `FileSessionStore`, `BackendSessionService`, `sessionService` singleton |
| `pc2-node/src/api/middleware/secureViewSession.ts` | **New** — `requireSecureViewSession` middleware + `SecureViewRequest` type |
| `pc2-node/src/api/storage.ts` | Refactored `recoverWithSession` (renamed from `recoverCEKAndFetchData`) to take `ISessionView`; threaded view through `decryptAssetTwoLayer` / `renderViaWASM`; rewrote `/lit/begin-session`, `/lit/complete-session`, added `/lit/renew-session`; applied middleware to `/lit/secure-view` |
| `pc2-node/src/api/media.ts` | Added `authenticate` + `requireSecureViewSession` to `/init` and `/segment`; `recoverMediaCEK` now takes the view directly |
| `pc2-node/src/api/gateway.ts` | Applied middleware to `/skills/install`; threaded view through `decryptAssetTwoLayer` |
| `pc2-node/src/api/renderer/types.ts` | Removed transient `authToken` field; `DecryptParams` is unchanged otherwise |
| `pc2-node/src/wallet-bridge/pc2-secure-view-session.js` | Rewritten as token-only (IndexedDB v2 schema; dropped keypair stores) |
| `pc2-node/src/wallet-bridge/pc2-secure-view.js` | Rewritten: `runSessionFlow`, `runRenewalFlow`, `bootstrap`, `getTokenOrRenew`; `signRequest({refresh?})` returns `{token,sessionId}` |
| `pc2-node/data/test-apps/ddrm-viewer/viewer.js` + `data/installed-apps/.../viewer.js` | Send `X-SecureView-Session` header; 401 → refresh+retry |
| `pc2-node/data/test-apps/pc2-media-runtime/player.js` + `data/installed-apps/.../player.js` | Bearer-token flow with parent RPC; replaced 412 challenge-response loop |
| `pc2-node/scripts/build-frontend.js`, `pc2-node/frontend/index.html` | Cache-buster bumped to `?v=20260527a` |
| `pc2-node/src/utils/metrics.ts` | Updated example comment to reference `recoverCEKEnvelope` |

## 10. Operating notes

- **Default store is filesystem-backed.** Records at `data/sessions/<publicKeyHex>.json`. Switch back to in-memory by changing the `sessionService` constructor in `BackendSessionService.ts` to `new BackendSessionService()`.
- **Server restart safety.** With `FileSessionStore`, the existing bearer token keeps working across restarts. Expired records are pruned on boot.
- **Forced re-bootstrap from the browser console.** `window.pc2SecureView.revoke()` clears local state; the next iframe open will trigger one wallet prompt.
- **Per-route validation cost.** The middleware does one `Map` lookup + one `subtle.importKey(jwk)` per request. Cheap, but `/media/segment` runs it on every chunk — fine in practice; if it ever shows up in profiling, cache the imported `CryptoKey` per session id.
