# PC2 Node vs Mock Server - Comprehensive Functionality Audit

**Date:** 2025-01-11  
**Purpose:** Ensure PC2 node has 100% feature parity with mock server

---

## 🎯 Core Principle

**PC2 node MUST behave EXACTLY like the mock server in all user-facing functionality.**

---

## 📋 Comprehensive Feature Checklist

### ✅ Authentication & Session Management

- [ ] **Particle Auth Integration**
  - [ ] User can authenticate with wallet
  - [ ] Session created in database
  - [ ] Session token returned correctly
  - [ ] User home directory created on first auth
  - [ ] Standard directories created (Desktop, Documents, Public, Pictures, Videos, Trash)

- [ ] **Session Persistence**
  - [ ] Session survives page refresh
  - [ ] Token stored in localStorage
  - [ ] Auto-reconnect on refresh
  - [ ] Session expiration handled correctly

- [ ] **User Isolation**
  - [ ] Each wallet gets isolated filesystem
  - [ ] Files stored per `wallet_address`
  - [ ] No cross-user data access

**Mock Server:** ✅ All working  
**PC2 Node:** ⚠️ **Status:** Desktop loads, but need to verify all auth flows

---

### ✅ File Operations

#### **File Upload**
- [ ] **Drag & Drop**
  - [ ] Can drag files from OS to desktop
  - [ ] Can drag files from OS to folder windows
  - [ ] Upload progress shown
  - [ ] Files appear immediately after upload (no refresh needed)
  - [ ] Multiple files upload correctly

- [ ] **File Select Dialog**
  - [ ] Can select files via file picker
  - [ ] Multiple file selection works
  - [ ] Files upload correctly

- [ ] **Upload to Specific Location**
  - [ ] Can upload to Desktop
  - [ ] Can upload to any folder
  - [ ] Can upload to Public folder
  - [ ] Path resolution correct

**Mock Server:** ✅ All working  
**PC2 Node:** ❌ **ISSUE:** Drag & drop not working, files not appearing after upload

#### **File Display**
- [ ] **File Listing**
  - [ ] Files show in desktop
  - [ ] Files show in folder windows
  - [ ] Correct icons for file types
  - [ ] File names display correctly
  - [ ] File sizes shown (if applicable)

- [ ] **Real-time Updates**
  - [ ] New files appear immediately (WebSocket)
  - [ ] Deleted files disappear immediately
  - [ ] Renamed files update immediately
  - [ ] Moved files update in both locations

**Mock Server:** ✅ All working  
**PC2 Node:** ❌ **ISSUE:** Files not appearing after upload, need refresh

#### **File Opening**
- [ ] **Open in Player**
  - [ ] Video files open in player
  - [ ] Audio files open in player
  - [ ] Player loads correctly
  - [ ] Playback works

- [ ] **Open in Viewer**
  - [ ] Image files open in viewer
  - [ ] PDF files open in viewer
  - [ ] Viewer loads correctly

- [ ] **Open in Editor**
  - [ ] Text files open in editor
  - [ ] Code files open in editor
  - [ ] Editor loads correctly
  - [ ] Can save changes

- [ ] **App Selection**
  - [ ] Correct app suggested for file type
  - [ ] `/suggest_apps` endpoint works
  - [ ] `/open_item` endpoint works
  - [ ] Signed URLs generated correctly

**Mock Server:** ✅ All working  
**PC2 Node:** ❌ **ISSUE:** Cannot open files in player/viewer

#### **File Deletion**
- [ ] **Single File Delete**
  - [ ] Right-click → Delete works
  - [ ] File moves to Trash (not permanent delete)
  - [ ] File disappears from view immediately
  - [ ] WebSocket event `item.removed` emitted

- [ ] **Multiple File Delete**
  - [ ] Select multiple files
  - [ ] Right-click → Delete works
  - [ ] All files move to Trash
  - [ ] All files disappear immediately

- [ ] **Trash Functionality**
  - [ ] Deleted files appear in `/Trash` folder
  - [ ] Can restore from Trash
  - [ ] Can permanently delete from Trash
  - [ ] Trash icon shows on desktop

**Mock Server:** ✅ All working  
**PC2 Node:** ❌ **ISSUE:** Right-click delete on single file not working

#### **File Movement**
- [ ] **Drag & Drop Move**
  - [ ] Can drag file to folder
  - [ ] File moves to destination
  - [ ] File disappears from source
  - [ ] WebSocket event `item.moved` emitted

- [ ] **Cut & Paste**
  - [ ] Cut file (Ctrl+X or right-click)
  - [ ] Paste to destination (Ctrl+V or right-click)
  - [ ] File moves correctly

**Mock Server:** ✅ All working  
**PC2 Node:** ❌ **ISSUE:** Drag & drop not working

#### **File Renaming**
- [ ] **Rename Operation**
  - [ ] Right-click → Rename works
  - [ ] F2 key works
  - [ ] Name updates immediately
  - [ ] WebSocket event `item.renamed` emitted

**Mock Server:** ✅ All working  
**PC2 Node:** ⚠️ **Status:** Need to verify

---

### ✅ Folder Operations

#### **Folder Creation**
- [ ] **Create Folder**
  - [ ] Right-click → New Folder works
  - [ ] Folder appears immediately
  - [ ] Can name folder
  - [ ] WebSocket event `item.added` emitted

- [ ] **Folder Display**
  - [ ] Folders show correct icon
  - [ ] No "shared" icon overlay (unless actually shared)
  - [ ] Folder names display correctly

**Mock Server:** ✅ All working  
**PC2 Node:** ❌ **ISSUE:** Folders showing "shared" icon when not shared

#### **Folder Navigation**
- [ ] **Open Folder**
  - [ ] Double-click opens folder
  - [ ] Folder window opens
  - [ ] Contents display correctly
  - [ ] Breadcrumb navigation works

- [ ] **Folder Window**
  - [ ] Can navigate into subfolders
  - [ ] Can navigate back
  - [ ] Can navigate up
  - [ ] Path displayed correctly

**Mock Server:** ✅ All working  
**PC2 Node:** ⚠️ **Status:** Navigation works, but folder icons wrong

---

### ✅ WebSocket Events

#### **Event Emission**
- [ ] **item.added**
  - [ ] Emitted when file uploaded
  - [ ] Emitted when folder created
  - [ ] Contains correct `dirpath` field
  - [ ] Frontend receives and updates UI

- [ ] **item.removed**
  - [ ] Emitted when file deleted
  - [ ] Emitted when folder deleted
  - [ ] Frontend receives and updates UI

- [ ] **item.moved**
  - [ ] Emitted when file moved
  - [ ] Contains correct source and destination
  - [ ] Frontend receives and updates UI

- [ ] **item.renamed**
  - [ ] Emitted when file/folder renamed
  - [ ] Contains old and new names
  - [ ] Frontend receives and updates UI

- [ ] **item.updated**
  - [ ] Emitted when file modified
  - [ ] Emitted when metadata changes
  - [ ] Frontend receives and updates UI

**Mock Server:** ✅ All working  
**PC2 Node:** ⚠️ **Status:** Events implemented, need to verify all scenarios

---

### ✅ API Endpoints

#### **Core Endpoints**
- [ ] `/whoami` - Returns user info
- [ ] `/readdir` - Lists directory contents
- [ ] `/stat` - Gets file/folder metadata
- [ ] `/read` - Reads file content
- [ ] `/write` - Writes file content
- [ ] `/mkdir` - Creates directory
- [ ] `/delete` - Deletes file/folder (moves to Trash)
- [ ] `/move` - Moves/renames file/folder
- [ ] `/batch` - Batch operations

#### **App Launching**
- [ ] `/open_item` - Returns signed URL for app
- [ ] `/suggest_apps` - Suggests app for file type
- [ ] `/itemMetadata` - Gets file metadata for apps

#### **Other Endpoints**
- [ ] `/version` - Returns version info
- [ ] `/cache/last-change-timestamp` - Cache timestamp
- [ ] `/drivers/call` - Driver operations
- [ ] `/df` - Disk space info
- [ ] `/get-launch-apps` - Available apps

**Mock Server:** ✅ All working  
**PC2 Node:** ⚠️ **Status:** Most endpoints exist, need to verify all work correctly

---

## 🔍 Console Error Analysis

### Current Errors in PC2 Node

1. **`Cannot read properties of undefined (reading 'wait_for_init')`**
   - **Location:** `bundle.min.js:2:954115`
   - **Cause:** SDK initialization issue
   - **Impact:** May affect some SDK features
   - **Status:** ⚠️ Non-critical, but should fix

2. **`Cannot read properties of null (reading 'filter')`**
   - **Location:** `v2:4:128630` and `v2:4:134048`
   - **Cause:** SDK expecting data that's null
   - **Impact:** May affect file listing/operations
   - **Status:** ❌ **CRITICAL** - Likely causing file display issues

3. **`404 (Not Found)` Errors**
   - `/read?file=~/.__puter_gui.json` - Expected (file may not exist)
   - `/read?file=/0x.../Public/.profile` - Expected (file may not exist)
   - `ui-icons_444444_256x240.png` - Missing asset
   - **Status:** ⚠️ Some expected, some need fixing

4. **`400 (Bad Request)` Errors**
   - `/mkdir` - Request format issue
   - **Status:** ❌ **CRITICAL** - Folder creation may fail

5. **`401 (Unauthorized)` Errors**
   - `/drivers/call` - Authentication issue
   - **Status:** ⚠️ May affect some features

6. **WebSocket Connection Issues**
   - `WebSocket connection to 'ws://localhost:4202/socket.io/...' failed: WebSocket is closed before the connection is established`
   - **Status:** ❌ **CRITICAL** - Real-time updates may not work

---

## 🐛 Identified Issues

### Issue #1: Drag & Drop Not Working
**Symptoms:**
- Cannot drag files from OS to desktop
- Cannot drag files to folder windows
- No visual feedback when dragging

**Root Cause:** Need to check:
- Drop event handlers registered
- `ui-droppable` class applied
- File upload endpoint receiving requests

**Fix Required:**
- Verify drag & drop event handlers in frontend
- Check `/batch` endpoint for file uploads
- Verify WebSocket events emitted after upload

---

### Issue #2: Files Not Appearing After Upload
**Symptoms:**
- Files upload successfully
- Files don't appear in UI until page refresh
- WebSocket events may not be emitted

**Root Cause:** 
- WebSocket `item.added` event not emitted
- Frontend not listening for events
- Event data format incorrect

**Fix Required:**
- Verify `broadcastItemAdded()` called after upload
- Check event data format matches frontend expectations
- Verify WebSocket connection active

---

### Issue #3: Cannot Open Files in Player/Viewer
**Symptoms:**
- Right-click → Open doesn't work
- Double-click doesn't open files
- No app launches

**Root Cause:**
- `/open_item` endpoint may not be working
- `/suggest_apps` may return wrong app
- Signed URL generation may fail

**Fix Required:**
- Verify `/open_item` endpoint implementation
- Check `/suggest_apps` logic
- Verify app serving works

---

### Issue #4: Right-Click Delete Not Working (Single File)
**Symptoms:**
- Right-click on single file → nothing happens
- Multiple file delete works
- Delete endpoint may not receive request

**Root Cause:**
- Frontend may not be sending delete request for single file
- Request format may be incorrect
- Endpoint may not handle single file delete

**Fix Required:**
- Check frontend `window.delete_item` implementation
- Verify request format matches backend expectations
- Check `/delete` endpoint handles all formats

---

### Issue #5: Folders Show "Shared" Icon
**Symptoms:**
- All folders show shared icon overlay
- Folders are not actually shared
- Icon overlay incorrect

**Root Cause:**
- File metadata may have `is_public` or `is_shared` flag set incorrectly
- Frontend may be checking wrong metadata field
- Default folder creation may set wrong flags

**Fix Required:**
- Check folder creation sets correct metadata
- Verify `is_public` flag only set for `/Public` folder
- Check frontend icon logic

---

### Issue #6: WebSocket Connection Issues
**Symptoms:**
- WebSocket connections fail
- Real-time updates not working
- Connection closes before established

**Root Cause:**
- Socket.io server may not be configured correctly
- CORS issues with WebSocket
- Connection handshake failing

**Fix Required:**
- Verify Socket.io server setup
- Check CORS configuration
- Verify WebSocket upgrade works

---

## ✅ Action Items

### Priority 1: Critical Functionality
1. [ ] Fix drag & drop file upload
2. [ ] Fix files not appearing after upload (WebSocket events)
3. [ ] Fix right-click delete on single file
4. [ ] Fix WebSocket connection issues
5. [ ] Fix file opening in player/viewer

### Priority 2: UI Issues
6. [ ] Fix folder "shared" icon overlay
7. [ ] Fix missing assets (ui-icons PNG)
8. [ ] Fix `/mkdir` 400 error

### Priority 3: Error Resolution
9. [ ] Fix `Cannot read properties of null (reading 'filter')` error
10. [ ] Fix `Cannot read properties of undefined (reading 'wait_for_init')` error
11. [ ] Fix `/drivers/call` 401 errors

---

## 🧪 Testing Checklist

### Test Each Feature Against Mock Server

1. **File Upload**
   - [ ] Drag file to desktop → appears immediately
   - [ ] Drag file to folder → appears immediately
   - [ ] Select files → upload → appear immediately
   - [ ] Upload multiple files → all appear

2. **File Operations**
   - [ ] Right-click single file → Delete → moves to Trash
   - [ ] Right-click multiple files → Delete → all move to Trash
   - [ ] Drag file to folder → file moves
   - [ ] Right-click → Rename → name updates
   - [ ] Double-click file → opens in correct app

3. **Folder Operations**
   - [ ] Right-click → New Folder → folder appears
   - [ ] Folder shows correct icon (no shared overlay)
   - [ ] Double-click folder → opens correctly
   - [ ] Navigate into subfolders → works

4. **Real-time Updates**
   - [ ] Upload file → appears without refresh
   - [ ] Delete file → disappears without refresh
   - [ ] Move file → updates in both locations
   - [ ] Rename file → updates without refresh

---

## 📊 Comparison Matrix

| Feature | Mock Server | PC2 Node | Status |
|---------|------------|----------|--------|
| Authentication | ✅ | ✅ | Working |
| File Upload (Drag & Drop) | ✅ | ❌ | **BROKEN** |
| File Upload (Select) | ✅ | ⚠️ | Partial |
| Files Appear After Upload | ✅ | ❌ | **BROKEN** |
| Open in Player | ✅ | ❌ | **BROKEN** |
| Open in Viewer | ✅ | ❌ | **BROKEN** |
| Open in Editor | ✅ | ⚠️ | Need Test |
| Right-Click Delete (Single) | ✅ | ❌ | **BROKEN** |
| Right-Click Delete (Multiple) | ✅ | ⚠️ | Need Test |
| Move to Trash | ✅ | ⚠️ | Need Test |
| Drag & Drop Move | ✅ | ❌ | **BROKEN** |
| Folder Creation | ✅ | ⚠️ | Icon Issue |
| Folder Icons | ✅ | ❌ | **BROKEN** |
| WebSocket Events | ✅ | ⚠️ | Partial |
| Real-time Updates | ✅ | ❌ | **BROKEN** |

---

**Next Steps:**
1. Fix Priority 1 issues (drag & drop, file display, delete, WebSocket)
2. Test each feature against mock server
3. Verify 100% parity
4. Document any differences
