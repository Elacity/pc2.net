# dDRM Security Audit — Lit Action Decryption Workflow

**Date:** 2026-05-21  
**Scope:** `universal-decrypt-chipotle.js`, `chipotle-client.ts`, `secureViewSession.ts`  
**Author:** Security review session  
**Status:** Findings documented; remediation plan at `.cursor/tasks/SEC-DRM-HARDENING-2026-05/`

---

## 1. System Overview

The dDRM decryption workflow runs in two layers:

1. **PC2 node (server)** — validates the session bundle, builds jsParams, calls `executeLitAction` via the Elacity proxy.
2. **Lit TEE (universal-decrypt-chipotle.js)** — verifies cryptographic proofs, calls `hasAccessByContentId` on-chain, decrypts the CEK with the PKP, and returns it wrapped in an ECDH envelope.

The Lit Action is the only true security boundary. PC2-side checks are defence-in-depth; they save cost but cannot be relied on for security guarantees.

### Session model (two-layer design)

The auth bundle is split into two distinct cryptographic objects with different scopes:

**Delegation** (session-level, signed by the user's connected wallet):
> "I, [ownerAddress], authorize [sessionPublicKey] to request content decryption on my behalf, using [actionIpfsId] on [chainId], until [expiresAt]."

The delegation is intentionally **not content-specific**. It authorizes the ephemeral key to make requests for any content the user has access to. It is produced once per session window (up to 24 hours) and can be reused across multiple content requests during that window.

**Request** (per-asset, signed by the ephemeral session key):
> "I, [sessionKey], request decryption of content [kid] at [requestedAt]."

The request is per-asset. The `kid` (content ID) lives here, not in the delegation. Each request carries a fresh timestamp and nonce to limit replay. The session key signs these at access time without requiring the user's hot wallet to be involved again.

The Lit Action threads these together: it verifies the delegation's signature (hot wallet), the request's signature (session key), and then calls `hasAccessByContentId(ownerAddress, kid)` to enforce the per-content access gate — that gate is the only content-specific control. The two-layer design avoids requiring the user's wallet to sign each individual content access, while keeping the TEE as the binding enforcement point.

---

## 2. Findings

### C-1 — Envelope ECDSA signature is parsed but never verified
**Severity:** Critical (deferred — document for later)  
**Status:** Not fixed in this session. Logged for a future task.

#### What happens
`envelopeCEK()` (Lit Action, lines 376–396) produces a secp256k1 ECDSA signature over `encryptedCek` using the PKP's private key and embeds it as `(sig[65] + signer[33])` in the METADATA block. This signature is the only integrity seal on the encrypted body.

`unwrapECDHEnvelope()` (`chipotle-client.ts:1158–1162`) reads `sigLen`, then skips both `signature` and `signer` entirely:
```ts
const sigLen = (envelope[offset] << 8) | envelope[offset + 1];
offset += 2;
offset += sigLen;     // signature bytes — skipped
offset += 33;         // signer compressed pubkey — skipped
```
No `verify()` call is ever made.

#### Impact
Anyone who can modify the response between the Lit proxy (`europe-west1-elacity.cloudfunctions.net/chipotle-proxy`) and the PC2 node can tamper with the encrypted body. AES-CBC has no authentication, so a crafted ciphertext either decrypts to garbage or raises a PKCS7 padding error — neither of which signals "tampered." A padding oracle against `subtle.decrypt` timing is theoretically reachable.

#### Entrypoints for when this is resumed
- **Lit Action write path:** `envelopeCEK()` — `universal-decrypt-chipotle.js:376`
- **Client read path (signature field):** `unwrapECDHEnvelope()` — `chipotle-client.ts:1158`
- **Fix location:** Add `secp256k1.verify(sha256(encryptedCek), sig, signer)` before the `deriveKey` call; assert `signer === pkpCompressedKey`.

#### Also deferred: M-2 — CEK envelope expiry and audience fields never validated
- `rawLicenseBytes()` writes `exp = now + 4h`, `audience = authorizedAddress`, `issuer = pkpId bytes` into the plaintext.
- `unwrapECDHEnvelope()` reads `metaSize` then jumps directly to `keyCount` and raw key bytes — `exp`, `audience`, `issuer` are never checked.
- **Entrypoint:** `unwrapECDHEnvelope()` — `chipotle-client.ts:1209`.
- **Fix:** After decryption, assert `exp > Date.now()/1000`, `audience === buyerAddress`, `issuer === expectedPkpIdBytes`.

---

### C-2 — `coveredAddresses` not bound to `ownerAddress` — delegation forgery
**Severity:** Critical  
**Status:** Fixed in this session. See plan.

#### What happens
The access gate (Lit Action, lines 519–534) iterates `del.coveredAddresses` and calls `hasAccessByContentId(addr, kid)` for each. `ownerAddress` and `coveredAddresses` have no verified relationship — any caller can put Alice's address in `coveredAddresses` with a random `ownerAddress`, and if Alice holds the access NFT the gate passes.

```js
// BEFORE (vulnerable)
for (const addr of del.coveredAddresses) {
  const ok = await gateway.hasAccessByContentId(toChecksum(addr), normalizedKid);
  if (ok) { authorizedAddress = toChecksum(addr); break; }
}
```

#### Fix
Remove `coveredAddresses`. Recover the signer from `delegationSig` (ecrecover / EIP-1271 already done in step 4). Assert `recovered === del.ownerAddress`. Check `hasAccessByContentId` against both the EOA (`ownerAddress`) and its deterministic smart account address (computed via `resolveSmartAccountAddress`). See plan for details.

---

### H-1 — No TEE-side nonce replay prevention; 60-second cross-node replay window
**Severity:** High  
**Status:** Acknowledged / accepted. No fix planned.

#### What happens
The Lit Action enforces `|now − requestedAt| ≤ 60 s` but holds no state between invocations. A captured `(requestRaw, requestSig)` can be replayed against any Lit node within that 60-second window. The server-side `seenRequestNonces` map (`secureViewSession.ts:374`) is per-process and invisible to the TEE.

#### Why no fix
The Lit TEE has no shared persistent state; fixing this would require external state (a distributed cache that the Lit Action can read via a fetch call), which introduces latency and an additional trust dependency. The 60-second window is deemed acceptable for the current threat model. The server-side nonce map provides best-effort protection for same-node replays. The `requestNonce` field is retained for future use if a Lit-readable nonce store is introduced.

---

### H-2 — `rejectUnauthorized: false` on supernode provision fetch
**Severity:** High  
**Status:** Deferred / out of scope.

#### What happens
`httpsGet()` (`chipotle-client.ts:327`) fetches provision config from hardcoded supernode IPs with TLS certificate validation disabled:
```ts
https.get(url, { rejectUnauthorized: false, timeout: timeoutMs }, ...)
```
The Ed25519 envelope signature (`verifyProvisionSignature`) provides application-layer integrity, but the disabled TLS exposes the connection to passive observation and potential stale-envelope replay.

#### Why deferred
The supernodes currently use self-signed certificates. `rejectUnauthorized: false` was set intentionally to prevent failures during the certificate rollout. Once valid certificates are in place, this should be removed.

**Future fix entrypoint:** `httpsGet()` — `chipotle-client.ts:325`. Remove `rejectUnauthorized: false`; optionally pin the supernode certificate fingerprint as an intermediate step.

---

### M-1 — AES-CBC with fixed, predictable IV
**Severity:** Medium  
**Status:** Fixed in this session. See plan.

#### What happens
```js
// Lit Action, line 369
const iv = pubKeyBuff.subarray(0, 16);
```
The IV is the first 16 bytes of the session P-256 public key, which is transmitted in plaintext in `del.sessionPublicKey`. For a given session, every CEK envelope uses the same IV. The `rawLicenseBytes` plaintext has a deterministic prefix (`metadataSize | issuer | exp | audience | keyCount`), so an observer can confirm prefix equality across envelopes.

Combined with C-1 (skipped integrity check), a tampered ciphertext is undetectable.

#### Fix
Generate a fresh 16-byte random IV per encryption inside `envelopeCEK`. Embed it as a fixed 16-byte field in the envelope header or metadata so the client can read it during `unwrapECDHEnvelope`. See plan for the wire-format change.

---

### D-1 — Server-session path collapses owner/session trust model (incompatible with C-2 fix)
**Severity:** Design / blocking for C-2 server path  
**Status:** Partial fix in this session (TTL reduction). Full redesign is a separate task.

#### What happens
`recoverCEKWithServerSession()` (`chipotle-client.ts:987`) creates a random ephemeral wallet as `ownerAddress`, puts `buyerAddress` in `coveredAddresses`, and signs the delegation with the random wallet. The Lit Action currently trusts any signer to represent any covered address.

After the C-2 fix removes `coveredAddresses`, this path breaks: the recovered signer is a random key with no on-chain access.

#### Proposed path forward
Three options, in order of increasing security:

**Option A (short-term, this session):** Keep server-session path working by using a registered **PC2 server operator key** as `ownerAddress`. The key is a dedicated server-side secp256k1 key (not ephemeral). A new on-chain `hasAuthorizedOperator(operator, buyer, kid)` check in the Lit Action (or on the `authority` contract) would confirm the operator is entitled to act for `buyer`. The operator key replaces the throwaway ephemeral wallet.

**Option B (medium-term):** The streaming endpoint requires the browser to sign the delegation. The server issues a challenge; the browser wallet signs; the server stores the delegation for the session. The server-session path is eliminated. This aligns with the intended Option-C design.

**Option C (long-term):** On-chain operator registry. An `AuthorizedOperators` contract maps `(operator, buyer) → bool`. The Lit Action checks this if `coveredAddresses` is supplied by a registered operator. Buyers opt-in by calling `authorizeOperator(pcServerAddress)`.

**For this session:** Reduce server-session delegation TTL to 5 minutes (D-2), and document that the server-session path requires the separate D-1 redesign before it can be compatible with the C-2 fix.

---

### D-2 — Session key leak allows up to 1440 CEK requests per delegation window
**Severity:** Design  
**Status:** Partially fixed in this session (TTL reduction).

#### What happens
`recoverCEKWithServerSession()` sets `expiresAt: now + 3600` (1 hour). The server generates the session keypair with `extractable: true` so the private scalar can be re-imported as ECDH.

Because the delegation is **session-scoped and not content-specific**, a leaked session private key does not just expose one asset — it grants decryption access to **every content item the user has access to**, at a rate of one CEK per 60 seconds for the remaining lifetime of the delegation. In a 1-hour window that is up to 60 assets.

#### Fix
Reduce TTL for server-session delegations. For the streaming use case a 5-minute window (300 s) is sufficient per stream initiation. The ephemeral key should not be logged. See plan.

---

## 3. Summary Table

| ID  | Severity | Fix this session | Entrypoint |
|-----|----------|-----------------|------------|
| C-1 | Critical | No — deferred | `envelopeCEK` L376, `unwrapECDHEnvelope` L1158 |
| C-2 | Critical | Yes | Lit Action L519–534, `SecureViewDelegation` type |
| H-1 | High | No — accepted | Lit Action L485, `secureViewSession.ts:374` |
| H-2 | High | No — out of scope | `httpsGet` L327 |
| M-1 | Medium | Yes | `envelopeCEK` L369, `unwrapECDHEnvelope` L1196 |
| M-2 | Medium | No — deferred with C-1 | `unwrapECDHEnvelope` L1209 |
| D-1 | Design | Partial (TTL only) | `recoverCEKWithServerSession` L1028 |
| D-2 | Design | Yes (TTL reduction) | `recoverCEKWithServerSession` L1038 |
