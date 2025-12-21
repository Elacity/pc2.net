# PC2 Node WebSocket Events Audit

**Date:** 2025-01-11  
**Issue:** Files don't appear after upload, no live updates, can't open files in players  
**Root Cause:** PC2 node emits wrong WebSocket event names that frontend doesn't listen to

---

## 🔴 Critical Issue: Event Name Mismatch

### Frontend Listens For:
- `item.added` - When files are uploaded/created
- `item.removed` - When files are deleted  
- `item.updated` - When files are updated
- `item.moved` - When files are moved
- `item.renamed` - When files are renamed ✅ (this one works)

### PC2 Node Currently Emits:
- `file:changed` with action 'created' ❌ (frontend doesn't listen)
- `file:changed` with action 'deleted' ❌ (frontend doesn't listen)
- `file:changed` with action 'moved' ❌ (frontend doesn't listen)
- `item.renamed` ✅ (this one works)

**Result:** Frontend never receives notifications, so UI doesn't update. Users must refresh page to see uploaded files.

---

## 📋 Required Event Formats

### `item.added` Event (File Upload/Creation)
**Required Fields:**
- `uid` - File UUID (format: `uuid-${path.replace(/\//g, '-')}`)
- `uuid` - Same as uid
- `name` - File name
- `path` - Full file path
- `dirpath` - **CRITICAL** - Parent directory path (frontend uses this to find where to add the item)
- `size` - File size in bytes
- `type` - MIME type
- `mime_type` - Same as type
- `is_dir` - false for files
- `created` - ISO timestamp
- `modified` - ISO timestamp
- `original_client_socket_id` - null or socket ID (to prevent duplicate updates)
- `thumbnail` - Optional thumbnail URL

**Example from Mock Server:**
```javascript
{
  uid: "uuid-/wallet/Desktop/image.jpg",
  uuid: "uuid-/wallet/Desktop/image.jpg",
  name: "image.jpg",
  path: "/wallet/Desktop/image.jpg",
  dirpath: "/wallet/Desktop",  // ← CRITICAL: Frontend uses this!
  size: 12345,
  type: "image/jpeg",
  mime_type: "image/jpeg",
  is_dir: false,
  created: "2025-01-11T12:00:00.000Z",
  modified: "2025-01-11T12:00:00.000Z",
  original_client_socket_id: null,
  thumbnail: "data:image/png;base64,..."
}
```

### `item.removed` Event (File Deletion)
**Required Fields:**
- `path` - File path
- `uid` - File UUID
- `original_client_socket_id` - null or socket ID

### `item.moved` Event (File Move)
**Required Fields:**
- `uid` - File UUID
- `path` - New path
- `old_path` - Old path
- `name` - File name
- `metadata` - File metadata object
- `original_client_socket_id` - null or socket ID

### `item.updated` Event (File Update)
**Required Fields:**
- `uid` - File UUID
- `name` - File name
- `path` - File path
- `old_path` - Previous path (if renamed)
- `size` - File size
- `modified` - ISO timestamp
- `original_client_socket_id` - null or socket ID

---

## 🔧 Files That Need Fixing

### 1. `pc2-node/src/websocket/events.ts`
**Current:** Only has `broadcastFileChange`, `broadcastDirectoryChange`, `broadcastItemRenamed`  
**Needed:** Add functions for `item.added`, `item.removed`, `item.moved`, `item.updated`

### 2. `pc2-node/src/api/info.ts` (handleBatch)
**Current:** Emits `file:changed` with action 'created'  
**Needed:** Emit `item.added` with correct format including `dirpath`

### 3. `pc2-node/src/api/filesystem.ts` (handleDelete)
**Current:** Emits `file:changed` with action 'deleted'  
**Needed:** Emit `item.removed` with correct format

### 4. `pc2-node/src/api/filesystem.ts` (handleMove)
**Current:** Emits `file:changed` with action 'moved'  
**Needed:** Emit `item.moved` with correct format

### 5. `pc2-node/src/api/filesystem.ts` (handleWrite)
**Current:** Emits `file:changed` with action 'updated'  
**Needed:** Emit `item.updated` with correct format

---

## ✅ Mock Server Reference

The mock server correctly implements all these events:
- Line 5005: `emitSocketEvent('item.added', socketEventData, walletAddress)`
- Line 3717-3724: `emitSocketEvent('item.renamed', response, session.wallet)`
- Line 3500-3507: `emitSocketEvent('item.removed', ...)`
- Line 3600-3607: `emitSocketEvent('item.moved', ...)`

**Key Difference:** Mock server uses `emitSocketEvent()` helper that formats events correctly and includes `dirpath`.

---

## 🎯 Fix Strategy

1. **Add new broadcast functions** to `websocket/events.ts`:
   - `broadcastItemAdded()`
   - `broadcastItemRemoved()`
   - `broadcastItemMoved()`
   - `broadcastItemUpdated()`

2. **Update all API handlers** to use correct event names:
   - `handleBatch` → `item.added`
   - `handleDelete` → `item.removed`
   - `handleMove` → `item.moved`
   - `handleWrite` → `item.updated`

3. **Ensure all events include `dirpath`** - Frontend requires this to know which directory to update

4. **Test with frontend** - Verify files appear immediately after upload without refresh

---

## 🚨 Why This Happened

The PC2 node was built with a generic `file:changed` event system, but the frontend expects Puter-specific event names (`item.added`, `item.removed`, etc.). The mock server correctly implements Puter's event format, but this wasn't ported to the PC2 node.

---

## 📝 Testing Checklist

After fixes:
- [ ] Upload image → Appears immediately (no refresh)
- [ ] Upload video → Appears immediately (no refresh)
- [ ] Upload PDF → Appears immediately (no refresh)
- [ ] Delete file → Disappears immediately (no refresh)
- [ ] Move file → Updates immediately (no refresh)
- [ ] Rename file → Updates immediately (no refresh)
- [ ] Open file in player → Works (file accessible)
- [ ] Multiple tabs → All update in real-time

---

**Status:** 🔴 **CRITICAL** - Blocks all file operations UX  
**Priority:** **P0** - Must fix immediately
