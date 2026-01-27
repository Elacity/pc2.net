# Strategic Implementation Plan: Sash + Anders Vision
## Puter-on-PC2 Architecture

**Date:** 2025-01-11 (Started) | 2026-01-27 (Current)  
**Branch:** `main` (Clawdbot Integration Merged)  
**Status:** ✅ **v1.0.0 READY FOR LAUNCH** - All Core Features Complete

---

## 🛑 CRITICAL: ONLY RUN pc2-node - NEVER RUN MAIN PUTER

**THIS IS THE MOST IMPORTANT RULE IN THIS CODEBASE:**

| DO THIS | NEVER DO THIS |
|---------|---------------|
| `cd pc2-node && npm run dev` | `npm run dev` (from root) |
| `cd pc2-node && npm start` | `npm start` (from root) |
| Server: `http://localhost:4200` | Server: `http://puter.localhost:xxxx` |

**The main Puter codebase (root `package.json`, `src/backend/`, `src/gui/`) is REFERENCE CODE ONLY.**

- **pc2-node/** = The standalone PC2 personal cloud node - THIS IS WHAT WE RUN
- **Main Puter** = Uses subdomains (`puter.localhost`), requires complex config - NEVER RUN THIS

**If you see:**
- "Subdomain not found" → You're running the WRONG server (main Puter)
- `http://puter.localhost:41xx` → You're running the WRONG server
- `http_port: "auto"` in config → This is main Puter config, NOT pc2-node

**Correct development workflow:**
```bash
cd /Users/mtk/Documents/Cursor/pc2.net/pc2-node
npm run dev          # Development with hot reload
# OR
npm start            # Production mode
```

---

## 🚀 Quick Start: Full System Restart

**When user requests "restart everything" or "get latest build":**

```bash
# Complete restart sequence (ALWAYS do all steps)

# 1. Kill any running server
lsof -ti:4200 | xargs kill -9 2>/dev/null || true

# 2. Build GUI bundle (if UI files in src/gui/src/ were changed)
cd /Users/mtk/Documents/Cursor/pc2.net/src/gui
node ./build.js
cp dist/bundle.min.js ../../pc2-node/frontend/bundle.min.js

# 3. Build and start pc2-node
cd /Users/mtk/Documents/Cursor/pc2.net/pc2-node
npm run build      # Compiles TypeScript backend AND syncs frontend assets
npm start          # Start server on http://localhost:4200
```

**Then:** User must hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)

### What Each Step Does:
| Step | Command | What It Builds |
|------|---------|----------------|
| GUI Bundle | `src/gui: node ./build.js` | Compiles `src/gui/src/**/*.js` → `bundle.min.js` |
| Backend | `pc2-node: npm run build:backend` | Compiles `src/**/*.ts` → `dist/**/*.js` |
| Frontend Assets | `pc2-node: npm run build:frontend` | Copies SDK, apps, index.html to `frontend/` |
| Full Build | `pc2-node: npm run build` | Runs both backend + frontend builds |

### Common Issues:
- **"Failed to generate QR code"** → Backend TypeScript not compiled. Run `npm run build` in pc2-node.
- **UI changes not appearing** → GUI bundle not rebuilt. Run `node ./build.js` in src/gui.
- **Tooltips/features missing** → Both builds needed. Follow full sequence above.

**See:** "Full System Restart Process" section below for details

---

## ⚠️ CRITICAL: Particle Auth Build Sync

**When rebuilding `packages/particle-auth`, you MUST sync to `src/particle-auth`:**

```bash
# After making changes to packages/particle-auth:
cd /Users/mtk/Documents/Cursor/pc2.net/packages/particle-auth
npm run build

# CRITICAL: Sync the build to src/particle-auth (server serves from here!)
rm -rf /Users/mtk/Documents/Cursor/pc2.net/src/particle-auth
cp -r /Users/mtk/Documents/Cursor/pc2.net/packages/particle-auth/dist /Users/mtk/Documents/Cursor/pc2.net/src/particle-auth

# Then restart server
cd /Users/mtk/Documents/Cursor/pc2.net/pc2-node
npm start
```

**Why?** The server checks multiple paths for particle-auth files (`pc2-node/src/static.ts`). If `src/particle-auth/` exists, it's served FIRST. Failing to sync after rebuild will serve stale bundles!

**Symptoms of stale bundle:**
- Debug logs don't appear in console
- Code changes don't take effect
- Browser shows old bundle hash (check Network tab → index-*.js filename)

---

## 🎯 Vision Statement

**"Puter runs ON the PC2 node itself - a self-contained software package that users install on their hardware (Raspberry Pi, VPS, Mac, etc.), accessible via a unique URL, with wallet-based decentralized identity."**

### Key Principles

1. **Self-Contained:** Frontend + Backend in one package
2. **Self-Hosted:** User controls hardware, data, and software
3. **Decentralized Identity:** Wallet-based authentication
4. **Global Access:** Unique URL accessible from anywhere
5. **No External Dependencies:** No reliance on public Puter service
6. **🛡️ Data Safety:** Comprehensive backup/restore system ensures user data is protected and recoverable

---

## 🆕 FOR NEW AGENTS: Start Here (2026-01-27)

**If you're a new AI agent picking up this project, read this section first.**

### Current State Summary

| Area | Status | Details |
|------|--------|---------|
| **Branch** | `main` | All features merged |
| **Version** | Ready for v1.0.0 | Launch pending |
| **Backend** | ✅ Complete | 32 services, 100+ API endpoints |
| **Frontend** | ✅ Complete | 8 settings tabs, 50+ UI components |
| **AI Agents** | ✅ Complete | 5 providers, per-agent memory, 20+ tools |
| **Storage** | ✅ Complete | IPFS (Helia), SQLite, private/public modes |
| **Network** | ✅ Complete | Boson, Active Proxy, username.ela.city |
| **Security** | ✅ Complete | Path traversal protection, wallet scoping |

### What's Left for v1 Launch

| Task | Priority | Est. Time |
|------|----------|-----------|
| Install scripts (3 paths) | Critical | 1-2 days |
| Security hardening (gateway) | Critical | 1 day |
| Documentation (3 guides) | High | 1-2 days |
| Final testing | Critical | 1-2 days |

### Key Documents to Read

1. **This document** - Full technical context
2. **`.cursor/plans/pc2_v1_launch_plan_b56827f2.plan.md`** - v1 launch plan
3. **`docs/WORLD_COMPUTER_ROADMAP.md`** - Executive update (1,057 lines)
4. **`docs/RELEASE_PROCESS.md`** - How to publish releases
5. **`docs/design/CLAWDBOT_UI_UX_PLAN.md`** - AI agent UI spec

### Key Directories

| Directory | Purpose |
|-----------|---------|
| `pc2-node/` | Standalone backend server (run from here!) |
| `pc2-node/src/services/` | All 32 backend services |
| `pc2-node/src/api/` | All 100+ API endpoints |
| `src/gui/src/UI/` | Frontend UI components |
| `src/gui/src/UI/Settings/` | 8 settings tabs |
| `deploy/web-gateway/` | Production gateway (ela.city) |
| `deploy/network-map/` | map.ela.city |

### How to Run

```bash
# ALWAYS run from pc2-node directory
cd /Users/mtk/Documents/Cursor/pc2.net/pc2-node
npm run dev          # Development with hot reload
# Server: http://localhost:4200
```

### What NOT to Do

- ❌ Never run `npm start` from root (runs wrong server)
- ❌ Never access `puter.localhost` URLs (wrong architecture)
- ❌ Never modify Puter core files in `src/backend/` (reference only)

---

## 📊 Current State Assessment

### 🎯 Recent Progress (2026-01-27) - CLAWDBOT INTEGRATION MERGED TO MAIN

**Full AI Agent System - ✅ COMPLETE & MERGED**

The `feature/clawdbot-integration` branch has been merged to `main`. PC2 now has a complete AI agent system with multi-provider support, per-agent memory, and multi-channel messaging.

---

**🔧 COMPLETE SERVICES BUILT (32 Backend Services):**

**AI Services (pc2-node/src/services/ai/):**
- ✅ `AIChatService` - Central AI orchestration (1000+ lines)
- ✅ `OllamaProvider` - Local AI (DeepSeek, Llama, etc.)
- ✅ `ClaudeProvider` - Anthropic Claude (Sonnet 4.5, Opus 4)
- ✅ `OpenAIProvider` - OpenAI GPT models
- ✅ `GeminiProvider` - Google Gemini
- ✅ `XAIProvider` - xAI Grok
- ✅ `AgentMemoryManager` - Per-agent isolated memory (MEMORY.md + daily notes)
- ✅ `EmbeddingProvider` - Multi-provider embeddings (Ollama, OpenAI, Google)
- ✅ `VectorMemoryStore` - SQLite with FTS5 for semantic search
- ✅ `MemoryConsolidator` - Memory pruning and consolidation
- ✅ `ToolExecutor` - Tool execution with permission checks
- ✅ `AgentKitExecutor` - Smart wallet transactions for agents
- ✅ `ContextRetriever` - RAG foundation for context injection
- ✅ `SystemPromptBuilder` - Structured prompt engineering
- ✅ `CognitiveToolkit` - Complex task analysis
- ✅ `TokenBudgetManager` - Token usage tracking

**Gateway Services (pc2-node/src/services/gateway/):**
- ✅ `GatewayService` - Multi-channel orchestration
- ✅ `ChannelBridge` - Message routing to agents
- ✅ `TelegramChannel` - Full Telegram bot support
- ✅ `WhatsAppChannel` - WhatsApp integration (in progress)

**Boson Services (pc2-node/src/services/boson/):**
- ✅ `BosonService` - P2P network orchestration
- ✅ `IdentityService` - Ed25519 keypairs, DIDs
- ✅ `UsernameService` - `username.ela.city` registration
- ✅ `ConnectivityService` - Super node connection management
- ✅ `ActiveProxyClient` - NAT traversal client
- ✅ `NetworkDetector` - Public IP, NAT type detection
- ✅ `ProxyProtocol` - Binary protocol implementation

**Other Services:**
- ✅ `TerminalService` - PTY with namespace isolation
- ✅ `WASMRuntime` - Server-side WASM execution (60%)
- ✅ `UpdateService` - Auto-updates from GitHub releases
- ✅ `ResourceMonitor` - System stats (CPU/Memory/Disk)
- ✅ `ParticleWalletProvider` - Wallet operations

---

**🔧 COMPLETE API SURFACE (100+ Endpoints):**

- `/api/gateway/*` - Channels, agents CRUD (9 endpoints)
- `/api/ai/*` - Chat, config, API keys (6 endpoints)
- `/api/boson/*` - Identity, username, connectivity (12 endpoints)
- `/api/update/*` - Version, install, progress (5 endpoints)
- `/stat`, `/readdir`, `/read`, `/write`, `/mkdir`, `/delete`, `/move`, `/copy` - Filesystem (15+ endpoints)
- `/api/backups/*` - Backup/restore (5 endpoints)
- `/api/terminal/*` - Terminal management (5 endpoints)
- `/api/access/*` - Access control (3 endpoints)
- `/ipfs/:cid`, `/public/:wallet/*` - IPFS gateway (4 endpoints)
- Plus 40+ more endpoints for apps, search, settings, etc.

---

**🔧 COMPLETE UI COMPONENTS (8 Settings Tabs, 50+ Components):**

**Settings Tabs:**
- ✅ `UITabAccount.js` - Profile, wallet addresses, DID tethering, node identity
- ✅ `UITabSecurity.js` - Access control, login history, API keys
- ✅ `UITabAI.js` - AI providers, API keys, agents list, channels summary
- ✅ `UITabPersonalization.js` - Background, dark mode, clock, font size
- ✅ `UITabPC2.js` - System resources, compute limits, storage, backups
- ✅ `UITabStorage.js` - IPFS stats, storage breakdown, largest files
- ✅ `UITabLanguage.js` - Language selection
- ✅ `UITabAbout.js` - Version, update banner, node info

**Agent UI:**
- ✅ `UIAgentEditor.js` - Full agent configuration (name, model, personality, memory, permissions)
- ✅ `UIAgentSelector.js` - Agent selection in AI chat
- ✅ `UIAgentChannels.js` - Channel assignment modal
- ✅ `UIChannelManager.js` - Saved channel credentials
- ✅ `UITelegramConnect.js` - Telegram bot connection
- ✅ `UIWhatsAppConnect.js` - WhatsApp connection (WIP)

**AI Chat:**
- ✅ `UIAIChat.js` - Full chat interface with agent selector, conversation history

---

**🔒 SECURITY HARDENING COMPLETE:**

- ✅ Path traversal protection for `agentId` in all endpoints
- ✅ `sanitizeAgentId()` function in `gateway.ts`
- ✅ `sanitizePathComponent()` in `AgentMemoryManager.ts` and `VectorMemoryStore.ts`
- ✅ Wallet-scoped isolation for all operations
- ✅ Permission-based tool filtering
- ✅ Rate limiting on API endpoints

---

**📄 DOCUMENTATION CREATED:**

- ✅ `docs/WORLD_COMPUTER_ROADMAP.md` - 1,057 lines, executive update
- ✅ `docs/design/CLAWDBOT_UI_UX_PLAN.md` - 948 lines, complete UI spec
- ✅ `docs/RELEASE_PROCESS.md` - 178 lines, release workflow
- ✅ `CHANGELOG.md` - Updated with all features

---

**🧹 CODEBASE CLEANUP:**

- ✅ Removed `Essentialsresearch/` folder (moved to separate repo)
- ✅ Removed unused `UITabAccessControl.js`, `UITabUsage.js`
- ✅ Removed duplicate API routes in `gateway.ts`

---

**📊 MERGE STATS (feature/clawdbot-integration → main):**

- **+11,908 lines** added
- **-771 lines** removed
- **59 files** changed
- **Branch:** Merged to `main` on 2026-01-27

---

**Clawdbot Audit Findings (2026-01-27):**

| What PC2 Has That Clawdbot Has | Status |
|-------------------------------|--------|
| Multi-Agent Routing | ✅ Implemented |
| SOUL.md Personalities | ✅ Implemented |
| Telegram Integration | ✅ Implemented |
| Permission System | ✅ Implemented |
| Config Persistence | ✅ Implemented |
| **Per-Agent Memory** | ✅ Implemented (PC2 EXTRA) |
| **Multi-Provider AI** | ✅ Implemented (PC2 EXTRA - 5 providers) |
| **Agent Identity Images** | ✅ Implemented (PC2 EXTRA) |

| What Clawdbot Has That PC2 Doesn't (Yet) | Priority |
|------------------------------------------|----------|
| Discord Integration | Medium |
| X/Twitter Integration | High (future) |
| Cron Jobs / Scheduled Tasks | Low |

---

### 🎯 Recent Progress (2026-01-25)

**DAO Dashboard & App Center UX Improvements - Complete**

**Window Management:**
- ✅ Fixed `maximize_on_start` for `dao-dashboard` and `app-center` apps
- ✅ Apps now open maximized automatically (no manual maximize needed)
- ✅ Prioritized local backend (`window.get_apps`) over cloud SDK for PC2-specific properties
- ✅ Added hardcoded fallback list `PC2_MAXIMIZE_APPS` for reliability

**DAO Dashboard Enhancements:**
- ✅ Fixed time remaining calculation - now shows minutes (e.g., "0d 1h 36m")
- ✅ Fixed time display on both list view and detail view (uses `voteEndIn` in seconds)
- ✅ Removed percentage display from vote bars (cleaner UI)
- ✅ Reduced council row height/padding (better spacing)
- ✅ Fixed suggestions loading - now loads all 354+ suggestions on first open
- ✅ Hidden sidebar on Suggestions/Council tabs (filters only apply to Proposals)
- ✅ Changed default tab to Suggestions (was Proposals)

**App Center Fixes:**
- ✅ Removed auto-scroll on first open - app now starts at top of page
- ✅ Better UX - users see content from the beginning

**Files Modified:**
- `src/gui/src/helpers/launch_app.js` - Prioritize local backend, maximize logic
- `pc2-node/src/api/apps.ts` - Added `maximize_on_start: true` for both apps
- `src/backend/apps/dao-dashboard/js/services/dao-api.js` - Fixed time calculation
- `src/backend/apps/dao-dashboard/js/components/detail-view.js` - Added minutes to time display
- `src/backend/apps/dao-dashboard/js/app.js` - Load suggestions first, hide sidebar logic
- `src/backend/apps/dao-dashboard/css/styles.css` - Reduced council row padding
- `src/backend/apps/app-center/index.html` - Removed auto-scroll

**Elastos Ecosystem Integration - Phase 1 Complete**

Branch: `feature/elastos-ecosystem-integration`

**Multi-Chain Wallet Support - Complete Elastos Ecosystem:**

| Chain | Chain ID | Native Token | Status |
|-------|----------|--------------|--------|
| Elastos Smart Chain (ESC) | 20 | ELA | ✅ Already supported |
| Elastos Identity Chain (EID) | 22 | ELA | ✅ Added |
| Elastos PGP ECO Chain | 12343 | ELA | ✅ Added |
| PGP Chain | 860621 | PGA | ✅ Added |
| Ethereum, Base, Arbitrum, etc. | Various | ETH | ✅ Already supported |

All Elastos EVM-compatible chains now available in ConnectKit network dropdown.

**UI/UX Polish:**
| Change | Description |
|--------|-------------|
| Tooltips | Added working tooltips for Admin Wallet (EOA) and Smart Account using custom popup implementation |
| DID Modal Z-index | Fixed DID tether modal appearing behind wallet sidebar by using custom body-appended modal with z-index 999999 |
| Smart Account Tooltip | Updated to mention "owned by your EOA account" |
| Startup Docs | Added comprehensive build/startup sequence to Quick Start section |

**DID Tethering (Single-Step Flow):**
- Simplified to single-step DID verification (Step 1 only)
- Multi-chain wallet address collection (Step 2) preserved in code for future activation
- Waiting on upstream Essentials fixes before enabling Step 2

**Upstream Contributions to Elastos Essentials:**

| Type | Status | Link |
|------|--------|------|
| Feature PR | ✅ Submitted | [PR #1: Add BTC/Tron address support](https://github.com/CyberRepublic/Elastos.Essentials.App/pull/1) |
| Bug Report | ✅ Included in PR | `elaaddress` crash via `walletaccess` intent |

**PR Details:**
- Adds `btcaddress` and `tronaddress` cases to `walletaccess` intent
- Uses existing `StandardCoinName.BTC` and `StandardCoinName.TRON` enums
- 12 lines of additive code, no breaking changes
- Includes bug report for `elaaddress` crash (issues disabled on repo)

**Files Modified:**
- `packages/particle-auth/src/particle/contexts/connectkit.tsx` - Added Elastos ecosystem chains (EID, ECO, PGP)
- `src/gui/src/UI/Settings/UITabAccount.js` - Tooltips, DID modal rewrite
- `pc2-node/frontend/gui.js` - PC2 self-hosted mode fixes
- `docs/core/STRATEGIC_IMPLEMENTATION_PLAN.md` - Startup docs

**Pending (Blocked on Upstream):**
- Step 2 wallet address collection (requires Essentials `elaaddress` fix)
- Multi-chain balance display from Essentials (requires PR merge)

---

### 🎯 Recent Progress (2026-01-23)

**Active Proxy URL Resolution Fix - ✅ COMPLETE**

Fixed critical issue where apps failed to load when accessed via custom domain (test7.ela.city) through the Active Proxy, while direct IP access worked.

**Problem:** When requests route through the Active Proxy (supernode), the `Host` header contains the internal `IP:port` (e.g., `38.242.211.112:4200`) instead of the public domain. This caused incorrect API origins and app URLs.

**Solution:** Created shared `getBaseUrl()` utility with Boson service fallback:

| File | Change |
|------|--------|
| `pc2-node/src/utils/urlUtils.ts` | NEW: Shared utility that detects IP:port pattern and falls back to `bosonService.getPublicUrl()` |
| `pc2-node/src/static.ts` | Uses shared `getBaseUrl(req, bosonService)` for API origin injection |
| `pc2-node/src/api/apps.ts` | Uses shared `getBaseUrl(req, bosonService)` for app index_url |
| `pc2-node/src/api/other.ts` | Updated 5 places to use shared utility |
| `pc2-node/src/api/info.ts` | Updated to use shared utility |

**WebSocket Protocol Fix:**
- Fixed `wss://` to `ws://` downgrade bug in WebSocket interceptor
- Changed regex from `replace(/^https?/, 'ws')` to `replace(/^https/, 'wss').replace(/^http/, 'ws')`
- Files: `pc2-node/frontend/index.html`, `pc2-node/scripts/build-frontend.js`

**Documentation Reorganization:**
- Created `docs/core/` folder for essential documentation
- Created `docs/core/plans/` folder for roadmaps and plans
- Added comprehensive `docs/README.md` index
- Moved strategic docs to `docs/core/`

---

**PC2 Documentation Portal - ✅ COMPLETE**

Published comprehensive PC2 documentation to the ElacityLabsWeb portal (https://github.com/Elacity/ElacityLabsWeb).

**Documentation Created (27 MDX pages):**

| Section | Pages | Content |
|---------|-------|---------|
| Core | 4 | Overview, Why PC2, Features, Architecture |
| Getting Started | 5 | Quick Start, VPS, Docker, Source, Raspberry Pi |
| User Guides | 6 | First Login, Files, AI Chat, Backup, Updates, Access Control |
| Infrastructure | 4 | Network Overview, Boson, NAT Traversal, Super Node Guide |
| Reference | 3 | API, Configuration, Troubleshooting |

**Key Features of Documentation:**
- Nextra components (Callout, Steps, Tabs) for better UX
- ASCII architecture diagrams
- Cross-linked navigation between all pages
- Code examples with syntax highlighting
- Complete API reference

**Commit:** `44005f64a` - "Add comprehensive Personal Cloud Computer documentation"

---

### 🎯 Recent Progress (2026-01-21)

**PC2 Sovereign Node Infrastructure - Phases 1, 2 & 4 ✅ COMPLETE**

Deployed complete PC2 super node infrastructure on the Elacity InterServer VPS (69.164.241.210) with working subdomain routing.

**Secondary Node Deployed (2026-01-22):**
- Contabo VPS (38.242.211.112) configured as secondary super node
- Node.js 20.20.0 + Docker installed
- PC2 node running as systemd service
- Enables failover testing between two data centers

**📚 Full Documentation**: See [`docs/pc2-infrastructure/`](pc2-infrastructure/README.md)

**Completed Components:**

| Phase | Component | Status |
|-------|-----------|--------|
| 1 | Boson DHT Super Node | ✅ Running on port 39001/UDP |
| 2 | Active Proxy Service | ✅ Running on port 8090/TCP |
| 4 | Web Gateway | ✅ Running on ports 80/443 with SSL |
| DNS | Wildcard Configuration | ✅ *.ela.city → 69.164.241.210 |
| SSL | Let's Encrypt Certificates | ✅ Valid for demo/test/sash.ela.city |
| Docs | Infrastructure Documentation | ✅ Complete in docs/pc2-infrastructure/ |

**Live Demo URLs:**
- https://demo.ela.city - Demo PC2 node (shows HTML page)
- https://test.ela.city - Test PC2 node
- https://sash.ela.city - Registered user node

**Key Accomplishments:**

1. **Boson DHT Node Deployment**
   - Built from `bosonnetwork/Boson.Core` release-v2.0.7
   - Node ID: `J1h7RHv5iHhT43zsXxMCg7zGmZq6g4Ec2VJeCkSGry2E`
   - Connected to existing Boson bootstrap network
   - Runs as systemd service `pc2-boson`

2. **Active Proxy Port (1,894 lines of Java ported)**
   - Ported from `elastos/Elastos.Carrier.Java` to Boson.Core
   - Updated package names from `elastos.carrier.*` to `io.bosonnetwork.*`
   - Enables NAT traversal for PC2 nodes behind firewalls
   - Port mapping range: 25000-30000/TCP

3. **DNS Wildcard Configuration**
   - GoDaddy A record: `*` → `69.164.241.210`
   - Root domain preserved: `ela.city` → `35.205.174.216` (existing website)
   - All subdomains route to super node for PC2 users

4. **Web Gateway (Node.js)**
   - Routes *.ela.city subdomains to registered PC2 nodes
   - HTTPS with Let's Encrypt certificates
   - REST API for username registration
   - WebSocket proxy support
   - Persistent registry (survives restarts)

5. **Comprehensive Documentation**
   - `docs/pc2-infrastructure/README.md` - Overview
   - `docs/pc2-infrastructure/ARCHITECTURE.md` - Technical architecture
   - `docs/pc2-infrastructure/WEB_GATEWAY.md` - Gateway API reference
   - `docs/pc2-infrastructure/SUPERNODE_OPERATOR_GUIDE.md` - Operator guide
   - `docs/pc2-infrastructure/DEPLOYMENT_LOG.md` - Deployment history

**Infrastructure Status:**

```
Super Node: 69.164.241.210
├── Boson DHT: 39001/UDP ✅
├── Active Proxy: 8090/TCP ✅
├── Web Gateway: 80/443 ✅ (Let's Encrypt SSL)
├── Test PC2 Node: 4200 ✅
├── Port Mapping: 25000-30000/TCP ✅
└── Elastos Nodes: Unaffected ✅
```

**Phase 3: PC2 Client Integration ✅ COMPLETE**

Implemented Boson services in the PC2 node software:

| Component | Status | Description |
|-----------|--------|-------------|
| IdentityService | ✅ | Ed25519 keypair, DID generation, mnemonic backup |
| UsernameService | ✅ | Username registration with Web Gateway |
| ConnectivityService | ✅ | Super node connection, heartbeat, auto-reconnect |
| BosonService | ✅ | Main orchestration service |
| API Routes | ✅ | `/api/boson/*` endpoints |

**Files Created:**
- `pc2-node/src/services/boson/IdentityService.ts`
- `pc2-node/src/services/boson/UsernameService.ts`
- `pc2-node/src/services/boson/ConnectivityService.ts`
- `pc2-node/src/services/boson/BosonService.ts`
- `pc2-node/src/services/boson/index.ts`
- `pc2-node/src/api/boson.ts`
- `docs/pc2-infrastructure/PC2_CLIENT_INTEGRATION.md`

**Remaining Phase:**
- Phase 5: End-to-end testing with real PC2 nodes

---

### 🎯 Recent Progress (2026-01-22)

**MVP v1.0.0 Progress - Sprints 1-4 ✅ COMPLETE**

Significant progress on the unified MVP plan. The first four sprints are complete, establishing the core infrastructure for packaging and distribution.

| Sprint | Focus | Status |
|--------|-------|--------|
| Sprint 1 | Infrastructure (docs, IP detection, SSL) | ✅ Complete |
| Sprint 2 | Docker packaging (Dockerfile, compose, install script) | ✅ Complete |
| Sprint 3 | First-run setup wizard (UI, API, redirect) | ✅ Complete |
| Sprint 4 | Update system (service, API, notifications) | ✅ Complete |
| Sprint 5 | NAT traversal via Active Proxy | ✅ Complete |
| Sprint 6 | Testing, CI/CD, DHT Registry, Failover | ✅ Complete |

**Key Deliverables:**

1. **Setup Wizard (Sprint 3)**
   - Multi-step wizard: Welcome → Username → Complete
   - Particle-style dark theme matching login UI
   - Copy recovery phrase button on completion screen
   - Username validation and real-time availability checking
   - Warning icon and messaging for mnemonic backup

2. **Settings Integration**
   - Node Identity section merged into Account tab
   - Node ID, DID, Public URL, Recovery Phrase in one card
   - Wallet-based encryption for recovery phrase
   - Manual mnemonic entry for late encryption

3. **Update System (Sprint 4) - Enhanced with Auto-Update (2026-01-22)**
   - UpdateService for periodic version checking (6-hour intervals)
   - GitHub releases API integration (`checkGitHubReleases()`)
   - **Auto-Update Feature (macOS-style)**:
     - `performUpdate()` - Executes git pull, npm install, npm build, restart
     - Progress tracking with real-time status updates
     - Automatic server restart via systemctl or process exit
   - API endpoints:
     - `GET /api/update/status` - Version info and update availability
     - `POST /api/update/check` - Trigger version check
     - `GET /api/update/version` - Get current version
     - `POST /api/update/install` - **NEW: Trigger auto-update**
     - `GET /api/update/progress` - **NEW: Get update progress**
     - `POST /api/update/check-github` - **NEW: Check GitHub releases**
   - Frontend components:
     - `UIUpdateModal.js` - Toast notification + modal with progress UI
     - Settings > About banner when update available
     - Auto-reconnect loop after server restart
     - Page auto-refresh when update complete

4. **API Endpoints Added**
   - `GET /api/setup/status` - Check setup state
   - `POST /api/setup/complete` - Complete setup with username
   - `GET /api/setup/mnemonic` - Get mnemonic for copying
   - `POST /api/boson/encrypt-mnemonic` - Encrypt user-provided mnemonic
   - `GET /api/boson/needs-securing` - Check mnemonic encryption status

**Sprint 5 Completed (NAT Traversal):**
- `ProxyProtocol.ts` - Binary packet encoder/decoder
- `ActiveProxyClient.ts` - TCP client for Active Proxy
- `ConnectivityService` - Updated for proxy:// endpoints
- Web Gateway deployed with Active Proxy relay support
- VPS: Port 8090 listening, gateway running

**Sprint 6 Completed (2026-01-22) - MVP v1.0.0 COMPLETE**

1. **End-to-End Testing** ✅
   - Setup wizard flow verified
   - Identity generation and storage tested
   - Connectivity service NAT detection confirmed
   - Active Proxy client protocol implementation

2. **GitHub Actions CI/CD** ✅
   - `.github/workflows/pc2-node-docker.yml` created
   - Multi-platform builds: linux/amd64, linux/arm64
   - Triggers on push to main and feature branches
   - Docker Hub publishing with proper tagging

3. **DHT-Based Username Registry** ✅
   - Created `boson-http-api` Java service
   - REST API endpoints: `/api/username/:name`, `/api/username` (register)
   - DHT find/store endpoints: `/api/dht/find/:id`, `/api/dht/store`
   - Integrates with Boson Node for decentralized storage

4. **Super Node Failover** ✅
   - Round-robin failover between super nodes
   - Failed node tracking with automatic retry after 5 minutes
   - `failover()` method for manual failover trigger
   - Support for multiple super nodes in configuration

**MVP v1.0.0 Status: ALL SPRINTS COMPLETE**

---

### 🎯 Recent Progress (2026-01-21)

**AI Chat UX Comprehensive Enhancement - ✅ COMPLETE**

Implemented a complete 10-phase UX overhaul of the AI Chat interface, bringing it to production-quality standards with multi-provider support, real-time feedback, and professional UI polish.

**Phases Completed:**

| Phase | Feature | Status |
|-------|---------|--------|
| 0 | SDK Migration (OpenAI, Gemini official SDKs) | ✅ Complete |
| 0b | xAI API key storage support | ✅ Complete |
| 1 | Multi-phase loading states (3x3 dot grid) | ✅ Complete |
| 1b | AbortController for request cancellation | ✅ Complete |
| 2 | Live thinking display (collapsible) | ✅ Complete |
| 2a | DeepSeek `<think>` tag parsing | ✅ Complete |
| 3 | Tool execution feedback cards | ✅ Complete |
| 4 | Real-time progress bar with step tracking | ✅ Complete |
| 5 | Enhanced error handling with actionable cards | ✅ Complete |
| 6 | Message status indicators | ✅ Complete (later removed for minimal design) |
| 7 | Code block syntax highlighting (highlight.js) | ✅ Complete |
| 8 | Backend stream protocol (status/reasoning/done) | ✅ Complete |
| 9 | Granular model selection + xAI provider | ✅ Complete |

**Key Features Delivered:**

1. **Multi-Provider SDK Support**
   - Official SDKs: `@anthropic-ai/sdk`, `openai`, `@google/genai`
   - New xAI (Grok) provider using OpenAI-compatible API
   - All providers support streaming and tool/function calling

2. **Model Selection Enhancement**
   - Granular model dropdown with all models per provider
   - Claude: Sonnet 4.5, Opus 4, 3.5 Sonnet, 3.5 Haiku
   - OpenAI: GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-4, GPT-3.5 Turbo
   - Gemini: 2.0 Flash, 1.5 Pro, 1.5 Flash, Pro
   - xAI: Grok 3, Grok 3 Fast, Grok 2, Grok Vision
   - "+ Add Model..." option opens Settings > AI Assistant

3. **Settings > AI Assistant Improvements**
   - Redesigned API Keys section with Add/Update/Delete buttons
   - Active provider badge indicator
   - Masked key display (e.g., `Key: sk-...abc123`)
   - xAI (Grok) provider added to all sections

4. **Loading & Feedback UX**
   - 3x3 pulsing dot grid animation (sequential wave)
   - Collapsible "Thinking..." section for AI reasoning
   - Real-time progress bar with step count (e.g., "Step 3 of 7")
   - Tool execution cards showing operation details

5. **UI Polish**
   - Removed blinking cursor during loading
   - Removed message status checkmarks (minimal design)
   - Fixed z-index issues for dialogs appearing above panels
   - SVG icons only (no emojis per professional standards)

**Files Modified (18 files, +3,314 / -457 lines):**
- `pc2-node/src/services/ai/providers/` - All provider files updated + new XAIProvider.ts
- `pc2-node/src/services/ai/AIChatService.ts` - Stream protocol, tool execution
- `pc2-node/src/api/other.ts` - Enhanced streaming with status/reasoning/done chunks
- `src/gui/src/UI/AI/UIAIChat.js` - Complete frontend UX overhaul
- `src/gui/src/UI/Settings/UITabAI.js` - API key management redesign
- `src/gui/src/css/style.css` - Loading animations, progress bar, error cards

**Key Lessons Learned:**

1. **SDK Streaming Differences** - Each AI provider has different streaming formats. Claude streams `content_block_delta`, OpenAI uses SSE, Gemini has native SDK streaming. Backend must normalize all formats to consistent NDJSON.

2. **Tool Execution Timing** - For real-time progress bars, backend must explicitly `yield` tool_use/tool_result chunks BEFORE and AFTER each tool execution, with small delays to prevent batching.

3. **Empty Message Errors** - Claude API rejects messages with empty content. When AI returns only tool calls (no text), must provide placeholder message like "Executing N tool(s)".

4. **Z-Index Layering** - AI chat panel uses z-index 99999999. Any dialogs opened from it (like Settings) need `stay_on_top: true` or higher z-index to appear above.

5. **Model Name Currency** - AI provider model names change frequently. Claude deprecated `claude-3-opus-20240229` in favor of `claude-opus-4-20250514`. Must keep model lists updated.

**Commit:** `fb18a6e1` on `feature/mvp-production-release`

---

### 🎯 Recent Progress (2026-01-21)

**File Move & SDK Loading Fix - ✅ COMPLETE**

**Problems Solved:**
1. **Move Operation 404 Errors** - Dragging files in desktop returned 404 instead of moving
2. **Multiple Server Instances** - Zombie tsx watch processes conflicting with active server
3. **UUID Path Resolution Bug** - Source paths starting with `~/uuid-...` not parsed correctly

**Root Cause Analysis:**

1. **SDK Loading Issue:**
   - `gui.js` in production mode (`gui_env === 'prod'`) loaded Puter SDK from CDN (`https://js.puter.com/v2/`)
   - Even with `setAPIOrigin()` call, the CDN SDK didn't fully respect the local API origin for filesystem operations
   - **Fix:** Changed to load local SDK (`/puter.js/v2`) instead of CDN

2. **UUID Path Parsing Bug:**
   - Frontend sends move source as `~/uuid--0x...wallet...--Desktop-filename.png`
   - Backend UUID resolution checked for `fromPath.startsWith('uuid-')` BEFORE expanding `~/`
   - Result: UUID check never matched because path started with `~/`, not `uuid-`
   - **Fix:** Strip `~/` prefix before UUID check

**Files Modified:**
- `pc2-node/frontend/gui.js` - Line 212: Load `/puter.js/v2` instead of `https://js.puter.com/v2/`
- `pc2-node/src/api/filesystem.ts` - Strip `~/` prefix before UUID path resolution
- `pc2-node/src/api/index.ts` - Added POST request debug logging

**Key Learnings:**
1. **Local SDK Required** - The Puter SDK from CDN has hardcoded behaviors that may ignore `setAPIOrigin()` for some operations. Always use the local SDK copy for self-hosted deployments.
2. **Path Prefix Order** - When processing paths with multiple formats (UUID, `~/`, `/absolute`), ensure prefix stripping happens BEFORE format detection.
3. **Zombie Processes** - Multiple `tsx watch` instances can accumulate over development sessions. Use `pkill -f "tsx.*pc2-node"` to clean up before starting fresh.
4. **Server Log Isolation** - When debugging 404s, first verify with `curl` whether the server works, then add logging middleware to catch incoming requests.

**Prevention:**
- Added production startup check: Kill existing tsx processes before starting
- Consider adding server singleton lock file to prevent multiple instances

---

### 🎯 Recent Progress (2026-01-20)

**dApp Centre UI Overhaul - ✅ COMPLETE**

**What Was Done:**
1. ✅ **Renamed to dApp Centre** - "App Center" → "dApp Centre" across all API files and UI
2. ✅ **Umbrel-Inspired Design** - Staff Picks with large feature cards, edge-to-edge carousels, hidden scrollbars
3. ✅ **20+ Mock Apps** - Elastos ecosystem apps (DID, DAO, RPC, Wallets), DeFi (Uniswap, Aave, Glide), Bitcoin (BTCD, BTC Wallet)
4. ✅ **Category Filtering** - Unique views per category, clicking category hides carousels and shows filtered grid
5. ✅ **Pricing Display** - Free apps vs paid apps with dollar pricing
6. ✅ **Professional Icons** - SVG icons replacing emoji, version + badges inline

**Files Modified:**
- `src/backend/apps/app-center/index.html` - Complete UI rewrite
- `pc2-node/src/api/apps.ts`, `info.ts`, `other.ts` - Title renamed to "dApp Centre"
- `pc2-node/src/api/apps.js`, `info.js`, `other.js` - JavaScript versions updated

**Purpose:** Validate dApp Store UX and inspire the vision before building dDRM/blockchain backend.

---

### 🎯 Previous Progress (2026-01-19)

**Puter SDK Initialization Fix - ✅ COMPLETE**

**Problem Solved:** Excessive console logging (10-20+ duplicate initializations) and duplicate desktop items caused by Puter SDK creating hidden iframes that load copies of the main page.

**Solution Implemented:**
1. ✅ **Iframe Detection Guard** - `window !== window.top` check skips initialization in iframe contexts
2. ✅ **Particle-Auth Page Guard** - Skips initialization on `/particle-auth` route
3. ✅ **DOM-based Guard** - Hidden `<div>` element serves as persistent guard across JS contexts
4. ✅ **Module-level Throw** - `gui.js` throws error to halt duplicate script execution

**Files Modified:**
- `src/gui/src/index.js` - Added throw for duplicate gui.js execution
- `src/gui/src/initgui.js` - Iframe detection + DOM guard + conditional debug logging
- `src/gui/src/services/WalletService.js` - Global iframe creation flag, lazy iframe creation

**Key Discovery:** The Puter SDK (`v2/`) creates hidden iframes that load the full application. Each iframe has isolated JavaScript contexts where standard singleton patterns and window properties don't persist. This is an architectural limitation that requires investigation of the SDK's iframe behavior.

**See:** "Technical Debt & Foundation Work" section for full analysis and recommended proper fixes.

---

**Settings Window UX Improvements - ✅ COMPLETE**

**Major Features Delivered:**
1. ✅ **About Tab Rebrand** - ElastOS Personal Cloud branding with SVG logo, updated description ("One of millions of self-hosted personal clouds... interconnected above blockchain governance to form the World Computer")
2. ✅ **Account Tab Enhancements** - Display name setting (per-wallet, persists across refreshes), public IPFS profile pictures (copied to `/Public` folder for sharing)
3. ✅ **Security Tab** - Re-enabled with login history display, wallet security info, session management
4. ✅ **Personalization Tab** - Dark mode toggle, font size selector, notification preferences (sound/desktop)
5. ✅ **Storage Tab Performance** - Parallel API loading with timeout protection, prevents hanging
6. ✅ **PC2 Tab UI Consistency** - Container widths aligned across all sections
7. ✅ **WebSocket Optimization** - Socket connection consolidation (reuses SDK socket), event deduplication to prevent duplicate processing
8. ✅ **Console Logging Cleanup** - Debug logs behind `DEBUG_SOCKET_EVENTS` flag, reduced noise in production

**Backend Additions:**
- `POST /copy` endpoint for file copying (was missing, caused profile picture public copy to fail)
- `POST /api/user/profile` for display name persistence
- `GET /api/user/login-history` for session history
- `/whoami` now returns `display_name` field

**Files Modified:**
- `src/gui/src/UI/Settings/UITabAbout.js` - ElastOS branding, scrollable content fix
- `src/gui/src/UI/Settings/UITabAccount.js` - Display name, public IPFS profile pictures
- `src/gui/src/UI/Settings/UITabSecurity.js` - Login history, wallet security
- `src/gui/src/UI/Settings/UITabPersonalization.js` - Dark mode, font size, notifications
- `src/gui/src/UI/Settings/UITabStorage.js` - Parallel loading, timeout protection
- `src/gui/src/UI/Settings/UITabPC2.js` - Container width consistency
- `src/gui/src/UI/UIDesktop.js` - Socket consolidation, event deduplication, debug logging
- `pc2-node/src/api/filesystem.js` - Added `handleCopy` endpoint
- `pc2-node/src/api/index.js` - Registered new endpoints
- `pc2-node/src/api/whoami.js` - Display name in response

**Key Learnings:**
1. **Missing Backend Endpoints** - `puter.fs.copy()` SDK calls require a `/copy` endpoint that wasn't implemented
2. **Socket.io Duplicate Connections** - GUI creates its own socket while SDK has another; consolidated to single connection
3. **Event Deduplication** - When multiple sockets exist, same events fire twice; implemented TTL-based dedup cache
4. **Verbose Logging Impact** - 100+ console.logs per file causes noise; use conditional debug flags

---

**App Icons & UI Bug Fixes - ✅ COMPLETE (2026-01-20)**

**Problems Solved:**
1. **Cube Icons in Recent Section** - App icons displayed as blue cubes instead of actual app icons
2. **Double Dialog on Upload** - Clicking "Upload" in file picker opened two dialogs
3. **WASM Apps Black Screen** - Calculator and File Analyzer showed blank screens
4. **WASM Apps Close Button** - X button on WASM app windows did nothing

**Root Cause Analysis:**

The cube icon issue was traced through multiple layers:
1. **Initial suspicion:** Missing icons in `/apps/:name` endpoint - Fixed, but issue persisted
2. **Second layer:** Missing icons in `/open_item` and `/suggest_apps` - Fixed, but issue persisted  
3. **Root cause discovered:** The Puter SDK's `puter.apps.get()` calls `/drivers/call` endpoint (not `/apps/:name`), and this endpoint had `icon: undefined` for all apps except editor

**Key Discovery:** The Puter SDK uses a **drivers abstraction layer** for app lookups. When launching apps:
```
Frontend: puter.apps.get('camera') 
  → SDK: POST /drivers/call {interface: 'puter-apps', method: 'read', args: {id: {name: 'camera'}}}
  → Backend: handleDriversCall() returns app info
  → app_info stored in window.launch_apps.recent (with or without icon)
```

This means app icons must be defined in **THREE places** for full coverage:
1. `/apps/:name` - Direct app info endpoint
2. `/get-launch-apps` - Start menu recommended/recent apps
3. `/drivers/call` - Puter SDK app lookups (the missing piece!)

**Solution Implemented:**
1. ✅ **Drivers Endpoint Icons** - Added `hardcodedIcons` to `/drivers/call` handler's `appMap`
2. ✅ **Server-Side Recent Apps** - New `recent_apps` database table for persistence across sessions
3. ✅ **Double Dialog Fix** - Added `init_upload_for_open_dialog()` to handle uploads within file picker context
4. ✅ **WASM Build Fix** - Updated `build-frontend.js` to copy app directories correctly
5. ✅ **WASM IPC Fix** - Added `windowWillClose` handler to WASM app HTML files

**Files Modified:**
- `pc2-node/src/api/other.ts` - Added icons to all three `appMap` definitions in drivers handler
- `pc2-node/src/api/info.ts` - Server-side recent apps with auth-aware retrieval
- `pc2-node/src/api/apps.ts` - Consistent icon handling
- `pc2-node/src/storage/database.ts` - `recordRecentApp()`, `getRecentApps()` methods
- `pc2-node/src/storage/migrations.ts` - Migration 8 for `recent_apps` table
- `pc2-node/src/storage/schema.sql` - `recent_apps` table definition
- `pc2-node/scripts/build-frontend.js` - Fixed app directory copying
- `pc2-node/wasm-apps/*/index.html` - Added `windowWillClose` IPC handlers
- `src/gui/src/UI/UIWindow.js` - Upload button handling for open dialogs
- `src/gui/src/helpers.js` - `init_upload_for_open_dialog()`, `upload_items_for_open_dialog()`

**Key Learnings:**
1. **Puter SDK Drivers Layer** - The SDK doesn't call REST endpoints directly; it uses a `/drivers/call` abstraction. Any endpoint that apps use via SDK must have data in the drivers handler.
2. **Multiple Icon Sources** - Icons must be consistent across all endpoints that return app info (direct, launcher, and drivers)
3. **IPC for Window Lifecycle** - WASM apps in iframes need explicit IPC handlers for window operations (close, minimize, etc.)
4. **Build Artifacts vs Source** - `frontend/apps/*` are build outputs; source lives in `wasm-apps/` and `src/backend/apps/`

**Architecture Insight for Future:**
Consider centralizing app metadata in a single source of truth (e.g., `appRegistry.ts`) that all endpoints consume, rather than duplicating `appMap` definitions across handlers.

---

**Phase 2.6: WASM/WASMER Runtime Integration - ✅ COMPLETE**

**Major Features Delivered:**
1. ✅ **WASMRuntime Service** - Implemented using `@wasmer/wasi` for executing WASM binaries on PC2 node
2. ✅ **WASM API Endpoints** - `/api/wasm/execute-file`, `/api/wasm/execute`, `/api/wasm/list-functions`
3. ✅ **Calculator App (WASM)** - Full-featured calculator with complete UI, runs WASM binary on backend
4. ✅ **File Analyzer App (WASM)** - File analysis tool with drag-and-drop support
5. ✅ **App Registration System** - WASM apps visible in app launcher, proper SDK injection
6. ✅ **Dual Mode Support** - Handles both WASI and non-WASI WASM modules with automatic detection
7. ✅ **Self-Hosted Computation** - All WASM execution happens on user's PC2 node (not in browser)

**Files Created/Modified:**
- `pc2-node/src/services/wasm/WASMRuntime.ts` - Core WASM runtime service
- `pc2-node/src/api/wasm.ts` - WASM API endpoints
- `pc2-node/wasm-apps/calculator/index.html` - Calculator UI source
- `pc2-node/wasm-apps/file-processor/index.html` - File Analyzer UI source
- `pc2-node/src/api/apps.ts` - App metadata endpoint
- `pc2-node/src/api/info.ts` - App launcher registration

**Status:** ✅ COMPLETE
- ✅ Calculator app fully functional
- ✅ File Analyzer app fully functional
- ✅ WASM apps integrated into app launcher with proper icons

**Future Enhancements (Phase 6.5):**
- Full WASMER runtime with dDRM support
- Additional WASM demo apps
- WASM app development documentation

**Phase 2.5: Backup & Restore Enhancements - ✅ COMPLETE**

**Major Features Delivered:**
1. ✅ **One-Click Web UI Restore** - Users can upload backup files and restore through browser (no SSH required)
2. ✅ **Backup Status Indicators** - Visual health status showing last backup date with color-coded indicators
3. ✅ **Comprehensive Help System** - In-app help dialog with step-by-step instructions, multi-account clarification, server restart guide
4. ✅ **UI Polish** - Off-server storage warnings, improved feedback messages, progress indicators
5. ✅ **Technical Fixes** - Fixed `isPC2Mode` scope issue, added SDK proxying for terminal apps

**Files Modified:**
- `pc2-node/test-fresh-install/src/api/backup.ts` - Restore endpoint with file upload
- `pc2-node/test-fresh-install/src/api/index.ts` - Registered restore endpoint
- `src/gui/src/UI/Settings/UITabPC2.js` - Restore UI, help dialog, status indicators
- `pc2-node/test-fresh-install/src/static.ts` - SDK proxying for terminal
- `docs/BACKUP_RESTORE_AUDIT.md` - Comprehensive audit document

**Status:** Phase 2.5 complete, Phase 3 at 40% (automated scheduling and verification tools remaining)

**✅ Terminal Issue RESOLVED (2026-01-19):** The old Puter Terminal/Phoenix shell was replaced with a new **System Terminal** (Phase 7.4) that provides real PTY-based shell access. See Phase 7.4 section for details.

---

**Phase 2.6: PC2 Network Map - ✅ COMPLETE (2026-01-25)**

**Live URL:** https://map.ela.city

**Overview:**
Public-facing visualization of the PC2 decentralized network, showing all registered nodes, supernodes, and real-time network statistics.

**Major Features Delivered:**
1. ✅ **Force-Directed Graph Visualization** - Interactive node display with drag, zoom, pan
2. ✅ **Real-Time Updates** - WebSocket-based live status updates
3. ✅ **Privacy-First Design** - Anonymized node identifiers, no URLs/IPs exposed
4. ✅ **Supernode Highlighting** - Gold-colored larger dots for infrastructure nodes
5. ✅ **Activity Patterns** - Nodes classified as always-on, intermittent, occasional, inactive
6. ✅ **Node List Table** - Detailed list with Status, Node ID, Type, Activity columns
7. ✅ **Mobile Responsive** - Optimized for all screen sizes
8. ✅ **Web Gateway Integration** - Routed via existing ela.city infrastructure
9. ✅ **Comprehensive Backup/Restore** - All critical node files included in backups

**Technical Stack:**
- Backend: Express.js, SQLite, WebSocket
- Frontend: React 18, Vite, react-force-graph-2d
- Deployment: systemd service on InterServer
- Routing: Integrated with pc2-gateway for map.ela.city

**Files Created:**
- `deploy/network-map/` - Complete service codebase
- `docs/pc2-infrastructure/NETWORK_MAP.md` - Full documentation

**Privacy Protection:**
- Node identifiers are SHA-256 hashed (non-reversible)
- No usernames, URLs, or IPs ever exposed
- Prevents DDoS targeting and user doxing

**Status:** Complete and deployed at https://map.ela.city

---

**Phase 2.7: Multi-Domain & Supernode Expansion - 🔜 PLANNED**

**Goal:** Expand PC2 network across all Elastos domains and multiple geographic supernodes.

**Part A: Multi-Domain Network Map**
| Domain | Map URL | Status |
|--------|---------|--------|
| ela.city | map.ela.city | ✅ Live |
| pc2.net | map.pc2.net | 🔜 Planned |
| ela.net | map.ela.net | 🔜 Planned |

**Part B: Multi-Domain Subdomain Routing**
Enable PC2 nodes to be accessible via all three domain variants:
```
sash.ela.city  ─┐
sash.pc2.net   ─┼─► Same PC2 Node
sash.ela.net   ─┘
```

**Requirements:**
1. DNS: Wildcard A records for `*.pc2.net` and `*.ela.net` → supernode IP
2. SSL: Wildcard certificates for both domains (acme.sh + DNS-01)
3. Web Gateway: Accept requests from all three domains, normalize lookups
4. Registry: Optional per-user domain preferences

**Part C: Multi-Supernode Network**
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Supernode US   │◄───▶│  Supernode EU   │◄───▶│  Supernode Asia │
│  (InterServer)  │     │   (Contabo)     │     │     (TBD)       │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
    PC2 Nodes              PC2 Nodes               PC2 Nodes
```

**Benefits:**
- Geographic redundancy and lower latency
- DHT replication across supernodes
- Automatic failover for node routing
- Network map shows all supernodes with inter-connections

**Implementation Order:**
1. [ ] DNS setup for pc2.net and ela.net wildcards
2. [ ] SSL certificates for new domains
3. [ ] Web Gateway multi-domain support
4. [ ] Deploy second supernode (EU - Contabo)
5. [ ] DHT synchronization between supernodes
6. [ ] Network Map multi-supernode visualization
7. [ ] Failover testing and documentation

**Documentation:** See `docs/pc2-infrastructure/NETWORK_MAP.md` for detailed technical plans.

---

### ✅ What We've Achieved (Current Branch: `sash-work`)

#### 1. **Desktop UI Working**
- ✅ Desktop displays files and folders
- ✅ File operations (upload, download, create, delete)
- ✅ Real-time updates (via WebSocket/Socket.io)
- ✅ App launching (Terminal, Editor, Viewer, Player, PDF, Recorder, Solitaire)
- ✅ Desktop UI fully functional - toolbar, taskbar, bin icon all visible
- ✅ Desktop initialization working - `/stat` and `/readdir` endpoints properly handle user paths

#### 2. **Authentication System**
- ✅ Particle Auth integration
- ✅ Wallet-based authentication
- ✅ Session management (7-day sessions)
- ✅ Auto-reconnect on page refresh
- ✅ Auto-authentication for local dev

#### 3. **Mock PC2 Server**
- ✅ Full Puter API compatibility
- ✅ In-memory filesystem
- ✅ Per-wallet isolation
- ✅ Socket.io simulation (polling)
- ✅ App serving (viewer, player, pdf, editor, terminal)
- ✅ All required endpoints implemented

#### 4. **Frontend-Backend Integration**
- ✅ API redirection to PC2 node
- ✅ CORS handling
- ✅ Error handling
- ✅ Connection status UI

#### 5. **User Personalization Features** ✅ **COMPLETE (2025-01-20)**
- ✅ Desktop background customization with persistence
  - Custom image selection from PC2 filesystem
  - Default wallpaper option
  - Background fit options (cover, contain, center, repeat)
  - Color background option
  - Settings persist across page refreshes
  - Signed URL generation for secure file access
- ✅ Profile picture management
  - Custom profile picture selection from PC2 filesystem
  - Display in Settings → Account tab
  - Display in taskbar/profile icon
  - Settings persist across page refreshes
  - Signed URL generation for secure file access
- ✅ Backend persistence via KV store
  - User preferences stored per wallet address
  - Desktop background URL, color, and fit settings
  - Profile picture URL settings
  - Retrieved via `/whoami` endpoint on page load

#### 6. **Documentation**
- ✅ Architecture analysis
- ✅ CTO feedback documentation
- ✅ Software package vision
- ✅ Testing guides

### ⚠️ Current Architecture Limitations

#### 1. **Separate Services** ✅ **RESOLVED**
- ✅ Frontend served by mock server at `127.0.0.1:4200`
- ✅ Backend runs on `127.0.0.1:4200` (same server)
- ✅ Single process to run
- ✅ No CORS complexity (same-origin)

#### 2. **Connection Setup Required** ✅ **RESOLVED**
- ✅ Auto-detected same-origin API
- ✅ No manual configuration needed
- ✅ "Connected by default" - accessing PC2 IS accessing Puter

#### 3. **Not Self-Contained** ⚠️ **PARTIALLY RESOLVED**
- ✅ Frontend served by PC2 node (mock server)
- ⚠️ Still using mock server (not production node)
- ⚠️ No single executable/package yet
- ⚠️ Requires build process (but frontend is built-in)

#### 4. **Development-Only** ⚠️ **STILL APPLIES**
- ⚠️ Mock server (in-memory, no persistence)
- ⚠️ No production deployment
- ⚠️ No installable package
- **Next:** Phase 2 will address this

---

## 🚀 Target Architecture

### End Goal: PC2 Software Package

```
┌─────────────────────────────────────────────────────────────┐
│              PC2 SOFTWARE PACKAGE                           │
│  (Single executable/package)                                 │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ElastOS Frontend (Built-in)                          │  │
│  │  - Static files (HTML, JS, CSS)                       │  │
│  │  - Served at root (/)                                  │  │
│  │  - Auto-detects same-origin API                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  PC2 Backend                                           │  │
│  │  - API endpoints (/api/*)                              │  │
│  │  - IPFS storage                                        │  │
│  │  - File system                                         │  │
│  │  - Authentication                                      │  │
│  │  - Socket.io (WebSocket)                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ✅ Single process                                          │
│  ✅ Single port (4200)                                      │
│  ✅ No CORS                                                 │
│  ✅ Self-contained                                          │
└─────────────────────────────────────────────────────────────┘
         ▲
         │ Browser
         │
┌────────┴────────┐
│  User (Anywhere)│
│  https://my-pc2 │
│  .example.com   │
└─────────────────┘
```

---

## 📋 Strategic Implementation Plan

### Phase 1: Foundation (Week 1) ✅ **COMPLETE**
**Goal:** Make mock server serve frontend, prove concept works

#### 1.1 Build Frontend for Production ✅
- [x] **Task:** Build ElastOS frontend into static files
  - **File:** `src/gui/package.json`
  - **Action:** Verify build script exists (`npm run build`)
  - **Output:** `src/gui/dist/` directory with static files
  - **Status:** Frontend already built, dist/ directory exists with all static files
  - **Completed:** 2025-01-12

#### 1.2 Add Static File Serving to Mock Server ✅
- [x] **Task:** Serve frontend from mock server
  - **File:** `tools/mock-pc2-server.cjs`
  - **Action:** Add static file serving middleware
  - **Routes:**
    - `/` → `index.html` (dynamically generated with API interception)
    - `/bundle.min.js` → static JS
    - `/bundle.min.css` → static CSS
    - `/assets/*` → static assets
    - `/images/*` → static images (including flint-2.jpg)
  - **Status:** Fully implemented with SPA fallback and dynamic HTML generation
  - **Completed:** 2025-01-12

#### 1.3 Update Frontend API Origin Detection ✅
- [x] **Task:** Auto-detect API origin (same origin)
  - **File:** `src/gui/src/index.js`
  - **Action:** Auto-detect from `window.location.origin`, implement fetch/XHR interception
  - **Status:** Complete - frontend auto-detects same-origin API, intercepts all SDK calls
  - **Completed:** 2025-01-12

#### 1.4 Test End-to-End ✅
- [x] **Task:** Verify Puter UI loads from PC2 node
  - **Action:** Access `http://127.0.0.1:4200` → See ElastOS UI
  - **Verification:**
    - ✅ UI loads correctly
    - ✅ No CORS errors (same-origin)
    - ✅ Particle Auth authentication works
    - ✅ Smart Account (UniversalX) support working
    - ✅ File operations work (`/stat`, `/readdir`, `/read`)
    - ✅ Desktop UI displays correctly
    - ✅ User data (wallet/Smart Account) displays in taskbar and sidebar
    - ✅ Default background image (Flint 2.jpg) configured
    - ✅ Logout flow shows Particle login (not Puter session list)
  - **Status:** All verification criteria met
  - **Completed:** 2025-01-12

**Phase 1 Deliverable:** ✅ **COMPLETE** - Mock server serves frontend, proof of concept works

---

### Phase 2: Production PC2 Node (Week 2-3) ✅ **IN PROGRESS**
**Goal:** Create production-ready PC2 node with frontend built-in

#### 2.1 Create PC2 Node Package Structure ✅
- [x] **Task:** Design package structure
  - **Directory:**
    ```
    pc2-node/
    ├── src/
    │   ├── server.js          # Main HTTP server
    │   ├── static.js          # Static file serving
    │   ├── api/                # API endpoints
    │   ├── storage/            # IPFS integration
    │   ├── auth/               # Authentication
    │   └── ...
    ├── frontend/               # Built frontend (copied from gui/dist)
    ├── config/
    │   └── default.json
    ├── package.json
    └── README.md
    ```
  - **Time:** 2 hours

#### 2.2 Build Process Integration ✅
- [x] **Task:** Create build process
- [x] **CRITICAL RULE: Frontend Bundle Copying (2025-12-19)**
  - **Problem:** Frontend bundle built in `src/gui/dist/` but server serves from `pc2-node/test-fresh-install/frontend/`
  - **Impact:** Stale bundles cause "code not working" debugging confusion
  - **Solution:** 
    - `npm run build` in `src/gui/` now automatically copies bundle via `build-frontend.js`
    - Modified `src/gui/package.json` so `build` script runs copy automatically
  - **Manual Copy:** If building directly, run: `node pc2-node/test-fresh-install/scripts/build-frontend.js`
  - **Rule:** ALWAYS ensure frontend directory has latest bundle before testing
  - **Never:** Serve stale bundles - causes debugging confusion and "code not working" issues
  - **File:** `pc2-node/package.json`
  - **Scripts:**
    ```json
    {
      "scripts": {
        "build": "npm run build:frontend && npm run build:backend",
        "build:frontend": "cd ../src/gui && npm run build && cp -r dist/* ../pc2-node/frontend/",
        "build:backend": "tsc",
        "start": "node dist/server.js"
      }
    }
    ```
  - **Time:** 2 hours

#### 2.3 Static File Serving (Production) ✅
- [x] **Task:** Implement static file serving
  - **File:** `pc2-node/src/static.js`
  - **Features:**
    - Serve files from `frontend/` directory
    - SPA fallback (all routes → `index.html`)
    - MIME type detection
    - Cache headers
  - **Time:** 3-4 hours

#### 2.4 IPFS Integration ✅ **COMPLETE**
- [x] **Task:** Replace in-memory filesystem with IPFS
  - ✅ Migrated from deprecated `ipfs-core` 0.18 to modern `helia` library
  - ✅ Added `Promise.withResolvers` polyfill for Node.js 20 compatibility
  - ✅ Configured libp2p with TCP/WebSocket transports, Noise encryption, Yamux multiplexing
  - ✅ IPFS node initializes successfully with Helia
  - ✅ Removed WebRTC transport (not needed for Node.js, was causing certificate errors)
  - ✅ Server continues in database-only mode when IPFS unavailable (graceful fallback)
  - **File:** `pc2-node/src/storage/ipfs.ts`
  - **Features:**
    - Initialize IPFS node using Helia
    - Store files on IPFS using `@helia/unixfs`
    - Retrieve files from IPFS
    - Pin/unpin files
    - Metadata in SQLite
  - **Time:** 1-2 days (completed 2025-12-16)

#### 2.5 SQLite Database ✅
- [x] **Task:** Add persistent storage
  - ✅ Database schema implemented
  - ✅ User sessions, file metadata, settings stored in SQLite
  - ✅ Migrations system in place
  - **File:** `pc2-node/src/storage/database.js`
  - **Schema:**
    - Users (wallet addresses)
    - Files (metadata, IPFS hashes)
    - Sessions
    - Settings
  - **Time:** 1 day

#### 2.6 Real WebSocket (Socket.io) ✅ **COMPLETE**
- [x] **Task:** Replace polling with WebSocket
  - ✅ Socket.io server implemented (`pc2-node/src/websocket/server.ts`)
  - ✅ Event queue system added (`pendingEvents` array)
  - ✅ Authentication middleware with session persistence
  - ✅ Event broadcasting to user rooms
  - ✅ **FIXED**: Authentication token reading from `auth.auth_token` (frontend sends this format)
  - ✅ **FIXED**: Socket authentication on handshake working correctly
  - ✅ **FIXED**: Sockets staying connected and joining rooms properly
  - ✅ **FIXED**: Real-time file deletion updates working (items removed from DOM)
  - ✅ **FIXED**: Frontend handlers receiving and processing events correctly
  - ✅ **FIXED**: Frontend build script (PROJECT_ROOT calculation, index.html generation)
  - ✅ **FIXED**: Real-time file move operations working (Desktop ↔ Explorer, Explorer ↔ Explorer)
  - ✅ **FIXED**: Thumbnail display for moved image files (PNG, JPG, etc.)
  - ✅ **FIXED**: Duplicate item prevention during moves/uploads
  - ✅ **FIXED**: Removed "Moving" progress popup (silent real-time updates)
  - ✅ **FIXED**: Error handling in frontend event handlers (no error popups)
  - **File:** `pc2-node/src/websocket/server.ts`
  - **Features:**
    - Real-time file updates (delete ✅, move ✅ - all working)
    - Multi-tab sync (working - events broadcast to all connected clients)
    - Event broadcasting (queue implemented, delivery working)
    - Polling fallback support (Socket.io handles automatically)
  - **Time:** 1 day (initial implementation) + 2 days (fixes) = 3 days total

**Phase 2 Deliverable:** ✅ **COMPLETE** - Production PC2 node with frontend built-in, WebSocket real-time updates fully working

**Recent Progress (2025-12-18):**
- ✅ Fixed app launching - `/drivers/call` body parsing for `text/plain;actually=json`
- ✅ Added missing endpoints (`/auth/get-user-app-token`, POST `/df`)
- ✅ Fixed desktop UI (bin, toolbar) display
- ✅ Improved error handling (kvstore, JSON parsing)
- ✅ Added multipart/form-data support for file uploads
- ✅ Fixed `/stat` endpoint - now returns directory stats for all user paths (resolves 404 errors preventing desktop initialization)
- ✅ Fixed `/readdir` endpoint - includes Trash/bin on Desktop even when filesystem not initialized
- ✅ Desktop UI fully functional - toolbar, taskbar, bin icon all visible and working
- ✅ Added comprehensive logging to `/stat` and `/drivers/call` for debugging
- ✅ **IPFS Migration Complete** - Migrated from `ipfs-core` to `helia` library
  - ✅ IPFS node initializes successfully
  - ✅ Added POST support for `/read` endpoint (frontend sends POST requests)
  - ✅ Enhanced `/stat` endpoint with fallback directory stats for virtual user directories
  - ✅ Updated test-fresh-install dependencies to match main project
- ✅ **WebSocket Real-Time Updates Fixed (2025-12-17 to 2025-12-18):**
  - ✅ Fixed authentication token reading (`auth.auth_token` format from frontend)
  - ✅ Fixed socket authentication on handshake (sockets now stay connected)
  - ✅ Fixed room membership (sockets properly join user rooms)
  - ✅ Fixed frontend build script (PROJECT_ROOT calculation, index.html generation with full initialization)
  - ✅ Fixed frontend event handlers (items now removed from DOM, not just hidden)
  - ✅ Real-time file deletion working - items disappear immediately without page refresh
  - ✅ Event delivery confirmed - handlers receiving events, finding items, removing from DOM
  - ✅ **Real-time file move operations fully working (2025-12-18):**
    - ✅ Move between directories (Desktop ↔ Explorer, Explorer ↔ Explorer) working smoothly
    - ✅ Items removed from old location and added to new location in real-time
    - ✅ Thumbnail display for image files (PNG, JPG) after moves
    - ✅ Duplicate item prevention during moves/uploads (robust duplicate detection)
    - ✅ Removed "Moving" progress popup - operations are silent with real-time updates
    - ✅ Error handling in frontend - errors logged to console, no error popups
    - ✅ Backend sends complete metadata (is_dir, size, type, modified, thumbnail) in `item.moved` events
    - ✅ Frontend handles missing fields gracefully with fallbacks
    - ✅ Fixed TypeScript error in `handleRead` function (line 486 - return type mismatch)

---

### Phase 3: Packaging & Deployment (Week 4)
**Goal:** Create installable packages for different platforms

**⚠️ CRITICAL: Backup/Restore Polish & Documentation MUST be completed in Phase 3**

**User Trust Requirement:** Users must feel reassured and safe. Backup/restore system must be:
- ✅ Fully functional (core complete in Phase 2.5)
- ⚠️ Well-documented (user-facing docs needed)
- ⚠️ Polished UI (reassurance features needed)
- ⚠️ Comprehensively tested (validation needed)
- ⚠️ Automated (scheduling needed)

**See:** `/docs/PHASE3_BACKUP_RESTORE_REQUIREMENTS.md` for complete requirements.

#### 3.0 Backup/Restore System Polish (MANDATORY for Phase 3)
- [ ] **User-facing documentation** (2-3 days) - In-app help, quick guides, disaster recovery
- [ ] **UI polish & reassurance** (1-2 days) - Status indicators, warnings, confirmations
- [ ] **Comprehensive testing** (1-2 days) - End-to-end, cross-version, failure scenarios
- [ ] **Automated scheduling** (2-3 days) - Cron integration, retention policy, health monitoring
- **Priority:** **HIGH** - Critical for user trust
- **Status:** Core functionality complete, polish required

#### 3.1 Docker Package
- [ ] **Task:** Create Dockerfile
  - **File:** `pc2-node/Dockerfile`
  - **Features:**
    - Multi-stage build
    - Frontend + Backend
    - Minimal image size
    - Health checks
  - **Time:** 2-3 hours

#### 3.2 Debian Package (Raspberry Pi)
- [ ] **Task:** Create .deb package
  - **File:** `pc2-node/debian/control`
  - **Features:**
    - Systemd service
    - Auto-start on boot
    - Configuration files
  - **Time:** 1 day

#### 3.3 macOS Package
- [ ] **Task:** Create .dmg installer
  - **File:** `pc2-node/macos/`
  - **Features:**
    - GUI installer
    - Launch daemon
    - Preferences pane
  - **Time:** 1 day

#### 3.4 Setup Wizard
- [ ] **Task:** Create CLI setup tool
  - **File:** `pc2-node/src/setup.js`
  - **Features:**
    - Owner wallet input
    - Domain configuration
    - SSL certificate setup
    - Network configuration
  - **Time:** 2-3 days

**Phase 3 Deliverable:** 
- Installable packages for all platforms
- **Production-ready backup/restore system** with comprehensive documentation
- **User reassurance features** (status indicators, health monitoring, clear guidance)
- **Tested and verified** restore process across different scenarios

---

### Phase 4: Network & Security (Week 5)
**Goal:** Enable global access with security

#### 4.1 SSL/TLS Support
- [ ] **Task:** Auto SSL certificate (Let's Encrypt)
  - **File:** `pc2-node/src/ssl.js`
  - **Features:**
    - Auto-renewal
    - HTTP → HTTPS redirect
    - Certificate validation
  - **Time:** 2-3 days

#### 4.2 Dynamic DNS
- [ ] **Task:** Support dynamic DNS services
  - **File:** `pc2-node/src/dns.js`
  - **Services:**
    - DuckDNS
    - No-IP
    - Custom domain
  - **Time:** 1-2 days

#### 4.3 Firewall Configuration
- [ ] **Task:** Auto-configure firewall
  - **File:** `pc2-node/src/firewall.js`
  - **Features:**
    - UPnP port forwarding
    - Firewall rules
    - Security hardening
  - **Time:** 1-2 days

#### 4.4 Security Hardening
- [ ] **Task:** Security best practices
  - **Features:**
    - Rate limiting
    - Input validation
    - CSRF protection
    - XSS prevention
    - Security headers
  - **Time:** 2-3 days

**Phase 4 Deliverable:** Secure, globally accessible PC2 nodes

---

### Phase 5: Testing & Documentation (Week 6)
**Goal:** Comprehensive testing and user documentation

#### 5.1 Integration Testing
- [ ] **Task:** End-to-end tests
  - **Coverage:**
    - Installation
    - Setup
    - Authentication
    - File operations
    - App launching
    - Multi-node access
  - **Time:** 1 week

#### 5.2 User Documentation
- [ ] **Task:** User guides
  - **Documents:**
    - Installation guide
    - Setup guide
    - User manual
    - Troubleshooting
  - **Time:** 3-4 days

#### 5.3 Developer Documentation
- [ ] **Task:** Technical docs
  - **Documents:**
    - Architecture overview
    - API reference
    - Development guide
    - Deployment guide
  - **Time:** 2-3 days

**Phase 5 Deliverable:** Tested, documented, production-ready

---

## 🔄 Migration Strategy

### From Current State to Target State

#### Step 1: Preserve Current Work
```bash
# Save current branch
git checkout sash-work
git add -A
git commit -m "Save current work: Desktop UI working, authentication complete"
git push origin sash-work

# Create new branch
git checkout -b sash-anders-vision
git push -u origin sash-anders-vision
```

#### Step 2: Implement Phase 1 (Proof of Concept)
- Add static serving to mock server
- Test locally
- Verify concept works

#### Step 3: Create Production Node Structure
- Extract mock server logic
- Create proper package structure
- Integrate frontend build

#### Step 4: Gradual Migration
- Keep mock server for development
- Production node for deployment
- Both share same codebase

---

## 📊 Implementation Timeline

### Week 1: Foundation
- **Days 1-2:** Phase 1.1-1.3 (Build frontend, static serving, API detection)
- **Days 3-4:** Phase 1.4 (Testing, bug fixes)
- **Day 5:** Review, documentation

### Week 2-3: Production Node
- **Week 2:** Phase 2.1-2.3 (Structure, build, static serving)
- **Week 3:** Phase 2.4-2.6 (IPFS, SQLite, WebSocket)

### Week 4: Packaging
- **Days 1-2:** Docker package
- **Days 3-4:** Debian package
- **Day 5:** macOS package

### Week 5: Network & Security
- **Days 1-2:** SSL/TLS
- **Days 3-4:** Dynamic DNS, Firewall
- **Day 5:** Security hardening

### Week 6: Testing & Documentation
- **Days 1-3:** Integration testing
- **Days 4-5:** User documentation
- **Days 6-7:** Developer documentation

**Total Estimated Time:** 6 weeks

---

## 🎯 Success Criteria

### Phase 1 Success
- ✅ Mock server serves frontend at `http://127.0.0.1:4200`
- ✅ ElastOS UI loads and works
- ✅ No CORS errors
- ✅ Authentication works
- ✅ File operations work

### Phase 2 Success
- ✅ Production node structure created
- ✅ Frontend built into package
- ✅ IPFS integration working
- ✅ SQLite database working
- ✅ WebSocket real-time updates

### Phase 3 Success

**Critical Success Factor: User Trust & Data Safety**

Users must feel **reassured and safe** that their data is protected. This requires:

1. **Clear Communication:**
   - Backup importance explained clearly
   - Easy-to-understand restore process
   - Warnings about off-server backup storage
   - Success confirmations and status indicators

2. **Reliable Functionality:**
   - Backup creation works consistently
   - Restore process is tested and verified
   - Cross-version compatibility confirmed
   - Error handling is comprehensive

3. **Accessible Documentation:**
   - User-facing guides (not just technical docs)
   - In-app help and tooltips
   - Quick reference cards
   - Video tutorials (optional but valuable)

4. **Proactive Safety:**
   - Automated backup scheduling (recommended)
   - Backup health monitoring
   - Warnings if no recent backup
   - Clear disaster recovery procedures

**Backup & Restore is NOT optional** - it's a core requirement for user trust. Phase 3 must ensure users feel confident their data is safe and recoverable.
- ✅ Docker image builds and runs
- ✅ Debian package installs on Raspberry Pi
- ✅ macOS package installs on Mac
- ✅ Setup wizard works

### Phase 4 Success
- ✅ SSL certificates auto-renew
- ✅ Dynamic DNS works
- ✅ Firewall auto-configures
- ✅ Security audit passes

### Phase 5 Success
- ✅ All tests pass
- ✅ Documentation complete
- ✅ Ready for production deployment

---

## 🚨 Risks & Mitigation

### Risk 1: User Trust & Data Safety ⚠️ **CRITICAL**
- **Risk:** Users may not trust the system if backup/restore is unclear or unreliable
- **Impact:** Low user adoption, data loss concerns, reputation damage
- **Mitigation:** 
  - ✅ Core backup/restore functionality complete (Phase 2.5)
  - ⚠️ **Phase 3 MUST include:** User-facing documentation, UI polish, comprehensive testing
  - ⚠️ Clear warnings about off-server backup storage
  - ⚠️ Automated backup scheduling and health monitoring
  - ⚠️ Disaster recovery documentation
- **Status:** Core functionality ready, Phase 3 polish required

### Risk 2: Frontend Build Complexity
- **Risk:** Frontend build process may be complex
- **Mitigation:** Start with simple static serving, iterate

### Risk 3: IPFS Integration Challenges
- **Risk:** IPFS may have performance/connectivity issues
- **Mitigation:** Keep mock server as fallback, gradual migration

### Risk 4: Network Configuration Complexity
- **Risk:** Users may struggle with network setup
- **Mitigation:** Auto-configuration, clear documentation, setup wizard

### Risk 4: Security Vulnerabilities
- **Risk:** Self-hosted nodes may have security issues
- **Mitigation:** Security audit, best practices, regular updates

---

## 📝 Next Immediate Steps

1. **Save Current Branch**
   ```bash
   git checkout sash-work
   git add -A
   git commit -m "Save current work: Desktop UI working, authentication complete, mock server enhancements"
   git push origin sash-work
   ```

2. **Create New Branch**
   ```bash
   git checkout -b sash-anders-vision
   git push -u origin sash-anders-vision
   ```

3. **Start Phase 1.1**
   - Build frontend: `cd src/gui && npm run build`
   - Verify `dist/` directory exists
   - Check build output

4. **Start Phase 1.2**
   - Add static file serving to mock server
   - Test locally
   - Verify UI loads

---

## 🎓 Key Decisions Made

1. **Single Package:** Frontend + Backend together
2. **Same Origin:** No CORS, simpler security
3. **Self-Hosted:** User controls everything
4. **Wallet Identity:** Decentralized authentication
5. **Multi-Platform:** Raspberry Pi, VPS, Mac support

---

## 🚨 CRITICAL: PC2 Node Isolation Rules

**PC2 node MUST be 100% isolated with ZERO external dependencies.**

### ❌ NEVER DO THESE

1. **NO External CDN Calls**
   - ❌ Never load SDK from `https://js.puter.com/v2/`
   - ❌ Never load scripts from external CDNs
   - ❌ Never load CSS from external sources
   - ✅ **ALWAYS** serve all assets from local server

2. **NO External API Calls**
   - ❌ Never call `api.puter.com` or any external Puter services
   - ❌ Never depend on external authentication services (except Particle Auth for wallet)
   - ✅ **ALWAYS** use local API endpoints

3. **NO External Dependencies in Frontend**
   - ❌ Never use `window.gui_env="prod"` with external CDN fallback
   - ❌ Never include Cloudflare Turnstile or other external scripts
   - ✅ **ALWAYS** use local SDK file at `/puter.js/v2`

### ✅ ALWAYS DO THESE

1. **Local SDK File**
   - ✅ Copy SDK from `/src/backend/apps/viewer/js/puter-sdk/puter-sdk-v2.js`
   - ✅ Place at `/pc2-node/frontend/puter.js/v2`
   - ✅ Serve with correct MIME type: `application/javascript`
   - ✅ Route handler MUST be before `express.static()` middleware

2. **Build Process**
   - ✅ Build script automatically copies SDK during frontend build
   - ✅ Verify SDK file exists before starting server
   - ✅ Log warning if SDK file missing

3. **Static File Serving**
   - ✅ All assets served from local `frontend/` directory
   - ✅ No external network requests for frontend resources
   - ✅ Proper MIME types for all file types

### 📝 Implementation Checklist

- [ ] SDK file copied to `frontend/puter.js/v2` during build
- [ ] `gui.js` uses local SDK path (no external CDN)
- [ ] Route handler for `/puter.js/v2` before static middleware
- [ ] Correct MIME type set (`application/javascript`)
- [ ] No external script tags in HTML
- [ ] No external CSS links
- [ ] All assets verified as local-only

### 🔍 Verification

**Test for external dependencies:**
```bash
# Check for external CDN references
grep -r "js.puter.com" pc2-node/frontend/
grep -r "https://" pc2-node/frontend/gui.js | grep -v "localhost"
grep -r "cdn" pc2-node/frontend/ -i

# Should return NO results
```

**Test server isolation:**
1. Disconnect from internet
2. Start PC2 node
3. Load frontend
4. Verify everything works offline

---

**Status:** Phase 2 ✅ **100% COMPLETE** - Core functionality working, real-time file operations (delete, move) fully working  
**Last Updated:** 2025-12-18

---

## 🎓 Critical Lessons Learned & Implementation Wisdom (2025-12-17)

### Lesson 1: IPFS File Storage & Retrieval - UnixFS DAG Structure

**Problem:** Video files (2.2MB) were stored correctly but only 159 bytes were retrieved, causing playback failures.

**Root Cause:** 
- `fs.addBytes()` creates a UnixFS DAG (Directed Acyclic Graph) structure, not a single block
- Using `blockstore.get(cid)` directly only retrieves the root block (metadata), not the full file
- The root block is ~159 bytes, which is why only that much was retrieved

**Solution:**
- Use `ipfs-unixfs-exporter` to properly reconstruct files from UnixFS DAG structure
- Exporter traverses the DAG and concatenates all data blocks
- Must use the underlying `FsBlockstore` directly, not `helia.blockstore` (IdentityBlockstore wrapper)
- The IdentityBlockstore wrapper causes `yield* is not iterable` errors

**Key Code Pattern:**
```typescript
// ❌ WRONG - Only gets root block
const block = await blockstore.get(cidObj);
// Returns ~159 bytes (metadata only)

// ✅ CORRECT - Reconstructs full file from DAG
const { exporter } = await import('ipfs-unixfs-exporter');
const entry = await exporter(cidObj, blockstore);
const chunks: Uint8Array[] = [];
for await (const chunk of entry.content()) {
  chunks.push(chunk);
}
const buffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
// Returns full file (2.2MB)
```

**Wisdom:** When using Helia's `fs.addBytes()`, always use `ipfs-unixfs-exporter` for retrieval. Direct blockstore access only works for raw blocks, not UnixFS files.

---

### Lesson 2: Session Persistence After Page Refresh

**Problem:** After refreshing the page, users lost their session - files and background image disappeared, requiring logout/login.

**Root Causes:**
1. Frontend wasn't loading stored session token from localStorage on page load
2. `/whoami` endpoint wasn't checking Referer header for tokens (unlike middleware)
3. Multiple Bearer tokens in Authorization header - code was taking first (mock token) instead of real session token
4. Fallback to "most recent active session" was returning wrong user's session

**Solution:**
1. **Frontend:** Load token from localStorage on page initialization
   ```javascript
   // Load stored token FIRST
   const storedToken = localStorage.getItem('auth_token');
   if (storedToken) {
     window.auth_token = storedToken;
   }
   ```

2. **Backend `/whoami`:** Check Referer header for tokens (matching middleware behavior)
   ```typescript
   // Check Referer header for token (essential for session persistence)
   if (!token && req.headers.referer) {
     const refererUrl = new URL(req.headers.referer);
     const refererToken = refererUrl.searchParams.get('puter.auth.token');
     if (refererToken) token = refererToken.trim();
   }
   ```

3. **Multiple Token Handling:** Try each token to find valid session
   ```typescript
   // Try each token to find one with a valid session
   for (const candidateToken of allTokens) {
     const candidateSession = db.getSession(candidateToken);
     if (candidateSession && candidateSession.expires_at > Date.now()) {
       token = candidateToken; // Use this valid session
       break;
     }
   }
   ```

4. **Security Fix:** Removed fallback to "most recent active session" - would return wrong user
   ```typescript
   // ❌ WRONG - Returns wrong user's session
   const mostRecent = activeSessions[0];
   session = mostRecent; // Could be different user!
   
   // ✅ CORRECT - Return unauthenticated if can't determine user
   logger.warn('Cannot determine user, returning unauthenticated state');
   // Let it fall through to unauthenticated response
   ```

**Wisdom:** 
- Always load stored session tokens on page initialization
- Check all token sources (header, query, Referer) consistently across endpoints
- Never use another user's session as fallback - security risk
- Validate token format (64 hex chars) before storing to avoid mock tokens

---

### Lesson 3: App Window Management & UX Best Practices (2026-01-25)

**Problem 1: Apps Not Opening Maximized**
- Apps configured with `maximize_on_start: true` in backend weren't opening maximized
- User had to manually maximize every time

**Root Cause:**
- `launch_app.js` was trying `puter.apps.get()` (cloud SDK) **first**, which doesn't have PC2-specific properties like `maximize_on_start`
- Only fell back to `window.get_apps()` (local backend) if SDK failed
- Cloud SDK returned app info without `maximize_on_start`, so maximize logic never triggered

**Solution:**
1. **Prioritize Local Backend:** Changed app info fetching to try `window.get_apps()` (local backend) **first**
   ```javascript
   // ✅ CORRECT - Try local backend first for PC2-specific properties
   if (typeof window.get_apps === 'function') {
       app_info = await window.get_apps(options.name);
   }
   // Fallback to cloud SDK only if local backend doesn't have the app
   if (!app_info && typeof puter !== 'undefined' && puter.apps && puter.apps.get) {
       app_info = await puter.apps.get(options.name, { icon_size: 64 });
   }
   ```

2. **Hardcoded Fallback List:** Added `PC2_MAXIMIZE_APPS` array as backup
   ```javascript
   const PC2_MAXIMIZE_APPS = ['dao-dashboard', 'app-center'];
   const shouldMaximize = app_info.maximize_on_start || PC2_MAXIMIZE_APPS.includes(options.name);
   ```

**Wisdom:**
- Always prioritize local backend (`window.get_apps`) for PC2-exclusive apps
- Cloud SDK (`puter.apps.get`) should only be fallback for cloud Puter apps
- Hardcoded fallback lists provide safety net if API doesn't return expected properties
- Backend must have `maximize_on_start: true` in `pc2-node/src/api/apps.ts` AND compiled to `dist/api/apps.js`

**Problem 2: Auto-Scrolling on App Open**
- Dapp Centre was scrolling to bottom on first open
- Poor UX - user expects to see top of page first

**Root Cause:**
- `selectCategory()` function called `scrollIntoView()` on category selection
- This was also triggered on initial page load, causing unwanted scroll

**Solution:**
- Removed `scrollIntoView()` call - let user stay at top of page
- Users can manually scroll if they want to see specific sections

**Wisdom:**
- **Never auto-scroll on page/app open** - always start at top
- Only scroll programmatically when user explicitly triggers an action (e.g., clicking a category)
- Respect user's scroll position - don't force navigation unless necessary

**Files Modified:**
- `src/gui/src/helpers/launch_app.js` - Prioritize local backend, add hardcoded maximize list
- `pc2-node/src/api/apps.ts` - Added `maximize_on_start: true` for `dao-dashboard` and `app-center`
- `src/backend/apps/app-center/index.html` - Removed auto-scroll

---

### Lesson 4: Token Validation & Storage

**Problem:** Frontend was capturing and storing mock tokens from `/whoami` responses, causing wrong user sessions.

**Solution:**
- Only store real session tokens (64 hex characters)
- Ignore mock tokens (`mock-token-...` format)
- Validate token format before storing in localStorage

**Key Code Pattern:**
```typescript
// Only store real session tokens, not mock tokens
if (token.length === 64 && /^[0-9a-f]+$/i.test(token)) {
  localStorage.setItem('auth_token', token);
} else {
  console.warn('Ignoring non-session token (mock token or invalid format)');
}
```

**Wisdom:** Always validate token format before storing. Mock tokens are for development only and should never be persisted.

---

### Lesson 4: Multiple Bearer Tokens in Authorization Header

**Problem:** After using apps (player/viewer), Authorization header contained multiple tokens: `Bearer mock-token-..., Bearer 45909269...`. Code was taking first token (mock) instead of real session token.

**Solution:**
- Parse all tokens from comma-separated header
- Try each token to find one with valid session
- Prefer real session tokens (64 hex chars) over mock tokens
- Only fall back to first token if no valid session found

**Wisdom:** When multiple tokens are present, always try each one to find a valid session. Don't assume the first token is correct.

---

### Lesson 5: MIME Type Detection for Video/Audio Files

**Problem:** Video files weren't being recognized properly, causing playback issues.

**Solution:**
- Extended `guessMimeType` function to include all common video/audio formats
- Added proper MIME types for: mp4, mov, webm, avi, mkv, m4a, ogg, flac, etc.
- Used as fallback when browser doesn't provide MIME type

**Wisdom:** Always have comprehensive MIME type detection as fallback. Browsers may not always provide MIME types, especially for uploaded files.

---

### Lesson 6: File Upload Size Validation

**Problem:** Files appeared to upload correctly but were truncated (2.2MB reported, 159 bytes stored).

**Solution:**
- Added comprehensive logging to compare `reportedSize` (from `file.size`) vs `actualSize` (from buffer length)
- Validated that Multer is providing full file buffer
- Discovered issue was in IPFS retrieval, not upload (see Lesson 1)

**Wisdom:** Always log and validate file sizes at each stage: upload → storage → retrieval. This helps identify where truncation occurs.

---

## 📊 Current Implementation Status (2025-12-17)

### ✅ **COMPLETE** - Core Functionality

1. **IPFS Storage & Retrieval** ✅
   - ✅ Migrated to Helia library
   - ✅ UnixFS file storage working
   - ✅ File retrieval using exporter (fixes video playback)
   - ✅ Proper DAG reconstruction for multi-block files

2. **Session Persistence** ✅
   - ✅ Frontend loads token from localStorage on page load
   - ✅ `/whoami` checks all token sources (header, query, Referer)
   - ✅ Multiple token handling (tries each to find valid session)
   - ✅ Security: No fallback to wrong user's session
   - ✅ Token validation (only stores real session tokens)

3. **File Operations** ✅
   - ✅ File upload with multipart/form-data support
   - ✅ File storage in IPFS with metadata in SQLite
   - ✅ File retrieval with HTTP Range request support (video streaming)
   - ✅ MIME type detection for all file types

4. **Authentication** ✅
   - ✅ Wallet-based authentication (Particle Auth)
   - ✅ Session management (30-day sessions, auto-extension)
   - ✅ Session persistence across page refreshes
   - ✅ Mock token support for development

5. **Desktop UI** ✅
   - ✅ Desktop initialization with files and folders
   - ✅ Background image loading
   - ✅ File operations (upload, delete, move)
   - ✅ App launching (player, viewer, editor, etc.)

### ✅ **COMPLETE** - Real-Time File Operations

1. **WebSocket Real-Time Updates** ✅ **FULLY WORKING**
   - ✅ Socket.io server implemented
   - ✅ Event queue system
   - ✅ Event delivery reliability (confirmed working)
   - ✅ Multi-tab synchronization (events broadcast to all connected clients)
   - ✅ Real-time file deletion working (items removed from DOM immediately)
   - ✅ Real-time file move operations working (Desktop ↔ Explorer, Explorer ↔ Explorer)
   - ✅ Thumbnail display for image files after moves
   - ✅ Duplicate item prevention during moves/uploads
   - ✅ Silent operations (no progress popups, errors logged to console)

2. **App Functionality** ⚠️
   - ✅ Apps served at `/apps/*` paths
   - ✅ SDK URL injection working
   - ⚠️ Needs testing: All app types (player, viewer, editor, terminal)
   - ⚠️ Needs testing: File opening from apps

---

## 🎓 Lessons Learned & Architecture Decisions

### WebSocket vs HTTP Polling for Remote Access

**Decision Made (2025-12-17):** Use **WebSocket with polling fallback** for production remote access.

**Context:**
- PC2 nodes will be accessed from anywhere in the world (not just localhost)
- Users run PC2 node on hardware box/VPS server
- Browser connects remotely over the internet

**Why WebSocket:**
1. **Lower Latency**: Persistent connection, no HTTP overhead per event
2. **More Efficient**: Bidirectional communication, no constant polling
3. **Better for Real-Time**: Instant event delivery
4. **Works Over Internet**: Handles network conditions better than polling

**Why Polling as Fallback:**
1. **Reliability**: Works when WebSocket fails (firewalls, proxies)
2. **Compatibility**: Socket.io automatically falls back to polling
3. **No Manual Implementation**: Socket.io handles this internally

**Mock Server vs Production Node:**
- **Mock Server** (`tools/mock-pc2-server.cjs`): Uses custom HTTP polling (simpler for localhost testing)
- **PC2 Node** (`pc2-node/`): Uses Socket.io WebSocket (better for remote access)

**Key Insight:** The mock server's polling approach works great for localhost, but for production remote access, WebSocket is the right choice. Socket.io provides both automatically.

### Current WebSocket Implementation Status

**Location:** `pc2-node/src/websocket/server.ts`

**What's Working:**
- ✅ Socket.io server setup with CORS and authentication
- ✅ Event queue system (`pendingEvents` array)
- ✅ Session persistence (`socketSessions` map for polling requests)
- ✅ Authentication middleware with auto-reauthentication
- ✅ Event broadcasting to user rooms (`io.to(room).emit()`)
- ✅ Event queuing in `events.ts` (`broadcastItemAdded`, `broadcastItemRemoved`)

**What's Not Working:**
- ❌ Clients disconnect immediately after connection (logs show `client namespace disconnect`)
- ❌ Events not being delivered reliably (user reports: "deleting isn't live, have to refresh")
- ❌ Event queue delivery on connect/reconnect may not be working correctly
- ❌ Real-time file deletion updates not appearing without page refresh

**Root Cause Analysis:**
1. **Client Disconnection**: Clients connect, authenticate, join room, then immediately disconnect
   - May be due to WebSocket upgrade failure
   - May be due to authentication timing issues
   - May be due to Socket.io client configuration

2. **Event Delivery Failure**: Even when clients are connected, events aren't received
   - Events are queued correctly (`pendingEvents` array)
   - Events are broadcast to rooms (`io.to(room).emit()`)
   - But clients don't receive them (likely because they disconnect before events are sent)

**Next Steps:**
1. Fix client disconnection issue (investigate WebSocket upgrade, authentication timing)
2. Ensure event queue is delivered on connect/reconnect
3. Test with remote connections (not just localhost)
4. Verify events are received by clients when connected

### Critical Issues Identified

**See:** `docs/PC2_NODE_VS_MOCK_SERVER_DEEP_AUDIT.md` for detailed audit

**Priority 1 - Event System:**
- WebSocket clients disconnecting immediately
- Events not being delivered reliably
- Real-time updates not working (deletions require page refresh)

**Priority 2 - App Icons:**
- `/get-launch-apps` returns `undefined` for most app icons
- Mock server returns base64 SVG icons
- Need to load SVG files and convert to base64

**Priority 3 - File Opening:**
- `/open_item` returns path-based URLs (`/apps/viewer/index.html`)
- Mock server uses subdomain-based URLs (`viewer.localhost:4200`)
- Should work if apps are served correctly, but needs verification

**Priority 4 - Drag & Drop:**
- Only works on desktop, not in explorer windows
- Likely frontend issue, but may be related to event system

### Architecture Decisions

1. **WebSocket for Remote Access**: Confirmed - WebSocket is the right choice for production remote access
2. **Socket.io with Polling Fallback**: Using Socket.io which automatically handles both WebSocket and polling
3. **Event Queue System**: Implemented to match mock server's pattern, but needs proper delivery
4. **Session Persistence**: Implemented for reconnection scenarios
5. **100% Internal Isolation**: All assets served locally, no external CDN dependencies (CRITICAL)

---

## 📋 Current Work Status (2025-12-17)

### Completed
- ✅ PC2 node structure created
- ✅ Frontend built and served from PC2 node
- ✅ IPFS integration (migrated to Helia)
- ✅ SQLite database with sessions
- ✅ Socket.io WebSocket server implemented
- ✅ Event queue system added
- ✅ Authentication middleware with session persistence

### ✅ Recently Completed (2025-12-18)
- ✅ Real-time file move operations fully working
- ✅ Thumbnail display for image files after moves
- ✅ Duplicate item prevention during moves/uploads
- ✅ Removed "Moving" progress popup
- ✅ Error handling improvements (no error popups, silent failures)
- ✅ Backend sends complete metadata in `item.moved` events
- ✅ Frontend handles missing fields gracefully

### Next Immediate Tasks
1. **App Icon Loading** (Priority 1)
   - Update `/get-launch-apps` to return base64 SVG icons
   - Load SVG files from `src/backend/assets/app-icons/`
   - Match mock server's format exactly

2. **Fix App Icons**
   - Update `/get-launch-apps` to return base64 SVG icons
   - Load SVG files from `src/backend/assets/app-icons/`
   - Match mock server's format exactly

3. **Verify File Opening**
   - Test `/open_item` endpoint
   - Verify apps are served at `/apps/*` paths
   - Test file opening in player/viewer

### Testing Command
```bash
cd /Users/mtk/Documents/Cursor/pc2.net/pc2-node/test-fresh-install && npm start
```

---

## 🎯 What's Remaining to Do (Updated 2026-01-27)

### v1.0 Launch Preparation - In Progress

**See:** `.cursor/plans/pc2_v1_launch_plan_b56827f2.plan.md` for detailed plan

#### Path 1: Local Computer Testing (2 minutes to first use)
- [ ] Create `npm run start:local` one-liner script
- [ ] Clear terminal output with URL to open
- [ ] Works on macOS, Linux, Windows (WSL)

#### Path 2: VPS Deployment (15 minutes)
- [ ] Create `curl -fsSL https://pc2.net/install | bash` installer
- [ ] Docker-based setup
- [ ] Documentation: `docs/deployment/VPS_GUIDE.md`

#### Path 3: ARM Devices (20 minutes)
- [ ] Raspberry Pi install script (`scripts/install-rpi.sh`)
- [ ] Jetson Nano install script
- [ ] systemd service for auto-start
- [ ] Documentation: `docs/deployment/ARM_DEVICES.md`

#### Security Hardening (1 day)
- [ ] Rate limiting on web gateway (`deploy/web-gateway/index.js`)
- [ ] CORS hardening
- [ ] HTTP to HTTPS redirect
- [ ] Security headers (X-Content-Type-Options, X-Frame-Options, HSTS)

#### Documentation (1-2 days)
- [ ] Quick start guide (`docs/QUICKSTART.md`)
- [ ] Production checklist (`docs/PRODUCTION_CHECKLIST.md`)
- [ ] Troubleshooting guide (`docs/TROUBLESHOOTING.md`)

#### Testing (1-2 days)
- [ ] Test all 3 deployment paths end-to-end
- [ ] Verify nodes appear on map.ela.city
- [ ] Test update flow from Settings UI
- [ ] Test Active Proxy for NAT-behind nodes

---

### Completed Items (Moved from "Remaining")

- ✅ WebSocket Event Delivery - Working
- ✅ App Icon Loading - Working
- ✅ Session Persistence - Working
- ✅ Multi-user Testing - Working

### Phase 3: Packaging & Deployment - 60% Complete

#### 🛡️ CRITICAL: Backup & Restore System (User Safety & Data Protection)

**Status:** ✅ **Phase 2.5 Complete** (2025-12-21), Phase 3 at 40%  
**Priority:** **HIGH** - Essential for user trust and data safety  
**Phase:** **Phase 2.5 Complete, Phase 3 In Progress**

**Current Implementation:**
- ✅ Backup creation (UI + terminal): `npm run backup` or Settings UI button
- ✅ Backup download (UI): Download to local device via browser
- ✅ Backup restore (terminal): `npm run restore <backup-file>`
- ✅ **One-Click Web UI Restore** (NEW - Phase 2.5): Upload backup file via browser, restore without SSH
- ✅ Backup management API: List, create, download, delete, restore endpoints
- ✅ UI integration: Personal Cloud settings tab with full backup management
- ✅ Off-server backup strategy: Download to separate device (survives server failure)
- ✅ Restore to new node: Works across different hardware/servers
- ✅ Database migrations: Automatic schema upgrades on restore
- ✅ **Backup Status Indicators** (NEW - Phase 2.5): Visual health status with last backup date
- ✅ **Comprehensive Help System** (NEW - Phase 2.5): In-app help with step-by-step instructions

**Phase 3 Requirements (MUST COMPLETE):**

1. **User Documentation** (2-3 days) - **CRITICAL**
   - ✅ Complete backup strategy guide (`/docs/PC2_NODE_BACKUP_STRATEGY.md`)
   - ✅ Restore to new node guide (`/docs/PC2_NODE_UPGRADE_AND_MAINTENANCE_STRATEGY.md`)
   - ✅ **User-facing documentation** (Phase 2.5 - Comprehensive in-app help dialog)
   - ✅ **Quick start guide** (Phase 2.5 - Included in help dialog)
   - ✅ **Disaster recovery guide** (Phase 2.5 - "New Server Scenario" section with step-by-step instructions)
   - ⚠️ **Best practices** (3-2-1 backup rule, scheduling, etc.)

2. **UI Polish & Reassurance** (1-2 days) - **HIGH PRIORITY**
   - ✅ **Backup status indicators** (Phase 2.5 - Visual health status with icons, last backup date)
   - [ ] **Backup verification** (verify backup integrity before restore) - Not implemented yet
   - ✅ **Restore progress UI** (Phase 2.5 - Upload and processing progress indicators)
   - ✅ **Clear warnings** (Phase 2.5 - Prominent off-server storage warning box)
   - ✅ **Success confirmations** (Phase 2.5 - Improved feedback messages)

3. **Automated Backup Scheduling** (2-3 days) - **MEDIUM PRIORITY**
   - ⚠️ **Cron job integration** (schedule automatic backups)
   - ⚠️ **Backup retention policy** (keep last N backups, auto-cleanup)
   - ⚠️ **Backup notifications** (email/UI alerts for backup status)
   - ⚠️ **Backup health monitoring** (warn if no backup in X days)

4. **Enhanced Restore Experience** (2-3 days) - **MEDIUM PRIORITY**
   - ✅ **UI Restore Feature** (Phase 2.5 - **COMPLETE** - One-click restore with file upload)
   - [ ] **Restore verification** (pre-restore checks, compatibility validation) - Not implemented yet
   - [ ] **Restore preview** (show what will be restored before proceeding) - Not implemented yet

5. **Testing & Validation** (1-2 days) - **HIGH PRIORITY**
   - ⚠️ **End-to-end restore testing** (backup → restore → verify)
   - ⚠️ **Cross-version testing** (restore v1.0 backup to v1.1 node)
   - ⚠️ **Multi-user restore testing** (verify user isolation preserved)
   - ⚠️ **Failure scenario testing** (corrupted backup, incomplete restore)

**User Safety & Reassurance Requirements:**

**MUST HAVE (Phase 3):**
- ✅ Clear documentation on backup importance (Phase 2.5 - Help dialog)
- ✅ Easy-to-find backup management UI (Phase 2.5 - Settings → PC2 tab)
- ✅ Clear instructions for restore process (Phase 2.5 - Step-by-step in help dialog)
- ✅ Warnings about off-server backup storage (Phase 2.5 - Prominent warning box)
- [ ] Verification that backups work correctly - Manual testing done, automated tests needed

**SHOULD HAVE (Phase 3 or 3.5):**
- [ ] Automated backup scheduling - Not implemented yet
- [ ] Backup health monitoring - Status indicator shows health, but needs automated alerts
- ✅ UI restore feature (Phase 2.5 - **COMPLETE** - One-click restore implemented)
- Backup verification tools

**NICE TO HAVE (Phase 4+):**
- Network restore (node-to-node)
- Cloud backup integration
- Backup encryption options

**Documentation Files:**
- `/docs/PC2_NODE_BACKUP_STRATEGY.md` - Complete backup strategy
- `/docs/PC2_NODE_RESTORE_TO_NEW_NODE.md` - Restore to new node guide
- `/docs/PC2_NODE_UPGRADE_AND_MAINTENANCE_STRATEGY.md` - Upgrade strategy
- `/docs/PC2_NODE_SECURITY_AND_PACKAGING_AUDIT.md` - Security audit

**Success Criteria:**
- ✅ Users can easily create backups (UI + terminal)
- ✅ Users can download backups to safe location (UI)
- ✅ Users can restore to new node (terminal, documented)
- ⚠️ Users understand backup importance (documentation)
- ⚠️ Users feel confident about data safety (polish + testing)
- ⚠️ Backup/restore process is well-tested and reliable

**Phase 3 Deliverable:** Production-ready backup/restore system with comprehensive documentation and user reassurance features.

---

1. **Docker Package** ✅ **COMPLETE**
   - ✅ Dockerfile created (`pc2-node/Dockerfile`)
   - ✅ docker-compose.yml created
   - ✅ Multi-stage build with bubblewrap bundled
   - ✅ Health checks configured
   - ✅ GitHub Actions CI/CD for multi-platform builds

2. **Debian Package** ⏳ **REMAINING**
   - Create .deb package for Raspberry Pi / personal Linux hardware
   - Systemd service
   - Auto-start on boot

3. **macOS Package** (1 day)
   - Create .dmg installer
   - Launch daemon
   - Preferences pane

4. **Setup Wizard** (2-3 days)
   - CLI setup tool
   - Owner wallet input
   - Domain configuration
   - SSL certificate setup
   - **Backup setup guidance** (recommend creating first backup)

### Phase 4: Network & Security - 70% Complete

1. **SSL/TLS Support** ✅ **COMPLETE**
   - ✅ Let's Encrypt wildcard certificate (*.ela.city)
   - ✅ Auto-renewal via Caddy/certbot
   - ✅ HTTPS via Web Gateway

2. **Boson Network Integration** ✅ **COMPLETE**
   - ✅ Boson DHT Super Node (port 39001/UDP)
   - ✅ Active Proxy Service (port 8090/TCP)
   - ✅ Node Identity (Ed25519 keypair, DID)
   - ✅ Username Registry via DHT
   - ✅ NAT traversal protocol implementation

3. **Access Control** ✅ **COMPLETE**
   - ✅ Wallet-based authentication
   - ✅ Role-based permissions (Owner, Admin, Member)
   - ✅ Multi-user support

4. **Remaining Items** ⏳
   - ⏳ End-to-end NAT traversal testing (home hardware → Active Proxy → *.ela.city)
   - ⏳ UPnP port forwarding (auto-detect)
   - ⏳ Rate limiting / DDoS protection

### Phase 5: Testing & Documentation - 50% Complete

1. **Integration Testing** (1 week)
   - End-to-end tests
   - Installation tests
   - Multi-node access tests

2. **User Documentation** (3-4 days)
   - Installation guide
   - Setup guide
   - User manual
   - Troubleshooting

3. **Developer Documentation** (2-3 days)
   - Architecture overview
   - API reference
   - Development guide
   - Deployment guide

---

## 📈 Progress Summary (Updated 2026-01-27)

- **Phase 1:** ✅ 100% Complete - Foundation
- **Phase 2:** ✅ 100% Complete - Production PC2 Node
- **Phase 2.5:** ✅ 100% Complete - Backup/Restore System
- **Phase 3:** ✅ 85% Complete (Packaging & Deployment)
  - ✅ Docker packaging: Complete (`pc2-node/Dockerfile`, `docker-compose.yml`)
  - ✅ VPS deployment: Complete (Contabo running)
  - ✅ Setup Wizard: Complete
  - ✅ Auto-Update System: Complete (GitHub releases + Settings UI)
  - ✅ Release Process: Complete (`docs/RELEASE_PROCESS.md`)
  - ⏳ Debian/Raspberry Pi install script: In Progress (v1 launch)
  - ⏳ Jetson Nano install script: In Progress (v1 launch)
  - ⏳ macOS package: Future
- **Phase 4:** ✅ 90% Complete (Network & Security)
  - ✅ Boson DHT integration: Complete
  - ✅ Active Proxy service: Complete (port 8090)
  - ✅ SSL/HTTPS: Complete (Let's Encrypt wildcard *.ela.city)
  - ✅ Access Control system: Complete (owner/admin/member)
  - ✅ Username registration: Complete (username.ela.city)
  - ✅ Network Map integration: Complete (map.ela.city)
  - ✅ Path traversal protection: Complete
  - ⏳ Rate limiting on web gateway: In Progress (v1 launch)
- **Phase 5:** ✅ 80% Complete (Testing & Documentation)
  - ✅ World Computer Roadmap: Complete (1,057 lines)
  - ✅ Clawdbot UI/UX Plan: Complete (948 lines)
  - ✅ Release Process: Complete (178 lines)
  - ✅ Strategic Implementation Plan: Complete (this document)
  - ✅ Changelog: Updated
  - ⏳ Quick Start guides (3 paths): In Progress (v1 launch)
  - ⏳ E2E test suite: Future
- **Phase 6:** ✅ 100% Complete (AI Agent Integration)
  - ✅ Multi-provider AI: 5 providers (Ollama, Claude, OpenAI, Gemini, xAI)
  - ✅ Per-agent memory: Complete (Clawdbot pattern)
  - ✅ Agent editor: Complete
  - ✅ Tool execution: 20+ tools with permissions
  - ✅ Multi-channel messaging: Telegram complete, WhatsApp in progress
  - ✅ Context retrieval: RAG foundation complete
  - ✅ Security hardening: Path traversal protection complete

**Overall Progress:** ~90% of v1.0 complete

**Remaining for v1 Launch (See: pc2_v1_launch_plan):**
1. Install scripts for 3 paths (Local, VPS, ARM) - 1-2 days
2. Rate limiting on web gateway - 1 day
3. Quick start documentation (3 guides) - 1-2 days
4. Final testing all paths - 1-2 days

**Estimated Time to v1 Launch:** 5-7 days

---

## 🏗️ Architecture Comparison: Puter vs PC2 Node

### Puter Architecture (Cloud-Based)

```
┌─────────────────────────────────────────────────────────────┐
│                    PUTER CLOUD SERVICE                      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Frontend (CDN)                                       │  │
│  │  - Served from js.puter.com                           │  │
│  │  - External CDN dependencies                          │  │
│  │  - Requires internet connection                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          │ HTTPS                             │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Backend API (api.puter.com)                         │  │
│  │  - Centralized servers                              │  │
│  │  - Shared infrastructure                             │  │
│  │  - User data stored on Puter servers                │  │
│  │  - Requires account creation                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Storage (Cloud)                                      │  │
│  │  - Centralized file storage                          │  │
│  │  - User data on Puter infrastructure                 │  │
│  │  - Requires internet for access                      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         ▲
         │ Internet Required
         │
┌────────┴────────┐
│  User Browser   │
│  (Anywhere)     │
└─────────────────┘

Key Characteristics:
❌ Requires internet connection
❌ Data stored on Puter servers
❌ Centralized infrastructure
❌ External CDN dependencies
❌ Account-based authentication
```

### PC2 Node Architecture (Self-Hosted)

```
┌─────────────────────────────────────────────────────────────┐
│              PC2 NODE (User's Hardware)                     │
│  (Raspberry Pi, VPS, Mac, etc.)                            │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Frontend (Built-in)                                   │  │
│  │  - Served from local server                            │  │
│  │  - No external CDN dependencies                        │  │
│  │  - Works offline                                        │  │
│  │  - Auto-detects same-origin API                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          │ Local (Same Origin)              │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Backend API (localhost:4200)                        │  │
│  │  - Express.js server                                  │  │
│  │  - All endpoints implemented                           │  │
│  │  - Wallet-based authentication                         │  │
│  │  - Session management                                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                  │
│         ┌────────────────┴────────────────┐               │
│         │                                   │               │
│         ▼                                   ▼               │
│  ┌──────────────┐                  ┌──────────────┐       │
│  │  SQLite DB   │                  │  IPFS Node   │       │
│  │  - Sessions  │                  │  - File       │       │
│  │  - Metadata  │                  │    Storage    │       │
│  │  - Users     │                  │  - Content    │       │
│  └──────────────┘                  │    Addresses │       │
│                                     └──────────────┘       │
│                                                              │
│  ✅ Single Process                                           │
│  ✅ Single Port (4200)                                       │
│  ✅ No CORS (same-origin)                                    │
│  ✅ Self-contained                                           │
│  ✅ Works offline                                            │
└─────────────────────────────────────────────────────────────┘
         ▲
         │ HTTP/HTTPS (Local or Remote)
         │
┌────────┴────────┐
│  User Browser   │
│  (Anywhere)     │
│  https://my-pc2 │
│  .example.com   │
└─────────────────┘

Key Characteristics:
✅ Works offline (after initial setup)
✅ Data stored on user's hardware
✅ Decentralized (each user runs their own)
✅ No external CDN dependencies
✅ Wallet-based authentication
✅ User controls everything
```

### Key Architectural Differences

| Aspect | Puter (Cloud) | PC2 Node (Self-Hosted) |
|--------|---------------|------------------------|
| **Deployment** | Centralized cloud servers | User's hardware (Raspberry Pi, VPS, Mac) |
| **Frontend** | Served from CDN (js.puter.com) | Built-in, served locally |
| **Backend** | api.puter.com (shared) | localhost:4200 (per-user) |
| **Storage** | Puter cloud storage | Local IPFS + SQLite |
| **Authentication** | Account-based (email/password) | Wallet-based (Particle Auth) |
| **Internet Required** | Yes (always) | No (works offline) |
| **Data Ownership** | Puter servers | User's hardware |
| **CDN Dependencies** | Yes (external) | No (100% local) |
| **Scalability** | Centralized scaling | Per-node scaling |
| **Cost** | Subscription/usage-based | One-time hardware cost |
| **Privacy** | Data on Puter servers | Data on user's hardware |
| **Customization** | Limited | Full control |

### Data Flow Comparison

#### Puter (Cloud) Data Flow:
```
User Browser
    │
    │ HTTPS
    ▼
CDN (js.puter.com) ──┐
    │                │
    │                │
    ▼                ▼
api.puter.com ──→ Cloud Storage
    │
    │ (User Data)
    ▼
Puter Servers
```

#### PC2 Node Data Flow:
```
User Browser
    │
    │ HTTP/HTTPS (Same Origin)
    ▼
Local Server (localhost:4200)
    │
    ├─→ SQLite DB (Sessions, Metadata)
    │
    └─→ IPFS Node (File Content)
    │
    └─→ Local Filesystem (IPFS blocks)
```

### Security Model Comparison

#### Puter (Cloud):
- **Trust Model:** Trust Puter infrastructure
- **Data Location:** Puter servers
- **Access Control:** Account-based, managed by Puter
- **Encryption:** At-rest and in-transit (Puter manages keys)

#### PC2 Node (Self-Hosted):
- **Trust Model:** User controls hardware and software
- **Data Location:** User's hardware
- **Access Control:** Wallet-based, user manages keys
- **Encryption:** User controls encryption (IPFS content-addressed)

---

## 🔧 Development Workflow & Multi-Level Change Process

> **CRITICAL REMINDER (Added 2026-01-25):** When running `npm start` in pc2-node, the server executes compiled JavaScript from `dist/`, NOT the TypeScript source. After ANY code changes:
> 1. Run `npm run build` in pc2-node to recompile
> 2. **RESTART the server** - the running process caches old code
> 3. Hard refresh browser (Cmd+Shift+R)
>
> The `tsx watch` dev mode (`npm run dev`) auto-reloads on file changes, but production mode (`npm start`) does NOT.

### Critical Lesson: Multi-Level Architecture Requires Multi-Level Updates

**Problem:** PC2 Node uses a **three-layer architecture** that requires changes at multiple levels:
1. **TypeScript Source** (`src/`) - Human-readable source code
2. **Compiled JavaScript** (`dist/`) - Runtime code executed by Node.js
3. **Frontend Bundle** (`frontend/`) - Built frontend served to browsers

**Common Pitfall:** Making changes to TypeScript source but forgetting to:
- Compile TypeScript → JavaScript (`npx tsc`)
- Rebuild frontend bundle (`node scripts/build-frontend.js`)
- Restart the server to load new code

**Result:** Changes appear to "not work" even though source code is correct, because the running server is executing old compiled code.

### Development Workflow Checklist

When making changes, **ALWAYS** follow this sequence:

#### Backend Changes (TypeScript → JavaScript)

1. **Edit TypeScript source** (`pc2-node/test-fresh-install/src/**/*.ts`)
2. **Compile TypeScript:**
   ```bash
   cd pc2-node
   npx tsc --skipLibCheck  # Skip lib check if other files have errors
   ```
3. **Verify compilation:**
   - Check `dist/` folder has updated `.js` files
   - Check for TypeScript errors (fix if critical)
   - **Note:** Some TypeScript errors in unrelated files can be ignored if they don't affect your changes
4. **Restart server:**
   ```bash
   # Kill old process
   lsof -ti:4200 | xargs kill -9
   # Start new process
   cd pc2-node && npm start
   ```

#### Frontend Changes (Source → Bundle)

1. **Edit frontend source** (`src/gui/src/**/*.js`)
2. **Rebuild frontend bundle:**
   ```bash
   cd /Users/mtk/Documents/Cursor/pc2.net
   node pc2-node/test-fresh-install/scripts/build-frontend.js
   ```
3. **Verify build:**
   - Check `pc2-node/test-fresh-install/frontend/` has updated files
   - Check `bundle.min.js` timestamp is recent
4. **Hard refresh browser** (Cmd+Shift+R / Ctrl+Shift+R) to clear cache

#### Full Stack Changes (Both Backend + Frontend)

1. **Edit both TypeScript and frontend source**
2. **Compile backend:**
   ```bash
   cd pc2-node && npx tsc --skipLibCheck
   ```
3. **Rebuild frontend:**
   ```bash
   node pc2-node/scripts/build-frontend.js
   ```
4. **Restart server:**
   ```bash
   lsof -ti:4200 | xargs kill -9
   cd pc2-node && npm start
   ```
5. **Hard refresh browser**

### Quick Reference: File Locations

| Layer | Source Location | Compiled/Built Location | How to Update |
|-------|----------------|------------------------|---------------|
| **Backend API** | `pc2-node/test-fresh-install/src/api/*.ts` | `pc2-node/test-fresh-install/dist/api/*.js` | `npx tsc` |
| **WebSocket Events** | `pc2-node/test-fresh-install/src/websocket/*.ts` | `pc2-node/test-fresh-install/dist/websocket/*.js` | `npx tsc` |
| **Frontend UI** | `src/gui/src/UI/*.js` | `pc2-node/test-fresh-install/frontend/bundle.min.js` | `node scripts/build-frontend.js` |
| **Frontend Helpers** | `src/gui/src/helpers.js` | `pc2-node/test-fresh-install/frontend/bundle.min.js` | `node scripts/build-frontend.js` |

### Recent Implementation: Desktop Background & Profile Picture (2025-01-20)

**Task:** Implement persistent desktop background and profile picture customization with settings saved to backend.

**Key Challenges & Solutions:**

1. **CSS `background-image` Authentication Issue**
   - **Problem:** Direct file paths in CSS don't send `Authorization` headers, causing 401 errors
   - **Solution:** Save file *paths* to backend, generate *signed URLs* dynamically using `puter.fs.sign()` for display
   - **Pattern:** Store path in KV store → Generate signed URL on page load → Use signed URL in CSS

2. **UUID-to-Path Conversion for Files with Special Characters**
   - **Problem:** Filenames with spaces/hyphens (e.g., `Screenshot 2025-12-03 at 13.28.09.png`) broke naive UUID conversion
   - **Solution:** Implemented intelligent file lookup:
     - Extract wallet address from UUID
     - List directory contents
     - Match filenames with case-insensitive comparison
     - Handle URL encoding differences
   - **Location:** `pc2-node/test-fresh-install/src/api/file.ts`

3. **Default Settings Persistence**
   - **Problem:** Default wallpaper/background settings not persisting after refresh
   - **Solution:** 
     - Explicitly save default values (`/images/wallpaper-elastos.jpg`, `'cover'` fit) to backend
     - Always use `'cover'` fit for default wallpapers, regardless of previous custom image settings
     - Update `window.user` and `window.desktop_bg_*` immediately after save

4. **Profile Picture Display in Settings Window**
   - **Problem:** Profile picture not showing in Settings → Account tab after page refresh
   - **Solution:** Call `refresh_profile_picture()` when Account tab initializes, ensuring signed URL is generated after DOM element exists

**Files Modified:**
- `src/gui/src/UI/UIWindowDesktopBGSettings.js` - Desktop background settings UI
- `src/gui/src/UI/Settings/UITabAccount.js` - Profile picture settings UI
- `src/gui/src/helpers.js` - `refresh_desktop_background()` and `refresh_profile_picture()` functions
- `pc2-node/test-fresh-install/src/api/other.ts` - `/set-desktop-bg` and `/set-profile-picture` endpoints
- `pc2-node/test-fresh-install/src/api/whoami.ts` - Retrieve desktop background and profile picture from KV store
- `pc2-node/test-fresh-install/src/api/file.ts` - Improved UUID-to-path conversion for files with special characters
- `pc2-node/test-fresh-install/src/types/api.ts` - Added `profile_picture_url` to `UserInfo` interface

**Best Practices Learned:**

1. **Always Use Proper Build Process**
   - Frontend bundle must be rebuilt using `npm run build:frontend` (not just `cd src/gui && node ./build.js`)
   - Bundle is built in `src/gui/dist/` but served from `pc2-node/test-fresh-install/frontend/`
   - The build script automatically copies the bundle to the correct location
   - **Rule:** ALWAYS use `npm run build:frontend` from `pc2-node/test-fresh-install/`

2. **Signed URLs for CSS Resources**
   - CSS `background-image` and `<img src>` don't send `Authorization` headers
   - Must use signed URLs (with embedded authentication) for local files
   - Pattern: Save path → Generate signed URL on load → Use signed URL in CSS

3. **Default Values Must Be Explicitly Saved**
   - Don't rely on "null means default" - explicitly save default values to backend
   - Ensures consistency and prevents fallback to old values

4. **Refresh Functions Should Be Called When UI Elements Exist**
   - Don't call refresh functions during page load if UI elements don't exist yet
   - Call refresh functions when UI components initialize (e.g., Settings tab opens)

5. **UUID-to-Path Conversion Requires Robust Matching**
   - Don't use naive string replacement (e.g., `replace(/-/g, '/')`)
   - Use directory listing and filename matching for files with special characters
   - Handle case-insensitive matching and URL encoding differences

6. **Always Update In-Memory State After Backend Save**
   - Update `window.user.*` and global variables immediately after successful save
   - Ensures UI reflects changes before next `whoami` call

### Common Scenarios & Solutions

#### Scenario 1: "My TypeScript changes aren't working"
**Check:**
- ✅ Did you compile? (`npx tsc`)
- ✅ Did you restart the server?
- ✅ Are you looking at the right `dist/` file?
- ✅ Check server logs for errors

**Solution:** Compile and restart:
```bash
cd pc2-node
npx tsc --skipLibCheck
lsof -ti:4200 | xargs kill -9
npm start
```

#### Scenario 2: "My frontend changes aren't showing"
**Check:**
- ✅ Did you rebuild the frontend? (`node scripts/build-frontend.js`)
- ✅ Did you hard refresh the browser? (Cmd+Shift+R)
- ✅ Is the browser caching the old bundle?

**Solution:** Rebuild and hard refresh:
```bash
node pc2-node/test-fresh-install/scripts/build-frontend.js
# Then in browser: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows/Linux)
```

#### Scenario 3: "WebSocket events aren't working after backend changes"
**Check:**
- ✅ Backend compiled? (`npx tsc`)
- ✅ Server restarted?
- ✅ Frontend still connected? (Check browser console for WebSocket connection)

**Solution:** Full restart:
```bash
# Compile backend
cd pc2-node && npx tsc --skipLibCheck

# Kill and restart server
lsof -ti:4200 | xargs kill -9
npm start

# Rebuild frontend if you changed event handlers
node pc2-node/scripts/build-frontend.js
```

#### Scenario 4: "TypeScript compilation fails but I only changed one file"
**Common causes:**
- Other files have pre-existing TypeScript errors
- Type definitions changed
- Import paths broken

**Solution:** Use `--skipLibCheck` to compile despite errors in unrelated files:
```bash
npx tsc --skipLibCheck
```

**Note:** Only skip lib check if errors are in files you didn't modify. Fix errors in files you actually changed.

### Debugging Multi-Level Issues

#### Step 1: Verify Source Code
- Check the source file has your changes
- Check syntax is correct
- Check imports are correct

#### Step 2: Verify Compiled Code
- Check `dist/` file has your changes
- Compare source and compiled side-by-side
- Check for compilation errors

#### Step 3: Verify Running Code
- Check server logs for your changes executing
- Add `console.log()` statements to verify code path
- Check browser console for frontend changes

#### Step 4: Verify Browser Cache
- Hard refresh (Cmd+Shift+R)
- Check Network tab - is bundle.min.js recent?
- Clear browser cache if needed

### Best Practices

1. **Always compile after TypeScript changes** - Don't assume auto-compilation
2. **Always rebuild frontend after JS changes** - Bundle doesn't auto-update
3. **Always restart server after backend changes** - Node.js doesn't hot-reload
4. **Always hard refresh browser after frontend changes** - Browsers cache aggressively
5. **Check logs first** - Server logs and browser console tell you what's actually running
6. **Verify file timestamps** - `ls -la dist/` and `ls -la frontend/` show when files were last updated

### Emergency: Direct Compiled JS Edits

**When to use:** TypeScript compilation is broken but you need to test a fix immediately.

**How to do it safely:**
1. Edit `dist/**/*.js` directly
2. Test the change
3. **IMMEDIATELY** apply the same change to `src/**/*.ts`
4. Fix TypeScript compilation
5. Recompile to verify

**Warning:** Direct JS edits are temporary. Always sync back to TypeScript source or you'll lose changes on next compile.

### Example: Real-Time File Operations Fix

**Problem:** File rename loses thumbnail until page refresh.

**Multi-level fix required:**

1. **Backend (TypeScript):**
   - Edit `src/api/filesystem.ts` - Add `thumbnail` to `broadcastItemRenamed` call
   - Edit `src/websocket/events.ts` - Add `thumbnail` parameter to function signature
   - Compile: `npx tsc --skipLibCheck`
   - Restart server

2. **Frontend (JavaScript):**
   - Edit `src/gui/src/UI/UIDesktop.js` - Update `item.renamed` handler to use thumbnail
   - Rebuild: `node scripts/build-frontend.js`
   - Hard refresh browser

3. **Verification:**
   - Check server logs show thumbnail in event
   - Check browser console shows thumbnail received
   - Test rename operation - thumbnail should appear immediately

**Key insight:** All three layers (backend source → compiled backend → frontend bundle) must be updated for the fix to work.

---

**Status:** Phase 2 ✅ **100% COMPLETE** - Core functionality working, real-time file operations fully working  
**Next Action:** Phase 3 - Packaging & Deployment (Docker, Debian, macOS packages)

---

## 🚀 Potential Future Features (Post-Phase 2)

> **Status:** These features are proposed for future consideration. They are not part of the current implementation plan but represent opportunities to enhance PC2's value proposition.

### Overview
Based on the current PC2 architecture and self-hosted vision, here are strategic feature proposals that would enhance the platform's value and differentiate it from traditional cloud storage solutions. These are **potential enhancements** to be evaluated and prioritized after Phase 2 completion.

### Feature Categories

#### 📁 **File Management & Organization**

##### 1. **Advanced Search & Indexing** 🔄 **IN PROGRESS**
**Priority:** High | **Complexity:** Medium | **Value:** High  
**Status:** Backend complete, UI filters pending (low priority)

**✅ Completed (2025-12-19):**
- ✅ **Phase 1: Foundation** - Basic `/search` endpoint with filename/path search using SQL LIKE
- ✅ **Phase 2: FTS5 Setup** - SQLite FTS5 virtual table with sync triggers, `content_text` column added
- ✅ **Phase 3: Content Extraction** - Text extraction from plain text, code files, and PDFs (mandatory `pdfjs-dist` integration)
- ✅ **Phase 4: Backend Enhancements** - Advanced search capabilities:
  - ✅ IPFS CID search (auto-detects CID patterns in search input)
  - ✅ Metadata filters (file type, MIME type, size range, date range)
  - ✅ Search mode selection (filename, content, or both)
  - ✅ Improved ranking (prioritizes filename matches over content matches)
  - ✅ Background indexing worker for asynchronous content extraction
- ✅ **Frontend Integration** - Search UI accessible via Cmd+K / Ctrl+K and search toolbar icon
- ✅ **Thumbnail Display** - Search results show actual thumbnails like file explorer

**⚠️ Known Issues:**
- ⚠️ **Filter UI Not Visible** - Search mode toggle and file type filter dropdowns implemented in code but not appearing in UI (low priority, backend fully functional)

**Features:**
- ✅ Full-text search across file contents (PDFs, documents, code files)
- ✅ Metadata search (IPFS CIDs, file types, MIME types)
- ✅ Advanced filters (date range, file type, size) - **Backend ready, UI pending**
- ⏳ Search history and saved searches - **Not started**
- ✅ Indexing service that runs in background

**Technical Implementation:**
- ✅ `pdfjs-dist` integrated for PDF text extraction (mandatory dependency)
- ✅ IPFS CID search integrated
- ✅ SQLite FTS5 extension for full-text search with ranking
- ✅ Background worker process (`IndexingWorker`) for asynchronous indexing
- ✅ Database migration system updated (Migration 3: FTS5 table + triggers)
- ✅ Search endpoint: `POST /search` with comprehensive filtering options

**Files Modified:**
- `pc2-node/test-fresh-install/src/api/search.ts` - Search endpoint implementation
- `pc2-node/test-fresh-install/src/storage/database.ts` - Added `content_text` to FileMetadata
- `pc2-node/test-fresh-install/src/storage/migrations.ts` - Migration 3 for FTS5
- `pc2-node/test-fresh-install/src/storage/indexer.ts` - Content extraction and indexing worker
- `pc2-node/test-fresh-install/src/server.ts` - IndexingWorker initialization
- `src/gui/src/UI/UIWindowSearch.js` - Frontend search UI (filters UI code present but not visible)

**Why It Matters:**
- Self-hosted users need powerful search without relying on external services
- Leverages IPFS content-addressing for unique search capabilities
- Differentiates from basic file managers

---

##### 2. **File Versioning & History** ✅ **BACKEND COMPLETE** (2025-12-19)
**Priority:** Medium | **Complexity:** Medium | **Value:** High  
**Status:** Backend complete, frontend UI pending

**✅ Completed (2025-12-19):**
- ✅ **Database Schema** - Migration 4: `file_versions` table with version tracking
- ✅ **Automatic Version Snapshots** - Versions created automatically on file write/update
- ✅ **Version API Endpoints**:
  - ✅ `GET /versions?path=...` - List all versions for a file
  - ✅ `GET /versions/:versionNumber?path=...` - Get specific version content
  - ✅ `POST /versions/:versionNumber/restore` - Rollback file to specific version
- ✅ **IPFS Integration** - Each version stores IPFS CID (content-addressed, immutable)
- ✅ **Version Cleanup** - Versions deleted when file is deleted
- ✅ **Rollback Functionality** - Restore any previous version (creates new version automatically)

**⏳ Pending:**
- ⏳ **Frontend UI** - Version browser component (similar to Google Docs)
- ⏳ **Version Diff Viewer** - Compare versions for text files

**Features:**
- ✅ Automatic version snapshots on file changes
- ⏳ Version browser UI (similar to Google Docs) - **Pending**
- ✅ Rollback to previous versions
- ⏳ Version diff viewer for text files - **Pending**
- ✅ IPFS-based version storage (each version = new CID)

**Technical Implementation:**
- ✅ `file_versions` table in SQLite (Migration 4)
- ✅ Automatic version creation in `writeFile()` before updating file
- ✅ Version metadata stored with IPFS CID, size, MIME type, timestamp
- ✅ API endpoints for listing, retrieving, and restoring versions
- ✅ IPFS content-addressing ensures immutable version history
- ✅ Version cleanup on file deletion

**Files Modified:**
- `pc2-node/test-fresh-install/src/storage/migrations.ts` - Migration 4 for file_versions table
- `pc2-node/test-fresh-install/src/storage/database.ts` - Added FileVersion interface and versioning methods
- `pc2-node/test-fresh-install/src/storage/filesystem.ts` - Automatic version snapshots on writeFile
- `pc2-node/test-fresh-install/src/api/versions.ts` - Version API endpoints (NEW)
- `pc2-node/test-fresh-install/src/api/index.ts` - Registered version endpoints

**Why It Matters:**
- Self-hosted users need version control without Git
- IPFS's content-addressing is perfect for versioning (immutable, deduplicated)
- Provides safety net for accidental edits
- Natural progression from search/indexing infrastructure

---

##### 3. **Smart Folders & Collections**
**Priority:** Medium | **Complexity:** Low | **Value:** Medium

**Features:**
- Virtual folders based on search criteria
- Tag-based organization
- Smart collections (e.g., "Recent Images", "Large Files", "Unused Files")
- Auto-organize rules (move files based on type/date)

**Technical Approach:**
- Store smart folder definitions in database
- Dynamic folder contents based on queries
- Frontend UI for creating/managing smart folders

**Why It Matters:**
- Reduces manual organization overhead
- Leverages existing search/indexing infrastructure
- Modern file management expectation

---

#### 🔗 **Sharing & Collaboration**

##### 4. **Decentralized File Sharing**
**Priority:** High | **Complexity:** High | **Value:** Very High

**Features:**
- Share files via IPFS CID (public or private)
- Time-limited share links with expiration
- Password-protected shares
- Share analytics (views, downloads)
- Direct IPFS peer-to-peer sharing

**Technical Approach:**
- Generate shareable IPFS links
- Store share metadata in database (expiration, password hash)
- IPFS gateway integration for public shares
- WebRTC or libp2p for direct P2P sharing

**Why It Matters:**
- Core differentiator: decentralized sharing without central server
- Leverages IPFS's native sharing capabilities
- Privacy-first approach (user controls sharing)

---

##### 5. **Multi-User Support & Permissions**
**Priority:** Medium | **Complexity:** Medium | **Value:** High

**Features:**
- Multiple wallet addresses per node
- Folder-level permissions (read, write, admin)
- User groups/roles
- Activity logs (who did what, when)
- Invite system (share wallet address for access)

**Technical Approach:**
- Extend database schema for permissions
- Permission middleware for API endpoints
- Frontend permission UI
- Activity logging system

**Why It Matters:**
- Enables family/team use cases
- Foundation for collaboration features
- Differentiates from single-user solutions

---

#### 🔒 **Security & Privacy**

##### 6. **End-to-End Encryption**
**Priority:** High | **Complexity:** High | **Value:** Very High

**Features:**
- Client-side encryption before IPFS upload
- Encrypted file metadata
- Zero-knowledge architecture (server can't read files)
- Key management (user's wallet as key derivation)
- Encrypted sharing (recipient's wallet for key exchange)

**Technical Approach:**
- Use Web Crypto API for encryption
- Encrypt files before IPFS storage
- Store encryption keys encrypted with user's wallet
- Implement key derivation from wallet signature

**Why It Matters:**
- Critical for self-hosted privacy-focused users
- True "your data, your control" architecture
- Competitive advantage over traditional cloud storage

---

##### 7. **Backup & Sync**
**Priority:** High | **Complexity:** Medium | **Value:** High

**Features:**
- Automated backups to external IPFS nodes
- Sync between multiple PC2 nodes
- Backup scheduling (daily, weekly, custom)
- Restore from backup UI
- Backup verification and integrity checks

**Technical Approach:**
- Background backup service
- IPFS pinning to external nodes
- Sync protocol for multi-node setups
- Backup manifest with file CIDs

**Why It Matters:**
- Redundancy for self-hosted users
- Disaster recovery capability
- Multi-device sync use case

---

#### ⚡ **Performance & Optimization**

##### 8. **Intelligent Caching & Prefetching**
**Priority:** Medium | **Complexity:** Medium | **Value:** Medium

**Features:**
- Predictive file prefetching (based on usage patterns)
- Smart thumbnail caching
- Offline mode with service worker
- Progressive file loading (stream large files)
- CDN-like edge caching for frequently accessed files

**Technical Approach:**
- Service worker for offline support
- Usage analytics for prefetching decisions
- Browser IndexedDB for local cache
- Streaming API for large file downloads

**Why It Matters:**
- Improves UX for remote access scenarios
- Reduces bandwidth usage
- Makes PC2 feel faster and more responsive

---

##### 9. **Storage Optimization**
**Priority:** Medium | **Complexity:** Medium | **Value:** Medium

**Features:**
- Deduplication (same file = same IPFS CID = stored once)
- Compression for text files
- Storage quota management
- Storage analytics (what's using space)
- Cleanup tools (find and remove duplicates)

**Technical Approach:**
- Leverage IPFS deduplication (already happens!)
- Add compression layer for text files
- Storage usage dashboard
- Duplicate detection algorithm

**Why It Matters:**
- Maximizes storage efficiency
- Important for resource-constrained devices (Raspberry Pi)
- IPFS already provides deduplication - just need to surface it

---

#### 🎨 **User Experience**

##### 10. **Advanced File Preview**
**Priority:** Medium | **Complexity:** Low | **Value:** Medium

**Features:**
- In-browser preview for more file types (videos, audio, code)
- Markdown rendering
- Code syntax highlighting
- Image gallery view
- PDF viewer (already have pdfjs-dist!)

**Technical Approach:**
- Extend existing viewer app
- Add code editor component for syntax highlighting
- Video/audio player integration
- Markdown renderer

**Why It Matters:**
- Reduces need to download files
- Better user experience
- Leverages existing app infrastructure

---

##### 11. **Customizable UI & Themes**
**Priority:** Low | **Complexity:** Low | **Value:** Low-Medium

**Features:**
- Dark/light theme toggle
- Custom color schemes
- Desktop wallpaper customization
- Icon pack support
- Layout preferences (grid size, view modes)

**Technical Approach:**
- CSS variables for theming
- User preferences stored in database
- Theme selector UI

**Why It Matters:**
- Personalization increases user satisfaction
- Low effort, decent impact

---

#### 🔌 **Integration & Interoperability**

##### 12. **API & Webhooks**
**Priority:** Medium | **Complexity:** Medium | **Value:** High

**Features:**
- RESTful API for external integrations
- Webhook system (file created, deleted, shared)
- API key management
- Rate limiting
- API documentation

**Technical Approach:**
- Extend existing API endpoints
- Webhook queue system
- API key authentication middleware
- OpenAPI/Swagger documentation

**Why It Matters:**
- Enables automation and integrations
- Makes PC2 programmable
- Attracts developer users

---

##### 13. **Import/Export Tools**
**Priority:** Medium | **Complexity:** Medium | **Value:** Medium

**Features:**
- Import from Google Drive, Dropbox, OneDrive
- Export to standard formats
- Bulk import/export
- Migration wizard
- Backup format compatibility

**Technical Approach:**
- OAuth integration for cloud services
- Batch processing for imports
- Standard export formats (ZIP, tar)

**Why It Matters:**
- Lowers barrier to entry
- Migration path from existing services
- User onboarding tool

---

#### 📊 **Analytics & Insights**

##### 14. **Storage Analytics Dashboard**
**Priority:** Low | **Complexity:** Low | **Value:** Medium

**Features:**
- Storage usage by file type
- Storage trends over time
- Largest files identification
- Unused files detection
- IPFS node health monitoring

**Technical Approach:**
- Aggregate data from database
- Visualization components
- Background analytics calculation

**Why It Matters:**
- Helps users manage storage
- Provides insights into usage patterns
- Useful for optimization

---

##### 15. **Activity Feed & Audit Log**
**Priority:** Medium | **Complexity:** Low | **Value:** Medium

**Features:**
- Timeline of file operations
- User activity history
- Search activity log
- Export activity logs
- Privacy controls (disable logging)

**Technical Approach:**
- Activity logging in database
- Activity feed UI component
- Filtering and search for logs

**Why It Matters:**
- Transparency for users
- Useful for troubleshooting
- Security audit capability

---

#### 🛠️ **Developer & Power User Features**

##### 16. **Terminal Integration**
**Priority:** Medium | **Complexity:** Medium | **Value:** High

**Features:**
- Full terminal access to node filesystem
- Terminal in browser (already have terminal app!)
- SSH access support
- Command history
- Custom shell scripts

**Technical Approach:**
- Enhance existing terminal app
- File system integration
- Command execution API

**Why It Matters:**
- Power users expect terminal access
- Enables automation and scripting
- Differentiates from consumer cloud storage

---

##### 17. **Plugin/Extension System**
**Priority:** Low | **Complexity:** High | **Value:** High (Long-term)

**Features:**
- Plugin API for custom functionality
- Plugin marketplace
- Custom file handlers
- UI extensions
- Background workers

**Technical Approach:**
- Plugin architecture design
- Sandboxed plugin execution
- Plugin registry

**Why It Matters:**
- Extensibility without core changes
- Community-driven features
- Long-term platform growth

---

#### 🌐 **Network & Distribution**

##### 18. **PC2 Node Discovery & Federation**
**Priority:** Low | **Complexity:** High | **Value:** Very High (Long-term)

**Features:**
- Discover other PC2 nodes on network
- Federated file sharing between nodes
- Node directory/registry
- Cross-node search
- Mesh network of PC2 nodes

**Technical Approach:**
- mDNS for local discovery
- libp2p for node-to-node communication
- Distributed hash table (DHT) for node registry

**Why It Matters:**
- True decentralized network
- No central authority needed
- Revolutionary feature for self-hosted ecosystem

---

##### 19. **IPFS Gateway Integration**
**Priority:** Medium | **Complexity:** Low | **Value:** Medium

**Features:**
- Public IPFS gateway for sharing
- Custom gateway configuration
- Gateway health monitoring
- Fallback gateway support

**Technical Approach:**
- Gateway selection logic
- Health check system
- Configuration UI

**Why It Matters:**
- Enables public file sharing
- Redundancy for IPFS access
- Better reliability

---

#### 📱 **Mobile & Cross-Platform**

##### 20. **Mobile Web App**
**Priority:** Medium | **Complexity:** Medium | **Value:** High

**Features:**
- Responsive mobile UI
- Touch-optimized file operations
- Mobile file upload (camera, gallery)
- Offline mobile access
- Push notifications

**Technical Approach:**
- Mobile-first CSS
- Touch gesture support
- PWA (Progressive Web App) features
- Service worker for offline

**Why It Matters:**
- Modern expectation (mobile access)
- Increases usability
- Broader user base

---

### Potential Implementation Priority (For Future Consideration)

> **Note:** These priorities are suggestions for future evaluation. Actual implementation will depend on user feedback, technical feasibility assessment, and business priorities.

#### **Backup/Restore System** ✅ **COMPLETE** (2025-12-19)

**Status:** ✅ **FULLY FUNCTIONAL**

**Implemented:**
- ✅ Backup creation (UI + terminal): `npm run backup` or UI button
- ✅ Backup download (UI): Download backups to local device
- ✅ Backup restore (terminal): `npm run restore <backup-file>`
- ✅ Backup management API: List, download, delete, create
- ✅ UI integration: Personal Cloud settings tab
- ✅ Off-server backup strategy: Download to separate device
- ✅ Restore to new node: Works across different hardware

**Phase 3 Requirements (MUST COMPLETE for User Trust):**

**HIGH PRIORITY (Required for Phase 3):**
1. ⚠️ **User-Facing Documentation** (2-3 days)
   - In-app help and tooltips
   - Quick start guide for new users
   - Disaster recovery guide
   - Best practices (3-2-1 backup rule)
   - **Status:** Technical docs complete, user-facing docs needed

2. ⚠️ **UI Polish & Reassurance** (1-2 days)
   - Backup status indicators (last backup date, health status)
   - Clear warnings about off-server backup storage
   - Success confirmations and progress feedback
   - Backup verification before restore
   - **Status:** Basic UI complete, polish needed

3. ⚠️ **Testing & Validation** (1-2 days)
   - End-to-end restore testing
   - Cross-version compatibility testing
   - Multi-user restore verification
   - Failure scenario testing
   - **Status:** Manual testing done, automated tests needed

**MEDIUM PRIORITY (Should Have in Phase 3):**
4. ⚠️ **Automated Backup Scheduling** (2-3 days)
   - Cron job integration
   - Backup retention policy
   - Backup health monitoring
   - **Status:** Manual only, automation needed

5. ✅ **UI Restore Feature** (Phase 2.5 - **COMPLETE**)
   - ✅ Upload backup file via browser (drag & drop or file picker)
   - ✅ Restore via UI (no SSH required)
   - ✅ Progress indicators (upload and processing)
   - **Status:** ✅ **COMPLETE** - One-click restore fully functional (Phase 2.5)

**LOW PRIORITY (Phase 3.5 or Later):**
6. ⚠️ **Network Restore** (2-3 days)
   - Direct node-to-node restore
   - Automated transfer
   - **Status:** Manual transfer required

**Documentation Files:**
- ✅ `/docs/PC2_NODE_BACKUP_STRATEGY.md` - Complete backup strategy (technical)
- ✅ `/docs/PC2_NODE_RESTORE_TO_NEW_NODE.md` - Restore to new node guide (technical)
- ✅ `/docs/PC2_NODE_UPGRADE_AND_MAINTENANCE_STRATEGY.md` - Upgrade strategy
- ⚠️ **User-facing documentation** - Needed for Phase 3

**Conclusion:** 
- ✅ **Core functionality is complete and production-ready**
- ⚠️ **Phase 3 MUST add user-facing documentation, UI polish, and comprehensive testing**
- ⚠️ **User trust requires clear communication and reassurance features**
- ⚠️ **Backup/restore is critical for user confidence - not optional**

---

#### **Potential Phase 2.5: Essential Enhancements** (Before Phase 3)
1. ✅ **Permanent Delete from Trash** - ✅ COMPLETE
2. ✅ **Advanced Search & Indexing** - **Backend Complete** (UI filters pending, low priority)
3. ✅ **File Versioning** - **Backend Complete** (Frontend UI pending)
4. 🔄 **End-to-End Encryption** - Critical for privacy-focused users

#### **Potential Phase 3.5: User Experience** (After Packaging)
5. **Decentralized File Sharing** - Core differentiator
6. **Storage Analytics Dashboard** - Helps users manage storage
7. **Advanced File Preview** - Improves daily UX
8. **Multi-User Support** - Enables team/family use

#### **Potential Phase 4+: Advanced Features**
9. **Backup & Sync** - Redundancy and multi-device (Note: Core backup/restore complete in Phase 2.5, Phase 4 adds sync features)
10. **API & Webhooks** - Developer features
11. **PC2 Node Federation** - Revolutionary decentralized network

---

### Quick Wins (Low Effort, High Impact)

1. **Storage Usage Dashboard** - Simple aggregation, high value
2. **File Type Icons** - Better visual organization
3. **Keyboard Shortcuts** - Power user feature
4. **Bulk Operations** - Select multiple files, delete/move
5. **Recent Files** - Quick access to recently used files
6. **Favorites/Bookmarks** - Pin frequently accessed folders
7. **File Comments/Notes** - Add metadata to files
8. **Custom File Properties** - User-defined metadata fields

---

---

## 📍 Current Status & Next Steps (Updated: 2025-12-19)

### ✅ Recently Completed

**Phase 2.4: Advanced Search & Indexing** - ✅ Complete
- ✅ Full-text search with SQLite FTS5
- ✅ IPFS CID search capability
- ✅ Background content indexing worker
- ✅ PDF text extraction (mandatory)
- ✅ Advanced filtering (file type, size, date) - backend ready
- ✅ Search UI simplified (removed advanced filters toggle button)

**Phase 2.5: File Versioning** - ✅ Complete (2025-12-19)
- ✅ Automatic version snapshots on file changes
- ✅ Version API endpoints (list, retrieve, restore)
- ✅ IPFS-based immutable version storage
- ✅ Rollback functionality
- ✅ Version history preserved on file rename/move
- ✅ Frontend UI complete (version browser in Properties window)

**Backup & Restore System** - ✅ Core Complete (2025-12-19), ✅ Critical Files Complete (2026-01-25)
- ✅ Backup creation (UI + terminal): `npm run backup` or Settings UI
- ✅ Backup download (UI): Download to local device
- ✅ Backup restore (terminal): `npm run restore <backup-file>`
- ✅ Backup management API: Full CRUD operations
- ✅ UI integration: Personal Cloud settings tab
- ✅ Off-server backup strategy: Download to separate device
- ✅ Restore to new node: Cross-hardware restore works
- ✅ Database migrations: Automatic schema upgrades
- ✅ **Complete Node Restoration** (2026-01-25): All critical files now backed up and restored:
  - ✅ Encryption key (`data/encryption.key`) - Enables API key decryption
  - ✅ Node configuration (`data/node-config.json`) - Owner wallet, access control, tethered DIDs
  - ✅ Boson identity (`data/identity.json`) - Node keypair and DID
  - ✅ Username registration (`data/username.json`) - Registered Boson username
  - ✅ Setup completion flag (`data/setup-complete`) - Skips setup wizard on restore
  - ✅ SQLite WAL files (`pc2.db-wal`, `pc2.db-shm`) - Database transaction logs
  - ✅ Backup verification - Post-backup archive verification
  - ✅ Restore verification - Post-restore file validation
  - ✅ Secure permissions - Encryption key restored with 0600 permissions
- ⚠️ **Phase 3 Required:** User documentation, UI polish, testing, automated scheduling

**Infrastructure Improvements** - ✅ Complete (2025-12-19)
- ✅ Frontend bundle auto-copying (prevents stale bundle issues)
- ✅ Binary data support for `/writeFile` endpoint (images, PDFs)
- ✅ Enhanced error handling and logging

### 🎯 Recommended Next Steps

**Option 1: Phase 3 - Backup/Restore Polish & Documentation** (User Trust & Safety)
- ⚠️ User-facing documentation (in-app help, quick guides)
- ⚠️ UI polish (status indicators, warnings, confirmations)
- ⚠️ Comprehensive testing (end-to-end, cross-version, failure scenarios)
- ⚠️ Automated backup scheduling (cron integration)
- **Estimated Time:** 1 week
- **Priority:** **HIGH** - Critical for user trust

**Option 2: Phase 3 - Packaging** (Production Readiness)
- Docker package
- Debian package (Raspberry Pi)
- macOS package
- Setup wizard with backup guidance
- **Estimated Time:** 1 week

**Option 3: Quick Wins from List** (Low Effort, High Impact)
- **Recent Files** - Track `last_accessed`, add UI component (1-2 days)
- **Bulk Operations** - Multi-select delete/move (2-3 days)
- **Storage Usage Dashboard** - Simple aggregation query (1-2 days)

### 💡 Recommendation

**Priority 1: Phase 3 Backup/Restore Polish** - **CRITICAL for user trust and data safety**
- Users must feel reassured their data is protected
- Clear documentation and UI polish are essential
- Comprehensive testing ensures reliability
- **This is NOT optional** - user confidence depends on it

**Priority 2: Phase 3 Packaging** - Production deployment readiness

**Priority 3: Quick Wins** - User experience improvements

**Note:** Backup/restore core functionality is complete, but Phase 3 polish and documentation are **mandatory** for user trust. This should be completed before or alongside packaging.

---

### Technical Debt & Foundation Work

Before adding many features, consider:

1. **Testing Infrastructure** - Unit tests, integration tests
2. **Error Monitoring** - Sentry or similar for production
3. **Performance Monitoring** - Metrics and profiling
4. **Documentation** - API docs, user guides
5. **Migration Tools** - Database migrations, data upgrades
6. **Configuration Management** - Centralized config system

---

### 🔧 Puter SDK & Initialization Architecture Issues (2026-01-19)

**Status:** Workaround Implemented | **Priority:** Medium | **Effort:** High to fix properly

#### Problem Discovery

During investigation of excessive console logging and duplicate desktop item rendering, we discovered a critical architectural issue:

**Root Cause:** The Puter SDK (`v2/`) creates **hidden iframes** that load copies of the main page. Each iframe has its own isolated JavaScript execution context where:
- `window` properties don't persist across contexts
- DOM elements don't persist across contexts  
- Module-level guards fail (each context starts fresh)
- Standard singleton patterns break

This caused:
- Multiple `initgui()` executions (10-20+ times per page load)
- Duplicate desktop items appearing
- Excessive console spam
- Wasted API calls and resources

#### Current Workaround (Implemented)

We implemented a multi-layer guard system:

1. **Iframe Detection** (`window !== window.top`) - Skips initialization if running inside an iframe
2. **Particle-Auth Page Detection** - Skips if on `/particle-auth` route
3. **DOM-based Guard** - Creates a hidden `<div>` element as backup (DOM persists even when window doesn't)
4. **Module-level Throw** - `gui.js` throws error to halt duplicate script execution

**Files Modified:**
- `src/gui/src/index.js` - Added throw for duplicate execution
- `src/gui/src/initgui.js` - Iframe detection + DOM guard
- `src/gui/src/services/WalletService.js` - Global iframe creation flag

#### Proper Fix (Future Work)

To properly address this, consider:

1. **Investigate Puter SDK Iframe Creation**
   - Why does `v2/` create hidden iframes that load the full application?
   - Can this be disabled or configured?
   - Is this intentional behavior (sandboxing) or a bug?

2. **SDK Forking/Modification**
   - Fork `@puter/puter-js` and modify to prevent iframe-based reloading
   - Or contribute upstream fix if this is unintended behavior

3. **Lazy Initialization Pattern**
   - Delay all GUI initialization until explicitly triggered
   - Don't auto-run on script load
   - Provides more control over when/how initialization happens

4. **WebSocket Consolidation**
   - The SDK creates its own socket.io connection
   - GUI creates another connection
   - Consolidate to single connection to prevent duplicate events
   - (Partially addressed - see socket deduplication in UIDesktop.js)

#### Related Issues to Address

1. **`.profile` 404 Error** - Every page load attempts to read `/Public/.profile` which doesn't exist
   - Fix: Create default profile file OR suppress error gracefully

2. **WebSocket Connection Instability**
   ```
   WebSocket connection to 'ws://localhost:4200/socket.io/...' failed: 
   WebSocket is closed before the connection is established.
   ```
   - Multiple connection attempts during initialization
   - Consider connection pooling or retry logic

3. **Particle Network CORS Errors** - External API issues with `particle.network` and `walletconnect.org`
   - Not related to our code
   - May need server-side proxy for production

#### Lessons Learned

1. **Standard Patterns Fail in Multi-Context Environments** - Singletons, module guards, window flags all assume single JS context
2. **DOM is More Persistent Than Window** - When window properties fail, DOM elements can serve as guards
3. **Iframe Detection is Essential** - Always check `window !== window.top` when dealing with embedded SDKs
4. **Debug Logging Must Be Conditional** - Use `DEBUG_FLAG && console.log()` pattern, not unconditional logging

---

## 🔧 Development Rules & Best Practices

### ⚠️ CRITICAL: Full System Restart Process (2025-12-19)

**MANDATORY:** When user requests "restart everything" or "get latest build", **ALWAYS** follow this complete process:

#### Standard Full Restart Sequence

```bash
# 1. Kill all existing processes
lsof -ti:4200 | xargs kill -9 2>/dev/null || true
pkill -f "node.*pc2-node" || pkill -f "npm.*start" || true

# 2. Rebuild Backend (TypeScript → JavaScript)
cd pc2-node
npm run build:backend

# 3. Rebuild Frontend (Source → Bundle)
npm run build:frontend

# 4. Restart Server
npm start
```

#### Why This Matters

**Problem:** Partial restarts waste time:
- ❌ Only restarting server → Old compiled code runs
- ❌ Only rebuilding frontend → Backend still has old code
- ❌ Not killing processes → Port conflicts, stale connections
- ❌ Browser cache → User sees old frontend bundle

**Solution:** **ALWAYS** do complete rebuild + restart:
- ✅ Kill all processes (clean slate)
- ✅ Rebuild backend (fresh compiled code)
- ✅ Rebuild frontend (fresh bundle)
- ✅ Restart server (loads new code)
- ✅ User hard refreshes browser (Cmd+Shift+R)

#### When to Use Full Restart

**ALWAYS use full restart when:**
- User says "restart everything" or "get latest build"
- After making changes to both backend and frontend
- When user reports "not seeing changes" or "old code"
- Before testing after any code changes
- When switching between tasks

**Never skip steps** - Partial restarts cause confusion and waste time.

#### Verification After Restart

After full restart, verify:
```bash
# Check bundle timestamp (should be recent)
ls -lh pc2-node/test-fresh-install/frontend/bundle.min.js

# Check server is running
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4200
# Should return: 200

# Check compiled backend exists
ls -lh pc2-node/test-fresh-install/dist/index.js
```

**This process prevents:** Hours of debugging when code is correct but build/restart was incomplete.

---

### Frontend Bundle Management (CRITICAL - 2025-12-19)

**Rule:** Frontend bundle MUST always be copied to serving directory after build

**Why:**
- Frontend is built in `src/gui/dist/` but server serves from `pc2-node/test-fresh-install/frontend/`
- Stale bundles cause debugging confusion ("code not working" when it's just old bundle)
- This caused significant debugging time waste during File Versioning implementation

**Solution:**
- `npm run build` in `src/gui/` automatically runs `build-frontend.js` to copy bundle
- Modified `src/gui/package.json` so `build` script includes copy step
- Always verify bundle timestamp matches before testing

**Manual Copy Command:**
```bash
node pc2-node/test-fresh-install/scripts/build-frontend.js
```

**Never:**
- Serve stale bundles
- Assume bundle is up-to-date without checking
- Skip bundle copy step

**This rule prevents:** Hours of debugging confusion when code is correct but bundle is stale.

---

### Innovation Opportunities

**Unique to PC2 (Leveraging IPFS + Self-Hosted):**

1. **Content-Addressed Sharing** - Share files by CID, not URL
2. **Immutable File History** - IPFS provides natural versioning
3. **Decentralized Backup** - Backup to IPFS network, not single server
4. **Zero-Knowledge Sync** - Encrypted sync between nodes
5. **Proof of Storage** - Cryptographic proofs of file integrity
6. **Distributed Search** - Search across federated PC2 nodes
7. **Blockchain Integration** - File ownership on-chain, storage off-chain

---

**Status:** Phase 2 ✅ **100% COMPLETE** - Core functionality working, real-time file operations fully working  
**Current Status (2025-12-21):**
- ✅ **Phase 2.5 Complete:** One-click restore, UI polish, comprehensive help documentation
- 🚧 **Phase 3 In Progress:** Automated scheduling, backup verification, process manager integration
- 📋 **Next Action:** Complete Phase 3 remaining items (automated scheduling, verification tools) OR proceed to Packaging & Deployment

---

## 🛡️ CRITICAL: Backup/Restore System - User Trust & Safety Requirements

**Last Updated:** 2026-01-25  
**Status:** Phase 2.5 Complete ✅, Critical Files Backup Complete ✅, Phase 3 Polish In Progress  
**Priority:** **CRITICAL** - Essential for user trust and data safety

### Current Implementation (Phase 2.5 - ✅ Complete)

**Core Functionality Working:**
- ✅ Backup creation (UI button + terminal: `npm run backup`)
- ✅ Backup download (UI: Settings → Personal Cloud → Backup & Restore)
- ✅ Backup restore (terminal: `npm run restore <backup-file>`)
- ✅ **One-Click Web UI Restore** (NEW - Phase 2.5) - Upload backup file via browser, restore without SSH
- ✅ Backup management API (list, create, download, delete, restore)
- ✅ UI integration (full backup management in Settings)
- ✅ Off-server backup strategy (download to separate device)
- ✅ Cross-node restore (works across different hardware/servers)
- ✅ Database migration compatibility (automatic schema upgrades)
- ✅ **Complete Node Restoration** (NEW - 2026-01-25) - All critical files backed up and restored:
  - ✅ Encryption key (`data/encryption.key`) - Master key for API key decryption (restored with 0600 permissions)
  - ✅ Node configuration (`data/node-config.json`) - Owner wallet, allowed wallets, tethered DIDs
  - ✅ Boson identity (`data/identity.json`) - Node Ed25519 keypair, node ID, encrypted mnemonic
  - ✅ Username registration (`data/username.json`) - Registered Boson username (e.g., user.ela.city)
  - ✅ Setup completion flag (`data/setup-complete`) - Skips setup wizard on restore
  - ✅ SQLite WAL files - Database transaction logs for consistency
  - ✅ Backup verification - Post-backup archive integrity check
  - ✅ Restore verification - Post-restore file validation and permissions check

**Phase 2.5 Enhancements (Completed 2025-12-21):**
- ✅ **One-Click Restore Feature** - Users can upload backup files through web UI and restore without SSH/terminal
- ✅ **Backup Status Indicators** - Visual health status (green/yellow/red) showing last backup date
- ✅ **Help Documentation** - Comprehensive in-app help dialog with step-by-step instructions
- ✅ **Multi-Account Restore Clarification** - Documentation explains all accounts are restored, privacy maintained
- ✅ **Server Restart Instructions** - Clear step-by-step guide for non-technical users
- ✅ **Off-Server Storage Warnings** - Prominent warnings about downloading backups to external devices
- ✅ **Improved User Feedback** - Better success/error messages, progress indicators for restore
- ✅ **Technical Fixes** - Fixed `isPC2Mode` scope issue, added SDK proxying for terminal apps

**Critical Files Backup Enhancement (Completed 2026-01-25):**
- ✅ **Complete Node Restoration** - Backup now includes all critical files for full "pick up where you left off" restore:
  - Admin wallet ownership preserved
  - All authorized accounts preserved
  - DID tethering intact
  - AI API keys decrypt correctly
  - Boson network identity preserved
  - Username registration preserved
  - Setup wizard skipped on restore
- ✅ **Backup Verification** - Post-backup archive integrity check confirms all files included
- ✅ **Restore Verification** - Post-restore validation confirms all files present and permissions correct
- ✅ **Secure Permissions** - Encryption key restored with 0600 permissions for security

### Phase 3 Requirements (MANDATORY for User Trust)

**Users must feel reassured and safe.** This requires:

#### HIGH PRIORITY (Must Complete in Phase 3):

1. **User-Facing Documentation** (2-3 days) - **CRITICAL**
   - [x] In-app help and tooltips ✅ (Phase 2.5 - Help dialog with comprehensive instructions)
   - [x] Quick start guide (first backup, where to store) ✅ (Phase 2.5 - Included in help dialog)
   - [x] Disaster recovery guide (what to do if server fails) ✅ (Phase 2.5 - "New Server Scenario" section)
   - [ ] Best practices (3-2-1 backup rule, scheduling) - Partially done, needs expansion
   - **Status:** ✅ Major progress - comprehensive help system implemented

2. **UI Polish & Reassurance** (1-2 days) - **HIGH PRIORITY**
   - [x] Backup status indicators (last backup date, health status) ✅ (Phase 2.5 - Visual indicators with icons)
   - [x] Clear warnings ("Backups on server will be lost if server fails") ✅ (Phase 2.5 - Prominent warning box)
   - [x] Success confirmations ("Backup created successfully") ✅ (Phase 2.5 - Improved feedback)
   - [ ] Backup health monitoring (warn if no backup in X days) - Status indicator shows this, but needs automated alerts
   - **Status:** ✅ Major progress - UI polish largely complete

3. **Comprehensive Testing** (1-2 days) - **HIGH PRIORITY**
   - [ ] End-to-end restore testing (backup → restore → verify)
   - [ ] Cross-version testing (v1.0 backup to v1.1 node)
   - [ ] Multi-user restore verification (user isolation preserved)
   - [ ] Failure scenario testing (corrupted backup, incomplete restore)
   - **Status:** Manual testing done, automated tests needed

#### MEDIUM PRIORITY (Should Complete in Phase 3):

4. **Automated Backup Scheduling** (2-3 days)
   - [ ] Cron job integration
   - [ ] Backup retention policy (keep last N backups)
   - [ ] Backup health monitoring
   - [ ] Notifications (success/failure alerts)
   - **Status:** Manual only, automation needed

5. **UI Restore Feature** (2-3 days)
   - [x] Upload backup file via browser ✅ (Phase 2.5 - Drag & drop or file picker)
   - [x] Restore via UI (no SSH required) ✅ (Phase 2.5 - One-click restore implemented)
   - [x] Progress indicators ✅ (Phase 2.5 - Upload and processing progress)
   - [ ] Restore preview (show what will be restored) - Not implemented yet
   - **Status:** ✅ **COMPLETE** - One-click restore fully functional (Phase 2.5)

### User Safety & Reassurance Checklist

**Must Have (Phase 3):**
- [x] Clear explanation of backup importance ✅ (Phase 2.5 - Help dialog)
- [x] Easy-to-find backup management UI ✅ (Phase 2.5 - Settings → PC2 tab)
- [x] Step-by-step restore instructions ✅ (Phase 2.5 - Detailed in help dialog)
- [x] Warnings about off-server backup storage ✅ (Phase 2.5 - Prominent warning box)
- [x] Backup status indicators ✅ (Phase 2.5 - Visual health status)
- [x] Success confirmations ✅ (Phase 2.5 - Improved feedback)
- [ ] Comprehensive testing completed - Manual testing done, automated tests needed
- [x] User-facing documentation ✅ (Phase 2.5 - Comprehensive help system)

**Should Have (Phase 3):**
- [ ] Automated backup scheduling - Not implemented yet
- [ ] Backup health monitoring - Status indicator shows health, but needs automated alerts
- [x] UI restore feature ✅ (Phase 2.5 - **COMPLETE** - One-click restore implemented)
- [ ] Backup verification tools - Not implemented yet

### Success Criteria

**Phase 3 is complete when:**
- ✅ Users can easily create, download, and restore backups
- ✅ Users understand backup importance and best practices
- ✅ Users feel confident about data safety
- ✅ Backup/restore process is tested and reliable
- ✅ Clear warnings and guidance are in place
- ✅ Automated backups are available (recommended)

### Documentation

**Technical Docs (Complete):**
- ✅ `/docs/PC2_NODE_BACKUP_STRATEGY.md` - Complete backup strategy
- ✅ `/docs/PC2_NODE_RESTORE_TO_NEW_NODE.md` - Restore to new node guide
- ✅ `/docs/PC2_NODE_UPGRADE_AND_MAINTENANCE_STRATEGY.md` - Upgrade strategy
- ✅ `/docs/PHASE3_BACKUP_RESTORE_REQUIREMENTS.md` - Phase 3 requirements

**User-Facing Docs (Needed):**
- ⚠️ In-app help system
- ⚠️ Quick start guide
- ⚠️ Disaster recovery guide
- ⚠️ Best practices documentation

### Why This Matters

**User Trust:**
- Users must feel confident their data is protected
- Backup/restore is the safety net for user data
- Clear communication builds trust
- Reliable functionality ensures confidence

**Data Safety:**
- Backup/restore prevents data loss
- Off-server backups survive hardware failures
- Cross-node restore enables hardware migration
- Automated backups ensure regular protection

**Reputation:**
- Unreliable backup system damages user confidence
- Clear documentation shows professionalism
- Comprehensive testing ensures reliability
- Proactive safety measures demonstrate care

### Phase 3 Priority

**Backup/Restore polish is NOT optional** - it's a core requirement for user trust. Phase 3 must ensure:

1. **Users understand** backup importance (documentation)
2. **Users can easily** create and manage backups (UI polish)
3. **Users feel confident** about data safety (testing + reassurance)
4. **Users know how** to restore if needed (clear instructions)

**Estimated Effort:** 
- Phase 2.5: ✅ **COMPLETE** (1 week) - One-click restore, UI polish, help documentation
- Phase 3 Remaining: ~1 week (automated scheduling, verification tools, process manager integration)

**Phase 2.5 Completion Summary (2025-12-21):**
- ✅ One-click web UI restore feature
- ✅ Backup status indicators with health monitoring
- ✅ Comprehensive in-app help system
- ✅ Multi-account restore clarification
- ✅ Server restart instructions for non-technical users
- ✅ UI polish (warnings, feedback, progress indicators)
- ✅ Technical fixes (isPC2Mode scope, SDK proxying)

**Related Section:** See "Phase 3: Packaging & Deployment" above for detailed requirements.

---

## 📚 Technical Knowledge Base: Critical Implementation Patterns

### Phase 2.5: One-Click Restore Feature - Complete Solution

**Date:** 2025-12-21  
**Status:** ✅ Implemented and Working  
**Feature:** Web UI Restore for Backup & Restore System

**Implementation Summary:**
- **Backend:** Added `/api/backups/restore` endpoint with file upload (multipart/form-data, 10GB max)
- **Frontend:** Added "Restore from Backup" section with drag & drop file upload, progress indicators, and status messages
- **User Experience:** Users can now restore backups through web UI without SSH/terminal access
- **Documentation:** Comprehensive help dialog with step-by-step instructions, multi-account clarification, server restart guide

**Key Files Modified:**
- `pc2-node/test-fresh-install/src/api/backup.ts` - Added `restoreBackup()` function
- `pc2-node/test-fresh-install/src/api/index.ts` - Registered restore endpoint with multer upload
- `src/gui/src/UI/Settings/UITabPC2.js` - Added restore UI, help dialog, status indicators
- `pc2-node/test-fresh-install/src/static.ts` - Added SDK proxying for terminal apps
- `docs/BACKUP_RESTORE_AUDIT.md` - Comprehensive audit and recommendations

**Technical Challenges Solved:**
1. **File Upload Handling:** Used multer with 10GB limit for large backup files
2. **Server Process Management:** Restore script stops server automatically, user restarts manually
3. **Progress Tracking:** Frontend shows upload and processing progress
4. **Error Handling:** Comprehensive validation and user-friendly error messages
5. **Multi-Account Support:** Clarified that all accounts are restored, privacy maintained
6. **Scope Issues:** Fixed `isPC2Mode` function scope for access in `on_show` handler

**Known Issues:**
- Terminal app showing white screen - SDK initialization issue (separate from restore feature)
- Server restart still requires manual SSH access (Phase 3 could automate this with process manager)

**Next Steps (Phase 3):**
- Automated backup scheduling
- Backup verification tools
- Process manager integration for automatic server restart
- Full node backup option (include entire installation)

---

### Image Editor Save Functionality - Complete Solution

**Date:** 2025-12-19  
**Status:** ✅ Implemented and Working  
**Apps Affected:** Viewer (Image Editor)

#### Problem Statement

The Viewer app (image editor using Pintura) was unable to save edited images. The save operation would appear to succeed but changes were not persisted. Root causes identified:

1. **Authentication Token Missing**: Viewer app iframe requests weren't including authentication tokens
2. **Binary Data Handling**: SDK's `curfile.write()` method didn't handle Blob objects correctly for binary image data
3. **UUID to Path Conversion**: Case sensitivity mismatch between frontend UUID format (`desktop`) and database paths (`Desktop`)
4. **File Lookup Failure**: Direct path conversion failed, no fallback mechanism existed

#### Complete Solution Implemented

**1. Frontend Fixes (Viewer.js):**

```javascript
// ✅ Get auth token from URL params or SDK
const urlParams = new URLSearchParams(window.location.search);
let authToken = urlParams.get('puter.auth.token');
if (!authToken && typeof puter !== 'undefined' && puter.getAuthToken) {
  authToken = puter.getAuthToken();
}

// ✅ Include auth token in fetch request headers
const headers = {
  'Content-Type': image.type || 'image/png'
};
if (authToken) {
  headers['Authorization'] = `Bearer ${authToken}`;
}

// ✅ CRITICAL: Use direct write_url for binary data (Blobs)
// SDK's write() method doesn't handle Blobs correctly
const response = await fetch(writeUrl, {
  method: 'POST',
  headers: headers,
  body: image // Send Blob directly as binary
});

// ✅ Reload image with cache-busting after save
const originalURL = new URL(curfile.readURL, window.location.origin);
const fileParam = originalURL.searchParams.get('file');
const cacheBuster = result.ipfs_hash 
  ? `_cid=${result.ipfs_hash.substring(0, 16)}`
  : `_t=${Date.now()}`;
const newReadURL = `${originalURL.pathname}?file=${encodeURIComponent(fileParam)}&${cacheBuster}`;
await $(editor).pintura("loadImage", newReadURL);
```

**2. Backend Fixes (other.ts - handleWriteFile):**

```typescript
// ✅ Enhanced UUID to path conversion with case-insensitive fallback
const uuidPath = fileUid.replace(/^uuid-+/, '');
let potentialPath = '/' + uuidPath.replace(/-/g, '/');

// Try direct path conversion first
let existingMetadata = filesystem.getFileMetadata(potentialPath, req.user.wallet_address);

// ✅ Fallback: Database UUID lookup (handles case sensitivity)
if (!existingMetadata) {
  const allFiles = db.listFiles('/', req.user.wallet_address);
  for (const file of allFiles) {
    const fileUuid = `uuid-${file.path.replace(/\//g, '-')}`;
    // ✅ Case-insensitive comparison
    if (fileUuid.toLowerCase() === fileUid.toLowerCase()) {
      existingMetadata = file;
      potentialPath = file.path; // Use correct casing from database
      break;
    }
  }
}

// ✅ Handle binary data correctly
if (Buffer.isBuffer(req.body) && req.body.length > 0) {
  fileContent = req.body; // Use binary buffer directly
}

// ✅ Broadcast item.updated event for live thumbnail refresh
if (updatedMetadata.mime_type?.startsWith('image/')) {
  const cacheBuster = updatedMetadata.ipfs_hash 
    ? `_cid=${updatedMetadata.ipfs_hash.substring(0, 16)}`
    : `_t=${Date.now()}`;
  const thumbnail = `${baseUrl}/read?file=${encodeURIComponent(updatedMetadata.path)}&${cacheBuster}`;
  
  broadcastItemUpdated(io, req.user.wallet_address, {
    uid: fileUid,
    name: updatedMetadata.path.split('/').pop() || '',
    path: updatedMetadata.path,
    size: updatedMetadata.size,
    modified: new Date(updatedMetadata.updated_at).toISOString(),
    thumbnail: thumbnail, // Include thumbnail with cache-busting
    type: updatedMetadata.mime_type,
    is_dir: false
  });
}
```

**3. Authentication Middleware Fixes (middleware.ts):**

```typescript
// ✅ Extract wallet address from UUID query parameter (for /writeFile requests)
const pathToCheck = (req.query.uid as string) || // Check uid first for writeFile
                    (req.query.file as string) ||
                    req.path;

// ✅ Extract wallet from UUID format: uuid--0x{40 hex chars}-...
let walletMatch = pathToCheck.match(/uuid--(0x[a-fA-F0-9]{40})/);
if (walletMatch && walletMatch[1]) {
  mockWalletAddress = walletMatch[1];
  // ✅ Find existing session for wallet and use real session
  const existingSession = db.getSessionByWallet(mockWalletAddress);
  if (existingSession) {
    req.user = {
      wallet_address: existingSession.wallet_address,
      smart_account_address: existingSession.smart_account_address,
      session_token: existingSession.token
    };
    return next();
  }
}
```

**4. Frontend Thumbnail Update (UIDesktop.js):**

```javascript
// ✅ Always update thumbnails (even for same client)
const isThumbnailUpdate = item.thumbnail && !item.is_dir;
if (!isThumbnailUpdate && item.original_client_socket_id === window.socket.id) {
  return; // Skip only non-thumbnail updates from same client
}

// ✅ Use provided thumbnail directly (includes cache-busting)
if (item.thumbnail && !item.is_dir) {
  new_icon = item.thumbnail; // Use cache-busted thumbnail URL
}

// ✅ Force reload using Image object preload
const img = new Image();
img.onload = function() {
  element.attr('src', cacheBuster); // Update after successful load
};
img.src = cacheBuster; // Trigger load

// ✅ Refresh parent container for thumbnail updates
if (isThumbnailUpdate) {
  refresh_item_container(parentContainer[0], { consistency: 'strong' });
}
```

#### Key Principles Learned

1. **Binary Data Requires Direct Fetch**: SDK's `write()` method doesn't handle Blob objects correctly - always use direct `fetch()` with `write_url` for binary data
2. **Authentication in Iframes**: App iframes need explicit auth token in request headers - extract from URL params or SDK
3. **Case-Insensitive UUID Matching**: Frontend UUIDs may use different casing than database paths - always use case-insensitive comparison
4. **Database Fallback for File Lookup**: Direct path conversion can fail - always have UUID-based database lookup as fallback
5. **Cache-Busting for Live Updates**: Use IPFS hash or timestamp in thumbnail URLs to force browser refresh
6. **Container Refresh for Thumbnails**: For live thumbnail updates, refresh the parent container to ensure UI consistency

#### Files Modified

**Frontend:**
- `src/backend/apps/viewer/js/Viewer.js` - Direct fetch with auth, cache-busting reload
- `src/gui/src/UI/UIDesktop.js` - Enhanced `item.updated` handler with thumbnail support

**Backend:**
- `pc2-node/test-fresh-install/src/api/other.ts` - UUID lookup fallback, case-insensitive matching, thumbnail broadcast
- `pc2-node/test-fresh-install/src/api/middleware.ts` - UUID wallet extraction for mock tokens
- `pc2-node/test-fresh-install/src/websocket/events.ts` - Enhanced `broadcastItemUpdated` with thumbnail support

#### Testing Results

✅ Image save now works correctly:
- Authentication token included in requests
- Binary Blob data sent correctly
- File found via case-insensitive UUID lookup
- Image reloads with updated content after save
- Thumbnail updates via WebSocket broadcast

---

### Text Editor Save & Read Fixes (2025-01-19)

**Problem:** Text files were not saving correctly - initial save worked, but subsequent saves didn't overwrite the file, and reopening showed stale content.

**Root Causes:**
1. `puter.fs.write()` was not properly overwriting files - needed to use `writeURL` (signed URL) instead
2. Read operations were using stale `readURL` from URL params instead of fetching fresh content
3. Path conversion from `~` format to full paths wasn't working correctly for read operations

**Solution Implemented:**

**1. Enhanced Write Operation (editor/index.html - curfile.write()):**

```javascript
// ✅ Priority 1: Use writeURL from URL params (signed URL for proper overwrite)
const writeURL = urlParams.get('puter.item.write_url');
if (writeURL) {
  const blobData = typeof data === 'string' ? new Blob([data], { type: 'text/plain' }) : data;
  const response = await fetch(writeURL, {
    method: 'PUT',
    body: blobData,
    headers: { 'Content-Type': blobData.type || 'text/plain' }
  });
  // ✅ Verify write by reading back with fresh readURL
  const verifyStatResult = await puter.fs.stat({ path: writePath, consistency: 'strong' });
  // Extract fresh readURL and verify content matches
}
// ✅ Fallback: Use puter.fs.write() if writeURL not available
```

**2. Enhanced Read Operation (editor/index.html - puter.fs.read() patch):**

```javascript
// ✅ Priority 1: Always try stat() first to get fresh readURL
const itemUid = urlParams.get('puter.item.uid');
if (itemUid && puter.fs.stat) {
  const statResult = await puter.fs.stat({ uid: itemUid, consistency: 'strong' });
  const freshReadURL = extractReadURL(statResult); // Handles nested structures
  if (freshReadURL) {
    const url = new URL(freshReadURL);
    url.searchParams.set('_t', Date.now()); // Cache-busting
    return await fetch(url.toString()).then(r => r.blob());
  }
}
// ✅ Priority 2: Fallback to readURL from URL params with cache-busting
const readURL = urlParams.get('puter.item.read_url');
if (readURL) {
  const url = new URL(readURL);
  url.searchParams.set('_t', Date.now());
  return await fetch(url.toString()).then(r => r.blob());
}
// ✅ Priority 3: Use fullPath from URL params
// ✅ Priority 4: Convert ~ path using username
```

**3. Path Handling (launch_app.js):**

```javascript
// ✅ Added fullPath to URL params when launching editor
urlParams.set('puter.item.fullPath', item.path); // Full backend path
// This ensures read operations can use full path instead of ~ format
```

**4. Thumbnail Update Fix (UIDesktop.js):**

```javascript
// ✅ Refresh parent container for thumbnail updates
if (isThumbnailUpdate) {
  refresh_item_container(parentContainer[0], { consistency: 'strong' });
}
```

#### Key Principles Learned

1. **WriteURL for Overwrites**: `puter.fs.write()` may not handle overwrites correctly - always use `writeURL` (signed URL) from URL params for guaranteed overwrite behavior
2. **Fresh Content on Read**: Always try `stat()` first to get fresh `readURL` - URL param `readURL` can be stale
3. **Cache-Busting Essential**: Add timestamp to `readURL` queries to bypass browser/CDN caching
4. **Path Conversion**: Always provide `fullPath` in URL params alongside `~` path for reliable path resolution
5. **Verification After Write**: Immediately verify writes by reading back with fresh `readURL` to confirm content was saved

#### Files Modified

**Frontend:**
- `src/backend/apps/editor/index.html` - Enhanced `curfile.write()` to use `writeURL`, improved `puter.fs.read()` patch for fresh content, added verification
- `src/gui/src/IPC.js` - Enhanced file save handler with proper overwrite support, added `fullPath` to response
- `src/gui/src/helpers/launch_app.js` - Added `fullPath` to URL params when launching editor apps
- `src/gui/src/UI/UIDesktop.js` - Fixed thumbnail update handling with container refresh

#### Testing Results

✅ Text file save and read now works correctly:
- Initial save works - file is created with content
- Subsequent saves overwrite correctly - uses `writeURL` for proper overwrite
- Reopening shows latest content - uses fresh `readURL` from `stat()` with cache-busting
- Verification confirms written content matches read content
- Thumbnail updates immediately after save

#### Applicability to Other Apps

**Text Editor (editor.js):** ✅ **COMPLETE - 2025-01-19**
- ✅ **Fixed**: Text file save and read functionality fully working
- ✅ **Implementation**: 
  - Uses `writeURL` from URL params for proper overwrite handling (PUT request to signed URL)
  - Falls back to `puter.fs.write()` if `writeURL` not available
  - Read operation prioritizes fresh `readURL` from `stat()` for latest content
  - Falls back to URL param `readURL` with cache-busting for initial opens
  - Path conversion from `~` format to full paths handled correctly
- ✅ **Key Fixes**:
  - **Save**: Uses `writeURL` from URL params (signed URL) instead of `puter.fs.write()` to ensure proper overwrite
  - **Read**: Always tries `stat()` first to get fresh `readURL`, then falls back to URL param `readURL` with cache-busting
  - **Path Handling**: Converts `~` paths to full paths using `fullPath` from URL params or username conversion
  - **Verification**: After save, verifies write by reading back with fresh `readURL` from `stat()`
- ✅ **Status**: Text files now save and reopen correctly with latest content
- ✅ **Files Modified**:
  - `src/backend/apps/editor/index.html` - Enhanced `curfile.write()` to use `writeURL`, improved `puter.fs.read()` patch for fresh content
  - `src/gui/src/IPC.js` - Enhanced file save handler with proper overwrite support
  - `src/gui/src/helpers/launch_app.js` - Added `fullPath` to URL params for editor apps
  - `src/gui/src/UI/UIDesktop.js` - Fixed thumbnail update handling

**Media Player (player):**
- ❓ **Save Functionality**: Media player is read-only (plays audio/video)
- ✅ **Status**: No save functionality needed
- ✅ **Action**: None required

**PDF Viewer (pdf/viewer.js):**
- ❓ **Save Functionality**: PDF viewer is read-only (displays PDFs)
- ✅ **Status**: No save functionality needed
- ✅ **Action**: None required

**Summary for Other Apps:**
- **Text Editor**: ✅ **COMPLETE** - Save and read functionality fully working with proper overwrite and fresh content retrieval
- **Media Player**: No save functionality - not applicable
- **PDF Viewer**: No save functionality - not applicable

---

## 🤖 AI Agent Integration (2025-01-20 → 2026-01-27)

**Status:** ✅ **FULLY IMPLEMENTED** - Merged to `main` on 2026-01-27

**Implementation Complete:**
- ✅ Multi-provider AI (Ollama, Claude, OpenAI, Gemini, xAI)
- ✅ Per-agent memory system (Clawdbot pattern)
- ✅ 20+ tools with permission-based filtering
- ✅ Multi-channel messaging (Telegram, WhatsApp WIP)
- ✅ Agent editor with full configuration
- ✅ Context retrieval (RAG foundation)
- ✅ Token budget management
- ✅ Security hardening (path traversal protection)

**Services Built (16 AI-specific classes):**
1. `AIChatService` - Central orchestration
2. `OllamaProvider` - Local AI
3. `ClaudeProvider` - Anthropic
4. `OpenAIProvider` - OpenAI
5. `GeminiProvider` - Google
6. `XAIProvider` - xAI
7. `AgentMemoryManager` - Per-agent memory
8. `EmbeddingProvider` - Vector embeddings
9. `VectorMemoryStore` - Semantic search
10. `MemoryConsolidator` - Memory pruning
11. `ToolExecutor` - Tool execution
12. `AgentKitExecutor` - Smart wallet tools
13. `ContextRetriever` - RAG context
14. `SystemPromptBuilder` - Prompt engineering
15. `CognitiveToolkit` - Task analysis
16. `TokenBudgetManager` - Token tracking

**Documentation:**
- 📄 `/docs/design/CLAWDBOT_UI_UX_PLAN.md` - 948 lines
- 📄 `/docs/WORLD_COMPUTER_ROADMAP.md` - 1,057 lines (includes AI achievements)

**Timeline:** Research started 2025-01-20 → Implementation complete 2026-01-27 (1 year)

---

## 🌐 Phase 6: Elacity dDRM Integration (Future Vision)

**Status:** ⏸️ **PLANNED** - Architecture design phase  
**Priority:** **STRATEGIC** - Enables global marketplace and digital rights economy  
**Estimated Time:** 10-14 weeks (post-Phase 5)  
**Note:** Extended timeline due to custom WASMER runtime development (6-8 weeks)

### Vision: The Internet of Wealth

PC2 nodes will evolve from personal cloud storage into **sovereign economic nodes** in the Elacity network, enabling:

1. **Digital Capsule Factory**: Users package assets (media, code, AI models, knowledge) into encrypted, tokenized WASMER binaries
2. **Global Marketplace**: Discover, purchase, and trade executable knowledge packages via blockchain registry
3. **P2P Distribution**: Download binaries from other PC2 nodes via IPFS
4. **Tokenized Rights**: Access, Distribution, and Royalty tokens managed on blockchain
5. **WASMER Runtime**: Custom runtime executes self-contained binaries (Player + Asset + RTOS)
6. **AI Agent Economy**: Agents purchase and execute binaries to unlock knowledge/functionality

#### Critical Architecture Distinction

**Elacity (Existing - Browser-Based):**
- Uses **WASM for browser execution** (web runtime)
- Runs in browser environment
- Media playback, web-based DRM

**PC2 WASMER System (New - Custom Runtime):**
- **Self-contained executable binaries** (not browser-dependent)
- Packages **Player (execution engine) + Asset (content) + RTOS (real-time OS)** into single binary
- Runs on **any system** with WASMER runtime
- **Goal**: Convert as many asset types as possible into executable knowledge packages
- **AI Agent Ready**: Agents can purchase Access Tokens and execute binaries to gain capabilities

### 6.1 IPFS Architecture for dDRM

#### Current State (Phase 2)
- ✅ IPFS node using Helia library
- ✅ Private storage for user files
- ✅ Files stored with CIDs in SQLite metadata
- ✅ Local pinning (not publicly advertised)

#### Future State (Phase 6)
- **Dual-Mode IPFS Node:**
  - **Private Mode**: User's personal files (current behavior)
  - **Public Gateway Mode**: Published Digital Capsules (CDN for marketplace)
  - **Hybrid Operation**: Same node, different pinning strategies per asset

#### IPFS Configuration Strategy

```typescript
// Future: src/storage/ipfs-config.ts
interface IPFSConfig {
  // Private storage (current)
  privateMode: {
    enabled: boolean;
    pinLocally: boolean;
    advertiseToNetwork: false; // Never advertise private files
  };
  
  // Public gateway (future)
  publicGateway: {
    enabled: boolean;
    port: number;
    allowCORS: boolean;
    whitelistCIDs: string[]; // Only serve published capsules
  };
  
  // Hybrid operation
  hybridMode: {
    autoDetect: boolean; // Detect capsule vs personal file
    pinStrategy: 'local' | 'network' | 'both';
  };
}
```

**Key Design Decisions:**
1. **Privacy by Default**: All user files remain private unless explicitly published
2. **Opt-In Publishing**: Users must explicitly mark assets for global distribution
3. **CID-Based Routing**: Published capsules get public CIDs, private files stay local
4. **Gateway Configuration**: Public gateway only serves whitelisted CIDs (published capsules)

### 6.2 Digital Capsule Architecture: WASMER Binary System

#### Critical Distinction: WASMER vs Browser WASM

**Elacity (Existing):**
- Uses **WASM for browser-based execution** (web runtime)
- Runs in browser environment
- Limited to web platform capabilities

**New WASMER System (PC2 Custom Runtime):**
- **Self-contained executable binary** (not browser-dependent)
- Packages **Player + Asset + RTOS** into single binary
- Runs on **any system** with WASMER runtime installed
- **Goal**: Convert as many asset types as possible into executable knowledge packages

#### WASMER Binary Structure

```
WASMER Binary (Self-Contained Executable)
├── Binary Header
│   ├── Magic Number (WASMER format identifier)
│   ├── Version
│   └── Metadata Offset
├── Encrypted Payload (128-bit AES, CENC)
│   ├── Player (Execution Engine)
│   │   ├── WASMER Runtime (custom, not browser WASM)
│   │   ├── Decryption Module
│   │   ├── License Validator
│   │   └── Execution Controller
│   ├── Asset (Content/Knowledge)
│   │   ├── Media (video, audio, images)
│   │   ├── Code (functions, libraries, APIs)
│   │   ├── Data (datasets, knowledge bases)
│   │   ├── AI Models (ML models, embeddings)
│   │   └── Documentation
│   └── RTOS (Real-Time Operating System)
│       ├── Task Scheduler
│       ├── Resource Manager
│       ├── I/O Handlers
│       └── System Calls Interface
├── Metadata (Unencrypted, for discovery)
│   ├── CID (IPFS Content ID)
│   ├── Smart Contract Address (DCL token)
│   ├── Asset Type (media, code, knowledge, AI model, etc.)
│   ├── Licensing Terms (embedded)
│   └── Execution Requirements
└── License Key Slot (ECIES encrypted, populated on purchase)
```

#### Key Architectural Differences

| Aspect | Browser WASM (Elacity) | WASMER Binary (PC2) |
|--------|------------------------|---------------------|
| **Execution Environment** | Browser only | Any system with WASMER runtime |
| **Packaging** | Separate files | Single self-contained binary |
| **Runtime** | Browser WASM engine | Custom WASMER runtime |
| **Portability** | Web platform | Cross-platform (OS-agnostic) |
| **Use Case** | Web media playback | Executable knowledge packages |
| **AI Agent Support** | Limited | Full support (AgentKit compatible) |

#### Integration Points

1. **Capsule Creation (Factory)**
   - User selects asset in PC2
   - Packages into WASMER binary with Elacity SDK
   - Encrypts with AES-128 (CENC)
   - Uploads to IPFS (public pinning)
   - Mints ERC-721 DCL token with CID
   - Creates Operative Contract (ERC-1155) for rights

2. **Capsule Discovery (Marketplace)**
   - Query blockchain registry for assets
   - Filter by category, price, creator
   - Display capsule metadata (CID, pricing, royalties)
   - Purchase Access Token via smart contract

3. **Capsule Distribution (P2P)**
   - Buyer receives Access Token
   - PC2 queries IPFS network for capsule CID
   - Downloads from nearest PC2 node (or IPFS gateway)
   - Stores locally in user's PC2
   - License key delivered via CapsuleConnect protocol

4. **Capsule Execution (Runtime)**
   - **User Execution**: WASMER runtime validates Access Token on blockchain
   - **AI Agent Execution**: Agent holds Access Token, queries blockchain, executes binary
   - Decrypts capsule using license key (delivered via CapsuleConnect)
   - Executes embedded Player + Asset + RTOS as unified binary
   - Enforces licensing terms (view count, duration, execution limits, etc.)
   - **AI Agent Use Case**: Agent unlocks knowledge/functionality by executing binary

### 6.3 Blockchain Integration

#### Smart Contract Architecture

1. **Digital Capsule Ledger (DCL) - ERC-721**
   - One token per Digital Capsule
   - Links asset ownership to wallet address
   - Contains CID, metadata, creator info

2. **Operative Contracts - ERC-1155**
   - Access Tokens: License to decrypt and use
   - Distribution Rights: Resale/redistribution terms
   - Royalty Tokens: Revenue share claims

3. **Authority Gateway Smart Contract**
   - Handles token trades
   - Enforces licensing terms
   - Distributes royalties automatically
   - Issues license keys via CapsuleConnect

#### PC2 Integration

```typescript
// Future: src/integration/elacity-sdk.ts
interface ElacitySDK {
  // Factory operations
  createCapsule(asset: File, licensing: LicensingTerms): Promise<CapsuleMetadata>;
  publishCapsule(capsuleId: string, pricing: PricingModel): Promise<Transaction>;
  
  // Marketplace operations
  searchMarketplace(query: SearchQuery): Promise<CapsuleListing[]>;
  purchaseAccess(capsuleId: string): Promise<AccessToken>;
  
  // Distribution operations
  downloadCapsule(cid: string): Promise<WASMERBinary>;
  validateAccess(capsuleId: string, wallet: string): Promise<boolean>;
  
  // Runtime operations
  executeCapsule(binary: WASMERBinary, licenseKey: string): Promise<Runtime>;
}
```

### 6.4 Implementation Phases

#### Phase 6.1: IPFS Gateway Configuration (2-3 weeks)
- [ ] Add public gateway mode to IPFS node
- [ ] Implement CID whitelisting
- [ ] Add pinning strategy configuration
- [ ] Test hybrid private/public operation
- [ ] Document gateway setup

#### Phase 6.2: Elacity SDK Integration (3-4 weeks)
- [ ] Integrate Elacity dDRM SDK
- [ ] Implement capsule creation workflow
- [ ] Add blockchain connection (EVM)
- [ ] Test smart contract interactions
- [ ] Create factory UI in PC2

#### Phase 6.3: Marketplace Integration (2-3 weeks)
- [ ] Implement blockchain registry queries
- [ ] Create marketplace UI
- [ ] Add purchase flow
- [ ] Integrate payment processing
- [ ] Test end-to-end purchase

#### Phase 6.4: P2P Distribution (2-3 weeks)
- [ ] Implement IPFS content discovery
- [ ] Add download from other PC2 nodes
- [ ] Optimize for CDN performance
- [ ] Add caching strategy
- [ ] Test multi-node distribution

#### Phase 6.5: WASMER Runtime Development (6-8 weeks) ⚠️ **CUSTOM BUILD REQUIRED**

**Critical Understanding:** This is NOT integrating existing WASMER - this is **building a custom runtime system**.

- [ ] **Design WASMER Binary Format** (1 week)
  - Define binary structure (Player + Asset + RTOS)
  - Design encryption/decryption flow
  - Define metadata format
  - Create binary packing/unpacking utilities

- [ ] **Build WASMER Runtime Engine** (2-3 weeks)
  - Custom runtime (not browser WASM)
  - Player execution engine
  - RTOS integration
  - License validation module
  - Blockchain integration for Access Token checking
  - Cross-platform support (Linux, macOS, Windows)

- [ ] **Asset Packaging System** (2 weeks)
  - Convert various asset types to WASMER binaries
  - Player embedding for each asset type
  - RTOS integration
  - Encryption pipeline
  - IPFS upload integration

- [ ] **AI Agent Integration** (1-2 weeks)
  - Coinbase AgentKit compatibility
  - Agent token validation
  - Agent execution interface
  - Knowledge extraction APIs
  - Tool/function exposure for agents

- [ ] **Testing & Validation** (1 week)
  - Test binary execution
  - Test license enforcement
  - Test AI agent execution
  - Test cross-platform compatibility
  - Performance benchmarking

### 6.5 Technical Considerations

#### IPFS Node Configuration

**Private Files (Current):**
- Pinned locally only
- Not advertised to IPFS network
- Accessible only via authenticated API
- No public gateway access

**Public Capsules (Future):**
- Pinned and advertised to IPFS network
- Public gateway serves whitelisted CIDs
- CDN functionality for marketplace
- Configurable per capsule

**Implementation:**
```typescript
// Future enhancement to src/storage/ipfs.ts
class IPFSStorage {
  async pinPrivate(filePath: string, cid: string) {
    // Pin locally, don't advertise
    await this.helia.pins.add(cid);
    // Store in database with private flag
    this.db.setFileMetadata(filePath, { cid, isPublic: false });
  }
  
  async pinPublic(capsuleId: string, cid: string) {
    // Pin and advertise to network
    await this.helia.pins.add(cid);
    await this.helia.libp2p.contentRouting.provide(cid);
    // Store in database with public flag
    this.db.setCapsuleMetadata(capsuleId, { cid, isPublic: true });
  }
  
  async setupPublicGateway() {
    // Configure HTTP gateway for public CIDs only
    const gateway = new IPFSGateway({
      whitelist: await this.db.getPublicCIDs(),
      cors: true
    });
    return gateway;
  }
}
```

#### Security Considerations

1. **Privacy Protection**
   - Private files never exposed to public network
   - Explicit opt-in required for publishing
   - Gateway whitelist prevents accidental exposure

2. **License Enforcement**
   - License keys encrypted with ECIES
   - Runtime validates Access Token on blockchain
   - No central server can revoke access

3. **Revenue Protection**
   - Smart contracts handle all payments
   - Automatic royalty distribution
   - Transparent, verifiable transactions

### 6.6 User Experience Flow

#### Publishing an Asset (Factory)
1. User selects file in PC2
2. Opens "Publish to Marketplace" dialog
3. Configures licensing (Access, Distribution, Royalty splits)
4. Sets pricing model (Buy Now, Subscription, PPV, etc.)
5. PC2 packages into Digital Capsule (WASMER)
6. Encrypts and uploads to IPFS (public)
7. Mints DCL token and Operative Contract
8. Asset appears in global marketplace

#### Purchasing an Asset (Marketplace)
1. User browses marketplace in PC2
2. Finds asset via blockchain registry
3. Views pricing, royalties, creator info
4. Purchases Access Token via smart contract
5. PC2 queries IPFS for capsule CID
6. Downloads from nearest node (P2P or gateway)
7. License key delivered via CapsuleConnect
8. Asset available in user's PC2 library

#### Executing an Asset (Runtime - Human User)
1. User opens capsule in PC2
2. WASMER runtime checks Access Token on blockchain
3. If valid, decrypts capsule using license key
4. Executes embedded Player + Asset + RTOS as unified binary
5. Enforces licensing terms (view count, duration, execution limits)
6. Tracks usage for royalty distribution

#### Executing an Asset (Runtime - AI Agent)
1. AI Agent (e.g., Coinbase AgentKit) queries blockchain registry
2. Agent identifies needed knowledge/functionality
3. Agent checks if it holds Access Token for required binary
4. If not, agent purchases Access Token via smart contract (autonomous)
5. Agent downloads WASMER binary from IPFS (via PC2 node or gateway)
6. Agent executes binary using WASMER runtime
7. Binary decrypts and exposes knowledge/functions to agent
8. Agent uses unlocked knowledge for its tasks
9. Usage tracked for royalty distribution to creators

### 6.7 Economic Model Integration

#### Royalty Distribution
- **Automatic**: Smart contracts split revenue instantly
- **Transparent**: All transactions on blockchain
- **Liquid**: Royalty Tokens tradeable on DEXs
- **Fractional**: Creators can sell % of future royalties

#### Marketplace Revenue
- **Protocol Fee**: Small % to Elacity protocol
- **Node Operators**: Incentive for running public gateways
- **Distributors**: % for reselling/redistributing
- **Creators**: Majority share to asset creators

### 6.8 CTO Technical Assessment & Architecture Recommendations

#### Architecture Feasibility: ✅ **HIGHLY VIABLE**

**Strengths:**
1. **Self-Contained Binaries**: Packaging Player + Asset + RTOS eliminates dependency hell
2. **Cross-Platform**: WASMER runtime can run on any OS (Linux, macOS, Windows, embedded)
3. **AI Agent Ready**: Binary format perfect for agent execution (no browser dependency)
4. **Knowledge Economy**: Creates executable knowledge packages - very innovative
5. **Blockchain Integration**: Access tokens provide clear ownership/rights model

**Technical Challenges:**
1. **Custom Runtime Development**: Building WASMER runtime from scratch is significant work (6-8 weeks)
2. **Binary Format Design**: Need robust format that handles all asset types
3. **RTOS Integration**: Real-time OS adds complexity but enables deterministic execution
4. **Performance**: Binary size and execution speed need optimization
5. **Security**: Encrypted binaries with license validation must be bulletproof

#### Recommended Architecture Approach

**Option A: Build Custom WASMER Runtime (Recommended)**
- **Pros**: Full control, optimized for PC2, AI agent support built-in
- **Cons**: Significant development time (6-8 weeks)
- **Best For**: Long-term vision, unique capabilities

**Option B: Extend Existing WASMER (Wasmer.io)**
- **Pros**: Faster to market, proven runtime
- **Cons**: Less control, may need modifications for RTOS
- **Best For**: Faster MVP, leverage existing work

**Recommendation**: **Start with Option B (extend Wasmer.io), migrate to Option A if needed**

#### Implementation Strategy

**Phase 1: Foundation (Weeks 1-2)**
1. Evaluate Wasmer.io runtime capabilities
2. Design binary format (Player + Asset + RTOS structure)
3. Create proof-of-concept binary packer
4. Test basic execution

**Phase 2: Core Runtime (Weeks 3-4)**
1. Integrate/extend Wasmer.io for PC2 needs
2. Add RTOS layer (lightweight, deterministic)
3. Implement license validation (blockchain integration)
4. Add decryption module

**Phase 3: Asset Packaging (Weeks 5-6)**
1. Build asset-to-binary converter
2. Support multiple asset types (media, code, data, AI models)
3. Player embedding for each type
4. Encryption pipeline

**Phase 4: AI Agent Integration (Weeks 7-8)**
1. Coinbase AgentKit compatibility layer
2. Agent execution interface
3. Knowledge extraction APIs
4. Tool/function exposure

#### Binary Format Specification (Draft)

```typescript
// Future: src/wasmer/binary-format.ts
interface WASMERBinary {
  // Header (unencrypted, for discovery)
  header: {
    magic: 'WASMER'; // Format identifier
    version: number;
    assetType: 'media' | 'code' | 'knowledge' | 'ai-model' | 'tool';
    cid: string; // IPFS Content ID
    contractAddress: string; // DCL token address
    metadataSize: number;
    payloadSize: number;
  };
  
  // Encrypted Payload
  payload: {
    // Player (Execution Engine)
    player: {
      runtime: WebAssembly.Module; // WASMER runtime
      decryptor: WebAssembly.Module;
      validator: WebAssembly.Module; // License validator
      controller: WebAssembly.Module; // Execution controller
    };
    
    // Asset (Content)
    asset: {
      type: string;
      data: Uint8Array; // Encrypted content
      metadata: AssetMetadata;
    };
    
    // RTOS (Real-Time OS)
    rtos: {
      scheduler: WebAssembly.Module;
      resourceManager: WebAssembly.Module;
      ioHandlers: WebAssembly.Module[];
      syscalls: SystemCallInterface;
    };
  };
  
  // License Key Slot (populated on purchase)
  licenseKey?: EncryptedLicenseKey;
}
```

#### AI Agent Execution Flow

```typescript
// Future: src/wasmer/agent-execution.ts
interface AgentExecution {
  // Agent discovers need for knowledge
  discoverNeed(task: string): Promise<CapsuleListing[]>;
  
  // Agent checks token ownership
  checkAccess(agentWallet: string, capsuleId: string): Promise<boolean>;
  
  // Agent purchases if needed
  purchaseAccess(capsuleId: string): Promise<AccessToken>;
  
  // Agent downloads binary
  downloadBinary(cid: string): Promise<WASMERBinary>;
  
  // Agent executes binary
  executeBinary(
    binary: WASMERBinary,
    licenseKey: string,
    agentContext: AgentContext
  ): Promise<ExecutionResult>;
  
  // Agent extracts knowledge/functions
  extractKnowledge(result: ExecutionResult): Promise<AgentKnowledge>;
}
```

#### Technical Considerations

**1. Binary Size Optimization**
- **Challenge**: Player + Asset + RTOS can be large
- **Solution**: 
  - Shared Player library (reference, not embedded)
  - Asset compression
  - Lazy RTOS loading
  - Streaming for large assets

**2. Execution Performance**
- **Challenge**: Runtime overhead
- **Solution**:
  - Native code paths where possible
  - JIT compilation for hot paths
  - Caching of decrypted content
  - Parallel execution support

**3. Security Model**
- **Challenge**: Prevent unauthorized execution
- **Solution**:
  - License key tied to wallet address
  - Blockchain validation on every execution
  - Encrypted binary until license verified
  - Sandboxed execution environment

**4. AI Agent Compatibility**
- **Challenge**: AgentKit integration
- **Solution**:
  - Standard tool interface (function signatures)
  - Knowledge extraction APIs
  - Event-driven execution model
  - Async/await support

#### Recommended Tech Stack

**Runtime:**
- Base: Wasmer.io (or custom Rust-based runtime)
- Language: Rust (performance, safety)
- WASM: WebAssembly System Interface (WASI)

**Packaging:**
- Language: TypeScript/Node.js (PC2 integration)
- Encryption: AES-128 (CENC), ECIES for keys
- Compression: zstd or brotli

**AI Agent Integration:**
- Framework: Coinbase AgentKit compatibility layer
- Interface: Standard tool/function API
- Communication: JSON-RPC or gRPC

### 6.9 Dependencies & Prerequisites

**External Dependencies:**
- Elacity dDRM SDK (third-party project)
- Wasmer.io runtime (base, may extend or replace)
- EVM-compatible blockchain connection
- Smart contract deployment
- Coinbase AgentKit (for AI agent support)

**PC2 Prerequisites:**
- ✅ IPFS integration (Phase 2) - **COMPLETE**
- ✅ SQLite database (Phase 2) - **COMPLETE**
- ✅ Wallet authentication (Phase 1) - **COMPLETE**
- ⏸️ Public gateway configuration (Phase 6.1)
- ⏸️ Blockchain integration (Phase 6.2)
- 🚧 WASMER runtime development (Phase 6.5) - **IN PROGRESS** (Basic WASM execution working, dDRM pending)

### 6.9 Success Criteria

**Phase 6 Success:**
- ✅ Users can publish assets to global marketplace
- ✅ Users can discover and purchase assets
- ✅ P2P distribution works across PC2 nodes
- ✅ WASMER runtime executes binaries correctly (Player + Asset + RTOS)
- ✅ Rights management enforced on blockchain
- ✅ Royalties distributed automatically
- ✅ Public IPFS gateway serves as CDN
- ✅ **AI Agents can purchase and execute binaries** (Coinbase AgentKit compatible)
- ✅ **Knowledge extraction works** (agents can use unlocked functionality)
- ✅ **Multiple asset types supported** (media, code, knowledge, AI models, tools)

### 6.10 AI Agent Economy Integration

#### Vision: Bot-to-Bot (B2B) Knowledge Market

**The Future Economy:**
- AI Agents are the primary consumers (not just humans)
- Agents need knowledge/functionality to complete tasks
- Agents purchase Access Tokens autonomously
- Agents execute WASMER binaries to unlock capabilities
- Creators earn royalties from agent usage

#### Agent Execution Model

```typescript
// Example: AI Agent using Coinbase AgentKit
const agent = new Agent({
  wallet: agentWallet,
  tools: [/* standard tools */]
});

// Agent needs knowledge for task
const task = "Analyze market trends using proprietary dataset";
const capsules = await agent.discoverCapsules(task);

// Agent checks if it has access
for (const capsule of capsules) {
  const hasAccess = await agent.checkAccessToken(capsule.id);
  if (!hasAccess) {
    // Agent autonomously purchases access
    await agent.purchaseAccess(capsule.id);
  }
  
  // Agent downloads and executes binary
  const binary = await agent.downloadCapsule(capsule.cid);
  const knowledge = await agent.executeBinary(binary);
  
  // Agent uses unlocked knowledge
  await agent.useKnowledge(knowledge, task);
}
```

#### Market Opportunities

1. **Data Capsules**: Verified datasets for AI training
2. **Function Libraries**: Reusable code/tools for agents
3. **Knowledge Bases**: Domain expertise packaged as executables
4. **AI Models**: Pre-trained models with execution rights
5. **Tool Sets**: Specialized tools agents can purchase and use

#### Revenue Model for Creators

- **Per-Execution**: Agent pays each time it runs binary
- **Subscription**: Agent pays for time-based access
- **Royalty Tokens**: Creators earn from all agent usage
- **Fractional Ownership**: Investors buy % of future royalties

### 6.10 Strategic Importance

**Why This Matters:**
1. **Economic Sovereignty**: Users own and monetize their digital assets
2. **Global Network**: PC2 nodes become part of distributed marketplace
3. **Future-Proof**: Ready for AI/robotics economy (B2B bot-to-bot market)
4. **Competitive Advantage**: First self-hosted node with dDRM marketplace
5. **Revenue Model**: Protocol fees and node operator incentives

**Market Opportunities:**
- Media (music, video, art)
- Software & Applications
- AI Models & Datasets
- Robotics-as-a-Service
- 3D Assets & VR/AR
- Royalty Trading

### 6.11 CTO Architecture Assessment Summary

#### ✅ **Architecture Makes Sense - Recommended Approach**

**Why This Works:**
1. **Executable Knowledge Packages**: Packaging Player + Asset + RTOS creates truly portable, self-contained knowledge units
2. **AI Agent Economy**: Agents can autonomously purchase and execute knowledge - this is the future
3. **Blockchain Rights**: Access tokens provide clear, verifiable ownership model
4. **P2P Distribution**: IPFS enables decentralized distribution without central servers
5. **Cross-Platform**: WASMER runtime works everywhere (not browser-locked)

**Key Technical Insights:**
1. **Start with Wasmer.io Base**: Don't reinvent the wheel - extend existing proven runtime
2. **Binary Format is Critical**: Design format carefully to support all asset types
3. **RTOS Adds Value**: Real-time OS enables deterministic execution for agents
4. **AgentKit Compatibility**: Standard tool interface makes agent integration straightforward
5. **Performance Matters**: Optimize binary size and execution speed early

**Recommended Implementation Order:**
1. **Phase 6.1-6.2**: IPFS gateway + Elacity SDK (foundation)
2. **Phase 6.5**: WASMER runtime development (core capability)
3. **Phase 6.3-6.4**: Marketplace + P2P (distribution)
4. **Phase 6.6**: AI Agent integration (future economy)

**Risk Mitigation:**
- **Binary Format**: Design extensible format from day one
- **Performance**: Benchmark early, optimize iteratively
- **Security**: License validation must be bulletproof
- **Compatibility**: Test across platforms early

**Strategic Value:**
- **First-Mover**: Self-hosted nodes with executable knowledge marketplace
- **AI Ready**: Built for agent economy from ground up
- **Creator Economy**: Enables new revenue models
- **Future-Proof**: Architecture supports B2B bot-to-bot market

---

## AI Agent Integration Status (2026-01-21) - UPDATED

### ✅ **AI Integration Complete - Production Ready with Enhanced UX**

**Implementation Status:** All phases complete with comprehensive UX overhaul (Jan 2026)

**Completed Features:**

1. **Backend AI Service** ✅ (Enhanced Jan 2026)
   - Ollama provider integration with auto-detection
   - **Official SDKs:** `@anthropic-ai/sdk`, `openai`, `@google/genai`
   - **New xAI (Grok) Provider** - Uses OpenAI-compatible API
   - Tool normalization and execution with real-time streaming
   - **Enhanced stream protocol:** status/reasoning/done chunks for live UI updates
   - Empty message handling for tool-only responses

2. **Function Calling** ✅
   - All filesystem tools implemented (create, list, read, write, delete, move, copy, stat, rename)
   - Wallet-scoped path resolution and security
   - Path normalization (handles malformed paths)
   - Tool execution with proper error handling
   - WebSocket live updates for AI-initiated operations
   - **Real-time progress tracking** with step counts

3. **Frontend UI** ✅ (Major Overhaul Jan 2026)
   - Slide-out chat panel (right side of screen)
   - Multi-conversation system with persistent history
   - History slide-out menu (slides from left inside AI panel)
   - Streaming text responses with markdown rendering
   - **Syntax-highlighted code blocks** with copy functionality
   - File attachments (images, PDFs, text files)
   - OCR and PDF text extraction
   - Vision-capable model support (llava, Grok Vision)
   - Dark mode as default
   - **3x3 pulsing dot loading indicator** (sequential wave animation)
   - **Collapsible "Thinking..." section** for AI reasoning
   - **Real-time progress bar** with tool execution steps
   - **Enhanced error cards** with retry/dismiss actions
   - **Granular model selector** with all models per provider
   - **"+ Add Model..." opens Settings** for easy API key config
   - Minimal design (removed status checkmarks, blinking cursor)

4. **Settings > AI Assistant** ✅ (Enhanced Jan 2026)
   - **Redesigned API Keys section** with Add/Update/Delete buttons
   - **Active provider badge** indicator
   - **Masked key display** (e.g., `Key: sk-...abc123`)
   - **xAI (Grok)** provider added to dropdown and key management
   - Provider selection with Claude, OpenAI, Gemini, xAI, Ollama

5. **AI Capabilities** ✅
   - General question answering (default behavior)
   - Filesystem operations via function calling
   - Multi-modal input (text + images)
   - Context-aware responses
   - **DeepSeek `<think>` tag parsing** for reasoning display

**Supported Models (Jan 2026):**

| Provider | Models |
|----------|--------|
| **Claude** | Sonnet 4.5, Opus 4, 3.5 Sonnet, 3.5 Haiku |
| **OpenAI** | GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-4, GPT-3.5 Turbo |
| **Gemini** | 2.0 Flash, 1.5 Pro, 1.5 Flash, Pro |
| **xAI** | Grok 3, Grok 3 Fast, Grok 2, Grok Vision |
| **Ollama** | Any locally installed model (DeepSeek, Llama, etc.) |

**Integration Points:**
- ✅ Uses existing `/drivers/call` endpoint pattern
- ✅ Integrates with wallet-based authentication
- ✅ Leverages existing `FilesystemManager` for tool execution
- ✅ Uses existing WebSocket system for live updates
- ✅ Follows PC2's Express + TypeScript architecture
- ✅ **highlight.js** CDN integration for syntax highlighting

**Documentation:**
- See `docs/AI_AGENT_INTEGRATION_STRATEGY.md` for detailed implementation guide

---

## 🎯 Phase 7: MVP Production Release & Decentralized Network (2025-01)

### Current Focus: MVP Demo Preparation

**Goal:** Enable others to download, run, and test PC2 on their own hardware.

### 7.1 MVP Production Release (High Priority)

| Task | Status | Notes |
|------|--------|-------|
| **HTTPS Documentation** | ✅ Complete | `docs/DEPLOYMENT.md` + ElacityLabsWeb VPS guide |
| **Production Build Script** | ✅ Complete | `npm run build` (frontend + backend) |
| **Docker Containerization** | ✅ Complete | `pc2-node/Dockerfile`, `docker-compose.yml`, arm64 support |
| **Logout Flow** | 🔲 Todo | Clean Particle session clearing |
| **Error Handling** | 🔲 Todo | Network/wallet connection errors |
| **Mobile Testing** | 🔲 Todo | Login modal on mobile browsers |

**Deliverables:**
- ✅ `docs/DEPLOYMENT.md` - Complete deployment instructions
- ✅ `pc2-node/Dockerfile` - Container definition (multi-stage, bubblewrap bundled)
- ✅ `pc2-node/docker-compose.yml` - Easy deployment with security caps
- ✅ `npm run build` - Build command (frontend + backend)
- ✅ GitHub Actions CI/CD - Multi-platform Docker builds

### 7.2 Decentralized Network Access (Future Phase)

**Vision:** Zero-config URL generation for any PC2 node, accessible from anywhere.

**Architecture:**
```
User's PC2 Node
├── Tor Hidden Service (.onion) - Fully decentralized fallback
├── Gateway Registration (*.pc2.network) - Federated web access
├── Tailscale VPN (optional) - High-performance secure tunnel
└── Custom Domain (optional) - User's own domain
```

**Key Features:**
1. **Automatic URL Generation** - `pc2 start` → get URL immediately
2. **Tor Integration** - Embedded Tor for decentralized access
3. **Federated Gateways** - Multiple operators, no single point of failure
4. **Self-Updating** - Updates through PC2 desktop UI

**Implementation Phases:**
- **7.2.1** Tor Hidden Service Integration (1-2 weeks)
- **7.2.2** Gateway Server + Federation Protocol (2-3 weeks)
- **7.2.3** Self-Update System (1-2 weeks)
- **7.2.4** Custom Subdomain Support (1 week)

**See:** `docs/PC2_NETWORK_SPECIFICATION.md` for detailed technical specification.

---

### 7.2.1 Tor Integration - Detailed Design (Research from Umbrel)

**Umbrel's Approach (for inspiration, not copying):**
- Auto-generates unique .onion address per app on install
- Stores keys in `/umbrel/tor/data/<app-name>/` with `hostname` and `hs_ed25519_secret_key`
- Uses `app_proxy` to wrap all apps with authentication before exposing via Tor
- Zero configuration required from user

**PC2 Implementation Plan:**

1. **Embed Tor Binary**
   - Bundle `tor` in PC2 node distribution (or install via apt/brew on first run)
   - Store configuration in `data/tor/torrc`
   - Auto-start Tor service with PC2 node

2. **Hidden Service Generation**
   - Create hidden service for main PC2 UI on first startup
   - Store keys in `data/tor/services/main/` per wallet
   - Display .onion address in Settings > Network

3. **Per-App Hidden Services** (Future, with App Store)
   - Each installed app gets its own .onion
   - Apps are protected by wallet-based auth (already implemented)
   - Store in `data/tor/services/<app-id>/`

4. **Key Management**
   - Include Tor keys in backup/restore
   - Allow user to rotate .onion address (delete key, restart)
   - Never expose private keys in UI

**Files to Create:**
- `pc2-node/src/services/tor/TorService.ts` - Tor daemon management
- `pc2-node/src/services/tor/HiddenService.ts` - Hidden service generation
- `pc2-node/data/tor/` - Runtime data directory

**Why Tor for PC2:**
- Works behind ANY NAT/firewall (no port forwarding)
- Fully decentralized (no central server dependency)
- Privacy-preserving (IP not exposed)
- Already familiar to crypto/Web3 users

---

### 7.2.5 Tailscale Integration (Optional, Future)

**What Tailscale Offers:**
- VPN-based secure tunnel using WireGuard
- Works with native mobile apps (no Tor browser needed)
- Better performance than Tor (~2-5ms vs ~200-500ms latency)
- Magic DNS: access node as `pc2-node.tail1234.ts.net`

**Trade-offs:**
- Requires Tailscale account (centralized component)
- Not fully decentralized like Tor
- Free tier limited to 100 devices

**PC2 Integration Options:**

1. **Option A: App Store App** (Recommended)
   - Offer Tailscale as an installable app in PC2 App Store
   - User configures their own Tailscale account
   - PC2 remains decentralized by default

2. **Option B: Built-in Optional**
   - Embed Tailscale daemon in PC2
   - Offer as toggle in Settings > Network
   - Requires Tailscale account setup

**Recommendation:** Start with Tor (fully decentralized), offer Tailscale as optional App Store app for users who want better performance and are okay with the Tailscale account requirement.

---

### 7.8 dApp Centre UI (✅ COMPLETE - 2026-01-20)

**Purpose:** Validate dApp Store UX before building dDRM/blockchain backend. Inspired by Umbrel's app store design patterns.

**What Was Built:**

**UI/UX Features (Umbrel-Inspired):**
- Renamed from "App Center" to "dApp Centre" to reflect decentralized focus
- Staff Picks section with large feature cards (Umbrel-style)
- Edge-to-edge horizontal carousels with hidden scrollbars
- Category filtering with unique views per category (hides carousels, shows filtered grid)
- App detail modal with version, changelog, requirements, permissions
- Install/uninstall flow with progress indicators
- Pricing display for paid apps (free or $X.XX)
- SVG icons replacing emoji for professional appearance
- Version numbers and badges (WASM, dDRM, Open Source) displayed inline

**Mock Apps Created (20+ apps):**

| App | Category | Price | Badge | Purpose |
|-----|----------|-------|-------|---------|
| Elastos DID | Blockchain | Free | dDRM | W3C-compliant decentralized identity |
| Elacity Player | Media | Free | dDRM | Media player with rights management |
| Elacity Connect | IoT | Free | WASM | P2P connectivity to smart devices |
| Elacity Media | Media | $4.99 | dDRM | Premium media management |
| BTCD | Blockchain | Free | dDRM | Bitcoin Dollar - collateralize BTC, mint stablecoin |
| BTC Wallet | Blockchain | Free | Open Source | Bitcoin wallet management |
| Elastos Mainchain Wallet | Blockchain | Free | dDRM | ELA wallet with staking |
| Elastos BPoS Node | Blockchain | Free | Open Source | Run a validator node |
| Elastos DAO | Blockchain | Free | dDRM | Governance participation |
| Elastos RPC Node | Blockchain | Free | Open Source | Run an RPC endpoint |
| ESC Wallet | Blockchain | Free | dDRM | Smart contract wallet |
| Uniswap | DeFi | Free | WASM | Decentralized exchange |
| Glide Finance | DeFi | Free | WASM | DEX on Elastos |
| Aave | DeFi | Free | WASM | Lending protocol |
| OpenSea | NFT | Free | WASM | NFT marketplace |
| Chainlink Oracle | Blockchain | $9.99 | Open Source | Oracle node |
| The Graph Node | Blockchain | Free | Open Source | Indexing protocol |
| Lido Staking | DeFi | Free | WASM | Liquid staking |
| Photo Vault | Media | Free | WASM | Encrypted photo storage |
| Code Studio | Tools | Free | Open Source | Development environment |

**Files Modified:**
- `src/backend/apps/app-center/index.html` - Complete UI with Umbrel-inspired patterns
- `pc2-node/src/api/apps.ts` - App title renamed to "dApp Centre"
- `pc2-node/src/api/info.ts` - App metadata updated
- `pc2-node/src/api/other.ts` - Driver layer app info updated
- `pc2-node/src/api/apps.js`, `info.js`, `other.js` - JavaScript versions updated

**Design Decisions from Umbrel Audit:**
1. **Edge-to-edge carousels** - No side padding on horizontal scroll sections
2. **Large feature cards** - Staff Picks use gradient backgrounds with app icon
3. **Hidden scrollbars** - Cleaner appearance while maintaining scroll functionality
4. **Version + badges inline** - Compact display of app metadata
5. **Category-specific views** - Clicking a category shows only that category's apps

**Future Backend (dDRM Integration):**
When ready, the dApp Centre will connect to:
1. Blockchain registry for app listings (Elastos Smart Contract)
2. IPFS for WASM binary downloads
3. Token validation for access rights (dDRM)
4. WASMER runtime for execution
5. Tor/Tailscale for secure app distribution

### 7.3 Particle Login Improvements (✅ Complete)

- ✅ Elacity Labs branding on login modal
- ✅ Social login removed (domain whitelisting issues)
- ✅ Wallet order: MetaMask, Phantom, WalletConnect
- ✅ Desktop icons fix after login
- ✅ Page reload for proper initialization

---

## 🖥️ Phase 7.4: System Terminal (✅ COMPLETE - 2025-01-19)

### Overview
Replaced the non-functional Phoenix/Terminal shell with a **real PTY-based System Terminal** that provides actual shell access to the PC2 node.

### Features Implemented

| Feature | Status | Description |
|---------|--------|-------------|
| **Real PTY Shell** | ✅ Complete | Uses `node-pty` for real shell access (zsh/bash/sh) |
| **WebSocket I/O** | ✅ Complete | Real-time terminal I/O via Socket.io |
| **xterm.js Frontend** | ✅ Complete | Full terminal emulator in browser |
| **Session Management** | ✅ Complete | Per-user session tracking, idle timeout |
| **Configurable Isolation** | ✅ Complete | `none`, `namespace`, `disabled` modes |
| **Namespace Isolation** | ✅ Complete | Linux bubblewrap support for multi-user safety |
| **Security Warnings** | ✅ Complete | Clear warnings when running in insecure mode |
| **Audit Logging** | ✅ Complete | All terminal sessions logged |

### Files Created/Modified

**Backend (pc2-node/src/):**
- `services/terminal/TerminalService.ts` - Core terminal service with isolation modes
- `websocket/terminal.ts` - WebSocket handlers for terminal I/O
- `websocket/server.ts` - Terminal handler integration
- `api/terminal.ts` - REST endpoints for status/management

**Frontend (src/gui/src/UI/):**
- `UIWindowSystemTerminal.js` - xterm.js-based terminal window

**Configuration:**
- `config/pc2.json.example` - Terminal isolation settings

### Isolation Modes

| Mode | Platform | Security | Use Case |
|------|----------|----------|----------|
| `none` | All | Single-user only | Personal nodes |
| `namespace` | Linux only | Multi-user safe | Shared hosting |
| `disabled` | All | N/A | Disable terminal |

### Configuration Example

```json
"terminal": {
    "isolation_mode": "none",
    "allow_insecure_fallback": false,
    "max_terminals_per_user": 5,
    "idle_timeout_minutes": 30
}
```

### Removed Apps
- ❌ Terminal (old Puter terminal - non-functional)
- ❌ Phoenix Shell (non-functional)
- ✅ System Terminal replaces both with real functionality

---

## 🚀 Phase 7.5: Production Readiness Assessment (2025-01-19)

### Current Status: Ready for Demo with Caveats

| Component | Status | Production Ready? | Notes |
|-----------|--------|-------------------|-------|
| **Authentication** | ✅ | Yes | Particle Auth with wallet login |
| **File System (IPFS)** | ✅ | Yes | Per-user paths, embedded Helia |
| **Database** | ✅ | Yes | SQLite, embedded |
| **AI Chat** | ✅ | Yes | Multi-provider (Claude, OpenAI, Gemini, xAI, Ollama), granular model selection, real-time streaming, tool execution with progress |
| **Terminal** | ⚠️ | Partial | Safe for single-user; needs namespace for multi-user |
| **Backup/Restore** | ✅ | Yes | Web UI and CLI |
| **App Launcher** | ✅ | Yes | All apps functional |
| **WASM Runtime** | ✅ | Yes | Calculator working |

### What's Missing for Production

| Area | Priority | Status | Action Needed |
|------|----------|--------|---------------|
| **HTTPS** | 🔴 High | ⚠️ Docs Ready | Nginx reverse proxy guide created |
| **Rate Limiting** | ✅ Complete | ✅ Done | Per-scope rate limits with sliding window (Phase 7.7) |
| **Health Checks** | ✅ Complete | ✅ Done | `/health` and `/api/health` endpoints |
| **Audit Logging** | ✅ Complete | ✅ Done | All agent actions logged (Phase 7.7) |
| **Error Monitoring** | 🟡 Low | ❌ Missing | Add Sentry or similar |
| **Docker Package** | ✅ Complete | ✅ Done | Full Dockerfile with bubblewrap bundled |
| **Namespace Isolation** | ✅ Complete | ✅ Done | Bundled in Docker, auto-enabled |

---

## 🐳 Phase 7.6: Docker Packaging & Deployment (✅ COMPLETE - 2025-01-19)

### Overview
Created complete Docker packaging for PC2 Node with all dependencies bundled, enabling one-command deployment.

### Files Created

| File | Purpose |
|------|---------|
| `pc2-node/Dockerfile` | Multi-stage build with bubblewrap pre-installed |
| `pc2-node/docker-compose.yml` | One-command deployment with proper security caps |
| `pc2-node/scripts/docker-entrypoint.sh` | Auto-configuration on startup |
| `config/pc2.production.json` | Production defaults (namespace isolation ON) |
| `docs/DEPLOYMENT.md` | Complete VPS deployment guide |

### What's Bundled in Docker Image

```
Docker Image (elastos/pc2-node)
├── Node.js 20 Alpine
├── bubblewrap (namespace isolation)  ← Installed automatically
├── node-pty (compiled for container)
├── All PC2 source code
├── Production config (namespace mode default)
├── Entrypoint script with auto-setup
└── Health check configured
```

### Docker Commands

**Build:**
```bash
cd pc2-node
docker build -t elastos/pc2-node -f Dockerfile ..
```

**Run (simple):**
```bash
docker run -d --name pc2-node \
  -p 4200:4200 \
  -v pc2-data:/app/data \
  --security-opt seccomp=unconfined \
  --cap-add SYS_ADMIN \
  elastos/pc2-node
```

**Run (with docker-compose):**
```bash
cd pc2-node
docker-compose up -d
```

### Enhanced Health Endpoint

Both `/health` and `/api/health` now return:
```json
{
  "status": "ok",
  "timestamp": "2025-01-19T04:23:54.806Z",
  "version": "0.1.0",
  "uptime": 14.5,
  "database": "connected",
  "ipfs": "available",
  "websocket": "active",
  "terminal": {
    "status": "available",
    "isolationMode": "namespace"
  },
  "owner": {
    "set": true,
    "tethered_wallets": 0
  }
}
```

### Production Configuration

`config/pc2.production.json` defaults:
- Terminal isolation: `namespace` (multi-user safe)
- Max terminals per user: 3
- Idle timeout: 15 minutes
- Rate limiting: enabled

---

## 📋 Deployment Checklist for Demo Server (pc2.net)

### Pre-Deployment
- [x] Dockerfile created with bubblewrap bundled
- [x] docker-compose.yml for easy deployment
- [x] Production config with namespace isolation default
- [x] Health endpoints for monitoring
- [x] Deployment documentation

### VPS Deployment Steps
- [ ] Provision Linux VPS (Ubuntu 22.04+ on InterServer/DigitalOcean/Vultr)
- [ ] Install Docker: `curl -fsSL https://get.docker.com | sh`
- [ ] Clone repo and build: `docker build -t elastos/pc2-node -f pc2-node/Dockerfile .`
- [ ] Run with docker-compose
- [ ] Set up Nginx reverse proxy for HTTPS
- [ ] Configure Let's Encrypt SSL
- [ ] Test Particle Auth works over HTTPS
- [ ] Test terminal namespace isolation
- [ ] Set up monitoring/alerts

### Post-Deployment Verification
- [ ] `/api/health` returns `status: ok`
- [ ] Terminal shows `isolationMode: namespace`
- [ ] Multiple users cannot access each other's files
- [ ] Backup/restore works
- [ ] AI chat works (if API keys configured)

---

## 📋 Remaining TODO

### High Priority (For Launch)
- [ ] Deploy to VPS and test
- [ ] Configure HTTPS with Let's Encrypt
- [ ] Verify Particle Auth works in production

### Medium Priority
- [x] Add API rate limiting middleware ✅ **COMPLETE (Phase 7.7)**
- [x] Create automated backup schedule ✅ **COMPLETE (Scheduler in Phase 7.7)**
- [ ] Set up uptime monitoring

### Low Priority (Future)
- [ ] Error monitoring (Sentry)
- [ ] Electron desktop app packaging
- [ ] CI/CD pipeline for automated builds
- [ ] Agent package management (npm, pip, apt)
- [ ] Agent persistent sessions

---

## 🌐 IPFS Network & Resource Management (2025-01-19)

### Current State

| Component | Status | Notes |
|-----------|--------|-------|
| IPFS Gateway URL | ✅ Dynamic | Uses `req.headers.host` - works on any domain/IP |
| Storage Quota | ⚠️ Hardcoded | 10GB fixed - needs config-based |
| CPU/Memory Limits | ❌ None | No resource throttling |
| IPFS Network Mode | ✅ Configurable | private/hybrid/public modes |

### How IPFS Gateway Works in Production

The gateway URL is **automatically derived** from the request's Host header:

```
Local Development:    http://localhost:4200/ipfs/:cid
LAN Access:           http://192.168.1.100:4200/ipfs/:cid
VPS (direct):         http://123.45.67.89:4200/ipfs/:cid
VPS (domain):         https://mycloud.example.com/ipfs/:cid
Ngrok Tunnel:         https://abc123.ngrok.io/ipfs/:cid
```

**No configuration needed** - the backend reads `req.headers.host` and constructs URLs dynamically.

### Deployment Profiles

| Profile | Storage | IPFS Mode | DHT | Use Case |
|---------|---------|-----------|-----|----------|
| **Desktop** | 500GB+ | hybrid | ✅ | Power user, media library, dDRM participation |
| **Raspberry Pi** | 20GB | hybrid | ✅ | Personal cloud, light storage, dDRM downloads |
| **VPS Seeder** | 80GB | public | ✅ | Always-on, earns rewards, full DHT participation |
| **Air-Gapped** | Any | private | ❌ | Maximum privacy, no network discovery |

### dDRM Marketplace Integration

For dDRM to work, nodes must be able to:
1. **Discover content** - Find CIDs announced by other nodes
2. **Fetch content** - Download encrypted assets from the network
3. **Serve content** - Help distribute content (earn rewards)

**Required IPFS config for dDRM:**
```json
{
  "ipfs": {
    "mode": "hybrid",
    "enable_dht": true,
    "enable_bootstrap": true,
    "announce_public": true
  }
}
```

### Resource Management Configuration

Added to `config/pc2.json.example`:

```json
{
  "resources": {
    "storage": {
      "limit": "auto",
      "reserve_free_space": "10GB"
    },
    "compute": {
      "max_cpu_percent": 80,
      "max_memory_mb": "auto",
      "max_concurrent_wasm": 4
    },
    "network": {
      "max_upload_mbps": "unlimited",
      "max_download_mbps": "unlimited"
    }
  }
}
```

**"auto" detection:**
- Storage: `(total_disk - reserve) * 0.8`
- Memory: `system_ram * 0.5`

### UI Features Implemented (2025-01-19)

| Feature | Status | Location |
|---------|--------|----------|
| Storage quota progress bar | ✅ | Settings > Storage |
| Public/Private visibility breakdown | ✅ | Settings > Storage |
| IPFS Network info (Node ID, Peers, Gateway) | ✅ | Settings > Storage |
| Export public files list (CSV) | ✅ | Settings > Storage |
| Pin remote CID dialog | ✅ | Settings > Storage |
| Public folder warning banner | ✅ | File explorer |
| File properties with CID & visibility | ✅ | Right-click > Properties |
| Context menu IPFS options | ✅ | Right-click menu |

### TODO: Dynamic Resource Detection

- [ ] Implement auto-detection of available disk space
- [ ] Read resource limits from config file
- [ ] Add Settings UI to configure limits
- [ ] Implement CPU/memory throttling for WASM
- [ ] Add real-time IPFS sync status (WebSocket)

---

## 🤖 Phase 7.7: Programmatic AI Agent API (✅ COMPLETE - 2026-01-20)

### Overview

Implemented a comprehensive programmatic API that enables external AI agents (Claude Code, Cursor, custom bots) to manage a user's PC2 cloud storage. This differs from the built-in AI Chat (which uses Ollama/OpenAI for conversations) - this is about **giving external AI agents tool access** to the PC2 node.

### Key Insight: Personalized API Endpoints

**The API endpoint shown in the UI automatically adapts to each user's setup:**

```javascript
// From pc2-node/frontend/index.html and gui.js:
window.api_origin = window.location.origin;
```

This means:
- **Local Development**: `http://localhost:4200`
- **LAN Access**: `http://192.168.1.100:4200`
- **VPS (direct IP)**: `http://123.45.67.89:4200`
- **VPS (domain)**: `https://mynode.example.com`
- **Custom Port**: `https://cloud.mydomain.com:8443`

**No hardcoding** - the UI reads from `window.api_origin` which is set to `window.location.origin`. Every sovereign node operator sees their correct URL automatically.

### Features Implemented

| Feature | Status | Description |
|---------|--------|-------------|
| **API Key Management** | ✅ Complete | Create, list, revoke, delete keys via Settings > Security |
| **Scoped Permissions** | ✅ Complete | Read, Write, Execute, Admin scope granularity |
| **Tool Registry** | ✅ Complete | 40+ tools across 8 categories, OpenAPI schema at `/api/tools/openapi` |
| **Rate Limiting** | ✅ Complete | Per-scope limits with sliding window, headers in responses |
| **Audit Logging** | ✅ Complete | All agent actions logged with timestamps and duration |
| **Task Scheduler** | ✅ Complete | Cron-style task automation (backup, git pull, http requests) |
| **Git Integration** | ✅ Complete | Clone, commit, push, pull, status, diff, log |
| **HTTP Client** | ✅ Complete | External API calls with security restrictions |
| **File Copy** | ✅ Complete | Copy files within user storage |
| **Agent Integration Guide** | ✅ Complete | In-app guide in Settings > Security with copy-to-clipboard prompt |

### Tool Categories (40+ Tools)

| Category | Tools | Description |
|----------|-------|-------------|
| **Filesystem** | 12 tools | read, write, list, stat, mkdir, delete, move, copy, rename, search, write_json, read_json |
| **Terminal** | 3 tools | exec, script, stats |
| **System** | 8 tools | get_stats, disk_free, list_backups, create_backup, kv_get, kv_set, list_audit_logs, get_audit_stats, get_rate_limit_status |
| **HTTP** | 2 tools | http_request, download |
| **Git** | 7 tools | clone, status, commit, push, pull, log, diff |
| **Scheduler** | 6 tools | create/list/get/update/delete/trigger tasks |

### Files Created/Modified

**New Backend Files:**
- `pc2-node/src/api/http-client.ts` - External HTTP requests with security blocks
- `pc2-node/src/api/git.ts` - Git operations API
- `pc2-node/src/api/audit.ts` - Audit logging middleware and endpoints
- `pc2-node/src/api/rate-limit.ts` - Rate limiting middleware
- `pc2-node/src/api/scheduler.ts` - Cron-style task scheduler

**Modified Backend Files:**
- `pc2-node/src/api/tools.ts` - Expanded tool registry (40+ tools)
- `pc2-node/src/api/filesystem.ts` - Added `handleCopy`
- `pc2-node/src/api/index.ts` - Registered new routes and middleware
- `pc2-node/src/storage/database.ts` - Audit log methods
- `pc2-node/src/storage/schema.sql` - `audit_logs`, `scheduled_tasks` tables
- `pc2-node/src/storage/migrations.ts` - Migrations 10 & 11

**Frontend Files:**
- `src/gui/src/UI/Settings/UITabSecurity.js` - API Keys UI + Agent Integration Guide

### API Authentication

```bash
# All agent requests use X-API-Key header
curl -X GET "https://mynode.example.com/api/tools" \
  -H "X-API-Key: pc2_xxxxxxxxxxxx"
```

### Security Architecture

| Layer | Implementation |
|-------|----------------|
| **Per-User Isolation** | All operations scoped to `wallet_address` from authenticated key |
| **Scope Enforcement** | Keys can only access endpoints matching their scopes |
| **Rate Limiting** | Read: 1000/min, Write: 200/min, Execute: 100/min, Admin: 50/min |
| **Audit Trail** | Every action logged with timestamp, duration, response status |
| **HTTP Restrictions** | Blocked hosts: localhost, internal IPs, cloud metadata |
| **Path Validation** | All file paths validated and constrained to user's home directory |

### How External Agents Connect

The Settings > Security panel now includes an "AI Agent Integration Guide" section with:

1. **API Endpoint**: Shows the user's actual node URL (auto-detected)
2. **OpenAPI Schema Link**: `/api/tools/openapi` for tool discovery
3. **Setup Instructions**: How to configure Claude Code, Cursor, or custom agents
4. **Copy Prompt Button**: One-click copy of a complete setup prompt for AI

### Use Cases Enabled

| Use Case | Tools Used |
|----------|------------|
| **Organize files** | list, move, mkdir, rename |
| **Sync git repos** | git_clone, git_pull, git_push |
| **Automated backups** | create_backup, scheduler |
| **Download from web** | http_request, download |
| **Run scripts** | terminal_exec, terminal_script |
| **Monitor system** | get_stats, disk_free, audit_stats |
| **Build automation** | scheduler with terminal_exec |

### Key Learnings

1. **Dynamic URL Detection**: Using `window.location.origin` ensures every sovereign node shows its correct URL without configuration
2. **Scope Separation**: Separating read/write/execute/admin scopes allows users to create least-privilege keys for specific agents
3. **Audit Everything**: External agent access requires complete audit trails for security and debugging
4. **Rate Limits Essential**: Without rate limits, a misconfigured agent could overwhelm the node
5. **OpenAPI Schema**: Providing machine-readable tool schemas enables any AI agent to discover and use the API
6. **In-App Guidance**: Users need clear, copy-paste-ready instructions to connect external agents

### Testing

Created `pc2-node/test-agent-capabilities.sh` for comprehensive API testing:
```bash
API_KEY="pc2_xxx" ./test-agent-capabilities.sh
```

Tests all tool categories, rate limiting, audit logging, and scheduler functionality.

### Remaining TODO

- [ ] Persistent sessions for long-running agent tasks
- [ ] Package management tools (npm, pip, apt)
- [ ] WebSocket real-time updates for agents
- [ ] Multi-agent collaboration (shared workspaces)
- [ ] Agent marketplace (pre-configured agent templates)

---

## AI Chat Windowed Application (January 2025)

### Overview

Implemented the AI Chat as a standalone windowed application, complementing the existing sidebar version. Users can now open AI Chat in a dedicated window for multitasking while maintaining full state synchronization with the sidebar.

### Implementation Details

**Architecture:**
- `UIWindowAIChat.js` - Window wrapper component that creates a UIWindow with the AI chat content
- Shares state with sidebar via backend conversation storage (no duplicate state)
- Registered in Start menu via `info.ts` with dedicated icon
- Launched via `launch_app.js` special case handling

**Key Files Created/Modified:**
- `src/gui/src/UI/UIWindowAIChat.js` - New window wrapper component
- `src/gui/src/UI/AI/UIAIChat.js` - Added "Open in Window" button, exported `initAIChatWindow()`
- `src/gui/src/helpers/launch_app.js` - Added ai-chat app handling
- `pc2-node/src/api/info.ts` - Registered app in Start menu with icon
- `src/gui/src/css/style.css` - Window-specific styles

### Key Learnings

1. **Static vs Dynamic Imports with jQuery Plugins**: When using webpack code-splitting, dynamically imported modules (`await import(...)`) create separate chunks with isolated JavaScript contexts. jQuery plugins like `$.fn.close`, `$.fn.hideWindow`, and `$.fn.focusWindow` defined in the main bundle are NOT available to dynamically imported chunks. **Solution**: Use static imports for modules that need access to jQuery plugins.

2. **UIWindow Button Handlers**: The maximize (scale) button in UIWindow uses a pre-fetched element reference via `document.querySelector`, while close/minimize originally used inline jQuery selectors. For consistency and reliability, all window action buttons should use pre-fetched element references.

3. **Window Options for body_content**: When using `body_content` instead of `iframe_url` in UIWindow, ensure you include all necessary options: `has_head: true`, `is_resizable: true`, `is_draggable: true`, `is_visible: true`, etc. Missing options can cause unexpected behavior.

4. **PC2-Exclusive Apps**: Apps like `ai-chat`, `explorer`, and `system-terminal` need special handling in `launch_app.js` to bypass the remote app info fetch. Add them to the early conditional check to prevent 404 errors.

5. **Button Alignment in Headers**: Use `display: flex; align-items: center;` on header buttons to ensure consistent vertical alignment, especially when buttons have different icon sizes.

6. **Browser Caching During Development**: Frontend changes may not appear due to aggressive browser caching. Always do hard refresh (Cmd+Shift+R) after rebuilding, and consider restarting the server to ensure fresh bundles are served.

7. **Button Text Vertical Centering**: When creating buttons, NEVER use vertical padding (`padding: 4px 10px`) as this can cause text to appear offset from center. Instead, use explicit height and line-height matching:
   ```html
   <!-- ❌ WRONG - text may not be vertically centered -->
   <button style="padding: 4px 10px;">Remove</button>
   
   <!-- ✅ CORRECT - explicit height with matching line-height -->
   <button style="padding: 0 10px; height: 24px; line-height: 24px;">Remove</button>
   ```

8. **Container Overflow for Dynamic Content**: When creating containers (cards, sections) that hold dynamic content like dropdowns or buttons, ensure overflow is visible and min-height is auto:
   ```html
   <!-- ✅ Prevents content clipping -->
   <div class="settings-card" style="overflow: visible; min-height: auto;">
   ```

### UI/UX Decisions

- **External Link Icon**: The "Open in Window" button uses an external link icon (arrow pointing out of a box) to indicate it opens a separate window
- **Window Dimensions**: Default 500x700px with min 400x500px - optimized for chat interface
- **State Synchronization**: Both sidebar and window versions share the same backend conversation storage, ensuring seamless continuity

---

## Frontend Storage Security (January 2025)

### Overview

Audit and improvements to frontend localStorage usage to minimize attack surface and ensure proper data lifecycle management.

### localStorage Keys by Category

**Authentication (Sensitive - Cleared on Logout):**
| Key | Purpose | Cleared on Logout |
|-----|---------|-------------------|
| `auth_token` | Session authentication token | Yes |
| `puter_auth_token` | Alternative auth token | Yes |
| `user` | User profile data (JSON) | Yes |
| `logged_in_users` | Array of logged-in accounts | Yes (set to []) |
| `pc2_session` | Particle wallet session | Yes |
| `pc2_config` | PC2 connection config | Yes |

**User Preferences (Non-Sensitive - Persist):**
| Key | Purpose |
|-----|---------|
| `pc2_dark_mode` | Dark mode toggle |
| `pc2_font_size` | Font size preference |
| `pc2_notify_sound` | Sound notification pref |
| `pc2_notify_desktop` | Desktop notification pref |
| `user_preferences` | General preferences |
| `auto_arrange` | Desktop auto-arrange |

**State Flags (Non-Sensitive):**
| Key | Purpose |
|-----|---------|
| `has_visited_before` | First visit detection |
| `pc2_explicitly_disconnected` | User disconnected wallet |

### Security Decisions

1. **Backend as Source of Truth**: AI conversations are stored ONLY in the backend SQLite database. Removed redundant localStorage caching to reduce data duplication and attack surface.

2. **Comprehensive Logout Cleanup**: All sensitive keys are now cleared on logout including `puter_auth_token` and `pc2_explicitly_disconnected`.

3. **Wallet-Scoped Data**: Any data that was previously stored with wallet address in the key has been migrated to backend storage with proper wallet isolation.

4. **No API Keys in Frontend**: API keys are stored ONLY in the backend with AES-256-GCM encryption, never in localStorage.

### Files Modified

- `src/gui/src/UI/AI/UIAIChat.js` - Removed localStorage backup writes
- `src/gui/src/initgui.js` - Added `puter_auth_token` and `pc2_explicitly_disconnected` to logout cleanup

### Future Considerations

- **HttpOnly Cookies**: Consider moving session tokens from localStorage to HttpOnly cookies for XSS protection
- **Content Security Policy**: Add CSP headers to prevent XSS attacks that could access localStorage
- **Token Rotation**: Implement session token rotation on sensitive operations

---

## HTTPS Reverse Proxy Mixed Content Fix (January 2025)

### Problem

When PC2 Node runs behind an HTTPS-terminating reverse proxy (like Nginx), applications showed blank white screens due to **Mixed Content** browser blocking. The browser refused to load `http://` iframes on an `https://` page.

**Console Error:**
```
Mixed Content: The page at 'https://38.242.211.112/' was loaded over HTTPS, 
but requested an insecure frame 'http://38.242.211.112/apps/calculator/index.html...'. 
This request has been blocked; the content must be served over HTTPS.
```

### Root Cause

The backend used `req.protocol` to construct app URLs:
```typescript
const baseUrl = req.protocol + '://' + req.get('host');
// Returns: http://38.242.211.112 (WRONG behind Nginx!)
```

When Nginx terminates HTTPS and proxies to the backend over HTTP, `req.protocol` returns `'http'` even though the original client request was HTTPS.

### Solution

Created a `getBaseUrl()` utility function that checks reverse proxy headers:

```typescript
function getBaseUrl(req: Request): string {
  const host = req.get('host') || 'localhost';
  
  // Check x-forwarded-proto header (set by Nginx)
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (forwardedProto === 'https') {
    return `https://${host}`;
  }
  
  // Check origin header (contains original protocol)
  const origin = req.headers.origin;
  if (origin && typeof origin === 'string' && origin.startsWith('https://')) {
    return `https://${host}`;
  }
  
  // Fallback to req.protocol for direct connections
  return `${req.protocol}://${host}`;
}
```

### Files Modified

| File | Changes |
|------|---------|
| `pc2-node/src/api/other.ts` | Added `getBaseUrl()`, replaced 5 occurrences of `baseUrl` construction |
| `pc2-node/src/api/info.ts` | Added `getBaseUrl()`, replaced 1 occurrence in `/get-launch-apps` |
| `pc2-node/src/api/apps.ts` | Added `getBaseUrl()`, replaced 1 occurrence in `/apps/:name` handler |
| `pc2-node/src/static.ts` | Added `getBaseUrl()`, fixed Particle Auth API origin injection |

### Nginx Configuration Required

The Nginx reverse proxy must forward the original protocol:

```nginx
location / {
    proxy_pass http://localhost:4200;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;  # CRITICAL!
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

### Verification

After the fix, the `/apps/calculator` endpoint returns HTTPS URLs when accessed via HTTPS:

```bash
curl -H "X-Forwarded-Proto: https" https://your-server/apps/calculator
# Returns: {"index_url":"https://your-server/apps/calculator/index.html"...}
```

### Apps Fixed

| App | Status |
|-----|--------|
| dApp Centre | ✅ Working |
| Solitaire | ✅ Working |
| Camera | ✅ Working |
| All built-in apps | ✅ Working |
| Calculator (WASM) | ✅ Working |
| File Processor (WASM) | ✅ Working |

### Deployment Notes

1. **Contabo VPS (38.242.211.112)**: Successfully deployed and tested
2. **test7.ela.city**: Domain alias pointing to same server
3. **"Not Secure" Warning**: This is normal for IP addresses (no CA issues certs for IPs) and self-signed certificates. Traffic is still encrypted.

### Commits

- `f9f655eb`: Added `getBaseUrl()` to `other.ts` and `info.ts`
- `8b667463`: Added `getBaseUrl()` to `apps.ts` for WASM apps
- `9b22e5d8`: Added `getBaseUrl()` to `static.ts` for Particle Auth

---

## Wildcard SSL Certificate for *.ela.city (January 2025)

### Overview

Implemented automatic SSL certificate provisioning for all PC2 nodes using a wildcard Let's Encrypt certificate. Any subdomain `*.ela.city` now has valid HTTPS without manual certificate setup per user.

### Architecture

```
User Browser
    │
    │ https://test7.ela.city
    ▼
┌─────────────────────────────────────┐
│  Super Node (69.164.241.210)        │
│  ├── PC2 Web Gateway (Node.js)      │
│  │   └── Wildcard SSL: *.ela.city   │
│  └── Routes to PC2 user nodes       │
└─────────────────────────────────────┘
    │
    │ http://38.242.211.112:4200
    ▼
┌─────────────────────────────────────┐
│  User's PC2 Node (Contabo)          │
│  └── Local PC2 instance             │
└─────────────────────────────────────┘
```

### Implementation Details

**Certificate Provisioning:**

1. **Tool**: `acme.sh` with Let's Encrypt CA
2. **Challenge Type**: DNS-01 (via GoDaddy API)
3. **Certificate Scope**: `*.ela.city` + `ela.city` (wildcard + apex)
4. **Auto-Renewal**: acme.sh cron job handles renewal before expiration

**Certificate Location on Super Node:**
```
/etc/nginx/ssl/wildcard/
├── ela.city.crt    # Full chain certificate
└── ela.city.key    # Private key
```

**Web Gateway SSL Configuration:**

Updated `/root/pc2/web-gateway/ssl-config.js`:
```javascript
export function getSSLCerts() {
  const wildcardPath = "/etc/nginx/ssl/wildcard";
  try {
    return {
      key: fs.readFileSync(wildcardPath + "/ela.city.key"),
      cert: fs.readFileSync(wildcardPath + "/ela.city.crt"),
    };
  } catch (err) {
    // Fallback chain...
  }
}
```

**HTTP to HTTPS Redirect:**

Added automatic redirect handler in Web Gateway:
```javascript
function handleHttpRedirect(req, res) {
  const host = req.headers.host || 'ela.city';
  const redirectUrl = 'https://' + host + req.url;
  res.writeHead(301, { 'Location': redirectUrl });
  res.end();
}
```

### Files Modified on Super Node

| File | Changes |
|------|---------|
| `/root/pc2/web-gateway/index.js` | Updated SSL paths to use wildcard cert, added HTTP→HTTPS redirect |
| `/root/pc2/web-gateway/ssl-config.js` | Updated to load wildcard cert from `/etc/nginx/ssl/wildcard/` |

### Verification

```bash
# Check certificate details
echo | openssl s_client -connect test7.ela.city:443 -servername test7.ela.city 2>/dev/null | openssl x509 -noout -subject -issuer

# Expected output:
subject=CN=*.ela.city
issuer=C=US, O=Let's Encrypt, CN=E7

# Check HTTP redirect
curl -sI http://test7.ela.city/
# HTTP/1.1 301 Moved Permanently
# Location: https://test7.ela.city/
```

### Certificate Renewal

The certificate renews automatically via acme.sh cron. Manual renewal if needed:

```bash
# On Super Node (69.164.241.210)
export GD_Key='<godaddy_key>'
export GD_Secret='<godaddy_secret>'
/root/.acme.sh/acme.sh --renew -d '*.ela.city' -d 'ela.city' --force
systemctl restart pc2-gateway
```

### User Experience

| Before | After |
|--------|-------|
| Users see "Not Secure" warning | Valid HTTPS with lock icon 🔒 |
| Each user needed manual cert setup | Zero configuration required |
| Self-signed certs caused browser warnings | Let's Encrypt trusted by all browsers |

### Benefits for New Users

1. **Zero Setup**: Pick a subdomain, register, get instant HTTPS
2. **No Port Forwarding Required for SSL**: Super Node handles SSL termination
3. **Professional Appearance**: No scary browser warnings
4. **SEO Friendly**: HTTPS is a ranking factor

---

## Local AI Setup UX Improvements (January 2025)

### Overview

Simplified the local AI (Ollama + DeepSeek) setup from a multi-step process to a single-click experience with model size selection.

### Before vs After

**Before:**
- Two separate buttons: "Install Ollama" and "Download Model"
- User had to understand the dependency order
- No model size options
- Confusing status messages

**After:**
- Single "Local AI Setup" section with model dropdown
- One-click "Install & Download" button
- Automatic detection of existing installations
- Clear progress feedback with dynamic timeouts

### Implementation

**Model Selection Options:**
| Model | Size | Use Case |
|-------|------|----------|
| `deepseek-r1:1.5b` | ~1GB | Fast responses, lower resource usage |
| `deepseek-r1:7b` | ~4.5GB | Balanced performance (default) |
| `deepseek-r1:8b` | ~5GB | Better quality |
| `deepseek-r1:14b` | ~9GB | High quality |
| `deepseek-r1:32b` | ~20GB | Best quality, requires significant resources |

**UI Flow:**
1. Settings → AI tab
2. Check current Ollama/model status automatically
3. Select desired model size from dropdown
4. Click "Install & Download"
5. Progress: "Installing Ollama..." → "Downloading model..." → "Ready!"

**Key Code Changes:**

`src/gui/src/UI/Settings/UITabAI.js`:
```javascript
// Model selection dropdown
<select id="ai-model-select">
  <option value="deepseek-r1:1.5b">DeepSeek R1 1.5B (~1GB)</option>
  <option value="deepseek-r1:7b" selected>DeepSeek R1 7B (~4.5GB)</option>
  <option value="deepseek-r1:8b">DeepSeek R1 8B (~5GB)</option>
  <option value="deepseek-r1:14b">DeepSeek R1 14B (~9GB)</option>
  <option value="deepseek-r1:32b">DeepSeek R1 32B (~20GB)</option>
</select>

// Dynamic timeout based on model size
const timeouts = {
  'deepseek-r1:1.5b': 120000,
  'deepseek-r1:7b': 300000,
  'deepseek-r1:8b': 360000,
  'deepseek-r1:14b': 600000,
  'deepseek-r1:32b': 1200000,
};
```

### Files Modified

| File | Changes |
|------|---------|
| `src/gui/src/UI/Settings/UITabAI.js` | Replaced two buttons with model selector + single setup button |

### User Experience

1. **Detection**: Automatically checks if Ollama is installed and which model is downloaded
2. **Progress**: Real-time status updates during installation
3. **Error Handling**: Clear error messages if installation fails
4. **Idempotent**: Safe to click multiple times - skips already-completed steps

---

## Current Production Status (January 2025)

### Super Node (69.164.241.210)

| Component | Status |
|-----------|--------|
| PC2 Web Gateway | ✅ Running |
| Wildcard SSL (*.ela.city) | ✅ Active, auto-renews |
| HTTP→HTTPS Redirect | ✅ Enabled |
| User Registry | ✅ 14 users registered |
| Active Proxy Support | ✅ For NAT traversal |

### Test Node (test7.ela.city → 38.242.211.112)

| Feature | Status |
|---------|--------|
| Valid HTTPS | ✅ via Super Node wildcard cert |
| All Apps | ✅ Working (no mixed content) |
| WASM Apps | ✅ Calculator, File Processor working |
| Particle Auth | ✅ Working |
| AI Chat | ✅ Working |
| Local AI Setup | ✅ Available in Settings |

### Known Issues

1. **Browser Cache**: Users may need to hard-refresh (Cmd+Shift+R) or use incognito to see new certificate
2. **File Move Operations**: Some edge cases in file move may still have issues (tracked separately)

---

*This document is a living guide and will be updated as the project evolves.*


---

## AgentKit Integration: Lessons Learned (January 2026)

### Successfully Implemented

We successfully implemented Phase 1 of the AgentKit integration roadmap with the following key achievements:

1. **Transaction Proposal System**
   - AI creates proposals, user approves via modal
   - Real-time countdown timers with expiration
   - Persistent storage in `agent_proposals` table (tied to wallet address)
   - Activity tab with live countdown and pending badge

2. **Dual-Account Architecture**
   - EOA (Core Wallet) for direct control
   - Agent Account (Universal/Smart Wallet) for AI-powered operations
   - AI correctly distinguishes between "my EOA wallet" and agent account

3. **Tool Integration Pattern**
   - AgentKit tools integrated as AI chat tools
   - Proper tool calling via Claude's `tool_choice` mechanism

### Critical Technical Lessons

#### 1. AI Tool Calling vs Text Generation

**Problem**: Claude was generating *text* that looked like tool results instead of actually *calling* the tools.

**Root Cause**: 
- Conversation history contained examples of "fake" tool calls (AI just outputting text)
- Claude learned from this pattern and continued it
- `tool_choice: auto` wasn't strong enough to override learned behavior

**Solution**:
```typescript
// Force at least one tool call
(sdkParams as any).tool_choice = { type: 'any' };
```

**Lesson**: When tools are available and the user is requesting an action that requires tools, use `tool_choice: { type: 'any' }` to force actual tool usage. For conversational responses, `auto` is fine.

#### 2. Wallet Address Context Injection

**Problem**: AI was fabricating wallet addresses when user said "my EOA wallet".

**Root Cause**:
- AI didn't have the actual addresses in its context
- Tool descriptions saying "call get_wallet_info first" weren't followed
- AI would make up plausible-looking addresses

**Solution**: Inject wallet context directly into system prompt:
```typescript
const walletContext = `
<WALLET_CONTEXT>
CRITICAL: These are the user's ACTUAL wallet addresses.

EOA_WALLET: ${args.walletAddress}
AGENT_ACCOUNT: ${args.smartAccountAddress}

RULES:
- When user says "my EOA wallet", use EOA_WALLET address
- NEVER fabricate, guess, or use placeholder addresses
</WALLET_CONTEXT>
`;
```

**Lesson**: Don't rely on AI to call tools to get critical context. Inject it directly into the system prompt. The AI should have all necessary context upfront.

#### 3. Streaming Path vs Non-Streaming Path

**Problem**: Fixes applied to one code path didn't affect the other.

**Root Cause**: 
- `executeWithTools()` and `streamComplete()` had different message preparation logic
- Wallet context injection was only added to one path

**Solution**: Ensure both paths inject the same context. Consider extracting common logic.

**Lesson**: When AI chat has multiple code paths (streaming/non-streaming), ensure all paths receive the same context injection and tool configuration.

#### 4. jQuery Event Handler Conflicts

**Problem**: UIWindow's close button handler conflicted with custom handler.

**Root Cause**:
- UIWindow attaches its own click handler to `.window-close-btn`
- Adding another handler results in both running
- `e.stopPropagation()` only stops bubbling, not same-element handlers

**Solution**:
```javascript
// Remove UIWindow's handler, add our own
$closeBtn.off('click');
$closeBtn.on('click', customHandler);
```

**Lesson**: When extending UIWindow with custom behavior, explicitly remove default handlers before adding custom ones.

#### 5. Live Countdown Intervals

**Problem**: Countdown timers need to update every second but shouldn't create memory leaks.

**Solution**:
- Store interval ID in module-level variable
- Clear interval when sidebar closes
- Use data attributes on elements for state (`data-expires-at`)

**Pattern**:
```javascript
// Module level
let countdownIntervalId = null;

// On sidebar open
countdownIntervalId = setInterval(updateCountdowns, 1000);

// On sidebar close
if (countdownIntervalId) {
  clearInterval(countdownIntervalId);
  countdownIntervalId = null;
}
```

### Architecture Patterns That Worked Well

1. **Proposal State Machine**
   ```
   pending_approval → approved → executed
                   → rejected
                   → expired
                   → failed
   ```

2. **WebSocket Real-Time Updates**
   - Backend emits `agent:proposal:created` event
   - Frontend receives and shows modal immediately
   - Activity list updates in real-time

3. **Database Schema for Proposals**
   - Tied to `wallet_address` for multi-user support
   - Stores full transaction details for audit trail
   - Indexed by `created_at` for efficient sorting

### Additional Phase 1.5 Achievements (January 2026)

After Phase 1, we implemented several critical improvements:

1. **Swap/Convert Transactions**
   - `swap_primary_assets` tool using Particle's `createConvertTransaction`
   - AI can swap between USDC, USDT, ETH, BTC, SOL, BNB across chains
   - Real-time swap estimation before approval

2. **Balance Fetching via Particle**
   - AI now uses WebSocket to request balances from frontend
   - Frontend calls Particle's `getPrimaryAssets()` for accurate multi-chain data
   - Solves discrepancy between direct RPC queries and Particle's abstracted view

3. **UI/UX Polish**
   - Token icons from CoinGecko CDN (local assets not available)
   - Activity button in AI chat input area (opens wallet sidebar to Activity tab)
   - Toolbar icon order: Cloud | AI Chat | Wallet
   - Pending badge as circular red dot
   - Close button (X) dismisses modal without rejecting - can still approve from Activity

4. **Wallet Sidebar Improvements**
   - EOA button split: main area switches mode, arrow opens dropdown
   - CSS Grid for perfect button alignment (Universal/ESC same width as Send/Receive)
   - `box-sizing: border-box` on all button elements for consistent sizing

### Additional Technical Lessons

#### 6. WebSocket for Frontend-Backend Data Flow

**Problem**: AI needed accurate Particle-based balance data but Particle SDK runs in frontend.

**Solution**:
```typescript
// Backend sends request
this.io.to(room).emit('wallet-agent:get-balances', { requestId });

// Frontend responds
socket.on('wallet-agent:get-balances', async (data) => {
  const tokens = await this.getTokens(); // Uses Particle SDK
  socket.emit('wallet-agent:balances-response', { requestId, data: tokens });
});
```

**Lesson**: When browser-only SDKs (like Particle) have data the backend needs, use WebSocket as a bidirectional bridge.

#### 7. CSS Grid vs Flexbox for Perfect Alignment

**Problem**: Flexbox with `flex: 1` didn't perfectly align elements across multiple rows.

**Solution**:
```css
.wallet-mode-toggle, .account-sidebar-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
```

**Lesson**: Use CSS Grid with `1fr 1fr` for guaranteed 50/50 splits across rows. Flexbox `flex: 1` can have subtle sizing differences.

#### 8. External CDN for Token Icons

**Problem**: Local token icon directory didn't exist or was incomplete.

**Solution**:
```javascript
const TOKEN_ICONS = {
  'ETH': 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  'USDC': 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
  // ...
};
```

**Lesson**: For token icons, use CoinGecko CDN - it's reliable and comprehensive.

### Recommendations for Future Features

1. **Session Keys (Phase 3)**
   - Will require UI for setting spending limits
   - Consider time-based vs transaction-based limits
   - Need revocation mechanism

2. **Multi-Chain Intelligence (DEFERRED)**
   - Deferred to later in roadmap
   - AI already fetches balances via Particle - foundation is in place
   - When revisited: recommend optimal execution paths, show gas comparison

3. **Personal AI Memory (Phase 4)**
   - Store contacts: "Send Bob $20" should work
   - Remember preferences: preferred chains, max gas
   - Encrypted storage for sensitive data

4. **Buy/Sell Non-Primary Tokens (Phase 2)**
   - Requires token discovery UI
   - Uses `createBuyTransaction` / `createSellTransaction`
   - Build token search and selection interface first

### Files Modified in Phase 1 & 1.5

| File | Purpose |
|------|---------|
| `pc2-node/src/services/ai/tools/AgentKitTools.ts` | Tool definitions for transfers and swaps |
| `pc2-node/src/services/ai/tools/AgentKitExecutor.ts` | Proposal creation and execution |
| `pc2-node/src/services/ai/tools/ToolExecutor.ts` | WebSocket balance fetching from frontend |
| `pc2-node/src/services/ai/AIChatService.ts` | Wallet context injection |
| `pc2-node/src/services/ai/providers/ClaudeProvider.ts` | Tool choice configuration |
| `pc2-node/src/api/wallet.ts` | Proposal API endpoints |
| `pc2-node/src/storage/database.ts` | Proposal storage |
| `src/gui/src/UI/UIAccountSidebar.js` | Activity list with countdown, EOA button split, CSS Grid alignment |
| `src/gui/src/UI/UIWindowTransactionConfirm.js` | Approval modal, dismiss vs reject, CDN token icons |
| `src/gui/src/UI/AI/UIAIChat.js` | Activity button, toolbar icon order |
| `src/gui/src/services/WalletService.js` | Proposal management, WebSocket balance response |
| `src/gui/src/css/style.css` | Activity button styling |

### Remaining AgentKit Tasks (To Resume Later)

**Task File Location:** `.cursor/tasks/agentkit-integration/agentkit-integration.md`

| Priority | Feature | Effort | Description |
|----------|---------|--------|-------------|
| 1 | **Session Keys** | High | True autonomy - AI acts within spending limits without per-tx approval. Requires UI for limit config, ERC-4337 session key support. |
| 2 | **Buy/Sell Non-Primary Tokens** | Medium | Trade any token via `createBuyTransaction`/`createSellTransaction`. Requires token discovery/search UI first. |
| 3 | **Security Framework** | Medium | Spending limits (per-tx, daily, monthly), action whitelist, audit logging for compliance. |
| 4 | **Personal AI Memory** | High | Persistent contacts ("Send Bob $20"), preferences, encrypted storage. Foundation for proactive AI. |
| 5 | **MCP Server** | Medium | Expose PC2 wallet to Claude Desktop, Cursor, and other MCP-compatible agents. |
| 6 | **Streaming Payments** | High | Superfluid integration for node monetization - pay per compute/storage/inference. |
| - | **Multi-Chain Intelligence** | DEFERRED | AI recommends optimal execution paths. Foundation already in place via Particle balance fetching. |

**To resume:** Open `.cursor/tasks/agentkit-integration/agentkit-integration.md` and continue from pending todos.

---
