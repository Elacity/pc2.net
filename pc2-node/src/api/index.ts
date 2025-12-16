import express, { Express, Request, Response } from 'express';
import multer from 'multer';
import { DatabaseManager, FilesystemManager } from '../storage/index.js';
import { Config } from '../config/loader.js';
import { Server as SocketIOServer } from 'socket.io';
import { authenticate, corsMiddleware, errorHandler } from './middleware.js';
import { handleWhoami } from './whoami.js';
import { handleParticleAuth, handleGrantUserApp, handleGetUserAppToken } from './auth.js';
import { handleStat, handleReaddir, handleRead, handleWrite, handleMkdir, handleDelete, handleMove } from './filesystem.js';
import { handleSign, handleVersion, handleOSUser, handleKV, handleRAO, handleContactUs, handleDriversCall, handleGetWallets } from './other.js';
import { handleAPIInfo, handleGetLaunchApps, handleDF, handleBatch, handleCacheTimestamp, handleStats } from './info.js';
import { handleFile } from './file.js';

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

  // User info endpoints (require auth)
  app.get('/whoami', authenticate, handleWhoami);
  app.get('/os/user', authenticate, handleOSUser);
  app.get('/api/stats', authenticate, handleStats);
  app.get('/api/wallets', authenticate, handleGetWallets);

  // Filesystem endpoints (require auth)
  app.get('/stat', authenticate, handleStat);
  app.post('/stat', authenticate, handleStat); // Also support POST for /stat
  app.post('/readdir', authenticate, handleReaddir);
  app.get('/read', authenticate, handleRead);
  app.post('/read', authenticate, handleRead); // Also support POST for /read
  app.post('/write', authenticate, handleWrite);
  app.post('/mkdir', authenticate, handleMkdir);
  app.post('/delete', authenticate, handleDelete);
  app.post('/move', authenticate, handleMove);
  
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

  // Error handling middleware (must be last)
  app.use(errorHandler);
}

