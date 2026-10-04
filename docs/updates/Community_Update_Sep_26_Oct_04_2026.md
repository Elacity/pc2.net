Elacity Labs — Weekly Team Update for the World Computer Initiative (WCI)

**September 26 – October 4, 2026**

**Runtime v0.7.1.** Published on 30 September for Apple silicon, Linux x86-64, and Linux ARM64. The release carries the new sign-in screen, a Recovery Kit step before the passkey, an empty first desktop with Marketplace pinned, local models from a signed catalogue, remote models with Inbox approval, and the Home agent in its own capsule. `main` is that tag. `develop` is the integration line, **214 commits ahead** of `main`. [GitHub release](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1) · [public note](https://elastos.net/blog/elastos-runtime-v071).

**Also on Runtime.** CID and user-site content are isolated. The web terminal runs in developer mode. Gateway access is in place, and apps open inside a signed-in Home. Signed update checks are in, and an install on `develop` stages, checks, and recovers. Local chat follows the engine’s context window. macOS model file access is confined to Runtime paths. A Jetson engine installs from an artifact built in CI. The desktop Home merged. The phone Home is up as its own pull request. Homes join Community from the seed configuration. Protected content is on four pull requests, and an open during Base finality waits through that window. A full CI run dropped from about 47 minutes to about 32, and the Mac install job from about 40 to about 17.

**Elacity.** ela.city has an Offers tab for USDC access offers, on web **4.6.8** and drm-api **0.13.2**. Protocol **0.9.3** is on `main`, with **0.9.4** security work on its branch. Essentials gained a fixed home bar, staking widgets, and a rebuilt browser. The DAO site has the new design on its working line. The Ledger app has a pull request with the vendor. Hyper has a security pass on the Android app and the engine. Mainchain **v1.0.3** remediation continued. ESC / EID are **open**. PG cross-chain stays **off**. PC2 is on **v1.4.0**.

**Chain status:** mainchain producing under BPoS. ESC and EID producing; main ↔ ESC / EID open. **PG / PGP cross-chain ELA stays disabled.** Halborn remediation of pending **v1.0.3** continued. [Sidechains resume](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem](https://blog.elastos.net/announcement/main-chain-postmortem-august/).

> **Runtime v0.7.1** · Apple silicon, Linux x86-64, Linux ARM64 · `develop` **214** ahead of `main` · isolation, updates, models, Home, Community, protected content · ela.city Offers tab · protocol 0.9.3 · Essentials home and browser · DAO design · Ledger with the vendor · Hyper security pass · PC2 **v1.4.0**.

---

## Key Links This Week

- **Previous report** — [Week of September 19 – September 26, 2026 (#39)](https://github.com/Elacity/pc2.net/discussions/39)
- **This discussion** — [#40](https://github.com/Elacity/pc2.net/discussions/40)
- **Runtime v0.7.1** — [GitHub release](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1) · [public note](https://elastos.net/blog/elastos-runtime-v071)
- **Protected content** — [PR 203](https://github.com/Elacity/elastos-runtime/pull/203) · [PR 204](https://github.com/Elacity/elastos-runtime/pull/204) · [PR 205](https://github.com/Elacity/elastos-runtime/pull/205) · [PR 206](https://github.com/Elacity/elastos-runtime/pull/206)
- **Isolation** — [PR 188](https://github.com/Elacity/elastos-runtime/pull/188) · [PR 195](https://github.com/Elacity/elastos-runtime/pull/195) · [PR 197](https://github.com/Elacity/elastos-runtime/pull/197) · [PR 202](https://github.com/Elacity/elastos-runtime/pull/202)
- **Elastos status** — [Sidechains resume (1 Sep)](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/)
- **Install (PC2 node)** — `bash <(curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/update.sh)`
- **Live surfaces** — map.ela.city · portal.ela.city · blockchain.elastos.io · elacitylabs.com

## Table of Contents

1. The Big Picture — Runtime v0.7.1
2. The v0.7.1 Snapshot
3. Isolation
4. Updates
5. Local Models
6. Home
7. Community and Protected Content
8. Marketplace
9. Protocol
10. Hyper
11. Elastos.org
12. Essentials, the DAO, and the Ledger App
13. PC2 and the Chain
14. Summary

---

## 1. The Big Picture — Runtime v0.7.1

On 30 September, [v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1) was published from `main`. Builds are up for Apple silicon, Linux x86-64, and Linux ARM64. The [public note](https://elastos.net/blog/elastos-runtime-v071) matches that release.

`develop` holds the integration line and is 214 commits ahead of `main`. That line has the isolation work, the update path, local models, the desktop Home, Community, and the protected-content rebase.

On Elacity, ela.city shipped the Offers tab, protocol 0.9.3 merged, and Essentials, the DAO site, the Ledger app, and Hyper each moved on their own lines.

## 2. The v0.7.1 Snapshot

[Release v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1) · 30 September.

- New sign-in screen, with a Recovery Kit step before the passkey is created.
- Empty first desktop, Marketplace pinned.
- Local models from a signed catalogue, through llama.cpp. The catalogue lists SmolLM2 (about 145 MB, 512 MB of memory) and Qwen3.5-9B (about 6.2 GB, 8 GB of memory). Installed models can be kept or removed from System.
- A model on another machine after that owner approves it from Inbox, and hosted model services with the API key kept on the Home.
- Home agent in its own capsule.
- Browser sessions on another machine go through Runtime permission checks, and the local engine’s dependencies are verified.
- Services lists shared models next to engines and exits.

## 3. Isolation

- [PR 188](https://github.com/Elacity/elastos-runtime/pull/188) isolates CID and user-site content.
- [PR 195](https://github.com/Elacity/elastos-runtime/pull/195) runs the web terminal in developer mode and closes inherited terminals when policy is revoked.
- [PR 197](https://github.com/Elacity/elastos-runtime/pull/197) sets gateway access for the front door.
- [PR 202](https://github.com/Elacity/elastos-runtime/pull/202) opens apps inside the sandboxed Home shell. Checked on a signed-in Mac Home.
- [PR 199](https://github.com/Elacity/elastos-runtime/pull/199) records how web and native execution are described.

On the public seed, Home runs as a service and survives a restart. 302 accounts were kept. Unused services were stopped. Disk use went from 82% to 18%. Old login keys were removed. The certificate runs to 30 December. The website, downloads, and the update channel stayed up.

## 4. Updates

Signed update validation is in ([PR 132](https://github.com/Elacity/elastos-runtime/pull/132)). Tag builds run without CI caches ([PR 138](https://github.com/Elacity/elastos-runtime/pull/138)).

On `develop`, the update path stages the executable and checks it, recovers Home, keeps the lock on the resolved install, preserves owner edits, and recovers content reads after Kubo goes idle. [PR 229](https://github.com/Elacity/elastos-runtime/pull/229) approves a signed update from System and reconnects Home after restart. [PR 227](https://github.com/Elacity/elastos-runtime/pull/227) keeps Home ownership through that recovery.

[PR 201](https://github.com/Elacity/elastos-runtime/pull/201) publishes frozen releases with signing kept separate from the bytes that run.

Shared CI caches come from `develop` and `main`. A Kubo fallback from the Kubo GitHub release is in the Linux jobs.

## 5. Local Models

In v0.7.1, local chat counts the full prompt through the owned engine before generation, with one deadline and one cancellation path.

On `develop`:

- Model offers match local context limits ([PR 155](https://github.com/Elacity/elastos-runtime/pull/155)).
- macOS confines the model child’s file access to Runtime-validated paths ([PR 142](https://github.com/Elacity/elastos-runtime/pull/142)).
- Network rights stay with the Runtime ([PR 144](https://github.com/Elacity/elastos-runtime/pull/144)).
- A Jetson CPU engine installs from a pinned artifact built in CI ([PR 133](https://github.com/Elacity/elastos-runtime/pull/133)).
- Installed journeys cover a pinned Home and local model runs ([PR 153](https://github.com/Elacity/elastos-runtime/pull/153)).
- Memory limits cover the engine under a shared lease ([PR 136](https://github.com/Elacity/elastos-runtime/pull/136)).
- The Marketplace and Assistant model contract stay in sync ([PR 208](https://github.com/Elacity/elastos-runtime/pull/208)).
- Hosted sends commit End before cancellation ([PR 148](https://github.com/Elacity/elastos-runtime/pull/148)).

## 6. Home

The phone Home is [PR 116](https://github.com/Elacity/elastos-runtime/pull/116): the app grid, Home pages, edit mode, the Assistant page, an app switcher, and long-press menus. Return adds a line before the shell decides the form factor, and any gateway answer clears Reconnecting.

The desktop Home merged as [PR 134](https://github.com/Elacity/elastos-runtime/pull/134): model screens on the standard cards, Enter to send in Chat, centred windows, and Reconnecting when the gateway stops answering. Browser layout smokes run in CI ([PR 135](https://github.com/Elacity/elastos-runtime/pull/135)).

The Assistant dock mark is [PR 68](https://github.com/Elacity/elastos-runtime/pull/68).

## 7. Community and Protected Content

**Community.** Homes join a shared Community room from the network configuration that ships with a seed, so those installs find each other. An offer is accepted before anyone talks. Discovery shows as connecting and retries. Create account is on the lock face, and a new account gets a first Recovery Kit step. That work is [PR 123](https://github.com/Elacity/elastos-runtime/pull/123).

**Protected content.** The stack is on current `develop` as four pull requests:

- **[PR 203](https://github.com/Elacity/elastos-runtime/pull/203)** — one authority, the Runtime.
- **[PR 204](https://github.com/Elacity/elastos-runtime/pull/204)** — Creator to a readable object.
- **[PR 205](https://github.com/Elacity/elastos-runtime/pull/205)** — a mint that completes, and an open that works.
- **[PR 206](https://github.com/Elacity/elastos-runtime/pull/206)** — buy from a live offer.

An open that falls inside the finality lag waits and says so. On Base the finalized block trails a confirmed purchase, and the open waits through that window.

## 8. Marketplace

**6** commits on elacity-web and **11** on drm-api, both on `release/base-network`, plus access-offer events on the watcher. Web **4.6.8**. drm-api **0.13.2**.

Sellers and buyers manage USDC access offers from one Offers tab. Holders are told about a new offer. Accepted offers are recorded as sales, and a wallet lists its own open offers. Withdraw All includes reseller items that still have a balance. A Google sign-in can spend, play, and see the royalty that sale credited. Watch-page reports go into the moderation queue.

## 9. Protocol

Protocol `main` has the 0.9.3 merge. Access-token buy offers live in their own module, and the authority gateway uses that module. Licensing notes were updated with that merge.

The 0.9.4 security work on its branch covers ownership transfer, the platform-fee cap, wrapper bindings, write-once payment processors, content-ID claims, and the payment guards, with adversarial tests behind those changes.

## 10. Hyper

The Android app and the engine took a security pass. Shared files leave location out. Lock-screen and overlay handling is tighter. Group, comment, and log sizes are capped. The engine caps landed with that pass, and unused desktop and tab code came out.

The Android translation layer runs apps inside ElastOS.

## 11. Elastos.org

`website-rebuild-2026` moved on 30 September: the council section, the capsules graphic, and the sidechain copy brought in line with the current network.

## 12. Essentials, the DAO, and the Ledger App

**Essentials.** The bottom bar is fixed. Staking and votes sit on the home widgets, with a prompt when a vote is near expiry. The in-app browser was rebuilt, checks a public phishing list, and the store age rating is 16+. Settings search understands a seed phrase without an exact string match. Seed-phrase material is cleared when the app closes.

**DAO.** The new site design is integrated on the working line. A proposal to return about **46,000 ELA** to the DAO treasury was prepared. Design work on a council-signed bridge reads mainchain blocks for the path between mainchain and Ethereum.

**Ledger.** A pull request for the current app is with the vendor.

**Mainchain.** Remediation of the Halborn findings on **v1.0.3** continued. Elastos.Node remains **v1.2.4**.

## 13. PC2 and the Chain

PC2 remained on **v1.4.0**. This week’s `pc2.net` commits are the publication of weekly #39.

ESC and EID stayed open. PG cross-chain stayed off. Public chain repositories stayed on their current releases.

## 14. Summary

| Repo | What landed |
|---|---|
| elastos-runtime | **[v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1)** on `main` · `develop` **214** ahead · isolation, updates, models, Home, Community, protected content |
| elacity-web | **6** commits · **4.6.8** · Offers tab |
| drm-api-layer | **11** commits · **0.13.2** |
| v3-drm-protocol | **0.9.3** on `main` |
| events-watcher | Access-offer events |
| Hyper / Hey-engine | Security pass, 2–3 October |
| elastos (`website-rebuild-2026`) | Council, capsules graphic, sidechain copy · 30 September |
| pc2.net | **v1.4.0** |
| Elastos.Node | **v1.2.4** |

---

### Quick fact card

| Fact | Value |
|---|---|
| Previous / this | [#39](https://github.com/Elacity/pc2.net/discussions/39) · [#40](https://github.com/Elacity/pc2.net/discussions/40) |
| Runtime | **[v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1)** · 30 September |
| `develop` | **214** commits ahead of `main` |
| Isolation | [PR 188](https://github.com/Elacity/elastos-runtime/pull/188) · [PR 195](https://github.com/Elacity/elastos-runtime/pull/195) · [PR 197](https://github.com/Elacity/elastos-runtime/pull/197) · [PR 202](https://github.com/Elacity/elastos-runtime/pull/202) |
| Protected content | [PR 203](https://github.com/Elacity/elastos-runtime/pull/203)–[PR 206](https://github.com/Elacity/elastos-runtime/pull/206) |
| Phone / desktop | [PR 116](https://github.com/Elacity/elastos-runtime/pull/116) · [PR 134](https://github.com/Elacity/elastos-runtime/pull/134) |
| Marketplace | web **4.6.8** · drm **0.13.2** · Offers tab |
| Protocol | **0.9.3** on `main` |
| Essentials / DAO / Ledger | Home and browser · new DAO design · vendor pull request |
| Hyper | Security pass on Android and the engine |
| Mainchain / ESC | Online · ESC/EID **open** · PG **off** |
| Node | **v1.2.4** |
| PC2 | **v1.4.0** |

---

*Cadence: weekly updates. Previous report — [Week of September 19 – September 26, 2026 (#39)](https://github.com/Elacity/pc2.net/discussions/39). This report — [#40](https://github.com/Elacity/pc2.net/discussions/40).*
