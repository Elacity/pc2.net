# ElastOS Startup Guide
# ElastOS 启动指南

---

## Quick Start / 快速开始

```bash
# 1. Clone repository / 克隆仓库
git clone [repository-url]
cd elastos

# 2. Install dependencies / 安装依赖
npm install

# 3. Build submodule (Particle Auth iframe) / 构建子模块
cd submodules/particle-auth
npm install
npm run build
cd ../..

# 4. Create .env file / 创建 .env 文件
# See docs/ENV_SETUP.md for details
# 详见 docs/ENV_SETUP.md

# 5. Start server / 启动服务器
npm run start

# 6. Open browser / 打开浏览器
# http://puter.localhost:4100
```

---

## Detailed Steps / 详细步骤

### Step 1: Prerequisites / 第一步：前置条件

Ensure you have installed / 确保已安装：
- Node.js v18+ 
- npm v9+
- Git

```bash
# Check versions / 检查版本
node --version  # Should be >= 18
npm --version   # Should be >= 9
```

### Step 2: Clone & Install / 第二步：克隆与安装

```bash
# Clone with submodules / 克隆（包含子模块）
git clone --recurse-submodules [repository-url]
cd elastos

# If already cloned, init submodules / 如果已克隆，初始化子模块
git submodule update --init --recursive

# Install main dependencies / 安装主依赖
npm install
```

### Step 3: Build Particle Auth Submodule / 第三步：构建 Particle Auth 子模块

**IMPORTANT / 重要**: This step is required for wallet login to work!  
此步骤是钱包登录正常工作所必需的！

```bash
cd submodules/particle-auth
npm install
npm run build
cd ../..
```

### Step 4: Configure Environment / 第四步：配置环境

```bash
# Create .env file / 创建 .env 文件
cat > .env << 'EOF'
PARTICLE_PROJECT_ID=your_project_id
PARTICLE_CLIENT_KEY=your_client_key
PARTICLE_APP_ID=your_app_id
EOF
```

See [docs/ENV_SETUP.md](./ENV_SETUP.md) for how to get Particle credentials.  
参见 [docs/ENV_SETUP.md](./ENV_SETUP.md) 了解如何获取 Particle 凭证。

### Step 5: Start Server / 第五步：启动服务器

```bash
# Development mode (with auto-rebuild) / 开发模式（自动重建）
npm run start

# OR Production build / 或者生产构建
npm run build
npm run start
```

### Step 6: Access Application / 第六步：访问应用

Open browser / 打开浏览器:
```
http://puter.localhost:4100
```

---

## Common Issues / 常见问题

### Issue 1: "Module not found" errors / 问题 1：模块未找到错误

```bash
# Solution / 解决方案
rm -rf node_modules
npm install
```

### Issue 2: Wallet login not appearing / 问题 2：钱包登录不出现

```bash
# Solution: Rebuild particle-auth / 解决方案：重建 particle-auth
cd submodules/particle-auth
npm run build
cd ../..
npm run build
npm run start
```

### Issue 3: Port 4100 in use / 问题 3：端口 4100 被占用

```bash
# Kill process on port 4100 / 杀死 4100 端口进程
lsof -ti :4100 | xargs kill -9

# Or use different port / 或使用不同端口
PORT=4200 npm run start
```

### Issue 4: Submodule errors / 问题 4：子模块错误

```bash
# Reset submodules / 重置子模块
git submodule deinit -f .
git submodule update --init --recursive
```

---

## Development Commands / 开发命令

```bash
# Start development server / 启动开发服务器
npm run start

# Build frontend only / 仅构建前端
npm run build

# Build backend TypeScript / 构建后端 TypeScript
npm run build:ts

# Run tests / 运行测试
npm test

# Lint code / 代码检查
npm run lint
```

---

## Testing Wallet Login / 测试钱包登录

1. Open http://puter.localhost:4100
2. Click "Get Started" or login button
3. Particle modal should appear
4. Connect with MetaMask
5. After signing, you should see the desktop

**Verify in console / 在控制台验证:**
```javascript
// Check wallet is connected / 检查钱包已连接
walletService.isConnected()  // Should return: true

// Check EOA address / 检查 EOA 地址
walletService.getEOAAddress()  // Should return: "0x..."
```

---

## File Structure Overview / 文件结构概览

```
elastos/
├── src/
│   ├── backend/           # Backend server / 后端服务器
│   └── gui/               # Frontend UI / 前端界面
│       └── src/
│           ├── services/
│           │   └── WalletService.js  ← Wallet management / 钱包管理
│           └── UI/
│               └── UIAccountSidebar.js  ← Wallet sidebar / 钱包侧边栏
├── extensions/
│   └── particle-auth/     # Auth extension / 认证扩展
├── submodules/
│   └── particle-auth/     # Particle iframe app / Particle iframe 应用
├── docs/                  # Documentation / 文档
│   ├── DEPIN_HANDOVER_GUIDE.md
│   ├── PC2_QUICK_REFERENCE.md
│   ├── PC2_ARCHITECTURE_DIAGRAMS.md
│   ├── ENV_SETUP.md
│   └── STARTUP_GUIDE.md   # This file / 本文件
└── package.json
```

---

## Support / 支持

If you encounter issues not covered here:  
如果遇到未涵盖的问题：

1. Check browser console for errors / 检查浏览器控制台错误
2. Check terminal for server errors / 检查终端服务器错误
3. Review documentation in `docs/` folder / 查看 `docs/` 文件夹中的文档

