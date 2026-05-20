//! CENC Segment Encryptor for PC2 Media Encoding Pipeline.
//!
//! Compiled to `wasm32-wasip1` and executed by the PC2 node's WASMRuntime.
//! Encrypts clear fMP4 segments with AES-128-CTR per CENC standard.
//! Also transforms init segments by adding sinf/tenc/pssh boxes.
//!
//! ## MemFS interface (same pattern as cenc-decrypt)
//!
//! Input:  /input/command.json   (CEK, KID, mode, PSSH params)
//!         /input/segment.bin    (clear fMP4 segment or init segment)
//! Output: /output/result.json   (success, error, sample_count, ivs)
//!         /output/segment.bin   (encrypted fMP4 segment or transformed init)

pub mod mp4box;
pub mod cenc;
pub mod pssh;

use serde::{Deserialize, Serialize};
use base64::Engine;

#[derive(Debug, Deserialize)]
pub struct EncryptCommand {
    /// Base64-encoded 16-byte AES-128-CTR Content Encryption Key.
    pub cek_b64: String,
    /// 32-char hex KID (Key ID) for tenc/PSSH.
    pub kid_hex: String,
    /// Mode: "encrypt_segment" | "transform_init" | "build_pssh"
    pub mode: String,
    /// IV seed (base64) for deterministic IV generation. Typically segment number.
    pub iv_seed_b64: Option<String>,
    /// Default sample size (from tfhd) if trun doesn't have per-sample sizes.
    pub default_sample_size: Option<u32>,
    /// Number of bytes at the start of every sample to leave in the clear
    /// (subsample encryption). Required > 0 for video (AV1 OBU headers) and
    /// audio (AAC frame syntactic-element headers) — full-sample encryption
    /// breaks client-side codec parsers. Caller picks per codec.
    /// See MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.
    #[serde(default)]
    pub clear_leader: u32,
    /// PSSH parameters (for transform_init and build_pssh modes).
    pub pssh_params: Option<PSSHParams>,
}

#[derive(Debug, Deserialize)]
pub struct PSSHParams {
    pub authority: String,
    pub chain_id: u32,
    pub rpc: String,
    pub action_ipfs_id: String,
    pub lit_backend: String,
    // V3.0 protection data fields. Default to empty if caller omits them —
    // the TS `injectPSSHBox` is authoritative for fully-populated PSSH.
    #[serde(default)]
    pub kid: String,
    #[serde(default)]
    pub data_to_encrypt_hash: String,
    #[serde(default)]
    pub ciphertext: String,
    #[serde(default)]
    pub issuer: String,
    #[serde(default)]
    pub signature: String,
}

#[derive(Debug, Serialize)]
pub struct EncryptResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ivs_b64: Option<Vec<String>>,
}

pub fn process(command_json: &str, segment_data: &[u8]) -> (String, Option<Vec<u8>>) {
    let cmd: EncryptCommand = match serde_json::from_str(command_json) {
        Ok(c) => c,
        Err(e) => return (error_result(&format!("invalid command: {e}")), None),
    };

    match cmd.mode.as_str() {
        "encrypt_segment" => process_encrypt_segment(&cmd, segment_data),
        "transform_init" => process_transform_init(&cmd, segment_data),
        "build_pssh" => process_build_pssh(&cmd),
        other => (error_result(&format!("unknown mode: {other}")), None),
    }
}

fn process_encrypt_segment(cmd: &EncryptCommand, segment_data: &[u8]) -> (String, Option<Vec<u8>>) {
    let b64 = base64::engine::general_purpose::STANDARD;

    let mut cek_bytes = match b64.decode(&cmd.cek_b64) {
        Ok(k) => k,
        Err(e) => return (error_result(&format!("cek decode: {e}")), None),
    };

    if cek_bytes.len() != 16 {
        cek_bytes.iter_mut().for_each(|b| *b = 0);
        return (error_result(&format!("cek length {} (expected 16)", cek_bytes.len())), None);
    }

    let iv_seed = cmd.iv_seed_b64.as_ref()
        .and_then(|s| b64.decode(s).ok())
        .unwrap_or_else(|| vec![0u8; 8]);

    let parsed = match mp4box::parse_clear_segment(segment_data) {
        Ok(p) => p,
        Err(e) => {
            cek_bytes.iter_mut().for_each(|b| *b = 0);
            return (error_result(&format!("parse segment: {e}")), None);
        }
    };

    let default_sz = cmd.default_sample_size.unwrap_or(0);
    let sample_sizes: Vec<u32> = parsed.trun_entries.iter()
        .map(|e| e.sample_size.unwrap_or(default_sz))
        .collect();

    if sample_sizes.is_empty() {
        cek_bytes.iter_mut().for_each(|b| *b = 0);
        return (error_result("no samples found in trun"), None);
    }

    let mdat_content = &segment_data[parsed.mdat_content_offset..parsed.mdat_content_offset + (parsed.mdat_size - (parsed.mdat_content_offset - parsed.mdat_offset))];

    let cek_arr: [u8; 16] = cek_bytes[..16].try_into().unwrap();
    let (encrypted_mdat, ivs, subsamples) = match cenc::encrypt_samples(mdat_content, &cek_arr, &sample_sizes, &iv_seed, cmd.clear_leader) {
        Ok(r) => r,
        Err(e) => {
            cek_bytes.iter_mut().for_each(|b| *b = 0);
            return (error_result(&format!("encrypt: {e}")), None);
        }
    };

    cek_bytes.iter_mut().for_each(|b| *b = 0);

    // Choose senc form based on whether any sample has a non-zero clear
    // leader. With a clear leader (video / AV1), subsample form (flag=0x02)
    // is required so the decryptor knows which bytes to skip. Without one
    // (audio / AAC, matching bento4), emit the simpler full-sample form
    // (flag=0) — broader compatibility with downstream decryption stacks
    // that don't implement subsample-with-zero-clear correctly.
    let any_real_clear = subsamples.iter()
        .any(|subs| subs.iter().any(|s| s.clear > 0));
    let senc_box = if any_real_clear {
        let subsamples_pairs: Vec<Vec<(u32, u32)>> = subsamples.iter()
            .map(|subs| subs.iter().map(|s| (s.clear, s.protected)).collect())
            .collect();
        mp4box::build_senc_with_subsamples(&ivs, &subsamples_pairs)
    } else {
        mp4box::build_senc(&ivs)
    };

    let moof_content_start = parsed.moof_offset + parsed.moof_header_size as usize;
    let traf_abs = moof_content_start + parsed.traf_offset_in_moof;
    let traf_end = traf_abs + parsed.traf_size;

    let mut output = Vec::with_capacity(segment_data.len() + senc_box.len());

    output.extend_from_slice(&segment_data[..traf_end]);
    output.extend_from_slice(&senc_box);
    output.extend_from_slice(&segment_data[traf_end..parsed.mdat_content_offset]);
    output.extend_from_slice(&encrypted_mdat);

    let mdat_end = parsed.mdat_offset + parsed.mdat_size;
    if mdat_end < segment_data.len() {
        output.extend_from_slice(&segment_data[mdat_end..]);
    }

    let senc_len = senc_box.len();
    let new_traf_size = parsed.traf_size as u64 + senc_len as u64;
    mp4box::write_box_size(&mut output, traf_abs, new_traf_size);

    let new_moof_size = parsed.moof_size as u64 + senc_len as u64;
    mp4box::write_box_size(&mut output, parsed.moof_offset, new_moof_size);

    if parsed.trun_flags & 0x1 != 0 {
        let moof_content = parsed.moof_offset + parsed.moof_header_size as usize;
        let traf_content = moof_content + parsed.traf_offset_in_moof + parsed.traf_header_size as usize;
        let traf_new_end = traf_abs + new_traf_size as usize;
        if let Some(trun_pos) = find_box_in_range(&output, traf_content, traf_new_end, b"trun") {
            if trun_pos + 16 + 4 <= output.len() {
                let do_pos = trun_pos + 16;
                let old_offset = i32::from_be_bytes([
                    output[do_pos], output[do_pos + 1],
                    output[do_pos + 2], output[do_pos + 3],
                ]);
                let new_offset = old_offset + senc_len as i32;
                output[do_pos..do_pos + 4].copy_from_slice(&new_offset.to_be_bytes());
            }
        }
    }

    let ivs_b64: Vec<String> = ivs.iter()
        .map(|iv| b64.encode(iv))
        .collect();

    let result = EncryptResult {
        success: true,
        error: None,
        sample_count: Some(sample_sizes.len()),
        ivs_b64: Some(ivs_b64),
    };

    (serde_json::to_string(&result).unwrap(), Some(output))
}

fn process_transform_init(cmd: &EncryptCommand, init_data: &[u8]) -> (String, Option<Vec<u8>>) {
    let kid_bytes = match hex_to_bytes(&cmd.kid_hex) {
        Ok(k) if k.len() == 16 => {
            let mut arr = [0u8; 16];
            arr.copy_from_slice(&k);
            arr
        }
        Ok(k) => return (error_result(&format!("kid length {} (expected 16)", k.len())), None),
        Err(e) => return (error_result(&format!("kid hex decode: {e}")), None),
    };

    // Multi-trak transform: every trak in moov whose first sample entry is
    // still in cleartext form (avc1, av01, mp4a, …) gets its sample entry
    // wrapped in `sinf/frma/schm/schi/tenc` and its 4cc rewritten to
    // `encv`/`enca`. Before this loop existed, only the FIRST trak was
    // transformed — leaving multi-track audio inits with a plain `mp4a`
    // entry and breaking client-side decryption (player saw cleartext
    // declaration but encrypted segment bytes).
    // See MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.
    let mut output = init_data.to_vec();
    let mut transformed_count = 0usize;
    let max_iterations = 32; // safety bound against pathological inputs

    for _ in 0..max_iterations {
        let info = match mp4box::parse_first_clear_trak(&output) {
            Some(i) => i,
            None => break,
        };

        let original_format = info.sample_entry_type;
        let encrypted_type: [u8; 4] = match &original_format {
            b"avc1" | b"avc3" | b"hev1" | b"hvc1" | b"av01" | b"vp09" => *b"encv",
            b"mp4a" | b"Opus" | b"fLaC" | b"ac-3" | b"ec-3" => *b"enca",
            _ => {
                if original_format[0].is_ascii_lowercase() {
                    *b"enca"
                } else {
                    *b"encv"
                }
            }
        };

        let sinf = mp4box::build_sinf(&original_format, 8, &kid_bytes);
        let sinf_len = sinf.len();

        let entry_end = info.sample_entry_offset + info.sample_entry_size;

        let mut new_output = Vec::with_capacity(output.len() + sinf_len);
        new_output.extend_from_slice(&output[..entry_end]);
        new_output.extend_from_slice(&sinf);
        new_output.extend_from_slice(&output[entry_end..]);
        output = new_output;

        let type_offset = info.sample_entry_offset + 4;
        if type_offset + 4 <= output.len() {
            output[type_offset..type_offset + 4].copy_from_slice(&encrypted_type);
        }

        let new_entry_size = info.sample_entry_size as u64 + sinf_len as u64;
        mp4box::write_box_size(&mut output, info.sample_entry_offset, new_entry_size);

        for &(pos, orig_size) in &info.ancestors {
            let new_size = orig_size + sinf_len as u64;
            mp4box::write_box_size(&mut output, pos, new_size);
        }

        transformed_count += 1;
    }

    if transformed_count == 0 {
        return (error_result("could not find any clear traks to transform (no moov/trak/stsd, or all already encv/enca)"), None);
    }

    if let Some(pssh_params) = &cmd.pssh_params {
        let pssh_box = pssh::build_elacity_pssh(
            &kid_bytes,
            &pssh_params.authority,
            pssh_params.chain_id,
            &pssh_params.rpc,
            &pssh_params.action_ipfs_id,
            &pssh_params.lit_backend,
            &pssh_params.kid,
            &pssh_params.data_to_encrypt_hash,
            &pssh_params.ciphertext,
            &pssh_params.issuer,
            &pssh_params.signature,
        );

        // Place pssh as the last child of moov (after every trak) so libav's
        // mov_read_pssh attaches AVEncryptionInitInfo to already-registered
        // AVStreams. No root-level sibling — Chromium MSE rejects it.
        // See MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.
        let pssh_len = pssh_box.len();

        // Locate moov at the top level (offset shifted after multi-trak transform).
        let mut moov_pos = 0usize;
        let mut tp = 0usize;
        while tp + 8 <= output.len() {
            let h = match mp4box::read_box_header(&output, tp) {
                Some(h) => h,
                None => break,
            };
            if h.size < 8 || tp + h.size as usize > output.len() { break; }
            if &h.box_type == b"moov" {
                moov_pos = tp;
                break;
            }
            tp += h.size as usize;
        }
        if let Some(moov_h) = mp4box::read_box_header(&output, moov_pos) {
            let moov_end = moov_pos + moov_h.size as usize;
            output.splice(moov_end..moov_end, pssh_box.iter().cloned());
            let new_moov_size = moov_h.size + pssh_len as u64;
            mp4box::write_box_size(&mut output, moov_pos, new_moov_size);
        }
    }

    let result = EncryptResult {
        success: true,
        error: None,
        sample_count: None,
        ivs_b64: None,
    };

    (serde_json::to_string(&result).unwrap(), Some(output))
}

fn process_build_pssh(cmd: &EncryptCommand) -> (String, Option<Vec<u8>>) {
    let kid_bytes = match hex_to_bytes(&cmd.kid_hex) {
        Ok(k) if k.len() == 16 => {
            let mut arr = [0u8; 16];
            arr.copy_from_slice(&k);
            arr
        }
        Ok(k) => return (error_result(&format!("kid length {} (expected 16)", k.len())), None),
        Err(e) => return (error_result(&format!("kid hex decode: {e}")), None),
    };

    let pssh_params = match &cmd.pssh_params {
        Some(p) => p,
        None => return (error_result("pssh_params required for build_pssh mode"), None),
    };

    let pssh_box = pssh::build_elacity_pssh(
        &kid_bytes,
        &pssh_params.authority,
        pssh_params.chain_id,
        &pssh_params.rpc,
        &pssh_params.action_ipfs_id,
        &pssh_params.lit_backend,
        &pssh_params.kid,
        &pssh_params.data_to_encrypt_hash,
        &pssh_params.ciphertext,
        &pssh_params.issuer,
        &pssh_params.signature,
    );

    let result = EncryptResult {
        success: true,
        error: None,
        sample_count: None,
        ivs_b64: None,
    };

    (serde_json::to_string(&result).unwrap(), Some(pssh_box))
}

fn error_result(msg: &str) -> String {
    serde_json::to_string(&EncryptResult {
        success: false,
        error: Some(msg.to_string()),
        sample_count: None,
        ivs_b64: None,
    }).unwrap()
}

fn hex_to_bytes(hex: &str) -> Result<Vec<u8>, String> {
    if hex.len() % 2 != 0 {
        return Err("odd hex length".to_string());
    }
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).map_err(|e| e.to_string()))
        .collect()
}

fn find_box_in_range(buf: &[u8], start: usize, end: usize, box_type: &[u8; 4]) -> Option<usize> {
    let mut pos = start;
    while pos + 8 <= end {
        let h = mp4box::read_box_header(buf, pos)?;
        if h.size < 8 || pos + h.size as usize > end { return None; }
        if &h.box_type == box_type { return Some(pos); }
        pos += h.size as usize;
    }
    None
}
