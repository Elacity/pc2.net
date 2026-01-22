/**
 * Boson Services
 * 
 * PC2 node identity and connectivity services built on Elastos/Boson infrastructure.
 */

export { BosonService } from './BosonService.js';
export type { BosonConfig, BosonStatus } from './BosonService.js';

export { IdentityService } from './IdentityService.js';
export type { NodeIdentity, IdentityConfig } from './IdentityService.js';

export { UsernameService } from './UsernameService.js';
export type { UsernameConfig, UsernameInfo } from './UsernameService.js';

export { ConnectivityService } from './ConnectivityService.js';
export type { SuperNode, ConnectivityConfig, ConnectionStatus } from './ConnectivityService.js';

export { NetworkDetector } from './NetworkDetector.js';
export type { NetworkInfo, NetworkDetectorConfig, NATType } from './NetworkDetector.js';

export { ActiveProxyClient, ConnectionState } from './ActiveProxyClient.js';
export type { ActiveProxyConfig, ProxyConnection, ActiveProxyEvents } from './ActiveProxyClient.js';

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
} from './ProxyProtocol.js';
export type { Packet, AuthPayload, AuthAckPayload, ConnectPayload, DataPayload } from './ProxyProtocol.js';
