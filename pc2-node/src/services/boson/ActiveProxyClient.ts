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
import nacl from 'tweetnacl';
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
  incrementNonce,
  deriveNonceFromX25519Keys,
  encrypt,
  decrypt,
  parseServerChallenge,
  buildAuthPacket,
  buildAuthPayload,
  ensureWasmReady,
  ed25519PublicKeyToX25519,
  ed25519PrivateKeyToX25519,
  signEd25519,
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
  publicKey: Buffer;           // Client's Ed25519 public key (32 bytes)
  privateKey: Buffer;          // Client's Ed25519 private key (64 bytes)
  serverPublicKey: Buffer;     // Server's Ed25519 public key (32 bytes, from supernode config)
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
 * 
 * Keepalive tuning: The Boson Java server closes idle connections after ~30s.
 * We PING every 10 seconds to stay well within that window and send an
 * immediate PING right after authentication to prevent early timeout.
 */
const DEFAULT_CONFIG: Partial<ActiveProxyConfig> = {
  keepaliveIntervalMs: 10000,  // 10s - must be well under server's 30s idle timeout
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
  private serverX25519PublicKey: Uint8Array | null = null;
  private clientX25519PrivateKey: Uint8Array | null = null;
  private serverChallenge: Uint8Array | null = null;
  
  // ATTACH support - reuse existing session for 40x faster connection
  private serverSessionPublicKey: Uint8Array | null = null;
  private isAttaching: boolean = false;
  
  // Session nonce tracking for post-AUTH encrypted communication
  // The connectionNonce from AUTH payload is used as the base, incremented per packet
  private sessionSendNonce: Uint8Array | null = null;
  private sessionRecvNonce: Uint8Array | null = null;
  private authConnectionNonce: Uint8Array | null = null;

  constructor(config: Partial<ActiveProxyConfig> & Pick<ActiveProxyConfig, 'host' | 'port' | 'nodeId' | 'publicKey' | 'privateKey' | 'serverPublicKey' | 'localPort'>) {
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
   * Get session info for ATTACH reuse
   * Can be stored and used to create new connections to the same session
   */
  getSessionInfo(): { sessionId: string; serverSessionPk: Uint8Array; allocatedPort: number } | null {
    if (!this.sessionId || !this.serverSessionPublicKey || !this.allocatedPort) {
      return null;
    }
    return {
      sessionId: this.sessionId,
      serverSessionPk: this.serverSessionPublicKey,
      allocatedPort: this.allocatedPort,
    };
  }

  /**
   * Set session info for ATTACH (reusing existing session)
   * This enables 40x faster connection by skipping AUTH handshake
   */
  setSessionInfo(sessionInfo: { sessionId: string; serverSessionPk: Uint8Array; allocatedPort: number }): void {
    this.sessionId = sessionInfo.sessionId;
    this.serverSessionPublicKey = sessionInfo.serverSessionPk;
    this.allocatedPort = sessionInfo.allocatedPort;
    this.isAttaching = true;
    logger.debug(`[ActiveProxy] Session info set for ATTACH: ${this.sessionId}`);
  }

  /**
   * Connect to the Active Proxy server
   * 
   * Connection flow (based on Java server analysis):
   * 1. TCP connect
   * 2. Wait for raw challenge from server (32-256 random bytes)
   * 3. Sign challenge with Ed25519 private key
   * 4. Generate ephemeral X25519 keypair for session
   * 5. Encrypt AUTH payload with server's permanent X25519 public key
   * 6. Send AUTH packet: [len][type][nodeId][encrypted payload]
   * 7. Receive encrypted AUTH_ACK
   * 8. All subsequent communication uses session keys
   */
  async connect(): Promise<void> {
    if (this.state !== ConnectionState.DISCONNECTED) {
      logger.warn('[ActiveProxy] Already connected or connecting');
      return;
    }

    this.isShuttingDown = false;
    this.state = ConnectionState.CONNECTING;
    
    // Wait for WASM crypto module to be ready
    try {
      await ensureWasmReady();
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to initialize crypto: ${error}`);
      throw error;
    }
    
    // Convert server's Ed25519 public key to X25519 for CryptoBox
    try {
      this.serverX25519PublicKey = ed25519PublicKeyToX25519(
        new Uint8Array(this.config.serverPublicKey)
      );
      logger.debug(`[ActiveProxy] Converted server pubkey to X25519: ${Buffer.from(this.serverX25519PublicKey).toString('hex').slice(0, 16)}...`);
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to convert server public key: ${error}`);
      throw error;
    }
    
    // Convert our Ed25519 private key to X25519
    try {
      this.clientX25519PrivateKey = ed25519PrivateKeyToX25519(
        new Uint8Array(this.config.privateKey)
      );
      logger.debug(`[ActiveProxy] Converted client private key to X25519`);
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to convert client private key: ${error}`);
      throw error;
    }
    
    // Generate ephemeral X25519 keypair for session encryption
    this.clientKeyPair = generateKeyPair();
    logger.debug(`[ActiveProxy] Generated ephemeral session keypair: ${Buffer.from(this.clientKeyPair.publicKey).toString('hex').slice(0, 16)}...`);
    
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
    return this.sendEncryptedPacket(PacketType.DATA, payload);
  }

  /**
   * Close a proxied connection
   */
  closeConnection(connectionId: number): void {
    if (!this.isConnected() || !this.socket || !this.cryptoSession) {
      return;
    }
    
    const payload = encodeDisconnectPayload(connectionId);
    if (this.sendEncryptedPacket(PacketType.DISCONNECT, payload)) {
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
   * Process server challenge message
   * 
   * The server sends a raw (unencrypted) challenge: [2-byte length][random bytes]
   * Challenge is 32-256 random bytes that we must sign with our Ed25519 key.
   */
  private processServerHello(): void {
    const buffer = this.packetBuffer.getBuffer();
    
    // Need at least length field to check message size
    if (buffer.length < LENGTH_FIELD_SIZE) {
      return;
    }
    
    // Parse the raw challenge
    const challengeResult = parseServerChallenge(buffer);
    if (!challengeResult) {
      // Not enough data yet
      logger.debug(`[ActiveProxy] Waiting for complete challenge, have ${buffer.length} bytes`);
      return;
    }
    
    const { challenge, bytesConsumed } = challengeResult;
    
    logger.info(`[ActiveProxy] Received server challenge: ${challenge.length} bytes`);
    logger.debug(`[ActiveProxy] Challenge: ${Buffer.from(challenge).toString('hex').slice(0, 32)}...`);
    
    // Store challenge for signing
    this.serverChallenge = challenge;
    
    // Consume the challenge from buffer
    this.packetBuffer.consume(bytesConsumed);
    
    // Validate we have what we need
    if (!this.clientKeyPair) {
      throw new Error('Client keypair not initialized');
    }
    if (!this.serverX25519PublicKey) {
      throw new Error('Server X25519 public key not initialized');
    }
    if (!this.clientX25519PrivateKey) {
      throw new Error('Client X25519 private key not initialized');
    }
    
    this.state = ConnectionState.AUTHENTICATING;
    
    // Use ATTACH if we have existing session info (40x faster)
    if (this.isAttaching && this.serverSessionPublicKey) {
      logger.info('[ActiveProxy] Using ATTACH for existing session (40x faster)');
      this.sendEncryptedAttach();
    } else {
      // Full AUTH handshake
      this.sendEncryptedAuth();
    }
  }
  
  /**
   * Process encrypted packets after handshake
   * 
   * Java server packet format (post-AUTH):
   *   [2-byte length][1-byte type IN CLEAR][encrypted payload OR padding]
   * 
   * - AUTH_ACK: [2-byte length][1-byte type][cipher (XOR nonce)]
   * - PING_ACK: [2-byte length][1-byte type][optional padding] (no encryption)
   * - CONNECT/DATA/etc.: [2-byte length][1-byte type][encrypted payload]
   * 
   * The type byte is ALWAYS in the clear at offset 2.
   */
  private processEncryptedPackets(): void {
    if (!this.cryptoSession) {
      throw new Error('No crypto session - handshake not complete');
    }
    
    // For AUTH_ACK, we need special handling - XOR-derived nonce
    if (this.state === ConnectionState.AUTHENTICATING) {
      this.processAuthAckPacket();
      return;
    }
    
    // Process session packets: [2-byte length][1-byte type][payload]
    // Re-read buffer each iteration because consume() replaces the internal buffer
    while (this.packetBuffer.getBuffer().length >= 3) {
      const buffer = this.packetBuffer.getBuffer();
      // Read packet length
      const packetLength = buffer.readUInt16BE(0);
      
      // Validate length
      if (packetLength < 3 || packetLength > 1048576) {
        logger.error(`[ActiveProxy] Invalid packet length: ${packetLength}`);
        this.packetBuffer.clear();
        break;
      }
      
      // Wait for complete packet
      if (buffer.length < packetLength) {
        break;
      }
      
      // Log raw packet bytes for protocol debugging
      const rawPreview = buffer.slice(0, Math.min(packetLength, 40)).toString('hex');
      logger.info(`[ActiveProxy] Raw packet: len=${packetLength} hex=${rawPreview}`);
      
      // Read type at offset 2 (in the clear - Java server format)
      const typeByte = buffer.readUInt8(2);
      const type = this.parsePacketType(typeByte);
      
      if (type === null) {
        logger.warn(`[ActiveProxy] Unknown wire type: 0x${typeByte.toString(16)} (raw: ${rawPreview})`);
        this.packetBuffer.consume(packetLength);
        continue;
      }
      
      logger.info(`[ActiveProxy] Parsed type: ${getPacketTypeName(type)} (wire: 0x${typeByte.toString(16)}, enum: 0x${type.toString(16)})`);
      
      // Extract data after [length][type]
      const remainingData = packetLength > 3 ? buffer.slice(3, packetLength) : null;
      
      let decryptedPayload: Buffer = Buffer.alloc(0);
      
      if (remainingData && remainingData.length > 0) {
        // Server format: [type][24-byte nonce][ciphertext]
        // Nonce is ALWAYS prepended in each packet (confirmed by PONG being 171 bytes)
        if (remainingData.length >= NONCE_SIZE + 16) {
          const nonce = new Uint8Array(remainingData.slice(0, NONCE_SIZE));
          const ciphertext = new Uint8Array(remainingData.slice(NONCE_SIZE));
          
          const plaintext = decrypt(ciphertext, nonce, this.cryptoSession.sharedKey);
          
          if (plaintext) {
            decryptedPayload = Buffer.from(plaintext);
            logger.debug(`[ActiveProxy] Decrypted ${getPacketTypeName(type)}: ${decryptedPayload.length} bytes payload`);
          } else {
            logger.warn(`[ActiveProxy] Failed to decrypt ${getPacketTypeName(type)} (${ciphertext.length} cipher bytes)`);
            // Pass raw data so handler can try to make sense of it
            decryptedPayload = Buffer.from(remainingData);
          }
        } else {
          // Data too short for nonce+ciphertext - treat as raw/padding
          logger.debug(`[ActiveProxy] Short payload for ${getPacketTypeName(type)}: ${remainingData.length} bytes (no decryption)`);
          decryptedPayload = Buffer.from(remainingData);
        }
      }
      
      // Consume the packet from buffer
      this.packetBuffer.consume(packetLength);
      
      // Handle the packet
      const packet: Packet = { type, payload: decryptedPayload };
      this.handlePacket(packet);
    }
  }
  
  /**
   * Parse a raw wire byte into a PacketType
   * 
   * The Java server uses: base = ordinal * 8, ACK = base | 0x80
   * Lower 3 bits are randomized (e.g., PONG can be 0x90-0x97).
   * 
   * Confirmed wire evidence:
   *   AUTH_ACK    = 0x80-0x87 (confirmed from working AUTH handshake)
   *   PONG        = 0x90-0x97 (wire 0x92 observed)
   *   CONNECT_ACK = 0x98-0x9F (wire 0x9f observed)
   */
  private parsePacketType(byte: number): PacketType | null {
    // Clear lower 3 bits to get the base type
    const base = byte & 0xF8;
    
    switch (base) {
      // Non-ACK types (ordinal * 8)
      case 0x00: return PacketType.AUTH;           // 0x00-0x07
      case 0x08: return PacketType.ATTACH;         // 0x08-0x0F
      case 0x10: return PacketType.PING;           // 0x10-0x17
      case 0x18: return PacketType.CONNECT;        // 0x18-0x1F
      case 0x20: return PacketType.DISCONNECT;     // 0x20-0x27
      case 0x28: return PacketType.DATA;           // 0x28-0x2F
      case 0x30: return PacketType.ERROR;          // 0x30-0x37
      
      // ACK types (non-ACK base | 0x80)
      case 0x80: return PacketType.AUTH_ACK;       // 0x80-0x87
      case 0x88: return PacketType.ATTACH_ACK;     // 0x88-0x8F
      case 0x90: return PacketType.PONG;           // 0x90-0x97 (PING_ACK)
      case 0x98: return PacketType.CONNECT_ACK;    // 0x98-0x9F
      case 0xA0: return PacketType.DISCONNECT_ACK; // 0xA0-0xA7
      
      default: return null;
    }
  }
  
  /**
   * Process AUTH_ACK packet with XOR-derived nonce
   * 
   * Format: [2-byte length][1-byte type (0x80-0x87)][cipher][padding]
   * - Cipher is 51 bytes: 35-byte plaintext + 16-byte MAC
   * - Java server sends: [32-byte serverPk][2-byte port][1-byte domainEnabled]
   * - Uses XOR-derived nonce (same as AUTH encryption)
   */
  private processAuthAckPacket(): void {
    const buffer = this.packetBuffer.getBuffer();
    
    // Need at least length (2) + type (1) + cipher (51) = 54 bytes
    if (buffer.length < 54) {
      logger.debug(`[ActiveProxy] Waiting for AUTH_ACK, have ${buffer.length} bytes`);
      return;
    }
    
    const packetLength = buffer.readUInt16BE(0);
    if (buffer.length < packetLength) {
      logger.debug(`[ActiveProxy] Waiting for complete AUTH_ACK packet (${packetLength} bytes)`);
      return;
    }
    
    const packetType = buffer.readUInt8(2);
    
    // AUTH_ACK is 0x80-0x87 (packet types are randomized with ACK bit set)
    const isAuthAck = packetType >= 0x80 && packetType <= 0x87;
    // ATTACH_ACK is 0x88-0x8F
    const isAttachAck = packetType >= 0x88 && packetType <= 0x8F;
    // ERROR is 0x70-0x7F
    const isError = packetType >= 0x70 && packetType <= 0x7F;
    
    if (!isAuthAck && !isAttachAck && !isError) {
      logger.error(`[ActiveProxy] Unexpected packet type in AUTHENTICATING state: 0x${packetType.toString(16)}`);
      this.handleDisconnect('Unexpected packet type');
      return;
    }
    
    // Handle ATTACH_ACK (no payload, session already exists)
    if (isAttachAck) {
      logger.info('[ActiveProxy] ATTACH_ACK received - session joined successfully!');
      
      // Consume the packet
      this.packetBuffer.consume(packetLength);
      
      // Update session with server's session key for subsequent packets
      if (this.serverSessionPublicKey && this.clientKeyPair) {
        const sessionSharedKey = nacl.box.before(this.serverSessionPublicKey, this.clientKeyPair.secretKey);
        this.cryptoSession = {
          sharedKey: sessionSharedKey,
          serverPublicKey: this.serverSessionPublicKey,
          clientKeyPair: this.clientKeyPair,
          nonceCounter: BigInt(0),
        };
        
        // Initialize session nonces for ATTACH flow
        if (this.authConnectionNonce) {
          this.sessionSendNonce = new Uint8Array(this.authConnectionNonce);
          this.sessionRecvNonce = new Uint8Array(this.authConnectionNonce);
        }
      }
      
      // Mark as connected
      this.state = ConnectionState.CONNECTED;
      this.reconnectAttempts = 0;
      
      // Start keepalive
      this.startKeepalive();
      
      // Emit connected event
      this.emit('connected', this.sessionId, this.allocatedPort);
      return;
    }
    
    // Extract cipher portion (51 bytes for AUTH_ACK from Java server)
    // Java server format: 32 (pk) + 2 (port) + 1 (domain) = 35 bytes + 16 MAC = 51 bytes
    const AUTH_ACK_CIPHER_SIZE = 51;
    const cipher = buffer.slice(3, 3 + AUTH_ACK_CIPHER_SIZE);
    
    // Compute XOR-derived nonce (same as for AUTH encryption)
    if (!this.clientX25519PrivateKey || !this.serverX25519PublicKey) {
      throw new Error('Missing keys for AUTH_ACK decryption');
    }
    
    const clientX25519Pubkey = ed25519PublicKeyToX25519(new Uint8Array(this.config.publicKey));
    const xorNonce = deriveNonceFromX25519Keys(clientX25519Pubkey, this.serverX25519PublicKey);
    
    // Compute shared key for decryption
    const sharedKey = nacl.box.before(this.serverX25519PublicKey, this.clientX25519PrivateKey);
    
    // Decrypt
    const plaintext = nacl.box.open.after(
      new Uint8Array(cipher),
      xorNonce,
      sharedKey
    );
    
    if (!plaintext) {
      logger.error('[ActiveProxy] Failed to decrypt AUTH_ACK - authentication failed');
      logger.debug(`[ActiveProxy] Cipher length: ${cipher.length}`);
      logger.debug(`[ActiveProxy] Packet type: 0x${packetType.toString(16)}`);
      this.handleDisconnect('AUTH_ACK decryption failed');
      return;
    }
    
    logger.debug(`[ActiveProxy] AUTH_ACK decrypted successfully: ${plaintext.length} bytes`);
    
    // Parse AUTH_ACK: [32-byte serverPk][2-byte port][1-byte domainEnabled]
    if (plaintext.length < 35) {
      logger.error(`[ActiveProxy] AUTH_ACK payload too short: ${plaintext.length} bytes`);
      this.handleDisconnect('Invalid AUTH_ACK payload');
      return;
    }
    
    const serverSessionPk = new Uint8Array(plaintext.slice(0, 32));
    const allocatedPort = (plaintext[32] << 8) | plaintext[33];
    const domainEnabled = plaintext[34] !== 0;
    
    logger.info(`[ActiveProxy] AUTH_ACK received!`);
    logger.debug(`[ActiveProxy] Server session pubkey: ${Buffer.from(serverSessionPk).toString('hex').slice(0, 32)}...`);
    logger.info(`[ActiveProxy] Allocated port: ${allocatedPort}`);
    logger.debug(`[ActiveProxy] Domain enabled: ${domainEnabled}`);
    
    // Consume the packet from buffer
    this.packetBuffer.consume(packetLength);
    
    // Update session with server's session public key for subsequent encryption
    this.sessionId = Buffer.from(serverSessionPk).toString('hex').slice(0, 16);
    this.allocatedPort = allocatedPort;
    
    // Store server session public key for ATTACH reuse (40x faster reconnection)
    this.serverSessionPublicKey = serverSessionPk;
    
    // Update crypto session to use the server's session key for subsequent packets
    // Session encryption uses: client_session_private + server_session_public
    if (this.clientKeyPair) {
      const sessionSharedKey = nacl.box.before(serverSessionPk, this.clientKeyPair.secretKey);
      this.cryptoSession = {
        sharedKey: sessionSharedKey,
        serverPublicKey: serverSessionPk,
        clientKeyPair: this.clientKeyPair,
        nonceCounter: BigInt(0),
      };
      
      // Initialize session nonces from the connectionNonce sent in AUTH
      if (this.authConnectionNonce) {
        this.sessionSendNonce = new Uint8Array(this.authConnectionNonce);
        this.sessionRecvNonce = new Uint8Array(this.authConnectionNonce);
        logger.debug(`[ActiveProxy] Session nonces initialized from connectionNonce: ${Buffer.from(this.authConnectionNonce).toString('hex').slice(0, 16)}...`);
      }
    }
    
    // Mark as connected
    this.state = ConnectionState.CONNECTED;
    this.reconnectAttempts = 0;
    
    // Start keepalive
    this.startKeepalive();
    
    // Emit connected event
    this.emit('connected', this.sessionId, this.allocatedPort);
  }
  
  /**
   * Send encrypted AUTH packet
   * 
   * Protocol (from Boson Photon C++ analysis):
   * 1. Sign the server's challenge with our Ed25519 private key
   * 2. Build plaintext payload: [32-byte sessionPk][24-byte connectionNonce][64-byte signature][1-byte domainLen][domain][padding]
   * 3. Encrypt payload using CryptoBox with XOR-derived nonce (not random!)
   *    - Nonce = XOR(client_node_id, server_node_id), first 24 bytes
   *    - Uses server's permanent X25519 public key and our identity's X25519 private key
   * 4. Build AUTH packet: [2-byte len][1-byte type=0x00][32-byte nodeId][encrypted payload]
   *    - Note: No nonce prepended - server derives it using the same XOR method
   */
  private sendEncryptedAuth(): void {
    if (!this.socket) {
      logger.error('[ActiveProxy] Cannot send auth - no socket');
      return;
    }
    if (!this.serverChallenge) {
      logger.error('[ActiveProxy] Cannot send auth - no challenge received');
      return;
    }
    if (!this.clientKeyPair) {
      logger.error('[ActiveProxy] Cannot send auth - no client keypair');
      return;
    }
    if (!this.serverX25519PublicKey) {
      logger.error('[ActiveProxy] Cannot send auth - no server X25519 key');
      return;
    }
    if (!this.clientX25519PrivateKey) {
      logger.error('[ActiveProxy] Cannot send auth - no client X25519 key');
      return;
    }
    
    logger.info('[ActiveProxy] Building AUTH packet...');
    
    // Step 1: Sign the challenge with Ed25519
    const signature = signEd25519(
      this.serverChallenge,
      new Uint8Array(this.config.privateKey)
    );
    logger.debug(`[ActiveProxy] Signed challenge: ${Buffer.from(signature).toString('hex').slice(0, 32)}...`);
    
    // Step 2: Generate random nonce for the session (included inside encrypted payload)
    // This becomes the BASE nonce for all post-AUTH encrypted communication
    const sessionNonce = generateNonce();
    this.authConnectionNonce = new Uint8Array(sessionNonce);
    
    // Step 3: Build the plaintext auth payload
    // Format: [32-byte sessionPk][24-byte connectionNonce][64-byte signature][1-byte domainLen][domain]
    const authPayload = buildAuthPayload(
      this.clientKeyPair.publicKey,  // Client's ephemeral X25519 pubkey for session
      sessionNonce,                   // Random session nonce (inside encrypted payload)
      signature,
      undefined  // No domain for now
    );
    logger.debug(`[ActiveProxy] Built auth payload: ${authPayload.length} bytes`);
    
    // Step 4: Derive encryption nonce from XOR of X25519 public keys (Boson CryptoContext pattern)
    // From Photon crypto_context.cc:
    //   auto receiver = Id(pk.blob());  // X25519 public key
    //   auto sender = Id(keypair.publicKey().blob());  // X25519 public key
    //   auto dist = Id::distance(sender, receiver);  // XOR
    //   nonce = CryptoBox::Nonce({(uint8_t*)dist.data(), CryptoBox::Nonce::BYTES});
    // NOTE: Uses X25519 public keys (NOT Ed25519 node IDs)!
    const clientX25519Pubkey = ed25519PublicKeyToX25519(new Uint8Array(this.config.publicKey));
    const encryptNonce = deriveNonceFromX25519Keys(clientX25519Pubkey, this.serverX25519PublicKey);
    
    // Debug: log the keys and nonce being used
    logger.debug(`[ActiveProxy] Encryption keys:`);
    logger.debug(`   Client X25519 pubkey: ${Buffer.from(clientX25519Pubkey).toString('hex').slice(0, 32)}...`);
    logger.debug(`   Server X25519 pubkey: ${Buffer.from(this.serverX25519PublicKey).toString('hex').slice(0, 32)}...`);
    logger.debug(`   Client X25519 privkey: ${Buffer.from(this.clientX25519PrivateKey).toString('hex').slice(0, 32)}...`);
    logger.debug(`   XOR-derived nonce (X25519): ${Buffer.from(encryptNonce).toString('hex')}`);
    
    // Encrypt using CryptoBox with the XOR-derived nonce
    const encryptedPayload = nacl.box(
      new Uint8Array(authPayload),
      encryptNonce,
      this.serverX25519PublicKey,
      this.clientX25519PrivateKey
    );
    logger.debug(`[ActiveProxy] Encrypted payload: ${encryptedPayload.length} bytes`);
    
    // Step 5: Build the full AUTH packet
    // Note: Do NOT prepend nonce - server derives the same nonce using XOR(client_id, server_id)
    // AUTH packet format: [2-byte len][1-byte type=0x00][32-byte nodeId][encrypted payload]
    const nodeIdBytes = new Uint8Array(this.config.publicKey);
    
    const authPacket = buildAuthPacket(nodeIdBytes, new Uint8Array(encryptedPayload));
    logger.info(`[ActiveProxy] Sending AUTH packet: ${authPacket.length} bytes`);
    logger.debug(`[ActiveProxy] AUTH packet structure:`);
    logger.debug(`   Length field: ${authPacket.readUInt16BE(0)}`);
    logger.debug(`   Type: 0x${authPacket.readUInt8(2).toString(16)}`);
    logger.debug(`   NodeId: ${authPacket.slice(3, 35).toString('hex').slice(0, 32)}...`);
    logger.debug(`   Encrypted (no nonce prefix): ${authPacket.slice(35).toString('hex').slice(0, 64)}...`);
    
    // Send the packet
    try {
      this.socket.write(authPacket);
      logger.debug('[ActiveProxy] AUTH packet sent');
      
      // Set up crypto session for receiving AUTH_ACK and subsequent messages
      // The server will encrypt using: server_permanent_secret + client_ephemeral_public
      // So we decrypt using: client_ephemeral_secret + server_permanent_public
      const sessionSharedKey = computeSharedSecret(
        this.clientKeyPair.secretKey,
        this.serverX25519PublicKey
      );
      
      this.cryptoSession = {
        sharedKey: sessionSharedKey,
        serverPublicKey: this.serverX25519PublicKey,
        clientKeyPair: this.clientKeyPair,
        nonceCounter: BigInt(0),
      };
      
      logger.debug('[ActiveProxy] Session established, waiting for AUTH_ACK...');
      
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to send AUTH packet: ${error}`);
      this.emit('error', new Error(`Failed to send AUTH: ${error}`));
    }
  }

  /**
   * Send ATTACH packet to join an existing session
   * 
   * ATTACH is similar to AUTH but:
   * - Uses packet type 0x08-0x0F (not 0x00-0x07)
   * - Doesn't include domain field
   * - Server responds with ATTACH_ACK (0x88-0x8F), no port/pk since session exists
   * 
   * Format: [2-byte len][1-byte type=0x08][32-byte nodeId][encrypted payload]
   * Encrypted payload: [32-byte sessionPk][24-byte nonce][64-byte signature]
   * 
   * This is 40x faster than full AUTH (50ms vs 2000ms)
   */
  private sendEncryptedAttach(): void {
    if (!this.socket || !this.serverChallenge || !this.clientKeyPair) {
      logger.error('[ActiveProxy] Cannot send ATTACH - missing required data');
      return;
    }
    if (!this.serverX25519PublicKey || !this.clientX25519PrivateKey) {
      logger.error('[ActiveProxy] Cannot send ATTACH - missing crypto keys');
      return;
    }

    logger.info('[ActiveProxy] Sending ATTACH packet (reusing session)');

    // Step 1: Sign the challenge
    const signature = signEd25519(
      this.serverChallenge,
      new Uint8Array(this.config.privateKey)
    );

    // Step 2: Generate session nonce (stored for post-AUTH session encryption)
    const sessionNonce = nacl.randomBytes(24);
    this.authConnectionNonce = new Uint8Array(sessionNonce);

    // Step 3: Build ATTACH payload (same as AUTH but without domain)
    // Format: [32-byte sessionPk][24-byte sessionNonce][64-byte signature]
    const attachPayload = Buffer.alloc(32 + 24 + 64);
    let offset = 0;
    
    Buffer.from(this.clientKeyPair.publicKey).copy(attachPayload, offset);
    offset += 32;
    
    Buffer.from(sessionNonce).copy(attachPayload, offset);
    offset += 24;
    
    Buffer.from(signature).copy(attachPayload, offset);

    logger.debug(`[ActiveProxy] ATTACH payload: ${attachPayload.length} bytes (no domain)`);

    // Step 4: Encrypt using XOR-derived nonce (same as AUTH)
    const clientX25519Pubkey = ed25519PublicKeyToX25519(new Uint8Array(this.config.publicKey));
    const encryptNonce = deriveNonceFromX25519Keys(clientX25519Pubkey, this.serverX25519PublicKey);

    const encryptedPayload = nacl.box(
      new Uint8Array(attachPayload),
      encryptNonce,
      this.serverX25519PublicKey,
      this.clientX25519PrivateKey
    );

    // Step 5: Build ATTACH packet
    // [2-byte len][1-byte type=0x08][32-byte nodeId][encrypted payload]
    const nodeIdBytes = new Uint8Array(this.config.publicKey);
    const packetLen = 2 + 1 + 32 + encryptedPayload.length;
    
    const attachPacket = Buffer.alloc(packetLen);
    attachPacket.writeUInt16BE(packetLen, 0);
    attachPacket.writeUInt8(PacketType.ATTACH, 2);
    Buffer.from(nodeIdBytes).copy(attachPacket, 3);
    Buffer.from(encryptedPayload).copy(attachPacket, 35);

    logger.info(`[ActiveProxy] Sending ATTACH packet: ${attachPacket.length} bytes`);

    try {
      this.socket.write(attachPacket);
      logger.debug('[ActiveProxy] ATTACH packet sent');

      // Set up crypto session for ATTACH_ACK
      const sessionSharedKey = computeSharedSecret(
        this.clientKeyPair.secretKey,
        this.serverX25519PublicKey
      );

      this.cryptoSession = {
        sharedKey: sessionSharedKey,
        serverPublicKey: this.serverX25519PublicKey,
        clientKeyPair: this.clientKeyPair,
        nonceCounter: BigInt(0),
      };

      logger.debug('[ActiveProxy] Session established, waiting for ATTACH_ACK...');
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to send ATTACH packet: ${error}`);
      this.emit('error', new Error(`Failed to send ATTACH: ${error}`));
    }
  }
  
  /**
   * Send a raw (unencrypted) control packet
   * 
   * Format: [2-byte length][1-byte type]
   * Used for PING and other control packets that have no payload.
   * The Java server reads type at byte offset 2 (in the clear).
   */
  private sendControlPacket(type: PacketType): boolean {
    if (!this.socket) {
      logger.warn('[ActiveProxy] Cannot send control packet - no socket');
      return false;
    }
    
    const packetLength = 3; // 2 (length) + 1 (type)
    const packet = Buffer.alloc(packetLength);
    packet.writeUInt16BE(packetLength, 0);
    packet.writeUInt8(type, 2);
    
    try {
      this.socket.write(packet);
      return true;
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to send control packet: ${error}`);
      return false;
    }
  }

  /**
   * Send an encrypted packet with type in the clear + nonce prepended
   * 
   * Wire format (post-AUTH): [2-byte length][1-byte type][24-byte nonce][ciphertext]
   * 
   * Evidence: Server sends PONG as 171 bytes = 2(len) + 1(type) + 24(nonce) + 128(plain) + 16(MAC).
   * Server uses random nonce per packet, prepended after the type byte.
   * Client must match this format for the server to decrypt.
   */
  private sendEncryptedPacket(type: PacketType, payload: Buffer): boolean {
    if (!this.socket || !this.cryptoSession) {
      logger.warn('[ActiveProxy] Cannot send encrypted packet - no socket or session');
      return false;
    }
    
    // Generate a random nonce for this packet (matching server behavior)
    const nonce = generateNonce();
    
    // Encrypt the payload using the random nonce and session shared key
    const ciphertext = encrypt(
      new Uint8Array(payload),
      nonce,
      this.cryptoSession.sharedKey
    );
    
    // Build packet: [2-byte length][1-byte type][24-byte nonce][ciphertext]
    const packetLength = 2 + 1 + NONCE_SIZE + ciphertext.length;
    const packet = Buffer.alloc(packetLength);
    packet.writeUInt16BE(packetLength, 0);
    packet.writeUInt8(type, 2);
    Buffer.from(nonce).copy(packet, 3);
    Buffer.from(ciphertext).copy(packet, 3 + NONCE_SIZE);
    
    logger.debug(`[ActiveProxy] Sending ${getPacketTypeName(type)}: ${packetLength} bytes (payload: ${payload.length}, cipher: ${ciphertext.length})`);
    
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
    logger.debug(`[ActiveProxy] Received ${getPacketTypeName(packet.type)} packet (payload: ${packet.payload.length} bytes)`);
    
    switch (packet.type) {
      case PacketType.AUTH_ACK:
        this.handleAuthAck(packet.payload);
        break;
        
      case PacketType.AUTH_ERROR:
        this.handleAuthError(packet.payload);
        break;
        
      case PacketType.PING:
        // Server sent us a PING - respond with PONG
        logger.debug('[ActiveProxy] Received PING from server');
        this.sendControlPacket(PacketType.PONG);
        break;
        
      case PacketType.PONG:
        // Keepalive response - connection is alive
        logger.debug('[ActiveProxy] Received PONG (keepalive OK)');
        break;
        
      case PacketType.CONNECT:
        this.handleConnect(packet.payload);
        break;
        
      case PacketType.CONNECT_ACK:
        // Server confirmed upstream connection
        logger.debug('[ActiveProxy] Received CONNECT_ACK');
        break;
        
      case PacketType.DISCONNECT:
        this.handleDisconnectPacket(packet.payload);
        break;
        
      case PacketType.DISCONNECT_ACK:
        // Server confirmed disconnect
        logger.debug('[ActiveProxy] Received DISCONNECT_ACK');
        break;
        
      case PacketType.DATA:
        this.handleDataPacket(packet.payload);
        break;
        
      case PacketType.ERROR:
        this.handleError(packet.payload);
        break;
        
      case PacketType.ATTACH_ACK:
        logger.debug('[ActiveProxy] Received ATTACH_ACK');
        break;
        
      case PacketType.ATTACH_ERROR:
        this.handleAuthError(packet.payload);
        break;
        
      default:
        logger.warn(`[ActiveProxy] Unhandled packet type: 0x${packet.type.toString(16)}`);
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
      
      // Send CONNECT_ACK with connection ID
      if (this.socket && this.cryptoSession) {
        const ackPayload = Buffer.alloc(4);
        ackPayload.writeUInt32BE(conn.connectionId, 0);
        this.sendEncryptedPacket(PacketType.CONNECT_ACK, ackPayload);
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
    
    // Clear crypto session and keys
    this.cryptoSession = null;
    this.clientKeyPair = null;
    this.serverX25519PublicKey = null;
    this.clientX25519PrivateKey = null;
    this.serverChallenge = null;
    this.sessionSendNonce = null;
    this.sessionRecvNonce = null;
    this.authConnectionNonce = null;
    
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
   * Sends an immediate PING first, then continues at the configured interval.
   */
  private startKeepalive(): void {
    this.stopKeepalive();
    
    // Send an immediate PING to prevent early idle timeout
    // PING is a control packet: [2-byte length=3][1-byte type=PING] - no encryption
    if (this.isConnected() && this.socket) {
      if (this.sendControlPacket(PacketType.PING)) {
        logger.info('[ActiveProxy] Sent initial PING (keepalive)');
      }
    }
    
    this.keepaliveTimer = setInterval(() => {
      if (this.isConnected() && this.socket) {
        if (this.sendControlPacket(PacketType.PING)) {
          logger.debug('[ActiveProxy] Sent PING keepalive');
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
