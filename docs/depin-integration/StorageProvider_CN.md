# 存储提供者接口

本接口定义了 DePIN 团队需要使用 IPFS 实现的存储操作。

## 接口定义

```typescript
interface StorageProvider {
  /**
   * 获取文件/文件夹元数据
   * @param path - 绝对路径，如 "/{钱包地址}/Desktop/file.txt"
   * @returns 文件元数据，如果不存在则抛出异常
   */
  stat(path: string): Promise<FileMetadata>;
  
  /**
   * 读取文件内容
   * @param path - 文件的绝对路径
   * @returns 文件内容（Blob格式）
   */
  read(path: string): Promise<Blob>;
  
  /**
   * 写入文件内容
   * @param path - 文件的绝对路径
   * @param content - 文件内容（字符串、Blob 或 ArrayBuffer）
   * @returns 创建/更新后的文件元数据
   */
  write(path: string, content: string | Blob | ArrayBuffer): Promise<FileMetadata>;
  
  /**
   * 创建目录
   * @param path - 新目录的绝对路径
   * @returns 创建的目录元数据
   */
  mkdir(path: string): Promise<FileMetadata>;
  
  /**
   * 列出目录内容
   * @param path - 目录的绝对路径
   * @returns 文件/文件夹元数据数组
   */
  readdir(path: string): Promise<FileMetadata[]>;
  
  /**
   * 删除文件或目录
   * @param path - 要删除的绝对路径
   * @returns 是否成功
   */
  delete(path: string): Promise<boolean>;
  
  /**
   * 移动/重命名文件或目录
   * @param oldPath - 当前路径
   * @param newPath - 新路径
   * @returns 更新后的文件元数据
   */
  move(oldPath: string, newPath: string): Promise<FileMetadata>;
  
  /**
   * 复制文件或目录
   * @param srcPath - 源路径
   * @param destPath - 目标路径
   * @returns 创建的文件元数据
   */
  copy(srcPath: string, destPath: string): Promise<FileMetadata>;
}

interface FileMetadata {
  id: string;              // 唯一标识符（IPFS CID）
  uid: string;             // 用户可见的唯一 ID
  name: string;            // 文件/文件夹名称
  path: string;            // 完整路径
  is_dir: boolean;         // 是否为目录
  is_empty?: boolean;      // 对于目录，是否为空
  type: string;            // "file" | "directory"
  size?: number;           // 文件大小（字节）
  created: string;         // ISO 时间戳
  modified: string;        // ISO 时间戳
  immutable?: boolean;     // 是否不可删除/修改
  mime_type?: string;      // 文件的 MIME 类型
  sort_by?: string;        // 目录排序方式: "name" | "modified" | "size" | "type"
  sort_order?: string;     // "asc" | "desc"
}
```

## REST API 接口

### GET /stat

获取文件或目录的元数据。

**请求：**
```
GET /stat?path=/0x1234.../Desktop
Authorization: Bearer {session_token}
```

**响应：**
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

**错误响应 (404)：**
```json
{
  "error": {
    "code": "subject_does_not_exist",
    "message": "路径不存在"
  }
}
```

### GET /read

读取文件内容。

**请求：**
```
GET /read?path=/0x1234.../Documents/notes.txt
Authorization: Bearer {session_token}
```

**响应：**
```
Content-Type: text/plain
Content-Length: 1234

[文件内容]
```

### POST /write

写入文件内容。

**请求：**
```
POST /write
Authorization: Bearer {session_token}
Content-Type: multipart/form-data

path=/0x1234.../Documents/notes.txt
content=[文件数据]
```

**响应：**
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

创建目录。

**请求：**
```
POST /mkdir
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "path": "/0x1234.../Documents/Projects"
}
```

**响应：**
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

列出目录内容。

**请求：**
```
GET /readdir?path=/0x1234.../Desktop
Authorization: Bearer {session_token}
```

**响应：**
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

删除文件或目录。

**请求：**
```
POST /delete
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "path": "/0x1234.../Desktop/old-file.txt"
}
```

**响应：**
```json
{
  "success": true
}
```

## IPFS 实现说明

### 路径到 CID 的映射

维护虚拟路径和 IPFS CID 之间的映射：

```
/0x1234.../Desktop/file.txt → QmFileHash...
/0x1234.../Documents/       → QmDirHash...
```

可以存储在：
- IPFS 的 MFS（可变文件系统）
- 单独的数据库
- 用户根目录的 IPNS

### 目录结构

使用 IPFS UnixFS 处理目录结构：

```javascript
// 使用 js-ipfs 或 kubo RPC 的示例
const dirCID = await ipfs.files.mkdir('/0x1234.../Desktop');
const fileCID = await ipfs.add(fileContent);
await ipfs.files.cp(`/ipfs/${fileCID}`, '/0x1234.../Desktop/file.txt');
```

### 回收站实现

删除文件时，移动到回收站而不是直接删除：

```javascript
async function moveToTrash(path) {
  const filename = path.split('/').pop();
  const trashPath = `/${wallet}/Trash/${filename}_${Date.now()}`;
  await ipfs.files.mv(path, trashPath);
}
```

## 与前端集成

前端目前使用 `puter` 全局对象。你们的后端响应应该匹配预期的格式，这样前端代码无需修改即可工作。

前端调用存储的示例：

```javascript
// 前端代码（无需修改）
const fileInfo = await puter.fs.stat({ path: '/user/Desktop/file.txt' });
const content = await puter.fs.read('/user/Desktop/file.txt');
await puter.fs.write('/user/Desktop/new.txt', 'Hello World');
```

你们的后端拦截这些调用并将它们路由到 IPFS。
