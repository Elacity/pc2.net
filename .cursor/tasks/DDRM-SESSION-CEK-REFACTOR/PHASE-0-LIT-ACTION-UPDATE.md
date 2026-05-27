# Phase 0: Lit Action — Remove `del.actionIpfsId` Check

**Status**: Not started
**Estimated effort**: ~30 min
**Must complete before**: Phase 1 and Phase 2 (server and client must stop sending `actionIpfsId` in the delegation after the new CID is live)
**Files**: `pc2-node/data/lit-actions/universal-decrypt-chipotle.js`, `pc2-node/src/api/chipotle-client.ts`

---

## Context

The deployed Lit Action currently validates `actionIpfsId` in both the delegation and the request:

```js
// line 516 — delegation-level check (to be removed):
if (del.actionIpfsId !== actionIpfsId) return deny("bad_action_cid");

// line 517 — request-level check (keep — sufficient on its own):
if (req.actionIpfsId !== actionIpfsId) return deny("bad_req_action_cid");
```

The delegation check is redundant: the request is signed by the session key whose public key IS inside the wallet-signed delegation, so if `req.actionIpfsId` passes, the wallet has implicitly bound to this action via the session key. Removing `del.actionIpfsId` makes the delegation fully identity-bound (not action-bound), allowing the same session to be reused across action CID upgrades without a new wallet prompt.

`ownerAddress` stays in the delegation and is unchanged — the Lit Action still verifies `ecrecover(delegationSig) === del.ownerAddress` as an early check (line 534).

---

## Change

### `universal-decrypt-chipotle.js`

Delete **one line** only:

```js
// DELETE this line (line ~516):
if (del.actionIpfsId !== actionIpfsId) return deny("bad_action_cid");
```

Everything else in the Lit Action is unchanged. The `req.actionIpfsId !== actionIpfsId` check on the next line remains.

---

## Delegation shape after this change

```json
{
  "chainId": 8453,
  "domain": "pc2.secure-view.v1",
  "expiresAt": 1234654290,
  "issuedAt": 1234567890,
  "nonce": "0x<16 random bytes>",
  "ownerAddress": "0x<wallet>",
  "sessionPublicKey": "0x<32-byte Ed25519 pubkey | 65-byte P-256 uncompressed>"
}
```

`actionIpfsId` is no longer a delegation field. It lives only in the per-request payload (signed by the session key).

---

## Deployment

```bash
# Obtain new CID after editing (via Lit CLI or ipfs add)
grep -n "UNIVERSAL_DECRYPT_CID" /Users/maciz/www/pc2.net/pc2-node/src/api/chipotle-client.ts
# Update the constant to the new CID
```

---

## Checklist

- [ ] `del.actionIpfsId !== actionIpfsId` line deleted from `universal-decrypt-chipotle.js`
- [ ] `req.actionIpfsId !== actionIpfsId` check **kept** (line immediately after)
- [ ] Lit Action deployed; new CID obtained
- [ ] `UNIVERSAL_DECRYPT_CID` in `chipotle-client.ts` updated to new CID
- [ ] Old CID noted in a comment for rollback reference
