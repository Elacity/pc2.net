/**
 * File Versions API
 * 
 * Handles file version history and rollback operations
 */

import { Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
import { DatabaseManager, FilesystemManager } from '../storage/index.js';
import { logger } from '../utils/logger.js';

/**
 * Get all versions for a file
 * GET /versions?path=/path/to/file
 */
export function handleGetVersions(req: AuthenticatedRequest, res: Response): void {
  try {
    const db = req.app.locals.db as DatabaseManager;
    const userAddress = req.user?.wallet_address;
    if (!userAddress) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!db) {
      res.status(500).json({ error: 'Database not available' });
      return;
    }

    const filePath = req.query.path as string;
    if (!filePath) {
      res.status(400).json({ error: 'Missing required parameter: path' });
      return;
    }

    const versions = db.getFileVersions(filePath, userAddress);
    
    logger.info(`[Versions] Retrieved ${versions.length} versions for: ${filePath}`);

    res.json(versions.map(v => ({
      id: v.id,
      version_number: v.version_number,
      ipfs_hash: v.ipfs_hash,
      size: v.size,
      mime_type: v.mime_type,
      created_at: v.created_at,
      created_by: v.created_by,
      comment: v.comment
    })));
  } catch (error: any) {
    logger.error('[Versions] Error getting versions:', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to retrieve versions' });
  }
}

/**
 * Get a specific version of a file
 * GET /versions/:versionNumber?path=/path/to/file
 */
export async function handleGetVersion(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const db = req.app.locals.db as DatabaseManager;
    const filesystem = req.app.locals.filesystem as FilesystemManager;
    const userAddress = req.user?.wallet_address;
    if (!userAddress) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!db || !filesystem) {
      res.status(500).json({ error: 'Database or filesystem not available' });
      return;
    }

    const filePath = req.query.path as string;
    const versionNumber = parseInt(req.params.versionNumber, 10);

    if (!filePath || isNaN(versionNumber)) {
      res.status(400).json({ error: 'Missing required parameters: path and versionNumber' });
      return;
    }

    const version = db.getFileVersion(filePath, userAddress, versionNumber);
    if (!version) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }

    // Retrieve file content from IPFS using the version's CID directly
    // We need to access IPFS directly since readFile uses current file's CID
    const ipfs = (filesystem as any)['ipfs']; // Access private IPFS instance
    if (!ipfs || !ipfs.isReady()) {
      res.status(500).json({ error: 'IPFS not available' });
      return;
    }

    try {
      const content = await ipfs.getFile(version.ipfs_hash);
      
      // Return version metadata and content
      res.json({
        version: {
          id: version.id,
          version_number: version.version_number,
          ipfs_hash: version.ipfs_hash,
          size: version.size,
          mime_type: version.mime_type,
          created_at: version.created_at,
          created_by: version.created_by,
          comment: version.comment
        },
        content: content.toString('base64'), // Base64 encode for JSON response
        content_type: version.mime_type || 'application/octet-stream'
      });
    } catch (error: any) {
      logger.error('[Versions] Error retrieving version content:', {
        path: filePath,
        version: versionNumber,
        cid: version.ipfs_hash,
        error: error.message
      });
      res.status(500).json({ error: 'Failed to retrieve version content' });
    }
  } catch (error: any) {
    logger.error('[Versions] Error getting version:', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to retrieve version' });
  }
}

/**
 * Restore a file to a specific version (rollback)
 * POST /versions/:versionNumber/restore
 * Body: { path: "/path/to/file" }
 */
export async function handleRestoreVersion(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const db = req.app.locals.db as DatabaseManager;
    const filesystem = req.app.locals.filesystem as FilesystemManager;
    const userAddress = req.user?.wallet_address;
    if (!userAddress) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!db || !filesystem) {
      res.status(500).json({ error: 'Database or filesystem not available' });
      return;
    }

    const filePath = (req.body.path || req.query.path) as string;
    const versionNumber = parseInt(req.params.versionNumber, 10);

    if (!filePath || isNaN(versionNumber)) {
      res.status(400).json({ error: 'Missing required parameters: path and versionNumber' });
      return;
    }

    const version = db.getFileVersion(filePath, userAddress, versionNumber);
    if (!version) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }

    // Retrieve file content from IPFS using the version's CID
    const ipfs = filesystem['ipfs']; // Access private IPFS instance
    if (!ipfs || !ipfs.isReady()) {
      res.status(500).json({ error: 'IPFS not available' });
      return;
    }

    const content = await ipfs.getFile(version.ipfs_hash);

    // Write the version content back to the file (this will create a new version automatically)
    await filesystem.writeFile(filePath, content, userAddress, {
      mimeType: version.mime_type || undefined
    });

    logger.info(`[Versions] ✅ Restored file to version ${versionNumber}: ${filePath}`);

    res.json({
      success: true,
      message: `File restored to version ${versionNumber}`,
      restored_version: versionNumber,
      new_version: db.getNextVersionNumber(filePath, userAddress) - 1 // Current version after restore
    });
  } catch (error: any) {
    logger.error('[Versions] Error restoring version:', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to restore version' });
  }
}
