#!/usr/bin/env node

/**
 * Restore Script
 * 
 * Restores PC2 Node data from a backup archive.
 * 
 * Usage: node scripts/restore.js <backup-filename>
 * Example: node scripts/restore.js pc2-backup-20251219-120000.tar.gz
 */

import { existsSync, statSync, mkdirSync, readdirSync, rmSync, renameSync } from 'fs';
import { join, dirname, resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import { extract as extractTar } from 'tar';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get project root (pc2-node/test-fresh-install)
const PROJECT_ROOT = resolve(__dirname, '..');

// Paths relative to project root
const DB_PATH = process.env.DB_PATH || './data/pc2.db';
const IPFS_REPO_PATH = process.env.IPFS_REPO_PATH || './data/ipfs';
const CONFIG_PATH = './config/config.json';
const BACKUPS_DIR = join(PROJECT_ROOT, 'backups');

// Resolve absolute paths
const dbPath = resolve(PROJECT_ROOT, DB_PATH);
const ipfsRepoPath = resolve(PROJECT_ROOT, IPFS_REPO_PATH);
const configPath = resolve(PROJECT_ROOT, CONFIG_PATH);
const dataDir = dirname(dbPath);
const configDir = dirname(configPath);

/**
 * Get file size in human-readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Check if server is running
 */
function isServerRunning() {
  try {
    const config = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'config/default.json'), 'utf8'));
    const port = process.env.PORT || config.server.port || 4200;
    execSync(`lsof -ti:${port}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop server if running
 */
function stopServer() {
  if (!isServerRunning()) {
    return;
  }

  console.log('⚠️  Server is running. Attempting to stop...');
  try {
    const config = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'config/default.json'), 'utf8'));
    const port = process.env.PORT || config.server.port || 4200;
    execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'ignore' });
    console.log('✅ Server stopped');
  } catch (error) {
    console.log('⚠️  Could not stop server automatically.');
    console.log('   Please stop the server manually before restoring.');
    throw new Error('Server is running and could not be stopped');
  }
}

/**
 * Validate backup file
 */
function validateBackup(backupPath) {
  if (!existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  const stats = statSync(backupPath);
  if (!stats.isFile()) {
    throw new Error(`Backup path is not a file: ${backupPath}`);
  }

  if (stats.size === 0) {
    throw new Error(`Backup file is empty: ${backupPath}`);
  }

  // Check if it's a tar.gz file
  if (!backupPath.endsWith('.tar.gz')) {
    throw new Error(`Backup file must be a .tar.gz archive: ${backupPath}`);
  }

  return stats;
}

/**
 * Restore from backup
 */
async function restoreBackup(backupFilename) {
  console.log('🔄 Restoring PC2 Node from backup...\n');

  // Resolve backup file path
  let backupPath;
  if (backupFilename.includes('/') || backupFilename.includes('\\')) {
    // Absolute or relative path provided
    backupPath = resolve(backupFilename);
  } else {
    // Filename only - look in backups directory
    backupPath = join(BACKUPS_DIR, backupFilename);
  }

  // Validate backup file
  console.log(`📦 Backup file: ${backupPath}`);
  const backupStats = validateBackup(backupPath);
  console.log(`   Size: ${formatBytes(backupStats.size)}`);
  console.log(`   Valid: ✅\n`);

  // Check if server is running
  if (isServerRunning()) {
    console.log('⚠️  Server is running. It must be stopped before restoring.');
    console.log('   Attempting to stop server...\n');
    try {
      stopServer();
      // Wait a moment for server to fully stop
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('❌ Cannot restore while server is running.');
      console.error('   Please stop the server manually and try again.');
      process.exit(1);
    }
  }

  // Create temporary extraction directory
  const tempDir = join(PROJECT_ROOT, '.restore-temp');
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  mkdirSync(tempDir, { recursive: true });

  console.log('📂 Extracting backup archive...');

  try {
    // Extract tar.gz archive
    await extractTar({
      file: backupPath,
      cwd: tempDir,
      strip: 0 // Keep directory structure
    });

    console.log('✅ Backup extracted successfully\n');

    // Validate extracted files
    const extractedData = join(tempDir, 'data');
    const extractedConfig = join(tempDir, 'config');

    const hasData = existsSync(extractedData);
    const hasConfig = existsSync(extractedConfig);

    if (!hasData && !hasConfig) {
      throw new Error('Backup archive does not contain expected data or config directories');
    }

    console.log('📋 Backup contents:');
    if (hasData) {
      console.log('   ✅ data/ directory found');
      if (existsSync(join(extractedData, 'pc2.db'))) {
        console.log('      ✅ Database file (pc2.db)');
      }
      if (existsSync(join(extractedData, 'ipfs'))) {
        console.log('      ✅ IPFS repository');
      }
    }
    if (hasConfig && existsSync(join(extractedConfig, 'config.json'))) {
      console.log('   ✅ config/config.json found');
    }

    console.log('\n⚠️  WARNING: This will replace your current data!');
    console.log('   Current data will be backed up to .old-backup/');
    console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

    // Wait 5 seconds for user to cancel
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Backup current data (if exists)
    const oldBackupDir = join(PROJECT_ROOT, '.old-backup');
    if (existsSync(oldBackupDir)) {
      rmSync(oldBackupDir, { recursive: true, force: true });
    }
    mkdirSync(oldBackupDir, { recursive: true });

    console.log('💾 Backing up current data...');

    // Backup current database
    if (existsSync(dbPath)) {
      const oldDbDir = join(oldBackupDir, 'data');
      mkdirSync(oldDbDir, { recursive: true });
      renameSync(dbPath, join(oldDbDir, 'pc2.db'));
      console.log('   ✅ Current database backed up');
    }

    // Backup current IPFS repo
    if (existsSync(ipfsRepoPath)) {
      const oldIpfsPath = join(oldBackupDir, 'data', 'ipfs');
      mkdirSync(dirname(oldIpfsPath), { recursive: true });
      renameSync(ipfsRepoPath, oldIpfsPath);
      console.log('   ✅ Current IPFS repository backed up');
    }

    // Backup current config
    if (existsSync(configPath)) {
      const oldConfigDir = join(oldBackupDir, 'config');
      mkdirSync(oldConfigDir, { recursive: true });
      renameSync(configPath, join(oldConfigDir, 'config.json'));
      console.log('   ✅ Current configuration backed up');
    }

    console.log('\n🔄 Restoring data from backup...');

    // Ensure data directory exists
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    // Restore database
    if (existsSync(join(extractedData, 'pc2.db'))) {
      const sourceDb = join(extractedData, 'pc2.db');
      const destDb = dbPath;
      renameSync(sourceDb, destDb);
      console.log('   ✅ Database restored');
    }

    // Restore IPFS repo
    if (existsSync(join(extractedData, 'ipfs'))) {
      const sourceIpfs = join(extractedData, 'ipfs');
      if (!existsSync(dirname(ipfsRepoPath))) {
        mkdirSync(dirname(ipfsRepoPath), { recursive: true });
      }
      renameSync(sourceIpfs, ipfsRepoPath);
      console.log('   ✅ IPFS repository restored');
    }

    // Restore config
    if (existsSync(join(extractedConfig, 'config.json'))) {
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }
      const sourceConfig = join(extractedConfig, 'config.json');
      renameSync(sourceConfig, configPath);
      console.log('   ✅ Configuration restored');
    }

    // Clean up temporary directory
    rmSync(tempDir, { recursive: true, force: true });

    console.log('\n✅ Restore completed successfully!');
    console.log(`\n📊 Restore Summary:`);
    console.log(`   Backup: ${basename(backupPath)}`);
    console.log(`   Previous data: ${oldBackupDir}`);
    console.log(`\n💡 You can now start the server:`);
    console.log(`   npm start`);

    process.exit(0);
  } catch (error) {
    // Clean up on error
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }

    console.error('\n❌ Failed to restore backup:');
    console.error(`   ${error.message}`);
    if (error.stack) {
      console.error(`\nStack trace:\n${error.stack}`);
    }
    process.exit(1);
  }
}

// Get backup filename from command line arguments
const backupFilename = process.argv[2];

if (!backupFilename) {
  console.error('❌ Error: Backup filename required');
  console.error('\nUsage:');
  console.error('   npm run restore <backup-filename>');
  console.error('\nExample:');
  console.error('   npm run restore pc2-backup-20251219-120000.tar.gz');
  console.error('\nAvailable backups:');
  if (existsSync(BACKUPS_DIR)) {
    const backups = readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.tar.gz'));
    if (backups.length === 0) {
      console.error('   (no backups found)');
    } else {
      backups.forEach(backup => {
        console.error(`   - ${backup}`);
      });
    }
  } else {
    console.error('   (backups directory does not exist)');
  }
  process.exit(1);
}

// Run restore
restoreBackup(backupFilename).catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
