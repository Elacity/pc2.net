//! WASI entry point. The body of `main` is a no-op — we never actually run
//! the binary as a command. Its sole purpose is to make Rust emit `_start`
//! (which runs `__wasm_call_ctors` for std initialization) and to root the
//! `#[no_mangle]` C-ABI exports from `lib.rs` so the linker keeps them.
//!
//! The JS bridge calls `wasi.start(instance)` exactly once at load time. That
//! invocation runs `main` (a no-op) and then exits via `__wasi_proc_exit(0)`,
//! which wasmer catches as normal completion. The instance's exports remain
//! callable for the rest of the process lifetime.

use ddrm_decrypt as lib;

fn main() {
    // Reference every C-ABI export so the linker treats them as live and
    // includes them in the final binary. Without these references the bin
    // would link only `main` and the lib symbols would be dead-code-eliminated.
    let roots: &[*const ()] = &[
        lib::alloc as *const (),
        lib::dealloc as *const (),
        lib::session_create as *const (),
        lib::session_get_session_id as *const (),
        lib::session_get_public_key as *const (),
        lib::session_sign as *const (),
        lib::session_unwrap_envelope as *const (),
        lib::session_lookup as *const (),
        lib::session_drop as *const (),
        lib::request_decrypt_chunk as *const (),
        lib::request_decrypt_segment as *const (),
        lib::request_decrypt_asset as *const (),
        lib::request_drop as *const (),
        lib::debug_session_count as *const (),
        lib::debug_request_count as *const (),
    ];
    // Volatile read to defeat optimizer "this array is never observed" pass.
    let sum: usize = roots.iter().map(|p| *p as usize).sum();
    std::hint::black_box(sum);
}
