# Task: Non-Media Lit Action Migration — Universal Encrypt/Decrypt + Protection Data Alignment

**Task ID**: NONMEDIA-LIT-MIGRATION-2026-05  
**Created**: 2026-05-19  
**Status**: Pending  
**Priority**: P0 — Bug + Security — KID mismatch breaks all non-media decryption; CEK envelope integrity fields must travel end-to-end  
**Branch**: `feature/enhance-lit-chipotle`  
**Owner**: Irzhy  
**Related**:
- [`CHIPOTLE-V3-UNIVERSAL-ACTIONS`](../CHIPOTLE-V3-UNIVERSAL-ACTIONS/CHIPOTLE-V3-UNIVERSAL-ACTIONS.md) — predecessor, landed server-side primitives
- [`MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE`](../MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE/MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.md) — sibling, migrated media path

## TL;DR

**Blocking bug**: non-media `hasAccessByContentId` always returns false because
`content.json` stores `dataToEncryptHash` as the `kid`, while the on-chain mint
registers the real UUID-derived KID. Same root cause as the media KID fix in
`MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE`.

Beyond the bug: wiring three new fields (`signature`, `issuer`, `actionCid`)
through the full **publish → IPFS metadata → decrypt** cycle, and moving
`contentHash` / `contentHashAlgorithm` out of `protections[0]` onto `asset`
directly.

Five files. No schema migrations. No IPFS re-pins. Already-published assets
keep working via the size-based legacy passthrough (≤32 B = plaintext CEK)
and the `LEGACY_NON_MEDIA_ACTION_CIDS` allowlist.

## Background

### What the server already handles

- `POST /api/storage/lit/encrypt` → `universal-encrypt-chipotle.js` → returns
  `{litCiphertext, dataToEncryptHash, kid, iv, encryptedData, signature, issuer, actionCid}`.
- `recoverCEKViaEnvelope` calls `universal-decrypt-chipotle.js`, unwraps the
  ECDH envelope, accepts optional `signature`/`issuer` jsParams for integrity
  verification inside the TEE.
- Size-based passthrough: `dataBytes.length <= 32` → legacy plaintext CEK, no unwrap.

### KID mismatch bug (blocking — same as media MEDIA-2026-05-18 root cause)

The UUID-derived KID (generated alongside the CEK via `randomUUID().replace(/-/g, '')`)
is the **only valid KID**. It must be used everywhere in the encryption and encoding
process. All fallbacks to `dataToEncryptHash` are bugs and must be removed.

#### Bug 1 — `content.json` + token-type JSONs (`elacity-creator/app.js` line 4660)

```js
var kid = (isMediaFile && mediaEncodeResult)
  ? mediaEncodeResult.kid
  : (encryptResult.dataToEncryptHash || '');  // ← BUG: uses hash, not KID
```

For non-media, `kid` is set to `dataToEncryptHash` (the Lit composite hash
`SHA-256(cek ‖ kid ‖ authority)`). This value flows into:
- `buildContentJson({ kid })` → stored in IPFS `content.json`
- `buildTokenTypeJsons({ kid })` → stored in IPFS token metadata

At decrypt time `elacity-market` reads the `kid` back from this metadata and
sends it to the Lit Action as `jsParams.kid`. The Lit Action calls
`hasAccessByContentId(holder, normalizedKid)` — but the contract was minted
with `kidToContentId(encryptResult.kid)` (line 4887), so the identifiers never
match → `hasAccessByContentId` always returns false → access denied.

#### Bug 2 — capsule `.ddrm` KID (`elacity-creator/app.js` lines 5233–5234)

```js
// non-media branch:
var cleanHash = (encryptResult.dataToEncryptHash || '').replace(/^0x/, '');
capsuleKid = cleanHash ? '0x' + cleanHash.slice(0, 32).padEnd(32, '0') : '';
// ↑ BUG: derives capsule kid from hash, should use encryptResult.kid
```

#### Bug 3 — `buildTokenTypeJsons` silent fallback (lines 1470, 1484, 1498)

```js
kid: params.kid || params.dataToEncryptHash || '',
```

Present in all three token-type entries (AccessToken, RoyaltyShare, DistributionRight).
After Bug 1 is fixed, `params.kid` will always be the real KID. The
`|| params.dataToEncryptHash` fallback silently masks any future regression where `kid`
is accidentally empty — it must be removed so failures are loud rather than silent.

**Fix**: use `encryptResult.kid` (the real UUID-derived KID) wherever the media
path already uses `mediaEncodeResult.kid`; strip the `|| params.dataToEncryptHash`
fallbacks from `buildTokenTypeJsons`.

#### Bug 4 — `envelope.asset.kid` not set for non-media

For media assets, line 4617 sets `envelope.asset.kid = mediaEncodeResult.kid` on the
IPFS metadata envelope — placing the KID at the top level of `asset`, right alongside
the CID and other identity fields. This is **critical information** for the asset:
it is the on-chain contentId and the key used for access control.

For non-media, no `envelope.asset.kid` is set at all. The KID is only buried inside
`buildContentJson` and `buildTokenTypeJsons`, never surfaced in the main metadata JSON.

**Fix**: after the non-media encrypt block, set `envelope.asset.kid = encryptResult.kid`
(mirrors line 4617 for media).

### What is missing (non-blocking — fields not wired)

`signature`, `issuer`, and `actionCid` are returned by the server on encrypt
but are dropped at every subsequent step:

1. **elacity-creator** doesn't capture them into `encryptResult`.
2. The IPFS metadata envelope and the Puter FS capsule never store them.
3. **elacity-market** doesn't extract them when building the ddrm-viewer descriptor
   or the `/skills/install` POST body.
4. **ddrm-viewer** doesn't read or forward them to `/secure-view`.
5. The server HTTP handlers `/secure-view` and `/skills/install` don't accept
   them from the request body.

Additionally, `contentHash` / `contentHashAlgorithm` are written into
`protections[0]` — they describe the original pre-encryption content and belong
directly on `asset`.

### Architecture (target state)

```
[elacity-creator]
  POST /api/storage/lit/encrypt
  ← {litCiphertext, dataToEncryptHash, kid, iv, signature, issuer, actionCid, encryptedData}
  encryptResult captures all fields
  ↓
  IPFS metadata JSON → protections[0]: {litCiphertext, iv, litBackend, dataToEncryptHash,
                                         actionCid, signature, issuer, algorithm, ...}
                      asset:          {contentHash, contentHashAlgorithm, kid, ...}
  capsule JSON (Puter FS): same fields

[elacity-market]
  descriptor ← IPFS metadata (all fields including signature, issuer, actionCid)
  launch ddrm-viewer args: {litCiphertext, dataToEncryptHash, encryptedDataCid, iv, kid,
                             signature, issuer, actionCid, authority, ...}

[ddrm-viewer]
  assetParams: {signature, issuer, ...}
  buildBody() → POST /api/storage/lit/secure-view
    {litCiphertext, dataToEncryptHash, kid, iv, encryptedDataCid,
     signature, issuer, actionCid,
     delegation, delegationSig, request, requestSig}

[pc2-node /lit/secure-view]
  → recoverCEKAndFetchData → recoverCEKViaEnvelope
  → universal-decrypt-chipotle.js (TEE)
      optional integrity check: SHA-256(cek ‖ kid ‖ authority) === dataToEncryptHash
      (only runs when signature + issuer present; old assets skip cleanly)
  ← ECDH-enveloped CEK → unwrapECDHEnvelope → plaintext CEK
  → WASM AES-GCM decrypt → rendered bytes
```

## Gaps

### Server HTTP layer

| File | Location | Gap | Fix |
|------|----------|-----|-----|
| `pc2-node/src/api/storage.ts` | ~line 3069 | `/lit/secure-view` body destructure missing `signature`, `issuer`, `actionCid` | Add to destructure; thread into `DecryptParams` |
| `pc2-node/src/api/gateway.ts` | ~line 1008 | `/skills/install` body destructure missing `signature`, `issuer`, `actionCid` | Add to destructure; thread into `DecryptParams` |

### Publish side

| File | Location | Gap | Fix |
|------|----------|-----|-----|
| `pc2-node/data/test-apps/elacity-creator/app.js` | line 4660 | **🔴 KID bug #1**: non-media `kid` set to `dataToEncryptHash` instead of real KID | Change to `encryptResult.kid` (mirrors media `mediaEncodeResult.kid` branch) |
| `pc2-node/data/test-apps/elacity-creator/app.js` | line 5233 | **🔴 KID bug #2**: capsule `kid` derived from hash slice | Change to `kidToContentId(encryptResult.kid)` (mirrors media branch at line 5231) |
| `pc2-node/data/test-apps/elacity-creator/app.js` | lines 1470, 1484, 1498 | **🔴 KID bug #3**: `buildTokenTypeJsons` has `params.dataToEncryptHash` as fallback, silently masking regressions | Remove `\|\| params.dataToEncryptHash` from all three token-type entries |
| `pc2-node/data/test-apps/elacity-creator/app.js` | after line 4624 | **🔴 KID bug #4**: `envelope.asset.kid` never set for non-media — KID absent from IPFS metadata `asset` object | Add `envelope.asset.kid = encryptResult.kid` (mirrors line 4617 for media) |
| `pc2-node/data/test-apps/elacity-creator/app.js` | ~line 4184 | `encryptResult` doesn't capture `litData.signature`, `litData.issuer` | Add both fields |
| `pc2-node/data/test-apps/elacity-creator/app.js` | ~line 4589 | IPFS metadata `protections[0]` missing `signature`, `issuer` | Add both fields |
| `pc2-node/data/test-apps/elacity-creator/app.js` | ~line 5284 | Puter FS capsule JSON missing `signature`, `issuer` | Add both fields |
| `pc2-node/data/test-apps/elacity-creator/app.js` | ~line 4627 | `contentHash`/`contentHashAlgorithm` written into `protections[0]` | Move to `envelope.asset` directly; drop `protections[0]` existence guard |

### Read / decrypt side

| File | Location | Gap | Fix |
|------|----------|-----|-----|
| `pc2-node/data/test-apps/elacity-market/app.js` | ~line 4029 | Non-media descriptor missing `signature`, `issuer` | `resolveAssetProtectionField(asset, 'signature', '')` + `issuer` |
| `pc2-node/data/test-apps/elacity-market/app.js` | ~line 4499 | ddrm-viewer launch args don't forward `signature`, `issuer` | Pass alongside `actionCid` |
| `pc2-node/data/test-apps/elacity-market/app.js` | ~line 1627 | Skills install extraction misses `signature`, `issuer`, `actionCid` | Extract via `resolveAssetProtectionField` |
| `pc2-node/data/test-apps/elacity-market/app.js` | ~line 1649 | `/skills/install` POST body missing them | Add to POST body |
| `pc2-node/data/test-apps/ddrm-viewer/viewer.js` | ~line 166 | `assetParams` missing `signature`, `issuer` | `signature: p('signature', '')`, `issuer: p('issuer', '')` |
| `pc2-node/data/test-apps/ddrm-viewer/viewer.js` | ~line 414 | `buildBody()` doesn't forward them to `/secure-view` | Add conditionally (same pattern as `actionCid`) |

## Implementation Plan

### Phase 1 — Server: accept new fields in HTTP handlers

- [ ] `storage.ts` `/lit/secure-view` (~line 3069): add `signature`, `issuer`, `actionCid`
      to request body destructure; populate into `DecryptParams`.
- [ ] `gateway.ts` `/skills/install` (~line 1008): same three fields; populate
      into the `decryptParams` struct passed to `decryptAssetTwoLayer`.

### Phase 2 — elacity-creator: fix KID bugs + capture and persist new fields

- [ ] **KID fix #1** (line 4660): change non-media branch from `encryptResult.dataToEncryptHash`
      to `encryptResult.kid`. Pattern mirrors existing media branch:
      ```js
      var kid = (isMediaFile && mediaEncodeResult)
        ? mediaEncodeResult.kid
        : (encryptResult.kid || '');
      ```
- [ ] **KID fix #2** (line 5233): change non-media capsule branch from
      hash-derived slice to `kidToContentId(encryptResult.kid)`. Pattern:
      ```js
      } else {
        capsuleKid = encryptResult.kid ? kidToContentId(encryptResult.kid) : '';
      }
      ```
- [ ] **KID fix #3** (lines 1470, 1484, 1498 in `buildTokenTypeJsons`): remove the
      `|| params.dataToEncryptHash` fallback from all three token-type `kid` fields.
      Change each to `kid: params.kid || ''`. The fallback silently produces a wrong
      KID if the caller ever passes an empty `kid` — it must be eliminated so
      failures surface immediately.
- [ ] **KID fix #4** (after line 4624, non-media branch): set `envelope.asset.kid`
      on the IPFS metadata `asset` object so the UUID-derived KID appears next to
      the CID and other asset-identity fields (mirrors line 4617 for media):
      ```js
      // After isMediaFile block:
      if (!isMediaFile && encryptResult.kid) {
        envelope.asset.kid = encryptResult.kid;
      }
      ```
- [ ] `encryptResult` (~line 4184): add `signature: litData.signature || ''` and
      `issuer: litData.issuer || ''` from the `/lit/encrypt` response.
- [ ] IPFS metadata envelope (~line 4589): add `signature` and `issuer` to
      `protections[0]` alongside `litCiphertext` and `iv`.
- [ ] Puter FS capsule (~line 5284): add `capsule.signature` and `capsule.issuer`.
- [ ] `contentHash` / `contentHashAlgorithm` (~line 4627): move from
      `protections[0]` to `envelope.asset` directly. Change guard from
      `if (originalContentHash && envelope.asset.protections && envelope.asset.protections[0])`
      to `if (originalContentHash)`. Applies to both media and non-media assets.

### Phase 3 — elacity-market: extract and forward new fields

- [ ] Non-media descriptor (~line 4029): extract `signature` and `issuer` via
      `resolveAssetProtectionField`; set on descriptor.
- [ ] ddrm-viewer launch (~line 4499): include `signature` and `issuer` in args
      alongside `actionCid`.
- [ ] Skills install (~line 1627): extract `signature`, `issuer`, `actionCid` via
      `resolveAssetProtectionField`.
- [ ] `/skills/install` POST body (~line 1649): add all three fields.

### Phase 4 — ddrm-viewer: read and send new fields

- [ ] `assetParams` (~line 166): add `signature: p('signature', '')` and
      `issuer: p('issuer', '')`.
- [ ] `buildBody()` (~line 414): forward `signature` and `issuer` conditionally
      (same pattern as `actionCid` — only add when truthy).

### Phase 5 — Dead code retirement (after Phase 1–4 verified)

- [ ] Delete `recoverNonMediaCEK` (`chipotle-client.ts:745`) — no live call sites.
- [ ] Delete Datil branch in `recoverCEKAndFetchData` (`storage.ts:2372–2466`) —
      unreachable (`LIT_BACKEND` enforces chipotle).
- [ ] Remove `litBackend` field from `DecryptParams` (`storage.ts:2273`) and all
      references.
- [ ] Remove old action files from `/lit/deploy-action` dispatch list
      (`data/lit-actions/{non-media,media}-{encrypt,decrypt}-chipotle.js`);
      keep files in git history for CID reference.

## Acceptance Criteria

1. `cd pc2-node && npx tsc --noEmit` compiles cleanly.
2. **KID round-trip** (was broken, must be the first thing verified):
   - `content.json` `kid` field === `encryptResult.kid` (32-hex UUID-derived, no 0x prefix).
   - IPFS metadata `asset.kid` === `encryptResult.kid` (present at top level of `asset`, not only in `protections[0]`).
   - On-chain mint contentId === `kidToContentId(encryptResult.kid)` (0x-prefixed bytes16).
   - These two are equal. `hasAccessByContentId` returns true for the buyer.
   - Capsule `.ddrm` `kid` field === `kidToContentId(encryptResult.kid)`.
   - Token-type JSONs (`*.json`) `properties.kid` === `encryptResult.kid` (no hash fallback).
3. Mint a non-media asset via `test-apps/elacity-creator`:
   - IPFS metadata `protections[0]` contains `signature`, `issuer`, `actionCid`.
   - `asset.contentHash` and `asset.contentHashAlgorithm` are present directly
     on `asset`, **not** inside `protections[0]`.
   - Puter FS capsule JSON contains `signature` and `issuer`.
3. Open the minted asset via `test-apps/elacity-market` → `test-apps/ddrm-viewer`:
   - ddrm-viewer receives `signature` and `issuer` in launch args.
   - `/lit/secure-view` request body includes `signature`, `issuer`, `actionCid`
     (verifiable in DevTools Network tab).
   - Content renders successfully (no 4xx, no `integrity_sig_mismatch`).
4. Skill publish + install cycle:
   - `/skills/install` POST body includes `signature`, `issuer`, `actionCid`.
   - Install completes and skill appears in installed list.
5. Backward compat — pre-existing asset without `signature`/`issuer` in IPFS metadata:
   - Fields resolve to empty strings via `resolveAssetProtectionField`.
   - `/lit/secure-view` succeeds (integrity check skipped by Lit Action when
     `signature` and `issuer` are both absent).

## Backward Compatibility

Already-published assets without `signature`/`issuer` in IPFS metadata continue
to work:

1. `resolveAssetProtectionField(asset, 'signature', '')` returns `''` — empty
   string is passed (or omitted by the conditional in `buildBody()`).
2. Server handlers treat all three new fields as optional; absent = skipped.
3. `recoverCEKViaEnvelope` passes `signature`/`issuer` only when non-empty.
4. `universal-decrypt-chipotle.js` lines 560–566: integrity check is conditional
   on `signature && issuer` both being present. Old assets skip it cleanly.
5. Size-based CEK passthrough (≤32 B) and `LEGACY_NON_MEDIA_ACTION_CIDS`
   allowlist are unchanged.

No DB migrations, no IPFS re-pins, no on-chain transactions required.

## Files Modified

| File | Phase | Change |
|------|-------|--------|
| `pc2-node/src/api/storage.ts` | 1 | Accept + thread `signature`, `issuer`, `actionCid` in `/lit/secure-view` |
| `pc2-node/src/api/gateway.ts` | 1 | Accept + thread in `/skills/install` |
| `pc2-node/data/test-apps/elacity-creator/app.js` | 2 | Capture + persist new fields; move `contentHash`/`contentHashAlgorithm` to `asset` |
| `pc2-node/data/test-apps/elacity-market/app.js` | 3 | Extract + forward new fields (descriptor, viewer launch, skills install) |
| `pc2-node/data/test-apps/ddrm-viewer/viewer.js` | 4 | Accept + send `signature`, `issuer` to `/secure-view` |
| `pc2-node/src/api/chipotle-client.ts` | 5 | Delete `recoverNonMediaCEK` |
| `pc2-node/src/api/storage.ts` | 5 | Delete Datil branch; remove `litBackend` from `DecryptParams` |

## Hard Constraints

- Do NOT modify `universal-decrypt-chipotle.js` or `universal-encrypt-chipotle.js` —
  they are correct as-is.
- Do NOT touch `installed-apps/` — only `test-apps/` is in scope.
- Do NOT log or cache raw CEK bytes at any point.
- Fields `signature` and `issuer` are always **optional** in transit — never
  reject a request that omits them (backward compat).
- `contentHash` / `contentHashAlgorithm` MUST NOT appear in `protections[0]`
  in any newly minted asset after this lands.

## Out of Scope

- `installed-apps/` versions of any app.
- `packages/access` SDK (still on the old Lit SDK path; separate migration).
- `src/gui/src/helpers/open_item.js` (Puter GUI; separate concern).
- Any media-path changes (already migrated in `592a3be4f`).
- Supernode `ddrm-config.json` or Chipotle allowlist updates (operational).

## Status History

| Date | Status | Note |
|------|--------|------|
| 2026-05-19 | Pending | Task created; design reviewed and approved |
