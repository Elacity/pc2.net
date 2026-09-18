Elacity Labs — Weekly Team Update for the World Computer Initiative (WCI)

**September 14 – September 18, 2026**

**The signed 0.7.1 preview is live** — [Home](https://elastos.elacitylabs.com/home/) on the matching Linux Runtime, existing accounts preserved. A fresh Apple silicon install completed the first **signed-model journey**: catalogue discovery, Marketplace Get through Content and Carrier, Assistant replies, reload, full Runtime restart, and reuse without another download. Remote Qwen also ran from a Linux seed through a Mac service path (owner-approved). **Protected content** widened past video: any-file protect / read, audio in the same plane, custody-only nodes, external wallets, one mint effect, owned mints as Library items, honest progress and failures. **Marketplace** kept moving on the live shop/cinema/mint paths (web still **4.6.8**, drm-api still **0.13.2**, **~29 / ~18** commits). **Essentials** overhaul and the **DAO** rebuild continued locally — neither is a public release. Research confirmed a **direct ELA (Ethereum) → Elastos main chain** route is possible; nothing has been built and no funds have moved. **Halborn** on mainchain **v1.0.3** still underway. ESC / EID stay **open**; PG cross-chain stays **off**. `main` is still **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)** — **no 0.7.1 tag**. Full release acceptance is **open**. PC2 product-quiet. ELA tip ~**2,297,118**.

**Chain status:** mainchain producing under BPoS. ESC and EID producing; main ↔ ESC / EID open. **PG / PGP cross-chain ELA stays disabled.** Halborn’s independent review of pending **v1.0.3** continues (Elastos.ELA only this round). Exchanges that froze ESC / EID deposits should contact the Elastos DAO before reopening. [Sidechains resume](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem](https://blog.elastos.net/announcement/main-chain-postmortem-august/).

> **0.7.1 preview live** · first signed-model journey · protected content past video · marketplace shop/cinema/mint paths · Essentials / DAO **local** · ETH→main **research only** · **Halborn underway** · ESC/EID **open** · no 0.7.1 tag · PC2 quiet.

---

## Key Links This Week

- **Previous report** — [Week of September 8 – September 13, 2026 (#37)](https://github.com/Elacity/pc2.net/discussions/37)
- **This discussion** — [#38](https://github.com/Elacity/pc2.net/discussions/38)
- **Elastos status** — [Sidechains resume (1 Sep)](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/) · [honest recovery log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md)
- **Runtime** — [Elacity/elastos-runtime](https://github.com/Elacity/elastos-runtime) · **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)** still latest tag · preview [Home](https://elastos.elacitylabs.com/home/) · follow-up **[PR 62](https://github.com/Elacity/elastos-runtime/pull/62)** · review **[PR 64](https://github.com/Elacity/elastos-runtime/pull/64)** (unchanged) · UI **[PR 65](https://github.com/Elacity/elastos-runtime/pull/65)** · hosted-inference plan **[PR 66](https://github.com/Elacity/elastos-runtime/pull/66)** · release path **[PR 51](https://github.com/Elacity/elastos-runtime/pull/51)**
- **Marketplace** — elacity-web **4.6.8** · drm-api **0.13.2** · API **[PR 23](https://github.com/Elacity/drm-api-layer/pull/23)–[PR 26](https://github.com/Elacity/drm-api-layer/pull/26)** merged · **[PR 22](https://github.com/Elacity/drm-api-layer/pull/22)** still open
- **Install (PC2 node)** — `bash <(curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/update.sh)`
- **Install (Runtime preview)** — `curl -fsSL https://elastos.elacitylabs.com/install.sh | bash`
- **Live surfaces** — [elastos.elacitylabs.com](https://elastos.elacitylabs.com/) · map.ela.city · portal.ela.city · blockchain.elastos.io · elacitylabs.com · elacitylabs.com/provenance

## Table of Contents

1. The Big Picture — Preview Live, Two Runtime Rails, Marketplace Moved
2. Elastos Status — ESC / EID Open, Halborn Underway
3. Runtime Preview — Signed 0.7.1 Home, Acceptance Still Open
4. Protected Content — Past Video, Honest Mint / Custody
5. Models, Installer, Assistant
6. Browser, Wallet, UI Reviews
7. Marketplace — Shop, Cinema, Mint, drm-api
8. Hyper / Hey
9. Essentials Overhaul — Still Local
10. Elastos DAO Overhaul — Not Public
11. ELA on Ethereum → Main Chain — Research Only
12. PC2 — Quiet by Design
13. Release Engineering
14. Convergence Lens
15. Looking Ahead
16. Summary Statistics
17. Notes

---

## 1. The Big Picture — Preview Live, Two Runtime Rails, Marketplace Moved

[#37](https://github.com/Elacity/pc2.net/discussions/37) left 0.7.1 as a merged integration line plus review **[PR 64](https://github.com/Elacity/elastos-runtime/pull/64)**, installer still “not a consumer download.” This cycle the **signed preview is public**, and the week split three ways.

**Rail one — protected content (Irzhy).** The follow-up branch generalises protection past video: documents, images, 3D, books, comics, archives; audio through the same player plane; the protection scheme declared in-band on the media container; custody-only nodes with kubo peering and bounded replica fan-out; external wallets; one mint effect; owned mints as Library items; dispatch-time custody statements; a truthful failure taxonomy; a second attempt that works. **[PR 62](https://github.com/Elacity/elastos-runtime/pull/62)** tracks that head. Source suites are green. The installed mint → buy → play journey is **not** accepted. See §4.

**Rail two — models, publisher, Assistant (Anders).** A signed two-entry catalogue (SmolLM2 + Qwen) installs into managed Home. Publisher promotes the release head last, from verified staging. The installer probes the staged binary and stages the catalogue before replacing anything. A fresh Mac install completed Get → Assistant → restart → reuse. Remote Qwen from Linux seed through Mac is recorded. Browser recovery advanced, then paused so model delivery could close. **[PR 64](https://github.com/Elacity/elastos-runtime/pull/64)** did not move. **[PR 65](https://github.com/Elacity/elastos-runtime/pull/65)** / **[PR 66](https://github.com/Elacity/elastos-runtime/pull/66)** opened. See §5–§6.

**Marketplace.** First-pass Runtime-only drafts missed this. Web **~29** commits: one-click mint, shop create/index, cinema orderbook, sign-on-play, subscriptions, revenue honesty. drm-api **~18** commits: metadata race, TransferBatch quantities, channel indexing, comments/ratings, IPFS provider count. Versions unchanged (**4.6.8** / **0.13.2**). See §7.

**Not this week’s invention:** Runtime-owned authority cutover, storefront + canonical Home in source, kit-first passkey, unified Assistant as a *first* Mac reply — those were #37. This week is the **public preview**, the **signed-model journey**, and **protection past video**. A lot of the week was also small setup / recovery / flow-fit work that does not show up as a headline commit.

**Essentials / DAO / ETH→main.** Live-app review and blocked-flow repairs on Essentials (still not store-released). DAO rebuild now serves real proposal / council / suggestion pages internally — **not deployed**. Direct ELA-on-Ethereum to main-chain route mapped; **research only**. See §9–§11.

**Chain / PC2.** No new public certificate. No PC2 product commits. See §2 and §12.

## 2. Elastos Status — ESC / EID Open, Halborn Underway

*Public framing only. Finding registers, live-defect recipes, and unpublished recovery trees stay inside the recovery engagement.*

| Surface | Status |
|---|---|
| **Mainchain** | Online under BPoS · tip ~**2,297,118** · still being hardened |
| **Pending mainchain review** | **Halborn** Secure Code Review of **v1.0.3** — started 28 August · report targeted early October · Elastos.ELA only this round |
| **ESC / EID** | **Open** — producing since 1 September |
| **Main ↔ ESC / EID** | **Open** |
| **PG / PGP ↔ main** | **Disabled** |
| **Exchanges / custodians** | Contact the Elastos DAO before reopening ESC / EID deposits or withdrawals |
| **CRC Incident Recovery (KuCoin flow)** | **Complete** — if you were affected and have not heard from KuCoin, contact their support |

Long form: [Sidechains resume (1 Sep)](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/) · [honest recovery log](https://github.com/Elacity/pc2.net/blob/main/docs/updates/Elastos_ELA_Mainnet_Recovery_Honest_Log_2026-07.md).

No new public blog this window. Operator toolkit remains **[Elastos.Node v1.2.4](https://github.com/elastos/Elastos.Node/releases/tag/v1.2.4)**. Private ESC / EID / Arbiter / ELA trees were quiet.

## 3. Runtime Preview — Signed 0.7.1 Home, Acceptance Still Open

**`main` did not move.** Tip is still `8ac18bec` · **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)**. There is **no v0.7.1 tag**.

The public preview at [elastos.elacitylabs.com](https://elastos.elacitylabs.com/) serves signed 0.7.1 artifacts. [Home](https://elastos.elacitylabs.com/home/) is up; an existing account signed back in with saved work. A fresh install from scratch — name, passkey, Recovery Kit when you choose — reaches Home, then Marketplace, and can pull a signed model over Carrier from the seed catalogue. That path had a lot of small glue this week so the pieces stay inside the same flows.

**Open on the preview (not hidden):** the public Home can list the verified model but its own Get still needs a repair; remote Qwen is not restored on that public Home; Browser recovery and the final mint → buy → play journey are unfinished. Treat this as a **development preview**, not release acceptance.

**[PR 64](https://github.com/Elacity/elastos-runtime/pull/64)** is last week’s review baseline and did not advance. Current model / Assistant / installer work sits on `feat/remote-services`. Protected-content follow-up sits on `feat/protected-content-0.7.1-followup` / **[PR 62](https://github.com/Elacity/elastos-runtime/pull/62)**. Path onto `main` remains **[PR 51](https://github.com/Elacity/elastos-runtime/pull/51)**.

Team write-up (internal evidence, not a second weekly): [2026-09-18 team sync](https://github.com/Elacity/elastos-runtime/blob/19bb7a900da292983e198283ccf1b78d9748b335/docs/audits/2026-09-18-team-sync.md).

## 4. Protected Content — Past Video, Honest Mint / Custody

Nine commits on the follow-up line. Same Runtime-owned authority as #37 — this week **widens what it protects** and **tells the truth** while it does it.

- **Any-file path.** Object mint, chunked read-back, Elacity Reader for pictures, documents, text, 3D, books, comics, archives — one capsule format, per-kind viewers.
- **Audio.** Protects through an AAC fMP4 rendition and plays in the Elacity Player. The protection scheme is declared in-band on the media container. Cover art no longer hijacks the audio track.
- **Custody plane.** A node can be custody-only (ciphertext + policy, not a viewer), speak kubo, and fan out replicas with a bound. Peering mesh has proof it holds under partition. A creator mint can land in Home; publish is still slower than local pin (Carrier join), and that honesty is part of the open gate.
- **Mint / wallet.** External wallets; one mint effect; settle on confirmations; own a mint as a Library item; wait instead of refusing an in-flight action; re-ask when an approval lapses instead of stranding the mint.
- **Honesty.** Custody statements at dispatch time; named failures; real progress; stage-aware publish status; a second attempt that works. One kind of owned copy. A `.ddrm` capsule that describes itself (authority, KID, token, ledger, type, CID).
- **Review package.** Crypto review bundle (suite card, threat model, golden vectors) and standing-doc alignment — ready to send, not a completed external review.

**Still open:** installed J5 (mint → list → buy → open → play → close) on the current branch. Publish latency and truthful “still joining” progress are part of that gate. **[Issue 47](https://github.com/Elacity/elastos-runtime/issues/47)** / **[Issue 48](https://github.com/Elacity/elastos-runtime/issues/48)** stay the acceptance / review markers.

## 5. Models, Installer, Assistant

**Signed catalogue.** Two entries (SmolLM2-135M-Instruct and Qwen) install and copy into managed Home. The public installer stages and verifies the catalogue before replacing the Runtime.

**First installed journey (fresh Mac).** Discover the model without a hand-added source, admit the package through Marketplace + Content / Carrier, two Assistant replies, same chat and selection after reload and a full Runtime restart, reuse without another payload transfer. Stop that cannot settle honestly reports unknown — not a fake success.

**Remote Qwen.** Same Assistant contract as local. Mac owns the model; seed owns the conversation. Owner approves in Inbox; seed gets a reply computed on the Mac. Grant resume, revoke, replay, and capacity refusal have installed or focused evidence. Final second-principal denial and public-seed-to-Mac on *this* candidate are still open.

**Installer / publisher.** Head-last publication from verified staging (manifest never valid mid-write). Artifact rejection proved before state changes; clean rerun. Staged executable probed before it replaces the live binary. Health and bootstrap from distinct source URLs. Host Cargo cache reused for native Mac prep. musl / KVM ioctl hygiene so Alpine-class and native virt stay honest.

**Assistant follow-ups.** Composer draft saved as typed; Studio reachable and bound to its session; handshake after a capsule document reload. Failed runs stay visible after save/reload.

**[PR 66](https://github.com/Elacity/elastos-runtime/pull/66)** is a **docs** plan for attested hosted inference as another model-provider backend — not a shipped hosted product, not a remote-browser or third-party API launch.

## 6. Browser, Wallet, UI Reviews

**Browser.** Restore keeps `page_status` errors and visible recovery input. Audio ICE samples on the inbound RTP clock. Local and remote journeys advanced (navigation, input, video, decoded audio, close cleanup, profile persistence). Wallet-over-Carrier, file upload, endurance, and the remote reload gate are **not** accepted. Work is **paused** on the branch so model delivery could close — inventory kept, not abandoned (**[PR 65](https://github.com/Elacity/elastos-runtime/pull/65)** adapted Assistant sidebar modes, Library menu, window snap, light-bar wordmark).

**Wallet.** Lapsed approval asks again (see §4).

## 7. Marketplace — Shop, Cinema, Mint, drm-api

Versions did not bump. The **paths** did.

**elacity-web (~29 commits, still 4.6.8).** One-click mint (skip a redundant approval, never land on `/view/.../undefined`, honest pipeline progress + stall watchdog). Shop create redirects into the new shop; owner badge across wallet modes; channel→shop copy; directory sort. Cinema: sell-tab parity, Max quantity, orderbook tab for access-token listings. Player: sign-on-play lock states. Subscriptions: expired renewals in Manage, sidebar countdown. Revenue: unclaimed-rewards flicker gone; asset-only volume labeled honestly. IPFS availability on Properties. Placeholders use the Elacity mark.

**drm-api (~18 commits, still 0.13.2).** **[PR 23](https://github.com/Elacity/drm-api-layer/pull/23)–[PR 26](https://github.com/Elacity/drm-api-layer/pull/26)** merged: v3 shop banner indexing, owner-badge / `byAddress` fallback, CI image build on green merge, metadata insert-race (don’t discard a fetched document). Also: TransferBatch quantities on a single-event transport; `tokenURI` shapes normalised; thumbnail failure must not block channel index; subscription includeExpired; comment star ratings + in-place owner rate; IPFS provider-count endpoint; media-pipeline upload gated on wallet auth + rate limit.

**[PR 22](https://github.com/Elacity/drm-api-layer/pull/22)** still open. v3 **[PR 1](https://github.com/Elacity/v3-drm-protocol/pull/1)** (mint-and-list in one tx) unchanged from last week.

Keystore deploy hygiene (Lit action payloads in the image) landed beside the web mint path — operator plumbing, not a new protocol.

## 8. Hyper / Hey

**Hyper 3** commits this window: Share invite mints a pending hey-invite (not a chat deep link); re-poll `canChat` after an invite-promote race; persist chat acceptance and compact invite QR. The sideload line also kept moving on profiles, follow-to-chat, a small Android file manager for workspace text, and DM delivery under stress — still **source / sideload, no store tag, no ElastOS capsule launch**. **Hey-engine 0** on `main` this window. Group chat on a fresh Runtime install is **not** in this preview.

## 9. Essentials Overhaul — Still Local

**In development and testing. Not a store release.** A screen-by-screen pass on the live app, then repairs — the refreshed Home design stays.

Blocked flows that now complete: Add a Widget lists widgets instead of spinning; a second profile finishes after the password step; creating a developer app saves and names the failed step; staking on an unfinished wallet says what is missing.

Built-in browser: a site does not see a wallet address until the user connects; one password prompt per connection; Cancel stops it; one site cannot read another’s connected address. That path had three independent review rounds.

Also this cycle: shared headers and margins so content clears the status / tab / home indicator; shared corners, tints, and destructive actions; contrast on dark quiet text; consistent list search (clear restores the list); readable proposal vote meters; dApp notice dismissal saved and reversible from Privacy; recent apps removable across restart. Automated checks expanded. Shared sheets, consent copy, and Reduce Motion are still in progress.

## 10. Elastos DAO Overhaul — Not Public

**In development and internal verification. Not deployed, not on a public domain.**

The rebuild moved from decoded data into a working read product on real records: native decode of candidate / council / exchange-vote / stake / system history; offline backend bundles with restore checks; a public read boundary for proposal identity that survives snapshots and revisions.

Internally: 410 retained proposals with original text (including Chinese), paging, lookup by public number or permanent address, both legacy link formats, and distinct pages for not-found / ambiguous / malformed. Previously unreadable plan and budget text was recovered instead of dropped. Council and suggestion pages, a homepage, and How It Works sit on rules already in the codebase, with a full light/dark visual system.

Legacy API (193 routes) and 29 legacy domains are mapped; routes are **not** mounted. Sign-in / signing on the legacy platform is documented, not rebuilt. Council live-chain acquisition is planned as a lower-risk read of chain state — no connection was opened this week. Nothing here is public.

## 11. ELA on Ethereum → Main Chain — Research Only

**Research complete. Nothing built or shipped. No funds moved.**

Question: can ELA held on Ethereum move **directly** to the Elastos main chain without passing through ESC? The route is technically possible. Control of the Ethereum token, custody, and signer requirements are mapped into one reference. Transferring control to the DAO is not a settings toggle — the deployed contract needs an upgrade path, and signer access is a real dependency.

This is a **map**, not a bridge, not a date, and not a community action. Do not send funds anywhere on the back of this paragraph.

## 12. PC2 — Quiet by Design

`pc2.net` — **zero** commits after #37. Operator line remains **v1.4.0**.

0.7.1 is still a Runtime-only line. PC2 waits for the capsule / authority contract this follow-up is finishing — so the node does not fork last week’s pre-follow-up surface.

## 13. Release Engineering

| Item | Status |
|---|---|
| Runtime `main` | Unchanged · **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)** · tip `8ac18bec` |
| Public preview | **Live** · [Home](https://elastos.elacitylabs.com/home/) · **not** a 0.7.1 tag |
| 0.7.1-dev | Still **[PR 58](https://github.com/Elacity/elastos-runtime/pull/58)** tip · **[PR 64](https://github.com/Elacity/elastos-runtime/pull/64)** unchanged |
| Active reviews | **PR 51** · **PR 59** · **PR 60** · **PR 62** · **PR 63** · **PR 64** · **PR 65** · **PR 66** |
| Marketplace | web **4.6.8** (product commits, no bump) · drm **0.13.2** · **PR 23–26** merged |
| PC2 | Quiet · **v1.4.0** |
| Elastos.Node | **v1.2.4** |
| Halborn | v1.0.3 · **underway** |
| ESC / EID | **Open** · PG **closed** |
| Essentials / DAO | **Local** · DAO **not deployed** |
| ETH → main | **Research only** · nothing built |
| 0.7.1 tag | **None** |

## 14. Convergence Lens

| Theme | Runtime (this week) | Marketplace / Hyper / PC2 / chain / Infinity |
|---|---|---|
| Preview | Signed 0.7.1 Home live · Mac install journey | — |
| Protected-content | Any-file + audio · custody-only · honest mint · **PR 62** | Cinema / sign-on-play / one-click mint paths |
| Models / Assistant | Signed catalogue · Get → reply → restart · remote Qwen recorded | — |
| Publisher / installer | Head-last · staged probe · catalogue-before-binary | drm-api image on green merge |
| Browser | Recovery + RTP clock · paused for model close | Essentials in-app browser: no address until connect |
| Mesh | — | Hyper invite QR / hey-invite · sideload profiles / DMs |
| Wallet / DAO | — | Essentials blocked-flow repairs · DAO read pages on real data, **not public** |
| ETH → main | — | Route mapped · **research only** · no funds moved |
| Chain | — | ESC/EID **open** · Halborn **underway** · tip ~2,297,118 |
| PC2 | — | Zero commits · **v1.4.0** |

## 15. Looking Ahead

1. Repair **public Home model Get**; re-prove remote Qwen on the current public candidate.
2. Finish installed **mint → buy → play** on the follow-up head (**PR 62** / journey J5). Then land the branch.
3. Resume **Browser** recovery / reload gate — inventory is on the branch, not done.
4. **Do not tag 0.7.1** until those gates plus the v0.7.0 first-hop update are on a frozen candidate. **[PR 51](https://github.com/Elacity/elastos-runtime/pull/51)** is still the path onto `main`.
5. Soak marketplace mint / shop / cinema paths. Keep **drm-api PR 22** moving.
6. **PC2** stays quiet until this capsule contract is what the node consumes.
7. **Halborn** — community-safe update when there is a certificate. **PG** stays closed.
8. **Essentials** and **DAO** stay local until they are ready to show — no store or public-domain claim from this week.
9. **ETH → main** stays a map until there is a built, reviewed procedure. Do not treat the research as a bridge.

## 16. Summary Statistics

**Week of** September 14 – September 18, 2026 (after #37).

| Repo | Commits | Notes |
|---|---|---|
| pc2.net | **0** | Quiet |
| elastos-runtime | **~20** unique on the two rails (follow-up 9 · remote-services cluster 11+) | No merge to `main` · first-pass ~+106,624 / −3,282 / 328 file-touches |
| elacity-web | **~29** | still **4.6.8** |
| drm-api-layer | **~18** | still **0.13.2** · **PR 23–26** merged |
| Hyper | **3** | invite / QR |
| Hey-engine | **0** | push only |
| ESC / EID / Arbiter / ELA (private) | **0** | not public GitHub |
| Elastos.Node | **0** | still **v1.2.4** |

**Runtime authors:** Anders Alm — installer, catalogue, Assistant, Browser, publisher · Irzhy Ranaivoarivony — protected-content follow-up, wallet re-ask · marketplace (SashaMIT) — web + drm-api paths.

**Also this week:** Essentials live-app review and blocked-flow / browser-privacy repairs · DAO rebuild on real proposal / council / suggestion data (not deployed) · ELA-on-Ethereum → main-chain route research (nothing built). Plus a lot of small setup, recovery, and flow-fit work that is not listed line by line.

**Releases.** None tagged. Latest Runtime tag **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)**. Preview artifacts are **not** that tag. PC2 **v1.4.0**. Essentials and DAO are **not** public releases.

## 17. Notes

- **Chain recovery internals** stay out. Resume post, Halborn status, and KuCoin CRC completion are the community-safe chain facts.
- **0.7.1** is a **preview**, not a GitHub Release. Public model Get and J5 are still open — say so.
- **Protected-content** follow-up is engineering on the 0.7.1 line, not a consumer storefront reopen.
- **Assistant** signed-model journey is an installed Mac checkpoint plus a public-list gap.
- **Hyper / Hey** remain source + sideload. Group chat is not in this preview.
- **Essentials / DAO** are local / internal. Do not treat them as live community surfaces.
- **ETH → main** is research. Nothing built. No funds moved.
- **PC2** zero-commits is by design.
- Bare issue numbers in headings are written as “PR 62” so GitHub does not auto-link the Puter fork.

---

### Quick fact card

| Fact | Value |
|---|---|
| Previous / this | [#37](https://github.com/Elacity/pc2.net/discussions/37) · [#38](https://github.com/Elacity/pc2.net/discussions/38) |
| Runtime | **[v0.7.0](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.0)** still latest tag · **0.7.1 preview live** |
| Preview | [Home](https://elastos.elacitylabs.com/home/) · acceptance **open** |
| Protected-content | Past video · audio · custody-only · **PR 62** |
| Models | Signed catalogue · Mac Get → Assistant → restart |
| Marketplace | web **4.6.8** · drm **0.13.2** · shop/cinema/mint paths |
| Essentials / DAO | Local review + repairs · DAO **not deployed** |
| ETH → main | Research only · no funds moved |
| Hyper / Hey | Invite QR · Hey quiet · sideload |
| Halborn | ELA **v1.0.3** · **underway** |
| Mainchain / ESC | Online · ESC/EID **open** · PG **closed** · tip ~**2,297,118** |
| Node | **v1.2.4** |
| PC2 | Quiet · **v1.4.0** |

---

*Cadence: weekly updates. Previous report — [Week of September 8 – September 13, 2026 (#37)](https://github.com/Elacity/pc2.net/discussions/37). This report — [#38](https://github.com/Elacity/pc2.net/discussions/38).*
