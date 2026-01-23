# PC2 Agent Handover Document

> **Purpose:** Complete contextual awareness for AI agents working on PC2
> **Last Updated:** 2026-01-23
> **Current Status:** MVP v1.0.0 Complete, Production Deployed

---

## Quick Context

**PC2 (Personal Cloud Computer)** is a self-hosted, sovereign cloud platform built on Elastos. Users run their own "personal cloud" on hardware they control (VPS, Raspberry Pi, Mac, etc.), accessible via friendly URLs like `alice.ela.city`.

**Key Principle:** "Your keys, your data, your cloud."

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
| Active Proxy | 8090/TCP | NAT traversal for nodes behind firewalls |
| Web Gateway | 80/443 | Subdomain routing with SSL |

### How Routing Works

```
User Browser                    Supernode                     PC2 Node
     │                              │                            │
     │ https://test7.ela.city ──────►│                            │
     │                              │ DNS points here            │
     │                              │                            │
     │                              │ Active Proxy relay ────────►│
     │                              │                            │
     │◄──────────── Response ───────│◄─────── Response ──────────│
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
# Password: Bella2822!

# Update and restart
cd /root/pc2-node/pc2.net
git pull origin main
cd pc2-node
npm run build:backend
systemctl restart pc2-node
```

---

## Current State (2026-01-23)

### What's Working

- ✅ Wallet-based authentication (Particle Network)
- ✅ File management (IPFS storage)
- ✅ Apps (Calculator, Editor, Viewer, Player, Terminal)
- ✅ AI Chat (OpenAI, Anthropic, Groq, local Ollama)
- ✅ Access control (owner/admin/member roles)
- ✅ Backup & restore
- ✅ NAT traversal via Active Proxy
- ✅ Subdomain routing (`test7.ela.city`)
- ✅ Auto-update notifications

### Recently Fixed (2026-01-23)

1. **Apps not opening via domain** - Fixed URL resolution for Active Proxy
2. **WebSocket Mixed Content** - Fixed wss:// protocol handling
3. **API origin detection** - Created shared `urlUtils.ts`

### Pending Tasks

- [ ] Debian package (.deb) for Raspberry Pi
- [ ] macOS package (.dmg)
- [ ] Multi-domain support (pc2.net, ela.net)
- [ ] P2P messaging between PC2 nodes
- [ ] DHT participation for PC2 nodes

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
- **Supernode SSH:** root@38.242.211.112 (Bella2822!)
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
