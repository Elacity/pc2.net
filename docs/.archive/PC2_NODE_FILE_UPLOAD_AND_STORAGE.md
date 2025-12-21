# PC2 Node: File Upload & Storage Architecture

**Date:** 2025-12-17  
**Purpose:** Explain how file uploads work and where files are stored

---

## 📤 File Upload Flow

### How Files Are Uploaded

1. **User Action**: Drag & drop file or upload via UI
2. **Frontend**: Puter SDK calls `fs.upload()` or sends to `/batch` endpoint
3. **Server**: Receives file via `POST /batch` with `multipart/form-data`
4. **Multer Middleware**: Parses multipart form, extracts file buffer
5. **Batch Handler**: `handleBatch()` in `src/api/info.ts`
   - Extracts file from `req.files` (multer format)
   - Determines destination path
   - Calls `filesystem.writeFile()`
6. **Filesystem Manager**: `src/storage/filesystem.ts`
   - Normalizes path
   - Ensures parent directory exists
   - Calls `ipfs.storeFile()` with file content
7. **IPFS Storage**: `src/storage/ipfs.ts`
   - Converts content to `Uint8Array`
   - Adds to IPFS using Helia's UnixFS: `fs.addBytes(data)`
   - Returns CID (Content ID)
   - Pins file to prevent garbage collection
8. **Database**: Stores metadata in SQLite
   - Path, wallet address, IPFS CID, size, mime_type
   - Links user-friendly path to IPFS CID

### Storage Location

**Files ARE stored in your IPFS node**, not just on the server filesystem:

- **IPFS Node**: Local Helia IPFS node running in the same process
- **IPFS Repo**: `data/ipfs/` directory (blocks, datastore)
- **Database**: `data/pc2.db` (SQLite) stores metadata + IPFS CID
- **Pinning**: Files are pinned to prevent garbage collection

**Verification**: Check server logs when uploading:
```
[Filesystem] Storing file in IPFS: /path/to/file (size: 12345 bytes)
[Filesystem] File stored in IPFS: /path/to/file -> CID: QmXXXX...
```

---

## 📥 File Read Flow (Playback)

### How Files Are Retrieved

1. **User Action**: Opens file (double-click, open in app)
2. **Frontend**: Calls `/open_item` → Gets app URL + signed file URL
3. **App (Player/Viewer)**: Requests file via signed URL
4. **Server**: `GET /read?file=/path/to/file`
5. **Read Handler**: `handleRead()` in `src/api/filesystem.ts`
   - Authenticates request
   - Calls `filesystem.readFile()`
6. **Filesystem Manager**: 
   - Gets file metadata from database (includes IPFS CID)
   - Calls `ipfs.getFile(CID)` to retrieve from IPFS
   - Returns file content as Buffer
7. **Response**: 
   - Binary files (video/image/audio): Sent as Buffer with CORS headers
   - Text files: Sent as UTF-8 string
   - Content-Type header set from metadata

### Why Playback Might Not Work

**Recent Fix**: Binary file handling was fixed - videos/images now sent correctly.

**Possible Issues**:
1. **IPFS Not Initialized**: Check server logs for `✅ Helia IPFS node initialized`
2. **File Not in IPFS**: Check if upload actually stored file (look for CID in logs)
3. **CORS Issues**: Fixed - CORS headers now added for binary files
4. **App SDK URL**: Fixed - SDK URL injection for all apps
5. **File Path Issues**: `/null` paths handled, but verify correct path

**Debug Steps**:
1. Check server logs when uploading - should see IPFS CID
2. Check server logs when opening - should see file retrieval
3. Check browser console for CORS errors
4. Verify file exists in database: `SELECT * FROM files WHERE path = '/your/file/path'`

---

## 🏗️ Architecture Clarification: "HTTP Server Layer"

### What "Layer 2: HTTP Server" Means

**IMPORTANT**: The "HTTP Server" is NOT a separate external service. It's just Express.js running **inside the same Node.js process** as everything else.

### The Complete Picture

```
┌─────────────────────────────────────────────────────────┐
│         Single Node.js Process (PC2 Node)               │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Express HTTP Server (Layer 2)                   │  │
│  │  - This is just Express.js framework              │  │
│  │  - Handles HTTP requests/responses                │  │
│  │  - Routes requests to API handlers               │  │
│  │  - Serves static files                           │  │
│  │  - ALL INTERNAL - no external service            │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Socket.io WebSocket (Layer 5)                   │  │
│  │  - Same process, different protocol              │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Storage Layer (Layer 4)                         │  │
│  │  - SQLite Database                                │  │
│  │  - IPFS Node (Helia)                             │  │
│  │  - ALL LOCAL - no external storage               │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         ▲
         │ Browser connects to localhost:4202
         │
┌────────┴────────┐
│  Your Browser   │
│  (localhost)    │
└─────────────────┘
```

### Why Express.js?

Express.js is just a **framework** for handling HTTP requests. It's like:
- **Express = The plumbing** (routes, middleware, request/response handling)
- **Your code = The logic** (API handlers, file operations)

Everything runs in **one process**:
- One Node.js process
- One port (4202)
- All internal communication
- No external services
- 100% self-contained

### Is It Important?

**Yes, but not as a separate service** - it's important because:
1. **Request Routing**: Routes HTTP requests to correct handlers
2. **Middleware**: Handles authentication, CORS, body parsing
3. **Static Serving**: Serves frontend files and apps
4. **WebSocket Upgrade**: Socket.io uses HTTP server for WebSocket upgrade

But it's all **internal** - there's no separate HTTP server process. It's just how Express organizes code.

---

## 🔍 Verifying File Storage

### Check If IPFS Is Working

**Server Startup Logs**:
```
✅ Helia IPFS node initialized
   Node ID: 12D3KooW...
   Addresses: 2 configured
```

**File Upload Logs** (should appear when uploading):
```
[Filesystem] Storing file in IPFS: /wallet/Desktop/video.mp4 (size: 1234567 bytes)
[Filesystem] File stored in IPFS: /wallet/Desktop/video.mp4 -> CID: QmXXXX...
```

**File Read Logs** (should appear when opening):
```
[Filesystem] Retrieving file from IPFS: /wallet/Desktop/video.mp4 (CID: QmXXXX...)
[Filesystem] File retrieved from IPFS: /wallet/Desktop/video.mp4 (size: 1234567 bytes)
```

### Check Database

```sql
-- Connect to SQLite database
sqlite3 data/pc2.db

-- List all files
SELECT path, wallet_address, ipfs_hash, size, mime_type FROM files;

-- Check specific file
SELECT * FROM files WHERE path LIKE '%video%';
```

### Check IPFS Repo

```bash
# Check IPFS blocks directory
ls -lh data/ipfs/blocks/

# Should see block files (these are your files stored in IPFS)
```

---

## 🎬 Video Playback Flow

### Complete Flow for Video Playback

1. **User**: Double-clicks video file
2. **Frontend**: Calls `POST /open_item` with file path/UID
3. **Server**: `handleOpenItem()` determines app = "player"
4. **Response**: Returns app URL + signed file URL
   ```json
   {
     "suggested_apps": [{
       "uid": "app-11edfba2...",
       "name": "player",
       "index_url": "http://localhost:4202/apps/player/index.html"
     }],
     "signature": {
       "read_url": "http://localhost:4202/read?file=/wallet/Desktop/video.mp4"
     }
   }
   ```
5. **Frontend**: Opens player app in iframe with signed URL
6. **Player App**: Requests video from `read_url`
7. **Server**: `GET /read?file=/wallet/Desktop/video.mp4`
   - Authenticates (via token in URL or header)
   - Gets file metadata from database (includes IPFS CID)
   - Retrieves file from IPFS: `ipfs.getFile(CID)`
   - Returns binary content with:
     - `Content-Type: video/mp4`
     - `Access-Control-Allow-Origin: *` (CORS)
     - `Accept-Ranges: bytes` (for seeking)
8. **Player**: HTML5 `<video>` element loads and plays file

### Why Playback Might Fail

1. **IPFS Not Initialized**: Server logs show `❌ Failed to initialize IPFS`
   - **Fix**: Check IPFS repo path, ports not in use
2. **File Not in IPFS**: Upload failed silently
   - **Fix**: Check upload logs for IPFS CID
3. **CORS Error**: Browser blocks cross-origin request
   - **Fix**: ✅ Already fixed - CORS headers added
4. **Binary Corruption**: File sent as UTF-8 string
   - **Fix**: ✅ Already fixed - binary files sent as Buffer
5. **Authentication**: Token missing or invalid
   - **Fix**: Check token in URL params or Authorization header
6. **File Not Found**: Path incorrect or file doesn't exist
   - **Fix**: Check database for file metadata

---

## 📊 Storage Architecture Summary

### Where Files Are Stored

| Component | Location | Purpose |
|-----------|----------|---------|
| **File Content** | IPFS Node (`data/ipfs/blocks/`) | Actual file bytes, content-addressed by CID |
| **File Metadata** | SQLite (`data/pc2.db`) | Path, size, mime_type, IPFS CID, timestamps |
| **Sessions** | SQLite (`data/pc2.db`) | Authentication tokens, wallet addresses |
| **Users** | SQLite (`data/pc2.db`) | Wallet addresses, smart accounts |

### File Lifecycle

1. **Upload**: File → IPFS → CID → Database (metadata + CID)
2. **Read**: Path → Database (get CID) → IPFS (get content) → Response
3. **Delete**: Path → Database (get CID) → IPFS (unpin) → Database (delete metadata)

### IPFS Node Details

- **Type**: Helia (modern IPFS implementation)
- **Repo**: `data/ipfs/` (local directory)
- **Pinning**: Files are pinned to prevent garbage collection
- **Network**: Can connect to IPFS network (optional), but works standalone
- **Storage**: Files stored in `data/ipfs/blocks/` as content-addressed blocks

---

## ✅ Verification Checklist

### Upload Verification
- [ ] Server logs show `✅ Helia IPFS node initialized` on startup
- [ ] Upload logs show `[Filesystem] Storing file in IPFS` with size
- [ ] Upload logs show `[Filesystem] File stored in IPFS` with CID
- [ ] Database has file entry with `ipfs_hash` (CID)
- [ ] IPFS blocks directory has new files

### Playback Verification
- [ ] File opens in player/viewer app
- [ ] Server logs show `[Filesystem] Retrieving file from IPFS` with CID
- [ ] Server logs show `[Filesystem] File retrieved from IPFS` with size
- [ ] Browser network tab shows `200 OK` for `/read` request
- [ ] Video/image plays correctly
- [ ] No CORS errors in browser console

---

## 🚨 Common Issues

### Issue: "IPFS is not available"
**Cause**: IPFS node failed to initialize  
**Check**: Server startup logs for IPFS initialization errors  
**Fix**: Check IPFS repo path, ports not in use, dependencies installed

### Issue: Files upload but can't be read
**Cause**: File stored but CID not in database, or IPFS retrieval failing  
**Check**: Database has `ipfs_hash` for file, IPFS node still running  
**Fix**: Verify IPFS node is running, check database integrity

### Issue: Video won't play
**Cause**: Binary corruption (fixed), CORS (fixed), or authentication  
**Check**: Browser console for errors, server logs for file retrieval  
**Fix**: Verify CORS headers, binary handling, authentication token

---

**Test Command:**
```bash
cd /Users/mtk/Documents/Cursor/pc2.net/pc2-node/test-fresh-install && PORT=4202 npm run dev
```

**Check IPFS Status:**
```bash
# Check health endpoint
curl http://localhost:4202/health

# Should show: "ipfs": "available"
```
