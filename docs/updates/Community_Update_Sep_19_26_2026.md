Elacity Labs — Weekly Team Update for the World Computer Initiative (WCI)

**September 19 – September 26, 2026**

**A protected file was read on an installed Home.** The creator can choose the channel, USDC listings settle at the scale they show, and the approval screen is readable. The market shelf shows protected items again after they had been hidden since late August. One button rebuilds a copy you already own, and a purchase in progress stays visible after reload. Buying from a live offer — by shared link or from Explore — is on a follow-up branch. **Home** can use an image you own as the desktop, the Assistant toggle carries the Elastos mark, and a phone layout is in progress on a local branch. **Models** moved onto a 0.7.2 line: exact offers, owner-gated hosted routes, and more installed evidence. Public model Get is **not** accepted. **Marketplace** (ela.city) had the largest product week the first pass missed: search, live activity, notifications and email, cart and batch mint, creator analytics, reports, and referral links. Web still **4.6.8**, drm-api still **0.13.2**. **Essentials** and the **DAO** stayed local. The DAO’s old 2021 ELA/ETH position was emptied and a small test position is live; the rest of the liquidity is not in yet. The **Ledger** app has a private review branch and has not been submitted. **Halborn** on mainchain **v1.0.3** still underway. ESC / EID stay **open**; PG cross-chain stays **off**. Runtime `main` is still **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)** — **no 0.7.1 tag**. The preview host is **not** posted. PC2 product-quiet.

**Chain status:** mainchain producing under BPoS. ESC and EID producing; main ↔ ESC / EID open. **PG / PGP cross-chain ELA stays disabled.** Halborn’s independent review of pending **v1.0.3** continues (Elastos.ELA only this round). Private ESC / EID / Arbiter trees were quiet. Exchanges that froze ESC / EID deposits should contact the Elastos DAO before reopening. [Sidechains resume](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem](https://blog.elastos.net/announcement/main-chain-postmortem-august/).

> **Installed protected read** · shelf visible again · offer buy on a branch · Home wallpaper + Assistant mark · phone layout **local** · 0.7.2 model evidence · marketplace search / activity / notifications · Essentials / DAO **local** · LP test position only · Ledger **not submitted** · **Halborn underway** · no 0.7.1 tag · preview host **not posted** · PC2 quiet.

---

## Key Links This Week

- **Previous report** — [Week of September 14 – September 18, 2026 (#38)](https://github.com/Elacity/pc2.net/discussions/38)
- **This discussion** — [#39](https://github.com/Elacity/pc2.net/discussions/39)
- **Elastos status** — [Sidechains resume (1 Sep)](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/) · [honest recovery log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md)
- **Runtime** — [Elacity/elastos-runtime](https://github.com/Elacity/elastos-runtime) · **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)** still latest tag · follow-up **[PR 62](https://github.com/Elacity/elastos-runtime/pull/62)** · offer buy **[PR 70](https://github.com/Elacity/elastos-runtime/pull/70)** · desktop **[PR 67](https://github.com/Elacity/elastos-runtime/pull/67)** · Assistant mark **[PR 68](https://github.com/Elacity/elastos-runtime/pull/68)** · alignment **[PR 69](https://github.com/Elacity/elastos-runtime/pull/69)** · models **[PR 71](https://github.com/Elacity/elastos-runtime/pull/71)** · release path **[PR 51](https://github.com/Elacity/elastos-runtime/pull/51)**
- **Marketplace** — elacity-web **4.6.8** (~119 commits) · drm-api **0.13.2** (~75) · access offers on v3 `release/0.9.3` (not tagged; latest tag **0.9.2**)
- **Install (PC2 node)** — `bash <(curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/update.sh)`
- **Live surfaces** — map.ela.city · portal.ela.city · blockchain.elastos.io · elacitylabs.com · elacitylabs.com/provenance

## Table of Contents

1. The Big Picture — An Installed Read, a Marketplace Week
2. Elastos Status — ESC / EID Open, Halborn Underway
3. Protected Content — Read, Shelf, Owned Copy
4. Market Buy and Access Offers
5. Home — Wallpaper, Mark, Phone Layout
6. Models — 0.7.2 Evidence, Acceptance Still Open
7. Marketplace — Search, Activity, Notifications, Cart
8. Hyper / Hey
9. Elastos.org — Still the Rebuild Branch
10. Essentials Overhaul — Still Local
11. Elastos DAO — Local Participation, Not Public
12. DAO ELA/ETH Pool — Test Position Only
13. Elastos Ledger App — Review Branch, Not Submitted
14. PC2 — Quiet by Design
15. Release Engineering
16. Convergence Lens
17. Looking Ahead
18. Summary Statistics
19. Notes

---

## 1. The Big Picture — An Installed Read, a Marketplace Week

[#38](https://github.com/Elacity/pc2.net/discussions/38) left the installed mint → buy → play journey open, the preview host unposted, and the marketplace on shop / cinema / mint plus the GCloud encode cuts. This week splits four ways.

**Protected content (Irzhy).** Three squash commits repack the follow-up line. Most of that text was already in #38. What is new: a protected file opened and read on an installed Home; the creator picks the channel; USDC no longer settles at the wrong scale; the approval screen can be read; the shelf shows protected rows again; Download rebuilds an owned copy; a purchase in progress survives reload. **[PR 62](https://github.com/Elacity/elastos-runtime/pull/62)** is still open. Buying from any live offer is **[PR 70](https://github.com/Elacity/elastos-runtime/pull/70)**. See §3–§4.

**Home and models.** Wallpaper from your own Library (**[PR 67](https://github.com/Elacity/elastos-runtime/pull/67)**), the Elastos mark on the Assistant toggle (**[PR 68](https://github.com/Elacity/elastos-runtime/pull/68)**), alignment rules for the two-platform installer (**[PR 69](https://github.com/Elacity/elastos-runtime/pull/69)**). Phone Home layout is a large local branch, not a pull request. Models continued on **[PR 71](https://github.com/Elacity/elastos-runtime/pull/71)** — evidence and binding, not acceptance. See §5–§6.

**Marketplace.** First-pass Runtime drafts missed this again. ela.city and drm-api shipped search, a live activity stream, in-app / push / email notifications, a cart with one confirmation, batch mint, creator analytics, reports, and referral links. Versions did not bump. See §7.

**Essentials, DAO, pool, Ledger.** All local or private. Nothing in that set is a public release. See §10–§13.

**Not this week’s invention:** the signed-model Mac journey, custody-only nodes, and the GCloud encode cuts were #38. The three squash commits on PR 62 mostly restate that surface. Say what changed on top.

**Chain / PC2.** No new public certificate. No PC2 product commits after #38. See §2 and §14.

## 2. Elastos Status — ESC / EID Open, Halborn Underway

*Public framing only. Finding registers and unpublished recovery trees stay inside the recovery engagement.*

| Surface | Status |
|---|---|
| **Mainchain** | Online under BPoS · still being hardened |
| **Pending mainchain review** | **Halborn** Secure Code Review of **v1.0.3** — started 28 August · Elastos.ELA only this round |
| **ESC / EID** | **Open** — producing since 1 September |
| **Main ↔ ESC / EID** | **Open** |
| **PG / PGP ↔ main** | **Disabled** |
| **Exchanges / custodians** | Contact the Elastos DAO before reopening ESC / EID deposits or withdrawals |
| **CRC Incident Recovery (KuCoin flow)** | **Complete** — if you were affected and have not heard from KuCoin, contact their support |

No new public blog this window. Operator toolkit remains **[Elastos.Node v1.2.4](https://github.com/elastos/Elastos.Node/releases/tag/v1.2.4)**. Private ESC / EID / Arbiter / ELA trees were quiet.

## 3. Protected Content — Read, Shelf, Owned Copy

**[PR 62](https://github.com/Elacity/elastos-runtime/pull/62)** · `feat/protected-content-0.7.1-followup` · still **open**.

On 21 September the branch was rewritten into three themes. Treat those as a history pack of work #38 already described (Creator → readable object, custody and external wallets, a shelf and replicas), not as a second copy of that week.

**New on top of that pack:**

- **Installed read.** A protected file opened and was read on an installed Home. External-wallet open now waits through the approved-but-unsigned moment instead of failing with an empty rights signature.
- **Consent you can read.** The approval screen shows a short, hashed message. It no longer dumps an unreadable blob.
- **Creator chooses the channel.** Channels come from an on-chain index for discovery. The directory is not the authority. Source digests moved to a `/v2` domain; `/v1` mints are refused.
- **USDC scale.** Listings were settling far below the price on screen. The pay token is now an explicit term, with an allow-list of decimals.
- **One wire.** Runtime and chain-provider field shapes live in one shared crate, so a mismatch fails in tests instead of in front of a person.
- **Shelf.** Since late August the listing parser had refused every row that carried an availability receipt, so protected items were invisible. Those rows load again. The first open shows the approval step and retries, instead of rendering “unavailable” and stopping.
- **Owned copy.** Download rebuilds a `.ddrm` when a live access read says the account holds the token. A local purchase note is not itself a grant. A purchase already in progress shows Continue after reload.
- **Faster reads.** Verified ciphertext is staged once and each range is seeked, instead of re-fetching the whole object between chunks.
- **Replicas.** A replica is made by sending the bytes. A real local pin counts. The peer’s own pin can settle.
- **ERC-20 head read.** Payment is read at the chain head, corroborated across sources, instead of waiting out a long finality re-read on every sale.

**Still open:** the long confirmation wait is still easy to read as a dead end rather than a wait. The full installed mint → list → buy → open → play → close journey is **not** release acceptance. PR 62 is not merged. `main` did not move.

## 4. Market Buy and Access Offers

**Runtime — [PR 70](https://github.com/Elacity/elastos-runtime/pull/70)** (`feat/protected-content-listing-buy`, open). A buyer can purchase from a live offer found through a shared link or in Explore. Chain lookups cover token URI, the content-id binding, and the live offers. A listing can be rebuilt from shared data. A purchase record is kept.

Adopting that purchase onto a Home that did not list the item — from shared metadata, with owned items marked purchased even when this Home has no listing — is **in progress**. An asset protected somewhere else should open where it was protected. That adoption is not claimed complete.

**Contracts — v3 `release/0.9.3`.** Four commits: shared-custody access offers, BUSL-1.1 on the protocol implementations, version **0.9.3**, and a reconcile of licensing scope and activation checks. Buyers can post offers for an operative’s access token, paid in native currency or ERC-20. Holders fill with a check that price and payment token cannot change underneath them. Offers can be cancelled. Checkout and offer changes share one reentrancy lock. The royalty pool must be fully allocated before payment.

**Not live.** Latest tag is still **0.9.2**. Activation is a separate step, gated on release evidence. Do not treat 0.9.3 as something you can use on a public market today.

## 5. Home — Wallpaper, Mark, Phone Layout

**[PR 67](https://github.com/Elacity/elastos-runtime/pull/67)** — set one image you own as the desktop background. Runtime reads it under the caller’s own root and accepts PNG, JPEG, WebP, or GIF from the bytes. App tokens and foreign or non-image sources are refused. Library gets the menu item and lazy thumbnails. Wallpaper bytes are served so a locked-down capsule can actually paint them.

**[PR 68](https://github.com/Elacity/elastos-runtime/pull/68)** — the Assistant toggle shows the Elastos mark. A click plays a short motion, then opens. Reduced motion skips it. Focus return no longer pops a dock label. Presentation only.

**[PR 69](https://github.com/Elacity/elastos-runtime/pull/69)** — the alignment gate matches the installer it guards: Linux x86_64 / aarch64 and Apple silicon. Other platforms fail closed. Browser protocol revision is the shared contract’s 2.1. No tag. README still says the candidate is not published.

**Phone layout** — about **64** commits on a **local** branch (`feat/home-phone-layout`). Not opened as a pull request. The phone Home is the app grid: 44 px targets, sheets from the bottom, long-press menus, a push drawer for sidebars, Spotlight and Notification Centre readable on a narrow stage, Reconnecting when the gateway stops answering. This is not in the 0.7.1 preview and not on `main`.

## 6. Models — 0.7.2 Evidence, Acceptance Still Open

**[PR 71](https://github.com/Elacity/elastos-runtime/pull/71)** (`feat/0.7.2-models`) and the CI pin beside it (`fix/0.7.2-model-ci-node`) carried most of Anders’ week. A large share of those commits are evidence notes. The code that moved:

- Local offers activate after admit, without a restart.
- A shared model is requested from a signed contact catalogue, bound to one offer revision.
- Hosted effects stay tied to the authorized run and to an Inbox connection the owner staged.
- Hosted setup is hidden for guest accounts. The owner can end a hosted route.
- Linux model-provider sockets are confined at launch.
- Content receipt lookup is scoped to the CID that was asked for (also on the seed deploy branches).
- Browser Close has fresh headless and installed smoke. Content cancellation stays an open criterion.

Installed SmolLM2 Get attempts are **recorded**. They are **not** acceptance. Public model Get, remote Qwen on the current candidate, and the Browser reload gate from #38 are still open. A temporary hosted demo route is not a public API product. **No 0.7.2 tag.** The preview host stays unposted.

## 7. Marketplace — Search, Activity, Notifications, Cart

Versions did not bump. **elacity-web ~119** commits and **drm-api-layer ~75**, both on `release/base-network`, plus one events-watcher commit and two on v1-rest. This is the live ela.city path, not a new storefront brand.

**Search.** Navbar search moved to GraphQL `searchAll`, then Atlas for ranked results, zero-result analytics, click tracking, and an admin search tab. Result thumbs and vocabulary match the rest of the product.

**Activity.** A live stream: trade, subscription, and reward events fan out as a ping, and the page refetches. Paginated feeds keep the newest page subscribed. Transfer batches are covered. Anonymous subscribe works on public channels.

**Notifications.** In-app feed, grouping, dismiss, preferences, and badge hygiene. Web push (opt-in, service worker, retry when the worker is still installing). Email for verify, welcome, and the sale / subscription events, branded and pointed at the earnings pages. Alert choices sit on the profile email field. `.city` addresses are accepted.

**Buy and mint.** A marketplace cart checks out in one confirmation. Multi-asset mint deploys with one signature. Cards show scarcity, ratings, and media type. Sales export to CSV. A one-time install prompt exists for the PWA.

**Creator tools.** Funnel, audience, and trend panels. Average order value. Page views split from plays. Owner self-ratings are blocked.

**Trust.** Report on an asset, an admin moderation queue, and a delisted notice. Royalty browse sums offers instead of returning every row.

**Referral.** An Affiliate tab, short referral codes, and binding when a new creator mints or opens a shop. Eligibility ignores a stored link for wallets that are already creators or holders. The mint footnote states a platform fee. This is product wiring on the current site, not a new public launch announcement.

**API companions.** drm-api holds the search service, the activity fanout, notification feed and push prefs, creator-analytics rollups, flags, CSV-shaped trade history, Mongo-first listings, and a short-lived cache for entitlement reads. Referral and share services were lint-cleaned so CI passes. events-watcher includes the log index on the event payload. v1-rest starts transfer history at the contract’s creation block, and escapes search input.

**Still 4.6.8 / 0.13.2.** No marketplace release tag this window.

## 8. Hyper / Hey

**Hyper** 2 commits on `main`: live file-upload percent; VPN egress pinned to Hyper’s own route; block-from-chat writes every block list; one Send tap produces one message id.

**Hey-engine** 2 commits on `field-invite-chatpub`: leftover outbox remesh parked; a via-relay hop kept on the first missed stream ack; high-RTT relay video held to a talking-head bitrate; chat restored on Unblock.

**Hyper homepage** 2 commits: a first static homepage pass, then a personal demo host removed from the docs. Do not treat that host as a public URL.

Still **source / sideload**. No store tag. No ElastOS capsule launch. Group chat on a fresh Runtime install is still not in a preview.

## 9. Elastos.org — Still the Rebuild Branch

One more commit on `website-rebuild-2026`: stats alignment, a photo strip, and a noindex flag so the branch is not treated as the live site. `main` did not move. **Not** a production flip.

**elacitylabs.com** had no commits this window.

## 10. Essentials Overhaul — Still Local

**In development. Not a store release.**

This week consolidated an incoming working build into one candidate and checked it in the iOS Simulator. Edit Profile saves only on an explicit Save. Credential import, replacement, and sharing warn on duplicates. Published identity shows a review that says publication is public and permanent. Retries and cancellation stay tied to the profile that started them. Raw identity create, update, transfer, and deactivation get an exact-request review.

Signing requests show addresses, typed messages, token amounts, and approval permissions more clearly. Decline stays reachable on a long request. Unavailable fees and uncertain balances are named. Checks confirm the request, wallet, network, and reviewed payload still match before approval continues. Verification used safe test requests. **No financial transaction was signed.**

Also: document and credential writes that fail or come back uncertain; browser URL and late search results; Add Token when the wallet or network changes; BPoS node choices kept local until review; Hub still Elastos Main Chain only. Shared menus, sheets, and destructive actions moved forward. The full visual audit is not done. Real deletion of accounts and credentials was not broadly tested.

## 11. Elastos DAO — Local Participation, Not Public

**In development and local verification. Not deployed.**

The local stack is running again: PostgreSQL, backend, and the site, on the 410 retained legacy records. Accounts and protected sessions. Suggestion drafts, saved revisions, and explicit publication. Comments and replies on proposals and suggestions. Public profiles and private following. Those screens were exercised locally with a **synthetic** identity, not live Essentials sign-in.

Native governance moved on registration and voting history, withdrawal references, signature verification, transaction preparation, and council / proposal reads. That is not a claim that live voting or staking is safe to open. Live Essentials sign-in is still the replacement for the synthetic authority, and it is not in this build.

## 12. DAO ELA/ETH Pool — Test Position Only

**Rebuild in progress. Not a request to send funds.**

The inactive 2021 position was emptied. **16.97 ETH** and **125,211 ELA** returned to the DAO wallet, including about 17 ETH of uncollected fees. A new range of **$0.20 to $1.00** was chosen. A **0.5 ETH** test position is live and trading. Recorded cost of the test so far is about **$10**.

The rest of the liquidity has **not** been added. There is no date on that step.

## 13. Elastos Ledger App — Review Branch, Not Submitted

**Private review branch. Not released. Not submitted to Ledger.**

Ledger asked for security and compliance changes before the next listing review. Two reviews were combined into one issue list. The choice was to update the existing app so Essentials compatibility stays, rather than replace it. Sixteen changes are prepared: stricter transaction checks, clearer review screens, hardening, and Ledger’s current build layout. The build reports zero compiler warnings and asks only for the minimum device permissions. Reported test runs passed. One Ledger-controlled database entry is still outside local sign-off.

Ledger no longer accepts Nano S app updates. The planned device set is Nano X and Nano S Plus. Still ahead: remaining review items, the GitHub build, a physical device, and only then a submission.

## 14. PC2 — Quiet by Design

`pc2.net` — **zero** commits after #38. Operator line remains **v1.4.0**.

0.7.1 is still a Runtime-only line. PC2 waits until the capsule contract on PR 62 is what the node consumes.

## 15. Release Engineering

| Item | Status |
|---|---|
| Runtime `main` | Unchanged · **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)** · tip `8ac18bec` |
| 0.7.1 preview host | **Not posted** · installer **not** a consumer download · **no** 0.7.1 tag |
| Protected content | **PR 62** open · installed read landed · full journey **not** accepted |
| Offer buy | **PR 70** open · adoption **in progress** |
| Home surface | **PR 67** · **PR 68** · **PR 69** open · phone layout **local only** |
| Models | **PR 71** open · evidence, not acceptance · **no** 0.7.2 tag |
| Marketplace | web **4.6.8** · drm **0.13.2** · v3 branch **0.9.3** untagged (tag still **0.9.2**) |
| PC2 | Quiet · **v1.4.0** |
| Elastos.Node | **v1.2.4** |
| Halborn | v1.0.3 · **underway** |
| ESC / EID | **Open** · PG **closed** |
| Essentials / DAO | **Local** · DAO **not deployed** |
| ELA/ETH pool | Old position emptied · **0.5 ETH** test live · remainder **not** added |
| Ledger app | Private branch · **not submitted** |

## 16. Convergence Lens

| Theme | Runtime (this week) | Marketplace / Hyper / chain / Infinity |
|---|---|---|
| Protected content | Installed read · shelf visible · owned-copy download · **PR 62** | Cinema / mint paths from prior weeks still the live shop |
| Market buy | Live-offer buy by link or Explore · **PR 70** | v3 access offers on **0.9.3** branch · activation separate |
| Home | Wallpaper · Assistant mark · phone layout local | — |
| Models | Exact-offer grants · hosted route owner can end · Get **not** accepted | — |
| Marketplace | — | Search, live activity, push + email, cart, batch mint, analytics, reports, referral |
| Mesh | — | Hyper upload / block lists · Hey relay video · sideload |
| Wallet / DAO | — | Essentials review screens, **no** signed funds · DAO local, synthetic sign-in |
| Treasury | — | 2021 LP emptied · test position only |
| Chain | — | ESC/EID **open** · Halborn **underway** |
| PC2 | — | Zero commits · **v1.4.0** |

## 17. Looking Ahead

1. Show the long confirmation on PR 62 as a wait. The installed read is not the full journey, and it is not a tag.
2. Finish adopting a market purchase onto a Home that did not list it (**PR 70**). Keep v3 offer activation gated until the release evidence is there.
3. Land **PR 67**, **PR 68**, and **PR 69** on their own. The phone layout needs a pull request before anyone treats it as shared.
4. Keep collecting model Get and Browser evidence on **PR 71**. Do not call Get accepted until the public candidate passes.
5. Soak ela.city search, activity, notifications, and cart on the current 4.6.8 / 0.13.2 line.
6. **PC2** stays quiet until this capsule contract is what the node consumes.
7. **Essentials** and **DAO** stay local until live sign-in replaces the synthetic authority. No store or public-domain claim from this week.
8. The ELA/ETH remainder stays out of the pool until that step is actually done. The Ledger app stays unsubmitted until the device pass and Ledger’s remaining item are done.
9. **Do not tag 0.7.1** on this evidence. **[PR 51](https://github.com/Elacity/elastos-runtime/pull/51)** is still the path onto `main`. The preview host stays unposted until the team says otherwise.

## 18. Summary Statistics

**Week of** September 19 – September 26, 2026 (after #38). Counts are commits on the active branch in the window, not a claim each one is new product. Runtime SHAs were deduped across remotes (~220 unique). The 0.7.2 model branch and its CI pin overlap heavily, and many of those commits are evidence notes. The three PR 62 squashes restate #38.

| Repo | Commits | Notes |
|---|---|---|
| pc2.net | **0** | Quiet after #38 |
| elastos-runtime | **~220** unique | PR 62 / 67 / 68 / 69 / 70 / 71 · phone branch local · `main` unmoved |
| elacity-web | **~119** | still **4.6.8** |
| drm-api-layer | **~75** | still **0.13.2** |
| v3-drm-protocol | **4** | `release/0.9.3` · tag still **0.9.2** |
| events-watcher | **1** | log index on the payload |
| v1-rest-server | **2** | history start block · search escape |
| Hyper | **2** | upload percent · block lists |
| Hey-engine | **2** | `field-invite-chatpub` |
| Hyper-Homepage | **2** | static pass · demo host removed from docs |
| elastos (`website-rebuild-2026`) | **1** | noindex · **not** live default |
| ElacityLabsWeb | **0** | quiet |
| ESC / EID / Arbiter / ELA (private) | **0** | not public GitHub |
| Elastos.Node | **0** | still **v1.2.4** |

**Runtime:** Anders Alm — models, seed receipt scope, Browser close evidence · Irzhy Ranaivoarivony — protected content and offer buy · SashaMIT — wallpaper, Assistant mark, alignment, phone layout.

**Marketplace:** SashaMIT — ela.city, drm-api, events-watcher, v1-rest.

**Also this week, not in those repos:** Essentials consolidation and review flows · DAO local accounts, comments, profiles · ELA/ETH pool test position · Ledger review branch. Plus small setup work that is not listed line by line.

**Releases.** None tagged. Latest Runtime tag **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)**. PC2 **v1.4.0**. Marketplace **4.6.8** / **0.13.2**. Essentials, DAO, and the Ledger app are **not** public releases.

## 19. Notes

- **Chain recovery internals** stay out. Resume post, Halborn status, and KuCoin CRC completion are the community-safe chain facts.
- **0.7.1** is not tagged. The preview host is not posted. The device installer is not a consumer download.
- **PR 62 squashes** mostly restate #38. The installed read, the shelf fix, Download, and the USDC scale fix are the new claims.
- **PR 70** and v3 **0.9.3** are branches. Offer activation is not done.
- **Phone Home** is a local branch until it is a pull request.
- **Model Get** evidence is not acceptance.
- **Hyper / Hey** remain source and sideload.
- **Essentials / DAO** are local. DAO sign-in in this build is synthetic.
- **ELA/ETH** figures are the treasury test the team reported. They are not an instruction to move funds.
- **Ledger** changes are prepared. The app is not submitted.
- **PC2** zero commits is by design.
- Bare issue numbers in headings are written as “PR 62” so GitHub does not auto-link another repository.

---

### Quick fact card

| Fact | Value |
|---|---|
| Previous / this | [#38](https://github.com/Elacity/pc2.net/discussions/38) · [#39](https://github.com/Elacity/pc2.net/discussions/39) |
| Runtime | **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)** · **no 0.7.1 tag** |
| Preview host | **Not posted** |
| Protected content | Installed read · shelf visible · **PR 62** open |
| Offer buy | **PR 70** · v3 **0.9.3** branch untagged |
| Home | **PR 67** · **PR 68** · **PR 69** · phone **local** |
| Models | **PR 71** · Get **not** accepted |
| Marketplace | web **4.6.8** · drm **0.13.2** · search / activity / notifications / cart |
| Essentials / DAO | Local · DAO **not deployed** |
| ELA/ETH pool | 2021 position emptied · **0.5 ETH** test · remainder out |
| Ledger | Private branch · **not submitted** |
| Hyper / Hey | Sideload · Hey on a field branch |
| Halborn | ELA **v1.0.3** · **underway** |
| Mainchain / ESC | Online · ESC/EID **open** · PG **closed** |
| Node | **v1.2.4** |
| PC2 | Quiet · **v1.4.0** |

---

*Cadence: weekly updates. Previous report — [Week of September 14 – September 18, 2026 (#38)](https://github.com/Elacity/pc2.net/discussions/38). This report — [#39](https://github.com/Elacity/pc2.net/discussions/39).*
