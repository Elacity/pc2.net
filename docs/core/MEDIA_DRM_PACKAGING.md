# Media DRM Packaging — Comprehensive Engineering Guide

**Scope**: end-to-end reference for pc2-node's encrypted DASH/CENC media
packaging pipeline, the on-wire format we produce, the consumer
contracts we satisfy, the operational tools for diagnosing playback,
and the failure modes we've already burned through.

**Audience**: engineers touching the packager, players, protocol layer,
or anything that produces or consumes pc2-node-encrypted media.

**Related docs**:
- [`CENC_PACKAGING_COMPLIANCE.md`](CENC_PACKAGING_COMPLIANCE.md) — post-mortem of the 2026-05-18 fix that made client-side playback work
- [`CHIPOTLE_V3_PROTOCOL.md`](CHIPOTLE_V3_PROTOCOL.md) — Chipotle / Lit V3 protocol, §6 PSSH payload schema
- [`PROTECTION_V3_MIGRATION.md`](PROTECTION_V3_MIGRATION.md) — protection layer migration history
- [`tools/verify-pssh-libav/README.md`](../../tools/verify-pssh-libav/README.md) — the C harness

---

## 1. TL;DR

pc2-node packages user-uploaded media as an MPEG-DASH bundle of
fragmented MP4 (CMAF) files, encrypts each per-codec sample with
AES-128-CTR (CENC `cenc` scheme), embeds an Elacity-specific PSSH box
carrying the metadata a client needs to recover the CEK via Lit
Actions, and pins the whole package to IPFS. The result is playable by:

- **Elacity in-house player** — pc2-node decrypts samples server-side
  and delivers cleartext fMP4 to the browser MSE; player needs no DRM
  awareness.
- **libav-based C player (ddrm-renderer)** — fetches the encrypted
  package directly from IPFS, extracts the PSSH via libav, recovers
  the CEK via Lit, decrypts samples client-side via libav's CENC
  pipeline, decodes via dav1d/aac.
- **MSE + EME-equipped browser** — would need a CDM matching our
  custom systemId; we don't ship one, so this path is informational
  (init/segments are spec-compliant; just no client-side decryption
  works in a stock browser).

The two production paths (in-house player + libav C player) are both
verified end-to-end as of 2026-05-18.

---

## 2. End-to-end pipeline

```
                ┌────────────────┐
   user file →  │ encoder.ts     │  ffmpeg transcode + mp4fragment
                │ (TS)           │
                └────────┬───────┘
                         │ fragmented.mp4 (multi-track, fMP4)
                         ▼
                ┌────────────────┐
                │ mp4-split WASM │  parse moof/mdat → returns multi-track
                │ default mode   │  init + per-track segments
                └────────┬───────┘
                         │ {initSegment, segments[], tracks[]}
                         ▼
                ┌────────────────┐
                │ cenc-encrypt   │  for EACH trak: wrap sample entry in
                │ transform_init │  sinf/schm/tenc, rename av01→encv /
                │ (WASM)         │  mp4a→enca. NO pssh emission here.
                └────────┬───────┘
                         │ multi-track init with sinf/tenc per trak
                         ▼
                ┌────────────────┐
                │ cenc-encrypt   │  for EACH segment: AES-CTR encrypt
                │ encrypt_segment│  mdat samples; emit senc with per-
                │ (WASM)         │  sample IVs (+ subsamples for AV1)
                └────────┬───────┘
                         │ encrypted seg-N.m4s per track
                         ▼
                ┌────────────────┐
   for each    │ mp4-split WASM │  reduce multi-track init to single-
   trak ──────►│ split_init     │  trak: keep mvhd + target trak +
                │ mode           │  filtered mvex's trex + udta + pssh
                └────────┬───────┘
                         │ per-Representation init (one trak each)
                         ▼
                ┌────────────────┐
                │ splicePSSHIntoInit│ splice pssh as last child of moov
                │ (TS)           │  byte-identical across all per-track
                │                │  inits of the same asset
                └────────┬───────┘
                         │ per-rep init.mp4 with pssh
                         ▼
                ┌────────────────┐
                │ generateMPD    │  emit stream.mpd with per-Representation
                │ (TS)           │  initialization + media SegmentTemplate
                └────────┬───────┘
                         │ stream.mpd + dash/<repId>/{init.mp4, seg-*.m4s}
                         ▼
                ┌────────────────┐
                │ IPFS upload    │  pin to local + Elacity IPFS;
                │                │  immutable CID per asset
                └────────────────┘
```

### 2.1 Server-side delivery path (Elacity in-house player)

```
            ┌──────────────────────┐
client ─────│ /api/media/init      │  open session, parse MPD, return
            │ (media.ts)           │  track URLs + session ID
            └──────────┬───────────┘
                       │
client req ─►          │  segmentURL
            ┌──────────▼───────────┐
            │ /api/media/segment   │
            │ if init:             │
            │   - fetch from IPFS  │
            │   - extract PSSH bytes (save for re-splice)
            │   - stripInitViaWASM (cenc-decrypt strip_init mode)
            │   - splitInitForTrackWithFallback (MSE per-track)
            │   - splicePSSHIntoInit (re-emit pssh)
            │ if media:            │
            │   - decryptSegmentViaWASM (cenc-decrypt decrypt mode)
            │   - returns cleartext fMP4 to client
            └──────────────────────┘
```

The browser MSE never sees encryption signaling. It receives clean
cleartext fMP4 and plays it natively. The pssh re-injection on the
init response is informational for any downstream tool that probes
the delivered init.

### 2.2 Client-side decryption path (libav-based C player)

```
client ─► fetch /ipfs/<cid>/stream.mpd
       │
       ▼
   libav avformat_open_input + avformat_find_stream_info
       │   parses MPD → DASH demuxer fetches per-rep init.mp4
       │   per-init mov demuxer reads pssh → av_packet_side_data_get
       │   attaches AVEncryptionInitInfo to coded_side_data
       ▼
   player extracts pssh JSON → reads protectionType/actionIpfsId
       ▼
   player invokes Lit Action with pssh.ciphertext + auth proof
       │   Lit Action evaluates access-control conditions
       │   returns CEK over an ECDH-encrypted envelope
       ▼
   player feeds CEK + per-segment senc IVs to libav's CENC decryptor
       │   libav reads tenc (default_KID, IV size) from init
       │   per sample: AES-128-CTR decrypt with CEK + IV from senc,
       │              optionally skipping clear-leader subsample bytes
       ▼
   decrypted samples → dav1d (AV1) / aac (AAC) → frames → playback
```

---

## 3. The CENC contract we produce

We follow ISO/IEC 23001-7 (Common Encryption) with the `cenc` scheme
(AES-128-CTR). Every encrypted asset emits:

### 3.1 Init segment (per Representation)

```
ftyp (isom isom av01 iso2 mp4a iso5)
moov
├── mvhd
├── trak                                  ← exactly 1 per Representation
│   └── mdia → minf → stbl
│       └── stsd
│           └── encv | enca               ← codec-specific encrypted entry
│               ├── av1C | esds | ...     ← codec config (av01 / mp4a / ...)
│               ├── fiel / pasp / btrt    ← optional
│               └── sinf
│                   ├── frma              ← original 4cc (av01, mp4a, ...)
│                   ├── schm              ← 'cenc' scheme, version 0x00010000
│                   └── schi
│                       └── tenc
│                           ├── default_isProtected: 1
│                           ├── default_per_sample_iv_size: 8
│                           └── default_KID: 16 bytes
├── mvex
│   ├── mehd                              ← movie duration
│   └── trex                              ← per-trak sample defaults
├── udta                                  ← encoder metadata (optional)
└── pssh                                  ← LAST child of moov
    ├── version=1, flags=0
    ├── system_id: bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe
    ├── KID_count=1 + KID (16 bytes)
    └── DataSize + Data[] (UTF-8 JSON, v3.0 protectionType)
```

### 3.2 Media segment (per fragment)

```
moof
├── mfhd                  ← sequence number
└── traf
    ├── tfhd              ← track defaults
    ├── tfdt              ← decode time
    ├── trun              ← per-sample sizes / offsets / flags
    └── senc              ← per-sample IVs (+ subsamples for AV1)
        ├── version=0, flags=0 (AAC) | 0x02 (AV1, subsamples present)
        ├── sample_count
        └── per sample:
            ├── 8-byte IV
            └── if flags & 0x02:
                ├── subsample_count (u16)
                └── (BytesOfClearData u16, BytesOfProtectedData u32) × N
mdat
└── encrypted sample bytes (CTR ciphertext from clear_leader offset onward)
```

We do **not** emit `saiz`/`saio` — libav handles `senc` directly. CMAF
strictly recommends saiz+saio for interop with stricter demuxers; this
is a known polish item, not blocking.

### 3.3 MPD

Standard DASH `urn:mpeg:dash:profile:isoff-on-demand:2011` with
`<SegmentTemplate>` per AdaptationSet, `initialization` and `media`
referencing per-Representation directories:

```xml
<Representation id="video/av01" codecs="av01.0.04M.10" …>
  <!-- init: video/av01/init.mp4, segs: video/av01/seg-N.m4s -->
</Representation>
<Representation id="audio/und/mp4a.40.2" codecs="mp4a.40.2" …>
  <!-- init: audio/und/mp4a.40.2/init.mp4 -->
</Representation>
```

The MPD does **not** yet emit `<ContentProtection>` descriptors
(tracked in sibling task `MEDIA-2026-04-28-DASH-MPD-COMPLIANCE`).
Players that need on-MPD signaling (rather than on-init pssh discovery)
will need that work to ship. The libav C player works off the
on-init pssh so isn't blocked.

---

## 4. The Elacity DRM protectionType

We are not a CDM. We have our own protection scheme registered with
ISO/IEC 23001-7 by way of a custom systemId. The on-wire format:

| Element | Value |
|---|---|
| protectionType | `cenc:lit-aes-gcm-v3` |
| systemId | `bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe` (one of the Elacity dDRM family) |
| pssh version | 1 (v1 carries explicit KID array; v0 carries kids only via tenc) |
| pssh Data[] | UTF-8 JSON, schema below |

### 4.1 pssh Data[] JSON schema (v3.0)

```json
{
  "protocolVersion": "3.0",
  "protectionType": "cenc:lit-aes-gcm-v3",
  "variant": "eth.web3.clearkey",
  "algorithm": "AES-128-CBC",
  "data": {
    "actionIpfsId": "Qm...",
    "litBackend": "chipotle",
    "chainId": 8453,
    "authority": "0x09dBe796...",
    "rpc": "https://mainnet.base.org",
    "kid": "0x<32 hex chars>",
    "dataToEncryptHash": "<64 hex chars>",
    "ciphertext": "<base64 or hex blob>",
    "issuer": "0x<address>",
    "signature": "<65-byte ECDSA signature, hex>",
    "format": "hex"
  }
}
```

Field semantics:

- `actionIpfsId` — the Lit Action that will recover the CEK when
  invoked with the payload above + a valid access proof.
- `litBackend` — `chipotle` (the only supported backend).
- `chainId` / `authority` / `rpc` — the EVM context against which the
  Lit Action's `accessControlConditions` are evaluated.
- `kid` — the 16-byte canonical KID for this asset (with `0x` prefix).
  **Must equal** the binary KID in the pssh KID array, the
  `default_KID` in tenc, and the on-chain `bytes16 contentId`. The
  unification of these surfaces is what `kidToContentId()` in the
  creator app enforces.
- `dataToEncryptHash` — `sha256(CEK || KID || authority)` per
  `chipotle-client.ts::encryptWithLitAction`. The Lit Action verifies
  this matches the supplied `ciphertext` before releasing the CEK.
- `ciphertext` — the PKP-AES-encrypted CEK. Decrypted by the Lit
  Action when conditions pass; opaque to everyone else.
- `issuer` + `signature` — sigauth chain proving the bundle was
  emitted by an authorised pc2-node (T-1C / Wave 8 hardening).
- `format` — payload encoding of ciphertext (`hex` for v3.0).

The Elacity dDRM **family** can register more protection schemes in
the future (e.g. `cenc:lit-aes-gcm-v4` with rotation, or a Widevine
bridge). Each scheme registers its own systemId. The C harness's
`systemid_label()` is the source of truth for the registered list.

---

## 5. KID, CEK, IV — what each is, where each lives

The DRM protocol has three distinct secrets/identifiers. The Compliance
post-mortem details how we previously confused them; this section is
the canonical reference.

### KID — Key ID

- **Role**: 16-byte stable identifier of an asset. Doubles as the
  on-chain `bytes16 contentId` and as the lookup key for the
  contract's `KID => (channel, tokenId)` mapping.
- **Generation**: `dashPackager.ts::generateCEK()` returns
  `kid = crypto.randomUUID().replace(/-/g, '')` — 32 lowercase hex
  chars = 16 bytes. Single value per asset.
- **Surfaces** (all must be byte-equal to the same 16 bytes):
  - `tenc.default_KID` in each track's init.mp4
  - pssh KID array (16 bytes) in each per-track init.mp4
  - pssh JSON `data.kid` (with `0x` prefix)
  - on-chain `bytes16` contentId via `encodeOpRawData`
  - `.ddrm` capsule `kid` field
  - draft-resume mint via `draft.kid` (column added in migration 34)
- **Never derived from**: `dataToEncryptHash`. The legacy
  `hashToContentId()` helper that did this is deleted and must not
  return.

### CEK — Content Encryption Key

- **Role**: 16-byte AES-128-CTR key used to encrypt every sample of
  every segment of an asset.
- **Generation**: `crypto.randomBytes(16)` in `generateCEK()`. Single
  value per asset.
- **Storage**:
  - In plaintext: only ever in pc2-node memory during packaging.
    Zeroed via `cek.fill(0)` immediately after use.
  - Encrypted: `ciphertext` field of pssh Data[] (PKP-AES-encrypted
    by the Lit Action's encrypt invocation).
- **Recovery**: any consumer with the pssh metadata + a valid access
  proof can invoke the Lit Action at `actionIpfsId` to get the CEK
  back. The Lit Action evaluates `accessControlConditions` against
  the supplied auth bundle.

### IV — per-sample Initialization Vector

- **Role**: 8-byte (CENC `cenc` scheme) unique nonce per sample. With
  the CEK, defines the AES-CTR keystream for that sample.
- **Generation**: `cenc::generate_sample_iv(seed, sample_index) =
  (seed_u64 + sample_index).to_be_bytes()`. The TS caller maintains a
  global per-asset sample counter and passes `globalSampleCounter`
  (BE u64) as the seed for each segment. Every sample under the same
  CEK gets a strictly monotonic, unique IV.
- **Storage**: 8-byte IV per sample written into the per-segment
  `senc` box. Consumer reads it back from `senc` and pads to 16 bytes
  (zero-pad low half) for AES-CTR.
- **Why uniqueness matters**: CTR keystream reuse under the same CEK
  leaks `plaintext_A XOR plaintext_B`. The previous XOR-based IV scheme
  collided across segments (seg 0 sample 0 and seg 1 sample 1 both
  produced IV=0). Replaced with strict counter.

---

## 6. Subsample encryption — when, why

CENC supports either:

- **Full-sample encryption** — `senc` flag=0, the entire sample is
  AES-CTR ciphertext.
- **Subsample encryption** — `senc` flag=0x02, each sample is split
  into one or more (clear, protected) byte ranges. Clear bytes pass
  through unencrypted.

Why we use both:

### AV1 video — subsamples required

AV1 OBU (Open Bitstream Unit) parsing requires header bytes to be
readable BEFORE decryption — the codec parser uses OBU headers + the
leb128 size field to determine OBU boundaries within a sample, and
also to feed `avcodec_send_packet` correctly. Encrypting OBU header
bytes corrupts the bitstream parser even when decryption is correct,
producing `obu_forbidden_bit out of range` errors in libdav1d.

Our solution: first 32 bytes of every AV1 sample are kept in the
clear (`clear_leader=32`); rest of the sample is AES-CTR encrypted.
One subsample per sample: `{clear: 32, protected: sample_size - 32}`.

32 bytes is a heuristic — covers the OBU header + leb128 size +
typical first OBU of a frame. For very large keyframes whose
`uncompressed_header` exceeds 32 bytes, encryption might bleed into
header content. We have not hit this in practice. A future
per-OBU subsample parser per ISO/IEC 23001-12 Amendment 2 would be
spec-perfect; the heuristic works for our encoder profile.

### AAC audio — full-sample encryption

`clear_leader=0`, senc flag=0 (no subsample table). Matches bento4's
default for AAC. AAC raw samples in an mp4a sample entry have no
in-band header (it's all `raw_data_block` syntactic elements); the
decoder is happy with full-sample CTR decryption.

Why not use subsamples for AAC: empirically, when we tried
`clear_leader=16` with subsamples, both Chromium MSE and the libav
C-player rejected audio segments. Some decryption stacks have
incomplete subsample handling for audio. Bento4 doesn't emit
subsamples for audio either. Aligning with bento4 here is the
broader-compatibility choice.

---

## 7. Per-track init.mp4 — why this matters

Before the 2026-05-18 fix, `packageDASH` wrote the same multi-track
init (containing both video and audio traks) to every per-Representation
`init.mp4`. A DASH-aware demuxer parsing the MPD then saw 2 streams
per Representation × 2 Representations = 4 AVStreams overall, half of
which were phantoms with no matching segments. Players crashed on
the phantom SourceBuffers.

We now invoke `mp4-split` WASM in `split_init` mode per track BEFORE
splicing pssh. Each Representation's init.mp4 carries exactly one
trak. `split_init` keeps:

- `mvhd`
- the target `trak` (verbatim — preserves `sinf/tenc`)
- `mvex` with only the matching `trex` (filtered by trak_id)
- `udta` (if present)
- any pssh that was already inside moov

The TS `splicePSSHIntoInit` then adds the canonical pssh as the last
child of moov. Net result: each rep init is a clean, single-trak,
encrypted, pssh-bearing fMP4 init.

---

## 8. Multi-trak `transform_init`

The cenc-encrypt WASM's `process_transform_init` iterates **every**
trak in moov and wraps each one's sample entry. Before the
2026-05-18 fix, only the first trak (video, in our typical ordering)
was wrapped — audio was left as plain `mp4a` clear-signaled even
though its segments were encrypted. The C player got nothing useful
from the audio init's `mp4a` and silently produced garbage.

The fix: `mp4box::parse_first_clear_trak` walks every trak and
returns the next one whose first sample entry is not yet `encv`/
`enca`. The outer loop in `process_transform_init` keeps calling
this until None, transforming each clear trak in turn. Multi-track
inputs with N traks now produce N encrypted-marked traks.

---

## 9. Server-side decryption (delivery path)

`pc2-node/crates/cenc-decrypt` does the reverse of cenc-encrypt:

- **`strip_init` mode** — removes pssh + sinf + tenc from an init
  segment, rewrites `encv`/`enca` 4cc back to the original format,
  re-sizes ancestors. Used by `media.ts` `/api/media/segment` when
  serving init to the in-house player. The PSSH is then re-spliced
  via TS `splicePSSHIntoInit` to give the player informational PSSH
  even on the cleartext-payload init.
- **`decrypt` mode** — given a CEK and an encrypted segment, AES-CTR
  decrypts samples in-place using IVs read from `senc`. Returns
  cleartext fMP4 ready for browser MSE.

The in-house player (`/api/media/segment`) is the consumer. Browser
MSE receives cleartext samples, no DRM awareness needed.

---

## 10. Client-side decryption (libav-based players)

For consumers that want to fetch directly from IPFS and decrypt
client-side (like the ddrm-renderer C-side):

1. **PSSH discovery** — `avformat_find_stream_info` triggers libav's
   `mov_read_pssh` for every `pssh` child of moov; libav attaches
   `AVEncryptionInitInfo` to the last-registered `AVStream`'s
   `codecpar->coded_side_data`. Our per-track init split means each
   init has exactly one trak, so the pssh attaches cleanly to that
   one stream.

2. **CEK recovery** — the player parses the JSON payload from
   `info->data`, extracts `actionIpfsId` and `ciphertext`, hits the
   Lit Action with a session auth bundle (sigauth from
   `secureViewSession`), receives the CEK over an ECDH envelope.

3. **CENC decryption** — the player feeds CEK to libav. libav's
   `mov_read_senc` parses per-sample IVs and subsamples. AES-CTR
   decryption runs per sample, respecting subsample byte ranges.
   Cleartext samples flow to the codec decoders.

4. **Codec decode** — dav1d for AV1, aac for AAC. As long as
   subsamples kept codec headers in the clear (or full sample is OK
   for the codec, like AAC), parsing succeeds.

---

## 11. Verification tools

### 11.1 `verify-pssh` — C harness (load-bearing)

[`tools/verify-pssh-libav/verify-pssh.c`](../../tools/verify-pssh-libav/verify-pssh.c)

Replicates the exact libav consumer call path. Use cases:

```sh
# Build
cd tools/verify-pssh-libav && make
# (or: make FFMPEG_PREFIX=/path/to/ffmpeg)

# Default: accept cenc:lit-aes-gcm-v3 only
./verify-pssh /path/to/init.mp4

# Override accept-list (e.g. multi-DRM probing)
./verify-pssh /path/to/init.mp4 \
    bf2c86c1d9ff4ab1b4be45ae4d99e1fe \
    edef8ba979d64acea3c827dcd51d21ed   # Elacity + Widevine

# Accept any systemId
./verify-pssh --any /path/to/init.mp4

# Quiet (CI / scripts)
./verify-pssh -q /path/to/init.mp4

# Verbose (enable libav internal logs)
./verify-pssh -v /path/to/stream.mpd

# Pipe payload to jq
./verify-pssh /path/to/init.mp4 | jq .data.actionIpfsId
```

stderr: structured per-entry log with system ID labels, KIDs, sizes,
match decision, PASS/FAIL banner.
stdout: matched entry's `data[]` payload only (pipeable).

Walks `AVEncryptionInitInfo->next` so assets with multiple PSSH
entries (bento4 emits ClearKey marker + Elacity payload, for example)
are handled.

### 11.2 `verify-pssh-libav.sh` — ffprobe smoke

[`tools/scripts/verify-pssh-libav.sh`](../../tools/scripts/verify-pssh-libav.sh)

Operator-friendly script: runs `ffprobe -show_data -show_entries
stream_side_data_list` and greps for `Encryption initialization data`.
Use as a quick fleet check without building C code.

```sh
FFPROBE=/opt/homebrew/bin/ffprobe bash tools/scripts/verify-pssh-libav.sh /path/to/init.mp4
```

### 11.3 Unit + fixture tests

```sh
cd pc2-node
npx tsx --test tests/media/*.test.ts
```

- `pssh-discoverability.test.ts` — synthetic placement assertions
- `pssh-fixture.test.ts` — real packaged init asserting box structure
- `crates/cenc-encrypt` Rust unit tests — round-trip encryption + IV
  uniqueness + clear-leader handling (`cargo test --target
  aarch64-apple-darwin` to run on the host)

### 11.4 Manual cross-stack verification

For end-to-end confidence after non-trivial packager changes:

1. Restart pc2-node from the changed branch (so the new WASM is
   loaded and the new TS pipeline is active).
2. Mint a fresh asset through the creator app.
3. Run the C harness against `/ipfs/<cid>/video/av01/init.mp4` and
   `/ipfs/<cid>/audio/und/mp4a.40.2/init.mp4` — both should PASS.
4. Open the same CID in the in-house Elacity player — should play
   end-to-end (server-side decryption).
5. Open the same CID in the libav-based C player — should play
   end-to-end (client-side decryption via Lit license recovery).
6. Optional: open `stream.mpd` in the dashjs reference player —
   will fail at the EME stage (no CDM matches our systemId) but
   should NOT fail at SourceBuffer.appendBuffer (which would
   indicate a malformed init).

---

## 12. Common failure modes & how to diagnose

### "MEDIA_ERR_DECODE — CHUNK_DEMUXER_ERROR_APPEND_FAILED: Invalid top-level ISO BMFF box type pssh"

**Cause**: pssh emitted at the file root. Chromium MSE rejects.
**Check**: `ffprobe -hide_banner -v trace <init.mp4> 2>&1 | grep "type:'pssh' parent:'root'"` — if anything matches, you have the bug.
**Fix**: ensure `splicePSSHIntoInit` only writes inside moov.

### "MEDIA_ERR_DECODE" on audio segments only, video plays fine

**Cause**: audio init declares `mp4a` cleartext sample entry but audio
segments are encrypted (multi-trak transform_init only processed the
first trak).
**Check**: `ffprobe -v trace <audio-init.mp4> | grep "type:'enca'\|type:'mp4a'"` — should see `enca` (encrypted).
**Fix**: `parse_first_clear_trak` walks all traks.

### libav decoder errors: `obu_forbidden_bit out of range`, `Failed to parse temporal unit`

**Cause**: AV1 OBU headers were encrypted (no clear-leader subsamples).
**Check**: dump senc and verify subsample table is present (flag=0x02)
with non-zero `BytesOfClearData`.
**Fix**: `clear_leader=32` for video traks in `dashPackager.ts`.

### "Failed to send audio packet for decoding ... encrypted=0"

**Cause**: audio init missing `tenc` (so libav has no default_per_sample_iv_size or default_KID) and player decrypts wrong bytes.
**Fix**: same multi-trak transform_init.

### Ghost streams in `ffprobe -show_streams` output

**Cause**: shared multi-track init across all Representations.
**Fix**: `splitInitForTrackWASM` per Representation in `packageDASH`.

### CTR-mode keystream reuse / suspicious IV collisions in senc

**Cause**: per-sample IV derivation collides across segments.
**Check**: dump senc IVs across segments; under the same CEK, every
8-byte IV must be unique.
**Fix**: replaced XOR derivation with strict counter (`seed + sample_index` as BE u64), with TS-side global counter threaded across segments.

### "no AV_PKT_DATA_ENCRYPTION_INIT_INFO on any stream"

**Cause**: pssh placement is wrong (e.g. before any trak), so libav
parses pssh when `nb_streams == 0` and drops the side data.
**Fix**: pssh as the LAST child of moov (after every trak).

### On-chain `contentId` doesn't equal pssh KID

**Cause**: frontend used `hashToContentId(dataToEncryptHash)` (legacy).
**Fix**: `kidToContentId(mediaEncodeResult.kid)` — `hashToContentId` is
deleted and must not return. See `CENC_PACKAGING_COMPLIANCE.md`.

---

## 13. Out of scope / roadmap

- **MPD `<ContentProtection>` descriptors** (sibling task
  `MEDIA-2026-04-28-DASH-MPD-COMPLIANCE`). Required for players that
  want MPD-side encryption signaling (e.g. dash.js with custom EME).
- **Per-OBU AV1 subsamples** per ISO/IEC 23001-12 Amendment 2. Current
  32-byte clear-leader heuristic is empirically sufficient but not
  spec-perfect.
- **`saiz`/`saio`** sample auxiliary information boxes pointing at
  senc. libav doesn't need them; some stricter demuxers do.
- **`cbcs` scheme** (AES-CBC with pattern). We only ship `cenc`
  (AES-CTR). Would be needed for FairPlay-style consumers.
- **EME CDM for browsers**. We don't ship a Widevine/PlayReady CDM
  for our custom systemId; browser playback without our in-house
  player requires the user to run a custom EME backend pointing at
  our Lit Actions. Out of scope for v1.3.
- **Audio fixture refresh**. The vendored video fixture is post-fix;
  the audio fixture is pending a fresh mint CID from after the
  multi-trak transform shipped.
- **`elacity-access` SDK cleanup**. The vendored browser bundle still
  ships its own `hashToContentId`; tracked in that repo's task list.

---

## 14. Glossary

| Term | Meaning |
|---|---|
| **CENC** | Common Encryption (ISO/IEC 23001-7). Standardised box layout + AES-CTR (`cenc`) or AES-CBC pattern (`cbcs`) sample encryption inside ISO BMFF / CMAF media. |
| **CMAF** | Common Media Application Format (ISO/IEC 23000-19). Fragmented MP4 profile for HTTP adaptive streaming. |
| **DASH** | Dynamic Adaptive Streaming over HTTP (ISO/IEC 23009-1). The manifest layer (`stream.mpd`) on top of CMAF segments. |
| **fMP4** | Fragmented MP4. ISO BMFF file where samples are interleaved with `moof`/`mdat` fragments rather than indexed by `stbl`. |
| **PSSH** | Protection System Specific Header. ISO BMFF box carrying DRM-specific protection metadata (systemId + opaque payload). |
| **systemId** | 16-byte UUID identifying a DRM scheme. Ours is `bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe` (`cenc:lit-aes-gcm-v3`). |
| **KID** | Key ID. 16-byte identifier of the CEK + asset. Lives in pssh KID array, tenc default_KID, pssh JSON `data.kid`, on-chain `contentId`. |
| **CEK** | Content Encryption Key. 16-byte AES-128 key used per-asset for sample encryption. Recovered via Lit Action by authorised consumers. |
| **IV** | Initialization Vector. 8 bytes per sample (CENC `cenc` scheme), zero-padded to 16 for AES-128-CTR. Stored in `senc`. |
| **sinf** | Protection Scheme Information box. Wraps `frma`/`schm`/`schi/tenc` inside an `encv`/`enca` sample entry. |
| **tenc** | Track Encryption Box (inside schi). Default IV size + default KID + isProtected flag for the trak. |
| **senc** | Sample Encryption Box (inside traf). Per-sample IVs and (optionally) subsample tables. |
| **encv / enca** | Encrypted Video / Audio Sample Entry. Drop-in replacement for the cleartext 4cc (avc1/av01/mp4a/etc.) when encryption signaling is present. |
| **frma** | Original Format Box (inside sinf). Carries the trak's original 4cc so a CENC-aware demuxer knows what codec to invoke after decryption. |
| **schm** | Scheme Type Box (inside sinf). `cenc` / version 0x00010000 for our packaging. |
| **schi** | Scheme Information Box (inside sinf). Contains `tenc`. |
| **clear_leader** | Number of bytes at the start of every sample left unencrypted (subsample encryption). 32 for AV1, 0 for AAC in our packaging. |
| **dDRM** | Decentralised DRM. The umbrella for Elacity's protection schemes; `cenc:lit-aes-gcm-v3` is one of them. |
| **PKP** | Programmable Key Pair. The Lit Protocol's distributed-signing primitive backing the CEK encryption / decryption. |
| **Chipotle** | Elacity's runtime adapter over Lit Protocol PKP-AES. The `litBackend: chipotle` value in pssh JSON refers to this. |
| **Lit Action** | A WASM/JS function evaluated by the Lit network under access-control conditions. Returns the CEK to authorised callers. |

---

## 15. References

- ISO/IEC 23001-7 — Common Encryption (CENC). §7.2 (senc), §8.1 (pssh),
  §9.4.1 (IV uniqueness), §9.4.2 (subsample encryption).
- ISO/IEC 14496-12 — ISO BMFF base file format. Box layout, allowed
  top-level box types.
- ISO/IEC 23001-12 Amendment 2 — CENC for AV1 (per-OBU subsample rules).
- ISO/IEC 23000-19 — CMAF profile of fMP4.
- ISO/IEC 23009-1 — MPEG-DASH manifest.
- Bento4 source: [Ap4CommonEncryption.cpp](https://github.com/axiomatic-systems/Bento4/blob/master/Source/C%2B%2B/Core/Ap4CommonEncryption.cpp) — the reference implementation we cross-checked against. Notably does NOT do per-codec subsamples for AV1/AAC; relies on a CDM downstream.
- [`CENC_PACKAGING_COMPLIANCE.md`](CENC_PACKAGING_COMPLIANCE.md) — 2026-05-18 post-mortem with per-bug deep dive.
- [`CHIPOTLE_V3_PROTOCOL.md`](CHIPOTLE_V3_PROTOCOL.md) — §6 PSSH payload contract.
- [`tools/verify-pssh-libav/README.md`](../../tools/verify-pssh-libav/README.md) — C harness usage.
- [`MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE`](../../.cursor/tasks/MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE/MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.md) — task plan + scope evolution log.

---

## 16. Changelog

### 2026-05-19 — Server-owned secure-view session on `/api/media/init`

**Scope**: in-house player delivery path only (§2.1, §9). The client-side
libav player path (§2.2, §10) is unchanged — it continues to use the
wallet-bridge `secureViewSession` bundle described in §10 step 2.

**What changed**

- `POST /api/media/init` no longer requires `req.body.secureViewSession`
  and no longer issues the `412 needsSecureView` two-phase handshake.
  The MPD-cache that existed to absorb the retry round-trip
  (`initContextCache`) is removed.
- CEK recovery on the media path is now performed by
  `recoverCEKWithServerSession` in
  [`pc2-node/src/api/chipotle-client.ts`](../../pc2-node/src/api/chipotle-client.ts).
  The server itself generates an ephemeral P-256 session keypair,
  signs the delegation with `getServerWallet()` (ownerAddress = server
  wallet, coveredAddresses = `[buyerAddress]`), signs the per-request
  bundle with the ephemeral key, calls the Lit Action, and unwraps
  the returned ECDH envelope locally.
- The shared `recoverCEKViaEnvelope` helper and the
  `SecureViewSessionBundle` interface are retained for the
  `/api/storage` non-media decrypt paths, which still receive a
  wallet-bridge–signed bundle from the parent frame.

**Why**

The pre-existing `/api/media/init` flow built a server-local ECDH
keypair and forwarded a client-signed `secureViewSession` whose
`sessionPublicKey` belonged to the client. The Lit Action wraps the
CEK to `del.sessionPublicKey`, so the server's local key was never
the ECDH counterparty and `unwrapECDHEnvelope` failed with
`OperationError: The operation failed for an operation-specific
reason` (junk AES key → PKCS7 padding check fails).

The Lit Action contract (`universal-decrypt-chipotle.js`) is fixed
and could not be modified to wrap to a separate `params.publicKey`.
The only remaining options were (a) make the server own the entire
session, or (b) move unwrap to the browser. Option (b) requires
porting the WASM `cenc-decrypt` pipeline to the browser and is a
separate, larger project. Option (a) was selected because it
preserves the existing trust model — the server already holds the
CEK during the segment proxy (§9), so server-owned session keys add
no new exposure.

**Trust model note**

The Lit Action's on-chain `hasAccessByContentId(holder, contentId)`
check remains the access gate. The server signing the delegation
only asserts "this session is authorised to proceed"; it cannot grant
playback to a buyer that does not hold the AccessToken on-chain.

**Files touched**

- [`pc2-node/src/api/chipotle-client.ts`](../../pc2-node/src/api/chipotle-client.ts)
  — added `recoverCEKWithServerSession`.
- [`pc2-node/src/api/media.ts`](../../pc2-node/src/api/media.ts)
  — `/api/media/init` no longer reads `req.body.secureViewSession`
  or returns 412; `recoverMediaCEK` now calls the server-session
  helper; `initContextCache` / `CachedInitContext` /
  `INIT_CACHE_TTL_MS` and the secureViewSession field on `litParams`
  removed.

**Reference implementation**

The pattern is mirrored exactly from the developer tool
[`tools/lit-direct-decrypt.mjs`](../../tools/lit-direct-decrypt.mjs),
which proves the unwrap end-to-end when the same process holds both
the session signing key and the ECDH counterparty.
