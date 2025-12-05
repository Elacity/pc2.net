# API 接口汇总

DePIN 后端需要实现的完整接口列表。

## 基础 URL 配置

更新前端指向你们的硬件盒子：

```javascript
// 在配置或环境变量中
window.api_origin = 'http://你的硬件盒子:8080';
```

## 认证接口

| 方法 | 接口 | 描述 |
|------|------|------|
| POST | `/auth/particle` | 通过 Particle 钱包认证 |
| POST | `/auth/wallet` | 直接钱包认证（可选） |
| GET | `/whoami` | 获取当前用户信息 |
| POST | `/auth/logout` | 结束会话 |

## 文件系统接口

| 方法 | 接口 | 描述 |
|------|------|------|
| GET | `/stat` | 获取文件/文件夹元数据 |
| GET | `/read` | 读取文件内容 |
| POST | `/write` | 写入文件内容 |
| POST | `/mkdir` | 创建目录 |
| GET | `/readdir` | 列出目录内容 |
| POST | `/delete` | 删除文件/文件夹 |
| POST | `/move` | 移动/重命名文件 |
| POST | `/copy` | 复制文件/文件夹 |

## 键值存储接口

| 方法 | 接口 | 描述 |
|------|------|------|
| GET | `/kv/get` | 获取偏好设置值 |
| POST | `/kv/set` | 设置偏好设置值 |
| POST | `/kv/del` | 删除偏好设置 |
| GET | `/kv/list` | 列出所有键 |

## 系统接口

| 方法 | 接口 | 描述 |
|------|------|------|
| GET | `/healthcheck` | 服务器健康状态 |
| GET | `/version` | API 版本信息 |

---

## 详细规范

### POST /auth/particle

**用途：** 通过 Particle Network 钱包认证用户

**请求：**
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

**响应 (200)：**
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

**用途：** 获取已认证用户详情

**请求：**
```http
GET /whoami
Authorization: Bearer {token}
```

**响应 (200)：**
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

**用途：** 获取文件或目录元数据

**请求：**
```http
GET /stat?path=/0x1234.../Desktop/file.txt
Authorization: Bearer {token}
```

**响应 (200)：**
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

**响应 (404)：**
```json
{
  "error": {
    "code": "subject_does_not_exist",
    "message": "路径不存在"
  }
}
```

---

### GET /read

**用途：** 读取文件内容

**请求：**
```http
GET /read?path=/0x1234.../Documents/notes.txt
Authorization: Bearer {token}
```

**响应 (200)：**
```
Content-Type: text/plain
Content-Disposition: inline; filename="notes.txt"

[文件内容]
```

---

### POST /write

**用途：** 创建或更新文件

**请求：**
```http
POST /write
Authorization: Bearer {token}
Content-Type: multipart/form-data

path=/0x1234.../Documents/new-file.txt
content=Hello World
```

或二进制文件：
```http
POST /write
Authorization: Bearer {token}
Content-Type: multipart/form-data

path=/0x1234.../Pictures/photo.jpg
file=[二进制数据]
```

**响应 (200)：**
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

**用途：** 创建目录

**请求：**
```http
POST /mkdir
Authorization: Bearer {token}
Content-Type: application/json

{
  "path": "/0x1234.../Documents/NewFolder"
}
```

**响应 (200)：**
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

**用途：** 列出目录内容

**请求：**
```http
GET /readdir?path=/0x1234.../Desktop
Authorization: Bearer {token}
```

**响应 (200)：**
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

**用途：** 删除文件或目录（移动到回收站）

**请求：**
```http
POST /delete
Authorization: Bearer {token}
Content-Type: application/json

{
  "path": "/0x1234.../Desktop/old-file.txt"
}
```

**响应 (200)：**
```json
{
  "success": true
}
```

---

### GET /kv/get

**用途：** 获取存储的偏好设置

**请求：**
```http
GET /kv/get?key=desktop_bg_url
Authorization: Bearer {token}
```

**响应 (200)：**
```json
{
  "key": "desktop_bg_url",
  "value": "/images/wallpaper.jpg"
}
```

---

### POST /kv/set

**用途：** 存储偏好设置

**请求：**
```http
POST /kv/set
Authorization: Bearer {token}
Content-Type: application/json

{
  "key": "desktop_bg_url",
  "value": "/images/new-wallpaper.jpg"
}
```

**响应 (200)：**
```json
{
  "success": true
}
```

---

### GET /healthcheck

**用途：** 检查服务器是否运行

**请求：**
```http
GET /healthcheck
```

**响应 (200)：**
```json
{
  "ok": true,
  "version": "1.0.0",
  "ipfs_connected": true
}
```

---

## 错误响应格式

所有错误应遵循此格式：

```json
{
  "error": {
    "code": "error_code",
    "message": "人类可读的消息"
  }
}
```

常见错误代码：
- `unauthorized` - 无有效会话
- `subject_does_not_exist` - 路径未找到
- `permission_denied` - 无资源访问权限
- `invalid_request` - 请求格式错误
- `internal_error` - 服务器错误

## CORS 配置

启用前端访问的 CORS：

```javascript
app.use(cors({
  origin: ['http://puter.localhost:4100', 'https://your-domain.com'],
  credentials: true
}));
```

## 速率限制

推荐限制：
- 认证接口：每分钟 10 次请求
- 文件操作：每分钟 100 次请求
- 键值操作：每分钟 200 次请求
