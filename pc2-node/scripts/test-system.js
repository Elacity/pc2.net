#!/usr/bin/env node
/**
 * System Integration Test
 * 
 * Tests the complete PC2 Node system end-to-end
 */

import { createServer } from '../dist/server.js';
import { DatabaseManager, IPFSStorage, FilesystemManager } from '../dist/storage/index.js';
import { loadConfig } from '../dist/config/loader.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, rmSync, mkdirSync } from 'fs';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const TEST_DB_PATH = join(__dirname, '../data/test-pc2.db');
const TEST_IPFS_PATH = join(__dirname, '../data/test-ipfs');
const TEST_PORT = 4201; // Use different port to avoid conflicts

let testResults = {
  passed: 0,
  failed: 0,
  errors: []
};

function log(message, type = 'info') {
  const prefix = type === 'pass' ? '✅' : type === 'fail' ? '❌' : type === 'warn' ? '⚠️' : 'ℹ️';
  console.log(`${prefix} ${message}`);
}

function test(name, fn) {
  try {
    fn();
    testResults.passed++;
    log(name, 'pass');
  } catch (error) {
    testResults.failed++;
    testResults.errors.push({ name, error: error.message });
    log(`${name}: ${error.message}`, 'fail');
  }
}

async function httpRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: TEST_PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function main() {
  console.log('\n🧪 Starting PC2 Node System Tests\n');

  // Cleanup test data
  if (existsSync(TEST_DB_PATH)) {
    rmSync(TEST_DB_PATH);
  }
  if (existsSync(TEST_IPFS_PATH)) {
    rmSync(TEST_IPFS_PATH, { recursive: true });
  }
  mkdirSync(TEST_IPFS_PATH, { recursive: true });

  // Load config
  let config;
  try {
    config = loadConfig();
    config.storage.database_path = TEST_DB_PATH;
    config.storage.ipfs_repo_path = TEST_IPFS_PATH;
    config.server.port = TEST_PORT;
  } catch (error) {
    log(`Failed to load config: ${error.message}`, 'fail');
    process.exit(1);
  }

  // Initialize components
  log('Initializing test components...', 'info');
  
  const db = new DatabaseManager(TEST_DB_PATH);
  db.initialize();

  let ipfs;
  let filesystem;
  try {
    ipfs = new IPFSStorage({ repoPath: TEST_IPFS_PATH });
    await ipfs.initialize();
    filesystem = new FilesystemManager(ipfs, db);
    log('IPFS initialized', 'pass');
  } catch (error) {
    log(`IPFS initialization failed: ${error.message}`, 'warn');
    log('Continuing with database-only tests', 'info');
  }

  // Start server
  const { server } = createServer({
    port: TEST_PORT,
    frontendPath: join(__dirname, '../frontend'),
    isProduction: false,
    database: db,
    filesystem: filesystem,
    config: config
  });

  await new Promise((resolve) => {
    server.listen(TEST_PORT, () => {
      log(`Test server started on port ${TEST_PORT}`, 'info');
      resolve();
    });
  });

  // Wait a bit for server to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Running Tests\n');

  // Test 1: Health Check
  test('Health check endpoint', async () => {
    const response = await httpRequest('GET', '/health');
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }
    if (response.data.status !== 'ok' && response.data.status !== 'degraded') {
      throw new Error(`Unexpected status: ${response.data.status}`);
    }
    if (response.data.database !== 'connected') {
      throw new Error(`Database not connected: ${response.data.database}`);
    }
  });

  // Test 2: Version endpoint
  test('Version endpoint', async () => {
    const response = await httpRequest('GET', '/version');
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }
    if (!response.data.version) {
      throw new Error('Version not returned');
    }
  });

  // Test 3: Authentication (first wallet becomes owner)
  let authToken = null;
  const testWallet = '0x' + '1'.repeat(40);
  
  test('Authentication - first wallet becomes owner', async () => {
    const response = await httpRequest('POST', '/auth/particle', {
      wallet_address: testWallet,
      smart_account_address: null
    });
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
    }
    if (!response.data.success) {
      throw new Error('Authentication failed');
    }
    if (!response.data.token) {
      throw new Error('Token not returned');
    }
    authToken = response.data.token;
  });

  // Test 4: Whoami endpoint
  test('Whoami endpoint', async () => {
    const response = await httpRequest('GET', '/whoami', null, authToken);
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }
    if (response.data.wallet_address !== testWallet) {
      throw new Error('Wallet address mismatch');
    }
  });

  // Test 5: Create directory
  test('Create directory', async () => {
    const response = await httpRequest('POST', '/mkdir', {
      path: '/test-dir'
    }, authToken);
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
    }
    if (response.data.path !== '/test-dir') {
      throw new Error('Directory path mismatch');
    }
    if (!response.data.is_dir) {
      throw new Error('Not marked as directory');
    }
  });

  // Test 6: Write file
  test('Write file', async () => {
    const response = await httpRequest('POST', '/write', {
      path: '/test-dir/test.txt',
      content: 'Hello, PC2!',
      encoding: 'utf8'
    }, authToken);
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
    }
    if (response.data.path !== '/test-dir/test.txt') {
      throw new Error('File path mismatch');
    }
    if (response.data.is_dir) {
      throw new Error('File marked as directory');
    }
  });

  // Test 7: Read file
  test('Read file', async () => {
    const response = await httpRequest('GET', '/read?path=/test-dir/test.txt', null, authToken);
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }
    if (response.data !== 'Hello, PC2!') {
      throw new Error('File content mismatch');
    }
  });

  // Test 8: List directory
  test('List directory', async () => {
    const response = await httpRequest('POST', '/readdir', {
      path: '/test-dir'
    }, authToken);
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }
    if (!Array.isArray(response.data)) {
      throw new Error('Response is not an array');
    }
    const testFile = response.data.find(f => f.name === 'test.txt');
    if (!testFile) {
      throw new Error('test.txt not found in directory listing');
    }
  });

  // Test 9: Stat file
  test('Stat file', async () => {
    const response = await httpRequest('GET', '/stat?path=/test-dir/test.txt', null, authToken);
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }
    if (response.data.path !== '/test-dir/test.txt') {
      throw new Error('File path mismatch');
    }
    if (response.data.is_dir) {
      throw new Error('File marked as directory');
    }
  });

  // Test 10: Move file
  test('Move file', async () => {
    const response = await httpRequest('POST', '/move', {
      items: [{ path: '/test-dir/test.txt' }],
      destination: '/test-dir/moved.txt'
    }, authToken);
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
    }
    if (!response.data.moved || response.data.moved.length === 0) {
      throw new Error('No files moved');
    }
    if (!response.data.moved[0].success) {
      throw new Error(`Move failed: ${response.data.moved[0].error}`);
    }
  });

  // Test 11: Delete file
  test('Delete file', async () => {
    const response = await httpRequest('POST', '/delete', {
      items: [{ path: '/test-dir/moved.txt' }]
    }, authToken);
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
    }
    if (!response.data.deleted || response.data.deleted.length === 0) {
      throw new Error('No files deleted');
    }
    if (!response.data.deleted[0].success) {
      throw new Error(`Delete failed: ${response.data.deleted[0].error}`);
    }
  });

  // Test 12: Key-value store
  test('Key-value store', async () => {
    // Set
    const setResponse = await httpRequest('POST', '/kv/test-key', {
      value: 'test-value'
    }, authToken);
    if (setResponse.status !== 200) {
      throw new Error(`Set failed: ${setResponse.status}`);
    }
    
    // Get
    const getResponse = await httpRequest('GET', '/kv/test-key', null, authToken);
    if (getResponse.status !== 200) {
      throw new Error(`Get failed: ${getResponse.status}`);
    }
    if (getResponse.data !== 'test-value') {
      throw new Error('Value mismatch');
    }
  });

  // Test 13: Sign files
  test('Sign files', async () => {
    // Create a file first
    await httpRequest('POST', '/write', {
      path: '/test-sign.txt',
      content: 'Test content'
    }, authToken);
    
    const response = await httpRequest('POST', '/sign', {
      items: [{ path: '/test-sign.txt' }]
    }, authToken);
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
    }
    if (!response.data.token) {
      throw new Error('Token not returned');
    }
    if (!response.data.signatures || response.data.signatures.length === 0) {
      throw new Error('No signatures returned');
    }
  });

  // Test 14: Unauthorized access
  test('Unauthorized access blocked', async () => {
    const response = await httpRequest('GET', '/whoami');
    if (response.status !== 401) {
      throw new Error(`Expected 401, got ${response.status}`);
    }
  });

  // Test 15: Invalid token
  test('Invalid token rejected', async () => {
    const response = await httpRequest('GET', '/whoami', null, 'invalid-token');
    if (response.status !== 401) {
      throw new Error(`Expected 401, got ${response.status}`);
    }
  });

  // Summary
  console.log('\n📊 Test Results\n');
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  
  if (testResults.errors.length > 0) {
    console.log('\n❌ Errors:');
    testResults.errors.forEach(({ name, error }) => {
      console.log(`   ${name}: ${error}`);
    });
  }

  // Cleanup
  log('Cleaning up...', 'info');
  server.close();
  if (ipfs) {
    await ipfs.stop();
  }
  db.close();
  
  // Cleanup test data
  if (existsSync(TEST_DB_PATH)) {
    rmSync(TEST_DB_PATH);
  }
  if (existsSync(TEST_IPFS_PATH)) {
    rmSync(TEST_IPFS_PATH, { recursive: true });
  }

  console.log('\n');
  process.exit(testResults.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});

