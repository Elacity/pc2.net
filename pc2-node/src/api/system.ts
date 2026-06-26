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
import { detectPlatform, getJetsonDiagnostics, getHostPlatformSummary } from '../utils/platform.js';
import { spawnDetachedRespawn } from '../utils/respawner.js';
import { execFileSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import * as nodePath from 'path';
import * as os from 'os';

const router = Router();

/**
 * SEC-A6 (2026-04-22 audit): resolve all candidate `pm2` binary paths in JS
 * (no shell glob expansion). Replaces `${HOME}/.nvm/.../bin/pm2` glob that
 * required `shell: '/bin/bash'`. Candidate list:
 *   - bare `pm2` (PATH lookup, requires execFile)
 *   - every `pm2` under ~/.nvm/versions/node/*\/bin/
 *   - /usr/local/bin/pm2, /usr/bin/pm2
 */
function resolvePm2Candidates(): string[] {
  const candidates: string[] = ['pm2'];
  try {
    const nvmRoot = nodePath.join(os.homedir(), '.nvm', 'versions', 'node');
    if (existsSync(nvmRoot)) {
      for (const entry of readdirSync(nvmRoot)) {
        const candidate = nodePath.join(nvmRoot, entry, 'bin', 'pm2');
        if (existsSync(candidate)) candidates.push(candidate);
      }
    }
  } catch {
    // Best-effort enumeration; ignore filesystem errors
  }
  for (const fixed of ['/usr/local/bin/pm2', '/usr/bin/pm2']) {
    if (existsSync(fixed)) candidates.push(fixed);
  }
  return candidates;
}

/**
 * Detect which process manager is available
 * Tries multiple methods to find PM2, including alternative paths
 *
 * SEC-A6 (2026-04-22 audit): replaced execSync with shell:'/bin/bash' glob
 * with explicit argv via execFileSync. Same fallback chain, no shell.
 */
function detectProcessManager(): 'systemctl' | 'pm2' | 'launcher-self-respawn' | 'none' {
  // Check systemctl first (VPS deployments)
  const systemctlServices = ['pc2-node', 'pc2'];
  for (const service of systemctlServices) {
    try {
      execFileSync('systemctl', ['is-active', service], { stdio: 'ignore' });
      return 'systemctl';
    } catch {
      // Try next
    }
  }

  for (const pm2Bin of resolvePm2Candidates()) {
    try {
      const result = execFileSync(pm2Bin, ['pid', 'pc2'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (result && result.trim() && result.trim() !== '0') {
        return 'pm2';
      }
    } catch {
      // Try next path
    }
  }

  // v1.2.7.6: macOS users typically run PC2 under the ElastOS Launcher,
  // which doesn't auto-restart on PC2 exit. Rather than reporting 'none'
  // (which causes the UI to warn the user they'll need to manually
  // restart), report 'launcher-self-respawn' — the /api/system/restart
  // handler then spawns a detached respawner before exiting, so the
  // restart actually is automatic from the user's perspective.
  if (process.platform === 'darwin') {
    return 'launcher-self-respawn';
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
  
  let message: string;
  if (processManager === 'none') {
    message = 'Running in local mode. Server will exit and you will need to restart manually.';
  } else if (processManager === 'launcher-self-respawn') {
    message = 'Server will restart automatically (detached respawner).';
  } else {
    message = `Server will restart automatically via ${processManager}.`;
  }

  res.json({
    success: true,
    result: {
      processManager,
      autoRestart: processManager !== 'none',
      pc2Directory: pc2Dir,
      restartCommand: `cd "${pc2Dir}" && npm start`,
      message,
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

      // v1.2.7.6: macOS short-circuit — skip the systemctl/pm2 fallback
      // chain (none of which exist on a launcher install), spawn the
      // detached respawner, and exit cleanly. Same pattern as
      // UpdateService's post-update restart.
      if (process.platform === 'darwin') {
        logger.info('[System] macOS detected — spawning detached respawner before exit');
        spawnDetachedRespawn('manual-restart');
        process.exit(0);
        return;
      }

      // SEC-A6 (2026-04-22 audit): each entry is now [binary, ...argv] —
      // no shell, no glob expansion, no env-var interpolation. The `nvm`
      // path candidates are resolved at call-time by resolvePm2Candidates().
      const restartCommands: Array<{ argv: string[]; name: string }> = [
        { argv: ['systemctl', 'restart', 'pc2-node'], name: 'systemctl pc2-node' },
        { argv: ['systemctl', 'restart', 'pc2'], name: 'systemctl pc2' },
      ];
      for (const pm2Bin of resolvePm2Candidates()) {
        restartCommands.push({ argv: [pm2Bin, 'restart', 'pc2'], name: `pm2 restart pc2 (${pm2Bin})` });
        restartCommands.push({ argv: [pm2Bin, 'restart', 'all'], name: `pm2 restart all (${pm2Bin})` });
      }

      for (const { argv, name } of restartCommands) {
        try {
          logger.info(`[System] Trying ${name}...`);
          execFileSync(argv[0], argv.slice(1), { timeout: 30000, stdio: 'ignore' });
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
 * GET /api/system/host-platform
 * Compact host facts (os/arch/memory/jetson) the dApp Centre uses to gate
 * device compatibility for apps that publish requirements.platform. Kept
 * authenticate-only (same posture as /info) — it's host metadata, not a secret.
 */
router.get('/host-platform', authenticate, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ success: true, result: getHostPlatformSummary() });
  } catch (error) {
    logger.error('[System] host-platform error:', error);
    res.status(500).json({ success: false, error: 'Failed to get host platform' });
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

    // SEC-A6 (2026-04-22 audit): replaced execSync('… 2>&1') with execFileSync.
    // Stderr is captured by passing stdio:'pipe' on fd 2, then concatenated
    // with stdout — same observable behaviour as `2>&1` without going through
    // a shell.

    // Set MAXN power mode (mode 0 = maximum performance)
    try {
      const output = execFileSync('sudo', ['nvpmodel', '-m', '0'], {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'pipe'],
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
      const output = execFileSync('sudo', ['jetson_clocks'], {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'pipe'],
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
