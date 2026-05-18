/**
 * Supernode & Relay API Endpoints
 * 
 * Provides system spec checking, relay mode management,
 * and supernode service status for the Supernode Manager dApp.
 */

import { Router, type Response } from 'express';
import { authenticate, type AuthenticatedRequest } from './middleware.js';
import { logger } from '../utils/logger.js';
import os from 'os';
import { statfsSync } from 'fs';
import type { DatabaseManager } from '../storage/database.js';
import type { IPFSStorage } from '../storage/ipfs.js';

const router = Router();

// Phase 2-Globals: db and ipfs are now read from req.app.locals.X
// instead of ambient globals. (global as any).db was never set
// anywhere — the old getDb() helper always returned undefined and
// db?.getSetting() reads silently failed, see
// PHASE-2-GLOBALS-CLEANUP ticket §"Global 2". (global as any).ipfsStorage
// is set once at bootstrap (index.ts) and is still available there
// for non-Express callers, but consumer routes should use the
// explicit req.app.locals.ipfs channel.

// Minimum supernode requirements
const SUPERNODE_REQUIREMENTS = {
  cpuCores: 4,
  ramGB: 8,
  diskGB: 50,
  publicIP: true,
};

interface SpecCheckResult {
  passed: boolean;
  checks: {
    name: string;
    required: string;
    actual: string;
    passed: boolean;
  }[];
}

function checkSpecs(): SpecCheckResult {
  const cpuCores = os.cpus().length;
  const ramGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  
  let diskGB = 0;
  try {
    const stat = statfsSync('/');
    diskGB = Math.round((stat.bavail * stat.bsize) / (1024 * 1024 * 1024));
  } catch {
    // statfs may not be available on all platforms
  }

  const checks = [
    {
      name: 'CPU Cores',
      required: `${SUPERNODE_REQUIREMENTS.cpuCores}+`,
      actual: `${cpuCores}`,
      passed: cpuCores >= SUPERNODE_REQUIREMENTS.cpuCores,
    },
    {
      name: 'RAM',
      required: `${SUPERNODE_REQUIREMENTS.ramGB}+ GB`,
      actual: `${ramGB} GB`,
      passed: ramGB >= SUPERNODE_REQUIREMENTS.ramGB,
    },
    {
      name: 'Free Disk',
      required: `${SUPERNODE_REQUIREMENTS.diskGB}+ GB`,
      actual: `${diskGB} GB`,
      passed: diskGB >= SUPERNODE_REQUIREMENTS.diskGB,
    },
    {
      name: 'Architecture',
      required: 'x64',
      actual: os.arch(),
      passed: os.arch() === 'x64' || os.arch() === 'arm64',
    },
    {
      name: 'Platform',
      required: 'Linux',
      actual: os.platform(),
      passed: os.platform() === 'linux',
    },
  ];

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}

/**
 * GET /api/supernode/specs
 * Check if this machine meets supernode requirements
 */
router.get('/specs', authenticate, (_req: AuthenticatedRequest, res: Response) => {
  const result = checkSpecs();
  res.json({
    ...result,
    requirements: SUPERNODE_REQUIREMENTS,
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    uptime: os.uptime(),
  });
});

/**
 * GET /api/supernode/relay/status
 * Get current relay mode status
 */
router.get('/relay/status', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const db = req.app.locals.db as DatabaseManager | undefined;
  const ipfs = req.app.locals.ipfs as IPFSStorage | undefined;

  const relayEnabled = db?.getSetting('relay_mode') === 'true';
  const maxConnections = parseInt(db?.getSetting('relay_max_connections') || '100', 10);
  const isRelaying = ipfs?.isRelayMode?.() ?? false;

  let peerCount = 0;
  try {
    const helia = ipfs?.getHeliaInstance?.();
    if (helia?.libp2p) {
      peerCount = helia.libp2p.getConnections().length;
    }
  } catch {
    // Non-critical
  }

  res.json({
    enabled: relayEnabled,
    active: isRelaying,
    maxConnections,
    connectedPeers: peerCount,
    needsRestart: relayEnabled !== isRelaying,
  });
});

/**
 * POST /api/supernode/relay/settings
 * Enable or disable relay mode
 */
router.post('/relay/settings', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const db = req.app.locals.db as DatabaseManager | undefined;
  if (!db) {
    res.status(500).json({ error: 'Database not available' });
    return;
  }

  const { enabled, maxConnections } = req.body;

  if (typeof enabled === 'boolean') {
    db.setSetting('relay_mode', String(enabled));
    logger.info(`[Relay] Relay mode ${enabled ? 'enabled' : 'disabled'} — restart required to take effect`);
  }

  if (typeof maxConnections === 'number' && maxConnections > 0 && maxConnections <= 1000) {
    db.setSetting('relay_max_connections', String(maxConnections));
  }

  res.json({
    success: true,
    enabled: db.getSetting('relay_mode') === 'true',
    maxConnections: parseInt(db.getSetting('relay_max_connections') || '100', 10),
    message: 'Settings saved. Restart PC2 node for changes to take effect.',
  });
});

/**
 * GET /api/supernode/wireguard/status
 * Check WireGuard binary availability and permission state.
 */
router.get('/wireguard/status', authenticate, (_req: AuthenticatedRequest, res: Response) => {
  const wgService = (global as any).wireguardService;
  if (!wgService) {
    res.json({
      available: false,
      mode: 'none',
      sudoConfigured: false,
      binaries: {},
      message: 'WireGuard service not initialized',
    });
    return;
  }

  res.json({
    available: wgService.mode !== 'none',
    mode: wgService.mode,
    sudoConfigured: wgService.sudoConfigured,
    binaries: {
      wg: wgService.resolvedWgPath || null,
      wgQuick: wgService.resolvedWgQuickPath || null,
      wireguardGo: wgService.resolvedWgGoPath || null,
    },
    instructions: wgService.sudoConfigured ? null : wgService.getPermissionInstructions(),
  });
});

/**
 * POST /api/supernode/wireguard/setup-permissions
 * Trigger OS-level permission setup for WireGuard (sudoers entry).
 * On macOS, shows a native authentication dialog.
 */
router.post('/wireguard/setup-permissions', authenticate, async (_req: AuthenticatedRequest, res: Response) => {
  const wgService = (global as any).wireguardService;
  if (!wgService) {
    res.status(500).json({ success: false, message: 'WireGuard service not initialized' });
    return;
  }
  try {
    const result = await wgService.setupPermissions();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export function createSupernodeRouter() {
  return router;
}
