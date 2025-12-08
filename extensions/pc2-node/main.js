/*
 * Copyright (C) 2024-present Elacity
 *
 * PC2 Personal Cloud Node Extension
 * 
 * This extension enables secure, decentralized personal cloud connectivity.
 * Users can tether their wallet identity to their personal PC2 node and
 * access their cloud from anywhere in the world.
 */

const crypto = require('crypto');

// Extension lifecycle events
extension.on('preinit', event => {
    extension.log.info('[PC2 Node]: Pre-initialization started');
});

extension.on('init', async event => {
    extension.log.info('[PC2 Node]: Initialization started');
    
    const config = extension.config || {};
    
    // Check if this is first run (no owner yet)
    const db = extension.services.get('database');
    const nodeConfig = await db.read('SELECT * FROM pc2_config LIMIT 1');
    
    if (nodeConfig.length === 0) {
        // First run - generate setup token
        const setupToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(setupToken).digest('hex');
        const now = Math.floor(Date.now() / 1000);
        
        await db.write(
            `INSERT INTO pc2_config (node_name, setup_token_hash, setup_token_used, node_status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [config.node_name || 'My PC2', tokenHash, 0, 'AWAITING_OWNER', now, now]
        );
        
        // Display setup token prominently
        console.log('\n');
        console.log('═'.repeat(70));
        console.log('║' + ' '.repeat(68) + '║');
        console.log('║' + '  🔐 PC2 SETUP TOKEN - SAVE THIS! SHOWN ONLY ONCE!  '.padEnd(68) + '║');
        console.log('║' + ' '.repeat(68) + '║');
        console.log('═'.repeat(70));
        console.log('║' + ' '.repeat(68) + '║');
        console.log('║' + `  PC2-SETUP-${setupToken}  `.padEnd(68) + '║');
        console.log('║' + ' '.repeat(68) + '║');
        console.log('═'.repeat(70));
        console.log('║' + ' '.repeat(68) + '║');
        console.log('║' + '  Use this token to claim ownership from the browser.  '.padEnd(68) + '║');
        console.log('║' + '  Without this token, no one can access your PC2 node.  '.padEnd(68) + '║');
        console.log('║' + ' '.repeat(68) + '║');
        console.log('═'.repeat(70));
        console.log('\n');
        
        extension.log.info('[PC2 Node]: Setup token generated. Awaiting owner claim.');
    } else if (nodeConfig[0].node_status === 'AWAITING_OWNER') {
        extension.log.info('[PC2 Node]: Awaiting owner to claim node with setup token.');
    } else {
        extension.log.info('[PC2 Node]: Node is owned by ' + nodeConfig[0].owner_wallet_address);
    }
});

// Register PC2-specific routes
extension.on('install.routes', event => {
    extension.log.info('[PC2 Node]: Registering routes');
    
    const { PC2Routes } = require('./routes/pc2');
    event.router.use('/pc2', PC2Routes);
});

// Register the PC2 Gateway service
extension.on('install.services', event => {
    extension.log.info('[PC2 Node]: Registering services');
    
    const { PC2GatewayService } = require('./services/PC2GatewayService');
    event.services.registerService('pc2-gateway', PC2GatewayService);
});

// Grant permissions
extension.on('create.permissions', event => {
    extension.log.info('[PC2 Node]: Setting up permissions');
    
    // Only tethered wallets can access PC2 services
    // This is enforced at the gateway level, not here
});

extension.on('ready', event => {
    extension.log.info('[PC2 Node]: Extension ready ✓');
});


