# Task: Chipotle V3 — Universal Encrypt/Decrypt Alignment

**Task ID**: CHIPOTLE-V3-UNIVERSAL-ACTIONS
**Created**: 2026-05-18
**Status**: InProgress (Phase 1 partially landed in `6bf1cddd6 "1st attempt"`)
**Priority**: **P0 — Security + Architecture** — CEK must never appear in plaintext between components
**Branch**: current HEAD (atop `6bf1cddd6`)
**Owner**: Irzhy + Sasha
**Related**: `SEC-2026-04-28-WAVE8-CHIPOTLE-HARDENING` (predecessor — C-02 kid binding),
`LIT-ACTION-SIGNATURE-AUTH` (predecessor — session delegation),
`docs/core/plans/chipotle_security_alignment.md` (specification)

## TL;DR

The Chipotle Lit Actions have been upgraded to a unified encrypt/decrypt model:

- **Encryption** returns `{ ciphertext, hash, signature, issuer }` with a composite
  hash `SHA-256(CEK ‖ KID ‖ authority)` that replaces the old `KID = sha256(CEK)[0:16]`
  binding.
- **Decryption** wraps the CEK in an ECDH envelope using the requester's
  `sessionPublicKey` instead of returning it as plaintext. The requester
  unwraps locally.
- **Media and non-media use the same actions** — no more separate code paths.

New CIDs:
- Encrypt: `QmVEz3dDnQD1n96gMd2mFZWXdEDsRiPMumx86qMzhT35gY`
- Decrypt: `QmPBjQD7V4aFTZPxUwZ9gDPFJtcJ4SvsJdTh3QexTyRBbj`

The PC2 node must align with these changes. Commit `6bf1cddd6` landed partial
work (Lit Action files + encrypt-path scaffolding) but the decrypt path,
protection data format, CID wiring, and ECDH envelope unwrapping are incomplete.

## Background

### What changed in the Lit Actions

1. **`universal-encrypt-chipotle.js`** (new, replaces `non-media-encrypt-chipotle.js`):
   - Accepts: `plaintext` (base64 CEK), `kid` (base64), `authority` (hex), `pkpId`
   - Computes composite hash: `SHA-256(cekBytes ‖ kidBytes ‖ authorityBytes)`
   - Signs the hash with the PKP's secp256k1 key
   - Encrypts CEK via `Lit.Actions.Encrypt({ pkpId, message: plaintext })`
   - Returns: `{ ciphertext, hash, signature, issuer }` (encoding via `outputFormat`)

2. **`universal-decrypt-chipotle.js`** (new, replaces both `non-media-decrypt-chipotle.js`
   and the old media decrypt):
   - Full session-bundle validation (delegation + request, same as V1.2 sigauth)
   - Recomputes and verifies composite hash binding (CEK ↔ KID ↔ authority)
   - Optional issuer signature verification
   - **Does NOT return plaintext CEK** — wraps it in an ECDH envelope:
     - ECDH key agreement: `deriveKey(pkpPrivateKey, sessionPublicKey)` → AES-CBC-256
     - IV = first 16 bytes of session public key
     - Plaintext layout: `metaLen | issuer(20B) | exp(8B) | audience(20B) | keyCount | cek`
     - Response includes metadata block (compressed PKP pubkey + signature + signer)
   - Supports `keyAlg: { name: "ECDH", namedCurve: "P-256" }` (required) or `{ name: "X25519" }`

### What `6bf1cddd6` ("1st attempt") already changed

| File | What landed | What's missing / broken |
|---|---|---|
| `data/lit-actions/universal-encrypt-chipotle.js` | ✅ Complete | — |
| `data/lit-actions/universal-decrypt-chipotle.js` | ✅ Complete | — |
| `chipotle-client.ts` | `EncryptParams` got `kid?`/`authority?`; `encryptWithLitAction` encodes raw bytes as base64 (was UTF-8), parses `hash`/`issuer`/`signature` from response | Still loads `non-media-encrypt-chipotle.js` not universal; doesn't pass `kid`/`authority` to jsParams; no unified decrypt function; no ECDH envelope unwrapping; no new CID constants |
| `storage.ts` | Encrypt path passes raw CEK bytes; Datil path removed | Decrypt path untouched; default action CID still `bafkrei…` (V1.2 sigauth); no `kid`/`signature`/`issuer` in response |
| `dashPackager.ts` | `encryptMediaCEK` passes raw CEK bytes (was UTF-8) | **REGRESSION**: `generateCEK` reverted to `kid = sha256(cek)[0:16]` (should be random UUID); `MEDIA_DECRYPT_ACTION_CID` not updated; `kid`/`authority` not passed to encrypt; protection data format not updated |
| `media.ts` | — | Completely untouched |

## Requirements

### Must-have

- [ ] **CEK never in plaintext** between Lit Action response and the consuming
      component. All decrypt paths produce an ECDH envelope; the server
      unwraps locally using its ephemeral P-256 private key.
- [ ] **Unified encrypt**: `encryptWithLitAction` calls `universal-encrypt-chipotle.js`
      with `kid`, `authority`, `outputFormat: "hex"`. KID is generated independently
      from CEK.
- [ ] **Unified decrypt**: single function `recoverCEKViaEnvelope` replaces both
      `recoverNonMediaCEK` and the Datil ECDH path in `media.ts`. Generates
      P-256 ephemeral keypair, sends `publicKey` + `keyAlg` to Lit Action,
      receives ECDH envelope, unwraps to raw CEK.
- [ ] **Protection data format** aligned with keystore service:
      `protocolVersion: "3.0"`, `signature`, `issuer`, `format: "hex"`,
      `algorithm` field, no `ciphersuite`.
- [ ] **Legacy asset compatibility**: if `actionIpfsId` is present in protection
      data → use that CID (legacy action); if response `.data` is ≤16 bytes
      raw → treat as legacy plaintext CEK.
- [ ] **CID constants updated**: default decrypt = `QmPBjQD7V4aFTZPxUwZ9gDPFJtcJ4SvsJdTh3QexTyRBbj`,
      encrypt = `QmVEz3dDnQD1n96gMd2mFZWXdEDsRiPMumx86qMzhT35gY`.
- [ ] `keyAlg: { name: "ECDH", namedCurve: "P-256" }` explicitly in all decrypt calls.

### Should-have

- [ ] Documentation: `docs/core/CHIPOTLE_V3_PROTOCOL.md` covering full protocol.
- [ ] `non-media-encrypt-chipotle.js` and `non-media-decrypt-chipotle.js` retained
      on disk but no longer loaded by default (legacy fallback only).

### Out of scope

- Player-side (`media-player/`) changes — handled separately.
- Chipotle allowlist registration for the new CIDs (operational, not code).
- Supernode `ddrm-config.json` updates (deployment step).

## Implementation Plan

See per-phase task files for detailed implementation:

- [x] **Phase 0**: Lit Action files landed — [`PHASE-0-LIT-ACTIONS.md`](./PHASE-0-LIT-ACTIONS.md)
- [ ] **Phase 1**: Encryption path — [`PHASE-1-ENCRYPT.md`](./PHASE-1-ENCRYPT.md)
- [ ] **Phase 2**: ECDH envelope unwrapping — [`PHASE-2-ECDH-UNWRAP.md`](./PHASE-2-ECDH-UNWRAP.md)
- [ ] **Phase 3**: Unified decryption — [`PHASE-3-DECRYPT.md`](./PHASE-3-DECRYPT.md)
- [ ] **Phase 4**: Protection data format — [`PHASE-4-PROTECTION-DATA.md`](./PHASE-4-PROTECTION-DATA.md)
- [ ] **Phase 5**: Documentation — [`PHASE-5-DOCS.md`](./PHASE-5-DOCS.md)

## Acceptance Criteria

1. `cd pc2-node && npx tsc --noEmit` compiles cleanly.
2. `POST /api/storage/lit/encrypt` returns `kid`, `signature`, `issuer`,
   `ciphertext`, `dataToEncryptHash` — all hex-encoded.
3. `POST /api/storage/lit/secure-view` with a newly encrypted non-media asset
   recovers CEK via ECDH envelope (no plaintext CEK in Lit Action response).
4. Media DASH packaging embeds new CIDs, `signature`, `issuer` in PSSH.
5. Existing assets with old `actionIpfsId` still decrypt (legacy compatibility).
6. No code path logs, caches, or transmits the raw CEK in plaintext between
   the Lit Action response and the AES-decrypt call.

## Files Modified

| File | Phase | Change |
|---|---|---|
| `pc2-node/src/api/chipotle-client.ts` | 1,2,3 | New CID constants, universal encrypt loader, `recoverCEKViaEnvelope`, ECDH unwrap |
| `pc2-node/src/api/storage.ts` | 1,3,4 | Encrypt response, decrypt path, default CID, protection data |
| `pc2-node/src/services/media/dashPackager.ts` | 1,4 | CID updates, independent KID, protection data format |
| `pc2-node/src/api/media.ts` | 2,3 | Extract ECDH helpers, unified decrypt, remove Datil path |

## Files Created

| File | Phase | Purpose |
|---|---|---|
| `docs/core/CHIPOTLE_V3_PROTOCOL.md` | 5 | Full protocol documentation |
| `.cursor/tasks/CHIPOTLE-V3-UNIVERSAL-ACTIONS/*.md` | — | This task + phase docs |

## Hard Constraints

- Do NOT delete `non-media-encrypt-chipotle.js` or `non-media-decrypt-chipotle.js`
  from disk — existing delegations may reference them.
- Do NOT change the ECDH envelope wire format — the player-side decoder must
  stay compatible.
- Do NOT log CEK bytes, CEK base64, or CEK hex at any log level.
- Do NOT accept `rpc` from client/PSSH — always use `getBaseRpcUrl()` (M-01 fix).

## Status History

| Date | Status | Note |
|---|---|---|
| 2026-05-18 | InProgress | `6bf1cddd6` landed Lit Action files + partial encrypt scaffolding |
| 2026-05-18 | InProgress | Task doc + phase breakdown created |
