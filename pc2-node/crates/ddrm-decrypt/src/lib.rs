//! `ddrm-decrypt` — WASM-contained dDRM decrypt runtime.
//!
//! Owns:
//!   - L1: a registry of P-256 sessions keyed by `session_id` and `handle`.
//!   - L2: a registry of unwrapped CEKs keyed by `request_handle`, each in
//!     `Zeroizing` storage so it's scrubbed from linear memory on drop.
//!
//! Exposes a flat C ABI. Negative return values are `ErrorCode`; positive
//! return values are handles or byte lengths. Zero on lookup means "not found"
//! and is not an error.
//!
//! The CEK never leaves WASM linear memory. The only public way to use it is
//! through `request_decrypt_*` exports, which read the CEK by reference and
//! call AES primitives in this same module.

pub mod cenc;
pub mod envelope;
pub mod error;
pub mod media;
pub mod mp4box;
pub mod request;
pub mod session;
pub mod state;
pub mod strip;

use error::ErrorCode;

// ── Memory marshaling helpers ───────────────────────────────────────────

/// Allocate `size` bytes inside WASM linear memory and return the pointer.
/// Caller is responsible for matching `dealloc` (typically deferred to the
/// JS bridge after the call returns).
#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(size);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// Free a buffer previously returned by `alloc`. Must be called with the
/// same `size` that was passed to `alloc`.
#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    if ptr.is_null() || size == 0 {
        return;
    }
    unsafe {
        let _ = Vec::from_raw_parts(ptr, 0, size);
    }
}

// ── Internal helpers ────────────────────────────────────────────────────

unsafe fn read_input<'a>(ptr: *const u8, len: usize) -> Result<&'a [u8], ErrorCode> {
    if ptr.is_null() && len != 0 {
        return Err(ErrorCode::InvalidArg);
    }
    if len == 0 {
        return Ok(&[]);
    }
    Ok(core::slice::from_raw_parts(ptr, len))
}

unsafe fn write_output(out_ptr: *mut u8, out_cap: usize, data: &[u8]) -> Result<i32, ErrorCode> {
    if out_ptr.is_null() {
        return Err(ErrorCode::InvalidArg);
    }
    if data.len() > out_cap {
        return Err(ErrorCode::BufferTooSmall);
    }
    if !data.is_empty() {
        core::ptr::copy_nonoverlapping(data.as_ptr(), out_ptr, data.len());
    }
    Ok(data.len() as i32)
}

fn ok_or_code<T: Into<i32>>(r: Result<T, ErrorCode>) -> i32 {
    match r {
        Ok(v) => v.into(),
        Err(e) => e.into(),
    }
}

// ── Session lifecycle ──────────────────────────────────────────────────

/// Create a new P-256 session. Returns the positive `u32` session handle on
/// success or a negative `ErrorCode`. Use `session_get_session_id` and
/// `session_get_public_key` to read the session id and 33-byte compressed
/// public key respectively.
#[no_mangle]
pub extern "C" fn session_create() -> i32 {
    let (handle, _id, _pk) = session::create_session();
    handle as i32
}

#[no_mangle]
pub extern "C" fn session_get_session_id(handle: u32, out_ptr: *mut u8, out_cap: usize) -> i32 {
    let id = state::SESSIONS.with(|s| s.borrow().get(&handle).map(|st| st.session_id.clone()));
    let id = match id {
        Some(s) => s,
        None => return ErrorCode::UnknownSession.into(),
    };
    unsafe { ok_or_code(write_output(out_ptr, out_cap, id.as_bytes())) }
}

#[no_mangle]
pub extern "C" fn session_get_public_key(handle: u32, out_ptr: *mut u8, out_cap: usize) -> i32 {
    let pk = state::SESSIONS.with(|s| s.borrow().get(&handle).map(|st| st.public_key_compressed));
    let pk = match pk {
        Some(p) => p,
        None => return ErrorCode::UnknownSession.into(),
    };
    unsafe { ok_or_code(write_output(out_ptr, out_cap, &pk)) }
}

#[no_mangle]
pub extern "C" fn session_sign(
    handle: u32,
    payload_ptr: *const u8,
    payload_len: usize,
    out_ptr: *mut u8,
    out_cap: usize,
) -> i32 {
    unsafe {
        let payload = match read_input(payload_ptr, payload_len) {
            Ok(s) => s,
            Err(e) => return e.into(),
        };
        match session::sign(handle, payload) {
            Ok(sig) => ok_or_code(write_output(out_ptr, out_cap, &sig)),
            Err(e) => e.into(),
        }
    }
}

/// Returns the positive request handle on success, or a negative error code.
#[no_mangle]
pub extern "C" fn session_unwrap_envelope(
    handle: u32,
    env_ptr: *const u8,
    env_len: usize,
) -> i32 {
    unsafe {
        let env = match read_input(env_ptr, env_len) {
            Ok(s) => s,
            Err(e) => return e.into(),
        };
        match session::unwrap_envelope(handle, env) {
            Ok(req) => req as i32,
            Err(e) => e.into(),
        }
    }
}

/// Returns the session handle (positive) if found, 0 if not found, or a
/// negative error code on bad argument.
#[no_mangle]
pub extern "C" fn session_lookup(id_ptr: *const u8, id_len: usize) -> i32 {
    unsafe {
        let id_bytes = match read_input(id_ptr, id_len) {
            Ok(s) => s,
            Err(e) => return e.into(),
        };
        let id = match core::str::from_utf8(id_bytes) {
            Ok(s) => s,
            Err(_) => return ErrorCode::InvalidArg.into(),
        };
        session::lookup_by_session_id(id).map(|h| h as i32).unwrap_or(0)
    }
}

#[no_mangle]
pub extern "C" fn session_drop(handle: u32) -> i32 {
    match session::drop_session(handle) {
        Ok(()) => 0,
        Err(e) => e.into(),
    }
}

// ── Request (L2) operations ────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn request_decrypt_chunk(
    req_handle: u32,
    kid_ptr: *const u8,
    kid_len: usize,
    iv_ptr: *const u8,
    iv_len: usize,
    ct_ptr: *const u8,
    ct_len: usize,
    out_ptr: *mut u8,
    out_cap: usize,
) -> i32 {
    unsafe {
        let kid = match read_input(kid_ptr, kid_len) {
            Ok(s) => s,
            Err(e) => return e.into(),
        };
        let iv = match read_input(iv_ptr, iv_len) {
            Ok(s) => s,
            Err(e) => return e.into(),
        };
        let ct = match read_input(ct_ptr, ct_len) {
            Ok(s) => s,
            Err(e) => return e.into(),
        };
        match media::decrypt_chunk(req_handle, kid, iv, ct) {
            Ok(pt) => ok_or_code(write_output(out_ptr, out_cap, &pt)),
            Err(e) => e.into(),
        }
    }
}

#[no_mangle]
pub extern "C" fn request_decrypt_segment(
    req_handle: u32,
    init_ptr: *const u8,
    init_len: usize,
    seg_ptr: *const u8,
    seg_len: usize,
    strip_metadata: u32,
    out_ptr: *mut u8,
    out_cap: usize,
) -> i32 {
    unsafe {
        let init = if init_len == 0 {
            None
        } else {
            match read_input(init_ptr, init_len) {
                Ok(s) => Some(s),
                Err(e) => return e.into(),
            }
        };
        let seg = match read_input(seg_ptr, seg_len) {
            Ok(s) => s,
            Err(e) => return e.into(),
        };
        match media::decrypt_segment(req_handle, init, seg, strip_metadata != 0) {
            Ok(pt) => ok_or_code(write_output(out_ptr, out_cap, &pt)),
            Err(e) => e.into(),
        }
    }
}

#[no_mangle]
pub extern "C" fn request_decrypt_asset(
    req_handle: u32,
    iv_ptr: *const u8,
    iv_len: usize,
    ct_ptr: *const u8,
    ct_len: usize,
    out_ptr: *mut u8,
    out_cap: usize,
) -> i32 {
    unsafe {
        let iv = match read_input(iv_ptr, iv_len) {
            Ok(s) => s,
            Err(e) => return e.into(),
        };
        let ct = match read_input(ct_ptr, ct_len) {
            Ok(s) => s,
            Err(e) => return e.into(),
        };
        match media::decrypt_asset(req_handle, iv, ct) {
            Ok(pt) => ok_or_code(write_output(out_ptr, out_cap, &pt)),
            Err(e) => e.into(),
        }
    }
}

#[no_mangle]
pub extern "C" fn request_drop(req_handle: u32) -> i32 {
    let removed = state::REQUESTS.with(|r| r.borrow_mut().remove(&req_handle).is_some());
    if removed {
        0
    } else {
        ErrorCode::UnknownRequest.into()
    }
}

// ── Diagnostics ────────────────────────────────────────────────────────

/// Returns the number of currently live sessions. For tests / observability.
#[no_mangle]
pub extern "C" fn debug_session_count() -> i32 {
    state::SESSIONS.with(|s| s.borrow().len() as i32)
}

/// Returns the number of currently live requests. For tests / observability.
#[no_mangle]
pub extern "C" fn debug_request_count() -> i32 {
    state::REQUESTS.with(|r| r.borrow().len() as i32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alloc_dealloc_round_trip() {
        let p = alloc(1024);
        assert!(!p.is_null());
        // Write a sentinel and read it back.
        unsafe {
            *p.add(0) = 0x42;
            assert_eq!(*p.add(0), 0x42);
        }
        dealloc(p, 1024);
    }

    #[test]
    fn write_output_buffer_too_small() {
        let buf = [0u8; 4];
        let data = [1u8, 2, 3, 4, 5];
        unsafe {
            let r = write_output(buf.as_ptr() as *mut u8, buf.len(), &data);
            assert_eq!(r.unwrap_err(), ErrorCode::BufferTooSmall);
        }
    }

    #[test]
    fn session_create_and_drop_via_abi() {
        let before = debug_session_count();
        let h = session_create();
        assert!(h > 0);
        assert_eq!(debug_session_count(), before + 1);
        assert_eq!(session_drop(h as u32), 0);
        assert_eq!(debug_session_count(), before);
    }

    #[test]
    fn session_get_session_id_via_abi() {
        let h = session_create() as u32;
        let mut out = [0u8; 64];
        let n = session_get_session_id(h, out.as_mut_ptr(), out.len());
        assert!(n > 0 && n <= 36); // UUID is 36 chars
        let id = std::str::from_utf8(&out[..n as usize]).unwrap();
        assert_eq!(id.len(), 36);
        session_drop(h);
    }

    #[test]
    fn session_get_public_key_is_33_bytes_compressed() {
        let h = session_create() as u32;
        let mut out = [0u8; 33];
        let n = session_get_public_key(h, out.as_mut_ptr(), out.len());
        assert_eq!(n, 33);
        // Compressed prefix is 0x02 or 0x03.
        assert!(out[0] == 0x02 || out[0] == 0x03);
        session_drop(h);
    }

    #[test]
    fn session_lookup_round_trip() {
        let h = session_create() as u32;
        let mut id_buf = [0u8; 64];
        let n = session_get_session_id(h, id_buf.as_mut_ptr(), id_buf.len());
        let id = &id_buf[..n as usize];
        let found = session_lookup(id.as_ptr(), id.len());
        assert_eq!(found, h as i32);
        let not_found = session_lookup(b"not-a-real-id".as_ptr(), 13);
        assert_eq!(not_found, 0);
        session_drop(h);
    }

    #[test]
    fn unknown_session_drops_with_error() {
        assert_eq!(session_drop(99999), ErrorCode::UnknownSession.into());
    }
}
