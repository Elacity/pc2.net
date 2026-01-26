/**
 * Gateway Service Module
 * 
 * Exports for the Clawdbot gateway integration.
 * Provides multi-channel messaging support for PC2.
 */

// Types
export * from './types.js';

// Services
export { GatewayService, getGatewayService } from './GatewayService.js';
export { ChannelBridge, createChannelBridge } from './ChannelBridge.js';
