import express, { Express } from 'express';
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
  app.use(express.json());
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
