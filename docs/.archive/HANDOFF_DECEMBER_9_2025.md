# PC2.net Development Handoff Document
**Date:** December 9, 2025  
**Branch:** `sash-work`  
**Last Commit:** `40e820d0` - "Fix Desktop file display and readdir caching issues"

---

## 🎯 Project Overview

**PC2.net** is a decentralized personal cloud compute platform that allows users to run their own backend infrastructure (PC2 node) on personal hardware or VPS, accessed via wallet-based decentralized identity (EOA). The goal is to provide **decentralized identity, storage, compute, and digital freedom**.

### Core Architecture

```
┌─────────────────┐
│  Puter Frontend │  (ElastOS-branded PuterOS)
│  (Browser)       │
└────────┬────────┘
         │ HTTP/WebSocket
         │ Wallet Auth (MetaMask)
         │
┌────────▼────────┐
│   PC2 Node      │  (User's Personal Cloud)
│   - IPFS        │  (Decentralized Storage)
│   - Wasmer Apps │  (Future: Compute)
│   - File System │  (Puter-compatible API)
└─────────────────┘
```

**Key Principle:** The Puter frontend talks **directly** to the user's PC2 node. There is no centralized Puter backend acting as a proxy. The PC2 node IS the backend.

---

## ✅ What Was Accomplished Today

### 1. **Desktop File Display Fixes**
- **Issue:** Files uploaded to Desktop appeared in the Desktop folder window but not as icons on the desktop background
- **Root Causes:**
  - Desktop `readdir` was using `consistency: 'eventual'`, which returned cached empty arrays without making server requests
  - Desktop item path construction failed because `el_window` is `null` for desktop background (not inside a `.window` element)
- **Fixes:**
  - Desktop now uses `consistency: 'strong'` to force fresh server requests
  - Fixed path construction to use `container_path` when `el_window` is null
- **Files Modified:**
  - `src/gui/src/helpers/refresh_item_container.js`

### 2. **PC2 Connection & Authentication**
- Session-based authentication (7-day sessions) to avoid repeated MetaMask signatures
- Auto-reconnect on page refresh
- Direct API redirection: All Puter API calls go directly to PC2 node via `puter.setAPIOrigin()` and `puter.setAuthToken()`
- **Files:**
  - `src/gui/src/services/PC2ConnectionService.js`
  - `src/gui/src/UI/UIPC2StatusBar.js`
  - `src/gui/src/UI/UIPC2SetupWizard.js`

### 3. **Settings Integration**
- PC2 settings integrated into main Puter Settings window
- Consolidated "Usage" and "IPFS Storage" tabs into "Personal Cloud" tab
- Removed redundant IPFS Node section (PC2 handles IPFS internally)
- **Files:**
  - `src/gui/src/UI/Settings/UITabPC2.js`
  - `src/gui/src/services/SettingsService.js`
  - Deleted: `src/gui/src/UI/Settings/UITabIPFS.js`

### 4. **Mock PC2 Server Enhancements**
- Full Puter API compatibility (`/stat`, `/readdir`, `/read`, `/write`, `/mkdir`, `/delete`, `/move`, `/batch`, `/open_item`, `/file`, etc.)
- In-memory filesystem with per-wallet isolation
- Socket.io event simulation (real-time updates via polling)
- App serving from `src/backend/apps/` (viewer, player, pdf, editor, terminal)
- **File:**
  - `tools/mock-pc2-server.cjs`

### 5. **Puter Apps Integration**
- Downloaded and integrated Puter's core apps (viewer, player, pdf, editor) from hosted servers
- Apps now served from PC2 node instead of external URLs
- **Files Added:**
  - `src/backend/apps/viewer/`
  - `src/backend/apps/player/`
  - `src/backend/apps/pdf/`
  - `src/backend/apps/editor/`
  - `tools/download-puter-apps.sh`

### 6. **Documentation**
- `docs/SOCKET_IO_AUDIT.md` - Socket.io implementation audit
- `docs/MOCK_VS_PRODUCTION_CHECKLIST.md` - Differences between mock and production
- `docs/PRE_PRODUCTION_TESTING.md` - Testing checklist
- `docs/PC2_APPS_INTEGRATION.md` - Apps integration strategy
- `docs/APPS_DISCOVERY_SUMMARY.md` - App discovery findings

---

## 🏗️ Architecture Overview

### Frontend (Puter GUI)

**Location:** `src/gui/`

**Key Services:**
- `PC2ConnectionService.js` - Manages connection to PC2 node, authentication, API redirection
- `WalletService.js` - Wallet connection and token management (Particle Network)
- `SettingsService.js` - Settings window management

**Key UI Components:**
- `UIDesktop.js` - Desktop background and initialization
- `UIPC2StatusBar.js` - PC2 connection status in toolbar
- `UIPC2SetupWizard.js` - PC2 connection wizard
- `Settings/UITabPC2.js` - PC2 settings tab

**Key Helpers:**
- `refresh_item_container.js` - Refreshes folder/desktop contents
- `helpers.js` - Various utilities including `upload_items()`

### Backend (Mock PC2 Server)

**Location:** `tools/mock-pc2-server.cjs`

**Purpose:** Simulates PC2 node for local development and testing

**Key Features:**
- HTTP server on port 4200
- In-memory filesystem with per-wallet isolation
- Puter API compatibility
- Session-based authentication
- Socket.io event simulation (polling-based)
- App serving from `src/backend/apps/`

**State Persistence:** `/tmp/pc2-mock-state.json`

### Production PC2 Node (Future)

**Location:** `extensions/pc2-node/`

**Status:** Architecture defined, not yet implemented

**Planned Features:**
- Real IPFS integration
- SQLite database
- Docker packaging
- Setup token for initial ownership
- Whitelist system for additional users

---

## 🔧 Development Workflow

### Starting the Development Environment

1. **Start Mock PC2 Server:**
   ```bash
   cd /Users/mtk/Documents/Cursor/pc2.net
   node tools/mock-pc2-server.cjs
   ```
   Server runs on `http://127.0.0.1:4200` (or `http://puter.localhost:4200`)

2. **Start Puter Frontend:**
   ```bash
   cd src/gui
   npm run dev
   ```
   Frontend runs on `http://puter.localhost:4100`

3. **Rebuild Frontend (after code changes):**
   ```bash
   cd src/gui
   npm run build
   ```
   Then hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)

### Testing PC2 Connection

1. Open browser to `http://puter.localhost:4100`
2. Sign in with MetaMask (wallet address in URL)
3. Click cloud icon in top toolbar
4. Click "Connect to PC2"
5. Enter PC2 URL: `http://127.0.0.1:4200` (or `http://puter.localhost:4200`)
6. Enter setup token (displayed in mock server console)
7. Sign message in MetaMask
8. Should auto-connect on refresh (7-day session)

### File Operations Testing

1. **Upload to Desktop:**
   - Drag & drop file onto desktop background
   - File should appear as icon on desktop AND in Desktop folder window
   - Check server logs for `🔵 READDIR HANDLER CALLED` for Desktop

2. **Open Files:**
   - Double-click file on desktop
   - Should open in appropriate app (viewer for images, player for videos, pdf for PDFs, editor for text)

3. **Create Folders:**
   - Right-click → New Folder
   - Should appear immediately (real-time updates via Socket.io)

---

## 🐛 Known Issues & Limitations

### Mock Server Limitations

1. **Socket.io is Polling-Based:** Real-time updates use HTTP polling, not WebSockets
   - **Impact:** Slight delay in file updates
   - **Production Fix:** Implement real WebSocket support

2. **In-Memory Filesystem:** All data lost on server restart
   - **Impact:** Testing only, not production-ready
   - **Production Fix:** Use real IPFS + SQLite

3. **No Real IPFS:** Mock server doesn't actually use IPFS
   - **Impact:** Files not stored on IPFS network
   - **Production Fix:** Integrate real IPFS via `IPFSProvider`

4. **No Compute:** Wasmer apps not yet integrated
   - **Impact:** Can't run Wasmer capsules for compute
   - **Future Work:** Phase 2 - Wasmer integration

### Frontend Issues

1. **Desktop Icons May Not Sort:** Desktop items use custom positioning (`window.desktop_item_positions`)
   - **Status:** Working, but may need refinement
   - **File:** `src/gui/src/helpers/refresh_item_container.js` line 196

2. **Cache Invalidation:** Some directories may show stale data if cache isn't invalidated
   - **Status:** Desktop uses 'strong' consistency, others use 'eventual'
   - **File:** `src/gui/src/helpers/refresh_item_container.js` line 119

3. **Socket.io Errors in Console:** Mixed content warnings (HTTPS apps trying to connect to HTTP mock server)
   - **Impact:** Cosmetic only, functionality works
   - **Production Fix:** Use HTTPS for PC2 node

---

## 📋 Next Steps & Priorities

### Immediate (High Priority)

1. **Test Desktop File Display:**
   - Verify files appear on desktop background after upload
   - Check server logs for Desktop readdir requests
   - Test with multiple file types (images, PDFs, videos, text)

2. **Real-time Updates:**
   - Verify Socket.io events are working (file add/remove/move)
   - Test that changes appear without page refresh
   - Check `tools/mock-pc2-server.cjs` `emitSocketEvent()` calls

3. **App Functionality:**
   - Test viewer, player, pdf apps with actual files
   - Verify editor saves correctly
   - Check terminal (may show "Not found" - expected for mock)

### Short-term (This Week)

1. **Production PC2 Node:**
   - Implement real IPFS integration in `extensions/pc2-node/`
   - Add SQLite database for metadata
   - Implement setup token system
   - Docker packaging

2. **Socket.io Real WebSockets:**
   - Replace polling with real WebSocket support in mock server
   - Test real-time updates

3. **Error Handling:**
   - Add better error messages for connection failures
   - Handle network errors gracefully
   - Add retry logic for failed requests

### Medium-term (Next Sprint)

1. **Wasmer Integration (Phase 2):**
   - Research Wasmer runtime integration
   - Design app execution model
   - Implement basic Wasmer capsule execution

2. **Security Hardening:**
   - Implement proper signature verification
   - Add rate limiting
   - Add input validation
   - Security audit

3. **Performance Optimization:**
   - Optimize file uploads (chunking)
   - Add caching strategies
   - Optimize database queries

---

## 📁 Key Files Reference

### Frontend Core

| File | Purpose |
|------|---------|
| `src/gui/src/services/PC2ConnectionService.js` | PC2 connection, auth, API redirection |
| `src/gui/src/helpers/refresh_item_container.js` | Refresh folder/desktop contents |
| `src/gui/src/UI/UIDesktop.js` | Desktop background initialization |
| `src/gui/src/UI/UIPC2StatusBar.js` | PC2 status in toolbar |
| `src/gui/src/UI/Settings/UITabPC2.js` | PC2 settings tab |

### Backend (Mock)

| File | Purpose |
|------|---------|
| `tools/mock-pc2-server.cjs` | Mock PC2 server for testing |
| `/tmp/pc2-mock-state.json` | Mock server state persistence |

### Apps

| Directory | App |
|-----------|-----|
| `src/backend/apps/viewer/` | Image viewer |
| `src/backend/apps/player/` | Video player |
| `src/backend/apps/pdf/` | PDF viewer |
| `src/backend/apps/editor/` | Text editor |
| `src/terminal/` | Terminal (already existed) |

### Documentation

| File | Purpose |
|------|---------|
| `docs/SOCKET_IO_AUDIT.md` | Socket.io implementation details |
| `docs/MOCK_VS_PRODUCTION_CHECKLIST.md` | Mock vs production differences |
| `docs/PC2_APPS_INTEGRATION.md` | Apps integration strategy |

---

## 🔍 Debugging Tips

### Desktop Files Not Showing

1. **Check Server Logs:**
   ```bash
   tail -f /tmp/pc2-server.log | grep -E "(🔵|READDIR|Desktop)"
   ```
   Should see `🔵 READDIR HANDLER CALLED` for Desktop requests

2. **Check Browser Console:**
   - Look for `[refresh_item_container] readdir returned X entries`
   - Check for errors in `UIItem` creation

3. **Verify Desktop Path:**
   - Check `window.desktop_path` in browser console
   - Verify `el_item_container.attr('data-path')` matches

### PC2 Connection Issues

1. **Check Session:**
   - Look in `localStorage` for `pc2_session`
   - Verify session token matches server

2. **Check API Redirection:**
   - Browser console should show: `[PC2]: 🚀 All API calls redirected to your Personal Cloud!`
   - Check `window.api_origin` matches PC2 URL

3. **Check Server:**
   - Verify mock server is running: `ps aux | grep mock-pc2-server`
   - Check server logs for authentication errors

### File Upload Issues

1. **Check Multipart Parsing:**
   - Server logs should show: `📦 MULTIPART REQUEST detected`
   - Check for parsing errors

2. **Check File Size:**
   - Verify file size in `/stat` response
   - Check base64 encoding/decoding

3. **Check Socket Events:**
   - Server should emit `item.added` event
   - Check browser Network tab for Socket.io polling requests

---

## 🧪 Testing Checklist

### Basic Functionality

- [ ] Connect to PC2 node (setup token + signature)
- [ ] Auto-reconnect on page refresh (no new signature)
- [ ] Upload file to Desktop (appears on desktop background)
- [ ] Upload file to Desktop folder window (appears in window)
- [ ] Open image file (viewer app)
- [ ] Open video file (player app)
- [ ] Open PDF file (pdf app)
- [ ] Open text file (editor app)
- [ ] Save file from editor
- [ ] Create folder
- [ ] Delete file (moves to Trash)
- [ ] Empty Trash (permanent delete)

### Real-time Updates

- [ ] Upload file → appears immediately (no refresh)
- [ ] Delete file → disappears immediately
- [ ] Move file → updates immediately
- [ ] Create folder → appears immediately

### Settings

- [ ] PC2 settings tab shows connection status
- [ ] PC2 settings tab shows storage stats
- [ ] PC2 settings tab shows trusted wallets
- [ ] Invite wallet functionality
- [ ] Disconnect/Forget Node buttons work

---

## 🚨 Critical Notes

1. **Never Push Without User Approval:** User explicitly requested no pushes unless told to do so. Today's push was explicitly requested.

2. **Mock Server State:** The mock server's state file (`/tmp/pc2-mock-state.json`) is **NOT** in git. Each developer will have their own state. If you need to reset, delete this file.

3. **Frontend Must Be Rebuilt:** After any changes to `src/gui/src/`, you MUST run `npm run build` in `src/gui/` and hard refresh the browser.

4. **Desktop Consistency:** Desktop uses `consistency: 'strong'` to force fresh requests. Other directories use `consistency: 'eventual'` for performance. This is intentional.

5. **PC2 is the Backend:** Remember - the Puter frontend talks DIRECTLY to the user's PC2 node. There is no centralized Puter backend in this architecture.

---

## 📞 Getting Help

### Check These First

1. **Server Logs:** `/tmp/pc2-server.log`
2. **Browser Console:** Look for `[PC2]`, `[refresh_item_container]`, `[UIDesktop]` logs
3. **Network Tab:** Check API requests are going to PC2 URL (not `api.puter.com`)
4. **Documentation:** Check `docs/` directory for relevant guides

### Common Commands

```bash
# Check mock server status
ps aux | grep mock-pc2-server

# View server logs
tail -f /tmp/pc2-server.log

# Restart mock server
pkill -f mock-pc2-server
node tools/mock-pc2-server.cjs

# Rebuild frontend
cd src/gui && npm run build

# Check git status
git status
```

---

## 🎓 Architecture Decisions

### Why Direct PC2 Connection?

The user explicitly requested: *"isnt the goal the user logs on into puter then they connect to their pc2 cloud, this is their backend and their wallet / decentralsed identity is their key to access it"*

This means:
- No centralized Puter backend
- PC2 node IS the backend
- Frontend uses `puter.setAPIOrigin()` to redirect all API calls to PC2

### Why Strong Consistency for Desktop?

Desktop files are user-facing and need to be immediately visible. Using `'strong'` ensures fresh data. Other directories can use `'eventual'` for performance.

### Why Mock Server?

The mock server allows testing the full PC2 integration without:
- Setting up Docker
- Configuring IPFS
- Deploying to a server

It's a development tool, not production code.

---

## 🔮 Future Vision

The end goal is:
1. **Users run PC2 node** on their hardware/VPS
2. **Connect via wallet** (decentralized identity)
3. **Store files on IPFS** (decentralized storage)
4. **Run Wasmer apps** (decentralized compute)
5. **Own their data** (digital freedom)

Current status: **Phase 1** (Identity + Storage) is mostly complete. **Phase 2** (Compute/Wasmer) is next.

---

## 📝 Commit History (Today)

- `40e820d0` - Fix Desktop file display and readdir caching issues
  - Desktop readdir now uses 'strong' consistency
  - Fixed desktop item path construction
  - Enhanced mock server logging

---

**End of Handoff Document**

*Good luck with the continuation! The codebase is well-documented and the architecture is clear. Focus on testing the Desktop fixes first, then move to production PC2 node implementation.*

