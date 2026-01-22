/**
 * Boson API Routes
 * 
 * API endpoints for PC2 node identity and connectivity management.
 */

import { Router, Request, Response } from 'express';
import { BosonService } from '../services/boson/index.js';

const router = Router();

/**
 * Get Boson service from app locals
 */
function getBosonService(req: Request): BosonService | null {
  return req.app.locals.bosonService || null;
}

/**
 * GET /api/boson/status
 * Get full Boson service status
 */
router.get('/status', (req: Request, res: Response) => {
  const bosonService = getBosonService(req);
  
  if (!bosonService) {
    return res.status(503).json({
      error: 'Boson service not available',
      initialized: false,
    });
  }

  const status = bosonService.getStatus();
  res.json(status);
});

/**
 * GET /api/boson/identity
 * Get node identity info
 */
router.get('/identity', (req: Request, res: Response) => {
  const bosonService = getBosonService(req);
  
  if (!bosonService) {
    return res.status(503).json({
      error: 'Boson service not available',
    });
  }

  const identityService = bosonService.getIdentityService();
  const info = identityService.getPublicInfo();
  
  if (!info) {
    return res.status(404).json({
      error: 'Identity not initialized',
    });
  }

  res.json({
    nodeId: info.nodeId,
    did: info.did,
    createdAt: info.createdAt,
    isNew: bosonService.isFirstRun(),
  });
});

/**
 * POST /api/boson/register
 * Register a username
 */
router.post('/register', async (req: Request, res: Response) => {
  const bosonService = getBosonService(req);
  
  if (!bosonService) {
    return res.status(503).json({
      error: 'Boson service not available',
    });
  }

  const { username } = req.body;
  
  if (!username) {
    return res.status(400).json({
      error: 'Username is required',
    });
  }

  const result = await bosonService.registerUsername(username);
  
  if (result.success) {
    res.json({
      success: true,
      username: username.toLowerCase(),
      publicUrl: result.publicUrl,
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error,
    });
  }
});

/**
 * GET /api/boson/username
 * Get current username info
 */
router.get('/username', (req: Request, res: Response) => {
  const bosonService = getBosonService(req);
  
  if (!bosonService) {
    return res.status(503).json({
      error: 'Boson service not available',
    });
  }

  const usernameService = bosonService.getUsernameService();
  const info = usernameService.getInfo();
  
  res.json({
    registered: usernameService.hasUsername(),
    username: info.username,
    publicUrl: info.publicUrl,
    registeredAt: info.registeredAt,
  });
});

/**
 * GET /api/boson/lookup/:username
 * Look up a username
 */
router.get('/lookup/:username', async (req: Request, res: Response) => {
  const bosonService = getBosonService(req);
  
  if (!bosonService) {
    return res.status(503).json({
      error: 'Boson service not available',
    });
  }

  const { username } = req.params;
  const usernameService = bosonService.getUsernameService();
  const info = await usernameService.lookup(username);
  
  if (info) {
    res.json(info);
  } else {
    res.status(404).json({
      error: 'Username not found',
    });
  }
});

/**
 * GET /api/boson/connectivity
 * Get connectivity status
 */
router.get('/connectivity', (req: Request, res: Response) => {
  const bosonService = getBosonService(req);
  
  if (!bosonService) {
    return res.status(503).json({
      error: 'Boson service not available',
    });
  }

  const connectivityService = bosonService.getConnectivityService();
  const status = connectivityService.getStatus();
  
  res.json(status);
});

/**
 * POST /api/boson/reconnect
 * Force reconnection to super node
 */
router.post('/reconnect', async (req: Request, res: Response) => {
  const bosonService = getBosonService(req);
  
  if (!bosonService) {
    return res.status(503).json({
      error: 'Boson service not available',
    });
  }

  const connectivityService = bosonService.getConnectivityService();
  const success = await connectivityService.reconnect();
  
  res.json({
    success,
    status: connectivityService.getStatus(),
  });
});

/**
 * POST /api/boson/validate-username
 * Validate a username format
 */
router.post('/validate-username', (req: Request, res: Response) => {
  const bosonService = getBosonService(req);
  
  if (!bosonService) {
    return res.status(503).json({
      error: 'Boson service not available',
    });
  }

  const { username } = req.body;
  
  if (!username) {
    return res.status(400).json({
      valid: false,
      error: 'Username is required',
    });
  }

  const usernameService = bosonService.getUsernameService();
  const validation = usernameService.validateUsername(username);
  
  res.json(validation);
});

/**
 * GET /api/boson/check-available/:username
 * Check if a username is available
 */
router.get('/check-available/:username', async (req: Request, res: Response) => {
  const bosonService = getBosonService(req);
  
  if (!bosonService) {
    return res.status(503).json({
      error: 'Boson service not available',
    });
  }

  const { username } = req.params;
  const usernameService = bosonService.getUsernameService();
  
  // First validate the format
  const validation = usernameService.validateUsername(username);
  if (!validation.valid) {
    return res.json({
      available: false,
      error: validation.error,
    });
  }
  
  // Then check availability
  const available = await usernameService.isAvailable(username);
  
  res.json({
    available,
    username: username.toLowerCase(),
  });
});

// Rate limiting for mnemonic decryption (simple in-memory implementation)
const decryptAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_DECRYPT_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute

function checkRateLimit(walletAddress: string): { allowed: boolean; remainingAttempts: number; resetIn: number } {
  const now = Date.now();
  const key = walletAddress.toLowerCase();
  const record = decryptAttempts.get(key);
  
  if (!record || now > record.resetAt) {
    // New window
    decryptAttempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remainingAttempts: MAX_DECRYPT_ATTEMPTS - 1, resetIn: RATE_LIMIT_WINDOW_MS };
  }
  
  if (record.count >= MAX_DECRYPT_ATTEMPTS) {
    return { allowed: false, remainingAttempts: 0, resetIn: record.resetAt - now };
  }
  
  record.count++;
  return { allowed: true, remainingAttempts: MAX_DECRYPT_ATTEMPTS - record.count, resetIn: record.resetAt - now };
}

/**
 * POST /api/boson/mnemonic-sign-message
 * Get the message to sign for mnemonic operations
 */
router.post('/mnemonic-sign-message', (req: Request, res: Response) => {
  const bosonService = getBosonService(req);
  
  if (!bosonService) {
    return res.status(503).json({
      error: 'Boson service not available',
    });
  }

  const { walletAddress } = req.body;
  
  if (!walletAddress || typeof walletAddress !== 'string') {
    return res.status(400).json({
      error: 'Wallet address is required',
    });
  }

  const message = bosonService.getMnemonicSignMessage(walletAddress);
  
  res.json({ message });
});

/**
 * POST /api/boson/decrypt-mnemonic
 * Decrypt and return the mnemonic (rate limited)
 */
router.post('/decrypt-mnemonic', (req: Request, res: Response) => {
  const bosonService = getBosonService(req);
  
  if (!bosonService) {
    return res.status(503).json({
      error: 'Boson service not available',
    });
  }

  const { signature, walletAddress } = req.body;
  
  if (!signature || typeof signature !== 'string') {
    return res.status(400).json({
      error: 'Signature is required',
    });
  }
  
  if (!walletAddress || typeof walletAddress !== 'string') {
    return res.status(400).json({
      error: 'Wallet address is required',
    });
  }
  
  // Check rate limit
  const rateLimit = checkRateLimit(walletAddress);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: 'Too many attempts. Please try again later.',
      resetIn: Math.ceil(rateLimit.resetIn / 1000),
    });
  }
  
  // Check if mnemonic backup exists
  if (!bosonService.hasMnemonicBackup()) {
    return res.status(404).json({
      error: 'No mnemonic backup found. The mnemonic was not encrypted during setup.',
    });
  }
  
  // Try to decrypt
  const mnemonic = bosonService.decryptMnemonic(signature);
  
  if (!mnemonic) {
    return res.status(401).json({
      error: 'Decryption failed. Invalid signature or wrong wallet.',
      remainingAttempts: rateLimit.remainingAttempts,
    });
  }
  
  // Success - return mnemonic (frontend should display briefly then clear)
  res.json({
    mnemonic,
    expiresIn: 30, // Frontend should hide after 30 seconds
    warning: 'This phrase will only be displayed once. Store it securely.',
  });
});

/**
 * GET /api/boson/mnemonic-status
 * Check if mnemonic backup is available
 */
router.get('/mnemonic-status', (req: Request, res: Response) => {
  const bosonService = getBosonService(req);
  
  if (!bosonService) {
    return res.status(503).json({
      error: 'Boson service not available',
    });
  }

  const hasBackup = bosonService.hasMnemonicBackup();
  const identityService = bosonService.getIdentityService();
  const identity = identityService.getIdentity();
  
  res.json({
    hasBackup,
    encryptedWith: hasBackup && identity?.encryptedMnemonic?.address 
      ? identity.encryptedMnemonic.address 
      : null,
    encryptedAt: hasBackup && identity?.encryptedMnemonic?.timestamp
      ? new Date(identity.encryptedMnemonic.timestamp).toISOString()
      : null,
  });
});

/**
 * GET /api/boson/full-identity
 * Get complete identity info for settings panel
 */
router.get('/full-identity', (req: Request, res: Response) => {
  const bosonService = getBosonService(req);
  
  if (!bosonService) {
    return res.status(503).json({
      error: 'Boson service not available',
    });
  }

  const identityService = bosonService.getIdentityService();
  const usernameService = bosonService.getUsernameService();
  const info = identityService.getPublicInfo();
  
  if (!info) {
    return res.status(404).json({
      error: 'Identity not initialized',
    });
  }

  const usernameInfo = usernameService.getInfo();

  res.json({
    nodeId: info.nodeId,
    did: info.did,
    createdAt: info.createdAt,
    username: usernameInfo.username,
    publicUrl: usernameInfo.publicUrl,
    hasMnemonicBackup: bosonService.hasMnemonicBackup(),
    hasAdminWallet: bosonService.hasAdminWallet(),
    adminWalletAddress: bosonService.getAdminWalletAddress(),
  });
});

/**
 * POST /api/boson/secure-mnemonic
 * Encrypt mnemonic on first login and set admin wallet
 * Called automatically after first Particle login
 */
router.post('/secure-mnemonic', async (req: Request, res: Response) => {
  const bosonService = getBosonService(req);
  
  if (!bosonService) {
    return res.status(503).json({
      error: 'Boson service not available',
    });
  }

  const { signature, walletAddress } = req.body;
  
  if (!signature || typeof signature !== 'string') {
    return res.status(400).json({
      error: 'Signature is required',
    });
  }
  
  if (!walletAddress || typeof walletAddress !== 'string') {
    return res.status(400).json({
      error: 'Wallet address is required',
    });
  }

  // Check if already secured
  if (bosonService.hasMnemonicBackup()) {
    return res.json({
      success: true,
      alreadySecured: true,
      message: 'Mnemonic already encrypted',
    });
  }

  // Check if mnemonic is still in memory (first run only)
  const mnemonic = bosonService.getFirstRunMnemonic();
  if (!mnemonic) {
    return res.status(400).json({
      error: 'Mnemonic not available. Node may have been restarted after setup.',
      requiresRecovery: true,
    });
  }

  try {
    // Encrypt and store mnemonic
    await bosonService.encryptAndStoreMnemonic(signature, walletAddress);
    
    // Set this wallet as admin
    bosonService.setAdminWallet(walletAddress);
    
    // Clear mnemonic from memory
    bosonService.clearMnemonic();
    
    res.json({
      success: true,
      alreadySecured: false,
      message: 'Mnemonic encrypted and admin wallet set',
      adminWallet: walletAddress,
    });
  } catch (error) {
    console.error('[Boson API] Failed to secure mnemonic:', error);
    res.status(500).json({
      error: 'Failed to encrypt mnemonic',
    });
  }
});

/**
 * GET /api/boson/needs-securing
 * Check if mnemonic needs to be secured (for first login flow)
 */
router.get('/needs-securing', (req: Request, res: Response) => {
  const bosonService = getBosonService(req);
  
  if (!bosonService) {
    return res.status(503).json({
      error: 'Boson service not available',
    });
  }

  const hasMnemonicBackup = bosonService.hasMnemonicBackup();
  const hasAdminWallet = bosonService.hasAdminWallet();
  const hasMnemonicInMemory = !!bosonService.getFirstRunMnemonic();

  res.json({
    needsSecuring: !hasMnemonicBackup && hasMnemonicInMemory,
    hasMnemonicBackup,
    hasAdminWallet,
    hasMnemonicInMemory,
  });
});

/**
 * POST /api/boson/encrypt-mnemonic
 * Encrypt a user-provided mnemonic (for when it's not in memory)
 * Used when user saved their mnemonic during setup and wants to encrypt it later
 */
router.post('/encrypt-mnemonic', async (req: Request, res: Response) => {
  const bosonService = getBosonService(req);
  
  if (!bosonService) {
    return res.status(503).json({
      error: 'Boson service not available',
    });
  }

  const { mnemonic, signature, walletAddress } = req.body;
  
  if (!mnemonic || typeof mnemonic !== 'string') {
    return res.status(400).json({
      error: 'Mnemonic is required',
    });
  }
  
  if (!signature || typeof signature !== 'string') {
    return res.status(400).json({
      error: 'Signature is required',
    });
  }
  
  if (!walletAddress || typeof walletAddress !== 'string') {
    return res.status(400).json({
      error: 'Wallet address is required',
    });
  }

  // Validate mnemonic format (24 words)
  const words = mnemonic.trim().toLowerCase().split(/\s+/);
  if (words.length !== 24) {
    return res.status(400).json({
      error: 'Invalid mnemonic: must be exactly 24 words',
    });
  }

  // Check if already has a backup
  if (bosonService.hasMnemonicBackup()) {
    return res.json({
      success: true,
      alreadySecured: true,
      message: 'Mnemonic already encrypted',
    });
  }

  try {
    // Use the identity service to encrypt the provided mnemonic directly
    const identityService = bosonService.getIdentityService();
    await identityService.encryptAndStoreMnemonicDirect(mnemonic.trim().toLowerCase(), signature, walletAddress);
    
    // Set this wallet as admin
    bosonService.setAdminWallet(walletAddress);
    
    res.json({
      success: true,
      alreadySecured: false,
      message: 'Mnemonic encrypted successfully',
      adminWallet: walletAddress,
    });
  } catch (error) {
    console.error('[Boson API] Failed to encrypt mnemonic:', error);
    res.status(500).json({
      error: 'Failed to encrypt mnemonic',
    });
  }
});

export default router;
