import '../utils/polyfill.js';
import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';
import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { FsBlockstore } from 'blockstore-fs';
import { FsDatastore } from 'datastore-fs';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
export class IPFSStorage {
    helia = null;
    fs = null;
    blockstore = null;
    repoPath;
    isInitialized = false;
    constructor(options) {
        this.repoPath = options.repoPath;
    }
    async initialize() {
        if (this.isInitialized && this.helia) {
            return;
        }
        if (!existsSync(this.repoPath)) {
            mkdirSync(this.repoPath, { recursive: true });
        }
        const blockstorePath = join(this.repoPath, 'blocks');
        const datastorePath = join(this.repoPath, 'datastore');
        if (!existsSync(blockstorePath)) {
            mkdirSync(blockstorePath, { recursive: true });
        }
        if (!existsSync(datastorePath)) {
            mkdirSync(datastorePath, { recursive: true });
        }
        try {
            if (typeof Promise.withResolvers === 'undefined') {
                throw new Error('Promise.withResolvers polyfill not loaded. Helia requires Node.js 22+ or the polyfill.');
            }
            console.log('🌐 Initializing Helia IPFS node...');
            console.log(`   Repo path: ${this.repoPath}`);
            this.blockstore = new FsBlockstore(blockstorePath);
            const datastore = new FsDatastore(datastorePath);
            const libp2p = await createLibp2p({
                addresses: {
                    listen: [
                        '/ip4/0.0.0.0/tcp/4001',
                        '/ip4/0.0.0.0/tcp/4002/ws'
                    ]
                },
                transports: [
                    tcp(),
                    webSockets()
                ],
                connectionEncrypters: [
                    noise()
                ],
                streamMuxers: [
                    yamux()
                ],
                services: {}
            });
            this.helia = await createHelia({
                blockstore: this.blockstore,
                datastore,
                libp2p
            });
            this.fs = unixfs(this.helia);
            const peerId = this.helia.libp2p.peerId;
            console.log(`✅ Helia IPFS node initialized`);
            console.log(`   Node ID: ${peerId.toString()}`);
            const addresses = this.helia.libp2p.getMultiaddrs();
            console.log(`   Addresses: ${addresses.length} configured`);
            if (addresses.length > 0) {
                console.log(`   First address: ${addresses[0].toString()}`);
            }
            this.isInitialized = true;
        }
        catch (error) {
            if (this.helia) {
                try {
                    await this.helia.stop().catch(() => { });
                }
                catch {
                }
                this.helia = null;
                this.fs = null;
            }
            this.isInitialized = false;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorStack = error instanceof Error ? error.stack : undefined;
            console.error('❌ Failed to initialize Helia IPFS:', errorMessage);
            if (errorMessage.includes('withResolvers')) {
                console.error('   ⚠️  This error suggests Node.js version < 22');
                console.error('   💡 A polyfill has been added, but Helia may still require Node.js 22+');
                console.error('   💡 Consider upgrading Node.js: nvm install 22 && nvm use 22');
            }
            else if (errorMessage.includes('EADDRINUSE')) {
                console.error('   ⚠️  IPFS ports (4001, 4002) are already in use');
                console.error('   💡 Another IPFS instance may be running');
                console.error('   💡 Try stopping other IPFS processes or change ports in config');
            }
            else if (errorMessage.includes('repo') || errorMessage.includes('datastore') || errorMessage.includes('blockstore')) {
                console.error('   ⚠️  IPFS repository issue');
                console.error(`   💡 Repo path: ${this.repoPath}`);
                console.error('   💡 Try deleting the repo directory and restarting');
            }
            if (errorStack && process.env.NODE_ENV !== 'production') {
                console.error('   Stack trace:', errorStack);
            }
            throw error;
        }
    }
    getHelia() {
        if (!this.helia || !this.isInitialized) {
            throw new Error('Helia IPFS not initialized. Call initialize() first.');
        }
        return this.helia;
    }
    getUnixFS() {
        if (!this.fs || !this.isInitialized) {
            throw new Error('UnixFS not initialized. Call initialize() first.');
        }
        return this.fs;
    }
    async storeFile(content, options) {
        const fs = this.getUnixFS();
        try {
            const data = typeof content === 'string'
                ? new TextEncoder().encode(content)
                : content instanceof Buffer
                    ? new Uint8Array(content)
                    : content;
            const cid = await fs.addBytes(data);
            if (options?.pin !== false) {
                await this.pinFile(cid.toString());
            }
            return cid.toString();
        }
        catch (error) {
            console.error('Error storing file in Helia IPFS:', error);
            throw new Error(`Failed to store file in IPFS: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async getFile(cid) {
        if (!this.blockstore) {
            throw new Error('Blockstore not initialized');
        }
        try {
            const { CID } = await import('multiformats/cid');
            const cidObj = CID.parse(cid);
            const { exporter } = await import('ipfs-unixfs-exporter');
            const entry = await exporter(cidObj, this.blockstore);
            if (!entry) {
                throw new Error(`Entry not found for CID: ${cid}`);
            }
            if (entry.type !== 'file' && entry.type !== 'raw') {
                throw new Error(`CID ${cid} is not a file (type: ${entry.type})`);
            }
            const chunks = [];
            let totalChunks = 0;
            for await (const chunk of entry.content()) {
                chunks.push(chunk);
                totalChunks++;
            }
            if (chunks.length === 0) {
                throw new Error(`File content is empty for CID: ${cid}`);
            }
            const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
            console.log(`[IPFS] Retrieved ${chunks.length} chunks, total size: ${totalLength} bytes for CID: ${cid}`);
            const buffer = Buffer.allocUnsafe(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
                buffer.set(chunk, offset);
                offset += chunk.length;
            }
            return buffer;
        }
        catch (error) {
            console.error(`Error retrieving file from Helia IPFS (CID: ${cid}):`, error);
            throw new Error(`Failed to retrieve file from IPFS: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async fileExists(cid) {
        const helia = this.getHelia();
        try {
            const { CID } = await import('multiformats/cid');
            const cidObj = CID.parse(cid);
            await helia.blockstore.get(cidObj);
            return true;
        }
        catch (error) {
            return false;
        }
    }
    async pinFile(cid) {
        const helia = this.getHelia();
        try {
            const { CID } = await import('multiformats/cid');
            const cidObj = CID.parse(cid);
            await helia.blockstore.get(cidObj);
        }
        catch (error) {
            console.error(`Error pinning file (CID: ${cid}):`, error);
            throw new Error(`Failed to pin file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async unpinFile(cid) {
        console.log(`Unpinning file (CID: ${cid}) - GC will handle cleanup`);
    }
    async getNodeInfo() {
        const helia = this.getHelia();
        const peerId = helia.libp2p.peerId;
        const addresses = helia.libp2p.getMultiaddrs();
        return {
            id: peerId.toString(),
            addresses: addresses.map(addr => addr.toString()),
            agentVersion: 'helia',
            protocolVersion: '1.0'
        };
    }
    async stop() {
        if (this.helia && this.isInitialized) {
            try {
                console.log('🛑 Stopping Helia IPFS node...');
                await this.helia.stop();
                this.helia = null;
                this.fs = null;
                this.isInitialized = false;
                console.log('✅ Helia IPFS node stopped');
            }
            catch (error) {
                console.error('Error stopping Helia IPFS node:', error);
                throw error;
            }
        }
    }
    isReady() {
        return this.isInitialized && this.helia !== null;
    }
}
//# sourceMappingURL=ipfs.js.map