/**
 * Clawdbot Gateway Integration Types
 * 
 * Type definitions for multi-channel messaging integration.
 * These types define the interface between PC2 and the Clawdbot gateway.
 */

/**
 * Supported messaging channels
 */
export type ChannelType = 'whatsapp' | 'telegram' | 'discord' | 'signal' | 'webchat';

/**
 * Channel connection status
 */
export type ChannelStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * DM (Direct Message) policy for channel access control
 */
export type DMPolicy = 'pairing' | 'allowlist' | 'open' | 'disabled';

/**
 * Channel-specific AI settings (model, personality, access control)
 */
export interface ChannelSettings {
  model?: string;            // e.g., 'ollama:llama3.2', 'openai:gpt-4'
  personality?: string;      // Preset ID: 'professional', 'friendly', 'technical', 'support', 'custom'
  customSoul?: string;       // Custom SOUL.md content (when personality='custom')
  soulContent?: string;      // Resolved soul content for system prompt
  accessMode?: 'public' | 'private';
  rateLimit?: {
    messagesPerMinute: number;
    messagesPerHour: number;
  };
}

/**
 * Channel configuration stored in PC2
 */
export interface ChannelConfig {
  enabled: boolean;
  status: ChannelStatus;
  dmPolicy: DMPolicy;
  allowFrom: string[];  // E.164 phone numbers or usernames
  linkedAt?: string;    // ISO timestamp
  lastActive?: string;  // ISO timestamp
  
  // AI settings for this channel
  settings?: ChannelSettings;
  
  // Channel-specific config
  whatsapp?: WhatsAppConfig;
  telegram?: TelegramConfig;
  discord?: DiscordConfig;
  signal?: SignalConfig;
}

/**
 * WhatsApp-specific configuration
 */
export interface WhatsAppConfig {
  phoneNumber?: string;
  selfChatMode?: boolean;
  sendReadReceipts?: boolean;
  ackReaction?: {
    emoji: string;
    direct: boolean;
    group: 'always' | 'mentions' | 'never';
  };
}

/**
 * Telegram-specific configuration
 */
export interface TelegramConfig {
  botToken?: string;        // Encrypted in storage
  botUsername?: string;
  publicBot?: boolean;      // Allow anyone to message
  rateLimit?: {
    messagesPerMinute: number;
    messagesPerHour: number;
  };
}

/**
 * Discord-specific configuration
 */
export interface DiscordConfig {
  botToken?: string;        // Encrypted in storage
  botUsername?: string;
  guildIds?: string[];      // Allowed server IDs
}

/**
 * Signal-specific configuration
 */
export interface SignalConfig {
  phoneNumber?: string;
  signalCliPath?: string;
}

/**
 * Agent configuration for multi-agent support
 */
export interface AgentConfig {
  id: string;
  name: string;
  enabled: boolean;
  workspace: string;        // Path to agent workspace
  model?: string;           // Override default model
  
  // Permissions (toggles)
  permissions: AgentPermissions;
  
  // Access control
  accessControl: AgentAccessControl;
  
  // Channel routing
  channels?: string[];      // Which channels route to this agent
}

/**
 * Agent permission toggles
 */
export interface AgentPermissions {
  fileRead: boolean;
  fileWrite: boolean;
  walletAccess: boolean;    // Read-only for Phase 1
  webBrowsing: boolean;
  codeExecution: boolean;
  reminders: boolean;
  sandbox: boolean;         // Docker isolation
  auditLogging: boolean;
}

/**
 * Agent access control settings
 */
export interface AgentAccessControl {
  publicAccess: boolean;
  rateLimit?: {
    messagesPerMinute: number;
    messagesPerDay: number;
  };
}

/**
 * Inbound message from a channel
 */
export interface ChannelMessage {
  id: string;
  channel: ChannelType;
  accountId?: string;       // For multi-account support
  
  // Sender info
  sender: {
    id: string;             // E.164 for WhatsApp, username for Telegram
    name?: string;
    isGroup: boolean;
    groupId?: string;
    groupName?: string;
  };
  
  // Message content
  content: {
    text?: string;
    mediaType?: 'image' | 'audio' | 'video' | 'document';
    mediaUrl?: string;
    mediaCaption?: string;
    replyToId?: string;
    replyToText?: string;
  };
  
  // Metadata
  timestamp: string;        // ISO timestamp
  rawEvent?: any;           // Original event for debugging
}

/**
 * Outbound message to a channel
 */
export interface ChannelReply {
  channel: ChannelType;
  accountId?: string;
  
  // Target
  target: {
    id: string;             // Chat/user ID
    isGroup: boolean;
  };
  
  // Content
  content: {
    text: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'audio' | 'video' | 'document';
    replyToId?: string;     // Quote reply
  };
}

/**
 * Gateway service status
 */
export interface GatewayStatus {
  running: boolean;
  startedAt?: string;
  channels: Record<ChannelType, ChannelStatus>;
  agents: string[];         // List of active agent IDs
  stats: {
    messagesReceived: number;
    messagesSent: number;
    errors: number;
  };
}

/**
 * Pending pairing request
 */
export interface PairingRequest {
  id: string;
  channel: ChannelType;
  senderId: string;
  senderName?: string;
  code: string;
  createdAt: string;
  expiresAt: string;        // 1 hour expiry
}

/**
 * Gateway configuration (stored in PC2)
 */
export interface GatewayConfig {
  enabled: boolean;
  port: number;             // Default 18789
  
  // Channel configs
  channels: Partial<Record<ChannelType, ChannelConfig>>;
  
  // Agent configs
  agents: AgentConfig[];
  
  // Default agent ID
  defaultAgentId: string;
  
  // Global settings
  settings: {
    maxPendingPairings: number;
    pairingCodeExpiry: number;  // Minutes
    auditLogging: boolean;
  };
}

/**
 * Default gateway configuration
 */
export const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
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
      walletAccess: true,  // Read-only
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
    pairingCodeExpiry: 60,  // 1 hour
    auditLogging: true,
  },
};
