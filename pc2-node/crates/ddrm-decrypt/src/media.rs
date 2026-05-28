//! Higher-level decrypt operations that look up the CEK by request handle and
//! invoke `cenc::` / direct AES-CTR. The CEK is borrowed via a `&[u8]` from
//! the registry and never copied out — these functions are the only places in
//! WASM where key bytes touch a cipher primitive.
//!
//! Public functions never accept or return a CEK; only `request_handle: u32`.

use aes::cipher::{KeyIvInit, StreamCipher};
use aes_gcm::{aead::{Aead, KeyInit, Payload}, Aes256Gcm, Nonce};

use crate::cenc;
use crate::error::ErrorCode;
use crate::mp4box;
use crate::state::{now_secs, REQUESTS};
use crate::strip;

type Aes128Ctr = ctr::Ctr128BE<aes::Aes128>;

/// Decrypt a single AES-128-CTR chunk with the CEK held by the given request.
///
/// `kid` is currently informational (CENC sample KID) — there is one CEK per
/// request so KID-based key selection is not needed. We sanity-check the
/// shape and otherwise ignore it.
pub fn decrypt_chunk(
    req_handle: u32,
    _kid: &[u8],
    iv: &[u8],
    ciphertext: &[u8],
) -> Result<Vec<u8>, ErrorCode> {
    with_request_cek(req_handle, |cek| {
        if cek.len() < 16 {
            return Err(ErrorCode::DecryptFailed);
        }
        let key: [u8; 16] = cek[..16].try_into().unwrap();
        let iv16 = pad_iv_to_16(iv)?;
        let mut out = ciphertext.to_vec();
        let mut cipher = Aes128Ctr::new(&key.into(), &iv16.into());
        cipher.apply_keystream(&mut out);
        Ok(out)
    })
}

/// Decrypt a complete fMP4/DASH segment. Walks moof/traf/senc, decrypts each
/// sample in-place inside the mdat, optionally strips encryption metadata.
pub fn decrypt_segment(
    req_handle: u32,
    init_segment: Option<&[u8]>,
    segment: &[u8],
    strip_metadata: bool,
) -> Result<Vec<u8>, ErrorCode> {
    with_request_cek(req_handle, |cek| {
        if cek.len() < 16 {
            return Err(ErrorCode::DecryptFailed);
        }
        let key: [u8; 16] = cek[..16].try_into().unwrap();

        // Determine IV size from init segment's tenc (default 8).
        let iv_size = init_segment
            .and_then(mp4box::parse_init_for_tenc)
            .map(|t| {
                if t.default_per_sample_iv_size > 0 {
                    t.default_per_sample_iv_size
                } else {
                    8
                }
            })
            .unwrap_or(8);

        let parsed = mp4box::parse_segment(segment, iv_size).map_err(|_| ErrorCode::DecryptFailed)?;
        let traf = match &parsed.traf {
            Some(t) => t,
            None => return Ok(segment.to_vec()), // Unencrypted passthrough
        };
        let senc = match &traf.senc {
            Some(s) => s,
            None => return Ok(segment.to_vec()),
        };
        let trun_entries = traf.trun.as_ref().map(|t| &t.entries[..]).unwrap_or(&[]);

        let mdat = &segment[parsed.mdat_offset..parsed.mdat_offset + parsed.mdat_size];
        let decrypted = cenc::decrypt_samples(mdat, &key, trun_entries, &senc.samples, 0)
            .map_err(|_| ErrorCode::DecryptFailed)?;

        let mut output = Vec::with_capacity(segment.len());
        output.extend_from_slice(&segment[..parsed.mdat_offset]);
        output.extend_from_slice(&decrypted);
        let mdat_end = parsed.mdat_offset + parsed.mdat_size;
        if mdat_end < segment.len() {
            output.extend_from_slice(&segment[mdat_end..]);
        }

        let final_output = if strip_metadata {
            strip::strip_segment_encryption_boxes(&output)
        } else {
            output
        };
        Ok(final_output)
    })
}

/// Decrypt a full Chipotle two-layer asset envelope with AES-256-GCM.
///
/// `ciphertext` is `payload || authTag` — the trailing 16 bytes are the GCM
/// authentication tag, matching the convention used by Node's
/// `createDecipheriv('aes-256-gcm', ...)` (where `setAuthTag` is called
/// separately, but we accept the concatenated form to keep the FFI surface
/// minimal). `iv` is the GCM nonce — 12 bytes is standard but the underlying
/// cipher accepts up to 2^32-1 bytes; we forward whatever is provided.
///
/// Requires a 32-byte (AES-256) CEK. CENC media-segment paths that use a
/// 16-byte CEK should use `decrypt_segment` instead.
pub fn decrypt_asset(
    req_handle: u32,
    iv: &[u8],
    ciphertext: &[u8],
) -> Result<Vec<u8>, ErrorCode> {
    with_request_cek(req_handle, |cek| {
        if cek.len() != 32 {
            return Err(ErrorCode::DecryptFailed);
        }
        if iv.is_empty() {
            return Err(ErrorCode::InvalidArg);
        }
        // aes-gcm expects payload || tag concatenated, which is exactly what
        // the JS side already produces (Chipotle stores ciphertext + tag in a
        // single base64 blob). No splitting required.
        let cipher = Aes256Gcm::new(cek.into());
        let nonce = Nonce::from_slice(iv);
        cipher
            .decrypt(nonce, Payload { msg: ciphertext, aad: &[] })
            .map_err(|_| ErrorCode::DecryptFailed)
    })
}

/// Borrow the CEK from the request registry for the duration of `f`. The
/// closure receives `&[u8]` only — the CEK can never be moved out.
fn with_request_cek<F, T>(req_handle: u32, f: F) -> Result<T, ErrorCode>
where
    F: FnOnce(&[u8]) -> Result<T, ErrorCode>,
{
    REQUESTS.with(|r| {
        let map = r.borrow();
        let st = map.get(&req_handle).ok_or(ErrorCode::UnknownRequest)?;
        if now_secs() > st.expires_at {
            return Err(ErrorCode::RequestExpired);
        }
        f(&st.cek)
    })
}

fn pad_iv_to_16(iv: &[u8]) -> Result<[u8; 16], ErrorCode> {
    let mut out = [0u8; 16];
    match iv.len() {
        16 => out.copy_from_slice(iv),
        8 => out[..8].copy_from_slice(iv),
        0 => {} // all-zero IV
        _ => return Err(ErrorCode::InvalidArg),
    }
    Ok(out)
}
