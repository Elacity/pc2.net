//! PSSH (Protection System Specific Header) box generator per ISO 23001-7.
//!
//! Produces binary PSSH boxes with the Elacity dDRM system ID and custom
//! protection metadata for Chipotle-encrypted DASH streams.

use crate::mp4box::make_fullbox;

/// Elacity dDRM PSSH system ID: bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe
const ELACITY_SYSTEM_ID: [u8; 16] = [
    0xbf, 0x2c, 0x86, 0xc1, 0xd9, 0xff, 0x4a, 0xb1,
    0xb4, 0xbe, 0x45, 0xae, 0x4d, 0x99, 0xe1, 0xfe,
];

/// Build a PSSH box (v1) with the Elacity system ID and custom data payload.
///
/// Per ISO 23001-7 §8.1:
/// ```text
/// aligned(8) class ProtectionSystemSpecificHeaderBox extends FullBox('pssh', version, flags=0) {
///   unsigned int(8)[16] SystemID;
///   if (version > 0) {
///     unsigned int(32) KID_count;
///     { unsigned int(8)[16] KID; } [KID_count];
///   }
///   unsigned int(32) DataSize;
///   unsigned int(8)[DataSize] Data;
/// }
/// ```
pub fn build_pssh(kid: &[u8; 16], data: &[u8]) -> Vec<u8> {
    let mut content = Vec::with_capacity(16 + 4 + 16 + 4 + data.len());

    // SystemID (16 bytes)
    content.extend_from_slice(&ELACITY_SYSTEM_ID);

    // KID_count (1) + KID (16 bytes) — version 1 only
    content.extend_from_slice(&1u32.to_be_bytes());
    content.extend_from_slice(kid);

    // DataSize + Data
    content.extend_from_slice(&(data.len() as u32).to_be_bytes());
    content.extend_from_slice(data);

    make_fullbox(b"pssh", 1, 0, &content)
}

/// Build the Elacity dDRM protection data payload (JSON-encoded, v3.0).
///
/// V3.0 aligns with the keystore service format. Fields that are not
/// available at WASM time (kid, dataToEncryptHash, ciphertext, issuer,
/// signature) are emitted as empty strings — the TS layer's
/// `injectPSSHBox` is authoritative for fully-populated PSSH boxes;
/// this rust path is a fallback for the optional `pssh_params` mode.
#[allow(clippy::too_many_arguments)]
pub fn build_elacity_pssh_data(
    authority: &str,
    chain_id: u32,
    rpc: &str,
    action_ipfs_id: &str,
    lit_backend: &str,
    kid: &str,
    data_to_encrypt_hash: &str,
    ciphertext: &str,
    issuer: &str,
    signature: &str,
) -> Vec<u8> {
    let json = format!(
        r#"{{"protocolVersion":"3.0","protectionType":"cenc:lit-aes-gcm-v3","variant":"eth.web3.clearkey","algorithm":"AES-128-CBC","data":{{"actionIpfsId":"{}","litBackend":"{}","chainId":{},"authority":"{}","rpc":"{}","kid":"{}","dataToEncryptHash":"{}","ciphertext":"{}","issuer":"{}","signature":"{}","format":"hex"}}}}"#,
        action_ipfs_id, lit_backend, chain_id, authority, rpc, kid, data_to_encrypt_hash, ciphertext, issuer, signature
    );
    json.into_bytes()
}

/// Build a complete Elacity PSSH box ready for injection into an init segment.
#[allow(clippy::too_many_arguments)]
pub fn build_elacity_pssh(
    kid_bytes: &[u8; 16],
    authority: &str,
    chain_id: u32,
    rpc: &str,
    action_ipfs_id: &str,
    lit_backend: &str,
    kid_hex_0x: &str,
    data_to_encrypt_hash: &str,
    ciphertext: &str,
    issuer: &str,
    signature: &str,
) -> Vec<u8> {
    let data = build_elacity_pssh_data(
        authority, chain_id, rpc, action_ipfs_id, lit_backend,
        kid_hex_0x, data_to_encrypt_hash, ciphertext, issuer, signature,
    );
    build_pssh(kid_bytes, &data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pssh_box_structure() {
        let kid = [0xAA; 16];
        let data = b"test protection data";
        let pssh = build_pssh(&kid, data);

        assert_eq!(&pssh[4..8], b"pssh");
        assert_eq!(pssh[8], 1); // version
        assert_eq!(&pssh[12..28], &ELACITY_SYSTEM_ID);

        let kid_count = u32::from_be_bytes([pssh[28], pssh[29], pssh[30], pssh[31]]);
        assert_eq!(kid_count, 1);
        assert_eq!(&pssh[32..48], &kid);

        let data_size = u32::from_be_bytes([pssh[48], pssh[49], pssh[50], pssh[51]]);
        assert_eq!(data_size, data.len() as u32);
        assert_eq!(&pssh[52..52 + data.len()], data);
    }

    #[test]
    fn elacity_pssh_json() {
        let kid = [0xBB; 16];
        let pssh = build_elacity_pssh(
            &kid,
            "0x580c26DefF267EF40A72CF10A4A42050F0641b8B",
            8453,
            "https://mainnet.base.org",
            "QmRSpGFftbiWQBkHFEi9FUhtigfPbcCkezuuEUNUJcFr6h",
            "chipotle",
            "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "deadbeef",
            "cafebabe",
            "0x0000000000000000000000000000000000000000",
            "00",
        );

        assert_eq!(&pssh[4..8], b"pssh");
        let data_start = 52;
        let data_size = u32::from_be_bytes([pssh[48], pssh[49], pssh[50], pssh[51]]) as usize;
        let json_str = std::str::from_utf8(&pssh[data_start..data_start + data_size]).unwrap();
        assert!(json_str.contains("chipotle"));
        assert!(json_str.contains("cenc:lit-aes-gcm-v3"));
        assert!(json_str.contains("\"protocolVersion\":\"3.0\""));
        assert!(json_str.contains("\"algorithm\":\"AES-128-CBC\""));
        assert!(json_str.contains("\"format\":\"hex\""));
        assert!(!json_str.contains("ciphersuite"));
        assert!(json_str.contains("dataToEncryptHash"));
        assert!(json_str.contains("0x580c26DefF267EF"));
    }
}
