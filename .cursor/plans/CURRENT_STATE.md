# PC2 / ElastOS — Current State

**Last Updated:** March 2, 2026
**Current Branch:** `feature/jetson-gpu-acceleration`
**Main Branch:** `main` (v1.0.0 released)

---

## Quick Context

PC2 is a decentralized Personal Cloud node — a web-based OS (forked from Puter) with IPFS storage, local AI (Ollama/Claude), Particle Wallet auth, Boson P2P networking, and a Telegram bot AI agent (Flint). Users install PC2 on a VPS, Raspberry Pi, Jetson, or desktop and get a `username.ela.city` domain routed to their node via WireGuard (fast) or ActiveProxy (NAT fallback).

**Repository:** https://github.com/Elacity/pc2.net
**Organization:** Elacity Labs (for the Elastos ecosystem)

---

## Branch Status

### `main` — v1.0.0 Production Release
- Stable, released
- All core features working: dashboard, IPFS, AI chat, wallet auth, file management, terminal
- ActiveProxy has the **old** protocol code (key format fix only)
- Does NOT have WireGuard, Voice AI, virtual desktops, or UI overhaul

### `feature/jetson-gpu-acceleration` — ACTIVE DEVELOPMENT
- **55+ commits ahead of main**
- Contains the following major workstreams:
  1. **ActiveProxy Protocol Rewrite** — complete, tested on 2 Jetson devices
  2. **Jetson GPU Acceleration** — Ollama + CUDA working on Jetson Orin Nano
  3. **WireGuard Cross-Platform** — macOS + Linux support with auto-install
  4. **Voice AI Pipeline** — Whisper STT + Piper TTS with Settings UI
  5. **Ubuntu/macOS Desktop UI** — top bar, dock, virtual desktops, Mission Control
  6. **Ollama Improvements** — tool fallback, model library, download progress
  7. **Mobile UI Fixes** — taskbar z-index, responsive layouts
- **Status:** Ready for merge to main pending Sash's Jetson validation
- **Tested on:** macOS (dev), Jetson Orin Nano (EverlastingOS + Anders/alm.ela.city), macOS local install

---

## What's Shipped (v1.1.0 — on branch)

### Major Features
- **Virtual Desktops (Spaces)** — create, switch, delete workspaces; Mission Control overlay with live previews
- **Ubuntu-style Desktop UI** — top bar with clock, dock, refined window chrome, file explorer improvements
- **Voice AI** — Whisper STT + Piper TTS pipeline; mic button in AI chat; Settings UI with Install/Enable toggle
- **WireGuard macOS** — full cross-platform support; auto-install via `start-local.sh`; passwordless sudo; network change detection
- **Ollama Tool Fallback** — models that reject tool definitions automatically retry without tools
- **AI Thinking Scroll** — reasoning/thinking block is scrollable with auto-scroll during streaming

### Bug Fixes
- Mobile taskbar z-index (no longer covers full-screen windows)
- Sidebar icon hover color in light mode
- WireGuard retry backoff (60s → 15s)
- WireGuard PATH detection under PM2/systemd
- Large file upload progress bar
- AV1/Firefox video playback
- IPFS DHT client mode + connection limits
- Gateway keep-alive hardening
- Particle Auth build (Vite 6.x strict mode)
- Startup performance (parallelized initialization)

---

## Immediate Priority: Merge to Main

**Blocking:** Sash validating on his own Jetson hardware (Milestone 1 requirement).

Once confirmed:
1. Merge `feature/jetson-gpu-acceleration` → `main`
2. Tag v1.1.0 release
3. All existing PC2 nodes update via `git pull`

---

## What's on the Supernode

**Supernode:** `69.164.241.210` (Linode)
- Java Boson server: port 8090 (AUTH), allocates ports 25000+ for relay
- Node.js web-gateway: port 80, behind Nginx with TLS
- WireGuard server: fast direct access for registered nodes

**Gateway domain routing:**
- `*.ela.city` → Nginx → web-gateway
- web-gateway looks up username → endpoint mapping
- WireGuard endpoint → direct proxy (fast, preferred)
- ActiveProxy endpoint → relay through Java allocated port (fallback)

---

## Pending Work (Ordered by Priority)

### Critical
1. **Merge to main + v1.1.0 release** — blocked on Sash's Jetson validation
2. **Apple code signing** — $99/year, removes `xattr -cr` requirement for Mac launcher

### High
3. **Pre-built Jetson/Pi images** — zero-terminal hardware install
4. **ActiveProxy in Desktop Launcher** — auto-connect for external access from laptops
5. **Fix "Copy & Save" recovery phrase** — mnemonic API returns null after restart

### Medium
6. **Windows native installer** — Electron already supports Windows builds
7. **Linux .deb package** — currently script-only install
8. **Upload updated soul.md to Contabo** — Flint knowledge base is written but not deployed

### Future
9. **Boson V2 integration** — waiting on Boson team
10. **P2P messaging between nodes**
11. **dDRM marketplace**
12. **Mobile companion app**

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `pc2-node/src/services/boson/ActiveProxyClient.ts` | ActiveProxy tunnel client (rewritten) |
| `pc2-node/src/services/boson/ConnectivityService.ts` | Supernode connection management + network change detection |
| `pc2-node/src/services/wireguard/WireGuardService.ts` | WireGuard tunnel management (macOS + Linux) |
| `pc2-node/src/services/ai/providers/OllamaProvider.ts` | Ollama API integration with tool fallback |
| `pc2-node/src/api/voice.ts` | Voice AI endpoints (install, enable, disable) |
| `pc2-node/src/api/ai.ts` | AI endpoints (Ollama status, model pull, GPU info) |
| `src/gui/src/UI/Settings/UITabAI.js` | AI settings UI (models, voice, download progress) |
| `src/gui/src/UI/AI/UIAIChat.js` | AI chat window (thinking scroll, voice button) |
| `src/gui/src/helpers/WorkspaceManager.js` | Virtual desktops / Spaces implementation |
| `scripts/start-local.sh` | Local install script (macOS/Linux, auto-installs WireGuard) |
| `scripts/install-arm.sh` | ARM device install script (Jetson/Pi) |
| `deploy/web-gateway/index.js` | Gateway on supernode (routes *.ela.city) |
| `agents/flint/soul.md` | AI agent knowledge base |
| `pc2-node/config/default.json` | Default configuration including supernode list |

---

## Documentation Index

### Internal Planning (this repo: pc2.net)

| Document | Path | Content |
|----------|------|---------|
| **This file** | `.cursor/plans/CURRENT_STATE.md` | Quick context for new agents |
| **ActiveProxy Fix** | `.cursor/plans/activeproxy_fix.md` | Detailed ActiveProxy work |
| **Roadmap** | `.cursor/plans/Roadmap.md` | Post-launch roadmap with tracks |
| **Jetson SDK** | `.cursor/plans/jetson_sdk_optimization_3c7e940c.plan.md` | GPU acceleration plan |
| **Flint Upgrade** | `.cursor/plans/upgrade_flint_ai_agent_4946c79b.plan.md` | AI agent knowledge base plan |
| **Work Summary** | `docs/WORK_SUMMARY.md` | Complete development history across all branches |

### Core Documentation (docs/)

| Document | Path | Content |
|----------|------|---------|
| **The Big Picture** | `docs/core/THE_BIG_PICTURE.md` | ElastOS + Elacity dDRM vision |
| **Architecture Convergence** | `docs/core/ARCHITECTURE_CONVERGENCE.md` | PC2 v1 → ElastOS Runtime v2 path |
| **Strategic Roadmap** | `docs/core/ROADMAP.md` | Keystone Fund milestones M1–M13 |
| **ARM Devices** | `docs/deployment/ARM_DEVICES.md` | Jetson/Pi deployment guide |

### Public Documentation Site (docs.ela.city)

> **IMPORTANT:** The public docs site is in a SEPARATE repository:
> **https://github.com/Elacity/document-portal** (deployed via Vercel)
>
> Do NOT edit `Elacity/ElacityLabsWeb` for docs — that repo has a `docs/` subfolder
> but it is NOT the live docs.ela.city site.
>
> When updating public documentation, clone and push to `document-portal`.
> Local clone: `/Users/mtk/Documents/Cursor/document-portal`

---

## Community Testing Command

When a community member needs to update to the latest branch:

```bash
cd ~/pc2.net && git stash && git pull origin feature/jetson-gpu-acceleration && git stash drop && npm run build:pc2 && pm2 restart pc2
```

---

## Environment Notes

- **Node.js:** v20+ required (v22 LTS preferred for Electron launcher)
- **Java Boson server:** Cannot be modified (binary, runs on supernode)
- **Encryption:** NaCl (tweetnacl) — CryptoBox with precomputed shared keys
- **Config:** `pc2-node/config/default.json` has supernode list (base58 public keys)
- **PM2:** Process manager on VPS/Jetson deployments
- **WireGuard:** Preferred over ActiveProxy for speed; auto-installed on macOS/Linux
- **The `CONTABO_NODE_01` supernode ID** in some configs is a placeholder — it gets skipped with a harmless warning
