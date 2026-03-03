# PC2 Agent Handover Document

> **Purpose:** Complete contextual awareness for AI agents working on PC2
> **Last Updated:** 2026-02-26
> **Current Status:** v1.1 branch tested on 2 Jetsons, awaiting Sash's validation + merge to main

---

## Quick Context

**PC2 (Personal Cloud Computer)** is a self-hosted, sovereign cloud platform built on Elastos. Users run their own "personal cloud" on hardware they control (VPS, Raspberry Pi, Mac, etc.), accessible via friendly URLs like `alice.ela.city`.

**Key Principle:** "Your keys, your data, your cloud."

---

## 🛑 CRITICAL: ONLY RUN pc2-node - NEVER RUN MAIN PUTER

**THIS IS THE MOST IMPORTANT RULE:**

```bash
# CORRECT - Always run from pc2-node directory
cd pc2-node && npm run dev    # Development
cd pc2-node && npm start      # Production
```

**NEVER run `npm run dev` or `npm start` from the repository root!**

- **`pc2-node/`** = The standalone PC2 server on port 4200 - **RUN THIS**
- **Main Puter** (`src/backend/`, `src/gui/`) = Reference code only - **NEVER RUN**

If you see "Subdomain not found" or `puter.localhost`, you ran the wrong server.

---

## Project Vision (From Rong, Elastos Founder)

Three WebSpaces being built:
1. **`https://`** - Web2 backward compatibility (✅ Working - `*.ela.city`)
2. **`localhost://`** - Carrier connecting mobile↔PC2, PC2↔PC2 (Infrastructure ready)
3. **`elastos://`** - Blockchain oracles, smart contract data (Future)

**Domain Ownership (CRC DAO):**
- `pc2.net` → Personal WebSpaces
- `ela.net` → Personal AppCapsules  
- `ela.city` → General purpose (current default)

---

## Current Infrastructure

### Production Deployment

| Component | Location | Status |
|-----------|----------|--------|
| **Flagship Supernode** | 69.164.241.210 (InterServer) | ✅ Running |
| **Secondary Node** | 38.242.211.112 (Contabo) | ✅ Running |
| **Test Domain** | test7.ela.city | ✅ Working |

### Supernode Services (69.164.241.210)

| Service | Port | Purpose |
|---------|------|---------|
| Boson DHT | 39001/UDP | Decentralized identity, peer discovery |
| Active Proxy | 8090/TCP | NAT traversal relay (fallback, slow) |
| WireGuard | 51820/UDP | NAT traversal tunnel (primary, fast) |
| Web Gateway | 80/443 | Subdomain routing with SSL, gzip compression, keep-alive pooling |

### How Routing Works

**Home hardware (Jetson, Pi) - via WireGuard tunnel:**
```
User Browser                    Supernode                     PC2 Node (home)
     │                              │                            │
     │ https://alice.ela.city ─────►│                            │
     │                              │                            │
     │                              │── HTTP via WG tunnel ─────►│
     │                              │   10.100.0.x:4200          │ (kernel-level,
     │                              │   (keep-alive pooled)      │  keep-alive reuse)
     │◄──── gzip compressed ────────│◄─────── Response ──────────│
```

**Gateway performance layer** (transparent, no behavior change):
- Gzip compression: text responses compressed 74-77% (3MB JS bundle → 816KB)
- Keep-alive pooling: TCP connections to WireGuard peers reused (saves ~240ms/request)
- Cache headers: static assets get `Cache-Control` when node doesn't set its own
- 206 bypass: Range/partial responses are never compressed (preserves byte-range semantics)

**Video streaming layer** (IPFS byte-range streaming):
- All file-serving endpoints support `Range` requests (HTTP 206 Partial Content)
- Streams directly from IPFS blockstore -- memory usage ~256 KB per request regardless of file size
- Enables instant video playback and seeking for 2GB+ files on memory-constrained devices (Jetson)
- Routes: `/ipfs/:cid`, `/public/:wallet/*`, `/file?uid=`, authenticated `/read`
- Key files: `ipfs.ts` (getFileStream/getFileSize), `public.ts` (streamToResponse helper)

**VPS (public IP) - direct HTTP:**
```
User Browser                    Supernode                     PC2 Node (VPS)
     │                              │                            │
     │ https://bob.ela.city ───────►│                            │
     │                              │─── HTTP direct ──────────►│
     │                              │    public-ip:4200          │
     │◄──────────── Response ───────│◄─────── Response ──────────│
```

### Transport Priority (ConnectivityService)

The node automatically selects the best transport:
1. **WireGuard** (primary) - kernel-level UDP tunnel, near-localhost speed
2. **Boson Active Proxy** (fallback) - serial TCP relay, slow but works everywhere
3. **Direct** - public IP users (VPS), no tunnel needed

### WireGuard Architecture

**Key files:**
- `pc2-node/src/services/wireguard/WireGuardService.ts` - Client tunnel management (kernel + wireguard-go userspace)
- `pc2-node/src/services/boson/ConnectivityService.ts` - Transport priority logic + automatic fallback
- `scripts/install-arm.sh` - **One-command installer** for ARM (Pi/Jetson). Installs Node.js, PM2, WireGuard, builds PC2, starts it. Includes Jetson wireguard-go fallback.
- `scripts/setup-node.sh` - Standalone WireGuard system prep (can also be run separately)
- `deploy/web-gateway/index.js` - `/api/wg/register` provisioning endpoint

**User flow (one command, then wizard):**
1. Run `curl -sSL .../install-arm.sh | bash` (installs EVERYTHING including WireGuard)
2. Open browser, login with wallet, complete setup wizard (choose domain name)
3. Node auto-provisions WireGuard tunnel to supernode
4. Domain is live at `https://username.ela.city`
5. If WireGuard fails (blocked network, etc.), auto-falls back to Boson relay

**WireGuard modes (auto-detected by WireGuardService.ts):**
- `kernel` -- Linux kernel module (regular Linux, Pi, or Jetson with manually compiled .ko). Best speed.
- `userspace` -- wireguard-go (Jetson out-of-box, NVIDIA custom kernel lacks module). Good speed, zero kernel work needed. Install script builds from source automatically.
- `none` -- Falls back to Boson Active Proxy. Slower but works everywhere.

**Critical implementation details (bugs found and fixed in previous sessions):**
- `sudo` strips env vars: `WG_QUICK_USERSPACE_IMPLEMENTATION` must be set BEFORE `sudo -E` (not via Node.js env option). `wgQuickCmd()` builds: `WG_QUICK_USERSPACE_IMPLEMENTATION=wireguard-go sudo -E wg-quick up /path`
- Sudoers must include `SETENV:` for `sudo -E` to work: `ALL ALL=(root) NOPASSWD: SETENV: /usr/bin/wg-quick up *, /usr/bin/wg-quick down *`
- `detectMode()` uses `modinfo` (not `modprobe`) to check for kernel module -- doesn't need root, no noisy sudo errors
- Install script checks if existing sudoers has `SETENV` -- if old rule lacks it (returning user from before fix), it regenerates

**Supernode config-driven (config/config.json):**
```json
{
  "boson": {
    "supernodes": [{ "id": "...", "address": "69.164.241.210", "port": 39001, "proxyPort": 8090, "gatewayUrl": "https://69.164.241.210" }]
  }
}
```

---

## Repository Structure

```
pc2.net/
├── pc2-node/                    # Main PC2 node application
│   ├── src/                     # TypeScript source
│   │   ├── api/                 # REST API handlers
│   │   ├── services/            # Core services
│   │   │   ├── ai/              # AI chat integration
│   │   │   └── boson/           # Boson network services
│   │   ├── storage/             # IPFS filesystem
│   │   ├── websocket/           # Real-time updates
│   │   └── utils/               # Shared utilities
│   ├── frontend/                # Built frontend files
│   ├── dist/                    # Compiled backend
│   └── scripts/                 # Build scripts
├── packages/
│   └── particle-auth/           # Wallet authentication (React)
├── src/
│   ├── gui/                     # Puter GUI (JavaScript)
│   ├── backend/                 # Original Puter backend
│   └── particle-auth/           # Built particle-auth (served by server)
├── docs/
│   └── core/                    # Core documentation
│       ├── STRATEGIC_IMPLEMENTATION_PLAN.md
│       ├── plans/               # Roadmaps and plans
│       └── AGENT_HANDOVER.md    # This file
└── .cursor/
    └── rules/                   # AI coding rules (MUST READ)
```

---

## Key Files to Know

### Backend (pc2-node/src/)

| File | Purpose |
|------|---------|
| `index.ts` | Main entry point, Express app setup |
| `static.ts` | Static file serving, SDK injection, API origin handling |
| `api/apps.ts` | App metadata API |
| `api/other.ts` | Driver calls, file operations |
| `api/info.ts` | Launch apps, system info |
| `api/access-control.ts` | Wallet-based access control |
| `services/boson/BosonService.ts` | Boson network orchestration |
| `services/boson/ConnectivityService.ts` | Supernode connection |
| `services/boson/ActiveProxyClient.ts` | NAT traversal client |
| `utils/urlUtils.ts` | **CRITICAL** - Base URL resolution for Active Proxy |
| `storage/filesystem.ts` | IPFS-based file storage |

### Frontend

| File | Purpose |
|------|---------|
| `pc2-node/frontend/index.html` | Main GUI with WebSocket interceptor |
| `packages/particle-auth/` | Wallet authentication React app |
| `src/gui/src/UI/` | Settings, menus, desktop components |

---

## Critical Patterns & Gotchas

### 1. Active Proxy URL Resolution

**Problem:** When accessed via `test7.ela.city`, the Active Proxy modifies the `Host` header to show internal IP:port (`38.242.211.112:4200`) instead of the public domain.

**Solution:** Use `getBaseUrl(req, bosonService)` from `utils/urlUtils.ts` everywhere you construct URLs. It falls back to `bosonService.getPublicUrl()` when detecting IP:port pattern.

```typescript
import { getBaseUrl } from '../utils/urlUtils.js';

// In any route handler:
const bosonService = req.app?.locals?.bosonService;
const baseUrl = getBaseUrl(req, bosonService);
```

### 2. WebSocket Protocol

**Problem:** HTTPS pages must use `wss://` not `ws://` for WebSocket connections.

**Solution:** The interceptor in `frontend/index.html` uses:
```javascript
const localOrigin = window.location.origin.replace(/^https/, 'wss').replace(/^http/, 'ws');
```

### 3. Particle Auth Build Sync

**CRITICAL:** After editing `packages/particle-auth`, you MUST sync to `src/particle-auth`:

```bash
cd packages/particle-auth && npm run build
rm -rf /path/to/pc2.net/src/particle-auth
cp -r dist /path/to/pc2.net/src/particle-auth
```

### 4. Browser Caching

After deploying changes, users MUST hard refresh (`Cmd+Shift+R` / `Ctrl+Shift+R`). Old cached `index.html` causes mysterious failures.

---

## Build & Deploy Commands

### Local Development

```bash
# Kill any existing process
lsof -ti:4200 | xargs kill -9 2>/dev/null || true

# Build and start
cd pc2-node
npm run build:backend
npm run build:frontend
npm start
```

### Deploy to VPS (38.242.211.112)

```bash
# SSH access
ssh root@38.242.211.112
# Password: [ROTATED -- stored in password manager, not in git]

# Update and restart
cd ~/pc2.net
git pull origin main
cd pc2-node
npm run build:backend
pm2 restart pc2    # or: systemctl restart pc2-node (on older setups)
```

---

## Current State (2026-02-21)

### What's Working

- ✅ Wallet-based authentication (Particle Network)
- ✅ File management (IPFS storage)
- ✅ Apps (Calculator, Editor, Viewer, Player, Terminal, PDF Reader)
- ✅ AI Chat (OpenAI, Anthropic, Groq, local Ollama)
- ✅ Access control (owner/admin/member roles)
- ✅ Backup & restore
- ✅ NAT traversal via WireGuard (primary) + Boson Active Proxy (fallback)
- ✅ Subdomain routing (`*.ela.city`)
- ✅ Auto-update notifications
- ✅ WireGuard kernel + wireguard-go userspace (Jetson automatic fallback)
- ✅ One-command ARM installer (`install-arm.sh`) with PM2 auto-start on boot
- ✅ Video streaming with HTTP Range/206 support (IPFS byte-range, memory-efficient)
- ✅ Large file uploads (multi-GB, disk-based streaming via multer)
- ✅ Gateway gzip compression + keep-alive pooling
- ✅ PDF and image rendering (fixed binary data corruption)

### Recently Fixed (2026-02-21)

1. **WireGuard on Jetson** - wireguard-go userspace fallback (NVIDIA custom kernel lacks module)
2. **sudo env stripping** - `WG_QUICK_USERSPACE_IMPLEMENTATION` now set before `sudo -E`, SETENV in sudoers
3. **Video streaming regression** - `ipfs.getFileSize()` was called on every request; now uses DB metadata, IPFS only for Range requests
4. **PDF blank pages** - Binary data was corrupted by `content.toString('utf8')`; now sends raw Buffer for binary files
5. **Image loading errors** - Same binary corruption fix as PDFs
6. **Accept-Ranges header** - Now only set for video/audio types; was causing PDF.js to attempt broken range-based loading
7. **100MB+ upload crashes** - Switched multer to diskStorage, IPFS streaming upload
8. **Gateway 206 compression** - Partial content responses are never gzipped (preserves byte-range semantics)
9. **install-arm.sh rewrite** - Now includes WireGuard setup, PM2 (not systemd), wireguard-go for Jetson, boot persistence

### Recently Fixed (2026-02-23/24)

10. **AV1/Firefox playback** — Player now shows clear error for unsupported containers (MKV/AVI/MOV in Firefox), added `.av1` file support
11. **IPFS DHT broadcasting** — Switched to client-mode DHT with 50-peer connection limit, private files no longer announced to IPFS network
12. **Active Proxy overwriting WireGuard** — ConnectivityService now prefers WireGuard on reconnect, Active Proxy can't overwrite a working WireGuard endpoint
13. **Gateway stale connections** — Health-check every 60s probes WireGuard peers, auto-flushes dead sockets, error-triggered flush on ECONNREFUSED
14. **PM2 auto-start** — `pm2 startup systemd` integrated into install script for boot persistence
15. **File creation error** — `window.refresh_item_container` exposed globally (was missing)
16. **MKV double-click** — Added to file-to-player associations
17. **Large upload timeout** — Added timeout wrappers to IPFS storeFile/storeFileStream with progress logging

### Pending Tasks

- [ ] Merge `feature/jetson-gpu-acceleration` to main (after community Jetson testing passes clean)
- [ ] Large file upload stalling at ~85% on 2.5GB+ (ulimit fix pending verification on Jetson)
- [ ] Wallpaper not loading via gateway (URL origin mismatch)
- [ ] Debian package (.deb) for Raspberry Pi
- [ ] macOS package (.dmg)
- [ ] Multi-domain support (pc2.net, ela.net)
- [ ] P2P messaging between PC2 nodes
- [ ] See [ROADMAP.md](./ROADMAP.md) for full strategic roadmap

---

## Documentation Map

| Document | Purpose | When to Read |
|----------|---------|--------------|
| **This file** | Quick context, key patterns | First |
| [Strategic Plan](STRATEGIC_IMPLEMENTATION_PLAN.md) | Full project history, detailed phases | Deep dive |
| [Network Architecture Plan](plans/decentralized_network_architecture.plan.md) | Decentralization vision, P2P design | Future planning |
| [Infrastructure Architecture](../pc2-infrastructure/ARCHITECTURE.md) | Supernode setup, protocol details | Infrastructure work |
| [Supernode Guide](../pc2-infrastructure/SUPERNODE_OPERATOR_GUIDE.md) | How to run a supernode | Deploying supernodes |

---

## Coding Rules (MUST READ)

Located in `.cursor/rules/`:

| Rule File | Key Points |
|-----------|------------|
| `codequality.mdc` | **CRITICAL** - Never call hooks in JSX, no code duplication |
| `workflow.mdc` | Task-first approach, no coding without agreed task |
| `general.mdc` | Component patterns, state management |
| `typescript.mdc` | TypeScript best practices |

**Top Anti-Patterns to Avoid:**
1. ❌ Calling React hooks inside JSX
2. ❌ Duplicating code/constants across files
3. ❌ Components over 300 lines
4. ❌ Inline utility functions in components
5. ❌ Forgetting to use `getBaseUrl(req, bosonService)`

---

## Quick Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Apps show "invalid response" | Old cached index.html | Hard refresh browser |
| API origin shows IP:port | Not using getBaseUrl with bosonService | Import and use shared utility |
| WebSocket fails on HTTPS | Using ws:// instead of wss:// | Check interceptor regex |
| Particle auth not updating | Build not synced to src/ | Run sync command |
| Node won't start | Port 4200 in use | Kill existing process |
| Apps blank on HTTPS | Mixed content | Ensure all URLs use getBaseUrl |

---

## Key Contacts & Resources

- **Repository:** github.com/Elacity/pc2.net
- **Supernode SSH:** root@38.242.211.112 (password rotated -- see password manager)
- **Flagship Supernode:** 69.164.241.210
- **Test URL:** https://test7.ela.city

---

## Starting a New Task

1. **Read this document** - You're doing it now ✓
2. **Check `.cursor/rules/`** - Especially `codequality.mdc`
3. **Understand the task** - Create task file in `.cursor/tasks/` if complex
4. **Check existing patterns** - Look for similar code before writing new
5. **Test locally first** - Then deploy to VPS
6. **Update docs** - Keep this handover current

---

*This document should be updated whenever significant changes are made to the project.*
