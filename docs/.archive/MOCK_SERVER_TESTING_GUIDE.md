# Mock Server Testing Guide
**Date**: 2025-01-09  
**Purpose**: Step-by-step guide to test all mock server functionality

---

## 🚀 Prerequisites

### 1. Verify Servers Are Running

**Mock PC2 Server** (Port 4200):
```bash
# Check if running
ps aux | grep mock-pc2-server | grep -v grep

# If not running, start it:
cd /Users/mtk/Documents/Cursor/pc2.net
node tools/mock-pc2-server.cjs

# Test health endpoint:
curl http://127.0.0.1:4200/api/health
# Should return: {"status":"ok","node_name":"My Local PC2 (Mock)","node_status":"ACTIVE"}
```

**Frontend** (Port 4100):
```bash
# Check if running
ps aux | grep -E "(vite|4100)" | grep -v grep

# If not running, start it:
cd /Users/mtk/Documents/Cursor/pc2.net/src/gui
npm run dev

# Or if already built:
npm run build
# Then access: http://puter.localhost:4100
```

### 2. Get Setup Token

When you start the mock server, it will print a setup token in the console:
```
🔐 Setup Token: PC2-SETUP-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Save this token** - you'll need it to connect.

---

## 📋 Testing Checklist

### Phase 1: Authentication & Connection

#### Test 1.1: Initial Connection
1. Open browser to `http://puter.localhost:4100`
2. Connect wallet (MetaMask)
3. Click cloud icon in toolbar
4. Click "Connect to PC2"
5. Enter PC2 URL: `http://127.0.0.1:4200` (or `http://puter.localhost:4200`)
6. Enter setup token (from server console)
7. Sign message in MetaMask
8. **Expected**: Should connect successfully, status bar shows "Connected"

**Check in browser console:**
```javascript
// Should see:
[PC2]: 🚀 All API calls redirected to your Personal Cloud!
```

**Check in server console:**
```
✅ Node claimed by wallet: 0x...
🔐 Session created: xxxxxxxx...
```

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 1.2: Session Persistence
1. After successful connection (Test 1.1)
2. Refresh the page (Cmd+R / Ctrl+R)
3. **Expected**: Should auto-reconnect without requiring new signature

**Check in browser console:**
```javascript
// Should see auto-reconnect message
[PC2]: Auto-reconnecting to PC2 node...
```

**Check localStorage:**
```javascript
localStorage.getItem('pc2_session')
// Should return session token
```

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 1.3: Multiple Wallets
1. Connect with Wallet A (complete Test 1.1)
2. Upload a file (see Test 2.1)
3. Disconnect wallet
4. Connect with Wallet B (different address)
5. **Expected**: Should show different files (empty or different set)

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

### Phase 2: File Operations

#### Test 2.1: Upload Single File
1. After connecting (Test 1.1)
2. Drag & drop a small image file (e.g., PNG, JPG) onto desktop background
3. **Expected**: 
   - File appears as icon on desktop
   - File appears in Desktop folder window
   - No errors in console

**Check server console:**
```
📤 BATCH UPLOAD to: /0x.../Desktop
✅ File node created: name=image.png, size=...
📡 Emitting item.added event
```

**Check browser console:**
```javascript
// Should see:
[refresh_item_container] readdir returned X entries
```

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 2.2: Upload Multiple Files
1. Select 3-5 files (mix of images, PDFs, text files)
2. Drag & drop all at once onto desktop
3. **Expected**: All files should appear on desktop

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 2.3: Create Folder
1. Right-click on desktop background
2. Select "New Folder"
3. Enter folder name (e.g., "Test Folder")
4. **Expected**: Folder appears on desktop and in Desktop window

**Check server console:**
```
📁 MKDIR: /0x.../Desktop/Test Folder
```

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 2.4: Upload to Folder
1. Create a folder (Test 2.3)
2. Open folder (double-click)
3. Drag & drop file into folder window
4. **Expected**: File appears in folder, not on desktop

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 2.5: Download File
1. Right-click on a file on desktop
2. Select "Download" (or similar option)
3. **Expected**: File downloads to Downloads folder

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 2.6: Delete File
1. Right-click on a file
2. Select "Delete" or "Move to Trash"
3. **Expected**: File disappears from desktop

**Check server console:**
```
🗑️  DELETE: /0x.../Desktop/file.txt
```

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 2.7: Move/Rename File
1. Drag file from Desktop to a folder
2. **Expected**: File moves to folder
3. OR: Right-click → Rename
4. **Expected**: File name changes

**Check server console:**
```
🔄 MOVE: /0x.../Desktop/file.txt → /0x.../Desktop/folder/file.txt
```

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 2.8: File Types
Test uploading different file types:
- [ ] Image (PNG, JPG, GIF)
- [ ] Video (MP4, MOV)
- [ ] PDF
- [ ] Text file (.txt, .md)
- [ ] Binary file (e.g., .zip)

**Expected**: All file types should upload and display correctly

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

### Phase 3: App Launching

#### Test 3.1: Terminal Launch
1. Click terminal icon in taskbar (bottom of screen)
2. **Expected**: Terminal window opens

**Check server console:**
```
📱 GET LAUNCH APPS
```

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 3.2: Editor Launch
1. Click editor icon in taskbar
2. **Expected**: Editor window opens

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 3.3: File Explorer Launch
1. Click folder icon in taskbar
2. **Expected**: File explorer window opens

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 3.4: Open Files in Apps
1. Double-click an image file
   - **Expected**: Opens in Viewer app
2. Double-click a video file
   - **Expected**: Opens in Player app
3. Double-click a PDF file
   - **Expected**: Opens in PDF viewer app
4. Double-click a text file
   - **Expected**: Opens in Editor app

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

### Phase 4: Real-time Updates

#### Test 4.1: Multi-tab Sync
1. Open browser tab A: `http://puter.localhost:4100`
2. Connect to PC2 (Test 1.1)
3. Open browser tab B: `http://puter.localhost:4100` (same wallet)
4. In Tab A: Upload a file
5. **Expected**: File should appear in Tab B without refresh

**Check server console:**
```
📡 Emitting item.added event
```

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 4.2: Delete Sync
1. With 2 tabs open (Test 4.1)
2. In Tab A: Delete a file
3. **Expected**: File disappears in Tab B

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 4.3: Move Sync
1. With 2 tabs open (Test 4.1)
2. In Tab A: Move file to folder
3. **Expected**: File moves in Tab B

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

### Phase 5: Edge Cases

#### Test 5.1: Large Files
1. Upload a file > 100MB (if available)
2. **Expected**: Should upload successfully

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 5.2: Many Files
1. Upload 50+ files at once
2. **Expected**: All files should appear

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 5.3: Special Characters
1. Create file/folder with name: `test!@#$%^&*().txt`
2. **Expected**: Should work correctly

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 5.4: Long Paths
1. Create deeply nested folders: `a/b/c/d/e/f/g/`
2. Upload file to deepest folder
3. **Expected**: Should work correctly

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 5.5: Duplicate Names
1. Upload file: `test.txt`
2. Upload same file again: `test.txt`
3. **Expected**: Second file should be named `test (1).txt`

**Check server console:**
```
📝 File "test.txt" already exists, using: "test (1).txt"
```

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 5.6: Server Restart Persistence
1. Upload some files
2. Stop mock server (Ctrl+C)
3. Restart mock server: `node tools/mock-pc2-server.cjs`
4. Refresh browser
5. **Expected**: Files should still be there

**Check server console:**
```
📁 Loaded persisted state from /tmp/pc2-mock-state.json
```

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

### Phase 6: UI/UX Verification

#### Test 6.1: Taskbar Icons
- [ ] Terminal icon visible and clickable
- [ ] Editor icon visible and clickable
- [ ] File Explorer icon visible and clickable
- [ ] PC2 status icon (cloud) visible

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 6.2: Context Menus
1. Right-click on desktop
2. **Expected**: Context menu appears with options (New Folder, etc.)
3. Right-click on file
4. **Expected**: Context menu appears with options (Delete, Rename, etc.)

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 6.3: Drag & Drop
1. Drag file from Desktop to folder
2. **Expected**: File moves to folder

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 6.4: Loading States
1. Upload a large file
2. **Expected**: Loading indicator appears during upload

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 6.5: Error Messages
1. Try to connect with invalid setup token
2. **Expected**: Clear error message displayed

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

#### Test 6.6: PC2 Status Indicator
1. Check cloud icon in toolbar
2. **Expected**: Shows "Connected" when connected, "Disconnected" when not

**Result**: [ ] Pass [ ] Fail [ ] Blocked  
**Notes**: 

---

## 🐛 Issues Found

### Critical Issues
_None yet_

### Medium Issues
_None yet_

### Minor Issues
_None yet_

---

## 📊 Test Summary

- **Total Tests**: 0 / 33
- **Passed**: 0
- **Failed**: 0
- **Pending**: 33
- **Blocked**: 0

---

## 📝 Testing Notes

### Server Logs Location
- Mock server logs: Console output
- State file: `/tmp/pc2-mock-state.json`

### Browser Console Commands
```javascript
// Check PC2 connection
window.api_origin  // Should show PC2 URL

// Check session
localStorage.getItem('pc2_session')

// Check wallet
walletService?.getEOAAddress()
```

### Common Issues & Solutions

**Issue**: Files not appearing on desktop
- **Solution**: Check server logs for `🔵 READDIR HANDLER CALLED`
- **Solution**: Verify Desktop uses `consistency: 'strong'` in `refresh_item_container.js`

**Issue**: Socket.io errors in console
- **Note**: Mixed content warnings (HTTPS → HTTP) are cosmetic only
- **Solution**: Use HTTPS for PC2 node in production

**Issue**: Session not persisting
- **Solution**: Check `localStorage.getItem('pc2_session')`
- **Solution**: Verify server state file exists

---

**Last Updated**: 2025-01-09

