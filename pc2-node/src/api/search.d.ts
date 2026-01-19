/**
 * Search API Endpoint
 *
 * Handles file search operations - filename, path, and metadata search
 */
import { Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
/**
 * Search for files by filename, path, content, or metadata
 * POST /search
 * Body: { text: string, fileType?: string, mimeType?: string, minSize?: number, maxSize?: number, minDate?: number, maxDate?: number, ipfsHash?: string, searchMode?: 'filename'|'content'|'both', limit?: number }
 */
export declare function handleSearch(req: AuthenticatedRequest, res: Response): void;
//# sourceMappingURL=search.d.ts.map