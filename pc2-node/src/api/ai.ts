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
      }
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

export default router;

