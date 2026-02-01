/**
 * System API Endpoints
 * 
 * System-level operations for PC2 node management
 * - Restart
 * - System info
 */
import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest, requireOwner } from './middleware.js';
import { logger } from '../utils/logger.js';
import { execSync } from 'child_process';

const router = Router();

/**
 * POST /api/system/restart
 * Triggers a graceful server restart
 * Requires owner authentication
 */
router.post('/restart', authenticate, requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    logger.info('[System] Restart requested by owner:', req.user?.wallet_address);
    
    // Send success response before restarting
    res.json({
      success: true,
      message: 'Server restart initiated. Please wait a moment and refresh.',
    });
    
    // Schedule restart after response is sent
    setTimeout(() => {
      logger.info('[System] Initiating restart...');
      
      try {
        // Try systemctl first (Linux with systemd)
        execSync('systemctl restart pc2', { stdio: 'ignore' });
        logger.info('[System] Restart via systemctl succeeded');
      } catch (systemctlError) {
        try {
          // Try pm2 as fallback
          execSync('pm2 restart pc2', { stdio: 'ignore' });
          logger.info('[System] Restart via pm2 succeeded');
        } catch (pm2Error) {
          // Final fallback: exit and let process manager restart
          logger.info('[System] No process manager found, exiting for restart...');
          process.exit(0);
        }
      }
    }, 500);
    
  } catch (error) {
    logger.error('[System] Restart error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate restart',
    });
  }
});

/**
 * GET /api/system/info
 * Get system information
 */
router.get('/info', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    
    res.json({
      success: true,
      result: {
        uptime: uptime,
        uptimeFormatted: formatUptime(uptime),
        memory: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
        },
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    });
  } catch (error) {
    logger.error('[System] Info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system info',
    });
  }
});

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0) parts.push(`${Math.floor(seconds)}s`);
  
  return parts.join(' ');
}

export default router;
