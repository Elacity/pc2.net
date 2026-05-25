# Task: Supernode-backed Base / ESC RPC proxy

**Task ID**: SUPERNODE-RPC-PROXY
**Created**: 2026-04-29
**Status**: InProgress — client-side plumbing shipped 2026-04-29 (default-off); supernode-side deployment still pending. **2026-05-25 update**: DNS ownership confirmed + cert infrastructure unblocked; only `rpc.ela.city` repoint at GoDaddy (Sasha deferred from same-session) + Contabo nginx vhost deploy remain. Wildcard cert already covers the hostname; no separate certbot run needed. See §"2026-05-25 — DNS ownership confirmed" below.
**Priority**: **P0 — bumped 2026-05-02**. User hit a hard transaction failure during v1.2.7 cluster-pin smoke test on Jetson: Particle Auth `getPrimaryAssets()` timed out 6× in a row (15 s each), then Send dialog returned `MetaMask - RPC Error: RPC endpoint returned too many errors, retrying in 0.37 minutes`. Root cause: public RPC fallback chain (llamarpc → publicnode → ankr → blockpi → mainnet.base.org) all rate-limited at once. NOT a v1.2.7 regression — same failure mode exists on every prior version, but it now blocks the v1.2.7 acceptance test (can't verify cluster pin if user can't mint). v1.2.8 must ship Phase 2 (supernode proxy live on Contabo, default `BASE_RPC_URLS` includes it first).

## Description

Run an authoritative JSON-RPC endpoint on our existing supernodes
(InterServer `69.164.241.210`, Contabo `38.242.211.112`) and add them
to `BASE_RPC_URLS` in `pc2-node/src/static.ts`. Eliminates dependency
on public community RPCs for Base reads, removes public rate limits as
a UX factor, aligns with Elastos sovereignty principles.

## Background

On 2026-04-28 the user reported intermittent "price not showing" on
Elacity Market asset detail pages. Root cause trace:

1. `renderOpTypeBadge` fires 8–12 `eth_call`s per asset open
   (`sellersOf`, N × `listings`, `balanceOf`, etc.)
2. `mainnet.base.org` (Coinbase official) rate-limits hard (~60 req/min)
   and returns the throttle response as **HTTP 200 + JSON-wrapped error**,
   not HTTP 429.
3. Our `handleJsonRpcProxy` only failed over on HTTP non-2xx; the
   JSON-error case fell through to the client and never tried the
   configured llamarpc / publicnode fallbacks. Fixed in `a3c599d6c`.
4. Additional resilience:
   - `542487ebc` — diagnostic log on fallback trigger
   - (this branch) — reorder `BASE_RPC_URLS` with llamarpc first,
     add Ankr + BlockPI fallbacks
   - (this branch) — add `eth_call` to proxy cache (2 s TTL) to
     dedupe rapid re-open bursts

Those fixes make the existing flow much more robust, but we still
depend on public community RPCs. That dependency:

- Puts our UX at the mercy of third-party rate limits and uptime
- Makes us a "quiet" consumer — no SLA, no support channel
- Doesn't align with the Elastos sovereignty narrative (we talk about
  running our own infrastructure; our Market reads still route to
  Coinbase / llama / Ankr / BlockPI / public-node endpoints)
- Each user node hitting public RPCs is inefficient; a shared cached
  proxy at the supernode level amortizes reads across the network

## Requirements

### MVP (minimum to close this task)

1. **Deploy a JSON-RPC proxy service** on each of our two active
   supernodes (`69.164.241.210`, `38.242.211.112`). Implementation
   options (pick cheapest first, revisit if needed):

   - **Option A (fastest, cheapest)**: a thin reverse-proxy running
     `nginx` or `caddy` that forwards to an authenticated Alchemy or
     Infura endpoint (one Alchemy free tier per supernode = 300M CU/month,
     way beyond our current demand). Cost: $0 until scale, ~$49/mo
     per node once we outgrow free tier.

   - **Option B (more sovereign)**: self-host `reth` (Base-compatible
     L2 node) on each supernode. Cost: $0 RPC, requires ~500 GB storage
     + ongoing sync (full Base archive is larger but pruned is manageable).
     Higher ops burden.

   - **Option C (hybrid)**: Alchemy/Infura primary + cached query layer
     (Rust `axum` service) on supernode that serves common reads
     (`sellersOf`, `listings`, `balanceOf`) from a local SQLite / Redis
     cache with block-level invalidation. Best UX, most build.

   MVP ships Option A; B/C tracked as follow-up.

2. **Signed public endpoints**: expose as
   `https://rpc.node1.pc2.ela.city/base` and
   `https://rpc.node2.pc2.ela.city/base`, TLS via existing Let's Encrypt
   setup on the supernodes (already in place for pc2-gateway.service).

3. **Add to `BASE_RPC_URLS`**: as the first two entries, ahead of
   public community RPCs.

4. **Health monitoring**: supernode proxy must return HTTP 503 if its
   upstream (Alchemy/Infura/reth) is unreachable. Our client-side
   fallback then moves to the next URL without masking outages.

### Nice-to-have (post-MVP)

- ESC equivalent — same pattern for Elastos Smart Chain reads
  (currently uses `api.elastos.io/eth` which has the same throttling
  profile). Same risks, same fix.
- Metrics (request count, upstream, cache hit rate) exported via
  Prometheus on the supernode for ongoing ops visibility.
- Rate-limit awareness on the supernode itself — short-circuit with
  cached responses when upstream is throttled, serving stale reads
  with a `Warning` header rather than a 5xx.

## Acceptance Criteria

- [ ] `curl -s -X POST -H 'Content-Type: application/json' https://rpc.node1.pc2.ela.city/base -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'` returns `{"jsonrpc":"2.0","id":1,"result":"0x2105"}` (chainId 8453 = Base)
- [ ] Same for node2 endpoint
- [ ] `BASE_RPC_URLS` in `pc2-node/src/static.ts` lists both supernode
      endpoints first, community RPCs after
- [ ] Load test: 1000 `eth_call` bursts within 60 s succeed without
      rate-limit errors (comfortably beats our peak demand)
- [ ] Supernode proxy service unit documented in
      `docs/ops/SUPERNODE_SERVICES.md` alongside `pc2-gateway.service`
      and `pc2-web-gateway.service`
- [ ] Deploy script added to `deploy/app-registry/scripts/` (follows
      existing pattern — `install-pinning.sh`, etc.)

## Files to Modify

- `pc2-node/src/static.ts` — add supernode URLs to `BASE_RPC_URLS`
- `deploy/app-registry/scripts/install-rpc-proxy.sh` — new (deploy)
- `docs/ops/SUPERNODE_SERVICES.md` — new or extend existing ops docs

## Files to Create (on supernodes, not in repo)

- `/etc/nginx/sites-available/pc2-rpc-base` (if Option A)
- `/etc/systemd/system/pc2-rpc-base.service` (if Option B/C)
- Alchemy/Infura API keys in `.env` (encrypted, deployed via `deploy.sh`)

## Testing Strategy

- Unit test: extend the offline `isTransportRateLimit` / proxy test
  harness to cover supernode URL in the fallback sequence
- Integration: hit `/api/rpc/base` with 1000 `eth_call`s in rapid
  succession from a local PC2 node, confirm all succeed via supernode
- Failure test: take supernode-node1 offline, confirm client falls
  over to supernode-node2 transparently (no user-visible error)
- Regression: existing Elacity Market flows (asset open, buy, cancel)
  unchanged, just faster

## Notes

### Why two supernodes, not more

We already operate these two for `pc2-gateway.service` /
`pc2-web-gateway.service`. Adding a third JSON-RPC pair multiplies
ops cost for marginal resilience gain; we already have 3 public
fallbacks in the list for worst-case scenarios. Revisit if Elacity
Market traffic grows 10× or if either supernode becomes unreliable.

### Why ship Option A first

Alchemy/Infura free tier is 300M compute units per month, which at our
current `eth_call` / `eth_getCode` mix handles ~5000 daily active users
before we need to upgrade. Building `reth` integration now is
speculative. We'll know when we need to upgrade because the Alchemy
dashboard will tell us, and migrating from Option A → Option B/C is a
one-line change in `BASE_RPC_URLS`.

### Relationship to IPFS-ELACITY-BOOTSTRAP

This task parallels `IPFS-ELACITY-BOOTSTRAP` — same architectural
pattern (supernodes as shared infrastructure), different service (RPC
vs. pinning). Could be run by the same deploy scripts / ops tooling
once both are landing.

### Relationship to RPC-PROXY hardening (shipped)

Commits `a3c599d6c` (fallback on JSON error), `542487ebc` (diagnostic
log), and the bundled reorder + eth_call cache change that follows
make the CURRENT public-RPC flow robust enough to ship v1.2 without
this task. This task is about removing a third-party dependency, not
about fixing a bug.

## 2026-04-29 — Phase 1 shipped (client side)

Landed the client-side plumbing so that activation is a pure operator
env-var change once the supernode proxies are deployed. **No default
behavior change** — user nodes without `SUPERNODE_RPC_URLS` set behave
identically to the pre-change implementation.

### Code changes

- **`pc2-node/src/utils/rpc.ts`**:
  - `initBaseRpcPool(urls?, supernodeUrls?)` now accepts a second
    argument. Entries are **prepended** to the effective pool so they
    are tried before any configured or default public RPC.
  - Empty/undefined `supernodeUrls` = no change (default).
  - Added `getBaseRpcPoolInfo()` exporting `{ urls, currentIndex, supernodeCount }`
    for future diagnostics / ops tooling.
  - Startup log now reports `"N endpoints (K supernode first): <first-url>..."`
    when supernode URLs are configured.

- **`pc2-node/src/index.ts`**:
  - Reads `process.env.SUPERNODE_RPC_URLS` (comma-separated), trims,
    filters empty strings, and passes to `initBaseRpcPool()`.

- **`pc2-node/src/static.ts`**:
  - Same env-var read applied to the local `BASE_RPC_URLS` array used
    by `handleJsonRpcProxy('/api/rpc/base')` — the Base JSON-RPC proxy
    that the Elacity Market wallet (`wallet.js`) and Particle iframe
    both route through. This is the **user-facing path** and therefore
    the one that relieves Irzhy's `governor` rate-limit errors.
  - Supernode URLs are added at the front of the existing public
    fallback list (llamarpc → publicnode → ankr → blockpi → mainnet.base.org).
  - One-line `[rpc-proxy] N supernode RPC endpoint(s) prepended...`
    info log fires at server start when the env var is set.

### Why the existing fallback logic makes this safe

`handleJsonRpcProxy` already:
- Rolls over on HTTP non-2xx (including 404 / 503).
- Rolls over on JSON-wrapped "rate-limit" errors (`isTransportRateLimit`,
  commit `a3c599d6c`).
- Serves successful responses through the 2 s `eth_call` proxy cache.

So a supernode endpoint that is misconfigured, unreachable, or
throttled is invisible to the user: the request transparently walks
down the list and hits a public fallback. Worst case: +8 s of timeout
per request (`controller.abort(() => 8000)`) before fallback kicks in.

### Smoke verification (local, 2026-04-29)

```
# Env set, pointing at a bogus supernode URL to exercise fallback
$ SUPERNODE_RPC_URLS="https://fake-supernode.example.com/base" \
    node dist/index.js
[rpc] RPC pool initialized with 6 endpoints (1 supernode first): https://fake-supernode.example.com/base...
[static] [rpc-proxy] 1 supernode RPC endpoint(s) prepended to BASE_RPC_URLS

$ curl -sX POST http://localhost:4200/api/rpc/base \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
{"jsonrpc":"2.0","id":1,"result":"0x2105"}   # Base chainId 8453 — fallback worked
```

```
# Env unset — no change from pre-feature behavior
$ node dist/index.js
[rpc] RPC pool initialized with 5 endpoints: https://mainnet.base.org...
# No [rpc-proxy] supernode log line.

$ curl -sX POST http://localhost:4200/api/rpc/base ...
{"jsonrpc":"2.0","id":1,"result":"0x2105"}   # identical response
```

### What still needs to happen (Phase 2)

1. Deploy the supernode proxy service (Option A from Requirements
   above — nginx/caddy → Alchemy or Infura) on both supernodes.
2. Verify with the MVP acceptance criteria curls (chainId =
   `0x2105`, unit tests pass, load test passes).
3. Publish the two public endpoints
   (`https://rpc.node1.pc2.ela.city/base` and
   `https://rpc.node2.pc2.ela.city/base`).
4. On each user node: set
   `SUPERNODE_RPC_URLS="https://rpc.node1.pc2.ela.city/base,https://rpc.node2.pc2.ela.city/base"`
   in the node's environment or systemd unit. Restart. Confirm the
   `RPC pool initialized with 7 endpoints (2 supernode first)...`
   startup log.

No additional code changes are required in `pc2-node` after Phase 2 —
the hooks are already in place. Same activation pattern as
`SUPERNODE_PIN_MIRRORS` from `SUPERNODE-MEDIA-PINNING`.

## 2026-05-02 — Production failure during v1.2.7 smoke test (User report)

User attempted v1.2.7 mint smoke-test on Jetson via Mac browser (`https://zzz.ela.city`, routed through Contabo WireGuard relay → Jetson pc2-node). Two failure modes hit back-to-back:

1. **Mint flow stuck at "loading tokens"** — Particle Auth `getPrimaryAssets()` is the upstream-token-list fetcher; it fires ~15-25 RPC calls per refresh (eth_call across multiple ERC-20 contracts + eth_getCode for smart-account deployment probe). Logs show:
   ```
   [Particle Auth]: Calling getPrimaryAssets()...
   [Particle Auth]: getPrimaryAssets() join in-flight request   (×6)
   Uncaught (in promise) Error: getPrimaryAssets() timed out after 15s   (×6)
   ```
   Sign dialog never appeared because the wallet UI had no token list to display.
2. **Send-tokens dialog returned RPC error** — User then tried sending 0.1 USDC EOA→SmartAccount on Base as an alternate test. `[PC2]: Intercepting Base RPC fetch ...` fired 8× rapid, then:
   ```
   MetaMask - RPC Error: RPC endpoint returned too many errors, retrying in 0.5 minutes.
   [WalletService] EOA transaction failed on Base
   [UIWindowAccountSend]  Send failed
   ```

### Diagnosis

`SUPERNODE_RPC_URLS` is empty on Jetson (and on every other community pc2 node — Phase 2 of this task never landed). Effective `BASE_RPC_URLS` was therefore the 5 public providers only. With Particle's burst pattern, every provider in the list ratelimited simultaneously and the proxy's fallback walk had nowhere to go.

### Immediate-unstuck recommendation surfaced to User

1. Wait 5-10 min for public-RPC rate windows to reset, OR
2. User signs up for Alchemy free tier (300M CU/month, generous), supplies the URL, agent adds it to Jetson's `pc2-node/.env` as `SUPERNODE_RPC_URLS=...`, `pm2 reload ecosystem.config.cjs --only pc2 --update-env` — change is live immediately, RPC dependency on public providers eliminated for the Jetson.
3. (Roadmap) Phase 2 supernode proxy deployment on Contabo, gated on the same Thailand-DNS round-trip as `cluster.ela.city` (so v1.2.8 can ship `https://rpc.ela.city/base` as a default for ALL community nodes).

### Why this is now blocking v1.2.7 cluster smoke-test

User cannot complete the cluster-pin acceptance test (mint → watch for `[ClusterPin] ok cid=...` in pm2 logs) because the mint cannot proceed past Particle's token-loading phase. Cluster pin code path is unaffected — it just hasn't been exercised yet because no successful mint has occurred since the rate-limit incident. As soon as RPC is unstuck (any of the three options above), the smoke test can resume and v1.2.7 tag-cutting can proceed.

## 2026-05-02 — Tactical unstuck deployed to Jetson (Option B, single-node)

User supplied an Alchemy free-tier Base mainnet API key. Agent deployed it inline as `SUPERNODE_RPC_URLS` in Jetson's `ecosystem.config.cjs` (NOT `.env` — see design gap below) and ran `pm2 reload ecosystem.config.cjs --only pc2 --update-env`. Boot log confirmed:

```
[rpc] RPC pool initialized with 6 endpoints (1 supernode first): https://base-mainnet.g.alchemy.com/...
[rpc-proxy] 1 supernode RPC endpoint(s) prepended to BASE_RPC_URLS
```

Live `eth_chainId` probe through `/api/rpc/base` returned `0x2105` — Alchemy is answering. User can resume the v1.2.7 mint smoke-test.

### Operator hygiene note

The supplied Alchemy API key was shared in chat; it should be **rotated** in the Alchemy dashboard after the Jetson smoke-test passes. Old key dies, new key gets swapped via the same `pm2 reload --update-env` path. Cost of rotation: ~10 sec.

### Design gap discovered while deploying — to fix in v1.2.7 polish (BEFORE tag)

The `dotenv` integration added 2026-05-02 has a bug for the **opt-in supernode env vars**:

- `pc2-node/src/index.ts` calls `dotenv.config()` (default = `override: false`).
- `ecosystem.config.cjs` historically declares each opt-in var as `KEY: process.env.KEY || ""`.
- pm2 evaluates that to `""` when the shell doesn't have the var → spawns pc2 with `KEY=""` → dotenv sees `KEY` is "already in process.env" (empty string counts as set) → refuses to overwrite → operator's `pc2-node/.env` value is **silently ignored**.

**Effect**: community pc2 nodes that follow our docs and put `SUPERNODE_CLUSTER_PIN_URL` etc. in `pc2-node/.env` will NOT pick those values up. The supernode infrastructure is invisible to them.

**Fix (v1.2.7 polish, small)**: switch ecosystem.config.cjs to a conditional-spread pattern so absent shell vars don't poison the namespace:

```js
env: {
  PORT: 4200,
  NODE_ENV: 'production',
  ...(process.env.SUPERNODE_CLUSTER_PIN_URL   ? { SUPERNODE_CLUSTER_PIN_URL:   process.env.SUPERNODE_CLUSTER_PIN_URL }   : {}),
  ...(process.env.SUPERNODE_CLUSTER_PIN_TOKEN ? { SUPERNODE_CLUSTER_PIN_TOKEN: process.env.SUPERNODE_CLUSTER_PIN_TOKEN } : {}),
  ...(process.env.SUPERNODE_RPC_URLS          ? { SUPERNODE_RPC_URLS:          process.env.SUPERNODE_RPC_URLS }          : {}),
  // ... same pattern for all opt-in supernode/AI/comms vars in .env.example
},
```

With that pattern: shell env wins if present, else dotenv from `pc2-node/.env` fills the gap. Both paths now actually work as documented.

### Phase 2 (still pending — User-gated on Thailand DNS round-trip)

Same gating constraint as `cluster.ela.city` from `SUPERNODE-CLUSTER-SETUP` follow-up #7:

1. User configures `rpc.ela.city` A record → Contabo `38.242.211.112` (requires SMS verification on Thailand-only number, deferred until back from USA travel).
2. Agent deploys nginx → Alchemy/Infura proxy on Contabo (`pc2-rpc-base.service`), Let's Encrypt cert via certbot DNS-01 challenge.
3. Agent updates `pc2-node/src/static.ts` to bake `https://rpc.ela.city/base` into the **default** `BASE_RPC_URLS` (first entry, ahead of public providers).
4. v1.2.8 ships → every community pc2 node — including ones that never set `SUPERNODE_RPC_URLS` — automatically routes through our supernode RPC, eliminating the public-RPC dependency entirely.

Until Phase 2 lands, the only nodes with rate-limit-resistant RPC are operators who individually configure their own Alchemy/Infura key (currently: Jetson only).

### 2026-05-02 evening — DNS landscape recon + strategic release decision

After the Jetson smoke-test passed (cluster pin verified 2/2 in 730ms via Alchemy unstuck), User raised the critical follow-up: "will community nodes get the same experience? do they need the API key? we shouldn't share it...". Agent surveyed existing `*.ela.city` DNS to evaluate options:

| Subdomain | Target | Status |
|---|---|---|
| `gateway.ela.city`, `node1.ela.city`, `cluster.ela.city`, `market.ela.city`, `zzz.ela.city` | InterServer 69.164.241.210 | ✓ Live, HTTPS works (`*.ela.city` wildcard cert) |
| **`rpc.ela.city`** | **34.147.212.166** | ✗ **DNS exists but IP unreachable** — old/decommissioned, ownership unclear |
| **`supernode.ela.city`** | **34.142.19.27** | ✗ **DNS exists but IP unreachable** — GCloud range, ownership unclear |
| `ipfs.ela.city` | CNAME → `cdn.ela.city` | Cloudflare-fronted, separate path |

**Important caveat**: Before any future plan touches `rpc.ela.city`, verify ownership — that DNS record may belong to Elacity (the parent org) rather than the User's pc2.net repo. Asking who currently controls that record is a prerequisite to repointing it. See `docs/core/SUPERNODE_CAPABILITY_ASSESSMENT.md` lines 444 + 488 for the original "decide DNS policy" + "does it belong to us?" questions.

---

### 2026-05-25 — DNS ownership confirmed + infrastructure prerequisites landed

**Status update**: The "ownership unclear" caveat above is **resolved as of 2026-05-25**. Sasha regained GoDaddy admin access during the cert/DNS audit session and confirmed all `*.ela.city` records are under his control (no separate Elacity-org ownership boundary). Existing `rpc.ela.city` record is editable.

| Subdomain | New Target (2026-05-25) | New Status |
|---|---|---|
| **`elastossmartchain.ela.city`** | **38.242.211.112** (Contabo) | ✅ **LIVE 2026-05-25** — A record edited at GoDaddy; propagated globally; strict-TLS probe against refreshed wildcard cert verified. Unblocks SEC-WAVE6 A8 code patch. |
| `rpc.ela.city` | still 34.147.212.166 | ⏳ **Deferred 2026-05-25** by Sasha (conservative choice — did Item 1 only that session). Edit to `38.242.211.112` is a 1-min GoDaddy action when ready; wildcard cert already covers it, no separate cert work needed. **This is the unblock for Phase 2 deploy below.** |
| `supernode.ela.city` | still 34.142.19.27 | ⏳ Unused — no code references. Optional cleanup; Sasha left it for now. |

**Infrastructure unblocks landed same session (no GoDaddy access needed)**:
1. Contabo `*.ela.city` cert was 3 days expired (NotAfter `2026-05-21`) — invisible day-to-day because of `rejectUnauthorized:false` in clients, but would have broken Phase 2 immediately if shipped. Fresh cert pushed from InterServer; Contabo nginx reloaded; verified externally. New NotAfter: `2026-08-13`.
2. `/root/pc2/backup-to-contabo.sh` on InterServer patched so future acme.sh renewals auto-propagate to Contabo with no manual intervention (was the root cause of the 3-day expiry — script was rsyncing a stale dir + never reloading Contabo nginx).
3. Net result: when `rpc.ela.city` is repointed, the Phase 2 nginx vhost on Contabo can ship immediately — wildcard cert already valid, propagation pipeline already auto-renewing.

See [`GODADDY-DNS-BACKLOG-2026-05`](../GODADDY-DNS-BACKLOG-2026-05/GODADDY-DNS-BACKLOG-2026-05.md) for the complete session log + acceptance criteria checklist.

#### Suggested scope expansion — bundle SEC-WAVE6 A8 nginx vhost into Phase 2

Same-day (2026-05-25 PM) live-probe finding on the SEC-WAVE6 A8 work surfaced an additional Contabo nginx requirement that is naturally co-located with this task's Phase 2 nginx work:

| Item | Where | Why bundle |
|---|---|---|
| `server { server_name elastossmartchain.ela.city; ... }` block proxying `/rpc/esc` to the existing ESC RPC backend on Contabo | Same Contabo nginx | A8 code patch (3 files in `pc2-node`, ~30 min) is gated on this server-side change. Without the block, `https://elastossmartchain.ela.city/rpc/esc` 404s instead of returning JSON-RPC. |
| `server { server_name rpc.ela.city; ... }` block proxying `/base` to Alchemy free-tier (this task's MVP) | Same Contabo nginx | Phase 2's primary deliverable. |

Bundling rationale: **one `nginx -t && systemctl reload nginx` cycle for two new server blocks**, instead of two separate sessions. Both blocks use the existing wildcard cert (no new certbot run). Both have small blast radius (explicit server_name → no impact on default or wildcard vhosts).

Recommended execution order when ready to ship Phase 2:
1. Edit `rpc.ela.city` A record at GoDaddy → `38.242.211.112` (1 min — Sasha)
2. SSH to Contabo, audit existing default vhost's `location /rpc/esc { proxy_pass ... }` to identify the local ESC RPC backend port (5 min)
3. Drop both new server blocks into `/etc/nginx/sites-available/{elastossmartchain.ela.city,rpc.ela.city}.conf`, symlink to `sites-enabled/` (15 min)
4. `nginx -t && systemctl reload nginx` (1 min)
5. Strict-TLS probes against both new hostnames — expect JSON-RPC, not 404 (5 min)
6. Ship A8 code patch (`pc2-node` 3-file diff, atomic commit) — Sasha is unblocked for this (30 min)
7. Ship Phase 2 client-side `BASE_RPC_URLS` update in `pc2-node/src/static.ts` to put `https://rpc.ela.city/base` first (15 min)

Total bundled effort: ~75–90 min. Cleaner than serialising A8 → SUPERNODE-RPC-PROXY as two separate sessions touching the same nginx config.

See [`SEC-2026-04-22-WAVE6-HARDENING.md`](../SEC-2026-04-22-WAVE6-HARDENING/SEC-2026-04-22-WAVE6-HARDENING.md) §"2026-05-25 PM — A8 live-probe finding" for the full nginx snippet + verification procedure for the `elastossmartchain.ela.city` block.

**Options evaluated for unblocking community-node parity**:

| # | Option | Time | TLS | Trade-off |
|---|---|---|---|---|
| A | Repoint `rpc.ela.city` → InterServer, deploy nginx→Alchemy on InterServer | 2-3h | ✓ wildcard | **Requires DNS edit access** (User blocked) |
| B | Same but Contabo workhorse, InterServer TLS frontend over WG | 4-5h | ✓ wildcard | Same DNS blocker |
| C | Use existing live subdomain path (e.g. `https://node1.ela.city/rpc/base`) | 2-3h | ✓ wildcard | Aesthetically uglier; can rename when DNS unblocked |
| D | Ship v1.2.7 with no supernode default, operators DIY their own Alchemy key | 10 min | n/a | Bad UX for non-tech operators |

**User decision (2026-05-02 22:49 PST)**: Option D for v1.2.7. Rationale captured by User:
- `rpc.ela.city` ownership uncertain ("i think the rpc.ela.city is used is it not too? perhaps not im unsure")
- DNS edit blocked from USA travel
- Prefers to wait for proper DNS round-trip rather than ship a half-measure

**v1.2.7 polish work that DID land tonight to support the opt-in path**:

1. **Conditional-spread fix in `ecosystem.config.cjs`** — without this, `pc2-node/.env` was silently ignored for opt-in vars (the dotenv override gap). Now operators who follow the docs' advice and set `SUPERNODE_RPC_URLS=...` in `.env` actually get it picked up. End-to-end verified across all three permutations (shell-only, env-only, both).
2. **CHANGELOG section** — explicit "what to expect on first mint after v1.2.7 update" with verbatim Alchemy walkthrough for operators (5 steps, ~5 minutes).
3. **`.env.example` already documents** `SUPERNODE_RPC_URLS` syntax and links to provider sign-ups.

**v1.2.8 plan unchanged**: Phase 2 supernode RPC proxy, gated on User's Thailand DNS round-trip when back from USA. When that lands, no operator action required — `pc2-node/src/static.ts` default changes from public-only to supernode-first, every community node updates seamlessly.
