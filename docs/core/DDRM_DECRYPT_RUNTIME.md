# dDRM Decryption Runtime — Architecture & Onboarding Guide

> **Branch context**: `feat/ddrm-zero-cek-exposure`
> **Task plan**: [`.cursor/tasks/DDRM-DECRYPT-WASM/`](../../.cursor/tasks/DDRM-DECRYPT-WASM/)
> **Predecessor**: [`DDRM_SESSION_ARCHITECTURE.md`](./DDRM_SESSION_ARCHITECTURE.md) — the server-owned P-256 session model this runtime sits on top of
> **Companion**: [`CHIPOTLE_V3_PROTOCOL.md`](./CHIPOTLE_V3_PROTOCOL.md) — the universal Lit Action contract this all targets

---

## TL;DR

`ddrm-decrypt` is a Rust → WASM crate that owns both the per-session P-256 keypair **and** the unwrapped CEK end-to-end. The CEK never crosses the FFI boundary as a string — `decryptAsset` / `decryptSegment` / `decryptChunk` are the only ways to use it, and they return only plaintext. This replaces the old model where the CEK lived in `BackendSessionView._cekBase64` (a V8 string that could not be reliably zeroed) and flowed through `cekSessionCache`, `MediaSession.cekBase64`, `paddedCek`, and `RendererCommand.cek_b64`.

Two backends coexist:

| | JS backend (`backend: 'js'`) | WASM backend (`backend: 'wasm'`, **default**) |
|---|---|---|
| Where the P-256 private key lives | WebCrypto `CryptoKey` + JWK in `FileSessionStore` | `ddrm-decrypt` linear memory |
| Where the CEK lives after unwrap | `BackendSessionView._cekBase64` (V8 string) | `ddrm-decrypt` L2 `Zeroizing<Vec<u8>>` (linear memory) |
| Survives Node process restart? | Yes (key on disk) | No (private key dies with process) |
| Selected by | `/lit/begin-session` `backend` field, included in wallet-signed canonical payload | same |
| Implements | `ISessionView + ICencDecryptor` via `BackendSessionView` | `ISessionView + ICencDecryptor` via `WasmSessionView` |

Both backends serve the same three flows (asset two-layer, renderer, media segments). The interface (`ICencDecryptor`) is what makes them swappable from the consumer's perspective.

---

## Table of Contents

1. [Mental model](#1-mental-model)
2. [The two backends](#2-the-two-backends)
3. [Session lifecycle](#3-session-lifecycle)
4. [Decryption flows](#4-decryption-flows)
5. [The `ddrm-decrypt` WASM crate](#5-the-ddrm-decrypt-wasm-crate)
6. [The JS runtime bridge](#6-the-js-runtime-bridge)
7. [Cache layers](#7-cache-layers)
8. [Lit Action interaction](#8-lit-action-interaction)
9. [Client retry / recovery](#9-client-retry--recovery)
10. [Build & debugging](#10-build--debugging)
11. [File map](#11-file-map)
12. [Operational notes](#12-operational-notes)

---

## 1. Mental model

```
                       wallet (EOA / smart account)
                                │
                                │  personal_sign(delegationCanonical)
                                ▼
            ┌───────── delegationSig ─────────┐
            │                                 │
            │ verified by:                    │ verified by:
            │  • BackendSessionService        │  • Lit Action TEE (ecrecover)
            │    .confirmSession              │    inside `universal-decrypt-chipotle.js`
            ▼                                 ▼
   bearer token                        access decision: hasAccessByContentId(owner, kid)
        │
        │  (X-SecureView-Session header)
        ▼
   middleware: requireSecureViewSession
        │
        │  getSessionView(token) → backend dispatch
        ▼
   ┌────────────────────────┐         ┌────────────────────────┐
   │  BackendSessionView    │   OR    │  WasmSessionView       │
   │  (JS backend)          │         │  (WASM backend)        │
   │  - _cekBase64 (V8)     │         │  - _wasmHandle (u32)   │
   │  - signs requests      │         │  - _requestHandle (u32)│
   │    via WebCrypto       │         │  - signs via WASM      │
   └────────┬───────────────┘         └────────┬───────────────┘
            │                                  │
            │  ICencDecryptor (decryptAsset / decryptSegment / decryptChunk)
            ▼                                  ▼
       node:crypto AES-GCM /            ddrm-decrypt WASM:
       cenc-decrypt WASM                AES-256-GCM (asset)
       (with view.cekBase64)            AES-128-CTR (segment via cenc::)
                                        AES-CTR (chunk)
```

### Where the CEK lives at each stage

| Stage | JS backend | WASM backend |
|---|---|---|
| After `unwrapEnvelope` | `BackendSessionView._cekBase64` (V8 string) | `ddrm-decrypt` L2 keyed by `requestHandle` |
| During cache hit | `cekSessionCache` Map (`string`) | `wasmRequestCache` Map (`number` — the handle only) |
| During media playback | `MediaSession.cekBase64` (V8 string) | `MediaSession.wasmRequestHandle` (handle only) |
| Inside the renderer (`ddrm-renderer`) | `RendererCommand.cek_b64` (WASM-side memory) | Never — `mode: 'render_only'` passes plaintext, no CEK |
| Inside `cenc-decrypt` WASM (legacy) | `command.cek_b64` (passed in via MemFS JSON) | Never — `ddrm-decrypt::media::decrypt_segment` handles it internally |

This is the security delta. On the WASM backend the only place the CEK exists as bytes is inside `ddrm-decrypt`'s linear memory, in a `Zeroizing<Vec<u8>>` whose drop zeroes the bytes. It never appears in V8 string heap, never crosses HTTP, never enters another WASM module.

---

## 2. The two backends

### `backend: 'js'` — legacy / fallback

- P-256 keypair generated via `crypto.subtle.generateKey({name:'ECDSA', namedCurve:'P-256'}, true, ['sign','verify'])`.
- Stored as `privateKeyJwk + privateKeyRaw` (hex of the 32-byte scalar) in `FileSessionStore` — survives process restart.
- `BackendSessionView` re-imports both an ECDSA signing key and an ECDH key from JWK.
- After `unwrapEnvelope`, the CEK sits in `_cekBase64` (V8 string).
- Decryption: node:crypto for AES-GCM full-asset, `cenc-decrypt` WASM for CENC segments.

### `backend: 'wasm'` — default

- P-256 keypair generated inside `ddrm-decrypt` via `p256::SecretKey::random(&mut OsRng)`. `OsRng` uses WASI's `random_get`.
- Sessions live in a `thread_local!` `HashMap<u32, SessionState>` indexed by an opaque `handle: u32`. UUID v4 sessionId indexes back to the handle for resurrection.
- **Does not survive process restart** — see §3 below.
- `WasmSessionView` holds the handle and delegates every operation (sign, unwrap, decrypt) to `WasmDdrmDecryptRuntime`.
- After `unwrapEnvelope`, the CEK is in L2 `RequestState.cek: Zeroizing<Vec<u8>>` keyed by a fresh `requestHandle: u32`.
- Decryption: `ddrm-decrypt`'s own AES-256-GCM (envelope unwrap uses AES-CBC), AES-128-CTR for CENC.

### Selection

- The client may pass `backend: 'js' | 'wasm'` in `POST /api/storage/lit/begin-session` body.
- If absent, server defaults to `'wasm'` unless `PC2_DDRM_BACKEND=js` is set in the environment.
- The selector is included in `delegationCanonical` so the wallet signature binds it. An attacker who strips/swaps the field invalidates `ecrecover(delegationSig)`.
- `renewSession` carries the original backend forward into the renewed canonical payload — backend can't be changed mid-session.

---

## 3. Session lifecycle

### Server-side endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/storage/lit/begin-session` | Generate keypair (per backend), build `delegationCanonical`, return it |
| `POST /api/storage/lit/complete-session` | Verify wallet signature on `delegationCanonical`, issue opaque bearer token |
| `POST /api/storage/lit/renew-session` | Same keypair, fresh `delegationCanonical` (new nonce + timestamps), wallet re-signs |

### `BackendSessionService` (`pc2-node/src/services/session/BackendSessionService.ts`)

Service that owns the lifecycle. Two stores ship by default:

- `InMemorySessionStore` — process heap only.
- `FileSessionStore` — wraps in-memory + mirrors mutations to `data/sessions/<id>.json` (mode `0o600`). Default singleton.

`StoredSession` shape:

```ts
interface StoredSession {
  id: string;                    // For 'js': publicKeyHex; for 'wasm': UUID v4 from WASM
  curve: 'P-256';
  backend?: 'js' | 'wasm';       // Forward-compat: missing => 'js'
  publicKeyHex: string;          // 65-byte uncompressed (0x04 || X || Y)
  privateKeyJwk?: JsonWebKey;    // 'js' only
  privateKeyRaw?: string;        // 'js' only — 32-byte big-endian hex
  ownerAddress: string;
  token: string;                 // empty until confirmSession
  delegationCanonical: string;
  delegationSig: string;
  createdAt: number;
  expiresAt: number;
}
```

### Restart semantics

`FileSessionStore.loadAll()` on startup walks `data/sessions/`:

1. Drops files past `expiresAt`.
2. **Drops all files with `backend === 'wasm'`** — the private key lived in WASM linear memory, gone with the process. Serving stale entries would just return `session_token_invalid` on every request. Better to drop them so the client cleanly re-bootstraps.
3. Restores the rest into memory.

The log line reports `Loaded N session(s); pruned M expired, K wasm-backed (unrecoverable after restart)`.

### Token resurrection

The middleware `requireSecureViewSession` (`pc2-node/src/api/middleware/secureViewSession.ts`) calls `sessionService.getSessionView(token)`:

```ts
async getSessionView(token: string): Promise<BackendSessionView | WasmSessionView | null> {
  const stored = this.store.getByToken(token);
  if (!stored) return null;
  if (stored.backend === 'wasm') {
    return WasmSessionView.fromStoredSession(stored);  // null if WASM lost the session
  }
  return BackendSessionView.fromStoredSession(stored);
}
```

The middleware attaches `req.secureViewSession = { stored, view }` (union type `SecureViewSessionView`).

### Client side

`pc2-node/src/wallet-bridge/pc2-secure-view.js` (mirrored to `frontend/`):

- Owns the IndexedDB `{ token, sessionId, expiresAt }` record.
- `bootstrap()` — on first use, either restores the cached token (no wallet prompt) or runs `runSessionFlow()` which posts to `/lit/begin-session`, gets the wallet to sign, posts to `/lit/complete-session`, persists the token.
- `signRequest({ refresh })` — exposed via `window.pc2SecureView` AND via iframe RPC `pc2_secureView_sign` through `pc2-wallet-bridge.js`. `refresh: true` clears the cached token + IndexedDB and re-bootstraps (wallet prompt).
- `getTokenOrRenew()` — pre-emptive renewal within a grace window of expiry.

### Iframe contract

Iframe apps (`ddrm-viewer`, `pc2-media-runtime`) live at `data/test-apps/` (and mirrored to `data/installed-apps/`). They call `pc2_secureView_sign` via the wallet bridge RPC. The bridge in [`pc2-wallet-bridge.js`](../../pc2-node/src/wallet-bridge/pc2-wallet-bridge.js) forwards `{ kid, actionIpfsId, refresh }` to `pc2SecureView.signRequest`. **Forwarding `refresh` was a critical fix** — without it, the iframe retry loop hits the same stale token forever.

---

## 4. Decryption flows

There are three concrete content flows. All run through the same session machinery but produce different shapes.

### 4a. Asset two-layer (`POST /api/storage/lit/secure-view` non-renderer + `POST /api/skills/install`)

Used by `decryptAssetTwoLayer` in [`pc2-node/src/api/storage.ts`](../../pc2-node/src/api/storage.ts). Steps:

1. `recoverWithSession` — see §7 for caching. After this, the sessionView has an unwrapped CEK (or in WASM's case, a `requestHandle`).
2. `sessionView.decryptAsset(encryptedBytes, ivBytes)` — backend-agnostic. JS impl: node:crypto AES-256-GCM. WASM impl: `ddrm-decrypt::media::decrypt_asset` (AES-256-GCM).
3. Returns plaintext `Buffer`.

The decrypt is now a single call regardless of backend. The renderer's `decrypt_only` mode and the standalone node:crypto fallback are both retired from this code path.

### 4b. Renderer (`POST /api/storage/lit/secure-view` for PDF/EPUB)

Used by `renderViaWASM` in [`pc2-node/src/api/storage.ts`](../../pc2-node/src/api/storage.ts). The `ddrm-renderer` crate is a separate WASM (PDF/EPUB/image rendering); historically it took `cek_b64` and decrypted internally before rendering.

Backend dispatch:

- **JS backend**: `recoverWithSession` returns `cekBase64`. `renderViaWASM` builds `RendererCommand { cek_b64, iv_b64, ... }`, hands the encrypted bytes to the renderer. Renderer decrypts internally → renders → returns rendered bytes.
- **WASM backend**: `cekBase64` is `undefined`. `sessionView.decryptAsset(encryptedBytes, iv)` runs first (CEK never leaves `ddrm-decrypt`). The plaintext is then passed to the renderer with `mode: 'render_only'` — renderer skips its AES-GCM step entirely and routes straight to the MIME dispatcher.

The renderer's [`process_files_inner`](../../pc2-node/wasm-renderer/src/lib.rs) has three operating modes now: `decrypt_only`, `render_only`, and the default decrypt-then-render path.

### 4c. Media (`POST /api/media/init` + `POST /api/media/segment`)

[`pc2-node/src/api/media.ts`](../../pc2-node/src/api/media.ts):

- **`/init`**: `recoverMediaCEK` returns a discriminated `MediaCekHandle`:
  ```ts
  type MediaCekHandle =
    | { kind: 'js'; cekBase64: string }
    | { kind: 'wasm'; requestHandle: number };
  ```
  `mediaSessionManager.create({ cekBase64 OR wasmRequestHandle, ... })` persists whichever is set on the `MediaSession`.

- **`/segment`**: dispatches per `MediaSession` shape.
  - `wasmRequestHandle` set → `WasmDdrmDecryptRuntime.requestDecryptSegment(handle, init, seg, true)`. Calls `ddrm-decrypt::media::decrypt_segment` which walks `moof/traf/senc`, decrypts samples in-place via AES-128-CTR, strips encryption-metadata boxes.
  - `cekBase64` set → legacy `decryptSegmentViaWASM(seg, cekBase64, wasmRuntime, init)` which hands the CEK string to `cenc-decrypt` WASM via MemFS JSON.

- The WASM L2 TTL was bumped from 5 min to **2h** specifically to outlive a `MediaSession` (which has a 2h idle TTL). Without that bump, segment decrypt would start failing mid-playback with `RequestExpired`.

---

## 5. The `ddrm-decrypt` WASM crate

Source: [`pc2-node/crates/ddrm-decrypt/`](../../pc2-node/crates/ddrm-decrypt/). Compiles to `wasm32-wasip1`. 188 KB release binary, ~5.8 MB debug.

### Module layout

```
src/
  lib.rs          — C ABI exports (alloc/dealloc + session_* + request_*)
  main.rs         — empty fn main(); exists so cargo emits `_start`. Linker
                    keeps the #[no_mangle] C ABI exports alive via #[used] refs.
  state.rs        — thread_local SESSIONS / REQUESTS / SESSION_ID_INDEX
  session.rs      — SessionState (P-256 key, public key, session_id), sign,
                    unwrap_envelope orchestration, DEFAULT_REQUEST_TTL_SECS=7200
  request.rs      — RequestState { cek: Zeroizing<Vec<u8>>, session_handle, expires_at }
  envelope.rs     — Parse the ECDH envelope (HEADER | ephPub | iv | sig | wrappedCek);
                    ECDH(SK, ephPub) → 32-byte X-coord → AES-256-CBC key (matches
                    WebCrypto's deriveKey behavior); PKCS#7 unpad; extract keys blob
  media.rs        — decrypt_chunk (AES-CTR), decrypt_segment (CENC walk),
                    decrypt_asset (AES-256-GCM). All borrow CEK via &[u8] from REQUESTS
  cenc.rs         — Lifted from cenc-decrypt: per-sample AES-CTR walk with senc IVs
  mp4box.rs       — Lifted from cenc-decrypt: minimal fMP4 box parser
  strip.rs        — Lifted from cenc-decrypt: strip encryption-metadata boxes
  error.rs        — ErrorCode enum; negative i32 codes for the C ABI
```

### C ABI surface

```c
// Memory
void* alloc(size_t);
void dealloc(void* ptr, size_t size);

// Session lifecycle (L1)
i32 session_create();                              // returns handle (positive) or -err
i32 session_get_session_id(handle, out, cap);      // writes UUID, returns len
i32 session_get_public_key(handle, out, cap);      // writes 33-byte compressed, returns len
i32 session_sign(handle, payload, payload_len, out, cap);
                                                   // ECDSA-P256-SHA256, raw IEEE P1363 (r||s, 64 bytes)
i32 session_unwrap_envelope(handle, env, env_len); // returns request_handle (positive)
i32 session_lookup(id, id_len);                    // returns handle, 0 if not found
i32 session_drop(handle);

// Request operations (L2 — CEK consumption)
i32 request_decrypt_chunk(req, kid, kid_len, iv, iv_len, ct, ct_len, out, cap);
i32 request_decrypt_segment(req, init, init_len, seg, seg_len, strip_flag, out, cap);
i32 request_decrypt_asset(req, iv, iv_len, ct, ct_len, out, cap);    // AES-256-GCM
i32 request_drop(req);

// Diagnostics
i32 debug_session_count();
i32 debug_request_count();
```

**There is intentionally no `get_cek` export.** The only way to use the CEK is to call a `request_decrypt_*` function — the CEK is borrowed via `&[u8]` from `REQUESTS` inside a `with` closure and never leaves.

### Initialization (reactor pattern)

`wasm32-wasip1` Rust cdylibs do not emit `_initialize` (the WASI reactor entry). Without `_start` or `_initialize` being run, Rust's std doesn't initialize — the first touch of `HashMap`, `thread_local`, or `SystemTime` traps with `unreachable`.

The fix: ship an empty `fn main() {}` in `src/main.rs` that references every `#[no_mangle]` export via `std::hint::black_box` to keep them link-live. The JS bridge calls `wasi.start(instance)` exactly once at load — `_start` runs std init + main (no-op) + `__wasi_proc_exit(0)`. wasmer catches the exit; the instance's exports remain callable for the process lifetime.

This is documented inline in [`WasmDdrmDecryptRuntime.ts`](../../pc2-node/src/services/wasm/WasmDdrmDecryptRuntime.ts) so future maintainers don't redo the trapping discovery.

### Signature format

P-256 ECDSA via `signing_key.sign(payload).to_bytes()` — returns **raw IEEE P1363** (`r || s`, exactly 64 bytes). This matches WebCrypto's `subtle.sign({name:'ECDSA', hash:'SHA-256'}, ...)` and what the Lit Action's [`verifyWebCrypto`](../../pc2-node/data/lit-actions/universal-decrypt-chipotle.js) expects. **Earlier code returned DER, which made the Lit Action fail with `req_sig_invalid`** — that pitfall is now documented in `session.rs` to prevent regressions.

### Envelope unwrap

`envelope.rs` parses the binary layout (matching `unwrapECDHEnvelope` in `chipotle-client.ts`):

```
[0..3]      header (byte 3 = version: 0x02 fixed-IV, 0x03 random-IV)
[4..6]      ephPubKeyLen (u16 BE)
[6..N]      ephPubKey (compressed P-256)
[v=0x03]    iv (16 bytes)
[v=0x02]    iv = first 16 bytes of ephPubKey
[next..2]   sigLen (u16 BE), [next..S] signature (skipped — verified upstream)
[next..33]  compressed signer pubkey (skipped)
[next..4]   encCekLen (u32 BE)
[next..E]   encrypted CEK (AES-256-CBC ciphertext)
```

ECDH gives a 32-byte shared secret (X-coordinate of `SK * ephPub`). WebCrypto's `deriveKey({name:'ECDH'}, ..., {name:'AES-CBC', length:256})` uses that shared secret **directly** as the AES-256-CBC key — there is no KDF. The Rust mirror does the same.

The decrypted plaintext is `metaSize(u32) | metadata | keyCount(u32) | keys...`; `extract_keys_blob` returns the keys tail (16 bytes for CENC, 32 for AES-GCM, etc.).

### L1 / L2 cache, TTLs

- **L1 (sessions)**: live forever until `session_drop` or process exit. No automatic eviction. Bounded by client count.
- **L2 (requests)**: 2h TTL (`DEFAULT_REQUEST_TTL_SECS = 7200`). `sweep_expired_requests` runs on every `unwrap_envelope` call to evict stale entries. `request_drop` can be called explicitly when an asset/playback session ends.

---

## 6. The JS runtime bridge

[`pc2-node/src/services/wasm/WasmDdrmDecryptRuntime.ts`](../../pc2-node/src/services/wasm/WasmDdrmDecryptRuntime.ts).

This is a **different shape from the existing `WASMRuntime`** because the lifecycle requirements differ:

| | `WASMRuntime` (existing) | `WasmDdrmDecryptRuntime` (new) |
|---|---|---|
| Instance lifetime | Fresh per call | One per process |
| I/O | WASI MemFS pipes | Flat C ABI + `alloc`/`dealloc` ptr/len |
| Entry | Calls `_start` every call | Calls `_start` exactly once at load |
| State | Stateless | State IS the instance (L1 + L2) |
| Concurrency | Pool of 4 workers, throttled | Single instance + async lock |
| Errors | `result.success=false`, throw | Trap-and-reload, fatal exit on 2nd trap |

### Singleton + lazy load

```ts
WasmDdrmDecryptRuntime.get()         // singleton
  .ensureLoaded()                    // first call triggers compile + instantiate
```

`ensureLoaded`:
1. Reads `pc2-node/wasm-apps/ddrm-decrypt/ddrm-decrypt.wasm` + its `capsule.json`.
2. Computes SHA-256, compares to `capsule.sha256` — load fails on mismatch (swap detection).
3. Initializes wasmer-WASI, compiles + instantiates, calls `wasi.start(instance)` once (catches the WASI exit code 0).
4. Stores `instance.exports` typed as `DdrmDecryptExports`.

### Async serialization lock

WASM linear memory is single-threaded. The runtime's `withLock` chains every call so concurrent JS callers queue. Each call is microseconds; the queue is the right model for the single-instance design.

### Trap-and-reload boundary

If a WASM call throws `WebAssembly.RuntimeError`:
1. Log the trap with the operation name.
2. Discard the instance, set `loading = null` so `ensureLoaded` rebuilds.
3. Retry the operation on the fresh instance — once.
4. If the retry also traps: `logger.error(FATAL)` + `process.exit(70)`. The process supervisor (systemd / pm2 / docker restart) is responsible for restarting.

### Typed public API

`sessionCreate`, `sessionLookup`, `sessionSign`, `sessionUnwrapEnvelope`, `sessionDrop`, `requestDecryptChunk`, `requestDecryptSegment`, `requestDecryptAsset`, `requestDrop`, `sessionCount`, `requestCount`. Each handles `alloc`/`writeBytes`/`readBytes`/`dealloc` internally; consumers see `Uint8Array` and `Buffer` only.

### `WasmSessionView` (in `chipotle-client.ts`)

Wraps the runtime as an `ISessionView + ICencDecryptor` so it's swappable with `BackendSessionView`. Caches the WASM session handle at construction; exposes `requestHandle: number | null` (for `MediaSession` to persist) and `attachRequestHandle(handle)` (for the multi-page render cache to inject a cached handle, skipping the unwrap step).

---

## 7. Cache layers

Three caches, each at a different layer.

### `cekSessionCache` (JS backend, in `storage.ts`)

`Map<${kid}:${buyer.toLowerCase()}, { cekBase64, expiresAt }>`. 5-min TTL, LRU eviction. Avoids re-running the $0.01 Lit action for multi-page PDF/EPUB. Only populated for JS-backed sessions (the CEK is a string — applicable only when the view stores it as a string).

### `wasmRequestCache` (WASM backend, in `storage.ts`)

`Map<${sessionId}:${kid}:${buyer.toLowerCase()}, { handle, expiresAt }>`. 5-min TTL, LRU eviction. Stores the `ddrm-decrypt` L2 request handle. On cache hit, the request handle is `attachRequestHandle`'d onto the view → subsequent `decryptAsset` calls skip both the Lit action AND the envelope unwrap.

The JS-side TTL (5 min) is strictly shorter than the WASM L2 TTL (2h), so the cache never serves an expired handle.

Keyed on `sessionId` additionally because handles are scoped to the WASM runtime instance — different sessions have different handle namespaces.

### `MediaSession` (`pc2-node/src/services/media/sessionManager.ts`)

Per-playback record with 2h idle TTL. Holds either:
- `cekBase64: string` (JS backend) — same shape as before.
- `wasmRequestHandle: number` (WASM backend) — the L2 handle from `/media/init`.

`/media/segment` reads whichever is set and dispatches.

### WASM L2 (in `ddrm-decrypt::state::REQUESTS`)

`HashMap<u32, RequestState>` keyed by request handle. 2h TTL. `Zeroizing<Vec<u8>>` for the CEK bytes — drop zeroes them. `sweep_expired_requests` runs on every `unwrap_envelope`.

### Cache invalidation

`POST /api/storage/lit/flush-cek-cache` (admin) flushes `cekSessionCache`. It does **not** currently flush `wasmRequestCache` — the user-facing operation is rare and the WASM L2 sweeper takes care of stale entries on its own schedule. If needed: drop the same key prefix from `wasmRequestCache` and call `request_drop` for each handle.

---

## 8. Lit Action interaction

Lit Action source: [`pc2-node/data/lit-actions/universal-decrypt-chipotle.js`](../../pc2-node/data/lit-actions/universal-decrypt-chipotle.js). Deployed CID is pinned in `chipotle-client.ts` as `UNIVERSAL_DECRYPT_CID`.

### What the Lit Action verifies inside the TEE

```js
// 1. Canonical re-derive must match exactly
if (canonicalize(del) !== delegationRaw) return deny("del_not_canonical");
if (canonicalize(req) !== requestRaw) return deny("req_not_canonical");

// 2. Domains + chain
if (del.domain !== DELEGATION_DOMAIN)  return deny("bad_domain");
if (req.domain !== REQUEST_DOMAIN)      return deny("bad_req_domain");
if (Number(del.chainId) !== Number(chainId)) return deny("bad_chain");
if (req.actionIpfsId !== actionIpfsId)  return deny("bad_req_action_cid");
if (String(req.kid).toLowerCase() !== normalizedKid.toLowerCase()) return deny("bad_req_kid");

// 3. Freshness
if (now + DELEGATION_CLOCK_SKEW_SECONDS < del.issuedAt) return deny("del_not_yet_valid");
if (now > del.expiresAt) return deny("del_expired");
if (del.expiresAt - del.issuedAt > MAX_DELEGATION_WINDOW_SECONDS) return deny("del_window_too_wide");
if (Math.abs(now - req.requestedAt) > REQUEST_FRESHNESS_WINDOW_SECONDS) return deny("req_stale_or_future");

// 4. Wallet ownership
delOk = eqAddr(ecrecover(delegationSig, delegationRaw), del.ownerAddress)
     || isValidSignatureEip1271(del.ownerAddress, delegationRaw, delegationSig, rpc);
if (!delOk) return deny("del_sig_invalid");

// 5. Session key authorized
reqOk = verifyWebCrypto({ name: 'ECDSA', hash: 'SHA-256' }, del.sessionPublicKey, requestRaw, requestSig);
if (!reqOk) return deny("req_sig_invalid");

// 6. On-chain access
hasAccessByContentId(toChecksum(del.ownerAddress) ∪ smartAccount, kid)
```

### Delegation payload structure

Built by `BackendSessionService.createSession`:

```ts
{
  backend: 'js' | 'wasm',      // included in canonical so wallet sig binds it
  chainId: 8453,
  domain: 'pc2.secure-view.v1',
  expiresAt: ...,
  issuedAt: ...,
  nonce: '0x...',              // 16 random bytes
  ownerAddress: ethers.getAddress(...),
  sessionPublicKey: '0x04...',  // 65-byte uncompressed
}
```

`canonicalize` (in `chipotle-client.ts`): sorted keys, no whitespace, recursive. Must stay byte-identical with the Lit Action's local `canonicalize` (which it is — same algorithm). Unknown fields like `backend` survive `JSON.parse → canonicalize` round-trip cleanly, so the Lit Action's `canonicalize(del) !== delegationRaw` check still passes when new fields are added.

### Request payload structure

Built by `BackendSessionView.signRequest` / `WasmSessionView.signRequest`:

```ts
{
  actionIpfsId: <pinned CID>,
  domain: 'pc2.secure-view.request.v1',
  kid: '0x<lowercased>',
  requestNonce: '0x<8 random bytes>',
  requestedAt: <unix seconds>,
}
```

Signed with the session's P-256 private key, ECDSA-SHA256, **raw IEEE P1363** format (`r || s`, 64 bytes). Sent to Lit as hex (`'0x<sig>'`).

### Envelope returned by the Lit Action

The Lit Action ECDH-encrypts the CEK to `del.sessionPublicKey` using a fresh ephemeral P-256 key. The envelope wire format (see §5) is decoded by `WasmSessionView.unwrapEnvelope` → `ddrm-decrypt::session::unwrap_envelope` → `ddrm-decrypt::envelope::ecdh_unwrap` (for the WASM backend) or by `BackendSessionView.unwrapEnvelope` → `unwrapECDHEnvelope` in `chipotle-client.ts` (for the JS backend).

---

## 9. Client retry / recovery

The user-visible promise is **one wallet prompt per active server uptime window**. After a server restart (which wipes WASM-backed sessions), the next request returns `401 session_token_invalid` and the iframe transparently re-bootstraps with a single wallet prompt.

### The full retry chain

```
1. iframe (viewer.js / player.js): POST /lit/secure-view (or /media/init|segment)
2. server middleware: token unknown → 401 { error: 'session_token_invalid' }
3. iframe: detect 401 + invalidate local token cache
4. iframe: call pc2_secureView_sign via wallet bridge RPC with { refresh: true }
5. pc2-wallet-bridge.js: forward { kid, actionIpfsId, refresh } to pc2SecureView.signRequest
6. pc2-secure-view.js: revoke() — clear in-memory state + IndexedDB
7. pc2-secure-view.js: bootstrap() — POST /lit/begin-session
8. wallet: personal_sign(delegationCanonical)
9. pc2-secure-view.js: POST /lit/complete-session → fresh token
10. iframe: retry original request with fresh token → 200
```

### Bugs we hit and fixed in this chain

- **`pc2-wallet-bridge.js` dropped the `refresh` flag** — `sv.signRequest({ kid, actionIpfsId })` instead of `sv.signRequest({ kid, actionIpfsId, refresh })`. Without forwarding, step 5 never reaches step 6, the same stale token gets returned, and step 10 hits the same 401. **Now fixed** ([commit context: refresh forwarding through wallet bridge]).
- **`pc2-media-runtime/player.js`'s `requestSessionTokenFromParent` passed `params: [{}]`** — same root issue as the bridge. **Now fixed**: it forwards `{ refresh }` and the retry path calls it with `refresh: true`.
- **`ddrm-viewer/viewer.js` was correct** — it already passed `params: [{ refresh: !!(opts && opts.refresh) }]`. The viewer's symptom of "still seeing the error" was caused by the bridge bug above (the viewer's `refresh: true` was being dropped one layer below).

### File sync rule

The wallet bridge and pc2-secure-view files exist in two locations, both must stay in sync:

- Source: `pc2-node/src/wallet-bridge/`
- Deployed copy: `pc2-node/frontend/`

Cache-busters in `index.html` and `scripts/build-frontend.js` MUST be bumped when these change, otherwise browsers serve the cached old copy. Latest: `?v=20260528a`.

Similarly for iframe apps:

- Source: `pc2-node/data/test-apps/<app>/`
- Deployed copy: `pc2-node/data/installed-apps/<app>/`

---

## 10. Build & debugging

### Building the WASM crate

```sh
# Release (default — strips debug, runs wasm-opt -O4):
bash pc2-node/scripts/build-wasm.sh ddrm-decrypt

# Debug (preserves DWARF, skips wasm-opt):
bash pc2-node/scripts/build-wasm.sh ddrm-decrypt --debug
```

The build script:
1. Selects profile (`release` vs `release-debug` from the crate's `Cargo.toml`).
2. Builds via cargo against `wasm32-wasip1`.
3. (release only) Runs `wasm-opt` at the per-crate optimization level. Skipped for `--debug` because wasm-opt drops DWARF custom sections by default.
4. Copies the output to `pc2-node/wasm-apps/ddrm-decrypt/ddrm-decrypt.wasm`.
5. Computes SHA-256 and writes it into `capsule.json`. The JS runtime verifies this sha at load — if you swap the binary out-of-band, load fails.

Sizes for reference:
- Release: ~188 KB after `wasm-opt -O4`.
- Debug: ~5.8 MB (no opt, no strip, no LTO).

### Host-target unit tests

```sh
cd pc2-node/crates/ddrm-decrypt
cargo test --lib --target aarch64-apple-darwin
```

20 tests cover: envelope round-trip (v=0x02 and v=0x03), wrong session key rejection, session create/lookup/sign/drop via the C ABI, AES-CTR sample + subsample round-trips, mp4 box stripping. Run before any change to `ddrm-decrypt`.

### VS Code launch configurations

[`.vscode/launch.json`](../../.vscode/launch.json):

- **`Node: debug pc2-node (dev / tsx watch)`** — tsx watch on `src/index.ts`. preLaunch builds GUI + backend.
- **`Node: debug pc2-node (compiled / dist)`** — runs `dist/index.js` for prod-shape debugging.
- **`Node: attach to running pc2-node`** — attach to a process started with `--inspect`.
- **`Node: debug pc2-node + ddrm-decrypt source (WASM DWARF)`** — builds the debug WASM (via `build:ddrm-decrypt-debug` task), then runs pc2-node under inspector. Requires the [`ms-vscode.wasm-dwarf-debugging`](https://marketplace.visualstudio.com/items?itemName=ms-vscode.wasm-dwarf-debugging) extension. Breakpoints in `pc2-node/crates/ddrm-decrypt/src/*.rs` fire while the binary is loaded by `WasmDdrmDecryptRuntime` and called by a live request.
- **`Rust: debug ddrm-decrypt unit tests`** — LLDB-attached host build of all tests (`aarch64-apple-darwin` to override the wasm32-wasip1 default).
- **`Rust: debug single ddrm-decrypt test (prompt)`** — same but prompts for a specific test name.
- **`Node: debug ddrm-decrypt spike (full / minimal)`** — runs the spike scripts that exercise the WASM via the runtime bridge.

Tasks: `.vscode/tasks.json` has `build:gui`, `build:pc2-backend`, `build:ddrm-decrypt-debug`, and the combined `build:pc2-node+ddrm-decrypt-debug` used as the preLaunch for the DWARF live-debug config.

### Spike scripts

Standalone scripts that exercise the runtime end-to-end without spinning up the full backend:

- [`pc2-node/scripts/spike-ddrm-decrypt.ts`](../../pc2-node/scripts/spike-ddrm-decrypt.ts) — full: create, sign + verify with WebCrypto, lookup, 8-way concurrent create, drop.
- [`pc2-node/scripts/spike-ddrm-decrypt-min.ts`](../../pc2-node/scripts/spike-ddrm-decrypt-min.ts) — minimal: just enough to verify WASI init + session_create.

Run from repo root: `npx tsx pc2-node/scripts/spike-ddrm-decrypt.ts`.

---

## 11. File map

### Server

| Path | Purpose |
|---|---|
| `pc2-node/crates/ddrm-decrypt/` | The WASM crate (Rust). All keys + CEKs live here. |
| `pc2-node/src/services/wasm/WasmDdrmDecryptRuntime.ts` | Long-lived JS bridge. Lazy load, sha pin, lock, trap-reload. |
| `pc2-node/src/services/session/BackendSessionService.ts` | Session lifecycle. `FileSessionStore` + factory dispatch. |
| `pc2-node/src/api/chipotle-client.ts` | `BackendSessionView`, `WasmSessionView`, `ISessionView`, `ICencDecryptor`, `recoverCEKEnvelope`, canonicalize, P-256 decompress. |
| `pc2-node/src/api/middleware/secureViewSession.ts` | `requireSecureViewSession` — token lookup + factory dispatch + ownership check. |
| `pc2-node/src/api/storage.ts` | `/lit/begin-session`, `/lit/complete-session`, `/lit/renew-session`, `/lit/secure-view`, `decryptAssetTwoLayer`, `renderViaWASM`, `recoverWithSession`, `cekSessionCache`, `wasmRequestCache`. |
| `pc2-node/src/api/media.ts` | `/media/init`, `/media/segment`, `recoverMediaCEK`, `MediaCekHandle`. |
| `pc2-node/src/services/media/sessionManager.ts` | `MediaSession`, `mediaSessionManager`. |
| `pc2-node/wasm-renderer/src/lib.rs` | `ddrm-renderer` crate. `mode: 'render_only'` lives here. |
| `pc2-node/data/lit-actions/universal-decrypt-chipotle.js` | The deployed Lit Action source. CID pinned in `chipotle-client.ts`. |
| `pc2-node/scripts/build-wasm.sh` | Per-crate build orchestrator. Supports `--debug` flag. |
| `pc2-node/data/sessions/` | Filesystem-backed session store (one JSON file per session). |
| `pc2-node/wasm-apps/ddrm-decrypt/` | Built `.wasm` + `capsule.json` (sha-pinned). |

### Client

| Path | Purpose |
|---|---|
| `pc2-node/src/wallet-bridge/pc2-secure-view.js` | Parent-frame secure-view manager. Owns the IndexedDB token. Source of truth. |
| `pc2-node/src/wallet-bridge/pc2-wallet-bridge.js` | Iframe ↔ parent RPC. Forwards `pc2_secureView_sign` to `pc2-secure-view.js`. |
| `pc2-node/frontend/pc2-secure-view.js` | Deployed mirror — keep in sync with the source. |
| `pc2-node/frontend/pc2-wallet-bridge.js` | Same. |
| `pc2-node/frontend/index.html` | Loads both with cache-buster `?v=YYYYMMDDx`. |
| `pc2-node/scripts/build-frontend.js` | Same cache-buster reference; bump both when scripts change. |
| `pc2-node/data/test-apps/ddrm-viewer/viewer.js` | PDF/EPUB iframe. Calls `pc2_secureView_sign` + retries on 401. |
| `pc2-node/data/test-apps/pc2-media-runtime/player.js` | Video iframe. Same pattern for `/media/init|segment`. |
| `pc2-node/data/installed-apps/ddrm-viewer/viewer.js` | Deployed mirror. |
| `pc2-node/data/installed-apps/pc2-media-runtime/player.js` | Deployed mirror. |
| `pc2-node/frontend/pc2-secure-view-session.js` | IndexedDB helper. Token-only schema. |

### Docs & tasks

| Path | Purpose |
|---|---|
| `docs/core/DDRM_DECRYPT_RUNTIME.md` | **This document.** |
| `docs/core/DDRM_SESSION_ARCHITECTURE.md` | Predecessor doc — describes the server-owned P-256 session model before the WASM backend landed. |
| `docs/core/CHIPOTLE_V3_PROTOCOL.md` | The universal Lit Action protocol. |
| `.cursor/tasks/DDRM-DECRYPT-WASM/` | Original task plan for this work. |
| `.cursor/tasks/DDRM-SESSION-CEK-REFACTOR/` | Plan for the predecessor task. |
| `.vscode/launch.json` | Debug configurations (Rust tests, WASM DWARF live debug, Node debug). |
| `.vscode/tasks.json` | Build orchestration referenced by the launch configs. |

---

## 12. Operational notes

### Environment variables

| Var | Purpose | Default |
|---|---|---|
| `PC2_DDRM_BACKEND` | Override the default backend used by `/lit/begin-session` when the client doesn't specify. Values: `js`, `wasm`. | `wasm` (server hardcoded fallback) |
| `LIT_BACKEND` | Selects Lit network (`chipotle` is the only supported value today). | `chipotle` |
| `NON_MEDIA_ACTION_CID` | Pinned CID of the universal decrypt Lit Action. | Set in deployment config |

### Rollback to JS backend

If a WASM-side regression manifests in production:

```sh
PC2_DDRM_BACKEND=js npm start
```

All new sessions will use the JS backend (existing JS-backed StoredSessions still resurrect normally — they survive restart). WASM-backed sessions die on restart anyway; client re-bootstraps with `backend='js'`. No data migration needed.

### Capsule sha verification

The runtime verifies the WASM binary's SHA-256 against `capsule.json` at load. If a build step updates the binary but not the manifest (or vice versa), the runtime refuses to load with `sha256 mismatch`. To resolve: re-run `build-wasm.sh ddrm-decrypt` which atomically updates both.

### What "session_token_invalid" actually means

If a user sees the error in dev tools after the retry logic completes (i.e., the second request also returns 401), the chain to debug:

1. **Bridge log**: `[PC2 Bridge] OK pc2_secureView_sign | kid=… | refresh=true` — confirms `refresh: true` made it through (added in latest fix; absence means stale `pc2-wallet-bridge.js` is loaded — bump cache-buster).
2. **`pc2-secure-view.js` log**: `signRequest: refresh requested — clearing cached token` — confirms revoke ran.
3. **Server log**: `[BackendSessionService] Created session sess-… backend=wasm` — confirms a fresh session was created.
4. **Server log**: `[BackendSessionService] Loaded N session(s); pruned … wasm-backed (unrecoverable after restart)` — explains why WASM-backed sessions are gone after restart.

If all four log lines appear and the retry still 401s, the WASM runtime is failing to load — check `[WasmDdrmDecryptRuntime] loaded ddrm-decrypt sha256=…` at boot.

### Performance characteristics

- **WASM init** (per Node process): ~10 ms compile + instantiate + `wasi.start`.
- **Session create**: ~1 ms (P-256 keygen via OsRng).
- **Envelope unwrap**: <1 ms (P-256 ECDH + AES-256-CBC of ~80-byte ciphertext).
- **Asset decrypt** (AES-256-GCM): ~50 MB/s in WASM, ~150 MB/s in node:crypto. For PDF/EPUB-sized blobs (typically <10 MB), this is negligible.
- **Segment decrypt** (AES-128-CTR via CENC walk): ~100 MB/s. A 1-second video segment (~500 KB) decrypts in <5 ms.

### Memory bounds

- L1 sessions: ~200 bytes per session in WASM. Unbounded growth — relies on `session_drop` (currently not called automatically). 10k sessions = ~2 MB.
- L2 requests: 32 bytes CEK + ~80 bytes overhead per request. 2h TTL + `sweep_expired_requests` on each unwrap keeps it bounded.
- JS-side caches (`cekSessionCache`, `wasmRequestCache`): each capped at `CEK_CACHE_MAX_ENTRIES` (1000), LRU evicted.

---

## Glossary

- **CEK** — Content Encryption Key. AES-128 (16 bytes) for CENC video, AES-256 (32 bytes) for two-layer assets.
- **kid** — Key ID. Hex string identifying which CEK applies to a piece of content. On-chain access check uses this.
- **delegation** — Wallet-signed canonical JSON authorizing a session keypair to act on the wallet's behalf for `MAX_DELEGATION_TTL_SECONDS` (24h).
- **session** — The server-owned P-256 keypair + its associated delegation. Identified by `sessionId` (UUID for WASM, publicKeyHex for JS).
- **request handle** (WASM L2) — opaque u32 returned by `session_unwrap_envelope`. The only valid argument to `request_decrypt_*` calls. Has a 2h TTL inside WASM.
- **bearer token** — opaque 32-byte hex issued by `confirmSession`. The only secret the browser holds.
- **ECDH envelope** — binary wire format produced by the Lit Action: wraps the CEK to the session's public key.
- **ICencDecryptor** — interface that abstracts "decrypt this thing" so JS and WASM backends are swappable.
- **L1** — long-lived registry inside `ddrm-decrypt` mapping session handle → P-256 keypair.
- **L2** — short-lived registry inside `ddrm-decrypt` mapping request handle → unwrapped CEK + TTL.
