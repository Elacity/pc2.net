/**
 * File Versions API
 *
 * Handles file version history and rollback operations
 */
import { Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
/**
 * Get all versions for a file
 * GET /versions?path=/path/to/file
 */
export declare function handleGetVersions(req: AuthenticatedRequest, res: Response): void;
/**
 * Get a specific version of a file
 * GET /versions/:versionNumber?path=/path/to/file
 */
export declare function handleGetVersion(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Restore a file to a specific version (rollback)
 * POST /versions/:versionNumber/restore
 * Body: { path: "/path/to/file" }
 */
export declare function handleRestoreVersion(req: AuthenticatedRequest, res: Response): Promise<void>;
//# sourceMappingURL=versions.d.ts.map