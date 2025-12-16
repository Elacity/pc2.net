/**
 * Filesystem API Endpoints
 * 
 * Handles file and directory operations
 */

import { Request, Response } from 'express';
import { FilesystemManager } from '../storage/filesystem.js';
import { AuthenticatedRequest } from './middleware.js';
import { broadcastFileChange, broadcastDirectoryChange } from '../websocket/events.js';
import { FileStat, DirectoryEntry, ReadFileRequest, WriteFileRequest, CreateDirectoryRequest, DeleteRequest, MoveRequest } from '../types/api.js';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger.js';

/**
 * Get file/folder stat
 * GET /stat?path=/path/to/file
 * POST /stat (with path in body)
 */
export function handleStat(req: AuthenticatedRequest, res: Response): void {
  const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
  // Support both GET (query param) and POST (body param)
  // Also support various field names: path, file, subject
  const path = (req.query.path as string) || 
               (req.query.file as string) ||
               (req.query.subject as string) ||
               (req.body?.path as string) || 
               (req.body?.file as string) ||
               (req.body?.subject as string) ||
               '/';

  logger.info(`[Stat] Request received: method=${req.method}, path=${path}, query=${JSON.stringify(req.query)}, body=${JSON.stringify(req.body)}`);

  if (!req.user) {
    logger.warn(`[Stat] Unauthorized request for path: ${path}`);
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Handle ~ (home directory) - replace with user's wallet address
  let resolvedPath = path;
  if (path.startsWith('~')) {
    resolvedPath = path.replace('~', `/${req.user.wallet_address}`);
  } else if (!path.startsWith('/')) {
    // If path doesn't start with /, assume it's relative to user's home
    resolvedPath = `/${req.user.wallet_address}/${path}`;
  }
  
  logger.info(`[Stat] Resolved path: ${resolvedPath} (original: ${path}, wallet: ${req.user.wallet_address})`);

  if (!filesystem) {
    // Return directory stat for known directories even when filesystem not initialized
    // This allows the frontend to handle missing files gracefully
    // Always return directory stat for paths under user's wallet address
    const walletPath = `/${req.user.wallet_address}`;
    
    // Check if this is a user path (starts with wallet address)
    const isUserPath = resolvedPath === walletPath || 
                       resolvedPath.startsWith(`${walletPath}/`) ||
                       resolvedPath === '/' ||
                       resolvedPath.endsWith('/');
    
    if (isUserPath) {
      const pathParts = resolvedPath.split('/').filter(p => p);
      const dirStat: FileStat = {
        name: pathParts.length > 0 ? pathParts[pathParts.length - 1] : '/',
        path: resolvedPath,
        type: 'dir',
        size: 0,
        created: Date.now(),
        modified: Date.now(),
        is_dir: true,
        uid: `uuid-${resolvedPath.replace(/\//g, '-').replace(/^-/, '')}`,
        uuid: `uuid-${resolvedPath.replace(/\//g, '-').replace(/^-/, '')}`
      };
      logger.info(`[Stat] Returning directory stat for: ${resolvedPath} (filesystem not initialized, wallet: ${walletPath})`);
      res.json(dirStat);
      return;
    }
    logger.warn(`[Stat] Path not found (not a user path): ${resolvedPath}, wallet: ${walletPath}, isUserPath: ${isUserPath}`);
    res.status(404).json({ error: 'File not found', path: resolvedPath, wallet: walletPath });
    return;
  }

  try {
    const metadata = filesystem.getFileMetadata(resolvedPath, req.user.wallet_address);
    logger.info(`[Stat] Metadata lookup result: ${metadata ? 'found' : 'not found'} for path: ${resolvedPath}`);
    
    if (!metadata) {
      // For user paths, return directory stat even if not in database yet
      // This allows the frontend to display directories before files are created
      const walletPath = `/${req.user.wallet_address}`;
      const isUserPath = resolvedPath === walletPath || 
                         resolvedPath.startsWith(`${walletPath}/`) ||
                         resolvedPath === '/';
      
      logger.info(`[Stat] Checking user path: resolvedPath=${resolvedPath}, walletPath=${walletPath}, isUserPath=${isUserPath}`);
      
      if (isUserPath) {
        const pathParts = resolvedPath.split('/').filter(p => p);
        const dirStat: FileStat = {
          name: pathParts.length > 0 ? pathParts[pathParts.length - 1] : '/',
          path: resolvedPath,
          type: 'dir',
          size: 0,
          created: Date.now(),
          modified: Date.now(),
          is_dir: true,
          uid: `uuid-${resolvedPath.replace(/\//g, '-').replace(/^-/, '')}`,
          uuid: `uuid-${resolvedPath.replace(/\//g, '-').replace(/^-/, '')}`
        };
        logger.info(`[Stat] Returning directory stat for: ${resolvedPath} (not in database yet, wallet: ${walletPath})`);
        res.json(dirStat);
        return;
      }
      
      logger.warn(`[Stat] Path not a user path, returning 404: ${resolvedPath}`);
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const stat: FileStat = {
      name: metadata.path.split('/').pop() || '/',
      path: resolvedPath, // Return the resolved path (with ~ expanded)
      type: metadata.is_dir ? 'dir' : 'file',
      size: metadata.size,
      created: metadata.created_at,
      modified: metadata.updated_at,
      mime_type: metadata.mime_type,
      is_dir: metadata.is_dir,
      uid: `uuid-${metadata.path.replace(/\//g, '-')}`,
      uuid: `uuid-${metadata.path.replace(/\//g, '-')}`
    };

    res.json(stat);
  } catch (error) {
    logger.error('Stat error:', error instanceof Error ? error.message : 'Unknown error', { path });
    res.status(500).json({
      error: 'Failed to get file stat',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * List directory contents
 * POST /readdir
 */
export function handleReaddir(req: AuthenticatedRequest, res: Response): void {
  const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
  const body = req.body as { path?: string };
  const path = body.path || '/';

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Handle ~ (home directory) - replace with user's wallet address
  let resolvedPath = path;
  if (path.startsWith('~')) {
    resolvedPath = path.replace('~', `/${req.user.wallet_address}`);
  } else if (!path.startsWith('/')) {
    // If path doesn't start with /, assume it's relative to user's home
    resolvedPath = `/${req.user.wallet_address}/${path}`;
  }

  if (!filesystem) {
    // Return empty directory when filesystem not initialized
    // But include special items like Trash/bin if it's the Desktop
    const entries: DirectoryEntry[] = [];
    
    // If this is the Desktop, add Trash/bin item
    // Check if path ends with /Desktop or contains /Desktop/
    const isDesktop = resolvedPath.endsWith('/Desktop') || 
                      resolvedPath.endsWith('/Desktop/') ||
                      resolvedPath.includes('/Desktop/') ||
                      (resolvedPath === `/${req.user.wallet_address}/Desktop`);
    
    if (isDesktop) {
      const trashPath = `/${req.user.wallet_address}/.Trash`;
      entries.push({
        name: '.Trash',
        path: trashPath,
        type: 'dir',
        size: 0,
        created: Date.now(),
        modified: Date.now(),
        mime_type: 'inode/directory',
        is_dir: true,
        uid: `uuid-${trashPath.replace(/\//g, '-').replace(/^-/, '')}`,
        uuid: `uuid-${trashPath.replace(/\//g, '-').replace(/^-/, '')}`
      });
    }
    
    res.json(entries);
    return;
  }

  try {
    const files = filesystem.listDirectory(resolvedPath, req.user.wallet_address);

    const entries: DirectoryEntry[] = files.map(metadata => ({
      name: metadata.path.split('/').pop() || '/',
      path: metadata.path,
      type: metadata.is_dir ? 'dir' : 'file',
      size: metadata.size,
      created: metadata.created_at,
      modified: metadata.updated_at,
      mime_type: metadata.mime_type,
      is_dir: metadata.is_dir,
      uid: `uuid-${metadata.path.replace(/\//g, '-')}`,
      uuid: `uuid-${metadata.path.replace(/\//g, '-')}`
    }));

    res.json(entries);
  } catch (error) {
    logger.error('Readdir error:', error instanceof Error ? error.message : 'Unknown error', { path });
    res.status(500).json({
      error: 'Failed to read directory',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Read file content
 * GET /read?path=/path/to/file
 */
export async function handleRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
  // Support both GET (query param) and POST (body param)
  const path = (req.query.path as string) || 
               (req.query.file as string) ||
               (req.body?.path as string) || 
               (req.body?.file as string) ||
               undefined;
  const encoding = (req.query.encoding as 'utf8' | 'base64') || 'utf8';

  if (!filesystem) {
    // Return 404 when filesystem not initialized (instead of 500)
    // This allows the frontend to handle missing files gracefully
    res.status(404).json({ error: 'File not found' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!path) {
    res.status(400).json({ error: 'Missing path parameter' });
    return;
  }

  try {
    const content = await filesystem.readFile(path, req.user.wallet_address);

    if (encoding === 'base64') {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.send(content.toString('base64'));
    } else {
      // Get MIME type from metadata
      const metadata = filesystem.getFileMetadata(path, req.user.wallet_address);
      const mimeType = metadata?.mime_type || 'text/plain';
      
      res.setHeader('Content-Type', mimeType);
      res.send(content.toString('utf8'));
    }
  } catch (error) {
    logger.error('Read error:', error instanceof Error ? error.message : 'Unknown error', { path });
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: 'File not found' });
    } else {
      res.status(500).json({
        error: 'Failed to read file',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

/**
 * Write/create file
 * POST /write
 */
export async function handleWrite(req: AuthenticatedRequest, res: Response): Promise<void> {
  const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
  const io = (req.app.locals.io as SocketIOServer | undefined);
  const body = req.body as WriteFileRequest;

  if (!filesystem) {
    res.status(500).json({ error: 'Filesystem not initialized' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!body.path) {
    res.status(400).json({ error: 'Missing path' });
    return;
  }

  try {
    // Decode content if base64
    let content: Buffer | string = body.content;
    if (body.encoding === 'base64') {
      content = Buffer.from(body.content, 'base64');
    }

    // Write file
    const metadata = await filesystem.writeFile(
      body.path,
      content,
      req.user.wallet_address,
      {
        mimeType: body.mime_type,
        isPublic: false
      }
    );

    // Broadcast file change event
    if (io) {
      broadcastFileChange(io, {
        path: body.path,
        wallet_address: req.user.wallet_address,
        action: 'updated',
        metadata: {
          size: metadata.size,
          mime_type: metadata.mime_type || undefined,
          is_dir: false
        }
      });
    }

    // Return file metadata (Puter format)
    const fileStat: FileStat = {
      name: metadata.path.split('/').pop() || '/',
      path: metadata.path,
      type: 'file',
      size: metadata.size,
      created: metadata.created_at,
      modified: metadata.updated_at,
      mime_type: metadata.mime_type,
      is_dir: false,
      uid: `uuid-${metadata.path.replace(/\//g, '-')}`,
      uuid: `uuid-${metadata.path.replace(/\//g, '-')}`
    };

    res.json(fileStat);
  } catch (error) {
    logger.error('Write error:', error instanceof Error ? error.message : 'Unknown error', { path: body.path });
    res.status(500).json({
      error: 'Failed to write file',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Create directory
 * POST /mkdir
 */
export async function handleMkdir(req: AuthenticatedRequest, res: Response): Promise<void> {
  const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
  const io = (req.app.locals.io as SocketIOServer | undefined);
  const body = req.body as CreateDirectoryRequest;

  if (!filesystem) {
    res.status(500).json({ error: 'Filesystem not initialized' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!body.path) {
    res.status(400).json({ error: 'Missing path' });
    return;
  }

  try {
    const metadata = await filesystem.createDirectory(body.path, req.user.wallet_address);

    // Broadcast directory change event
    if (io) {
      broadcastDirectoryChange(io, {
        path: body.path,
        wallet_address: req.user.wallet_address,
        action: 'created'
      });
    }

    // Return directory metadata
    const dirStat: FileStat = {
      name: metadata.path.split('/').pop() || '/',
      path: metadata.path,
      type: 'dir',
      size: 0,
      created: metadata.created_at,
      modified: metadata.updated_at,
      mime_type: null,
      is_dir: true,
      uid: `uuid-${metadata.path.replace(/\//g, '-')}`,
      uuid: `uuid-${metadata.path.replace(/\//g, '-')}`
    };

    res.json(dirStat);
  } catch (error) {
    logger.error('Mkdir error:', error instanceof Error ? error.message : 'Unknown error', { path: body.path });
    res.status(500).json({
      error: 'Failed to create directory',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Delete files/directories
 * POST /delete
 */
export async function handleDelete(req: AuthenticatedRequest, res: Response): Promise<void> {
  const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
  const io = (req.app.locals.io as SocketIOServer | undefined);
  const body = req.body as DeleteRequest;

  if (!filesystem) {
    res.status(500).json({ error: 'Filesystem not initialized' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    res.status(400).json({ error: 'Missing items array' });
    return;
  }

  try {
    const deleted: Array<{ path: string; success: boolean; error?: string }> = [];

    for (const item of body.items) {
      const path = 'path' in item ? item.path : null;
      
      if (!path) {
        deleted.push({ path: 'unknown', success: false, error: 'Missing path' });
        continue;
      }

      try {
        await filesystem.deleteFile(path, req.user.wallet_address);
        deleted.push({ path, success: true });

        // Broadcast deletion event
        if (io) {
          broadcastFileChange(io, {
            path: path,
            wallet_address: req.user.wallet_address,
            action: 'deleted'
          });
        }
      } catch (error) {
        deleted.push({
          path,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    res.json({ deleted });
  } catch (error) {
    logger.error('Delete error:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({
      error: 'Failed to delete files',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Move/rename files
 * POST /move
 */
export async function handleMove(req: AuthenticatedRequest, res: Response): Promise<void> {
  const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
  const io = (req.app.locals.io as SocketIOServer | undefined);
  const body = req.body as MoveRequest;

  if (!filesystem) {
    res.status(500).json({ error: 'Filesystem not initialized' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    res.status(400).json({ error: 'Missing items array' });
    return;
  }

  if (!body.destination) {
    res.status(400).json({ error: 'Missing destination' });
    return;
  }

  try {
    const moved: Array<{ path: string; new_path: string; success: boolean; error?: string }> = [];

    for (const item of body.items) {
      const oldPath = 'path' in item ? item.path : null;
      
      if (!oldPath) {
        moved.push({ path: 'unknown', new_path: body.destination, success: false, error: 'Missing path' });
        continue;
      }

      // Calculate new path
      const destinationIsDir = body.destination.endsWith('/') || body.destination === '/';
      const fileName = oldPath.split('/').pop() || '';
      const newPath = destinationIsDir 
        ? `${body.destination}${fileName}`
        : body.destination;

      try {
        const metadata = await filesystem.moveFile(oldPath, newPath, req.user.wallet_address);
        moved.push({ path: oldPath, new_path: newPath, success: true });

        // Broadcast move event
        if (io) {
          broadcastFileChange(io, {
            path: newPath,
            wallet_address: req.user.wallet_address,
            action: 'moved',
            metadata: {
              size: metadata.size,
              mime_type: metadata.mime_type || undefined,
              is_dir: metadata.is_dir
            }
          });
        }
      } catch (error) {
        moved.push({
          path: oldPath,
          new_path: newPath,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    res.json({ moved });
  } catch (error) {
    logger.error('Move error:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({
      error: 'Failed to move files',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

