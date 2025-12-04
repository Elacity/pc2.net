/*
 * Copyright (C) 2024-present Elacity & Puter Technologies Inc.
 *
 * This file is part of ElastOS (Puter fork).
 *
 * ElastOS is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

const crypto = require('crypto');
const _path = require('path');
const fsCapabilities = require('./capabilities');
const { NodePathSelector, NodeUIDSelector } = require('./selectors');

// Constants for database access
const DB_READ = 'read';
const DB_WRITE = 'write';

// Lazy-load IPFS client (ESM module)
let ipfsCreate = null;
async function getIPFSCreate() {
    if (!ipfsCreate) {
        const ipfsModule = await import('ipfs-http-client');
        ipfsCreate = ipfsModule.create;
    }
    return ipfsCreate;
}

/**
 * IPFS Filesystem Provider
 * 
 * Provides transparent IPFS storage for ALL Puter filesystem operations.
 * Files are automatically encrypted (except /Public/) and stored on IPFS.
 * This can be mounted at "/" to make IPFS the primary storage.
 */
class IPFSProvider {
    constructor(mountpoint) {
        this.mountpoint = mountpoint || '/';
        this.ipfs = null;
        this.log = null;
    }
    
    async mount({ path, options }) {
        this.mountpoint = path || '/';
        
        // Get logger
        this.log = {
            info: (...args) => console.log('[IPFSProvider]', ...args),
            error: (...args) => console.error('[IPFSProvider]', ...args),
            debug: (...args) => console.debug('[IPFSProvider]', ...args),
        };
        
        this.log.info(`Mounting IPFSProvider at ${path}`);
        
        const nodeUrl = options?.nodeUrl || 'http://localhost:5001';
        
        try {
            const create = await getIPFSCreate();
            this.ipfs = create({ url: nodeUrl });
            
            // Test connection
            try {
                const version = await this.ipfs.version();
                this.log.info(`Connected to IPFS node: ${version.version} (${version.repo})`);
            } catch (versionError) {
                this.log.info(`Testing IPFS connection...`);
                const testResult = await this.ipfs.add(Buffer.from('test'));
                this.log.info(`Connected to IPFS node (test CID: ${testResult.cid})`);
            }
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

    /**
     * Quick check if an entry exists by UUID/CID
     */
    async quick_check({ selector }) {
        if (!(selector instanceof NodeUIDSelector)) {
            return false;
        }
        
        try {
            const { db } = extension.import('data');
            const rows = await db.read(
                'SELECT id FROM ipfs_files WHERE cid = ? LIMIT 1',
                [selector.value]
            );
            return rows && rows.length > 0;
        } catch (error) {
            return false;
        }
    }
    
    async stat({ selector }) {
        const { db } = extension.import('data');
        
        let path;
        let entry = null;
        
        if (selector instanceof NodePathSelector) {
            path = selector.value;
            
            // Handle root path
            if (path === '/' || path === '') {
                return {
                    uid: 'root',
                    uuid: 'root',
                    path: '/',
                    is_dir: true,
                    size: 0,
                    modified: Date.now(),
                    created: Date.now(),
                    name: '',
                    parent_uid: null,
                };
            }
            
            // Check ipfs_files first
            let files = await db.read(
                'SELECT * FROM ipfs_files WHERE file_path = ? LIMIT 1',
                [path]
            );
            
            // Auto-create system folders if they don't exist
            if ((!files || !files[0]) && path === '/system') {
                this.log?.info(`Auto-creating system folder: ${path}`);
                await this._createSystemFolder(db, path);
                
                files = await db.read(
                    'SELECT * FROM ipfs_files WHERE file_path = ? LIMIT 1',
                    [path]
                );
            }
            
            // Auto-create user home folders if they don't exist
            if ((!files || !files[0]) && path.match(/^\/[^\/]+$/) && path !== '/system') {
                // This is a top-level folder (user home like /0x123...)
                const username = path.substring(1);
                this.log?.info(`Auto-creating user home folder: ${path}`);
                await this._createUserHome(db, username, path);
                
                files = await db.read(
                    'SELECT * FROM ipfs_files WHERE file_path = ? LIMIT 1',
                    [path]
                );
            }
            
            // Auto-create standard subfolders (Pictures, Documents, etc.)
            if ((!files || !files[0]) && path.match(/^\/[^\/]+\/(Desktop|Documents|Pictures|Videos|Public)$/)) {
                this.log?.info(`Auto-creating standard folder: ${path}`);
                await this._createStandardFolder(db, path);
                
                files = await db.read(
                    'SELECT * FROM ipfs_files WHERE file_path = ? LIMIT 1',
                    [path]
                );
            }
            
            if (files && files[0]) {
                entry = {
                    uid: files[0].cid,
                    uuid: files[0].cid,
                    path: files[0].file_path,
                    is_dir: files[0].is_dir === 1,
                    size: files[0].file_size,
                    modified: files[0].updated_at,
                    created: files[0].created_at,
                    name: files[0].file_name,
                    is_encrypted: files[0].is_encrypted === 1,
                    parent_uid: files[0].parent_cid,
                };
            }
        } else if (selector instanceof NodeUIDSelector) {
            // Handle special UIDs
            if (selector.value === 'root') {
                return {
                    uid: 'root',
                    uuid: 'root',
                    path: '/',
                    is_dir: true,
                    size: 0,
                    modified: Date.now(),
                    created: Date.now(),
                    name: '',
                    parent_uid: null,
                };
            }
            
            const files = await db.read(
                'SELECT * FROM ipfs_files WHERE cid = ? LIMIT 1',
                [selector.value]
            );
            
            if (files && files[0]) {
                entry = {
                    uid: files[0].cid,
                    uuid: files[0].cid,
                    path: files[0].file_path,
                    is_dir: files[0].is_dir === 1,
                    size: files[0].file_size,
                    modified: files[0].updated_at,
                    created: files[0].created_at,
                    name: files[0].file_name,
                    is_encrypted: files[0].is_encrypted === 1,
                    parent_uid: files[0].parent_cid,
                };
            }
        }
        
        return entry;
    }
    
    async _createSystemFolder(db, path) {
        const now = Date.now();
        const systemCid = 'QmSystem' + crypto.createHash('sha256').update('system').digest('hex').substring(0, 38);
        
        await db.write(
            `INSERT OR IGNORE INTO ipfs_files 
            (user_id, file_path, file_name, cid, parent_cid, file_size, is_dir, is_encrypted, is_pinned, created_at, updated_at) 
            VALUES (?, ?, ?, ?, 'root', 0, 1, 0, 0, ?, ?)`,
            [1, path, 'system', systemCid, now, now]
        );
    }
    
    async _createUserHome(db, username, path) {
        const now = Date.now();
        const homeCid = 'QmHome' + crypto.createHash('sha256').update(username).digest('hex').substring(0, 40);
        
        await db.write(
            `INSERT OR IGNORE INTO ipfs_files 
            (user_id, file_path, file_name, cid, parent_cid, file_size, is_dir, is_encrypted, is_pinned, created_at, updated_at) 
            VALUES (?, ?, ?, ?, 'root', 0, 1, 0, 0, ?, ?)`,
            [1, path, username, homeCid, now, now]
        );
        
        // Create standard subfolders
        const folders = ['Desktop', 'Documents', 'Pictures', 'Videos', 'Public'];
        for (const folder of folders) {
            const folderPath = `${path}/${folder}`;
            const folderCid = 'QmDir' + crypto.createHash('sha256').update(folderPath).digest('hex').substring(0, 41);
            
            await db.write(
                `INSERT OR IGNORE INTO ipfs_files 
                (user_id, file_path, file_name, cid, parent_cid, file_size, is_dir, is_encrypted, is_pinned, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, 0, 1, 0, 0, ?, ?)`,
                [1, folderPath, folder, folderCid, homeCid, now, now]
            );
        }
    }
    
    async _createStandardFolder(db, path) {
        const parts = path.split('/');
        const folderName = parts.pop();
        const parentPath = parts.join('/');
        const now = Date.now();
        
        // Get parent CID
        const parent = await db.read(
            'SELECT cid FROM ipfs_files WHERE file_path = ? LIMIT 1',
            [parentPath]
        );
        const parentCid = parent && parent[0] ? parent[0].cid : 'root';
        
        const folderCid = 'QmDir' + crypto.createHash('sha256').update(path).digest('hex').substring(0, 41);
        
        await db.write(
            `INSERT OR IGNORE INTO ipfs_files 
            (user_id, file_path, file_name, cid, parent_cid, file_size, is_dir, is_encrypted, is_pinned, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, 0, 1, 0, 0, ?, ?)`,
            [1, path, folderName, folderCid, parentCid, now, now]
        );
    }

    /**
     * Create a new file (required for uploads)
     */
    async write_new({ context, parent, name, file }) {
        const parentEntry = await this.stat({ selector: parent.selector });
        if (!parentEntry) {
            throw new Error('Parent directory does not exist');
        }
        
        const fullPath = _path.join(parentEntry.path, name);
        const isPublic = fullPath.includes('/Public/');
        const userId = this._getCurrentUserId(context);
        
        this.log?.info(`Creating new file: ${fullPath}`);
        
        // Read file content
        let buffer;
        if (file.stream) {
            const chunks = [];
            for await (const chunk of file.stream) {
                chunks.push(chunk);
            }
            buffer = Buffer.concat(chunks);
        } else if (file.buffer) {
            buffer = file.buffer;
        } else {
            buffer = Buffer.from('');
        }
        
        // Encrypt if not public
        let fileData = buffer;
        if (!isPublic && buffer.length > 0) {
            fileData = this._encryptFile(buffer, context);
        }
        
        // Upload to IPFS
        const { cid } = await this.ipfs.add(fileData, { pin: true });
        const cidString = cid.toString();
        
        this.log?.info(`File uploaded to IPFS: ${cidString}`);
        
        // Store in database
        const { db } = extension.import('data');
        const now = Date.now();
        
        await db.write(
            `INSERT INTO ipfs_files 
            (user_id, file_path, file_name, cid, parent_cid, file_size, mime_type, is_dir, is_encrypted, is_pinned, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?)`,
            [
                userId,
                fullPath,
                name,
                cidString,
                parentEntry.uid,
                buffer.length,
                file.mimetype || 'application/octet-stream',
                !isPublic && buffer.length > 0 ? 1 : 0,
                now,
                now
            ]
        );
        
        // Return a node-like object
        const fs = context.get('services').get('filesystem');
        const node = await fs.node(new NodeUIDSelector(cidString));
        return node;
    }

    /**
     * Overwrite an existing file
     */
    async write_overwrite({ context, node, file }) {
        const entry = await this.stat({ selector: node.selector });
        if (!entry) {
            throw new Error('File does not exist');
        }
        
        const isPublic = entry.path.includes('/Public/');
        const userId = this._getCurrentUserId(context);
        
        this.log?.info(`Overwriting file: ${entry.path}`);
        
        // Read file content
        let buffer;
        if (file.stream) {
            const chunks = [];
            for await (const chunk of file.stream) {
                chunks.push(chunk);
            }
            buffer = Buffer.concat(chunks);
        } else if (file.buffer) {
            buffer = file.buffer;
        } else {
            buffer = Buffer.from('');
        }
        
        // Encrypt if not public
        let fileData = buffer;
        if (!isPublic && buffer.length > 0) {
            fileData = this._encryptFile(buffer, context);
        }
        
        // Upload new version to IPFS
        const { cid } = await this.ipfs.add(fileData, { pin: true });
        const newCidString = cid.toString();
        
        this.log?.info(`File uploaded to IPFS: ${newCidString}`);
        
        // Unpin old CID (optional - could keep for versioning)
        try {
            await this.ipfs.pin.rm(entry.uid);
        } catch (e) {
            // Ignore unpin errors
        }
        
        // Update database
        const { db } = extension.import('data');
        const now = Date.now();
        
        await db.write(
            `UPDATE ipfs_files 
            SET cid = ?, file_size = ?, is_encrypted = ?, updated_at = ?
            WHERE file_path = ? AND user_id = ?`,
            [
                newCidString,
                buffer.length,
                !isPublic && buffer.length > 0 ? 1 : 0,
                now,
                entry.path,
                userId
            ]
        );
        
        // Return updated node
        const fs = context.get('services').get('filesystem');
        return await fs.node(new NodeUIDSelector(newCidString));
    }
    
    async read({ context, node }) {
        const entry = await this.stat({ selector: node.selector });
        if (!entry) {
            return null;
        }
        
        this.log?.info(`Reading file from IPFS: ${entry.uid}`);
        
        // Download from IPFS
        const chunks = [];
        for await (const chunk of this.ipfs.cat(entry.uid)) {
            chunks.push(chunk);
        }
        let buffer = Buffer.concat(chunks);
        
        // Decrypt if encrypted
        if (entry.is_encrypted) {
            buffer = this._decryptFile(buffer, context);
        }
        
        this.log?.debug(`File read from IPFS: ${buffer.length} bytes`);
        
        // Return as readable stream
        const { Readable } = require('stream');
        return Readable.from(buffer);
    }
    
    async readdir({ context, node }) {
        const entry = await this.stat({ selector: node.selector });
        if (!entry) {
            return [];
        }
        
        const { db } = extension.import('data');
        
        // Get direct children
        const children = await db.read(
            `SELECT cid FROM ipfs_files WHERE parent_cid = ?`,
            [entry.uid]
        );
        
        return children.map(c => c.cid);
    }

    /**
     * Create a directory
     */
    async mkdir({ context, parent, name }) {
        const parentEntry = await this.stat({ selector: parent.selector });
        if (!parentEntry) {
            throw new Error('Parent directory does not exist');
        }
        
        const fullPath = _path.join(parentEntry.path, name);
        const userId = this._getCurrentUserId(context);
        
        this.log?.info(`Creating directory: ${fullPath}`);
        
        // Generate a unique CID for the directory (hash of path + timestamp)
        const dirId = crypto.createHash('sha256')
            .update(fullPath + Date.now())
            .digest('hex')
            .substring(0, 46);
        const dirCid = 'Qm' + dirId; // Fake CID format for directories
        
        // Store in database
        const { db } = extension.import('data');
        const now = Date.now();
        
        await db.write(
            `INSERT INTO ipfs_files 
            (user_id, file_path, file_name, cid, parent_cid, file_size, is_dir, is_encrypted, is_pinned, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, 0, 1, 0, 0, ?, ?)`,
            [
                userId,
                fullPath,
                name,
                dirCid,
                parentEntry.uid,
                now,
                now
            ]
        );
        
        // Return node
        const fs = context.get('services').get('filesystem');
        return await fs.node(new NodeUIDSelector(dirCid));
    }
    
    _getCurrentUserId(context) {
        try {
            if (context) {
                const actor = context.get('actor');
                if (actor && actor.type && actor.type.user) {
                    return actor.type.user.id;
                }
            }
        } catch (e) {
            // Ignore
        }
        return 1; // Fallback
    }
    
    _getWalletAddress(context) {
        try {
            if (context) {
                const actor = context.get('actor');
                if (actor && actor.type && actor.type.user) {
                    return actor.type.user.wallet_address || actor.type.user.username;
                }
            }
        } catch (e) {
            // Ignore
        }
        return '0x0000000000000000000000000000000000000000';
    }
    
    _encryptFile(buffer, context) {
        const walletAddress = this._getWalletAddress(context);
        
        const key = crypto.scryptSync(walletAddress.toLowerCase(), 'elastos-salt', 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
        const authTag = cipher.getAuthTag();
        
        // Format: [iv(16)][authTag(16)][encrypted data]
        return Buffer.concat([iv, authTag, encrypted]);
    }
    
    _decryptFile(buffer, context) {
        const walletAddress = this._getWalletAddress(context);
        
        const key = crypto.scryptSync(walletAddress.toLowerCase(), 'elastos-salt', 32);
        const iv = buffer.slice(0, 16);
        const authTag = buffer.slice(16, 32);
        const encrypted = buffer.slice(32);
        
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        
        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }
}

module.exports = {
    IPFSProvider,
};
