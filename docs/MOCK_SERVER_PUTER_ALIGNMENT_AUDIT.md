# Mock Server Puter Alignment Audit

**Date**: 2025-01-10  
**Purpose**: Audit all file operations in `tools/mock-pc2-server.cjs` to ensure response formats match Puter's backend implementation

---

## ✅ Completed Alignments

### 1. **MOVE** (`/move`) ✅ FIXED
- **Status**: ✅ Aligned
- **Puter Format**: `{ moved: <file entry>, old_path: <string>, overwritten: <entry|undefined>, parent_dirs_created: [] }`
- **Our Format**: Now matches Puter's format
- **File**: `tools/mock-pc2-server.cjs` (lines ~1900-1953)
- **Notes**: Fixed to return `{ moved: <entry>, old_path: <string> }` instead of direct entry

### 2. **MKDIR** (`/mkdir`) ✅ FIXED
- **Status**: ✅ Aligned
- **Puter Format**: Entry object with `parent_dirs_created` array and `requested_path`
- **Our Format**: Now includes `parent_dirs_created: []` and `requested_path: <string>`
- **File**: `tools/mock-pc2-server.cjs` (lines ~1542-1600)
- **Notes**: Added tracking of created parent directories and original requested path

### 3. **COPY** (`/copy`) ✅ IMPLEMENTED
- **Status**: ✅ Implemented
- **Puter Format**: `[{ copied: <file entry>, overwritten: <entry|undefined> }]` (array with single object)
- **Our Format**: Now matches Puter's format
- **File**: `tools/mock-pc2-server.cjs` (lines ~1960-2100)
- **Notes**: 
  - Implements deep copy for directories
  - Handles overwrite and dedupe_name options
  - Returns array with single object containing `copied` and `overwritten` properties

---

## 🔍 Operations Requiring Audit

### 5. **DELETE** (`/delete`)
- **Status**: ✅ Verified
- **Puter Format**: `{}` (empty object)
- **Our Format**: Returns `{}` ✅
- **File**: `tools/mock-pc2-server.cjs` (lines ~1700-1800)
- **Puter Implementation**: `src/backend/src/routers/filesystem_api/delete.js`
- **Notes**: 
  - Puter returns empty object `{}` on success
  - Socket events: `item.removed` with `{ path, descendants_only }`
  - Our implementation matches Puter's format

### 6. **WRITE** (`/write`, `/up`)
- **Status**: ✅ Verified
- **Puter Format**: Direct file entry object (from `getSafeEntry({ thumbnail: true })`)
- **Our Format**: Returns direct entry object ✅
- **File**: `tools/mock-pc2-server.cjs` (lines ~1475-1540)
- **Puter Implementation**: `src/backend/src/routers/filesystem_api/write.js`
- **Puter Returns**: `await this.written.getSafeEntry({ thumbnail: true })`
- **Notes**: 
  - Puter returns file entry directly (not wrapped)
  - Matches readdir entry format
  - All properties present: id, uid, uuid, name, path, is_dir, size, created, modified, type

### 6. **READDIR** (`/readdir`)
- **Status**: ✅ Likely Correct (works in practice)
- **Puter Format**: Array of file entry objects
- **Our Format**: Array of file entry objects ✅
- **File**: `tools/mock-pc2-server.cjs` (lines ~1387-1473)
- **Puter Implementation**: `src/backend/src/routers/filesystem_api/readdir.js`
- **Notes**: 
  - This works correctly in practice
  - Entry format: `{ id, uid, uuid, name, path, is_dir, is_empty, size, created, modified, type }`
  - Use this as the reference format for all entry objects

### 7. **STAT** (`/stat`)
- **Status**: ⚠️ Needs Review
- **Puter Format**: Single file entry object (from `getSafeEntry()`)
- **Our Format**: ❓ Check implementation
- **File**: `tools/mock-pc2-server.cjs` - Find location
- **Puter Implementation**: `src/backend/src/routers/filesystem_api/stat.js`
- **Notes**: Should return same format as readdir entry

### 8. **READ** (`/read`)
- **Status**: ⚠️ Needs Review
- **Puter Format**: File content (binary/stream)
- **Our Format**: ❓ Check implementation
- **File**: `tools/mock-pc2-server.cjs` - Find location
- **Puter Implementation**: `src/backend/src/routers/filesystem_api/read.js`
- **Notes**: Returns file content, not JSON

### 9. **RENAME** (`/rename`)
- **Status**: ⚠️ Needs Review
- **Puter Format**: ❓ Check if this is separate from move
- **Our Format**: ❓ Check if implemented
- **File**: `tools/mock-pc2-server.cjs` - Find location
- **Puter Implementation**: `src/backend/src/routers/filesystem_api/rename.js`
- **Notes**: May be same as move with `new_name` parameter

### 10. **SEARCH** (`/search`)
- **Status**: ⚠️ Needs Review
- **Puter Format**: ❓ Check implementation
- **Our Format**: ❓ Check if implemented
- **File**: `tools/mock-pc2-server.cjs` - Find location
- **Puter Implementation**: `src/backend/src/routers/filesystem_api/search.js`
- **Notes**: May not be critical for mock server

### 11. **TOUCH** (`/touch`)
- **Status**: ⚠️ Needs Review
- **Puter Format**: ❓ Check implementation
- **Our Format**: ❓ Check if implemented
- **File**: `tools/mock-pc2-server.cjs` - Find location
- **Puter Implementation**: `src/backend/src/routers/filesystem_api/touch.js`
- **Notes**: Creates empty file or updates timestamp

### 12. **UPDATE** (`/update`)
- **Status**: ⚠️ Needs Review
- **Puter Format**: ❓ Check implementation
- **Our Format**: ❓ Check if implemented
- **File**: `tools/mock-pc2-server.cjs` - Find location
- **Puter Implementation**: `src/backend/src/routers/filesystem_api/update.js`
- **Notes**: Updates file metadata

---

## 📋 Standard Entry Format (Reference)

All file/directory entries should match this format (from readdir):

```javascript
{
    id: <number>,
    uid: <string>,           // UUID
    uuid: <string>,          // UUID (same as uid)
    name: <string>,
    path: <string>,
    is_dir: <boolean>,
    is_empty: <boolean>,     // Only for directories
    size: <number>,
    created: <ISO string>,
    modified: <ISO string>,
    type: <string|null>      // MIME type for files, null for directories
}
```

---

## 🔧 Response Format Patterns

### Pattern 1: Direct Entry (write, mkdir, stat)
```javascript
// Returns file/directory entry directly
{ id, uid, uuid, name, path, is_dir, ... }
```

### Pattern 2: Wrapped Entry (move, copy)
```javascript
// Move returns:
{ moved: <entry>, old_path: <string>, overwritten: <entry|undefined>, parent_dirs_created: [] }

// Copy returns (in array):
[{ copied: <entry>, overwritten: <entry|undefined> }]
```

### Pattern 3: Empty Success (delete)
```javascript
// Returns empty object
{}
```

### Pattern 4: Array of Entries (readdir)
```javascript
// Returns array of entries
[{ id, uid, ... }, { id, uid, ... }, ...]
```

---

## ✅ Action Items

1. **Verify DELETE response** - Currently returns `{}` ✅ (matches Puter)
2. **Implement COPY endpoint** - Missing, needs implementation
3. **Verify WRITE response** - Check matches Puter's entry format
4. **Verify MKDIR response** - Check matches Puter's entry format
5. **Verify STAT response** - Check implementation and format
6. **Verify READ response** - Check returns binary content correctly
7. **Check RENAME** - Verify if separate endpoint or part of move
8. **Optional: SEARCH, TOUCH, UPDATE** - Lower priority for mock server

---

## 📝 Notes

- **Socket Events**: All operations should emit appropriate socket events:
  - `item.added` - When item is created/moved/copied
  - `item.removed` - When item is deleted/moved
  - `item.updated` - When item metadata changes

- **Error Format**: Puter uses `APIError.create()` which returns:
  ```javascript
  { code: <string>, message: <string>, ... }
  ```

- **getSafeEntry()**: Puter's method that returns entry in standard format. Our entries should match this format.

---

## 🎯 Priority Order

1. **HIGH**: COPY (missing, commonly used)
2. **MEDIUM**: WRITE, MKDIR, DELETE (verify format)
3. **MEDIUM**: STAT, READ (verify implementation)
4. **LOW**: RENAME, SEARCH, TOUCH, UPDATE (may not be critical)

---

*Last Updated: 2025-01-10*

