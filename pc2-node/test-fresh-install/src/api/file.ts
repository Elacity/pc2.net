/**
 * File Access Endpoint
 * 
 * Handles signed file access via /file?uid=...
 */

import { Request, Response } from 'express';
import { FilesystemManager } from '../storage/filesystem.js';
import { AuthenticatedRequest } from './middleware.js';

/**
 * Get file by UID (signed access)
 * GET /file?uid=uuid-...
 */
export async function handleFile(req: Request, res: Response): Promise<void> {
  const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
  const uid = req.query.uid as string;

  if (!filesystem) {
    res.status(500).json({ error: 'Filesystem not initialized' });
    return;
  }

  if (!uid) {
    res.status(400).json({ error: 'Missing uid parameter' });
    return;
  }

  try {
    // Convert UUID back to path (uuid-/path/to/file -> /path/to/file)
    // Handle both uuid- and uuid--- formats, and URL-encoded filenames
    let uuidPath = uid.replace(/^uuid-+/, ''); // Remove uuid- or uuid--- prefix
    let filePath = '/' + uuidPath.replace(/-/g, '/');
    
    // Decode URL-encoded characters in the path (e.g., %283%29 -> (3))
    try {
      filePath = decodeURIComponent(filePath);
    } catch (e) {
      // If decoding fails, use original path
      console.warn('[File] Failed to decode URL path, using original:', filePath);
    }
    
    // Try to find file by UUID lookup first (more reliable)
    // The filesystem should have a method to find files by UUID
    let metadata = null;
    let walletAddress = '';
    
    // Extract wallet address from path if present (format: /0x.../path/to/file)
    const pathParts = filePath.split('/').filter(p => p);
    if (pathParts.length > 0 && pathParts[0].startsWith('0x')) {
      walletAddress = pathParts[0];
      // Reconstruct path with wallet address
      filePath = '/' + pathParts.join('/');
    }
    
    // Try to get file metadata
    if (walletAddress) {
      metadata = filesystem.getFileMetadata(filePath, walletAddress);
    }
    
    if (!metadata) {
      // If not found, try without wallet address (for signed URLs)
      // Also try case-insensitive lookup
      if (filePath.includes('/')) {
        const pathParts = filePath.split('/').filter(p => p);
        if (pathParts.length >= 2) {
          const parentPath = '/' + pathParts.slice(0, -1).join('/');
          const fileName = pathParts[pathParts.length - 1];
          
          try {
            const parentFiles = filesystem.listDirectory(parentPath, walletAddress || '');
            const matchingFile = parentFiles.find(f => {
              const fName = f.path.split('/').pop() || '';
              return fName.toLowerCase() === fileName.toLowerCase();
            });
            if (matchingFile) {
              metadata = matchingFile;
              filePath = matchingFile.path;
              if (pathParts[0].startsWith('0x')) {
                walletAddress = pathParts[0];
              }
            }
          } catch (e) {
            // Ignore errors
          }
        }
      }
      
      // Last attempt: try without wallet address
      if (!metadata) {
        metadata = filesystem.getFileMetadata(filePath, '');
      }
    }
    
    if (!metadata) {
      console.error('[File] File not found:', { uid, filePath, walletAddress });
      res.status(404).json({ error: 'File not found', uid, filePath });
      return;
    }

    // Read file content - use the metadata path and wallet address
    const finalWalletAddress = walletAddress || (metadata.path.split('/').filter(p => p)[0]?.startsWith('0x') ? metadata.path.split('/').filter(p => p)[0] : '');
    const content = await filesystem.readFile(metadata.path, finalWalletAddress);
    
    // Set appropriate headers
    if (metadata.mime_type) {
      res.setHeader('Content-Type', metadata.mime_type);
    }
    res.setHeader('Content-Length', metadata.size.toString());
    
    res.send(content);
  } catch (error) {
    console.error('[File] File access error:', error, { uid });
    res.status(500).json({
      error: 'Failed to access file',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

