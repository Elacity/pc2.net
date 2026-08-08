Elacity Labs — Weekly Team Update for the World Computer Initiative (WCI)

**August 1 – August 7, 2026**

**Not a quiet week — and Runtime was not quiet either once all branches were scanned.** Coming out of [#31](https://github.com/Elacity/pc2.net/discussions/31) (mainnet recovery + Runtime v0.6 on `main`), heat is across the org: **ElacityLabsWeb** shipped a private **CodeRED Intel / ops admin portal** (~42 commits); **Hyper + hey-engine** kept hardening calls, radio, and relay (**6 + 18**); **Elastos.Node v1.2.3** fixed `ela rewound` for post-v1.0.0 recovery builds; **drm-api** surgically backported the Base **0.11** getLogs/CACHER pack to **ESC** (`release/next`, PR #4); security hardening branches on **ddrm-reader**, **events-watcher**, and drm CI. On Runtime, `main` got one VZ TURN-ownership fix; **`experiment/home-studio-h3-dogfood`** (pushed public 8 Aug) carries **~15 home-agent / Sparks H3 dogfood commits** after the weekly cutoff; and team status marks **`feat/dkms-esp-port`** READY-FOR-MANUAL-MERGE against the **0.7-dev roadmap** — content creation/playback ~**75%** functional (custody / protected content / commerce rails), conversation-plane ESP facts/verbs still owed with the rest of shell. **PC2** stayed product-quiet (docs publish only). Formal Runtime **v0.6.0 GitHub Release/tag** still outstanding. ELA tip ~**2,267,480** — past gate two (**2,265,000**).

**Community status (8 Aug):** mainchain is producing blocks again under BPoS and still being hardened. **ESC / EID / Arbiter / bridge remain closed on purpose** — different risk profile, automatic paths on careless restart, unfinished repair and rehearsal. Do not send funds into paused sidechain or bridge flows until official reopen. Details below and in the [mainchain postmortem](https://blog.elastos.net/announcement/main-chain-postmortem-august/).

> Mainchain online · ESC/bridge **still closed** · Runtime **home-agent / Sparks H3 dogfood** · **dkms-esp-port** READY-FOR-MANUAL-MERGE (content rails ~75%) · CodeRED Intel / ops admin · Hyper + hey-engine · Node **v1.2.3** · drm-api **0.11 → ESC** · PC2 quiet · ELA tip past **2,265,000** · Runtime **0.6 tag still pending**.

---

## Key Links This Week

- **Previous report** — [Week of July 24 – July 31, 2026 (#31)](https://github.com/Elacity/pc2.net/discussions/31)
- **This discussion** — [#32](https://github.com/Elacity/pc2.net/discussions/32)
- **Elastos status** — [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/) · [honest recovery log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md)
- **Ecosystem** — [elastos/Elastos.Node](https://github.com/elastos/Elastos.Node) release **[v1.2.3](https://github.com/elastos/Elastos.Node/releases/tag/v1.2.3)** · ELA tip ~**2,267,480** (past gate **2,265,000**)
- **Hyper lane** — [Elacity/Hyper](https://github.com/Elacity/Hyper) · [Elacity/Hey-engine](https://github.com/Elacity/Hey-engine)
- **Runtime** — [Elacity/elastos-runtime](https://github.com/Elacity/elastos-runtime) `main` tip [`d358ded`](https://github.com/Elacity/elastos-runtime/commit/d358dedb) · experiment branch [`experiment/home-studio-h3-dogfood`](https://github.com/Elacity/elastos-runtime/tree/experiment/home-studio-h3-dogfood) tip [`2d33644`](https://github.com/Elacity/elastos-runtime/commit/2d33644d) · CHANGELOG **[0.6.0]** on `main` · GitHub Release still **[v0.4.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.4.0)**
- **Marketplace** — drm-api PR **[#4](https://github.com/Elacity/drm-api-layer/pull/4)** (0.11 → ESC) merged · elacity-web PR **[#25](https://github.com/Elacity/elacity-web/pull/25)** merged (**4.5.0**)
- **Install (PC2 node)** — `bash <(curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/update.sh)`
- **Install (Runtime)** — `curl -fsSL https://elastos.elacitylabs.com/install.sh | bash`
- **Live surfaces** — map.ela.city · portal.ela.city · elacitylabs.com · elacitylabs.com/provenance

## Table of Contents

1. The Big Picture — Org Heat After the 0.6 Cut
2. Elastos Status (8 Aug) — Mainchain Online, Sidechains Closed on Purpose
3. Blind Spots — What a PC2+Runtime-Only Scan Missed
4. Ecosystem — Node v1.2.3 + ELA Past Gate Two
5. ElacityLabsWeb — CodeRED Intel + Ops Admin Portal
6. Hyper + Hey-engine — Calls, Radio, Relay
7. Marketplace — drm-api 0.11 → ESC + web 4.5.0 Confirmed
8. Security Hardening Branches — ddrm-reader, events-watcher, drm CI
9. Runtime — `main` Tail + Home Dogfood + DKMS/ESP Port (Team Lane)
10. PC2 — Convergence Continues (Docs Only)
11. Release Engineering — 0.6 Tag Still Pending
12. Convergence Lens
13. Looking Ahead
14. Summary Statistics
15. Data-Quality Notes

---

## 1. The Big Picture — Org Heat After the 0.6 Cut

Five stories this week — **chain status**, **Runtime Home dogfood** (off `main`), ops intel, mesh/mobile, and tooling.

**Zeroth, say plainly what is open and what is not.** Mainchain recovered through halt → patch → rewind → restart → BPoS. ESC, EID, Arbiter, and the bridge stay closed until repair, accounting, and rehearsal clear a higher bar. That sequencing is intentional. See §2.

**First, Runtime product heat is branch-scoped, not `main`.** (1) **Home / Sparks H3 dogfood** on `experiment/home-studio-h3-dogfood` — Live SSE, Inbox/library, Waves 4–6, Studio Generate/Storyboard/Character; not for `main` until secure converge. (2) **DKMS / protected-content / commerce ESP port** — teammate roadmap coverage (2026-08-07) marks `feat/dkms-esp-port` READY-FOR-MANUAL-MERGE vs `upstream/0.7-dev`: content creation and playback ~**75%** functional / ~**70%** ESP-aligned; foundation/hardening only touched where the rails forced it. Branch tip not yet on public `origin` heads — team lane. See §9.

**Second, Labs built an internal intelligence / ops surface.** ElacityLabsWeb (~42 commits, SashaMIT) folded **CodeRED OSS intelligence** into a unified `/admin` ops portal. Operator tooling — not a public product launch.

**Third, Hyper / hey-engine kept shipping.** Calls, radio, relay, and **one edition, no Google Play store path**.

**Fourth, ecosystem + marketplace closed last cycle’s open loops.** Node **v1.2.3**; drm-api **PR #4** (0.11 → ESC indexer readiness); elacity-web **4.5.0** merged; ELA tip past **2,265,000**.

PC2 remains product-quiet (docs). Runtime `main` is the quiet correctness line; the Home lane is the loud one — branch-scoped.

## 2. Elastos Status (8 Aug) — Mainchain Online, Sidechains Closed on Purpose

*Community framing from Elastos DAO / incident coordination (engineering led by the incident technical team). Not an “everything is fine” line — a clear account of what has been done since July, and what stays shut until it deserves confidence.*

### What we are recovering from

In July, Elastos faced serious security events on more than one layer.

- **20 July mainchain:** a critical money-math vulnerability allowed fabricated ELA. Mining pools, Council infrastructure, and operators halted the chain; it was rewound to the last clean height, patched, and restarted. Ordinary holders whose balances were confirmed before the exploit did not need to “claim” or migrate funds for that rewind path.
- **Earlier July cross-chain / sidechain:** ESC, EID, and the bridge were paused as containment. Those systems are on a **deliberate slower reopen track** — different risk profile from mainchain.

Long form: [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/) · July security updates / Jul-15 notice on the Elastos blog as previously published · [honest recovery log (engineering)](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md).

### Mainchain — online, still being hardened

Recovery was a sequence, not a switch: emergency stop → consensus and money-path fixes → coordinated rewind → restart on upgraded software → return to BPoS with validators and Council process → height-gated safety improvements so history stays consistent while new protections activate cleanly going forward.

**Today:** mainchain is producing blocks again under BPoS (tip ~**2,267,480** — past gate **2,265,000**). Continuous work continues behind that: edge-case review, validating fixes against real behaviour, further hardening, and refusing to treat “chain is moving” as “all risk is gone.” More review and packaging for independent audit is still in flight.

If mainchain feels “back” while other parts of the ecosystem still feel frozen — that is **intentional sequencing**, not neglect of ESC or the bridge.

### ESC, EID, Arbiter, and the bridge — still closed, for a reason

ESC, EID, the Arbiter / bridge relay, and related cross-chain paths remain **closed to normal user activity**.

The bridge is not one simple pipe:

- Moving value onto a sidechain and moving value back off it are not the same mechanism.
- One direction can involve automatic observation of mainchain activity once a sidechain is running.
- The other depends on multi-party signing and relay infrastructure shut down in incident response.

A careless restart is dangerous: some paths can become active as soon as software is live, while others may still be broken or unsafe. The standard is not “turn it on and hope.” The standard is: understand the full defect surface, repair what must be repaired before first start, protect users who already have funds in awkward states, and **rehearse** restart conditions before inviting deposits and withdrawals again.

Actively in this lane (without a vulnerability catalogue): full pass over known concerns against production code; distinguishing real issues from false alarms; height-forward repairs that do not invalidate settled history; treating ESC and EID as related but not identical; accounting and user-impact work so reopen does not create double-pays, unpaid stuck transfers, or preventable new deposits into closed rooms; evidence preservation and operational steps on Council / relay machines before a clean restart; building toward a rehearsal environment so “is restart safe?” is answered by running the scenario.

**Until that bar is met:** do not expect bridge deposits/withdrawals, and do not send funds into sidechain or bridge flows “just in case.” Reopen will be announced — people will not be surprised into a half-open bridge. Gaming / PG chain operators and wallet UX that still point users at closed paths are part of the same ops conversation: stop growing avoidable stuck balances while the door is shut.

### Governance — verified harm, not exploit proceeds

Cyber Republic / Council process has been running an Incident Recovery program: sequential CRC proposals for **verified make-whole and partner continuity**. That is not a payout of exploit proceeds or a reward for fabricated balances. Voting has been progressing across the tranche series. Exact counterparty settlement figures stay confidential while partner processes continue; the public commitment is the program itself, the postmortem framing, and later fuller accounting when it is safe to publish. Slow on purpose.

### Independent security review

Multiple external security firms are engaged under NDA for phased review of the corrected mainchain (and related) work. The repository remains closed until a locked patch set is handed over — so reviewers are not chasing a moving target, and unfinished attack surface is not published while fixes are still landing. Sidechain / bridge review depth is on its own reopen clock.

### Exchanges, partners, and market protection

Continuous private coordination with exchange and partner channels on reconciliation, risk controls, and protecting ordinary users from further harm related to incident-linked balances and accounting mismatches after the rewind. Markets and users should not absorb a second wave of damage because someone was impatient to unlock everything. Partner make-whole and technical reopen are both part of restoring trust — they are not substitutes for each other.

### What this means for you right now

| Surface | Status |
|---|---|
| **Mainchain** | Operating again under upgraded software and ongoing hardening |
| **ESC / EID / bridge / Arbiter** | Still closed — wait for official reopen |
| **Bridge / paused sidechain deposits** | Do not send funds until announced open |
| **Mainchain holders through rewind** | Generally no emergency user action for that path |
| **Stuck bridge / sidechain cases** | Official support channels; patience while reopen work finishes |

“Why isn’t ESC back if mainchain is back?” — fair question. Answer: different risk, automatic paths on restart, unfinished repair and rehearsal. That is diligence, not delay for its own sake.

A small set of engineers, Council members, operators, and coordinators have been working this incident stack for weeks — often in parallel, often with little sleep. Judge the work by its scope: protect users first, reopen only when the stack deserves confidence, and say plainly when a door is still shut on purpose.

Further public posts when there is a concrete ESC / bridge milestone, a locked audit handoff the community should know about, or a governance milestone that changes the public picture.

## 3. Blind Spots — What a PC2+Runtime-Only Scan Missed

An auto-draft that only walked `pc2.net` + `elastos-runtime` concluded “tail cycle, 3 commits.” With full **Elacity + Elastos** org access restored:

| Missed lane | Reality this window |
|---|---|
| Community / DAO status | Mainchain online · ESC/bridge closed on purpose · CRC make-whole · auditor engagement |
| **Runtime `experiment/home-studio-h3-dogfood`** | **~15** commits after cutoff — home-agent Waves + Sparks H3 (pushed 8 Aug); **77** ahead of `main` overall |
| **Runtime `feat/dkms-esp-port` (team)** | READY-FOR-MANUAL-MERGE vs 0.7-dev roadmap — content rails ~75% functional; **not on public `origin` heads yet** (tip `e2cc4229` per team report) |
| ElacityLabsWeb | **~42** commits — CodeRED Intel + ops admin |
| Hey-engine | **18** commits — relay / radio / calls |
| Hyper | **6** commits — calls / Play drop / build gate |
| Elastos.Node | **v1.2.3** release |
| drm-api-layer | **PR #4 merged** — 0.11 pack → ESC |
| elacity-web | **PR #25 merged** — **4.5.0** on GitHub |
| ddrm-reader / events-watcher / drm CI | Hardening / guard branches (open PRs #1 / #1 / #5) |
| ELA tip | ~**2,267,480** — past gate two |

**Rescan note (8 Aug afternoon):** first publish of this weekly looked only at Runtime `main` and under-counted the Home lane. Full branch walk of `elastos-runtime` (9 remotes) + private Elacity defaults + open PRs corrected that. Shell-ui long-lives (`feat/shell-ui-*`, `fix/elastos-shell-protocol-browser-wip`) had **no** in-window pushes — carried from prior cycles only.

**Access note:** Elastos org readable (**242** repos). Only **Elastos.Node** showed in-window pushes; **Elastos.ELA** had no new commits — consistent with locked patch / audit handoff posture.

## 4. Ecosystem — Node v1.2.3 + ELA Past Gate Two

### Elastos.Node — [v1.2.3](https://github.com/elastos/Elastos.Node/releases/tag/v1.2.3) (2026-08-03)

**`ela rewound` rejected every build after v1.0.0.** The binary check matched the version string exactly, so a node correctly running **v1.0.2** was told it could not perform recovery and never reported READY. Point releases after the recovery build are the normal case once the chain is running again.

**Fix:** accept **v1.0.0 or later**, compared as version numbers (not strings). String compare fails both ways (`1.0.2` < `1.0.0`, `0.9.9.6` > `1.0.0`, etc.). Prerelease builds are accepted but reported as such.

```text
node.sh update_script
node.sh version          # expect v1.2.3
```

### ELA mainnet tip

Public RPC height ~**2,267,480** (Aug 8 check). Gate two (**2,265,000** — ELA-only reward mint / arbiter fee base from the recovery log) is **behind tip**. Promote those two recovery items toward **proven live** when the honest-log scan band is republished across the gate (do not invent mint figures here).

**Elastos.ELA:** no in-window commits. Live binary remains **v1.0.2**.

## 5. ElacityLabsWeb — CodeRED Intel + Ops Admin Portal

**~42 commits on `main` (SashaMIT + 2 Claude co-authored).** Private ops surface:

- **CodeRED OSS intelligence portal** folded into `/admin` before merge (PRs #17–#21)
- Unified ops shell: full-height sidebar, overview dashboard, Elacity + CRC Accountant design tokens
- Sprint lanes (incl. `awaiting_review`, Done = merged-only, Archived)
- Severity color chips; finding counts on filter chips; stage as primary chip
- Discovery: prefer human-queued Opportunity Registry targets; safe Claude Routine allowlist; WebFetch over curl; cron widened / aligned to 6×/day discovery
- Auth: httpOnly session cookie dual-read with Bearer; stop storing JWT in localStorage; clear cookie on logout; remove login rate-limit that blocked operator CLI
- Resilience: recover stale lazy chunks after deploy; guard React against Translate/extension DOM mutations; coerce fields so Amber Notion drains succeed
- Copy: EU AI Act enforcement → present tense after Aug 2

## 6. Hyper + Hey-engine — Calls, Radio, Relay

### Hyper (6 · HeyElastos)

- Calls: call screen blocks taps landing behind it; **720p** on the surface path (bitrate adapts; resolution does not)
- Radio idle signal landed then reverted once, then re-approached from engine side
- **Build:** refuse to ship an engine nobody can name
- **Product:** drop Google Play — one edition, no store, no bundle

### Hey-engine (18 · HeyElastos)

- **Relay:** “my own relay” actually connects; raise client backstop past self-hosted ping; stop pre-empting server keepalive; tell the app which relay is carrying traffic
- **Radio / Carrier:** background posture behind its own switch; thin `net_report` while backgrounded; stop asking a non-existent gateway for port mapping; do not dial a peer already directly connected; stop shouting at impossible addresses
- **Calls:** drive accept as well as offer; re-export per-peer receive door for the video grid
- **Addresses / tickets:** one ticket per contact (not per historical address); stop remembering where a contact used to be
- **Chat list:** show what is actually latest, including a missed call
- **Fan-out budget:** land the implementation the switch already advertised
- Tests: QAD-reuse pins brought onto this line

## 7. Marketplace — drm-api 0.11 → ESC + web 4.5.0 Confirmed

### drm-api-layer — PR [#4](https://github.com/Elacity/drm-api-layer/pull/4) merged → `release/next` (ESC)

Last week’s “worth continuing” item: port Base **0.11** adaptive `eth_getLogs` + CACHER pack to ESC. Done surgically (not a FF of Base tip — Base is ~247 commits ahead with Base-only product).

- Probe-first adaptive scanner; Layer A anchors (never default `fromBlock` 0)
- `resolveCacher` + TTL clamp; db.mixin cache-clean broadcast (best-effort)
- Process keep-alive guards; Lab metrics off unless enabled
- ESC chain 20: `blockNumberBatch` 50000, `logScan.maxChunk` 5M
- Review follow-ups from irzhywau (+15 tests); **69** unit tests green on the pack

**Context:** this is marketplace / indexer readiness against ESC’s chain ID and scan model — **not** an announcement that ESC or the bridge are open for users. ESC remains closed pending the reopen bar in §2.

**Open:** PR [#5](https://github.com/Elacity/drm-api-layer/pull/5) — CI guard against exposing server-key-signed payable actions without authorization.

### elacity-web — PR [#25](https://github.com/Elacity/elacity-web/pull/25) **merged** (2026-08-03)

GitHub now matches last week’s deploy report: **4.5.0** on `release/base-network` (bump commit `84d729a` + polish merge). Light-mode / sell-flow / withdraw / offline toast from prior cycle are on the release line.

## 8. Security Hardening Branches — ddrm-reader, events-watcher, drm CI

Not all merged to default yet — flagged so they are not invisible:

| Repo | Branch / PR | What |
|---|---|---|
| **ddrm-reader** | `fix/reader-fetch-hardening` | Harden reader fetch paths against traversal + unbounded reads |
| **events-watcher** | `feat/discovery-max-trackers` | Cap dynamically discovered trackers via `discovery_max_trackers` |
| **drm-api-layer** | PR #5 `ci/server-key-action-guard` | CI guard: no unauthorized server-key-signed payable actions |

## 9. Runtime — `main` Tail + Home Dogfood + DKMS/ESP Port (Team Lane)

Three Runtime stories this cycle: a small **`main`** correctness fix; a large **experiment-branch** Home / Studio dogfood line; and an internal **DKMS/ESP content-rails** port marked READY-FOR-MANUAL-MERGE against the 0.7-dev roadmap (not visible on public `origin` heads yet — team status, 2026-08-07).

### `main` — `d358ded` fix(vz): scope TURN cleanup to launch ownership (+19/−2)

**Cutoff honesty:** last week’s publish already had tip **`51e37bd`** (portable stdin) and hanging-close test scaffolding. **New on `main` after 08:08 UTC:** TURN listener/relay port probes now run only when this owner may have started TURN (`Owned` / `Indeterminate`). A foreign listener on the TURN port no longer forges a cleanup obligation.

**0.6 GitHub Release/tag:** still not published (latest Release object **v0.4.0**). Decide whether the tagged build includes `d358ded` or freezes earlier.

### `experiment/home-studio-h3-dogfood` — Home-agent waves + Sparks H3 (not for `main`)

Branch tip [`2d33644`](https://github.com/Elacity/elastos-runtime/commit/2d33644d) (2026-08-08). **77 commits ahead of `main`**, ~300 files in the compare — Wave 0 merge of 0.6 browser/wallet/VZ plus this week’s product dogfood. Authors: SashaMIT / Sash. Explicit commit framing: *experimental AI-harness dogfood; not for `main`; refine against runtime principles and CTO infra before a secure converge.*

**After weekly cutoff (Aug 1 08:08 → Aug 8 push):**

| When | What |
|---|---|
| Aug 4 | Wave 0 sync onto `origin/main` (0.6 browser/wallet/VZ) |
| Aug 4 | Live SSE chat feel, streaming markdown, prompt prefs |
| Aug 4 | Gateway allowlisted backends UI + smarter titles |
| Aug 4 | Desktop attach picker + capped text extract |
| Aug 4 | Wave 4 — live usage metering + honest failure strip |
| Aug 4 | Wave 5 — Inbox `library.read` once loop; honest ADE Diff/Term/Help Browser copy |
| Aug 5 | Wave 6 — Local Library KB extract/citations; `web.search` Exit/net **fail-closed** stub |
| Aug 5 | On-Home sticky notes for Live system context |
| Aug 5 | Session fork/tags; `tag:` / `#tag` session search; honest vision-attach stub |
| Aug 5 | Thinking blocks render as markdown |
| Aug 8 | **Sparks H3 dogfood** — Generate / Storyboard / Character (+ cluster `CREATIVE_*` bridge, clip library, prepare/stitch, Studio UI) |
| Aug 8 | Scrub machine-local prepare path before public push |

Tip label in commit: `home-20260807aj`. This is the Runtime heat the first draft of this weekly under-reported.

### `feat/dkms-esp-port` — content rails vs `upstream/0.7-dev` roadmap (team coverage, 7 Aug)

**Source:** teammate Roadmap Coverage Report — branch tip `e2cc4229` (5 commits), status **READY-FOR-MANUAL-MERGE**. Method: claims grounded in code/tests on the branch; dual lens **Functional %** vs **Aligned %** (discount for ESP target model: facts/verbs conversation plane, Runtime-owned authority, capsule interaction contracts).

**Not on public `origin`:** a fresh walk of Elacity/elastos-runtime’s 9 remote heads does **not** yet list `feat/dkms-esp-port` / `e2cc4229`. Treated here as **internal team status** until pushed — still real product progress that a GitHub-only scan would miss.

| Roadmap section | Functional | Aligned | Verdict |
|---|---|---|---|
| Foundation | ~15% | ~12% | Consumes foundation; invoke-path security + commerce-slice UI |
| **Content creation and playback** | **~75%** | **~70%** | **This branch’s home** — custody / protected content / commerce |
| Hardening | ~20% | ~20% | Real pieces; no item complete |
| Later follow-ups | ~15% | ~15% | Precursors; egress-policy ~45% pre-seeded |

**In the content section (branch home):**

| Item | Func | Aligned | One-line |
|---|---|---|---|
| `feat/elastos-dkms-custody` | ~65% | ~65% | Threshold custody core, PQ-hybrid envelopes, release fail-closed CI-gated — provider plane **on-model** |
| `feat/elastos-protected-content` | ~85% | ~75% | Rights/key/encrypt/decrypt/drm, CENC, both viewers, session lifecycle e2e-anchored; subject-resolution rewire still parked (dev-lane chain open/buy) |
| `feat/elastos-content-commerce` | ~85% | ~65% | Full publish→index→buy→acquire rail + wallet step-up + chain; verb surface / market-route auth await ESP migration |
| `feat/elastos-webspace-interop` | ~10% | ~10% | Enabling fix only — section’s remaining workstream |

**ESP alignment in one sentence:** data and authority planes are on the target model (provider hostcalls, manifests/catalog, viewers/creator as web-projections, money verbs under Home — **no new authority path**). The **conversation plane is not** — commerce/viewer still REST-ish gateway + bespoke postMessage, same debt main’s wallet/system surfaces owe; belongs to `feat/shell-ui-esp`, not a dkms rework. Biggest in-section gap to “chain-mode-live”: `RequiredHomeLaunchToken` / subject-resolution threading.

**Scheduling note from the report:** `feat/elastos-egress-policy` ~45% pre-seeded (crosvm egress audit/firewall + tests) — consider pulling earlier. When shell-ui ESP verbs land, commerce/protected-content aligned % converges up with little dkms-side work.

**Still carried on public remotes, no in-window pushes:** `feat/shell-ui-esp-on-protocol-extended-ai-work`, `feat/shell-ui-esp-on-protocol`, `feat/shell-ui-v1`, `fix/elastos-shell-protocol-browser-wip`, `flint-0.5`, `upstream/0.6-dev`.

## 10. PC2 — Convergence Continues (Docs Only)

**Product landings:** zero. One docs commit on `main`: `150ccd1` — publish of the Jul 24–31 weekly + ELA honest log (the prior report itself).

Operator line remains **v1.4.0**. Narrative unchanged: PC2 lessons live inside Runtime; quiet weeks are expected.

## 11. Release Engineering — 0.6 Tag Still Pending

| Item | Status |
|---|---|
| Runtime CHANGELOG **[0.6.0]** + `main` merge | Done (prior cycle) |
| Post-merge VZ/TURN fix `d358ded` | On `main` this cycle |
| GitHub Release/tag **v0.6.0** | **Still pending** |
| Node operator toolkit | **v1.2.3** shipped |
| Mainchain GitHub / audit package | Closed until locked patch handoff |
| ESC / bridge user reopen | **Closed** until repair + rehearsal bar met |

## 12. Convergence Lens

| Concern | PC2 | Runtime | Rest of org / ecosystem |
|---|---|---|---|
| Strategic role | Stable 1.4.0 / quiet | 0.6 on `main` + Home dogfood + **DKMS/ESP content rails (team)** | Labs / Hyper / Node / drm |
| Chain status | — | — | Mainchain online · ESC/bridge **closed on purpose** |
| Home / Agent / Studio | — | Waves 4–6 + Sparks H3 (`experiment/home-studio-h3-dogfood`) | — |
| DKMS / protected content / commerce | — | `feat/dkms-esp-port` READY-FOR-MANUAL-MERGE (~75% content section) | — |
| Ops / intel | — | — | LabsWeb CodeRED + admin |
| Mesh / mobile | — | — | Hyper + hey-engine |
| Money / nodes | — | — | Node **v1.2.3**; ELA tip past gate two; CRC make-whole |
| Marketplace | — | — | drm **0.11→ESC** (indexer readiness); web **4.5.0** |
| Release packaging | — | **0.6 tag open** · Home **not** merging to `main` yet | Locked mainchain audit package in flight |

**Reading:** `main`-only Runtime looks like a tail week. Public experiment + internal DKMS/ESP port show two primary product workstreams off `main` — Home/Studio dogfood and content rails toward 0.7 — both gated on purpose. Full-org scan still shows Labs + Hyper + Node + drm; DAO status still carries: mainchain back ≠ bridge open.

## 13. Looking Ahead

1. **ESC / bridge reopen track** — defect surface, height-forward repairs, accounting for stuck states, Council/relay ops steps, rehearsal environment; announce before inviting deposits
2. **Locked mainchain audit handoff** — freeze package → external review → widen access when it does not increase live risk
3. **CRC Incident Recovery** — continue verified make-whole tranches; fuller public accounting when safe
4. **Runtime Home converge** — dogfood Sparks H3 / home-agent against runtime principles + CTO infra; secure path before any `main` merge
5. **`feat/dkms-esp-port` manual merge** — push/visible tip if not already; land against 0.7-dev when ready; subject-resolution (`RequiredHomeLaunchToken`) is the chain-mode gate; ESP conversation-plane migration rides with `feat/shell-ui-esp`
6. **Publish Runtime GitHub Release/tag `v0.6.0`** (include `d358ded` or freeze earlier — decide explicitly)
7. **Honest-log scan republish** across gate **2,265,000** — promote the two pending reward-mint items when the band is clean
8. Fleet: **Node v1.2.3** + ELA **v1.0.2**; stop wallet/UX paths that grow stuck balances into closed rooms
9. drm-api: soak ESC `release/next` post-0.11 port; land CI server-key guard (PR #5)
10. Merge / soak ddrm-reader fetch hardening + events-watcher tracker cap (open PRs)
11. Hyper: F-Droid / one-edition distribution path after Play drop
12. CodeRED Intel: keep discovery → Amber drain cadence honest under load
13. **PC2:** no expectation of product commits unless operator-critical

## 14. Summary Statistics

**Window (UTC):** 2026-08-01 **08:08** (prior report publish `150ccd1`) → 2026-08-07 end-of-day. Calendar Aug 1 landings before 08:08 counted in [#31](https://github.com/Elacity/pc2.net/discussions/31). Community status note dated **8 August 2026**.

| Repository | Commits (after cutoff) | Notes |
|---|---|---|
| Elacity/ElacityLabsWeb | **~42** | CodeRED Intel + ops admin portal |
| Elacity/Hey-engine | **18** | Relay / radio / calls / tickets |
| Elacity/Hyper | **6** | Calls / Play drop / build gate |
| elastos/Elastos.Node | **2** | Release **v1.2.3** |
| Elacity/drm-api-layer | PR activity | **#4 merged** (0.11→ESC); **#5 open** (CI guard) |
| Elacity/elacity-web | merge confirm | PR **#25 merged**; **4.5.0** |
| Elacity/elastos-runtime (`main`) | **1** | `d358ded` TURN cleanup ownership |
| Elacity/elastos-runtime (`experiment/home-studio-h3-dogfood`) | **~15** after cutoff | Home-agent Waves 4–6 + Sparks H3 dogfood (tip `2d33644`); **77** ahead of `main` |
| Elacity/elastos-runtime (`feat/dkms-esp-port`, team) | 5 (report) | READY-FOR-MANUAL-MERGE @ `e2cc4229` — **not on public origin heads yet**; content section ~75% / ~70% |
| Elacity/pc2.net | docs | Weekly publish commits (product quiet) |
| Elacity/ddrm-reader | branch | fetch hardening |
| Elacity/events-watcher | branch | discovery tracker cap |
| elastos/Elastos.ELA | **0** | v1.0.2 still live · locked audit posture |

- **Authors (selected):** SashaMIT (LabsWeb) · HeyElastos (Hyper/hey-engine) · 4HM3DMD (Node) · irzhywau (drm review / web merge) · andersalm (Runtime) · Claude co-authored LabsWeb commits under direction
- **Releases:** Elastos.Node **v1.2.3**; Runtime GitHub Release still **v0.4.0**
- **Access:** Elacity org + **Elastos org** both readable this run
- **Off-repo:** Elastos DAO / incident coordination status (8 Aug) integrated in §2

## 15. Data-Quality Notes

- **Prior auto-draft caveat stands and is corrected here.** A git-only PC2+Runtime-`main` pass under-counted the week. Full-org + **all Runtime remotes** + open PRs + 8 Aug Home push are now in this revision.
- **Second correction (same day):** first publish of #32 still under-weighted Runtime until `experiment/home-studio-h3-dogfood` was re-fetched after the public push.
- **Third correction (same day):** `feat/dkms-esp-port` roadmap coverage added from teammate report — branch tip not fetchable on public `origin`; percentages are their grounded assessment, not a re-audit from this session.
- **Cutoff:** landings before 2026-08-01 08:08 UTC (including Runtime `51e37bd` / `27a02a8`) belong to [#31](https://github.com/Elacity/pc2.net/discussions/31), not double-counted as new product this week — except where this report explicitly notes carry-over status (0.6 tag, web 4.5.0 GitHub merge confirm).
- **CodeRED / admin:** internal ops tooling; no exploit cookbook, no target lists in this public weekly.
- **Sensitive omission:** settlement counterparty figures, LE detail, and private vuln catalogues stay out (same discipline as #30–#31). CRC program existence is public; amounts are not.

---

### Quick fact card

| Fact | Value |
|---|---|
| Previous report | [#31](https://github.com/Elacity/pc2.net/discussions/31) |
| This discussion | [#32](https://github.com/Elacity/pc2.net/discussions/32) |
| Mainchain | Online (BPoS) · still hardening |
| ESC / EID / bridge | **Closed on purpose** — wait for official reopen |
| Node | **v1.2.3** |
| ELA tip | ~**2,267,480** (past gate **2,265,000**) |
| LabsWeb | ~**42** — CodeRED + ops admin |
| Hyper / hey-engine | **6 / 18** |
| drm-api | **0.11 → ESC** (PR #4) — indexer readiness, not user reopen |
| elacity-web | **4.5.0** merged on GitHub |
| Runtime `main` | `d358ded` · **0.6 tag still pending** |
| Runtime Home / Studio | `experiment/home-studio-h3-dogfood` · Waves + Sparks H3 · **not for `main` yet** |
| Runtime DKMS / content rails | `feat/dkms-esp-port` READY-FOR-MANUAL-MERGE · content ~75% · team tip not on origin yet |
| PC2 | docs-only · convergence continues |
| Postmortem | [blog.elastos.net](https://blog.elastos.net/announcement/main-chain-postmortem-august/) |

---

*Cadence: weekly updates. Previous report — [Week of July 24 – July 31, 2026 (#31)](https://github.com/Elacity/pc2.net/discussions/31). This report — [#32](https://github.com/Elacity/pc2.net/discussions/32).*
