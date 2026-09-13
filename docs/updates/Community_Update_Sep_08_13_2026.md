Elacity Labs — Weekly Team Update for the World Computer Initiative (WCI)

**September 8 – September 13, 2026**

**0.7.1 moved from open review PRs to a merged integration line.** **[#58](https://github.com/Elacity/elastos-runtime/pull/58)** landed on `upstream/0.7.1-dev` (8 September) and rolled up last week’s Home / custody review surfaces (**[#52](https://github.com/Elacity/elastos-runtime/pull/52)**, **[#54](https://github.com/Elacity/elastos-runtime/pull/54)**). On top of that: Runtime-owned protected-content authority (legacy path removed in the same cut), non-media objects on the same envelope, a first-party storefront and canonical Home entry in source, one-command install that opens Home, passkey / Recovery Kit order made durable, a rebuilt signature-verified publisher, Creator on the dkms form, and a unified Assistant with a real local-model reply on an installed Mac. **[#64](https://github.com/Elacity/elastos-runtime/pull/64)** is the review checkpoint. Marketplace cut **elacity-web 4.6.8** (CI/CD + type gate; landed 7 September after #36 closed). Hey kept VPN mid-ack honest. **Halborn** on mainchain **v1.0.3** still underway. ESC / EID stay **open** per the 1 September notice; PG cross-chain stays **off**. `main` is still **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)** — no 0.7.1 tag. PC2 product-quiet. ELA tip ~**2,293,627**.

**Chain status:** mainchain producing under BPoS. ESC and EID producing; main ↔ ESC / EID open. **PG / PGP cross-chain ELA stays disabled.** Halborn’s independent review of pending **v1.0.3** continues (Elastos.ELA only this round). Exchanges that froze ESC / EID deposits should contact the Elastos DAO before reopening. [Sidechains resume](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem](https://blog.elastos.net/announcement/main-chain-postmortem-august/).

> **0.7.1 integration merged** · Runtime-owned authority · storefront + install in source · Assistant + local model · web **4.6.8** · **Halborn underway** · ESC/EID **open** · no 0.7.1 tag · PC2 quiet.

---

## Key Links This Week

- **Previous report** — [Week of August 29 – September 7, 2026 (#36)](https://github.com/Elacity/pc2.net/discussions/36)
- **This discussion** — [#37](https://github.com/Elacity/pc2.net/discussions/37)
- **Elastos status** — [Sidechains resume (1 Sep)](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/) · [honest recovery log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md)
- **Runtime** — [Elacity/elastos-runtime](https://github.com/Elacity/elastos-runtime) · **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)** still latest tag · **[#58](https://github.com/Elacity/elastos-runtime/pull/58)** merged · review **[#64](https://github.com/Elacity/elastos-runtime/pull/64)** · cutover **[#59](https://github.com/Elacity/elastos-runtime/pull/59)** · e2e proof **[#60](https://github.com/Elacity/elastos-runtime/pull/60)** · follow-up **[#62](https://github.com/Elacity/elastos-runtime/pull/62)** · journeys **[#63](https://github.com/Elacity/elastos-runtime/pull/63)** · release path **[#51](https://github.com/Elacity/elastos-runtime/pull/51)**
- **Marketplace** — elacity-web **4.6.8** · drm-api **0.13.2** · API **[#22](https://github.com/Elacity/drm-api-layer/pull/22)** still open
- **Install (PC2 node)** — `bash <(curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/update.sh)`
- **Live surfaces** — map.ela.city · portal.ela.city · blockchain.elastos.io · elacitylabs.com · elacitylabs.com/provenance

## Table of Contents

1. The Big Picture — 0.7.1 Integration, Two Tracks
2. Elastos Status — ESC / EID Open, Halborn Underway
3. Runtime — PR 58 Merged, PR 64 Is the Review Head
4. Protected Content — Runtime-Owned Authority, Non-Media Objects
5. Home — Storefront, Canonical Entry, One-Command Install (Source)
6. Auth, Passkey, Recovery
7. Assistant + Local Model
8. Publisher, Packaging, Gateway
9. Creator App · Five Journeys
10. Marketplace — elacity-web 4.6.8
11. Hyper / Hey
12. PC2 — Quiet by Design
13. Release Engineering
14. Convergence Lens
15. Looking Ahead
16. Summary Statistics
17. Notes

---

## 1. The Big Picture — 0.7.1 Integration, Two Tracks

[#36](https://github.com/Elacity/pc2.net/discussions/36) left 0.7.1 as open review PRs on top of tagged **v0.7.0**. This cycle those review surfaces **merged**, then the week split into two tracks.

**Track one — authority.** The protected-content plane cut over to a Runtime-owned authority and deleted the legacy path in the same landing — no dual-write window. Non-media objects now protect and read on that same envelope. Installed e2e proof (three custody replicas, repair after loss) is **[#60](https://github.com/Elacity/elastos-runtime/pull/60)**. The cutover PR is **[#59](https://github.com/Elacity/elastos-runtime/pull/59)**. Crypto-review follow-up is **[#62](https://github.com/Elacity/elastos-runtime/pull/62)**. Installed mint → buy → play (**[#47](https://github.com/Elacity/elastos-runtime/issues/47)**) is still an open gate. See §4.

**Track two — installed preview in source.** Storefront and canonical Home entry, installer that opens Home in the browser, Recovery Kit before passkey, session cookies isolated by destination, publisher rebuilt as a deterministic signed pipeline, Creator app, unified Assistant with a recorded local-model reply on an installed Mac. **[#64](https://github.com/Elacity/elastos-runtime/pull/64)** publishes that checkpoint for review. The 0.7.1 **installer is not a public consumer download yet**. See §5–§9.

**Not this week’s invention:** Home Agent-as-capsule, empty first-run desktop, dock / lock, two-Runtime *source* proof — those were #36. This week is the merge of that line plus the cutover, storefront, install path, Assistant, and publisher.

**Marketplace.** **4.6.8** is the CI/CD and TypeScript-gate cut (7 September, after #36 published). drm-api default still **0.13.2**. A v3 listing-path PR is open. See §10.

**Chain.** No new public certificate. ESC / EID remain in the 1 September resume state. See §2.

**PC2.** Zero commits. See §12.

## 2. Elastos Status — ESC / EID Open, Halborn Underway

*Public framing only. Finding registers, live-defect recipes, and unpublished recovery trees stay inside the recovery engagement.*

| Surface | Status |
|---|---|
| **Mainchain** | Online under BPoS · tip ~**2,293,627** · still being hardened |
| **Pending mainchain review** | **Halborn** Secure Code Review of **v1.0.3** — started 28 August · report targeted early October · Elastos.ELA only this round |
| **ESC / EID** | **Open** — producing since 1 September |
| **Main ↔ ESC / EID** | **Open** |
| **PG / PGP ↔ main** | **Disabled** |
| **Exchanges / custodians** | Contact the Elastos DAO before reopening ESC / EID deposits or withdrawals |
| **CRC Incident Recovery (KuCoin flow)** | **Complete** — if you were affected and have not heard from KuCoin, contact their support |

Long form: [Sidechains resume (1 Sep)](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/) · [honest recovery log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md).

No new public blog this window. Operator toolkit remains **[Elastos.Node v1.2.4](https://github.com/elastos/Elastos.Node/releases/tag/v1.2.4)**. Private ESC / EID / Arbiter / ELA trees were quiet. Public GitHub for those sidechain trees did not reopen.

## 3. Runtime — PR 58 Merged, PR 64 Is the Review Head

**`main` did not move.** Tip is still `8ac18bec` · **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)**. There is **no v0.7.1 tag**.

**[#58](https://github.com/Elacity/elastos-runtime/pull/58)** merged 8 September into `upstream/0.7.1-dev`: installed custody provisioning, Home first-run seed, Home Agent on the typed model contract — the stack that was open in #36 as **#52 / #54 / #55**. **#54** and **#52** merged with it; **#55** closed into that integration.

**[#64](https://github.com/Elacity/elastos-runtime/pull/64)** (open) is the review head on top of that line: setup, local models, unified Assistant. Large PR (~100 commits in the review branch). Release path to `main` remains **[#51](https://github.com/Elacity/elastos-runtime/pull/51)**.

Still open beside it: cutover **[#59](https://github.com/Elacity/elastos-runtime/pull/59)**, e2e **[#60](https://github.com/Elacity/elastos-runtime/pull/60)**, follow-up **[#62](https://github.com/Elacity/elastos-runtime/pull/62)**, journeys **[#63](https://github.com/Elacity/elastos-runtime/pull/63)**. Issues **[#44](https://github.com/Elacity/elastos-runtime/issues/44)–[#47](https://github.com/Elacity/elastos-runtime/issues/47)** and external review **[#48](https://github.com/Elacity/elastos-runtime/issues/48)** stay the acceptance gates.

## 4. Protected Content — Runtime-Owned Authority, Non-Media Objects

**Atomic cutover.** One landing replaces the legacy authority with a Runtime-owned one and removes the old path in the same commit (net-negative on purpose). **[#59](https://github.com/Elacity/elastos-runtime/pull/59)** is that PR. Coverage audit then dropped unreferenced public surface the cutover made obsolete.

**Non-media objects.** Protect and read arbitrary object payloads on the same custody + rights primitives the media path already uses. Not a new authority or a new rights model — an object adapter on the authority the cutover just put in place. Follow-up plan recorded against **[#42](https://github.com/Elacity/elastos-runtime/issues/42)**, **[#48](https://github.com/Elacity/elastos-runtime/issues/48)**, **[#49](https://github.com/Elacity/elastos-runtime/issues/49)**. Wiring cleanups closed part of that list; **#48** (external / PQ review) stays open.

**Proof.** Installed e2e driver: three custody replicas, repair after loss, CI smoke — **[#60](https://github.com/Elacity/elastos-runtime/pull/60)**. A headless mint → buy → open/read/close journey was recorded in a local custody / chain environment. That is **not** installed two-principal acceptance on the frozen candidate (**#47** still open). Brave / public-chain buyer journey is still a later gate.

**Creator.** A Creator app on the dkms Creator form landed — the mint/sell screen on the Runtime-owned plane, not a storefront reopen.

## 5. Home — Storefront, Canonical Entry, One-Command Install (Source)

First-party storefront and a canonical Home entry landed in source, with dated hosted-deployment evidence on the page and copy aimed at visitors and Home (plain personal-computing language). Old Home routes keep redirects.

The one-command installer was closed **in source**: install, then open Home in the browser. macOS signed-bootstrap verify with stock tools; Linux empty principal-root upgrade receipt; process ownership preserved across platform data paths. Native preparation passed on Mac, Linux x86_64, and Linux ARM.

**Public status:** 0.7.1 device installers are **not** a consumer download this week. Treat this as reviewed source and preview plumbing, not “download and run from a new public URL.”

## 6. Auth, Passkey, Recovery

- Recovery Kit choice **before** passkey setup — first-use cannot create an identity with no recovery story.
- Durable enrollment: ceremonies bound to the correct origin / relying party; credential persist atomic and conflict-safe. Touch ID enrollment recorded on an isolated Mac Home.
- Complete Profile recovery: original name / DID restoration, retry after reload or fresh sign-in, recovered name and space controls after sign-in on a new device.
- Home session cookies isolated by destination (no cross-destination leak between local Homes).
- Guarded upgrade refuses object migration — locked with a proof test.

Combined automated recovery / shutdown checkpoints passed on Mac ARM64 and Linux x86_64. Full human authentication on clean Chrome / Safari remains a release gate.

## 7. Assistant + Local Model

The public Assistant identity was consolidated while keeping the Shelf composer and Agent Space from the 0.7 capsule work. Protected workspace adoption, history / draft preservation, visible conflict copies, typed Chat / Build / Studio controls.

Local-model path: verified engine / model inputs, managed local-engine startup, Responses adapter with explicit cancellation. An installed Mac recorded a real Qwen reply that survived reload and a full Runtime restart with the original draft and model selection.

**Still open for the AI journey:** exact Marketplace admit → handoff → safe removal, cold Content / Carrier delivery, Linux installed proof, honest Stop / cancellation. Keep protects the prepared cache; pinning and memory reservation are out of scope.

## 8. Publisher, Packaging, Gateway

The publisher now separates asset preparation from upload: complete staged artifacts before signing, portable deterministic archives, manifests distinct by OS and CPU, native vs guest targets split, unsafe low-level dry-run removed. Updates bind to exact signed head bytes and select artifacts by OS.

musl / Alpine-class: custody atomic provisioning, Browser supervisor ioctl, Home terminal ioctl — glibc-isms removed so the installed preview is honest on those targets.

Gateway closes active connections before shutdown cleanup and awaits owned process groups. Carrier closes owned endpoints after installer transfers. Verified media-tool downloads are reused.

## 9. Creator App · Five Journeys

The 0.7.1 queue was rewritten around **five user journeys** instead of a flat feature list (**[#63](https://github.com/Elacity/elastos-runtime/pull/63)**). Evidence ownership for the release call is written down. Priorities named for the next preview slice: **AI** and **Browser**.

| Journey | This week | Still open |
|---|---|---|
| **Install / first setup** | Storefront + Home entry in source · kit-first recovery · Mac/Linux recovery checkpoints | Clean three-platform install · human auth · signed public installer |
| **Update** | Signed-head updater · OS-split artifacts | First hop from **v0.7.0** on a frozen candidate |
| **Local AI** | Unified Assistant · installed Mac reply / save / restart | Marketplace handoff · removal · cold delivery · Linux |
| **Browser** | Supervisor / musl fixes · bounded earlier runs | Both placements (Mac-local and Linux Home / Mac Engine) · reload |
| **Protected video** | Runtime-owned authority · non-media objects · headless local journey | Brave buyer journey on the frozen candidate · **#48** |

Do not read the table as “0.7.1 is accepted.” It is the order of operations.

## 10. Marketplace — elacity-web 4.6.8

**4.6.8** shipped 7 September (after #36’s morning cutoff — catch-up). Story is release plumbing, not a new shop face: GitHub Actions deploy path, host-key `known_hosts`, rsync / env / permission hardening, deprecated deploy workflow removed, TypeScript 5.9.3 type gate restored (~151 accumulated errors cleared). Shared-type root causes fixed in the same cut.

drm-api default **did not move** (**0.13.2**). **[#22](https://github.com/Elacity/drm-api-layer/pull/22)** still open.

**v3-drm-protocol [#1](https://github.com/Elacity/v3-drm-protocol/pull/1)** (open): mint and sellable listing in one transaction, so a listing created at mint can actually be settled. Path work — not a consumer reopen claim.

Contract trees otherwise stay out of this post.

## 11. Hyper / Hey

**Hey-engine ~10** commits (8–9 September): VPN mid-ack so Delivered / outbox stay honest on via-relay and VPN paths; mailbox prefers the active face that owns the inbound queue.

**Hyper** had no commits after 8 September. A few 7 September afternoon landings (after #36 published) pinned VPN force-relay from the device VPN face and cut Android idle heat on an open DM. Still **source / sideload, no tag**.

## 12. PC2 — Quiet by Design

`pc2.net` — **zero** commits, PRs, or tags after #36. Operator line remains **v1.4.0**.

0.7.1 is a Runtime-only line this cycle. PC2 stays on the tagged **v0.7.0** contract until 0.7.1 is called and the Runtime-owned authority is what the node targets — so the node does not fork the pre-cutover surface.

## 13. Release Engineering

| Item | Status |
|---|---|
| Runtime `main` | Unchanged · **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)** · tip `8ac18bec` |
| Runtime 0.7.1-dev | **[#58](https://github.com/Elacity/elastos-runtime/pull/58)** **merged** 8 Sep |
| Review head | **[#64](https://github.com/Elacity/elastos-runtime/pull/64)** open |
| Open 0.7.1 PRs | **#51** · **#59** · **#60** · **#62** · **#63** · **#64** |
| Merged this cycle | **#58** · **#52** · **#54** |
| Marketplace | web **4.6.8** · drm **0.13.2** · v3 **#1** open |
| PC2 | Quiet · **v1.4.0** |
| Elastos.Node | **v1.2.4** |
| Halborn | v1.0.3 · **underway** |
| ESC / EID | **Open** · PG **closed** |
| 0.7.1 tag | **None** |

## 14. Convergence Lens

| Theme | Runtime (this week) | Marketplace / Hyper / PC2 / chain |
|---|---|---|
| Protected-content | Runtime-owned authority · non-media objects · **#59 / #60 / #62** | v3 mint-and-list path **#1** |
| Home / install | Storefront + canonical entry + install→Home **in source** | — |
| Assistant / model | Unified Assistant · installed Mac local reply | — |
| Publisher | Deterministic signed OS-split pipeline | web **4.6.8** GHA / tsc gate |
| Mesh | — | Hey VPN mid-ack · Hyper quiet after #36 |
| Chain | — | ESC/EID **open** · Halborn **underway** · tip ~2,293,627 |
| PC2 | — | Zero commits · **v1.4.0** |

## 15. Looking Ahead

1. Review **[#64](https://github.com/Elacity/elastos-runtime/pull/64)**. Close or take **#59 / #60 / #62** by readiness. **[#51](https://github.com/Elacity/elastos-runtime/pull/51)** is still the path onto `main`.
2. **Do not tag 0.7.1** until the five journeys have a frozen candidate — signed three-platform installer, first hop from v0.7.0, Marketplace→Assistant handoff, Browser placements, protected-video buyer journey.
3. **#48** external / PQ review still needs an owner, scope, and date.
4. Soak **4.6.8**. Keep **drm-api #22** moving.
5. **PC2** stays quiet until the 0.7.1 authority contract is what the node consumes.
6. **Halborn** — community-safe update when there is a certificate.
7. **PG** cross-chain stays closed.

## 16. Summary Statistics

**Week of** September 8 – September 13, 2026 (after #36; 4.6.8 catch-up from 7 September afternoon).

| Repo | Commits | Notes |
|---|---|---|
| pc2.net | **0** | Quiet |
| elastos-runtime | **~64** logical on the 0.7.1 line (rebase/backup branches inflate raw counts) | **#58** merged · **#64** review · first-pass +73,698 / −11,765 / 321 files |
| elacity-web | **~15** on 7 Sep after #36 | **4.6.8** CI/CD + tsc |
| drm-api-layer | **0** | **0.13.2** · **#22** open |
| Hyper | **0** after 8 Sep · few 7 Sep afternoon | sideload |
| Hey-engine | **~10** | VPN mid-ack |
| ESC / EID / Arbiter / ELA (private) | **0** | not public GitHub |
| Elastos.Node | **0** | still **v1.2.4** |

**Runtime authors (this line):** Anders Alm — Home / storefront / install / publisher / Assistant · Irzhy Ranaivoarivony — cutover, non-media objects, e2e proof, Creator · review checkpoint **#64**.

**Releases.** None. Latest Runtime tag **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)**. PC2 **v1.4.0**. Web **4.6.8**.

## 17. Notes

- **Chain recovery internals** stay out. Resume post, Halborn status, and KuCoin CRC completion are the community-safe chain facts.
- **0.7.1** is not tagged and the device installer is not a consumer download this week.
- **Protected-content** cutover and object envelope are engineering on the 0.7.1 line, not a consumer mint → buy → play claim.
- **Assistant** local-model reply is an installed Mac checkpoint, not a finished Marketplace journey.
- **Hyper / Hey** remain source + sideload.
- **Essentials** — no GitHub movement; still not a store claim.
- **PC2** zero-commits is by design.
- Contract-side case files and unpublished review trees stay out of this post.

---

### Quick fact card

| Fact | Value |
|---|---|
| Previous / this | [#36](https://github.com/Elacity/pc2.net/discussions/36) · [#37](https://github.com/Elacity/pc2.net/discussions/37) |
| Runtime | **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)** still latest · **0.7.1** via **#58 / #64** |
| Protected-content | Runtime-owned authority · non-media objects · **#59 / #60 / #62** |
| Home | Storefront + install→Home **in source** |
| Assistant | Unified · installed Mac local reply |
| Marketplace | web **4.6.8** · drm **0.13.2** |
| Hyper / Hey | Hey VPN mid-ack · Hyper quiet |
| Halborn | ELA **v1.0.3** · **underway** |
| Mainchain / ESC | Online · ESC/EID **open** · PG **closed** · tip ~**2,293,627** |
| Node | **v1.2.4** |
| PC2 | Quiet · **v1.4.0** |

---

*Cadence: weekly updates. Previous report — [Week of August 29 – September 7, 2026 (#36)](https://github.com/Elacity/pc2.net/discussions/36). This report — [#37](https://github.com/Elacity/pc2.net/discussions/37).*
