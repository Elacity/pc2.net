// Load pc2-node/.env BEFORE any module reads process.env
// (clusterPin, AI providers, comms gateways all check env at module-init time,
//  so dotenv must run first or they see empty values).
// .env is gitignored; survives `git reset --hard origin/main` during update.sh.
// See pc2-node/.env.example for the full opt-in env var catalogue.
import 'dotenv/config';

// Global error handlers MUST be registered first, before any other imports
// This prevents WASM modules from registering their own crash-happy handlers.
//
// v1.2.7.2: capture last error + final exit code so silent crashes leave a
// breadcrumb in the launcher log. Pre-32 we had no exit-code breadcrumb,
// which is why the publish_drafts crash on fresh Macs looked like PC2 just
// vanished — it was actually exiting cleanly somewhere else with an error
// the launcher swallowed.
//
// All writes here use console.error directly (NOT the buffered logger) so
// they survive a forced exit — `process.on('exit', ...)` runs synchronously
// and async log writes would be lost.
let lastErrorCapture: { source: string; message: string; stack?: string } | null = null;

process.on('unhandledRejection', (reason: any, _promise: Promise<any>) => {
  const message = reason?.message || String(reason);
  const stack = reason?.stack;
  lastErrorCapture = { source: 'unhandledRejection', message, stack };

  // Log but don't crash - many rejections are recoverable (e.g., 409 Telegram conflicts)
  console.error('[PC2] Unhandled Promise Rejection:', message);
  if (stack) console.error(stack);

  // Only exit on truly fatal errors
  if (reason?.code === 'EADDRINUSE') {
    console.error('[PC2] Fatal: Port already in use, exiting');
    process.exit(1);
  }
});

process.on('uncaughtException', (error: Error) => {
  lastErrorCapture = { source: 'uncaughtException', message: error.message, stack: error.stack };

  console.error('[PC2] Uncaught Exception:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }

  // Only exit on truly fatal errors that we can't recover from
  if ((error as any).code === 'EADDRINUSE') {
    process.exit(1);
  }
});

// Final-exit breadcrumb: this is the line we wished we had on 2026-05-03
// when fresh Macs were exiting with code 1 silently. Synchronous-only —
// no async work allowed in `exit` handlers.
process.on('exit', (code) => {
  if (code === 0 && !lastErrorCapture) {
    console.error('[PC2] exit code=0 (clean shutdown)');
    return;
  }
  console.error(`[PC2] exit code=${code}${lastErrorCapture ? ` last_error_source=${lastErrorCapture.source}` : ''}`);
  if (lastErrorCapture) {
    console.error(`[PC2] last_error_message: ${lastErrorCapture.message}`);
    if (lastErrorCapture.stack) {
      console.error(`[PC2] last_error_stack:\n${lastErrorCapture.stack}`);
    }
  }
});

// `beforeExit` only fires when the event loop drains naturally (NOT after
// process.exit). Useful to distinguish "exited cleanly because we were
// done" from "exited via process.exit somewhere".
process.on('beforeExit', (code) => {
  console.error(`[PC2] beforeExit code=${code} (event loop drained, no more work scheduled)`);
});

import { createServer } from './server.js';
import { DatabaseManager, IPFSStorage, FilesystemManager, type IPFSNetworkMode, setGlobalDatabase } from './storage/index.js';
import { loadConfig, type Config } from './config/loader.js';
import { logger, createLogger } from './utils/logger.js';

const log = createLogger('pc2');
import { AIChatService } from './services/ai/AIChatService.js';
import { BosonService } from './services/boson/index.js';
import { ContentSeedingService } from './services/ContentSeedingService.js';
import { ContentIndexerService } from './services/ContentIndexerService.js';
import { initBaseRpcPool } from './utils/rpc.js';
import { getGatewayService, createChannelBridge } from './services/gateway/index.js';
import { getNodeConfig } from './api/setup.js';
import { RuntimeHeartbeat } from './utils/runtime-heartbeat.js';
import { getWASMRuntime } from './services/wasm/WASMRuntime.js';
import { getUpdateService } from './services/UpdateService.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync as fsReadFileSync, existsSync as fsExistsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration
let config: Config;
try {
  config = loadConfig();
  logger.info('✅ Configuration loaded');

  // Supernode RPC proxy (SUPERNODE-RPC-PROXY task): when the operator has
  // pointed this node at one or more supernode-backed Base RPC endpoints via
  // the SUPERNODE_RPC_URLS env var (comma-separated), prepend them to the
  // shared pool so they are tried before any public fallback. Empty/undefined
  // = no change to existing behavior.
  const supernodeRpcUrls = (process.env.SUPERNODE_RPC_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // Per RPC-PROXY-UNIFICATION-2026-05: when this node is publicly
  // reachable, the operator can point `config.blockchain.public_proxy_url`
  // at our own `/api/rpc/base`. The encode pipeline + non-media Lit path
  // then embed THIS URL into PSSH/access conditions, so Lit Action
  // access checks go through our caching + multi-RPC fallback proxy
  // instead of a single public RPC. Falsy = preserve pre-task behavior.
  initBaseRpcPool(
    config.content_indexer?.rpc_urls,
    supernodeRpcUrls,
    config.blockchain?.public_proxy_url,
    config.blockchain?.rpc_unhealthy_cooldown_ms,
  );
} catch (error) {
  logger.error('❌ Failed to load configuration:', error);
  process.exit(1);
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : config.server.port;
const FRONTEND_PATH = join(__dirname, '../frontend');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Database path (from config or env)
const DB_PATH = process.env.DB_PATH || config.storage.database_path;

// IPFS repo path (from config or env)
const IPFS_REPO_PATH = process.env.IPFS_REPO_PATH || config.storage.ipfs_repo_path;

  // Global storage instances
  let db: DatabaseManager | null = null;
  let ipfs: IPFSStorage | null = null;
  let filesystem: FilesystemManager | null = null;
  let aiService: AIChatService | null = null;
  let bosonService: BosonService | null = null;
  let seedingService: ContentSeedingService | null = null;
  let indexerService: ContentIndexerService | null = null;
  let heartbeat: RuntimeHeartbeat | null = null;

// Resolve current pc2-node version from package.json by walking up from
// the compiled module location. Falls back to "0.0.0-dev" for ts-node /
// snapshot builds where package.json isn't on the expected path.
//
// Mirrors UpdateService.loadCurrentVersion (intentionally duplicated to
// avoid pulling UpdateService into the heartbeat startup path — that
// service has its own initialization concerns and is not always loaded).
function resolveCurrentVersion(): string {
  if (process.env.PC2_VERSION) return process.env.PC2_VERSION;
  const candidates = [
    join(__dirname, '..', 'package.json'),
    join(__dirname, '..', '..', 'package.json'),
    join(process.cwd(), 'package.json'),
    join(process.cwd(), '..', 'package.json'),
  ];
  for (const path of candidates) {
    if (fsExistsSync(path)) {
      try {
        const pkg = JSON.parse(fsReadFileSync(path, 'utf-8'));
        if (pkg && typeof pkg.version === 'string' && pkg.version.length > 0) {
          return pkg.version;
        }
      } catch {
        // Try next candidate
      }
    }
  }
  return '0.0.0-dev';
}

async function main() {
  logger.info('Starting PC2 Node...');
  logger.info(`Port: ${PORT}`);
  logger.info(`Frontend path: ${FRONTEND_PATH}`);
  logger.info(`Database path: ${DB_PATH}`);
  logger.info(`IPFS repo path: ${IPFS_REPO_PATH}`);
  logger.info(`Mode: ${IS_PRODUCTION ? 'production' : 'development'}`);

  // Initialize database
  try {
    db = new DatabaseManager(DB_PATH);
    db.initialize();
    
    // Set global database singleton for access from services
    setGlobalDatabase(db);

    // T-1C Phase 1: register the metric registry's process-wide DB handle
    // now that the schema is open (migration 33 has run). Domain helpers
    // that don't have an Express request context (e.g. chipotle-client,
    // dashPackager) call `recordMetricCounter()` without threading a
    // DatabaseManager and pick this handle up automatically.
    const { setMetricsDb } = await import('./utils/metrics.js');
    setMetricsDb(db);
    
    // Cleanup expired sessions on startup
    const cleaned = db.cleanupExpiredSessions();
    if (cleaned > 0) {
      logger.info(`🧹 Cleaned up ${cleaned} expired session(s)`);
    }
  } catch (error) {
    logger.error('❌ Failed to initialize database:', error);
    process.exit(1);
  }

  // Initialize IPFS
  try {
    // Get IPFS config from config file
    const ipfsConfig = (config as any).ipfs || {};
    const ipfsMode = (ipfsConfig.mode || 'private') as IPFSNetworkMode;
    
    const relayMode = db.getSetting('relay_mode') === 'true';
    const relayMaxConnections = parseInt(db.getSetting('relay_max_connections') || '100', 10);

    // Elacity peers: ENV var wins (operator-controlled), then config file, then default hardcoded.
    // Empty string in ENV (e.g. ELACITY_IPFS_MULTIADDRS=) explicitly disables peering.
    const envElacity = process.env.ELACITY_IPFS_MULTIADDRS;
    let elacityBootstrap: string[] | undefined;
    if (envElacity !== undefined) {
      elacityBootstrap = envElacity
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else if (Array.isArray(ipfsConfig.elacity_bootstrap)) {
      elacityBootstrap = ipfsConfig.elacity_bootstrap;
    }

    ipfs = new IPFSStorage({
      repoPath: IPFS_REPO_PATH,
      mode: ipfsMode,
      enableDHT: ipfsConfig.enable_dht,
      dhtClientMode: ipfsConfig.dht_client_mode,
      enableBootstrap: ipfsConfig.enable_bootstrap,
      autoAnnounceOnStore: ipfsConfig.auto_announce_on_store !== false,
      prefetchOnStore: ipfsConfig.prefetch_on_store !== false,
      publicGatewayPrefetchUrl: ipfsConfig.public_gateway_prefetch_url,
      customBootstrap: ipfsConfig.custom_bootstrap,
      supernodeBootstrap: ipfsConfig.supernode_bootstrap,
      elacityBootstrap,
      relayBootstrap: ipfsConfig.relay_bootstrap,
      relayMode,
      relayMaxConnections,
    });
    await ipfs.initialize();

    // Expose IPFS storage globally for API access (relay status, etc.)
    (global as any).ipfsStorage = ipfs;
    
    // Create filesystem manager
    filesystem = new FilesystemManager(ipfs, db);
    logger.info('✅ Filesystem manager initialized');
    logger.info(`   IPFS mode: ${ipfsMode}`);

    // Initialize content seeding service (silent CDN participation)
    seedingService = new ContentSeedingService(config);
    seedingService.initialize(ipfs, db);
  } catch (error) {
    logger.error('❌ Failed to initialize IPFS:', error);
    logger.warn('   File storage will not be available');
    // Don't exit - server can still run without IPFS (for development)
  }

  // Initialize content indexer (on-chain content catalog)
  try {
    indexerService = new ContentIndexerService(config);
    indexerService.initialize(db!, ipfs, getWASMRuntime());
  } catch (error) {
    logger.error('❌ Failed to initialize content indexer:', error);
    logger.warn('   Content discovery will fall back to Elacity GraphQL');
  }

  // Initialize AI, Gateway, and Boson in parallel — they're independent of each other,
  // only require DB (sync, already done) and optionally IPFS (already done).
  // This cuts cold-start time significantly vs sequential initialization.

  const initAI = async () => {
    if (config.ai?.enabled === false) {
      logger.info('ℹ️  AI service disabled in config');
      return;
    }
    try {
      aiService = new AIChatService(config.ai, db!);
      await aiService.initialize();
      if (aiService.isAvailable()) {
        const providers = aiService.listProviders();
        logger.info(`🤖 AI service initialized (providers: ${providers.join(', ')})`);
      } else {
        logger.warn('⚠️  AI service initialized but no providers available');
        logger.info('   💡 Install Ollama: curl -fsSL https://ollama.com/install.sh | sh');
        logger.info('   💡 Or add API keys for cloud providers in config');
      }
    } catch (error) {
      logger.error('❌ Failed to initialize AI service:', error);
      logger.warn('   AI features will not be available');
    }
  };

  const initGateway = async () => {
    try {
      const gatewayService = getGatewayService(db!);
      await gatewayService.initialize();
      return gatewayService;
    } catch (error) {
      logger.error('❌ Failed to initialize gateway service:', error);
      return null;
    }
  };

  const initBoson = async () => {
    const bosonConfig = (config as any).boson || {};
    if (bosonConfig.enabled === false) {
      logger.info('ℹ️  Boson service disabled in config');
      return;
    }
    try {
      const dataDir = dirname(DB_PATH);
      bosonService = new BosonService({
        dataDir,
        gatewayUrl: bosonConfig.gateway_url || 'https://69.164.241.210',
        publicDomain: bosonConfig.public_domain || 'ela.city',
        localPort: PORT,
        autoConnect: bosonConfig.auto_connect !== false,
        stealthMode: bosonConfig.stealth_mode === true,
        superNodes: bosonConfig.supernodes,
      });
      
      await bosonService.initialize();
      
      const status = bosonService.getStatus();
      logger.info(`🔑 Node identity: ${status.identity.nodeId?.slice(0, 12)}...`);
      logger.info(`   DID: ${status.identity.did}`);
      
      if (status.identity.isNew) {
        const mnemonic = bosonService.getFirstRunMnemonic();
        if (mnemonic) {
          logger.info('');
          logger.info('╔════════════════════════════════════════════════════════════════╗');
          logger.info('║  🔐 IMPORTANT: Save your recovery phrase securely!             ║');
          logger.info('╠════════════════════════════════════════════════════════════════╣');
          logger.info('║                                                                ║');
          const words = mnemonic.split(' ');
          for (let i = 0; i < words.length; i += 4) {
            const line = words.slice(i, i + 4).map((w, j) => `${(i + j + 1).toString().padStart(2)}.${w.padEnd(10)}`).join(' ');
            logger.info(`║  ${line.padEnd(62)}║`);
          }
          logger.info('║                                                                ║');
          logger.info('║  This phrase is only shown ONCE. Store it safely!              ║');
          logger.info('╚════════════════════════════════════════════════════════════════╝');
          logger.info('');
        }
      }
      
      if (status.username.registered) {
        logger.info(`🌐 Public URL: ${status.username.publicUrl}`);
      } else {
        logger.info('💡 Register a username: POST /api/boson/register { "username": "yourname" }');
      }
      
      if (status.connectivity.connected) {
        logger.info(`✅ Connected to super node: ${status.connectivity.superNode?.address}`);
      }
    } catch (error) {
      logger.error('❌ Failed to initialize Boson service:', error);
      logger.warn('   Node identity and connectivity features will not be available');
    }
  };

  // Run all three in parallel
  await Promise.allSettled([initAI(), initGateway(), initBoson()]);

  // Wire up the AI-Gateway bridge now that both are initialized
  if (aiService) {
    try {
      const gatewayService = getGatewayService(db);
      const nodeConfig = getNodeConfig();
      const ownerWallet = nodeConfig.ownerWallet || config.owner.wallet_address || undefined;
      
      const channelBridge = createChannelBridge(aiService, { 
        db, 
        filesystem: filesystem || undefined,
        ownerWalletAddress: ownerWallet,
      });
      
      if (ownerWallet) {
        logger.info(`📡 Gateway AI bridge connected (owner: ${ownerWallet.substring(0, 10)}...)`);
      }
    } catch (error) {
      logger.warn(`📡 Gateway AI bridge unavailable: ${error}`);
    }
  }

  // Check owner status
  if (!config.owner.wallet_address) {
    logger.warn('⚠️  No owner wallet set');
    logger.info('   First wallet to authenticate will become the owner');
    logger.info('   💡 Set owner in config/config.json to restrict access');
  } else {
    const ownerDisplay = `${config.owner.wallet_address.slice(0, 6)}...${config.owner.wallet_address.slice(-4)}`;
    logger.info(`👤 Owner wallet: ${ownerDisplay}`);
    if (config.owner.tethered_wallets.length > 0) {
      logger.info(`   Tethered wallets: ${config.owner.tethered_wallets.length}`);
    }
  }

  const { server, app } = createServer({
    port: PORT,
    frontendPath: FRONTEND_PATH,
    isProduction: IS_PRODUCTION,
    database: db,
    filesystem: filesystem || undefined,
    ipfs: ipfs || undefined,
    config: config,
    aiService: aiService || undefined
  });

  // Make Boson service available to routes
  if (bosonService) {
    app.locals.bosonService = bosonService;
  }

  // Make seeding service available to routes
  if (seedingService) {
    app.locals.seedingService = seedingService;
  }

  // Make indexer service available to routes
  if (indexerService) {
    app.locals.indexerService = indexerService;
  }

  // Phase 2-C: stash lazy singletons on app.locals so route handlers can read
  // them via req.app.locals.X (matches the pattern used by db/ipfs/aiService
  // in server.ts) instead of pulling ambient globals via getWASMRuntime() /
  // getUpdateService(). The singleton accessors still exist for legacy callers
  // and the recordMetricCounter() helper that has no Express context.
  const wasmRuntime = getWASMRuntime();
  app.locals.wasmRuntime = wasmRuntime;
  app.locals.updateService = getUpdateService();

  // Trigger async WASM runtime initialization. This was previously done as a
  // module-load side-effect inside api/wasm.ts; lifting it here keeps the
  // bootstrap path explicit and matches how db/ipfs/filesystem are
  // initialized once at startup rather than on first import.
  wasmRuntime.initialize().catch((error) => {
    logger.error('[Bootstrap] Failed to initialize WASM runtime:', error);
  });

  // Handle server listen with retry for EADDRINUSE
  // Increased retries and delay to handle slow port release after crashes
  const startServer = (retries = 5, delay = 5000): void => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' && retries > 0) {
        logger.warn(`[Server] Port ${PORT} in use, waiting ${delay/1000}s before retry (${retries} retries left)`);
        setTimeout(() => startServer(retries - 1, delay), delay);
      } else if (error.code === 'EADDRINUSE') {
        logger.error(`[Server] Port ${PORT} still in use after retries, exiting...`);
        process.exit(1);
      } else {
        logger.error(`[Server] Failed to start:`, error);
        process.exit(1);
      }
    });
    
    server.listen(PORT, () => {
      logger.info(`🚀 PC2 Node running on http://localhost:${PORT}`);
      logger.info(`   Health check: http://localhost:${PORT}/health`);
      logger.info(`   API: http://localhost:${PORT}/api`);

      // Surface missing-ffmpeg at boot instead of letting the user
      // discover it mid-mint when dashPackager spawns and dies. The
      // launcher (and any external supervisor reading our logs) can
      // act on this warning before a real upload happens. Async +
      // wrapped in try/catch so a probe failure can never crash boot.
      void (async () => {
        try {
          const { spawn } = await import('child_process');
          const probe = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
          probe.on('error', () => {
            logger.warn(
              '⚠ ffmpeg not on PATH — video minting will fail. ' +
              'Install with `brew install ffmpeg` (macOS) or ' +
              '`apt-get install ffmpeg` (Linux), or use the ElastOS Launcher v1.2.8+ which installs it automatically.'
            );
          });
          probe.on('exit', (code) => {
            if (code === 0) logger.info('✓ ffmpeg available — video minting enabled');
          });
        } catch { /* probe is best-effort; never block boot */ }
      })();

      // v1.2.7.13: emit a heartbeat the launcher (and any external
      // supervisor) can poll instead of tracking our PID. Also watches
      // for a restart-requested.flag so update.sh can trigger a clean
      // restart without depending on pm2/systemctl. dataDir mirrors
      // BosonService init above so the runtime/ subdir lives next to
      // the database file.
      try {
        heartbeat = new RuntimeHeartbeat({
          dataDir: dirname(DB_PATH),
          version: resolveCurrentVersion(),
          port: PORT,
        });
        heartbeat.start();
      } catch (err) {
        logger.warn(`[Startup] RuntimeHeartbeat failed to initialize (non-fatal): ${(err as Error).message}`);
      }
    });
  };
  
  startServer();

  // DHT re-announcement is now managed by ContentSeedingService with
  // tiered hot/warm/cold cadence + startup burst. See ContentSeedingService.ts.

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down gracefully...');

    // v1.2.7.13: stop the heartbeat FIRST so any launcher polling sees
    // pc2-node as "stopping" before we tear down the rest. removeFile=true
    // signals an intentional clean exit (vs. a crash, which leaves the
    // file in place to go stale).
    if (heartbeat) {
      heartbeat.stop(/* removeFile */ true);
    }

    if (indexerService) {
      indexerService.shutdown();
    }

    if (seedingService) {
      seedingService.shutdown();
    }

    if (bosonService) {
      try {
        await bosonService.stop();
        logger.info('✅ Boson service stopped');
      } catch (error) {
        logger.error('Error stopping Boson service:', error);
      }
    }
    
    if (ipfs) {
      try {
        await ipfs.stop();
        logger.info('✅ IPFS stopped');
      } catch (error) {
        logger.error('Error stopping IPFS:', error);
      }
    }
    
    if (db) {
      db.close();
    }
    
    server.close(() => {
      logger.info('✅ Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
