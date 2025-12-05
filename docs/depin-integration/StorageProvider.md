# StorageProvider Interface

This interface defines the storage operations that the DePIN team needs to implement using IPFS.

## Interface Definition

```typescript
interface StorageProvider {
  /**
   * Get file/folder metadata
   * @param path - Absolute path like "/{wallet}/Desktop/file.txt"
   * @returns File metadata or throws if not found
   */
  stat(path: string): Promise<FileMetadata>;
  
  /**
   * Read file contents
   * @param path - Absolute path to file
   * @returns File content as Blob
   */
  read(path: string): Promise<Blob>;
  
  /**
   * Write file contents
   * @param path - Absolute path to file
   * @param content - File content (string, Blob, or ArrayBuffer)
   * @returns Created/updated file metadata
   */
  write(path: string, content: string | Blob | ArrayBuffer): Promise<FileMetadata>;
  
  /**
   * Create directory
   * @param path - Absolute path for new directory
   * @returns Created directory metadata
   */
  mkdir(path: string): Promise<FileMetadata>;
  
  /**
   * List directory contents
   * @param path - Absolute path to directory
   * @returns Array of file/folder metadata
   */
  readdir(path: string): Promise<FileMetadata[]>;
  
  /**
   * Delete file or directory
   * @param path - Absolute path to delete
   * @returns Success status
   */
  delete(path: string): Promise<boolean>;
  
  /**
   * Move/rename file or directory
   * @param oldPath - Current path
   * @param newPath - New path
   * @returns Updated file metadata
   */
  move(oldPath: string, newPath: string): Promise<FileMetadata>;
  
  /**
   * Copy file or directory
   * @param srcPath - Source path
   * @param destPath - Destination path
   * @returns Created file metadata
   */
  copy(srcPath: string, destPath: string): Promise<FileMetadata>;
}

interface FileMetadata {
  id: string;              // Unique identifier (IPFS CID)
  uid: string;             // User-facing unique ID
  name: string;            // File/folder name
  path: string;            // Full path
  is_dir: boolean;         // True if directory
  is_empty?: boolean;      // For directories, true if no children
  type: string;            // "file" | "directory"
  size?: number;           // File size in bytes
  created: string;         // ISO timestamp
  modified: string;        // ISO timestamp
  immutable?: boolean;     // Cannot be deleted/modified
  mime_type?: string;      // MIME type for files
  sort_by?: string;        // For directories: "name" | "modified" | "size" | "type"
  sort_order?: string;     // "asc" | "desc"
}
```

## REST API Endpoints

### GET /stat

Get metadata for a file or directory.

**Request:**
```
GET /stat?path=/0x1234.../Desktop
Authorization: Bearer {session_token}
```

**Response:**
```json
{
  "id": "QmXyz...",
  "uid": "local_1234567890",
  "name": "Desktop",
  "path": "/0x1234.../Desktop",
  "is_dir": true,
  "is_empty": false,
  "type": "directory",
  "created": "2024-01-15T10:30:00Z",
  "modified": "2024-01-15T12:45:00Z",
  "sort_by": "name",
  "sort_order": "asc"
}
```

**Error Response (404):**
```json
{
  "error": {
    "code": "subject_does_not_exist",
    "message": "Path does not exist"
  }
}
```

### GET /read

Read file contents.

**Request:**
```
GET /read?path=/0x1234.../Documents/notes.txt
Authorization: Bearer {session_token}
```

**Response:**
```
Content-Type: text/plain
Content-Length: 1234

[file contents]
```

### POST /write

Write file contents.

**Request:**
```
POST /write
Authorization: Bearer {session_token}
Content-Type: multipart/form-data

path=/0x1234.../Documents/notes.txt
content=[file data]
```

**Response:**
```json
{
  "id": "QmNewCID...",
  "uid": "local_1234567891",
  "name": "notes.txt",
  "path": "/0x1234.../Documents/notes.txt",
  "is_dir": false,
  "type": "file",
  "size": 1234,
  "mime_type": "text/plain",
  "created": "2024-01-15T10:30:00Z",
  "modified": "2024-01-15T14:00:00Z"
}
```

### POST /mkdir

Create a directory.

**Request:**
```
POST /mkdir
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "path": "/0x1234.../Documents/Projects"
}
```

**Response:**
```json
{
  "id": "QmDirCID...",
  "uid": "local_1234567892",
  "name": "Projects",
  "path": "/0x1234.../Documents/Projects",
  "is_dir": true,
  "is_empty": true,
  "type": "directory",
  "created": "2024-01-15T14:30:00Z",
  "modified": "2024-01-15T14:30:00Z"
}
```

### GET /readdir

List directory contents.

**Request:**
```
GET /readdir?path=/0x1234.../Desktop
Authorization: Bearer {session_token}
```

**Response:**
```json
[
  {
    "id": "QmFile1...",
    "name": "document.pdf",
    "path": "/0x1234.../Desktop/document.pdf",
    "is_dir": false,
    "type": "file",
    "size": 102400,
    "mime_type": "application/pdf"
  },
  {
    "id": "QmFolder1...",
    "name": "Projects",
    "path": "/0x1234.../Desktop/Projects",
    "is_dir": true,
    "type": "directory"
  }
]
```

### POST /delete

Delete a file or directory.

**Request:**
```
POST /delete
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "path": "/0x1234.../Desktop/old-file.txt"
}
```

**Response:**
```json
{
  "success": true
}
```

## IPFS Implementation Notes

### Path to CID Mapping

Maintain a mapping between virtual paths and IPFS CIDs:

```
/0x1234.../Desktop/file.txt → QmFileHash...
/0x1234.../Documents/       → QmDirHash...
```

This can be stored in:
- MFS (Mutable File System) in IPFS
- A separate database
- IPNS for user root directory

### Directory Structure

Use IPFS UnixFS for directory structures:

```javascript
// Example using js-ipfs or kubo RPC
const dirCID = await ipfs.files.mkdir('/0x1234.../Desktop');
const fileCID = await ipfs.add(fileContent);
await ipfs.files.cp(`/ipfs/${fileCID}`, '/0x1234.../Desktop/file.txt');
```

### Trash Implementation

When files are deleted, move them to Trash instead of removing:

```javascript
async function moveToTrash(path) {
  const filename = path.split('/').pop();
  const trashPath = `/${wallet}/Trash/${filename}_${Date.now()}`;
  await ipfs.files.mv(path, trashPath);
}
```

## Integration with Frontend

The frontend currently uses the `puter` global object. Your backend responses should match the expected format so the frontend code works without modification.

Example of how frontend calls storage:

```javascript
// Frontend code (no changes needed)
const fileInfo = await puter.fs.stat({ path: '/user/Desktop/file.txt' });
const content = await puter.fs.read('/user/Desktop/file.txt');
await puter.fs.write('/user/Desktop/new.txt', 'Hello World');
```

Your backend intercepts these calls and routes them to IPFS.
