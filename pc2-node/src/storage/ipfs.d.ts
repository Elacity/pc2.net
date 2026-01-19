/**
 * IPFS Storage Module
 *
 * Handles file storage and retrieval using Helia (modern IPFS implementation)
 * Files are stored content-addressed (by CID) and linked to paths via database
 */
import '../utils/polyfill.js';
/**
 * IPFS Network Modes:
 * - private: Isolated node, no network connectivity (personal cloud only)
 * - public: Full DHT participation, content discoverable globally
 * - hybrid: Connect to network but only announce public content
 */
export type IPFSNetworkMode = 'private' | 'public' | 'hybrid';
export interface IPFSOptions {
    repoPath: string;
    mode?: IPFSNetworkMode;
    enableDHT?: boolean;
    enableBootstrap?: boolean;
    customBootstrap?: string[];
}
export declare class IPFSStorage {
    private helia;
    private fs;
    private blockstore;
    private repoPath;
    private isInitialized;
    private networkMode;
    private options;
    constructor(options: IPFSOptions);
    /**
     * Get the current network mode
     */
    getNetworkMode(): IPFSNetworkMode;
    /**
     * Initialize Helia IPFS node
     */
    initialize(): Promise<void>;
    /**
     * Get Helia instance (throws if not initialized)
     */
    private getHelia;
    /**
     * Get UnixFS instance (throws if not initialized)
     */
    private getUnixFS;
    /**
     * Store file content in IPFS
     * Returns the Content ID (CID) that can be used to retrieve the file
     */
    storeFile(content: Buffer | Uint8Array | string, options?: {
        pin?: boolean;
    }): Promise<string>;
    /**
     * Retrieve file content from IPFS using CID
     */
    getFile(cid: string): Promise<Buffer>;
    /**
     * Check if a CID exists in IPFS
     */
    fileExists(cid: string): Promise<boolean>;
    /**
     * Pin a file (prevent garbage collection)
     */
    pinFile(cid: string): Promise<void>;
    /**
     * Unpin a file (allow garbage collection)
     */
    unpinFile(cid: string): Promise<void>;
    /**
     * Pin a remote CID from the IPFS network
     * Fetches content from other nodes and stores locally
     * Used for marketplace purchases and network participation
     */
    pinRemoteCID(cidString: string): Promise<{
        success: boolean;
        size: number;
        chunks: number;
    }>;
    /**
     * List all connected peers
     */
    getConnectedPeers(): Promise<string[]>;
    /**
     * Get network statistics
     */
    getNetworkStats(): Promise<{
        mode: IPFSNetworkMode;
        peerId: string | null;
        connectedPeers: number;
        addresses: string[];
    }>;
    /**
     * Get IPFS node information
     */
    getNodeInfo(): Promise<{
        id: string;
        addresses: string[];
        agentVersion: string;
        protocolVersion: string;
    }>;
    /**
     * Get node peer ID (short form for display)
     */
    getNodeId(): string | null;
    /**
     * Get multiaddresses for this node
     */
    getMultiaddrs(): string[];
    /**
     * Stop IPFS node gracefully
     */
    stop(): Promise<void>;
    /**
     * Check if IPFS is initialized
     */
    isReady(): boolean;
}
//# sourceMappingURL=ipfs.d.ts.map