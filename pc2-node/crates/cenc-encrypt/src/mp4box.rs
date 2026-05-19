//! Minimal fMP4 (ISO BMFF) box parser and writer for CENC encryption.
//!
//! Reuses the same box-header parsing approach as cenc-decrypt.
//! Adds box construction utilities for building senc, sinf, tenc, frma, pssh boxes.

use std::io::{Cursor, Read};

#[derive(Debug, Clone)]
pub struct BoxHeader {
    pub box_type: [u8; 4],
    pub size: u64,
    pub header_size: u64,
}

#[derive(Debug, Clone)]
pub struct TrunEntry {
    pub sample_size: Option<u32>,
}

pub fn read_box_header(data: &[u8], offset: usize) -> Option<BoxHeader> {
    if offset + 8 > data.len() {
        return None;
    }
    let size32 = u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
    let box_type = [data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]];

    let (size, header_size) = if size32 == 1 {
        if offset + 16 > data.len() {
            return None;
        }
        let size64 = u64::from_be_bytes([
            data[offset + 8], data[offset + 9], data[offset + 10], data[offset + 11],
            data[offset + 12], data[offset + 13], data[offset + 14], data[offset + 15],
        ]);
        (size64, 16u64)
    } else if size32 == 0 {
        ((data.len() - offset) as u64, 8u64)
    } else {
        (size32 as u64, 8u64)
    };

    Some(BoxHeader { box_type, size, header_size })
}

/// Build a simple ISO BMFF box: [size:4][type:4][content]
pub fn make_box(box_type: &[u8; 4], content: &[u8]) -> Vec<u8> {
    let size = (8 + content.len()) as u32;
    let mut b = Vec::with_capacity(size as usize);
    b.extend_from_slice(&size.to_be_bytes());
    b.extend_from_slice(box_type);
    b.extend_from_slice(content);
    b
}

/// Build a full-box: [size:4][type:4][version:1][flags:3][content]
pub fn make_fullbox(box_type: &[u8; 4], version: u8, flags: u32, content: &[u8]) -> Vec<u8> {
    let size = (12 + content.len()) as u32;
    let mut b = Vec::with_capacity(size as usize);
    b.extend_from_slice(&size.to_be_bytes());
    b.extend_from_slice(box_type);
    b.push(version);
    b.push(((flags >> 16) & 0xFF) as u8);
    b.push(((flags >> 8) & 0xFF) as u8);
    b.push((flags & 0xFF) as u8);
    b.extend_from_slice(content);
    b
}

/// Write a 32-bit box size at the given offset.
pub fn write_box_size(buf: &mut [u8], offset: usize, new_size: u64) {
    if offset + 4 > buf.len() { return; }
    let existing_size32 = u32::from_be_bytes([buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]]);

    if existing_size32 == 1 {
        if offset + 16 <= buf.len() {
            buf[offset + 8..offset + 16].copy_from_slice(&new_size.to_be_bytes());
        }
    } else {
        buf[offset..offset + 4].copy_from_slice(&(new_size as u32).to_be_bytes());
    }
}

/// Parse a clear fMP4 media segment to extract moof/traf/trun sample sizes and mdat location.
pub struct ParsedClearSegment {
    pub moof_offset: usize,
    pub moof_size: usize,
    pub moof_header_size: u64,
    pub traf_offset_in_moof: usize,
    pub traf_size: usize,
    pub traf_header_size: u64,
    pub trun_entries: Vec<TrunEntry>,
    pub trun_flags: u32,
    pub mdat_offset: usize,
    pub mdat_size: usize,
    pub mdat_content_offset: usize,
}

pub fn parse_clear_segment(data: &[u8]) -> Result<ParsedClearSegment, String> {
    let mut moof_offset = 0usize;
    let mut moof_size = 0usize;
    let mut moof_header_size = 0u64;
    let mut mdat_offset = 0usize;
    let mut mdat_size = 0usize;
    let mut mdat_content_offset = 0usize;
    let mut found_moof = false;
    let mut found_mdat = false;

    let mut offset = 0usize;
    while offset < data.len() {
        let header = read_box_header(data, offset)
            .ok_or_else(|| format!("truncated box at offset {offset}"))?;
        let box_end = offset + header.size as usize;
        if box_end > data.len() {
            return Err(format!("box size {} exceeds data at offset {offset}", header.size));
        }

        match &header.box_type {
            b"moof" => {
                moof_offset = offset;
                moof_size = header.size as usize;
                moof_header_size = header.header_size;
                found_moof = true;
            }
            b"mdat" => {
                mdat_offset = offset;
                mdat_size = header.size as usize;
                mdat_content_offset = offset + header.header_size as usize;
                found_mdat = true;
            }
            _ => {}
        }

        offset = box_end;
    }

    if !found_moof || !found_mdat {
        return Err("missing moof or mdat box".to_string());
    }

    let moof_content_start = moof_offset + moof_header_size as usize;
    let moof_content_end = moof_offset + moof_size;

    let mut traf_rel = 0usize;
    let mut traf_sz = 0usize;
    let mut traf_hs = 0u64;
    let mut trun_entries = Vec::new();
    let mut trun_flags = 0u32;

    let moof_data = &data[moof_content_start..moof_content_end];
    let mut pos = 0usize;
    while pos < moof_data.len() {
        let h = read_box_header(moof_data, pos)
            .ok_or_else(|| "truncated box in moof".to_string())?;
        let bx_end = pos + h.size as usize;

        if &h.box_type == b"traf" {
            traf_rel = pos;
            traf_sz = h.size as usize;
            traf_hs = h.header_size;

            let traf_data = &moof_data[pos + h.header_size as usize..bx_end];
            let (entries, flags) = parse_trun_from_traf(traf_data)?;
            trun_entries = entries;
            trun_flags = flags;
            break;
        }

        pos = bx_end;
    }

    Ok(ParsedClearSegment {
        moof_offset,
        moof_size,
        moof_header_size,
        traf_offset_in_moof: traf_rel,
        traf_size: traf_sz,
        traf_header_size: traf_hs,
        trun_entries,
        trun_flags,
        mdat_offset,
        mdat_size,
        mdat_content_offset,
    })
}

fn parse_trun_from_traf(traf_data: &[u8]) -> Result<(Vec<TrunEntry>, u32), String> {
    let mut pos = 0usize;
    while pos < traf_data.len() {
        let h = read_box_header(traf_data, pos)
            .ok_or_else(|| "truncated box in traf".to_string())?;
        let bx_end = pos + h.size as usize;

        if &h.box_type == b"trun" {
            let content = &traf_data[pos + h.header_size as usize..bx_end];
            return parse_trun_entries(content);
        }

        pos = bx_end;
    }
    Ok((Vec::new(), 0))
}

fn parse_trun_entries(data: &[u8]) -> Result<(Vec<TrunEntry>, u32), String> {
    if data.len() < 8 {
        return Err("trun too short".into());
    }
    let flags = u32::from_be_bytes([0, data[1], data[2], data[3]]);
    let sample_count = u32::from_be_bytes([data[4], data[5], data[6], data[7]]) as usize;

    let mut cursor = Cursor::new(&data[8..]);
    let mut buf4 = [0u8; 4];

    if flags & 0x000001 != 0 {
        cursor.read_exact(&mut buf4).map_err(|e| format!("trun data_offset: {e}"))?;
    }
    if flags & 0x000004 != 0 {
        cursor.read_exact(&mut buf4).map_err(|e| format!("trun first_sample_flags: {e}"))?;
    }

    let has_duration = flags & 0x000100 != 0;
    let has_size = flags & 0x000200 != 0;
    let has_flags = flags & 0x000400 != 0;
    let has_cto = flags & 0x000800 != 0;

    let mut entries = Vec::with_capacity(sample_count);
    for _ in 0..sample_count {
        if has_duration {
            cursor.read_exact(&mut buf4).map_err(|e| format!("trun duration: {e}"))?;
        }
        let sample_size = if has_size {
            cursor.read_exact(&mut buf4).map_err(|e| format!("trun size: {e}"))?;
            Some(u32::from_be_bytes(buf4))
        } else {
            None
        };
        if has_flags {
            cursor.read_exact(&mut buf4).map_err(|e| format!("trun flags: {e}"))?;
        }
        if has_cto {
            cursor.read_exact(&mut buf4).map_err(|e| format!("trun cto: {e}"))?;
        }

        entries.push(TrunEntry { sample_size });
    }

    Ok((entries, flags))
}

/// Parse a clear init segment to find the sample entry type and its location.
pub struct InitSegmentInfo {
    pub sample_entry_type: [u8; 4],
    pub sample_entry_offset: usize,
    pub sample_entry_size: usize,
    pub sample_entry_header_size: u64,
    pub stsd_offset: usize,
    pub stsd_size: usize,
    pub stbl_offset: usize,
    pub stbl_size: usize,
    pub ancestors: Vec<(usize, u64)>,
}

pub fn parse_init_segment(data: &[u8]) -> Option<InitSegmentInfo> {
    let ancestors = collect_ancestor_positions(data, &[b"moov", b"trak", b"mdia", b"minf", b"stbl", b"stsd"]);
    if ancestors.len() < 6 {
        return None;
    }

    let (stsd_pos, stsd_sz) = ancestors[5];
    let (stbl_pos, stbl_sz) = ancestors[4];
    let stsd_h = read_box_header(data, stsd_pos)?;
    let entry_start = stsd_pos + stsd_h.header_size as usize + 8;

    if entry_start + 8 > data.len() {
        return None;
    }

    let entry_h = read_box_header(data, entry_start)?;

    Some(InitSegmentInfo {
        sample_entry_type: entry_h.box_type,
        sample_entry_offset: entry_start,
        sample_entry_size: entry_h.size as usize,
        sample_entry_header_size: entry_h.header_size,
        stsd_offset: stsd_pos,
        stsd_size: stsd_sz as usize,
        stbl_offset: stbl_pos,
        stbl_size: stbl_sz as usize,
        ancestors,
    })
}

/// Walk every `trak` in `moov` and return the first one whose first
/// sample entry is NOT yet `encv`/`enca`. Used to drive the multi-track
/// transform loop: callers iterate until this returns `None`, transforming
/// each clear trak in turn.
///
/// Returns ancestor sizes/positions specific to the trak found (not just
/// the first trak as `parse_init_segment` does). This is required for
/// correctly resizing only the traversed trak's ancestors when its sample
/// entry is wrapped in `sinf`.
pub fn parse_first_clear_trak(data: &[u8]) -> Option<InitSegmentInfo> {
    // Find moov.
    let (moov_pos, moov_size, moov_hs) = find_child_box(data, 0, data.len(), b"moov")?;
    let moov_content = moov_pos + moov_hs as usize;
    let moov_end = moov_pos + moov_size as usize;

    // Walk trak children of moov.
    let mut tpos = moov_content;
    while tpos + 8 <= moov_end {
        let h = read_box_header(data, tpos)?;
        if h.size < 8 || tpos + h.size as usize > moov_end { return None; }
        if &h.box_type == b"trak" {
            let trak_pos = tpos;
            let trak_size = h.size;
            let trak_hs = h.header_size;
            let trak_end = trak_pos + trak_size as usize;
            let trak_content = trak_pos + trak_hs as usize;

            // mdia → minf → stbl → stsd
            let (mdia_pos, mdia_size, mdia_hs) = find_child_box(data, trak_content, trak_end, b"mdia")?;
            let mdia_end = mdia_pos + mdia_size as usize;
            let mdia_content = mdia_pos + mdia_hs as usize;

            let (minf_pos, minf_size, minf_hs) = find_child_box(data, mdia_content, mdia_end, b"minf")?;
            let minf_end = minf_pos + minf_size as usize;
            let minf_content = minf_pos + minf_hs as usize;

            let (stbl_pos, stbl_size, stbl_hs) = find_child_box(data, minf_content, minf_end, b"stbl")?;
            let stbl_end = stbl_pos + stbl_size as usize;
            let stbl_content = stbl_pos + stbl_hs as usize;

            let (stsd_pos, stsd_size, stsd_hs) = find_child_box(data, stbl_content, stbl_end, b"stsd")?;
            let entry_start = stsd_pos + stsd_hs as usize + 8; // version+flags(4) + entry_count(4)
            if entry_start + 8 > data.len() { return None; }
            let entry_h = read_box_header(data, entry_start)?;

            // Skip already-encrypted entries; advance to next trak.
            if &entry_h.box_type == b"encv" || &entry_h.box_type == b"enca" {
                tpos += trak_size as usize;
                continue;
            }

            return Some(InitSegmentInfo {
                sample_entry_type: entry_h.box_type,
                sample_entry_offset: entry_start,
                sample_entry_size: entry_h.size as usize,
                sample_entry_header_size: entry_h.header_size,
                stsd_offset: stsd_pos,
                stsd_size: stsd_size as usize,
                stbl_offset: stbl_pos,
                stbl_size: stbl_size as usize,
                ancestors: vec![
                    (moov_pos, moov_size),
                    (trak_pos, trak_size),
                    (mdia_pos, mdia_size),
                    (minf_pos, minf_size),
                    (stbl_pos, stbl_size),
                    (stsd_pos, stsd_size),
                ],
            });
        }
        tpos += h.size as usize;
    }
    None
}

/// Find a direct child box of a known type within a parent's content range.
/// Returns (offset, size, header_size) on match, None otherwise.
fn find_child_box(data: &[u8], parent_content: usize, parent_end: usize, target: &[u8; 4]) -> Option<(usize, u64, u64)> {
    let mut pos = parent_content;
    while pos + 8 <= parent_end {
        let h = read_box_header(data, pos)?;
        if h.size < 8 || pos + h.size as usize > parent_end { return None; }
        if &h.box_type == target {
            return Some((pos, h.size, h.header_size));
        }
        pos += h.size as usize;
    }
    None
}

fn collect_ancestor_positions(buf: &[u8], path: &[&[u8; 4]]) -> Vec<(usize, u64)> {
    let mut ancestors = Vec::new();
    let mut start = 0;
    let mut end = buf.len();

    for target in path {
        let mut pos = start;
        let mut found = false;
        while pos + 8 <= end {
            let h = match read_box_header(buf, pos) {
                Some(h) => h,
                None => break,
            };
            if h.size < 8 || pos + h.size as usize > end { break; }
            if h.box_type == **target {
                ancestors.push((pos, h.size));
                start = pos + h.header_size as usize;
                end = pos + h.size as usize;
                found = true;
                break;
            }
            pos += h.size as usize;
        }
        if !found { break; }
    }

    ancestors
}

/// Build a `senc` box for the given per-sample IVs.
/// flags=0 — no subsamples (full-sample encryption).
pub fn build_senc(ivs: &[[u8; 8]]) -> Vec<u8> {
    let sample_count = ivs.len() as u32;
    let mut content = Vec::with_capacity(4 + ivs.len() * 8);
    content.extend_from_slice(&sample_count.to_be_bytes());
    for iv in ivs {
        content.extend_from_slice(iv);
    }
    make_fullbox(b"senc", 0, 0, &content)
}

/// Build a `senc` box with per-sample subsample tables.
/// flags=0x000002 — subsample encryption (per ISO/IEC 23001-7 §7.2).
/// Each sample carries: 8-byte IV + 2-byte subsample_count + N×(2-byte
/// BytesOfClearData + 4-byte BytesOfProtectedData).
pub fn build_senc_with_subsamples(
    ivs: &[[u8; 8]],
    subsamples: &[Vec<(u32, u32)>],
) -> Vec<u8> {
    assert_eq!(ivs.len(), subsamples.len(), "ivs/subsamples length mismatch");

    let sample_count = ivs.len() as u32;
    let mut content = Vec::with_capacity(4 + ivs.len() * (8 + 2 + 6));
    content.extend_from_slice(&sample_count.to_be_bytes());
    for (iv, subs) in ivs.iter().zip(subsamples.iter()) {
        content.extend_from_slice(iv);
        let sub_count = subs.len() as u16;
        content.extend_from_slice(&sub_count.to_be_bytes());
        for &(clear, protected) in subs {
            // BytesOfClearData is u16 in the box; clamp.
            let clear_u16 = clear.min(u16::MAX as u32) as u16;
            content.extend_from_slice(&clear_u16.to_be_bytes());
            content.extend_from_slice(&protected.to_be_bytes());
        }
    }
    make_fullbox(b"senc", 0, 0x000002, &content)
}

/// Build a `tenc` box (Track Encryption Box).
pub fn build_tenc(iv_size: u8, kid: &[u8; 16]) -> Vec<u8> {
    let mut content = Vec::with_capacity(22);
    content.push(0); // reserved
    content.push(0); // reserved + default_crypt_byte_block (0 for CTR)
    content.push(1); // default_isProtected
    content.push(iv_size); // default_Per_Sample_IV_Size
    content.extend_from_slice(kid);
    make_fullbox(b"tenc", 0, 0, &content)
}

/// Build a `frma` box with the original sample entry format.
pub fn build_frma(original_format: &[u8; 4]) -> Vec<u8> {
    make_box(b"frma", original_format)
}

/// Build a `schm` box (Scheme Type Box) for CENC.
pub fn build_schm() -> Vec<u8> {
    let mut content = Vec::with_capacity(8);
    content.extend_from_slice(b"cenc"); // scheme_type
    content.extend_from_slice(&0x00010000u32.to_be_bytes()); // scheme_version 1.0
    make_fullbox(b"schm", 0, 0, &content)
}

/// Build a `sinf` box containing frma + schm + schi(tenc).
pub fn build_sinf(original_format: &[u8; 4], iv_size: u8, kid: &[u8; 16]) -> Vec<u8> {
    let frma = build_frma(original_format);
    let schm = build_schm();
    let tenc = build_tenc(iv_size, kid);
    let schi = make_box(b"schi", &tenc);

    let mut content = Vec::new();
    content.extend_from_slice(&frma);
    content.extend_from_slice(&schm);
    content.extend_from_slice(&schi);
    make_box(b"sinf", &content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_make_box() {
        let b = make_box(b"test", b"hello");
        assert_eq!(b.len(), 13);
        assert_eq!(&b[0..4], &13u32.to_be_bytes());
        assert_eq!(&b[4..8], b"test");
        assert_eq!(&b[8..], b"hello");
    }

    #[test]
    fn test_build_senc() {
        let ivs = vec![[1u8; 8], [2u8; 8]];
        let senc = build_senc(&ivs);
        assert_eq!(&senc[4..8], b"senc");
        let sample_count = u32::from_be_bytes([senc[12], senc[13], senc[14], senc[15]]);
        assert_eq!(sample_count, 2);
    }

    #[test]
    fn test_build_sinf() {
        let sinf = build_sinf(b"av01", 8, &[0xAA; 16]);
        assert_eq!(&sinf[4..8], b"sinf");
        assert!(sinf.len() > 40);
    }
}
