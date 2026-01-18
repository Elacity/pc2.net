import express from 'express';
import { Server } from 'http';
import { setupStaticServing } from './static.js';
import { setupAPI } from './api/index.js';
import { setupWebSocket, setGlobalIO } from './websocket/server.js';
import { IndexingWorker } from './storage/indexer.js';
export function createServer(options) {
    const app = express();
    app.use(express.text({
        type: (req) => {
            const contentType = req.headers['content-type'] || '';
            return contentType.includes('text/plain') && contentType.includes('actually=json');
        }
    }));
    app.use((req, res, next) => {
        const contentType = req.get('Content-Type') || '';
        if (contentType.includes('text/plain') && contentType.includes('actually=json') && typeof req.body === 'string') {
            try {
                if (req.body && req.body.trim().length > 0) {
                    const parsed = JSON.parse(req.body);
                    req.rawBody = req.body;
                    req.body = parsed;
                }
                else {
                    req.rawBody = req.body;
                    req.body = {};
                }
            }
            catch (e) {
                if (req.body && req.body.trim().length > 0) {
                    console.error('[Middleware] Failed to parse text/plain;actually=json:', e);
                }
                req.rawBody = req.body;
                req.body = {};
            }
        }
        if (req.path === '/mkdir' && req.method === 'POST') {
            const rawBody = req.rawBody || req.body;
            console.log('[Server] /mkdir request - Content-Type:', contentType);
            console.log('[Server] /mkdir request - Body type:', typeof rawBody);
            console.log('[Server] /mkdir request - Body value:', rawBody);
            console.log('[Server] /mkdir request - Query:', req.query);
        }
        next();
    });
    app.use(express.json({
        verify: (req, res, buf) => {
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
    if (options.database) {
        app.locals.db = options.database;
    }
    if (options.filesystem) {
        app.locals.filesystem = options.filesystem;
    }
    if (options.config) {
        app.locals.config = options.config;
    }
    setupAPI(app);
    setupStaticServing(app, {
        frontendPath: options.frontendPath,
        isProduction: options.isProduction
    });
    const server = new Server(app);
    const io = setupWebSocket(server, {
        database: options.database
    });
    app.__pendingEvents = null;
    setGlobalIO(io);
    app.locals.io = io;
    if (options.database && options.filesystem) {
        const indexer = new IndexingWorker(options.database, options.filesystem);
        indexer.start().catch((error) => {
            console.error('[Server] Failed to start indexing worker:', error);
        });
        app.locals.indexer = indexer;
    }
    return { app, server };
}
//# sourceMappingURL=server.js.map