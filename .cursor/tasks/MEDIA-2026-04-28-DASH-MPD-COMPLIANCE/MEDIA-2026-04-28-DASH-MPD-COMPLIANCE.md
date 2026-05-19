# Task: DASH MPD standards compliance — close gaps flagged by Irzhy

**Task ID**: MEDIA-2026-04-28-DASH-MPD-COMPLIANCE
**Created**: 2026-04-28
**Status**: Agreed (2026-04-28, narrowed to Irzhy's two-point triage after forensic scan)
**Priority**: Medium (polish — non-blocking for v1.2; targets v1.2.1)

## Description

Bring `pc2-node/src/services/media/mpdGenerator.ts` output into alignment
with the DASH ISO/IEC 23009-1 standard and DASH-IF interop guidelines.
The current output plays fine on our in-house PC2 Media Runtime player
(which is lenient by design) but is technically non-compliant on six
points and would fail or misbehave on third-party players (dash.js,
Shaka, ExoPlayer) and DASH-IF validators.

## Background

Irzhy flagged the gap during his 2026-04-28 review:

> "my concerns is more about the DASH standard compliance, and the
> support of the player on the platform"

He provided two reference MPDs:

- Our current `mpdGenerator.ts` output:
  `ipfs://bafybeibbfxiructbtz6njxwa6ontrxoa3izqibevhziu5usgaxic2n7umi/stream.mpd`
- Bento4 `mp4-dash.py` output (reference):
  `ipfs://QmdrFsvSz8iNDzhDpHYqYqfTJcLYmVyfWAQyNYd5u5vWTL/stream.mpd`

Side-by-side diff of the two MPDs surfaced exactly six compliance gaps,
three critical (spec violations) and three interop-level. None affect
our own player; all would affect any external player.

This task is the follow-up work to close those gaps cleanly in a single
focused commit, after Wave 8 Test 4 resumes.

## Irzhy's triage (2026-04-28 follow-up)

After the initial diff was shared, Irzhy narrowed the must-have list:

> "the profile should not really mind, both should be ok
>
> I think the main points should address are:
> - ensure to have ContentProtection tag
> - make sure to embed the pssh information with the media directly
>   (bento4 basically inject such an information within the init.mp4
>   as header of the media)"

Reading his second bullet precisely: the canonical DASH-CENC pattern is
that the **same PSSH box bytes** live in *two* places — (a) inside the
init segment's `moov` as a `pssh` child box, and (b) inside the MPD's
`<ContentProtection>` element as a base64-encoded `<cenc:pssh>` child.
External players discover encryption from either source and must get
byte-identical metadata from both.

**Good news**: we already do (a) correctly. See "Current state verified"
below. The work reduces to emitting (b) in the MPD with bytes that match
(a) exactly.

Scope therefore narrows to two load-bearing requirements (spelled out in
full in the Requirements section):

1. Emit `<ContentProtection>` in the MPD with `xmlns:cenc` at the `<MPD>`
   root. Two elements per AdaptationSet: the generic CENC marker with
   `cenc:default_KID`, and our Elacity custom element carrying the
   base64-encoded PSSH box.
2. The base64 inside the custom `<ContentProtection>` **must equal the
   exact bytes** emitted by `buildBinaryPSSHBox()` into `moov`. This is
   asserted as a hard acceptance criterion below.

## Current state verified (forensic scan of live IPFS content)

Pulled both `init.mp4` files from the CIDs Irzhy shared
(`bafybeibbfxir…` ours / `QmdrFsvS…` Bento4 reference) and dumped the
MP4 box structure. Result:

- **Our init.mp4**: `moov` contains a `pssh` box (size=607, version=1,
  systemId `bf8ef85d-2c54-475d-8c1e-e27db60332a2`, kid count=1,
  data payload is the full `cenc:web3-drm-v1` JSON with authority,
  actionIpfsId, litBackend=chipotle, ciphertext, hash, kid).
- **Bento4 reference init.mp4**: `moov` contains three `pssh` boxes —
  a Widevine marker (`1077efec-…`, empty data) plus two legacy Elacity
  system IDs (`b7855546-…` / `a17e506d-…`) carrying older V2-era
  authority `0x8fe6bf98…` and non-Chipotle action CIDs.

Conclusions from the scan:

- **Point #2 already satisfied**: `injectPSSHBox()` in `dashPackager.ts`
  places the full web3-drm-v1 PSSH box inside `moov`, not as a sibling.
  No change needed to the init-segment side. It stays untouched.
- **We deliberately do NOT adopt Bento4's reference system IDs** — they
  belong to older V2-era content. Our current ID `bf8ef85d-…` (V3) is
  the right one. This is a clarification for anyone tempted to "match
  Bento4 exactly".
- **We deliberately do NOT emit a Widevine marker PSSH** — we don't use
  the Widevine CDM; our stack decrypts via `cenc-decrypt.wasm`. Adding
  a Widevine placeholder would mislead external EME players.

## The gaps (revised priority after Irzhy's triage)

### 🔴 Must-have — close Irzhy's two concerns

1. **No MPD-level `<ContentProtection>` element.** Required to satisfy
   Irzhy's point #1 and the DASH-CENC convention. External players
   (dash.js, Shaka, ExoPlayer) can't discover encryption without it.
2. **No `xmlns:cenc` namespace declaration** on `<MPD>`. Prereq for the
   `cenc:default_KID` attribute and `<cenc:pssh>` child element used in
   #1.
3. **Byte-equality guarantee** between the PSSH box embedded in `moov`
   (authoritative source) and the base64 `<cenc:pssh>` inside the
   Elacity custom `<ContentProtection>`. This is what Irzhy's second
   bullet actually asks for.

### 🟡 Opportunistic (cheap to include while we're here)

4. **No `<AudioChannelConfiguration>` on audio Representations.**
   DASH-IF audio interop requirement. `TrackInfo.audioChannels` is
   already available from `mp4split.ts`, so emitting it is two lines.
5. **Truncated AV1 codec string** (`av01.0.01M.08` vs full
   `av01.0.00M.10.0.110.01.01.01.0`). Short form is sometimes rejected
   by strict `MSE.isTypeSupported` checks. Full form is universally
   accepted. Need to verify which module truncates (likely
   `mp4split.ts`) and stop doing so.
6. **No `segmentAlignment="true" startWithSAP="1"`** on AdaptationSet.
   Two attributes that truthfully describe our existing output.

### 🟢 Skipped (per Irzhy's triage)

- **Profile string** (`isoff-on-demand:2011` → `isoff-live:2011`).
  Irzhy: *"the profile should not really mind, both should be ok"*.
  Technically still a manifest lie, but not worth the ink today.
  Noted for a future janitorial pass.
- Descriptive Representation IDs, `$RepresentationID$` templating,
  `scanType`, `frameRate` — all nice-to-have, none targeted.

## Why this is safe for v1.2

**TL;DR**: Every planned change is either (a) additive (adds new
elements/attributes that our code ignores) or (b) corrective (fixes a
value that nothing in our code reads today). No existing behaviour is
removed or altered. The PSSH-in-moov chain, CEK chain, Wave 8 kid-binding,
and Lit Action CIDs are entirely untouched.

Full safety audit per change, post-forensic-scan:

| # | Change | Read by our code? | Consequence if shipped |
|---|---|---|---|
| 1 | Add `<ContentProtection>` elements (generic CENC + Elacity custom) per AdaptationSet | **Indirectly yes — it helps.** `pc2-node/src/api/media.ts:282-284` has an existing regex fallback `mpdText.match(/default_KID="([^"]+)"/)` that extracts `cenc:default_KID` from the MPD when absent from PSSH JSON. Adding the attribute **activates a currently-dead fallback**. | Safe. Additive improvement. |
| 2 | Add `xmlns:cenc="urn:mpeg:cenc:2013"` on `<MPD>` | No references. Grep of `pc2-node/src/` for `xmlns:cenc` returns zero runtime consumers. | Safe. Pure namespace declaration. |
| 3 | Emit base64 of `buildBinaryPSSHBox()` output as `<cenc:pssh>` child of the Elacity `<ContentProtection>` | No (nothing in our player reads MPD ContentProtection). The bytes themselves are already correct — same function produces the moov child today. | Safe. Purely additive. Guarantees byte-equality with moov. |
| 4 | Add `<AudioChannelConfiguration>` to audio Representations | No references (grep confirmed). `TrackInfo.audioChannels` is already populated by `mp4split.ts`. | Safe. Purely additive. |
| 5 | Full AV1 codec string from FFprobe | **Yes.** `mpdParser.ts:64` reads `codecs` into `Track.codec`; the player forwards it to `MediaSource.isTypeSupported()`. | Safe — strictly safer. Full RFC 6381 form is universally accepted by MSE implementations; short form is sometimes rejected by strict implementations. |
| 6 | Add `segmentAlignment="true" startWithSAP="1"` | No references (grep confirmed). | Safe. Attributes already describe reality — segments ARE aligned and start with SAP=1; we just weren't advertising it. |

**Additional safety guarantees, re-affirmed with evidence:**

- **No PSSH changes.** `injectPSSHBox()`, `buildPSSHJson()`,
  `buildBinaryPSSHBox()` (all in `dashPackager.ts`) are untouched. The
  binary PSSH box inside `moov` remains the authoritative source of
  all Chipotle metadata (authority, action CID, kid, ciphertext, hash).
  MPD `<cenc:pssh>` is a secondary, byte-identical copy of that same
  box. **Forensically verified**: the current moov-PSSH in our live
  content (`bafybeibbfxir…`) is structurally correct (size=607,
  version=1, systemId `bf8ef85d-…`, kid present, V3 authority, Chipotle
  action CID). Nothing about that changes.
- **No CEK / encryption changes.** `cenc-encrypt.wasm` invocations,
  `encryptMediaCEK()`, and Chipotle integration are all untouched.
- **No Wave 8 interaction.** The C-02 kid-binding check runs inside the
  Lit Action, comparing `kid` in the delegation payload to
  `first16(sha256(cekBase64))`. That chain lives in PSSH-JSON + Lit
  Action, not MPD. Zero surface overlap.
- **No Lit Action CID rotation.** Both pinned CIDs
  (non-media `QmX5Jxc…r5uk`, media `QmSHMSx…6EAb`) stay.
- **No `cenc-decrypt.wasm` / `strip.rs` changes.** Strip still removes
  PSSH children from `moov` before MSE ingestion, as it does today.
  The MPD additions are never seen by MSE — players read the MPD, MSE
  only ever sees init+media segments.
- **No `mpdParser.ts` changes.** Our parser is lenient by design
  (regex-based, ignores unknown elements/attributes). Adding
  `<ContentProtection>` / `<AudioChannelConfiguration>` /
  `xmlns:cenc` / `segmentAlignment` is invisible to it.
- **Old minted content on IPFS is not touched.** Already-pinned MPDs
  under their existing CIDs stay bit-for-bit identical (IPFS is
  immutable). Only new mints after the fix ships will use the new format.
- **Forward + backward compatibility.** New MPDs play on the current
  player (parser ignores the additions). Old MPDs will still play on
  any future player shape (nothing is removed).
- **Grep evidence**: total references to `ContentProtection`, `cenc:pssh`,
  `xmlns:cenc`, `default_KID` across `pc2-node/src/` after this task lands
  are: (a) the generator emitting them, and (b) the existing regex
  fallback in `media.ts:282` that becomes active. That's the complete
  coupling surface.

**One flagged residual risk (low):** If any unit test or CI runner does a
byte-for-byte assertion on the generated MPD string (golden-file test),
it will need the golden file regenerated. Implementation includes a
pre-change grep for this. No production path asserts on exact XML bytes.

## Requirements

`generateMPD()` in `pc2-node/src/services/media/mpdGenerator.ts` must
emit XML that:

### Must-have (closes Irzhy's two concerns)

1. Declares `xmlns:cenc="urn:mpeg:cenc:2013"` on the `<MPD>` root.
2. For every `AdaptationSet`, emits two `<ContentProtection>` children
   before the first `<SegmentTemplate>`:
   - Generic CENC marker:
     `<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc" cenc:default_KID="<UUID-form of contractKid>"/>`
   - Elacity custom carrying the authoritative PSSH:
     `<ContentProtection schemeIdUri="urn:uuid:bf8ef85d-2c54-475d-8c1e-e27db60332a2" value="cenc:web3-drm-v1"><cenc:pssh>${base64 of buildBinaryPSSHBox output}</cenc:pssh></ContentProtection>`
3. **Byte-equality guarantee**: the base64 inside `<cenc:pssh>` MUST
   decode to the exact same byte sequence as the `pssh` box embedded in
   the init segment's `moov` by `injectPSSHBox()`. Both paths take their
   bytes from a single call to `buildBinaryPSSHBox()`; the MPD path just
   base64-encodes them. Drift between the two would defeat the purpose.

### Opportunistic (same commit, cheap to include)

4. Emits `segmentAlignment="true" startWithSAP="1"` on every
   `AdaptationSet`.
5. For audio Representations, emits a child
   `<AudioChannelConfiguration schemeIdUri="urn:mpeg:mpegB:cicp:ChannelConfiguration" value="<channels>"/>`.
   The channel count is already available via `mp4split.ts`'s
   `TrackInfo.audioChannels`.
6. Uses the full AV1 codec string from FFprobe where available. If
   `mp4split.ts` currently truncates, also fix the truncation so the
   full string flows through.

### Deferred (not this task)

- Profile string change (`isoff-on-demand:2011` → `isoff-live:2011`).
  Irzhy confirmed both are tolerated; out of scope.

### Function signature

`generateMPD()` signature extends to accept PSSH context. Caller
(`dashPackager.ts::packageDASH`) already has both the `contractKidHex`
and the binary PSSH box (it's built there via `buildBinaryPSSHBox()`);
all we need is to thread those through to `buildMPDTracks()` /
`generateMPD()`. Exact shape decided during implementation, but the
constraint is: **one and only one call site** produces `psshBoxBytes`,
and that same bytes object feeds both `moov` injection and MPD emission.
This guarantees #3 by construction.

## Implementation Plan

- [ ] Read `mp4split.ts` to confirm how/where AV1 codec truncation
      happens and extract the fix.
- [ ] Extend `MPDTrack` interface in `mpdGenerator.ts` to carry
      `contractKidHex` (hex) and `psshBoxBase64` (base64) so the
      generator can emit `cenc:default_KID` in UUID form and the custom
      `<cenc:pssh>` payload.
- [ ] Implement `hexKidToUuid(hex: string): string` helper — converts
      our 32-hex kid to `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` UUID
      form used by `cenc:default_KID`.
- [ ] Update `generateMPD()` to emit:
  - `xmlns:cenc` on `<MPD>` root.
  - `profiles="urn:mpeg:dash:profile:isoff-live:2011"`.
  - `<ContentProtection>` × 2 per AdaptationSet.
  - `segmentAlignment="true" startWithSAP="1"` on AdaptationSet.
  - `<AudioChannelConfiguration>` on audio Representations.
- [ ] Update `dashPackager.ts::packageDASH` to pass the PSSH base64
      payload and contract kid into the generator.
- [ ] Write a unit test
      `pc2-node/tests/media/mpdGenerator.compliance.test.ts`:
  - Produces an MPD from a known two-track fixture.
  - Asserts all seven compliance markers are present.
  - Asserts the MPD validates under a minimal inline DASH XSD check
    (or a regex sanity check covering the spec-critical elements).
- [ ] Run one live mint → play cycle on media (Wave 8 C-02 matrix Test 4,
      once Irzhy unblocks it) to confirm in-house player still works.
- [ ] **Stretch / optional**: verify externally via `dash.js` — if it
      plays the new MPD, we have concrete evidence third-party
      compatibility is closed.
- [ ] Update `docs/core/SESSION_HANDOVER.md` "Phase 2" note so the
      "MPD format mirrors Bento4" claim becomes accurate rather than
      aspirational.

## Acceptance Criteria

1. `npm run build` → no TypeScript errors.
2. `npm test` (unit) → new compliance test passes; no regressions in
   existing media tests.
3. **PSSH byte-equality assertion** (hard requirement): a unit test
   generates an MPD + init segment from the same fixture, base64-decodes
   the `<cenc:pssh>` child of the Elacity `<ContentProtection>`, parses
   the `pssh` box out of the init segment's `moov`, and asserts
   `Buffer.compare(mpdBytes, moovBytes) === 0`.
4. One live mint → play → CEK decrypt cycle on a fresh workspace
   passes end-to-end (same as our Wave 8 smoke matrix, Test 4).
5. External validation (optional, strongly recommended): loading the
   new MPD in a vanilla `dash.js` player results in playback (or at
   least a "needs CDM" prompt rather than a manifest parse error — the
   pre-fix version errors out before the player even requests any
   segments).
6. Git diff touches only:
   - `pc2-node/src/services/media/mpdGenerator.ts`
   - `pc2-node/src/services/media/dashPackager.ts` (pass-through only)
   - Possibly `pc2-node/src/services/media/mp4split.ts` (codec string
     truncation fix only, if needed)
   - New test file under `pc2-node/tests/`
   - `docs/core/SESSION_HANDOVER.md` (one-line correction)

## Files Modified (planned)

| File | Change |
|---|---|
| `pc2-node/src/services/media/mpdGenerator.ts` | Emit compliant MPD per the Requirements section. Add `hexKidToUuid()` helper. Extend `MPDTrack` interface with `contractKidHex` + `psshBoxBase64`. |
| `pc2-node/src/services/media/dashPackager.ts` | Pass `contractKidHex` + base64 PSSH into `buildMPDTracks()` → `generateMPD()`. No logic change beyond this pass-through. |
| `pc2-node/src/services/media/mp4split.ts` | Stop truncating AV1 codec string — forward the full RFC 6381 form from FFprobe. (Confirm during implementation whether this is actually happening here or in `encoder.ts`.) |
| `docs/core/SESSION_HANDOVER.md` | Correct the "Phase 2: MPD generator matches Bento4 output format" claim once implemented. |

## Files Created

| File | Purpose |
|---|---|
| `pc2-node/tests/media/mpdGenerator.compliance.test.ts` | Compliance regression test: asserts the seven must-have markers are present in generator output for a known fixture. |

## Testing Strategy

- **Unit (new test)**: generate an MPD from a fixed two-track (video
  av01 + audio mp4a.40.2) fixture, regex-assert:
  - `profiles="urn:mpeg:dash:profile:isoff-live:2011"`
  - `xmlns:cenc="urn:mpeg:cenc:2013"`
  - Two `<ContentProtection>` elements per AdaptationSet
  - `cenc:default_KID="<UUID form>"` on the first
  - `schemeIdUri="urn:uuid:bf8ef85d-2c54-475d-8c1e-e27db60332a2"` on the
    second, with a `<cenc:pssh>` child containing non-empty base64
  - `segmentAlignment="true" startWithSAP="1"` on every AdaptationSet
  - `<AudioChannelConfiguration>` on the audio Representation
  - Full AV1 codec string (minimum 5 dotted components)
- **In-house player regression**: full mint → purchase → play cycle on
  a known-good media fixture, using our PC2 Media Runtime. Expected
  behaviour: identical to today.
- **External player verification (optional)**: serve the new MPD to a
  stock `dash.js` build locally. Before the fix, dash.js fails on the
  profile string. After the fix, it should reach the segment-fetch
  phase (and then stop at the CDM step since we don't implement the
  standard Widevine/PlayReady CDM — that's expected and fine).

## Out of scope (explicitly)

- Changing the PSSH chain or kid derivation. The binary PSSH in `moov`
  remains authoritative.
- Changing the CEK pipeline, Chipotle integration, or Lit Action CIDs.
- Changing the in-house player (`mpdParser.ts`, `player.js`, etc.)
  beyond a regression test.
- Replacing `mp4fragment` or any further Bento4 decoupling.
- Multi-bitrate ladders (4K/1080p/720p variants) — descriptive IDs +
  `$RepresentationID$` templating are noted as "enables this later" but
  the actual ladder work is a separate task.
- Widevine / PlayReady CDM support. Irrelevant to our threat model;
  we decrypt in `cenc-decrypt.wasm`.

## Risks flagged

1. **Golden-file tests (if any)**: a regex search during implementation
   will catch any test that asserts on exact MPD XML bytes. Such tests
   will need their fixtures regenerated — annotated in the commit.
2. **Downstream consumers we don't own**: if someone on the marketplace
   team has already wired a third-party DASH player to our MPDs and
   worked around the gaps, our fix may require them to remove their
   workaround. Ask Irzhy whether anything downstream depends on the
   current (non-compliant) shape before shipping.
3. **AV1 codec full-form edge cases**: if FFprobe on a Jetson-class
   box returns a different full-form string than on x86_64, MSE's
   `isTypeSupported` behaviour may shift. We'll capture the exact
   FFprobe output string during the live test and add it to the test
   fixture so regressions are caught.

## Scheduling / release target

- **Not in v1.2.0** — v1.2 is already locked feature-scope-wise.
- **Target: v1.2.1** — ship alongside any other post-v1.2 polish.
- Can land earlier if Wave 8 Test 4 unblocks quickly and we want a
  clean third-party-player story in the launch update.

## Notes

- The change is purely a generator-side upgrade. No migration for
  existing minted content is required — historical MPDs on IPFS are
  immutable and the player handles both shapes.
- Irzhy requested to cc him on the implementation PR so he can
  sanity-check the `<ContentProtection>` shape against what his Lit
  Action ecosystem expects. Do that via the usual review channel.
- After this ships we should re-audit `docs/core/SESSION_HANDOVER.md`
  (Phase 2 section) and `docs/OPERATIONAL_SUMMARY_LIT_AND_RELATED.md`
  for any remaining "matches Bento4 output" claims that will then be
  accurate for the first time.
- **Agreement record (2026-04-28)**: task moved Proposed → Agreed after
  Irzhy's triage narrowed the must-haves to two items (quoted in full
  under "Irzhy's triage" above) and the forensic scan confirmed our
  moov-side PSSH injection is already correct. Implementation queued
  for v1.2.1 post-launch polish — does not block v1.2.0 tag.
- **Do NOT adopt Bento4 reference system IDs.** The reference content
  Irzhy shared carries legacy V2-era Elacity system IDs (`b7855546-…`
  and `a17e506d-…`) and a Widevine marker we intentionally don't emit.
  Our current V3 system ID (`bf8ef85d-2c54-475d-8c1e-e27db60332a2`) is
  authoritative and stays.
- **Sibling task (init-side + delivery-side counterpart)**:
  [`MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE`](../MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE/MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.md)
  landed the init-segment + delivery-side CENC compliance work (pssh
  placement, `tenc` per trak via multi-trak transform, per-track init
  split, AV1 subsample encryption, IV uniqueness, on-chain KID-as-contentId
  unification, libav C harness for verification). This MPD
  `<ContentProtection>` task is the manifest-layer counterpart — both
  combined give a player on-MPD AND on-init protection signalling. See
  [`docs/core/CENC_PACKAGING_COMPLIANCE.md`](../../docs/core/CENC_PACKAGING_COMPLIANCE.md)
  (post-mortem) and
  [`docs/core/MEDIA_DRM_PACKAGING.md`](../../docs/core/MEDIA_DRM_PACKAGING.md)
  (engineering reference).
