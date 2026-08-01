Elacity Labs — Weekly Team Update for the World Computer Initiative (WCI)

**July 24 – July 31, 2026**

**Mainnet recovered — and ElastOS Runtime v0.6 is on `main`.** Coming out of last cycle’s mainchain halt ([#30](https://github.com/Elacity/pc2.net/discussions/30)), this week ELA **rewound to 2,260,450**, restarted PoW at **2,260,451**, and returned to **BPoS at 2,261,186** on **v1.0.2** — **87** fixes, live scan **0** violations ([honest log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md)); **Node v1.2.2** for the operator fleet. On the product side, Anders’ **Runtime v0.6** authority rebuild is **merged to `main`** (+58 commits; tip `51e37bd`) — Runtime-derived identity, typed Wallet approvals, durable tx reconciliation, contained Browser (preview), WASM Component Model + `elastos:bus@v1`, signed audit history (§3). Formal GitHub **Release/tag** still catching up (latest published release remains **v0.4.0**). Parallel: **Hyper + hey-engine** in sync, marketplace lane closed (**1.13.1** / drm-api **0.11.0** / web **4.5.0**), Provenance live. **PC2 zero commits = convergence:** **PC2 + chain + Carrier + Runtime → one ElastOS.**

> ELA recovered · **87** fixes · Node v1.2.2 · **Runtime v0.6 on `main`** · Hyper + hey-engine · marketplace **closed** · **PC2 → Runtime convergence**.

---

## Key Links This Week

- **Previous report** — [Week of July 17 – July 24, 2026 (#30)](https://github.com/Elacity/pc2.net/discussions/30)
- **Ecosystem (lead)** — [elastos/Elastos.ELA](https://github.com/elastos/Elastos.ELA) tags **v1.0.0 / v1.0.2** · [elastos/Elastos.Node](https://github.com/elastos/Elastos.Node) releases **[v1.2.0](https://github.com/elastos/Elastos.Node/releases/tag/v1.2.0)** · **[v1.2.2](https://github.com/elastos/Elastos.Node/releases/tag/v1.2.2)**
- **Honest recovery log** — [Elastos ELA · Mainnet recovery](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md) (87 fixes, live scan, gates)
- **Hyper lane (pushed)** — [Elacity/Hyper](https://github.com/Elacity/Hyper) (Android UI) · [Elacity/Hey-engine](https://github.com/Elacity/Hey-engine) (shared Rust core) — both verified **in sync**
- **Runtime v0.6 on `main`** — [Elacity/elastos-runtime](https://github.com/Elacity/elastos-runtime) tip [`51e37bd`](https://github.com/Elacity/elastos-runtime/commit/51e37bdd615a8d1de83ec3c0c157b6ab6e1e8ce6) · CHANGELOG **[0.6.0]** · GitHub Release/tag still **pending** (latest published: [v0.4.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.4.0))
- **Runtime — still open** — [PR #10: Upcoming release 0.6.x](https://github.com/Elacity/elastos-runtime/pull/10) · [PR #9: Flint 0.5](https://github.com/Elacity/elastos-runtime/pull/9) · `feat/shell-ui-esp-on-protocol-extended-ai-work` (Agent/shell polish, not in 0.6)
- **Install (PC2 node)** — `bash <(curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/update.sh)`
- **Install (Runtime)** — `curl -fsSL https://elastos.elacitylabs.com/install.sh | bash`
- **Live surfaces** — map.ela.city · portal.ela.city · elacitylabs.com/provenance

## Table of Contents

1. The Big Picture — Recovery + Runtime v0.6 Week
2. Ecosystem — Mainnet Recovery Status + ELA/Node Toolkit
3. ElastOS Runtime v0.6 — Authority Rebuild (Anders)
4. Wallet Bus v2 — Authority-Bound Provider Rebuild
5. Recovery — Journaled Offline Root Migration + Plaintext Lockdown
6. Auth & Passkey — Exact-Intent Step-Up
7. Browser Capsule — Contained VM + Trusted Clipboard
8. GBA Capsule — Opaque-Frame Containment
9. Shell UI — Agent Space, Liquid Dock, Mobile Agent
10. Docs & Capsule Contract — 0.6 Truth + Component Model
11. Marketplace API & Infra — closed out (1.13.1 / 0.11.0 / trackers)
12. ElacityLabs.com — Provenance Launch
13. elacity-web — Base Marketplace UX Polish (4.5.0)
14. PC2 → Runtime — Why the Operator Repo Looks Quiet
15. Hyper + Hey-engine — Engine Split, Security Tiers, Privacy
16. Convergence Lens — Four Into One
17. Looking Ahead
18. Summary Statistics
19. Data-Quality & Off-Repo Notes
20. Off-Repo Context


---

## 1. The Big Picture — Recovery + Runtime v0.6 Week

Three stories, one week — recovery, **v0.6**, and convergence.

**First, the chain recovered — and the recovery is documented honestly.** Last cycle the mainchain stopped after the Fixed64 overflow mint ([#30](https://github.com/Elacity/pc2.net/discussions/30) §2). This cycle: freeze at **2,260,595** → rewind to **2,260,450** → PoW restart at **2,260,451** (29 Jul) → **BPoS live at 2,261,186** (31 Jul). **87** correctness/security fixes; live scan **0** violations — [honest log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md). Operators: **ELA v1.0.2** + **Node v1.2.2**.

**Second, Runtime v0.6 rebuilds authority — and it is on `main`.** Home and Apps no longer choose identity or reach providers directly. The Runtime derives the active identity, checks each request, records the decision, and sends approved work to the responsible provider. Wallet Provider still owns keys and signing; Apps never receive them. Anders’ notes + CHANGELOG **[0.6.0]** are in §3; GitHub Release/tag publish is the remaining packaging step.

**Third — ElastOS is no longer “PC2 plus some Runtime work.”** The team is **all-in on Runtime**: PC2 lessons + chain + Carrier + capsule model, rewritten ground-up in Rust/WASM. Marketplace/Hyper closed in parallel. Zero commits on `pc2.net` is convergence working.

The through-line: **reopen money on tagged binaries; ship the OS on Runtime-derived authority — not four parallel stacks forever.**

## 2. Ecosystem — Mainnet Recovery Status + ELA/Node Toolkit

**Elastos org access confirmed.** Center of gravity this week: the mainnet actually came back, and the fix set is large enough to warrant an honest public log — not a tag list alone.

**Full plain-English inventory:** [Elastos ELA · Mainnet recovery — honest log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md) (what could have gone wrong, what each class of fix does, proven live vs pending).

### Where the chain is

| Milestone | Height / note |
|---|---|
| Froze (20 Jul, after exploit) | **2,260,595** |
| Rewound to (last safe) | **2,260,450** |
| Restarted (29 Jul, PoW) | **2,260,451** |
| BPoS live (31 Jul) | **2,261,186** |
| Gate one (live every block) | **2,260,451** |
| Gate two (ELA-only reward mint engine) | **2,265,000** — not reached yet |

**Live binary:** **v1.0.2**. Operator toolkit: **Elastos.Node v1.2.2**.

### Live scan (read-only, auto every ~30 min)

Published complete scan band: blocks **2,260,451 → 2,261,533** (1,083 blocks) — per-asset conservation, coinbase = real ELA, amounts in range. **Nothing written to the chain.** Scan continues as the tip advances.

| Metric | Result |
|---|---|
| Newly minted (published band) | **824.200905 ELA** — exact sum of entitled block rewards |
| Distinct assets | **1** (ELA only) |
| Violations | **0** |
| Chain tip (public RPC, Aug 1 polish) | **~2,262,448** — past BPoS return; past published scan band |

**Caveats (keep these):** post-restart traffic has been light; cross-chain transfers / side-chain withdrawals / CR deposit refunds have not yet appeared in the scanned span, so those guards stay **pending** rather than “proven live.”

### 87 correctness and security fixes

| Status | Count |
|---|---|
| Proven live | **32** |
| Pending, live scan (need the right tx) | **4** |
| Pending @ block **2,265,000** | **2** |
| Proven on testnet (attack/crash paths a healthy chain never hits) | **48** |
| By design (strict sponsor lock withdrawn — split risk) | **1** |
| **Total** | **87** |

Grouped for operators (detail in the honest log):

1. **Coins from nothing** — per-asset conservation, ELA-only coinbase + fees, overflow-safe cross-chain math, height-aware vote bounds  
2. **Reward inflation** — arbiter/CR/miner split; empty-seat double-pay; overflow-safe totals  
3. **Coinbase / identity / NFT** — maturity, frozen addresses, remint-by-replay, same-block collisions  
4. **BPoS ↔ PoW** — stall forgery, fake confirms, emergency sigs, sync-stuck-at-409956, gossip first-message, v1.0.2 undo-mode restore  
5. **Rewind / restart ops** — journaled rewind, residue purge, preflight, mainnet settings pin, mesh join gate  
6. **Validators / CR / bridge sigs** — real emergency signatures, Schnorr heights pinned, savepoints, evidence anti-gaming  
7. **Availability** — public restart removed, profiler password leak closed, remote crash / memory DoS hardening  

**Still to prove on live:** four tx-class guards (cross-chain amount/overflow, Schnorr withdraw path stays config-off, CR deposit backstop). **At 2,265,000:** ELA-only reward mint + arbiter reward from ELA-only fees — honest reward should not move by a unit across the gate.

### Elastos.ELA (private) — ~156 commits · tags v1.0.0 / v1.0.1 / v1.0.2

Recovery-oriented consensus work landed and tagged (subset of the 87):

- Rollback: purge mempool checkpoint written above the rollback target
- Emergency-inactive-arbitrators undo gated; vote money height-gated; historic activation heights pinned
- Reorg revert-symmetry / DPoS gossip pre-check structure-only; BPoS return path
- Bound aux-block pool; pin mainnet block-shape / Schnorr heights
- Committee rollback underflow + modulo-by-zero guards
- `ela-cli preflight` / restart honesty; operator-loud rewind logs
- Release docs + changelog + reviewer guide

**Tags:** `v1.0.0` (Jul 29), `v1.0.1`, `v1.0.2` (Jul 30). GitHub Release objects may still catch up; prior published release was `v0.9.9.6`. **v1.0.2** is what the live recovery path ran.

### Elastos.Node (public) — releases v1.2.0 + v1.2.2

| Release | Date | What it adds |
|---|---|---|
| **v1.2.0** | 2026-07-26 | `ela preflight` |
| **v1.2.1** (in series) | — | Honest update path; `ela rewound`; `ela consensus on\|off`; `binary` fingerprint |
| **v1.2.2** | 2026-07-29 | `ela consensus` actually **applies** the change |

### Posture reminder

- Rewind target **2,260,450** applied; chain past BPoS return — still follow **official** operator notices for bridge / ESC / EID and any further gates.
- Bridge remains dark until separately cleared; do not freestyle mixed consensus or weaken pinned mainnet recovery settings.
- Auditors (Halborn / CertiK) remain on the recovery RC path; this weekly does not substitute for their reports.
- Pending scan items and gate two are **not** “unfixed” — they are **unexercised or not yet active**.

## 3. ElastOS Runtime v0.6 — Authority Rebuild (Anders)

**Status (Aug 1, confirmed):** **`main` updated.** Tip [`51e37bd`](https://github.com/Elacity/elastos-runtime/commit/51e37bdd615a8d1de83ec3c0c157b6ab6e1e8ce6) (`fix(vz): classify private stdin portably`) · **+58 commits** vs prior `main` · CHANGELOG section **[0.6.0] - 2026-07-31**. Formal GitHub **Release/tag `v0.6.0` not published yet** (latest Release object remains [v0.4.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.4.0)) — amend with the Release URL when `scripts/publish-release.sh` (or equivalent) lands.

This is a substantial rebuild of how Apps interact with the system.

### Authority

Home and Apps no longer choose identity or reach providers directly. The Runtime:

1. Derives the **active identity**
2. **Checks** each request
3. **Records** the decision
4. Sends **approved** work to the responsible provider

**Wallet Provider** still owns keys and signing. **Apps never receive them.**

### Home split

Home is now:

- a **trusted host**
- the **graphical desktop**
- an optional **command-line shell**

Both shells use the same Runtime facts, permissions, approvals, and App catalog. **People** is now a **separate App** instead of being embedded in Home.

### Wallet — typed requests and exact approvals

Wallet integration rebuilt around typed requests and exact approvals. Account access, signatures, and transactions return through **Wallet** and **Inbox**. The Runtime keeps **durable transaction state** so interrupted requests can be reconciled without accidentally broadcasting twice. **Managed Wallet recovery** is included.

### Browser — contained VM (preview)

The Browser runs through a contained VM with Runtime-managed networking and WebRTC display. Websites can discover the injected ElastOS wallet, but account and transaction requests still return through the normal Wallet approval path.

**Honest preview limits for 0.6:** Browser restart reliability, retained website login, profile recovery, and performance still need work — so **0.6 treats Browser as a preview**, not a finished general-purpose browser.

### Also in 0.6

- Restores the portable **GBA / uCity** path
- Strengthens **Chat** conversation identity
- Adds **signed, hash-linked Runtime audit history**

### Developers — Component Model + `elastos:bus@v1`

0.6 introduces the **WASM Component Model** and **`elastos:bus@v1`** as the future capsule contract. Existing first-party UI Apps still use narrow web projections and will move to Components individually as each path is proven. New capsule templates, manifest checks, and reproducible packaging make that transition reviewable.

### Upgrade honesty

ElastOS remains **pre-release** software. Existing **0.5** data homes are **not** promised a seamless upgrade in every case — back up anything important and be prepared to reset an old test installation.

---

*Implementation commits for the week that built this cut are in §4–§10 below.*

## 4. Wallet Bus v2 — Authority-Bound Provider Rebuild

Keystone of the Runtime substrate week on `fix/elastos-shell-protocol-browser-wip`:

- `7a93a4e` — **elastos-wallet-contract** crate: authority-bound Wallet Bus v2
- `3f55272` — reconstruct **wallet-provider** on Bus v2 (accounts, approvals, external/managed/tx validation, Bitcoin path, browser signing tests)
- `59e2018` — canonicalize transaction-outcome projection (“one shape of an outcome, everywhere”)
- `feac582` — migrate **every Runtime route** onto Bus v2 (gateway + wallet test suites) — v2 stops being a parallel path
- `d38e047` — restore managed Wallet keys through Bus v2 (recovery-kit smoke + entropy check)
- `7ee35d3` — Runtime owns durable transaction effects (`gateway_transaction_effects.rs`)
- `8382b96` — close **generic Wallet authority paths**; `check-wci-alignment.sh` + `wallet-product-safety-smoke.sh`

## 5. Recovery — Journaled Offline Root Migration + Plaintext Lockdown

- `e60d20a` — journaled offline root migration (server walks the swap, does not merely assert it)
- `03b46129` — auth-root reassignment **atomic** (no half-migrated states)
- `3511dc6` — **block plaintext root activation** across gateway surfaces
- `c81b957` — migrate declared plaintext **before readiness**; install/restart scripts (`install.sh`, linux/mac source-home restart, `setup-source-home.sh`) share the gate so readiness never lies

## 6. Auth & Passkey — Exact-Intent Step-Up

- `b9e465e` — exact-intent **durable** passkey step-up (prove you’re you *for this intent*; survives reload)
- `8fe2199` — harden audit + launch authority; new docs **`AUTH_AUDIT_CHAIN.md`** + **`HOME_SHELL_HOST_CONTRACT.md`**; gateway test suites hold the contract

## 7. Browser Capsule — Contained VM + Trusted Clipboard

Aligns with §3 Browser-as-preview:

- `f4af430` — reconcile Home and Browser session lifecycle (**61 files / ~+16.5k / −3.2k**). Home owns the session; Browser is a tenant. Follow-up `f5648d0` on the vz supervisor.
- Contained VM path: Runtime-managed networking + WebRTC display; injected wallet discovery still returns through Wallet approval
- `3a62702` — bounded Clipboard through trusted Home — no browser-owned clipboard shortcut
- `fe69148` — connector approval lifecycle bound to the same trusted-Home spine (MetaMask / UniSat / wallet capsule)
- `389d44c` — pin local Exit dependencies (Cargo.lock)

## 8. GBA Capsule — Opaque-Frame Containment

`57223f9` — preserve the portable engine in an opaque frame (+3.5k / −5.0k). Proof harness under `scripts/fixtures/gba-opaque-frame-browser-proof/`. Restored in the v0.6 path (§3): a third-party engine can run inside the browser capsule **without leaking DOM handles** to the host.

## 9. Shell UI — Agent Space, Liquid Dock, Mobile Agent

On `feat/shell-ui-esp-on-protocol-extended-ai-work` (surface polish alongside the 0.6 authority cut):

- Agent workspace expand preview save → harness pivot (`ed0db73`)
- **Agent Space dual-plane** — harness, Mission Control peer, quality harden (`f3af21e`)
- **Part X mobile Agent** — drawer, pill composer, no pager dots (`ec0629c`)
- **Liquid dock membership** — Bin ride, restore intro, breathe instead of snap (`5f88f59`)
- Harness closeout Wave 3 + debt/entropy/SEAM sanitize (`23accda`)
- Late-week Agent Workbench / frontier-stream polish (truth strip, Chat|Build modes, thinking blocks)

## 10. Docs & Capsule Contract — 0.6 Truth + Component Model

`91f8411` — one-motion doc catch-up across PRINCIPLES / ROADMAP / TASKS / ARCHITECTURE / CAPSULE_MODEL / ESP stabilization plan / CHANGELOG / state.md.

**Now on `main` (selected tip commits):**

- `3753c17` — `chore(release): prepare 0.6.0 metadata`
- `d7b7944` / `6babd93` — freeze and harden **0.6 release truth**, limits, and architecture docs
- `44f3676` / `2f6300b` — Linux/macOS build gates
- `27a02a8` / `51e37bd` — Browser close sync + portable VZ stdin classification

**Developer contract (from §3):** WASM Component Model + **`elastos:bus@v1`**; first-party UI Apps migrate path-by-path; new templates, manifest checks, reproducible packaging.

## 11. Marketplace API & Infra — closed out (1.13.1 / 0.11.0 / trackers)

**Review & follow-up report (Aug 1):** all four marketplace PRs reviewed, follow-ups applied on top, then deploy. Author: **irzhywau**.

### v1-rest-server (private) — PRs #1–#3 + #4 · **1.13.1**

Merged price-feed gate + stats/scaffold caches, then follow-ups:

- Gate always-on price feed to **ESC only**
- Cache explore scaffold on hot `/fetchTokens`; collection volumes/stats cache with marketplace write bust
- Closed cache-bust gaps (`update` / `replaceOne` / `findOneAndReplace`, query-level `remove`, `bidPlaced` price updates) + tests
- **PR #4:** `/fetchTokens` crash could take the whole server down — fixed + process-level guards + selection-shape tests
- Released as **1.13.1**

### drm-api-layer (private) — PRs #1–#3 · **0.11.0**

Merged Lab-off, getLogs clamp, and cacher-invalidation work, then follow-ups before deploy:

- Laboratory metrics off by default
- Replaced the fixed **500k-block** clamp with a **probe-first adaptive `eth_getLogs` scanner** (per-chain window + batching, anchored at **contract creation** instead of genesis)
- Cacher hardening: best-effort cache-clean broadcast, `CACHER_TTL` clamp, backgroundjob cache-clean moved into hooks (handlers stay pure) + unit tests/docs
- **0.11.0** on `release/0.11` → merged into `release/base-network`
- docker-arch: `CACHER` / `CACHER_TTL` wired for the API service

**Worth continuing (not this week):** port the same Base `eth_getLogs` optimization to **ESC**. Tracker + v1-rest already treat ESC correctly; drm-api Base/ESC branches diverge enough that it was not obvious to do in the same cut.

### combined-trackers (private) — PR #1

- Merged NODEINDEX fix + processing-time off + mqworker cap
- Follow-ups: NODEINDEX fallback corrected to `'0'`; container build (cloudbuild + Dockerfile) ported from `develop`; cleanup

### Infrastructure (www VM)

Architecture check on the www VM: downsized **n2-standard-2 → e2-medium** — still **2 vCPU**, RAM **8 GB → 4 GB** (cost cut, no CPU loss; headroom validated).

## 12. ElacityLabs.com — Provenance Launch

**ElacityLabsWeb (private) · ~10 commits on `main`.** Product/marketing surface for the week:

- **Provenance** product page, free-scan funnel, SOC 2 essay
- SEO pack / visuals / intake; homepage Provenance + FAQ refresh
- Newsletter + founder quote → footer; scroll-triggered wordmark Lottie CTA
- Public emails, security.txt, Cal intake slug; soft-404 `/scan` → `/provenance/scan`
- Product nav polish (Runtime label)

## 13. elacity-web — Base Marketplace UX Polish (4.5.0)

[PR #25](https://github.com/Elacity/elacity-web/pull/25) (`feature/ui-polish-july-2026` → `release/base-network`) — reviewed, follow-ups applied, reported **merged and bumped to 4.5.0** for deploy (irzhywau):

- Base marketplace feel, floor-stats skip until listed, volumes cache align with server bust
- Cal-like nav density; Labs chrome / minting modal / sidebar
- Light-mode contrast for glass menus, charts, modals, notifications
- Sell-flow stepper; withdraw pill; offline toast dismiss

## 14. PC2 → Runtime — Why the Operator Repo Looks Quiet

**Zero commits on `Elacity/pc2.net` this window** — and that is the correct reading only if you stop at git stats.

What is actually happening:

- **PC2 v1.4.0 did the job.** Node Manager, multi-arch packaging, dapp-centre, operator UX, DDRM/session hardening — the personal-cloud line is stable enough that the team is not burning cycles on Puter-shaped increments.
- **The product bet moved.** ElastOS is being built as a **complete, ground-up system** in the Runtime repository: Rust services, WASM capsules, ESP (shell↔capsule authority), Carrier (authenticated Runtime-to-Runtime transport), wallet/recovery/auth buses, and the Home GUI. That is not “PC2 with a new skin.” It is a **rewrite of the trustworthy computing stack** so we are not permanently leveraged on third-party desktop/cloud frameworks.
- **Convergence of four into one.** The mental model for WCI readers:

| Legacy / parallel lane | What it contributed | Where it lives now |
|---|---|---|
| **PC2** | Personal cloud, operator UX, install/update discipline, capsule-as-app intuition | Patterns → Runtime Home / install / shell |
| **Blockchain** | Money, consensus, DAO/node ops | Elastos.ELA + Node (recovery train this week) + Runtime chain/wallet capsules |
| **Carrier** | Peer networking / mesh intuition | Rebuilt as bounded, signed Runtime transport (prior + this cycle’s foundation) |
| **Runtime** | Capsules, providers, authority | The **integration product** — ElastOS |

So: **PC2 is not abandoned; PC2 is graduating.** Further ENM registry flips or packaging patches may still land when operators need them, but the creative center of gravity — and the **v0.6 cut now on `main`** (§3) — is Runtime.

## 15. Hyper + Hey-engine — Engine Split, Security Tiers, Privacy

**Both repos pushed and verified in sync** (team machine → GitHub, Jul 31), then a **follow-up wave the same night** (still in sync).

| Repo | Role | Sync card → tip |
|---|---|---|
| [Elacity/Hyper](https://github.com/Elacity/Hyper) | Android UI shell (Compose / JNI) | **22** synced · **+8** follow-up (HeyElastos) |
| [Elacity/Hey-engine](https://github.com/Elacity/Hey-engine) | Shared **Hyper** Rust core — one engine, every product surface | **132** synced · **+7** follow-up (HeyElastos) |

Author lane: **HeyElastos** (primary) · one earlier Hey-engine commit via EverlastinOS.

### Architecture — engine split executed

Hyper-Android is now **UI-only** on the sibling **hey-engine** crate tree (`HEY_ENGINE_EXTRACTION` v2 recorded: layout, invariants, APK gate green). Rust that used to live inside the Android repo moved out so Desktop / WASM / future clients share one core. Cross-product **QR wrap/unwrap** contract is Android-byte-exact in `hey-core`.

### Product / mesh (Hyper UI + engine)

- **Multi-source media swarm** — large channel media fetched from many holders (slice serving); user-initiated video fetch raised to the **64 MiB** open cap (was blocked at 5 MiB)
- **New channel subscriber fix** — swarm mesh + backfill so joiners actually see content
- **Lightweight P2P relay** — metered / battery-gate heavy-media serving so a phone never “torrents” big blobs for others
- **Calls** — ANR fix (blocking JNI off Main); kill phantom video mount + prefer hardware decoder; admit peer at OFFER; voice lane observable
- **DMs** — message leaves the outbox only when the recipient acknowledges arrival
- **Groups** — a workspace no longer dumps its members into your personal chat list
- **Efficiency** — gate poll threads on screen state (~204 → ~24 wakes/hr)
- **PQ Phase A** — recoverable ML-DSA-65 identity key locally (foundation only; no wire surface yet)
- **F-Droid** — docs for how Elacity hosts its own repo; product docs kept local-only where appropriate

### Privacy + security hardening (hey-engine focus)

Hardening landed as **Tier 0 → Tier 4** plus call/DM/group fixes (public summary, not a vuln cookbook):

- Strip **GPS/EXIF** from image send fallback and video; privacy policy text made true to behavior
- **Redact DIDs** in logs (unredacted logs are a readable social graph)
- Trust ceremony grants less; feed epoch cannot go backwards; call media cannot reuse a stale key/nonce across process restart
- Byte budgets on DM/group receive; outbox eviction cannot delete *other* conversations’ messages; group replay-window flush corrected
- Close unauthenticated local engine API binding on Desktop; address policy stops advertising undialable candidates (`tun0` / carrier NAT)
- ELA send: outpoint-value monotonicity cache (Tier 3); private-host label-prefix bypass closed
- Delivery canary before lengthening receive backoff; at-rest DEK race closed under load

Two **correct-or-brick** gaps from the consolidated review were fixed on the Hyper UI side before sync.

### Follow-up wave (after the sync card, still Jul 31)

Hyper UI:

- **Nearby** — advertise rotating per-contact tokens, not the raw DID
- **Notifications** — park on the wake lane; announce messages that arrive behind the unlock gate; stop a locked session going silent
- **Wallet lock** — tell the user when feed activity arrives while sealed; a locked phone must still receive
- **Calls** — tell the caller when nobody could be reached
- **Ledger** — pin the hardware wallet; refuse a bond downgrade
- **Video** — zero-copy 1080p capture path prepared (switched off pending geometry check)

hey-engine:

- **Nearby** — stop broadcasting a permanent identifier to anyone in Wi-Fi range
- **At rest** — refuse to write rather than write plaintext
- **Notifications** — wake the notifier instead of polling every 5 minutes
- **Calls** — drive the invite until the callee acks; surface failure
- **Gossip / radio / paths** — stop pruning ourselves out of the broadcast tree; instrument the socket; retire dead paths; stop holepunching into a wall

## 16. Convergence Lens — Four Into One

| Concern | PC2 (legacy operator line) | Runtime (ElastOS product) | Elastos org / ops |
|---|---|---|---|
| Strategic role | **Done enough to converge from** — patterns moving in | **All-in build** — Rust/WASM ground-up OS | Recovery binaries for money integrity |
| Money / consensus | Operator node still runs the stack | Wallet Bus v2 + durable tx reconcile (§3) | **ELA v1.0.x** + **Node v1.2.x** |
| Wallet authority | Historic wallet-bridge lessons | **Runtime-derived authority**; Apps never hold keys | — |
| Recovery | Older kit lessons | Journaled offline root + managed Wallet recovery | Rollback target 2,260,450 |
| Network | Mesh/operator experience | Carrier as authenticated, bounded transport | — |
| Shell / agents | dapp-centre grammar | Agent Space + liquid dock + mobile Agent | — |
| Marketplace | Quiet | — | **1.13.1** + drm-api **0.11.0** + web **4.5.0** + Provenance |

**Reading:** Asymmetry is intentional. You do not rewrite the operator OS and the money consensus train in the same merge — and you do not keep four trustworthy-computing stacks forever. This week’s git map (heat in Runtime + ELA/Node + Hyper/hey-engine; silence on PC2) is the convergence working as designed.

## 17. Looking Ahead

### Ecosystem recovery (priority)

1. Keep the [honest log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md) current as the live scan tip advances
2. Confirm gate two at **2,265,000** (ELA-only reward mint + arbiter fee base); promote pending live-scan items when cross-chain / withdraw / CR refund txs appear
3. Freeze RC → auditor repo access → quotes (Halborn / CertiK)
4. Bridge / ESC / EID clearance remains separate; KuCoin freeze / disposition follow-through
5. Fleet: run **v1.0.2** + Node **v1.2.2**; `ela preflight` / `ela rewound` / `binary` before joining consensus

### Product — Runtime v0.6 (on `main`)

- **Publish GitHub Release/tag `v0.6.0`** — code is on `main`; packaging step still open. Amend this weekly with the Release URL when live
- Browser preview follow-ups: restart reliability, retained login, profile recovery, performance
- Move first-party UI Apps onto Components / `elastos:bus@v1` path-by-path as each is proven
- Carrier / extended shell-UI arcs deferred past 0.6 (per release posture)
- **Hyper / hey-engine:** sync + follow-up landed (§15) — APK / F-Droid soak; PQ wire surface only when ready
- **Marketplace lane closed** (§11–§13) — soak **1.13.1** / drm-api **0.11.0** / web **4.5.0**; optional next: port drm-api adaptive `eth_getLogs` from Base → **ESC**
- Provenance: watch free-scan funnel metrics
- **PC2:** operator-critical patches only; convergence = Runtime consuming PC2 lessons

## 18. Summary Statistics

**Window (UTC):** 2026-07-24 → 2026-07-31, with **Aug 1** deltas (Hyper follow-up, irzhywau marketplace close-out, Anders 0.6 prep). Previous report [#30](https://github.com/Elacity/pc2.net/discussions/30).

| Repository | Commits | Notes |
|---|---|---|
| elastos/Elastos.ELA | ~156 | Tags **v1.0.0 / v1.0.1 / v1.0.2** — recovery train |
| elastos/Elastos.Node | 9 | Releases **v1.2.0**, **v1.2.2** |
| Elacity/elastos-runtime | **+58 on `main`** | **v0.6 on `main`** tip `51e37bd` (Anders §3); GitHub Release/tag pending |
| Elacity/v1-rest-server | ~20 | **1.13.1** — cache busts + `/fetchTokens` crash guards (PR #4) |
| Elacity/ElacityLabsWeb | ~10 | Provenance launch |
| Elacity/elacity-web | polish arc | **4.5.0** reported · [PR #25](https://github.com/Elacity/elacity-web/pull/25) |
| Elacity/drm-api-layer | ~11 | **0.11.0** — adaptive eth_getLogs + cacher harden |
| Elacity/combined-trackers | ~7 | NODEINDEX / mqworker / container build port |
| Elacity/docker-arch | ~3 | pm2 + CACHER / CACHER_TTL; www VM → e2-medium |
| Elacity/Hyper | **22** sync + **8** follow-up | Engine-split UI · Nearby/notifications/ledger |
| Elacity/Hey-engine | **132** sync + **7** follow-up | Shared Rust core · Security Tier 0–4 |
| Elacity/pc2.net | 0 | **Expected** — convergence into Runtime (§14) |
| Elacity/elastos (site) | 0 | Last push Jul 23 |

- **Runtime authors:** Anders Alm (v0.6 authority cut) · SashaMIT (shell/Agent arc)
- **Hyper lane authors:** HeyElastos (primary) · EverlastinOS (1)
- **Marketplace / infra:** irzhywau — review + follow-up + deploy (§11–§13)
- **PRs:** Runtime v0.6 **merged to `main`**; marketplace closed out per report; PC2 none.
- **Releases:** Elastos.Node **v1.2.0 / v1.2.2**; ELA **v1.0.x**; v1-rest **1.13.1**; drm-api **0.11.0**; elacity-web **4.5.0** (reported); Runtime CHANGELOG **0.6.0** on `main` — GitHub Release object still **v0.4.0** until tag publish; PC2 **v1.4.0**.

## 19. Data-Quality & Off-Repo Notes

- **Attribution.** Team-level narrative; AI-pair / Cursor co-authored shell commits count as team work under direction and review.
- **Branch vs main / release timing.** Runtime **v0.6 is on `main`** (+58 commits, tip `51e37bd`, Aug 1). CHANGELOG has **[0.6.0]**; GitHub **Release/tag not published yet**. `state.md` on `main` may briefly lag the merge (still describing the consolidation branch as unmerged). Marketplace close-out from irzhywau’s report; GitHub may still show elacity-web [PR #25](https://github.com/Elacity/elacity-web/pull/25) open / tip **4.4.0** vs reported **4.5.0** deploy state.
- **Hyper commit accounting.** Sync card **22** + **132** in sync; then **+8 / +7** follow-up. Hey-engine’s **132** is full extracted history on `main`.
- **PC2 zero-commit.** Do not read as project abandonment — see §14 (convergence thesis).
- **Org coverage.** Full Elacity-org scan + **Elastos org** (access confirmed).
- **Ecosystem reopen.** Mainnet restarted and returned to BPoS; bridge/ESC/EID and exchange disposition still wait on official clearance.
- **Sensitive omission.** Settlement offers, full CVE-style catalogues, and LE tactical documents stay out of this public weekly (same discipline as #30).

## 20. Off-Repo Context

- **Mainchain recovery coordination** — rewind applied, PoW restart, BPoS at 2,261,186; honest log + live scan are the public status surface.
- **InterServer DAO node** — follow official `node.sh` / binary instructions; do not freestyle mixed consensus.
- **ElastOS Runtime v0.6** — on `main` (§3); GitHub Release/tag publish remaining.
- **Hyper / hey-engine** — §15.
- Reserved for founder/partner notes and the Release-URL amend when the tag lands.

---

### Quick fact card

| Fact | Value |
|---|---|
| ELA recovery tags | v1.0.0 / v1.0.1 / **v1.0.2** (live) |
| Node operator releases | v1.2.0 · v1.2.2 |
| Rewind / restart / BPoS | **2,260,450** → **2,260,451** → BPoS **2,261,186** |
| Fix inventory | **87** (32 live · 4 pending scan · 2 @ 2,265,000 · 48 testnet · 1 by design) |
| Live scan (band → 2,261,533) | **0** violations · **824.200905** ELA minted exact |
| Chain tip (Aug 1) | **~2,262,448** (public RPC) |
| Runtime v0.6 | **On `main`** (`51e37bd`) · Browser preview · `elastos:bus@v1` · Release tag pending |
| Strategic move | **PC2 + chain + Carrier + Runtime → one ElastOS** |
| Labs | Provenance · v1-rest **1.13.1** · drm-api **0.11.0** · web **4.5.0** |
| Infra | www VM **e2-medium** (2 vCPU / 4 GB) |
| Hyper lane | **22+8** / **132+7** · in sync + follow-up |
| Pending | Gate **2,265,000** · 4 live-scan tx classes · **GitHub Release `v0.6.0`** |

---

*Cadence: weekly updates. Previous report — [Week of July 17 – July 24, 2026 (#30)](https://github.com/Elacity/pc2.net/discussions/30). Published Aug 1: Runtime **v0.6 on `main`**, marketplace close-out, Hyper, ELA tip refresh. Optional amend when GitHub **Release/tag `v0.6.0`** publishes (not live at publish time).*
