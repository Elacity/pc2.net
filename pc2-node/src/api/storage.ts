/**
 * Storage API Endpoint
 * 
 * Provides storage usage statistics including IPFS CID data
 */

import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from './middleware.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/storage/usage
 * Returns storage usage statistics including IPFS CID information
 */
router.get('/usage', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = req.app.locals.db;
    const userAddress = req.user?.wallet_address;

    if (!userAddress) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    // Get total storage used
    const totalResult = db.queryOne(`
      SELECT 
        COALESCE(SUM(size), 0) as total_size,
        COUNT(*) as file_count,
        COUNT(CASE WHEN ipfs_hash IS NOT NULL THEN 1 END) as files_with_cid
      FROM files
      WHERE wallet_address = ? AND is_dir = 0
    `, userAddress) as { total_size: number; file_count: number; files_with_cid: number };

    // Get storage by file type
    const byTypeResult = db.query(`
      SELECT 
        CASE 
          WHEN mime_type LIKE 'image/%' THEN 'image'
          WHEN mime_type LIKE 'video/%' THEN 'video'
          WHEN mime_type LIKE 'audio/%' THEN 'audio'
          WHEN mime_type LIKE 'application/pdf' THEN 'pdf'
          WHEN mime_type LIKE 'text/%' OR mime_type LIKE 'application/javascript' OR mime_type LIKE 'application/json' THEN 'document'
          WHEN mime_type LIKE 'application/zip' OR mime_type LIKE 'application/x-%' THEN 'archive'
          ELSE 'other'
        END as type,
        COALESCE(SUM(size), 0) as total_size,
        COUNT(*) as file_count,
        COUNT(CASE WHEN ipfs_hash IS NOT NULL THEN 1 END) as files_with_cid
      FROM files
      WHERE wallet_address = ? AND is_dir = 0
      GROUP BY type
      ORDER BY total_size DESC
    `, userAddress) as Array<{ type: string; total_size: number; file_count: number; files_with_cid: number }>;

    // Get largest files with IPFS CIDs
    const largestFiles = db.query(`
      SELECT 
        path,
        size,
        mime_type as type,
        ipfs_hash,
        updated_at as modified
      FROM files
      WHERE wallet_address = ? AND is_dir = 0
      ORDER BY size DESC
      LIMIT 10
    `, userAddress) as Array<{
      path: string;
      size: number;
      type: string | null;
      ipfs_hash: string | null;
      modified: number;
    }>;

    // Get unused files (not accessed in 30 days) - note: we don't track last_accessed yet
    // For now, use files older than 30 days
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const unusedFiles = db.query(`
      SELECT 
        path,
        size,
        mime_type as type,
        ipfs_hash,
        updated_at as modified
      FROM files
      WHERE wallet_address = ? 
        AND is_dir = 0
        AND updated_at < ?
      ORDER BY size DESC
      LIMIT 20
    `, userAddress, thirtyDaysAgo) as Array<{
      path: string;
      size: number;
      type: string | null;
      ipfs_hash: string | null;
      modified: number;
    }>;

    // Get storage timeline (last 12 months) - group by month
    const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
    const timeline = db.query(`
      SELECT 
        strftime('%Y-%m', datetime(created_at / 1000, 'unixepoch')) as month,
        SUM(size) as monthly_size
      FROM files
      WHERE wallet_address = ?
        AND is_dir = 0
        AND created_at > ?
      GROUP BY month
      ORDER BY month ASC
    `, userAddress, oneYearAgo) as Array<{ month: string; monthly_size: number }>;

    // Get IPFS CID statistics
    const ipfsStats = db.queryOne(`
      SELECT 
        COUNT(*) as total_files,
        COUNT(CASE WHEN ipfs_hash IS NOT NULL THEN 1 END) as files_with_cid,
        COALESCE(SUM(CASE WHEN ipfs_hash IS NOT NULL THEN size ELSE 0 END), 0) as size_with_cid
      FROM files
      WHERE wallet_address = ? AND is_dir = 0
    `, userAddress) as { total_files: number; files_with_cid: number; size_with_cid: number };

    // Extract file names from paths
    const extractFileName = (path: string): string => {
      const parts = path.split('/');
      return parts[parts.length - 1] || path;
    };

    res.json({
      total: {
        size: totalResult.total_size || 0,
        files: totalResult.file_count || 0,
        filesWithCID: totalResult.files_with_cid || 0
      },
      byType: byTypeResult.map(row => ({
        type: row.type || 'unknown',
        size: row.total_size,
        files: row.file_count,
        filesWithCID: row.files_with_cid,
        percentage: totalResult.total_size > 0 
          ? parseFloat(((row.total_size / totalResult.total_size) * 100).toFixed(1))
          : 0
      })),
      largestFiles: largestFiles.map(file => ({
        path: file.path,
        name: extractFileName(file.path),
        size: file.size,
        type: file.type || 'unknown',
        cid: file.ipfs_hash,
        modified: file.modified
      })),
      unusedFiles: unusedFiles.map(file => ({
        path: file.path,
        name: extractFileName(file.path),
        size: file.size,
        type: file.type || 'unknown',
        cid: file.ipfs_hash,
        modified: file.modified
      })),
      timeline: timeline.map(row => ({
        date: row.month,
        size: row.monthly_size
      })),
      ipfs: {
        totalFiles: ipfsStats.total_files,
        filesWithCID: ipfsStats.files_with_cid,
        sizeWithCID: ipfsStats.size_with_cid,
        percentage: ipfsStats.total_files > 0
          ? parseFloat(((ipfsStats.files_with_cid / ipfsStats.total_files) * 100).toFixed(1))
          : 0
      }
    });
  } catch (error) {
    logger.error('[Storage API]: Error getting storage usage:', error);
    res.status(500).json({ error: 'Failed to get storage usage' });
  }
});

/**
 * GET /api/storage/limit
 * Returns the current storage limit setting
 */
router.get('/limit', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = req.app.locals.db;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const limitSetting = db?.getSetting('storage_limit') || 'auto';
    res.json({ limit: limitSetting });
  } catch (error) {
    logger.error('[Storage API]: Error getting storage limit:', error);
    res.status(500).json({ error: 'Failed to get storage limit' });
  }
});

/**
 * POST /api/storage/limit
 * Sets the storage limit preference
 */
router.post('/limit', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = req.app.locals.db;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { limit } = req.body;
    
    // Validate limit value
    const validLimits = ['auto', '10GB', '25GB', '50GB', '100GB', '250GB', '500GB', 'unlimited'];
    if (!validLimits.includes(limit)) {
      return res.status(400).json({ error: 'Invalid limit value', validValues: validLimits });
    }
    
    db?.setSetting('storage_limit', limit);
    
    // Update global config so it takes effect immediately
    if (!(global as any).pc2Config) {
      (global as any).pc2Config = {};
    }
    if (!(global as any).pc2Config.resources) {
      (global as any).pc2Config.resources = {};
    }
    if (!(global as any).pc2Config.resources.storage) {
      (global as any).pc2Config.resources.storage = {};
    }
    (global as any).pc2Config.resources.storage.limit = limit;
    
    logger.info(`[Storage API]: Storage limit set to ${limit}`);
    res.json({ success: true, limit });
  } catch (error) {
    logger.error('[Storage API]: Error setting storage limit:', error);
    res.status(500).json({ error: 'Failed to set storage limit' });
  }
});

// ============================================================================
// IPFS Settings & Sharing Endpoints
// ============================================================================

/**
 * GET /api/ipfs/settings
 * Returns IPFS network settings and sharing statistics
 */
router.get('/ipfs/settings', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = req.app.locals.db;
    const ipfs = req.app.locals.ipfs;
    const walletAddress = req.user?.wallet_address;

    if (!walletAddress) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get IPFS settings from database (defaults: hybrid mode, auto-announce enabled)
    const settings = {
      mode: db?.getSetting(`${walletAddress}:ipfs_mode`) || 'hybrid',
      autoAnnouncePublic: db?.getSetting(`${walletAddress}:ipfs_auto_announce`) !== 'false',
      enableBootstrap: db?.getSetting(`${walletAddress}:ipfs_bootstrap`) !== 'false',
    };

    // Get IPFS stats if available
    let ipfsStats = null;
    if (ipfs) {
      const announcementStats = ipfs.getAnnouncementStats();
      const networkStats = await ipfs.getNetworkStats();
      
      ipfsStats = {
        ...announcementStats,
        peerId: networkStats.peerId,
        addresses: networkStats.addresses,
      };
    }

    // Get public file statistics
    const publicCIDCount = db?.getPublicCIDCount() || 0;

    res.json({
      settings,
      ipfs: ipfsStats,
      publicFiles: {
        uniqueCIDs: publicCIDCount,
      },
    });
  } catch (error) {
    logger.error('[Storage API]: Error getting IPFS settings:', error);
    res.status(500).json({ error: 'Failed to get IPFS settings' });
  }
});

/**
 * POST /api/ipfs/settings
 * Update IPFS network settings
 */
router.post('/ipfs/settings', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = req.app.locals.db;
    const walletAddress = req.user?.wallet_address;

    if (!walletAddress) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { mode, autoAnnouncePublic, enableBootstrap } = req.body;

    // Validate mode
    if (mode !== undefined) {
      const validModes = ['private', 'hybrid', 'public'];
      if (!validModes.includes(mode)) {
        return res.status(400).json({ error: 'Invalid mode', validValues: validModes });
      }
      db?.setSetting(`${walletAddress}:ipfs_mode`, mode);
    }

    // Save other settings
    if (autoAnnouncePublic !== undefined) {
      db?.setSetting(`${walletAddress}:ipfs_auto_announce`, String(autoAnnouncePublic));
    }

    if (enableBootstrap !== undefined) {
      db?.setSetting(`${walletAddress}:ipfs_bootstrap`, String(enableBootstrap));
    }

    logger.info(`[Storage API]: IPFS settings updated for ${walletAddress}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('[Storage API]: Error updating IPFS settings:', error);
    res.status(500).json({ error: 'Failed to update IPFS settings' });
  }
});

/**
 * POST /api/ipfs/announce
 * Manually trigger announcement of all public CIDs to DHT
 */
router.post('/ipfs/announce', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = req.app.locals.db;
    const ipfs = req.app.locals.ipfs;
    const walletAddress = req.user?.wallet_address;

    if (!walletAddress) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!ipfs) {
      return res.status(503).json({ error: 'IPFS not available' });
    }

    if (!ipfs.canAnnounce()) {
      return res.status(400).json({ 
        error: 'DHT announcement not available',
        reason: ipfs.getNetworkMode() === 'private' 
          ? 'IPFS is in private mode' 
          : 'DHT service not initialized'
      });
    }

    // Get all public CIDs
    const publicCIDs = db?.getPublicCIDs() || [];

    if (publicCIDs.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No public files to announce',
        announced: 0,
        failed: 0
      });
    }

    // Announce all public CIDs
    logger.info(`[Storage API]: Starting announcement of ${publicCIDs.length} public CIDs`);
    const result = await ipfs.announceMultipleCIDs(publicCIDs);

    res.json({
      success: true,
      message: `Announced ${result.success} CIDs to DHT`,
      announced: result.success,
      failed: result.failed,
      total: publicCIDs.length
    });
  } catch (error) {
    logger.error('[Storage API]: Error announcing CIDs:', error);
    res.status(500).json({ error: 'Failed to announce CIDs' });
  }
});

/**
 * GET /api/ipfs/network
 * Get IPFS network status and peer information
 */
router.get('/ipfs/network', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ipfs = req.app.locals.ipfs;

    if (!ipfs) {
      return res.status(503).json({ error: 'IPFS not available' });
    }

    const networkStats = await ipfs.getNetworkStats();
    const peers = await ipfs.getConnectedPeers();

    res.json({
      mode: networkStats.mode,
      peerId: networkStats.peerId,
      addresses: networkStats.addresses,
      connectedPeers: networkStats.connectedPeers,
      peerList: peers.slice(0, 20), // Limit to 20 peers for display
    });
  } catch (error) {
    logger.error('[Storage API]: Error getting IPFS network status:', error);
    res.status(500).json({ error: 'Failed to get IPFS network status' });
  }
});

export default router;

