/**
 * Setup API Routes
 * 
 * First-run setup wizard endpoints for PC2 node configuration.
 * Handles username selection, identity generation, and initial setup.
 */

import { Router, Request, Response } from 'express';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { logger } from '../utils/logger.js';

const router = Router();

// Data directory from environment or default
const DATA_DIR = process.env.PC2_DATA_DIR || './data';
const SETUP_COMPLETE_FILE = join(DATA_DIR, 'setup-complete');

/**
 * Check if setup is needed
 * GET /api/setup/status
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    const bosonService = req.app.locals.bosonService;
    
    const setupComplete = existsSync(SETUP_COMPLETE_FILE);
    const hasUsername = bosonService?.getUsernameService()?.hasUsername() || false;
    const hasIdentity = bosonService?.getIdentity() !== null;
    
    // Determine which step is needed
    let step: 'welcome' | 'username' | 'mnemonic' | 'complete' = 'complete';
    
    if (!setupComplete) {
      if (!hasIdentity) {
        step = 'welcome';
      } else if (!hasUsername) {
        step = 'username';
      } else {
        step = 'mnemonic'; // Show mnemonic backup before completing
      }
    }
    
    res.json({
      needsSetup: !setupComplete || !hasUsername,
      setupComplete,
      hasUsername,
      hasIdentity,
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
 */
router.post('/complete', async (req: Request, res: Response) => {
  try {
    const { username, acknowledgedMnemonic } = req.body;
    
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ success: false, error: 'Username is required' });
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
    
    // Get mnemonic if this is first run (before clearing)
    const mnemonic = bosonService.getFirstRunMnemonic();
    
    // If user acknowledged mnemonic, mark setup complete
    if (acknowledgedMnemonic || !mnemonic) {
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
      
      // Clear mnemonic from memory
      bosonService.clearMnemonic();
      
      logger.info(`[Setup] Setup completed for username: ${username}`);
    }
    
    res.json({
      success: true,
      nodeId,
      did,
      publicUrl,
      mnemonic, // Only returned on first run, before acknowledgment
      setupComplete: acknowledgedMnemonic || !mnemonic,
    });
  } catch (error) {
    logger.error('[Setup] Complete error:', error);
    res.status(500).json({ success: false, error: 'Failed to complete setup' });
  }
});

/**
 * Acknowledge mnemonic backup
 * POST /api/setup/acknowledge-mnemonic
 */
router.post('/acknowledge-mnemonic', (req: Request, res: Response) => {
  try {
    const bosonService = req.app.locals.bosonService;
    
    if (!bosonService) {
      return res.status(503).json({ success: false, error: 'Boson service not available' });
    }
    
    // Get info before clearing
    const nodeId = bosonService.getNodeId();
    const usernameService = bosonService.getUsernameService();
    const username = usernameService?.getUsername();
    
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
    
    // Clear mnemonic from memory
    bosonService.clearMnemonic();
    
    logger.info('[Setup] Mnemonic acknowledged, setup complete');
    
    res.json({ success: true, setupComplete: true });
  } catch (error) {
    logger.error('[Setup] Acknowledge mnemonic error:', error);
    res.status(500).json({ success: false, error: 'Failed to acknowledge mnemonic' });
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
      setupComplete: existsSync(SETUP_COMPLETE_FILE),
    });
  } catch (error) {
    logger.error('[Setup] Get info error:', error);
    res.status(500).json({ error: 'Failed to get setup info' });
  }
});

export default router;
