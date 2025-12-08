# PC2 Quick Reference Card
# PC2 快速参考卡

---

## Get User's Identity / 获取用户身份

```javascript
// This is the ONLY identity you need for PC2
// 这是 PC2 唯一需要的身份

const userEOA = walletService.getEOAAddress();
// Returns: "0x34DAF31B99B5A59cEB18E424Dbc112FA6e5f3Dc3"
```

---

## User Authentication Flow / 用户认证流程

```
Browser                          Hardware Box
浏览器                            硬件盒子
   │                                 │
   │ ① GET /challenge                │
   │ ─────────────────────────────── │
   │                                 │
   │ ② { challenge: "abc123" }       │
   │ ◄─────────────────────────────  │
   │                                 │
   │ ③ User signs with wallet        │
   │    用户用钱包签名                │
   │                                 │
   │ ④ POST /verify                  │
   │    { signature, challenge }     │
   │ ─────────────────────────────── │
   │                                 │
   │ ⑤ { token: "jwt..." }           │
   │ ◄─────────────────────────────  │
   │                                 │
```

---

## Extension Structure / 扩展结构

```
extensions/pc2-cloud/
├── main.js              ← Entry point / 入口
├── drivers/
│   └── PC2CloudDriver.js ← Core logic / 核心逻辑
├── services/
│   └── PC2Service.js
└── package.json
```

---

## Key Extension Events / 关键扩展事件

```javascript
extension.on('init', async () => { /* 初始化 */ });
extension.on('create.interfaces', (e) => { /* 创建接口 */ });
extension.on('create.drivers', (e) => { /* 创建驱动 */ });
extension.on('ready', () => { /* 就绪 */ });
```

---

## WalletService API / 钱包服务 API

| Method | Returns | Description |
|--------|---------|-------------|
| `getEOAAddress()` | `"0x..."` | User's identity / 用户身份 |
| `isConnected()` | `boolean` | Login status / 登录状态 |
| `subscribe(fn)` | `unsubscribe` | Listen changes / 监听变化 |
| `getData()` | `object` | All wallet data / 所有数据 |

---

## Important Files / 重要文件

| File | Purpose |
|------|---------|
| `src/gui/src/services/WalletService.js` | User identity source / 用户身份来源 |
| `extensions/particle-auth/main.js` | Extension example / 扩展示例 |
| `src/backend/src/routers/auth/particle.js` | Auth API / 认证 API |

---

## DO / 应该做

✅ Use `walletService.getEOAAddress()` for user identity  
✅ Follow particle-auth extension pattern  
✅ Verify EOA ownership via signature  
✅ 使用 `walletService.getEOAAddress()` 获取用户身份  
✅ 遵循 particle-auth 扩展模式  
✅ 通过签名验证 EOA 所有权  

---

## DON'T / 不应该做

❌ Use Smart Account address for PC2  
❌ Store private keys  
❌ Skip signature verification  
❌ 使用 Smart Account 地址连接 PC2  
❌ 存储私钥  
❌ 跳过签名验证  

---

## Testing Commands / 测试命令

```javascript
// In browser console / 在浏览器控制台

// Check login / 检查登录
walletService.isConnected()

// Get EOA / 获取 EOA
walletService.getEOAAddress()

// Watch changes / 监听变化
walletService.subscribe(d => console.log(d))
```

---

## Contact / 联系

Full documentation: `docs/DEPIN_HANDOVER_GUIDE.md`  
完整文档：`docs/DEPIN_HANDOVER_GUIDE.md`

