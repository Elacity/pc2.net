# ElastOS PC2 Integration Handover Guide
# ElastOS PC2 集成交接指南

> **Version / 版本**: 1.0.0  
> **Date / 日期**: December 2024  
> **For / 适用于**: DePin Engineering Team / DePin 工程团队

---

## Table of Contents / 目录

1. [Executive Summary / 执行摘要](#1-executive-summary--执行摘要)
2. [Architecture Overview / 架构概述](#2-architecture-overview--架构概述)
3. [User Identity System / 用户身份系统](#3-user-identity-system--用户身份系统)
4. [Extension System Guide / 扩展系统指南](#4-extension-system-guide--扩展系统指南)
5. [Key Code Locations / 关键代码位置](#5-key-code-locations--关键代码位置)
6. [API Reference / API 参考](#6-api-reference--api-参考)
7. [PC2 Extension Template / PC2 扩展模板](#7-pc2-extension-template--pc2-扩展模板)
8. [Integration Steps / 集成步骤](#8-integration-steps--集成步骤)
9. [Testing Guide / 测试指南](#9-testing-guide--测试指南)
10. [FAQ / 常见问题](#10-faq--常见问题)

---

## 1. Executive Summary / 执行摘要

### English

This document provides everything the DePin team needs to integrate the PC2 (Personal Cloud Compute) module with ElastOS. The wallet authentication system is complete and working. Users log in with their crypto wallet, and their **EOA address (0x...)** becomes their identity for connecting to their personal hardware box.

**Key Points:**
- User identity = EOA wallet address (e.g., `0x34DAF31B99B5A59cEB18E424Dbc112FA6e5f3Dc3`)
- NOT the Smart Account address - use EOA for personal cloud connection
- The Puter extension system is ready for the PC2 module
- All wallet functionality is complete and tested

### 中文

本文档提供了 DePin 团队将 PC2（个人云计算）模块与 ElastOS 集成所需的所有信息。钱包认证系统已完成并正常工作。用户使用加密钱包登录，其 **EOA 地址（0x...）** 将成为连接个人硬件盒子的身份标识。

**关键点：**
- 用户身份 = EOA 钱包地址（例如：`0x34DAF31B99B5A59cEB18E424Dbc112FA6e5f3Dc3`）
- 不是 Smart Account 地址 - 使用 EOA 连接个人云
- Puter 扩展系统已为 PC2 模块准备就绪
- 所有钱包功能已完成并经过测试

---

## 2. Architecture Overview / 架构概述

### Current System Architecture / 当前系统架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                         ELASTOS BROWSER UI                              │
│                         ElastOS 浏览器界面                               │
│                                                                         │
│   ┌───────────────────────────────────────────────────────────────┐    │
│   │                                                               │    │
│   │   ┌─────────────────┐         ┌─────────────────┐            │    │
│   │   │  Particle Auth  │         │  WalletService  │            │    │
│   │   │  Extension      │────────>│                 │            │    │
│   │   │  粒子认证扩展    │         │  钱包服务        │            │    │
│   │   │                 │         │                 │            │    │
│   │   │  • Social Login │         │  • EOA Address  │◄─── USE THIS    │
│   │   │  • Wallet Login │         │  • Tokens       │     使用这个     │
│   │   │                 │         │  • Transactions │            │    │
│   │   └─────────────────┘         └─────────────────┘            │    │
│   │                                                               │    │
│   └───────────────────────────────────────────────────────────────┘    │
│                                                                         │
│                                    │                                    │
│                                    │ User's EOA Address                 │
│                                    │ 用户的 EOA 地址                     │
│                                    ▼                                    │
│                                                                         │
│   ┌───────────────────────────────────────────────────────────────┐    │
│   │                      PC2 MODULE (TO BUILD)                    │    │
│   │                      PC2 模块（待构建）                         │    │
│   │                                                               │    │
│   │   Connect user's EOA to their personal hardware box           │    │
│   │   将用户的 EOA 连接到其个人硬件盒子                              │    │
│   └───────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ Secure Connection
                                     │ 安全连接
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                    PERSONAL HARDWARE BOX / VPS                          │
│                    个人硬件盒子 / VPS                                    │
│                                                                         │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│   │   Storage    │  │   Compute    │  │  Networking  │                 │
│   │   Node       │  │   Node       │  │   Node       │                 │
│   │   存储节点    │  │   计算节点    │  │   网络节点    │                 │
│   └──────────────┘  └──────────────┘  └──────────────┘                 │
│                                                                         │
│   Owner Identity: User's EOA Address                                    │
│   所有者身份：用户的 EOA 地址                                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow / 数据流

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  User   │     │  Particle   │     │   Wallet    │     │   Hardware   │
│  用户   │     │   Auth      │     │   Service   │     │     Box      │
└────┬────┘     └──────┬──────┘     └──────┬──────┘     └──────┬───────┘
     │                 │                   │                   │
     │  1. Login       │                   │                   │
     │  登录           │                   │                   │
     │────────────────>│                   │                   │
     │                 │                   │                   │
     │  2. Sign with   │                   │                   │
     │     Wallet      │                   │                   │
     │  用钱包签名      │                   │                   │
     │<────────────────│                   │                   │
     │                 │                   │                   │
     │                 │  3. Store EOA     │                   │
     │                 │  存储 EOA         │                   │
     │                 │──────────────────>│                   │
     │                 │                   │                   │
     │                 │                   │  4. Connect with  │
     │                 │                   │     EOA identity  │
     │                 │                   │  用 EOA 身份连接   │
     │                 │                   │──────────────────>│
     │                 │                   │                   │
     │                 │                   │  5. Verify &      │
     │                 │                   │     Accept        │
     │                 │                   │  验证并接受        │
     │                 │                   │<──────────────────│
     │                 │                   │                   │
     │  6. Connected to Personal Cloud    │                   │
     │  已连接到个人云                      │                   │
     │<────────────────────────────────────│                   │
     │                 │                   │                   │
```

---

## 3. User Identity System / 用户身份系统

### Understanding EOA vs Smart Account / 理解 EOA 与 Smart Account

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   IMPORTANT: Use EOA Address for Personal Cloud Connection              │
│   重要：使用 EOA 地址连接个人云                                          │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   EOA (Externally Owned Account) ✅ USE THIS                            │
│   EOA（外部拥有账户）✅ 使用这个                                         │
│   ─────────────────────────────────                                     │
│   • Address: 0x34DAF31B99B5A59cEB18E424Dbc112FA6e5f3Dc3                 │
│   • Controlled by user's private key                                    │
│   • 由用户私钥控制                                                       │
│   • Same address on ALL blockchains                                     │
│   • 在所有区块链上地址相同                                               │
│   • Perfect for personal cloud identity                                 │
│   • 非常适合作为个人云身份                                               │
│                                                                         │
│   Smart Account (Universal Account) ❌ DO NOT USE FOR PC2               │
│   智能账户（通用账户）❌ 不要用于 PC2                                     │
│   ───────────────────────────────────────                               │
│   • Address: 0x7Efe9dd20dAB98e28b0116aE83c9799eA653B8C5                 │
│   • Only for multi-chain token operations                               │
│   • 仅用于多链代币操作                                                   │
│   • Different address per chain                                         │
│   • 每条链地址不同                                                       │
│   • NOT suitable for identity                                           │
│   • 不适合作为身份标识                                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### How to Get User's EOA Address / 如何获取用户的 EOA 地址

```javascript
// ═══════════════════════════════════════════════════════════════════════
// METHOD 1: From WalletService (Recommended)
// 方法 1：从 WalletService 获取（推荐）
// ═══════════════════════════════════════════════════════════════════════

import walletService from './services/WalletService.js';

// Get EOA address - this is the user's identity for personal cloud
// 获取 EOA 地址 - 这是用户连接个人云的身份
const userEOA = walletService.getEOAAddress();
// Returns: "0x34DAF31B99B5A59cEB18E424Dbc112FA6e5f3Dc3"

// ═══════════════════════════════════════════════════════════════════════
// METHOD 2: From window.user (After login)
// 方法 2：从 window.user 获取（登录后）
// ═══════════════════════════════════════════════════════════════════════

const userEOA = window.user?.wallet_address;
// Returns: "0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3"

// ═══════════════════════════════════════════════════════════════════════
// METHOD 3: Listen for wallet changes
// 方法 3：监听钱包变化
// ═══════════════════════════════════════════════════════════════════════

walletService.subscribe((data) => {
    // Called when wallet state changes
    // 当钱包状态变化时调用
    const currentEOA = walletService.getEOAAddress();
    console.log('User EOA:', currentEOA);
    
    // Reconnect to personal cloud with new identity if changed
    // 如果身份变化，重新连接到个人云
});
```

### Identity Verification Flow / 身份验证流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   HOW TO VERIFY USER OWNS THE EOA ADDRESS                               │
│   如何验证用户拥有该 EOA 地址                                            │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Browser (浏览器)              Hardware Box (硬件盒子)                  │
│        │                              │                                 │
│        │  1. Request challenge        │                                 │
│        │     请求挑战                  │                                 │
│        │  { eoa: "0x34DA..." }        │                                 │
│        │ ─────────────────────────────>                                 │
│        │                              │                                 │
│        │  2. Return challenge         │                                 │
│        │     返回挑战                  │                                 │
│        │  { challenge: "abc123...",   │                                 │
│        │    timestamp: 1702... }      │                                 │
│        │ <─────────────────────────────                                 │
│        │                              │                                 │
│        │  3. User signs with wallet   │                                 │
│        │     用户用钱包签名            │                                 │
│        │  (MetaMask/Particle popup)   │                                 │
│        │                              │                                 │
│        │  4. Send signature           │                                 │
│        │     发送签名                  │                                 │
│        │  { signature: "0x...",       │                                 │
│        │    challenge: "abc123..." }  │                                 │
│        │ ─────────────────────────────>                                 │
│        │                              │                                 │
│        │                              │  5. Verify signature            │
│        │                              │     验证签名                     │
│        │                              │     recoveredAddress == eoa?    │
│        │                              │                                 │
│        │  6. Return session token     │                                 │
│        │     返回会话令牌              │                                 │
│        │  { token: "jwt...",          │                                 │
│        │    expires: 1702... }        │                                 │
│        │ <─────────────────────────────                                 │
│        │                              │                                 │
│        │  7. All future requests use  │                                 │
│        │     token for auth           │                                 │
│        │     后续请求使用令牌认证       │                                 │
│        │                              │                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Extension System Guide / 扩展系统指南

### Extension Directory Structure / 扩展目录结构

```
extensions/
│
├── particle-auth/              ← EXISTING (Reference)
│   │                             已存在（参考）
│   ├── main.js                 # Extension entry point / 扩展入口
│   ├── drivers/
│   │   └── ParticleAuthDriver.js
│   ├── services/
│   │   ├── ParticleAuthService.js
│   │   └── ParticleAuthGUIService.js
│   ├── routes/
│   │   └── particle.js
│   └── package.json
│
├── ipfs-storage/               ← REFERENCE ONLY (Not for production)
│   │                             仅供参考（非生产用）
│   └── ...
│
└── pc2-cloud/                  ← TO BE CREATED BY DEPIN TEAM
                                  由 DePin 团队创建
    ├── main.js                 # Extension entry point / 扩展入口
    ├── drivers/
    │   ├── PC2CloudDriver.js   # Cloud connection / 云连接
    │   └── PC2StorageDriver.js # Storage replacement / 存储替换
    ├── services/
    │   └── PC2Service.js       # Communication service / 通信服务
    ├── routes/
    │   └── pc2.js              # API routes / API 路由
    └── package.json
```

### Extension Lifecycle Events / 扩展生命周期事件

```javascript
// ═══════════════════════════════════════════════════════════════════════
// Extension Lifecycle / 扩展生命周期
// ═══════════════════════════════════════════════════════════════════════

// 1. Pre-initialization / 预初始化
extension.on('preinit', event => {
    // Called before extension starts
    // 在扩展启动前调用
    extension.log.info('Pre-init...');
});

// 2. Initialization / 初始化
extension.on('init', async event => {
    // Main initialization
    // 主要初始化
    extension.log.info('Initializing...');
    
    // Access configuration
    // 访问配置
    const config = extension.config;
});

// 3. Create Interfaces / 创建接口
extension.on('create.interfaces', event => {
    // Define what your extension provides
    // 定义扩展提供的功能
    event.createInterface('cloud', {
        description: 'Personal Cloud interface',
        methods: {
            connect: { /* ... */ },
            store: { /* ... */ },
            compute: { /* ... */ }
        }
    });
});

// 4. Create Drivers / 创建驱动
extension.on('create.drivers', event => {
    // Register implementations
    // 注册实现
    event.createDriver('cloud', 'pc2', new PC2CloudDriver());
});

// 5. Create Permissions / 创建权限
extension.on('create.permissions', event => {
    // Grant access
    // 授予访问权限
    event.grant_to_everyone('service:pc2:ii:cloud');
});

// 6. Ready / 就绪
extension.on('ready', event => {
    // Extension is fully loaded
    // 扩展已完全加载
    extension.log.info('Extension ready!');
});
```

---

## 5. Key Code Locations / 关键代码位置

### Files You Must Understand / 必须理解的文件

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CRITICAL FILES / 关键文件                                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ src/gui/src/services/WalletService.js                                  │
│ ─────────────────────────────────────                                   │
│ • Core wallet management / 核心钱包管理                                  │
│ • getEOAAddress() - Returns user's identity / 返回用户身份              │
│ • subscribe() - Listen for changes / 监听变化                           │
│ • 1537 lines                                                           │
│                                                                         │
│ extensions/particle-auth/main.js                                        │
│ ────────────────────────────────                                        │
│ • Example extension structure / 扩展结构示例                             │
│ • Follow this pattern for PC2 / PC2 按此模式开发                        │
│ • 98 lines                                                              │
│                                                                         │
│ src/backend/src/routers/auth/particle.js                               │
│ ─────────────────────────────────────────                               │
│ • Authentication API routes / 认证 API 路由                             │
│ • How user data is stored after login / 登录后用户数据如何存储           │
│ • 109 lines                                                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ REFERENCE FILES (Read for patterns) / 参考文件（阅读以了解模式）          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ src/gui/src/UI/UIAccountSidebar.js                                     │
│ • Wallet UI sidebar / 钱包 UI 侧边栏                                    │
│ • How to display wallet info / 如何显示钱包信息                          │
│                                                                         │
│ src/gui/src/helpers/particle-constants.js                              │
│ • Chain and token configurations / 链和代币配置                         │
│                                                                         │
│ src/gui/src/helpers/wallet.js                                          │
│ • Utility functions / 工具函数                                          │
│                                                                         │
│ extensions/ipfs-storage/                                                │
│ • Storage extension example / 存储扩展示例                              │
│ • Reference for PC2 storage driver / PC2 存储驱动参考                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### WalletService API Reference / WalletService API 参考

```javascript
// ═══════════════════════════════════════════════════════════════════════
// WalletService Methods / WalletService 方法
// Location / 位置: src/gui/src/services/WalletService.js
// ═══════════════════════════════════════════════════════════════════════

import walletService from './services/WalletService.js';

// ─────────────────────────────────────────────────────────────────────
// Identity Methods / 身份方法
// ─────────────────────────────────────────────────────────────────────

// Get user's EOA address (USE THIS FOR PC2)
// 获取用户的 EOA 地址（用于 PC2）
walletService.getEOAAddress()
// Returns: "0x34DAF31B99B5A59cEB18E424Dbc112FA6e5f3Dc3" | null

// Get Smart Account address (for multi-chain tokens only)
// 获取智能账户地址（仅用于多链代币）
walletService.getSmartAccountAddress()
// Returns: "0x7Efe9dd20dAB98e28b0116aE83c9799eA653B8C5" | null

// Get currently active address based on mode
// 获取当前模式下的活动地址
walletService.getAddress()
// Returns: EOA or Smart Account depending on mode

// ─────────────────────────────────────────────────────────────────────
// Connection Methods / 连接方法
// ─────────────────────────────────────────────────────────────────────

// Check if wallet is connected
// 检查钱包是否已连接
walletService.isConnected()
// Returns: true | false

// Get current wallet mode
// 获取当前钱包模式
walletService.getMode()
// Returns: "universal" | "elastos"

// ─────────────────────────────────────────────────────────────────────
// Event Subscription / 事件订阅
// ─────────────────────────────────────────────────────────────────────

// Subscribe to wallet changes
// 订阅钱包变化
const unsubscribe = walletService.subscribe((data) => {
    console.log('Wallet data updated:', data);
    // data.tokens - Token list / 代币列表
    // data.totalBalance - Total balance / 总余额
    // data.address - Current address / 当前地址
    // data.mode - Current mode / 当前模式
});

// Unsubscribe when done
// 完成后取消订阅
unsubscribe();

// ─────────────────────────────────────────────────────────────────────
// Data Methods / 数据方法
// ─────────────────────────────────────────────────────────────────────

// Get all wallet data
// 获取所有钱包数据
walletService.getData()
// Returns: { tokens, totalBalance, transactions, ... }

// Get token list
// 获取代币列表
walletService.getTokens()
// Returns: [{ symbol, balance, network, ... }, ...]

// Refresh token balances
// 刷新代币余额
await walletService.refreshTokens()
```

---

## 6. API Reference / API 参考

### Backend Authentication Routes / 后端认证路由

```
┌─────────────────────────────────────────────────────────────────────────┐
│ EXISTING AUTH ROUTES / 现有认证路由                                      │
│ Location / 位置: src/backend/src/routers/auth/particle.js              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ POST /auth/particle                                                     │
│ ────────────────────                                                    │
│ Description: Authenticate user with wallet signature                    │
│ 描述：使用钱包签名认证用户                                               │
│                                                                         │
│ Request Body:                                                           │
│ {                                                                       │
│   "wallet_address": "0x34DAF31B99B5A59cEB18E424Dbc112FA6e5f3Dc3",      │
│   "signature": "0x...",                                                 │
│   "message": "Sign in to ElastOS: ...",                                │
│   "smart_account_address": "0x7Efe..." (optional)                      │
│ }                                                                       │
│                                                                         │
│ Response:                                                               │
│ {                                                                       │
│   "token": "jwt_token...",                                             │
│   "user": {                                                            │
│     "wallet_address": "0x34DA...",                                     │
│     "smart_account_address": "0x7Efe...",                              │
│     "username": "0x34da..."                                            │
│   }                                                                     │
│ }                                                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Suggested PC2 API Routes / 建议的 PC2 API 路由

```
┌─────────────────────────────────────────────────────────────────────────┐
│ SUGGESTED PC2 ROUTES / 建议的 PC2 路由                                  │
│ To be created in: extensions/pc2-cloud/routes/pc2.js                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ POST /pc2/discover                                                      │
│ ──────────────────                                                      │
│ Description: Find user's hardware box                                   │
│ 描述：查找用户的硬件盒子                                                 │
│                                                                         │
│ Request: { "eoa_address": "0x34DA..." }                                │
│ Response: { "box_endpoint": "https://box.user.elastos.io",             │
│             "status": "online" }                                        │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│ POST /pc2/connect                                                       │
│ ─────────────────                                                       │
│ Description: Establish connection to hardware box                       │
│ 描述：建立与硬件盒子的连接                                               │
│                                                                         │
│ Request: { "eoa_address": "0x34DA...",                                 │
│            "box_endpoint": "https://...",                              │
│            "signature": "0x..." }                                       │
│ Response: { "session_token": "...", "expires": 1702... }               │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│ POST /pc2/storage/write                                                 │
│ ───────────────────────                                                 │
│ Description: Store file on personal cloud                               │
│ 描述：在个人云上存储文件                                                 │
│                                                                         │
│ Headers: { "Authorization": "Bearer session_token" }                   │
│ Request: { "path": "/documents/file.txt", "data": "..." }              │
│ Response: { "success": true, "hash": "..." }                           │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│ GET /pc2/storage/read                                                   │
│ ──────────────────────                                                  │
│ Description: Read file from personal cloud                              │
│ 描述：从个人云读取文件                                                   │
│                                                                         │
│ Headers: { "Authorization": "Bearer session_token" }                   │
│ Query: ?path=/documents/file.txt                                       │
│ Response: { "data": "...", "metadata": {...} }                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. PC2 Extension Template / PC2 扩展模板

### Complete Extension Template / 完整扩展模板

```javascript
// ═══════════════════════════════════════════════════════════════════════
// FILE: extensions/pc2-cloud/main.js
// PC2 Personal Cloud Compute Extension
// PC2 个人云计算扩展
// ═══════════════════════════════════════════════════════════════════════

const PC2CloudDriver = require('./drivers/PC2CloudDriver');
const PC2StorageDriver = require('./drivers/PC2StorageDriver');

// ─────────────────────────────────────────────────────────────────────
// Pre-initialization / 预初始化
// ─────────────────────────────────────────────────────────────────────
extension.on('preinit', event => {
    extension.log.info('[PC2]: Pre-initialization started');
    extension.log.info('[PC2]: 预初始化开始');
});

// ─────────────────────────────────────────────────────────────────────
// Initialization / 初始化
// ─────────────────────────────────────────────────────────────────────
extension.on('init', async event => {
    extension.log.info('[PC2]: Initializing Personal Cloud Compute module');
    extension.log.info('[PC2]: 正在初始化个人云计算模块');
    
    // Load configuration / 加载配置
    const config = extension.config || {};
    extension.log.info('[PC2]: Configuration loaded', {
        hasDiscoveryServer: !!config.discovery_server,
    });
});

// ─────────────────────────────────────────────────────────────────────
// Create Interfaces / 创建接口
// ─────────────────────────────────────────────────────────────────────
extension.on('create.interfaces', event => {
    extension.log.info('[PC2]: Creating cloud interface');
    extension.log.info('[PC2]: 正在创建云接口');
    
    event.createInterface('cloud', {
        description: 'Personal Cloud Compute interface / 个人云计算接口',
        methods: {
            // ─────────────────────────────────────────────────────────
            // Discover user's hardware box
            // 发现用户的硬件盒子
            // ─────────────────────────────────────────────────────────
            discover: {
                description: 'Find hardware box for EOA address / 为 EOA 地址查找硬件盒子',
                parameters: {
                    eoa_address: { 
                        type: 'string', 
                        description: 'User EOA address (0x...) / 用户 EOA 地址' 
                    }
                }
            },
            
            // ─────────────────────────────────────────────────────────
            // Connect to hardware box
            // 连接到硬件盒子
            // ─────────────────────────────────────────────────────────
            connect: {
                description: 'Connect to personal hardware box / 连接到个人硬件盒子',
                parameters: {
                    eoa_address: { 
                        type: 'string', 
                        description: 'User EOA address / 用户 EOA 地址' 
                    },
                    box_endpoint: { 
                        type: 'string', 
                        description: 'Hardware box URL / 硬件盒子地址' 
                    },
                    signature: { 
                        type: 'string', 
                        description: 'Signed challenge / 签名的挑战' 
                    }
                }
            },
            
            // ─────────────────────────────────────────────────────────
            // Storage operations
            // 存储操作
            // ─────────────────────────────────────────────────────────
            store: {
                description: 'Store data on personal cloud / 在个人云上存储数据',
                parameters: {
                    path: { type: 'string', description: 'File path / 文件路径' },
                    data: { type: 'buffer', description: 'File data / 文件数据' }
                }
            },
            
            retrieve: {
                description: 'Retrieve data from personal cloud / 从个人云获取数据',
                parameters: {
                    path: { type: 'string', description: 'File path / 文件路径' }
                }
            },
            
            // ─────────────────────────────────────────────────────────
            // Compute operations
            // 计算操作
            // ─────────────────────────────────────────────────────────
            compute: {
                description: 'Execute task on personal hardware / 在个人硬件上执行任务',
                parameters: {
                    task: { type: 'object', description: 'Task definition / 任务定义' }
                }
            }
        }
    });
});

// ─────────────────────────────────────────────────────────────────────
// Create Drivers / 创建驱动
// ─────────────────────────────────────────────────────────────────────
extension.on('create.drivers', event => {
    extension.log.info('[PC2]: Registering PC2 drivers');
    extension.log.info('[PC2]: 正在注册 PC2 驱动');
    
    // Cloud connection driver / 云连接驱动
    event.createDriver('cloud', 'pc2', new PC2CloudDriver());
    
    // Storage driver (replaces centralized storage)
    // 存储驱动（替换中心化存储）
    event.createDriver('storage', 'pc2', new PC2StorageDriver());
});

// ─────────────────────────────────────────────────────────────────────
// Create Permissions / 创建权限
// ─────────────────────────────────────────────────────────────────────
extension.on('create.permissions', event => {
    extension.log.info('[PC2]: Setting up permissions');
    extension.log.info('[PC2]: 正在设置权限');
    
    // Allow all authenticated users to access PC2
    // 允许所有认证用户访问 PC2
    event.grant_to_everyone('service:pc2:ii:cloud');
    event.grant_to_everyone('service:pc2:ii:storage');
});

// ─────────────────────────────────────────────────────────────────────
// Extension Ready / 扩展就绪
// ─────────────────────────────────────────────────────────────────────
extension.on('ready', event => {
    extension.log.info('[PC2]: Personal Cloud Compute extension ready ✓');
    extension.log.info('[PC2]: 个人云计算扩展已就绪 ✓');
});
```

### PC2 Cloud Driver Template / PC2 云驱动模板

```javascript
// ═══════════════════════════════════════════════════════════════════════
// FILE: extensions/pc2-cloud/drivers/PC2CloudDriver.js
// PC2 Cloud Connection Driver
// PC2 云连接驱动
// ═══════════════════════════════════════════════════════════════════════

class PC2CloudDriver {
    constructor() {
        this.sessions = new Map(); // EOA -> session
    }
    
    // ─────────────────────────────────────────────────────────────────
    // Discover hardware box for user's EOA
    // 为用户的 EOA 发现硬件盒子
    // ─────────────────────────────────────────────────────────────────
    async discover({ eoa_address }) {
        // TODO: Implement discovery logic
        // TODO: 实现发现逻辑
        
        // Option 1: Query discovery server
        // 选项 1：查询发现服务器
        // const response = await fetch(`${DISCOVERY_SERVER}/lookup/${eoa_address}`);
        
        // Option 2: DNS-based discovery
        // 选项 2：基于 DNS 的发现
        // const endpoint = `https://${eoa_address.slice(2, 10)}.elastos.cloud`;
        
        return {
            box_endpoint: 'https://user-box.elastos.io',
            status: 'online',
            capabilities: ['storage', 'compute', 'networking']
        };
    }
    
    // ─────────────────────────────────────────────────────────────────
    // Connect to user's hardware box
    // 连接到用户的硬件盒子
    // ─────────────────────────────────────────────────────────────────
    async connect({ eoa_address, box_endpoint, signature }) {
        // Step 1: Verify signature proves ownership of EOA
        // 步骤 1：验证签名证明对 EOA 的所有权
        const isValid = await this._verifySignature(eoa_address, signature);
        if (!isValid) {
            throw new Error('Invalid signature / 签名无效');
        }
        
        // Step 2: Establish connection to hardware box
        // 步骤 2：建立与硬件盒子的连接
        const response = await fetch(`${box_endpoint}/auth/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                eoa_address,
                signature,
                timestamp: Date.now()
            })
        });
        
        const session = await response.json();
        
        // Step 3: Store session
        // 步骤 3：存储会话
        this.sessions.set(eoa_address, {
            token: session.token,
            endpoint: box_endpoint,
            expires: session.expires
        });
        
        return session;
    }
    
    // ─────────────────────────────────────────────────────────────────
    // Store data on personal cloud
    // 在个人云上存储数据
    // ─────────────────────────────────────────────────────────────────
    async store({ path, data }, { eoa_address }) {
        const session = this._getSession(eoa_address);
        
        const response = await fetch(`${session.endpoint}/storage/write`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.token}`,
                'Content-Type': 'application/octet-stream',
                'X-File-Path': path
            },
            body: data
        });
        
        return response.json();
    }
    
    // ─────────────────────────────────────────────────────────────────
    // Retrieve data from personal cloud
    // 从个人云获取数据
    // ─────────────────────────────────────────────────────────────────
    async retrieve({ path }, { eoa_address }) {
        const session = this._getSession(eoa_address);
        
        const response = await fetch(`${session.endpoint}/storage/read?path=${encodeURIComponent(path)}`, {
            headers: {
                'Authorization': `Bearer ${session.token}`
            }
        });
        
        return response.arrayBuffer();
    }
    
    // ─────────────────────────────────────────────────────────────────
    // Execute compute task
    // 执行计算任务
    // ─────────────────────────────────────────────────────────────────
    async compute({ task }, { eoa_address }) {
        const session = this._getSession(eoa_address);
        
        const response = await fetch(`${session.endpoint}/compute/execute`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(task)
        });
        
        return response.json();
    }
    
    // ─────────────────────────────────────────────────────────────────
    // Helper: Get session for EOA
    // 辅助方法：获取 EOA 的会话
    // ─────────────────────────────────────────────────────────────────
    _getSession(eoa_address) {
        const session = this.sessions.get(eoa_address);
        if (!session) {
            throw new Error('Not connected. Call connect() first / 未连接，请先调用 connect()');
        }
        if (Date.now() > session.expires) {
            this.sessions.delete(eoa_address);
            throw new Error('Session expired. Reconnect required / 会话已过期，需要重新连接');
        }
        return session;
    }
    
    // ─────────────────────────────────────────────────────────────────
    // Helper: Verify EOA signature
    // 辅助方法：验证 EOA 签名
    // ─────────────────────────────────────────────────────────────────
    async _verifySignature(eoa_address, signature) {
        // TODO: Implement signature verification
        // TODO: 实现签名验证
        // Use ethers.js or web3.js to recover address from signature
        // 使用 ethers.js 或 web3.js 从签名恢复地址
        return true;
    }
}

module.exports = PC2CloudDriver;
```

---

## 8. Integration Steps / 集成步骤

### Step-by-Step Guide / 分步指南

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Setup & Understanding / 第一阶段：设置与理解                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ □ Step 1.1: Clone repository / 克隆仓库                                 │
│   git clone [repository-url]                                           │
│   cd elastos                                                           │
│                                                                         │
│ □ Step 1.2: Install dependencies / 安装依赖                             │
│   npm install                                                          │
│                                                                         │
│ □ Step 1.3: Run development server / 运行开发服务器                      │
│   npm run start                                                        │
│                                                                         │
│ □ Step 1.4: Test wallet login / 测试钱包登录                            │
│   - Open http://puter.localhost:4100                                   │
│   - Click login, connect wallet                                        │
│   - Open browser console, run:                                         │
│     console.log(walletService.getEOAAddress())                         │
│   - Verify EOA address appears / 验证 EOA 地址出现                      │
│                                                                         │
│ □ Step 1.5: Study particle-auth extension / 学习 particle-auth 扩展    │
│   - Read extensions/particle-auth/main.js                              │
│   - Understand lifecycle events                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Create PC2 Extension / 第二阶段：创建 PC2 扩展                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ □ Step 2.1: Create extension directory / 创建扩展目录                   │
│   mkdir -p extensions/pc2-cloud/{drivers,services,routes}              │
│                                                                         │
│ □ Step 2.2: Create package.json / 创建 package.json                    │
│   {                                                                     │
│     "name": "@elastos/pc2-cloud",                                      │
│     "version": "1.0.0",                                                │
│     "description": "Personal Cloud Compute Extension"                  │
│   }                                                                     │
│                                                                         │
│ □ Step 2.3: Create main.js / 创建 main.js                              │
│   Use template from Section 7                                          │
│   使用第 7 节的模板                                                     │
│                                                                         │
│ □ Step 2.4: Create PC2CloudDriver.js / 创建 PC2CloudDriver.js          │
│   Use template from Section 7                                          │
│   使用第 7 节的模板                                                     │
│                                                                         │
│ □ Step 2.5: Register extension / 注册扩展                               │
│   Add to extensions configuration                                       │
│   添加到扩展配置                                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Connect to Hardware Box / 第三阶段：连接到硬件盒子              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ □ Step 3.1: Implement discovery / 实现发现                              │
│   - How does browser find user's hardware box?                         │
│   - 浏览器如何找到用户的硬件盒子？                                       │
│   - Options: DNS, discovery server, manual config                      │
│   - 选项：DNS、发现服务器、手动配置                                      │
│                                                                         │
│ □ Step 3.2: Implement authentication / 实现认证                         │
│   - Challenge-response with EOA signature                              │
│   - 使用 EOA 签名的挑战-响应                                            │
│   - Hardware box verifies user owns EOA                                │
│   - 硬件盒子验证用户拥有 EOA                                            │
│                                                                         │
│ □ Step 3.3: Implement session management / 实现会话管理                 │
│   - Store session tokens                                               │
│   - Handle expiration and refresh                                      │
│   - 存储会话令牌                                                        │
│   - 处理过期和刷新                                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: Replace Puter Services / 第四阶段：替换 Puter 服务             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ □ Step 4.1: Replace storage / 替换存储                                  │
│   - Create PC2StorageDriver                                            │
│   - Route file operations to hardware box                              │
│   - 创建 PC2StorageDriver                                              │
│   - 将文件操作路由到硬件盒子                                             │
│                                                                         │
│ □ Step 4.2: Replace compute / 替换计算                                  │
│   - Create PC2ComputeDriver                                            │
│   - Route compute tasks to hardware box                                │
│   - 创建 PC2ComputeDriver                                              │
│   - 将计算任务路由到硬件盒子                                             │
│                                                                         │
│ □ Step 4.3: Replace database / 替换数据库                               │
│   - User data stored on personal cloud                                 │
│   - 用户数据存储在个人云上                                               │
│                                                                         │
│ □ Step 4.4: Update UI / 更新界面                                        │
│   - Show connection status to personal cloud                           │
│   - Add hardware box management UI                                     │
│   - 显示与个人云的连接状态                                               │
│   - 添加硬件盒子管理界面                                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Testing Guide / 测试指南

### Manual Testing Checklist / 手动测试清单

```
┌─────────────────────────────────────────────────────────────────────────┐
│ WALLET LOGIN TESTS / 钱包登录测试                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ □ Test 1: Social login (Google, Twitter, etc.)                         │
│   测试 1：社交登录（Google、Twitter 等）                                  │
│   Expected: User logged in, EOA address available                      │
│   预期：用户已登录，EOA 地址可用                                          │
│                                                                         │
│ □ Test 2: Wallet login (MetaMask)                                      │
│   测试 2：钱包登录（MetaMask）                                           │
│   Expected: Same EOA address as MetaMask                               │
│   预期：与 MetaMask 相同的 EOA 地址                                      │
│                                                                         │
│ □ Test 3: Check EOA in console                                         │
│   测试 3：在控制台检查 EOA                                               │
│   Run: walletService.getEOAAddress()                                   │
│   Expected: "0x..." address                                            │
│   预期："0x..." 地址                                                    │
│                                                                         │
│ □ Test 4: Wallet sidebar opens                                         │
│   测试 4：钱包侧边栏打开                                                 │
│   Click wallet icon in taskbar                                         │
│   Expected: Sidebar shows balance and tokens                           │
│   预期：侧边栏显示余额和代币                                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ PC2 CONNECTION TESTS / PC2 连接测试                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ □ Test 5: Discovery works                                              │
│   测试 5：发现功能正常                                                   │
│   Call: pc2Driver.discover({ eoa_address: '0x...' })                   │
│   Expected: Returns box_endpoint                                       │
│   预期：返回 box_endpoint                                               │
│                                                                         │
│ □ Test 6: Connection works                                             │
│   测试 6：连接功能正常                                                   │
│   Call: pc2Driver.connect({ eoa_address, box_endpoint, signature })    │
│   Expected: Returns session token                                      │
│   预期：返回会话令牌                                                     │
│                                                                         │
│ □ Test 7: Storage works                                                │
│   测试 7：存储功能正常                                                   │
│   Call: pc2Driver.store({ path: '/test.txt', data: 'hello' })         │
│   Expected: File stored on hardware box                                │
│   预期：文件存储在硬件盒子上                                              │
│                                                                         │
│ □ Test 8: Retrieval works                                              │
│   测试 8：获取功能正常                                                   │
│   Call: pc2Driver.retrieve({ path: '/test.txt' })                     │
│   Expected: Returns 'hello'                                            │
│   预期：返回 'hello'                                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Console Commands for Testing / 测试用控制台命令

```javascript
// ═══════════════════════════════════════════════════════════════════════
// Open browser console (F12) and run these commands
// 打开浏览器控制台（F12）并运行这些命令
// ═══════════════════════════════════════════════════════════════════════

// Check if wallet is connected / 检查钱包是否已连接
walletService.isConnected()
// Expected: true

// Get user's EOA address / 获取用户的 EOA 地址
walletService.getEOAAddress()
// Expected: "0x34DAF31B99B5A59cEB18E424Dbc112FA6e5f3Dc3"

// Get wallet data / 获取钱包数据
walletService.getData()
// Expected: { tokens: [...], totalBalance: ..., ... }

// Subscribe to changes / 订阅变化
walletService.subscribe(data => console.log('Updated:', data))

// Get current mode / 获取当前模式
walletService.getMode()
// Expected: "universal" or "elastos"
```

---

## 10. FAQ / 常见问题

### Q1: Why use EOA instead of Smart Account for PC2? / 为什么用 EOA 而不是 Smart Account 连接 PC2？

**English:**
The EOA (Externally Owned Account) is the user's real wallet address controlled by their private key. It's the same on all blockchains and represents the user's true identity. The Smart Account is a contract-based account used only for multi-chain token operations and has different addresses on different chains.

**中文：**
EOA（外部拥有账户）是由用户私钥控制的真实钱包地址。它在所有区块链上都相同，代表用户的真实身份。智能账户是基于合约的账户，仅用于多链代币操作，在不同链上地址不同。

---

### Q2: How does the hardware box know the user owns the EOA? / 硬件盒子如何知道用户拥有该 EOA？

**English:**
The user signs a challenge message with their wallet (MetaMask or Particle). The hardware box can recover the signer's address from the signature. If the recovered address matches the claimed EOA, the user is verified.

**中文：**
用户使用钱包（MetaMask 或 Particle）签署挑战消息。硬件盒子可以从签名中恢复签名者的地址。如果恢复的地址与声明的 EOA 匹配，则用户身份得到验证。

---

### Q3: What happens if user changes wallet? / 如果用户更换钱包会怎样？

**English:**
If user logs in with a different wallet, they get a different EOA address. This means they would connect to a different personal cloud (or no cloud if they haven't set one up for that EOA). Each EOA = one personal cloud identity.

**中文：**
如果用户使用不同的钱包登录，他们会获得不同的 EOA 地址。这意味着他们将连接到不同的个人云（如果该 EOA 没有设置个人云，则无法连接）。每个 EOA = 一个个人云身份。

---

### Q4: Can one user have multiple hardware boxes? / 一个用户可以有多个硬件盒子吗？

**English:**
Yes, this is a design decision for the DePin team. Options:
- One EOA → One primary hardware box
- One EOA → Multiple boxes (requires box selection UI)
- Multiple EOAs → Multiple boxes (user manages multiple identities)

**中文：**
可以，这是 DePin 团队的设计决策。选项：
- 一个 EOA → 一个主硬件盒子
- 一个 EOA → 多个盒子（需要盒子选择界面）
- 多个 EOA → 多个盒子（用户管理多个身份）

---

### Q5: Where is the IPFS storage extension? Should we use it? / IPFS 存储扩展在哪里？我们应该使用它吗？

**English:**
The IPFS storage extension (`extensions/ipfs-storage/`) is provided as a **reference only**. It shows the pattern for creating a storage driver extension. The DePin team should create their own PC2 storage driver that connects to the user's hardware box instead of IPFS.

**中文：**
IPFS 存储扩展（`extensions/ipfs-storage/`）**仅供参考**。它展示了创建存储驱动扩展的模式。DePin 团队应该创建自己的 PC2 存储驱动，连接到用户的硬件盒子而不是 IPFS。

---

## Contact & Support / 联系与支持

For questions about this handover:
如有关于此交接的问题：

- Review the code comments (bilingual)
- 查看代码注释（双语）
- Check existing extension examples
- 检查现有扩展示例
- Test the wallet login flow first
- 首先测试钱包登录流程

---

## Summary / 总结

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   KEY TAKEAWAYS / 关键要点                                               │
│                                                                         │
│   1. User identity = EOA wallet address (0x...)                        │
│      用户身份 = EOA 钱包地址（0x...）                                    │
│                                                                         │
│   2. Get EOA via: walletService.getEOAAddress()                        │
│      获取 EOA：walletService.getEOAAddress()                            │
│                                                                         │
│   3. Follow particle-auth extension pattern for PC2                    │
│      PC2 按照 particle-auth 扩展模式开发                                 │
│                                                                         │
│   4. Hardware box verifies user by checking EOA signature              │
│      硬件盒子通过检查 EOA 签名验证用户                                    │
│                                                                         │
│   5. Replace centralized Puter services with PC2 drivers               │
│      用 PC2 驱动替换中心化 Puter 服务                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

**Document Version / 文档版本**: 1.0.0  
**Last Updated / 最后更新**: December 2024  
**Authors / 作者**: ElastOS Development Team


