# verify-pssh — libav CENC PSSH extraction smoke test

A small C program that replicates the exact libav consumer call path
used by the in-house ddrm-renderer / elacity-player. Used to verify
that a pc2-node-packaged init segment (or full DASH MPD) exposes an
Elacity dDRM PSSH such that ffmpeg's mov demuxer attaches an
`AVEncryptionInitInfo` to `AVStream->codecpar->coded_side_data`.

The harness ships with the full Elacity dDRM family registered in its
default accept-list (see [Registered systemIds](#registered-systemids)
below). New schemes are added to `ELACITY_DDRM_SYSIDS[]` in
`verify-pssh.c` as they ship.

This is the load-bearing acceptance gate for
[`MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE`](../../.cursor/tasks/MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE/MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.md).
Full post-mortem in [`docs/core/CENC_PACKAGING_COMPLIANCE.md`](../../docs/core/CENC_PACKAGING_COMPLIANCE.md).

## What it does

1. `avformat_open_input` + `avformat_find_stream_info` on the input.
2. For each `AVStream`, calls `av_packet_side_data_get(
   codecpar->coded_side_data, ..., AV_PKT_DATA_ENCRYPTION_INIT_INFO)`.
3. Walks the `AVEncryptionInitInfo` linked list via `info->next` and,
   for each entry, checks whether `system_id` is in the accept-list.
4. Non-matching entries are skipped silently (counted in the final
   tally). For the first match it asserts:
   - `data[]` is non-empty (pssh v0 may legitimately have
     `num_key_ids == 0` — KIDs live in `tenc`; only `data[]` is
     load-bearing for the downstream license recovery flow).
5. Prints the matched entry's `data[]` payload to **stdout**;
   structured per-entry log + PASS/FAIL banner go to **stderr**.

## Registered systemIds

The default accept-list (when neither explicit IDs nor `--any` is
passed) covers every Elacity dDRM scheme. Keep this list in sync
with the `KeySystemId` / `ProtectionType` enums on the player side.

| protectionType        | systemId                                 | notes                           |
|-----------------------|------------------------------------------|---------------------------------|
| `cenc:lit-aes-gcm-v3` | `bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe`   | Chipotle / Lit V3 (current)     |
| `cenc:lit-drm-sa-v1`  | `a17e506d-9355-4710-935f-1d928eff7594`   | Lit + smart-account variant     |
| `cenc:lit-drm-v1`     | `b7855546-88e5-40f8-ba99-c3e33033fbee`   | Lit Datil network (deprecated)  |
| `cenc:web3-drm-v1`    | `bf8ef85d-2c54-475d-8c1e-e27db60332a2`   | On-chain license metadata       |
| `clearkey` (Elacity)  | `e2719d58-a985-b3c9-781a-b030af78d30e`   | Elacity-flavoured ClearKey      |

`systemid_label()` also recognises the standard W3C ClearKey
(`1077efec-…`), Widevine, and PlayReady systemIds purely for display
purposes — they're never in the default accept-list.

Exit code:
- `0` — PASS, PSSH extracted and asserted
- `1` — FAIL, missing or malformed PSSH
- `2` — usage error / missing dependency

## Build

Requires `pkg-config` + libavformat/libavcodec/libavutil dev headers.

```sh
make                                # uses system ffmpeg (e.g. brew install ffmpeg)
make FFMPEG_PREFIX=/path/to/ffmpeg  # uses a specific build
```

Tested with native ffmpeg n7.1 (Homebrew) on macOS arm64. The Elacity
media-player project's local ffmpeg checkout
(`/Users/maciz/www/ela.city/media-player/build/lib/ffmpeg`) is an
emscripten build and can be used via `FFMPEG_PREFIX=…` only if you
build with `emcc` instead of native `cc`.

## Run

```sh
# Default accept-list: every Elacity dDRM scheme (see table above)
./verify-pssh /path/to/init.mp4

# Remote DASH MPD via IPFS gateway
./verify-pssh http://localhost:4200/ipfs/<cid>/stream.mpd

# Override the accept-list (32 hex chars; dashes/colons stripped)
./verify-pssh /path/to/init.mp4 bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe
./verify-pssh /path/to/init.mp4 \
    bf2c86c1d9ff4ab1b4be45ae4d99e1fe \
    edef8ba979d64acea3c827dcd51d21ed   # cenc:lit-aes-gcm-v3 + Widevine

# Accept ANY systemId (useful when probing unknown assets)
./verify-pssh --any /path/to/init.mp4

# Pipe the JSON payload to jq
./verify-pssh /path/to/init.mp4 | jq .

# Convenience target
make run INPUT=/path/to/init.mp4
```

The harness walks the full `AVEncryptionInitInfo` linked list via
`info->next`, so assets that carry multiple PSSH entries (Widevine +
Elacity, ClearKey marker + Elacity, etc.) are handled — the first
entry whose `system_id` matches the accept-list wins. Entries that
don't match are skipped silently and only contribute to the final
"matched N of T entries" counter.

### Verbosity

| Flag | Per-entry log | libav internals | Use case |
|---|---|---|---|
| `-q`, `--quiet` | off | silenced | scripts / CI — exit code + payload only |
| (default) | structured stderr | silenced | normal probing |
| `-v`, `--verbose` | structured stderr | `AV_LOG_INFO` | debugging libav decoder errors |
| `-vv` | structured stderr | `AV_LOG_DEBUG` | deep libav tracing |

The libav internal logs in `-v` mode are the noisy `obu_forbidden_bit
out of range`, `Number of scalefactor bands exceeds limit`, etc. that
fire when `avformat_find_stream_info` tries to decode encrypted
samples without a CDM. They're expected on encrypted DASH input and
do NOT indicate a packaging bug as long as the PSSH side-data is
extracted (which the harness checks independently).

## Example: passing run

```
$ ./verify-pssh /tmp/v-init.mp4 | jq .protocolVersion
verify-pssh — CENC PSSH discoverability check
  input    : /tmp/v-init.mp4
  accept   : 5 systemIds (cenc:lit-aes-gcm-v3, cenc:lit-drm-sa-v1, cenc:lit-drm-v1, cenc:web3-drm-v1, clearkey (Elacity))
  streams  : 1

  stream 0
    entry #0  cenc:lit-aes-gcm-v3
      systemId : bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe
      kids     : 1
        [0]    : 28310a259be14017a839f58bd86c735f
      data     : 786 bytes  → stdout

─────────────────────────────────────────────────────────────
* PASS — matched 1 of 1 entry; payload on stdout
"3.0"
```

The structured stderr block makes the hierarchy explicit:
`stream` → `entry` → fields. Non-matching entries (e.g. a Widevine
companion PSSH) are skipped from the per-entry log entirely; only the
final banner reflects them in the "matched N of T entries" counter.

## Example: failing run (pre-fix)

```
$ ./verify-pssh /tmp/pre-fix-init.mp4
verify-pssh — CENC PSSH discoverability check
  input    : /tmp/pre-fix-init.mp4
  accept   : 5 systemIds (cenc:lit-aes-gcm-v3, cenc:lit-drm-sa-v1, cenc:lit-drm-v1, cenc:web3-drm-v1, clearkey (Elacity))
  streams  : 2
  ! FAIL    : no AV_PKT_DATA_ENCRYPTION_INIT_INFO on any
              stream's codecpar->coded_side_data

─────────────────────────────────────────────────────────────
! FAIL — 0 entries scanned, none matched the accept-list
```

This was the symptom that motivated the entire fix in
`MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE`. Pre-fix mints embedded
PSSH at positions where ffmpeg's `mov_read_pssh` couldn't attach the
side data to any stream (because pssh appeared before any `trak` was
processed, so `nb_streams == 0` at parse time).

## Notes

- Stream-info detection may print decoder errors (`obu_forbidden_bit`,
  AAC bitstream warnings) when running against a `stream.mpd` directly
  — ffmpeg tries to decode samples to populate stream info, but there's
  no CDM to decrypt them. These are noise. As long as the harness
  prints `PASS`, the PSSH layer is correct.
- The harness intentionally stops at the first stream with side data.
  ffmpeg's `mov_read_pssh` attaches `AVEncryptionInitInfo` to whichever
  stream is last-registered at pssh parse time; with our per-track init
  split, each init has exactly one trak, so the pssh attaches cleanly
  to that one stream.
