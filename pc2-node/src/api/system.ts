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
 * Tries multiple methods to find PM2, including alternative paths
 */
function detectProcessManager(): 'systemctl' | 'pm2' | 'none' {
  // Check systemctl first (VPS deployments)
  const systemctlServices = ['pc2-node', 'pc2'];
  for (const service of systemctlServices) {
    try {
      execSync(`systemctl is-active ${service}`, { stdio: 'ignore' });
      return 'systemctl';
    } catch {
      // Try next
    }
  }
  
  // Check PM2 with multiple paths (local installations via start-local.sh)
  const pm2Commands = [
    'pm2',
    `${process.env.HOME}/.nvm/versions/node/*/bin/pm2`,
    '/usr/local/bin/pm2',
    '/usr/bin/pm2',
  ];
  
  for (const pm2Cmd of pm2Commands) {
    try {
      const result = execSync(`${pm2Cmd} pid pc2 2>/dev/null`, { 
        encoding: 'utf8',
        shell: '/bin/bash',  // Use bash for glob expansion
        timeout: 5000 
      });
      if (result && result.trim() && result.trim() !== '0') {
        return 'pm2';
      }
    } catch {
      // Try next path
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
      
      // Try multiple restart methods in order (same approach as UpdateService)
      const restartCommands = [
        { cmd: 'systemctl restart pc2-node', name: 'systemctl pc2-node' },
        { cmd: 'systemctl restart pc2', name: 'systemctl pc2' },
        { cmd: 'pm2 restart pc2', name: 'pm2 pc2' },
        { cmd: 'pm2 restart all', name: 'pm2 all' },
        { cmd: `${process.env.HOME}/.nvm/versions/node/*/bin/pm2 restart pc2`, name: 'pm2 (nvm path)' },
        { cmd: '/usr/local/bin/pm2 restart pc2', name: 'pm2 (/usr/local)' },
      ];

      for (const { cmd, name } of restartCommands) {
        try {
          logger.info(`[System] Trying ${name}...`);
          execSync(cmd, { timeout: 30000, shell: '/bin/bash', stdio: 'ignore' });
          logger.info(`[System] Restart successful via ${name}`);
          return;
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn(`[System] ${name} failed: ${errorMessage}`);
        }
      }
      
      // All restart methods failed - exit and let external process manager restart
      logger.info('[System] All restart methods failed, exiting for external restart...');
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
