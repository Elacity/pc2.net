#!/usr/bin/env node
/**
 * Download app icons from Puter API and store them locally
 * This ensures icons are available offline and no external calls are made at runtime
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ICONS_DIR = path.join(__dirname, '..', 'src', 'backend', 'assets', 'app-icons');
const APPS_TO_DOWNLOAD = ['camera', 'recorder', 'solitaire-frvr', 'app-center'];

// Ensure icons directory exists
if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
    console.log(`✅ Created icons directory: ${ICONS_DIR}`);
}

/**
 * Download icon from Puter API and save to local file
 */
function downloadIcon(appName, iconDataUrl) {
    return new Promise((resolve, reject) => {
        if (!iconDataUrl || !iconDataUrl.startsWith('data:')) {
            console.log(`⚠️  ${appName}: Invalid icon data URL, skipping`);
            resolve(null);
            return;
        }

        // Parse data URL: data:image/svg+xml;base64,<data>
        const matches = iconDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches) {
            console.log(`⚠️  ${appName}: Could not parse data URL, skipping`);
            resolve(null);
            return;
        }

        const [, format, base64Data] = matches;
        const extension = format === 'svg+xml' ? 'svg' : format;
        const iconPath = path.join(ICONS_DIR, `${appName}.${extension}`);
        const iconBuffer = Buffer.from(base64Data, 'base64');

        fs.writeFileSync(iconPath, iconBuffer);
        console.log(`✅ Downloaded ${appName} icon → ${iconPath}`);
        resolve(iconPath);
    });
}

/**
 * Fetch icons from Puter API
 */
function fetchPuterIcons() {
    return new Promise((resolve, reject) => {
        const puterAppsUrl = 'https://api.puter.com/get-launch-apps';
        
        console.log(`📥 Fetching icons from Puter API...`);
        
        https.get(puterAppsUrl, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const puterApps = JSON.parse(data);
                    const allApps = puterApps.all || [];
                    
                    console.log(`📊 Total apps in API response: ${allApps.length}`);
                    console.log(`🔍 Looking for apps: ${APPS_TO_DOWNLOAD.join(', ')}`);
                    
                    const iconMap = {};
                    allApps.forEach(app => {
                        if (APPS_TO_DOWNLOAD.includes(app.name)) {
                            iconMap[app.name] = app.icon;
                            console.log(`   ✓ Found ${app.name}`);
                        }
                    });
                    
                    // Log which apps were not found
                    APPS_TO_DOWNLOAD.forEach(appName => {
                        if (!iconMap[appName]) {
                            console.log(`   ⚠️  ${appName} not found in API response`);
                        }
                    });
                    
                    console.log(`✅ Fetched ${Object.keys(iconMap).length} icons from Puter API`);
                    resolve(iconMap);
                } catch (e) {
                    console.error(`❌ Failed to parse Puter API response: ${e.message}`);
                    console.error(`Response data (first 500 chars): ${data.substring(0, 500)}`);
                    reject(e);
                }
            });
        }).on('error', (err) => {
            console.error(`❌ Failed to fetch icons from Puter API: ${err.message}`);
            reject(err);
        });
    });
}

/**
 * Main function
 */
async function main() {
    try {
        // Fetch icons from Puter API
        const iconMap = await fetchPuterIcons();
        
        // Download each icon
        const downloadPromises = Object.entries(iconMap).map(([appName, iconDataUrl]) => 
            downloadIcon(appName, iconDataUrl)
        );
        
        await Promise.all(downloadPromises);
        
        console.log(`\n✅ All icons downloaded successfully!`);
        console.log(`📁 Icons saved to: ${ICONS_DIR}`);
        console.log(`\n💡 Next step: Update mock-pc2-server.cjs to use local icons instead of fetching from API`);
        
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
}

main();

