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
  // Log all POST requests to filesystem endpoints for debugging
  if (req.method === 'POST' && (
    req.path === '/mkdir' || 
    req.path === '/delete' || 
    req.path === '/move' ||
    req.path.startsWith('/api/files/')
  )) {
    logger.info('[Auth Middleware] Filesystem POST request intercepted', {
      path: req.path,
      method: req.method,
      hasAuthHeader: !!req.headers.authorization,
      bodyKeys: Object.keys(req.body || {}),
      bodyPreview: JSON.stringify(req.body).substring(0, 300)
    });
  }

  const db = (req.app.locals.db as DatabaseManager | undefined);
  const config = (req.app.locals.config as Config | undefined);

  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  // Special case: Allow /read requests for .__puter_gui.json without auth
  // This is critical for Puter GUI initialization (matching mock server behavior)
  if (req.path === '/read' || req.path.startsWith('/read')) {
    const pathParam = (req.query.path as string) || 
                     (req.query.file as string) ||
                     (req.body?.path as string) || 
                     (req.body?.file as string);
    if (pathParam && (pathParam === '~/.__puter_gui.json' || pathParam.endsWith('.__puter_gui.json'))) {
      logger.info('[Auth Middleware] Allowing .__puter_gui.json read without auth');
      // Set req.user to undefined but allow request to proceed
      req.user = undefined;
      return next();
    }
  }

  // Get token from Authorization header, query, or body
  // Also check for auth_token in query params (SDK sometimes uses URL-based auth)
  // CRITICAL: Also check Referer header (for app iframes) - matching mock server behavior
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
  } else if (req.query['puter.auth.token']) {
    // Check for puter.auth.token in query (common in app iframe URLs)
    token = String(req.query['puter.auth.token']).trim();
  } else if (req.body?.token) {
    token = String(req.body.token).trim();
  } else if (req.body?.auth_token) {
    token = String(req.body.auth_token).trim();
  }
  
  // CRITICAL FIX: Check Referer header for token (matching mock server behavior)
  // App iframes (viewer, player) pass token in URL params, which appear in Referer header
  if (!token && req.headers.referer) {
    try {
      const refererUrl = new URL(req.headers.referer);
      const refererToken = refererUrl.searchParams.get('puter.auth.token') ||
                           refererUrl.searchParams.get('token') ||
                           refererUrl.searchParams.get('auth_token');
      if (refererToken) {
        token = refererToken;
        logger.info('[Auth Middleware] Found token in Referer header', {
          tokenPrefix: refererToken.substring(0, 20) + '...',
          referer: req.headers.referer.substring(0, 100) + '...'
        });
      }
    } catch (e) {
      // Invalid Referer URL, continue without token
      logger.debug('[Auth Middleware] Failed to parse Referer URL', {
        referer: req.headers.referer?.substring(0, 100),
        error: e instanceof Error ? e.message : String(e)
      });
    }
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

  // Check if token is an app token (token-0x... format)
  // App tokens are generated by /sign endpoint and are NOT session tokens
  // For app tokens, we need to extract the wallet address and create a temporary session
  const isAppToken = token.startsWith('token-');
  let session = db.getSession(token);
  
  if (!session && isAppToken) {
    // App token format: token-0x{walletAddress}-{timestamp}
    // Extract wallet address from app token
    const tokenParts = token.split('-');
    if (tokenParts.length >= 2 && tokenParts[1].startsWith('0x')) {
      const walletAddress = tokenParts[1];
      // Try to find an existing session for this wallet
      session = db.getSessionByWallet(walletAddress);
      if (session) {
        logger.info('[Auth Middleware] Found session for app token wallet', {
          walletPrefix: walletAddress.substring(0, 10) + '...',
          sessionTokenPrefix: session.token.substring(0, 8) + '...'
        });
        // Use the session token instead of app token
        token = session.token;
      } else {
        logger.warn('[Auth Middleware] App token provided but no session found for wallet', {
          walletPrefix: walletAddress.substring(0, 10) + '...',
          tokenPrefix: token.substring(0, 20) + '...'
        });
        res.status(401).json({ error: 'Authentication failed', message: 'No session found for app token wallet' });
        return;
      }
    }
  }
  
  // Verify session (either original or found via app token)
  if (!session) {
    session = db.getSession(token);
  }
  
  // Development mode: Allow mock tokens for testing
  // This matches the mock server behavior where mock-token is accepted
  if (!session && (token === 'mock-token' || token.startsWith('mock-token'))) {
    logger.info('[Auth Middleware] Development mode: Using mock token', {
      path: req.path,
      tokenPrefix: token.substring(0, 20) + '...'
    });
    
    // Extract wallet address from path if present (for viewer apps and file operations)
    // Paths like /0x34daf31b.../Desktop should extract 0x34daf31b...
    // CRITICAL: Check query params FIRST (req.query.file contains the actual file path)
    let mockWalletAddress = '0x0000000000000000000000000000000000000000';
    const pathToCheck = (req.query.file as string) ||  // ✅ Check file param first (most common)
                        (req.query.path as string) || 
                        (req.body?.file as string) ||
                        (req.body?.path as string) || 
                        req.path;
    
    // Try to extract wallet address from path (format: /0x{40 hex chars}/...)
    const walletMatch = pathToCheck.match(/^\/(0x[a-fA-F0-9]{40})/);
    if (walletMatch && walletMatch[1]) {
      mockWalletAddress = walletMatch[1];
      logger.info('[Auth Middleware] Extracted wallet address from path for mock token', {
        walletAddress: mockWalletAddress,
        path: pathToCheck
      });
      
      // CRITICAL FIX: Try to find existing session for this wallet (matching mock server fallback)
      // This allows viewer apps to use real session even with mock token
      const existingSession = db.getSessionByWallet(mockWalletAddress);
      if (existingSession) {
        logger.info('[Auth Middleware] Found existing session for mock token wallet, using real session', {
          walletPrefix: mockWalletAddress.substring(0, 10) + '...',
          sessionTokenPrefix: existingSession.token.substring(0, 8) + '...'
        });
        // Use the real session instead of mock user
        req.user = {
          wallet_address: existingSession.wallet_address,
          smart_account_address: existingSession.smart_account_address,
          session_token: existingSession.token
        };
        return next();
      }
    }
    
    // Fallback to mock user if no existing session found
    req.user = {
      wallet_address: mockWalletAddress,
      smart_account_address: null,
      session_token: token
    };
    return next();
  }
  
  if (!session) {
    logger.warn('Session not found for token', {
      path: req.path,
      method: req.method,
      tokenPrefix: token.substring(0, 8) + '...',
      tokenLength: token.length,
      isAppToken
    });
    res.status(401).json({ error: 'Authentication failed', message: 'Invalid session token' });
    return;
  }

  // Check expiration
  if (session.expires_at < Date.now()) {
    logger.warn('Session expired', {
      path: req.path,
      method: req.method,
      tokenPrefix: token.substring(0, 8) + '...',
      expiredAt: new Date(session.expires_at).toISOString(),
      now: new Date().toISOString(),
      expiredBy: Math.round((Date.now() - session.expires_at) / 1000) + ' seconds'
    });
    res.status(401).json({ error: 'Authentication failed', message: 'Session expired' });
    return;
  }
  
  // Extend session on activity (refresh expiration time)
  // This prevents users from being logged out while actively using the system
  // Match mock server behavior: always extend on activity (no 50% check)
  if (db && config) {
    const maxExtension = config.security.session_duration_days * 24 * 60 * 60 * 1000;
    const newExpiresAt = Date.now() + maxExtension;
    db.updateSessionExpiration(token, newExpiresAt);
    logger.debug('Session extended', {
      tokenPrefix: token.substring(0, 8) + '...',
      newExpiresAt: new Date(newExpiresAt).toISOString(),
      expiresIn: Math.round(maxExtension / 1000 / 60) + ' minutes'
    });
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

