# Phase 5: Protocol Documentation

**Status**: Not started
**Estimated effort**: ~1 hour
**Depends on**: Phases 1–4 (all code changes complete)
**Files**: `docs/core/CHIPOTLE_V3_PROTOCOL.md` (new)

## Context

Document the full Chipotle v3 unified encrypt/decrypt protocol so future
developers understand the wire format, key generation, ECDH envelope
unwrapping, legacy compatibility, and protection data structure.

## Target file

`docs/core/CHIPOTLE_V3_PROTOCOL.md`

## Sections to cover

### 1. Overview

- Unified encrypt/decrypt — single pair of Lit Actions for all content types
- New CIDs: encrypt `QmVEz3dDnQD1n96gMd2mFZWXdEDsRiPMumx86qMzhT35gY`, decrypt `QmPBjQD7V4aFTZPxUwZ9gDPFJtcJ4SvsJdTh3QexTyRBbj`
- CEK never transmitted in plaintext — ECDH envelope on decrypt response

### 2. Key generation

- **Media**: 128-bit CEK (`crypto.randomBytes(16)`), 128-bit KID (`crypto.randomUUID()` sanitised to hex)
- **Non-media**: 256-bit CEK, 256-bit KID (`crypto.randomBytes(32)`)
- KID is independent of CEK (no hash derivation)

### 3. Encryption flow

- Inputs: plaintext (base64 CEK), kid (base64), authority (hex), pkpId
- Composite hash: `SHA-256(cekBytes || kidBytes || authorityBytes)`
- PKP signs composite hash (secp256k1)
- Lit encrypts CEK with PKP AES
- Response: `{ ciphertext, hash, signature, issuer }` — hex-encoded
- `outputFormat: "hex"` in jsParams

### 4. Decryption flow

- Requester generates ephemeral P-256 keypair
- Sends `publicKey` (hex) + `keyAlg: { name: "ECDH", namedCurve: "P-256" }` to Lit Action
- Lit Action validates session bundle, checks on-chain access, verifies composite hash
- Returns ECDH envelope (not plaintext CEK)
- Server unwraps envelope locally via `unwrapECDHEnvelope`

### 5. ECDH envelope wire format

```
HEADER  (4 B)
  format3[3]   "raw" (null-padded)
  flag  [1]    0x02

METADATA
  pkLen [2]    u16be — PKP compressed P-256 public key length (33)
  pk    [33]   PKP compressed P-256 public key
  sigLen[2]    u16be — ECDSA signature length (65)
  sig   [65]   secp256k1 sig over SHA-256(encryptedBody): r||s||v
  signer[33]   PKP compressed secp256k1 public key

BODY
  bodyLen[4]   u32be — encrypted body length
  encryptedBody[N]
    AES-CBC-256, key = ECDH(pkpKey_P256, sessionPubKey_P256)
    IV = sessionPubKey bytes [0..15]

    Plaintext layout:
      metaLen [4]   u32be
      issuer  [20]  issuer address bytes
      exp     [8]   u64be Unix timestamp
      audience[20]  audience address bytes
      keyCount[4]   u32be(1)
      cek     [16|32]  raw AES content-encryption key
```

### 6. Protection data format (v3.0)

- Full JSON schema with field descriptions
- Differences from v2.0 (removed `ciphersuite`, added `signature`/`issuer`/`format`/`algorithm`, protocolVersion → "3.0")
- `algorithm` field: `"AES-128-CBC"` for media, `"AES-256-GCM"` for non-media

### 7. Legacy asset compatibility

- If `actionIpfsId` present in protection data → use that CID (legacy action)
- If decrypt response `.data` decodes to ≤16 bytes → legacy plaintext CEK, skip ECDH unwrap
- Old Lit Action files (`non-media-encrypt/decrypt-chipotle.js`) retained on disk

### 8. Security properties

- CEK never in plaintext between Lit Action TEE and consuming component
- Composite hash binds CEK + KID + authority — prevents substitution
- PKP signature provides non-repudiation (issuer verification)
- Ephemeral P-256 keypair per decrypt request — forward secrecy
- Session bundle delegation + per-asset signed request
- `rpc` always from server config (`getBaseRpcUrl()`), never from client/PSSH

### 9. SecureView session delegation

- 24h wallet-signed delegation
- Per-asset ephemeral P-256 signed request
- Fields: `delegationCanonical`, `delegationSig`, `requestCanonical`, `requestSig`

## Checklist

- [ ] Create `docs/core/CHIPOTLE_V3_PROTOCOL.md`
- [ ] Cover all 9 sections above
- [ ] Cross-reference from `docs/core/plans/chipotle_security_alignment.md`
- [ ] Review for accuracy against final implementation
