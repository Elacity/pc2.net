/**
 * Authentication Endpoints
 * 
 * Handles Particle Auth authentication and session creation
 */

import { Request, Response } from 'express';
import { DatabaseManager } from '../storage/database.js';
import { Config, saveConfig } from '../config/loader.js';
import { verifyOwner, setOwner } from '../auth/owner.js';
import { AuthRequest, AuthResponse, UserInfo } from '../types/api.js';
import { AuthenticatedRequest } from './middleware.js';
import { FilesystemManager } from '../storage/filesystem.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';
import { getNodeConfig, saveNodeConfig } from './setup.js';

/**
 * Authenticate with Particle Auth
 * POST /auth/particle
 */
export async function handleParticleAuth(req: Request, res: Response): Promise<void> {
  const db = (req.app.locals.db as DatabaseManager | undefined);
  const config = (req.app.locals.config as Config | undefined);

  logger.info('🔐 Particle Auth request received', {
    method: req.method,
    path: req.path,
    bodyKeys: Object.keys(req.body || {})
  });

  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  if (!config) {
    res.status(500).json({ error: 'Configuration not loaded' });
    return;
  }

  try {
    const body = req.body as any; // Accept flexible field names from Particle Auth
    // Particle Auth may send: address, walletAddress, eoaAddress, or wallet_address
    const wallet_address = body.wallet_address || body.address || body.walletAddress || body.eoaAddress;
    // Smart account may be: smartAccountAddress or smart_account_address
    const smart_account_address = body.smart_account_address || body.smartAccountAddress;

    logger.info('🔐 Auth request details', {
      hasWalletAddress: !!wallet_address,
      walletAddress: wallet_address ? wallet_address.substring(0, 10) + '...' : null,
      hasSmartAccount: !!smart_account_address,
      bodyKeys: Object.keys(body || {})
    });

    if (!wallet_address) {
      logger.warn('Auth request missing wallet address. Body keys:', Object.keys(body || {}));
      res.status(400).json({ error: 'Missing wallet address', received: Object.keys(body || {}) });
      return;
    }

    // Normalize wallet address
    const normalizedWallet = wallet_address.toLowerCase();

    // ACCESS CONTROL: Check if this wallet is allowed to access this node
    const nodeConfig = getNodeConfig();
    
    // If owner is set, verify this wallet is authorized
    if (nodeConfig.ownerWallet) {
      const isOwner = nodeConfig.ownerWallet === normalizedWallet;
      const allowedWallets = nodeConfig.allowedWallets || [];
      const isAllowed = allowedWallets.some((w: { wallet: string }) => w.wallet === normalizedWallet);
      
      if (!isOwner && !isAllowed) {
        logger.warn('🚫 Access denied for wallet', {
          wallet: normalizedWallet.substring(0, 10) + '...',
          owner: nodeConfig.ownerWallet.substring(0, 10) + '...',
          reason: 'Not owner or in allowed list'
        });
        
        res.status(403).json({
          error: 'access_denied',
          message: 'You are not authorized to access this node. The node owner must add your wallet address to the access list.',
          wallet: normalizedWallet
        });
        return;
      }
      
      logger.info('🔐 User authorized', {
        wallet: normalizedWallet.substring(0, 10) + '...',
        role: isOwner ? 'owner' : 'member'
      });
    } else {
      // No owner set yet - this wallet will claim ownership
      logger.info('🔐 No owner set - first wallet will claim', {
        wallet: normalizedWallet.substring(0, 10) + '...'
      });
      
      // CLAIM OWNERSHIP IMMEDIATELY: First wallet to login becomes owner
      // This must happen BEFORE session checks to ensure it always runs
      try {
        logger.info(`🔐 Claiming ownership with EOA: ${normalizedWallet}`, {
          eoaAddress: normalizedWallet,
          smartAccountAddress: smart_account_address || 'none',
          note: 'Using EOA as owner, not smart account'
        });
        
        // Set owner (EOA) and DELETE the anti-snipe password
        const updatedConfig = { ...nodeConfig };
        updatedConfig.ownerWallet = normalizedWallet; // EOA address
        delete updatedConfig.antiSnipePasswordHash; // PERMANENTLY DELETE
        
        saveNodeConfig(updatedConfig);
        logger.info(`✅ Ownership claimed by EOA ${normalizedWallet}, anti-snipe password deleted`);
      } catch (ownershipError) {
        logger.error('Failed to claim ownership:', ownershipError instanceof Error ? ownershipError.message : 'Unknown');
      }
    }

    // Create or get user
    db.createOrUpdateUser(normalizedWallet, smart_account_address || null);
    db.updateLastLogin(normalizedWallet);

    // Check for existing valid session
    const existingSession = db.getSessionByWallet(normalizedWallet);
    if (existingSession && existingSession.expires_at > Date.now()) {
      // Update smart account if provided and different from stored value
      if (smart_account_address && smart_account_address !== existingSession.smart_account_address) {
        logger.info('🔄 Updating session smart account', {
          wallet: normalizedWallet.substring(0, 10) + '...',
          oldSmartAccount: existingSession.smart_account_address?.substring(0, 10) || 'none',
          newSmartAccount: smart_account_address.substring(0, 10) + '...'
        });
        db.updateSessionSmartAccount(existingSession.token, smart_account_address);
      }
      
      logger.info('✅ Returning existing session', {
        wallet: normalizedWallet.substring(0, 10) + '...',
        tokenPrefix: existingSession.token.substring(0, 8) + '...',
        expiresAt: new Date(existingSession.expires_at).toISOString()
      });
      // Return existing session (with potentially updated smart account)
      const userInfo = buildUserInfo(normalizedWallet, smart_account_address || existingSession.smart_account_address, existingSession.token, config);
      const response: AuthResponse = {
        success: true,
        token: existingSession.token,
        user: userInfo
      };
      res.json(response);
      return;
    } else if (existingSession) {
      logger.info('🔄 Existing session expired, creating new one', {
        wallet: normalizedWallet.substring(0, 10) + '...',
        expiredAt: new Date(existingSession.expires_at).toISOString()
      });
    }

    // Create new session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionDuration = config.security.session_duration_days * 24 * 60 * 60 * 1000;
    const expiresAt = Date.now() + sessionDuration;

    logger.info('🔐 Creating session', {
      wallet: normalizedWallet.substring(0, 10) + '...',
      sessionDurationDays: config.security.session_duration_days,
      sessionDurationMs: sessionDuration,
      expiresAt: new Date(expiresAt).toISOString(),
      expiresIn: Math.round(sessionDuration / 1000 / 60) + ' minutes'
    });

    db.createSession({
      token: sessionToken,
      wallet_address: normalizedWallet,
      smart_account_address: smart_account_address || null,
      created_at: Date.now(),
      expires_at: expiresAt
    });

    // Ensure user's home directory structure exists (matching mock server behavior)
    const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
    if (filesystem) {
      try {
        // Create user's root directory
        const userRoot = `/${normalizedWallet}`;
        try {
          await filesystem.createDirectory(userRoot, normalizedWallet);
        } catch (error) {
          // Directory might already exist, that's fine
          logger.debug(`User root ${userRoot} already exists`);
        }
        
        // Create standard directories (Desktop, Documents, Public, Pictures, Videos, Trash)
        const standardDirs = ['Desktop', 'Documents', 'Public', 'Pictures', 'Videos', 'Trash'];
        for (const dirName of standardDirs) {
          const dirPath = `${userRoot}/${dirName}`;
          try {
            await filesystem.createDirectory(dirPath, normalizedWallet);
            logger.info(`✅ Created user directory: ${dirPath}`);
          } catch (error) {
            // Directory might already exist, that's fine
            logger.debug(`Directory ${dirPath} already exists or creation failed:`, error instanceof Error ? error.message : 'Unknown');
          }
        }
      } catch (error) {
        // Log but don't fail auth if directory creation fails
        logger.warn('Failed to create user home directory structure:', error instanceof Error ? error.message : 'Unknown');
      }
    } else {
      logger.warn('Filesystem not available, skipping user home directory creation');
    }

    logger.info(`✅ Created session for wallet: ${normalizedWallet.slice(0, 6)}...${normalizedWallet.slice(-4)}`, {
      tokenPrefix: sessionToken.substring(0, 8) + '...',
      tokenLength: sessionToken.length,
      expiresAt: new Date(expiresAt).toISOString()
    });

    // Build user info
    const userInfo = buildUserInfo(normalizedWallet, smart_account_address, sessionToken, config);

    const response: AuthResponse = {
      success: true,
      token: sessionToken,
      user: userInfo
    };

    // Set CORS headers (matching mock server)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    res.json(response);
  } catch (error) {
    logger.error('Auth error:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({
      error: 'Authentication failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Grant user app access
 * POST /auth/grant-user-app
 */
export function handleGrantUserApp(req: AuthenticatedRequest, res: Response): void {
  // This endpoint is used by the frontend to grant app permissions
  // For now, just acknowledge the request
  res.json({ success: true, granted: true });
}

/**
 * GET /auth/get-user-app-token
 * Returns a token for app access (used by SDK)
 */
export function handleGetUserAppToken(req: AuthenticatedRequest, res: Response): void {
  // Return the user's session token as the app token
  // The SDK uses this to authenticate app requests
  const token = req.user?.session_token || '';
  res.json({ success: true, token });
}

/**
 * Build user info response
 */
function buildUserInfo(
  walletAddress: string,
  smartAccountAddress: string | null | undefined,
  sessionToken: string,
  config: Config
): UserInfo {
  return {
    id: 1,
    uuid: walletAddress,
    username: walletAddress,
    wallet_address: walletAddress,
    smart_account_address: smartAccountAddress || null,
    email: null,
    email_confirmed: true,
    is_temp: false,
    taskbar_items: [],
    desktop_bg_url: '/images/flint-2.jpg',
    desktop_bg_color: null,
    desktop_bg_fit: 'cover',
    token: sessionToken,
    auth_type: smartAccountAddress ? 'universalx' : 'wallet'
  };
}

