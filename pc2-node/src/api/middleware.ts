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

  // Get token from Authorization header, query, or body
  // Also check for auth_token in query params (SDK sometimes uses URL-based auth)
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim(); // Remove "Bearer " prefix and trim whitespace
    // Check if token contains comma (multiple values) - take first one
    if (token.includes(',')) {
      logger.warn('⚠️ Authorization header contains multiple values, using first', {
        original: authHeader.substring(0, 50) + '...',
        extracted: token.substring(0, 20) + '...'
      });
      token = token.split(',')[0].trim();
    }
  } else if (req.query.token) {
    token = String(req.query.token).trim();
  } else if (req.query.auth_token) {
    token = String(req.query.auth_token).trim();
  } else if (req.body?.token) {
    token = String(req.body.token).trim();
  } else if (req.body?.auth_token) {
    token = String(req.body.auth_token).trim();
  }

  // Log for debugging (remove in production)
  if (!token) {
    logger.warn('Authentication failed: No token provided', {
      path: req.path,
      method: req.method,
      hasAuthHeader: !!authHeader,
      authHeaderValue: authHeader ? authHeader.substring(0, 20) + '...' : null,
      queryToken: !!(req.query.token || req.query.auth_token),
      bodyToken: !!(req.body?.token || req.body?.auth_token)
    });
    res.status(401).json({ error: 'Authentication required', message: 'No token provided' });
    return;
  }
  
  // Log successful token extraction (for debugging)
  logger.info('Token extracted', {
    path: req.path,
    method: req.method,
    source: authHeader ? 'header' : (req.query.token || req.query.auth_token ? 'query' : 'body'),
    tokenPrefix: token.substring(0, 8) + '...',
    tokenLength: token.length,
    tokenFull: token.length <= 100 ? token : token.substring(0, 100) + '...' // Log full token if short, truncated if long
  });

  // Verify session
  const session = db.getSession(token);
  if (!session) {
    logger.warn('Session not found for token', {
      path: req.path,
      method: req.method,
      tokenPrefix: token.substring(0, 8) + '...',
      tokenLength: token.length
    });
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

