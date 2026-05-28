# Task: WASM-Contained dDRM Decrypt Runtime (`ddrm-decrypt`)

**Task ID**: DDRM-DECRYPT-WASM
**Created**: 2026-05-27
**Status**: Planned
**Priority**: P0 — Security: CEK must never materialise as a V8 string outside WASM linear memory
**Branch**: `feat/ddrm-zero-cek-exposure`
**Owner**: Irzhy
**Related**: `DDRM-SESSION-CEK-REFACTOR` (predecessor — established `ISessionView`, `BackendSessionView`, server-owned P-256 session)

---

## TL;DR

After `DDRM-SESSION-CEK-REFACTOR` the CEK no longer crosses HTTP or log boundaries, but it still lives in **multiple V8 string heap locations** (`BackendSessionView._cekBase64`, `MediaSession.cekBase64`, `cekSessionCache`, `paddedCek`, `RendererCommand.cek_b64`). V8 strings cannot be reliably zeroed, so the documented containment claim is aspirational.

This task adds a **sibling backend** — a single long-lived WASM binary (`ddrm-decrypt`) that owns both the P-256 session keypair **and** the unwrapped CEK end-to-end. The CEK never leaves WASM linear memory. Selection between the existing JS backend and the new WASM backend is made at session-init time and signed by the wallet.

The current JS-backend code path stays untouched as the fallback / backup. The default flips to `'wasm'` only after parity tests + integration tests are green.

---

## Goals

1. **CEK containment**: from envelope unwrap through CENC AES-CTR decryption, the CEK bytes live only inside WASM linear memory (`Zeroizing<[u8; 32]>`), zeroed on `request_drop`.
2. **Two-layer in-WASM cache**:
   - **L1 (key-based)**: P-256 session keyed by `sessionId` (and its public key). Long-lived (token TTL).
   - **L2 (request-based)**: unwrapped CEK keyed by `requestId` (Lit action request id or `sha256(envelope)`). Short-lived (5 min default, mirrors today's `cekSessionCache`).
3. **Interface split**: introduce `ICencDecryptor` (decryption surface). Both `BackendSessionView` and the new `WasmSessionView` implement `ISessionView & ICencDecryptor`. Consumers migrate to `decryptChunk(...)`; `cekBase64` stays only on `BackendSessionView` for the legacy path.
4. **Single WASM binary** exports both interfaces — no second crate.
5. **Backend selection at `/lit/begin-session`**, included in the signed canonical payload (default `'js'`).
6. **Lifecycle resilience**: WASM loaded once per Node process (lazy on first call). Internal recoverable errors (bad envelope, expired request, wrong kid) surface as typed errors without killing the instance. Fatal errors (panic, trap) trigger one auto-reload attempt; if reload fails, the process exits and the supervisor restarts.
7. **No persistence** of WASM session private keys — restart drops L1, client re-bootstraps. `FileSessionStore` continues to hold per-session metadata (`sessionId`, `ownerAddress`, `publicKey`, `expiresAt`, `backend: 'js' | 'wasm'`) only.

## Non-Goals

- Removing or refactoring `BackendSessionService` / `BackendSessionView`. They remain as the JS-backend implementation.
- Persisting WASM-backend sessions across Node restarts (no process KEK, no encrypted blob export).
- Changing the universal Lit Action or envelope format. The on-chain `hasAccessByContentId` check, the delegation payload schema, and the ECDH envelope layout are unchanged.
- Browser-side WASM. This crate is server-side only; the browser keeps the token-only IndexedDB model from the previous refactor.

---

## Design Overview

### Interface split (Phase 2 wires this)

```ts
// chipotle-client.ts
export interface ISessionView {
  readonly sessionId: string;
  readonly ownerAddress: string;
  readonly publicKeyHex: string;
  signRequest(payload: object): Promise<{ signature: string; publicKey: string }>;
  unwrapEnvelope(envelope: Buffer): Promise<void>;
}

export interface ICencDecryptor {
  /** AES-CTR + CENC decrypt one chunk using the CEK held opaquely by the impl. */
  decryptChunk(kid: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Promise<Buffer>;
}

// BackendSessionView (existing) implements both — decryptChunk reads _cekBase64 and shells to cenc-decrypt
// WasmSessionView (new) implements both — decryptChunk forwards to ddrm-decrypt WASM
```

`cekBase64` getter is **removed from the interface** and remains a class-private property of `BackendSessionView`. The handful of current consumers that read it (`gateway.ts decryptAssetTwoLayer/renderViaWASM`, `media.ts recoverMediaCEK → mediaSessionManager.create`) migrate to `decryptChunk` so they work uniformly across both backends.

### Single WASM binary, two surfaces

`ddrm-decrypt` (Rust, `wasm32-wasip1`, `cdylib`) exports a flat C ABI:

```
session_create() -> session_handle (u32)
session_get_public_key_jwk(handle, out_buf) -> len
session_get_session_id(handle, out_buf) -> len
session_sign(handle, payload_ptr, payload_len, out_buf) -> len           // P-256 ECDSA
session_unwrap_envelope(handle, env_ptr, env_len) -> request_handle      // L2 alloc
request_decrypt_chunk(req_handle, kid_ptr, iv_ptr, ct_ptr, ct_len, out_buf, out_cap) -> len
request_drop(req_handle)
session_drop(handle)
session_lookup(session_id_ptr, session_id_len) -> Option<handle>         // for resurrect after first JS use
alloc(size) -> ptr
dealloc(ptr, size)
```

`session_handle` and `request_handle` are opaque `u32` indices into thread-local `HashMap`s inside WASM. No raw pointers leak across the FFI boundary.

### Lifecycle

1. **Boot**: `WasmDdrmDecryptRuntime.ensureLoaded()` is lazy — first session-init or first decrypt triggers `WebAssembly.compile + instantiate` once. Instance is kept in the singleton.
2. **Per session**: `BackendSessionService.createSession({ backend: 'wasm' })` calls `wasm.session_create()`, stores only the returned `sessionId`, `publicKey`, `ownerAddress`, `expiresAt` in `FileSessionStore`. The P-256 private key never leaves WASM.
3. **Per request**: `requireSecureViewSession` middleware → `BackendSessionService.getSessionByToken` → factory dispatches on `stored.backend`. For `'wasm'`, returns `WasmSessionView.resurrect(stored.sessionId)`, which calls `wasm.session_lookup`. If lookup returns null (process restart), middleware emits `session_token_invalid` and client re-bootstraps.
4. **Decrypt**: `WasmSessionView.unwrapEnvelope(envelope)` calls `wasm.session_unwrap_envelope` → stores returned `requestHandle` on the view. Subsequent `decryptChunk` calls forward to `wasm.request_decrypt_chunk` with that handle. View `dispose()` calls `wasm.request_drop`.
5. **Error recovery**: typed Result on each export (success / recoverable_error). WASM traps caught at the JS bridge — logged, instance discarded, `ensureLoaded()` re-runs on next call (one attempt). If second instantiation fails, the process exits with code 70 so the supervisor (systemd / pm2) restarts.

### Backend selection (signed)

`/lit/begin-session` body adds `backend: 'js' | 'wasm'` (default `'js'`). The canonical signed payload (`canonicalize` in `chipotle-client.ts`) includes the `backend` field, so an attacker cannot strip it to downgrade. `BackendSessionService.createSession` reads the field and dispatches; mismatched signature → `400 invalid_signature`. The client viewer/player picks `'wasm'` via a build flag once Phase 5 lands.

---

## Phase Index

- [PHASE-0-RUST-CRATE.md](PHASE-0-RUST-CRATE.md) — Scaffold the `ddrm-decrypt` crate. ECDH envelope unwrap + CENC decrypt copied from `cenc-decrypt`. Rust unit tests for envelope round-trip + AES-CTR parity.
- [PHASE-1-JS-RUNTIME-BRIDGE.md](PHASE-1-JS-RUNTIME-BRIDGE.md) — `WasmDdrmDecryptRuntime` singleton. Lazy load, long-lived instance, alloc/dealloc helpers, trap-and-reload error boundary.
- [PHASE-2-INTERFACE-SPLIT.md](PHASE-2-INTERFACE-SPLIT.md) — Introduce `ICencDecryptor`. Implement `decryptChunk` on `BackendSessionView`. Migrate `gateway.ts` + `media.ts` consumers off direct `cekBase64` reads.
- [PHASE-3-WASM-SESSION-VIEW.md](PHASE-3-WASM-SESSION-VIEW.md) — `WasmSessionView` class. `BackendSessionService` factory dispatch on `StoredSession.backend`. `/lit/begin-session` accepts and signs the backend field.
- [PHASE-4-CONSUMER-WIRING.md](PHASE-4-CONSUMER-WIRING.md) — Thread `backend` selector through test viewer (`ddrm-viewer`) and media runtime (`pc2-media-runtime`). Build-flag gated, default off.
- [PHASE-5-TESTS-AND-FLIP.md](PHASE-5-TESTS-AND-FLIP.md) — Unit tests (Rust + TS), integration tests (PDF + media end-to-end against both backends). Flip default to `'wasm'`. Sunset note for `cenc-decrypt` crate.

## Open Items / Risks

- **Single-instance concurrency**: WASM linear memory isn't thread-safe. Node is single-threaded for JS, but multiple in-flight requests will hit the same instance. Plan: serialize all WASM calls through an async lock per-runtime. Acceptable because each call is microseconds. Revisit if becomes a perf bottleneck.
- **Memory growth**: L1 sessions accumulate over uptime. Add a sweeper on `request_drop` that also evicts L1 entries past `expiresAt`. Cap L1 at e.g. 10k sessions, evict LRU above.
- **`getrandom` in WASI**: confirmed works via `wasm32-wasip1`'s `random_get`. No custom backend needed.
- **`@wasmer/wasi` instance reuse**: confirm in Phase 1 spike that the wasmer instance survives across calls without re-invoking `_start`. If not, fall back to native `WebAssembly.instantiate` with an empty/null WASI imports satisfied via stubs (no syscalls expected after instantiation since we never call `_start`).
- **Capsule manifest**: `ddrm-decrypt` gets its own `capsule.json` like other crates; sha256 pinned in the JS loader so swap attacks against the binary on disk are detected.

## History

- 2026-05-28 — Plan drafted after `DDRM-SESSION-CEK-REFACTOR` shipped. Open question from user: "Are you sure the CEK doesn't leak with the actual state of the decryption workflow?" → No, it does; this task closes that gap.
