import express, { Express, Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import https from 'https';
import os from 'os';
import path from 'path';
import fs from 'fs';
import type { DatabaseManager, FilesystemManager } from '../storage/index.js';
import { Config } from '../config/loader.js';
import { baseRpcCall } from '../utils/rpc.js';
import { Server as SocketIOServer } from 'socket.io';
import { authenticate, requireOwner, corsMiddleware, errorHandler, AuthenticatedRequest } from './middleware.js';
import { logger, createLogger } from '../utils/logger.js';
const log = createLogger('api-index');
import { handleWhoami } from './whoami.js';
import { handleParticleAuth, handleGrantUserApp, handleGetUserAppToken, handleAuthChallenge } from './auth.js';
import { handleStat, handleReaddir, handleRead, handleWrite, handleMkdir, handleDelete, handleMove, handleRename, handleCopy } from './filesystem.js';
import { handleSign, handleVersion, handleOSUser, handleKV, handleRAO, handleContactUs, handleDriversCall, handleGetWallets, handleOpenItem, handleSuggestApps, handleItemMetadata, handleWriteFile, handleSetDesktopBg, handleSetProfilePicture } from './other.js';
import { handleAPIInfo, handleGetLaunchApps, handleDF, handleBatch, handleCacheTimestamp, handleStats } from './info.js';
import { handleFile } from './file.js';
import storageRouter from './storage.js';
import { mediaRouter } from './media.js';
import aiRouter from './ai.js';
import wasmRouter from './wasm.js';
import resourcesRouter from './resources.js';
import { handleSearch } from './search.js';
import { handleGetApp } from './apps.js';
import { handleGetVersions, handleGetVersion, handleRestoreVersion } from './versions.js';
import { createBackup, listBackups, downloadBackup, deleteBackup, restoreBackup } from './backup.js';
import { handleTerminalStats, handleTerminalAdminStats, handleDestroyAllTerminals, handleTerminalStatus, handleExecCommand, handleExecScript, handleListTools } from './terminal.js';
import { getTerminalService } from '../services/terminal/TerminalService.js';
import { handleListApiKeys, handleCreateApiKey, handleDeleteApiKey, handleRevokeApiKey, handleGetScopes } from './apikeys.js';
import { handleListTools as handleListAgentTools, handleGetTool, handleListCategories, handleGetOpenAPISchema } from './tools.js';
import { createPublicRouter, setBandwidthLimit, getCDNStats } from './public.js';
import type { IPFSStorage } from '../storage/ipfs.js';
import { checkTransportBinaries, ensureTransportBinaries, getInstallHint } from '../utils/binary-manager.js';
import { httpClientRouter } from './http-client.js';
import { gitRouter } from './git.js';
import { auditRouter, auditMiddleware } from './audit.js';
import { postOnRampEvent, getOnRampSummary, recordTelemetryOnce } from './telemetry.js';
import { rateLimitMiddleware, getRateLimitStatus } from './rate-limit.js';
import { schedulerRouter } from './scheduler.js';
import bosonRouter from './boson.js';
import setupRouter from './setup.js';
import updateRouter from './update.js';
import diagnoseRouter from './diagnose.js';
import supportRouter from './support.js';
import metricsRouter from './metrics.js';
import type { UpdateService } from '../services/UpdateService.js';
import { getClusterPinConfig, getClusterPinProbeState, getClusterPinRetryQueueSnapshot } from '../services/clusterPin.js';
import accessControlRouter from './access-control.js';
import didRouter from './did.js';
import walletRouter from './wallet.js';
import draftsRouter from './drafts.js';
import intentsRouter from './intents.js';
import gatewayRouter from './gateway.js';
import systemRouter from './system.js';
import contextRouter from './context.js';
import voiceRouter from './voice.js';
import { createInstalledAppsRouter } from './installed-apps.js';
import { AppInstallService } from '../services/AppInstallService.js';
import registryRouter from './registry.js';
import { createSupernodeRouter } from './supernode.js';

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

/**
 * SEC-A10 (2026-04-22 audit): per-IP rate limiters for the catalog reindex
 * trigger and the two upstream GraphQL forwarders. Protects from DoS / cost
 * amplification on otherwise-unauth surfaces. The reindex limiter is
 * deliberately strict (1 per 5 min) because the indexer is heavy even when
 * triggered by a legitimate client.
 *
 * The GraphQL proxies remain unauthenticated by design (they forward the
 * iframe app's own ela.city Bearer token to upstream), so per-IP rate
 * limiting is the only viable defence.
 */
const reindexRateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 1, // 1 trigger per 5 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many reindex requests. Try again in a few minutes.' },
});

const proxyGraphqlRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 proxied GraphQL queries per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many GraphQL requests to upstream proxy. Slow down.' },
});

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

    // Cookie parser (required for anti-snipe session cookies)
    app.use(cookieParser());

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

        let terminalStatus = 'not initialized';
        let terminalIsolation = 'unknown';
        try {
            const terminalService = getTerminalService();
            if (terminalService) {
                terminalStatus = terminalService.isAvailable() ? 'available' : 'unavailable';
                terminalIsolation = terminalService.getEffectiveIsolationMode();
            }
        } catch {
            terminalStatus = 'not available';
        }

        // Resolve the real PC2 version from the UpdateService (which reads
        // the project's package.json on boot). Fail-soft: if the service
        // hasn't been initialized yet, fall back to '0.0.0-dev' rather than
        // the ancient Puter '0.1.0' literal that confused users into
        // thinking their node was massively out-of-date.
        let pc2Version = '0.0.0-dev';
        try {
            const updateService = req.app.locals.updateService as UpdateService | undefined;
            if (updateService) {
                pc2Version = updateService.getCurrentVersion();
            }
        } catch {
            // UpdateService not yet constructed — keep the dev fallback.
        }

        // Cluster pinning summary (v1.2.7+) — public, low-detail. Tells operators
        // and dashboards whether this node is contributing to the supernode CDN.
        // Detailed diagnostics still live behind owner auth at
        // /api/storage/ipfs/cluster-pin.
        let clusterPinning: {
            enabled: boolean;
            url?: string;
            replication?: { min: number; max: number };
            lastProbe?: 'ok' | 'error' | 'unknown';
            retryQueueDepth?: number;
        } = { enabled: false };
        try {
            const cfg = getClusterPinConfig();
            if (cfg) {
                const probe = getClusterPinProbeState();
                const retry = getClusterPinRetryQueueSnapshot();
                let lastProbe: 'ok' | 'error' | 'unknown' = 'unknown';
                if (probe) {
                    if (probe.lastStatus === 'error') {
                        lastProbe = 'error';
                    } else if (typeof probe.lastStatus === 'number' && probe.lastStatus >= 200 && probe.lastStatus < 300) {
                        lastProbe = 'ok';
                    } else {
                        lastProbe = 'error';
                    }
                }
                clusterPinning = {
                    enabled: true,
                    url: cfg.url,
                    replication: { min: cfg.replicationMin, max: cfg.replicationMax },
                    lastProbe,
                    retryQueueDepth: retry?.size ?? 0,
                };
            }
        } catch {
            // clusterPin module not loaded (older build) — leave defaults.
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
            cluster: {
                pinning: typeof clusterPinning;
            };
            owner?: {
                set: boolean;
                tethered_wallets: number;
            };
        } = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: pc2Version,
            uptime: process.uptime(),
            database: dbStatus,
            ipfs: ipfsStatus,
            websocket: websocketStatus,
            terminal: {
                status: terminalStatus,
                isolationMode: terminalIsolation,
            },
            cluster: {
                pinning: clusterPinning,
            },
        };

        if (config) {
            health.owner = {
                set: config.owner.wallet_address !== null,
                tethered_wallets: config.owner.tethered_wallets.length,
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

    // System readiness endpoint (no auth required)
    // Reports transport availability for login screen health badge.
    //
    // v1.2.7.1: WireGuard and AmneziaWG checks now consult the live service
    // status (kernel/userspace mode) instead of probing only for the
    // wireguard-go userspace binary. A node running kernel-mode WireGuard
    // (the common case on modern Linux) was previously reported as "Missing"
    // because the check ignored kernel mode entirely. The service-driven
    // check passes when the tunnel transport is actually usable, regardless
    // of which implementation provides it. Falls back to the binary probe
    // when BosonService is not yet initialised (early-boot window).
    app.get('/api/system-readiness', (_req: Request, res: Response) => {
        const db = app.locals.db;
        const filesystem = app.locals.filesystem;
        const bosonService = app.locals.bosonService;

        const binaryChecks = checkTransportBinaries();
        const binaryByName = new Map(binaryChecks.map((b: { name: string; found: boolean; path: string | null }) => [b.name, b]));

        // Pull live transport status from BosonService when available — this
        // catches kernel-mode WireGuard which the binary probe misses.
        let wgStatus: { available: boolean; mode: 'kernel' | 'userspace' | 'none' } | null = null;
        let awgStatus: { available: boolean; connected: boolean } | null = null;
        // v1.2.7.8: also capture the *active* cascade selection for the GUI's
        // "what transport is actually being used?" indicator (Fix 3.A).
        let activeNatType: string | null = null;
        if (bosonService && typeof bosonService.getStatus === 'function') {
            try {
                const bosonStatus = bosonService.getStatus();
                wgStatus = bosonStatus?.wireguard || null;
                awgStatus = bosonStatus?.amneziaWG || null;
                activeNatType = bosonStatus?.connectivity?.natType || null;
            } catch { /* keep nulls — fall back to binary probe */ }
        }

        // v1.2.7.5: WireGuard readiness honours BOTH active-tunnel state
        // AND binary-on-disk presence. Previously, when BosonService had
        // selected an alternative transport (e.g. Stealth/AmneziaWG),
        // wgStatus.mode was 'none' and the readiness check reported
        // "No tunnel transport detected" + a spurious `brew install`
        // hint, even though wireguard-go was installed and ready to use.
        // The fix: binary present == ready, regardless of which transport
        // is currently active.
        const wgBinary = binaryByName.get('wireguard-go');
        const wgBinaryFound = !!wgBinary?.found;
        const wgActive = !!(wgStatus && wgStatus.mode !== 'none');
        const wgOk = wgActive || wgBinaryFound;
        const wgDetail = wgActive
            ? (wgStatus!.mode === 'kernel' ? 'Active (kernel mode)' : 'Active (userspace fallback)')
            : (wgBinaryFound ? `Installed (inactive — alternative transport in use)` : 'Not installed');

        const awgBinary = binaryByName.get('amneziawg-go');
        const awgOk = awgStatus ? awgStatus.available === true : !!awgBinary?.found;
        const awgDetail = awgStatus
            ? (awgStatus.available ? (awgStatus.connected ? 'Active (connected)' : 'Available') : 'Not installed')
            : (awgBinary?.found ? `Found at ${awgBinary.path}` : 'Not installed');

        const otherBinaries = binaryChecks.filter((b: { name: string }) => b.name !== 'wireguard-go' && b.name !== 'amneziawg-go');

        const checks = [
            {
                id: 'database',
                label: 'Database',
                status: db ? 'ok' as const : 'missing' as const,
                detail: db ? 'Connected' : 'Not initialized',
                fixable: false,
            },
            {
                id: 'ipfs',
                label: 'IPFS Storage',
                status: filesystem ? 'ok' as const : 'missing' as const,
                detail: filesystem ? 'Available' : 'Not initialized',
                fixable: false,
            },
            // Service-driven WireGuard check (kernel + userspace both count).
            // v1.2.7.2: include installHint when missing so launcher UI can
            // show the platform-specific brew/apt command directly.
            {
                id: 'wireguard-go',
                label: 'WireGuard',
                status: wgOk ? 'ok' as const : 'missing' as const,
                detail: wgDetail,
                fixable: !wgOk,
                fixAction: 'install-binaries',
                ...(wgOk ? {} : { installHint: getInstallHint('wireguard-go') }),
            },
            {
                id: 'amneziawg-go',
                label: 'AmneziaWG',
                status: awgOk ? 'ok' as const : 'missing' as const,
                detail: awgDetail,
                fixable: !awgOk,
                fixAction: 'install-binaries',
                ...(awgOk ? {} : { installHint: getInstallHint('amneziawg-go') }),
            },
            ...otherBinaries.map((b: { name: string; found: boolean; path: string | null }) => ({
                id: b.name,
                label: b.name === 'awg-quick' ? 'AWG Quick'
                    : b.name === 'sing-box' ? 'VLESS Transport'
                        : b.name,
                status: b.found ? 'ok' as const : 'missing' as const,
                detail: b.found ? `Found at ${b.path}` : 'Not installed',
                fixable: !b.found,
                fixAction: 'install-binaries',
                ...(b.found ? {} : { installHint: getInstallHint(b.name) }),
            })),
        ];

        const okCount = checks.filter(c => c.status === 'ok').length;

        // v1.2.7.8 Fix 3.A: surface the *active* transport so the GUI can stop
        // claiming "all good" when the cascade actually fell to ActiveProxy.
        // Pre-1.2.7.6 the X/Y indicator counted binaries on disk; users
        // reported "6/6 connected" while WireGuard/AmneziaWG/VLESS were
        // not in fact carrying any traffic. This object lets the GUI
        // render a distinct line: "Active transport: WireGuard" or
        // "Active transport: ActiveProxy (fallback)". The X/Y count
        // keeps its existing semantics for backward compatibility.
        const transportLabel: Record<string, string> = {
            wireguard: 'WireGuard',
            'amnezia-wireguard': 'AmneziaWG (Stealth)',
            'vless-reality': 'VLESS Reality (Stealth)',
            direct: 'Direct (no NAT)',
            upnp: 'UPnP',
            relay: 'ActiveProxy (NAT relay)',
            unknown: 'Discovering...',
        };
        const wgInstalled = wgBinaryFound || (wgStatus?.mode !== 'none' && !!wgStatus);
        const awgInstalled = !!awgBinary?.found || (awgStatus?.available === true);
        // Degraded = we're on relay/unknown but a tunnel transport IS installed.
        // If neither is installed there's nothing to degrade *from*, so don't flag.
        const transportNat = activeNatType || 'unknown';
        const onFallback = transportNat === 'relay' || transportNat === 'unknown';
        const transportDegraded = onFallback && (wgInstalled || awgInstalled);
        const transport = {
            active: transportNat,
            label: transportLabel[transportNat] || transportNat,
            degraded: transportDegraded,
            preferred: transportDegraded
                ? (wgInstalled ? 'wireguard' : awgInstalled ? 'amnezia-wireguard' : null)
                : null,
        };

        // Demote 'ready' → 'degraded' when the cascade is on a fallback even
        // though every component is present. The dot turns amber and the
        // user sees something is off without having to open the panel.
        const baseOverall = okCount === checks.length ? 'ready'
            : okCount >= checks.length - 1 ? 'degraded'
                : 'issues';
        const overall = (transportDegraded && baseOverall === 'ready') ? 'degraded' : baseOverall;

        res.json({ overall, checks, total: checks.length, ok: okCount, transport });
    });

    // System readiness fix endpoint (auth required — modifies system)
    app.post('/api/system-readiness/fix', authenticate, async (_req: AuthenticatedRequest, res: Response) => {
        try {
            const report = await ensureTransportBinaries();
            res.json({
                success: true,
                downloaded: report.downloaded,
                failed: report.failed,
                message: report.failed.length > 0
                    ? `Installed ${report.downloaded} binaries. Failed: ${report.failed.join(', ')}`
                    : `All transport binaries installed successfully (${report.downloaded} downloaded)`,
            });
        } catch (err) {
            res.status(500).json({ success: false, message: (err as Error).message });
        }
    });

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

        const nodeConfig = app.locals.config as Config | undefined;
        const uploadLimit = nodeConfig?.seeding?.max_upload_mbps ?? 0;
        if (uploadLimit > 0) {
            setBandwidthLimit(uploadLimit);
        }
    } else {
        logger.warn('[API] Public IPFS gateway disabled - database or filesystem not available');
    }

    // Authentication endpoints
    app.get('/auth/challenge', handleAuthChallenge);
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
            log.error('[User Profile] Error:', error);
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
            log.error('[User Profile] Error:', error);
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
                is_current: s.token === currentToken,
            }));

            res.json({ logins });
        } catch (error) {
            log.error('[Login History] Error:', error);
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
                    'Type': 'Wallet Session',
                },
            }));

            res.json(result);
        } catch (error) {
            log.error('[List Sessions] Error:', error);
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
            log.error('[Revoke Session] Error:', error);
            res.status(500).json({ error: 'Failed to revoke session' });
        }
    });

    // Apply rate limiting and audit middleware before routers so dDRM endpoints are covered
    app.use(rateLimitMiddleware());
    app.use(auditMiddleware);

    // Storage usage endpoint
    app.use('/api/storage', storageRouter);
    // NFT pin routes (in storageRouter at /nft/*) also mounted at /api/nft/*
    app.use('/api', storageRouter);
    app.use('/api/media', mediaRouter);
    app.use('/api/ai', aiRouter);
    app.use('/api/wasm', wasmRouter);
    app.use('/api/resources', resourcesRouter);
    app.use('/api/http', httpClientRouter);
    app.use('/api/git', gitRouter);
    app.use('/api/audit', auditRouter);
    app.use('/api/scheduler', schedulerRouter);
    app.use('/api/boson', bosonRouter);
    app.use('/api/setup', setupRouter);
    app.use('/api/update', updateRouter);
    // v1.2.7.1: structured diagnostic snapshot (auth-gated, opt-in pull)
    app.use('/api/diagnose', diagnoseRouter);
    app.use('/api/support', supportRouter);
    app.use('/api/metrics', metricsRouter);
    app.use('/api/access', accessControlRouter);
    app.use('/api/did', didRouter);
    app.use('/api/wallet', walletRouter);
    app.use('/api/drafts', draftsRouter);
    app.use('/api/intents', intentsRouter);
    app.use('/api/gateway', gatewayRouter);
    app.use('/api/system', systemRouter);
    app.use('/api/context', contextRouter);
    app.use('/api/ai', voiceRouter);
    app.use('/api/registry', registryRouter);
    app.use('/api/supernode', createSupernodeRouter());

    // Content Catalog (on-chain indexed content — public read, no auth needed for browsing)
    app.get('/api/catalog', (req: Request, res: Response) => {
        const catalogDb = req.app.locals.db as DatabaseManager | undefined;
        if (!catalogDb) return res.status(503).json({ error: 'Database not available' });

        const { asset_type, creator, channel, search, limit: l, offset: o } = req.query;
        const result = catalogDb.getCatalogItems({
            assetType: asset_type as string | undefined,
            creator: creator as string | undefined,
            channel: channel as string | undefined,
            search: search as string | undefined,
            limit: parseInt(l as string) || 50,
            offset: parseInt(o as string) || 0,
        });

        const pinnedCids = new Set(catalogDb.getPinnedCIDs());
        const enriched = result.items.map((item: any) => ({
            ...item,
            is_local: !!(item.content_cid && pinnedCids.has(item.content_cid)),
        }));

        res.json({ success: true, total: result.total, items: enriched });
    });

    /**
   * Trigger an immediate indexer scan. Called by the Creator app after channel
   * creation or minting so users don't wait up to scan_interval_minutes to see
   * their own new content. Internally guarded against concurrent scans.
   *
   * SEC-A10 (2026-04-22 audit): added authenticate + per-IP rate limit
   * (1/5min). Iframe creator app authenticates via Referer fallback (its
   * puter.auth.token URL param appears in the Referer header), so legitimate
   * use is unaffected.
   */
    app.post('/api/catalog/reindex', reindexRateLimiter, authenticate, async (req: Request, res: Response) => {
        const indexer = req.app.locals.indexerService;
        if (!indexer) return res.status(503).json({ error: 'Indexer not available' });
        try {
            const result = await indexer.triggerScan();
            res.json({ success: true, ...result });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/catalog/stats', (req: Request, res: Response) => {
        const catalogDb = req.app.locals.db as DatabaseManager | undefined;
        if (!catalogDb) return res.status(503).json({ error: 'Database not available' });

        const stats = catalogDb.getCatalogStats();
        const indexer = req.app.locals.indexerService;
        res.json({
            success: true,
            catalog: stats,
            indexer: indexer ? indexer.getStats() : { enabled: false },
        });
    });

    /**
     * v1.2.7.3: live indexer state for the Elacity Market UI's
     * "Catalog indexing X% complete" banner during the 15-minute fresh-install
     * warmup window. Returns per-version block-progress, an estimated time to
     * completion, and the current catalog row count. Public read (no auth)
     * because the data is non-sensitive and the UI polls it from an iframe.
     *
     * Response shape:
     *   {
     *     success: true,
     *     ready: boolean,                    // catalog has items + backfill done
     *     scanning: boolean,                 // a scan cycle is currently running
     *     isInitialBackfill: boolean,        // first-ever backfill in progress
     *     lastChainBlock: number,
     *     lastScanCompletedAt: number|null,
     *     estimatedSecondsRemaining: number|null,
     *     versions: { v3: { progressPct, blocksRemaining, ... } },
     *     catalog: { total, resolved, pending, channels }
     *   }
     */
    app.get('/api/catalog/indexer-status', (req: Request, res: Response) => {
        const catalogDb = req.app.locals.db as DatabaseManager | undefined;
        const indexer = req.app.locals.indexerService;
        if (!catalogDb) return res.status(503).json({ error: 'Database not available' });
        if (!indexer) return res.status(503).json({ error: 'Indexer not available' });

        const stats = catalogDb.getCatalogStats();
        const indexerStatus = indexer.getIndexerStatus();

        // channels-count via channel_metadata (separate from content_catalog)
        let channels = 0;
        try {
            const row = (catalogDb as any).getDB().prepare('SELECT COUNT(*) as c FROM channel_metadata').get() as any;
            channels = row?.c || 0;
        } catch {
            // channel_metadata may not exist yet on a partially-migrated install
        }

        const ready = !indexerStatus.isInitialBackfill && stats.resolved > 0;

        res.json({
            success: true,
            ready,
            scanning: indexerStatus.scanning,
            isInitialBackfill: indexerStatus.isInitialBackfill,
            lastChainBlock: indexerStatus.lastChainBlock,
            lastScanCompletedAt: indexerStatus.lastScanCompletedAt,
            estimatedSecondsRemaining: indexerStatus.estimatedSecondsRemaining,
            versions: indexerStatus.versions,
            catalog: {
                total: stats.total,
                resolved: stats.resolved,
                pending: stats.pending,
                failed: stats.failed,
                channels,
            },
        });
    });

    app.get('/api/catalog/content/:contentId', (req: Request, res: Response) => {
        const catalogDb = req.app.locals.db as DatabaseManager | undefined;
        if (!catalogDb) return res.status(503).json({ error: 'Database not available' });

        const item = catalogDb.getCatalogItemByContentId(req.params.contentId) as any;
        if (!item) return res.status(404).json({ error: 'Asset not found' });

        const pinnedCids = new Set(catalogDb.getPinnedCIDs());
        item.is_local = !!(item.content_cid && pinnedCids.has(item.content_cid));

        res.json({ success: true, item });
    });

    app.get('/api/catalog/asset/:address/:tokenId', (req: Request, res: Response) => {
        const catalogDb = req.app.locals.db as DatabaseManager | undefined;
        if (!catalogDb) return res.status(503).json({ error: 'Database not available' });

        const item = catalogDb.getCatalogItemByToken(req.params.address, req.params.tokenId) as any;
        if (!item) return res.status(404).json({ error: 'Asset not found in local catalog' });

        const pinnedCids = new Set(catalogDb.getPinnedCIDs());
        item.is_local = !!(item.content_cid && pinnedCids.has(item.content_cid));

        const channelMeta = catalogDb.getChannelMetadata(item.channel_address);
        if (channelMeta) {
            item._channelMeta = channelMeta;
        }

        res.json({ success: true, item });
    });

    app.get('/api/catalog/operative/:address', (req: Request, res: Response) => {
        const catalogDb = req.app.locals.db as DatabaseManager | undefined;
        if (!catalogDb) return res.status(503).json({ error: 'Database not available' });

        const item = catalogDb.getCatalogItemByOperative(req.params.address) as any;
        if (!item) return res.status(404).json({ error: 'Asset not found' });

        res.json({ success: true, item });
    });

    app.get('/api/catalog/providers/:cid', async (req: Request, res: Response) => {
        const catalogIpfs = ipfs;
        if (!catalogIpfs) return res.status(503).json({ error: 'IPFS not available' });

        const { cid } = req.params;

        // Probe in parallel:
        //   1. DHT findProviders — discovers libp2p peers re-announcing the CID
        //   2. Public HTTP gateways (ipfs.ela.city, dweb.link) — answers "is this
        //      reachable on the public web?" without requiring DHT participation.
        // The DHT alone often returns 0 even when content is pinned on Elacity's
        // Kubo gateway (Kubo doesn't always re-announce on a schedule libp2p can
        // see within a few seconds). Combining both gives the UI an accurate
        // "Replicated on Elacity" signal so we don't show a misleading
        // "This node only" badge on assets that are publicly available.
        const dhtPromise = catalogIpfs.countProviders(cid, 5000)
            .catch(() => -1);

        const PUBLIC_GATEWAYS = [
            { name: 'ipfs.ela.city', url: 'https://ipfs.ela.city/ipfs/' + encodeURIComponent(cid) },
            { name: 'dweb.link', url: 'https://dweb.link/ipfs/' + encodeURIComponent(cid) },
        ];

        async function probeGateway(g: { name: string; url: string }): Promise<{ name: string; reachable: boolean }> {
            try {
                const resp = await fetch(g.url, {
                    method: 'HEAD',
                    redirect: 'follow',
                    signal: AbortSignal.timeout(3000),
                });
                return { name: g.name, reachable: resp.ok };
            } catch {
                return { name: g.name, reachable: false };
            }
        }

        const gatewayProbes = Promise.all(PUBLIC_GATEWAYS.map(probeGateway));

        const [providerCount, gatewayResults] = await Promise.all([dhtPromise, gatewayProbes]);

        const reachableGateways = gatewayResults.filter(g => g.reachable).map(g => g.name);

        res.json({
            success: true,
            cid,
            providers: providerCount,
            gateways: gatewayResults,
            publiclyReachable: reachableGateways.length > 0,
        });
    });

    app.get('/api/catalog/creator/:address', (req: Request, res: Response) => {
        const catalogDb = req.app.locals.db as DatabaseManager | undefined;
        if (!catalogDb) return res.status(503).json({ error: 'Database not available' });

        const stats = catalogDb.getCreatorStats(req.params.address);
        const cdnStatsData = req.app.locals.seedingService?.getStats?.() ?? null;

        res.json({
            success: true,
            creator: req.params.address,
            ...stats,
            seeding: cdnStatsData ? {
                enabled: cdnStatsData.enabled,
                queueLength: cdnStatsData.queueLength,
                activeDownloads: cdnStatsData.activeDownloads,
                disk: cdnStatsData.disk,
            } : null,
        });
    });

    app.get('/api/catalog/channels', async (req: Request, res: Response) => {
        const catalogDb = req.app.locals.db as DatabaseManager | undefined;
        if (!catalogDb) return res.status(503).json({ error: 'Database not available' });

        const channels = catalogDb.getCatalogChannels();

        // Lazily resolve missing channel names from on-chain name() and cache.
        // Caps per-request to stay O(1) at scale — with 1M indexed channels, the
        // first N requests gradually populate metadata; each subsequent call is free.
        // Filter by optional ?creator=<addr> so per-user loads resolve just their channels.
        const creatorFilter = typeof req.query.creator === 'string' ? (req.query.creator as string).toLowerCase() : null;
        const visibleChannels = creatorFilter
            ? channels.filter(ch => (ch.creator || '').toLowerCase() === creatorFilter)
            : channels;

        const MAX_NAME_RESOLVES_PER_REQUEST = 25;
        const unresolved = visibleChannels.filter(ch => !ch.name).slice(0, MAX_NAME_RESOLVES_PER_REQUEST);

        if (unresolved.length > 0) {
            await Promise.all(unresolved.map(async (ch) => {
                try {
                    const result = await baseRpcCall('eth_call', [
                        { to: ch.address, data: '0x06fdde03' },
                        'latest',
                    ], 5000);
                    if (typeof result === 'string' && result.length >= 130) {
                        const hex = result.replace('0x', '');
                        const length = parseInt(hex.slice(64, 128), 16);
                        if (length > 0 && length < 256) {
                            const nameHex = hex.slice(128, 128 + length * 2);
                            const buf = Buffer.from(nameHex, 'hex');
                            const name = buf.toString('utf8').replace(/\0+$/, '').trim();
                            if (name) {
                                catalogDb.updateChannelMetadata(ch.address, { name });
                                ch.name = name;
                            }
                        }
                    }
                } catch (err: any) {
                    logger.debug(`[catalog/channels] name() resolve failed for ${ch.address}: ${err.message}`);
                }
            }));
        }

        const output = creatorFilter ? visibleChannels : channels;
        res.json({ success: true, total: output.length, data: output });
    });

    app.get('/api/catalog/channel/:address', (req: Request, res: Response) => {
        const catalogDb = req.app.locals.db as DatabaseManager | undefined;
        if (!catalogDb) return res.status(503).json({ error: 'Database not available' });

        const { address } = req.params;
        const meta = catalogDb.getChannelMetadata(address);
        res.json({ success: true, channel: meta || {} });
    });

    app.put('/api/catalog/channel/:address', authenticate, (req: AuthenticatedRequest, res: Response) => {
        const catalogDb = req.app.locals.db as DatabaseManager | undefined;
        if (!catalogDb) return res.status(503).json({ error: 'Database not available' });

        const { address } = req.params;
        const { name, description, categories, image, coverImage, plans, tokenAccess } = req.body || {};
        const wallet = req.user?.wallet_address;

        try {
            catalogDb.updateChannelMetadata(address, { name, description, categories, image, coverImage, plans, tokenAccess }, wallet);
            const updated = catalogDb.getChannelMetadata(address);
            res.json({ success: true, channel: updated });
        } catch (err: any) {
            logger.error(`[API] Channel metadata update failed: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/catalog/owned/:address', (req: Request, res: Response) => {
        const catalogDb = req.app.locals.db as DatabaseManager | undefined;
        if (!catalogDb) return res.status(503).json({ error: 'Database not available' });

        const { limit: l, offset: o } = req.query;
        const result = catalogDb.getOwnedCatalogItems(req.params.address, {
            limit: parseInt(l as string) || 50,
            offset: parseInt(o as string) || 0,
        });

        const pinnedCids = new Set(catalogDb.getPinnedCIDs());
        const enriched = result.items.map((item: any) => ({
            ...item,
            is_local: !!(item.content_cid && pinnedCids.has(item.content_cid)),
        }));

        res.json({ success: true, total: result.total, items: enriched });
    });

    app.get('/api/catalog/operatives', (req: Request, res: Response) => {
        const catalogDb = req.app.locals.db as DatabaseManager | undefined;
        if (!catalogDb) return res.status(503).json({ error: 'Database not available' });

        try {
            const db = catalogDb.getDB();
            const rows = db.prepare(`
        SELECT DISTINCT LOWER(operative_address) as address
        FROM content_catalog
        WHERE operative_address IS NOT NULL AND operative_address != ''
      `).all() as { address: string }[];
            res.json({ success: true, operatives: rows.map(r => r.address) });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/catalog/seeding', (req: Request, res: Response) => {
        const catalogDb = req.app.locals.db as DatabaseManager | undefined;
        if (!catalogDb) return res.status(503).json({ error: 'Database not available' });

        const seedingStats = catalogDb.getNodeSeedingStats();
        const seedingService = req.app.locals.seedingService;

        const cdn = getCDNStats();
        const uptimeMs = Date.now() - cdn.startedAt;

        res.json({
            success: true,
            seeding: seedingStats,
            service: seedingService ? seedingService.getStats() : null,
            cdn: {
                bytesServed: cdn.bytesServed,
                requestCount: cdn.requestCount,
                uptimeMs,
                avgBytesPerSec: uptimeMs > 0 ? Math.round(cdn.bytesServed / (uptimeMs / 1000)) : 0,
            },
        });
    });

    // Server-side cache for earnings RPC results (avoids repeated flaky calls to public RPC)
    // v1.2.7.5: cache partial results too with a shorter TTL so a flaky RPC
    // doesn't get re-hammered every poll cycle. Without this, when any
    // operative balanceOf failed the full response was never cached → next
    // 30s poll repeated the whole storm. Soft TTL serves the same partial
    // result for up to 5s, then re-tries.
    const earningsCache = new Map<string, { data: any; ts: number; partial: boolean }>();
    const EARNINGS_CACHE_TTL = 30_000;
    const EARNINGS_PARTIAL_TTL = 5_000;
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

    // V3 On-Chain Earnings — reads royalty share balances and claimable rewards from operatives
    // Returns items + rewards in a single response so the frontend only needs one fetch.
    // Categories: assets (per-asset), channels (aggregated by channel), my-channels (channels user owns)
    app.get('/api/catalog/earnings/:address', async (req: Request, res: Response) => {
        const catalogDb = req.app.locals.db as DatabaseManager | undefined;
        if (!catalogDb) return res.status(503).json({ error: 'Database not available' });

        const walletAddress = req.params.address;
        if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }

        const category = (req.query.category as string) || 'assets';
        const walletLabel = (req.query.walletLabel as string) || '';
        const forceRefresh = req.query.refresh === '1';
        const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

        // Serve from server-side cache if fresh (unless force-refresh)
        const cacheKey = `${walletAddress.toLowerCase()}:${category}`;
        if (!forceRefresh) {
            const cached = earningsCache.get(cacheKey);
            const ttl = cached?.partial ? EARNINGS_PARTIAL_TTL : EARNINGS_CACHE_TTL;
            if (cached && Date.now() - cached.ts < ttl) {
                return res.json(cached.data);
            }
        } else {
            earningsCache.delete(cacheKey);
        }

        try {
            const { ethers } = await import('ethers');
            const { getBaseRpcUrl, rotateBaseRpc } = await import('../utils/rpc.js');
            const provider = new ethers.JsonRpcProvider(getBaseRpcUrl());
            const OPERATIVE_ABI = [
                'function balanceOf(address account, uint256 id) view returns (uint256)',
                'function rewardsOf(address user, address payToken) view returns (uint256)',
            ];

            const { items: catalogItems } = catalogDb.getCatalogItems({ limit: 500 });

            // "my-channels" — return channels owned by this address with aggregated on-chain rewards
            if (category === 'my-channels') {
                const channels = catalogDb.getCatalogChannels();
                const owned = channels.filter(ch =>
                    ch.creator.toLowerCase() === walletAddress.toLowerCase());

                if (owned.length === 0) {
                    const emptyResp = { success: true, items: { total: 0, data: [] }, rewards: [] };
                    earningsCache.set(cacheKey, { data: emptyResp, ts: Date.now(), partial: false });
                    return res.json(emptyResp);
                }

                const OPERATIVE_ABI_MC = [
                    'function balanceOf(address account, uint256 id) view returns (uint256)',
                    'function rewardsOf(address user, address payToken) view returns (uint256)',
                ];

                async function callWithRetryMC(
                    opAddr: string,
                    call: (c: any) => Promise<bigint>,
                    retries = 3,
                ): Promise<bigint> {
                    for (let i = 0; i <= retries; i++) {
                        try {
                            const p = i === 0 ? provider : new ethers.JsonRpcProvider(getBaseRpcUrl());
                            const c = new ethers.Contract(opAddr, OPERATIVE_ABI_MC, p);
                            return await call(c);
                        } catch {
                            if (i < retries) {
                                rotateBaseRpc();
                                await new Promise(r => setTimeout(r, 200 * (i + 1)));
                            }
                        }
                    }
                    return BigInt(-1);
                }

                const channelResults: any[] = [];
                const rewardsSummaryMC: any[] = [];

                for (const ch of owned) {
                    // v1.2.7.5: also exclude zero-address operatives — they
                    // represent assets where on-chain operative deployment
                    // failed or is still pending; balanceOf on 0x0 always
                    // reverts (RPC noise + wasted retries).
                    const chAssets = catalogItems.filter(it =>
                        it.channel_address
                        && it.channel_address.toLowerCase() === ch.address.toLowerCase()
                        && it.operative_address
                        && it.operative_address.toLowerCase() !== ZERO_ADDRESS,
                    );

                    let totalRewards = 0;
                    let totalRoyaltyShares = 0;
                    const operativesWithRewards: string[] = [];

                    for (const asset of chAssets) {
                        try {
                            const royaltyBal = await callWithRetryMC(asset.operative_address!, (c) => c.balanceOf(walletAddress, 2));
                            if (royaltyBal === BigInt(-1)) continue;
                            const rewards = await callWithRetryMC(asset.operative_address!, (c) => c.rewardsOf(walletAddress, USDC));
                            const rewardsVal = rewards === BigInt(-1) ? BigInt(0) : rewards;
                            totalRoyaltyShares += Number(royaltyBal);
                            const rewardsUSDC = Number(ethers.formatUnits(rewardsVal, 6));
                            totalRewards += rewardsUSDC;
                            if (rewardsUSDC > 0) operativesWithRewards.push(asset.operative_address!);
                        } catch {
                            // skip failed operative
                        }
                    }

                    channelResults.push({
                        address: ch.address,
                        name: ch.name || 'Untitled Channel',
                        thumbnail: ch.image || null,
                        share: totalRoyaltyShares > 0 ? totalRoyaltyShares / 10 : 0,
                        beneficiary: walletAddress,
                        unclaimedRewards: totalRewards,
                        ledger: ch.address,
                        tokenId: '',
                        itemsCount: ch.itemsCount,
                        walletLabel,
                        operatives: operativesWithRewards,
                        distributions: totalRewards > 0 ? [{ volume: totalRewards, paymentToken: USDC }] : [],
                        __typename: 'OwnedChannel',
                    });

                    if (totalRewards > 0) {
                        for (const opAddr of operativesWithRewards) {
                            rewardsSummaryMC.push({
                                name: ch.name || 'Untitled Channel',
                                address: opAddr,
                                unclaimedRewards: totalRewards / operativesWithRewards.length,
                                distributions: [{ volume: totalRewards / operativesWithRewards.length, paymentToken: USDC }],
                            });
                        }
                    }
                }

                const mcResp = {
                    success: true,
                    items: { total: channelResults.length, data: channelResults },
                    rewards: rewardsSummaryMC,
                };
                earningsCache.set(cacheKey, { data: mcResp, ts: Date.now(), partial: false });
                return res.json(mcResp);
            }

            const operativeSet = new Map<string, typeof catalogItems>();
            for (const item of catalogItems) {
                if (!item.operative_address) continue;
                const opLower = item.operative_address.toLowerCase();
                // v1.2.7.5: skip zero-address operatives upfront — they
                // represent failed/pending operative deployments and any
                // balanceOf call against 0x0 reverts. Skipping pre-RPC
                // avoids wasted retries and log noise.
                if (opLower === ZERO_ADDRESS) continue;
                if (!operativeSet.has(opLower)) operativeSet.set(opLower, []);
                operativeSet.get(opLower)!.push(item);
            }

            interface EarningsItem {
                address: string;
                name: string;
                thumbnail: string | null;
                share: number;
                beneficiary: string;
                unclaimedRewards: number;
                ledger: string;
                tokenId: string;
                walletLabel: string;
                __typename: string;
            }

            const assetResults: EarningsItem[] = [];
            const rewardsSummary: Array<{
                name: string;
                address: string;
                unclaimedRewards: number;
                distributions: Array<{ volume: number; paymentToken: string }>;
            }> = [];

            let skippedCount = 0;

            function makeProvider() {
                return new ethers.JsonRpcProvider(getBaseRpcUrl());
            }

            async function callWithRetry(
                opAddr: string,
                call: (op: any) => Promise<bigint>,
                retries = 3,
            ): Promise<bigint> {
                for (let i = 0; i <= retries; i++) {
                    try {
                        const p = i === 0 ? provider : makeProvider();
                        const c = new ethers.Contract(opAddr, OPERATIVE_ABI, p);
                        return await call(c);
                    } catch {
                        if (i < retries) {
                            rotateBaseRpc();
                            await new Promise(r => setTimeout(r, 200 * (i + 1)));
                        }
                    }
                }
                return BigInt(-1);
            }

            // Query operatives sequentially to avoid public RPC rate-limiting
            for (const [opAddr, items] of operativeSet) {
                try {
                    const royaltyBal = await callWithRetry(opAddr, (op) => op.balanceOf(walletAddress, 2));
                    if (royaltyBal === BigInt(-1)) {
                        // v1.2.7.5: per-op transient RPC failure is noise at
                        // warn level. We summarise once at the end if any
                        // operative was skipped (see EARNINGS_PARTIAL_TTL
                        // logic below).
                        log.debug(`[Earnings] balanceOf failed for ${opAddr} after retries, skipping`);
                        skippedCount++;
                        continue;
                    }

                    // rewardsOf can legitimately revert when 0 rewards
                    const rewards = await callWithRetry(opAddr, (op) => op.rewardsOf(walletAddress, USDC));
                    const rewardsVal = rewards === BigInt(-1) ? BigInt(0) : rewards;

                    const royaltyCount = Number(royaltyBal);
                    const rewardsUSDC = Number(ethers.formatUnits(rewardsVal, 6));

                    if (royaltyCount > 0 || rewardsUSDC > 0) {
                        const item = items[0];
                        const sharePct = royaltyCount / 10;

                        assetResults.push({
                            address: opAddr,
                            name: item.name || 'Untitled',
                            thumbnail: item.image_url || null,
                            share: sharePct,
                            beneficiary: walletAddress,
                            unclaimedRewards: rewardsUSDC,
                            ledger: item.channel_address,
                            tokenId: item.token_id,
                            walletLabel,
                            __typename: 'RoyaltyAsset',
                        });

                        if (rewardsUSDC > 0) {
                            rewardsSummary.push({
                                name: item.name || 'Untitled',
                                address: opAddr,
                                unclaimedRewards: rewardsUSDC,
                                distributions: [{ volume: rewardsUSDC, paymentToken: USDC }],
                            });
                        }
                    }
                } catch (err) {
                    log.warn(`[Earnings] Operative ${opAddr} query failed:`, (err as Error).message);
                }
            }

            // For "channels" category, aggregate asset results by channel_address
            if (category === 'channels') {
                const channelMap = new Map<string, { items: EarningsItem[]; totalRewards: number; totalShare: number }>();
                for (const asset of assetResults) {
                    const chKey = asset.ledger.toLowerCase();
                    if (!channelMap.has(chKey)) channelMap.set(chKey, { items: [], totalRewards: 0, totalShare: 0 });
                    const entry = channelMap.get(chKey)!;
                    entry.items.push(asset);
                    entry.totalRewards += asset.unclaimedRewards;
                    entry.totalShare = Math.max(entry.totalShare, asset.share);
                }

                const channelResults: (EarningsItem & { itemsCount?: number })[] = [];
                for (const [chAddr, entry] of channelMap) {
                    const first = entry.items[0];
                    const catalogChannel = catalogDb.getCatalogChannels().find(
                        ch => ch.address.toLowerCase() === chAddr);
                    channelResults.push({
                        address: chAddr,
                        name: catalogChannel?.name || first.name || 'Untitled Channel',
                        thumbnail: catalogChannel?.image || first.thumbnail,
                        share: entry.totalShare,
                        beneficiary: walletAddress,
                        unclaimedRewards: entry.totalRewards,
                        ledger: chAddr,
                        tokenId: '',
                        walletLabel,
                        itemsCount: catalogChannel?.itemsCount || entry.items.length,
                        __typename: 'RoyaltyChannel',
                    });
                }

                const channelResponse = {
                    success: true,
                    items: { total: channelResults.length, data: channelResults },
                    rewards: rewardsSummary,
                    _partial: skippedCount > 0,
                };
                // v1.2.7.5: cache partial results too with a short TTL so a
                // flaky RPC doesn't get hammered every poll. Complete
                // results keep the long TTL for steady state.
                earningsCache.set(cacheKey, { data: channelResponse, ts: Date.now(), partial: skippedCount > 0 });
                return res.json(channelResponse);
            }

            // Default: "assets" category
            const assetsResponse = {
                success: true,
                items: { total: assetResults.length, data: assetResults },
                rewards: rewardsSummary,
                _partial: skippedCount > 0,
            };
            // v1.2.7.5: cache partial results with EARNINGS_PARTIAL_TTL so
            // we don't re-hammer the RPC on every poll. Single warn here
            // (instead of one per skipped operative) keeps logs scannable.
            earningsCache.set(cacheKey, { data: assetsResponse, ts: Date.now(), partial: skippedCount > 0 });
            if (skippedCount > 0) {
                log.warn(`[Earnings] ${skippedCount} operative(s) skipped due to RPC failures — caching partial result for ${EARNINGS_PARTIAL_TTL / 1000}s`);
            }
            res.json(assetsResponse);
        } catch (err: any) {
            log.warn('[Earnings] On-chain query failed:', err.message);
            res.status(500).json({ error: `Failed to query on-chain earnings: ${err.message}` });
        }
    });

    // GraphQL Proxy — avoids CORS when market app (localhost iframe) calls base.ela.city
    // SEC-A10 (2026-04-22 audit): per-IP rate limit only. Adding authenticate
    // here would break the marketplace iframe, which uses the Authorization
    // Bearer header to forward its own ela.city auth token to upstream — PC2
    // cannot intercept that header for session lookup without breaking that
    // contract. Per-IP rate-limit closes the DoS / cost-amplification surface
    // (which is the actual A10 finding).
    app.post('/api/elacity/graphql', proxyGraphqlRateLimiter, async (req: Request, res: Response) => {
        try {
            const upstream = 'https://base.ela.city/api/2.0/graphql';
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (req.headers.authorization) headers['Authorization'] = req.headers.authorization as string;
            if (req.headers['x-eth-signer']) headers['X-ETH-Signer'] = req.headers['x-eth-signer'] as string;

            const resp = await fetch(upstream, {
                method: 'POST',
                headers,
                body: JSON.stringify(req.body),
            });
            const data = await resp.text();
            res.status(resp.status).set('Content-Type', 'application/json').send(data);
        } catch (err: any) {
            res.status(502).json({ error: `GraphQL proxy failed: ${err.message || String(err)}` });
        }
    });

    // ESC NFT Marketplace — GraphQL proxy to ela.city/api (ESC backend with 54+ NFT collections)
    // SEC-A10 (2026-04-22 audit): per-IP rate limit only — same rationale as
    // /api/elacity/graphql above (forwards iframe's upstream auth header).
    app.post('/api/esc-nft/graphql', proxyGraphqlRateLimiter, async (req: Request, res: Response) => {
        try {
            const upstream = 'https://ela.city/api/2.0/graphql';
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (req.headers.authorization) headers['Authorization'] = req.headers.authorization as string;
            if (req.headers['x-eth-signer']) headers['X-ETH-Signer'] = req.headers['x-eth-signer'] as string;

            const resp = await fetch(upstream, {
                method: 'POST',
                headers,
                body: JSON.stringify(req.body),
            });
            const data = await resp.text();
            res.status(resp.status).set('Content-Type', 'application/json').send(data);
        } catch (err: any) {
            res.status(502).json({ error: `ESC NFT GraphQL proxy failed: ${err.message || String(err)}` });
        }
    });

    // ESC RPC Proxy — forwards JSON-RPC calls to Contabo ESC archive node (self-signed cert)
    const escRpcAgent = new https.Agent({ rejectUnauthorized: false });
    app.post('/api/esc-rpc', (req: Request, res: Response) => {
        const postData = JSON.stringify(req.body);
        const proxyReq = https.request({
            hostname: '38.242.211.112',
            port: 443,
            path: '/rpc/esc',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
            agent: escRpcAgent,
            timeout: 15000,
        }, (proxyRes) => {
            let body = '';
            proxyRes.on('data', (chunk) => {
                body += chunk;
            });
            proxyRes.on('end', () => {
                res.status(proxyRes.statusCode || 200).set('Content-Type', 'application/json').send(body);
            });
        });
        proxyReq.on('error', (err) => {
            res.status(502).json({ error: `ESC RPC proxy failed: ${err.message || String(err)}` });
        });
        proxyReq.on('timeout', () => {
            proxyReq.destroy();
            res.status(504).json({ error: 'ESC RPC proxy timeout' });
        });
        proxyReq.write(postData);
        proxyReq.end();
    });

    // ESC NFT Marketplace — REST catch-all proxy to ela.city/api (ESC backend)
    // Forwards /nftitems/*, /collection/*, /info/*, /like/*, /quotes/*, /2.0/graphql, etc.
    app.all('/api/esc-nft/:path(*)', async (req: Request, res: Response) => {
        try {
            const upstream = `https://ela.city/api/${req.params.path}`;
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (req.headers.authorization) headers['Authorization'] = req.headers.authorization as string;
            if (req.headers['x-eth-signer']) headers['X-ETH-Signer'] = req.headers['x-eth-signer'] as string;

            const fetchOpts: RequestInit = {
                method: req.method,
                headers,
            };

            if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
                fetchOpts.body = JSON.stringify(req.body);
            }

            const resp = await fetch(upstream, fetchOpts);
            const contentType = resp.headers.get('content-type') || 'application/json';
            const data = await resp.arrayBuffer();
            res.status(resp.status).set('Content-Type', contentType).send(Buffer.from(data));
        } catch (err: any) {
            res.status(502).json({ error: `ESC NFT REST proxy failed: ${err.message || String(err)}` });
        }
    });

    // Installed Apps (dApp Store) — requires db for registration
    if (db) {
        const dataDir = process.env.PC2_DATA_DIR || path.join(process.cwd(), 'data');
        const appInstallService = new AppInstallService(db, ipfs, dataDir);
        app.locals.appInstallService = appInstallService;
        app.use('/api/installed-apps', authenticate, createInstalledAppsRouter(appInstallService));
        logger.info('[API] ✅ Installed Apps API enabled at /api/installed-apps');

        // Sync bundled test apps on every startup.
        //
        // v1.2 boot policy: only auto-install apps whose manifest declares
        // `role: "system"`. These are the four core capsules that ship as
        // pre-installed defaults (Market, Player, Creator, dDRM Viewer).
        // Apps with `role: "dapp"` (Glide, Elastos NFT) and untagged dev/test
        // artifacts (supernode-manager, wallet-test) are intentionally NOT
        // auto-installed — users discover and install them via the dApp
        // Centre. (`pc2-media-runtime` carries `role: "system"` because it is
        // the required DASH/CENC runtime for `.ddrm` capsule playback.)
        //
        // We also opportunistically uninstall any previously auto-installed
        // non-system bundle (identifiable by `cid` starting with `local:`)
        // so upgrading testers see the same clean catalog as fresh installs.
        // Real dApp-Centre installs have a real IPFS CID and are untouched.
        const testAppsDir = path.join(dataDir, 'test-apps');
        if (fs.existsSync(testAppsDir)) {
            const systemBundleNames = new Set<string>();

            for (const appFolder of fs.readdirSync(testAppsDir, { withFileTypes: true })) {
                if (!appFolder.isDirectory()) continue;
                const appName = appFolder.name;

                const manifestPath = path.join(testAppsDir, appName, 'app.json');
                if (!fs.existsSync(manifestPath)) continue;

                let manifest: any;
                try {
                    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                } catch (err: any) {
                    logger.warn(`[API] ⚠️  Failed to read ${appName}/app.json: ${err.message}`);
                    continue;
                }

                if (manifest.role !== 'system') {
                    // Non-system bundle: skip auto-install. (Cleanup of any prior
                    // local: install for this name happens in the second pass below.)
                    continue;
                }

                systemBundleNames.add(appName);

                try {
                    const existing = appInstallService.get(appName);
                    if (existing) appInstallService.uninstall(appName);
                    appInstallService.installFromLocal(manifest, path.join(testAppsDir, appName));
                    logger.info(`[API] ✅ Synced bundled system app: ${appName}`);
                } catch (err: any) {
                    logger.warn(`[API] ⚠️  Failed to sync ${appName}: ${err.message}`);
                }
            }

            // Cleanup pass: prune installs that should no longer be launchable.
            try {
                const allInstalled = appInstallService.list();
                const installedAppsDir = appInstallService.getAppsDir();
                for (const inst of allInstalled) {
                    // System bundles are re-synced fresh above — never prune them.
                    if (systemBundleNames.has(inst.app_name)) continue;

                    // (a) Stale local: install for a test-apps bundle that is no
                    //     longer marked system (e.g. glide-finance, elastos-nft,
                    //     supernode-manager, wallet-test from earlier boots when
                    //     they were briefly role:system).
                    const isStaleLocalBundle = inst.cid?.startsWith('local:') === true;

                    // (b) Orphaned install — the DB row survives but the app's
                    //     on-disk files are gone (manual delete, partial/failed
                    //     install, IPFS unpin). Launching it 404s and the window
                    //     falls back to loading the PC2 root GUI ("an OS inside a
                    //     window"). Prune regardless of cid scheme so it stops
                    //     appearing in the launcher / dApp Centre. The user can
                    //     reinstall it cleanly from the dApp store.
                    const isOrphaned = !fs.existsSync(path.join(installedAppsDir, inst.app_name));

                    if (!isStaleLocalBundle && !isOrphaned) continue;

                    try {
                        appInstallService.uninstall(inst.app_name);
                        const reason = isOrphaned ? 'orphaned (files missing)' : 'stale auto-installed bundle';
                        logger.info(`[API] 🧹 Removed ${reason}: ${inst.app_name} (cid=${inst.cid})`);
                    } catch (err: any) {
                        logger.warn(`[API] ⚠️  Failed to clean up ${inst.app_name}: ${err.message}`);
                    }
                }
            } catch (err: any) {
                logger.warn(`[API] ⚠️  Failed to enumerate installed apps for cleanup: ${err.message}`);
            }
        }
    }

    // Telemetry hook (A5b §P0): fire `install_started` exactly once per
    // node lifetime. Idempotent — safe to call on every boot; the helper
    // checks the settings key `telemetry_install_started_at` and no-ops
    // after the first fire. This marks "Door 1" of the v1.2 funnel.
    recordTelemetryOnce(app.locals.db as DatabaseManager | undefined, 'install_started');

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
            wallet: `${req.user.wallet_address.substring(0, 10)}...`,
            api_key_id: apiKeyId || 'session',
            limits: status,
        });
    });

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

    // Batch endpoint with multer for multipart file uploads.
    // Uses diskStorage to stream uploads to a temp dir instead of buffering
    // entirely in RAM -- critical for large files on memory-constrained devices.
    // Prefer data directory over os.tmpdir() because /tmp is often tmpfs (RAM-backed)
    // and can't hold large files on memory-constrained devices like Jetson.
    const config = app.locals.config as Config | undefined;
    const dataDir = config?.storage?.database_path ? path.dirname(config.storage.database_path) : null;
    const uploadTmpDir = dataDir
        ? path.join(dataDir, 'tmp', 'pc2-uploads')
        : path.join(os.tmpdir(), 'pc2-uploads');
    if (!fs.existsSync(uploadTmpDir)) fs.mkdirSync(uploadTmpDir, { recursive: true });
    logger.info(`[API] Upload temp directory: ${uploadTmpDir}`);

    // SEC-A19 (2026-04 Wave 5.5): the on-disk filename MUST NOT include
    // `file.originalname` directly. `originalname` is attacker-controlled
    // and `path.join(uploadDir, '${ts}-${rand}-../../../etc/cron.d/evil')`
    // normalizes to `/etc/cron.d/evil`. Use a synthetic safe filename for
    // disk and rely on `req.file.originalname` (preserved by multer) for
    // any handler that needs the client-supplied name.
    const upload = multer({
        storage: multer.diskStorage({
            destination: uploadTmpDir,
            filename: (_req, _file, cb) => {
                const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                cb(null, `${unique}.upload`);
            },
        }),
        limits: {
            fileSize: Infinity, // No artificial limit -- user's hardware, user's resources
        },
    });

    // Restore endpoint with disk-based storage (backups can be GB — avoids OOM)
    const restoreUploadDir = path.join(uploadTmpDir, 'restore');
    if (!fs.existsSync(restoreUploadDir)) fs.mkdirSync(restoreUploadDir, { recursive: true });

    // SEC-A19 (2026-04 Wave 5.5): same as above. The route-level
    // `isValidBackupFilename` check (Wave 5) gates *use* of the backup;
    // the pre-write `fileFilter` here gates *write* of the backup. Both
    // layers are required because multer writes to disk before the route
    // handler sees the request.
    const VALID_BACKUP_NAME = /^[A-Za-z0-9_.-]+\.tar\.gz$/;
    const restoreUpload = multer({
        storage: multer.diskStorage({
            destination: restoreUploadDir,
            filename: (_req, _file, cb) => {
                const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                cb(null, `${unique}.tar.gz`);
            },
        }),
        fileFilter: (_req, file, cb) => {
            const baseName = path.basename(file.originalname || '');
            if (!VALID_BACKUP_NAME.test(baseName)) {
                cb(new Error('Invalid backup filename. Use only letters, numbers, dot, underscore, hyphen; must end in .tar.gz.'));
                return;
            }
            cb(null, true);
        },
        limits: {
            fileSize: 10 * 1024 * 1024 * 1024, // 10GB max file size for backups
        },
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
    // No auth middleware: this is a read-only proxy for fully-public on-chain
    // data (`https://esc.elastos.io/api`). Same pattern as `/api/rpc/esc` in
    // static.ts — the upstream reference (`src/backend/src/routers/elastos-proxy.js`)
    // also has no auth gate. Requiring a token here would only break the wallet
    // panel's `fetch()` call in `src/gui/src/services/WalletService.js:1700`,
    // which does not attach one (bug: mock server matches this behavior).
    app.get('/api/elastos/transactions', async (req: Request, res: Response) => {
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

    // Backup management endpoints — owner-only.
    // Wave 5 (A3): backups contain the owner's mnemonic, identity keys, and
    // every wallet's data. Tethered wallets must never be able to create,
    // list, download, delete, or restore them. `requireOwner` is the gate;
    // the handlers also use execFile + strict filename whitelist as
    // defense-in-depth.
    app.post('/api/backups/create', authenticate, requireOwner, createBackup);
    app.get('/api/backups', authenticate, requireOwner, listBackups);
    app.get('/api/backups/download/:filename', authenticate, requireOwner, downloadBackup);
    app.delete('/api/backups/:filename', authenticate, requireOwner, deleteBackup);
    app.post('/api/backups/restore', authenticate, requireOwner, restoreUpload.single('file'), restoreBackup);

    // Terminal endpoints
    app.get('/api/terminal/status', handleTerminalStatus); // No auth - check if available
    app.get('/api/terminal/stats', authenticate, handleTerminalStats);
    app.get('/api/terminal/admin/stats', authenticate, handleTerminalAdminStats);
    app.post('/api/terminal/destroy-all', authenticate, handleDestroyAllTerminals);

    // Terminal command execution API (for AI agents)
    // Wave 5 (A1): owner-only — these endpoints execute arbitrary processes on
    // the node and were previously reachable by any tethered wallet (RCE).
    app.post('/api/terminal/exec', authenticate, requireOwner, handleExecCommand);
    app.post('/api/terminal/script', authenticate, requireOwner, handleExecScript);
    app.get('/api/terminal/tools', authenticate, requireOwner, handleListTools);

    // API Keys management (for agent authentication)
    app.get('/api/keys', authenticate, handleListApiKeys);
    app.post('/api/keys', authenticate, handleCreateApiKey);
    app.delete('/api/keys/:keyId', authenticate, handleDeleteApiKey);
    app.post('/api/keys/:keyId/revoke', authenticate, handleRevokeApiKey);
    app.get('/api/keys/scopes', handleGetScopes); // No auth needed - just lists available scopes

    // Telemetry on-ramp (A5 §P0): anonymous funnel events for v1.2 launch.
    // POST is owner-only — only the node owner can attribute their own
    // funnel progress. GET returns aggregated counts only (no PII, no raw
    // rows) and is intentionally public so a static dashboard can poll it.
    // Env var PC2_TELEMETRY_DISABLED=true short-circuits the POST.
    app.post('/api/telemetry/onramp', authenticate, requireOwner, postOnRampEvent);
    app.get('/api/telemetry/onramp/summary', getOnRampSummary);

    // Agent Tool Registry (for AI agent discovery)
    app.get('/api/tools', handleListAgentTools); // Optional auth - shows scopes if authenticated
    app.get('/api/tools/categories', handleListCategories);
    app.get('/api/tools/openapi', handleGetOpenAPISchema);
    app.get('/api/tools/:name', handleGetTool);

    // Error handling middleware (must be last)
    app.use(errorHandler);
}
