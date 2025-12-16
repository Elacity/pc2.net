#!/usr/bin/env node
/**
 * Build Frontend Script
 * 
 * Builds the ElastOS frontend and copies it to pc2-node/frontend/
 * This script is cross-platform compatible (works on Windows, macOS, Linux)
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, cpSync, rmSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = join(__dirname, '../..');
const GUI_DIR = join(PROJECT_ROOT, 'src/gui');
const FRONTEND_DIST = join(GUI_DIR, 'dist');
const TARGET_DIR = join(PROJECT_ROOT, 'pc2-node/frontend');

async function main() {
  console.log('🔨 Building frontend...');
  console.log(`   GUI directory: ${GUI_DIR}`);
  console.log(`   Target directory: ${TARGET_DIR}`);

  // Check if GUI directory exists
  if (!existsSync(GUI_DIR)) {
    console.error(`❌ GUI directory not found: ${GUI_DIR}`);
    process.exit(1);
  }

  // Check if package.json exists in GUI directory
  const guiPackageJson = join(GUI_DIR, 'package.json');
  if (!existsSync(guiPackageJson)) {
    console.error(`❌ package.json not found in GUI directory: ${guiPackageJson}`);
    process.exit(1);
  }

  try {
    // Build frontend
    console.log('\n📦 Running frontend build...');
    execSync('npm run build', {
      cwd: GUI_DIR,
      stdio: 'inherit'
    });

    // Check if dist directory was created
    if (!existsSync(FRONTEND_DIST)) {
      console.error(`❌ Build output not found: ${FRONTEND_DIST}`);
      process.exit(1);
    }

    // Create target directory if it doesn't exist
    if (!existsSync(TARGET_DIR)) {
      mkdirSync(TARGET_DIR, { recursive: true });
    }

    // Clean target directory (but keep .gitkeep)
    const gitkeepPath = join(TARGET_DIR, '.gitkeep');
    const hasGitkeep = existsSync(gitkeepPath);
    
    if (existsSync(TARGET_DIR)) {
      const files = readdirSync(TARGET_DIR);
      for (const file of files) {
        if (file !== '.gitkeep') {
          rmSync(join(TARGET_DIR, file), { recursive: true, force: true });
        }
      }
    }

    // Copy dist contents to target directory
    console.log('\n📋 Copying files to frontend directory...');
    cpSync(FRONTEND_DIST, TARGET_DIR, { recursive: true });

    // Restore .gitkeep if it existed
    if (hasGitkeep) {
      writeFileSync(gitkeepPath, '');
    }

    // Generate index.html if it doesn't exist
    const indexHtmlPath = join(TARGET_DIR, 'index.html');
    if (!existsSync(indexHtmlPath)) {
      console.log('\n📄 Generating index.html...');
      execSync('node scripts/generate-index-html.js', {
        cwd: join(PROJECT_ROOT, 'pc2-node'),
        stdio: 'inherit'
      });
    }

    console.log('\n✅ Frontend build complete!');
    console.log(`   Files copied to: ${TARGET_DIR}`);
  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
  }
}

main();
