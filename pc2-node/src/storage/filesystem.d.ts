/**
 * Filesystem Abstraction Layer
 *
 * Provides path-based file operations over IPFS storage
 * Links file paths (user-friendly) with IPFS CIDs (content-addressed)
 */
import { IPFSStorage } from './ipfs.js';
import { DatabaseManager, FileMetadata } from './database.js';
export interface FileContent {
    content: Buffer | string;
    mimeType?: string;
    size?: number;
}
export declare class FilesystemManager {
    private ipfs;
    private db;
    constructor(ipfs: IPFSStorage | null, db: DatabaseManager);
    /**
     * Check if IPFS is available
     */
    private isIPFSAvailable;
    /**
     * Get the IPFS storage instance (for public gateway)
     */
    getIPFS(): IPFSStorage | null;
    /**
     * Normalize file path
     */
    private normalizePath;
    /**
     * Write file (store in IPFS and save metadata in database)
     */
    writeFile(path: string, content: Buffer | string, walletAddress: string, options?: {
        mimeType?: string;
        isPublic?: boolean;
    }): Promise<FileMetadata>;
    /**
     * Read file (retrieve from IPFS using CID from database)
     */
    readFile(path: string, walletAddress: string): Promise<Buffer>;
    /**
     * Get file metadata
     */
    getFileMetadata(path: string, walletAddress: string): FileMetadata | null;
    /**
     * List directory contents
     */
    listDirectory(path: string, walletAddress: string): FileMetadata[];
    /**
     * Create directory
     */
    createDirectory(path: string, walletAddress: string): Promise<FileMetadata>;
    /**
     * Ensure directory exists (create if it doesn't)
     */
    private ensureDirectory;
    /**
     * Delete file or directory
     */
    deleteFile(path: string, walletAddress: string, recursive?: boolean): Promise<void>;
    /**
     * Move/rename file or directory
     */
    moveFile(oldPath: string, newPath: string, walletAddress: string): Promise<FileMetadata>;
    /**
     * Copy file or directory
     */
    copyFile(sourcePath: string, destPath: string, walletAddress: string): Promise<FileMetadata>;
    /**
     * Guess MIME type from file extension
     */
    private guessMimeType;
}
//# sourceMappingURL=filesystem.d.ts.map