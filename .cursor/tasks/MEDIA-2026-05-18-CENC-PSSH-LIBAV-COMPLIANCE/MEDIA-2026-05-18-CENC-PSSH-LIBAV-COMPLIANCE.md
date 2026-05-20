# Task: CENC PSSH placement & delivery — make our PSSH readable by any ISOBMFF/DASH parser (libav, MP4Box, dash.js)

**Task ID**: MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE
**Created**: 2026-05-18
**Status**: ✅ Resolved 2026-05-18 — see [`docs/core/CENC_PACKAGING_COMPLIANCE.md`](../../docs/core/CENC_PACKAGING_COMPLIANCE.md) for the post-mortem and full file-by-file change list. Both dashjs and libav-based C-player playback verified end-to-end against a freshly minted asset.
**Priority**: Medium (interop polish — non-blocking for v1.3; targets v1.3.x post-launch)
**Related**: [`MEDIA-2026-04-28-DASH-MPD-COMPLIANCE`](../MEDIA-2026-04-28-DASH-MPD-COMPLIANCE/MEDIA-2026-04-28-DASH-MPD-COMPLIANCE.md) (MPD-side `<ContentProtection>` work — assumed merged or merging in parallel; this task is the init-segment & delivery counterpart)

## Description

The Elacity PSSH box produced by `dashPackager.ts::buildBinaryPSSHBox()` is
structurally correct per ISO/IEC 23001-7 §8.1 (v1 FullBox; SystemID; KID_count;
KID; DataSize; Data), but cannot be extracted by generic ISOBMFF parsers
(libav/ffprobe, MP4Box, mp4box.js) from the assets we package today. Side-by-side
comparison with Bento4 `mp4dash --pssh <systemId>:@pssh.json` output — which uses
the **same** custom system ID and **same** JSON payload — confirms libav reads
mp4dash's box cleanly and fails on ours.

Two root causes, both fixable without touching the CEK / Lit / Chipotle chain:

1. **Placement within `moov` is wrong.** `injectPSSHBox()`
   (`pc2-node/src/services/media/dashPackager.ts:209-251`) splices the pssh
   box at `moovEnd` — *after* all `trak` children. Bento4 (and the canonical
   CENC pattern) place pssh as a child of `moov` **before** the first `trak`.
   Several parsers (including some libav code paths and downstream tooling
   that stops scanning moov children once tracks are resolved) miss pssh that
   appears at the tail.
2. **The delivery path strips PSSH before the player sees it.**
   `pc2-node/src/api/media.ts:636` calls `stripInitViaWASM()`, which runs the
   `cenc-decrypt` crate in `strip_init` mode
   (`pc2-node/crates/cenc-decrypt/src/lib.rs:62-71`). That removes `sinf`,
   `pssh`, and rewrites `encv→av01` / `enca→mp4a`. By the time a libav-based
   player fetches `GET /media/:cid/init`, the box is gone. Even a perfect
   injection on the encryption side is invisible to downstream consumers.

Fixing both gives third-party tools — including a libav/C player that only
wants to **discover and read the PSSH JSON payload** without doing CENC
sample decryption — a working extraction path. Sample decryption itself stays
server-side as today; this task only restores PSSH **discoverability**.

## Background

Irzhy flagged the gap during the 2026-05-18 review of the Chipotle v3
encryption analysis:

> "as of your analysis, does the PSSH box injection is complying with
> MPEG-DASH standard? Let's assume I have a player based on libav library
> in C, would I be able to read the PSSH metadata information from the
> media with this actual state? if not what could I do? anyway we have
> created our own systemId 'bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe' and
> store the JSON data about how we can retrieve the CEK from lit within
> it. Anyway it works well using mp4dash by adding
> --pssh bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe:@pssh.json during execution.
> On this mp4dash case, I'm well able to read the pssh box from libav.
> But unfortunately these pssh produced there cannot be read here."

Custom system ID is fine — ISO/IEC 23001-7 allows arbitrary UUIDs and the
Elacity dDRM ID `bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe` is registered in
`CHIPOTLE_V3_PROTOCOL.md` §6. The opacity of the JSON payload is also fine
— CENC's `Data[]` field is by definition DRM-system-specific. The interop
gap is purely **placement + delivery**, not box structure or payload shape.

### SystemID ↔ Data format coupling (don't piggyback on standard IDs)

Each pssh `SystemID` defines the format of that box's `Data[]` by convention.
A parser that recognises the SystemID interprets `Data[]` per the matching
spec; a parser that doesn't recognise it surfaces `Data[]` as an opaque
buffer (libav's `AVEncryptionInitInfo->data`) and leaves interpretation to
the caller. Mixing IDs and data formats is what breaks interop — not the
custom UUID itself.

| SystemID | `Data[]` convention | Why we DON'T use it |
|---|---|---|
| `1077efec-c0b2-4d02-ace3-3c1e52e2fb4b` (W3C ClearKey) | KIDs in the KID array, **CEK delivered out-of-band but discoverable** by anyone who has the file; trivially exposes the key. | Publishing this would expose our CEK to anyone fetching the init, defeating the entire Lit/Chipotle access-control model. |
| `edef8ba9-79d6-4ace-a3c8-27dcd51d21ed` (Widevine) | Google-proprietary protobuf pointing at a Widevine license server. | Requires the Google-licensed Widevine CDM (L1/L3) on the client and a Widevine-compliant license server. Not viable for our open / decentralised threat model. |
| `9a04f079-9840-4286-ab92-e65be0885f95` (PlayReady) | Microsoft WRMHEADER XML pointing at a PlayReady license URL. | Microsoft-licensed CDM dependency, same blocker as Widevine. |
| `bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe` (**Elacity dDRM v3**) | UTF-8 JSON per `CHIPOTLE_V3_PROTOCOL.md` §6 — `protocolVersion`, `protectionType`, `actionIpfsId`, `kid`, `ciphertext`, `dataToEncryptHash`, `issuer`, `signature`. CEK is *not* in the box; recovery requires hitting the Lit Action gated by access-control conditions. | This is the right pairing for our model — sovereign systemId, custom payload, no CEK exposure. |

**Implications for this task:**

- We MUST NOT emit a ClearKey-format pssh as an interop alias. Even gated
  behind a "discovery only" flag it would publish the CEK at first
  packaging — irreversible on IPFS.
- We MAY consider emitting multiple Elacity-systemId pssh boxes in the
  future (e.g. one v3.0 JSON + one v3.1 envelope for backward compat
  during protocol migrations), but each must use the Elacity systemId. A
  parser sees them as alternates; consumers pick by `protocolVersion`.
- Downstream tooling (the libav C harness in Phase 3) will always receive
  `AVEncryptionInitInfo->data` as an opaque byte buffer. It is the C
  consumer's responsibility to (a) check `system_id` is the Elacity UUID
  before parsing, and (b) parse the bytes as v3.0 JSON via its own JSON
  library. Acceptance criterion §4 already encodes this contract.
- Bento4's reference output emits **two** pssh boxes (52 bytes + 806
  bytes — confirmed in our 2026-05-18 diagnostic capture). The 52-byte
  one is a marker / different systemId emitted by mp4dash itself; the
  806-byte one is the Elacity payload. We do NOT need to replicate the
  marker box — ffmpeg consolidates and exposes only one
  `AV_PKT_DATA_ENCRYPTION_INIT_INFO` per stream, and our payload is
  self-sufficient.

Reference implementation that works today (Bento4):

```bash
mp4dash --pssh bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe:@pssh.json \
        <fragmented.mp4>
# → ffprobe -show_data init.mp4 reveals pssh side data ✓
```

Current pc2-node packager output:

```bash
# after pc2-node packageDASH() flow
ffprobe -show_data init.mp4   # → no pssh side data ✗
```

## libav extraction contract (the actual acceptance gate)

The downstream C player uses ffmpeg's modern side-data accessor over
`AVStream->codecpar->coded_side_data` and expects ffmpeg's MOV demuxer
(`libavformat/mov.c::mov_read_pssh`) to have populated
`AV_PKT_DATA_ENCRYPTION_INIT_INFO` from our pssh box. The reference call
site:

```c
AVEncryptionInitInfo *
parser_extract_encryption_init_info(AVFormatContext *ctx) {
  AVEncryptionInitInfo *cenc = NULL;
  for (unsigned int i = 0; i < ctx->nb_streams && cenc == NULL; i++) {
    const AVCodecParameters *codecpar = ctx->streams[i]->codecpar;
    const AVPacketSideData *sd = av_packet_side_data_get(
        codecpar->coded_side_data, codecpar->nb_coded_side_data,
        AV_PKT_DATA_ENCRYPTION_INIT_INFO);
    if (sd != NULL && sd->size > 0) {
      cenc = av_encryption_init_info_get_side_data(sd->data, sd->size);
    }
  }
  return cenc;
}
```

For this call to return a non-NULL `AVEncryptionInitInfo*`, ffmpeg's
`mov_read_pssh()` must successfully parse our pssh box during demux. That
imposes a specific contract on what we emit. Concretely, our box must
satisfy **all** of the following — anything else is the bug we're chasing:

### Box-level requirements (per `mov_read_pssh` in `libavformat/mov.c`)

| Requirement | Our current emission | Status |
|---|---|---|
| Box tag is exactly `pssh` (4cc, ASCII) | `dashPackager.ts:193` writes `'pssh'` | ✓ |
| FullBox header: 1 byte version + 3 bytes flags | `dashPackager.ts:194-196` writes `version=1, flags=0` (1 byte + 1 byte + 2 bytes = 4 bytes total) | ✓ |
| 16-byte SystemID immediately follows the FullBox header | `dashPackager.ts:198` | ✓ |
| If `version >= 1`: 4-byte BE `KID_count`, followed by `KID_count * 16` bytes of KIDs | `dashPackager.ts:200-201` writes `KID_count=1` + 16-byte KID | ✓ |
| 4-byte BE `DataSize` | `dashPackager.ts:203` | ✓ |
| `DataSize` bytes of opaque DRM data | `dashPackager.ts:204` | ✓ |
| **Total box length (size header) MUST equal actual bytes written** — `mov_read_pssh` reads exactly `atom.size` bytes; mismatch causes silent drop | `dashPackager.ts:187-189` computes `boxSize = 12 + contentSize` where `contentSize = 16 + 4 + 16 + 4 + dataBytes.length` → 12 = 4 (size) + 4 ('pssh') + 4 (version+flags) ✓ | ✓ on paper — needs a byte-level assertion test |
| **Box must be located where the mov demuxer's atom walker visits it** — typically a direct child of `moov` (or `moof` for fragments) | Currently injected at `moovEnd`, i.e. **last** child of moov, before any trailing top-level boxes (mdat/free) | ⚠️ Inside moov but at tail — likely root cause |

### Demuxer-walk requirements

ffmpeg's mov demuxer (`mov_read_default` → `mov_read_moov`) iterates moov
children sequentially and dispatches on the 4cc. In recent ffmpeg builds
(n6.x+) `mov_read_pssh` IS in the default parse table and IS reached
regardless of child position — but there are two known footguns:

1. **Init-segment-only demuxing**: when the player feeds **only the init
   segment** (DASH style — init.mp4 fetched separately from segments),
   some ffmpeg paths short-circuit moov parsing once codec parameters
   are resolved. A pssh placed *after* the last `trak` is at risk of
   being skipped if the demuxer decides moov walking is "done" once all
   tracks are read. Bento4 mp4dash places pssh **before** the first
   `trak`, which dodges this entirely.
2. **`AVStream->codecpar->coded_side_data` hydration**: the side data
   ends up on **codecpar**, not on the AVStream directly. This means the
   pssh must be associated with a stream during demux — which happens
   automatically when pssh is parsed alongside the trak boxes inside
   moov. A pssh at the **top level** (sibling of moov) is parsed by
   ffmpeg and placed on the AVFormatContext, but **not** automatically
   replicated onto each AVStream's codecpar.coded_side_data — the C
   call site above iterates streams, not format-context side data, so
   a root-only pssh would be invisible to it.

### Implications for this task

- **Place pssh inside `moov`, at the END (after all `trak` boxes).**
  *Correction (2026-05-18 diagnostic capture):* the original draft said
  "immediately after `mvhd`, before the first `trak`". That was wrong and
  empirically broke libav extraction. ffmpeg's `mov_read_pssh()` iterates
  `c->fc->nb_streams` **at the moment it parses each pssh box** and
  attaches the `AVEncryptionInitInfo` to every existing stream. When pssh
  appears before the first `trak`, `nb_streams == 0` and the side-data is
  silently dropped — even though the box is structurally valid and ffmpeg
  reports parsing it in the trace log. Bento4's actual layout (verified
  against `QmduV7…/video/av01/init.mp4`) places pssh as the **last**
  child of moov, after every `trak`. Match that.
- **Also emit a top-level pssh sibling** as a redundancy for tools that
  walk only top-level boxes (MP4Box, mp4box.js, third-party probes).
  Note: this top-level copy will populate
  `AVFormatContext->side_data` in ffmpeg, NOT
  `AVStream->codecpar->coded_side_data`. The user's call site uses the
  per-stream path, so the in-moov pssh is the one that actually wins;
  the root one is a belt-and-braces for non-ffmpeg consumers.
- **No pssh payload changes required.** The opaque `Data[]` field is
  surfaced verbatim by `av_encryption_init_info_get_side_data()` as
  `cenc->data` / `cenc->data_size`. The C consumer parses the v3.0 JSON
  out of that buffer using its own JSON library. ffmpeg makes no
  assumptions about the payload shape.
- **`KID_count` + `KID` MUST be present** (we use v1 with KID_count=1
  today — keep it). `mov_read_pssh` populates `cenc->key_ids` from
  these; a v0 box with no KIDs would still parse but the C side would
  lose the KID surface.
- **Delivery preservation is non-negotiable**: the strip pass currently
  destroys pssh before `/init` responds. Without Phase 2 of this task,
  ffmpeg has nothing to parse regardless of how perfectly Phase 1
  places the box.

### Diagnostic baseline (run before implementing the fix)

Before writing any code, capture the current failure mode in a
reproducible way:

```bash
# 1. Get a packaged init segment that currently fails libav extraction
curl -sSL https://<pc2-node>/media/<cid>/init -o init.mp4

# 2. Confirm ffmpeg/libav can't see pssh today
ffprobe -hide_banner -show_data -show_entries stream_side_data_list \
        -i init.mp4 2>&1 | grep -i encryption

# 3. Same against mp4dash reference (should succeed)
mp4dash --pssh bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe:@pssh.json \
        <fragmented.mp4> -o ref/
ffprobe -hide_banner -show_data -show_entries stream_side_data_list \
        -i ref/init.mp4 2>&1 | grep -i encryption

# 4. Diff the box trees to confirm placement is the delta
MP4Box -diso init.mp4     # ours → init_info.xml
MP4Box -diso ref/init.mp4 # reference → ref/init_info.xml
diff <(xmllint --format init_info.xml) <(xmllint --format ref/init_info.xml)
```

Save the diagnostic output under
`.cursor/tasks/MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE/diagnostics/`
as `before.txt`. Re-run after Phase 1+2 land and save as `after.txt`.
The acceptance gate is `after.txt` reporting an encryption side-data
entry that `before.txt` does not.

## Current state verified (code reading, 2026-05-18)

| Concern | File / lines | Status |
|---|---|---|
| PSSH box structure | `dashPackager.ts:183-207`, `crates/cenc-encrypt/src/pssh.rs:28-43` | ✓ Spec-compliant v1 FullBox |
| PSSH placement in `moov` | `dashPackager.ts:239-248` (`moovEnd` insertion) | ✗ After traks, not before |
| Top-level PSSH (sibling of `moov`) | not emitted | ✗ Missing |
| `tenc` inside `sinf/schi` of `encv`/`enca` sample entries | WASM emits during encryption then strip pass removes | ⚠️ Removed pre-delivery |
| PSSH preserved in delivered init segment | `media.ts:636` calls `stripInitViaWASM()`; `crates/cenc-decrypt/src/strip.rs` removes pssh + sinf | ✗ Stripped |
| MPD `<ContentProtection>` descriptors | `mpdGenerator.ts:102-156` emits none | ✗ Covered by sibling task MEDIA-2026-04-28 |
| MPD `xmlns:cenc` declaration | not declared | ✗ Covered by sibling task |

Conclusions:

- **Box bytes are right; placement and delivery are wrong.** No change to
  `buildBinaryPSSHBox()` itself is required. The Elacity system ID, the JSON
  payload shape, and the v3.0 protection-data fields all stay byte-identical.
- **MPD-side fixes belong to the sibling task** (`MEDIA-2026-04-28-DASH-MPD-COMPLIANCE`).
  This task assumes that work either ships first or in parallel and focuses
  exclusively on the init segment and delivery path. The two tasks share a
  hard byte-equality acceptance criterion: the bytes of `buildBinaryPSSHBox()`
  must appear byte-identical in (a) the in-moov pssh child, (b) any top-level
  pssh sibling, and (c) the base64 `<cenc:pssh>` of the Elacity-system
  `<ContentProtection>` in the MPD.

## The gaps

### 🔴 Must-have

1. **PSSH placed at end of `moov` instead of after `mvhd`.** Reorder so the
   pssh box becomes a child of `moov` **immediately after `mvhd`** and before
   the first `trak`. This is the canonical CENC layout and what mp4dash emits.
2. **No top-level PSSH sibling.** ISO/IEC 23001-7 §8.1.1 explicitly allows
   pssh at the file (root) level. Belt-and-braces: parsers that only walk
   top-level boxes (some demuxers, some discovery tools) will still find it.
3. **PSSH stripped from delivered init segment.** `stripInitViaWASM()`
   removes every pssh child of moov before the response is sent. Re-inject
   the box (same bytes that went into the on-disk init) before responding,
   OR introduce a delivery mode that preserves it.

### 🟡 Opportunistic

4. **`tenc` is rewritten away.** The current `strip_init` mode also removes
   `sinf` (which carries `schi/tenc`). For PSSH-only discovery this is not
   load-bearing, but a CENC-aware client cannot derive the IV size / default
   KID without `tenc`. Preserving `tenc` is cheap (it's already present
   pre-strip) and unlocks future EME-based players. Gate behind a new
   delivery mode so the current player path is unaffected.
5. **No conformance test gate.** Add an integration test that runs
   `ffprobe -show_data` (or equivalent) against generator output and the
   live `GET /init` response and asserts pssh extractability.

### 🔴 Compliance scope expansion (added 2026-05-18 after Phase 1+2 landed)

PSSH placement landed and ffmpeg/libav extraction confirmed working end-to-end
by an in-house C player. While auditing the post-fix asset alongside the bento4
reference, two additional compliance gaps surfaced that fall under the same
"third-party tools can correctly parse our media" goal — they are added to this
task rather than spun out because they share the same fixture, the same
acceptance gate (libav / MP4Box / ffprobe), and the same release window.

6. ~~**`mvex` (MovieExtendsBox) missing from packaged init.**~~ **RETRACTED
   2026-05-18 after re-tracing the full box tree.** The earlier
   "mvex missing" claim was a filter artefact (`head -25` clipped the trace
   before the mvex line). Full trace of the packaged init shows `mvex` is
   present with `mehd` + one `trex` per track, and `udta` is preserved.
   Spec-compliant. No action needed.
7. **KID flow consistency end-to-end** (RESOLVED 2026-05-18, see "Resolution" below). Audit
   the KID through:
   1. `dashPackager::generateCEK()` (`randomUUID().replace(/-/g, '')` →
      32-hex string, **16 bytes**).
   2. `dashPackager::packageDASH(... kid ...)` →
      - `contractKidHex = kid.padEnd(32, '0')` (no-op when already 32 chars).
      - `buildBinaryPSSHBox(contractKidHex, ...)` → bytes in pssh KID array.
      - `buildProtectionData(kid, ...)` → `data.kid = "0x"+kid` in JSON.
      - `cenc-encrypt transform_init` with `kid_hex: contractKidHex` → bytes
        in `tenc` (`build_tenc(iv_size, kid)`).
   3. `createEncryptedDASH` returns `dashResult.kid` (the original 32-hex).
   4. `/api/media/encode` job result emits `kid: dashResult.kid` to the
      frontend.
   5. Frontend submits this kid to the on-chain mint transaction.
   6. `media.ts /init` reads on-chain kid (`contractKidHex`) and matches
      against the cached session.

   Reported symptom: "the KID registered to the media seems to be different
   to the one set as argument during mint." Hypotheses to verify with
   instrumentation, in order of likelihood:
   - **Case mismatch.** `randomUUID()` outputs lowercase hex; the contract
     side may normalize/canonicalize differently (uppercase, with-0x vs
     without-0x). String-equality checks downstream silently fail.
   - **Width mismatch.** A code path elsewhere truncates the kid to 16 hex
     chars (8 bytes) thinking 16 chars = 16 bytes; then `padEnd(32, '0')`
     zero-pads, producing a kid whose first 8 bytes match the original and
     last 8 bytes are zero — passes some checks, fails others. Search
     `pc2-node/src` for `.slice(0, 16)`, `.substring(0, 16)`, `padEnd`.
   - **Two KIDs in flight.** Frontend takes one kid from the encode response
     and a different kid from a separate Lit call (`storage.ts:2215` uses
     `randomBytes(32)` = 32-**byte** = 64-hex KID for non-media — confirm
     this code path isn't accidentally reachable in the media-encode flow).
   - **Endianness or hex-encoding swap.** Less likely with `Buffer.from(kid,
     'hex')` but worth a binary diff between on-chain kid and pssh KID
     bytes.

   Fix MUST preserve the just-verified working state: the C harness's
   `info->key_ids[0]` value MUST equal the on-chain kid bit-for-bit AFTER
   the fix. Add this as an explicit Phase 3 conformance assertion.

### Resolution (2026-05-18, frontend + storage only)

Root cause was structural, not a divergence at any single call site:
- pc2-node was self-consistent (all KID surfaces — pssh KID array, pssh
  JSON `data.kid`, tenc KID, `dashResult.kid` — derived from the same
  16-byte random value emitted by `generateCEK()`).
- **The frontend mint flow used a completely different identifier on-chain.**
  `encodeOpRawData` derived its `bytes16 contentId` from
  `hashToContentId(dataToEncryptHash)` — first 16 bytes of the Lit-Action
  hash — which by design cannot equal the KID (the KID is one of the
  inputs to that hash; see [`chipotle-client.ts:935-942`]).
- The V3 contract maintains a `KID => (Channel, TokenId)` mapping, so the
  on-chain `bytes16` MUST be the canonical KID for libav-based players to
  resolve assets by the KID extracted from pssh.

Changes landed (frontend creator app + server storage + DB schema):

| File | Change |
|---|---|
| `pc2-node/data/{test,installed}-apps/elacity-creator/app.js` | Deleted `hashToContentId()`. Added `kidToContentId(kid)`. `encodeOpRawData` rejects non-bytes16 contentId. Site 1 (fresh mint) uses `kidToContentId(encryptResult.kid)`. Site 2 (draft-resume) throws unless `draft.kid` is set. `.ddrm` capsule sources from `mediaEncodeResult.kid` for media. Local-dev encryption now generates a real UUID-derived KID. `litData.kid` captured into `encryptResult.kid` for non-media. Draft body sends `kid`. |
| `pc2-node/src/api/storage.ts` | `/api/storage/lit/encrypt` now generates a 16-byte UUID-derived KID (was 32-byte `randomBytes`) so non-media KIDs are bytes16-compatible. Returned as `kid: '0x' + 32 hex`. |
| `pc2-node/src/api/drafts.ts` | `POST /api/drafts` accepts and persists `kid`. |
| `pc2-node/src/storage/database.ts` | `insertDraft()` accepts optional `kid`. |
| `pc2-node/src/storage/migrations.ts` | Added migration 34: `ALTER TABLE publish_drafts ADD COLUMN kid TEXT`. Bumped `CURRENT_VERSION` to 34. Updated migration 32 self-heal CREATE statement to include the column. |
| `pc2-node/src/storage/schema.sql` | Added `kid TEXT` to `publish_drafts` for fresh installs. |

Outstanding items (NOT in this task's PR):

- **`elacity-access` SDK vendor bundle** still ships its own
  `hashToContentId` (`data/{test,installed}-apps/{elacity-creator,elacity-market}/vendor/access/elacity-access.browser.js:498315`).
  This is a bundled artefact of a separate library and the source repo is
  not in `/Users/maciz/www`. Track removal in that repo's task list; until
  then, any consumer that imports `hashToContentId` from the SDK
  (rather than calling the creator app's `kidToContentId`) will still
  produce stale contentIds.
- **Pre-fix on-chain assets** remain queryable by their existing
  hash-derived `bytes16`. New mints use the canonical KID. Indexers
  joining on `contentId` must accept both spaces during the transition.

### 🟢 Skipped (explicitly out of scope)

- Changing the Elacity system ID. `bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe`
  stays — it is the registered V3 ID per `CHIPOTLE_V3_PROTOCOL.md` §6.
- Adopting Widevine / PlayReady marker pssh boxes. We do not use those CDMs.
- Implementing client-side EME-based sample decryption. CEK recovery still
  flows through Lit / Chipotle / the existing ECDH envelope path.
- MPD `<ContentProtection>` work (delegated to the sibling task).
- ~~**Per-track packaging-time init splitting**~~ **PROMOTED INTO SCOPE
  2026-05-18 and implemented.** The original deferral was wrong: sharing
  the same multi-track init across every per-Representation `init.mp4`
  causes DASH demuxers (ffprobe, dash.js, shaka) to register **N streams
  per Representation init** (one per trak declared inside that init).
  With 2 Reps × 2 traks-per-init = 4 AVStreams overall, half of which
  have no segments in their Representation — leading to ghost
  SourceBuffers and player crashes. `packageDASH` now calls the
  `mp4-split` WASM `split_init` mode per track, then splices pssh into
  the resulting single-track init. Each Representation's init.mp4
  declares exactly one stream and carries its own pssh.
- bento4's 52-byte marker pssh. Not needed (covered in §"SystemID ↔ Data
  format coupling" above).

## Why this is safe

| # | Change | Read by our code? | Consequence if shipped |
|---|---|---|---|
| 1 | Reorder pssh inside `moov` (post-`mvhd`, pre-`trak`) | Indirectly — `cenc-decrypt::strip.rs` walks moov children and removes pssh regardless of position. New position is still found and stripped if strip mode is invoked. | Safe. Same bytes, earlier in the box list. |
| 2 | Emit a second top-level pssh sibling of `moov` | No. `cenc-decrypt::strip.rs` currently only scans inside moov. Add a top-level pass in strip mode so the new sibling is also removed under `strip_for_mse` to keep MSE behaviour unchanged. | Safe with paired strip-side update. |
| 3 | Re-inject pssh into the cleaned init before sending (Option A in implementation), OR new `keep_protection` delivery mode (Option B) | Option A: no — pssh is informational at MSE layer, MSE ignores it. Option B: only invoked when client opts in via query param. | Safe. Phase A default; Phase B opt-in. |
| 4 | Preserve `tenc` in `keep_protection` mode only | No client today reads tenc on the player side (samples already decrypted server-side). New mode is opt-in. | Safe. Strict superset; default path unchanged. |
| 5 | New conformance test | Test-only. | Safe. |

**Additional safety guarantees:**

- **No CEK / encryption changes.** `encryptMediaCEK()`, `cenc-encrypt.wasm`
  invocations, and the Chipotle / Lit chain are untouched.
- **No PSSH payload changes.** `buildProtectionData()` and the v3.0 JSON
  schema in `CHIPOTLE_V3_PROTOCOL.md` §6 are untouched. Same bytes flow
  through; only position and delivery preservation change.
- **No on-IPFS migration.** Already-pinned init segments are immutable.
  Only new mints after the fix ships use the new placement. Old assets
  continue to play as today (their pssh was stripped on delivery before
  this task and remains stripped — clients never saw it anyway).
- **Default playback path unchanged.** Phase A (re-inject) preserves
  exactly what the current elacity-player expects: cleartext samples in
  the delivered init, just with an informational pssh box appended. MSE
  ignores it. Phase B (`keep_protection` mode) is opt-in.
- **Strip-side update is required when adding the top-level pssh sibling.**
  `crates/cenc-decrypt/src/strip.rs` currently only strips pssh from inside
  moov; if we add a sibling, the strip pass must remove it too (Phase A) or
  preserve it (Phase B). This is one extra walk over top-level boxes.
- **Player-source repo is separate.** `pc2-node/data/test-apps/elacity-player`
  contains only the built bundle (`assets/index-B4B5WpHv.js`). Player source
  lives in the `media-player` repo. Phase A requires zero player changes.
  Phase B requires a one-line query-param addition in the `media-player` repo
  — tracked there, not here.

## Requirements

`pc2-node/src/services/media/dashPackager.ts::injectPSSHBox()` and
`pc2-node/src/api/media.ts` (the `/init` handler) plus the `cenc-decrypt`
strip pipeline must produce / preserve PSSH such that any standards-compliant
ISOBMFF parser can locate the box and extract its `Data[]` payload.

### Must-have

1. **In-moov PSSH placement**: pssh inserted as the **last** child of
   `moov`, after every `trak`. Same bytes as today; only the insertion
   offset changes. (See "Implications for this task" correction above —
   the post-`mvhd` slot proposed originally breaks libav side-data
   hydration because no streams are registered at parse time.)
2. **Top-level PSSH sibling**: a second copy of the same pssh box bytes
   inserted at the file root, between `ftyp` (or `styp` for fragments) and
   `moov`. Allowed by ISO/IEC 23001-7 §8.1.1.
3. **Delivery preserves PSSH**: `GET /media/:cid/init` MUST return a body
   whose `moov` contains a pssh child and/or whose root contains a pssh
   sibling, with bytes byte-identical to the on-disk packaged init. Two
   acceptable implementations:
   - **Option A (recommended, ship first)**: keep `stripInitViaWASM()` as
     default, then re-inject the pssh box into the cleaned output before
     sending. One call to the existing `buildBinaryPSSHBox()` on the
     cached `EncryptResult`. Player behaviour unchanged.
   - **Option B (follow-up)**: split `strip_init` into `strip_for_mse`
     (current default) and `keep_protection` (preserves pssh + sinf + tenc
     + `encv`/`enca` sample entries). Default unchanged; `keep_protection`
     selected by `?clear=0` query param (or equivalent) for CENC-aware
     clients.
4. **Byte-equality across all PSSH locations**: the bytes appearing in
   (a) on-disk init `moov`, (b) on-disk init root, (c) delivered init
   `moov`, (d) delivered init root (if Phase A re-inject targets root),
   and (e) MPD `<cenc:pssh>` (per sibling task) MUST be byte-identical.
   `buildBinaryPSSHBox()` is the single source of truth.

### Opportunistic

5. **Conformance test gate** (see Testing Strategy below).
6. **Mirror placement in the Rust path**: `crates/cenc-encrypt/src/cenc.rs` /
   `mp4box.rs` whichever module owns the `transform_init` WASM mode — align
   with the TS injector so the WASM-driven path also lands pssh after `mvhd`.
   `crates/cenc-encrypt/src/pssh.rs::build_pssh()` itself needs no change.

### Deferred

- `tenc` preservation under `keep_protection` mode (Phase B) — defer until
  a CENC-aware client exists or libav-side sample decryption is needed.

## Implementation Plan

### Phase 1 — Encryption side: PSSH placement (no behavioural change for current player)

- [x] Rewrite `injectPSSHBox()` in `pc2-node/src/services/media/dashPackager.ts`:
  - Walk moov children to find `mvhd`'s end offset.
  - Splice pssh at `moov_end` (after every `trak`).
  - Cascade size update on `moov` only (pssh has no other parent).
  - Keep existing behaviour as fallback if `mvhd` is missing (defensive).
- [x] ~~Add a second pssh at file root between `ftyp`/`styp` and `moov`.~~
      **Reverted 2026-05-18.** Chromium MSE rejects unexpected top-level boxes
      (`CHUNK_DEMUXER_ERROR_APPEND_FAILED: Invalid top-level ISO BMFF box type pssh`).
      Bento4 doesn't emit a root-level pssh either. Single in-moov pssh is the
      final placement.
- [x] Pssh-box single-source-of-truth helper — landed as
      `splicePSSHIntoInit(initData, psshBox)` + `extractFirstPSSHBox(initData)`
      in `dashPackager.ts`; reused by the encryption side and the
      `/api/media/segment` delivery side.
- [x] Mirror in the Rust `cenc-encrypt` `transform_init` mode — superseded by
      the **multi-trak transform** fix: `process_transform_init` now iterates
      every trak in moov and wraps each sample entry in `sinf/schm/tenc`.
      Pssh emission via the Rust path is unused by the TS caller (which uses
      `splicePSSHIntoInit` after `split_init`), but the in-moov-only placement
      is mirrored there for consistency.

### Phase 2 — Delivery side: stop destroying PSSH (Option A first)

- [x] `/api/media/segment` init path — landed at
      [`media.ts:634-657`](../../pc2-node/src/api/media.ts#L634-L657): captures
      the raw init's pssh bytes via `extractFirstPSSHBox` BEFORE
      `stripInitViaWASM()`, then re-splices into the cleaned + split init via
      `splicePSSHIntoInit`. Per-track init only (no root sibling).
- [x] Pssh source — sourced from the raw IPFS init bytes themselves, not a
      session cache. Cheaper, inherently byte-identical to what was packaged.
- [x] `strip.rs` top-level walk — `cenc-decrypt::strip.rs` already scanned
      both top-level + inside-moov for pssh (lines 96-125). No change needed
      after dropping root pssh emission.
- [x] ~~Option B `keep_protection` mode~~ — **Deferred / not needed for
      libav playback.** Client-side libav decryption is satisfied by Option A
      (raw IPFS init + Lit-recovered CEK + libav CENC pipeline). A
      `keep_protection` delivery mode would only matter if we shipped a
      browser EME CDM, which is out of scope. Reopen this if/when a third-party
      EME-capable consumer appears.

### Phase 3 — Conformance test gate

- [x] `pc2-node/tests/media/pssh-discoverability.test.ts` — 4 synthetic
      placement assertions: in-moov pssh as last moov child (no top-level
      sibling, MSE-safe), `extractFirstPSSHBox` round-trips byte-identically,
      returns null when pssh absent, fallback when moov missing.
- [x] `pc2-node/tests/media/pssh-fixture.test.ts` — real packaged-init
      conformance: vendored `tests/media/fixtures/video-init-post-fix.mp4`
      asserts encv + sinf + frma + schm + schi + tenc structure + pssh box
      layout (Elacity systemId, v1, KID_count=1) + JSON Data[] schema (v3.0
      protocolVersion + cross-track KID equivalence). Audio fixture pending
      a post-multi-trak-fix CID. Replaces the original
      `pssh-delivery.test.ts` plan: the C harness verifies live delivery
      end-to-end and is broader.
- [x] Add a `tools/scripts/verify-pssh-libav.sh` smoke script that runs
      `ffprobe -show_data` against a live mint and prints a pass/fail
      line, so operators can re-check on the fleet without rebuilding.
- [x] Add a **C harness** `tools/verify-pssh-libav/verify-pssh.c` that
      links against libavformat / libavcodec and replicates the exact
      consumer call path verbatim:
      ```c
      AVFormatContext *ctx = NULL;
      avformat_open_input(&ctx, argv[1], NULL, NULL);
      avformat_find_stream_info(ctx, NULL);
      AVEncryptionInitInfo *info = parser_extract_encryption_init_info(ctx);
      assert(info != NULL);
      assert(memcmp(info->system_id, ELACITY_SYSTEM_ID, 16) == 0);
      assert(info->num_key_ids == 1);
      assert(info->data_size > 0);
      fwrite(info->data, 1, info->data_size, stdout); // JSON payload
      av_encryption_init_info_free(info);
      ```
      Ship with a minimal Makefile (`pkg-config --cflags --libs libavformat
      libavcodec libavutil`). This is the load-bearing test — if this
      binary extracts a non-NULL `AVEncryptionInitInfo*` with the right
      system ID and our v3.0 JSON in `data`, the user's player works.
      CI runs it against both on-disk packaged init and live `/init`
      response.

### Phase 4 — Player coordination

- [x] **No change required for the current elacity-player** under Option A.
      The delivered init is byte-equivalent to today plus an informational
      pssh box; MSE ignores it.
- [x] ~~Option B follow-up ticket~~ — superseded. Option B not needed for
      libav-based playback (Option A is sufficient). Browser-EME consumer
      path remains out of scope for this task; revisit if a CDM ever ships.
- [x] Smoke-test the current bundled player
      (`pc2-node/data/test-apps/elacity-player`) against a Phase-1+Phase-2A
      mint and confirm playback is bit-for-bit equivalent (audio + video
      start, no MSE errors).

### Phase 5 — Docs

- [x] Update `docs/core/CHIPOTLE_V3_PROTOCOL.md` §14: replace the current
      short "Out of Scope" TODO list with a "Tracked in
      MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE" pointer and trim the
      bullet list down to the items still genuinely out of scope (EME
      sample decryption, system-ID registration if we ever want one).
- [x] Cross-link from `MEDIA-2026-04-28-DASH-MPD-COMPLIANCE` "Notes" so
      the two tasks reference each other.

## Acceptance Criteria

1. `npm run build` → no TypeScript / Rust errors.
2. `npm test` → new pssh-discoverability and pssh-delivery tests pass; no
   regression in existing media tests.
3. **PSSH byte-equality assertion** (hard requirement): in-moov pssh ===
   root pssh === delivered-init in-moov pssh === delivered-init root pssh
   === base64-decoded `<cenc:pssh>` in MPD (when sibling task is merged).
   All five locations carry the exact same bytes.
4. **libav C-harness extraction** (hard requirement, blocks ship — this
   is the actual downstream consumer's call path):
   `tools/verify-pssh-libav/verify-pssh init.mp4` returns exit 0 with:
   - `av_packet_side_data_get(codecpar->coded_side_data,
     codecpar->nb_coded_side_data, AV_PKT_DATA_ENCRYPTION_INIT_INFO)`
     returns a non-NULL `AVPacketSideData*` on at least one stream.
   - `av_encryption_init_info_get_side_data()` returns a non-NULL
     `AVEncryptionInitInfo*`.
   - `info->system_id` matches `bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe`.
   - `info->num_key_ids == 1` and `info->key_ids[0]` matches the
     packaging-time KID byte-for-byte.
   - `info->data` decodes as UTF-8 and parses as the v3.0
     protection-data JSON schema (`protocolVersion: "3.0"`, the
     expected `protectionType`, populated `data.actionIpfsId`,
     `data.kid`, `data.ciphertext`, `data.dataToEncryptHash`).
   Must pass against **both** the on-disk packaged `init.mp4` AND the
   live `GET /media/:cid/init` response body.
5. **External tool sanity checks** (informational, do not block ship
   but must be captured in the PR description):
   - `ffprobe -show_data -show_entries stream_side_data_list -i init.mp4`
     reports an encryption side-data entry.
   - `MP4Box -info init.mp4` lists pssh at the expected positions (one
     in moov at end-of-moov, one at file root).
6. One full live mint → play cycle on the current elacity-player passes
   end-to-end with no behavioural change vs today.
7. Git diff touches only:
   - `pc2-node/src/services/media/dashPackager.ts` (placement + helper)
   - `pc2-node/src/api/media.ts` (re-injection on `/init`)
   - `pc2-node/crates/cenc-encrypt/src/{cenc,mp4box}.rs` (mirror placement
     if the Rust path owns init injection)
   - `pc2-node/crates/cenc-decrypt/src/strip.rs` (top-level walk)
   - New tests under `pc2-node/tests/media/`
   - `tools/scripts/verify-pssh-libav.sh`
   - `docs/core/CHIPOTLE_V3_PROTOCOL.md` §14
   - `.cursor/tasks/MEDIA-2026-04-28-DASH-MPD-COMPLIANCE/MEDIA-2026-04-28-DASH-MPD-COMPLIANCE.md` (cross-link only)

## Files Modified (planned)

| File | Change |
|---|---|
| `pc2-node/src/services/media/dashPackager.ts` | Keep in-moov pssh at end-of-moov (after every trak — required for libav per-stream side-data hydration); add root-level pssh sibling; factor placement into `splicePSSHIntoInit()` helper reused by encryption and delivery sides. |
| `pc2-node/src/api/media.ts` | Re-inject pssh into the cleaned init returned by `stripInitViaWASM()` before responding to `/init`. |
| `pc2-node/crates/cenc-encrypt/src/cenc.rs` (and/or `mp4box.rs`) | Mirror placement change in the Rust `transform_init` path if it owns init injection. `pssh.rs::build_pssh()` itself unchanged. |
| `pc2-node/crates/cenc-decrypt/src/strip.rs` | Extend strip walk to top-level boxes so the new root pssh sibling is removed under existing `strip_init` mode (then re-injected by the delivery layer in Option A). |
| `pc2-node/crates/cenc-decrypt/src/lib.rs` | (Option B, deferred) add `keep_protection` mode branch. |
| `docs/core/CHIPOTLE_V3_PROTOCOL.md` | §14 — replace TODO list with pointer to this task; trim to items still genuinely out of scope. |
| `.cursor/tasks/MEDIA-2026-04-28-DASH-MPD-COMPLIANCE/MEDIA-2026-04-28-DASH-MPD-COMPLIANCE.md` | Cross-link in Notes. |

## Files Created

| File | Purpose |
|---|---|
| `pc2-node/tests/media/pssh-discoverability.test.ts` | Asserts pssh present at both positions in on-disk init, byte-equal, and extractable. |
| `pc2-node/tests/media/pssh-delivery.test.ts` | Asserts `GET /init` response preserves pssh byte-identical to on-disk init. |
| `tools/scripts/verify-pssh-libav.sh` | Operator smoke script: runs `ffprobe -show_data` against a live mint and reports pass/fail. |
| `tools/verify-pssh-libav/verify-pssh.c` | C harness linking libavformat/libavcodec/libavutil, replicates the downstream consumer's `av_packet_side_data_get` + `av_encryption_init_info_get_side_data` path. **The load-bearing acceptance test.** |
| `tools/verify-pssh-libav/Makefile` | Minimal `pkg-config`-driven build for the C harness. |
| `tools/verify-pssh-libav/README.md` | How to run locally and what a passing run looks like. |
| `.cursor/tasks/MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE/diagnostics/before.txt` | Baseline `ffprobe` + `MP4Box -diso` output captured before any code change — proves the bug exists. |
| `.cursor/tasks/MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE/diagnostics/after.txt` | Same commands re-run after Phase 1+2 — proves the bug is fixed. |

## Testing Strategy

- **Unit (new tests)**: as listed under Phase 3 above.
- **External tool gate**: CI must run `ffprobe -show_data` (or in-process
  box scanner) on the packager output AND on a live `/init` response. Both
  must reveal the Elacity system ID. This is the load-bearing assertion
  that the libav use-case Irzhy raised is closed.
- **In-house player regression**: full mint → purchase → play cycle on the
  current elacity-player (`pc2-node/data/test-apps/elacity-player`). Must
  be bit-for-bit equivalent in audio/video output to pre-change.
- **mp4dash parity check**: run `mp4dash --pssh bf2c86c1-…:@pssh.json`
  on the same input fixture and diff the resulting init.mp4 box tree
  against the pc2-node packager output. Box positions and pssh bytes
  should match (allow differences in unrelated boxes like `mvex`/track
  defaults).
- **MPD round-trip** (once sibling task lands): assert MPD `<cenc:pssh>`
  base64 decodes to bytes equal to the on-disk pssh.

## Out of scope (explicitly)

- Changing the v3.0 protection-data JSON shape or any field within it.
- Changing the Elacity system ID, `actionIpfsId`, or any Lit / Chipotle
  integration detail.
- Client-side EME / Widevine / PlayReady sample decryption. CEK recovery
  remains server-side via the ECDH envelope path.
- MPD `<ContentProtection>` emission (tracked in sibling task
  `MEDIA-2026-04-28-DASH-MPD-COMPLIANCE`).
- `keep_protection` delivery mode (Option B) — deferred to a follow-up
  commit; ships only after Option A is stable in production.
- Player-source changes in the `media-player` repo. Option A requires
  none. Option B follow-up tracked there, not here.
- Multi-bitrate ladder or AV1 codec-string work (separate tasks).

## Risks flagged

1. **`stripInitViaWASM()` may rely on byte offsets that shift when pssh
   moves position.** Re-read the Rust `strip.rs` walk carefully; it
   should be 4cc-driven and not offset-sensitive, but verify. Any offset
   table (none expected) will need patching.
2. **Init segments produced before this fix remain unreadable by libav**
   on IPFS — they're immutable. Acceptable: this is a forward-only fix.
   Document in the v1.3.x release notes that pre-fix mints stay
   non-extractable for third-party tooling (in-house player still works).
3. **`ffprobe` is not guaranteed in CI environments.** Provide a JS/Rust
   in-process fallback parser for the assertion so the conformance test
   gate is portable. Operators still get the `ffprobe`-based smoke
   script for fleet checks.
4. **Two pssh boxes (root + moov) is unusual.** Some pedantic parsers
   may warn about duplicates. Belt-and-braces is worth it for
   discoverability across the widest range of tools; downgrade to
   single-location (moov end) if a real-world parser flags it.
   Track via the conformance test matrix.
5. **Session-side pssh caching cost.** A few hundred bytes per active
   media session in `session.psshBoxBytes`. Negligible; flagged for
   completeness.

## Scheduling / release target

- **Not in v1.2.x** — feature scope locked.
- **Target: v1.3.x** — ship alongside or shortly after the sibling MPD
  task. Can land earlier if a third-party player partnership materialises
  and PSSH discovery becomes load-bearing.

## Notes

- Custom system ID stays. `bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe` is
  registered as the V3 Elacity dDRM ID in `CHIPOTLE_V3_PROTOCOL.md` §6
  and is the right value. ISO/IEC 23001-7 allows arbitrary UUIDs.
- JSON-in-PSSH payload also stays. CENC's `Data[]` is
  DRM-system-specific by definition; the shape is documented in
  `CHIPOTLE_V3_PROTOCOL.md` §6 and is the contract with the Lit Action.
- The work in this task is **purely about box placement and delivery
  preservation**. No cryptographic, key-handling, or authentication
  surface is touched.
- After this ships, libav-based discovery tools (`ffprobe`, `MP4Box`,
  `mp4box.js`) can extract the Elacity PSSH and read the JSON payload
  containing `actionIpfsId`, `litBackend`, `kid`, `ciphertext`, etc.
  Recovering the CEK from that payload still requires hitting the
  Chipotle proxy and validating session bundles — i.e. nothing about
  this task weakens the access-control posture; it only opens the
  metadata surface that was always meant to be public.
