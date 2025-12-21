# Agent Handoff Prompt - PC2 Node WebSocket Fixes

**Date:** 2025-12-17  
**Context:** Continuing work on PC2 node WebSocket implementation  
**Priority:** HIGH - User needs to showcase tonight

---

## 🎯 Your Mission

Fix the WebSocket implementation in the PC2 node to ensure reliable real-time event delivery. The PC2 node is a self-contained software package that users will run on hardware boxes/VPS servers and access remotely from anywhere in the world.

**Critical Requirement:** The PC2 node must be 100% isolated with ZERO external CDN dependencies. Everything must be served locally.

---

## 📊 Current Status

### What's Working ✅
- PC2 node structure created (`pc2-node/`)
- Frontend built and served from PC2 node
- IPFS integration (migrated to Helia library)
- SQLite database with session management
- Socket.io WebSocket server implemented (`pc2-node/src/websocket/server.ts`)
- Event queue system added (`pendingEvents` array)
- Authentication middleware with session persistence
- Event broadcasting to user rooms

### What's NOT Working ❌
1. **WebSocket clients disconnect immediately** after connection
   - Logs show: `client namespace disconnect` or `transport close`
   - Clients connect, authenticate, join room, then immediately disconnect
   
2. **Events not being delivered reliably**
   - User reports: "deleting isn't live, have to refresh the page"
   - Events are queued correctly but not received by clients
   - Real-time file deletion updates don't appear without page refresh

3. **App icons missing**
   - `/get-launch-apps` returns `undefined` for most app icons
   - Mock server returns base64 SVG icons
   - Need to load SVG files and convert to base64

4. **File opening may not work**
   - `/open_item` returns path-based URLs (`/apps/viewer/index.html`)
   - Needs verification that apps are served correctly

---

## 🏗️ Architecture Context

### WebSocket Decision
**We're using WebSocket (not HTTP polling) because:**
- PC2 nodes will be accessed remotely over the internet
- WebSocket is more efficient for remote connections (lower latency)
- Socket.io automatically falls back to polling if WebSocket fails
- Better for real-time updates over long distances

**Reference Implementation:**
- Mock server (`tools/mock-pc2-server.cjs`) uses HTTP polling (simpler for localhost)
- PC2 node uses Socket.io WebSocket (better for remote access)
- Both approaches should work, but WebSocket is preferred for production

### Key Files

1. **WebSocket Server:** `pc2-node/src/websocket/server.ts`
   - Main Socket.io server setup
   - Authentication middleware
   - Event queue (`pendingEvents` array)
   - Session persistence (`socketSessions` map)

2. **Event Broadcasting:** `pc2-node/src/websocket/events.ts`
   - `broadcastItemAdded()` - queues and broadcasts file creation events
   - `broadcastItemRemoved()` - queues and broadcasts file deletion events
   - `setEventQueue()` - makes event queue accessible from other modules

3. **API Endpoints:**
   - `pc2-node/src/api/info.ts` - `/get-launch-apps` (needs app icons)
   - `pc2-node/src/api/other.ts` - `/open_item` (file opening)
   - `pc2-node/src/api/filesystem.ts` - file operations (delete, create, etc.)

4. **Static File Serving:** `pc2-node/src/static.ts`
   - Serves frontend files
   - Serves app files at `/apps/*`

5. **Reference (Mock Server):** `tools/mock-pc2-server.cjs`
   - Working implementation (uses polling, but good reference)
   - Shows how events should be queued and delivered
   - Shows how app icons should be returned (base64 SVG)

---

## 🔍 Root Cause Analysis

### Problem 1: Client Disconnection
**Symptoms:**
- Clients connect successfully
- Authentication works
- Clients join user room
- Then immediately disconnect (`client namespace disconnect`)

**Possible Causes:**
1. WebSocket upgrade failing (Socket.io falls back to polling, but client may disconnect)
2. Authentication timing issue (client disconnects before auth completes)
3. Socket.io client configuration mismatch
4. Network/firewall issues (less likely for localhost testing)

**Investigation Steps:**
1. Check Socket.io server logs for disconnection reasons
2. Verify WebSocket upgrade is successful
3. Check if polling fallback is working
4. Verify client-side Socket.io configuration

### Problem 2: Event Delivery Failure
**Symptoms:**
- Events are queued correctly (`pendingEvents` array has events)
- Events are broadcast to rooms (`io.to(room).emit()`)
- But clients don't receive events

**Possible Causes:**
1. Clients disconnect before events are sent
2. Events are sent but client isn't listening
3. Room membership not working correctly
4. Event queue delivery on connect/reconnect not working

**Investigation Steps:**
1. Verify clients are actually connected when events are broadcast
2. Check if events are delivered on connect/reconnect
3. Verify room membership (`io.sockets.adapter.rooms.get(room)`)
4. Test event delivery with manual socket.emit() to verify client can receive

---

## 🛠️ Tasks to Complete

### Priority 1: Fix WebSocket Client Connection

**Goal:** Ensure clients stay connected after authentication

**Steps:**
1. Investigate why clients disconnect immediately
   - Add detailed logging to connection/disconnection handlers
   - Check WebSocket upgrade process
   - Verify authentication timing
   
2. Fix disconnection issue
   - May need to adjust Socket.io server configuration
   - May need to fix authentication flow
   - May need to handle reconnection better

3. Test connection stability
   - Verify clients stay connected
   - Test with multiple tabs
   - Test reconnection scenarios

**Files to Modify:**
- `pc2-node/src/websocket/server.ts` - connection handling, authentication

### Priority 2: Fix Event Delivery

**Goal:** Ensure events are delivered reliably to connected clients

**Steps:**
1. Verify event queue is working
   - Check `pendingEvents` array is populated
   - Verify events are queued when files are deleted/created

2. Fix event delivery
   - Ensure events are delivered when clients connect
   - Verify events are broadcast to correct rooms
   - Test that clients receive events

3. Test real-time updates
   - Delete a file → should disappear immediately (no refresh needed)
   - Create a file → should appear immediately
   - Test in multiple tabs (should sync)

**Files to Modify:**
- `pc2-node/src/websocket/server.ts` - event delivery on connect
- `pc2-node/src/websocket/events.ts` - event broadcasting
- `pc2-node/src/api/filesystem.ts` - ensure events are triggered on file operations

### Priority 3: Fix App Icons

**Goal:** Return base64 SVG icons for all apps in `/get-launch-apps`

**Steps:**
1. Load SVG files from `src/backend/assets/app-icons/` (or wherever they are)
2. Convert to base64 data URLs: `data:image/svg+xml;base64,...`
3. Return in `/get-launch-apps` response matching mock server format

**Reference:**
- Mock server: `tools/mock-pc2-server.cjs` (search for `/get-launch-apps`)
- Format: `icon: "data:image/svg+xml;base64,..."`

**Files to Modify:**
- `pc2-node/src/api/info.ts` - `/get-launch-apps` endpoint

### Priority 4: Verify File Opening

**Goal:** Ensure files can be opened in apps (viewer, player, etc.)

**Steps:**
1. Verify apps are served at `/apps/*` paths
2. Test `/open_item` endpoint returns correct URLs
3. Test opening a file in viewer/player

**Files to Check:**
- `pc2-node/src/static.ts` - app serving
- `pc2-node/src/api/other.ts` - `/open_item` endpoint

---

## 🧪 Testing Instructions

### Start PC2 Node
```bash
cd /Users/mtk/Documents/Cursor/pc2.net/pc2-node/test-fresh-install
PORT=4202 npm start
```

### Test WebSocket Connection
1. Open browser to `http://localhost:4202`
2. Authenticate with wallet
3. Check server logs for:
   - `✅ WebSocket client connected`
   - `✅ WebSocket client authenticated`
   - `⚠️ No clients connected` (this is the problem)

### Test Real-Time Updates
1. Delete a file on desktop
2. File should disappear immediately (no refresh needed)
3. Check server logs for:
   - `📤 Broadcasting item.removed event`
   - `⚠️ No clients connected to user:...` (this is the problem)

### Test App Icons
1. Open start menu
2. App icons should show (not generic cube icons)
3. Check `/get-launch-apps` response for `icon` field

### Test File Opening
1. Double-click a file
2. Should open in appropriate app (viewer, player, etc.)
3. Check `/open_item` response for correct app URL

---

## 📚 Key Documentation

1. **Strategic Plan:** `docs/STRATEGIC_IMPLEMENTATION_PLAN.md`
   - Full project context
   - Architecture decisions
   - Lessons learned
   - Current status

2. **Deep Audit:** `docs/PC2_NODE_VS_MOCK_SERVER_DEEP_AUDIT.md`
   - Detailed comparison with mock server
   - Known issues
   - Implementation plan

3. **Mock Server:** `tools/mock-pc2-server.cjs`
   - Working reference implementation
   - Shows correct event queuing/delivery
   - Shows correct app icon format

---

## 🚨 Critical Requirements

### 100% Internal Isolation
**PC2 node MUST have ZERO external dependencies:**
- ❌ NO external CDN calls
- ❌ NO external API calls (except Particle Auth for wallet)
- ✅ ALL assets served locally
- ✅ ALL scripts served locally
- ✅ SDK served from `/puter.js/v2` (local file)

**Verification:**
```bash
# Check for external dependencies
grep -r "js.puter.com" pc2-node/
grep -r "https://" pc2-node/frontend/ | grep -v "localhost"
# Should return NO results
```

### WebSocket for Remote Access
- Use Socket.io WebSocket (not custom polling)
- Socket.io automatically falls back to polling if WebSocket fails
- This is the right choice for remote access over internet

---

## 🎯 Success Criteria

### WebSocket Connection
- ✅ Clients connect and stay connected
- ✅ No immediate disconnections
- ✅ Reconnection works properly
- ✅ Multiple tabs can connect simultaneously

### Event Delivery
- ✅ File deletions appear immediately (no refresh)
- ✅ File creations appear immediately
- ✅ Events sync across multiple tabs
- ✅ Events are delivered reliably

### App Icons
- ✅ All apps have proper icons (not generic cubes)
- ✅ Icons are base64 SVG data URLs
- ✅ Matches mock server format

### File Opening
- ✅ Files can be opened in apps
- ✅ Apps load correctly
- ✅ File content displays correctly

---

## 💡 Tips & Tricks

1. **Use Mock Server as Reference**
   - Mock server works perfectly
   - Use it to understand expected behavior
   - Compare responses between mock server and PC2 node

2. **Check Server Logs**
   - PC2 node has detailed logging
   - Look for `✅` (success) and `⚠️` (warning) markers
   - `⚠️ No clients connected` is the key problem

3. **Test Incrementally**
   - Fix connection first
   - Then fix event delivery
   - Then fix app icons
   - Then verify file opening

4. **Socket.io Debugging**
   - Enable Socket.io debug: `DEBUG=socket.io:* npm start`
   - Check client-side console for Socket.io errors
   - Verify client is using correct Socket.io version

---

## 📞 If You Get Stuck

1. **Read the documentation:**
   - `docs/STRATEGIC_IMPLEMENTATION_PLAN.md`
   - `docs/PC2_NODE_VS_MOCK_SERVER_DEEP_AUDIT.md`

2. **Compare with mock server:**
   - `tools/mock-pc2-server.cjs` - working implementation

3. **Check Socket.io documentation:**
   - Socket.io server configuration
   - Authentication middleware
   - Room management

4. **Test with minimal changes:**
   - Make small, incremental changes
   - Test after each change
   - Revert if something breaks

---

## 🚀 Next Steps After Fixes

Once WebSocket is working:
1. Test with remote connections (not just localhost)
2. Verify all features work identically to mock server
3. Test with multiple users/sessions
4. Performance testing
5. Security audit

---

**Good luck! The user needs this working for a showcase tonight, so prioritize the WebSocket connection and event delivery fixes first.**
