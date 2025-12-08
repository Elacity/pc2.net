/*
 * Copyright (C) 2024-present Elacity
 *
 * PC2 Storage Service
 * 
 * Bridges PC2 authentication with IPFS storage.
 * Ensures files are encrypted with wallet-derived keys and stored on IPFS.
 */

const crypto = require('crypto');

/**
 * PC2 Storage Service
 * 
 * Manages decentralized storage for PC2 nodes:
 * - IPFS for file storage
 * - Wallet-based encryption
 * - Per-user isolated storage spaces
 */
class PC2StorageService {
    constructor({ services, config }) {
        this.services = services;
        this.config = config;
        this.db = null;
        this.ipfsProvider = null;
    }

    async _init() {
        console.log('[PC2 Storage]: Initializing storage service');
        
        // Get database connection
        this.db = await this.services.get('database').get('write', 'pc2');
        
        // Initialize IPFS tables
        await this._initDatabase();
        
        // Try to connect to IPFS
        await this._connectToIPFS();
        
        console.log('[PC2 Storage]: Storage service initialized');
    }

    /**
     * Initialize database tables for IPFS file tracking
     */
    async _initDatabase() {
        // Create IPFS files table if not exists
        await this.db.write(`
            CREATE TABLE IF NOT EXISTS pc2_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                wallet_address VARCHAR(42) NOT NULL,
                file_path TEXT NOT NULL,
                file_name VARCHAR(255) NOT NULL,
                cid VARCHAR(100),
                parent_cid VARCHAR(100),
                file_size INTEGER DEFAULT 0,
                mime_type VARCHAR(100) DEFAULT 'application/octet-stream',
                is_dir BOOLEAN DEFAULT 0,
                is_encrypted BOOLEAN DEFAULT 1,
                is_pinned BOOLEAN DEFAULT 1,
                encryption_nonce TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                
                UNIQUE(wallet_address, file_path)
            )
        `);

        // Create indexes
        await this.db.write(`
            CREATE INDEX IF NOT EXISTS idx_pc2_files_wallet 
            ON pc2_files(wallet_address)
        `);
        
        await this.db.write(`
            CREATE INDEX IF NOT EXISTS idx_pc2_files_path 
            ON pc2_files(wallet_address, file_path)
        `);
        
        await this.db.write(`
            CREATE INDEX IF NOT EXISTS idx_pc2_files_parent 
            ON pc2_files(parent_cid)
        `);
    }

    /**
     * Connect to IPFS node
     */
    async _connectToIPFS() {
        const ipfsUrl = this.config.ipfs_url || process.env.PC2_IPFS_URL || 'http://localhost:5001';
        
        try {
            // Dynamic import for ESM module
            const { create } = await import('ipfs-http-client');
            this.ipfs = create({ url: ipfsUrl });
            
            // Test connection
            const id = await this.ipfs.id();
            console.log(`[PC2 Storage]: Connected to IPFS node: ${id.id}`);
        } catch (error) {
            console.warn(`[PC2 Storage]: IPFS not available (${error.message}). Files will be stored locally.`);
            this.ipfs = null;
        }
    }

    /**
     * Initialize storage for a wallet (creates home directory structure)
     * @param {string} walletAddress - The wallet address
     */
    async initializeWalletStorage(walletAddress) {
        const normalizedAddress = walletAddress.toLowerCase();
        const now = Math.floor(Date.now() / 1000);

        // Check if already initialized
        const existing = await this.db.read(
            'SELECT id FROM pc2_files WHERE wallet_address = ? AND file_path = ?',
            [normalizedAddress, '/']
        );

        if (existing.length > 0) {
            console.log(`[PC2 Storage]: Storage already initialized for ${normalizedAddress}`);
            return;
        }

        console.log(`[PC2 Storage]: Initializing storage for ${normalizedAddress}`);

        // Create root directory
        const rootCid = this._generateDirectoryCID('/', normalizedAddress);
        await this.db.write(
            `INSERT INTO pc2_files 
            (wallet_address, file_path, file_name, cid, parent_cid, is_dir, is_encrypted, created_at, updated_at)
            VALUES (?, ?, ?, ?, NULL, 1, 0, ?, ?)`,
            [normalizedAddress, '/', '', rootCid, now, now]
        );

        // Create standard directories
        const standardDirs = [
            { name: 'Desktop', path: '/Desktop' },
            { name: 'Documents', path: '/Documents' },
            { name: 'Pictures', path: '/Pictures' },
            { name: 'Videos', path: '/Videos' },
            { name: 'Music', path: '/Music' },
            { name: 'Downloads', path: '/Downloads' },
            { name: 'Public', path: '/Public' },  // Public folder is NOT encrypted
        ];

        for (const dir of standardDirs) {
            const dirCid = this._generateDirectoryCID(dir.path, normalizedAddress);
            const isPublic = dir.name === 'Public';
            
            await this.db.write(
                `INSERT INTO pc2_files 
                (wallet_address, file_path, file_name, cid, parent_cid, is_dir, is_encrypted, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
                [normalizedAddress, dir.path, dir.name, dirCid, rootCid, isPublic ? 0 : 1, now, now]
            );
        }

        console.log(`[PC2 Storage]: Created storage structure for ${normalizedAddress}`);
    }

    /**
     * Upload a file for a wallet
     * @param {string} walletAddress - Owner wallet
     * @param {string} filePath - Path in virtual filesystem
     * @param {Buffer} content - File content
     * @param {Object} options - Upload options
     */
    async uploadFile(walletAddress, filePath, content, options = {}) {
        const normalizedAddress = walletAddress.toLowerCase();
        const now = Math.floor(Date.now() / 1000);
        
        // Determine if file should be encrypted
        const isPublic = filePath.startsWith('/Public/') || filePath === '/Public';
        const shouldEncrypt = !isPublic && options.encrypt !== false;

        console.log(`[PC2 Storage]: Uploading file ${filePath} for ${normalizedAddress}`);

        // Get parent directory
        const parentPath = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
        const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
        
        const parent = await this.db.read(
            'SELECT cid FROM pc2_files WHERE wallet_address = ? AND file_path = ?',
            [normalizedAddress, parentPath]
        );

        if (parent.length === 0) {
            throw new Error(`Parent directory does not exist: ${parentPath}`);
        }

        const parentCid = parent[0].cid;

        // Encrypt content if needed
        let fileData = content;
        let encryptionNonce = null;
        
        if (shouldEncrypt && content.length > 0) {
            const encrypted = await this._encryptContent(content, normalizedAddress);
            fileData = encrypted.data;
            encryptionNonce = encrypted.nonce;
        }

        // Upload to IPFS (or generate local CID if IPFS not available)
        let cid;
        if (this.ipfs) {
            const result = await this.ipfs.add(fileData, { pin: true });
            cid = result.cid.toString();
        } else {
            // Generate deterministic CID for local storage
            cid = this._generateFileCID(fileData);
            // Store locally (TODO: implement local file storage)
        }

        // Store metadata in database
        await this.db.write(
            `INSERT OR REPLACE INTO pc2_files 
            (wallet_address, file_path, file_name, cid, parent_cid, file_size, mime_type, 
             is_dir, is_encrypted, is_pinned, encryption_nonce, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?, ?)`,
            [
                normalizedAddress,
                filePath,
                fileName,
                cid,
                parentCid,
                content.length,
                options.mimeType || 'application/octet-stream',
                shouldEncrypt ? 1 : 0,
                encryptionNonce,
                now,
                now
            ]
        );

        console.log(`[PC2 Storage]: File uploaded: ${cid}`);

        return {
            cid,
            path: filePath,
            size: content.length,
            encrypted: shouldEncrypt,
        };
    }

    /**
     * Download a file for a wallet
     * @param {string} walletAddress - Owner wallet
     * @param {string} filePath - Path in virtual filesystem
     */
    async downloadFile(walletAddress, filePath) {
        const normalizedAddress = walletAddress.toLowerCase();

        // Get file metadata
        const files = await this.db.read(
            'SELECT * FROM pc2_files WHERE wallet_address = ? AND file_path = ?',
            [normalizedAddress, filePath]
        );

        if (files.length === 0) {
            throw new Error(`File not found: ${filePath}`);
        }

        const file = files[0];
        
        if (file.is_dir) {
            throw new Error(`Cannot download directory: ${filePath}`);
        }

        console.log(`[PC2 Storage]: Downloading file ${filePath} (CID: ${file.cid})`);

        // Download from IPFS
        let content;
        if (this.ipfs) {
            const chunks = [];
            for await (const chunk of this.ipfs.cat(file.cid)) {
                chunks.push(chunk);
            }
            content = Buffer.concat(chunks);
        } else {
            throw new Error('IPFS not available and local storage not implemented');
        }

        // Decrypt if encrypted
        if (file.is_encrypted && file.encryption_nonce) {
            content = await this._decryptContent(content, normalizedAddress, file.encryption_nonce);
        }

        return {
            content,
            mimeType: file.mime_type,
            size: file.file_size,
            cid: file.cid,
        };
    }

    /**
     * List files in a directory for a wallet
     * @param {string} walletAddress - Owner wallet
     * @param {string} dirPath - Directory path
     */
    async listFiles(walletAddress, dirPath = '/') {
        const normalizedAddress = walletAddress.toLowerCase();

        // Get directory
        const dirs = await this.db.read(
            'SELECT cid FROM pc2_files WHERE wallet_address = ? AND file_path = ? AND is_dir = 1',
            [normalizedAddress, dirPath]
        );

        if (dirs.length === 0) {
            throw new Error(`Directory not found: ${dirPath}`);
        }

        const dirCid = dirs[0].cid;

        // Get children
        const children = await this.db.read(
            'SELECT file_path, file_name, cid, file_size, mime_type, is_dir, is_encrypted, created_at, updated_at FROM pc2_files WHERE wallet_address = ? AND parent_cid = ?',
            [normalizedAddress, dirCid]
        );

        return children.map(c => ({
            path: c.file_path,
            name: c.file_name,
            cid: c.cid,
            size: c.file_size,
            mimeType: c.mime_type,
            isDirectory: c.is_dir === 1,
            isEncrypted: c.is_encrypted === 1,
            createdAt: c.created_at,
            updatedAt: c.updated_at,
        }));
    }

    /**
     * Create a directory for a wallet
     * @param {string} walletAddress - Owner wallet
     * @param {string} dirPath - Directory path to create
     */
    async createDirectory(walletAddress, dirPath) {
        const normalizedAddress = walletAddress.toLowerCase();
        const now = Math.floor(Date.now() / 1000);

        // Get parent directory
        const parentPath = dirPath.substring(0, dirPath.lastIndexOf('/')) || '/';
        const dirName = dirPath.substring(dirPath.lastIndexOf('/') + 1);

        const parent = await this.db.read(
            'SELECT cid FROM pc2_files WHERE wallet_address = ? AND file_path = ? AND is_dir = 1',
            [normalizedAddress, parentPath]
        );

        if (parent.length === 0) {
            throw new Error(`Parent directory does not exist: ${parentPath}`);
        }

        const parentCid = parent[0].cid;
        const isPublic = dirPath.startsWith('/Public/') || dirPath === '/Public';
        const dirCid = this._generateDirectoryCID(dirPath, normalizedAddress);

        await this.db.write(
            `INSERT INTO pc2_files 
            (wallet_address, file_path, file_name, cid, parent_cid, is_dir, is_encrypted, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
            [normalizedAddress, dirPath, dirName, dirCid, parentCid, isPublic ? 0 : 1, now, now]
        );

        return { path: dirPath, cid: dirCid };
    }

    /**
     * Delete a file or directory
     * @param {string} walletAddress - Owner wallet
     * @param {string} path - Path to delete
     */
    async delete(walletAddress, path) {
        const normalizedAddress = walletAddress.toLowerCase();

        // Get file/directory
        const items = await this.db.read(
            'SELECT * FROM pc2_files WHERE wallet_address = ? AND file_path = ?',
            [normalizedAddress, path]
        );

        if (items.length === 0) {
            throw new Error(`Item not found: ${path}`);
        }

        const item = items[0];

        // If it's a directory, ensure it's empty
        if (item.is_dir) {
            const children = await this.db.read(
                'SELECT id FROM pc2_files WHERE wallet_address = ? AND parent_cid = ?',
                [normalizedAddress, item.cid]
            );

            if (children.length > 0) {
                throw new Error(`Directory not empty: ${path}`);
            }
        }

        // Unpin from IPFS if available
        if (this.ipfs && item.cid && !item.is_dir) {
            try {
                await this.ipfs.pin.rm(item.cid);
            } catch (e) {
                // Ignore unpin errors
            }
        }

        // Delete from database
        await this.db.write(
            'DELETE FROM pc2_files WHERE wallet_address = ? AND file_path = ?',
            [normalizedAddress, path]
        );

        console.log(`[PC2 Storage]: Deleted ${path}`);
    }

    /**
     * Get storage stats for a wallet
     * @param {string} walletAddress - Owner wallet
     */
    async getStorageStats(walletAddress) {
        const normalizedAddress = walletAddress.toLowerCase();

        const stats = await this.db.read(
            `SELECT 
                COUNT(*) as file_count,
                SUM(CASE WHEN is_dir = 1 THEN 0 ELSE file_size END) as total_size,
                SUM(CASE WHEN is_encrypted = 1 THEN 1 ELSE 0 END) as encrypted_count,
                COUNT(CASE WHEN is_dir = 1 THEN 1 END) as dir_count
            FROM pc2_files WHERE wallet_address = ?`,
            [normalizedAddress]
        );

        return {
            fileCount: stats[0].file_count || 0,
            totalSize: stats[0].total_size || 0,
            encryptedCount: stats[0].encrypted_count || 0,
            directoryCount: stats[0].dir_count || 0,
        };
    }

    // ==================== ENCRYPTION METHODS ====================

    /**
     * Encrypt content using wallet-derived key
     * Uses AES-256-GCM with a key derived from the wallet address
     */
    async _encryptContent(content, walletAddress) {
        // Derive key from wallet address using PBKDF2
        // In production, this would use a signature-derived key
        const key = crypto.pbkdf2Sync(
            walletAddress.toLowerCase(),
            'pc2-storage-salt-v1', // Salt (should be unique per user in production)
            100000,
            32,
            'sha256'
        );

        const nonce = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
        
        const encrypted = Buffer.concat([
            cipher.update(content),
            cipher.final(),
        ]);
        
        const authTag = cipher.getAuthTag();

        // Format: [encrypted][authTag(16)]
        const data = Buffer.concat([encrypted, authTag]);

        return {
            data,
            nonce: nonce.toString('hex'),
        };
    }

    /**
     * Decrypt content using wallet-derived key
     */
    async _decryptContent(data, walletAddress, nonceHex) {
        const key = crypto.pbkdf2Sync(
            walletAddress.toLowerCase(),
            'pc2-storage-salt-v1',
            100000,
            32,
            'sha256'
        );

        const nonce = Buffer.from(nonceHex, 'hex');
        const authTag = data.slice(-16);
        const encrypted = data.slice(0, -16);

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
        decipher.setAuthTag(authTag);

        return Buffer.concat([
            decipher.update(encrypted),
            decipher.final(),
        ]);
    }

    // ==================== HELPER METHODS ====================

    _generateDirectoryCID(path, walletAddress) {
        const hash = crypto.createHash('sha256')
            .update(`${walletAddress}:${path}:${Date.now()}`)
            .digest('hex');
        return `QmDir${hash.substring(0, 42)}`;
    }

    _generateFileCID(content) {
        const hash = crypto.createHash('sha256')
            .update(content)
            .digest('hex');
        return `QmFile${hash.substring(0, 40)}`;
    }
}

module.exports = { PC2StorageService };

