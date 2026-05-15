# Elacity Labs — Weekly Team Update for the World Computer Initiative (WCI)
## May 7 – May 15, 2026

> **A consolidation week across PC2, Runtime, partnerships, and strategy — and honest about that.** PC2 `main` didn't move (last tag `v1.2.7.14` shipped May 6); the team turned attention to laying the foundations for the next two releases. **v1.2.8.0 = telemetry, self-diagnostic and one-click support reports — 2 819 inserted lines on its own feature branch, ready to merge.** **Two parallel IPFS branches** consolidated upload paths and added scoped CAR replication, with `ipfs.ela.city` joining the cluster and **~18 000 historical Elacity pins now replicated across three countries** (Elacity flagship + Contabo + GCP) — a meaningful step on the durability/decentralisation axis. **A new MPEG-DASH manifest generator** brings the internal encoder into strict standards-compliance. A **serverless Chipotle proxy** went live, eliminating the wire-leak of the keystore API key. **The PC2↔Runtime Convergence Inventory** was refreshed with post-launch reality. And on Friday, **a responsibly-disclosed pre-authentication RCE on the flagship supernode was patched the same day** — the patch had been on `main` for 23 days but never deployed, which became the root-cause fix: a new **automated, smoke-tested supernode deploy script** with built-in rollback. By end of week both supernodes are fronted by nginx, all direct public-facing port bindings gone, TLS verification end-to-end, and the network map (`map.ela.city`) is back online after a 9-hour outage that fell out of the same incident response. **In parallel, Elastos Runtime advanced into stricter authority-layer territory** — Wallet promoted to the main blockchain surface, Browser locked into a controlled capsule with provider-mediated `window.ethereum`, `ela.city` and Glide compatibility fixes routed through Runtime providers, and review-slice planning for the upcoming `0.3.0` branch. **The Elastos Node Manager (ENM)** moved into final-shape territory — BPoS-aware, full-node operations console, ready to ship as a dApp-Centre installable app. **Partnership conversations opened with a leading privacy-protocol team** about adding a privacy layer to the Elastos main chain via a Mimblewimble + Lelantos hybrid, in the extension-blocks pattern (proven by LTC/MWEB) rather than a side-chain. **And the CEO's continuous US travel cycle closed** with a published community update reframing the entire product as the "Elastos World Computer" — one user-owned execution layer, four converging environments (PC2 / Runtime / Carrier / Blockchain). **8 commits across 3 branches, 6 348 insertions, 2 900 deletions, 34 files.**

### Key Links This Week

- **Latest tagged PC2 release** — [Elacity/pc2.net v1.2.7.14](https://github.com/Elacity/pc2.net/releases/tag/v1.2.7.14) (still current; `v1.2.8.0` on track for next release window once T-1 telemetry merges)
- **T-1 telemetry foundation branch** — [`feat/t-1-telemetry-and-support`](https://github.com/Elacity/pc2.net/tree/feat/t-1-telemetry-and-support)
- **IPFS upload-path consolidation branch** — [`dev/ipfs-connectivity`](https://github.com/Elacity/pc2.net/tree/dev/ipfs-connectivity)
- **MPEG-DASH manifest fix branch** — [`dev/fix-dash`](https://github.com/Elacity/pc2.net/tree/dev/fix-dash)
- **Chipotle GCF proxy (new repo)** — [Elacity/chipotle-functions](https://github.com/Elacity/chipotle-functions) → live at `https://europe-west1-elacity.cloudfunctions.net/chipotle-proxy`
- **Automated supernode deploy script** — [`scripts/deploy-supernode.sh`](https://github.com/Elacity/pc2.net/blob/feat/t-1-telemetry-and-support/scripts/deploy-supernode.sh)
- **Elastos Runtime** (active stewardship continues) — [Elacity/elastos-runtime](https://github.com/Elacity/elastos-runtime); [Architecture](https://github.com/Elacity/elastos-runtime/blob/main/docs/ARCHITECTURE.md); [Principles](https://github.com/Elacity/elastos-runtime/blob/main/PRINCIPLES.md); [Roadmap](https://github.com/Elacity/elastos-runtime/blob/main/ROADMAP.md)
- **Privacy-layer partnership conversation** — [Beam](https://beam.mw) (Mimblewimble + Lelantos hybrid; extension-blocks pattern proven by LTC / MWEB)
- **Full canonical write-up (with statistics tables)** — [docs/updates/Community_Update_May_7_May_15_2026.md](https://github.com/Elacity/pc2.net/blob/feat/t-1-telemetry-and-support/docs/updates/Community_Update_May_7_May_15_2026.md)
- **Previous weekly report** — [Week of Apr 26 – May 6, 2026 (#15)](https://github.com/Elacity/pc2.net/discussions/15)
- **PC2 install (one-liner)** — `bash <(curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/update.sh)`
- **ElastOS Runtime install** — `curl -fsSL https://elastos.elacitylabs.com/install.sh | bash`
- **Network Map** — [map.ela.city](https://map.ela.city) (back online May 15 after a 9-hour outage that fell out of the supernode incident response) | **Portal** — [portal.ela.city](https://portal.ela.city)

---

## Table of Contents

1. [The Big Picture — A Consolidation Week Across Four Workstreams](#the-big-picture--a-consolidation-week-across-four-workstreams)
2. [T-1 Telemetry, Self-Diagnostic & User-Initiated Support Reports (v1.2.8.0)](#t-1-telemetry-self-diagnostic--user-initiated-support-reports-v1280)
3. [IPFS Pinning Evolution — Scoped CAR Replication + `dag/import` + Cluster Onboarding](#ipfs-pinning-evolution--scoped-car-replication--dagimport--cluster-onboarding)
4. [MPEG-DASH Manifest Standardisation](#mpeg-dash-manifest-standardisation)
5. [Chipotle Migration Path — Serverless Proxy + Lit Actions Consolidation](#chipotle-migration-path--serverless-proxy--lit-actions-consolidation)
6. [PC2 ↔ Runtime Convergence Inventory Refresh](#pc2--runtime-convergence-inventory-refresh)
7. [Responsibly-Disclosed RCE Remediation — Same-Day Patch + Structural Hardening](#responsibly-disclosed-rce-remediation--same-day-patch--structural-hardening)
8. [Supernode Deploy Automation — Root-Cause Fix for the RCE Incident](#supernode-deploy-automation--root-cause-fix-for-the-rce-incident)
9. [ENM (Elastos Node Manager) — BPoS-Ready Operations Console](#enm-elastos-node-manager--bpos-ready-operations-console)
10. [Elastos Runtime — Stricter Authority-Layer Boundaries + `0.3.0` Planning](#elastos-runtime--stricter-authority-layer-boundaries--030-planning)
11. [Partnership Conversations — Exploring a Privacy Layer for the Main Chain](#partnership-conversations--exploring-a-privacy-layer-for-the-main-chain)
12. [Closing the US Travel Cycle — The Elastos World Computer Thesis Crystallises](#closing-the-us-travel-cycle--the-elastos-world-computer-thesis-crystallises)
13. [Looking Ahead — v1.2.8.0, v1.2.9.0, Runtime `0.3.0`, and Beyond](#looking-ahead--v1280-v1290-runtime-030-and-beyond)
14. [Summary Statistics](#summary-statistics)

---

## The Big Picture — A Consolidation Week Across Four Workstreams

The previous report closed with **thirteen point releases in six days** (v1.2.1 → v1.2.7.13) and a **convergence release** that finally made the desktop, the app store, dDRM, identity, payments, and runtime permissions feel usable together. This week deliberately stepped off that release cadence and into a **consolidation phase across four workstreams running in parallel**:

1. **PC2 — branch work for the next two releases.** `main` didn't move (last tag `v1.2.7.14` from May 6). Foundations went down on feature branches:
   - **v1.2.8.0** — telemetry, self-diagnostic, and user-initiated support reports. **Ready on its branch** (`feat/t-1-telemetry-and-support`), 2 819 inserted lines, awaiting one more review pass before merge.
   - **v1.2.9.0** — Chipotle relayer (deprecates the keystore API key on the wire). **Server-side now live** as a Google Cloud Functions proxy in a new repo (`Elacity/chipotle-functions`); client-side switch still requires the consolidated Lit Actions that are pushing next.
   - **Two parallel IPFS branches.** `dev/ipfs-connectivity` consolidates upload paths and adds **scoped CAR replication**; `dev/fix-dash` brings the internal MPEG-DASH manifest generator into **strict standards-compliance**.
   - **Cluster expansion.** `ipfs.ela.city` (Google Cloud) joined the Elacity IPFS Cluster as third peer alongside the two supernodes. **~18 000 historical Elacity NFT-related pins are now replicating across three countries** — the first time the historical Elacity content set is actively replicated rather than relying on a single node.

2. **Runtime — stricter authority-layer boundaries.** The work this week pushed Runtime out of "convergence-release demo shell" territory and into "stronger authority layer" territory. **Wallet was promoted to the main blockchain surface** (accounts, approval methods, receive QR/address display, MetaMask linking, BTC groundwork, ESC/Base/BTC account direction). **Browser was locked into a controlled capsule** that exposes a constrained `window.ethereum` instead of raw wallet or chain access. **`ela.city` and Glide compatibility** was fixed by routing account discovery, ESC default chain selection, typed signing, transaction approvals, and read-only chain calls through Runtime providers. **Review-slice planning for the upcoming `0.3.0` branch** is underway. The architectural principle: **capsules can only reach the outside world through Runtime / Carrier / provider mediation, and all capsule-initiated external effects must be auditable.**

3. **Supernode infrastructure — responsibly-disclosed RCE remediation.** Friday May 15: a pre-authentication shell-injection vulnerability in one of the gateway registration endpoints was reported by an external researcher. The fix had been on `main` for **23 days** (commit `16dccaf39`, April 22) but had never been deployed — a "the patch exists, but only in source control" failure mode that we want to make impossible. **Same-day response** covered: stop-the-bleed kill-switches, full code-patch deploy to both supernodes, structural hardening (nginx fronting on both, ufw blocks on internal-only ports, TLS verification end-to-end, removal of orphaned `NODE_TLS_REJECT_UNAUTHORIZED=0`), and a **new automated deploy script** that smoke-tests every change and auto-rolls back on failure. The exploit endpoint that returned `uid=0(root)` in the morning returns `HTTP 400 "Invalid username"` by end of day. `map.ela.city` came back online after a 9-hour outage as a side effect of the structural hardening.

4. **Strategy — partnerships and the World Computer thesis.** The CEO's continuous US travel cycle (Google Next, Bitcoin Las Vegas, Consensus Miami) closed this week with a **published community update reframing the entire product as the "Elastos World Computer"** — one user-owned execution layer, four converging environments (PC2 / Runtime / Carrier / Blockchain). In parallel, **technical partnership conversations opened with a leading privacy-protocol team** about adding a privacy layer to the Elastos main chain — a Mimblewimble + Lelantos hybrid, integrated in the extension-blocks pattern (proven by LTC/MWEB), not as a side-chain. And **ENM (Elastos Node Manager)** moved into final-shape territory: BPoS-aware, full-node operations console, ready to ship as a dApp-Centre installable app — the first operator-grade tool delivered through the dApp Centre.

Everything below is the detailed breakdown of these four workstreams.

---

## T-1 Telemetry, Self-Diagnostic & User-Initiated Support Reports (v1.2.8.0)

> _Single squash-merged commit on `feat/t-1-telemetry-and-support`: [`e8ad84691`](https://github.com/Elacity/pc2.net/commit/e8ad84691) — 14 files changed, **2 819 insertions, 121 deletions**. The largest feature delivery of the week._

This is the foundation that unblocks **feedback-driven optimisation** — the ability to say to any user "go to Settings → Health & Support, click the Report button, and we'll be able to see exactly what's going on" without asking for log paths, file uploads, or screen shares. Built as an **extension of existing infrastructure** (`pc2-node/src/utils/diagnose.ts` and `telemetry.ts`) rather than a greenfield rebuild — the existing telemetry primitives were already strong, they just needed user-facing surfaces and aggregation.

### T-1A — Self-Diagnostic

A live, in-app diagnostic panel that runs **eleven categorised checks** every time it opens:

- **Runtime:** PC2 version (resolved from `package.json` via a new `resolvePc2Version()` helper that doesn't depend on `npm_package_version` env at runtime), Node.js version, platform/arch/CPU/memory snapshot, uptime
- **Network:** WAN reachability, supernode roster health (`/api/supernodes`), Boson DHT presence, IPFS swarm peer count
- **Storage:** IPFS Kubo health (`/api/v0/version`), Cluster peer-set, local datastore size, free disk
- **Wallet:** tethered wallet count, owner-set flag, signing-key presence
- **DRM:** Chipotle reachability, last successful key fetch, session-key delegation expiry

Each check returns `{ ok | warning | error, message, durationMs, ...detail }` so a future "post-mortem replay" can reconstruct the exact health state the system was in at any moment a user clicked "Report."

A polyfill for ESM `__dirname` was added to `diagnose.ts` (it was reading `__dirname` directly, which is CommonJS-only; the new module is shipped as ESM). This was the cause of an `HTTP 500` from the diagnostic API during early integration testing — caught and closed before merge.

### T-1B — User-Initiated Support Reports

**Phase 1: Local preview.** Settings → Health & Support card now has a "**Preview Report**" button that opens a rendered preview of exactly what would be submitted: the eleven diagnostic checks, recent log tail (last 5 000 lines, redacted for paths under `~/.config/`, `~/.ssh/`, and any string matching common secret patterns), and a wallet-address resolution. Users see exactly what's leaving their machine before they commit to sending it.

**Phase 2: Submission flow** (wired in this commit, endpoint enabled at flip of a feature flag — held until T-1C aggregation is observable on the receiving end so we can measure submission rates from day one).

The Health & Support UI lives at `app/settings/health-and-support/` and was modelled on a small standalone diagnostic test-app (`elacity-health/index.html`) that uses the same `/whoami` and `/api/diagnose` endpoints. That test-app surfaces a "**Cannot resolve wallet address**" error during early integration if the API path is wrong — caught by switching `/api/whoami` → `/whoami` and broadening the wallet extractor.

### T-1C — Aggregated Telemetry (Local SQLite Metrics)

The local plumbing that makes the Self-Diagnostic + Support Report system useful at fleet scale. Counter and Histogram primitives backed by an in-process SQLite metrics store; hot-paths in the gateway are now instrumented:

- **Request counters** — per-route, per-status-code, per-method
- **Latency histograms** — p50/p90/p99 buckets for `/api/health`, `/api/supernodes`, `/api/diagnose`, registration endpoints
- **Cache stats** — registry-cache hits/misses, eviction counts
- **Pool stats** — proxy keep-alive socket lifecycle (active/created/reused/evicted/health-failed)

The Health & Support card now surfaces these counters live (no flusher round-trip), with a `.metrics-card` direct style so the panel is visible by default (a transient bug where the panel was hidden by the inherited `.card { display: none }` was caught during local UI verification and fixed by lifting the metrics card out of the generic `.card` cascade).

### Why this is the v1.2.8.0 headline

**Feedback-driven optimisation requires that any user with an issue can hand us a perfect snapshot in one click.** Today that requires log paths, file uploads, and back-and-forth. After v1.2.8.0 lands, it requires one button press. The infrastructure is also the foundation for **automated self-healing** (a future report can trigger a remediation directly), **fleet-level performance dashboards**, and **regression detection across releases**.

### Companion: Runtime Heartbeat Helper

A small additional file landed alongside T-1: `pc2-node/src/utils/runtime-heartbeat.ts`. This complements the launcher↔pc2-node heartbeat protocol (`pc2.heartbeat.v1`) introduced in v1.2.7.13, surfacing the heartbeat state to the Self-Diagnostic so the panel can tell whether the launcher believes pc2-node is healthy (separate from whether pc2-node believes itself healthy).

---

## IPFS Pinning Evolution — Scoped CAR Replication + `dag/import` + Cluster Onboarding

> _Four commits on `dev/ipfs-connectivity`, all May 7: [`83d266df3`](https://github.com/Elacity/pc2.net/commit/83d266df3) pssh v3 alignment, [`dafc9cfe1`](https://github.com/Elacity/pc2.net/commit/dafc9cfe1) `.car` upload after `pin/add`, [`ee9e9b731`](https://github.com/Elacity/pc2.net/commit/ee9e9b731) putter v2 removal, [`0c1f4c72a`](https://github.com/Elacity/pc2.net/commit/0c1f4c72a) consolidated upload paths + scoped CAR replication. **15 files changed, 3 045 insertions, 2 757 deletions.**_

This branch is a structural cleanup of how PC2 pins content to IPFS, with the new `dag/import` endpoint exposed by the cluster as the lever that makes recursive replication actually work.

### The "two upload paths" problem

Before this branch, PC2 had **two parallel upload paths** that had diverged over time:
- A v1 path (the original) using `/api/v0/add` followed by an explicit `/api/v0/pin/add`
- A v2 path ("putter v2") that had been bolted on for a specific media flow

Neither path was recursive in the way it needed to be — `pin/add` on a directory CID would pin the root block but **not** automatically replicate the children across the cluster. Combined with two paths to maintain, this was friction.

### The fix: one path, CAR-based, scoped replication

- **Both upload paths consolidated** into a single canonical entry point. Putter v2 removed.
- After each `pin/add`, an attempt is made to **upload a `.car` file** of the same content tree to `/api/v0/dag/import` (the cluster proxy endpoint, newly exposed at the cluster layer). This is how the cluster learns about the entire object graph at once, not just the root CID, so it can fan out replication correctly.
- A new option, `carReplicate: true | false | undefined`, can be set **per-file or per-directory** rather than globally. This gives creators and operators the right level of control over what's worth replicating versus what's local-only (saves cluster bandwidth and disk for genuinely ephemeral content).

### The cluster onboarding side

In parallel with the branch work, `ipfs.ela.city` (a Google Cloud Engine node) was added as the third Elacity Cluster peer alongside the two supernodes. Sequence:

1. The cluster node was reconfigured to bind on `/ip4/0.0.0.0/tcp/9096` and `/ip4/0.0.0.0/udp/9096/quic` (was internal-IP only).
2. Both Elacity supernodes added a UFW allow rule for the cluster's public IP on tcp/udp 9096.
3. Symmetric handshake established. The new peer's `peerid` is now visible in the cluster peer-set on both supernodes.
4. **The `/api/v0/pin/add` endpoint on `ipfs.ela.city:5001` was swapped to point at the cluster proxy service** (under the hood, the same `127.0.0.1:5001` URL, but resolving to cluster-proxy instead of bare kubo). Net effect for any external client: identical API, but every new pin is automatically replicated across the cluster.
5. The `dag/import` endpoint was exposed at the cluster proxy layer too, so the PC2-side upload path described above lands directly into a replicated namespace.

### The 18 000-pin backfill

Once the new peer was in the cluster, all historical pins on `ipfs.ela.city` (predominantly Elacity NFT-related content, accumulated over years) started replicating across the other two peers automatically. **~18 000 pins, ~340 GB**, currently in flight. End state: the entire historical Elacity content set will be backed up across **three independent geographies** (US East / EU / GCE), which is a meaningful step on the durability + decentralisation axis. **This is the first time the Elacity NFT historical asset set has been actively replicated rather than relying on a single node.**

### Pssh v3 alignment

A small targeted fix in the same branch: the **Protected System Specific Header (PSSH)** input data that PC2's encryption flow writes into encrypted media files needed adjustment to match the V3 protection schema introduced in the convergence release. Four lines changed, but it's the kind of one-character bug class where a wrong byte order or wrong length-prefix means the entire CENC container fails to parse on the player side. Caught and fixed during cross-validation against the unified `cenc:lit-aes-gcm-v3` protection type.

---

## MPEG-DASH Manifest Standardisation

> _One commit on `dev/fix-dash` (May 8): [`9fdf4f7ef`](https://github.com/Elacity/pc2.net/commit/9fdf4f7ef) — 3 files changed, **50 insertions, 17 deletions.**_

PC2 ships its own internal **DASH packager + MPD generator** (instead of shelling out to the reference `mp4dash` tool) for three reasons: it keeps the encryption flow in-process (the content encryption key never leaves the PC2 boundary), it's much faster, and it has no native-binary dependency. But the upside comes with a cost: the generator has to produce **exactly the manifest XML structure that DASH players expect**, byte-equivalent to what the reference tool would produce, or playback breaks in subtle ways (some players are lenient, others are strict).

### The drift that was found

A cross-comparison between the PC2-produced manifest and an `mp4dash`-produced manifest for the same source media surfaced a **structural divergence in the `<AdaptationSet>` block**:

- **Before:** `<AdaptationSet>` → `<Representation>` → `<SegmentTemplate>` (template nested inside each representation)
- **After (standards-compliant):** `<AdaptationSet>` → `<SegmentTemplate>` (hoisted to the adaptation set, with `$RepresentationID$` placeholder) + `<Representation>` (sibling)

The `SegmentTemplate` is supposed to be a **sibling** of the representations under the adaptation set (so all bitrate variants share the same template, parameterised by `$RepresentationID$`), not a **child** of each representation. The previous structure happened to work for many players but produced different bytes than the reference, which mattered the moment any strict player or downstream tool was introduced into the path.

### What changed

- `pc2-node/src/services/media/mpdGenerator.ts` — restructured to emit the standards-compliant tree shape
- `pc2-node/src/services/media/dashPackager.ts` — updated to support the new directory layout that pairs with the new manifest shape
- `pc2-node/src/services/media/mpdParser.ts` — the existing parser is **already robust enough** to read both the old and new shapes (it's regex-based extraction, so the structural reordering doesn't break it), confirmed by tests against both shapes

### Cross-device impact

The fix is purely on the **encoder/server** side. **No player-side change required.** PC2's Rust/WASM player on Mac, Windows, and Jetson — and any standards-compliant external player a creator might use to verify their content — will all consume the new manifests cleanly. Existing already-encrypted content on the network continues to play (the parser handles both shapes).

### Example output

A reference run that produced standards-compliant `stream.mpd` (visible at `https://ipfs.ela.city/ipfs/bafybeicfkbtbwdlthsv7p5y7px7kecelbbl2saj3sgqac4atiapyybg3mq/`) confirms the new structure is byte-equivalent to `mp4dash` output.

---

## Chipotle Migration Path — Serverless Proxy + Lit Actions Consolidation

This is the in-flight migration to **remove the Lit Chipotle keystore API key from the wire entirely**. Two parts:

### Part 1: Serverless GCF Proxy (LIVE)

A new repository, **[`Elacity/chipotle-functions`](https://github.com/Elacity/chipotle-functions)**, hosts a minimal Google Cloud Functions proxy that the team stood up this week. Live at:

```
https://europe-west1-elacity.cloudfunctions.net/chipotle-proxy
```

The proxy is a **drop-in replacement for the Lit Chipotle API endpoint**: clients can switch the base URL from the official Chipotle API to the proxy and **stop sending the `X-Api-Key` header entirely**. The proxy injects the key server-side. This eliminates the **client-side wire leak** of the keystore secret — the same secret that any browser or PC2 client could read out of the request payload.

Architectural framing: this is a **short-term decentralisation tradeoff** (one new central service, replacing the previous client-side secret) **but a major immediate security win** (the secret is no longer on every client's filesystem). It's the bridge to the longer-term Chipotle Relayer (v1.2.9.0) where every PC2 supernode can act as a relayer itself, fully decentralising the path.

Cost is per-request, very small — billed on the GCF free tier or close to it for current volumes.

### Part 2: Client switch (forthcoming, v1.2.9.0 trigger)

The PC2 client (`pc2-node/src/api/chipotle-client.ts`) needs a 3-line change to point at the GCF proxy and drop the `X-Api-Key` header. **Not made yet** — it's gated behind the consolidated Lit Actions push (next), so the client switch and the action update land together in v1.2.9.0.

### Part 3: Consolidated Lit Actions (forthcoming)

Currently the dDRM path uses **a handful of Lit Actions** (separate scripts for media vs non-media, EOA vs Smart Account, encrypt vs decrypt). These are being **consolidated to two**:

- **One encryption action** — handles all four combinations (media + non-media, EOA + SA)
- **One decryption action** — same matrix

Push to `main` is expected within the next two working days, along with the migration documentation. After that, the client switch in Part 2 lands cleanly and v1.2.9.0 can ship.

---

## PC2 ↔ Runtime Convergence Inventory Refresh

> _One commit on `feat/t-1-telemetry-and-support`: [`bd9110f48`](https://github.com/Elacity/pc2.net/commit/bd9110f48) — 1 file changed, **40 insertions, 5 deletions**._

The **`docs/handover/PC2_CONVERGENCE_INVENTORY_FOR_RUNTIME.md`** doc — the feature-by-feature mapping of what PC2 v1 ships today versus what each piece becomes inside an Elastos Runtime capsule — was refreshed with post-launch reality:

- Repository table updated to reference the **stable repo paths** (not in-flight feature branches that have since been merged or deprecated): `feature/lit-chipotle-migration` and `feature/metadata-alignment` were the right pointers two weeks ago; today the canonical references are the merged code on `main` plus the active `feat/t-1-telemetry-and-support`
- Phase-timeline block added at the top: **2026-05-06 snapshot** documenting PC2 `v1.2.0` → `v1.2.7.14` shipping cadence and Runtime `v0.2.0` milestone, with explicit "what was added between snapshots" notation
- Five link updates to point at correct paths after the v1.2 release

The doc is the strategic reference for **how PC2 features migrate into Runtime capsules over time** — for example, how PC2's IPFS pinning becomes a Runtime "Storage capsule capability", or how PC2's dDRM gateway becomes a Runtime "Access capsule." The refresh keeps the doc honest as the underlying systems evolve.

---

## Responsibly-Disclosed RCE Remediation — Same-Day Patch + Structural Hardening

A **responsibly-disclosed pre-authentication shell-injection vulnerability** in one of the gateway registration endpoints on the flagship supernode was reported by an external researcher early Friday May 15. Same-day full remediation:

### The root cause

The fix for this exact class of bug had landed on PC2 `main` on **2026-04-22** (commit `16dccaf39`, "SEC-2026-04 Wave 3" — switching `execSync` shell calls to `execFileSync` with array arguments + strict input validation). The supernodes were redeployed **2026-04-27 and 2026-04-28** — *five days after* the patch was in source control — but the redeploy used a stale local checkout that pre-dated the patch. The result: **a 23-day window where the fix existed in `main` but had never reached production**. The researcher's report ended that window.

### The same-day response

A structured five-phase remediation, all on Friday May 15:

1. **Phase 1A — stop the bleed** (~7 min, applied 13:45–13:52 UK): four targeted `503` kill-switches at the very top of the four register endpoints — pure path-blocks, no state mutation, fully reversible. New registrations returned `503 "registration temporarily unavailable for maintenance"` for the next hour; existing peers (Wireguard, AmneziaWG, VLESS-Reality, plus all registered PC2 nodes) kept working uninterrupted.
2. **Phase 2 — full code patch deploy** (~6 min, applied 13:55–14:01 UK): the `SEC-2026-04 Wave 3` patch from `main` was deployed to both supernodes (atomic swap + smoke test + reload). After Phase 2 the exploit endpoint returns `HTTP 400 "Invalid username (must be 3–30 chars, lowercase alphanumeric with _ or -)"` instead of the previous root-output. Inline Phase 1A 503-blocks were removed since the code-level fix supersedes them.
3. **Phase 3 Stage A — audit** (14:02–14:20 UK): read-only profile of both supernodes to identify orthogonal hardening items. Surfaced: a Contabo `pc2-node` systemd unit in a restart loop (12 052 attempts/day from a port conflict with a PM2-managed process holding the same ports — preventable noise); an InterServer `nginx` service that had died at 06:55 UTC the same morning from a port-collision-on-manual-start; an orphaned `NODE_TLS_REJECT_UNAUTHORIZED=0` env on Contabo's slim gateway (a legacy workaround that disabled TLS certificate verification for all outbound HTTPS calls — small MITM gap).
4. **Phase 3 Stage B-1 — Contabo failure loop halt** (14:22 UK): the failing systemd unit moved aside (with a revert script), `daemon-reload` issued. **12 052/day restart attempts → 0.** PM2-managed instance unchanged, online.
5. **Phase 3 Stage C-2 — MITM gap closure on Contabo** (14:02–14:06 UK): `PRIMARY_GATEWAY_URL` switched from the supernode's IP to its domain (so the served Let's Encrypt cert SAN actually matches), `NODE_TLS_REJECT_UNAUTHORIZED=0` removed. **Full TLS verification end-to-end on every upstream call.** Pre-flight test confirmed Contabo can already reach the new domain with proper TLS verification before the change is applied, so the env-var bypass is genuinely orphaned. One-shot revert script (`/root/revert-c2.sh`) saved.
6. **Phase 3 Stage C-1 — InterServer fronted by nginx** (14:54–14:57 UK): the flagship gateway was migrated from binding `*:80+*:443` directly to **binding `127.0.0.1:3080+127.0.0.1:3443`**, with **nginx terminating TLS on `*:80+*:443`** and reverse-proxying to the localhost gateway. Same Let's Encrypt wildcard cert (`*.ela.city`) used by both layers. UFW deny rules added for tcp/3080 + tcp/3443 from the outside so the gateway can **only** be reached via nginx. Bonus side effect: **`map.ela.city` came back online** after its 9-hour outage (its dead-nginx situation healed as part of bringing nginx up cleanly). Discovered during smoke-testing: the gateway's internal HTTP→HTTPS redirect didn't honor `X-Forwarded-Proto: https`, causing a redirect loop on first try — patched live by switching nginx's `proxy_pass` from `http://127.0.0.1:3080` to `https://127.0.0.1:3443` (with `proxy_ssl_verify off` since it's localhost), zero-downtime reload, loop resolved. **Effective public HTTP downtime during the cutover: ~115 seconds.**

### End-state architecture (both supernodes)

```
Internet ─ :80 ─> nginx (HTTP server) ─ 301 ─> https://$host$request_uri
Internet ─ :443 ─> nginx (TLS terminate, Let's Encrypt) ─ proxy ─> gateway on localhost
                                                                       │
                                                       ufw blocks external :3080 + :3443
```

Both supernodes now sit behind nginx; no public-facing direct port bindings; TLS verification end-to-end. **All eleven systemd services on the flagship are active** (gateway, network-map, cloud-node, app-registry, vless-reality, ipfs-relay, cluster, kubo, boson, amneziawg, nginx). Contabo's PM2-managed slim gateway is active. Registry preserved exactly (117 entries before → 117 after; 35 WireGuard peers before → 35 after; 4 supernodes before → 4 after).

### Researcher disclosure

The researcher is being credited and a bounty is being processed. The exact CVE-class details and exploit string stay private to protect any other deployments running pre-patch code; the responsible-disclosure window is closed on the Elacity supernodes as of Friday May 15 ~15:00 UK.

---

## Supernode Deploy Automation — Root-Cause Fix for the RCE Incident

> _One commit on `feat/t-1-telemetry-and-support`: [`8e11c4d61`](https://github.com/Elacity/pc2.net/commit/8e11c4d61) — 1 file added, **394 insertions**._

The RCE incident's root cause — *the patch existed in `main` for 23 days but never reached production* — is the kind of failure mode that's permanently solvable with one tool: an **automated, repeatable, smoke-tested deploy script with built-in rollback**. `scripts/deploy-supernode.sh` is that tool.

### What it does

```bash
./scripts/deploy-supernode.sh interserver         # deploy main HEAD to one supernode
./scripts/deploy-supernode.sh contabo             # deploy main HEAD to the other
./scripts/deploy-supernode.sh all                 # both, sequenced (least-blast-radius host first)
./scripts/deploy-supernode.sh --dry-run all       # show what would change, no execution
```

Pipeline per host:

1. **Backup** deployed `index.js` + `lib/` to a timestamped path on the remote
2. **Build manifest** of files to ship (diff `main` vs deployed)
3. **Upload** to a `.deploy-staging/` directory on the host (atomic-swap target)
4. **Pre-swap syntax validation** — `node --check` every file (catches syntax errors before they reach the live path; deliberately copies to a `.js`-extensioned temp path on the remote to bypass Node's ESM extension trap)
5. **Atomic swap** — `mv staging/ live/` is a single inode rename, no half-deployed state possible
6. **`systemctl restart`** the gateway
7. **Smoke-test the new code** — `/api/health` is 200, `/api/supernodes` returns valid JSON, the exploit endpoint returns 400 (not 503, not root output)
8. **On any smoke-test failure** — auto-revert from the backup, alert the operator, exit non-zero. The host can never be left in a broken state by this script.

### Security hardening of the script itself

- **No password echoing.** Where SSH password auth is used, the password is passed via the `SSHPASS` environment variable (`sshpass -e`) rather than `sshpass -p $PASSWORD`. `set +x` guards wrap every section where the password is in scope. The password never appears in `bash -x` traces or `ps auxf`.
- **`set -e` + `trap`** ensures any unexpected error aborts the script immediately with a clean state.
- **Idempotent** — re-running the script is safe; it detects "already at main HEAD" and skips no-op deploys.
- **Smoke-tested via `--dry-run all`** before being committed — all six smoke checks green on both hosts in ~40 seconds.

### Why this is the deliberate "root-cause fix"

Today's RCE was patched in source control April 22 and never reached production until May 15. **An automated deploy pipeline closes that window permanently.** Future direction: wire this script as a GitHub Actions workflow on push to `main`, so any patch reaches the supernodes within the time it takes for tests to run (currently a few minutes). For now it's manual but repeatable; the wiring to GitHub Actions only requires SSH deploy keys, which is a separate piece of operations housekeeping.

---

## ENM (Elastos Node Manager) — BPoS-Ready Operations Console

A new full-node operations console for the Elastos mainchain, built by the Elacity team to ship as an **installable dApp-Centre app**. The first version is BPoS-only (BPoS supernode operators are the most operationally-demanding audience); general full-node observer support is in the same codebase.

### Installation and setup

On a fresh server, ENM's first-launch flow is a guided multi-step conversation:

- **Welcome / role selection** — BPoS supernode operator or general full-node observer. Each role enables or hides downstream steps.
- **Preflight** — verifies host OS (**Ubuntu / Debian only**), free disk against ELA's data-growth profile, CPU class, and system clock against ELA's block-timestamp tolerance. **Each check passes or fails individually with a recommendation, not a generic error.** If the host isn't Linux, ENM warns or refuses to proceed (it's not a deployment target for the chain binary).
- **Binary install** — pulls a **version-pinned** `ela` binary from official releases and verifies it on disk.
- **Snapshot vs genesis-sync** choice for the chain data.
- **Keystore generation** — produces the `keystore.dat` signing file and shows the public key to paste into Elastos Essentials when registering as a producer.
- **Network step** — auto-detect public IP or manual override.

After this, ENM writes the chain config and starts the node. From then on, the app is the operations surface.

### The four tabs

**Dashboard.** A composite live view of the chain:
- **Hero power circle** that reflects state (running, syncing with a percent ring, stalled, errored, stopped, unconfigured) and doubles as the start affordance when the chain is off
- **Block height** with a sparkline trend
- **Peer counts** broken into inbound and outbound
- **Uptime**, chain version
- **System status strip** below: host CPU load, RAM usage, free disk, OS version, process uptime
- **Node-identity card** — public key, signing address, and explicit distinction between the signing address and the Essentials wallet that owns the producer registration and receives rewards
- **BPoS card** (surfaces when registered as a producer) — on-duty state, vote totals (DPoSv1 + DPoSv2), rank, deposit, position in the arbiter rotation
- **Binary-update card** when a newer `ela` release is detected upstream

**Logs.** Live tail of the chain's log file over Server-Sent Events:
- ANSI color codes stripped on ingest
- **Severity chips** toggle Error / Warning / Info / Debug visibility
- **Search field** with substring + regex (slash-delimited)
- **Adjacent identical lines auto-collapse** with a `× N` counter so a flood of repeated entries during sync doesn't bury the rest of the feed
- Live/paused toggle, copy-to-clipboard, **5 000-line DOM cap** with a sticky banner when older lines are dropped, scrollback independent of the rest of the page

**Settings.** Six task-oriented sections:
- **Access** — RPC whitelist editor (with locked loopback chip), RPC user, RPC password rotation, connection URLs to share with external tooling
- **Security** — optional **anti-snipe password** (a second factor that high-stakes healing actions require, defending against a leaked owner token), auto-execute-safe-healing toggle, critical-alerts-require-ack toggle, and a panel listing every health-check rule with current state + a **30-day activity log of what fired and what was done**
- **Network** — external-IP detection (auto or manual) and a one-shot "detect now" probe
- **Alerts** — operator-tunable thresholds for health detectors: disk-warn / disk-critical GB, peer-zero grace minutes, sync-stall grace minutes
- **Storage** — audit-log retention in days
- **Advanced** — behind a "don't change these unless you know why" banner: log level, memory cap, archive-vs-prune mode

Saves that require a chain restart **trigger a modal asking whether to restart now or later**, so the change can be applied in one tap.

### Why this matters

ENM is the **first piece of dApp-Centre content that's a serious operations tool, not a viewer or a simple app**. It validates the dApp-Centre as a delivery channel for power-user functionality — a BPoS operator can install ENM, register, and run a node, all from one installable app on ElastOS. Combined with the existing dApp-Centre catalogue (Elacity NFT, Glide Finance), this expands ElastOS from "user-facing personal cloud" into "user-facing personal cloud **plus** operator workbench" — same desktop, same install model, same identity, full operational coverage of the ecosystem participants.

**Ready to ship.** Final polish in flight.

---

## Elastos Runtime — Stricter Authority-Layer Boundaries + `0.3.0` Planning

> _The `0.2.0` release shipped April 29 and remains the current stable version on `main` (fully documented in the [previous weekly report](https://github.com/Elacity/pc2.net/discussions/15)). This week's work was about **moving the Runtime architecture out of demo-shell territory into stronger authority-layer territory** — and is preparing the next branch (`review/0.3.0`) for a future release._

### What "stricter" means in practice

The Runtime convergence principle is that **capsules should only reach the outside world through Runtime / Carrier / provider mediation** — not through raw host networking, raw RPC, private keys, connector SDKs, or any other privileged API. This week's work pushed that principle from "stated direction" to "enforced in the code path":

- **Improved Home / System account model.** Accounts are now treated more coherently as **Runtime principals**, with **System** focused on policy and runtime state instead of duplicating Wallet controls. Cleaner separation = fewer overlapping authorities = a simpler mental model for users and a smaller attack surface.

- **Wallet is now the main blockchain surface.** Accounts, approval methods, receive QR / address display, MetaMask linking, BTC groundwork, ESC / Base / BTC account direction, and **Wallet-owned approvals** all routed through Wallet. The Wallet capsule is the **only place** that handles authority-bearing effects (signing, transactions); everything else either uses a typed chain-provider for read-only operations or asks Wallet for an approval.

- **Browser is a controlled capsule.** Browser now **opens through Runtime, uses Browser / Net / Exit provider contracts, and exposes a constrained `window.ethereum`** instead of raw wallet or chain access. A capsule running inside Browser can request signatures via the constrained provider; it cannot directly touch a wallet, a private key, or a chain RPC. The dApp gets the API it expects (`window.ethereum`); the user gets the safety they need (a mediated, approve-able authority surface).

- **Compatibility fixes for `ela.city` and Glide through Runtime providers.** The first real cross-validation of the constrained-Browser model was running `ela.city` and Glide inside it. What broke at first: account discovery, ESC default chain selection, typed signing requests, transaction approvals, and read-only chain calls. What was fixed: each of these now **routes through a Runtime provider** (chain-provider for reads, Wallet for signing) instead of trying to go directly. **First proof point that real dApps can run inside the constrained-Browser capsule.**

- **Clearer separation between reads and authority-bearing effects.** **Chain reads go through a typed chain-provider; signing and transactions go through Wallet / Inbox approvals.** This is the operational form of the "zero ambient authority" principle: a capsule doesn't get a wallet just by existing inside the runtime; it asks for a specific approval for a specific action, and the system records who asked, which policy allowed it, and which provider executed it. Some approvals may be granted **once, permanently, or for a time window**, with the audit trail attached.

- **Verification tooling added.** Browser entropy checks, Home entropy checks, Browser route tests, hosted wallet smokes, provider decision reports, and review-slice planning artifacts. The Runtime work is now backed by an **observability layer** that can answer "which provider made which decision and why" after the fact.

- **Docs + planning updated** around Browser, Carrier, Wallet, PC2 convergence, provider boundaries, and release readiness — including the `0.3.0` review-slice plan.

### What `0.3.0` is targeting

The remaining gaps before Browser is considered complete:

- **Stability** under sustained real-app use
- **Independent multi-window sessions** (so two dApps in two Browser windows don't share authority state by accident)
- **Stronger audit coverage** for all capsule-initiated external effects (every `window.ethereum` call, every chain read, every exit-network request)
- **Final proof that Browser uses the Carrier / provider boundary consistently** — no edge cases where a capsule can route around it

Selkies (a hosted browser-streaming engine) is **useful as the current hosted proof** but **not yet accepted as the final product Browser path** — the Runtime team is treating it as an interim implementation while the final native-rendering / Carrier-mediated path is built.

### Why the Browser-streaming insight matters

A side note from the week worth surfacing: **with Browser rendering / streaming solved, the same primitive becomes a potential solution to run any app from any platform across nodes** — via browsers (hosted-streaming) or local rendering (native). The implication: an ElastOS user could open a Linux-only app, or a Windows-only app, or an iOS-only app, inside their own Browser capsule, with the rendering happening on a remote node and the input/output streaming back. The compute and the data stay where they should; the user gets the experience they want. This is the **"any app, anywhere, under user control"** primitive that the World Computer thesis (see [§12](#closing-the-us-travel-cycle--the-elastos-world-computer-thesis-crystallises)) needs as a foundation.

### Tie-back to PC2

The PC2↔Runtime Convergence Inventory ([§6](#pc2--runtime-convergence-inventory-refresh)) is the doc that tracks **which PC2 feature becomes which Runtime capsule over time**. The Wallet-as-authority-surface work is the Runtime side of what PC2 currently does ad-hoc through wallet-connect prompts. The constrained-Browser work is what enables PC2's dApp Centre apps to eventually run inside a Runtime capsule with proper capability scoping rather than as in-process Electron windows. Each piece of this week's Runtime work has a corresponding PC2 feature it's helping converge.

---

## Partnership Conversations — Exploring a Privacy Layer for the Main Chain

This week opened a **technical conversation with the Beam team** — the privacy-protocol project behind one of the most rigorous Mimblewimble implementations in production — about whether and how a privacy layer could be integrated into the Elastos main chain.

### What's actually being discussed

Three integration shapes are on the table; only one is being seriously pursued:

1. **Side-chain integration.** *Off the table.* Elastos has had a difficult history with side-chains (most are unused, several need active maintenance with no users). The strong preference is: **whatever privacy layer lands, it lands on the main chain.**

2. **Full main-chain hard fork to a Mimblewimble base.** *Off the table.* Too disruptive, breaks too many existing integrations, and conceptually misaligned — privacy as the default is the wrong choice for a chain that needs to support transparent rights / royalties / settlements alongside private transactions.

3. **Extension-blocks pattern (the LTC / MWEB approach).** *Active conversation.* Litecoin extended its block structure to support confidential transactions via Mimblewimble Extension Blocks (MWEB) without breaking existing nodes. The same pattern could allow Elastos to **add an opt-in confidential-transaction path that lives alongside the existing transparent path on the main chain**. Users choose per-transaction whether to use the confidential path. The transparent chain keeps working unchanged.

### Why the Beam variant specifically

The Beam team didn't ship pure Mimblewimble. They built a hybrid called **Lelantos Mimblewimble (LMW)** that combines two protocols:

- **Mimblewimble** for the base privacy primitive (Pedersen commitments, blinding factors, transaction kernels, range proofs).
- **Lelantos** (originally developed for Firo) as a **shielded pool** layer that solves the **transaction-graph traceability concern** that prompted criticism of pure Mimblewimble: the concern was that an active adversary tracking UTXOs over time could probabilistically link wallets. Lelantos breaks that linkage by acting as a "sugar pool" — a non-interactive way to spend a UTXO in such a way that an external observer cannot trivially link the input to the output.

The hybrid is proven and battle-tested (Beam has run it in production for years), confidential assets are natively supported (new tokens automatically inherit the privacy properties of the chain), and the implementation includes **quantum-resistant switch commitments** — implemented and shipped in 2019, currently disabled by default, ready to be enabled by a hard fork when the post-quantum threat becomes critical.

### Architectural fit with Runtime

The Beam conversation has a natural fit with the constrained-Browser / Wallet authority architecture being built in Runtime this week ([§10](#elastos-runtime--stricter-authority-layer-boundaries--030-planning)). A potential first step:

- **Beam chain as a chain capsule** running inside Runtime — same way Browser, Wallet, and other capsules are mediated. Confidential transactions flow through the chain capsule.
- **Beam wallet library as a wallet capsule** — same authority-mediation model as the ESC / Base / BTC wallet work being done this week. The wallet capsule doesn't care whether the chain underneath is transparent or confidential; the user signs an approval, the wallet executes, the audit trail records what happened.

### Next steps in the conversation

Beam's team is reviewing the Elastos chain implementation to give specifics on **what an extension-blocks integration would look like in practice** — effort estimate, code touch-points, what stays untouched, what needs to migrate. Continued discussion is in a shared Telegram group. **No commitments yet, just a serious technical conversation.** The next data point will be Beam's review of the chain code.

### Why it matters

If Elastos can add **opt-in confidential transactions on the main chain via extension blocks**, with battle-tested cryptography, with confidential assets native, with quantum-resistant primitives ready to enable, **that's a significant differentiator** — one that aligns with the World Computer thesis (a chain that anchors rights, identity, provenance, and settlement should be able to do so privately when the user chooses, not only publicly). It also gives Elastos a credible answer to the **enterprise audience** that came up repeatedly during the US trip (see [§12](#closing-the-us-travel-cycle--the-elastos-world-computer-thesis-crystallises)): enterprises want **control without surveillance**.

---

## Closing the US Travel Cycle — The Elastos World Computer Thesis Crystallises

The CEO's continuous US travel cycle — covering **Google Next, Bitcoin Las Vegas, and Consensus Miami** across April and May — closed this week with a **published community update** that consolidates what was learned across enterprise, Web3, AI, institutions, creators, and infrastructure teams. The headline shift: Elacity is **not building separate tools** — Elacity is helping converge **PC2, ElastOS Runtime, Carrier, and the Elastos blockchain** into one user-owned computing system: **the Elastos World Computer.**

### What the trip clarified

Five patterns kept appearing in different forms across very different audiences:

1. **AI agents are coming faster than governance.** Enterprises want agents; they're worried about permissions, data leakage, audit trails, and uncontrolled automation. Gartner now expects very large enterprises to face massive AI-agent sprawl by 2028; IBM reports AI adoption is already outpacing AI security and governance.

2. **Web3 still has a trust and usability gap.** Wallets, dApps, signing, staking, identity, and tokenised rights remain too fragmented for normal users and too risky for institutions.

3. **Creators and data owners still lack economic infrastructure.** Digital content, AI training data, software, media, models, and datasets are valuable, but access, royalties, licensing, resale, and provenance are still badly coordinated.

4. **Enterprises want control without slowing down.** The market does not want a moral lecture about decentralisation. It wants safer execution, clearer ownership, better auditability, and infrastructure that can survive AI-scale complexity.

5. **The Elastos stack is converging.** What looked like separate efforts — PC2, Runtime, Carrier, blockchain, wallets, dDRM, agents, marketplace logic — is beginning to stack into one coherent World Computer system.

### The simple thesis

> **ElastOS is becoming the sovereign runtime for the agentic internet: a user-owned personal cloud where apps, dApps, wallets, agents, data, rights, and network services run from the user's own node.**

### The four environments of the World Computer

| Environment | Plain-English role | Technical role | Why it matters |
|---|---|---|---|
| **PC2 / Home** | Your digital house | The human-facing personal cloud — desktop, files, apps, wallet login, AI, storage, access surface | Gives users a place they own instead of renting their digital life from platforms |
| **Runtime** | The trusted capsule engine | Runs signed capsules, verifies code, issues capabilities, isolates apps / agents / providers, routes object access | Lets untrusted apps and agents act safely without broad permissions |
| **Carrier** | The private network OS | Authenticated object, message, stream, discovery, sync, replication, and content-delivery substrate | Connects nodes, people, agents, and services without relying on one centralised platform |
| **Blockchain** | The rights and settlement layer | Anchors DID/EID, signing, provenance, publisher identity, receipts, licensing hooks, staking, smart contracts | Proves ownership, rights, access, royalties, settlement without turning the chain into an app database |

The convergence inventory ([§6](#pc2--runtime-convergence-inventory-refresh)) tracks **how each piece of PC2 v1 migrates into the corresponding Runtime capsule over time** — the doc that turns the four-environment frame into an executable roadmap.

### Why Runtime is the turning point

PC2 v1 proves the product direction: a personal cloud users can run today. But the convergence work makes the technical difference clear: **PC2 v1 currently behaves like a web server, while ElastOS Runtime behaves like an operating system.** In PC2 v1, a session token can become broad access. **In the Runtime model, every action needs a scoped, signed capability and can be audited.** This week's Runtime work ([§10](#elastos-runtime--stricter-authority-layer-boundaries--030-planning)) is exactly that — moving from session-token authority to capability-mediated authority, from ambient access to explicit grants, from "the app can do anything inside the runtime" to "the app can do exactly what the user approved, and we have the audit trail to prove it."

That is the difference between a useful personal cloud and a trustworthy personal computer for AI agents, dApps, wallets, and digital property.

### Opportunity surfaces

- **Users** — own a private digital home, run agents safely, access the web, use dApps, manage wallets, store files, migrate between hardware
- **Creators** — package digital assets into protected capsules, automate licensing and royalties, sell access rights, build direct markets without platform lock-in
- **Developers** — ship signed capsules instead of fragile app integrations; build provider capsules, dApp capsules, AI tool capsules, wallet capsules, content viewers
- **Enterprises** — govern AI agents, control permissions, audit actions, protect IP, run edge AI, collaborate around sensitive data without giving everything to a cloud vendor
- **Node operators** — run routing, exit capsules, pinning, storage, AI inference, premium network services, and other Carrier-based services
- **ELA economy** — move from passive token narrative toward service access, staking utility, rights settlement, premium routing, and protocol-level economic loops

### What must be proven next

- A **reliable Home experience** that works for normal users, not only developers
- A clean **Browser capsule + Wallet capsule + Agent capsule** demo over Carrier
- A **dApp flow** where signing, staking, and wallet interaction are safer through capsule boundaries
- A **dDRM flow** where access rights, royalties, and protected content are enforced by runtime capabilities and settled through smart contracts
- A clear **developer model** for publishing, installing, updating, and verifying capsules
- A credible **ELA service-access model** that ties staking to premium networking and supporting services

This week's branch work, Runtime work, partnership conversations, and ENM polish all map directly onto items in this list.

### Closing line from the CEO's published update

> *"If we get this right, ElastOS becomes more than software. It becomes a digital home, an agent environment, a rights layer, and a user-owned foundation for the next internet."*

---

## Looking Ahead — v1.2.8.0, v1.2.9.0, Runtime `0.3.0`, and Beyond

**Next release window:**

- **v1.2.8.0** — **T-1 Telemetry + Self-Diagnostic + Support Reports** merges from `feat/t-1-telemetry-and-support` into `main` and ships. Expected within the next working week. Headline: every user can submit a perfect snapshot of their system state in one click; aggregated telemetry surfaces fleet-level patterns; the foundation for feedback-driven optimisation is in.

- **v1.2.9.0** — **Chipotle Relayer / API-key wire-leak elimination**. Two pieces both need to land:
  - The **consolidated Lit Actions** (one encrypt, one decrypt; covering media + non-media + EOA + SA) — push expected within two working days
  - The **3-line PC2 client switch** to the GCF proxy + dropping the `X-Api-Key` header — gated on the Lit Actions push
  
  Outcome: no more keystore API key on the wire; centralised proxy as a stepping stone to per-supernode relayer in a later release.

**Runtime trajectory:**

- **Runtime `0.3.0` review-slice planning** continues. Targets: Browser stability under sustained real-app use, independent multi-window sessions, stronger audit coverage for all capsule-initiated external effects, and final proof that Browser uses the Carrier / provider boundary consistently. Selkies remains the hosted-streaming proof; the final native-rendering / Carrier-mediated path is in design.
- **Browser-streaming as a cross-platform primitive** — once Browser rendering / streaming is fully solved, the same primitive enables running any app from any platform across nodes (hosted-streaming or local rendering). The "any app, anywhere, under user control" foundation for the World Computer thesis.

**Adjacent work:**

- **IPFS branches merge to main.** `dev/ipfs-connectivity` and `dev/fix-dash` carry small, focused, well-tested deltas. Likely merged in the v1.2.8.0 window if they don't go in standalone earlier.
- **18 000-pin Elacity backfill** continues replicating across the three cluster peers. End state is the entire historical Elacity content set durably replicated across three independent geographies.
- **ENM** ships as a dApp-Centre installable app. The first power-user / operator workbench on ElastOS.
- **GitHub Actions deploy wiring** for the supernode automation. Mechanical follow-up to today's `deploy-supernode.sh`; closes the "patched in main but not in prod" failure mode permanently.
- **Cert renewal mode flip** (low-priority operational hygiene): InterServer's Let's Encrypt cert is valid until July 27; certbot's renewal config needs the standard `--webroot` swap now that nginx fronts port 80. 73 days of buffer.

**Partnership & strategy:**

- **Privacy-layer integration review.** The Beam team is reviewing the Elastos chain code to give specifics on what a Mimblewimble + Lelantos extension-blocks integration would look like in practice — effort, code touch-points, what stays untouched, what needs migrating. Next data point is their review.
- **World Computer thesis communication.** The CEO's published update gives Elacity a consolidated public statement of what's being built and why. The four-environment (PC2 / Runtime / Carrier / Blockchain) frame and the convergence inventory together give us an executable roadmap to communicate from.

**Future direction (no commitments yet, just the trajectory):**

- **Decentralisation Trajectory doc** (`docs/core/DECENTRALIZATION_TRAJECTORY.md`) — a forward-looking strategic doc for the network-level decentralisation roadmap, ready for sign-off and publication.
- **PC2 Convergence Inventory** continues to track per-feature migration into Runtime capsules.
- **Wallet capsule + Browser capsule + Agent capsule demo over Carrier** — the proof point that converts the World Computer thesis from "stated direction" into "running in front of a user."

---

## Summary Statistics

### By branch

| Branch | Commits | Files changed | Insertions | Deletions |
|---|---:|---:|---:|---:|
| `feat/t-1-telemetry-and-support` (T-1 telemetry + convergence inventory + deploy script) | **3** | 16 | 3 253 | 126 |
| `dev/ipfs-connectivity` (upload consolidation + scoped CAR + dag/import + pssh) | **4** | 15 | 3 045 | 2 757 |
| `dev/fix-dash` (MPEG-DASH manifest standardisation) | **1** | 3 | 50 | 17 |
| **Total** | **8** | **34** | **6 348** | **2 900** |

### By commit

| SHA | Date | Branch | Title |
|---|---|---|---|
| [`e8ad84691`](https://github.com/Elacity/pc2.net/commit/e8ad84691) | 2026-05-07 | `feat/t-1-telemetry-and-support` | feat(t-1): telemetry, self-diagnostic, and support reports (v1.2.8.0) |
| [`83d266df3`](https://github.com/Elacity/pc2.net/commit/83d266df3) | 2026-05-07 | `dev/ipfs-connectivity` | fix: adjusted pssh input data to align with v3 |
| [`dafc9cfe1`](https://github.com/Elacity/pc2.net/commit/dafc9cfe1) | 2026-05-07 | `dev/ipfs-connectivity` | feat: attempt to upload .car file after each pin/add to local ipfs |
| [`ee9e9b731`](https://github.com/Elacity/pc2.net/commit/ee9e9b731) | 2026-05-07 | `dev/ipfs-connectivity` | rm putter v2 |
| [`0c1f4c72a`](https://github.com/Elacity/pc2.net/commit/0c1f4c72a) | 2026-05-07 | `dev/ipfs-connectivity` | refactor(ipfs): consolidate upload paths and scoped CAR replication |
| [`9fdf4f7ef`](https://github.com/Elacity/pc2.net/commit/9fdf4f7ef) | 2026-05-08 | `dev/fix-dash` | fix: refined MPEG-DASH generator to comply with manifest standard |
| [`bd9110f48`](https://github.com/Elacity/pc2.net/commit/bd9110f48) | 2026-05-15 | `feat/t-1-telemetry-and-support` | docs(convergence): refresh PC2↔Runtime inventory with May-06 state |
| [`8e11c4d61`](https://github.com/Elacity/pc2.net/commit/8e11c4d61) | 2026-05-15 | `feat/t-1-telemetry-and-support` | feat(scripts): add deploy-supernode.sh for automated, smoke-tested gateway deploys |

### Operational milestones (not in commit log)

| Date | Event |
|---|---|
| 2026-05-07 | `ipfs.ela.city` joined the Elacity Cluster as third peer; UFW openings on both supernodes; symmetric handshake |
| 2026-05-07 | `pin/add` endpoint on the new peer swapped to cluster-proxy; `dag/import` exposed at cluster layer |
| 2026-05-07 → present | ~18 000 historical Elacity pins replicating across three peers (in flight) |
| 2026-05-08 | DASH manifest cross-validation against `mp4dash` reference output; standards-compliance achieved |
| 2026-05-09 | Chipotle GCF proxy stood up at `europe-west1` (live since); short-term security win pending client switch |
| 2026-05-15 (am) | RCE responsibly disclosed; same-day five-phase remediation (Phases 1A → 2 → 3 A/B-1/C-2/C-1/D) |
| 2026-05-15 (afternoon) | Both supernodes fronted by nginx; no public direct port bindings; TLS verification end-to-end |
| 2026-05-15 | `map.ela.city` back online after 9-hour outage (healed as part of nginx fronting) |
| 2026-05-15 | `scripts/deploy-supernode.sh` committed as root-cause fix |
| Week of 2026-05-07 → 05-15 | Runtime: Wallet promoted to main blockchain surface; Browser locked into controlled capsule with constrained `window.ethereum`; `ela.city` + Glide compatibility routed through Runtime providers; `0.3.0` review-slice planning underway |
| Week of 2026-05-07 → 05-15 | Partnership: technical conversation opened with Beam team about Mimblewimble + Lelantos extension-blocks privacy layer for the Elastos main chain |
| Week of 2026-05-07 → 05-15 | Strategy: CEO's US travel cycle (Google Next, Bitcoin Las Vegas, Consensus Miami) closed with published community update consolidating the Elastos World Computer thesis |

### Adjacent repositories and workstreams

| Repo / workstream | Status this week |
|---|---|
| [`Elacity/chipotle-functions`](https://github.com/Elacity/chipotle-functions) | **NEW this week.** GCF proxy live at `europe-west1`; client switch forthcoming. |
| [`Elacity/elastos-runtime`](https://github.com/Elacity/elastos-runtime) | `0.2.0` is current stable on `main`. Active stewardship work: Wallet promoted to main blockchain surface, Browser locked into controlled capsule, `ela.city` + Glide compatibility fixed via providers, `0.3.0` review-slice planning underway. |
| Elastos Node Manager (ENM) | BPoS-ready; final polish; ready to ship as dApp-Centre installable. First operator-grade tool delivered through the dApp Centre. |
| **Partnership: privacy layer for the main chain** | **NEW this week.** Technical conversation opened with the Beam team about a Mimblewimble + Lelantos extension-blocks integration (LTC / MWEB pattern). Beam reviewing Elastos chain code; awaiting their proposal. |
| **Strategy: World Computer thesis** | **Published this week.** CEO's community update consolidates the US travel cycle (Google Next, Bitcoin Las Vegas, Consensus Miami) and crystallises the four-environment frame: PC2 / Runtime / Carrier / Blockchain as the user-owned execution layer for the agentic internet. |

---

*Generated 2026-05-15 by the Elacity Labs team. Format matches [#15](https://github.com/Elacity/pc2.net/discussions/15) (Week of Apr 26 – May 6, 2026).*
