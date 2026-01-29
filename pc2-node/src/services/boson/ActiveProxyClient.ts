/**
 * Active Proxy Client
 * 
 * TCP client for connecting to Active Proxy on super nodes.
 * Enables NAT traversal by maintaining a persistent connection
 * that relays incoming HTTP/WebSocket requests.
 * 
 * Protocol compatibility:
 * - Server: Boson.Java boson-active-proxy-2.0.8-SNAPSHOT
 * - Uses NaCl CryptoBox for encrypted communication
 * - May require updates for Boson V2 (expected Feb 2026)
 */

import net from 'net';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
import {
  PacketType,
  EncryptedPacketBuffer,
  encodePlaintextPacket,
  encodeAuthPayload,
  encodeDataPayload,
  encodeDisconnectPayload,
  decodePlaintextPacket,
  decodeAuthAckPayload,
  decodeConnectPayload,
  decodeDataPayload,
  getPacketTypeName,
  LENGTH_FIELD_SIZE,
  NONCE_SIZE,
  type Packet,
  type AuthAckPayload,
  type ConnectPayload,
  type DataPayload,
} from './ProxyProtocol.js';
import {
  generateKeyPair,
  computeSharedSecret,
  generateNonce,
  encrypt,
  decrypt,
  parseServerHello,
  CRYPTO_CONSTANTS,
  type KeyPair,
  type CryptoSession,
} from './CryptoBox.js';

/**
 * Connection state machine
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  HANDSHAKING = 'handshaking',      // Waiting for ServerHello
  AUTHENTICATING = 'authenticating', // Sending encrypted auth
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
 * 
 * Uses NaCl CryptoBox for encrypted communication with the server.
 */
export class ActiveProxyClient extends EventEmitter {
  private config: ActiveProxyConfig;
  private socket: net.Socket | null = null;
  private packetBuffer: EncryptedPacketBuffer;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private sessionId: string | null = null;
  private allocatedPort: number | null = null;
  private serverPublicKey: Buffer | null = null;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private activeConnections: Map<number, ProxyConnection> = new Map();
  private isShuttingDown: boolean = false;
  
  // CryptoBox session state
  private cryptoSession: CryptoSession | null = null;
  private clientKeyPair: KeyPair | null = null;

  constructor(config: Partial<ActiveProxyConfig> & Pick<ActiveProxyConfig, 'host' | 'port' | 'nodeId' | 'publicKey' | 'privateKey' | 'localPort'>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config } as ActiveProxyConfig;
    this.packetBuffer = new EncryptedPacketBuffer();
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
   * 
   * Connection flow:
   * 1. TCP connect
   * 2. Wait for ServerHello (server's public key + nonce + encrypted challenge)
   * 3. Generate client keypair, derive shared secret
   * 4. Send ClientHello with encrypted auth data
   * 5. Receive encrypted AUTH_ACK
   * 6. All subsequent communication is encrypted
   */
  async connect(): Promise<void> {
    if (this.state !== ConnectionState.DISCONNECTED) {
      logger.warn('[ActiveProxy] Already connected or connecting');
      return;
    }

    this.isShuttingDown = false;
    this.state = ConnectionState.CONNECTING;
    
    // Generate ephemeral keypair for this connection
    this.clientKeyPair = generateKeyPair();
    logger.debug(`[ActiveProxy] Generated ephemeral keypair: ${Buffer.from(this.clientKeyPair.publicKey).toString('hex').slice(0, 16)}...`);
    
    return new Promise((resolve, reject) => {
      logger.info(`[ActiveProxy] Connecting to ${this.config.host}:${this.config.port}...`);
      
      this.socket = new net.Socket();
      
      // Connection timeout (includes handshake)
      const connectionTimeout = setTimeout(() => {
        if (this.state === ConnectionState.CONNECTING || 
            this.state === ConnectionState.HANDSHAKING ||
            this.state === ConnectionState.AUTHENTICATING) {
          this.socket?.destroy();
          reject(new Error('Connection timeout'));
        }
      }, 15000);
      
      this.socket.connect(this.config.port, this.config.host, () => {
        logger.info('[ActiveProxy] TCP connection established, waiting for ServerHello...');
        this.state = ConnectionState.HANDSHAKING;
        // Don't send auth yet - wait for ServerHello
      });
      
      this.socket.on('data', (data: Buffer) => {
        this.handleData(data);
      });
      
      this.socket.on('error', (error: Error) => {
        clearTimeout(connectionTimeout);
        logger.error(`[ActiveProxy] Socket error: ${error.message}`);
        this.emit('error', error);
        
        if (this.state === ConnectionState.CONNECTING ||
            this.state === ConnectionState.HANDSHAKING) {
          reject(error);
        }
      });
      
      this.socket.on('close', () => {
        logger.info('[ActiveProxy] Socket closed');
        this.handleDisconnect('Socket closed');
      });
      
      // Resolve once authenticated (handled in handleAuthAck)
      this.once('connected', () => {
        clearTimeout(connectionTimeout);
        resolve();
      });
      
      this.once('error', (error) => {
        if (this.state === ConnectionState.AUTHENTICATING ||
            this.state === ConnectionState.HANDSHAKING) {
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
    if (!this.isConnected() || !this.socket || !this.cryptoSession) {
      logger.warn('[ActiveProxy] Cannot send data: not connected or no crypto session');
      return false;
    }
    
    const payload = encodeDataPayload(connectionId, data);
    const plaintextPacket = encodePlaintextPacket(PacketType.DATA, payload);
    
    return this.sendEncryptedPacket(plaintextPacket);
  }

  /**
   * Close a proxied connection
   */
  closeConnection(connectionId: number): void {
    if (!this.isConnected() || !this.socket || !this.cryptoSession) {
      return;
    }
    
    const payload = encodeDisconnectPayload(connectionId);
    const plaintextPacket = encodePlaintextPacket(PacketType.DISCONNECT, payload);
    
    if (this.sendEncryptedPacket(plaintextPacket)) {
      this.activeConnections.delete(connectionId);
    }
  }

  /**
   * Send AUTH packet - now handled by sendEncryptedAuth()
   * @deprecated Use the CryptoBox handshake flow
   */
  private authenticate(): void {
    // This is now handled by sendEncryptedAuth() called from processServerHello()
    logger.warn('[ActiveProxy] authenticate() called but using CryptoBox flow');
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
   * 
   * Behavior depends on connection state:
   * - HANDSHAKING: Process ServerHello
   * - AUTHENTICATING/CONNECTED: Decrypt and process packets
   */
  private handleData(data: Buffer): void {
    try {
      this.packetBuffer.append(data);
      
      if (this.state === ConnectionState.HANDSHAKING) {
        // Process ServerHello
        this.processServerHello();
      } else if (this.state === ConnectionState.AUTHENTICATING || 
                 this.state === ConnectionState.CONNECTED) {
        // Process encrypted packets
        this.processEncryptedPackets();
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
   * Process ServerHello message
   * 
   * ServerHello format: [2-byte length][32-byte pubkey][24-byte nonce][encrypted payload]
   */
  private processServerHello(): void {
    const buffer = this.packetBuffer.getBuffer();
    
    // Need at least length field to check message size
    if (buffer.length < LENGTH_FIELD_SIZE) {
      return;
    }
    
    // Read message length
    const messageLength = buffer.readUInt16BE(0);
    
    // Wait for complete message
    if (buffer.length < messageLength) {
      logger.debug(`[ActiveProxy] Waiting for complete ServerHello: have ${buffer.length}, need ${messageLength}`);
      return;
    }
    
    logger.info(`[ActiveProxy] Received ServerHello: ${messageLength} bytes`);
    
    // Parse ServerHello
    const serverHello = parseServerHello(buffer);
    if (!serverHello) {
      throw new Error('Failed to parse ServerHello');
    }
    
    // Consume the ServerHello from buffer
    this.packetBuffer.consume(messageLength);
    
    // Store server's public key
    this.serverPublicKey = Buffer.from(serverHello.serverPublicKey);
    
    // Compute shared secret
    if (!this.clientKeyPair) {
      throw new Error('Client keypair not initialized');
    }
    
    const sharedKey = computeSharedSecret(
      this.clientKeyPair.secretKey,
      serverHello.serverPublicKey
    );
    
    // Create crypto session
    this.cryptoSession = {
      sharedKey,
      serverPublicKey: serverHello.serverPublicKey,
      clientKeyPair: this.clientKeyPair,
      nonceCounter: BigInt(0),
    };
    
    logger.debug(`[ActiveProxy] Computed shared secret, session established`);
    
    // Decrypt the challenge/welcome from ServerHello (optional, for verification)
    const decryptedChallenge = decrypt(
      serverHello.encryptedPayload,
      serverHello.nonce,
      sharedKey
    );
    
    if (decryptedChallenge) {
      logger.debug(`[ActiveProxy] Decrypted ServerHello payload: ${decryptedChallenge.length} bytes`);
    } else {
      logger.warn('[ActiveProxy] Failed to decrypt ServerHello payload (may be expected)');
    }
    
    // Send ClientHello with encrypted auth
    this.state = ConnectionState.AUTHENTICATING;
    this.sendEncryptedAuth();
  }
  
  /**
   * Process encrypted packets after handshake
   */
  private processEncryptedPackets(): void {
    if (!this.cryptoSession) {
      throw new Error('No crypto session - handshake not complete');
    }
    
    let encryptedPacket;
    while ((encryptedPacket = this.packetBuffer.extractEncryptedPacket()) !== null) {
      // Decrypt the packet
      const plaintext = decrypt(
        new Uint8Array(encryptedPacket.ciphertext),
        new Uint8Array(encryptedPacket.nonce),
        this.cryptoSession.sharedKey
      );
      
      if (!plaintext) {
        logger.warn('[ActiveProxy] Failed to decrypt packet - authentication error');
        continue;
      }
      
      // Decode plaintext packet (type + payload)
      const packet = decodePlaintextPacket(Buffer.from(plaintext));
      if (packet) {
        this.handlePacket(packet);
      }
    }
  }
  
  /**
   * Send encrypted AUTH packet
   */
  private sendEncryptedAuth(): void {
    if (!this.socket || !this.cryptoSession) {
      logger.error('[ActiveProxy] Cannot send auth - no socket or session');
      return;
    }
    
    logger.info('[ActiveProxy] Sending encrypted AUTH packet...');
    
    // Create AUTH payload
    const signatureData = Buffer.from(this.config.nodeId, 'utf8');
    const signature = this.sign(signatureData);
    
    const authPayload = encodeAuthPayload(
      this.config.nodeId,
      this.config.publicKey,
      signature,
      this.config.localPort
    );
    
    // Create plaintext packet: [type][payload]
    const plaintextPacket = encodePlaintextPacket(PacketType.AUTH, authPayload);
    
    // Encrypt and send
    this.sendEncryptedPacket(plaintextPacket);
  }
  
  /**
   * Send an encrypted packet
   */
  private sendEncryptedPacket(plaintext: Buffer): boolean {
    if (!this.socket || !this.cryptoSession) {
      logger.warn('[ActiveProxy] Cannot send encrypted packet - no socket or session');
      return false;
    }
    
    // Generate nonce
    const nonce = generateNonce();
    
    // Encrypt
    const ciphertext = encrypt(
      new Uint8Array(plaintext),
      nonce,
      this.cryptoSession.sharedKey
    );
    
    // Build packet: [2-byte length][24-byte nonce][ciphertext]
    const packetLength = LENGTH_FIELD_SIZE + NONCE_SIZE + ciphertext.length;
    const packet = Buffer.alloc(packetLength);
    
    packet.writeUInt16BE(packetLength, 0);
    Buffer.from(nonce).copy(packet, LENGTH_FIELD_SIZE);
    Buffer.from(ciphertext).copy(packet, LENGTH_FIELD_SIZE + NONCE_SIZE);
    
    try {
      this.socket.write(packet);
      return true;
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to send encrypted packet: ${error}`);
      return false;
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
      
      // Send encrypted CONNECT_ACK
      if (this.socket && this.cryptoSession) {
        const ackPayload = Buffer.alloc(4);
        ackPayload.writeUInt32BE(conn.connectionId, 0);
        const plaintextPacket = encodePlaintextPacket(PacketType.CONNECT_ACK, ackPayload);
        this.sendEncryptedPacket(plaintextPacket);
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
    
    // Clear crypto session
    this.cryptoSession = null;
    this.clientKeyPair = null;
    
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
      if (this.isConnected() && this.socket && this.cryptoSession) {
        const plaintextPacket = encodePlaintextPacket(PacketType.PING);
        if (this.sendEncryptedPacket(plaintextPacket)) {
          logger.debug('[ActiveProxy] Sent encrypted PING');
        } else {
          logger.error('[ActiveProxy] Failed to send PING');
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
