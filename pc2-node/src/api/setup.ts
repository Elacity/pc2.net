/**
 * Setup API Routes
 * 
 * First-run setup wizard endpoints for PC2 node configuration.
 * Handles username selection, identity generation, and initial setup.
 */

import { Router, Request, Response } from 'express';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import bcrypt from 'bcrypt';
import { logger } from '../utils/logger.js';

const router = Router();

// Data directory from environment or default
const DATA_DIR = process.env.PC2_DATA_DIR || './data';
const SETUP_COMPLETE_FILE = join(DATA_DIR, 'setup-complete');
const NODE_CONFIG_FILE = join(DATA_DIR, 'node-config.json');

// Node config interface
interface NodeConfig {
  antiSnipePasswordHash?: string;
  ownerWallet?: string | null;
  createdAt?: string;
}

// Helper to read node config
function getNodeConfig(): NodeConfig {
  try {
    if (existsSync(NODE_CONFIG_FILE)) {
      return JSON.parse(readFileSync(NODE_CONFIG_FILE, 'utf-8'));
    }
  } catch (e) {
    logger.error('[Setup] Failed to read node config:', e);
  }
  return {};
}

// Helper to save node config
function saveNodeConfig(config: NodeConfig): void {
  const configDir = dirname(NODE_CONFIG_FILE);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  writeFileSync(NODE_CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Export for use by other modules
export { getNodeConfig, saveNodeConfig, NODE_CONFIG_FILE };

/**
 * Check if setup is needed
 * GET /api/setup/status
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    const bosonService = req.app.locals.bosonService;
    
    const setupComplete = existsSync(SETUP_COMPLETE_FILE);
    const hasUsername = bosonService?.getUsernameService()?.hasUsername() || false;
    const hasIdentity = bosonService?.getIdentityService()?.getNodeId() !== null;
    const hasMnemonic = bosonService?.getFirstRunMnemonic() !== null;
    const hasMnemonicBackup = bosonService?.hasMnemonicBackup() || false;
    
    // Simplified flow: welcome -> username -> complete (no mnemonic step)
    let step: 'welcome' | 'username' | 'complete' = 'complete';
    
    if (!setupComplete) {
      if (!hasIdentity) {
        step = 'welcome';
      } else if (!hasUsername) {
        step = 'username';
      } else {
        // Has identity + username - setup is complete
        step = 'complete';
      }
    }
    
    res.json({
      needsSetup: !setupComplete && !hasUsername,
      setupComplete,
      hasUsername,
      hasIdentity,
      hasMnemonic,
      hasMnemonicBackup,
      step,
    });
  } catch (error) {
    logger.error('[Setup] Status check error:', error);
    res.status(500).json({ error: 'Failed to check setup status' });
  }
});

/**
 * Validate username format
 * POST /api/setup/validate-username
 */
router.post('/validate-username', (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    
    if (!username || typeof username !== 'string') {
      return res.json({ valid: false, error: 'Username is required' });
    }
    
    const bosonService = req.app.locals.bosonService;
    const usernameService = bosonService?.getUsernameService();
    
    if (!usernameService) {
      return res.status(503).json({ error: 'Username service not available' });
    }
    
    const validation = usernameService.validateUsername(username);
    res.json(validation);
  } catch (error) {
    logger.error('[Setup] Validate username error:', error);
    res.status(500).json({ error: 'Failed to validate username' });
  }
});

/**
 * Check username availability
 * POST /api/setup/check-username
 */
router.post('/check-username', async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    
    if (!username || typeof username !== 'string') {
      return res.json({ available: false, error: 'Username is required' });
    }
    
    const bosonService = req.app.locals.bosonService;
    const usernameService = bosonService?.getUsernameService();
    
    if (!usernameService) {
      return res.status(503).json({ error: 'Username service not available' });
    }
    
    // First validate format
    const validation = usernameService.validateUsername(username);
    if (!validation.valid) {
      return res.json({ available: false, error: validation.error });
    }
    
    // Then check availability
    const available = await usernameService.isAvailable(username);
    
    res.json({ 
      available,
      username: username.toLowerCase(),
      publicUrl: available ? usernameService.getPublicUrl() : null,
    });
  } catch (error) {
    logger.error('[Setup] Check username error:', error);
    res.status(500).json({ error: 'Failed to check username availability' });
  }
});

/**
 * Register username and complete setup
 * POST /api/setup/complete
 * 
 * Accepts username and anti-snipe password.
 * Password is hashed and stored; will be deleted after first wallet login.
 */
router.post('/complete', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ success: false, error: 'Username is required' });
    }
    
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }
    
    const bosonService = req.app.locals.bosonService;
    
    if (!bosonService) {
      return res.status(503).json({ success: false, error: 'Boson service not available' });
    }
    
    // Register the username
    const result = await bosonService.registerUsername(username);
    
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    
    // Get node info
    const nodeId = bosonService.getNodeId();
    const did = bosonService.getDID();
    const publicUrl = result.publicUrl;
    
    // Hash the anti-snipe password
    const passwordHash = await bcrypt.hash(password, 12);
    
    // Save node config with password hash (owner not yet set)
    saveNodeConfig({
      antiSnipePasswordHash: passwordHash,
      ownerWallet: null,
      createdAt: new Date().toISOString(),
    });
    
    logger.info(`[Setup] Anti-snipe password set for node`);
    
    // Ensure data directory exists
    const setupDir = dirname(SETUP_COMPLETE_FILE);
    if (!existsSync(setupDir)) {
      mkdirSync(setupDir, { recursive: true });
    }
    
    // Mark setup as complete
    writeFileSync(SETUP_COMPLETE_FILE, JSON.stringify({
      completedAt: new Date().toISOString(),
      username,
      nodeId,
    }));
    
    // NOTE: Do NOT clear mnemonic here - it will be encrypted on first login
    
    logger.info(`[Setup] Setup completed for username: ${username}`);
    
    res.json({
      success: true,
      nodeId,
      did,
      publicUrl,
      setupComplete: true,
    });
  } catch (error) {
    logger.error('[Setup] Complete error:', error);
    res.status(500).json({ success: false, error: 'Failed to complete setup' });
  }
});

/**
 * Get the message to sign for mnemonic encryption
 * POST /api/setup/mnemonic-sign-message
 */
router.post('/mnemonic-sign-message', (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress || typeof walletAddress !== 'string') {
      return res.status(400).json({ error: 'Wallet address is required' });
    }
    
    const bosonService = req.app.locals.bosonService;
    
    if (!bosonService) {
      return res.status(503).json({ error: 'Boson service not available' });
    }
    
    const message = bosonService.getMnemonicSignMessage(walletAddress);
    
    res.json({ message });
  } catch (error) {
    logger.error('[Setup] Get sign message error:', error);
    res.status(500).json({ error: 'Failed to get sign message' });
  }
});

/**
 * Acknowledge mnemonic backup and encrypt it with wallet signature
 * POST /api/setup/acknowledge-mnemonic
 * 
 * If signature is provided, the mnemonic will be encrypted and stored.
 * This allows the user to view it later by signing the same message.
 */
router.post('/acknowledge-mnemonic', (req: Request, res: Response) => {
  try {
    const { signature, walletAddress, skipEncryption } = req.body;
    
    const bosonService = req.app.locals.bosonService;
    
    if (!bosonService) {
      return res.status(503).json({ success: false, error: 'Boson service not available' });
    }
    
    // Get info before clearing
    const nodeId = bosonService.getNodeId();
    const usernameService = bosonService.getUsernameService();
    const username = usernameService?.getUsername();
    
    let mnemonicEncrypted = false;
    
    // If signature provided, encrypt and store the mnemonic
    if (signature && walletAddress && !skipEncryption) {
      mnemonicEncrypted = bosonService.encryptAndStoreMnemonic(signature, walletAddress);
      if (mnemonicEncrypted) {
        logger.info('[Setup] Mnemonic encrypted and stored for later access');
      } else {
        logger.warn('[Setup] Failed to encrypt mnemonic, proceeding without backup');
      }
    } else if (!skipEncryption) {
      logger.info('[Setup] No signature provided, mnemonic will not be recoverable');
    }
    
    // Ensure data directory exists
    const setupDir = dirname(SETUP_COMPLETE_FILE);
    if (!existsSync(setupDir)) {
      mkdirSync(setupDir, { recursive: true });
    }
    
    // Mark setup as complete
    writeFileSync(SETUP_COMPLETE_FILE, JSON.stringify({
      completedAt: new Date().toISOString(),
      username,
      nodeId,
      mnemonicEncrypted,
    }));
    
    // Clear mnemonic from memory (already cleared if encrypted successfully)
    bosonService.clearMnemonic();
    
    logger.info('[Setup] Mnemonic acknowledged, setup complete');
    
    res.json({ 
      success: true, 
      setupComplete: true,
      mnemonicEncrypted,
    });
  } catch (error) {
    logger.error('[Setup] Acknowledge mnemonic error:', error);
    res.status(500).json({ success: false, error: 'Failed to acknowledge mnemonic' });
  }
});

/**
 * Get mnemonic for copying during setup
 * GET /api/setup/mnemonic
 * 
 * This endpoint returns the mnemonic during the setup phase so the user
 * can copy and save it locally. Only available during first-run setup.
 */
router.get('/mnemonic', (req: Request, res: Response) => {
  try {
    const bosonService = req.app.locals.bosonService;
    
    if (!bosonService) {
      return res.status(503).json({ error: 'Boson service not available' });
    }
    
    const mnemonic = bosonService.getFirstRunMnemonic();
    
    if (!mnemonic) {
      return res.status(404).json({ 
        error: 'Recovery phrase not available',
        message: 'The recovery phrase is only available during initial setup. If the node was restarted, it can no longer be retrieved.',
      });
    }
    
    res.json({ mnemonic });
  } catch (error) {
    logger.error('[Setup] Get mnemonic error:', error);
    res.status(500).json({ error: 'Failed to get recovery phrase' });
  }
});

/**
 * Get current setup info (for resuming setup)
 * GET /api/setup/info
 */
router.get('/info', (req: Request, res: Response) => {
  try {
    const bosonService = req.app.locals.bosonService;
    
    if (!bosonService) {
      return res.json({
        ready: false,
        error: 'Boson service not available',
      });
    }
    
    const nodeId = bosonService.getNodeId();
    const did = bosonService.getDID();
    const usernameService = bosonService.getUsernameService();
    const username = usernameService?.getUsername();
    const publicUrl = usernameService?.getPublicUrl();
    const mnemonic = bosonService.getFirstRunMnemonic();
    
    res.json({
      ready: true,
      nodeId,
      did,
      username,
      publicUrl,
      hasMnemonic: !!mnemonic,
      hasMnemonicBackup: bosonService?.hasMnemonicBackup() || false,
      setupComplete: existsSync(SETUP_COMPLETE_FILE),
    });
  } catch (error) {
    logger.error('[Setup] Get info error:', error);
    res.status(500).json({ error: 'Failed to get setup info' });
  }
});

export default router;
