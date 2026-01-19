/**
 * Info Endpoints
 *
 * Additional endpoints needed by the frontend
 */
import { Request, Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
/**
 * Get API info
 * GET /api/info
 */
export declare function handleAPIInfo(req: Request, res: Response): void;
/**
 * Get launch apps
 * GET /get-launch-apps
 * Returns apps available in the start menu
 */
export declare function handleGetLaunchApps(req: Request, res: Response): void;
/**
 * Disk free space (df)
 * GET /df
 */
export declare function handleDF(req: AuthenticatedRequest, res: Response): void;
/**
 * Batch operations
 * POST /batch
 */
/**
 * Batch operations endpoint
 * POST /batch
 * Handles batch file uploads (multipart/form-data or JSON)
 *
 * The Puter SDK's fs.upload() sends files to this endpoint
 * Format can be:
 * 1. multipart/form-data with files
 * 2. JSON with operations array
 */
export declare function handleBatch(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Cache timestamp endpoint (used by Puter SDK)
 * GET /cache/last-change-timestamp
 * No auth required - SDK calls this during initialization
 */
export declare function handleCacheTimestamp(req: Request, res: Response): void;
/**
 * Get storage statistics
 * GET /api/stats
 * Returns storage usage, file counts, etc.
 */
export declare function handleStats(req: AuthenticatedRequest, res: Response): void;
//# sourceMappingURL=info.d.ts.map