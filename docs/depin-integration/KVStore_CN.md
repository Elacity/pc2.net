# 键值存储接口

本接口处理用户偏好设置和应用数据的键值存储。

## 接口定义

```typescript
interface KVStore {
  /**
   * 通过键获取值
   * @param key - 要获取的键
   * @returns 存储的值，如果未找到则返回 null
   */
  get(key: string): Promise<any>;
  
  /**
   * 通过键设置值
   * @param key - 要存储的键
   * @param value - 要存储的值（将被 JSON 序列化）
   */
  set(key: string, value: any): Promise<void>;
  
  /**
   * 删除一个键
   * @param key - 要删除的键
   */
  delete(key: string): Promise<void>;
  
  /**
   * 列出所有键（可选按前缀过滤）
   * @param prefix - 可选的前缀过滤
   */
  list(prefix?: string): Promise<string[]>;
}
```

## 常用键

前端存储这些偏好设置：

| 键 | 描述 | 示例值 |
|-----|------|--------|
| `desktop_bg_url` | 桌面壁纸 URL | `"/images/wallpaper.jpg"` |
| `desktop_bg_color` | 桌面背景颜色 | `"#1a1a2e"` |
| `desktop_bg_fit` | 壁纸适应模式 | `"cover"` |
| `desktop_icons_hidden` | 隐藏桌面图标 | `"true"` |
| `user_preferences.language` | 界面语言 | `"zh"` |
| `user_preferences.clock_visible` | 显示时钟 | `"true"` |
| `taskbar_position` | 任务栏位置 | `"bottom"` |
| `taskbar_items` | 固定的任务栏应用 | `[...]` |
| `window_positions` | 保存的窗口位置 | `{...}` |
| `theme` | 界面主题设置 | `{...}` |

## REST API 接口

### GET /kv/get

获取存储的值。

**请求：**
```
GET /kv/get?key=desktop_bg_url
Authorization: Bearer {session_token}
```

**响应：**
```json
{
  "key": "desktop_bg_url",
  "value": "/images/wallpaper-elastos.jpg"
}
```

**未找到响应：**
```json
{
  "key": "desktop_bg_url",
  "value": null
}
```

### POST /kv/set

存储一个值。

**请求：**
```
POST /kv/set
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "key": "desktop_bg_url",
  "value": "/images/custom-wallpaper.jpg"
}
```

**响应：**
```json
{
  "success": true
}
```

### POST /kv/delete

删除存储的值。

**请求：**
```
POST /kv/delete
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "key": "old_preference"
}
```

**响应：**
```json
{
  "success": true
}
```

### GET /kv/list

列出用户的所有键。

**请求：**
```
GET /kv/list?prefix=user_preferences
Authorization: Bearer {session_token}
```

**响应：**
```json
{
  "keys": [
    "user_preferences.language",
    "user_preferences.clock_visible",
    "user_preferences.theme"
  ]
}
```

## 实现方案

### 方案一：IPFS 文件存储

将偏好设置存储为 IPFS 中的 JSON 文件：

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

### 方案二：数据库存储

使用简单的键值表：

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

### 方案三：混合方案

- 关键偏好设置存储在数据库中（快速访问）
- 大数据存储在 IPFS 中（壁纸、主题）

## 前端使用

前端使用 `puter.kv.*` 方法：

```javascript
// 获取偏好设置
const value = await puter.kv.get('desktop_bg_url');

// 设置偏好设置
await puter.kv.set('desktop_bg_url', '/images/new-wallpaper.jpg');

// 删除偏好设置
await puter.kv.del('old_preference');
```

你们的后端需要在 `/kv/*` 端点处理这些调用。

## 同步考虑

对于多设备支持，请考虑：

1. **后写入优先**：简单，可能丢失数据
2. **基于时间戳合并**：比较时间戳
3. **CRDT**：无冲突复制数据类型

对于用户偏好设置，后写入优先通常就足够了。
