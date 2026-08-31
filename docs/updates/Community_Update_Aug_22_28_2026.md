Elacity Labs — Weekly Team Update for the World Computer Initiative (WCI)

**August 22 – August 28, 2026**

**Last week’s published source became a reviewable PR train — protected-content as eight stacked contracts, Assistant on a typed model boundary, Home now Recovery-Kit-first — while the marketplace kept shipping and Hyper/Hey woke up after a quiet week.** Coming out of [#34](https://github.com/Elacity/pc2.net/discussions/34): custody / Wallet-signed rights / chain evidence left the document and entered source. This cycle splits that source so reviewers can hold one boundary at a time (**[#29](https://github.com/Elacity/elastos-runtime/pull/29) → [#36](https://github.com/Elacity/elastos-runtime/pull/36)**), merges the collaboration candidate onto the 0.7 line (**[#16](https://github.com/Elacity/elastos-runtime/pull/16)**), and opens the 0.7 umbrella toward `main` (**[#38](https://github.com/Elacity/elastos-runtime/pull/38)**). Marketplace cut **elacity-web 4.6.1 → 4.6.6** and **drm-api 0.13.1**. **Halborn** Secure Code Review of mainchain **v1.0.3** **started 28 August**. ESC / EID / Arbiter / the bridge stay **closed on purpose**. Runtime `main` still quiet; **0.6 tag still pending**. PC2 product-quiet. ELA tip ~**2,284,075**.

**Chain status:** mainchain producing under BPoS and still being hardened. Halborn’s independent review of pending **v1.0.3** is underway (Elastos.ELA only this round). Private ESC / EID / Arbiter fix-and-proof work continues — still not on public GitHub. **Restart is still not cleared.** Do not send funds into paused sidechain or bridge flows. [Mainchain postmortem](https://blog.elastos.net/announcement/main-chain-postmortem-august/).

> Protected-content PR train **#29 → #36** · 0.7 umbrella **#38** · Recovery Kit before first Profile · marketplace **4.6.6** / drm **0.13.1** · Hyper/Hey mesh week · **Halborn underway** · ESC/EID **still closed** · Runtime **0.6 tag pending** · PC2 quiet.

---

## Key Links This Week

- **Previous report** — [Week of August 15 – August 21, 2026 (#34)](https://github.com/Elacity/pc2.net/discussions/34)
- **This discussion** — [#35](https://github.com/Elacity/pc2.net/discussions/35)
- **Elastos status** — [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/) · [honest recovery log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md)
- **Runtime** — [Elacity/elastos-runtime](https://github.com/Elacity/elastos-runtime) · stacked **[#29](https://github.com/Elacity/elastos-runtime/pull/29)–[#36](https://github.com/Elacity/elastos-runtime/pull/36)** · 0.7 umbrella **[#38](https://github.com/Elacity/elastos-runtime/pull/38)** · UI reconstruction **[#39](https://github.com/Elacity/elastos-runtime/pull/39)** · Home **[#23](https://github.com/Elacity/elastos-runtime/pull/23)** · logger **[#25](https://github.com/Elacity/elastos-runtime/pull/25)** · GitHub Release still **[v0.4.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.4.0)**
- **Marketplace** — elacity-web **4.6.6** · drm-api **0.13.1**
- **Install (PC2 node)** — `bash <(curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/update.sh)`
- **Install (Runtime)** — `curl -fsSL https://elastos.elacitylabs.com/install.sh | bash`
- **Live surfaces** — map.ela.city · portal.ela.city · elacitylabs.com · elacitylabs.com/provenance

## Table of Contents

1. The Big Picture — Contracts Turn Into a Reviewable Stack
2. Elastos Status — Halborn Underway, Sidechains Still Closed
3. Runtime — Protected-Content PR Train (#29 → #36) and the 0.7 Umbrella
4. Runtime — Assistant + Model Provider Substrate
5. Runtime — elastos-logger, Home, and Reviewed UIUX
6. Runtime — Capsules, Collaboration Hygiene, CI
7. Marketplace — elacity-web 4.6.6, drm-api 0.13.1, Edge
8. Hyper / Hey — Mesh Week After Quiet
9. Essentials Overhaul — Still Local (Not Shipped)
10. PC2 — Quiet by Design
11. Release Engineering
12. Convergence Lens
13. Looking Ahead
14. Summary Statistics
15. Notes

---

## 1. The Big Picture — Contracts Turn Into a Reviewable Stack

#34 said the freeze contracts had entered published source. This cycle splits that source into a reviewable PR train — and layers a second stack (Assistant + typed model provider) on top of it. The storefront kept moving. Hyper/Hey, quiet last window, shipped a real mesh week.

**Zeroth — chain doors.** Mainchain is live. ESC, EID, Arbiter, and the bridge stay closed. Halborn opened the independent review of **v1.0.3** on **28 August**. That is not a reopen, and it is not “trust us.” See §2.

**First — the protected-content stack is now eight stacked PRs**, then an umbrella. **#29** canonical content identities and rights grants; **#30** threshold custody envelopes + key reconstruction; **#31** bridge-authenticated release reconstruction; **#32** custody provider protocol and process; **#33** Wallet-signed rights requests; **#34** Runtime release authority + persisted state; **#35** chain rights evidence + typed decisions; **#36** runtime lifecycle — mint, buy, play, purchase closeout. Each is one contract. Reviewers can hold one boundary at a time. Collaboration candidate **#16** merged onto `upstream/0.7-dev`. **#38** proposes that 0.7 line for `main`. **#39** sits on top: Archive / Assistant workspace / Home menu, plus more source-line Library/marketplace work and a two-Runtime proof — still **not** an installed journey. See §3.

**Second — Assistant grew a real substrate.** Typed model boundary, private workspace persistence, Chat and Build workflows, offer-driven Studio runs, safe markdown + math rendering. Model side: provider coordinator, bounded adapters, durable offer/run state, verified native provider execution. Legacy AI provider paths were retired, not deprecated in place. See §4.

**Third — Home became authority-conscious, and the shell family got its reviewed UIUX pass.** Recovery Kit is now required before first Profile (last cycle it was skippable). Authority-safe lock face, canonical window chrome, Sign Out gated on signed authority. Assistant, Browser, Chat, Documents, Inbox, Library, Marketplace, People, Services, System, Wallet, Wallet-Connectors, Archive, GBA — one shared token vocabulary. See §5.

**Fourth — marketplace kept shipping.** elacity-web **4.6.6**: Home/Explore cards stop asking the chain for every listing; grids use stored prices and slim documents; Flint stills when media is missing; shops-list density. drm-api **0.13.1**: poster stills from the token image CID, not the media file; cheap-grid fetch. Edge: HTTP/2 + gzip + immutable `/assets/` on base.ela.city. See §7.

**Fifth — Hyper / Hey after a quiet week.** Desktop (Skia `hyper-desktop`) landed in the Hyper repo, plus Android CI and a Mac DMG packager. Android: group member cards, workspaces vs private groups, force-relay for hide-IP contacts, talking-head video adapt, a signed-APK workflow so sideloads can replace earlier builds. Engine: sealed 1:1 DMs, unpublished media that stays unpublished across restart, radio self-heal that does not remesh every few seconds. Android CI is green; desktop CI is still red on HEAD. No GitHub Release tag — source and sideload, not a store launch. See §8.

**Also:** browser-local-exit orphan reap **[#24](https://github.com/Elacity/elastos-runtime/pull/24)** merged. Source-home CI matrix now emits a proof artifact. WSL-first Windows strategy is a written doc. `elastos-logger` went from PoC to a crate with a tracing migration. PC2 shipped zero product commits — quiet by design.

## 2. Elastos Status — Halborn Underway, Sidechains Still Closed

*Public framing only. Finding registers, live-defect recipes, and unpublished recovery trees stay inside the recovery engagement — same discipline as [#32](https://github.com/Elacity/pc2.net/discussions/32)–[#34](https://github.com/Elacity/pc2.net/discussions/34).*

### What is open vs shut

| Surface | Status |
|---|---|
| **Mainchain** | Online under BPoS · tip ~**2,284,075** · still being hardened |
| **Pending mainchain review** | **Halborn** Secure Code Review of **v1.0.3** — **started 28 August** · report targeted early October · Elastos.ELA only this round |
| **ESC / EID / Arbiter / bridge** | **Closed** — **not ready to restart** |
| **Bridge / paused sidechain deposits** | Do not send funds until official reopen |
| **CRC Incident Recovery (KuCoin flow)** | **Complete** — coordinated make-whole processed and confirmed received. If you were affected and have not heard from KuCoin, contact their support with your case details. Separate exchange follow-up remains in proper channels. |

Long form: [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/) · [honest recovery log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md).

### External audit (community-safe)

Halborn started the independent Secure Code Review of the pending mainchain release (**v1.0.3**) on **28 August**. Scope this round is **Elastos.ELA only**: post-incident hardening (consensus and merged-mining, reorg and mode transitions, P2P/RPC resilience, activation and mixed-fleet checks), static review plus dynamic testing against a running node where required. SPV, Arbiter, and sidechains are **not** in this pass. We will post again when there is a public certificate to point to; do not expect a running feed of engagement detail before the report lands.

### Layers

Mainchain remains live. ESC, EID, and the Arbiter bridge remain offline **on purpose**. Public GitHub for those trees did not move this week — recovery work stays on the private org until it is safe to publish. Operator toolkit remains **Elastos.Node v1.2.3**. Mainchain private tree was quiet this window (Halborn is reviewing the pending **v1.0.3** line).

### Private ESC / EID / Arbiter prep (high level)

The private fix-and-proof cycle continued. Roughly **159** commits landed on the private trees this window (ESC **59**, EID **59**, Arbiter **41**) — release stamps, rehearsal/test integrity, and follow-through on last week’s audit line. **Nothing from that cycle is on public GitHub.** Restart is **still not cleared**; remaining blockers are operational (rehearsal completion, soak, fleet readiness), not “code is done so we turn it on.”

Adversarial review continues to reject proposed fixes that are worse than the defects they address. That is the bar. We will announce reopen — we will not surprise people into a half-open bridge.

## 3. Runtime — Protected-Content PR Train (#29 → #36) and the 0.7 Umbrella

Last week’s source became this week’s PRs. Each PR carries one contract so reviewers can hold one boundary.

### The stack

| PR | Contract |
|---|---|
| **[#29](https://github.com/Elacity/elastos-runtime/pull/29)** | Canonical content identities, rights grants, release contracts |
| **[#30](https://github.com/Elacity/elastos-runtime/pull/30)** | Threshold custody envelopes + key reconstruction |
| **[#31](https://github.com/Elacity/elastos-runtime/pull/31)** | Bridge-authenticated release reconstruction |
| **[#32](https://github.com/Elacity/elastos-runtime/pull/32)** | Custody provider protocol and process |
| **[#33](https://github.com/Elacity/elastos-runtime/pull/33)** | Sign rights requests with Wallet |
| **[#34](https://github.com/Elacity/elastos-runtime/pull/34)** | Runtime release authority + persisted state |
| **[#35](https://github.com/Elacity/elastos-runtime/pull/35)** | Chain rights evidence + typed decisions |
| **[#36](https://github.com/Elacity/elastos-runtime/pull/36)** | Runtime lifecycle — mint, buy, play, purchase closeout |

**[#16](https://github.com/Elacity/elastos-runtime/pull/16)** (collaboration candidate, including last week’s system map and **[#24](https://github.com/Elacity/elastos-runtime/pull/24)** orphan reap) **merged** into `upstream/0.7-dev` on 28 August.

**[#38](https://github.com/Elacity/elastos-runtime/pull/38)** — *ElastOS 0.7: protected-content foundation, collaboration, and runtime lifecycle* — is the umbrella: `upstream/0.7-dev` proposed for `main`. Merging is the chain owner’s decision. It exists so the remaining 0.7 work is visible in one place. It is **not** a tag and **not** a consumer launch.

**[#39](https://github.com/Elacity/elastos-runtime/pull/39)** sits on that line (opened 29 August, 112 commits ahead of `upstream/0.7-dev` at publish): Archive Manager onto shared house chrome, Assistant workspace capsule, Home menu protocol — and, after the Friday draft cutoff, more **source-line** Library video prepare/play, marketplace browse/buy, private decrypt-provider registration, and a documented two-Runtime custody proof. That branch is **open, not merged, not tagged**. It does not make mint → buy → play an installed product.

### What the branch tips actually did

- **Inactive product path stitched end-to-end** — Runtime integrates inactive providers; protected-content coordinates inactive mint and playback; custody composition is validated. Inactive = wired but not user-facing. Remaining gates are written down, not skipped.
- **Content identity + durable mint** bound to durability. Rights policy resolved from chain config. Chain rights evidence bound to approved contract, method, transaction, and finalized block.
- **Verified market authority** gates protect + decrypt. Custody sealed only for verified releases. Statement signatures verified strictly — no soft mode.
- **Threshold reconstruction** bound to the exact request. Unbound content-access ids classified rather than accepted.
- **Custody-provider hardening** — loop exits on transport read errors; IPFS path validation canonicalizes allowed roots; missing provider registry treated as unconfigured.

### Honest limits (unchanged in kind)

The stack is now reviewable; it is **still not** an installed mint → buy → open → play journey. Reconstruction still needs to move behind a private decrypt-provider boundary before the product path activates. Cutover is written as one atomic step — no parallel decoders. Treat **#38** as the review surface for that remaining work, not as “0.7 shipped.”

## 4. Runtime — Assistant + Model Provider Substrate

Assistant is no longer a thin wrapper on an external AI SDK. It has typed contracts on both sides of the Runtime boundary and durable state that survives restarts.

**Assistant surface.** Chat and Build workflows; private workspace persisted; typed model boundary. Offer-driven Studio runs; copy transcript through Home; safe markdown + math rendering (largest single non-merge landing this week). Object-studio outputs rejected in Assistant. Access bound to exact runs.

**Model boundary.** Offer and run contracts; bounded backend adapters; strict stdio process; durable offer/run state and run journal; provider coordinator. Runtime registers a verified model provider, authorizes typed model resources, loads private provider config, and requires verified native provider startup. Legacy AI provider paths were **retired** (`−4,248` in that refactor) — gone, not deprecated in place.

**PR anchor.** **[#17](https://github.com/Elacity/elastos-runtime/pull/17)** remains the review path for the model side; this week it grew a Runtime-side coordination story.

**Honest limits.** Wired on the collaboration / 0.7 line — **pre-release engineering**, not a consumer launch. No external-provider credentials or private-provider secrets travel through Home or Runtime durable state.

## 5. Runtime — elastos-logger, Home, and Reviewed UIUX

### Logger (PR #25)

The logger crate stopped being a PoC. Per-component ring files, per-record component override, `component!` modules, server bootstrap with `ELASTOS_LOG` root, and a coordinated tracing → logger migration across server and library crates. VM provider payloads no longer leak into logs. Developer guides updated. **[#25](https://github.com/Elacity/elastos-runtime/pull/25)** is the extraction path from the dKMS/ESP branch.

### Home (PR #23 still the review path)

Recovery Kit is now **required** before first Profile — last cycle’s Profile-first welcome made Recovery skippable; that is closed. Authority-safe lock face; canonical window chrome modes; object-first desktop defaults; Home-owned Trash; Runtime-owned appearance preferences; mobile Control Centre. Sign Out gated on signed authority. Connector ceremony stays on its authorized sheet. Canonical DID key authority enforced.

### Reviewed UIUX (~15 apps + platform)

The `feat/0.7-uiux-candidate` line landed a coordinated pass: Assistant, Browser, Chat, Documents, GBA, Inbox, Library, Marketplace, People, Services, System, Wallet, Wallet-Connectors, Archive. Wallet-family apps vendor shared UI tokens; capsules carry their own icons; first-party apps align with Home chrome. This is on the candidate — **not tagged into a release**.

## 6. Runtime — Capsules, Collaboration Hygiene, CI

**Content capsules.** gba-nonogram and licensed Nonogram Advance on the 0.7 line. **[#26](https://github.com/Elacity/elastos-runtime/pull/26)**.

**Collaboration.** Bootstrap peers pinned by canonical DID. Deterministic product acceptance test added. **[#27](https://github.com/Elacity/elastos-runtime/pull/27)** + **[#28](https://github.com/Elacity/elastos-runtime/pull/28)** remain the two-PR collaboration stack onto `main` / foundation. **[#24](https://github.com/Elacity/elastos-runtime/pull/24)** (browser-local-exit orphan reap) **merged** into the collaboration candidate — a real orphan under crash-restart.

**CI / Windows.** Source-home matrix now emits a first-class proof artifact, not just a green tick. Home CLI is exercised directly in local carrier smoke. Source-home stays portable across hosts; collaboration mode is explicit. **WSL-first** is the written Windows target; the experimental native Windows source gate stays experimental. **[#19](https://github.com/Elacity/elastos-runtime/pull/19)** is still the matrix review path.

**dKMS / ESP.** **[#15](https://github.com/Elacity/elastos-runtime/pull/15)** remains open as the ESP substrate review; logger extraction toward **#25** is the split we wanted.

## 7. Marketplace — elacity-web 4.6.6, drm-api 0.13.1, Edge

Indexer readiness and storefront shipping — **not** an ESC reopen. The first-pass Runtime-only draft missed this entirely.

### elacity-web — 4.6.1 → 4.6.6

Release train on `release/base-network` after last week’s **4.6.1**:

- Home card stills from poster CIDs, not full IPFS on Latest Media
- Slim `fetchNFTItems` on Home, Explore, and shop grids
- Skip live on-chain listing reads on Home and Explore cards
- Stored card prices; do not fetch every shop plan on the grid
- Shops-list density, Revenue table readability, Flint stills when shop/explore media is missing, `/view` chrome before access

Merged PRs **#47–#51**.

### drm-api-layer — 0.13.0 → 0.13.1

Poster stills written from the token image CID, not the media file. List fetch skips the metadata N+1. Named bump **0.13.1**; follow-on cheap-grid work is on the same line (HEAD package **0.13.2**). `release/next` was not re-bumped this window (still last week’s **0.8.3** align).

### Adjacent infra

| Surface | What |
|---|---|
| **docker-arch** | HTTP/2 + JS gzip + immutable `/assets/` on base.ela.city (**#7**). ipfs.ela.city gateway work closed at the edge of last week |
| **v1 REST** | Quiet this window. **1.13.3** landed just before the Friday cut (non-array `eth_getLogs` + Base 8453 genesis) — treat as the #34/#35 seam, not a new ship this week |
| **events-watcher** | Quiet (batched getLogs holds; tracker-cap PR still open) |
| **LabsWeb** | Quiet (About / Provenance from last week) |

## 8. Hyper / Hey — Mesh Week After Quiet

Last window these two were quiet. This window they were not. Hyper is the Android + desktop client; Hey-engine is the shared Rust core (same engine the Runtime capsules use).

**Shipped in source / sideload — not a store launch, no GitHub Release tag.**

- Skia **hyper-desktop** landed in the Hyper repo (22 August). Desktop + Android CI and a Mac DMG packager (**Hyper #38** merged). Group video grid (**#37**). Android CI green on HEAD; **desktop CI still red**.
- Android product: group member cards, workspaces split from private groups, last-read bars, readable mentions, tap-or-hold message menu, theme-aware chat papers, voice notes restored to match source.
- **Force relay** on contacts so hide-IP peers stay on the relay after restart; Accept no longer auto-pins trust (compared safety number required).
- Talking-head capture locked to conversation grade; pause send on a weak link.
- Signed-APK GitHub Release **workflow** so a future tag can replace earlier sideloads; versionCode bumped so those APKs can replace v6. No tag cut this week.
- Free-only surface: post tips, hop-mail switch, hardware ELA. Paid-unlock work is **not** a consumer claim this week.
- Engine: 1:1 DMs sealed on the live chat mix; unpublished blob hashes persist so a restart cannot resurrect deleted media; radio self-heal naps instead of remeshing every few seconds; extra profiles stay on one hop.

**~42** Hyper commits and **~44** Hey-engine commits in the window. Dependabot noise on Hyper is open and not the story.

## 9. Essentials Overhaul — Still Local (Not Shipped)

No new push on the Essentials GitHub trees this window. The local overhaul from [#34](https://github.com/Elacity/pc2.net/discussions/34) remains **uncommitted** — not a store release. Nothing new is claimed shipped. Independent custody review still sits in front of production changes.

## 10. PC2 — Quiet by Design

`pc2.net` `main` after #34 — **zero** product commits, no PRs, no release. Operator line remains **v1.4.0**.

Convergence holds: PC2 is a consumer of Runtime’s finished contracts. This week those contracts moved from source into a review train and a 0.7 umbrella (§3). PC2 does not open new seams until that train stabilizes. When it opens, first seams are still: dDRM viewer path and marketplace buy/trade against Wallet-signed rights.

## 11. Release Engineering

| Item | Status |
|---|---|
| Runtime `main` | Quiet · tip still `d358ded` (2026-08-01) |
| Runtime GitHub Release **v0.6.0** | **Still pending** (latest **[v0.4.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.4.0)**) |
| Runtime 0.7 line | **[#38](https://github.com/Elacity/elastos-runtime/pull/38)** open `upstream/0.7-dev` → `main` · **not merged** |
| Active Runtime reviews | Protected-content **#29–#36** · umbrella **#38** · UI **#39** · collaboration **#27+#28** · GBA **#26** · logger **#25** · Home **#23** · model-provider **#17** · dKMS/ESP **#15** · CI **#19** |
| Merged this cycle | **#16** collaboration candidate → 0.7-dev · **#24** browser-local-exit orphan reap |
| Closed | **#18** ElastOS picture map |
| Marketplace | web **4.6.6** · drm **0.13.1** |
| PC2 | No new tags · latest **v1.4.0** · quiet |
| Elastos.Node | **v1.2.3** |
| Mainchain third-party review | Halborn · v1.0.3 · **started 28 Aug** |
| ESC / EID / bridge | **Closed** |

## 12. Convergence Lens

| Theme | Runtime (this week) | Marketplace / Hyper / PC2 / chain |
|---|---|---|
| Protected-content | 8-PR stack **#29→#36** · inactive path stitched · **#38** umbrella to `main` | Consumer path future (dDRM viewer, buy/trade against Wallet rights) — PC2 quiet |
| mint → sell → buy → play | Wired **inactive** — not installed | Shared design intent |
| Assistant / model | Typed boundary · durable offer/run · legacy AI retired | — |
| Home / lock / recovery | Recovery-Kit-first · authority-safe lock · canonical chrome | — |
| Reviewed UIUX | ~15 apps + platform on the 0.7 candidate · **#39** on top | Storefront **4.6.6** grid/stills |
| Logger / dKMS | Logger extraction **#25** · **#15** still open | — |
| Mesh / social | — | Hyper/Hey: CI, groups, force-relay, sealed DMs (sideload) |
| Chain | — | Mainchain live · Halborn **underway** · ESC/EID/Arbiter/bridge **closed** · Node **v1.2.3** |
| PC2 | — | Zero product commits · **v1.4.0** |

## 13. Looking Ahead

1. **Halborn** is underway — expect no public running commentary before the report lands. Community-safe update when there is a certificate or a scoped public fact.
2. Land the protected-content stack in order. Reviewers work **#29 → #36** one contract at a time; **#38** is the 0.7 roll-up, not a shortcut around review.
3. Move reconstruction behind the private decrypt-provider boundary before flipping the inactive product path to active. One implementation, atomic.
4. Merge model-provider (**#17**) and logger (**#25**) onto the review base; keep VM-payload redaction as a first-class contract.
5. Home URUX candidacy; keep entropy gates on the CI matrix.
6. Runtime **0.6 tag** — still outstanding; unlock is contingent on the review stack settling and the source-home proof staying green. **#38** is 0.7 toward `main`, not a substitute for the pending 0.6 tag.
7. Windows — WSL-first stays the target; another clean cycle before the experimental native gate matters.
8. Marketplace: soak **4.6.6** / **0.13.1**; events-watcher tracker cap still open.
9. ESC / EID / bridge — finish soak, two-restart + rollback rehearsal, operational fleet checks — **no reopen until the bar is met**; finding registers stay internal.
10. **PC2** — quiet unless operator-critical.

## 14. Summary Statistics

**Week of** August 22 – August 28, 2026 (facts through publish, 31 August).

Runtime volume below is the first-pass dedup (unique SHAs collapsed across the 12-branch protected-content stack). Raw undeduplicated Runtime was 240 commits / +439,929 / −74,930 / 2,773 files — the same logical change on multiple stacked branches.

| Repo | Commits | Insertions | Deletions | Files |
|---|---|---|---|---|
| pc2.net | **0** (product) | 0 | 0 | 0 |
| elastos-runtime (dedup) | **205** | 369,293 | 65,818 | 2,440 |
| elacity-web | shipped **4.6.6** | — | — | PRs #47–#51 |
| drm-api-layer | shipped **0.13.1** | — | — | PRs #20–#21 |
| Hyper | **~42** | — | — | CI + Android/desktop |
| Hey-engine | **~44** | — | — | mesh / DM / radio |
| ESC / EID / Arbiter (private) | **59 / 59 / 41** | — | — | not public GitHub |

**Runtime commit-type histogram (dedup by subject):** feat 116 · fix 45 · docs 32 · merge 17 · test 12 · refactor 9 · chore 6 · style 2 · build 1.

**Runtime PRs.** Opened **#26–#36** in-window, plus **#38** (28 Aug) and **#39** (29 Aug). Merged: **#16** (collaboration → 0.7-dev), **#24** (orphan reap). Closed: **#18**.

**Releases.** No new GitHub tags on Runtime (**v0.4.0** latest) or PC2 (**v1.4.0** latest). Marketplace in-repo bumps as above. Node still **v1.2.3**.

**People (workstream lens):** Anders Alm — protected-content stack, Assistant + model substrate, UIUX rollout, Home authority, Chat + capsules, CI · Irzhy Ranaivoarivony — elastos-logger + tracing migration, custody-provider hardening, stack merges, **#38 / #39** · SashaMIT — Recovery-Kit-first Profile, gba-nonogram capsule, source-home portability, marketplace grid/stills, Hyper CI/DMG · Hyper/Hey mesh (EverlastinOS) · chain recovery / Halborn coordination.

## 15. Notes

- **Chain recovery internals** stay out (registers, recipes, unpublished trees, live council-node detail). Halborn kickoff, KuCoin CRC completion, and private ESC/EID/Arbiter **process** counts are the community-safe facts this week.
- **Protected-content** is a reviewable stack (**#29 → #36**) and a 0.7 umbrella (**#38**), not an installed journey. Wired-inactive ≠ user-facing.
- **Assistant** is pre-release engineering; legacy AI paths are gone; no external-provider secrets travel through Home or Runtime durable state.
- **Reviewed UIUX** landed on the candidate — not tagged into a release.
- **Hyper / Hey** are source + sideload this week, not a store launch.
- **Essentials** remains local; no store claim.
- **PC2** zero-commits is by design, not a stall.
- Settlement counterparty detail stays in proper channels.

---

### Quick fact card

| Fact | Value |
|---|---|
| Previous / this | [#34](https://github.com/Elacity/pc2.net/discussions/34) · [#35](https://github.com/Elacity/pc2.net/discussions/35) |
| Protected-content | PR train **#29 → #36** · umbrella **#38** · UI **#39** |
| Merged | **#16** → 0.7-dev · **#24** orphan reap |
| Assistant | Typed model boundary · durable offer/run · legacy AI retired |
| Home | Recovery Kit before first Profile · authority-safe lock |
| Marketplace | web **4.6.6** · drm **0.13.1** |
| Hyper / Hey | Mesh week · sideload / source · no tag |
| Halborn | ELA **v1.0.3** · **started 28 Aug** |
| Mainchain / ESC | Online · ESC/EID **still closed** · restart not cleared |
| Runtime tag | **0.6 still pending** · `main` tip unchanged since 2026-08-01 |
| PC2 | Quiet · **v1.4.0** |

---

*Cadence: weekly updates. Previous report — [Week of August 15 – August 21, 2026 (#34)](https://github.com/Elacity/pc2.net/discussions/34). This report — [#35](https://github.com/Elacity/pc2.net/discussions/35).*
