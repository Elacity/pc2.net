# 认证提供者接口

本文档描述了 Elastos 云操作系统前端与 DePIN 后端之间的认证流程。

## 当前实现

前端使用 **Particle Network** 进行去中心化钱包认证。这已经实现并正常工作。

## 认证流程

```
┌──────────────┐     ┌─────────────────┐     ┌───────────────────┐
│    用户      │     │  Elastos OS     │     │   DePIN 后端      │
│   (钱包)     │     │    (前端)       │     │  (你们的硬件)     │
└──────┬───────┘     └────────┬────────┘     └─────────┬─────────┘
       │                      │                        │
       │  1. 点击登录         │                        │
       │─────────────────────>│                        │
       │                      │                        │
       │  2. Particle 认证    │                        │
       │<────────────────────>│                        │
       │                      │                        │
       │  3. 返回钱包地址     │                        │
       │     + 智能账户       │                        │
       │─────────────────────>│                        │
       │                      │                        │
       │                      │  4. POST /auth/particle│
       │                      │  (钱包数据)            │
       │                      │───────────────────────>│
       │                      │                        │
       │                      │                        │  5. 验证签名
       │                      │                        │     创建/查找用户
       │                      │                        │     初始化 IPFS 文件夹
       │                      │                        │
       │                      │  6. 返回会话           │
       │                      │<───────────────────────│
       │                      │                        │
       │  7. 加载桌面         │                        │
       │<─────────────────────│                        │
       │                      │                        │
```

## API 接口

### POST /auth/particle

通过 Particle Network 钱包认证用户。

**请求：**
```json
{
  "address": "0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3",
  "chainId": 20,
  "smartAccountAddress": "0x7efe9dd20dab98e28b0116ae83c9799ea653b8c5",
  "particleUuid": "550e8400-e29b-41d4-a716-446655440000",
  "particleEmail": "user@example.com"
}
```

**成功响应：**
```json
{
  "token": "session_token_here",
  "user": {
    "uuid": "user-uuid",
    "username": "0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3",
    "email": "user@example.com",
    "wallet_address": "0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3",
    "smart_account_address": "0x7efe9dd20dab98e28b0116ae83c9799ea653b8c5",
    "auth_type": "universalx",
    "is_temp": false,
    "email_confirmed": true
  }
}
```

**错误响应：**
```json
{
  "error": {
    "code": "auth_failed",
    "message": "钱包签名无效"
  }
}
```

### GET /whoami

获取当前已认证用户信息。

**请求：**
```
GET /whoami
Authorization: Bearer {session_token}
```

**响应：**
```json
{
  "uuid": "user-uuid",
  "username": "0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3",
  "email": "user@example.com",
  "wallet_address": "0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3",
  "smart_account_address": "0x7efe9dd20dab98e28b0116ae83c9799ea653b8c5",
  "auth_type": "universalx",
  "is_temp": false,
  "email_confirmed": true,
  "taskbar_items": []
}
```

### POST /auth/logout

结束用户会话。

**请求：**
```
POST /auth/logout
Authorization: Bearer {session_token}
```

**响应：**
```json
{
  "success": true
}
```

## 后端实现

### 1. 验证钱包（可选的额外安全措施）

为了额外的安全性，可以要求签名消息：

```javascript
// 前端签名消息
const message = `登录 Elastos 云操作系统\n时间戳: ${Date.now()}`;
const signature = await wallet.signMessage(message);

// 后端验证
const recoveredAddress = ethers.verifyMessage(message, signature);
if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
  throw new Error('签名无效');
}
```

### 2. 用户管理

```javascript
// 通过钱包地址创建或查找用户
async function findOrCreateUser(walletData) {
  let user = await db.users.findOne({ 
    wallet_address: walletData.address.toLowerCase() 
  });
  
  if (!user) {
    user = await db.users.create({
      uuid: generateUUID(),
      username: walletData.address,
      wallet_address: walletData.address.toLowerCase(),
      smart_account_address: walletData.smartAccountAddress?.toLowerCase(),
      email: walletData.particleEmail,
      auth_type: walletData.smartAccountAddress ? 'universalx' : 'wallet',
      created_at: new Date()
    });
    
    // 为新用户初始化 IPFS 文件夹
    await initializeUserFolders(user.wallet_address);
  }
  
  return user;
}
```

### 3. 初始化用户文件夹

创建新用户时，设置他们的 IPFS 目录结构：

```javascript
async function initializeUserFolders(walletAddress) {
  const basePath = `/${walletAddress}`;
  const folders = [
    'Desktop',     // 桌面
    'Documents',   // 文档
    'Pictures',    // 图片
    'Videos',      // 视频
    'Public',      // 公开
    'AppData',     // 应用数据
    'Trash'        // 回收站
  ];
  
  // 创建根目录
  await ipfs.files.mkdir(basePath, { parents: true });
  
  // 创建子文件夹
  for (const folder of folders) {
    await ipfs.files.mkdir(`${basePath}/${folder}`, { parents: true });
  }
}
```

### 4. 会话管理

```javascript
// 生成会话令牌
function createSession(user) {
  return jwt.sign(
    { 
      userId: user.uuid,
      wallet: user.wallet_address 
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// 验证会话令牌（中间件）
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: '未提供令牌' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: '令牌无效' });
  }
}
```

## 与现有 Particle 认证集成

前端 Particle 认证已在以下位置设置：
- `submodules/particle-auth/` - Particle SDK 集成
- `src/gui/src/UI/UIWindowParticleLogin.js` - 登录界面
- `src/backend/src/routers/auth/particle.js` - 后端端点

你们的后端只需要实现相同格式的 `/auth/particle` 端点。

## 钱包登录（你们的实现）

如果你们想添加直接钱包登录（不使用 Particle），可以：

1. 添加"连接钱包"按钮
2. 使用 ethers.js 或 viem 连接
3. 签名登录消息
4. 发送到你们的后端进行验证

```javascript
// 直接钱包登录示例
async function walletLogin() {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  
  const message = `登录 Elastos 云操作系统\n时间戳: ${Date.now()}`;
  const signature = await signer.signMessage(message);
  
  const response = await fetch('/auth/wallet', {
    method: 'POST',
    body: JSON.stringify({ address, message, signature })
  });
  
  return response.json();
}
```

这可以与现有的 Particle 认证一起工作。
