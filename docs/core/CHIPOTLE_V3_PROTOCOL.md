# Chipotle DRM v3 Protocol

> Unified encrypt/decrypt with ECDH envelope wrapping.
> Specification: `docs/core/plans/chipotle_security_alignment.md`
> Task breakdown: `.cursor/tasks/CHIPOTLE-V3-UNIVERSAL-ACTIONS/`

## 1. Overview

Chipotle v3 replaces the separate media and non-media Lit Actions with a single
unified pair:

| Action | CID | File |
|--------|-----|------|
| Encrypt | `QmVEz3dDnQD1n96gMd2mFZWXdEDsRiPMumx86qMzhT35gY` | `data/lit-actions/universal-encrypt-chipotle.js` |
| Decrypt | `QmPBjQD7V4aFTZPxUwZ9gDPFJtcJ4SvsJdTh3QexTyRBbj` | `data/lit-actions/universal-decrypt-chipotle.js` |

Key properties:

- **CEK never in plaintext** between the Lit Action TEE and the consuming
  component. Decrypt returns an ECDH envelope, not raw bytes.
- **Composite hash binding**: `SHA-256(CEK || KID || authority)` replaces the
  old `KID = sha256(CEK)[0:16]` derivation. Prevents CEK/KID substitution.
- **Independent KID**: generated randomly, not derived from CEK.
- **Single code path** for media (128-bit AES-CBC) and non-media (256-bit AES-GCM).
- **ipfs_id-first transport**: the server prefers calling actions by CID reference
  (server-cached) and only falls back to inline `code` if Chipotle returns
  `No cached code found`.

## 2. Key Generation

### Media (DASH/CENC)

```
CEK: crypto.randomBytes(16)            // 128-bit AES-128-CBC
KID: crypto.randomUUID() sans dashes   // 128-bit random, hex string (32 chars)
```

### Non-media (file encryption)

```
CEK: WASM-generated AES-256 key        // 256-bit AES-256-GCM
KID: crypto.randomBytes(32)            // 256-bit random, hex string (64 chars)
```

KID is **never** derived from CEK. This decouples key identification from key
material.

## 3. Encryption Flow

```
Caller                            Lit Action (TEE)
  |                                     |
  |  plaintext(b64), kid(b64),          |
  |  authority(hex), pkpId,             |
  |  outputFormat: "hex"                |
  |------------------------------------>|
  |                                     |  Validate inputs
  |                                     |  Decode CEK, KID, authority to bytes
  |                                     |  hash = SHA-256(cek || kid || authority)
  |                                     |  sig = PKP.sign(hash) [secp256k1]
  |                                     |  ct = Lit.Actions.Encrypt({pkpId, message: plaintext})
  |  { ciphertext, hash,                |
  |    signature, issuer } (all hex)    |
  |<------------------------------------|
```

The composite hash is stored alongside the ciphertext in protection data. On
decrypt, the Lit Action recomputes it and verifies the match — ensuring the
CEK, KID, and authority are the same triple that was encrypted.

## 4. Decryption Flow

```
Server                            Lit Action (TEE)
  |                                     |
  |  Generate ephemeral P-256 keypair   |
  |                                     |
  |  publicKey(hex), keyAlg,            |
  |  ciphertext, dataToEncryptHash,     |
  |  kid, pkpId, actionIpfsId,          |
  |  authority, chainId, rpc,           |
  |  delegation, delegationSig,         |
  |  request, requestSig,               |
  |  signature?, issuer?                |
  |------------------------------------>|
  |                                     |  Validate session bundle
  |                                     |  On-chain access check (hasAccessByContentId)
  |                                     |  Decrypt CEK via Lit.Actions.Decrypt
  |                                     |  Verify composite hash match
  |                                     |  Optional: verify issuer signature
  |                                     |  ECDH(pkpPrivKey_P256, sessionPubKey_P256)
  |                                     |    -> AES-CBC-256 shared key
  |                                     |  Encrypt rawLicenseBytes with shared key
  |  { data: base64(envelope),          |
  |    byteLength, authorizedAddress }  |
  |<------------------------------------|
  |                                     |
  |  Unwrap ECDH envelope locally       |
  |  -> raw CEK (never leaves server)   |
```

## 5. ECDH Envelope Wire Format

```
HEADER  (4 bytes)
  format   [3]   "raw" (null-padded)
  flag     [1]   0x02

METADATA
  pkLen    [2]   u16be — PKP compressed P-256 public key length (33)
  pk       [33]  PKP compressed P-256 public key (ECDH counterpart)
  sigLen   [2]   u16be — ECDSA signature length (65)
  sig      [65]  secp256k1 sig over SHA-256(encryptedBody): r || s || v
  signer   [33]  PKP compressed secp256k1 public key

BODY
  bodyLen  [4]   u32be — byte length of encryptedBody
  encryptedBody [N]
    Algorithm: AES-CBC-256
    Key:       ECDH(pkpKey_P256, sessionPubKey_P256)
    IV:        sessionPublicKey bytes [0..15]

    Decrypted layout (rawLicenseBytes):
      metaLen  [4]   u32be — byte length of metadata block
      issuer   [20]  issuer Ethereum address bytes
      exp      [8]   u64be Unix timestamp (expiry)
      audience [20]  audience Ethereum address bytes
      keyCount [4]   u32be (always 1)
      cek      [16 | 32]  raw AES content-encryption key
```

Total envelope size is always ≥150 bytes (header + metadata + minimum AES-CBC
block) — so a response payload of ≤32 bytes is unambiguously a legacy
plaintext CEK (see §7).

## 6. Protection Data Format (v3.0)

```json
{
  "protocolVersion": "3.0",
  "protectionType": "cenc:lit-aes-gcm-v3",
  "variant": "eth.web3.clearkey",
  "algorithm": "AES-128-CBC",
  "data": {
    "actionIpfsId": "QmPBjQD7V4aFTZPxUwZ9gDPFJtcJ4SvsJdTh3QexTyRBbj",
    "litBackend": "chipotle",
    "chainId": 8453,
    "authority": "0x09dBe796f40ECEffEAccf243c3d758C4c1d8D87D",
    "rpc": "...",
    "kid": "0x<hex>",
    "dataToEncryptHash": "<hex>",
    "ciphertext": "<hex>",
    "issuer": "<checksummed PKP address>",
    "signature": "<hex>",
    "format": "hex"
  }
}
```

### Changes from v2.0

| Field | v2.0 | v3.0 |
|-------|------|------|
| `protocolVersion` | `"2.0"` | `"3.0"` |
| `ciphersuite` | `"e8582013"` | Removed |
| `data.hash` | Present | Renamed to `data.dataToEncryptHash` |
| `data.ciphertext` | base64 | hex |
| `data.issuer` | — | Added (checksummed PKP address) |
| `data.signature` | — | Added (hex) |
| `data.format` | — | Added (`"hex"`) |
| `algorithm` | — | Added (`"AES-128-CBC"` media, `"AES-256-GCM"` non-media) |
| `data.actionIpfsId` | Old per-type CID | Universal decrypt CID |

The TS `buildProtectionData()` in `dashPackager.ts` is the single source of
truth — `buildPSSHJson`, `injectPSSHBox`, and the standalone `pssh-*.json`
write all delegate to it. The rust `crates/cenc-encrypt/src/pssh.rs`
emits the same v3.0 format for any caller that opts in via `pssh_params`.

## 7. Legacy Asset Compatibility

Assets encrypted with older Lit Actions carry their own `actionIpfsId` in
protection data. The backwards-compatible logic is end-to-end:

### Routing

| Component | Behaviour |
|-----------|-----------|
| `media.ts` `/init` | Honors PSSH `actionIpfsId` if it is in `LEGACY_NON_MEDIA_ACTION_CIDS`; otherwise overrides with current `NON_MEDIA_ACTION_CID`. |
| `storage.ts` decrypt | Uses asset's `actionCid` when present (legacy CIDs route to the legacy action); falls back to current CID. |
| `storage.ts` session-create | Accepts delegation bound to either the current CID or any known-legacy CID. |

The known-legacy CIDs are pinned in `LEGACY_NON_MEDIA_ACTION_CIDS` in
`storage.ts`:

```ts
const LEGACY_NON_MEDIA_ACTION_CIDS: ReadonlySet<string> = new Set([
  'bafkreihvm4zkyuefnuptlbdins6cmd2mbslj2xgnyzz3ssdg2ggg3jtkk4', // V1.2 sigauth non-media decrypt
  'QmSHMSxPogSsNki51fenDzsrkKB3eJfRMHXEPZKqPk6EAb',              // legacy media decrypt
]);
```

Exported as `isLegacyNonMediaActionCid()`.

### Plaintext-CEK detection

The unified `recoverCEKViaEnvelope` inspects the response body length to
distinguish envelopes from plaintext CEKs:

- **≤32 bytes** → legacy plaintext CEK (16 bytes for AES-128 media, 32 bytes
  for AES-256 non-media). Returned as-is to the caller.
- **>32 bytes** → ECDH envelope (always ≥150 bytes). Unwrap with the
  ephemeral P-256 private key.

The legacy V1.2 Lit Action files (`non-media-encrypt-chipotle.js`,
`non-media-decrypt-chipotle.js`) are retained on disk for existing
delegations that reference them.

## 8. Execution Transport (Proxy)

All Lit Action calls go through an Elacity-hosted proxy that holds the
Chipotle `X-Api-Key` server-side. PC2 nodes never see or persist the key.

```
LIT_ACTION_PROXY_URL = "https://europe-west1-elacity.cloudfunctions.net/chipotle-proxy"
POST {LIT_ACTION_PROXY_URL}/core/v1/lit_action
Content-Type: application/json     ← no auth header
Body: { code | ipfs_id, js_params }
```

The proxy forwards verbatim to the upstream Lit API (path-preserving), so
callers and request bodies are identical to what a direct Chipotle call
would look like — only the URL and the absence of `X-Api-Key` change.

### Why proxy

- **Key confidentiality**: the `X-Api-Key` is sensitive billing-grade credential.
  Pre-proxy, every PC2 node carried it on disk (`.chipotle-api-key`,
  `.chipotle-user-key`) and in env vars (`LIT_CHIPOTLE_USAGE_KEY`,
  `LIT_CHIPOTLE_USER_KEY`). Any node compromise leaked the fleet key.
- **No per-node tier ceremony**: the old "Tier 1 shared / Tier 2 user-supplied
  / Tier 3 product key" UX is gone — the proxy is the single point of
  authentication.
- **One operator dial**: rotating the upstream key is a proxy config change,
  not a fleet-wide redeploy.

### What was removed

| Removed | Replaced by |
|---|---|
| `data/.chipotle-api-key`, `data/.chipotle-user-key` | nothing — proxy holds the key |
| `data/.lit-action-cid` | provision blob `actions.decrypt` → constant fallback |
| env: `LIT_CHIPOTLE_USAGE_KEY`, `LIT_CHIPOTLE_USER_KEY`, `LIT_CHIPOTLE_API_URL`, `LIT_ACTION_CID` | (no equivalent — config flows from supernode provision) |
| `resolveApiKey()`, `resolveApiUrl()`, `saveUserApiKey()`, `getUserApiKey()`, `clearUserApiKey()` | deleted |
| `ChipotleConfig.apiUrl`, `ChipotleConfig.apiKey` | deleted — only `pkpId` remains |
| `ProvisionConfig.usageKey` field | stripped before persisting `data/.chipotle-provision.json`; supernodes may still include it in the signed envelope but it is dropped on receipt |

## 9. Config Resolution

After the proxy cutover the runtime has **two sources of truth** and a small
set of hardcoded fallbacks. There is no env override and no per-node config
file other than the supernode-provisioned blob.

| Field | Source | Fallback |
|---|---|---|
| **Execution URL** | `LIT_ACTION_PROXY_URL` constant | — (single value) |
| **API key** | Proxy (server-side) | — (never on PC2) |
| **Decrypt CID** | `provision.actions.decrypt` (with KNOWN_BAD reject) | `UNIVERSAL_DECRYPT_CID` constant |
| **Encrypt CID** | `provision.actions.encrypt` | `UNIVERSAL_ENCRYPT_CID` constant |
| **PKP ID** | per-call `config.pkpId` → `provision.pkpId` | `DEFAULT_PKP_ID` constant |
| **Authority / chain / chainId** | per-call `params.*` | `DEFAULT_AUTHORITY` / `DEFAULT_CHAIN` / `DEFAULT_CHAIN_ID` |
| **RPC** | per-call `params.rpc` | `getBaseRpcUrl()` (server config) |
| **Action JS source** | `data/lit-actions/*.js` (static loaders) or `fetchLitActionCode(cid)` (local file → IPFS gateways) | — |
| **Provision blob itself** | `data/.chipotle-provision.json` cache | signed fetch from supernode → strip `usageKey` → persist |

### Rotation procedure

- **Decrypt / encrypt CID**: update the supernode provision payload (Ed25519
  signed envelope). PC2 nodes pick it up on the next provision fetch or by
  deleting `data/.chipotle-provision.json` to force a re-fetch.
- **`UNIVERSAL_*_CID` constants**: only used as cold-start fallback when no
  provision is cached. Update in lockstep with the supernode payload so
  fresh nodes converge on the right action.
- **Proxy URL**: hardcoded in `chipotle-client.ts`. Changing it requires a
  PC2 redeploy.

### Provision envelope (unchanged)

Still Ed25519-signed by Elacity Labs' provision key, validated against
`ELACITY_LABS_PROVISION_PUBKEY_HEX`. `PROVISION_SIG_REQUIRED=0` still
supports unsigned bootstrap, but the `usageKey` field is now ignored
either way.

## 10. ipfs_id Transport (with Code Fallback)

`executeLitAction` accepts an optional `ipfsId` field on `LitActionParams`.
When present, the server first invokes the action by CID reference and only
falls back to sending the full source if Chipotle has not cached it yet.

### Flow

1. **Caller passes both** `ipfsId` (the CID) and `code` (the source). The
   client decides which to send.
2. **First attempt**: POST `{ ipfs_id, js_params }`.
3. **Detect cache miss**: if HTTP status is 4xx and the response body
   matches the canonical Chipotle phrase, fall back. Matcher:
   ```ts
   const NO_CACHED_CODE_ANCHOR = /No cached code found/i;
   ```
   Strict — only the exact anchor phrase triggers a fallback. Looser
   matches (e.g. "cache miss" alone, "code not cached") were considered
   too easy to false-positive on Lit Action bubbled errors.
4. **Mark CID as not-cached** for 60 s (negative cache) so subsequent
   calls skip the wasted roundtrip until Chipotle either warms its cache
   or we re-probe after TTL.
5. **Fallback**: POST `{ code, js_params }` and use the result.

### Error parsing

The body shape varies — Chipotle returns:
- JSON-encoded string: `"No cached code found..."`
- Wrapped object: `{ "error": "..." }` / `{ "message": "..." }` / `{ "detail": "..." }`
- Nested: `{ "error": { "message": "..." } }`
- Raw text (no JSON envelope)

`extractErrorMessage(json, text)` returns the message verbatim across all
these shapes. The matcher uses a case-insensitive regex so we never have
to mutate the original string.

5xx responses are **not** subject to the fallback — a server error should
propagate, not be shadowed by retrying with a different request shape.

## 11. Security Properties

- **CEK confidentiality**: CEK is encrypted inside the TEE and returned in an
  ECDH envelope. It is never transmitted as plaintext between components.
- **Composite hash integrity**: `SHA-256(CEK || KID || authority)` prevents an
  attacker from binding a legitimate ciphertext to a different KID or authority.
- **PKP signature (issuer)**: Non-repudiation — the PKP signs the composite
  hash, and the issuer address can be verified on-chain.
- **Ephemeral P-256 keypair**: Generated per-request, provides forward secrecy
  for the CEK transport.
- **Session bundle**: 24-hour wallet-signed delegation + per-asset ephemeral
  P-256 signed request. The Lit Action validates both before releasing the CEK.
- **RPC pinning**: `rpc` is always sourced from server config
  (`getBaseRpcUrl()`), never from client or PSSH data.
- **No CEK logging**: No code path logs, caches to disk, or transmits the raw
  CEK in plaintext at any log level. Length and SHA-prefix are the only
  CEK-derived values that appear in logs.
- **No API key on disk**: The Chipotle `X-Api-Key` lives only on the proxy
  (see §8). Compromising a PC2 node cannot leak the fleet credential.

## 12. SecureView Session Delegation

The session bundle authenticates decrypt requests:

```
SecureViewSessionBundle {
  delegationCanonical: string   // JSON: coveredAddresses, exp, actionIpfsId, ...
  delegationSig: `0x${string}` // Wallet signature over delegation
  requestCanonical: string      // JSON: kid, nonce, timestamp, ...
  requestSig: `0x${string}`    // P-256 signature over request
}
```

- **Delegation**: 24-hour validity, signed by the asset owner's wallet.
  `coveredAddresses` authorises specific viewer addresses.
  `actionIpfsId` binds the delegation to a specific Lit Action — must be
  either the current `NON_MEDIA_ACTION_CID` or a known-legacy CID.
- **Request**: Per-asset, includes KID and a nonce. Signed with the ephemeral
  P-256 key whose public half is sent as `publicKey` in jsParams.
- The Lit Action derives the viewer's address from the delegation, not from any
  client-supplied `userAddress` parameter.

## 13. File Map

| File | Role |
|------|------|
| `pc2-node/src/api/chipotle-client.ts` | Proxy URL, CID constants, encrypt/decrypt functions, ECDH unwrap, IPFS code fetcher, `ipfs_id`-first transport with `code` fallback and per-CID negative cache, supernode provision fetch/verify (signed Ed25519 envelope; `usageKey` stripped on persist). |
| `pc2-node/src/api/storage.ts` | Non-media encrypt endpoint (`POST /lit/encrypt`), decrypt via `recoverCEKViaEnvelope`, legacy CID allowlist (`LEGACY_NON_MEDIA_ACTION_CIDS`), `isLegacyNonMediaActionCid()` export. |
| `pc2-node/src/api/media.ts` | Media decrypt via `recoverCEKViaEnvelope` (delegates to chipotle-client). `/init` honors legacy PSSH `actionIpfsId`. |
| `pc2-node/src/services/media/dashPackager.ts` | Media CEK generation (independent KID), DASH packaging, single-source v3.0 PSSH (`buildProtectionData`). |
| `pc2-node/crates/cenc-encrypt/src/pssh.rs` | Rust PSSH builder — v3.0 protection JSON for the optional `pssh_params` mode. |
| `pc2-node/data/lit-actions/universal-encrypt-chipotle.js` | TEE encrypt action. |
| `pc2-node/data/lit-actions/universal-decrypt-chipotle.js` | TEE decrypt action. |
| `pc2-node/data/lit-actions/non-media-encrypt-chipotle.js` | Legacy encrypt action — retained for old delegations. |
| `pc2-node/data/lit-actions/non-media-decrypt-chipotle.js` | Legacy decrypt action — returns plaintext CEK; detected via the ≤32-byte heuristic. |

## 14. MPEG-CENC Compliance

> **Status update 2026-05-18 — most of the original gap closed.** See
> [`MEDIA_DRM_PACKAGING.md`](MEDIA_DRM_PACKAGING.md) for the current-state
> reference and [`CENC_PACKAGING_COMPLIANCE.md`](CENC_PACKAGING_COMPLIANCE.md)
> for the post-mortem of the work that landed.

The pc2-node DASH packager now emits CENC-compliant init segments end-to-end:
`encv`/`enca` sample entries with `sinf/schm/tenc`, in-moov `pssh`
(`cenc:lit-aes-gcm-v3` systemId from the Elacity dDRM family), per-segment
`senc` with per-sample IVs (and subsamples for AV1), and AES-128-CTR
encryption matching ISO/IEC 23001-7. Both the in-house Elacity player
(server-side decryption) and an external libav-based player (client-side
decryption via Lit license recovery) play assets end-to-end as of 2026-05-18.

| CENC requirement | Current implementation | Compliant |
|---|---|---|
| Standard scheme declared (`cenc` / `cbcs` / `cens` / `cbc1`) | `cenc` AES-128-CTR via `schm` v0x00010000 inside `sinf` | ✓ |
| `pssh` box with system-specific opaque data | v1 pssh, Elacity systemId `bf2c86c1-d9ff-4ab1-b4be-45ae4d99e1fe`, UTF-8 JSON payload (§6) carrying Lit/Chipotle metadata | ✓ |
| `tenc` track encryption box in init | Emitted per trak via multi-trak `process_transform_init`; preserved through per-track `split_init`; stripped only on the server-side cleartext-delivery path | ✓ |
| `senc` sample IVs + (optional) subsamples in media segments | Per-segment `senc`; AV1 carries subsamples (clear leader=32 B for OBU headers); AAC full-sample | ✓ |
| `saiz` / `saio` sample-aux pointers | Not emitted (libav reads senc directly; CMAF-strict consumers may need this — polish item) | partial |
| `<ContentProtection>` descriptors in MPD | Not emitted (tracked in sibling task `MEDIA-2026-04-28-DASH-MPD-COMPLIANCE`) | partial |
| Client-side sample decryption with CEK (libav CENC pipeline) | libav-based players recover CEK via Lit Action and decrypt samples through standard CENC path | ✓ |
| Client-side EME via browser CDM | We don't ship a CDM matching our custom systemId; browser EME path needs a custom backend to work — out of scope | ✗ |

### What's still out of scope (deliberately)

- **MPD `<ContentProtection>` descriptor emission** — tracked separately in
  [`MEDIA-2026-04-28-DASH-MPD-COMPLIANCE`](../../.cursor/tasks/MEDIA-2026-04-28-DASH-MPD-COMPLIANCE/MEDIA-2026-04-28-DASH-MPD-COMPLIANCE.md).
  Required for players that signal encryption from the MPD layer (rather than
  discovering it from the init's pssh box).
- **Browser EME CDM** for the Elacity dDRM family — we don't ship a Widevine
  / PlayReady-style CDM, so stock browsers can't decrypt our streams. Any
  browser-side consumer needs the in-house Elacity player path (server-side
  decrypt) or a custom EME backend wired into our Lit Actions.
- **`saiz` / `saio`** sample-auxiliary-information pointer boxes. libav
  doesn't need them; CMAF-strict demuxers do. Polish item.
- **Per-OBU AV1 subsamples** per ISO/IEC 23001-12 Amendment 2. The fixed
  32-byte clear-leader is empirically sufficient for our encoder profile;
  per-OBU parsing would be spec-perfect.

### Done items (was the original TODO list)

- ✅ MPEG-CENC interop **is** a product goal (decision made 2026-05-18 when
  client-side libav playback became a requirement). Server-side decryption
  is retained as the in-house player's fast path.
- ✅ Standard scheme + `tenc` + `senc` + subsamples emitted end-to-end.
- ✅ Standard system ID space used; custom systemId for the Elacity dDRM
  family is registered alongside the JSON-in-PSSH shape, which is allowed by
  CENC §9.1 (`Data[]` is DRM-system-specific).
- ✅ Deliberate divergence (custom systemId, JSON payload) documented in
  [`MEDIA_DRM_PACKAGING.md`](MEDIA_DRM_PACKAGING.md) §4 and §13 so future
  contributors don't read "DASH" and assume Widevine/PlayReady applies.

---

## 15. Non-Media Lit Migration (2026-05-20)

This section records the work done to align the non-media encrypt/decrypt path
with the Chipotle v3 architecture that was already live for media after commit
`592a3be4f`.

### 15.1 What Changed

#### Phase 1 — Server-side threading (`gateway.ts`, `storage.ts`)

`signature`, `issuer`, and `actionCid` — returned by `/lit/encrypt` since v3 —
were not threaded through the non-media decrypt cycle. Added:

- `gateway.ts` `/skills/install`: destructures and conditionally spreads the
  three fields into `DecryptParams`.
- `storage.ts` `/lit/secure-view`: no explicit destructure needed —
  `effectiveBody = { ...req.body }` already carries the fields through to
  `decryptAssetTwoLayer`.

#### Phase 2 — Creator app KID fixes (`elacity-creator/app.js`)

Four KID bugs were present, all caused by using `dataToEncryptHash` as a
fallback KID when `encryptResult.kid` was available:

| Bug | Location | Fix |
|-----|----------|-----|
| `kid` field in `buildEncryptedEnvelope` | line ~4667 | `encryptResult.kid \|\| ''` replaces hash fallback |
| Capsule `kid` (non-media) | line ~4902 | `kidToContentId(encryptResult.kid)` replaces hash-slice |
| `buildTokenTypeJsons` (×3 token types) | lines ~1470/1484/1498 | `params.kid \|\| ''` — removed `\|\| params.dataToEncryptHash` |
| `asset.kid` missing in metadata root | line ~4628 area | `envelope.asset.kid = encryptResult.kid` added |

Additional changes in Phase 2:

- `envelope.kid = kid` written at the root `asset` object level (next to
  `.media` and `.image`) — the canonical asset identifier, critical for
  downstream decrypt routing.
- `contentHash` and `contentHashAlgorithm` moved from `protections[0]` to
  `envelope.asset` directly.
- `signature` and `issuer` from `/lit/encrypt` stored in `protections[0]` and
  in the capsule (conditionally, both media and non-media paths).
- `kid: kid, title: title` added to the `buildContractJson` call — previously
  `contract.json` always had `kid: ""`.

#### Phase 3 — Market app KID + signature threading (`elacity-market/app.js`)

- `buildDdrmDescriptor`: KID now reads `resolveAssetProtectionField(asset, 'kid', '')`
  first (new assets), with a hash-slice fallback (old assets without `asset.kid`).
  `signature` and `issuer` extracted and forwarded.
- `launchViewerPopup`: same KID fix; `signature`/`issuer` added to `viewerArgs`
  conditionally.
- `installSkillFromNFT`: `skillSignature`, `skillIssuer`, `skillActionCid`
  extracted and forwarded to the server.

#### Phase 4 — Viewer KID normalisation + `bad_req_kid` fix (`ddrm-viewer/viewer.js`)

- `assetParams`: `signature` and `issuer` added via `p()`.
- `buildBody()`: forwards both fields conditionally.
- **`bad_req_kid` root cause**: `assetParams.kid` was stored without `0x` prefix.
  The Lit Action compares `String(req.kid).toLowerCase()` (from the signed
  request, no prefix) against `normalizedKid` (server adds `0x` to
  `jsParams.kid`). Mismatch → 403.
  Fix: `kid: rawKid && !rawKid.startsWith('0x') ? '0x' + rawKid : rawKid` in
  `assetParams` so the signed request carries `0xae469...` matching the server's
  normalized kid.

#### Phase 5 — Dead code retirement

| Deleted | File | Notes |
|---------|------|-------|
| `NonMediaDecryptParams` interface | `chipotle-client.ts` | Superseded by server-session path |
| `recoverNonMediaCEK()` | `chipotle-client.ts` | Replaced by `recoverCEKWithServerSession` |
| `recoverCEKViaEnvelope()` | `chipotle-client.ts` | Client-session approach — see §15.3 |
| Datil SDK non-media decrypt branch | `storage.ts` | `LIT_BACKEND=datil` decrypt path gone; `litBackend` type/config retained for future use |
| `packages/access` (`@elacity-js/access`) | repo root | Entire package deleted — Lit SDK wrapper no longer used anywhere |
| `vendor/access/elacity-access.browser.js` (×4) | test-apps + installed-apps | ~170 MB of dead browser bundles |
| All `@lit-protocol/**` dynamic imports | `storage.ts`, `media.ts` | Removed by author after confirming no active callers |

### 15.2 Bugs Fixed

**`bad_req_kid` (403 on `/lit/secure-view`)**
The viewer was passing the KID without `0x` prefix into the signed session
request. The Lit Action's `bad_req_kid` check compared `req.kid` (from the
request canonical, no prefix) against `jsParams.kid` (server-normalised to
`0x`). Fixed in viewer `assetParams` construction (Phase 4).

**`DOMException: bad decrypt` (AES-CBC failure in ECDH unwrap)**
`recoverCEKViaEnvelope` was passed the *client's* `secureViewSession`. The Lit
Action encrypts the ECDH envelope for `del.sessionPublicKey` — the client's
browser ephemeral key. The server tried to unwrap with its own ephemeral ECDH
key (a different key). Result: every decrypt attempt failed.
Fixed by switching `recoverCEKAndFetchData` to `recoverCEKWithServerSession`,
which generates a server-owned P-256 keypair and places its public half as
`del.sessionPublicKey`, so the server can always unwrap the envelope.

**`kid: ""` in `metadata.json` root + `contract.json`**
`buildMetadataEnvelope` had `kid: params.kid || ''` at the root but the call
site never passed `kid` in `metaParams`. Similarly `buildContractJson`. Fixed
by writing `envelope.kid = kid` after the `kid` variable is computed, and
adding `kid`/`title` to the `buildContractJson` call.

### 15.3 Known Design Limitation — Server-signed Delegation

`recoverCEKWithServerSession` currently generates the delegation itself, signing
it with a **throwaway `ethers.Wallet.createRandom()` secp256k1 keypair**.
`ownerAddress` in the delegation is this throwaway address, not the authenticated
user's wallet.

**Why this works today**: the Lit Action's access gate checks
`hasAccessByContentId(coveredAddresses[0], kid)` on-chain. `coveredAddresses[0]`
is set to `buyerAddress` (sourced from the verified JWT, not from the client).
`ownerAddress` is only used to verify the `delegationSig` — there is no on-chain
privilege check on it. Security is therefore enforced by the JWT authentication
layer and the on-chain AccessToken check, not by the delegation signer identity.

**Why it is architecturally wrong**: the session bundle design (§12) was built
around the premise that the asset owner's wallet signs the delegation, creating
a full authorization chain: *wallet ownership → delegation → session key → Lit
Action CEK release*. The server bypassing this with a throwaway key breaks the
chain — a compromised server could issue delegations for any address it chooses.

**The correct fix** requires the Lit Action to accept a separate `publicKey`
jsParam (distinct from `del.sessionPublicKey`) for ECDH envelope targeting.
The flow would be:

1. Client (`/lit/begin-session`) receives `delegationCanonical` with
   `ownerAddress = user's wallet`, `sessionPublicKey = client's ephemeral P-256 key`.
2. User signs delegation with their wallet → `delegationSig`.
3. Client signs request with ephemeral session key → `requestSig`.
4. Server generates its own ECDH P-256 keypair for envelope unwrapping.
5. Server calls Lit Action with the user-signed session bundle **plus**
   `publicKey = serverECDHPubKey` as a separate jsParam.
6. Lit Action: verifies user delegation + request, checks on-chain access,
   encrypts ECDH envelope for `publicKey` (server key), not `del.sessionPublicKey`.
7. Server unwraps with its ECDH private key.

This requires a Lit Action change (add `publicKey` override path alongside the
existing `del.sessionPublicKey` path). Until that change lands, the server-signed
delegation path remains the operative implementation. **Do not refactor
`recoverCEKWithServerSession` to use the user's session bundle without first
confirming `UNIVERSAL_DECRYPT_CID` supports the two-key model.**
