import { normalize, dirname } from 'path';
import { logger } from '../utils/logger.js';
import { generateThumbnail, supportsThumbnails } from './thumbnail.js';
export class FilesystemManager {
    ipfs;
    db;
    constructor(ipfs, db) {
        this.ipfs = ipfs;
        this.db = db;
        if (ipfs && !ipfs.isReady()) {
            throw new Error('IPFSStorage provided but not initialized. Call initialize() first.');
        }
    }
    isIPFSAvailable() {
        return this.ipfs !== null && this.ipfs.isReady();
    }
    normalizePath(path) {
        const normalized = normalize(path);
        return normalized.startsWith('/') ? normalized : '/' + normalized;
    }
    async writeFile(path, content, walletAddress, options) {
        const normalizedPath = this.normalizePath(path);
        const parentPath = dirname(normalizedPath);
        if (parentPath !== '/' && parentPath !== '.') {
            await this.ensureDirectory(parentPath, walletAddress);
        }
        if (!this.isIPFSAvailable() || !this.ipfs) {
            throw new Error('IPFS is not available. File storage requires IPFS to be initialized.');
        }
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
        const storedSize = Buffer.isBuffer(content) ? content.length : (content instanceof Uint8Array ? content.length : Buffer.byteLength(content, 'utf8'));
        logger.info(`[Filesystem] File stored in IPFS: ${normalizedPath} -> CID: ${ipfsHash} (stored size: ${storedSize} bytes)`);
        const size = Buffer.isBuffer(content)
            ? content.length
            : Buffer.byteLength(content, 'utf8');
        const mimeType = options?.mimeType || this.guessMimeType(path);
        let thumbnail = null;
        if (supportsThumbnails(mimeType)) {
            try {
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
            }
            catch (error) {
                logger.warn(`[Filesystem] ⚠️  Thumbnail generation failed for ${normalizedPath}: ${error.message}`);
            }
        }
        const metadata = {
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
        const existing = this.db.getFile(normalizedPath, walletAddress);
        if (existing) {
            metadata.created_at = existing.created_at;
        }
        this.db.createOrUpdateFile(metadata);
        return metadata;
    }
    async readFile(path, walletAddress) {
        const normalizedPath = this.normalizePath(path);
        logger.info(`[Filesystem] readFile called`, {
            path,
            normalizedPath,
            walletAddress,
            isIPFSAvailable: this.isIPFSAvailable()
        });
        const metadata = this.db.getFile(normalizedPath, walletAddress);
        if (!metadata) {
            let allFiles = [];
            try {
                const dbInstance = this.db.getDB();
                if (dbInstance) {
                    allFiles = dbInstance.prepare(`
            SELECT path FROM files 
            WHERE wallet_address = ?
            LIMIT 10
          `).all(walletAddress) || [];
                }
            }
            catch (e) {
                logger.debug(`[Filesystem] Could not query all files for debugging: ${e instanceof Error ? e.message : String(e)}`);
            }
            logger.error(`[Filesystem] File not found in database`, {
                path,
                normalizedPath,
                walletAddress,
                totalFilesForWallet: allFiles.length,
                samplePaths: allFiles.slice(0, 5).map((f) => f.path)
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
        if (!this.isIPFSAvailable() || !this.ipfs) {
            throw new Error('IPFS is not available. Cannot retrieve file content.');
        }
        logger.info(`[Filesystem] Retrieving file from IPFS: ${normalizedPath} (CID: ${metadata.ipfs_hash})`);
        try {
            const content = await this.ipfs.getFile(metadata.ipfs_hash);
            logger.info(`[Filesystem] File retrieved from IPFS: ${normalizedPath} (size: ${content.length} bytes)`);
            return content;
        }
        catch (error) {
            logger.error(`[Filesystem] Failed to retrieve file from IPFS`, {
                path: normalizedPath,
                cid: metadata.ipfs_hash,
                error: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }
    getFileMetadata(path, walletAddress) {
        const normalizedPath = this.normalizePath(path);
        return this.db.getFile(normalizedPath, walletAddress);
    }
    listDirectory(path, walletAddress) {
        const normalizedPath = this.normalizePath(path);
        const allFiles = this.db.listFiles(normalizedPath, walletAddress);
        const directChildren = [];
        const pathPrefix = normalizedPath === '/' ? '/' : normalizedPath + '/';
        for (const file of allFiles) {
            if (file.path === normalizedPath) {
                continue;
            }
            const relativePath = file.path.startsWith(pathPrefix)
                ? file.path.substring(pathPrefix.length)
                : file.path;
            if (!relativePath.includes('/')) {
                directChildren.push(file);
            }
        }
        return directChildren;
    }
    async createDirectory(path, walletAddress) {
        const normalizedPath = this.normalizePath(path);
        const parentPath = dirname(normalizedPath);
        if (parentPath !== '/' && parentPath !== '.' && parentPath !== normalizedPath) {
            await this.ensureDirectory(parentPath, walletAddress);
        }
        const isPublic = normalizedPath === '/Public' ||
            normalizedPath.startsWith('/Public/') ||
            (normalizedPath.includes('/Public/') && !normalizedPath.match(/\/Public[^/]/));
        const metadata = {
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
        const existing = this.db.getFile(normalizedPath, walletAddress);
        if (existing) {
            if (!existing.is_dir) {
                throw new Error(`Path exists as a file: ${path}`);
            }
            logger.info('[Filesystem] Directory already exists', { path: normalizedPath });
            return existing;
        }
        logger.info('[Filesystem] Creating directory in database', {
            path: normalizedPath,
            wallet: walletAddress,
            is_public: isPublic
        });
        this.db.createOrUpdateFile(metadata);
        const created = this.db.getFile(normalizedPath, walletAddress);
        if (!created) {
            throw new Error(`Failed to create directory: ${normalizedPath}`);
        }
        logger.info('[Filesystem] Directory created and verified', { path: normalizedPath });
        return metadata;
    }
    async ensureDirectory(path, walletAddress) {
        const normalizedPath = this.normalizePath(path);
        if (normalizedPath === '/' || normalizedPath === '.') {
            return;
        }
        const existing = this.db.getFile(normalizedPath, walletAddress);
        if (existing && existing.is_dir) {
            return;
        }
        if (existing && !existing.is_dir) {
            throw new Error(`Path exists as a file: ${path}`);
        }
        const parentPath = dirname(normalizedPath);
        if (parentPath !== '/' && parentPath !== '.' && parentPath !== normalizedPath) {
            await this.ensureDirectory(parentPath, walletAddress);
        }
        await this.createDirectory(normalizedPath, walletAddress);
    }
    async deleteFile(path, walletAddress) {
        const normalizedPath = this.normalizePath(path);
        const metadata = this.db.getFile(normalizedPath, walletAddress);
        if (!metadata) {
            throw new Error(`File not found: ${path}`);
        }
        if (metadata.is_dir) {
            const children = this.listDirectory(normalizedPath, walletAddress);
            if (children.length > 0) {
                throw new Error(`Directory not empty: ${path}`);
            }
        }
        else {
            if (metadata.ipfs_hash && this.isIPFSAvailable() && this.ipfs) {
                try {
                    await this.ipfs.unpinFile(metadata.ipfs_hash);
                }
                catch (error) {
                    console.warn(`Failed to unpin file ${metadata.ipfs_hash}:`, error);
                }
            }
        }
        this.db.deleteFile(normalizedPath, walletAddress);
    }
    async moveFile(oldPath, newPath, walletAddress) {
        const normalizedOldPath = this.normalizePath(oldPath);
        const normalizedNewPath = this.normalizePath(newPath);
        const existing = this.db.getFile(normalizedOldPath, walletAddress);
        if (!existing) {
            throw new Error(`File not found: ${oldPath}`);
        }
        const newParentPath = dirname(normalizedNewPath);
        if (newParentPath !== '/' && newParentPath !== '.') {
            await this.ensureDirectory(newParentPath, walletAddress);
        }
        const existingNew = this.db.getFile(normalizedNewPath, walletAddress);
        if (existingNew) {
            throw new Error(`Destination already exists: ${newPath}`);
        }
        this.db.deleteFile(normalizedOldPath, walletAddress);
        const newMetadata = {
            ...existing,
            path: normalizedNewPath,
            updated_at: Date.now()
        };
        this.db.createOrUpdateFile(newMetadata);
        return newMetadata;
    }
    guessMimeType(path) {
        const ext = path.split('.').pop()?.toLowerCase();
        if (!ext) {
            return null;
        }
        const mimeTypes = {
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
            'mp4': 'video/mp4',
            'mov': 'video/quicktime',
            'webm': 'video/webm',
            'mpg': 'video/mpeg',
            'mpeg': 'video/mpeg',
            'mpv': 'video/mpeg',
            'avi': 'video/x-msvideo',
            'mkv': 'video/x-matroska',
            'mp3': 'audio/mpeg',
            'm4a': 'audio/mp4',
            'wav': 'audio/wav',
            'ogg': 'audio/ogg',
            'flac': 'audio/flac'
        };
        return mimeTypes[ext] || null;
    }
}
//# sourceMappingURL=filesystem.js.map