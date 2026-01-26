/**
 * WhatsApp Channel Adapter
 * 
 * Integrates WhatsApp messaging via Baileys library.
 * Handles QR code authentication, message receiving/sending.
 */

import { EventEmitter } from 'events';
import { logger } from '../../../utils/logger.js';
import type { ChannelMessage, ChannelReply, WhatsAppConfig } from '../types.js';

/**
 * Create a Pino-compatible logger wrapper for Baileys
 * Baileys expects a logger with .child() method
 */
function createBaileysLogger() {
  const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
  
  const baileysLogger: any = {
    level: 'warn', // Only log warnings and errors from Baileys
    child: () => baileysLogger, // Return self for child loggers
  };
  
  // Add log methods that forward to our logger
  levels.forEach(level => {
    baileysLogger[level] = (obj: any, msg?: string) => {
      // Only forward warn and error to our logger
      if (level === 'warn' || level === 'error') {
        const message = msg || (typeof obj === 'string' ? obj : JSON.stringify(obj));
        if (level === 'error') {
          logger.error(`[Baileys] ${message}`);
        } else {
          logger.warn(`[Baileys] ${message}`);
        }
      }
    };
  });
  
  return baileysLogger;
}

// Baileys types (imported dynamically to handle ESM)
type WASocket = any;
type AuthState = any;

/**
 * WhatsApp Channel Events
 */
export interface WhatsAppChannelEvents {
  'qr': (qr: string) => void;
  'connected': (phoneNumber: string) => void;
  'disconnected': (reason: string) => void;
  'message': (message: ChannelMessage) => void;
  'error': (error: Error) => void;
}

/**
 * WhatsApp Channel Adapter
 */
export class WhatsAppChannel extends EventEmitter {
  private config: WhatsAppConfig;
  private credentialsPath: string;
  private socket: WASocket | null = null;
  private authState: AuthState | null = null;
  private connected: boolean = false;
  private phoneNumber: string | null = null;
  
  // Baileys module (loaded dynamically)
  private baileys: any = null;
  
  constructor(config: WhatsAppConfig, credentialsPath: string) {
    super();
    this.config = config;
    this.credentialsPath = credentialsPath;
  }
  
  /**
   * Load Baileys module dynamically
   */
  private async loadBaileys(): Promise<void> {
    if (this.baileys) return;
    
    try {
      this.baileys = await import('@whiskeysockets/baileys');
      logger.info('[WhatsAppChannel] Baileys module loaded');
    } catch (error: any) {
      logger.error('[WhatsAppChannel] Failed to load Baileys:', error.message);
      throw new Error('Failed to load WhatsApp library');
    }
  }
  
  /**
   * Initialize and connect
   */
  async connect(): Promise<void> {
    await this.loadBaileys();
    
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestBaileysVersion,
      makeCacheableSignalKeyStore,
    } = this.baileys;
    
    logger.info('[WhatsAppChannel] Connecting to WhatsApp...');
    
    try {
      // Get latest Baileys version
      const { version } = await fetchLatestBaileysVersion();
      logger.info('[WhatsAppChannel] Using Baileys version:', version);
      
      // Load auth state from credentials path
      const { state, saveCreds } = await useMultiFileAuthState(this.credentialsPath);
      this.authState = { state, saveCreds };
      
      // Create Baileys-compatible logger
      const baileysLogger = createBaileysLogger();
      
      // Create socket
      this.socket = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
        },
        printQRInTerminal: false, // We'll handle QR ourselves
        logger: baileysLogger,
        browser: ['PC2 Node', 'Chrome', '1.0.0'],
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
      });
      
      // Handle connection updates
      this.socket.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
          logger.info('[WhatsAppChannel] QR code received');
          this.emit('qr', qr);
        }
        
        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const reason = DisconnectReason[statusCode] || 'Unknown';
          
          logger.info('[WhatsAppChannel] Connection closed:', reason, statusCode);
          this.connected = false;
          
          // Don't reconnect if logged out OR connection was replaced (440)
          if (statusCode !== DisconnectReason.loggedOut && statusCode !== 440) {
            logger.info('[WhatsAppChannel] Reconnecting...');
            setTimeout(() => this.connect(), 3000);
          } else {
            const disconnectReason = statusCode === 440 ? 'Connection replaced' : 'Logged out';
            this.emit('disconnected', disconnectReason);
          }
        }
        
        if (connection === 'open') {
          logger.info('[WhatsAppChannel] Connected to WhatsApp');
          this.connected = true;
          
          // Get phone number from credentials
          const user = this.socket?.user;
          if (user?.id) {
            this.phoneNumber = user.id.split(':')[0];
            logger.info('[WhatsAppChannel] Phone number:', this.phoneNumber);
          }
          
          this.emit('connected', this.phoneNumber || 'unknown');
        }
      });
      
      // Save credentials on update
      this.socket.ev.on('creds.update', this.authState.saveCreds);
      
      // Handle incoming messages
      this.socket.ev.on('messages.upsert', async (m: any) => {
        await this.handleIncomingMessages(m);
      });
      
    } catch (error: any) {
      logger.error('[WhatsAppChannel] Connection error:', error);
      this.emit('error', error);
      throw error;
    }
  }
  
  /**
   * Disconnect from WhatsApp
   */
  async disconnect(): Promise<void> {
    if (this.socket) {
      logger.info('[WhatsAppChannel] Disconnecting...');
      await this.socket.logout();
      this.socket = null;
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
   * Get phone number
   */
  getPhoneNumber(): string | null {
    return this.phoneNumber;
  }
  
  /**
   * Handle incoming messages
   */
  private async handleIncomingMessages(m: any): Promise<void> {
    const { messages, type } = m;
    
    // Only process new messages
    if (type !== 'notify') return;
    
    for (const msg of messages) {
      try {
        // Skip status broadcasts and self messages (unless selfChatMode)
        if (msg.key.remoteJid === 'status@broadcast') continue;
        if (msg.key.fromMe && !this.config.selfChatMode) continue;
        
        // Parse message
        const channelMessage = this.parseMessage(msg);
        if (channelMessage) {
          logger.info('[WhatsAppChannel] Message received:', {
            from: channelMessage.sender.id,
            isGroup: channelMessage.sender.isGroup,
            hasText: !!channelMessage.content.text,
          });
          
          this.emit('message', channelMessage);
          
          // Send read receipt if enabled
          if (this.config.sendReadReceipts !== false && !this.config.selfChatMode) {
            await this.socket?.readMessages([msg.key]);
          }
        }
      } catch (error: any) {
        logger.error('[WhatsAppChannel] Error processing message:', error);
      }
    }
  }
  
  /**
   * Parse Baileys message to ChannelMessage
   */
  private parseMessage(msg: any): ChannelMessage | null {
    const { key, message, pushName, messageTimestamp } = msg;
    
    if (!message) return null;
    
    // Extract text content
    const text = message.conversation 
      || message.extendedTextMessage?.text
      || message.imageMessage?.caption
      || message.videoMessage?.caption
      || null;
    
    // Get sender info
    const remoteJid = key.remoteJid || '';
    const isGroup = remoteJid.endsWith('@g.us');
    const senderId = isGroup
      ? (key.participant || '').replace('@s.whatsapp.net', '')
      : remoteJid.replace('@s.whatsapp.net', '');
    
    // Parse media
    let mediaType: 'image' | 'audio' | 'video' | 'document' | undefined;
    if (message.imageMessage) mediaType = 'image';
    else if (message.audioMessage) mediaType = 'audio';
    else if (message.videoMessage) mediaType = 'video';
    else if (message.documentMessage) mediaType = 'document';
    
    // Get quoted message
    const quotedMessage = message.extendedTextMessage?.contextInfo?.quotedMessage;
    const replyToId = message.extendedTextMessage?.contextInfo?.stanzaId;
    const replyToText = quotedMessage?.conversation 
      || quotedMessage?.extendedTextMessage?.text
      || undefined;
    
    return {
      id: key.id || `${Date.now()}`,
      channel: 'whatsapp',
      sender: {
        id: senderId,
        name: pushName || undefined,
        isGroup,
        groupId: isGroup ? remoteJid : undefined,
      },
      content: {
        text: text || undefined,
        mediaType,
        replyToId,
        replyToText,
      },
      timestamp: new Date((messageTimestamp as number) * 1000).toISOString(),
      rawEvent: msg,
    };
  }
  
  /**
   * Send a reply
   */
  async sendReply(reply: ChannelReply): Promise<void> {
    if (!this.socket || !this.connected) {
      throw new Error('WhatsApp not connected');
    }
    
    const jid = reply.target.isGroup
      ? reply.target.id
      : `${reply.target.id}@s.whatsapp.net`;
    
    logger.info('[WhatsAppChannel] Sending reply to:', jid);
    
    try {
      // Build message content
      const content: any = {};
      
      if (reply.content.text) {
        content.text = reply.content.text;
      }
      
      // Add quote if replying
      if (reply.content.replyToId) {
        content.quoted = {
          key: {
            remoteJid: jid,
            id: reply.content.replyToId,
          },
        };
      }
      
      // Send message
      await this.socket.sendMessage(jid, content);
      
      logger.info('[WhatsAppChannel] Reply sent successfully');
      
    } catch (error: any) {
      logger.error('[WhatsAppChannel] Failed to send reply:', error);
      throw error;
    }
  }
  
  /**
   * Generate QR code as text for terminal display
   */
  async generateQRText(qr: string): Promise<string> {
    try {
      const qrcode = await import('qrcode-terminal');
      return new Promise((resolve) => {
        let output = '';
        qrcode.generate(qr, { small: true }, (qrText: string) => {
          output = qrText;
          resolve(output);
        });
      });
    } catch {
      return qr; // Return raw QR data if terminal generation fails
    }
  }
}

/**
 * Create WhatsApp channel instance
 */
export function createWhatsAppChannel(
  config: WhatsAppConfig,
  credentialsPath: string
): WhatsAppChannel {
  return new WhatsAppChannel(config, credentialsPath);
}
