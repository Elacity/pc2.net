//! L1 session state. Owns the P-256 keypair used for:
//!   - ECDSA signing of per-asset request bundles (`session_sign`)
//!   - ECDH unwrap of the CEK envelope (`session_unwrap_envelope`)
//!
//! The private key never leaves this module. It is `Zeroizing` so dropping a
//! session scrubs the scalar from linear memory.

use elliptic_curve::sec1::ToEncodedPoint;
use p256::ecdsa::signature::Signer;
use p256::ecdsa::{Signature, SigningKey};
use p256::SecretKey;
use rand_core::OsRng;
use uuid::Uuid;

use crate::envelope;
use crate::error::ErrorCode;
use crate::request::RequestState;
use crate::state::{next_handle, sweep_expired_requests, REQUESTS, SESSIONS, SESSION_ID_INDEX};

/// Default L2 (request) TTL. Originally 300s to mirror the JS-side
/// `cekSessionCache` window, but media playback needs the CEK to outlive a
/// single chunk and `MediaSession` has a 2h lifetime, so we match it. The
/// L2 is still bounded — `sweep_expired_requests` runs on each
/// `unwrap_envelope` to evict entries past TTL, and `request_drop` from JS
/// (called when the media session ends) prunes proactively.
pub const DEFAULT_REQUEST_TTL_SECS: u64 = 2 * 3600;

/// `p256::SecretKey` already implements `ZeroizeOnDrop` internally, so wrapping
/// it in `Zeroizing` would be redundant (and the type doesn't satisfy
/// `Zeroize::zeroize(&mut self)` directly — only on drop).
pub struct SessionState {
    pub session_id: String,
    /// P-256 secret key; backs both ECDSA signing and ECDH unwrap.
    /// Scrubbed on drop by `p256::SecretKey`'s ZeroizeOnDrop impl.
    pub secret_key: SecretKey,
    /// Compressed SEC1 public key (33 bytes).
    pub public_key_compressed: [u8; 33],
    pub created_at: u64,
}

/// Create a new session: generate P-256 keypair, allocate handle, return id+pubkey.
pub fn create_session() -> (u32, String, [u8; 33]) {
    let secret_key = SecretKey::random(&mut OsRng);
    let pk_point = secret_key.public_key().to_encoded_point(true);
    let pk_bytes = pk_point.as_bytes();
    debug_assert_eq!(pk_bytes.len(), 33);
    let mut pk_compressed = [0u8; 33];
    pk_compressed.copy_from_slice(pk_bytes);

    let session_id = Uuid::new_v4().to_string();
    let handle = next_handle();

    let state = SessionState {
        session_id: session_id.clone(),
        secret_key,
        public_key_compressed: pk_compressed,
        created_at: crate::state::now_secs(),
    };

    SESSIONS.with(|s| s.borrow_mut().insert(handle, state));
    SESSION_ID_INDEX.with(|i| i.borrow_mut().insert(session_id.clone(), handle));

    (handle, session_id, pk_compressed)
}

pub fn lookup_by_session_id(session_id: &str) -> Option<u32> {
    SESSION_ID_INDEX.with(|i| i.borrow().get(session_id).copied())
}

pub fn drop_session(handle: u32) -> Result<(), ErrorCode> {
    SESSIONS.with(|s| {
        let mut map = s.borrow_mut();
        let removed = map.remove(&handle).ok_or(ErrorCode::UnknownSession)?;
        SESSION_ID_INDEX.with(|i| {
            i.borrow_mut().remove(&removed.session_id);
        });
        Ok(())
    })?;
    // Also evict any requests that were tied to this session (defensive).
    REQUESTS.with(|r| {
        let mut map = r.borrow_mut();
        map.retain(|_, st| st.session_handle != handle);
    });
    Ok(())
}

/// ECDSA-P256-SHA256 sign. Returns the **raw IEEE P1363** signature
/// (`r || s`, exactly 64 bytes for P-256) — matching what WebCrypto's
/// `subtle.sign({name:'ECDSA', hash:'SHA-256'}, ...)` returns and what
/// the universal Lit Action expects. DER encoding would fail the Lit
/// Action's verifier with `req_sig_invalid`.
pub fn sign(handle: u32, payload: &[u8]) -> Result<Vec<u8>, ErrorCode> {
    SESSIONS.with(|s| {
        let map = s.borrow();
        let st = map.get(&handle).ok_or(ErrorCode::UnknownSession)?;
        let signing_key: SigningKey = SigningKey::from(&st.secret_key);
        let sig: Signature = signing_key.sign(payload);
        Ok(sig.to_bytes().to_vec())
    })
}

/// Unwrap the CEK envelope and store the resulting CEK in L2. Returns the new
/// request handle. CEK never escapes this function.
pub fn unwrap_envelope(handle: u32, envelope_bytes: &[u8]) -> Result<u32, ErrorCode> {
    sweep_expired_requests();

    let cek_blob = SESSIONS.with(|s| {
        let map = s.borrow();
        let st = map.get(&handle).ok_or(ErrorCode::UnknownSession)?;
        let parsed = envelope::parse(envelope_bytes)?;
        let plaintext = envelope::ecdh_unwrap(&st.secret_key, &parsed)?;
        let _ = plaintext.len(); // silence clippy on borrow extension
        let keys = envelope::extract_keys_blob(&plaintext)?;
        if keys.is_empty() {
            return Err(ErrorCode::BadEnvelope);
        }
        Ok(keys)
    })?;

    let req_handle = next_handle();
    let req = RequestState::new(cek_blob, handle, DEFAULT_REQUEST_TTL_SECS);
    REQUESTS.with(|r| r.borrow_mut().insert(req_handle, req));
    Ok(req_handle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_returns_unique_ids() {
        let (h1, id1, pk1) = create_session();
        let (h2, id2, pk2) = create_session();
        assert_ne!(h1, h2);
        assert_ne!(id1, id2);
        assert_ne!(pk1, pk2);
        drop_session(h1).unwrap();
        drop_session(h2).unwrap();
    }

    #[test]
    fn lookup_round_trips() {
        let (h, id, _) = create_session();
        assert_eq!(lookup_by_session_id(&id), Some(h));
        drop_session(h).unwrap();
        assert_eq!(lookup_by_session_id(&id), None);
    }

    #[test]
    fn sign_produces_verifiable_signature() {
        use p256::ecdsa::signature::Verifier;
        use p256::ecdsa::VerifyingKey;
        let (h, _, pk_bytes) = create_session();
        let payload = b"hello pc2";
        let sig_raw = sign(h, payload).unwrap();
        // Sanity: P-256 raw IEEE signatures are exactly 64 bytes (r || s).
        assert_eq!(sig_raw.len(), 64, "expected raw IEEE P1363 sig (64 bytes for P-256)");
        let sig = Signature::from_slice(&sig_raw).unwrap();
        let vk = VerifyingKey::from_sec1_bytes(&pk_bytes).unwrap();
        vk.verify(payload, &sig).unwrap();
        drop_session(h).unwrap();
    }

    #[test]
    fn drop_session_clears_requests() {
        let (h, _, _) = create_session();
        // Insert a fake request keyed to h to exercise the cleanup path.
        let fake_req = RequestState::new(vec![0u8; 16], h, 60);
        let req_handle = next_handle();
        REQUESTS.with(|r| r.borrow_mut().insert(req_handle, fake_req));
        drop_session(h).unwrap();
        REQUESTS.with(|r| assert!(!r.borrow().contains_key(&req_handle)));
    }
}
