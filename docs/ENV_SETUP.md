# Environment Setup Guide
# 环境配置指南

---

## Required Environment Variables / 必需的环境变量

Create a `.env` file in the project root with:  
在项目根目录创建 `.env` 文件：

```bash
# ═══════════════════════════════════════════════════════════════════════════
# Particle Network Configuration (Required for wallet login)
# Particle Network 配置（钱包登录必需）
# ═══════════════════════════════════════════════════════════════════════════

PARTICLE_PROJECT_ID=your_project_id_here
PARTICLE_CLIENT_KEY=your_client_key_here
PARTICLE_APP_ID=your_app_id_here
```

---

## How to Get Particle Credentials / 如何获取 Particle 凭证

1. **Go to Particle Dashboard / 访问 Particle 仪表板**
   - URL: https://dashboard.particle.network/

2. **Create Account / 创建账户**
   - Sign up with email / 用邮箱注册

3. **Create New Project / 创建新项目**
   - Click "Create Project" / 点击"创建项目"
   - Enter project name: "ElastOS" / 输入项目名称: "ElastOS"

4. **Get Credentials / 获取凭证**
   - Go to Project Settings → API Keys
   - 进入项目设置 → API 密钥
   - Copy:
     - `Project ID` → `PARTICLE_PROJECT_ID`
     - `Client Key` → `PARTICLE_CLIENT_KEY`
     - `App ID` → `PARTICLE_APP_ID`

---

## Current Login Support / 当前登录支持

| Method | Status | 状态 |
|--------|--------|------|
| MetaMask | ✅ Working | ✅ 可用 |
| WalletConnect | ✅ Working | ✅ 可用 |
| Coinbase Wallet | ✅ Working | ✅ 可用 |
| Google Login | ⚠️ Not configured | ⚠️ 未配置 |
| Twitter Login | ⚠️ Not configured | ⚠️ 未配置 |
| Email Login | ⚠️ Not configured | ⚠️ 未配置 |

**Note / 注意**: Social logins require additional OAuth setup in Particle Dashboard.  
社交登录需要在 Particle 仪表板中进行额外的 OAuth 设置。

---

## Example .env File / 示例 .env 文件

```bash
# Particle Network (REQUIRED / 必需)
PARTICLE_PROJECT_ID=abc123def456
PARTICLE_CLIENT_KEY=cK1234567890abcdef
PARTICLE_APP_ID=app-12345678

# Server (OPTIONAL / 可选)
PORT=4100
NODE_ENV=development
```

---

## Verification / 验证

After setting up `.env`, start the server and check:  
设置 `.env` 后，启动服务器并检查：

```bash
npm run start
```

Open browser console and verify:  
打开浏览器控制台验证：

```javascript
// Should show Particle config loaded
// 应该显示 Particle 配置已加载
```

If you see wallet login modal, configuration is correct!  
如果看到钱包登录弹窗，配置正确！

