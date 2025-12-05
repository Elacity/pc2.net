# KVStore Interface

This interface handles key-value storage for user preferences and app data.

## Interface Definition

```typescript
interface KVStore {
  /**
   * Get a value by key
   * @param key - The key to retrieve
   * @returns The stored value or null if not found
   */
  get(key: string): Promise<any>;
  
  /**
   * Set a value by key
   * @param key - The key to store
   * @param value - The value to store (will be JSON serialized)
   */
  set(key: string, value: any): Promise<void>;
  
  /**
   * Delete a key
   * @param key - The key to delete
   */
  delete(key: string): Promise<void>;
  
  /**
   * List all keys (optionally with prefix)
   * @param prefix - Optional prefix to filter keys
   */
  list(prefix?: string): Promise<string[]>;
}
```

## Common Keys Used

The frontend stores these preferences:

| Key | Description | Example Value |
|-----|-------------|---------------|
| `desktop_bg_url` | Desktop wallpaper URL | `"/images/wallpaper.jpg"` |
| `desktop_bg_color` | Desktop background color | `"#1a1a2e"` |
| `desktop_bg_fit` | Wallpaper fit mode | `"cover"` |
| `desktop_icons_hidden` | Hide desktop icons | `"true"` |
| `user_preferences.language` | UI language | `"en"` |
| `user_preferences.clock_visible` | Show clock | `"true"` |
| `taskbar_position` | Taskbar position | `"bottom"` |
| `taskbar_items` | Pinned taskbar apps | `[...]` |
| `window_positions` | Saved window positions | `{...}` |
| `theme` | UI theme settings | `{...}` |

## REST API Endpoints

### GET /kv/get

Retrieve a stored value.

**Request:**
```
GET /kv/get?key=desktop_bg_url
Authorization: Bearer {session_token}
```

**Response:**
```json
{
  "key": "desktop_bg_url",
  "value": "/images/wallpaper-elastos.jpg"
}
```

**Response (Not Found):**
```json
{
  "key": "desktop_bg_url",
  "value": null
}
```

### POST /kv/set

Store a value.

**Request:**
```
POST /kv/set
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "key": "desktop_bg_url",
  "value": "/images/custom-wallpaper.jpg"
}
```

**Response:**
```json
{
  "success": true
}
```

### POST /kv/delete

Delete a stored value.

**Request:**
```
POST /kv/delete
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "key": "old_preference"
}
```

**Response:**
```json
{
  "success": true
}
```

### GET /kv/list

List all keys for the user.

**Request:**
```
GET /kv/list?prefix=user_preferences
Authorization: Bearer {session_token}
```

**Response:**
```json
{
  "keys": [
    "user_preferences.language",
    "user_preferences.clock_visible",
    "user_preferences.theme"
  ]
}
```

## Implementation Options

### Option 1: IPFS File Storage

Store preferences as a JSON file in IPFS:

```javascript
const PREFS_PATH = (wallet) => `/${wallet}/AppData/.preferences.json`;

async function getPreferences(wallet) {
  try {
    const content = await ipfs.files.read(PREFS_PATH(wallet));
    return JSON.parse(content.toString());
  } catch (e) {
    return {};
  }
}

async function setPreference(wallet, key, value) {
  const prefs = await getPreferences(wallet);
  prefs[key] = value;
  await ipfs.files.write(
    PREFS_PATH(wallet), 
    JSON.stringify(prefs),
    { create: true, truncate: true }
  );
}
```

### Option 2: Database Storage

Use a simple key-value table:

```sql
CREATE TABLE user_preferences (
  user_id VARCHAR(255),
  key VARCHAR(255),
  value TEXT,
  updated_at TIMESTAMP,
  PRIMARY KEY (user_id, key)
);
```

```javascript
async function get(userId, key) {
  const row = await db.query(
    'SELECT value FROM user_preferences WHERE user_id = ? AND key = ?',
    [userId, key]
  );
  return row ? JSON.parse(row.value) : null;
}

async function set(userId, key, value) {
  await db.query(
    `INSERT INTO user_preferences (user_id, key, value, updated_at) 
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE value = ?, updated_at = NOW()`,
    [userId, key, JSON.stringify(value), JSON.stringify(value)]
  );
}
```

### Option 3: Hybrid

- Critical preferences in database (fast access)
- Large data in IPFS (wallpapers, themes)

## Frontend Usage

The frontend uses `puter.kv.*` methods:

```javascript
// Get preference
const value = await puter.kv.get('desktop_bg_url');

// Set preference
await puter.kv.set('desktop_bg_url', '/images/new-wallpaper.jpg');

// Delete preference
await puter.kv.del('old_preference');
```

Your backend needs to handle these calls at the `/kv/*` endpoints.

## Sync Considerations

For multi-device support, consider:

1. **Last-write-wins**: Simple, may lose data
2. **Timestamp-based merge**: Compare timestamps
3. **CRDT**: Conflict-free replicated data types

For user preferences, last-write-wins is usually sufficient.
