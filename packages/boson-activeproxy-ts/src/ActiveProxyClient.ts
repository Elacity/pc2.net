/**
 * Boson Active Proxy Client
 * Boson 活跃代理客户端
 * 
 * TCP client for connecting to Active Proxy on Boson super nodes.
 * 用于连接 Boson 超级节点上活跃代理的 TCP 客户端。
 * 
 * Enables NAT traversal by maintaining a persistent connection
 * that relays incoming HTTP/WebSocket requests.
 * 通过维持持久连接来实现 NAT 穿透，转发传入的 HTTP/WebSocket 请求。
 */

import net from 'net';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import {
  PacketType,
  PacketBuffer,
  encodePacket,
  encodeAuthPayload,
  encodeDataPayload,
  encodeDisconnectPayload,
  decodeAuthAckPayload,
  decodeConnectPayload,
  decodeDataPayload,
  getPacketTypeName,
  type Packet,
} from './ProxyProtocol.js';

/**
 * Connection state machine
 * 连接状态机
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  AUTHENTICATING = 'authenticating',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
}

/**
 * Configuration for Active Proxy Client
 * 活跃代理客户端配置
 */
export interface ActiveProxyConfig {
  /** Active Proxy server host | 活跃代理服务器主机 */
  host: string;
  /** Active Proxy server port | 活跃代理服务器端口 */
  port: number;
  /** Your node ID | 您的节点 ID */
  nodeId: string;
  /** Ed25519 public key (32 bytes) | Ed25519 公钥（32 字节） */
  publicKey: Buffer;
  /** Ed25519 private key (64 bytes) | Ed25519 私钥（64 字节） */
  privateKey: Buffer;
  /** Local port to expose via proxy | 要通过代理暴露的本地端口 */
  localPort: number;
  /** Keepalive interval in ms | 心跳间隔（毫秒） */
  keepaliveIntervalMs?: number;
  /** Reconnect interval in ms | 重连间隔（毫秒） */
  reconnectIntervalMs?: number;
  /** Max reconnection attempts | 最大重连次数 */
  maxReconnectAttempts?: number;
  /** Optional logger | 可选的日志记录器 */
  logger?: Logger;
}

/**
 * Logger interface
 * 日志记录器接口
 */
export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Default console logger
 * 默认控制台日志记录器
 */
const defaultLogger: Logger = {
  debug: (msg) => console.debug(`[ActiveProxy] ${msg}`),
  info: (msg) => console.info(`[ActiveProxy] ${msg}`),
  warn: (msg) => console.warn(`[ActiveProxy] ${msg}`),
  error: (msg) => console.error(`[ActiveProxy] ${msg}`),
};

/**
 * Incoming connection from the proxy
 * 来自代理的传入连接
 */
export interface ProxyConnection {
  connectionId: number;
  sourceAddress: string;
  sourcePort: number;
}

/**
 * Events emitted by ActiveProxyClient
 * ActiveProxyClient 发出的事件
 */
export interface ActiveProxyClientEvents {
  /** Emitted when connected and authenticated | 连接并认证成功时触发 */
  connected: (sessionId: string, allocatedPort: number) => void;
  /** Emitted when disconnected | 断开连接时触发 */
  disconnected: (reason: string) => void;
  /** Emitted on error | 发生错误时触发 */
  error: (error: Error) => void;
  /** Emitted when a new connection arrives | 新连接到达时触发 */
  connection: (conn: ProxyConnection) => void;
  /** Emitted when data is received | 收到数据时触发 */
  data: (connectionId: number, data: Buffer) => void;
  /** Emitted when a connection is closed | 连接关闭时触发 */
  connectionClosed: (connectionId: number) => void;
}

/**
 * Default configuration values
 * 默认配置值
 */
const DEFAULT_CONFIG = {
  keepaliveIntervalMs: 30000,
  reconnectIntervalMs: 5000,
  maxReconnectAttempts: 10,
};

/**
 * Active Proxy Client
 * 活跃代理客户端
 * 
 * Maintains a persistent TCP connection to an Active Proxy server,
 * enabling NAT traversal for nodes behind firewalls.
 * 维护与活跃代理服务器的持久 TCP 连接，为防火墙后的节点实现 NAT 穿透。
 * 
 * @example
 * ```typescript
 * const client = new ActiveProxyClient({
 *   host: '69.164.241.210',
 *   port: 8090,
 *   nodeId: 'my-node-id',
 *   publicKey: myPublicKey,
 *   privateKey: myPrivateKey,
 *   localPort: 4200,
 * });
 * 
 * await client.connect();
 * console.log('Session:', client.getSessionId());
 * 
 * client.on('connection', (conn) => {
 *   console.log('New connection from:', conn.sourceAddress);
 * });
 * 
 * client.on('data', (connId, data) => {
 *   // Handle request, send response
 *   client.sendData(connId, responseBuffer);
 * });
 * ```
 */
export class ActiveProxyClient extends EventEmitter {
  private config: Required<Omit<ActiveProxyConfig, 'logger'>> & { logger: Logger };
  private socket: net.Socket | null = null;
  private packetBuffer: PacketBuffer;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private sessionId: string | null = null;
  private allocatedPort: number | null = null;
  private serverPublicKey: Buffer | null = null;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private activeConnections: Map<number, ProxyConnection> = new Map();
  private isShuttingDown: boolean = false;

  constructor(config: ActiveProxyConfig) {
    super();
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      logger: config.logger || defaultLogger,
    };
    this.packetBuffer = new PacketBuffer();
  }

  /**
   * Get current connection state
   * 获取当前连接状态
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get session ID (available after authentication)
   * 获取会话 ID（认证后可用）
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get allocated port (available after authentication)
   * 获取分配的端口（认证后可用）
   */
  getAllocatedPort(): number | null {
    return this.allocatedPort;
  }

  /**
   * Check if connected
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  /**
   * Get active connections count
   * 获取活跃连接数
   */
  getActiveConnectionsCount(): number {
    return this.activeConnections.size;
  }

  /**
   * Connect to the Active Proxy server
   * 连接到活跃代理服务器
   */
  async connect(): Promise<void> {
    if (this.state !== ConnectionState.DISCONNECTED) {
      this.config.logger.warn('Already connected or connecting');
      return;
    }

    this.isShuttingDown = false;
    this.state = ConnectionState.CONNECTING;
    
    return new Promise((resolve, reject) => {
      this.config.logger.info(`Connecting to ${this.config.host}:${this.config.port}...`);
      
      this.socket = new net.Socket();
      
      // Connection timeout
      const connectionTimeout = setTimeout(() => {
        if (this.state === ConnectionState.CONNECTING) {
          this.socket?.destroy();
          reject(new Error('Connection timeout'));
        }
      }, 10000);
      
      this.socket.connect(this.config.port, this.config.host, () => {
        clearTimeout(connectionTimeout);
        this.config.logger.info('TCP connection established');
        this.state = ConnectionState.AUTHENTICATING;
        this.authenticate();
      });
      
      this.socket.on('data', (data: Buffer) => {
        this.handleData(data);
      });
      
      this.socket.on('error', (error: Error) => {
        clearTimeout(connectionTimeout);
        this.config.logger.error(`Socket error: ${error.message}`);
        this.emit('error', error);
        
        if (this.state === ConnectionState.CONNECTING) {
          reject(error);
        }
      });
      
      this.socket.on('close', () => {
        this.config.logger.info('Socket closed');
        this.handleDisconnect('Socket closed');
      });
      
      // Resolve once authenticated
      this.once('connected', () => {
        resolve();
      });
      
      this.once('error', (error) => {
        if (this.state === ConnectionState.AUTHENTICATING) {
          reject(error);
        }
      });
    });
  }

  /**
   * Disconnect from the Active Proxy server
   * 断开与活跃代理服务器的连接
   */
  async disconnect(): Promise<void> {
    this.isShuttingDown = true;
    this.stopKeepalive();
    this.cancelReconnect();
    
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    
    this.state = ConnectionState.DISCONNECTED;
    this.sessionId = null;
    this.allocatedPort = null;
    this.activeConnections.clear();
    
    this.config.logger.info('Disconnected');
  }

  /**
   * Send data to a proxied connection
   * 向代理的连接发送数据
   * 
   * @param connectionId - Connection ID | 连接 ID
   * @param data - Data to send | 要发送的数据
   * @returns true if sent successfully | 发送成功返回 true
   */
  sendData(connectionId: number, data: Buffer): boolean {
    if (!this.isConnected() || !this.socket) {
      this.config.logger.warn('Cannot send data: not connected');
      return false;
    }
    
    const payload = encodeDataPayload(connectionId, data);
    const packet = encodePacket(PacketType.DATA, payload);
    
    try {
      this.socket.write(packet);
      return true;
    } catch (error) {
      this.config.logger.error(`Failed to send data: ${error}`);
      return false;
    }
  }

  /**
   * Close a proxied connection
   * 关闭代理的连接
   * 
   * @param connectionId - Connection ID to close | 要关闭的连接 ID
   */
  closeConnection(connectionId: number): void {
    if (!this.isConnected() || !this.socket) {
      return;
    }
    
    const payload = encodeDisconnectPayload(connectionId);
    const packet = encodePacket(PacketType.DISCONNECT, payload);
    
    try {
      this.socket.write(packet);
      this.activeConnections.delete(connectionId);
    } catch (error) {
      this.config.logger.error(`Failed to close connection: ${error}`);
    }
  }

  /**
   * Send AUTH packet to authenticate with the server
   * 发送 AUTH 数据包与服务器进行认证
   */
  private authenticate(): void {
    if (!this.socket) return;
    
    this.config.logger.info('Sending AUTH packet...');
    
    // Create signature (sign the node ID)
    const signatureData = Buffer.from(this.config.nodeId, 'utf8');
    const signature = this.sign(signatureData);
    
    const payload = encodeAuthPayload(
      this.config.nodeId,
      this.config.publicKey,
      signature,
      this.config.localPort
    );
    
    const packet = encodePacket(PacketType.AUTH, payload);
    this.socket.write(packet);
  }

  /**
   * Sign data with private key
   * 使用私钥签名数据
   * 
   * Note: In production, use libsodium for Ed25519 signing
   * 注意：生产环境应使用 libsodium 进行 Ed25519 签名
   */
  private sign(data: Buffer): Buffer {
    // Placeholder implementation using SHA-512
    // For production, use: sodium.crypto_sign_detached(data, this.config.privateKey)
    const hash = crypto.createHash('sha512');
    hash.update(data);
    hash.update(this.config.privateKey);
    const fullHash = hash.digest();
    
    // Return 64 bytes (Ed25519 signature size)
    return fullHash.slice(0, 64);
  }

  /**
   * Handle incoming data from socket
   * 处理来自套接字的传入数据
   */
  private handleData(data: Buffer): void {
    try {
      this.packetBuffer.append(data);
      
      let packet: Packet | null;
      while ((packet = this.packetBuffer.extractPacket()) !== null) {
        this.handlePacket(packet);
      }
    } catch (error) {
      const preview = data.slice(0, 100).toString('hex');
      this.config.logger.error(`Protocol error: ${error}. Data preview: ${preview}`);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      this.handleDisconnect('Protocol error');
    }
  }

  /**
   * Handle a decoded packet
   * 处理解码后的数据包
   */
  private handlePacket(packet: Packet): void {
    this.config.logger.debug(`Received ${getPacketTypeName(packet.type)} packet`);
    
    switch (packet.type) {
      case PacketType.AUTH_ACK:
        this.handleAuthAck(packet.payload);
        break;
        
      case PacketType.AUTH_ERROR:
        this.handleAuthError(packet.payload);
        break;
        
      case PacketType.PONG:
        this.config.logger.debug('Received PONG');
        break;
        
      case PacketType.CONNECT:
        this.handleConnect(packet.payload);
        break;
        
      case PacketType.DISCONNECT:
        this.handleDisconnectPacket(packet.payload);
        break;
        
      case PacketType.DATA:
        this.handleDataPacket(packet.payload);
        break;
        
      case PacketType.ERROR:
        this.handleError(packet.payload);
        break;
        
      default:
        this.config.logger.warn(`Unknown packet type: 0x${packet.type.toString(16)}`);
    }
  }

  /**
   * Handle AUTH_ACK packet
   * 处理 AUTH_ACK 数据包
   */
  private handleAuthAck(payload: Buffer): void {
    try {
      const authAck = decodeAuthAckPayload(payload);
      
      this.sessionId = authAck.sessionId;
      this.allocatedPort = authAck.allocatedPort;
      this.serverPublicKey = authAck.serverPublicKey;
      this.state = ConnectionState.CONNECTED;
      this.reconnectAttempts = 0;
      
      this.config.logger.info(`Authenticated! Session: ${this.sessionId}, Port: ${this.allocatedPort}`);
      
      this.startKeepalive();
      this.emit('connected', this.sessionId, this.allocatedPort);
    } catch (error) {
      this.config.logger.error(`Failed to parse AUTH_ACK: ${error}`);
      this.handleDisconnect('AUTH_ACK parse error');
    }
  }

  /**
   * Handle AUTH_ERROR packet
   * 处理 AUTH_ERROR 数据包
   */
  private handleAuthError(payload: Buffer): void {
    const message = payload.toString('utf8');
    this.config.logger.error(`Authentication failed: ${message}`);
    this.emit('error', new Error(`Authentication failed: ${message}`));
    this.handleDisconnect('Authentication failed');
  }

  /**
   * Handle CONNECT packet (new incoming connection)
   * 处理 CONNECT 数据包（新的传入连接）
   */
  private handleConnect(payload: Buffer): void {
    try {
      const conn = decodeConnectPayload(payload);
      
      this.config.logger.info(`New connection: ${conn.connectionId} from ${conn.sourceAddress}:${conn.sourcePort}`);
      
      this.activeConnections.set(conn.connectionId, conn);
      this.emit('connection', conn);
      
      // Send CONNECT_ACK
      if (this.socket) {
        const ackPayload = Buffer.alloc(4);
        ackPayload.writeUInt32BE(conn.connectionId, 0);
        const packet = encodePacket(PacketType.CONNECT_ACK, ackPayload);
        this.socket.write(packet);
      }
    } catch (error) {
      this.config.logger.error(`Failed to handle CONNECT: ${error}`);
    }
  }

  /**
   * Handle DISCONNECT packet
   * 处理 DISCONNECT 数据包
   */
  private handleDisconnectPacket(payload: Buffer): void {
    const connectionId = payload.readUInt32BE(0);
    
    this.config.logger.info(`Connection closed: ${connectionId}`);
    
    this.activeConnections.delete(connectionId);
    this.emit('connectionClosed', connectionId);
  }

  /**
   * Handle DATA packet
   * 处理 DATA 数据包
   */
  private handleDataPacket(payload: Buffer): void {
    try {
      const dataPacket = decodeDataPayload(payload);
      this.emit('data', dataPacket.connectionId, dataPacket.data);
    } catch (error) {
      this.config.logger.error(`Failed to handle DATA: ${error}`);
    }
  }

  /**
   * Handle ERROR packet
   * 处理 ERROR 数据包
   */
  private handleError(payload: Buffer): void {
    const message = payload.toString('utf8');
    this.config.logger.error(`Server error: ${message}`);
    this.emit('error', new Error(`Server error: ${message}`));
  }

  /**
   * Handle disconnection
   * 处理断开连接
   */
  private handleDisconnect(reason: string): void {
    const wasConnected = this.state === ConnectionState.CONNECTED;
    
    this.stopKeepalive();
    this.state = ConnectionState.DISCONNECTED;
    this.sessionId = null;
    this.allocatedPort = null;
    this.activeConnections.clear();
    this.packetBuffer.clear();
    
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    
    this.emit('disconnected', reason);
    
    // Attempt reconnection if not shutting down
    if (!this.isShuttingDown && wasConnected) {
      this.scheduleReconnect();
    }
  }

  /**
   * Start keepalive timer
   * 启动心跳定时器
   */
  private startKeepalive(): void {
    this.stopKeepalive();
    
    this.keepaliveTimer = setInterval(() => {
      if (this.isConnected() && this.socket) {
        const packet = encodePacket(PacketType.PING);
        try {
          this.socket.write(packet);
          this.config.logger.debug('Sent PING');
        } catch (error) {
          this.config.logger.error(`Failed to send PING: ${error}`);
        }
      }
    }, this.config.keepaliveIntervalMs);
  }

  /**
   * Stop keepalive timer
   * 停止心跳定时器
   */
  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  /**
   * Schedule reconnection attempt
   * 安排重连尝试
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.config.logger.error('Max reconnection attempts reached');
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.config.reconnectIntervalMs * Math.pow(2, this.reconnectAttempts - 1);
    
    this.config.logger.info(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.state = ConnectionState.RECONNECTING;
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.state = ConnectionState.DISCONNECTED;
      
      try {
        await this.connect();
      } catch (error) {
        this.config.logger.error(`Reconnection failed: ${error}`);
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Cancel scheduled reconnection
   * 取消计划的重连
   */
  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
