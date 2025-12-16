#!/usr/bin/env node
/**
 * Update game icons in mock-pc2-server.cjs to use actual game icons
 */

const fs = require('fs');
const path = require('path');

const GAMES = [
    {
        name: 'solitaire-frvr',
        iconPath: 'src/backend/apps/solitaire-frvr/assets/icon256x256.png'
    },
    {
        name: 'in-orbit',
        iconPath: 'src/backend/apps/in-orbit/assets/icon256x256.png' // Will be created after bundling
    },
    {
        name: 'doodle-jump-extra',
        iconPath: 'src/backend/apps/doodle-jump-extra/assets/icon256x256.png' // Will be created after bundling
    }
];

function getBase64Icon(iconPath) {
    const fullPath = path.join(__dirname, '..', iconPath);
    if (!fs.existsSync(fullPath)) {
        console.log(`⚠️  Icon not found: ${iconPath}`);
        return null;
    }
    const icon = fs.readFileSync(fullPath);
    return `data:image/png;base64,${icon.toString('base64')}`;
}

function updateMockServerIcons() {
    const mockServerPath = path.join(__dirname, '..', 'tools', 'mock-pc2-server.cjs');
    let content = fs.readFileSync(mockServerPath, 'utf8');
    
    GAMES.forEach(game => {
        const icon = getBase64Icon(game.iconPath);
        if (!icon) {
            console.log(`⏭️  Skipping ${game.name} - icon not found`);
            return;
        }
        
        // Find the icon line for this game
        const pattern = new RegExp(`(name: '${game.name}',[\\s\\S]*?icon: ')[^']+(')`, 'g');
        const replacement = `$1${icon}$2`;
        
        if (content.match(pattern)) {
            content = content.replace(pattern, replacement);
            console.log(`✅ Updated icon for ${game.name}`);
        } else {
            console.log(`⚠️  Could not find icon definition for ${game.name}`);
        }
    });
    
    fs.writeFileSync(mockServerPath, content);
    console.log('\n✅ Icons updated in mock-pc2-server.cjs');
}

updateMockServerIcons();
