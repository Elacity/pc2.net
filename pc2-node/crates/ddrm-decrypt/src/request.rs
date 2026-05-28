//! Per-request state (L2). Holds an unwrapped CEK in `Zeroizing` storage so
//! it is wiped from linear memory on drop.
//!
//! The CEK is the only secret here. It never leaves this struct — `decrypt_*`
//! functions in `cenc::` borrow it via a `&[u8]` reference and pass it to the
//! AES primitives.

use zeroize::Zeroizing;

use crate::state::now_secs;

pub struct RequestState {
    /// Raw CEK bytes. CENC keys are 16 bytes; we store as Vec to keep room
    /// for future key sizes without API churn. Zeroizing drops scrubs memory.
    pub cek: Zeroizing<Vec<u8>>,
    pub session_handle: u32,
    pub created_at: u64,
    pub expires_at: u64,
}

impl RequestState {
    pub fn new(cek: Vec<u8>, session_handle: u32, ttl_secs: u64) -> Self {
        let now = now_secs();
        Self {
            cek: Zeroizing::new(cek),
            session_handle,
            created_at: now,
            expires_at: now + ttl_secs,
        }
    }

    #[inline]
    pub fn is_expired(&self) -> bool {
        now_secs() > self.expires_at
    }
}
