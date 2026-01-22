# PC2 Contributions to Boson Network

# PC2 对 Boson 网络的贡献

---

## Overview | 概述

**PC2 (Personal Cloud Computer)** is a sovereign cloud platform built on the Elastos ecosystem. It uses **Boson DHT** for decentralized identity and peer discovery, and **Active Proxy** for NAT traversal.

**PC2（个人云电脑）** 是一个基于亦来云生态系统构建的主权云平台。它使用 **Boson DHT** 实现去中心化身份和节点发现，使用 **Active Proxy** 实现 NAT 穿透。

**Repository | 代码仓库**: https://github.com/elastos/pc2.net

**Live Deployment | 在线演示**: https://test7.ela.city

---

## Architecture | 架构

```
                              Internet | 互联网
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────┐
│                    SUPER NODE | 超级节点                      │
│                    69.164.241.210                            │
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │  Web Gateway   │  │   Boson DHT    │  │  Active Proxy  │  │
│  │   网页网关      │  │   Boson DHT    │  │   活跃代理      │  │
│  │   :80/:443     │  │    :39001      │  │     :8090      │  │
│  │   (Node.js)    │  │    (Java)      │  │     (Java)     │  │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘  │
│          │                   │                   │           │
│          └───────────────────┼───────────────────┘           │
│                              │                               │
│                    Username Registry                         │
│                    用户名注册表                                │
│                              │                               │
└──────────────────────────────┼───────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
    ┌──────────┐         ┌──────────┐         ┌──────────┐
    │  User 1  │         │  User 2  │         │  User 3  │
    │  用户 1   │         │  用户 2   │         │  用户 3   │
    │  (Home)  │         │  (VPS)   │         │  (NAT)   │
    └──────────┘         └──────────┘         └──────────┘
```

---

## Contributions | 贡献内容

### 1. TypeScript Active Proxy SDK | TypeScript 活跃代理 SDK

**Location | 位置**: `packages/boson-activeproxy-ts/`

Complete TypeScript implementation of the Active Proxy binary protocol.

完整的 TypeScript 实现活跃代理二进制协议。

| File | Lines | Description |
|------|-------|-------------|
| `ProxyProtocol.ts` | ~370 | Binary packet encoder/decoder | 二进制包编解码器 |
| `ActiveProxyClient.ts` | ~560 | TCP client with state machine | 带状态机的 TCP 客户端 |

**Features | 功能**:
- All packet types (AUTH, CONNECT, DATA, PING/PONG, DISCONNECT)
- 所有数据包类型（认证、连接、数据、心跳、断开）
- PacketBuffer for handling partial TCP reads
- 处理 TCP 分片读取的数据包缓冲区
- Automatic reconnection with exponential backoff
- 指数退避自动重连
- Connection multiplexing
- 连接复用

**Suggested npm package | 建议的 npm 包名**: `@bosonnetwork/activeproxy-client`

---

### 2. Active Proxy as Boson Service | 作为 Boson 服务的活跃代理

**Original Source | 原始来源**: `elastos/Elastos.Carrier.Java`

**Ported to | 移植到**: Boson.Core service interface

We ported the Active Proxy (~1,900 lines Java) from Elastos.Carrier.Java to work as a Boson service.

我们将活跃代理（约 1,900 行 Java 代码）从 Elastos.Carrier.Java 移植为 Boson 服务。

**Changes | 修改内容**:

| Before | After |
|--------|-------|
| `elastos.carrier.*` | `io.bosonnetwork.*` |
| `CarrierService` | `BosonService` |

**Files Ported | 移植的文件**:

| File | Lines | Purpose |
|------|-------|---------|
| `ActiveProxy.java` | 87 | Service entry point | 服务入口 |
| `Configuration.java` | 111 | Config handling | 配置处理 |
| `PacketType.java` | 93 | Protocol packets | 协议数据包 |
| `ProxyConnection.java` | 831 | Connection handling | 连接处理 |
| `ProxyServer.java` | 337 | TCP server | TCP 服务器 |
| `ProxySession.java` | 435 | Session management | 会话管理 |

**Running Instance | 运行实例**: `69.164.241.210:8090`

---

### 3. Boson HTTP API Service | Boson HTTP API 服务

**Location | 位置**: `deploy/boson-http-api/`

REST API wrapper for Boson DHT operations, enabling web applications to interact with the DHT without native bindings.

为 Boson DHT 操作提供的 REST API 封装，使 Web 应用无需原生绑定即可与 DHT 交互。

**Endpoints | 接口**:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check | 健康检查 |
| GET | `/api/node` | Node information | 节点信息 |
| GET | `/api/username/:name` | Lookup username | 查询用户名 |
| POST | `/api/username` | Register username | 注册用户名 |
| GET | `/api/dht/find/:id` | Find value by ID | 按 ID 查找值 |
| POST | `/api/dht/store` | Store value in DHT | 存储值到 DHT |

**Technology | 技术栈**: Java + Vert.x

---

### 4. Operator Documentation | 运维文档

**Location | 位置**: `docs/pc2-infrastructure/`

Comprehensive guides for deploying and operating Boson super nodes.

部署和运维 Boson 超级节点的完整指南。

| Document | Description |
|----------|-------------|
| `SUPERNODE_OPERATOR_GUIDE.md` | Step-by-step deployment | 分步部署指南 |
| `DEPLOYMENT_LOG.md` | Real deployment decisions | 实际部署决策记录 |
| `ARCHITECTURE.md` | Technical architecture | 技术架构 |
| `SSL_CERTIFICATES.md` | Wildcard SSL setup | 通配符 SSL 设置 |
| `WEB_GATEWAY.md` | Web Gateway API | 网页网关 API |

---

## How to Use | 使用方法

### TypeScript SDK

```typescript
import { ActiveProxyClient } from '@bosonnetwork/activeproxy-client';

const client = new ActiveProxyClient({
  host: '69.164.241.210',
  port: 8090,
  nodeId: 'your-node-id',
  publicKey: yourPublicKey,
  privateKey: yourPrivateKey,
  localPort: 4200,
});

await client.connect();
console.log('Session ID:', client.getSessionId());
console.log('Allocated Port:', client.getAllocatedPort());

// Handle incoming connections
client.on('connection', (conn) => {
  console.log(`New connection from ${conn.sourceAddress}:${conn.sourcePort}`);
});

client.on('data', (connectionId, data) => {
  // Handle incoming data
  // Process and respond
  client.sendData(connectionId, responseBuffer);
});
```

### HTTP API

```bash
# Register a username | 注册用户名
curl -X POST http://localhost:8091/api/username \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "nodeId": "abc123", "endpoint": "http://1.2.3.4:4200"}'

# Lookup a username | 查询用户名
curl http://localhost:8091/api/username/alice
```

---

## Value Proposition | 价值主张

| Contribution | Value | 价值 |
|--------------|-------|------|
| TypeScript SDK | Enables Node.js/Web developers to use Active Proxy | 让 Node.js/Web 开发者能使用活跃代理 |
| HTTP API | REST interface for DHT operations | DHT 操作的 REST 接口 |
| Documentation | Helps operators deploy super nodes | 帮助运维人员部署超级节点 |
| Real-world Use Case | Proves Boson works in production | 证明 Boson 可在生产环境运行 |

---

## Contact | 联系方式

**PC2/Elacity Team | PC2/Elacity 团队**

- GitHub: https://github.com/elastos/pc2.net
- Issues: https://github.com/elastos/pc2.net/issues

We welcome collaboration! | 欢迎合作！

---

*Last Updated | 最后更新: January 2026*
