/**
 * Telegram Channel Adapter
 * 
 * Integrates Telegram messaging via grammY library.
 * Handles bot authentication, message receiving/sending.
 */

import { EventEmitter } from 'events';
import { logger } from '../../../utils/logger.js';
import type { ChannelMessage, ChannelReply, TelegramConfig } from '../types.js';

// grammY types (imported dynamically)
type Bot = any;
type Context = any;

/**
 * Telegram Channel Events
 */
export interface TelegramChannelEvents {
  'connected': (botUsername: string) => void;
  'disconnected': (reason: string) => void;
  'message': (message: ChannelMessage) => void;
  'error': (error: Error) => void;
}

/**
 * Telegram Channel Adapter
 */
export class TelegramChannel extends EventEmitter {
  private config: TelegramConfig;
  private bot: Bot | null = null;
  private connected: boolean = false;
  private botUsername: string | null = null;
  
  // grammY module (loaded dynamically)
  private grammy: any = null;
  
  constructor(config: TelegramConfig) {
    super();
    this.config = config;
  }
  
  /**
   * Load grammY module dynamically
   */
  private async loadGrammy(): Promise<void> {
    if (this.grammy) return;
    
    try {
      this.grammy = await import('grammy');
      logger.info('[TelegramChannel] grammY module loaded');
    } catch (error: any) {
      logger.error('[TelegramChannel] Failed to load grammY:', error.message);
      throw new Error('Failed to load Telegram library');
    }
  }
  
  /**
   * Initialize and connect
   */
  async connect(): Promise<void> {
    if (!this.config.botToken) {
      throw new Error('Telegram bot token is required');
    }
    
    await this.loadGrammy();
    
    const { Bot } = this.grammy;
    
    logger.info('[TelegramChannel] Connecting to Telegram...');
    
    try {
      // Create bot instance
      this.bot = new Bot(this.config.botToken);
      
      // Get bot info
      const me = await this.bot.api.getMe();
      this.botUsername = me.username;
      logger.info('[TelegramChannel] Bot connected:', this.botUsername);
      
      // Handle incoming messages
      this.bot.on('message', async (ctx: Context) => {
        await this.handleMessage(ctx);
      });
      
      // Handle errors
      this.bot.catch((error: any) => {
        logger.error('[TelegramChannel] Bot error:', error);
        this.emit('error', error);
      });
      
      // Start polling
      this.bot.start({
        onStart: () => {
          this.connected = true;
          this.emit('connected', this.botUsername || 'unknown');
          logger.info('[TelegramChannel] Bot started polling');
        },
      });
      
    } catch (error: any) {
      logger.error('[TelegramChannel] Connection error:', error);
      this.emit('error', error);
      throw error;
    }
  }
  
  /**
   * Disconnect from Telegram
   */
  async disconnect(): Promise<void> {
    if (this.bot) {
      logger.info('[TelegramChannel] Disconnecting...');
      await this.bot.stop();
      this.bot = null;
      this.connected = false;
      this.emit('disconnected', 'Manual disconnect');
    }
  }
  
  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
  
  /**
   * Get bot username
   */
  getBotUsername(): string | null {
    return this.botUsername;
  }
  
  /**
   * Handle incoming message
   */
  private async handleMessage(ctx: Context): Promise<void> {
    try {
      const msg = ctx.message;
      if (!msg) return;
      
      // Parse message
      const channelMessage = this.parseMessage(ctx);
      if (channelMessage) {
        logger.info('[TelegramChannel] Message received:', {
          from: channelMessage.sender.id,
          isGroup: channelMessage.sender.isGroup,
          hasText: !!channelMessage.content.text,
        });
        
        // Check access control
        if (!this.checkAccess(channelMessage)) {
          logger.info('[TelegramChannel] Access denied for:', channelMessage.sender.id);
          return;
        }
        
        this.emit('message', channelMessage);
      }
    } catch (error: any) {
      logger.error('[TelegramChannel] Error handling message:', error);
    }
  }
  
  /**
   * Check if sender has access
   */
  private checkAccess(message: ChannelMessage): boolean {
    // If public bot, allow all
    if (this.config.publicBot) {
      return true;
    }
    
    // Check rate limit if configured
    if (this.config.rateLimit) {
      // TODO: Implement rate limiting
    }
    
    return true; // Allow by default for now
  }
  
  /**
   * Parse grammY context to ChannelMessage
   */
  private parseMessage(ctx: Context): ChannelMessage | null {
    const msg = ctx.message;
    if (!msg) return null;
    
    // Get text content
    const text = msg.text || msg.caption || null;
    
    // Get sender info
    const chat = msg.chat;
    const from = msg.from;
    const isGroup = chat.type === 'group' || chat.type === 'supergroup';
    
    // Use numeric chat ID for replies (required by Telegram API)
    // The chat.id is the correct target for sendMessage
    const senderId = chat.id.toString();
    
    // Display name: prefer username, fallback to name or ID
    const senderDisplayName = from?.username 
      ? `@${from.username}`
      : from?.first_name || `User ${from?.id || 'unknown'}`;
    
    // Parse media
    let mediaType: 'image' | 'audio' | 'video' | 'document' | undefined;
    if (msg.photo) mediaType = 'image';
    else if (msg.audio || msg.voice) mediaType = 'audio';
    else if (msg.video || msg.video_note) mediaType = 'video';
    else if (msg.document) mediaType = 'document';
    
    // Get reply info
    const replyToMessage = msg.reply_to_message;
    const replyToId = replyToMessage?.message_id?.toString();
    const replyToText = replyToMessage?.text || replyToMessage?.caption;
    
    return {
      id: msg.message_id.toString(),
      channel: 'telegram',
      sender: {
        id: senderId,
        name: senderDisplayName,
        isGroup,
        groupId: isGroup ? chat.id.toString() : undefined,
        groupName: isGroup ? chat.title : undefined,
      },
      content: {
        text: text || undefined,
        mediaType,
        replyToId,
        replyToText,
      },
      timestamp: new Date(msg.date * 1000).toISOString(),
      rawEvent: ctx,
    };
  }
  
  /**
   * Send a reply
   */
  async sendReply(reply: ChannelReply): Promise<void> {
    if (!this.bot || !this.connected) {
      throw new Error('Telegram not connected');
    }
    
    const chatId = reply.target.id;
    
    logger.info('[TelegramChannel] Sending reply to:', chatId);
    
    try {
      const options: any = {};
      
      // Add reply if specified
      if (reply.content.replyToId) {
        options.reply_to_message_id = parseInt(reply.content.replyToId);
      }
      
      // Send text message with markdown support
      if (reply.content.text) {
        let text = reply.content.text;
        
        // Try sending with Markdown parse mode first
        // Telegram's Markdown uses *bold* not **bold**, so convert
        const markdownText = text
          .replace(/\*\*(.+?)\*\*/g, '*$1*')  // **bold** -> *bold*
          .replace(/__(.+?)__/g, '_$1_');      // __italic__ -> _italic_
        
        try {
          await this.bot.api.sendMessage(chatId, markdownText, { 
            ...options, 
            parse_mode: 'Markdown' 
          });
        } catch (parseError: any) {
          // If markdown parsing fails, send as plain text
          logger.warn('[TelegramChannel] Markdown parse failed, sending as plain text:', parseError.message);
          await this.bot.api.sendMessage(chatId, text, options);
        }
      }
      
      logger.info('[TelegramChannel] Reply sent successfully');
      
    } catch (error: any) {
      // Handle common Telegram errors gracefully
      if (error.error_code === 400 && error.description?.includes('chat not found')) {
        logger.warn('[TelegramChannel] Chat not found, user may need to start conversation with bot first:', chatId);
        // Don't throw - this is expected for new users
        return;
      }
      if (error.error_code === 403) {
        logger.warn('[TelegramChannel] Bot was blocked by user:', chatId);
        return;
      }
      logger.error('[TelegramChannel] Failed to send reply:', error.message || error);
      // Don't throw to prevent server crash
    }
  }
}

/**
 * Create Telegram channel instance
 */
export function createTelegramChannel(config: TelegramConfig): TelegramChannel {
  return new TelegramChannel(config);
}
