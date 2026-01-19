/**
 * API Middleware
 *
 * Authentication and error handling middleware
 */
import { Request, Response, NextFunction } from 'express';
export interface AuthenticatedRequest extends Request {
    user?: {
        wallet_address: string;
        smart_account_address: string | null;
        session_token: string;
    };
}
/**
 * Authentication middleware
 * Verifies session token and attaches user to request
 */
export declare function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void;
/**
 * Error handling middleware
 */
export declare function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void;
/**
 * CORS middleware (already handled by Express, but for consistency)
 */
export declare function corsMiddleware(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=middleware.d.ts.map