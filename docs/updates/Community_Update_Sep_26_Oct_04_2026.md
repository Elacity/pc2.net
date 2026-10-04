Elacity Labs — Weekly Team Update for the World Computer Initiative (WCI)

**September 26 – October 4, 2026**

**Runtime v0.7.1.** Published on 30 September as a developer snapshot for Apple silicon, Linux x86-64, and Linux ARM64. The release carries the new sign-in screen, a Recovery Kit step before the passkey, an empty first desktop with Marketplace pinned, local models from a signed catalogue, remote models with Inbox approval, and the Home agent in its own capsule. `main` is that tag. `develop` is the integration line and is **214 commits ahead** of `main`. Weekly developer releases continue from `develop`. [GitHub release](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1) · [public note](https://elastos.net/blog/elastos-runtime-v071).

**Also on Runtime.** CID and user-site content are isolated. The web terminal stays in developer mode. Gateway access is tighter, and apps open again inside a signed-in Home. Signed update checks landed, and an install on `develop` can be staged, checked, and recovered. Local chat follows the engine’s context window. macOS model file access is confined. A Jetson engine installs from an artifact built in CI. The desktop Home merged. The phone Home is an open pull request. Homes join Community from the seed configuration. Protected content was rebased into four pull requests, and an open during Base finality now waits. A full CI run is about a third shorter.

**Elacity, after the runtime work.** ela.city gained an Offers tab. Web is still **4.6.8**. drm-api is still **0.13.2**. Protocol **0.9.3** is merged (latest tag **0.9.2**), with a **0.9.4** security pass in progress. **Essentials**, the **DAO**, and the **Ledger** app stayed off the public stores. **Halborn** on mainchain **v1.0.3** is in remediation. ESC / EID stay **open**. PG cross-chain stays **off**. PC2 had no product commits.

**Chain status:** mainchain producing under BPoS. ESC and EID producing; main ↔ ESC / EID open. **PG / PGP cross-chain ELA stays disabled.** Halborn’s review of pending **v1.0.3** is in remediation. Private chain trees were quiet. Exchanges that froze ESC / EID deposits should contact the Elastos DAO before reopening. [Sidechains resume](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem](https://blog.elastos.net/announcement/main-chain-postmortem-august/).

> **Runtime v0.7.1** developer snapshot · Apple silicon, Linux x86-64, Linux ARM64 · `develop` **214** ahead of `main` · isolation, updates, models, Home, Community · protected content on four pull requests · ela.city Offers tab · protocol 0.9.3 merged · Essentials / DAO **local** · Ledger with the vendor · Halborn **in remediation** · PC2 quiet.

---

## Key Links This Week

- **Previous report** — [Week of September 19 – September 26, 2026 (#39)](https://github.com/Elacity/pc2.net/discussions/39)
- **This discussion** — [#40](https://github.com/Elacity/pc2.net/discussions/40)
- **Runtime v0.7.1** — [GitHub release](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1) · [public note](https://elastos.net/blog/elastos-runtime-v071) · `develop` is the integration line
- **Protected content** — [PR 203](https://github.com/Elacity/elastos-runtime/pull/203) · [PR 204](https://github.com/Elacity/elastos-runtime/pull/204) · [PR 205](https://github.com/Elacity/elastos-runtime/pull/205) · [PR 206](https://github.com/Elacity/elastos-runtime/pull/206)
- **Isolation** — [issue 173](https://github.com/Elacity/elastos-runtime/issues/173) · [PR 188](https://github.com/Elacity/elastos-runtime/pull/188) · [PR 195](https://github.com/Elacity/elastos-runtime/pull/195) · [PR 197](https://github.com/Elacity/elastos-runtime/pull/197) · [PR 202](https://github.com/Elacity/elastos-runtime/pull/202) merged
- **Team sync** — [26 September – 2 October](https://github.com/Elacity/elastos-runtime/blob/docs/weekly-2026-10-02/docs/audits/2026-10-02-team-sync.md)
- **Elastos status** — [Sidechains resume (1 Sep)](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/)
- **Install (PC2 node)** — `bash <(curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/update.sh)`
- **Live surfaces** — map.ela.city · portal.ela.city · blockchain.elastos.io · elacitylabs.com

## Table of Contents

1. The Big Picture — Runtime v0.7.1
2. What Shipped in the Snapshot
3. Isolation
4. Updates
5. Local Models
6. Home
7. Community and Protected Content
8. Release Engineering
9. Marketplace — Offers on the Current Site
10. Protocol
11. Hyper
12. Elastos.org
13. Essentials, the DAO, the Ledger App, and the Audit
14. PC2
15. Convergence Lens
16. Looking Ahead
17. Summary Statistics
18. Notes

---

## 1. The Big Picture — Runtime v0.7.1

[#39](https://github.com/Elacity/pc2.net/discussions/39) closed with no 0.7.1 tag. On 30 September, [v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1) was published from `main`. It is a developer snapshot: source builds for people building and testing on Runtime. The [public note](https://elastos.net/blog/elastos-runtime-v071) is the same release. See §2.

`develop` is where pull requests land. `main` moves when a weekly release is cut. `develop` is 214 commits ahead of `main`. The week after the tag is that line: isolation, updates, models, Home, Community, and the protected-content rebase. See §3–§8.

Elacity product work sits behind that. The current marketplace gained an Offers tab. Protocol 0.9.3 merged. Essentials, the DAO site, and the Ledger app continued off the stores. See §9–§13.

PC2 did not take a product commit. See §14.

## 2. What Shipped in the Snapshot

[Release v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1) · 30 September · `main` tip `5df005a31`.

The snapshot includes:

- The new sign-in screen, and a Recovery Kit step before the passkey is created.
- An empty first desktop, with Marketplace pinned.
- Local models from a signed catalogue, run through llama.cpp. The first catalogue lists SmolLM2 (about 145 MB, 512 MB of memory) and Qwen3.5-9B (about 6.2 GB, 8 GB of memory). Qwen3.5-9B is listed and still being tested. Installed models can be kept or removed from System.
- A model on someone else’s machine, once that owner approves it from Inbox, and hosted model services with the API key kept on the Home.
- The Home agent in its own capsule.
- Browser sessions that use an engine on another machine, through Runtime permission checks, with the local engine’s dependencies verified.
- Services listing shared models next to engines and exits.

The release records the limits it is still working through: a hosted model route set up by hand on a Mac can skip Inbox; signed updates are still being finished, and moving forward may need a reinstall; chat sign-up is still being made easier to find; a visible Assistant reply on NVIDIA Jetson is still being verified.

The first release meant for everyday use is planned as **0.8.0**. Smaller 0.7.N developer tags carry the work toward it.

## 3. Isolation

The plan is [issue 173](https://github.com/Elacity/elastos-runtime/issues/173): a threat model and a sequenced set of fixes, each with a test for the case that must be refused.

Merged this week:

- [PR 188](https://github.com/Elacity/elastos-runtime/pull/188) isolates CID and user-site content.
- [PR 195](https://github.com/Elacity/elastos-runtime/pull/195) keeps the web terminal in developer mode and closes inherited terminals when policy is revoked.
- [PR 197](https://github.com/Elacity/elastos-runtime/pull/197) tightens gateway access.
- [PR 202](https://github.com/Elacity/elastos-runtime/pull/202) opens apps again inside the sandboxed Home shell. It was checked on a signed-in Mac Home. The automated installed-Home check is the remaining piece.

Still in progress: corrected isolation claims ([PR 199](https://github.com/Elacity/elastos-runtime/pull/199)), provider confinement, a Browser engine that does not need sudo, a Runtime-owned approval screen, and the installed-Home test suite.

**The public seed.** The Home now runs as a service and survives a restart. 302 accounts were kept. Unused services were stopped. Disk use went from 82% to 18%. Old login keys were removed. The certificate runs to 30 December. The public Home demo is paused while this isolation work continues. The website, downloads, and the update channel on that host stayed up.

**Account keys.** [Issue 209](https://github.com/Elacity/elastos-runtime/issues/209) is the hosted-key design: a client the person controls, a confidential VM, or both. [Issue 210](https://github.com/Elacity/elastos-runtime/issues/210) is the self-hosted case.

## 4. Updates

Signed update validation landed ([PR 132](https://github.com/Elacity/elastos-runtime/pull/132)). Tag builds no longer depend on CI caches ([PR 138](https://github.com/Elacity/elastos-runtime/pull/138)).

After 2 October the update path on `develop` gained a staged executable check, a Home recovery step, a lock that stays on the resolved install, preservation of owner edits, and recovery of content reads after Kubo goes idle. [PR 229](https://github.com/Elacity/elastos-runtime/pull/229) and [PR 227](https://github.com/Elacity/elastos-runtime/pull/227) carry signed-update approval and a restart that keeps Home ownership.

[PR 201](https://github.com/Elacity/elastos-runtime/pull/201) publishes frozen releases with signing kept separate from the bytes that run. [Issue 186](https://github.com/Elacity/elastos-runtime/issues/186) is the remaining publication and key-custody work for the signed installer.

A full pull-request CI run fell from about 47 minutes to about 32. The Mac install job fell from about 40 minutes to about 17. Shared caches are saved from `develop` and `main` only. Linux CI still fetches Kubo on each run, and a fallback from the Kubo GitHub release is in.

## 5. Local Models

In the 0.7.1 snapshot, local chat counts the full prompt through the owned engine before generation, with one deadline and one cancellation path.

On `develop`:

- Model offers match local context limits ([PR 155](https://github.com/Elacity/elastos-runtime/pull/155)).
- macOS confines the model child’s file access to Runtime-validated paths ([PR 142](https://github.com/Elacity/elastos-runtime/pull/142)).
- Network rights stay with the Runtime ([PR 144](https://github.com/Elacity/elastos-runtime/pull/144)).
- A Jetson CPU engine installs from a pinned artifact built in CI ([PR 133](https://github.com/Elacity/elastos-runtime/pull/133)). A visible Assistant reply on Jetson hardware is the remaining check, and the scheduled hardware run is on an older candidate than `develop`.

Installed journeys ([PR 153](https://github.com/Elacity/elastos-runtime/pull/153)) and memory limits ([PR 136](https://github.com/Elacity/elastos-runtime/pull/136)) are still in review. Keeping the Marketplace and Assistant model contract in sync ([PR 208](https://github.com/Elacity/elastos-runtime/pull/208)) is in review on Linux CI. Hosted send cancellation ([PR 148](https://github.com/Elacity/elastos-runtime/pull/148)) passed review and is being rebased onto current `develop`.

## 6. Home

[#39](https://github.com/Elacity/pc2.net/discussions/39) described the phone Home as a local branch. It is now [PR 116](https://github.com/Elacity/elastos-runtime/pull/116). Review is on phone Return and reconnect handling. A follow-up on `develop` makes Return add a line before the shell decides the form factor, and any gateway answer clears Reconnecting.

The desktop half merged as [PR 134](https://github.com/Elacity/elastos-runtime/pull/134): model screens, Enter to send in Chat, centred windows, and Reconnecting when the gateway stops answering. Browser layout smokes run in CI ([PR 135](https://github.com/Elacity/elastos-runtime/pull/135)).

The Assistant mark ([PR 68](https://github.com/Elacity/elastos-runtime/pull/68)) is still open.

## 7. Community and Protected Content

**Community.** Homes join a shared Community room from a network configuration that ships with a seed, so installs from that configuration can find each other. A person accepts an offer before anyone talks. Discovery shows as connecting and retries. Create account is on the lock face, and a new account is greeted with a Recovery Kit step. That work is [PR 123](https://github.com/Elacity/elastos-runtime/pull/123), with review still open. An installed test with more than one Home is the next check.

**Protected content.** The 0.7.1 stack was rebased onto current `develop` and opened as four pull requests:

- **[PR 203](https://github.com/Elacity/elastos-runtime/pull/203)** — one authority, the Runtime. A disk-floor change in this pull request is moving to its own pull request.
- **[PR 204](https://github.com/Elacity/elastos-runtime/pull/204)** — Creator to a readable object.
- **[PR 205](https://github.com/Elacity/elastos-runtime/pull/205)** — a mint that completes, and an open that works.
- **[PR 206](https://github.com/Elacity/elastos-runtime/pull/206)** — buy from a live offer.

An open that falls inside the finality lag **waits** and says so. On Base the finalized block trails a confirmed purchase, so the open now waits through that window. The finalized-only rule stays. The public release plans protected content for after the first everyday release. Playback of a protected object on ela.city follows that same line.

## 8. Release Engineering

| Item | Status |
|---|---|
| Runtime `main` | **[v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1)** · 30 September · developer snapshot |
| `develop` | Integration line · **214** commits ahead of `main` |
| Weekly train | 0.7.N developer tags from `develop` · first everyday release planned as **0.8.0** |
| Signed updates | Validation merged ([PR 132](https://github.com/Elacity/elastos-runtime/pull/132)) · publication continues on [issue 186](https://github.com/Elacity/elastos-runtime/issues/186) |
| Protected content | [PR 203](https://github.com/Elacity/elastos-runtime/pull/203)–[PR 206](https://github.com/Elacity/elastos-runtime/pull/206) |
| Phone Home | [PR 116](https://github.com/Elacity/elastos-runtime/pull/116) |
| Desktop Home | [PR 134](https://github.com/Elacity/elastos-runtime/pull/134) on `develop` |
| CI | Full run ~47 min → ~32 · Mac install ~40 min → ~17 |

## 9. Marketplace — Offers on the Current Site

ela.city and drm-api did not bump versions. **6** commits on elacity-web and **11** on drm-api, both on `release/base-network`, plus access-offer events on the watcher.

Sellers and buyers manage USDC access offers from one Offers tab. Holders are told about a new offer. Accepted offers are recorded as sales, and a wallet can list its own open offers. Withdraw All includes reseller items that still have a balance. A Google sign-in can spend, play, and see the royalty that sale credited. Watch-page reports go into the moderation queue.

Card checkout is the next payment path, not a live one yet. **Still 4.6.8 / 0.13.2.**

## 10. Protocol

Protocol `main` has the 0.9.3 merge: access-token buy offers live in their own module, and the authority gateway uses that module. Licensing notes were updated with that merge. The latest **tag is still 0.9.2**.

A 0.9.4 security pass is in progress against the audit findings on ownership, fees, wrappers, and payment processors, with adversarial tests behind the fixes. That pass is on its working branch.

## 11. Hyper

A security pass landed on the Android app and the engine: shared files no longer carry location, lock-screen and overlay cases are tighter, and group, comment, and log sizes are capped. Dead desktop and tab code was removed.

The Android translation layer runs apps, including inside ElastOS. Showing them in the desktop is the optimisation still in progress. A private beta is the next step. The iOS port follows once a Mac is in hand.

## 12. Elastos.org

`website-rebuild-2026` moved on 30 September: council section, an outdated sidechain claim removed, capsules graphic fixed. `main` did not move. The rebuild is not the live site yet.

**elacitylabs.com** had no commits this window.

## 13. Essentials, the DAO, the Ledger App, and the Audit

**Essentials** continued in development. The bottom bar is fixed. Staking and votes are on the home widgets, including a prompt when a vote is near expiry. The in-app browser was rebuilt, checks a public phishing list, and is aimed at a 16+ store rating. Settings search understands a seed phrase without an exact string match. Seed-phrase material that stayed in memory after the app closed was cleared in this pass. It is not a store release this week.

**The DAO site** is taking the new design on the working line. Participation from an Elastos identifier, recorded for governance, is the next piece. Comments stay in the DAO database for now.

**Ledger.** A pull request for the current app is with the vendor, so people who already have the app can take the update in place.

**Mainchain audit.** Remediation of the Halborn findings on **v1.0.3** is underway. There is no new public report this week.

**Treasury.** A proposal would return about **46,000 ELA** to the DAO treasury. It waits on a test with the mainchain release. The ELA/ETH pool addition from [#39](https://github.com/Elacity/pc2.net/discussions/39) was not part of this week’s report. A council-signed bridge between mainchain and Ethereum is in design.

## 14. PC2

`pc2.net` commits in this window are the publication and revisions of weekly #39. There were no product commits. The operator line remains **v1.4.0**.

PC2 stays on that line until the protected-content surface from [PR 203](https://github.com/Elacity/elastos-runtime/pull/203) onward is what the node consumes.

## 15. Convergence Lens

| Theme | Runtime (this week) | Elacity, Hyper, chain |
|---|---|---|
| Release | **v0.7.1** developer snapshot · `develop` 214 ahead | Protocol 0.9.3 merged · tag 0.9.2 |
| Isolation | CID and user-site sandbox · terminal in developer mode · apps open in the Home | — |
| Updates | Signed checks merged · stage, check, and recover on `develop` | — |
| Models | Context binding in the snapshot · Mac file confinement · Jetson engine in CI | — |
| Home | Desktop merged · phone pull request open | — |
| Community / content | Shared room · four protected-content pull requests · finality wait | Offers tab on ela.city |
| Chain | — | ESC/EID **open** · Halborn **in remediation** |
| PC2 | — | No product commits · **v1.4.0** |

## 16. Looking Ahead

1. Keep the weekly developer tags coming from `develop`, toward the everyday release planned as **0.8.0**.
2. Finish the installed-Home check for [PR 202](https://github.com/Elacity/elastos-runtime/pull/202), then the isolation claims in [PR 199](https://github.com/Elacity/elastos-runtime/pull/199).
3. Carry signed updates through [issue 186](https://github.com/Elacity/elastos-runtime/issues/186), including a Home that restarts and keeps its ownership.
4. Land the installed model journeys, the hosted send cancellation, and a visible Jetson Assistant reply.
5. Finish Community review, then an installed test with more than one Home.
6. Keep protected content moving on [PR 203](https://github.com/Elacity/elastos-runtime/pull/203) through [PR 206](https://github.com/Elacity/elastos-runtime/pull/206), with the disk-floor change in its own pull request.
7. Soak the ela.city Offers tab on 4.6.8 / 0.13.2, and continue the protocol 0.9.4 security pass.
8. **Essentials**, the **DAO** site, and the **Ledger** app continue toward their own releases. The ELA return and the Ethereum bridge stay with that treasury work.
9. **PC2** stays on **v1.4.0** until the protected-content surface above is what the node consumes.

## 17. Summary Statistics

**Week of** September 26 – October 4, 2026 (after #39). Team notes cover through 2 October. The repository scan includes 3–4 October, which is where the update path, the desktop Home merge, and the Hyper security merge landed.

| Repo | What moved |
|---|---|
| elastos-runtime | **[v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1)** on `main` · `develop` **214** ahead · isolation, updates, models, Home, Community, protected content |
| elacity-web | **6** commits · still **4.6.8** |
| drm-api-layer | **11** commits · still **0.13.2** |
| v3-drm-protocol | 0.9.3 merge on `main` · tag still **0.9.2** |
| events-watcher | Access-offer events |
| Hyper | Security pass merged 2–3 October |
| Hey-engine | Engine caps merged |
| elastos (`website-rebuild-2026`) | 30 September · rebuild branch |
| ElacityLabsWeb | Quiet |
| pc2.net | Weekly #39 revisions only · still **v1.4.0** |
| ESC / EID / ELA / Elastos.Node (public) | Quiet · Node still **v1.2.4** |

**Also this week, outside those repos:** Essentials home and browser pass · DAO site design on the working line · Ledger pull request with the vendor · mainchain audit remediation · a 46,000 ELA treasury proposal.

**Releases.** Runtime **[v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1)**, developer snapshot. PC2 **v1.4.0**. Marketplace **4.6.8** / **0.13.2**. Protocol tag **0.9.2**.

## 18. Notes

- **Runtime v0.7.1** is the developer snapshot published on 30 September. `develop` is 214 commits ahead and is where the next weekly tags are cut.
- **Protected content** continues on [PR 203](https://github.com/Elacity/elastos-runtime/pull/203) through [PR 206](https://github.com/Elacity/elastos-runtime/pull/206). An open during Base finality waits.
- **Isolation, updates, models, and Home** are the rest of the runtime week, in §3–§6.
- **Elacity** marketplace, protocol, Essentials, the DAO, and the Ledger app are in §9–§13.
- **PC2** had no product commits.
- Issue and pull-request numbers in the text are written out and linked so GitHub does not attach them to this repository.

---

### Quick fact card

| Fact | Value |
|---|---|
| Previous / this | [#39](https://github.com/Elacity/pc2.net/discussions/39) · [#40](https://github.com/Elacity/pc2.net/discussions/40) |
| Runtime | **[v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1)** developer snapshot |
| `develop` | **214** commits ahead of `main` |
| Isolation | [PR 188](https://github.com/Elacity/elastos-runtime/pull/188) · [PR 195](https://github.com/Elacity/elastos-runtime/pull/195) · [PR 197](https://github.com/Elacity/elastos-runtime/pull/197) · [PR 202](https://github.com/Elacity/elastos-runtime/pull/202) |
| Protected content | [PR 203](https://github.com/Elacity/elastos-runtime/pull/203)–[PR 206](https://github.com/Elacity/elastos-runtime/pull/206) |
| Phone / desktop | [PR 116](https://github.com/Elacity/elastos-runtime/pull/116) · [PR 134](https://github.com/Elacity/elastos-runtime/pull/134) on `develop` |
| Marketplace | web **4.6.8** · drm **0.13.2** · Offers tab |
| Protocol | 0.9.3 merged · tag **0.9.2** |
| Essentials / DAO / Ledger | In progress, off the stores |
| Hyper | Security pass in source |
| Halborn | ELA **v1.0.3** · remediation |
| Mainchain / ESC | Online · ESC/EID **open** · PG **closed** |
| Node | **v1.2.4** |
| PC2 | **v1.4.0** |

---

*Cadence: weekly updates. Previous report — [Week of September 19 – September 26, 2026 (#39)](https://github.com/Elacity/pc2.net/discussions/39). This report — [#40](https://github.com/Elacity/pc2.net/discussions/40).*
