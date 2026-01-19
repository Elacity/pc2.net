/**
 * Authentication Endpoints
 *
 * Handles Particle Auth authentication and session creation
 */
import { Request, Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
/**
 * Authenticate with Particle Auth
 * POST /auth/particle
 */
export declare function handleParticleAuth(req: Request, res: Response): Promise<void>;
/**
 * Grant user app access
 * POST /auth/grant-user-app
 */
export declare function handleGrantUserApp(req: AuthenticatedRequest, res: Response): void;
/**
 * GET /auth/get-user-app-token
 * Returns a token for app access (used by SDK)
 */
export declare function handleGetUserAppToken(req: AuthenticatedRequest, res: Response): void;
//# sourceMappingURL=auth.d.ts.map