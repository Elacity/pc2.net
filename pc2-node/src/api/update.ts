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

export default router;
