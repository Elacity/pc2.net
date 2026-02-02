# PC2 Architecture Overview: Self-Hosted Sovereign Cloud

**Version:** 2.0  
**Date:** 2026-01-22  
**Status:** Production MVP Complete - Live Infrastructure Deployed

---

## 🎯 Executive Summary

**PC2** is a **self-hosted, self-contained personal cloud** that runs entirely on user-controlled hardware. Unlike traditional cloud services (Puter, Dropbox, Google Drive), PC2 gives users complete sovereignty over their data, computation, and software - all while providing a modern, Puter-compatible interface accessible from anywhere via `*.ela.city` subdomains.

### What's Deployed Today

| Component | Status | Location |
|-----------|--------|----------|
| **Super Node (Primary)** | ✅ Live | 69.164.241.210 (InterServer) |
| **Super Node (Secondary)** | ✅ Live | 38.242.211.112 (Contabo) |
| **Web Gateway** | ✅ Live | https://*.ela.city |
| **Boson DHT** | ✅ Running | Port 39001/UDP |
| **Active Proxy** | ✅ Running | Port 8090/TCP |
| **Wildcard SSL** | ✅ Valid | Let's Encrypt |

### Key Differentiators

| Feature | Puter (Cloud Service) | PC2 (Self-Hosted) |
|---------|----------------------|-------------------|
| **Data Location** | Provider's servers | User's hardware |
| **Control** | Provider controls access | User has full control |
| **Computation** | Provider's servers | User's hardware (WASM) |
| **Identity** | Email/password | Wallet + DID (decentralized) |
| **NAT Traversal** | N/A | Boson Active Proxy |
| **Global Access** | Provider's domain | yourname.ela.city |
| **Updates** | Provider pushes | User-initiated (macOS-style) |

---

## 📐 System Architecture

### Production Network Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INTERNET                                           │
│                                                                              │
│  ┌─────────────────────┐     DNS: *.ela.city → 69.164.241.210               │
│  │   User's Browser    │                                                    │
│  │                     │                                                    │
│  │  https://alice.ela.city ──────────────────────────────────────┐          │
│  └─────────────────────┘                                         │          │
│                                                                  │          │
└──────────────────────────────────────────────────────────────────┼──────────┘
                                                                   │
                                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SUPER NODE (69.164.241.210)                               │
│                                                                              │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐           │
│  │   Web Gateway   │   │   Boson DHT     │   │  Active Proxy   │           │
│  │    :80/443      │   │    :39001/UDP   │   │    :8090/TCP    │           │
│  │                 │   │                 │   │                 │           │
│  │ - Wildcard SSL  │   │ - Node registry │   │ - NAT traversal │           │
│  │ - Subdomain     │   │ - DHT lookups   │   │ - Session relay │           │
│  │   routing       │   │ - Peer discovery│   │ - Port mapping  │           │
│  │ - WebSocket     │   │                 │   │   25000-30000   │           │
│  │   proxy         │   │                 │   │                 │           │
│  └────────┬────────┘   └─────────────────┘   └────────┬────────┘           │
│           │                                           │                     │
│           │ Registry Lookup                           │ Session Relay       │
│           │                                           │                     │
│           ▼                                           ▼                     │
│  ┌──────────────────────────────────────────────────────────────┐          │
│  │                     Username Registry                         │          │
│  │  {                                                            │          │
│  │    "alice": { endpoint: "http://1.2.3.4:4200" },             │          │
│  │    "bob":   { endpoint: "proxy://8090/session123" }  ← NAT   │          │
│  │  }                                                            │          │
│  └──────────────────────────────────────────────────────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                              │                           │
                              ▼                           ▼
                 ┌───────────────────────┐   ┌───────────────────────┐
                 │  Alice's PC2 Node     │   │  Bob's PC2 Node       │
                 │  (VPS/Public IP)      │   │  (Home/Behind NAT)    │
                 │                       │   │                       │
                 │  Direct HTTP access   │   │  Active Proxy tunnel  │
                 └───────────────────────┘   └───────────────────────┘
```

### PC2 Node Internal Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PC2 NODE (User's Hardware)                           │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                          Express.js HTTP Server                        │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │  │
│  │  │    API Layer     │  │  Static Files    │  │   WebSocket.io   │    │  │
│  │  │   (REST/Auth)    │  │   (Frontend)     │  │  (Real-time)     │    │  │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Core Services Layer                            │  │
│  │                                                                        │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐      │  │
│  │  │   Auth     │  │  Storage   │  │   WASM     │  │    AI      │      │  │
│  │  │ (Particle) │  │  (IPFS)    │  │  Runtime   │  │  Service   │      │  │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘      │  │
│  │                                                                        │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐      │  │
│  │  │   Boson    │  │  Backup/   │  │  Update    │  │  Access    │      │  │
│  │  │  Service   │  │  Restore   │  │  Service   │  │  Control   │      │  │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘      │  │
│  │                                                                        │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                      │  │
│  │  │ Terminal   │  │ Scheduler  │  │  Resource  │                      │  │
│  │  │  Service   │  │  Service   │  │  Monitor   │                      │  │
│  │  └────────────┘  └────────────┘  └────────────┘                      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                            Data Layer                                  │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐      │  │
│  │  │  SQLite    │  │   IPFS     │  │   File     │  │  Identity  │      │  │
│  │  │  Database  │  │   Node     │  │   System   │  │   Store    │      │  │
│  │  │            │  │  (Helia)   │  │  (Local)   │  │ (Ed25519)  │      │  │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🌐 Boson Network Integration

### Overview

PC2 integrates with the Boson Network (evolved from Elastos Carrier) for:
- **Decentralized Identity**: Ed25519 keypairs generate DID and Node ID
- **NAT Traversal**: Active Proxy enables nodes behind firewalls
- **Peer Discovery**: DHT-based node lookup
- **Username Registry**: Human-readable URLs via Web Gateway

### Boson Services (pc2-node/src/services/boson/)

| Service | Purpose | Key Methods |
|---------|---------|-------------|
| **IdentityService** | Node identity management | `generateIdentity()`, `getMnemonic()` |
| **UsernameService** | Web Gateway registration | `registerUsername()`, `checkAvailability()` |
| **ConnectivityService** | Super node connection | `connect()`, `heartbeat()` |
| **ActiveProxyClient** | NAT traversal client | `authenticate()`, `relay()` |
| **NetworkDetector** | NAT detection | `detectNAT()`, `getPublicIP()` |
| **BosonService** | Main orchestrator | `initialize()`, `getStatus()` |

### Identity Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     IDENTITY GENERATION                          │
│                                                                  │
│  1. Generate 12-word BIP39 mnemonic                             │
│  2. Derive Ed25519 keypair from seed                            │
│  3. Node ID = Base58(PublicKey)                                 │
│  4. DID = "did:boson:" + Node ID                                │
│  5. Store encrypted in data/identity.json                       │
│                                                                  │
│  Recovery: User can restore node with mnemonic phrase           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### NAT Traversal with Active Proxy

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACTIVE PROXY FLOW                             │
│                                                                  │
│  PC2 Node (behind NAT)          Super Node           Client     │
│         │                            │                    │     │
│         │──── AUTH Packet ──────────►│                    │     │
│         │     (Ed25519 signature)    │                    │     │
│         │                            │                    │     │
│         │◄─── AUTH_ACK + Port ───────│                    │     │
│         │     (Allocated: 25001)     │                    │     │
│         │                            │                    │     │
│         │──── PING (every 30s) ─────►│                    │     │
│         │                            │                    │     │
│         │                            │◄── HTTP Request ───│     │
│         │                            │    (via :25001)    │     │
│         │                            │                    │     │
│         │◄─── CONNECT + Data ────────│                    │     │
│         │                            │                    │     │
│         │──── Response ─────────────►│                    │     │
│         │                            │                    │     │
│         │                            │── Response to ────►│     │
│         │                            │   Client           │     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔒 Access Control System

### Overview

PC2 supports multi-user access with wallet-based permissions:

| Role | Permissions |
|------|-------------|
| **Owner** | Full access, manage wallets, system settings |
| **Admin** | All data access, cannot manage other admins |
| **Member** | Limited to own wallet scope |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/access/status` | GET | Check access control status |
| `/api/access/wallets` | GET | List allowed wallets |
| `/api/access/wallets` | POST | Add wallet with role |
| `/api/access/wallets/:id` | DELETE | Remove wallet access |

### Configuration

```json
// data/config/pc2.json
{
  "accessControl": {
    "enabled": true,
    "allowedWallets": [
      {
        "wallet": "0x1234...",
        "role": "admin",
        "addedAt": "2026-01-22T..."
      }
    ]
  }
}
```

---

## 🔄 Auto-Update System

### macOS-Style Update Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      UPDATE FLOW                                 │
│                                                                  │
│  1. Node checks GitHub releases every 6 hours                   │
│  2. If update available → Toast notification                    │
│  3. User clicks "Update Now" → Modal appears                    │
│  4. User clicks "Install" → Progress UI shows:                  │
│     - Downloading latest code... (git pull)                     │
│     - Installing dependencies... (npm install)                  │
│     - Building application... (npm run build)                   │
│     - Restarting server... (systemctl restart)                  │
│  5. Page auto-refreshes when server returns                     │
│  6. User sees new version running                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/update/version` | GET | Get current version |
| `/api/update/status` | GET | Check for updates |
| `/api/update/check` | POST | Trigger update check |
| `/api/update/check-github` | POST | Check GitHub releases |
| `/api/update/install` | POST | Start auto-update |
| `/api/update/progress` | GET | Get update progress |

### Frontend Components

- **UIUpdateModal.js** - Toast notification and modal with progress UI
- **Settings > About** - Update banner when available
- **Auto-reconnect** - Polls `/api/health` after restart

---

## 🏗️ Core Components

### 1. Frontend (Browser)

**Technology Stack:**
- **Framework**: Custom JavaScript/jQuery (Puter-compatible)
- **UI**: Desktop environment with taskbar, app launcher, file manager
- **Communication**: HTTP REST API + WebSocket (Socket.io)
- **SDK**: Puter SDK (intercepted to use PC2 API)
- **Auth**: Particle Network ConnectKit (wallet connection)

**Key Features:**
- Desktop UI with file operations
- AI chat sidebar and windowed app (multi-provider)
- Wallet sidebar (account, balance, send)
- First-run setup wizard
- Update notifications

**Location:** `src/gui/src/` (source), `pc2-node/frontend/` (built)

---

### 2. Backend (PC2 Node)

**Technology Stack:**
- **Runtime**: Node.js 20+ with TypeScript
- **Server**: Express.js
- **Database**: SQLite (Better-SQLite3)
- **Storage**: IPFS (Helia) + Local filesystem
- **WASM**: @wasmer/wasi runtime

**Key Services:**

#### 2.1 API Layer (`src/api/`)
- **Authentication**: `/whoami`, `/auth/*` - Wallet-based auth
- **File Operations**: `/read`, `/write`, `/readdir`, `/stat` - Puter-compatible
- **WASM**: `/api/wasm/execute-file`, `/api/wasm/execute` - WASM execution
- **Apps**: `/apps/:name`, `/get-launch-apps` - App metadata
- **Backup/Restore**: `/api/backup/*` - Data backup system
- **AI**: `/api/ai/*` - AI chat with multiple providers
- **Boson**: `/api/boson/*` - Identity, connectivity, username
- **Updates**: `/api/update/*` - Auto-update system
- **Access Control**: `/api/access/*` - Wallet permissions
- **Setup**: `/api/setup/*` - First-run wizard

#### 2.2 Services Layer (`src/services/`)
- **WASMRuntime**: Executes WASM binaries on node
- **AIService**: Multi-provider AI (Ollama, OpenAI, Claude, Gemini, xAI)
- **StorageService**: IPFS integration for distributed storage
- **AuthService**: Wallet authentication via Particle Auth
- **BackupService**: Automated backup/restore system
- **UpdateService**: Auto-update with GitHub releases
- **BosonService**: Identity, connectivity, username registration
- **TerminalService**: PTY-based terminal with namespace isolation
- **ResourceMonitor**: System resource monitoring

**Location:** `pc2-node/src/`

---

### 3. Super Node Infrastructure

**Components:**

| Component | Technology | Port | Purpose |
|-----------|------------|------|---------|
| **Web Gateway** | Node.js | 80/443 | HTTPS routing, wildcard SSL |
| **Boson DHT** | Java 17 | 39001/UDP | Distributed hash table |
| **Active Proxy** | Java 17 | 8090/TCP | NAT traversal relay |

**Systemd Services:**
- `pc2-gateway.service` - Web Gateway
- `pc2-boson.service` - Boson DHT + Active Proxy
- `pc2-node.service` - Demo/test PC2 node

**Location on Super Node:**
```
/root/pc2/
├── boson/                    # Boson DHT + Active Proxy
│   ├── lib/                  # Java JARs
│   └── config/               # Configuration
├── web-gateway/              # Web Gateway
│   ├── index.js              # Main code
│   └── data/                 # Registry
└── pc2.net/                  # PC2 node source
    └── pc2-node/
```

---

### 4. Data Storage

**Three-Tier Storage:**

1. **SQLite Database** (`data/pc2.db`)
   - User metadata and sessions
   - File system structure
   - App configurations
   - Access control lists

2. **IPFS Node** (Helia)
   - Distributed file storage
   - Content-addressed storage
   - P2P distribution capability

3. **Local Filesystem**
   - User files (`data/users/{wallet}/`)
   - WASM binaries (`data/wasm-apps/`)
   - Backup files (`data/backups/`)
   - Node identity (`data/identity.json`)
   - Configuration (`data/config/pc2.json`)

**Isolation:** All data is wallet-scoped, ensuring complete privacy between users

---

### 5. Authentication System

**Primary: Particle Auth (Wallet-based)**

**Flow:**
1. User connects wallet (MetaMask, WalletConnect, social login)
2. Particle Auth creates Smart Account (UniversalX)
3. PC2 node validates wallet signature
4. Session token issued (7-day validity)
5. All subsequent requests authenticated via token

**Secondary: Access Control**
- Node owner can add additional wallets
- Each wallet assigned role (admin/member)
- Roles control API access levels

---

## 🚀 Current Status

### ✅ Completed Features (MVP v1.0.0)

1. **Core Infrastructure**
   - ✅ Desktop UI (Puter-compatible)
   - ✅ File operations (CRUD)
   - ✅ Wallet authentication (Particle)
   - ✅ IPFS integration (Helia)
   - ✅ SQLite database
   - ✅ WebSocket real-time updates

2. **Boson Integration**
   - ✅ Node identity (Ed25519, DID)
   - ✅ Username registration
   - ✅ Super node connectivity
   - ✅ NAT detection
   - ✅ Active Proxy client

3. **Super Node Infrastructure**
   - ✅ Web Gateway with wildcard SSL
   - ✅ Boson DHT node
   - ✅ Active Proxy service
   - ✅ Username registry
   - ✅ Dual data center (failover ready)

4. **WASM Integration**
   - ✅ WASMRuntime service
   - ✅ Calculator app (non-WASI)
   - ✅ File processor app
   - ✅ WASI support

5. **AI Integration**
   - ✅ Multi-provider support (Ollama, OpenAI, Claude, Gemini, xAI)
   - ✅ AI chat sidebar and windowed app
   - ✅ File editing tools
   - ✅ IPC tool system

6. **Backup & Restore**
   - ✅ One-click backup
   - ✅ Web UI restore
   - ✅ Backup list with status

7. **Auto-Update System**
   - ✅ GitHub releases check
   - ✅ macOS-style notifications
   - ✅ One-click install
   - ✅ Progress UI
   - ✅ Auto-restart/refresh

8. **Access Control**
   - ✅ Wallet-based permissions
   - ✅ Role system (owner/admin/member)
   - ✅ Settings UI

9. **Setup Wizard**
   - ✅ First-run detection
   - ✅ Username selection
   - ✅ Mnemonic backup prompt
   - ✅ Super node registration
   - ✅ Smart domain redirect (VPS users → ela.city for WalletConnect)
   - ✅ Always-show welcome screen

### 🚧 In Progress (Phase 5)

1. **End-to-End Testing**
   - Active Proxy relay verification
   - Multi-node network tests
   - Failover between super nodes

2. **DHT Username Registry**
   - Store usernames in DHT (not just gateway)
   - Decentralized resolution

3. **Performance Optimization**
   - Connection pooling
   - Request caching
   - Bundle optimization

### 📋 Planned (Future Phases)

1. **Phase 6: dDRM & Marketplace**
   - NFT-based licensing
   - Binary marketplace
   - Royalty distribution

2. **Phase 7: Agent Economy**
   - AI agent execution
   - Bot-to-bot marketplace
   - Autonomous operations

---

## 🔐 Security Architecture

### Encryption Layers

1. **Transport Layer**: TLS 1.3 (HTTPS via Let's Encrypt)
2. **Session Layer**: CryptoBox (Active Proxy)
3. **Identity Layer**: Ed25519 signatures (DID)
4. **Storage Layer**: Wallet-scoped isolation

### Authentication Security

- Session tokens: 32-byte cryptographically random
- Token expiry: Configurable (default 7 days)
- Wallet verification: Signature-based (no passwords)
- Access control: Role-based permissions

### WASM Sandboxing

- Each execution isolated
- No shared state between calls
- User-scoped binary storage
- WASI permissions model

---

## 📚 Documentation References

| Document | Purpose |
|----------|---------|
| `docs/STRATEGIC_IMPLEMENTATION_PLAN.md` | Detailed sprint plans |
| `docs/DEPLOYMENT.md` | VPS deployment guide |
| `docs/QUICKSTART.md` | User quick start |
| `docs/pc2-infrastructure/README.md` | Super node overview |
| `docs/pc2-infrastructure/ARCHITECTURE.md` | Infrastructure deep-dive |
| `docs/pc2-infrastructure/WEB_GATEWAY.md` | Gateway API reference |
| `docs/pc2-infrastructure/SUPERNODE_OPERATOR_GUIDE.md` | Operator guide |
| `docs/pc2-infrastructure/PC2_CLIENT_INTEGRATION.md` | Boson integration |

---

## 🌐 Live Infrastructure

### Primary Super Node (InterServer)
- **IP**: 69.164.241.210
- **Domain**: *.ela.city
- **Services**: Web Gateway, Boson DHT, Active Proxy
- **Demo URLs**: demo.ela.city, test.ela.city

### Secondary Super Node (Contabo)
- **IP**: 38.242.211.112
- **Purpose**: Failover, load distribution
- **Services**: PC2 Node, Docker-ready

### DNS Configuration
- **A Record**: `*` → 69.164.241.210
- **Root**: ela.city → 35.205.174.216 (main website)

---

**End of Architecture Overview**

*Last Updated: 2026-01-22*
