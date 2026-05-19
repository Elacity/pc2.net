# Phase 3: Unified Decryption Path

**Status**: Not started
**Estimated effort**: ~3 hours
**Depends on**: Phase 2 (ECDH unwrapping utility)
**Files**: `chipotle-client.ts`, `storage.ts`, `media.ts`

## Context

Currently there are three separate decrypt code paths:

1. **Non-media Chipotle** (`recoverNonMediaCEK` in `chipotle-client.ts`):
   loads `non-media-decrypt-chipotle.js`, returns plaintext CEK base64
2. **Media Chipotle** (`recoverMediaCEK` in `media.ts` line ~1369):
   calls `recoverNonMediaCEK` (reuses non-media action for "direct CEK recovery")
3. **Media Datil** (`recoverMediaCEK` in `media.ts` line ~1391):
   generates P-256 keypair, calls Datil SDK with ECDH params, unwraps envelope

All three must be replaced by a single function that calls
`universal-decrypt-chipotle.js` and unwraps the ECDH envelope.

## Implementation

### 1. `chipotle-client.ts` — add `recoverCEKViaEnvelope`

New unified function that replaces `recoverNonMediaCEK`:

```typescript
export async function recoverCEKViaEnvelope(
  params: {
    litCiphertext: string;
    dataToEncryptHash: string;
    kid: string;
    buyerAddress: string;
    actionCid?: string;       // from protection data; empty → use UNIVERSAL_DECRYPT_CID
    authority?: string;
    chain?: string;
    chainId?: number;
    rpc?: string;
    signature?: string;       // from protection data (optional, for integrity check)
    issuer?: string;          // from protection data (optional)
    secureViewSession: SecureViewSessionBundle;
  },
  config?: ChipotleConfig,
): Promise<string> {
  // 1. Determine action CID
  const effectiveCid = params.actionCid || UNIVERSAL_DECRYPT_CID;

  // 2. Generate ephemeral P-256 keypair
  const keyAlg = { name: 'ECDH', namedCurve: 'P-256' } as const;
  const { subtle } = globalThis.crypto;
  const keyPair = await subtle.generateKey(keyAlg, true, ['deriveKey']);
  const rawPubKey = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey));
  const publicKeyHex = Buffer.from(rawPubKey).toString('hex');

  // 3. Fetch Lit Action code by CID (from IPFS, cached)
  const code = await fetchLitActionCode(effectiveCid);

  // 4. Build jsParams
  const jsParams: Record<string, unknown> = {
    keyAlg: { name: 'ECDH', namedCurve: 'P-256' },
    publicKey: publicKeyHex,
    ciphertext: params.litCiphertext,
    dataToEncryptHash: params.dataToEncryptHash,
    kid: params.kid.startsWith('0x') ? params.kid : `0x${params.kid}`,
    pkpId: resolvePkpId(config),
    actionIpfsId: effectiveCid,
    authority: params.authority || DEFAULT_AUTHORITY,
    chain: params.chain || DEFAULT_CHAIN,
    chainId: params.chainId || DEFAULT_CHAIN_ID,
    rpc: params.rpc || getBaseRpcUrl(),
    delegation: params.secureViewSession.delegationCanonical,
    delegationSig: params.secureViewSession.delegationSig,
    request: params.secureViewSession.requestCanonical,
    requestSig: params.secureViewSession.requestSig,
  };

  // Pass integrity fields if available (optional in Lit Action)
  if (params.signature) jsParams.signature = params.signature;
  if (params.issuer) jsParams.issuer = params.issuer;

  // 5. Execute Lit Action
  const result = await executeLitAction({ code, jsParams }, config);

  // 6. Parse response
  let parsed: any;
  try {
    parsed = JSON.parse(result.response);
  } catch {
    throw new Error(`Unparseable decrypt response: ${result.response.substring(0, 200)}`);
  }
  if (parsed.error) {
    throw new Error(`Lit Action denied: ${parsed.error} (code=${parsed.code || 'unknown'})`);
  }

  // 7. Legacy check: if `.data` is short (≤16 bytes raw), treat as plaintext CEK
  const dataB64 = parsed.data || result.response;
  const dataBytes = Buffer.from(dataB64, 'base64');
  if (dataBytes.length <= 16) {
    logger.info(`[Chipotle] Legacy CEK detected (${dataBytes.length} bytes) — returning as-is`);
    return dataB64;
  }

  // 8. ECDH envelope → unwrap
  const cekBase64 = await unwrapECDHEnvelope(dataBytes, keyPair.privateKey, rawPubKey, keyAlg);
  logger.info(`[Chipotle] CEK recovered via ECDH envelope (${dataBytes.length} bytes envelope)`);
  return cekBase64;
}
```

### 2. `chipotle-client.ts` — add `fetchLitActionCode` (IPFS fetcher)

Move and generalize from `media.ts` (line ~1298):

```typescript
const litActionCodeCache = new Map<string, string>();

async function fetchLitActionCode(cid: string): Promise<string> {
  // Check local file first (for actions shipped with the node)
  const localPath = join(DATA_DIR, `lit-actions/${cid}.js`);
  // ... (won't match IPFS CIDs, but covers local overrides)

  const cached = litActionCodeCache.get(cid);
  if (cached) return cached;

  const gateways = [
    `http://localhost:4200/ipfs/${cid}`,
    `https://ipfs.ela.city/ipfs/${cid}`,
    `https://gateway.pinata.cloud/ipfs/${cid}`,
    `https://ipfs.io/ipfs/${cid}`,
  ];

  for (const url of gateways) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const code = (await resp.text()).replace(/\s+$/, '');
        if (code && code.length > 10) {
          litActionCodeCache.set(cid, code);
          return code;
        }
      }
    } catch { /* try next */ }
  }

  // Fallback: try loading universal-decrypt from local disk
  const universalPath = join(DATA_DIR, 'lit-actions/universal-decrypt-chipotle.js');
  if (cid === UNIVERSAL_DECRYPT_CID && existsSync(universalPath)) {
    const code = readFileSync(universalPath, 'utf8').replace(/\s+$/, '');
    litActionCodeCache.set(cid, code);
    return code;
  }

  throw new Error(`Failed to fetch Lit Action code: ${cid}`);
}
```

### 3. `chipotle-client.ts` — deprecate `recoverNonMediaCEK`

Keep as a thin wrapper for any callers that haven't migrated:

```typescript
/** @deprecated Use recoverCEKViaEnvelope instead */
export async function recoverNonMediaCEK(
  params: NonMediaDecryptParams,
  config?: ChipotleConfig,
): Promise<string> {
  return recoverCEKViaEnvelope({
    ...params,
    actionCid: params.actionCid,
    secureViewSession: params.secureViewSession!,
  }, config);
}
```

### 4. `storage.ts` — update `recoverCEKAndFetchData`

In the Chipotle path (line ~2345):

```typescript
if (effectiveBackend === 'chipotle') {
  const { recoverCEKViaEnvelope } = await import('./chipotle-client.js');
  const cekBase64 = await recoverCEKViaEnvelope({
    litCiphertext,
    dataToEncryptHash,
    kid,
    buyerAddress,
    actionCid: actionCid || undefined,  // let it default to UNIVERSAL_DECRYPT_CID if empty
    authority: effectiveAuthority,
    chain: effectiveChain,
    chainId: effectiveChainId,
    rpc: effectiveRpc,
    secureViewSession: params.secureViewSession!,
    // Pass signature/issuer from protection data if available
  });
  cacheCEK(kid, buyerAddress, cekBase64);
  return cekBase64;
}
```

Update `DEFAULT_NON_MEDIA_ACTION_CID`:
```typescript
const DEFAULT_NON_MEDIA_ACTION_CID = 'QmPBjQD7V4aFTZPxUwZ9gDPFJtcJ4SvsJdTh3QexTyRBbj';
```

### 5. `media.ts` — update `recoverMediaCEK`

Replace both Chipotle and Datil paths:

```typescript
async function recoverMediaCEK(litParams, wallet, prebuiltSessionSigs, buyerAddress) {
  const { recoverCEKViaEnvelope } = await import('./chipotle-client.js');
  return recoverCEKViaEnvelope({
    litCiphertext: litParams.litCiphertext,
    dataToEncryptHash: litParams.dataToEncryptHash,
    kid: litParams.kid,
    buyerAddress: buyerAddress || wallet.address,
    actionCid: litParams.actionCid,
    authority: litParams.authority,
    chain: litParams.chain,
    chainId: litParams.chainId,
    rpc: litParams.rpc,
    secureViewSession: litParams.secureViewSession!,
  });
}
```

Remove local `unwrapECDHEnvelope`, `decompressP256Point`, math helpers (moved in Phase 2).
Remove `fetchLitActionCode` (moved to `chipotle-client.ts` in this phase).
Remove Datil SDK code path (dead code).

## Checklist

- [ ] Add `fetchLitActionCode` to `chipotle-client.ts`
- [ ] Add `recoverCEKViaEnvelope` to `chipotle-client.ts` (with P-256 keygen + ECDH unwrap + legacy check)
- [ ] Deprecate `recoverNonMediaCEK` as thin wrapper
- [ ] Update `storage.ts` `recoverCEKAndFetchData` to call `recoverCEKViaEnvelope`
- [ ] Update `storage.ts` `DEFAULT_NON_MEDIA_ACTION_CID` to universal decrypt CID
- [ ] Update `media.ts` `recoverMediaCEK` to call `recoverCEKViaEnvelope`
- [ ] Remove duplicate helpers from `media.ts` (import from `chipotle-client.ts`)
- [ ] Remove `fetchLitActionCode` from `media.ts`
- [ ] Remove dead Datil ECDH code from `media.ts`
- [ ] `tsc --noEmit` passes
- [ ] Verify: no code path logs or transmits raw CEK in plaintext
