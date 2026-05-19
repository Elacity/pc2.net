# Phase 0: Lit Action Files

**Status**: ✅ Done (landed in `6bf1cddd6`)

## What was done

Both universal Lit Action files were created and committed:

- `pc2-node/data/lit-actions/universal-encrypt-chipotle.js` (94 lines)
- `pc2-node/data/lit-actions/universal-decrypt-chipotle.js` (587 lines)

These are the new Lit Action source files that Chipotle executes inside the TEE.
They are complete and require no further changes.

## Encrypt action summary

Inputs: `plaintext` (base64 CEK), `kid` (base64), `authority` (hex), `pkpId`, `outputFormat`

1. Validates inputs (pkpId, authority must be valid addresses; kid + plaintext non-empty)
2. Decodes CEK, KID, authority to bytes
3. Computes composite: `SHA-256(cekBytes ‖ kidBytes ‖ authorityBytes)`
4. Signs composite hash with PKP's secp256k1 key
5. Encrypts CEK via `Lit.Actions.Encrypt({ pkpId, message: plaintext })`
6. Returns `{ ciphertext, hash, signature, issuer }` encoded per `outputFormat`

## Decrypt action summary

Inputs: session bundle (delegation, delegationSig, request, requestSig),
`ciphertext`, `dataToEncryptHash`, `kid`, `pkpId`, `authority`, `chainId`,
`rpc`, `actionIpfsId`, `keyAlg`, `publicKey` (session P-256 pub hex)

1. Validates + verifies session bundle (identical to V1.2 sigauth)
2. On-chain access check via `hasAccessByContentId`
3. Decrypts CEK via `Lit.Actions.Decrypt({ pkpId, ciphertext })`
4. Recomputes `SHA-256(cekBytes ‖ kidBytes ‖ authorityBytes)` — must match `dataToEncryptHash`
5. Optional issuer signature verification
6. Wraps CEK in ECDH envelope via `envelopeCEK()`:
   - ECDH(pkpPrivateKey, sessionPublicKey) → AES-CBC-256 shared key
   - IV = sessionPublicKey[0..15]
   - Encrypts rawLicenseBytes (metadata + CEK)
   - Signs encrypted body with PKP secp256k1
7. Returns `{ data: base64(envelope), byteLength, authorizedAddress }`
