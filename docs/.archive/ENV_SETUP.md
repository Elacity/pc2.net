# Environment Setup Guide
# 环境配置指南

---

## Quick Setup (Recommended) / 快速设置（推荐）

The Particle credentials are **already configured** for the pc2.net project.  
pc2.net 项目的 Particle 凭证**已配置好**。

Create file `submodules/particle-auth/.env` with:  
创建文件 `submodules/particle-auth/.env`：

```bash
VITE_PARTICLE_PROJECT_ID=01cdbdd6-b07e-45b5-81ca-7036e45dff0d
VITE_PARTICLE_CLIENT_KEY=cMSSRMUCgciyuStuvPg2FSLKSovXDmrbvknJJnLU
VITE_PARTICLE_APP_ID=1567a90d-9ff3-459a-bca8-d264685482cb
VITE_WALLETCONNECT_PROJECT_ID=1bdbe1354abcf233007b7ce4f2b91886
VITE_PUTER_API_URL=http://api.puter.localhost:4100
```

**One-liner to create the file / 一行命令创建文件:**
```bash
cat > submodules/particle-auth/.env << 'EOF'
VITE_PARTICLE_PROJECT_ID=01cdbdd6-b07e-45b5-81ca-7036e45dff0d
VITE_PARTICLE_CLIENT_KEY=cMSSRMUCgciyuStuvPg2FSLKSovXDmrbvknJJnLU
VITE_PARTICLE_APP_ID=1567a90d-9ff3-459a-bca8-d264685482cb
VITE_WALLETCONNECT_PROJECT_ID=1bdbe1354abcf233007b7ce4f2b91886
VITE_PUTER_API_URL=http://api.puter.localhost:4100
EOF
```

---

## Alternative: Create Your Own Project / 替代方案：创建自己的项目

If you want your own Particle project:  
如果您想要自己的 Particle 项目：

1. **Go to Particle Dashboard / 访问 Particle 仪表板**
   - URL: https://dashboard.particle.network/

2. **Create Account / 创建账户**
   - Sign up with email / 用邮箱注册

3. **Create New Project / 创建新项目**
   - Click "Create Project" / 点击"创建项目"
   - Enter project name / 输入项目名称

4. **Get Credentials / 获取凭证**
   - Go to Project Settings → API Keys
   - 进入项目设置 → API 密钥
   - Copy the values to your `.env` file

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

