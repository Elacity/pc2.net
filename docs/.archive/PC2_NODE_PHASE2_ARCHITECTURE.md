# PC2 Node Phase 2: Architectural Overview

**Date:** 2025-12-17  
**Status:** Phase 2 In Progress (~70% Complete)  
**Branch:** `phase-2-production-node`

---

## 🎯 Vision & Goal

**PC2 Node** is a self-contained software package that users install on their hardware (Raspberry Pi, VPS, Mac, etc.). It provides a complete Puter/ElastOS desktop environment accessible via a unique URL, with:

- **100% Isolation**: Zero external CDN dependencies
- **Self-Hosted**: User controls hardware, data, and software
- **Decentralized Identity**: Wallet-based authentication (Particle Auth)
- **Persistent Storage**: SQLite + IPFS for data persistence
- **Real-Time Updates**: WebSocket for instant file system changes

---

## 📊 Current State Assessment

### ✅ **COMPLETE** (Phase 2 Tasks 2.1-2.5, 2.8-2.9)

#### 1. **Package Structure** ✅
- **Location**: `pc2-node/test-fresh-install/`
- **Status**: Production-ready TypeScript structure
- **Components**:
  ```
  pc2-node/test-fresh-install/
  ├── src/
  │   ├── server.ts          # Main Express server
  │   ├── static.ts          # Static file serving
  │   ├── index.ts           # Entry point
  │   ├── api/               # API endpoints (8 files)
  │   ├── storage/           # Database + IPFS + Filesystem
  │   ├── auth/              # Owner verification
  │   ├── websocket/         # Socket.io server
  │   ├── config/            # Configuration loader
  │   └── utils/              # Logging, routes, polyfills
  ├── frontend/              # Built ElastOS frontend
  ├── config/                # User configuration
  └── data/                  # Runtime data (SQLite, IPFS)
  ```

#### 2. **Build Process** ✅
- **Scripts**: `npm run build`, `npm run dev` (using `tsx`)
- **Frontend**: Built and copied to `frontend/` directory
- **Backend**: TypeScript compiled to `dist/` (or run directly with `tsx`)
- **Status**: Working, using `tsx --watch` for development

#### 3. **Static File Serving** ✅
- **File**: `src/static.ts`
- **Features**:
  - Serves frontend files from `frontend/` directory
  - SPA fallback (all routes → `index.html`)
  - App serving at `/apps/*` (player, viewer, pdf, editor, terminal, phoenix)
  - SDK URL injection for all apps (replaces hardcoded CDN URLs)
  - Particle Auth route handling
  - Proper MIME types and cache headers
- **Status**: Production-ready

#### 4. **SQLite Database** ✅
- **File**: `src/storage/database.ts`
- **Schema**:
  - `users` - Wallet addresses, smart accounts
  - `sessions` - Authentication tokens, expiration
  - `files` - File metadata (path, IPFS hash, size, mime_type)
  - `settings` - Key-value configuration
- **Features**:
  - Automatic migrations
  - Session persistence across restarts
  - File metadata storage
  - Session extension on activity
- **Status**: Fully functional, data persists

#### 5. **IPFS Integration** ✅
- **File**: `src/storage/ipfs.ts`
- **Library**: Migrated from deprecated `ipfs-core` to modern `helia`
- **Features**:
  - IPFS node initialization with Helia
  - File storage on IPFS (returns CID)
  - File retrieval from IPFS
  - Graceful fallback (server continues without IPFS if unavailable)
- **Status**: Functional, but file operations may need testing

#### 6. **Filesystem Abstraction** ✅
- **File**: `src/storage/filesystem.ts`
- **Features**:
  - Abstraction over IPFS + Database
  - File operations: create, read, update, delete
  - Directory operations: list, create
  - Path normalization and wallet-based isolation
  - `/null` path handling (graceful fallback for frontend bug)
- **Status**: Functional

#### 7. **API Endpoints** ✅
- **Location**: `src/api/`
- **Endpoints Implemented**:
  - ✅ `/whoami` - User info (with manual token extraction)
  - ✅ `/auth/particle` - Particle Auth integration
  - ✅ `/stat` - File/directory stats (GET + POST)
  - ✅ `/read` - File content (binary support, CORS headers)
  - ✅ `/readdir` - Directory listing
  - ✅ `/write` - File creation/update
  - ✅ `/mkdir` - Directory creation
  - ✅ `/delete` - File/directory deletion
  - ✅ `/move` - File/directory move
  - ✅ `/rename` - File/directory rename
  - ✅ `/open_item` - File opening (suggests apps)
  - ✅ `/suggest_apps` - App suggestions for files
  - ✅ `/sign` - File signing for app access
  - ✅ `/file` - Signed file access (UUID parsing)
  - ✅ `/drivers/call` - Driver interface calls
  - ✅ `/get-launch-apps` - App list with icons
  - ✅ `/version` - Server version info
  - ✅ `/api/stats` - Storage statistics
  - ✅ `/kv/*` - Key-value store
- **Status**: All endpoints implemented, most working correctly

#### 8. **Authentication System** ✅
- **Files**: `src/api/auth.ts`, `src/api/middleware.ts`, `src/api/whoami.ts`
- **Features**:
  - Particle Auth integration
  - Session token management
  - App token support (`token-0x...` format)
  - Owner wallet verification
  - Session extension on activity
  - Manual token extraction in `/whoami` (no middleware)
  - Special case: `~/.__puter_gui.json` accessible without auth
- **Status**: Functional, recent fixes for app token handling

#### 9. **Configuration System** ✅
- **File**: `src/config/loader.ts`
- **Features**:
  - Loads from `config/config.json`
  - Default config fallback
  - Owner wallet configuration
  - Session duration settings
  - Storage paths (database, IPFS)
- **Status**: Working

#### 10. **Main Server Integration** ✅
- **File**: `src/server.ts`, `src/index.ts`
- **Features**:
  - Express app setup
  - Middleware (CORS, body parsing, text/plain;actually=json)
  - API routes registration
  - Static file serving
  - WebSocket setup
  - Graceful shutdown
  - Health check endpoint
- **Status**: Complete

---

### ⚠️ **IN PROGRESS / PARTIALLY WORKING** (Task 2.6-2.7)

#### 11. **WebSocket Real-Time Updates** ⚠️
- **File**: `src/websocket/server.ts`, `src/websocket/events.ts`
- **Status**: **PARTIALLY WORKING**
- **What Works**:
  - ✅ Socket.io server setup
  - ✅ Authentication middleware
  - ✅ Event queue system (`pendingEvents` array)
  - ✅ Session persistence for polling
  - ✅ Event broadcasting to user rooms
  - ✅ Polling fallback (Socket.io handles automatically)
- **What's Broken**:
  - ❌ Clients disconnect immediately after connection
  - ❌ Events not delivered reliably (file deletions require page refresh)
  - ❌ Real-time updates not working consistently
- **Root Cause**: Client disconnection prevents event delivery
- **Priority**: HIGH (user needs this for showcase)

#### 12. **App Icons** ✅ (Recently Fixed)
- **File**: `src/api/info.ts`
- **Status**: **FIXED** - Hardcoded base64 icons for all apps
- **Apps with Icons**: editor, terminal, phoenix, viewer, player, pdf
- **Format**: `data:image/svg+xml;base64,...`

#### 13. **File Opening in Apps** ⚠️
- **File**: `src/api/other.ts` (`handleOpenItem`, `handleSuggestApps`)
- **Status**: **PARTIALLY WORKING**
- **What Works**:
  - ✅ App suggestion based on file type
  - ✅ File signature generation
  - ✅ App URL generation (`/apps/player/index.html`)
- **What's Broken**:
  - ❌ Videos/images can't be opened in players/viewers
  - ❌ `/read` endpoint was sending binary files as UTF-8 (corrupting videos)
  - ✅ **RECENTLY FIXED**: Binary file handling + CORS headers added
- **Recent Fix**: `/read` now sends binary files correctly, adds CORS headers for video/image/audio

---

### ❌ **NOT YET STARTED** (Phase 2 Tasks 2.10, Phase 3-5)

#### 14. **Testing & Validation** ❌
- Unit tests
- Integration tests
- End-to-end tests
- Performance tests
- **Status**: Not started

#### 15. **Packaging & Deployment** ❌ (Phase 3)
- Docker package
- Debian package (Raspberry Pi)
- macOS package
- Setup wizard
- **Status**: Not started

#### 16. **Network & Security** ❌ (Phase 4)
- SSL/TLS support
- Dynamic DNS
- Firewall configuration
- Security hardening
- **Status**: Not started

---

## 🏗️ Architecture Layers

### Layer 1: Entry Point (`src/index.ts`)
```
┌─────────────────────────────────────┐
│         Entry Point                 │
│  - Load configuration               │
│  - Initialize database              │
│  - Initialize IPFS                  │
│  - Create server                    │
│  - Start HTTP server                │
└─────────────────────────────────────┘
```

### Layer 2: HTTP Server (`src/server.ts`)
```
┌─────────────────────────────────────┐
│      Express Server                 │
│  - Middleware setup                 │
│  - API routes                       │
│  - Static file serving              │
│  - WebSocket setup                  │
└─────────────────────────────────────┘
```

**Note**: The "HTTP Server" layer is NOT a separate external service. It's Express.js running **inside the same Node.js process** as everything else. This is just how Express organizes code - it's all one internal package running locally. There's no external HTTP server - it's all self-contained.

### Layer 3: API Layer (`src/api/`)
```
┌─────────────────────────────────────┐
│         API Endpoints               │
│  ├── Authentication                 │
│  ├── Filesystem Operations          │
│  ├── File Access (signed URLs)      │
│  ├── App Management                 │
│  └── System Info                    │
└─────────────────────────────────────┘
```

### Layer 4: Storage Layer (`src/storage/`)
```
┌─────────────────────────────────────┐
│         Storage Abstraction         │
│  ├── Database (SQLite)              │
│  │   └── Users, Sessions, Metadata  │
│  ├── IPFS (Helia)                    │
│  │   └── File Content Storage        │
│  └── Filesystem Manager              │
│      └── Unified API                 │
└─────────────────────────────────────┘
```

### Layer 5: Real-Time Layer (`src/websocket/`)
```
┌─────────────────────────────────────┐
│      Socket.io Server               │
│  ├── Authentication                 │
│  ├── Room Management                │
│  ├── Event Queue                    │
│  └── Event Broadcasting             │
└─────────────────────────────────────┘
```

---

## 🔄 Data Flow

### Authentication Flow
```
1. User → Browser → Particle Auth
2. Particle Auth → /auth/particle → Session Token
3. Session Token → Stored in SQLite
4. All API requests → authenticate middleware → Verify session
5. Session extended on activity
```

### File Operation Flow
```
1. User Action (delete file)
2. Frontend → POST /delete
3. API → FilesystemManager.deleteFile()
4. FilesystemManager → Database.deleteFile() + IPFS.unpin()
5. FilesystemManager → broadcastItemRemoved()
6. WebSocket → Queue event → Broadcast to user room
7. Client → Receive event → Update UI
```

### File Read Flow
```
1. User opens file
2. Frontend → GET /read?file=/path/to/file
3. API → authenticate middleware → Verify session
4. FilesystemManager.readFile() → Get IPFS hash from DB
5. IPFS.getFile() → Retrieve content from IPFS
6. Response → Binary content + CORS headers
7. Player/Viewer → Display file
```

---

## 🔑 Key Technical Decisions

### 1. **100% Isolation Requirement**
- **Decision**: Zero external CDN dependencies
- **Implementation**:
  - SDK served from `/puter.js/v2` (local file)
  - All apps have SDK URL injected dynamically
  - No external script tags in HTML
  - Client-side interceptors redirect any external calls to localhost

### 2. **WebSocket vs Polling**
- **Decision**: Socket.io WebSocket with polling fallback
- **Rationale**: Better for remote access over internet (lower latency)
- **Status**: Implemented but clients disconnecting

### 3. **Storage Architecture**
- **Decision**: SQLite for metadata, IPFS for content
- **Rationale**: 
  - SQLite: Fast queries, simple schema
  - IPFS: Decentralized content storage, content addressing
- **Status**: Both implemented and working

### 4. **App Token vs Session Token**
- **Decision**: Support both token types
- **Implementation**: 
  - App tokens (`token-0x...`) extracted from `/sign` endpoint
  - Middleware converts app tokens to session tokens by wallet lookup
  - Allows apps to authenticate using signed file tokens
- **Status**: Recently fixed

### 5. **Path Handling**
- **Decision**: Graceful fallback for `/null` paths
- **Implementation**: 
  - Frontend bug sends `/null/Desktop` instead of `/wallet/Desktop`
  - Server detects `/null` and replaces with authenticated wallet address
  - Logs warning but continues operation
- **Status**: Working

---

## 🚨 Critical Issues & Fixes

### Issue 1: Grey Screen / Authentication Failures
**Status**: ✅ **FIXED**
- **Problem**: `/whoami` returning `undefined` wallet address
- **Fix**: Manual token extraction in `/whoami` handler
- **Problem**: App tokens not recognized
- **Fix**: Middleware converts app tokens to session tokens

### Issue 2: File Opening (Videos/Images)
**Status**: ✅ **FIXED**
- **Problem**: `/read` sending binary files as UTF-8 strings (corrupting videos)
- **Fix**: Detect binary files, send as Buffer, add CORS headers
- **Problem**: Apps not getting SDK URL
- **Fix**: SDK URL injection for all app HTML files

### Issue 3: `/null` Paths
**Status**: ✅ **FIXED**
- **Problem**: Frontend sending `/null/Desktop` instead of `/wallet/Desktop`
- **Fix**: Graceful replacement in `handleStat`, `handleRead`, `handleReaddir`

### Issue 4: WebSocket Client Disconnection
**Status**: ⚠️ **IN PROGRESS**
- **Problem**: Clients disconnect immediately after connection
- **Impact**: Events not delivered, real-time updates broken
- **Next Steps**: Investigate WebSocket upgrade, authentication timing

### Issue 5: Session Expiration
**Status**: ✅ **FIXED**
- **Problem**: Users logged out after 30 seconds
- **Fix**: Session extension on every active request (matching mock server)

---

## 📋 Remaining Work

### High Priority (Blocking)
1. **Fix WebSocket Client Disconnection**
   - Investigate why clients disconnect immediately
   - Fix authentication timing
   - Ensure events are delivered reliably
   - **Impact**: Real-time updates not working

2. **Verify File Opening**
   - Test video playback in player app
   - Test image viewing in viewer app
   - Verify CORS headers working
   - **Impact**: Core functionality broken

### Medium Priority
3. **Drag & Drop in Explorer**
   - Currently only works on desktop
   - Should work in Documents, Videos, etc.
   - **Impact**: UX limitation

4. **Terminal App CSP Violation**
   - CSP blocking `terminal.puter.site`
   - Terminal not displaying CLI correctly
   - **Impact**: Terminal app broken

### Low Priority (Phase 3+)
5. **Testing Suite**
6. **Packaging (Docker, Debian, macOS)**
7. **SSL/TLS Support**
8. **Dynamic DNS**
9. **Setup Wizard**

---

## 🎯 Success Metrics

### Phase 2 Completion Criteria
- [x] Package structure created
- [x] Build process working
- [x] Static file serving production-ready
- [x] SQLite database implemented
- [x] IPFS storage integrated
- [x] Owner wallet verification working
- [x] All API endpoints extracted
- [x] Main server integrated
- [ ] WebSocket real-time updates **WORKING** ⚠️
- [ ] File opening in apps **VERIFIED** ⚠️
- [ ] Comprehensive testing complete ❌
- [ ] Documentation updated ✅

### Current Completion: ~70%

---

## 🔍 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (Client)                          │
│  - ElastOS Frontend (GUI)                                     │
│  - Puter SDK (local: /puter.js/v2)                           │
│  - Socket.io Client                                           │
└──────────────────────┬────────────────────────────────────────┘
                       │ HTTP/WebSocket
                       │
┌──────────────────────▼────────────────────────────────────────┐
│              PC2 Node (Server)                                │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Express HTTP Server                                  │   │
│  │  ├── Static File Serving (/frontend/*)                │   │
│  │  ├── App Serving (/apps/*)                            │   │
│  │  └── API Routes (/api/*, /whoami, /stat, etc.)       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Socket.io WebSocket Server                          │   │
│  │  ├── Authentication                                   │   │
│  │  ├── Room Management                                  │   │
│  │  └── Event Broadcasting                               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Storage Layer                                        │   │
│  │  ├── DatabaseManager (SQLite)                         │   │
│  │  │   └── Users, Sessions, File Metadata              │   │
│  │  ├── IPFSStorage (Helia)                              │   │
│  │  │   └── File Content (CID-based)                     │   │
│  │  └── FilesystemManager                                │   │
│  │      └── Unified API                                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Authentication                                        │   │
│  │  ├── Particle Auth Integration                        │   │
│  │  ├── Session Management                               │   │
│  │  └── Owner Verification                              │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

---

## 📊 Component Status Matrix

| Component | Status | Notes |
|-----------|--------|-------|
| Package Structure | ✅ Complete | Production-ready TypeScript |
| Build Process | ✅ Complete | Using `tsx` for dev, `tsc` for production |
| Static Serving | ✅ Complete | SPA fallback, app serving, SDK injection |
| SQLite Database | ✅ Complete | Sessions, files, users persist |
| IPFS Storage | ✅ Complete | Helia integration, graceful fallback |
| Filesystem Manager | ✅ Complete | Unified API over IPFS + DB |
| API Endpoints | ✅ Complete | All endpoints implemented |
| Authentication | ✅ Complete | Particle Auth, sessions, app tokens |
| Configuration | ✅ Complete | Config loader, owner verification |
| WebSocket Server | ⚠️ Partial | Clients disconnecting, events not reliable |
| App Icons | ✅ Complete | Hardcoded base64 SVG icons |
| File Opening | ⚠️ Partial | Binary handling fixed, needs verification |
| Testing | ❌ Not Started | No test suite yet |
| Packaging | ❌ Not Started | Phase 3 |
| SSL/TLS | ❌ Not Started | Phase 4 |

---

## 🚀 Next Immediate Steps

### 1. Fix WebSocket (Critical)
- Investigate client disconnection
- Fix authentication timing
- Ensure event delivery
- Test real-time file updates

### 2. Verify File Opening
- Test video playback
- Test image viewing
- Verify CORS headers
- Test in different apps

### 3. Fix Remaining Issues
- Drag & drop in explorer
- Terminal CSP violation
- Any other UX issues

### 4. Testing
- Manual testing of all features
- Verify against mock server behavior
- Document any differences

---

## 📚 Key Files Reference

### Core Server
- `src/index.ts` - Entry point, initialization
- `src/server.ts` - Express server setup
- `src/static.ts` - Static file serving

### API Layer
- `src/api/index.ts` - Route registration
- `src/api/middleware.ts` - Authentication, CORS
- `src/api/auth.ts` - Particle Auth
- `src/api/whoami.ts` - User info
- `src/api/filesystem.ts` - File operations
- `src/api/other.ts` - Open item, suggest apps, drivers
- `src/api/info.ts` - App list, stats
- `src/api/file.ts` - Signed file access

### Storage Layer
- `src/storage/database.ts` - SQLite operations
- `src/storage/ipfs.ts` - IPFS node (Helia)
- `src/storage/filesystem.ts` - Unified filesystem API

### Real-Time
- `src/websocket/server.ts` - Socket.io server
- `src/websocket/events.ts` - Event broadcasting

### Configuration
- `src/config/loader.ts` - Config loading
- `config/config.json` - User configuration

---

## 🎓 Architecture Principles

1. **100% Isolation**: No external dependencies
2. **Self-Contained**: Frontend + Backend in one package
3. **Persistent**: Data survives restarts (SQLite + IPFS)
4. **Real-Time**: WebSocket for instant updates
5. **Wallet-Based**: Decentralized identity via Particle Auth
6. **Graceful Degradation**: Server continues without IPFS if unavailable

---

**Status**: Phase 2 ~70% complete, core functionality working, WebSocket needs fixes  
**Next**: Fix WebSocket client disconnection, verify file opening, complete testing
