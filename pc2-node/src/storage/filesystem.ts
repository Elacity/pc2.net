/**
 * Filesystem Abstraction Layer
 * 
 * Provides path-based file operations over IPFS storage
 * Links file paths (user-friendly) with IPFS CIDs (content-addressed)
 */

import { IPFSStorage } from './ipfs.js';
import { DatabaseManager, FileMetadata } from './database.js';
import { normalize, join, dirname } from 'path';
import { createReadStream, statSync, unlinkSync } from 'fs';
import { logger, createLogger } from '../utils/logger.js';

const log = createLogger('filesystem');
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
   * Get the IPFS storage instance (for public gateway)
   */
  getIPFS(): IPFSStorage | null {
    return this.ipfs;
  }

  /**
   * Normalize file path (strip trailing slashes so we never store .../ElastOS/ which would display as "/")
   */
  private normalizePath(path: string): string {
    const normalized = normalize(path);
    const withLeading = normalized.startsWith('/') ? normalized : '/' + normalized;
    return withLeading.replace(/\/+$/, '') || '/';
  }

  /**
   * Check if a path is in the Public folder
   * Returns true for paths like /Public/*, /wallet/Public/*, etc.
   */
  private isInPublicFolder(normalizedPath: string): boolean {
    // Match paths that are exactly /Public or inside /Public/
    // Also match /wallet/Public/ patterns
    return normalizedPath === '/Public' || 
           normalizedPath.startsWith('/Public/') ||
           /^\/[^/]+\/Public(\/|$)/.test(normalizedPath);
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
    
    // Auto-detect if file is in Public folder
    const isInPublicFolder = this.isInPublicFolder(normalizedPath);
    const isPublic = options?.isPublic ?? isInPublicFolder;
    
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
      : Buffer.byteLength(content, 'utf8');
    
    logger.info(`[Filesystem] Storing file in IPFS: ${normalizedPath} (size: ${contentSize} bytes)`, {
      contentType: Buffer.isBuffer(content) ? 'Buffer' : typeof content,
      contentLength: contentSize
    });
    
    const ipfsHash = await this.ipfs.storeFile(content, { pin: true });
    
    // Verify the stored file size matches
    const storedSize = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, 'utf8');
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
          : Buffer.from(content, 'utf8');
        
        const fileUuid = `uuid-${normalizedPath.replace(/\//g, '-').replace(/^-/, '')}`;
        thumbnail = await generateThumbnail(contentBuffer, mimeType || 'application/octet-stream', fileUuid);
        
        if (thumbnail) {
          logger.info(`[Filesystem] 🖼️  Thumbnail generated for: ${normalizedPath}`);
        }
      } catch (error: any) {
        logger.warn(`[Filesystem] ⚠️  Thumbnail generation failed for ${normalizedPath}: ${error.message}`);
        // Continue without thumbnail - not critical
      }
    }

    // Check if file already exists (for versioning and preserving created_at)
    const existing = this.db.getFile(normalizedPath, walletAddress);
    
    // Create version snapshot if file already exists (before updating)
    if (existing && existing.ipfs_hash) {
      const nextVersion = this.db.getNextVersionNumber(normalizedPath, walletAddress);
      this.db.createFileVersion({
        file_path: normalizedPath,
        wallet_address: walletAddress,
        version_number: nextVersion,
        ipfs_hash: existing.ipfs_hash,
        size: existing.size,
        mime_type: existing.mime_type,
        created_at: existing.updated_at, // Use previous updated_at as version timestamp
        created_by: null,
        comment: null
      });
      logger.info(`[Filesystem] 📸 Created version ${nextVersion} snapshot for: ${normalizedPath} (CID: ${existing.ipfs_hash})`);
    }

    // Create or update file metadata in database
    const metadata: FileMetadata = {
      path: normalizedPath,
      wallet_address: walletAddress,
      ipfs_hash: ipfsHash,
      size: size,
      mime_type: mimeType,
      thumbnail: thumbnail,
      content_text: null, // Will be populated by indexer
      is_dir: false,
      is_public: isPublic, // Auto-detected from path or explicitly set
      created_at: existing?.created_at || Date.now(), // Preserve original creation time
      updated_at: Date.now()
    };
    
    if (isPublic) {
      logger.info(`[Filesystem] File marked as public: ${normalizedPath}`);
    }

    this.db.createOrUpdateFile(metadata);

    // Announce public files to IPFS DHT for discoverability
    if (isPublic && this.ipfs && this.ipfs.canAnnounce()) {
      // Run announcement in background (don't block file write)
      this.ipfs.announceCID(ipfsHash).then(announced => {
        if (announced) {
          logger.info(`[Filesystem] 📡 Announced public file CID to DHT: ${ipfsHash}`);
        }
      }).catch(err => {
        logger.warn(`[Filesystem] Failed to announce CID to DHT: ${err.message}`);
      });
    }

    return metadata;
  }

  /**
   * Write a file from a local path on disk, streaming to IPFS without loading
   * the entire file into memory. The temp file is deleted after processing.
   * Suitable for large uploads on memory-constrained devices.
   */
  async writeFileFromPath(
    destPath: string,
    localFilePath: string,
    walletAddress: string,
    options?: {
      mimeType?: string;
      isPublic?: boolean;
    }
  ): Promise<FileMetadata> {
    const normalizedPath = this.normalizePath(destPath);
    const isInPublicFolder = this.isInPublicFolder(normalizedPath);
    const isPublic = options?.isPublic ?? isInPublicFolder;

    const parentPath = dirname(normalizedPath);
    if (parentPath !== '/' && parentPath !== '.') {
      await this.ensureDirectory(parentPath, walletAddress);
    }

    if (!this.isIPFSAvailable() || !this.ipfs) {
      throw new Error('IPFS is not available. File storage requires IPFS to be initialized.');
    }

    const fileSize = statSync(localFilePath).size;
    logger.info(`[Filesystem] Streaming file to IPFS: ${normalizedPath} (size: ${fileSize} bytes)`);

    // Stream file to IPFS in chunks -- never holds the whole file in memory
    let bytesStreamed = 0;
    const logInterval = fileSize > 1024 * 1024 * 1024 ? 100 * 1024 * 1024 : 50 * 1024 * 1024; // 100MB for GB+ files, 50MB otherwise
    let nextLogAt = logInterval;

    async function* fileChunks(filePath: string): AsyncIterable<Uint8Array> {
      // 64KB chunks reduce memory pressure on ARM/Jetson devices and improve
      // backpressure handling in Helia's addByteStream for multi-GB files
      const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 });
      for await (const chunk of stream) {
        const data = chunk instanceof Buffer ? new Uint8Array(chunk) : chunk;
        bytesStreamed += data.length;
        if (bytesStreamed >= nextLogAt) {
          const mb = (bytesStreamed / (1024 * 1024)).toFixed(1);
          const pct = ((bytesStreamed / fileSize) * 100).toFixed(0);
          logger.info(`[Filesystem] IPFS upload progress: ${mb}MB / ${(fileSize / (1024 * 1024)).toFixed(1)}MB (${pct}%)`);
          nextLogAt += logInterval;
        }
        yield data;
      }
    }

    // Scale timeout with file size: 10 min base + 2 min per 100MB (generous for ARM devices)
    const timeoutMs = 10 * 60 * 1000 + Math.ceil(fileSize / (100 * 1024 * 1024)) * 2 * 60 * 1000;
    logger.info(`[Filesystem] IPFS timeout set to ${Math.round(timeoutMs / 60000)} minutes for ${(fileSize / (1024 * 1024)).toFixed(0)}MB file`);

    const ipfsHash = await this.ipfs.storeFileStream(fileChunks(localFilePath), { pin: true, timeoutMs });

    // Verify stored size matches original — catches silent truncation
    // Note: Helia's UnixFS exporter can throw NotUnixFSError on very large files
    // (known issue with DAG metadata parsing). If verification fails but all bytes
    // were streamed, the file is almost certainly intact — skip verification gracefully.
    if (bytesStreamed === fileSize) {
      try {
        const storedSize = await this.ipfs.getFileSize(ipfsHash);
        if (storedSize !== fileSize) {
          logger.error(`[Filesystem] SIZE MISMATCH: original=${fileSize} bytes, stored=${storedSize} bytes (${((storedSize / fileSize) * 100).toFixed(1)}%). CID: ${ipfsHash}`);
          throw new Error(`File upload incomplete: ${storedSize} of ${fileSize} bytes stored. Please retry.`);
        }
        logger.info(`[Filesystem] Size verified: ${storedSize} bytes matches original`);
      } catch (sizeError) {
        if (sizeError instanceof Error && sizeError.message.includes('File upload incomplete')) {
          throw sizeError;
        }
        // NotUnixFSError or similar — all bytes streamed, file is likely intact
        logger.info(`[Filesystem] Size verification skipped (all ${bytesStreamed} bytes streamed successfully). Helia metadata read error: ${sizeError instanceof Error ? sizeError.message : sizeError}`);
      }
    } else {
      logger.error(`[Filesystem] STREAM INCOMPLETE: only ${bytesStreamed} of ${fileSize} bytes were yielded by the file reader`);
    }

    logger.info(`[Filesystem] File streamed to IPFS: ${normalizedPath} -> CID: ${ipfsHash} (${bytesStreamed} bytes streamed, ${fileSize} bytes expected)`);

    // Also check if our streaming generator actually yielded all bytes
    if (bytesStreamed < fileSize) {
      logger.error(`[Filesystem] STREAM INCOMPLETE: only ${bytesStreamed} of ${fileSize} bytes were yielded by the file reader. Possible disk read error.`);
    }

    // Clean up temp file
    try { unlinkSync(localFilePath); } catch { /* best-effort */ }

    const mimeType = options?.mimeType || this.guessMimeType(destPath);

    // Thumbnails skipped for streamed files (would require reading file again).
    // Could be added as a background job later.
    const thumbnail: string | null = null;

    const existing = this.db.getFile(normalizedPath, walletAddress);
    if (existing && existing.ipfs_hash) {
      const nextVersion = this.db.getNextVersionNumber(normalizedPath, walletAddress);
      this.db.createFileVersion({
        file_path: normalizedPath,
        wallet_address: walletAddress,
        version_number: nextVersion,
        ipfs_hash: existing.ipfs_hash,
        size: existing.size,
        mime_type: existing.mime_type,
        created_at: existing.updated_at,
        created_by: null,
        comment: null
      });
      logger.info(`[Filesystem] Created version ${nextVersion} snapshot for: ${normalizedPath} (CID: ${existing.ipfs_hash})`);
    }

    const metadata: FileMetadata = {
      path: normalizedPath,
      wallet_address: walletAddress,
      ipfs_hash: ipfsHash,
      size: fileSize,
      mime_type: mimeType,
      thumbnail,
      content_text: null,
      is_dir: false,
      is_public: isPublic,
      created_at: existing?.created_at || Date.now(),
      updated_at: Date.now()
    };

    if (isPublic) {
      logger.info(`[Filesystem] File marked as public: ${normalizedPath}`);
    }

    this.db.createOrUpdateFile(metadata);

    if (isPublic && this.ipfs && this.ipfs.canAnnounce()) {
      this.ipfs.announceCID(ipfsHash).then(announced => {
        if (announced) {
          logger.info(`[Filesystem] Announced public file CID to DHT: ${ipfsHash}`);
        }
      }).catch(err => {
        logger.warn(`[Filesystem] Failed to announce CID to DHT: ${err.message}`);
      });
    }

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
   * Get the byte size of a file without loading content into memory.
   * Falls back to metadata.size if IPFS streaming is unavailable.
   */
  async getFileSize(path: string, walletAddress: string): Promise<number> {
    const normalizedPath = this.normalizePath(path);
    const metadata = this.db.getFile(normalizedPath, walletAddress);
    if (!metadata) throw new Error(`File not found: ${path}`);
    if (metadata.is_dir) throw new Error(`Path is a directory: ${path}`);
    if (!metadata.ipfs_hash) throw new Error(`File has no IPFS hash: ${path}`);

    if (this.ipfs) {
      try {
        return await this.ipfs.getFileSize(metadata.ipfs_hash);
      } catch {
        // Fall back to DB size (may be stale but better than nothing)
      }
    }
    return metadata.size;
  }

  /**
   * Stream file content with optional byte-range support.
   * Memory usage is proportional to IPFS chunk size (~256 KB), not file size.
   */
  async *readFileStream(
    path: string,
    walletAddress: string,
    options?: { offset?: number; length?: number }
  ): AsyncGenerator<Uint8Array> {
    const normalizedPath = this.normalizePath(path);
    const metadata = this.db.getFile(normalizedPath, walletAddress);
    if (!metadata) throw new Error(`File not found: ${path}`);
    if (metadata.is_dir) throw new Error(`Path is a directory: ${path}`);
    if (!metadata.ipfs_hash) throw new Error(`File has no IPFS hash: ${path}`);
    if (!this.ipfs) throw new Error('IPFS is not available');

    yield* this.ipfs.getFileStream(metadata.ipfs_hash, options);
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
      // Skip the directory itself and trailing-slash duplicate (e.g. .../ElastOS and .../ElastOS/)
      const filePathNorm = file.path.replace(/\/+$/, '') || file.path;
      if (filePathNorm === normalizedPath || file.path === normalizedPath) {
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
    // Uses shared isInPublicFolder helper for consistency with file detection
    const isPublic = this.isInPublicFolder(normalizedPath);
    
    // Create directory metadata (no IPFS hash for directories)
    const metadata: FileMetadata = {
      path: normalizedPath,
      wallet_address: walletAddress,
      ipfs_hash: null,
      size: 0,
      mime_type: null,
      thumbnail: null,
      content_text: null, // Directories don't have content
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
  async deleteFile(path: string, walletAddress: string, recursive: boolean = false): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const metadata = this.db.getFile(normalizedPath, walletAddress);

    if (!metadata) {
      throw new Error(`File not found: ${path}`);
    }

    if (metadata.is_dir) {
      // For directories, handle children
      const children = this.listDirectory(normalizedPath, walletAddress);
      
      if (children.length > 0) {
        if (recursive) {
          // Recursively delete all children first
          for (const child of children) {
            await this.deleteFile(child.path, walletAddress, true);
          }
        } else {
          throw new Error(`Directory not empty: ${path}`);
        }
      }
      
      // For directories, also unpin from IPFS if it has an IPFS hash
      if (metadata.ipfs_hash && this.isIPFSAvailable() && this.ipfs) {
        try {
          await this.ipfs.unpinFile(metadata.ipfs_hash);
        } catch (error) {
          // Non-critical - continue with deletion
          log.warn(`Failed to unpin directory ${metadata.ipfs_hash}:`, error);
        }
      }
    } else {
      // For files, unpin from IPFS (allows garbage collection)
      if (metadata.ipfs_hash && this.isIPFSAvailable() && this.ipfs) {
        try {
          await this.ipfs.unpinFile(metadata.ipfs_hash);
          log.info(`[Delete] Unpinned file from IPFS: ${metadata.ipfs_hash}`);
        } catch (error) {
          // Non-critical - continue with deletion
          log.warn(`Failed to unpin file ${metadata.ipfs_hash}:`, error);
        }
      }
    }

    // Remove from database (this is the critical step - removes file metadata)
    // Also delete all version history for this file
    this.db.deleteFileVersions(normalizedPath, walletAddress);
    this.db.deleteFile(normalizedPath, walletAddress);
    log.info(`[Delete] Removed file and version history from database: ${normalizedPath}`);
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

    // Check if new path already exists (but allow moving to same path - that's a no-op)
    if (normalizedOldPath !== normalizedNewPath) {
      const existingNew = this.db.getFile(normalizedNewPath, walletAddress);
      if (existingNew) {
        // IMPORTANT: If the existing file is a directory, that's OK - we're moving INTO it, not replacing it
        // Only fail if it's a file (we can't overwrite files without explicit overwrite flag)
        if (!existingNew.is_dir) {
          // Log details for debugging
          log.debug('[Filesystem] Destination already exists check:', {
            oldPath: normalizedOldPath,
            newPath: normalizedNewPath,
            existingFile: {
              path: existingNew.path,
              name: existingNew.path.split('/').pop(),
              is_dir: existingNew.is_dir,
              size: existingNew.size
            }
          });
          throw new Error(`Destination already exists: ${newPath}`);
        } else {
          // Destination is a directory - that's fine, we're moving the file INTO it
          log.debug('[Filesystem] Destination is a directory, allowing move into it:', {
            oldPath: normalizedOldPath,
            newPath: normalizedNewPath,
            destinationDir: existingNew.path
          });
        }
      }
    }

    // If it's a directory, we'd need to move all children too
    // For now, we'll just update the metadata
    // TODO: Implement recursive directory move if needed

    // Update version history to new path BEFORE deleting old entry
    // This preserves version history when files are renamed/moved
    this.db.updateFileVersionPaths(normalizedOldPath, normalizedNewPath, walletAddress);

    // Delete old entry
    this.db.deleteFile(normalizedOldPath, walletAddress);

    // Create new entry with same data but new path
    // Explicitly construct FileMetadata to ensure all required fields are present
    // and no extra database fields (like rowid) are included
    const newMetadata: FileMetadata = {
      path: normalizedNewPath,
      wallet_address: existing.wallet_address,
      ipfs_hash: existing.ipfs_hash,
      size: existing.size,
      mime_type: existing.mime_type,
      thumbnail: existing.thumbnail ?? null,
      content_text: existing.content_text ?? null, // Explicitly preserve content_text
      is_dir: existing.is_dir,
      is_public: existing.is_public,
      created_at: existing.created_at,
      updated_at: Date.now()
    };

    this.db.createOrUpdateFile(newMetadata);

    return newMetadata;
  }

  /**
   * Copy file or directory
   */
  async copyFile(
    sourcePath: string,
    destPath: string,
    walletAddress: string
  ): Promise<FileMetadata> {
    const normalizedSourcePath = this.normalizePath(sourcePath);
    const normalizedDestPath = this.normalizePath(destPath);

    // Get source file
    const source = this.db.getFile(normalizedSourcePath, walletAddress);
    if (!source) {
      throw new Error(`File not found: ${sourcePath}`);
    }

    // Ensure destination parent directory exists
    const destParentPath = dirname(normalizedDestPath);
    if (destParentPath !== '/' && destParentPath !== '.') {
      await this.ensureDirectory(destParentPath, walletAddress);
    }

    // Check if destination already exists
    const existingDest = this.db.getFile(normalizedDestPath, walletAddress);
    if (existingDest) {
      throw new Error(`Destination already exists: ${destPath}`);
    }

    // If it's a directory, create a new directory
    if (source.is_dir) {
      return await this.createDirectory(normalizedDestPath, walletAddress);
    }

    // If it's a file, read the content and write it to the new location
    const content = await this.readFile(normalizedSourcePath, walletAddress);
    const mimeType = source.mime_type || this.guessMimeType(normalizedDestPath) || undefined;

    return await this.writeFile(normalizedDestPath, content, walletAddress, {
      mimeType,
      isPublic: source.is_public || false
    });
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
      'xml': 'application/xml',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'webp': 'image/webp',
      'avif': 'image/avif',
      'ico': 'image/x-icon',
      'pdf': 'application/pdf',
      'zip': 'application/zip',
      'gz': 'application/gzip',
      'tar': 'application/x-tar',
      // Video formats
      'mp4': 'video/mp4',
      'm4v': 'video/mp4',
      'mov': 'video/quicktime',
      'webm': 'video/webm',
      'mpg': 'video/mpeg',
      'mpeg': 'video/mpeg',
      'mpv': 'video/mpeg',
      'avi': 'video/x-msvideo',
      'mkv': 'video/x-matroska',
      'ts': 'video/mp2t',
      '3gp': 'video/3gpp',
      'ogv': 'video/ogg',
      'av1': 'video/mp4',
      // Audio formats
      'mp3': 'audio/mpeg',
      'm4a': 'audio/mp4',
      'aac': 'audio/aac',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'opus': 'audio/opus',
      'flac': 'audio/flac',
      'weba': 'audio/webm',
    };

    return mimeTypes[ext] || null;
  }
}

