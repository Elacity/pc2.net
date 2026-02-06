/**
 * Active Proxy Client (Plain Protocol)
 * 
 * TCP client for connecting to Active Proxy on Boson super nodes.
 * Enables NAT traversal by maintaining a persistent connection
 * that relays incoming HTTP/WebSocket requests.
 * 
 * Uses the official Boson plain wire protocol:
 * - 4-byte big-endian length header (includes type + payload)
 * - 1-byte packet type
 * - N-byte payload
 * - Ed25519 signing for authentication (via tweetnacl)
 * - No encryption on wire (Boson Java server expects plain protocol)
 * 
 * Previous version used NaCl CryptoBox encrypted protocol which caused
 * "wrong DATA packet in Idling state" errors every 30 seconds because
 * the Boson Java server could not interpret encrypted PING keepalives.
 * See git history for the encrypted version.
 */

import net from 'net';
import nacl from 'tweetnacl';
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
 * 
 * Note: serverPublicKey is no longer required. The plain protocol
 * authenticates via Ed25519 signature without CryptoBox encryption.
 */
export interface ActiveProxyConfig {
  /** Active Proxy server host */
  host: string;
  /** Active Proxy server port */
  port: number;
  /** Your node ID (base58 encoded) */
  nodeId: string;
  /** Ed25519 public key (32 bytes) */
  publicKey: Buffer;
  /** Ed25519 private key (64 bytes) */
  privateKey: Buffer;
  /** Local port to expose via proxy */
  localPort: number;
  /** Keepalive interval in ms (default: 30000) */
  keepaliveIntervalMs?: number;
  /** Reconnect interval in ms (default: 5000) */
  reconnectIntervalMs?: number;
  /** Max reconnection attempts (default: 10) */
  maxReconnectAttempts?: number;
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
  /** Emitted when connected and authenticated */
  connected: (sessionId: string, allocatedPort: number) => void;
  /** Emitted when disconnected */
  disconnected: (reason: string) => void;
  /** Emitted on error */
  error: (error: Error) => void;
  /** Emitted when a new connection arrives */
  connection: (conn: ProxyConnection) => void;
  /** Emitted when data is received */
  data: (connectionId: number, data: Buffer) => void;
  /** Emitted when a connection is closed */
  connectionClosed: (connectionId: number) => void;
}

/**
 * Default configuration values
 * 
 * Keepalive tuning: Boson Java server has setIdleTimeout(120) = 2 minutes.
 * We PING every 30 seconds to stay well within that window and survive
 * any intermediate NAT/firewall timeouts (typically 60-120 seconds).
 */
const DEFAULT_CONFIG = {
  keepaliveIntervalMs: 30000,
  reconnectIntervalMs: 5000,
  maxReconnectAttempts: 10,
};

/**
 * Active Proxy Client (Plain Protocol)
 * 
 * Maintains a persistent TCP connection to a Boson Active Proxy server,
 * enabling NAT traversal for PC2 nodes behind firewalls.
 * 
 * Protocol flow:
 * 1. TCP connect to server
 * 2. Send AUTH packet with Ed25519 signature
 * 3. Receive AUTH_ACK with session ID and allocated port
 * 4. Send PING keepalives every 30s (plain, unencrypted)
 * 5. Receive CONNECT/DATA packets for proxied requests
 * 6. Send DATA/DISCONNECT packets for responses
 */
export class ActiveProxyClient extends EventEmitter {
  private config: Required<ActiveProxyConfig>;
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
    } as Required<ActiveProxyConfig>;
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
   * This is the port the gateway should ATTACH to for relay
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
   * Get active connections count
   */
  getActiveConnectionsCount(): number {
    return this.activeConnections.size;
  }

  /**
   * Connect to the Active Proxy server
   * 
   * Plain protocol flow:
   * 1. TCP connect
   * 2. Immediately send AUTH (no challenge-response step)
   * 3. Receive AUTH_ACK with session and allocated port
   * 4. Begin keepalive PING cycle
   */
  async connect(): Promise<void> {
    if (this.state !== ConnectionState.DISCONNECTED) {
      logger.warn('[ActiveProxy] Already connected or connecting');
      return;
    }

    this.isShuttingDown = false;
    this.state = ConnectionState.CONNECTING;
    
    return new Promise((resolve, reject) => {
      logger.info(`[ActiveProxy] Connecting to ${this.config.host}:${this.config.port} (plain protocol)...`);
      
      this.socket = new net.Socket();
      
      // Connection timeout (includes TCP + AUTH + AUTH_ACK)
      const connectionTimeout = setTimeout(() => {
        if (this.state === ConnectionState.CONNECTING ||
            this.state === ConnectionState.AUTHENTICATING) {
          this.socket?.destroy();
          reject(new Error('Connection timeout'));
        }
      }, 15000);
      
      this.socket.connect(this.config.port, this.config.host, () => {
        logger.info('[ActiveProxy] TCP connection established, sending AUTH...');
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
      
      // Resolve once authenticated
      this.once('connected', () => {
        clearTimeout(connectionTimeout);
        resolve();
      });
      
      this.once('error', (error) => {
        if (this.state === ConnectionState.AUTHENTICATING) {
          clearTimeout(connectionTimeout);
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
   * Send AUTH packet to authenticate with the Boson server
   * 
   * Plain protocol AUTH - no challenge-response, no encryption.
   * Signs the node ID with Ed25519 via tweetnacl.
   * 
   * AUTH payload format: [2B nodeId length][nodeId][32B pubkey][64B signature][2B port]
   * Wire format: [4B length][0x00 AUTH][payload]
   */
  private authenticate(): void {
    if (!this.socket) return;
    
    logger.info('[ActiveProxy] Sending AUTH packet (plain protocol)...');
    
    // Sign the node ID with Ed25519 using tweetnacl
    const signatureData = Buffer.from(this.config.nodeId, 'utf8');
    const signature = Buffer.from(
      nacl.sign.detached(
        new Uint8Array(signatureData),
        new Uint8Array(this.config.privateKey)
      )
    );
    
    const payload = encodeAuthPayload(
      this.config.nodeId,
      this.config.publicKey,
      signature,
      this.config.localPort
    );
    
    const packet = encodePacket(PacketType.AUTH, payload);
    
    logger.debug(`[ActiveProxy] AUTH packet: ${packet.length} bytes (nodeId: ${this.config.nodeId.slice(0, 16)}..., port: ${this.config.localPort})`);
    
    this.socket.write(packet);
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
   * 
   * AUTH_ACK payload: [2B sessionId length][sessionId][2B allocatedPort][32B serverPublicKey]
   */
  private handleAuthAck(payload: Buffer): void {
    try {
      const authAck = decodeAuthAckPayload(payload);
      
      this.sessionId = authAck.sessionId;
      this.allocatedPort = authAck.allocatedPort;
      this.serverPublicKey = authAck.serverPublicKey;
      this.state = ConnectionState.CONNECTED;
      this.reconnectAttempts = 0;
      
      logger.info(`[ActiveProxy] Authenticated! Session: ${this.sessionId}, Allocated Port: ${this.allocatedPort}`);
      
      // Start keepalive to maintain session
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
   * Handle CONNECT packet (new incoming connection from proxy)
   */
  private handleConnect(payload: Buffer): void {
    try {
      const conn = decodeConnectPayload(payload);
      
      logger.info(`[ActiveProxy] New connection: ${conn.connectionId} from ${conn.sourceAddress}:${conn.sourcePort}`);
      
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
   * 
   * Sends plain PING packets every 30s to keep the session alive.
   * Boson Java server has a 120s idle timeout, so 30s is safe.
   * 
   * Plain PING wire format: [4B length=1][0x10]
   * This is the critical fix - the old encrypted PING format caused
   * "wrong DATA packet in Idling state" errors because Boson could
   * not decrypt it and read garbage bytes as the packet type.
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
   * Schedule reconnection attempt with exponential backoff
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
