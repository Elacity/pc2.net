/**
 * File Access Endpoint
 * 
 * Handles signed file access via /file?uid=...
 */

import { Request, Response } from 'express';
import { Readable, pipeline } from 'stream';
import { FilesystemManager } from '../storage/filesystem.js';
import { AuthenticatedRequest } from './middleware.js';
import { createLogger } from '../utils/logger.js';
const log = createLogger('api-file');

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
    log.debug('[File] Request received, uid:', uid);
    
    // Convert UUID back to path (uuid-/path/to/file -> /path/to/file)
    // UUID format: uuid-${path.replace(/\//g, '-')}
    // Problem: We can't simply replace all - with / because filenames can contain hyphens
    // Solution: Use directory listing to find the file by matching the expected structure
    let uuidPath = uid.replace(/^uuid-+/, ''); // Remove uuid- or uuid--- prefix
    
    // Extract wallet address (first segment, starts with 0x)
    const walletMatch = uuidPath.match(/^(0x[a-fA-F0-9]{40})(?:-(.+))?$/);
    if (!walletMatch) {
      log.error('[File] Invalid UUID format, cannot extract wallet address:', uid);
      res.status(400).json({ error: 'Invalid UUID format' });
      return;
    }
    
    const walletAddress = walletMatch[1];
    const remainingPath = walletMatch[2] || '';
    
    log.debug('[File] Extracted wallet:', walletAddress, 'remaining:', remainingPath);
    
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
        log.debug('[File] Looking for file in', dir, 'with expected filename:', expectedFilename);
        
        try {
          const dirPath = `/${walletAddress}/${dir}`;
          const files = filesystem.listDirectory(dirPath, walletAddress);
          log.debug('[File] Listing directory:', dirPath, 'found', files.length, 'files');
          
          // Try to find matching file
          const matchingFile = files.find(f => {
            const fName = f.path.split('/').pop() || '';
            // Exact match (most common case)
            if (fName === expectedFilename) {
              log.debug('[File] Exact filename match:', fName);
              return true;
            }
            // Case-insensitive match
            if (fName.toLowerCase() === expectedFilename.toLowerCase()) {
              log.debug('[File] Case-insensitive filename match:', fName);
              return true;
            }
            // Handle URL encoding differences (spaces might be %20 in some cases)
            const decodedExpected = decodeURIComponent(expectedFilename);
            if (fName === decodedExpected || fName.toLowerCase() === decodedExpected.toLowerCase()) {
              log.debug('[File] Decoded filename match:', fName, 'vs', decodedExpected);
              return true;
            }
            return false;
          });
          
          if (matchingFile) {
            metadata = matchingFile;
            filePath = matchingFile.path;
            log.debug('[File] Found file via directory search:', filePath);
            break;
          } else {
            log.debug('[File] No matching file found in', dir, 'for expected filename:', expectedFilename);
            // Log available filenames for debugging
            if (files.length > 0) {
              const availableNames = files.map(f => f.path.split('/').pop()).slice(0, 5);
              log.debug('[File] Available filenames (first 5):', availableNames);
            }
          }
        } catch (e) {
          // Directory doesn't exist or error, continue
          log.debug('[File] Error listing', dir, ':', e instanceof Error ? e.message : String(e));
        }
      }
    }
    
    // Fallback: Try direct path construction if directory listing didn't work
    if (!metadata) {
      for (const dir of commonDirs) {
        if (remainingPath.startsWith(dir + '-')) {
          const afterDir = remainingPath.substring(dir.length + 1);
          const potentialPath = `/${walletAddress}/${dir}/${afterDir}`;
          log.debug('[File] Fallback: Trying direct path:', potentialPath);
          try {
            metadata = filesystem.getFileMetadata(potentialPath, walletAddress);
            if (metadata) {
              filePath = metadata.path;
              log.debug('[File] Found file via direct path:', filePath);
              break;
            }
          } catch (e) {
            log.debug('[File] Direct path lookup failed:', e instanceof Error ? e.message : String(e));
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
      log.debug('[File] Trying naive path conversion:', naivePath);
      const pathParts = naivePath.split('/').filter(p => p);
      if (pathParts.length > 0 && pathParts[0].startsWith('0x')) {
        metadata = filesystem.getFileMetadata(naivePath, pathParts[0]);
        if (metadata) {
          filePath = metadata.path;
        }
      }
    }
    
    log.debug('[File] Final filePath:', filePath);
    
    if (!metadata) {
      log.error('[File] File not found:', { uid, filePath, walletAddress });
      res.status(404).json({ error: 'File not found', uid, filePath });
      return;
    }
    
    log.debug('[File] File found:', metadata.path);

    const finalWalletAddress = walletAddress || (metadata.path.split('/').filter(p => p)[0]?.startsWith('0x') ? metadata.path.split('/').filter(p => p)[0] : '');
    const mimeType = metadata.mime_type || 'application/octet-stream';
    const isStreamable = /^(video|audio)\//.test(mimeType);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

    if (isStreamable) {
      res.setHeader('Accept-Ranges', 'bytes');
    }

    // HEAD -- return headers from DB metadata (no IPFS call)
    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', metadata.size.toString());
      res.status(200).end();
      return;
    }

    // Range request -- only for video/audio where seeking is needed
    const rangeHeader = req.headers.range;
    if (rangeHeader && isStreamable) {
      const fileSize = await filesystem.getFileSize(metadata.path, finalWalletAddress).catch(() => metadata.size);
      const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
      if (!match || parseInt(match[1], 10) >= fileSize) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
        return;
      }
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.status(206).set({
        'Content-Length': chunkSize.toString(),
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      });

      const stream = filesystem.readFileStream(metadata.path, finalWalletAddress, {
        offset: start, length: chunkSize,
      });
      pipeline(Readable.from(stream), res, (err) => {
        if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
          log.error('[File] Stream error:', err.message);
        }
      });
      return;
    }

    // Full file -- stream large video/audio, buffer everything else
    const STREAM_THRESHOLD = 10 * 1024 * 1024;
    if (isStreamable && metadata.size > STREAM_THRESHOLD) {
      res.setHeader('Content-Length', metadata.size.toString());
      const stream = filesystem.readFileStream(metadata.path, finalWalletAddress);
      pipeline(Readable.from(stream), res, (err) => {
        if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
          log.error('[File] Stream error:', err.message);
        }
      });
    } else {
      const content = await filesystem.readFile(metadata.path, finalWalletAddress);
      res.setHeader('Content-Length', content.length.toString());
      res.send(content);
    }
  } catch (error) {
    log.error('[File] File access error:', error, { uid });
    res.status(500).json({
      error: 'Failed to access file',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

