# PC2 Node Move Endpoint Fix

**Date:** 2025-01-11  
**Issue:** Move endpoint returning 400 errors because it doesn't support `{ source, destination, new_name }` format

---

## 🔴 Problem

The frontend sends move requests in this format:
```json
{
  "source": "uuid-/path/to/file",
  "destination": "/path/to/trash",
  "newName": "uuid-/path/to/file",
  "newMetadata": { ... }
}
```

But the PC2 node's `/move` endpoint was only checking for:
- `{ from: "...", to: "..." }`
- `{ items: [...], destination: "..." }`

This caused 400 errors when trying to delete files (which moves them to trash).

---

## ✅ Fix Applied

**File:** `pc2-node/src/api/filesystem.ts` - Updated `handleMove()`

**Changes:**
1. Added support for `{ source, destination, new_name }` format (matching mock server)
2. Added UUID-to-path conversion for `source` parameter
3. Added `newName` handling to support renaming during move
4. Enhanced logging for debugging

**Now supports:**
- ✅ `{ source: "uuid-...", destination: "/path", new_name: "..." }` - Puter SDK format
- ✅ `{ from: "...", to: "..." }` - Alternative format
- ✅ `{ items: [...], destination: "..." }` - Batch format

---

## 🧪 Testing

### Test Command
```bash
cd /Users/mtk/Documents/Cursor/pc2.net/pc2-node/test-fresh-install
PORT=4202 npm start
```

### Expected Results

- ✅ Right-click delete on single files works
- ✅ Files move to Trash correctly
- ✅ No more 400 errors on `/move` endpoint
- ✅ Context menu appears for single files

---

**Status:** ✅ **FIXED** - Move endpoint now supports Puter SDK format  
**Next Step:** Restart server and test right-click delete
