/**
 * Info Endpoints
 * 
 * Additional endpoints needed by the frontend
 */

import { Request, Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';

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
export function handleBatch(req: AuthenticatedRequest, res: Response): void {
  // Batch operations not implemented yet
  res.json({
    results: []
  });
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

