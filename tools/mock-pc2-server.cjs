#!/usr/bin/env node
/**
 * Mock PC2 Server for Testing
 * 
 * This is a simple WebSocket server that simulates a PC2 node
 * for testing the connection flow in the Puter frontend.
 * 
 * Usage: node tools/mock-pc2-server.js
 */

const http = require('http');
const crypto = require('crypto');

const PORT = 4200;

const fs = require('fs');
const os = require('os');
const path = require('path');

// State file location
const STATE_FILE = path.join(os.tmpdir(), 'pc2-mock-state.json');

// Load persisted state or create new
let nodeState;
let SETUP_TOKEN;

try {
    if (fs.existsSync(STATE_FILE)) {
        const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        nodeState = saved.nodeState;
        SETUP_TOKEN = saved.setupToken;
        // Sessions are stored as array in nodeState, convert back to Map
        nodeState.sessions = new Map(nodeState.sessions || []);
        console.log('\n📁 Loaded persisted state from', STATE_FILE);
        console.log('   Sessions loaded:', nodeState.sessions.size);
    } else {
        throw new Error('No state file');
    }
} catch (e) {
    // Generate new setup token
    SETUP_TOKEN = `PC2-SETUP-${crypto.randomBytes(16).toString('hex')}`;
    
    // Node state
    nodeState = {
        name: 'My Local PC2 (Mock)',
        status: 'AWAITING_OWNER',
        ownerWallet: null,
        tetheredWallets: [],
        sessions: new Map(),
        files: [],
        storageUsed: 0,
        storageLimit: 10 * 1024 * 1024 * 1024 // 10GB
    };
}

// Save state function
function saveState() {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify({
            nodeState: {
                ...nodeState,
                sessions: Array.from(nodeState.sessions.entries())
            },
            setupToken: SETUP_TOKEN
        }));
    } catch (e) {
        console.error('Failed to save state:', e);
    }
}

// Create HTTP server for REST endpoints
const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Parse URL
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;
    
    // Collect body
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        console.log(`[REQ] ${req.method} ${path} - Body: "${body.substring(0, 100)}"`);
        try {
            const data = body ? JSON.parse(body) : {};
            handleRequest(path, req.method, data, res, req);
        } catch (e) {
            console.log(`[ERR] JSON parse failed for path ${path}:`, e.message, `Body was: "${body}"`);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
    });
});

function handleRequest(path, method, data, res, req) {
    console.log(`[${new Date().toISOString()}] ${method} ${path}`);
    
    // Health check
    if (path === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ 
            status: 'ok',
            node_name: nodeState.name,
            node_status: nodeState.status
        }));
    }
    
    // Get node info
    if (path === '/api/info' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            name: nodeState.name,
            status: nodeState.status,
            hasOwner: !!nodeState.ownerWallet,
            tetheredCount: nodeState.tetheredWallets.length,
            storage: {
                used: nodeState.storageUsed,
                limit: nodeState.storageLimit,
                files: nodeState.files.length
            }
        }));
    }
    
    // Claim ownership with setup token
    if (path === '/api/claim' && method === 'POST') {
        const { setupToken, walletAddress, signature, message } = data;
        
        if (nodeState.status !== 'AWAITING_OWNER') {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Node already has an owner' }));
        }
        
        if (setupToken !== SETUP_TOKEN) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Invalid setup token' }));
        }
        
        // In real impl, we'd verify the signature
        // For mock, just accept it
        nodeState.ownerWallet = walletAddress;
        nodeState.status = 'ACTIVE';
        nodeState.tetheredWallets.push({
            address: walletAddress,
            isOwner: true,
            tetheredAt: Date.now()
        });
        
        console.log(`\n✅ Node claimed by wallet: ${walletAddress}\n`);
        
        // Save state
        saveState();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            success: true,
            message: 'Node ownership claimed successfully',
            sessionToken: crypto.randomBytes(32).toString('hex')
        }));
    }
    
    // Authenticate existing user
    if (path === '/api/auth' && method === 'POST') {
        const { walletAddress, signature, message, nonce } = data;
        
        if (nodeState.status !== 'ACTIVE') {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Node not yet claimed by owner' }));
        }
        
        const isTethered = nodeState.tetheredWallets.some(w => 
            w.address.toLowerCase() === walletAddress.toLowerCase()
        );
        
        if (!isTethered) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Wallet not authorized for this node' }));
        }
        
        // Create session
        const sessionToken = crypto.randomBytes(32).toString('hex');
        nodeState.sessions.set(sessionToken, {
            wallet: walletAddress,
            createdAt: Date.now(),
            lastActive: Date.now()
        });
        
        console.log(`\n🔐 Session created for wallet: ${walletAddress}\n`);
        
        // Save state
        saveState();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            success: true,
            sessionToken,
            nodeName: nodeState.name,
            isOwner: nodeState.ownerWallet?.toLowerCase() === walletAddress.toLowerCase()
        }));
    }
    
    // Verify existing session
    if (path === '/api/auth/verify' && method === 'POST') {
        const { walletAddress } = data;
        const authHeader = req?.headers?.['authorization'];
        
        console.log(`\n🔍 Session verify request:`, {
            walletAddress,
            hasAuthHeader: !!authHeader,
            authHeader: authHeader ? authHeader.substring(0, 20) + '...' : 'none',
            hasSessions: nodeState.sessions.size,
            dataKeys: Object.keys(data)
        });
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('❌ No auth header or invalid format');
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ valid: false, error: 'No token provided' }));
        }
        
        const token = authHeader.substring(7);
        const session = nodeState.sessions.get(token);
        
        console.log('Token:', token.substring(0, 8) + '..., Session found:', !!session);
        
        if (!session) {
            console.log('❌ Session not found in map');
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ valid: false, error: 'Session not found' }));
        }
        
        if (!walletAddress) {
            console.log('❌ No walletAddress in request body');
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ valid: false, error: 'Missing walletAddress' }));
        }
        
        if (session.wallet.toLowerCase() !== walletAddress.toLowerCase()) {
            console.log('❌ Wallet mismatch:', session.wallet, 'vs', walletAddress);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ valid: false, error: 'Wallet mismatch' }));
        }
        
        // Update last active
        session.lastActive = Date.now();
        
        console.log(`\n✅ Session verified for wallet: ${walletAddress}\n`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            valid: true,
            nodeName: nodeState.name,
            isOwner: nodeState.ownerWallet?.toLowerCase() === walletAddress.toLowerCase()
        }));
    }
    
    // Get stats (requires auth)
    if (path === '/api/stats' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            nodeName: nodeState.name,
            status: nodeState.status,
            owner: nodeState.ownerWallet ? `${nodeState.ownerWallet.slice(0, 6)}...${nodeState.ownerWallet.slice(-4)}` : null,
            tetheredWallets: nodeState.tetheredWallets.length,
            storage: {
                used: nodeState.storageUsed,
                limit: nodeState.storageLimit,
                usedPercent: Math.round((nodeState.storageUsed / nodeState.storageLimit) * 100)
            },
            files: nodeState.files.length,
            uptime: process.uptime()
        }));
    }
    
    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
}

// Start server
server.listen(PORT, () => {
    console.log('\n');
    console.log('═'.repeat(70));
    console.log('║' + ' '.repeat(68) + '║');
    console.log('║' + '  🚀 MOCK PC2 SERVER RUNNING  '.padEnd(68) + '║');
    console.log('║' + ' '.repeat(68) + '║');
    console.log('═'.repeat(70));
    console.log('║' + ' '.repeat(68) + '║');
    console.log('║' + `  URL: http://localhost:${PORT}  `.padEnd(68) + '║');
    console.log('║' + ' '.repeat(68) + '║');
    console.log('═'.repeat(70));
    console.log('║' + ' '.repeat(68) + '║');
    console.log('║' + '  🔐 SETUP TOKEN (use this to claim ownership):  '.padEnd(68) + '║');
    console.log('║' + ' '.repeat(68) + '║');
    console.log('║' + `  ${SETUP_TOKEN}  `.padEnd(68) + '║');
    console.log('║' + ' '.repeat(68) + '║');
    console.log('═'.repeat(70));
    console.log('\n');
    console.log('Endpoints:');
    console.log('  GET  /api/health  - Health check');
    console.log('  GET  /api/info    - Node information');
    console.log('  POST /api/claim   - Claim node ownership');
    console.log('  POST /api/auth    - Authenticate session');
    console.log('  GET  /api/stats   - Get node stats');
    console.log('\n');
});

// Handle shutdown
process.on('SIGINT', () => {
    console.log('\n\nShutting down mock PC2 server...');
    process.exit(0);
});

