/**
 * AI Configuration API Endpoints
 * 
 * Wallet-scoped AI configuration management for personal PC2 nodes
 * Each user has their own isolated AI configuration
 */

import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from './middleware.js';
import { logger } from '../utils/logger.js';
import { AIChatService } from '../services/ai/AIChatService.js';

const router = Router();

/**
 * GET /api/ai/config
 * Get current AI configuration for the authenticated user
 */
router.get('/config', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user!.wallet_address;
    const db = req.app.locals.db;
    
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }

    let config: any = null;
    try {
      config = db.getAIConfig(walletAddress);
    } catch (error: any) {
      // If table doesn't exist yet (migration not run), return defaults
      if (error.message && error.message.includes('no such table')) {
        logger.warn('[AI API] ai_config table not found, returning defaults. Please restart server to run migration.');
        config = null; // Will use defaults below
      } else {
        throw error;
      }
    }
    
    // Parse API keys and mask them
    let apiKeys: Record<string, string> | null = null;
    if (config?.api_keys) {
      try {
        const keys = JSON.parse(config.api_keys);
        // Mask API keys (show only last 4 characters)
        apiKeys = {};
        for (const [provider, key] of Object.entries(keys)) {
          if (typeof key === 'string' && key.length > 4) {
            apiKeys[provider] = '***' + key.slice(-4);
          } else {
            apiKeys[provider] = '***';
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    // Get AI service status
    const aiService = req.app.locals.aiService as AIChatService | undefined;
    let providerStatus = 'unknown';
    let currentModel = config?.default_model || null;
    const defaultProvider = config?.default_provider || 'ollama';
    
    // Clean model name - remove provider prefix if present (e.g., "ollama:llava:7b" -> "llava:7b")
    if (currentModel && currentModel.includes(':')) {
      const parts = currentModel.split(':');
      // If first part is a provider name, remove it
      if (parts[0] === 'ollama' || parts[0] === 'claude' || parts[0] === 'openai' || parts[0] === 'gemini' || parts[0] === 'xai') {
        currentModel = parts.slice(1).join(':'); // Keep rest as model name
        logger.info('[AI API] Cleaned model name from config:', config.default_model, '->', currentModel);
      }
    }
    
    // Default model for each provider
    if (!currentModel) {
      const defaultModels: Record<string, string> = {
        'ollama': 'deepseek-r1:1.5b',
        'claude': 'claude-sonnet-4-5-20250929',
        'openai': 'gpt-4o',
        'gemini': 'gemini-1.5-flash',
        'xai': 'grok-3'
      };
      currentModel = defaultModels[defaultProvider] || null;
    }
    
    if (aiService) {
      try {
        const models = await aiService.listModels();
        if (models.length > 0) {
          providerStatus = 'available';
          if (!currentModel && models.length > 0) {
            currentModel = models[0].id;
          }
        } else {
          providerStatus = 'no_models';
        }
      } catch (e) {
        providerStatus = 'error';
        logger.error('[AI API] Error getting models:', e);
      }
    } else {
      // If AI service not initialized, still show default provider
      providerStatus = 'not_initialized';
    }

    // Build providers list with their enabled status and available models
    const ollamaModels: string[] = [];
    if (aiService) {
      try {
        const models = await aiService.listModels();
        models.forEach(m => ollamaModels.push(m.id));
      } catch (e) {
        // Default models if Ollama not available
      }
    }
    if (ollamaModels.length === 0) {
      ollamaModels.push('llama3.2', 'deepseek-r1:1.5b');
    }
    
    // Parse API keys to check which providers are enabled
    let rawApiKeys: Record<string, string> = {};
    if (config?.api_keys) {
      try {
        rawApiKeys = JSON.parse(config.api_keys);
      } catch (e) { /* ignore */ }
    }
    
    const providers: Record<string, { enabled: boolean; models: string[] }> = {
      ollama: { 
        enabled: true, // Ollama is always available (local)
        models: ollamaModels 
      },
      openai: { 
        enabled: !!rawApiKeys.openai, 
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] 
      },
      claude: { 
        enabled: !!rawApiKeys.claude, 
        models: ['claude-sonnet-4-5-20250929', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'] 
      },
      gemini: { 
        enabled: !!rawApiKeys.gemini, 
        models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'] 
      },
      xai: { 
        enabled: !!rawApiKeys.xai, 
        models: ['grok-3', 'grok-2'] 
      }
    };

    res.json({
      success: true,
      result: {
        wallet_address: walletAddress,
        default_provider: defaultProvider,
        default_model: currentModel || (defaultProvider === 'ollama' ? 'deepseek-r1:1.5b' : null),
        api_keys: apiKeys, // Masked
        ollama_base_url: config?.ollama_base_url || 'http://localhost:11434',
        provider_status: providerStatus,
        updated_at: config?.updated_at || null
      },
      providers // Include providers for agent editor
    });
  } catch (error: any) {
    logger.error('[AI API] Error getting config:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get AI config' });
  }
});

/**
 * GET /api/ai/models
 * Get available models for current provider
 */
router.get('/models', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const aiService = req.app.locals.aiService as AIChatService | undefined;
    
    if (!aiService) {
      return res.status(500).json({ success: false, error: 'AI service not available' });
    }

    const models = await aiService.listModels();
    
    res.json({
      success: true,
      result: models.map(m => ({
        id: m.id,
        name: m.name || m.id,
        provider: 'ollama', // All models from Ollama provider
        capabilities: {
          vision: m.id.toLowerCase().includes('llava') || m.id.toLowerCase().includes('vision'),
          function_calling: true, // All our models support function calling
          streaming: true
        }
      }))
    });
  } catch (error: any) {
    logger.error('[AI API] Error getting models:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get models' });
  }
});

/**
 * GET /api/ai/status
 * Get AI service status and capabilities
 */
router.get('/status', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user!.wallet_address;
    const db = req.app.locals.db;
    const aiService = req.app.locals.aiService as AIChatService | undefined;
    
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }

    const config = db.getAIConfig(walletAddress);
    const provider = config?.default_provider || 'ollama';
    
    let status = 'unknown';
    let models: any[] = [];
    let capabilities = {
      vision: false,
      function_calling: true,
      streaming: true
    };

    if (aiService) {
      try {
        models = await aiService.listModels();
        if (models.length > 0) {
          status = 'available';
          // Check if any model supports vision
          capabilities.vision = models.some(m => 
            m.id.toLowerCase().includes('llava') || 
            m.id.toLowerCase().includes('vision')
          );
        } else {
          status = 'no_models';
        }
      } catch (e) {
        status = 'error';
        logger.error('[AI API] Error getting status:', e);
      }
    } else {
      status = 'not_initialized';
    }

    res.json({
      success: true,
      result: {
        provider,
        status,
        models: models.map(m => ({
          id: m.id,
          name: m.name || m.id,
          provider: m.provider || 'ollama'
        })),
        capabilities,
        ollama_available: provider === 'ollama' && status === 'available'
      }
    });
  } catch (error: any) {
    logger.error('[AI API] Error getting status:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get AI status' });
  }
});

/**
 * POST /api/ai/config
 * Update AI configuration
 */
router.post('/config', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user!.wallet_address;
    const db = req.app.locals.db;
    
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }

    const { provider, model, ollama_base_url } = req.body;
    
    // Validate provider
    const validProviders = ['ollama', 'openai', 'claude', 'gemini', 'xai'];
    if (provider && !validProviders.includes(provider)) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` 
      });
    }

    // Get existing config
    const existing = db.getAIConfig(walletAddress);
    const newProvider = provider || existing?.default_provider || 'ollama';
    
    // If provider is changing, set appropriate default model for that provider
    let cleanModel = model || existing?.default_model || null;
    
    // If provider changed and no explicit model provided, set default for new provider
    if (provider && provider !== existing?.default_provider && !model) {
      const defaultModels: Record<string, string> = {
        'ollama': 'deepseek-r1:1.5b',
        'claude': 'claude-sonnet-4-5-20250929', // Current Claude Sonnet 4.5 model
        'openai': 'gpt-4o',
        'gemini': 'gemini-1.5-flash',
        'xai': 'grok-3'
      };
      cleanModel = defaultModels[provider] || null;
      logger.info(`[AI API] Provider changed to ${provider}, setting default model: ${cleanModel}`);
    }
    
    // Clean model name - remove provider prefix if present (e.g., "ollama:llava:7b" -> "llava:7b")
    if (cleanModel && cleanModel.includes(':')) {
      const parts = cleanModel.split(':');
      // If first part is a provider name, remove it
      if (parts[0] === 'ollama' || parts[0] === 'claude' || parts[0] === 'openai' || parts[0] === 'gemini' || parts[0] === 'xai') {
        cleanModel = parts.slice(1).join(':'); // Keep rest as model name
        logger.info('[AI API] Cleaned model name:', model, '->', cleanModel);
      }
    }
    
    // Update config
    db.setAIConfig(
      walletAddress,
      newProvider,
      cleanModel,
      existing?.api_keys ? JSON.parse(existing.api_keys) : null,
      ollama_base_url || existing?.ollama_base_url || 'http://localhost:11434'
    );

    logger.info(`[AI API] Updated AI config for wallet: ${walletAddress.substring(0, 10)}...`);

    res.json({
      success: true,
      result: {
        message: 'AI configuration updated successfully'
      }
    });
  } catch (error: any) {
    logger.error('[AI API] Error updating config:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update AI config' });
  }
});

/**
 * POST /api/ai/test-key
 * Test API key for a provider
 */
router.post('/test-key', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { provider, apiKey } = req.body;
    
    if (!provider || !apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Provider and API key are required' 
      });
    }

    // For now, we'll do basic validation
    // In the future, we can make actual API calls to test the key
    
    let valid = false;
    let error: string | null = null;
    
    // Basic format validation
    if (provider === 'openai') {
      valid = apiKey.startsWith('sk-') && apiKey.length > 20;
      if (!valid) {
        error = 'OpenAI API keys should start with "sk-" and be at least 20 characters';
      }
    } else if (provider === 'claude') {
      valid = apiKey.startsWith('sk-ant-') && apiKey.length > 20;
      if (!valid) {
        error = 'Claude API keys should start with "sk-ant-" and be at least 20 characters';
      }
    } else if (provider === 'gemini') {
      valid = apiKey.length > 20;
      if (!valid) {
        error = 'Gemini API keys should be at least 20 characters';
      }
    } else if (provider === 'xai') {
      valid = apiKey.startsWith('xai-') && apiKey.length > 20;
      if (!valid) {
        error = 'xAI API keys should start with "xai-" and be at least 20 characters';
      }
    } else {
      return res.status(400).json({ 
        success: false, 
        error: `Provider ${provider} is not supported for API key testing` 
      });
    }

    // TODO: In the future, make actual API calls to validate keys
    // For now, we just validate the format

    res.json({
      success: true,
      result: {
        valid,
        error: error || null,
        message: valid ? 'API key format is valid' : error
      }
    });
  } catch (error: any) {
    logger.error('[AI API] Error testing API key:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to test API key' });
  }
});

/**
 * POST /api/ai/api-keys
 * Update API keys (add/update specific provider key)
 */
router.post('/api-keys', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user!.wallet_address;
    const db = req.app.locals.db;
    
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }

    const { provider, apiKey } = req.body;
    
    if (!provider || !apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Provider and API key are required' 
      });
    }

    const validProviders = ['openai', 'claude', 'gemini', 'xai'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` 
      });
    }

    // Ensure ai_config table exists (fallback if migration didn't run)
    try {
      const dbInstance = db.getDB();
      // Try a simple query to check if table exists
      dbInstance.prepare('SELECT 1 FROM ai_config LIMIT 1').get();
    } catch (error: any) {
      // Table doesn't exist, create it
      if (error.message && error.message.includes('no such table')) {
        logger.warn('[AI API] ai_config table not found, creating it now...');
        try {
          const dbInstance = db.getDB();
          dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS ai_config (
              wallet_address TEXT PRIMARY KEY,
              default_provider TEXT NOT NULL DEFAULT 'ollama',
              default_model TEXT,
              api_keys TEXT,
              ollama_base_url TEXT DEFAULT 'http://localhost:11434',
              updated_at INTEGER NOT NULL,
              FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
            )
          `);
          dbInstance.exec(`
            CREATE INDEX IF NOT EXISTS idx_ai_config_wallet 
            ON ai_config(wallet_address)
          `);
          logger.info('[AI API] ✅ ai_config table created successfully');
        } catch (createError: any) {
          logger.error('[AI API] ❌ Failed to create ai_config table:', createError);
          return res.status(500).json({ 
            success: false, 
            error: 'Database migration required. Please restart the server to run migrations.' 
          });
        }
      } else {
        throw error;
      }
    }

    // Update API keys
    db.updateAIAPIKeys(walletAddress, { [provider]: apiKey });

    logger.info(`[AI API] Updated API key for ${provider} for wallet: ${walletAddress.substring(0, 10)}...`);

    res.json({
      success: true,
      result: {
        message: `API key for ${provider} updated successfully`
      }
    });
  } catch (error: any) {
    logger.error('[AI API] Error updating API key:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update API key' });
  }
});

/**
 * DELETE /api/ai/api-keys/:provider
 * Delete API key for a specific provider
 */
router.delete('/api-keys/:provider', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user!.wallet_address;
    const db = req.app.locals.db;
    const provider = req.params.provider;
    
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }

    db.deleteAIAPIKey(walletAddress, provider);

    logger.info(`[AI API] Deleted API key for ${provider} for wallet: ${walletAddress.substring(0, 10)}...`);

    res.json({
      success: true,
      result: {
        message: `API key for ${provider} deleted successfully`
      }
    });
  } catch (error: any) {
    logger.error('[AI API] Error deleting API key:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete API key' });
  }
});

// ============================================================================
// AI CONVERSATIONS (Persistent Chat History)
// ============================================================================

/**
 * GET /api/ai/conversations
 * Get all conversations for the authenticated user
 */
router.get('/conversations', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user!.wallet_address;
    const db = req.app.locals.db;
    
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }

    const conversations = db.getConversations(walletAddress);
    
    // Parse messages_json for each conversation
    const parsed = conversations.map((conv: any) => ({
      id: conv.id,
      title: conv.title,
      messages: JSON.parse(conv.messages_json || '[]'),
      created_at: conv.created_at,
      updated_at: conv.updated_at
    }));

    res.json({
      success: true,
      result: parsed
    });
  } catch (error: any) {
    logger.error('[AI API] Error getting conversations:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get conversations' });
  }
});

/**
 * GET /api/ai/conversations/:id
 * Get a single conversation by ID
 */
router.get('/conversations/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user!.wallet_address;
    const db = req.app.locals.db;
    const conversationId = req.params.id;
    
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }

    const conversation = db.getConversation(walletAddress, conversationId);
    
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    res.json({
      success: true,
      result: {
        id: conversation.id,
        title: conversation.title,
        messages: JSON.parse(conversation.messages_json || '[]'),
        created_at: conversation.created_at,
        updated_at: conversation.updated_at
      }
    });
  } catch (error: any) {
    logger.error('[AI API] Error getting conversation:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get conversation' });
  }
});

/**
 * POST /api/ai/conversations
 * Create or update a conversation (upsert)
 */
router.post('/conversations', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user!.wallet_address;
    const db = req.app.locals.db;
    const { id, title, messages } = req.body;
    
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }

    if (!id) {
      return res.status(400).json({ success: false, error: 'Conversation ID is required' });
    }

    // Check if conversation exists - if so, update it instead of creating
    const existing = db.getConversation(walletAddress, id);
    
    let conversation;
    if (existing) {
      // Update existing conversation
      db.updateConversation(walletAddress, id, { title, messages });
      conversation = db.getConversation(walletAddress, id);
      logger.info(`[AI API] Updated conversation ${id} for wallet: ${walletAddress.substring(0, 10)}...`);
    } else {
      // Create new conversation
      conversation = db.createConversation(
        walletAddress,
        id,
        title || 'New Conversation',
        messages || []
      );
      logger.info(`[AI API] Created conversation ${id} for wallet: ${walletAddress.substring(0, 10)}...`);
    }

    res.json({
      success: true,
      result: {
        id: conversation!.id,
        title: conversation!.title,
        messages: JSON.parse(conversation!.messages_json || '[]'),
        created_at: conversation!.created_at,
        updated_at: conversation!.updated_at
      }
    });
  } catch (error: any) {
    logger.error('[AI API] Error creating/updating conversation:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to create/update conversation' });
  }
});

/**
 * POST /api/ai/conversations/:id
 * Update a conversation via POST (for sendBeacon compatibility)
 */
router.post('/conversations/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user!.wallet_address;
    const db = req.app.locals.db;
    const conversationId = req.params.id;
    const { title, messages } = req.body;
    
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }

    // Check if exists - create or update accordingly
    const existing = db.getConversation(walletAddress, conversationId);
    
    if (existing) {
      const updates: { title?: string; messages?: any[] } = {};
      if (title !== undefined) updates.title = title;
      if (messages !== undefined) updates.messages = messages;
      db.updateConversation(walletAddress, conversationId, updates);
    } else {
      db.createConversation(walletAddress, conversationId, title || 'New Conversation', messages || []);
    }
    
    const updated = db.getConversation(walletAddress, conversationId);
    
    logger.info(`[AI API] Upserted conversation ${conversationId} for wallet: ${walletAddress.substring(0, 10)}...`);

    res.json({
      success: true,
      result: updated ? {
        id: updated.id,
        title: updated.title,
        messages: JSON.parse(updated.messages_json || '[]'),
        created_at: updated.created_at,
        updated_at: updated.updated_at
      } : null
    });
  } catch (error: any) {
    logger.error('[AI API] Error upserting conversation:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to upsert conversation' });
  }
});

/**
 * PUT /api/ai/conversations/:id
 * Update a conversation (title and/or messages)
 */
router.put('/conversations/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user!.wallet_address;
    const db = req.app.locals.db;
    const conversationId = req.params.id;
    const { title, messages } = req.body;
    
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }

    const updates: { title?: string; messages?: any[] } = {};
    if (title !== undefined) updates.title = title;
    if (messages !== undefined) updates.messages = messages;

    const success = db.updateConversation(walletAddress, conversationId, updates);
    
    if (!success) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Fetch updated conversation
    const updated = db.getConversation(walletAddress, conversationId);

    res.json({
      success: true,
      result: updated ? {
        id: updated.id,
        title: updated.title,
        messages: JSON.parse(updated.messages_json || '[]'),
        created_at: updated.created_at,
        updated_at: updated.updated_at
      } : null
    });
  } catch (error: any) {
    logger.error('[AI API] Error updating conversation:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update conversation' });
  }
});

/**
 * DELETE /api/ai/conversations/:id
 * Delete a conversation
 */
router.delete('/conversations/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user!.wallet_address;
    const db = req.app.locals.db;
    const conversationId = req.params.id;
    
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }

    const success = db.deleteConversation(walletAddress, conversationId);
    
    if (!success) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    logger.info(`[AI API] Deleted conversation ${conversationId} for wallet: ${walletAddress.substring(0, 10)}...`);

    res.json({
      success: true,
      result: { message: 'Conversation deleted successfully' }
    });
  } catch (error: any) {
    logger.error('[AI API] Error deleting conversation:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete conversation' });
  }
});

/**
 * DELETE /api/ai/conversations
 * Delete all conversations for the authenticated user
 */
router.delete('/conversations', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user!.wallet_address;
    const db = req.app.locals.db;
    
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }

    const count = db.deleteAllConversations(walletAddress);

    logger.info(`[AI API] Deleted ${count} conversations for wallet: ${walletAddress.substring(0, 10)}...`);

    res.json({
      success: true,
      result: { message: `Deleted ${count} conversation(s)`, count }
    });
  } catch (error: any) {
    logger.error('[AI API] Error deleting all conversations:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete conversations' });
  }
});

/**
 * GET /api/ai/ollama-status
 * Check if Ollama is installed and running, and what models are available
 */
router.get('/ollama-status', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    let installed = false;
    let running = false;
    let models: string[] = [];
    let version = '';
    
    // Check if Ollama is installed
    try {
      const { stdout } = await execAsync('which ollama || where ollama 2>/dev/null');
      installed = stdout.trim().length > 0;
    } catch {
      // Not installed
      installed = false;
    }
    
    if (installed) {
      // Check version
      try {
        const { stdout } = await execAsync('ollama --version');
        version = stdout.trim();
      } catch {
        version = 'unknown';
      }
      
      // Check if running and get models
      try {
        const { stdout } = await execAsync('ollama list 2>/dev/null');
        running = true;
        // Parse model list (format: NAME ID SIZE MODIFIED)
        const lines = stdout.trim().split('\n').slice(1); // Skip header
        models = lines.map(line => line.split(/\s+/)[0]).filter(Boolean);
      } catch {
        running = false;
      }
    }
    
    res.json({
      success: true,
      result: {
        installed,
        running,
        version,
        models,
        hasDeepseek: models.some(m => m.includes('deepseek'))
      }
    });
  } catch (error: any) {
    logger.error('[AI API] Error checking Ollama status:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to check Ollama status' });
  }
});

/**
 * POST /api/ai/install-ollama
 * Install Ollama and optionally pull a model
 * This runs the installation in the background and returns immediately
 */
router.post('/install-ollama', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { exec, spawn } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const { action, model } = req.body;
    // action: 'install-ollama' | 'pull-model' | 'install-all'
    // model: optional model name (default: deepseek-r1:1.5b)
    
    const targetModel = model || 'deepseek-r1:1.5b';
    
    // Check current status
    let ollamaInstalled = false;
    try {
      const { stdout } = await execAsync('which ollama || where ollama 2>/dev/null');
      ollamaInstalled = stdout.trim().length > 0;
    } catch {
      ollamaInstalled = false;
    }
    
    if (action === 'install-ollama' || (action === 'install-all' && !ollamaInstalled)) {
      if (ollamaInstalled) {
        return res.json({
          success: true,
          result: { message: 'Ollama is already installed', alreadyInstalled: true }
        });
      }
      
      // Install Ollama - this will run in background
      logger.info('[AI API] Starting Ollama installation...');
      
      // Run installation script
      const installProcess = spawn('sh', ['-c', 'curl -fsSL https://ollama.com/install.sh | sh'], {
        detached: true,
        stdio: 'ignore'
      });
      installProcess.unref();
      
      return res.json({
        success: true,
        result: { 
          message: 'Ollama installation started. This may take a few minutes. Please refresh the page to check status.',
          installing: true
        }
      });
    }
    
    if (action === 'pull-model' || action === 'install-all') {
      if (!ollamaInstalled) {
        return res.status(400).json({
          success: false,
          error: 'Ollama must be installed first'
        });
      }
      
      // Check if model already exists
      try {
        const { stdout } = await execAsync('ollama list 2>/dev/null');
        if (stdout.includes(targetModel.split(':')[0])) {
          return res.json({
            success: true,
            result: { message: `Model ${targetModel} is already installed`, alreadyInstalled: true }
          });
        }
      } catch {
        // Ollama might not be running, try to start it
        const startProcess = spawn('ollama', ['serve'], {
          detached: true,
          stdio: 'ignore'
        });
        startProcess.unref();
        
        // Wait a moment for Ollama to start
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Pull the model in background
      logger.info(`[AI API] Starting model pull: ${targetModel}...`);
      
      const pullProcess = spawn('ollama', ['pull', targetModel], {
        detached: true,
        stdio: 'ignore'
      });
      pullProcess.unref();
      
      return res.json({
        success: true,
        result: { 
          message: `Downloading ${targetModel}. This may take several minutes depending on your connection. Please refresh to check status.`,
          pulling: true,
          model: targetModel
        }
      });
    }
    
    return res.status(400).json({
      success: false,
      error: 'Invalid action. Use: install-ollama, pull-model, or install-all'
    });
    
  } catch (error: any) {
    logger.error('[AI API] Error in Ollama installation:', error);
    res.status(500).json({ success: false, error: error.message || 'Installation failed' });
  }
});

export default router;

