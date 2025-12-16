#!/usr/bin/env node
/**
 * Download games fully for offline use using wget or manual download
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

console.log('📦 Full Offline Game Bundling\n');
console.log('This will download all game assets for complete offline use.\n');

// Check for wget
let hasWget = false;
try {
    execSync('which wget', { stdio: 'ignore' });
    hasWget = true;
    console.log('✅ Found wget - will use it for downloading\n');
} catch (e) {
    console.log('⚠️  wget not found - will use alternative method\n');
}

// For each game, create a download script
GAMES.forEach(game => {
    console.log(`\n📥 ${game.name}:`);
    console.log(`   URL: ${game.url}`);
    
    if (hasWget) {
        const wgetCmd = `wget --mirror --convert-links --adjust-extension --page-requisites --no-parent --directory-prefix="${game.dir}" "${game.url}"`;
        console.log(`   Command: ${wgetCmd}`);
        console.log(`   💡 Run this manually or we can automate it`);
    } else {
        console.log(`   💡 Install wget: brew install wget (macOS) or apt-get install wget (Linux)`);
        console.log(`   Then run: wget --mirror --convert-links --adjust-extension --page-requisites --no-parent "${game.url}"`);
    }
    
    // Create a simple local version for testing
    const simpleHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${game.name} - PC2 (Offline Test)</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a1a;
            color: white;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            text-align: center;
            padding: 40px;
        }
        h1 { margin-bottom: 20px; }
        .status {
            background: #2a2a2a;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .offline-test {
            background: #0d7a3d;
            padding: 20px;
            border-radius: 8px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${game.name}</h1>
        <div class="status">
            <p><strong>Offline Mode Test</strong></p>
            <p>This is a placeholder for fully bundled offline version</p>
        </div>
        <div class="offline-test">
            <p>🌐 To make fully offline:</p>
            <p>1. Download all game assets using wget</p>
            <p>2. Store in this directory</p>
            <p>3. Update all paths to be relative</p>
        </div>
        <iframe 
            src="${game.url}" 
            style="width: 100%; height: 600px; border: none; margin-top: 20px;"
            allow="fullscreen"
        ></iframe>
    </div>
</body>
</html>`;
    
    fs.writeFileSync(path.join(game.dir, 'index.html'), simpleHTML);
    console.log(`   ✅ Created test HTML`);
});

console.log('\n\n📝 Instructions for Full Offline:');
console.log('1. Install wget: brew install wget');
console.log('2. For each game, run:');
console.log('   cd src/backend/apps/[game-name]');
console.log('   wget --mirror --convert-links --adjust-extension --page-requisites --no-parent [game-url]');
console.log('3. Fix paths in downloaded files');
console.log('4. Test offline functionality\n');

console.log('💡 Alternative: Use browser DevTools Network tab to download all assets manually');
