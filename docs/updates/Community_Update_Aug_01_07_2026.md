Elacity Labs — Weekly Team Update for the World Computer Initiative (WCI)

**August 1 – August 7, 2026**

**Not a quiet week — the PC2+Runtime-only draft missed most of the org.** Coming out of [#31](https://github.com/Elacity/pc2.net/discussions/31) (mainnet recovery + Runtime v0.6 on `main`), this cycle’s heat is elsewhere: **ElacityLabsWeb** shipped a private **CodeRED Intel / ops admin portal** (~42 commits); **Hyper + hey-engine** kept hardening calls, radio, and relay (**6 + 18**); **Elastos.Node v1.2.3** fixed `ela rewound` for post-v1.0.0 recovery builds; **drm-api** surgically backported the Base **0.11** getLogs/CACHER pack to **ESC** (`release/next`, PR #4); and security hardening branches landed on **ddrm-reader**, **events-watcher**, and drm CI. Runtime added one post-report correctness fix (TURN cleanup ownership). **PC2** stayed product-quiet (docs publish only) — convergence holds. Formal Runtime **v0.6.0 GitHub Release/tag** is still outstanding. ELA tip ~**2,267,480** — past gate two (**2,265,000**).

> CodeRED Intel / ops admin · Hyper + hey-engine · Node **v1.2.3** · drm-api **0.11 → ESC** · Runtime TURN fix · PC2 quiet · ELA tip past **2,265,000** · Runtime **0.6 tag still pending**.

---

## Key Links This Week

- **Previous report** — [Week of July 24 – July 31, 2026 (#31)](https://github.com/Elacity/pc2.net/discussions/31)
- **Ecosystem** — [elastos/Elastos.Node](https://github.com/elastos/Elastos.Node) release **[v1.2.3](https://github.com/elastos/Elastos.Node/releases/tag/v1.2.3)** · ELA tip ~**2,267,480** (past gate **2,265,000**) · [honest recovery log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md)
- **Hyper lane** — [Elacity/Hyper](https://github.com/Elacity/Hyper) · [Elacity/Hey-engine](https://github.com/Elacity/Hey-engine)
- **Runtime** — [Elacity/elastos-runtime](https://github.com/Elacity/elastos-runtime) tip [`d358ded`](https://github.com/Elacity/elastos-runtime/commit/d358dedb) · CHANGELOG **[0.6.0]** on `main` · GitHub Release still **[v0.4.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.4.0)**
- **Marketplace** — drm-api PR **[#4](https://github.com/Elacity/drm-api-layer/pull/4)** (0.11 → ESC) merged · elacity-web PR **[#25](https://github.com/Elacity/elacity-web/pull/25)** merged (**4.5.0**)
- **Install (PC2 node)** — `bash <(curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/update.sh)`
- **Install (Runtime)** — `curl -fsSL https://elastos.elacitylabs.com/install.sh | bash`
- **Live surfaces** — map.ela.city · portal.ela.city · elacitylabs.com · elacitylabs.com/provenance

## Table of Contents

1. The Big Picture — Org Heat After the 0.6 Cut
2. Blind Spots — What a PC2+Runtime-Only Scan Missed
3. Ecosystem — Node v1.2.3 + ELA Past Gate Two
4. ElacityLabsWeb — CodeRED Intel + Ops Admin Portal
5. Hyper + Hey-engine — Calls, Radio, Relay
6. Marketplace — drm-api 0.11 → ESC + web 4.5.0 Confirmed
7. Security Hardening Branches — ddrm-reader, events-watcher, drm CI
8. Runtime — Post-0.6 Correctness Tail
9. PC2 — Convergence Continues (Docs Only)
10. Release Engineering — 0.6 Tag Still Pending
11. Convergence Lens
12. Looking Ahead
13. Summary Statistics
14. Data-Quality & Off-Repo Notes
15. Off-Repo Context

---

## 1. The Big Picture — Org Heat After the 0.6 Cut

Three stories this week — ops intel, mesh/mobile, and chain tooling — not “Runtime only.”

**First, Labs built an internal intelligence / ops surface.** ElacityLabsWeb (~42 commits, SashaMIT) folded **CodeRED OSS intelligence** into a unified `/admin` ops portal: sprint lanes, severity chips, cookie sessions, discovery cron alignment, and deploy-resilient lazy chunks. This is operator tooling for opportunity tracking — not a public product launch.

**Second, Hyper / hey-engine kept shipping.** Video-call path, radio background posture, self-hosted relay truth, address/ticket hygiene, and a clear product call: **one edition, no Google Play store path**.

**Third, ecosystem + marketplace closed last cycle’s open loops.** Node **v1.2.3** unblocks `ela rewound` on v1.0.2+ binaries. drm-api **PR #4** ports Base 0.11 getLogs/CACHER to ESC. elacity-web **4.5.0** is merged on GitHub (catching up last week’s deploy report). ELA tip is past **2,265,000**.

Runtime and PC2 are quiet by design relative to that: one VZ TURN-ownership fix on Runtime; PC2 docs-only.

## 2. Blind Spots — What a PC2+Runtime-Only Scan Missed

An auto-draft that only walked `pc2.net` + `elastos-runtime` concluded “tail cycle, 3 commits.” With full **Elacity + Elastos** org access restored:

| Missed lane | Reality this window |
|---|---|
| ElacityLabsWeb | **~42** commits — CodeRED Intel + ops admin |
| Hey-engine | **18** commits — relay / radio / calls |
| Hyper | **6** commits — calls / Play drop / build gate |
| Elastos.Node | **v1.2.3** release |
| drm-api-layer | **PR #4 merged** — 0.11 pack → ESC |
| elacity-web | **PR #25 merged** — **4.5.0** on GitHub |
| ddrm-reader / events-watcher / drm CI | Hardening / guard branches (not all on default yet) |
| ELA tip | ~**2,267,480** — past gate two |

**Access note:** Elastos org is readable from this session (**242** repos listed). Only **Elastos.Node** showed in-window pushes; **Elastos.ELA** had no new commits this window.

## 3. Ecosystem — Node v1.2.3 + ELA Past Gate Two

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

## 4. ElacityLabsWeb — CodeRED Intel + Ops Admin Portal

**~42 commits on `main` (SashaMIT + 2 Claude co-authored).** Private ops surface:

- **CodeRED OSS intelligence portal** folded into `/admin` before merge (PRs #17–#21)
- Unified ops shell: full-height sidebar, overview dashboard, Elacity + CRC Accountant design tokens
- Sprint lanes (incl. `awaiting_review`, Done = merged-only, Archived)
- Severity color chips; finding counts on filter chips; stage as primary chip
- Discovery: prefer human-queued Opportunity Registry targets; safe Claude Routine allowlist; WebFetch over curl; cron widened / aligned to 6×/day discovery
- Auth: httpOnly session cookie dual-read with Bearer; stop storing JWT in localStorage; clear cookie on logout; remove login rate-limit that blocked operator CLI
- Resilience: recover stale lazy chunks after deploy; guard React against Translate/extension DOM mutations; coerce fields so Amber Notion drains succeed
- Copy: EU AI Act enforcement → present tense after Aug 2

## 5. Hyper + Hey-engine — Calls, Radio, Relay

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

## 6. Marketplace — drm-api 0.11 → ESC + web 4.5.0 Confirmed

### drm-api-layer — PR [#4](https://github.com/Elacity/drm-api-layer/pull/4) merged → `release/next` (ESC)

Last week’s “worth continuing” item: port Base **0.11** adaptive `eth_getLogs` + CACHER pack to ESC. Done surgically (not a FF of Base tip — Base is ~247 commits ahead with Base-only product).

- Probe-first adaptive scanner; Layer A anchors (never default `fromBlock` 0)
- `resolveCacher` + TTL clamp; db.mixin cache-clean broadcast (best-effort)
- Process keep-alive guards; Lab metrics off unless enabled
- ESC chain 20: `blockNumberBatch` 50000, `logScan.maxChunk` 5M
- Review follow-ups from irzhywau (+15 tests); **69** unit tests green on the pack

**Open:** PR [#5](https://github.com/Elacity/drm-api-layer/pull/5) — CI guard against exposing server-key-signed payable actions without authorization.

### elacity-web — PR [#25](https://github.com/Elacity/elacity-web/pull/25) **merged** (2026-08-03)

GitHub now matches last week’s deploy report: **4.5.0** on `release/base-network` (bump commit `84d729a` + polish merge). Light-mode / sell-flow / withdraw / offline toast from prior cycle are on the release line.

## 7. Security Hardening Branches — ddrm-reader, events-watcher, drm CI

Not all merged to default yet — flagged so they are not invisible:

| Repo | Branch / PR | What |
|---|---|---|
| **ddrm-reader** | `fix/reader-fetch-hardening` | Harden reader fetch paths against traversal + unbounded reads |
| **events-watcher** | `feat/discovery-max-trackers` | Cap dynamically discovered trackers via `discovery_max_trackers` |
| **drm-api-layer** | PR #5 `ci/server-key-action-guard` | CI guard: no unauthorized server-key-signed payable actions |

## 8. Runtime — Post-0.6 Correctness Tail

**Cutoff honesty:** last week’s publish already had tip **`51e37bd`** (portable stdin) and the hanging-close test scaffolding on `main`. **New this window after 08:08 UTC:**

### `d358ded` — fix(vz): scope TURN cleanup to launch ownership (+19/−2)

TURN listener/relay port probes now run only when this owner may have started TURN (`Owned` / `Indeterminate`). A foreign listener on the TURN port no longer forges a cleanup obligation. Test: foreign bind still settles `turn_listener_absent`.

**Still carried (not in 0.6 product cut):** `feat/shell-ui-esp-on-protocol-extended-ai-work` — no in-window pushes.

**0.6 GitHub Release/tag:** still not published (latest Release object **v0.4.0**). Decide whether the tagged build includes `d358ded` or freezes earlier.

## 9. PC2 — Convergence Continues (Docs Only)

**Product landings:** zero. One docs commit on `main`: `150ccd1` — publish of the Jul 24–31 weekly + ELA honest log (the prior report itself).

Operator line remains **v1.4.0**. Narrative unchanged: PC2 lessons live inside Runtime; quiet weeks are expected.

## 10. Release Engineering — 0.6 Tag Still Pending

| Item | Status |
|---|---|
| Runtime CHANGELOG **[0.6.0]** + `main` merge | Done (prior cycle) |
| Post-merge VZ/TURN fix `d358ded` | On `main` this cycle |
| GitHub Release/tag **v0.6.0** | **Still pending** |
| Node operator toolkit | **v1.2.3** shipped |

## 11. Convergence Lens

| Concern | PC2 | Runtime | Rest of org |
|---|---|---|---|
| Strategic role | Stable 1.4.0 / quiet | 0.6 on `main` + one VZ fix | **Heat this week** |
| Ops / intel | — | — | LabsWeb CodeRED + admin |
| Mesh / mobile | — | — | Hyper + hey-engine |
| Money / nodes | — | — | Node **v1.2.3**; ELA tip past gate two |
| Marketplace | — | — | drm **0.11→ESC**; web **4.5.0** merged |
| Release packaging | — | **0.6 tag open** | — |

**Reading:** a PC2+Runtime-only lens falsely reads “tail week.” Full-org scan shows Labs + Hyper + Node + drm carrying the weight while Runtime/PC2 hold the convergence posture.

## 12. Looking Ahead

1. **Publish Runtime GitHub Release/tag `v0.6.0`** (include `d358ded` or freeze earlier — decide explicitly)
2. **Honest-log scan republish** across gate **2,265,000** — promote the two pending reward-mint items when the band is clean
3. Fleet: **Node v1.2.3** + ELA **v1.0.2**; `ela rewound` now accepts recovery point releases
4. drm-api: soak ESC `release/next` post-0.11 port; land CI server-key guard (PR #5)
5. Merge / soak ddrm-reader fetch hardening + events-watcher tracker cap
6. Hyper: F-Droid / one-edition distribution path after Play drop
7. CodeRED Intel: keep discovery → Amber drain cadence honest under load
8. **PC2:** no expectation of product commits unless operator-critical

## 13. Summary Statistics

**Window (UTC):** 2026-08-01 **08:08** (prior report publish `150ccd1`) → 2026-08-07 end-of-day. Calendar Aug 1 landings before 08:08 counted in [#31](https://github.com/Elacity/pc2.net/discussions/31).

| Repository | Commits (after cutoff) | Notes |
|---|---|---|
| Elacity/ElacityLabsWeb | **~42** | CodeRED Intel + ops admin portal |
| Elacity/Hey-engine | **18** | Relay / radio / calls / tickets |
| Elacity/Hyper | **6** | Calls / Play drop / build gate |
| elastos/Elastos.Node | **2** | Release **v1.2.3** |
| Elacity/drm-api-layer | PR activity | **#4 merged** (0.11→ESC); **#5 open** (CI guard) |
| Elacity/elacity-web | merge confirm | PR **#25 merged**; **4.5.0** |
| Elacity/elastos-runtime | **1** | `d358ded` TURN cleanup ownership |
| Elacity/pc2.net | **1** (docs) | Prior weekly publish only |
| Elacity/ddrm-reader | branch | fetch hardening |
| Elacity/events-watcher | branch | discovery tracker cap |
| elastos/Elastos.ELA | **0** | v1.0.2 still live |

- **Authors (selected):** SashaMIT (LabsWeb) · HeyElastos (Hyper/hey-engine) · 4HM3DMD (Node) · irzhywau (drm review / web merge) · andersalm (Runtime) · Claude co-authored LabsWeb commits under direction
- **Releases:** Elastos.Node **v1.2.3**; Runtime GitHub Release still **v0.4.0**
- **Access:** Elacity org + **Elastos org** both readable this run

## 14. Data-Quality & Off-Repo Notes

- **Prior auto-draft caveat stands and is corrected here.** A git-only PC2+Runtime pass under egress limits under-counted the week. This report is a full-org rescan with `gh` API access.
- **Cutoff:** landings before 2026-08-01 08:08 UTC (including Runtime `51e37bd` / `27a02a8`) belong to [#31](https://github.com/Elacity/pc2.net/discussions/31), not double-counted as new product this week — except where this report explicitly notes carry-over status (0.6 tag, web 4.5.0 GitHub merge confirm).
- **CodeRED / admin:** internal ops tooling; no exploit cookbook, no target lists in this public weekly.
- **Sensitive omission:** settlement / LE / private vuln catalogues stay out (same discipline as #30–#31).

## 15. Off-Repo Context

- Reserved for founder/partner/travel notes and any additional team deltas before amplify.
- InterServer / DAO node operators: prefer **Node v1.2.3** so `ela rewound` accepts current recovery binaries.

---

### Quick fact card

| Fact | Value |
|---|---|
| Previous report | [#31](https://github.com/Elacity/pc2.net/discussions/31) |
| Node | **v1.2.3** |
| ELA tip | ~**2,267,480** (past gate **2,265,000**) |
| LabsWeb | ~**42** — CodeRED + ops admin |
| Hyper / hey-engine | **6 / 18** |
| drm-api | **0.11 → ESC** (PR #4) |
| elacity-web | **4.5.0** merged on GitHub |
| Runtime | `d358ded` · **0.6 tag still pending** |
| PC2 | docs-only · convergence continues |

---

*Cadence: weekly updates. Previous report — [Week of July 24 – July 31, 2026 (#31)](https://github.com/Elacity/pc2.net/discussions/31).*
