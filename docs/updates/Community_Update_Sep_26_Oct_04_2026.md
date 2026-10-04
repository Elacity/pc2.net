Elacity Labs — Weekly Team Update for the World Computer Initiative (WCI)

**September 26 – October 4, 2026**

**Protected dDRM is not in the new tag.** The older protected-content branches were closed and the work was reopened as four pull requests. An open that lands inside Base finality now waits instead of failing. Those pull requests are open. They are not in Runtime **[v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1)**, and protected content is planned for after the first release meant for everyday users.

**Runtime v0.7.1** was published on 30 September as a **developer snapshot**. Builds exist for Apple silicon, Linux x86-64, and Linux ARM64. They are unsigned source builds and report `0.7.1-dev`. The signed installer and the update channel did not change. `main` is that tag. `develop` is the integration line and is **214 commits ahead** of `main`. There is **no 0.7.2 tag**. The public demo has been **paused since 1 October**. This note does not publish a preview host.

**Why the demo is paused.** A review on 1 October found that a hacked Home or app can still reach more than its own capsule. On a hosted Home, wallet material is encrypted, and the key that decrypts it sits in the same data folder. Passkeys protect sign-in, not those files. Until that is fixed, a hosted account is a demo account and should not hold a wallet. The release signing key is being replaced. Nothing goes out through the signed installer until that key is in custody off any shared machine.

**Also this week.** Local chat is bound to the engine’s context window. macOS model file access is confined in source. The web terminal requires developer mode. Apps can open again inside a signed-in Home. An installed update can be staged, checked, and recovered, and that path is still not the signed channel. ela.city gained an Offers tab. Web is still **4.6.8**. drm-api is still **0.13.2**. Protocol **0.9.3** is merged and **not tagged** (latest tag **0.9.2**). **Essentials**, the **DAO**, and the **Ledger** app stayed off the public stores. **Halborn** on mainchain **v1.0.3** is in remediation. ESC / EID stay **open**. PG cross-chain stays **off**. PC2 had no product commits.

**Chain status:** mainchain producing under BPoS. ESC and EID producing; main ↔ ESC / EID open. **PG / PGP cross-chain ELA stays disabled.** Halborn’s review of pending **v1.0.3** is in remediation. One finding was scored critical. The team is treating it as a small patch: a neighbor node can halt another with a malformed binary. Private chain trees were quiet. Exchanges that froze ESC / EID deposits should contact the Elastos DAO before reopening. [Sidechains resume](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem](https://blog.elastos.net/announcement/main-chain-postmortem-august/).

> **Protected dDRM reopened, not in the tag** · **v0.7.1 developer snapshot** · unsigned · signed installer **unchanged** · demo **paused** · hosted accounts **not private** · `develop` **214** ahead of `main` · no 0.7.2 tag · Offers tab on ela.city · protocol 0.9.3 **untagged** · Essentials / DAO **local** · Ledger **not a store update** · Halborn **in remediation** · PC2 quiet.

---

## Key Links This Week

- **Previous report** — [Week of September 19 – September 26, 2026 (#39)](https://github.com/Elacity/pc2.net/discussions/39)
- **This discussion** — [#40](https://github.com/Elacity/pc2.net/discussions/40)
- **Runtime v0.7.1** — [GitHub release](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1) · [public note](https://elastos.net/blog/elastos-runtime-v071) · `develop` is the integration line
- **Protected dDRM** — [PR 203](https://github.com/Elacity/elastos-runtime/pull/203) · [PR 204](https://github.com/Elacity/elastos-runtime/pull/204) · [PR 205](https://github.com/Elacity/elastos-runtime/pull/205) · [PR 206](https://github.com/Elacity/elastos-runtime/pull/206) · [PR 62](https://github.com/Elacity/elastos-runtime/pull/62) and [PR 70](https://github.com/Elacity/elastos-runtime/pull/70) are **closed**
- **Isolation** — [issue 173](https://github.com/Elacity/elastos-runtime/issues/173) · [PR 188](https://github.com/Elacity/elastos-runtime/pull/188) · [PR 195](https://github.com/Elacity/elastos-runtime/pull/195) · [PR 197](https://github.com/Elacity/elastos-runtime/pull/197) · [PR 202](https://github.com/Elacity/elastos-runtime/pull/202) merged
- **Team sync** — [26 September – 2 October](https://github.com/Elacity/elastos-runtime/blob/docs/weekly-2026-10-02/docs/audits/2026-10-02-team-sync.md)
- **Elastos status** — [Sidechains resume (1 Sep)](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/)
- **Install (PC2 node)** — `bash <(curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/update.sh)`
- **Live surfaces** — map.ela.city · portal.ela.city · blockchain.elastos.io · elacitylabs.com

## Table of Contents

1. The Big Picture — A Developer Snapshot, and the Demo Is Paused
2. Protected dDRM — Four Pull Requests, Not in the Tag
3. Runtime v0.7.1 — What the Snapshot Contains
4. Isolation — The Core Promise Does Not Hold Yet
5. Updates and the Release Key
6. Local Models
7. Home — Phone, Desktop, Apps Opening Again
8. Community
9. Marketplace — Offers on the Current Site
10. Protocol — 0.9.3 Merged, 0.9.4 in Remediation
11. Hyper
12. Elastos.org — Still the Rebuild Branch
13. Essentials, the DAO, the Ledger App, and the Audit
14. PC2 — Quiet by Design
15. Release Engineering
16. Convergence Lens
17. Looking Ahead
18. Summary Statistics
19. Notes

---

## 1. The Big Picture — A Developer Snapshot, and the Demo Is Paused

[#39](https://github.com/Elacity/pc2.net/discussions/39) closed with no 0.7.1 tag and with protected content still on [PR 62](https://github.com/Elacity/elastos-runtime/pull/62) and [PR 70](https://github.com/Elacity/elastos-runtime/pull/70). Both of those pull requests are now **closed**. The work was rebased onto `develop` and reopened as [PR 203](https://github.com/Elacity/elastos-runtime/pull/203) through [PR 206](https://github.com/Elacity/elastos-runtime/pull/206). See §2.

On 30 September, [v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1) was published from `main`. The release text calls it a monthly developer release: a source snapshot for people building or testing, not a release for everyday use. The [public note](https://elastos.net/blog/elastos-runtime-v071) says the same. The September plan was to tag only after install, update, local AI, Browser, and protected video had passed on one build, with a one-command installer. That bar was not met. The tag is the snapshot. Protected content is named as a later release. See §3.

The day after the tag, a security review found that ElastOS does not yet keep the promise that a hacked Home or app reaches nothing else. The public demo was paused. The first isolation fixes are merged. A hosted Home is not a private place to keep a wallet. See §4.

`develop` is where pull requests land. `main` moves when a weekly release is cut. `develop` is 214 commits ahead of `main`. There is no 0.7.2 tag, and the signed installer is unchanged until a new release key exists. See §5.

PC2 did not take a product commit. See §14.

## 2. Protected dDRM — Four Pull Requests, Not in the Tag

The 0.7.1 protected-content stack was rebased onto current `develop`: a Runtime-owned authority, the path from Creator to a readable object, custody and external wallets, and buying from a live offer.

- **[PR 203](https://github.com/Elacity/elastos-runtime/pull/203)** — one authority, the Runtime. A disk-floor change in this pull request still needs to move to its own pull request before it matches the plan.
- **[PR 204](https://github.com/Elacity/elastos-runtime/pull/204)** — Creator to a readable object.
- **[PR 205](https://github.com/Elacity/elastos-runtime/pull/205)** — a mint that completes, and an open that works.
- **[PR 206](https://github.com/Elacity/elastos-runtime/pull/206)** — buy from a live offer.

An open that falls inside the finality lag **waits** and says so. On Base the finalized block trails a confirmed purchase, so an immediate open was spending an approval and then failing closed. The finalized-only rule stays.

[PR 204](https://github.com/Elacity/elastos-runtime/pull/204), [PR 205](https://github.com/Elacity/elastos-runtime/pull/205), and [PR 206](https://github.com/Elacity/elastos-runtime/pull/206) wait until after the first user release. None of the four are merged. Playback of a protected object on ela.city is still open. The protocol work behind offers is in §10. It is not a claim that a public market can sell protected objects from a Home today.

## 3. Runtime v0.7.1 — What the Snapshot Contains

[Release v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1) · 30 September · `main` tip `5df005a31`.

The snapshot includes the new sign-in screen, a Recovery Kit step before the passkey, an empty first desktop with Marketplace pinned, local models from a signed catalogue through a bounded llama engine, remote models with Inbox approval, hosted model services with the key kept on the Home, and the Home agent in its own capsule. Browser sessions that use an engine on another machine go through Runtime permission checks. Services lists shared models next to engines and exits.

The release states its own limits:

- On a Mac, a hosted model route set up by hand can skip the Inbox step.
- Signed updates still have open bugs. Moving to a later version may need a reinstall.
- Chat sign-up is hard to find.
- Installing on NVIDIA Jetson, and getting a visible Assistant reply there, has not been verified.
- The two catalogue models are SmolLM2 (a small download) and Qwen3.5-9B. Qwen3.5-9B is listed and still being tested.

The first release for everyday users is planned as **0.8.0**. There is no date on it. Smaller 0.7.N developer tags can land on the way. They are not the signed update channel.

## 4. Isolation — The Core Promise Does Not Hold Yet

The plan is [issue 173](https://github.com/Elacity/elastos-runtime/issues/173): a threat model and a sequenced set of fixes, each with a test for the case that must be refused.

Merged this week:

- [PR 188](https://github.com/Elacity/elastos-runtime/pull/188) isolates CID and user-site content.
- [PR 195](https://github.com/Elacity/elastos-runtime/pull/195) keeps the web terminal in developer mode and closes inherited terminals when policy is revoked.
- [PR 197](https://github.com/Elacity/elastos-runtime/pull/197) tightens gateway access. It also stopped apps from opening inside an installed Home.
- [PR 202](https://github.com/Elacity/elastos-runtime/pull/202) opens apps again inside the sandboxed Home shell. It was checked on a signed-in Mac Home. The automated installed-Home check is still the open piece.

Still open: corrected isolation claims ([PR 199](https://github.com/Elacity/elastos-runtime/pull/199)), provider confinement, a Browser engine that does not need sudo, a Runtime-owned approval screen, and a test suite that starts from a hacked Home.

**Hosted data.** [Issue 209](https://github.com/Elacity/elastos-runtime/issues/209) tracks the key that sits beside encrypted wallet material. The device key and the Recovery Kit archive key are plain files in that folder. A client the person controls, a confidential VM, or both, are the designs under discussion. [Issue 210](https://github.com/Elacity/elastos-runtime/issues/210) is the self-hosted case. Until issue 209 is done, hosted accounts stay non-private demo accounts without wallets.

**The public seed.** The Home now runs as a service and survives a restart. 302 accounts were kept. Unused services were stopped. Disk use went from 82% to 18%. Old login keys were removed. The certificate runs to 30 December. The demo stays paused until deployment and guest-isolation tests pass and the team signs off. Website, downloads, and the update channel on that host are not a public invitation.

## 5. Updates and the Release Key

Signed update validation landed ([PR 132](https://github.com/Elacity/elastos-runtime/pull/132)). Tag builds no longer depend on CI caches ([PR 138](https://github.com/Elacity/elastos-runtime/pull/138)).

After 2 October the update path on `develop` gained a staged executable check, a Home recovery step, a lock that stays on the resolved install, preservation of owner edits, and recovery of content reads after Kubo goes idle. [PR 229](https://github.com/Elacity/elastos-runtime/pull/229) and [PR 227](https://github.com/Elacity/elastos-runtime/pull/227), both open, are the signed-update approval and the restart that keeps Home ownership. [PR 160](https://github.com/Elacity/elastos-runtime/pull/160) failed review because it rejects the reviewed Linux ARM64 manifest.

[PR 201](https://github.com/Elacity/elastos-runtime/pull/201) publishes frozen releases with signing custody separated from the bytes that run. [Issue 186](https://github.com/Elacity/elastos-runtime/issues/186) is still open: where the new key is kept, and a person-run acceptance of a signed release. Until that key exists, the signed installer does not move.

A full pull-request CI run fell from about 47 minutes to about 32. The Mac install job fell from about 40 minutes to about 17. Shared caches are saved from `develop` and `main` only. Linux CI still does not cache Kubo, so an outage at the public Kubo download fails that job. A fallback from the Kubo GitHub release is in.

## 6. Local Models

In the 0.7.1 snapshot, local chat counts the full prompt through the owned engine before generation, with one deadline and one cancellation path.

On `develop`:

- Model offers match local context limits ([PR 155](https://github.com/Elacity/elastos-runtime/pull/155)).
- macOS confines the model child’s file access to Runtime-validated paths ([PR 142](https://github.com/Elacity/elastos-runtime/pull/142)). That is source plus one isolated reply. Installed proof is still open. This is the gap [#39](https://github.com/Elacity/pc2.net/discussions/39) recorded for the Mac process.
- Network rights stay with the Runtime ([PR 144](https://github.com/Elacity/elastos-runtime/pull/144)).
- A Jetson CPU engine can be installed from a pinned artifact built in CI ([PR 133](https://github.com/Elacity/elastos-runtime/pull/133)). A visible Assistant reply on Jetson hardware is still open, and the scheduled hardware run is on an older candidate than `develop`.

Installed journeys ([PR 153](https://github.com/Elacity/elastos-runtime/pull/153)) failed review on Carrier and ARM admission. Memory limits ([PR 136](https://github.com/Elacity/elastos-runtime/pull/136)) failed on a cross-account resource lock. Both wait on the installed-Home check. Keeping the Marketplace and Assistant model contract in sync ([PR 208](https://github.com/Elacity/elastos-runtime/pull/208)) fails Linux CI. An isolated Home could not fetch model metadata. The cause is still open.

Hosted send cancellation ([PR 148](https://github.com/Elacity/elastos-runtime/pull/148)) passed review and has a merge conflict. An End that is signaled and then fails can still interrupt a send that was already admitted. Installed acceptance is open.

Linux containment of the model process on a shared machine remains the isolation gate from last week. It is not closed.

## 7. Home — Phone, Desktop, Apps Opening Again

[#39](https://github.com/Elacity/pc2.net/discussions/39) described the phone Home as a local branch. It is now [PR 116](https://github.com/Elacity/elastos-runtime/pull/116), still **open**. Review asked for a fix to phone Return and to reconnect handling. A follow-up on `develop` makes Return add a line before the shell decides the form factor, and any gateway answer clears Reconnecting. The phone layout is not on `main`.

The desktop half merged as [PR 134](https://github.com/Elacity/elastos-runtime/pull/134): model screens, Enter to send in Chat, centred windows, and Reconnecting when the gateway stops answering. Browser layout smokes run in CI ([PR 135](https://github.com/Elacity/elastos-runtime/pull/135)).

The Assistant mark ([PR 68](https://github.com/Elacity/elastos-runtime/pull/68)) is still open.

## 8. Community

Homes can join a shared Community room from a network configuration that ships with a seed, so installs from that configuration can find each other. A person still has to accept an offer before anyone can talk. Discovery shows as connecting and retries. Create account is on the lock face, and a new account is greeted with a Recovery Kit step.

That work is [PR 123](https://github.com/Elacity/elastos-runtime/pull/123). Review findings are still open. v0.7.1 itself says chat sign-up is hard to find. An installed test with more than one Home, including people behind home routers, is not done. Relay qualification is still later.

## 9. Marketplace — Offers on the Current Site

ela.city and drm-api did not bump versions. **6** commits on elacity-web and **11** on drm-api, both on `release/base-network`, plus access-offer events on the watcher.

Sellers and buyers manage USDC access offers from one Offers tab. Holders are told about a new offer. Accepted offers are recorded as sales, and a wallet can list its own open offers. Withdraw All includes reseller items that still have a balance. A Google sign-in can spend, play, and see the royalty that sale credited. Watch-page reports go into the moderation queue.

Card checkout is not a live payment path. Playback of an object protected on a Runtime Home is still the open piece on the site, and it follows the first user release rather than blocking it.

**Still 4.6.8 / 0.13.2.**

## 10. Protocol — 0.9.3 Merged, 0.9.4 in Remediation

Protocol `main` has the 0.9.3 merge: access-token buy offers live in their own module, and the authority gateway uses that module. Licensing notes were updated with that merge. The latest **tag is still 0.9.2**. Activation on a public market is a separate step. Do not treat 0.9.3 as something a person can rely on in production today.

A 0.9.4 security remediation is in progress against the audit findings on ownership, fees, wrappers, and payment processors, with adversarial tests behind the fixes. That remediation is **not** on the protocol default branch. It is not deployed.

## 11. Hyper

A security pass landed on the Android app and the engine: shared files no longer carry location, lock-screen and overlay cases are tighter, and group, comment, and log sizes are capped. Dead desktop and tab code was removed. This is source. It is not a Play Store or App Store release.

The team’s own test note: the Android translation layer runs apps, including inside ElastOS, and showing them in the desktop is still slow. A private beta is the next conversation, not a listing. iOS is a port after a Mac is in hand. It is not a build this week.

## 12. Elastos.org — Still the Rebuild Branch

`website-rebuild-2026` moved on 30 September: council section, an outdated sidechain claim removed, capsules graphic fixed. `main` did not move. **Not** the live site.

**elacitylabs.com** had no commits this window.

## 13. Essentials, the DAO, the Ledger App, and the Audit

**Essentials is in development. Not a store release.** The bottom bar is fixed rather than floating. Staking and votes are on the home widgets, including a prompt when a vote is near expiry. The in-app browser was rebuilt, checks a public phishing list, and is aimed at a 16+ store rating so it can ship under store rules. Settings search understands a seed phrase without an exact string match. Seed-phrase material that stayed in memory after the app closed was part of the security pass. No financial transaction was signed for this note.

**The DAO site is a design integration on the working line. Not the live site.** The informational pages are being replaced with the new design. Participation from an Elastos identifier, recorded for governance, is still ahead. Last week’s build kept comments in the DAO database. That split has not been replaced by a chain write.

**Ledger.** A pull request for the current app is with the vendor. The goal is an update that does not strand people who already have the app. It is not a store update.

**Mainchain audit.** Remediation is underway. The top finding is the neighbor-halt case above. The rest were described as lower severity. There is no new public report, and there is no date on the certificate.

**Treasury.** A proposal would return about **46,000 ELA** to the DAO treasury. It has not been executed. It waits on a test with the mainchain release. The ELA/ETH pool addition from [#39](https://github.com/Elacity/pc2.net/discussions/39) was not reported as done. A council-signed bridge between mainchain and Ethereum is in design. It is not live, and it does not change the sidechain status above.

## 14. PC2 — Quiet by Design

`pc2.net` commits in this window are the publication and revisions of weekly #39. There were no product commits. The operator line remains **v1.4.0**.

PC2 stays quiet until the protected-content surface that lands from [PR 203](https://github.com/Elacity/elastos-runtime/pull/203) onward is what the node consumes.

## 15. Release Engineering

| Item | Status |
|---|---|
| Runtime `main` | **[v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1)** · 30 September · developer snapshot · unsigned |
| Signed installer / update channel | **Unchanged** · new release key still open ([issue 186](https://github.com/Elacity/elastos-runtime/issues/186)) |
| `develop` | Integration line · **214** commits ahead of `main` |
| 0.7.2 | **No tag** |
| First user release | Planned as **0.8.0** · no date |
| Protected dDRM | [PR 203](https://github.com/Elacity/elastos-runtime/pull/203)–[PR 206](https://github.com/Elacity/elastos-runtime/pull/206) open · not in v0.7.1 |
| Public demo | **Paused** since 1 October |
| Hosted accounts | **Not private** until [issue 209](https://github.com/Elacity/elastos-runtime/issues/209) |
| Phone Home | [PR 116](https://github.com/Elacity/elastos-runtime/pull/116) open |
| Desktop Home | [PR 134](https://github.com/Elacity/elastos-runtime/pull/134) merged to `develop` |
| Marketplace | web **4.6.8** · drm **0.13.2** |
| Protocol | 0.9.3 merged · tag still **0.9.2** · 0.9.4 remediation not on the default branch |
| PC2 | Quiet · **v1.4.0** |
| Elastos.Node | **v1.2.4** |
| Halborn | v1.0.3 · **remediation** |
| ESC / EID | **Open** · PG **closed** |
| Essentials / DAO / Ledger | **Local or with the vendor** · not store releases |
| Hyper | Security pass in source · **not** a store release |

## 16. Convergence Lens

| Theme | Runtime (this week) | Marketplace / Hyper / chain |
|---|---|---|
| Protected dDRM | Four open pull requests · finality wait · not in v0.7.1 | Site playback still open |
| Release | v0.7.1 developer snapshot · `develop` 214 ahead | Protocol 0.9.3 merged, untagged |
| Isolation | Demo paused · hosted keys not private · [PR 202](https://github.com/Elacity/elastos-runtime/pull/202) merged | — |
| Updates | Staged and checked on `develop` · signed channel waits on the new key | — |
| Models | Context binding in the snapshot · Mac confinement in source · Jetson reply unverified | Offers tab on the current site |
| Home | Phone pull request open · desktop merged to `develop` | — |
| Community | Shared room config · accept before talk · review open | Hyper security pass, not listed |
| Chain | — | ESC/EID **open** · Halborn **in remediation** |
| PC2 | — | No product commits · **v1.4.0** |

## 17. Looking Ahead

1. Keep protected dDRM on [PR 203](https://github.com/Elacity/elastos-runtime/pull/203) through [PR 206](https://github.com/Elacity/elastos-runtime/pull/206). Split the disk-floor change out of PR 203. Do not put this in a user release ahead of the isolation work.
2. Finish the installed-Home check for [PR 202](https://github.com/Elacity/elastos-runtime/pull/202), then the isolation claims in [PR 199](https://github.com/Elacity/elastos-runtime/pull/199). Leave the public demo paused until guest isolation is shown.
3. Put the new release key in custody off any shared machine ([issue 186](https://github.com/Elacity/elastos-runtime/issues/186)). Until then the signed installer stays where it is.
4. Show an installed runtime moving from one build to the next, including a Home restart, on the update path now on `develop`.
5. Close Linux model containment, the hosted End race, and a visible Jetson Assistant reply before calling local AI accepted.
6. Land Community only after an installed multi-Home test. Acceptance still comes before talk.
7. Soak the ela.city Offers tab on 4.6.8 / 0.13.2. Leave playback of a Runtime-protected object for after the first user release.
8. **PC2** stays quiet until the protected-content surface above is what the node consumes.
9. **Essentials**, the **DAO** site, and the **Ledger** app stay unpublished until their own reviews finish. The ELA return and the Ethereum bridge stay proposals until they are executed.
10. **Do not treat v0.7.1 as the everyday ElastOS.** **0.8.0** is the intended user release. It has no date. The preview host stays unpublished.

## 18. Summary Statistics

**Week of** September 26 – October 4, 2026 (after #39). Team notes cover through 2 October. The repository scan includes 3–4 October, which is where the update path, the desktop Home merge, and the Hyper security merge landed. Counts below are what this scan verified. They are not a line-count of every branch.

| Repo | What moved |
|---|---|
| pc2.net | Weekly #39 revisions only · still **v1.4.0** |
| elastos-runtime | **[v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1)** on `main` · `develop` **214** ahead · protected PRs reopened |
| elacity-web | **6** commits · still **4.6.8** |
| drm-api-layer | **11** commits · still **0.13.2** |
| v3-drm-protocol | 0.9.3 merge on `main` · tag still **0.9.2** |
| events-watcher | Access-offer events |
| Hyper | Security pass merged 2–3 October · not a store release |
| Hey-engine | Engine caps merged |
| elastos (`website-rebuild-2026`) | 30 September · **not** live |
| ElacityLabsWeb | Quiet |
| ESC / EID / ELA / Elastos.Node (public) | Quiet · Node still **v1.2.4** |

**Also this week, not in those repos:** Essentials home and browser pass · DAO site design on the working line · Ledger pull request with the vendor · mainchain audit remediation · a 46,000 ELA treasury proposal that has not moved · Hyper Android translation still slow in the desktop.

**Releases.** Runtime **[v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1)**, developer snapshot, unsigned. No 0.7.2 tag. PC2 **v1.4.0**. Marketplace **4.6.8** / **0.13.2**. Protocol tag **0.9.2**. Essentials, the DAO, Hyper, and the Ledger app are **not** public releases.

## 19. Notes

- **v0.7.1** is a developer snapshot. The signed installer did not change. The public demo is paused. This note does not publish a preview host.
- **Protected dDRM** was reopened as four pull requests. [PR 62](https://github.com/Elacity/elastos-runtime/pull/62) and [PR 70](https://github.com/Elacity/elastos-runtime/pull/70) are closed. The work is not in the tag.
- **Hosted Homes** are not private until the key beside the wallet material is fixed. Do not put a real wallet on the demo.
- **The release signing key** is being replaced. Publication through the signed channel waits on that custody.
- **0.8.0** is the intended first user release. It has no date.
- **Protocol 0.9.4** remediation is not on the default branch and is not deployed.
- **Hyper** security fixes are source. They are not a store listing.
- **Essentials / DAO** are local. The Ledger app is with the vendor.
- **ELA return** and the Ethereum bridge are proposals. They are not executed.
- **PC2** had no product commits.
- Issue and pull-request numbers in the text are written out and linked so GitHub does not attach them to this repository.

---

### Quick fact card

| Fact | Value |
|---|---|
| Previous / this | [#39](https://github.com/Elacity/pc2.net/discussions/39) · [#40](https://github.com/Elacity/pc2.net/discussions/40) |
| Runtime | **[v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1)** developer snapshot · unsigned |
| Signed installer | **Unchanged** |
| `develop` | **214** commits ahead of `main` |
| Public demo | **Paused** since 1 October |
| Protected dDRM | [PR 203](https://github.com/Elacity/elastos-runtime/pull/203)–[PR 206](https://github.com/Elacity/elastos-runtime/pull/206) · not in the tag |
| Hosted accounts | **Not private** |
| Phone / desktop | [PR 116](https://github.com/Elacity/elastos-runtime/pull/116) open · [PR 134](https://github.com/Elacity/elastos-runtime/pull/134) on `develop` |
| Marketplace | web **4.6.8** · drm **0.13.2** · Offers tab |
| Protocol | 0.9.3 merged · tag **0.9.2** |
| Essentials / DAO / Ledger | Not store releases |
| Hyper | Source security pass · not listed |
| Halborn | ELA **v1.0.3** · remediation |
| Mainchain / ESC | Online · ESC/EID **open** · PG **closed** |
| Node | **v1.2.4** |
| PC2 | Quiet · **v1.4.0** |

---

*Cadence: weekly updates. Previous report — [Week of September 19 – September 26, 2026 (#39)](https://github.com/Elacity/pc2.net/discussions/39). This report — [#40](https://github.com/Elacity/pc2.net/discussions/40).*
