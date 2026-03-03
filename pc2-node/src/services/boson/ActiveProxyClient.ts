/**
 * Active Proxy Client
 * 
 * TCP client for connecting to Active Proxy on super nodes.
 * Enables NAT traversal by maintaining a persistent connection
 * that relays incoming HTTP/WebSocket requests.
 * 
 * Protocol compatibility:
 * - Server: Boson.Java boson-active-proxy-2.0.8-SNAPSHOT
 * - Uses NaCl CryptoBox (libsodium via Apache Tuweni) for encrypted communication
 * 
 * === CONNECTION LIFECYCLE ===
 * 
 * 1. TCP connect to supernode:8090
 * 2. Receive raw challenge (32-256 random bytes)
 * 3. Send AUTH: [len][0x00][32-byte nodeId][encrypted(sessionPk + nonce + sig + domain)]
 * 4. Receive AUTH_ACK: [len][0x80-0x87][cipher(serverSessionPk + port + domainEnabled)][padding]
 * 5. Session established - enter CONNECTED state
 * 6. Keepalive: send PING → receive PING_ACK
 * 7. Proxy flow: receive CONNECT → connect local → CONNECT_ACK → DATA relay → DISCONNECT
 * 
 * === SESSION ENCRYPTION ===
 * 
 * Key: DH(clientSessionSk, serverSessionPk) via nacl.box.before
 * Nonce: connectionNonce from AUTH payload (fixed for entire session)
 * 
 * Decompiled from: boson-active-proxy-2.0.8-SNAPSHOT.jar
 */

import net from 'net';
import nacl from 'tweetnacl';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
import {
  PacketType,
  PacketBuffer,
  parsePacketType,
  hasEncryptedPayload,
  getKnownCipherSize,
  parseConnectPayload,
  getPacketTypeName,
  LENGTH_FIELD_SIZE,
  PACKET_HEADER_SIZE,
  type Packet,
} from './ProxyProtocol.js';
import {
  generateKeyPair,
  computeSharedSecret,
  generateNonce,
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
  domain?: string;             // Domain name for virtual host registration (e.g., "elastos")
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
 * Keepalive tuning: The Boson Java server uses Vert.x with 120s idle timeout.
 * We PING every 30s to stay well within that window.
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
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private isShuttingDown: boolean = false;
  
  // CryptoBox session state
  private cryptoSession: CryptoSession | null = null;
  private clientKeyPair: KeyPair | null = null;
  private serverX25519PublicKey: Uint8Array | null = null;
  private clientX25519PrivateKey: Uint8Array | null = null;
  private serverChallenge: Uint8Array | null = null;
  
  // Session nonce: the connectionNonce from AUTH payload, fixed for entire session
  private authConnectionNonce: Uint8Array | null = null;
  
  // ATTACH support - reuse existing session for faster reconnection
  private serverSessionPublicKey: Uint8Array | null = null;
  private isAttaching: boolean = false;
  
  // Proxy connection state (one active at a time per TCP connection)
  private proxyState: 'idle' | 'connecting' | 'relaying' | 'disconnecting' = 'idle';

  constructor(config: Partial<ActiveProxyConfig> & Pick<ActiveProxyConfig, 'host' | 'port' | 'nodeId' | 'publicKey' | 'privateKey' | 'serverPublicKey' | 'localPort'>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config } as ActiveProxyConfig;
    this.packetBuffer = new PacketBuffer();
  }

  /** Get current connection state */
  getState(): ConnectionState {
    return this.state;
  }

  /** Get session ID (available after authentication) */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /** Get allocated port (available after authentication) */
  getAllocatedPort(): number | null {
    return this.allocatedPort;
  }

  /** Check if connected */
  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  /** Get session info for ATTACH reuse */
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

  /** Set session info for ATTACH (reusing existing session) */
  setSessionInfo(sessionInfo: { sessionId: string; serverSessionPk: Uint8Array; allocatedPort: number }): void {
    this.sessionId = sessionInfo.sessionId;
    this.serverSessionPublicKey = sessionInfo.serverSessionPk;
    this.allocatedPort = sessionInfo.allocatedPort;
    this.isAttaching = true;
    logger.debug(`[ActiveProxy] Session info set for ATTACH: ${this.sessionId}`);
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
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to convert server public key: ${error}`);
      throw error;
    }
    
    // Convert our Ed25519 private key to X25519
    try {
      this.clientX25519PrivateKey = ed25519PrivateKeyToX25519(
        new Uint8Array(this.config.privateKey)
      );
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to convert client private key: ${error}`);
      throw error;
    }
    
    // Generate ephemeral X25519 keypair for session encryption
    this.clientKeyPair = generateKeyPair();
    
    return new Promise((resolve, reject) => {
      logger.info(`[ActiveProxy] Connecting to ${this.config.host}:${this.config.port}...`);
      
      this.socket = new net.Socket();
      
      // Connection timeout
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

  /** Disconnect from the Active Proxy server */
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
    
    logger.info('[ActiveProxy] Disconnected');
  }

  /**
   * Send data to the proxied connection
   * 
   * DATA payload is raw bytes (no framing). The connection is implicit
   * (one active connection per ProxyConnection).
   * 
   * Server decrypts: session.decrypt(packet[3..end], nonce)
   * Then writes plaintext directly to the client socket.
   */
  sendData(connectionId: number, data: Buffer): boolean {
    if (!this.isConnected() || !this.socket || !this.cryptoSession || !this.authConnectionNonce) {
      return false;
    }
    
    // Max packet is 65535 (2-byte length field limit).
    // Packet = [2-byte len][1-byte type][ciphertext]
    // NaCl box adds 16-byte MAC to ciphertext, so:
    //   max ciphertext = 65535 - PACKET_HEADER_SIZE(3) = 65532
    //   max plaintext  = 65532 - 16 (NaCl MAC)        = 65516
    const MAX_PLAINTEXT_PER_PACKET = 65535 - PACKET_HEADER_SIZE - 16;
    
    try {
      // Chunk data if it exceeds the max plaintext size per packet
      for (let offset = 0; offset < data.length; offset += MAX_PLAINTEXT_PER_PACKET) {
        const chunk = data.subarray(offset, Math.min(offset + MAX_PLAINTEXT_PER_PACKET, data.length));
        
        // Encrypt chunk (no connectionId framing - server expects raw payload)
        const ciphertext = encrypt(
          new Uint8Array(chunk),
          this.authConnectionNonce,
          this.cryptoSession.sharedKey
        );
        
        // Build DATA packet: [2-byte len][1-byte type][cipher]
        const packetLength = PACKET_HEADER_SIZE + ciphertext.length;
        const packet = Buffer.alloc(packetLength);
        packet.writeUInt16BE(packetLength, 0);
        packet.writeUInt8(PacketType.DATA, 2);
        Buffer.from(ciphertext).copy(packet, PACKET_HEADER_SIZE);
        
        this.socket.write(packet);
      }
      return true;
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to send DATA: ${error}`);
      return false;
    }
  }

  /**
   * Close a proxied connection
   * 
   * DISCONNECT has no payload, no encryption. Just [len=3][type].
   * Server's handleDisconnect() does not read any payload.
   */
  closeConnection(connectionId: number): void {
    if (!this.isConnected() || !this.socket) {
      return;
    }
    
    this.sendControlPacket(PacketType.DISCONNECT);
    this.proxyState = 'disconnecting';
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE: Data handling
  // ═══════════════════════════════════════════════════════

  /** Handle incoming data from socket */
  private handleData(data: Buffer): void {
    try {
      this.packetBuffer.append(data);
      
      if (this.state === ConnectionState.HANDSHAKING) {
        this.processServerHello();
      } else if (this.state === ConnectionState.AUTHENTICATING || 
                 this.state === ConnectionState.CONNECTED) {
        this.processPackets();
      }
    } catch (error) {
      const preview = data.slice(0, 40).toString('hex');
      logger.error(`[ActiveProxy] Protocol error: ${error}. Data preview: ${preview}`);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      this.handleDisconnect('Protocol error');
    }
  }
  
  /**
   * Process server challenge message
   * 
   * Server sends raw (unencrypted) challenge: [2-byte length][random bytes]
   */
  private processServerHello(): void {
    const buffer = this.packetBuffer.getBuffer();
    
    if (buffer.length < LENGTH_FIELD_SIZE) {
      return;
    }
    
    const challengeResult = parseServerChallenge(buffer);
    if (!challengeResult) {
      return;
    }
    
    const { challenge, bytesConsumed } = challengeResult;
    
    logger.info(`[ActiveProxy] Received server challenge: ${challenge.length} bytes`);
    
    this.serverChallenge = challenge;
    this.packetBuffer.consume(bytesConsumed);
    
    if (!this.clientKeyPair || !this.serverX25519PublicKey || !this.clientX25519PrivateKey) {
      throw new Error('Crypto keys not initialized');
    }
    
    this.state = ConnectionState.AUTHENTICATING;
    
    if (this.isAttaching && this.serverSessionPublicKey) {
      this.sendEncryptedAttach();
    } else {
      this.sendEncryptedAuth();
    }
  }
  
  /**
   * Process packets after handshake
   * 
   * Packet format: [2-byte length][1-byte type][body]
   * 
   * Body interpretation depends on packet type:
   *   - PING_ACK, DISCONNECT, DISCONNECT_ACK: random padding (ignore)
   *   - CONNECT: cipher(19 bytes → 35 bytes) + random padding
   *   - DATA: cipher (entire body, no padding)
   *   - ERROR: cipher (entire body, no padding)
   *   - AUTH_ACK: cipher(35 bytes → 51 bytes) + random padding (special key)
   */
  private processPackets(): void {
    // AUTH_ACK uses different encryption (identity keys, XOR nonce)
    if (this.state === ConnectionState.AUTHENTICATING) {
      this.processAuthAckPacket();
      return;
    }
    
    if (!this.cryptoSession || !this.authConnectionNonce) {
      throw new Error('No crypto session - handshake not complete');
    }
    
    while (this.packetBuffer.getBuffer().length >= PACKET_HEADER_SIZE) {
      const buffer = this.packetBuffer.getBuffer();
      const packetLength = buffer.readUInt16BE(0);
      
      if (packetLength < PACKET_HEADER_SIZE || packetLength > 65535) {
        logger.error(`[ActiveProxy] Invalid packet length: ${packetLength}`);
        this.packetBuffer.clear();
        break;
      }
      
      if (buffer.length < packetLength) {
        break; // Wait for complete packet
      }
      
      // Parse type using Java's valueOf() logic
      const typeByte = buffer.readUInt8(2);
      const type = parsePacketType(typeByte);
      
      if (type === null) {
        logger.warn(`[ActiveProxy] Unknown wire type: 0x${typeByte.toString(16)}`);
        this.packetBuffer.consume(packetLength);
        continue;
      }
      
      logger.debug(`[ActiveProxy] Packet: ${getPacketTypeName(type)} (wire: 0x${typeByte.toString(16)}, len=${packetLength})`);
      
      // Extract body after [length][type]
      const bodyLength = packetLength - PACKET_HEADER_SIZE;
      const body = bodyLength > 0 ? buffer.slice(PACKET_HEADER_SIZE, packetLength) : null;
      
      // Decrypt if this packet type has encrypted payload
      let payload: Buffer = Buffer.alloc(0);
      
      if (hasEncryptedPayload(type) && body && body.length > 0) {
        payload = this.decryptPayload(type, body);
      }
      // else: padding-only packets (PING_ACK, DISCONNECT, etc.) - no decryption needed
      
      this.packetBuffer.consume(packetLength);
      
      this.handlePacket({ type, payload });
    }
  }
  
  /**
   * Decrypt the payload portion of an encrypted packet
   * 
   * For fixed-size payloads (CONNECT): extract exactly the cipher bytes, ignore padding
   * For variable-size payloads (DATA, ERROR): entire body is cipher (no padding)
   */
  private decryptPayload(type: PacketType, body: Buffer): Buffer {
    const knownCipherSize = getKnownCipherSize(type);
    
    let ciphertext: Uint8Array;
    
    if (knownCipherSize !== null) {
      // Fixed-size cipher (e.g., CONNECT = 35 bytes) - rest is random padding
      if (body.length < knownCipherSize) {
        logger.warn(`[ActiveProxy] ${getPacketTypeName(type)} body too short for cipher: ${body.length} < ${knownCipherSize}`);
        return Buffer.alloc(0);
      }
      ciphertext = new Uint8Array(body.slice(0, knownCipherSize));
    } else {
      // Variable-size cipher (DATA, ERROR) - entire body is cipher, no padding
      ciphertext = new Uint8Array(body);
    }
    
    // Decrypt using session key and connectionNonce
    const plaintext = decrypt(
      ciphertext,
      this.authConnectionNonce!,
      this.cryptoSession!.sharedKey
    );
    
    if (plaintext) {
      logger.debug(`[ActiveProxy] ✅ Decrypted ${getPacketTypeName(type)}: ${plaintext.length} bytes`);
      return Buffer.from(plaintext);
    }
    
    logger.warn(`[ActiveProxy] ❌ Failed to decrypt ${getPacketTypeName(type)} (${ciphertext.length} cipher bytes)`);
    return Buffer.alloc(0);
  }

  /**
   * Process AUTH_ACK packet with identity-based encryption
   * 
   * Format: [2-byte length][1-byte type (0x80-0x87)][51-byte cipher][random padding]
   * Cipher: NaCl box with XOR-derived nonce and DH(identity_x25519_sk, server_permanent_x25519_pk)
   * Plaintext: [32-byte serverSessionPk][2-byte port (BE)][1-byte domainEnabled]
   */
  private processAuthAckPacket(): void {
    const buffer = this.packetBuffer.getBuffer();
    
    // Need at least header + cipher = 3 + 51 = 54 bytes
    if (buffer.length < 54) {
      return;
    }
    
    const packetLength = buffer.readUInt16BE(0);
    if (buffer.length < packetLength) {
      return;
    }
    
    const packetType = buffer.readUInt8(2);
    const parsedType = parsePacketType(packetType);
    
    if (parsedType === PacketType.ATTACH_ACK) {
      this.handleAttachAck(packetLength);
      return;
    }
    
    if (parsedType === PacketType.ERROR) {
      const errorBody = packetLength > PACKET_HEADER_SIZE ? buffer.slice(PACKET_HEADER_SIZE, packetLength).toString('utf8') : 'Unknown error';
      logger.error(`[ActiveProxy] Server rejected auth: ${errorBody}`);
      this.packetBuffer.consume(packetLength);
      this.handleDisconnect('Auth rejected');
      return;
    }
    
    if (parsedType !== PacketType.AUTH_ACK) {
      logger.error(`[ActiveProxy] Expected AUTH_ACK, got: 0x${packetType.toString(16)} (${parsedType ? getPacketTypeName(parsedType) : 'unknown'})`);
      this.packetBuffer.consume(packetLength);
      this.handleDisconnect('Unexpected packet in auth state');
      return;
    }
    
    logger.info('[ActiveProxy] AUTH_ACK received!');
    
    // Extract cipher (51 bytes: 35 plaintext + 16 MAC)
    const AUTH_ACK_CIPHER_SIZE = 51;
    const cipher = buffer.slice(PACKET_HEADER_SIZE, PACKET_HEADER_SIZE + AUTH_ACK_CIPHER_SIZE);
    
    // Decrypt with identity keys + XOR nonce (same method as AUTH encryption)
    if (!this.clientX25519PrivateKey || !this.serverX25519PublicKey) {
      throw new Error('Missing keys for AUTH_ACK decryption');
    }
    
    const clientX25519Pubkey = ed25519PublicKeyToX25519(new Uint8Array(this.config.publicKey));
    const xorNonce = deriveNonceFromX25519Keys(clientX25519Pubkey, this.serverX25519PublicKey);
    const sharedKey = nacl.box.before(this.serverX25519PublicKey, this.clientX25519PrivateKey);
    
    const plaintext = nacl.box.open.after(
      new Uint8Array(cipher),
      xorNonce,
      sharedKey
    );
    
    if (!plaintext) {
      logger.error('[ActiveProxy] Failed to decrypt AUTH_ACK');
      this.packetBuffer.consume(packetLength);
      this.handleDisconnect('AUTH_ACK decryption failed');
      return;
    }
    
    // Parse: [32-byte serverSessionPk][2-byte port (BE)][1-byte domainEnabled]
    if (plaintext.length < 35) {
      logger.error(`[ActiveProxy] AUTH_ACK payload too short: ${plaintext.length}`);
      this.packetBuffer.consume(packetLength);
      this.handleDisconnect('Invalid AUTH_ACK payload');
      return;
    }
    
    const serverSessionPk = new Uint8Array(plaintext.slice(0, 32));
    const allocatedPort = (plaintext[32] << 8) | plaintext[33];
    const domainEnabled = plaintext[34] !== 0;
    
    logger.info(`[ActiveProxy] Allocated port: ${allocatedPort}`);
    logger.info(`[ActiveProxy] Domain enabled: ${domainEnabled}`);
    
    this.packetBuffer.consume(packetLength);
    
    // Store session info
    this.sessionId = Buffer.from(serverSessionPk).toString('hex').slice(0, 16);
    this.allocatedPort = allocatedPort;
    this.serverSessionPublicKey = serverSessionPk;
    
    // Compute session shared key: DH(clientSessionSk, serverSessionPk)
    // This matches the Java: CryptoBox.fromKeys(clientPk, serverSessionSk) 
    if (this.clientKeyPair) {
      const sessionSharedKey = nacl.box.before(serverSessionPk, this.clientKeyPair.secretKey);
      this.cryptoSession = {
        sharedKey: sessionSharedKey,
        serverPublicKey: serverSessionPk,
        clientKeyPair: this.clientKeyPair,
        nonceCounter: BigInt(0),
      };
      logger.debug(`[ActiveProxy] Session key computed: DH(clientSessionSk, serverSessionPk)`);
    }
    
    this.state = ConnectionState.CONNECTED;
    this.reconnectAttempts = 0;
    
    this.startKeepalive();
    this.emit('connected', this.sessionId, this.allocatedPort);
  }
  
  /**
   * Handle ATTACH_ACK - session joined, no payload
   */
  private handleAttachAck(packetLength: number): void {
    logger.info('[ActiveProxy] ATTACH_ACK received - session joined!');
    
    this.packetBuffer.consume(packetLength);
    
    // Compute session key using existing server session pk
    if (this.serverSessionPublicKey && this.clientKeyPair) {
      const sessionSharedKey = nacl.box.before(this.serverSessionPublicKey, this.clientKeyPair.secretKey);
      this.cryptoSession = {
        sharedKey: sessionSharedKey,
        serverPublicKey: this.serverSessionPublicKey,
        clientKeyPair: this.clientKeyPair,
        nonceCounter: BigInt(0),
      };
    }
    
    this.state = ConnectionState.CONNECTED;
    this.reconnectAttempts = 0;
    
    this.startKeepalive();
    this.emit('connected', this.sessionId, this.allocatedPort);
  }
  
  // ═══════════════════════════════════════════════════════
  // PRIVATE: Auth / Attach
  // ═══════════════════════════════════════════════════════

  /**
   * Send encrypted AUTH packet
   * 
   * 1. Sign challenge with Ed25519
   * 2. Build payload: [32-byte sessionPk][24-byte connectionNonce][64-byte signature][1-byte domainLen][domain]
   * 3. Encrypt with XOR-derived nonce + DH(identity_x25519_sk, server_x25519_pk)
   * 4. Build AUTH: [2-byte len][1-byte type=0x00][32-byte nodeId][encrypted payload]
   */
  private sendEncryptedAuth(): void {
    if (!this.socket || !this.serverChallenge || !this.clientKeyPair ||
        !this.serverX25519PublicKey || !this.clientX25519PrivateKey) {
      logger.error('[ActiveProxy] Cannot send auth - missing required data');
      return;
    }
    
    logger.info('[ActiveProxy] Building AUTH packet...');
    
    // Sign the challenge
    const signature = signEd25519(
      this.serverChallenge,
      new Uint8Array(this.config.privateKey)
    );
    
    // Generate connectionNonce (used for ALL session encryption after AUTH)
    const connectionNonce = generateNonce();
    this.authConnectionNonce = new Uint8Array(connectionNonce);
    
    // Build plaintext payload
    // NOTE: Do NOT send domain - the Java server's helper service is not configured
    // and crashes the connection when a domain is included. We handle routing via
    // our own gateway endpoint registration in ConnectivityService instead.
    const authPayload = buildAuthPayload(
      this.clientKeyPair.publicKey,
      connectionNonce,
      signature,
      undefined
    );
    
    // Derive XOR nonce from X25519 public keys
    const clientX25519Pubkey = ed25519PublicKeyToX25519(new Uint8Array(this.config.publicKey));
    const encryptNonce = deriveNonceFromX25519Keys(clientX25519Pubkey, this.serverX25519PublicKey);
    
    // Encrypt with identity keys
    const encryptedPayload = nacl.box(
      new Uint8Array(authPayload),
      encryptNonce,
      this.serverX25519PublicKey,
      this.clientX25519PrivateKey
    );
    
    // Build AUTH packet: [len][type=0x00][nodeId][cipher]
    const nodeIdBytes = new Uint8Array(this.config.publicKey);
    const authPacket = buildAuthPacket(nodeIdBytes, new Uint8Array(encryptedPayload));
    
    logger.info(`[ActiveProxy] Sending AUTH packet: ${authPacket.length} bytes`);
    
    try {
      this.socket.write(authPacket);
      
      // Set up initial crypto session (will be updated with server session key in AUTH_ACK)
      const initialSharedKey = computeSharedSecret(
        this.clientKeyPair.secretKey,
        this.serverX25519PublicKey
      );
      
      this.cryptoSession = {
        sharedKey: initialSharedKey,
        serverPublicKey: this.serverX25519PublicKey,
        clientKeyPair: this.clientKeyPair,
        nonceCounter: BigInt(0),
      };
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to send AUTH packet: ${error}`);
      this.emit('error', new Error(`Failed to send AUTH: ${error}`));
    }
  }

  /**
   * Send ATTACH packet to join an existing session
   */
  private sendEncryptedAttach(): void {
    if (!this.socket || !this.serverChallenge || !this.clientKeyPair ||
        !this.serverX25519PublicKey || !this.clientX25519PrivateKey) {
      logger.error('[ActiveProxy] Cannot send ATTACH - missing required data');
      return;
    }

    logger.info('[ActiveProxy] Sending ATTACH packet (reusing session)');

    const signature = signEd25519(
      this.serverChallenge,
      new Uint8Array(this.config.privateKey)
    );

    const connectionNonce = nacl.randomBytes(24);
    this.authConnectionNonce = new Uint8Array(connectionNonce);

    // ATTACH payload: [32-byte sessionPk][24-byte nonce][64-byte signature]
    const attachPayload = Buffer.alloc(32 + 24 + 64);
    let offset = 0;
    Buffer.from(this.clientKeyPair.publicKey).copy(attachPayload, offset);
    offset += 32;
    Buffer.from(connectionNonce).copy(attachPayload, offset);
    offset += 24;
    Buffer.from(signature).copy(attachPayload, offset);

    // Encrypt with XOR nonce + identity keys
    const clientX25519Pubkey = ed25519PublicKeyToX25519(new Uint8Array(this.config.publicKey));
    const encryptNonce = deriveNonceFromX25519Keys(clientX25519Pubkey, this.serverX25519PublicKey);

    const encryptedPayload = nacl.box(
      new Uint8Array(attachPayload),
      encryptNonce,
      this.serverX25519PublicKey,
      this.clientX25519PrivateKey
    );

    // Build ATTACH: [len][type=0x08][nodeId][cipher]
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

      const initialSharedKey = computeSharedSecret(
        this.clientKeyPair.secretKey,
        this.serverX25519PublicKey
      );

      this.cryptoSession = {
        sharedKey: initialSharedKey,
        serverPublicKey: this.serverX25519PublicKey,
        clientKeyPair: this.clientKeyPair,
        nonceCounter: BigInt(0),
      };
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to send ATTACH: ${error}`);
      this.emit('error', new Error(`Failed to send ATTACH: ${error}`));
    }
  }
  
  // ═══════════════════════════════════════════════════════
  // PRIVATE: Packet sending
  // ═══════════════════════════════════════════════════════

  /**
   * Send a control packet (no payload, no encryption)
   * Format: [2-byte length=3][1-byte type]
   */
  private sendControlPacket(type: PacketType): boolean {
    if (!this.socket) {
      return false;
    }
    
    const packet = Buffer.alloc(PACKET_HEADER_SIZE);
    packet.writeUInt16BE(PACKET_HEADER_SIZE, 0);
    packet.writeUInt8(type, 2);
    
    try {
      this.socket.write(packet);
      return true;
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to send ${getPacketTypeName(type)}: ${error}`);
      return false;
    }
  }
  
  /**
   * Send CONNECT_ACK to server
   * 
   * From Java handleConnectAck():
   *   boolean success = (packet.getByte(3) & 1) != 0;
   * 
   * Format: [2-byte length=4][1-byte type=CONNECT_ACK][1-byte success]
   * NOT encrypted - server reads the byte directly.
   */
  private sendConnectAck(success: boolean): boolean {
    if (!this.socket) {
      return false;
    }
    
    const packet = Buffer.alloc(4);
    packet.writeUInt16BE(4, 0);
    packet.writeUInt8(PacketType.CONNECT_ACK, 2);
    packet.writeUInt8(success ? 0x01 : 0x00, 3);
    
    try {
      this.socket.write(packet);
      logger.debug(`[ActiveProxy] Sent CONNECT_ACK (success=${success})`);
      return true;
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to send CONNECT_ACK: ${error}`);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE: Packet handlers
  // ═══════════════════════════════════════════════════════

  /** Handle a decoded packet */
  private handlePacket(packet: Packet): void {
    switch (packet.type) {
      case PacketType.PING_ACK:
        logger.debug('[ActiveProxy] Received PING_ACK (keepalive OK)');
        break;
        
      case PacketType.PING:
        // Server sent us a PING - respond with PING_ACK
        logger.debug('[ActiveProxy] Received PING from server');
        this.sendControlPacket(PacketType.PING_ACK);
        break;
        
      case PacketType.CONNECT:
        this.handleConnect(packet.payload);
        break;
        
      case PacketType.DATA:
        this.handleDataPacket(packet.payload);
        break;
        
      case PacketType.DISCONNECT:
        this.handleDisconnectPacket();
        break;
        
      case PacketType.DISCONNECT_ACK:
        this.handleDisconnectAckPacket();
        break;
        
      case PacketType.ERROR:
        this.handleError(packet.payload);
        break;
        
      default:
        logger.debug(`[ActiveProxy] Unhandled: ${getPacketTypeName(packet.type)}`);
    }
  }

  /**
   * Handle CONNECT packet - server telling us an external client wants to connect
   * 
   * Decrypted payload format (from Java sendConnect):
   *   [1-byte addrLen][16-byte addr (zero-padded)][2-byte port (BE)]
   * 
   * Flow:
   *   1. Decrypt and parse connect info
   *   2. Send CONNECT_ACK(true) to server immediately
   *   3. Emit 'connection' event → ConnectivityService creates local socket
   *   4. Server enters Relaying state, starts sending DATA
   */
  private handleConnect(payload: Buffer): void {
    try {
      if (payload.length === 0) {
        logger.warn('[ActiveProxy] CONNECT with empty payload (decryption failed?)');
        this.sendConnectAck(false);
        return;
      }
      
      const connectInfo = parseConnectPayload(payload);
      
      logger.info(`[ActiveProxy] 🔗 CONNECT from ${connectInfo.address}:${connectInfo.port}`);
      
      this.proxyState = 'relaying';
      
      // Tell server we accept the connection
      this.sendConnectAck(true);
      
      // Emit event for ConnectivityService to create local socket
      this.emit('connection', {
        connectionId: 0,
        sourceAddress: connectInfo.address,
        sourcePort: connectInfo.port,
      });
      
    } catch (error) {
      logger.error(`[ActiveProxy] Failed to handle CONNECT: ${error}`);
      this.sendConnectAck(false);
    }
  }

  /**
   * Handle DATA packet - emit for ConnectivityService to forward to local socket
   * 
   * DATA payload is raw HTTP/TCP data (no framing/connectionId).
   * Server: session.encrypt(rawData, nonce) → cipher
   * We: decrypt(cipher, nonce) → rawData → emit for ConnectivityService
   */
  private handleDataPacket(payload: Buffer): void {
    if (payload.length === 0) {
      return;
    }
    
    // Emit for ConnectivityService to forward to local socket
    this.emit('data', 0, payload);
  }

  /**
   * Handle DISCONNECT packet from server
   * 
   * DISCONNECT has no payload (server sends null payload).
   * We should close our local socket and send DISCONNECT_ACK.
   */
  private handleDisconnectPacket(): void {
    logger.info('[ActiveProxy] Server sent DISCONNECT');
    
    // Send DISCONNECT_ACK
    this.sendControlPacket(PacketType.DISCONNECT_ACK);
    
    this.proxyState = 'idle';
    this.emit('connectionClosed', 0);
  }

  /**
   * Handle DISCONNECT_ACK from server
   */
  private handleDisconnectAckPacket(): void {
    logger.debug('[ActiveProxy] Received DISCONNECT_ACK');
    this.proxyState = 'idle';
  }

  /** Handle ERROR packet */
  private handleError(payload: Buffer): void {
    const message = payload.length > 0 ? payload.toString('utf8') : 'Unknown error';
    logger.error(`[ActiveProxy] Server error: ${message}`);
    this.emit('error', new Error(`Server error: ${message}`));
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE: Connection management
  // ═══════════════════════════════════════════════════════

  /** Handle disconnection */
  private handleDisconnect(reason: string): void {
    const wasConnected = this.state === ConnectionState.CONNECTED;
    
    this.stopKeepalive();
    this.state = ConnectionState.DISCONNECTED;
    this.sessionId = null;
    this.allocatedPort = null;
    this.packetBuffer.clear();
    
    // Clear crypto state
    this.cryptoSession = null;
    this.clientKeyPair = null;
    this.serverX25519PublicKey = null;
    this.clientX25519PrivateKey = null;
    this.serverChallenge = null;
    this.authConnectionNonce = null;
    this.proxyState = 'idle';
    
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    
    this.emit('disconnected', reason);
    
    if (!this.isShuttingDown && wasConnected) {
      this.scheduleReconnect();
    }
  }

  /**
   * Start keepalive timer
   * Send immediate PING then continue at interval.
   */
  private startKeepalive(): void {
    this.stopKeepalive();
    
    // PING is unencrypted: [len=3][type=PING]
    if (this.isConnected() && this.socket) {
      if (this.sendControlPacket(PacketType.PING)) {
        logger.info('[ActiveProxy] Sent initial PING (keepalive)');
      }
    }
    
    this.keepaliveTimer = setInterval(() => {
      if (this.isConnected() && this.socket) {
        if (!this.sendControlPacket(PacketType.PING)) {
          logger.error('[ActiveProxy] Failed to send PING');
        }
      }
    }, this.config.keepaliveIntervalMs);
  }

  /** Stop keepalive timer */
  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  /** Schedule reconnection attempt */
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

  /** Cancel scheduled reconnection */
  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
