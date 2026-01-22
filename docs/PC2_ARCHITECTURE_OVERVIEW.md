# PC2 Architecture Overview: Self-Hosted Sovereign Cloud

**Version:** 1.0  
**Date:** 2025-01-20  
**Status:** Production-Ready Core, WASM Integration Active

---

## 🎯 Executive Summary

**PC2** is a **self-hosted, self-contained personal cloud** that runs entirely on user-controlled hardware. Unlike traditional cloud services (Puter, Dropbox, Google Drive), PC2 gives users complete sovereignty over their data, computation, and software - all while providing a modern, Puter-compatible interface accessible from anywhere.

### Key Differentiators

| Feature | Puter (Cloud Service) | PC2 (Self-Hosted) |
|---------|----------------------|-------------------|
| **Data Location** | Provider's servers | User's hardware |
| **Control** | Provider controls access | User has full control |
| **Computation** | Provider's servers | User's hardware (WASM) |
| **Identity** | Email/password | Wallet-based (decentralized) |
| **Cost** | Subscription fees | One-time hardware cost |
| **Privacy** | Provider can access data | User-only access |
| **Customization** | Limited | Full control |
| **WASM Execution** | Browser-only | Node-side execution |

---

## 📐 System Architecture

### Image 1: High-Level Architecture Diagram

**Visual Description:**
```
┌─────────────────────────────────────────────────────────────┐
│                    USER'S DEVICE (Browser)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         PC2 Desktop UI (Puter-Compatible)            │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │   │
│  │  │ Desktop  │  │ Taskbar  │  │  Apps    │          │   │
│  │  │  Files   │  │  Menu    │  │ Launcher │          │   │
│  │  └──────────┘  └──────────┘  └──────────┘          │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │     AI Chat Sidebar (Multi-Provider)         │   │   │
│  │  │  - Ollama (Local)  - OpenAI  - Claude        │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
│                        ↕ HTTP/WebSocket                       │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│              PC2 NODE (User's Hardware)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Express.js HTTP Server                   │   │
│  │  ┌──────────────┐  ┌──────────────┐                 │   │
│  │  │   API Layer  │  │ Static Files │                 │   │
│  │  │  (REST/WS)   │  │  (Frontend)  │                 │   │
│  │  └──────────────┘  └──────────────┘                 │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Core Services Layer                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │   │
│  │  │  Auth    │  │ Storage  │  │  WASM    │         │   │
│  │  │ (Wallet) │  │ (IPFS)   │  │ Runtime  │         │   │
│  │  └──────────┘  └──────────┘  └──────────┘         │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │   │
│  │  │   AI     │  │ Backup/  │  │  IPC     │         │   │
│  │  │ Service  │  │ Restore │  │  Tools   │         │   │
│  │  └──────────┘  └──────────┘  └──────────┘         │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Data Layer                                 │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │   │
│  │  │ SQLite   │  │  IPFS    │  │  File    │         │   │
│  │  │ Database │  │  Node    │  │ System  │         │   │
│  │  └──────────┘  └──────────┘  └──────────┘         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Key Components:**
1. **Frontend (Browser)**: Puter-compatible desktop UI, communicates via HTTP/WebSocket
2. **Backend (PC2 Node)**: Express.js server with API layer and static file serving
3. **Services Layer**: Authentication, storage, WASM runtime, AI, backup/restore, IPC tools
4. **Data Layer**: SQLite for metadata, IPFS for distributed storage, local filesystem

---

### Image 2: Data Flow - WASM Calculator Example

**Visual Description:**
```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERACTION                          │
│  User clicks "5 + 3 = " in Calculator App                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              FRONTEND (Browser - Calculator App)              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  JavaScript: calculate() function                     │   │
│  │  - Parses: num1=5, num2=3, operator='+'              │   │
│  │  - Prepares: POST /api/wasm/execute-file             │   │
│  │  - Payload: {                                         │   │
│  │      filePath: 'data/wasm-apps/calculator.wasm',     │   │
│  │      functionName: 'add',                             │   │
│  │      args: [5, 3]                                     │   │
│  │    }                                                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓ HTTP POST
┌─────────────────────────────────────────────────────────────┐
│              BACKEND (PC2 Node - API Layer)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  /api/wasm/execute-file endpoint                       │   │
│  │  - Validates auth token                                │   │
│  │  - Resolves user-scoped path                           │   │
│  │  - Calls WASMRuntime.execute()                        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              WASM RUNTIME SERVICE                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  WASMRuntime.execute()                                  │   │
│  │  1. Loads calculator.wasm from disk                     │   │
│  │  2. Compiles WASM binary                                │   │
│  │  3. Detects: non-WASI module (no system calls)         │   │
│  │  4. Instantiates with minimal env imports               │   │
│  │  5. Calls: instance.exports.add(5, 3)                   │   │
│  │  6. Returns: 8                                           │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              WASM BINARY (calculator.wasm)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Compiled Rust Code (WebAssembly)                      │   │
│  │  - add(a: i32, b: i32) -> i32                          │   │
│  │  - subtract(a: i32, b: i32) -> i32                     │   │
│  │  - multiply(a: i32, b: i32) -> i32                     │   │
│  │  - divide(a: i32, b: i32) -> i32                       │   │
│  │                                                          │   │
│  │  Execution: add(5, 3) = 8                             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              RESPONSE FLOW                                    │
│  WASMRuntime → API → Frontend → UI Update                    │
│  Result: 8 displayed in calculator display                   │
└─────────────────────────────────────────────────────────────┘
```

**Key Points:**
- **Computation happens on PC2 node**, not in browser
- **WASM binary is stored on user's hardware** (self-hosted)
- **No external services** required for calculation
- **Privacy**: Calculation data never leaves user's node

---

### Image 3: PC2 vs Puter Comparison

**Visual Description:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    PUTER (Cloud Service)                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    User's Browser                          │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │         Puter Desktop UI                            │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            ↕ HTTPS                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Puter Cloud Servers                          │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │   │
│  │  │  Data    │  │ Compute  │  │  Auth    │              │   │
│  │  │ Storage  │  │ (Cloud)  │  │ (Email)  │              │   │
│  │  └──────────┘  └──────────┘  └──────────┘              │   │
│  │                                                           │   │
│  │  ⚠️ User has NO control over:                            │   │
│  │  - Where data is stored                                   │   │
│  │  - Who can access it                                      │   │
│  │  - What computation happens                              │   │
│  │  - Service availability                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    PC2 (Self-Hosted)                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    User's Browser                          │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │         PC2 Desktop UI (Puter-Compatible)           │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            ↕ HTTP                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              USER'S HARDWARE (PC2 Node)                   │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │   │
│  │  │  Data    │  │ Compute  │  │  Auth    │              │   │
│  │  │ Storage  │  │ (WASM)   │  │ (Wallet) │              │   │
│  │  └──────────┘  └──────────┘  └──────────┘              │   │
│  │                                                           │   │
│  │  ✅ User has FULL control over:                           │   │
│  │  - Where data is stored (their hardware)                 │   │
│  │  - Who can access it (wallet-based)                     │   │
│  │  - What computation happens (WASM on node)              │   │
│  │  - Service availability (their server)                  │   │
│  │  - Custom apps and binaries                             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    KEY DIFFERENCES                                │
│  ┌──────────────────────┐  ┌──────────────────────┐            │
│  │      PUTER           │  │        PC2             │            │
│  ├──────────────────────┤  ├──────────────────────┤            │
│  │ Cloud-hosted         │  │ Self-hosted           │            │
│  │ Email auth           │  │ Wallet auth           │            │
│  │ Provider's servers   │  │ User's hardware       │            │
│  │ Browser WASM only    │  │ Node-side WASM        │            │
│  │ Subscription cost    │  │ One-time hardware     │            │
│  │ Limited control      │  │ Full sovereignty      │            │
│  │ Provider can access  │  │ User-only access      │            │
│  └──────────────────────┘  └──────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

**Key Differentiators:**
1. **Data Sovereignty**: PC2 data stays on user's hardware
2. **Computation Control**: WASM runs on user's node, not cloud
3. **Identity**: Wallet-based vs email-based
4. **Cost Model**: Hardware ownership vs subscription
5. **Customization**: Full control vs limited options

---

### Image 4: WASM Execution Architecture

**Visual Description:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    WASM EXECUTION FLOW                           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              WASM BINARY TYPES                             │  │
│  │  ┌──────────────────┐  ┌──────────────────┐             │  │
│  │  │  Non-WASI WASM    │  │   WASI WASM      │             │  │
│  │  │  (Calculator)      │  │  (File Processor)│             │  │
│  │  │                   │  │                  │             │  │
│  │  │  - Pure compute   │  │  - File I/O      │             │  │
│  │  │  - No system calls│  │  - Env variables │             │  │
│  │  │  - Fast execution │  │  - System access  │             │  │
│  │  └──────────────────┘  └──────────────────┘             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              WASMRUNTIME SERVICE                            │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  1. Load WASM binary from disk                        │  │  │
│  │  │  2. Compile: WebAssembly.compile()                    │  │  │
│  │  │  3. Inspect imports: Module.imports()                 │  │  │
│  │  │  4. Detect WASI requirement                           │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                            ↓                               │  │
│  │  ┌──────────────────┐  ┌──────────────────┐             │  │
│  │  │  Non-WASI Path   │  │   WASI Path      │             │  │
│  │  │                  │  │                  │             │  │
│  │  │  WebAssembly.    │  │  WASI.getImports│             │  │
│  │  │  instantiate(    │  │  (wasmModule)    │             │  │
│  │  │    module,       │  │                  │             │  │
│  │  │    {env: {}}     │  │  WebAssembly.    │             │  │
│  │  │  )               │  │  instantiate(    │             │  │
│  │  │                  │  │    module,       │             │  │
│  │  │  → instance      │  │    wasiImports   │             │  │
│  │  │                  │  │  )              │             │  │
│  │  │                  │  │                  │             │  │
│  │  │  → instance      │  │  → instance      │             │  │
│  │  └──────────────────┘  └──────────────────┘             │  │
│  │                            ↓                               │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  5. Execute: instance.exports.functionName(args)  │  │  │
│  │  │  6. Return result to API layer                      │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              WASI COMPONENTS (for WASI modules)            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │   MemFS      │  │   WASI       │  │   Preopens   │   │  │
│  │  │ (In-memory   │  │  (System     │  │  (Directory  │   │  │
│  │  │ filesystem)  │  │  Interface)  │  │  access)     │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  │                                                             │  │
│  │  ⚠️ Current Limitation:                                    │  │
│  │  MemFS is in-memory only - real filesystem mapping         │  │
│  │  requires additional work (future enhancement)              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Technical Details:**
1. **Automatic Detection**: Runtime detects WASI requirement by inspecting module imports
2. **Dual Path**: Non-WASI uses standard WebAssembly, WASI uses @wasmer/wasi
3. **Isolation**: Each execution is isolated, no shared state between calls
4. **User-Scoped**: WASM binaries are stored per-wallet, ensuring privacy

---

## 🏗️ Core Components

### 1. Frontend (Browser)

**Technology Stack:**
- **Framework**: Custom JavaScript/jQuery (Puter-compatible)
- **UI**: Desktop environment with taskbar, app launcher, file manager
- **Communication**: HTTP REST API + WebSocket (Socket.io)
- **SDK**: Puter SDK (intercepted to use PC2 API)

**Key Features:**
- Desktop UI with file operations
- App launcher (Terminal, Editor, Calculator, etc.)
- AI chat sidebar (multi-provider support)
- Wallet-based authentication UI
- Real-time updates via WebSocket

**Location:** `src/gui/src/` (source), `pc2-node/test-fresh-install/frontend/` (built)

---

### 2. Backend (PC2 Node)

**Technology Stack:**
- **Runtime**: Node.js with TypeScript
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
- **Updates**: `/api/update/*` - Auto-update system (version check, install, progress)

#### 2.2 Services Layer (`src/services/`)
- **WASMRuntime**: Executes WASM binaries on node
- **AIService**: Multi-provider AI chat (Ollama, OpenAI, Claude, Gemini, xAI)
- **StorageService**: IPFS integration for distributed storage
- **AuthService**: Wallet authentication via Particle Auth
- **BackupService**: Automated backup/restore system
- **UpdateService**: Auto-update system with GitHub releases integration

#### 2.3 Static File Serving (`src/static.ts`)
- Serves frontend bundle
- SDK injection for apps
- App HTML serving with dynamic SDK URL

**Location:** `pc2-node/test-fresh-install/src/`

---

### 3. WASM Runtime

**Implementation:** `src/services/wasm/WASMRuntime.ts`

**Capabilities:**
- Loads WASM binaries from disk
- Compiles and instantiates WASM modules
- Automatic WASI detection
- Supports both WASI and non-WASI modules
- User-scoped binary storage (per-wallet)

**Current Status:**
- ✅ Non-WASI modules (Calculator) - Fully functional
- ⚠️ WASI modules (File Processor) - File I/O needs MemFS mapping work

**Future Enhancements:**
- Real filesystem mapping for WASI
- dDRM integration (Phase 6.5)
- Binary marketplace integration
- AI agent execution support

---

### 4. Data Storage

**Three-Tier Storage:**

1. **SQLite Database** (`data/pc2.db`)
   - User metadata
   - File system structure
   - App configurations
   - Session data

2. **IPFS Node** (Helia)
   - Distributed file storage
   - Content-addressed storage
   - P2P distribution capability
   - Future: Global marketplace integration

3. **Local Filesystem**
   - User files (`data/users/{wallet}/`)
   - WASM binaries (`data/wasm-apps/`)
   - Backup files (`data/backups/`)
   - App data (`data/apps/`)

**Isolation:** All data is wallet-scoped, ensuring complete privacy between users

---

### 5. Authentication System

**Technology:** Particle Auth (Wallet-based)

**Flow:**
1. User connects wallet (MetaMask, WalletConnect, etc.)
2. Particle Auth creates Smart Account (UniversalX)
3. PC2 node validates wallet signature
4. Session token issued (7-day validity)
5. All subsequent requests authenticated via token

**Key Features:**
- Decentralized identity (no email/password)
- Multi-wallet support
- Smart Account abstraction
- Auto-reconnect on page refresh

---

## 🔄 Request Flow Examples

### Example 1: File Upload

```
User → Frontend (drag & drop)
  → POST /write?file=/path/to/file
  → Backend validates auth token
  → StorageService.write()
  → IPFS.add() (distributed storage)
  → SQLite.update() (metadata)
  → WebSocket.broadcast() (real-time update)
  → Frontend updates UI
```

### Example 2: WASM Calculator

```
User → Frontend (click "5 + 3 =")
  → POST /api/wasm/execute-file
  → Backend validates auth token
  → WASMRuntime.execute()
  → Load calculator.wasm from disk
  → Compile & instantiate WASM
  → Call instance.exports.add(5, 3)
  → Return result: 8
  → Frontend displays: 8
```

### Example 3: AI Chat

```
User → Frontend (type message)
  → POST /api/ai/chat
  → Backend validates auth token
  → AIService.chat()
  → Route to provider (Ollama/OpenAI/Claude)
  → Stream response via WebSocket
  → Frontend displays streaming text
```

---

## 🆚 Why PC2 is Unique

### 1. **Complete Data Sovereignty**
- **Puter**: Data stored on provider's servers
- **PC2**: Data stored on user's hardware
- **Benefit**: User has full control, no third-party access

### 2. **Self-Hosted Computation**
- **Puter**: Computation on provider's servers (if any)
- **PC2**: WASM execution on user's node
- **Benefit**: Privacy, no data leakage, custom binaries

### 3. **Wallet-Based Identity**
- **Puter**: Email/password (centralized)
- **PC2**: Wallet signature (decentralized)
- **Benefit**: No account recovery issues, true ownership

### 4. **No Subscription Model**
- **Puter**: Monthly/yearly fees
- **PC2**: One-time hardware cost
- **Benefit**: Long-term cost savings, no vendor lock-in

### 5. **Full Customization**
- **Puter**: Limited to provider's features
- **PC2**: User can add custom apps, WASM binaries, modify code
- **Benefit**: Unlimited extensibility

### 6. **WASM on Node (Not Browser)**
- **Puter**: WASM runs in browser (limited, sandboxed)
- **PC2**: WASM runs on node (full system access, privacy)
- **Benefit**: More powerful, private computation

---

## 🚀 Current Status

### ✅ Completed Features

1. **Core Infrastructure**
   - ✅ Desktop UI (Puter-compatible)
   - ✅ File operations (CRUD)
   - ✅ Wallet authentication
   - ✅ IPFS integration
   - ✅ SQLite database
   - ✅ WebSocket real-time updates

2. **WASM Integration**
   - ✅ WASMRuntime service
   - ✅ WASM API endpoints
   - ✅ Calculator app (non-WASI)
   - ✅ App registration system
   - ✅ SDK injection for apps

3. **AI Integration**
   - ✅ Multi-provider support (Ollama, OpenAI, Claude, Gemini)
   - ✅ AI chat sidebar
   - ✅ File editing tools
   - ✅ IPC tool system

4. **Backup & Restore**
   - ✅ One-click web UI restore
   - ✅ Backup status indicators
   - ✅ Comprehensive help system

5. **Auto-Update System**
   - ✅ macOS-style update notifications
   - ✅ One-click update installation
   - ✅ Progress UI (download, build, restart)
   - ✅ Auto-reconnect after restart
   - ✅ Settings > About update banner

### 🚧 In Progress

1. **WASI File I/O**
   - MemFS to real filesystem mapping
   - File Processor app enhancement

2. **More WASM Apps**
   - Environment reader (WASI)
   - Additional demo apps

### 📋 Planned (Future Phases)

1. **Phase 6.5: Full WASMER Runtime**
   - dDRM integration
   - Binary marketplace
   - AI agent execution
   - Cross-platform support

2. **Phase 6: Digital Rights Management**
   - NFT-based licensing
   - Access token system
   - Royalty distribution

3. **Phase 7: Agent Economy**
   - AgentKit integration
   - Bot-to-bot marketplace
   - Autonomous agent execution

---

## 🔐 Security & Privacy

### Data Isolation
- **Wallet-scoped storage**: Each user's data is completely isolated
- **No cross-user access**: Impossible to access another user's data
- **Local-first**: Data never leaves user's hardware unless explicitly shared

### Authentication
- **Wallet signature**: Cryptographic proof of ownership
- **No passwords**: No password database to breach
- **Session tokens**: Time-limited, revocable

### WASM Execution
- **Sandboxed**: Each WASM execution is isolated
- **User-scoped**: Binaries stored per-wallet
- **No network access**: Unless explicitly granted (future)

---

## 📊 Performance Characteristics

### File Operations
- **Local filesystem**: Fast (native OS speed)
- **IPFS**: Depends on network (local node is fast)
- **SQLite**: Very fast for metadata queries

### WASM Execution
- **Compilation**: One-time cost (cached)
- **Execution**: Near-native speed
- **Memory**: Isolated per execution

### Network
- **Local network**: Minimal latency
- **Remote access**: Depends on user's connection
- **WebSocket**: Real-time updates with low overhead

---

## 🛠️ Development Workflow

### Building
```bash
# Build frontend
cd src/gui && npm run build

# Build backend
cd pc2-node/test-fresh-install && npm run build:backend

# Build both
npm run build
```

### Running
```bash
# Start server
cd pc2-node/test-fresh-install
PORT=4202 npm start

# Access UI
open http://localhost:4202
```

### Testing WASM
```bash
# Compile Rust to WASM
cd data/wasm-apps
rustc --target wasm32-unknown-unknown calculator.rs

# Test via API
curl -X POST http://localhost:4202/api/wasm/execute-file \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"filePath": "data/wasm-apps/calculator.wasm", "functionName": "add", "args": [5, 3]}'
```

---

## 📚 Documentation References

- **Strategic Implementation Plan**: `docs/STRATEGIC_IMPLEMENTATION_PLAN.md`
- **Deployment Guide**: `docs/DEPLOYMENT.md`
- **Quick Start**: `docs/QUICKSTART.md`
- **Infrastructure Docs**: `docs/pc2-infrastructure/`

---

## 🎯 Vision: The Future of PC2

### Short-Term (Next 3 Months)
- Complete WASI file I/O implementation
- More WASM demo apps
- Enhanced AI capabilities
- Improved backup automation

### Medium-Term (6-12 Months)
- Full WASMER runtime with dDRM
- Binary marketplace
- P2P distribution
- AI agent integration

### Long-Term (1-2 Years)
- Agent economy (bot-to-bot marketplace)
- Cross-platform WASMER runtime
- Global PC2 network
- Decentralized identity federation

---

## 📝 Image Creation Guide

The four images described above should be created as:

1. **Image 1: High-Level Architecture**
   - Use diagramming tool (draw.io, Lucidchart, Mermaid)
   - Show: Browser → PC2 Node → Services → Data layers
   - Color code: Frontend (blue), Backend (green), Services (yellow), Data (orange)

2. **Image 2: WASM Calculator Flow**
   - Sequence diagram showing: User → Frontend → API → WASMRuntime → WASM Binary → Response
   - Include data payloads at each step
   - Show where computation happens (PC2 node)

3. **Image 3: PC2 vs Puter**
   - Side-by-side comparison
   - Highlight key differences with callouts
   - Use contrasting colors (Puter: red/orange, PC2: green/blue)

4. **Image 4: WASM Execution Architecture**
   - Technical diagram showing WASM binary types
   - WASMRuntime service internals
   - WASI vs non-WASI paths
   - Include current limitations

---

## 🔍 Architecture Audit: Self-Contained Package Analysis

**Audit Date:** 2025-01-18  
**Status:** On Track for Sovereign Deployment

### What Runs Locally (PC2 Node)

| Component | Technology | Status | Notes |
|-----------|------------|--------|-------|
| **HTTP Server** | Express.js | ✅ Local | All API endpoints served locally |
| **WebSocket** | Socket.io | ✅ Local | Real-time updates |
| **Database** | SQLite (better-sqlite3) | ✅ Local | Users, sessions, file metadata |
| **File Storage** | Local filesystem | ✅ Local | User files stored in `data/` |
| **IPFS Node** | Helia | ✅ Local | Content-addressed storage |
| **WASM Runtime** | Wasmer | ✅ Local | Server-side binary execution |
| **Frontend GUI** | Built bundle.min.js | ✅ Local | Puter-compatible UI served as static files |
| **AI Service** | Multi-provider | ⚠️ Mixed | Ollama (local), others require API keys |
| **Thumbnails** | Sharp | ✅ Local | Image processing |
| **PDF Processing** | pdfjs-dist | ✅ Local | Text extraction |

### External Dependencies (Require Internet)

| Service | Purpose | Required? | Credentials |
|---------|---------|-----------|-------------|
| **Particle Network** | Wallet authentication UI | ⚠️ Currently Yes | ✅ Pre-configured |
| - `wallet-iframe.particle.network` | ConnectKit modal | Required | Hosted by Particle |
| - Particle project credentials | API authentication | Required | **Baked into package** |
| **WalletConnect** | Mobile wallet QR scanning | Optional | ✅ Pre-configured |
| - `relay.walletconnect.org` | QR code relay | For mobile | **Baked into package** |
| **Elastos RPC** | Blockchain queries | For Web3 features | Can use any EVM RPC |
| - `api.ela.city/esc` | Primary RPC | Network access | Configurable |
| - `api.elastos.io/esc` | Backup RPC | Network access | Configurable |
| **AI Providers** (Optional) | Cloud AI | User choice | Ollama runs fully local |
| - OpenAI API | GPT models | Optional | Requires API key |
| - Anthropic API | Claude models | Optional | Requires API key |
| - Google AI | Gemini models | Optional | Requires API key |

### Current Login Flow (Particle Network)

```
┌─────────────────────────────────────────────────────────────────┐
│                        LOGIN FLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. User opens PC2 → Local PC2 Node serves frontend              │
│  2. Login modal loads → Particle ConnectKit iframe (EXTERNAL)    │
│  3. User selects wallet → Particle handles connection            │
│  4. Wallet signs challenge → Signature verified                  │
│  5. PC2 Node creates session → SQLite (LOCAL)                    │
│  6. User gets auth token → All subsequent requests LOCAL         │
│                                                                   │
│  External: Step 2-4 (Particle Network)                           │
│  Local: Step 1, 5-6 (PC2 Node)                                   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Sovereignty Analysis

| Data Type | Storage | Privacy | Notes |
|-----------|---------|---------|-------|
| **User files** | Local filesystem + IPFS | ✅ Fully private | Never leaves device unless shared |
| **Session tokens** | Local SQLite | ✅ Fully private | Generated locally |
| **User preferences** | Local SQLite | ✅ Fully private | Desktop settings, etc. |
| **File metadata** | Local SQLite | ✅ Fully private | Indexed locally |
| **Wallet addresses** | Local SQLite | ✅ Private | Used as username |
| **AI conversations** | In-memory | ✅ Private* | *Cloud AI sees prompts if used |

### Security Considerations for Self-Hosted Deployment

#### Current Security Features
- ✅ Session tokens are cryptographically random (32 bytes)
- ✅ Sessions expire (configurable, default 30 days)
- ✅ Wallet-based auth (no passwords stored)
- ✅ File isolation per wallet address
- ✅ CORS headers for API security

#### Recommendations for Production
- ⚠️ **HTTPS Required**: Use reverse proxy (nginx/caddy) with Let's Encrypt
- ⚠️ **Firewall**: Only expose port 443 (or chosen port)
- ⚠️ **Backup**: Regular encrypted backups of `data/` and SQLite DB
- ⚠️ **Updates**: Keep Node.js and dependencies updated

### Raspberry Pi / ARM Deployment Considerations

| Aspect | Status | Notes |
|--------|--------|-------|
| **Node.js** | ✅ Compatible | v20+ runs on ARM64 |
| **SQLite** | ✅ Compatible | better-sqlite3 compiles natively |
| **Sharp** | ⚠️ Needs ARM build | Pre-built binaries available |
| **IPFS (Helia)** | ✅ Compatible | Pure JS, platform-agnostic |
| **Wasmer** | ⚠️ Check ARM support | May need WASM interpreter fallback |
| **Memory** | ⚠️ Minimum 2GB | 4GB recommended |
| **Storage** | ✅ User files scale | SD card or SSD |

### Roadmap to Full Self-Containment

#### Phase 1: Current State (✅ Complete)
- Particle Network for Web3 login
- All file operations local
- Multi-user SQLite database
- AI with multiple providers

#### Phase 2: Reduce External Dependencies (🔄 In Progress)
- [ ] Add pure RainbowKit branch as alternative
- [ ] Document self-hosted Particle (if available)
- [ ] Add offline mode detection

#### Phase 3: Full Sovereignty Mode (📋 Planned)
- [ ] Direct wallet signature auth (no Particle iframe)
- [ ] Self-hosted WalletConnect relay (or bypass)
- [ ] Fully offline-capable mode
- [ ] Local-only AI (Ollama required)

### Environment Variables & Credentials

#### Pre-Configured (No User Action Required)

The following credentials are **baked into the PC2 package** and work out of the box:

| Service | Status | Notes |
|---------|--------|-------|
| **Particle Network** | ✅ Pre-configured | Elacity's project credentials included |
| **WalletConnect** | ✅ Pre-configured | Shared project ID for QR scanning |

**Why this is safe:**
- Particle only handles wallet connection UI (lightweight)
- Each PC2 node serves few users (1-5 typically)
- Free tier handles thousands of authentications/month
- No sensitive data passes through Particle

#### Optional Overrides (For Full Sovereignty)

Users who want complete isolation can provide their own credentials:

```bash
# Optional: Override Particle Network credentials
# Get from https://dashboard.particle.network (free tier available)
VITE_PARTICLE_PROJECT_ID=xxx
VITE_PARTICLE_CLIENT_KEY=xxx
VITE_PARTICLE_APP_ID=xxx

# Optional: Override WalletConnect project ID
# Get from https://cloud.walletconnect.com (free)
VITE_WALLETCONNECT_PROJECT_ID=xxx
```

#### AI Provider Keys (User Provides If Wanted)

```bash
# For cloud AI (completely optional - Ollama works locally without keys)
ANTHROPIC_API_KEY=xxx             # For Claude
OPENAI_API_KEY=xxx                # For GPT  
GEMINI_API_KEY=xxx                # For Gemini
```

**Note:** For fully local AI, users can run [Ollama](https://ollama.ai) on their device - no API keys needed.

### Packaging Recommendations

For a distributable PC2 package (Docker, npm, or standalone):

```yaml
# docker-compose.yml concept
version: '3.8'
services:
  pc2-node:
    image: elastos/pc2-node:latest
    ports:
      - "4200:4200"
    volumes:
      - ./data:/app/data          # User files persist here
      - ./config:/app/config      # Optional config overrides
    environment:
      # No credentials needed! They're baked into the image.
      # Only add these if you want to use your own:
      # - VITE_PARTICLE_PROJECT_ID=${PARTICLE_ID}
      # - VITE_PARTICLE_CLIENT_KEY=${PARTICLE_KEY}
      
      # Optional: AI provider keys
      - ANTHROPIC_API_KEY=${ANTHROPIC_KEY:-}
      - OPENAI_API_KEY=${OPENAI_KEY:-}
```

### Quick Start for Users

```bash
# Option 1: Docker (recommended)
docker run -d -p 4200:4200 -v pc2-data:/app/data elastos/pc2-node

# Option 2: npm
npm install -g @elastos/pc2-node
pc2-node start

# Option 3: From source
git clone https://github.com/puter/pc2.net
cd pc2.net/pc2-node
npm install && npm start
```

**That's it!** No API keys to configure. Open `http://localhost:4200` and login with your wallet.

### Conclusion

**Are we on the right track?** ✅ **YES**

The PC2 architecture is fundamentally sound for self-hosted deployment:

1. **Core is local**: All file operations, database, session management run on user's hardware
2. **Login is the only external dependency**: Particle Network handles wallet connection UI
3. **AI is user's choice**: Can use fully local Ollama or cloud providers
4. **Data never leaves**: Files, metadata, sessions stay on local device

**Key Wisdom:**
- The current Particle dependency is acceptable for MVP - it provides excellent UX
- For paranoid users, a pure RainbowKit or direct wallet auth can be added as alternative
- The architecture already supports multi-tenant isolation (each wallet is siloed)
- HTTPS is critical for production - wallets refuse to connect over HTTP

---

**End of Architecture Overview**

