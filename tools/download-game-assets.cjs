#!/usr/bin/env node
/**
 * Download all game assets for fully offline use
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

async function downloadFile(url, filePath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        const file = fs.createWriteStream(filePath);
        
        protocol.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                return downloadFile(response.headers.location, filePath)
                    .then(resolve)
                    .catch(reject);
            }
            
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
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

async function extractAndDownloadAssets(htmlPath, baseUrl) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const base = new URL(baseUrl);
    const assets = [];
    
    // Extract script src
    const scriptRegex = /<script[^>]+src=["']([^"']+)["']/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
        const url = new URL(match[1], baseUrl).href;
        assets.push({ type: 'js', url });
    }
    
    // Extract link href (CSS)
    const linkRegex = /<link[^>]+href=["']([^"']+)["']/gi;
    while ((match = linkRegex.exec(html)) !== null) {
        const url = new URL(match[1], baseUrl).href;
        if (url.includes('.css') || url.includes('stylesheet')) {
            assets.push({ type: 'css', url });
        }
    }
    
    // Extract img src
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    while ((match = imgRegex.exec(html)) !== null) {
        const url = new URL(match[1], baseUrl).href;
        assets.push({ type: 'image', url });
    }
    
    return assets;
}

async function main() {
    const gameDir = path.join(__dirname, '../src/backend/apps/solitaire-frvr');
    const htmlPath = path.join(gameDir, 'play/solitaire/index.html');
    
    if (!fs.existsSync(htmlPath)) {
        console.log('❌ Game HTML not found. Run wget first.');
        return;
    }
    
    console.log('📦 Extracting assets from game HTML...');
    const assets = await extractAndDownloadAssets(htmlPath, 'https://solitaire.frvr.com/');
    
    console.log(`Found ${assets.length} assets to download:`);
    assets.forEach((asset, i) => {
        console.log(`  ${i + 1}. ${asset.type}: ${asset.url}`);
    });
    
    console.log('\n💡 To download all assets, use:');
    console.log('   wget --mirror --convert-links --page-requisites "https://solitaire.frvr.com/"');
    console.log('\n⚠️  Note: Games use external SDKs and may require internet for full functionality');
}

main().catch(console.error);
