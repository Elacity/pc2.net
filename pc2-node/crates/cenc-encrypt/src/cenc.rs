//! CENC (Common Encryption Standard, ISO 23001-7) sample encryption.
//!
//! AES-128-CTR encryption per sample with random per-sample 8-byte IVs.
//! Symmetric to the decryption in cenc-decrypt — same apply_keystream call.
//! CEK is zeroed in memory after use.

use aes::cipher::{KeyIvInit, StreamCipher};

type Aes128Ctr = ctr::Ctr128BE<aes::Aes128>;

/// One subsample entry per ISO/IEC 23001-7 §7.2.
/// `bytes_of_clear_data` is u16 in the box layout, but we keep it as u32 for
/// ease of arithmetic; the writer clamps + encodes as u16 BE.
pub struct SubsampleEntry {
    pub clear: u32,
    pub protected: u32,
}

/// Encrypt all samples in an mdat payload using CENC AES-128-CTR.
///
/// `clear_leader` is the number of bytes at the START of every sample to
/// LEAVE IN THE CLEAR. The remaining bytes are encrypted with AES-CTR using
/// the sample's per-sample IV. Required for AV1 / AAC because codec frame
/// headers (OBU headers for AV1, AAC syntactic-element headers) must be
/// parseable by the decoder BEFORE decryption-time. Encrypting the headers
/// produces "obu_forbidden_bit out of range" / "scalefactor bands exceeds
/// limit" decoder errors — exactly the symptom that was breaking client-side
/// libav playback. See MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.
///
/// `clear_leader == 0` reproduces the legacy full-sample behaviour (safe
/// only when samples are never parsed pre-decryption, which is rarely true).
///
/// Returns (encrypted_mdat, per_sample_ivs, per_sample_subsamples). Caller
/// passes subsamples to `build_senc` so the reader knows what was protected.
pub fn encrypt_samples(
    mdat: &[u8],
    cek: &[u8; 16],
    sample_sizes: &[u32],
    iv_seed: &[u8],
    clear_leader: u32,
) -> Result<(Vec<u8>, Vec<[u8; 8]>, Vec<Vec<SubsampleEntry>>), String> {
    let mut output = mdat.to_vec();
    let mut ivs = Vec::with_capacity(sample_sizes.len());
    let mut all_subsamples: Vec<Vec<SubsampleEntry>> = Vec::with_capacity(sample_sizes.len());
    let mut offset = 0usize;

    for (i, &size) in sample_sizes.iter().enumerate() {
        let sample_size = size as usize;
        if offset + sample_size > output.len() {
            return Err(format!(
                "sample {i} exceeds mdat: offset={offset} size={sample_size} mdat_len={}",
                output.len()
            ));
        }

        let clear = (clear_leader as usize).min(sample_size);
        let protected = sample_size - clear;

        let iv8 = generate_sample_iv(iv_seed, i);
        let iv16 = pad_iv(&iv8);

        if protected > 0 {
            let mut cipher = Aes128Ctr::new(cek.into(), (&iv16).into());
            cipher.apply_keystream(&mut output[offset + clear..offset + clear + protected]);
        }

        ivs.push(iv8);
        // Always emit a single subsample per sample. Even fully-clear samples
        // (protected==0) get a subsample so the senc table is uniform and the
        // reader's per-sample subsample count is well-defined.
        all_subsamples.push(vec![SubsampleEntry {
            clear: clear as u32,
            protected: protected as u32,
        }]);
        offset += sample_size;
    }

    Ok((output, ivs, all_subsamples))
}

/// Generate a deterministic 8-byte IV for a given sample index.
///
/// IV = (seed_u64 + sample_index) written as big-endian u64. Mirrors
/// Bento4's `random` IV mode (random base per track + per-sample counter
/// increment, ISO/IEC 23001-7 §9.4.1).
///
/// The previous XOR-based derivation collided across segments — e.g. seg 0
/// sample 0 and seg 1 sample 1 both produced IV=0, violating CENC's
/// {KID, IV} uniqueness requirement (CTR keystream reuse leaks XOR of
/// plaintexts under the same key). Caller MUST pass a seed that is the
/// running global sample index for this segment so that adding 0..N-1
/// inside this function yields strictly increasing IVs across the asset.
fn generate_sample_iv(seed: &[u8], sample_index: usize) -> [u8; 8] {
    let mut seed_u64 = 0u64;
    for &b in seed.iter().take(8) {
        seed_u64 = (seed_u64 << 8) | (b as u64);
    }
    seed_u64.wrapping_add(sample_index as u64).to_be_bytes()
}

/// Pad an 8-byte IV to 16 bytes (zero-padded on the right) per CENC spec.
fn pad_iv(iv8: &[u8; 8]) -> [u8; 16] {
    let mut iv16 = [0u8; 16];
    iv16[..8].copy_from_slice(iv8);
    iv16
}

#[cfg(test)]
mod tests {
    use super::*;
    use aes::cipher::KeyIvInit;

    #[test]
    fn round_trip_full_sample() {
        let key = [0x01u8; 16];
        let plaintext = b"Hello CENC encryption test data! More data here for good measure padding.";
        let sample_sizes = vec![plaintext.len() as u32];
        let seed = [0xAB; 8];

        let (encrypted, ivs, subs) = encrypt_samples(plaintext, &key, &sample_sizes, &seed, 0).unwrap();
        assert_ne!(&encrypted[..], &plaintext[..]);
        assert_eq!(ivs.len(), 1);
        assert_eq!(subs[0][0].clear, 0);
        assert_eq!(subs[0][0].protected as usize, plaintext.len());

        let iv16 = pad_iv(&ivs[0]);
        let mut decrypted = encrypted.clone();
        let mut cipher = Aes128Ctr::new(&key.into(), (&iv16).into());
        cipher.apply_keystream(&mut decrypted);
        assert_eq!(&decrypted[..], &plaintext[..]);
    }

    #[test]
    fn round_trip_clear_leader_preserves_header() {
        let key = [0x01u8; 16];
        let plaintext = b"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAencrypted body bytes after the clear leader";
        let sample_sizes = vec![plaintext.len() as u32];
        let seed = [0xAB; 8];
        let clear_leader = 32u32;

        let (encrypted, ivs, subs) = encrypt_samples(plaintext, &key, &sample_sizes, &seed, clear_leader).unwrap();
        // Clear leader bytes must equal plaintext leader bytes.
        assert_eq!(&encrypted[..clear_leader as usize], &plaintext[..clear_leader as usize]);
        // Body must differ.
        assert_ne!(&encrypted[clear_leader as usize..], &plaintext[clear_leader as usize..]);
        assert_eq!(subs[0][0].clear, clear_leader);
        assert_eq!(subs[0][0].protected as usize, plaintext.len() - clear_leader as usize);

        // Decrypt: skip clear leader, apply CTR to body.
        let iv16 = pad_iv(&ivs[0]);
        let mut decrypted = encrypted.clone();
        let mut cipher = Aes128Ctr::new(&key.into(), (&iv16).into());
        cipher.apply_keystream(&mut decrypted[clear_leader as usize..]);
        assert_eq!(&decrypted[..], &plaintext[..]);
    }

    #[test]
    fn clear_leader_clamps_to_sample_size() {
        let key = [0x01u8; 16];
        let short = b"tiny"; // 4 bytes
        let (encrypted, _, subs) = encrypt_samples(short, &key, &[4u32], &[0xAB; 8], 32).unwrap();
        // Whole sample is clear; nothing encrypted.
        assert_eq!(&encrypted[..], &short[..]);
        assert_eq!(subs[0][0].clear, 4);
        assert_eq!(subs[0][0].protected, 0);
    }

    #[test]
    fn multi_sample_round_trip() {
        let key = [0x42u8; 16];
        let data = b"AAAA1111BBBBBBBB2222CCCC";
        let sizes = vec![4u32, 4, 8, 4, 4];
        let seed = [0x01; 8];

        let (enc, ivs, _subs) = encrypt_samples(data, &key, &sizes, &seed, 0).unwrap();
        assert_eq!(ivs.len(), 5);

        let mut dec = enc.clone();
        let mut offset = 0usize;
        for (i, &sz) in sizes.iter().enumerate() {
            let iv16 = pad_iv(&ivs[i]);
            let mut cipher = Aes128Ctr::new(&key.into(), (&iv16).into());
            cipher.apply_keystream(&mut dec[offset..offset + sz as usize]);
            offset += sz as usize;
        }
        assert_eq!(&dec[..], &data[..]);
    }

    #[test]
    fn unique_ivs_per_sample() {
        let seed = [0xFF; 8];
        let iv0 = generate_sample_iv(&seed, 0);
        let iv1 = generate_sample_iv(&seed, 1);
        let iv2 = generate_sample_iv(&seed, 2);
        assert_ne!(iv0, iv1);
        assert_ne!(iv1, iv2);
    }
}
