/**
 * Terminal API Endpoints
 *
 * REST API for terminal management
 * Most terminal operations happen via WebSocket, but these endpoints
 * provide status and management capabilities.
 */
import { Request, Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
/**
 * Get terminal stats for the current user
 * GET /api/terminal/stats
 */
export declare function handleTerminalStats(req: AuthenticatedRequest, res: Response): void;
/**
 * Get global terminal stats (admin only - for owner wallet)
 * GET /api/terminal/admin/stats
 */
export declare function handleTerminalAdminStats(req: AuthenticatedRequest, res: Response): void;
/**
 * Destroy all terminal sessions for the current user
 * POST /api/terminal/destroy-all
 */
export declare function handleDestroyAllTerminals(req: AuthenticatedRequest, res: Response): void;
/**
 * Check if terminal feature is available
 * GET /api/terminal/status
 */
export declare function handleTerminalStatus(req: Request, res: Response): void;
//# sourceMappingURL=terminal.d.ts.map