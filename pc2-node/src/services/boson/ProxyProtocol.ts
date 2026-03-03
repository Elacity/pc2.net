/**
 * Proxy Protocol
 * 
 * Binary packet encoder/decoder for Active Proxy communication.
 * Implements the protocol used by the Java Active Proxy server.
 * 
 * Protocol compatibility:
 * - Server: Boson.Java boson-active-proxy-2.0.8-SNAPSHOT
 * - Uses NaCl CryptoBox (libsodium via Apache Tuweni) for encrypted communication
 * 
 * === PACKET FORMAT (post-AUTH) ===
 * 
 * All packets: [2-byte length (BE, includes itself)][1-byte type (in clear)][body]
 * 
 * Body depends on packet type:
 *   - Encrypted + padding: CONNECT (cipher of known-size payload + random padding)
 *   - Encrypted only:      DATA, ERROR (cipher only, no padding)
 *   - No cipher:           PING_ACK, DISCONNECT, DISCONNECT_ACK, ATTACH_ACK (padding only)
 *   - Special:             AUTH_ACK (cipher with identity keys + padding)
 * 
 * Encryption: NaCl crypto_box_easy_afternm (XSalsa20-Poly1305)
 *   - Key: DH(clientSessionPk, serverSessionSk) via nacl.box.before
 *   - Nonce: connectionNonce from AUTH payload (fixed for entire session, never incremented)
 *   - Cipher format: [16-byte Poly1305 MAC][encrypted body]
 * 
 * Padding: Random 0-255 bytes appended to all packets EXCEPT DATA and ERROR.
 * 
 * === PACKET TYPE ENCODING ===
 * 
 * Java enum uses variable-width ranges per type:
 *   AUTH:       0x00-0x07  (8 values)     ACK: 0x80-0x87
 *   ATTACH:     0x08-0x0F  (8 values)     ACK: 0x88-0x8F
 *   PING:       0x10-0x1F  (16 values)    ACK: 0x90-0x9F
 *   CONNECT:    0x20-0x2F  (16 values)    ACK: 0xA0-0xAF
 *   DISCONNECT: 0x30-0x3F  (16 values)    ACK: 0xB0-0xBF
 *   DATA:       0x40-0x6F  (48 values)    (no ACK)
 *   ERROR:      0x70-0x7F  (16 values)    (no ACK)
 * 
 * Wire values are randomized within each range. ACK types have bit 7 set.
 * 
 * Decompiled from: boson-active-proxy-2.0.8-SNAPSHOT.jar
 *   - io.bosonnetwork.service.activeproxy.PacketType
 *   - io.bosonnetwork.service.activeproxy.ProxyConnection
 *   - io.bosonnetwork.service.activeproxy.ProxySession
 */

/**
 * Packet type codes for Active Proxy protocol
 * 
 * These are the BASE values (minimum of each range).
 * Wire values are randomized within the range.
 * ACK types have the high bit (0x80) set.
 * 
 * Source: Java PacketType.valueOf() decompilation
 */
export enum PacketType {
  // Authentication: range 0x00-0x07
  AUTH = 0x00,
  // AUTH_ACK: range 0x80-0x87
  AUTH_ACK = 0x80,
  
  // Session attachment: range 0x08-0x0F
  ATTACH = 0x08,
  // ATTACH_ACK: range 0x88-0x8F
  ATTACH_ACK = 0x88,
  
  // Keep-alive: PING range 0x10-0x1F, PING_ACK range 0x90-0x9F
  PING = 0x10,
  PING_ACK = 0x90,
  
  // Connection management: CONNECT range 0x20-0x2F, CONNECT_ACK range 0xA0-0xAF
  CONNECT = 0x20,
  CONNECT_ACK = 0xA0,
  
  // Disconnection: DISCONNECT range 0x30-0x3F, DISCONNECT_ACK range 0xB0-0xBF
  DISCONNECT = 0x30,
  DISCONNECT_ACK = 0xB0,
  
  // Data transfer: range 0x40-0x6F (48 values, no ACK)
  DATA = 0x40,
  
  // Errors: range 0x70-0x7F (16 values, no ACK)
  ERROR = 0x70,
}

/**
 * Parse a wire byte into a PacketType using the same logic as Java's PacketType.valueOf()
 * 
 * Decompiled from Java:
 *   boolean ack = (flag & 0x80) != 0;
 *   byte type = (byte)(flag & 0x7F);
 *   switch (type >> 4) {
 *     case 0: type <= 7 ? AUTH : ATTACH (with ack variant)
 *     case 1: PING (with ack variant)
 *     case 2: CONNECT (with ack variant)
 *     case 3: DISCONNECT (with ack variant)
 *     case 4,5,6: DATA (no ACK allowed)
 *     case 7: ERROR (no ACK allowed)
 *   }
 */
export function parsePacketType(flag: number): PacketType | null {
  const ack = (flag & 0x80) !== 0;
  const type = flag & 0x7F;
  const category = type >> 4;
  
  switch (category) {
    case 0: // 0x00-0x0F
      if (type <= 7) {
        return ack ? PacketType.AUTH_ACK : PacketType.AUTH;
      }
      return ack ? PacketType.ATTACH_ACK : PacketType.ATTACH;
      
    case 1: // 0x10-0x1F
      return ack ? PacketType.PING_ACK : PacketType.PING;
      
    case 2: // 0x20-0x2F
      return ack ? PacketType.CONNECT_ACK : PacketType.CONNECT;
      
    case 3: // 0x30-0x3F
      return ack ? PacketType.DISCONNECT_ACK : PacketType.DISCONNECT;
      
    case 4: // 0x40-0x4F
    case 5: // 0x50-0x5F
    case 6: // 0x60-0x6F
      if (ack) return null; // DATA cannot be ACK
      return PacketType.DATA;
      
    case 7: // 0x70-0x7F
      if (ack) return null; // ERROR cannot be ACK
      return PacketType.ERROR;
      
    default:
      return null;
  }
}

/**
 * Check if a packet type has an encrypted payload from the server
 * 
 * Server-to-client encrypted types:
 *   CONNECT: 19-byte payload encrypted (35 bytes cipher)
 *   DATA: variable-length payload encrypted
 *   ERROR: variable-length payload encrypted
 * 
 * NOT encrypted (padding only or empty):
 *   PING_ACK: no payload, random padding
 *   DISCONNECT: no payload, random padding
 *   DISCONNECT_ACK: no payload, random padding
 *   ATTACH_ACK: no payload, random padding
 */
export function hasEncryptedPayload(type: PacketType): boolean {
  switch (type) {
    case PacketType.CONNECT:
    case PacketType.DATA:
    case PacketType.ERROR:
      return true;
    default:
      return false;
  }
}

/**
 * Check if a packet type has random padding after the payload/cipher
 * 
 * From Java sendPacket():
 *   if (type != PacketType.DATA && type != PacketType.ERROR) {
 *       padding = this.randomPadding();  // 0-255 random bytes
 *   }
 */
export function hasPadding(type: PacketType): boolean {
  return type !== PacketType.DATA && type !== PacketType.ERROR;
}

/**
 * Get the known plaintext size for a packet type's payload (if fixed-size)
 * Returns null for variable-size payloads (DATA, ERROR)
 * 
 * CONNECT payload: [1-byte addrLen][16-byte addr][2-byte port] = 19 bytes
 * CONNECT cipher = 19 + 16 (MAC) = 35 bytes
 */
export function getKnownCipherSize(type: PacketType): number | null {
  switch (type) {
    case PacketType.CONNECT:
      return 35; // 19 payload + 16 MAC
    default:
      return null; // Variable size or no cipher
  }
}

/**
 * CONNECT payload size (always 19 bytes from Java)
 * Format: [1-byte addrLen][16-byte addr (zero-padded)][2-byte port (BE)]
 */
export const CONNECT_PAYLOAD_SIZE = 19;
export const CONNECT_CIPHER_SIZE = CONNECT_PAYLOAD_SIZE + 16; // 35 bytes

/**
 * Decoded packet structure
 */
export interface Packet {
  type: PacketType;
  payload: Buffer;
}

/**
 * AUTH packet payload structure
 */
export interface AuthPayload {
  nodeId: string;
  publicKey: Buffer;
  signature: Buffer;
  port: number;
}

/**
 * AUTH_ACK packet payload structure
 */
export interface AuthAckPayload {
  sessionId: string;
  allocatedPort: number;
  serverPublicKey: Buffer;
}

/**
 * CONNECT packet payload structure
 * 
 * From Java sendConnect():
 *   payload[0] = addr.length (4 for IPv4, 16 for IPv6)
 *   payload[1..16] = addr bytes (zero-padded to 16)
 *   payload[17..18] = port (big-endian)
 */
export interface ConnectPayload {
  addressLength: number;
  address: string;
  port: number;
}

/**
 * Length field size: 2 bytes
 */
export const LENGTH_FIELD_SIZE = 2;

/**
 * Nonce size for NaCl CryptoBox
 */
export const NONCE_SIZE = 24;

/**
 * Packet header size: 2 (length) + 1 (type)
 */
export const PACKET_HEADER_SIZE = 3;

/**
 * Maximum packet size (64KB - reasonable for TCP proxy)
 */
const MAX_PACKET_SIZE = 65535;

/**
 * Get packet type name for logging
 */
export function getPacketTypeName(type: PacketType): string {
  const names: Record<number, string> = {
    [PacketType.AUTH]: 'AUTH',
    [PacketType.AUTH_ACK]: 'AUTH_ACK',
    [PacketType.ATTACH]: 'ATTACH',
    [PacketType.ATTACH_ACK]: 'ATTACH_ACK',
    [PacketType.PING]: 'PING',
    [PacketType.PING_ACK]: 'PING_ACK',
    [PacketType.CONNECT]: 'CONNECT',
    [PacketType.CONNECT_ACK]: 'CONNECT_ACK',
    [PacketType.DISCONNECT]: 'DISCONNECT',
    [PacketType.DISCONNECT_ACK]: 'DISCONNECT_ACK',
    [PacketType.DATA]: 'DATA',
    [PacketType.ERROR]: 'ERROR',
  };
  
  return names[type] || `UNKNOWN(0x${type.toString(16)})`;
}

/**
 * Parse CONNECT payload from decrypted plaintext
 * 
 * Java format: [1-byte addrLen][16-byte addr (zero-padded)][2-byte port (BE)]
 * addrLen = 4 for IPv4, 16 for IPv6
 */
export function parseConnectPayload(plaintext: Buffer): ConnectPayload {
  if (plaintext.length < CONNECT_PAYLOAD_SIZE) {
    throw new Error(`CONNECT payload too short: ${plaintext.length} bytes (need ${CONNECT_PAYLOAD_SIZE})`);
  }
  
  const addressLength = plaintext.readUInt8(0);
  
  // Extract address bytes (only addrLen bytes are meaningful, rest is zero-padding)
  const addrBytes = plaintext.slice(1, 1 + addressLength);
  
  // Convert to IP string
  let address: string;
  if (addressLength === 4) {
    // IPv4: a.b.c.d
    address = Array.from(addrBytes).join('.');
  } else if (addressLength === 16) {
    // IPv6: groups of 2 bytes as hex
    const parts: string[] = [];
    for (let i = 0; i < 16; i += 2) {
      parts.push(((addrBytes[i] << 8) | addrBytes[i + 1]).toString(16));
    }
    address = parts.join(':');
  } else {
    address = addrBytes.toString('hex');
  }
  
  const port = plaintext.readUInt16BE(17);
  
  return { addressLength, address, port };
}

/**
 * Encode AUTH packet payload
 */
export function encodeAuthPayload(
  nodeId: string,
  publicKey: Buffer,
  signature: Buffer,
  port: number
): Buffer {
  const nodeIdBytes = Buffer.from(nodeId, 'utf8');
  
  // Format: [2-byte nodeId length][nodeId][32-byte pubkey][64-byte sig][2-byte port]
  const payload = Buffer.alloc(2 + nodeIdBytes.length + 32 + 64 + 2);
  let offset = 0;
  
  payload.writeUInt16BE(nodeIdBytes.length, offset);
  offset += 2;
  nodeIdBytes.copy(payload, offset);
  offset += nodeIdBytes.length;
  
  publicKey.copy(payload, offset);
  offset += 32;
  
  signature.copy(payload, offset);
  offset += 64;
  
  payload.writeUInt16BE(port, offset);
  
  return payload;
}

/**
 * Decode AUTH_ACK packet payload
 */
export function decodeAuthAckPayload(payload: Buffer): AuthAckPayload {
  let offset = 0;
  
  const sessionIdLen = payload.readUInt16BE(offset);
  offset += 2;
  const sessionId = payload.slice(offset, offset + sessionIdLen).toString('utf8');
  offset += sessionIdLen;
  
  const allocatedPort = payload.readUInt16BE(offset);
  offset += 2;
  
  const serverPublicKey = Buffer.alloc(32);
  payload.copy(serverPublicKey, 0, offset, offset + 32);
  
  return { sessionId, allocatedPort, serverPublicKey };
}

/**
 * Packet buffer for handling partial TCP reads
 * 
 * Format: [2-byte length (includes itself)][1-byte type][body]
 */
export class PacketBuffer {
  private buffer: Buffer = Buffer.alloc(0);
  
  append(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);
  }
  
  getBuffer(): Buffer {
    return this.buffer;
  }
  
  consume(bytes: number): void {
    this.buffer = this.buffer.slice(bytes);
  }
  
  get length(): number {
    return this.buffer.length;
  }
  
  clear(): void {
    this.buffer = Buffer.alloc(0);
  }
}
