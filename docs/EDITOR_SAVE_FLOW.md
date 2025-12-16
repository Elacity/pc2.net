# Editor Save Flow for .txt Files

## Overview
This document explains the complete flow when saving a .txt file via the Editor application.

## Save Flow Diagram

```
User clicks "Save" in Editor
    ↓
Editor.js: save_file() function
    ↓
curfile.write(editor.getValue())
    ↓
Puter SDK: File.write() method
    ↓
┌─────────────────────────────────┐
│  First Save (New File)          │
└─────────────────────────────────┘
    ↓
1. puter.ui.showSaveFilePicker()
   - Shows file dialog
   - User selects location/filename
   - Returns file object with signatures
    ↓
2. puter.fs.sign() - Get write signature
   - POST /sign
   - Returns writeURL, readURL, metadataURL
    ↓
3. puter.fs.write() - Create file
   - POST /write
   - Body: { path, content, name, type: 'text/plain' }
   - Server creates file and returns file entry
    ↓
4. File object stored in curfile
   - Contains writeURL for subsequent saves
    ↓
┌─────────────────────────────────┐
│  Subsequent Saves (Existing)    │
└─────────────────────────────────┘
    ↓
1. curfile.write(content)
   - Uses writeURL from file signature
    ↓
2. PUT /writeFile?uid=...&signature=...&expires=...
   - Body: Plain text content
   - Server updates existing file
    ↓
3. File content persisted ✅
```

## Detailed Steps

### Step 1: User Initiates Save

**Location**: `src/backend/apps/editor/js/editor.js` (minified)

```javascript
async function save_file(callback) {
    puter.ui.setWindowTitle(curfile.name);
    await curfile.write(editor.getValue());  // ← Main save call
    unsavedChanges = false;
    $("#dropdown-item-save").addClass("dropdown-item-disabled");
    puter.ui.setWindowTitle(curfile.name);
    callback && typeof callback === 'function' && callback(curfile);
}
```

**What happens**:
- If `curfile` exists → Direct save using `curfile.write()`
- If `curfile` doesn't exist → Opens `showSaveFilePicker()` first

### Step 2: First Save - File Creation

**Location**: `src/gui/src/IPC.js` (line 1425-1488)

**Flow**:
1. **File Dialog** (`showSaveFilePicker`):
   - User selects save location
   - Default filename: "Untitled.txt" (or current filename)
   - Extension patching: `.txt` is ensured (line 120-133 in editor/index.html)

2. **File Signing** (`puter.fs.sign`):
   ```javascript
   let file_signature = await puter.fs.sign(app_uuid, { uid: res.uid, action: 'write' });
   ```
   - **Endpoint**: `POST /sign`
   - **Returns**: `writeURL`, `readURL`, `metadataURL`
   - **Format**: `/writeFile?uid=...&expires=...&signature=...`

3. **File Creation** (`puter.fs.write`):
   ```javascript
   const res = await puter.fs.write(target_path, file_to_upload, {
       dedupeName: false,
       overwrite: overwrite,
   });
   ```
   - **Endpoint**: `POST /write`
   - **Body**: 
     ```json
     {
       "path": "/path/to/file.txt",
       "content": "file content here",
       "name": "file.txt",
       "type": "text/plain"
     }
   ```
   - **Server Handler**: `tools/mock-pc2-server.cjs` line 2952
   - **Response**: File entry with `uid`, `path`, `size`, etc.

4. **File Object Creation**:
   - Editor receives file object with `writeURL`
   - Stored in `curfile` variable
   - `writeURL` format: `http://127.0.0.1:4200/writeFile?uid=uuid-...&expires=...&signature=...`

### Step 3: Subsequent Saves - File Updates

**Location**: Puter SDK's File.write() method

**Flow**:
1. **Direct Write**:
   ```javascript
   await curfile.write(editor.getValue());
   ```
   - Uses `writeURL` from file signature
   - No need to call `showSaveFilePicker` again

2. **HTTP Request**:
   - **Method**: `PUT` (or `POST` as fallback)
   - **URL**: `writeURL` from Step 2
   - **Body**: Plain text content (editor content)
   - **Content-Type**: `text/plain` (or empty)

3. **Server Handler**:
   - **Endpoint**: `PUT /writeFile?uid=...&signature=...`
   - **Location**: `tools/mock-pc2-server.cjs` line 6234
   - **Process**:
     - Extracts `uid` from query params
     - Finds file by UID in filesystem
     - Reads content from request body (plain text)
     - Updates file content in memory
     - Updates `modified` timestamp
     - Saves state to disk
   - **Response**: `{ success: true, uid: ..., size: ... }`

## Server Endpoints Used

### 1. POST /write (First Save)
- **Handler**: Line 2952 in `mock-pc2-server.cjs`
- **Purpose**: Create new file
- **Input**: JSON with `path`, `content`, `name`, `type`
- **Output**: File entry object

### 2. POST /sign (Get Write Signature)
- **Handler**: Line 6447 in `mock-pc2-server.cjs`
- **Purpose**: Generate signed URLs for file access
- **Input**: `{ items: [{ uid: ..., action: 'write' }] }`
- **Output**: `{ items: [{ write_url: '...', read_url: '...', ... }] }`

### 3. PUT /writeFile (Subsequent Saves) **[FIXED]**
- **Handler**: Line 6234 in `mock-pc2-server.cjs`
- **Purpose**: Update existing file via signed URL
- **Input**: Plain text in request body
- **Query Params**: `uid`, `expires`, `signature`
- **Output**: `{ success: true, uid: ..., size: ... }`

## File Format Handling

### .txt Files
- **MIME Type**: `text/plain`
- **Content**: Stored as UTF-8 string (not base64)
- **Encoding**: Plain text, no encoding needed
- **Extension**: Automatically added if missing (see `editor/index.html` line 120-133)

### Content Processing
1. **Editor**: `editor.getValue()` returns plain text string
2. **SDK**: Converts to File object or Blob
3. **Server**: Receives as plain text in request body
4. **Storage**: Stored as `node.content` (string) in filesystem

## State Persistence

### Server Side
- **Location**: `/var/folders/.../pc2-mock-state.json`
- **Format**: JSON with filesystem tree
- **Updated**: After every write operation
- **Fields**: `content`, `size`, `modified`, `uuid`

### Client Side
- **File Object**: Stored in `curfile` variable
- **Write URL**: Cached in file object
- **Unsaved Changes**: Tracked via `unsavedChanges` flag

## Error Handling

### First Save Errors
- **File exists**: Shows overwrite confirmation dialog
- **Permission denied**: Shows error alert
- **Network error**: Shows error alert, file not saved

### Subsequent Save Errors
- **Invalid signature**: 401 Unauthorized
- **File not found**: 404 Not Found
- **Network error**: Save fails, user sees error

## Recent Fixes

### Issue: Subsequent Saves Not Persisting
**Problem**: PUT requests to `/writeFile` were not handled
**Solution**: Added PUT method support to `/writeFile` endpoint
**Location**: `mock-pc2-server.cjs` line 6234
**Status**: ✅ Fixed

### Issue: Body Content Not Extracted
**Problem**: PUT request body (plain text) wasn't being read correctly
**Solution**: Added bodyBuffer parsing for PUT requests
**Location**: `mock-pc2-server.cjs` line 6278-6286
**Status**: ✅ Fixed

## Testing Checklist

- [ ] First save creates new file
- [ ] Subsequent saves update existing file
- [ ] File content persists after server restart
- [ ] .txt extension is automatically added
- [ ] File appears in file browser after save
- [ ] Unsaved changes flag is cleared after save
- [ ] Save button is disabled after successful save

## Debugging

### Check Server Logs
```bash
tail -f /tmp/mock-server.log | grep -E "WRITEFILE|WRITE|sign"
```

### Expected Log Output
```
💾 WRITEFILE: uid=uuid-..., method=PUT, bodyLength=123
   📝 PUT request: Using bodyBuffer as plain text: 123 chars
   ✅ File updated: filename.txt (123 bytes)
```

### Check Network Tab
- First save: `POST /write` → `POST /sign`
- Subsequent saves: `PUT /writeFile?uid=...&signature=...`

## Related Files

- `src/backend/apps/editor/js/editor.js` - Editor save logic
- `src/gui/src/IPC.js` - IPC handlers for file operations
- `tools/mock-pc2-server.cjs` - Server endpoints
- `src/backend/apps/editor/index.html` - Extension patching


