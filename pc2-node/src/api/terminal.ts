/**
 * Terminal API Endpoints
 * 
 * REST API for terminal management
 * Most terminal operations happen via WebSocket, but these endpoints
 * provide status and management capabilities.
 */

import { Request, Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
import { getTerminalService } from '../services/terminal/TerminalService.js';
import { logger } from '../utils/logger.js';

/**
 * Get terminal stats for the current user
 * GET /api/terminal/stats
 */
export function handleTerminalStats(req: AuthenticatedRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const terminalService = getTerminalService();
    const sessions = terminalService.getUserSessions(req.user.wallet_address);
    
    res.json({
      success: true,
      sessions: sessions.map(s => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        lastActivity: s.lastActivity.toISOString(),
        cols: s.cols,
        rows: s.rows,
      })),
      count: sessions.length,
    });
  } catch (error: any) {
    logger.error('[Terminal API] Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get terminal stats' });
  }
}

/**
 * Get global terminal stats (admin only - for owner wallet)
 * GET /api/terminal/admin/stats
 */
export function handleTerminalAdminStats(req: AuthenticatedRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Check if user is the owner
  const config = req.app.locals.config;
  if (!config || config.owner.wallet_address?.toLowerCase() !== req.user.wallet_address.toLowerCase()) {
    res.status(403).json({ error: 'Forbidden - Owner access required' });
    return;
  }

  try {
    const terminalService = getTerminalService();
    const stats = terminalService.getStats();
    
    res.json({
      success: true,
      ...stats,
    });
  } catch (error: any) {
    logger.error('[Terminal API] Error getting admin stats:', error);
    res.status(500).json({ error: 'Failed to get terminal admin stats' });
  }
}

/**
 * Destroy all terminal sessions for the current user
 * POST /api/terminal/destroy-all
 */
export function handleDestroyAllTerminals(req: AuthenticatedRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const terminalService = getTerminalService();
    const count = terminalService.destroyAllUserSessions(req.user.wallet_address);
    
    logger.info(`[Terminal API] User ${req.user.wallet_address} destroyed ${count} terminal sessions`);
    
    res.json({
      success: true,
      destroyed: count,
    });
  } catch (error: any) {
    logger.error('[Terminal API] Error destroying terminals:', error);
    res.status(500).json({ error: 'Failed to destroy terminals' });
  }
}

/**
 * Check if terminal feature is available
 * GET /api/terminal/status
 */
export function handleTerminalStatus(req: Request, res: Response): void {
  try {
    // Check if node-pty is available
    let nodeptyAvailable = false;
    try {
      require.resolve('node-pty');
      nodeptyAvailable = true;
    } catch {
      nodeptyAvailable = false;
    }
    
    // Get terminal service status
    const terminalService = getTerminalService();
    const isolationMode = terminalService.getEffectiveIsolationMode();
    const isAvailable = terminalService.isAvailable();
    
    let message = '';
    if (!nodeptyAvailable) {
      message = 'Terminal service unavailable - node-pty not installed';
    } else if (!isAvailable) {
      message = 'Terminal feature is disabled on this node';
    } else if (isolationMode === 'namespace') {
      message = 'Terminal available with namespace isolation (multi-user safe)';
    } else {
      message = 'Terminal available (single-user mode - no isolation)';
    }
    
    res.json({
      available: nodeptyAvailable && isAvailable,
      nodeptyInstalled: nodeptyAvailable,
      isolationMode,
      isMultiUserSafe: isolationMode === 'namespace',
      message,
      securityWarning: isolationMode === 'none' 
        ? 'This node is running in single-user mode. Multiple users sharing this terminal have full access to each other\'s data.'
        : null,
    });
  } catch (error: any) {
    logger.error('[Terminal API] Error checking status:', error);
    res.status(500).json({ 
      available: false,
      error: 'Failed to check terminal status',
    });
  }
}
