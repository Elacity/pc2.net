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
 * Detect which process manager is available
 */
function detectProcessManager(): 'systemctl' | 'pm2' | 'none' {
  try {
    // Check if we're running under systemd
    execSync('systemctl is-active pc2', { stdio: 'ignore' });
    return 'systemctl';
  } catch {
    try {
      // Check if pm2 is available and managing pc2
      const result = execSync('pm2 pid pc2 2>/dev/null', { encoding: 'utf8' });
      if (result && result.trim() && result.trim() !== '0') {
        return 'pm2';
      }
    } catch {
      // pm2 not available or not managing pc2
    }
  }
  return 'none';
}

/**
 * GET /api/system/restart-mode
 * Check how restart would work in the current environment
 */
router.get('/restart-mode', authenticate, requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  const processManager = detectProcessManager();
  
  // Get the PC2 directory path
  const pc2Dir = process.cwd();
  
  res.json({
    success: true,
    result: {
      processManager,
      autoRestart: processManager !== 'none',
      pc2Directory: pc2Dir,
      restartCommand: `cd "${pc2Dir}" && npm start`,
      message: processManager === 'none' 
        ? 'Running in local mode. Server will exit and you will need to restart manually.'
        : `Server will restart automatically via ${processManager}.`
    }
  });
});

/**
 * POST /api/system/restart
 * Triggers a graceful server restart
 * Requires owner authentication
 */
router.post('/restart', authenticate, requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const processManager = detectProcessManager();
    logger.info('[System] Restart requested by owner:', req.user?.wallet_address, '- Process manager:', processManager);
    
    // Send success response before restarting
    res.json({
      success: true,
      processManager,
      autoRestart: processManager !== 'none',
      message: processManager === 'none'
        ? 'Server shutting down. Please restart manually by running the start command again.'
        : 'Server restart initiated. Please wait a moment and refresh.',
    });
    
    // Schedule restart after response is sent
    setTimeout(() => {
      logger.info('[System] Initiating restart...');
      
      if (processManager === 'systemctl') {
        try {
          execSync('systemctl restart pc2', { stdio: 'ignore' });
          logger.info('[System] Restart via systemctl succeeded');
          return;
        } catch (e) {
          logger.warn('[System] systemctl restart failed, falling back');
        }
      }
      
      if (processManager === 'pm2') {
        try {
          execSync('pm2 restart pc2', { stdio: 'ignore' });
          logger.info('[System] Restart via pm2 succeeded');
          return;
        } catch (e) {
          logger.warn('[System] pm2 restart failed, falling back');
        }
      }
      
      // No process manager - just exit
      logger.info('[System] No process manager found, exiting...');
      process.exit(0);
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
