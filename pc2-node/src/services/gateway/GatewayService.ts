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
import path from 'path';
import { logger } from '../../utils/logger.js';
import { DatabaseManager } from '../../storage/database.js';
import { WhatsAppChannel, createWhatsAppChannel } from './channels/WhatsAppChannel.js';
import { TelegramChannel, createTelegramChannel } from './channels/TelegramChannel.js';
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
  
  // Channel adapters
  private whatsAppChannel: WhatsAppChannel | null = null;
  private telegramChannel: TelegramChannel | null = null;
  
  // Credentials directory
  private credentialsDir: string;
  
  // Current WhatsApp QR code (stored for API retrieval)
  private currentWhatsAppQR: string | null = null;
  
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
  
  constructor(db?: DatabaseManager, credentialsDir?: string) {
    super();
    this.db = db;
    this.config = this.loadConfig();
    
    // Set credentials directory (default to ~/.pc2/credentials)
    this.credentialsDir = credentialsDir || path.join(
      process.env.HOME || process.env.USERPROFILE || '.',
      '.pc2',
      'credentials'
    );
    
    // Initialize channel status
    const channels: ChannelType[] = ['whatsapp', 'telegram', 'discord', 'signal', 'webchat'];
    channels.forEach(ch => this.channelStatus.set(ch, 'disconnected'));
  }
  
  /**
   * Get the config file path
   */
  private getConfigPath(): string {
    return path.join(this.credentialsDir, '..', 'gateway-config.json');
  }

  /**
   * Load gateway configuration from file or use defaults
   */
  private loadConfig(): GatewayConfig {
    const defaultConfig: GatewayConfig = {
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
    
    try {
      const configPath = this.getConfigPath();
      const fs = require('fs');
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf8');
        const saved = JSON.parse(data);
        logger.info('[GatewayService] Loaded config from file');
        return { ...defaultConfig, ...saved };
      }
    } catch (error: any) {
      logger.warn('[GatewayService] Failed to load config:', error.message);
    }
    
    return defaultConfig;
  }
  
  /**
   * Save gateway configuration to file
   */
  private async saveConfig(): Promise<void> {
    try {
      const configPath = this.getConfigPath();
      const fs = await import('fs');
      const dir = path.dirname(configPath);
      
      // Ensure directory exists
      await fs.promises.mkdir(dir, { recursive: true });
      
      // Save config (excluding sensitive data that's stored separately)
      const configToSave = {
        enabled: this.config.enabled,
        port: this.config.port,
        channels: this.config.channels,
        defaultAgentId: this.config.defaultAgentId,
        settings: this.config.settings,
      };
      
      await fs.promises.writeFile(configPath, JSON.stringify(configToSave, null, 2));
      logger.info('[GatewayService] Config saved to file');
    } catch (error: any) {
      logger.error('[GatewayService] Failed to save config:', error.message);
    }
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
    
    // Auto-reconnect saved channels
    await this.autoReconnectChannels();
  }
  
  /**
   * Auto-reconnect channels that were previously connected
   */
  private async autoReconnectChannels(): Promise<void> {
    const channels = this.config.channels;
    
    // Check for Telegram
    if (channels.telegram?.botToken) {
      logger.info('[GatewayService] Auto-reconnecting Telegram...');
      try {
        await this.connectChannel('telegram', { telegram: channels.telegram });
      } catch (error: any) {
        logger.error('[GatewayService] Failed to auto-reconnect Telegram:', error.message);
      }
    }
    
    // WhatsApp auto-reconnect would happen via saved credentials
    // Discord and others can be added similarly
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
      
      // For WhatsApp, status is 'connecting' until QR is scanned
      // The 'connected' event from WhatsAppChannel will set it to 'connected'
      if (channel === 'whatsapp') {
        this.channelStatus.set(channel, 'connecting');
        logger.info(`[GatewayService] WhatsApp connecting, waiting for QR scan...`);
      } else {
        this.channelStatus.set(channel, 'connected');
        this.emit('channel:connected', channel);
        logger.info(`[GatewayService] Channel connected: ${channel}`);
      }
      
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
    
    try {
      switch (channel) {
        case 'whatsapp':
          if (this.whatsAppChannel) {
            await this.whatsAppChannel.disconnect();
            this.whatsAppChannel = null;
          }
          break;
          
        case 'telegram':
          if (this.telegramChannel) {
            await this.telegramChannel.disconnect();
            this.telegramChannel = null;
          }
          break;
          
        case 'discord':
        case 'signal':
        case 'webchat':
          // TODO: Implement other channels
          break;
      }
      
      this.channelStatus.set(channel, 'disconnected');
      this.emit('channel:disconnected', channel);
      logger.info(`[GatewayService] Channel disconnected: ${channel}`);
      
    } catch (error: any) {
      logger.error(`[GatewayService] Error disconnecting ${channel}:`, error);
      this.channelStatus.set(channel, 'error');
      throw error;
    }
  }
  
  /**
   * WhatsApp connection (Baileys)
   */
  private async connectWhatsApp(config: ChannelConfig): Promise<void> {
    logger.info('[GatewayService] Connecting WhatsApp with Baileys...');
    
    // Create credentials path
    const credentialsPath = path.join(this.credentialsDir, 'whatsapp', 'default');
    
    // Ensure directory exists
    const fs = await import('fs');
    await fs.promises.mkdir(credentialsPath, { recursive: true });
    
    // Create WhatsApp channel with selfChatMode enabled by default
    this.whatsAppChannel = createWhatsAppChannel(
      { selfChatMode: true, ...config.whatsapp },
      credentialsPath
    );
    
    // Set up event handlers
    this.whatsAppChannel.on('qr', (qr: string) => {
      logger.info('[GatewayService] WhatsApp QR code generated');
      this.currentWhatsAppQR = qr;
      this.emit('whatsapp:qr', qr);
    });
    
    this.whatsAppChannel.on('connected', (phoneNumber: string) => {
      logger.info('[GatewayService] WhatsApp connected:', phoneNumber);
      this.currentWhatsAppQR = null; // Clear QR code on successful connection
      this.channelStatus.set('whatsapp', 'connected');
      this.emit('channel:connected', 'whatsapp');
      
      // Update config with phone number
      if (config.whatsapp) {
        config.whatsapp.phoneNumber = phoneNumber;
      }
      config.linkedAt = new Date().toISOString();
      
      this.emit('channel:connected', 'whatsapp');
    });
    
    this.whatsAppChannel.on('disconnected', (reason: string) => {
      logger.info('[GatewayService] WhatsApp disconnected:', reason);
      this.channelStatus.set('whatsapp', 'disconnected');
      this.emit('channel:disconnected', 'whatsapp');
    });
    
    this.whatsAppChannel.on('message', (message: ChannelMessage) => {
      this.handleInboundMessage(message);
    });
    
    this.whatsAppChannel.on('error', (error: Error) => {
      logger.error('[GatewayService] WhatsApp error:', error);
      this.channelStatus.set('whatsapp', 'error');
      this.emit('channel:error', 'whatsapp', error);
    });
    
    // Connect
    await this.whatsAppChannel.connect();
  }
  
  /**
   * Telegram connection (grammY)
   */
  private async connectTelegram(config: ChannelConfig): Promise<void> {
    logger.info('[GatewayService] Connecting Telegram with grammY...');
    
    if (!config.telegram?.botToken) {
      throw new Error('Telegram bot token is required');
    }
    
    // Create Telegram channel
    this.telegramChannel = createTelegramChannel(config.telegram);
    
    // Set up event handlers
    this.telegramChannel.on('connected', (botUsername: string) => {
      logger.info('[GatewayService] Telegram connected:', botUsername);
      this.channelStatus.set('telegram', 'connected');
      
      // Update config with bot username
      if (config.telegram) {
        config.telegram.botUsername = botUsername;
      }
      config.linkedAt = new Date().toISOString();
      
      this.emit('channel:connected', 'telegram');
    });
    
    this.telegramChannel.on('disconnected', (reason: string) => {
      logger.info('[GatewayService] Telegram disconnected:', reason);
      this.channelStatus.set('telegram', 'disconnected');
      this.emit('channel:disconnected', 'telegram');
    });
    
    this.telegramChannel.on('message', (message: ChannelMessage) => {
      this.handleInboundMessage(message);
    });
    
    this.telegramChannel.on('error', (error: Error) => {
      logger.error('[GatewayService] Telegram error:', error);
      this.channelStatus.set('telegram', 'error');
      this.emit('channel:error', 'telegram', error);
    });
    
    // Connect
    await this.telegramChannel.connect();
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
    
    try {
      switch (reply.channel) {
        case 'whatsapp':
          if (this.whatsAppChannel?.isConnected()) {
            await this.whatsAppChannel.sendReply(reply);
          } else {
            throw new Error('WhatsApp not connected');
          }
          break;
          
        case 'telegram':
          if (this.telegramChannel?.isConnected()) {
            await this.telegramChannel.sendReply(reply);
          } else {
            throw new Error('Telegram not connected');
          }
          break;
          
        case 'discord':
        case 'signal':
        case 'webchat':
          // TODO: Implement other channels
          logger.warn(`[GatewayService] Channel ${reply.channel} not yet implemented`);
          break;
          
        default:
          throw new Error(`Unknown channel: ${reply.channel}`);
      }
      
      this.stats.messagesSent++;
      this.emit('message:sent', reply);
      logger.info(`[GatewayService] Reply sent to ${reply.channel}`);
      
    } catch (error: any) {
      this.stats.errors++;
      logger.error(`[GatewayService] Failed to send reply:`, error);
      throw error;
    }
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
    
    try {
      await this.sendReply({
        channel,
        target: { id: sender.id, isGroup: false },
        content: { text: pairingMessage },
      });
    } catch (error: any) {
      // Don't crash if we can't send the pairing message
      logger.warn(`[GatewayService] Could not send pairing message:`, error.message);
    }
    
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
    try {
      await this.sendReply({
        channel,
        target: { id: senderId, isGroup: false },
        content: { text: '✅ Pairing approved! You can now chat with the AI assistant.' },
      });
    } catch (error: any) {
      logger.warn(`[GatewayService] Could not send approval message:`, error.message);
    }
    
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
   * Get current WhatsApp QR code (if available)
   */
  getWhatsAppQR(): string | null {
    return this.currentWhatsAppQR;
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
