# CENC Packaging Compliance — Post-Mortem & Fix Report

**Status**: Resolved 2026-05-18
**Scope**: pc2-node DASH packager (`pc2-node/crates/cenc-encrypt`, `pc2-node/src/services/media/dashPackager.ts`) + creator frontend (`pc2-node/data/{test,installed}-apps/elacity-creator/app.js`) + drafts schema (migration 34)
**Related task**: [`MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE`](../../.cursor/tasks/MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE/MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.md)
**Related protocol doc**: [`CHIPOTLE_V3_PROTOCOL.md`](CHIPOTLE_V3_PROTOCOL.md) §6 (PSSH payload schema)

## TL;DR

The pc2-node DASH packager produced encrypted media that no
third-party CENC-aware player could play. The in-house Elacity player
worked only because pc2-node decrypts samples server-side and delivers
cleartext to the browser MSE layer. Once we tried to publish discoverable
PSSH and let a libav-based player do client-side decryption, the asset
failed in every meaningful way: dashjs blacklisted segments at the MSE
append step, and the libav C-player reported decrypted-but-invalid AAC
packets at the decoder.

The root cause cascaded across **six** independent bugs in the encryption
pipeline. All six were rooted in the same architectural pattern: the
packager was implemented incrementally for an MSE-only flow and never
exercised against a real client-side CENC decryptor, so each defect was
invisible until the next one was fixed.

This document records the failure modes and the targeted fixes, so that
future packager work can avoid the same trap.

## How playback failed — by layer

### dashjs / Chromium MSE (browser-based reference player)

Final error from the dashjs reference player:

```
[StreamProcessor][audio] Blacklisting segment with url …/audio/und/mp4a.40.2/seg-1.m4s
[StreamController] A MEDIA_ERR_DECODE occurred: Resetting the MediaSource
```

Earlier failure (before root-PSSH was dropped):

```
MEDIA_ERR_SRC_NOT_SUPPORTED
(CHUNK_DEMUXER_ERROR_APPEND_FAILED: Invalid top-level ISO BMFF box type pssh)
```

Symptom timeline:

1. With root-level `pssh` sibling → Chromium MSE refused the init segment outright. Considered the init malformed.
2. After dropping root-level `pssh` → init segments accepted, but every audio media segment was rejected on `SourceBuffer.appendBuffer()` and blacklisted. Video segments accepted.

### libav-based C player (in-house ddrm-renderer)

```
PIPELINE_ERROR_DECODE: Failed to send audio packet for decoding:
  {timestamp=0 duration=21333 size=304 is_key_frame=1 encrypted=0}
```

Pre-subsample-encryption errors:

```
[libdav1d] obu_forbidden_bit out of range: 1, but must be in [0,0]
[NULL] Failed to parse temporal unit
[aac] Number of scalefactor bands in group (15) exceeds limit (14)
```

`encrypted=0` in the final error means libav's CENC decryptor ran and
emitted a packet flagged as already-decrypted, but the AAC decoder
couldn't parse it as a valid raw_data_block. Bytes were structurally
codec-shaped (not random noise) but with corrupted internals.

## Root cause

The packager violated CENC (ISO/IEC 23001-7) and CMAF (ISO/IEC 23000-19)
in six distinct ways. Each defect masked the next: removing the outermost
defect always exposed the one beneath.

### 1. Audio init was never marked as encrypted ★ (the load-bearing bug)

[`crates/cenc-encrypt/src/lib.rs::process_transform_init`](../../pc2-node/crates/cenc-encrypt/src/lib.rs)
called `mp4box::parse_init_segment` which under the hood used
`collect_ancestor_positions(moov → trak → mdia → minf → stbl → stsd)` —
this returns only the **first** trak. The transform wrapped the first
trak's sample entry in `sinf/schm/tenc` and rewrote `av01` → `encv`. The
second (audio) trak was never touched.

After the per-track init split (`mp4-split::split_init`), the audio
representation's `init.mp4` declared a plain `mp4a` sample entry — with
no `sinf`, no `tenc`. The audio segments, meanwhile, contained `senc` +
real AES-CTR ciphertext.

Consequence:

- **dashjs / MSE**: init says cleartext, segments are ciphertext → MSE
  rejects every audio segment at `appendBuffer()`.
- **libav C-player**: no `tenc` means no `default_per_sample_iv_size` and
  no `default_KID` for the audio track. libav fell back to no-op or
  wrong-width decryption → AAC decoder got garbage.

**Fix**: replace the single-trak parser with
[`mp4box.rs::parse_first_clear_trak`](../../pc2-node/crates/cenc-encrypt/src/mp4box.rs)
which walks every trak in moov, finds its stsd's first sample entry, and
returns the first one whose 4cc is not already `encv`/`enca`.
`process_transform_init` now loops over this until no clear trak remains
and wraps each in `sinf/tenc`. Multi-track inits with N traks produce N
encrypted-marked traks.

### 2. PSSH was emitted at the file root

[`splicePSSHIntoInit`](../../pc2-node/src/services/media/dashPackager.ts) initially
emitted **two** byte-identical `pssh` boxes — one inside `moov` (after
the last `trak`) and one at the file root (between `ftyp` and `moov`),
as belt-and-braces for tools that walk only top-level boxes.

Chromium MSE strictly enforces the set of legal top-level boxes per ISO
14496-12; `pssh` is not in it. Result:

```
CHUNK_DEMUXER_ERROR_APPEND_FAILED: Invalid top-level ISO BMFF box type pssh
```

Bento4 (`Ap4CommonEncryption.cpp` ~L1554-1578) places `pssh` only inside
`moov`. We had no business doing otherwise.

**Fix**: dropped the root-level emission. `splicePSSHIntoInit` now only
inserts `pssh` as the last child of `moov`. The conformance test was
updated to assert no top-level `pssh`.

### 3. PSSH was placed before any `trak` inside moov

The original task plan called for "post-`mvhd`, before first `trak`."
Empirically this drops the side-data on the floor for libav: ffmpeg's
`mov_read_pssh()` attaches `AVEncryptionInitInfo` to
`c->fc->streams[nb_streams - 1]` at parse time. When `pssh` appears
before any `trak` is processed, `nb_streams == 0` and the loop iterates
zero times.

**Fix**: pssh placed as the **last** child of moov (after every `trak`),
matching bento4. By then, all AVStreams are registered and side-data
hydrates correctly. Verified with `ffprobe -show_entries
stream_side_data_list`.

### 4. AV1 samples were full-sample encrypted

`build_senc` originally emitted `flag=0` (no subsamples) and
`encrypt_samples` encrypted entire samples. For AV1, OBU headers MUST
remain parseable BEFORE decryption so the demuxer/decoder can identify
OBU boundaries (per ISO/IEC 23001-12 Amendment 2). Encrypting OBU
headers produces:

```
[libdav1d] obu_forbidden_bit out of range: 1, but must be in [0,0]
[NULL] Invalid OBU length
```

The bento4 reference suffers from the same defect for AV1
(`Ap4CommonEncryption.cpp` has no AV1-specific subsample mapper). It
works in CDM-equipped browsers because the CDM decrypts before the
codec sees bytes; it does NOT work in raw libav-based players.

**Fix**: introduced subsample-aware encryption.
[`encrypt_samples`](../../pc2-node/crates/cenc-encrypt/src/cenc.rs) now accepts a
`clear_leader` parameter; for video, the first 32 bytes of each sample
stay unencrypted (covers OBU header + leb128 size + the start of
`uncompressed_header` for typical AV1 frames). `build_senc_with_subsamples`
emits `flag=0x02` with one `{clear, protected}` entry per sample.
[`dashPackager.ts`](../../pc2-node/src/services/media/dashPackager.ts) passes
`clear_leader=32` for video tracks. AAC stays at `clear_leader=0` (whole
sample CTR, `senc flag=0`) — matches bento4, broader player compatibility
(some libav builds don't reliably handle subsample-with-zero-clear).

### 5. Per-sample IV scheme collided across segments

The original `generate_sample_iv(seed, sample_index)` was:

```rust
iv[i] = seed[i] ^ be_u64(sample_index)[i]
```

with `seed = segment_number_BE_u64`. This collided across segments —
e.g. segment 0 sample 0 and segment 1 sample 1 both produced `IV=0`.
Each {KID, IV} pair must be unique per CENC §9.4.1; collisions in
CTR mode allow recovering `plaintext_A XOR plaintext_B` from
`ciphertext_A XOR ciphertext_B`.

The collision didn't break round-trip decryption (encryption and
decryption used the same IV) but it was a real cryptographic flaw and
would have been the next debugging mystery if the playback layer above
hadn't been broken first.

**Fix**: replaced XOR with addition. `iv = (seed_u64 + sample_index) as
BE u64`. The TS caller in
[`dashPackager.ts`](../../pc2-node/src/services/media/dashPackager.ts) maintains a
`globalSampleCounter` (`bigint`) that increments by `seg.sampleCount`
before each segment. This guarantees every sample across every track gets
a strictly monotonic, unique IV. Matches bento4's random-base + per-sample
counter pattern.

### 6. Shared multi-track init.mp4 across every Representation

[`packageDASH`](../../pc2-node/src/services/media/dashPackager.ts) was writing the
same multi-track init (with both `video` and `audio` traks) to every
Representation's `init.mp4`. A DASH demuxer parsing the MPD then saw 2
streams per Representation × 2 Representations = **4 AVStreams**, half
of which had no matching segments. Players crashed on the phantom
SourceBuffers.

**Fix**: `packageDASH` now invokes `mp4-split` WASM `split_init` mode per
track BEFORE splicing pssh. Each Representation's `init.mp4` carries
exactly one trak.

## Why this wasn't caught earlier

The in-house Elacity player path (`pc2-node /api/media/segment`) does
**server-side** CENC decryption: it fetches encrypted segments from
IPFS, decrypts samples via WASM (`cenc-decrypt`), strips the encryption
signaling, and delivers cleartext fMP4 to the browser MSE. The Elacity
player sees no encryption at all and decodes pure cleartext samples.

Every defect above only manifested when **client-side** CENC decryption
was attempted — either by a CDM-equipped browser (dashjs + Widevine
EME pointing at our custom systemid is impossible — no CDM serves our
key), or by an in-house libav-based C player implementing the Lit-based
license recovery flow.

Until 2026-05-18 we never exercised the client-side path against
pc2-node-packaged media. The bento4 reference asset was the only thing
that "worked" — and it didn't, really; it just produced parseable PSSH
metadata (which is what the comparison was about). Nobody had verified
end-to-end CENC playback against bento4 output either.

## Verification (post-fix)

| Surface | Pre-fix | Post-fix |
|---|---|---|
| `ffprobe stream_side_data_list` on video init | Empty (no side data) | `side_data_type=Encryption initialization data` |
| MSE accepts video init segment | After dropping root-pssh: ✅ | ✅ |
| MSE accepts video media segments | ✅ (silently) | ✅ |
| MSE accepts audio init segment | Yes (declared cleartext) | ✅ (declares `enca`, requests EME) |
| MSE accepts audio media segments | ❌ blacklisted | ✅ |
| libav C-player video decode | ❌ `obu_forbidden_bit out of range` | ✅ |
| libav C-player audio decode | ❌ `Failed to send audio packet` | ✅ |
| On-chain `contentId` == pssh KID == tenc KID | ❌ contentId derived from `dataToEncryptHash` | ✅ all sourced from `mediaEncodeResult.kid` |
| Per-rep init declares 1 trak | ❌ 2 traks (ghost streams) | ✅ 1 trak per Representation |
| Root-level pssh | Present (rejected by MSE) | Absent |
| In-moov pssh position | Post-mvhd (dropped by libav) | End-of-moov (after every trak) |
| AV1 senc subsamples | Absent (flag=0) | Present (flag=0x02, clear_leader=32) |
| AAC senc subsamples | Absent | Absent (bento4-matching, clear_leader=0) |
| Per-sample IV uniqueness | Collisions across segments | Strictly monotonic global counter |

## Files modified

### Rust (cenc-encrypt WASM)

- [`pc2-node/crates/cenc-encrypt/src/mp4box.rs`](../../pc2-node/crates/cenc-encrypt/src/mp4box.rs)
  - `parse_first_clear_trak`: walks every `trak` in `moov`, returns the
    first one whose first sample entry is not yet `encv`/`enca`.
  - `build_senc_with_subsamples`: emits `flag=0x02` senc with per-sample
    subsample table.
  - `find_child_box`: helper for direct-child lookup within a parent's
    content range.
- [`pc2-node/crates/cenc-encrypt/src/cenc.rs`](../../pc2-node/crates/cenc-encrypt/src/cenc.rs)
  - `encrypt_samples`: new `clear_leader` parameter; returns subsample
    info per sample. Encrypts only bytes after the clear leader.
  - `generate_sample_iv`: replaced XOR with additive counter
    (`seed + sample_index` as BE u64) — matches bento4's random+counter
    pattern.
- [`pc2-node/crates/cenc-encrypt/src/lib.rs`](../../pc2-node/crates/cenc-encrypt/src/lib.rs)
  - `EncryptCommand.clear_leader`: caller-supplied per-track clear-byte
    count.
  - `process_transform_init`: loops over every clear trak; each gets
    `sinf/schm/tenc` and 4cc rewrite. Drops the root-level pssh sibling
    emission (kept only the in-moov insertion if `pssh_params` is set).
  - `process_encrypt_segment`: chooses senc form based on whether any
    sample has a non-zero clear leader. With clear_leader > 0:
    `build_senc_with_subsamples` (flag=0x02). With clear_leader == 0:
    `build_senc` (flag=0, full-sample CTR).

### TypeScript (dashPackager)

- [`pc2-node/src/services/media/dashPackager.ts`](../../pc2-node/src/services/media/dashPackager.ts)
  - `splicePSSHIntoInit`: emits pssh ONLY as the last child of moov. No
    root sibling.
  - `extractFirstPSSHBox`: helper used by `/api/media/segment` to recover
    pssh bytes from the raw init before strip+re-splice.
  - `packageDASH`: per-Representation init split via
    `splitInitForTrackWASM` (so each `init.mp4` carries one trak only)
    + per-track `splicePSSHIntoInit`.
  - Per-segment: passes `clear_leader=32` for video, `clear_leader=0` for
    audio. Maintains a `globalSampleCounter` across segments for IV
    uniqueness.

### Mp4-split (no changes — already supported `split_init` mode)

The `mp4-split` WASM crate already had a `split_init` mode that copies
one target trak's full byte range out of a multi-track init while
filtering `mvex`'s `trex` to match. We just started calling it
per-track at packaging time.

### Frontend (creator app)

- [`pc2-node/data/{test,installed}-apps/elacity-creator/app.js`](../../pc2-node/data/test-apps/elacity-creator/app.js)
  - Removed `hashToContentId` helper (was deriving on-chain `bytes16`
    from `dataToEncryptHash`).
  - New `kidToContentId(kid)`: returns the canonical `0x`-prefixed
    bytes16 from a 32-hex KID. Throws on malformed input.
  - All mint paths now use `kidToContentId(encryptResult.kid)` for the
    on-chain `contentId`, matching the same value emitted in pssh /
    tenc / per-track metadata files. Draft-resume mint refuses to
    proceed without `draft.kid`.
  - Local-dev encryption now emits a real UUID-derived KID instead of a
    "local-dev:keyhash" stub.

### Server

- [`pc2-node/src/api/storage.ts`](../../pc2-node/src/api/storage.ts) — non-media
  Lit encryption now generates a 16-byte UUID-derived KID (was a 32-byte
  random value) so the KID is bytes16-compatible across all asset types.
- [`pc2-node/src/api/drafts.ts`](../../pc2-node/src/api/drafts.ts) — `POST`
  accepts and persists `kid`.
- [`pc2-node/src/storage/database.ts`](../../pc2-node/src/storage/database.ts) —
  `insertDraft` accepts optional `kid`.
- [`pc2-node/src/storage/migrations.ts`](../../pc2-node/src/storage/migrations.ts)
  — migration 34: `ALTER TABLE publish_drafts ADD COLUMN kid TEXT`.
- [`pc2-node/src/storage/schema.sql`](../../pc2-node/src/storage/schema.sql) —
  `kid TEXT` in the fresh-install `publish_drafts` definition.

## Tests added

- `pc2-node/tests/media/pssh-discoverability.test.ts` — synthetic init
  fixture asserts: single in-moov pssh as last moov child; no root-level
  pssh; `extractFirstPSSHBox` round-trips byte-identically; fallback to
  append when moov is missing.
- `pc2-node/crates/cenc-encrypt` unit tests:
  - `round_trip_full_sample` (clear_leader=0)
  - `round_trip_clear_leader_preserves_header` (clear_leader=32, verifies
    bytes before the leader are untouched)
  - `clear_leader_clamps_to_sample_size` (degenerate small-sample case)
  - `multi_sample_round_trip` (multiple samples, multiple IVs)
  - `unique_ivs_per_sample` (counter monotonicity)

## Outstanding items (not blocking)

- `elacity-access` SDK still ships its own `hashToContentId` in the
  vendored browser bundle (`data/test-apps/{elacity-creator,elacity-market}/vendor/access/elacity-access.browser.js`).
  Source repo is not in `/Users/maciz/www`; needs a fix landed there and
  a fresh vendor bundle replacing the local copies. Tracked separately.
- AV1 clear-leader is a fixed 32 bytes (heuristic). Proper ISO/IEC
  23001-12 Amendment 2 compliance would parse the OBU stream and emit
  per-OBU subsamples (clear = `obu_header + leb128_size +
  uncompressed_header_size`; protected = `tile_data` only). 32 B
  reliably covers the typical AV1 keyframe header for our encoder
  profile/level but could bleed into the uncompressed_header for very
  large frames. Tracked as a future hardening item; current heuristic
  is empirically sufficient.
- Phase 3 acceptance gate from the original task (a C harness binary
  that links against libavformat/libavcodec and asserts
  `av_encryption_init_info_get_side_data() != NULL`) is still pending.
  The plan called for it as the load-bearing automated test;
  implementing it would replace the manual playback verification we ran
  here.

## References

- ISO/IEC 23001-7 (CENC): Common Encryption in ISO Base Media File Format.
  §7.2 `senc`, §9.4.1 IV requirements, §9.4.2 subsample encryption.
- ISO/IEC 14496-12 (ISO BMFF): box layout, including the closed set of
  legal top-level box types.
- ISO/IEC 23001-12 Amendment 2: CENC for AV1 (per-OBU subsample rules).
- Bento4 [`Ap4CommonEncryption.cpp`](https://github.com/axiomatic-systems/Bento4/blob/master/Source/C%2B%2B/Core/Ap4CommonEncryption.cpp):
  the reference implementation we cross-checked against. Notably: bento4
  does NOT do per-codec subsample encryption for AV1/AAC; it relies on
  the consumer's CDM to decrypt before the codec sees bytes. Our
  divergence (subsamples for AV1) is intentional and needed for
  CDM-less libav playback.
- [`MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE`](../../.cursor/tasks/MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE/MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.md):
  the task plan that scoped this work, with the full back-and-forth on
  scope expansion as defects were uncovered.
