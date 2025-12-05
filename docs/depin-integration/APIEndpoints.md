# API Endpoints Summary

Complete list of endpoints your DePIN backend needs to implement.

## Base URL Configuration

Update the frontend to point to your hardware box:

```javascript
// In config or environment
window.api_origin = 'http://your-hardware-box:8080';
```

## Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/particle` | Authenticate via Particle wallet |
| POST | `/auth/wallet` | Direct wallet authentication (optional) |
| GET | `/whoami` | Get current user info |
| POST | `/auth/logout` | End session |

## File System Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stat` | Get file/folder metadata |
| GET | `/read` | Read file contents |
| POST | `/write` | Write file contents |
| POST | `/mkdir` | Create directory |
| GET | `/readdir` | List directory contents |
| POST | `/delete` | Delete file/folder |
| POST | `/move` | Move/rename file |
| POST | `/copy` | Copy file/folder |

## Key-Value Storage Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/kv/get` | Get preference value |
| POST | `/kv/set` | Set preference value |
| POST | `/kv/del` | Delete preference |
| GET | `/kv/list` | List keys |

## System Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/healthcheck` | Server health status |
| GET | `/version` | API version info |

---

## Detailed Specifications

### POST /auth/particle

**Purpose:** Authenticate user via Particle Network wallet

**Request:**
```http
POST /auth/particle
Content-Type: application/json

{
  "address": "0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3",
  "chainId": 20,
  "smartAccountAddress": "0x7efe9dd20dab98e28b0116ae83c9799ea653b8c5",
  "particleUuid": "uuid-string",
  "particleEmail": "user@example.com"
}
```

**Response (200):**
```json
{
  "token": "jwt-session-token",
  "user": {
    "uuid": "user-uuid",
    "username": "0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3",
    "email": "user@example.com",
    "wallet_address": "0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3",
    "smart_account_address": "0x7efe9dd20dab98e28b0116ae83c9799ea653b8c5",
    "auth_type": "universalx",
    "is_temp": false
  }
}
```

---

### GET /whoami

**Purpose:** Get authenticated user details

**Request:**
```http
GET /whoami
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "uuid": "user-uuid",
  "username": "0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3",
  "email": "user@example.com",
  "wallet_address": "0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3",
  "smart_account_address": "0x7efe9dd20dab98e28b0116ae83c9799ea653b8c5",
  "auth_type": "universalx",
  "is_temp": false,
  "taskbar_items": []
}
```

---

### GET /stat

**Purpose:** Get file or directory metadata

**Request:**
```http
GET /stat?path=/0x1234.../Desktop/file.txt
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "id": "QmCID...",
  "uid": "unique-id",
  "name": "file.txt",
  "path": "/0x1234.../Desktop/file.txt",
  "is_dir": false,
  "type": "file",
  "size": 1024,
  "mime_type": "text/plain",
  "created": "2024-01-15T10:30:00Z",
  "modified": "2024-01-15T12:00:00Z",
  "immutable": false
}
```

**Response (404):**
```json
{
  "error": {
    "code": "subject_does_not_exist",
    "message": "Path does not exist"
  }
}
```

---

### GET /read

**Purpose:** Read file contents

**Request:**
```http
GET /read?path=/0x1234.../Documents/notes.txt
Authorization: Bearer {token}
```

**Response (200):**
```
Content-Type: text/plain
Content-Disposition: inline; filename="notes.txt"

[file contents here]
```

---

### POST /write

**Purpose:** Create or update a file

**Request:**
```http
POST /write
Authorization: Bearer {token}
Content-Type: multipart/form-data

path=/0x1234.../Documents/new-file.txt
content=Hello World
```

Or for binary files:
```http
POST /write
Authorization: Bearer {token}
Content-Type: multipart/form-data

path=/0x1234.../Pictures/photo.jpg
file=[binary data]
```

**Response (200):**
```json
{
  "id": "QmNewCID...",
  "uid": "new-unique-id",
  "name": "new-file.txt",
  "path": "/0x1234.../Documents/new-file.txt",
  "is_dir": false,
  "type": "file",
  "size": 11,
  "created": "2024-01-15T14:00:00Z",
  "modified": "2024-01-15T14:00:00Z"
}
```

---

### POST /mkdir

**Purpose:** Create a directory

**Request:**
```http
POST /mkdir
Authorization: Bearer {token}
Content-Type: application/json

{
  "path": "/0x1234.../Documents/NewFolder"
}
```

**Response (200):**
```json
{
  "id": "QmDirCID...",
  "uid": "dir-unique-id",
  "name": "NewFolder",
  "path": "/0x1234.../Documents/NewFolder",
  "is_dir": true,
  "is_empty": true,
  "type": "directory"
}
```

---

### GET /readdir

**Purpose:** List directory contents

**Request:**
```http
GET /readdir?path=/0x1234.../Desktop
Authorization: Bearer {token}
```

**Response (200):**
```json
[
  {
    "id": "QmFile1...",
    "name": "document.pdf",
    "path": "/0x1234.../Desktop/document.pdf",
    "is_dir": false,
    "type": "file",
    "size": 102400
  },
  {
    "id": "QmDir1...",
    "name": "Projects",
    "path": "/0x1234.../Desktop/Projects",
    "is_dir": true,
    "type": "directory"
  }
]
```

---

### POST /delete

**Purpose:** Delete a file or directory (moves to Trash)

**Request:**
```http
POST /delete
Authorization: Bearer {token}
Content-Type: application/json

{
  "path": "/0x1234.../Desktop/old-file.txt"
}
```

**Response (200):**
```json
{
  "success": true
}
```

---

### GET /kv/get

**Purpose:** Get a stored preference

**Request:**
```http
GET /kv/get?key=desktop_bg_url
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "key": "desktop_bg_url",
  "value": "/images/wallpaper.jpg"
}
```

---

### POST /kv/set

**Purpose:** Store a preference

**Request:**
```http
POST /kv/set
Authorization: Bearer {token}
Content-Type: application/json

{
  "key": "desktop_bg_url",
  "value": "/images/new-wallpaper.jpg"
}
```

**Response (200):**
```json
{
  "success": true
}
```

---

### GET /healthcheck

**Purpose:** Check if server is running

**Request:**
```http
GET /healthcheck
```

**Response (200):**
```json
{
  "ok": true,
  "version": "1.0.0",
  "ipfs_connected": true
}
```

---

## Error Response Format

All errors should follow this format:

```json
{
  "error": {
    "code": "error_code",
    "message": "Human readable message"
  }
}
```

Common error codes:
- `unauthorized` - No valid session
- `subject_does_not_exist` - Path not found
- `permission_denied` - No access to resource
- `invalid_request` - Bad request format
- `internal_error` - Server error

## CORS Configuration

Enable CORS for frontend access:

```javascript
app.use(cors({
  origin: ['http://puter.localhost:4100', 'https://your-domain.com'],
  credentials: true
}));
```

## Rate Limiting

Recommended limits:
- Auth endpoints: 10 requests/minute
- File operations: 100 requests/minute
- KV operations: 200 requests/minute
