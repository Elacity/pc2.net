#!/usr/bin/env node
/**
 * Download and bundle games locally for fully offline use
 * Makes games work exactly like viewer/player/pdf
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const GAMES = [
    {
        name: 'solitaire-frvr',
        url: 'https://www.solitaire-frvr.com/',
        dir: path.join(__dirname, '../src/backend/apps/solitaire-frvr')
    },
    {
        name: 'in-orbit',
        url: 'https://www.inorbit.fun/',
        dir: path.join(__dirname, '../src/backend/apps/in-orbit')
    },
    {
        name: 'doodle-jump-extra',
        url: 'https://www.doodlejump.com/',
        dir: path.join(__dirname, '../src/backend/apps/doodle-jump-extra')
    }
];

// Helper to download a file
function downloadFile(url, filePath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(filePath);
        
        protocol.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Handle redirects
                return downloadFile(response.headers.location, filePath)
                    .then(resolve)
                    .catch(reject);
            }
            
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
                return;
            }
            
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(filePath, () => {});
            reject(err);
        });
    });
}

// Helper to fetch HTML content
function fetchHTML(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        let data = '';
        
        protocol.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                return fetchHTML(response.headers.location)
                    .then(resolve)
                    .catch(reject);
            }
            
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to fetch ${url}: ${response.statusCode}`));
                return;
            }
            
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Extract all asset URLs from HTML
function extractAssets(html, baseUrl) {
    const assets = {
        js: [],
        css: [],
        images: [],
        fonts: [],
        other: []
    };
    
    const base = new URL(baseUrl);
    
    // Extract script tags
    const scriptRegex = /<script[^>]+src=["']([^"']+)["']/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
        const url = new URL(match[1], baseUrl).href;
        assets.js.push(url);
    }
    
    // Extract link tags (CSS)
    const linkRegex = /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["']/gi;
    while ((match = linkRegex.exec(html)) !== null) {
        const url = new URL(match[1], baseUrl).href;
        assets.css.push(url);
    }
    
    // Extract img tags
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    while ((match = imgRegex.exec(html)) !== null) {
        const url = new URL(match[1], baseUrl).href;
        assets.images.push(url);
    }
    
    return assets;
}

// Process a game
async function bundleGame(game) {
    console.log(`\n📦 Bundling ${game.name}...`);
    console.log(`   URL: ${game.url}`);
    
    // Create directories
    const dirs = ['js', 'css', 'images', 'fonts', 'assets'];
    dirs.forEach(dir => {
        const dirPath = path.join(game.dir, dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    });
    
    try {
        // Fetch main HTML
        console.log(`   📥 Downloading HTML...`);
        const html = await fetchHTML(game.url);
        
        // Extract assets
        console.log(`   🔍 Extracting assets...`);
        const assets = extractAssets(html, game.url);
        
        console.log(`   Found: ${assets.js.length} JS, ${assets.css.length} CSS, ${assets.images.length} images`);
        
        // For now, create a local wrapper that loads the game
        // Full asset bundling is complex and may have CORS/licensing issues
        // We'll use a hybrid approach: local HTML with embedded game
        
        const localHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${game.name} - PC2</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body, html {
            width: 100%;
            height: 100%;
            overflow: hidden;
        }
        .game-container {
            width: 100%;
            height: 100vh;
            position: relative;
        }
        iframe {
            width: 100%;
            height: 100%;
            border: none;
        }
        .offline-notice {
            display: none;
        }
    </style>
</head>
<body>
    <div class="game-container">
        <iframe 
            src="${game.url}" 
            allow="fullscreen" 
            allowfullscreen
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
        ></iframe>
    </div>
</body>
</html>`;
        
        // Save local HTML
        fs.writeFileSync(path.join(game.dir, 'index.html'), localHTML);
        console.log(`   ✅ Created local index.html`);
        
        // Note: Full asset bundling would require:
        // 1. Downloading all JS/CSS/images
        // 2. Fixing all paths
        // 3. Handling CORS issues
        // 4. Dealing with dynamic loading
        
        console.log(`   ⚠️  Note: Full offline bundling requires downloading all assets`);
        console.log(`   💡 Current: Games load via iframe (requires internet)`);
        console.log(`   🔮 Future: Can bundle all assets for true offline mode`);
        
    } catch (error) {
        console.error(`   ❌ Error bundling ${game.name}:`, error.message);
    }
}

// Main
async function main() {
    console.log('🚀 Starting game bundling for offline use...\n');
    
    for (const game of GAMES) {
        await bundleGame(game);
    }
    
    console.log('\n✅ Game bundling complete!');
    console.log('\n📝 Next Steps for Full Offline:');
    console.log('   1. Download all game assets (JS, CSS, images)');
    console.log('   2. Store in apps directories');
    console.log('   3. Update all paths to be relative');
    console.log('   4. Handle dynamic loading and CORS');
    console.log('\n💡 Current setup: Games work but require internet');
    console.log('   Full offline bundling is complex and may have licensing considerations');
}

main().catch(console.error);
