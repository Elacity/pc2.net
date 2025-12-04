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

/**
 * IPFS Storage Extension for ElastOS
 * 
 * This extension provides decentralized file storage via IPFS,
 * with automatic encryption for private folders and public sharing capability.
 */

const IPFSStorageDriver = require('./drivers/IPFSStorageDriver');
const { IPFSService } = require('./services/IPFSService');

// Extension lifecycle events
extension.on('preinit', event => {
    extension.log.info('[IPFS Storage]: Pre-initialization started');
});

// Listen for filesystem-types event to register our mounter
extension.on('create.filesystem-types', event => {
    extension.log.info('[IPFS Storage]: Registering IPFS filesystem type');
    
    const { IPFSProvider } = require('./providers/IPFSProvider');
    
    event.createFilesystemType('ipfs', {
        async mount({ path, options }) {
            extension.log.info('[IPFS Storage]: Mounting IPFS provider at ' + path);
            const provider = new IPFSProvider(path);
            await provider.mount({ path, options });
            extension.log.info('[IPFS Storage]: IPFS provider mounted successfully');
            return provider;
        }
    });
    
    extension.log.info('[IPFS Storage]: IPFS filesystem type registered');
});

extension.on('init', async event => {
    extension.log.info('[IPFS Storage]: Initialization started');
    
    // Log configuration
    const config = extension.config || {};
    extension.log.info('[IPFS Storage]: Configuration loaded', {
        nodeUrl: config.ipfs_node_url || 'http://localhost:5001',
        autoConnect: config.ipfs_auto_connect !== false
    });
});

// Create the 'storage' interface for IPFS
extension.on('create.interfaces', event => {
    extension.log.info('[IPFS Storage]: Creating storage interface');
    
    event.createInterface('storage', {
        description: 'Decentralized storage interface for IPFS',
        methods: {
            connect: {
                description: 'Connect to IPFS node',
                parameters: {
                    nodeUrl: { type: 'string', optional: true, description: 'IPFS node URL' },
                    apiKey: { type: 'string', optional: true, description: 'API key for authentication' }
                }
            },
            upload: {
                description: 'Upload file to IPFS',
                parameters: {
                    file: { type: 'buffer', required: true, description: 'File data to upload' },
                    path: { type: 'string', required: true, description: 'Virtual file path' },
                    encrypt: { type: 'boolean', optional: true, default: true, description: 'Encrypt file' }
                }
            },
            download: {
                description: 'Download file from IPFS',
                parameters: {
                    cid: { type: 'string', required: true, description: 'IPFS CID' },
                    decrypt: { type: 'boolean', optional: true, default: true, description: 'Decrypt file' }
                }
            },
            list: {
                description: 'List files stored in IPFS',
                parameters: {
                    pathPrefix: { type: 'string', optional: true, description: 'Path prefix filter' }
                }
            }
        }
    });
});

// Register the IPFS driver implementation
extension.on('create.drivers', event => {
    extension.log.info('[IPFS Storage]: Registering ipfs driver');
    
    event.createDriver('storage', 'ipfs', new IPFSStorageDriver());
});

// Grant permissions for the storage driver
extension.on('create.permissions', event => {
    extension.log.info('[IPFS Storage]: Granting permissions');
    
    // Allow all users to use IPFS storage
    event.grant_to_everyone('service:ipfs:ii:storage');
});

extension.on('ready', event => {
    extension.log.info('[IPFS Storage]: Extension ready ✓');
});
