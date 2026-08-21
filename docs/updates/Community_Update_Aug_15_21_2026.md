Elacity Labs — Weekly Team Update for the World Computer Initiative (WCI)

**August 15 – August 21, 2026**

**Last week’s freeze contracts started becoming product surface — Home lock/welcome on the freeze, protected-content custody and Wallet-signed rights in source, marketplace 4.6.1 / drm-api 0.13.0 shipped — while mainchain stays online and ESC / EID / the bridge stay closed on purpose.** Coming out of [#33](https://github.com/Elacity/pc2.net/discussions/33): Home URUX painted onto the freeze (lock face, Profile-first welcome, dock choreography); protected-content moved from v1 authority into published custody / provider / Runtime / rights / Wallet-signing lines; the mint → sell → buy → play journey is a written path, **not** an installed product yet. Marketplace cut **elacity-web 4.6.1** and **drm-api 0.13.0** (aligned on `release/next` as 0.8.3), plus v1 REST **1.13.2**, events-watcher batched getLogs, and edge hardening. **Halborn** is contracted for an independent Secure Code Review of pending mainchain **v1.0.3** (starts 28 August). CRC Incident Recovery for the coordinated KuCoin make-whole is **complete**. Runtime `main` quiet; **0.6 tag still pending**. PC2 product-quiet. ELA tip ~**2,276,945**.

**Chain status:** mainchain producing under BPoS and still being hardened. **ESC and EID are still not ready to restart.** Do not send funds into paused sidechain or bridge flows. [Mainchain postmortem](https://blog.elastos.net/announcement/main-chain-postmortem-august/).

> Home on the freeze · protected-content custody + Wallet-signed rights (source) · marketplace **4.6.1** / drm **0.13.0** · **Halborn** for ELA v1.0.3 · KuCoin CRC path complete · ESC/EID **still closed** · Runtime **0.6 tag pending** · PC2 quiet.

---

## Key Links This Week

- **Previous report** — [Week of August 8 – August 14, 2026 (#33)](https://github.com/Elacity/pc2.net/discussions/33)
- **This discussion** — [#34](https://github.com/Elacity/pc2.net/discussions/34)
- **Elastos status** — [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/) · [honest recovery log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md)
- **Runtime** — [Elacity/elastos-runtime](https://github.com/Elacity/elastos-runtime) · PR **[#16](https://github.com/Elacity/elastos-runtime/pull/16)** collaboration · PR **[#15](https://github.com/Elacity/elastos-runtime/pull/15)** dKMS/ESP · PR **[#23](https://github.com/Elacity/elastos-runtime/pull/23)** Home URUX · PR **[#19](https://github.com/Elacity/elastos-runtime/pull/19)** CI matrix · GitHub Release still **[v0.4.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.4.0)**
- **Marketplace** — elacity-web **4.6.1** · drm-api **0.13.0** / next **0.8.3**
- **Install (PC2 node)** — `bash <(curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/update.sh)`
- **Install (Runtime)** — `curl -fsSL https://elastos.elacitylabs.com/install.sh | bash`
- **Live surfaces** — map.ela.city · portal.ela.city · elacitylabs.com · elacitylabs.com/provenance

## Table of Contents

1. The Big Picture — Freeze Contracts Take Product Shape
2. Elastos Status — Mainchain Online, Halborn Engaged, Sidechains Still Closed
3. Runtime — Home URUX on the Freeze
4. Runtime — Protected-Content Custody, Rights, and Journey Plan
5. Runtime — dKMS / ESP, Logger, and CI Matrix
6. Marketplace — elacity-web 4.6.1, drm-api 0.13.0, Edge & Watchers
7. Essentials Overhaul — Local Review (Not Shipped)
8. PC2 — Quiet by Design
9. Release Engineering
10. Convergence Lens
11. Looking Ahead
12. Summary Statistics
13. Notes

---

## 1. The Big Picture — Freeze Contracts Take Product Shape

#33 wrote the freeze down (collaboration on Iroh 1.0.2, protected-content v1, model-provider P0→P5.2). This week turned those contracts into **implemented source** on the 0.7 feed lines — and the marketplace actually **shipped** version bumps.

**Zeroth — chain doors.** Mainchain is live. ESC, EID, Arbiter, and the bridge stay closed. Halborn is engaged for an independent review of pending mainchain **v1.0.3**. That is not a reopen, and it is not “trust us.” See §2.

**First — Home became a real front door on the freeze.** Lock face as sign-in, Profile-first welcome (Recovery skippable), restored lock picker, dock and Agent Space choreography, first-run desktop philosophy kept inside the freeze model. PR **#23** is the review path.

**Second — protected-content left the v1 document and entered published source.** Custody envelopes and threshold shares, one-node protocol, custody-provider process, Runtime release coordination and recovery, Wallet-signed exact rights requests, chain-bound rights evidence, typed approvals/denials. **This is still source development** — not an installed mint / buy / open / play journey. A reconstruction step still has to move behind a private decrypt-provider boundary before that path can activate. See §4.

**Third — marketplace shipped.** elacity-web **4.6.0 → 4.6.1** (perf, city vocabulary, wallet/UA seams, CI). drm-api **0.13.0** on base-network, aligned to **0.8.3** on `release/next`. v1 REST **1.13.2**. events-watcher batched getLogs. Edge CSP / HTTP-2 / internal-action blocking. See §6.

**Also:** `elastos-logger` PoC + first dKMS consumers; ESP Create → mint → open repaired; system map merged into `review/collaboration-candidate`; cross-platform source-home CI (Linux x64/arm64, Apple silicon, experimental Windows).

## 2. Elastos Status — Mainchain Online, Halborn Engaged, Sidechains Still Closed

*Public framing only. Finding registers, live-defect recipes, and unpublished recovery trees stay inside the recovery engagement — same discipline as [#32](https://github.com/Elacity/pc2.net/discussions/32)–[#33](https://github.com/Elacity/pc2.net/discussions/33).*

### What is open vs shut

| Surface | Status |
|---|---|
| **Mainchain** | Online under BPoS · tip ~**2,276,945** · still being hardened |
| **Pending mainchain review** | **Halborn** Secure Code Review of **v1.0.3** — starts **28 August**, report targeted early October · Elastos.ELA only this round |
| **ESC / EID / Arbiter / bridge** | **Closed** — **not ready to restart** |
| **Bridge / paused sidechain deposits** | Do not send funds until official reopen |
| **CRC Incident Recovery (KuCoin flow)** | **Complete** — coordinated make-whole processed and confirmed received. If you were affected and have not heard from KuCoin, contact their support with your case details. Separate exchange follow-up remains in proper channels. |

Long form: [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/) · [honest recovery log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md).

### External audit (community-safe)

We compared established firms and contracted **Halborn** for an independent Secure Code Review of the pending mainchain release (**v1.0.3**). Scope this round is **Elastos.ELA only**: post-incident hardening (consensus and merged-mining, reorg and mode transitions, P2P/RPC resilience, activation and mixed-fleet checks), static review plus dynamic testing against a running node where required. SPV, Arbiter, and sidechains are **not** in this pass. We will post again when the engagement is underway and when there is a public certificate to point to.

### Layers

Mainchain remains live after the July response. ESC, EID, and the Arbiter bridge remain offline **on purpose**. Public GitHub for those trees did not move this week — recovery work stays private until it is safe to publish. Operator toolkit remains **Elastos.Node v1.2.3**.

## 3. Runtime — Home URUX on the Freeze

Home URUX and agent-harness rebuild lines carried the shell work. The paint landing puts house URUX onto freeze contracts (shared `elastos-ui.css`, capsule assets, workflow-tests). Sign-in is now a first-class surface: lock face, lock picker from the unsigned passkey directory, crossfade, name off the hit target, Profile-first welcome with Recovery skippable. Dock / shelf / Agent Space choreography and first-run desktop philosophy sit on the same freeze.

PR **[#23](https://github.com/Elacity/elastos-runtime/pull/23)** — Home URUX onto freeze contracts. Entropy / public-copy gates stay in the harness preview so demos stay honest.

This is the local Home front door + passkey-bound accounts story from last cycle, continued — **pre-release engineering**, not a consumer launch claim.

## 4. Runtime — Protected-Content Custody, Rights, and Journey Plan

Last week defined the security rules. This week published many of the components that enforce them — still **not** one installed product flow.

**What is published for review**

- Custody: encrypt content; split key control across approved nodes; each node stores only its sealed share; threshold of distinct nodes; each node checks the exact signed request before contributing. Provider responses and diagnostics do not expose raw shares or content keys.
- Custody-provider process, private protocol, node-local share storage, authenticated chunk payloads, local decrypt output boundary.
- Runtime: record release operations before contacting providers; track what each provider may already have done; on restart / timeout / lost response, reconcile the existing operation instead of repeating an uncertain effect (matters for key release and payments).
- Wallet signs an exact content-access request for a selected account.
- Chain evidence bound to approved contract, method, transaction, and finalized block.
- Rights service returns a signed approval or denial tied to exact content, account, action, recipient, and Runtime operation.

**Honest limits**

- Parts are tested separately; they are **not** yet one installed mint → buy → open → play journey.
- One reconstruction API still needs to move behind a **private decrypt-provider** boundary before the product path activates.
- A local mint/buy exploration exists and is **not** the accepted integration line (wrong boundary: cryptography or secret-bearing state inside Runtime). It will not enter the product path as-is.
- The stack started on an earlier collaboration candidate. Accepted work needs a deliberate land onto the current 0.7 base, then one inactive path that replaces the provisional 0.6 implementation atomically.

**Journey plan** — mint → sell → buy → play is written as a vision-aligned implementation path on the trust-core foundation (PR **[#22](https://github.com/Elacity/elastos-runtime/pull/22)** draft). Reviewers can hold the product story; the installer does not offer it yet.

**Architecture map** — system map (C4, interactive viewer, code-path index, agent architecture) merged into `review/collaboration-candidate`. Same authority model for people and agents: an agent can propose; it cannot approve its own request or bypass Runtime. That applies to payments, rights, and any effect that may stay uncertain after a timeout.

**Next accepted line:** Runtime selects providers, coordinates, records durable identities, audits effects. Custody providers own share storage. Decrypt provider owns reconstruction and decryption. Runtime durable state does not store content keys, shares, or encrypted payloads. Capsules do not receive keys, shares, routes, or network details.

## 5. Runtime — dKMS / ESP, Logger, and CI Matrix

**dKMS / ESP (PR #15 still open)** — Create → mint → open dDRM flow repaired; protected assets open in the ESP shell via connector-signed grants; `elastos-logger` 5-level pluggable sinks (PoC) with first consumers in `dkms-authority` / `dkms-carrier-node`; verify-ci repaired after Create-portal wallet rewire. Logger extracted toward PR **[#25](https://github.com/Elacity/elastos-runtime/pull/25)**. Browser-local-exit reaped when its launching Runtime dies (PR **[#24](https://github.com/Elacity/elastos-runtime/pull/24)**).

**CI** — source-gate / source-home on Linux x86_64, Linux arm64, Apple silicon; experimental Windows source gate (LF token gates, Git Bash `/api` rewrite disabled, POSIX path compare). Interactive Home checks through a PTY on headless runners. Isolated collaboration mode for source-home jobs. coturn provisioned on Apple silicon. PR **[#19](https://github.com/Elacity/elastos-runtime/pull/19)**.

**PRs #16 / #17** — collaboration still the 0.7 integration path (#16 updated). Model-provider (#17) did not move this window — last cycle’s P5.2 stack holds.

## 6. Marketplace — elacity-web 4.6.1, drm-api 0.13.0, Edge & Watchers

Indexer readiness and storefront shipping — **not** an ESC reopen.

### elacity-web — 4.6.0 → 4.6.1

Release train on `release/base-network`: city vocabulary (channels → shops), Particle wallet stack deferred, DRM ContentReader lazy-loaded, service-worker precache trimmed, monolith splits (SendModal, ArtAssetView, ActivityTable, and siblings), unused-dep prune, eslint/jest PR gates, Jest memory management. Auth: GraphQL JWT expiry → single-flight re-login. Subscribe/UA/EOA unblocked. Then **4.6.1**: museum-grid thumbs (not 14MB originals), lazy media-player, UA receipt / portal lists follow the active account. Home card stills PR still open.

### drm-api-layer — 0.13.0 / next 0.8.3

JWT TTL 14d → 24h; rate / GraphQL depth / body limits; listing and offer event batching; trade-history duplicate-key on reorg; cacher freshness tests; royalty Assets parity; CI gates. Review follow-ups: duplicate trade-history delivery, batched sold-accumulation joins, error containment on batched offers. `release/next` aligned to the 0.13 pack (0.8.3) with deploy via `update.py`.

### Adjacent infra

| Surface | What |
|---|---|
| **v1 REST** | **1.13.2** — survive non-array `eth_getLogs`; Base 8453 genesis; Mongo credential redaction; Node 22 package mgmt |
| **events-watcher** | Batch `eth_getLogs` onto one scheduler (no per-shop poll loop). Tracker-cap PR still open |
| **docker-arch** | Block public access to internal Moleculer `$`-actions at the edge; CSP snippets; HTTP/2 + gzip + immutable `/assets/` in flight; pin events-watcher image |
| **LabsWeb** | About / team strip; Provenance under Services — supporting site, not the headline |

Hyper and hey-engine were quiet this window (last week’s migration/radio landings still the live mesh story).

## 7. Essentials Overhaul — Local Review (Not Shipped)

Broad backward-compatibility, custody, UX, and dependency review of the Essentials overhaul. Work is **local and uncommitted** — not a store release.

What we can say: automated test / CI / lint / translation / SBOM gates restored; wallet SDK state bound to the correct profile and network; profile transitions serialized; owner-bound WalletConnect; All Chains uses detached public balance snapshots; sign-out and App Lock drain sensitive work; safer scanner/QR/backup UX; translation parity; Ledger/TronWeb/DID-transport dependency hygiene. Latest completed full-suite checkpoint **393/393**. Owner data, keys, and funds were not used in verification.

Still open and **not** claimed done: RPC trust migration, Bitcoin blind-signing consent, and related items await independent review; Hive removal is mapped, not coded; store-build and device checks remain. Previously known Essentials issues from earlier reviews are not “cleared” by this week’s local work.

## 8. PC2 — Quiet by Design

One landing on `main`: the Aug 8–14 weekly. No product commits. Operator line **v1.4.0**. Convergence holds: PC2 receives finished contracts. First seams when it opens: dDRM viewer path and marketplace buy/trade against Wallet-signed rights.

## 9. Release Engineering

| Item | Status |
|---|---|
| Runtime `main` | Quiet (tip still `d358ded`) |
| Runtime GitHub Release **v0.6.0** | **Still pending** (latest **v0.4.0**) |
| Active Runtime reviews | #16 collaboration · #15 dKMS/ESP · #19 CI · #23 Home URUX · #24 orphan reap · #25 logger |
| Marketplace | web **4.6.1** · drm **0.13.0** / next **0.8.3** · v1 REST **1.13.2** |
| Elastos.Node | **v1.2.3** |
| Mainchain third-party review | Halborn · v1.0.3 · starts 28 Aug |
| ESC / EID / bridge | **Closed** |

## 10. Convergence Lens

| Theme | Runtime | Marketplace / PC2 / chain |
|---|---|---|
| Home / lock / welcome | URUX on freeze · PR #23 | — |
| Protected-content | Custody + rights + Wallet sign (source) | Eventual dDRM / buy-trade consumer |
| mint → sell → buy → play | Journey plan · not installed | Shared design intent |
| dKMS / ESP | Flow repair · logger PoC | ESP shell grants |
| Storefront | — | **4.6.1** + drm **0.13.0** + watchers/edge |
| Chain | — | Mainchain live · Halborn · ESC/EID closed · KuCoin CRC complete |
| PC2 | — | Quiet · v1.4.0 |

## 11. Looking Ahead

1. **Halborn** engagement start (28 August) — community-safe update when underway
2. Open / land stacked reviews for custody + rights + Wallet-rights on the current 0.7 collaboration base
3. Move reconstruction behind the private decrypt-provider boundary; one inactive product path; no dual implementations
4. Home URUX candidacy behind `review/collaboration-candidate`; entropy gates on the CI matrix
5. Runtime **0.6 tag** still outstanding
6. Windows source gate: another clean cycle before it gates
7. Marketplace: soak 4.6.1 / 0.13.0; Home card stills; events-watcher tracker cap
8. ESC / EID / bridge: private repair continues — **no reopen until the bar is met**
9. Essentials: independent custody review before production changes; nothing claimed shipped
10. **PC2:** quiet unless operator-critical

## 12. Summary Statistics

**Week of** August 15 – August 21, 2026.

| Area | Activity | Notes |
|---|---|---|
| Runtime Home / URUX | Heavy | Lock face · welcome · dock · PR #23 |
| Runtime protected-content | Heavy | Custody · rights · Wallet sign · journey plan (source) |
| Runtime dKMS / ESP / CI | Active | Flow repair · logger · source-home matrix · PRs #15 #19 #24 #25 |
| Runtime `main` | Quiet | Tip unchanged |
| elacity-web | Shipped | **4.6.0 → 4.6.1** |
| drm-api-layer | Shipped | **0.13.0** / next **0.8.3** |
| v1 REST / watchers / edge | Shipped | **1.13.2** · batched getLogs · CSP / `$`-action block |
| Hyper / hey-engine | Quiet | — |
| Essentials | Local only | Overhaul uncommitted |
| Chain | Public GitHub quiet | Halborn contracted · KuCoin CRC complete · ESC/EID closed |
| PC2 | Quiet | Weekly docs only |
| ELA tip | ~**2,276,945** | Mainchain online |

- **People:** Anders Alm (protected-content, rights, Runtime coordination) · SashaMIT (Home URUX, marketplace perf/CI, edge) · Irzhy Ranaivoarivony (drm 0.13, web 4.6.1, dKMS/ESP, v1 REST, docker-arch) · Essentials overhaul (local) · chain recovery / Halborn coordination
- **GitHub Releases/tags:** none new on Runtime or PC2 · in-repo marketplace version bumps as above · Node still **v1.2.3**

## 13. Notes

- **Chain recovery internals** stay out (registers, recipes, unpublished trees). Halborn scope and KuCoin CRC completion are the community-safe facts this week.
- **Protected-content** is source review, not an installed journey. Unpublished local mint/buy drafts are not the accepted line.
- **Essentials** work is local; no store claim; no finding dump.
- Settlement counterparty detail beyond “KuCoin flow processed” stays in proper channels.

---

### Quick fact card

| Fact | Value |
|---|---|
| Previous / this | [#33](https://github.com/Elacity/pc2.net/discussions/33) · [#34](https://github.com/Elacity/pc2.net/discussions/34) |
| Home | URUX on freeze · lock + welcome |
| Protected content | Custody + Wallet-signed rights (source) |
| Marketplace | web **4.6.1** · drm **0.13.0** |
| Halborn | ELA **v1.0.3** · starts 28 Aug |
| KuCoin CRC | Complete |
| Mainchain / ESC | Online · ESC/EID **still closed** |
| Runtime tag | **0.6 still pending** |
| PC2 | Quiet · v1.4.0 |

---

*Cadence: weekly updates. Previous report — [Week of August 8 – August 14, 2026 (#33)](https://github.com/Elacity/pc2.net/discussions/33). This report — [#34](https://github.com/Elacity/pc2.net/discussions/34).*
