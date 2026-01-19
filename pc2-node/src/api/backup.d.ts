/**
 * Backup Management API
 *
 * Provides endpoints for managing backups:
 * - List backups
 * - Download backup files
 * - Delete backups
 *
 * CRITICAL: Backups should be downloaded to a separate device/server
 * to ensure they survive server failures.
 */
import { Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
/**
 * Create a new backup
 * POST /api/backups/create
 *
 * Triggers the backup script to create a new backup archive.
 * This allows users to create backups through the UI/API.
 */
export declare function createBackup(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * List available backups
 * GET /api/backups
 */
export declare function listBackups(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Download a backup file
 * GET /api/backups/download/:filename
 *
 * CRITICAL: This allows users to download backups to their local device
 * (laptop, desktop) or another server, ensuring backups survive server failures.
 */
export declare function downloadBackup(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Delete a backup file
 * DELETE /api/backups/:filename
 */
export declare function deleteBackup(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Restore from backup file
 * POST /api/backups/restore
 *
 * Accepts a backup file upload and restores PC2 node data.
 * This will stop the server, restore data, and require manual restart.
 *
 * Body: multipart/form-data with 'file' field containing .tar.gz backup file
 */
export declare function restoreBackup(req: AuthenticatedRequest & {
    file?: Express.Multer.File;
}, res: Response): Promise<void>;
//# sourceMappingURL=backup.d.ts.map