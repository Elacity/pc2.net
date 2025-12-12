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
    
    // Normalize wallet address to lowercase for consistent matching
    const normalizedWallet = wallet ? wallet.toLowerCase() : null;
    
    const eventEntry = {
        event,
        data,
        wallet: normalizedWallet,
        timestamp: Date.now()
    };
    
    nodeState.pendingEvents.push(eventEntry);
    
    // Log event emission for debugging
    console.log(`   🔔 Socket event emitted: ${event} for wallet: ${normalizedWallet || 'broadcast'}, pendingEvents count: ${nodeState.pendingEvents.length}`);
    
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
 * Find a node by UUID and return both the node and its path
 * @param {Object} filesystem - The filesystem to search
 * @param {string} uuid - The UUID to search for (can be full UUID or just the UUID part)
 * @returns {{node: Object|null, path: string|null}} - The found node and its path, or null if not found
 */
function findNodeByUuid(filesystem, uuid) {
    let foundNode = null;
    let foundPath = null;
    
    // UUIDs are stored as: uuid-${path.replace(/\//g, '-')}
    // So "uuid--path" means the path started with "/" (becomes "-")
    // We need to match exactly as stored
    
    function searchRecursive(node, currentPath = '/') {
        // Check if this node matches
        if (node.uuid) {
            // Try exact match first
            if (node.uuid === uuid) {
                foundNode = node;
                foundPath = currentPath;
                return true;
            }
            
            // Also try matching the UUID part (in case format differs slightly)
            // Extract the part after "uuid-" for comparison
            const nodeUuidPart = node.uuid.replace(/^uuid-+/, '');
            const searchUuidPart = uuid.replace(/^uuid-+/, '');
            
            if (nodeUuidPart === searchUuidPart && nodeUuidPart.length > 0) {
                foundNode = node;
                foundPath = currentPath;
                return true;
            }
        }
        
        // Search children
        if (node.children) {
            for (const [name, child] of Object.entries(node.children)) {
                const childPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
                if (searchRecursive(child, childPath)) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    searchRecursive(filesystem['/']);
    
    if (foundNode) {
        console.log(`   ✅ Found node by UUID: ${uuid} → ${foundPath}`);
    } else {
        console.warn(`   ⚠️  Node not found by UUID: ${uuid}`);
        // Debug: list some UUIDs to see format
        console.warn(`   🔍 Sample UUIDs in filesystem (first 5):`);
        let count = 0;
        function listUuids(node, path = '/') {
            if (count >= 5) return;
            if (node.uuid) {
                console.warn(`      ${node.uuid} (path: ${path})`);
                count++;
            }
            if (node.children) {
                for (const [name, child] of Object.entries(node.children)) {
                    const childPath = path === '/' ? `/${name}` : `${path}/${name}`;
                    listUuids(child, childPath);
                    if (count >= 5) return;
                }
            }
        }
        listUuids(filesystem['/']);
    }
    
    return { node: foundNode, path: foundPath };
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

/**
 * Generate production HTML for ElastOS frontend
 * This creates the index.html that loads the built frontend files
 */
function generateProductionHtml() {
    const apiOrigin = `http://localhost:${PORT}`;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ElastOS - Personal Cloud</title>
    <meta name="description" content="ElastOS is a privacy-first personal cloud that houses all your files, apps, and games in one private and secure place, accessible from anywhere at any time.">
    
    <!-- Favicons -->
    <link rel="apple-touch-icon" sizes="57x57" href="/favicons/apple-icon-57x57.png">
    <link rel="apple-touch-icon" sizes="60x60" href="/favicons/apple-icon-60x60.png">
    <link rel="apple-touch-icon" sizes="72x72" href="/favicons/apple-icon-72x72.png">
    <link rel="apple-touch-icon" sizes="76x76" href="/favicons/apple-icon-76x76.png">
    <link rel="apple-touch-icon" sizes="114x114" href="/favicons/apple-icon-114x114.png">
    <link rel="apple-touch-icon" sizes="120x120" href="/favicons/apple-icon-120x120.png">
    <link rel="apple-touch-icon" sizes="144x144" href="/favicons/apple-icon-144x144.png">
    <link rel="apple-touch-icon" sizes="152x152" href="/favicons/apple-icon-152x152.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-icon-180x180.png">
    <link rel="icon" type="image/png" sizes="192x192" href="/favicons/android-icon-192x192.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicons/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="96x96" href="/favicons/favicon-96x96.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicons/favicon-16x16.png">
    <link rel="manifest" href="/manifest.json">
    
    <!-- Styles -->
    <link rel="stylesheet" href="/bundle.min.css">
    
    <!-- Initialize API origin before SDK loads -->
    <script>
        // Auto-detect API origin from current page URL (same origin = no CORS!)
        // This implements the "Puter on PC2" architecture - frontend and backend on same origin
        window.api_origin = window.location.origin;
        console.log('[PC2]: Auto-detected API origin (same origin):', window.api_origin);
        window.puter_gui_enabled = true;
        
        // PHASE 1: Intercept fetch calls to redirect api.puter.com to local server
        // This ensures SDK calls go to PC2 node even if SDK hasn't been configured yet
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            const url = args[0];
            if (typeof url === 'string') {
                if (url.includes('api.puter.com')) {
                    // Replace api.puter.com domain with local origin (handle both http and https, with or without :443)
                    const apiPattern = 'https?:\\\\/\\\\/api\\\\.puter\\\\.com(:443)?';
                    const apiRegex = new RegExp(apiPattern, 'g');
                    let localUrl = url.replace(apiRegex, window.location.origin);
                    console.log('[PC2]: Intercepting fetch:', url, '->', localUrl);
                    args[0] = localUrl;
                }
            } else if (url && typeof url === 'object' && url.url) {
                // Request object
                if (url.url.includes('api.puter.com')) {
                    const apiPattern = 'https?:\\\\/\\\\/api\\\\.puter\\\\.com(:443)?';
                    const apiRegex = new RegExp(apiPattern, 'g');
                    url.url = url.url.replace(apiRegex, window.location.origin);
                    console.log('[PC2]: Intercepting fetch (Request object):', url.url);
                }
            }
            return originalFetch.apply(this, args);
        };
        
        // Also intercept XMLHttpRequest
        const originalXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            if (typeof url === 'string' && url.includes('api.puter.com')) {
                // Replace api.puter.com domain with local origin (handle both http and https, with or without :443)
                const apiPattern = 'https?:\\\\/\\\\/api\\\\.puter\\\\.com(:443)?';
                const apiRegex = new RegExp(apiPattern, 'g');
                let localUrl = url.replace(apiRegex, window.location.origin);
                console.log('[PC2]: Intercepting XHR:', url, '->', localUrl);
                url = localUrl;
            }
            return originalXHROpen.call(this, method, url, ...rest);
        };
        
        // Also set window.puter_api_origin if SDK checks for it
        window.puter_api_origin = window.location.origin;
        
        // Initialize service_script_api_promise (normally done by backend)
        // SDK expects service_script_api_promise.resolve() to be callable
        // Create a Promise-like object with resolve/reject methods
        let serviceScriptResolve, serviceScriptReject;
        const serviceScriptPromise = new Promise((resolve, reject) => {
            serviceScriptResolve = resolve;
            serviceScriptReject = reject;
        });
        // Create wrapper object that has both Promise interface and resolve/reject methods
        const serviceScriptAPI = {
            then: serviceScriptPromise.then.bind(serviceScriptPromise),
            catch: serviceScriptPromise.catch.bind(serviceScriptPromise),
            finally: serviceScriptPromise.finally.bind(serviceScriptPromise),
            resolve: serviceScriptResolve,
            reject: serviceScriptReject
        };
        // Set on both window and globalThis for SDK compatibility
        window.service_script_api_promise = serviceScriptAPI;
        globalThis.service_script_api_promise = serviceScriptAPI;
        
        window.service_script = async function(fn) {
            try {
                await fn(await window.service_script_api_promise);
            } catch (e) {
                console.error('service_script(ERROR)', e);
            }
        };
    </script>
</head>
<body>
    <!-- Load GUI bundle -->
    <script src="/bundle.min.js"></script>
    <script src="/gui.js"></script>
    
    <!-- Initialize GUI -->
    <script type="text/javascript">
        window.addEventListener('load', function() {
            console.log('[PC2]: Window loaded, checking for gui function...');
            if (typeof gui === 'function') {
                console.log('[PC2]: ✅ gui() function found, initializing...');
                // Pass undefined for api_origin - let frontend auto-detect from window.location.origin
                gui({
                    api_origin: undefined, // Will auto-detect from window.location.origin
                    title: 'ElastOS',
                    max_item_name_length: 150,
                    require_email_verification_to_publish_website: false,
                    short_description: 'ElastOS is a privacy-first personal cloud that houses all your files, apps, and games in one private and secure place, accessible from anywhere at any time.',
                }).then(() => {
                    console.log('[PC2]: ✅ gui() initialization completed');
                }).catch((e) => {
                    console.error('[PC2]: ❌ gui() initialization failed:', e);
                });
            } else {
                console.error('[PC2]: ❌ GUI function not found. Make sure bundle.min.js and gui.js are loaded.');
            }
        });
    </script>
</body>
</html>`;
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
    
    // ============================================================
    // PHASE 0: Handle app subdomains FIRST (before main GUI)
    // ============================================================
    // Apps are served from subdomains: viewer.localhost:4200, player.localhost:4200, etc.
    // This must run BEFORE main GUI serving to prevent apps from getting GUI HTML
    const hostname = req.headers.host || `localhost:${PORT}`;
    const subdomain = hostname.split('.')[0];
    const appSubdomains = ['viewer', 'player', 'pdf', 'editor', 'terminal'];
    
    if (appSubdomains.includes(subdomain) && req.method === 'GET') {
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
                
                console.log(`\n📱 GET ${urlPath} (${subdomain} app) - Serving: ${safePath}`);
                
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
                    console.log(`\n📱 GET ${urlPath} (${subdomain} app) - Serving directory index: ${indexPath}`);
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(fileContent);
                    return;
                }
            }
        }
        
        // If app files don't exist, return 404 (don't fall through to GUI)
        console.warn(`\n⚠️  App file not found for ${subdomain}: ${urlPath}`);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('App file not found');
        return;
    }
    
    // ============================================================
    // PHASE 1: Serve ElastOS Frontend (Puter UI) from PC2 Node
    // ============================================================
    // Serve static files from built frontend (dist/) directory
    // This implements the "Puter on PC2" architecture vision
    if (req.method === 'GET') {
        const guiDistPath = path.join(__dirname, '../src/gui/dist');
        
        // Check if this is a request for a static file (not an API endpoint)
        // Note: /images/ is explicitly allowed as a static file path
        const isApiPath = urlPath.startsWith('/api/') || 
                         urlPath.startsWith('/auth/') || 
                         urlPath.startsWith('/drivers/') ||
                         urlPath.startsWith('/cache/') ||
                         urlPath.startsWith('/whoami') ||
                         urlPath.startsWith('/version') ||
                         urlPath.startsWith('/get-launch-apps') ||
                         urlPath.startsWith('/kv/') ||
                         urlPath.startsWith('/hosting/') ||
                         urlPath.startsWith('/socket.io/') ||
                         urlPath.startsWith('/stat') ||
                         urlPath.startsWith('/readdir') ||
                         urlPath.startsWith('/read') ||
                         urlPath.startsWith('/write') ||
                         urlPath.startsWith('/mkdir') ||
                         urlPath.startsWith('/delete') ||
                         urlPath.startsWith('/move') ||
                         urlPath.startsWith('/batch') ||
                         urlPath.startsWith('/open_item') ||
                         urlPath.startsWith('/file');
        
        // Special handling for /particle-auth route and its assets
        if (urlPath === '/particle-auth' || urlPath.startsWith('/particle-auth/')) {
            const particleAuthDir = path.join(__dirname, '../src/particle-auth');
            
            // Handle /particle-auth (serve index.html)
            if (urlPath === '/particle-auth') {
                console.log(`\n🌐 GET ${urlPath} - Serving Particle Auth page`);
                const particleAuthPath = path.join(particleAuthDir, 'index.html');
                if (fs.existsSync(particleAuthPath)) {
                    let html = fs.readFileSync(particleAuthPath, 'utf8');
                    
                    // Extract API origin from URL params and inject it into the page
                    // This allows the Particle Auth React app to know where to send auth requests
                    // Critical for PC2 deployment where each node has its own URL/IP
                    const url = new URL(req.url, `http://${req.headers.host}`);
                    const apiOrigin = url.searchParams.get('api_origin') || `http://${req.headers.host}`;
                    
                    // Inject API origin and interception scripts IMMEDIATELY before any other scripts
                    // This ensures Particle Auth works with any PC2 node URL/IP
                    // Must run before React app loads to intercept all API calls
                    const apiOriginScript = `
    <script>
        (function() {
            // Set API origin for Particle Auth React app
            // This is injected by the PC2 server based on the deployment URL
            window.PUTER_API_ORIGIN = ${JSON.stringify(apiOrigin)};
            console.log('[Particle Auth]: ✅ API origin set to:', window.PUTER_API_ORIGIN);
            
            // Intercept API calls to redirect them to the PC2 node
            // This is critical for PC2 deployment where each node has its own URL/IP
            const currentOrigin = window.location.origin;
            console.log('[Particle Auth]: Current origin:', currentOrigin);
            
            // More robust regex pattern to match any api.puter.* domain with optional port
            const apiPuterPattern = /https?:\\/\\/api\\.puter\\.[^\\/:]+(?:\\:\\d+)?/gi;
            
            // Intercept fetch requests - must intercept before React app loads
            const originalFetch = window.fetch;
            window.fetch = function(...args) {
                let url = args[0];
                if (typeof url === 'string') {
                    if (url.includes('api.puter.')) {
                        const interceptedUrl = url.replace(apiPuterPattern, currentOrigin);
                        console.log('[Particle Auth]: 🔄 Intercepting fetch:', url, '->', interceptedUrl);
                        args[0] = interceptedUrl;
                    }
                } else if (url && typeof url === 'object' && url.url) {
                    // Request object
                    if (url.url.includes('api.puter.')) {
                        url.url = url.url.replace(apiPuterPattern, currentOrigin);
                        console.log('[Particle Auth]: 🔄 Intercepting fetch (Request object):', url.url);
                    }
                }
                return originalFetch.apply(this, args);
            };
            
            // Intercept XMLHttpRequest
            const originalXHROpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                if (typeof url === 'string') {
                    if (url.includes('api.puter.')) {
                        const interceptedUrl = url.replace(apiPuterPattern, currentOrigin);
                        console.log('[Particle Auth]: 🔄 Intercepting XHR:', url, '->', interceptedUrl);
                        url = interceptedUrl;
                    }
                }
                return originalXHROpen.call(this, method, url, ...rest);
            };
            
            // Listen for postMessage from parent window with API origin
            window.addEventListener('message', function(event) {
                if (event.origin !== window.location.origin) return;
                if (event.data && event.data.type === 'puter-api-origin') {
                    window.PUTER_API_ORIGIN = event.data.apiOrigin;
                    console.log('[Particle Auth]: ✅ Received API origin from parent:', window.PUTER_API_ORIGIN);
                }
            });
            
            console.log('[Particle Auth]: ✅ Interception scripts loaded and active');
        })();
    </script>
`;
                    
                    // Insert the script right after <head> tag, before any other scripts
                    // This ensures it runs before the React app module loads
                    // Use more flexible regex to match <head> with or without attributes
                    const beforeReplace = html;
                    html = html.replace(/<head[^>]*>/i, (match) => {
                        console.log(`[Particle Auth]: Injecting script after: ${match}`);
                        return `${match}${apiOriginScript}`;
                    });
                    
                    if (html === beforeReplace) {
                        console.warn('[Particle Auth]: ⚠️ Script injection failed - <head> tag not found or already replaced');
                        // Fallback: try inserting before first <script> tag
                        html = html.replace(/<script/i, `${apiOriginScript}<script`);
                        console.log('[Particle Auth]: Attempted fallback injection before first <script> tag');
                    } else {
                        console.log('[Particle Auth]: ✅ Script successfully injected');
                    }
                    
                    res.writeHead(200, { 
                        'Content-Type': 'text/html',
                        'Cache-Control': 'no-cache',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(html);
                    return;
                } else {
                    console.warn(`⚠️ Particle Auth HTML not found at: ${particleAuthPath}`);
                }
            }
            // Handle /particle-auth/assets/* (serve static assets)
            else if (urlPath.startsWith('/particle-auth/assets/')) {
                const assetPath = urlPath.replace('/particle-auth', '');
                const fullPath = path.join(particleAuthDir, assetPath);
                const safePath = path.normalize(fullPath);
                
                // Security: ensure path is within particleAuthDir
                if (safePath.startsWith(path.normalize(particleAuthDir)) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
                    const ext = path.extname(safePath).toLowerCase();
                    const mimeTypes = {
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
                        'Cache-Control': 'no-cache',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(fileContent);
                    return;
                }
            }
        }
        
        // If not an API path, try to serve static file
        if (!isApiPath && fs.existsSync(guiDistPath)) {
            let filePath = urlPath === '/' ? '/index.html' : urlPath;
            if (!filePath.startsWith('/')) filePath = '/' + filePath;
            
            // For SPA routing, serve index.html for non-file paths
            const fullPath = path.join(guiDistPath, filePath);
            const safePath = path.normalize(fullPath);
            
            // Security: ensure path is within guiDistPath
            if (!safePath.startsWith(path.normalize(guiDistPath))) {
                // Path traversal attempt - fall through to API handler
            } else if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
                // Serve static file
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
                    '.ico': 'image/x-icon',
                    '.xml': 'application/xml',
                    '.txt': 'text/plain',
                };
                
                const contentType = mimeTypes[ext] || 'application/octet-stream';
                const fileContent = fs.readFileSync(safePath);
                
                res.writeHead(200, { 
                    'Content-Type': contentType,
                    'Cache-Control': 'no-cache',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(fileContent);
                return;
            } else if (fs.existsSync(safePath) && fs.statSync(safePath).isDirectory()) {
                // Try index.html in directory
                const indexPath = path.join(safePath, 'index.html');
                if (fs.existsSync(indexPath)) {
                    const fileContent = fs.readFileSync(indexPath);
                    res.writeHead(200, { 
                        'Content-Type': 'text/html',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(fileContent);
                    return;
                }
            }
            
            // SPA fallback: serve generated index.html for all non-API routes
            // This allows client-side routing to work
            // Always generate HTML on-the-fly (build process doesn't create index.html)
            const indexHtml = generateProductionHtml();
            res.writeHead(200, { 
                'Content-Type': 'text/html',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(indexHtml);
            return;
        }
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
        // Debug logging for move endpoint
        if (path === '/move' || path.includes('move')) {
            console.log(`   🔍 MOVE REQUEST DEBUG - path: "${path}", method: "${method}", data type: ${typeof data}, data keys:`, data ? Object.keys(data) : 'null');
        }
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
    // OLD /whoami endpoint - REMOVED (duplicate, using new one at line ~3761)
    // This old endpoint was returning 401 for unauthenticated users, blocking the UI
    // The new endpoint returns unauthenticated state (username: null) to allow login UI
    
    // /stat - Get file/folder info (Puter format)
    if (path === '/stat' && (method === 'GET' || method === 'POST')) {
        // Get path from query params (GET) or body (POST)
        const url = new URL(req.url, `http://localhost:${PORT}`);
        let filePath = data.path || data.file || data.subject || url.searchParams.get('path') || url.searchParams.get('file') || '/';
        
        // Get auth token (from header or body)
        const authHeader = req.headers['authorization'];
        let token = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        } else if (data.auth_token) {
            token = data.auth_token;
        }
        
        // Handle ~ (home directory) or paths starting with truncated wallet address
        if (token) {
            const session = nodeState.sessions.get(token);
            if (session && session.wallet) {
                // Replace ~ with full wallet address
                if (filePath.startsWith('~')) {
                    filePath = filePath.replace('~', `/${session.wallet}`);
                }
                // Also handle truncated wallet addresses like /0x34da...3dc3
                // Match pattern: /0x[0-9a-f]{4}...[0-9a-f]{4}
                const truncatedPattern = /^\/0x[0-9a-f]{4}\.\.\.[0-9a-f]{4}/i;
                if (truncatedPattern.test(filePath)) {
                    filePath = filePath.replace(truncatedPattern, `/${session.wallet}`);
                    console.log(`   Replaced truncated wallet address with full: ${filePath}`);
                }
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
        
        // Ensure user home directory exists if path starts with wallet address
        // Token was already extracted above, reuse it
        if (token) {
            const session = nodeState.sessions.get(token);
            if (session && session.wallet) {
                ensureUserHomeDirectory(session.wallet);
                // Also check if path starts with wallet address (even if not using ~)
                const pathParts = normalizedPath.split('/').filter(Boolean);
                if (pathParts.length > 0 && pathParts[0].toLowerCase() === session.wallet.toLowerCase()) {
                    ensureUserHomeDirectory(session.wallet);
                }
            }
        }
        
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
        
        // Determine if folder is public (only "Public" folder should be shared)
        const isPublic = normalizedPath.includes('/Public') && normalizedPath.split('/').pop() === 'Public';
        
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
            is_public: isPublic, // Only Public folder should be marked as public/shared
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
        
        // Special case: .__puter_gui.json - return empty object even without auth
        // This allows Puter GUI to initialize properly
        // NOTE: Puter backend returns 'application/octet-stream' for /read endpoint
        // The SDK uses responseType='blob' and expects to call .text() on the blob
        if (filePath === '~/.__puter_gui.json' || filePath.endsWith('.__puter_gui.json')) {
            console.log(`\n📖 READ (Puter): ${filePath} - Returning empty config for .__puter_gui.json`);
            const emptyConfig = '{}';
            res.writeHead(200, { 
                'Content-Type': 'application/octet-stream', // Match Puter backend format
                'Content-Length': Buffer.byteLength(emptyConfig, 'utf8'),
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            });
            return res.end(emptyConfig);
        }
        
        // Handle ~ (home directory)
        const authHeader = req.headers['authorization'];
        let walletAddress = null;
        if (filePath.startsWith('~')) {
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                const session = nodeState.sessions.get(token);
                if (session && session.wallet) {
                    walletAddress = session.wallet;
                    filePath = filePath.replace('~', `/${session.wallet}`);
                }
            }
            // If no auth header but path starts with ~, we can't resolve the path
            // Return proper error that SDK will handle
            if (!walletAddress && filePath.startsWith('~/')) {
                console.log(`\n📖 READ (Puter): ${filePath} - No auth header, cannot resolve ~ path`);
                res.writeHead(404, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                return res.end(JSON.stringify({ error: { code: 'subject_does_not_exist', message: 'File not found' } }));
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
            // Return proper error code that SDK expects for missing files
            console.warn(`   ⚠️  File not found at: ${normalizedPath}`);
            res.writeHead(404, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            return res.end(JSON.stringify({ error: { code: 'subject_does_not_exist', message: 'File not found' } }));
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
        
        // Get auth token (from header or body)
        const authHeader = req.headers['authorization'];
        let token = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        } else if (data.auth_token) {
            token = data.auth_token;
        }
        
        // Handle ~ (home directory) or paths starting with truncated wallet address
        if (token) {
            const session = nodeState.sessions.get(token);
            if (session && session.wallet) {
                console.log(`   🔍 Checking path replacement for: ${dirPath}, wallet: ${session.wallet}`);
                // Replace ~ with full wallet address
                if (dirPath.startsWith('~')) {
                    dirPath = dirPath.replace('~', `/${session.wallet}`);
                    console.log(`   ✅ Replaced ~ with wallet: ${dirPath}`);
                }
                // Also handle truncated wallet addresses like /0x34da...3dc3
                // Match pattern: /0x[0-9a-f]{4}...[0-9a-f]{4}
                const truncatedPattern = /^\/0x[0-9a-f]{4}\.\.\.[0-9a-f]{4}/i;
                console.log(`   🔍 Testing truncated pattern on: ${dirPath}, matches: ${truncatedPattern.test(dirPath)}`);
                if (truncatedPattern.test(dirPath)) {
                    const oldPath = dirPath;
                    dirPath = dirPath.replace(truncatedPattern, `/${session.wallet}`);
                    console.log(`   ✅ Replaced truncated wallet address: ${oldPath} -> ${dirPath}`);
                }
            } else {
                console.warn(`   ⚠️  No session or wallet. Token: ${token ? token.substring(0, 8) + '...' : 'null'}, Session: ${session ? 'exists' : 'null'}`);
            }
        } else {
            console.warn(`   ⚠️  No token found for path replacement`);
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
        // Token was already extracted above in the path replacement section, reuse it
        if (token) {
            const session = nodeState.sessions.get(token);
            if (session && session.wallet) {
                console.log(`   🔑 Session wallet: ${session.wallet}`);
                ensureUserHomeDirectory(session.wallet);
                // Verify directory was created
                const homePath = `/${session.wallet}`;
                const homeNode = getNode(nodeState.filesystem, homePath);
                if (homeNode) {
                    console.log(`   ✅ Home directory exists: ${homePath}`);
                    console.log(`   📁 Home directory children:`, Object.keys(homeNode.children || {}));
                } else {
                    console.warn(`   ⚠️  Home directory NOT found after ensureUserHomeDirectory: ${homePath}`);
                }
            } else {
                console.warn(`   ⚠️  No session or wallet in session. Session:`, session ? 'exists' : 'null', 'Token:', token.substring(0, 8) + '...');
            }
        } else {
            console.warn(`   ⚠️  No auth token found (checked header and body)`);
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
            
            // For Trash items, display original_name if available (for restore functionality)
            const displayName = (normalizedPath.includes('/Trash') && child.original_name) 
                ? child.original_name 
                : name;
            
            // Only "Public" folder should be marked as public/shared
            const isPublic = name === 'Public' && child.type === 'dir';
            
            entries.push({
                id: child.id || Math.floor(Math.random() * 10000),
                uid: child.uuid || `uuid-${childPath.replace(/\//g, '-')}`,
                uuid: child.uuid || `uuid-${childPath.replace(/\//g, '-')}`,
                name: displayName, // Use original_name in Trash, otherwise use actual name
                path: childPath,
                is_dir: child.type === 'dir',
                is_empty: child.type === 'dir' ? Object.keys(child.children || {}).length === 0 : false,
                size: child.size || 0,
                created: child.created ? new Date(child.created).toISOString() : new Date().toISOString(),
                modified: child.modified ? new Date(child.modified).toISOString() : new Date().toISOString(),
                type: child.mimeType || (child.type === 'dir' ? null : 'application/octet-stream'),
                is_public: isPublic, // Only Public folder should be marked as public/shared
                // Include restore metadata if in Trash
                ...(normalizedPath.includes('/Trash') && child.original_name ? {
                    original_name: child.original_name,
                    original_path: child.original_path,
                    trashed_ts: child.trashed_ts,
                } : {}),
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
        console.log(`\n📁 MKDIR (Puter) REQUEST - path: ${path}, method: ${method}`);
        console.log(`   Data keys:`, Object.keys(data || {}));
        console.log(`   Data:`, JSON.stringify(data).substring(0, 300));
        
        // Puter's validation: path is required
        if (data.path === undefined) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: 'path is required' }));
        }
        if (data.path === '' || data.path === null) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: data.path === '' ? 'path cannot be empty' : 'path cannot be null' }));
        }
        if (typeof data.path !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: 'path must be a string' }));
        }
        
        // Get session and ensure user home directory exists (like readdir does)
        const authHeader = req.headers['authorization'];
        let session = null;
        let walletAddress = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            session = nodeState.sessions.get(token);
            if (session && session.wallet) {
                walletAddress = session.wallet;
                ensureUserHomeDirectory(walletAddress);
            }
        }
        
        const dirPath = data.path;
        const parentPath = data.parent;
        const createMissingParents = data.create_missing_parents ?? data.create_missing_ancestors ?? false;
        const overwrite = data.overwrite ?? false;
        const dedupeName = data.dedupe_name ?? data.change_name ?? false;
        
        // Puter normalizes: if parent is not provided, extract it from path
        // This matches Puter's behavior in hl_mkdir.js lines 273-276
        let requestedPath = dirPath;
        let normalizedPath;
        let targetName;
        let actualParentPath;
        
        if (parentPath) {
            // Parent + name format (e.g., parent: "/Documents", path: "NewFolder")
            actualParentPath = parentPath.startsWith('/') ? parentPath : '/' + parentPath;
            targetName = dirPath; // In this case, path is the name
            normalizedPath = actualParentPath === '/' ? `/${targetName}` : `${actualParentPath}/${targetName}`;
        } else {
            // Full path format (e.g., path: "/Documents/NewFolder")
            // Extract parent and basename like Puter does
            normalizedPath = dirPath.startsWith('/') ? dirPath : '/' + dirPath;
            const pathParts = normalizedPath.split('/').filter(p => p);
            targetName = pathParts.pop();
            actualParentPath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
        }
        
        // Handle ~ (home directory) and wallet-relative paths
        if (walletAddress) {
            // Replace ~ with wallet address in full path
            if (normalizedPath.startsWith('~/')) {
                normalizedPath = normalizedPath.replace('~/', `/${walletAddress}/`);
                const pathParts = normalizedPath.split('/').filter(p => p);
                targetName = pathParts.pop();
                actualParentPath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
            }
            // Replace ~ with wallet address in parent path
            if (actualParentPath.startsWith('~/')) {
                actualParentPath = actualParentPath.replace('~/', `/${walletAddress}/`);
                normalizedPath = `${actualParentPath}/${targetName}`;
            }
            // If path is relative (doesn't start with /), assume it's relative to wallet home
            if (!normalizedPath.startsWith('/')) {
                normalizedPath = `/${walletAddress}/${normalizedPath}`;
                const pathParts = normalizedPath.split('/').filter(p => p);
                targetName = pathParts.pop();
                actualParentPath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
            }
            // If path starts with / but doesn't include wallet address, prepend wallet address
            // (e.g., "/Desktop/NewFolder" -> "/{wallet}/Desktop/NewFolder")
            else if (normalizedPath.startsWith('/') && !normalizedPath.startsWith(`/${walletAddress}/`)) {
                // Check if it's a standard directory name (Desktop, Documents, etc.)
                const firstPart = normalizedPath.split('/').filter(p => p)[0];
                const standardDirs = ['Desktop', 'Documents', 'Public', 'Pictures', 'Videos', 'Trash'];
                if (standardDirs.includes(firstPart)) {
                    normalizedPath = `/${walletAddress}${normalizedPath}`;
                    const pathParts = normalizedPath.split('/').filter(p => p);
                    targetName = pathParts.pop();
                    actualParentPath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
                }
            }
        }
        
        // Normalize paths
        normalizedPath = normalizedPath.replace(/\/+/g, '/');
        actualParentPath = actualParentPath.replace(/\/+/g, '/');
        
        console.log(`   📁 MKDIR: Creating "${targetName}" in parent "${actualParentPath}" → "${normalizedPath}"`);
        
        // Track which parent directories already existed BEFORE creation
        const parentDirsCreated = [];
        const pathParts = normalizedPath.split('/').filter(p => p);
        
        // Check which parent directories already existed (before ensureDir)
        const existingParents = new Set();
        let currentPath = '/';
        for (let i = 0; i < pathParts.length - 1; i++) {
            currentPath = currentPath === '/' ? `/${pathParts[i]}` : `${currentPath}/${pathParts[i]}`;
            const existingNode = getNode(nodeState.filesystem, currentPath);
            if (existingNode) {
                existingParents.add(currentPath);
            }
        }
        
        // Check if directory already exists
        const existingDir = getNode(nodeState.filesystem, normalizedPath);
        if (existingDir && existingDir.type === 'dir') {
            if (overwrite) {
                // Overwrite: remove existing directory first
                const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '/';
                const parent = getNode(nodeState.filesystem, parentPath);
                if (parent && parent.children) {
                    delete parent.children[targetName];
                }
            } else if (dedupeName) {
                // Dedupe: add number suffix
                const lastDot = targetName.lastIndexOf('.');
                const hasExtension = lastDot > 0;
                const baseName = hasExtension ? targetName.substring(0, lastDot) : targetName;
                const extension = hasExtension ? targetName.substring(lastDot) : '';
                
                let counter = 1;
                let newDirName;
                do {
                    newDirName = `${baseName} (${counter})${extension}`;
                    counter++;
                } while (getNode(nodeState.filesystem, (normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '/') + '/' + newDirName) && counter < 1000);
                
                targetName = newDirName;
                normalizedPath = (normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '/') + '/' + newDirName;
                requestedPath = normalizedPath;
            } else {
                // Already exists and no overwrite/dedupe - return error
                res.writeHead(409, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Directory already exists' }));
            }
        }
        
        // Create the directory and all parents
        ensureDir(nodeState.filesystem, normalizedPath);
        
        // Now check which parents were created (those that didn't exist before)
        currentPath = '/';
        for (let i = 0; i < pathParts.length - 1; i++) {
            currentPath = currentPath === '/' ? `/${pathParts[i]}` : `${currentPath}/${pathParts[i]}`;
            if (!existingParents.has(currentPath)) {
                // This parent was created - add to parent_dirs_created
                const createdNode = getNode(nodeState.filesystem, currentPath);
                if (createdNode) {
                    parentDirsCreated.push({
                        id: Math.floor(Math.random() * 10000),
                        uid: createdNode.uuid || `uuid-${currentPath.replace(/\//g, '-')}`,
                        uuid: createdNode.uuid || `uuid-${currentPath.replace(/\//g, '-')}`,
                        name: pathParts[i],
                        path: currentPath,
                        is_dir: true,
                        is_empty: Object.keys(createdNode.children || {}).length === 0,
                        size: 0,
                        created: new Date(createdNode.created || Date.now()).toISOString(),
                        modified: new Date(createdNode.modified || Date.now()).toISOString(),
                        type: null,
                    });
                }
            }
        }
        
        saveState();
        
        const node = getNode(nodeState.filesystem, normalizedPath);
        if (!node) {
            console.error(`   ❌ CRITICAL: Failed to create directory: ${normalizedPath}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Failed to create directory' }));
        }
        
        const nodeUuid = node.uuid || `uuid-${normalizedPath.replace(/\//g, '-')}`;
        
        // Puter format: entry + parent_dirs_created + requested_path
        // Match the format returned by readdir for consistency
        const response = {
            id: Math.floor(Math.random() * 10000),
            uid: nodeUuid,
            uuid: nodeUuid,
            name: targetName,
            path: normalizedPath,
            is_dir: true,
            is_empty: Object.keys(node.children || {}).length === 0,
            size: 0,
            created: new Date(node.created || Date.now()).toISOString(),
            modified: new Date(node.modified || Date.now()).toISOString(),
            createdAt: new Date(node.created || Date.now()).toISOString(),
            updatedAt: new Date(node.modified || Date.now()).toISOString(),
            type: null,
            mimeType: null,
            parent_dirs_created: parentDirsCreated, // Array of created parent directories
            requested_path: requestedPath, // Original requested path
        };
        
        console.log(`   ✅ MKDIR successful: ${normalizedPath}, parent_dirs_created: ${parentDirsCreated.length}`);
        console.log(`   📤 Sending response:`, JSON.stringify(response, null, 2).substring(0, 500));
        
        // Emit socket events for real-time updates (like Puter does)
        if (session && walletAddress) {
                const parentDirPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '/';
                
                // Emit item.added for the created directory
                emitSocketEvent('item.added', {
                    id: response.id,
                    uid: response.uuid,
                    uuid: response.uuid,
                    name: response.name,
                    path: response.path,
                    is_dir: true,
                    is_empty: response.is_empty,
                    size: 0,
                    created: response.created,
                    modified: response.modified,
                    type: null,
                    dirpath: parentDirPath,
                    original_client_socket_id: data.original_client_socket_id || null,
                }, session.wallet);
                
                console.log(`   📡 Emitted item.added for: ${response.path}`);
                
                // Also emit for any parent directories that were created
                for (const parentEntry of parentDirsCreated) {
                    const parentDirPathForParent = parentEntry.path.substring(0, parentEntry.path.lastIndexOf('/')) || '/';
                    emitSocketEvent('item.added', {
                        ...parentEntry,
                        dirpath: parentDirPathForParent,
                        original_client_socket_id: data.original_client_socket_id || null,
                    }, session.wallet);
                    console.log(`   📡 Emitted item.added for parent: ${parentEntry.path}`);
                }
            } else {
                console.warn(`   ⚠️  No session found for token, skipping socket events`);
            }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(response));
    }
    
    // /delete - Delete file/folder (Puter format)
    if (path === '/delete' && method === 'POST') {
        console.log(`\n🗑️  DELETE (Puter) REQUEST - path: ${path}, method: ${method}`);
        console.log(`   Data keys:`, Object.keys(data || {}));
        console.log(`   Data:`, JSON.stringify(data).substring(0, 300));
        
        const paths = data.paths;
        if (!paths || !Array.isArray(paths)) {
            console.warn(`   ⚠️  Invalid paths parameter:`, paths);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'paths must be an array' }));
        }
        
        // Get session to find user's Trash directory
        const authHeader = req.headers['authorization'];
        let trashPath = null;
        let token = null;
        let session = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
            session = nodeState.sessions.get(token);
            if (session && session.wallet) {
                ensureUserHomeDirectory(session.wallet);
                trashPath = `/${session.wallet}/Trash`;
            }
        }
        
        console.log(`   🗑️  DELETE: Processing ${paths.length} path(s): ${paths.join(', ')}`);
        
        for (const targetPath of paths) {
            if (!targetPath || targetPath === '/') {
                console.warn(`   ⚠️  Skipping invalid path: ${targetPath}`);
                continue;
            }
            
            // Handle UUID-based paths (Puter uses UUIDs for file identification)
            let actualPath = targetPath;
            let targetNode = null;
            
            if (targetPath.startsWith('uuid-') || targetPath.includes('uuid-')) {
                console.log(`   🔍 Path is UUID: ${targetPath}`);
                const uuidResult = findNodeByUuid(nodeState.filesystem, targetPath);
                if (!uuidResult.node || !uuidResult.path) {
                    console.warn(`   ⚠️  File not found by UUID: ${targetPath}`);
                    continue; // Skip this path, continue with others
                }
                targetNode = uuidResult.node;
                actualPath = uuidResult.path;
                console.log(`   ✅ Resolved UUID to path: ${actualPath}`);
            }
            
            // Use actualPath (resolved from UUID if needed)
            const normalizedPath = actualPath.startsWith('/') ? actualPath : '/' + actualPath;
            
            // Don't delete if already in Trash (permanent delete)
            if (normalizedPath.includes('/Trash/')) {
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
                const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '/';
                const name = normalizedPath.split('/').pop();
                const sourceParent = getNode(nodeState.filesystem, parentPath);
                
                console.log(`   📂 Attempting to delete: ${normalizedPath} (parent: ${parentPath}, name: ${name})`);
                
                if (!sourceParent) {
                    console.warn(`   ⚠️  Parent directory not found: ${parentPath}`);
                    continue;
                }
                
                if (!sourceParent.children) {
                    console.warn(`   ⚠️  Parent has no children: ${parentPath}`);
                    continue;
                }
                
                if (!sourceParent.children[name]) {
                    console.warn(`   ⚠️  File/folder not found: ${name} in ${parentPath}`);
                    continue;
                }
                
                if (sourceParent.children[name]) {
                    const trashNode = getNode(nodeState.filesystem, trashPath);
                    if (trashNode && trashNode.type === 'dir') {
                        const sourceNode = sourceParent.children[name];
                        
                        // Check if file with same name already exists in Trash
                        // If so, add timestamp suffix to make it unique
                        let trashFileName = name;
                        if (trashNode.children && trashNode.children[name]) {
                            // File with same name exists, add timestamp suffix
                            const lastDot = name.lastIndexOf('.');
                            const hasExtension = lastDot > 0;
                            const baseName = hasExtension ? name.substring(0, lastDot) : name;
                            const extension = hasExtension ? name.substring(lastDot) : '';
                            const timestamp = Date.now();
                            trashFileName = `${baseName} (${timestamp})${extension}`;
                        }
                        
                        // Move file to Trash - keep original name visible, store metadata for restore
                        trashNode.children[trashFileName] = {
                            ...sourceNode,
                            name: trashFileName, // Display name in Trash (may have timestamp if duplicate)
                            // Store original metadata for restore
                            original_name: name, // Original filename (for restore)
                            original_path: normalizedPath, // Original location (for restore)
                            trashed_ts: Math.round(Date.now() / 1000), // Timestamp when deleted
                        };
                        
                        delete sourceParent.children[name];
                        console.log(`   ✅ Moved to Trash: ${name} → ${trashFileName} (original_name: ${name})`);
                        
                        // Emit socket events for real-time updates
                        if (session) {
                            const trashItemPath = `${trashPath}/${trashFileName}`;
                            
                            // Emit item.removed from original location
                            emitSocketEvent('item.removed', {
                                path: normalizedPath,
                                descendants_only: false
                            }, session.wallet);
                            
                            // Emit item.added to Trash - use original_name for display
                            const trashEntry = {
                                id: Math.floor(Math.random() * 10000),
                                uid: sourceNode.uuid,
                                uuid: sourceNode.uuid,
                                name: name, // Display original name in Trash (not the unique filename)
                                path: trashItemPath,
                                is_dir: sourceNode.type === 'dir',
                                is_empty: sourceNode.type === 'dir' ? Object.keys(sourceNode.children || {}).length === 0 : false,
                                size: sourceNode.size || 0,
                                created: sourceNode.created ? new Date(sourceNode.created).toISOString() : new Date().toISOString(),
                                modified: sourceNode.modified ? new Date(sourceNode.modified).toISOString() : new Date().toISOString(),
                                type: sourceNode.mimeType || (sourceNode.type === 'dir' ? null : 'application/octet-stream'),
                                dirpath: trashPath,
                                original_client_socket_id: null,
                                // Include metadata for restore functionality
                                original_name: name,
                                original_path: normalizedPath,
                                trashed_ts: Math.round(Date.now() / 1000),
                            };
                            
                            emitSocketEvent('item.added', trashEntry, session.wallet);
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
    
    // /rename - Rename file/folder (Puter format)
    if (path === '/rename' && method === 'POST') {
        console.log(`\n✏️  RENAME (Puter) REQUEST - path: ${path}, method: ${method}`);
        console.log(`   Data keys:`, Object.keys(data || {}));
        console.log(`   Data:`, JSON.stringify(data).substring(0, 300));
        
        // Puter rename endpoint expects: path (or uid) and new_name
        const filePath = data.path || data.uid;
        const newName = data.new_name;
        
        if (!filePath) {
            console.warn(`   ⚠️  Missing path/uid parameter`);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'path or uid is required' }));
        }
        
        if (!newName) {
            console.warn(`   ⚠️  Missing new_name parameter`);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'new_name is required' }));
        }
        
        if (typeof newName !== 'string') {
            console.warn(`   ⚠️  new_name must be a string`);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'new_name must be a string' }));
        }
        
        // Validate filename (basic validation - no slashes, null bytes, etc.)
        if (newName.includes('/') || newName.includes('\0') || newName.trim() === '') {
            console.warn(`   ⚠️  Invalid filename: ${newName}`);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Invalid filename' }));
        }
        
        // Handle UUID-based path
        let targetPath = null;
        let targetNode = null;
        let targetParent = null;
        let targetName = null;
        let targetParentPath = null;
        
        if (filePath.startsWith('uuid-') || filePath.includes('uuid-')) {
            // Path is a UUID - find the file by UUID
            console.log(`   🔍 Path is UUID: ${filePath}`);
            const uuidResult = findNodeByUuid(nodeState.filesystem, filePath);
            if (!uuidResult.node || !uuidResult.path) {
                console.warn(`   ⚠️  File not found by UUID: ${filePath}`);
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'File not found by UUID' }));
            }
            targetNode = uuidResult.node;
            targetPath = uuidResult.path;
            targetName = targetPath.split('/').pop();
            targetParentPath = targetPath.substring(0, targetPath.lastIndexOf('/')) || '/';
            targetParent = getNode(nodeState.filesystem, targetParentPath);
        } else {
            // Path is a regular path
            targetPath = filePath.startsWith('/') ? filePath : '/' + filePath;
            
            // Handle ~ (home directory)
            const authHeader = req.headers['authorization'];
            if (targetPath.startsWith('~') && authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                const session = nodeState.sessions.get(token);
                if (session && session.wallet) {
                    targetPath = targetPath.replace('~', `/${session.wallet}`);
                }
            }
            
            targetPath = targetPath.replace(/\/+/g, '/');
            targetNode = getNode(nodeState.filesystem, targetPath);
            targetName = targetPath.split('/').pop();
            targetParentPath = targetPath.substring(0, targetPath.lastIndexOf('/')) || '/';
            targetParent = getNode(nodeState.filesystem, targetParentPath);
        }
        
        if (!targetNode) {
            console.warn(`   ⚠️  File not found: ${targetPath}`);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'File not found' }));
        }
        
        if (!targetParent) {
            console.warn(`   ⚠️  Parent directory not found: ${targetParentPath}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Parent directory not found' }));
        }
        
        // Check if a file with the new name already exists in the same directory
        if (targetParent.children && targetParent.children[newName] && targetParent.children[newName] !== targetNode) {
            console.warn(`   ⚠️  File with name "${newName}" already exists in directory`);
            res.writeHead(409, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Item with same name already exists', entry_name: newName }));
        }
        
        const oldPath = targetPath;
        const newPath = targetParentPath === '/' ? `/${newName}` : `${targetParentPath}/${newName}`;
        
        console.log(`   ✏️  RENAME: ${oldPath} → ${newPath}`);
        
        // Update the node's name and path
        targetNode.name = newName;
        targetNode.path = newPath;
        targetNode.modified = Date.now();
        
        // Move the node in the parent's children object
        if (targetParent.children) {
            // Remove old entry
            delete targetParent.children[targetName];
            // Add new entry with new name
            targetParent.children[newName] = targetNode;
            
            // If it's a directory, update all children's paths recursively
            if (targetNode.type === 'dir' && targetNode.children) {
                function updateChildPaths(node, oldParentPath, newParentPath) {
                    node.path = newParentPath === '/' ? `/${node.name}` : `${newParentPath}/${node.name}`;
                    if (node.children) {
                        for (const child of Object.values(node.children)) {
                            updateChildPaths(child, oldParentPath, newParentPath);
                        }
                    }
                }
                for (const child of Object.values(targetNode.children)) {
                    updateChildPaths(child, oldPath, newPath);
                }
            }
        }
        
        saveState();
        
        // Build response matching Puter's format
        const nodeUuid = targetNode.uuid || `uuid-${newPath.replace(/\//g, '-')}`;
        const mime = require('mime-types');
        const contentType = mime.contentType(newName);
        
        const response = {
            uid: nodeUuid,
            name: newName,
            is_dir: targetNode.type === 'dir',
            path: newPath,
            old_path: oldPath,
            type: contentType || null,
            associated_app: {}, // Mock server doesn't track apps
            original_client_socket_id: data.original_client_socket_id || null,
        };
        
        console.log(`   ✅ RENAME successful: ${oldPath} → ${newPath}`);
        
        // Emit socket event for real-time updates (Puter uses 'item.renamed', not 'item.added')
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const session = nodeState.sessions.get(token);
            if (session) {
                emitSocketEvent('item.renamed', response, session.wallet);
                console.log(`   📡 Emitted item.renamed for: ${newPath}`);
            }
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(response));
    }
    
    // /move - Move file/folder (Puter format)
    if (path === '/move' && method === 'POST') {
        console.log(`\n🔄 MOVE (Puter) REQUEST - path: ${path}, method: ${method}`);
        console.log(`   Data keys:`, Object.keys(data || {}));
        console.log(`   Data:`, JSON.stringify(data).substring(0, 300));
        
        // Support both parameter formats: Puter uses 'source'/'dest', but also check 'from'/'to'
        const source = data.source || data.from;
        const dest = data.destination || data.dest || data.to;
        const new_name = data.new_name || data.name;
        
        if (!source) {
            console.warn(`   ⚠️  Missing source parameter. Data keys:`, Object.keys(data || {}));
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'source is required' }));
        }
        
        // Handle ~ (home directory)
        const authHeader = req.headers['authorization'];
        
        // Check if source is a UUID (Puter uses UUIDs for file identification)
        let srcPath = null;
        let srcNode = null;
        let srcParent = null;
        let srcName = null;
        let srcParentPath = null;
        
        if (source.startsWith('uuid-') || source.includes('uuid-')) {
            // Source is a UUID - need to find the file by UUID
            console.log(`   🔍 Source is UUID: ${source}`);
            const uuidResult = findNodeByUuid(nodeState.filesystem, source);
            if (!uuidResult.node || !uuidResult.path) {
                console.warn(`   ⚠️  File not found by UUID: ${source}`);
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Source file not found by UUID' }));
            }
            srcNode = uuidResult.node;
            srcPath = uuidResult.path;
            srcParentPath = srcPath.substring(0, srcPath.lastIndexOf('/')) || '/';
            srcName = srcPath.split('/').pop();
            srcParent = getNode(nodeState.filesystem, srcParentPath);
            console.log(`   ✅ Found file by UUID: ${srcPath}`);
        } else {
            // Source is a path
            srcPath = source.startsWith('/') ? source : '/' + source;
            if (srcPath.startsWith('~') && authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                const session = nodeState.sessions.get(token);
                if (session && session.wallet) {
                    srcPath = srcPath.replace('~', `/${session.wallet}`);
                }
            }
            
            // Normalize path
            srcPath = srcPath.replace(/\/+/g, '/');
            
            // Get source node
            srcParentPath = srcPath.substring(0, srcPath.lastIndexOf('/')) || '/';
            srcName = srcPath.split('/').pop();
            srcParent = getNode(nodeState.filesystem, srcParentPath);
            
            if (!srcParent) {
                console.warn(`   ⚠️  Source parent not found: ${srcParentPath}`);
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Source parent not found' }));
            }
            
            if (!srcParent.children || !srcParent.children[srcName]) {
                console.warn(`   ⚠️  Source not found: ${srcName} in ${srcParentPath}`);
                console.warn(`   ⚠️  Available children:`, Object.keys(srcParent.children || {}));
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Source not found' }));
            }
            
            srcNode = srcParent.children[srcName];
        }
        
        // RESTORE DETECTION: If source is in Trash, always use original_name for the filename
        // This handles both drag-and-drop restore and explicit restore
        const isFromTrash = srcPath.includes('/Trash/') && srcNode && srcNode.original_name;
        
        // Handle destination
        let destPath = dest ? (dest.startsWith('/') ? dest : '/' + dest) : srcPath.substring(0, srcPath.lastIndexOf('/')) || '/';
        if (destPath.startsWith('~') && authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const session = nodeState.sessions.get(token);
            if (session && session.wallet) {
                destPath = destPath.replace('~', `/${session.wallet}`);
            }
        }
        
        // Normalize destination path
        destPath = destPath.replace(/\/+/g, '/');
        
        // If moving from Trash, use original_name (unless new_name is explicitly provided)
        if (isFromTrash && !new_name) {
            new_name = srcNode.original_name;
            console.log(`   ♻️  RESTORE: Using original_name "${new_name}" from Trash metadata`);
        }
        
        console.log(`   🔄 MOVE: ${srcPath} → ${destPath}${new_name ? ' (rename to: ' + new_name + ')' : ''}${isFromTrash ? ' [FROM TRASH]' : ''}`);
        
        // Ensure destination parent exists
        ensureDir(nodeState.filesystem, destPath);
        const destParent = getNode(nodeState.filesystem, destPath);
        
        if (!destParent) {
            console.warn(`   ⚠️  Failed to create/get destination parent: ${destPath}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Failed to create destination' }));
        }
        
        // Move the node
        // If from Trash, prefer original_name over srcName (which is the UUID trash filename)
        let finalName = new_name || (isFromTrash ? (srcNode.original_name || srcName) : srcName);
        
        // Handle duplicate names - add number suffix like macOS (same as upload handler)
        if (destParent.children && destParent.children[finalName]) {
            console.log(`   📝 File "${finalName}" already exists in destination, adding number suffix`);
            // Extract name and extension
            const lastDot = finalName.lastIndexOf('.');
            const hasExtension = lastDot > 0;
            const baseName = hasExtension ? finalName.substring(0, lastDot) : finalName;
            const extension = hasExtension ? finalName.substring(lastDot) : '';
            
            // Find the next available number
            let counter = 1;
            let newFileName;
            do {
                newFileName = `${baseName} (${counter})${extension}`;
                counter++;
            } while (destParent.children[newFileName] && counter < 1000); // Safety limit
            
            console.log(`   📝 Using name: "${newFileName}"`);
            finalName = newFileName;
        }
        
        // Perform the move
        if (!destParent.children) {
            destParent.children = {};
        }
        
        // Calculate final path before moving
        const finalPath = destPath === '/' ? `/${finalName}` : `${destPath}/${finalName}`;
        
        // Ensure srcNode has all required properties with defaults
        const nodeUuid = srcNode.uuid || `uuid-${finalPath.replace(/\//g, '-')}`;
        const nodeType = srcNode.type || 'file';
        const nodeSize = srcNode.size || 0;
        const nodeCreated = srcNode.created || Date.now();
        const nodeMimeType = srcNode.mimeType || (nodeType === 'dir' ? null : 'application/octet-stream');
        
        // Move the node (preserve all properties with safe defaults)
        const movedNode = {
            ...srcNode,
            name: finalName, // Always use the new name
            path: finalPath, // Update path
            uuid: nodeUuid, // Preserve or set UUID
            type: nodeType, // Ensure type exists
            size: nodeSize, // Ensure size exists
            created: nodeCreated, // Preserve created timestamp
            modified: Date.now(), // Update modified timestamp
            mimeType: nodeMimeType, // Ensure mimeType exists
            // Preserve children if it's a directory
            ...(nodeType === 'dir' && srcNode.children ? { children: srcNode.children } : {}),
            // Preserve content if it's a file
            ...(nodeType === 'file' && srcNode.content !== undefined ? { content: srcNode.content } : {}),
            // Preserve isBase64 flag if it exists
            ...(srcNode.isBase64 !== undefined ? { isBase64: srcNode.isBase64 } : {}),
        };
        
        // If moving from Trash, clean trash metadata (whether auto-restore or drag-and-drop)
        if (isFromTrash) {
            delete movedNode.original_name;
            delete movedNode.original_path;
            delete movedNode.trashed_ts;
            
            // Recursively clean trash metadata from directory children
            if (movedNode.type === 'dir' && movedNode.children) {
                function cleanTrashMetadata(node) {
                    delete node.original_name;
                    delete node.original_path;
                    delete node.trashed_ts;
                    if (node.children) {
                        for (const child of Object.values(node.children)) {
                            cleanTrashMetadata(child);
                        }
                    }
                }
                for (const child of Object.values(movedNode.children)) {
                    cleanTrashMetadata(child);
                }
            }
        }
        
        destParent.children[finalName] = movedNode;
        
        // Remove from source parent
        if (srcParent && srcParent.children && srcParent.children[srcName]) {
            delete srcParent.children[srcName];
        }
        
        // Emit socket events for real-time updates
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const session = nodeState.sessions.get(token);
            if (session) {
                // Emit item.removed from source
                emitSocketEvent('item.removed', {
                    path: srcPath,
                    descendants_only: false
                }, session.wallet);
                
                // Emit item.added to destination (must match Puter's format exactly)
                emitSocketEvent('item.added', {
                    id: Math.floor(Math.random() * 10000),
                    uid: movedNode.uuid,
                    uuid: movedNode.uuid,
                    name: finalName,
                    path: finalPath,
                    is_dir: movedNode.type === 'dir',
                    is_empty: movedNode.type === 'dir' ? Object.keys(movedNode.children || {}).length === 0 : false,
                    size: movedNode.size || 0,
                    created: movedNode.created ? new Date(movedNode.created).toISOString() : new Date().toISOString(),
                    modified: movedNode.modified ? new Date(movedNode.modified).toISOString() : new Date().toISOString(),
                    type: movedNode.mimeType || (movedNode.type === 'dir' ? null : 'application/octet-stream'),
                    dirpath: destPath, // Parent directory path (required by frontend)
                    original_client_socket_id: null
                }, session.wallet);
            }
        }
        
        saveState();
        
        console.log(`   ✅ Move successful: ${srcPath} → ${finalPath}`);
        
        // Return response in Puter's expected format (must match readdir entry format)
        if (!movedNode) {
            console.error(`   ❌ CRITICAL: movedNode is undefined after move!`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Internal error: moved node not found' }));
        }
        
        // Use the values we already set when creating the node (they're guaranteed to exist)
        const responseNodeType = movedNode.type || 'file';
        const responseNodeUuid = movedNode.uuid || `uuid-${finalPath.replace(/\//g, '-')}`;
        const responseNodeSize = movedNode.size || 0;
        const responseNodeCreated = movedNode.created || Date.now();
        const responseNodeModified = movedNode.modified || Date.now();
        const responseNodeMimeType = movedNode.mimeType || (responseNodeType === 'dir' ? null : 'application/octet-stream');
        const responseIsDir = responseNodeType === 'dir';
        const responseIsEmpty = responseIsDir ? Object.keys(movedNode.children || {}).length === 0 : false;
        
        // Puter's backend returns: { moved: <file entry>, old_path: <string>, overwritten: <entry|undefined>, parent_dirs_created: [] }
        // The moved entry should match readdir format (which works)
        const movedEntry = {
            id: movedNode.id || Math.floor(Math.random() * 10000),
            uid: responseNodeUuid,
            uuid: responseNodeUuid,
            name: finalName, // Always use finalName, not movedNode.name (which might be old)
            path: finalPath,
            is_dir: responseIsDir,
            is_empty: responseIsEmpty,
            size: responseNodeSize,
            created: new Date(responseNodeCreated).toISOString(),
            modified: new Date(responseNodeModified).toISOString(),
            // Use same type format as readdir (mimeType or null for dirs)
            type: responseNodeMimeType || (responseIsDir ? null : 'application/octet-stream'),
        };
        
        // Validate moved entry has all required fields
        if (!movedEntry.name || !movedEntry.path || movedEntry.uuid === undefined) {
            console.error(`   ❌ CRITICAL: Moved entry missing required fields:`, movedEntry);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Internal error: invalid response format' }));
        }
        
        // Return in Puter's exact format: { moved: <entry>, old_path: <string> }
        const response = {
            moved: movedEntry,
            old_path: srcPath,
        };
        
        // Log the full response for debugging
        console.log(`   📤 Sending response (Puter format):`, JSON.stringify(response, null, 2));
        console.log(`   📤 Moved entry has name:`, !!movedEntry.name, `name value:`, movedEntry.name);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(response));
    }
    
    // /copy - Copy file/folder (Puter format)
    if (path === '/copy' && method === 'POST') {
        console.log(`\n📋 COPY (Puter) REQUEST - path: ${path}, method: ${method}`);
        console.log(`   Data keys:`, Object.keys(data || {}));
        
        // Support both parameter formats: Puter uses 'source'/'destination'
        const source = data.source;
        const dest = data.destination || data.dest;
        const new_name = data.new_name || data.name;
        const overwrite = data.overwrite ?? false;
        const dedupe_name = data.dedupe_name ?? data.change_name ?? false;
        
        if (!source) {
            console.warn(`   ⚠️  Missing source parameter. Data keys:`, Object.keys(data || {}));
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'source is required' }));
        }
        
        // Handle ~ (home directory)
        const authHeader = req.headers['authorization'];
        
        // Check if source is a UUID (Puter uses UUIDs for file identification)
        let srcPath = null;
        let srcNode = null;
        let srcParent = null;
        let srcName = null;
        
        if (source.startsWith('uuid-') || source.includes('uuid-')) {
            // Source is a UUID - need to find the file by UUID
            console.log(`   🔍 Source is UUID: ${source}`);
            const uuidResult = findNodeByUuid(nodeState.filesystem, source);
            if (!uuidResult.node || !uuidResult.path) {
                console.warn(`   ⚠️  File not found by UUID: ${source}`);
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Source file not found by UUID' }));
            }
            srcNode = uuidResult.node;
            srcPath = uuidResult.path;
            srcName = srcPath.split('/').pop();
            srcParent = getNode(nodeState.filesystem, srcPath.substring(0, srcPath.lastIndexOf('/')) || '/');
            console.log(`   ✅ Found file by UUID: ${srcPath}`);
        } else {
            // Source is a path
            srcPath = source.startsWith('/') ? source : '/' + source;
            if (srcPath.startsWith('~') && authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                const session = nodeState.sessions.get(token);
                if (session && session.wallet) {
                    srcPath = srcPath.replace('~', `/${session.wallet}`);
                }
            }
            srcPath = srcPath.replace(/\/+/g, '/');
            srcNode = getNode(nodeState.filesystem, srcPath);
            if (!srcNode) {
                console.warn(`   ⚠️  Source not found: ${srcPath}`);
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Source file not found' }));
            }
            srcName = srcPath.split('/').pop();
            srcParent = getNode(nodeState.filesystem, srcPath.substring(0, srcPath.lastIndexOf('/')) || '/');
        }
        
        // Handle destination
        let destPath = dest ? (dest.startsWith('/') ? dest : '/' + dest) : srcPath.substring(0, srcPath.lastIndexOf('/')) || '/';
        if (destPath.startsWith('~') && authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const session = nodeState.sessions.get(token);
            if (session && session.wallet) {
                destPath = destPath.replace('~', `/${session.wallet}`);
            }
        }
        
        // Normalize destination path
        destPath = destPath.replace(/\/+/g, '/');
        
        console.log(`   📋 COPY: ${srcPath} → ${destPath}${new_name ? ' (rename to: ' + new_name + ')' : ''}`);
        
        // Ensure destination parent exists
        ensureDir(nodeState.filesystem, destPath);
        const destParent = getNode(nodeState.filesystem, destPath);
        
        if (!destParent) {
            console.warn(`   ⚠️  Failed to create/get destination parent: ${destPath}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Failed to create destination' }));
        }
        
        // Determine final name
        let finalName = new_name || srcName;
        
        // Handle duplicate names
        let overwritten = undefined;
        if (destParent.children && destParent.children[finalName]) {
            if (overwrite) {
                // Overwrite existing file
                overwritten = {
                    id: Math.floor(Math.random() * 10000),
                    uid: destParent.children[finalName].uuid || `uuid-${destPath}/${finalName}`.replace(/\//g, '-'),
                    uuid: destParent.children[finalName].uuid || `uuid-${destPath}/${finalName}`.replace(/\//g, '-'),
                    name: finalName,
                    path: destPath === '/' ? `/${finalName}` : `${destPath}/${finalName}`,
                    is_dir: destParent.children[finalName].type === 'dir',
                    is_empty: destParent.children[finalName].type === 'dir' ? Object.keys(destParent.children[finalName].children || {}).length === 0 : false,
                    size: destParent.children[finalName].size || 0,
                    created: new Date(destParent.children[finalName].created || Date.now()).toISOString(),
                    modified: new Date(destParent.children[finalName].modified || Date.now()).toISOString(),
                    type: destParent.children[finalName].mimeType || (destParent.children[finalName].type === 'dir' ? null : 'application/octet-stream'),
                };
                // Delete existing file
                delete destParent.children[finalName];
            } else if (dedupe_name) {
                // Add number suffix
                const lastDot = finalName.lastIndexOf('.');
                const hasExtension = lastDot > 0;
                const baseName = hasExtension ? finalName.substring(0, lastDot) : finalName;
                const extension = hasExtension ? finalName.substring(lastDot) : '';
                
                let counter = 1;
                let newFileName;
                do {
                    newFileName = `${baseName} (${counter})${extension}`;
                    counter++;
                } while (destParent.children[newFileName] && counter < 1000);
                
                finalName = newFileName;
            } else {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Destination already exists' }));
            }
        }
        
        // Perform the copy
        if (!destParent.children) {
            destParent.children = {};
        }
        
        // Calculate final path
        const finalPath = destPath === '/' ? `/${finalName}` : `${destPath}/${finalName}`;
        
        // Deep copy the node (recursive for directories)
        function deepCopyNode(node) {
            const copy = {
                ...node,
                name: finalName,
                path: finalPath,
                uuid: `uuid-${finalPath.replace(/\//g, '-')}`, // New UUID for copy
                modified: Date.now(),
            };
            
            if (node.type === 'dir' && node.children) {
                copy.children = {};
                for (const [childName, childNode] of Object.entries(node.children)) {
                    copy.children[childName] = deepCopyNode(childNode);
                }
            }
            
            return copy;
        }
        
        destParent.children[finalName] = deepCopyNode(srcNode);
        
        // Emit socket events for real-time updates
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const session = nodeState.sessions.get(token);
            if (session) {
                const copiedNode = destParent.children[finalName];
                emitSocketEvent('item.added', {
                    id: Math.floor(Math.random() * 10000),
                    uid: copiedNode.uuid,
                    uuid: copiedNode.uuid,
                    name: finalName,
                    path: finalPath,
                    is_dir: copiedNode.type === 'dir',
                    is_empty: copiedNode.type === 'dir' ? Object.keys(copiedNode.children || {}).length === 0 : false,
                    size: copiedNode.size || 0,
                    created: copiedNode.created ? new Date(copiedNode.created).toISOString() : new Date().toISOString(),
                    modified: copiedNode.modified ? new Date(copiedNode.modified).toISOString() : new Date().toISOString(),
                    type: copiedNode.mimeType || (copiedNode.type === 'dir' ? null : 'application/octet-stream'),
                    dirpath: destPath,
                    original_client_socket_id: null
                }, session.wallet);
            }
        }
        
        saveState();
        
        console.log(`   ✅ Copy successful: ${srcPath} → ${finalPath}`);
        
        // Puter's copy returns: [{ copied: <entry>, overwritten: <entry|undefined> }]
        const copiedNode = destParent.children[finalName];
        const copiedEntry = {
            id: Math.floor(Math.random() * 10000),
            uid: copiedNode.uuid,
            uuid: copiedNode.uuid,
            name: finalName,
            path: finalPath,
            is_dir: copiedNode.type === 'dir',
            is_empty: copiedNode.type === 'dir' ? Object.keys(copiedNode.children || {}).length === 0 : false,
            size: copiedNode.size || 0,
            created: new Date(copiedNode.created || Date.now()).toISOString(),
            modified: new Date(copiedNode.modified || Date.now()).toISOString(),
            type: copiedNode.mimeType || (copiedNode.type === 'dir' ? null : 'application/octet-stream'),
        };
        
        const response = [{
            copied: copiedEntry,
            overwritten: overwritten,
        }];
        
        console.log(`   📤 Sending response (Puter format):`, JSON.stringify(response, null, 2));
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(response));
    }
    
    // /restore - Restore file/folder from Trash (Puter format)
    // Note: Puter may use /move for restore, but we implement /restore for clarity
    if (path === '/restore' && method === 'POST') {
        console.log(`\n♻️  RESTORE (Puter) REQUEST - path: ${path}, method: ${method}`);
        
        const source = data.source || data.paths?.[0]; // Support both formats
        const destination = data.destination; // Optional - if not provided, use original_path
        
        if (!source) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'source is required' }));
        }
        
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Authentication required' }));
        }
        
        const token = authHeader.split(' ')[1];
        const session = nodeState.sessions.get(token);
        if (!session || !session.wallet) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Invalid session' }));
        }
        
        ensureUserHomeDirectory(session.wallet);
        const trashPath = `/${session.wallet}/Trash`;
        
        // Resolve source path (could be UUID or path)
        let srcPath = null;
        let srcNode = null;
        let srcParent = null;
        let srcName = null;
        
        if (source.startsWith('uuid-') || source.includes('uuid-')) {
            const uuidResult = findNodeByUuid(nodeState.filesystem, source);
            if (!uuidResult.node || !uuidResult.path) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Source file not found by UUID' }));
            }
            srcNode = uuidResult.node;
            srcPath = uuidResult.path;
            srcName = srcPath.split('/').pop();
            srcParent = getNode(nodeState.filesystem, srcPath.substring(0, srcPath.lastIndexOf('/')) || '/');
        } else {
            srcPath = source.startsWith('/') ? source : '/' + source;
            srcPath = srcPath.replace(/\/+/g, '/');
            srcNode = getNode(nodeState.filesystem, srcPath);
            if (!srcNode) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Source file not found' }));
            }
            srcName = srcPath.split('/').pop();
            srcParent = getNode(nodeState.filesystem, srcPath.substring(0, srcPath.lastIndexOf('/')) || '/');
        }
        
        // Verify source is in Trash
        if (!srcPath.includes('/Trash/')) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Source must be in Trash' }));
        }
        
        // Get original metadata (stored during delete)
        const originalName = srcNode.original_name || srcName;
        const originalPath = srcNode.original_path;
        
        if (!originalPath) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Cannot restore: original path not found' }));
        }
        
        // Determine destination
        let destPath = destination;
        if (!destPath) {
            // Use original path's parent directory
            destPath = originalPath.substring(0, originalPath.lastIndexOf('/')) || '/';
        } else {
            destPath = destPath.startsWith('/') ? destPath : '/' + destPath;
            destPath = destPath.replace(/\/+/g, '/');
        }
        
        // Ensure destination exists
        ensureDir(nodeState.filesystem, destPath);
        const destParent = getNode(nodeState.filesystem, destPath);
        
        if (!destParent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Failed to create destination' }));
        }
        
        // Determine final name (use original name)
        let finalName = originalName;
        
        // Handle duplicate names - add number suffix if needed
        if (destParent.children && destParent.children[finalName]) {
            console.log(`   📝 File "${finalName}" already exists in destination, adding number suffix`);
            const lastDot = finalName.lastIndexOf('.');
            const hasExtension = lastDot > 0;
            const baseName = hasExtension ? finalName.substring(0, lastDot) : finalName;
            const extension = hasExtension ? finalName.substring(lastDot) : '';
            
            let counter = 1;
            let newFileName;
            do {
                newFileName = `${baseName} (${counter})${extension}`;
                counter++;
            } while (destParent.children[newFileName] && counter < 1000);
            
            finalName = newFileName;
        }
        
        // Calculate final path
        const finalPath = destPath === '/' ? `/${finalName}` : `${destPath}/${finalName}`;
        
        // Restore the node (remove trash metadata, restore original name)
        if (!destParent.children) {
            destParent.children = {};
        }
        
        // Create restored node (remove trash-specific metadata)
        const restoredNode = {
            ...srcNode,
            name: finalName,
            path: finalPath,
            uuid: srcNode.uuid || `uuid-${finalPath.replace(/\//g, '-')}`,
            modified: Date.now(),
        };
        
        // Remove trash metadata
        delete restoredNode.original_name;
        delete restoredNode.original_path;
        delete restoredNode.trashed_ts;
        
        // If it's a directory, recursively clean trash metadata from children
        if (restoredNode.type === 'dir' && restoredNode.children) {
            function cleanTrashMetadata(node) {
                delete node.original_name;
                delete node.original_path;
                delete node.trashed_ts;
                if (node.children) {
                    for (const child of Object.values(node.children)) {
                        cleanTrashMetadata(child);
                    }
                }
            }
            for (const child of Object.values(restoredNode.children)) {
                cleanTrashMetadata(child);
            }
        }
        
        destParent.children[finalName] = restoredNode;
        
        // Remove from Trash
        if (srcParent && srcParent.children && srcParent.children[srcName]) {
            delete srcParent.children[srcName];
        }
        
        // Emit socket events
        emitSocketEvent('item.removed', {
            path: srcPath,
            descendants_only: false
        }, session.wallet);
        
        const restoredEntry = {
            id: Math.floor(Math.random() * 10000),
            uid: restoredNode.uuid,
            uuid: restoredNode.uuid,
            name: finalName,
            path: finalPath,
            is_dir: restoredNode.type === 'dir',
            is_empty: restoredNode.type === 'dir' ? Object.keys(restoredNode.children || {}).length === 0 : false,
            size: restoredNode.size || 0,
            created: new Date(restoredNode.created || Date.now()).toISOString(),
            modified: new Date(restoredNode.modified || Date.now()).toISOString(),
            type: restoredNode.mimeType || (restoredNode.type === 'dir' ? null : 'application/octet-stream'),
        };
        
        emitSocketEvent('item.added', {
            ...restoredEntry,
            dirpath: destPath,
            original_client_socket_id: null
        }, session.wallet);
        
        saveState();
        
        console.log(`   ✅ Restore successful: ${srcPath} → ${finalPath}`);
        
        // Puter's restore likely uses same format as move: { moved: <entry>, old_path: <string> }
        const response = {
            moved: restoredEntry,
            old_path: srcPath,
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(response));
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
            // Normalize wallet addresses for case-insensitive comparison
            const normalizedWallet = wallet ? wallet.toLowerCase() : null;
            const events = nodeState.pendingEvents.filter(evt => {
                // Send events to matching wallet (room) or broadcast events (wallet === null means broadcast)
                // This matches Puter's pattern: svc_socketio.send({ room: user.id }, 'item.removed', data)
                const matches = !evt.wallet || evt.wallet === normalizedWallet || normalizedWallet === null;
                if (matches && events.length === 0) {
                    // Log first matching event for debugging
                    console.log(`   📥 Polling: Found ${nodeState.pendingEvents.length} total events, filtering for wallet: ${normalizedWallet || 'broadcast'}`);
                }
                return matches;
            });
            
            if (events.length > 0) {
                console.log(`   📤 Polling: Returning ${events.length} events to wallet: ${normalizedWallet || 'broadcast'}`);
            }
            
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
    // This endpoint doesn't require auth (SDK calls it during initialization)
    if (path === '/cache/last-change-timestamp' && method === 'GET') {
        console.log(`\n⏰ CACHE TIMESTAMP: ${Date.now()}`);
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        // Return timestamp (SDK expects this format)
        return res.end(JSON.stringify({ timestamp: Date.now() }));
    }
    
    // /whoami - Get current user info (Puter SDK endpoint)
    if (path === '/whoami' && method === 'GET') {
        console.log(`\n👤 WHOAMI`);
        
        // Check for auth token
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // PHASE 1: Return unauthenticated state instead of 401
            // This allows the frontend to show login UI instead of blocking
            console.log(`   ⚠️  No auth token - returning unauthenticated state`);
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            return res.end(JSON.stringify({
                username: null,
                address: null,
                is_owner: false,
                node_name: nodeState.name || 'PC2 Node'
            }));
        }
        
        const token = authHeader.substring(7);
        const session = nodeState.sessions.get(token);
        
        if (!session) {
            // Also return unauthenticated state for invalid session
            console.log(`   ⚠️  Invalid session - returning unauthenticated state`);
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            return res.end(JSON.stringify({
                username: null,
                address: null,
                is_owner: false,
                node_name: nodeState.name || 'PC2 Node'
            }));
        }
        
        // SIMPLIFIED AUTH: Verify session wallet is admin wallet
        const walletAddress = session.wallet;
        const normalizedWallet = walletAddress.toLowerCase();
        const normalizedAdmin = nodeState.ownerWallet?.toLowerCase();
        
        if (!normalizedAdmin || normalizedWallet !== normalizedAdmin) {
            // Session wallet is not admin - return unauthenticated
            console.log(`   ⚠️  Session wallet ${walletAddress} is not admin wallet - returning unauthenticated state`);
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            return res.end(JSON.stringify({
                username: null,
                address: null,
                is_owner: false,
                node_name: nodeState.name || 'PC2 Node'
            }));
        }
        
        // Return user info in Puter's expected format (matching commit 0cc69cc7)
        const smartAccountAddress = session.smart_account_address || null;
        console.log(`   ✅ Authenticated admin user: ${walletAddress}`);
        if (smartAccountAddress) {
            console.log(`   ✅ Smart Account (UniversalX): ${smartAccountAddress}`);
        }
        
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        return res.end(JSON.stringify({
            id: 1,
            uuid: walletAddress,
            username: walletAddress,
            wallet_address: walletAddress,
            smart_account_address: smartAccountAddress,
            email: null,
            email_confirmed: true,
            is_temp: false,
            taskbar_items: [],
            desktop_bg_url: '/images/flint-2.jpg', // PC2 default background: Flint 2.jpg
            desktop_bg_color: null, // Use image instead of color
            desktop_bg_fit: 'cover',
            token: token, // Include token in response
            auth_type: smartAccountAddress ? 'universalx' : 'wallet',
            is_owner: nodeState.ownerWallet?.toLowerCase() === walletAddress.toLowerCase(),
            node_name: nodeState.name || 'PC2 Node'
        }));
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
        
        // Extract auth token
        const authHeader = req.headers['authorization'];
        let session = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const sessionToken = authHeader.substring(7);
            session = nodeState.sessions.get(sessionToken);
        }
        
        // Handle puter-kvstore requests (for key-value storage)
        if (data.interface === 'puter-kvstore') {
            console.log(`   💾 KV Store: method=${data.method}, key=${data.args?.key || 'N/A'}`);
            
            // KV store requires authentication
            if (!session) {
                console.log(`   ⚠️  No session found, returning unauthorized`);
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                return res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
            }
            
            // Initialize KV store for this wallet if needed
            if (!nodeState.kvStore) {
                nodeState.kvStore = new Map();
            }
            
            const wallet = session.wallet;
            const key = data.args?.key;
            
            if (data.method === 'get') {
                const walletKey = `${wallet}:${key}`;
                const value = nodeState.kvStore.get(walletKey);
                console.log(`   ✅ KV GET: key="${key}", value:`, value !== undefined ? value : 'null');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                // Return null if not found (SDK expects null, not undefined)
                return res.end(JSON.stringify({ success: true, result: value !== undefined ? value : null }));
            } else if (data.method === 'set') {
                const walletKey = `${wallet}:${key}`;
                const value = data.args?.value !== undefined ? data.args.value : data.args?.va; // Handle typo in SDK
                nodeState.kvStore.set(walletKey, value);
                saveState();
                console.log(`   ✅ KV SET: key="${key}", value:`, value);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true, result: value }));
            } else if (data.method === 'list') {
                // List keys matching pattern (e.g., 'user_preferences.default_apps.*')
                const pattern = data.args?.pattern || key;
                const prefix = pattern.replace(/\*$/, ''); // Remove trailing *
                const walletPrefix = `${wallet}:${prefix}`;
                const matchingKeys = [];
                
                for (const [storedKey, storedValue] of nodeState.kvStore.entries()) {
                    if (storedKey.startsWith(walletPrefix)) {
                        const keyWithoutWallet = storedKey.substring(wallet.length + 1); // Remove "wallet:"
                        matchingKeys.push(keyWithoutWallet);
                    }
                }
                
                console.log(`   ✅ KV LIST: pattern="${pattern}", found ${matchingKeys.length} keys`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true, result: matchingKeys }));
            } else if (data.method === 'delete') {
                const walletKey = `${wallet}:${key}`;
                const deleted = nodeState.kvStore.delete(walletKey);
                if (deleted) {
                    saveState();
                }
                console.log(`   ✅ KV DELETE: key="${key}", deleted:`, deleted);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true, result: deleted }));
            }
        }
        
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
        
        // Handle puter-hosting requests (for hosting sites)
        if (data.interface === 'puter-hosting' && data.method === 'list') {
            console.log(`   🌐 Hosting LIST`);
            // Hosting list requires authentication
            if (!session) {
                console.log(`   ⚠️  No session found, returning unauthorized`);
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                return res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
            }
            // Return empty array (no sites for now) - MUST be an array, not null
            console.log(`   ✅ Returning empty array for hosting sites`);
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            return res.end(JSON.stringify({ success: true, result: [] }));
        }
        
        // Handle other driver interfaces that might not require auth
        // (e.g., puter-apps.read can work without auth for public apps)
        if (data.interface === 'puter-apps' && data.method === 'read') {
            // Apps lookup doesn't require auth (public app info)
            // This is handled earlier in the function, but keep for reference
        }
        
        // Default: return empty success for other driver calls
        // Some driver calls might not require auth, so return success with null result
        console.log(`   ⚠️  Unknown driver call: interface=${data.interface}, method=${data.method}`);
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        return res.end(JSON.stringify({ success: true, result: null }));
    }
    
    // /auth/check - Auth check
    if (path === '/auth/check' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ logged_in: true }));
    }
    
    // /auth/particle - Particle Auth endpoint (for wallet authentication)
    if (path === '/auth/particle' && method === 'OPTIONS') {
        // Handle CORS preflight
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400'
        });
        return res.end();
    }
    
    if (path === '/auth/particle' && method === 'POST') {
        console.log(`\n🔐 PARTICLE AUTH REQUEST`);
        console.log(`   Data keys:`, Object.keys(data || {}));
        
        // Particle Auth sends wallet address, Smart Account address (UniversalX), and signature
        // For mock server, we'll create/verify a session based on wallet address
        const walletAddress = data.address || data.walletAddress || data.eoaAddress;
        const smartAccountAddress = data.smartAccountAddress || data.smart_account_address;
        
        if (!walletAddress) {
            res.writeHead(400, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            });
            return res.end(JSON.stringify({ error: 'Wallet address required' }));
        }
        
        // Normalize wallet address (keep original case for display, but use lowercase for storage)
        const normalizedWallet = walletAddress.toLowerCase();
        const displayWallet = walletAddress; // Keep original case
        
        // SIMPLIFIED AUTH: Verify wallet is admin wallet (or set as admin if first time)
        if (!nodeState.ownerWallet) {
            // First-time setup: Set this wallet as admin
            console.log(`   ⚠️  No admin wallet configured - setting ${displayWallet} as admin (first-time setup)`);
            nodeState.ownerWallet = displayWallet;
            nodeState.status = 'ONLINE';
            saveState();
        } else {
            // Verify wallet is admin wallet
            const normalizedAdmin = nodeState.ownerWallet.toLowerCase();
            if (normalizedWallet !== normalizedAdmin) {
                console.log(`   ❌ Authentication rejected: ${displayWallet} is not the admin wallet`);
                console.log(`   ℹ️  Admin wallet: ${nodeState.ownerWallet}`);
                res.writeHead(403, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                });
                return res.end(JSON.stringify({ 
                    error: 'Only admin wallet can authenticate to this PC2 node',
                    admin_wallet: nodeState.ownerWallet
                }));
            }
        }
        
        // Check if wallet already has a session
        let session = null;
        let sessionToken = null;
        for (const [token, sess] of nodeState.sessions.entries()) {
            if (sess.wallet && sess.wallet.toLowerCase() === normalizedWallet) {
                session = sess;
                sessionToken = token;
                break;
            }
        }
        
        // Create new session if needed
        if (!session) {
            sessionToken = crypto.randomBytes(32).toString('hex');
            session = {
                wallet: displayWallet, // Store original case for display
                smart_account_address: smartAccountAddress || null, // Store Smart Account if provided
                createdAt: Date.now(),
                expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
            };
            nodeState.sessions.set(sessionToken, session);
            ensureUserHomeDirectory(normalizedWallet);
            saveState();
            console.log(`   ✅ Created new session for wallet: ${displayWallet}`);
            if (smartAccountAddress) {
                console.log(`   ✅ Smart Account (UniversalX): ${smartAccountAddress}`);
            }
        } else {
            // Update existing session with Smart Account if provided
            if (smartAccountAddress && !session.smart_account_address) {
                session.smart_account_address = smartAccountAddress;
                console.log(`   ✅ Updated session with Smart Account: ${smartAccountAddress}`);
            }
        }
        
        // Return session token and user info in Puter format (frontend expects success: true)
        const userResponse = {
            id: 1,
            uuid: displayWallet,
            username: displayWallet,
            wallet_address: displayWallet,
            smart_account_address: smartAccountAddress || session.smart_account_address || null,
            email: null,
            email_confirmed: true,
            is_temp: false,
            taskbar_items: [],
            desktop_bg_url: '/images/flint-2.jpg', // PC2 default background: Flint 2.jpg
            desktop_bg_color: null, // Use image instead of color
            desktop_bg_fit: 'cover',
            token: sessionToken,
            auth_type: smartAccountAddress ? 'universalx' : 'wallet'
        };
        
        const response = {
            success: true,
            token: sessionToken,
            user: userResponse
        };
        
        console.log(`   ✅ Returning auth response with token: ${sessionToken.substring(0, 16)}...`);
        console.log(`   ✅ User wallet: ${displayWallet}, Smart Account: ${smartAccountAddress || session.smart_account_address || 'none'}`);
        
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        return res.end(JSON.stringify(response));
    }
    
    // /auth/grant-user-app - Grant user app token (for desktop initialization)
    if (path === '/auth/grant-user-app' && method === 'OPTIONS') {
        // Handle CORS preflight
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400'
        });
        return res.end();
    }
    
    if (path === '/auth/grant-user-app' && method === 'POST') {
        console.log(`\n🔑 GRANT USER APP TOKEN`);
        
        // Extract auth token from header
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.writeHead(401, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            return res.end(JSON.stringify({ error: 'Unauthorized' }));
        }
        
        const sessionToken = authHeader.substring(7);
        
        // Find session
        const session = nodeState.sessions.get(sessionToken);
        if (!session) {
            res.writeHead(401, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            return res.end(JSON.stringify({ error: 'Invalid session' }));
        }
        
        // Parse request body
        let requestData = {};
        try {
            if (data && typeof data === 'object') {
                requestData = data;
            } else if (rawBody) {
                requestData = JSON.parse(rawBody.toString());
            }
        } catch (e) {
            console.warn('   ⚠️  Failed to parse request body:', e.message);
        }
        
        // Generate app token (similar to session token but for app access)
        const appToken = crypto.randomBytes(32).toString('hex');
        
        // Store app token (optional - can reuse session token)
        if (!nodeState.appTokens) {
            nodeState.appTokens = new Map();
        }
        nodeState.appTokens.set(appToken, {
            wallet: session.wallet,
            createdAt: Date.now(),
            expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
        });
        
        console.log(`   ✅ Granted app token for wallet: ${session.wallet}`);
        
        // Return app token
        const response = {
            token: appToken,
            expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000)
        };
        
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        return res.end(JSON.stringify(response));
    }
    
    // /auth/get-user-app-token - Get app token for popup authentication
    if (path === '/auth/get-user-app-token' && method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400'
        });
        return res.end();
    }
    
    if (path === '/auth/get-user-app-token' && method === 'POST') {
        console.log(`\n🔑 GET USER APP TOKEN`);
        
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.writeHead(401, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            return res.end(JSON.stringify({ error: 'Unauthorized' }));
        }
        
        const sessionToken = authHeader.substring(7);
        const session = nodeState.sessions.get(sessionToken);
        if (!session) {
            res.writeHead(401, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            return res.end(JSON.stringify({ error: 'Invalid session' }));
        }
        
        // Parse request body
        let requestData = {};
        try {
            if (data && typeof data === 'object') {
                requestData = data;
            } else if (rawBody) {
                requestData = JSON.parse(rawBody.toString());
            }
        } catch (e) {
            console.warn('   ⚠️  Failed to parse request body:', e.message);
        }
        
        // Generate app token (can reuse session token or generate new one)
        const appToken = sessionToken; // Reuse session token for simplicity
        
        console.log(`   ✅ Returning app token for wallet: ${session.wallet}`);
        
        const response = {
            token: appToken,
            expires_at: session.expiresAt
        };
        
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        return res.end(JSON.stringify(response));
    }
    
    // /kv/* or /api/kv/* - Key-value storage (for user preferences, etc.)
    if ((path.startsWith('/kv/') || path.startsWith('/api/kv/')) && (method === 'GET' || method === 'POST')) {
        console.log(`\n💾 KV STORE: ${method} ${path}`);
        const key = path.startsWith('/api/kv/') ? path.substring(8) : path.substring(4); // Remove '/kv/' or '/api/kv/' prefix
        console.log(`   Key: ${key}`);
        
        // Extract auth token
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.writeHead(401, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            return res.end(JSON.stringify({ error: 'Unauthorized' }));
        }
        
        const sessionToken = authHeader.substring(7);
        const session = nodeState.sessions.get(sessionToken);
        if (!session) {
            res.writeHead(401, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            return res.end(JSON.stringify({ error: 'Invalid session' }));
        }
        
        // Initialize KV store for this wallet if needed
        if (!nodeState.kvStore) {
            nodeState.kvStore = new Map();
        }
        
        const walletKey = `${session.wallet}:${key}`;
        
        if (method === 'GET') {
            const value = nodeState.kvStore.get(walletKey);
            console.log(`   Value for key "${key}":`, value !== undefined ? value : 'null');
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            // Return null as JSON string if not found (SDK expects null, not undefined)
            // The SDK will parse this, so we need to return the JSON string "null"
            if (value === undefined) {
                return res.end('null');
            }
            // If value is already a string, return it as-is (don't double-stringify)
            if (typeof value === 'string') {
                return res.end(value);
            }
            // Otherwise stringify the value
            return res.end(JSON.stringify(value));
        } else if (method === 'POST') {
            // Parse request body
            let requestData = {};
            try {
                if (data && typeof data === 'object') {
                    requestData = data;
                } else if (rawBody) {
                    requestData = JSON.parse(rawBody.toString());
                }
            } catch (e) {
                console.warn('   ⚠️  Failed to parse KV request body:', e.message);
            }
            
            const value = requestData.value !== undefined ? requestData.value : requestData;
            nodeState.kvStore.set(walletKey, value);
            saveState();
            
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            return res.end(JSON.stringify({ success: true }));
        }
    }
    
    // /hosting/list or /api/hosting/list - List hosting sites
    if ((path === '/hosting/list' || path === '/api/hosting/list') && method === 'GET') {
        console.log(`\n🌐 HOSTING LIST: ${method} ${path}`);
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.writeHead(401, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            return res.end(JSON.stringify({ error: 'Unauthorized' }));
        }
        
        console.log(`   ✅ Returning empty array for hosting sites`);
        // Return empty array (no sites for now) - MUST be an array, not null
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        return res.end(JSON.stringify([]));
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
    
    // /version - Get server version info
    if (path === '/version' && method === 'GET') {
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        return res.end(JSON.stringify({
            version: '2.5.1',
            server: 'localhost',
            deployed: new Date().toISOString()
        }));
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
    console.log('  POST /rename           - Rename file/folder');
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

