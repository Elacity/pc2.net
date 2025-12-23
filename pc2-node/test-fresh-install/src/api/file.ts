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
    console.log('[File] Request received, uid:', uid);
    
    // Convert UUID back to path (uuid-/path/to/file -> /path/to/file)
    // UUID format: uuid-${path.replace(/\//g, '-')}
    // Problem: We can't simply replace all - with / because filenames can contain hyphens
    // Solution: Use directory listing to find the file by matching the expected structure
    let uuidPath = uid.replace(/^uuid-+/, ''); // Remove uuid- or uuid--- prefix
    
    // Extract wallet address (first segment, starts with 0x)
    const walletMatch = uuidPath.match(/^(0x[a-fA-F0-9]{40})(?:-(.+))?$/);
    if (!walletMatch) {
      console.error('[File] Invalid UUID format, cannot extract wallet address:', uid);
      res.status(400).json({ error: 'Invalid UUID format' });
      return;
    }
    
    const walletAddress = walletMatch[1];
    const remainingPath = walletMatch[2] || '';
    
    console.log('[File] Extracted wallet:', walletAddress, 'remaining:', remainingPath);
    
    // Try to find the file by searching directories
    // Common directory structure: /0x.../Desktop/filename or /0x.../Videos/filename etc.
    let filePath = '';
    let metadata = null;
    
    // Common directories to check
    const commonDirs = ['Desktop', 'Videos', 'Documents', 'Pictures', 'Downloads', 'Public'];
    
    // Strategy: List directories and match filenames (more reliable than path construction)
    for (const dir of commonDirs) {
      const dirPrefix = dir + '-';
      if (remainingPath.startsWith(dirPrefix)) {
        const expectedFilename = remainingPath.substring(dirPrefix.length);
        console.log('[File] Looking for file in', dir, 'with expected filename:', expectedFilename);
        
        try {
          const dirPath = `/${walletAddress}/${dir}`;
          const files = filesystem.listDirectory(dirPath, walletAddress);
          console.log('[File] Listing directory:', dirPath, 'found', files.length, 'files');
          
          // Try to find matching file
          const matchingFile = files.find(f => {
            const fName = f.path.split('/').pop() || '';
            // Exact match (most common case)
            if (fName === expectedFilename) {
              console.log('[File] Exact filename match:', fName);
              return true;
            }
            // Case-insensitive match
            if (fName.toLowerCase() === expectedFilename.toLowerCase()) {
              console.log('[File] Case-insensitive filename match:', fName);
              return true;
            }
            // Handle URL encoding differences (spaces might be %20 in some cases)
            const decodedExpected = decodeURIComponent(expectedFilename);
            if (fName === decodedExpected || fName.toLowerCase() === decodedExpected.toLowerCase()) {
              console.log('[File] Decoded filename match:', fName, 'vs', decodedExpected);
              return true;
            }
            return false;
          });
          
          if (matchingFile) {
            metadata = matchingFile;
            filePath = matchingFile.path;
            console.log('[File] Found file via directory search:', filePath);
            break;
          } else {
            console.log('[File] No matching file found in', dir, 'for expected filename:', expectedFilename);
            // Log available filenames for debugging
            if (files.length > 0) {
              const availableNames = files.map(f => f.path.split('/').pop()).slice(0, 5);
              console.log('[File] Available filenames (first 5):', availableNames);
            }
          }
        } catch (e) {
          // Directory doesn't exist or error, continue
          console.log('[File] Error listing', dir, ':', e instanceof Error ? e.message : String(e));
        }
      }
    }
    
    // Fallback: Try direct path construction if directory listing didn't work
    if (!metadata) {
      for (const dir of commonDirs) {
        if (remainingPath.startsWith(dir + '-')) {
          const afterDir = remainingPath.substring(dir.length + 1);
          const potentialPath = `/${walletAddress}/${dir}/${afterDir}`;
          console.log('[File] Fallback: Trying direct path:', potentialPath);
          try {
            metadata = filesystem.getFileMetadata(potentialPath, walletAddress);
            if (metadata) {
              filePath = metadata.path;
              console.log('[File] Found file via direct path:', filePath);
              break;
            }
          } catch (e) {
            console.log('[File] Direct path lookup failed:', e instanceof Error ? e.message : String(e));
          }
        }
      }
    }
    
    // Last resort: try the naive conversion (may fail for files with hyphens in name)
    if (!metadata) {
      let naivePath = '/' + uuidPath.replace(/-/g, '/');
      try {
        naivePath = decodeURIComponent(naivePath);
      } catch (e) {
        // Ignore
      }
      console.log('[File] Trying naive path conversion:', naivePath);
      const pathParts = naivePath.split('/').filter(p => p);
      if (pathParts.length > 0 && pathParts[0].startsWith('0x')) {
        metadata = filesystem.getFileMetadata(naivePath, pathParts[0]);
        if (metadata) {
          filePath = metadata.path;
        }
      }
    }
    
    console.log('[File] Final filePath:', filePath);
    
    if (!metadata) {
      console.error('[File] File not found:', { uid, filePath, walletAddress });
      res.status(404).json({ error: 'File not found', uid, filePath });
      return;
    }
    
    console.log('[File] File found:', metadata.path);

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

