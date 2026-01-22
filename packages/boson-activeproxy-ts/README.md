# @bosonnetwork/activeproxy-client

**TypeScript client for Boson Active Proxy - NAT traversal for decentralized applications**

**Boson 活跃代理 TypeScript 客户端 - 去中心化应用的 NAT 穿透**

[中文文档](#中文文档) | [English Documentation](#english-documentation)

---

## English Documentation

### Overview

This package provides a TypeScript/Node.js client for connecting to Boson Active Proxy servers. It enables NAT traversal, allowing nodes behind firewalls to receive incoming connections.

### Features

- Full implementation of Active Proxy binary protocol
- Automatic reconnection with exponential backoff
- Connection multiplexing
- Keepalive/heartbeat support
- TypeScript with full type definitions
- Zero external dependencies (uses only Node.js built-ins)

### Installation

```bash
npm install @bosonnetwork/activeproxy-client
```

### Quick Start

```typescript
import { ActiveProxyClient } from '@bosonnetwork/activeproxy-client';

// Create client
const client = new ActiveProxyClient({
  host: '69.164.241.210',  // Boson super node
  port: 8090,              // Active Proxy port
  nodeId: 'your-node-id',
  publicKey: yourPublicKey,  // Ed25519 public key (32 bytes)
  privateKey: yourPrivateKey, // Ed25519 private key (64 bytes)
  localPort: 4200,           // Port to expose
});

// Connect
await client.connect();
console.log('Connected! Session:', client.getSessionId());
console.log('Allocated port:', client.getAllocatedPort());

// Handle incoming connections
client.on('connection', (conn) => {
  console.log(`New connection ${conn.connectionId} from ${conn.sourceAddress}:${conn.sourcePort}`);
});

// Handle incoming data
client.on('data', (connectionId, data) => {
  console.log(`Received ${data.length} bytes on connection ${connectionId}`);
  
  // Process request and send response
  const response = processRequest(data);
  client.sendData(connectionId, response);
});

// Handle connection close
client.on('connectionClosed', (connectionId) => {
  console.log(`Connection ${connectionId} closed`);
});

// Disconnect when done
await client.disconnect();
```

### API Reference

#### ActiveProxyClient

##### Constructor

```typescript
new ActiveProxyClient(config: ActiveProxyConfig)
```

**Config Options:**

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `host` | string | Yes | - | Active Proxy server host |
| `port` | number | Yes | - | Active Proxy server port |
| `nodeId` | string | Yes | - | Your node identifier |
| `publicKey` | Buffer | Yes | - | Ed25519 public key (32 bytes) |
| `privateKey` | Buffer | Yes | - | Ed25519 private key (64 bytes) |
| `localPort` | number | Yes | - | Local port to expose |
| `keepaliveIntervalMs` | number | No | 30000 | Keepalive interval (ms) |
| `reconnectIntervalMs` | number | No | 5000 | Reconnect interval (ms) |
| `maxReconnectAttempts` | number | No | 10 | Max reconnect attempts |
| `logger` | Logger | No | console | Custom logger |

##### Methods

| Method | Description |
|--------|-------------|
| `connect()` | Connect to the Active Proxy server |
| `disconnect()` | Disconnect from the server |
| `sendData(connectionId, data)` | Send data to a connection |
| `closeConnection(connectionId)` | Close a specific connection |
| `getState()` | Get current connection state |
| `getSessionId()` | Get session ID (after auth) |
| `getAllocatedPort()` | Get allocated port (after auth) |
| `isConnected()` | Check if connected |

##### Events

| Event | Callback | Description |
|-------|----------|-------------|
| `connected` | `(sessionId, allocatedPort) => void` | Successfully connected |
| `disconnected` | `(reason) => void` | Disconnected |
| `error` | `(error) => void` | Error occurred |
| `connection` | `(conn) => void` | New incoming connection |
| `data` | `(connectionId, data) => void` | Data received |
| `connectionClosed` | `(connectionId) => void` | Connection closed |

### Protocol

The Active Proxy protocol is a binary TCP protocol with the following packet format:

```
+----------------+--------+----------------+
| Length (4B)    | Type   | Payload        |
| Big-endian     | (1B)   | (N bytes)      |
+----------------+--------+----------------+
```

**Packet Types:**

| Type | Code | Description |
|------|------|-------------|
| AUTH | 0x00 | Authentication request |
| AUTH_ACK | 0x01 | Authentication success |
| PING | 0x10 | Keepalive ping |
| PONG | 0x11 | Keepalive pong |
| CONNECT | 0x20 | New connection |
| DATA | 0x40 | Data transfer |
| DISCONNECT | 0x30 | Connection close |

### License

MIT License - see [LICENSE](../../LICENSE)

---

## 中文文档

### 概述

本包提供了用于连接 Boson 活跃代理服务器的 TypeScript/Node.js 客户端。它实现了 NAT 穿透，使防火墙后的节点能够接收传入连接。

### 功能特性

- 完整实现活跃代理二进制协议
- 指数退避自动重连
- 连接复用
- 心跳保活支持
- TypeScript 完整类型定义
- 零外部依赖（仅使用 Node.js 内置模块）

### 安装

```bash
npm install @bosonnetwork/activeproxy-client
```

### 快速开始

```typescript
import { ActiveProxyClient } from '@bosonnetwork/activeproxy-client';

// 创建客户端
const client = new ActiveProxyClient({
  host: '69.164.241.210',  // Boson 超级节点
  port: 8090,              // 活跃代理端口
  nodeId: 'your-node-id',
  publicKey: yourPublicKey,  // Ed25519 公钥（32 字节）
  privateKey: yourPrivateKey, // Ed25519 私钥（64 字节）
  localPort: 4200,           // 要暴露的端口
});

// 连接
await client.connect();
console.log('已连接！会话 ID:', client.getSessionId());
console.log('分配的端口:', client.getAllocatedPort());

// 处理传入连接
client.on('connection', (conn) => {
  console.log(`新连接 ${conn.connectionId} 来自 ${conn.sourceAddress}:${conn.sourcePort}`);
});

// 处理传入数据
client.on('data', (connectionId, data) => {
  console.log(`在连接 ${connectionId} 上收到 ${data.length} 字节`);
  
  // 处理请求并发送响应
  const response = processRequest(data);
  client.sendData(connectionId, response);
});

// 处理连接关闭
client.on('connectionClosed', (connectionId) => {
  console.log(`连接 ${connectionId} 已关闭`);
});

// 完成后断开连接
await client.disconnect();
```

### API 参考

#### ActiveProxyClient

##### 构造函数

```typescript
new ActiveProxyClient(config: ActiveProxyConfig)
```

**配置选项：**

| 选项 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `host` | string | 是 | - | 活跃代理服务器主机 |
| `port` | number | 是 | - | 活跃代理服务器端口 |
| `nodeId` | string | 是 | - | 您的节点标识符 |
| `publicKey` | Buffer | 是 | - | Ed25519 公钥（32 字节） |
| `privateKey` | Buffer | 是 | - | Ed25519 私钥（64 字节） |
| `localPort` | number | 是 | - | 要暴露的本地端口 |
| `keepaliveIntervalMs` | number | 否 | 30000 | 心跳间隔（毫秒） |
| `reconnectIntervalMs` | number | 否 | 5000 | 重连间隔（毫秒） |
| `maxReconnectAttempts` | number | 否 | 10 | 最大重连次数 |
| `logger` | Logger | 否 | console | 自定义日志记录器 |

##### 方法

| 方法 | 说明 |
|------|------|
| `connect()` | 连接到活跃代理服务器 |
| `disconnect()` | 断开与服务器的连接 |
| `sendData(connectionId, data)` | 向连接发送数据 |
| `closeConnection(connectionId)` | 关闭指定连接 |
| `getState()` | 获取当前连接状态 |
| `getSessionId()` | 获取会话 ID（认证后） |
| `getAllocatedPort()` | 获取分配的端口（认证后） |
| `isConnected()` | 检查是否已连接 |

##### 事件

| 事件 | 回调 | 说明 |
|------|------|------|
| `connected` | `(sessionId, allocatedPort) => void` | 连接成功 |
| `disconnected` | `(reason) => void` | 已断开连接 |
| `error` | `(error) => void` | 发生错误 |
| `connection` | `(conn) => void` | 新的传入连接 |
| `data` | `(connectionId, data) => void` | 收到数据 |
| `connectionClosed` | `(connectionId) => void` | 连接已关闭 |

### 协议

活跃代理协议是一个二进制 TCP 协议，数据包格式如下：

```
+----------------+--------+----------------+
| 长度 (4B)       | 类型   | 载荷            |
| 大端序          | (1B)   | (N 字节)        |
+----------------+--------+----------------+
```

**数据包类型：**

| 类型 | 代码 | 说明 |
|------|------|------|
| AUTH | 0x00 | 认证请求 |
| AUTH_ACK | 0x01 | 认证成功 |
| PING | 0x10 | 心跳 ping |
| PONG | 0x11 | 心跳 pong |
| CONNECT | 0x20 | 新连接 |
| DATA | 0x40 | 数据传输 |
| DISCONNECT | 0x30 | 连接关闭 |

### 许可证

MIT 许可证 - 参见 [LICENSE](../../LICENSE)

---

## Related Projects | 相关项目

- [Boson.Core](https://github.com/bosonnetwork/Boson.Core) - Boson DHT Java implementation
- [Elastos.Carrier.Native](https://github.com/elastos/Elastos.Carrier.Native) - Carrier C++ implementation
- [PC2](https://github.com/elastos/pc2.net) - Personal Cloud Computer using Boson

## Contributing | 贡献

Contributions are welcome! Please open an issue or pull request.

欢迎贡献！请提交 issue 或 pull request。
