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
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

/**
 * Authenticate with Particle Auth
 * POST /auth/particle
 */
export function handleParticleAuth(req: Request, res: Response): void {
  const db = (req.app.locals.db as DatabaseManager | undefined);
  const config = (req.app.locals.config as Config | undefined);

  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  if (!config) {
    res.status(500).json({ error: 'Configuration not loaded' });
    return;
  }

  try {
    const body = req.body as AuthRequest;
    const { wallet_address, smart_account_address } = body;

    if (!wallet_address) {
      res.status(400).json({ error: 'Missing wallet_address' });
      return;
    }

    // Normalize wallet address
    const normalizedWallet = wallet_address.toLowerCase();

    // Verify owner (or allow first wallet to become owner)
    const ownerCheck = verifyOwner(normalizedWallet, config);
    if (!ownerCheck.isAuthorized) {
      res.status(403).json({
        error: 'Unauthorized',
        message: ownerCheck.reason || 'Wallet is not authorized'
      });
      return;
    }

    // If no owner is set and this is the first wallet, set it as owner
    if (ownerCheck.isOwner && !config.owner.wallet_address) {
      const setOwnerResult = setOwner(normalizedWallet, config);
      if (setOwnerResult.success) {
        // Update config
        saveConfig({
          owner: {
            wallet_address: normalizedWallet,
            tethered_wallets: []
          }
        });
        logger.info(`👤 First wallet set as owner: ${normalizedWallet.slice(0, 6)}...${normalizedWallet.slice(-4)}`);
      }
    }

    // Create or get user
    db.createOrUpdateUser(normalizedWallet, smart_account_address || null);
    db.updateLastLogin(normalizedWallet);

    // Check for existing valid session
    const existingSession = db.getSessionByWallet(normalizedWallet);
    if (existingSession && existingSession.expires_at > Date.now()) {
      // Return existing session
      const userInfo = buildUserInfo(normalizedWallet, smart_account_address, existingSession.token, config);
      const response: AuthResponse = {
        success: true,
        token: existingSession.token,
        user: userInfo
      };
      res.json(response);
      return;
    }

    // Create new session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionDuration = config.security.session_duration_days * 24 * 60 * 60 * 1000;
    const expiresAt = Date.now() + sessionDuration;

    db.createSession({
      token: sessionToken,
      wallet_address: normalizedWallet,
      smart_account_address: smart_account_address || null,
      created_at: Date.now(),
      expires_at: expiresAt
    });

    logger.info(`✅ Created session for wallet: ${normalizedWallet.slice(0, 6)}...${normalizedWallet.slice(-4)}`);

    // Build user info
    const userInfo = buildUserInfo(normalizedWallet, smart_account_address, sessionToken, config);

    const response: AuthResponse = {
      success: true,
      token: sessionToken,
      user: userInfo
    };

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
