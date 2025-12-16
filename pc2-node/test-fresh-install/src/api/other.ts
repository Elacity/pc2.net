/**
 * Other API Endpoints
 * 
 * Additional endpoints: /sign, /version, /os/user, /kv, etc.
 */

import { Request, Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
import { SignRequest, SignResponse } from '../types/api.js';
import { FilesystemManager } from '../storage/filesystem.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

/**
 * Sign files for app access
 * POST /sign
 */
export function handleSign(req: AuthenticatedRequest, res: Response): void {
  const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
  const body = req.body as SignRequest;

  if (!filesystem) {
    res.status(500).json({ error: 'Filesystem not initialized' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!body.items || !Array.isArray(body.items)) {
    res.status(400).json({ error: 'Missing or invalid items array' });
    return;
  }

  try {
    const signatures: SignResponse['signatures'] = [];

    for (const item of body.items) {
      if (!item.uid && !item.path) {
        // Skip invalid items (don't add empty signature)
        continue;
      }

      // Find file by path or UID
      let filePath: string | null = null;
      
      if (item.path) {
        filePath = item.path;
      } else if (item.uid) {
        // Convert UUID back to path (uuid-/path/to/file -> /path/to/file)
        const uuidPath = item.uid.replace(/^uuid-/, '');
        filePath = '/' + uuidPath.replace(/-/g, '/');
      }
      
      if (!filePath) {
        // Skip invalid items
        continue;
      }

      const metadata = filesystem.getFileMetadata(filePath, req.user.wallet_address);
      if (!metadata) {
        // Skip if file not found (don't add empty signature)
        continue;
      }

      // Generate signature (simplified - in production, use proper signing)
      const expires = Math.ceil(Date.now() / 1000) + 999999999; // Very long expiry
      const action = item.action || 'read';
      const signature = `sig-${filePath}-${action}-${expires}`;

      // Determine base URL
      const origin = req.headers.origin || req.headers.host;
      const isHttps = origin && typeof origin === 'string' && origin.startsWith('https://');
      const baseUrl = isHttps 
        ? `https://${origin.replace(/^https?:\/\//, '').split('/')[0]}`
        : `http://${req.headers.host || 'localhost:4200'}`;

      const fileUid = `uuid-${filePath.replace(/\//g, '-')}`;

      signatures.push({
        uid: fileUid,
        expires: expires,
        signature: signature,
        url: `${baseUrl}/file?uid=${fileUid}&expires=${expires}&signature=${signature}`,
        read_url: `${baseUrl}/file?uid=${fileUid}&expires=${expires}&signature=${signature}`,
        write_url: `${baseUrl}/writeFile?uid=${fileUid}&expires=${expires}&signature=${signature}`,
        metadata_url: `${baseUrl}/itemMetadata?uid=${fileUid}&expires=${expires}&signature=${signature}`,
        fsentry_type: metadata.mime_type || 'application/octet-stream',
        fsentry_is_dir: metadata.is_dir,
        fsentry_name: metadata.path.split('/').pop() || '',
        fsentry_size: metadata.size,
        fsentry_modified: metadata.updated_at,
        fsentry_created: metadata.created_at,
        path: filePath
      });
    }

    // Generate app token
    const appToken = `token-${req.user.wallet_address}-${Date.now()}`;

    const response: SignResponse = {
      token: appToken,
      signatures: signatures
    };

    res.json(response);
  } catch (error) {
    logger.error('Sign error:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({
      error: 'Failed to sign files',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get server version
 * GET /version
 */
export function handleVersion(req: Request, res: Response): void {
  res.json({
    version: '2.5.1',
    server: 'pc2-node',
    deployed: new Date().toISOString()
  });
}

/**
 * Get OS user info (alias for /whoami)
 * GET /os/user
 */
export function handleOSUser(req: AuthenticatedRequest, res: Response): void {
  // Reuse whoami handler
  const { handleWhoami } = require('./whoami.js');
  handleWhoami(req, res);
}

/**
 * Key-value store operations
 * GET/POST/DELETE /kv/:key
 */
export function handleKV(req: AuthenticatedRequest, res: Response): void {
  const db = (req.app.locals.db as any);
  const key = req.params.key || req.path.replace('/kv/', '').replace('/api/kv/', '');

  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const kvKey = `${req.user.wallet_address}:${key}`;

    if (req.method === 'GET') {
      const value = db.getSetting(kvKey);
      if (value === null) {
        res.send('null');
      } else if (typeof value === 'string') {
        res.send(value);
      } else {
        res.json(value);
      }
    } else if (req.method === 'POST') {
      const value = req.body.value !== undefined ? req.body.value : req.body;
      db.setSetting(kvKey, typeof value === 'string' ? value : JSON.stringify(value));
      res.json({ success: true });
    } else if (req.method === 'DELETE') {
      db.deleteSetting(kvKey);
      res.json({ success: true });
    }
  } catch (error) {
    logger.error('KV error:', error instanceof Error ? error.message : 'Unknown error', { key });
    res.status(500).json({
      error: 'KV operation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Record app open
 * POST /rao
 */
export function handleRAO(req: Request, res: Response): void {
  // Just acknowledge - we don't need to track app opens
  res.json({ code: 'ok', message: 'ok' });
}

/**
 * Contact form
 * POST /contactUs
 */
export function handleContactUs(req: Request, res: Response): void {
  // Just acknowledge
  res.json({ success: true });
}
