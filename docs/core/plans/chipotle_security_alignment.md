# Chipotle DRM v3: Unified Encryption/Decryption with ECDH Envelope

## Context

The Lit Actions for Chipotle DRM have been upgraded:
- **Encryption** (`universal-encrypt-chipotle.js`): Now takes `kid`, `authority`, `pkpId`, `plaintext` and returns `{ ciphertext, hash, signature, issuer }`. The composite hash `SHA-256(CEK || KID || authority)` replaces the old `KID = sha256(CEK)[0:16]` binding.
- **Decryption** (`universal-decrypt-chipotle.js`): No longer returns plaintext CEK. Instead wraps it in an ECDH envelope using the requester's `sessionPublicKey`. Supports both media and non-media.
- **KID-CEK binding broken**: Any valid KID/CEK pair can be used; integrity is ensured by the composite hash + PKP signature.
- **New CIDs**: Encrypt = `QmVEz3dDnQD1n96gMd2mFZWXdEDsRiPMumx86qMzhT35gY`, Decrypt = `QmPBjQD7V4aFTZPxUwZ9gDPFJtcJ4SvsJdTh3QexTyRBbj`

The PC2 node must align with these changes: unified encrypt/decrypt, ECDH envelope unwrapping for all paths, updated CIDs, and backwards compatibility for legacy assets.

---

## File Changes

### 1. `pc2-node/src/api/chipotle-client.ts`

**Encryption (`encryptWithLitAction`)**:
- Load `universal-encrypt-chipotle.js` instead of `non-media-encrypt-chipotle.js`
- Add `kid` (base64) and `authority` (hex) to `EncryptParams` interface
- Pass `kid`, `authority`, `outputFormat: "hex"` to jsParams alongside `plaintext` and `pkpId`
- Parse extended response: `{ ciphertext, hash, signature, issuer }` — all hex-encoded
- Update `EncryptResult` to always include `issuer` and `signature`
- Add/rename cached code loader: `getUniversalEncryptCode()` replacing `getChipotleEncryptCode()`, loading from `data/lit-actions/universal-encrypt-chipotle.js`

**Decryption (retire `recoverNonMediaCEK`, introduce unified path)**:
- Rename `recoverNonMediaCEK` → `recoverCEKViaEnvelope` (or add new function, keep old as deprecated wrapper)
- Generate P-256 ephemeral keypair (`crypto.subtle.generateKey`)
- Export raw public key hex, send as `publicKey` in jsParams
- Add `keyAlg: { name: "ECDH", namedCurve: "P-256" }` to jsParams
- Pass `signature`, `issuer` from protection data to jsParams (for integrity check in Lit Action)
- Load `universal-decrypt-chipotle.js` code (fetched from IPFS by CID, like media actions)
- Parse response: extract ECDH envelope from `.data`, unwrap to get CEK
- **Legacy check**: If response `.data` decodes to ≤16 bytes (raw Uint8Array), treat as legacy plaintext CEK — skip ECDH unwrapping
- Add `getUniversalDecryptCode()` loader for `data/lit-actions/universal-decrypt-chipotle.js`
- Remove `getChipotleNonMediaActionCode()` (or keep for legacy fallback)
- Remove `recoverMediaCEKEnvelope` (unified path handles both)

**Action CID constants**:
- Add: `const UNIVERSAL_DECRYPT_CID = 'QmPBjQD7V4aFTZPxUwZ9gDPFJtcJ4SvsJdTh3QexTyRBbj'`
- Add: `const UNIVERSAL_ENCRYPT_CID = 'QmVEz3dDnQD1n96gMd2mFZWXdEDsRiPMumx86qMzhT35gY'`
- `getActionCid()`: Update Tier 4 fallback to new decrypt CID

**ECDH envelope unwrapping** — extract from `media.ts:unwrapECDHEnvelope` into `chipotle-client.ts` (shared by all callers):
- Parse header (4B) → metadata (ephemeral pubkey, sig, signer) → body (AES-CBC encrypted)
- Decompress P-256 point if needed
- ECDH derive shared key → AES-CBC decrypt → parse rawLicenseBytes → extract CEK
- Reuse existing `decompressP256Point`, `bigintToBytes32`, `modPow`, `modSqrt` from `media.ts`

### 2. `pc2-node/src/services/media/dashPackager.ts`

**CID updates**:
- `MEDIA_DECRYPT_ACTION_CID` → `'QmPBjQD7V4aFTZPxUwZ9gDPFJtcJ4SvsJdTh3QexTyRBbj'`
- `MEDIA_ENCRYPT_ACTION_CID` → `'QmVEz3dDnQD1n96gMd2mFZWXdEDsRiPMumx86qMzhT35gY'`

**`generateCEK()`**:
- CEK: `crypto.randomBytes(16)` (unchanged)
- KID: `crypto.randomUUID()` → sanitize to hex bytes (remove dashes, take as 16-byte hex = 32 hex chars). No longer derived from CEK hash.
- Return `{ cek, kid }` where `kid` is the hex string of the random UUID

**`encryptMediaCEK(cek, kid)`**:
- Add `kid` parameter
- Pass `kid` (as base64) and `authority` (as hex) to `encryptWithLitAction`

**Protection data / PSSH**:
- Add `signature` and `issuer` fields to `PSSHProtectionData.data`
- Update `buildPSSHJson()` and `injectPSSHBox()` to include `signature` and `issuer` from encrypt result
- `contractKid` → use the generated KID directly (no longer derived from hash)

**`createEncryptedDASH()`**:
- Pass `kid` to `encryptMediaCEK(cek, kid)`

### 3. `pc2-node/src/api/storage.ts`

**Encryption (`POST /lit/encrypt`)**:
- Generate random KID: `crypto.randomBytes(32)` for non-media (256-bit)
- Pass KID (base64) + authority to `encryptWithLitAction`
- Return `kid`, `signature`, `issuer` in response alongside existing fields

**Decryption (`recoverCEKAndFetchData`)**:
- Determine action CID: if asset's protection data has `actionIpfsId` → use it (legacy), otherwise use new universal decrypt CID
- Call unified `recoverCEKViaEnvelope` from chipotle-client (generates P-256 keypair, sends to Lit Action, unwraps envelope)
- Pass `signature` and `issuer` from protection data to the decrypt call
- Legacy detection: the function in chipotle-client handles this internally — if `.data` is short (≤16 bytes as Uint8Array), return as-is (legacy plaintext CEK)

**Action CID**:
- Update `DEFAULT_NON_MEDIA_ACTION_CID` to `'QmPBjQD7V4aFTZPxUwZ9gDPFJtcJ4SvsJdTh3QexTyRBbj'` (same as universal decrypt)
- Keep resolution chain but with new default

### 4. `pc2-node/src/api/media.ts`

**`recoverMediaCEK()`**:
- Chipotle path: call unified `recoverCEKViaEnvelope` instead of `recoverNonMediaCEK`
- Pass `signature`, `issuer`, `keyAlg` to the unified function
- Legacy detection handled internally by chipotle-client
- Remove Datil ECDH path (or keep as dead code for now)
- Move `unwrapECDHEnvelope`, `decompressP256Point` and helpers to `chipotle-client.ts` (shared)

### 5. Protection Data Format

**Aligned with keystore service format.** Encoding: `hex` for ciphertext, signature, dataToEncryptHash.

```json
{
  "protectionType": "cenc:lit-aes-gcm-v3",
  "variant": "eth.web3.clearkey",
  "protocolVersion": "3.0",
  "data": {
    "actionIpfsId": "QmPBjQD7V4aFTZPxUwZ9gDPFJtcJ4SvsJdTh3QexTyRBbj",
    "litBackend": "chipotle",
    "chainId": 8453,
    "authority": "0x09dBe...",
    "rpc": "...",
    "kid": "0x...",
    "dataToEncryptHash": "<hex>",
    "ciphertext": "<hex>",
    "issuer": "<checksummed PKP address>",
    "signature": "<hex>",
    "format": "hex"
  },
  "algorithm": "AES-128-CBC"
}
```

**Changes from current PC2 format**:
- Drop `ciphersuite: 'e8582013'` — not used by keystore
- Add `signature`, `issuer`, `format` fields to `data`
- `dataToEncryptHash` replaces `hash` — same field, clearer name (already used in current code)
- `protocolVersion` → `"3.0"` (was `"2.0"`)
- Add `algorithm` at protection data level: `"AES-128-CBC"` for media (128-bit CEK), `"AES-256-GCM"` for non-media (256-bit CEK)
- `PSSHProtectionData` interface updated to match

**dashPackager.ts**: Update `buildPSSHJson()`, `injectPSSHBox()`, and the standalone `pssh-*.json` write in `packageDASH()` to emit this format.

**storage.ts**: Update `POST /lit/encrypt` response and any protection data construction to match.

### 6. Documentation: `docs/core/CHIPOTLE_V3_PROTOCOL.md`

Document the full Chipotle v3 protocol:
- Unified encrypt/decrypt (no separate media vs non-media actions)
- New CIDs and their roles
- Composite hash binding (CEK + KID + authority)
- ECDH envelope format and unwrapping
- Legacy asset compatibility
- Protection data format
- Key generation changes (independent KID)
- Security: CEK never in plaintext over the wire

---

## Legacy Asset Compatibility

Assets encrypted with old Lit Actions carry their own `actionIpfsId` in protection data. The logic:

1. Read `actionIpfsId` from protection data (PSSH or metadata)
2. If present and non-empty → use that CID (legacy asset uses its own action)
3. If absent/empty → use new universal decrypt CID
4. After Lit Action call, check response `.data`:
   - Decode from base64 to bytes
   - If ≤16 bytes → legacy plaintext CEK, use directly
   - If >16 bytes → ECDH envelope, unwrap using P-256 ECDH

---

## Verification

1. **Build check**: `cd pc2-node && npx tsc --noEmit` — must compile cleanly
2. **Encryption test**: `POST /api/storage/lit/encrypt` with base64 data → verify response includes `kid`, `signature`, `issuer`, `ciphertext`, `dataToEncryptHash`
3. **Non-media decrypt test**: `POST /api/storage/lit/secure-view` with a newly encrypted asset → verify CEK recovery via ECDH envelope works
4. **Media encrypt test**: Upload media via DASH packager → verify PSSH contains new CIDs and `signature`/`issuer` fields
5. **Legacy compatibility**: Test with an existing asset (old `actionIpfsId`) → verify it still decrypts successfully using the legacy action
6. **CEK never plaintext**: Verify no code path logs or transmits the raw CEK between server components
