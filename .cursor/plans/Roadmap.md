# PC2 Post-Launch Roadmap

**Status:** v1.0.0 Launched | **Date:** February 2026

---

## Executive Summary

With PC2 v1.0.0 successfully launched, this roadmap outlines the path forward. **The #1 priority is making PC2 accessible to non-technical users** - normal people who just want to download, install, and run.

### Priority Tracks (Ordered)

1. **Normal People Product** - Zero-terminal install experiences for Mac, Windows, Linux, and hardware
2. **Stabilization** - Bug fixes, testing, community feedback
3. **Platform Expansion** - Multi-device support, hardware optimization
4. **Ecosystem Growth** - Hardware sales, marketplace, Boson V2 integration

---

## TRACK 0: NORMAL PEOPLE PRODUCT (Highest Priority)

> **"I mean a normal user experience same as with app exe file: download / click / install / run."** - Igor (Community Feedback)

### The Problem

Today, every installation path requires terminal commands. This excludes 95% of potential users. The community has been clear: we are in a dev bubble. We need products for people whose technical limit is "download from Google Play."

### The Goal

| Platform | User Experience | Status |
|----------|----------------|--------|
| **macOS** | Download .dmg → Double-click → Drag to Applications → Run | ⚠️ Needs Apple cert |
| **Windows** | Download .exe → Double-click → Install → Run | ⚠️ Needs building |
| **Linux (Ubuntu/Jetson)** | Download .deb → Double-click → Install → Run | ⚠️ Needs packaging |
| **Hardware (Pi/Jetson)** | Flash image → Plug in → Open browser → Done | ⚠️ Needs image |
| **Pre-built Hardware** | Unbox → Plug in → Open browser → Done | ⚠️ Needs DePIN partnership |

### 0.1 Signed macOS App (Effort: Low | ETA: 1-2 weeks)

**Current state:** ElastOS Launcher works but requires `xattr -cr` terminal command due to missing Apple code signing.

**What's needed:**
- [ ] Apple Developer Program enrollment ($99/year)
- [ ] Code signing certificate setup
- [ ] Notarization with Apple (automated via `electron-builder`)
- [ ] Update GitHub Actions to sign builds
- [ ] Result: Download .dmg → Double-click → Works

**Cost:** $99/year

### 0.2 Windows Installer (Effort: Medium | ETA: 2-4 weeks)

**Current state:** No Windows support except WSL (which is terminal-based).

**Option A: Native Electron App (Recommended)**
- [ ] Build ElastOS Launcher for Windows (Electron already supports this)
- [ ] Create proper `.exe` / `.msi` installer via `electron-builder`
- [ ] Windows code signing certificate (~$200-400/year or free with open source programs)
- [ ] Auto-update via Squirrel/electron-updater
- [ ] Result: Download .exe → Install → Run
- [ ] PC2 runs inside the Electron app (same as macOS Desktop Launcher)

**Option B: Windows Subsystem for Linux (Current)**
- Requires WSL2 knowledge
- Only for technical users
- Not a "normal people" solution

### 0.3 Linux .deb Package (Effort: Medium | ETA: 2-3 weeks)

**Current state:** Terminal script only.

**What's needed:**
- [ ] Package PC2 as `.deb` (Debian/Ubuntu/Raspberry Pi OS/Jetson)
- [ ] Include systemd service (auto-starts on boot)
- [ ] Desktop entry file (shows in app launcher)
- [ ] Post-install script configures and starts PC2
- [ ] Result: Download .deb → Double-click in file manager → "Install" → Done
- [ ] Alternative: `.AppImage` for any Linux (single file, double-click to run)

### 0.4 Pre-Built Hardware Image (Effort: Medium | ETA: 2-3 weeks)

**Current state:** Users must flash stock OS, then run terminal script.

**What's needed:**
- [ ] Build Raspberry Pi OS image with PC2 pre-installed
- [ ] Build Jetson Ubuntu image with PC2 + Ollama pre-installed
- [ ] Auto-start PC2 on first boot
- [ ] mDNS broadcast (accessible at `http://pc2.local`)
- [ ] First-run web wizard: pick username → connect wallet → done
- [ ] Host images for download on ela.city
- [ ] Result: Download image → Flash with Raspberry Pi Imager (GUI) → Boot → Open browser

**User flow:**
```
1. Download PC2 image file from ela.city
2. Download Raspberry Pi Imager (GUI app from raspberrypi.com)
3. Select image → Select SD card → Click "Write"
4. Put SD card in device, plug in power + ethernet
5. Open browser → http://pc2.local
6. Web wizard: pick username, connect wallet
7. Done. Zero terminal.
```

### 0.5 External Access from Desktop (Not Just Localhost)

**Community Question:** "When I run on my laptop, can people access it from outside, not just localhost?"

**Answer: YES - via ActiveProxy.** We already have the technology.

```
┌──────────────────────────────────────────────────────┐
│  How External Access Works (Already Built)           │
│                                                      │
│  User's Laptop (behind home NAT/firewall)            │
│       │                                              │
│       │ ActiveProxy tunnel (WebSocket)               │
│       ▼                                              │
│  Elastos Super Node (public server)                  │
│       │                                              │
│       │ username.ela.city → tunnel → laptop           │
│       ▼                                              │
│  Anyone on the Internet                              │
│       → Opens username.ela.city                      │
│       → Reaches your laptop's PC2                    │
│                                                      │
│  When laptop is ON  → accessible worldwide           │
│  When laptop is OFF → offline (expected)             │
└──────────────────────────────────────────────────────┘
```

**What's missing:** The Desktop Launcher doesn't auto-enable ActiveProxy yet.

**Tasks:**
- [ ] Auto-connect to ActiveProxy on PC2 startup
- [ ] Register `username.ela.city` from the setup wizard (already exists on VPS)
- [ ] Show connection status in Desktop Launcher UI (connected/offline)
- [ ] Result: Mac/Windows user runs app → accessible at `username.ela.city` while running

**With this, the Mac/Windows experience becomes:**
```
1. Download ElastOS app
2. Install (double-click)
3. Run → Setup wizard → Pick username → Connect wallet
4. Your PC2 is live at username.ela.city
5. Accessible from any device, anywhere in the world
6. Close app → goes offline (as expected for a laptop)
```

### 0.6 Priority Order

| # | Task | Impact | Effort | Target |
|---|------|--------|--------|--------|
| 1 | Apple code signing | Removes terminal step for Mac users | Low | Feb 2026 |
| 2 | Pre-built Pi/Jetson images | Zero-terminal for hardware users | Medium | Feb-Mar 2026 |
| 3 | ActiveProxy in Desktop Launcher | External access from laptops | Medium | Mar 2026 |
| 4 | Linux .deb package | Double-click install for Ubuntu/Jetson | Medium | Mar 2026 |
| 5 | Windows .exe installer | Opens entire Windows market | Medium | Mar-Apr 2026 |

---

## Track 1: Immediate Bug Fixes (February 2026)

### 1.1 Critical Bug Fixes

| Task | Priority | Status | Notes |
|------|----------|--------|-------|
| Fix "Copy & Save" recovery phrase button | High | Pending | Mnemonic API returns null after server restart |
| Auto-install build deps on Ubuntu/Debian | High | ✅ Done | Commit `4df6f0c6` - fixes node-pty error |
| Monitor community feedback | High | Ongoing | Triage bugs from real users |
| Documentation sync | Medium | Pending | Ensure docs.ela.city matches v1.0 |

### 1.2 Quality Assurance

| Task | Priority | Status |
|------|----------|--------|
| End-to-end testing on all deployment methods | High | Pending |
| Desktop Launcher stability testing | High | Pending |
| VPS deployment verification | Medium | Pending |

---

## Track 2: Multi-Device Testing & Hardware Support

### 2.1 Device Testing Matrix

| Device | Architecture | Status | Priority | Notes |
|--------|--------------|--------|----------|-------|
| **Desktop (macOS Intel)** | x86_64 | ✅ Tested | - | Primary dev platform |
| **Desktop (macOS Apple Silicon)** | arm64 | ✅ Tested | - | M1/M2/M3 Macs |
| **Desktop (Windows)** | x86_64 | 🔄 WSL Only | High | Needs native installer |
| **Desktop (Linux x86)** | x86_64 | ✅ Tested | - | Ubuntu 22.04+ |
| **VPS (Contabo/Hetzner)** | x86_64 | ✅ Tested | - | Primary cloud target |
| **Raspberry Pi 4** | arm64 | ⏳ Needs Testing | High | 4GB+ RAM required |
| **Raspberry Pi 5** | arm64 | ⏳ Needs Testing | High | Recommended Pi model |
| **NVIDIA Jetson Nano** | arm64 | ✅ Running (Everlasting) | - | GPU acceleration confirmed |
| **NVIDIA Jetson Orin** | arm64 | ⏳ Needs Testing | Medium | High-end AI target |
| **DePIN NAS Box** | TBD | ⏳ End of Feb | High | Pre-installed product target |
| **Orange Pi 5** | arm64 | ⏳ Future | Low | Community request |
| **Pine64** | arm64 | ⏳ Future | Low | Community request |

### 2.2 Multi-Device Testing Plan

**Phase 1: Raspberry Pi (Q1 2026)**
- [ ] Test on Raspberry Pi 4 (4GB)
- [ ] Test on Raspberry Pi 5 (8GB)
- [ ] Optimize memory usage for 4GB devices
- [ ] Create Pi-specific pre-built image
- [ ] Document Pi-specific gotchas (swap, SSD, cooling)

**Phase 2: Jetson Devices (Q1-Q2 2026)**
- [ ] Test on Jetson Nano (4GB) - Everlasting running this
- [ ] Test on Jetson Orin Nano
- [ ] Implement Jetson SDK detection (see `jetson_sdk_optimization_3c7e940c.plan.md`)
- [ ] Enable GPU-accelerated Ollama
- [ ] Create Jetson pre-built image with Ollama + DeepSeek
- [ ] Document Jetson-specific AI performance gains

**Phase 3: DePIN NAS Hardware (Feb-Mar 2026)**
- [ ] Coordinate with DePIN team on NAS spec
- [ ] Create pre-installed image for NAS
- [ ] Test ActiveProxy connectivity from behind NAT
- [ ] First-boot wizard optimization
- [ ] Product packaging and documentation

**Phase 4: Other ARM Devices (Q2 2026)**
- [ ] Community-driven testing
- [ ] Orange Pi, Pine64, etc.
- [ ] Document compatibility matrix

---

## Track 3: Jetson SDK Integration

### 3.1 Overview

NVIDIA Jetson devices provide GPU acceleration for local AI (Ollama), enabling faster inference without cloud dependency.

### 3.2 Implementation Tasks

| Task | Status | Priority |
|------|--------|----------|
| Create `platform.ts` Jetson detection utility | Pending | High |
| Update `/api/system/info` with Jetson info | Pending | High |
| Update `/api/ai/ollama-status` with GPU status | Pending | High |
| Update AI Settings UI to show GPU acceleration | Pending | Medium |
| Create Jetson setup guide endpoint | Pending | Low |
| Performance benchmarks (tokens/sec) | Pending | Low |

### 3.3 Supported Jetson Models

| Model | RAM | GPU | AI Performance | Price Point |
|-------|-----|-----|----------------|-------------|
| Jetson Nano | 4GB | 128 CUDA cores | Entry-level | ~$150 |
| Jetson Orin Nano | 8GB | 1024 CUDA cores | Mid-range | ~$500 |
| Jetson Orin NX | 16GB | 2048 CUDA cores | High-end | ~$900 |
| Jetson AGX Orin | 64GB | 2048 CUDA cores | Enterprise | ~$2000 |

### 3.4 Expected Benefits

- **3-10x faster** AI inference vs CPU-only
- **Local AI** without cloud API costs
- **Privacy** - all processing on-device
- **Offline capable** - no internet required for AI

---

## Track 4: Personal Hardware Sales

### 4.1 Strategy Overview

Offer pre-configured PC2 hardware for users who want plug-and-play sovereignty. **This is the answer to Igor's question** - buy a box, plug it in, done.

### 4.2 Product Lineup (Proposed)

| Product | Base Hardware | Target Price | Target Audience |
|---------|---------------|--------------|-----------------|
| **PC2 Lite** | DePIN NAS Box | TBD | Non-technical users |
| **PC2 Home** | Raspberry Pi 5 (8GB) + Case + SSD | $199-249 | Home users, beginners |
| **PC2 Pro** | Jetson Orin Nano + Case + SSD | $599-699 | Power users, AI enthusiasts |
| **PC2 Enterprise** | Jetson AGX Orin + NVMe | $2,499+ | Businesses, developers |

### 4.3 Hardware Bundle Contents

**PC2 Lite Bundle (DePIN NAS):**
- [ ] DePIN NAS box with custom chip
- [ ] PC2 pre-installed
- [ ] Quick start guide (2 steps: plug in, open browser)
- [ ] 1 year `*.ela.city` subdomain

**PC2 Home Bundle:**
- [ ] Raspberry Pi 5 (8GB)
- [ ] Official case with fan
- [ ] 128GB NVMe SSD + adapter
- [ ] Power supply
- [ ] Pre-flashed SD card with PC2
- [ ] Quick start guide
- [ ] 1 year `*.ela.city` subdomain

**PC2 Pro Bundle:**
- [ ] NVIDIA Jetson Orin Nano
- [ ] Custom enclosure
- [ ] 256GB NVMe SSD
- [ ] Power supply
- [ ] Pre-configured with Ollama + DeepSeek
- [ ] Quick start guide
- [ ] 1 year `*.ela.city` subdomain
- [ ] Priority support

### 4.4 Sales Channels

| Channel | Priority | Status |
|---------|----------|--------|
| Direct (ela.city store) | High | Planning |
| Amazon | Medium | Future |
| Partner resellers | Low | Future |

### 4.5 Implementation Tasks

| Task | Status | Priority |
|------|--------|----------|
| Define final product specs | Pending | High |
| Source hardware suppliers | Pending | High |
| Create PC2 pre-flash images | Pending | High |
| Design packaging/branding | Pending | Medium |
| Set up e-commerce (Shopify/WooCommerce) | Pending | Medium |
| Legal/compliance (FCC, CE) | Pending | Medium |
| Warranty/support process | Pending | Medium |
| Pricing finalization | Pending | High |

---

## Track 5: Version Roadmap

### v1.1 - Bug Fixes & Normal People (Feb-Mar 2026)

| Feature | Status |
|---------|--------|
| Fix recovery phrase copy bug | Pending |
| Apple code signing (no terminal on Mac) | Pending |
| Pre-built Pi/Jetson images | Pending |
| Ubuntu build deps auto-install | ✅ Done |
| Improved error messages | Pending |
| Documentation improvements | Pending |

### v1.2 - Windows & External Access (Mar-Apr 2026)

| Feature | Status |
|---------|--------|
| Windows .exe installer | Pending |
| Linux .deb package | Pending |
| ActiveProxy auto-connect in Desktop Launcher | Pending |
| Desktop Launcher shows ela.city domain status | Pending |

### v1.5 - ElastOS Integration Begins (Q2 2026)

| Feature | Status |
|---------|--------|
| Boson V2 P2P connectivity | Waiting on Boson team |
| Direct PC2-to-PC2 chat | Pending |
| IoT device networking | Pending |
| PC2 as capsule (`elastos://QmPC2...`) | Pending |
| Optional Firecracker deployment | Pending |
| Multi-domain support (`ela.net`, `pc2.net`) | Pending |

### v2.0 - Full ElastOS Native (Q3 2026)

| Feature | Status |
|---------|--------|
| All apps as capsules | Pending |
| Full capability token system | Pending |
| dDRM content as capsules | Pending |
| Elacity marketplace integration | Pending |
| Cryptographic audit trail | Pending |
| AI agents sandboxed with capabilities | Pending |

### v2.5 - Ecosystem Expansion (Q4 2026)

| Feature | Status |
|---------|--------|
| Third-party capsule store | Pending |
| Developer SDK for capsule creation | Pending |
| Cross-chain dDRM | Pending |
| DeepSeek personal AI integration | Pending |
| Advanced royalty markets | Pending |

### v3.0 - Full dDRM Economy (2027)

| Feature | Status |
|---------|--------|
| Content marketplace live | Pending |
| Creator token issuance | Pending |
| Smart contract payments | Pending |
| Global capsule CDN | Pending |
| Enterprise deployment | Pending |

---

## Timeline Visualization

```
Feb 2026        Mar 2026        Q2 2026         Q3 2026         Q4 2026         2027
    │               │               │               │               │              │
    ▼               ▼               ▼               ▼               ▼              ▼

┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│  v1.0   │   │ v1.1    │   │  v1.5   │   │  v2.0   │   │  v2.5   │   │  v3.0   │
│ LAUNCH  │──▶│ Normal  │──▶│ Boson   │──▶│ ElastOS │──▶│ Capsule │──▶│  dDRM   │
│  ✅     │   │ People  │   │   V2    │   │ Native  │   │  Store  │   │ Economy │
└─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
                  │
                  ├── Apple cert (Mac just works)
                  ├── Pre-built images (Pi/Jetson just works)
                  ├── .deb package (Linux just works)
                  ├── Windows .exe (Windows just works)
                  ├── ActiveProxy in Launcher (external access)
                  └── DePIN NAS (buy, plug in, done)
```

---

## Community Feedback Log

### Igor (5 Feb 2026)
> "When does this move from developer/early-tester mode to a single packaged installer or plug-and-play solution for non-technical users? Download / click / install / run."

**Response:** Track 0 addresses this directly. Apple cert is low effort, high impact. Pre-built images and .deb packages follow. Target: March 2026 for Mac/Linux "just works", April for Windows.

### Joel (5 Feb 2026)
> node-pty "Failed to load native module" error on Ubuntu 24.04 via WSL

**Response:** Fixed in commit `4df6f0c6`. Install script now auto-installs build dependencies on Debian/Ubuntu before npm install.

### Sasha (5 Feb 2026)
> DePIN team plan to have a NAS box with their chip end of Feb. We can experiment with pre-installing the whole system and selling a product.

**Response:** Added DePIN NAS as "PC2 Lite" product. Pre-built image creation is a prerequisite.

---

## Success Metrics

### Non-Technical User Adoption
- [ ] Mac install requires zero terminal commands
- [ ] Pre-built images available for Pi and Jetson
- [ ] Windows installer available
- [ ] First DePIN NAS hardware ships

### Community Growth
- [ ] 100+ nodes on map.ela.city by end of Q1 2026
- [ ] 500+ nodes by end of Q2 2026
- [ ] 1000+ nodes by end of 2026

### Hardware Sales
- [ ] Launch hardware store by Q2 2026
- [ ] 100 units sold in first quarter
- [ ] Break-even on hardware operations

### Platform Stability
- [ ] < 1% crash rate across all platforms
- [ ] < 5 critical bugs per month
- [ ] 99%+ uptime for gateway services

### Developer Ecosystem
- [ ] 10+ third-party apps by Q3 2026
- [ ] Public SDK documentation complete
- [ ] Developer onboarding guide published

---

## Related Plans

- [Jetson SDK Optimization](./jetson_sdk_optimization_3c7e940c.plan.md)
- [Flint AI Agent Upgrade](./upgrade_flint_ai_agent_4946c79b.plan.md)

---

**Document Version:** 2.0  
**Created:** February 2026  
**Last Updated:** February 2026  
**Owner:** Elacity Labs
