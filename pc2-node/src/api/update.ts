/**
 * Update API Routes
 * 
 * Endpoints for checking and managing PC2 node updates.
 */

import { Router, Request, Response } from 'express';
import { getUpdateService } from '../services/UpdateService.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * Get current version and update status
 * GET /api/update/status
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    const updateService = getUpdateService();
    const status = updateService.getStatus();
    
    res.json({
      success: true,
      ...status,
    });
  } catch (error) {
    logger.error('[Update API] Status error:', error);
    res.status(500).json({ success: false, error: 'Failed to get update status' });
  }
});

/**
 * Check for updates now
 * POST /api/update/check
 */
router.post('/check', async (req: Request, res: Response) => {
  try {
    const updateService = getUpdateService();
    const result = await updateService.checkForUpdates();
    
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('[Update API] Check error:', error);
    res.status(500).json({ success: false, error: 'Failed to check for updates' });
  }
});

/**
 * Get current version only (for lightweight checks)
 * GET /api/update/version
 */
router.get('/version', (req: Request, res: Response) => {
  try {
    const updateService = getUpdateService();
    
    res.json({
      version: updateService.getCurrentVersion(),
      name: 'PC2 Node',
    });
  } catch (error) {
    logger.error('[Update API] Version error:', error);
    res.status(500).json({ error: 'Failed to get version' });
  }
});

/**
 * Check GitHub releases for updates
 * POST /api/update/check-github
 */
router.post('/check-github', async (req: Request, res: Response) => {
  try {
    const updateService = getUpdateService();
    const result = await updateService.checkGitHubReleases();
    
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('[Update API] GitHub check error:', error);
    res.status(500).json({ success: false, error: 'Failed to check GitHub releases' });
  }
});

/**
 * Install update (owner only)
 * POST /api/update/install
 * 
 * This will:
 * 1. git pull origin main
 * 2. npm install
 * 3. npm run build
 * 4. Restart the server
 */
router.post('/install', async (req: Request, res: Response) => {
  try {
    const updateService = getUpdateService();
    
    // Check if already updating
    if (updateService.getIsUpdating()) {
      return res.status(409).json({ 
        success: false, 
        error: 'Update already in progress',
        progress: updateService.getUpdateProgress()
      });
    }
    
    // Start the update process
    logger.info('[Update API] Starting update installation...');
    
    // Send immediate response that update is starting
    res.json({
      success: true,
      message: 'Update started. Server will restart when complete.',
      status: 'updating'
    });
    
    // Perform update after response is sent
    setImmediate(async () => {
      try {
        await updateService.performUpdate();
      } catch (error) {
        logger.error('[Update API] Update installation failed:', error);
      }
    });
  } catch (error) {
    logger.error('[Update API] Install error:', error);
    res.status(500).json({ success: false, error: 'Failed to start update' });
  }
});

/**
 * Get update progress
 * GET /api/update/progress
 */
router.get('/progress', (req: Request, res: Response) => {
  try {
    const updateService = getUpdateService();
    
    res.json({
      isUpdating: updateService.getIsUpdating(),
      progress: updateService.getUpdateProgress(),
    });
  } catch (error) {
    logger.error('[Update API] Progress error:', error);
    res.status(500).json({ error: 'Failed to get update progress' });
  }
});

export default router;
