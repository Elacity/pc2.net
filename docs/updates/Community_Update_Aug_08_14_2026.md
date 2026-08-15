Elacity Labs — Weekly Team Update for the World Computer Initiative (WCI)

**August 8 – August 14, 2026**

**Runtime rebuilt its social and content foundations this week — collaboration, Profile/People/Chat, protected-content contracts, model-provider, and dKMS hardening — while mainchain stays online and ESC / EID / the bridge stay closed on purpose.** Coming out of [#32](https://github.com/Elacity/pc2.net/discussions/32): **`review/collaboration-candidate`** lands a signed network protocol, Runtime-owned Carrier transport on **Iroh 1.0.2**, Profile authority / contacts / Profile-bound chat, and Home shell chrome; **`feat/protected-content-contracts`** (plus custody follow-ons) publishes the v1 authority and threat model so apps never see raw unlock keys; **`feat/model-provider-rebase`** ships the offers/runs contract through **P5.2** (openai_compat + h3_video, principal-scoped grants, agent harness on the frozen collaboration base); **`feat/dkms-esp-port`** remediates **DKMS-1..8** and closes marketplace **ESP-1/2** buy/trade seams. Open Runtime PRs: **[#16](https://github.com/Elacity/elastos-runtime/pull/16)** collaboration → `upstream/0.7-dev`, **[#17](https://github.com/Elacity/elastos-runtime/pull/17)** model-provider, **[#15](https://github.com/Elacity/elastos-runtime/pull/15)** dKMS/ESP (being split into stacked reviews). **Hyper + hey-engine** shipped a heavy migration / radio / DM week. **drm-api** REST + CI guards landed on both release lines. **PC2** stayed product-quiet. Runtime **`main`** quiet; **0.6 tag still pending**. ELA tip ~**2,272,410**.

**Chain status:** mainchain producing under BPoS and still being hardened. Private recovery work on ESC / EID / Arbiter advanced substantially this week (gated safety code exercised in private nets; bridge containment and repair progress) — **ESC and EID are still not ready to restart.** Do not send funds into paused sidechain or bridge flows. Details that stay public: [mainchain postmortem](https://blog.elastos.net/announcement/main-chain-postmortem-august/).

> Collaboration on **Iroh 1.0.2** · Profile / People / Chat · protected-content v1 · model-provider **P0→P5.2** · **DKMS-1..8** + **ESP-1/2** · Hyper migration · drm REST/CI guards · ESC/EID **still closed** · Runtime **0.6 tag pending** · PC2 quiet.

---

## Key Links This Week

- **Previous report** — [Week of August 1 – August 7, 2026 (#32)](https://github.com/Elacity/pc2.net/discussions/32)
- **This discussion** — [#33](https://github.com/Elacity/pc2.net/discussions/33)
- **Elastos status** — [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/) · [honest recovery log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md)
- **Runtime** — [Elacity/elastos-runtime](https://github.com/Elacity/elastos-runtime) · PR **[#16](https://github.com/Elacity/elastos-runtime/pull/16)** collaboration · PR **[#17](https://github.com/Elacity/elastos-runtime/pull/17)** model-provider · PR **[#15](https://github.com/Elacity/elastos-runtime/pull/15)** dKMS/ESP · GitHub Release still **[v0.4.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.4.0)**
- **Marketplace** — drm-api REST + CI guards on `release/next` + `release/base-network`
- **Hyper lane** — [Elacity/Hyper](https://github.com/Elacity/Hyper) · [Elacity/Hey-engine](https://github.com/Elacity/Hey-engine)
- **Install (PC2 node)** — `bash <(curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/update.sh)`
- **Install (Runtime)** — `curl -fsSL https://elastos.elacitylabs.com/install.sh | bash`
- **Live surfaces** — map.ela.city · portal.ela.city · elacitylabs.com · elacitylabs.com/provenance

## Table of Contents

1. The Big Picture — Runtime Rewires Its Foundations
2. Elastos Status — Mainchain Online, Sidechains Still Closed
3. Runtime — Collaboration Transport on Iroh 1.0.2
4. Runtime — Profile, People, Chat & Home Chrome
5. Runtime — Protected-Content Contracts (+ Custody Follow-On)
6. Runtime — Model-Provider Contract (P0 → P5.2) & Sparks H3
7. Runtime — dKMS / ESP Hardening (DKMS-1..8, ESP-1/2)
8. Marketplace & Adjacent Hardening
9. Hyper + Hey-engine — Migration, Radio, DMs
10. Supporting Ops — Continuous Monitoring Admin (Grant Lane)
11. PC2 — Quiet by Design
12. Release Engineering
13. Convergence Lens
14. Looking Ahead
15. Summary Statistics
16. Notes

---

## 1. The Big Picture — Runtime Rewires Its Foundations

This was a **Runtime-heavy** week by design. PC2 stayed quiet; Runtime `main` stayed quiet; the work landed on review and feature lines that will feed **0.7**.

**Zeroth — chain doors.** Mainchain is online. ESC, EID, Arbiter, and the bridge remain closed to normal user activity. Private recovery engineering advanced (see §2) — that is not a reopen announcement.

**First — collaboration has a shape.** Signed network protocol, Runtime-owned Carrier lifecycle, move to **Iroh 1.0.2**, Profile authority / discovery / contacts, Profile-bound chat, Home chrome alignment. That candidate is frozen enough that model-provider and agent-harness work stacked on top of it rather than chasing a moving base. PR **#16** is the integration path into `upstream/0.7-dev`.

**Second — protection got a written contract.** Protected-content **v1** authority and threat model: what must be signed for access, owner-bound grants, bounded node release decisions, recipient-sealed contributions, authenticated terminal receipts — **without exposing raw decryption keys to apps**. Custody reconstruction work continues on a follow-on line. Separately, **DKMS-1..8** remediation and marketplace **ESP-1/2** seams closed on `feat/dkms-esp-port`.

**Third — the AI surface got a real contract.** Model-provider offers/runs, openai_compat + h3_video adapters, principal-scoped grant gates, control-plane registration, and a contract-native agent harness browser port on the frozen collaboration base (P0→P5.2). Sparks H3 dogfood continued in parallel.

**Also this week:** Hyper / hey-engine migration and mesh hardening; drm-api REST exposure + CI guards; marketplace-adjacent security bumps (elacity-web, ddrm-reader); grant-lane monitoring admin polish (secondary).

## 2. Elastos Status — Mainchain Online, Sidechains Still Closed

*Public framing only. Internal recovery registers and live-defect detail stay inside the recovery engagement — same discipline as [#32](https://github.com/Elacity/pc2.net/discussions/32).*

### What is open vs shut

| Surface | Status |
|---|---|
| **Mainchain** | Online under BPoS · tip ~**2,272,410** · still being hardened |
| **ESC / EID / Arbiter / bridge** | **Closed** to normal user activity — **not ready to restart** |
| **Bridge / paused sidechain deposits** | Do not send funds until official reopen |

Long form: [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/) · [honest recovery log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md).

### Recovery progress this week (high level)

Private engineering on ESC, EID, and the Arbiter / bridge advanced well ahead of what is published on public GitHub. In plain terms:

- Height-gated safety rules for the sidechains were **exercised for the first time** in private multi-producer networks (they sit above where the chains stopped, so they had never run on live history). Checks confirmed gated code runs at the switch, does not fire early, and does not disturb prior block verdicts when re-read.
- Bridge work closed a set of high-urgency containment and money-path defects in the private tree, and added the ability to **pause or stop one sidechain at a time** without shutting the entire bridge — containment tooling, not a reopen.
- A council-snapshot / signature-counting defect that would have frozen private test nets after a duty rotation was found and fixed **before** it could ship.
- Coordination continued with auditors (frozen packages for review), council operators, partners, and community assistance channels. **No live production systems were touched** for these unpublished trees; operators cannot obtain this work from public GitHub yet.
- **Elastos Essentials:** a multi-model security pass found **no remote-execution vulnerability**. Previously known Essentials issues remain open — this pass does not clear the wallet.
- An Elastos **domain infrastructure** issue reported by a white-hat researcher was **found and fixed**. Details stay internal until any formal announce.

**Bottom line unchanged for users:** mainchain back ≠ bridge open. ESC and EID restart still waits on remaining open money-path and shared-library work that cannot all be closed from the sidechain trees alone. Do not grow stuck balances into closed rooms.

### Mainchain packaging

Public mainchain GitHub remains quiet by design while point-release / audit packaging continues. Operator toolkit remains **Elastos.Node v1.2.3**. Formal Runtime **0.6** tag is a separate packaging item (§12).

## 3. Runtime — Collaboration Transport on Iroh 1.0.2

Anders’ collaboration landings are the load-bearing move of the cycle — split across foundation / product-integration / **candidate**, then opened as PR **[#16](https://github.com/Elacity/elastos-runtime/pull/16)** → `upstream/0.7-dev`.

**Transport & protocol**

- Signed network protocol for collaboration
- Runtime-owned Carrier transport + lifecycle ownership
- Move collaboration Carrier to **Iroh 1.0.2**
- Capsule resource-boundary clarification

**Acceptance & closeout**

- Deterministic product acceptance tests across two independent Runtime environments
- Candidate truth / localhost closeout docs — what the line will and will not sign for
- Hide Carrier endpoint identity in the browser; provision explicit collaboration mode

**Product story:** create a profile, choose discoverability, send/approve contact requests, start a direct conversation, update name, remove and re-add contacts; profile / contacts / conversations survive restart. People, Chat, and Inbox read as one system — names and conversations, not device addresses. Same app-facing contract for same-device and cross-device delivery; Runtime owns identity, permissions, and the actual transport.

## 4. Runtime — Profile, People, Chat & Home Chrome

**Profile / People:** signed Profile authority, bounded discovery, contact store, recovery integration, packaged Profile products.

**Chat:** Profile-bound conversations, direct/shared UI, conversation routes, same-endpoint delivery looped through Carrier.

**Auth hardening:** safer verified AuthState caching; protected authority root prepared owner-only.

**Home shell chrome (Aug 11–13):** finish shell visuals/assets, canonical window chrome modes, align first-party apps to Home chrome, restore collaboration chrome + system bar after merges, keep access origin at the HTTP edge, local source setup guide.

## 5. Runtime — Protected-Content Contracts (+ Custody Follow-On)

**`feat/protected-content-contracts`** (Aug 13) writes the **v1 authority and threat model** down:

- Canonical content identities
- Owner-bound rights grants
- Bounded node release decisions
- Recipient-sealed node contributions
- Authenticated terminal release receipts
- Canonical DID key authority

Framing: pins who can grant, what the release condition is, who the release is sealed to, and how the receipt is authenticated — **apps must not receive the raw unlock key**. Full custody nodes, key release, decryption, and playback UX follow as separate pieces.

**Follow-on this week:** `feat/protected-content-custody` continued with canonical custody envelopes, sealed shares for verified releases, threshold reconstruction, and contract-key validation — building on the collaboration candidate.

## 6. Runtime — Model-Provider Contract (P0 → P5.2) & Sparks H3

Sasha’s model-provider stack went from bare offers/runs to a live harness port in one cycle, stacked on the frozen collaboration base (PR **[#17](https://github.com/Elacity/elastos-runtime/pull/17)**).

| Band | What landed |
|---|---|
| **P0–P3** | offers/runs contract · openai_compat + h3_video adapters |
| **P4** | principal-scoped grant gate on model `runs_create` |
| **P4.5** | dogfood plumbing + capsule · home-agent chat/studio via contract · KaTeX |
| **P5.1** | contract-era Studio library gateway |
| **P5.2** | contract-native agent harness browser port · selective port onto frozen collaboration-candidate |
| **Setup** | model-provider as first-class provider · control-plane spawn path · flat offer shape · persist agent workspace |
| **Aug 14 tighten** | service-record offers · honest unconfigured state · run-registry eviction · grant-enforcement tests |

**Sparks H3 dogfood** (`experiment/home-studio-h3-dogfood`) continued in parallel: 30s Generate, Studio declutter, chat polish, capsule UI ports — the surface the model contract is being validated against.

Also opened: PR **[#18](https://github.com/Elacity/elastos-runtime/pull/18)** — ElastOS picture map docs (read order, tree, glossary, gates) on the collaboration candidate.

## 7. Runtime — dKMS / ESP Hardening (DKMS-1..8, ESP-1/2)

Irzhy on **`feat/dkms-esp-port`** (PR **[#15](https://github.com/Elacity/elastos-runtime/pull/15)**):

- Remediate reviewed **DKMS-1..8** security findings
- Close marketplace buy/trade content-id seams **ESP-1** / **ESP-2** (fail-open trade-approval and legacy Library re-buy ownership bugs — fixed same day after triage of external review)
- Offline **migrate-audit-chain** for pre-hardening data roots
- Deterministic settlement for the elastos-server flake family
- Drop unused v1 seal test helper

**Governance note:** the branch is moving away from a single-shot merge toward **stacked, reviewable extractions** on the collaboration-candidate base — smaller signable landings.

External review triage this week: confirmed findings fixed with acceptance criteria; non-reproducible / already-shipped items dispositioned with evidence; remaining Anders-review items distilled into a tracked plan (extraction strategy, Carrier end-state for dKMS quorum transport, Wallet account binding, installer registry, trusted Runtime slim-down, docs truth pass).

## 8. Marketplace & Adjacent Hardening

### drm-api-layer

REST exposure hardening (restrict automatic mapping of services/actions) plus **CI build-step checks** that guard against exposing server-key-signed payable actions without authorization — applied in parallel to **`release/next`** and **`release/base-network`**. Wave-2 gateway / rate-depth / royalty branches also moved.

### Adjacent

| Repo | What |
|---|---|
| **elacity-web** | Sanitize mint-form error HTML · harden `target=_blank` |
| **ddrm-reader** | Bump pdfjs-dist **5.7.284 → 6.2.108** in reader UI |
| **events-watcher** | Quiet this window (tracker-cap work remains from prior cycle) |

Reminder: marketplace indexer readiness against ESC is **not** an ESC reopen.

## 9. Hyper + Hey-engine — Migration, Radio, DMs

A major mesh / social week that the Runtime-only draft under-weighted.

### Hyper (~22)

Migration path hardened end-to-end: receiver creates the group, join as Wi-Fi client, wait for FORM before credentials, keep listening across retries, auto-connect + percentage that does not mean “done” at 100%, restart on arrival, erase once verified, direction naming in UI, stop radio leaks, BUSY path actually called, JNI symbol check on every APK (caught crash declarations).

### Hey-engine (~33)

Radio address-store / re-advertise fixes; contact-add without a route no longer leaves pairs unable to open a conversation; attachments no longer report success when half the files drop; DMs sent while Carrier is starting keep a route; migration receive/send hardening and unauthenticated allocation bounds; receiver enforces policy instead of trusting the sender; dead-code and helper clone cleanup.

## 10. Supporting Ops — Continuous Monitoring Admin (Grant Lane)

**Secondary.** Grant-backed continuous monitoring admin for **our ecosystem** repos (findings → human review → fix PRs) after the July incident stack — not a headline, not third-party hunting.

This week: finish cookie-only session + login rate-limit; verify Postgres TLS certificates in production.

## 11. PC2 — Quiet by Design

Product landings: none. Operator line remains **v1.4.0**. Convergence plan keeps PC2 in receive-mode while Runtime rewires the substrate. Prior weekly (#32) publish/edits already on `main` from last cycle.

## 12. Release Engineering

| Item | Status |
|---|---|
| Runtime `main` | Quiet (tip still `d358ded` from prior cycle) |
| Runtime GitHub Release **v0.6.0** | **Still pending** (latest published **v0.4.0**) |
| Active integration paths | PR **#16** → `upstream/0.7-dev` · PR **#17** stacked on collaboration · PR **#15** splitting into stacked reviews |
| Iroh **1.0.2** | Largest dependency move this cycle — note for any future 0.6/0.7 cut |
| Elastos.Node | **v1.2.3** (unchanged) |
| ESC / EID / bridge user reopen | **Closed** — private trees ahead of public GitHub; not operator-ready |

## 13. Convergence Lens

| Theme | Runtime | PC2 / marketplace |
|---|---|---|
| Collaboration transport | PR #16 — Iroh 1.0.2, Runtime-owned Carrier | — |
| Profile / People / Chat | Signed authority, contacts, Profile-bound chat | — |
| Protected content | v1 contracts + custody follow-on | Eventual dDRM / marketplace consumer |
| Model-provider | PR #17 — P0→P5.2 | — |
| dKMS / ESP | DKMS-1..8, ESP-1/2, migrate-audit-chain | Marketplace seams are the pair on ESP-1/2 |
| Mesh / mobile | — | Hyper migration · hey-engine radio/DMs |
| Chain recovery | — | Mainchain online · ESC/EID closed · private repair progress |
| PC2 node | — | Quiet · v1.4.0 |

One-sided by design: substrate rebuilds on Runtime; PC2 receives finished contracts rather than chasing moving APIs.

## 14. Looking Ahead

1. Land **PR #16** (collaboration → `upstream/0.7-dev`) — first meaningful 0.7 merge
2. Split **PR #15** into stacked reviews on the collaboration base
3. First review pass on **PR #17** (model-provider) now that P5.2 is in
4. Runtime **0.6 tag** — still outstanding; coordinate with Iroh 1.0.2 hygiene
5. Protected-content: continue custody / key-release pieces without exposing raw keys to apps
6. Chain recovery: continue private ESC/EID/Arbiter repair and rehearsal — **no reopen until the bar is met**; keep finding registers internal
7. Marketplace: soak drm REST/CI guards on both release lines
8. Hyper: finish migration UX polish; F-Droid / one-edition distribution path
9. Supporting ops (grant): keep ecosystem monitoring → review → fix-PR loop honest
10. **PC2:** stay quiet unless operator-critical; first convergence seams against frozen collaboration-candidate when ready (candidates: dDRM viewer path, marketplace buy/trade)

## 15. Summary Statistics

**Week of** August 8 – August 14, 2026.

| Area | Activity | Notes |
|---|---|---|
| Runtime collaboration | Heavy | PR #16 · Iroh 1.0.2 · Profile/Chat/Home |
| Runtime protected-content | Heavy | v1 contracts + custody follow-on |
| Runtime model-provider | Heavy | P0→P5.2 · PR #17 · Sparks H3 dogfood |
| Runtime dKMS/ESP | Active | DKMS-1..8 · ESP-1/2 · PR #15 |
| Runtime `main` | Quiet | No new landings |
| Hey-engine | Heavy (~33) | Migration · radio · DMs · attachments |
| Hyper | Heavy (~22) | Migration UI / path · JNI checks |
| drm-api-layer | Active | REST hardening + CI guards (both release lines) |
| elacity-web / ddrm-reader | Light | XSS/tabnabbing · pdfjs bump |
| LabsWeb (grant) | Light | Cookie session · Postgres TLS |
| Chain recovery (private) | Heavy | ESC/EID/Arbiter private trees · **not ready to restart** |
| PC2 | Quiet | Convergence discipline |
| ELA tip | ~**2,272,410** | Mainchain online |

- **People:** Anders Alm (collaboration, Profile/Chat, Home, protected-content) · SashaMIT (model-provider, harness, Sparks, LabsWeb) · Irzhy Ranaivoarivony (dKMS/ESP, drm-api) · HeyElastos / EverlastinOS (Hyper, hey-engine) · chain recovery technical team (private)
- **Releases / tags:** none new on Runtime or PC2 · Node still **v1.2.3** · Runtime latest GitHub Release **v0.4.0**
- **Elastos org:** readable; public sidechain/Arbiter tips unchanged — private recovery work sits ahead of published GitHub

## 16. Notes

- **Chain recovery internals** (finding registers, live defect recipes, custody figures, unpublished commit counts as an exploit map) stay **out** of this public weekly. Sequencing and status only.
- **Domain infrastructure fix:** acknowledged as fixed; no technical detail until any formal announce.
- **Essentials:** no RCE found in the multi-model pass; prior open issues remain open.
- Settlement figures, LE detail, and private vulnerability catalogues stay out (same discipline as #30–#32).

---

### Quick fact card

| Fact | Value |
|---|---|
| Previous / this | [#32](https://github.com/Elacity/pc2.net/discussions/32) · [#33](https://github.com/Elacity/pc2.net/discussions/33) |
| Collaboration | Iroh **1.0.2** · PR **#16** |
| Profile / Chat | End-to-end on collaboration candidate |
| Protected content | v1 authority + custody follow-on |
| Model-provider | **P0→P5.2** · PR **#17** |
| dKMS / ESP | DKMS-1..8 · ESP-1/2 · PR **#15** |
| Hyper / hey-engine | Migration week |
| Mainchain / ESC | Online · ESC/EID **still closed** |
| Runtime tag | **0.6 still pending** |
| PC2 | Quiet · v1.4.0 |

---

*Cadence: weekly updates. Previous report — [Week of August 1 – August 7, 2026 (#32)](https://github.com/Elacity/pc2.net/discussions/32). This report — [#33](https://github.com/Elacity/pc2.net/discussions/33).*
