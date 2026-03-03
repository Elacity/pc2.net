# Elastos WCI Team Ecosystem Report, Feb 24, 2026

**ElastOS V1 Live, WCI v1 Audit Passed, Keystone Fund Proposal Published, and Continued Development Toward v1.1**

---

## ElastOS V1 is Live

Earlier this month, [Elastos announced the launch of the World Computer V1](https://blog.elastos.net/announcement/elastos-world-computer-v1-launches/) alongside $3M in DAO-secured funding via Rong Chen's Keystone Gift. For the first time in eight years, Elastos has a working product — a sovereign personal cloud operating system built by Elacity Labs. ElastOS V1 represents 7,229 commits and 578,000+ lines of production code, delivering a full desktop environment, IPFS-backed personal storage, private AI with 5 providers, multi-chain wallets across 10+ chains, P2P networking with NAT traversal, WASM runtime, and one-command install across VPS, Mac, Jetson, and Raspberry Pi hardware.

Community members are already purchasing NVIDIA Jetson hardware and deploying sovereign nodes independently — showcasing the original 2018 mission for the first time, with a real foundation to build on.

---

## WCI v1 Proposal: Concluded and Audit Passed

The original World Computer Initiative (WCI v1) proposal, [CRC Proposal #180](https://www.cyberrepublic.org/proposals/180), has now concluded. Elacity Labs has successfully passed its audit with the Elastos DAO Secretariat team, providing:

- A **full public expenditure portal** with all financial accounting transparent and verifiable
- **Complete roadmap delivery** across all committed goals — with many features shipped beyond the original scope, including Carrier networking, local AI, multi-chain wallets, and agentic infrastructure never included in the original brief
- **23 weekly ecosystem reports** published throughout the mandate
- A **value audit** documenting $1.5M+ in traditional development value delivered for $150,000 — 10x capital efficiency, all verifiable on [GitHub](https://github.com/Elacity/pc2.net)

This matters because many DAO-funded teams in Elastos' history have failed to deliver, pivoted without consent, or disappeared. Elacity Labs not only delivered the product promised to investors since 2017 for a fraction of a percent of what was raised, but set a standard for transparency and clear accounting. Every commit, every dollar, every report — verifiable and on the public record.

---

## Keystone Fund Proposal Published

Building on ElastOS V1 and the successful WCI v1 audit, Elacity Labs has published a new proposal to the Elastos DAO: [**Ringfencing the $3,000,000 Keystone Fund for Continuous Delivery of ElastOS: From Working Product to Agentic World Computer**](https://elastos.com/suggestion/699c045de3bb57006e75463e).

The proposal requests $83,333/month over 3 years from the [Keystone Fund](https://blog.elastos.net/announcement/elastos-world-computer-v1-launches/) to provide:

- Continuous ElastOS product innovation and monthly releases
- Supporting and working with third-party engineers under the same accountability structure
- High-profile networking and business development
- Social presence and community education
- Evolving ElastOS toward a fully Web3 Agentic OS
- Testing hardware and IoT device compatibility for peer-to-peer connectivity
- Architecting ELA value capture throughout the product's critical coordination and resource layers

**Governance protections:** Monthly payments — if delivery stops, payments stop. The DAO can halt execution at any time. Weekly shipping reports, monthly releases, and full public expenditure tracking. The proposal is currently in the suggestion stage for community discussion and feedback.

---

## Continued Development: What's Coming in v1.1

Despite WCI v1 concluding, Elacity Labs has not stopped. The team is actively working toward the v1.1 release — **43 commits across 47 files, with 7,226 lines added** since V1 — driven by real community testing on Jetson hardware and direct feedback from node operators. This represents a significant engineering effort across networking, storage, streaming, hardware support, infrastructure, and strategic documentation.

### New Systems Built From Scratch

**WireGuard NAT Traversal (entirely new)**
Built a complete WireGuard integration from the ground up — 486-line `WireGuardService.ts` with automatic provisioning, key management, tunnel health monitoring, and graceful fallback to Active Proxy. This includes a 534-line client setup script (`setup-wireguard-client.sh`), a 236-line server provisioning script (`setup-wireguard-server.sh`), and a 265-line node setup script (`setup-node.sh`) — none of which existed before this branch. WireGuard gives home-hardware nodes near-localhost speed for remote access, replacing the slower encrypted relay as the primary connectivity path.

**Jetson & ARM Platform Detection (entirely new)**
Built a 368-line platform detection system (`platform.ts`) that identifies hardware capabilities at startup — Jetson vs Raspberry Pi vs generic ARM vs x86, NVIDIA GPU availability, CUDA support, memory constraints, and kernel module availability. This drives automatic optimization: constrained devices get tuned IPFS settings, Jetson devices get wireguard-go userspace fallback, and GPU-equipped nodes get acceleration paths.

**System Diagnostics API (entirely new)**
Built a 315-line system information API (`system.ts`) exposing hardware diagnostics, GPU status, storage health, and network state. Provides the foundation for remote monitoring and the network map.

### Major Rewrites and Overhauls

**Active Proxy Protocol (complete rewrite)**
The Boson Active Proxy client and protocol were substantially rewritten — 893 lines changed in `ActiveProxyClient.ts` and 590 lines changed in `ProxyProtocol.ts`. This involved reverse-engineering the Java server's wire protocol from decompiled source, fixing encryption format mismatches, correcting packet type mappings, adding domain registration for virtual hosting, implementing chunked data relay to prevent buffer overflows, and adding keepalive with reconnection. 11 consecutive debug commits trace the protocol from broken to working — each one based on real wire-level packet analysis.

**ConnectivityService (major expansion)**
Expanded from a basic gateway health-checker to a full transport orchestration service — 332 lines added, 51 removed. Now manages WireGuard as primary transport with automatic fallback to Active Proxy, parallel supernode connection racing, proxy endpoint registration, WireGuard health monitoring with tunnel-down detection, background re-establishment after failure, and transport upgrade after username registration. The service correctly prefers WireGuard over Active Proxy on every reconnect cycle.

**Web Gateway (major expansion)**
The supernode gateway received 440 lines of additions across compression, keep-alive pooling, WireGuard-aware routing, health-check probes for WireGuard peers, automatic stale socket eviction, error-triggered connection pool flushing, and ActiveProxy relay support. The gateway now self-heals after node reboots within 60 seconds without manual intervention.

**IPFS Public Gateway (rewrite)**
The public IPFS gateway (`public.ts`) was rewritten with 178 lines added — proper HTTP Range/206 byte-range streaming for video playback, backpressure-aware streaming with pipeline(), separate handlers for CID routes and public wallet routes, HEAD request support, and correct Content-Range headers for seeking.

**IPFS Storage Layer (significant expansion)**
111 lines added to `ipfs.ts` — DHT client mode to prevent bandwidth saturation, 50-peer connection limit, `announce` parameter stub for future dDRM selective content publishing, timeout wrappers on storeFile/storeFileStream with dynamic scaling, and progress logging for multi-gigabyte uploads.

**Install Script (complete rewrite)**
`install-arm.sh` was rewritten with 331 lines added — now a one-command installer that handles Jetson detection, automatic wireguard-go compilation for custom kernels, SETENV sudoers configuration, PM2 with systemd boot persistence, WireGuard setup, and the full PC2 build. A community member can deploy a sovereign node in under 15 minutes with no manual steps.

### Streaming, Storage and File Fixes

- **Video streaming** — Full IPFS byte-range streaming with proper 206 Partial Content responses, enabling seek in videos of any size directly from the personal cloud
- **Large file uploads** — Switched from buffer-based to disk-streaming uploads via multer, preventing out-of-memory crashes on Jetson (8GB RAM) for multi-gigabyte files. Added timeout wrappers and progress logging
- **IPFS performance** — Eliminated `getFileSize()` calls on every request (was hitting IPFS for metadata that already existed in SQLite). IPFS is now only queried when a Range request arrives
- **Binary data corruption** — Fixed PDF blank pages and broken images caused by `content.toString('utf8')` on binary data. Now sends raw Buffer for all binary file types
- **Accept-Ranges header** — Restricted to video/audio only. Was causing PDF.js to attempt broken range-based loading on documents
- **Gateway compression** — 206 Partial Content responses are never gzipped, preserving byte-range semantics for video seeking

### IPFS Privacy and Network Protection

- Switched to DHT client mode — the node can query the IPFS network but no longer announces content, protecting private files at the protocol layer (not just the HTTP layer)
- 50-peer connection limit prevents home internet bandwidth saturation
- Upload temp directory moved from `/tmp` (RAM-backed on some systems) to the data drive
- Architecture prepared for dDRM: `announce` parameter stubbed into storeFile/storeFileStream for future selective content publishing of encrypted marketplace assets

### Player and File Association Improvements

- AV1/Firefox — Clear error message when Firefox encounters unsupported containers (MKV, AVI, MOV) instead of silent black screen, with browser-specific guidance
- Player now uses proper `<source>` elements with MIME type hints
- Added `.av1`, `.m4v`, `.ogv`, `.ts`, `.3gp` to file-to-player associations across all three mapping layers (Puter backend, PC2 handlers, suggest apps)
- MKV double-click now opens the player directly
- File creation error fixed — `window.refresh_item_container` exposed globally

### Strategic Documentation

- **Architecture Convergence Guide** (745 lines) — Complete mapping of PC2 v1 to Anders Alm's capsule runtime v2, including the DLL analogy, BELLA_DANCING.MP4 walkthrough, monolith vs capsule analysis, and questions for the CTO
- **Network Hardening Roadmap** (196 lines) — Every fragile point cataloged from real-world testing, with self-healing requirements at each scale tier (50 to 100,000+ nodes)
- **Strategic Roadmap** (390 lines) — All 13 DAO proposal milestones mapped to concrete work streams, aligned with Rong Chen's vision, dDRM integration path, ELA value capture mechanics, and monthly release cadence
- Updated AGENT_HANDOVER, ARM_DEVICES, QUICKSTART, SUPERNODE_OPERATOR_GUIDE, and decentralized network architecture docs

---

## Community Testing

Community member EverlastingOS has been actively testing on NVIDIA Jetson Orin Nano hardware, providing real-world feedback that directly drives development:

- Confirmed PDF, image, and video streaming fixes working
- Identified the IPFS broadcasting bandwidth issue (fixed in this release)
- Testing large file uploads (2GB+ confirmed working, optimizing 3GB+)
- Validating WireGuard reconnection after reboots
- PM2 boot persistence confirmed working
- Provided UX feedback on selective file sharing ("Access Granted To" feature) that validates the capability-token model planned for the capsule architecture

This is exactly the development loop the Keystone Fund proposal is designed to sustain: community feedback → same-week fixes → continuous improvement → monthly releases.

---

## Try ElastOS Today

- **Desktop Launcher (Mac):** [Download ElastOS](https://docs.ela.city)
- **Terminal Install:** `curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/start-local.sh | bash`
- **ARM/Jetson Install:** `PC2_BRANCH=feature/jetson-gpu-acceleration curl -sSL https://raw.githubusercontent.com/Elacity/pc2.net/feature/jetson-gpu-acceleration/scripts/install-arm.sh | bash`
- **Documentation:** [docs.ela.city](https://docs.ela.city)
- **GitHub:** [github.com/Elacity/pc2.net](https://github.com/Elacity/pc2.net)

---

## What's Next

- Merge the v1.1 branch to production after community testing passes clean
- First monthly release under the new cadence
- Begin Elacity dDRM SDK integration (Phase 1 roadmap item)
- Continue supernode hardening and expansion
- Weekly shipping reports begin with the Keystone Fund mandate

The Keystone Fund proposal is live for community discussion: [Read the full proposal](https://elastos.com/suggestion/699c045de3bb57006e75463e)
