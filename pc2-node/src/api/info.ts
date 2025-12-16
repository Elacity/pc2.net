/**
 * Info Endpoints
 * 
 * Additional endpoints needed by the frontend
 */

import { Request, Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
import { FilesystemManager } from '../storage/filesystem.js';
import { Server as SocketIOServer } from 'socket.io';
import { broadcastFileChange } from '../websocket/events.js';
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
 * Batch operations
 * POST /batch
 */
/**
 * Batch operations endpoint
 * POST /batch
 * Handles batch file uploads (multipart/form-data or JSON)
 * 
 * The Puter SDK's fs.upload() sends files to this endpoint
 * Format can be:
 * 1. multipart/form-data with files
 * 2. JSON with operations array
 */
export async function handleBatch(req: AuthenticatedRequest, res: Response): Promise<void> {
  const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
  const io = (req.app.locals.io as SocketIOServer | undefined);
  
  logger.info('[Batch] Request received', {
    contentType: req.headers['content-type'],
    hasFilesystem: !!filesystem,
    wallet: req.user?.wallet_address
  });
  
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!filesystem) {
    logger.warn('[Batch] Filesystem not available - IPFS not initialized');
    res.status(500).json({ 
      error: 'Filesystem not available',
      message: 'IPFS is not initialized. File uploads require IPFS to be running.'
    });
    return;
  }

  try {
    const contentType = req.headers['content-type'] || '';
    const results: any[] = [];
    
    // Check if this is multipart/form-data (files uploaded via drag-drop)
    if (contentType.includes('multipart/form-data')) {
      // Multer middleware should have parsed this
      // Files should be in req.files (if using multer) or req.body
      const files = (req as any).files || [];
      const formData = req.body || {};
      
      logger.info('[Batch] Processing multipart upload', {
        filesCount: Array.isArray(files) ? files.length : (files ? 1 : 0),
        formFields: Object.keys(formData)
      });
      
      // Handle file uploads from req.files (multer format)
      if (Array.isArray(files) && files.length > 0) {
        for (const file of files) {
          try {
            const destPath = formData.path || formData.dest_path || req.query.path as string;
            if (!destPath) {
              results.push({
                success: false,
                error: 'Missing destination path',
                filename: file.originalname || file.name
              });
              continue;
            }
            
            // Construct full file path
            const fileName = file.originalname || file.name || 'untitled';
            const filePath = destPath.endsWith('/') 
              ? `${destPath}${fileName}`
              : `${destPath}/${fileName}`;
            
            // Write file to filesystem
            const metadata = await filesystem.writeFile(
              filePath,
              file.buffer || file.data,
              req.user.wallet_address,
              {
                mimeType: file.mimetype || file.type
              }
            );
            
            results.push({
              success: true,
              path: metadata.path,
              result: {
                path: metadata.path,
                name: metadata.path.split('/').pop() || 'untitled',
                size: metadata.size,
                mime_type: metadata.mime_type
              }
            });
            
            // Broadcast file change
            if (io) {
              broadcastFileChange(io, {
                path: metadata.path,
                wallet_address: req.user.wallet_address,
                action: 'created',
                metadata: {
                  size: metadata.size,
                  mime_type: metadata.mime_type || undefined,
                  is_dir: false
                }
              });
            }
            
            logger.info('[Batch] File uploaded successfully', { path: metadata.path });
          } catch (error) {
            logger.error('[Batch] Error uploading file:', error);
            results.push({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              filename: file.originalname || file.name
            });
          }
        }
      } else if ((req as any).file) {
        // Single file upload (not array)
        const file = (req as any).file;
        try {
          const destPath = formData.path || formData.dest_path || req.query.path as string;
          if (!destPath) {
            results.push({
              success: false,
              error: 'Missing destination path',
              filename: file.originalname || file.name
            });
          } else {
            const fileName = file.originalname || file.name || 'untitled';
            const filePath = destPath.endsWith('/') 
              ? `${destPath}${fileName}`
              : `${destPath}/${fileName}`;
            
            const metadata = await filesystem.writeFile(
              filePath,
              file.buffer || file.data,
              req.user.wallet_address,
              {
                mimeType: file.mimetype || file.type
              }
            );
            
            results.push({
              success: true,
              path: metadata.path,
              result: {
                path: metadata.path,
                name: metadata.path.split('/').pop() || 'untitled',
                size: metadata.size,
                mime_type: metadata.mime_type
              }
            });
            
            if (io) {
              broadcastFileChange(io, {
                path: metadata.path,
                wallet_address: req.user.wallet_address,
                action: 'created',
                metadata: {
                  size: metadata.size,
                  mime_type: metadata.mime_type || undefined,
                  is_dir: false
                }
              });
            }
          }
        } catch (error) {
          results.push({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            filename: file.originalname || file.name
          });
        }
      } else {
        logger.warn('[Batch] Multipart request but no files found in req.files or req.file');
        // Try to parse from body if multer didn't process it
        // This might happen if multer middleware wasn't applied
        results.push({
          success: false,
          error: 'No files found in multipart request. Multer middleware may not be configured.'
        });
      }
    } else {
      // JSON batch operations
      const body = req.body as any;
      
      logger.info('[Batch] Processing JSON batch operations', {
        hasOperations: !!body.operations,
        operationsCount: Array.isArray(body.operations) ? body.operations.length : 0
      });
      
      if (body && Array.isArray(body.operations)) {
        for (const op of body.operations) {
          try {
            if (op.type === 'write' && op.path && op.content) {
              const content = typeof op.content === 'string' 
                ? Buffer.from(op.content, op.encoding || 'utf8')
                : Buffer.from(op.content);
              
              const metadata = await filesystem.writeFile(
                op.path,
                content,
                req.user.wallet_address,
                {
                  mimeType: op.mimeType
                }
              );
              
              results.push({
                success: true,
                path: metadata.path,
                result: metadata
              });
              
              if (io) {
                broadcastFileChange(io, {
                  path: metadata.path,
                  wallet_address: req.user.wallet_address,
                  action: 'created',
                  metadata: {
                    size: metadata.size,
                    mime_type: metadata.mime_type || undefined,
                    is_dir: false
                  }
                });
              }
            } else {
              results.push({
                success: false,
                error: `Unknown operation type: ${op.type || 'missing'}`
              });
            }
          } catch (error) {
            results.push({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              path: op.path
            });
          }
        }
      } else {
        logger.warn('[Batch] JSON request but no operations array found');
        // Empty batch - return empty results
      }
    }
    
    logger.info('[Batch] Batch operation completed', {
      resultsCount: results.length,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length
    });
    
    res.json({ results });
  } catch (error) {
    logger.error('[Batch] Error processing batch operations:', error);
    res.status(500).json({
      error: 'Failed to process batch operations',
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

