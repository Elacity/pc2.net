/**
 * Info Endpoints
 * 
 * Additional endpoints needed by the frontend
 */

import { Request, Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
import { FilesystemManager } from '../storage/filesystem.js';
import { logger } from '../utils/logger.js';

/**
 * Get API info
 * GET /api/info
 */
export function handleAPIInfo(req: Request, res: Response): void {
  res.json({
    version: '2.5.1',
    server: 'pc2-node',
    features: {
      file_storage: true,
      real_time: true,
      authentication: true
    }
  });
}

/**
 * Get launch apps
 * GET /get-launch-apps
 * Returns apps available in the start menu
 */
export function handleGetLaunchApps(req: Request, res: Response): void {
  const iconSize = parseInt(req.query.icon_size as string) || 64;
  const baseUrl = req.protocol + '://' + req.get('host');
  
  // Define available apps (these match the apps in src/backend/apps/)
  // Frontend will use default icons if icon URLs don't work
  const apps = [
    {
      name: 'editor',
      title: 'Text Editor',
      uuid: 'app-editor',
      icon: `${baseUrl}/apps/editor/img/icon.svg`,
      description: 'Code and text editor with syntax highlighting'
    },
    {
      name: 'viewer',
      title: 'Image Viewer',
      uuid: 'app-viewer',
      icon: undefined, // Frontend will use default icon
      description: 'View and edit images'
    },
    {
      name: 'player',
      title: 'Media Player',
      uuid: 'app-player',
      icon: undefined, // Frontend will use default icon
      description: 'Play audio and video files'
    },
    {
      name: 'camera',
      title: 'Camera',
      uuid: 'app-camera',
      icon: undefined, // Frontend will use default icon
      description: 'Take photos and videos'
    },
    {
      name: 'app-center',
      title: 'App Center',
      uuid: 'app-app-center',
      icon: undefined, // Frontend will use default icon
      description: 'Browse and install apps'
    },
    {
      name: 'pdf',
      title: 'PDF',
      uuid: 'app-pdf',
      icon: undefined, // Frontend will use default icon
      description: 'View PDF documents'
    },
    // Note: Terminal app may not exist yet
    // {
    //   name: 'terminal',
    //   title: 'Terminal',
    //   uuid: 'app-terminal',
    //   icon: undefined,
    //   description: 'Command line terminal'
    // },
    {
      name: 'recorder',
      title: 'Recorder',
      uuid: 'app-recorder',
      icon: undefined, // Frontend will use default icon
      description: 'Record screen and audio'
    },
    {
      name: 'solitaire-frvr',
      title: 'Solitaire FRVR',
      uuid: 'app-solitaire-frvr',
      icon: undefined, // Frontend will use default icon
      description: 'Play Solitaire card game'
    }
  ];
  
  // Return apps in the format expected by the frontend
  // Frontend expects: { recommended: [...], recent: [...] }
  res.json({
    recommended: apps, // All apps are recommended for now
    recent: [] // Recent apps will be populated as users launch apps
  });
}

/**
 * Disk free space (df)
 * GET /df
 */
export function handleDF(req: AuthenticatedRequest, res: Response): void {
  const filesystem = (req.app.locals.filesystem as any);
  
  // Return mock disk space info
  res.json({
    total: 10 * 1024 * 1024 * 1024, // 10GB
    used: 0,
    available: 10 * 1024 * 1024 * 1024,
    percentage: 0
  });
}

/**
 * Batch operations endpoint (handles multipart file uploads)
 * POST /batch
 * The Puter SDK uses this endpoint for drag-and-drop file uploads
 */
export async function handleBatch(req: AuthenticatedRequest, res: Response): Promise<void> {
  const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
  const body = req.body as any;

  logger.info('[Batch] Request received', {
    contentType: req.headers['content-type'],
    bodyKeys: Object.keys(body || {}),
    hasFiles: !!(req as any).files || !!(req as any).file
  });

  if (!filesystem) {
    res.status(500).json({ error: 'Filesystem not initialized' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    // Parse operation field (can be JSON string or array of JSON strings)
    let operations: any[] = [];
    if (body.operation) {
      if (typeof body.operation === 'string') {
        try {
          operations = JSON.parse(body.operation);
          if (!Array.isArray(operations)) {
            operations = [operations];
          }
        } catch (e) {
          logger.warn('[Batch] Failed to parse operation:', e);
        }
      } else if (Array.isArray(body.operation)) {
        operations = body.operation.map((op: any) => {
          if (typeof op === 'string') {
            try {
              return JSON.parse(op);
            } catch (e) {
              return null;
            }
          }
          return op;
        }).filter(Boolean);
      }
    }

    // Parse fileinfo if it's a JSON string
    let fileinfo: any = null;
    if (body.fileinfo) {
      if (typeof body.fileinfo === 'string') {
        try {
          fileinfo = JSON.parse(body.fileinfo);
        } catch (e) {
          logger.warn('[Batch] Failed to parse fileinfo:', e);
        }
      } else if (typeof body.fileinfo === 'object') {
        fileinfo = body.fileinfo;
      }
    }

    // Determine target path from operation, fileinfo, or form data
    let targetPath = '/';
    if (operations.length > 0 && operations[0].path) {
      targetPath = operations[0].path;
    } else if (fileinfo && fileinfo.path) {
      targetPath = fileinfo.path;
    } else if (fileinfo && fileinfo.parent) {
      targetPath = fileinfo.parent;
    } else {
      targetPath = body.path || body.parent || body.dest || `/${req.user.wallet_address}/Desktop`;
    }

    // Handle ~ home directory
    if (targetPath.startsWith('~/')) {
      targetPath = targetPath.replace('~/', `/${req.user.wallet_address}/`);
    }
    if (!targetPath.startsWith('/')) {
      targetPath = `/${req.user.wallet_address}/${targetPath}`;
    }

    logger.info('[Batch] Target path:', targetPath);

    // Process file uploads from multipart form data
    const results: any[] = [];
    const files = (req as any).files || ((req as any).file ? [(req as any).file] : []);

    if (files.length === 0) {
      // Check if files are in body (alternative format)
      for (const [key, value] of Object.entries(body)) {
        if (value && typeof value === 'object' && (value as any).filename) {
          files.push(value);
        }
      }
    }

    logger.info('[Batch] Found files:', files.length);

    for (const file of files) {
      try {
        let fileName = file.originalname || file.filename || 'untitled';
        const fileContent = file.buffer || file.content || '';
        const mimeType = file.mimetype || file.mimeType || 'application/octet-stream';

        if (!fileContent || (Buffer.isBuffer(fileContent) && fileContent.length === 0)) {
          logger.warn(`[Batch] File content is empty for: ${fileName}`);
          continue;
        }

        // Ensure parent directory exists
        const parentPath = targetPath;
        try {
          await filesystem.createDirectory(parentPath, req.user.wallet_address);
        } catch (e) {
          // Directory might already exist, that's fine
        }

        // Construct full file path
        const filePath = parentPath === '/' ? `/${fileName}` : `${parentPath}/${fileName}`;

        // Check if file already exists and handle duplicates
        let finalPath = filePath;
        const existing = filesystem.getFileMetadata(finalPath, req.user.wallet_address);
        if (existing && !existing.is_dir) {
          // Add number suffix like macOS
          const lastDot = fileName.lastIndexOf('.');
          const hasExtension = lastDot > 0;
          const baseName = hasExtension ? fileName.substring(0, lastDot) : fileName;
          const extension = hasExtension ? fileName.substring(lastDot) : '';
          
          let counter = 1;
          let newFileName;
          do {
            newFileName = `${baseName} (${counter})${extension}`;
            finalPath = parentPath === '/' ? `/${newFileName}` : `${parentPath}/${newFileName}`;
            const checkExisting = filesystem.getFileMetadata(finalPath, req.user.wallet_address);
            if (!checkExisting || checkExisting.is_dir) {
              break;
            }
            counter++;
          } while (counter < 1000);
          
          fileName = newFileName;
          logger.info(`[Batch] File exists, using: ${fileName}`);
        }

        // Write file
        const contentBuffer = Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent, typeof fileContent === 'string' ? 'utf8' : 'base64');
        const metadata = await filesystem.writeFile(
          finalPath,
          contentBuffer,
          req.user.wallet_address,
          {
            mimeType: mimeType,
            isPublic: false
          }
        );

        // Return file metadata in Puter format
        const fileStat = {
          name: metadata.path.split('/').filter(p => p).pop() || '/',
          path: metadata.path,
          type: 'file',
          size: metadata.size,
          created: metadata.created_at,
          modified: metadata.updated_at,
          mime_type: metadata.mime_type,
          is_dir: false,
          uid: `uuid-${metadata.path.replace(/\//g, '-').replace(/^-/, '')}`,
          uuid: `uuid-${metadata.path.replace(/\//g, '-').replace(/^-/, '')}`
        };

        results.push(fileStat);
        logger.info(`[Batch] File uploaded: ${finalPath} (${metadata.size} bytes)`);
      } catch (error) {
        logger.error(`[Batch] Error uploading file:`, error);
        results.push({
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    res.json({
      results: results
    });
  } catch (error) {
    logger.error('[Batch] Error:', error);
    res.status(500).json({
      error: 'Failed to process batch upload',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Cache timestamp endpoint (used by Puter SDK)
 * GET /cache/last-change-timestamp
 * No auth required - SDK calls this during initialization
 */
export function handleCacheTimestamp(req: Request, res: Response): void {
  // Return current timestamp (SDK expects this format)
  res.json({ timestamp: Date.now() });
}

/**
 * Get storage statistics
 * GET /api/stats
 * Returns storage usage, file counts, etc.
 */
export function handleStats(req: AuthenticatedRequest, res: Response): void {
  const db = (req.app.locals.db as any);
  const filesystem = (req.app.locals.filesystem as any);
  
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  
  try {
    // Get stats from database (even without IPFS, we can show file metadata)
    const walletAddress = req.user.wallet_address;
    
    // If database doesn't exist or getStorageStats is not available, return empty stats
    if (!db || typeof db.getStorageStats !== 'function') {
      const storageLimit = 10 * 1024 * 1024 * 1024; // 10 GB
      res.json({
        storageUsed: 0,
        storageLimit: storageLimit,
        storage: {
          used: 0,
          limit: storageLimit,
          available: storageLimit
        },
        filesCount: 0,
        files: 0,
        encryptedCount: 0,
        directories: 0
      });
      return;
    }
    
    const stats = db.getStorageStats(walletAddress) || {
      totalSize: 0,
      fileCount: 0,
      directoryCount: 0
    };
    
    // Default storage limit: 10GB
    const storageLimit = 10 * 1024 * 1024 * 1024; // 10 GB
    
    // Return in format expected by Settings page
    res.json({
      storageUsed: stats.totalSize || 0,
      storageLimit: storageLimit,
      storage: {
        used: stats.totalSize || 0,
        limit: storageLimit,
        available: storageLimit - (stats.totalSize || 0)
      },
      filesCount: stats.fileCount || 0,
      files: stats.fileCount || 0,
      encryptedCount: 0, // Encryption not implemented yet
      directories: stats.directoryCount || 0
    });
  } catch (error) {
    console.error('[handleStats] Error:', error);
    res.status(500).json({
      error: 'Failed to get storage stats',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

