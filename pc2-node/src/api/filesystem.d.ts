/**
 * Filesystem API Endpoints
 *
 * Handles file and directory operations
 */
import { Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
/**
 * Get file/folder stat
 * GET /stat?path=/path/to/file
 * POST /stat (with path in body)
 */
export declare function handleStat(req: AuthenticatedRequest, res: Response): void;
/**
 * List directory contents
 * POST /readdir
 */
export declare function handleReaddir(req: AuthenticatedRequest, res: Response): void;
/**
 * Read file content
 * GET /read?path=/path/to/file
 */
export declare function handleRead(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Write/create file
 * POST /write
 */
export declare function handleWrite(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Create directory
 * POST /mkdir
 */
export declare function handleMkdir(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Delete files/directories
 * POST /delete
 */
export declare function handleDelete(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Move/rename files
 * POST /move
 */
export declare function handleMove(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Rename files/directories
 * POST /rename
 */
export declare function handleRename(req: AuthenticatedRequest, res: Response): Promise<void>;
//# sourceMappingURL=filesystem.d.ts.map