import express, { Express, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { DatabaseManager, FilesystemManager } from '../storage/index.js';
import { Config } from '../config/loader.js';
import { Server as SocketIOServer } from 'socket.io';
import { authenticate, corsMiddleware, errorHandler } from './middleware.js';
import { logger } from '../utils/logger.js';
import { handleWhoami } from './whoami.js';
import { handleParticleAuth, handleGrantUserApp, handleGetUserAppToken } from './auth.js';
import { handleStat, handleReaddir, handleRead, handleWrite, handleMkdir, handleDelete, handleMove, handleRename } from './filesystem.js';
import { handleSign, handleVersion, handleOSUser, handleKV, handleRAO, handleContactUs, handleDriversCall, handleGetWallets, handleOpenItem, handleSuggestApps, handleItemMetadata, handleWriteFile, handleSetDesktopBg, handleSetProfilePicture } from './other.js';
import { handleAPIInfo, handleGetLaunchApps, handleDF, handleBatch, handleCacheTimestamp, handleStats } from './info.js';
import { handleFile } from './file.js';
import storageRouter from './storage.js';
import aiRouter from './ai.js';
import { handleSearch } from './search.js';
import { handleGetVersions, handleGetVersion, handleRestoreVersion } from './versions.js';
import { createBackup, listBackups, downloadBackup, deleteBackup, restoreBackup } from './backup.js';

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
  // Debug middleware to log all requests (temporary)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/stat' || req.path.startsWith('/stat')) {
      logger.info(`[Route Debug] /stat request: method=${req.method}, path=${req.path}, url=${req.url}, query=${JSON.stringify(req.query)}, body=${JSON.stringify(req.body)}`);
    }
    next();
  });
  
  // CORS middleware (applied to all routes)
  app.use(corsMiddleware);

  // Health check endpoint (no auth required)
  app.get('/health', (req: Request, res: Response) => {
    const db = app.locals.db;
    const filesystem = app.locals.filesystem;
    const config = app.locals.config;
    const io = app.locals.io;
    
    const dbStatus = db ? 'connected' : 'not initialized';
    const ipfsStatus = filesystem ? 'available' : 'not initialized';
    const websocketStatus = io ? 'active' : 'not initialized';
    
    const health: {
      status: string;
      timestamp: string;
      database: string;
      ipfs: string;
      websocket: string;
      owner?: {
        set: boolean;
        tethered_wallets: number;
      };
    } = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbStatus,
      ipfs: ipfsStatus,
      websocket: websocketStatus
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
  });

  // Version endpoint (no auth required)
  app.get('/version', handleVersion);
  
  // API info endpoint (no auth required)
  app.get('/api/info', handleAPIInfo);
  
  // Get launch apps (no auth required)
  app.get('/get-launch-apps', handleGetLaunchApps);
  
  // Cache timestamp (no auth required - SDK calls this during initialization)
  app.get('/cache/last-change-timestamp', handleCacheTimestamp);
  
  // File access (signed URLs - no auth required, signature verified in query)
  app.get('/file', handleFile);

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
  
  // Storage usage endpoint
  app.use('/api/storage', storageRouter);
  app.use('/api/ai', aiRouter);

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

  // Backup management endpoints (require auth)
  app.post('/api/backups/create', authenticate, createBackup);
  app.get('/api/backups', authenticate, listBackups);
  app.get('/api/backups/download/:filename', authenticate, downloadBackup);
  app.delete('/api/backups/:filename', authenticate, deleteBackup);
  app.post('/api/backups/restore', authenticate, restoreUpload.single('file'), restoreBackup);

  // Error handling middleware (must be last)
  app.use(errorHandler);
}

