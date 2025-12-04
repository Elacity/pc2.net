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
 * IPFS Storage Driver
 * 
 * Provides decentralized file storage via IPFS with automatic encryption
 * for private folders and public sharing capability.
 */
class IPFSStorageDriver {
    constructor() {
        this.connections = new Map(); // user_id → ipfs client
        this.log = null; // Set during first use
    }
    
    /**
     * Get or create logger instance
     */
    _getLogger() {
        if (!this.log) {
            this.log = extension.services.get('log-service').create('IPFSStorageDriver');
        }
        return this.log;
    }
    
    /**
     * Connect to IPFS node
     * @param {Object} params - Connection parameters
     * @param {string} params.nodeUrl - IPFS node URL (default: http://localhost:5001)
     * @param {string} params.apiKey - Optional API key for authentication
     * @param {Object} context - Request context with user information
     * @returns {Object} Connection result with peer ID
     */
    async connect({ nodeUrl, apiKey }, context) {
        const userId = context.user.id;
        const log = this._getLogger();
        
        const url = nodeUrl || 'http://localhost:5001';
        log.info(`Connecting to IPFS node for user ${userId}`, { nodeUrl: url });
        
        try {
            // Get the create function from the ESM module
            const create = await getIPFSCreate();
            
            // Create IPFS HTTP client
            const ipfs = create({
                url: url,
                headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {}
            });
            
            // Test connection by getting node identity
            const id = await ipfs.id();
            log.info(`Connected to IPFS node: ${id.id}`);
            
            // Store connection for this user
            this.connections.set(userId, ipfs);
            
            // Save node configuration to database
            const { db } = extension.import('data');
            const now = Date.now();
            
            await db.write(
                `INSERT OR REPLACE INTO user_ipfs_nodes 
                (user_id, node_url, is_active, peer_id, last_connected_at, created_at, updated_at) 
                VALUES (?, ?, 1, ?, ?, ?, ?)`,
                [userId, url, id.id, now, now, now]
            );
            
            log.info(`IPFS node configuration saved for user ${userId}`);
            
            return {
                success: true,
                peerId: id.id,
                nodeUrl: url,
                agentVersion: id.agentVersion,
                protocolVersion: id.protocolVersion
            };
        } catch (error) {
            log.error(`Failed to connect to IPFS node: ${error.message}`);
            throw new Error(`IPFS connection failed: ${error.message}`);
        }
    }
    
    /**
     * Upload file to IPFS
     * @param {Object} params - Upload parameters
     * @param {Buffer|Uint8Array} params.file - File data to upload
     * @param {string} params.path - Virtual file path (e.g., /Documents/report.pdf)
     * @param {boolean} params.encrypt - Whether to encrypt (default: true)
     * @param {Object} context - Request context with user information
     * @returns {Object} Upload result with CID
     */
    async upload({ file, path, encrypt = true }, context) {
        const userId = context.user.id;
        const log = this._getLogger();
        
        // Get or create IPFS connection
        let ipfs = this.connections.get(userId);
        if (!ipfs) {
            // Auto-connect if not connected
            const connectResult = await this.connect({ nodeUrl: 'http://localhost:5001' }, context);
            ipfs = this.connections.get(userId);
        }
        
        // Determine if file should be encrypted based on path
        const isPublic = path.startsWith('/Public/');
        const shouldEncrypt = encrypt && !isPublic;
        
        log.info(`Uploading file: ${path} (encrypt: ${shouldEncrypt})`);
        
        // Convert to Buffer if needed
        let fileBuffer = Buffer.isBuffer(file) ? file : Buffer.from(file);
        
        // Encrypt if needed
        if (shouldEncrypt && context.user.wallet_address) {
            fileBuffer = this._encryptFile(fileBuffer, context.user.wallet_address);
            log.debug(`File encrypted using wallet-based key`);
        }
        
        // Upload to IPFS with auto-pin
        const { cid } = await ipfs.add(fileBuffer, {
            pin: true,
            wrapWithDirectory: false,
            progress: (bytes) => {
                log.debug(`Upload progress: ${bytes} bytes`);
            }
        });
        
        const cidString = cid.toString();
        log.info(`File uploaded: ${path} → ${cidString}`);
        
        // Store mapping in database
        const { db } = extension.import('data');
        const now = Date.now();
        const fileName = path.split('/').pop();
        
        await db.write(
            `INSERT OR REPLACE INTO ipfs_files 
            (user_id, file_path, file_name, cid, file_size, is_encrypted, is_pinned, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
            [
                userId,
                path,
                fileName,
                cidString,
                fileBuffer.length,
                shouldEncrypt ? 1 : 0,
                now,
                now
            ]
        );
        
        return {
            success: true,
            cid: cidString,
            path: path,
            encrypted: shouldEncrypt,
            size: fileBuffer.length,
            pinned: true
        };
    }
    
    /**
     * Download file from IPFS
     * @param {Object} params - Download parameters
     * @param {string} params.cid - IPFS CID to download
     * @param {boolean} params.decrypt - Whether to decrypt (default: true)
     * @param {Object} context - Request context with user information
     * @returns {Object} Download result with file data
     */
    async download({ cid, decrypt = true }, context) {
        const userId = context.user.id;
        const log = this._getLogger();
        
        // Get or create IPFS connection
        let ipfs = this.connections.get(userId);
        if (!ipfs) {
            // Auto-connect if not connected
            await this.connect({ nodeUrl: 'http://localhost:5001' }, context);
            ipfs = this.connections.get(userId);
        }
        
        log.info(`Downloading file: ${cid}`);
        
        // Download from IPFS
        const chunks = [];
        for await (const chunk of ipfs.cat(cid)) {
            chunks.push(chunk);
        }
        let fileBuffer = Buffer.concat(chunks);
        
        // Check if file was encrypted
        const { db } = extension.import('data');
        const fileInfo = await db.read(
            'SELECT is_encrypted, file_path FROM ipfs_files WHERE cid = ? AND user_id = ?',
            [cid, userId]
        );
        
        const isEncrypted = fileInfo && fileInfo[0] && fileInfo[0].is_encrypted;
        
        // Decrypt if needed
        if (decrypt && isEncrypted && context.user.wallet_address) {
            fileBuffer = this._decryptFile(fileBuffer, context.user.wallet_address);
            log.debug(`File decrypted using wallet-based key`);
        }
        
        log.info(`File downloaded: ${cid} (${fileBuffer.length} bytes)`);
        
        return {
            success: true,
            data: fileBuffer,
            cid: cid,
            encrypted: isEncrypted,
            path: fileInfo && fileInfo[0] ? fileInfo[0].file_path : null
        };
    }
    
    /**
     * Encrypt file using wallet-based key derivation
     * @private
     * @param {Buffer} buffer - File data to encrypt
     * @param {string} walletAddress - User's wallet address (used for key derivation)
     * @returns {Buffer} Encrypted data with IV and auth tag prepended
     */
    _encryptFile(buffer, walletAddress) {
        // Derive deterministic key from wallet address
        const key = crypto.scryptSync(walletAddress.toLowerCase(), 'elastos-salt', 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        
        const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
        const authTag = cipher.getAuthTag();
        
        // Format: [iv(16)][authTag(16)][encrypted data]
        return Buffer.concat([iv, authTag, encrypted]);
    }
    
    /**
     * Decrypt file using wallet-based key derivation
     * @private
     * @param {Buffer} buffer - Encrypted data with IV and auth tag
     * @param {string} walletAddress - User's wallet address (used for key derivation)
     * @returns {Buffer} Decrypted data
     */
    _decryptFile(buffer, walletAddress) {
        // Derive same key from wallet address
        const key = crypto.scryptSync(walletAddress.toLowerCase(), 'elastos-salt', 32);
        
        // Extract components
        const iv = buffer.slice(0, 16);
        const authTag = buffer.slice(16, 32);
        const encrypted = buffer.slice(32);
        
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        
        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }
    
    /**
     * List files stored in IPFS for a user
     * @param {Object} params - List parameters
     * @param {string} params.pathPrefix - Optional path prefix filter
     * @param {Object} context - Request context with user information
     * @returns {Object} List of files with metadata
     */
    async list({ pathPrefix }, context) {
        const userId = context.user.id;
        const log = this._getLogger();
        
        const { db } = extension.import('data');
        
        let query = 'SELECT * FROM ipfs_files WHERE user_id = ?';
        let params = [userId];
        
        if (pathPrefix) {
            query += ' AND file_path LIKE ?';
            params.push(pathPrefix + '%');
        }
        
        query += ' ORDER BY created_at DESC';
        
        const files = await db.read(query, params);
        
        log.info(`Listed ${files ? files.length : 0} files for user ${userId}`);
        
        return {
            success: true,
            files: files || [],
            count: files ? files.length : 0
        };
    }
}

module.exports = IPFSStorageDriver;
