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
        // Socket sessions are stored as array, convert back to Map
        nodeState.socketSessions = new Map(nodeState.socketSessions || []);
        // Initialize pendingEvents if missing (new field, might not exist in old state files)
        if (!Array.isArray(nodeState.pendingEvents)) {
            nodeState.pendingEvents = [];
        }
        console.log('\n📁 Loaded persisted state from', STATE_FILE);
        console.log('   Sessions loaded:', nodeState.sessions.size);
        console.log('   Socket sessions loaded:', nodeState.socketSessions.size);
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
        storageUsed: 0,
        // Socket.io sessions for real-time updates
        socketSessions: new Map(), // Map<sid, {wallet, lastPoll: timestamp}>
        pendingEvents: [], // Queue of events to send to clients
        storageLimit: 10 * 1024 * 1024 * 1024, // 10GB
        // In-memory filesystem (simulates IPFS storage)
        filesystem: {
            '/': { type: 'dir', name: '/', children: {}, created: Date.now() }
        }
    };
}

// Save state function
// Helper to emit socket.io events
function emitSocketEvent(event, data, wallet = null) {
    // Ensure pendingEvents is initialized (safety check)
    if (!Array.isArray(nodeState.pendingEvents)) {
        nodeState.pendingEvents = [];
    }
    
    nodeState.pendingEvents.push({
        event,
        data,
        wallet,
        timestamp: Date.now()
    });
    // Keep only last 100 events to prevent memory issues
    if (nodeState.pendingEvents.length > 100) {
        nodeState.pendingEvents = nodeState.pendingEvents.slice(-100);
    }
}

function saveState() {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify({
            nodeState: {
                ...nodeState,
                sessions: Array.from(nodeState.sessions.entries()),
                socketSessions: Array.from(nodeState.socketSessions.entries()),
                pendingEvents: [] // Don't persist events
            },
            setupToken: SETUP_TOKEN
        }));
    } catch (e) {
        console.error('Failed to save state:', e);
    }
}

// ═══════════════════════════════════════════════════════════════════
// FILESYSTEM HELPERS (simulate IPFS storage)
// ═══════════════════════════════════════════════════════════════════

/**
 * Get a node from the filesystem by path
 */
function getNode(filesystem, nodePath) {
    if (nodePath === '/' || nodePath === '') return filesystem['/'];
    
    // Normalize path: remove double slashes
    const normalizedPath = nodePath.replace(/\/+/g, '/');
    const parts = normalizedPath.split('/').filter(Boolean);
    let current = filesystem['/'];
    
    for (const part of parts) {
        if (!current || current.type !== 'dir' || !current.children) {
            return null;
        }
        
        // Case-insensitive lookup for directory and file names
        let foundChild = null;
        for (const childName in current.children) {
            if (childName.toLowerCase() === part.toLowerCase()) {
                foundChild = current.children[childName];
                break;
            }
        }
        
        if (!foundChild) {
            return null;
        }
        current = foundChild;
    }
    
    return current;
}

/**
 * Ensure a directory exists (creates parent dirs if needed)
 */
function ensureDir(filesystem, dirPath) {
    if (dirPath === '/' || dirPath === '') return filesystem['/'];
    
    const parts = dirPath.split('/').filter(Boolean);
    let current = filesystem['/'];
    let currentPath = '';
    
    for (const part of parts) {
        currentPath += '/' + part;
        
        // Case-insensitive lookup to find existing directory
        let foundKey = null;
        for (const key in current.children) {
            if (key.toLowerCase() === part.toLowerCase()) {
                foundKey = key;
                break;
            }
        }
        
        if (foundKey) {
            // Use existing directory (preserve original case)
            current = current.children[foundKey];
        } else {
            // Create new directory
            current.children[part] = {
                type: 'dir',
                name: part,
                children: {},
                created: Date.now()
            };
            console.log(`   Created dir: ${currentPath}`);
            current = current.children[part];
        }
    }
    
    return current;
}

/**
 * Calculate total size of a node (recursive for directories)
 */
function calculateSize(node) {
    if (node.type === 'file') {
        return node.size || 0;
    }
    
    let total = 0;
    if (node.children) {
        for (const child of Object.values(node.children)) {
            total += calculateSize(child);
        }
    }
    return total;
}

/**
 * Count total files in filesystem
 */
function countFiles(filesystem) {
    let count = 0;
    
    function countRecursive(node) {
        if (node.type === 'file') {
            count++;
        } else if (node.children) {
            for (const child of Object.values(node.children)) {
                countRecursive(child);
            }
        }
    }
    
    countRecursive(filesystem['/']);
    return count;
}

/**
 * Ensure user's home directory structure exists
 * Creates: /{walletAddress}/Desktop, Documents, Public
 */
function ensureUserHomeDirectory(walletAddress) {
    if (!walletAddress) return;
    
    const homePath = `/${walletAddress}`;
    const homeNode = getNode(nodeState.filesystem, homePath);
    
    // Standard directories to create
    const standardDirs = ['Desktop', 'Documents', 'Public', 'Pictures', 'Videos', 'Trash'];
    
    // If home directory already exists, ensure subdirs exist
    if (homeNode) {
        for (const dirName of standardDirs) {
            if (!homeNode.children[dirName]) {
                ensureDir(nodeState.filesystem, `${homePath}/${dirName}`);
            }
        }
    } else {
        // Create fresh home directory with standard structure
        console.log(`\n🏠 Creating home directory for: ${walletAddress}`);
        for (const dirName of standardDirs) {
            ensureDir(nodeState.filesystem, `${homePath}/${dirName}`);
        }
        saveState();
    }
}

// Simple multipart form data parser
function parseMultipart(body, boundary, bodyBuffer) {
    // Validate inputs
    if (!bodyBuffer || !Buffer.isBuffer(bodyBuffer)) {
        throw new Error('bodyBuffer is required and must be a Buffer');
    }
    if (!boundary || typeof boundary !== 'string') {
        throw new Error('boundary is required and must be a string');
    }
    
    const parts = {};
    const boundaryBytes = Buffer.from('--' + boundary, 'utf8');
    const boundaryCRLF = Buffer.from('\r\n--' + boundary, 'utf8');
    const boundaryLF = Buffer.from('\n--' + boundary, 'utf8');
    
    // Find all boundary positions in the buffer
    let searchPos = 0;
    const boundaries = [];
    while (searchPos < bodyBuffer.length) {
        const pos = bodyBuffer.indexOf(boundaryBytes, searchPos);
        if (pos === -1) break;
        boundaries.push(pos);
        searchPos = pos + boundaryBytes.length;
    }
    
    // If no boundaries found, return empty parts
    if (boundaries.length === 0) {
        console.warn('   ⚠️  No boundaries found in multipart data');
        return parts;
    }
    
    // Process each part between boundaries
    for (let i = 0; i < boundaries.length - 1; i++) {
        const partStart = boundaries[i] + boundaryBytes.length;
        const partEnd = boundaries[i + 1];
        
        // Skip if part is too small (empty or just boundary)
        if (partEnd - partStart < 10) continue;
        
        const partBuffer = bodyBuffer.slice(partStart, partEnd);
        
        // Find header/content separator (\r\n\r\n or \n\n)
        const headerEndCRLF = partBuffer.indexOf(Buffer.from('\r\n\r\n', 'utf8'));
        const headerEndLF = partBuffer.indexOf(Buffer.from('\n\n', 'utf8'));
        const headerEndPos = headerEndCRLF !== -1 ? headerEndCRLF + 4 : (headerEndLF !== -1 ? headerEndLF + 2 : -1);
        
        if (headerEndPos === -1) continue;
        
        // Extract headers as string
        const headerBuffer = partBuffer.slice(0, headerEndPos);
        const headers = headerBuffer.toString('utf8');
        
        // Extract content as buffer (for binary files)
        const contentStart = headerEndPos;
        // Find end of content (before trailing \r\n before next boundary)
        let contentEnd = partBuffer.length;
        if (partBuffer[contentEnd - 1] === 0x0A) contentEnd--; // Remove trailing \n
        if (partBuffer[contentEnd - 1] === 0x0D) contentEnd--; // Remove trailing \r
        
        const contentBuffer = partBuffer.slice(contentStart, contentEnd);
        
        // Parse headers
        const nameMatch = headers.match(/name="([^"]+)"/);
        const filenameMatch = headers.match(/filename="([^"]+)"/);
        const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
        
        if (nameMatch) {
            const fieldName = nameMatch[1];
            if (filenameMatch) {
                // It's a file - convert binary content to base64
                const base64Content = contentBuffer.toString('base64');
                
                // Log content extraction for debugging
                if (base64Content.length === 0) {
                    console.warn(`   ⚠️  WARNING: Extracted empty content for file "${filenameMatch[1]}"`);
                    console.warn(`   ⚠️  contentBuffer length: ${contentBuffer.length}, partBuffer length: ${partBuffer.length}, headerEndPos: ${headerEndPos}`);
                }
                
                parts[fieldName] = {
                    filename: filenameMatch[1],
                    content: base64Content,
                    isBase64: true,
                    mimeType: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream',
                };
            } else {
                // It's a regular field - convert to string
                const fieldValue = contentBuffer.toString('utf8').trim();
                parts[fieldName] = fieldValue;
            }
        }
    }
    
    return parts;
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
    // IMPORTANT: Normalize path to remove double slashes (caused by trailing slash in API origin)
    let urlPath = url.pathname.replace(/\/+/g, '/');
    if (urlPath.length > 1 && urlPath.endsWith('/')) {
        urlPath = urlPath.slice(0, -1);
    }
    
    // Handle static file serving for apps (before body collection for GET requests)
    // Apps are served from subdomains: viewer.localhost:4200, player.localhost:4200, etc.
    const hostname = req.headers.host || `localhost:${PORT}`;
    const subdomain = hostname.split('.')[0];
    
    // Check if this is an app subdomain request
    const appSubdomains = ['viewer', 'player', 'pdf', 'editor', 'terminal'];
    if (appSubdomains.includes(subdomain) && req.method === 'GET') {
        // Try to serve from local apps directory
        const appsDir = path.join(__dirname, '../src/backend/apps', subdomain);
        
        if (fs.existsSync(appsDir)) {
            let filePath = urlPath === '/' ? '/index.html' : urlPath;
            if (!filePath.startsWith('/')) filePath = '/' + filePath;
            
            const fullPath = path.join(appsDir, filePath);
            const safePath = path.normalize(fullPath);
            
            // Security: ensure path is within appsDir
            if (!safePath.startsWith(path.normalize(appsDir))) {
                res.writeHead(403, { 'Content-Type': 'text/plain' });
                res.end('Forbidden');
                return;
            }
            
            // Check if file exists
            if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
                const ext = path.extname(safePath).toLowerCase();
                const mimeTypes = {
                    '.html': 'text/html',
                    '.js': 'application/javascript',
                    '.css': 'text/css',
                    '.json': 'application/json',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.svg': 'image/svg+xml',
                    '.woff': 'font/woff',
                    '.woff2': 'font/woff2',
                    '.ttf': 'font/ttf',
                    '.wasm': 'application/wasm',
                };
                
                const contentType = mimeTypes[ext] || 'application/octet-stream';
                const fileContent = fs.readFileSync(safePath);
                
                res.writeHead(200, { 
                    'Content-Type': contentType,
                    'Cache-Control': 'no-cache'
                });
                res.end(fileContent);
                return;
            } else if (fs.existsSync(safePath) && fs.statSync(safePath).isDirectory()) {
                // Try index.html in directory
                const indexPath = path.join(safePath, 'index.html');
                if (fs.existsSync(indexPath)) {
                    const fileContent = fs.readFileSync(indexPath);
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(fileContent);
                    return;
                }
            }
        }
        
        // If app files don't exist locally, fall through to handleRequest
        // (which will return 404 or handle API requests)
    }
    
    // Collect body as buffer for multipart
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        const body = bodyBuffer.length > 0 ? bodyBuffer.toString('utf8') : '';
        
        // Don't log socket.io requests (they spam the console)
        if (!urlPath.includes('socket.io')) {
            const bodyPreview = body ? body.substring(0, 100) : '(empty)';
            console.log(`[REQ] ${req.method} ${urlPath} - Body: "${bodyPreview}..." (${bodyBuffer.length} bytes)`);
        }
        
        // Check if it's multipart form data
        const contentType = req.headers['content-type'] || '';
        if (contentType.includes('multipart/form-data')) {
            const boundaryMatch = contentType.match(/boundary=([^;]+)/);
            if (boundaryMatch) {
                const boundary = boundaryMatch[1].trim();
                console.log(`\n📦 MULTIPART REQUEST detected, boundary: ${boundary.substring(0, 20)}..., bodyBuffer length: ${bodyBuffer.length}`);
                
                // Validate bodyBuffer before parsing
                if (!bodyBuffer || bodyBuffer.length === 0) {
                    console.error(`   ❌ Empty body buffer for multipart request`);
                    if (!res.headersSent) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Empty request body for multipart form data' }));
                    }
                    return;
                }
                
                try {
                    const formData = parseMultipart(body, boundary, bodyBuffer);
                    console.log(`   ✅ Parsed form data keys:`, Object.keys(formData));
                    handleRequest(urlPath, req.method, formData, res, req, body, bodyBuffer);
                    return;
                } catch (e) {
                    console.error(`   ❌ Multipart parse error:`, e.message);
                    console.error(`   Stack:`, e.stack);
                    if (!res.headersSent) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Failed to parse multipart data', details: e.message }));
                    }
                    return;
                }
            } else {
                console.warn(`   ⚠️  Multipart content-type but no boundary found`);
            }
        }
        
        try {
            // Only parse body for POST requests with content
            const data = (body && body.trim() && body.trim().startsWith('{')) ? JSON.parse(body) : {};
            handleRequest(urlPath, req.method, data, res, req, body, bodyBuffer);
        } catch (e) {
            // If JSON parsing fails for file APIs, try URL params
            if (urlPath === '/stat' || urlPath === '/read' || urlPath === '/df' || urlPath === '/batch') {
                handleRequest(urlPath, req.method, {}, res, req, body, bodyBuffer);
            } else {
                console.log(`[ERR] JSON parse failed for path ${urlPath}:`, e.message);
                if (!res.headersSent) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
            }
        }
    });
});

function handleRequest(path, method, data, res, req, rawBody, bodyBuffer) {
    // Don't log socket.io to avoid spam
    if (!path.includes('socket.io')) {
        console.log(`[${new Date().toISOString()}] ${method} ${path}`);
    }
    
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
        const fileCount = countFiles(nodeState.filesystem);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            name: nodeState.name,
            status: nodeState.status,
            hasOwner: !!nodeState.ownerWallet,
            tetheredCount: nodeState.tetheredWallets.length,
            storage: {
                used: nodeState.storageUsed,
                limit: nodeState.storageLimit,
                files: fileCount
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
        
        // Create and store session token (this was missing!)
        const sessionToken = crypto.randomBytes(32).toString('hex');
        nodeState.sessions.set(sessionToken, {
            wallet: walletAddress,
            createdAt: Date.now(),
            lastActive: Date.now()
        });
        
        // Ensure user's home directory exists
        ensureUserHomeDirectory(walletAddress);
        
        console.log(`\n✅ Node claimed by wallet: ${walletAddress}`);
        console.log(`🔐 Session created: ${sessionToken.substring(0, 8)}...\n`);
        
        // Save state
        saveState();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            success: true,
            message: 'Node ownership claimed successfully',
            sessionToken: sessionToken
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
        
        // Ensure user's home directory exists
        ensureUserHomeDirectory(walletAddress);
        
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
        const fileCount = countFiles(nodeState.filesystem);
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
            files: fileCount,
            uptime: process.uptime()
        }));
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // FILE STORAGE API (simulates IPFS storage on PC2)
    // ═══════════════════════════════════════════════════════════════════
    
    // List directory
    if (path.startsWith('/api/files/list') && method === 'GET') {
        const filePath = decodeURIComponent(path.replace('/api/files/list', '') || '/');
        console.log(`\n📂 LIST: ${filePath}`);
        
        const node = getNode(nodeState.filesystem, filePath);
        if (!node) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Path not found' }));
        }
        
        if (node.type !== 'dir') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Not a directory' }));
        }
        
        const entries = Object.values(node.children).map(child => ({
            name: child.name,
            type: child.type,
            size: child.size || 0,
            created: child.created,
            modified: child.modified || child.created,
            path: `${filePath === '/' ? '' : filePath}/${child.name}`
        }));
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ path: filePath, entries }));
    }
    
    // Get file/folder stat
    if (path.startsWith('/api/files/stat') && method === 'GET') {
        const filePath = decodeURIComponent(path.replace('/api/files/stat', '') || '/');
        console.log(`\n📊 STAT: ${filePath}`);
        
        const node = getNode(nodeState.filesystem, filePath);
        if (!node) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Path not found' }));
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            name: node.name,
            path: filePath,
            type: node.type,
            size: node.size || 0,
            created: node.created,
            modified: node.modified || node.created,
            cid: node.cid || null // IPFS CID (mock)
        }));
    }
    
    // Read file
    if (path.startsWith('/api/files/read') && method === 'GET') {
        const filePath = decodeURIComponent(path.replace('/api/files/read', ''));
        console.log(`\n📖 READ: ${filePath}`);
        
        const node = getNode(nodeState.filesystem, filePath);
        if (!node) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'File not found' }));
        }
        
        if (node.type !== 'file') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Not a file' }));
        }
        
        // Return file content
        res.writeHead(200, { 
            'Content-Type': node.mimeType || 'application/octet-stream',
            'Content-Length': node.size || 0
        });
        return res.end(node.content || '');
    }
    
    // Write file (POST with body)
    if (path === '/api/files/write' && method === 'POST') {
        const { path: filePath, content, mimeType, encoding } = data;
        if (!filePath) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Missing path' }));
        }
        
        // Decode content if base64 encoded
        let fileContent = content || '';
        if (encoding === 'base64' && content) {
            fileContent = Buffer.from(content, 'base64').toString('utf8');
        }
        
        console.log(`\n📝 WRITE: ${filePath} (${(fileContent?.length || 0)} bytes${encoding === 'base64' ? ', decoded from base64' : ''})`);
        
        // Create parent directories if needed
        const parentPath = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
        ensureDir(nodeState.filesystem, parentPath);
        
        // Create/update file
        const fileName = filePath.split('/').pop();
        const parent = getNode(nodeState.filesystem, parentPath);
        
        const fileSize = Buffer.byteLength(fileContent || '', 'utf8');
        const oldSize = parent.children[fileName]?.size || 0;
        
        parent.children[fileName] = {
            type: 'file',
            name: fileName,
            content: fileContent || '',
            size: fileSize,
            mimeType: mimeType || 'text/plain',
            created: parent.children[fileName]?.created || Date.now(),
            modified: Date.now(),
            cid: `Qm${crypto.randomBytes(22).toString('hex')}` // Mock IPFS CID
        };
        
        // Update storage stats
        nodeState.storageUsed += (fileSize - oldSize);
        saveState();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ 
            success: true, 
            path: filePath,
            size: fileSize,
            cid: parent.children[fileName].cid
        }));
    }
    
    // Create directory
    if (path === '/api/files/mkdir' && method === 'POST') {
        const { path: dirPath } = data;
        if (!dirPath) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Missing path' }));
        }
        
        console.log(`\n📁 MKDIR: ${dirPath}`);
        
        ensureDir(nodeState.filesystem, dirPath);
        saveState();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, path: dirPath }));
    }
    
    // Move file/directory
    if (path === '/api/files/move' && method === 'POST') {
        const { from, to } = data;
        if (!from || !to) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Missing from or to path' }));
        }
        
        console.log(`\n🔄 MOVE: ${from} → ${to}`);
        
        // Get source
        const sourceParentPath = from.substring(0, from.lastIndexOf('/')) || '/';
        const sourceName = from.split('/').pop();
        const sourceParent = getNode(nodeState.filesystem, sourceParentPath);
        
        if (!sourceParent || !sourceParent.children[sourceName]) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Source not found' }));
        }
        
        // Get/create destination parent
        const destParentPath = to.substring(0, to.lastIndexOf('/')) || '/';
        const destName = to.split('/').pop();
        ensureDir(nodeState.filesystem, destParentPath);
        const destParent = getNode(nodeState.filesystem, destParentPath);
        
        // Check if destination already exists
        if (destParent.children[destName]) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Destination already exists' }));
        }
        
        // Move the node
        destParent.children[destName] = {
            ...sourceParent.children[sourceName],
            name: destName,
            modified: Date.now()
        };
        delete sourceParent.children[sourceName];
        saveState();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, from, to }));
    }
    
    // Delete file/directory
    if (path === '/api/files/delete' && method === 'POST') {
        const { path: targetPath } = data;
        if (!targetPath || targetPath === '/') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Invalid path' }));
        }
        
        console.log(`\n🗑️  DELETE: ${targetPath}`);
        
        const parentPath = targetPath.substring(0, targetPath.lastIndexOf('/')) || '/';
        const name = targetPath.split('/').pop();
        const parent = getNode(nodeState.filesystem, parentPath);
        
        if (!parent || !parent.children[name]) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Not found' }));
        }
        
        // Calculate size to remove
        const sizeToRemove = calculateSize(parent.children[name]);
        nodeState.storageUsed -= sizeToRemove;
        
        delete parent.children[name];
        saveState();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, path: targetPath }));
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // PUTER API FORMAT (for full integration with Puter frontend)
    // These endpoints match Puter's actual API format
    // ═══════════════════════════════════════════════════════════════════
    
    // /whoami - Get current user info
    if (path === '/whoami' && method === 'GET') {
        // Get session from Authorization header
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Unauthorized' }));
        }
        
        const token = authHeader.split(' ')[1];
        // Session token IS the key in the Map
        const session = nodeState.sessions.get(token);
        
        if (!session) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Invalid session' }));
        }
        
        const walletAddress = session.wallet;
        console.log(`\n👤 WHOAMI: ${walletAddress}`);
        
        // Ensure user's home directory structure exists
        ensureUserHomeDirectory(walletAddress);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            id: 1,
            uuid: walletAddress,
            username: walletAddress,
            wallet_address: walletAddress,
            email: null,
            email_confirmed: true,
            is_temp: false,
            taskbar_items: [],
            desktop_bg_url: null,
            desktop_bg_color: '#1a1a2e',
            desktop_bg_fit: 'cover',
        }));
    }
    
    // /stat - Get file/folder info (Puter format)
    if (path === '/stat' && (method === 'GET' || method === 'POST')) {
        // Get path from query params (GET) or body (POST)
        const url = new URL(req.url, `http://localhost:${PORT}`);
        let filePath = data.path || data.file || data.subject || url.searchParams.get('path') || url.searchParams.get('file') || '/';
        
        // Handle ~ (home directory) - replace with wallet directory if session exists
        const authHeader = req.headers['authorization'];
        if (filePath.startsWith('~') && authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const session = nodeState.sessions.get(token);
            if (session && session.wallet) {
                filePath = filePath.replace('~', `/${session.wallet}`);
            }
        }
        
        // Normalize path: remove double slashes, ensure starts with /
        let normalizedPath = filePath.replace(/\/+/g, '/'); // Remove multiple slashes
        if (!normalizedPath.startsWith('/')) {
            normalizedPath = '/' + normalizedPath;
        }
        if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
            normalizedPath = normalizedPath.slice(0, -1); // Remove trailing slash
        }
        
        console.log(`\n📊 STAT (Puter): ${normalizedPath}`);
        
        let node = getNode(nodeState.filesystem, normalizedPath);
        
        // If not found, try case-insensitive lookup
        if (!node) {
            const parts = normalizedPath.split('/').filter(Boolean);
            let current = nodeState.filesystem['/'];
            let actualPath = '/';
            
            for (const part of parts) {
                if (!current || current.type !== 'dir' || !current.children) {
                    break;
                }
                
                // Try exact match first
                if (current.children[part]) {
                    current = current.children[part];
                    actualPath += '/' + part;
                    continue;
                }
                
                // Try case-insensitive match
                const found = Object.keys(current.children).find(key => 
                    key.toLowerCase() === part.toLowerCase()
                );
                
                if (found) {
                    current = current.children[found];
                    actualPath += '/' + found;
                } else {
                    current = null;
                    break;
                }
            }
            
            if (current) {
                node = current;
                normalizedPath = actualPath;
            }
        }
        
        if (!node) {
            console.warn(`   ⚠️  File not found at: ${normalizedPath}`);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: { code: 'subject_does_not_exist', message: 'File not found' } }));
        }
        
        const parentPath = normalizedPath === '/' ? null : normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '/';
        
        // Ensure size is correctly returned (for files, use actual size; for dirs, use 0)
        let fileSize = node.type === 'dir' ? 0 : (node.size || 0);
        
        // Debug: Log node structure for files
        if (node.type === 'file') {
            console.log(`   🔍 DEBUG FILE NODE: name=${node.name}, storedSize=${node.size}, hasContent=${!!node.content}, contentType=${typeof node.content}, isBase64=${node.isBase64 || false}`);
            if (node.content) {
                const contentLen = typeof node.content === 'string' ? node.content.length : (node.content.length || 0);
                console.log(`   🔍 DEBUG: content length: ${contentLen}`);
            }
        }
        
        // If size is 0 but node has content, recalculate size
        if (fileSize === 0 && node.type === 'file' && node.content) {
            if (node.isBase64 && typeof node.content === 'string') {
                try {
                    const decoded = Buffer.from(node.content, 'base64');
                    fileSize = decoded.length;
                    console.log(`   ⚠️  Size was 0, recalculated from base64 content: ${fileSize} bytes`);
                    // Update the node's size
                    node.size = fileSize;
                    saveState(); // Persist the corrected size
                } catch (e) {
                    fileSize = Buffer.byteLength(node.content, 'utf8');
                    console.log(`   ⚠️  Size was 0, recalculated from string content: ${fileSize} bytes`);
                    node.size = fileSize;
                    saveState();
                }
            } else if (typeof node.content === 'string') {
                fileSize = Buffer.byteLength(node.content, 'utf8');
                console.log(`   ⚠️  Size was 0, recalculated from content: ${fileSize} bytes`);
                node.size = fileSize;
                saveState();
            } else {
                console.warn(`   ⚠️  Size is 0 but content exists with unknown type: ${typeof node.content}`);
            }
        } else if (fileSize === 0 && node.type === 'file') {
            console.warn(`   ⚠️  WARNING: File "${node.name}" has size 0 and no content!`);
            console.warn(`   ⚠️  Node keys: ${Object.keys(node).join(', ')}`);
            console.warn(`   ⚠️  Node: ${JSON.stringify(node, null, 2).substring(0, 500)}`);
        }
        
        console.log(`   ✅ Found: ${node.name}, type: ${node.type}, size: ${fileSize} bytes, hasContent: ${!!node.content}, contentLength: ${node.content ? (typeof node.content === 'string' ? node.content.length : 'buffer') : 0}`);
        console.log(`   📅 Timestamps: created=${node.created ? new Date(node.created).toISOString() : 'missing'}, modified=${node.modified ? new Date(node.modified).toISOString() : 'missing'}`);
        
        // Ensure timestamps exist (fallback to now if missing)
        const createdTimestamp = node.created || Date.now();
        const modifiedTimestamp = node.modified || Date.now();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            id: node.id || Math.floor(Math.random() * 10000),
            uid: node.uuid || `uuid-${normalizedPath.replace(/\//g, '-')}`,
            uuid: node.uuid || `uuid-${normalizedPath.replace(/\//g, '-')}`,
            name: node.name || normalizedPath.split('/').pop() || '/',
            path: normalizedPath,
            is_dir: node.type === 'dir',
            is_empty: node.type === 'dir' ? Object.keys(node.children || {}).length === 0 : false,
            size: fileSize,
            created: new Date(createdTimestamp).toISOString(),
            modified: new Date(modifiedTimestamp).toISOString(),
            accessed: new Date().toISOString(),
            type: node.mimeType || (node.type === 'dir' ? null : 'application/octet-stream'),
            parent_id: parentPath ? Math.floor(Math.random() * 10000) : null,
            parent_uid: parentPath ? `uuid-${parentPath.replace(/\//g, '-')}` : null,
            immutable: false,
        }));
    }
    
    // /file - Read file via signed URL (Puter format - used by apps)
    if (path === '/file' && method === 'GET') {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const fileUid = url.searchParams.get('uid');
        const expires = url.searchParams.get('expires');
        const signature = url.searchParams.get('signature');
        const download = url.searchParams.get('download');
        
        console.log(`\n📄 FILE (signed): uid=${fileUid}`);
        
        // Find file by UID in filesystem
        let targetNode = null;
        let targetPath = null;
        
        const findNodeByUid = (node, path = '/') => {
            // Normalize UUID comparison (handle double dashes)
            const normalizedUid = fileUid.replace(/^uuid-+/, 'uuid-');
            const nodeUid = node.uuid ? node.uuid.replace(/^uuid-+/, 'uuid-') : null;
            
            if (nodeUid === normalizedUid) {
                targetNode = node;
                targetPath = path;
                return true;
            }
            if (node.children) {
                for (const [name, child] of Object.entries(node.children)) {
                    if (findNodeByUid(child, path === '/' ? `/${name}` : `${path}/${name}`)) {
                        return true;
                    }
                }
            }
            return false;
        };
        
        findNodeByUid(nodeState.filesystem);
        
        if (!targetNode || targetNode.type === 'dir') {
            console.warn(`   ⚠️  File not found by UID: ${fileUid}`);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'File not found' }));
        }
        
        console.log(`   ✅ Found: ${targetNode.name}, size: ${targetNode.size || 0} bytes, isBase64: ${targetNode.isBase64 || false}`);
        
        // Handle binary content correctly
        let content = targetNode.content || '';
        let contentBuffer;
        
        if (targetNode.isBase64 && typeof content === 'string') {
            try {
                contentBuffer = Buffer.from(content, 'base64');
            } catch (e) {
                console.warn(`   ⚠️  Failed to decode base64 content: ${e.message}`);
                contentBuffer = Buffer.from(content, 'utf8');
            }
        } else if (typeof content === 'string') {
            const isBinary = targetNode.mimeType && (
                targetNode.mimeType.startsWith('image/') ||
                targetNode.mimeType.startsWith('video/') ||
                targetNode.mimeType.startsWith('audio/') ||
                targetNode.mimeType === 'application/octet-stream'
            );
            
            if (isBinary) {
                try {
                    contentBuffer = Buffer.from(content, 'base64');
                } catch (e) {
                    contentBuffer = Buffer.from(content, 'binary');
                }
            } else {
                contentBuffer = Buffer.from(content, 'utf8');
            }
        } else {
            contentBuffer = content;
        }
        
        const headers = {
            'Content-Type': targetNode.mimeType || 'application/octet-stream',
            'Content-Length': contentBuffer.length,
            'Access-Control-Allow-Origin': '*',
        };
        
        if (download === 'true' || download === '1') {
            headers['Content-Disposition'] = `attachment; filename="${targetNode.name}"`;
        }
        
        res.writeHead(200, headers);
        return res.end(contentBuffer);
    }
    
    // /read - Read file content (Puter format)
    if (path === '/read' && method === 'GET') {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        let filePath = url.searchParams.get('file') || '/';
        
        // Handle ~ (home directory)
        const authHeader = req.headers['authorization'];
        if (filePath.startsWith('~') && authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const session = nodeState.sessions.get(token);
            if (session && session.wallet) {
                filePath = filePath.replace('~', `/${session.wallet}`);
            }
        }
        
        // Normalize path: remove double slashes, ensure starts with /
        let normalizedPath = filePath.replace(/\/+/g, '/'); // Remove multiple slashes
        if (!normalizedPath.startsWith('/')) {
            normalizedPath = '/' + normalizedPath;
        }
        if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
            normalizedPath = normalizedPath.slice(0, -1); // Remove trailing slash
        }
        
        console.log(`\n📖 READ (Puter): ${normalizedPath}`);
        
        const node = getNode(nodeState.filesystem, normalizedPath);
        if (!node || node.type === 'dir') {
            console.warn(`   ⚠️  File not found at: ${normalizedPath}`);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'File not found' }));
        }
        
        console.log(`   ✅ Found: ${node.name}, size: ${node.size || 0} bytes, isBase64: ${node.isBase64 || false}`);
        
        // Handle binary content correctly
        let content = node.content || '';
        let contentBuffer;
        
        // If content is stored as base64, decode it
        if (node.isBase64 && typeof content === 'string') {
            try {
                contentBuffer = Buffer.from(content, 'base64');
            } catch (e) {
                console.warn(`   ⚠️  Failed to decode base64 content: ${e.message}`);
                contentBuffer = Buffer.from(content, 'utf8');
            }
        } else if (typeof content === 'string') {
            // For binary files, try base64 first, then binary encoding
            const isBinary = node.mimeType && (
                node.mimeType.startsWith('image/') ||
                node.mimeType.startsWith('video/') ||
                node.mimeType.startsWith('audio/') ||
                node.mimeType === 'application/octet-stream'
            );
            
            if (isBinary) {
                // Try to decode as base64 first, if that fails use raw
                try {
                    contentBuffer = Buffer.from(content, 'base64');
                } catch (e) {
                    // If not base64, treat as raw binary string
                    contentBuffer = Buffer.from(content, 'binary');
                }
            } else {
                contentBuffer = Buffer.from(content, 'utf8');
            }
        } else {
            contentBuffer = content;
        }
        
        res.writeHead(200, { 
            'Content-Type': node.mimeType || 'application/octet-stream',
            'Content-Length': contentBuffer.length,
            'Access-Control-Allow-Origin': '*',
        });
        return res.end(contentBuffer);
    }
    
    // /readdir - List directory contents (Puter format)
    if (path === '/readdir' && method === 'POST') {
        console.log(`\n🔵 READDIR HANDLER CALLED - path: ${path}, method: ${method}`);
        console.log(`   Data keys:`, Object.keys(data || {}));
        console.log(`   Data.path:`, data?.path);
        console.log(`   Data.subject:`, data?.subject);
        
        let dirPath = data.path || data.subject || '/';
        console.log(`   Initial dirPath: ${dirPath}`);
        
        // Handle ~ (home directory)
        const authHeader = req.headers['authorization'];
        if (dirPath.startsWith('~') && authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const session = nodeState.sessions.get(token);
            if (session && session.wallet) {
                dirPath = dirPath.replace('~', `/${session.wallet}`);
                console.log(`   Replaced ~ with wallet: ${dirPath}`);
            }
        }
        
        // Normalize path: remove double slashes, ensure starts with /
        let normalizedPath = dirPath.replace(/\/+/g, '/'); // Remove multiple slashes
        if (!normalizedPath.startsWith('/')) {
            normalizedPath = '/' + normalizedPath;
        }
        if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
            normalizedPath = normalizedPath.slice(0, -1); // Remove trailing slash
        }
        
        console.log(`\n📂 READDIR (Puter): ${normalizedPath}`);
        
        // Ensure user home directory exists (creates standard dirs if needed)
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const session = nodeState.sessions.get(token);
            if (session && session.wallet) {
                ensureUserHomeDirectory(session.wallet);
            }
        }
        
        const node = getNode(nodeState.filesystem, normalizedPath);
        if (!node) {
            console.warn(`   ⚠️  Node not found at: ${normalizedPath}`);
            console.warn(`   ⚠️  Filesystem root children:`, Object.keys(nodeState.filesystem['/'].children || {}));
            // Debug: try to find the parent and see what children it has
            const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '/';
            const parentNode = getNode(nodeState.filesystem, parentPath);
            if (parentNode) {
                console.warn(`   🔍 Parent "${parentPath}" exists and has children:`, Object.keys(parentNode.children || {}));
                // If looking for Desktop, check if it exists with different case
                if (normalizedPath.includes('Desktop')) {
                    const desktopName = normalizedPath.split('/').pop();
                    console.warn(`   🔍 Looking for "${desktopName}" in parent children:`, Object.keys(parentNode.children || {}));
                    for (const childName of Object.keys(parentNode.children || {})) {
                        if (childName.toLowerCase() === desktopName.toLowerCase()) {
                            console.warn(`   🔍 Found case variant: "${childName}" (requested: "${desktopName}")`);
                            const variantNode = parentNode.children[childName];
                            console.warn(`   🔍 Variant node has ${Object.keys(variantNode.children || {}).length} children`);
                        }
                    }
                }
            }
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Directory not found' }));
        }
        if (node.type !== 'dir') {
            console.warn(`   ⚠️  Path is not a directory: ${normalizedPath} (type: ${node.type})`);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Not a directory' }));
        }
        
        const entries = [];
        const children = node.children || {};
        console.log(`   📋 Directory "${normalizedPath}" has ${Object.keys(children).length} children:`, Object.keys(children).slice(0, 10).join(', '), Object.keys(children).length > 10 ? '...' : '');
        if (Object.keys(children).length === 0 && normalizedPath.includes('Desktop')) {
            console.warn(`   ⚠️  DESKTOP IS EMPTY! Node keys:`, Object.keys(node));
            console.warn(`   ⚠️  Node type:`, node.type, 'has children prop:', !!node.children);
            console.warn(`   ⚠️  Node name:`, node.name);
            // Check if there's a Desktop with different case in parent
            const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '/';
            const parentNode = getNode(nodeState.filesystem, parentPath);
            if (parentNode) {
                console.warn(`   🔍 Parent has children:`, Object.keys(parentNode.children || {}));
            }
        }
        
        for (const [name, child] of Object.entries(children)) {
            const childPath = normalizedPath === '/' ? `/${name}` : `${normalizedPath}/${name}`;
            entries.push({
                id: child.id || Math.floor(Math.random() * 10000),
                uid: child.uuid || `uuid-${childPath.replace(/\//g, '-')}`,
                uuid: child.uuid || `uuid-${childPath.replace(/\//g, '-')}`,
                name: name,
                path: childPath,
                is_dir: child.type === 'dir',
                is_empty: child.type === 'dir' ? Object.keys(child.children || {}).length === 0 : false,
                size: child.size || 0,
                created: child.created ? new Date(child.created).toISOString() : new Date().toISOString(),
                modified: child.modified ? new Date(child.modified).toISOString() : new Date().toISOString(),
                type: child.mimeType || (child.type === 'dir' ? null : 'application/octet-stream'),
            });
        }
        
        console.log(`   ✅ Returning ${entries.length} entries from readdir`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(entries));
    }
    
    // /write or /up - Write file (Puter format - simplified JSON version)
    if ((path === '/write' || path === '/up') && method === 'POST') {
        const filePath = data.path;
        const content = data.content || '';
        const name = data.name;
        
        if (!filePath && !name) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'path or name is required' }));
        }
        
        // Determine final path
        let finalPath = filePath;
        if (!finalPath && name) {
            const parent = data.parent || '/';
            finalPath = parent === '/' ? `/${name}` : `${parent}/${name}`;
        }
        
        const normalizedPath = finalPath.startsWith('/') ? finalPath : '/' + finalPath;
        console.log(`\n📝 WRITE (Puter): ${normalizedPath} (${content.length} bytes)`);
        
        // Create parent directories
        const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '/';
        ensureDir(nodeState.filesystem, parentPath);
        
        // Write file
        const fileName = normalizedPath.split('/').pop();
        const parent = getNode(nodeState.filesystem, parentPath);
        
        // Decode content if base64
        let fileContent = content;
        if (data.encoding === 'base64' && content) {
            fileContent = Buffer.from(content, 'base64').toString('utf8');
        }
        
        const fileSize = Buffer.byteLength(fileContent, 'utf8');
        const oldSize = parent.children[fileName]?.size || 0;
        
        parent.children[fileName] = {
            type: 'file',
            name: fileName,
            content: fileContent,
            size: fileSize,
            mimeType: data.type || 'application/octet-stream',
            created: parent.children[fileName]?.created || Date.now(),
            modified: Date.now(),
            uuid: parent.children[fileName]?.uuid || `uuid-${normalizedPath.replace(/\//g, '-')}`,
        };
        
        nodeState.storageUsed += (fileSize - oldSize);
        saveState();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            id: Math.floor(Math.random() * 10000),
            uid: parent.children[fileName].uuid,
            uuid: parent.children[fileName].uuid,
            name: fileName,
            path: normalizedPath,
            is_dir: false,
            size: fileSize,
            created: new Date(parent.children[fileName].created).toISOString(),
            modified: new Date(parent.children[fileName].modified).toISOString(),
            type: parent.children[fileName].mimeType,
        }));
    }
    
    // /mkdir - Create directory (Puter format)
    if (path === '/mkdir' && method === 'POST') {
        const dirPath = data.path;
        if (!dirPath) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: 'path is required' }));
        }
        
        const normalizedPath = dirPath.startsWith('/') ? dirPath : '/' + dirPath;
        console.log(`\n📁 MKDIR (Puter): ${normalizedPath}`);
        
        // Create the directory and all parents
        ensureDir(nodeState.filesystem, normalizedPath);
        saveState();
        
        const node = getNode(nodeState.filesystem, normalizedPath);
        const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '/';
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            id: Math.floor(Math.random() * 10000),
            uid: `uuid-${normalizedPath.replace(/\//g, '-')}`,
            uuid: `uuid-${normalizedPath.replace(/\//g, '-')}`,
            name: normalizedPath.split('/').pop(),
            path: normalizedPath,
            is_dir: true,
            is_empty: true,
            size: 0,
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
        }));
    }
    
    // /delete - Delete file/folder (Puter format)
    if (path === '/delete' && method === 'POST') {
        const paths = data.paths;
        if (!paths || !Array.isArray(paths)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'paths must be an array' }));
        }
        
        // Get session to find user's Trash directory
        const authHeader = req.headers['authorization'];
        let trashPath = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const session = nodeState.sessions.get(token);
            if (session && session.wallet) {
                ensureUserHomeDirectory(session.wallet);
                trashPath = `/${session.wallet}/Trash`;
            }
        }
        
        console.log(`\n🗑️  DELETE (Puter): ${paths.join(', ')}`);
        
        for (const targetPath of paths) {
            if (!targetPath || targetPath === '/') continue;
            
            // Don't delete if already in Trash (permanent delete)
            if (targetPath.includes('/Trash/')) {
                const normalizedPath = targetPath.startsWith('/') ? targetPath : '/' + targetPath;
                const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '/';
                const name = normalizedPath.split('/').pop();
                const parent = getNode(nodeState.filesystem, parentPath);
                
                if (parent && parent.children && parent.children[name]) {
                    const deletedNode = parent.children[name];
                    const sizeToRemove = calculateSize(deletedNode);
                    nodeState.storageUsed -= sizeToRemove;
                    
                    // Emit socket event for permanent delete from Trash
                    // Match Puter's format: { path, descendants_only }
                    if (authHeader && authHeader.startsWith('Bearer ')) {
                        const token = authHeader.split(' ')[1];
                        const session = nodeState.sessions.get(token);
                        if (session) {
                            emitSocketEvent('item.removed', {
                                path: normalizedPath,
                                descendants_only: false
                            }, session.wallet);
                        }
                    }
                    
                    delete parent.children[name];
                }
                continue;
            }
            
            // Move to Trash (if Trash exists)
            if (trashPath) {
                const normalizedPath = targetPath.startsWith('/') ? targetPath : '/' + targetPath;
                const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '/';
                const name = normalizedPath.split('/').pop();
                const sourceParent = getNode(nodeState.filesystem, parentPath);
                
                if (sourceParent && sourceParent.children && sourceParent.children[name]) {
                    const trashNode = getNode(nodeState.filesystem, trashPath);
                    if (trashNode && trashNode.type === 'dir') {
                        // Move file to Trash with unique name (using UUID to avoid conflicts)
                        const sourceNode = sourceParent.children[name];
                        const uniqueName = `${sourceNode.uuid || name}_${Date.now()}`;
                        
                        trashNode.children[uniqueName] = {
                            ...sourceNode,
                            name: uniqueName,
                            // Store original metadata
                            original_name: name,
                            original_path: normalizedPath,
                            trashed_ts: Math.round(Date.now() / 1000),
                        };
                        
                        delete sourceParent.children[name];
                        console.log(`   ✅ Moved to Trash: ${name} → ${uniqueName}`);
                        
                        // Emit socket events for real-time updates
                        // Match Puter's format: item.removed = { path, descendants_only }
                        const session = nodeState.sessions.get(token);
                        if (session) {
                            const trashItemPath = `${trashPath}/${uniqueName}`;
                            emitSocketEvent('item.removed', {
                                path: normalizedPath,
                                descendants_only: false
                            }, session.wallet);
                            // item.added should include full file entry (like Puter's node.getSafeEntry())
                            emitSocketEvent('item.added', {
                                path: trashItemPath,
                                uid: sourceNode.uuid,
                                uuid: sourceNode.uuid,
                                name: uniqueName,
                                is_dir: sourceNode.type === 'dir',
                                dirpath: trashPath, // Parent directory path (required by frontend)
                                original_client_socket_id: null
                            }, session.wallet);
                        }
                    } else {
                        // Trash doesn't exist, permanent delete
                        const sizeToRemove = calculateSize(sourceParent.children[name]);
                        nodeState.storageUsed -= sizeToRemove;
                        delete sourceParent.children[name];
                    }
                }
            } else {
                // No session, permanent delete
                const normalizedPath = targetPath.startsWith('/') ? targetPath : '/' + targetPath;
                const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '/';
                const name = normalizedPath.split('/').pop();
                const parent = getNode(nodeState.filesystem, parentPath);
                
                if (parent && parent.children && parent.children[name]) {
                    const sizeToRemove = calculateSize(parent.children[name]);
                    nodeState.storageUsed -= sizeToRemove;
                    delete parent.children[name];
                }
            }
        }
        
        saveState();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({}));
    }
    
    // /move - Move file/folder (Puter format)
    if (path === '/move' && method === 'POST') {
        const { source, dest, new_name } = data;
        
        if (!source) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'source is required' }));
        }
        
        const srcPath = source.startsWith('/') ? source : '/' + source;
        let destPath = dest ? (dest.startsWith('/') ? dest : '/' + dest) : srcPath.substring(0, srcPath.lastIndexOf('/')) || '/';
        
        console.log(`\n🔄 MOVE (Puter): ${srcPath} → ${destPath}${new_name ? '/' + new_name : ''}`);
        
        // Get source node
        const srcParentPath = srcPath.substring(0, srcPath.lastIndexOf('/')) || '/';
        const srcName = srcPath.split('/').pop();
        const srcParent = getNode(nodeState.filesystem, srcParentPath);
        
        if (!srcParent || !srcParent.children[srcName]) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Source not found' }));
        }
        
        // Ensure destination parent exists
        ensureDir(nodeState.filesystem, destPath);
        const destParent = getNode(nodeState.filesystem, destPath);
        
        // Move the node
        const finalName = new_name || srcName;
        destParent.children[finalName] = {
            ...srcParent.children[srcName],
            name: finalName,
            modified: Date.now()
        };
        delete srcParent.children[srcName];
        
        saveState();
        
        const finalPath = destPath === '/' ? `/${finalName}` : `${destPath}/${finalName}`;
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            id: Math.floor(Math.random() * 10000),
            uid: `uuid-${finalPath.replace(/\//g, '-')}`,
            name: finalName,
            path: finalPath,
            is_dir: destParent.children[finalName].type === 'dir',
        }));
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // ADDITIONAL PUTER API ENDPOINTS (required for full desktop functionality)
    // ═══════════════════════════════════════════════════════════════════
    
    // /socket.io - WebSocket endpoint (handled earlier in request flow, but keep as fallback)
    // This should not be reached if socket.io is handled in req.on('end')
    if (path.includes('socket.io')) {
        // This is a fallback - socket.io should be handled in req.on('end') before body parsing
        res.writeHead(200, { 
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': 'true'
        });
        return res.end('1:');
    }
    
    // Legacy socket.io handler (should not be reached)
    if (false && path.includes('socket.io')) {
        // Parse query params
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const transport = url.searchParams.get('transport') || 'polling';
        const eio = url.searchParams.get('EIO') || '4';
        const sid = url.searchParams.get('sid');
        
        // If we have a session ID, this is a polling request - return events or empty
        if (sid && transport === 'polling') {
            // Get session wallet from Authorization header
            const authHeader = req.headers['authorization'];
            let wallet = null;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                const session = nodeState.sessions.get(token);
                if (session) {
                    wallet = session.wallet;
                    // Update or create socket session
                    if (!nodeState.socketSessions.has(sid)) {
                        nodeState.socketSessions.set(sid, { wallet, lastPoll: Date.now() });
                    } else {
                        nodeState.socketSessions.get(sid).lastPoll = Date.now();
                    }
                }
            }
            
            // Get events for this wallet (room-based filtering, like Puter)
            // In Puter, sockets join rooms by user.id. In PC2, we use wallet address as the room
            const events = nodeState.pendingEvents.filter(evt => {
                // Send events to matching wallet (room) or broadcast events (wallet === null means broadcast)
                // This matches Puter's pattern: svc_socketio.send({ room: user.id }, 'item.removed', data)
                return !evt.wallet || evt.wallet === wallet || wallet === null;
            });
            
            // Clear sent events (prevent duplicate delivery)
            if (events.length > 0) {
                nodeState.pendingEvents = nodeState.pendingEvents.filter(evt => !events.includes(evt));
            }
            
            // Format events as socket.io Engine.IO packets
            // Socket.io polling format: packetCount + packets
            // Each packet format: packetType + data
            // Type 42 = EVENT with namespace (default namespace)
            // Format: 42["eventName", {...data}]
            let response = '';
            if (events.length > 0) {
                const packets = events.map(evt => {
                    // Match Puter's event format exactly
                    // Puter sends: svc_socketio.send({ room: user.id }, 'item.removed', data)
                    // This becomes: 42["item.removed", data] in socket.io polling
                    return `42["${evt.event}",${JSON.stringify(evt.data)}]`;
                }).join('');
                response = `${events.length}:${packets}`;
            } else {
                // Empty polling response: "1:" (1 packet, empty content)
                // This tells socket.io client there are no new events
                response = '1:';
            }
            
            res.writeHead(200, { 
                'Content-Type': 'text/plain',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
                'Cache-Control': 'no-cache'
            });
            return res.end(response);
        }
        
        // Initial handshake - return socket.io handshake
        // Format: 0{"sid":"...","upgrades":[],"pingInterval":25000,"pingTimeout":5000}
        const newSid = `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const handshake = {
            sid: newSid,
            upgrades: [], // No websocket upgrade available
            pingInterval: 25000,
            pingTimeout: 5000
        };
        
        // Socket.io Engine.IO protocol format: packet type (0 = open) + JSON
        const response = `0${JSON.stringify(handshake)}`;
        
        res.writeHead(200, { 
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': 'true',
            'Set-Cookie': `io=${newSid}; Path=/; HttpOnly`
        });
        return res.end(response);
    }
    
    // /suggest_apps - Suggest apps for a file (fallback when open_item fails)
    if (path === '/suggest_apps' && method === 'POST') {
        let targetNode = null;
        let normalizedPath = null;
        let fileUid = data.uid;
        let filePath = data.path;
        
        console.log(`\n💡 SUGGEST APPS: uid=${fileUid || 'none'}, path=${filePath || 'none'}`);
        
        // Find file by UID or path (same logic as /open_item)
        if (fileUid) {
            const findNodeByUid = (node, path = '/') => {
                // Check exact match
                if (node.uuid === fileUid) {
                    targetNode = node;
                    normalizedPath = path;
                    return true;
                }
                // Also check if UUID matches when normalized (handle double dashes and case differences)
                const normalizedUid = fileUid.replace(/^uuid-+/, 'uuid-').toLowerCase(); // Remove extra dashes, lowercase
                if (node.uuid && node.uuid.replace(/^uuid-+/, 'uuid-').toLowerCase() === normalizedUid) {
                    targetNode = node;
                    normalizedPath = path;
                    return true;
                }
                if (node.children) {
                    for (const [name, child] of Object.entries(node.children)) {
                        if (findNodeByUid(child, path === '/' ? `/${name}` : `${path}/${name}`)) {
                            return true;
                        }
                    }
                }
                return false;
            };
            findNodeByUid(nodeState.filesystem);
        }
        
        if (!targetNode && filePath) {
            const authHeader = req.headers['authorization'];
            if (filePath.startsWith('~') && authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                const session = nodeState.sessions.get(token);
                if (session && session.wallet) {
                    filePath = filePath.replace('~', `/${session.wallet}`);
                }
            }
            normalizedPath = filePath.startsWith('/') ? filePath : '/' + filePath;
            
            // Try case-sensitive first
            targetNode = getNode(nodeState.filesystem, normalizedPath);
            
            // If not found, try case-insensitive lookup
            if (!targetNode) {
                const parts = normalizedPath.split('/').filter(Boolean);
                let current = nodeState.filesystem['/'];
                let actualPath = '/';
                
                for (const part of parts) {
                    if (!current || current.type !== 'dir' || !current.children) {
                        break;
                    }
                    
                    // Try exact match first
                    if (current.children[part]) {
                        current = current.children[part];
                        actualPath += '/' + part;
                        continue;
                    }
                    
                    // Try case-insensitive match
                    const found = Object.keys(current.children).find(key => 
                        key.toLowerCase() === part.toLowerCase()
                    );
                    
                    if (found) {
                        current = current.children[found];
                        actualPath += '/' + found;
                    } else {
                        current = null;
                        break;
                    }
                }
                
                if (current) {
                    targetNode = current;
                    normalizedPath = actualPath;
                }
            }
        }
        
        if (!targetNode) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'File not found' }));
        }
        
        // Determine app based on file type (same logic as /open_item)
        let appUid, appName, appIndexUrl;
        const fileName = targetNode.name || normalizedPath.split('/').pop() || '';
        const fsname = fileName.toLowerCase();
        
        if (fsname.endsWith('.jpg') || fsname.endsWith('.png') || fsname.endsWith('.webp') || 
            fsname.endsWith('.svg') || fsname.endsWith('.bmp') || fsname.endsWith('.jpeg')) {
            appUid = 'app-7870be61-8dff-4a99-af64-e9ae6811e367';
            appName = 'viewer';
            appIndexUrl = `http://viewer.localhost:${PORT}/index.html`;
        } else if (fsname.endsWith('.mp4') || fsname.endsWith('.webm') || fsname.endsWith('.mpg') || 
                   fsname.endsWith('.mpv') || fsname.endsWith('.mp3') || fsname.endsWith('.m4a') || 
                   fsname.endsWith('.ogg') || fsname.endsWith('.mov') || fsname.endsWith('.avi')) {
            appUid = 'app-11edfba2-1ed3-4e22-8573-47e88fb87d70';
            appName = 'player';
            appIndexUrl = `http://player.localhost:${PORT}/index.html`;
        } else if (fsname.endsWith('.pdf')) {
            appUid = 'app-3920851d-bda8-479b-9407-8517293c7d44';
            appName = 'pdf';
            appIndexUrl = `http://pdf.localhost:${PORT}/index.html`;
        } else {
            appUid = 'app-838dfbc4-bf8b-48c2-b47b-c4adc77fab58';
            appName = 'editor';
            appIndexUrl = `http://editor.localhost:${PORT}/index.html`;
        }
        
        // Return array of app objects (matching Puter's suggest_app_for_fsentry format)
        const app = {
            uid: appUid,
            uuid: appUid,
            name: appName,
            title: appName.charAt(0).toUpperCase() + appName.slice(1),
            index_url: appIndexUrl,
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify([app]));
    }
    
    // /itemMetadata - Get file metadata (Puter format)
    if (path === '/itemMetadata' && method === 'GET') {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const fileUid = url.searchParams.get('uid');
        
        console.log(`\n📋 ITEM METADATA: uid=${fileUid}`);
        
        // Find file by UID
        let targetNode = null;
        let targetPath = null;
        
        const findNodeByUid = (node, path = '/') => {
            if (node.uuid === fileUid) {
                targetNode = node;
                targetPath = path;
                return true;
            }
            if (node.children) {
                for (const [name, child] of Object.entries(node.children)) {
                    if (findNodeByUid(child, path === '/' ? `/${name}` : `${path}/${name}`)) {
                        return true;
                    }
                }
            }
            return false;
        };
        
        findNodeByUid(nodeState.filesystem);
        
        if (!targetNode) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'File not found' }));
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            uid: targetNode.uuid,
            name: targetNode.name,
            path: targetPath,
            is_dir: targetNode.type === 'dir',
            size: targetNode.size || 0,
            type: targetNode.mimeType || 'application/octet-stream',
            created: new Date(targetNode.created || Date.now()).toISOString(),
            modified: new Date(targetNode.modified || Date.now()).toISOString(),
            accessed: new Date(targetNode.accessed || Date.now()).toISOString(),
        }));
    }
    
    // /df - Disk free/space info
    if (path === '/df' && method === 'POST') {
        console.log(`\n💾 DF (disk space)`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            used: nodeState.storageUsed,
            capacity: nodeState.storageLimit,
            available: nodeState.storageLimit - nodeState.storageUsed,
        }));
    }
    
    // /batch - Multipart file upload endpoint
    if (path === '/batch' && method === 'POST') {
        console.log(`\n📤 BATCH UPLOAD`);
        console.log(`   Data keys:`, data ? Object.keys(data) : 'no data');
        console.log(`   Data types:`, data ? Object.entries(data).map(([k, v]) => `${k}: ${typeof v}`).join(', ') : 'no data');
        
        // Get session from Authorization header for home directory
        const authHeader = req.headers['authorization'];
        let walletAddress = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const session = nodeState.sessions.get(token);
            if (session) {
                walletAddress = session.wallet;
                ensureUserHomeDirectory(walletAddress);
            }
        }
        
        // If no data or empty data, return error
        if (!data || Object.keys(data).length === 0) {
            console.warn(`   ⚠️  No data in /batch request`);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'No data provided', message: 'Batch upload requires multipart form data' }));
        }
        
        // Parse operation field (can be JSON string or array of JSON strings)
        let operations = [];
        if (data.operation) {
            if (typeof data.operation === 'string') {
                try {
                    operations = JSON.parse(data.operation);
                    // If it's a single object, wrap in array
                    if (!Array.isArray(operations)) {
                        operations = [operations];
                    }
                } catch (e) {
                    console.warn('   ⚠️  Failed to parse operation:', e.message);
                }
            } else if (Array.isArray(data.operation)) {
                operations = data.operation.map(op => {
                    if (typeof op === 'string') {
                        try {
                            return JSON.parse(op);
                        } catch (e) {
                            return null;
                        }
                    }
                    return op;
                }).filter(Boolean);
            }
        }
        
        // Parse fileinfo if it's a JSON string
        let fileinfo = null;
        if (data.fileinfo && typeof data.fileinfo === 'string') {
            try {
                fileinfo = JSON.parse(data.fileinfo);
            } catch (e) {
                console.warn('   ⚠️  Failed to parse fileinfo:', e.message);
            }
        } else if (data.fileinfo && typeof data.fileinfo === 'object') {
            fileinfo = data.fileinfo;
        }
        
        // Determine target path from operation, fileinfo, or form data
        let targetPath = '/';
        if (operations.length > 0 && operations[0].path) {
            targetPath = operations[0].path;
        } else if (fileinfo && fileinfo.path) {
            targetPath = fileinfo.path;
        } else if (fileinfo && fileinfo.parent) {
            targetPath = fileinfo.parent;
        } else {
            targetPath = data.path || data.parent || data.dest || '/';
        }
        
        // Handle ~ home directory
        if (targetPath && typeof targetPath === 'string' && targetPath.startsWith('~') && walletAddress) {
            targetPath = targetPath.replace('~', `/${walletAddress}`);
        }
        if (!targetPath || !targetPath.startsWith('/')) {
            targetPath = walletAddress ? `/${walletAddress}/Desktop` : '/';
        }
        
        console.log(`\n📤 BATCH UPLOAD to: ${targetPath}`);
        console.log('   Form data keys:', Object.keys(data));
        if (fileinfo) {
            console.log('   Fileinfo:', JSON.stringify(fileinfo));
        }
        console.log('   Data types:', Object.entries(data).map(([k, v]) => `${k}: ${typeof v}${typeof v === 'object' && v ? ` (has filename: ${!!v.filename})` : ''}`).join(', '));
        
        // Process file uploads
        const results = [];
        let filesFound = 0;
        
        for (const [key, value] of Object.entries(data)) {
            // Check if this is a file upload (has filename property)
            if (value && typeof value === 'object' && value.filename) {
                filesFound++;
                // This is a file upload
                let fileName = value.filename;
                const fileContent = value.content || '';
                
                // Log content extraction for debugging
                if (!fileContent || (typeof fileContent === 'string' && fileContent.length === 0)) {
                    console.warn(`   ⚠️  WARNING: File content is empty for "${fileName}"!`);
                    console.warn(`   ⚠️  value keys: ${Object.keys(value).join(', ')}`);
                    console.warn(`   ⚠️  value.content type: ${typeof value.content}, length: ${value.content ? value.content.length : 0}`);
                } else {
                    console.log(`   ✅ File content extracted: ${fileName}, content length: ${typeof fileContent === 'string' ? fileContent.length : 'buffer'}, isBase64: ${value.isBase64 || false}`);
                }
                
                // Ensure parent directory exists
                ensureDir(nodeState.filesystem, targetPath);
                
                // Save the file
                const parentNode = getNode(nodeState.filesystem, targetPath);
                if (!parentNode) {
                    console.error(`   ❌ ERROR: Failed to create/get parent directory: ${targetPath}`);
                    continue;
                }
                console.log(`   ✅ Parent directory exists: ${targetPath}, has ${Object.keys(parentNode.children || {}).length} children`);
                if (parentNode) {
                    // Check if file already exists - if so, add number suffix like macOS
                    if (parentNode.children[fileName]) {
                        // Extract name and extension
                        const lastDot = fileName.lastIndexOf('.');
                        const hasExtension = lastDot > 0;
                        const baseName = hasExtension ? fileName.substring(0, lastDot) : fileName;
                        const extension = hasExtension ? fileName.substring(lastDot) : '';
                        
                        // Find the next available number
                        let counter = 1;
                        let newFileName;
                        do {
                            newFileName = `${baseName} (${counter})${extension}`;
                            counter++;
                        } while (parentNode.children[newFileName] && counter < 1000); // Safety limit
                        
                        console.log(`   📝 File "${fileName}" already exists, using: "${newFileName}"`);
                        fileName = newFileName;
                    }
                    
                    const filePath = targetPath === '/' ? `/${fileName}` : `${targetPath}/${fileName}`;
                    // Determine if this is a binary file
                    const mimeType = value.mimeType || 'application/octet-stream';
                    const isBinary = mimeType.startsWith('image/') || 
                                   mimeType.startsWith('video/') || 
                                   mimeType.startsWith('audio/') ||
                                   mimeType === 'application/octet-stream';
                    
                    // Check if content is already base64 (from multipart parser)
                    let storedContent = fileContent;
                    let isBase64 = value.isBase64 || false;
                    
                    if (isBinary && typeof fileContent === 'string' && !isBase64) {
                        // Try to detect if it's already base64
                        try {
                            Buffer.from(fileContent, 'base64');
                            // If decode succeeds, it's valid base64
                            isBase64 = true;
                            storedContent = fileContent;
                        } catch (e) {
                            // Not base64, convert to base64
                            const binaryBuffer = Buffer.from(fileContent, 'binary');
                            storedContent = binaryBuffer.toString('base64');
                            isBase64 = true;
                        }
                    }
                    
                    // Calculate file size from actual decoded content
                    let fileSize;
                    if (isBase64) {
                        try {
                            const decoded = Buffer.from(storedContent, 'base64');
                            fileSize = decoded.length;
                            console.log(`   📝 Saving file: ${fileName} (${fileSize} bytes, base64 stored: ${storedContent.length} chars) to ${filePath}`);
                        } catch (e) {
                            console.warn(`   ⚠️  Failed to decode base64, using string length: ${e.message}`);
                            fileSize = Buffer.byteLength(storedContent, 'utf8');
                        }
                    } else {
                        fileSize = Buffer.byteLength(storedContent, 'utf8');
                        console.log(`   📝 Saving file: ${fileName} (${fileSize} bytes) to ${filePath}`);
                    }
                    // File name is already adjusted if duplicate exists, so create new file
                    const oldSize = 0; // Always new file (no overwrite)
                    
                    // Verify content is not empty before saving
                    if (!storedContent || (typeof storedContent === 'string' && storedContent.length === 0)) {
                        console.warn(`   ⚠️  WARNING: File content is empty for ${fileName}!`);
                        console.warn(`   ⚠️  fileContent type: ${typeof fileContent}, length: ${fileContent ? fileContent.length : 0}`);
                        console.warn(`   ⚠️  storedContent type: ${typeof storedContent}, length: ${storedContent ? storedContent.length : 0}`);
                    }
                    
                    // Preserve existing timestamps if file already exists (for duplicate handling)
                    const existingFile = parentNode.children[fileName];
                    const now = Date.now();
                    
                    parentNode.children[fileName] = {
                        type: 'file',
                        name: fileName,
                        content: storedContent || '', // Ensure content is never undefined
                        isBase64: isBase64,
                        size: fileSize || 0, // Ensure size is never undefined
                        mimeType: mimeType,
                        created: existingFile?.created || now, // Preserve original creation time
                        modified: now, // Update modified time on upload
                        uuid: existingFile?.uuid || `uuid-${filePath.replace(/\//g, '-')}`,
                    };
                    
                    // Verify the node was created correctly
                    const savedNode = parentNode.children[fileName];
                    const actualContentLength = savedNode.content ? (typeof savedNode.content === 'string' ? savedNode.content.length : (savedNode.content.length || 0)) : 0;
                    console.log(`   ✅ File node created: name=${savedNode.name}, size=${savedNode.size}, contentLength=${actualContentLength}, isBase64=${savedNode.isBase64}`);
                    
                    // Double-check: if size doesn't match content, fix it
                    if (savedNode.size !== fileSize) {
                        console.warn(`   ⚠️  Size mismatch! Setting size from ${savedNode.size} to ${fileSize}`);
                        savedNode.size = fileSize;
                    }
                    
                    // Verify content is actually stored
                    if (!savedNode.content || (typeof savedNode.content === 'string' && savedNode.content.length === 0)) {
                        console.error(`   ❌ ERROR: Content is empty after saving! This should not happen.`);
                    }
                    
                    nodeState.storageUsed += (fileSize - oldSize);
                    
                    const fileEntry = {
                        id: Math.floor(Math.random() * 10000),
                        uid: parentNode.children[fileName].uuid,
                        uuid: parentNode.children[fileName].uuid,
                        name: fileName,
                        path: filePath,
                        is_dir: false,
                        is_empty: false,
                        size: fileSize,
                        created: new Date(parentNode.children[fileName].created).toISOString(),
                        modified: new Date(parentNode.children[fileName].modified).toISOString(),
                        type: parentNode.children[fileName].mimeType,
                    };
                    
                    results.push(fileEntry);
                    
                    // Emit socket event for real-time update
                    if (walletAddress) {
                        console.log(`   📡 Emitting item.added event for: ${fileName}, dirpath: ${targetPath}`);
                        emitSocketEvent('item.added', {
                            ...fileEntry,
                            dirpath: targetPath, // Parent directory path (required by frontend)
                            original_client_socket_id: null
                        }, walletAddress);
                    } else {
                        console.warn(`   ⚠️  No wallet address, skipping socket event for: ${fileName}`);
                    }
                } else {
                    console.error(`   ❌ Failed to get parent node for: ${targetPath}`);
                }
            }
        }
        
        if (filesFound === 0) {
            console.warn(`   ⚠️  No files found in upload! Data keys:`, Object.keys(data));
            console.warn(`   ⚠️  Data sample:`, JSON.stringify(Object.entries(data).slice(0, 2)));
            console.warn(`   ⚠️  Data values sample:`, Object.entries(data).slice(0, 2).map(([k, v]) => {
                if (v && typeof v === 'object') {
                    return `${k}: { type: ${v.constructor.name}, keys: ${Object.keys(v).join(', ')} }`;
                }
                return `${k}: ${typeof v}`;
            }).join(', '));
        }
        
        saveState();
        
        // Puter expects: { results: [...] } not just [...]
        // See upload.js:440 - it checks resp.results.length
        console.log(`   ✅ Upload complete: ${results.length} file(s) saved`);
        console.log(`   📤 Sending response with ${results.length} result(s)`);
        
        // Ensure we always return at least an empty results array
        if (results.length === 0) {
            console.warn(`   ⚠️  WARNING: No results to return, but sending empty array`);
        }
        
        const response = { results: results };
        console.log(`   📤 Response:`, JSON.stringify(response).substring(0, 200));
        
        if (res.headersSent) {
            console.error(`   ❌ ERROR: Headers already sent, cannot send response!`);
            return;
        }
        
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        return res.end(JSON.stringify(response));
    }
    
    // /cache/last-change-timestamp - Cache timestamp for Puter SDK
    if (path === '/cache/last-change-timestamp' && method === 'GET') {
        console.log(`\n⏰ CACHE TIMESTAMP: ${Date.now()}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ timestamp: Date.now() }));
    }
    
    // /get-launch-apps - List of installed apps
    if (path === '/get-launch-apps' && method === 'GET') {
        console.log(`\n📱 GET LAUNCH APPS`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        
        // Define all available apps with base64 icons (matching Puter's database)
        // Icons are stored as data URLs in the database
        const allApps = [
            {
                name: 'explorer',
                title: 'File Explorer',
                icon: 'data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDQ4IDQ4IiB3aWR0aD0iNDgiIGhlaWdodD0iNDgiPjx0aXRsZT5hcHAtaWNvbi1leHBsb3Jlci1zdmc8L3RpdGxlPjxwYXRoIGQ9Ik0xIDFMNDcgMUw0NyA0N0wxIDQ3TDEgMVoiIGZpbGw9IiM0YjU1NjMiLz48L3N2Zz4=',
                uuid: 'app-explorer',
                uid: 'app-explorer',
                index_url: null, // Built-in app
            },
            {
                name: 'viewer',
                title: 'Viewer',
                icon: 'data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjIiIGJhc2VQcm9maWxlPSJ0aW55LXBzIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCIgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4Ij4KCTx0aXRsZT5hcHAtaWNvbi12aWV3ZXItc3ZnPC90aXRsZT4KCTxkZWZzPgoJCTxsaW5lYXJHcmFkaWVudCBpZD0iZ3JkMSIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiICB4MT0iNDciIHkxPSIzOS41MTQiIHgyPSIxIiB5Mj0iOC40ODYiPgoJCQk8c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMwMzYzYWQiICAvPgoJCQk8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiM1Njg0ZjUiICAvPgoJCTwvbGluZWFyR3JhZGllbnQ+Cgk8L2RlZnM+Cgk8c3R5bGU+CgkJdHNwYW4geyB3aGl0ZS1zcGFjZTpwcmUgfQoJCS5zaHAwIHsgZmlsbDogdXJsKCNncmQxKSB9IAoJCS5zaHAxIHsgZmlsbDogI2ZmZDc2NCB9IAoJCS5zaHAyIHsgZmlsbDogI2NiZWFmYiB9IAoJPC9zdHlsZT4KCTxnIGlkPSJMYXllciI+CgkJPHBhdGggaWQ9IlNoYXBlIDEiIGNsYXNzPSJzaHAwIiBkPSJNMSAxTDQ3IDFMNDcgNDdMMSA0N0wxIDFaIiAvPgoJCTxwYXRoIGlkPSJMYXllciIgY2xhc3M9InNocDEiIGQ9Ik0xOCAxOEMxNS43OSAxOCAxNCAxNi4yMSAxNCAxNEMxNCAxMS43OSAxNS43OSAxMCAxOCAxMEMyMC4yMSAxMCAyMiAxMS43OSAyMiAxNEMyMiAxNi4yMSAyMC4yMSAxOCAxOCAxOFoiIC8+CgkJPHBhdGggaWQ9IkxheWVyIiBjbGFzcz0ic2hwMiIgZD0iTTM5Ljg2IDM2LjUxQzM5LjgyIDM2LjU4IDM5Ljc3IDM2LjY1IDM5LjcgMzYuNzFDMzkuNjQgMzYuNzcgMzkuNTcgMzYuODIgMzkuNSAzNi44N0MzOS40MiAzNi45MSAzOS4zNCAzNi45NCAzOS4yNiAzNi45N0MzOS4xNyAzNi45OSAzOS4wOSAzNyAzOSAzN0w5IDM3QzguODIgMzcgOC42NCAzNi45NSA4LjQ5IDM2Ljg2QzguMzMgMzYuNzYgOC4yIDM2LjYzIDguMTIgMzYuNDdDOC4wMyAzNi4zMSA3Ljk5IDM2LjEzIDggMzUuOTVDOC4wMSAzNS43NyA4LjA3IDM1LjYgOC4xNyAzNS40NEwxNC4xNyAyNi40NUMxNC4yNCAyNi4zNCAxNC4zMyAyNi4yNCAxNC40NCAyNi4xN0MxNC41NSAyNi4xIDE0LjY4IDI2LjA0IDE0LjggMjYuMDJDMTQuOTMgMjUuOTkgMTUuMDcgMjUuOTkgMTUuMTkgMjYuMDJDMTUuMzIgMjYuMDQgMTUuNDUgMjYuMSAxNS41NSAyNi4xN0MxNS41NyAyNi4xOCAxNS41OCAyNi4xOSAxNS42IDI2LjJDMTUuNjEgMjYuMjEgMTUuNjIgMjYuMjIgMTUuNjMgMjYuMjNDMTUuNjUgMjYuMjQgMTUuNjYgMjYuMjUgMTUuNjcgMjYuMjZDMTUuNjggMjYuMjcgMTUuNyAyNi4yOCAxNS43MSAyNi4yOUwyMC44NiAzMS40NUwyOS4xOCAxOS40M0MyOS4yMyAxOS4zNiAyOS4yOCAxOS4zIDI5LjM1IDE5LjI0QzI5LjQxIDE5LjE5IDI5LjQ4IDE5LjE0IDI5LjU2IDE5LjFDMjkuNjMgMTkuMDYgMjkuNzEgMTkuMDQgMjkuNzkgMTkuMDJDMjkuODggMTkgMjkuOTYgMTkgMzAuMDUgMTlDMzAuMTMgMTkgMzAuMjEgMTkuMDIgMzAuMjkgMTkuMDRDMzAuMzggMTkuMDcgMzAuNDUgMTkuMSAzMC41MiAxOS4xNUMzMC42IDE5LjE5IDMwLjY2IDE5LjI1IDMwLjcyIDE5LjMxQzMwLjc4IDE5LjM3IDMwLjgzIDE5LjQ0IDMwLjg3IDE5LjUxTDM5Ljg3IDM1LjUxQzM5LjkxIDM1LjU5IDM5Ljk1IDM1LjY3IDM5Ljk3IDM1Ljc1QzM5Ljk5IDM1Ljg0IDQwIDM1LjkyIDQwIDM2LjAxQzQwIDM2LjEgMzkuOTkgMzYuMTggMzkuOTYgMzYuMjdDMzkuOTQgMzYuMzUgMzkuOTEgMzYuNDMgMzkuODYgMzYuNTFaIiAvPgoJPC9nPgo8L3N2Zz4=',
                uuid: 'app-7870be61-8dff-4a99-af64-e9ae6811e367',
                uid: 'app-7870be61-8dff-4a99-af64-e9ae6811e367',
                index_url: `http://viewer.localhost:${PORT}/index.html`,
            },
            {
                name: 'player',
                title: 'Player',
                icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iaXNvLTg4NTktMSI/Pg0KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjAuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPg0KPHN2ZyB2ZXJzaW9uPSIxLjEiIGlkPSJMYXllcl8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCINCgkgdmlld0JveD0iMCAwIDUxMi4wMDEgNTEyLjAwMSIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgNTEyLjAwMSA1MTIuMDAxOyIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSI+DQo8cGF0aCBzdHlsZT0iZmlsbDojNTE1MDRFOyIgZD0iTTQ5MC42NjUsNDMuNTU3SDIxLjMzM0M5LjU1Miw0My41NTcsMCw1My4xMDgsMCw2NC44OXYzODIuMjJjMCwxMS43ODIsOS41NTIsMjEuMzM0LDIxLjMzMywyMS4zMzQNCgloNDY5LjMzMmMxMS43ODMsMCwyMS4zMzUtOS41NTIsMjEuMzM1LTIxLjMzNFY2NC44OUM1MTIsNTMuMTA4LDUwMi40NDgsNDMuNTU3LDQ5MC42NjUsNDMuNTU3eiBNOTkuMDMsNDI3LjA1MUg1Ni4yNjd2LTM4LjA2OQ0KCUg5OS4wM1Y0MjcuMDUxeiBNOTkuMDMsMTIzLjAxOUg1Ni4yNjd2LTM4LjA3SDk5LjAzVjEyMy4wMTl6IE0xODguMjA2LDQyNy4wNTFoLTQyLjc2M3YtMzguMDY5aDQyLjc2M1Y0MjcuMDUxeiBNMTg4LjIwNiwxMjMuMDE5DQoJaC00Mi43NjN2LTM4LjA3aDQyLjc2M1YxMjMuMDE5eiBNMjc3LjM4Miw0MjcuMDUxaC00Mi43NjR2LTM4LjA2OWg0Mi43NjRWNDI3LjA1MXogTTI3Ny4zODIsMTIzLjAxOWgtNDIuNzY0di0zOC4wN2g0Mi43NjRWMTIzLjAxOQ0KCXogTTM2Ni41NTcsNDI3LjA1MWgtNDIuNzYzdi0zOC4wNjloNDIuNzYzVjQyNy4wNTF6IE0zNjYuNTU3LDEyMy4wMTloLTQyLjc2M3YtMzguMDdoNDIuNzYzVjEyMy4wMTl6IE00NTUuNzMzLDQyNy4wNTFINDEyLjk3DQoJdi0zOC4wNjloNDIuNzY0djM4LjA2OUg0NTUuNzMzeiBNNDU1LjczMywxMjMuMDE5SDQxMi45N3YtMzguMDdoNDIuNzY0djM4LjA3SDQ1NS43MzN6Ii8+DQo8cGF0aCBzdHlsZT0iZmlsbDojNkI2OTY4OyIgZD0iTTQ5MC42NjUsNDMuNTU3SDEzMy44MWMtMTYuMzQzLDM4Ljg3Ny0yNS4zODEsODEuNTgtMjUuMzgxLDEyNi4zOTYNCgljMCwxMzMuMTkyLDc5Ljc4MiwyNDcuNzM0LDE5NC4xNTUsMjk4LjQ5aDE4OC4wODJjMTEuNzgzLDAsMjEuMzM1LTkuNTUyLDIxLjMzNS0yMS4zMzRWNjQuODkNCglDNTEyLDUzLjEwOCw1MDIuNDQ4LDQzLjU1Nyw0OTAuNjY1LDQzLjU1N3ogTTE4OC4yMDYsMTIzLjAxOWgtNDIuNzYzdi0zOC4wN2g0Mi43NjNWMTIzLjAxOXogTTI3Ny4zODIsNDI3LjA1MWgtNDIuNzY0di0zOC4wNjkNCgloNDIuNzY0VjQyNy4wNTF6IE0yNzcuMzgyLDEyMy4wMTloLTQyLjc2NHYtMzguMDdoNDIuNzY0VjEyMy4wMTl6IE0zNjYuNTU3LDQyNy4wNTFoLTQyLjc2M3YtMzguMDY5aDQyLjc2M1Y0MjcuMDUxeg0KCSBNMzY2LjU1NywxMjMuMDE5aC00Mi43NjN2LTM4LjA3aDQyLjc2M1YxMjMuMDE5eiBNNDU1LjczMyw0MjcuMDUxSDQxMi45N3YtMzguMDY5aDQyLjc2NHYzOC4wNjlINDU1LjczM3ogTTQ1NS43MzMsMTIzLjAxOUg0MTIuOTcNCgl2LTM4LjA3aDQyLjc2NHYzOC4wN0g0NTUuNzMzeiIvPg0KPHBhdGggc3R5bGU9ImZpbGw6Izg4RENFNTsiIGQ9Ik0zMTguNjEyLDI0My42NTdsLTExMi44OC01Ni40NGMtOS4xOTEtNC41OTUtMTkuOTc0LDIuMTMtMTkuOTc0LDEyLjM0NlYzMTIuNDQNCgljMCwxMC4yNjcsMTAuODM3LDE2LjkyNywxOS45NzQsMTIuMzQ1bDExMi44OC01Ni40MzljNC42NzQtMi4zMzgsNy42MjgtNy4xMTcsNy42MjgtMTIuMzQ1DQoJQzMyNi4yNCwyNTAuNzc0LDMyMy4yODYsMjQ1Ljk5NSwzMTguNjEyLDI0My42NTd6Ii8+DQo8cGF0aCBzdHlsZT0iZmlsbDojNzRDNEM0OyIgZD0iTTIxMS41MTUsMTk5LjU2MmMwLTIuOTY4LDAuOTU3LTUuODAyLDIuNjUyLTguMTI4bC04LjQzNS00LjIxOA0KCWMtOS4xOTEtNC41OTUtMTkuOTc0LDIuMTMtMTkuOTc0LDEyLjM0NlYzMTIuNDRjMCwxMC4yNjcsMTAuODM3LDE2LjkyNywxOS45NzQsMTIuMzQ1bDguNDMzLTQuMjE3DQoJQzIxMC41MDgsMzE1LjU0NywyMTEuNTE1LDMyMS45NjksMjExLjUxNSwxOTkuNTYyeiIvPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPC9zdmc+DQo=',
                uuid: 'app-11edfba2-1ed3-4e22-8573-47e88fb87d70',
                uid: 'app-11edfba2-1ed3-4e22-8573-47e88fb87d70',
                index_url: `http://player.localhost:${PORT}/index.html`,
            },
            {
                name: 'pdf',
                title: 'PDF',
                icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iaXNvLTg4NTktMSI/Pg0KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE4LjAuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPg0KPCFET0NUWVBFIHN2ZyBQVUJMSUMgIi0vL1czQy8vRFREIFNWRyAxLjEvL0VOIiAiaHR0cDovL3d3dy53My5vcmcvR3JhcGhpY3MvU1ZHLzEuMS9EVEQvc3ZnMTEuZHRkIj4NCjxzdmcgdmVyc2lvbj0iMS4xIiBpZD0iQ2FwYV8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCINCgkgdmlld0JveD0iMCAwIDU2IDU2IiBzdHlsZT0iZW5hYmxlLWJhY2tncm91bmQ6bmV3IDAgMCA1NiA1NjsiIHhtbDpzcGFjZT0icHJlc2VydmUiPg0KPGc+DQoJPHBhdGggc3R5bGU9ImZpbGw6I0U5RTlFMDsiIGQ9Ik0zNi45ODUsMEg3Ljk2M0M3LjE1NSwwLDYuNSwwLjY1NSw2LjUsMS45MjZWNTVjMCwwLjM0NSwwLjY1NSwxLDEuNDYzLDFoNDAuMDc0DQoJCWMwLjgwOCwwLDEuNDYzLTAuNjU1LDEuNDYzLTFWMTIuOTc4YzAtMC42OTYtMC4wOTMtMC45Mi0wLjI1Ny0xLjA4NUwzNy42MDcsMC4yNTdDMzcuNDQyLDAuMDkzLDM3LjIxOCwwLDM2Ljk4NSwweiIvPg0KCTxwb2x5Z29uIHN0eWxlPSJmaWxsOiNEOUQ3Q0E7IiBwb2ludHM9IjM3LjUsMC4xNTEgMzcuNSwxMiA0OS4zNDksMTIgCSIvPg0KCTxwYXRoIHN0eWxlPSJmaWxsOiNDQzRCNEM7IiBkPSJNMTkuNTE0LDMzLjMyNEwxOS41MTQsMzMuMzI0Yy0wLjM0OCwwLTAuNjgyLTAuMTEzLTAuOTY3LTAuMzI2DQoJCWMtMS4wNDEtMC43ODEtMS4xODEtMS42NS0xLjExNS0yLjI0MmMwLjE4Mi0xLjYyOCwyLjE5NS0zLjMzMiw1Ljk4NS01LjA2OGMxLjUwNC0zLjI5NiwyLjkzNS03LjM1NywzLjc4OC0xMC43NQ0KCQljLTAuOTk4LTIuMTcyLTEuOTY4LTQuOTktMS4yNjEtNi42NDNjMC4yNDgtMC41NzksMC41NTctMS4wMjMsMS4xMzQtMS4yMTVjMC4yMjgtMC4wNzYsMC44MDQtMC4xNzIsMS4wMTYtMC4xNzINCgkJYzAuNTA0LDAsMC45NDcsMC42NDksMS4yNjEsMS4wNDljMC4yOTUsMC4zNzYsMC45NjQsMS4xNzMtMC4zNzMsNi44MDJjMS4zNDgsMi43ODQsMy4yNTgsNS42Miw1LjA4OCw3LjU2Mg0KCQljMS4zMTEtMC4yMzcsMi40MzktMC4zNTgsMy4zNTgtMC4zNThjMS41NjYsMCwyLjUxNSwwLjM2NSwyLjkwMiwxLjExN2MwLjMyLDAuNjIyLDAuMTg5LDEuMzQ5LTAuMzksMi4xNg0KCQljLTAuNTU3LDAuNzc5LTEuMzI1LDEuMTkxLTIuMjIsMS4xOTFjLTEuMjE2LDAtMi42MzItMC43NjgtNC4yMTEtMi4yODVjLTIuODM3LDAuNTkzLTYuMTUsMS42NTEtOC44MjgsMi44MjINCgkJYy0wLjgzNiwxLjc3NC0xLjYzNywzLjIwMy0yLjM4Myw0LjI1MUMyMS4yNzMsMzIuNjU0LDIwLjM4OSwzMy4zMjQsMTkuNTE0LDMzLjMyNHogTTIyLjE3NiwyOC4xOTgNCgkJYy0yLjEzNywxLjIwMS0zLjAwOCwyLjE4OC0zLjA3MSwyLjc0NGMtMC4wMSwwLjA5Mi0wLjAzNywwLjMzNCwwLjQzMSwwLjY5MkMxOS42ODUsMzEuNTg3LDIwLjU1NSwzMS4xOSwyMi4xNzYsMjguMTk4eg0KCQkgTTM1LjgxMywyMy43NTZjMC44MTUsMC42MjcsMS4wMTQsMC45NDQsMS41NDcsMC45NDRjMC4yMzQsMCwwLjkwMS0wLjAxLDEuMjEtMC40NDFjMC4xNDktMC4yMDksMC4yMDctMC4zNDMsMC4yMy0wLjQxNQ0KCQljLTAuMTIzLTAuMDY1LTAuMjg2LTAuMTk3LTEuMTc1LTAuMTk3QzM3LjEyLDIzLjY0OCwzNi40ODUsMjMuNjcsMzUuODEzLDIzLjc1NnogTTI4LjM0MywxNy4xNzQNCgkJYy0wLjcxNSwyLjQ3NC0xLjY1OSw1LjE0NS0yLjY3NCw3LjU2NGMyLjA5LTAuODExLDQuMzYyLTEuNTE5LDYuNDk2LTIuMDJDMzAuODE1LDIxLjE1LDI5LjQ2NiwxOS4xOTIsMjguMzQzLDE3LjE3NHoNCgkJIE0yNy43MzYsOC43MTJjLTAuMDk4LDAuMDMzLTEuMzMsMS43NTcsMC4wOTYsMy4yMTZDMjguNzgxLDkuODEzLDI3Ljc3OSw4LjY5OCwyNy43MzYsOC43MTJ6Ii8+DQoJPHBhdGggc3R5bGU9ImZpbGw6I0NDNEI0QzsiIGQ9Ik00OC4wMzcsNTZINy45NjNDNy4xNTUsNTYsNi41LDU1LjM0NSw2LjUsNTQuNTM3VjM5aDQzdjE1LjUzN0M0OS41LDU1LjM0NSw0OC44NDUsNTYsNDguMDM3LDU2eiIvPg0KCTxnPg0KCQk8cGF0aCBzdHlsZT0iZmlsbDojRkZGRkZGOyIgZD0iTTE3LjM4NSw1M2gtMS42NDFWNDIuOTI0aDIuODk4YzAuNDI4LDAsMC44NTIsMC4wNjgsMS4yNzEsMC4yMDUNCgkJCWMwLjQxOSwwLjEzNywwLjc5NSwwLjM0MiwxLjEyOCwwLjYxNWMwLjMzMywwLjI3MywwLjYwMiwwLjYwNCwwLjgwNywwLjk5MXMwLjMwOCwwLjgyMiwwLjMwOCwxLjMwNg0KCQkJYzAsMC41MTEtMC4wODcsMC45NzMtMC4yNiwxLjM4OGMtMC4xNzMsMC40MTUtMC40MTUsMC43NjQtMC43MjUsMS4wNDZjLTAuMzEsMC4yODItMC42ODQsMC41MDEtMS4xMjEsMC42NTYNCgkJCXMtMC45MjEsMC4yMzItMS40NDksMC4yMzJoLTEuMjE3VjUzeiBNMTcuMzg1LDQ0LjE2OHYzLjk5MmgxLjUwNGMwLjIsMCwwLjM5OC0wLjAzNCwwLjU5NS0wLjEwMw0KCQkJYzAuMTk2LTAuMDY4LDAuMzc2LTAuMTgsMC41NC0wLjMzNWMwLjE2NC0wLjE1NSwwLjI5Ni0wLjM3MSwwLjM5Ni0wLjY0OWMwLjEtMC4yNzgsMC4xNS0wLjYyMiwwLjE1LTEuMDMyDQoJCQljMC0wLjE2NC0wLjAyMy0wLjM1NC0wLjA2OC0wLjU2N2MtMC4wNDYtMC4yMTQtMC4xMzktMC40MTktMC4yOC0wLjYxNWMtMC4xNDItMC4xOTYtMC4zNC0wLjM2LTAuNTk1LTAuNDkyDQoJCQljLTAuMjU1LTAuMTMyLTAuNTkzLTAuMTk4LTEuMDEyLTAuMTk4SDE3LjM4NXoiLz4NCgkJPHBhdGggc3R5bGU9ImZpbGw6I0ZGRkZGRjsiIGQ9Ik0zMi4yMTksNDcuNjgyYzAsMC44MjktMC4wODksMS41MzgtMC4yNjcsMi4xMjZzLTAuNDAzLDEuMDgtMC42NzcsMS40NzdzLTAuNTgxLDAuNzA5LTAuOTIzLDAuOTM3DQoJCQlzLTAuNjcyLDAuMzk4LTAuOTkxLDAuNTEzYy0wLjMxOSwwLjExNC0wLjYxMSwwLjE4Ny0wLjg3NSwwLjIxOUMyOC4yMjIsNTIuOTg0LDI4LjAyNiw1MywyNy44OTgsNTNoLTMuODE0VjQyLjkyNGgzLjAzNQ0KCQkJYzAuODQ4LDAsMS41OTMsMC4xMzUsMi4yMzUsMC40MDNzMS4xNzYsMC42MjcsMS42LDEuMDczczAuNzQsMC45NTUsMC45NSwxLjUyNEMzMi4xMTQsNDYuNDk0LDMyLjIxOSw0Ny4wOCwzMi4yMTksNDcuNjgyeg0KCQkJIE0yNy4zNTIsNTEuNzk3YzEuMTEyLDAsMS45MTQtMC4zNTUsMi40MDYtMS4wNjZzMC43MzgtMS43NDEsMC43MzgtMy4wOWMwLTAuNDE5LTAuMDUtMC44MzQtMC4xNS0xLjI0NA0KCQkJYy0wLjEwMS0wLjQxLTAuMjk0LTAuNzgxLTAuNTgxLTEuMTE0cy0wLjY3Ny0wLjYwMi0xLjE2OS0wLjgwN3MtMS4xMy0wLjMwOC0xLjkxNC0wLjMwOGgtMC45NTd2Ny42MjlIMjcuMzUyeiIvPg0KCQk8cGF0aCBzdHlsZT0iZmlsbDojRkZGRkZGOyIgZD0iTTM2LjI2Niw0NC4xNjh2My4xNzJoNC4yMTF2MS4xMjFoLTQuMjExVjUzaC0xLjY2OFY0Mi45MjRINDAuOXYxLjI0NEgzNi4yNjZ6Ii8+DQoJPC9nPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPC9zdmc+DQo=',
                uuid: 'app-3920851d-bda8-479b-9407-8517293c7d44',
                uid: 'app-3920851d-bda8-479b-9407-8517293c7d44',
                index_url: `http://pdf.localhost:${PORT}/index.html`,
            },
            {
                name: 'editor',
                title: 'Editor',
                icon: 'data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjIiIGJhc2VQcm9maWxlPSJ0aW55LXBzIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCIgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4Ij4KCTx0aXRsZT5hcHAtaWNvbi1lZGl0b3Itc3ZnPC90aXRsZT4KCTxkZWZzPgoJCTxsaW5lYXJHcmFkaWVudCBpZD0iZ3JkMSIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiICB4MT0iNDciIHkxPSIzOS41MTQiIHgyPSIxIiB5Mj0iOC40ODYiPgoJCQk8c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiM3MTAxZTgiICAvPgoJCQk8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiM5MTY3YmUiICAvPgoJCTwvbGluZWFyR3JhZGllbnQ+Cgk8L2RlZnM+Cgk8c3R5bGU+CgkJdHNwYW4geyB3aGl0ZS1zcGFjZTpwcmUgfQoJCS5zaHAwIHsgZmlsbDogdXJsKCNncmQxKSB9IAoJCS5zaHAxIHsgZmlsbDogI2ZmZmZmZiB9IAoJPC9zdHlsZT4KCTxnIGlkPSJMYXllciI+CgkJPHBhdGggaWQ9IkxheWVyIiBjbGFzcz0ic2hwMCIgZD0iTTQ3IDNMNDcgNDVDNDcgNDYuMSA0Ni4xIDQ3IDQ1IDQ3TDMgNDdDMS45IDQ3IDEgNDYuMSAxIDQ1TDEgM0MxIDEuOSAxLjkgMSAzIDFMNDUgMUM0Ni4xIDEgNDcgMS45IDQ3IDNaIiAvPgoJCTxwYXRoIGlkPSJMYXllciIgZmlsbC1ydWxlPSJldmVub2RkIiBjbGFzcz0ic2hwMSIgZD0iTTI4LjYyIDQwTDI4LjYyIDM3LjYxTDMyLjI1IDM3LjIyTDI5Ljg2IDMwTDE3LjUzIDMwTDE1LjE4IDM3LjIyTDE4Ljc2IDM3LjYxTDE4Ljc2IDQwTDguNiA0MEw4LjYgMzcuNjZMMTAuNSAzNy4xN0MxMS4yMSAzNi45OSAxMS40MyAzNi44NiAxMS42IDM2LjMzTDIxLjMzIDhMMjYuNDUgOEwzNi4zNiAzNi4zOEMzNi41MyAzNi45MSAzNi44OCAzNi45OSAzNy40MiAzNy4xM0wzOS40IDM3LjYxTDM5LjQgNDBMMjguNjIgNDBaTTIzLjc2IDExLjQ1TDE4LjU0IDI3TDI4Ljg4IDI3TDIzLjc2IDExLjQ1WiIgLz4KCTwvZz4KPC9zdmc+',
                uuid: 'app-838dfbc4-bf8b-48c2-b47b-c4adc77fab58',
                uid: 'app-838dfbc4-bf8b-48c2-b47b-c4adc77fab58',
                index_url: `http://editor.localhost:${PORT}/index.html`,
            },
            {
                name: 'terminal',
                title: 'Terminal',
                icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPHN2ZyBzdHlsZT0iZmlsdGVyOiBkcm9wLXNoYWRvdyggMHB4IDFweCAxcHggcmdiYSgwLCAwLCAwLCAuNSkpOyIgaGVpZ2h0PSI0OCIgd2lkdGg9IjQ4IiB2aWV3Qm94PSIwIDAgNDggNDgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHRpdGxlPndpbmRvdyBjb2RlPC90aXRsZT4KICA8ZyBjbGFzcz0ibmMtaWNvbi13cmFwcGVyIiBzdHlsZT0iIiB0cmFuc2Zvcm09Im1hdHJpeCgwLjk5NzcyNiwgMCwgMCwgMS4xMDI3NDgsIC0wLjAwMjc5MSwgLTIuODA5NzIxKSI+CiAgICA8cGF0aCBkPSJNIDQ1LjA5OCA0NS4zNjIgTCAzLjAwNCA0NS4zNjIgQyAxLjg5NyA0NS4zNjIgMSA0NC40NTkgMSA0My4zNDUgTCAxIDUuMDE3IEMgMSAzLjkwMyAxLjg5NyAzIDMuMDA0IDMgTCA0NS4wOTggMyBDIDQ2LjIwNiAzIDQ3LjEwMyAzLjkwMyA0Ny4xMDMgNS4wMTcgTCA0Ny4xMDMgNDMuMzQ1IEMgNDcuMTAzIDQ0LjQ1OSA0Ni4yMDYgNDUuMzYyIDQ1LjA5OCA0NS4zNjIgWiIgc3R5bGU9ImZpbGwtcnVsZTogbm9uemVybzsgcGFpbnQtb3JkZXI6IGZpbGw7IiBmaWxsPSIjZTNlNWVjIi8+CiAgICA8cmVjdCB4PSIzLjAwNCIgeT0iMTAuMDYiIGZpbGw9IiMyZTM3NDQiIHdpZHRoPSI0Mi4wOTQiIGhlaWdodD0iMzMuMjg0IiBzdHlsZT0iIi8+CiAgICA8cGF0aCBmaWxsPSIjRkZGRkZGIiBkPSJNIDEwLjAyIDMxLjI0MSBDIDkuNzY0IDMxLjI0MSA5LjUwNyAzMS4xNDIgOS4zMTIgMzAuOTQ2IEMgOC45MiAzMC41NTEgOC45MiAyOS45MTQgOS4zMTIgMjkuNTIgTCAxMi42MTIgMjYuMTk4IEwgOS4zMTIgMjIuODc3IEMgOC45MiAyMi40ODIgOC45MiAyMS44NDUgOS4zMTIgMjEuNDUxIEMgOS43MDMgMjEuMDU2IDEwLjMzNyAyMS4wNTYgMTAuNzI5IDIxLjQ1MSBMIDE0LjczOCAyNS40ODUgQyAxNS4xMyAyNS44NzkgMTUuMTMgMjYuNTE3IDE0LjczOCAyNi45MTEgTCAxMC43MjkgMzAuOTQ2IEMgMTAuNTMzIDMxLjE0MiAxMC4yNzcgMzEuMjQxIDEwLjAyIDMxLjI0MSBaIiBzdHlsZT0iIi8+CiAgICA8cGF0aCBmaWxsPSIjRkZGRkZGIiBkPSJNIDI4LjA2IDMxLjI0MSBMIDIwLjA0MyAzMS4yNDEgQyAxOS40ODkgMzEuMjQxIDE5LjA0IDMwLjc4OSAxOS4wNCAzMC4yMzMgQyAxOS4wNCAyOS42NzYgMTkuNDg5IDI5LjIyNCAyMC4wNDMgMjkuMjI0IEwgMjguMDYgMjkuMjI0IEMgMjguNjE0IDI5LjIyNCAyOS4wNjMgMjkuNjc2IDI5LjA2MyAzMC4yMzMgQyAyOS4wNjMgMzAuNzg5IDI4LjYxNCAzMS4yNDEgMjguMDYgMzEuMjQxIFoiIHN0eWxlPSIiLz4KICA8L2c+Cjwvc3ZnPg==',
                uuid: 'app-3fea7529-266e-47d9-8776-31649cd06557',
                uid: 'app-3fea7529-266e-47d9-8776-31649cd06557',
                index_url: `http://terminal.localhost:${PORT}/index.html`,
            },
            {
                name: 'about',
                title: 'About',
                icon: 'data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDQ4IDQ4IiB3aWR0aD0iNDgiIGhlaWdodD0iNDgiPjx0aXRsZT5hcHAtaWNvbi1hYm91dC1zdmc8L3RpdGxlPjxwYXRoIGQ9Ik0xIDFMNDcgMUw0NyA0N0wxIDQ3TDEgMVoiIGZpbGw9IiM0YjU1NjMiLz48L3N2Zz4=',
                uuid: 'app-about',
                uid: 'app-about',
                index_url: null, // Built-in app
            }
        ];
        
        // Recommended apps (shown prominently in launcher)
        // Include all the core apps so they show up in the start menu
        const recommended = [
            allApps.find(a => a.name === 'viewer'),
            allApps.find(a => a.name === 'player'),
            allApps.find(a => a.name === 'pdf'),
            allApps.find(a => a.name === 'editor'),
            allApps.find(a => a.name === 'terminal'),
        ].filter(Boolean);
        
        // Return apps matching Puter's expected format
        return res.end(JSON.stringify({
            recent: [], // Empty recent apps for now (will be populated from app_opens table in production)
            recommended: recommended, // Apps shown in "Recommended" section
            all: allApps // All available apps
        }));
    }
    
    // /open_item - Get app to open a file/folder (matches Puter's format exactly)
    if (path === '/open_item' && method === 'POST') {
        let targetNode = null;
        let normalizedPath = null;
        let fileUid = data.uid;
        let filePath = data.path;
        
        console.log(`\n🔓 OPEN ITEM: uid=${fileUid || 'none'}, path=${filePath || 'none'}`);
        
        // First try to find by UID if provided
        if (fileUid) {
            const findNodeByUid = (node, path = '/') => {
                // Check exact match
                if (node.uuid === fileUid) {
                    targetNode = node;
                    normalizedPath = path;
                    return true;
                }
                // Also check if UUID matches when normalized (handle double dashes and case differences)
                const normalizedUid = fileUid.replace(/^uuid-+/, 'uuid-').toLowerCase(); // Remove extra dashes, lowercase
                if (node.uuid && node.uuid.replace(/^uuid-+/, 'uuid-').toLowerCase() === normalizedUid) {
                    targetNode = node;
                    normalizedPath = path;
                    return true;
                }
                if (node.children) {
                    for (const [name, child] of Object.entries(node.children)) {
                        if (findNodeByUid(child, path === '/' ? `/${name}` : `${path}/${name}`)) {
                            return true;
                        }
                    }
                }
                return false;
            };
            
            findNodeByUid(nodeState.filesystem);
        }
        
        // If not found by UID, try by path (case-insensitive)
        if (!targetNode && filePath) {
            // Handle ~ (home directory)
            const authHeader = req.headers['authorization'];
            if (filePath.startsWith('~') && authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                const session = nodeState.sessions.get(token);
                if (session && session.wallet) {
                    filePath = filePath.replace('~', `/${session.wallet}`);
                }
            }
            
            normalizedPath = filePath.startsWith('/') ? filePath : '/' + filePath;
            
            // Try case-sensitive first
            targetNode = getNode(nodeState.filesystem, normalizedPath);
            
            // If not found, try case-insensitive lookup
            if (!targetNode) {
                const parts = normalizedPath.split('/').filter(Boolean);
                let current = nodeState.filesystem['/'];
                let actualPath = '/';
                
                for (const part of parts) {
                    if (!current || current.type !== 'dir' || !current.children) {
                        break;
                    }
                    
                    // Try exact match first
                    if (current.children[part]) {
                        current = current.children[part];
                        actualPath += '/' + part;
                        continue;
                    }
                    
                    // Try case-insensitive match
                    const found = Object.keys(current.children).find(key => 
                        key.toLowerCase() === part.toLowerCase()
                    );
                    
                    if (found) {
                        current = current.children[found];
                        actualPath += '/' + found;
                    } else {
                        current = null;
                        break;
                    }
                }
                
                if (current) {
                    targetNode = current;
                    normalizedPath = actualPath;
                }
            }
        }
        
        if (!targetNode) {
            console.log(`   ❌ File not found: uid=${fileUid}, path=${filePath}`);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: { code: 'subject_does_not_exist', message: 'File not found' } }));
        }
        
        // Ensure normalizedPath is set
        if (!normalizedPath) {
            normalizedPath = '/'; // Fallback, but this shouldn't happen
        }
        
        console.log(`   ✅ Found file: ${normalizedPath}, uuid=${targetNode.uuid}`);
        
        // Determine app based on file type (matching Puter's suggest_app_for_fsentry logic)
        let appUid, appName, appIndexUrl;
        const fileName = targetNode.name || normalizedPath.split('/').pop() || '';
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const fsname = fileName.toLowerCase();
        
        // Image files -> viewer
        if (fsname.endsWith('.jpg') || fsname.endsWith('.png') || fsname.endsWith('.webp') || 
            fsname.endsWith('.svg') || fsname.endsWith('.bmp') || fsname.endsWith('.jpeg')) {
            appUid = 'app-7870be61-8dff-4a99-af64-e9ae6811e367';
            appName = 'viewer';
            appIndexUrl = `http://viewer.localhost:${PORT}/index.html`;
        }
        // Video/Audio files -> player
        else if (fsname.endsWith('.mp4') || fsname.endsWith('.webm') || fsname.endsWith('.mpg') || 
                 fsname.endsWith('.mpv') || fsname.endsWith('.mp3') || fsname.endsWith('.m4a') || 
                 fsname.endsWith('.ogg') || fsname.endsWith('.mov') || fsname.endsWith('.avi')) {
            appUid = 'app-11edfba2-1ed3-4e22-8573-47e88fb87d70';
            appName = 'player';
            appIndexUrl = `http://player.localhost:${PORT}/index.html`;
        }
        // PDF files -> pdf
        else if (fsname.endsWith('.pdf')) {
            appUid = 'app-3920851d-bda8-479b-9407-8517293c7d44';
            appName = 'pdf';
            appIndexUrl = `http://pdf.localhost:${PORT}/index.html`;
        }
        // Text files -> editor
        else {
            appUid = 'app-838dfbc4-bf8b-48c2-b47b-c4adc77fab58';
            appName = 'editor';
            appIndexUrl = `http://editor.localhost:${PORT}/index.html`;
        }
        
        // Generate file signature (matching Puter's sign_file format)
        const actualFileUid = targetNode.uuid || fileUid || `uuid-${normalizedPath.replace(/\//g, '-')}`;
        const baseUrl = `http://${req.headers.host || 'localhost:4200'}`;
        const expires = Math.ceil(Date.now() / 1000) + 9999999999999; // Far future
        // Simple signature (in real Puter, this uses SHA256 with secret)
        const signature = `sig-${actualFileUid}-${expires}`;
        
        // Ensure normalizedPath starts with / and baseUrl doesn't end with /
        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const cleanPath = normalizedPath.startsWith('/') ? normalizedPath : '/' + normalizedPath;
        
        const signatureObj = {
            uid: actualFileUid,
            expires: expires,
            signature: signature,
            url: `${cleanBaseUrl}/read?file=${encodeURIComponent(cleanPath)}`,
            read_url: `${cleanBaseUrl}/read?file=${encodeURIComponent(cleanPath)}`,
            write_url: `${cleanBaseUrl}/writeFile?uid=${actualFileUid}&expires=${expires}&signature=${signature}`,
            metadata_url: `${cleanBaseUrl}/itemMetadata?uid=${actualFileUid}&expires=${expires}&signature=${signature}`,
            fsentry_type: targetNode.mimeType || 'application/octet-stream',
            fsentry_is_dir: targetNode.type === 'dir',
            fsentry_name: fileName,
            fsentry_size: targetNode.size || 0,
            fsentry_accessed: targetNode.accessed || Date.now(),
            fsentry_modified: targetNode.modified || Date.now(),
            fsentry_created: targetNode.created || Date.now(),
            path: normalizedPath,
        };
        
        // Generate mock token (in real Puter, this is a user-app token)
        const token = `mock-token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Build app object (matching Puter's format)
        const app = {
            uid: appUid,
            uuid: appUid, // Both uid and uuid for compatibility
            name: appName,
            title: appName.charAt(0).toUpperCase() + appName.slice(1),
            index_url: appIndexUrl,
            approved_for_opening_items: true,
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            signature: signatureObj,
            token: token,
            suggested_apps: [app],
        }));
    }
    
    // /drivers/call - Driver calls (for app lookups)
    if (path === '/drivers/call' && method === 'POST') {
        console.log(`\n🔧 DRIVER CALL:`, JSON.stringify(data).substring(0, 200));
        
        // Handle puter-apps.read requests (for app lookups)
        if (data.interface === 'puter-apps' && data.method === 'read') {
            const appName = data.args?.id?.name;
            console.log(`   📱 Looking up app: ${appName}`);
            
            // Return app info based on name (with base64 icons matching /get-launch-apps)
            const apps = {
                'terminal': {
                    uid: 'app-3fea7529-266e-47d9-8776-31649cd06557',
                    uuid: 'app-3fea7529-266e-47d9-8776-31649cd06557',
                    name: 'terminal',
                    title: 'Terminal',
                    index_url: `http://terminal.localhost:${PORT}/index.html`,
                    icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPHN2ZyBzdHlsZT0iZmlsdGVyOiBkcm9wLXNoYWRvdyggMHB4IDFweCAxcHggcmdiYSgwLCAwLCAwLCAuNSkpOyIgaGVpZ2h0PSI0OCIgd2lkdGg9IjQ4IiB2aWV3Qm94PSIwIDAgNDggNDgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHRpdGxlPndpbmRvdyBjb2RlPC90aXRsZT4KICA8ZyBjbGFzcz0ibmMtaWNvbi13cmFwcGVyIiBzdHlsZT0iIiB0cmFuc2Zvcm09Im1hdHJpeCgwLjk5NzcyNiwgMCwgMCwgMS4xMDI3NDgsIC0wLjAwMjc5MSwgLTIuODA5NzIxKSI+CiAgICA8cGF0aCBkPSJNIDQ1LjA5OCA0NS4zNjIgTCAzLjAwNCA0NS4zNjIgQyAxLjg5NyA0NS4zNjIgMSA0NC40NTkgMSA0My4zNDUgTCAxIDUuMDE3IEMgMSAzLjkwMyAxLjg5NyAzIDMuMDA0IDMgTCA0NS4wOTggMyBDIDQ2LjIwNiAzIDQ3LjEwMyAzLjkwMyA0Ny4xMDMgNS4wMTcgTCA0Ny4xMDMgNDMuMzQ1IEMgNDcuMTAzIDQ0LjQ1OSA0Ni4yMDYgNDUuMzYyIDQ1LjA5OCA0NS4zNjIgWiIgc3R5bGU9ImZpbGwtcnVsZTogbm9uemVybzsgcGFpbnQtb3JkZXI6IGZpbGw7IiBmaWxsPSIjZTNlNWVjIi8+CiAgICA8cmVjdCB4PSIzLjAwNCIgeT0iMTAuMDYiIGZpbGw9IiMyZTM3NDQiIHdpZHRoPSI0Mi4wOTQiIGhlaWdodD0iMzMuMjg0IiBzdHlsZT0iIi8+CiAgICA8cGF0aCBmaWxsPSIjRkZGRkZGIiBkPSJNIDEwLjAyIDMxLjI0MSBDIDkuNzY0IDMxLjI0MSA5LjUwNyAzMS4xNDIgOS4zMTIgMzAuOTQ2IEMgOC45MiAzMC41NTEgOC45MiAyOS45MTQgOS4zMTIgMjkuNTIgTCAxMi42MTIgMjYuMTk4IEwgOS4zMTIgMjIuODc3IEMgOC45MiAyMi40ODIgOC45MiAyMS44NDUgOS4zMTIgMjEuNDUxIEMgOS43MDMgMjEuMDU2IDEwLjMzNyAyMS4wNTYgMTAuNzI5IDIxLjQ1MSBMIDE0LjczOCAyNS40ODUgQyAxNS4xMyAyNS44NzkgMTUuMTMgMjYuNTE3IDE0LjczOCAyNi45MTEgTCAxMC43MjkgMzAuOTQ2IEMgMTAuNTMzIDMxLjE0MiAxMC4yNzcgMzEuMjQxIDEwLjAyIDMxLjI0MSBaIiBzdHlsZT0iIi8+CiAgICA8cGF0aCBmaWxsPSIjRkZGRkZGIiBkPSJNIDI4LjA2IDMxLjI0MSBMIDIwLjA0MyAzMS4yNDEgQyAxOS40ODkgMzEuMjQxIDE5LjA0IDMwLjc4OSAxOS4wNCAzMC4yMzMgQyAxOS4wNCAyOS42NzYgMTkuNDg5IDI5LjIyNCAyMC4wNDMgMjkuMjI0IEwgMjguMDYgMjkuMjI0IEMgMjguNjE0IDI5LjIyNCAyOS4wNjMgMjkuNjc2IDI5LjA2MyAzMC4yMzMgQyAyOS4wNjMgMzAuNzg5IDI4LjYxNCAzMS4yNDEgMjguMDYgMzEuMjQxIFoiIHN0eWxlPSIiLz4KICA8L2c+Cjwvc3ZnPg==',
                },
                'editor': {
                    uid: 'app-838dfbc4-bf8b-48c2-b47b-c4adc77fab58',
                    uuid: 'app-838dfbc4-bf8b-48c2-b47b-c4adc77fab58',
                    name: 'editor',
                    title: 'Editor',
                    index_url: `http://editor.localhost:${PORT}/index.html`,
                    icon: 'data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjIiIGJhc2VQcm9maWxlPSJ0aW55LXBzIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCIgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4Ij4KCTx0aXRsZT5hcHAtaWNvbi1lZGl0b3Itc3ZnPC90aXRsZT4KCTxkZWZzPgoJCTxsaW5lYXJHcmFkaWVudCBpZD0iZ3JkMSIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiICB4MT0iNDciIHkxPSIzOS41MTQiIHgyPSIxIiB5Mj0iOC40ODYiPgoJCQk8c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiM3MTAxZTgiICAvPgoJCQk8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiM5MTY3YmUiICAvPgoJCTwvbGluZWFyR3JhZGllbnQ+Cgk8L2RlZnM+Cgk8c3R5bGU+CgkJdHNwYW4geyB3aGl0ZS1zcGFjZTpwcmUgfQoJCS5zaHAwIHsgZmlsbDogdXJsKCNncmQxKSB9IAoJCS5zaHAxIHsgZmlsbDogI2ZmZmZmZiB9IAoJPC9zdHlsZT4KCTxnIGlkPSJMYXllciI+CgkJPHBhdGggaWQ9IkxheWVyIiBjbGFzcz0ic2hwMCIgZD0iTTQ3IDNMNDcgNDVDNDcgNDYuMSA0Ni4xIDQ3IDQ1IDQ3TDMgNDdDMS45IDQ3IDEgNDYuMSAxIDQ1TDEgM0MxIDEuOSAxLjkgMSAzIDFMNDUgMUM0Ni4xIDEgNDcgMS45IDQ3IDNaIiAvPgoJCTxwYXRoIGlkPSJMYXllciIgZmlsbC1ydWxlPSJldmVub2RkIiBjbGFzcz0ic2hwMSIgZD0iTTI4LjYyIDQwTDI4LjYyIDM3LjYxTDMyLjI1IDM3LjIyTDI5Ljg2IDMwTDE3LjUzIDMwTDE1LjE4IDM3LjIyTDE4Ljc2IDM3LjYxTDE4Ljc2IDQwTDguNiA0MEw4LjYgMzcuNjZMMTAuNSAzNy4xN0MxMS4yMSAzNi45OSAxMS40MyAzNi44NiAxMS42IDM2LjMzTDIxLjMzIDhMMjYuNDUgOEwzNi4zNiAzNi4zOEMzNi41MyAzNi45MSAzNi44OCAzNi45OSAzNy40MiAzNy4xM0wzOS40IDM3LjYxTDM5LjQgNDBMMjguNjIgNDBaTTIzLjc2IDExLjQ1TDE4LjU0IDI3TDI4Ljg4IDI3TDIzLjc2IDExLjQ1WiIgLz4KCTwvZz4KPC9zdmc+',
                },
                'explorer': {
                    uid: 'app-explorer',
                    uuid: 'app-explorer',
                    name: 'explorer',
                    title: 'File Explorer',
                    index_url: null,
                    icon: 'data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDQ4IDQ4IiB3aWR0aD0iNDgiIGhlaWdodD0iNDgiPjx0aXRsZT5hcHAtaWNvbi1leHBsb3Jlci1zdmc8L3RpdGxlPjxwYXRoIGQ9Ik0xIDFMNDcgMUw0NyA0N0wxIDQ3TDEgMVoiIGZpbGw9IiM0YjU1NjMiLz48L3N2Zz4=',
                },
                'viewer': {
                    uid: 'app-7870be61-8dff-4a99-af64-e9ae6811e367',
                    uuid: 'app-7870be61-8dff-4a99-af64-e9ae6811e367',
                    name: 'viewer',
                    title: 'Viewer',
                    index_url: `http://viewer.localhost:${PORT}/index.html`,
                    icon: 'data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjIiIGJhc2VQcm9maWxlPSJ0aW55LXBzIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCIgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4Ij4KCTx0aXRsZT5hcHAtaWNvbi12aWV3ZXItc3ZnPC90aXRsZT4KCTxkZWZzPgoJCTxsaW5lYXJHcmFkaWVudCBpZD0iZ3JkMSIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiICB4MT0iNDciIHkxPSIzOS41MTQiIHgyPSIxIiB5Mj0iOC40ODYiPgoJCQk8c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMwMzYzYWQiICAvPgoJCQk8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiM1Njg0ZjUiICAvPgoJCTwvbGluZWFyR3JhZGllbnQ+Cgk8L2RlZnM+Cgk8c3R5bGU+CgkJdHNwYW4geyB3aGl0ZS1zcGFjZTpwcmUgfQoJCS5zaHAwIHsgZmlsbDogdXJsKCNncmQxKSB9IAoJCS5zaHAxIHsgZmlsbDogI2ZmZDc2NCB9IAoJCS5zaHAyIHsgZmlsbDogI2NiZWFmYiB9IAoJPC9zdHlsZT4KCTxnIGlkPSJMYXllciI+CgkJPHBhdGggaWQ9IlNoYXBlIDEiIGNsYXNzPSJzaHAwIiBkPSJNMSAxTDQ3IDFMNDcgNDdMMSA0N0wxIDFaIiAvPgoJCTxwYXRoIGlkPSJMYXllciIgY2xhc3M9InNocDEiIGQ9Ik0xOCAxOEMxNS43OSAxOCAxNCAxNi4yMSAxNCAxNEMxNCAxMS43OSAxNS43OSAxMCAxOCAxMEMyMC4yMSAxMCAyMiAxMS43OSAyMiAxNEMyMiAxNi4yMSAyMC4yMSAxOCAxOCAxOFoiIC8+CgkJPHBhdGggaWQ9IkxheWVyIiBjbGFzcz0ic2hwMiIgZD0iTTM5Ljg2IDM2LjUxQzM5LjgyIDM2LjU4IDM5Ljc3IDM2LjY1IDM5LjcgMzYuNzFDMzkuNjQgMzYuNzcgMzkuNTcgMzYuODIgMzkuNSAzNi44N0MzOS40MiAzNi45MSAzOS4zNCAzNi45NCAzOS4yNiAzNi45N0MzOS4xNyAzNi45OSAzOS4wOSAzNyAzOSAzN0w5IDM3QzguODIgMzcgOC42NCAzNi45NSA4LjQ5IDM2Ljg2QzguMzMgMzYuNzYgOC4yIDM2LjYzIDguMTIgMzYuNDdDOC4wMyAzNi4zMSA3Ljk5IDM2LjEzIDggMzUuOTVDOC4wMSAzNS43NyA4LjA3IDM1LjYgOC4xNyAzNS40NEwxNC4xNyAyNi40NUMxNC4yNCAyNi4zNCAxNC4zMyAyNi4yNCAxNC40NCAyNi4xN0MxNC41NSAyNi4xIDE0LjY4IDI2LjA0IDE0LjggMjYuMDJDMTQuOTMgMjUuOTkgMTUuMDcgMjUuOTkgMTUuMTkgMjYuMDJDMTUuMzIgMjYuMDQgMTUuNDUgMjYuMSAxNS41NSAyNi4xN0MxNS41NyAyNi4xOCAxNS41OCAyNi4xOSAxNS42IDI2LjJDMTUuNjEgMjYuMjEgMTUuNjIgMjYuMjIgMTUuNjMgMjYuMjNDMTUuNjUgMjYuMjQgMTUuNjYgMjYuMjUgMTUuNjcgMjYuMjZDMTUuNjggMjYuMjcgMTUuNyAyNi4yOCAxNS43MSAyNi4yOUwyMC44NiAzMS40NUwyOS4xOCAxOS40M0MyOS4yMyAxOS4zNiAyOS4yOCAxOS4zIDI5LjM1IDE5LjI0QzI5LjQxIDE5LjE5IDI5LjQ4IDE5LjE0IDI5LjU2IDE5LjFDMjkuNjMgMTkuMDYgMjkuNzEgMTkuMDQgMjkuNzkgMTkuMDJDMjkuODggMTkgMjkuOTYgMTkgMzAuMDUgMTlDMzAuMTMgMTkgMzAuMjEgMTkuMDIgMzAuMjkgMTkuMDRDMzAuMzggMTkuMDcgMzAuNDUgMTkuMSAzMC41MiAxOS4xNUMzMC42IDE5LjE5IDMwLjY2IDE5LjI1IDMwLjcyIDE5LjMxQzMwLjc4IDE5LjM3IDMwLjgzIDE5LjQ0IDMwLjg3IDE5LjUxTDM5Ljg3IDM1LjUxQzM5LjkxIDM1LjU5IDM5Ljk1IDM1LjY3IDM5Ljk3IDM1Ljc1QzM5Ljk5IDM1Ljg0IDQwIDM1LjkyIDQwIDM2LjAxQzQwIDM2LjEgMzkuOTkgMzYuMTggMzkuOTYgMzYuMjdDMzkuOTQgMzYuMzUgMzkuOTEgMzYuNDMgMzkuODYgMzYuNTFaIiAvPgoJPC9nPgo8L3N2Zz4=',
                },
                'player': {
                    uid: 'app-11edfba2-1ed3-4e22-8573-47e88fb87d70',
                    uuid: 'app-11edfba2-1ed3-4e22-8573-47e88fb87d70',
                    name: 'player',
                    title: 'Player',
                    index_url: `http://player.localhost:${PORT}/index.html`,
                    icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iaXNvLTg4NTktMSI/Pg0KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjAuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPg0KPHN2ZyB2ZXJzaW9uPSIxLjEiIGlkPSJMYXllcl8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCINCgkgdmlld0JveD0iMCAwIDUxMi4wMDEgNTEyLjAwMSIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgNTEyLjAwMSA1MTIuMDAxOyIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSI+DQo8cGF0aCBzdHlsZT0iZmlsbDojNTE1MDRFOyIgZD0iTTQ5MC42NjUsNDMuNTU3SDIxLjMzM0M5LjU1Miw0My41NTcsMCw1My4xMDgsMCw2NC44OXYzODIuMjJjMCwxMS43ODIsOS41NTIsMjEuMzM0LDIxLjMzMywyMS4zMzQNCgloNDY5LjMzMmMxMS43ODMsMCwyMS4zMzUtOS41NTIsMjEuMzM1LTIxLjMzNFY2NC44OUM1MTIsNTMuMTA4LDUwMi40NDgsNDMuNTU3LDQ5MC42NjUsNDMuNTU3eiBNOTkuMDMsNDI3LjA1MUg1Ni4yNjd2LTM4LjA2OQ0KCUg5OS4wM1Y0MjcuMDUxeiBNOTkuMDMsMTIzLjAxOUg1Ni4yNjd2LTM4LjA3SDk5LjAzVjEyMy4wMTl6IE0xODguMjA2LDQyNy4wNTFoLTQyLjc2M3YtMzguMDY5aDQyLjc2M1Y0MjcuMDUxeiBNMTg4LjIwNiwxMjMuMDE5DQoJaC00Mi43NjN2LTM4LjA3aDQyLjc2M1YxMjMuMDE5eiBNMjc3LjM4Miw0MjcuMDUxaC00Mi43NjR2LTM4LjA2OWg0Mi43NjRWNDI3LjA1MXogTTI3Ny4zODIsMTIzLjAxOWgtNDIuNzY0di0zOC4wN2g0Mi43NjRWMTIzLjAxOQ0KCXogTTM2Ni41NTcsNDI3LjA1MWgtNDIuNzYzdi0zOC4wNjloNDIuNzYzVjQyNy4wNTF6IE0zNjYuNTU3LDEyMy4wMTloLTQyLjc2M3YtMzguMDdoNDIuNzYzVjEyMy4wMTl6IE00NTUuNzMzLDQyNy4wNTFINDEyLjk3DQoJdi0zOC4wNjloNDIuNzY0djM4LjA2OUg0NTUuNzMzeiBNNDU1LjczMywxMjMuMDE5SDQxMi45N3YtMzguMDdoNDIuNzY0djM4LjA3SDQ1NS43MzN6Ii8+DQo8cGF0aCBzdHlsZT0iZmlsbDojNkI2OTY4OyIgZD0iTTQ5MC42NjUsNDMuNTU3SDEzMy44MWMtMTYuMzQzLDM4Ljg3Ny0yNS4zODEsODEuNTgtMjUuMzgxLDEyNi4zOTYNCgljMCwxMzMuMTkyLDc5Ljc4MiwyNDcuNzM0LDE5NC4xNTUsMjk4LjQ5aDE4OC4wODJjMTEuNzgzLDAsMjEuMzM1LTkuNTUyLDIxLjMzNS0yMS4zMzRWNjQuODkNCglDNTEyLDUzLjEwOCw1MDIuNDQ4LDQzLjU1Nyw0OTAuNjY1LDQzLjU1N3ogTTE4OC4yMDYsMTIzLjAxOWgtNDIuNzYzdi0zOC4wN2g0Mi43NjNWMTIzLjAxOXogTTI3Ny4zODIsNDI3LjA1MWgtNDIuNzY0di0zOC4wNjkNCgloNDIuNzY0VjQyNy4wNTF6IE0yNzcuMzgyLDEyMy4wMTloLTQyLjc2NHYtMzguMDdoNDIuNzY0VjEyMy4wMTl6IE0zNjYuNTU3LDQyNy4wNTFoLTQyLjc2M3YtMzguMDY5aDQyLjc2M1Y0MjcuMDUxeg0KCSBNMzY2LjU1NywxMjMuMDE5aC00Mi43NjN2LTM4LjA3aDQyLjc2M1YxMjMuMDE5eiBNNDU1LjczMyw0MjcuMDUxSDQxMi45N3YtMzguMDY5aDQyLjc2NHYzOC4wNjlINDU1LjczM3ogTTQ1NS43MzMsMTIzLjAxOUg0MTIuOTcNCgl2LTM4LjA3aDQyLjc2NHYzOC4wN0g0NTUuNzMzeiIvPg0KPHBhdGggc3R5bGU9ImZpbGw6Izg4RENFNTsiIGQ9Ik0zMTguNjEyLDI0My42NTdsLTExMi44OC01Ni40NGMtOS4xOTEtNC41OTUtMTkuOTc0LDIuMTMtMTkuOTc0LDEyLjM0NlYzMTIuNDQNCgljMCwxMC4yNjcsMTAuODM3LDE2LjkyNywxOS45NzQsMTIuMzQ1bDExMi44OC01Ni40MzljNC42NzQtMi4zMzgsNy42MjgtNy4xMTcsNy42MjgtMTIuMzQ1DQoJQzMyNi4yNCwyNTAuNzc0LDMyMy4yODYsMjQ1Ljk5NSwzMTguNjEyLDI0My42NTd6Ii8+DQo8cGF0aCBzdHlsZT0iZmlsbDojNzRDNEM0OyIgZD0iTTIxMS41MTUsMTk5LjU2MmMwLTIuOTY4LDAuOTU3LTUuODAyLDIuNjUyLTguMTI4bC04LjQzNS00LjIxOA0KCWMtOS4xOTEtNC41OTUtMTkuOTc0LDIuMTMtMTkuOTc0LDEyLjM0NlYzMTIuNDRjMCwxMC4yNjcsMTAuODM3LDE2LjkyNywxOS45NzQsMTIuMzQ1bDguNDMzLTQuMjE3DQoJQzIxMC41MDgsMzE1LjU0NywyMTEuNTE1LDMyMS45NjksMjExLjUxNSwxOTkuNTYyeiIvPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPC9zdmc+DQo=',
                },
                'pdf': {
                    uid: 'app-3920851d-bda8-479b-9407-8517293c7d44',
                    uuid: 'app-3920851d-bda8-479b-9407-8517293c7d44',
                    name: 'pdf',
                    title: 'PDF Viewer',
                    index_url: `http://pdf.localhost:${PORT}/index.html`,
                    icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iaXNvLTg4NTktMSI/Pg0KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE4LjAuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPg0KPCFET0NUWVBFIHN2ZyBQVUJMSUMgIi0vL1czQy8vRFREIFNWRyAxLjEvL0VOIiAiaHR0cDovL3d3dy53My5vcmcvR3JhcGhpY3MvU1ZHLzEuMS9EVEQvc3ZnMTEuZHRkIj4NCjxzdmcgdmVyc2lvbj0iMS4xIiBpZD0iQ2FwYV8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCINCgkgdmlld0JveD0iMCAwIDU2IDU2IiBzdHlsZT0iZW5hYmxlLWJhY2tncm91bmQ6bmV3IDAgMCA1NiA1NjsiIHhtbDpzcGFjZT0icHJlc2VydmUiPg0KPGc+DQoJPHBhdGggc3R5bGU9ImZpbGw6I0U5RTlFMDsiIGQ9Ik0zNi45ODUsMEg3Ljk2M0M3LjE1NSwwLDYuNSwwLjY1NSw2LjUsMS45MjZWNTVjMCwwLjM0NSwwLjY1NSwxLDEuNDYzLDFoNDAuMDc0DQoJCWMwLjgwOCwwLDEuNDYzLTAuNjU1LDEuNDYzLTFWMTIuOTc4YzAtMC42OTYtMC4wOTMtMC45Mi0wLjI1Ny0xLjA4NUwzNy42MDcsMC4yNTdDMzcuNDQyLDAuMDkzLDM3LjIxOCwwLDM2Ljk4NSwweiIvPg0KCTxwb2x5Z29uIHN0eWxlPSJmaWxsOiNEOUQ3Q0E7IiBwb2ludHM9IjM3LjUsMC4xNTEgMzcuNSwxMiA0OS4zNDksMTIgCSIvPg0KCTxwYXRoIHN0eWxlPSJmaWxsOiNDQzRCNEM7IiBkPSJNMTkuNTE0LDMzLjMyNEwxOS41MTQsMzMuMzI0Yy0wLjM0OCwwLTAuNjgyLTAuMTEzLTAuOTY3LTAuMzI2DQoJCWMtMS4wNDEtMC43ODEtMS4xODEtMS42NS0xLjExNS0yLjI0MmMwLjE4Mi0xLjYyOCwyLjE5NS0zLjMzMiw1Ljk4NS01LjA2OGMxLjUwNC0zLjI5NiwyLjkzNS03LjM1NywzLjc4OC0xMC43NQ0KCQljLTAuOTk4LTIuMTcyLTEuOTY4LTQuOTktMS4yNjEtNi42NDNjMC4yNDgtMC41NzksMC41NTctMS4wMjMsMS4xMzQtMS4yMTVjMC4yMjgtMC4wNzYsMC44MDQtMC4xNzIsMS4wMTYtMC4xNzINCgkJYzAuNTA0LDAsMC45NDcsMC42NDksMS4yNjEsMS4wNDljMC4yOTUsMC4zNzYsMC45NjQsMS4xNzMtMC4zNzMsNi44MDJjMS4zNDgsMi43ODQsMy4yNTgsNS42Miw1LjA4OCw3LjU2Mg0KCQljMS4zMTEtMC4yMzcsMi40MzktMC4zNTgsMy4zNTgtMC4zNThjMS41NjYsMCwyLjUxNSwwLjM2NSwyLjkwMiwxLjExN2MwLjMyLDAuNjIyLDAuMTg5LDEuMzQ5LTAuMzksMi4xNg0KCQljLTAuNTU3LDAuNzc5LTEuMzI1LDEuMTkxLTIuMjIsMS4xOTFjLTEuMjE2LDAtMi42MzItMC43NjgtNC4yMTEtMi4yODVjLTIuODM3LDAuNTkzLTYuMTUsMS42NTEtOC44MjgsMi44MjINCgkJYy0wLjgzNiwxLjc3NC0xLjYzNywzLjIwMy0yLjM4Myw0LjI1MUMyMS4yNzMsMzIuNjU0LDIwLjM4OSwzMy4zMjQsMTkuNTE0LDMzLjMyNHogTTIyLjE3NiwyOC4xOTgNCgkJYy0yLjEzNywxLjIwMS0zLjAwOCwyLjE4OC0zLjA3MSwyLjc0NGMtMC4wMSwwLjA5Mi0wLjAzNywwLjMzNCwwLjQzMSwwLjY5MkMxOS42ODUsMzEuNTg3LDIwLjU1NSwzMS4xOSwyMi4xNzYsMjguMTk4eg0KCQkgTTM1LjgxMywyMy43NTZjMC44MTUsMC42MjcsMS4wMTQsMC45NDQsMS41NDcsMC45NDRjMC4yMzQsMCwwLjkwMS0wLjAxLDEuMjEtMC40NDFjMC4xNDktMC4yMDksMC4yMDctMC4zNDMsMC4yMy0wLjQxNQ0KCQljLTAuMTIzLTAuMDY1LTAuMjg2LTAuMTk3LTEuMTc1LTAuMTk3QzM3LjEyLDIzLjY0OCwzNi40ODUsMjMuNjcsMzUuODEzLDIzLjc1NnogTTI4LjM0MywxNy4xNzQNCgkJYy0wLjcxNSwyLjQ3NC0xLjY1OSw1LjE0NS0yLjY3NCw3LjU2NGMyLjA5LTAuODExLDQuMzYyLTEuNTE5LDYuNDk2LTIuMDJDMzAuODE1LDIxLjE1LDI5LjQ2NiwxOS4xOTIsMjguMzQzLDE3LjE3NHoNCgkJIE0yNy43MzYsOC43MTJjLTAuMDk4LDAuMDMzLTEuMzMsMS43NTcsMC4wOTYsMy4yMTZDMjguNzgxLDkuODEzLDI3Ljc3OSw4LjY5OCwyNy43MzYsOC43MTJ6Ii8+DQoJPHBhdGggc3R5bGU9ImZpbGw6I0NDNEI0QzsiIGQ9Ik00OC4wMzcsNTZINy45NjNDNy4xNTUsNTYsNi41LDU1LjM0NSw2LjUsNTQuNTM3VjM5aDQzdjE1LjUzN0M0OS41LDU1LjM0NSw0OC44NDUsNTYsNDguMDM3LDU2eiIvPg0KCTxnPg0KCQk8cGF0aCBzdHlsZT0iZmlsbDojRkZGRkZGOyIgZD0iTTE3LjM4NSw1M2gtMS42NDFWNDIuOTI0aDIuODk4YzAuNDI4LDAsMC44NTIsMC4wNjgsMS4yNzEsMC4yMDUNCgkJCWMwLjQxOSwwLjEzNywwLjc5NSwwLjM0MiwxLjEyOCwwLjYxNWMwLjMzMywwLjI3MywwLjYwMiwwLjYwNCwwLjgwNywwLjk5MXMwLjMwOCwwLjgyMiwwLjMwOCwxLjMwNg0KCQkJYzAsMC41MTEtMC4wODcsMC45NzMtMC4yNiwxLjM4OGMtMC4xNzMsMC40MTUtMC40MTUsMC43NjQtMC43MjUsMS4wNDZjLTAuMzEsMC4yODItMC42ODQsMC41MDEtMS4xMjEsMC42NTYNCgkJCXMtMC45MjEsMC4yMzItMS40NDksMC4yMzJoLTEuMjE3VjUzeiBNMTcuMzg1LDQ0LjE2OHYzLjk5MmgxLjUwNGMwLjIsMCwwLjM5OC0wLjAzNCwwLjU5NS0wLjEwMw0KCQkJYzAuMTk2LTAuMDY4LDAuMzc2LTAuMTgsMC41NC0wLjMzNWMwLjE2NC0wLjE1NSwwLjI5Ni0wLjM3MSwwLjM5Ni0wLjY0OWMwLjEtMC4yNzgsMC4xNS0wLjYyMiwwLjE1LTEuMDMyDQoJCQljMC0wLjE2NC0wLjAyMy0wLjM1NC0wLjA2OC0wLjU2N2MtMC4wNDYtMC4yMTQtMC4xMzktMC40MTktMC4yOC0wLjYxNWMtMC4xNDItMC4xOTYtMC4zNC0wLjM2LTAuNTk1LTAuNDkyDQoJCQljLTAuMjU1LTAuMTMyLTAuNTkzLTAuMTk4LTEuMDEyLTAuMTk4SDE3LjM4NXoiLz4NCgkJPHBhdGggc3R5bGU9ImZpbGw6I0ZGRkZGRjsiIGQ9Ik0zMi4yMTksNDcuNjgyYzAsMC44MjktMC4wODksMS41MzgtMC4yNjcsMi4xMjZzLTAuNDAzLDEuMDgtMC42NzcsMS40NzdzLTAuNTgxLDAuNzA5LTAuOTIzLDAuOTM3DQoJCQlzLTAuNjcyLDAuMzk4LTAuOTkxLDAuNTEzYy0wLjMxOSwwLjExNC0wLjYxMSwwLjE4Ny0wLjg3NSwwLjIxOUMyOC4yMjIsNTIuOTg0LDI4LjAyNiw1MywyNy44OTgsNTNoLTMuODE0VjQyLjkyNGgzLjAzNQ0KCQkJYzAuODQ4LDAsMS41OTMsMC4xMzUsMi4yMzUsMC40MDNzMS4xNzYsMC42MjcsMS42LDEuMDczczAuNzQsMC45NTUsMC45NSwxLjUyNEMzMi4xMTQsNDYuNDk0LDMyLjIxOSw0Ny4wOCwzMi4yMTksNDcuNjgyeg0KCQkJIE0yNy4zNTIsNTEuNzk3YzEuMTEyLDAsMS45MTQtMC4zNTUsMi40MDYtMS4wNjZzMC43MzgtMS43NDEsMC43MzgtMy4wOWMwLTAuNDE5LTAuMDUtMC44MzQtMC4xNS0xLjI0NA0KCQkJYy0wLjEwMS0wLjQxLTAuMjk0LTAuNzgxLTAuNTgxLTEuMTE0cy0wLjY3Ny0wLjYwMi0xLjE2OS0wLjgwN3MtMS4xMy0wLjMwOC0xLjkxNC0wLjMwOGgtMC45NTd2Ny42MjlIMjcuMzUyeiIvPg0KCQk8cGF0aCBzdHlsZT0iZmlsbDojRkZGRkZGOyIgZD0iTTM2LjI2Niw0NC4xNjh2My4xNzJoNC4yMTF2MS4xMjFoLTQuMjExVjUzaC0xLjY2OFY0Mi45MjRINDAuOXYxLjI0NEgzNi4yNjZ6Ii8+DQoJPC9nPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPC9zdmc+DQo=',
                }
            };
            
            const app = apps[appName];
            if (app) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true, result: app }));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, result: null }));
            }
        }
        
        // Default: return empty success for other driver calls
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, result: null }));
    }
    
    // /auth/check - Auth check
    if (path === '/auth/check' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ logged_in: true }));
    }
    
    // /writeFile - Write file using signed URL (for editor saves)
    // Format: POST /writeFile?uid=...&signature=...&expires=...
    if (path === '/writeFile' && method === 'POST') {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const fileUid = url.searchParams.get('uid');
        const signature = url.searchParams.get('signature');
        
        console.log(`\n💾 WRITEFILE: uid=${fileUid || 'none'}, signature=${signature ? signature.substring(0, 20) + '...' : 'none'}`);
        console.log(`   Content-Type: ${req.headers['content-type'] || 'none'}`);
        console.log(`   Data type: ${typeof data}, keys: ${data && typeof data === 'object' ? Object.keys(data).join(', ') : 'N/A'}`);
        console.log(`   Raw body length: ${rawBody ? rawBody.length : 0} bytes`);
        
        // Find file by UID
        let targetNode = null;
        let normalizedPath = null;
        
        if (fileUid) {
            const findNodeByUid = (node, path = '/') => {
                if (node.uuid === fileUid || node.uuid === fileUid.replace(/^uuid-+/, 'uuid-')) {
                    targetNode = node;
                    normalizedPath = path;
                    return true;
                }
                if (node.children) {
                    for (const [name, child] of Object.entries(node.children)) {
                        const childPath = path === '/' ? `/${name}` : `${path}/${name}`;
                        if (findNodeByUid(child, childPath)) {
                            return true;
                        }
                    }
                }
                return false;
            };
            findNodeByUid(nodeState.filesystem['/']);
        }
        
        if (!targetNode) {
            console.warn(`   ⚠️  File not found for UID: ${fileUid}`);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'File not found' }));
        }
        
        // Get file content from multipart form data or request body
        let fileContent = '';
        let fileName = targetNode.name;
        
        // Check if it's multipart form data (already parsed)
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            // Look for file field in multipart data
            for (const [key, value] of Object.entries(data)) {
                if (value && typeof value === 'object' && value.filename) {
                    // This is a file upload from multipart
                    fileName = value.filename || fileName;
                    fileContent = value.content || '';
                    // Decode base64 if needed
                    if (value.isBase64 && fileContent) {
                        try {
                            fileContent = Buffer.from(fileContent, 'base64').toString('utf8');
                        } catch (e) {
                            console.warn(`   ⚠️  Failed to decode base64: ${e.message}`);
                        }
                    }
                    console.log(`   📝 Found file in multipart: ${fileName} (${fileContent.length} chars)`);
                    break;
                } else if (key === 'file' && value) {
                    // File field found
                    if (typeof value === 'string') {
                        fileContent = value;
                    } else if (value.content) {
                        fileContent = value.content;
                        if (value.isBase64) {
                            try {
                                fileContent = Buffer.from(fileContent, 'base64').toString('utf8');
                            } catch (e) {
                                console.warn(`   ⚠️  Failed to decode base64: ${e.message}`);
                            }
                        }
                    }
                    console.log(`   📝 Found file field: ${fileContent.length} chars`);
                    break;
                } else if (key === 'content' || key === 'data' || key === 'text') {
                    // Direct content field
                    if (typeof value === 'string') {
                        fileContent = value;
                        console.log(`   📝 Found content field (${key}): ${fileContent.length} chars`);
                        break;
                    }
                }
            }
        }
        
        // If no file content found in multipart, try to read from raw body
        // This handles cases where content is sent as raw text/plain
        if (!fileContent && rawBody && rawBody.length > 0) {
            fileContent = rawBody.toString('utf8');
            console.log(`   📝 Using raw body content: ${fileContent.length} chars`);
            console.log(`   📝 Raw body preview: "${fileContent.substring(0, 100)}..."`);
        }
        
        // If still no content, check if data is a string (raw JSON body)
        if (!fileContent && typeof data === 'string') {
            try {
                const parsed = JSON.parse(data);
                if (parsed.content || parsed.data || parsed.text) {
                    fileContent = parsed.content || parsed.data || parsed.text;
                    console.log(`   📝 Found content in JSON body: ${fileContent.length} chars`);
                }
            } catch (e) {
                // Not JSON, might be raw text
                fileContent = data;
                console.log(`   📝 Using data as raw string: ${fileContent.length} chars`);
            }
        }
        
        // If still no content, the request body might be the content itself (raw text)
        if (!fileContent && body && body.length > 0) {
            fileContent = body;
            console.log(`   📝 Using body as content: ${fileContent.length} chars`);
            console.log(`   📝 Body preview: "${fileContent.substring(0, 100)}..."`);
        }
        
        // Warn if no content found
        if (!fileContent || fileContent.length === 0) {
            console.warn(`   ⚠️  No content found! Data keys: ${data ? Object.keys(data).join(', ') : 'none'}, rawBody length: ${rawBody ? rawBody.length : 0}, body length: ${body ? body.length : 0}`);
        }
        
        // Update file content
        const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '/';
        const parent = getNode(nodeState.filesystem, parentPath);
        
        if (parent && parent.children[fileName]) {
            const oldSize = parent.children[fileName].size || 0;
            const fileSize = fileContent ? Buffer.byteLength(fileContent, 'utf8') : 0;
            
            // Store content (text files should be stored as plain text, not base64)
            parent.children[fileName].content = fileContent || '';
            parent.children[fileName].isBase64 = false; // Text files shouldn't be base64
            parent.children[fileName].size = fileSize;
            parent.children[fileName].modified = Date.now();
            
            nodeState.storageUsed += (fileSize - oldSize);
            saveState();
            
            console.log(`   ✅ File updated: ${fileName} (${fileSize} bytes)`);
            
            // Emit socket event for real-time update
            const authHeader = req.headers['authorization'];
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                const session = nodeState.sessions.get(token);
                if (session) {
                    emitSocketEvent('item.updated', {
                        path: normalizedPath,
                        uid: targetNode.uuid,
                        uuid: targetNode.uuid,
                        name: fileName,
                        is_dir: false,
                        size: fileSize,
                        original_client_socket_id: null
                    }, session.wallet);
                }
            }
            
            // Return file entry (matching Puter's format)
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                uid: targetNode.uuid,
                uuid: targetNode.uuid,
                name: fileName,
                path: normalizedPath,
                is_dir: false,
                size: fileSize,
                created: new Date(parent.children[fileName].created).toISOString(),
                modified: new Date(parent.children[fileName].modified).toISOString(),
                type: parent.children[fileName].mimeType || 'text/plain',
            }));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'File not found' }));
        }
    }
    
    // /sign - Sign files for app access (Puter API)
    if (path === '/sign' && method === 'POST') {
        console.log('\n✍️  SIGN REQUEST');
        
        if (!data || !data.items || !Array.isArray(data.items)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Missing or invalid items array' }));
        }
        
        // Get auth token
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Unauthorized' }));
        }
        
        const token = authHeader.split(' ')[1];
        const session = nodeState.sessions.get(token);
        if (!session) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Invalid session' }));
        }
        
        const walletAddress = session.wallet;
        const appUid = data.app_uid || null;
        
        // Determine base URL (use origin if HTTPS, otherwise localhost)
        const origin = req.headers.origin || req.headers.host;
        const isHttps = origin && origin.startsWith('https://');
        const cleanBaseUrl = isHttps 
            ? `https://${origin.replace(/^https?:\/\//, '').split('/')[0]}`
            : `http://127.0.0.1:${PORT}`;
        
        const signatures = [];
        
        // Process each item
        for (const item of data.items) {
            if (!item.uid && !item.path) {
                signatures.push({});
                continue;
            }
            
            // Find the file by UID or path
            let targetNode = null;
            let normalizedPath = null;
            
            if (item.uid) {
                // Find by UID
                const findNodeByUid = (node, path = '/') => {
                    if (node.uuid === item.uid || node.uuid === item.uid.replace(/^uuid-+/, 'uuid-')) {
                        targetNode = node;
                        normalizedPath = path;
                        return true;
                    }
                    if (node.children) {
                        for (const [name, child] of Object.entries(node.children)) {
                            const childPath = path === '/' ? `/${name}` : `${path}/${name}`;
                            if (findNodeByUid(child, childPath)) {
                                return true;
                            }
                        }
                    }
                    return false;
                };
                findNodeByUid(nodeState.filesystem['/']);
            } else if (item.path) {
                // Find by path
                let filePath = item.path;
                if (filePath.startsWith('~')) {
                    filePath = filePath.replace('~', `/${walletAddress}`);
                }
                normalizedPath = filePath.startsWith('/') ? filePath : '/' + filePath;
                targetNode = getNode(nodeState.filesystem, normalizedPath);
            }
            
            if (!targetNode) {
                signatures.push({});
                continue;
            }
            
            // Generate signature (matching Puter's sign_file format)
            const actualFileUid = targetNode.uuid;
            const ttl = 9999999999999; // Very long expiry
            const expires = Math.ceil(Date.now() / 1000) + ttl;
            const action = item.action || 'read';
            
            // Simple signature (in real Puter, this uses SHA256 with secret)
            const signature = `sig-${actualFileUid}-${action}-${expires}`;
            
            // Determine content type
            const fileName = targetNode.name || '';
            const mimeTypes = {
                '.txt': 'text/plain',
                '.js': 'text/javascript',
                '.json': 'application/json',
                '.html': 'text/html',
                '.css': 'text/css',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.pdf': 'application/pdf',
                '.mp4': 'video/mp4',
                '.mp3': 'audio/mpeg',
            };
            const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
            const fsentryType = mimeTypes[ext] || 'application/octet-stream';
            
            const signatureObj = {
                uid: actualFileUid,
                expires: expires,
                signature: signature,
                url: `${cleanBaseUrl}/file?uid=${actualFileUid}&expires=${expires}&signature=${signature}`,
                read_url: `${cleanBaseUrl}/file?uid=${actualFileUid}&expires=${expires}&signature=${signature}`,
                write_url: `${cleanBaseUrl}/writeFile?uid=${actualFileUid}&expires=${expires}&signature=${signature}`,
                metadata_url: `${cleanBaseUrl}/itemMetadata?uid=${actualFileUid}&expires=${expires}&signature=${signature}`,
                fsentry_type: fsentryType,
                fsentry_is_dir: targetNode.type === 'dir',
                fsentry_name: targetNode.name,
                fsentry_size: targetNode.size || 0,
                fsentry_accessed: targetNode.accessed || Date.now(),
                fsentry_modified: targetNode.modified || Date.now(),
                fsentry_created: targetNode.created || Date.now(),
                path: normalizedPath || item.path,
            };
            
            signatures.push(signatureObj);
        }
        
        // Generate a user-app token (mock)
        const userAppToken = `token-${walletAddress}-${Date.now()}`;
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            token: userAppToken,
            signatures: signatures
        }));
    }
    
    // /rao - Records app opens (Puter API)
    if (path === '/rao' && method === 'POST') {
        // Just acknowledge the request - we don't need to track app opens in mock server
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ code: 'ok', message: 'ok' }));
    }
    
    // /contactUs - Contact form
    if (path === '/contactUs' && method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
    }
    
    // 404 for unknown routes
    console.log(`\n⚠️  UNKNOWN ROUTE: ${method} ${path}`);
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
    console.log('  GET  /api/health       - Health check');
    console.log('  GET  /api/info         - Node information');
    console.log('  POST /api/claim        - Claim node ownership');
    console.log('  POST /api/auth         - Authenticate session');
    console.log('  GET  /api/stats        - Get node stats');
    console.log('');
    console.log('  📁 File Storage API (simulates IPFS):');
    console.log('  GET  /api/files/list/* - List directory');
    console.log('  GET  /api/files/stat/* - Get file/folder info');
    console.log('  GET  /api/files/read/* - Read file content');
    console.log('  POST /api/files/write  - Write/create file');
    console.log('  POST /api/files/mkdir  - Create directory');
    console.log('  POST /api/files/move   - Move/rename file');
    console.log('  POST /api/files/delete - Delete file/folder');
    console.log('');
    console.log('🌐 PUTER API FORMAT (for frontend integration):');
    console.log('  GET  /whoami   - Get current user info');
    console.log('  GET  /stat     - Get file/folder info');
    console.log('  GET  /read     - Read file content');
    console.log('  POST /write    - Write/create file');
    console.log('  POST /mkdir    - Create directory');
    console.log('  POST /readdir  - List directory contents');
    console.log('  POST /delete   - Delete files/folders');
    console.log('  POST /move     - Move/rename file');
    console.log('\n');
});

// Handle shutdown
process.on('SIGINT', () => {
    console.log('\n\nShutting down mock PC2 server...');
    process.exit(0);
});

