import express, { Express, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { DatabaseManager, FilesystemManager } from '../storage/index.js';
import { Config } from '../config/loader.js';
import { Server as SocketIOServer } from 'socket.io';
import { authenticate, corsMiddleware, errorHandler, AuthenticatedRequest } from './middleware.js';
import { logger } from '../utils/logger.js';
import { handleWhoami } from './whoami.js';
import { handleParticleAuth, handleGrantUserApp, handleGetUserAppToken } from './auth.js';
import { handleStat, handleReaddir, handleRead, handleWrite, handleMkdir, handleDelete, handleMove, handleRename, handleCopy } from './filesystem.js';
import { handleSign, handleVersion, handleOSUser, handleKV, handleRAO, handleContactUs, handleDriversCall, handleGetWallets, handleOpenItem, handleSuggestApps, handleItemMetadata, handleWriteFile, handleSetDesktopBg, handleSetProfilePicture } from './other.js';
import { handleAPIInfo, handleGetLaunchApps, handleDF, handleBatch, handleCacheTimestamp, handleStats } from './info.js';
import { handleFile } from './file.js';
import storageRouter from './storage.js';
import aiRouter from './ai.js';
import wasmRouter from './wasm.js';
import resourcesRouter from './resources.js';
import { handleSearch } from './search.js';
import { handleGetApp } from './apps.js';
import { handleGetVersions, handleGetVersion, handleRestoreVersion } from './versions.js';
import { createBackup, listBackups, downloadBackup, deleteBackup, restoreBackup } from './backup.js';
import { handleTerminalStats, handleTerminalAdminStats, handleDestroyAllTerminals, handleTerminalStatus, handleExecCommand, handleExecScript, handleListTools } from './terminal.js';
import { handleListApiKeys, handleCreateApiKey, handleDeleteApiKey, handleRevokeApiKey, handleGetScopes } from './apikeys.js';
import { handleListTools as handleListAgentTools, handleGetTool, handleListCategories, handleGetOpenAPISchema } from './tools.js';
import { createPublicRouter } from './public.js';
import { IPFSStorage } from '../storage/ipfs.js';
import { httpClientRouter } from './http-client.js';
import { gitRouter } from './git.js';
import { auditRouter, auditMiddleware } from './audit.js';
import { rateLimitMiddleware, getRateLimitStatus } from './rate-limit.js';
import { schedulerRouter } from './scheduler.js';

// Extend Express Request to include database, filesystem, config, and WebSocket
declare global {
  namespace Express {
    interface Application {
      locals: {
        db?: DatabaseManager;
        filesystem?: FilesystemManager;
        config?: Config;
        io?: SocketIOServer;
      };
    }
  }
}

export function setupAPI(app: Express): void {
  // Debug middleware for specific routes (enable as needed)
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Uncomment to debug specific routes:
    // if (req.path === '/move') {
    //   logger.info(`[Route Debug] ${req.method} ${req.path}: url=${req.url}`);
    // }
    next();
  });
  
  // CORS middleware (applied to all routes)
  app.use(corsMiddleware);

  // Health check endpoint (no auth required)
  // Available at both /health and /api/health for Docker compatibility
  const healthHandler = (req: Request, res: Response) => {
    const db = app.locals.db;
    const filesystem = app.locals.filesystem;
    const config = app.locals.config;
    const io = app.locals.io;
    
    const dbStatus = db ? 'connected' : 'not initialized';
    const ipfsStatus = filesystem ? 'available' : 'not initialized';
    const websocketStatus = io ? 'active' : 'not initialized';
    
    // Import terminal service to check isolation mode
    let terminalStatus = 'not initialized';
    let terminalIsolation = 'unknown';
    try {
      const { getTerminalService } = require('./terminal.js');
      const terminalService = getTerminalService();
      if (terminalService) {
        terminalStatus = terminalService.isAvailable() ? 'available' : 'unavailable';
        terminalIsolation = terminalService.getEffectiveIsolationMode();
      }
    } catch {
      terminalStatus = 'not available';
    }
    
    const health: {
      status: string;
      timestamp: string;
      version: string;
      uptime: number;
      database: string;
      ipfs: string;
      websocket: string;
      terminal: {
        status: string;
        isolationMode: string;
      };
      owner?: {
        set: boolean;
        tethered_wallets: number;
      };
    } = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      uptime: process.uptime(),
      database: dbStatus,
      ipfs: ipfsStatus,
      websocket: websocketStatus,
      terminal: {
        status: terminalStatus,
        isolationMode: terminalIsolation
      }
    };

    if (config) {
      health.owner = {
        set: config.owner.wallet_address !== null,
        tethered_wallets: config.owner.tethered_wallets.length
      };
    }
    
    // If critical components are missing, mark as degraded
    if (!db) {
      health.status = 'degraded';
    }
    
    res.json(health);
  };
  
  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // Version endpoint (no auth required)
  app.get('/version', handleVersion);
  
  // API info endpoint (no auth required)
  app.get('/api/info', handleAPIInfo);
  
  // Get launch apps (no auth required)
  app.get('/get-launch-apps', handleGetLaunchApps);
  
  // Get app info by name (no auth required - used by window.get_apps)
  // IMPORTANT: This must be registered BEFORE static file middleware to catch /apps/:name requests
  app.get('/apps/:name', handleGetApp);
  
  // Cache timestamp (no auth required - SDK calls this during initialization)
  app.get('/cache/last-change-timestamp', handleCacheTimestamp);
  
  // File access (signed URLs - no auth required, signature verified in query)
  app.get('/file', handleFile);

  // ============================================================================
  // Public IPFS Gateway (no auth required)
  // ============================================================================
  const db = app.locals.db;
  const filesystem = app.locals.filesystem;
  
  // Get IPFS instance from filesystem if available
  const ipfs = filesystem?.getIPFS() || null;
  
  if (db && filesystem) {
    const publicRouter = createPublicRouter(db, filesystem, ipfs);
    app.use(publicRouter);
    logger.info('[API] Public IPFS gateway enabled at /ipfs/:cid and /public/:wallet/*');
  } else {
    logger.warn('[API] Public IPFS gateway disabled - database or filesystem not available');
  }

  // Authentication endpoints
  app.post('/auth/particle', handleParticleAuth);
  app.post('/auth/grant-user-app', authenticate, handleGrantUserApp);
  app.get('/auth/get-user-app-token', authenticate, handleGetUserAppToken);
  app.post('/auth/get-user-app-token', authenticate, handleGetUserAppToken);

  // User info endpoints (no auth required - return unauthenticated state if no token)
  // Match mock server behavior: return 200 with username: null instead of 401
  app.get('/whoami', handleWhoami);
  app.get('/os/user', handleOSUser);
  app.get('/api/stats', authenticate, handleStats);
  app.get('/api/wallets', authenticate, handleGetWallets);
  
  // User profile endpoint (per-wallet settings)
  app.post('/api/user/profile', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const db = req.app.locals.db;
      const { display_name } = req.body;
      
      if (display_name !== undefined) {
        // Save per-wallet display name
        const key = `user_${req.user.wallet_address}_display_name`;
        db?.setSetting(key, display_name);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('[User Profile] Error:', error);
      res.status(500).json({ error: 'Failed to save profile' });
    }
  });
  
  app.get('/api/user/profile', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const db = req.app.locals.db;
      const key = `user_${req.user.wallet_address}_display_name`;
      const displayName = db?.getSetting(key) || '';
      
      res.json({ display_name: displayName });
    } catch (error) {
      console.error('[User Profile] Error:', error);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  });
  
  // Login history endpoint (per-wallet)
  app.get('/api/user/login-history', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const db = req.app.locals.db;
      const walletAddress = req.user.wallet_address;
      const currentToken = req.headers.authorization?.replace('Bearer ', '');
      
      // Get sessions from database (using available columns)
      const sessions = db?.db?.prepare(`
        SELECT token, created_at, expires_at
        FROM sessions 
        WHERE wallet_address = ?
        ORDER BY created_at DESC
        LIMIT 20
      `).all(walletAddress) || [];
      
      const logins = sessions.map((s: any) => ({
        timestamp: new Date(s.created_at).toISOString(),
        ip: 'Local Session',
        user_agent: 'PC2 Desktop',
        is_current: s.token === currentToken
      }));
      
      res.json({ logins });
    } catch (error) {
      console.error('[Login History] Error:', error);
      res.json({ logins: [] });
    }
  });
  
  // List sessions endpoint for Session Manager
  app.get('/auth/list-sessions', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const db = req.app.locals.db;
      const walletAddress = req.user.wallet_address;
      const currentToken = req.headers.authorization?.replace('Bearer ', '');
      
      const sessions = db?.db?.prepare(`
        SELECT token, created_at, expires_at
        FROM sessions 
        WHERE wallet_address = ? AND expires_at > ?
        ORDER BY created_at DESC
      `).all(walletAddress, Date.now()) || [];
      
      const result = sessions.map((s: any, index: number) => ({
        uuid: s.token.substring(0, 16),
        current: s.token === currentToken,
        meta: {
          'Created': new Date(s.created_at).toLocaleString(),
          'Expires': new Date(s.expires_at).toLocaleString(),
          'Type': 'Wallet Session'
        }
      }));
      
      res.json(result);
    } catch (error) {
      console.error('[List Sessions] Error:', error);
      res.json([]);
    }
  });
  
  // Revoke session endpoint
  app.post('/auth/revoke-session', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const db = req.app.locals.db;
      const { uuid } = req.body;
      const walletAddress = req.user.wallet_address;
      
      // Find and delete session that starts with this uuid
      db?.db?.prepare(`
        DELETE FROM sessions 
        WHERE wallet_address = ? AND token LIKE ?
      `).run(walletAddress, `${uuid}%`);
      
      res.json({ success: true });
    } catch (error) {
      console.error('[Revoke Session] Error:', error);
      res.status(500).json({ error: 'Failed to revoke session' });
    }
  });
  
  // Storage usage endpoint
  app.use('/api/storage', storageRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/wasm', wasmRouter);
  app.use('/api/resources', resourcesRouter);
  app.use('/api/http', httpClientRouter);
  app.use('/api/git', gitRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/scheduler', schedulerRouter);
  
  // Rate limit status endpoint
  app.get('/api/rate-limit/status', authenticate, (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const apiKeyId = (req as any).apiKeyId;
    const status = getRateLimitStatus(req.user.wallet_address, apiKeyId);
    res.json({
      success: true,
      wallet: req.user.wallet_address.substring(0, 10) + '...',
      api_key_id: apiKeyId || 'session',
      limits: status,
    });
  });
  
  // Apply rate limiting and audit middleware to all routes (after authentication)
  app.use(rateLimitMiddleware());
  app.use(auditMiddleware);

  // Search endpoint (require auth)
  app.post('/search', authenticate, handleSearch);

  // File versions endpoints (require auth)
  app.get('/versions', authenticate, handleGetVersions);
  app.get('/versions/:versionNumber', authenticate, handleGetVersion);
  app.post('/versions/:versionNumber/restore', authenticate, handleRestoreVersion);

  // Filesystem endpoints (require auth)
  // Register /stat BEFORE other routes to ensure it's matched correctly
  app.all('/stat', authenticate, handleStat); // Use app.all() to handle both GET and POST
  app.post('/readdir', authenticate, handleReaddir);
  app.get('/read', authenticate, handleRead);
  app.post('/read', authenticate, handleRead); // Also support POST for /read
  app.post('/write', authenticate, handleWrite);
  // Filesystem endpoints (standard format)
  app.post('/mkdir', authenticate, handleMkdir);
  app.post('/delete', authenticate, handleDelete);
  app.post('/move', authenticate, handleMove);
  app.post('/rename', authenticate, handleRename);
  app.post('/copy', authenticate, handleCopy);
  
  // Filesystem endpoints (API format - matching mock server)
  app.post('/api/files/mkdir', authenticate, handleMkdir);
  app.post('/api/files/delete', authenticate, handleDelete);
  app.post('/api/files/move', authenticate, handleMove);
  
  // Additional filesystem endpoints
  app.get('/df', authenticate, handleDF);
  app.post('/df', authenticate, handleDF);
  
  // Batch endpoint with multer for multipart file uploads
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 100 * 1024 * 1024 // 100MB max file size
    }
  });
  
  // Restore endpoint with larger file size limit (backups can be GB)
  const restoreUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024 * 1024 // 10GB max file size for backups
    }
  });
  
  app.post('/batch', authenticate, upload.any(), handleBatch);

  // File signing (require auth)
  app.post('/sign', authenticate, handleSign);

  // Key-value store (require auth)
  app.get('/kv/:key*', authenticate, handleKV);
  app.post('/kv/:key*', authenticate, handleKV);
  app.delete('/kv/:key*', authenticate, handleKV);
  app.get('/api/kv/:key*', authenticate, handleKV);
  app.post('/api/kv/:key*', authenticate, handleKV);
  app.delete('/api/kv/:key*', authenticate, handleKV);

  // Other endpoints (require auth)
  app.post('/rao', authenticate, handleRAO);
  app.post('/contactUs', handleContactUs);
  
  // Driver calls (require auth)
  // Note: Raw body capture must happen before body parser, but body parser is global
  // So we'll check rawBody in the handler if parsed body is empty
  app.post('/drivers/call', authenticate, handleDriversCall);

  // Open item - Get app to open a file (require auth)
  app.post('/open_item', authenticate, handleOpenItem);

  // Suggest apps for a file (require auth)
  app.post('/suggest_apps', authenticate, handleSuggestApps);

  // Item metadata (require auth)
  app.get('/itemMetadata', authenticate, handleItemMetadata);

  // Write file using signed URL (require auth)
  app.post('/writeFile', authenticate, handleWriteFile);
  app.put('/writeFile', authenticate, handleWriteFile);

  // Desktop background (require auth)
  app.post('/set-desktop-bg', authenticate, handleSetDesktopBg);
  app.post('/set-profile-picture', authenticate, handleSetProfilePicture);

  // Elastos blockchain explorer proxy (to avoid CORS issues)
  app.get('/api/elastos/transactions', authenticate, async (req: Request, res: Response) => {
    try {
      const { address, page = '1', pageSize = '20' } = req.query;
      
      if (!address || typeof address !== 'string') {
        res.status(400).json({ error: 'Address is required' });
        return;
      }
      
      // Proxy to Elastos Smart Chain explorer API
      const offset = (parseInt(page as string) - 1) * parseInt(pageSize as string);
      const apiUrl = `https://esc.elastos.io/api?module=account&action=txlist&address=${address}&offset=${offset}&limit=${pageSize}&sort=desc`;
      
      const response = await fetch(apiUrl);
      const data = await response.json();
      
      res.json(data);
    } catch (error) {
      logger.error('[Elastos Proxy] Error:', error);
      res.status(500).json({ error: 'Failed to fetch Elastos transactions' });
    }
  });

  // Backup management endpoints (require auth)
  app.post('/api/backups/create', authenticate, createBackup);
  app.get('/api/backups', authenticate, listBackups);
  app.get('/api/backups/download/:filename', authenticate, downloadBackup);
  app.delete('/api/backups/:filename', authenticate, deleteBackup);
  app.post('/api/backups/restore', authenticate, restoreUpload.single('file'), restoreBackup);

  // Terminal endpoints
  app.get('/api/terminal/status', handleTerminalStatus);  // No auth - check if available
  app.get('/api/terminal/stats', authenticate, handleTerminalStats);
  app.get('/api/terminal/admin/stats', authenticate, handleTerminalAdminStats);
  app.post('/api/terminal/destroy-all', authenticate, handleDestroyAllTerminals);
  
  // Terminal command execution API (for AI agents)
  app.post('/api/terminal/exec', authenticate, handleExecCommand);
  app.post('/api/terminal/script', authenticate, handleExecScript);
  app.get('/api/terminal/tools', authenticate, handleListTools);

  // API Keys management (for agent authentication)
  app.get('/api/keys', authenticate, handleListApiKeys);
  app.post('/api/keys', authenticate, handleCreateApiKey);
  app.delete('/api/keys/:keyId', authenticate, handleDeleteApiKey);
  app.post('/api/keys/:keyId/revoke', authenticate, handleRevokeApiKey);
  app.get('/api/keys/scopes', handleGetScopes);  // No auth needed - just lists available scopes

  // Agent Tool Registry (for AI agent discovery)
  app.get('/api/tools', handleListAgentTools);  // Optional auth - shows scopes if authenticated
  app.get('/api/tools/categories', handleListCategories);
  app.get('/api/tools/openapi', handleGetOpenAPISchema);
  app.get('/api/tools/:name', handleGetTool);

  // Error handling middleware (must be last)
  app.use(errorHandler);
}

