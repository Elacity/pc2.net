/**
 * Filesystem API Endpoints
 * 
 * Handles file and directory operations
 */

import { Request, Response } from 'express';
import { FilesystemManager } from '../storage/filesystem.js';
import { AuthenticatedRequest } from './middleware.js';
import { broadcastFileChange, broadcastDirectoryChange, broadcastItemRemoved, broadcastItemMoved, broadcastItemUpdated, broadcastItemAdded, broadcastItemRenamed } from '../websocket/events.js';
import { FileStat, DirectoryEntry, ReadFileRequest, WriteFileRequest, CreateDirectoryRequest, DeleteRequest, MoveRequest } from '../types/api.js';
import { FileMetadata } from '../storage/database.js';
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

  logger.info(`[Stat] Request received: method=${req.method}, path=${path}, query=${JSON.stringify(req.query)}, body=${JSON.stringify(req.body)}, hasUser=${!!req.user}`);

  if (!req.user) {
    logger.warn(`[Stat] Unauthorized request for path: ${path}`);
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  
  // Ensure wallet address is valid (not null)
  if (!req.user.wallet_address) {
    logger.error(`[Stat] User object exists but wallet_address is null/undefined`);
    res.status(401).json({ error: 'Invalid user session - wallet address missing' });
    return;
  }

  // Handle ~ (home directory) - replace with user's wallet address
  // CRITICAL: Also handle /null paths (frontend bug - should be fixed, but handle gracefully)
  let resolvedPath = path;
  if (path.startsWith('~')) {
    resolvedPath = path.replace('~', `/${req.user.wallet_address}`);
  } else if (path.startsWith('/null')) {
    // Frontend is sending /null/Desktop instead of /wallet/Desktop
    // Replace /null with the actual wallet address
    resolvedPath = path.replace('/null', `/${req.user.wallet_address}`);
    logger.warn(`[Stat] Replacing /null with wallet address: ${path} -> ${resolvedPath}`);
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

    const stat: FileStat & { is_public?: boolean; ipfs_hash?: string | null } = {
      name: metadata.path.split('/').pop() || '/',
      path: resolvedPath, // Return the resolved path (with ~ expanded)
      type: metadata.mime_type || (metadata.is_dir ? 'dir' : 'file'), // Use mime_type for files, 'dir' for directories
      size: metadata.size,
      created: Math.floor(metadata.created_at / 1000), // Convert to seconds (Unix timestamp)
      modified: Math.floor(metadata.updated_at / 1000), // Convert to seconds (Unix timestamp)
      mime_type: metadata.mime_type,
      thumbnail: metadata.thumbnail || undefined,
      is_dir: metadata.is_dir,
      uid: `uuid-${metadata.path.replace(/\//g, '-')}`,
      uuid: `uuid-${metadata.path.replace(/\//g, '-')}`,
      ipfs_hash: metadata.ipfs_hash || null // Include IPFS Content ID (CID)
    };
    
    // Add is_public if it exists (for frontend to determine shared status)
    if ('is_public' in metadata) {
      stat.is_public = metadata.is_public;
    }

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
  // CRITICAL: Also handle /null paths (frontend bug - should be fixed, but handle gracefully)
  let resolvedPath = path;
  if (path.startsWith('~')) {
    resolvedPath = path.replace('~', `/${req.user.wallet_address}`);
  } else if (path.startsWith('/null')) {
    // Frontend is sending /null/Desktop instead of /wallet/Desktop
    // Replace /null with the actual wallet address
    resolvedPath = path.replace('/null', `/${req.user.wallet_address}`);
    logger.warn(`[Readdir] Replacing /null with wallet address: ${path} -> ${resolvedPath}`);
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

    // Match mock server response format exactly
    const entries: any[] = files.map(metadata => {
      // Check if directory is empty (only for directories)
      let is_empty = false;
      if (metadata.is_dir) {
        try {
          const dirContents = filesystem.listDirectory(metadata.path, req.user!.wallet_address);
          is_empty = dirContents.length === 0;
        } catch (error) {
          // Directory might not exist or be inaccessible, assume empty
          is_empty = true;
        }
      }
      
      const entry: any = {
        id: Math.floor(Math.random() * 10000), // Mock server includes id
        uid: `uuid-${metadata.path.replace(/\//g, '-')}`,
        uuid: `uuid-${metadata.path.replace(/\//g, '-')}`,
        name: metadata.path.split('/').pop() || '/',
        path: metadata.path,
        is_dir: metadata.is_dir,
        is_empty: is_empty,
        size: metadata.size || 0,
        created: new Date(metadata.created_at).toISOString(), // ISO timestamp like mock server
        modified: new Date(metadata.updated_at).toISOString(), // ISO timestamp like mock server
        type: metadata.is_dir ? null : (metadata.mime_type || 'application/octet-stream'), // null for dirs, mime_type for files
        thumbnail: metadata.thumbnail || undefined, // Include thumbnail if available
        is_public: metadata.is_public || false // Only Public folder should be true
      };
      return entry;
    });

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
  let path = (req.query.path as string) || 
               (req.query.file as string) ||
               (req.body?.path as string) || 
               (req.body?.file as string) ||
               undefined;
  const encoding = (req.query.encoding as 'utf8' | 'base64') || 'utf8';

  // Special case: .__puter_gui.json - return empty object even without auth
  // This allows Puter GUI to initialize properly (matching mock server behavior)
  if (path && (path === '~/.__puter_gui.json' || path.endsWith('.__puter_gui.json'))) {
    logger.info('[Read] Special case: .__puter_gui.json - returning empty config');
    const emptyConfig = '{}';
    res.setHeader('Content-Type', 'application/octet-stream'); // Match Puter backend format
    res.setHeader('Content-Length', Buffer.byteLength(emptyConfig, 'utf8').toString());
    res.send(emptyConfig);
    return;
  }

  if (!filesystem) {
    // Return 404 when filesystem not initialized (instead of 500)
    // This allows the frontend to handle missing files gracefully
    res.status(404).json({ error: 'File not found' });
    return;
  }

  // Allow reading without auth for certain system files (matching mock server)
  // But still try to resolve ~ if we have a user
  if (!req.user && path && !path.startsWith('~')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!path) {
    res.status(400).json({ error: 'Missing path parameter' });
    return;
  }

  // Declare resolvedPath outside try block so it's accessible in catch
  let resolvedPath = path;
  let walletAddress: string | undefined;

  try {
    // Handle ~ (home directory) - expand to wallet address
    // CRITICAL: Also handle /null paths (frontend bug - should be fixed, but handle gracefully)
    resolvedPath = path;
    if (path.startsWith('~')) {
      if (req.user) {
        resolvedPath = path.replace('~', `/${req.user.wallet_address}`);
      } else {
        // Try to get wallet from token in URL or Referer header (for editor iframe)
        const url = new URL(req.url || '/', `http://${req.get('host') || 'localhost'}`);
        const tokenParam = url.searchParams.get('token') || url.searchParams.get('puter.auth.token') || url.searchParams.get('auth_token');
        
        let walletAddress = null;
        if (tokenParam && filesystem) {
          const db = (req.app.locals.db as any);
          if (db) {
            const session = db.getSession(tokenParam);
            if (session) {
              walletAddress = session.wallet_address;
            }
          }
        }
        
        // Fallback: try Referer header (editor iframe URL)
        if (!walletAddress && req.headers.referer) {
          try {
            const refererUrl = new URL(req.headers.referer);
            const refererToken = refererUrl.searchParams.get('puter.auth.token');
            if (refererToken && filesystem) {
              const db = (req.app.locals.db as any);
              if (db) {
                const session = db.getSession(refererToken);
                if (session) {
                  walletAddress = session.wallet_address;
                }
              }
            }
          } catch (e) {
            // Ignore referer parsing errors
          }
        }
        
        if (walletAddress) {
          resolvedPath = path.replace('~', `/${walletAddress}`);
        } else {
          res.status(401).json({ error: 'Unauthorized - cannot resolve ~ without authentication' });
          return;
        }
      }
    } else if (path.startsWith('/null')) {
      // Frontend is sending /null/Public/.profile instead of /wallet/Public/.profile
      // Replace /null with the actual wallet address
      if (req.user) {
        resolvedPath = path.replace('/null', `/${req.user.wallet_address}`);
        logger.warn(`[Read] Replacing /null with wallet address: ${path} -> ${resolvedPath}`);
      } else {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    } else if (!path.startsWith('/') && req.user) {
      // Relative path - assume relative to user's home
      resolvedPath = `/${req.user.wallet_address}/${path}`;
    }

    // Extract wallet address - prefer req.user, fallback to path extraction
    walletAddress = req.user?.wallet_address;
    if (!walletAddress) {
      // Try to extract from resolved path (format: /0x{40 hex chars}/...)
      const pathParts = resolvedPath.split('/').filter(p => p);
      if (pathParts.length > 0 && pathParts[0].startsWith('0x') && pathParts[0].length === 42) {
        walletAddress = pathParts[0];
        logger.info('[Read] Extracted wallet address from path', { walletAddress, resolvedPath });
      }
    }
    
    if (!walletAddress) {
      logger.error('[Read] Cannot determine wallet address', { 
        path, 
        resolvedPath, 
        hasUser: !!req.user,
        userWallet: req.user?.wallet_address 
      });
      res.status(400).json({ error: 'Cannot determine wallet address' });
      return;
    }
    
    logger.info('[Read] Reading file', { 
      resolvedPath, 
      walletAddress,
      originalPath: path,
      hasUser: !!req.user,
      userWallet: req.user?.wallet_address
    });
    
    // Check if file exists before trying to read
    const fileMetadata = filesystem.getFileMetadata(resolvedPath, walletAddress);
    if (!fileMetadata) {
      logger.error('[Read] File metadata not found in database', { 
        resolvedPath, 
        walletAddress,
        availableFiles: 'checking...'
      });
      res.status(404).json({ error: 'File not found', message: `File not found: ${resolvedPath}` });
      return;
    }
    
    logger.info('[Read] File metadata found', {
      path: fileMetadata.path,
      hasIPFSHash: !!fileMetadata.ipfs_hash,
      ipfsHash: fileMetadata.ipfs_hash?.substring(0, 20) + '...',
      size: fileMetadata.size,
      isDir: fileMetadata.is_dir
    });
    
    const content = await filesystem.readFile(resolvedPath, walletAddress);

    // Get MIME type from metadata
    const metadata = filesystem.getFileMetadata(resolvedPath, walletAddress);
    const mimeType = metadata?.mime_type || 'application/octet-stream';
    
    // Determine if file is binary (video, image, audio, etc.)
    const isBinary = mimeType.startsWith('video/') || 
                     mimeType.startsWith('image/') || 
                     mimeType.startsWith('audio/') ||
                     mimeType === 'application/octet-stream' ||
                     mimeType === 'application/pdf' ||
                     encoding === 'base64';

    // Set CORS headers for video/image/audio files (needed for player/viewer apps)
    if (isBinary) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
      // Support range requests for video seeking
      res.setHeader('Accept-Ranges', 'bytes');
    }

    // Support HTTP Range requests for video seeking (matching mock server behavior)
    const rangeHeader = req.headers.range;
    const fileSize = content.length;
    
    if (rangeHeader && isBinary) {
      // Parse range header (e.g., "bytes=0-1023" or "bytes=1024-")
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;
      const chunk = content.slice(start, end + 1);
      
      logger.info('[Read] Range request', {
        path: resolvedPath,
        range: rangeHeader,
        start,
        end,
        fileSize,
        chunkSize
      });
      
      res.status(206).set({
        'Content-Type': mimeType,
        'Content-Length': chunkSize.toString(),
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
      });
      res.send(chunk);
      return;
    }

    // No range request - send full file
    if (encoding === 'base64') {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.send(content.toString('base64'));
    } else if (isBinary) {
      // Send binary files as Buffer (not UTF-8 string)
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', content.length.toString());
      res.send(content);
    } else {
      // Text files can be sent as UTF-8 string
      res.setHeader('Content-Type', mimeType);
      res.send(content.toString('utf8'));
    }
  } catch (error) {
    logger.error('Read error:', error instanceof Error ? error.message : 'Unknown error', { 
      path,
      resolvedPath: resolvedPath || path,
      walletAddress: walletAddress || req.user?.wallet_address || 'unknown',
      errorStack: error instanceof Error ? error.stack : undefined
    });
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('File not found')) {
        res.status(404).json({ error: 'File not found', message: error.message });
        return;
      }
      if (error.message.includes('IPFS is not available')) {
        res.status(503).json({ error: 'Storage unavailable', message: error.message });
        return;
      }
      if (error.message.includes('Path is a directory')) {
        res.status(400).json({ error: 'Path is a directory', message: error.message });
        return;
      }
      if (error.message.includes('no IPFS hash')) {
        res.status(500).json({ error: 'File metadata incomplete', message: error.message });
        return;
      }
    }
    
    // Generic error response
      res.status(500).json({
        error: 'Failed to read file',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
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

    // Broadcast item.updated event (frontend listens for this, not file:changed)
    if (io) {
      const fileUid = `uuid-${body.path.replace(/\//g, '-')}`;
      broadcastItemUpdated(io, req.user.wallet_address, {
        uid: fileUid,
        name: metadata.path.split('/').pop() || '',
        path: body.path,
        size: metadata.size,
        modified: new Date(metadata.updated_at).toISOString(),
        original_client_socket_id: null
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
  
  // Support both body and query parameters (SDK might send in either)
  const body = {
    ...(req.query as any),
    ...(req.body as any)
  };

  // Log incoming request for debugging
  logger.info('[Mkdir] Request received', {
    method: req.method,
    bodyKeys: Object.keys(req.body || {}),
    queryKeys: Object.keys(req.query || {}),
    mergedKeys: Object.keys(body || {}),
    hasPath: !!body.path,
    pathType: typeof body.path,
    pathValue: body.path ? String(body.path).substring(0, 100) : undefined,
    hasParent: !!body.parent,
    hasItems: !!body.items,
    contentType: req.headers['content-type'],
    rawBody: JSON.stringify(req.body).substring(0, 500),
    rawQuery: JSON.stringify(req.query).substring(0, 500),
    mergedBody: JSON.stringify(body).substring(0, 500)
  });

  if (!filesystem) {
    res.status(500).json({ error: 'Filesystem not initialized' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Match mock server validation exactly
  // Puter's validation: path is required
  if (body.path === undefined) {
    logger.warn('[Mkdir] Missing path', { bodyKeys: Object.keys(body || {}), body: JSON.stringify(body).substring(0, 200) });
    res.status(400).json({ message: 'path is required' });
    return;
  }
  if (body.path === '' || body.path === null) {
    logger.warn('[Mkdir] Empty or null path', { path: body.path });
    res.status(400).json({ message: body.path === '' ? 'path cannot be empty' : 'path cannot be null' });
    return;
  }
  if (typeof body.path !== 'string') {
    logger.warn('[Mkdir] Path is not a string', { pathType: typeof body.path, path: body.path });
    res.status(400).json({ message: 'path must be a string' });
    return;
  }

  // Support both formats: { path: "..." } and { items: [{ path: "..." }] }
  // Also support { path: "...", parent: "..." } format (matching mock server)
  let targetPath: string | undefined;
  let parentPath: string | undefined;
  
  if (body.path) {
    targetPath = body.path;
    parentPath = body.parent; // Support parent parameter like mock server
  } else if (body.items && Array.isArray(body.items) && body.items.length > 0) {
    // Support items array format (for batch operations)
    targetPath = 'path' in body.items[0] ? body.items[0].path : undefined;
    parentPath = 'parent' in body.items[0] ? body.items[0].parent : undefined;
  }

  if (!targetPath) {
    res.status(400).json({ message: 'path is required' });
    return;
  }

  // Resolve path (matching mock server logic)
  let resolvedPath: string;
  let targetName: string;
  let actualParentPath: string;

  if (parentPath) {
    // Parent + name format (e.g., parent: "/Documents", path: "NewFolder")
    actualParentPath = parentPath.startsWith('/') ? parentPath : '/' + parentPath;
    targetName = targetPath; // In this case, path is the name
    resolvedPath = actualParentPath === '/' ? `/${targetName}` : `${actualParentPath}/${targetName}`;
  } else {
    // Full path format (e.g., path: "/Documents/NewFolder")
    // Extract parent and basename like mock server does
    resolvedPath = targetPath.startsWith('/') ? targetPath : '/' + targetPath;
    const pathParts = resolvedPath.split('/').filter(p => p);
    targetName = pathParts.pop() || '';
    actualParentPath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
    resolvedPath = actualParentPath === '/' ? `/${targetName}` : `${actualParentPath}/${targetName}`;
  }

  // Handle ~ (home directory) and wallet-relative paths (matching mock server)
  if (resolvedPath.startsWith('~/')) {
    resolvedPath = resolvedPath.replace('~/', `/${req.user.wallet_address}/`);
    const pathParts = resolvedPath.split('/').filter(p => p);
    targetName = pathParts.pop() || '';
    actualParentPath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
  }
  if (actualParentPath.startsWith('~/')) {
    actualParentPath = actualParentPath.replace('~/', `/${req.user.wallet_address}/`);
    resolvedPath = `${actualParentPath}/${targetName}`;
  }
  // If path is relative (doesn't start with /), assume it's relative to wallet home
  if (!resolvedPath.startsWith('/')) {
    resolvedPath = `/${req.user.wallet_address}/${resolvedPath}`;
    const pathParts = resolvedPath.split('/').filter(p => p);
    targetName = pathParts.pop() || '';
    actualParentPath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
  }
  // If path starts with / but doesn't include wallet address, check if it's a standard directory
  else if (resolvedPath.startsWith('/') && !resolvedPath.startsWith(`/${req.user.wallet_address}/`)) {
    const firstPart = resolvedPath.split('/').filter(p => p)[0];
    const standardDirs = ['Desktop', 'Documents', 'Public', 'Pictures', 'Videos', 'Trash'];
    if (standardDirs.includes(firstPart)) {
      resolvedPath = `/${req.user.wallet_address}${resolvedPath}`;
      const pathParts = resolvedPath.split('/').filter(p => p);
      targetName = pathParts.pop() || '';
      actualParentPath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
    }
  }

  // Normalize paths
  resolvedPath = resolvedPath.replace(/\/+/g, '/');
  actualParentPath = actualParentPath.replace(/\/+/g, '/');

  logger.info('[Mkdir] Creating directory', {
    originalPath: body.path,
    resolvedPath,
    wallet: req.user.wallet_address
  });

  try {
    const metadata = await filesystem.createDirectory(resolvedPath, req.user.wallet_address);

    logger.info('[Mkdir] Directory created successfully', {
      path: metadata.path,
      is_public: metadata.is_public,
      is_dir: metadata.is_dir
    });

    // Broadcast item.added event (matching mock server - frontend expects this)
    if (io) {
      const pathParts = metadata.path.split('/').filter(p => p);
      pathParts.pop(); // Remove directory name
      const dirpath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
      const dirUid = `uuid-${metadata.path.replace(/\//g, '-')}`;
      
      broadcastItemAdded(io, req.user.wallet_address, {
        uid: dirUid,
        uuid: dirUid,
        name: targetName,
        path: metadata.path,
        dirpath: dirpath,
        size: 0,
        type: null,
        mime_type: undefined,
        is_dir: true,
        created: new Date(metadata.created_at).toISOString(),
        modified: new Date(metadata.updated_at).toISOString()
      });
    }

    // Return directory metadata
    const dirStat: FileStat & { is_public?: boolean } = {
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
    
    // Add is_public if it exists (for frontend to determine shared status)
    if ('is_public' in metadata) {
      dirStat.is_public = metadata.is_public;
      logger.info('[Mkdir] Directory is_public:', metadata.is_public);
    }

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
  const body = req.body as any;

  logger.info('[Delete] Request received', {
    bodyKeys: Object.keys(body || {}),
    hasPaths: !!body.paths,
    hasPath: !!body.path,
    hasItems: !!body.items,
    bodyPreview: JSON.stringify(body).substring(0, 200)
  });

  if (!filesystem) {
    res.status(500).json({ error: 'Filesystem not initialized' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Support multiple formats (matching mock server):
  // 1. { paths: "/path/to/file" } or { paths: ["/path1", "/path2"] } - Mock server format
  // 2. { path: "/path/to/file" } - Single path format
  // 3. { items: [{ path: "..." }] } - Puter SDK format
  let pathsToDelete: string[] = [];
  
  if (body.paths) {
    // Mock server format: { paths: "/path/to/file" } or { paths: ["/path1", "/path2"] }
    if (typeof body.paths === 'string') {
      pathsToDelete = [body.paths];
    } else if (Array.isArray(body.paths)) {
      pathsToDelete = body.paths;
    } else {
      res.status(400).json({ error: 'paths must be a string or array' });
      return;
    }
  } else if (body.path) {
    // Single path format: { path: "/path/to/file" }
    pathsToDelete = [body.path];
  } else if (body.items && Array.isArray(body.items) && body.items.length > 0) {
    // Puter SDK format: { items: [{ path: "..." }] }
    pathsToDelete = body.items.map((item: any) => {
      // Support both { path: "..." } and { uid: "uuid-..." } formats
      if ('path' in item) {
        return item.path;
      } else if ('uid' in item) {
        // Convert UUID to path (uuid-/path/to/file -> /path/to/file)
        const uuidPath = item.uid.replace(/^uuid-/, '');
        return '/' + uuidPath.replace(/-/g, '/');
      }
      return null;
    }).filter((p: any): p is string => p !== null);
  } else {
    logger.warn('[Delete] Invalid request format', { bodyKeys: Object.keys(body || {}) });
    res.status(400).json({ error: 'Missing paths, path, or items array' });
    return;
  }

  if (pathsToDelete.length === 0) {
    res.status(400).json({ error: 'No valid paths to delete' });
    return;
  }

  try {
    const deleted: Array<{ path: string; success: boolean; error?: string }> = [];
    const walletAddress = req.user.wallet_address;
    const trashPath = `/${walletAddress}/Trash`;

    // Ensure Trash directory exists
    try {
      await filesystem.createDirectory(trashPath, walletAddress);
    } catch (error) {
      // Trash might already exist, that's fine
      logger.info('[Delete] Trash directory check', { error: error instanceof Error ? error.message : 'Unknown' });
    }

    for (const pathInput of pathsToDelete) {
      if (!pathInput || pathInput === '/') {
        deleted.push({ path: pathInput || 'unknown', success: false, error: 'Invalid path' });
        continue;
      }

      try {
        // Handle UUID-based paths (Puter uses UUIDs for file identification)
        let actualPath = pathInput;
        
        // If path is a UUID, convert it to actual path
        if (pathInput.startsWith('uuid-') || pathInput.includes('uuid-')) {
          logger.info('[Delete] Path is UUID, converting to path', { uuid: pathInput });
          
          // Convert UUID to path: uuid-/path/to/file -> /path/to/file
          const uuidPath = pathInput.replace(/^uuid-+/, ''); // Remove uuid- prefix (handle multiple dashes)
          let potentialPath = '/' + uuidPath.replace(/-/g, '/');
          
          // Remove leading wallet address if present (UUID might include it)
          // UUID format: uuid-0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3-Desktop-file.jpg
          // Path format: /0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3/Desktop/file.jpg
          const pathParts = potentialPath.split('/').filter(p => p);
          if (pathParts.length > 0 && pathParts[0].startsWith('0x')) {
            // First part is wallet address, keep it
            potentialPath = '/' + pathParts.join('/');
          }
          
          // Verify the path exists
          const metadata = filesystem.getFileMetadata(potentialPath, walletAddress);
          if (metadata) {
            actualPath = metadata.path;
            logger.info('[Delete] Resolved UUID to path', { uuid: pathInput, path: actualPath });
          } else {
            // Try searching by UUID pattern in all user files
            // Search from user's root directory
            const userRoot = `/${walletAddress}`;
            const searchForFileByUuid = (dirPath: string): string | null => {
              try {
                const files = filesystem.listDirectory(dirPath, walletAddress);
                for (const file of files) {
                  const fileUid = `uuid-${file.path.replace(/\//g, '-')}`;
                  if (fileUid === pathInput || fileUid.toLowerCase() === pathInput.toLowerCase()) {
                    return file.path;
                  }
                  // Recursively search subdirectories
                  if (file.is_dir) {
                    const found = searchForFileByUuid(file.path);
                    if (found) return found;
                  }
                }
              } catch (error) {
                // Directory might not exist, continue
              }
              return null;
            };
            
            const foundPath = searchForFileByUuid(userRoot);
            if (foundPath) {
              actualPath = foundPath;
              logger.info('[Delete] Found file by UUID search', { uuid: pathInput, path: actualPath });
            } else {
              // Use the converted path and let it fail if not found
              actualPath = potentialPath;
              logger.warn('[Delete] UUID conversion may be incorrect, file not found', { uuid: pathInput, convertedPath: actualPath });
            }
          }
        }
        
        // Normalize path
        const path = actualPath.startsWith('/') ? actualPath : '/' + actualPath;
        
        // Check if file is already in Trash - if so, permanently delete
        if (path.includes('/Trash/') || path.includes('/Trash')) {
          // Permanently delete from Trash
          await filesystem.deleteFile(path, walletAddress);
          deleted.push({ path, success: true });

          // Broadcast item.removed event
          if (io) {
            const fileUid = `uuid-${path.replace(/\//g, '-')}`;
            broadcastItemRemoved(io, walletAddress, {
              path: path,
              uid: fileUid,
              original_client_socket_id: null
            });
          }
          
          logger.info('[Delete] Permanently deleted from Trash', { path });
        } else {
          // Move to Trash (not permanently delete)
          const metadata = filesystem.getFileMetadata(path, walletAddress);
          if (!metadata) {
            deleted.push({ path, success: false, error: 'File not found' });
            continue;
          }

          // Get filename and check for duplicates in Trash
          const fileName = path.split('/').pop() || 'untitled';
          let trashFileName = fileName;
          
          // Check if file with same name already exists in Trash
          try {
            const trashFiles = filesystem.listDirectory(trashPath, walletAddress);
            const existingInTrash = trashFiles.find(f => f.path === `${trashPath}/${fileName}`);
            
            if (existingInTrash) {
              // Add timestamp suffix to make it unique
              const lastDot = fileName.lastIndexOf('.');
              const hasExtension = lastDot > 0;
              const baseName = hasExtension ? fileName.substring(0, lastDot) : fileName;
              const extension = hasExtension ? fileName.substring(lastDot) : '';
              const timestamp = Date.now();
              trashFileName = `${baseName} (${timestamp})${extension}`;
            }
          } catch (error) {
            // Trash might be empty, that's fine
            logger.info('[Delete] Checking Trash for duplicates', { error: error instanceof Error ? error.message : 'Unknown' });
          }

          const trashFilePath = `${trashPath}/${trashFileName}`;

          // Move file to Trash
          const movedMetadata = await filesystem.moveFile(path, trashFilePath, walletAddress);
          deleted.push({ path, success: true });

          // Broadcast item.removed from original location
          if (io) {
            const fileUid = `uuid-${path.replace(/\//g, '-')}`;
            broadcastItemRemoved(io, walletAddress, {
              path: path,
              uid: fileUid,
              original_client_socket_id: null
            });
          }

          // Broadcast item.added to Trash location
          if (io) {
            const trashFileUid = `uuid-${trashFilePath.replace(/\//g, '-')}`;
            const pathParts = trashFilePath.split('/').filter(p => p);
            pathParts.pop(); // Remove filename
            const dirpath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
            
            broadcastItemAdded(io, walletAddress, {
              uid: trashFileUid,
              uuid: trashFileUid,
              name: fileName, // Display original name (not the unique filename with timestamp)
              path: trashFilePath,
              dirpath: dirpath,
              size: movedMetadata.size,
              type: movedMetadata.mime_type || null,
              mime_type: movedMetadata.mime_type || undefined,
              is_dir: movedMetadata.is_dir,
              created: new Date(movedMetadata.created_at).toISOString(),
              modified: new Date(movedMetadata.updated_at).toISOString(),
              original_client_socket_id: null
            });
          }

          logger.info('[Delete] Moved to Trash', { from: path, to: trashFilePath, originalName: fileName });
        }
      } catch (error) {
        // Use pathInput as fallback since actualPath might not be set if error occurred early
        const errorPath = typeof pathInput === 'string' ? pathInput : 'unknown';
        deleted.push({
          path: errorPath,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        logger.error('[Delete] Error processing delete request', {
          path: errorPath,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Return format matching mock server
    // Mock server returns empty object {} for success
    // But we'll return more detailed info for debugging
    const allSuccessful = deleted.every(d => d.success);
    const allFailed = deleted.every(d => !d.success);
    
    if (allSuccessful) {
      // All successful - return empty object (matching mock server)
      res.json({});
    } else if (allFailed) {
      // All failed - return error
      res.status(404).json({ 
        error: 'Failed to delete files',
        deleted: deleted
      });
    } else {
      // Mixed results - return details
      res.json({ deleted });
    }
    
    logger.info('[Delete] Completed', { 
      total: pathsToDelete.length, 
      successful: deleted.filter(d => d.success).length,
      failed: deleted.filter(d => !d.success).length
    });
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
  const body = req.body as any;

  if (!filesystem) {
    res.status(500).json({ error: 'Filesystem not initialized' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Support multiple formats (matching mock server):
  // 1. { source: "uuid-...", destination: "/path", new_name: "..." } - Puter SDK format (most common)
  // 2. { from: "...", to: "..." } - Alternative format
  // 3. { items: [...], destination: "..." } - Batch format
  let fromPath: string | undefined;
  let toPath: string | undefined;
  let newName: string | undefined;
  
  // Log incoming request for debugging
  logger.info('[Move] Request received', {
    bodyKeys: Object.keys(body || {}),
    hasSource: !!body.source,
    hasFrom: !!body.from,
    hasItems: !!body.items,
    source: body.source ? String(body.source).substring(0, 50) : undefined,
    destination: body.destination ? String(body.destination).substring(0, 50) : undefined
  });

  if (body.source) {
    // Puter SDK format: { source: "uuid-..." or "/path", destination: "/path", newName: "..." }
    fromPath = body.source;
    toPath = body.destination || body.dest || body.to;
    newName = body.newName || body.new_name || body.name; // Support both camelCase and snake_case
  } else if (body.from && body.to) {
    // Alternative format: { from: "/old/path", to: "/new/path" }
    fromPath = body.from;
    toPath = body.to;
  } else if (body.items && Array.isArray(body.items) && body.items.length > 0 && body.destination) {
    // Batch format: { items: [{ path: "..." }], destination: "..." }
    const firstItem = body.items[0];
    fromPath = 'path' in firstItem ? firstItem.path : undefined;
    toPath = body.destination;
  } else {
    logger.warn('[Move] Invalid request format', { bodyKeys: Object.keys(body || {}) });
    res.status(400).json({ error: 'Missing source/from or destination/to' });
    return;
  }

  if (!fromPath || !toPath) {
    logger.warn('[Move] Missing paths', { fromPath, toPath });
    res.status(400).json({ error: 'Invalid paths' });
    return;
  }

  // Handle UUID source (convert uuid-/path/to/file to /path/to/file)
  let originalFileName: string | undefined;
  if (fromPath.startsWith('uuid-')) {
    // UUID format: uuid-{path-with-slashes-replaced-with-dashes}
    // Problem: Filenames can contain dashes, so we can't just replace all dashes with slashes
    // Solution: Search all files recursively and match by UUID
    // UUID is generated as: uuid-${path.replace(/\//g, '-')}
    
    const walletAddress = req.user.wallet_address;
    const userRoot = `/${walletAddress}`;
    
    // Get ALL files recursively (not just direct children) using database directly
    const db = (req.app.locals.db as any);
    if (db && typeof db.listFiles === 'function') {
      // Use database directly to get all files for this user (recursive)
      const allFiles = db.listFiles(userRoot, walletAddress) as FileMetadata[];
      
      // Find file whose UUID matches exactly
      let foundMetadata: FileMetadata | null = null;
      for (const file of allFiles) {
        // Generate UUID the same way the frontend does: uuid-${path.replace(/\//g, '-')}
        const fileUuid = `uuid-${file.path.replace(/\//g, '-')}`;
        if (fileUuid === fromPath) {
          foundMetadata = file;
          break;
        }
      }
      
      if (foundMetadata) {
        fromPath = foundMetadata.path;
        originalFileName = foundMetadata.path.split('/').pop() || undefined;
        logger.info('[Move] Found file by UUID lookup', { uuid: fromPath, path: foundMetadata.path, fileName: originalFileName });
      } else {
        logger.error('[Move] UUID not found in database', { 
          uuid: fromPath, 
          searchedFiles: allFiles.length,
          samplePaths: allFiles.slice(0, 5).map(f => f.path),
          sampleUuids: allFiles.slice(0, 5).map(f => `uuid-${f.path.replace(/\//g, '-')}`)
        });
        // Will fail later with better error
      }
    } else {
      logger.error('[Move] Database not available for UUID lookup', { uuid: fromPath, hasDb: !!db });
    }
  } else {
    // Extract filename from non-UUID path
    originalFileName = fromPath.split('/').pop() || undefined;
  }

  // Resolve paths (handle ~ and relative paths)
  if (fromPath.startsWith('~')) {
    fromPath = fromPath.replace('~', `/${req.user.wallet_address}`);
  } else if (!fromPath.startsWith('/')) {
    fromPath = `/${req.user.wallet_address}/${fromPath}`;
  }
  
  if (toPath.startsWith('~')) {
    toPath = toPath.replace('~', `/${req.user.wallet_address}`);
  } else if (!toPath.startsWith('/')) {
    toPath = `/${req.user.wallet_address}/${toPath}`;
  }
  
  // Handle newName parameter (if provided, use it instead of original filename)
  // BUT: If destination is Trash OR newName looks like a UUID, ignore newName and use original filename
  // IMPORTANT: Check for /Trash/ (with slash) to avoid false positives (e.g., if wallet address contains "Trash")
  const isMovingToTrash = toPath.includes('/Trash/') || toPath.endsWith('/Trash') || toPath === '/Trash' || 
                          toPath === `/${req.user.wallet_address}/Trash` || 
                          toPath === `/${req.user.wallet_address}/Trash/`;
  const newNameIsUuid = newName && (newName.startsWith('uuid-') || newName.includes('uuid-'));
  
  logger.info('[Move] Move operation details', {
    fromPath,
    toPath,
    isMovingToTrash,
    newName,
    newNameIsUuid,
    originalFileName,
    wallet: req.user.wallet_address
  });
  
  // For Trash moves, ensure destination is treated as a directory
  if (isMovingToTrash) {
    // Ensure Trash directory exists
    const trashDirPath = toPath.includes('/Trash') 
      ? toPath.substring(0, toPath.indexOf('/Trash') + 6) // Get path up to and including /Trash
      : `/${req.user.wallet_address}/Trash`;
    
    try {
      await filesystem.createDirectory(trashDirPath, req.user.wallet_address);
      logger.info('[Move] Trash directory ensured', { trashDirPath });
    } catch (error) {
      // Trash might already exist, that's fine
      logger.info('[Move] Trash directory check', { error: error instanceof Error ? error.message : 'Unknown' });
    }
    
    // Normalize Trash path: ensure it ends with / and is the full path
    if (!toPath.endsWith('/')) {
      toPath = `${toPath}/`;
    }
    
    // Use original filename for Trash moves, but check for duplicates
    let trashFileName = originalFileName || 'untitled';
    if (originalFileName) {
      // Check if file with same name already exists in Trash
      try {
        const trashFiles = filesystem.listDirectory(trashDirPath, req.user.wallet_address);
        const existingInTrash = trashFiles.find(f => {
          const fileName = f.path.split('/').pop() || '';
          return fileName === originalFileName;
        });
        
        if (existingInTrash) {
          // Add timestamp suffix to make it unique (same logic as handleDelete)
          const lastDot = originalFileName.lastIndexOf('.');
          const hasExtension = lastDot > 0;
          const baseName = hasExtension ? originalFileName.substring(0, lastDot) : originalFileName;
          const extension = hasExtension ? originalFileName.substring(lastDot) : '';
          const timestamp = Date.now();
          trashFileName = `${baseName} (${timestamp})${extension}`;
          logger.info('[Move] Duplicate filename in Trash, using timestamp suffix', {
            originalFileName,
            trashFileName,
            existingPath: existingInTrash.path
          });
        }
      } catch (error) {
        // Trash might be empty or error checking, that's fine - use original filename
        logger.info('[Move] Error checking Trash for duplicates', { 
          error: error instanceof Error ? error.message : 'Unknown' 
        });
      }
      
      toPath = `${toPath}${trashFileName}`;
    }
    logger.info('[Move] Moving to Trash with filename', { 
      originalFileName, 
      trashFileName,
      finalToPath: toPath,
      destinationBefore: body.destination,
      trashDirPath
    });
  } else if (newName && !newNameIsUuid) {
    // Regular move with newName (not Trash, not UUID)
    const destinationIsDir = toPath.endsWith('/') || toPath === '/';
    if (destinationIsDir) {
      toPath = `${toPath}${newName}`;
    } else {
      // If toPath is a file path, replace the filename
      const parentDir = toPath.substring(0, toPath.lastIndexOf('/')) || '/';
      toPath = parentDir === '/' ? `/${newName}` : `${parentDir}/${newName}`;
    }
    logger.info('[Move] Using newName', { newName, finalToPath: toPath });
  } else if (newNameIsUuid && originalFileName) {
    // newName is UUID but not moving to Trash - use original filename
    const destinationIsDir = toPath.endsWith('/') || toPath === '/';
    if (destinationIsDir) {
      toPath = `${toPath}${originalFileName}`;
    } else {
      const parentDir = toPath.substring(0, toPath.lastIndexOf('/')) || '/';
      toPath = parentDir === '/' ? `/${originalFileName}` : `${parentDir}/${originalFileName}`;
    }
    logger.info('[Move] Using original filename (UUID newName)', { 
      originalFileName, 
      finalToPath: toPath,
      newName 
    });
  }

  try {
    // Verify source file exists before attempting move
    const sourceMetadata = filesystem.getFileMetadata(fromPath, req.user.wallet_address);
    if (!sourceMetadata) {
      // List directory contents to help debug
      const parentDir = fromPath.substring(0, fromPath.lastIndexOf('/')) || '/';
      const parentContents = filesystem.listDirectory(parentDir, req.user.wallet_address);
      logger.error('[Move] Source file not found', {
        fromPath,
        parentDir,
        parentContentsCount: parentContents.length,
        parentContents: parentContents.map(f => f.path).slice(0, 10)
      });
      res.status(404).json({ 
        error: 'File not found', 
        message: `Source file not found: ${fromPath}`,
        parentDir,
        availableFiles: parentContents.map(f => ({ path: f.path, name: f.path.split('/').pop() }))
      });
      return;
    }

    // Calculate new path (handle rename vs move)
    // If we already set toPath for Trash moves, use it directly
    let newPath: string;
    if (isMovingToTrash && toPath && originalFileName) {
      // We already calculated the full Trash path above
      newPath = toPath;
    } else {
      // Check if destination is a directory by checking the database
      // This is more reliable than just checking if path ends with '/'
      const destinationMetadata = filesystem.getFileMetadata(toPath, req.user.wallet_address);
      const destinationIsDir = destinationMetadata?.is_dir || toPath.endsWith('/') || toPath === '/';
      
      const fileName = originalFileName || fromPath.split('/').pop() || '';
      
      if (destinationIsDir) {
        // Destination is a directory - append filename
        newPath = toPath.endsWith('/') 
          ? `${toPath}${fileName}`
          : `${toPath}/${fileName}`;
      } else {
        // Destination is a file path (rename operation)
        newPath = toPath;
      }
      
      logger.info('[Move] Calculated new path', {
        toPath,
        destinationIsDir,
        destinationMetadata: destinationMetadata ? { path: destinationMetadata.path, is_dir: destinationMetadata.is_dir } : null,
        fileName,
        calculatedNewPath: newPath
      });
    }

    logger.info('[Move] Moving file/directory', {
      from: fromPath,
      to: newPath,
      toPathBeforeCalc: toPath,
      isMovingToTrash,
      fileName: originalFileName || fromPath.split('/').pop() || '',
      originalFileName,
      sourceExists: !!sourceMetadata
    });

    const metadata = await filesystem.moveFile(fromPath, newPath, req.user.wallet_address);

    logger.info('[Move] File/directory moved successfully', {
      from: fromPath,
      to: newPath
    });

    // Broadcast events for move operation
    // For Trash moves: emit item.removed from Desktop AND item.added to Trash (matching mock server)
    // For regular moves: emit item.moved
    logger.info('[Move] Broadcasting events', {
      hasIO: !!io,
      isMovingToTrash,
      wallet: req.user.wallet_address
    });
    
    if (io) {
      if (isMovingToTrash) {
        // Emit item.removed from original location (Desktop)
        const oldFileUid = `uuid-${fromPath.replace(/\//g, '-')}`;
        logger.info('[Move] Broadcasting item.removed', {
          path: fromPath,
          uid: oldFileUid,
          wallet: req.user.wallet_address
        });
        broadcastItemRemoved(io, req.user.wallet_address, {
          path: fromPath,
          uid: oldFileUid,
          descendants_only: false,
          original_client_socket_id: null
        });
        
        // Emit item.added to Trash location (matching mock server format)
        const newFileUid = `uuid-${newPath.replace(/\//g, '-')}`;
        const trashDirPath = newPath.substring(0, newPath.lastIndexOf('/')) || '/';
        const fileName = metadata.path.split('/').pop() || '';
        
        logger.info('[Move] Broadcasting item.added to Trash', {
          path: newPath,
          dirpath: trashDirPath,
          uid: newFileUid,
          wallet: req.user.wallet_address
        });
        broadcastItemAdded(io, req.user.wallet_address, {
          uid: newFileUid,
          uuid: newFileUid,
          name: originalFileName || fileName, // Use original filename for display
          path: newPath,
          dirpath: trashDirPath,
          size: metadata.size,
          type: metadata.mime_type || null,
          mime_type: metadata.mime_type || undefined,
          is_dir: metadata.is_dir,
          created: new Date(metadata.created_at).toISOString(),
          modified: new Date(metadata.updated_at).toISOString(),
          original_client_socket_id: null
        });
      } else {
        // Regular move: emit item.moved
        const fileUid = `uuid-${newPath.replace(/\//g, '-')}`;
        const fileName = metadata.path.split('/').pop() || '';
        logger.info('[Move] Broadcasting item.moved', {
          from: fromPath,
          to: newPath,
          uid: fileUid,
          wallet: req.user.wallet_address
        });
        // Get thumbnail if available (for image files)
        const thumbnail = metadata.thumbnail || undefined;
        
        broadcastItemMoved(io, req.user.wallet_address, {
          uid: fileUid,
          path: newPath,
          old_path: fromPath,
          name: fileName,
          // Frontend expects these fields at top level, not just in metadata
          is_dir: metadata.is_dir,
          size: metadata.size || 0,
          type: metadata.mime_type || null,
          modified: new Date(metadata.updated_at).toISOString(),
          thumbnail: thumbnail, // Include thumbnail for proper icon display
          metadata: {
            size: metadata.size,
            mime_type: metadata.mime_type || undefined,
            is_dir: metadata.is_dir,
            thumbnail: thumbnail // Also include in metadata for fallback
          },
          original_client_socket_id: null
        });
      }
    } else {
      logger.warn('[Move] WebSocket io not available, events not broadcast', {
        wallet: req.user.wallet_address
      });
    }

    // Return format matching mock server: { success: true, from, to }
    res.json({ success: true, from: fromPath, to: newPath });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Move] Move error:', {
      error: errorMessage,
      fromPath,
      toPath: body.destination,
      isMovingToTrash,
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Check if it's a "destination already exists" error - return 409 Conflict
    if (errorMessage.includes('Destination already exists')) {
      res.status(409).json({
        error: 'Destination already exists',
        message: errorMessage,
        from: fromPath,
        to: toPath
      });
    } else {
      res.status(500).json({
        error: 'Failed to move files',
        message: errorMessage
      });
    }
  }
}

/**
 * Rename files/directories
 * POST /rename
 */
export async function handleRename(req: AuthenticatedRequest, res: Response): Promise<void> {
  const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
  const io = (req.app.locals.io as SocketIOServer | undefined);
  const body = req.body as any;

  if (!filesystem) {
    res.status(500).json({ error: 'Filesystem not initialized' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Puter rename endpoint expects: path (or uid) and new_name
  const filePath = body.path || body.uid;
  const newName = body.new_name;

  if (!filePath) {
    res.status(400).json({ error: 'path or uid is required' });
    return;
  }

  if (!newName) {
    res.status(400).json({ error: 'new_name is required' });
    return;
  }

  if (typeof newName !== 'string') {
    res.status(400).json({ error: 'new_name must be a string' });
    return;
  }

  // Validate filename (basic validation - no slashes, null bytes, etc.)
  if (newName.includes('/') || newName.includes('\0') || newName.trim() === '') {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  try {
    // Handle UUID-based path lookup (matching mock server behavior)
    let resolvedPath: string;
    
    if (filePath.startsWith('uuid-') || filePath.includes('uuid-')) {
      // UUID format: uuid-${path.replace(/\//g, '-')}
      // Example: uuid--0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3-Desktop-New Folder
      // Reverse: /0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3/Desktop/New Folder
      logger.info('[Rename] Path is UUID, converting to path', { uid: filePath });
      
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Search all files for matching UUID (more reliable than reverse-engineering)
      // UUID format matches: uuid-${path.replace(/\//g, '-')}
      const searchAllFiles = (dirPath: string): FileMetadata | null => {
        try {
          const files = filesystem.listDirectory(dirPath, req.user!.wallet_address);
          for (const file of files) {
            const fileUuid = `uuid-${file.path.replace(/\//g, '-')}`;
            if (fileUuid === filePath || fileUuid.toLowerCase() === filePath.toLowerCase()) {
              return file;
            }
            // Recursively search subdirectories
            if (file.is_dir) {
              const found = searchAllFiles(file.path);
              if (found) return found;
            }
          }
        } catch (error) {
          // Directory might not exist, continue
        }
        return null;
      };
      
      const matchingFile = searchAllFiles(`/${req.user.wallet_address}`);
      
      if (!matchingFile) {
        logger.warn('[Rename] File not found by UUID', { uid: filePath });
        res.status(404).json({ error: 'File not found by UUID' });
        return;
      }
      
      resolvedPath = matchingFile.path;
      logger.info('[Rename] Found file by UUID', { uid: filePath, path: resolvedPath });
    } else {
      // Regular path
      resolvedPath = filePath;
      if (resolvedPath.startsWith('~')) {
        resolvedPath = resolvedPath.replace('~', `/${req.user.wallet_address}`);
      } else if (!resolvedPath.startsWith('/')) {
        resolvedPath = `/${req.user.wallet_address}/${resolvedPath}`;
      }
    }

    // Extract parent path and construct new path
    const pathParts = resolvedPath.split('/').filter((p: string) => p);
    const parentPath = pathParts.length > 1 
      ? '/' + pathParts.slice(0, -1).join('/')
      : '/';
    const newPath = parentPath === '/' ? `/${newName}` : `${parentPath}/${newName}`;

    logger.info('[Rename] Renaming file/directory', {
      from: resolvedPath,
      to: newPath,
      newName
    });

    // Use moveFile to rename (same operation)
    const metadata = await filesystem.moveFile(resolvedPath, newPath, req.user.wallet_address);

    logger.info('[Rename] File/directory renamed successfully', {
      from: resolvedPath,
      to: newPath
    });

    // Broadcast rename event using item.renamed (matching mock server and frontend expectations)
    if (io) {
      // Get socket ID from request if available (for excluding original client)
      const socketId = (req as any).socketId || undefined;
      
      broadcastItemRenamed(io, req.user.wallet_address, {
        uid: `uuid-${newPath.replace(/\//g, '-')}`,
        name: newName,
        path: newPath,
        old_path: resolvedPath,
        is_dir: metadata.is_dir,
        type: metadata.mime_type || null,
        original_client_socket_id: socketId
      });
    }

    // Return format matching mock server
    const response = {
      uid: `uuid-${newPath.replace(/\//g, '-')}`,
      name: newName,
      is_dir: metadata.is_dir,
      path: newPath,
      old_path: resolvedPath,
      type: metadata.mime_type || null
    };

    res.json(response);
  } catch (error) {
    logger.error('Rename error:', error instanceof Error ? error.message : 'Unknown error');
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: 'File not found' });
    } else {
      res.status(500).json({
        error: 'Failed to rename file',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

