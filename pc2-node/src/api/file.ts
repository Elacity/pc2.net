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
    const uuidPath = uid.replace(/^uuid-/, '');
    const filePath = '/' + uuidPath.replace(/-/g, '/');
    
    // For signed access, we might not have a wallet address
    // Try to get file metadata first
    // In a real implementation, we'd verify the signature from the query params
    const metadata = filesystem.getFileMetadata(filePath, '');
    
    if (!metadata) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Read file content
    const content = await filesystem.readFile(filePath, '');
    
    // Set appropriate headers
    if (metadata.mime_type) {
      res.setHeader('Content-Type', metadata.mime_type);
    }
    res.setHeader('Content-Length', metadata.size.toString());
    
    res.send(content);
  } catch (error) {
    console.error('File access error:', error);
    res.status(500).json({
      error: 'Failed to access file',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

