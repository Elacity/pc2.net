# v1.2.8.0 Chipotle Relayer — Client-Side Migration Manifest

**Status**: pre-flight scaffold (this folder is gitignored under `.cursor/tasks/`)
**Owner**: next agent picking up C-2 after C-1 (`usageKey` rotation) lands
**Read in tandem with**: `./lit-relay.js`, `./relayer-signer.ts`, `./chipotle-client-tier0.ts.fragment`, and the parent `../V1.2.8.0-CHIPOTLE-RELAYER.md` task spec

---

## TL;DR — what changes on the client side

Switching from "include API key in body" → "include SIWE auth header" sounds
like it should touch every consumer of Chipotle. **It does not.** All Lit-Action
call sites in `pc2-node/src/` already go through `chipotle-client.ts` exports.
The auth shape lives entirely *inside* that one file. Net consumer-side diff:
**zero lines**.

```
pc2-node/src/services/media/dashPackager.ts   → unchanged
pc2-node/src/api/storage.ts                    → unchanged
pc2-node/src/api/media.ts                      → unchanged
pc2-node/src/api/chipotle-client.ts            → ~80 LOC added (Tier 0)
pc2-node/src/runtime/relayer-signer.ts         → NEW (~190 LOC)
deploy/web-gateway/lib/lit-relay.js            → NEW (~330 LOC)
deploy/web-gateway/index.js                    → ~25 LOC added (route wiring)
```

---

## 1. Where Lit Actions are *actually* invoked today

Verified on commit `52682c4fb` (= shipped `v1.2.7.14`):

| Caller | How it calls Chipotle | What it has to know about API keys |
|---|---|---|
| `pc2-node/src/services/media/dashPackager.ts:19` | `import { encryptWithLitAction, … } from '../../api/chipotle-client.js'` | nothing — it passes a pre-computed `ChipotleConfig` or none |
| `pc2-node/src/api/storage.ts:2237` | `await import('./chipotle-client.js'); encryptWithLitAction(...)` | nothing — config flows from the supernode-provision blob already cached |
| `pc2-node/src/api/storage.ts:2355` | `await import('./chipotle-client.js'); recoverNonMediaCEK(...)` | nothing — same config plumbing |
| `pc2-node/src/api/media.ts:1371` | `await import('./chipotle-client.js'); recoverNonMediaCEK(...)` | nothing |
| `pc2-node/src/api/chipotle-client.ts` (internal) | three private callers go through `executeLitAction()` | reads Tier 1-3 keys directly |

**Inference**: the API-key boundary is `executeLitAction()`. Anything above
that boundary is decoupled from how the call is authenticated. We can swap
"X-Api-Key from local file" for "X-PC2-Sig from a signer" without any caller
above `chipotle-client.ts` knowing.

This is the single biggest leverage point in the whole task: nothing in the
public Chipotle helper surface (`encryptWithLitAction`, `recoverNonMediaCEK`,
`buildSelfRefConditions`, etc.) changes shape. Their argument types stay the
same. Their callers don't recompile.

---

## 2. The exact "API key in body → SIWE auth header" diff

### Before (today, v1.2.7.14)

```typescript
// pc2-node/src/api/chipotle-client.ts:597
const resp = await fetch(`${apiUrl}/core/v1/lit_action`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': apiKey,                     // ← shared key on the wire
  },
  body: JSON.stringify({
    code: params.code,
    js_params: params.jsParams || {},
  }),
});
```

The `apiKey` resolves through Tier 1-3:
1. Env override (`LIT_CHIPOTLE_USAGE_KEY`)
2. User key from Settings UI (`data/.chipotle-user-key`)
3. Cached / fresh provision blob (`data/.chipotle-provision.json` — the
   blob that today still contains the world-readable usageKey)

### After (v1.2.8.0, Tier 0 first)

```typescript
// Tier 0 (NEW): supernode relayer
const resp = await fetch(`${supernode}/api/ddrm/lit-action`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-PC2-Wallet': wallet,                  // ← public address
    'X-PC2-Sig':    signature,               // ← personal_sign over the message
    'X-PC2-Nonce':  challenge.nonce,         // ← single-use, supernode-issued
  },
  body: JSON.stringify({
    code: params.code,
    js_params: params.jsParams || {},
  }),
});
```

The `apiKey` field disappears from the wire on the PC2 side. The supernode
re-attaches `X-Api-Key: <usageKey>` server-side before forwarding to Chipotle
(see `lit-relay.js:_forwardToChipotle()`).

Tier 1-3 continue to exist for fall-through (env override, user key, cached
provision) — Tier 0 fails closed only on definitive 4xx; on transport / 503
it returns null and the caller falls through.

---

## 3. The four surgical edits to `pc2-node/src/api/chipotle-client.ts`

Numbers reference current line positions (`52682c4fb`). See the working
copies in `./chipotle-client-tier0.ts.fragment`.

| # | Where | What | LOC |
|---|---|---|---|
| 1 | top of file (after `getBaseRpcUrl` import, ~line 24) | add `import { getRelayerSigner, type RelayerSigner } from '../runtime/relayer-signer.js';` | +2 |
| 2 | after `SUPERNODE_PROVISION_URLS` constant (~line 65) | declare `RELAYER_AUTH_CHALLENGE_URLS`, `RELAYER_LIT_ACTION_URLS`, `RELAYER_TIMEOUT_MS`, `buildRelayerAuthMessage()` | +30 |
| 3 | anywhere above `executeLitAction()` (~line 571) | add `fetchRelayerChallenge()` + `executeLitActionViaRelayer()` | +90 |
| 4 | replace the body of `executeLitAction()` (~lines 571-590) | prepend the Tier 0 try/return block before the existing Tier 1-4 logic | +25 |

Total: **~150 LOC added, 0 LOC removed** in `chipotle-client.ts`.

The existing fetch (line 597) — the one that currently sets `X-Api-Key` —
stays exactly where it is. It only fires when Tier 0 falls through. After
Day-30 cutover (when supernode `/api/ddrm/provision` stops shipping
`usageKey`), the only way to hit that code path is via env override or user
key — which is fine, those are the explicit self-sovereign escape hatches.

---

## 4. The single new pc2-node file

`pc2-node/src/runtime/relayer-signer.ts` — see scaffold in `./relayer-signer.ts`.

Resolves the wallet that signs the SIWE-style challenge. Three backends
(runtime-injected, env override, ephemeral disk-backed) in priority order.

The runtime-injected path is the strategic one: it reuses the same wallet
provider that already powers `wallet.js#siweLogin` for Elacity GraphQL.
The supernode treats all three identically — there is no trust hierarchy,
just a UX gradient. New nodes work immediately; onboarded nodes use their
real wallet automatically the first time it's available.

---

## 5. Promote-time gating — what blocks each step

```
                            BLOCKERS
                           ─────────
C-1: Rotate live usageKey ─────────── Sasha + Irzhy (manual; ~30 min)
                │
                ▼
C-2 paste relayer-signer.ts ───────── secp256k1 helper picked
                │
                ▼
C-2 paste lit-relay.js promote ────── recoverPersonalSign() implemented
                │
                ▼
C-2 wire routes in index.js ────────── lit-relay.js verified in unit tests
                │
                ▼
C-2 deploy to Contabo ─────────────── A-1 cure has fully soaked (~24-48 h
                │                       confirmed plateau ≤ 1 GB RSS)
                ▼
C-2 deploy to InterServer ─────────── Contabo green for ≥ 6 h
                │
                ▼
C-2 paste chipotle-client.ts Tier 0 ── relayer endpoints reachable + healthy
                │                       on both supernodes
                ▼
v1.2.8.0 ship ──────────────────────── chipotle-client unit tests pass +
                                       Sasha's manual happy-path on a fresh
                                       PC2 install
```

C-1 unblocks everything. Until C-1 happens, none of these scaffold files
are activated.

---

## 6. What the scaffold deliberately does NOT pre-decide

- **secp256k1 / keccak256 lib choice.** Two plausible options: (a) inline a
  tiny self-contained recover (zero new dep, ~150 LOC each side) or (b) add
  `viem` to `deploy/web-gateway/package.json` (one extra dep but the same
  primitive pc2-node already uses). Decision deferred to whoever picks up C-2.
- **Mode A vs Mode B default.** Scaffold defaults to Mode A (open, rate-
  limited). Mode B (allowlist-only) is a 30-day post-deploy switch if abuse
  signals appear in `journalctl`.
- **Day-30 cutover trigger.** The task spec says "drop `usageKey` from
  /api/ddrm/provision response when fleet on v1.2.8.0+". Whoever ships C-2
  decides whether that's a feature flag or a hard date.
- **Audit log destination.** Scaffold uses `console.log` (which goes to
  systemd journald). At promote-time we may want a structured sink.

---

## 7. What this scaffold gives the next agent on day one

1. The route handlers already enforce nonce single-use, per-wallet
   buckets, per-IP buckets, allowlist mode toggle, and signature-verify
   ordering — so the implementer doesn't have to re-derive any of that.
2. The pc2-node Tier-0 helpers handle multi-supernode failover, abort
   timeouts, transport-error fall-through, and 4xx surfacing — all of
   which are footguns the implementer would otherwise rediscover at 2 AM.
3. The migration scope is *bounded*: 4 surgical insertions in one file +
   1 new file on each side + 1 new module to wire on the gateway. No
   schema migrations, no type churn through `media.ts` / `storage.ts` /
   `dashPackager.ts`, no public-API breakage.
4. The signature flow is byte-for-byte symmetrical — `buildRelayerAuth-
   Message()` exists in both files and refuses to drift because the
   scaffold pins it to the exact same string format on both sides.

---

## 8. Production-readiness checklist (post-audit, 2026-05-07)

Findings from a full end-to-end flow audit (creator packaging → non-media decrypt → media decrypt → packaging IPFS). The architecture is sound and the four flows are structurally preserved, but there are three operational risks to decide on **before** C-2 ships and two ergonomic adjustments worth folding into the same release.

### 🟥 Pre-ship blockers (decide before flipping any switch)

#### P-1. Pin supernode TLS certs (or move them to real DNS)

**Finding.** `pc2-node/src/api/chipotle-client.ts:287` calls supernodes with `rejectUnauthorized: false` because supernode URLs are bare IPs (`https://69.164.241.210/...`) with self-signed certs. Today this is "just" a privacy bleed — the world-readable usageKey was already on the wire. After C-2 the same MITM gets:
- The user's wallet address (X-PC2-Wallet)
- A one-shot SIWE signature (not replayable)
- A signed delegation that's **replayable for the SAME asset by the SAME user** (bounded blast radius — attacker only re-decrypts what the user could already decrypt — but a privacy leak: "wallet X decrypted asset Y at time T")

**It does NOT compromise the usageKey** (which never crosses the PC2 wire after Day-30). C-2 is a strict security improvement on the "key on the wire" axis. But the privacy axis stays where it is unless we fix the cert situation.

**Mitigation options (pick one):**

| Option | LOC | Effort | Notes |
|---|---|---|---|
| **A. Cert pinning** in `chipotle-client.ts` | ~6 | 1h | Store SHA-256 of each supernode cert (one constant per supernode), validate in https request callback, throw on mismatch. Drops `rejectUnauthorized: false`. Manual rotation needed when supernode cert rotates. |
| **B. Move supernodes to DNS + Let's Encrypt** | ~30 (nginx + DNS) | half-day | `relay-1.ela.city`, `relay-2.ela.city` (or similar). Real CA-signed certs. Auto-renew via certbot. Removes `rejectUnauthorized: false` permanently. Strictly better long-term answer. |

**Recommendation:** Option B if Sasha wants to spend the half-day; Option A as the strict prerequisite if not. Both unblock C-2.

#### P-2. Soft Day-30 cutover (telemetry-gated, not date-gated)

**Finding.** Task spec §"Phase 4 — Backward compatibility" says drop `usageKey` from `/api/ddrm/provision` at Day 30. If we flip on a hard date and even 5% of nodes are still on ≤v1.2.7.x (cold-stored installs, offline rigs, users with auto-update disabled), those users see broken decrypt until they update.

**Mitigation:** two gates instead of a date.

1. **Adoption telemetry.** Piggy-back a `?v=1.2.8.0` query param on `UpdateService.checkGitHubReleases()` so the supernode access log captures version distribution. When >99% of pinging nodes are on v1.2.8.0+, gate 1 passes.
2. **60-day floor.** Regardless of telemetry, keep `usageKey` in the provision blob for ≥60 days past v1.2.8.0 ship date. Cold installs deserve the grace window.

Cutover happens only when **both** gates are open.

**LOC:** ~4 in `UpdateService.ts` (add the version param), ~10 in `deploy/web-gateway/index.js` (env var `RELAYER_DAY30_FORCE=1` gates the field-strip), ~20 LOC in a tiny telemetry summariser script for Sasha to eyeball weekly.

#### P-3. Tier-5 — local CEK result cache (graceful degradation)

**Finding.** Today's fall-through chain when both supernodes are unreachable: Tier 0 (relayer, 503) → Tier 1 (env, operators only) → Tier 2 (Settings UI key, self-sovereign users only) → Tier 3 (cached usageKey from old provision — dries up post-Day-30) → Tier 4 (fresh provision GET — empty post-Day-30).

For a normal user (no env override, no Settings UI key), **post-Day-30 with both supernodes down = no decrypt at all, even for assets they decrypted yesterday**. This is a real availability regression vs today's "cached usageKey works for ~hours."

**Mitigation:** add a Tier-5 result cache in `chipotle-client.ts` — cache the *result* of past successful Tier-0 decrypts, keyed by `{kid, ownerWallet}`, with a 14-30 day hard expiry. If supernodes go down for hours/days, existing users keep working on assets they've previously decrypted. New asset decrypts still need supernode reachability, but that's an availability story, not a "system is broken" story.

**Crucial property:** Tier 5 caches the *CEK result*, not the `usageKey`. This is structurally a different — and weaker — secret than what we're protecting. Each cached entry is bound to a specific `{user, asset}` pair; compromise of the cache exposes only what that user could already decrypt.

**LOC:** ~30 in `chipotle-client.ts` (new file `data/.cek-cache.json` mode 0600, simple LRU + TTL, called from `executeLitAction()` *after* a successful Tier-0 response and *before* the Tier 1-4 fall-through fires).

### 🟧 Same-release ergonomic adjustments

#### P-4. Elevated rate-limit bucket for creators

**Finding.** Per-wallet bucket is 100 actions/hour. Each `mediaEncrypt` is one Lit Action call. A creator with a backlog of 100+ assets to ingest in one batch will hit the cap.

**Mitigation:** at promote time in `lit-relay.js`, two flavors of override on the per-wallet bucket:

| Flavor | How | When to use |
|---|---|---|
| **Static** | Read `/etc/pc2/relayer-elevated-wallets.allow` (one address per line) → 1000/hour cap | Known creator wallets (Sasha + Anders + a few early creators); ops decision |
| **Dynamic** | At request time, call `AuthorityGateway.isChannelOwner(wallet)` (cheap RPC, cached 5 min per wallet) → 1000/hour if true | Auto-elevation for any wallet that owns ≥1 channel on Base mainnet |

**Recommendation:** ship Static at C-2, add Dynamic in C-3 (the soak release) when we have rate-limit metrics to size the cap from. ~15 LOC for Static, ~30 LOC for Dynamic.

#### P-5. Audit log wallet hashing

**Finding.** Per-call audit log line in `lit-relay.js` includes wallet + IP. We control these supernodes today, but the decentralisation roadmap puts third-party operators in the same trust path.

**Mitigation:** `wallet_id = sha256(wallet || daily_salt).slice(0, 8)` for the persistent audit log. Live in-memory state still uses the real wallet for rate-limiting; only the on-disk log is pseudonymised. Salt rotates daily so cross-day correlation requires retaining old salts (operator's choice for retention policy).

**LOC:** ~8 in `lit-relay.js`. Small enough to ship in C-2 alongside everything else.

### 🟨 Lower-priority / defer

| # | Item | Why deferring | Revisit at |
|---|---|---|---|
| L-1 | Ephemeral-signer rotation linkage to real wallet | An attacker rotating ephemeral keys to circumvent per-wallet rate limits is bounded by the per-IP secondary bucket (600/hour). Not worth solving pre-v1.3. | v1.3 (federated supernodes) |
| L-2 | Action CID rotation flow audit | Already works the same way today — relayer doesn't validate `code` field, Chipotle's group allowlist is the gate. No change needed. | Only if Chipotle changes their allowlist semantics |
| L-3 | secureViewSession TTL during long video sessions | Lit Action enforces TTL; CEK is cached in `mediaSessionManager` for the session. Re-derives a fresh delegation on session reopen. Same as today. | Only if user reports session-mid-playback failures |

### Summary table for the C-2 implementer

| # | Item | LOC | Where | Blocks v1.2.8.0 ship? |
|---|---|---|---|---|
| P-1 | TLS pinning OR DNS+LE certs | 6 / 30 | `chipotle-client.ts` / supernodes | **Yes — pick one** |
| P-2 | Soft Day-30 cutover | ~34 | `UpdateService.ts` + `web-gateway/index.js` | Only blocks the field-strip, not the relayer ship itself |
| P-3 | Tier-5 result cache | ~30 | `chipotle-client.ts` | **Yes** — needed for availability post-Day-30 |
| P-4 | Elevated wallet rate-limit | ~15 (static) | `lit-relay.js` | No — but ship together |
| P-5 | Audit log wallet hashing | ~8 | `lit-relay.js` | No — but ship together |

Total additional scope: **~95 LOC** beyond the base scaffold. Lifts C-2 from "structurally correct" to "production-ready across nodes."

---

*Last updated: 2026-05-07 (initial scaffold + production-readiness audit for v1.2.8.0 C-2 prep)*
