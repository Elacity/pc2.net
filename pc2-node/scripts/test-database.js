#!/usr/bin/env node
/**
 * Database Test Script
 * 
 * Tests the SQLite database implementation
 */

import { DatabaseManager } from '../dist/storage/database.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { rmSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DB_PATH = join(__dirname, '../data/test-pc2.db');

// Clean up test database if it exists
if (existsSync(TEST_DB_PATH)) {
  console.log('🧹 Cleaning up previous test database...');
  rmSync(TEST_DB_PATH);
}

console.log('🧪 Testing Database Implementation\n');
console.log('='.repeat(60));

const db = new DatabaseManager(TEST_DB_PATH);

try {
  // Test 1: Initialize database
  console.log('\n📦 Test 1: Database Initialization');
  db.initialize();
  console.log('✅ Database initialized successfully');

  // Test 2: Create user
  console.log('\n👤 Test 2: User Operations');
  const testWallet = '0x1234567890123456789012345678901234567890';
  const testSmartAccount = '0x9876543210987654321098765432109876543210';
  
  db.createOrUpdateUser(testWallet, testSmartAccount);
  console.log('✅ User created');
  
  const user = db.getUser(testWallet);
  if (user && user.wallet_address === testWallet) {
    console.log('✅ User retrieved successfully');
    console.log(`   Wallet: ${user.wallet_address}`);
    console.log(`   Smart Account: ${user.smart_account_address}`);
  } else {
    throw new Error('Failed to retrieve user');
  }

  // Test 3: Create session
  console.log('\n🔑 Test 3: Session Operations');
  const sessionToken = 'test-session-token-12345';
  const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
  
  db.createSession({
    token: sessionToken,
    wallet_address: testWallet,
    smart_account_address: testSmartAccount,
    created_at: Date.now(),
    expires_at: expiresAt
  });
  console.log('✅ Session created');
  
  const session = db.getSession(sessionToken);
  if (session && session.token === sessionToken) {
    console.log('✅ Session retrieved successfully');
    console.log(`   Token: ${session.token.substring(0, 20)}...`);
    console.log(`   Wallet: ${session.wallet_address}`);
    console.log(`   Expires: ${new Date(session.expires_at).toISOString()}`);
  } else {
    throw new Error('Failed to retrieve session');
  }

  // Test 4: File metadata
  console.log('\n📁 Test 4: File Operations');
  const testFile = {
    path: '/test-file.txt',
    wallet_address: testWallet,
    ipfs_hash: 'QmTestHash123456789',
    size: 1024,
    mime_type: 'text/plain',
    is_dir: false,
    is_public: false,
    created_at: Date.now(),
    updated_at: Date.now()
  };
  
  db.createOrUpdateFile(testFile);
  console.log('✅ File metadata created');
  
  const file = db.getFile('/test-file.txt', testWallet);
  if (file && file.path === '/test-file.txt') {
    console.log('✅ File metadata retrieved successfully');
    console.log(`   Path: ${file.path}`);
    console.log(`   Size: ${file.size} bytes`);
    console.log(`   IPFS Hash: ${file.ipfs_hash}`);
  } else {
    throw new Error('Failed to retrieve file');
  }

  // Test 5: List files
  const testDir = {
    path: '/test-dir',
    wallet_address: testWallet,
    ipfs_hash: null,
    size: 0,
    mime_type: null,
    is_dir: true,
    is_public: false,
    created_at: Date.now(),
    updated_at: Date.now()
  };
  
  db.createOrUpdateFile(testDir);
  const files = db.listFiles('/', testWallet);
  console.log(`✅ Listed ${files.length} file(s) in root directory`);
  files.forEach(f => {
    console.log(`   - ${f.path} (${f.is_dir ? 'dir' : 'file'})`);
  });

  // Test 6: Settings
  console.log('\n⚙️  Test 5: Settings Operations');
  db.setSetting('test_key', 'test_value');
  console.log('✅ Setting created');
  
  const value = db.getSetting('test_key');
  if (value === 'test_value') {
    console.log('✅ Setting retrieved successfully');
    console.log(`   Key: test_key, Value: ${value}`);
  } else {
    throw new Error('Failed to retrieve setting');
  }

  // Test 7: Cleanup expired sessions
  console.log('\n🧹 Test 6: Session Cleanup');
  const expiredToken = 'expired-token-12345';
  db.createSession({
    token: expiredToken,
    wallet_address: testWallet,
    smart_account_address: null,
    created_at: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days ago
    expires_at: Date.now() - (1 * 24 * 60 * 60 * 1000) // Expired 1 day ago
  });
  
  const cleaned = db.cleanupExpiredSessions();
  console.log(`✅ Cleaned up ${cleaned} expired session(s)`);
  
  const expiredSession = db.getSession(expiredToken);
  if (!expiredSession) {
    console.log('✅ Expired session was removed');
  } else {
    throw new Error('Expired session was not removed');
  }

  // Test 8: Persistence (close and reopen)
  console.log('\n💾 Test 7: Data Persistence');
  db.close();
  console.log('✅ Database closed');
  
  const db2 = new DatabaseManager(TEST_DB_PATH);
  db2.initialize();
  console.log('✅ Database reopened');
  
  const persistedUser = db2.getUser(testWallet);
  if (persistedUser && persistedUser.wallet_address === testWallet) {
    console.log('✅ User data persisted across restarts');
  } else {
    throw new Error('User data did not persist');
  }
  
  const persistedFile = db2.getFile('/test-file.txt', testWallet);
  if (persistedFile && persistedFile.path === '/test-file.txt') {
    console.log('✅ File data persisted across restarts');
  } else {
    throw new Error('File data did not persist');
  }
  
  db2.close();

  console.log('\n' + '='.repeat(60));
  console.log('✅ All database tests passed!');
  console.log('\n📊 Summary:');
  console.log('   - Database initialization: ✅');
  console.log('   - User operations: ✅');
  console.log('   - Session operations: ✅');
  console.log('   - File operations: ✅');
  console.log('   - Settings operations: ✅');
  console.log('   - Session cleanup: ✅');
  console.log('   - Data persistence: ✅');
  
  // Clean up
  if (existsSync(TEST_DB_PATH)) {
    rmSync(TEST_DB_PATH);
    console.log('\n🧹 Test database cleaned up');
  }
  
  process.exit(0);
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error(error.stack);
  
  // Clean up on error
  if (existsSync(TEST_DB_PATH)) {
    rmSync(TEST_DB_PATH);
  }
  
  process.exit(1);
}

