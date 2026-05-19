# Phase 4: Protection Data Format Alignment

**Status**: Not started
**Estimated effort**: ~2 hours
**Depends on**: Phase 1 (encrypt returns signature/issuer)
**Files**: `dashPackager.ts`, `storage.ts`

## Context

The protection data format must align with the keystore service. Three locations
in `dashPackager.ts` build the PSSH JSON independently (copy-pasted structure),
and `storage.ts` encrypt response must return the new fields.

### Current format (v2.0)

```json
{
  "protocolVersion": "2.0",
  "protectionType": "cenc:lit-aes-gcm-v3",
  "variant": "eth.web3.clearkey",
  "ciphersuite": "e8582013",
  "data": {
    "authority": "0x...",
    "chainId": 8453,
    "rpc": "...",
    "actionIpfsId": "Qm...",
    "litBackend": "chipotle",
    "ciphertext": "<base64>",
    "hash": "<hex>",
    "kid": "0x..."
  }
}
```

### Target format (v3.0, aligned with keystore service)

```json
{
  "protocolVersion": "3.0",
  "protectionType": "cenc:lit-aes-gcm-v3",
  "variant": "eth.web3.clearkey",
  "data": {
    "actionIpfsId": "QmPBjQD7V4aFTZPxUwZ9gDPFJtcJ4SvsJdTh3QexTyRBbj",
    "litBackend": "chipotle",
    "chainId": 8453,
    "authority": "0x...",
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

### Changes

| Field | Old | New |
|---|---|---|
| `protocolVersion` | `"2.0"` | `"3.0"` |
| `ciphersuite` | `"e8582013"` | **Removed** |
| `data.hash` | `"<hex>"` | Renamed → `data.dataToEncryptHash` |
| `data.ciphertext` encoding | base64 | hex |
| `data.issuer` | — | **Added** (checksummed PKP address) |
| `data.signature` | — | **Added** (hex-encoded) |
| `data.format` | — | **Added** (`"hex"`) |
| `algorithm` (top-level) | — | **Added** (`"AES-128-CBC"` for media, `"AES-256-GCM"` for non-media) |
| `data.actionIpfsId` | old CID | new universal decrypt CID |

## Implementation

### 1. `dashPackager.ts` — update `PSSHProtectionData` interface

```typescript
interface PSSHProtectionData {
  protocolVersion: string;
  protectionType: string;
  variant: string;
  algorithm: string;               // NEW: "AES-128-CBC" for media
  data: {
    actionIpfsId: string;
    litBackend: string;
    chainId: number;
    authority: string;
    rpc: string;
    kid: string;
    dataToEncryptHash: string;      // was "hash"
    ciphertext: string;             // now hex-encoded
    issuer: string;                 // NEW
    signature: string;              // NEW
    format: string;                 // NEW: "hex"
  };
}
// Remove "ciphersuite" field
```

### 2. `dashPackager.ts` — update `buildPSSHJson` (line ~142)

```typescript
function buildPSSHJson(encryptResult: EncryptResult, kid: string): PSSHProtectionData {
  return {
    protocolVersion: '3.0',
    protectionType: 'cenc:lit-aes-gcm-v3',
    variant: 'eth.web3.clearkey',
    algorithm: 'AES-128-CBC',
    data: {
      actionIpfsId: MEDIA_DECRYPT_ACTION_CID,
      litBackend: process.env.LIT_NETWORK || 'chipotle',
      chainId: Number(process.env.CHAIN_ID) || 8453,
      authority: process.env.AUTHORITY || DEFAULT_AUTHORITY,
      rpc: getBaseRpcUrl(),
      kid: kid.startsWith('0x') ? kid : `0x${kid}`,
      dataToEncryptHash: encryptResult.dataToEncryptHash,
      ciphertext: encryptResult.ciphertext,
      issuer: encryptResult.issuer || '',
      signature: encryptResult.signature || '',
      format: 'hex',
    },
  };
}
```

### 3. `dashPackager.ts` — update `injectPSSHBox` (line ~208)

Replace the inline protection data construction (lines 208–223) to call
`buildPSSHJson()` instead of duplicating the structure. Ensures single
source of truth.

### 4. `dashPackager.ts` — update `packageDASH` (line ~360)

Replace the inline protection data construction (lines 360–376) to call
`buildPSSHJson()` for the standalone `pssh-*.json` file write.

### 5. `dashPackager.ts` — update `encryptMediaCEK` return type

Ensure `encryptMediaCEK` returns the full `EncryptResult` including
`signature`, `issuer`, `dataToEncryptHash` so `buildPSSHJson` can use them.

### 6. `dashPackager.ts` — KID in protection data

Currently (line ~146): `kid` is derived from hash: `'0x' + cleanHash.slice(0, 32).padEnd(32, '0')`.

Replace with the independently generated KID from `generateCEK()`:
```typescript
kid: `0x${kid}`,
```

### 7. `storage.ts` — encrypt endpoint response

Update `POST /lit/encrypt` response (line ~2245) to include new fields:

```typescript
res.json({
  success: true,
  litCiphertext: chipotleResult.ciphertext,    // hex
  dataToEncryptHash: chipotleResult.dataToEncryptHash,  // hex
  kid: '0x' + kidHex,
  signature: chipotleResult.signature,          // hex
  issuer: chipotleResult.issuer,                // checksummed address
  actionCid: effectiveActionCid,
  encryptedData: encryptedDataBase64,
  iv: ivBase64,
  litBackend: 'chipotle',
  format: 'hex',
});
```

## Checklist

- [ ] Update `PSSHProtectionData` interface (remove `ciphersuite`, add `algorithm`/`issuer`/`signature`/`format`, rename `hash` → `dataToEncryptHash`)
- [ ] Update `buildPSSHJson` to v3.0 format
- [ ] Refactor `injectPSSHBox` to reuse `buildPSSHJson` (eliminate inline copy)
- [ ] Refactor `packageDASH` to reuse `buildPSSHJson` (eliminate inline copy)
- [ ] Update `encryptMediaCEK` to return full `EncryptResult`
- [ ] Replace hash-derived KID with independent KID in protection data
- [ ] Update `storage.ts` encrypt response with `kid`, `signature`, `issuer`, `format`
- [ ] Verify `actionIpfsId` in protection data points to universal **decrypt** CID
- [ ] `tsc --noEmit` passes
