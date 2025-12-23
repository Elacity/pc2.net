#!/usr/bin/env node

/**
 * Backup Script
 * 
 * Creates a timestamped backup archive containing:
 * - Database file (data/pc2.db)
 * - IPFS repository (data/ipfs/)
 * - User configuration (config/config.json if exists)
 */

import { createWriteStream, existsSync, statSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createGzip } from 'zlib';
import { create as createTar } from 'tar';
import { execSync } from 'child_process';

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

/**
 * Format timestamp for backup filename
 */
function formatTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

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
    // Try to connect to the server port
    const config = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'config/default.json'), 'utf8'));
    const port = process.env.PORT || config.server.port || 4200;
    execSync(`lsof -ti:${port}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create backup archive
 */
async function createBackup() {
  console.log('📦 Creating PC2 Node backup...\n');

  // Check if server is running
  if (isServerRunning()) {
    console.log('⚠️  Warning: Server appears to be running.');
    console.log('   It is recommended to stop the server before backing up.');
    console.log('   Continuing anyway...\n');
  }

  // Validate data exists
  const itemsToBackup = [];
  const missingItems = [];

  // Check database
  if (existsSync(dbPath)) {
    const dbStats = statSync(dbPath);
    itemsToBackup.push({
      path: dbPath,
      name: 'data/pc2.db',
      size: dbStats.size
    });
    console.log(`✅ Database found: ${formatBytes(dbStats.size)}`);
  } else {
    missingItems.push('Database (data/pc2.db)');
    console.log('⚠️  Database not found (this is OK for fresh installs)');
  }

  // Check IPFS repo
  if (existsSync(ipfsRepoPath)) {
    try {
      // Get directory size (approximate)
      const ipfsStats = statSync(ipfsRepoPath);
      if (ipfsStats.isDirectory()) {
        itemsToBackup.push({
          path: ipfsRepoPath,
          name: 'data/ipfs',
          size: 0 // Will calculate during backup
        });
        console.log(`✅ IPFS repository found`);
      }
    } catch (error) {
      console.log(`⚠️  IPFS repository path exists but cannot be accessed: ${error.message}`);
    }
  } else {
    missingItems.push('IPFS repository (data/ipfs/)');
    console.log('⚠️  IPFS repository not found (this is OK for fresh installs)');
  }

  // Check user config
  if (existsSync(configPath)) {
    const configStats = statSync(configPath);
    itemsToBackup.push({
      path: configPath,
      name: 'config/config.json',
      size: configStats.size
    });
    console.log(`✅ User configuration found: ${formatBytes(configStats.size)}`);
  } else {
    console.log('ℹ️  User configuration not found (using defaults)');
  }

  // Check if we have anything to backup
  if (itemsToBackup.length === 0) {
    console.log('\n❌ No data found to backup.');
    console.log('   This is normal for a fresh installation with no data yet.');
    process.exit(0);
  }

  // Create backups directory
  if (!existsSync(BACKUPS_DIR)) {
    mkdirSync(BACKUPS_DIR, { recursive: true });
    console.log(`📁 Created backups directory: ${BACKUPS_DIR}`);
  }

  // Generate backup filename
  const timestamp = formatTimestamp();
  const backupFilename = `pc2-backup-${timestamp}.tar.gz`;
  const backupPath = join(BACKUPS_DIR, backupFilename);

  console.log(`\n📦 Creating backup archive: ${backupFilename}`);
  console.log(`   Location: ${backupPath}\n`);

  try {
    // Create tar.gz archive
    await createTar({
      gzip: true,
      cwd: PROJECT_ROOT,
      file: backupPath
    }, itemsToBackup.map(item => item.name));

    // Get backup file size
    const backupStats = statSync(backupPath);
    const backupSize = backupStats.size;

    console.log('✅ Backup created successfully!');
    console.log(`\n📊 Backup Summary:`);
    console.log(`   File: ${backupFilename}`);
    console.log(`   Size: ${formatBytes(backupSize)}`);
    console.log(`   Location: ${backupPath}`);
    console.log(`\n💡 To restore this backup, run:`);
    console.log(`   npm run restore ${backupFilename}`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Failed to create backup:');
    console.error(`   ${error.message}`);
    if (error.stack) {
      console.error(`\nStack trace:\n${error.stack}`);
    }
    process.exit(1);
  }
}

// Run backup
createBackup().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
