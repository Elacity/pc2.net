# PC2 Node vs Mock Server - Deep Audit

**Date**: 2025-12-17  
**Status**: CRITICAL - User needs to showcase tonight  
**Goal**: PC2 node must have EXACT same UX as mock server

## Executive Summary

The mock server (`tools/mock-pc2-server.cjs`) works perfectly. The PC2 node should replicate its behavior exactly. Key differences identified:

1. **Event System**: Mock server uses HTTP polling with event queue, PC2 node uses Socket.io WebSocket
2. **File Opening**: App URLs differ (subdomain vs path-based)
3. **App Icons**: Mock server returns base64 SVG, PC2 node returns undefined
4. **Drag & Drop**: Frontend issue, but may be related to event system

## Critical Issues

### 1. Event System Architecture Mismatch

**Mock Server**:
- Uses custom HTTP polling endpoint (`/socket.io/`)
- Events queued in `pendingEvents` array
- Events returned in polling response as Socket.io Engine.IO packets
- Format: `42["item.added",{...}]` or `42["item.removed",{...}]`

**PC2 Node**:
- Uses Socket.io WebSocket server
- Events broadcast via `io.to(room).emit()`
- Clients disconnect immediately, so events not received
- **FIX**: Added event queue, but need to hook into Socket.io polling

### 2. File Opening (`/open_item`)

**Mock Server**:
- Returns app URLs like: `http://viewer.localhost:4200/index.html`
- Uses subdomain-based routing

**PC2 Node**:
- Returns app URLs like: `http://localhost:4202/apps/viewer/index.html`
- Uses path-based routing
- **STATUS**: Should work if apps are served correctly

### 3. App Icons (`/get-launch-apps`)

**Mock Server**:
- Returns base64-encoded SVG icons: `data:image/svg+xml;base64,...`
- All apps have icons

**PC2 Node**:
- Returns `undefined` for most icons
- Only editor has icon path
- **FIX NEEDED**: Return base64 SVG icons matching mock server

### 4. Drag & Drop in Explorer Windows

**Mock Server**:
- Works in all explorer windows
- Files appear immediately after drop

**PC2 Node**:
- Only works on desktop
- Files don't appear in explorer windows
- **ROOT CAUSE**: Likely frontend issue, but events not being received

## Implementation Plan

### Phase 1: Fix Event System (CRITICAL)

1. ✅ Added `pendingEvents` queue (DONE)
2. ✅ Modified `broadcastItemAdded` and `broadcastItemRemoved` to queue events (DONE)
3. ✅ Added event delivery on connect/reconnect (DONE)
4. ⚠️ **MISSING**: Hook into Socket.io polling to return queued events

**Problem**: Socket.io handles polling internally. We can't easily intercept it to return queued events like the mock server does.

**Solution**: Use Socket.io's built-in event queuing. When clients connect/reconnect, deliver queued events immediately (already implemented). But we also need to ensure clients stay connected.

### Phase 2: Fix File Opening

1. Verify apps are served at `/apps/*` paths
2. Ensure `/open_item` returns correct app URLs
3. Test file opening in player/viewer

### Phase 3: Fix App Icons

1. Update `/get-launch-apps` to return base64 SVG icons
2. Match mock server's icon format exactly

### Phase 4: Fix Drag & Drop

1. Verify frontend enables droppable on explorer windows
2. Ensure events are received when files are dropped

## Next Steps

1. **IMMEDIATE**: Fix Socket.io client connection issue (clients disconnecting)
2. **IMMEDIATE**: Verify apps are served correctly
3. **IMMEDIATE**: Update `/get-launch-apps` to return base64 icons
4. **FOLLOW-UP**: Test drag & drop in explorer windows

## Files to Modify

1. `pc2-node/src/websocket/server.ts` - Fix client connection/disconnection
2. `pc2-node/src/api/info.ts` - Add base64 icons to `/get-launch-apps`
3. `pc2-node/src/api/other.ts` - Verify `/open_item` returns correct URLs
4. `pc2-node/src/static.ts` - Verify apps are served correctly
