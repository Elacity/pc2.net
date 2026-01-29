/**
 * Proxy Protocol
 * 
 * Binary packet encoder/decoder for Active Proxy communication.
 * Implements the protocol used by the Java Active Proxy server.
 * 
 * Protocol compatibility:
 * - Server: Boson.Java boson-active-proxy-2.0.8-SNAPSHOT
 * - Uses NaCl CryptoBox for encrypted communication
 * - May require updates for Boson V2 (expected Feb 2026)
 * 
 * Encrypted Packet Format (after handshake):
 * - 2 bytes: Length (big-endian, includes length field itself)
 * - 24 bytes: Nonce
 * - N bytes: Encrypted payload (includes packet type + data)
 * 
 * Plaintext Packet Format (inside encrypted envelope):
 * - 1 byte: Packet type
 * - N bytes: Payload
 */

/**
 * Packet type codes for Active Proxy protocol
 */
export enum PacketType {
  // Authentication (0x00-0x07)
  AUTH = 0x00,
  AUTH_ACK = 0x01,
  AUTH_ERROR = 0x02,
  
  // Session attachment (0x08-0x0F)
  ATTACH = 0x08,
  ATTACH_ACK = 0x09,
  ATTACH_ERROR = 0x0A,
  
  // Keep-alive (0x10-0x1F)
  PING = 0x10,
  PONG = 0x11,
  
  // Connection management (0x20-0x2F)
  CONNECT = 0x20,
  CONNECT_ACK = 0x21,
  
  // Disconnection (0x30-0x3F)
  DISCONNECT = 0x30,
  DISCONNECT_ACK = 0x31,
  
  // Data transfer (0x40-0x6F)
  DATA = 0x40,
  
  // Errors (0x70-0x7F)
  ERROR = 0x70,
}

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
 */
export interface ConnectPayload {
  connectionId: number;
  sourceAddress: string;
  sourcePort: number;
}

/**
 * DATA packet payload structure
 */
export interface DataPayload {
  connectionId: number;
  data: Buffer;
}

/**
 * Length field size: 2 bytes (encrypted protocol)
 */
export const LENGTH_FIELD_SIZE = 2;

/**
 * Nonce size for encrypted packets
 */
export const NONCE_SIZE = 24;

/**
 * Minimum encrypted packet header: 2 (length) + 24 (nonce)
 */
export const ENCRYPTED_HEADER_SIZE = LENGTH_FIELD_SIZE + NONCE_SIZE;

/**
 * Header size for plaintext packet inside envelope: 1 byte type
 */
const PLAINTEXT_HEADER_SIZE = 1;

/**
 * Maximum packet size (1MB)
 */
const MAX_PACKET_SIZE = 1024 * 1024;

/**
 * Maximum encrypted packet size (1MB + crypto overhead)
 */
const MAX_ENCRYPTED_PACKET_SIZE = MAX_PACKET_SIZE + NONCE_SIZE + 16; // 16 = auth tag

/**
 * Encode a plaintext packet (to be encrypted before transmission)
 * 
 * This creates the inner packet format: [1-byte type][payload]
 * The result should be encrypted with CryptoBox before sending.
 * 
 * @param type - Packet type
 * @param payload - Packet payload
 * @returns Encoded plaintext packet (ready for encryption)
 */
export function encodePlaintextPacket(type: PacketType, payload: Buffer = Buffer.alloc(0)): Buffer {
  const packet = Buffer.alloc(1 + payload.length);
  
  // Write packet type
  packet.writeUInt8(type, 0);
  
  // Write payload
  if (payload.length > 0) {
    payload.copy(packet, 1);
  }
  
  return packet;
}

/**
 * Legacy encode function for backward compatibility
 * @deprecated Use encodePlaintextPacket with CryptoBox encryption
 */
export function encodePacket(type: PacketType, payload: Buffer = Buffer.alloc(0)): Buffer {
  return encodePlaintextPacket(type, payload);
}

/**
 * Decode a plaintext packet (after decryption)
 * 
 * This decodes the inner packet format: [1-byte type][payload]
 * Use this after decrypting received data with CryptoBox.
 * 
 * @param data - Decrypted plaintext data
 * @returns Decoded packet or null if invalid
 */
export function decodePlaintextPacket(data: Buffer): Packet | null {
  if (data.length < 1) {
    return null;
  }
  
  const type = data.readUInt8(0) as PacketType;
  const payload = data.length > 1 ? data.slice(1) : Buffer.alloc(0);
  
  return { type, payload };
}

/**
 * Read an encrypted packet from a buffer
 * 
 * Encrypted packet format: [2-byte length][24-byte nonce][encrypted data]
 * 
 * @param data - Buffer containing encrypted packet data
 * @returns Encrypted packet components or null if incomplete
 */
export function readEncryptedPacket(data: Buffer): { 
  nonce: Buffer; 
  ciphertext: Buffer; 
  bytesConsumed: number;
} | null {
  // Need at least length field
  if (data.length < LENGTH_FIELD_SIZE) {
    return null;
  }
  
  // Read 2-byte length (includes itself)
  const messageLength = data.readUInt16BE(0);
  
  // Validate length
  if (messageLength > MAX_ENCRYPTED_PACKET_SIZE) {
    throw new Error(`Encrypted packet too large: ${messageLength} bytes`);
  }
  
  // Check if we have the full packet
  if (data.length < messageLength) {
    return null;
  }
  
  // Minimum valid: 2 (len) + 24 (nonce) + 16 (min ciphertext)
  if (messageLength < ENCRYPTED_HEADER_SIZE + 16) {
    throw new Error(`Encrypted packet too short: ${messageLength} bytes`);
  }
  
  // Extract nonce and ciphertext (after length field)
  const nonce = data.slice(LENGTH_FIELD_SIZE, ENCRYPTED_HEADER_SIZE);
  const ciphertext = data.slice(ENCRYPTED_HEADER_SIZE, messageLength);
  
  return {
    nonce,
    ciphertext,
    bytesConsumed: messageLength,
  };
}

/**
 * Legacy decode function - for testing only
 * @deprecated Use readEncryptedPacket + CryptoBox decryption + decodePlaintextPacket
 */
export function decodePacket(data: Buffer): { packet: Packet; bytesConsumed: number } | null {
  // This legacy function expected 4-byte length + 1-byte type
  // It's kept for backward compatibility but shouldn't be used with the real server
  
  if (data.length < 5) {
    return null;
  }
  
  const length = data.readUInt32BE(0);
  
  if (length > MAX_PACKET_SIZE) {
    throw new Error(`Packet too large: ${length} bytes`);
  }
  
  const totalLength = 4 + length;
  if (data.length < totalLength) {
    return null;
  }
  
  const type = data.readUInt8(4) as PacketType;
  const payload = Buffer.alloc(length - 1);
  if (length > 1) {
    data.copy(payload, 0, 5, totalLength);
  }
  
  return {
    packet: { type, payload },
    bytesConsumed: totalLength,
  };
}

/**
 * Encode AUTH packet payload
 * 
 * @param nodeId - Node identifier
 * @param publicKey - Ed25519 public key (32 bytes)
 * @param signature - Signature of challenge (64 bytes)
 * @param port - Local port to expose
 * @returns Encoded payload buffer
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
  
  // Node ID length and data
  payload.writeUInt16BE(nodeIdBytes.length, offset);
  offset += 2;
  nodeIdBytes.copy(payload, offset);
  offset += nodeIdBytes.length;
  
  // Public key (32 bytes)
  publicKey.copy(payload, offset);
  offset += 32;
  
  // Signature (64 bytes)
  signature.copy(payload, offset);
  offset += 64;
  
  // Port
  payload.writeUInt16BE(port, offset);
  
  return payload;
}

/**
 * Decode AUTH_ACK packet payload
 * 
 * @param payload - Raw payload buffer
 * @returns Decoded AUTH_ACK payload
 */
export function decodeAuthAckPayload(payload: Buffer): AuthAckPayload {
  let offset = 0;
  
  // Session ID length and data
  const sessionIdLen = payload.readUInt16BE(offset);
  offset += 2;
  const sessionId = payload.slice(offset, offset + sessionIdLen).toString('utf8');
  offset += sessionIdLen;
  
  // Allocated port
  const allocatedPort = payload.readUInt16BE(offset);
  offset += 2;
  
  // Server public key (32 bytes)
  const serverPublicKey = Buffer.alloc(32);
  payload.copy(serverPublicKey, 0, offset, offset + 32);
  
  return { sessionId, allocatedPort, serverPublicKey };
}

/**
 * Decode CONNECT packet payload
 * 
 * @param payload - Raw payload buffer
 * @returns Decoded CONNECT payload
 */
export function decodeConnectPayload(payload: Buffer): ConnectPayload {
  let offset = 0;
  
  // Connection ID (4 bytes)
  const connectionId = payload.readUInt32BE(offset);
  offset += 4;
  
  // Source address length and data
  const addrLen = payload.readUInt16BE(offset);
  offset += 2;
  const sourceAddress = payload.slice(offset, offset + addrLen).toString('utf8');
  offset += addrLen;
  
  // Source port
  const sourcePort = payload.readUInt16BE(offset);
  
  return { connectionId, sourceAddress, sourcePort };
}

/**
 * Encode DATA packet payload
 * 
 * @param connectionId - Connection identifier
 * @param data - Data to send
 * @returns Encoded payload buffer
 */
export function encodeDataPayload(connectionId: number, data: Buffer): Buffer {
  const payload = Buffer.alloc(4 + data.length);
  
  // Connection ID (4 bytes)
  payload.writeUInt32BE(connectionId, 0);
  
  // Data
  data.copy(payload, 4);
  
  return payload;
}

/**
 * Decode DATA packet payload
 * 
 * @param payload - Raw payload buffer
 * @returns Decoded DATA payload
 */
export function decodeDataPayload(payload: Buffer): DataPayload {
  const connectionId = payload.readUInt32BE(0);
  const data = Buffer.alloc(payload.length - 4);
  payload.copy(data, 0, 4);
  
  return { connectionId, data };
}

/**
 * Encode DISCONNECT packet payload
 * 
 * @param connectionId - Connection identifier to disconnect
 * @returns Encoded payload buffer
 */
export function encodeDisconnectPayload(connectionId: number): Buffer {
  const payload = Buffer.alloc(4);
  payload.writeUInt32BE(connectionId, 0);
  return payload;
}

/**
 * Get packet type name for logging
 * 
 * @param type - Packet type code
 * @returns Human-readable name
 */
export function getPacketTypeName(type: PacketType): string {
  const names: Record<number, string> = {
    [PacketType.AUTH]: 'AUTH',
    [PacketType.AUTH_ACK]: 'AUTH_ACK',
    [PacketType.AUTH_ERROR]: 'AUTH_ERROR',
    [PacketType.ATTACH]: 'ATTACH',
    [PacketType.ATTACH_ACK]: 'ATTACH_ACK',
    [PacketType.ATTACH_ERROR]: 'ATTACH_ERROR',
    [PacketType.PING]: 'PING',
    [PacketType.PONG]: 'PONG',
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
 * Encrypted packet buffer for handling partial reads
 * 
 * Handles the encrypted protocol format: [2-byte length][24-byte nonce][ciphertext]
 */
export class EncryptedPacketBuffer {
  private buffer: Buffer = Buffer.alloc(0);
  
  /**
   * Append data to the buffer
   */
  append(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);
  }
  
  /**
   * Try to extract a complete encrypted packet from the buffer
   * 
   * @returns Encrypted packet components or null if incomplete
   */
  extractEncryptedPacket(): { nonce: Buffer; ciphertext: Buffer } | null {
    const result = readEncryptedPacket(this.buffer);
    
    if (result) {
      // Remove consumed bytes from buffer
      this.buffer = this.buffer.slice(result.bytesConsumed);
      return {
        nonce: result.nonce,
        ciphertext: result.ciphertext,
      };
    }
    
    return null;
  }
  
  /**
   * Get the raw buffer for handshake processing
   */
  getBuffer(): Buffer {
    return this.buffer;
  }
  
  /**
   * Consume bytes from the buffer (for handshake)
   */
  consume(bytes: number): void {
    this.buffer = this.buffer.slice(bytes);
  }
  
  /**
   * Get remaining buffer length
   */
  get length(): number {
    return this.buffer.length;
  }
  
  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = Buffer.alloc(0);
  }
}

/**
 * Legacy packet buffer - for backward compatibility
 * @deprecated Use EncryptedPacketBuffer with CryptoBox
 */
export class PacketBuffer {
  private buffer: Buffer = Buffer.alloc(0);
  
  /**
   * Append data to the buffer
   */
  append(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);
  }
  
  /**
   * Try to extract a complete packet from the buffer
   * @deprecated This uses legacy 4-byte length format
   */
  extractPacket(): Packet | null {
    const result = decodePacket(this.buffer);
    
    if (result) {
      this.buffer = this.buffer.slice(result.bytesConsumed);
      return result.packet;
    }
    
    return null;
  }
  
  /**
   * Get remaining buffer length
   */
  get length(): number {
    return this.buffer.length;
  }
  
  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = Buffer.alloc(0);
  }
}
