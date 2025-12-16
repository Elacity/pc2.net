/**
 * API Middleware
 * 
 * Authentication and error handling middleware
 */

import { Request, Response, NextFunction } from 'express';
import { DatabaseManager } from '../storage/database.js';
import { Config } from '../config/loader.js';
import { verifyOwner } from '../auth/owner.js';
import { logger } from '../utils/logger.js';

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
export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const db = (req.app.locals.db as DatabaseManager | undefined);
  const config = (req.app.locals.config as Config | undefined);

  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  // Get token from Authorization header or query
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : (req.query.token as string) || (req.body?.token as string);

  if (!token) {
    res.status(401).json({ error: 'Authentication required', message: 'No token provided' });
    return;
  }

  // Verify session
  const session = db.getSession(token);
  if (!session) {
    res.status(401).json({ error: 'Authentication failed', message: 'Invalid session token' });
    return;
  }

  // Check expiration
  if (session.expires_at < Date.now()) {
    res.status(401).json({ error: 'Authentication failed', message: 'Session expired' });
    return;
  }

  // Verify owner (if config is available)
  if (config) {
    const ownerCheck = verifyOwner(session.wallet_address, config);
    if (!ownerCheck.isAuthorized) {
      res.status(403).json({ 
        error: 'Unauthorized', 
        message: ownerCheck.reason || 'Wallet is not authorized' 
      });
      return;
    }
  }

  // Attach user to request
  req.user = {
    wallet_address: session.wallet_address,
    smart_account_address: session.smart_account_address,
    session_token: token
  };

  next();
}

/**
 * Error handling middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error('API Error:', err.message, { path: req.path, method: req.method });

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
}

/**
 * CORS middleware (already handled by Express, but for consistency)
 */
export function corsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  next();
}
