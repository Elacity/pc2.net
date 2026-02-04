// Global error handlers MUST be registered first, before any other imports
// This prevents WASM modules from registering their own crash-happy handlers
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  // Log but don't crash - many rejections are recoverable (e.g., 409 Telegram conflicts)
  console.error('[PC2] Unhandled Promise Rejection:', reason?.message || reason);
  // Only exit on truly fatal errors
  if (reason?.code === 'EADDRINUSE') {
    console.error('[PC2] Fatal: Port already in use, exiting');
    process.exit(1);
  }
});

process.on('uncaughtException', (error: Error) => {
  console.error('[PC2] Uncaught Exception:', error);
  // Log stack trace for debugging
  if (error.stack) {
    console.error(error.stack);
  }
  // Only exit on truly fatal errors that we can't recover from
  if ((error as any).code === 'EADDRINUSE') {
    process.exit(1);
  }
});

import { createServer } from './server.js';
import { DatabaseManager, IPFSStorage, FilesystemManager, type IPFSNetworkMode, setGlobalDatabase } from './storage/index.js';
import { loadConfig, type Config } from './config/loader.js';
import { logger } from './utils/logger.js';
import { AIChatService } from './services/ai/AIChatService.js';
import { BosonService } from './services/boson/index.js';
import { getGatewayService, createChannelBridge } from './services/gateway/index.js';
import { getNodeConfig } from './api/setup.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration
let config: Config;
try {
  config = loadConfig();
  logger.info('✅ Configuration loaded');
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
    
    ipfs = new IPFSStorage({
      repoPath: IPFS_REPO_PATH,
      mode: ipfsMode,
      enableDHT: ipfsConfig.enable_dht,
      enableBootstrap: ipfsConfig.enable_bootstrap,
      customBootstrap: ipfsConfig.custom_bootstrap
    });
    await ipfs.initialize();
    
    // Create filesystem manager
    filesystem = new FilesystemManager(ipfs, db);
    logger.info('✅ Filesystem manager initialized');
    logger.info(`   IPFS mode: ${ipfsMode}`);
  } catch (error) {
    logger.error('❌ Failed to initialize IPFS:', error);
    logger.warn('   File storage will not be available');
    // Don't exit - server can still run without IPFS (for development)
  }

  // Initialize AI service
  if (config.ai?.enabled !== false) {
    try {
      aiService = new AIChatService(config.ai, db);
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
  } else {
    logger.info('ℹ️  AI service disabled in config');
  }

  // Initialize Gateway service (messaging channels)
  try {
    const gatewayService = getGatewayService(db);
    await gatewayService.initialize();
    
    // Connect the channel bridge if AI service is available
    if (aiService) {
      // Get owner wallet from node config (set during first auth)
      const nodeConfig = getNodeConfig();
      const ownerWallet = nodeConfig.ownerWallet || config.owner.wallet_address || undefined;
      
      const channelBridge = createChannelBridge(aiService, { 
        db, 
        filesystem: filesystem || undefined,
        ownerWalletAddress: ownerWallet,
      });
      
      if (ownerWallet) {
        logger.info(`📡 Gateway service initialized with AI bridge (owner: ${ownerWallet.substring(0, 10)}...)`);
      } else {
        logger.warn('📡 Gateway service initialized with AI bridge (no owner wallet - AI providers may not load)');
      }
    } else {
      logger.info('📡 Gateway service initialized (no AI bridge - AI service unavailable)');
    }
  } catch (error) {
    logger.error('❌ Failed to initialize gateway service:', error);
  }

  // Initialize Boson service (identity, connectivity)
  const bosonConfig = (config as any).boson || {};
  if (bosonConfig.enabled !== false) {
    try {
      const dataDir = dirname(DB_PATH);
      bosonService = new BosonService({
        dataDir,
        gatewayUrl: bosonConfig.gateway_url || 'https://69.164.241.210',
        publicDomain: bosonConfig.public_domain || 'ela.city',
        localPort: PORT,
        autoConnect: bosonConfig.auto_connect !== false,
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
          
          // Don't clear mnemonic here - let setup wizard clear it when user acknowledges
          // The mnemonic will be cleared via /api/setup/acknowledge-mnemonic
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
  } else {
    logger.info('ℹ️  Boson service disabled in config');
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

  server.listen(PORT, () => {
    logger.info(`🚀 PC2 Node running on http://localhost:${PORT}`);
    logger.info(`   Health check: http://localhost:${PORT}/health`);
    logger.info(`   API: http://localhost:${PORT}/api`);
  });

  // ============================================================================
  // Periodic IPFS DHT Re-announcement
  // DHT provider records expire after ~24 hours, so we re-announce periodically
  // ============================================================================
  
  const RE_ANNOUNCE_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
  
  const runPeriodicAnnouncement = async () => {
    if (!ipfs || !db) return;
    
    // Check if IPFS can announce (not in private mode, DHT available)
    if (!ipfs.canAnnounce()) {
      logger.debug('[IPFS] Skipping periodic announcement (DHT not available)');
      return;
    }
    
    // Get IPFS config to check if auto-announce is enabled
    const ipfsConfig = (config as any).ipfs || {};
    if (ipfsConfig.auto_announce_public === false) {
      logger.debug('[IPFS] Skipping periodic announcement (auto_announce_public disabled)');
      return;
    }
    
    try {
      const publicCIDs = db.getPublicCIDs();
      if (publicCIDs.length === 0) {
        logger.debug('[IPFS] No public CIDs to announce');
        return;
      }
      
      logger.info(`[IPFS] Starting periodic re-announcement of ${publicCIDs.length} public CIDs...`);
      const result = await ipfs.announceMultipleCIDs(publicCIDs);
      logger.info(`[IPFS] Periodic announcement complete: ${result.success} success, ${result.failed} failed`);
    } catch (error) {
      logger.error('[IPFS] Periodic announcement failed:', error);
    }
  };
  
  // Run initial announcement after a delay (let IPFS connect to peers first)
  if (ipfs && ipfs.getNetworkMode() !== 'private') {
    setTimeout(() => {
      runPeriodicAnnouncement().catch(e => logger.error('[IPFS] Initial announcement error:', e));
    }, 60 * 1000); // Wait 1 minute after startup
    
    // Schedule periodic re-announcement
    const announcementInterval = setInterval(() => {
      runPeriodicAnnouncement().catch(e => logger.error('[IPFS] Periodic announcement error:', e));
    }, RE_ANNOUNCE_INTERVAL);
    
    logger.info(`[IPFS] Scheduled periodic DHT re-announcement every ${RE_ANNOUNCE_INTERVAL / 1000 / 60 / 60} hours`);
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    
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
