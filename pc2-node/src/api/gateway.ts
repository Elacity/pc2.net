/**
 * Gateway API Routes
 * 
 * API endpoints for managing the Clawdbot gateway integration.
 * Handles channel management, agent configuration, and pairing.
 */

import { Router, Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from './middleware.js';
import { logger } from '../utils/logger.js';
import { getGatewayService } from '../services/gateway/index.js';
import type {
  ChannelType,
  ChannelConfig,
  AgentConfig,
  SavedChannel,
} from '../services/gateway/types.js';

const router = Router();

/**
 * Sanitize agent ID to prevent path traversal attacks
 * Only allows alphanumeric, hyphens, and underscores
 */
function sanitizeAgentId(agentId: string): string {
  if (!agentId || typeof agentId !== 'string') {
    throw new Error('Agent ID is required');
  }
  
  // Check for path traversal attempts
  if (agentId.includes('..') || agentId.includes('/') || agentId.includes('\\')) {
    throw new Error('Agent ID contains invalid path characters');
  }
  
  // Only allow safe characters
  const sanitized = agentId.replace(/[^a-zA-Z0-9_\-]/g, '-');
  
  if (sanitized.length === 0) {
    throw new Error('Agent ID is empty after sanitization');
  }
  
  return sanitized;
}

/**
 * GET /api/gateway/status
 * Get gateway status including channel connections and stats
 */
router.get('/status', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gateway = getGatewayService(req.app.locals.db);
    const status = gateway.getStatus();
    
    res.json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    logger.error('[Gateway API] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/gateway/config
 * Get full gateway configuration
 */
router.get('/config', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gateway = getGatewayService(req.app.locals.db);
    const config = gateway.getConfig();
    
    // Mask sensitive data (tokens, API keys)
    const maskedConfig = {
      ...config,
      channels: Object.fromEntries(
        Object.entries(config.channels).map(([key, value]) => {
          if (!value) return [key, value];
          const masked = { ...value };
          if (masked.telegram?.botToken) {
            masked.telegram = { ...masked.telegram, botToken: '***' };
          }
          if (masked.discord?.botToken) {
            masked.discord = { ...masked.discord, botToken: '***' };
          }
          return [key, masked];
        })
      ),
    };
    
    res.json({
      success: true,
      data: maskedConfig,
    });
  } catch (error: any) {
    logger.error('[Gateway API] Error getting config:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/gateway/enable
 * Enable or disable the gateway
 */
router.post('/enable', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled must be a boolean',
      });
    }
    
    const gateway = getGatewayService(req.app.locals.db);
    await gateway.setEnabled(enabled);
    
    res.json({
      success: true,
      data: { enabled },
    });
  } catch (error: any) {
    logger.error('[Gateway API] Error setting enabled:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/gateway/channels
 * Get all channel configurations
 */
router.get('/channels', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gateway = getGatewayService(req.app.locals.db);
    const config = gateway.getConfig();
    const status = gateway.getStatus();
    
    // Build channel list with status
    const channels = ['whatsapp', 'telegram', 'discord', 'signal', 'webchat'].map(ch => {
      const channelType = ch as ChannelType;
      const channelConfig = config.channels[channelType];
      
      return {
        type: channelType,
        enabled: channelConfig?.enabled || false,
        status: status.channels[channelType],
        dmPolicy: channelConfig?.dmPolicy || 'pairing',
        allowFrom: channelConfig?.allowFrom || [],
        linkedAt: channelConfig?.linkedAt,
        lastActive: channelConfig?.lastActive,
        // Channel-specific info (masked)
        info: getChannelInfo(channelType, channelConfig),
      };
    });
    
    res.json({
      success: true,
      data: channels,
    });
  } catch (error: any) {
    logger.error('[Gateway API] Error getting channels:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get masked channel-specific info
 */
function getChannelInfo(type: ChannelType, config?: ChannelConfig): Record<string, any> {
  if (!config) return {};
  
  switch (type) {
    case 'whatsapp':
      return {
        phoneNumber: config.whatsapp?.phoneNumber,
        selfChatMode: config.whatsapp?.selfChatMode,
      };
    case 'telegram':
      return {
        botUsername: config.telegram?.botUsername,
        publicBot: config.telegram?.publicBot,
        hasToken: !!config.telegram?.botToken,
      };
    case 'discord':
      return {
        botUsername: config.discord?.botUsername,
        guildCount: config.discord?.guildIds?.length || 0,
        hasToken: !!config.discord?.botToken,
      };
    case 'signal':
      return {
        phoneNumber: config.signal?.phoneNumber,
      };
    default:
      return {};
  }
}

/**
 * GET /api/gateway/channels/:channel
 * Get specific channel configuration
 */
router.get('/channels/:channel', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const channel = req.params.channel as ChannelType;
    const validChannels: ChannelType[] = ['whatsapp', 'telegram', 'discord', 'signal', 'webchat'];
    
    if (!validChannels.includes(channel)) {
      return res.status(400).json({
        success: false,
        error: `Invalid channel: ${channel}`,
      });
    }
    
    const gateway = getGatewayService(req.app.locals.db);
    const config = gateway.getChannelConfig(channel);
    const status = gateway.getStatus();
    
    res.json({
      success: true,
      data: {
        type: channel,
        config: config || null,
        status: status.channels[channel],
      },
    });
  } catch (error: any) {
    logger.error('[Gateway API] Error getting channel:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/gateway/channels/:channel
 * Update channel configuration
 */
router.put('/channels/:channel', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const channel = req.params.channel as ChannelType;
    const validChannels: ChannelType[] = ['whatsapp', 'telegram', 'discord', 'signal', 'webchat'];
    
    if (!validChannels.includes(channel)) {
      return res.status(400).json({
        success: false,
        error: `Invalid channel: ${channel}`,
      });
    }
    
    const gateway = getGatewayService(req.app.locals.db);
    await gateway.updateChannelConfig(channel, req.body);
    
    res.json({
      success: true,
      data: { channel, updated: true },
    });
  } catch (error: any) {
    logger.error('[Gateway API] Error updating channel:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/gateway/channels/:channel/connect
 * Connect a channel
 */
router.post('/channels/:channel/connect', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const channel = req.params.channel as ChannelType;
    
    const gateway = getGatewayService(req.app.locals.db);
    
    // First update config if provided
    if (req.body) {
      await gateway.updateChannelConfig(channel, {
        enabled: true,
        ...req.body,
      });
    }
    
    // Then connect
    await gateway.connectChannel(channel);
    
    // Get updated config to include bot username etc.
    const channelConfig = gateway.getChannelConfig(channel);
    const botUsername = channelConfig?.telegram?.botUsername || 
                        channelConfig?.discord?.botUsername || 
                        undefined;
    
    res.json({
      success: true,
      data: { 
        channel, 
        connected: true,
        botUsername, // Return the bot username
      },
    });
  } catch (error: any) {
    logger.error('[Gateway API] Error connecting channel:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/gateway/channels/whatsapp/qr
 * Get WhatsApp QR code for linking
 * This endpoint is polled by the frontend while waiting for QR
 */
router.get('/channels/whatsapp/qr', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gateway = getGatewayService(req.app.locals.db);
    
    // Get the stored QR code
    const qrCode = gateway.getWhatsAppQR();
    let qrDataUrl: string | null = null;
    
    if (qrCode) {
      // Generate data URL image for browser display
      try {
        const QRCode = await import('qrcode');
        qrDataUrl = await QRCode.toDataURL(qrCode, {
          width: 256,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
      } catch (e: any) {
        logger.error('[Gateway API] QR generation failed:', e.message);
      }
    }
    
    res.json({
      success: true,
      data: {
        available: !!qrCode,
        qrCode,
        qrDataUrl,
      },
    });
  } catch (error: any) {
    logger.error('[Gateway API] Error getting QR:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/gateway/channels/:channel/disconnect
 * Disconnect a channel
 */
router.post('/channels/:channel/disconnect', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const channel = req.params.channel as ChannelType;
    
    const gateway = getGatewayService(req.app.locals.db);
    await gateway.disconnectChannel(channel);
    
    // Update config
    await gateway.updateChannelConfig(channel, { enabled: false });
    
    res.json({
      success: true,
      data: { channel, connected: false },
    });
  } catch (error: any) {
    logger.error('[Gateway API] Error disconnecting channel:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/gateway/agents
 * Get all agent configurations
 */
router.get('/agents', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gateway = getGatewayService(req.app.locals.db);
    const agents = gateway.getAgents();
    
    res.json({
      success: true,
      data: agents,
    });
  } catch (error: any) {
    logger.error('[Gateway API] Error getting agents:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/gateway/agents/:agentId
 * Get specific agent configuration
 */
router.get('/agents/:agentId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agentId = sanitizeAgentId(req.params.agentId);
    
    const gateway = getGatewayService(req.app.locals.db);
    const agent = gateway.getAgent(agentId);
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: `Agent not found: ${agentId}`,
      });
    }
    
    res.json({
      success: true,
      data: agent,
    });
  } catch (error: any) {
    logger.error('[Gateway API] Error getting agent:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/gateway/agents
 * Create a new agent
 */
router.post('/agents', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agent = req.body as AgentConfig;
    
    // Validate required fields
    if (!agent.id || !agent.name || !agent.workspace) {
      return res.status(400).json({
        success: false,
        error: 'Agent must have id, name, and workspace',
      });
    }
    
    // Sanitize agent ID to prevent path traversal
    agent.id = sanitizeAgentId(agent.id);
    
    // Set defaults
    if (!agent.permissions) {
      agent.permissions = {
        fileRead: true,
        fileWrite: false,
        walletAccess: false,
        webBrowsing: false,
        codeExecution: false,
        reminders: false,
        sandbox: false,
        auditLogging: true,
      };
    }
    if (!agent.accessControl) {
      agent.accessControl = { publicAccess: false };
    }
    if (agent.enabled === undefined) {
      agent.enabled = true;
    }
    
    const gateway = getGatewayService(req.app.locals.db);
    await gateway.upsertAgent(agent);
    
    res.json({
      success: true,
      data: agent,
    });
  } catch (error: any) {
    logger.error('[Gateway API] Error creating agent:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/gateway/agents/:agentId
 * Update an agent
 */
router.put('/agents/:agentId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agentId = sanitizeAgentId(req.params.agentId);
    const updates = req.body;
    
    const gateway = getGatewayService(req.app.locals.db);
    const existing = gateway.getAgent(agentId);
    
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Agent not found: ${agentId}`,
      });
    }
    
    const updated: AgentConfig = {
      ...existing,
      ...updates,
      id: agentId, // Ensure ID doesn't change
    };
    
    await gateway.upsertAgent(updated);
    
    res.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    logger.error('[Gateway API] Error updating agent:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/gateway/agents/:agentId
 * Delete an agent
 */
router.delete('/agents/:agentId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agentId = sanitizeAgentId(req.params.agentId);
    
    // Protect default agent from deletion
    if (agentId === 'personal') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete the default personal agent',
      });
    }
    
    const gateway = getGatewayService(req.app.locals.db);
    const deleted = await gateway.removeAgent(agentId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: `Agent not found: ${agentId}`,
      });
    }
    
    res.json({
      success: true,
      data: { agentId, deleted: true },
    });
  } catch (error: any) {
    logger.error('[Gateway API] Error deleting agent:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/gateway/pairings
 * Get pending pairing requests
 */
router.get('/pairings', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gateway = getGatewayService(req.app.locals.db);
    const pairings = gateway.getPendingPairings();
    
    res.json({
      success: true,
      data: pairings,
    });
  } catch (error: any) {
    logger.error('[Gateway API] Error getting pairings:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/gateway/pairings/:channel/:senderId/approve
 * Approve a pairing request
 */
router.post('/pairings/:channel/:senderId/approve', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channel, senderId } = req.params;
    
    const gateway = getGatewayService(req.app.locals.db);
    const approved = await gateway.approvePairing(channel as ChannelType, senderId);
    
    if (!approved) {
      return res.status(404).json({
        success: false,
        error: 'Pairing request not found or expired',
      });
    }
    
    res.json({
      success: true,
      data: { channel, senderId, approved: true },
    });
  } catch (error: any) {
    logger.error('[Gateway API] Error approving pairing:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/gateway/channels/:channel/settings
 * Get channel-specific settings (model, personality, access control)
 */
router.get('/channels/:channel/settings', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const channel = req.params.channel as ChannelType;
    const gateway = getGatewayService(req.app.locals.db);
    const config = gateway.getChannelConfig(channel);
    
    // Extract settings from config
    const settings = {
      model: config?.settings?.model || 'ollama:llama3.2',
      personality: config?.settings?.personality || 'friendly',
      customSoul: config?.settings?.customSoul || '',
      soulContent: config?.settings?.soulContent || '',
      accessMode: config?.settings?.accessMode || 'public',
      rateLimit: config?.settings?.rateLimit || {
        messagesPerMinute: 10,
        messagesPerHour: 100,
      },
    };
    
    res.json({
      success: true,
      data: settings,
    });
  } catch (error: any) {
    logger.error('[Gateway API] Error getting channel settings:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/gateway/channels/:channel/settings
 * Save channel-specific settings (model, personality, access control)
 */
router.post('/channels/:channel/settings', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const channel = req.params.channel as ChannelType;
    const { model, personality, customSoul, soulContent, accessMode, rateLimit } = req.body;
    
    const gateway = getGatewayService(req.app.locals.db);
    
    // Update channel config with settings
    await gateway.updateChannelConfig(channel, {
      settings: {
        model,
        personality,
        customSoul,
        soulContent,
        accessMode,
        rateLimit,
      },
    });
    
    logger.info(`[Gateway API] Channel ${channel} settings updated`);
    
    res.json({
      success: true,
      data: { channel, settingsUpdated: true },
    });
  } catch (error: any) {
    logger.error('[Gateway API] Error saving channel settings:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// Saved Channels (Credentials) Endpoints
// ============================================

/**
 * GET /api/gateway/saved-channels
 * Get all saved channel credentials
 */
router.get('/saved-channels', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gateway = getGatewayService(req.app.locals.db);
    const channels = gateway.getSavedChannels();
    
    // Mask tokens
    const masked = channels.map(ch => ({
      ...ch,
      telegram: ch.telegram ? { ...ch.telegram, botToken: '***' + (ch.telegram.botToken?.slice(-4) || '') } : undefined,
      discord: ch.discord ? { ...ch.discord, botToken: '***' + (ch.discord.botToken?.slice(-4) || '') } : undefined,
    }));
    
    res.json({ success: true, data: masked });
  } catch (error: any) {
    logger.error('[Gateway API] Error getting saved channels:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/gateway/saved-channels/:type
 * Get saved channels by type (telegram, discord, whatsapp)
 */
router.get('/saved-channels/type/:type', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type } = req.params;
    const gateway = getGatewayService(req.app.locals.db);
    const channels = gateway.getSavedChannelsByType(type as ChannelType);
    
    // Mask tokens
    const masked = channels.map(ch => ({
      ...ch,
      telegram: ch.telegram ? { ...ch.telegram, botToken: '***' + (ch.telegram.botToken?.slice(-4) || '') } : undefined,
      discord: ch.discord ? { ...ch.discord, botToken: '***' + (ch.discord.botToken?.slice(-4) || '') } : undefined,
    }));
    
    res.json({ success: true, data: masked });
  } catch (error: any) {
    logger.error('[Gateway API] Error getting saved channels by type:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/gateway/saved-channels/:channelId
 * Get a specific saved channel
 */
router.get('/saved-channels/:channelId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    const gateway = getGatewayService(req.app.locals.db);
    const channel = gateway.getSavedChannel(channelId);
    
    if (!channel) {
      return res.status(404).json({ success: false, error: 'Saved channel not found' });
    }
    
    // Mask tokens
    const masked = {
      ...channel,
      telegram: channel.telegram ? { ...channel.telegram, botToken: '***' + (channel.telegram.botToken?.slice(-4) || '') } : undefined,
      discord: channel.discord ? { ...channel.discord, botToken: '***' + (channel.discord.botToken?.slice(-4) || '') } : undefined,
    };
    
    res.json({ success: true, data: masked });
  } catch (error: any) {
    logger.error('[Gateway API] Error getting saved channel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/gateway/saved-channels
 * Create a new saved channel
 */
router.post('/saved-channels', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, name, telegram, discord, whatsapp } = req.body;
    
    if (!type || !name) {
      return res.status(400).json({ success: false, error: 'type and name are required' });
    }
    
    const gateway = getGatewayService(req.app.locals.db);
    
    const channel: SavedChannel = {
      id: `${type}-${Date.now()}`,
      type,
      name,
      createdAt: new Date().toISOString(),
      telegram,
      discord,
      whatsapp,
    };
    
    await gateway.upsertSavedChannel(channel);
    
    logger.info(`[Gateway API] Saved channel ${channel.id} created`);
    
    res.json({ success: true, data: { ...channel, telegram: channel.telegram ? { ...channel.telegram, botToken: '***' } : undefined } });
  } catch (error: any) {
    logger.error('[Gateway API] Error creating saved channel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/gateway/saved-channels/:channelId
 * Update a saved channel
 */
router.put('/saved-channels/:channelId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    const { name, telegram, discord, whatsapp } = req.body;
    
    const gateway = getGatewayService(req.app.locals.db);
    const existing = gateway.getSavedChannel(channelId);
    
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Saved channel not found' });
    }
    
    const updated: SavedChannel = {
      ...existing,
      name: name || existing.name,
      telegram: telegram || existing.telegram,
      discord: discord || existing.discord,
      whatsapp: whatsapp || existing.whatsapp,
    };
    
    await gateway.upsertSavedChannel(updated);
    
    logger.info(`[Gateway API] Saved channel ${channelId} updated`);
    
    res.json({ success: true, data: { ...updated, telegram: updated.telegram ? { ...updated.telegram, botToken: '***' } : undefined } });
  } catch (error: any) {
    logger.error('[Gateway API] Error updating saved channel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/gateway/saved-channels/:channelId
 * Delete a saved channel
 */
router.delete('/saved-channels/:channelId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    
    const gateway = getGatewayService(req.app.locals.db);
    await gateway.deleteSavedChannel(channelId);
    
    logger.info(`[Gateway API] Saved channel ${channelId} deleted`);
    
    res.json({ success: true, data: { channelId, deleted: true } });
  } catch (error: any) {
    logger.error('[Gateway API] Error deleting saved channel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/gateway/saved-channels/:channelId/connect
 * Connect a saved channel (start the bot)
 */
router.post('/saved-channels/:channelId/connect', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    
    const gateway = getGatewayService(req.app.locals.db);
    const result = await gateway.connectSavedChannel(channelId);
    
    if (result.success) {
      logger.info(`[Gateway API] Saved channel ${channelId} connected`);
      res.json({ success: true, data: { channelId, connected: true } });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    logger.error('[Gateway API] Error connecting saved channel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
