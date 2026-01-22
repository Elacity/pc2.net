/**
 * Boson Active Proxy TypeScript SDK
 * Boson 活跃代理 TypeScript SDK
 * 
 * A TypeScript client library for connecting to Boson Active Proxy servers.
 * 用于连接 Boson 活跃代理服务器的 TypeScript 客户端库。
 * 
 * @packageDocumentation
 */

// Client
export {
  ActiveProxyClient,
  ConnectionState,
  type ActiveProxyConfig,
  type ProxyConnection,
  type ActiveProxyClientEvents,
  type Logger,
} from './ActiveProxyClient.js';

// Protocol
export {
  PacketType,
  PacketBuffer,
  encodePacket,
  decodePacket,
  encodeAuthPayload,
  decodeAuthAckPayload,
  decodeConnectPayload,
  encodeDataPayload,
  decodeDataPayload,
  encodeDisconnectPayload,
  getPacketTypeName,
  type Packet,
  type AuthPayload,
  type AuthAckPayload,
  type ConnectPayload,
  type DataPayload,
} from './ProxyProtocol.js';
