#!/usr/bin/env node
/**
 * Generate Index HTML
 * 
 * Generates index.html for production build
 * This file is needed for SPA routing to work
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Script is in pc2-node/test-fresh-install/scripts/, so target is ../frontend
const TARGET_DIR = join(__dirname, '..', 'frontend');
const INDEX_HTML = join(TARGET_DIR, 'index.html');

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ElastOS - Personal Cloud</title>
    <link rel="stylesheet" href="/bundle.min.css">
</head>
<body>
    <div id="app"></div>
    <script src="/bundle.min.js"></script>
</body>
</html>`;

function main() {
  console.log('📄 Generating index.html...');
  
  try {
    writeFileSync(INDEX_HTML, HTML_TEMPLATE, 'utf8');
    console.log(`   ✅ Created: ${INDEX_HTML}`);
  } catch (error) {
    console.error(`   ❌ Failed to create index.html: ${error.message}`);
    process.exit(1);
  }
}

main();
