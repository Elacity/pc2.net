Elacity Labs — Weekly Team Update for the World Computer Initiative (WCI)

**October 4 – October 9, 2026**

**Runtime test channel.** Signed test releases **0.8.0-alpha.1** through **alpha.12** went out on the new release key. Each one is built from `develop`, and from alpha.7 the change notes show in System. alpha.8 is the first for Mac, Linux x86-64, and Jetson together. Updates, Undo, and recovery were run on a Mac, a Linux PC, and the Jetson. `develop` is **670 commits ahead** of `main`. [v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1) remains the tagged GitHub release. **alpha.13** carries download resume, a memory check, and idle release. Qwen2.5 1.5B is signed and on the seed.

**Also on Runtime.** An update stages the whole release while Home keeps running, then restarts once. Linux x86-64 and NVIDIA Jetson packages install beside the Mac pair. Local models returned as a signed Marketplace download: SmolLM2 135M, fetched from holder Homes, eight parts at a time. Chat ships as its own signed capsule, and the Community line adds rate limits, signed history, and durable recovery. Browser installs Selkies from source that ships with the release, and the Linux browser launcher runs without sudo. CI opens an installed Home on pull requests and builds from content-keyed inputs.

**Elacity.** Protocol **0.9.4** and **0.9.5** are tagged and live. Elacity matches the new contract calls. Web stays **4.6.8**. drm-api stays **0.13.2**. The web, the API, and the rest server each keep a signed-in wallet on its own reads. Hyper finished five security rounds on the engine, and the phone suite passed 56 of 56. Its Android app now has a memory tab. In ElastOS Home, an Android Runtime window runs ARM64 programs on the machine itself, including stock Android 16 tools and OpenGL ES drawing. Essentials took 13 rounds, checked on an iPhone simulator, with smart-account activation and deactivation verified on Base. The DAO site and app moved forward as local previews, with the old proposal history preserved. PC2 remains **v1.4.0**.

**Chain status:** mainchain producing under BPoS. ESC and EID producing; main ↔ ESC / EID open. **PG / PGP cross-chain ELA stays disabled.** A new council server is running. The council EID seat’s consensus links were restored. Public chain repositories stayed on their current releases. [Sidechains resume](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem](https://blog.elastos.net/announcement/main-chain-postmortem-august/).

> **0.8.0-alpha.1 → alpha.12** signed test releases · real updates and Undo on Mac, Linux, and Jetson · SmolLM2 in Assistant · alpha.13 resume and memory check · Qwen signed on the seed · Chat capsule · protocol **0.9.4** and **0.9.5** live · PC2 **v1.4.0**.

---

## Key Links This Week

- **Previous report** — [Week of September 26 – October 4, 2026 (#40)](https://github.com/Elacity/pc2.net/discussions/40)
- **This discussion** — [#41](https://github.com/Elacity/pc2.net/discussions/41)
- **Runtime** — [v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1) · signed test releases alpha.1–alpha.12 · [team note, 2–9 October](https://github.com/Elacity/elastos-runtime/blob/docs/weekly-2026-10-09/docs/audits/2026-10-09-team-sync.md) · [alpha.8](https://github.com/Elacity/elastos-runtime/pull/276) · [alpha.11](https://github.com/Elacity/elastos-runtime/pull/306) · [alpha.12](https://github.com/Elacity/elastos-runtime/pull/308) · [alpha.13](https://github.com/Elacity/elastos-runtime/pull/322)
- **Models** — [PR 306](https://github.com/Elacity/elastos-runtime/pull/306) · [PR 153](https://github.com/Elacity/elastos-runtime/pull/153) · [PR 208](https://github.com/Elacity/elastos-runtime/pull/208)
- **Chat** — [PR 123](https://github.com/Elacity/elastos-runtime/pull/123) · [PR 262](https://github.com/Elacity/elastos-runtime/pull/262) · [PR 309](https://github.com/Elacity/elastos-runtime/pull/309)
- **Browser** — [PR 249](https://github.com/Elacity/elastos-runtime/pull/249) · [PR 250](https://github.com/Elacity/elastos-runtime/pull/250) · [PR 307](https://github.com/Elacity/elastos-runtime/pull/307)
- **Elastos status** — [Sidechains resume (1 Sep)](https://blog.elastos.net/announcement/elastos-sidechains-resume-after-full-stack-audit/) · [Mainchain postmortem (August)](https://blog.elastos.net/announcement/main-chain-postmortem-august/)
- **Install (PC2 node)** — `bash <(curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/update.sh)`
- **Live surfaces** — Elacity · blockchain.elastos.io · elacitylabs.com

## Table of Contents

1. The Big Picture — The Alpha Train
2. Updates and Install
3. Local Models
4. Chat and Community
5. Browser
6. Home and CI
7. Marketplace and Protocol
8. Hyper and Services
9. Essentials and the DAO
10. PC2 and the Chain
11. Summary

---

## 1. The Big Picture — The Alpha Train

[#40](https://github.com/Elacity/pc2.net/discussions/40) closed on Runtime v0.7.1. Signed test releases **0.8.0-alpha.1** through **alpha.12** went out from `develop` on the new release key. From alpha.7, System shows that release’s notes. alpha.8 is the first release for Mac, Linux x86-64, and the Jetson together.

The trains are the update path, Linux and Jetson packages, the signed model catalogue, Chat as its own capsule, and the Browser source install. `develop` is 670 commits ahead of `main`. The release workflow on `main` can be dispatched against `develop` commits ([PR 255](https://github.com/Elacity/elastos-runtime/pull/255), [PR 256](https://github.com/Elacity/elastos-runtime/pull/256)).

alpha.13 ([PR 322](https://github.com/Elacity/elastos-runtime/pull/322)) carries resume on a stopped download, a memory check, and idle release. Qwen2.5 1.5B is signed and pinned on the seed. The model list that offers it follows with the updater that installs a new list.

On Elacity, protocol 0.9.4 and 0.9.5 are live, and Elacity matches those calls.

## 2. Updates and Install

Home keeps running while an update downloads and checks the whole release, then restarts once. A candidate that cannot be used leaves the current version in place, and System says why. From alpha.7, an update from the alpha.6 test build runs once with `elastos update` in Terminal. Later updates run from System.

- Every component is admitted before anything is replaced.
- Support components are fetched by their signed CID. Undo to an earlier release uses that CID. `elastos update --rollback-to <CID>` returns to a Head recorded with `elastos source show`. `elastos update --force` is the repair path.
- Downloads stop when data stops arriving, not because a large file takes a long time.
- Updates and installs keep **2 GB** free on top of what they write.
- A fresh binary that is briefly busy on Linux is retried.
- A release the publisher’s signature rules out is not offered again, and space and network failures name the reason.
- The installer prints numbered steps, and plain text when its output goes to a file or another program. It creates directories as owner-only under any umask, including Ubuntu’s.
- Linux x86-64 and NVIDIA Jetson packages publish beside the Mac pair. alpha.8 is the first of these releases for all three. They install with the same command as on Mac. File permissions on Ubuntu and Jetson stay owner-safe.
- On real machines: System update and Undo on a Mac; update, Undo, and an interrupted update on Linux and the Jetson; a low-disk refusal and a chosen install folder on Linux. Installed files matched the signed hashes, 55 of 55 on Linux and 62 of 62 on the Jetson. User data came through unchanged. A Mac update from alpha.8 to alpha.9 and back kept Chat.
- System has **Update and restart** ([PR 230](https://github.com/Elacity/elastos-runtime/pull/230)). The new release key signs these releases ([PR 261](https://github.com/Elacity/elastos-runtime/pull/261)). The seed runs the 0.8.0 Runtime on that key, with an always-on gateway. Both model packages are pinned there.
- Change notes travel inside the signed release, and System shows the notes for that release only.
- Publication is bound to a green `develop` run of that exact source.

[PR 246](https://github.com/Elacity/elastos-runtime/pull/246) · [PR 247](https://github.com/Elacity/elastos-runtime/pull/247) · [PR 248](https://github.com/Elacity/elastos-runtime/pull/248) · [PR 253](https://github.com/Elacity/elastos-runtime/pull/253) · [PR 254](https://github.com/Elacity/elastos-runtime/pull/254) · [PR 257](https://github.com/Elacity/elastos-runtime/pull/257) · [PR 234](https://github.com/Elacity/elastos-runtime/pull/234)

## 3. Local Models

alpha.7 took the bundled models out of the Runtime package. alpha.11 brought them back as their own signed catalogue.

- Marketplace offers **SmolLM2 135M** (145 MB, Apache-2.0). Get downloads it, the AI engine downloads the first time a model needs it, and Assistant answers with it on the device. In use, that path is: Get, then a conversation in Assistant.
- The catalogue is signed offline and pinned with the release. CI proved Get and an Assistant reply on Mac, Linux x86-64, and ARM64. On x86-64 the package lives on a separate holder Home, so Get crosses Carrier. A slow link keeps the download going past the ten-minute mark.
- After the first piece, Home reads the rest from Homes that already hold it. A 145 MB package went from about 332 seconds to about 42 seconds on that path. alpha.12 keeps up to eight part reads in flight.
- A capacity check counts as storage use, so a long download on a slow link keeps going past the idle stop. On a real Linux install, Get went from about 535 seconds to about 291. The Jetson download works, and the model is still there after a restart and an update.
- The model contract stays in sync with Marketplace ([PR 208](https://github.com/Elacity/elastos-runtime/pull/208)). Hosted sends commit End before they stop ([PR 148](https://github.com/Elacity/elastos-runtime/pull/148)).

**alpha.13** ([PR 322](https://github.com/Elacity/elastos-runtime/pull/322)) adds resume and retry, a memory check before a local model starts, idle release after a minute, and a clear of the cap that stopped Get after about 64 attempts. **Qwen2.5 1.5B Instruct** (1.1 GB, about 3 GB of free memory) is signed and pinned on the seed. The list that offers it follows with the updater that installs a new model list. A local model starts when the device has free memory for it, and only one local model runs at a time. An ARM64 device without the CPU features for local AI installs Home without the local engine.

## 4. Chat and Community

On the trains, Chat is part of Home from alpha.8. From alpha.9 it is its own signed capsule: a new install downloads it over Carrier, and an update adds it when it is missing. Opening Chat again works offline. The pinned Community network ships with the signed release, and a Home update joins it.

On the Chat line:

- [PR 123](https://github.com/Elacity/elastos-runtime/pull/123) connects Chat and People with Home. Drafts stay with their conversation. Reconnect works after a lost Home session. Attachments open through Home. Terminal Chat keeps UTF-8 typing and accepts a line it can sign. The Community network is fetched by its pinned CID, and Undo keeps a network already joined.
- [PR 262](https://github.com/Elacity/elastos-runtime/pull/262) adds Community send and receive rate limits, and per-Home caps in the Discovery relay. The receive limit is a Home setting. Changing it takes a restart.
- [PR 309](https://github.com/Elacity/elastos-runtime/pull/309) verifies Shared receipts and keeps delivery moving.
- Signed participant history is retained and fetched within a bound. Home authority renews in place. Startup and an isolated run share one lock. Each write to the notification store takes a lock. Alerts and unread marks belong to one account.

A two-Home Mac check of the combined line passed 28 of 28. In use this week, chat connects and the updates run. The phone Home line is in that same test pass.

## 5. Browser

[PR 249](https://github.com/Elacity/elastos-runtime/pull/249) installs Selkies 1.6.1 from identified, licensed source that ships with the release. [PR 250](https://github.com/Elacity/elastos-runtime/pull/250) runs the Linux browser launcher without sudo, with a one-time root setup for the network device, the firewall, and KVM.

[PR 307](https://github.com/Elacity/elastos-runtime/pull/307) delivers one Browser Engine, with the ARM64 image for Mac and Jetson, through normal Home setup. Linux x86 uses the remote Engine. A reload check finished in 1.6 seconds. [PR 295](https://github.com/Elacity/elastos-runtime/pull/295) keeps that engine’s life cycle with the capsule: it stays up while the app is open, closes when the app closes, and starts cleanly the next time.

## 6. Home and CI

[PR 199](https://github.com/Elacity/elastos-runtime/pull/199) states execution as it runs. Runtime accepts `web-projection`, `native-provider`, and `native-host` beside the labels shipped manifests already use, so an update still completes on a Runtime that has those labels. Marketplace checks a publisher from the verification it actually holds.

The phone Home line ([PR 116](https://github.com/Elacity/elastos-runtime/pull/116)) is current with `develop`. Setup can show one progress line per component, with the signed sizes ([PR 277](https://github.com/Elacity/elastos-runtime/pull/277)).

CI opens an installed Home, signs up, and shows the update in System on pull requests ([PR 240](https://github.com/Elacity/elastos-runtime/pull/240)). On a Mac it also updates from a real earlier release and then Undoes ([PR 259](https://github.com/Elacity/elastos-runtime/pull/259)). On Mac, Linux, and ARM it installs Home, gets a model from Marketplace, and checks that Assistant replies. A journey refuses a tampered fixture and reconnects after restart. Builds are keyed by the staged tree. Kubo and system packages come from a verified cache. Only a source with a green `develop` run is published. Secret scanning and push protection are on. A pull-request run stops at its first failed job. Release builds stay hermetic. Status lives in GitHub issues; the old status files came out ([PR 239](https://github.com/Elacity/elastos-runtime/pull/239)).

## 7. Marketplace and Protocol

**Protocol.** **0.9.4** was reviewed, rehearsed on a Base fork, and deployed on 7 October. The upgrade checks the storage layout before it moves ownership. It covers root ownership and the platform-fee cap, write-once payment processors, bounded settlement, subscriptions that keep their purchased expiry, issuer-attested content claims, and channel wrappers that take authenticated consent. **0.9.5** shipped the same day a royalty-terms report came in. `buyToken` and `acceptOffer` bind the expected price and payment token, and an `offers()` view was added. It is deployed and verified on Base. Both releases are live.

**Elacity.** Web **4.6.8**. drm-api **0.13.2**. The site matches both releases: offer approval for 0.9.4, and royalty terms read from the chain for 0.9.5. Batch transactions for Essentials are live on Elacity on Base.

The same week, the web, drm-api, and the rest server each grew a pass that keeps a signed-in wallet on its own data: subscriptions, playlists, uploads, referrals, views, channel access, comments, and the public catalog. Unpublished and delisted assets stay out of the public grid. Offer funding is scored the way the live gateway settles. Earnings match the wallet in one case. Encode, image, and cache paths stay inside their directories. The creator agent reserves its monthly model ceiling before a turn starts.

## 8. Hyper and Services

Five full security rounds covered messages, the network, social, and the app. Each finding was fixed and checked again. A cold start asks for the fingerprint before messages can be read, and background delivery works. Group messaging reconnects when a contact comes back. Retries leave a contact who never answers alone. Desktop memory stays flat. Release builds are stripped. There is a supply-chain record. Force relay hides the IP. The recovery phrase is wiped from memory, and local data is sealed. On the engine line, idle backoff is in and gossip entries no longer stay pending.

The full suite passed on a Pixel and a OnePlus, 56 of 56, twice. The desktop and phone legs pass. A group video call across three devices works. After the memory fix, a desktop soak holds RAM flat, with CPU about 1% and GPU about 0%.

On Android, the social tab is now a memory tab, so the app lists as a decentralised communication app. On the working build: a QR scan opens the chat, video uses adaptive tiles, and workspaces hold an encrypted shared store for polls, events, lists, and notes. Moments has Just me, All friends, and Choose friends, plus a 60-second video and a photo book. Play Console drafts are in the Communication category, with report, block, and delete account. The Hyperverse home is a garden and a living room, with Moments photos on the walls.

**Android in Home.** An Android Runtime window is running in ElastOS Home, checked in Chromium and Firefox, including inside Home’s sandboxed frame. ARM64 code is translated to wasm on that machine. It runs on the stock ElastOS Runtime.

- ARM64 programs run at about 100–190 million instructions a second.
- Stock Android 16 toybox runs through Android’s own linker and libc (`echo hi`, `ls /system`).
- OpenGL ES draws on the GPU through WebGL2. A triangle and a textured quad match the expected pixels.

A spinning 3D shape, drawn live by an ARM64 program at about 57 FPS, is in its final check before it opens from its own Home icon. The stock Android Java runtime prints “Hello from Java” and starts in 6–10 seconds. Before that runtime opens in Home, its 243 MB image loads a file only when the file is opened.

The reader service confines a gateway metadata fetch to its prefix. The keystore pins its network lookup to Elacity hosts. The gateway cache leaves IPNS names out of the year-long cache.

## 9. Essentials and the DAO

**Essentials.** Thirteen rounds merged and were checked on an iPhone simulator. A native iOS build created and published a new identity on 7 October. Home includes staked ELA in the total. Send names the network. A tab’s content appears in about 40 ms. A site connects without a password. WalletConnect is 2.25.0, and Main Chain site connections go through. The password sheet starts with Face ID, names who is asking, and waits after five wrong attempts.

Smart-account activation and deactivation were verified with real funds on Base. A batch goes through one review. Risky permission-slip signatures are refused. Connected sites are limited to the five networks Essentials uses. The licence review cleared use of the MetaMask contract, with the Cyfrin and Consensys Diligence audits on record.

The shared phishing list was refreshed on 8 October, from 13,752 sites to 104,712. Sixty-seven missing licence texts were added from their official sources. The dependency review found no critical or high advisory that both ships in the app and can be reached.

**DAO.** The informational site and the app are local previews. The proposal directory shows full titles, status filters, budget and voting summaries, and lookup by proposal number. Sign-in and suggestion creation hand off cleanly from the site. Publications sit apart from the historical archive.

Four hundred and ten proposal records were rechecked, and 616 historical suggestions were reconciled. Of 368 suggestion readings checked, none remains marked partial. The history copy holds 3,449 account records, with passwords, salts, and reset tokens left out, plus council, election, team, task, and community records. Those copies are read-only. Mobile layout, keyboard use, and enlarged text were checked, and drafts, discussions, profiles, and following were exercised on local test identities.

## 10. PC2 and the Chain

PC2 remained on **v1.4.0**.

ESC and EID stayed open. PG cross-chain stayed off. A new council server is running, and the council EID seat’s consensus links were restored. Elastos.Node remains **v1.2.4**. The Elastos.org rebuild branch did not move this week.

## 11. Summary

| Repo | What landed |
|---|---|
| elastos-runtime | Signed test releases **alpha.1–alpha.12** · real-machine update and Undo · **alpha.13** resume and memory check · `develop` **670** ahead of `main` |
| v3-drm-protocol | **0.9.4** and **0.9.5** deployed and live |
| elacity-web | Offer approval and royalty read on `release/base-network` · **4.6.8** · session checks on their pull requests |
| drm-api-layer | Wallet-scoped reads, catalog visibility, offer settlement · **0.13.2** |
| v1-rest-server | Wallet-scoped uploads, bundles, and catalog edits |
| Hyper / Hey-engine | Five security rounds · 56/56 on Pixel and OnePlus · three-device video call · Android Runtime in Home |
| ddrm-reader | Metadata fetch confined to its prefix |
| lit-keystore-moleculer | Network lookup pinned to Elacity hosts |
| docker-arch | IPNS names out of the long gateway cache |
| Essentials | 13 rounds on the iPhone simulator · smart accounts verified on Base · phishing list 104,712 |
| Elastos DAO | Local previews · 410 proposals rechecked · 3,449 account records preserved, secrets left out |
| pc2.net | **v1.4.0** |
| Elastos.Node | **v1.2.4** |

---

### Quick fact card

| Fact | Value |
|---|---|
| Previous / this | [#40](https://github.com/Elacity/pc2.net/discussions/40) · [#41](https://github.com/Elacity/pc2.net/discussions/41) |
| Runtime trains | Signed **alpha.1 → alpha.12** · [alpha.13](https://github.com/Elacity/elastos-runtime/pull/322) |
| Tagged Runtime release | **[v0.7.1](https://github.com/Elacity/elastos-runtime/releases/tag/v0.7.1)** |
| `develop` | **670** commits ahead of `main` |
| Models | SmolLM2 in Assistant on Linux and Jetson · Qwen signed on the seed |
| Chat | Signed capsule · two-Home Mac check 28 of 28 |
| Browser | One ARM64 engine for Mac and Jetson · capsule closes and starts cleanly |
| Protocol | **0.9.4** and **0.9.5** live |
| Android in Home | ARM64 programs, Android 16 toybox, OpenGL ES · on the stock Runtime |
| Hyper | Five security rounds · 56/56 twice · desktop soak flat |
| Marketplace | web **4.6.8** · drm **0.13.2** |
| Essentials | 13 simulator rounds · smart accounts on Base · phishing list **104,712** |
| DAO | Local previews · history preserved |
| PC2 | **v1.4.0** |
| Mainchain / ESC | Online · ESC/EID **open** · PG **off** |
| Node | **v1.2.4** |

---

*Cadence: weekly updates. Previous report — [Week of September 26 – October 4, 2026 (#40)](https://github.com/Elacity/pc2.net/discussions/40). This report — [#41](https://github.com/Elacity/pc2.net/discussions/41).*
