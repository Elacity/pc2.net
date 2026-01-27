#!/usr/bin/env node
/**
 * PC2 Local Development Starter
 * 
 * Quick start for local testing without Docker.
 * Usage: npm run start:local
 */

import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const pc2NodeDir = join(rootDir, 'pc2-node');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function banner() {
  console.log('');
  log('═══════════════════════════════════════════════════════════════', 'magenta');
  log('║                                                             ║', 'magenta');
  log('║   🌐 PC2 - Personal Cloud Computer                          ║', 'magenta');
  log('║                                                             ║', 'magenta');
  log('║   Your data. Your servers. Your identity.                   ║', 'magenta');
  log('║                                                             ║', 'magenta');
  log('═══════════════════════════════════════════════════════════════', 'magenta');
  console.log('');
}

function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);
  if (major < 20) {
    log(`❌ Node.js 20+ required. You have ${version}`, 'red');
    log('   Install from: https://nodejs.org/', 'yellow');
    process.exit(1);
  }
  log(`✓ Node.js ${version}`, 'green');
}

function checkDependencies() {
  const pc2NodeModules = join(pc2NodeDir, 'node_modules');
  if (!existsSync(pc2NodeModules)) {
    log('📦 Installing dependencies (first run only)...', 'cyan');
    try {
      execSync('npm install', { cwd: pc2NodeDir, stdio: 'inherit' });
      log('✓ Dependencies installed', 'green');
    } catch (error) {
      log('❌ Failed to install dependencies', 'red');
      process.exit(1);
    }
  } else {
    log('✓ Dependencies ready', 'green');
  }
}

function checkBuild() {
  const distIndex = join(pc2NodeDir, 'dist', 'index.js');
  const frontendBundle = join(pc2NodeDir, 'frontend', 'bundle.min.js');
  
  if (!existsSync(distIndex) || !existsSync(frontendBundle)) {
    log('🔨 Building PC2 (first run only)...', 'cyan');
    try {
      execSync('npm run build', { cwd: pc2NodeDir, stdio: 'inherit' });
      log('✓ Build complete', 'green');
    } catch (error) {
      log('❌ Build failed', 'red');
      process.exit(1);
    }
  } else {
    log('✓ Build ready', 'green');
  }
}

function getLocalIP() {
  try {
    const { networkInterfaces } = await import('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  } catch (e) {
    // Ignore
  }
  return null;
}

async function startServer() {
  console.log('');
  log('🚀 Starting PC2 server...', 'cyan');
  console.log('');
  
  const server = spawn('npm', ['start'], {
    cwd: pc2NodeDir,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
  });

  let serverReady = false;

  server.stdout.on('data', (data) => {
    const output = data.toString();
    process.stdout.write(output);
    
    // Detect when server is ready
    if (!serverReady && (output.includes('listening') || output.includes('4200') || output.includes('Server started'))) {
      serverReady = true;
      showReadyMessage();
    }
  });

  server.stderr.on('data', (data) => {
    process.stderr.write(data);
  });

  server.on('error', (error) => {
    log(`❌ Failed to start: ${error.message}`, 'red');
    process.exit(1);
  });

  server.on('close', (code) => {
    if (code !== 0) {
      log(`Server exited with code ${code}`, 'yellow');
    }
    process.exit(code);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('');
    log('👋 Shutting down PC2...', 'yellow');
    server.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    server.kill('SIGTERM');
  });

  // Show ready message after a timeout if not detected
  setTimeout(() => {
    if (!serverReady) {
      showReadyMessage();
    }
  }, 10000);
}

function showReadyMessage() {
  console.log('');
  log('═══════════════════════════════════════════════════════════════', 'green');
  log('║                                                             ║', 'green');
  log('║   ✅ Your PC2 is ready!                                      ║', 'green');
  log('║                                                             ║', 'green');
  log('║   Open in browser: http://localhost:4200                    ║', 'green');
  log('║                                                             ║', 'green');
  log('═══════════════════════════════════════════════════════════════', 'green');
  console.log('');
  log('   Press Ctrl+C to stop', 'yellow');
  console.log('');
}

async function main() {
  banner();
  
  log('Checking prerequisites...', 'cyan');
  console.log('');
  
  checkNodeVersion();
  checkDependencies();
  checkBuild();
  
  await startServer();
}

main().catch((error) => {
  log(`❌ Error: ${error.message}`, 'red');
  process.exit(1);
});
