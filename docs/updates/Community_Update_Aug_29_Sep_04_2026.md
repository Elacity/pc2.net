Elacity Labs — Weekly Team Update for the World Computer Initiative (WCI)

**August 29 – September 4, 2026**

**ElastOS Runtime [v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0) tagged on `main` this window** (1 September · tip `8ac18bec`). The line did not stop: **0.7.1** is already in review — two-Runtime protected-content proof, installed custody provisioning, Home Agent as its own capsule, first-run empty desktop. **ESC and EID resumed 1 September**; cross-chain transfers with the main chain are open again ([official announcement](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/)). Marketplace cut **elacity-web 4.6.7** (live on base.ela.city 4 September). Hyper/Hey kept the mesh week going. **Halborn** Secure Code Review of mainchain **v1.0.3** is still underway. Operator toolkit **Elastos.Node v1.2.4**. PC2 product-quiet. ELA tip ~**2,289,048**.

**Chain status:** mainchain producing under BPoS. ESC and EID are producing again; main ↔ ESC / EID transfers are open. **PG / PGP cross-chain ELA stays disabled.** Halborn’s independent review of pending **v1.0.3** continues (Elastos.ELA only this round). **ela.city purchase, subscribe, and mint flows remain paused** pending a marketplace security follow-up — the sidechain resume is not a storefront reopen. Exchanges that froze ESC / EID deposits should contact the Elastos DAO before reopening. [Sidechains resume](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem](https://blog.elastos.net/announcement/main-chain-postmortem-august/).

> **Runtime [v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0) released** · **0.7.1** in flight · ESC/EID **resumed** · marketplace **4.6.7** · Hyper/Hey mesh · **Halborn underway** · storefront **paused** · PC2 quiet.

---

## Key Links This Week

- **Previous report** — [Week of August 22 – August 28, 2026 (#35)](https://github.com/Elacity/pc2.net/discussions/35)
- **This discussion** — [#36](https://github.com/Elacity/pc2.net/discussions/36)
- **Elastos status** — [Sidechains resume (1 Sep)](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/) · [honest recovery log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md)
- **Runtime** — [Elacity/elastos-runtime](https://github.com/Elacity/elastos-runtime) · **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)** · **[#38](https://github.com/Elacity/elastos-runtime/pull/38)** / **[#39](https://github.com/Elacity/elastos-runtime/pull/39)** merged · 0.7.1 **[#51](https://github.com/Elacity/elastos-runtime/pull/51)** · Home Agent **[#55](https://github.com/Elacity/elastos-runtime/pull/55)** · Home URUX **[#54](https://github.com/Elacity/elastos-runtime/pull/54)** · custody provisioning **[#52](https://github.com/Elacity/elastos-runtime/pull/52)**
- **Marketplace** — elacity-web **4.6.7** · drm-api **0.13.2** (no new API tag this window)
- **Install (PC2 node)** — `bash <(curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/update.sh)`
- **Install (Runtime)** — `curl -fsSL https://elastos.elacitylabs.com/install.sh | bash`
- **Live surfaces** — map.ela.city · portal.ela.city · base.ela.city · blockchain.elastos.io · elacitylabs.com · elacitylabs.com/provenance

## Table of Contents

1. The Big Picture — v0.7.0 Shipped, 0.7.1 In Flight, Sidechains Resumed
2. Elastos Status — ESC / EID Open, PG Closed, Halborn Underway
3. Runtime v0.7.0 — Tag, Merge, Release Matrix
4. Protected Content — Two-Runtime Journey, Installed Custody
5. Home Agent Capsule — Shelf Becomes the Composer
6. Home / Shell URUX — First-Run, Apps Face, Dock, Lock
7. Assistant, Documents, Library, Inbox
8. Marketplace — elacity-web 4.6.7
9. Hyper / Hey — Mesh Week Continues
10. Essentials, Explorer, DAO
11. PC2 — Quiet by Design
12. Release Engineering
13. Convergence Lens
14. Looking Ahead
15. Summary Statistics
16. Notes

---

## 1. The Big Picture — v0.7.0 Shipped, 0.7.1 In Flight, Sidechains Resumed

Two public doors moved this cycle: the Runtime release, and the sidechains.

**Runtime.** [#35](https://github.com/Elacity/pc2.net/discussions/35) framed **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)** as the foundation for **ElastOS v2**. This window is when that tag actually landed: **[#38](https://github.com/Elacity/elastos-runtime/pull/38)** merged to `main` 31 August; the GitHub Release went up 1 September on tip `8ac18bec`. **[#39](https://github.com/Elacity/elastos-runtime/pull/39)** merged the same day onto `upstream/0.7-dev`. Then the line opened **0.7.1** — **[#51](https://github.com/Elacity/elastos-runtime/pull/51)** is the follow-up release PR. See §3–§7.

**Protected content left the contract stack and ran across two Runtimes.** Import, buy, open, and publish of portable / chain-bound custody listings landed. Custody startup moved onto declared installed provisioning instead of ad-hoc setup. See §4.

**Home grew an Agent seam.** The Shelf is a live composer that opens Agent Space. The harness is its own capsule on the typed model contract that shipped in 0.7 — same install and gate shape as every other Runtime capsule. First-run now seeds an empty desktop and pins Marketplace. See §5–§6.

**Chain doors.** Official 1 September: ESC and EID are producing; main ↔ sidechain transfers are open. PG cross-chain ELA stays off. Halborn continues on mainchain **v1.0.3**. The ela.city storefront is a separate door — purchase / subscribe / mint stay paused. See §2.

**Marketplace kept shipping.** elacity-web **4.6.7** is live: atomic batching, faster reads, post-tx freshness, earnings and sidebar honesty. drm-api stayed on **0.13.2**. See §8.

**Hyper / Hey** did not quiet down after last week’s mesh push — frost UI, delivered ticks, Hardware ELA on its own stack, Home deep links, talking-head and relay work. Source and sideload; no store tag. See §9.

**PC2 stayed quiet on product** and let Runtime and the chain carry the cycle. See §11.

## 2. Elastos Status — ESC / EID Open, PG Closed, Halborn Underway

*Public framing only. Finding registers, live-defect recipes, and unpublished recovery trees stay inside the recovery engagement — same discipline as [#32](https://github.com/Elacity/pc2.net/discussions/32)–[#35](https://github.com/Elacity/pc2.net/discussions/35).*

### What is open vs shut

| Surface | Status |
|---|---|
| **Mainchain** | Online under BPoS · tip ~**2,289,048** · still being hardened |
| **Pending mainchain review** | **Halborn** Secure Code Review of **v1.0.3** — started 28 August · report targeted early October · Elastos.ELA only this round |
| **ESC / EID** | **Resumed 1 September** — producing blocks |
| **Main ↔ ESC / EID** | **Open** — deposits checked against the main-chain record before credit |
| **PG / PGP ↔ main** | **Disabled** — do not submit cross-chain ELA on PG |
| **ela.city storefront** | **Purchase / subscribe / mint paused** — not a storefront reopen |
| **Exchanges / custodians** | Contact the Elastos DAO before reopening ESC / EID deposits or withdrawals |
| **CRC Incident Recovery (KuCoin flow)** | **Complete** — if you were affected and have not heard from KuCoin, contact their support. Separate exchange follow-up remains in proper channels. |

Long form: [Sidechains resume (1 Sep)](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/) · [honest recovery log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md).

### What the 1 September announcement said

ESC and EID were paused after the July incidents while the full sidechain stack was reviewed. The official notice records that the coordinated Council node switch completed without interruption, that more than 200 corrections are now active, and that the updated sidechain source is **not** being published at this time. Ordinary ELA holders do not need to take any action. Continuous monitoring is on.

**PG** continues for activity that stays on PG. Cross-chain ELA involving PGP remains disabled until that separate team completes its own review and reports to the Elastos DAO.

**Reserve (from the official table).** The July 13 created amount (~6.03 million ELA on ESC) is fully accounted for: burns on ESC and from ShadowTokens bridge contracts, plus residual backing recovered. Separately, ~**1.58 million ELA** connected to that incident remains frozen on the main chain and will be credited to the ESC reserve; that credit will be published with its on-chain record. Frozen July 13 accounts stay frozen. July 20 exchange reconciliation remains in proper channels.

### External audit (community-safe)

Halborn’s Secure Code Review of pending mainchain **v1.0.3** is still underway. Scope this round is **Elastos.ELA only**. We will post again when there is a public certificate to point to.

### Operator toolkit

**[Elastos.Node v1.2.4](https://github.com/elastos/Elastos.Node/releases/tag/v1.2.4)** published 31 August — the public toolkit that rides with the resume. Do not treat a toolkit bump as a consumer wallet release.

### Private trees

Public GitHub for ESC / EID / Arbiter did not reopen. A small private follow-through landed around the resume line (high-level process counts only). Nothing from those trees is a public source drop.

### Storefront pause

ela.city purchase, subscribe, and mint stay **paused** while a marketplace security follow-up completes. That is independent of ESC producing blocks. Do not send funds into those flows until we say they are open. Browse and existing holdings are a different question than opening a new purchase.

## 3. Runtime v0.7.0 — Tag, Merge, Release Matrix

**Release:** [v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0) · 1 September 2026 · `main` `8ac18bec`.

What 0.7 contains was the [#35](https://github.com/Elacity/pc2.net/discussions/35) body — protected-content foundation, collaboration, Home/platform, Wallet, Assistant / model-provider, Library / Marketplace / player UIUX, GBA, receipted source-home install. This cycle is the tag plus the CI that made the tag honest:

- **[#38](https://github.com/Elacity/elastos-runtime/pull/38)** merged `upstream/0.7-dev` → `main` (31 Aug) — the eight stacked contract PRs (**#29–#36**).
- **[#39](https://github.com/Elacity/elastos-runtime/pull/39)** merged onto `upstream/0.7-dev` the same day (UI/UX reconstruction, archive-manager, assistant workspace, Home menu protocol).
- **[#27](https://github.com/Elacity/elastos-runtime/pull/27)** closed with the collaboration line on `main`.
- Pre-tag matrix: source-home jobs green on Linux artifact gates and macOS kubo; candidate gates hold on cold caches and lived-in Macs; wallet-provider version pin; capsule-build cache; absolute free-space gate.

This is the Runtime line we take into **ElastOS v2**. 0.7.1 is the follow-up, not a replacement story.

## 4. Protected Content — Two-Runtime Journey, Installed Custody

The 0.7 contract stack defined the shape. This cycle proved a path and started installing it.

**End-to-end proof.** Two Runtimes, custody handed off between them: mint → grant → reconstruct → play on the receiving side. That is the first reviewed test that exercises the full contract stack across a process boundary. The proof is recorded in the reviewed doc set, not only in CI logs.

**Portable / imported listings.** Runtime can ingest chain-bound custody listings it did not originate, open them, and transact against the imported half. It can also publish portable listings another Runtime can import. Buyer-side rights authentication closed a gap on the cross-Runtime buy. A lost mint-completion marker now adopts the finished work instead of re-minting (**[#43](https://github.com/Elacity/elastos-runtime/pull/43)**).

**Installed provisioning.** Custody and chain prerequisites are declared up front as installed provider dependencies, with a verification path on that same provider — not an ad-hoc setup script. **[#52](https://github.com/Elacity/elastos-runtime/pull/52)** is the 0.7.1 review surface. A three-node custody harness and an installed e2e proof driver (fail-closed receipts, CI smoke) are on the 0.7.1 line; that is how the next release gate will be asked to believe the journey, not a laptop demo.

This is still **engineering on the 0.7.1 candidate**, not a consumer “mint → buy → play from the storefront” claim. The storefront pause in §2 is a separate door.

## 5. Home Agent Capsule — Shelf Becomes the Composer

[#35](https://github.com/Elacity/pc2.net/discussions/35) said Assistant grew a real substrate. This cycle Home hosts an agent on that substrate, as a capsule.

- **Shelf → composer.** The Shelf is a live text surface; send opens Agent Space rather than a modal. **[#55](https://github.com/Elacity/elastos-runtime/pull/55)** is the review PR.
- **Harness-as-capsule.** Agent code no longer lives inside Home. It is a capsule Home hands off to — own upgrade cadence, own authority boundary, own workspace object and model attribution.
- **Capsule gate.** If the seam regresses to “Home calls agent code directly,” the test fails. Handoffs bind to Home authority, not a raw process token.

The next agent that runs inside Home should look, install, and gate the same way. That is the ElastOS v2 assistant surface shape — not a shipped consumer assistant product.

## 6. Home / Shell URUX — First-Run, Apps Face, Dock, Lock

**[#54](https://github.com/Elacity/elastos-runtime/pull/54)** is the 0.7.1 Home review surface.

- **First-run** seeds an empty desktop and pins Marketplace. The first click is a decision about what to install, not a cleanup of default icons. Placement respects Recovery Kit readiness (the #35 rule: Recovery before first Profile).
- **Apps face** sits at dock width with a shared motion vocabulary: eased pill width, height-led reveal, live reorder. The dock row stays on the floor; planted icons are not covered twice.
- **Lock face** — wordmark, full-bleed ground, large clock — on the authority-safe path from #35. Shell recovery binds to host authority; verified providers seed into the managed Runtime.
- **home-cli** binds gateway-owned shells to admitted Home authority and hands Inbox requests to Desktop without a guessed path.

The privacy-reviewed Home journey workbook is published in the Runtime docs.

## 7. Assistant, Documents, Library, Inbox

**Model / providers.** The model contract now distinguishes returning a response from executing an agent action — the seam Home Agent sits on. Inference placement (native / remote / delegated) is a written delivery plan. Managed providers resolve from the installed bin. Service capsules carry their own Marketplace icons. Provider catalog metadata travels with the package.

**Documents.** Close requires save or discard. Markdown preview keeps progressing on long files. Unified-sidebar layout.

**Library.** New document no longer clobbers an existing file. New / Upload moved into the toolbar menu. Shortcuts scoped to the content surface; Properties readable across themes.

**Inbox / chrome.** Request rows hug content. Unified-sidebar overlay cleared across Documents, Inbox, and Chat Room. Search, help, and status surfaces restored on Home.

**Security / hygiene (small footprint).** VM provider diagnostic payloads are redacted before they can be logged or shown. Per-user stream socket roots are protected against cross-user access. Carrier dial details stay in private diagnostics. Failed install stages no longer accumulate; backup retention is bounded.

## 8. Marketplace — elacity-web 4.6.7

**Shipped:** elacity-web **4.6.7** live on base.ela.city **4 September** (~27 commits in the window). drm-api **0.13.2** — no new API tag this cycle.

What 4.6.7 is for operators and users on the **browse / wallet** surfaces (not a purchase reopen):

- **EIP-5792** atomic batching with simulation preflight, plus exact-amount approvals on the remaining sequential path.
- **Alchemy** as the baked read provider — fewer public-RPC misses on grids and balances.
- **Post-transaction freshness** closed on the remaining medium/low gaps so the UI stops lying after a write.
- **Earnings / sidebar:** phantom reward rows swept against chain on load; unclaimed totals from a cheap aggregate, not fat item lists; channel badges and subscription expiry on the name line; notification badge no longer inflated by stale earnings snapshots.
- **View chrome:** null-item transform guard, channel avatar fallback, IPFS double-stack salvage.

This is storefront hygiene on a **paused purchase path**. Soak 4.6.7; do not treat it as “buy is back.”

## 9. Hyper / Hey — Mesh Week Continues

**Shipped in source / sideload — not a store launch, no GitHub Release tag.** **~50** Hyper commits and **~79** Hey-engine commits in the window. Dependabot noise is open and not the story.

- **Chat face:** Frost wallpaper and incoming bubbles so text stays readable; quote-in-composer; delivered ticks that wait for ingest, not a stream ACK; mute stays in the thread; attachment percent that actually grows.
- **Start / identity:** Sign up, Recovery, and More on start; App lock when the phone already has a PIN or biometric; Hardware ELA and Ledger on their own wallet stack, not mixed with the 12-word pile.
- **Calls / video:** Incoming CallStyle while Hyper is open; talking-head encode that climbs with the hop; cell caps so LTE is not asked for desktop bitrate; 1:1 video ends when the link drops instead of freezing a last frame.
- **Mesh:** Force-relay still honoured after restart; leftover dests cannot steal identity-dial from a live hop; Home launch tokens (`hyper:home:`) so a phone can link to one Home node without cloning a DID.
- **Desktop / Play:** Play-shaped listing copy exists in tree; sideload still carries the full mesh. Not a store claim this week.

## 10. Essentials, Explorer, DAO

**Essentials overhaul — still local, not a store release.** Navigation, settings, identity, accessibility, and Reduce Motion work continued on the uncommitted overhaul. Four-language and light/dark checks in simulators. Independent custody review still sits in front of production changes. Nothing new is claimed shipped.

**Main Chain Explorer.** A maintenance release is live on [blockchain.elastos.io](https://blockchain.elastos.io/). Data-integrity and reporting fixes (reorg history, election tallies, address direction, exports, health). The July 2026 historical archive was left unchanged.

**Elastos DAO website.** Overhaul work started this window. No public launch claim.

## 11. PC2 — Quiet by Design

`pc2.net` `main` this window — **eight** commits, all `docs(updates)` editorial polish on Weekly #35. **Zero** product commits, no PRs, no release. Operator line remains **v1.4.0**.

Convergence holds: PC2 consumes Runtime’s finished contracts. Those contracts are now tagged **v0.7.0**; 0.7.1 is the next reviewed slice. First seams remain the dDRM viewer path and marketplace buy/trade against Wallet-signed rights — after the storefront door is actually open.

## 12. Release Engineering

| Item | Status |
|---|---|
| Runtime `main` | **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)** · tip `8ac18bec` (1 Sep) |
| Runtime 0.7.1 | **[#51](https://github.com/Elacity/elastos-runtime/pull/51)** open · `upstream/0.7.1-dev` |
| Merged this cycle | **#38** → `main` · **#39** → 0.7-dev · **#27** collaboration · **#43** mint-adopt |
| Active Runtime reviews | 0.7.1 **#51** · Home Agent **#55** · Home URUX **#54** · custody **#52** · dKMS **#15** · gba **#26** · logger **#25** · model **#17** |
| CI | Staged pipeline · shared build artifacts · deterministic test stages · wallet-provider pin |
| Marketplace | web **4.6.7** live · drm **0.13.2** (no new tag) |
| PC2 | No new tags · latest **v1.4.0** · quiet |
| Elastos.Node | **[v1.2.4](https://github.com/elastos/Elastos.Node/releases/tag/v1.2.4)** (31 Aug) |
| Mainchain third-party review | Halborn · v1.0.3 · **underway** |
| ESC / EID | **Resumed 1 Sep** · PG cross-chain **still closed** |
| Storefront | Purchase / mint **paused** |

## 13. Convergence Lens

| Theme | Runtime (this week) | Marketplace / Hyper / PC2 / chain |
|---|---|---|
| Protected-content | Two-Runtime proof · import/buy/open/publish · installed provisioning · **#52** | Storefront purchase **paused** · 4.6.7 browse/wallet hygiene |
| mint → sell → buy → play | Proven on two Runtimes in test · 0.7.1 closeout still open | Not a consumer storefront claim |
| Assistant / Home Agent | Capsule on typed model contract · Shelf composer · **#55** | — |
| Home / lock / first-run | Empty desktop · dock motion · lock face · **#54** | — |
| Model / providers | Responses ≠ agent execution · installed-bin resolution | — |
| Mesh / social | Home launch tokens from Hey | Hyper/Hey: frost, delivered ticks, Hardware ELA, relay (sideload) |
| Chain | — | ESC/EID **resumed** · PG **closed** · Halborn **underway** · Node **v1.2.4** · tip ~2,289,048 |
| PC2 | — | Editorial only · **v1.4.0** |

## 14. Looking Ahead

1. **0.7.1** candidate review closes — **[#51](https://github.com/Elacity/elastos-runtime/pull/51)** plus Home **#54 / #55** and custody **#52**. Full lifecycle (mint → buy → play → closeout) across two Runtimes with installed provisioning is the next check-mark.
2. **ElastOS v2** on the **v0.7.0** foundation — protected-content, Home Agent, Wallet, marketplace path.
3. **Model delivery plan** → shipped provider behaviour (native default, remote fallback, delegated evaluation).
4. **Halborn** — community-safe update when there is a certificate or a scoped public fact.
5. **Storefront** stays paused until the marketplace security follow-up is done. Soak **4.6.7** on browse / wallet.
6. **PG** cross-chain stays closed until that team’s review lands with the DAO.
7. **ESC reserve credit** (~1.58 million ELA from frozen main-chain funds) — publish when the on-chain record exists.
8. **PC2** — quiet unless operator-critical; first reviewed 0.7 piece into the node build when the inventory says so.

## 15. Summary Statistics

**Week of** August 29 – September 4, 2026 (facts through 7 September scan).

Runtime headline totals include two large merges (0.7-dev → `main`, and the protected-content UIUX reconstruction). Non-merge Runtime in the window: **82** commits · **+87,287 / −4,626** · **596** files.

| Repo | Commits | Insertions | Deletions | Files |
|---|---|---|---|---|
| pc2.net | **8** (docs only) | 435 | 116 | 8 |
| elastos-runtime (all-branch) | **87** | 500,279 | 55,084 | 1,987 |
| elacity-web | **27** · shipped **4.6.7** | — | — | live 4 Sep |
| drm-api-layer | **0** this window | — | — | HEAD **0.13.2** |
| Hyper | **~50** | — | — | sideload / source |
| Hey-engine | **~79** | — | — | mesh / DM / Home link |
| ESC / EID / Arbiter (private) | **4 / 4 / 2** | — | — | not public GitHub |
| Elastos.Node | release **v1.2.4** | — | — | public toolkit |

**Runtime authors (non-merge):** Anders Alm **48** · SashaMIT **21** · Irzhy Ranaivoarivony **13**.

**Runtime PRs.** Merged: **#38** → `main`, **#39** → 0.7-dev, **#27**, **#43**. Opened / active 0.7.1: **#51**, **#52**, **#54**, **#55**. Still open from prior: **#15**, **#17**, **#25**, **#26**.

**Releases.** Runtime **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)** (1 Sep). Node **[v1.2.4](https://github.com/elastos/Elastos.Node/releases/tag/v1.2.4)** (31 Aug). Marketplace web **4.6.7**. PC2 still **v1.4.0**.

**People (workstream lens):** Anders Alm — 0.7.1 Home Agent capsule, Shelf composer, URUX, protected-content listings, CI · Irzhy Ranaivoarivony — 0.7.0 tag/CI, installed custody / e2e proof, marketplace security follow-up (operational) · SashaMIT — Weekly #35, marketplace **4.6.7**, Hyper/Hey mesh · Infinity — Essentials local overhaul, explorer maintenance, sidechain resume ops · chain resume / Halborn coordination.

## 16. Notes

- **Chain recovery internals** stay out (registers, recipes, unpublished trees, live council-node detail). The 1 September resume post, Halborn status, KuCoin CRC completion, and the storefront pause are the community-safe facts this week.
- **Marketplace security follow-up** is not a finding dump. Pause is the public fact. Do not treat ESC producing as “buy is open.”
- **Protected-content** is tagged in **v0.7.0** and being proved on **0.7.1**. Not a consumer storefront claim.
- **Home Agent** is the capsule seam, not a shipped consumer assistant.
- **Hyper / Hey** are source + sideload this week, not a store launch.
- **Essentials** remains local; no store claim.
- **PC2** docs-only is by design, not a stall.
- Settlement counterparty detail stays in proper channels.

---

### Quick fact card

| Fact | Value |
|---|---|
| Previous / this | [#35](https://github.com/Elacity/pc2.net/discussions/35) · [#36](https://github.com/Elacity/pc2.net/discussions/36) |
| Runtime | **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0) released** · **0.7.1** in flight |
| Protected-content | Two-Runtime proof · installed provisioning · **#51 / #52** |
| Home Agent | Capsule + Shelf composer · **#55** |
| Home URUX | Empty first-run · dock · lock · **#54** |
| Marketplace | web **4.6.7** · drm **0.13.2** · purchase **paused** |
| Hyper / Hey | Mesh week continued · sideload / source · no tag |
| Halborn | ELA **v1.0.3** · **underway** |
| Mainchain / ESC | Online · ESC/EID **resumed 1 Sep** · PG **closed** · tip ~**2,289,048** |
| Node | **[v1.2.4](https://github.com/elastos/Elastos.Node/releases/tag/v1.2.4)** |
| PC2 | Quiet · **v1.4.0** |

---

*Cadence: weekly updates. Previous report — [Week of August 22 – August 28, 2026 (#35)](https://github.com/Elacity/pc2.net/discussions/35). This report — [#36](https://github.com/Elacity/pc2.net/discussions/36).*
