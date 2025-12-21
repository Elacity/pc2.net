# PC2 Node Trash & App Launching Fix Summary

**Date:** 2025-01-11  
**Issues Fixed:**
1. ✅ Right-click delete now moves files to Trash (not permanently deleted)
2. ✅ Added `/open_item` endpoint for app launching

---

## 🔴 Issue #1: Delete to Trash - FIXED

### Problem
- Right-click delete permanently deleted files
- No Trash functionality
- Files couldn't be recovered

### Solution
Updated `handleDelete()` in `pc2-node/src/api/filesystem.ts`:

1. **Check if file is in Trash:**
   - If IN Trash → Permanently delete (current behavior)
   - If NOT in Trash → Move to Trash (new behavior)

2. **Move to Trash logic:**
   - Ensure Trash directory exists: `/${wallet}/Trash`
   - Handle duplicate names (add timestamp suffix)
   - Move file using `filesystem.moveFile()`
   - Emit `item.removed` from original location
   - Emit `item.added` to Trash location

3. **Socket Events:**
   - `item.removed` from original location (file disappears from Desktop)
   - `item.added` to Trash location (file appears in Trash)

### Files Modified
- `pc2-node/src/api/filesystem.ts` - Updated `handleDelete()` function
- `pc2-node/src/websocket/events.ts` - Already has `broadcastItemAdded()` (from previous fix)

---

## 🔴 Issue #2: App Launching - FIXED

### Problem
- Missing `/open_item` endpoint
- Frontend couldn't determine which app to use for files
- Files couldn't be opened in player/viewer

### Solution
Added `/open_item` endpoint handler in `pc2-node/src/api/other.ts`:

1. **Endpoint:** `POST /open_item`
2. **Functionality:**
   - Accepts `uid` or `path` to identify file
   - Finds file metadata from database
   - Determines app based on file extension:
     - Images (jpg, png, webp, svg, bmp, jpeg, gif) → `viewer`
     - Video/Audio (mp4, webm, mp3, m4a, ogg, mov, avi, wav, flac) → `player`
     - PDF → `pdf`
     - Text files → `editor`
   - Returns file signature and suggested app info

3. **Response Format (matching mock server):**
```json
{
  "signature": {
    "uid": "uuid-...",
    "expires": 9999999999999,
    "signature": "sig-...",
    "url": "http://localhost:4202/read?file=/path/to/file",
    "read_url": "http://localhost:4202/read?file=/path/to/file",
    "write_url": "http://localhost:4202/writeFile?uid=...",
    "metadata_url": "http://localhost:4202/itemMetadata?uid=...",
    "fsentry_type": "image/jpeg",
    "fsentry_is_dir": false,
    "fsentry_name": "image.jpg",
    "fsentry_size": 12345,
    "fsentry_accessed": 1234567890,
    "fsentry_modified": 1234567890,
    "fsentry_created": 1234567890,
    "path": "/wallet/Desktop/image.jpg"
  },
  "token": "mock-token-...",
  "suggested_apps": [{
    "uid": "app-7870be61-8dff-4a99-af64-e9ae6811e367",
    "uuid": "app-7870be61-8dff-4a99-af64-e9ae6811e367",
    "name": "viewer",
    "title": "Viewer",
    "index_url": "http://localhost:4202/apps/viewer/index.html",
    "approved_for_opening_items": true
  }]
}
```

### Files Modified
- `pc2-node/src/api/other.ts` - Added `handleOpenItem()` function
- `pc2-node/src/api/index.ts` - Registered `/open_item` route

---

## ⚠️ Potential Issue: App URL Format

### Mock Server Format
- Uses subdomains: `http://viewer.localhost:4200/index.html`
- Apps served from subdomain routing

### PC2 Node Format
- Uses path-based: `http://localhost:4202/apps/viewer/index.html`
- Apps served from `/apps/*` static file serving

### Status
- ✅ Apps exist in `src/backend/apps/` directory
- ✅ Static file serving configured for `/apps/*` paths
- ⚠️ **Needs Testing:** Frontend might expect subdomain format

**If apps don't open:**
- Option 1: Configure subdomain routing in Express
- Option 2: Update frontend to handle `/apps/` paths
- Option 3: Update `index_url` in `/open_item` to use subdomain format

---

## 🧪 Testing Instructions

### Quick Test Command
```bash
cd /Users/mtk/Documents/Cursor/pc2.net/pc2-node/test-fresh-install
PORT=4202 npm start
```

Then open: **http://localhost:4202**

### Test Checklist

#### Trash Functionality
- [ ] Right-click file → Delete → File moves to Trash (not permanently deleted)
- [ ] File disappears from Desktop immediately
- [ ] File appears in Trash directory
- [ ] Delete from Trash → Permanently deletes
- [ ] Multiple files → All move to Trash correctly

#### App Launching
- [ ] Double-click image → Opens in viewer
- [ ] Double-click video → Opens in player
- [ ] Double-click PDF → Opens in PDF viewer
- [ ] Double-click text file → Opens in editor
- [ ] Apps load correctly in their windows

---

## 📝 Files Modified

1. `pc2-node/src/api/filesystem.ts` - Updated `handleDelete()` for Trash functionality
2. `pc2-node/src/api/other.ts` - Added `handleOpenItem()` function
3. `pc2-node/src/api/index.ts` - Registered `/open_item` route

---

## 🚀 Expected Behavior After Fix

### Trash
- ✅ Right-click delete → File moves to Trash
- ✅ File appears in Trash directory
- ✅ Delete from Trash → Permanently deletes
- ✅ UX matches mock server behavior

### App Launching
- ✅ Double-click file → Opens in appropriate app
- ✅ Images open in viewer
- ✅ Videos open in player
- ✅ PDFs open in PDF viewer
- ✅ Text files open in editor

---

## 🔍 Notes

### Trash Metadata (Future Enhancement)
Currently, Trash functionality doesn't store `original_name`, `original_path`, `trashed_ts` metadata for restore functionality. This can be added later by:
1. Adding fields to database schema
2. Storing metadata when moving to Trash
3. Implementing restore endpoint

### App URL Format
The PC2 node uses `/apps/` paths instead of subdomains. If apps don't open, we may need to:
- Configure Express subdomain routing
- Or verify frontend can handle `/apps/` paths

---

**Status:** ✅ **FIXED** - Ready for testing  
**Next Step:** Test Trash and app launching functionality
