import express, { Express, Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import path from 'path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { setupStaticServing } from './static.js';
import { setupAPI } from './api/index.js';
import { setupWebSocket, setGlobalIO } from './websocket/server.js';
import { DatabaseManager, FilesystemManager, IPFSStorage } from './storage/index.js';
import { Config } from './config/loader.js';
import { IndexingWorker } from './storage/indexer.js';
import type { AIChatService } from './services/ai/AIChatService.js';
import { logger, createLogger } from './utils/logger.js';
import { getOrMintBootToken } from './api/setup/first-run-token.js';

const log = createLogger('server');

export interface ServerOptions {
    port: number;
    frontendPath: string;
    isProduction: boolean;
    database?: DatabaseManager;
    filesystem?: FilesystemManager;
    ipfs?: IPFSStorage;
    config?: Config;
    aiService?: AIChatService;
}

export function createServer (options: ServerOptions): { app: Express; server: Server } {
    const app = express();

    // Trust proxy headers (X-Forwarded-Proto, X-Forwarded-For) only from
    // local/private network hops. SEC-TRUST-PROXY (2026-04 audit): trusting
    // ALL hops would let any internet client spoof req.ip via X-Forwarded-For,
    // bypassing IP-based gates (rate limits, loopback checks). Note that
    // security-sensitive checks (e.g. requireSetupAuth) still use
    // req.socket.remoteAddress to be defense-in-depth against misconfig.
    app.set('trust proxy', 'loopback, linklocal, uniquelocal');

    // SEC-7 (2026-04 audit): mint and log the boot-time first-run token so
    // a remote operator can complete setup via X-First-Run-Token without
    // shipping creds. Token is single-use and lives only in memory; a
    // restart prints a fresh one. journalctl is the canonical retrieval path.
    try {
        const bootToken = getOrMintBootToken();
        log.info('═══════════════════════════════════════════════════════════════════');
        log.info('🔐 SETUP / FIRST-RUN TOKEN (single-use, memory-only)');
        log.info(`   X-First-Run-Token: ${bootToken}`);
        log.info('   Use ONLY for remote setup of /api/setup/* over a non-loopback');
        log.info('   connection. Local setup wizards via 127.0.0.1 do not need this.');
        log.info('═══════════════════════════════════════════════════════════════════');
    } catch ( err ) {
        log.warn('[Server] Failed to mint first-run token:', err instanceof Error ? err.message : String(err));
    }

    // Middleware
    // Handle text/plain;actually=json content type (used by Puter SDK)
    // Parse it as JSON by using express.text() first, then manually parsing in a follow-up middleware
    app.use(express.text({
        type: (req: any) => {
            const contentType = req.headers['content-type'] || '';
            return contentType.includes('text/plain') && contentType.includes('actually=json');
        },
    }));

    // Convert text body to JSON for text/plain;actually=json requests
    app.use((req: Request, res: Response, next: NextFunction) => {
        const contentType = (req as any).get('Content-Type') || '';
        if ( contentType.includes('text/plain') && contentType.includes('actually=json') && typeof (req as any).body === 'string' ) {
            try {
                // Only parse if body is not empty
                if ( (req as any).body && (req as any).body.trim().length > 0 ) {
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
                if ( (req as any).body && (req as any).body.trim().length > 0 ) {
                    log.error('[Middleware] Failed to parse text/plain;actually=json:', e);
                }
                (req as any).rawBody = (req as any).body;
                (req as any).body = {};
            }
        }

        // Capture raw body for /mkdir requests to debug body parsing issues
        if ( req.path === '/mkdir' && req.method === 'POST' ) {
            const rawBody = (req as any).rawBody || (req as any).body;
            log.debug('[Server] /mkdir request - Content-Type:', contentType);
            log.debug('[Server] /mkdir request - Body type:', typeof rawBody);
            log.debug('[Server] /mkdir request - Body value:', rawBody);
            log.debug('[Server] /mkdir request - Query:', req.query);
        }

        next();
    });

    // Handle binary data for /writeFile endpoint (PDFs, images, etc.)
    // CRITICAL: Accept ALL content types for /writeFile to handle Blobs from viewer app
    // The viewer app sends Blobs which may have various content types
    app.use('/writeFile', express.raw({
        type: '*/*', // Accept all content types for /writeFile
        limit: '10gb', // User's hardware -- no practical limit
    }));

    app.use(express.json({
        // 150mb covers two cases:
        //   1. Original use: AI chat payloads with large PDF text content (~10-50mb)
        //   2. v1.2 dapp-store capsule uploads via /api/storage/ipfs/add. The
        //      base64 encoding of a typical bundled-app tarball (~75-100mb
        //      compressed) inflates to ~100-130mb of JSON body, which busted
        //      the previous 50mb ceiling for any non-trivial capsule.
        // Per-route DoS guards still apply: /api/storage/ipfs/add enforces
        // its own 100mb decoded-size check on top of this. Owner-only auth
        // gates every route that accepts a body of this size.
        limit: '150mb',
        verify: (req: any, res, buf) => {
            // Capture raw body for debugging (especially for /drivers/call and /mkdir)
            if ( req.path === '/drivers/call' || req.path === '/mkdir' ) {
                req.rawBody = buf.toString('utf8');
                if ( req.path === '/mkdir' ) {
                    log.debug('[Server] /mkdir raw body buffer:', req.rawBody);
                    log.debug('[Server] /mkdir raw body length:', buf.length);
                }
            }
        },
    }));
    app.use(express.urlencoded({ extended: true }));

    // Make database, filesystem, ipfs, config, and AI service available to routes via app.locals
    if ( options.database ) {
        app.locals.db = options.database;
    }
    if ( options.filesystem ) {
        app.locals.filesystem = options.filesystem;
        // Phase 2-Globals: this (global as any).__filesystem write is
        // INTENTIONAL — it's the defensive fallback for the Drivers
        // tool-execution critical path in api/other.ts. If app.locals.filesystem
        // is somehow undefined at request time (which would be a serious bug),
        // the consumer there falls back to this global to keep tool execution
        // functional. This is a deliberate belt-and-suspenders pattern around a
        // critical path, not ambient authority — do NOT remove it without
        // also removing the consumer fallback. See PHASE-2-GLOBALS-CLEANUP
        // ticket §"Global 3" for the audit-permitted classification.
        (global as any).__filesystem = options.filesystem;
        logger.info('[Server] ✅ Filesystem stored in app.locals (with global fallback for Drivers critical path)');
    } else {
        logger.warn('[Server] ⚠️ No filesystem provided - tool execution will be disabled');
    }
    if ( options.ipfs ) {
        app.locals.ipfs = options.ipfs;
        logger.info('[Server] ✅ IPFS storage available in app.locals');
    }
    if ( options.config ) {
        app.locals.config = options.config;
    }
    if ( options.aiService ) {
        app.locals.aiService = options.aiService;
    }

    // Gzip/deflate text responses (the 3.2MB GUI bundle, JSON API payloads,
    // CSS/SVG). This is a no-op behind the supernode's nginx (which already
    // gzips) but is the only compression for self-hosted nodes served DIRECTLY
    // on the node port without a reverse proxy. The filter is deliberately
    // conservative — compressing the wrong response corrupts it:
    //   • text/event-stream  → SSE live streams (install progress, ENM feeds)
    //     get buffered and never flush. NEVER compress.
    //   • 206 / Content-Range → partial-content downloads (media seeking,
    //     File Explorer Range fetches) break when re-encoded. NEVER compress.
    //   • Content-Encoding already set → don't double-encode.
    //   • images/video/tarballs/octet-stream → `compression.filter`'s mime-db
    //     check already returns false (not compressible), so binary File
    //     Explorer downloads pass through untouched.
    // `compression` only rewrites RESPONSE bodies, so request body parsing,
    // uploads (/writeFile), and WebSocket/Socket.io are unaffected. Default
    // 1KB threshold skips tiny payloads. `x-no-compression` request header
    // and `Cache-Control: no-transform` opt out, per the library contract.
    app.use(compression({
        filter: (req: Request, res: Response): boolean => {
            const type = String(res.getHeader('Content-Type') || '');
            if (type.includes('text/event-stream')) return false;
            if (res.statusCode === 206 || res.getHeader('Content-Range')) return false;
            if (res.getHeader('Content-Encoding')) return false;
            return compression.filter(req, res);
        },
    }));

    // API routes (must come before static serving to avoid SPA fallback)
    setupAPI(app);

    // Static file serving (after API routes)
    setupStaticServing(app, {
        frontendPath: options.frontendPath,
        isProduction: options.isProduction,
    });

    // Create HTTP server
    const server = new Server(app);

    // Allow long-running uploads (45 min) -- prevents Node.js default 2 min timeout
    // from killing large file uploads mid-transfer
    server.timeout = 45 * 60 * 1000;
    server.keepAliveTimeout = 45 * 60 * 1000;

    // Determine user homes base directory for terminal isolation
    // Use data directory from config or derive from database path
    let userHomesBase = '';
    if ( options.config?.storage?.database_path ) {
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
    if ( options.database && options.filesystem ) {
        const indexer = new IndexingWorker(options.database, options.filesystem);
        indexer.start().catch((error) => {
            log.error('[Server] Failed to start indexing worker:', error);
        });
        // Store indexer in app.locals for potential API access
        app.locals.indexer = indexer;
    }

    // Cleanup old audit logs on startup (30-day retention)
    if ( options.database ) {
        try {
            const deleted = options.database.cleanupAgentAuditLogs(30);
            if ( deleted > 0 ) {
                log.info(`[Server] Cleaned up ${deleted} old audit log entries`);
            }
        } catch ( error: any ) {
            log.warn('[Server] Audit log cleanup failed (non-critical):', error.message);
        }
    }

    return { app, server };
}
