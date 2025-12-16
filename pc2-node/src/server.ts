import express, { Express, Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import { setupStaticServing } from './static.js';
import { setupAPI } from './api/index.js';
import { setupWebSocket, setGlobalIO } from './websocket/server.js';
import { DatabaseManager, FilesystemManager } from './storage/index.js';
import { Config } from './config/loader.js';

export interface ServerOptions {
  port: number;
  frontendPath: string;
  isProduction: boolean;
  database?: DatabaseManager;
  filesystem?: FilesystemManager;
  config?: Config;
}

export function createServer(options: ServerOptions): { app: Express; server: Server } {
  const app = express();
  
  // Middleware
  // Handle text/plain;actually=json content type (used by Puter SDK)
  // Parse it as JSON by using express.text() first, then manually parsing in a follow-up middleware
  app.use(express.text({ 
    type: (req: any) => {
      const contentType = req.headers['content-type'] || '';
      return contentType.includes('text/plain') && contentType.includes('actually=json');
    }
  }));
  
  // Convert text body to JSON for text/plain;actually=json requests
  app.use((req: Request, res: Response, next: NextFunction) => {
    const contentType = (req as any).get('Content-Type') || '';
    if (contentType.includes('text/plain') && contentType.includes('actually=json') && typeof (req as any).body === 'string') {
      try {
        // Only parse if body is not empty
        if ((req as any).body && (req as any).body.trim().length > 0) {
          const parsed = JSON.parse((req as any).body);
          (req as any).rawBody = (req as any).body; // Store raw for debugging
          (req as any).body = parsed; // Replace string with parsed object
        } else {
          // Empty body, set to empty object
          (req as any).rawBody = (req as any).body;
          (req as any).body = {};
        }
      } catch (e) {
        // Only log if body is not empty (to avoid noise from empty requests)
        if ((req as any).body && (req as any).body.trim().length > 0) {
          console.error('[Middleware] Failed to parse text/plain;actually=json:', e);
        }
        (req as any).rawBody = (req as any).body;
        (req as any).body = {};
      }
    }
    next();
  });
  
  app.use(express.json({ 
    verify: (req: any, res, buf) => {
      // Capture raw body for debugging (especially for /drivers/call)
      if (req.path === '/drivers/call') {
        req.rawBody = buf.toString('utf8');
      }
    }
  }));
  app.use(express.urlencoded({ extended: true }));
  
  // Make database, filesystem, and config available to routes via app.locals
  if (options.database) {
    app.locals.db = options.database;
  }
  if (options.filesystem) {
    app.locals.filesystem = options.filesystem;
  }
  if (options.config) {
    app.locals.config = options.config;
  }
  
  // API routes (must come before static serving to avoid SPA fallback)
  setupAPI(app);
  
  // Static file serving (after API routes)
  setupStaticServing(app, {
    frontendPath: options.frontendPath,
    isProduction: options.isProduction
  });
  
  // Create HTTP server
  const server = new Server(app);
  
  // WebSocket setup
  const io = setupWebSocket(server, {
    database: options.database
  });
  
  // Make WebSocket server available globally for event broadcasting
  setGlobalIO(io);
  
  // Make WebSocket server available to routes via app.locals
  app.locals.io = io;
  
  return { app, server };
}

