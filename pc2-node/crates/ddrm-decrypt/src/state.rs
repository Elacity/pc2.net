//! Thread-local registries for sessions (L1) and requests (L2).
//!
//! Both registries are indexed by opaque `u32` handles. `session_id` (a UUID
//! string) is also indexed back to handle so a JS caller that only holds the
//! sessionId can resurrect the handle after process boot.

use std::cell::RefCell;
use std::collections::HashMap;

use crate::request::RequestState;
use crate::session::SessionState;

thread_local! {
    pub static SESSIONS: RefCell<HashMap<u32, SessionState>> = RefCell::new(HashMap::new());
    pub static REQUESTS: RefCell<HashMap<u32, RequestState>> = RefCell::new(HashMap::new());
    pub static SESSION_ID_INDEX: RefCell<HashMap<String, u32>> = RefCell::new(HashMap::new());
    static NEXT_HANDLE: RefCell<u32> = const { RefCell::new(1) };
}

/// Allocate a new positive `u32` handle. Returns 0 only if u32 wraps, which
/// would require billions of allocations in a single process — practically
/// unreachable but we guard against it by skipping 0 on overflow.
pub fn next_handle() -> u32 {
    NEXT_HANDLE.with(|h| {
        let mut h = h.borrow_mut();
        let v = *h;
        // Wrap-around skips 0 (reserved for "not found").
        *h = h.checked_add(1).unwrap_or(1);
        v
    })
}

/// Current monotonic time in seconds since UNIX epoch. WASI provides this via
/// `clock_time_get`; calling `SystemTime::now()` works on wasm32-wasip1.
pub fn now_secs() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Sweep expired requests. Called opportunistically on each `unwrap_envelope`
/// to keep L2 bounded. Cheap (HashMap iteration over short-lived entries).
pub fn sweep_expired_requests() {
    let now = now_secs();
    REQUESTS.with(|r| {
        let mut map = r.borrow_mut();
        map.retain(|_, st| st.expires_at > now);
    });
}
