//! ECDH envelope unwrap — mirror of `unwrapECDHEnvelope` in chipotle-client.ts.
//!
//! Envelope layout (binary, big-endian length prefixes):
//!
//!   offset 0..3   : header (3 bytes format + 1 byte version)
//!                   version byte at offset 3: 0x02 = legacy fixed-IV, 0x03 = random IV
//!   offset 4..6   : ephPubKeyLen (u16)
//!   offset 6..6+N : ephPubKey (compressed P-256, typically 33 bytes)
//!   (v=0x03 only)  AES-CBC IV (16 bytes)
//!   (v=0x02 only)  IV derived from first 16 bytes of ephPubKey
//!   next 2 bytes  : sigLen (u16)
//!   next sigLen   : signature (skipped — verified at the Lit Action layer)
//!   next 33 bytes : compressed signer public key (skipped)
//!   next 4 bytes  : encCekLen (u32)
//!   next encCekLen: AES-CBC-256 encrypted CEK blob
//!
//! Decryption (matching WebCrypto behavior):
//!   1. ECDH(session SK, eph PK)  ->  32-byte X-coordinate Z
//!   2. AES-256-CBC key = Z (full 32 bytes, no KDF — that is what WebCrypto
//!      does for deriveKey({name:'ECDH'}, ..., {name:'AES-CBC', length:256}))
//!   3. PKCS#7 unpad the decrypted blob
//!
//! The inner plaintext format is:
//!   metaSize: u32 BE | metadata: metaSize bytes |
//!   keyCount: u32 BE | keys: all remaining bytes (returned as the CEK blob)

use aes::Aes256;
use cbc::Decryptor as CbcDecryptor;
use cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
use elliptic_curve::sec1::FromEncodedPoint;
use p256::{ecdh::diffie_hellman, EncodedPoint, PublicKey, SecretKey};

use crate::error::ErrorCode;

type Aes256CbcDec = CbcDecryptor<Aes256>;

#[derive(Debug)]
pub struct ParsedEnvelope<'a> {
    pub version: u8,
    pub eph_pub_key: &'a [u8],
    pub iv: [u8; 16],
    pub encrypted_cek: &'a [u8],
}

/// Parse the envelope binary layout without doing any crypto.
pub fn parse(envelope: &[u8]) -> Result<ParsedEnvelope<'_>, ErrorCode> {
    if envelope.len() < 4 {
        return Err(ErrorCode::BadEnvelope);
    }
    let version = envelope[3];
    let mut offset = 4usize;

    // ephPubKeyLen + ephPubKey
    if offset + 2 > envelope.len() {
        return Err(ErrorCode::BadEnvelope);
    }
    let eph_len = u16::from_be_bytes([envelope[offset], envelope[offset + 1]]) as usize;
    offset += 2;
    if offset + eph_len > envelope.len() {
        return Err(ErrorCode::BadEnvelope);
    }
    let eph_pub_key = &envelope[offset..offset + eph_len];
    offset += eph_len;

    // AES-CBC IV
    let iv: [u8; 16] = if version == 0x03 {
        if offset + 16 > envelope.len() {
            return Err(ErrorCode::BadEnvelope);
        }
        let mut iv = [0u8; 16];
        iv.copy_from_slice(&envelope[offset..offset + 16]);
        offset += 16;
        iv
    } else {
        // v=0x02 derives IV from the first 16 bytes of the ephemeral pubkey.
        if eph_pub_key.len() < 16 {
            return Err(ErrorCode::BadEnvelope);
        }
        let mut iv = [0u8; 16];
        iv.copy_from_slice(&eph_pub_key[..16]);
        iv
    };

    // Skip signature + signer pubkey (verified upstream by the Lit Action).
    if offset + 2 > envelope.len() {
        return Err(ErrorCode::BadEnvelope);
    }
    let sig_len = u16::from_be_bytes([envelope[offset], envelope[offset + 1]]) as usize;
    offset += 2;
    if offset + sig_len + 33 > envelope.len() {
        return Err(ErrorCode::BadEnvelope);
    }
    offset += sig_len;
    offset += 33;

    // encCekLen + encryptedCek
    if offset + 4 > envelope.len() {
        return Err(ErrorCode::BadEnvelope);
    }
    let enc_cek_len = u32::from_be_bytes([
        envelope[offset],
        envelope[offset + 1],
        envelope[offset + 2],
        envelope[offset + 3],
    ]) as usize;
    offset += 4;
    if offset + enc_cek_len > envelope.len() {
        return Err(ErrorCode::BadEnvelope);
    }
    let encrypted_cek = &envelope[offset..offset + enc_cek_len];

    Ok(ParsedEnvelope {
        version,
        eph_pub_key,
        iv,
        encrypted_cek,
    })
}

/// Perform ECDH and AES-CBC-256 unwrap. Returns the inner plaintext (still
/// includes the metaSize / keyCount framing — the caller extracts the CEK
/// bytes via `extract_keys_blob`).
pub fn ecdh_unwrap(secret_key: &SecretKey, parsed: &ParsedEnvelope) -> Result<Vec<u8>, ErrorCode> {
    // Decompress (or accept already-uncompressed) ephemeral public key.
    let eph_pk = parse_p256_public(parsed.eph_pub_key)?;

    // ECDH: scalar * point -> shared secret (32-byte X-coordinate).
    let shared = diffie_hellman(secret_key.to_nonzero_scalar(), eph_pk.as_affine());
    let key_bytes = shared.raw_secret_bytes();

    // AES-256-CBC decrypt with PKCS#7 unpadding.
    let cipher = Aes256CbcDec::new(key_bytes.as_slice().into(), (&parsed.iv).into());
    let mut buf = parsed.encrypted_cek.to_vec();
    let pt_len = cipher
        .decrypt_padded_mut::<Pkcs7>(&mut buf)
        .map_err(|_| ErrorCode::DecryptFailed)?
        .len();
    buf.truncate(pt_len);
    Ok(buf)
}

/// Extract the keys blob (CEK material) from the decrypted envelope plaintext.
///
/// Inner format: `metaSize(u32 BE) | metadata | keyCount(u32 BE) | keys...`
/// Returns the `keys` tail — for CENC media this is a 16-byte AES-128 key.
pub fn extract_keys_blob(plaintext: &[u8]) -> Result<Vec<u8>, ErrorCode> {
    if plaintext.len() < 4 {
        return Err(ErrorCode::BadEnvelope);
    }
    let meta_size = u32::from_be_bytes([plaintext[0], plaintext[1], plaintext[2], plaintext[3]]) as usize;
    let body_offset = 4 + meta_size;
    if body_offset + 4 > plaintext.len() {
        return Err(ErrorCode::BadEnvelope);
    }
    // keyCount is informational — we return all key bytes that follow.
    let key_start = body_offset + 4;
    if key_start > plaintext.len() {
        return Err(ErrorCode::BadEnvelope);
    }
    Ok(plaintext[key_start..].to_vec())
}

/// Accept either a 33-byte compressed or a 65-byte uncompressed P-256 point.
fn parse_p256_public(raw: &[u8]) -> Result<PublicKey, ErrorCode> {
    let point = EncodedPoint::from_bytes(raw).map_err(|_| ErrorCode::BadEnvelope)?;
    Option::<PublicKey>::from(PublicKey::from_encoded_point(&point))
        .ok_or(ErrorCode::BadEnvelope)
}

#[cfg(test)]
mod tests {
    use super::*;
    use aes::Aes256;
    use cbc::Encryptor as CbcEncryptor;
    use cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};
    use elliptic_curve::sec1::ToEncodedPoint;
    use p256::ecdh::EphemeralSecret;
    use rand_core::OsRng;

    type Aes256CbcEnc = CbcEncryptor<Aes256>;

    fn make_envelope(
        session_sk: &SecretKey,
        cek: &[u8],
        version: u8,
    ) -> Vec<u8> {
        // Lit-side ephemeral key.
        let lit_eph = EphemeralSecret::random(&mut OsRng);
        let lit_eph_pk = lit_eph.public_key();
        let eph_compressed = lit_eph_pk.to_encoded_point(true);
        let eph_bytes = eph_compressed.as_bytes();
        assert_eq!(eph_bytes.len(), 33);

        // ECDH from Lit's side -> same shared secret.
        let shared = lit_eph.diffie_hellman(&session_sk.public_key());
        let key_bytes = shared.raw_secret_bytes();

        // Encrypt the inner plaintext: metaSize(0) | keyCount(1) | keys
        let mut inner = Vec::new();
        inner.extend_from_slice(&0u32.to_be_bytes()); // metaSize
        // (no metadata)
        inner.extend_from_slice(&1u32.to_be_bytes()); // keyCount
        inner.extend_from_slice(cek);

        let iv: [u8; 16] = if version == 0x03 {
            let mut iv = [0u8; 16];
            getrandom::getrandom(&mut iv).unwrap();
            iv
        } else {
            let mut iv = [0u8; 16];
            iv.copy_from_slice(&eph_bytes[..16]);
            iv
        };

        let cipher = Aes256CbcEnc::new(key_bytes.as_slice().into(), (&iv).into());
        let mut buf = vec![0u8; inner.len() + 16];
        buf[..inner.len()].copy_from_slice(&inner);
        let ct_len = cipher
            .encrypt_padded_mut::<Pkcs7>(&mut buf, inner.len())
            .unwrap()
            .len();
        let ciphertext = &buf[..ct_len];

        // Build envelope:
        let mut env = Vec::new();
        env.extend_from_slice(&[0, 0, 0, version]); // header + version
        env.extend_from_slice(&(eph_bytes.len() as u16).to_be_bytes());
        env.extend_from_slice(eph_bytes);
        if version == 0x03 {
            env.extend_from_slice(&iv);
        }
        // signature (empty)
        env.extend_from_slice(&0u16.to_be_bytes());
        // 33-byte signer pubkey (zeros — skipped by parser)
        env.extend_from_slice(&[0u8; 33]);
        env.extend_from_slice(&(ciphertext.len() as u32).to_be_bytes());
        env.extend_from_slice(ciphertext);
        env
    }

    #[test]
    fn round_trip_v3() {
        let sk = SecretKey::random(&mut OsRng);
        let cek = [0x42u8; 16];
        let env = make_envelope(&sk, &cek, 0x03);
        let parsed = parse(&env).unwrap();
        let pt = ecdh_unwrap(&sk, &parsed).unwrap();
        let keys = extract_keys_blob(&pt).unwrap();
        assert_eq!(keys.as_slice(), &cek);
    }

    #[test]
    fn round_trip_v2_fixed_iv() {
        let sk = SecretKey::random(&mut OsRng);
        let cek = [0x99u8; 16];
        let env = make_envelope(&sk, &cek, 0x02);
        let parsed = parse(&env).unwrap();
        let pt = ecdh_unwrap(&sk, &parsed).unwrap();
        let keys = extract_keys_blob(&pt).unwrap();
        assert_eq!(keys.as_slice(), &cek);
    }

    #[test]
    fn truncated_envelope_rejected() {
        assert_eq!(parse(&[0, 0, 0, 0x03]).unwrap_err(), ErrorCode::BadEnvelope);
    }

    #[test]
    fn wrong_session_key_fails() {
        let sk = SecretKey::random(&mut OsRng);
        let other_sk = SecretKey::random(&mut OsRng);
        let env = make_envelope(&sk, &[0xAA; 16], 0x03);
        let parsed = parse(&env).unwrap();
        // PKCS#7 unpadding will almost certainly fail on a wrong key.
        assert!(ecdh_unwrap(&other_sk, &parsed).is_err());
    }
}
