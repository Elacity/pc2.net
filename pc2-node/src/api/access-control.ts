/**
 * Access Control API Routes
 * 
 * Handles anti-snipe password verification and multi-user access control.
 * The anti-snipe password protects the node until the owner claims it with their wallet.
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { getNodeConfig, saveNodeConfig } from './setup.js';
import { AuthenticatedRequest } from './middleware.js';

const router = Router();

// In-memory session store (simple for now, could use Redis later)
const antiSnipeSessions: Map<string, { createdAt: number; expiresAt: number }> = new Map();

// Session expiry: 10 minutes
const SESSION_EXPIRY_MS = 10 * 60 * 1000;

// Rate limiting for password attempts
const passwordAttempts: Map<string, { count: number; lastAttempt: number }> = new Map();
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 60 * 1000; // 1 minute

// Re-export for convenience
export { getNodeConfig, saveNodeConfig };

/**
 * Generate a session token
 */
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verify an anti-snipe session token
 */
export function verifyAntiSnipeSession(token: string): boolean {
  if (!token) return false;
  
  const session = antiSnipeSessions.get(token);
  if (!session) return false;
  
  if (Date.now() > session.expiresAt) {
    antiSnipeSessions.delete(token);
    return false;
  }
  
  return true;
}

/**
 * Clean up expired sessions periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of antiSnipeSessions.entries()) {
    if (now > session.expiresAt) {
      antiSnipeSessions.delete(token);
    }
  }
}, 60 * 1000); // Clean up every minute

/**
 * Check if rate limited
 */
function isRateLimited(ip: string): boolean {
  const attempts = passwordAttempts.get(ip);
  if (!attempts) return false;
  
  const now = Date.now();
  if (now - attempts.lastAttempt > ATTEMPT_WINDOW_MS) {
    passwordAttempts.delete(ip);
    return false;
  }
  
  return attempts.count >= MAX_ATTEMPTS;
}

/**
 * Record a password attempt
 */
function recordAttempt(ip: string): void {
  const now = Date.now();
  const attempts = passwordAttempts.get(ip);
  
  if (!attempts || now - attempts.lastAttempt > ATTEMPT_WINDOW_MS) {
    passwordAttempts.set(ip, { count: 1, lastAttempt: now });
  } else {
    attempts.count++;
    attempts.lastAttempt = now;
  }
}

/**
 * Check access status
 * GET /api/access/status
 * 
 * Returns whether the node requires anti-snipe password and if owner is set.
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    const config = getNodeConfig();
    const hasOwner = !!config.ownerWallet;
    const hasAntiSnipePassword = !!config.antiSnipePasswordHash;
    
    // Check if user has valid session
    const sessionToken = req.cookies?.antiSnipeSession;
    const hasValidSession = sessionToken ? verifyAntiSnipeSession(sessionToken) : false;
    
    res.json({
      hasOwner,
      ownerWallet: config.ownerWallet || null,
      hasAntiSnipePassword,
      hasValidSession,
      requiresPassword: hasAntiSnipePassword && !hasOwner && !hasValidSession,
    });
  } catch (error) {
    logger.error('[AccessControl] Status check error:', error);
    res.status(500).json({ error: 'Failed to check access status' });
  }
});

/**
 * Verify anti-snipe password
 * POST /api/access/verify-password
 * 
 * Verifies the anti-snipe password and returns a session token.
 */
router.post('/verify-password', async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    
    // Rate limiting
    if (isRateLimited(ip)) {
      return res.status(429).json({ 
        success: false, 
        error: 'Too many attempts. Please wait a minute and try again.' 
      });
    }
    
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Password is required' });
    }
    
    const config = getNodeConfig();
    
    // If owner is already set, no password needed
    if (config.ownerWallet) {
      return res.json({ success: true, message: 'Owner already set, no password needed' });
    }
    
    // If no password hash set, something is wrong
    if (!config.antiSnipePasswordHash) {
      return res.status(400).json({ success: false, error: 'No password configured' });
    }
    
    // Verify password
    const isValid = await bcrypt.compare(password, config.antiSnipePasswordHash);
    
    if (!isValid) {
      recordAttempt(ip);
      return res.status(401).json({ success: false, error: 'Invalid password' });
    }
    
    // Generate session token
    const sessionToken = generateSessionToken();
    const now = Date.now();
    
    antiSnipeSessions.set(sessionToken, {
      createdAt: now,
      expiresAt: now + SESSION_EXPIRY_MS,
    });
    
    // Set cookie
    res.cookie('antiSnipeSession', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: SESSION_EXPIRY_MS,
    });
    
    logger.info('[AccessControl] Anti-snipe password verified, session created');
    
    res.json({ success: true });
  } catch (error) {
    logger.error('[AccessControl] Password verification error:', error);
    res.status(500).json({ success: false, error: 'Failed to verify password' });
  }
});

/**
 * Set owner wallet (called after first successful wallet login)
 * POST /api/access/claim-ownership
 * 
 * This should only be called internally by the auth flow.
 */
router.post('/claim-ownership', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress || typeof walletAddress !== 'string') {
      return res.status(400).json({ success: false, error: 'Wallet address is required' });
    }
    
    const config = getNodeConfig();
    
    // If owner is already set, reject
    if (config.ownerWallet) {
      return res.status(403).json({ 
        success: false, 
        error: 'Owner already set. This node is already claimed.' 
      });
    }
    
    // Set owner and DELETE the anti-snipe password hash
    const updatedConfig = { ...config };
    updatedConfig.ownerWallet = walletAddress.toLowerCase();
    delete updatedConfig.antiSnipePasswordHash; // PERMANENTLY DELETE
    
    saveNodeConfig(updatedConfig);
    
    // Clear all anti-snipe sessions
    antiSnipeSessions.clear();
    
    logger.info(`[AccessControl] Owner set to ${walletAddress}, anti-snipe password deleted`);
    
    res.json({ 
      success: true, 
      message: 'Ownership claimed successfully',
      ownerWallet: updatedConfig.ownerWallet,
    });
  } catch (error) {
    logger.error('[AccessControl] Claim ownership error:', error);
    res.status(500).json({ success: false, error: 'Failed to claim ownership' });
  }
});

/**
 * Check if a wallet is allowed to access this node
 * GET /api/access/check?wallet=0x...
 */
router.get('/check', (req: Request, res: Response) => {
  try {
    const wallet = (req.query.wallet as string)?.toLowerCase();
    
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }
    
    const config = getNodeConfig();
    
    // If no owner set, anyone can claim (after anti-snipe password)
    if (!config.ownerWallet) {
      return res.json({ 
        allowed: true, 
        role: 'pending_owner',
        message: 'No owner set yet. First login will claim ownership.',
      });
    }
    
    // Check if this is the owner
    if (config.ownerWallet === wallet) {
      return res.json({ allowed: true, role: 'owner' });
    }
    
    // Check allowed wallets list
    const allowedWallets = config.allowedWallets || [];
    const entry = allowedWallets.find((w: { wallet: string }) => w.wallet === wallet);
    
    if (entry) {
      return res.json({ allowed: true, role: entry.role });
    }
    
    res.json({ 
      allowed: false, 
      role: null,
      message: 'You are not authorized to access this node.',
    });
  } catch (error) {
    logger.error('[AccessControl] Check access error:', error);
    res.status(500).json({ error: 'Failed to check access' });
  }
});

/**
 * List all allowed wallets
 * GET /api/access/list
 * 
 * Requires owner or admin authentication.
 */
router.get('/list', (req: Request, res: Response) => {
  try {
    const config = getNodeConfig();
    
    // Return owner info and allowed wallets
    res.json({
      success: true,
      ownerWallet: config.ownerWallet || null,
      wallets: config.allowedWallets || [],
    });
  } catch (error) {
    logger.error('[AccessControl] List wallets error:', error);
    res.status(500).json({ success: false, error: 'Failed to list wallets' });
  }
});

/**
 * Add a wallet to the allowed list
 * POST /api/access/add
 * 
 * Body: { wallet: string, role: 'admin' | 'member' }
 */
router.post('/add', (req: AuthenticatedRequest, res: Response) => {
  try {
    const { wallet, role } = req.body;
    
    // Check if user is authenticated
    if (!req.user?.wallet_address) {
      return res.status(401).json({ success: false, error: 'You must be logged in to add wallets' });
    }
    
    const config = getNodeConfig();
    const userWallet = req.user.wallet_address.toLowerCase();
    
    // Check if user is owner or admin
    const isOwner = config.ownerWallet === userWallet;
    const isAdmin = config.allowedWallets?.some((w: { wallet: string; role: string }) => 
      w.wallet === userWallet && w.role === 'admin'
    );
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Only the owner or admins can add wallets' });
    }
    
    if (!wallet || typeof wallet !== 'string') {
      return res.status(400).json({ success: false, error: 'Wallet address is required' });
    }
    
    const normalizedWallet = wallet.toLowerCase();
    
    // Validate wallet format
    if (!/^0x[a-f0-9]{40}$/i.test(normalizedWallet)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }
    
    // Validate role
    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Role must be admin or member' });
    }
    
    // Cannot add owner wallet again
    if (config.ownerWallet === normalizedWallet) {
      return res.status(400).json({ success: false, error: 'Cannot add owner wallet' });
    }
    
    // Initialize allowedWallets if needed
    if (!config.allowedWallets) {
      config.allowedWallets = [];
    }
    
    // Check if already exists
    const existing = config.allowedWallets.find((w: { wallet: string }) => w.wallet === normalizedWallet);
    if (existing) {
      // Update role
      existing.role = role;
      existing.updatedAt = new Date().toISOString();
    } else {
      // Add new
      config.allowedWallets.push({
        wallet: normalizedWallet,
        role,
        addedAt: new Date().toISOString(),
      });
    }
    
    saveNodeConfig(config);
    
    logger.info(`[AccessControl] Added wallet ${normalizedWallet} with role ${role}`);
    
    res.json({ success: true, wallet: normalizedWallet, role });
  } catch (error) {
    logger.error('[AccessControl] Add wallet error:', error);
    res.status(500).json({ success: false, error: 'Failed to add wallet' });
  }
});

/**
 * Remove a wallet from the allowed list
 * DELETE /api/access/remove
 * 
 * Body: { wallet: string }
 */
router.delete('/remove', (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is authenticated
    if (!req.user?.wallet_address) {
      return res.status(401).json({ success: false, error: 'You must be logged in to remove wallets' });
    }
    
    const config = getNodeConfig();
    const userWallet = req.user.wallet_address.toLowerCase();
    
    // Check if user is owner or admin
    const isOwner = config.ownerWallet === userWallet;
    const isAdmin = config.allowedWallets?.some((w: { wallet: string; role: string }) => 
      w.wallet === userWallet && w.role === 'admin'
    );
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Only the owner or admins can remove wallets' });
    }
    
    const { wallet } = req.body;
    
    if (!wallet || typeof wallet !== 'string') {
      return res.status(400).json({ success: false, error: 'Wallet address is required' });
    }
    
    const normalizedWallet = wallet.toLowerCase();
    
    // Cannot remove owner
    if (config.ownerWallet === normalizedWallet) {
      return res.status(400).json({ success: false, error: 'Cannot remove owner wallet' });
    }
    
    if (!config.allowedWallets || config.allowedWallets.length === 0) {
      return res.status(404).json({ success: false, error: 'Wallet not found' });
    }
    
    const initialLength = config.allowedWallets.length;
    config.allowedWallets = config.allowedWallets.filter((w: { wallet: string }) => w.wallet !== normalizedWallet);
    
    if (config.allowedWallets.length === initialLength) {
      return res.status(404).json({ success: false, error: 'Wallet not found' });
    }
    
    saveNodeConfig(config);
    
    logger.info(`[AccessControl] Removed wallet ${normalizedWallet}`);
    
    res.json({ success: true, wallet: normalizedWallet });
  } catch (error) {
    logger.error('[AccessControl] Remove wallet error:', error);
    res.status(500).json({ success: false, error: 'Failed to remove wallet' });
  }
});

export default router;
