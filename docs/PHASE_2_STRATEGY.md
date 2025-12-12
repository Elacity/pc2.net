# Phase 2 Strategy: Production PC2 Node
## From Mock Server to Production-Ready Node

**Date:** 2025-01-12  
**Status:** Ready to Begin  
**Estimated Time:** 2-3 weeks

---

## 🎯 Phase 2 Goal

**Transform the mock server into a production-ready PC2 node package that:**
- ✅ Serves ElastOS frontend (built-in)
- ✅ Handles all API endpoints
- ✅ Stores data persistently (IPFS + SQLite)
- ✅ Manages sessions across restarts
- ✅ Supports real-time updates (WebSocket)
- ✅ Can be packaged and deployed

---

## 📊 Current State Assessment

### ✅ What We Have (Phase 1 Complete)

1. **Mock Server (`tools/mock-pc2-server.cjs`)**
   - ✅ Serves ElastOS frontend static files
   - ✅ Handles all Puter API endpoints
   - ✅ Particle Auth integration
   - ✅ Session management (in-memory)
   - ✅ File system simulation (in-memory)
   - ✅ Same-origin API (no CORS)

2. **Frontend Integration**
   - ✅ Auto-detects API origin
   - ✅ Fetch/XHR interception working
   - ✅ Particle Auth UI embedded
   - ✅ Desktop UI loading correctly
   - ✅ Background image serving

3. **Authentication Flow**
   - ✅ Particle Auth → PC2 session
   - ✅ 7-day session tokens
   - ✅ User data in `window.user`
   - ✅ Logout flow working

### ⚠️ What's Missing (Phase 2 Goals)

1. **Production Structure**
   - ❌ No proper package structure
   - ❌ Frontend build not integrated
   - ❌ No TypeScript compilation
   - ❌ No proper configuration system

2. **Persistent Storage**
   - ❌ In-memory filesystem (lost on restart)
   - ❌ In-memory sessions (lost on restart)
   - ❌ No IPFS integration
   - ❌ No SQLite database

3. **Real-Time Features**
   - ❌ Polling instead of WebSocket
   - ❌ No multi-tab sync
   - ❌ No event broadcasting

4. **Production Features**
   - ❌ No owner wallet verification
   - ❌ No proper error handling
   - ❌ No logging system
   - ❌ No health checks

---

## 🏗️ Phase 2 Architecture

### Target Structure

```
pc2-node/
├── package.json                 # Node package definition
├── tsconfig.json                # TypeScript config
├── README.md                    # User documentation
│
├── src/                         # Source code
│   ├── server.ts                # Main HTTP server
│   ├── static.ts                # Static file serving
│   │
│   ├── api/                     # API endpoints
│   │   ├── auth.ts              # Authentication
│   │   ├── filesystem.ts        # File operations
│   │   ├── whoami.ts            # User info
│   │   └── index.ts             # API router
│   │
│   ├── storage/                 # Storage layer
│   │   ├── ipfs.ts              # IPFS integration
│   │   ├── database.ts          # SQLite database
│   │   └── filesystem.ts         # File system abstraction
│   │
│   ├── auth/                    # Authentication
│   │   ├── particle.ts          # Particle Auth
│   │   ├── session.ts           # Session management
│   │   └── owner.ts             # Owner verification
│   │
│   ├── websocket/                # Real-time
│   │   ├── server.ts            # Socket.io server
│   │   └── events.ts             # Event broadcasting
│   │
│   └── config/                   # Configuration
│       ├── default.json          # Default config
│       └── loader.ts             # Config loader
│
├── frontend/                     # Built ElastOS frontend
│   ├── index.html
│   ├── bundle.min.js
│   ├── bundle.min.css
│   └── images/
│
├── data/                         # Runtime data
│   ├── pc2.db                   # SQLite database
│   └── ipfs/                     # IPFS repo
│
└── config/                       # User configuration
    └── config.json               # User config (from setup)
```

---

## 📋 Phase 2 Implementation Plan

### Task 2.1: Create PC2 Node Package Structure ⏱️ 2 hours

**Goal:** Set up proper directory structure and TypeScript configuration

**Steps:**
1. Create `pc2-node/` directory at project root
2. Initialize `package.json` with dependencies:
   - `express` (HTTP server)
   - `socket.io` (WebSocket)
   - `ipfs-core` (IPFS)
   - `better-sqlite3` (SQLite)
   - `typescript` (TypeScript)
   - `@types/node` (Type definitions)
3. Create `tsconfig.json` for TypeScript compilation
4. Set up basic directory structure (`src/`, `frontend/`, `data/`, `config/`)
5. Create `README.md` with setup instructions

**Files to Create:**
- `pc2-node/package.json`
- `pc2-node/tsconfig.json`
- `pc2-node/src/server.ts` (skeleton)
- `pc2-node/src/static.ts` (skeleton)
- `pc2-node/README.md`

**Acceptance Criteria:**
- ✅ `npm install` works
- ✅ `npm run build` compiles TypeScript
- ✅ Directory structure matches target

---

### Task 2.2: Build Process Integration ⏱️ 2 hours

**Goal:** Automate frontend build and copy into node package

**Steps:**
1. Add build scripts to `pc2-node/package.json`:
   ```json
   {
     "scripts": {
       "build": "npm run build:frontend && npm run build:backend",
       "build:frontend": "cd ../src/gui && npm run build && cp -r dist/* ../pc2-node/frontend/",
       "build:backend": "tsc",
       "start": "node dist/server.js",
       "dev": "tsc --watch & nodemon dist/server.js"
     }
   }
   ```
2. Create `build.sh` script for one-command builds
3. Test build process end-to-end
4. Add `.gitignore` for build artifacts

**Files to Create/Modify:**
- `pc2-node/package.json` (add scripts)
- `pc2-node/build.sh` (optional)
- `pc2-node/.gitignore`

**Acceptance Criteria:**
- ✅ `npm run build` builds frontend and backend
- ✅ Frontend files copied to `pc2-node/frontend/`
- ✅ TypeScript compiles to `pc2-node/dist/`
- ✅ `npm start` runs the server

---

### Task 2.3: Static File Serving (Production) ⏱️ 3-4 hours

**Goal:** Implement production-grade static file serving

**Steps:**
1. Extract static serving logic from `mock-pc2-server.cjs`
2. Create `src/static.ts` with:
   - Express static middleware
   - SPA fallback (all routes → `index.html`)
   - MIME type detection
   - Cache headers (production vs development)
   - Error handling
3. Integrate with main server
4. Test with built frontend

**Files to Create:**
- `pc2-node/src/static.ts`

**Code Structure:**
```typescript
// src/static.ts
export function setupStaticServing(app: Express, options: {
  frontendPath: string;
  isProduction: boolean;
}) {
  // Serve static files
  app.use(express.static(options.frontendPath, {
    maxAge: options.isProduction ? '1y' : '0',
    etag: true,
    lastModified: true
  }));

  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(options.frontendPath, 'index.html'));
  });
}
```

**Acceptance Criteria:**
- ✅ Static files served correctly
- ✅ SPA routing works (all routes → `index.html`)
- ✅ MIME types correct
- ✅ Cache headers appropriate
- ✅ Works in production mode

---

### Task 2.4: SQLite Database ⏱️ 1 day

**Goal:** Replace in-memory storage with persistent SQLite database

**Steps:**
1. Install `better-sqlite3` and types
2. Create `src/storage/database.ts`:
   - Database initialization
   - Schema creation (migrations)
   - Connection management
3. Define schema:
   ```sql
   -- Users table
   CREATE TABLE users (
     wallet_address TEXT PRIMARY KEY,
     smart_account_address TEXT,
     created_at INTEGER,
     last_login INTEGER
   );

   -- Sessions table
   CREATE TABLE sessions (
     token TEXT PRIMARY KEY,
     wallet_address TEXT,
     smart_account_address TEXT,
     created_at INTEGER,
     expires_at INTEGER,
     FOREIGN KEY (wallet_address) REFERENCES users(wallet_address)
   );

   -- Files metadata table
   CREATE TABLE files (
     path TEXT PRIMARY KEY,
     wallet_address TEXT,
     ipfs_hash TEXT,
     size INTEGER,
     mime_type TEXT,
     is_dir INTEGER,
     is_public INTEGER,
     created_at INTEGER,
     updated_at INTEGER,
     FOREIGN KEY (wallet_address) REFERENCES users(wallet_address)
   );

   -- Settings table
   CREATE TABLE settings (
     key TEXT PRIMARY KEY,
     value TEXT
   );
   ```
4. Create migration system
5. Update API endpoints to use database:
   - `/whoami` → Query `sessions` table
   - `/auth/particle` → Create session in database
   - `/stat`, `/readdir` → Query `files` table
6. Test persistence (restart server, verify data)

**Files to Create:**
- `pc2-node/src/storage/database.ts`
- `pc2-node/src/storage/migrations.ts`
- `pc2-node/src/storage/schema.sql`

**Acceptance Criteria:**
- ✅ Database created on first run
- ✅ Sessions persist across restarts
- ✅ File metadata stored in database
- ✅ Migrations run automatically
- ✅ Data survives server restarts

---

### Task 2.5: IPFS Integration ⏱️ 1-2 days

**Goal:** Replace in-memory filesystem with IPFS storage

**Steps:**
1. Install `ipfs-core` and dependencies
2. Create `src/storage/ipfs.ts`:
   - IPFS node initialization
   - File upload to IPFS
   - File retrieval from IPFS
   - Directory structure management
3. Create `src/storage/filesystem.ts`:
   - Abstraction layer over IPFS
   - File operations (create, read, update, delete)
   - Directory operations (list, create)
   - Path normalization
4. Update API endpoints:
   - `/read` → Get file from IPFS
   - `/write` → Store file in IPFS
   - `/stat`, `/readdir` → Query database + IPFS
5. Handle IPFS node lifecycle:
   - Start on server start
   - Graceful shutdown
   - Error recovery
6. Test file persistence

**Files to Create:**
- `pc2-node/src/storage/ipfs.ts`
- `pc2-node/src/storage/filesystem.ts`

**Code Structure:**
```typescript
// src/storage/ipfs.ts
export class IPFSStorage {
  private ipfs: IPFS;

  async initialize() {
    this.ipfs = await create({
      repo: path.join(process.cwd(), 'data/ipfs'),
      // ... config
    });
  }

  async storeFile(content: Buffer, path: string): Promise<string> {
    // Add to IPFS, return CID
  }

  async getFile(cid: string): Promise<Buffer> {
    // Retrieve from IPFS
  }
}
```

**Acceptance Criteria:**
- ✅ IPFS node starts on server start
- ✅ Files stored on IPFS
- ✅ Files retrieved correctly
- ✅ Directory structure maintained
- ✅ Data persists across restarts
- ✅ IPFS repo in `data/ipfs/`

---

### Task 2.6: Owner Wallet Verification ⏱️ 4-6 hours

**Goal:** Verify wallet is owner during authentication

**Steps:**
1. Create `src/config/loader.ts`:
   - Load config from `config/config.json`
   - Default config from `config/default.json`
   - Validate config on load
2. Add owner wallet to config:
   ```json
   {
     "owner": {
       "wallet_address": "0x34DAF31B...",
       "tethered_wallets": []
     }
   }
   ```
3. Create `src/auth/owner.ts`:
   - Owner verification logic
   - Check wallet against owner config
   - Support tethered wallets (future)
4. Update `/auth/particle` endpoint:
   - Verify wallet is owner
   - Reject if not owner
   - Return appropriate error
5. Update setup process (future):
   - `pc2 setup` command
   - Save owner wallet to config

**Files to Create:**
- `pc2-node/src/config/loader.ts`
- `pc2-node/src/auth/owner.ts`
- `pc2-node/config/default.json`

**Acceptance Criteria:**
- ✅ Config loaded on server start
- ✅ Owner wallet verified on authentication
- ✅ Non-owner wallets rejected
- ✅ Error messages clear
- ✅ Config persists

---

### Task 2.7: Real WebSocket (Socket.io) ⏱️ 1 day

**Goal:** Replace polling with real-time WebSocket

**Steps:**
1. Install `socket.io` and types
2. Create `src/websocket/server.ts`:
   - Socket.io server setup
   - Connection handling
   - Authentication (session token)
   - Room management (per-user rooms)
3. Create `src/websocket/events.ts`:
   - File change events
   - Directory change events
   - User presence events
   - Event broadcasting
4. Update API endpoints:
   - Emit events on file changes
   - Emit events on directory changes
5. Update frontend (if needed):
   - Connect to Socket.io
   - Listen for events
   - Update UI in real-time
6. Test multi-tab sync

**Files to Create:**
- `pc2-node/src/websocket/server.ts`
- `pc2-node/src/websocket/events.ts`

**Code Structure:**
```typescript
// src/websocket/server.ts
export function setupWebSocket(server: Server) {
  const io = new Server(server, {
    cors: { origin: '*' } // Configure properly
  });

  io.use((socket, next) => {
    // Authenticate via session token
    const token = socket.handshake.auth.token;
    // Verify token, attach user
    next();
  });

  io.on('connection', (socket) => {
    // Join user's room
    socket.join(`user:${socket.user.wallet_address}`);

    // Handle events
    socket.on('file:changed', (data) => {
      // Broadcast to user's room
      io.to(`user:${socket.user.wallet_address}`).emit('file:updated', data);
    });
  });

  return io;
}
```

**Acceptance Criteria:**
- ✅ WebSocket connection established
- ✅ Authentication via session token
- ✅ Events broadcast correctly
- ✅ Multi-tab sync works
- ✅ Real-time file updates

---

### Task 2.8: Extract API Endpoints ⏱️ 1 day

**Goal:** Refactor mock server API logic into clean TypeScript modules

**Steps:**
1. Extract endpoints from `mock-pc2-server.cjs`:
   - `/whoami` → `src/api/whoami.ts`
   - `/auth/particle` → `src/api/auth.ts`
   - `/stat`, `/readdir` → `src/api/filesystem.ts`
   - `/read`, `/write` → `src/api/filesystem.ts`
   - All other endpoints
2. Create `src/api/index.ts`:
   - API router
   - Endpoint registration
   - Middleware (auth, error handling)
3. Convert to TypeScript:
   - Type definitions
   - Interfaces
   - Error handling
4. Test all endpoints

**Files to Create:**
- `pc2-node/src/api/index.ts`
- `pc2-node/src/api/whoami.ts`
- `pc2-node/src/api/auth.ts`
- `pc2-node/src/api/filesystem.ts`
- `pc2-node/src/types/api.ts`

**Acceptance Criteria:**
- ✅ All endpoints extracted
- ✅ TypeScript types defined
- ✅ Error handling consistent
- ✅ All endpoints tested
- ✅ Code clean and maintainable

---

### Task 2.9: Main Server Integration ⏱️ 4-6 hours

**Goal:** Integrate all components into main server

**Steps:**
1. Create `src/server.ts`:
   - Express app setup
   - Middleware (CORS, body parser, etc.)
   - Static file serving
   - API routes
   - WebSocket setup
   - Error handling
   - Graceful shutdown
2. Create `src/index.ts` (entry point):
   - Load configuration
   - Initialize database
   - Initialize IPFS
   - Start server
   - Handle errors
3. Add logging system:
   - Console logging (development)
   - File logging (production)
   - Log levels
4. Add health check endpoint:
   - `/health` → Server status
   - Database status
   - IPFS status
5. Test complete system

**Files to Create:**
- `pc2-node/src/server.ts`
- `pc2-node/src/index.ts`
- `pc2-node/src/utils/logger.ts`

**Acceptance Criteria:**
- ✅ Server starts successfully
- ✅ All components initialized
- ✅ Health check works
- ✅ Graceful shutdown works
- ✅ Logging functional

---

### Task 2.10: Testing & Validation ⏱️ 1-2 days

**Goal:** Comprehensive testing of Phase 2

**Steps:**
1. **Unit Tests:**
   - Database operations
   - IPFS operations
   - API endpoints
   - Authentication
2. **Integration Tests:**
   - Full authentication flow
   - File operations
   - Session persistence
   - WebSocket events
3. **End-to-End Tests:**
   - Install → Setup → Use
   - Restart server → Data persists
   - Multi-tab sync
   - Real-time updates
4. **Performance Tests:**
   - File upload/download
   - Directory listing
   - Concurrent users
5. **Documentation:**
   - Update README
   - API documentation
   - Architecture diagram

**Acceptance Criteria:**
- ✅ All tests passing
- ✅ Performance acceptable
- ✅ Documentation complete
- ✅ Ready for Phase 3

---

## 🎯 Phase 2 Success Criteria

### Must Have (MVP)
- ✅ Production package structure
- ✅ Frontend built and served
- ✅ SQLite database (sessions, files metadata)
- ✅ IPFS storage (file content)
- ✅ Owner wallet verification
- ✅ All API endpoints working
- ✅ Data persists across restarts

### Should Have
- ✅ WebSocket real-time updates
- ✅ Health check endpoint
- ✅ Logging system
- ✅ Error handling
- ✅ Configuration system

### Nice to Have (Can defer to Phase 3)
- ⏸️ Setup wizard
- ⏸️ Docker package
- ⏸️ SSL/TLS
- ⏸️ Dynamic DNS

---

## 📅 Estimated Timeline

### Week 1: Foundation
- **Day 1:** Tasks 2.1-2.2 (Structure, Build)
- **Day 2:** Task 2.3 (Static Serving)
- **Day 3:** Task 2.4 (SQLite Database)
- **Day 4:** Task 2.5 (IPFS Integration) - Start
- **Day 5:** Task 2.5 (IPFS Integration) - Complete

### Week 2: Core Features
- **Day 1:** Task 2.6 (Owner Verification)
- **Day 2:** Task 2.7 (WebSocket)
- **Day 3:** Task 2.8 (Extract API Endpoints)
- **Day 4:** Task 2.9 (Main Server Integration)
- **Day 5:** Task 2.10 (Testing) - Start

### Week 3: Polish & Testing
- **Day 1:** Task 2.10 (Testing) - Complete
- **Day 2:** Bug fixes
- **Day 3:** Documentation
- **Day 4:** Performance optimization
- **Day 5:** Final review, prepare for Phase 3

**Total: 2-3 weeks**

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20.18+
- npm/yarn
- TypeScript knowledge
- IPFS basics
- SQLite basics

### First Steps
1. **Create package structure:**
   ```bash
   mkdir -p pc2-node/src/{api,storage,auth,websocket,config}
   mkdir -p pc2-node/{frontend,data,config}
   ```

2. **Initialize package:**
   ```bash
   cd pc2-node
   npm init -y
   npm install express socket.io ipfs-core better-sqlite3 typescript
   npm install -D @types/node @types/express @types/better-sqlite3
   ```

3. **Start with Task 2.1:**
   - Create `package.json`
   - Create `tsconfig.json`
   - Set up directory structure

---

## 📝 Notes

### Migration Strategy
- Keep `tools/mock-pc2-server.cjs` for development/testing
- Build `pc2-node/` as production package
- Both can coexist during development
- Gradually migrate features from mock to production

### Key Decisions
1. **TypeScript:** Use TypeScript for type safety
2. **SQLite:** Use `better-sqlite3` for synchronous, simple API
3. **IPFS:** Use `ipfs-core` for full IPFS node
4. **WebSocket:** Use Socket.io for real-time features
5. **Express:** Use Express for HTTP server (familiar, well-supported)

### Risks & Mitigations
- **Risk:** IPFS complexity
  - **Mitigation:** Start simple, add features gradually
- **Risk:** Performance issues
  - **Mitigation:** Benchmark early, optimize as needed
- **Risk:** Data migration
  - **Mitigation:** Design schema carefully, support migrations

---

## ✅ Phase 2 Completion Checklist

- [ ] Package structure created
- [ ] Build process working
- [ ] Static file serving production-ready
- [ ] SQLite database implemented
- [ ] IPFS storage integrated
- [ ] Owner wallet verification working
- [ ] WebSocket real-time updates
- [ ] All API endpoints extracted and tested
- [ ] Main server integrated
- [ ] Comprehensive testing complete
- [ ] Documentation updated
- [ ] Ready for Phase 3 (Packaging)

---

**Status:** Ready to begin Phase 2! 🚀
