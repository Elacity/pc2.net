/**
 * Gateway Service
 * 
 * Manages the Clawdbot gateway integration for PC2.
 * Handles multi-channel messaging (WhatsApp, Telegram, Discord, Signal).
 * 
 * This service:
 * 1. Manages channel connections and configurations
 * 2. Routes inbound messages to the appropriate agent
 * 3. Handles outbound replies back to channels
 * 4. Manages agent configurations and permissions
 * 5. Enforces security (DM policy, rate limiting, sandboxing)
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
import { DatabaseManager } from '../../storage/database.js';
import type {
  ChannelType,
  ChannelStatus,
  ChannelConfig,
  ChannelMessage,
  ChannelReply,
  GatewayConfig,
  GatewayStatus,
  AgentConfig,
  PairingRequest,
  DEFAULT_GATEWAY_CONFIG,
} from './types.js';

/**
 * Gateway Service Events
 */
export interface GatewayEvents {
  'channel:connected': (channel: ChannelType) => void;
  'channel:disconnected': (channel: ChannelType, error?: Error) => void;
  'channel:error': (channel: ChannelType, error: Error) => void;
  'message:received': (message: ChannelMessage) => void;
  'message:sent': (reply: ChannelReply) => void;
  'pairing:requested': (request: PairingRequest) => void;
  'pairing:approved': (request: PairingRequest) => void;
  'gateway:started': () => void;
  'gateway:stopped': () => void;
}

/**
 * Main Gateway Service class
 */
export class GatewayService extends EventEmitter {
  private config: GatewayConfig;
  private db?: DatabaseManager;
  private running: boolean = false;
  private startedAt?: Date;
  
  // Channel status tracking
  private channelStatus: Map<ChannelType, ChannelStatus> = new Map();
  
  // Pending pairing requests
  private pendingPairings: Map<string, PairingRequest> = new Map();
  
  // Message stats
  private stats = {
    messagesReceived: 0,
    messagesSent: 0,
    errors: 0,
  };
  
  // Message handler callback (set by ChannelBridge)
  private messageHandler?: (message: ChannelMessage) => Promise<void>;
  
  constructor(db?: DatabaseManager) {
    super();
    this.db = db;
    this.config = this.loadConfig();
    
    // Initialize channel status
    const channels: ChannelType[] = ['whatsapp', 'telegram', 'discord', 'signal', 'webchat'];
    channels.forEach(ch => this.channelStatus.set(ch, 'disconnected'));
  }
  
  /**
   * Load gateway configuration from database or use defaults
   */
  private loadConfig(): GatewayConfig {
    // For now, return default config
    // TODO: Load from database when storage is implemented
    return {
      enabled: false,
      port: 18789,
      channels: {},
      agents: [{
        id: 'personal',
        name: 'Personal Assistant',
        enabled: true,
        workspace: '~/pc2/personal',
        permissions: {
          fileRead: true,
          fileWrite: true,
          walletAccess: true,
          webBrowsing: false,
          codeExecution: false,
          reminders: true,
          sandbox: false,
          auditLogging: true,
        },
        accessControl: {
          publicAccess: false,
        },
      }],
      defaultAgentId: 'personal',
      settings: {
        maxPendingPairings: 10,
        pairingCodeExpiry: 60,
        auditLogging: true,
      },
    };
  }
  
  /**
   * Save gateway configuration to database
   */
  private async saveConfig(): Promise<void> {
    // TODO: Save to database when storage is implemented
    logger.info('[GatewayService] Config saved (in-memory only for now)');
  }
  
  /**
   * Initialize the gateway service
   */
  async initialize(): Promise<void> {
    logger.info('[GatewayService] Initializing gateway service...');
    
    // Load config
    this.config = this.loadConfig();
    
    logger.info('[GatewayService] Gateway service initialized', {
      enabled: this.config.enabled,
      agents: this.config.agents.length,
    });
  }
  
  /**
   * Start the gateway service
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('[GatewayService] Gateway already running');
      return;
    }
    
    if (!this.config.enabled) {
      logger.info('[GatewayService] Gateway is disabled in config');
      return;
    }
    
    logger.info('[GatewayService] Starting gateway service...');
    
    this.running = true;
    this.startedAt = new Date();
    
    // Start enabled channels
    for (const [channelType, channelConfig] of Object.entries(this.config.channels)) {
      if (channelConfig?.enabled) {
        await this.connectChannel(channelType as ChannelType);
      }
    }
    
    this.emit('gateway:started');
    logger.info('[GatewayService] Gateway service started');
  }
  
  /**
   * Stop the gateway service
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    
    logger.info('[GatewayService] Stopping gateway service...');
    
    // Disconnect all channels
    for (const channelType of this.channelStatus.keys()) {
      if (this.channelStatus.get(channelType) === 'connected') {
        await this.disconnectChannel(channelType);
      }
    }
    
    this.running = false;
    this.startedAt = undefined;
    
    this.emit('gateway:stopped');
    logger.info('[GatewayService] Gateway service stopped');
  }
  
  /**
   * Connect a specific channel
   */
  async connectChannel(channel: ChannelType): Promise<void> {
    const channelConfig = this.config.channels[channel];
    if (!channelConfig) {
      throw new Error(`No configuration for channel: ${channel}`);
    }
    
    logger.info(`[GatewayService] Connecting channel: ${channel}`);
    this.channelStatus.set(channel, 'connecting');
    
    try {
      // Channel-specific connection logic
      switch (channel) {
        case 'whatsapp':
          await this.connectWhatsApp(channelConfig);
          break;
        case 'telegram':
          await this.connectTelegram(channelConfig);
          break;
        case 'discord':
          await this.connectDiscord(channelConfig);
          break;
        case 'signal':
          await this.connectSignal(channelConfig);
          break;
        case 'webchat':
          // WebChat is always available, no connection needed
          break;
        default:
          throw new Error(`Unknown channel type: ${channel}`);
      }
      
      this.channelStatus.set(channel, 'connected');
      this.emit('channel:connected', channel);
      logger.info(`[GatewayService] Channel connected: ${channel}`);
      
    } catch (error: any) {
      this.channelStatus.set(channel, 'error');
      this.stats.errors++;
      this.emit('channel:error', channel, error);
      logger.error(`[GatewayService] Failed to connect channel ${channel}:`, error.message);
      throw error;
    }
  }
  
  /**
   * Disconnect a specific channel
   */
  async disconnectChannel(channel: ChannelType): Promise<void> {
    logger.info(`[GatewayService] Disconnecting channel: ${channel}`);
    
    // Channel-specific disconnection logic would go here
    // For now, just update status
    
    this.channelStatus.set(channel, 'disconnected');
    this.emit('channel:disconnected', channel);
    logger.info(`[GatewayService] Channel disconnected: ${channel}`);
  }
  
  /**
   * WhatsApp connection (Baileys)
   * This will be implemented with actual Baileys integration
   */
  private async connectWhatsApp(config: ChannelConfig): Promise<void> {
    // TODO: Implement Baileys integration
    // For now, this is a placeholder
    logger.info('[GatewayService] WhatsApp connection placeholder');
    
    // In real implementation:
    // 1. Initialize Baileys socket
    // 2. Load credentials from storage
    // 3. Handle QR code generation if not linked
    // 4. Set up message handlers
  }
  
  /**
   * Telegram connection (grammY)
   * This will be implemented with actual grammY integration
   */
  private async connectTelegram(config: ChannelConfig): Promise<void> {
    // TODO: Implement grammY integration
    logger.info('[GatewayService] Telegram connection placeholder');
    
    // In real implementation:
    // 1. Initialize grammY bot with token
    // 2. Set up command handlers
    // 3. Set up message handlers
    // 4. Start polling or webhooks
  }
  
  /**
   * Discord connection (discord.js)
   * This will be implemented with actual discord.js integration
   */
  private async connectDiscord(config: ChannelConfig): Promise<void> {
    // TODO: Implement discord.js integration
    logger.info('[GatewayService] Discord connection placeholder');
  }
  
  /**
   * Signal connection (signal-cli)
   * This will be implemented with actual signal-cli integration
   */
  private async connectSignal(config: ChannelConfig): Promise<void> {
    // TODO: Implement signal-cli integration
    logger.info('[GatewayService] Signal connection placeholder');
  }
  
  /**
   * Set the message handler callback
   * Called by ChannelBridge to receive messages
   */
  setMessageHandler(handler: (message: ChannelMessage) => Promise<void>): void {
    this.messageHandler = handler;
    logger.info('[GatewayService] Message handler registered');
  }
  
  /**
   * Process an inbound message from a channel
   * Called by channel adapters when a message is received
   */
  async handleInboundMessage(message: ChannelMessage): Promise<void> {
    logger.info(`[GatewayService] Received message from ${message.channel}`, {
      sender: message.sender.id,
      hasText: !!message.content.text,
    });
    
    this.stats.messagesReceived++;
    
    // Check DM policy
    const channelConfig = this.config.channels[message.channel];
    if (channelConfig) {
      const allowed = await this.checkDMPolicy(message, channelConfig);
      if (!allowed) {
        logger.info(`[GatewayService] Message blocked by DM policy`, {
          sender: message.sender.id,
          policy: channelConfig.dmPolicy,
        });
        return;
      }
    }
    
    // Emit event for listeners
    this.emit('message:received', message);
    
    // Forward to message handler (ChannelBridge)
    if (this.messageHandler) {
      try {
        await this.messageHandler(message);
      } catch (error: any) {
        logger.error('[GatewayService] Error in message handler:', error.message);
        this.stats.errors++;
      }
    } else {
      logger.warn('[GatewayService] No message handler registered');
    }
  }
  
  /**
   * Send a reply to a channel
   */
  async sendReply(reply: ChannelReply): Promise<void> {
    logger.info(`[GatewayService] Sending reply to ${reply.channel}`, {
      target: reply.target.id,
      textLength: reply.content.text?.length,
    });
    
    // TODO: Implement actual channel sending
    // For now, just log and emit event
    
    this.stats.messagesSent++;
    this.emit('message:sent', reply);
    
    logger.info(`[GatewayService] Reply sent to ${reply.channel}`);
  }
  
  /**
   * Check if a message is allowed by DM policy
   */
  private async checkDMPolicy(message: ChannelMessage, config: ChannelConfig): Promise<boolean> {
    const { sender } = message;
    const { dmPolicy, allowFrom } = config;
    
    switch (dmPolicy) {
      case 'disabled':
        return false;
        
      case 'open':
        return true;
        
      case 'allowlist':
        return allowFrom.includes(sender.id);
        
      case 'pairing':
        // Check if sender is in allowlist
        if (allowFrom.includes(sender.id)) {
          return true;
        }
        
        // Check if sender has pending approved pairing
        const pairingKey = `${message.channel}:${sender.id}`;
        if (this.pendingPairings.has(pairingKey)) {
          return false; // Still pending
        }
        
        // Create new pairing request
        await this.createPairingRequest(message);
        return false;
        
      default:
        return false;
    }
  }
  
  /**
   * Create a pairing request for an unknown sender
   */
  private async createPairingRequest(message: ChannelMessage): Promise<void> {
    const { sender, channel } = message;
    const pairingKey = `${channel}:${sender.id}`;
    
    // Check if we've hit the max pending pairings
    if (this.pendingPairings.size >= this.config.settings.maxPendingPairings) {
      // Remove oldest pairing
      const oldest = Array.from(this.pendingPairings.entries())
        .sort((a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime())[0];
      if (oldest) {
        this.pendingPairings.delete(oldest[0]);
      }
    }
    
    // Generate pairing code (6 alphanumeric chars)
    const code = this.generatePairingCode();
    const now = new Date();
    const expiry = new Date(now.getTime() + this.config.settings.pairingCodeExpiry * 60 * 1000);
    
    const request: PairingRequest = {
      id: pairingKey,
      channel,
      senderId: sender.id,
      senderName: sender.name,
      code,
      createdAt: now.toISOString(),
      expiresAt: expiry.toISOString(),
    };
    
    this.pendingPairings.set(pairingKey, request);
    this.emit('pairing:requested', request);
    
    // Send pairing code to sender
    const pairingMessage = `🔐 Pairing Required\n\nYour pairing code is: ${code}\n\nAsk the PC2 owner to approve this code in Settings.`;
    
    await this.sendReply({
      channel,
      target: { id: sender.id, isGroup: false },
      content: { text: pairingMessage },
    });
    
    logger.info(`[GatewayService] Pairing request created`, {
      channel,
      sender: sender.id,
      code,
    });
  }
  
  /**
   * Approve a pairing request
   */
  async approvePairing(channel: ChannelType, senderId: string): Promise<boolean> {
    const pairingKey = `${channel}:${senderId}`;
    const request = this.pendingPairings.get(pairingKey);
    
    if (!request) {
      logger.warn(`[GatewayService] No pending pairing for ${pairingKey}`);
      return false;
    }
    
    // Check if expired
    if (new Date() > new Date(request.expiresAt)) {
      this.pendingPairings.delete(pairingKey);
      logger.warn(`[GatewayService] Pairing request expired for ${pairingKey}`);
      return false;
    }
    
    // Add to allowlist
    const channelConfig = this.config.channels[channel];
    if (channelConfig) {
      if (!channelConfig.allowFrom.includes(senderId)) {
        channelConfig.allowFrom.push(senderId);
        await this.saveConfig();
      }
    }
    
    // Remove from pending
    this.pendingPairings.delete(pairingKey);
    this.emit('pairing:approved', request);
    
    // Notify the sender
    await this.sendReply({
      channel,
      target: { id: senderId, isGroup: false },
      content: { text: '✅ Pairing approved! You can now chat with the AI assistant.' },
    });
    
    logger.info(`[GatewayService] Pairing approved for ${pairingKey}`);
    return true;
  }
  
  /**
   * Generate a 6-character alphanumeric pairing code
   */
  private generatePairingCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes I, O, 0, 1 for clarity
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
  
  /**
   * Get gateway status
   */
  getStatus(): GatewayStatus {
    const channelStatuses: Record<ChannelType, ChannelStatus> = {} as any;
    for (const [channel, status] of this.channelStatus) {
      channelStatuses[channel] = status;
    }
    
    return {
      running: this.running,
      startedAt: this.startedAt?.toISOString(),
      channels: channelStatuses,
      agents: this.config.agents.filter(a => a.enabled).map(a => a.id),
      stats: { ...this.stats },
    };
  }
  
  /**
   * Get channel configuration
   */
  getChannelConfig(channel: ChannelType): ChannelConfig | undefined {
    return this.config.channels[channel];
  }
  
  /**
   * Update channel configuration
   */
  async updateChannelConfig(channel: ChannelType, config: Partial<ChannelConfig>): Promise<void> {
    const existing = this.config.channels[channel] || {
      enabled: false,
      status: 'disconnected' as ChannelStatus,
      dmPolicy: 'pairing' as const,
      allowFrom: [],
    };
    
    this.config.channels[channel] = { ...existing, ...config };
    await this.saveConfig();
    
    logger.info(`[GatewayService] Channel config updated: ${channel}`);
  }
  
  /**
   * Get all agents
   */
  getAgents(): AgentConfig[] {
    return this.config.agents;
  }
  
  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentConfig | undefined {
    return this.config.agents.find(a => a.id === agentId);
  }
  
  /**
   * Add or update an agent
   */
  async upsertAgent(agent: AgentConfig): Promise<void> {
    const existingIndex = this.config.agents.findIndex(a => a.id === agent.id);
    
    if (existingIndex >= 0) {
      this.config.agents[existingIndex] = agent;
    } else {
      this.config.agents.push(agent);
    }
    
    await this.saveConfig();
    logger.info(`[GatewayService] Agent upserted: ${agent.id}`);
  }
  
  /**
   * Remove an agent
   */
  async removeAgent(agentId: string): Promise<boolean> {
    const index = this.config.agents.findIndex(a => a.id === agentId);
    
    if (index < 0) {
      return false;
    }
    
    // Don't allow removing the default agent
    if (agentId === this.config.defaultAgentId) {
      throw new Error('Cannot remove the default agent');
    }
    
    this.config.agents.splice(index, 1);
    await this.saveConfig();
    logger.info(`[GatewayService] Agent removed: ${agentId}`);
    return true;
  }
  
  /**
   * Get pending pairing requests
   */
  getPendingPairings(): PairingRequest[] {
    const now = new Date();
    
    // Filter out expired pairings
    const valid: PairingRequest[] = [];
    for (const [key, request] of this.pendingPairings) {
      if (new Date(request.expiresAt) > now) {
        valid.push(request);
      } else {
        this.pendingPairings.delete(key);
      }
    }
    
    return valid;
  }
  
  /**
   * Enable or disable the gateway
   */
  async setEnabled(enabled: boolean): Promise<void> {
    this.config.enabled = enabled;
    await this.saveConfig();
    
    if (enabled && !this.running) {
      await this.start();
    } else if (!enabled && this.running) {
      await this.stop();
    }
  }
  
  /**
   * Get the full gateway configuration
   */
  getConfig(): GatewayConfig {
    return { ...this.config };
  }
}

// Singleton instance
let gatewayServiceInstance: GatewayService | null = null;

/**
 * Get or create the gateway service instance
 */
export function getGatewayService(db?: DatabaseManager): GatewayService {
  if (!gatewayServiceInstance) {
    gatewayServiceInstance = new GatewayService(db);
  }
  return gatewayServiceInstance;
}
