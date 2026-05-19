# Phase 1: Encryption Path

**Status**: Incomplete (scaffolding landed in `6bf1cddd6`, wiring not done)
**Estimated effort**: ~2 hours
**Files**: `chipotle-client.ts`, `dashPackager.ts`, `storage.ts`

## What `6bf1cddd6` already did

- `EncryptParams` interface: added optional `kid?: string`, `authority?: string`
- `EncryptResult` interface: added optional `issuer?: string`, `signature?: string`
- `encryptWithLitAction()`: CEK bytes → base64 (was UTF-8); parses `hash`/`issuer`/`signature` from response; fallback composite hash computation
- `storage.ts` `/lit/encrypt`: passes raw CEK bytes (was UTF-8 of base64); Datil path removed
- `dashPackager.ts`: `encryptMediaCEK` passes raw CEK bytes

## What's still broken / missing

### 1. `chipotle-client.ts` — encrypt code loader

**Current** (line ~494–510): `getChipotleEncryptCode()` loads `non-media-encrypt-chipotle.js`

**Required**: Load `universal-encrypt-chipotle.js` instead. Add new cached loader:

```typescript
let cachedUniversalEncryptCode: string | null = null;

function getUniversalEncryptCode(): string {
  if (cachedUniversalEncryptCode) return cachedUniversalEncryptCode;
  const actionPath = join(DATA_DIR, 'lit-actions/universal-encrypt-chipotle.js');
  if (!existsSync(actionPath)) {
    throw new Error(`Universal encrypt Lit Action not found at ${actionPath}.`);
  }
  cachedUniversalEncryptCode = readFileSync(actionPath, 'utf8');
  return cachedUniversalEncryptCode;
}
```

Then in `encryptWithLitAction()`, change `getChipotleEncryptCode()` → `getUniversalEncryptCode()`.

### 2. `chipotle-client.ts` — pass `kid`/`authority`/`outputFormat` to jsParams

**Current** (line ~830): `jsParams: { pkpId, plaintext }`

**Required**: 
```typescript
const jsParams: Record<string, unknown> = {
  pkpId,
  plaintext,
  kid: params.kid,           // base64-encoded KID bytes
  authority: params.authority, // hex, 0x-prefixed
  outputFormat: 'hex',
};
```

The universal-encrypt action validates that `kid`, `authority`, and `plaintext` are non-empty and that `pkpId`/`authority` are valid addresses.

### 3. `chipotle-client.ts` — CID constants

Add near the top constants block:

```typescript
const UNIVERSAL_ENCRYPT_CID = 'QmVEz3dDnQD1n96gMd2mFZWXdEDsRiPMumx86qMzhT35gY';
const UNIVERSAL_DECRYPT_CID = 'QmPBjQD7V4aFTZPxUwZ9gDPFJtcJ4SvsJdTh3QexTyRBbj';
```

Export them for use by `dashPackager.ts` and `storage.ts`.

### 4. `dashPackager.ts` — fix `generateCEK()` regression

**Current** (line 99–102, REGRESSED in `6bf1cddd6`):
```typescript
const cek = crypto.randomBytes(16);
const kid = crypto.createHash('sha256').update(cek).digest().subarray(0, 16);
return { cek, kid: kid.toString('hex') };
```

**Required**: KID is independent of CEK:
```typescript
export function generateCEK(): { cek: Buffer; kid: string } {
  const cek = crypto.randomBytes(16);
  const kid = crypto.randomUUID().replace(/-/g, '');
  return { cek, kid };
}
```

### 5. `dashPackager.ts` — pass `kid` and `authority` to `encryptMediaCEK`

**Current** (line 107): `encryptMediaCEK(cek: Buffer)`

**Required**:
```typescript
export async function encryptMediaCEK(cek: Buffer, kid: string): Promise<EncryptResult> {
  // ...
  const result = await encryptWithLitAction({
    dataToEncrypt: cek,
    kid: Buffer.from(kid, 'hex').toString('base64'),
    authority: DEFAULT_AUTHORITY,
    accessControlConditions: conditions,
  });
  // ...
}
```

Update caller in `createEncryptedDASH` to pass `kid`.

### 6. `dashPackager.ts` — update CID constants

```typescript
const MEDIA_DECRYPT_ACTION_CID = 'QmPBjQD7V4aFTZPxUwZ9gDPFJtcJ4SvsJdTh3QexTyRBbj';
const MEDIA_ENCRYPT_ACTION_CID = 'QmVEz3dDnQD1n96gMd2mFZWXdEDsRiPMumx86qMzhT35gY';
```

Or import from `chipotle-client.ts` to keep in sync.

### 7. `storage.ts` — encrypt endpoint: generate KID, pass to encrypt, return in response

**Current** (line ~2231): no KID generation, no kid/authority/signature/issuer in response

**Required** in `POST /lit/encrypt`:
```typescript
// Generate random 256-bit KID for non-media
const kidBytes = crypto.randomBytes(32);
const kidBase64 = kidBytes.toString('base64');
const kidHex = kidBytes.toString('hex');

const chipotleResult = await encryptWithLitAction({
  dataToEncrypt: Buffer.from(cekBase64, 'base64'),
  kid: kidBase64,
  authority: DEFAULT_AUTHORITY,
  accessControlConditions: [],
});

// Return extended response
res.json({
  success: true,
  litCiphertext: chipotleResult.ciphertext,
  dataToEncryptHash: chipotleResult.dataToEncryptHash,
  kid: '0x' + kidHex,
  signature: chipotleResult.signature,
  issuer: chipotleResult.issuer,
  actionCid: effectiveActionCid,
  // ...existing fields...
});
```

## Checklist

- [ ] Add `getUniversalEncryptCode()` loader in `chipotle-client.ts`
- [ ] Switch `encryptWithLitAction` to use `getUniversalEncryptCode()`
- [ ] Pass `kid`, `authority`, `outputFormat: "hex"` in jsParams
- [ ] Add + export `UNIVERSAL_ENCRYPT_CID` and `UNIVERSAL_DECRYPT_CID` constants
- [ ] Fix `generateCEK()` regression in `dashPackager.ts` (random UUID KID)
- [ ] Add `kid` parameter to `encryptMediaCEK()` and pass `kid`/`authority`
- [ ] Update `MEDIA_DECRYPT_ACTION_CID` and `MEDIA_ENCRYPT_ACTION_CID`
- [ ] Update `storage.ts` encrypt endpoint: generate KID, pass to encrypt, return in response
- [ ] `tsc --noEmit` passes
