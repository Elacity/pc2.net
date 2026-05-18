/**
 * Update API Routes
 *
 * Endpoints for checking and managing PC2 node updates.
 *
 * Security (SEC-10, 2026-04 audit):
 *   All routes require owner authentication. Without this gate, an
 *   unauthenticated attacker could trigger `git pull && npm install &&
 *   restart` (RCE via supply-chain compromise), or hammer `/check-github`
 *   to exhaust the GitHub API rate-limit (DoS).
 *
 *   Throttling: heavy operations (/install, /check-github) carry a
 *   per-process minimum-interval guard so a runaway loop in a misbehaving
 *   client cannot accidentally hammer GitHub or the update pipeline.
 */

import { Router, Request, Response, NextFunction } from 'express';
import type { UpdateService } from '../services/UpdateService.js';
import { logger } from '../utils/logger.js';
import { authenticate, requireOwner, AuthenticatedRequest } from './middleware.js';

const router = Router();

// Per-process minimum interval between heavy operations. Belt-and-braces guard
// against accidental hammering even by an authenticated owner client.
const INSTALL_MIN_INTERVAL_MS = 60_000;
const GITHUB_CHECK_MIN_INTERVAL_MS = 30_000;

const throttleState = {
  install: { lastAt: 0, minIntervalMs: INSTALL_MIN_INTERVAL_MS, label: 'update install' },
  github: { lastAt: 0, minIntervalMs: GITHUB_CHECK_MIN_INTERVAL_MS, label: 'GitHub release check' },
};

function makeThrottle(state: { lastAt: number; minIntervalMs: number; label: string }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const elapsed = now - state.lastAt;
    if (elapsed < state.minIntervalMs) {
      const retryAfterSec = Math.ceil((state.minIntervalMs - elapsed) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        success: false,
        error: `Too many requests for ${state.label}. Try again in ${retryAfterSec}s.`,
        retryAfterSec,
      });
      return;
    }
    state.lastAt = now;
    next();
  };
}

const installThrottle = makeThrottle(throttleState.install);
const githubThrottle = makeThrottle(throttleState.github);

/**
 * Get current version and update status (owner only)
 * GET /api/update/status
 */
router.get('/status', authenticate, requireOwner, (req: Request, res: Response) => {
  try {
    const updateService = req.app.locals.updateService as UpdateService;
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
 * Check for updates now (owner only)
 * POST /api/update/check
 */
router.post('/check', authenticate, requireOwner, async (req: Request, res: Response) => {
  try {
    const updateService = req.app.locals.updateService as UpdateService;
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
 * Get current version only (owner only — version is recon-relevant)
 * GET /api/update/version
 *
 * Note: PC2 node version is intentionally NOT public. An attacker who knows
 * the exact version can map to specific CVEs. The Puter GUI obtains version
 * info via authenticated paths it already calls.
 */
router.get('/version', authenticate, requireOwner, (req: Request, res: Response) => {
  try {
    const updateService = req.app.locals.updateService as UpdateService;

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
 * Check GitHub releases for updates (owner only, throttled)
 * POST /api/update/check-github
 */
router.post('/check-github', authenticate, requireOwner, githubThrottle, async (req: Request, res: Response) => {
  try {
    const updateService = req.app.locals.updateService as UpdateService;
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
 * Install update (owner only, throttled)
 * POST /api/update/install
 *
 * This will:
 * 1. git pull origin main
 * 2. npm install
 * 3. npm run build
 * 4. Restart the server
 *
 * Pre-fix (SEC-10): unauthenticated; any reachable client could trigger.
 * Post-fix: authenticate + requireOwner + 60s throttle. The owner's session
 * token (already present in the GUI's localStorage/cookie) authorizes this
 * call without any client-side change required.
 */
router.post('/install', authenticate, requireOwner, installThrottle, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updateService = req.app.locals.updateService as UpdateService;

    if (updateService.getIsUpdating()) {
      return res.status(409).json({
        success: false,
        error: 'Update already in progress',
        progress: updateService.getUpdateProgress(),
      });
    }

    logger.info('[Update API] Owner-authorized update installation starting', {
      ownerWalletPrefix: req.user?.wallet_address?.substring(0, 10) + '...',
    });

    res.json({
      success: true,
      message: 'Update started. Server will restart when complete.',
      status: 'updating',
    });

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
 * Get update progress (owner only)
 * GET /api/update/progress
 *
 * Optional query params:
 *   ?sinceSeq=<n>  — only return log lines added after sequence n (saves
 *                    bandwidth on the GUI's poll loop). When omitted, the
 *                    full rolling buffer (last 400 lines) is returned.
 *
 * The rolling log buffer is the v1.2.3 fix for the v1.2.2 "flying blind"
 * UX. Each entry is `[HH:MM:SS] [source] message` so the GUI can render
 * a terminal-style live view of git/npm/build output during updates.
 */
router.get('/progress', authenticate, requireOwner, (req: Request, res: Response) => {
  try {
    const updateService = req.app.locals.updateService as UpdateService;
    const allLog = updateService.getUpdateLog();
    const currentSeq = updateService.getLogSeq();

    // Diff slice: when the client passes sinceSeq, only send the lines that
    // arrived after that point. Crude but sufficient because logSeq is
    // monotonic and we cap the buffer at 400 lines.
    const sinceSeqRaw = req.query.sinceSeq;
    const sinceSeq = typeof sinceSeqRaw === 'string' ? parseInt(sinceSeqRaw, 10) : NaN;
    let log = allLog;
    if (Number.isFinite(sinceSeq) && sinceSeq >= 0 && sinceSeq < currentSeq) {
      // Number of new lines since client's last seen seq, capped at buffer size.
      const newLineCount = Math.min(currentSeq - sinceSeq, allLog.length);
      log = allLog.slice(allLog.length - newLineCount);
    } else if (Number.isFinite(sinceSeq) && sinceSeq >= currentSeq) {
      // Client is up to date; no new lines.
      log = [];
    }

    res.json({
      isUpdating: updateService.getIsUpdating(),
      progress: updateService.getUpdateProgress(),
      log,
      logSeq: currentSeq,
    });
  } catch (error) {
    logger.error('[Update API] Progress error:', error);
    res.status(500).json({ error: 'Failed to get update progress' });
  }
});

export default router;
