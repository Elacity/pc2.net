# IPFS Extension Implementation - Handover Document

**Date**: December 2, 2025  
**Branch**: `ipfs-extension`  
**Status**: Ready to Begin Implementation  
**Estimated Timeline**: 4-6 weeks  
**Context**: Building on successful Particle Auth extension

---

## 🎯 HIGH-LEVEL OBJECTIVE

**Build an IPFS storage extension for ElastOS that enables decentralized file storage on user's personal IPFS node, with automatic encryption for private folders and public sharing capability.**

### What Success Looks Like (End of 6 Weeks):

```
✅ User saves file to /Documents/ → Encrypted, uploaded to IPFS node
✅ User saves file to /Public/ → Unencrypted, globally accessible via IPFS
✅ User opens file from any device → Downloads from IPFS, decrypts, displays
✅ User shares public file → Gets IPFS gateway link (ipfs.io/ipfs/QmXYZ...)
✅ Settings shows IPFS stats → Storage used, pinned files, node status
✅ Everything works on current dev setup → Ready to package later
```

---

## 📍 CURRENT STATE (Where We Are)

### ✅ What's Working Now:

**Backend**:
- Puter backend running on localhost:4100
- SQLite database with all migrations (version 37+)
- DBFSProvider for database-backed filesystem
- File operations working (upload, download, stat, readdir)

**Authentication**:
- Particle Auth extension fully functional
- Web3 wallet login (MetaMask, WalletConnect)
- Embedded inside desktop (not external page)
- DID integration working
- Session management working

**Frontend**:
- Desktop UI loads correctly
- File browser functional
- Apps can open/save files
- Window management working
- No visual glitches

**Extension System**:
- Proven with Particle Auth
- Know how to create extensions
- Know how to register drivers
- Know how to serve GUI routes
- Know how to use `extension.import('data')`

### 📂 Repository Structure:

```
/Users/mtk/Documents/Cursor/pc2.net/
├── src/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── CoreModule.js (services registration)
│   │   │   ├── modules/puterfs/ (filesystem)
│   │   │   ├── services/ (core services)
│   │   │   └── routers/ (API routes)
│   │   └── package.json
│   ├── gui/
│   │   └── src/
│   │       ├── initgui.js (boot flow)
│   │       ├── UI/ (components)
│   │       └── css/
│   └── particle-auth/ (built React app)
├── extensions/
│   └── particle-auth/ (REFERENCE IMPLEMENTATION ✅)
│       ├── package.json
│       ├── main.js (extension entry)
│       ├── drivers/ParticleAuthDriver.js
│       ├── services/
│       │   ├── ParticleAuthService.js
│       │   └── ParticleAuthGUIService.js
│       └── gui/ (static files)
├── volatile/
│   ├── config/config.json (configuration)
│   └── runtime/ (database, cache)
└── Documentation:
    ├── ELASTOS_INTEGRATION_HANDOVER.md (Particle Auth work)
    ├── IPFS_STORAGE_STRATEGY.md (detailed IPFS architecture)
    ├── CRITICAL_AUDIT.md (honest assessment)
    └── ELASTOS_VISION.md (complete vision)
```

### 🔑 Key Knowledge from Particle Auth:

**Extension Pattern**:
```javascript
// extensions/particle-auth/main.js
extension.on('preinit', event => { /* early setup */ });
extension.on('init', event => { /* main setup */ });
extension.on('create.interfaces', event => { /* define interface */ });
extension.on('create.drivers', event => { /* register driver */ });
extension.on('create.permissions', event => { /* grant access */ });
extension.on('ready', event => { /* extension ready */ });
```

**Database Access**:
```javascript
const { db } = extension.import('data');
await db.read('SELECT * FROM table WHERE id = ?', [id]);
await db.write('INSERT INTO table (col) VALUES (?)', [value]);
```

**Service Registration**:
```javascript
// Services auto-register when extension loads
// No need to modify CoreModule.js
```

---

## 🎯 WHAT WE'RE BUILDING (IPFS Extension)

### Architecture Overview:

```
┌─────────────────────────────────────────────┐
│ User's Browser (Desktop UI)                 │
│ - File Manager shows folders                │
│ - User saves/opens files                    │
└────────────┬────────────────────────────────┘
             │ Puter API calls
             ▼
┌─────────────────────────────────────────────┐
│ ElastOS Backend (Node.js)                   │
│ ┌─────────────────────────────────────────┐ │
│ │ IPFS Extension (NEW)                    │ │
│ │                                         │ │
│ │ IPFSStorageDriver:                      │ │
│ │ - connect(nodeUrl)                      │ │
│ │ - upload(file, path) → CID              │ │
│ │ - download(cid) → file                  │ │
│ │                                         │ │
│ │ IPFSProvider:                           │ │
│ │ - stat(path) → metadata                 │ │
│ │ - read(path) → file content             │ │
│ │ - write(path, data) → save to IPFS      │ │
│ │ - readdir(path) → list files            │ │
│ │                                         │ │
│ │ Encryption:                             │ │
│ │ - Key derived from wallet signature     │ │
│ │ - AES-256-GCM encryption                │ │
│ │ - Public folder = no encryption         │ │
│ └─────────────────────────────────────────┘ │
└────────────┬────────────────────────────────┘
             │ IPFS HTTP API
             ▼
┌─────────────────────────────────────────────┐
│ Local IPFS Node (Kubo via Docker)          │
│ - Stores encrypted files                   │
│ - Pins content                             │
│ - Provides CIDs                            │
│ - API: http://localhost:5001               │
└─────────────────────────────────────────────┘
```

### File Privacy Model:

```
/Desktop/file.txt        → Encrypted (wallet-based key)
/Documents/report.pdf    → Encrypted (wallet-based key)
/Pictures/photo.jpg      → Encrypted (wallet-based key)
/Public/shared.jpg       → NOT encrypted (globally accessible)
/Videos/movie.mp4        → Encrypted (wallet-based key)
```

### Database Schema (New Migration):

```sql
-- 0042_ipfs_storage.sql

-- User's IPFS node configuration
CREATE TABLE user_ipfs_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    node_url VARCHAR(255) NOT NULL DEFAULT 'http://localhost:5001',
    api_key_encrypted TEXT NULL,
    is_active BOOLEAN DEFAULT 1,
    last_connected_at INTEGER,
    peer_id VARCHAR(255),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    
    FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE INDEX idx_user_active_node (user_id, is_active)
);

-- File CID mappings
CREATE TABLE ipfs_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    file_path VARCHAR(1024) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    cid VARCHAR(255) NOT NULL,
    file_size BIGINT,
    mime_type VARCHAR(100),
    is_encrypted BOOLEAN DEFAULT 1,
    is_pinned BOOLEAN DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    
    FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE INDEX idx_user_path (user_id, file_path),
    INDEX idx_user_cid (user_id, cid)
);
```

---

## 📋 IMPLEMENTATION PLAN (Granular Steps)

### WEEK 1-2: Core Driver & Database

#### **Task 1.1: Set Up Local IPFS Node**

**Objective**: Get IPFS running locally for testing

**Steps**:
```bash
# 1. Start IPFS via Docker
docker run -d --name ipfs_host \
  -v $HOME/ipfs-data:/data/ipfs \
  -p 4001:4001 \
  -p 4001:4001/udp \
  -p 8080:8080 \
  -p 5001:5001 \
  ipfs/kubo:latest

# 2. Verify it's running
curl http://localhost:5001/api/v0/id

# 3. Enable CORS (for browser access)
docker exec ipfs_host ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
docker exec ipfs_host ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST", "GET"]'
docker restart ipfs_host

# 4. Test upload
echo "Hello IPFS!" > test.txt
curl -F "file=@test.txt" http://localhost:5001/api/v0/add
# Should return: {"Name":"test.txt","Hash":"Qm...","Size":"..."}
```

**Verification**:
- [ ] IPFS daemon running
- [ ] Can upload file via API
- [ ] Can download file via API
- [ ] CORS configured correctly

---

#### **Task 1.2: Create Extension Structure**

**Objective**: Set up ipfs-storage extension skeleton

**Steps**:
```bash
# 1. Create directory structure
mkdir -p extensions/ipfs-storage/{drivers,services,providers}

# 2. Create package.json
cat > extensions/ipfs-storage/package.json << 'EOF'
{
  "name": "@elastos/ipfs-storage",
  "version": "1.0.0",
  "description": "IPFS storage extension for ElastOS",
  "type": "module",
  "puter": {
    "type": "extension"
  }
}
EOF

# 3. Create main.js (entry point)
touch extensions/ipfs-storage/main.js
```

**File**: `extensions/ipfs-storage/main.js` (initial version)
```javascript
// IPFS Storage Extension for ElastOS
// Provides decentralized file storage via IPFS

const { create } = require('ipfs-http-client');

// Extension lifecycle
extension.on('preinit', event => {
    extension.log.info('[IPFS Storage]: Pre-initialization');
});

extension.on('init', async event => {
    extension.log.info('[IPFS Storage]: Initializing...');
    
    // Log configuration
    const config = extension.config || {};
    extension.log.info('[IPFS Storage]: Config loaded', {
        nodeUrl: config.ipfs_node_url || 'http://localhost:5001',
        autoConnect: config.ipfs_auto_connect || true
    });
});

extension.on('ready', event => {
    extension.log.info('[IPFS Storage]: Extension ready ✓');
});
```

**Verification**:
- [ ] Extension directory created
- [ ] package.json exists
- [ ] main.js exists
- [ ] Server starts without errors
- [ ] Logs show "[IPFS Storage]: Extension ready ✓"

---

#### **Task 1.3: Create Database Migration**

**Objective**: Add tables for IPFS node config and file mappings

**Steps**:
```bash
# 1. Create migration file
cat > src/backend/src/services/database/sqlite_setup/0042_ipfs_storage.sql << 'EOF'
-- IPFS Storage Extension Schema
-- Stores IPFS node configuration and file CID mappings

-- User's IPFS node configuration
CREATE TABLE IF NOT EXISTS `user_ipfs_nodes` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id` INTEGER NOT NULL,
    `node_url` VARCHAR(255) NOT NULL DEFAULT 'http://localhost:5001',
    `api_key_encrypted` TEXT NULL,
    `is_active` BOOLEAN DEFAULT 1,
    `last_connected_at` INTEGER,
    `peer_id` VARCHAR(255),
    `created_at` INTEGER NOT NULL,
    `updated_at` INTEGER NOT NULL,
    
    FOREIGN KEY(`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_user_active_node` 
ON `user_ipfs_nodes` (`user_id`, `is_active`);

-- File CID mappings
CREATE TABLE IF NOT EXISTS `ipfs_files` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id` INTEGER NOT NULL,
    `file_path` VARCHAR(1024) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `cid` VARCHAR(255) NOT NULL,
    `file_size` BIGINT,
    `mime_type` VARCHAR(100),
    `is_encrypted` BOOLEAN DEFAULT 1,
    `is_pinned` BOOLEAN DEFAULT 1,
    `created_at` INTEGER NOT NULL,
    `updated_at` INTEGER NOT NULL,
    
    FOREIGN KEY(`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_user_path` 
ON `ipfs_files` (`user_id`, `file_path`);

CREATE INDEX IF NOT EXISTS `idx_user_cid` 
ON `ipfs_files` (`user_id`, `cid`);

CREATE INDEX IF NOT EXISTS `idx_pinned` 
ON `ipfs_files` (`user_id`, `is_pinned`);
EOF

# 2. Register migration in SqliteDatabaseAccessService.js
# Add to available_migrations array:
# '0042_ipfs_storage.sql'
```

**File to Edit**: `src/backend/src/services/database/SqliteDatabaseAccessService.js`

Find the `available_migrations` array and add:
```javascript
const available_migrations = [
    // ... existing migrations
    '0037_cost.sql',
    '0038_user_wallet_address.sql',
    '0039_add-expireAt-to-kv-store.sql',
    '0042_ipfs_storage.sql', // ADD THIS LINE
];
```

**Verification**:
- [ ] Migration file created
- [ ] Migration registered in SqliteDatabaseAccessService.js
- [ ] Clear cache: `rm -rf volatile/runtime/*`
- [ ] Restart server
- [ ] Check database: `sqlite3 volatile/runtime/puter-database.sqlite "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ipfs%';"`
- [ ] Should show: `user_ipfs_nodes`, `ipfs_files`

---

#### **Task 1.4: Create IPFS Storage Driver**

**Objective**: Implement basic connect/upload/download

**File**: `extensions/ipfs-storage/drivers/IPFSStorageDriver.js`

```javascript
const { create } = require('ipfs-http-client');
const crypto = require('crypto');

class IPFSStorageDriver {
    constructor() {
        this.connections = new Map(); // user_id → ipfs client
        this.log = null; // Set by extension
    }
    
    /**
     * Connect to IPFS node
     */
    async connect({ nodeUrl, apiKey }, context) {
        const userId = context.user.id;
        
        if (!this.log) {
            this.log = extension.services.get('log-service').create('IPFSStorageDriver');
        }
        
        this.log.info(`Connecting to IPFS node for user ${userId}`, { nodeUrl });
        
        try {
            // Create IPFS client
            const ipfs = create({
                url: nodeUrl || 'http://localhost:5001',
                headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {}
            });
            
            // Test connection
            const id = await ipfs.id();
            this.log.info(`Connected to IPFS node: ${id.id}`);
            
            // Store connection
            this.connections.set(userId, ipfs);
            
            // Save node config to database
            const { db } = extension.import('data');
            await db.write(
                `INSERT OR REPLACE INTO user_ipfs_nodes 
                (user_id, node_url, is_active, peer_id, last_connected_at, created_at, updated_at) 
                VALUES (?, ?, 1, ?, ?, ?, ?)`,
                [userId, nodeUrl, id.id, Date.now(), Date.now(), Date.now()]
            );
            
            return {
                success: true,
                peerId: id.id,
                nodeUrl: nodeUrl
            };
        } catch (error) {
            this.log.error(`Failed to connect to IPFS node: ${error.message}`);
            throw new Error(`IPFS connection failed: ${error.message}`);
        }
    }
    
    /**
     * Upload file to IPFS
     */
    async upload({ file, path, encrypt = true }, context) {
        const userId = context.user.id;
        const ipfs = this.connections.get(userId);
        
        if (!ipfs) {
            throw new Error('Not connected to IPFS node. Call connect() first.');
        }
        
        // Determine if public based on path
        const isPublic = path.startsWith('/Public/');
        const shouldEncrypt = encrypt && !isPublic;
        
        this.log.info(`Uploading file: ${path} (encrypt: ${shouldEncrypt})`);
        
        // Encrypt if needed
        let fileBuffer = Buffer.from(file);
        if (shouldEncrypt) {
            fileBuffer = this.encryptFile(fileBuffer, context.user.wallet_address);
        }
        
        // Upload to IPFS with auto-pin
        const { cid } = await ipfs.add(fileBuffer, {
            pin: true,
            wrapWithDirectory: false,
            progress: (bytes) => {
                this.log.debug(`Upload progress: ${bytes} bytes`);
            }
        });
        
        const cidString = cid.toString();
        this.log.info(`File uploaded: ${path} → ${cidString}`);
        
        // Store mapping in database
        const { db } = extension.import('data');
        await db.write(
            `INSERT OR REPLACE INTO ipfs_files 
            (user_id, file_path, file_name, cid, file_size, is_encrypted, is_pinned, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
            [
                userId,
                path,
                path.split('/').pop(),
                cidString,
                file.length,
                shouldEncrypt ? 1 : 0,
                Date.now(),
                Date.now()
            ]
        );
        
        return {
            success: true,
            cid: cidString,
            path: path,
            encrypted: shouldEncrypt,
            size: file.length
        };
    }
    
    /**
     * Download file from IPFS
     */
    async download({ cid, decrypt = true }, context) {
        const userId = context.user.id;
        const ipfs = this.connections.get(userId);
        
        if (!ipfs) {
            throw new Error('Not connected to IPFS node. Call connect() first.');
        }
        
        this.log.info(`Downloading file: ${cid}`);
        
        // Download from IPFS
        const chunks = [];
        for await (const chunk of ipfs.cat(cid)) {
            chunks.push(chunk);
        }
        let fileBuffer = Buffer.concat(chunks);
        
        // Check if file was encrypted
        const { db } = extension.import('data');
        const fileInfo = await db.read(
            'SELECT is_encrypted FROM ipfs_files WHERE cid = ? AND user_id = ?',
            [cid, userId]
        );
        
        const isEncrypted = fileInfo && fileInfo[0] && fileInfo[0].is_encrypted;
        
        // Decrypt if needed
        if (decrypt && isEncrypted) {
            fileBuffer = this.decryptFile(fileBuffer, context.user.wallet_address);
        }
        
        this.log.info(`File downloaded: ${cid} (${fileBuffer.length} bytes)`);
        
        return {
            success: true,
            data: fileBuffer,
            cid: cid
        };
    }
    
    /**
     * Encrypt file using wallet-based key
     */
    encryptFile(buffer, walletAddress) {
        // Derive key from wallet address
        const key = crypto.scryptSync(walletAddress.toLowerCase(), 'elastos-salt', 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        
        const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
        const authTag = cipher.getAuthTag();
        
        // Format: [iv(16)][authTag(16)][encrypted]
        return Buffer.concat([iv, authTag, encrypted]);
    }
    
    /**
     * Decrypt file using wallet-based key
     */
    decryptFile(buffer, walletAddress) {
        // Derive same key
        const key = crypto.scryptSync(walletAddress.toLowerCase(), 'elastos-salt', 32);
        
        // Extract components
        const iv = buffer.slice(0, 16);
        const authTag = buffer.slice(16, 32);
        const encrypted = buffer.slice(32);
        
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        
        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }
}

module.exports = IPFSStorageDriver;
```

**Update**: `extensions/ipfs-storage/main.js`

```javascript
const { create } = require('ipfs-http-client');
const IPFSStorageDriver = require('./drivers/IPFSStorageDriver');

extension.on('preinit', event => {
    extension.log.info('[IPFS Storage]: Pre-initialization');
});

extension.on('init', async event => {
    extension.log.info('[IPFS Storage]: Initializing...');
});

// Create storage interface
extension.on('create.interfaces', event => {
    extension.log.info('[IPFS Storage]: Creating storage interface');
    
    event.createInterface('storage', {
        description: 'Decentralized storage interface for IPFS',
        methods: {
            connect: {
                description: 'Connect to IPFS node',
                parameters: {
                    nodeUrl: { type: 'string', required: true },
                    apiKey: { type: 'string', optional: true }
                }
            },
            upload: {
                description: 'Upload file to IPFS',
                parameters: {
                    file: { type: 'buffer', required: true },
                    path: { type: 'string', required: true },
                    encrypt: { type: 'boolean', optional: true, default: true }
                }
            },
            download: {
                description: 'Download file from IPFS',
                parameters: {
                    cid: { type: 'string', required: true },
                    decrypt: { type: 'boolean', optional: true, default: true }
                }
            }
        }
    });
});

// Register IPFS driver
extension.on('create.drivers', event => {
    extension.log.info('[IPFS Storage]: Registering IPFS driver');
    
    const driver = new IPFSStorageDriver();
    event.createDriver('storage', 'ipfs', driver);
});

// Grant permissions
extension.on('create.permissions', event => {
    extension.log.info('[IPFS Storage]: Granting permissions');
    event.grant_to_everyone('service:ipfs:ii:storage');
});

extension.on('ready', event => {
    extension.log.info('[IPFS Storage]: Extension ready ✓');
});
```

**Verification**:
- [ ] Driver file created
- [ ] main.js updated
- [ ] Server starts without errors
- [ ] Logs show interface, driver, and permissions registered
- [ ] Can test via Puter API (curl or browser console)

**Test Script**:
```javascript
// In browser console after logging in
(async () => {
    // 1. Connect to IPFS
    const connectResult = await puter.drivers.call('storage', 'ipfs', 'connect', {
        nodeUrl: 'http://localhost:5001'
    });
    console.log('Connect:', connectResult);
    
    // 2. Upload test file
    const testData = new TextEncoder().encode('Hello from ElastOS IPFS!');
    const uploadResult = await puter.drivers.call('storage', 'ipfs', 'upload', {
        file: testData,
        path: '/test.txt',
        encrypt: true
    });
    console.log('Upload:', uploadResult);
    
    // 3. Download file
    const downloadResult = await puter.drivers.call('storage', 'ipfs', 'download', {
        cid: uploadResult.cid,
        decrypt: true
    });
    console.log('Download:', new TextDecoder().decode(downloadResult.data));
})();
```

---

### WEEK 3-4: Filesystem Provider Integration

#### **Task 2.1: Create IPFS Filesystem Provider**

**Objective**: Make IPFS work like a normal filesystem in Puter

**File**: `extensions/ipfs-storage/providers/IPFSProvider.js`

```javascript
const { create } = require('ipfs-http-client');
const crypto = require('crypto');
const fsCapabilities = require('../../../src/backend/src/filesystem/definitions/capabilities');

class IPFSProvider {
    constructor(mountpoint, services) {
        this.mountpoint = mountpoint;
        this.services = services;
        this.log = services.get('log-service').create('IPFSProvider');
        this.ipfs = null;
        this.userId = null;
    }
    
    async mount({ path, options }) {
        this.log.info(`Mounting IPFSProvider at ${path}`);
        
        const nodeUrl = options.nodeUrl || 'http://localhost:5001';
        this.ipfs = create({ url: nodeUrl });
        
        // Test connection
        try {
            const id = await this.ipfs.id();
            this.log.info(`Connected to IPFS node: ${id.id}`);
        } catch (error) {
            this.log.error(`Failed to connect to IPFS node: ${error.message}`);
            throw error;
        }
        
        return this;
    }
    
    get_capabilities() {
        return new Set([
            fsCapabilities.READ,
            fsCapabilities.WRITE,
            fsCapabilities.READDIR_UUID_MODE,
            fsCapabilities.UUID,
        ]);
    }
    
    async stat({ selector }) {
        // Get file info from database
        const { db } = this.services.get('database').get(require('../../../src/backend/src/services/database/consts').DB_READ, 'ipfs');
        
        let path;
        if (selector.constructor.name === 'NodePathSelector') {
            path = selector.value;
        } else {
            return null;
        }
        
        const file = await db.read(
            'SELECT * FROM ipfs_files WHERE file_path = ? AND user_id = ?',
            [path, this.getCurrentUserId()]
        );
        
        if (!file || !file[0]) return null;
        
        return {
            uuid: file[0].cid,
            path: file[0].file_path,
            is_dir: false,
            size: file[0].file_size,
            modified: file[0].updated_at,
            created: file[0].created_at,
        };
    }
    
    async read({ node, offset, length }) {
        const cid = node.entry.uuid;
        
        this.log.info(`Reading file from IPFS: ${cid}`);
        
        // Download from IPFS
        const chunks = [];
        for await (const chunk of this.ipfs.cat(cid, { offset, length })) {
            chunks.push(chunk);
        }
        let buffer = Buffer.concat(chunks);
        
        // Decrypt if encrypted
        if (node.entry.is_encrypted) {
            buffer = this.decryptFile(buffer);
        }
        
        return buffer;
    }
    
    async write({ node, buffer }) {
        const path = node.entry.path;
        const isPublic = path.startsWith('/Public/');
        
        this.log.info(`Writing file to IPFS: ${path}`);
        
        // Encrypt if not public
        let fileData = buffer;
        if (!isPublic) {
            fileData = this.encryptFile(buffer);
        }
        
        // Upload to IPFS
        const { cid } = await this.ipfs.add(fileData, { pin: true });
        
        // Update database
        const { db } = this.services.get('database').get(require('../../../src/backend/src/services/database/consts').DB_WRITE, 'ipfs');
        await db.write(
            `INSERT OR REPLACE INTO ipfs_files 
            (user_id, file_path, file_name, cid, file_size, is_encrypted, is_pinned, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
            [
                this.getCurrentUserId(),
                path,
                path.split('/').pop(),
                cid.toString(),
                buffer.length,
                !isPublic ? 1 : 0,
                Date.now(),
                Date.now()
            ]
        );
        
        return { cid: cid.toString() };
    }
    
    async readdir({ node }) {
        const path = node.entry.path;
        const { db } = this.services.get('database').get(require('../../../src/backend/src/services/database/consts').DB_READ, 'ipfs');
        
        const children = await db.read(
            `SELECT cid FROM ipfs_files 
            WHERE file_path LIKE ? AND user_id = ?`,
            [path + '/%', this.getCurrentUserId()]
        );
        
        return children.map(c => c.cid);
    }
    
    getCurrentUserId() {
        // Get from auth context
        const auth = this.services.get('auth');
        const user = auth.get_user();
        return user ? user.id : null;
    }
    
    encryptFile(buffer) {
        const user = this.services.get('auth').get_user();
        const key = crypto.scryptSync(user.wallet_address.toLowerCase(), 'elastos-salt', 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
        const authTag = cipher.getAuthTag();
        return Buffer.concat([iv, authTag, encrypted]);
    }
    
    decryptFile(buffer) {
        const user = this.services.get('auth').get_user();
        const key = crypto.scryptSync(user.wallet_address.toLowerCase(), 'elastos-salt', 32);
        const iv = buffer.slice(0, 16);
        const authTag = buffer.slice(16, 32);
        const encrypted = buffer.slice(32);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }
}

module.exports = { IPFSProvider };
```

---

#### **Task 2.2: Register IPFS Provider Service**

**File**: `extensions/ipfs-storage/services/IPFSService.js`

```javascript
const BaseService = require('../../../src/backend/src/services/BaseService');
const { IPFSProvider } = require('../providers/IPFSProvider');

class IPFSService extends BaseService {
    async _init() {
        const svc_mountpoint = this.services.get('mountpoint');
        svc_mountpoint.register_mounter('ipfs', this.as('mounter'));
    }
    
    static IMPLEMENTS = {
        mounter: {
            async mount({ path, options }) {
                const provider = new IPFSProvider(path, this.services);
                await provider.mount({ path, options });
                return provider;
            },
        },
    };
}

module.exports = { IPFSService };
```

**Update**: `extensions/ipfs-storage/main.js` (add service registration)

```javascript
// At top, after other requires
const { IPFSService } = require('./services/IPFSService');

// In init event:
extension.on('init', async event => {
    extension.log.info('[IPFS Storage]: Initializing...');
    
    // Register IPFS filesystem service
    const services = extension.services;
    services.registerService('ipfs', IPFSService);
    
    extension.log.info('[IPFS Storage]: IPFSService registered');
});
```

---

#### **Task 2.3: Configure Mountpoint**

**File**: `volatile/config/config.json`

Add IPFS mountpoint:
```json
{
    "mountpoints": {
        "/": {
            "mounter": "dbfs"
        },
        "/ipfs/": {
            "mounter": "ipfs",
            "options": {
                "nodeUrl": "http://localhost:5001"
            }
        }
    }
}
```

**Verification**:
- [ ] Provider created
- [ ] Service created and registered
- [ ] Mountpoint configured
- [ ] Server restarts without errors
- [ ] Can navigate to /ipfs/ in file browser

---

### WEEK 5-6: Polish & Testing

#### **Task 3.1: Add Settings UI**

Create Settings panel for IPFS configuration

**File**: `src/gui/src/UI/Settings/UITabIPFS.js`

```javascript
// IPFS Settings Tab
// Shows connection status, storage stats, pinned files

export default {
    id: 'ipfs',
    title_i18n_key: 'ipfs',
    icon: 'cube.svg',
    html: () => {
        return `
            <div class="settings-card">
                <h3>IPFS Node Connection</h3>
                <div class="ipfs-status">
                    <label>Node URL:</label>
                    <input type="text" id="ipfs-node-url" value="http://localhost:5001" />
                    <button id="ipfs-test-connection">Test Connection</button>
                    <div id="ipfs-connection-status"></div>
                </div>
                
                <h3>Storage Statistics</h3>
                <div id="ipfs-stats">
                    <p>Pinned Files: <span id="ipfs-pinned-count">-</span></p>
                    <p>Total Size: <span id="ipfs-total-size">-</span></p>
                </div>
                
                <h3>Pinned Files</h3>
                <div id="ipfs-pinned-files" class="ipfs-file-list"></div>
            </div>
        `;
    },
    init: async function($el_parent) {
        // Event handlers for IPFS settings
        $('#ipfs-test-connection').on('click', async function() {
            const nodeUrl = $('#ipfs-node-url').val();
            try {
                const result = await puter.drivers.call('storage', 'ipfs', 'connect', { nodeUrl });
                $('#ipfs-connection-status').html(`✅ Connected: ${result.peerId}`);
            } catch (error) {
                $('#ipfs-connection-status').html(`❌ Error: ${error.message}`);
            }
        });
        
        // Load stats
        // TODO: Call driver to get stats
    }
};
```

---

#### **Task 3.2: Add Progress Indicators**

Show upload/download progress for large files

**Update**: `IPFSStorageDriver.js` upload method

```javascript
async upload({ file, path, encrypt = true, onProgress }, context) {
    // ... existing code ...
    
    // Upload with progress callback
    const { cid } = await ipfs.add(fileBuffer, {
        pin: true,
        wrapWithDirectory: false,
        progress: (bytes) => {
            const percent = (bytes / fileBuffer.length) * 100;
            this.log.debug(`Upload progress: ${percent.toFixed(2)}%`);
            if (onProgress) onProgress(percent);
        }
    });
    
    // ... rest of code ...
}
```

---

#### **Task 3.3: Error Handling & Edge Cases**

Handle common errors gracefully:

```javascript
// IPFS node offline
// → Show user-friendly message
// → Queue for retry when node reconnects

// File already exists
// → Ask user: overwrite or keep both

// Large file (>100MB)
// → Warn user, ask confirmation
// → Show progress bar

// Encryption fails
// → Don't upload plaintext
// → Show error, allow retry

// Network timeout
// → Retry with exponential backoff
// → Show "Retrying..." message
```

---

## 📚 REFERENCE DOCUMENTS

### Primary References:

1. **IPFS_STORAGE_STRATEGY.md** - Complete technical architecture
   - Phase 1-5 implementation roadmap
   - Detailed code examples
   - Security model
   - Hardware setup guides

2. **ELASTOS_INTEGRATION_HANDOVER.md** - Particle Auth implementation
   - Proven extension pattern
   - Database migration process
   - GUI integration approach
   - Bug fixes and solutions

3. **CRITICAL_AUDIT.md** - Honest assessment
   - What's actually centralized
   - Privacy considerations
   - Security blind spots
   - Tradeoffs to be aware of

4. **ELASTOS_VISION.md** - Complete vision
   - Personal server architecture
   - DApp store concept
   - DRM integration
   - Phase 1 packaging strategy

### Puter Extension Documentation:

- **Events**: preinit, init, create.interfaces, create.drivers, create.permissions, ready
- **Data Access**: `extension.import('data')` → db, kv, cache
- **Service Registration**: Automatic when extension loads
- **Driver Pattern**: Interface + Implementation + Permissions
- **Filesystem**: Mountpoints, Providers, Capabilities

---

## 🎯 SUCCESS CRITERIA (How to Know You're Done)

### Week 1-2 (Core Driver):
- [ ] IPFS node running locally
- [ ] Extension loads without errors
- [ ] Database migration applied
- [ ] Can connect to IPFS node
- [ ] Can upload file and get CID
- [ ] Can download file by CID
- [ ] Encryption/decryption works

**Test**: Upload text file, verify CID in database, download and decrypt

---

### Week 3-4 (Filesystem):
- [ ] IPFSProvider registered
- [ ] /ipfs/ mountpoint works
- [ ] Can save from Text Editor to /ipfs/
- [ ] Can open file from /ipfs/ in Text Editor
- [ ] Public folder shares unencrypted
- [ ] Private folders encrypted

**Test**: Save file in Puter UI, check IPFS node has content

---

### Week 5-6 (Polish):
- [ ] Settings UI shows IPFS stats
- [ ] Upload progress indicators
- [ ] Error messages user-friendly
- [ ] Large files handled gracefully
- [ ] Documentation written
- [ ] Test suite passing

**Test**: Use as daily driver, all workflows work

---

## 🚨 COMMON PITFALLS TO AVOID

### 1. Extension Pseudo-Globals
❌ Don't use `extension.log` at root level (before events)
✅ Use `extension.log` inside event handlers

### 2. Database Context
❌ Don't hardcode user IDs
✅ Get from `context.user.id` or auth service

### 3. IPFS Connection
❌ Don't assume localhost:5001 always works
✅ Allow configuration, test connection first

### 4. Encryption Keys
❌ Don't generate random keys (user can't decrypt on other device)
✅ Derive from wallet signature (deterministic)

### 5. Public Folder
❌ Don't encrypt files in /Public/ (defeats purpose)
✅ Check path, skip encryption for public files

### 6. CID Mapping
❌ Don't lose track of which CID is which file
✅ Always store in ipfs_files table immediately

---

## 🔧 DEBUGGING TIPS

### View Extension Logs:
```bash
# Server logs show extension lifecycle
npm start

# Look for:
[INFO::@elacity/ipfs-storage] Extension ready ✓
```

### Check Database:
```bash
sqlite3 volatile/runtime/puter-database.sqlite

# Check tables exist
.tables

# Check file mappings
SELECT file_path, cid, is_encrypted FROM ipfs_files;

# Check node config
SELECT * FROM user_ipfs_nodes;
```

### Test IPFS Node:
```bash
# Check IPFS is running
curl http://localhost:5001/api/v0/id

# List pinned files
curl "http://localhost:5001/api/v0/pin/ls"

# Get file by CID
curl "http://localhost:8080/ipfs/QmXYZ..."
```

### Browser Console:
```javascript
// Test driver
puter.drivers.call('storage', 'ipfs', 'connect', {
    nodeUrl: 'http://localhost:5001'
});

// Check what's registered
console.log(puter.drivers);
```

---

## 📞 WHERE TO GET HELP

### If Stuck:

1. **Check Particle Auth Extension**
   - `extensions/particle-auth/` is working reference
   - Same patterns apply

2. **Check IPFS_STORAGE_STRATEGY.md**
   - Detailed code examples
   - Architecture explanations
   - Common scenarios

3. **Check Puter Extension Docs**
   - `src/backend/doc/extensions/`
   - Official patterns and examples

4. **Check Database Schema**
   - Look at existing migrations for patterns
   - Copy similar table structures

5. **Check Logs**
   - Server logs show what's happening
   - Extension logs show lifecycle events

---

## 🎯 FINAL CHECKLIST (Before Calling it Done)

### Code Quality:
- [ ] No console.log statements (use extension.log.info)
- [ ] Error handling on all async operations
- [ ] Input validation on all user inputs
- [ ] Comments explain WHY not WHAT
- [ ] Functions under 50 lines
- [ ] No duplicate code

### Functionality:
- [ ] Can upload encrypted file
- [ ] Can download encrypted file
- [ ] Can upload to Public folder (unencrypted)
- [ ] Can share public file via IPFS gateway link
- [ ] Files persist across restarts
- [ ] Multiple files don't conflict

### User Experience:
- [ ] No confusing error messages
- [ ] Progress shown for long operations
- [ ] Settings UI is clear
- [ ] File browser shows IPFS files correctly
- [ ] No performance issues with many files

### Documentation:
- [ ] README.md in extension directory
- [ ] API documentation for driver methods
- [ ] Configuration options documented
- [ ] Troubleshooting guide written

---

## 🚀 NEXT STEPS AFTER IPFS EXTENSION

Once IPFS extension is stable and tested:

### Phase 1: Package for Distribution (Weeks 7-12)
- Create Docker image
- Create Raspberry Pi image
- Build setup wizard
- Write installation docs
- Soft launch to early testers

### Phase 2: Personal Server Features
- Multi-device sync
- Automatic backups
- Discovery via DID
- Tailscale integration
- Remote access setup

### Phase 3: DApp Store
- Docker-based app system
- App marketplace UI
- One-click installs
- Blockchain node apps
- Media server apps

---

## 📋 HANDOVER COMPLETE

**Current Branch**: `ipfs-extension`  
**All Documentation**: Committed and pushed to GitHub  
**Test Environment**: IPFS node via Docker  
**Reference Implementation**: Particle Auth extension  
**Timeline**: 4-6 weeks to working IPFS extension  

**Next Action**: Start with Task 1.1 (Set Up Local IPFS Node)

**Remember**: Build incrementally, test frequently, refer to docs when stuck.

Good luck! 🎉

