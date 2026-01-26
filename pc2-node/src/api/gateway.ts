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
} from '../services/gateway/types.js';

const router = Router();

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
    
    res.json({
      success: true,
      data: { channel, connected: true },
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
    
    // Check if there's a pending QR code
    // The QR code is emitted as an event, we need to capture it
    let qrCode: string | null = null;
    let qrText: string | null = null;
    
    // Listen for QR event (with timeout)
    const qrPromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('QR code not yet available'));
      }, 1000);
      
      gateway.once('whatsapp:qr', (qr: string) => {
        clearTimeout(timeout);
        resolve(qr);
      });
    });
    
    try {
      qrCode = await qrPromise;
      
      // Generate text representation
      const qrcode = await import('qrcode-terminal');
      qrText = await new Promise<string>((resolve) => {
        qrcode.generate(qrCode!, { small: true }, (text: string) => {
          resolve(text);
        });
      });
    } catch {
      // QR not available yet
    }
    
    res.json({
      success: true,
      data: {
        available: !!qrCode,
        qrCode,
        qrText,
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
    const { agentId } = req.params;
    
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
    const { agentId } = req.params;
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
    const { agentId } = req.params;
    
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

export default router;
