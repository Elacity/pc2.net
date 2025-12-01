# IPFS Storage Extension - Strategic Implementation Plan

**Version**: 1.0  
**Date**: December 2, 2025  
**Status**: Planning Phase  
**Prerequisites**: ✅ Particle Auth Extension Complete

---

## Vision & Objectives

### The Big Picture 🌍

Create the world's first truly **decentralized Web3 OS** that combines:

1. **Decentralized Identity** (✅ Complete) - Blockchain wallet-based authentication
2. **Decentralized Storage** (⏳ Next Phase) - Personal IPFS node
3. **Decentralized Compute** (✅ Complete) - Browser-based virtual desktop (Puter)

### End-Game Architecture

```
┌─────────────────────────────────────────────────────────┐
│  User Anywhere in the World                             │
│  (Laptop, Phone, Tablet, Public Computer)               │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ 1. Authenticate with blockchain wallet
                 ▼
┌─────────────────────────────────────────────────────────┐
│  ElastOS Web3 OS (Browser)                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Puter Desktop Environment                       │    │
│  │ - Apps, Windows, File Browser                   │    │
│  │ - Taskbar, Context Menus, etc.                  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Extensions:                                             │
│  ├── particle-auth (Identity Layer) ✅                  │
│  └── ipfs-storage (Storage Layer) ⏳                    │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ 2. Connect to personal IPFS node
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Personal IPFS Node                                      │
│  Running on: Raspberry Pi / NAS / VPS / Home Server     │
│  ┌─────────────────────────────────────────────────┐    │
│  │ IPFS Daemon (Kubo/Helia)                        │    │
│  │ - Stores encrypted user files                   │    │
│  │ - Content-addressed storage                     │    │
│  │ - P2P file sharing                              │    │
│  │ - Gateway API for browser access                │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Hardware Options:                                       │
│  • Raspberry Pi 4/5 (8GB RAM) - $75-100                 │
│  • Synology/QNAP NAS - $200-500                         │
│  • Old laptop/desktop - Free (repurposed)               │
│  • VPS (Linode/DigitalOcean) - $5-20/month              │
└──────────────────────────────────────────────────────────┘
```

### User Experience Goal

**Scenario**: User travels from New York → Tokyo

**Current Puter**:
- ❌ Files stored on server (centralized)
- ❌ Trust server operator
- ❌ Data locked to one provider

**ElastOS with IPFS**:
- ✅ Login with wallet from Tokyo hotel
- ✅ Desktop loads with ALL files (from personal IPFS node at home)
- ✅ Edit document → Saved to personal node via IPFS
- ✅ Upload photo → Stored on personal hardware
- ✅ Share file → P2P via IPFS (no middleman)
- ✅ True data sovereignty

---

## First Principles Analysis

### What is IPFS? (InterPlanetary File System)

**Core Concept**: Content-addressed storage instead of location-addressed

**Traditional Web** (Location-based):
```
Get file at: https://server.com/documents/resume.pdf
Problem: If server.com goes down, file is gone
```

**IPFS** (Content-based):
```
Get file with hash: QmX...abc123
Benefit: File retrieved from ANY node that has it (P2P)
```

### IPFS Fundamentals

#### 1. Content Addressing
```javascript
// Traditional filesystem
"/home/user/documents/resume.pdf"  // Path-based

// IPFS
"QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"  // Hash-based
```

**Implication**: Files are immutable. Same content = same hash. Updates create new hashes.

#### 2. Merkle DAG (Directed Acyclic Graph)
```
File: big-video.mp4 (100 MB)
         ↓
    Split into chunks
         ↓
┌─────────────────────────────┐
│ Chunk 1 → QmABC123          │
│ Chunk 2 → QmDEF456          │
│ Chunk 3 → QmGHI789          │
└─────────────────────────────┘
         ↓
  Root Hash → QmROOT999
```

**Implication**: Large files efficiently stored and retrieved. Can fetch from multiple peers simultaneously.

#### 3. IPNS (InterPlanetary Name System)
```
Mutable Pointer:
/ipns/k51qzi5uqu5dl... → QmLatestVersion

Update pointer when content changes:
/ipns/k51qzi5uqu5dl... → QmNewerVersion
```

**Implication**: We can have "folders" that update while keeping a stable reference.

---

## Integration Strategy with Puter

### Decision Matrix: IPFS Implementation Approaches

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **1. Browser IPFS (js-ipfs/Helia in-browser)** | ✅ No server needed<br>✅ Pure P2P<br>✅ Works offline | ❌ Limited by browser storage<br>❌ High CPU/RAM usage<br>❌ Can't run 24/7 | ❌ Not suitable for "personal cloud" |
| **2. Remote IPFS Node (HTTP API)** | ✅ Persistent storage<br>✅ Runs 24/7<br>✅ Full IPFS features<br>✅ User controls hardware | ✅ Best fit<br>✅ Aligns with vision | ✅ **RECOMMENDED** |
| **3. Hybrid (Browser + Remote)** | ✅ Works offline temporarily<br>✅ Syncs to remote | ❌ Complex sync logic<br>❌ Conflict resolution<br>❌ Overkill for v1 | ⏳ Future enhancement |

### Recommended Approach: Remote IPFS Node via HTTP API

**Why This Aligns with Vision**:
1. **Personal Cloud**: User's IPFS node runs on their hardware (Pi, NAS, VPS)
2. **True Ownership**: Files physically stored on user's device
3. **Global Access**: Connect from anywhere via IPFS gateway API
4. **Always On**: Node runs 24/7, maintains DHT connections
5. **Scalable**: Can upgrade hardware as storage needs grow

---

## Technical Design

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (ElastOS Frontend)                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Puter Desktop UI                                       │  │
│  │ - File Browser shows IPFS files                        │  │
│  │ - Apps read/write via IPFS driver                      │  │
│  └────────────┬───────────────────────────────────────────┘  │
└───────────────┼──────────────────────────────────────────────┘
                │
                │ Puter API calls
                ▼
┌──────────────────────────────────────────────────────────────┐
│  ElastOS Backend (Node.js)                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ IPFS Extension                                         │  │
│  │                                                        │  │
│  │ Driver: "storage" interface, "ipfs" implementation     │  │
│  │                                                        │  │
│  │ Methods:                                               │  │
│  │ - connect(nodeUrl, apiKey)                            │  │
│  │ - upload(file) → CID                                  │  │
│  │ - download(cid) → file                                │  │
│  │ - list(path) → files[]                                │  │
│  │ - mkdir(path)                                         │  │
│  │ - delete(cid)                                         │  │
│  │ - pin(cid) → ensure persistence                       │  │
│  │ - unpin(cid) → allow garbage collection              │  │
│  └────────────┬───────────────────────────────────────────┘  │
└───────────────┼──────────────────────────────────────────────┘
                │
                │ IPFS HTTP API
                │ (https://ipfs-node.example.com:5001)
                ▼
┌──────────────────────────────────────────────────────────────┐
│  User's Personal IPFS Node                                   │
│  (Raspberry Pi at home, VPS, NAS, etc.)                      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ IPFS Daemon (Kubo)                                     │  │
│  │                                                        │  │
│  │ API Server: :5001 (HTTP API for programmatic access)  │  │
│  │ Gateway: :8080 (HTTP gateway for browser access)      │  │
│  │ Swarm: :4001 (P2P connections)                        │  │
│  │                                                        │  │
│  │ Storage:                                               │  │
│  │ /data/ipfs/ (user's files, encrypted)                 │  │
│  │ - Indexed by CID                                      │  │
│  │ - Pinned for persistence                              │  │
│  │ - Replicated across swarm                             │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Extension File Structure (Planned)

```
extensions/ipfs-storage/
├── package.json
├── main.js                               # Extension entry point
├── drivers/
│   └── IPFSStorageDriver.js             # Driver implementation
├── services/
│   ├── IPFSConnectionService.js         # Manages connection to user's node
│   ├── IPFSFileSystemService.js         # Filesystem operations
│   └── IPFSPinningService.js            # Pin management
├── lib/
│   ├── ipfs-client.js                   # HTTP API wrapper
│   ├── encryption.js                    # File encryption utilities
│   └── cid-mapper.js                    # CID ↔ Path mapping
└── migrations/
    └── 0042_ipfs_node_config.sql        # Store user's node URL/credentials
```

---

## Implementation Phases

### Phase 1: Basic IPFS Driver (Week 1-2)

**Goal**: Upload/download files to IPFS node

#### Deliverables:
- [ ] Create `ipfs-storage` extension skeleton
- [ ] Implement IPFSStorageDriver with methods:
  - `connect({ nodeUrl, apiKey })`
  - `upload({ file, encrypt })`
  - `download({ cid, decrypt })`
- [ ] Create database migration for storing:
  - User's IPFS node URL
  - API credentials (encrypted)
  - CID → filename mapping
- [ ] Test with local Kubo node

#### Technical Decisions:

**IPFS Client Library**: Use `ipfs-http-client` (official)
```javascript
import { create } from 'ipfs-http-client';

const ipfs = create({
    host: 'ipfs-node.example.com',
    port: 5001,
    protocol: 'https',
    headers: {
        authorization: 'Bearer ' + apiKey
    }
});
```

**Database Schema** (0042_ipfs_node_config.sql):
```sql
CREATE TABLE user_ipfs_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    node_url VARCHAR(255) NOT NULL,
    api_key_encrypted TEXT,  -- Encrypted with user's wallet signature
    is_default BOOLEAN DEFAULT 1,
    created_at INTEGER NOT NULL,
    
    FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE,
    INDEX idx_user_nodes (user_id)
);

CREATE TABLE ipfs_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    cid VARCHAR(255) NOT NULL,           -- IPFS content identifier
    file_path VARCHAR(1024) NOT NULL,    -- Virtual path in Puter
    file_name VARCHAR(255) NOT NULL,
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

#### Extension Structure (Phase 1)

**extensions/ipfs-storage/main.js**:
```javascript
const { create } = require('ipfs-http-client');

// Create storage interface
extension.on('create.interfaces', event => {
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
    const IPFSStorageDriver = require('./drivers/IPFSStorageDriver');
    event.createDriver('storage', 'ipfs', new IPFSStorageDriver());
});

// Grant permissions
extension.on('create.permissions', event => {
    event.grant_to_everyone('service:ipfs:ii:storage');
});
```

**extensions/ipfs-storage/drivers/IPFSStorageDriver.js**:
```javascript
const { create } = require('ipfs-http-client');
const crypto = require('crypto');

class IPFSStorageDriver {
    constructor() {
        this.connections = new Map(); // user_id → ipfs client
    }
    
    async connect({ nodeUrl, apiKey }, context) {
        const userId = context.user.id;
        
        const ipfs = create({
            url: nodeUrl,
            headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {}
        });
        
        // Test connection
        try {
            await ipfs.id();
            this.connections.set(userId, ipfs);
            
            // Store node config in database
            const { db } = extension.import('data');
            await db.write(
                `INSERT OR REPLACE INTO user_ipfs_nodes 
                (user_id, node_url, api_key_encrypted, is_default, created_at) 
                VALUES (?, ?, ?, 1, ?)`,
                [userId, nodeUrl, this.encryptApiKey(apiKey, context.user.wallet_address), Date.now()]
            );
            
            return { success: true, nodeId: await ipfs.id() };
        } catch (error) {
            throw new Error(`Failed to connect to IPFS node: ${error.message}`);
        }
    }
    
    async upload({ file, path, encrypt = true }, context) {
        const userId = context.user.id;
        const ipfs = this.connections.get(userId);
        
        if (!ipfs) {
            throw new Error('Not connected to IPFS node. Call connect() first.');
        }
        
        // Encrypt file if requested
        let fileBuffer = file;
        if (encrypt) {
            fileBuffer = this.encryptFile(file, context.user.wallet_address);
        }
        
        // Upload to IPFS
        const { cid } = await ipfs.add(fileBuffer, {
            pin: true,  // Auto-pin for persistence
            wrapWithDirectory: false
        });
        
        // Store mapping in database
        const { db } = extension.import('data');
        await db.write(
            `INSERT INTO ipfs_files 
            (user_id, cid, file_path, file_name, file_size, is_encrypted, is_pinned, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
            [
                userId, 
                cid.toString(), 
                path, 
                path.split('/').pop(), 
                file.length,
                encrypt ? 1 : 0,
                Date.now(),
                Date.now()
            ]
        );
        
        return { 
            success: true, 
            cid: cid.toString(),
            path: path 
        };
    }
    
    async download({ cid, decrypt = true }, context) {
        const userId = context.user.id;
        const ipfs = this.connections.get(userId);
        
        if (!ipfs) {
            throw new Error('Not connected to IPFS node. Call connect() first.');
        }
        
        // Download from IPFS
        const chunks = [];
        for await (const chunk of ipfs.cat(cid)) {
            chunks.push(chunk);
        }
        let fileBuffer = Buffer.concat(chunks);
        
        // Decrypt if needed
        if (decrypt) {
            fileBuffer = this.decryptFile(fileBuffer, context.user.wallet_address);
        }
        
        return {
            success: true,
            data: fileBuffer,
            cid: cid
        };
    }
    
    // Encryption helpers (using wallet address as key derivation)
    encryptFile(buffer, walletAddress) {
        const key = crypto.scryptSync(walletAddress, 'salt', 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
        return Buffer.concat([iv, encrypted]); // Prepend IV
    }
    
    decryptFile(buffer, walletAddress) {
        const key = crypto.scryptSync(walletAddress, 'salt', 32);
        const iv = buffer.slice(0, 16);
        const encrypted = buffer.slice(16);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }
    
    encryptApiKey(apiKey, walletAddress) {
        if (!apiKey) return null;
        // Simple encryption - in production use proper key management
        const key = crypto.scryptSync(walletAddress, 'salt', 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
        return Buffer.concat([iv, encrypted]).toString('base64');
    }
}

module.exports = IPFSStorageDriver;
```

---

### Phase 2: Filesystem Integration (Week 3-4)

**Goal**: Make IPFS appear as a native Puter filesystem

#### Approach 1: IPFS as Mountpoint (Recommended for v1)
```javascript
// In MountpointService.js
const mountpoints = {
    '/': { mounter: 'dbfs' },         // Local SQLite cache
    '/ipfs/': { mounter: 'ipfs' }     // Remote IPFS node
};
```

**User Experience**:
```
/home/user/Documents/        ← DBFSProvider (fast, local cache)
/ipfs/QmAbc.../              ← IPFSProvider (read-only, global content)
/ipfs-personal/              ← IPFSProvider (user's personal files)
```

**Implementation**:

**extensions/ipfs-storage/providers/IPFSProvider.js**:
```javascript
const { create } = require('ipfs-http-client');

class IPFSProvider {
    constructor(mountpoint, services) {
        this.mountpoint = mountpoint;
        this.services = services;
        this.log = services.get('log-service').create('IPFSProvider');
        this.cache = new Map(); // CID → metadata cache
    }
    
    async mount({ path, options }) {
        this.log.info(`Mounting IPFSProvider at ${path}`);
        this.nodeUrl = options.nodeUrl || 'http://localhost:5001';
        this.ipfs = create({ url: this.nodeUrl });
        
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
            // Note: IPFS is content-addressed, some capabilities may differ
        ]);
    }
    
    async stat({ selector }) {
        // For IPFS, we need to maintain a mapping of paths → CIDs
        // This will be in the ipfs_files table
        const { db } = this.services.get('database').get(DB_READ, 'ipfs');
        
        if (selector instanceof NodePathSelector) {
            const path = selector.value;
            const file = await db.read(
                'SELECT * FROM ipfs_files WHERE file_path = ? AND user_id = ?',
                [path, this.getCurrentUserId()]
            );
            
            if (!file || !file[0]) return null;
            
            return {
                uuid: file[0].cid,  // Use CID as UUID
                path: file[0].file_path,
                is_dir: false,
                size: file[0].file_size,
                modified: file[0].updated_at,
                // ... other metadata
            };
        }
        
        // Handle other selector types...
    }
    
    async readdir({ node }) {
        // For IPFS directories, we query the database for files under this path
        const { db } = this.services.get('database').get(DB_READ, 'ipfs');
        
        const children = await db.read(
            `SELECT cid FROM ipfs_files 
            WHERE file_path LIKE ? AND user_id = ?`,
            [node.entry.path + '/%', this.getCurrentUserId()]
        );
        
        return children.map(c => c.cid);
    }
    
    async read({ node, offset, length }) {
        // Download file from IPFS
        const cid = node.entry.uuid; // CID stored as UUID
        
        const chunks = [];
        for await (const chunk of this.ipfs.cat(cid, { offset, length })) {
            chunks.push(chunk);
        }
        
        let buffer = Buffer.concat(chunks);
        
        // Decrypt if file was encrypted
        if (node.entry.is_encrypted) {
            buffer = this.decryptFile(buffer);
        }
        
        return buffer;
    }
    
    async write({ node, buffer }) {
        // Encrypt file
        const encrypted = this.encryptFile(buffer);
        
        // Upload to IPFS
        const { cid } = await this.ipfs.add(encrypted, { pin: true });
        
        // Update database mapping
        const { db } = this.services.get('database').get(DB_WRITE, 'ipfs');
        await db.write(
            `UPDATE ipfs_files SET cid = ?, file_size = ?, updated_at = ? 
            WHERE file_path = ? AND user_id = ?`,
            [cid.toString(), buffer.length, Date.now(), node.entry.path, this.getCurrentUserId()]
        );
        
        return { cid: cid.toString() };
    }
    
    getCurrentUserId() {
        // Get from context - TBD based on Puter's context system
        return this.services.get('auth').getCurrentUser().id;
    }
    
    encryptFile(buffer) {
        // Use wallet address as encryption key
        // Implementation similar to IPFSStorageDriver
    }
    
    decryptFile(buffer) {
        // Decrypt using wallet address
    }
}

module.exports = { IPFSProvider };
```

#### Register in PuterFSModule:
```javascript
// src/backend/src/modules/puterfs/PuterFSModule.js
const { IPFSService } = require('../../extensions/ipfs-storage/services/IPFSService');
services.registerService('ipfs', IPFSService);
```

---

### Phase 2: GUI Integration (Week 3-4)

**Goal**: Users can configure their IPFS node from Settings

#### Deliverables:
- [ ] Create UIWindowIPFSSettings component
- [ ] Add "IPFS Storage" tab to Settings
- [ ] UI for:
  - Enter IPFS node URL
  - Enter API key (optional)
  - Test connection button
  - View pinned files list
  - Storage usage metrics

#### UI Design (Settings → IPFS Storage)

```
┌──────────────────────────────────────────────┐
│ IPFS Storage Settings                        │
├──────────────────────────────────────────────┤
│                                              │
│  Node URL:                                   │
│  ┌────────────────────────────────────────┐  │
│  │ https://my-node.example.com:5001      │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  API Key (optional):                         │
│  ┌────────────────────────────────────────┐  │
│  │ ••••••••••••••••••••                  │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  [Test Connection]  [Save]                   │
│                                              │
│  Status: ✅ Connected to node                │
│  Peer ID: 12D3KooWA...                       │
│  Storage Used: 2.3 GB / 100 GB               │
│                                              │
├──────────────────────────────────────────────┤
│ Pinned Files (342)                           │
│                                              │
│  📄 resume.pdf          QmABC... 2.1 MB     │
│  📄 vacation.jpg        QmDEF... 8.3 MB     │
│  📁 Projects/           QmGHI... (12 files)  │
│                                              │
│  [Unpin Selected] [Garbage Collect]          │
└──────────────────────────────────────────────┘
```

**File**: `src/gui/src/UI/Settings/UIWindowIPFSSettings.js`

---

### Phase 3: Hybrid Storage (Week 5-6)

**Goal**: Seamlessly use both local DB and IPFS

#### Strategy: Smart Caching Layer

```
User saves file
    ↓
┌───────────────────────────────┐
│ Write to DBFSProvider (fast) │  ← Immediate response
└───────────────┬───────────────┘
                │
                │ Background sync
                ▼
┌───────────────────────────────┐
│ Upload to IPFS (slow)         │  ← Eventual consistency
└───────────────┬───────────────┘
                │
                ▼
       Update DB with CID

User reads file
    ↓
Check DBFSProvider cache
    ↓
    ├─ Found → Return immediately
    │
    └─ Not found → Fetch from IPFS → Cache in DB → Return
```

**Implementation**: New service `IPFSSyncService`

```javascript
class IPFSSyncService extends BaseService {
    async ['__on_boot.consolidation']() {
        // Listen for file writes
        const svc_filesystem = this.services.get('filesystem');
        
        svc_filesystem.on('file.written', async ({ path, user_id }) => {
            // Background upload to IPFS
            this.queueForIPFSUpload(path, user_id);
        });
    }
    
    async queueForIPFSUpload(path, user_id) {
        // Add to upload queue (processed by worker)
        const { kv } = extension.import('data');
        
        const queue = await kv.get('ipfs-upload-queue') || [];
        queue.push({ path, user_id, queued_at: Date.now() });
        await kv.set('ipfs-upload-queue', queue);
        
        // Process queue asynchronously
        this.processUploadQueue();
    }
    
    async processUploadQueue() {
        // Debounced processor to avoid overwhelming IPFS node
        // Processes one file at a time with 1-second delay
    }
}
```

---

### Phase 4: IPFS Node Setup (Hardware)

**Goal**: Users can easily deploy their personal IPFS node

#### Raspberry Pi Setup Script

**File**: `scripts/setup-ipfs-node-pi.sh`

```bash
#!/bin/bash
# ElastOS Personal IPFS Node Setup
# Tested on: Raspberry Pi 4/5 (8GB RAM)
# OS: Raspberry Pi OS (64-bit)

set -e

echo "🚀 Setting up ElastOS Personal IPFS Node..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y curl wget git

# Install Kubo (IPFS implementation)
IPFS_VERSION="v0.24.0"
wget https://dist.ipfs.tech/kubo/${IPFS_VERSION}/kubo_${IPFS_VERSION}_linux-arm64.tar.gz
tar -xvzf kubo_${IPFS_VERSION}_linux-arm64.tar.gz
cd kubo
sudo bash install.sh

# Initialize IPFS
ipfs init --profile=lowpower

# Configure for remote access
ipfs config Addresses.API /ip4/0.0.0.0/tcp/5001
ipfs config Addresses.Gateway /ip4/0.0.0.0/tcp/8080

# Set storage limits (adjust based on available space)
ipfs config Datastore.StorageMax "100GB"

# Enable CORS for browser access
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST", "GET"]'

# Create systemd service
sudo tee /etc/systemd/system/ipfs.service > /dev/null <<EOF
[Unit]
Description=IPFS Daemon
After=network.target

[Service]
Type=simple
User=pi
Environment="IPFS_PATH=/home/pi/.ipfs"
ExecStart=/usr/local/bin/ipfs daemon --enable-gc --migrate
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable ipfs
sudo systemctl start ipfs

# Wait for daemon to start
sleep 5

# Get node ID
PEER_ID=$(ipfs id -f='<id>')
echo ""
echo "✅ IPFS Node Setup Complete!"
echo ""
echo "📋 Configuration:"
echo "   API URL: http://$(hostname -I | awk '{print $1}'):5001"
echo "   Gateway URL: http://$(hostname -I | awk '{print $1}'):8080"
echo "   Peer ID: $PEER_ID"
echo ""
echo "🔐 Security: Set up API key for production!"
echo "   Run: ipfs config --json API.Authorizations '{\"mykey\": {\"Secret\": \"YOUR_SECRET\"}}'"
echo ""
echo "🌐 Port Forwarding:"
echo "   Forward port 4001 for P2P connections"
echo "   Forward port 5001 for API (or use VPN/tunnel)"
echo ""
```

#### Docker Setup (Alternative)

**File**: `docker/ipfs-node/docker-compose.yml`

```yaml
version: '3.8'

services:
  ipfs:
    image: ipfs/kubo:latest
    container_name: elastos-ipfs-node
    environment:
      - IPFS_PROFILE=server
    ports:
      - "4001:4001"     # P2P
      - "4001:4001/udp" # P2P UDP
      - "5001:5001"     # API
      - "8080:8080"     # Gateway
    volumes:
      - ./data:/data/ipfs
      - ./staging:/export
    restart: unless-stopped
```

---

### Phase 5: Advanced Features (Week 7-8)

#### Feature 1: IPFS Cluster (Multi-Node Replication)
**Use Case**: Backup files across multiple nodes

```
User's Setup:
- Node 1: Raspberry Pi at home (primary)
- Node 2: VPS in cloud (backup)
- Node 3: Friend's Pi (collaborative backup)

All nodes auto-sync user's pinned files
```

#### Feature 2: IPNS Mutable Folders
**Use Case**: "My Documents" folder that updates

```
/ipfs-personal/Documents → /ipns/k51qzi5uqu5dl...
    ↓
When user adds file:
1. Add file to IPFS → QmNewFile
2. Update directory manifest
3. Publish new IPNS record
    ↓
All devices see updated folder immediately
```

#### Feature 3: Public Sharing via IPFS
**Use Case**: Share files via global IPFS network

```
User right-clicks file → "Share via IPFS"
    ↓
Generate shareable link:
https://ipfs.io/ipfs/QmABC123...
or
https://cloudflare-ipfs.com/ipfs/QmABC123...
    ↓
Anyone in world can access (no ElastOS account needed)
```

---

## Implementation Roadmap

### Sprint 1-2 (Weeks 1-2): Core Driver
- [ ] Set up ipfs-storage extension structure
- [ ] Implement IPFSStorageDriver (connect, upload, download)
- [ ] Create database migrations
- [ ] Write unit tests for driver methods
- [ ] Test with local Kubo node

**Acceptance Criteria**:
- Can connect to IPFS node via API
- Can upload a file and get CID back
- Can download a file using CID
- Database correctly maps paths ↔ CIDs

### Sprint 3-4 (Weeks 3-4): Filesystem Provider
- [ ] Implement IPFSProvider class
- [ ] Integrate with MountpointService
- [ ] Add IPFS mountpoint to config
- [ ] Implement stat, readdir, read, write methods
- [ ] Test filesystem operations via Puter UI

**Acceptance Criteria**:
- /ipfs-personal/ appears in file browser
- Can create folders in IPFS storage
- Can save files from Puter apps to IPFS
- Can open files from IPFS in Puter apps

### Sprint 5-6 (Weeks 5-6): GUI & Settings
- [ ] Create UIWindowIPFSSettings
- [ ] Add Settings tab for IPFS configuration
- [ ] Implement node connection UI
- [ ] Add pinned files viewer
- [ ] Create storage usage dashboard

**Acceptance Criteria**:
- User can configure node URL from Settings
- Connection status visible
- Can view all pinned files
- Storage metrics displayed

### Sprint 7-8 (Weeks 7-8): Optimization & Polish
- [ ] Implement smart caching (IPFSSyncService)
- [ ] Add background sync queue
- [ ] Optimize upload/download for large files
- [ ] Add progress indicators for IPFS operations
- [ ] Implement retry logic for failed uploads

**Acceptance Criteria**:
- Files save instantly (cached), sync in background
- Progress bars for large file uploads
- Graceful handling of node offline scenarios
- No blocking operations

---

## Technical Challenges & Solutions

### Challenge 1: IPFS is Slow (Compared to Local DB)
**Problem**: IPFS operations can take seconds, Puter expects instant responses

**Solution**: Write-through cache
```javascript
// Write path:
User saves file → Write to DBFSProvider (instant) → Queue for IPFS upload
                  ↓
            Return success to user (don't wait for IPFS)
                  
// Background worker uploads to IPFS asynchronously
```

### Challenge 2: Content Addressing vs Path Addressing
**Problem**: IPFS uses CIDs, Puter uses paths

**Solution**: Maintain mapping table
```sql
CREATE TABLE ipfs_path_cid_map (
    user_id INT,
    path VARCHAR(1024),
    cid VARCHAR(255),
    version INT,  -- For handling updates
    is_latest BOOLEAN
);
```

**When file updates**:
```
Old: /Documents/resume.pdf → QmOLD123 (version 1, is_latest=false)
New: /Documents/resume.pdf → QmNEW456 (version 2, is_latest=true)
```

### Challenge 3: IPFS Node Discovery
**Problem**: How does ElastOS find user's personal node?

**Solutions**:

**Option A: Manual Configuration** (v1 - simplest)
```
User enters node URL in Settings
Stored in database
Used for all subsequent operations
```

**Option B: DID-Based Discovery** (v2 - future)
```
User's DID document contains:
{
    "id": "did:elastos:abc123",
    "service": [{
        "type": "IPFSNode",
        "serviceEndpoint": "https://ipfs-node.example.com:5001"
    }]
}

ElastOS queries DID → Automatically discovers node URL
```

**Option C: DHT Announcement** (v3 - advanced)
```
IPFS node announces itself on DHT with user's wallet address
ElastOS queries DHT for nodes owned by user
Auto-connects to nearest/fastest node
```

### Challenge 4: File Encryption
**Problem**: IPFS is public network, files are accessible by CID

**Solution**: Client-side encryption before upload

**Encryption Strategy**:
```javascript
// Derive encryption key from wallet signature
const message = "ElastOS File Encryption Key";
const signature = await wallet.signMessage(message);
const encryptionKey = crypto.createHash('sha256').update(signature).digest();

// Encrypt file
const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
const encrypted = Buffer.concat([cipher.update(file), cipher.final()]);

// Upload encrypted file to IPFS
const { cid } = await ipfs.add(encrypted);

// Only user with wallet can decrypt (via signature)
```

**Benefits**:
- Files are public on IPFS (CIDs discoverable)
- Content is private (encrypted)
- Only wallet owner can decrypt
- No password management needed

### Challenge 5: IPFS Node Authentication
**Problem**: IPFS API needs to be secured

**Solutions**:

**Option A: API Key** (Simplest):
```javascript
ipfs config --json API.Authorizations '{
    "user1": {"Secret": "random-secret-key"}
}'

// In ElastOS
const ipfs = create({
    url: 'https://node.example.com:5001',
    headers: {
        authorization: 'Basic ' + btoa('user1:random-secret-key')
    }
});
```

**Option B: Wallet Signature** (More Web3):
```javascript
// User signs message with wallet
const signature = await wallet.signMessage("IPFS API Access");

// IPFS node validates signature
// Custom auth middleware for Kubo
```

**Option C: VPN/Tailscale** (Most Secure):
```
User's devices → Tailscale VPN → IPFS node
No public API exposure
Encrypted tunnel
```

---

## Filesystem Strategy: Hybrid Approach

### Recommended: Dual-Provider System

```javascript
// MountpointService configuration
const mountpoints = {
    '/': { 
        mounter: 'dbfs',  // Local SQLite (fast, always available)
        options: {}
    },
    '/ipfs-personal/': {
        mounter: 'ipfs',  // Remote IPFS node (persistent, decentralized)
        options: {
            nodeUrl: user.ipfs_node_url,
            syncMode: 'background'  // Don't block UI
        }
    }
};
```

### File Placement Rules

**Local DB** (`/` → DBFSProvider):
- Temporary files
- Small files (<1 MB)
- Frequently accessed files
- Files needing instant access

**IPFS** (`/ipfs-personal/` → IPFSProvider):
- User documents
- Photos, videos
- Archives, backups
- Files to share globally
- Files needing permanence

**Hybrid** (Both):
- User can opt-in per file/folder: "Pin to IPFS"
- DBFSProvider serves as cache
- IPFSProvider is source of truth

---

## Migration Path for Existing Files

### Scenario: User Already Has Files in Puter

**Challenge**: Existing files are in `fsentries` table, need to migrate to IPFS

**Solution**: Gradual migration UI

```
Settings → IPFS Storage → Migrate Files

┌──────────────────────────────────────────────┐
│ Migrate Existing Files to IPFS              │
├──────────────────────────────────────────────┤
│                                              │
│  ⚠️ This will upload your files to IPFS     │
│     Files will remain accessible in Puter    │
│                                              │
│  Select folders to migrate:                  │
│  ☑ Documents (12 files, 45 MB)              │
│  ☐ Photos (234 files, 2.3 GB)              │
│  ☑ Projects (8 folders, 156 MB)            │
│                                              │
│  Total: 20 items, 201 MB                     │
│                                              │
│  [Cancel] [Start Migration]                  │
└──────────────────────────────────────────────┘

During migration:
┌──────────────────────────────────────────────┐
│ Migrating to IPFS... (15/20)                 │
├──────────────────────────────────────────────┤
│                                              │
│  ████████████████░░░░ 75%                    │
│                                              │
│  Current: Projects/app.js                    │
│  CID: QmABC123...                            │
│                                              │
│  Estimated time: 2 minutes                   │
└──────────────────────────────────────────────┘
```

**Backend Process**:
```javascript
async function migrateFilesToIPFS(userId, filePaths) {
    const { db } = extension.import('data');
    const ipfsDriver = getIPFSDriver(userId);
    
    for (const path of filePaths) {
        // Read from DBFSProvider
        const file = await readFileFromDB(path, userId);
        
        // Upload to IPFS
        const { cid } = await ipfsDriver.upload({
            file: file.buffer,
            path: path,
            encrypt: true
        });
        
        // Keep in DB for caching, mark as IPFS-backed
        await db.write(
            `UPDATE fsentries SET 
            storage_backend = 'ipfs', 
            ipfs_cid = ? 
            WHERE path = ? AND user_id = ?`,
            [cid, path, userId]
        );
        
        // Update progress
        emitProgress(path, cid);
    }
}
```

---

## Hardware Recommendations

### Option 1: Raspberry Pi 5 (Recommended for Beginners)
**Specs**:
- RAM: 8GB
- Storage: 1TB NVMe SSD (via PCIe)
- Cost: ~$150 total

**Pros**:
- Low power consumption (~10W)
- Quiet, compact
- Easy setup
- Good IPFS performance

**Cons**:
- Limited to 1TB easily
- ARM architecture (some software compatibility issues)

### Option 2: Synology/QNAP NAS (Recommended for Advanced)
**Specs**:
- DS224+ or similar
- 8GB+ RAM
- 2x 4TB drives (RAID 1 for redundancy)
- Cost: ~$600 total

**Pros**:
- Docker support (easy IPFS deployment)
- RAID for data protection
- Expandable storage
- Runs multiple services

**Cons**:
- Higher cost
- Overkill for just IPFS

### Option 3: Repurposed Old Laptop/Desktop (Recommended for DIY)
**Specs**:
- Any Intel/AMD from last 10 years
- 4GB+ RAM
- 500GB+ HDD/SSD
- Cost: Free (if you have old hardware)

**Pros**:
- Zero cost
- Plenty of power for IPFS
- Easy to upgrade storage

**Cons**:
- Higher power usage (~50W)
- Takes up more space

### Option 4: VPS (Recommended for Always-On Reliability)
**Provider**: Linode, DigitalOcean, Hetzner
**Specs**:
- 2 vCPU, 4GB RAM, 80GB SSD
- Cost: ~$12/month

**Pros**:
- Professional uptime (99.9%+)
- Fast internet connection
- No home network configuration
- Scalable storage

**Cons**:
- Monthly cost
- Trust VPS provider (not true "personal hardware")

---

## Network Configuration

### Exposing IPFS Node to Internet

#### Option 1: Port Forwarding (Simple but Insecure)
```
Router Settings:
- Forward external port 5001 → Pi internal IP:5001 (API)
- Forward external port 4001 → Pi internal IP:4001 (P2P)

Access from anywhere:
https://YOUR_HOME_IP:5001
```

**Security**: ⚠️ Must set API key!

#### Option 2: Cloudflare Tunnel (Recommended)
```bash
# Install cloudflared on Pi
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o cloudflared
sudo mv cloudflared /usr/local/bin/
sudo chmod +x /usr/local/bin/cloudflared

# Create tunnel
cloudflared tunnel create elastos-ipfs

# Configure
cloudflared tunnel route dns elastos-ipfs ipfs.yourdomain.com

# Run tunnel
cloudflared tunnel run elastos-ipfs
```

**Access**: `https://ipfs.yourdomain.com` (HTTPS, no port forwarding!)

#### Option 3: Tailscale VPN (Most Secure)
```bash
# Install Tailscale on Pi
curl -fsSL https://tailscale.com/install.sh | sh

# Join network
sudo tailscale up

# Access from any device on Tailscale:
https://pi-ipfs:5001
```

**Benefits**: Zero trust network, encrypted, no public exposure

---

## Data Model Design

### IPFS File Metadata

```sql
CREATE TABLE ipfs_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    
    -- IPFS identifiers
    cid VARCHAR(255) NOT NULL,           -- Current version CID
    ipns_key VARCHAR(255),               -- For mutable directories
    
    -- Puter compatibility
    file_path VARCHAR(1024) NOT NULL,    -- Virtual path
    file_name VARCHAR(255) NOT NULL,
    parent_path VARCHAR(1024),
    
    -- File metadata
    file_size BIGINT,
    mime_type VARCHAR(100),
    is_dir BOOLEAN DEFAULT 0,
    
    -- IPFS-specific
    is_encrypted BOOLEAN DEFAULT 1,
    is_pinned BOOLEAN DEFAULT 1,
    pin_status ENUM('pinned', 'pinning', 'unpinned') DEFAULT 'pinned',
    
    -- Sync status
    sync_status ENUM('synced', 'pending', 'failed') DEFAULT 'synced',
    last_synced_at INTEGER,
    
    -- Version control
    version INTEGER DEFAULT 1,
    is_latest BOOLEAN DEFAULT 1,
    
    -- Timestamps
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    
    FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE,
    
    INDEX idx_user_path (user_id, file_path),
    INDEX idx_user_cid (user_id, cid),
    INDEX idx_sync_status (user_id, sync_status),
    INDEX idx_latest (user_id, is_latest)
);

CREATE TABLE ipfs_file_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    cid VARCHAR(255) NOT NULL,
    version INTEGER NOT NULL,
    file_size BIGINT,
    created_at INTEGER NOT NULL,
    
    FOREIGN KEY(file_id) REFERENCES ipfs_files(id) ON DELETE CASCADE,
    UNIQUE INDEX idx_file_version (file_id, version)
);
```

### User IPFS Node Configuration

```sql
CREATE TABLE user_ipfs_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    
    -- Connection details
    node_url VARCHAR(255) NOT NULL,      -- https://node.example.com:5001
    gateway_url VARCHAR(255),            -- https://node.example.com:8080
    api_key_encrypted TEXT,              -- Encrypted with wallet signature
    
    -- Node metadata
    peer_id VARCHAR(255),                -- IPFS peer ID
    is_active BOOLEAN DEFAULT 1,
    last_connected_at INTEGER,
    
    -- Settings
    auto_pin BOOLEAN DEFAULT 1,          -- Auto-pin uploaded files
    auto_sync BOOLEAN DEFAULT 1,         -- Auto-sync on file change
    
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    
    FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE,
    INDEX idx_user_active (user_id, is_active)
);
```

---

## Security Model

### Threat Model

**Threats**:
1. IPFS node compromise → Files readable if not encrypted
2. Man-in-the-middle → Intercept API calls
3. API key leak → Unauthorized access to node
4. CID enumeration → Discover user's files
5. Storage exhaustion → Attacker fills user's node

**Mitigations**:

#### 1. End-to-End Encryption (E2EE)
```javascript
class FileEncryption {
    // Derive encryption key from wallet signature
    static async deriveKey(walletAddress, walletSign) {
        const message = `ElastOS Encryption Key v1\n${walletAddress}`;
        const signature = await walletSign(message);
        
        // Use PBKDF2 for key derivation
        return crypto.pbkdf2Sync(
            signature, 
            walletAddress,  // Salt
            100000,         // Iterations
            32,             // Key length
            'sha256'
        );
    }
    
    static encrypt(buffer, key) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
        const authTag = cipher.getAuthTag();
        
        // Format: [iv(16)][authTag(16)][encrypted]
        return Buffer.concat([iv, authTag, encrypted]);
    }
    
    static decrypt(buffer, key) {
        const iv = buffer.slice(0, 16);
        const authTag = buffer.slice(16, 32);
        const encrypted = buffer.slice(32);
        
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        
        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }
}
```

#### 2. HTTPS/TLS for All Connections
```javascript
const ipfs = create({
    url: 'https://node.example.com:5001',  // HTTPS only!
    agent: new https.Agent({
        rejectUnauthorized: true  // Verify certificates
    })
});
```

#### 3. Rate Limiting & Quotas
```javascript
class IPFSQuotaService {
    async checkQuota(userId) {
        const { db } = extension.import('data');
        
        const usage = await db.read(
            `SELECT SUM(file_size) as total 
            FROM ipfs_files 
            WHERE user_id = ? AND is_latest = 1`,
            [userId]
        );
        
        const quota = await this.getUserQuota(userId);  // e.g., 100 GB
        
        if (usage[0].total > quota) {
            throw new Error('Storage quota exceeded');
        }
    }
}
```

#### 4. Access Control
```javascript
// Only user's wallet can access their files
extension.on('create.permissions', event => {
    // Require wallet ownership verification
    event.grant_to_users('service:ipfs:ii:storage', {
        condition: 'wallet_verified'
    });
});
```

---

## Performance Optimization

### 1. Chunked Uploads for Large Files
```javascript
async uploadLargeFile(file, path) {
    const CHUNK_SIZE = 1024 * 1024; // 1 MB chunks
    const chunks = [];
    
    for (let i = 0; i < file.length; i += CHUNK_SIZE) {
        const chunk = file.slice(i, i + CHUNK_SIZE);
        const encrypted = this.encrypt(chunk);
        const { cid } = await this.ipfs.add(encrypted, { pin: false });
        chunks.push(cid);
        
        // Emit progress
        this.emitProgress(i / file.length * 100);
    }
    
    // Create manifest
    const manifest = {
        chunks: chunks.map(c => c.toString()),
        totalSize: file.length,
        chunkSize: CHUNK_SIZE
    };
    
    // Upload manifest
    const { cid: rootCid } = await this.ipfs.add(JSON.stringify(manifest), { pin: true });
    
    return rootCid;
}
```

### 2. Parallel Downloads
```javascript
async downloadLargeFile(rootCid) {
    // Get manifest
    const manifestData = await this.ipfs.cat(rootCid);
    const manifest = JSON.parse(manifestData.toString());
    
    // Download chunks in parallel
    const chunkPromises = manifest.chunks.map(cid => 
        this.downloadChunk(cid)
    );
    
    const chunks = await Promise.all(chunkPromises);
    return Buffer.concat(chunks);
}
```

### 3. Lazy Loading for Directories
```javascript
async readdir({ path }) {
    // Only fetch metadata, not file contents
    const { db } = extension.import('data');
    
    const files = await db.read(
        `SELECT cid, file_name, file_size, is_dir 
        FROM ipfs_files 
        WHERE parent_path = ? AND is_latest = 1`,
        [path]
    );
    
    // Return lightweight metadata
    // Actual file content fetched on-demand
    return files;
}
```

---

## Testing Strategy

### Unit Tests

**Driver Methods**:
```javascript
describe('IPFSStorageDriver', () => {
    let driver, mockIPFS;
    
    beforeEach(() => {
        mockIPFS = {
            add: jest.fn(),
            cat: jest.fn(),
            pin: { add: jest.fn() }
        };
        driver = new IPFSStorageDriver(mockIPFS);
    });
    
    test('upload() encrypts and uploads to IPFS', async () => {
        const file = Buffer.from('test content');
        const result = await driver.upload({ file, path: '/test.txt' });
        
        expect(mockIPFS.add).toHaveBeenCalled();
        expect(result.cid).toBeDefined();
    });
    
    test('download() retrieves and decrypts from IPFS', async () => {
        const cid = 'QmABC123';
        mockIPFS.cat.mockResolvedValue([Buffer.from('encrypted')]);
        
        const result = await driver.download({ cid });
        
        expect(result.data).toBeDefined();
    });
});
```

### Integration Tests

**End-to-End Flow**:
```javascript
describe('IPFS Extension E2E', () => {
    test('User can save and retrieve file via IPFS', async () => {
        // 1. Connect to test IPFS node
        await puter.drivers.call('storage', 'ipfs', 'connect', {
            nodeUrl: 'http://localhost:5001'
        });
        
        // 2. Upload file
        const file = Buffer.from('Hello IPFS!');
        const { cid } = await puter.drivers.call('storage', 'ipfs', 'upload', {
            file: file,
            path: '/test.txt'
        });
        
        expect(cid).toMatch(/^Qm/);
        
        // 3. Download file
        const { data } = await puter.drivers.call('storage', 'ipfs', 'download', {
            cid: cid
        });
        
        expect(data.toString()).toBe('Hello IPFS!');
    });
});
```

### Manual Testing Checklist

**Phase 1**:
- [ ] Connect to local IPFS node
- [ ] Upload small text file
- [ ] Download file and verify content
- [ ] Upload large file (>100 MB)
- [ ] Test with encryption enabled
- [ ] Test with encryption disabled

**Phase 2**:
- [ ] Create folder in /ipfs-personal/
- [ ] Save file to IPFS from Text Editor app
- [ ] Open file from IPFS in Text Editor
- [ ] Delete file from IPFS
- [ ] Verify file removed from Puter UI

**Phase 3**:
- [ ] Configure remote IPFS node (Pi/VPS)
- [ ] Access from different computer
- [ ] Verify files sync across devices
- [ ] Test offline behavior (node unreachable)

---

## Production Deployment

### User Onboarding Flow

**First-Time Setup**:

```
1. User logs in with wallet (Particle Auth) ✅

2. Prompt: "Set up your personal storage"
   ┌────────────────────────────────────────┐
   │ Welcome to ElastOS!                    │
   ├────────────────────────────────────────┤
   │                                        │
   │ To use your decentralized storage,     │
   │ you need a personal IPFS node.         │
   │                                        │
   │ Options:                               │
   │                                        │
   │ ○ I have an IPFS node                 │
   │   (Enter node URL below)               │
   │                                        │
   │ ○ Set up new node                     │
   │   (We'll guide you through it)         │
   │                                        │
   │ ○ Use ElastOS Hosted Node (Beta)      │
   │   (Centralized, but convenient)        │
   │                                        │
   │ [Continue]                             │
   └────────────────────────────────────────┘

3. If "Set up new node":
   ┌────────────────────────────────────────┐
   │ IPFS Node Setup Guide                  │
   ├────────────────────────────────────────┤
   │                                        │
   │ 📦 What you'll need:                   │
   │ - Raspberry Pi 4/5 (8GB RAM) OR       │
   │ - Old laptop/desktop OR                │
   │ - Cloud VPS                            │
   │                                        │
   │ [Download Setup Script]                │
   │ [Watch Video Tutorial]                 │
   │ [Read Step-by-Step Guide]              │
   │                                        │
   │ Already done? Enter node URL:          │
   │ ┌────────────────────────────────────┐ │
   │ │ https://                          │ │
   │ └────────────────────────────────────┘ │
   │                                        │
   │ [Test Connection]                      │
   └────────────────────────────────────────┘
```

### Monitoring & Health Checks

**Service**: IPFSHealthCheckService

```javascript
class IPFSHealthCheckService extends BaseService {
    async ['__on_ready']() {
        // Check IPFS node health every 5 minutes
        setInterval(() => this.checkAllNodes(), 5 * 60 * 1000);
    }
    
    async checkAllNodes() {
        const { db } = extension.import('data');
        const nodes = await db.read(
            'SELECT * FROM user_ipfs_nodes WHERE is_active = 1'
        );
        
        for (const node of nodes) {
            const health = await this.checkNode(node.node_url);
            
            if (!health.reachable) {
                // Notify user
                this.services.get('notification').send({
                    user_id: node.user_id,
                    title: 'IPFS Node Offline',
                    message: 'Your personal IPFS node is unreachable. Files may not sync.',
                    type: 'warning'
                });
            }
            
            // Update database
            await db.write(
                `UPDATE user_ipfs_nodes 
                SET last_connected_at = ?, peer_id = ? 
                WHERE id = ?`,
                [Date.now(), health.peerId, node.id]
            );
        }
    }
    
    async checkNode(nodeUrl) {
        try {
            const ipfs = create({ url: nodeUrl, timeout: 5000 });
            const id = await ipfs.id();
            return { reachable: true, peerId: id.id };
        } catch (error) {
            return { reachable: false, error: error.message };
        }
    }
}
```

---

## Development Timeline

### Realistic Estimate: 8-10 Weeks

**Weeks 1-2**: Core driver implementation and testing  
**Weeks 3-4**: Filesystem provider integration  
**Weeks 5-6**: GUI settings and user onboarding  
**Weeks 7-8**: Optimization and polish  
**Weeks 9-10**: Production hardening and deployment

### Critical Path Dependencies

```
Week 1-2: IPFS Driver
    ↓ (blocks everything)
Week 3-4: Filesystem Provider
    ↓ (blocks GUI)
Week 5-6: GUI Integration
    ↓ (blocks testing)
Week 7-8: Optimization
    ↓ (blocks production)
Week 9-10: Deployment
```

**Parallelization Opportunities**:
- Hardware setup guide can be written during Week 1
- UI mockups can be designed during Week 2
- Documentation can be written throughout

---

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| IPFS node setup too complex for users | High | High | Create one-click setup script, video tutorials |
| IPFS too slow for real-time editing | Medium | High | Implement write-through cache, warn for large files |
| User's node goes offline | High | Medium | Fallback to cached version, queue syncs |
| Storage costs too high | Low | Medium | Warn users of storage limits, implement quotas |
| Encryption key management issues | Medium | High | Use deterministic key derivation from wallet |
| Network firewall blocks IPFS ports | Medium | Medium | Offer Cloudflare Tunnel alternative |

---

## Success Metrics

### Technical Metrics
- [ ] File upload latency <5 seconds for 10MB files
- [ ] File download latency <3 seconds for 10MB files
- [ ] Node connection success rate >95%
- [ ] Sync queue processing time <1 minute for 100 files
- [ ] Encryption/decryption overhead <10% of file size

### User Experience Metrics
- [ ] User can set up IPFS node in <30 minutes
- [ ] User can save file to IPFS in <10 seconds
- [ ] User can access files from 2+ devices
- [ ] Zero data loss (all files recoverable)
- [ ] <5% support requests about IPFS setup

---

## Future Enhancements (Beyond v1)

### 1. IPFS Cluster Multi-Node Replication
```
User configures multiple nodes:
- Primary: Raspberry Pi at home
- Backup: VPS in cloud
- Mirror: Friend's node (mutual backup)

Files automatically replicate across all nodes
If one node fails, others serve content
```

### 2. Collaborative Folders via IPFS
```
User creates shared folder → Generates IPNS key
Shares IPNS key with collaborators
All users can add files to shared folder
Updates propagate via IPFS pubsub
```

### 3. Decentralized CDN for Public Files
```
User marks folder as "public"
ElastOS generates shareable link
File served from:
- User's node (if online)
- ElastOS gateway nodes (fallback)
- Global IPFS network (ultimate fallback)
```

### 4. IPFS-Backed Email/Messaging
```
Email stored as IPFS files
Email addresses → IPNS keys
Retrieve mail from personal node
No centralized mail server
```

### 5. Version Control / Time Machine
```
Every file save creates new CID
Keep version history in ipfs_file_versions
User can revert to any previous version
Like Git, but for all files
```

---

## Economic Model

### Storage Costs

**Self-Hosted (Raspberry Pi)**:
- Hardware: $150 (one-time)
- Electricity: ~$2/month (10W @ $0.12/kWh)
- Internet: $0 (home connection)
- **Total Year 1**: $174
- **Total Year 2+**: $24/year

**Cloud VPS**:
- Linode 8GB: $60/month
- 500GB storage: $0.10/GB = $50/month
- **Total**: ~$110/month = $1,320/year

**Comparison to Centralized**:
- Google Drive 2TB: $10/month = $120/year (but you don't own it)
- Dropbox 2TB: $12/month = $144/year (can be shut down)
- ElastOS + Pi: $174 first year, **$24/year after** (true ownership!)

### User Value Proposition

**ElastOS Pitch**:
```
"For the cost of 2 months of Dropbox, own your cloud storage FOREVER.

- $150 one-time for Raspberry Pi
- Files stored on YOUR hardware
- Access from anywhere in the world
- True data ownership
- Can't be shut down or censored
- Privacy by default (encrypted)
- $2/month electricity (same as leaving laptop on)

Traditional cloud: Rent forever
ElastOS: Own forever"
```

---

## Next Steps (Action Items)

### Immediate (This Week)

1. **Review & Approve This Strategy**
   - Confirm architecture aligns with vision
   - Approve dual-provider approach
   - Sign off on security model

2. **Set Up Test Environment**
   - Install Kubo on local machine or VPS
   - Configure IPFS API for testing
   - Create test user accounts

3. **Create IPFS Extension Skeleton**
   - `mkdir extensions/ipfs-storage`
   - Create `package.json` and `main.js`
   - Set up basic driver structure

### Week 1 Sprint Planning

**Sprint Goal**: Functional IPFS driver that can upload/download files

**Tasks**:
- [ ] Create extension structure
- [ ] Implement IPFSStorageDriver.connect()
- [ ] Implement IPFSStorageDriver.upload()
- [ ] Implement IPFSStorageDriver.download()
- [ ] Create database migration 0042
- [ ] Write unit tests
- [ ] Test with local Kubo node

**Definition of Done**:
- Can programmatically upload file to IPFS
- Can retrieve file by CID
- CID stored in database
- All tests passing

---

## References & Resources

### IPFS Documentation
- **IPFS Docs**: https://docs.ipfs.tech/
- **Kubo (Go IPFS)**: https://github.com/ipfs/kubo
- **js-ipfs-http-client**: https://github.com/ipfs/js-ipfs-http-client
- **Helia (Modern JS IPFS)**: https://github.com/ipfs/helia

### Puter Extension Patterns
- **particle-auth extension**: Reference implementation (see `extensions/particle-auth/`)
- **Extension docs**: `src/backend/doc/extensions/`
- **Driver examples**: `extensions/builtins/`

### Encryption Best Practices
- **NaCl/libsodium**: https://github.com/jedisct1/libsodium
- **Web3 Encryption**: https://docs.metamask.io/wallet/how-to/encrypt-decrypt/

### Hardware Setup
- **Raspberry Pi IPFS**: https://medium.com/@rossbulat/introduction-to-ipfs-set-up-nodes-on-your-raspberry-pi-cluster-f8efb3199f3
- **IPFS Docker**: https://github.com/ipfs/kubo/tree/master/docs/docker
- **Tailscale**: https://tailscale.com/kb/1017/install/

---

## Open Questions & Decisions Needed

### 1. Encryption Strategy
**Question**: Should we use wallet signature for key derivation or separate master key?

**Option A: Wallet Signature** (Recommended)
- Pro: No separate key management
- Pro: Key tied to wallet ownership
- Con: Requires wallet connection for decryption
- Con: Can't share encrypted files easily

**Option B: Master Key (Stored Encrypted)**
- Pro: Can decrypt without wallet
- Pro: Can delegate decryption
- Con: Key management complexity
- Con: Additional security surface

**Recommendation**: Start with Option A for v1, add Option B for shared files later

### 2. Sync Strategy
**Question**: When should files sync to IPFS?

**Option A: Immediate** (Every save → IPFS upload)
- Pro: Always up-to-date
- Con: Slow for rapid edits
- Con: Creates many CIDs (file history explosion)

**Option B: Debounced** (Wait 5 seconds after last edit)
- Pro: Reduces unnecessary uploads
- Pro: Better for text editing
- Con: 5-second delay before file "safe"

**Option C: Manual** (User clicks "Sync to IPFS")
- Pro: User controls sync timing
- Pro: No surprise costs
- Con: User might forget to sync

**Recommendation**: Option B for auto-pinned folders, Option C for opt-in folders

### 3. Quota Limits
**Question**: How much IPFS storage should users get?

**Recommendation**:
- Free tier: 10 GB
- Pro tier: 100 GB ($5/month)
- Enterprise: 1 TB+ (custom pricing)

**Implementation**: Enforce in IPFSQuotaService before uploads

---

## Comparison with Existing Solutions

### vs. Filecoin
- **Filecoin**: Pay for decentralized storage (retrieval fees)
- **ElastOS + IPFS**: Own your hardware (no ongoing fees)
- **Verdict**: ElastOS better for personal cloud, Filecoin better for public archives

### vs. Storj/Sia
- **Storj/Sia**: Distributed cloud storage (similar to S3)
- **ElastOS + IPFS**: Personal node (you control hardware)
- **Verdict**: ElastOS gives true ownership, Storj/Sia more like decentralized AWS

### vs. Nextcloud
- **Nextcloud**: Self-hosted cloud (traditional client-server)
- **ElastOS + IPFS**: P2P network (content-addressed)
- **Verdict**: ElastOS can leverage global IPFS network for redundancy

### Unique Value Proposition
**ElastOS is the ONLY system that combines**:
1. Web3 wallet authentication (no passwords!)
2. Personal IPFS node (true ownership!)
3. Browser-based desktop OS (no install!)
4. Global access (work from anywhere!)

---

## Conclusion

### What We're Building

A **complete paradigm shift** in personal computing:

**Traditional Cloud**:
- Login with password (forgot password? locked out)
- Files on company servers (trust Google/Microsoft)
- Pay monthly subscription (forever)
- Company controls access (can shut down)

**ElastOS Web3 OS**:
- Login with blockchain wallet (wallet = identity)
- Files on YOUR hardware (true ownership)
- Pay once for hardware (Pi = $150)
- YOU control access (unstoppable)

### The Vision Realized

```
2026: User in New York buys Raspberry Pi ($150)
      Runs setup script (30 minutes)
      IPFS node running at home

2027: User travels to Tokyo
      Opens laptop in hotel
      Connects to ElastOS with wallet
      All files available (from Pi in NYC)
      Edits presentation for tomorrow's meeting
      Saves → Syncs to home Pi via IPFS

2028: User's Pi fails (hardware failure)
      No problem - had backup node on VPS
      All files still accessible
      Buys new Pi, restores from backup node

2030: ElastOS has 100,000 users
      Each with personal IPFS node
      Largest decentralized storage network in world
      True data sovereignty achieved
```

---

## Appendix

### A. IPFS API Quick Reference

**Upload File**:
```javascript
const { cid } = await ipfs.add(fileBuffer, { 
    pin: true,
    progress: (bytes) => console.log(`Uploaded ${bytes} bytes`)
});
```

**Download File**:
```javascript
const chunks = [];
for await (const chunk of ipfs.cat(cid)) {
    chunks.push(chunk);
}
const file = Buffer.concat(chunks);
```

**Pin File**:
```javascript
await ipfs.pin.add(cid);
```

**List Pins**:
```javascript
for await (const { cid } of ipfs.pin.ls()) {
    console.log(cid.toString());
}
```

**Node Info**:
```javascript
const info = await ipfs.id();
console.log(info.id); // Peer ID
console.log(info.addresses); // Multiaddrs
```

### B. Example User Flows

**Flow 1: New User Setup**
```
1. User registers with wallet → Particle Auth ✅
2. ElastOS creates default folders in DBFSProvider
3. Prompt: "Connect your IPFS node"
4. User enters node URL or runs setup script
5. ElastOS tests connection
6. Success → User can now use IPFS storage
```

**Flow 2: Save File to IPFS**
```
1. User opens Text Editor app
2. Creates new file "notes.txt"
3. Saves to /ipfs-personal/Documents/
4. Behind the scenes:
   a. File saved to DBFSProvider (instant)
   b. File encrypted with wallet key
   c. Uploaded to IPFS node (background)
   d. CID stored in ipfs_files table
   e. File pinned for persistence
5. User sees success immediately (doesn't wait for IPFS)
```

**Flow 3: Access File from Another Device**
```
1. User in Tokyo logs in with wallet
2. ElastOS connects to same IPFS node (in NYC)
3. File browser shows all files (from ipfs_files table)
4. User opens /ipfs-personal/Documents/notes.txt
5. Behind the scenes:
   a. Query database for CID
   b. Download from IPFS node
   c. Decrypt with wallet key
   d. Cache in DBFSProvider for faster re-access
   e. Display in Text Editor
```

### C. Configuration Examples

**Development** (`volatile/config/config.json`):
```json
{
    "auth_system": "particle",
    "ipfs": {
        "enabled": true,
        "default_node_url": "http://localhost:5001",
        "auto_pin": true,
        "encryption_enabled": true,
        "sync_mode": "background"
    }
}
```

**Production**:
```json
{
    "auth_system": "particle",
    "ipfs": {
        "enabled": true,
        "require_node_setup": true,
        "allow_hosted_nodes": false,
        "encryption_enforced": true,
        "quota_default_gb": 10,
        "quota_max_gb": 1000
    }
}
```

---

**End of Strategy Document**

**Status**: ✅ Ready for implementation  
**Next Action**: Review strategy, approve architecture, begin Week 1 sprint  
**Questions**: Contact team for clarification on any technical decisions

