# Current Issues and Solutions

## ✅ Fixed Issues

### 1. Terminal App Not Found
**Problem**: `[launch_app] App "terminal" not found`
**Solution**: Added terminal to all appMaps in `/drivers/call` endpoint
- ✅ Added to `info.ts` app list
- ✅ Added to all 3 appMaps in `other.ts` (`handleDriversCall`)

### 2. WebSocket URL Interception (:443 Port Issue)
**Problem**: URLs like `http://localhost:4202:443` were being created, causing connection failures
**Solution**: Fixed all interceptors to remove `:443` port before replacement
- ✅ WebSocket interceptor (both test-fresh-install and main)
- ✅ XHR interceptor (both test-fresh-install and main)
- ✅ Fetch interceptor (both test-fresh-install and main)

### 3. Stats Showing 0 Files
**Problem**: `/api/stats` always returned `files: 0` even when files existed
**Solution**: Updated `handleStats` to actually count files from database using `db.listFiles('/')`

## 🔄 In Progress Issues

### 1. Drag-and-Drop Only Works on Desktop
**Problem**: Can only drag files onto desktop, not into Documents/Videos/other folders
**Root Cause**: 
- Backend is ready - `/batch` endpoint accepts `path`, `dest_path`, `destination` parameters
- Frontend GUI limitation - only desktop container has `ui-droppable` class
- The bundled GUI code (`bundle.min.js`) controls which containers are droppable

**Backend Status**: ✅ Ready
- Accepts uploads to any path via form data or query params
- Handles `~/`, relative paths, and absolute paths correctly

**Frontend Status**: ⚠️ Limited by GUI bundle
- Desktop: Has `ui-droppable` class → drag-and-drop works
- Folder windows: Don't have `ui-droppable` class → drag-and-drop doesn't work
- This is controlled by the bundled `puter.js` GUI code

**Possible Solutions**:
1. **Frontend Injection**: Inject JavaScript to add `ui-droppable` class to folder window containers
2. **Backend Configuration**: Check if there's a way to configure droppable zones via API
3. **Document Limitation**: Accept that drag-and-drop only works on desktop (use file upload button in folders)

### 2. Files Can't Be Opened in Players/Viewers
**Problem**: Files don't open in appropriate apps (e.g., `.mov` files don't open in player)
**Backend Status**: ✅ Endpoints exist and look correct
- `/open_item` - Returns app info and file signature
- `/suggest_apps` - Returns suggested apps for file
- Both endpoints correctly map file types to apps:
  - Images → viewer
  - Video/Audio → player
  - PDF → pdf
  - Text → editor

**Possible Issues**:
1. Frontend not calling endpoints correctly
2. App URLs incorrect (but they look correct: `/apps/viewer/index.html`)
3. File signature/authentication issue

**Next Steps**:
- Check browser console for errors when double-clicking files
- Verify `/open_item` is being called with correct parameters
- Test endpoint directly with curl

### 3. WebSocket Connection Stability
**Problem**: `WebSocket connection to 'ws://localhost:4202/...' failed: WebSocket is closed before the connection is established`
**Status**: 
- ✅ Fixed URL interception (removed `:443` port issue)
- ⚠️ Connection still failing - may be server-side issue

**Possible Causes**:
1. WebSocket server rejecting connections
2. Authentication issue during handshake
3. CORS or connection timeout

**Next Steps**:
- Check server logs for WebSocket connection attempts
- Verify authentication flow in WebSocket server
- Test WebSocket connection directly

## 📋 Summary

**Backend is ready for:**
- ✅ File uploads to any path (via `/batch` endpoint)
- ✅ File opening (via `/open_item` and `/suggest_apps` endpoints)
- ✅ WebSocket real-time updates (server configured)

**Frontend limitations:**
- ⚠️ Drag-and-drop only enabled on desktop (GUI bundle limitation)
- ⚠️ File opening may not be calling endpoints correctly (needs verification)

**Next Actions:**
1. Test file opening by checking browser console when double-clicking files
2. Consider injecting JavaScript to enable drag-and-drop on folder windows
3. Verify WebSocket connection after URL fix
