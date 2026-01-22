/**
 * Boson Active Proxy Protocol
 * Boson 活跃代理协议
 * 
 * Binary packet encoder/decoder for Active Proxy communication.
 * 用于活跃代理通信的二进制数据包编解码器。
 * 
 * Implements the protocol used by the Java Active Proxy server.
 * 实现 Java 活跃代理服务器使用的协议。
 * 
 * Packet Format | 数据包格式:
 * - 4 bytes: Length (big-endian, includes type + payload)
 *   4 字节：长度（大端序，包含类型 + 载荷）
 * - 1 byte: Packet type
 *   1 字节：数据包类型
 * - N bytes: Payload
 *   N 字节：载荷
 */

/**
 * Packet type codes for Active Proxy protocol
 * 活跃代理协议的数据包类型代码
 */
export enum PacketType {
  // Authentication | 认证 (0x00-0x07)
  AUTH = 0x00,
  AUTH_ACK = 0x01,
  AUTH_ERROR = 0x02,
  
  // Session attachment | 会话附加 (0x08-0x0F)
  ATTACH = 0x08,
  ATTACH_ACK = 0x09,
  ATTACH_ERROR = 0x0A,
  
  // Keep-alive | 心跳 (0x10-0x1F)
  PING = 0x10,
  PONG = 0x11,
  
  // Connection management | 连接管理 (0x20-0x2F)
  CONNECT = 0x20,
  CONNECT_ACK = 0x21,
  
  // Disconnection | 断开连接 (0x30-0x3F)
  DISCONNECT = 0x30,
  DISCONNECT_ACK = 0x31,
  
  // Data transfer | 数据传输 (0x40-0x6F)
  DATA = 0x40,
  
  // Errors | 错误 (0x70-0x7F)
  ERROR = 0x70,
}

/**
 * Decoded packet structure
 * 解码后的数据包结构
 */
export interface Packet {
  type: PacketType;
  payload: Buffer;
}

/**
 * AUTH packet payload structure
 * AUTH 数据包载荷结构
 */
export interface AuthPayload {
  nodeId: string;
  publicKey: Buffer;
  signature: Buffer;
  port: number;
}

/**
 * AUTH_ACK packet payload structure
 * AUTH_ACK 数据包载荷结构
 */
export interface AuthAckPayload {
  sessionId: string;
  allocatedPort: number;
  serverPublicKey: Buffer;
}

/**
 * CONNECT packet payload structure
 * CONNECT 数据包载荷结构
 */
export interface ConnectPayload {
  connectionId: number;
  sourceAddress: string;
  sourcePort: number;
}

/**
 * DATA packet payload structure
 * DATA 数据包载荷结构
 */
export interface DataPayload {
  connectionId: number;
  data: Buffer;
}

/**
 * Header size: 4 bytes length + 1 byte type
 * 头部大小：4 字节长度 + 1 字节类型
 */
const HEADER_SIZE = 5;

/**
 * Maximum packet size (1MB)
 * 最大数据包大小（1MB）
 */
const MAX_PACKET_SIZE = 1024 * 1024;

/**
 * Encode a packet for transmission
 * 编码数据包用于传输
 * 
 * @param type - Packet type | 数据包类型
 * @param payload - Packet payload | 数据包载荷
 * @returns Encoded packet buffer | 编码后的数据包缓冲区
 */
export function encodePacket(type: PacketType, payload: Buffer = Buffer.alloc(0)): Buffer {
  const length = 1 + payload.length; // type (1) + payload
  const packet = Buffer.alloc(4 + length);
  
  // Write length as big-endian 32-bit integer
  packet.writeUInt32BE(length, 0);
  
  // Write packet type
  packet.writeUInt8(type, 4);
  
  // Write payload
  if (payload.length > 0) {
    payload.copy(packet, 5);
  }
  
  return packet;
}

/**
 * Decode a packet from a buffer
 * 从缓冲区解码数据包
 * 
 * @param data - Buffer containing packet data | 包含数据包数据的缓冲区
 * @returns Decoded packet or null if incomplete | 解码后的数据包，不完整则返回 null
 */
export function decodePacket(data: Buffer): { packet: Packet; bytesConsumed: number } | null {
  // Need at least header size
  if (data.length < HEADER_SIZE) {
    return null;
  }
  
  // Read length
  const length = data.readUInt32BE(0);
  
  // Validate length
  if (length > MAX_PACKET_SIZE) {
    throw new Error(`Packet too large: ${length} bytes`);
  }
  
  // Check if we have the full packet
  const totalLength = 4 + length;
  if (data.length < totalLength) {
    return null;
  }
  
  // Read type
  const type = data.readUInt8(4) as PacketType;
  
  // Extract payload
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
 * 编码 AUTH 数据包载荷
 * 
 * @param nodeId - Node identifier | 节点标识符
 * @param publicKey - Ed25519 public key (32 bytes) | Ed25519 公钥（32 字节）
 * @param signature - Signature of challenge (64 bytes) | 挑战签名（64 字节）
 * @param port - Local port to expose | 要暴露的本地端口
 * @returns Encoded payload buffer | 编码后的载荷缓冲区
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
 * 解码 AUTH_ACK 数据包载荷
 * 
 * @param payload - Raw payload buffer | 原始载荷缓冲区
 * @returns Decoded AUTH_ACK payload | 解码后的 AUTH_ACK 载荷
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
 * 解码 CONNECT 数据包载荷
 * 
 * @param payload - Raw payload buffer | 原始载荷缓冲区
 * @returns Decoded CONNECT payload | 解码后的 CONNECT 载荷
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
 * 编码 DATA 数据包载荷
 * 
 * @param connectionId - Connection identifier | 连接标识符
 * @param data - Data to send | 要发送的数据
 * @returns Encoded payload buffer | 编码后的载荷缓冲区
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
 * 解码 DATA 数据包载荷
 * 
 * @param payload - Raw payload buffer | 原始载荷缓冲区
 * @returns Decoded DATA payload | 解码后的 DATA 载荷
 */
export function decodeDataPayload(payload: Buffer): DataPayload {
  const connectionId = payload.readUInt32BE(0);
  const data = Buffer.alloc(payload.length - 4);
  payload.copy(data, 0, 4);
  
  return { connectionId, data };
}

/**
 * Encode DISCONNECT packet payload
 * 编码 DISCONNECT 数据包载荷
 * 
 * @param connectionId - Connection identifier to disconnect | 要断开的连接标识符
 * @returns Encoded payload buffer | 编码后的载荷缓冲区
 */
export function encodeDisconnectPayload(connectionId: number): Buffer {
  const payload = Buffer.alloc(4);
  payload.writeUInt32BE(connectionId, 0);
  return payload;
}

/**
 * Get packet type name for logging
 * 获取数据包类型名称用于日志记录
 * 
 * @param type - Packet type code | 数据包类型代码
 * @returns Human-readable name | 人类可读的名称
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
 * Packet buffer for handling partial reads
 * 用于处理部分读取的数据包缓冲区
 */
export class PacketBuffer {
  private buffer: Buffer = Buffer.alloc(0);
  
  /**
   * Append data to the buffer
   * 向缓冲区追加数据
   */
  append(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);
  }
  
  /**
   * Try to extract a complete packet from the buffer
   * 尝试从缓冲区提取完整的数据包
   */
  extractPacket(): Packet | null {
    const result = decodePacket(this.buffer);
    
    if (result) {
      // Remove consumed bytes from buffer
      this.buffer = this.buffer.slice(result.bytesConsumed);
      return result.packet;
    }
    
    return null;
  }
  
  /**
   * Get remaining buffer length
   * 获取剩余缓冲区长度
   */
  get length(): number {
    return this.buffer.length;
  }
  
  /**
   * Clear the buffer
   * 清空缓冲区
   */
  clear(): void {
    this.buffer = Buffer.alloc(0);
  }
}
