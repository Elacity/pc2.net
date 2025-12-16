#!/usr/bin/env node
/**
 * Clean Script
 * 
 * Removes build artifacts (cross-platform compatible)
 */

import { existsSync, rmSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = join(__dirname, '../..');
const DIST_DIR = join(PROJECT_ROOT, 'pc2-node/dist');
const FRONTEND_DIR = join(PROJECT_ROOT, 'pc2-node/frontend');

async function main() {
  console.log('🧹 Cleaning build artifacts...');

  if (existsSync(DIST_DIR)) {
    console.log(`   Removing: ${DIST_DIR}`);
    rmSync(DIST_DIR, { recursive: true, force: true });
  }

  if (existsSync(FRONTEND_DIR)) {
    console.log(`   Cleaning: ${FRONTEND_DIR}`);
    const files = readdirSync(FRONTEND_DIR);
    for (const file of files) {
      if (file !== '.gitkeep') {
        rmSync(join(FRONTEND_DIR, file), { recursive: true, force: true });
      }
    }
  }

  console.log('✅ Clean complete!');
}

main();

