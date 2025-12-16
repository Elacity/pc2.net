import express, { Express, Request, Response } from 'express';
import { DatabaseManager, FilesystemManager } from '../storage/index.js';
import { Config } from '../config/loader.js';
import { Server as SocketIOServer } from 'socket.io';
import { authenticate, corsMiddleware, errorHandler } from './middleware.js';
import { handleWhoami } from './whoami.js';
import { handleParticleAuth } from './auth.js';
import { handleStat, handleReaddir, handleRead, handleWrite, handleMkdir, handleDelete, handleMove } from './filesystem.js';
import { handleSign, handleVersion, handleOSUser, handleKV, handleRAO, handleContactUs } from './other.js';

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

  // Authentication endpoints
  app.post('/auth/particle', handleParticleAuth);

  // User info endpoints (require auth)
  app.get('/whoami', authenticate, handleWhoami);
  app.get('/os/user', authenticate, handleOSUser);

  // Filesystem endpoints (require auth)
  app.get('/stat', authenticate, handleStat);
  app.post('/readdir', authenticate, handleReaddir);
  app.get('/read', authenticate, handleRead);
  app.post('/write', authenticate, handleWrite);
  app.post('/mkdir', authenticate, handleMkdir);
  app.post('/delete', authenticate, handleDelete);
  app.post('/move', authenticate, handleMove);

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

  // Error handling middleware (must be last)
  app.use(errorHandler);
}
