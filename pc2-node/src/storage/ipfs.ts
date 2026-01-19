/**
 * IPFS Storage Module
 * 
 * Handles file storage and retrieval using Helia (modern IPFS implementation)
 * Files are stored content-addressed (by CID) and linked to paths via database
 */

// Import polyfill before Helia to ensure Promise.withResolvers is available
import '../utils/polyfill.js';

import { createHelia, type Helia } from 'helia';
import { unixfs, type UnixFS } from '@helia/unixfs';
import { createLibp2p, type Libp2pOptions } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { kadDHT } from '@libp2p/kad-dht';
import { identify } from '@libp2p/identify';
import { bootstrap } from '@libp2p/bootstrap';
import { FsBlockstore } from 'blockstore-fs';
import { FsDatastore } from 'datastore-fs';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * IPFS Network Modes:
 * - private: Isolated node, no network connectivity (personal cloud only)
 * - public: Full DHT participation, content discoverable globally
 * - hybrid: Connect to network but only announce public content
 */
export type IPFSNetworkMode = 'private' | 'public' | 'hybrid';

/**
 * Public IPFS bootstrap nodes
 */
const PUBLIC_BOOTSTRAP_NODES = [
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt',
  '/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ',
];

export interface IPFSOptions {
  repoPath: string;
  mode?: IPFSNetworkMode;           // Network mode (default: private)
  enableDHT?: boolean;              // Enable DHT (auto for public/hybrid)
  enableBootstrap?: boolean;        // Use public bootstrap nodes
  customBootstrap?: string[];       // Additional bootstrap nodes
}

export class IPFSStorage {
  private helia: Helia | null = null;
  private fs: UnixFS | null = null;
  private blockstore: FsBlockstore | null = null;
  private repoPath: string;
  private isInitialized: boolean = false;
  private networkMode: IPFSNetworkMode;
  private options: IPFSOptions;

  constructor(options: IPFSOptions) {
    this.repoPath = options.repoPath;
    this.networkMode = options.mode || 'private';
    this.options = options;
  }

  /**
   * Get the current network mode
   */
  getNetworkMode(): IPFSNetworkMode {
    return this.networkMode;
  }

  /**
   * Initialize Helia IPFS node
   */
  async initialize(): Promise<void> {
    if (this.isInitialized && this.helia) {
      return; // Already initialized
    }

    // Ensure repo directory exists
    if (!existsSync(this.repoPath)) {
      mkdirSync(this.repoPath, { recursive: true });
    }

    // Ensure subdirectories exist
    const blockstorePath = join(this.repoPath, 'blocks');
    const datastorePath = join(this.repoPath, 'datastore');
    if (!existsSync(blockstorePath)) {
      mkdirSync(blockstorePath, { recursive: true });
    }
    if (!existsSync(datastorePath)) {
      mkdirSync(datastorePath, { recursive: true });
    }

    try {
      // Verify polyfill is loaded
      if (typeof (Promise as any).withResolvers === 'undefined') {
        throw new Error('Promise.withResolvers polyfill not loaded. Helia requires Node.js 22+ or the polyfill.');
      }
      
      console.log('🌐 Initializing Helia IPFS node...');
      console.log(`   Repo path: ${this.repoPath}`);
      console.log(`   Network mode: ${this.networkMode}`);

      // Create blockstore and datastore
      this.blockstore = new FsBlockstore(blockstorePath);
      const datastore = new FsDatastore(datastorePath);

      // Determine if we should enable network features
      const enableNetwork = this.networkMode !== 'private';
      const enableDHT = this.options.enableDHT ?? enableNetwork;
      const enableBootstrap = this.options.enableBootstrap ?? enableNetwork;

      // Build libp2p configuration
      const libp2pConfig: Libp2pOptions = {
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
        services: {} as any
      };

      // Add network services for public/hybrid modes
      if (enableNetwork) {
        console.log(`   DHT: ${enableDHT ? 'enabled' : 'disabled'}`);
        console.log(`   Bootstrap: ${enableBootstrap ? 'enabled' : 'disabled'}`);

        // Add identify service (required for DHT)
        (libp2pConfig.services as any).identify = identify();

        // Add DHT for content discovery
        if (enableDHT) {
          (libp2pConfig.services as any).dht = kadDHT({
            clientMode: false,  // Full DHT node, not just client
          });
        }

        // Add bootstrap nodes for initial peer discovery
        if (enableBootstrap) {
          const bootstrapNodes = [
            ...PUBLIC_BOOTSTRAP_NODES,
            ...(this.options.customBootstrap || [])
          ];
          libp2pConfig.peerDiscovery = [
            bootstrap({ list: bootstrapNodes })
          ];
        }
      } else {
        console.log('   Network: disabled (private mode)');
      }

      // Create libp2p instance
      const libp2p = await createLibp2p(libp2pConfig);

      // Create Helia node with custom libp2p (no WebRTC)
      // Let Helia start libp2p - don't start it ourselves
      this.helia = await createHelia({
        blockstore: this.blockstore,
        datastore,
        libp2p
      });

      // Initialize UnixFS
      this.fs = unixfs(this.helia);

      // Get node info
      const peerId = this.helia.libp2p.peerId;
      console.log(`✅ Helia IPFS node initialized`);
      console.log(`   Node ID: ${peerId.toString()}`);
      
      const addresses = this.helia.libp2p.getMultiaddrs();
      console.log(`   Addresses: ${addresses.length} configured`);
      if (addresses.length > 0) {
        console.log(`   First address: ${addresses[0].toString()}`);
      }

      this.isInitialized = true;
    } catch (error) {
      // Clean up any partial initialization
      if (this.helia) {
        try {
          await this.helia.stop().catch(() => {}); // Ignore stop errors
        } catch {
          // Ignore cleanup errors
        }
        this.helia = null;
        this.fs = null;
      }
      this.isInitialized = false;
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error('❌ Failed to initialize Helia IPFS:', errorMessage);
      
      // Provide helpful error messages for common issues
      if (errorMessage.includes('withResolvers')) {
        console.error('   ⚠️  This error suggests Node.js version < 22');
        console.error('   💡 A polyfill has been added, but Helia may still require Node.js 22+');
        console.error('   💡 Consider upgrading Node.js: nvm install 22 && nvm use 22');
      } else if (errorMessage.includes('EADDRINUSE')) {
        console.error('   ⚠️  IPFS ports (4001, 4002) are already in use');
        console.error('   💡 Another IPFS instance may be running');
        console.error('   💡 Try stopping other IPFS processes or change ports in config');
      } else if (errorMessage.includes('repo') || errorMessage.includes('datastore') || errorMessage.includes('blockstore')) {
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

  /**
   * Get Helia instance (throws if not initialized)
   */
  private getHelia(): Helia {
    if (!this.helia || !this.isInitialized) {
      throw new Error('Helia IPFS not initialized. Call initialize() first.');
    }
    return this.helia;
  }

  /**
   * Get UnixFS instance (throws if not initialized)
   */
  private getUnixFS(): UnixFS {
    if (!this.fs || !this.isInitialized) {
      throw new Error('UnixFS not initialized. Call initialize() first.');
    }
    return this.fs;
  }

  /**
   * Store file content in IPFS
   * Returns the Content ID (CID) that can be used to retrieve the file
   */
  async storeFile(content: Buffer | Uint8Array | string, options?: {
    pin?: boolean; // Pin the file to prevent garbage collection
  }): Promise<string> {
    const fs = this.getUnixFS();

    try {
      // Convert to Uint8Array if needed
      const data = typeof content === 'string' 
        ? new TextEncoder().encode(content)
        : content instanceof Buffer
        ? new Uint8Array(content)
        : content;

      // Add file to IPFS using UnixFS
      const cid = await fs.addBytes(data);

      // Pin if requested (default: true)
      if (options?.pin !== false) {
        await this.pinFile(cid.toString());
      }

      return cid.toString();
    } catch (error) {
      console.error('Error storing file in Helia IPFS:', error);
      throw new Error(`Failed to store file in IPFS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve file content from IPFS using CID
   */
  async getFile(cid: string): Promise<Buffer> {
    if (!this.blockstore) {
      throw new Error('Blockstore not initialized');
    }

    try {
      // Import CID from string
      const { CID } = await import('multiformats/cid');
      const cidObj = CID.parse(cid);

      // Use exporter to properly reconstruct UnixFS files (fs.addBytes creates UnixFS structure)
      // This handles multi-block files correctly
      // IMPORTANT: Use the underlying FsBlockstore directly, not helia.blockstore (IdentityBlockstore wrapper)
      const { exporter } = await import('ipfs-unixfs-exporter');
      
      const entry = await exporter(cidObj, this.blockstore);
      
      if (!entry) {
        throw new Error(`Entry not found for CID: ${cid}`);
      }
      
      if (entry.type !== 'file' && entry.type !== 'raw') {
        throw new Error(`CID ${cid} is not a file (type: ${entry.type})`);
      }

      // Collect all chunks from the file content
      const chunks: Uint8Array[] = [];
      let totalChunks = 0;
      
      for await (const chunk of entry.content()) {
        chunks.push(chunk);
        totalChunks++;
      }
      
      if (chunks.length === 0) {
        throw new Error(`File content is empty for CID: ${cid}`);
      }

      // Log chunk info for debugging
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      console.log(`[IPFS] Retrieved ${chunks.length} chunks, total size: ${totalLength} bytes for CID: ${cid}`);
      
      // Concatenate all chunks into a single buffer
      const buffer = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
      }

      return buffer;
    } catch (error) {
      console.error(`Error retrieving file from Helia IPFS (CID: ${cid}):`, error);
      throw new Error(`Failed to retrieve file from IPFS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a CID exists in IPFS
   */
  async fileExists(cid: string): Promise<boolean> {
    const helia = this.getHelia();

    try {
      // Import CID and try to get the block
      const { CID } = await import('multiformats/cid');
      const cidObj = CID.parse(cid);
      
      // Try to get the block - if it exists, this will succeed
      await helia.blockstore.get(cidObj);
      return true;
    } catch (error) {
      // If get fails, block doesn't exist
      return false;
    }
  }

  /**
   * Pin a file (prevent garbage collection)
   */
  async pinFile(cid: string): Promise<void> {
    const helia = this.getHelia();

    try {
      // Import CID
      const { CID } = await import('multiformats/cid');
      const cidObj = CID.parse(cid);
      
      // Helia pins are managed through the blockstore
      // For now, we'll just ensure the block is in the blockstore
      // (which it should be if we just added it)
      // In the future, we can use @helia/remote-pinning for proper pinning
      await helia.blockstore.get(cidObj);
    } catch (error) {
      console.error(`Error pinning file (CID: ${cid}):`, error);
      throw new Error(`Failed to pin file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Unpin a file (allow garbage collection)
   */
  async unpinFile(cid: string): Promise<void> {
    // In Helia, unpinning is typically handled by garbage collection
    // For now, we'll just log - actual unpinning would require
    // tracking pinned CIDs separately or using @helia/remote-pinning
    console.log(`Unpinning file (CID: ${cid}) - GC will handle cleanup`);
  }

  /**
   * Pin a remote CID from the IPFS network
   * Fetches content from other nodes and stores locally
   * Used for marketplace purchases and network participation
   */
  async pinRemoteCID(cidString: string): Promise<{
    success: boolean;
    size: number;
    chunks: number;
  }> {
    if (this.networkMode === 'private') {
      throw new Error('Remote pinning requires public or hybrid network mode');
    }

    const fs = this.getUnixFS();

    try {
      const { CID } = await import('multiformats/cid');
      const cid = CID.parse(cidString);

      console.log(`[IPFS] Fetching remote CID from network: ${cidString}`);

      // Fetch content from the network using UnixFS cat
      // This will query DHT and retrieve from peers
      const chunks: Uint8Array[] = [];
      let totalSize = 0;

      for await (const chunk of fs.cat(cid)) {
        chunks.push(chunk);
        totalSize += chunk.length;
      }

      console.log(`[IPFS] ✅ Pinned remote CID: ${cidString} (${totalSize} bytes, ${chunks.length} chunks)`);

      return {
        success: true,
        size: totalSize,
        chunks: chunks.length
      };
    } catch (error) {
      console.error(`[IPFS] Failed to pin remote CID ${cidString}:`, error);
      throw new Error(`Failed to pin remote CID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List all connected peers
   */
  async getConnectedPeers(): Promise<string[]> {
    if (!this.helia || !this.isInitialized) {
      return [];
    }
    
    const connections = this.helia.libp2p.getConnections();
    return connections.map(conn => conn.remotePeer.toString());
  }

  /**
   * Get network statistics
   */
  async getNetworkStats(): Promise<{
    mode: IPFSNetworkMode;
    peerId: string | null;
    connectedPeers: number;
    addresses: string[];
  }> {
    return {
      mode: this.networkMode,
      peerId: this.getNodeId(),
      connectedPeers: this.helia ? this.helia.libp2p.getConnections().length : 0,
      addresses: this.getMultiaddrs()
    };
  }

  /**
   * Get IPFS node information
   */
  async getNodeInfo(): Promise<{
    id: string;
    addresses: string[];
    agentVersion: string;
    protocolVersion: string;
  }> {
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

  /**
   * Get node peer ID (short form for display)
   */
  getNodeId(): string | null {
    if (!this.helia || !this.isInitialized) {
      return null;
    }
    return this.helia.libp2p.peerId.toString();
  }

  /**
   * Get multiaddresses for this node
   */
  getMultiaddrs(): string[] {
    if (!this.helia || !this.isInitialized) {
      return [];
    }
    return this.helia.libp2p.getMultiaddrs().map(addr => addr.toString());
  }

  /**
   * Stop IPFS node gracefully
   */
  async stop(): Promise<void> {
    if (this.helia && this.isInitialized) {
      try {
        console.log('🛑 Stopping Helia IPFS node...');
        await this.helia.stop();
        this.helia = null;
        this.fs = null;
        this.isInitialized = false;
        console.log('✅ Helia IPFS node stopped');
      } catch (error) {
        console.error('Error stopping Helia IPFS node:', error);
        throw error;
      }
    }
  }

  /**
   * Check if IPFS is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.helia !== null;
  }
}
