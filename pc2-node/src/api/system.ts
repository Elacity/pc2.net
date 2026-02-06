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
import { detectPlatform, getJetsonDiagnostics } from '../utils/platform.js';
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
    const platformInfo = detectPlatform();
    
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
        // Hardware/GPU detection for AI optimization awareness
        hardware: {
          isJetson: platformInfo.isJetson,
          jetsonModel: platformInfo.jetsonModel,
          cudaAvailable: platformInfo.cudaAvailable,
          gpuInfo: platformInfo.gpuInfo,
          totalMemoryMB: platformInfo.totalMemoryMB,
          estimatedAvailableVRAM: platformInfo.estimatedAvailableVRAM,
          isConstrainedDevice: platformInfo.isConstrainedDevice,
        },
        // Jetson-specific diagnostics (null on non-Jetson)
        jetsonDiagnostics: platformInfo.isJetson ? getJetsonDiagnostics() : undefined,
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

/**
 * GET /api/system/jetson-diagnostics
 * Get Jetson-specific diagnostics: power mode, clocks, swap, GUI, and recommendations.
 * Returns null fields on non-Jetson devices.
 */
router.get('/jetson-diagnostics', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const platformInfo = detectPlatform();

    if (!platformInfo.isJetson) {
      return res.json({
        success: true,
        result: {
          isJetson: false,
          message: 'This device is not a Jetson. No Jetson-specific diagnostics available.',
        },
      });
    }

    const diagnostics = getJetsonDiagnostics();

    res.json({
      success: true,
      result: {
        isJetson: true,
        jetsonModel: platformInfo.jetsonModel,
        totalMemoryMB: platformInfo.totalMemoryMB,
        cudaAvailable: platformInfo.cudaAvailable,
        gpuInfo: platformInfo.gpuInfo,
        ...diagnostics,
      },
    });
  } catch (error) {
    logger.error('[System] Jetson diagnostics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Jetson diagnostics',
    });
  }
});

/**
 * POST /api/system/jetson-optimize
 * Apply Jetson performance optimizations: MAXN power mode and max clocks.
 * Requires owner authentication. Only runs on Jetson devices.
 * These commands require sudo -- if PC2 runs without sudo, they will fail gracefully.
 */
router.post('/jetson-optimize', authenticate, requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const platformInfo = detectPlatform();

    if (!platformInfo.isJetson) {
      return res.status(400).json({
        success: false,
        error: 'This device is not a Jetson. Optimization commands are only available on Jetson hardware.',
      });
    }

    const results: Array<{ command: string; success: boolean; output?: string; error?: string }> = [];

    // Set MAXN power mode (mode 0 = maximum performance)
    try {
      const output = execSync('sudo nvpmodel -m 0 2>&1', {
        encoding: 'utf-8',
        timeout: 10000,
      });
      results.push({ command: 'nvpmodel -m 0', success: true, output: output.trim() });
      logger.info('[System] Jetson MAXN power mode enabled');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      results.push({ command: 'nvpmodel -m 0', success: false, error: msg });
      logger.warn('[System] Failed to set Jetson power mode:', msg);
    }

    // Lock clocks to maximum frequency
    try {
      const output = execSync('sudo jetson_clocks 2>&1', {
        encoding: 'utf-8',
        timeout: 10000,
      });
      results.push({ command: 'jetson_clocks', success: true, output: output.trim() });
      logger.info('[System] Jetson clocks locked to maximum');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      results.push({ command: 'jetson_clocks', success: false, error: msg });
      logger.warn('[System] Failed to set Jetson clocks:', msg);
    }

    const allSuccess = results.every(r => r.success);

    res.json({
      success: true,
      result: {
        applied: allSuccess,
        message: allSuccess
          ? 'Jetson performance optimized: MAXN power mode enabled and clocks locked to maximum.'
          : 'Some optimizations failed. This usually means PC2 is not running with sudo. You can run these commands manually.',
        results,
        manualCommands: !allSuccess ? [
          'sudo nvpmodel -m 0     # Set MAXN power mode',
          'sudo jetson_clocks     # Lock clocks to maximum frequency',
        ] : undefined,
      },
    });
  } catch (error) {
    logger.error('[System] Jetson optimize error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to apply Jetson optimizations',
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
