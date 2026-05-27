# SEC-DRM-HARDENING-2026-05 — Implementation Plan

**Audit source:** `docs/analysis/audit-security-drm-2026-05-21.md`  
**Scope of this session:** C-2, M-1, D-2  
**Out of scope this session:** C-1, M-2 (deferred), H-1 (accepted), H-2 (infra), D-1 (full redesign)

---

## Task 1 — C-2: Remove `coveredAddresses`, enforce owner-is-signer

### Context

The Lit Action currently accepts any `coveredAddresses[]` without requiring the signer to have a relationship to those addresses. Fix: the recovered signer (`ecrecover(delegationRaw, delegationSig)`) must equal `del.ownerAddress`; then `hasAccessByContentId` is called for:
1. `ownerAddress` (the EOA)
2. The deterministic smart account address derived from `ownerAddress`

### Delegation structure analysis after this change

#### Design intent (important context)

The delegation and the request have **different scopes by design**:

- **Delegation** — session-level authorization. The user's wallet signs once and authorizes an ephemeral keypair for the entire session window (up to 24 hours). The delegation is intentionally NOT content-specific: it does not name a `kid`. It grants the session key the right to request decryption for any content the user has access to during that window.

- **Request** — per-asset. The ephemeral session key signs a fresh bundle per piece of content, including the `kid` (content ID), a timestamp, and a nonce. The TEE's `hasAccessByContentId(ownerAddress, kid)` call is the actual per-content gate — enforced on every individual request regardless of the delegation window.

This split avoids requiring the user's hot wallet to sign each individual content access, while keeping the TEE as the binding enforcement point for per-content access.

**Fields that remain relevant after C-2 fix:**

| Field | Scope | Why still needed |
|-------|-------|-----------------|
| `domain` | delegation | Domain-separation prevents cross-protocol replay |
| `ownerAddress` | delegation | The address we ecrecover against AND call `hasAccessByContentId` with per-request |
| `sessionPublicKey` | delegation | Binds the session: hot wallet signs once, ephemeral key signs every request |
| `actionIpfsId` | delegation | Pins the session to a specific Lit Action CID — prevents reuse with a different (potentially malicious) action |
| `chainId` | delegation | Prevents cross-chain replay |
| `issuedAt` / `expiresAt` | delegation | Temporal bounds for the session window |
| `nonce` | delegation | Server-side revocation handle |
| `kid` | **request only** | Content-specific binding — lives here, never in the delegation |
| `requestedAt` | **request only** | Per-request freshness (60-second window) |
| `requestNonce` | **request only** | Per-request single-use (server-side, best-effort) |

**Fields that are removed:**

| Field | Status |
|-------|--------|
| `coveredAddresses` | **Removed** — the on-chain check is now against the recovered `ownerAddress` directly; no multi-address fan-out needed |

**Is the two-layer structure still justified after C-2?**  
Yes, more clearly than before. The delegation correctly represents "I authorize this session key to act as me" and nothing more specific than that. Per-content access control is entirely the TEE's responsibility via `hasAccessByContentId`. The two layers remain distinct and non-redundant: one is an identity delegation, the other is a content-access request.

### Smart account resolution

Add `resolveSmartAccountAddress(ownerAddress, rpcUrl)` in the Lit Action. It derives the ERC-4337 counterfactual smart account address for a given EOA using the factory at the registered chain. The access check then becomes:

```
EOA_hasAccess  = hasAccessByContentId(ownerAddress, kid)
SA_hasAccess   = hasAccessByContentId(smartAccountAddress, kid)
authorized     = EOA_hasAccess || SA_hasAccess
```

The `authorizedAddress` returned in the response is whichever of the two passed first.

The `resolveSmartAccountAddress` function is deterministic (counterfactual — no deployment needed). It calls `eth_call` against the factory contract. Chain-specific addresses:

```js
const CONTRACT_ADDRS = {
  8453: {
    factory:    "0xb3f15a44f91a08a93a11c6fbf6a4933c623275fe",
    entryPoint: "0xba418fa699622de824b258c61eb150ed7a13967b",
  },
};
```

If `chainId` is not in the map, fall back to `ownerAddress` (EOA only). This is safe: unsupported chains don't have smart accounts deployed so the EOA check is sufficient.

### Files to change

1. **`pc2-node/data/lit-actions/universal-decrypt-chipotle.js`**
   - Add `resolveSmartAccountAddress(ownerAddress, rpcUrl)` function
   - In `main()`: remove `coveredAddresses` check; after ecrecover succeeds:
     ```js
     const smartAcct = await resolveSmartAccountAddress(del.ownerAddress, rpc);
     const eoaOk  = await gateway.hasAccessByContentId(toChecksum(del.ownerAddress), normalizedKid);
     const saOk   = eoaOk ? false : await gateway.hasAccessByContentId(toChecksum(smartAcct), normalizedKid);
     if (!eoaOk && !saOk) return deny("access_denied");
     authorizedAddress = eoaOk ? toChecksum(del.ownerAddress) : toChecksum(smartAcct);
     ```
   - Remove `no_covered_addresses` deny path

2. **`pc2-node/src/utils/secureViewSession.ts`**
   - `SecureViewDelegation`: remove `coveredAddresses` field
   - `buildDelegationPayload()`: remove `coveredAddresses` parameter and output
   - `verifySecureViewBundle()`: remove `coveredAddresses` structural check; add a note that on-chain check is now purely ownerAddress-based (done in Lit Action)

3. **`pc2-node/src/api/chipotle-client.ts`** — `recoverCEKWithServerSession()`
   - **NOTE:** After the C-2 fix the server-session path breaks because the ephemeral `ownerAddress` has no on-chain access. **Do not remove `coveredAddresses` from the server-session delegation yet.** The server path needs D-1 redesign first (separate task). For now:
     - Add a JSDoc warning on `recoverCEKWithServerSession` noting it is incompatible with the new Lit Action until D-1 is resolved
     - The client-side delegation path (browser-signed) is the primary path after C-2

4. **`pc2-node/data/lit-actions/non-media-decrypt-chipotle.js`** (if it shares the same access-gate pattern)
   - Apply the same `coveredAddresses` removal and smart-account resolution if present

---

## Task 2 — M-1: Random IV for AES-CBC envelope

### Context

The current IV is `sessionPublicKey.subarray(0, 16)` — fixed and public. Fix: generate a fresh random 16-byte IV per `envelopeCEK` call and embed it in the response envelope so the client can read it.

### Wire format change

The envelope METADATA block gains a `iv[16]` field. Placement: immediately after the ephemeral public key entry, before the signature. This keeps the signature covering the encrypted body but does not require changing the signature computation (it already signs over `encryptedCek` only).

**Before:**
```
HEADER   [4]
METADATA  pkLen[2] + pk[33] + sigLen[2] + sig[65] + signer[33]
BODY      bodyLen[4] + encryptedBody[N]
```

**After:**
```
HEADER   [4]
METADATA  pkLen[2] + pk[33] + iv[16] + sigLen[2] + sig[65] + signer[33]
BODY      bodyLen[4] + encryptedBody[N]
```

The IV is always exactly 16 bytes so no length prefix is needed.

### Files to change

1. **`pc2-node/data/lit-actions/universal-decrypt-chipotle.js`** — `envelopeCEK()`
   - Replace `const iv = pubKeyBuff.subarray(0, 16)` with `const iv = crypto.getRandomValues(new Uint8Array(16))`
   - Add `iv` between `ephemeralPublicKey` and `sig` in the `concatBytes(...)` response builder

2. **`pc2-node/src/api/chipotle-client.ts`** — `unwrapECDHEnvelope()`
   - After reading `ephPubKeyLen + ephPubKeyRaw`, read `iv = envelope.subarray(offset, offset + 16); offset += 16`
   - Use this `iv` for `subtle.decrypt({ name: 'AES-CBC', iv })` instead of `ourRawPubKey.slice(0, 16)`
   - **This is a breaking wire-format change** — both sides must be deployed together

### Compatibility note
This change makes the envelope format version 2. Any client that receives an envelope from a Lit Action running the new code must also run the new `unwrapECDHEnvelope`. Since the Lit Action and the PC2 node are deployed together (Lit Action CID changes on redeploy), there is no cross-version compatibility concern in normal operation. Legacy envelopes (AES-CBC keyed by pubkey IV) will fail gracefully with a PKCS7 padding error — that is acceptable.

---

## Task 3 — D-2: Reduce server-session delegation TTL

### Context

`recoverCEKWithServerSession()` sets `expiresAt: now + 3600`. Because the delegation is session-scoped (not content-specific), a leaked session private key gives access to **every content item the user has rights to**, not just one. At one request per 60 seconds over an hour, that is up to 60 assets exposed per leaked key. For the server-initiated streaming use case, a per-stream window of 5 minutes is sufficient and limits blast radius to 5 assets maximum.

### File to change

**`pc2-node/src/api/chipotle-client.ts`** — `recoverCEKWithServerSession()`

```ts
// line ~1038 — BEFORE
expiresAt: now + 3600,

// AFTER
expiresAt: now + 300,  // 5-minute window for server-initiated sessions
```

### Note
This does not fix D-1 (the server acts as both owner and session holder). It reduces the blast radius if the ephemeral key leaks. The full D-1 fix (use buyer-signed delegation or on-chain operator registry) is a separate task.

---

## D-1 Redesign Note (out of scope this session)

The server-session path (`recoverCEKWithServerSession`) uses a random ephemeral wallet as `ownerAddress`. After the C-2 fix, this wallet has no on-chain access and the Lit Action will deny it.

**Recommended long-term fix (Option B):**

Eliminate the server-session path. The streaming endpoint issues a challenge; the browser wallet signs a delegation; the server stores it and uses it for subsequent Lit calls on behalf of that session. This is the pure Option-C design.

**Short-term mitigation until Option B is built:**

Keep `coveredAddresses` in the Lit Action but only honour it when `ownerAddress` matches a registered PC2 server operator key (hardcoded in the Lit Action or checked via `isAuthorizedOperator(operator, kid)` on the `authority` contract). This scope-limits the forgery attack to compromised PC2 server keys rather than any arbitrary keypair.

---

## Execution order

1. M-1 first (wire format is self-contained, no on-chain dependency)
2. C-2 (Lit Action + TypeScript types)
3. D-2 (one-liner TTL change)
4. Manual test: use `tools/lit-direct-decrypt.mjs` or equivalent to verify decryption end-to-end with the new envelope format
