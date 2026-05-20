# ElastOS Strategic Roadmap

> **Purpose:** Single source of truth for all strategic goals, technical work streams, and milestones — directly mapped to the Keystone Fund proposal and Rong Chen's original vision
> **Created:** 2026-02-24
> **Last Updated:** 2026-05-19 (release-status snapshot refreshed; v1.3.0 reconciled against AGENTIC-PC2-MONETISATION-2026-05 mandate)
> **Status:** Living document — update as work progresses

---

## Release status (snapshot — 2026-05-19)

| Release | Date | State | What it shipped |
|---|---|---|---|
| **v1.2.6** | 2026-05-01 | ✅ Tagged + on Jetson | arm64 video upload fix (ffmpeg fragmenter + `+separate_moof` topology), encrypted-DASH codec-string fix, indexer metadata + listing-price fixes, public-IPFS gateway ENOENT classifier, marketplace UX cleanup. See `CHANGELOG.md` §1.2.6 (23 fixes). |
| **v1.2.7 series** (.1 → .14) | 2026-05-02 → 2026-05-07 | ✅ All tagged + live | Fourteen patch releases over 5 days addressing fresh-Mac install + transport reliability + on-chain V3 contract integration + launcher heartbeat protocol + dDRM viewer/market UX. **Highlights**: v1.2.7.7 (on-chain plans/gates + name-sync + channel mgmt + 8 bugs A-H), v1.2.7.8 (Mac transport binaries published for the first time — closed the silent ActiveProxy-fallback class), v1.2.7.9 (auto-install macOS+Linux WireGuard permissions), v1.2.7.10 (bundled bash 5.2.21 + `sudo -E` for fresh Mac), v1.2.7.11 (AWG bundling + PATH self-loc + 2 sudoers regressions), v1.2.7.12 (sudoers marker + awg-quick subcmd rewrite), v1.2.7.13 (launcher heartbeat protocol replacing PID-tracking), v1.2.7.14 (dDRM viewer + market UX patches). See `CHANGELOG.md` for full entries — backfilled from GitHub releases on 2026-05-19. |
| **v1.2.8.0** *(in flight)* | target ~2026-05-21 to 2026-05-23 | 🔨 On `feat/t-1-telemetry-and-support`, NOT yet tagged | **Operator self-observability release**: new built-in `Health & Support` app (auto-installs), T-1A four self-diagnostic probes, T-1B local-only support report API (no outbound bytes, wallet-hashed, path-redacted), T-1C local metric registry (Counter/Histogram in Chipotle CEK recovery + IPFS cluster pin paths, `PC2_TELEMETRY_DISABLED` kill-switch, anonymous-by-design tags). Plus latent `db.getSetting()` bug fix that restores ignored resource-limit settings (`storage_limit`, `max_concurrent_wasm`, `max_memory_mb`, `wasm_timeout_ms`). Plus invisible CI hardening (6-gate matrix with 4 platforms + Docker + release-assets-integrity + binary-execution-smoke + boot-SLA), Dockerfile rehab, capsule-readiness audit complete (160/163 modules), Phase 2 mechanical refactors all shipped. Held behind 48-72 h Mac launcher soak gate before tag. CHANGELOG drafted; pre-tag checklist + rollback procedure complete. Tracked in [`.cursor/tasks/RELEASE-ENGINEERING-V1280/`](../../.cursor/tasks/RELEASE-ENGINEERING-V1280/RELEASE-ENGINEERING-V1280.md). |
| **v1.2.9.0** *(post-v1.2.8.0)* | TBD — Q3 2026 estimate | 📋 Outline only | AI-related consolidation per Sasha's stated direction (2026-05-19): completion of the T-1 deferred surface (daily flusher + opt-in dialog + supernode ingest endpoint), Rust/WASM panic capture (Phase R), Phase 2 Cluster 3/4 work (dependency footprint reduction, OpenAI/XAI base class extraction). No new tracking ticket yet. |
| **v1.3.0** *(active mandate)* | TBD — 8-12 eng-weeks from agentic spike start | 📋 Proposed | **Monetisation Agent Alpha** per [`AGENTIC-PC2-MONETISATION-2026-05`](../../.cursor/tasks/AGENTIC-PC2-MONETISATION-2026-05/AGENTIC-PC2-MONETISATION-2026-05.md). One JTBD: *"As a creator with files on my PC2 node, I want to say 'package my portfolio for sale' and have my agent walk me through the dDRM packaging flow, suggest pricing from comparable assets, draft license terms I can confirm in plain English, and publish to the Exchange."* Feature flag `agent.monetisation.alpha`. Extends existing `AIChatService` with a `monetisation-orchestrator` skill — no external dependencies on Particle UA V2, ERC-8004, or Runtime v2 capsules. **Supersedes the older "blocked on Lit Chipotle + V3 + PDR" framing** — Lit Chipotle is now production-integrated (v1.2.7.4), V3 contracts went on-chain in v1.2.7.7 (`bulkUpdatePlans` + `configureTokenOwnershipAccess` + `subscribePlan`), PDR Phase B is no longer a v1.3 blocker. The original v1.3 work has either shipped or been re-scoped into later releases. **Status**: pending Sasha's sign-off on 6 open questions in §12 of the agentic mandate (branch strategy, feature flag, LLM choice, public protocol spec, security audit funding, manual-UI deprecation — all with recommended sensible defaults). |

The v1.2.x line achieved its "shippable to non-technical Mac users with no terminal commands at all" goal across v1.2.7.8 → v1.2.7.13. v1.2.8.0 deepens operator self-observability without adding new external dependencies. **v1.3.0 pivots from infrastructure to user-facing value**: a conversational agent that operates the dDRM packaging + tokenisation flow on behalf of creators — directly delivering against Elacity's published manifesto (P3 Holding-company model, P4 Skill Capsules, P5 Royalty Tokens, P8 Sovereign Personal Node).

---

## How This Document Works

Each **Milestone** from the DAO proposal is broken down into concrete **Work Streams**. Each work stream links to the relevant technical docs and can be checked off as completed. This is what we work through month by month.

**Related Documents:**
| Document | What It Covers |
|----------|---------------|
| [ELACITY_UNIVERSAL_ASSET_STRATEGY.md](./ELACITY_UNIVERSAL_ASSET_STRATEGY.md) | Unicorn strategy: universal digital asset protocol, marketplace types, SDK evolution |
| [APP_MANIFEST_SPEC.md](./APP_MANIFEST_SPEC.md) | app.json schema with dDRM capabilities, forward-compatible with Runtime |
| [ARCHITECTURE_CONVERGENCE.md](./ARCHITECTURE_CONVERGENCE.md) | PC2 v1 → Capsule Runtime v2 technical path |
| [NAMESPACE_MAPPING.md](./NAMESPACE_MAPPING.md) | PC2 v1 paths → Runtime v2 `localhost://` namespace mapping |
| [SUPERNODE_ECONOMICS.md](./SUPERNODE_ECONOMICS.md) | dDRM Access Token model for supernode revenue |
| [NETWORK_HARDENING.md](../pc2-infrastructure/NETWORK_HARDENING.md) | Supernode decentralization and self-healing |
| [DECENTRALIZATION_STATUS.md](./DECENTRALIZATION_STATUS.md) | Decentralization scorecard, walk-away test roadmap |
| [AGENT_HANDOVER.md](./AGENT_HANDOVER.md) | Current state, coding patterns, infrastructure |
| [POST_QUANTUM_AUDIT.md](./POST_QUANTUM_AUDIT.md) | PQ crypto audit, vulnerability map, Lit replacement strategy, migration roadmap |
| [ARM_DEVICES.md](../deployment/ARM_DEVICES.md) | Jetson/Raspberry Pi deployment |
| [ELASTOS_AGENT_REFERENCE.md](./ELASTOS_AGENT_REFERENCE.md) | Complete agent reference: why/how/what, talking points, competitive positioning, audience angles |
| [CAPSULE_COMPATIBILITY.md](./CAPSULE_COMPATIBILITY.md) | PC2 v1 capsule compatibility assessment, Runtime study, provider mapping, refactoring inventory |
| [V1.2_ADOPTION_ROADMAP.md](./V1.2_ADOPTION_ROADMAP.md) | **Post-v1.2 adoption plan: ranked Tier 1/2/3 features for individual + enterprise traction, runtime-convergence mapping, dapp-store unlock for first capsules. Read this for "what ships next."** |
| [V1.2_TESTING_CHECKLIST.md](./V1.2_TESTING_CHECKLIST.md) | Manual app-by-app smoke checklist for v1.2 release validation (complements RG3 automated matrix) |
| [elastos-runtime](https://github.com/Elacity/elastos-runtime) | Anders' Rust runtime: capsule model, capability tokens, Carrier P2P, namespace, architecture |

---

## Rong Chen's Original Vision (2002–2018)

These diagrams from Rong define the north star. Every work stream should move us closer to this architecture.

### The Elastos Computer (Von Neumann Extension)

```
┌─────────────────────────────────────┐
│         Elastos Computer            │
│  ┌───────────────────────────────┐  │
│  │     Classical Computer        │  │
│  │  Registers                    │  │
│  │  Memory                       │  │
│  │  Local Hard Disk (= cache)    │  │
│  └──────────┬────────────────────┘  │
│             │ TCP/IP, HTTP          │
│  ┌──────────▼────────────────────┐  │
│  │     Cloud Storage (= primary) │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

**Key insight:** Local storage is cache. Cloud (IPFS) is the primary storage. The "computer" extends beyond the physical device into the network. This is exactly what PC2 does today with IPFS as the storage layer.

### Smart-Web of Elastos Computers

```
    ☁️ ──── ☁️
   / |  ╲  / |
  ☁️ ── ☁️ ── ☁️
   ╲ |  /  ╲ |
    ☁️ ──── ☁️

  Each ☁️ = Personal Cloud Computer
  Each line = P2P Carrier connection
  Apps execute inside VMs/capsules
  IoT devices connect to their owner's cloud
```

**What we're building toward:** Every PC2 node is an Elastos Computer. The Carrier network connects them. Capsules are the "apps in VMs." IoT devices (Jetson, sensors, cameras) feed context into the personal cloud.

### Data Browser → Code Browser (Instant Apps)

**Web2 (Data Browser):** Browser pulls data from servers on demand.
**Smart-Web (Code Browser):** Data AND code are pushed to users and spread via social networks.

**This is the capsule model.** Capsules = code + data distributed by CID. Users install capsules from a marketplace or receive them from peers. The runtime executes them locally. "Instant Apps" that live on your hardware, not a corporate server.

### Three WebSpaces

| WebSpace | Protocol | Purpose | Status |
|----------|----------|---------|--------|
| `https://` | Web2 backward compatibility | `*.ela.city` domains | ✅ Working |
| `localhost://` | Carrier P2P | Mobile↔PC2, PC2↔PC2 | 🔨 Infrastructure ready |
| `elastos://` | Blockchain oracles | Smart contract data, DID resolution | 📋 Future |

---

## Work Streams by Milestone

> **Post-v1.2 strategic plan (added 2026-04-23):** the full Tier 1/2/3 ranked plan, dapp-store unlock, paid-capsule mechanics, MCP/vibecoding strategy, and Anders' Runtime alignment all live in [V1.2_ADOPTION_ROADMAP.md](./V1.2_ADOPTION_ROADMAP.md). Milestones below remain the canonical month-by-month plan; the adoption roadmap is the *"what ships in the 30/60/90/120-day windows after v1.2.0 tags"* answer. Headline calls below.

### Post-v1.2 Strategic Plan (summary — full detail in [V1.2_ADOPTION_ROADMAP.md](./V1.2_ADOPTION_ROADMAP.md))

**The framing:** v1.2.0 is the last "feature-only" release. v1.2.1 onwards converts security correctness into adoption — for individuals, creators, devs, and enterprise — using the existing app-install + dDRM + capability infrastructure. Nothing in this plan requires Runtime-tier work from Anders.

**Pre-v1.2 (purely additive, ships with the v1.2.0 tag or just after):**
- §P0 telemetry pipe (`POST /api/telemetry/onramp`) — every later metric depends on this
- §P1 app bundle packager + tar.gz extraction in `AppInstallService` — unblocks the dapp store
- §P2 `npx @elacity/create-capsule <template>` — 4 starting templates (`storefront`, `gated-content`, `agent-app`, `nft-drop`)
- §P3 one-line PC2 installer (`curl … | sh`) — the "10-minute promise" demo
- §P4 compliance pack drafts (GDPR DPA, SOC2, non-custodial legal opinion) — start the lawyer clock

**Tier 1 (30–60 days after v1.2.0):**
- §T1.1 `apps.ela.city` dapp-store UI (categories, search, install button, signature status)
- §T1.2 streaming royalty UI (per-second ticker in Creator dashboard)
- §T1.3 per-creator analytics — the Bible's Four R's baked in
- §T1.4 capsule template gallery (5 → 10 templates, each a YouTube demo)
- §T1.5 in-runtime "It works" demo (`git clone` to first test payment in <10 min)
- §T1.6 **Capsule SDK MCP server** — wraps the capsule CLI as MCP tools, makes every Cursor / Claude / Continue / Windsurf user a potential capsule developer with zero learning curve. **Single biggest leverage move on the Acquire (devs) loop node.**

**Tier 2 (60–120 days):** SAML/OIDC SSO, audit-log streaming + SIEM connectors, compliance pack publication, self-hosted PC2 HA cluster — the four enterprise unlocks above the $50k ACV line.

**Tier 3 (120–180+ days):** WordPress/Shopify plugin bridges, mobile companion (read-only first), public attestation registry (the moat), Stripe/Reap fiat on-ramp.

#### First capsules on ElastOS — default apps vs. dapp-store capsules

> **Founder direction (2026-04-23):** the dapp-store unlock at v1.2.1 ships with **two** apps as removable capsules; the four protocol apps stay bundled.

| Role | Apps | Behavior |
|---|---|---|
| **Default / system apps** (bundled, signed, registry-tracked, can't be uninstalled) | `elacity-market`, `elacity-creator`, `elacity-player`, `ddrm-viewer` | Ship inside the PC2 binary. Updates delivered via signed registry entries. These are the dDRM protocol surface — removing them would break PC2's value prop. |
| **First dapp-store capsules** (downloadable from `apps.ela.city`, removable) | `elastos-nft` (Galaxy NFT marketplace), `glide-finance` (Glide DEX) | Uninstalled by default on fresh PC2; one-click install from the start menu. First proof points for the dapp-store mechanic. Risk-bounded — if the install flow regresses, Market/Creator users see no impact. |

**Convergence story (Anders' Runtime v2):** all six apps still become capsules. The `system` vs `dapp` distinction stays in the registry as a "preinstalled" flag — Runtime treats both the same; the Shell preinstalls the four system ones at first boot.

**Where capsule bytes live:** capsule tarballs are content-addressed on IPFS with **four independent sources**: (1) `ipfs.ela.city` — the canonical Elacity Kubo node already hosting media + NFT artwork; (2) **InterServer supernode** with a new pin-set cron (advertise = pin); (3) **Contabo supernode** with the same; (4) every PC2 that already installed the capsule (per-node `ContentSeedingService` is already shipping). Removes single-host dependency on `ipfs.ela.city` and means fresh installs are never DHT-gambled. Pin-set work is half a day per supernode operator — tracked as §P1.6 in the adoption roadmap.

#### Paid capsules — when the dapp store IS the marketplace

The protocol does not care what's inside the encrypted bytes. A signed-and-encrypted tarball is a signed-and-encrypted tarball. So at Phase 3 (v1.2.2):
- **Free capsule** = signed tarball, IPFS-pinned, anyone can install (NFT + Glide today)
- **Paid capsule** = encrypted+signed tarball, IPFS-pinned, install gated by an on-chain ACCESS_TOKEN — same dDRM contracts that today wrap a PDF or video

Same contracts on Base mainnet. Same Lit Protocol/Chipotle CEK envelope. Same wallet UX. **The "dapp store" and the "Elacity Marketplace" become one surface** — an app is just another asset type. This is also why the Tier 1 work sequences cleanly toward Anders' Runtime: the `drm-provider` capsule that handles paid-capsule install is the same one that handles paid-media decrypt today.

---

### Milestone 1 — Campaign Launch & Product Continuity (Mar 1, 2026)

**Goal:** Continuity. Keep shipping. Merge the tested branch to main.

- [x] Merge `feature/jetson-gpu-acceleration` to `main` — squash merged 2026-03-03 (134 commits)
- [x] Establish weekly shipping report cadence (GitHub-based)
- [x] Set up public expenditure tracking portal
- [x] First monthly release (v1.1.0) — released 2026-03-03
- [x] Publish WCI ecosystem update article

**Status (2026-03-03): COMPLETE**
- v1.1.0 released: squash merged to main, tagged, GitHub Release published
- Verified on Mac (localhost) and Jetson (zzz.ela.city) — both boot cleanly
- Structured logging: ~295 console.log calls replaced with createLogger() module-based logging
- Security: hardcoded credentials removed from docs, server passwords rotated
- Four-tier transport cascade: WG > AWG > VLESS Reality > ActiveProxy — all tested
- Desktop UI overhaul, virtual desktops, voice AI, macOS WireGuard — all shipped
- One-command install validated on Mac and 2 independent Jetsons

---

### PRIORITY: Elacity dDRM & dApp Store (Immediate — Post v1.1.0)

**Goal:** Build the V1 dApp Store and Media Market using the Elacity SDK. This is the first work stream after v1.1.0 release.

**Branch:** `feature/elacity-ddrm-marketplace` (created from main after v1.1.0)
**Detailed Plan:** Cursor internal plan — "App Store and Media Market" (ID: `app_store_and_media_market_2489ec7b`)

**Prerequisites:**
- [x] postMessage wallet bridge for iframe-sandboxed apps *(completed Mar 3)*
- [x] COOP/COEP header testing for media player SharedArrayBuffer *(completed Mar 3)*
- [x] Confirm SDK access with CTO (npm registry, test CIDs, API endpoints) *(completed Mar 3)*

**Backend Foundation:**
- [x] `installed_apps` SQLite table (name, cid, version, manifest, installed_at, size, status) *(completed Mar 3)*
- [x] AppInstallService — fetch CID from IPFS, verify, store, register *(completed Mar 3)*
- [x] Install/uninstall/list/update API endpoints (`/api/apps/*`) *(completed Mar 3)*
- [x] App registry manifest format — formal `app.json` spec v1.0 with validation, categories, dDRM, forward-compatibility *(completed Mar 8)*
- [ ] App build pipeline (Vite build → static bundle → IPFS pin → CID → registry)

**Frontend Apps:**
- [x] Elacity Market app using `@elacity-js/api` + wallet bridge *(completed Mar 3-4)*
- [x] Media player as installable app with per-app COOP/COEP headers *(completed Mar 3)*
- [x] Purchase flow via AuthorityGateway *(verified Mar 14 — buyer received ACCESS_TOKEN + resale token, 0.01 USDC payment split correct; UA receipt parsing bug in Elacity frontend, transaction succeeds on-chain)*
- [ ] App Center UI rebuild against real backend APIs

**Download-to-Node / Content Seeding:**
- [x] Save-to-Cloud with `.ddrm` descriptor (unified format), progress UI, and "Open folder" link *(completed Mar 4, unified Mar 20)*
- [x] Unified `.ddrm` capsule format — single extension for media + non-media, `type` field routing, NFT artwork thumbnails with dDRM badge, backward compat with `.edrm` and `.ddrm.json` *(completed Mar 20)*
- [x] `.ddrm` file type support in GUI — icon, MIME, double-click routes to correct viewer *(completed Mar 4, unified Mar 20)*
- [x] IPFS CAR format support for directory CIDs (DASH segments) *(completed Mar 4)*
- [x] **ContentSeedingService** — automatic pinning, DHT announcement, and serve tracking for purchased content *(completed Mar 21)*
  - Priority pin queue with configurable concurrency (`max_concurrent_pins: 3`)
  - Dedup guard (DB + in-memory), Helia-ready guard with deferred ops, CID normalization
  - Adaptive timeouts (180s base + 2s/MB, capped at 10min), exponential backoff retry (3 attempts)
  - Tiered DHT re-announcement: hot (2h) / warm (6h) / cold (12h) based on `last_served_at`
  - Startup burst re-announcement of all pinned CIDs
  - Gap recovery: incomplete pins re-queued on restart
  - Persistent serve tracking (`serve_count`, `last_served_at`) updated on every gateway fetch
  - Seeding config section in `config.json` with conservative defaults
  - Database migration 18: `last_served_at`, `serve_count`, `pin_status` columns + indexes
  - `DELETE /api/ipfs/unpin/:cid` endpoint for explicit content removal
  - `ipfs-assemble` WASM crate rebuilt with `opt-level = 3` (speed over size) for faster large file assembly
- [x] Auto-download on purchase — `pinAndRegisterMedia()` in Market dApp auto-calls `POST /api/storage/ipfs/pin` → `seedContent()` after successful `buyAccess()`. Full chain: purchase → pin → DHT announce → DB tracking *(verified Mar 23)*
  - [x] **Disk quota enforcement** — `ContentSeedingService.isQuotaExceeded()` checks `statfsSync` disk usage against `seeding.disk_quota_percent` (default 50%). Queue pauses when quota exceeded, resumes when space freed. `getStats()` reports quota status and total pinned size *(completed Mar 23)*
  - [x] **Bandwidth enforcement** — `bandwidthGuard` middleware on all IPFS gateway routes (`/ipfs/:cid/*`). Rolling 5s window tracks bytes served, returns 503 with Retry-After when `seeding.max_upload_mbps` exceeded (default 0 = unlimited). `setBandwidthLimit()` called from config at startup *(completed Mar 23)*

**Creator Tools:**
- [x] Local media encoding pipeline — FFmpeg transcode + Bento4 fragment/package + CENC-AES-128-CTR encrypt + DASH packaging + IPFS upload. Adaptive codec selection (NVIDIA GPU / SVT-AV1 / x264). Creator Dashboard integration with detailed sub-step progress UI. Chipotle Lit Action CEK encryption. **E2E verified Mar 18**: Creator mint → buy → download → DASH playback inside PC2. *(completed Mar 17-18)*
  - [x] Media encoding progress UX — real-time sub-step tracking (Analyze → Transcode → Fragment → CENC Encrypt → IPFS Upload), per-step inline progress bars, live FFmpeg stats (speed, FPS, elapsed time), weighted overall progress *(implemented Mar 18)*
- [ ] App Factory — local packaging pipeline (build → bundle → IPFS pin → publish)
- [x] Creator Dashboard dApp — upload any file, set price/royalties, encrypt via Lit Protocol, upload to IPFS *(implemented Mar 13 — pc2-node/data/test-apps/elacity-creator/)*
  - [x] `POST /api/ipfs/add` endpoint — accepts raw bytes (base64), stores via Helia, returns CID
  - [x] `POST /api/storage/ipfs/add-directory` — creates UnixFS directory CIDs (`{dirCID}/metadata.json` pattern)
  - [x] Step-by-step wizard UI: file picker → metadata form → encrypt & upload → result with CIDs
  - [x] Universal metadata envelope schema (`elacity-asset-envelope-v1`) with asset, pricing, creator fields
  - [x] `@elacity-js/access` integration — `encryptBuffer()` with Lit Protocol ACCESS_TOKEN conditions
  - [x] On-chain minting — `mint(string,uint16,bytes,bytes)` with full opRawData/sellRawData encoding, fee from CoreStorage, gateway from `authority()`. Paid mint (opType=2) verified on BaseScan with correct sub-tokens *(verified Mar 13)*
  - [x] Channel creation — `createChannel()` on ChannelCore with metadata dir, royalty split, MINTER_ROLE auto-grant, backend GraphQL registration *(implemented Mar 13)*
  - [x] Operative approval — `setApprovalForAll(gateway, true)` with ContractCreated event fallback for proxy-based channels *(implemented Mar 13)*
  - [x] Elacity IPFS pipeline — dual upload (local + Elacity), CIDv0 resolution, marketplace visibility confirmed *(completed Mar 14)*
  - [x] Metadata format — image (auto-thumbnail), authority, categories fields for GraphQL compatibility *(completed Mar 14)*
  - [x] Server-side Lit Protocol — encryption via pc2-node backend with capacity credits *(completed Mar 14)*
  - [x] Channel selection UI — user's own channels + custom address input *(completed Mar 14)*
  - [x] On-chain purchase verified — buyer received ACCESS_TOKEN, payment split correct *(verified Mar 14)*
  - [x] Consumer decrypt endpoint — `POST /api/storage/lit/decrypt` on pc2-node with Lit Action `executeJs()` *(implemented Mar 14)*
  - [x] Lit Action trust model — custom `non-media-decrypt.js` with self-referential conditions + on-chain access check in action code *(implemented Mar 14)*
  - [x] Smart Account awareness — passes SA address as `buyerAddress` for Universal Account buyers *(implemented Mar 14)*
  - [x] Capacity credit auto-detection — queries Chronicle Yellowstone for latest valid RLI token, handles 15-day rotation *(implemented Mar 14)*
  - [x] Inline image rendering — decrypted content rendered as blob URL in Market dApp *(implemented Mar 14)*
  - [x] Gateway approval hardening — 5s delay, try-catch, "Fix Gateway Approval" tool *(implemented Mar 14)*
  - [x] **Agent Wallet (Smart Account) minting** — Full SA batch minting via `parentExecuteSmartAccountBatch`, dual-wallet channel creation (EOA/SA), channel-dictated wallet selection, Universal Account transaction hash resolution (extract real Base tx hash from `eth_getLogs` entries), full receipt parsing for `tokenId` + `opContract`, retry mechanism for SA batch failures with inline Retry/Cancel buttons *(completed Mar 27)*
  - [x] End-to-end decrypt test with capacity credits — **WORKING** (Lit Payment Delegation via Relayer API, Test 13 image + Test 14 PDF verified)
  - [x] Universal asset viewer — **server-side secure viewer** for images (Sharp), PDFs (PDF.js+Canvas hybrid), text (Canvas) with watermarking, buffer zeroing, auto-decrypt, parallel PDF page loading *(completed Mar 15)*
  - [x] **WASM Renderer** — Rust crate compiled to `wasm32-wasip1` for text rendering inside isolated WASM linear memory + `WASMRuntime.ts` Node.js WASI host *(completed Mar 15)*
  - [x] **dDRM Viewer app** — dedicated PC2 app with two display modes (centered images, full-width scrollable documents), anti-piracy measures, renderer badges, puter.args IPC integration *(completed Mar 15)*
  - [x] **PC2 Media Runtime** — complete server-side DASH/CENC decryption pipeline. Rust `cenc-decrypt` WASM crate (AES-128-CTR per-sample decryption), MSE player (no EME/CDM/SharedArrayBuffer), DRM signaling stripping (`encv→av01`, `sinf`/`senc` removal), 16-byte IV support from tenc, Smart Account PSSH selection, two-phase Lit auth. **First successful end-to-end playback of Elacity DRM video inside PC2** *(completed Mar 16)*
  - [x] **Media Player hardening** — session expiry handling (transparent re-auth), seek into unbuffered regions (segment mapping + buffer flush), audio-only support, adaptive bitrate switching (bandwidth measurement + quality selector UI), YouTube-style keyboard shortcuts, auto-hide controls, buffering indicator, segment retry, buffer eviction, Elacity branding *(completed Mar 16)*
  - [x] **WASM Renderer hardening** — PDF rendering via `lopdf` text extraction, code syntax highlighting via `syntect` (30+ languages), all static content types now render inside WASM linear memory *(completed Mar 16)*
  - [x] **dDRM Viewer UX** — image zoom/pan, document zoom + page navigation with toolbar, audio player mode, floating auto-hide toolbar, fullscreen toggle, keyboard shortcuts *(completed Mar 16)*
  - [x] **WASM-native PDF rendering** — Replaced `lopdf` (WASM crash) with `hayro` pure-Rust PDF rasterizer for full-fidelity rendering (layout, fonts, tables, images). Fixed WASI compilation target (`wasm32-wasip1`). Node.js canvas fallback text wrapping fixed. Elacity brand blue (`#3b82f6`) applied to viewer. "Mint on Elacity" right-click for non-dDRM files. Wallet bridge restored *(completed Mar 16)*
  - [x] **WASM crypto hardening (Phases A-C)** — AES-GCM decrypt-only mode in WASM (CEK never in Node.js heap, 50MB threshold), fMP4 strip+decrypt combined in single WASM call (Rust port with 64-bit box support), `build-wasm.sh` pipeline, `wasm32-wasip1` toolchain. PDF text extraction spike confirmed `hayro-syntax` lacks CMap resolution — keeping `pdfjs-dist`. Phase D (Lit Chipotle) COMPLETE. Phase E (ECDH to WASM) conditional on Chipotle envelope format.
  - [x] **Bug fixes (Mar 16)** — Fixed double-signature bug (duplicate `pc2-wallet-bridge.js` + `IPC.js` handlers), fixed WASM text renderer exceeding JPEG 65535px limit, fixed video autoplay after signing, fixed `eth_requestAccounts` prompting unnecessarily (use `eth_accounts` first). Removed duplicate `eth_sendTransaction` handler from ParticleNetworkContext
  - [x] **Bug fixes (Mar 18)** — Fixed duplicate wallet signatures (IPC.js + pc2-wallet-bridge.js dual handling), fixed "Network fee: Unavailable" (removed explicit gas estimation, let MetaMask handle), fixed duplicate chain switch popup (check current chain before switching), fixed duplicate SIWE login on account change, fixed media encode `dataToEncryptHash` propagation for correct minting contentId, fixed IPFS directory pinning for DASH packages (Helia `storeDirectory` + local directory detection in `pinRemoteCID`), fixed PSSH extraction (multi-pattern search), fixed PSSH ciphertext/hash/kid embedding, fixed authority address (`0x8fe6bf98...` AuthorityGateway on Base), fixed GUI IPC rebuild (bundle.min.js), **E2E verified: mint → buy → download → playback**
  - [x] **AV1 playback fix (Mar 18)** — Three critical fixes for encrypted AV1 video playback: (1) Rust WASM `strip.rs` updated to remove PSSH boxes nested inside `moov` (not just top-level), (2) `splitInitForTrack()` in `media.ts` splits multi-track init segments into per-track inits for MSE SourceBuffer compatibility (Bento4 produces shared init segments), (3) `hdlr` handler_type offset corrected from +8 to +12. MetaMask mint gas estimation fix with `sendTxWithRetry()` retry/skip buttons. Player MSE debug logging added.
  - [x] **WASM & I/O optimization (Mar 18)** — 5 quick wins: `wasm-opt -Oz` build pass in `build-wasm.sh`, WASM binary preload at startup, WASM cache key collision fix (SHA-256 fingerprint), async video thumbnail generation (no more event-loop blocking `execSync`), async HTML injection in `static.ts`. Plus: AES-GCM encrypt moved to WASM (`encrypt_only` mode in ddrm-renderer) — non-media file encryption no longer uses Node.js `crypto.createCipheriv`, plaintext never touches Node.js memory.
  - [x] **WASM/Rust optimization pass (Mar 20)** — Speed-tuned crypto: `cenc-decrypt` and `cenc-encrypt` changed from `opt-level = "s"` to `opt-level = 3` for ~20-40% faster AES operations. `panic = "abort"` on all 5 WASM crates (ddrm-renderer reduced 482 KB / 8.3%). Smart build pipeline: per-crate wasm-opt levels (`-O3` for crypto, `-Oz` for utility), `--enable-simd` and `--enable-nontrapping-float-to-int` flags. Hot-path log reduction: 20 WASMRuntime.ts `info` logs downgraded to `debug`. Security hardening: CEK buffer zeroing in `unwrapECDHEnvelope` (media.ts), derived key zeroing in mnemonic encrypt/decrypt (encryption.ts). IPFS WASM assemble threshold lowered from 10MB to 5MB for reduced V8 heap pressure.
  - [x] **dDRM Viewer native windowing** — launches as UIWindow via IPC `postMessage` → `launch_app()` (not browser popup), integrated with taskbar *(completed Mar 15)*
  - [x] **.ddrm.json capsule format** — descriptor files for non-media assets with CID, Lit params, mimeType. MIME: `application/x-ddrm+json`. Saved to Documents *(completed Mar 15)*
  - [x] **GUI capsule integration** — custom shield icon, MIME registration, double-click opens dDRM Viewer, content_type_to_icon mapping *(completed Mar 15)*
  - [x] **Market "Open" button** — IPC-based launch of dDRM Viewer from asset detail view *(completed Mar 15)*

**SDK Evolution (Universal Asset Protocol):**
- [x] `@elacity-js/access` package — clean-room build of universal access layer using Lit Protocol SDK directly (see `docs/core/ACCESS_PACKAGE_SPEC.md`) *(implemented Mar 13 — 12 source files, 47 unit tests passing)*
  - [x] Lit Protocol session management + certificate caching *(lit/session.ts)*
  - [x] `verifyAccess()` — on-chain ACCESS_TOKEN check via AuthorityGateway *(verify/access-token.ts)*
  - [x] `acquireKey()` — Lit Protocol key retrieval with access conditions *(lit/key-retrieval.ts)*
  - [x] `encryptBuffer()` / `decryptBuffer()` — AES-GCM via WebCrypto (creator + consumer) *(crypto/encrypt.ts, crypto/decrypt.ts)*
  - [x] `acquireLicense()` — CENC-compatible interface for media-player backward compat *(crypto/payload.ts + lit/key-retrieval.ts)*
  - [x] `fetchAndDecrypt()` — IPFS fetch + decrypt convenience method *(fetch/ipfs.ts + client.ts)*
  - [x] Node.js entry point (`@elacity-js/access/node`) for server-side decryption *(node/session.ts, node/client.ts — LitNodeClientNodeJs + ethers.Wallet)*
  - [ ] Integration test against real Elacity content on Base
- [ ] `@elacity-js/asset-packager` package — generic asset encryption + IPFS upload (non-media counterpart to `media-packager`). Creator Dashboard uses inline pipeline for now; extract to package when patterns stabilize.
- [x] Universal metadata schema — `elacity-asset-envelope-v1` with `asset` field (cid, mimeType, size, encrypted, algorithm, dataToEncryptHash, keyId), `pricing`, `creator` *(implemented Mar 13)*
- [ ] `AssetService` in `@elacity-js/api` — generic asset queries for any content type alongside existing `NFTService`

**Tiered Marketplace Rollout:**
- [x] **Tier 1 — Quick Markets (file in, file out):** E-books/PDFs, stock photography, audio/music, design templates, fonts, 3D models, spreadsheets/data. *(Status: Encryption + minting working for ALL types via Chipotle dDRM. Viewer support COMPLETE for ALL Tier 1 types. WASM decrypt-only fixed for passthrough types. Audio routing fix pending.)*
  - [x] Images (JPEG, PNG, WebP, GIF) — WASM render + watermark *(completed Mar 15)*
  - [x] PDFs — WASM render (hayro rasterizer) *(completed Mar 16)*
  - [x] Text/Code (30+ languages) — WASM syntax highlight *(completed Mar 16)*
  - [x] Audio (MP3, WAV, FLAC, AAC) — Media Runtime DASH playback *(completed Mar 16)*
  - [x] Video (all FFmpeg codecs) — Media Runtime DASH/CENC playback *(completed Mar 16-18)*
  - [x] **3D Models** (GLB, glTF, OBJ, STL, FBX) — Three.js interactive viewer with VFX-grade features (wireframe W, normals N, grid G, auto-rotate A, screenshot S, keyboard shortcuts help ?). OrbitControls + model info panel (poly count, materials, bounding box). WASM decrypt + passthrough to WebGL via ArrayBuffer (bypasses iframe fetch interceptor). Local Three.js r128 libs (CDN blocked by Puter SES). Anti-piracy: blob URL revocation after GPU load, canvas watermark, screenshot intercept. Creator Dashboard MIME detection for .glb/.obj/.stl/.fbx/.gltf. **VFX industry use case: sell/license 3D assets with resale royalties** *(completed Mar 19)*
  - [x] **Datasets** (CSV, TSV) — Paginated table viewer with search, column stats, row numbers. WASM decrypt + passthrough *(completed Mar 19)*
  - [x] **Fonts** (TTF, OTF, WOFF2) — Type specimen preview (@font-face blob, alphabet, pangram, size samples, custom text input). WASM decrypt + passthrough *(completed Mar 19)*
  - [x] **Archives** (ZIP) — File tree listing with sizes/types (JSZip, no extraction to disk). WASM decrypt + passthrough *(completed Mar 19)*
  - [x] **WASM CEK base64 padding fix** — Chipotle REST API returns unpadded base64 CEK (43 chars for 32-byte key), Rust WASM decrypt-only mode requires standard padding. Added padding normalization in storage.ts. WASM decrypt-only now succeeds for all passthrough types (3D, fonts, datasets, archives) — CEK never touches Node.js memory *(fixed Mar 19)*
  - [x] **Market thumbnail letterboxing** — `.video-card-thumb` and `.detail-media` changed to `object-fit: contain` with centered flex layout and `#070707` background. Matches live Elacity site "Media Card" spec *(fixed Mar 19)*
  - [x] **Audio artwork in Media Runtime** — Audio-only playback now displays asset cover art (thumbnail) in the player. URL passed via `puter.args.thumbnail` from market app, styled as album art with shadow/border-radius *(completed Mar 19)*
  - [x] **Marketplace feature audit & implementation (Mar 20)** — Access token resale with wallet selector (EOA/Smart Account), dual-wallet ownership display, resellerCut fix (per-mille→percentage), dynamic sellers list with self-identification ("You (EOA)" / "You (Smart)"), royalty shares & rewards display per wallet, governance section always visible for connected wallets
  - [x] **Dedicated Earnings/Revenue page (Mar 20)** — New sidebar tab with Assets/Channels sub-tabs, dual-wallet aggregation (EOA+SA), total unclaimed banner, per-item withdraw, batch "Withdraw All" (multicall), clickable items to detail view. GraphQL: `fetchMyRoyaltyItemsByAddress` + `fetchRewardSummaryByAddress`
  - [x] **Marketplace comprehensive feature pass (Mar 20)** — 13 features implemented from full reference doc: seller sorting, properties accordion, scarcity badges, activity history, publish/unpublish, royalty offers (create/accept/cancel), subscription lifecycle, channel edit, plan management, token-gating, distribution rights. Capsule-ready architecture with `window.ElaMarket` namespace + `app-features.js` module
  - [x] **Marketplace feedback fixes (Mar 20)** — Token-gating full CRUD (add/edit/remove thresholds with on-chain `configureTokenOwnershipAccess`), plan UPDATE action (not just add/remove), per-tab earnings badge counts (assets/channels/offers), expanded earnings fields (per-wallet balances, governance volume, floor price, subscriber count, channel type), multi-token withdrawal UI (USDC+ETH with batch multicall), TradeGateway royalty offers verified
  - [x] **Apple-Grade Market Redesign (Mar 23)** — Full 16-phase UI/UX overhaul following Apple Human Interface Design principles. Unified CSS design system (tokens, motion, shadows), card system (2-badge max, hover/click micro-interactions, skeleton loading, infinite scroll), view transitions (cross-fade, slide-in/out), detail view restructure (spatial zones, collapsible sections, buy button state machine), unified modal system (ARIA, focus trap, animations), per-view polish (filter chips, Apple-style search with recent searches, library segmented control, earnings dashboard cards), full accessibility pass (ARIA roles, keyboard nav, reduced-motion), app-features.js DOM compatibility update. 1,088 lines changed across 5 files
  - [x] **My Channels management hub (Mar 20)** — New tab in Earnings with channel list, "Edit Details" / "Manage Plans" buttons, centralized channel administration. Server-side `creator` filter via `ChannelQueryInput`. GraphQL schema introspection for correct mutation formats (`SubscriptionPlanUpdateAction.args` wrapper, `TokenOwnershipInput` field names, `price` as String)
  - [x] **API hardening (Mar 20)** — Enhanced `gql()` error handling captures response body for non-200 errors, debug logging on mutations, auto SIWE re-auth on expired tokens, `RETRIEVE_CHANNEL_QUERY` now includes `categories` field
  - [x] **Audio routing fix** — Creator Dashboard routes all audio through media encoding pipeline (DASH/CENC). Audio passthrough in dDRM Viewer retained as legacy fallback only. New audio always goes through Media Runtime *(verified Mar 21)*
**Runtime Player Unification — ✅ COMPLETED (Mar 31):**
- [x] **Elacity Player (cleartext mode)** — `pc2-media-runtime/player.js` detects `cleartext=true` param, sets `video.src` directly via `/read` endpoint, bypasses DASH/CENC pipeline entirely. Handles audio-only, codec warnings, full transport controls. DRM path untouched *(completed Mar 31)*
- [x] **Elacity Viewer (cleartext mode)** — `ddrm-viewer/viewer.js` detects `cleartext=true`, fetches file via `/read` endpoint, routes to existing renderers (image, 3D, CSV, font, archive). PDF rendering via PDF.js with page navigation and zoom. DRM path untouched *(completed Mar 31)*
- [x] **Unified file-open routing** — `RUNTIME_EXTENSIONS` constant in `open_item.js` maps 35+ extensions to Elacity Player (video/audio) or Elacity Viewer (images/PDF/3D/CSV/fonts/archives). User default app prefs take precedence. Text/code files fall through to editor *(completed Mar 31)*
- [x] **"Open With" dual-app support** — Backend `handleSuggestApps` returns both Elacity runtime app (first, with `cleartext` flag) and legacy built-in app as alternative. GUI `UIItem.js` detects `cleartext` flag and passes correct launch args *(completed Mar 31)*
- [x] **Elacity branding** — Apps renamed from "PC2 Media Player"/"dDRM Viewer" to "Elacity Player"/"Elacity Viewer". Custom SVG icons (teal play-button for player, purple eye for viewer). Favicons added to HTML. Consistent Elastos logo icon in taskbar across both apps *(completed Mar 31)*

**Enhanced Channel Creation UX (Next Priority):**
- [x] **Channel-first workflow** — Channel creation/selection is now Step 1 in the Creator Dashboard (5-step flow: Channel → Choose → Describe → Publish → Done). If user has no channels, a prominent "Create Your First Channel" screen is shown *(completed Mar 31)*
- [x] **Rich channel creation form** — Channel creation form includes name, description, subscription plans, and token-gating fields. Deploy/Cancel buttons wired to on-chain channel deployment *(completed Mar 31)*
- [x] **Subscription model integration** — Subscription plan configuration (+ Add Plan, 3-Tier Template) and VIP token access are exposed directly in the channel creation form *(completed Mar 31)*
- [x] **Wallet choice in channel creation** — Users can create channels with either EOA or Agent Wallet *(completed Mar 27)*
- [x] **Channel management from Creator** — Edit channel details, manage subscription plans, and configure token-gating access directly from the Creator Dashboard via inline management panel *(completed Mar 31)*

- [ ] **Tier 2 — Medium Markets (local runtime integration):** dApp Store, AI models (GGUF → Ollama), code packages (npm), datasets, HTML5 games. Need PC2 backend endpoints for decrypt-and-load.
- [ ] **Tier 3 — Complex Markets (ElastOS Runtime v2):** Native software/games, API marketplace, agent marketplace. Need Runtime capsule sandboxes (WASM/Firecracker). Runtime v2 capsule model provides isolated execution for all interactive content types (3D, games, dApps) — capability tokens replace blob URLs.

**dApp Store (Global Decentralized App Marketplace):**
- [ ] **dApp packaging format** — define bundle structure (HTML/JS/WASM/CSS + manifest) for encrypted dApps
- [ ] **Creator Dashboard: dApp mode** — detect app bundles, add manifest metadata (permissions, runtime requirements, categories)
- [ ] **dApp install flow** — purchase ACCESS_TOKEN → decrypt → verify signature → `AppInstallService` auto-install
- [ ] **dApp Store UI** — categories, search, ratings, "Verified" badges, auto-update notifications
- [ ] **dApp sandboxing v1** — CSP + iframe sandbox with postMessage bridge (PC2 v1.x)
- [ ] **dApp sandboxing v2** — signed capsules with capability tokens (Runtime convergence)
- [x] **Use case: DeFi frontends — Glide Finance DEX** — First DeFi dApp packaged and running on PC2. Glide Finance (Uniswap V2 fork on ESC) bundled as local dApp with wallet bridge auto-connect, RPC proxy with fallback chain (`api.ela.city/esc` → `api.elastos.io/eth` → `rpc.glidefinance.io`), response cache (38x speedup), deadline fix for broken subgraph. Swap confirmed on-chain: tx `0xb5b9...35b1` *(completed Apr 1)*
  - [x] `evm-multicall` Rust WASM crate (116KB) — Multicall3 ABI encoder/decoder for batching EVM read calls
  - [x] `amm-engine` Rust WASM crate (143KB) — Uniswap V2 AMM math engine (getAmountOut, getAmountIn, multi-hop route finding, price impact calculation)
  - [x] RPC response cache — in-memory TTL cache per method (`eth_chainId`: 1hr, `eth_gasPrice`: 5s, `eth_getCode`: 5min)
  - [x] **Supernode ESC RPC** — read-only ESC full node on Contabo supernode (systemd service, `127.0.0.1:20636`, method whitelist via gateway proxy at `/rpc/esc`). Self-sovereign chain access for all PC2 nodes *(syncing, ETA ~10h)*
  - [x] **Wallet bridge hardening (Apr 2)** — Multi-chain wallet support: `wallet_switchEthereumChain` forwarded to MetaMask/WalletConnect (fire-and-forget), `wallet_addEthereumChain` with full chain metadata (9 chains: ESC, ETH, BSC, Polygon, Arbitrum, Optimism, Avalanche, Fantom, Cronos), auto-add unknown networks. MetaMask "All Networks" gas estimation fix via forced `wallet_addEthereumChain` on connect. WalletConnect compatibility verified. Free, CORS-enabled RPC endpoints only (no API keys). Bridge page hidden (CSS + MutationObserver) due to architectural limitation *(completed Apr 2)*
  - [x] **Token approval UX fix (Apr 2)** — Fixed Glide "Enabling USDC..." stuck state after approval transactions by ensuring wallet bridge correctly returns transaction receipts
  - **Known limitation: Bridge page** — Glide's Bridge page performs automatic `wallet_switchEthereumChain` calls during initialization to load multi-chain data. In PC2's sandboxed iframe (single `window.ethereum` proxy), these rapid chain switches destabilize ethers.js v5 providers. Bridge tab hidden from navigation. Requires per-request chain routing or dApp-side isolated providers to fully resolve — deferred to dApp sandboxing v2 (capsule architecture)
  - [x] **ESC RPC fully synced (verified Apr 6)** — Both supernodes (InterServer + Contabo) have fully synced ESC full nodes at block 36,095,676, matching public RPC exactly. Self-sovereign chain access operational via `127.0.0.1:20636` and nginx proxy `/rpc/esc` on Contabo
  - **Outstanding: ESC subgraph** — Glide's subgraph (thegraph.com hosted) is unreliable (stale data, `DEADLINE_EXCEEDED` errors). Long-term: self-hosted subgraph on Contabo supernode indexing ESC. Short-term: deadline workaround with `block_constraint: "number_gte"` already in place
- [ ] **Use case: Productivity tools** — note-taking, spreadsheet, code editor as owned software
- [ ] **Use case: HTML5 games** — game bundles sold with royalties on resale

---

### Milestone 2 — V1 Stabilization & Network Growth (May 31, 2026)

**Goal:** Harden everything. Grow the node count. Make it dead-simple to install.

**V1 Hardening:**
- [x] Fix large file upload — was a display bug (total_size*2 removed), uploads were always completing correctly
- [x] Fix wallpaper not loading via gateway — confirmed resolved after WireGuard reconnect fix
- [x] **Particle Auth integration** — Dedicated pc2.net Particle project, email/social EOA send, Agent Wallet 3-phase send (create → sign rootHash → submit), signing popup routing for embedded dApps, auto-reconnect guard, dual-jQuery fix, EOA/SA address race condition fix *(completed Mar 25-27)*
- [x] **dApp Wallet Integration Guide** — Comprehensive docs for Pattern A (embedded postMessage) and Pattern B (standalone ConnectKit), plus Particle Auth reference *(completed Mar 26)*
- [ ] AV1/Firefox — server-side remuxing for MKV→MP4 (beyond the error message)
- [ ] Performance profiling on Jetson (memory, CPU, IPFS block store)
- [x] Reduce PC2 cold-start time — parallelized AI/Gateway/Boson initialization
- [x] Mobile-responsive UI improvements — taskbar z-index fix, responsive layouts, virtual desktops

**Backup & Restore System (Mnemonic-as-Identity Security Model):**
- [x] **Mnemonic derivation fix** — `deriveFromMnemonic()` in IdentityService.ts now uses `tweetnacl.sign.keyPair.fromSeed()` with HKDF-SHA256 for deterministic Ed25519 key derivation. New nodes (v2) generate mnemonic first, then derive keys. Same mnemonic always produces same keypair. Existing v1 nodes grandfathered. *(completed Mar 26)*
- [x] **Stolen backup protection** — v2 backups encrypt `identity.json` to `identity.enc` using AES-256-GCM with a key derived from the public key (which itself derives from the mnemonic). Stolen backup without mnemonic cannot hijack domain. `backup-meta.json` versioning distinguishes v1 (plaintext) from v2 (encrypted) backups. *(completed Mar 26)*
- [x] **Expanded backup contents** — Backups now include `data/installed-apps/` (user dApps) and `data/agents/` (AI agent memory/history). *(completed Mar 26)*
- [x] **Pre-auth restore endpoint** — Rate-limited `POST /api/setup/restore` (unauthenticated, setup phase only) with disk-based upload (no OOM risk). Two-step flow: upload+validate, then finalize with mnemonic for v2 backups. *(completed Mar 26)*
- [x] **Setup wizard restore UI** — "Restore from Backup" button on welcome screen. File upload with drag-and-drop, mnemonic entry for v2 backups, backup contents summary. Auto-detects CLI restores with pending `identity.enc`. *(completed Mar 26)*
- [x] **Identity conflict detection** — On startup, queries gateway for username registration. If another node claimed the same username (dual-node conflict), logs warning and auto re-registers. *(completed Mar 26)*
- [x] **Disk-based restore upload** — Authenticated `POST /api/backups/restore` switched from `memoryStorage` to `diskStorage` to prevent OOM on large backup uploads. *(completed Mar 26)*
- [x] **32 automated tests** — Deterministic derivation, DER round-trip, sign/verify, backup encryption/decryption, stolen backup rejection, v1 backward compatibility, full backup-restore cycle simulation. All passing. *(completed Mar 26)*
- [ ] **DEFERRED: Gateway signed registration** — Harden `POST /api/register` to require Ed25519 signature (separate task, `deploy/web-gateway/` codebase)
- [ ] **DEFERRED: Graceful deregistration** — `POST /api/unregister` + call from `ConnectivityService.stop()`

**DePIN Hardware Expansion:**
- [x] Validate one-command installer on fresh Jetson Orin Nano — tested on 2 devices (EverlastingOS + Anders)
- [ ] **WSL bulletproof install** — WSL-specific script, build verification, auto-start hook, systemd detection *(reported by Joel — 3 failed installs across 2 laptops)*
- [ ] Windows hardware testing — WSL2 on Windows 10 + 11
- [ ] Raspberry Pi 4/5 validation and optimization
- [ ] Explore dedicated DePIN hardware partnerships (plug-and-play boxes)
- [ ] Debian package (.deb) for ARM devices
- [x] **macOS package (.dmg) — NOTARIZED AND RELEASED** *(milestone: Apr 16, 2026)*. [elastos-launcher](https://github.com/Elacity/elastos-launcher) v1.2.2: Developer ID Application cert (`Elacity LLC, LA64G2ZMY2`), Hardened Runtime + entitlements, Apple notarization **Accepted**, ticket stapled. **Users can now double-click the DMG to install — no Terminal, no `xattr -cr` needed.** GitHub release: [v1.2.2](https://github.com/Elacity/elastos-launcher/releases/tag/v1.2.2) with DMG + ZIP + AppImage + deb + Windows exe. CI pipeline: electron-builder signs → `scripts/notarize.js` submits to Apple → UUID returned. Keychain profile `notary-elacity` stored locally for manual submissions.
- [x] Windows installer (.exe) — available in v1.2.2 release (NSIS installer + portable). Not recommended for daily use (WSL still preferred), but available for testing.
- [ ] **Android / Google Play** — Electron doesn't target Android natively. Options: (1) Capacitor/Cordova wrapper around the web UI (points to `localhost:4200`), (2) Progressive Web App (PWA) with `manifest.json` (no Play Store), (3) React Native or Flutter native app as a launcher/remote client. Android is primarily useful as a **remote access client** to your PC2 node, not a node host. See assessment below.

**Carrier Overlay Network:**
- [x] Gateway under systemd with auto-restart — deployed live, enabled for boot
- [ ] SQLite registry replacing JSON file (NETWORK_HARDENING item #2) — deferred, JSON fine at current scale
- [ ] Automated SSL renewal with monitoring (NETWORK_HARDENING item #7)
- [ ] Basic uptime monitoring for supernodes (NETWORK_HARDENING item #6)
- [x] Reduce WireGuard retry interval (15s with exponential backoff) — shipped commit 0ac683b1
- [x] WireGuard macOS support — auto-install, passwordless sudo, network change detection
- [x] WireGuard PATH detection under PM2/systemd restricted environments
- [x] Community networking fix script (`scripts/fix-networking.sh`) — installs full transport stack for affected users *(completed Mar 8)*
- [ ] **WireGuard bundling with PC2 app** — bundle `wg`, `wg-quick`, `wireguard-go`, `amneziawg-go`, `sing-box` binaries so no user falls back to broken ActiveProxy
- [ ] **Gateway "node offline" page** — show clear HTML error instead of infinite "initializing" when proxy/tunnel fails

**Network Map & Public Presence (map.ela.city):**
- [x] Network map visual upgrade — decentralized topology, particle flow, animated nodes, deployed Mar 8
- [x] 3D orb visualization (World Computer) — Three.js force-shield, side-by-side with 2D graph *(completed Mar 12-13)*
- [x] Rebrand to "ElastOS World Computer Network" with Elacity Labs branding *(completed Mar 12-13)*
- [x] Simplified node statuses — merged stale→offline, activity types to active/occasional/idle *(completed Mar 12)*
- [x] Full SEO overhaul — JSON-LD, OG/Twitter cards, sitemap, robots.txt, noscript fallback *(completed Mar 13)*
- [x] GA4 analytics (G-QW5NN8K9DS) + Google Search Console verification *(completed Mar 13)*
- [x] Public API with CORS — `/api/nodes`, `/api/stats/summary` available for external integration
- [ ] PC2 marketing slides for elacitylabs.com — audit and rewrite product slides
- [ ] QuickStart component for elacitylabs.com — installation instructions UI (including Jetson/ARM)
- [ ] Backlinks from ela.city and docs.ela.city to map.ela.city

**AI Integration:**
- [ ] Integrate latest model providers as they emerge
- [x] Voice interaction prototype — Whisper (STT) + Ollama (reasoning) + Piper (TTS) — shipped Feb 26
- [x] Context API endpoint (`/api/context`) — accepts location, photo CIDs, voice transcripts, activity events
- [x] Ollama tool fallback — models rejecting tools auto-retry without tool definitions
- [x] Voice AI settings UI — install button, enable/disable toggle, opt-in on Jetson
- [ ] AI agent file management improvements
- [ ] RAG retrieval optimization for personal documents
- [ ] Evaluate PersonaPlex-7B (NVIDIA full-duplex voice) as Jetson hardware matures
- [x] **Skills System (v1.2)** — SKILL.md format with YAML frontmatter (name, description, version, author, tools, permissions). Skills injected into agent system prompt via `ChannelBridge.buildSystemPrompt()`. Lightweight frontmatter parser (no YAML dependency). `GET /api/gateway/skills` endpoint scans `data/skills/` for available skills. UIAgentEditor skills section with toggles and permission-mismatch warnings. Max 10 active skills per agent. *(completed Mar 24)*
  - [x] 4 bundled skills: Wallet Operations, File Management, System Admin, Elacity Market
  - [x] `SkillDefinition` interface and `skills?: string[]` on `AgentConfig` in gateway types
  - [x] `.md` file support added to Creator app (EXT_MIME_MAP, guessMimeType, DAG_MIME_TYPES) with auto-category detection for `skill` content type
  - [x] `{ trait_type: 'Content Type', value: 'AI Agent Skill' }` NFT attribute for published skills
  - [x] Skill hash verification — SHA-256 validation before loading (trust nothing, per Rong's AppCapsule principle) *(completed Mar 23)*
  - [x] Prompt-level sandboxing — wrap third-party skill content with explicit trust boundaries and tool-scoping *(completed Mar 23)*
  - [x] Audit logging for skill loads — hash, agent ID, timestamp, source (bundled/user/purchased) *(completed Mar 23)*
  - [x] **Purchased skill support (Phase 3)** — decrypt via Lit Protocol dDRM pipeline, install to user filesystem, on-chain ownership verification with 5-min TTL cache, revocation on ownership loss. `POST /api/gateway/skills/install`, `DELETE /api/gateway/skills/:skillId`. Market app "Install Skill" button for AI Agent Skill content type. `installed_skills` SQLite table (migration 23). *(completed Mar 23)*
  - [x] **Skill discovery tools** — `list_available_skills` and `describe_skill` AI tools let the agent discover bundled + user-installed skills and recommend enabling them conversationally. Integrated into `ToolExecutor` and `AIChatService`. *(completed Mar 23)*
- [x] **A2UI Canvas (v1.3)** — Agent-driven desktop windows via Socket.IO. AI agent can push live HTML widgets as draggable, resizable windows on the PC2 desktop. Inspired by [OpenClaw's A2UI](https://github.com/openclaw/openclaw) canvas protocol, adapted to PC2's `UIWindow(iframe_srcdoc)` windowed environment. *(completed Mar 23)*
  - [x] `canvas_create` — opens a new window with title, HTML content, configurable width/height. Returns `canvas_id` for updates.
  - [x] `canvas_update` — replaces HTML content in an existing canvas window. Optional title update.
  - [x] `canvas_remove` — closes a canvas window programmatically.
  - [x] Socket.IO events: `canvas.push`, `canvas.update`, `canvas.remove`, `canvas.closed` (user closes window)
  - [x] Dark-theme base styles injected automatically (tables, headings, badges, code blocks)
  - [x] Security: `iframe_srcdoc` sandbox (no `allow-same-origin`), no external scripts
- [x] **Multi-Agent Communication (v1.3)** — Agents can discover and delegate tasks to each other. Enables specialization: one agent with DeFi skills, another with file management, etc. *(completed Mar 23)*
  - [x] `agents_list` — returns all configured agents with name, model, skills, enabled status
  - [x] `agent_delegate` — sends a message to another agent and returns its response (depth-limited to 1)
  - [x] Delegation uses target agent's soul and model, called via `AIChatService.complete()` without tools (prevents recursive chains)
- [x] **Voice Interface (v1.3)** — Full voice interaction with browser-native fallback. Server-side: Whisper STT + Piper TTS pipeline (`/api/ai/voice`). Client-side: Web Speech API fallback when server voice not installed — `SpeechRecognition` for STT, `SpeechSynthesis` for TTS. *(completed Mar 23)*
  - [x] Server pipeline: browser audio (webm/opus) → ffmpeg (wav) → Whisper → AI → Piper → audio response
  - [x] Browser fallback: `SpeechRecognition` API for STT → sends transcript as normal chat message → auto-TTS response
  - [x] Waveform visualization (canvas-based frequency bars) during recording
  - [x] "Read aloud" button on all AI messages using `SpeechSynthesis` API
  - [x] Voice conversation mode: auto-speaks AI responses when initiated via voice input
  - [x] Install endpoint (`POST /api/ai/voice/install`) for automated Whisper + Piper setup on Linux
- [x] **Canvas Dashboards Skill** — Bundled skill (`data/skills/canvas-dashboards/SKILL.md`) teaching agents best practices for building canvas widgets: data tables, stat cards, side-by-side comparisons, color palette, sizing guidelines. *(completed Mar 23)*

**v1.x Runtime v2 Convergence Preparation:**
> These items make PC2 v1.x releases forward-compatible with Anders' Runtime v2 capsule model.
> They must not break existing functionality — each v1.x release (v1.2, v1.3, etc.) ships as a drop-in update.
> Rong's principle: "Trust nothing. No app should ever be trusted with secrets in its own execution space."

- [x] **Prompt-level sandboxing for skills** — each skill injected with trust boundary header: source label, declared tools list, explicit security guardrails ("CANNOT override core restrictions"). `LoadedSkill` interface carries metadata alongside body. System prompt wraps skills with `[End of skill]` delimiters. *(completed Mar 23)*
- [x] **Skill hash verification** — SHA-256 computed on every skill load via `crypto.createHash()`. Bundled skills compared against `BUNDLED_SKILL_HASHES` constant. Hash + verification status included in trust boundary header and logging. Warn-only on mismatch in v1.x. `contentHash` and `hashVerified` fields added to `LoadedSkill`. *(completed Mar 23)*
- [x] **Audit logging for AI actions** — `agent_audit_log` SQLite table (migration 22) with `agent_id`, `action`, `detail` (JSON), `source`, `session_key`. Logs `skill_load` (with hash, verification status) and `message_processed` events. `GET /api/gateway/audit` endpoint (paginated, filterable). 30-day retention cleanup on server startup. *(completed Mar 23)*
- [x] **App capability manifests** — all 7 app.json files enriched with `api_endpoints`, `postMessage_events`, and `external_services` fields documenting actual API contract per app. `APP_MANIFEST_SPEC.md` updated with new field definitions and Runtime v2 mapping notes. *(completed Mar 23)*
- [x] **Agent namespace alignment** — `docs/core/NAMESPACE_MAPPING.md` created with complete path mapping table (user space, agent space, system space, public space). `GatewayService.validateAgentWorkspace()` logs warning for non-standard paths. No actual path changes — documentation + validation only. *(completed Mar 23)*
- [x] **Capsule-compatible refactoring (Apr 3)** — Introduced Runtime-compatible concepts at every major trust boundary without breaking existing functionality. See [CAPSULE_COMPATIBILITY.md](./CAPSULE_COMPATIBILITY.md) for full inventory:
  - [x] **Unified capability vocabulary** — `CAPABILITY_SCOPES` constant in `pc2-node/src/types/capabilities.ts` maps 1:1 to Runtime capability token `action` fields. Single vocabulary shared across app manifests, API key scopes, and wallet bridge method classification
  - [x] **Structured auth principals** — `CapabilityPrincipal` interface in `middleware.ts` with `type` (user/apiKey/app), `capabilities`, and `scopes`. V1 sessions get full capability set (backward compatible). `requireCapability()` middleware factory for opt-in per-route enforcement
  - [x] **Ed25519 signature verification** — `verifyDistributionSignature()` in `AppInstallService.ts` checks `distribution.signature` on app bundles. Uses existing `tweetnacl` dependency. Warn-only in v1 (unsigned apps still install), enforced in v2
  - [x] **Provider operation interfaces** — TypeScript interfaces in `pc2-node/src/services/providers/types.ts` formalizing Runtime's stdin/stdout JSON protocol: `DRMProvider`, `StorageProvider`, `IdentityProvider`, `ComputeProvider`
  - [x] **Wallet bridge origin tracking** — Origin validation and RPC method capability classification in `pc2-wallet-bridge.js`. Warns on unregistered origins and classifies methods as `wallet:read`, `wallet:sign`, or `network:rpc`
  - [x] **dDRM capsule content hashing** — `capsuleHash` (SHA-256) and `signedBy` (creator wallet) fields added to `.ddrm` capsule creation in Creator app. Makes capsules content-addressable for future Runtime data capsule model

**Runtime Audit Findings (Mar 31 — First Public Release):**
> Comprehensive audit of [github.com/Elacity/elastos-runtime](https://github.com/Elacity/elastos-runtime) completed. Key strategic findings:

- [x] **Server/Headless Host Adapter alignment** — The Runtime defines four host adapter modes: server/headless, desktop, mobile, kiosk. Our PC2 Node.js server + browser-rendered desktop IS the "server/headless" host adapter. This validates our current architecture and positions PC2 as the reference implementation of the first working host adapter. The Runtime proxies capsule HTTP to any browser on any OS — exactly what our Node.js server does today. This means our Node.js stack has a clear architectural role in v2 (not "replace everything with Rust") *(confirmed Mar 31)*
- [x] **macOS full security model via WASM** — The Runtime is pure Rust and compiles on macOS. The full security model (capability tokens, Ed25519 signatures, content addressing, namespace enforcement, Carrier P2P via iroh, audit logging, WASM sandboxing via Wasmtime) works on macOS. Only the microVM substrate (crosvm/KVM) requires Linux. Our dDRM WASM crates (`aes-gcm-decrypt`, `cenc-decrypt`, `cenc-encrypt`, `ddrm-renderer`, `ipfs-assemble`, `mp4-split`) all target `wasm32-wasip1` and run with full capability-gated security on macOS. macOS packaging (Homebrew, code signing, notarization) is future work, not a blocker *(confirmed Mar 31)*
- [x] **Provider interface target** — Providers implement a stdin/stdout JSON protocol with `fetch`, `store`, `list`, `delete` operations. This is the clear implementation target for the dDRM Provider Capsule. Our Rust WASM crates map directly to provider operations: `drm:decrypt`, `drm:encrypt`, `drm:verify-access`, `drm:render` *(confirmed Mar 31)*
- [x] **Carrier alignment validated** — One runtime = one Carrier node per machine (confirmed). Capsules consume `peer/gossip_send`, do not spawn own Carrier nodes (confirmed). Kubo is optional, not Carrier core (confirmed). iroh is the transport implementation, not the contract *(confirmed Mar 31)*
- [ ] **Convergence risk: blockchain integration** — Runtime has NO EVM wallet, on-chain verification, or payment flows yet (marked "Next" in TASKS.md). This is the biggest gap for Elacity integration and gates the ACCESS_TOKEN → capability token bridge. Our wallet bridge, marketplace, channel creation, and all dDRM on-chain functionality are PC2-specific until the Runtime adds blockchain support. Timeline: unknown, needs discussion with Anders

**Questions for Anders (Resolved from Runtime First Public Release — Mar 31):**
- [x] **Capability token format** — Answered from [ARCHITECTURE.md](https://github.com/Elacity/elastos-runtime/blob/main/docs/ARCHITECTURE.md): Ed25519-signed struct with `version`, `id`, `capsule`, `issuer`, `resource` (ResourceId), `action` (read/write/execute/message/delete/admin), `constraints` (epoch, delegatable, classification, max_uses), `issued_at`, `expiry`, `signature`. Our `app.json` `permissions` field maps `storage` paths to ResourceId patterns, `api_endpoints` to action scopes *(resolved Mar 31)*
- [x] **`localhost://UsersAI/` path** — Answered from [NAMESPACES.md](https://github.com/Elacity/elastos-runtime/blob/main/docs/NAMESPACES.md): Already a file-backed localhost root exposed by the runtime. Peer concept to `localhost://Users/...`. Our `NAMESPACE_MAPPING.md` agent path mapping (`~/pc2/agents/{id}/` → `localhost://UsersAI/{agentName}/`) is correct *(resolved Mar 31)*
- [x] **WASM target** — Answered from `components.json` + GLOSSARY.md: Runtime uses `wasm32-wasip1` (Preview 1) for all WASM capsules. Our crates (`aes-gcm-decrypt`, `cenc-decrypt`, `cenc-encrypt`, `ddrm-renderer`, `ipfs-assemble`, `mp4-split`) already target this. No change needed *(resolved Mar 31)*
- [ ] **Skill install as capsule operation** — Still open. No skill concept in Runtime yet; our SKILL.md format is ahead of the Runtime. Design our own and align later

**New Questions for Anders (from Runtime Audit):**
- How should PC2 Node.js position itself as the "server/headless" host adapter? Should we implement the Runtime's HTTP proxy contract, or does the Runtime proxy capsule HTTP itself?
- What is the timeline for blockchain/EVM wallet integration in the Runtime? This gates our ACCESS_TOKEN → capability token bridge
- Should we start adapting our `app.json` manifests to also generate `capsule.json` format, or wait for the capsule manifest spec to stabilize?

**Puter Upstream Audit (Mar 23):**
> Audited 1,493 upstream Puter commits since fork. Sovereignty-first principle: no cloud-dependent features, no new external dependencies. Result: 1 fix worth porting out of 1,493 commits.

- [x] **Shell escape fix** — `HostDiskUsageService.js` had command injection vulnerability via `execSync` with user-controlled directory paths. Replaced with `execFileSync` (argument array, no shell invocation). Zero new dependencies. Better than upstream fix (they added `shescape` npm dependency). *(completed Mar 23)*
- [x] **Skipped (by design):** Access token suspension (cloud-centric, irrelevant to PC2 wallet auth), FS stat optimization (files diverged 278+124 lines, too risky), GUI fixes (53K+ lines diverged), AI improvements (PC2 has independent AI stack), KV store changes (cloud-coupled), PeerService/Workers (centralized patterns)

**v1.3 Release — HIGH PRIORITY (Gate 1 UNBLOCKED):**

> **Status:** Gate 1 COMPLETE — Lit Chipotle mainnet live and integrated (Apr 2, 2026). Gate 2 IN PROGRESS — V3 contracts received, Creator Dashboard testing complete, Market blocked on indexer.
> **Gate 1:** ~~Lit Protocol production network details~~ **COMPLETE** — Production account, PKP, group, API keys, Lit Action CIDs all configured. E2E encrypt + decrypt verified.
> **Gate 2:** Elacity V3 smart contracts — **IN PROGRESS**. Addresses received, Creator app migrated, 4/7 E2E tests passed. See `docs/core/V3_E2E_TESTING_STATUS.md`
> **Plan:** See `.cursor/plans/v1.3_release_plan_7cce212d.plan.md` for full execution checklist

- [x] **COMPLETE (Apr 2):** Chipotle production swap — production account on `dashboard.litprotocol.com`, `elacity-ddrm` group created, non-media Lit Action CID (`QmNayE5MYzXcoMS9nvRk6MUo8r4ESLa3i65vHXzuBsnC2b`) registered, PKP (`0x68dcf3dc...`) added to group, scoped usage API key created, $10 credit funded. Updated `DEFAULT_API_URL` + `DEFAULT_PKP_ID` in `chipotle-client.ts`, local `.chipotle-api-key` + `.chipotle-account-key` files. **E2E verified: mint → encrypt (Lit production) → save .ddrm → open → decrypt (AuthorityGateway access check) → WASM render → watermarked display.**
- [x] **COMPLETE (Apr 2):** Creator app .ddrm capsule auto-save — after minting, the Creator app saves a `ddrm-capsule-v2` descriptor to the user's local directory (`/<wallet>/Documents|Pictures|Videos/<title>.ddrm`). Contains all encryption params (litCiphertext, iv, dataToEncryptHash, kid, actionCid), contract refs (authority, operative, tokenId), and metadata (title, thumbnail). File is immediately openable in dDRM Viewer without needing the Elacity Market app or API.
- [x] **COMPLETE (Apr 2):** Dual-wallet access check — `secure-view` endpoint now accepts `buyerAddressAlt` (smart account). Before calling Lit, a free `eth_call` to `AuthorityGateway.hasAccessByContentId()` checks both EOA and smart account in parallel, then sends only the correct address to Lit ($0.01 per decrypt, never $0.02). Works regardless of which wallet minted the asset.
- [x] **COMPLETE (Apr 2):** CEK session cache — 5-minute in-memory cache keyed on `(kid, buyerAddress)`. Multi-page PDFs cost $0.01/session instead of $0.01/page. Max 50 entries, never written to disk, cleared on process restart. AuthorityGateway remains the source of truth — on-chain check always happens on first call.
- [x] **COMPLETE (Apr 2):** Free content minting — Creator app now supports "Free" access method alongside "Buy Now" and "Buy & Resell". Free content skips Lit encryption entirely: metadata sets `encrypted: false`, `protectionType: 'none'`, `price: 0`, `copies: undefined`. Media files still transcode to DASH (quality + streaming) but without CENC encryption. Pipeline detects `accessMethod === 'free'` and routes through cleartext encode path. Copies and distribution sections hidden for free assets. E2E verified: upload → transcode (no encrypt) → IPFS → on-chain mint → playback (direct, no Lit call).
- [x] **COMPLETE (Apr 2):** Media pipeline E2E on Chipotle — video DASH/CENC path fully verified on production Lit Chipotle. PDF, image, video, and audio all tested end-to-end (encrypt → mint → .ddrm save → open → Lit decrypt → WASM render). Fixed `.ts`/`.js` runtime discrepancy: `chipotle-client.js` had outdated `DEFAULT_PKP_ID` (`0x09bdfc8f...` → `0x68dcf3dc...`), `DEFAULT_API_URL` (dev → production), and fallback action CID. These mismatches caused `Contract call reverted with data: 0xd4a84737` inside the Lit TEE.
- [x] **COMPLETE (Apr 2):** dDRM security hardening audit — comprehensive audit and fix pass on the Lit Protocol integration layer:
  - **Injection prevention:** `secure-view` endpoint no longer accepts `rpc`, `authority`, or `buyerAddress` from client request body. RPC URL hardcoded to `getBaseRpcUrl()`, authority hardcoded to `DEFAULT_AUTHORITY`, buyer addresses derived exclusively from authenticated session (`req.user.wallet_address`, `req.user.smart_account_address`).
  - **Rate limiting:** Per-wallet rate limiter on `/lit/secure-view` — 30 calls/minute per wallet address. Periodic cleanup of expired entries.
  - **Promise coalescing:** Concurrent Lit calls for the same `(kid, buyerAddress)` are coalesced into a single API call. Prevents duplicate Lit charges from rapid-fire requests (e.g., multi-page PDF loads, race conditions).
  - **Secrets protection:** `.chipotle-*` and `.lit-*` files added to `.gitignore`. API keys never committed to repo.
  - **Endpoint hardening:** `/lit/server-info` now requires authentication; server wallet address removed from response payload.
  - **Action CID alignment:** Fallback `getActionCid()` in `chipotle-client.js` updated to match registered production CID (`QmNayE5MYzXcoMS9nvRk6MUo8r4ESLa3i65vHXzuBsnC2b`).
- [ ] **PLANNED:** Decentralized Lit relay network — PC2 supernodes proxy Lit API calls on behalf of regular nodes. Shared API key stays on supernodes (never distributed to end-user nodes). Architecture: `PC2 Node → [node auth token] → Supernode relay → [shared API key] → Lit Chipotle API`. Benefits: (1) API key never leaves trusted infrastructure, (2) distributed relay eliminates single point of failure, (3) per-node usage attribution enables cost tracking, (4) rate limiting at relay layer protects shared quota, (5) foundation for future Elacity-native TEE network replacing Lit dependency. See decentralization roadmap below.
- [ ] **IN PROGRESS (V3 contracts):** V3 contract migration — ✅ Creator Dashboard (`app.js`) fully migrated to V3 ABIs, tested channel creation + free/paid minting + royalty distribution. ✅ Market app (`wallet.js`) V3 addresses verified, no V2 crossovers. ✅ Wallet bridge Base chain support added. ⏳ Remaining: `sdk/config.ts` V3 addresses, `config/default.json` Content Indexer V3 entry, `chipotle-client.ts` V3 AuthorityGateway for `hasAccessByContentId`, `packages/access` vendor bundles. ⛔ Market E2E blocked on Elacity GraphQL indexer (0 V3 assets indexed). See `docs/core/V3_E2E_TESTING_STATUS.md`
- [ ] **BLOCKED (V3 + Lit):** PDR Phase B — SDK extraction (`sdk/metadata.ts`, `sdk/contracts.ts`, `sdk/channels.ts`, `sdk/mint.ts`, `sdk/licensing.ts`, `sdk/compliance.ts`), Enterprise REST API (`/api/v1/content`, `/api/v1/license`, `/api/v1/compliance`), MCP Server for AI buyer agents (`elacity.content.*`, `elacity.license.*`)
- [x] Deploy to supernodes (InterServer + Contabo) — **Deployed Apr 6, 2026**. Updated web-gateway with `/api/ddrm/provision` endpoint, wrote Chipotle usage API key + PKP ID to `/etc/pc2/` on both servers, added nginx route on Contabo. Both endpoints verified externally. Fresh PC2 nodes can now auto-provision Lit Chipotle credentials on first startup
- [ ] Merge `feature/lit-chipotle-migration` -> `main`, tag v1.3.0

**Omnichain ELA:**
- [ ] Begin ELA liquidity deployment across target EVM chains
- [ ] Chainge Finance ELA deployment plan (119,630 ELA)

---

### Milestone 3 — P2P Networking & dDRM Foundation (Sep 30, 2026)

**Goal:** Nodes start talking to each other. dDRM marketplace takes shape.

**P2P Node Networking:**
- [ ] P2P messaging between PC2 nodes (text/data via Carrier)
- [ ] Node discovery and directory (public listing with reputation)
- [ ] Social features foundation (chat between node owners)
- [ ] IoT device connectivity patterns (sensors → personal cloud)
- [ ] dDRM CEK mesh caching — P2P key relay between nodes with shared ACCESS_TOKEN ownership. Signed attestation proves on-chain rights. Reduces Lit API calls and cost at network scale. Prerequisite: Chipotle migration complete
- [ ] **Decentralized Lit relay network** — Supernodes act as proxies for Lit Chipotle API calls, keeping the shared API key on trusted infrastructure. Architecture: `PC2 Node → [node auth token] → Supernode relay (round-robin) → [shared API key] → Lit API`. Phase 1: single relay on Contabo/InterServer. Phase 2: multi-supernode relay with load balancing and failover. Phase 3: protocol revenue feeds Lit credit pool, relay cost covered by network fees. Long-term: replace Lit dependency entirely with Elacity-native TEE network (see Milestone 7 — post-quantum TEE roadmap)
- [ ] **Carrier alignment** — PC2 capsules consume provider contracts (`elastos://peer/*`, `localhost://storage/*`), not raw topology. Transport/discovery = Carrier (Anders). Security/rendering/marketplace = capsule/provider layer (us). Rules: one runtime = one Carrier node per machine; capsules must not spawn their own Carrier nodes; Kubo stays optional, not Carrier core

**Awareness Layer (Context + Memory):**
- [ ] Context ingestion pipeline — location, photos, voice, motion, activity events all flowing to node
- [ ] Mobile companion app — lightweight iOS/Android app pushing GPS, photos, voice to your node
- [ ] Memory store — local SQLite + embeddings (via Ollama) for episodic and semantic memory
- [ ] Agent reads memory before every chat interaction (contextual responses, not stateless)
- [ ] Persistent agent loop — background process checking context every N minutes, firing proactive triggers
- [ ] Dynamic app generation — agent builds HTML/JS apps from context data on demand (e.g. trip map)
- [ ] Memory capsules — IPFS CID + DID ownership for generated experiences (shareable, ownable)

**Elacity dDRM Integration:**
- [x] Integrate Elacity dDRM SDK into ElastOS *(completed Mar 3-4 — Market dApp, player, wallet bridge)*
- [x] Encrypted content upload + CID distribution *(completed Mar 14 — Elacity IPFS pipeline, dual upload)*
- [x] Access token architecture (buy rights → get decryption key) *(completed Mar 4 — buyAccess + Lit Protocol DRM)*
- [x] Selective IPFS DHT announcement for dDRM content (`announce: true`) *(completed Mar 5 — dht.provide + periodic re-announce)*
- [x] Marketplace UI within ElastOS (browse, purchase, download) *(completed Mar 3-4 — Elacity Market dApp)*
- [x] Buyer node becomes seeder (CDN effect for encrypted content) *(completed Mar 5-6 — Bitswap-first + NAT traversal + relay)*
  - [x] **P2P content discovery** — catalog API enriched with `is_local` flag (cross-references pinned CIDs), `GET /api/catalog/providers/:cid` endpoint for on-demand DHT provider counting, `countProviders()` method on IPFSStorage. `GET /api/storage/ipfs/pins` endpoint for listing user's pinned CIDs. Enables fully decentralized content browsing without Elacity GraphQL *(completed Mar 23)*
- [ ] Incentivized encrypted content CDN — PC2 buyer nodes collectively serve encrypted segments via IPFS Bitswap. Bandwidth contribution tracking per node. Popular content auto-replicates across buyer network. Economic incentive via dDRM contribution credits

**Universal Asset Marketplace (dDRM beyond media):**
- [x] Lit Action trust model — custom `non-media-decrypt.js` with self-referential conditions, on-chain access check, Smart Account aware *(completed Mar 14)*
- [x] Capacity credit auto-detection — queries Chronicle Yellowstone for latest valid RLI token, handles 15-day rotation *(completed Mar 14)*
- [x] Server-side decrypt endpoint — `POST /api/storage/lit/decrypt` with Lit Action `executeJs()` *(completed Mar 14)*
- [x] Inline image rendering — decrypted content rendered as blob URL in Market dApp *(completed Mar 14)*
- [x] **End-to-end decrypt test with capacity credits** — **WORKING** (Lit Payment Delegation via Relayer API) *(completed Mar 15)*
- [x] Two-layer encryption — AES-GCM + Lit CEK (bypasses 4MB message limit) *(completed Mar 15)*
- [x] Server-side secure viewer — images/PDFs/text rendered server-side with watermark, no plaintext in browser *(completed Mar 15)*
- [x] Auto-decrypt on asset open — owned assets automatically decrypt when viewed *(completed Mar 15)*
- [x] **WASM Renderer** — Rust→WASM text rendering + WASMRuntime.ts WASI host *(completed Mar 15)*
- [x] **dDRM Viewer** — dedicated secure viewer app with native PC2 windowing, scrollable document view, .ddrm.json capsule support *(completed Mar 15)*
- [x] **GUI file type integration** — `.ddrm.json` icon, MIME, double-click → dDRM Viewer *(completed Mar 15)*
- [x] **PC2 Media Runtime** — server-side DASH/CENC decryption: Rust WASM cenc-decrypt crate + MSE player + DRM stripping + Lit CEK recovery. End-to-end video playback verified *(completed Mar 16)*
- [x] **Lit Chipotle migration** — Datil deprecated ~April 25, 2026. Replaced v7 SDK with REST API. `chipotle-client.ts` module, `LIT_BACKEND` feature flag, dual-mode rollback. Non-media + media encrypt/decrypt E2E verified on new dev network. Auto-provisioning coded. **CRITICAL: Mar 21 — Chipotle TEE restarted with breaking changes (IIFE → `async function main(params)` pattern). All 4 Lit Action scripts rewritten, CIDs re-registered, PKP re-added to group. See SESSION_HANDOVER.md.** *(completed Mar 13-18, breaking change fix Mar 21)*
- [x] **On-chain content indexer** — `ContentIndexerService` scans Base chain for `DigitalAssetRegistered` events from CoreStorage, builds local `content_catalog` SQLite table. Versioned contract support (v2 now, v3 config-only swap). Metadata resolution from IPFS (local-first, gateway fallback). API: `GET /api/catalog`, `GET /api/catalog/stats`, `GET /api/catalog/content/:contentId`. RPC failover with rotation. Replaces Elacity GraphQL dependency for content discovery *(completed Mar 21)*
  - Database migration 19: `content_catalog` table with indexes (creator, type, content_id, channel, status, block)
  - Configurable scan interval (default 30min), max blocks per scan (10K), metadata fetch concurrency (3)
  - Versioned contract design: when v3 contracts deploy, add `"v3": { "core_storage": "0xNEW...", "from_block": N }` to config — no code changes needed
  - **V3 contracts now available** (Apr 2026): CentralStorage `0x0C1EeA2A3361B80AC0e42179335dB536A951760b`, EventHub `0x5a694A6d988354dca491fe0F6db7a6ef46b656c2`, from_block `43892000`. V3 uses EventHub for aggregated events — parser update may be needed for EventHub topic signatures
- [ ] Self-provisioned RLI tokens — each PC2 node mints own capacity credits, removes Elacity wallet dependency. See Tier 1.3
- [ ] AI Model Marketplace alpha — encrypt GGUF/SafeTensors model → IPFS → ACCESS_TOKEN → decrypt on PC2 → load in Ollama
- [ ] Code/Plugin Marketplace — dDRM-gated npm packages, themes, extensions
- [ ] Dataset Marketplace — dDRM-gated training datasets, knowledge bases
- [ ] Fiat onramp — Particle Smart Account + Stripe/Moonpay for one-click credit card ACCESS_TOKEN purchase
- [x] `cenc-encrypt` Rust WASM crate — symmetric AES-128-CTR encryption in WASM sandbox, with init segment transformation and binary PSSH generation. 8 tests pass. **BUILT + INTEGRATED (Mar 17-18)**
- [x] `pssh-gen` included in `cenc-encrypt/pssh.rs` — ISO 23001-7 PSSH box generator for Elacity dDRM metadata. Binary PSSH construction in WASM, TypeScript PSSH injection for full JSON (ciphertext+hash+kid)
- [x] AES-GCM encrypt in WASM — non-media file encryption (`encrypt_only` mode in ddrm-renderer). Plaintext never touches Node.js memory. **DONE (Mar 18)**
- [x] WASM & I/O quick wins (5) — wasm-opt build pass, WASM preload, cache key fix, async thumbnail, async static I/O. **DONE (Mar 18)**
- [x] **Phase 2: mp4dash replaced with WASM pipeline (Mar 18)** — `mp4split.ts` (fMP4 parser), `mpdGenerator.ts` (DASH MPD XML), `executeCENCEncrypt()` in WASMRuntime, `dashPackager.ts` rewritten. Zero Python/mp4encrypt dependency. Only mp4fragment binary retained.
- [x] **IPFS chunk assembly in Rust/WASM (v1.3)** — **DONE (Mar 19)** — New `ipfs-assemble` Rust WASM crate. Files >=10MB assembled in WASM linear memory (`Vec::with_capacity` + `extend_from_slice`), reducing V8 heap from ~400MB to ~200MB for a 200MB file. Graceful fallback to `Buffer.concat`. Proto-capsule: same `wasm32-wasip1` binary runs in today's Wasmer and tomorrow's Wasmtime Runtime.
- [x] **ISO BMFF (MP4) parser in Rust/WASM** — **DONE (Mar 19)** — New `mp4-split` Rust WASM crate (91KB). Parses fragmented MP4 track metadata, init segment, and media segments entirely in WASM linear memory. Full codec parsing (AVC, HEVC, AV1, AAC, Opus, FLAC). Byte-identical output to JS parser. DASH encoding pipeline now routes through WASM. 800MB size guard with JS fallback.
- [x] **WASM decrypt max size raised to 200MB** — **DONE (Mar 19)** — `WASM_DECRYPT_MAX_BYTES` raised from 50MB to 200MB in `storage.ts`. Non-media dDRM files (images, PDFs, documents, code, AI models) up to 200MB now decrypt inside WASM sandbox — CEK never enters V8 memory. Media segments already had no size limit.
- [x] **Player access-denied UX** — **DONE (Mar 19)** — PC2 Media Runtime player now shows user-friendly "Access Required — purchase to watch" message instead of raw Lit Protocol errors when user lacks AccessToken.
- [ ] **WASM optimization audit: remaining items triage** — Tier 1-2 COMPLETE (13/18 — MP4 parser + decrypt limit now done). Tier B items audited: init segment split (SKIP — already WASM, microsecond cold path), NaCl/Boson crypto (DEFER — Carrier replaces), API key encryption (DEFER to v1.5 — redesign with capsule format). Tier 3 strategic items (Iroh IPFS, Rust proxy, Carrier P2P) **deferred until Anders publishes Carrier provider interfaces**. Category A remaining: AI serialization (MessagePack, v1.4).

**dApp Store (Global Decentralized App Marketplace):**
- [ ] dApp bundle format — encrypted app package with manifest (permissions, runtime, categories)
- [ ] Creator Dashboard: dApp mode — detect app bundles, add dApp-specific metadata
- [ ] Purchase → decrypt → auto-install flow via `AppInstallService`
- [ ] dApp Store UI with categories (DeFi, Games, Productivity, AI, Social), search, ratings
- [ ] dApp sandboxing v1 — CSP + iframe + postMessage bridge (PC2 v1.x)
- [ ] HTML5 game support — game bundles running in sandboxed iframe
- [ ] 3D model viewer — Three.js based viewer in dDRM Viewer
- [ ] Auto-update mechanism — new version CID → signed update notification
- [ ] "Verified" badges for established teams (Uniswap, Aave, etc.)
- [ ] dApp sandboxing v2 — signed capsules with capability tokens (requires Runtime convergence)

**Mobile:**
- [ ] Lightweight mobile companion app (React Native) — connect to PC2 node via WireGuard, browse marketplace, purchase, stream/download

**Supernode Decentralization:**
- [x] Second supernode (Contabo 38.242.211.112) operational — deployed 2026-03-07
- [x] Automated backup: InterServer → Contabo every 6 hours (SSH key auth, rsync)
- [x] App registry mirror on Contabo with 5-minute sync from primary
- [x] IPFS relay on Contabo (peer ID: 12D3KooWAaFWUWN7, 500+ peers)
- [x] Boson DHT on Contabo (node ID: EbfCHQUfwawec8Pa, Active Proxy on :8090)
- [x] PC2 client updated: multi-supernode failover for registry, IPFS bootstrap, Boson DHT
- [x] Web gateway on Contabo (slim read-replica with subdomain routing) — deployed 2026-03-07
- [x] Dual-write node registration (PC2 nodes register on all reachable supernodes) — deployed 2026-03-07
- [x] Stealth transport decentralization: WireGuard (wg1, 10.102.0.0/16), AmneziaWG (awg0, 10.103.0.0/16), VLESS Reality on Contabo — deployed 2026-03-07
- [x] Transport provisioning APIs on Contabo gateway (/api/wg/register, /api/awg/register, /api/vless/register)
- [x] Client-side sequential failover: WireGuardService, AmneziaWGService, VLESSRealityService all try secondary supernodes on primary failure
- [x] Supernode bootstrap script (`deploy/supernode-bootstrap.sh`) — one-command VPS setup *(completed Mar 7)*
- [x] Dynamic supernode discovery — gossip protocol + parallel fetch + disk persistence *(completed Mar 7)*
- [x] Registry mesh sync via gossip endpoints (all supernodes sync with all others) *(completed Mar 7)*
- [ ] Per-domain rate limiting on gateway (NETWORK_HARDENING item #8)

**Three-Tier Network Architecture:**
- [x] **Tier 1 — Full Supernodes:** Bootstrap script + gateway v2.0 with gossip/register/heartbeat *(completed Mar 7)*
- [x] **Tier 2 — Relay Nodes:** Relay mode toggle in PC2 Settings + IPFS circuitRelayServer + DHT server mode *(completed Mar 7)*
- [x] **Tier 3 — Leaf Nodes:** Standard PC2 nodes behind NAT (IPFS content seeding, local AI, personal cloud — this is today's default)
- [x] Supernode dApp in dApp Center: spec-check, service status, network view *(completed Mar 7)*
- [ ] Node auto-migration between supernodes on failure (provision cache clear + sequential failover already working)

**Supernode Economics (dDRM Access Token Model):**
- [ ] Design Access Token contract (ERC-1155 tiered: Free/Premium/Enterprise/Bundle)
- [ ] Integrate token verification into supernode gateway (Lit Protocol)
- [ ] List Access Tokens on Elacity Market alongside media content
- [ ] Bandwidth metering and attestation for proportional revenue distribution
- [ ] On-chain SupernodeOperatorRegistry for trustless operator management
- [ ] **Supernode RPC Service (Tier 2)** — supernodes offer cached/load-balanced Base RPC as a gated service. Leaf nodes route on-chain reads through their supernode instead of hitting public RPCs directly. Benefits: reduced rate-limit pressure on public endpoints, lower latency for content indexer scans, revenue via Access Token gating (premium RPC tier with higher rate limits). Implementation: caching reverse proxy (e.g. erigon light node or simple response cache) in front of Base RPC, exposed via supernode gateway endpoint, Access Token verification at gateway layer. Foundation: shared `rpc.ts` utility already supports endpoint rotation — adding a supernode RPC URL to the pool is a config change
- [ ] See [SUPERNODE_ECONOMICS.md](./SUPERNODE_ECONOMICS.md) for full strategy

**Network Infrastructure:**
- [ ] Multi-domain support — DNS + SSL + gateway for `*.pc2.net` and `*.ela.net`
- [ ] Relay nodes — PC2 nodes with public IP contribute IPFS relay + Boson DHT automatically
- [ ] Censorship resistance: IP-based fallback, DHT discovery, IPFS addressing (no DNS dependency)
- [ ] Encrypted registry replication across supernodes via IPFS

---

### Milestone 4 — Protocol Fee Architecture & Year 1 Review (Dec 1, 2026)

**Goal:** ELA demand mechanics live. First annual accountability report.

**Protocol Fees:**
- [ ] Fee collection on marketplace transactions (dDRM purchases)
- [ ] Fee pooling to market-buy ELA from DEX LPs
- [ ] Transaction fee on in-OS currency operations
- [ ] Fee dashboard (transparent, on-chain tracking)

**Node Operator Economics (dDRM Access Token Model):**
- [ ] Deploy SupernodeAccessToken contract (ERC-1155, tiered)
- [ ] Integrate Lit Protocol verification into gateway for tier-gated services
- [ ] Bandwidth metering and attestation for revenue distribution
- [ ] Operator registration and revenue claim via SupernodeOperatorRegistry.sol
- [ ] Media + Network bundle tokens (streaming + premium access in one)
- [ ] Compute/storage fee models for shared services
- [ ] Revenue split enforcement: 80% operators, 15% protocol treasury, 5% ELA buyback
- [ ] dDRM contribution credits — nodes earn Elacity credits by contributing IPFS bandwidth, CEK relay for mesh caching, and uptime. Credits offset Lit/key-management costs. Self-sustaining network economics replacing Elacity subsidy model

**Universal Marketplace Growth:**
- [ ] AI Model Marketplace — full launch with categories (LLM, vision, audio, multimodal)
- [ ] Composable assets — nested licensing with dependency declarations (model A depends on dataset B, royalties flow through)
- [ ] Enterprise DRM-as-a-Service pilot — white-label Elacity contracts for B2B software licensing
- [ ] Data Unions — collective licensing via MultiChannel (photographer collectives, research teams, music catalogs)
- [ ] Agent buyer support — MCP/A2A endpoints for autonomous agent procurement of ACCESS_TOKENs
- [ ] Elacity dDRM API product — one API key for encrypt/decrypt/mint/upload/verify/stream. Pay-per-request + tiered subscription revenue model. Target markets: AI agents (MCP/A2A), third-party marketplaces, WordPress/Shopify plugins, white-label integrations. Foundation: Chipotle migration makes all Lit calls simple HTTP POSTs

**Enterprise Rights Infrastructure (PDR):**
- [x] Enterprise metadata schema — `pc2-node/src/sdk/types.ts` with licensing, aiTraining, provenance, contentIntelligence, compliance interfaces (Mar 23)
- [x] Perceptual hashing — pHash/Chromaprint/SimHash in `pc2-node/src/services/media/fingerprint.ts` (Mar 23)
- [x] Hash registry — `content_hashes` DB table + query functions in `database.ts` (Mar 23)
- [x] Content Intelligence Service — `pc2-node/src/services/ContentIntelligenceService.ts` using Ollama (Mar 23)
- [x] Contract config centralization — `pc2-node/src/sdk/config.ts`, all addresses in one file (Mar 23)
- [x] Publish toolbar button — one-click upload dropdown in desktop toolbar, launches Creator Dashboard (Mar 23)
- [x] Publish Queue / Drafts — `publish_drafts` DB table (migration 21), `/api/drafts` REST endpoints, auto-save at pipeline checkpoint, resume signing from any device, badge count + queue list in toolbar dropdown (Mar 23)
- [x] **COMPLETE (Apr 6–7):** V3 ABI migration (Creator Dashboard) — Updated `app.js` with V3 ABIs: `ChannelFactory.createChannel`, `operative(address,uint256)` (replaces V2 `operativeOf`), `CentralStorage` events, `AssetFactory.mint` encoding, `bytes16 contentId` in `opRawData`. V3 `protocolShares` (5%) handled automatically — removed manual Elacity royalty from `getRoyaltyPartners`. Channel discovery via on-chain `ChannelCreated` event scan (parallelized, cached). 11 bugs fixed during testing (see `V3_E2E_TESTING_STATUS.md`)
- [ ] **BLOCKED (V3 + Lit):** SDK extraction — `pc2-node/src/sdk/` modules (metadata, contracts, channels, mint, licensing, compliance, pricing)
- [ ] **BLOCKED (V3 + Lit):** Server-side pipeline orchestrator — `sdk/mint.ts` chains encode→encrypt→upload→metadata autonomously on node, enables "upload and walk away" (Jetson processes while user is offline)
- [ ] **BLOCKED (V3 + Lit):** Enterprise REST API — `/api/v1/content`, `/api/v1/license`, `/api/v1/compliance` with API key auth
- [ ] **BLOCKED (V3 + Lit):** MCP Server — `elacity.content.*`, `elacity.license.*` tools for AI buyer agents
- [ ] AI Training Data wedge product — `licensing.aiTraining` metadata, training-rights access method
- [ ] Pre-publish safety screening — safetyScore gate in SDK mint pipeline
- [ ] Compliance dashboard — audit trail view, report export (PDF/JSON), license summary
- [ ] Enterprise billing — Stripe integration, usage metering, subscription tiers ($2-5K/mo)
- [ ] Multi-vertical metadata templates — AI Training, Media, Software/API, Academic, Datasets
- [ ] Sandbox environment — Base Sepolia testnet for pilot onboarding
- [ ] Developer documentation — quickstart, OpenAPI 3.0, code examples (Node.js, Python, cURL)
- [ ] Target: 3-5 enterprise pilots active, $30K+ MRR by Month 12

**Year 1 Report:**
- [ ] Comprehensive development output report (commits, releases, features)
- [ ] Network statistics (active nodes, transactions, uptime)
- [ ] ELA value capture metrics
- [ ] Full financial expenditure transparency
- [ ] Community growth documentation

---

### Milestone 5 — Developer Platform & Capsule Marketplace (Mar 1, 2027)

**Goal:** Third-party developers can build on ElastOS.

**Developer SDK:**
- [ ] Stable API surface documented for external developers
- [ ] SDK package (npm) for building ElastOS extensions
- [ ] Extension system — install/remove capsule-shaped apps
- [ ] Developer documentation and getting-started guide
- [ ] Example capsules (template projects)

**Capsule Marketplace Alpha:**
- [ ] Distribution model: sandboxed apps identified by CID
- [ ] In-ElastOS marketplace UI (browse, install, rate)
- [ ] Capsule packaging standard (manifest, permissions, dependencies)
- [ ] Begin extracting core services behind standardized interfaces

**White-Label Protocol (Elacity-as-Infrastructure):**
- [ ] Protocol SDK — let external developers build their own marketplaces on Elacity contracts with 1-2% protocol fee
- [ ] Marketplace factory — deploy custom `Channel` + `AuthorityGateway` instances for niche verticals
- [ ] Documentation for third-party marketplace builders
- [ ] Enterprise self-hosted option (private Elacity contracts for internal digital asset management)
- [ ] dDRM API gateway — REST API wrapping key management + IPFS + on-chain contracts. Developer dashboard with usage analytics, rate limiting, billing. Technical foundation: Chipotle migration + chipotle-client.ts abstraction layer

---

### Milestone 6 — Capsule-Ready Services & Marketplace Growth (Jun 1, 2027)

**Goal:** PC2 internals progressively modularized toward capsule interfaces.

**Modular Service Interfaces:**
- [ ] Storage provider contract (IPFS, cloud, local — same interface)
- [ ] Networking provider contract (WireGuard, Carrier, future mesh)
- [ ] Identity provider contract (wallet, DID, passkeys)
- [ ] AI provider contract (Ollama, OpenAI, Anthropic — same interface)

**Storage Abstraction:**
- [ ] Multiple storage backends behind unified API
- [ ] Cross-device sync foundation
- [ ] Cloud storage integration (S3-compatible, for users who want it)

**Remote Access & Mobile:**
- [ ] Desktop-as-a-Service exploration (RDP/VNC server mode)
- [ ] Mobile app for accessing your PC2 remotely
- [ ] Mobile SDK for Carrier (phone↔PC2 — Rong's `localhost://` WebSpace)
- [ ] GeoDNS for `*.ela.city` routing to nearest supernode

---

### Milestone 7 — Runtime Integration & Agent Economy (Sep 1, 2027)

**Goal:** Anders' Rust runtime begins integrating. Agent economy emerges.

**ElastOS Runtime Status (v0.1.2 — Apr 16, 2026):**
> Repository: [github.com/Elacity/elastos-runtime](https://github.com/Elacity/elastos-runtime) branch `review/0.1.2`
> Pure Rust monorepo (~96K LOC across 163 Rust files). No C dependencies, no OpenSSL.
> Verified on Linux x86_64 and aarch64 (Jetson). macOS: compiles and runs (WASM + full security model), microVM requires Linux KVM.
> 17 capsules: pc2, agent, chat, chat-wasm, did-provider, gba-emulator, gba-ucity, ipfs-provider, llama-provider, md-viewer, notepad, room-browser, room-browser-ui, site-provider, tunnel-provider, webspace-provider, ai-provider
> Fresh install: `curl -fsSL https://elastos.elacitylabs.com/install.sh | bash && elastos setup && elastos`

| Component | Status | Notes |
|-----------|--------|-------|
| Runtime core (capabilities, signatures, audit) | **Verified** | 12 checks per capability invocation, Ed25519 signed tokens |
| WASM execution (Wasmtime) | **Verified** | `wasm32-wasip1` — same target as our WASM crates. Works on macOS |
| microVM execution (crosvm/KVM) | **Verified** | Rootless on Jetson and WSL. Linux-only (KVM required) |
| Carrier P2P (DID, DHT, gossip, relay) | **Verified** | iroh (QUIC + DHT + relay). Native/WASM interop. Room sync with sovereign invite/accept |
| Data capsules (signed content + viewer) | **Working** | Maps directly to `.ddrm.json` + dDRM Viewer |
| Signed release pipeline | **Proven** | Ed25519 publish/install/update |
| AI provider (`elastos://ai/`) | **Working** | LLM routing via llama-provider |
| DID identity | **Working** | Device-backed `did:key` with Ed25519, local profile storage, shared nickname handling |
| Room/Chat | **Working** | Native P2P chat, signed messages, cross-runtime Carrier sync, hosted room-browser |
| Provider interface | **Documented** | stdin/stdout JSON protocol for capsules |
| Namespace model (`localhost://`, `elastos://`) | **Documented** | Full object model with typed traversal |
| Host adapter model | **Documented** | Server/headless (= our PC2 Node.js), desktop, mobile, kiosk |
| Blockchain integration | **Next** | Anders starting: "DID, EVM, Puter, capsule orchestration user journey" |
| macOS packaging | **COMPLETE** | Apple notarized v1.2.2, double-click install |

**Convergence Plan (agreed Apr 16, 2026 — bottoms-up approach):**
> Anders and Sasha agreed on bottoms-up convergence: start from vanilla Puter in Runtime, migrate PC2 features to capsules one by one.
> Convergence inventory document prepared: `docs/handover/PC2_CONVERGENCE_INVENTORY_FOR_RUNTIME.md`

- [ ] **Phase 1 (Now):** Anders focuses on capsule orchestration + blockchain connectivity. PC2 provides ESC RPC, wallet bridge reference, convergence doc.
- [ ] **Phase 2 (Next month):** `wallet-provider` capsule (EVM signing) + `storage-provider` capsule (IPFS). These two unlock blockchain + storage inside Runtime.
- [ ] **Phase 3:** `drm-provider` capsule using existing WASM crates. Needs Phase 2 providers.
- [ ] **Phase 4:** App capsules (Market, Creator, Player, Viewer) as signed capsules with capability tokens.
- [ ] PC2 desktop as Shell capsule — Puter runs inside Runtime as the orchestrator
- [ ] WASM sandboxed execution for app capsules
- [ ] Capability token model (capsules request permissions, shell grants/denies)
- [ ] MicroVM isolation where hardware supports it (Firecracker on x86, crosvm on ARM)
- [ ] DID integration with ESC/EID for `elastos://` WebSpace
- [ ] **dDRM Provider Capsule** — our existing Rust WASM crates (`aes-gcm-decrypt`, `cenc-decrypt`) repackaged as signed capsules. `chipotle-client` ported to Rust. CEK never leaves capsule linear memory. ACCESS_TOKEN → capability token bridge: Runtime verifies on-chain ownership, issues scoped `{ action: "drm:decrypt", resource: CID }` token. Lit calls happen inside sandbox. Full audit trail via Runtime immutable log
- [ ] **dApp Store on Runtime** — purchased dApps run as signed capsules with zero ambient authority. DeFi frontends (Uniswap, Aave) sandboxed — can only access approved RPC endpoints. Games in microVM. Capability tokens replace iframe CSP.
- [ ] Key custody primitive — `elastos-keycustody` crate providing Shamir Secret Sharing split/combine, encrypted share storage, quorum reconstruction protocol. Mechanism-only (no policy); dDRM capsule provides policy decisions
- [ ] Key custodian capsule — supernode-hosted capsule that stores key shares, verifies on-chain access (`hasAccessByContentId`), releases shares under proof of authorization. Content-addressed code (IPFS CID) for immutability — same trust model as Lit Actions but running on PC2 infrastructure
- [ ] `KeyCustodyRegistry.sol` — on-chain mapping of contentId → custodian supernode set. Quorum parameters (N shares, K threshold). Geographic diversity requirements
- [ ] PC2 threshold key management — creators encrypt CEK against K-of-N PC2 supernodes instead of Lit Protocol via Shamir Secret Sharing. Progression: Lit primary → Lit fallback → Lit optional → fully sovereign

**Agent Economy:**
- [ ] Agent-to-agent communication (capability-gated trust)
- [ ] Investable agents with dDRM-protected capabilities
- [ ] Tradeable skill capsules (agent expertise as distributable CIDs) — **foundation shipped in v1.2**: SKILL.md format, `.md` publishable as Wealth Capsule, `Content Type: AI Agent Skill` attribute, Market feed + detail badge. Convergence path: SKILL.md → signed data capsule with capability declarations, in-memory-only decrypt (CEK never on disk), ownership verification per agent message
- [ ] Agent marketplace (deploy, discover, interact)
- [ ] Evaluate ERC-8004 agent registry for node/agent identity and discovery
- [ ] Register PC2 nodes and Flint agent in ERC-8004 Identity Registry (ERC-721)
- [ ] Integrate ERC-8004 Reputation Registry for dApp Store app/agent ratings
- [ ] Expose MCP/A2A endpoints in agent registration files for cross-agent discovery
- [ ] Agent workspace namespace alignment — `~/pc2/agents/{id}/` maps to `localhost://UsersAI/{agentName}/` per Rong's WCI directory model (Users and UsersAI as parallel peer actors)

**Carrier Network:**
- [ ] Multi-supernode WireGuard with load balancing (NETWORK_HARDENING Phase 2)
- [ ] Geographic supernode routing (connect to nearest)
- [ ] 5+ operational supernodes (independent operators in different jurisdictions)
- [ ] Supernode services as capsule bundles (boson-dht, ipfs-relay, tunnel-wg, gateway, bandwidth-meter)
- [ ] Mesh networking between supernodes (registry gossip, peer forwarding)

---

### Milestone 8 — Year 2 Review & Convergence Progress (Dec 1, 2027)

**Goal:** Comprehensive Year 2 accountability.

- [ ] Marketplace activity report (transactions, dDRM sales, capsule installs)
- [ ] Protocol fee deployment metrics (ELA bought, fees collected)
- [ ] Capsule architecture advancement (% of services modularized)
- [ ] Node network growth (active nodes, geographic distribution)
- [ ] Full Year 2 financial expenditure report

---

### Milestones 9–13 — Sovereign Scale (2028–2029)

**These milestones are directional. Specific tasks will be defined based on Year 1-2 learnings.**

**Peer-to-Peer Services (M9):**
- Direct exchange of compute, storage, content between nodes
- Sandboxed AI execution environments
- Protocol fee revenue expansion
- TEE-sealed local decrypt — on TEE-capable hardware (SGX, TrustZone, Secure Enclave), CEK decrypted inside local hardware enclave with no network round-trip. Ultimate sovereignty: user's own silicon is the trusted execution environment, blockchain is the access ledger. Fallback to PC2 threshold for non-TEE hardware
- Key migration tooling — re-encrypt Lit-encrypted content CEKs against PC2 custodian supernode set while Lit is still available. Enables graceful transition away from any external key management dependency. Batch migration for existing content catalogs

**Self-Sustaining Revenue (M10):**
- Protocol fees covering operational costs
- Node operator profitability from real usage
- ELA demand from structural mechanics

**Capsule Ecosystem (M11):**
- Growing catalog of independent capsules
- Autonomous agent-to-agent commerce
- Runtime convergence: minimal core + capsule ecosystem

**Enterprise Readiness (M12):**
- Enterprise-grade reliability, security, scalability
- Capital raise positioning with documented traction
- Performance and stability focus

**Mandate Completion (M13 — Mar 2029):**
- Full 3-year report: commits, releases, nodes, fees, growth, expenditure
- Foundation for self-sustainability beyond funding period

---

## Cross-Cutting Concerns (Apply to All Milestones)

### Rong's Vision Alignment

| Rong's Concept | How ElastOS Implements It | Status |
|----------------|--------------------------|--------|
| Cloud storage as primary, local as cache | IPFS as storage layer, local files as cache | ✅ Working |
| Personal Cloud Computer (Digital Silo) | PC2 node on personal hardware | ✅ Working |
| P2P network of Elastos Computers | Carrier overlay + WireGuard + Active Proxy | ✅ Working |
| Apps in VMs | Capsules in WASM/microVM sandboxes | 📋 Phase 2-3 |
| Instant Apps (Code Browser) | Capsules distributed by CID, installed from marketplace | 📋 Phase 2 |
| `https://` WebSpace | `*.ela.city` domains via gateway | ✅ Working |
| `localhost://` WebSpace | Carrier P2P between nodes | 🔨 Phase 1-2 |
| `elastos://` WebSpace | Blockchain oracles, DID resolution | 📋 Phase 3 |
| IoT / Smart Home | Jetson, sensors, cameras as context feeds | 🔨 Phase 1-2 |
| Awareness Layer | Location + photo + voice + memory → contextual agent | 🔨 Phase 2-3 |
| Full-duplex Voice | PersonaPlex-7B or equivalent on-device voice model | 📋 Phase 3+ |
| Runtime manages ALL network traffic | Capability-gated networking in runtime | 📋 Phase 3 |

### Post-Quantum Cryptographic Migration

> **Audit:** See `docs/core/POST_QUANTUM_AUDIT.md` for full crypto primitive inventory and vulnerability assessment.
> **Principle:** Replacing Lit Protocol, building PQ crypto, and packaging for Runtime v2 capsules are the same project — do them together.

**Current Posture:**
- Symmetric crypto (AES-256-GCM, SHA-256, ChaCha20): **PQ-adequate** ✅
- AES-128-CTR (CENC media only): **Acceptable** for media content lifecycle (Grover: 2^64 ops, impractical) ✅
- Key wrapping (Lit ECDH P-256, BLS threshold): **Vulnerable** — highest priority ❌
- Transport (WireGuard Curve25519, libp2p Noise X25519, Boson X25519+Ed25519): **Vulnerable** ❌
- Identity (secp256k1 ECDSA via Particle/Ethereum): **Vulnerable** — follows Ethereum EIP-8141 timeline ❌

**Sovereign Key Management (Lit Replacement + PQ):**
```
Current:   Lit Chipotle REST API (ECDH P-256 + BLS threshold)
           - $0.01/execution, managed service, no hardware requirements
           - 5-min session cache reduces multi-page PDF costs to $0.01/session
           - Free eth_call preflight checks both EOA + smart account before Lit call
           - Promise coalescing prevents duplicate charges for concurrent requests
           - Per-wallet rate limiting (30 calls/min) protects shared API quota
           - Server-side RPC/authority/identity hardening (no client injection)
           - Break-even vs own TEE: ~45,000 executions/month ($450/month)
Phase A:   Supernode relay — shared API key on supernodes, regular nodes use auth tokens
Phase B:   Dual-write — Lit + PC2 supernode TEE custody (3+ supernodes required)
Phase C:   PC2 primary TEE, Lit fallback
Phase D:   PC2 only, Lit optional — $0/execution (own hardware)
Phase E:   Content re-encryption from Lit to PC2 with PQ wrapping
```

**Cost Analysis (Lit Protocol Chipotle — as of Apr 2026):**
- $0.01 per Lit Action execution (minimum 1 second)
- Read-only operations (API key management, account info): free
- Credit packages: $5 minimum, no expiry
- Typical encrypt or decrypt: <1 second = $0.01
- 100 operations = $1, 10,000 operations = $100
- Session cache (5 min, memory-only) eliminates redundant calls for multi-page PDFs
- AuthorityGateway eth_call preflight: free (view function, no gas)

**Self-Sovereign TEE Roadmap (Lit Independence):**

The long-term goal is to run our own TEE enclaves on PC2 supernodes, eliminating per-execution Lit costs while maintaining hardware-isolated key management (the strongest security guarantee).

```
User opens .ddrm file
    ↓
PC2 node checks AuthorityGateway (free eth_call)
    ↓ AccessToken confirmed
PC2 node → supernode TEE enclave (Intel TDX / AMD SEV-SNP)
    ↓
TEE enclave:
  - Cryptographic attestation (proves correct, unmodified code)
  - Master key sealed in enclave storage
  - Decrypts CEK inside enclave
  - Returns CEK over attested TLS channel
    ↓
PC2 node decrypts in WASM, renders pixels, throws away CEK
```

| Component | Technology | Estimated Cost |
|-----------|-----------|---------------|
| TEE hardware | Intel TDX / AMD SEV-SNP servers (Hetzner/Contabo offer these) | ~$50-150/month per node |
| Enclave runtime | dstack (what Lit uses), Gramine, or Occlum (open source) | Free |
| Remote attestation | On-chain verification of TEE attestation reports (Base) | Small gas costs |
| Key sealing | Master keys sealed to enclave identity, survive reboots | Built into TEE hardware |
| Redundancy | 3+ TEE nodes minimum for availability | 3x hardware cost |
| Per-execution cost | $0.00 — own hardware | Amortized in server cost |

**Decision: CEK caching strategy (Apr 2026):**
- **No persistent CEK caching** — AuthorityGateway is the source of truth (blockchain as law)
- **Session cache only** — 5 min TTL, memory-only, cleared on restart. Covers multi-page PDFs.
- **Rationale:** Persistent caching breaks sell/transfer/revocation model. If user sells AccessToken, cached CEK would still work. The $0.01/view cost is the price of provable hardware-isolated security.
- **Future consideration:** If costs become a concern at scale (>45K decrypts/month), Phase A TEE eliminates per-execution cost entirely while maintaining hardware isolation guarantees.

| Priority | Action | Target | Status |
|----------|--------|--------|--------|
| P0 | Lit Chipotle production integration | Apr 2026 | ✅ **COMPLETE** |
| P0 | Session CEK cache (5 min, memory-only) | Apr 2026 | ✅ **COMPLETE** |
| P0 | Dual-wallet preflight (EOA + smart account) | Apr 2026 | ✅ **COMPLETE** |
| P1 | AES-256-CTR mode flag in CENC Rust crates | When convenient | 📋 Planned |
| P2 | Grow supernode count to 3+ | Q2-Q3 2026 | 📋 Prerequisite for TEE custody |
| P2 | Evaluate dstack / Gramine for supernode TEE | Q3 2026 | 📋 Research |
| P2 | Prototype `elastos-keycustody` Rust crate (Shamir + ML-KEM-768, wasm32-wasip1) | Q3 2026 | 📋 Planned |
| P2 | Evaluate ML-KEM/ML-DSA Rust crates for wasm32-wasip1 | Q3 2026 | 📋 Research |
| P3 | Dual-write: Lit + PC2 TEE custodian for new content | Q4 2026 | 📋 Planned |
| P3 | libp2p Noise PQ hybrid (when js-libp2p ships) | 2027 | 📋 Dep on ecosystem |
| P3 | Boson CryptoBox: ML-KEM-768 + X25519 hybrid | 2027 | 📋 Our code |
| P4 | PC2 TEE primary key custody, Lit fallback only | 2027-2028 | 📋 Sovereignty milestone |
| P4 | Content re-encryption tooling (Lit CEKs -> PQ custody) | 2027-2028 | 📋 Planned |
| P5 | Full Lit removal — PC2 sovereign TEE key management | 2028 | 📋 Walk-away complete |
| P5 | Full PQ stack (all transports, all identity) | 2028-2030 | 📋 Pre-Q-Day |

**Runtime v2 Convergence:** `elastos-keycustody` crate targets `wasm32-wasip1` — runs as WASM module in v1.x, becomes signed capsule in v2. PQ primitives (ML-KEM-768, ML-DSA-65) built in from day 1.

### Elacity dDRM SDK Integration Path — Universal Asset Protocol

> **Vision:** Elacity as the "Amazon of digital assets" — not just media, but AI models, code, datasets,
> templates, agent skills — all gated by dDRM ACCESS_TOKENs, tradeable by humans and agents.
> See [ELACITY_UNIVERSAL_ASSET_STRATEGY.md](./ELACITY_UNIVERSAL_ASSET_STRATEGY.md) for full strategy.

```
Phase 1 — Media Foundation (M2-M3) ✅ COMPLETE:
  Integrate dDRM SDK → encrypted content upload → access tokens
  → marketplace UI → buyer downloads → buyer becomes seeder
  → app.json manifest spec with dDRM capability declaration

Phase 2 — Universal Access Layer (M3-M4):
  Extract @elacity-js/access from media-player (Lit Protocol key retrieval)
  → generic decrypt-to-buffer for ANY encrypted CID
  → AI Model Marketplace alpha (GGUF → IPFS → ACCESS_TOKEN → Ollama)
  → Code/Plugin Marketplace, Dataset Marketplace
  → Fiat onramp (Particle + Stripe/Moonpay)
  → Creator Dashboard dApp (upload any file → encrypt → list)

Phase 3 — Supernode Economics + White-Label (M3-M5):
  Supernode Access Tokens — dDRM SDK verifies network service access
  → Access Tokens listed on Elacity Market alongside all asset types
  → Media + Network + AI bundles (content + compute + access in one token)
  → White-label protocol SDK for third-party marketplace builders
  → Enterprise DRM-as-a-Service pilot
  → Fee collection → ELA buy-pressure → royalty distribution

Phase 4 — Agent Economy + Runtime (M5-M7):
  Agent-to-agent commerce — autonomous procurement via MCP/A2A
  → composable assets (nested licensing, dependency royalty trees)
  → dDRM as a capsule in the Runtime → independent versioning
  → capability tokens bridge: ACCESS_TOKEN → runtime capability grant
  → Data Unions (collective licensing via MultiChannel)
  → supernode services as token-gated capsules in the runtime

Phase 5 — Platform Scale (M7+):
  Elacity becomes protocol infrastructure (Stripe of digital assets)
  → multiple vertical marketplaces built on Elacity contracts
  → agent marketplaces (deploy, discover, hire autonomous agents)
  → cross-chain expansion (Base, Arbitrum, Solana via bridges)
  → self-sustaining revenue from protocol fees across all verticals
  → Elacity dDRM API: one key for all operations (encrypt, decrypt, mint, stream, verify)
  → PC2 dDRM mesh: CEK caching, encrypted CDN, contribution economics
  → sovereign key management: PC2 threshold network replaces Lit for new content
  → TEE-sealed local decrypt for capable hardware (SGX, TrustZone, Secure Enclave)
  → key migration: re-encrypt legacy Lit content to PC2 threshold custody
  → full walk-away from external key management dependencies
```

### SDK Package Evolution

```
TODAY:
  @elacity-js/contracts     ← Already universal (AuthorityGateway, TradeGateway, Operatives)
  @elacity-js/api           ← Media-coupled (NFTService, ChannelService)
  @elacity-js/media-player  ← Media-only (DASH, CENC, MSE, SharedArrayBuffer)
  @elacity-js/media-packager← Media-only (upload, transcode, encode)
  @elacity-js/common        ← Already universal (auth types, pagination)

TARGET (M3-M5):
  @elacity-js/contracts     ← No change needed
  @elacity-js/api           ← Add AssetService, MarketplaceService, LicenseService
  @elacity-js/access  (NEW) ← Universal access layer: verify + decrypt ANY asset via Lit Protocol
  @elacity-js/asset-packager (NEW) ← Generic encrypt + IPFS upload for non-media assets
  @elacity-js/media-player  ← Stays, becomes consumer of @elacity-js/access
  @elacity-js/media-packager← Stays for media-specific transcoding
  @elacity-js/common        ← Add universal asset type interfaces
```

### ERC-8004 Agent Registry Integration Path

> **Standard:** [ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004) (Draft, Aug 2025)
> **Authors:** MetaMask, Ethereum Foundation, Google, Coinbase
> **Status:** Draft, ~1,500 agents registered on Sepolia testnet (Mar 2026)
> **CTO Note:** Evaluate alongside bankr/BNKR trend — autonomous on-chain agents with identity + reputation are seeing massive market growth ($100M+ market cap).

Three on-chain registries: Identity (ERC-721 per agent), Reputation (feedback signals), Validation (zkML/TEE/re-execution proofs). Complementary to Elacity SDK — ERC-8004 handles agent discovery/trust, Elacity handles content rights/marketplace.

```
Phase 1 (M2-M5) — Forward-Compatible Design:
  Design app.json manifest services[] field to align with ERC-8004
  registration file format → zero rework when adopting the standard later
  Ensure DID integration can serve as identity layer for ERC-8004

Phase 2 (M5-M7) — Node Identity & Reputation:
  Register PC2 nodes as ERC-8004 agents (ERC-721 NFT per node)
  → node registration file advertises ela.city URL, MCP endpoint, DID
  Wire dApp Store ratings to Reputation Registry (on-chain feedback)
  → app quality, uptime, success rate as on-chain signals

Phase 3 (M7+) — Agent Economy:
  Register Flint AI agent in Identity Registry with A2A/MCP endpoints
  → other agents discover and interact with Flint via ERC-8004
  Agent-to-agent trust via Reputation + Validation registries
  → capability-gated agent interactions with on-chain reputation
  Content creators as registered agents with reputation scores
```

### Enterprise Rights Infrastructure (PDR — March 2026)

> **Strategic Pivot:** From general-purpose sovereign compute to focused B2B enterprise licensing infrastructure, with AI training data licensing as the primary wedge market.
> **Thesis:** Every AI company will need provable, auditable licensing of training data within 2-3 years. Elacity's existing protocol is the infrastructure to deliver it.
> **Positioning:** "Stripe for content licensing" / "Compliance infrastructure for the AI economy"
> **Full PDR:** See `.cursor/plans/pdr-aligned_enterprise_roadmap_b7f66066.plan.md`

```
PDR Phase 1 — Foundation (Months 0-3, Mar-Jun 2026):
  SDK Extraction — extract Creator Dashboard pipeline into pc2-node/src/sdk/
    → sdk/metadata.ts, sdk/contracts.ts, sdk/channels.ts, sdk/mint.ts
    → sdk/licensing.ts (NEW: license terms, AI training permissions)
    → sdk/compliance.ts (NEW: audit trail, chain-of-custody export)
    → sdk/types.ts (enterprise metadata schema with licensing.aiTraining)
  Enterprise REST API — /api/v1/content, /api/v1/license, /api/v1/compliance
    → API key auth, blockchain-invisible JSON responses
    → "20 lines of code" integration simplicity
  Developer Documentation — quickstart, OpenAPI 3.0 reference, code examples

PDR Phase 2 — Wedge Product (Months 3-6, Jun-Sep 2026):
  "Elacity for AI Training Data" — vertical product for data owner licensing
    → licensing.type: 'training-rights' metadata template
    → AI training scope, attribution, derivative works, model type restrictions
  Content Intelligence Service — Ollama-powered analysis before publishing
    → classification, quality assessment, safety screening, provenance
    → ContentIntelligenceReport embedded in metadata = compliance documentation
  MCP Server — pc2-node/src/mcp/server.ts
    → elacity.content.package, .analyze, .search
    → elacity.license.verify, .acquire
    → How AI buyer agents interact with the protocol
  Perceptual Hashing — pHash (images/video), Chromaprint (audio), SimHash (text)
    → Provenance verification for AI training data
    → Duplicate/piracy detection across network
  Compliance Dashboard — audit trail, report export, license summary
  Sandbox Environment — Base Sepolia testnet for pilot onboarding

PDR Phase 3 — Traction & Revenue (Months 6-12, Sep 2026-Mar 2027):
  Target: $30K+ MRR from enterprise subscriptions + transaction fees
  Pre-publish Safety Screening — integrated into SDK mint pipeline
  Enterprise Billing — Stripe, usage metering, subscription tiers
  Multi-Vertical Templates — Media, Datasets, Software/API, Academic, AI Models
  Regulatory Engagement — EU AI Office, ASEAN regulators

PDR Phase 4 — Scale (Months 12-24, Mar 2027-Mar 2028):
  Target: $200K+ MRR, Series A positioning
  On-chain Reputation — per-wallet scores, flag/dispute tracking
  Dispute Resolution — licensing arbitration (manual → DAO)
  CSAM Screening — hash matching + AI classification (legal prerequisite)
  Invisible Watermarking — buyer-specific marks during Lit decryption
  Agent Economy Bridge — ERC-8004, autonomous procurement via MCP
  Content Versioning — version chains, upgrade licensing
```

**PDR-to-Milestone Mapping:**
- PDR Phase 1 (SDK) accelerates Milestone 5 (Developer Platform) by ~9 months
- PDR Phase 2 (API/MCP) aligns with Milestone 4 (dDRM API product)
- PDR Phase 3 (billing/revenue) aligns with Milestone 4 (Protocol Fees)
- PDR Phase 4 (agent economy) aligns with Milestone 7

**Revenue Model:**
- Enterprise SaaS: $2-5K/month base for platform access, compliance dashboard, support SLAs
- Transaction fees: 1-5% on licensing revenue processed through the protocol
- At scale, transaction fees dominate (Stripe model)

**ICP:** Mid-tier content companies ($10-500M revenue) producing IP that AI companies want to train on — independent film studios, mid-size music labels, academic publishers, SaaS companies with API products, AI training data providers, open-source AI model creators.

### Network Hardening (from NETWORK_HARDENING.md)

| Priority | Item | Target Milestone | Status |
|----------|------|-----------------|--------|
| Must-have | Gateway under systemd | M2 | Done (both supernodes) |
| Must-have | Multi-supernode transport | M3 | Done (WG+AWG+VLESS on InterServer + Contabo) |
| Must-have | Dual-write registration | M3 | Done (PC2 nodes register on all supernodes) |
| Must-have | Uptime monitoring | M2 | Pending |
| Must-have | SSL auto-renewal | M2 | Pending |
| Should-have | Supernode bootstrap script | M3 | Done (Mar 7) |
| Should-have | Dynamic supernode discovery | M3 | Done (Mar 7) |
| Should-have | Relay node mode | M3-M4 | Done (Mar 7) |
| Should-have | Supernode Manager dApp | M3 | Done (Mar 7) |
| Should-have | Community networking fix | M2-M3 | Done (Mar 8 — fix-networking.sh) |
| **Next** | **InterServer gateway v2.0 upgrade** | **M3** | **Waiting for go-ahead** |
| **Next** | **WireGuard bundling with app** | **M2-M3** | **Planned — prevents broken ActiveProxy fallback** |
| **Next** | **Gateway "node offline" page** | **M2** | **Planned — replaces infinite initializing** |
| Should-have | Per-domain rate limiting | M3 | Pending |
| Should-have | Node health dashboard | M4 | Pending |
| Future | On-chain supernode registry | M4-M7 | Pending |
| Future | Mesh networking | M7+ | Pending |
| Future | Geographic routing | M7+ | Pending |

### ELA Value Capture Mechanics

```
Usage → Fees → Buy ELA → Scarcity → Price Support

Mechanisms (Universal Asset Protocol — all verticals contribute):
1. Media marketplace fees (dDRM purchases)              → M3-M4   (TAM: $10-50M/yr)
2. AI model marketplace fees                            → M3-M4   (TAM: $50-200M/yr)
3. Code/plugin/dataset marketplace fees                 → M4-M5   (TAM: $20-100M/yr)
4. Supernode Access Token sales (network services)      → M3-M4   (TAM: $5-20M/yr)
5. Protocol fees (in-OS transactions)                   → M4
6. White-label protocol fees (third-party marketplaces) → M5+     (TAM: $100M+/yr)
7. Enterprise DRM-as-a-Service                          → M5+     (TAM: $50-200M/yr)
8. Agent-to-agent transaction fees                      → M7+     (TAM: $50-500M/yr)
9. Compute/storage fees                                 → M7+

Revenue split (Access Tokens):
  80% → supernode operators (proportional to bandwidth served)
  15% → Elacity protocol treasury
  5%  → ELA buyback pool

All fees → pool → market-buy ELA from DEX LPs

See docs/core/SUPERNODE_ECONOMICS.md for full strategy.
See docs/core/ELACITY_UNIVERSAL_ASSET_STRATEGY.md for marketplace vision.
```

---

## Monthly Release Cadence

Starting Month 1 (March 2026):

| Release | Target | Focus |
|---------|--------|-------|
| v1.1.0 | March 2026 | Merge Jetson branch, bug fixes, AV1 player |
| v1.2.0 | April 2026 | **Lit Chipotle dDRM — PRODUCTION** (non-media + media E2E verified on mainnet Apr 2), **Free content minting** (cleartext DASH, no Lit, tokenized on-chain), **dDRM security hardening** (injection prevention, rate limiting, promise coalescing, secrets protection), local media encoding (FFmpeg+WASM CENC+DASH — E2E verified, Python-free), AV1 playback verified (init splitting + PSSH strip), WASM optimization (mp4-split Rust crate, IPFS chunk assembly, decrypt limit 200MB, player UX), **Universal Asset Viewers** (3D models with VFX features, CSV datasets, fonts, archives — Tier 1 completion), **Ebook & Comic support** (EPUB reflowable html-lock with sanitized XHTML + zero-width forensic watermark + diagonal SVG overlay, CBZ comics pixel-lock with natural page sort — all inside existing `ddrm-renderer` WASM module, no runtime contract changes), audio routing fix (all audio through Media Runtime DASH), **Particle Auth + Agent Wallet minting** (dual-wallet channel creation, SA batch mint, tx hash resolution — DONE Mar 27), **Runtime player unification** (Rust player for general media, dDRM viewer for general PDFs), **Enhanced channel creation UX** (channel-first workflow, naming/description fields, subscription model), supernode provisioning ready, hardware expansion, installer improvements, WireGuard bundling |
| v1.3.0 | May 2026 | IPFS streaming chunk assembly (production reliability — OOM fix for large files on Jetson), AI Model Marketplace alpha (GGUF→Ollama), on-chain content indexer (**DONE** — ContentIndexerService), dApp bundles, `@elacity-js/asset-packager`, **PDR: SDK Extraction (pc2-node/src/sdk/)**, **PDR: Enterprise metadata schema (licensing, aiTraining, provenance types)** |
| v1.4.0 | June 2026 | Multi-rendition encoding, fiat onramp, AI serialization optimization (MessagePack), signed capsule format (bridge to Runtime), **PDR: Enterprise REST API (/api/v1/*)**, **PDR: Developer documentation (quickstart, OpenAPI)** |
| v1.5.0 | July 2026 | dApp Store v1 (categories, ratings, HTML5 games), mobile companion alpha, **PDR: Perceptual hashing + hash registry**, **PDR: MCP Server (pc2-node/src/mcp/server.ts)** |
| v1.6.0 | August 2026 | Signed capsule format (bridge to Runtime), Supernode Access Tokens, bandwidth metering, **PDR: Content Intelligence Service**, **PDR: AI Training Data product** |
| v1.7.0 | September 2026 | Protocol fees alpha, white-label SDK alpha, **PDR: Compliance dashboard**, **PDR: Sandbox environment**, enterprise pilot onboarding |
| v1.8.0 | October 2026 | Developer SDK, composable assets (nested licensing), **PDR: Pre-publish safety screening**, **PDR: Enterprise billing (Stripe)** |
| v1.9.0 | November 2026 | Agent buyer support (MCP/A2A), capsule marketplace alpha, **PDR: Multi-vertical templates** |
| v1.10.0 | December 2026 | Year 1 hardening + comprehensive review |
| v2.0.0 | Q1 2027 | **Runtime convergence** — PC2 desktop as Shell capsule (server/headless host adapter), dDRM as Provider Capsule, full capability tokens. **Risk:** Runtime blockchain integration not yet started (gates ACCESS_TOKEN → capability token bridge) |

*Releases beyond v1.10.0 defined based on Year 1 learnings.*

---

## How to Use This Document

1. **Monthly:** Review current milestone, check off completed items, plan next month
2. **Weekly:** Reference for shipping reports — what was done, what's next
3. **Quarterly:** Milestone review against DAO proposal commitments
4. **For new team members / contributors:** Start here to understand the full picture
5. **For community questions:** Point to specific sections showing progress and direction
