import express, { Express, Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import path from 'path';
import { setupStaticServing } from './static.js';
import { setupAPI } from './api/index.js';
import { setupWebSocket, setGlobalIO } from './websocket/server.js';
import { DatabaseManager, FilesystemManager } from './storage/index.js';
import { Config } from './config/loader.js';
import { IndexingWorker } from './storage/indexer.js';
import { AIChatService } from './services/ai/AIChatService.js';
import { logger } from './utils/logger.js';

export interface ServerOptions {
  port: number;
  frontendPath: string;
  isProduction: boolean;
  database?: DatabaseManager;
  filesystem?: FilesystemManager;
  config?: Config;
  aiService?: AIChatService;
}

export function createServer(options: ServerOptions): { app: Express; server: Server } {
  const app = express();
  
  // Trust proxy headers (X-Forwarded-Proto, X-Forwarded-For) when behind reverse proxies
  // This ensures req.protocol returns 'https' when accessed via Tailscale, nginx, etc.
  app.set('trust proxy', true);
  
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
    
    // Capture raw body for /mkdir requests to debug body parsing issues
    if (req.path === '/mkdir' && req.method === 'POST') {
      const rawBody = (req as any).rawBody || (req as any).body;
      console.log('[Server] /mkdir request - Content-Type:', contentType);
      console.log('[Server] /mkdir request - Body type:', typeof rawBody);
      console.log('[Server] /mkdir request - Body value:', rawBody);
      console.log('[Server] /mkdir request - Query:', req.query);
    }
    
    next();
  });
  
  // Handle binary data for /writeFile endpoint (PDFs, images, etc.)
  // CRITICAL: Accept ALL content types for /writeFile to handle Blobs from viewer app
  // The viewer app sends Blobs which may have various content types
  app.use('/writeFile', express.raw({ 
    type: '*/*', // Accept all content types for /writeFile
    limit: '100mb' // Allow large files
  }));
  
  app.use(express.json({ 
    limit: '50mb', // Allow large JSON payloads (for AI chat with large PDF text content)
    verify: (req: any, res, buf) => {
      // Capture raw body for debugging (especially for /drivers/call and /mkdir)
      if (req.path === '/drivers/call' || req.path === '/mkdir') {
        req.rawBody = buf.toString('utf8');
        if (req.path === '/mkdir') {
          console.log('[Server] /mkdir raw body buffer:', req.rawBody);
          console.log('[Server] /mkdir raw body length:', buf.length);
        }
      }
    }
  }));
  app.use(express.urlencoded({ extended: true }));
  
  // Make database, filesystem, config, and AI service available to routes via app.locals
  if (options.database) {
    app.locals.db = options.database;
  }
  if (options.filesystem) {
    app.locals.filesystem = options.filesystem;
    // Also store in global as fallback
    (global as any).__filesystem = options.filesystem;
    logger.info('[Server] ✅ Filesystem stored in app.locals and global');
  } else {
    logger.warn('[Server] ⚠️ No filesystem provided - tool execution will be disabled');
  }
  if (options.config) {
    app.locals.config = options.config;
  }
  if (options.aiService) {
    app.locals.aiService = options.aiService;
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
  
  // Determine user homes base directory for terminal isolation
  // Use data directory from config or derive from database path
  let userHomesBase = '';
  if (options.config?.storage?.database_path) {
    // User homes are at the same level as the database
    userHomesBase = path.dirname(options.config.storage.database_path);
  } else {
    // Fallback to volatile/data
    userHomesBase = path.join(process.cwd(), 'volatile', 'data');
  }
  logger.info(`[Server] Terminal user homes base: ${userHomesBase}`);
  
  // Read terminal configuration from config
  const terminalConfig = (options.config as any)?.terminal || {};
  const terminalIsolationMode = terminalConfig.isolation_mode || 'none';
  const terminalAllowFallback = terminalConfig.allow_insecure_fallback || false;
  const terminalMaxPerUser = terminalConfig.max_terminals_per_user || 5;
  const terminalIdleTimeout = (terminalConfig.idle_timeout_minutes || 30) * 60 * 1000;
  
  logger.info(`[Server] Terminal config: isolation_mode=${terminalIsolationMode}, max_per_user=${terminalMaxPerUser}`);
  
  // WebSocket setup
  const io = setupWebSocket(server, {
    database: options.database,
    userHomesBase: userHomesBase,
    terminalConfig: {
      isolationMode: terminalIsolationMode,
      allowInsecureFallback: terminalAllowFallback,
      maxTerminalsPerUser: terminalMaxPerUser,
      idleTimeout: terminalIdleTimeout,
    },
  });
  
  // Store pendingEvents reference for polling middleware
  // This will be set by setupWebSocket
  (app as any).__pendingEvents = null;
  
  // Make WebSocket server available globally for event broadcasting
  setGlobalIO(io);
  
  // Make WebSocket server available to routes via app.locals
  app.locals.io = io;
  
  // Initialize background indexing worker (if database and filesystem are available)
  if (options.database && options.filesystem) {
    const indexer = new IndexingWorker(options.database, options.filesystem);
    indexer.start().catch((error) => {
      console.error('[Server] Failed to start indexing worker:', error);
    });
    // Store indexer in app.locals for potential API access
    app.locals.indexer = indexer;
  }
  
  return { app, server };
}

