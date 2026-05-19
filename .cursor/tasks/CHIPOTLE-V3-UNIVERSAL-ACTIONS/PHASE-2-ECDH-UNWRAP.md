# Phase 2: ECDH Envelope Unwrapping (shared utility)

**Status**: Not started
**Estimated effort**: ~2 hours
**Files**: `chipotle-client.ts` (target), `media.ts` (source of existing helpers)

## Context

The universal-decrypt Lit Action returns the CEK wrapped in an ECDH envelope.
The server must unwrap it to recover the raw CEK for AES decryption.

`media.ts` already has a working `unwrapECDHEnvelope()` (line ~1455) plus
`decompressP256Point()`, `bigintToBytes32()`, `modPow()`, `modSqrt()` helper
functions (lines ~1538–1598). These must be extracted to `chipotle-client.ts`
so both media and non-media decrypt paths can reuse them.

## Envelope wire format (from universal-decrypt-chipotle.js)

```
HEADER  (4 B)
  format3[3]   "raw" (null-padded)
  flag  [1]    0x02

METADATA
  pkLen [2]    u16be — byte length of PKP compressed P-256 public key (33)
  pk    [33]   PKP compressed P-256 public key (ECDH counterpart)
  sigLen[2]    u16be — byte length of ECDSA signature (65)
  sig   [65]   secp256k1 sig over SHA-256(encryptedBody): r‖s‖v
  signer[33]   PKP compressed secp256k1 public key

BODY
  bodyLen[4]   u32be — byte length of encryptedBody
  encryptedBody[N]
    AES-CBC-256, key = ECDH(pkpKey_P256, sessionPubKey_P256)
    IV = sessionPubKey bytes [0..15]

    Plaintext layout:
      metaLen [4]   u32be — byte length of metadata block
      issuer  [20]  issuer Ethereum address bytes
      exp     [8]   u64be Unix timestamp
      audience[20]  audience Ethereum address bytes
      keyCount[4]   u32be(1)
      cek     [16]  raw AES content-encryption key (media) or [32] (non-media)
```

## Implementation

### 1. Extract helpers from `media.ts` to `chipotle-client.ts`

Move these functions (they have no media-specific dependencies):

```typescript
// Already in media.ts — move to chipotle-client.ts
function decompressP256Point(compressed: Uint8Array): Uint8Array { ... }
function bigintToBytes32(n: bigint): Uint8Array { ... }
function modPow(base: bigint, exp: bigint, mod: bigint): bigint { ... }
function modSqrt(a: bigint, p: bigint): bigint { ... }
```

### 2. Add `unwrapECDHEnvelope` to `chipotle-client.ts`

Adapt from `media.ts:unwrapECDHEnvelope` (line ~1455). The key difference:
non-media CEK may be 32 bytes (not always 16). Parse `keyCount` and read
the correct number of key bytes from the decrypted payload.

```typescript
export async function unwrapECDHEnvelope(
  envelope: Buffer,
  privateKey: CryptoKey,
  ourRawPubKey: Uint8Array,
  keyAlg: { name: string; namedCurve: string },
): Promise<string> {
  let offset = 4; // skip header

  // Read ephemeral public key
  const ephPubKeyLen = (envelope[offset] << 8) | envelope[offset + 1];
  offset += 2;
  const ephPubKeyRaw = envelope.subarray(offset, offset + ephPubKeyLen);
  offset += ephPubKeyLen;

  // Skip signature + signer
  const sigLen = (envelope[offset] << 8) | envelope[offset + 1];
  offset += 2 + sigLen + 33;

  // Read encrypted body
  const encCekLen = (envelope[offset] << 24) | (envelope[offset + 1] << 16) |
    (envelope[offset + 2] << 8) | envelope[offset + 3];
  offset += 4;
  const encryptedCek = envelope.subarray(offset, offset + encCekLen);

  // Decompress PKP public key if compressed
  const litPubKeyUncompressed = (ephPubKeyRaw[0] === 0x02 || ephPubKeyRaw[0] === 0x03)
    ? decompressP256Point(ephPubKeyRaw)
    : new Uint8Array(ephPubKeyRaw);

  // Import PKP ephemeral P-256 public key
  const { subtle } = globalThis.crypto;
  const litPubKey = await subtle.importKey(
    'raw', litPubKeyUncompressed,
    { name: keyAlg.name, namedCurve: keyAlg.namedCurve }, false, [],
  );

  // Derive shared AES-CBC-256 key
  const sharedKey = await subtle.deriveKey(
    { name: keyAlg.name, namedCurve: keyAlg.namedCurve, public: litPubKey } as any,
    privateKey,
    { name: 'AES-CBC', length: 256 }, false, ['decrypt'],
  );

  // IV = first 16 bytes of OUR raw public key
  const iv = ourRawPubKey.subarray(0, 16);

  // Decrypt body
  const decrypted = new Uint8Array(
    await subtle.decrypt({ name: 'AES-CBC', iv }, sharedKey, encryptedCek),
  );

  // Parse rawLicenseBytes: metadataSize(u32) | metadata | keyCount(u32) | keys
  const metaSize = (decrypted[0] << 24) | (decrypted[1] << 16) |
    (decrypted[2] << 8) | decrypted[3];
  const bodyOffset = 4 + metaSize;
  const keyCount = (decrypted[bodyOffset] << 24) | (decrypted[bodyOffset + 1] << 16) |
    (decrypted[bodyOffset + 2] << 8) | decrypted[bodyOffset + 3];
  const cekStart = bodyOffset + 4;

  // Read all key bytes (16 for media, 32 for non-media, keyCount * keySize)
  // The total remaining bytes after keyCount are the keys
  const cekBytes = decrypted.subarray(cekStart);
  const result = Buffer.from(cekBytes).toString('base64');

  // Zero sensitive memory
  decrypted.fill(0);
  return result;
}
```

### 3. Update `media.ts` to import from `chipotle-client.ts`

Replace the local `unwrapECDHEnvelope`, `decompressP256Point`, and math helpers
with imports from `chipotle-client.ts`. The existing Datil path in `recoverMediaCEK`
can call the shared function.

## Checklist

- [ ] Move `decompressP256Point`, `bigintToBytes32`, `modPow`, `modSqrt` to `chipotle-client.ts`
- [ ] Add `unwrapECDHEnvelope` to `chipotle-client.ts` (adapted from `media.ts`)
- [ ] Export all five functions
- [ ] Update `media.ts` to import from `chipotle-client.ts` instead of local copies
- [ ] Verify media Datil path still works with shared function
- [ ] `tsc --noEmit` passes
