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

export default router;
