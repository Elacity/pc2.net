# PC2 Node Trash & App Launching Audit

**Date:** 2025-01-11  
**Issues:** 
1. Right-click delete doesn't move files to Trash (permanently deletes)
2. Can't open files in player/viewer

---

## 🔴 Issue #1: Delete to Trash

### Mock Server Behavior
- **Right-click delete** → Moves file to `/{wallet}/Trash/` directory
- **Delete from Trash** → Permanently deletes
- Stores `original_name`, `original_path`, `trashed_ts` metadata for restore
- Emits `item.removed` from original location
- Emits `item.added` to Trash location

### PC2 Node Current Behavior
- **Right-click delete** → Permanently deletes file (calls `filesystem.deleteFile()`)
- No Trash directory handling
- No restore functionality

### Required Changes
1. Update `handleDelete()` to check if file is in Trash
2. If NOT in Trash → Move to Trash (not delete)
3. If IN Trash → Permanently delete
4. Store restore metadata (`original_name`, `original_path`, `trashed_ts`)
5. Emit correct socket events (`item.removed` from source, `item.added` to Trash)

---

## 🔴 Issue #2: App Launching (Player/Viewer)

### Mock Server Behavior
- Apps served from subdomains: `viewer.localhost:4200`, `player.localhost:4200`
- `/drivers/call` returns `index_url: http://viewer.localhost:4200/index.html`
- Frontend opens apps in subdomain windows

### PC2 Node Current Behavior
- Apps served from `/apps/viewer/index.html` (not subdomains)
- `/drivers/call` returns `index_url: http://localhost:4202/apps/viewer/index.html`
- Frontend might not be able to open apps correctly

### Required Changes
1. Check if PC2 node serves apps from subdomains OR `/apps/` paths
2. If subdomains needed → Configure subdomain routing
3. If `/apps/` paths work → Verify frontend can open them
4. Ensure `/drivers/call` returns correct `index_url` format

---

## 📋 Implementation Plan

### Fix #1: Trash Functionality

**File:** `pc2-node/src/api/filesystem.ts` - `handleDelete()`

**Changes:**
1. Check if file path contains `/Trash/`
2. If NOT in Trash:
   - Get user's Trash directory path: `/${wallet}/Trash`
   - Ensure Trash directory exists
   - Move file to Trash (using `moveFile()`)
   - Store restore metadata in database
   - Emit `item.removed` from original location
   - Emit `item.added` to Trash location
3. If IN Trash:
   - Permanently delete (current behavior)

**Database Schema:**
- Add `original_name`, `original_path`, `trashed_ts` fields to FileMetadata
- Or store in separate TrashMetadata table

### Fix #2: App Launching

**File:** `pc2-node/src/api/other.ts` - `handleDriversCall()`

**Changes:**
1. Check how apps are served (subdomains vs `/apps/` paths)
2. Update `index_url` format to match serving method
3. Test file opening in player/viewer

**Alternative:**
- If subdomains required, configure Express to handle subdomain routing
- Or verify `/apps/` paths work with frontend

---

## 🎯 Success Criteria

### Trash Functionality
- [ ] Right-click delete → File moves to Trash (not permanently deleted)
- [ ] File appears in Trash directory
- [ ] File shows original name in Trash
- [ ] Delete from Trash → Permanently deletes
- [ ] Restore functionality works (if implemented)

### App Launching
- [ ] Double-click image → Opens in viewer
- [ ] Double-click video → Opens in player
- [ ] Double-click PDF → Opens in PDF viewer
- [ ] Apps load correctly in their windows

---

**Status:** 🔴 **CRITICAL** - Blocks core UX features  
**Priority:** **P0** - Must fix immediately
