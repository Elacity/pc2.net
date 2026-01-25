#!/usr/bin/env node

/**
 * Backup Script
 * 
 * Creates a timestamped backup archive containing:
 * - Database file (data/pc2.db) + WAL files if present
 * - IPFS repository (data/ipfs/)
 * - User configuration (config/config.json if exists)
 * - Encryption key (data/encryption.key) - CRITICAL for API key decryption
 * - Node configuration (data/node-config.json) - Owner wallet, access control, tethered DIDs
 * - Boson identity (data/identity.json) - Node keypair and DID
 * - Username registration (data/username.json) - Registered Boson username
 * - Setup completion flag (data/setup-complete) - Skips setup wizard on restore
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

// Critical data files that must be backed up for complete restore
const CRITICAL_DATA_FILES = [
  { relative: 'data/encryption.key', description: 'Encryption key (CRITICAL - needed for API key decryption)', sensitive: true },
  { relative: 'data/node-config.json', description: 'Node configuration (owner wallet, access control, tethered DIDs)' },
  { relative: 'data/identity.json', description: 'Boson node identity (keypair and DID)' },
  { relative: 'data/username.json', description: 'Registered Boson username' },
  { relative: 'data/setup-complete', description: 'Setup completion flag' }
];

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

  // Check SQLite WAL files (if database is in WAL mode)
  const walPath = dbPath + '-wal';
  const shmPath = dbPath + '-shm';
  if (existsSync(walPath)) {
    const walStats = statSync(walPath);
    itemsToBackup.push({
      path: walPath,
      name: 'data/pc2.db-wal',
      size: walStats.size
    });
    console.log(`✅ SQLite WAL file found: ${formatBytes(walStats.size)}`);
  }
  if (existsSync(shmPath)) {
    const shmStats = statSync(shmPath);
    itemsToBackup.push({
      path: shmPath,
      name: 'data/pc2.db-shm',
      size: shmStats.size
    });
    console.log(`✅ SQLite SHM file found: ${formatBytes(shmStats.size)}`);
  }

  // Check critical data files for complete node restoration
  console.log('\n📋 Checking critical node files...');
  const criticalFilesFound = [];
  const criticalFilesMissing = [];

  for (const criticalFile of CRITICAL_DATA_FILES) {
    const filePath = resolve(PROJECT_ROOT, criticalFile.relative);
    if (existsSync(filePath)) {
      const fileStats = statSync(filePath);
      itemsToBackup.push({
        path: filePath,
        name: criticalFile.relative,
        size: fileStats.size,
        sensitive: criticalFile.sensitive
      });
      criticalFilesFound.push(criticalFile);
      const sizeInfo = criticalFile.sensitive ? '(sensitive)' : formatBytes(fileStats.size);
      console.log(`   ✅ ${criticalFile.description}: ${sizeInfo}`);
    } else {
      criticalFilesMissing.push(criticalFile);
      console.log(`   ⚠️  ${criticalFile.description}: not found`);
    }
  }

  // Warn if critical files are missing
  if (criticalFilesMissing.length > 0) {
    console.log(`\n⚠️  Warning: ${criticalFilesMissing.length} critical file(s) not found.`);
    console.log('   This may be normal for a fresh install, but a restore from this backup');
    console.log('   may not fully restore node identity, access control, or encrypted data.');
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

    console.log('✅ Backup archive created!');

    // Verify backup contents
    console.log('\n🔍 Verifying backup contents...');
    const { list: listTar } = await import('tar');
    const archivedFiles = [];
    await listTar({
      file: backupPath,
      onReadEntry: (entry) => {
        archivedFiles.push(entry.path);
      }
    });

    // Check that all critical files are in the archive
    const missingFromArchive = [];
    for (const item of itemsToBackup) {
      const found = archivedFiles.some(f => f === item.name || f.startsWith(item.name + '/'));
      if (!found) {
        missingFromArchive.push(item.name);
      }
    }

    if (missingFromArchive.length > 0) {
      console.log('⚠️  Warning: Some files may be missing from archive:');
      missingFromArchive.forEach(f => console.log(`   - ${f}`));
    } else {
      console.log('✅ All files verified in archive');
    }

    // Summary
    console.log(`\n📊 Backup Summary:`);
    console.log(`   File: ${backupFilename}`);
    console.log(`   Size: ${formatBytes(backupSize)}`);
    console.log(`   Location: ${backupPath}`);
    console.log(`   Items backed up: ${itemsToBackup.length}`);
    
    // Show what's included
    console.log('\n📦 Backup includes:');
    console.log('   - Database (pc2.db)' + (existsSync(walPath) ? ' + WAL' : ''));
    console.log('   - IPFS repository');
    console.log('   - Server configuration');
    if (criticalFilesFound.length > 0) {
      console.log(`   - ${criticalFilesFound.length} critical node files:`);
      criticalFilesFound.forEach(f => {
        console.log(`     • ${f.relative.replace('data/', '')}`);
      });
    }
    
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
