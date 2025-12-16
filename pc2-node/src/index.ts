// Import polyfills FIRST (before any other imports that might use them)
import './utils/polyfill.js';

import { createServer } from './server.js';
import { DatabaseManager, IPFSStorage, FilesystemManager } from './storage/index.js';
import { loadConfig, type Config } from './config/loader.js';
import { logger } from './utils/logger.js';
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
    
    // Cleanup expired sessions on startup
    const cleaned = db.cleanupExpiredSessions();
    if (cleaned > 0) {
      logger.info(`🧹 Cleaned up ${cleaned} expired session(s)`);
    }
  } catch (error) {
    logger.error('❌ Failed to initialize database:', error);
    process.exit(1);
  }

  // Initialize IPFS (optional - server works without it)
  try {
    logger.info('🌐 Initializing IPFS storage...');
    logger.info(`   Repo path: ${IPFS_REPO_PATH}`);
    
    // Verify polyfill is loaded
    if (typeof (Promise as any).withResolvers === 'undefined') {
      logger.warn('⚠️  Promise.withResolvers polyfill not detected');
      logger.warn('   This may cause IPFS initialization to fail on Node.js < 22');
    } else {
      logger.info('✅ Promise.withResolvers polyfill confirmed');
    }
    
    ipfs = new IPFSStorage({
      repoPath: IPFS_REPO_PATH
    });
    
    logger.info('   Starting IPFS node initialization...');
    await ipfs.initialize();
    
    // Create filesystem manager (only if IPFS is available)
    if (ipfs && ipfs.isReady()) {
      filesystem = new FilesystemManager(ipfs, db);
      logger.info('✅ Filesystem manager initialized with IPFS');
      logger.info('   File uploads and storage are now available');
    } else {
      logger.warn('⚠️  IPFS initialization completed but isReady() returned false');
      logger.warn('   Filesystem manager not created');
      filesystem = null;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error('❌ Failed to initialize IPFS:', errorMessage);
    
    if (errorStack) {
      logger.error('   Full error stack:');
      logger.error(errorStack);
    }
    
    if (errorMessage.includes('withResolvers') || (errorStack && errorStack.includes('withResolvers'))) {
      logger.error('   ⚠️  This error is due to Node.js version < 22');
      logger.error('   💡 A polyfill has been added, but IPFS may still require Node.js 22+');
      logger.error('   💡 Consider upgrading Node.js: nvm install 22 && nvm use 22');
      logger.error('   💡 Or continue without IPFS (database-only mode)');
    } else if (errorMessage.includes('EADDRINUSE')) {
      logger.error('   ⚠️  IPFS ports (4001, 5001, 8080) are already in use');
      logger.error('   💡 Another IPFS instance may be running');
      logger.error('   💡 Try stopping other IPFS processes or change ports in config');
    } else if (errorMessage.includes('repo') || errorMessage.includes('repository')) {
      logger.error('   ⚠️  IPFS repository issue');
      logger.error(`   💡 Repo path: ${IPFS_REPO_PATH}`);
      logger.error('   💡 Try deleting the repo directory and restarting');
    }
    
    logger.warn('   ⚠️  File storage will not be available');
    logger.warn('   ⚠️  Server will continue without IPFS (database-only mode)');
    logger.warn('   ⚠️  File uploads will fail until IPFS is initialized');
    
    // Don't exit - server can still run without IPFS (for development)
    // Set to null to prevent any further IPFS operations
    ipfs = null;
    filesystem = null;
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

  const { server } = createServer({
    port: PORT,
    frontendPath: FRONTEND_PATH,
    isProduction: IS_PRODUCTION,
    database: db,
    filesystem: filesystem || undefined,
    config: config
  });

  server.listen(PORT, () => {
    logger.info(`🚀 PC2 Node running on http://localhost:${PORT}`);
    logger.info(`   Health check: http://localhost:${PORT}/health`);
    logger.info(`   API: http://localhost:${PORT}/api`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    
    if (ipfs && ipfs.isReady()) {
      try {
        await ipfs.stop();
        logger.info('✅ IPFS stopped');
      } catch (error) {
        logger.error('Error stopping IPFS:', error);
        // Don't throw - continue shutdown even if IPFS stop fails
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

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  const errorMessage = reason instanceof Error ? reason.message : String(reason);
  logger.error('Unhandled Rejection:', errorMessage);
  // Log stack trace if available
  if (reason instanceof Error && reason.stack) {
    logger.error('Stack:', reason.stack);
  }
  // Don't exit - let the server continue
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Only exit if it's a critical error
  if (error.message.includes('EADDRINUSE')) {
    logger.error('Port already in use. Exiting.');
    process.exit(1);
  }
  // Otherwise, log and continue
});

main().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

