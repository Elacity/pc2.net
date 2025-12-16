# PC2 Node API Documentation

## Overview

PC2 Node provides a RESTful API for managing files, authentication, and user data. All endpoints (except `/health`, `/version`, and `/auth/particle`) require authentication via a session token.

## Authentication

### POST /auth/particle

Authenticate with Particle Auth wallet.

**Request Body:**
```json
{
  "wallet_address": "0x...",
  "smart_account_address": "0x..." // optional
}
```

**Response:**
```json
{
  "success": true,
  "token": "session-token-here",
  "user": {
    "id": 1,
    "uuid": "0x...",
    "username": "0x...",
    "wallet_address": "0x...",
    "smart_account_address": "0x..." | null,
    "email": null,
    "email_confirmed": true,
    "is_temp": false,
    "taskbar_items": [],
    "desktop_bg_url": "/images/flint-2.jpg",
    "desktop_bg_color": null,
    "desktop_bg_fit": "cover",
    "token": "session-token-here",
    "auth_type": "wallet" | "universalx"
  }
}
```

**Note:** The first wallet to authenticate becomes the owner. Subsequent wallets must be in the owner's tethered wallets list.

## User Information

### GET /whoami

Get current user information.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": 1,
  "uuid": "0x...",
  "username": "0x...",
  "wallet_address": "0x...",
  "smart_account_address": "0x..." | null,
  "email": null,
  "email_confirmed": true,
  "is_temp": false,
  "taskbar_items": [],
  "desktop_bg_url": "/images/flint-2.jpg",
  "desktop_bg_color": null,
  "desktop_bg_fit": "cover",
  "token": "session-token-here",
  "auth_type": "wallet" | "universalx"
}
```

### GET /os/user

Alias for `/whoami`.

## Filesystem Operations

### GET /stat

Get file or directory metadata.

**Query Parameters:**
- `path` (required): File or directory path

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "name": "file.txt",
  "path": "/path/to/file.txt",
  "type": "file" | "dir",
  "size": 1024,
  "created": 1234567890,
  "modified": 1234567890,
  "mime_type": "text/plain" | null,
  "is_dir": false,
  "uid": "uuid-/path/to/file.txt",
  "uuid": "uuid-/path/to/file.txt"
}
```

### POST /readdir

List directory contents.

**Request Body:**
```json
{
  "path": "/path/to/directory" // defaults to "/"
}
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "name": "file.txt",
    "path": "/path/to/file.txt",
    "type": "file",
    "size": 1024,
    "created": 1234567890,
    "modified": 1234567890,
    "mime_type": "text/plain",
    "is_dir": false,
    "uid": "uuid-/path/to/file.txt",
    "uuid": "uuid-/path/to/file.txt"
  }
]
```

### GET /read

Read file content.

**Query Parameters:**
- `path` (required): File path
- `encoding` (optional): `utf8` (default) or `base64`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
- For `utf8`: Plain text content
- For `base64`: Base64-encoded content

### POST /write

Write or create a file.

**Request Body:**
```json
{
  "path": "/path/to/file.txt",
  "content": "file content",
  "encoding": "utf8" | "base64", // optional, defaults to "utf8"
  "mime_type": "text/plain" // optional
}
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "name": "file.txt",
  "path": "/path/to/file.txt",
  "type": "file",
  "size": 1024,
  "created": 1234567890,
  "modified": 1234567890,
  "mime_type": "text/plain",
  "is_dir": false,
  "uid": "uuid-/path/to/file.txt",
  "uuid": "uuid-/path/to/file.txt"
}
```

### POST /mkdir

Create a directory.

**Request Body:**
```json
{
  "path": "/path/to/directory"
}
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "name": "directory",
  "path": "/path/to/directory",
  "type": "dir",
  "size": 0,
  "created": 1234567890,
  "modified": 1234567890,
  "mime_type": null,
  "is_dir": true,
  "uid": "uuid-/path/to/directory",
  "uuid": "uuid-/path/to/directory"
}
```

### POST /delete

Delete files or directories.

**Request Body:**
```json
{
  "items": [
    { "path": "/path/to/file.txt" },
    { "uid": "uuid-/path/to/file2.txt" }
  ]
}
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "deleted": [
    {
      "path": "/path/to/file.txt",
      "success": true
    },
    {
      "path": "/path/to/file2.txt",
      "success": false,
      "error": "File not found"
    }
  ]
}
```

### POST /move

Move or rename files.

**Request Body:**
```json
{
  "items": [
    { "path": "/path/to/file.txt" },
    { "uid": "uuid-/path/to/file2.txt" }
  ],
  "destination": "/new/path/" // or "/new/path/file.txt"
}
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "moved": [
    {
      "path": "/path/to/file.txt",
      "new_path": "/new/path/file.txt",
      "success": true
    }
  ]
}
```

## File Signing

### POST /sign

Sign files for app access (generates signed URLs).

**Request Body:**
```json
{
  "items": [
    { "path": "/path/to/file.txt" },
    { "uid": "uuid-/path/to/file2.txt", "action": "read" }
  ],
  "app_uid": "app-id" // optional
}
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "token": "app-token",
  "signatures": [
    {
      "uid": "uuid-/path/to/file.txt",
      "expires": 9999999999,
      "signature": "sig-...",
      "url": "http://localhost:4200/file?uid=...",
      "read_url": "http://localhost:4200/file?uid=...",
      "write_url": "http://localhost:4200/writeFile?uid=...",
      "metadata_url": "http://localhost:4200/itemMetadata?uid=...",
      "fsentry_type": "text/plain",
      "fsentry_is_dir": false,
      "fsentry_name": "file.txt",
      "fsentry_size": 1024,
      "fsentry_modified": 1234567890,
      "fsentry_created": 1234567890,
      "path": "/path/to/file.txt"
    }
  ]
}
```

## Key-Value Store

### GET /kv/:key

Get a value from the key-value store.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
- String value (plain text)
- JSON value (if stored as JSON)

### POST /kv/:key

Set a value in the key-value store.

**Request Body:**
```json
{
  "value": "value to store"
}
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true
}
```

### DELETE /kv/:key

Delete a value from the key-value store.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true
}
```

## System Endpoints

### GET /health

Health check endpoint (no authentication required).

**Response:**
```json
{
  "status": "ok" | "degraded",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "database": "connected" | "not initialized",
  "ipfs": "available" | "not initialized",
  "websocket": "active" | "not initialized",
  "owner": {
    "set": true,
    "tethered_wallets": 0
  }
}
```

### GET /version

Get server version (no authentication required).

**Response:**
```json
{
  "version": "2.5.1",
  "server": "pc2-node",
  "deployed": "2024-01-01T00:00:00.000Z"
}
```

### POST /rao

Record app open (requires authentication).

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "code": "ok",
  "message": "ok"
}
```

### POST /contactUs

Contact form submission (no authentication required).

**Response:**
```json
{
  "success": true
}
```

## Error Responses

All endpoints return errors in the following format:

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad Request (missing or invalid parameters)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (wallet not authorized)
- `404` - Not Found (file/resource not found)
- `500` - Internal Server Error

## WebSocket Events

PC2 Node uses Socket.io for real-time updates. Connect to the WebSocket endpoint and authenticate with your session token.

**Connection:**
```javascript
const socket = io('http://localhost:4200', {
  auth: {
    token: 'your-session-token'
  }
});
```

**Events:**
- `connected` - Connection established
- `file:change` - File created, updated, moved, or deleted
- `directory:change` - Directory created or deleted

**Example:**
```javascript
socket.on('file:change', (data) => {
  console.log('File changed:', data.path, data.action);
});
```

## Rate Limiting

Rate limiting is configured in `config/default.json`:
- `rate_limit_window_ms`: Time window in milliseconds (default: 60000)
- `rate_limit_max_requests`: Maximum requests per window (default: 100)

## Session Management

Sessions are stored in the SQLite database and expire after the configured duration (default: 7 days). Expired sessions are automatically cleaned up on server startup.

