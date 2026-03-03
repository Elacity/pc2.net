# ElastOS Strategic Roadmap

> **Purpose:** Single source of truth for all strategic goals, technical work streams, and milestones — directly mapped to the Keystone Fund proposal and Rong Chen's original vision
> **Created:** 2026-02-24
> **Last Updated:** 2026-02-24
> **Status:** Living document — update as work progresses

---

## How This Document Works

Each **Milestone** from the DAO proposal is broken down into concrete **Work Streams**. Each work stream links to the relevant technical docs and can be checked off as completed. This is what we work through month by month.

**Related Documents:**
| Document | What It Covers |
|----------|---------------|
| [ARCHITECTURE_CONVERGENCE.md](./ARCHITECTURE_CONVERGENCE.md) | PC2 v1 → Capsule Runtime v2 technical path |
| [NETWORK_HARDENING.md](../pc2-infrastructure/NETWORK_HARDENING.md) | Supernode decentralization and self-healing |
| [AGENT_HANDOVER.md](./AGENT_HANDOVER.md) | Current state, coding patterns, infrastructure |
| [ARM_DEVICES.md](../deployment/ARM_DEVICES.md) | Jetson/Raspberry Pi deployment |

---

## Rong Chen's Original Vision (2002–2018)

These diagrams from Rong define the north star. Every work stream should move us closer to this architecture.

### The Elastos Computer (Von Neumann Extension)

```
┌─────────────────────────────────────┐
│         Elastos Computer            │
│  ┌───────────────────────────────┐  │
│  │     Classical Computer        │  │
│  │  Registers                    │  │
│  │  Memory                       │  │
│  │  Local Hard Disk (= cache)    │  │
│  └──────────┬────────────────────┘  │
│             │ TCP/IP, HTTP          │
│  ┌──────────▼────────────────────┐  │
│  │     Cloud Storage (= primary) │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

**Key insight:** Local storage is cache. Cloud (IPFS) is the primary storage. The "computer" extends beyond the physical device into the network. This is exactly what PC2 does today with IPFS as the storage layer.

### Smart-Web of Elastos Computers

```
    ☁️ ──── ☁️
   / |  ╲  / |
  ☁️ ── ☁️ ── ☁️
   ╲ |  /  ╲ |
    ☁️ ──── ☁️

  Each ☁️ = Personal Cloud Computer
  Each line = P2P Carrier connection
  Apps execute inside VMs/capsules
  IoT devices connect to their owner's cloud
```

**What we're building toward:** Every PC2 node is an Elastos Computer. The Carrier network connects them. Capsules are the "apps in VMs." IoT devices (Jetson, sensors, cameras) feed context into the personal cloud.

### Data Browser → Code Browser (Instant Apps)

**Web2 (Data Browser):** Browser pulls data from servers on demand.
**Smart-Web (Code Browser):** Data AND code are pushed to users and spread via social networks.

**This is the capsule model.** Capsules = code + data distributed by CID. Users install capsules from a marketplace or receive them from peers. The runtime executes them locally. "Instant Apps" that live on your hardware, not a corporate server.

### Three WebSpaces

| WebSpace | Protocol | Purpose | Status |
|----------|----------|---------|--------|
| `https://` | Web2 backward compatibility | `*.ela.city` domains | ✅ Working |
| `localhost://` | Carrier P2P | Mobile↔PC2, PC2↔PC2 | 🔨 Infrastructure ready |
| `elastos://` | Blockchain oracles | Smart contract data, DID resolution | 📋 Future |

---

## Work Streams by Milestone

### Milestone 1 — Campaign Launch & Product Continuity (Mar 1, 2026)

**Goal:** Continuity. Keep shipping. Merge the tested branch to main.

- [ ] Merge `feature/jetson-gpu-acceleration` to `main` after Sash validates on own Jetson hardware
- [x] Establish weekly shipping report cadence (GitHub-based)
- [x] Set up public expenditure tracking portal
- [ ] First monthly release (v1.1.0) — after Jetson validation
- [x] Publish WCI ecosystem update article

**Status (2026-03-02):**
- WireGuard reconnect after reboot: confirmed working (EverlastingOS + Anders)
- WireGuard macOS support: ✅ shipped — auto-install via `start-local.sh`, passwordless sudo, network change detection
- Large file upload: confirmed working — was a display bug (total_size*2 removed), NOT actual truncation
- WCI update article: published
- Expenditure portal: live
- One-command Jetson install: validated on 2 independent Jetsons (EverlastingOS + Anders/alm.ela.city)
- One-command macOS install: ✅ shipped — `start-local.sh` auto-installs Homebrew + WireGuard
- Weekly shipping reports: established on GitHub Discussions (#1, #2, #3)
- v1.1.0 release: blocked on Sash's own Jetson hardware test
- Anders' WalletConnect/Essentials issue: ✅ resolved — Anders was on an older wallet version
- Anders' Ollama model download issue: ✅ resolved — tool fallback + SSE streaming fixed
- Voice AI pipeline: ✅ shipped — Whisper STT + Piper TTS with Settings UI
- Virtual desktops: ✅ shipped — workspaces, Mission Control, keyboard shortcuts
- Ubuntu-style desktop UI: ✅ shipped — top bar, dock, window chrome, file explorer

---

### Milestone 2 — V1 Stabilization & Network Growth (May 31, 2026)

**Goal:** Harden everything. Grow the node count. Make it dead-simple to install.

**V1 Hardening:**
- [x] Fix large file upload — was a display bug (total_size*2 removed), uploads were always completing correctly
- [x] Fix wallpaper not loading via gateway — confirmed resolved after WireGuard reconnect fix
- [ ] AV1/Firefox — server-side remuxing for MKV→MP4 (beyond the error message)
- [ ] Performance profiling on Jetson (memory, CPU, IPFS block store)
- [x] Reduce PC2 cold-start time — parallelized AI/Gateway/Boson initialization
- [x] Mobile-responsive UI improvements — taskbar z-index fix, responsive layouts, virtual desktops

**DePIN Hardware Expansion:**
- [x] Validate one-command installer on fresh Jetson Orin Nano — tested on 2 devices (EverlastingOS + Anders)
- [ ] Raspberry Pi 4/5 validation and optimization
- [ ] Explore dedicated DePIN hardware partnerships (plug-and-play boxes)
- [ ] Debian package (.deb) for ARM devices
- [ ] macOS package (.dmg) for desktop users — needs Apple Developer cert ($99/year)
- [ ] Windows installer (.exe) exploration

**Carrier Overlay Network:**
- [x] Gateway under systemd with auto-restart — deployed live, enabled for boot
- [ ] SQLite registry replacing JSON file (NETWORK_HARDENING item #2) — deferred, JSON fine at current scale
- [ ] Automated SSL renewal with monitoring (NETWORK_HARDENING item #7)
- [ ] Basic uptime monitoring for supernodes (NETWORK_HARDENING item #6)
- [x] Reduce WireGuard retry interval (15s with exponential backoff) — shipped commit 0ac683b1
- [x] WireGuard macOS support — auto-install, passwordless sudo, network change detection
- [x] WireGuard PATH detection under PM2/systemd restricted environments

**AI Integration:**
- [ ] Integrate latest model providers as they emerge
- [x] Voice interaction prototype — Whisper (STT) + Ollama (reasoning) + Piper (TTS) — shipped Feb 26
- [x] Context API endpoint (`/api/context`) — accepts location, photo CIDs, voice transcripts, activity events
- [x] Ollama tool fallback — models rejecting tools auto-retry without tool definitions
- [x] Voice AI settings UI — install button, enable/disable toggle, opt-in on Jetson
- [ ] AI agent file management improvements
- [ ] RAG retrieval optimization for personal documents
- [ ] Evaluate PersonaPlex-7B (NVIDIA full-duplex voice) as Jetson hardware matures

**Omnichain ELA:**
- [ ] Begin ELA liquidity deployment across target EVM chains
- [ ] Chainge Finance ELA deployment plan (119,630 ELA)

---

### Milestone 3 — P2P Networking & dDRM Foundation (Sep 30, 2026)

**Goal:** Nodes start talking to each other. dDRM marketplace takes shape.

**P2P Node Networking:**
- [ ] P2P messaging between PC2 nodes (text/data via Carrier)
- [ ] Node discovery and directory (public listing with reputation)
- [ ] Social features foundation (chat between node owners)
- [ ] IoT device connectivity patterns (sensors → personal cloud)

**Awareness Layer (Context + Memory):**
- [ ] Context ingestion pipeline — location, photos, voice, motion, activity events all flowing to node
- [ ] Mobile companion app — lightweight iOS/Android app pushing GPS, photos, voice to your node
- [ ] Memory store — local SQLite + embeddings (via Ollama) for episodic and semantic memory
- [ ] Agent reads memory before every chat interaction (contextual responses, not stateless)
- [ ] Persistent agent loop — background process checking context every N minutes, firing proactive triggers
- [ ] Dynamic app generation — agent builds HTML/JS apps from context data on demand (e.g. trip map)
- [ ] Memory capsules — IPFS CID + DID ownership for generated experiences (shareable, ownable)

**Elacity dDRM Integration:**
- [ ] Integrate Elacity dDRM SDK into ElastOS
- [ ] Encrypted content upload + CID distribution
- [ ] Access token architecture (buy rights → get decryption key)
- [ ] Selective IPFS DHT announcement for dDRM content (`announce: true`)
- [ ] Marketplace UI within ElastOS (browse, purchase, download)
- [ ] Buyer node becomes seeder (CDN effect for encrypted content)

**Supernode Expansion:**
- [ ] Second supernode operational with registry replication
- [ ] Dual-endpoint registration (WireGuard + proxy at gateway level)
- [ ] Node auto-migration between supernodes on failure
- [ ] Per-domain rate limiting on gateway (NETWORK_HARDENING item #8)
- [ ] Explore Carrier premium tier staking mechanisms (ELA lock → priority routing)
- [ ] Multi-domain support — DNS + SSL + gateway for `*.pc2.net` and `*.ela.net`
- [ ] Relay nodes — PC2 nodes with public IP act as WireGuard relays for NAT'd peers

---

### Milestone 4 — Protocol Fee Architecture & Year 1 Review (Dec 1, 2026)

**Goal:** ELA demand mechanics live. First annual accountability report.

**Protocol Fees:**
- [ ] Fee collection on marketplace transactions (dDRM purchases)
- [ ] Fee pooling to market-buy ELA from DEX LPs
- [ ] Transaction fee on in-OS currency operations
- [ ] Fee dashboard (transparent, on-chain tracking)

**Node Operator Economics:**
- [ ] Define routing fee model (nodes paid for relaying traffic)
- [ ] Premium tier implementation (ELA staking unlocks features)
- [ ] Compute/storage fee models for shared services

**Year 1 Report:**
- [ ] Comprehensive development output report (commits, releases, features)
- [ ] Network statistics (active nodes, transactions, uptime)
- [ ] ELA value capture metrics
- [ ] Full financial expenditure transparency
- [ ] Community growth documentation

---

### Milestone 5 — Developer Platform & Capsule Marketplace (Mar 1, 2027)

**Goal:** Third-party developers can build on ElastOS.

**Developer SDK:**
- [ ] Stable API surface documented for external developers
- [ ] SDK package (npm) for building ElastOS extensions
- [ ] Extension system — install/remove capsule-shaped apps
- [ ] Developer documentation and getting-started guide
- [ ] Example capsules (template projects)

**Capsule Marketplace Alpha:**
- [ ] Distribution model: sandboxed apps identified by CID
- [ ] In-ElastOS marketplace UI (browse, install, rate)
- [ ] Capsule packaging standard (manifest, permissions, dependencies)
- [ ] Begin extracting core services behind standardized interfaces

---

### Milestone 6 — Capsule-Ready Services & Marketplace Growth (Jun 1, 2027)

**Goal:** PC2 internals progressively modularized toward capsule interfaces.

**Modular Service Interfaces:**
- [ ] Storage provider contract (IPFS, cloud, local — same interface)
- [ ] Networking provider contract (WireGuard, Carrier, future mesh)
- [ ] Identity provider contract (wallet, DID, passkeys)
- [ ] AI provider contract (Ollama, OpenAI, Anthropic — same interface)

**Storage Abstraction:**
- [ ] Multiple storage backends behind unified API
- [ ] Cross-device sync foundation
- [ ] Cloud storage integration (S3-compatible, for users who want it)

**Remote Access & Mobile:**
- [ ] Desktop-as-a-Service exploration (RDP/VNC server mode)
- [ ] Mobile app for accessing your PC2 remotely
- [ ] Mobile SDK for Carrier (phone↔PC2 — Rong's `localhost://` WebSpace)
- [ ] GeoDNS for `*.ela.city` routing to nearest supernode

---

### Milestone 7 — Runtime Integration & Agent Economy (Sep 1, 2027)

**Goal:** Anders' Rust runtime begins integrating. Agent economy emerges.

**Runtime Integration:**
- [ ] WASM sandboxed execution for capsules
- [ ] Capability token model (capsules request permissions, users grant)
- [ ] Capsule isolation (each capsule runs in its own sandbox)
- [ ] MicroVM isolation where hardware supports it (Firecracker on x86)
- [ ] DID integration with ESC/EID for `elastos://` WebSpace
- [ ] DHT participation — PC2 nodes store/forward DHT entries (Level 2)

**Agent Economy:**
- [ ] Agent-to-agent communication (capability-gated trust)
- [ ] Investable agents with dDRM-protected capabilities
- [ ] Tradeable skill capsules (agent expertise as distributable CIDs)
- [ ] Agent marketplace (deploy, discover, interact)
- [ ] Evaluate ERC-8004 agent registry for node/agent identity and discovery
- [ ] Register PC2 nodes and Flint agent in ERC-8004 Identity Registry (ERC-721)
- [ ] Integrate ERC-8004 Reputation Registry for dApp Store app/agent ratings
- [ ] Expose MCP/A2A endpoints in agent registration files for cross-agent discovery

**Carrier Network:**
- [ ] Multi-supernode WireGuard with load balancing (NETWORK_HARDENING Phase 2)
- [ ] Geographic supernode routing (connect to nearest)
- [ ] 5+ operational supernodes

---

### Milestone 8 — Year 2 Review & Convergence Progress (Dec 1, 2027)

**Goal:** Comprehensive Year 2 accountability.

- [ ] Marketplace activity report (transactions, dDRM sales, capsule installs)
- [ ] Protocol fee deployment metrics (ELA bought, fees collected)
- [ ] Capsule architecture advancement (% of services modularized)
- [ ] Node network growth (active nodes, geographic distribution)
- [ ] Full Year 2 financial expenditure report

---

### Milestones 9–13 — Sovereign Scale (2028–2029)

**These milestones are directional. Specific tasks will be defined based on Year 1-2 learnings.**

**Peer-to-Peer Services (M9):**
- Direct exchange of compute, storage, content between nodes
- Sandboxed AI execution environments
- Protocol fee revenue expansion

**Self-Sustaining Revenue (M10):**
- Protocol fees covering operational costs
- Node operator profitability from real usage
- ELA demand from structural mechanics

**Capsule Ecosystem (M11):**
- Growing catalog of independent capsules
- Autonomous agent-to-agent commerce
- Runtime convergence: minimal core + capsule ecosystem

**Enterprise Readiness (M12):**
- Enterprise-grade reliability, security, scalability
- Capital raise positioning with documented traction
- Performance and stability focus

**Mandate Completion (M13 — Mar 2029):**
- Full 3-year report: commits, releases, nodes, fees, growth, expenditure
- Foundation for self-sustainability beyond funding period

---

## Cross-Cutting Concerns (Apply to All Milestones)

### Rong's Vision Alignment

| Rong's Concept | How ElastOS Implements It | Status |
|----------------|--------------------------|--------|
| Cloud storage as primary, local as cache | IPFS as storage layer, local files as cache | ✅ Working |
| Personal Cloud Computer (Digital Silo) | PC2 node on personal hardware | ✅ Working |
| P2P network of Elastos Computers | Carrier overlay + WireGuard + Active Proxy | ✅ Working |
| Apps in VMs | Capsules in WASM/microVM sandboxes | 📋 Phase 2-3 |
| Instant Apps (Code Browser) | Capsules distributed by CID, installed from marketplace | 📋 Phase 2 |
| `https://` WebSpace | `*.ela.city` domains via gateway | ✅ Working |
| `localhost://` WebSpace | Carrier P2P between nodes | 🔨 Phase 1-2 |
| `elastos://` WebSpace | Blockchain oracles, DID resolution | 📋 Phase 3 |
| IoT / Smart Home | Jetson, sensors, cameras as context feeds | 🔨 Phase 1-2 |
| Awareness Layer | Location + photo + voice + memory → contextual agent | 🔨 Phase 2-3 |
| Full-duplex Voice | PersonaPlex-7B or equivalent on-device voice model | 📋 Phase 3+ |
| Runtime manages ALL network traffic | Capability-gated networking in runtime | 📋 Phase 3 |

### Elacity dDRM SDK Integration Path

```
Phase 1 (M2-M3):
  Integrate dDRM SDK → encrypted content upload → access tokens
  → marketplace UI → buyer downloads → buyer becomes seeder

Phase 2 (M4-M6):
  Fee collection → ELA buy-pressure → royalty distribution
  → creator tools (AI-generated content with rights management)

Phase 3 (M7+):
  dDRM as a capsule → independent versioning → third-party DRM providers
  → cross-node content licensing → autonomous commerce
```

### ERC-8004 Agent Registry Integration Path

> **Standard:** [ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004) (Draft, Aug 2025)
> **Authors:** MetaMask, Ethereum Foundation, Google, Coinbase
> **Status:** Draft, ~1,500 agents registered on Sepolia testnet (Mar 2026)
> **CTO Note:** Evaluate alongside bankr/BNKR trend — autonomous on-chain agents with identity + reputation are seeing massive market growth ($100M+ market cap).

Three on-chain registries: Identity (ERC-721 per agent), Reputation (feedback signals), Validation (zkML/TEE/re-execution proofs). Complementary to Elacity SDK — ERC-8004 handles agent discovery/trust, Elacity handles content rights/marketplace.

```
Phase 1 (M2-M5) — Forward-Compatible Design:
  Design app.json manifest services[] field to align with ERC-8004
  registration file format → zero rework when adopting the standard later
  Ensure DID integration can serve as identity layer for ERC-8004

Phase 2 (M5-M7) — Node Identity & Reputation:
  Register PC2 nodes as ERC-8004 agents (ERC-721 NFT per node)
  → node registration file advertises ela.city URL, MCP endpoint, DID
  Wire dApp Store ratings to Reputation Registry (on-chain feedback)
  → app quality, uptime, success rate as on-chain signals

Phase 3 (M7+) — Agent Economy:
  Register Flint AI agent in Identity Registry with A2A/MCP endpoints
  → other agents discover and interact with Flint via ERC-8004
  Agent-to-agent trust via Reputation + Validation registries
  → capability-gated agent interactions with on-chain reputation
  Content creators as registered agents with reputation scores
```

### Network Hardening (from NETWORK_HARDENING.md)

| Priority | Item | Target Milestone |
|----------|------|-----------------|
| Must-have | Gateway under systemd | M2 |
| Must-have | SQLite registry | M2 |
| Must-have | Uptime monitoring | M2 |
| Must-have | SSL auto-renewal | M2 |
| Should-have | Registry replication | M3 |
| Should-have | Multi-supernode WireGuard | M3-M7 |
| Should-have | Per-domain rate limiting | M3 |
| Should-have | Node health dashboard | M4 |
| Future | Distributed registry (on-chain) | M7+ |
| Future | Mesh networking | M9+ |
| Future | Geographic routing | M7+ |

### ELA Value Capture Mechanics

```
Usage → Fees → Buy ELA → Scarcity → Price Support

Mechanisms:
1. Marketplace fees (dDRM purchases)        → M3-M4
2. Protocol fees (in-OS transactions)       → M4
3. Carrier premium tiers (ELA staking)      → M3-M4
4. Node operator routing fees               → M4-M7
5. Compute/storage fees                     → M7+
6. Agent-to-agent transaction fees          → M9+

All fees → pool → market-buy ELA from DEX LPs
```

---

## Monthly Release Cadence

Starting Month 1 (March 2026):

| Release | Target | Focus |
|---------|--------|-------|
| v1.1.0 | March 2026 | Merge Jetson branch, bug fixes, AV1 player |
| v1.2.0 | April 2026 | Hardware expansion, installer improvements |
| v1.3.0 | May 2026 | Voice interaction prototype (Whisper + Ollama + TTS), Context API endpoint |
| v1.4.0 | June 2026 | P2P messaging foundation, dDRM SDK integration begins, memory store alpha |
| v1.5.0 | July 2026 | dDRM marketplace alpha |
| v1.6.0 | August 2026 | Supernode expansion, premium tiers |
| v1.7.0 | September 2026 | Protocol fees alpha, node economics |
| v1.8.0 | October 2026 | Developer SDK, extension system |
| v1.9.0 | November 2026 | Capsule marketplace alpha |
| v1.10.0 | December 2026 | Year 1 hardening + comprehensive review |

*Releases beyond v1.10.0 defined based on Year 1 learnings.*

---

## How to Use This Document

1. **Monthly:** Review current milestone, check off completed items, plan next month
2. **Weekly:** Reference for shipping reports — what was done, what's next
3. **Quarterly:** Milestone review against DAO proposal commitments
4. **For new team members / contributors:** Start here to understand the full picture
5. **For community questions:** Point to specific sections showing progress and direction
