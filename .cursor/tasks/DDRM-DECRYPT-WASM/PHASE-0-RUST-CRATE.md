# Phase 0 — Rust Crate `ddrm-decrypt`

**Parent**: [DDRM-DECRYPT-WASM.md](DDRM-DECRYPT-WASM.md)
**Status**: Planned

## Objective

Stand up the `ddrm-decrypt` Rust crate that compiles to `wasm32-wasip1` as a `cdylib` and exports a flat C ABI covering:
- P-256 session keypair management (L1)
- ECDH envelope unwrap (HEADER | ephPub | iv | sig | wrappedCek)
- CENC AES-128-CTR sample decryption
- Two-layer in-WASM state (sessions, requests)

Includes Rust-side unit tests verifying envelope round-trip and AES-CTR parity against the existing `cenc-decrypt` crate.

## Inputs

- `pc2-node/crates/cenc-decrypt/src/cenc.rs` and `mp4box.rs` — copy the CENC sample-walking + AES-CTR logic verbatim. The user confirmed `cenc-decrypt` will be deprecated later, so we own a copy outright rather than depending on it.
- Existing `chipotle-client.ts` → `unwrapECDHEnvelope` function — Rust mirror of the same algorithm (envelope layout, KDF, AES-GCM unwrap).

## Steps

### 0.1 — Create crate skeleton

```
pc2-node/crates/ddrm-decrypt/
  Cargo.toml
  src/
    lib.rs          # C ABI exports
    state.rs        # SESSIONS / REQUESTS thread_local registries
    session.rs      # P-256 keygen, sign, unwrap_envelope
    request.rs      # CEK lifetime (Zeroizing<[u8; 32]>), TTL
    envelope.rs     # parse + ECDH + HKDF + AES-GCM unwrap
    cenc.rs         # copied from cenc-decrypt + adapted to use CEK by request_handle
    mp4box.rs       # copied from cenc-decrypt
    error.rs        # ErrorCode enum, conversion to i32 return codes
```

`Cargo.toml` deps (versions to confirm against existing `Cargo.lock`):

```toml
[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
p256 = { version = "0.13", features = ["ecdsa", "ecdh", "pem"] }
hkdf = "0.12"
sha2 = "0.10"
aes = "0.8"
ctr = "0.9"
aes-gcm = "0.10"
zeroize = { version = "1", features = ["zeroize_derive"] }
rand_core = "0.6"
getrandom = "0.2"   # wasm32-wasip1 satisfies this via random_get
base64 = "0.22"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
strip = true
panic = "abort"     # required: trap surfaces to JS bridge for reload
```

### 0.2 — State registries (`state.rs`)

```rust
use std::cell::RefCell;
use std::collections::HashMap;

thread_local! {
    pub static SESSIONS: RefCell<HashMap<u32, SessionState>> = RefCell::new(HashMap::new());
    pub static REQUESTS: RefCell<HashMap<u32, RequestState>> = RefCell::new(HashMap::new());
    pub static NEXT_HANDLE: RefCell<u32> = RefCell::new(1);
    pub static SESSION_ID_INDEX: RefCell<HashMap<String, u32>> = RefCell::new(HashMap::new());
}

pub fn next_handle() -> u32 { /* atomic-like increment */ }
```

### 0.3 — Session state (`session.rs`)

```rust
use p256::ecdsa::{SigningKey, Signature};
use p256::ecdh::EphemeralSecret;
use zeroize::Zeroizing;

pub struct SessionState {
    pub session_id: String,                          // uuid v4
    pub signing_key: SigningKey,                     // ECDSA P-256
    pub public_key_jwk: String,                      // serialized once on create
    pub created_at: u64,
}

pub fn create() -> (u32, String /* session_id */, String /* pk_jwk */) { ... }
pub fn sign(handle: u32, payload: &[u8]) -> Result<Vec<u8>, ErrorCode> { ... }
pub fn unwrap_envelope(handle: u32, env: &[u8]) -> Result<u32 /* request_handle */, ErrorCode> {
    // parse, ECDH with session SK + envelope ephPub, HKDF-SHA256 → AES-GCM key,
    // verify signature, unwrap CEK (32 bytes), store in REQUESTS with TTL=5min,
    // return request_handle
}
```

Critical: `unwrap_envelope` stores the unwrapped CEK as `Zeroizing<[u8; 32]>` inside `RequestState`. It is never returned or otherwise serialized out.

### 0.4 — Request state (`request.rs`)

```rust
pub struct RequestState {
    pub cek: Zeroizing<[u8; 32]>,
    pub created_at: u64,
    pub expires_at: u64,
}
// Drop impl is automatic via Zeroizing
```

### 0.5 — CENC decrypt (`cenc.rs`)

Copy `cenc-decrypt::cenc` and `mp4box.rs`. Adapt the entry point so it takes `request_handle: u32` instead of `cek_b64: &str`. Internally:

```rust
pub fn decrypt_chunk(req_handle: u32, kid: &[u8], iv: &[u8], ct: &[u8]) -> Result<Vec<u8>, ErrorCode> {
    REQUESTS.with(|r| {
        let map = r.borrow();
        let st = map.get(&req_handle).ok_or(ErrorCode::UnknownRequest)?;
        if now() > st.expires_at { return Err(ErrorCode::RequestExpired); }
        // existing AES-CTR walk with &*st.cek as the key
        cenc::aes_ctr_walk(&*st.cek, kid, iv, ct)
    })
}
```

The CEK never leaves the `with` closure. It is referenced as `&[u8; 32]` only.

### 0.6 — C ABI surface (`lib.rs`)

```rust
#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 { ... }
#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) { ... }

#[no_mangle]
pub extern "C" fn session_create(out_id_ptr: *mut u8, out_id_cap: usize,
                                  out_jwk_ptr: *mut u8, out_jwk_cap: usize) -> u32 { /* handle */ }

#[no_mangle]
pub extern "C" fn session_sign(handle: u32, payload_ptr: *const u8, payload_len: usize,
                                out_ptr: *mut u8, out_cap: usize) -> i32 { /* len or -err */ }

#[no_mangle]
pub extern "C" fn session_unwrap_envelope(handle: u32, env_ptr: *const u8, env_len: usize) -> i32 {
    // returns request_handle as positive i32, or negative ErrorCode
}

#[no_mangle]
pub extern "C" fn request_decrypt_chunk(req_handle: u32,
                                         kid_ptr: *const u8, kid_len: usize,
                                         iv_ptr: *const u8, iv_len: usize,
                                         ct_ptr: *const u8, ct_len: usize,
                                         out_ptr: *mut u8, out_cap: usize) -> i32 { ... }

#[no_mangle]
pub extern "C" fn request_drop(req_handle: u32) -> i32 { ... }

#[no_mangle]
pub extern "C" fn session_drop(handle: u32) -> i32 { ... }

#[no_mangle]
pub extern "C" fn session_lookup(id_ptr: *const u8, id_len: usize) -> i32 {
    // returns handle (positive) or 0 if not found
}
```

All "out buffer + capacity" exports return `i32` length on success, negative `ErrorCode` on failure. Caller pre-allocates via `alloc`.

### 0.7 — Error code enum (`error.rs`)

```rust
#[repr(i32)]
pub enum ErrorCode {
    Ok = 0,
    UnknownSession = -1,
    UnknownRequest = -2,
    BadEnvelope = -3,
    BadSignature = -4,
    DecryptFailed = -5,
    RequestExpired = -6,
    BufferTooSmall = -7,
    InvalidArg = -8,
    Internal = -99,
}
```

### 0.8 — Build script extension

`pc2-node/scripts/build-wasm.sh` already supports per-crate builds. Add `ddrm-decrypt` to `CRATE_DIRS`, `OUTPUT_DIRS`, and `WASM_OPT_LEVEL` (`-O3` — crypto crate). It builds with `cargo build --release --target wasm32-wasip1` but **as a library, not a bin** — so we change the `cargo build` line to use `--lib` for crates without a `[[bin]]` section, or add a no-op `main.rs` that just exits 0 to keep the existing `--bin` build path. Choose the `--lib` route: simpler, smaller binary.

Modify build_crate() in build-wasm.sh:
```bash
if [ -f "$crate_dir/src/main.rs" ]; then
  cargo build --release --target "$TARGET" --bin "$name"
  local wasm_path="$crate_dir/target/$TARGET/$PROFILE/$name.wasm"
else
  cargo build --release --target "$TARGET" --lib
  local wasm_path="$crate_dir/target/$TARGET/$PROFILE/${name//-/_}.wasm"
fi
```

### 0.9 — Capsule manifest

Create `pc2-node/wasm-apps/ddrm-decrypt/capsule.json` with crate name, semver, declared exports list. The build script auto-fills `sha256`.

## Verification

### Rust unit tests (`cargo test --lib`)

- `session::create` produces a 32-byte private key, public point on P-256 curve.
- `session::sign` then verify-with-public-key round-trips.
- `envelope::wrap` (test-only helper that mirrors the production wrap path) + `envelope::unwrap` recovers the original CEK byte-for-byte.
- `cenc::decrypt_chunk` against a fixture sample previously decrypted by `cenc-decrypt` produces identical bytes.
- `request::drop` zeros the CEK (use a small `unsafe` peek into the inner buffer to assert all zeros after drop — gated behind `#[cfg(test)]`).
- `state::sweep_expired` removes requests past TTL.

### Build verification

- `bash pc2-node/scripts/build-wasm.sh ddrm-decrypt` produces a `.wasm` file < 500 KB after `wasm-opt -O3`.
- `wasm-objdump -x` shows the expected `session_create`, `session_unwrap_envelope`, `request_decrypt_chunk`, etc. exports.

## Exit criteria

- Crate builds cleanly with the existing build script.
- All Rust unit tests pass.
- Output `.wasm` registered with capsule.json and sha256.
- No JS-side code changes yet — that's Phase 1.
