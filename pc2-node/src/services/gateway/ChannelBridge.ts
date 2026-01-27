/**
 * Channel Bridge
 * 
 * Routes messages from messaging channels to the PC2 AIChatService.
 * This is the bridge between Clawdbot's multi-channel system and PC2's AI.
 * 
 * The bridge:
 * 1. Receives messages from GatewayService
 * 2. Determines which agent should handle the message
 * 3. Formats the message for AIChatService
 * 4. Sends the response back through the channel
 * 5. Handles tool execution (with permission checks)
 */

import { logger } from '../../utils/logger.js';
import { AIChatService, CompleteRequest } from '../ai/AIChatService.js';
import { FilesystemManager } from '../../storage/filesystem.js';
import { DatabaseManager } from '../../storage/database.js';
import { GatewayService, getGatewayService } from './GatewayService.js';
import type {
  ChannelMessage,
  ChannelReply,
  ChannelType,
  AgentConfig,
  AgentPermissions,
} from './types.js';

/**
 * Message with channel metadata
 */
export interface ChannelChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  channel: ChannelType;
  senderName?: string;
}

/**
 * Session context for a conversation
 */
interface SessionContext {
  agentId: string;
  channel: ChannelType;
  senderId: string;
  senderName?: string;
  isGroup: boolean;
  groupId?: string;
  walletAddress?: string;
  messageHistory: ChannelChatMessage[];
  lastActivity: Date;
}

/**
 * Tool filter configuration based on agent permissions
 */
interface ToolFilter {
  allowFilesystemRead: boolean;
  allowFilesystemWrite: boolean;
  allowWalletRead: boolean;
  allowWalletWrite: boolean;  // Always false for Phase 1
  allowSettings: boolean;
}

/**
 * Read-only wallet tools that are safe for channel access
 */
const READ_ONLY_WALLET_TOOLS = [
  'get_wallet_info',
  'get_wallet_balance',
  'get_multi_chain_balances',
  'get_token_price',
  'get_system_info',
];

/**
 * Write wallet tools that are BLOCKED for channel access
 */
const WRITE_WALLET_TOOLS = [
  'transfer_tokens',
  'swap_tokens',
  'approve_token',
  'bridge_tokens',
];

/**
 * Channel Bridge class
 */
export class ChannelBridge {
  private aiService: AIChatService;
  private gateway: GatewayService;
  private db?: DatabaseManager;
  private filesystem?: FilesystemManager;
  private io?: any;  // Socket.IO for WebSocket events
  private ownerWalletAddress?: string;  // PC2 node owner's wallet for API key lookup
  
  // Session storage (keyed by channel:senderId or channel:groupId)
  private sessions: Map<string, SessionContext> = new Map();
  
  // Session timeout (30 minutes)
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000;
  
  // Max history per session
  private readonly MAX_HISTORY = 20;
  
  constructor(
    aiService: AIChatService,
    gateway: GatewayService,
    options?: {
      db?: DatabaseManager;
      filesystem?: FilesystemManager;
      io?: any;
      ownerWalletAddress?: string;
    }
  ) {
    this.aiService = aiService;
    this.gateway = gateway;
    this.db = options?.db;
    this.filesystem = options?.filesystem;
    this.ownerWalletAddress = options?.ownerWalletAddress;
    this.io = options?.io;
    
    // Register message handler with gateway
    this.gateway.setMessageHandler(this.handleMessage.bind(this));
    
    // Start session cleanup timer
    setInterval(() => this.cleanupSessions(), 5 * 60 * 1000); // Every 5 minutes
    
    logger.info('[ChannelBridge] Initialized');
  }
  
  /**
   * Handle an inbound message from a channel
   */
  async handleMessage(message: ChannelMessage): Promise<void> {
    const { channel, sender, content } = message;
    
    logger.info(`[ChannelBridge] Processing message from ${channel}`, {
      sender: sender.id,
      isGroup: sender.isGroup,
      textLength: content.text?.length,
    });
    
    // Get or create session
    const session = this.getOrCreateSession(message);
    
    // Get agent for this session
    const agent = this.getAgentForSession(session);
    if (!agent) {
      logger.error(`[ChannelBridge] No agent found for session: ${session.agentId}`);
      await this.sendErrorReply(message, 'No AI agent configured. Please check your PC2 settings.');
      return;
    }
    
    // Check if agent is enabled
    if (!agent.enabled) {
      await this.sendErrorReply(message, 'This AI agent is currently disabled.');
      return;
    }
    
    // Add user message to history
    session.messageHistory.push({
      role: 'user',
      content: content.text || '[Media message]',
      timestamp: message.timestamp,
      channel,
      senderName: sender.name,
    });
    
    // Trim history if too long
    if (session.messageHistory.length > this.MAX_HISTORY) {
      session.messageHistory = session.messageHistory.slice(-this.MAX_HISTORY);
    }
    
    session.lastActivity = new Date();
    
    try {
      // Process message with AI
      const response = await this.processWithAI(message, session, agent);
      
      // Add assistant response to history
      session.messageHistory.push({
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
        channel,
      });
      
      // Send reply
      await this.sendReply(message, response);
      
    } catch (error: any) {
      logger.error(`[ChannelBridge] Error processing message:`, error);
      await this.sendErrorReply(message, 'Sorry, I encountered an error. Please try again.');
    }
  }
  
  /**
   * Process a message with the AI service
   */
  private async processWithAI(
    message: ChannelMessage,
    session: SessionContext,
    agent: AgentConfig
  ): Promise<string> {
    const { content } = message;
    
    // Get channel settings for model selection
    const channelConfig = this.gateway.getChannelConfig(session.channel);
    const channelModel = channelConfig?.settings?.model;
    
    // Build messages array for AI
    const messages = this.buildMessages(session, agent, content.text || '');
    
    // Get tool filter based on agent permissions
    const toolFilter = this.getToolFilter(agent.permissions);
    
    // Determine which model to use: channel setting > agent setting > default
    let modelToUse = channelModel || agent.model;
    
    // Ensure the model includes the provider prefix for proper routing
    // The AI service uses "provider:model" format to determine which provider to use
    if (modelToUse && !modelToUse.includes(':')) {
      const provider = agent.provider || 'ollama';
      // Only add prefix for non-ollama providers (ollama is the default)
      if (provider !== 'ollama') {
        modelToUse = `${provider}:${modelToUse}`;
      }
    }
    
    // Build request based on agent permissions
    // Always pass walletAddress for API key lookup (Claude, OpenAI, etc.)
    // But only provide filesystem when file permissions allow
    // Tools are only enabled when BOTH filesystem AND walletAddress are provided
    const hasAnyFilePermission = toolFilter.allowFilesystemRead || toolFilter.allowFilesystemWrite;
    const hasWalletPermission = toolFilter.allowWalletRead;
    
    // For tools to work, AIChatService requires both filesystem AND walletAddress
    // So we control tools by controlling whether we pass filesystem
    const request: CompleteRequest = {
      messages,
      // Always pass owner wallet for API key lookup (required for Claude, etc.)
      walletAddress: this.ownerWalletAddress || session.walletAddress,
      // Only provide filesystem if file OR wallet permissions are enabled
      // (filesystem is the gate for enabling any tools in AIChatService)
      filesystem: (hasAnyFilePermission || hasWalletPermission) ? this.filesystem : undefined,
      io: this.io,
      model: modelToUse,
    };
    
    logger.info(`[ChannelBridge] Sending to AI`, {
      agent: agent.id,
      model: modelToUse,
      permissions: agent.permissions,
      toolFilter,
      hasFilesystem: !!request.filesystem,
      hasWallet: !!request.walletAddress,
      toolsEnabled: !!request.filesystem && !!request.walletAddress,
    });
    
    // Get AI response
    const completion = await this.aiService.complete(request);
    
    // Extract text response
    const responseText = this.extractResponseText(completion);
    
    return responseText;
  }
  
  /**
   * Build messages array for AI, including system prompt and history
   */
  private buildMessages(
    session: SessionContext,
    agent: AgentConfig,
    currentMessage: string
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    
    // System prompt with agent context
    const systemPrompt = this.buildSystemPrompt(session, agent);
    messages.push({ role: 'system', content: systemPrompt });
    
    // Add history (excluding the current message which is added separately)
    const historyToInclude = session.messageHistory.slice(0, -1);
    for (const msg of historyToInclude) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }
    
    // Add current message
    messages.push({ role: 'user', content: currentMessage });
    
    return messages;
  }
  
  /**
   * Build system prompt for the agent
   */
  private buildSystemPrompt(session: SessionContext, agent: AgentConfig): string {
    const parts: string[] = [];
    
    // Get soul content from agent configuration (not channel settings)
    const soulContent = agent.soulContent || agent.customSoul;
    
    // Agent identity with soul/personality
    if (soulContent) {
      // Use custom soul content from agent
      parts.push(soulContent);
      parts.push(`\nYou are running on a PC2 sovereign node, messaging via ${session.channel}.`);
    } else {
      // Default identity based on agent name
      parts.push(`You are ${agent.name}, an AI assistant running on a PC2 sovereign node.`);
      parts.push(`\nThe user is messaging you via ${session.channel}.`);
    }
    
    if (session.isGroup) {
      parts.push(`This is a group chat.`);
    }
    
    // Permissions context
    const perms = agent.permissions;
    parts.push(`\n## Your Capabilities`);
    
    if (perms.fileRead) {
      parts.push(`- You can read files from the user's PC2 storage`);
    }
    if (perms.fileWrite) {
      parts.push(`- You can create and modify files in the user's PC2 storage`);
    }
    if (perms.walletAccess) {
      parts.push(`- You can check wallet balances across all chains (get_wallet_balance, get_multi_chain_balances)`);
      parts.push(`- You can check token prices (get_token_price)`);
      parts.push(`- You can provide wallet information (get_wallet_info)`);
      parts.push(`- This is READ-ONLY access - you cannot create any transactions`);
    }
    if (perms.reminders) {
      parts.push(`- You can set reminders and scheduled tasks`);
    }
    
    // Restrictions
    parts.push(`\n## Restrictions`);
    if (!perms.fileWrite) {
      parts.push(`- You cannot modify files`);
    }
    if (!perms.codeExecution) {
      parts.push(`- You cannot execute shell commands`);
    }
    if (!perms.webBrowsing) {
      parts.push(`- You cannot browse the web`);
    }
    parts.push(`- You CANNOT send cryptocurrency transactions via messaging (this is disabled for security)`);
    parts.push(`- You CANNOT call transfer_tokens, swap_tokens, or any transaction-creating functions`);
    parts.push(`- If user asks to send/transfer/swap crypto, explain they must do this from the PC2 desktop interface`);
    
    // Response guidelines based on personality
    parts.push(`\n## Response Guidelines`);
    parts.push(`- Keep responses concise as they're sent via messaging`);
    parts.push(`- Use markdown sparingly (not all channels render it)`);
    if (!soulContent) {
      parts.push(`- Be helpful, friendly, and respect user privacy`);
    }
    parts.push(`- If you cannot do something, explain why clearly`);
    
    return parts.join('\n');
  }
  
  /**
   * Get tool filter based on agent permissions
   */
  private getToolFilter(permissions: AgentPermissions): ToolFilter {
    return {
      allowFilesystemRead: permissions.fileRead,
      allowFilesystemWrite: permissions.fileWrite,
      allowWalletRead: permissions.walletAccess,
      allowWalletWrite: false,  // Always false for Phase 1
      allowSettings: false,     // Agents shouldn't modify settings
    };
  }
  
  /**
   * Extract text response from AI completion
   */
  private extractResponseText(completion: any): string {
    // Handle different completion formats
    if (typeof completion === 'string') {
      return completion;
    }
    
    if (completion.content) {
      return completion.content;
    }
    
    if (completion.message?.content) {
      return completion.message.content;
    }
    
    if (completion.choices?.[0]?.message?.content) {
      return completion.choices[0].message.content;
    }
    
    logger.warn('[ChannelBridge] Unexpected completion format:', completion);
    return 'I processed your message but had trouble formatting the response.';
  }
  
  /**
   * Get or create a session for a message
   */
  private getOrCreateSession(message: ChannelMessage): SessionContext {
    const { channel, sender } = message;
    const sessionKey = sender.isGroup 
      ? `${channel}:group:${sender.groupId}`
      : `${channel}:dm:${sender.id}`;
    
    let session = this.sessions.get(sessionKey);
    
    if (!session) {
      // Determine which agent handles this channel
      const agentId = this.getAgentIdForChannel(channel, sender.id);
      
      session = {
        agentId,
        channel,
        senderId: sender.id,
        senderName: sender.name,
        isGroup: sender.isGroup,
        groupId: sender.groupId,
        messageHistory: [],
        lastActivity: new Date(),
      };
      
      this.sessions.set(sessionKey, session);
      logger.info(`[ChannelBridge] Created new session: ${sessionKey}`);
    } else if (sender.name && !session.senderName) {
      // Update sender name if we didn't have it before
      session.senderName = sender.name;
    }
    
    return session;
  }
  
  /**
   * Determine which agent should handle a channel/sender
   */
  private getAgentIdForChannel(channel: ChannelType, senderId: string): string {
    const agents = this.gateway.getAgents();
    const savedChannels = this.gateway.getSavedChannels();
    
    // Find saved channels of this type
    const channelsOfType = savedChannels.filter(c => c.type === channel);
    
    // Find an agent tethered to any of these saved channels
    for (const agent of agents) {
      if (agent.enabled && agent.tetheredChannels) {
        for (const savedChannel of channelsOfType) {
          if (agent.tetheredChannels.includes(savedChannel.id)) {
            return agent.id;
          }
        }
      }
    }
    
    // Fall back to default agent
    const config = this.gateway.getConfig();
    return config.defaultAgentId;
  }
  
  /**
   * Get agent configuration for a session
   */
  private getAgentForSession(session: SessionContext): AgentConfig | undefined {
    return this.gateway.getAgent(session.agentId);
  }
  
  /**
   * Send a reply to a channel
   */
  private async sendReply(originalMessage: ChannelMessage, text: string): Promise<void> {
    const reply: ChannelReply = {
      channel: originalMessage.channel,
      target: {
        id: originalMessage.sender.isGroup 
          ? originalMessage.sender.groupId!
          : originalMessage.sender.id,
        isGroup: originalMessage.sender.isGroup,
      },
      content: {
        text,
        replyToId: originalMessage.id,
      },
    };
    
    await this.gateway.sendReply(reply);
  }
  
  /**
   * Send an error reply
   */
  private async sendErrorReply(originalMessage: ChannelMessage, errorText: string): Promise<void> {
    await this.sendReply(originalMessage, `❌ ${errorText}`);
  }
  
  /**
   * Cleanup expired sessions
   */
  private cleanupSessions(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, session] of this.sessions) {
      if (now - session.lastActivity.getTime() > this.SESSION_TIMEOUT) {
        this.sessions.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.info(`[ChannelBridge] Cleaned up ${cleaned} expired sessions`);
    }
  }
  
  /**
   * Get session count (for monitoring)
   */
  getSessionCount(): number {
    return this.sessions.size;
  }
  
  /**
   * Get sessions for a specific channel (for debugging)
   */
  getSessionsForChannel(channel: ChannelType): SessionContext[] {
    return Array.from(this.sessions.values())
      .filter(s => s.channel === channel);
  }
}

/**
 * Create and initialize the channel bridge
 */
export function createChannelBridge(
  aiService: AIChatService,
  options?: {
    db?: DatabaseManager;
    filesystem?: FilesystemManager;
    io?: any;
    ownerWalletAddress?: string;
  }
): ChannelBridge {
  const gateway = getGatewayService(options?.db);
  return new ChannelBridge(aiService, gateway, options);
}
