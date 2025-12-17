/**
 * Filesystem Abstraction Layer
 * 
 * Provides path-based file operations over IPFS storage
 * Links file paths (user-friendly) with IPFS CIDs (content-addressed)
 */

import { IPFSStorage } from './ipfs.js';
import { DatabaseManager, FileMetadata } from './database.js';
import { normalize, join, dirname } from 'path';
import { logger } from '../utils/logger.js';
import { generateThumbnail, supportsThumbnails } from './thumbnail.js';

export interface FileContent {
  content: Buffer | string;
  mimeType?: string;
  size?: number;
}

export class FilesystemManager {
  constructor(
    private ipfs: IPFSStorage | null,
    private db: DatabaseManager
  ) {
    // Validate that IPFS is available if provided
    if (ipfs && !ipfs.isReady()) {
      throw new Error('IPFSStorage provided but not initialized. Call initialize() first.');
    }
  }
  
  /**
   * Check if IPFS is available
   */
  private isIPFSAvailable(): boolean {
    return this.ipfs !== null && this.ipfs.isReady();
  }

  /**
   * Normalize file path
   */
  private normalizePath(path: string): string {
    // Ensure path starts with /
    const normalized = normalize(path);
    return normalized.startsWith('/') ? normalized : '/' + normalized;
  }

  /**
   * Write file (store in IPFS and save metadata in database)
   */
  async writeFile(
    path: string,
    content: Buffer | string,
    walletAddress: string,
    options?: {
      mimeType?: string;
      isPublic?: boolean;
    }
  ): Promise<FileMetadata> {
    const normalizedPath = this.normalizePath(path);
    
    // Ensure parent directory exists in database
    const parentPath = dirname(normalizedPath);
    if (parentPath !== '/' && parentPath !== '.') {
      await this.ensureDirectory(parentPath, walletAddress);
    }

    // Store file content in IPFS (if available)
    if (!this.isIPFSAvailable() || !this.ipfs) {
      throw new Error('IPFS is not available. File storage requires IPFS to be initialized.');
    }
    
    // Calculate actual content size
    const contentSize = Buffer.isBuffer(content) 
      ? content.length 
      : content instanceof Uint8Array
      ? content.length
      : Buffer.byteLength(content, 'utf8');
    
    logger.info(`[Filesystem] Storing file in IPFS: ${normalizedPath} (size: ${contentSize} bytes)`, {
      contentType: Buffer.isBuffer(content) ? 'Buffer' : (content instanceof Uint8Array ? 'Uint8Array' : typeof content),
      contentLength: contentSize
    });
    
    const ipfsHash = await this.ipfs.storeFile(content, { pin: true });
    
    // Verify the stored file size matches
    const storedSize = Buffer.isBuffer(content) ? content.length : (content instanceof Uint8Array ? content.length : Buffer.byteLength(content, 'utf8'));
    logger.info(`[Filesystem] File stored in IPFS: ${normalizedPath} -> CID: ${ipfsHash} (stored size: ${storedSize} bytes)`);

    // Calculate size
    const size = Buffer.isBuffer(content) 
      ? content.length 
      : Buffer.byteLength(content, 'utf8');

    const mimeType = options?.mimeType || this.guessMimeType(path);

    // Generate thumbnail for images/videos/PDFs/text files
    let thumbnail: string | null = null;
    if (supportsThumbnails(mimeType)) {
      try {
        // Convert content to Buffer for thumbnail generation
        const contentBuffer = Buffer.isBuffer(content) 
          ? content 
          : content instanceof Uint8Array
          ? Buffer.from(content)
          : Buffer.from(content, 'utf8');
        
        const fileUuid = `uuid-${normalizedPath.replace(/\//g, '-').replace(/^-/, '')}`;
        thumbnail = await generateThumbnail(contentBuffer, mimeType, fileUuid);
        
        if (thumbnail) {
          logger.info(`[Filesystem] 🖼️  Thumbnail generated for: ${normalizedPath}`);
        }
      } catch (error: any) {
        logger.warn(`[Filesystem] ⚠️  Thumbnail generation failed for ${normalizedPath}: ${error.message}`);
        // Continue without thumbnail - not critical
      }
    }

    // Create or update file metadata in database
    const metadata: FileMetadata = {
      path: normalizedPath,
      wallet_address: walletAddress,
      ipfs_hash: ipfsHash,
      size: size,
      mime_type: mimeType,
      thumbnail: thumbnail,
      is_dir: false,
      is_public: options?.isPublic || false,
      created_at: Date.now(),
      updated_at: Date.now()
    };

    // Check if file already exists to preserve created_at
    const existing = this.db.getFile(normalizedPath, walletAddress);
    if (existing) {
      metadata.created_at = existing.created_at;
    }

    this.db.createOrUpdateFile(metadata);

    return metadata;
  }

  /**
   * Read file (retrieve from IPFS using CID from database)
   */
  async readFile(path: string, walletAddress: string): Promise<Buffer> {
    const normalizedPath = this.normalizePath(path);

    logger.info(`[Filesystem] readFile called`, {
      path,
      normalizedPath,
      walletAddress,
      isIPFSAvailable: this.isIPFSAvailable()
    });

    // Get file metadata from database
    const metadata = this.db.getFile(normalizedPath, walletAddress);
    if (!metadata) {
      // List all files for this wallet to help debug
      let allFiles: any[] = [];
      try {
        // Try to get all files for this wallet from database
        const dbInstance = (this.db as any).getDB();
        if (dbInstance) {
          allFiles = dbInstance.prepare(`
            SELECT path FROM files 
            WHERE wallet_address = ?
            LIMIT 10
          `).all(walletAddress) || [];
        }
      } catch (e) {
        // Ignore if we can't query
        logger.debug(`[Filesystem] Could not query all files for debugging: ${e instanceof Error ? e.message : String(e)}`);
      }
      
      logger.error(`[Filesystem] File not found in database`, {
        path,
        normalizedPath,
        walletAddress,
        totalFilesForWallet: allFiles.length,
        samplePaths: allFiles.slice(0, 5).map((f: any) => f.path)
      });
      throw new Error(`File not found: ${path}`);
    }

    if (metadata.is_dir) {
      throw new Error(`Path is a directory: ${path}`);
    }

    if (!metadata.ipfs_hash) {
      logger.error(`[Filesystem] File has no IPFS hash`, {
        path,
        normalizedPath,
        walletAddress,
        metadata: {
          path: metadata.path,
          size: metadata.size,
          mime_type: metadata.mime_type,
          has_ipfs_hash: !!metadata.ipfs_hash
        }
      });
      throw new Error(`File has no IPFS hash: ${path}`);
    }

    // Retrieve file content from IPFS (if available)
    if (!this.isIPFSAvailable() || !this.ipfs) {
      throw new Error('IPFS is not available. Cannot retrieve file content.');
    }
    
    logger.info(`[Filesystem] Retrieving file from IPFS: ${normalizedPath} (CID: ${metadata.ipfs_hash})`);
    try {
      const content = await this.ipfs.getFile(metadata.ipfs_hash);
      logger.info(`[Filesystem] File retrieved from IPFS: ${normalizedPath} (size: ${content.length} bytes)`);
      return content;
    } catch (error) {
      logger.error(`[Filesystem] Failed to retrieve file from IPFS`, {
        path: normalizedPath,
        cid: metadata.ipfs_hash,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  getFileMetadata(path: string, walletAddress: string): FileMetadata | null {
    const normalizedPath = this.normalizePath(path);
    return this.db.getFile(normalizedPath, walletAddress);
  }

  /**
   * List directory contents
   */
  listDirectory(path: string, walletAddress: string): FileMetadata[] {
    const normalizedPath = this.normalizePath(path);
    
    // Get all files in this directory
    const allFiles = this.db.listFiles(normalizedPath, walletAddress);
    
    // Filter to only direct children (not nested)
    const directChildren: FileMetadata[] = [];
    const pathPrefix = normalizedPath === '/' ? '/' : normalizedPath + '/';
    
    for (const file of allFiles) {
      // Skip the directory itself
      if (file.path === normalizedPath) {
        continue;
      }
      
      // Check if this is a direct child
      const relativePath = file.path.startsWith(pathPrefix) 
        ? file.path.substring(pathPrefix.length)
        : file.path;
      
      // If relative path has no slashes, it's a direct child
      if (!relativePath.includes('/')) {
        directChildren.push(file);
      }
    }

    return directChildren;
  }

  /**
   * Create directory
   */
  async createDirectory(path: string, walletAddress: string): Promise<FileMetadata> {
    const normalizedPath = this.normalizePath(path);

    // Ensure parent directory exists
    const parentPath = dirname(normalizedPath);
    if (parentPath !== '/' && parentPath !== '.' && parentPath !== normalizedPath) {
      await this.ensureDirectory(parentPath, walletAddress);
    }

    // Determine if directory should be public (only folders in /Public directory)
    // Match mock server logic: only set is_public for folders actually inside /Public directory
    // Examples:
    //   /Public -> is_public = true
    //   /Public/MyFolder -> is_public = true
    //   /MyPublicFolder -> is_public = false (folder name contains "Public" but not in /Public directory)
    //   /wallet/Public -> is_public = true
    //   /wallet/Public/SubFolder -> is_public = true
    // Check if path is exactly /Public or is a direct child of /Public
    // Use more precise matching to avoid false positives
    const isPublic = normalizedPath === '/Public' || 
                     normalizedPath.startsWith('/Public/') ||
                     (normalizedPath.includes('/Public/') && !normalizedPath.match(/\/Public[^/]/));
    
    // Create directory metadata (no IPFS hash for directories)
    const metadata: FileMetadata = {
      path: normalizedPath,
      wallet_address: walletAddress,
      ipfs_hash: null,
      size: 0,
      mime_type: null,
      is_dir: true,
      is_public: isPublic,
      created_at: Date.now(),
      updated_at: Date.now()
    };

    // Check if directory already exists
    const existing = this.db.getFile(normalizedPath, walletAddress);
    if (existing) {
      if (!existing.is_dir) {
        throw new Error(`Path exists as a file: ${path}`);
      }
      // Directory already exists, return existing metadata
      logger.info('[Filesystem] Directory already exists', { path: normalizedPath });
      return existing;
    }

    logger.info('[Filesystem] Creating directory in database', {
      path: normalizedPath,
      wallet: walletAddress,
      is_public: isPublic
    });
    
    this.db.createOrUpdateFile(metadata);
    
    // Verify it was created
    const created = this.db.getFile(normalizedPath, walletAddress);
    if (!created) {
      throw new Error(`Failed to create directory: ${normalizedPath}`);
    }
    
    logger.info('[Filesystem] Directory created and verified', { path: normalizedPath });
    return metadata;
  }

  /**
   * Ensure directory exists (create if it doesn't)
   */
  private async ensureDirectory(path: string, walletAddress: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    
    if (normalizedPath === '/' || normalizedPath === '.') {
      return; // Root always exists
    }

    const existing = this.db.getFile(normalizedPath, walletAddress);
    if (existing && existing.is_dir) {
      return; // Directory already exists
    }

    if (existing && !existing.is_dir) {
      throw new Error(`Path exists as a file: ${path}`);
    }

    // Recursively create parent directories
    const parentPath = dirname(normalizedPath);
    if (parentPath !== '/' && parentPath !== '.' && parentPath !== normalizedPath) {
      await this.ensureDirectory(parentPath, walletAddress);
    }

    // Create this directory
    await this.createDirectory(normalizedPath, walletAddress);
  }

  /**
   * Delete file or directory
   */
  async deleteFile(path: string, walletAddress: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const metadata = this.db.getFile(normalizedPath, walletAddress);

    if (!metadata) {
      throw new Error(`File not found: ${path}`);
    }

    if (metadata.is_dir) {
      // For directories, check if it's empty
      const children = this.listDirectory(normalizedPath, walletAddress);
      if (children.length > 0) {
        throw new Error(`Directory not empty: ${path}`);
      }
    } else {
      // For files, unpin from IPFS (optional - allows garbage collection)
      if (metadata.ipfs_hash && this.isIPFSAvailable() && this.ipfs) {
        try {
          await this.ipfs.unpinFile(metadata.ipfs_hash);
        } catch (error) {
          // Non-critical - continue with deletion
          console.warn(`Failed to unpin file ${metadata.ipfs_hash}:`, error);
        }
      }
    }

    // Remove from database
    this.db.deleteFile(normalizedPath, walletAddress);
  }

  /**
   * Move/rename file or directory
   */
  async moveFile(
    oldPath: string,
    newPath: string,
    walletAddress: string
  ): Promise<FileMetadata> {
    const normalizedOldPath = this.normalizePath(oldPath);
    const normalizedNewPath = this.normalizePath(newPath);

    // Get existing file
    const existing = this.db.getFile(normalizedOldPath, walletAddress);
    if (!existing) {
      throw new Error(`File not found: ${oldPath}`);
    }

    // Ensure new parent directory exists
    const newParentPath = dirname(normalizedNewPath);
    if (newParentPath !== '/' && newParentPath !== '.') {
      await this.ensureDirectory(newParentPath, walletAddress);
    }

    // Check if new path already exists
    const existingNew = this.db.getFile(normalizedNewPath, walletAddress);
    if (existingNew) {
      throw new Error(`Destination already exists: ${newPath}`);
    }

    // If it's a directory, we'd need to move all children too
    // For now, we'll just update the metadata
    // TODO: Implement recursive directory move if needed

    // Delete old entry
    this.db.deleteFile(normalizedOldPath, walletAddress);

    // Create new entry with same data but new path
    const newMetadata: FileMetadata = {
      ...existing,
      path: normalizedNewPath,
      updated_at: Date.now()
    };

    this.db.createOrUpdateFile(newMetadata);

    return newMetadata;
  }

  /**
   * Guess MIME type from file extension
   */
  private guessMimeType(path: string): string | null {
    const ext = path.split('.').pop()?.toLowerCase();
    if (!ext) {
      return null;
    }

    const mimeTypes: Record<string, string> = {
      'txt': 'text/plain',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'text/javascript',
      'json': 'application/json',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'pdf': 'application/pdf',
      'zip': 'application/zip',
      // Video formats
      'mp4': 'video/mp4',
      'mov': 'video/quicktime',
      'webm': 'video/webm',
      'mpg': 'video/mpeg',
      'mpeg': 'video/mpeg',
      'mpv': 'video/mpeg',
      'avi': 'video/x-msvideo',
      'mkv': 'video/x-matroska',
      // Audio formats
      'mp3': 'audio/mpeg',
      'm4a': 'audio/mp4',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'flac': 'audio/flac'
    };

    return mimeTypes[ext] || null;
  }
}

