# Strategic Implementation Plan: Sash + Anders Vision
## Puter-on-PC2 Architecture

**Date:** 2025-01-11  
**Branch:** `sash-anders-vision` (to be created)  
**Status:** Strategic Planning & Implementation Guide

---

## 🚀 Quick Start: Full System Restart

**When user requests "restart everything" or "get latest build":**

```bash
# Complete restart sequence (ALWAYS do all steps)
lsof -ti:4202 | xargs kill -9 2>/dev/null || true
cd /Users/mtk/Documents/Cursor/pc2.net/pc2-node/test-fresh-install
npm run build:backend
npm run build:frontend
PORT=4202 npm start
```

**Then:** User must hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)

**See:** "Full System Restart Process" section below for details

---

## 🎯 Vision Statement

**"Puter runs ON the PC2 node itself - a self-contained software package that users install on their hardware (Raspberry Pi, VPS, Mac, etc.), accessible via a unique URL, with wallet-based decentralized identity."**

### Key Principles

1. **Self-Contained:** Frontend + Backend in one package
2. **Self-Hosted:** User controls hardware, data, and software
3. **Decentralized Identity:** Wallet-based authentication
4. **Global Access:** Unique URL accessible from anywhere
5. **No External Dependencies:** No reliance on public Puter service

---

## 📊 Current State Assessment

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

#### 5. **Documentation**
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

**Phase 3 Deliverable:** Installable packages for all platforms

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

### Risk 1: Frontend Build Complexity
- **Risk:** Frontend build process may be complex
- **Mitigation:** Start with simple static serving, iterate

### Risk 2: IPFS Integration Challenges
- **Risk:** IPFS may have performance/connectivity issues
- **Mitigation:** Keep mock server as fallback, gradual migration

### Risk 3: Network Configuration Complexity
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

### Lesson 3: Token Validation & Storage

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
cd /Users/mtk/Documents/Cursor/pc2.net/pc2-node/test-fresh-install && PORT=4202 npm start
```

---

## 🎯 What's Remaining to Do

### Phase 2 Completion (Current Phase) - ~85% Complete

#### Immediate Next Steps:
1. **WebSocket Event Delivery Testing** (1-2 days)
   - Verify events are delivered reliably
   - Test multi-tab synchronization
   - Ensure real-time updates work (file deletion, creation, etc.)

2. **App Icon Loading** (2-3 hours)
   - Update `/get-launch-apps` to load and return base64 SVG icons
   - Match mock server's format exactly

3. **Comprehensive End-to-End Testing** (2-3 days)
   - Test all file operations
   - Test all app types
   - Test session persistence in various scenarios
   - Test with multiple users

### Phase 3: Packaging & Deployment - Not Started

1. **Docker Package** (2-3 hours)
   - Create Dockerfile
   - Multi-stage build
   - Health checks

2. **Debian Package** (1 day)
   - Create .deb package for Raspberry Pi
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

### Phase 4: Network & Security - Not Started

1. **SSL/TLS Support** (2-3 days)
   - Auto SSL certificate (Let's Encrypt)
   - Auto-renewal
   - HTTP → HTTPS redirect

2. **Dynamic DNS** (1-2 days)
   - Support dynamic DNS services
   - DuckDNS, No-IP, custom domain

3. **Firewall Configuration** (1-2 days)
   - Auto-configure firewall
   - UPnP port forwarding
   - Security hardening

4. **Security Hardening** (2-3 days)
   - Rate limiting
   - Input validation
   - CSRF protection
   - Security headers

### Phase 5: Testing & Documentation - Not Started

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

## 📈 Progress Summary

- **Phase 1:** ✅ 100% Complete
- **Phase 2:** ✅ 100% Complete (core functionality working, real-time file operations fully working)
- **Phase 3:** ❌ 0% Complete
- **Phase 4:** ❌ 0% Complete
- **Phase 5:** ❌ 0% Complete

**Overall Progress:** ~40% of total project complete

**Estimated Time Remaining:** 4-5 weeks for full completion

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
│  │  Backend API (localhost:4202)                        │  │
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
│  ✅ Single Port (4202)                                       │
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
| **Backend** | api.puter.com (shared) | localhost:4202 (per-user) |
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
Local Server (localhost:4202)
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
   cd pc2-node/test-fresh-install
   npx tsc --skipLibCheck  # Skip lib check if other files have errors
   ```
3. **Verify compilation:**
   - Check `dist/` folder has updated `.js` files
   - Check for TypeScript errors (fix if critical)
   - **Note:** Some TypeScript errors in unrelated files can be ignored if they don't affect your changes
4. **Restart server:**
   ```bash
   # Kill old process
   lsof -ti:4202 | xargs kill -9
   # Start new process
   cd pc2-node/test-fresh-install && PORT=4202 npm start
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
   cd pc2-node/test-fresh-install && npx tsc --skipLibCheck
   ```
3. **Rebuild frontend:**
   ```bash
   node pc2-node/test-fresh-install/scripts/build-frontend.js
   ```
4. **Restart server:**
   ```bash
   lsof -ti:4202 | xargs kill -9
   cd pc2-node/test-fresh-install && PORT=4202 npm start
   ```
5. **Hard refresh browser**

### Quick Reference: File Locations

| Layer | Source Location | Compiled/Built Location | How to Update |
|-------|----------------|------------------------|---------------|
| **Backend API** | `pc2-node/test-fresh-install/src/api/*.ts` | `pc2-node/test-fresh-install/dist/api/*.js` | `npx tsc` |
| **WebSocket Events** | `pc2-node/test-fresh-install/src/websocket/*.ts` | `pc2-node/test-fresh-install/dist/websocket/*.js` | `npx tsc` |
| **Frontend UI** | `src/gui/src/UI/*.js` | `pc2-node/test-fresh-install/frontend/bundle.min.js` | `node scripts/build-frontend.js` |
| **Frontend Helpers** | `src/gui/src/helpers.js` | `pc2-node/test-fresh-install/frontend/bundle.min.js` | `node scripts/build-frontend.js` |

### Common Scenarios & Solutions

#### Scenario 1: "My TypeScript changes aren't working"
**Check:**
- ✅ Did you compile? (`npx tsc`)
- ✅ Did you restart the server?
- ✅ Are you looking at the right `dist/` file?
- ✅ Check server logs for errors

**Solution:** Compile and restart:
```bash
cd pc2-node/test-fresh-install
npx tsc --skipLibCheck
lsof -ti:4202 | xargs kill -9
PORT=4202 npm start
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
cd pc2-node/test-fresh-install && npx tsc --skipLibCheck

# Kill and restart server
lsof -ti:4202 | xargs kill -9
PORT=4202 npm start

# Rebuild frontend if you changed event handlers
node pc2-node/test-fresh-install/scripts/build-frontend.js
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
9. **Backup & Sync** - Redundancy and multi-device
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

**Infrastructure Improvements** - ✅ Complete (2025-12-19)
- ✅ Frontend bundle auto-copying (prevents stale bundle issues)
- ✅ Binary data support for `/writeFile` endpoint (images, PDFs)
- ✅ Enhanced error handling and logging

### 🎯 Recommended Next Steps

**Option 1: Viewer App Save Fix** (In Progress)
- ⏳ Debug why viewer app's `curfile.write()` isn't calling backend
- ⏳ Add error handling to viewer app (in progress)
- ⏳ Verify binary data handling works correctly
- **Estimated Time:** 1-2 hours

**Option 2: Quick Wins from List** (Low Effort, High Impact)
- **Recent Files** - Track `last_accessed`, add UI component (1-2 days)
- **Bulk Operations** - Multi-select delete/move (2-3 days)
- **Storage Usage Dashboard** - Simple aggregation query (1-2 days)

**Option 3: Phase 3 - Packaging** (Production Readiness)
- Docker package
- Debian package (Raspberry Pi)
- macOS package
- **Estimated Time:** 1 week

### 💡 Recommendation

**Complete Option 1 (Viewer App Save Fix)** - Critical for user workflow. Once fixed, proceed with Option 2 or Option 3 based on priorities.

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

## 🔧 Development Rules & Best Practices

### ⚠️ CRITICAL: Full System Restart Process (2025-12-19)

**MANDATORY:** When user requests "restart everything" or "get latest build", **ALWAYS** follow this complete process:

#### Standard Full Restart Sequence

```bash
# 1. Kill all existing processes
lsof -ti:4202 | xargs kill -9 2>/dev/null || true
pkill -f "node.*pc2-node" || pkill -f "npm.*start" || true

# 2. Rebuild Backend (TypeScript → JavaScript)
cd pc2-node/test-fresh-install
npm run build:backend

# 3. Rebuild Frontend (Source → Bundle)
npm run build:frontend

# 4. Restart Server
PORT=4202 npm start
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
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4202
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
**Next Action:** Phase 3 - Packaging & Deployment (Docker, Debian, macOS packages)

