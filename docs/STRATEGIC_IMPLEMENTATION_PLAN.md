# Strategic Implementation Plan: Sash + Anders Vision
## Puter-on-PC2 Architecture

**Date:** 2025-01-11  
**Branch:** `sash-anders-vision` (to be created)  
**Status:** Strategic Planning & Implementation Guide

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
  - ⚠️ **REMAINING**: Move files between directories (not just to trash) - needs testing/fixing
  - **File:** `pc2-node/src/websocket/server.ts`
  - **Features:**
    - Real-time file updates (delete working, move between directories needs work)
    - Multi-tab sync (working - events broadcast to all connected clients)
    - Event broadcasting (queue implemented, delivery working)
    - Polling fallback support (Socket.io handles automatically)
  - **Time:** 1 day (initial implementation) + 1 day (fixes) = 2 days total

**Phase 2 Deliverable:** ✅ **NEARLY COMPLETE** - Production PC2 node with frontend built-in, WebSocket real-time updates working for deletions

**Recent Progress (2025-12-17):**
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
- ✅ **WebSocket Real-Time Updates Fixed (2025-12-17):**
  - ✅ Fixed authentication token reading (`auth.auth_token` format from frontend)
  - ✅ Fixed socket authentication on handshake (sockets now stay connected)
  - ✅ Fixed room membership (sockets properly join user rooms)
  - ✅ Fixed frontend build script (PROJECT_ROOT calculation, index.html generation with full initialization)
  - ✅ Fixed frontend event handlers (items now removed from DOM, not just hidden)
  - ✅ Real-time file deletion working - items disappear immediately without page refresh
  - ✅ Event delivery confirmed - handlers receiving events, finding items, removing from DOM
- ⚠️ **Remaining Issues:**
  - ⚠️ Move files between directories (e.g., Desktop → Documents) - events emitted but UI not updating
  - ⚠️ Move to trash works, but move between regular directories needs investigation

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

**Status:** Phase 2 ~90% complete - Core functionality working, real-time deletions working, move between directories needs fix  
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

### ⚠️ **IN PROGRESS** - Needs Testing/Verification

1. **WebSocket Real-Time Updates** ✅ **DELETE WORKING**, ⚠️ **MOVE NEEDS FIX**
   - ✅ Socket.io server implemented
   - ✅ Event queue system
   - ✅ Event delivery reliability (confirmed working)
   - ✅ Multi-tab synchronization (events broadcast to all connected clients)
   - ✅ Real-time file deletion working (items removed from DOM immediately)
   - ⚠️ **REMAINING**: Move files between directories (not just to trash) - events emitted but UI not updating correctly

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

### In Progress
- ⚠️ Move files between directories (Desktop → Documents, etc.) - events emitted but UI not updating correctly
- ⚠️ Need to verify `item.moved` event handler is working properly for non-trash moves

### Next Immediate Tasks
1. **Fix Move Files Between Directories** (Priority 1)
   - Investigate why `item.moved` events aren't updating UI for non-trash moves
   - Verify `item.moved` event handler is receiving events correctly
   - Check if items are being removed from old location and added to new location
   - Test move operations (Desktop → Documents, etc.)

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
- **Phase 2:** ⚠️ ~90% Complete (core functionality working, real-time deletions working, move between directories needs fix)
- **Phase 3:** ❌ 0% Complete
- **Phase 4:** ❌ 0% Complete
- **Phase 5:** ❌ 0% Complete

**Overall Progress:** ~38% of total project complete

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

**Status:** Phase 2 ~85% complete - Core functionality working, session persistence fixed  
**Next Action:** WebSocket event delivery testing, comprehensive end-to-end testing

