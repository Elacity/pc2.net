# Testing File Versioning Feature

## ✅ Implementation Complete

File versioning is now fully implemented with:
- ✅ Automatic version snapshots on file changes
- ✅ Version browser UI in Properties window
- ✅ Restore functionality
- ✅ IPFS-based immutable version storage

---

## 🧪 Direct Testing Instructions

### Step 1: Create a Test File

1. **Open your browser** to `http://localhost:4202`
2. **Create a text file**:
   - Right-click on Desktop or any folder
   - Select "New" → "Text File" (or upload a file)
   - Name it `test-versioning.txt`
   - Add some content: `Version 1 - Initial content`

### Step 2: Edit the File to Create Versions

1. **Open the file** (double-click or right-click → Open)
2. **Edit the content** to `Version 2 - First edit`
3. **Save the file** (Ctrl+S / Cmd+S)
4. **Edit again** to `Version 3 - Second edit`
5. **Save again**

**Expected Result**: Each save creates a new version snapshot automatically.

### Step 3: View Versions

1. **Right-click** on `test-versioning.txt`
2. **Select "Properties"** from the context menu
3. **Click the "Versions" tab** at the top

**Expected Result**: You should see:
- List of all versions (newest first)
- Version number, date/time, file size
- IPFS CID for each version
- "Restore" button for each version

### Step 4: Restore a Previous Version

1. **In the Versions tab**, find an older version (e.g., Version 1)
2. **Click the "Restore" button** next to that version
3. **Wait for confirmation** (button will show "✅ Restored")

**Expected Result**:
- File content is restored to that version
- A new version is automatically created (the current version becomes a snapshot)
- File explorer refreshes to show updated content

### Step 5: Verify Restoration

1. **Open the file** again (double-click)
2. **Check the content** - it should match the restored version

**Expected Result**: File content matches the version you restored.

---

## 🔍 API Testing (Optional - For Developers)

### Test Version List API

```bash
# Get auth token from browser console: puter.authToken
curl -X GET "http://localhost:4202/versions?path=/your/wallet/Desktop/test-versioning.txt" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

**Expected Response**: JSON array of version objects:
```json
[
  {
    "id": 1,
    "version_number": 3,
    "ipfs_hash": "bafkrei...",
    "size": 25,
    "mime_type": "text/plain",
    "created_at": 1734600000000,
    "created_by": null,
    "comment": null
  },
  ...
]
```

### Test Version Restore API

```bash
curl -X POST "http://localhost:4202/versions/1/restore" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{"path": "/your/wallet/Desktop/test-versioning.txt"}'
```

**Expected Response**:
```json
{
  "success": true,
  "message": "File restored to version 1",
  "restored_version": 1,
  "new_version": 4
}
```

---

## 📊 What to Check

### ✅ Success Indicators

1. **Versions Tab Visible**: Properties window shows "Versions" tab for files
2. **Version List Populates**: After editing a file, versions appear in the list
3. **Version Details**: Each version shows:
   - Version number
   - Date/time
   - File size
   - IPFS CID
4. **Restore Works**: Clicking "Restore" successfully reverts file content
5. **New Version Created**: After restore, a new version is created automatically

### ⚠️ Common Issues

1. **No Versions Showing**: 
   - Make sure you've edited the file at least once
   - Check browser console for errors
   - Verify server logs for API errors

2. **Restore Fails**:
   - Check browser console for error messages
   - Verify IPFS is running (check `/health` endpoint)
   - Ensure file path is correct

3. **Versions Tab Not Visible**:
   - Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)
   - Check that frontend was rebuilt

---

## 🎯 Quick Test Scenario

**Complete workflow in 2 minutes:**

1. Create `test.txt` with content: `Hello`
2. Edit to: `Hello World`
3. Edit to: `Hello World!`
4. Open Properties → Versions tab
5. Restore Version 1
6. Open file → Should show: `Hello`

**If all steps work, versioning is fully functional! ✅**

---

## 📝 Notes

- Versions are created **automatically** - no manual action needed
- Each version stores the **IPFS CID** of that file state
- Restoring creates a **new version** (doesn't delete history)
- Versions are **deleted** when the file is deleted
- Version history is **immutable** (IPFS content-addressing)
