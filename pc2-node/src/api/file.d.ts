/**
 * File Access Endpoint
 *
 * Handles signed file access via /file?uid=...
 */
import { Request, Response } from 'express';
/**
 * Get file by UID (signed access)
 * GET /file?uid=uuid-...
 */
export declare function handleFile(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=file.d.ts.map