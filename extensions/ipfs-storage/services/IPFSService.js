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

const { IPFSProvider } = require('../providers/IPFSProvider');

/**
 * IPFS Service
 * 
 * Registers the IPFS filesystem provider as a mounter,
 * allowing IPFS to be mounted at specific paths in the filesystem.
 * 
 * Note: Extension services don't inherit from BaseService
 */
class IPFSService {
    /**
     * Hook called during initialization phase
     * Register the IPFS mounter with the mountpoint service
     */
    async _init() {
        const svc_mountpoint = this.services.get('mountpoint');
        
        // Register our mounter
        svc_mountpoint.register_mounter('ipfs', {
            async mount({ path, options }) {
                const provider = new IPFSProvider(path);
                await provider.mount({ path, options });
                return provider;
            }
        });
        
        console.log('[IPFS Service]: IPFS mounter registered');
    }
}

module.exports = {
    IPFSService,
};
