# PC2 Node Delete Request Format Fix

**Date:** 2025-01-11  
**Issue:** Can't right-click single file to delete, nothing happens. Multi-select delete also doesn't work.

---

## 🔴 Problem

The PC2 node's delete handler was only checking for:
- `{ path: "..." }` (singular)
- `{ items: [...] }` (Puter SDK format)

But the mock server (and frontend) sends:
- `{ paths: "..." }` or `{ paths: ["...", "..."] }` (plural)

**Result:** Delete requests were being rejected with 400 error, but frontend might not be showing the error.

---

## ✅ Fix Applied

### Updated Request Format Support

The delete handler now supports **all** formats:

1. **`{ paths: "/path/to/file" }`** - Single path as string (mock server format)
2. **`{ paths: ["/path1", "/path2"] }`** - Multiple paths as array (mock server format)
3. **`{ path: "/path/to/file" }`** - Single path (alternative format)
4. **`{ items: [{ path: "..." }] }`** - Puter SDK format
5. **`{ items: [{ uid: "uuid-..." }] }`** - UUID-based format

### UUID Handling

Added robust UUID-to-path conversion:
- Converts `uuid-/path/to/file` → `/path/to/file`
- Handles wallet address in UUID: `uuid-0x...-Desktop-file.jpg`
- Searches all files if direct conversion fails
- Logs conversion process for debugging

### Enhanced Logging

Added comprehensive logging:
- Logs request body keys and format
- Logs UUID conversion process
- Logs each file deletion attempt
- Logs final results (successful/failed counts)

---

## 📝 Files Modified

- `pc2-node/src/api/filesystem.ts` - Updated `handleDelete()` function

---

## 🧪 Testing

### Test Command
```bash
cd /Users/mtk/Documents/Cursor/pc2.net/pc2-node/test-fresh-install
PORT=4202 npm start
```

### Test Scenarios

1. **Single File Delete:**
   - Right-click single file → Delete
   - Should move to Trash immediately
   - Check server logs for request format

2. **Multiple Files Delete:**
   - Select multiple files → Right-click → Delete
   - All should move to Trash immediately

3. **Check Server Logs:**
   - Look for `[Delete] Request received` log
   - Verify request format is being recognized
   - Check for any errors in deletion process

---

## 🔍 Debugging

If delete still doesn't work:

1. **Check server logs** for:
   - `[Delete] Request received` - Shows what format was received
   - `[Delete] Path is UUID` - Shows UUID conversion
   - `[Delete] Moved to Trash` - Confirms successful move
   - Any error messages

2. **Check browser console** for:
   - Network errors (400, 500, etc.)
   - JavaScript errors
   - Failed API requests

3. **Verify request format:**
   - Open browser DevTools → Network tab
   - Right-click file → Delete
   - Check the `/delete` request payload
   - Should see `paths` or `path` or `items` field

---

**Status:** ✅ **FIXED** - Ready for testing  
**Next Step:** Test right-click delete on single file
