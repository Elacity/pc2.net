/**
 * Active Proxy Client
 * 
 * TCP client for connecting to Active Proxy on super nodes.
 * Enables NAT traversal by maintaining a persistent connection
 * that relays incoming HTTP/WebSocket requests.
 */

import net from 'net';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
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
  type AuthAckPayload,
  type ConnectPayload,
  type DataPayload,
} from './ProxyProtocol.js';

/**
 * Connection state machine
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
 */
export interface ActiveProxyConfig {
  host: string;
  port: number;
  nodeId: string;
  publicKey: Buffer;
  privateKey: Buffer;
  localPort: number;
  keepaliveIntervalMs: number;
  reconnectIntervalMs: number;
  maxReconnectAttempts: number;
}

/**
 * Incoming connection from the proxy
 */
export interface ProxyConnection {
  connectionId: number;
  sourceAddress: string;
  sourcePort: number;
}

/**
 * Events emitted by ActiveProxyClient
 */
export interface ActiveProxyEvents {
  connected: (sessionId: string, allocatedPort: number) => void;
  disconnected: (reason: string) => void;
  error: (error: Error) => void;
  connection: (conn: ProxyConnection) => void;
  data: (connectionId: number, data: Buffer) => void;
  connectionClosed: (connectionId: number) => void;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<ActiveProxyConfig> = {
  keepaliveIntervalMs: 30000,
  reconnectIntervalMs: 5000,
  maxReconnectAttempts: 10,
};

/**
 * Active Proxy Client
 * 
 * Maintains a persistent TCP connection to an Active Proxy server,
 * enabling NAT traversal for PC2 nodes behind firewalls.
 */
export class ActiveProxyClient extends EventEmitter {
  private config: ActiveProxyConfig;
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

  constructor(config: Partial<ActiveProxyConfig> & Pick<ActiveProxyConfig, 'host' | 'port' | 'nodeId' | 'publicKey' | 'privateKey' | 'localPort'>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config } as ActiveProxyConfig;
    this.packetBuffer = new PacketBuffer();
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get session ID (available after authentication)
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get allocated port (available after authentication)
   */
  getAllocatedPort(): number | null {
    return this.allocatedPort;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  /**
   * Connect to the Active Proxy server
   */
  async connect(): Promise<void> {
    if (this.state !== ConnectionState.DISCONNECTED) {
      logger.warn('[ActiveProxy] Already connected or connecting');
      return;
    }

    this.isShuttingDown = false;
    this.state = ConnectionState.CONNECTING;
    
    return new Promise((resolve, reject) => {
      logger.info(`[ActiveProxy] Connecting to ${this.config.host}:${this.config.port}...`);
      
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
        logger.info('[ActiveProxy] TCP connection established');
        this.state = ConnectionState.AUTHENTICATING;
        this.authenticate();
      });
      
      this.socket.on('data', (data: Buffer) => {
        this.handleData(data);
      });
      
      this.socket.on('error', (error: Error) => {
        clearTimeout(connectionTimeout);
        logger.error(`[ActiveProxy] Socket error: ${error.message}`);
        this.emit('error', error);
        
        if (this.state === ConnectionState.CONNECTING) {
          reject(error);
        }
      });
      
      this.socket.on('close', () => {
        logger.info('[ActiveProxy] Socket closed');
        this.handleDisconnect('Socket closed');
      });
      
      // Resolve once authenticated (handled in handleAuthAck)
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
    
    logger.info('[ActiveProxy] Disconnected');
  }

  /**
   * Send data to a proxied connection
   */
  sendData(connectionId: number, data: Buffer): boolean {
    if (!this.isConnected() || !this.socket) {
      logger.warn('[ActiveProxy] Cannot send data: not connected');
      return false;
    }
    
    const payload = encodeDataPayload(connectionId, data);
    const packet = encodePacket(PacketType.DATA, payload);
    
    try {
      this.socket.write(packet);
      return true;
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to send data: ${error}`);
      return false;
    }
  }

  /**
   * Close a proxied connection
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
      logger.error(`[ActiveProxy] Failed to close connection: ${error}`);
    }
  }

  /**
   * Send AUTH packet to authenticate with the server
   */
  private authenticate(): void {
    if (!this.socket) return;
    
    logger.info('[ActiveProxy] Sending AUTH packet...');
    
    // Create a simple signature (in production, sign a server challenge)
    // For now, sign the node ID as a placeholder
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
   * Sign data with private key (Ed25519)
   */
  private sign(data: Buffer): Buffer {
    // In production, use libsodium for Ed25519 signing
    // For now, create a placeholder signature
    // The actual implementation would be:
    // return sodium.crypto_sign_detached(data, this.config.privateKey);
    
    // Placeholder: hash the data with private key
    const hash = crypto.createHash('sha512');
    hash.update(data);
    hash.update(this.config.privateKey);
    const fullHash = hash.digest();
    
    // Return 64 bytes (Ed25519 signature size)
    return fullHash.slice(0, 64);
  }

  /**
   * Handle incoming data from socket
   */
  private handleData(data: Buffer): void {
    try {
      this.packetBuffer.append(data);
      
      let packet: Packet | null;
      while ((packet = this.packetBuffer.extractPacket()) !== null) {
        this.handlePacket(packet);
      }
    } catch (error) {
      // Log the raw data for debugging protocol mismatches
      const preview = data.slice(0, 100).toString('hex');
      logger.error(`[ActiveProxy] Protocol error: ${error}. Data preview: ${preview}`);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      this.handleDisconnect('Protocol error');
    }
  }

  /**
   * Handle a decoded packet
   */
  private handlePacket(packet: Packet): void {
    logger.debug(`[ActiveProxy] Received ${getPacketTypeName(packet.type)} packet`);
    
    switch (packet.type) {
      case PacketType.AUTH_ACK:
        this.handleAuthAck(packet.payload);
        break;
        
      case PacketType.AUTH_ERROR:
        this.handleAuthError(packet.payload);
        break;
        
      case PacketType.PONG:
        // Keepalive response, nothing to do
        logger.debug('[ActiveProxy] Received PONG');
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
        logger.warn(`[ActiveProxy] Unknown packet type: 0x${packet.type.toString(16)}`);
    }
  }

  /**
   * Handle AUTH_ACK packet
   */
  private handleAuthAck(payload: Buffer): void {
    try {
      const authAck = decodeAuthAckPayload(payload);
      
      this.sessionId = authAck.sessionId;
      this.allocatedPort = authAck.allocatedPort;
      this.serverPublicKey = authAck.serverPublicKey;
      this.state = ConnectionState.CONNECTED;
      this.reconnectAttempts = 0;
      
      logger.info(`[ActiveProxy] Authenticated! Session: ${this.sessionId}, Port: ${this.allocatedPort}`);
      
      // Start keepalive
      this.startKeepalive();
      
      this.emit('connected', this.sessionId, this.allocatedPort);
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to parse AUTH_ACK: ${error}`);
      this.handleDisconnect('AUTH_ACK parse error');
    }
  }

  /**
   * Handle AUTH_ERROR packet
   */
  private handleAuthError(payload: Buffer): void {
    const message = payload.toString('utf8');
    logger.error(`[ActiveProxy] Authentication failed: ${message}`);
    this.emit('error', new Error(`Authentication failed: ${message}`));
    this.handleDisconnect('Authentication failed');
  }

  /**
   * Handle CONNECT packet (new incoming connection)
   */
  private handleConnect(payload: Buffer): void {
    try {
      const conn = decodeConnectPayload(payload);
      
      logger.info(`[ActiveProxy] New connection: ${conn.connectionId} from ${conn.sourceAddress}:${conn.sourcePort}`);
      
      // Store connection
      this.activeConnections.set(conn.connectionId, conn);
      
      // Emit connection event
      this.emit('connection', conn);
      
      // Send CONNECT_ACK
      if (this.socket) {
        const ackPayload = Buffer.alloc(4);
        ackPayload.writeUInt32BE(conn.connectionId, 0);
        const packet = encodePacket(PacketType.CONNECT_ACK, ackPayload);
        this.socket.write(packet);
      }
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to handle CONNECT: ${error}`);
    }
  }

  /**
   * Handle DISCONNECT packet
   */
  private handleDisconnectPacket(payload: Buffer): void {
    const connectionId = payload.readUInt32BE(0);
    
    logger.info(`[ActiveProxy] Connection closed: ${connectionId}`);
    
    this.activeConnections.delete(connectionId);
    this.emit('connectionClosed', connectionId);
  }

  /**
   * Handle DATA packet
   */
  private handleDataPacket(payload: Buffer): void {
    try {
      const dataPacket = decodeDataPayload(payload);
      this.emit('data', dataPacket.connectionId, dataPacket.data);
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to handle DATA: ${error}`);
    }
  }

  /**
   * Handle ERROR packet
   */
  private handleError(payload: Buffer): void {
    const message = payload.toString('utf8');
    logger.error(`[ActiveProxy] Server error: ${message}`);
    this.emit('error', new Error(`Server error: ${message}`));
  }

  /**
   * Handle disconnection
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
   */
  private startKeepalive(): void {
    this.stopKeepalive();
    
    this.keepaliveTimer = setInterval(() => {
      if (this.isConnected() && this.socket) {
        const packet = encodePacket(PacketType.PING);
        try {
          this.socket.write(packet);
          logger.debug('[ActiveProxy] Sent PING');
        } catch (error) {
          logger.error(`[ActiveProxy] Failed to send PING: ${error}`);
        }
      }
    }, this.config.keepaliveIntervalMs);
  }

  /**
   * Stop keepalive timer
   */
  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error('[ActiveProxy] Max reconnection attempts reached');
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.config.reconnectIntervalMs * Math.pow(2, this.reconnectAttempts - 1);
    
    logger.info(`[ActiveProxy] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.state = ConnectionState.RECONNECTING;
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.state = ConnectionState.DISCONNECTED;
      
      try {
        await this.connect();
      } catch (error) {
        logger.error(`[ActiveProxy] Reconnection failed: ${error}`);
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Cancel scheduled reconnection
   */
  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
