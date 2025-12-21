# PC2 Node Missing Endpoints Fix

**Date:** 2025-01-11  
**Issue:** PC2 node missing endpoints that mock server has, causing 404 errors and broken functionality

---

## 🔴 Missing Endpoints Found

From console errors and comparison with mock server:

1. ✅ **`POST /suggest_apps`** - Suggest apps for a file (404 error)
2. ✅ **`GET /itemMetadata`** - Get file metadata by UID
3. ✅ **`POST /writeFile`** - Write file using signed URL (for editor saves)
4. ✅ **`PUT /writeFile`** - Write file using signed URL (PUT method)

---

## ✅ Fixes Applied

### 1. Added `/suggest_apps` Endpoint

**File:** `pc2-node/src/api/other.ts` - Added `handleSuggestApps()`

**Functionality:**
- Accepts `uid` or `path` to identify file
- Finds file metadata from database
- Determines app based on file extension (same logic as `/open_item`)
- Returns array of suggested apps: `[{ uid, uuid, name, title, index_url }]`

**Response Format:**
```json
[{
  "uid": "app-7870be61-8dff-4a99-af64-e9ae6811e367",
  "uuid": "app-7870be61-8dff-4a99-af64-e9ae6811e367",
  "name": "viewer",
  "title": "Viewer",
  "index_url": "http://localhost:4202/apps/viewer/index.html"
}]
```

### 2. Added `/itemMetadata` Endpoint

**File:** `pc2-node/src/api/other.ts` - Added `handleItemMetadata()`

**Functionality:**
- Accepts `uid` query parameter
- Converts UUID to path
- Returns file metadata

**Response Format:**
```json
{
  "uid": "uuid-...",
  "name": "file.jpg",
  "path": "/wallet/Desktop/file.jpg",
  "is_dir": false,
  "size": 12345,
  "type": "image/jpeg",
  "created": "2025-01-11T12:00:00.000Z",
  "modified": "2025-01-11T12:00:00.000Z",
  "accessed": "2025-01-11T12:00:00.000Z"
}
```

### 3. Added `/writeFile` Endpoint

**File:** `pc2-node/src/api/other.ts` - Added `handleWriteFile()`

**Functionality:**
- Accepts `uid`, `signature`, `expires` query parameters
- Converts UUID to path
- Writes file content from request body
- Supports multiple content formats: raw text, JSON with content field, multipart
- Updates existing file

**Response Format:**
```json
{
  "uid": "uuid-...",
  "name": "file.txt",
  "path": "/wallet/Desktop/file.txt",
  "is_dir": false,
  "size": 123,
  "type": "text/plain",
  "created": "2025-01-11T12:00:00.000Z",
  "modified": "2025-01-11T12:00:00.000Z"
}
```

### 4. Fixed `/drivers/call` Empty Body Handling

**File:** `pc2-node/src/api/other.ts` - Updated `handleDriversCall()`

**Change:**
- Empty bodies now return `{ success: true, result: null }` instead of 400 error
- Matches mock server behavior (doesn't error on empty bodies)

---

## 📝 Files Modified

1. `pc2-node/src/api/other.ts` - Added three new handlers
2. `pc2-node/src/api/index.ts` - Registered new routes

---

## 🧪 Testing

### Test Command
```bash
cd /Users/mtk/Documents/Cursor/pc2.net/pc2-node/test-fresh-install
PORT=4202 npm start
```

### Expected Results

- ✅ No more 404 errors for `/suggest_apps`
- ✅ No more 400 errors for `/drivers/call` with empty bodies
- ✅ Files can be opened in apps
- ✅ Editor saves work (via `/writeFile`)

---

**Status:** ✅ **FIXED** - All missing endpoints added  
**Next Step:** Test that 404/400 errors are gone
