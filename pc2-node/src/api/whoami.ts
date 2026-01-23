/**
 * Whoami Endpoint
 * 
 * Returns current user information based on session token
 */

import { Request, Response } from 'express';
import { DatabaseManager } from '../storage/database.js';
import { AuthenticatedRequest } from './middleware.js';
import { UserInfo } from '../types/api.js';
import { logger } from '../utils/logger.js';

/**
 * Get current user information
 * GET /whoami
 */
export function handleWhoami(req: AuthenticatedRequest, res: Response): void {
  const db = (req.app.locals.db as DatabaseManager | undefined);
  const config = (req.app as any).locals.config;

  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  // Extract token manually if req.user is not set (since /whoami doesn't use authenticate middleware)
  // CRITICAL: Check all sources including Referer header (matching middleware behavior)
  // CRITICAL FIX: If multiple Bearer tokens in header, try each one to find a valid session
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader) {
    // Handle multiple Bearer tokens: "Bearer token1, Bearer token2" or "Bearer token1, token2"
    const headerParts = authHeader.split(',').map(p => p.trim());
    const allTokens: string[] = [];
    
    for (const part of headerParts) {
      if (part.startsWith('Bearer ')) {
        allTokens.push(part.substring(7).trim());
      } else if (part.length > 0) {
        // Might be a token without Bearer prefix
        allTokens.push(part);
      }
    }
    
    if (allTokens.length > 1) {
      logger.info('[Whoami] Multiple tokens detected in header', {
        totalTokens: allTokens.length,
        tokenPrefixes: allTokens.map(t => t.substring(0, 8) + '...')
      });
      
      // Try each token to find one with a valid session
      for (const candidateToken of allTokens) {
        const candidateSession = db.getSession(candidateToken);
        if (candidateSession && candidateSession.expires_at > Date.now()) {
          token = candidateToken;
          logger.info('[Whoami] Found valid session for token from multiple tokens', {
            tokenPrefix: token.substring(0, 8) + '...',
            walletPrefix: candidateSession.wallet_address.substring(0, 10) + '...'
          });
          break;
        }
      }
      
      // If no valid session found, prefer real session token (64 hex chars) over mock tokens
      if (!token) {
        const realToken = allTokens.find(t => t.length === 64 && /^[0-9a-f]+$/i.test(t));
        if (realToken) {
          token = realToken;
          logger.info('[Whoami] No valid session found, using real session token format', {
            tokenPrefix: token.substring(0, 8) + '...'
          });
        } else {
          // Fallback to first token
          token = allTokens[0];
          logger.warn('[Whoami] No valid session found, using first token', {
            tokenPrefix: token.substring(0, 8) + '...',
            totalTokens: allTokens.length
          });
  }
      }
    } else if (allTokens.length === 1) {
      token = allTokens[0];
    } else if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }
  } else if (req.query.token) {
    token = String(req.query.token).trim();
  } else if (req.query.auth_token) {
    token = String(req.query.auth_token).trim();
  } else if (req.query['puter.auth.token']) {
    token = String(req.query['puter.auth.token']).trim();
  }
  
  // CRITICAL FIX: Check Referer header for token (matching middleware behavior)
  // This is essential for session persistence after page refresh
  if (!token && req.headers.referer) {
    try {
      const refererUrl = new URL(req.headers.referer);
      const refererToken = refererUrl.searchParams.get('puter.auth.token') || 
                          refererUrl.searchParams.get('token') || 
                          refererUrl.searchParams.get('auth_token');
      if (refererToken) {
        token = refererToken.trim();
        logger.info('[Whoami] Token extracted from Referer header', {
          tokenPrefix: token.substring(0, 8) + '...'
        });
      }
    } catch (e) {
      // Invalid URL, ignore
    }
  }

  // Debug logging
  logger.info('[Whoami] Request received', {
    hasUser: !!req.user,
    userWallet: req.user?.wallet_address,
    hasToken: !!token,
    tokenPrefix: token ? token.substring(0, 8) + '...' : null,
    hasAuthHeader: !!authHeader
  });

  // If req.user is not set but we have a token, try to authenticate manually
  if (!req.user && token) {
    // Check if token is a mock token (development mode)
    const isMockToken = token.startsWith('mock-token-');
    let session = db.getSession(token);
    
    // If mock token and no session found, try to find session by wallet address from path or get most recent session
    if (!session && isMockToken) {
      // Try to extract wallet address from any path in query/body/referer
      const pathToCheck = (req.query.path as string) || 
                         (req.query.file as string) ||
                         (req.body?.path as string) || 
                         (req.body?.file as string) ||
                         (req.headers.referer || '');
      
      let walletAddress: string | null = null;
      const walletMatch = pathToCheck.match(/\/0x([a-fA-F0-9]{40})/);
      if (walletMatch && walletMatch[1]) {
        walletAddress = '0x' + walletMatch[1];
      }
      
      if (walletAddress) {
        logger.info('[Whoami] Mock token detected, looking up session by wallet from path', {
          walletPrefix: walletAddress.substring(0, 10) + '...'
        });
        session = db.getSessionByWallet(walletAddress);
        if (session) {
          logger.info('[Whoami] Found session for mock token wallet', {
            walletPrefix: walletAddress.substring(0, 10) + '...',
            sessionTokenPrefix: session.token.substring(0, 8) + '...'
          });
          // Update token to use real session token
          token = session.token;
        }
      } else {
        // No wallet in path - DO NOT use another user's session as fallback
        // This would cause security issues and user confusion
        // Instead, return unauthenticated state so user can log in again
        logger.warn('[Whoami] Mock token detected, no wallet in path, cannot determine user', {
          pathToCheck: pathToCheck.substring(0, 100) + (pathToCheck.length > 100 ? '...' : ''),
          message: 'Cannot use fallback session - would return wrong user. Returning unauthenticated state.'
        });
        // Don't set session - let it fall through to unauthenticated response
      }
    }
    
    if (session) {
      if (session.expires_at > Date.now()) {
        // Valid session - create req.user object
        (req as any).user = {
          wallet_address: session.wallet_address,
          smart_account_address: session.smart_account_address,
          session_token: token
        };
        logger.info('[Whoami] Authenticated via token (no middleware)', {
          wallet: session.wallet_address.substring(0, 10) + '...',
          expiresAt: new Date(session.expires_at).toISOString(),
          wasMockToken: isMockToken
        });
      } else {
        logger.warn('[Whoami] Session expired', {
          tokenPrefix: token.substring(0, 8) + '...',
          expiredAt: new Date(session.expires_at).toISOString(),
          expiredBy: Math.round((Date.now() - session.expires_at) / 1000) + ' seconds'
        });
      }
    } else {
      logger.warn('[Whoami] Session not found for token', {
        tokenPrefix: token.substring(0, 8) + '...',
        tokenLength: token.length,
        isMockToken
      });
    }
  }

  // Match mock server behavior: return unauthenticated state instead of 401
  // This allows the frontend to show login UI instead of blocking
  if (!req.user) {
    logger.info('[Whoami] No user - returning unauthenticated state');
    res.json({
      username: null,
      address: null,
      is_owner: false,
      node_name: config?.server?.name || 'PC2 Node'
    });
    return;
  }

  // Get session first (to verify it exists)
  const session = db.getSession(req.user.session_token);
  if (!session) {
    // Session not found - return unauthenticated state (matching mock server)
    res.json({
      username: null,
      address: null,
      is_owner: false,
      node_name: config?.server?.name || 'PC2 Node'
    });
    return;
  }

  // Get user from database (create if doesn't exist - matching mock server behavior)
  let user = db.getUser(req.user.wallet_address);
  if (!user) {
    // User doesn't exist - create them (matching mock server behavior)
    db.createOrUpdateUser(req.user.wallet_address, req.user.smart_account_address || null);
    user = db.getUser(req.user.wallet_address);
    if (!user) {
      // Still not found after creation - return unauthenticated state
      res.json({
        username: null,
        address: null,
        is_owner: false,
        node_name: config?.server?.name || 'PC2 Node'
      });
      return;
    }
  }

  // Build user info response (Puter API format)
  // CRITICAL: Ensure wallet_address is never null/undefined
  // Normalize to lowercase for consistent KV store lookups
  const walletAddress = (req.user.wallet_address || session.wallet_address)?.toLowerCase();
  if (!walletAddress) {
    logger.error('[Whoami] Wallet address is null/undefined', {
      hasReqUser: !!req.user,
      reqUserWallet: req.user?.wallet_address,
      sessionWallet: session?.wallet_address
    });
    res.json({
      username: null,
      address: null,
      is_owner: false,
      node_name: config?.server?.name || 'PC2 Node'
    });
    return;
  }

  // Get desktop background settings from KV store
  // Default to flint-2.jpg if not set (original default)
  const desktopBgUrl = db.getSetting(`${walletAddress}:user_preferences.desktop_bg_url`) || '/images/flint-2.jpg';
  const desktopBgColor = db.getSetting(`${walletAddress}:user_preferences.desktop_bg_color`) || null;
  const desktopBgFit = db.getSetting(`${walletAddress}:user_preferences.desktop_bg_fit`) || 'cover';
  
  // Get profile picture path from KV store
  const profilePictureUrl = db.getSetting(`${walletAddress}:user_preferences.profile_picture_url`) || null;
  
  // Get display name (per-wallet) - walletAddress is already lowercase
  const displayName = db.getSetting(`user_${walletAddress}_display_name`) || '';

  const userInfo: UserInfo = {
    id: 1,
    uuid: walletAddress,
    username: walletAddress,
    wallet_address: walletAddress,
    smart_account_address: req.user.smart_account_address || session.smart_account_address,
    email: null,
    email_confirmed: true,
    is_temp: false,
    taskbar_items: [],
    desktop_bg_url: desktopBgUrl,
    desktop_bg_color: desktopBgColor,
    desktop_bg_fit: desktopBgFit,
    profile_picture_url: profilePictureUrl,
    display_name: displayName,
    token: req.user.session_token,
    auth_type: (req.user.smart_account_address || session.smart_account_address) ? 'universalx' : 'wallet'
  };

  logger.info('[Whoami] Returning user info', {
    walletAddress,
    hasToken: !!req.user.session_token,
    profile_picture_url: profilePictureUrl,
    desktop_bg_url: desktopBgUrl
  });

  res.json(userInfo);
}
