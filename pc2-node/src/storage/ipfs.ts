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
import { ping } from '@libp2p/ping';
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
        
        // Add ping service (required for DHT)
        (libp2pConfig.services as any).ping = ping();

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
   * Error types for remote pinning operations
   */
  static readonly PinErrorType = {
    PRIVATE_MODE: 'PRIVATE_MODE',
    INVALID_CID: 'INVALID_CID',
    TIMEOUT: 'TIMEOUT',
    NOT_FOUND: 'NOT_FOUND',
    NETWORK_ERROR: 'NETWORK_ERROR',
    DIRECTORY_TOO_LARGE: 'DIRECTORY_TOO_LARGE',
  } as const;

  /**
   * Pin a remote CID from the IPFS network
   * Fetches content from other nodes and stores locally
   * Handles both files and directories with timeout support
   * Used for marketplace purchases and network participation
   * 
   * @param cidString - The CID to fetch and pin
   * @param options - Optional configuration
   * @param options.timeoutMs - Timeout in milliseconds (default: 60000)
   * @param options.maxFiles - Maximum files to fetch for directories (default: 1000)
   */
  async pinRemoteCID(cidString: string, options?: {
    timeoutMs?: number;
    maxFiles?: number;
  }): Promise<{
    success: boolean;
    cid: string;
    type: 'file' | 'directory' | 'raw';
    size: number;
    files?: number;
    timeMs: number;
    content?: Uint8Array; // Content bytes when fetched via gateway
    actualCid?: string; // Actual CID in local store (may differ due to v0/v1)
  }> {
    const startTime = Date.now();
    const timeoutMs = options?.timeoutMs ?? 60000; // 60 second default
    const maxFiles = options?.maxFiles ?? 1000;

    if (this.networkMode === 'private') {
      throw Object.assign(
        new Error('Remote pinning requires public or hybrid network mode'),
        { type: IPFSStorage.PinErrorType.PRIVATE_MODE }
      );
    }

    const fs = this.getUnixFS();

    // Parse CID
    let cid: any;
    try {
      const { CID } = await import('multiformats/cid');
      cid = CID.parse(cidString);
    } catch (error) {
      throw Object.assign(
        new Error(`Invalid CID format: ${cidString}`),
        { type: IPFSStorage.PinErrorType.INVALID_CID }
      );
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      console.log(`[IPFS] Fetching remote CID from network: ${cidString} (timeout: ${timeoutMs}ms)`);

      // Helper to wrap operations with timeout check
      const checkAbort = () => {
        if (controller.signal.aborted) {
          throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
        }
      };

      // Try quick local fetch first (2s timeout) - skips DHT if content is cached
      const quickLocalTimeoutMs = 2000;
      let localContent: Uint8Array | null = null;
      
      try {
        console.log(`[IPFS] Trying quick local fetch for ${cidString}...`);
        const chunks: Uint8Array[] = [];
        let totalSize = 0;
        
        const catPromise = (async () => {
          for await (const chunk of fs.cat(cid)) {
            chunks.push(chunk);
            totalSize += chunk.length;
            checkAbort();
          }
          return chunks;
        })();
        
        const timeoutPromise = new Promise<null>((resolve) => 
          setTimeout(() => resolve(null), quickLocalTimeoutMs)
        );
        
        const result = await Promise.race([catPromise, timeoutPromise]);
        
        if (result && chunks.length > 0) {
          // Content found locally!
          const combined = new Uint8Array(totalSize);
          let offset = 0;
          for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }
          localContent = combined;
          console.log(`[IPFS] ✅ Found locally: ${cidString} (${totalSize} bytes)`);
          
          const timeMs = Date.now() - startTime;
          return {
            success: true,
            cid: cidString,
            type: 'file' as const,
            size: totalSize,
            timeMs,
            content: localContent,
            actualCid: cidString
          };
        }
      } catch (localError: any) {
        console.log(`[IPFS] Quick local fetch failed: ${localError.message}`);
      }
      
      // Not found locally, try gateway directly (skip slow DHT stat)
      console.log(`[IPFS] Content not cached locally, trying gateways...`);
      try {
        const gatewayResult = await this.fetchViaGateway(cidString, timeoutMs - (Date.now() - startTime));
        if (gatewayResult.success) {
          const timeMs = Date.now() - startTime;
          console.log(`[IPFS] ✅ Fetched via gateway: ${cidString} (${gatewayResult.size} bytes, ${timeMs}ms)`);
          return {
            success: true,
            cid: cidString,
            type: 'file' as const,
            size: gatewayResult.size,
            timeMs,
            content: gatewayResult.content,
            actualCid: gatewayResult.actualCid
          };
        }
      } catch (gatewayError: any) {
        console.log(`[IPFS] Gateway fallback failed: ${gatewayError.message}`);
      }
      
      // Last resort: try stat + cat with remaining timeout (for directories or special cases)
      const statTimeoutMs = Math.min(timeoutMs - (Date.now() - startTime), 15000);
      let stats: any;
      
      try {
        checkAbort();
        console.log(`[IPFS] Trying DHT stat for ${cidString}...`);
        
        const statPromise = fs.stat(cid);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('stat_timeout')), statTimeoutMs)
        );
        
        stats = await Promise.race([statPromise, timeoutPromise]);
        console.log(`[IPFS] CID type: ${stats.type}`);
      } catch (error: any) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`[IPFS] DHT stat failed: ${errorMsg}`);
        
        throw Object.assign(
          new Error(`Content not found: Could not retrieve from local cache, gateways, or DHT`),
          { type: IPFSStorage.PinErrorType.NOT_FOUND }
        );
      }

      let totalSize = 0;
      let fileCount = 0;

      if (stats.type === 'directory') {
        // Handle directory: recursively fetch all files
        console.log(`[IPFS] Fetching directory contents...`);
        const result = await this.fetchDirectoryRecursive(fs, cid, controller.signal, maxFiles, 0);
        totalSize = result.size;
        fileCount = result.files;

        if (result.truncated) {
          console.warn(`[IPFS] ⚠️ Directory fetch truncated at ${maxFiles} files`);
        }

        console.log(`[IPFS] ✅ Pinned remote directory: ${cidString} (${fileCount} files, ${totalSize} bytes)`);
      } else {
        // Handle file or raw: use cat() without signal
        const chunks: Uint8Array[] = [];

        for await (const chunk of fs.cat(cid)) {
          chunks.push(chunk);
          totalSize += chunk.length;
          checkAbort(); // Check abort between chunks
        }

        fileCount = 1;
        console.log(`[IPFS] ✅ Pinned remote file: ${cidString} (${totalSize} bytes, ${chunks.length} chunks)`);
      }

      const timeMs = Date.now() - startTime;

      return {
        success: true,
        cid: cidString,
        type: stats.type,
        size: totalSize,
        files: stats.type === 'directory' ? fileCount : undefined,
        timeMs
      };
    } catch (error: any) {
      // Re-throw typed errors as-is
      if (error.type) {
        // Try gateway fallback for NOT_FOUND and NETWORK_ERROR
        if (error.type === IPFSStorage.PinErrorType.NOT_FOUND || 
            error.type === IPFSStorage.PinErrorType.NETWORK_ERROR) {
          console.log(`[IPFS] DHT fetch failed, trying gateway fallback...`);
          try {
            const gatewayResult = await this.fetchViaGateway(cidString, timeoutMs - (Date.now() - startTime));
            if (gatewayResult.success) {
              const timeMs = Date.now() - startTime;
              return {
                success: true,
                cid: cidString,
                type: 'file' as const,
                size: gatewayResult.size,
                timeMs,
                content: gatewayResult.content,
                actualCid: gatewayResult.actualCid
              };
            }
          } catch (gatewayError: any) {
            console.log(`[IPFS] Gateway fallback also failed: ${gatewayError.message}`);
          }
        }
        throw error;
      }

      // Handle abort/timeout
      if (error.name === 'AbortError' || controller.signal.aborted) {
        throw Object.assign(
          new Error(`Timeout: Could not fetch content within ${timeoutMs / 1000}s`),
          { type: IPFSStorage.PinErrorType.TIMEOUT }
        );
      }

      // Handle other errors - try gateway fallback
      console.error(`[IPFS] Failed to pin remote CID ${cidString}:`, error);
      console.log(`[IPFS] Trying gateway fallback...`);
      
      try {
        const gatewayResult = await this.fetchViaGateway(cidString, timeoutMs - (Date.now() - startTime));
        if (gatewayResult.success) {
          const timeMs = Date.now() - startTime;
          return {
            success: true,
            cid: cidString,
            type: 'file' as const,
            size: gatewayResult.size,
            timeMs,
            content: gatewayResult.content,
            actualCid: gatewayResult.actualCid
          };
        }
      } catch (gatewayError: any) {
        console.log(`[IPFS] Gateway fallback also failed: ${gatewayError.message}`);
      }
      
      throw Object.assign(
        new Error(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`),
        { type: IPFSStorage.PinErrorType.NETWORK_ERROR }
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetch content via public IPFS gateway and add to local node
   * Used as fallback when DHT fetching fails
   * @private
   */
  private async fetchViaGateway(cidString: string, remainingTimeoutMs: number): Promise<{
    success: boolean;
    size: number;
    content?: Uint8Array;
    actualCid?: string;
  }> {
    // Extended list of public IPFS gateways (ordered by reliability)
    const GATEWAYS = [
      'https://ipfs.io/ipfs/',
      'https://dweb.link/ipfs/',
      'https://w3s.link/ipfs/',
      'https://nftstorage.link/ipfs/',
      'https://gateway.pinata.cloud/ipfs/',
      'https://4everland.io/ipfs/',
      'https://cloudflare-ipfs.com/ipfs/',
    ];

    const fs = this.getUnixFS();
    // Generous timeout for gateway fetches - large files need time
    const timeoutMs = Math.max(remainingTimeoutMs, 60000); // At least 60s for gateway

    // Try each gateway with retries
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        console.log(`[IPFS] Gateway retry attempt ${attempt + 1}...`);
        await new Promise(r => setTimeout(r, 2000)); // Wait 2s before retry
      }

      for (const gateway of GATEWAYS) {
        try {
          console.log(`[IPFS] Trying gateway: ${gateway}${cidString}`);
          
          const response = await fetch(`${gateway}${cidString}`, {
            signal: AbortSignal.timeout(timeoutMs),
            headers: {
              'Accept': '*/*',
            },
          });

          if (!response.ok) {
            console.log(`[IPFS] Gateway ${gateway} returned ${response.status}`);
            continue;
          }

          // Read content
          const buffer = await response.arrayBuffer();
          const content = new Uint8Array(buffer);
          
          console.log(`[IPFS] ✅ Fetched ${content.length} bytes from gateway ${gateway}`);

          // Add to local IPFS
          const addedCid = await fs.addBytes(content);
          console.log(`[IPFS] ✅ Added to local IPFS: ${addedCid.toString()}`);

          // CID version may differ (v0 vs v1), but content is the same
          if (addedCid.toString() !== cidString) {
            console.log(`[IPFS] CID versions differ: requested ${cidString.substring(0, 12)}..., stored as ${addedCid.toString().substring(0, 12)}...`);
          }

          return {
            success: true,
            size: content.length,
            content: content, // Return content so caller can save it directly
            actualCid: addedCid.toString()
          };
        } catch (error: any) {
          const errMsg = error.message || 'Unknown error';
          // Only log brief error for cleaner output
          if (errMsg.includes('timeout') || errMsg.includes('abort')) {
            console.log(`[IPFS] Gateway ${gateway} timed out`);
          } else {
            console.log(`[IPFS] Gateway ${gateway} failed: ${errMsg.substring(0, 100)}`);
          }
          continue;
        }
      }
    }

    throw new Error('All gateways failed after retries');
  }

  /**
   * Recursively fetch all files in a directory
   * Note: Signal checking is done manually to work around Helia async iterator issues
   * @private
   */
  private async fetchDirectoryRecursive(
    fs: UnixFS,
    cid: any,
    signal: AbortSignal,
    maxFiles: number,
    currentCount: number
  ): Promise<{ size: number; files: number; truncated: boolean }> {
    let totalSize = 0;
    let fileCount = 0;
    let truncated = false;

    // Check for abort before starting
    if (signal.aborted) {
      throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    }

    // Note: Not passing signal to ls() due to Helia async iterator compatibility issues
    // Instead, we check signal.aborted manually between operations
    for await (const entry of fs.ls(cid)) {
      // Check for abort between files
      if (signal.aborted) {
        throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
      }

      if (currentCount + fileCount >= maxFiles) {
        truncated = true;
        break;
      }

      if (entry.type === 'directory') {
        // Recurse into subdirectory
        const subResult = await this.fetchDirectoryRecursive(
          fs,
          entry.cid,
          signal,
          maxFiles,
          currentCount + fileCount
        );
        totalSize += subResult.size;
        fileCount += subResult.files;
        truncated = truncated || subResult.truncated;
      } else {
        // Fetch file content (no signal to avoid iterator issues)
        for await (const chunk of fs.cat(entry.cid)) {
          totalSize += chunk.length;
          // Check for abort during large file fetch
          if (signal.aborted) {
            throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
          }
        }
        fileCount++;
      }
    }

    return { size: totalSize, files: fileCount, truncated };
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

  // ============================================================================
  // DHT Announcement Methods (for IPFS Public Folder Sharing)
  // ============================================================================

  /**
   * Announce a single CID to the DHT network
   * This makes the CID discoverable by other IPFS nodes
   */
  async announceCID(cid: string): Promise<boolean> {
    if (this.networkMode === 'private') {
      console.log(`[IPFS] Skipping DHT announcement (private mode): ${cid}`);
      return false;
    }

    if (!this.helia || !this.isInitialized) {
      console.warn(`[IPFS] Cannot announce CID - IPFS not initialized`);
      return false;
    }

    try {
      const dht = (this.helia.libp2p.services as any).dht;
      if (!dht) {
        console.warn(`[IPFS] DHT service not available`);
        return false;
      }

      const { CID } = await import('multiformats/cid');
      const cidObj = CID.parse(cid);
      
      console.log(`[IPFS] Announcing CID to DHT: ${cid}`);
      
      // Use the DHT provide method to announce we have this content
      await dht.provide(cidObj);
      
      console.log(`[IPFS] ✅ Successfully announced CID to DHT: ${cid}`);
      return true;
    } catch (error) {
      console.error(`[IPFS] Failed to announce CID ${cid}:`, error);
      return false;
    }
  }

  /**
   * Announce multiple CIDs to the DHT network
   * Used for batch announcement of public files
   */
  async announceMultipleCIDs(cids: string[]): Promise<{ success: number; failed: number }> {
    if (this.networkMode === 'private') {
      console.log(`[IPFS] Skipping batch DHT announcement (private mode)`);
      return { success: 0, failed: 0 };
    }

    let success = 0;
    let failed = 0;

    console.log(`[IPFS] Starting batch announcement of ${cids.length} CIDs...`);

    for (const cid of cids) {
      try {
        const announced = await this.announceCID(cid);
        if (announced) {
          success++;
        } else {
          failed++;
        }
        // Small delay between announcements to avoid overwhelming DHT
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        failed++;
        console.error(`[IPFS] Failed to announce CID ${cid}:`, error);
      }
    }

    console.log(`[IPFS] Batch announcement complete: ${success} success, ${failed} failed`);
    return { success, failed };
  }

  /**
   * Get DHT announcement statistics
   */
  getAnnouncementStats(): {
    mode: IPFSNetworkMode;
    dhtEnabled: boolean;
    canAnnounce: boolean;
    connectedPeers: number;
  } {
    const dhtEnabled = this.networkMode !== 'private' && 
                       this.helia !== null && 
                       (this.helia.libp2p.services as any).dht !== undefined;
    
    return {
      mode: this.networkMode,
      dhtEnabled,
      canAnnounce: dhtEnabled && this.isInitialized,
      connectedPeers: this.helia ? this.helia.libp2p.getConnections().length : 0
    };
  }

  /**
   * Check if DHT is available for announcements
   */
  canAnnounce(): boolean {
    return this.networkMode !== 'private' && 
           this.isInitialized && 
           this.helia !== null &&
           (this.helia.libp2p.services as any).dht !== undefined;
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
