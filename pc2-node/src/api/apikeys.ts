/**
 * API Keys Management Endpoints
 * 
 * Allows users to create and manage API keys for programmatic access.
 * API keys enable AI agents and automation tools to access PC2 node services.
 * 
 * Endpoints:
 * - GET  /api/keys - List all API keys for user
 * - POST /api/keys - Create a new API key
 * - DELETE /api/keys/:keyId - Delete an API key
 * - POST /api/keys/:keyId/revoke - Revoke an API key
 */

import { Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
import { logger } from '../utils/logger.js';
import { randomBytes, createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// Available scopes for API keys
export const API_KEY_SCOPES = {
  read: 'Read files and data',
  write: 'Write files and data',
  execute: 'Execute terminal commands',
  admin: 'Full administrative access'
} as const;

interface CreateKeyRequest {
  name: string;
  scopes?: string[];  // Default: ['read']
  expires_in_days?: number;  // Optional expiration (null = never)
}

/**
 * Generate a secure API key
 * Format: pc2_[random 32 bytes hex]
 */
function generateApiKey(): string {
  const randomPart = randomBytes(32).toString('hex');
  return `pc2_${randomPart}`;
}

/**
 * Hash an API key for storage
 * We never store the raw key, only the hash
 */
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * List all API keys for the authenticated user
 * GET /api/keys
 */
export function handleListApiKeys(req: AuthenticatedRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const db = req.app.locals.db;
    if (!db) {
      res.status(500).json({ error: 'Database not available' });
      return;
    }

    const keys = db.listApiKeys(req.user.wallet_address);
    
    // Don't include key_hash in response
    const sanitizedKeys = keys.map((k: { key_id: string; name: string; scopes: string; created_at: number; expires_at: number | null; last_used_at: number | null; revoked: number }) => ({
      key_id: k.key_id,
      name: k.name,
      scopes: k.scopes.split(','),
      created_at: new Date(k.created_at).toISOString(),
      expires_at: k.expires_at ? new Date(k.expires_at).toISOString() : null,
      last_used_at: k.last_used_at ? new Date(k.last_used_at).toISOString() : null,
      revoked: !!k.revoked
    }));

    res.json({
      success: true,
      keys: sanitizedKeys,
      count: sanitizedKeys.length
    });
  } catch (error: any) {
    logger.error('[API Keys] Error listing keys:', error);
    res.status(500).json({ error: 'Failed to list API keys' });
  }
}

/**
 * Create a new API key
 * POST /api/keys
 * 
 * Request body:
 * {
 *   name: string,           // Required: descriptive name for the key
 *   scopes?: string[],      // Optional: permissions (default: ['read'])
 *   expires_in_days?: number // Optional: expiration in days (null = never)
 * }
 * 
 * Response includes the raw API key ONCE - it cannot be retrieved again!
 */
export function handleCreateApiKey(req: AuthenticatedRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const db = req.app.locals.db;
    if (!db) {
      res.status(500).json({ error: 'Database not available' });
      return;
    }

    const body = req.body as CreateKeyRequest;

    // Validate name
    if (!body.name || typeof body.name !== 'string' || body.name.length < 1) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    if (body.name.length > 100) {
      res.status(400).json({ error: 'Name too long (max 100 characters)' });
      return;
    }

    // Validate and normalize scopes
    const validScopes = Object.keys(API_KEY_SCOPES);
    let scopes = body.scopes || ['read'];
    
    if (!Array.isArray(scopes)) {
      res.status(400).json({ error: 'Scopes must be an array' });
      return;
    }

    // Filter to valid scopes only
    scopes = scopes.filter(s => validScopes.includes(s));
    if (scopes.length === 0) {
      scopes = ['read'];  // Default to read if no valid scopes provided
    }

    // Calculate expiration
    let expiresAt: number | undefined;
    if (body.expires_in_days && typeof body.expires_in_days === 'number' && body.expires_in_days > 0) {
      expiresAt = Date.now() + (body.expires_in_days * 24 * 60 * 60 * 1000);
    }

    // Generate the key
    const keyId = uuidv4();
    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);

    // Store in database
    db.createApiKey(
      keyId,
      keyHash,
      req.user.wallet_address,
      body.name,
      scopes.join(','),
      expiresAt
    );

    logger.info('[API Keys] Created new API key', {
      keyId,
      name: body.name,
      walletPrefix: req.user.wallet_address.substring(0, 10) + '...',
      scopes: scopes.join(','),
      expiresIn: body.expires_in_days ? `${body.expires_in_days} days` : 'never'
    });

    // Return the raw key - this is the ONLY time it's shown!
    res.json({
      success: true,
      key: {
        key_id: keyId,
        api_key: rawKey,  // IMPORTANT: This is only shown once!
        name: body.name,
        scopes,
        created_at: new Date().toISOString(),
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null
      },
      warning: 'Store this API key securely - it cannot be retrieved again!'
    });
  } catch (error: any) {
    logger.error('[API Keys] Error creating key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
}

/**
 * Delete an API key
 * DELETE /api/keys/:keyId
 */
export function handleDeleteApiKey(req: AuthenticatedRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const db = req.app.locals.db;
    if (!db) {
      res.status(500).json({ error: 'Database not available' });
      return;
    }

    const keyId = req.params.keyId;
    if (!keyId) {
      res.status(400).json({ error: 'Key ID is required' });
      return;
    }

    const deleted = db.deleteApiKey(keyId, req.user.wallet_address);

    if (deleted) {
      logger.info('[API Keys] Deleted API key', {
        keyId,
        walletPrefix: req.user.wallet_address.substring(0, 10) + '...'
      });
      res.json({ success: true, message: 'API key deleted' });
    } else {
      res.status(404).json({ error: 'API key not found' });
    }
  } catch (error: any) {
    logger.error('[API Keys] Error deleting key:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
}

/**
 * Revoke an API key (keeps record but marks as invalid)
 * POST /api/keys/:keyId/revoke
 */
export function handleRevokeApiKey(req: AuthenticatedRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const db = req.app.locals.db;
    if (!db) {
      res.status(500).json({ error: 'Database not available' });
      return;
    }

    const keyId = req.params.keyId;
    if (!keyId) {
      res.status(400).json({ error: 'Key ID is required' });
      return;
    }

    const revoked = db.revokeApiKey(keyId, req.user.wallet_address);

    if (revoked) {
      logger.info('[API Keys] Revoked API key', {
        keyId,
        walletPrefix: req.user.wallet_address.substring(0, 10) + '...'
      });
      res.json({ success: true, message: 'API key revoked' });
    } else {
      res.status(404).json({ error: 'API key not found' });
    }
  } catch (error: any) {
    logger.error('[API Keys] Error revoking key:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
}

/**
 * Get available scopes
 * GET /api/keys/scopes
 */
export function handleGetScopes(req: AuthenticatedRequest, res: Response): void {
  res.json({
    scopes: Object.entries(API_KEY_SCOPES).map(([key, description]) => ({
      scope: key,
      description
    }))
  });
}
