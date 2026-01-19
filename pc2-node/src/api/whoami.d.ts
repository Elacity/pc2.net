/**
 * Whoami Endpoint
 *
 * Returns current user information based on session token
 */
import { Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
/**
 * Get current user information
 * GET /whoami
 */
export declare function handleWhoami(req: AuthenticatedRequest, res: Response): void;
//# sourceMappingURL=whoami.d.ts.map