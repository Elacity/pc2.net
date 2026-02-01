/**
 * Public IPFS Gateway API
 * 
 * Provides unauthenticated access to:
 * - Files in users' /Public folders
 * - Any pinned CID via /ipfs/:cid
 * - Public file listings
 * 
 * This enables PC2 nodes to participate in the public IPFS network
 * and serve as gateways for dDRM marketplace content.
 */

import { Router, Request, Response } from 'express';
import { DatabaseManager, FileMetadata } from '../storage/database.js';
import { FilesystemManager } from '../storage/filesystem.js';
import { IPFSStorage } from '../storage/ipfs.js';
import { logger } from '../utils/logger.js';
import rateLimit from 'express-rate-limit';

// Rate limiting for public endpoints (prevent abuse)
const publicRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false }, // Disable trust proxy validation for local dev
});

/**
 * Create the public gateway router
 */
export function createPublicRouter(
  db: DatabaseManager,
  filesystem: FilesystemManager,
  ipfs: IPFSStorage | null
): Router {
  const router = Router();

  // NOTE: Rate limiting is applied per-route below, not globally.
  // This prevents the rate limiter from affecting non-public routes
  // when this router is mounted at root level.

  /**
   * GET /ipfs/:cid
   * GET /ipfs/:cid/:filename
   * 
   * Serve content directly by CID. Works for any pinned content.
   * The optional filename parameter allows setting Content-Disposition for downloads.
   */
  router.get('/ipfs/:cid/:filename?', publicRateLimit, async (req: Request, res: Response) => {
    const { cid, filename } = req.params;

    if (!ipfs || !ipfs.isReady()) {
      return res.status(503).json({ error: 'IPFS not available' });
    }

    try {
      // Try to get file metadata from database (for mime type)
      const metadata = db.getFileByCID(cid);
      
      // Retrieve content from IPFS
      const content = await ipfs.getFile(cid);

      // Set response headers
      const mimeType = metadata?.mime_type || 'application/octet-stream';
      const contentFilename = filename || metadata?.path?.split('/').pop() || cid;

      res.set({
        'Content-Type': mimeType,
        'Content-Length': content.length.toString(),
        'X-IPFS-CID': cid,
        'X-IPFS-Path': `/ipfs/${cid}`,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'X-IPFS-CID, X-IPFS-Path',
      });

      // Set Content-Disposition if filename provided
      if (filename) {
        res.set('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
      }

      res.send(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if it's a "not found" type error
      if (message.includes('not found') || message.includes('Entry not found')) {
        return res.status(404).json({ 
          error: 'Content not found',
          cid,
          hint: 'This CID is not pinned on this node'
        });
      }

      logger.error(`[Public Gateway] Error serving CID ${cid}:`, { error: message });
      res.status(500).json({ error: 'Failed to retrieve content' });
    }
  });

  /**
   * GET /public/:wallet/*
   * 
   * Serve files from a user's /Public folder by path.
   * Only files marked as is_public=true are served.
   */
  router.get('/public/:wallet/*', publicRateLimit, async (req: Request, res: Response) => {
    const { wallet } = req.params;
    const subPath = req.params[0] || '';
    
    // Construct the full path within the Public folder
    const fullPath = `/${wallet}/Public${subPath ? '/' + subPath : ''}`;

    if (!ipfs || !ipfs.isReady()) {
      return res.status(503).json({ error: 'IPFS not available' });
    }

    try {
      // Get file metadata
      const metadata = db.getFile(fullPath, wallet);

      if (!metadata) {
        return res.status(404).json({ 
          error: 'File not found',
          path: fullPath
        });
      }

      // Verify it's actually in the Public folder and marked public
      if (!metadata.is_public) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'This file is not publicly accessible'
        });
      }

      // If it's a directory, return listing
      if (metadata.is_dir) {
        const files = db.getPublicFiles(wallet, fullPath);
        return res.json({
          path: fullPath,
          isDirectory: true,
          files: files.map(f => ({
            name: f.path.split('/').pop(),
            path: f.path.replace(`/${wallet}/Public`, ''),
            cid: f.ipfs_hash,
            size: f.size,
            mimeType: f.mime_type,
            isDirectory: f.is_dir,
            createdAt: f.created_at
          }))
        });
      }

      // Get file content from IPFS
      if (!metadata.ipfs_hash) {
        return res.status(404).json({ error: 'File has no content' });
      }

      const content = await ipfs.getFile(metadata.ipfs_hash);
      const filename = metadata.path.split('/').pop() || 'file';

      res.set({
        'Content-Type': metadata.mime_type || 'application/octet-stream',
        'Content-Length': content.length.toString(),
        'X-IPFS-CID': metadata.ipfs_hash,
        'X-IPFS-Path': `/ipfs/${metadata.ipfs_hash}/${filename}`,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'X-IPFS-CID, X-IPFS-Path',
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      });

      res.send(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[Public Gateway] Error serving ${fullPath}:`, { error: message });
      res.status(500).json({ error: 'Failed to retrieve file' });
    }
  });

  /**
   * GET /api/public/list/:wallet
   * GET /api/public/list/:wallet/*
   * 
   * List all public files for a wallet with their CIDs.
   * Useful for discovery and indexing.
   */
  router.get('/api/public/list/:wallet', publicRateLimit, async (req: Request, res: Response) => {
    const { wallet } = req.params;
    const basePath = `/${wallet}/Public`;

    try {
      const files = db.getPublicFiles(wallet);

      res.json({
        wallet,
        basePath,
        totalFiles: files.length,
        files: files.map(f => ({
          name: f.path.split('/').pop(),
          path: f.path.replace(`/${wallet}/Public`, '') || '/',
          cid: f.ipfs_hash,
          size: f.size,
          mimeType: f.mime_type,
          isDirectory: f.is_dir,
          createdAt: f.created_at,
          // Include gateway URLs for convenience
          gatewayUrl: f.ipfs_hash ? `/ipfs/${f.ipfs_hash}` : null,
          publicUrl: `/public/${wallet}${f.path.replace(`/${wallet}/Public`, '')}`
        }))
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[Public Gateway] Error listing files for ${wallet}:`, { error: message });
      res.status(500).json({ error: 'Failed to list files' });
    }
  });

  /**
   * GET /api/public/info/:cid
   * 
   * Get metadata for a CID (if we have it).
   * Returns file info without the content.
   */
  router.get('/api/public/info/:cid', publicRateLimit, async (req: Request, res: Response) => {
    const { cid } = req.params;

    try {
      const metadata = db.getFileByCID(cid);

      if (!metadata) {
        return res.status(404).json({ 
          error: 'CID not found in database',
          cid,
          hint: 'This CID may be pinned but not tracked, or not on this node'
        });
      }

      // Only expose info for public files
      if (!metadata.is_public) {
        return res.status(403).json({
          error: 'This content is not publicly accessible',
          cid
        });
      }

      res.json({
        cid,
        filename: metadata.path.split('/').pop(),
        size: metadata.size,
        mimeType: metadata.mime_type,
        isDirectory: metadata.is_dir,
        createdAt: metadata.created_at,
        gatewayUrl: `/ipfs/${cid}`,
        // Don't expose full path for privacy
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[Public Gateway] Error getting info for ${cid}:`, { error: message });
      res.status(500).json({ error: 'Failed to get CID info' });
    }
  });

  /**
   * GET /api/public/stats
   * 
   * Get public node statistics.
   */
  router.get('/api/public/stats', publicRateLimit, async (req: Request, res: Response) => {
    try {
      const stats = db.getPublicStats();
      
      res.json({
        nodeId: ipfs?.getNodeId() || null,
        publicFiles: stats.publicFileCount,
        totalPublicSize: stats.totalPublicSize,
        isGatewayEnabled: true,
        ipfsReady: ipfs?.isReady() || false
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[Public Gateway] Error getting stats:', { error: message });
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });

  /**
   * GET /api/public/network
   * 
   * Get network statistics (peers, mode, etc).
   */
  router.get('/api/public/network', publicRateLimit, async (req: Request, res: Response) => {
    try {
      if (!ipfs) {
        return res.status(503).json({ error: 'IPFS not available' });
      }

      const networkStats = await ipfs.getNetworkStats();
      const connectedPeers = await ipfs.getConnectedPeers();

      res.json({
        ...networkStats,
        peers: connectedPeers.slice(0, 20), // Limit to first 20 peers
        totalPeers: connectedPeers.length
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[Public Gateway] Error getting network stats:', { error: message });
      res.status(500).json({ error: 'Failed to get network stats' });
    }
  });

  /**
   * POST /api/pin/:cid
   * 
   * Pin a remote CID from the IPFS network and save to user's Pinned folder.
   * Used for marketplace purchases.
   * NOTE: This endpoint requires authentication.
   * 
   * Query params:
   *   - timeout: Timeout in seconds (default: 60)
   *   - maxFiles: Max files for directories (default: 1000)
   *   - filename: Custom filename (default: CID)
   */
  router.post('/api/pin/:cid', publicRateLimit, async (req: Request, res: Response) => {
    const { cid } = req.params;
    const timeoutSec = parseInt(req.query.timeout as string) || 60;
    const maxFiles = parseInt(req.query.maxFiles as string) || 1000;
    const customFilename = req.query.filename as string;
    const targetFolder = req.query.folder as string || 'Public'; // Default to Public, can be 'Pictures', 'Documents', etc.

    // Check if user is authenticated (via header or session)
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Pinning requires a valid auth token'
      });
    }

    // Get wallet address from auth token
    let walletAddress: string | null = null;
    const token = authHeader.replace('Bearer ', '');
    if (db) {
      const session = db.getSession(token);
      walletAddress = session?.wallet_address || null;
    }

    if (!ipfs || !ipfs.isReady()) {
      return res.status(503).json({ error: 'IPFS not available' });
    }

    try {
      const result = await ipfs.pinRemoteCID(cid, {
        timeoutMs: timeoutSec * 1000,
        maxFiles
      });
      
      // Save to user's folder if authenticated
      // Content is pinned in IPFS cache regardless of where file is saved
      let savedPath: string | null = null;
      let detectedMime: string | null = null;
      if (walletAddress && filesystem && result.success) {
        try {
          // Validate and sanitize folder name (only allow known folders)
          const allowedFolders = ['Public', 'Pictures', 'Documents', 'Desktop', 'Videos'];
          const folder = allowedFolders.includes(targetFolder) ? targetFolder : 'Public';
          const saveFolder = `/${walletAddress}/${folder}`;
          
          // Get content - use gateway content if available, otherwise fetch from IPFS
          let content: Buffer | null = null;
          if (result.content) {
            // Content came from gateway fallback
            content = Buffer.from(result.content);
            logger.info(`[Public Gateway] Using gateway-provided content (${content.length} bytes)`);
          } else {
            // Try to get from local IPFS using actual CID if different
            const cidToFetch = result.actualCid || cid;
            content = await ipfs.getFile(cidToFetch);
          }
          
          if (content) {
            // Detect file type from magic bytes
            const detectExtension = (buffer: Buffer): { ext: string; mime: string } => {
              if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
                return { ext: '.jpg', mime: 'image/jpeg' };
              }
              if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
                return { ext: '.png', mime: 'image/png' };
              }
              if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
                return { ext: '.gif', mime: 'image/gif' };
              }
              if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
                return { ext: '.webp', mime: 'image/webp' };
              }
              if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
                return { ext: '.pdf', mime: 'application/pdf' };
              }
              if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
                return { ext: '.zip', mime: 'application/zip' };
              }
              if (buffer[0] === 0x1F && buffer[1] === 0x8B) {
                return { ext: '.gz', mime: 'application/gzip' };
              }
              // Check for text/HTML/JSON
              const firstChars = buffer.slice(0, 100).toString('utf8').trim();
              if (firstChars.startsWith('<!DOCTYPE') || firstChars.startsWith('<html')) {
                return { ext: '.html', mime: 'text/html' };
              }
              if (firstChars.startsWith('{') || firstChars.startsWith('[')) {
                return { ext: '.json', mime: 'application/json' };
              }
              return { ext: '', mime: 'application/octet-stream' };
            };
            
            const { ext, mime } = detectExtension(content);
            detectedMime = mime;
            
            // Determine filename - use custom name or generate from CID
            let filename = customFilename || `ipfs-${cid.substring(0, 8)}`;
            // Always add extension if detected and filename doesn't have one
            if (ext && !filename.includes('.')) {
              filename += ext;
            }
            savedPath = `${saveFolder}/${filename}`;
            logger.info(`[Public Gateway] Saving to folder: ${folder}, path: ${savedPath}`);
            
            // Only mark as public if saving to Public folder
            const isPublic = folder === 'Public';
            await filesystem.writeFile(savedPath, content, walletAddress, { isPublic });
            logger.info(`[Public Gateway] Saved pinned content to ${savedPath} (${mime}, public: ${isPublic})`);
          }
        } catch (saveError: any) {
          logger.warn(`[Public Gateway] Failed to save to Public folder: ${saveError.message}`);
          // Don't fail the whole request, just note it wasn't saved
          savedPath = null;
        }
      }
      
      res.json({
        success: true,
        cid: result.cid,
        type: result.type,
        size: result.size,
        files: result.files,
        timeMs: result.timeMs,
        savedPath,
        mimeType: detectedMime,
        message: savedPath 
          ? `Downloaded to your ${['Public', 'Pictures', 'Documents', 'Desktop', 'Videos'].includes(targetFolder) ? targetFolder : 'Public'} folder`
          : (result.type === 'directory' 
              ? `Directory pinned (${result.files} files) - stored in IPFS cache`
              : 'Content pinned - stored in IPFS cache')
      });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const errorType = error.type || 'UNKNOWN';
      
      // Map error types to HTTP status codes
      const statusMap: Record<string, number> = {
        [IPFSStorage.PinErrorType.PRIVATE_MODE]: 400,
        [IPFSStorage.PinErrorType.INVALID_CID]: 400,
        [IPFSStorage.PinErrorType.TIMEOUT]: 504,
        [IPFSStorage.PinErrorType.NOT_FOUND]: 404,
        [IPFSStorage.PinErrorType.NETWORK_ERROR]: 502,
        [IPFSStorage.PinErrorType.DIRECTORY_TOO_LARGE]: 413,
      };

      const status = statusMap[errorType] || 500;

      // User-friendly error messages
      const errorMessages: Record<string, string> = {
        [IPFSStorage.PinErrorType.PRIVATE_MODE]: 'Node is in private mode - remote pinning requires public or hybrid mode',
        [IPFSStorage.PinErrorType.INVALID_CID]: 'The provided CID is not valid',
        [IPFSStorage.PinErrorType.TIMEOUT]: `Could not find content within ${timeoutSec}s - it may not be available on the network`,
        [IPFSStorage.PinErrorType.NOT_FOUND]: 'Content not found - no peers on the network have this content',
        [IPFSStorage.PinErrorType.NETWORK_ERROR]: 'Network error while fetching content',
        [IPFSStorage.PinErrorType.DIRECTORY_TOO_LARGE]: `Directory has more than ${maxFiles} files - use maxFiles parameter to increase limit`,
      };

      const userMessage = errorMessages[errorType] || message;

      logger.error(`[Public Gateway] Failed to pin ${cid}:`, { 
        error: message, 
        type: errorType,
        status 
      });

      res.status(status).json({ 
        error: errorType,
        message: userMessage,
        cid
      });
    }
  });

  /**
   * DELETE /api/pin/:cid
   * 
   * Unpin a CID (allow garbage collection).
   */
  router.delete('/api/pin/:cid', publicRateLimit, async (req: Request, res: Response) => {
    const { cid } = req.params;

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!ipfs || !ipfs.isReady()) {
      return res.status(503).json({ error: 'IPFS not available' });
    }

    try {
      await ipfs.unpinFile(cid);
      res.json({ success: true, cid, message: 'Content unpinned' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[Public Gateway] Failed to unpin ${cid}:`, { error: message });
      res.status(500).json({ error: 'Failed to unpin content' });
    }
  });

  return router;
}

export default createPublicRouter;
