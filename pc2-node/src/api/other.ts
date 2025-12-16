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

/**
 * Driver calls (for app lookups and KV store)
 * POST /drivers/call
 */
export function handleDriversCall(req: AuthenticatedRequest, res: Response): void {
  const db = (req.app.locals.db as any);
  // Handle both parsed object and string body (for text/plain;actually=json)
  let body = req.body as any;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
      (req as any).body = body; // Update req.body for consistency
    } catch (e) {
      logger.error('[Drivers] Failed to parse string body:', e);
      body = {};
    }
  }

  if (!req.user) {
    logger.warn('[Drivers] Unauthorized request - no user');
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  // Log request for debugging - check raw body too
  const rawBody = (req as any).rawBody;
  // Use console.log to ensure visibility in terminal
  console.log(`[Drivers] ========== REQUEST RECEIVED ==========`);
  console.log(`[Drivers] Request from ${req.user.wallet_address}`);
  console.log(`[Drivers] Content-Type: ${req.get('Content-Type')}`);
  console.log(`[Drivers] Raw body (captured): ${rawBody ? rawBody.substring(0, 500) : 'NOT CAPTURED'} (length: ${rawBody?.length || 0})`);
  console.log(`[Drivers] Body type: ${typeof body}, is object: ${typeof body === 'object' && body !== null}`);
  console.log(`[Drivers] Body keys: ${body && typeof body === 'object' ? Object.keys(body).join(', ') : 'N/A'}`);
  console.log(`[Drivers] interface=${body?.interface || 'missing'}, driver=${body?.driver || 'missing'}, method=${body?.method || 'missing'}`);
  console.log(`[Drivers] Full body:`, JSON.stringify(body || {}, null, 2));
  console.log(`[Drivers] Raw req.body:`, JSON.stringify(req.body || {}, null, 2));
  console.log(`[Drivers] Query params:`, JSON.stringify(req.query));
  console.log(`[Drivers] Request URL: ${req.url}`);
  console.log(`[Drivers] Request method: ${req.method}`);
  console.log(`[Drivers] ========================================`);
  
  // Also use logger for consistency
  logger.info(`[Drivers] Request from ${req.user.wallet_address}`);
  logger.info(`[Drivers] Content-Type: ${req.get('Content-Type')}`);
  logger.info(`[Drivers] Raw body: ${rawBody ? rawBody.substring(0, 200) : 'NOT CAPTURED'}`);
  logger.info(`[Drivers] Body keys: ${body && typeof body === 'object' ? Object.keys(body).join(', ') : 'N/A'}`);
  
  // Check if body is empty or malformed
  const bodyKeys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
  const isEmptyBody = !body || typeof body !== 'object' || Array.isArray(body) || bodyKeys.length === 0;
  
  if (isEmptyBody) {
    logger.warn('[Drivers] Empty or invalid request body');
    logger.warn('[Drivers] Body:', body, 'Type:', typeof body, 'IsArray:', Array.isArray(body), 'Keys:', bodyKeys);
    logger.warn('[Drivers] Request method:', req.method, 'Content-Type:', req.get('Content-Type'));
    logger.warn('[Drivers] Query params:', JSON.stringify(req.query));
    logger.warn('[Drivers] Request headers (relevant):', {
      'content-type': req.get('Content-Type'),
      'content-length': req.get('Content-Length'),
      'authorization': req.get('Authorization') ? 'present' : 'missing'
    });
    
    // Try to get app name from query params as fallback
    const appNameFromQuery = req.query.name || req.query.app || req.query.id;
    if (appNameFromQuery) {
      logger.info(`[Drivers] Found app name in query params: ${appNameFromQuery}, treating as puter-apps request`);
      const baseUrl = req.protocol + '://' + req.get('host');
      const appMap: Record<string, any> = {
        'editor': { name: 'editor', title: 'Text Editor', uuid: 'app-editor', uid: 'app-editor', icon: `${baseUrl}/apps/editor/img/icon.svg`, index_url: `${baseUrl}/apps/editor/index.html` },
        'viewer': { name: 'viewer', title: 'Image Viewer', uuid: 'app-viewer', uid: 'app-viewer', icon: undefined, index_url: `${baseUrl}/apps/viewer/index.html` },
        'player': { name: 'player', title: 'Media Player', uuid: 'app-player', uid: 'app-player', icon: undefined, index_url: `${baseUrl}/apps/player/index.html` },
        'camera': { name: 'camera', title: 'Camera', uuid: 'app-camera', uid: 'app-camera', icon: undefined, index_url: `${baseUrl}/apps/camera/index.html` },
        'app-center': { name: 'app-center', title: 'App Center', uuid: 'app-app-center', uid: 'app-app-center', icon: undefined, index_url: `${baseUrl}/apps/app-center/index.html` },
        'pdf': { name: 'pdf', title: 'PDF', uuid: 'app-pdf', uid: 'app-pdf', icon: undefined, index_url: `${baseUrl}/apps/pdf/index.html` },
        'recorder': { name: 'recorder', title: 'Recorder', uuid: 'app-recorder', uid: 'app-recorder', icon: undefined, index_url: `${baseUrl}/apps/recorder/index.html` },
        'solitaire-frvr': { name: 'solitaire-frvr', title: 'Solitaire FRVR', uuid: 'app-solitaire-frvr', uid: 'app-solitaire-frvr', icon: undefined, index_url: `${baseUrl}/apps/solitaire-frvr/index.html` }
      };
      const appInfo = appMap[String(appNameFromQuery)];
      if (appInfo) {
        res.json({ success: true, result: appInfo });
        return;
      }
    }
    
    res.status(400).json({ success: false, error: 'Empty or invalid request body', bodyKeys: bodyKeys.length, bodyType: typeof body });
    return;
  }
  
  // Normalize: SDK might use 'driver' instead of 'interface'
  if (!body.interface && body.driver) {
    logger.info(`[Drivers] Converting 'driver' to 'interface': ${body.driver}`);
    body.interface = body.driver;
  }

  try {
    // Handle puter-kvstore requests (for key-value storage)
    if (body.interface === 'puter-kvstore') {
      const method = body.method;
      const key = body.args?.key;
      const wallet = req.user.wallet_address;
      const kvKey = `${wallet}:${key}`;

      if (method === 'get') {
        const value = db?.getSetting?.(kvKey);
        res.json({ success: true, result: value !== undefined ? value : null });
      } else if (method === 'set') {
        const value = body.args?.value !== undefined ? body.args.value : body.args?.va;
        if (db?.setSetting) {
          db.setSetting(kvKey, typeof value === 'string' ? value : JSON.stringify(value));
        }
        res.json({ success: true, result: value });
      } else if (method === 'list') {
        // List keys matching pattern
        const pattern = body.args?.pattern || key || '*';
        const prefix = (pattern && typeof pattern === 'string') ? pattern.replace(/\*$/, '') : '';
        const walletPrefix = `${wallet}:${prefix}`;
        const matchingKeys: string[] = [];
        
        // If database supports listing settings, use it
        // Otherwise return empty array
        if (db?.listSettings) {
          const allSettings = db.listSettings();
          for (const [storedKey, _] of Object.entries(allSettings)) {
            if (typeof storedKey === 'string' && storedKey.startsWith(walletPrefix)) {
              const keyWithoutWallet = storedKey.substring(wallet.length + 1);
              matchingKeys.push(keyWithoutWallet);
            }
          }
        }
        
        res.json({ success: true, result: matchingKeys });
      } else if (method === 'delete') {
        if (db?.deleteSetting) {
          db.deleteSetting(kvKey);
        }
        res.json({ success: true, result: true });
      } else {
        res.status(400).json({ success: false, error: 'Unknown method' });
      }
      return;
    }

    // Handle puter-apps requests (for app lookups)
    if (body.interface === 'puter-apps' || body.interface === 'apps') {
      const method = body.method || 'read'; // Default to 'read' if not specified
      // Support multiple formats: body.args.id.name, body.args.name, body.name, body.args.id
      let appName = body.args?.id?.name || body.args?.name || body.name;
      // If args.id is a string, use it directly
      if (!appName && typeof body.args?.id === 'string') {
        appName = body.args.id;
      }
      // If args.id is an object with a name property, extract it
      if (!appName && body.args?.id && typeof body.args.id === 'object' && body.args.id.name) {
        appName = body.args.id.name;
      }
      const baseUrl = req.protocol + '://' + req.get('host');
      
      logger.info(`[Drivers] puter-apps request: method=${method}, appName=${appName}, args=`, JSON.stringify(body.args || {}));
      
      if (method === 'read' || !method) { // Handle 'read' or missing method
        if (!appName) {
          logger.warn(`[Drivers] puter-apps read request but no app name found in args`);
          res.json({ success: true, result: null });
          return;
        }
        
        logger.info(`[Drivers] Looking up app: ${appName}`);
        
        // Define app info for each app
        // Note: launch_app.js expects 'index_url' not 'url'
        const appMap: Record<string, any> = {
          'editor': {
            name: 'editor',
            title: 'Text Editor',
            uuid: 'app-editor',
            uid: 'app-editor',
            icon: `${baseUrl}/apps/editor/img/icon.svg`,
            index_url: `${baseUrl}/apps/editor/index.html`
          },
          'viewer': {
            name: 'viewer',
            title: 'Image Viewer',
            uuid: 'app-viewer',
            uid: 'app-viewer',
            icon: undefined,
            index_url: `${baseUrl}/apps/viewer/index.html`
          },
          'player': {
            name: 'player',
            title: 'Media Player',
            uuid: 'app-player',
            uid: 'app-player',
            icon: undefined,
            index_url: `${baseUrl}/apps/player/index.html`
          },
          'camera': {
            name: 'camera',
            title: 'Camera',
            uuid: 'app-camera',
            uid: 'app-camera',
            icon: undefined,
            index_url: `${baseUrl}/apps/camera/index.html`
          },
          'app-center': {
            name: 'app-center',
            title: 'App Center',
            uuid: 'app-app-center',
            uid: 'app-app-center',
            icon: undefined,
            index_url: `${baseUrl}/apps/app-center/index.html`
          },
          'pdf': {
            name: 'pdf',
            title: 'PDF',
            uuid: 'app-pdf',
            uid: 'app-pdf',
            icon: undefined,
            index_url: `${baseUrl}/apps/pdf/index.html`
          },
          // Note: Terminal app may not exist yet, commenting out for now
          // 'terminal': {
          //   name: 'terminal',
          //   title: 'Terminal',
          //   uuid: 'app-terminal',
          //   uid: 'app-terminal',
          //   icon: undefined,
          //   index_url: `${baseUrl}/apps/terminal/index.html`
          // },
          'recorder': {
            name: 'recorder',
            title: 'Recorder',
            uuid: 'app-recorder',
            uid: 'app-recorder',
            icon: undefined,
            index_url: `${baseUrl}/apps/recorder/index.html`
          },
          'solitaire-frvr': {
            name: 'solitaire-frvr',
            title: 'Solitaire FRVR',
            uuid: 'app-solitaire-frvr',
            uid: 'app-solitaire-frvr',
            icon: undefined,
            index_url: `${baseUrl}/apps/solitaire-frvr/index.html`
          }
        };
        
        const appInfo = appName ? appMap[appName] : null;
        
        if (appInfo) {
          logger.info(`[Drivers] Returning app info for: ${appName}`);
          res.json({ success: true, result: appInfo });
        } else {
          logger.warn(`[Drivers] App not found in appMap: ${appName}`);
          res.json({ success: true, result: null });
        }
        return;
      } else if (method === 'list') {
        // Return empty list for now
        res.json({ success: true, result: [] });
        return;
      } else {
        res.status(400).json({ success: false, error: 'Unknown method' });
        return;
      }
    }

    // Unknown interface - log what we received
    logger.warn(`[Drivers] Unknown interface: ${body.interface || 'missing'}, body:`, JSON.stringify(body));
    
    // Check if this might be a puter-apps request with different format
    // SDK might send various formats:
    // 1. { driver: 'puter-apps', method: 'read', args: { id: { name: 'app-name' } } }
    // 2. { interface: 'puter-apps', method: 'read', args: { id: { name: 'app-name' } } }
    // 3. { method: 'read', args: { id: { name: 'app-name' } } } (no interface/driver field)
    // 4. { name: 'app-name' } (direct app name)
    // 5. Empty body {} - try to infer from context
    const hasAppLookupStructure = body.driver === 'puter-apps' || body.driver === 'apps' || 
        (!body.interface && !body.driver && (body.args?.id || body.name || body.args?.name));
    
    if (hasAppLookupStructure || (bodyKeys.length === 0 && req.method === 'POST')) {
      // Even if body is empty, if it's a POST to /drivers/call, it might be an app lookup
      // Try to infer from URL or other context
      logger.info(`[Drivers] Attempting to handle as puter-apps request (hasStructure=${hasAppLookupStructure}, emptyBody=${bodyKeys.length === 0})`);
      logger.info(`[Drivers] Detected puter-apps request format (driver=${body.driver || 'none'}, has args=${!!body.args}, has name=${!!body.name})`);
      body.interface = 'puter-apps';
      // Handle app lookup
      const method = body.method || 'read'; // Default to 'read' if method not specified
      let appName = body.args?.id?.name || body.args?.name || body.name;
      if (!appName && typeof body.args?.id === 'string') {
        appName = body.args.id;
      }
      // If args.id is an object with a name property, extract it
      if (!appName && body.args?.id && typeof body.args.id === 'object' && body.args.id.name) {
        appName = body.args.id.name;
      }
      
      // If still no app name and body is empty, we can't proceed
      if (!appName && bodyKeys.length === 0) {
        logger.warn(`[Drivers] Cannot determine app name from empty body. Request might be malformed.`);
        res.status(400).json({ 
          success: false, 
          error: 'Cannot determine app name from empty request body. Expected format: { interface: "puter-apps", method: "read", args: { id: { name: "app-name" } } }' 
        });
        return;
      }
      const baseUrl = req.protocol + '://' + req.get('host');
      
      logger.info(`[Drivers] puter-apps (driver format): method=${method}, appName=${appName}`);
      
      if (method === 'read' || !method) { // Default to 'read' if method not specified
        const appMap: Record<string, any> = {
          'editor': { name: 'editor', title: 'Text Editor', uuid: 'app-editor', uid: 'app-editor', icon: `${baseUrl}/apps/editor/img/icon.svg`, index_url: `${baseUrl}/apps/editor/index.html` },
          'viewer': { name: 'viewer', title: 'Image Viewer', uuid: 'app-viewer', uid: 'app-viewer', icon: undefined, index_url: `${baseUrl}/apps/viewer/index.html` },
          'player': { name: 'player', title: 'Media Player', uuid: 'app-player', uid: 'app-player', icon: undefined, index_url: `${baseUrl}/apps/player/index.html` },
          'camera': { name: 'camera', title: 'Camera', uuid: 'app-camera', uid: 'app-camera', icon: undefined, index_url: `${baseUrl}/apps/camera/index.html` },
          'app-center': { name: 'app-center', title: 'App Center', uuid: 'app-app-center', uid: 'app-app-center', icon: undefined, index_url: `${baseUrl}/apps/app-center/index.html` },
          'pdf': { name: 'pdf', title: 'PDF', uuid: 'app-pdf', uid: 'app-pdf', icon: undefined, index_url: `${baseUrl}/apps/pdf/index.html` },
          'recorder': { name: 'recorder', title: 'Recorder', uuid: 'app-recorder', uid: 'app-recorder', icon: undefined, index_url: `${baseUrl}/apps/recorder/index.html` },
          'solitaire-frvr': { name: 'solitaire-frvr', title: 'Solitaire FRVR', uuid: 'app-solitaire-frvr', uid: 'app-solitaire-frvr', icon: undefined, index_url: `${baseUrl}/apps/solitaire-frvr/index.html` }
        };
        
        const appInfo = appName ? appMap[appName] : null;
        if (appInfo) {
          logger.info(`[Drivers] Found app: ${appName}, returning app info`);
          res.json({ success: true, result: appInfo });
        } else {
          logger.warn(`[Drivers] App not found: ${appName}`);
          res.json({ success: true, result: null });
        }
        return;
      }
    }
    
    // If we get here and body is empty, it might be a malformed request
    // Return a more helpful error
    const errorMsg = bodyKeys.length === 0 
      ? `Empty request body. Expected format: { interface: 'puter-apps', method: 'read', args: { id: { name: 'app-name' } } }`
      : `Unknown interface: ${body.interface || 'missing'}. Body keys: ${bodyKeys.join(', ')}`;
    
    res.status(400).json({ success: false, error: errorMsg });
  } catch (error) {
    logger.error('[Drivers] Call error:', error instanceof Error ? error.message : 'Unknown error');
    logger.error('[Drivers] Error stack:', error instanceof Error ? error.stack : 'No stack');
    res.status(500).json({
      success: false,
      error: 'Driver call failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * GET /api/wallets
 * Returns list of trusted wallets for the authenticated user
 */
export function handleGetWallets(req: AuthenticatedRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const db = (req.app.locals.db as any);
    const walletAddress = req.user.wallet_address;
    
    // Get trusted wallets from database (if supported)
    // For now, return empty list - wallets feature can be added later
    res.json({
      wallets: [],
      owner: walletAddress
    });
  } catch (error) {
    logger.error('[GetWallets] Error:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({
      error: 'Failed to get wallets',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

