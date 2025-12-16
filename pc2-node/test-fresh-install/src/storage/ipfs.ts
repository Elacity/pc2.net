/**
 * IPFS Storage Module
 * 
 * Handles file storage and retrieval using IPFS (InterPlanetary File System)
 * Files are stored content-addressed (by CID) and linked to paths via database
 */

import { create, IPFS } from 'ipfs-core';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface IPFSOptions {
  repoPath: string;
  enableSwarm?: boolean;
  enablePubsub?: boolean;
}

export class IPFSStorage {
  private ipfs: IPFS | null = null;
  private repoPath: string;
  private isInitialized: boolean = false;

  constructor(options: IPFSOptions) {
    this.repoPath = options.repoPath;
  }

  /**
   * Initialize IPFS node
   */
  async initialize(): Promise<void> {
    if (this.isInitialized && this.ipfs) {
      return; // Already initialized
    }

    // Ensure repo directory exists
    if (!existsSync(this.repoPath)) {
      mkdirSync(this.repoPath, { recursive: true });
    }

    try {
      console.log('🌐 Initializing IPFS node...');
      console.log(`   Repo path: ${this.repoPath}`);

      // Create IPFS node with configuration
      this.ipfs = await create({
        repo: this.repoPath,
        start: true,
        // Configuration for local-first storage
        config: {
          Addresses: {
            Swarm: [
              '/ip4/0.0.0.0/tcp/4001',
              '/ip6/::/tcp/4001',
              '/ip4/0.0.0.0/udp/4001/quic',
              '/ip6/::/udp/4001/quic'
            ],
            API: '/ip4/127.0.0.1/tcp/5001',
            Gateway: '/ip4/127.0.0.1/tcp/8080'
          },
          // Disable public swarm for privacy (local-only by default)
          // Users can enable if they want to share files
          Bootstrap: [
            // Minimal bootstrap nodes (can be customized)
            '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
            '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16b19JTGC'
          ],
          Discovery: {
            MDNS: {
              Enabled: true // Enable local network discovery
            }
          }
        },
        // Preload configuration
        preload: {
          enabled: false // Disable preload for privacy
        },
        // Experimental features (if needed)
        // Note: pubsub configuration may vary by IPFS version
      });

      // Get node info
      const id = await this.ipfs.id();
      console.log(`✅ IPFS node initialized`);
      console.log(`   Node ID: ${id.id}`);
      console.log(`   Addresses: ${id.addresses.length} configured`);

      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize IPFS:', error);
      throw error;
    }
  }

  /**
   * Get IPFS instance (throws if not initialized)
   */
  private getIPFS(): IPFS {
    if (!this.ipfs || !this.isInitialized) {
      throw new Error('IPFS not initialized. Call initialize() first.');
    }
    return this.ipfs;
  }

  /**
   * Store file content in IPFS
   * Returns the Content ID (CID) that can be used to retrieve the file
   */
  async storeFile(content: Buffer | Uint8Array | string, options?: {
    pin?: boolean; // Pin the file to prevent garbage collection
  }): Promise<string> {
    const ipfs = this.getIPFS();

    try {
      // Convert string to Buffer if needed
      const buffer = typeof content === 'string' 
        ? Buffer.from(content, 'utf8')
        : Buffer.from(content);

      // Add file to IPFS
      const result = await ipfs.add(buffer, {
        pin: options?.pin ?? true, // Pin by default to prevent GC
        cidVersion: 1 // Use CIDv1 for better compatibility
      });

      // result is an array, get the first (and only) entry
      const cid = Array.isArray(result) ? result[0] : result;
      return cid.cid.toString();
    } catch (error) {
      console.error('Error storing file in IPFS:', error);
      throw new Error(`Failed to store file in IPFS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve file content from IPFS using CID
   */
  async getFile(cid: string): Promise<Buffer> {
    const ipfs = this.getIPFS();

    try {
      // Get file from IPFS
      const chunks: Uint8Array[] = [];
      
      for await (const chunk of ipfs.cat(cid)) {
        chunks.push(chunk);
      }

      // Concatenate all chunks into a single buffer
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const buffer = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
      }

      return buffer;
    } catch (error) {
      console.error(`Error retrieving file from IPFS (CID: ${cid}):`, error);
      throw new Error(`Failed to retrieve file from IPFS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a CID exists in IPFS
   */
  async fileExists(cid: string): Promise<boolean> {
    const ipfs = this.getIPFS();

    try {
      // Try to stat the CID
      await ipfs.files.stat(`/ipfs/${cid}`);
      return true;
    } catch (error) {
      // If stat fails, file doesn't exist or isn't accessible
      return false;
    }
  }

  /**
   * Pin a file (prevent garbage collection)
   */
  async pinFile(cid: string): Promise<void> {
    const ipfs = this.getIPFS();

    try {
      await ipfs.pin.add(cid);
    } catch (error) {
      console.error(`Error pinning file (CID: ${cid}):`, error);
      throw new Error(`Failed to pin file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Unpin a file (allow garbage collection)
   */
  async unpinFile(cid: string): Promise<void> {
    const ipfs = this.getIPFS();

    try {
      await ipfs.pin.rm(cid);
    } catch (error) {
      console.error(`Error unpinning file (CID: ${cid}):`, error);
      // Don't throw - unpinning failures are not critical
    }
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
    const ipfs = this.getIPFS();
    const id = await ipfs.id();
    
    return {
      id: id.id.toString(),
      addresses: id.addresses.map(addr => addr.toString()),
      agentVersion: id.agentVersion,
      protocolVersion: id.protocolVersion
    };
  }

  /**
   * Stop IPFS node gracefully
   */
  async stop(): Promise<void> {
    if (this.ipfs && this.isInitialized) {
      try {
        console.log('🛑 Stopping IPFS node...');
        await this.ipfs.stop();
        this.ipfs = null;
        this.isInitialized = false;
        console.log('✅ IPFS node stopped');
      } catch (error) {
        console.error('Error stopping IPFS node:', error);
        throw error;
      }
    }
  }

  /**
   * Check if IPFS is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.ipfs !== null;
  }
}
