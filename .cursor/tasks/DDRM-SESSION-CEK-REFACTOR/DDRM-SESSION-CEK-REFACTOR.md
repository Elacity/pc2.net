# Task: dDRM Session & CEK Recovery Refactor

**Task ID**: DDRM-SESSION-CEK-REFACTOR
**Created**: 2026-05-27
**Status**: Done
**Priority**: P0 — Security + Architecture — CEK must never be materialised outside server memory or WASM linear memory
**Branch**: `dev/fix-lit-actions`
**Owner**: Irzhy
**Related**: `CHIPOTLE-V3-UNIVERSAL-ACTIONS` (parent — universal Lit Action alignment)

---

## TL;DR

Two things are broken / incomplete after the V3 Lit Action update:

1. **`recoverCEKWithServerSession` is architecturally broken.** The server creates a random secp256k1 wallet as `ownerAddress` in the delegation. But the updated `universal-decrypt-chipotle.js` checks `hasAccessByContentId(del.ownerAddress, kid)` on-chain — a random wallet never owns the NFT, so every server-generated session returns `access_denied`. The function also has a dead twin (`recoverMediaCEKEnvelope`) that is never called.

2. **The client session keypair is disposable and P-256 only.** The current `pc2-secure-view-session.js` generates a fresh non-extractable `CryptoKey` on every delegation. The private key cannot be exported or used for ECDH — it is only for ECDSA signing. The delegation expires in 24 h and requires a new wallet prompt. There is no path for the session key to unwrap a CEK envelope client-side (CEK would have to surface in JS, defeating the point).

**This task fixes both** by:

- Introducing an `ISessionView` abstraction and renaming `recoverCEKWithServerSession` → `recoverCEKEnvelope` (takes `ISessionView`, returns raw ECDH `Buffer` — never the CEK).
- Migrating the browser session from P-256 WebCrypto to the **ddrm WASM module** (Ed25519 signing + X25519 ECDH). The session seed is persisted in IndexedDB (survives page reloads, resurrected for new delegations). The CEK unwrap happens entirely inside WASM — it never appears in JS heap.

---

## Background

### Why `recoverCEKWithServerSession` is broken

The server builds a delegation like:
```js
const wallet = Wallet.createRandom();          // random address
const delegation = {
  ownerAddress: wallet.address,               // ← random; owns no NFT
  coveredAddresses: [params.buyerAddress],    // ← ignored by Lit Action
  ...
};
```

The updated Lit Action (`0afc83df5`) does:
```js
const candidates = [del.ownerAddress, resolveSmartAccountAddress(del.ownerAddress)];
candidates.map(addr => gateway.hasAccessByContentId(addr, kid));
// random wallet fails → access_denied
```

`coveredAddresses` is never read. Fix: `ownerAddress` must equal the actual buyer (the wallet that holds the access token). Only the browser wallet can sign that delegation. The provider is provisionned by a  pc2 mechanics

### The `ISessionView` contract

The new `recoverCEKEnvelope` does not build a delegation or keypair internally. It receives an `ISessionView` that provides:

- The wallet-signed delegation (`delegationCanonical`, `delegationSig`).
- A `signRequest()` method that produces a fresh per-asset request signed by the session key.
- An `unwrapEnvelope(Buffer)` method — stores it in WASM memory (client path).
- new methods for decrypting raw encrypted content using the CEK (stored in-memory), methods here could be different for media and non-media (need further analysis)
- `keyAlg` — passed to the Lit Action so it knows which ECDH scheme the session key supports.

Two concrete implementations:

| Class | Who uses it | ECDH location |
|---|---|---|
| `ClientBundleSessionView` | Server (media + storage) | Server provides ephemeral P-256 key; CEK stays in `MediaSession` |
| `DdrmSessionView` (browser) | Future client-side flow | WASM; CEK in linear memory only |

### ddrm WASM exports (Emscripten, one leading underscore in JS)

Source: `/Users/maciz/www/ela.city/media-player/modules/ddrm/src/protocol.c`

| C function | JS name | Purpose |
|---|---|---|
| `_get_session_seed` | `Module.__get_session_seed(sess, buf)` | Export 32-byte Ed25519 seed for IndexedDB |
| `_restore_session_keys` | `Module.__restore_session_keys(sess, buf)` | Rebuild keypair from seed on page reload |
| `_eddsa_sign_message` | `Module.__eddsa_sign_message(sess, msg, len, sigOut)` | Ed25519-sign the canonical request |
| `license_parse_b64` | `Module.license_parse_b64(b64, sess)` | Parse + ECDH-unwrap the Lit envelope; CEK in WASM memory |

The Ed25519 public key (`sign_pkey`, 32 bytes) is used as `sessionPublicKey` in the delegation. The Lit Action's X25519 mode converts it to Montgomery form (`ed25519ToX25519`) before ECDH.

### Delegation shape (cleaned up)

`coveredAddresses` removed — the Lit Action never reads it. `actionIpfsId` removed from delegation — the Lit Action check on `del.actionIpfsId` (line 516) is dropped in Phase 0; the `req.actionIpfsId` check (line 517) is sufficient since the request is signed by the session key whose public key is inside the wallet-signed delegation. `ownerAddress` stays: the Lit Action still verifies `ecrecover(delegationSig) === del.ownerAddress` as an early security check (line 534).

`nonce` is required for delegation uniqueness: two sessions created at the same second with the same keypair would produce identical delegation bytes → identical wallet signature → indistinguishable sessions. The nonce also appears in the Lit Action response (`delegationNonce`) for audit/correlation.

```json
{
  "chainId": 8453,
  "domain": "pc2.secure-view.v1",
  "expiresAt": 1234654290,
  "issuedAt": 1234567890,
  "nonce": "0x<16 random bytes>",
  "ownerAddress": "0x<wallet>",
  "sessionPublicKey": "0x<32-byte Ed25519 pubkey | 65-byte P-256 uncompressed>"
}
```
```

---

## Requirements

### Must-have

**Phase 0 (Lit Action)**
- [ ] `del.actionIpfsId !== actionIpfsId` line deleted from `universal-decrypt-chipotle.js`.
- [ ] `req.actionIpfsId !== actionIpfsId` check kept (request binding remains).
- [ ] New CID deployed; `UNIVERSAL_DECRYPT_CID` in `chipotle-client.ts` updated.

**Phase 1 (Server)**
- [ ] `recoverMediaCEKEnvelope` deleted (no callers).
- [ ] `recoverCEKWithServerSession` renamed `recoverCEKEnvelope`; takes `ISessionView`; returns `Buffer`.
- [ ] `ISessionView` interface exported from `chipotle-client.ts`.
- [ ] `ISessionView.signRequest` params include `{ kid, actionIpfsId }`.
- [ ] `ClientBundleSessionView` class: wraps `SecureViewSessionBundle`; `signRequest()` returns pre-built request; `unwrapEnvelope()` throws.
- [ ] `BackendSessionView` class: loads P-256 session from `StoredSession`; `signRequest()` ECDSA-signs per-asset request; `unwrapEnvelope()` calls `unwrapECDHEnvelope()`; CEK in `_cekBase64` (Node heap only).
- [ ] `ISessionStore` interface + `InMemorySessionStore` (Map-backed, default) exported from `BackendSessionService.ts`.
- [ ] `BackendSessionService` at `src/services/session/BackendSessionService.ts`: instance-based, injected `ISessionStore`; `createSession` → P-256 keypair + delegation; `confirmSession` → `ecrecover(delegationSig) === ownerAddress` → issue bearer token; `renewSession` → same keypair + fresh delegation; `importSession`/`exportAll` for resurrection.
- [ ] `StoredSession` held in process heap (Map); includes `curve` (`'P-256'`), `publicKeyHex`, `privateKeyJwk`, `privateKeyRaw` (32-byte big-endian hex scalar — portable to any language for resurrection).
- [ ] `media.ts`: loads `BackendSessionView` from `Authorization: Bearer <token>`; 401 if absent.
- [ ] `storage.ts`: same pattern; 401 if no token; rewrite `/lit/begin-session`, `/lit/complete-session`; add `/lit/renew-session`.
- [ ] `SecureViewSessionBundle` gains optional `keyAlg` field.

**Phase 2 (Client)**
- [ ] `pc2-secure-view-session.js`: rewritten — only `persistSession`, `loadSession`, `clearSession`; all keypair/WASM/signing code removed; bearer token stored in IndexedDB.
- [ ] `pc2-secure-view.js`: `runSessionFlow` (begin-session → wallet sign → complete-session → persist token); `runRenewalFlow` (renew-session → wallet sign → complete-session); `bootstrap` replaces `tryRestoreSession` + `runDelegationFlow`; `pc2_secureView_sign` handler returns `{ token, sessionId }`.

### Must-NOT

- Do NOT return the raw CEK string from `recoverCEKEnvelope` — only the envelope `Buffer`.
- Do NOT log CEK bytes, CEK base64, or CEK hex at any log level.
- Do NOT remove `unwrapECDHEnvelope` or `decompressP256Point` — still needed by `BackendSessionView`.
- Do NOT change the ECDH envelope wire format — the ddrm C decoder must stay compatible.

---

## Implementation Plan

- [ ] **Phase 0**: Lit Action — remove `del.actionIpfsId` check, deploy new CID → [`PHASE-0-LIT-ACTION-UPDATE.md`](./PHASE-0-LIT-ACTION-UPDATE.md)
- [ ] **Phase 1**: Server — `ISessionView` interface, rename, remove dead code → [`PHASE-1-RECOVER-CEK-ENVELOPE.md`](./PHASE-1-RECOVER-CEK-ENVELOPE.md)
- [ ] **Phase 2**: Client — token-only session storage, `runSessionFlow`/`runRenewalFlow`, no keypair in browser → [`PHASE-2-SESSION-LIFECYCLE.md`](./PHASE-2-SESSION-LIFECYCLE.md)

---

## Acceptance Criteria

1. `cd pc2-node && npx tsc --noEmit` — clean.
2. `grep -rn "recoverCEKWithServerSession\|recoverMediaCEKEnvelope" pc2-node/` — zero results.
3. `grep -rn "coveredAddresses" pc2-node/src/api/` — zero results in delegation-building paths (only in legacy comments if any).
4. `/api/media/init` returns 401 when `Authorization` header is absent or bearer token is invalid/expired.
5. With a valid `Authorization: Bearer <token>`, `/api/media/init` succeeds and the CEK never appears in any HTTP response body.
6. `data/sessions/<publicKeyHex>.json` contains `{ curve: 'P-256', publicKeyHex, privateKeyJwk, privateKeyRaw }` after `BackendSessionService.createSession()`.
7. `privateKeyRaw` in the session file is a 64-char hex string (32-byte big-endian P-256 scalar); re-importing it via any standard P-256 implementation reconstructs the same public key.
8. Page reload — bearer token loaded from IndexedDB, no wallet prompt (session not expired).

---

## Files Modified

| File | Phase | Change |
|---|---|---|
| `pc2-node/data/lit-actions/universal-decrypt-chipotle.js` | 0 | Remove `del.actionIpfsId` check; deploy new CID |
| `pc2-node/src/api/chipotle-client.ts` | 1 | Add `ISessionView`, `ClientBundleSessionView`, `BackendSessionView`; rename + refactor `recoverCEKEnvelope`; delete `recoverMediaCEKEnvelope` |
| `pc2-node/src/services/session/BackendSessionService.ts` | 1 | New — `ISessionStore` interface + `InMemorySessionStore` (default, Map-backed); `BackendSessionService` (instance, injected store); `importSession`/`exportAll` for resurrection; `StoredSession` with `curve` + `privateKeyRaw` |
| `pc2-node/src/api/media.ts` | 1 | Load `BackendSessionView` from bearer token; 401 if absent |
| `pc2-node/src/api/storage.ts` | 1 | Load `BackendSessionView` from bearer token; rewrite `/lit/begin-session`, `/lit/complete-session`; add `/lit/renew-session`; remove `buildDelegationPayload` |
| `pc2-node/frontend/pc2-secure-view-session.js` | 2 | Token-only: `persistSession`, `loadSession`, `clearSession` — all keypair/WASM code removed |
| `pc2-node/frontend/pc2-secure-view.js` | 2 | `runSessionFlow`, `runRenewalFlow`, `bootstrap`; `pc2_secureView_sign` returns `{ token, sessionId }` |

---

## Hard Constraints

- The CEK is a server-side `string` inside `BackendSessionView.unwrapEnvelope()`. It must only travel to `MediaSession.cekBase64`. It must not appear in any log, HTTP response, or exported function return value at the public API boundary.
- The CEK in the WASM path lives in `session->license->keys[0]` (C heap). The JS side must only invoke it through the `license_parse_b64` / CENC-decrypt path — it must never be read out of WASM memory into a JS `string`.

---

## Status History

| Date | Status | Note |
|---|---|---|
| 2026-05-27 | Pending | Task created; analysis complete; ready to implement |
| 2026-05-27 | Done | Phases 0–2 implemented; `requireSecureViewSession` middleware added; FileSessionStore is the default. See `docs/core/DDRM_SESSION_ARCHITECTURE.md`. |
