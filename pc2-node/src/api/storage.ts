/**
 * Storage API Endpoint
 * 
 * Provides storage usage statistics including IPFS CID data
 */

import { Router, Response } from 'express';
import { authenticate, requireOwner, AuthenticatedRequest } from './middleware.js';
import { recordTelemetryOnSuccess } from './telemetry.js';
import { logger } from '../utils/logger.js';
import { getEffectiveStorageLimit } from './info.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getWASMRuntime, type RendererCommand } from '../services/wasm/WASMRuntime.js';
import {
  forwardPinToCluster,
  getClusterPinConfig,
  getClusterPinProbeState,
  getClusterPinRetryQueueSnapshot,
  queryClusterPinStatus,
} from '../services/clusterPin.js';
import { getBaseRpcUrl } from '../utils/rpc.js';
import {
  buildDelegationPayload,
  canonicalize,
  verifyDelegationEip191,
  verifyDelegationEip1271,
  verifySecureViewBundle,
  revokeDelegation,
  _getSessionCacheStats,
  MAX_DELEGATION_WINDOW_SECONDS,
  REQUEST_FRESHNESS_WINDOW_SECONDS,
  type SecureViewDelegation,
} from '../utils/secureViewSession.js';

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

    const totalSize = totalResult.total_size || 0;
    const storageLimit = getEffectiveStorageLimit(db);

    res.json({
      total: {
        size: totalSize,
        files: totalResult.file_count || 0,
        filesWithCID: totalResult.files_with_cid || 0
      },
      storageLimit,
      storage: {
        used: totalSize,
        limit: storageLimit,
        available: storageLimit === Number.MAX_SAFE_INTEGER ? storageLimit : Math.max(0, storageLimit - totalSize)
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

    // Phase 2-Globals: the (global as any).pc2Config write previously
    // here is removed. The db.setSetting() above is the actual source
    // of truth; downstream readers (api/info.ts, api/resources.ts) now
    // read from req.app.locals.db.getSetting() directly. See
    // PHASE-2-GLOBALS-CLEANUP ticket §"Global 1" for details.

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
 * POST /api/ipfs/announce/:cid
 * Manually trigger announcement of one CID to DHT
 */
router.post('/ipfs/announce/:cid', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ipfs = req.app.locals.ipfs;
    const rawCid = req.params.cid;

    if (!rawCid || typeof rawCid !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid CID' });
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

    const cid = rawCid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '').split('/')[0];
    if (!cid) {
      return res.status(400).json({ error: 'Invalid CID' });
    }

    logger.info(`[Storage API]: Starting single CID announcement: ${cid}`);
    const announced = await ipfs.announceCID(cid);

    if (!announced) {
      return res.status(500).json({
        success: false,
        cid,
        message: 'CID announcement failed'
      });
    }

    const db = req.app.locals.db;
    try {
      db?.updatePinnedCIDAnnouncedAt(cid);
    } catch (error) {
      logger.warn(`[Storage API]: Failed to update announced timestamp (non-fatal): ${cid}`, error);
    }

    res.json({
      success: true,
      cid,
      message: 'CID announced to DHT'
    });
  } catch (error) {
    logger.error('[Storage API]: Error announcing CID:', error);
    res.status(500).json({ error: 'Failed to announce CID' });
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

/**
 * POST /api/storage/ipfs/reconnect-elacity
 * Manually (re)dial configured Elacity peers. Useful when the startup dial
 * fails or the connection manager evicts the peer under LRU pressure.
 */
router.post('/ipfs/reconnect-elacity', authenticate, requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ipfs = req.app.locals.ipfs;
    if (!ipfs) {
      return res.status(503).json({ error: 'IPFS not available' });
    }
    const outcome = await ipfs.reconnectElacityPeers();
    const status = ipfs.getElacityPeerStatus();
    res.json({
      ...outcome,
      elacityPeered: status.peered,
      matchedPeerIds: status.matchedPeerIds,
    });
  } catch (error: any) {
    logger.error('[Storage API]: Error reconnecting Elacity peers:', error);
    res.status(500).json({ error: error?.message || 'Failed to reconnect Elacity peers' });
  }
});

/**
 * GET /api/storage/ipfs/peers
 * Diagnostic: report whether this node is currently peered with the configured
 * Elacity public gateway (ipfs.ela.city) so operators can verify that newly
 * uploaded content will propagate to the public gateway via bitswap.
 *
 * Owner-only because peer-list information should not leak to unauthenticated
 * callers.
 */
router.get('/ipfs/peers', authenticate, requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ipfs = req.app.locals.ipfs;
    if (!ipfs) {
      return res.status(503).json({ error: 'IPFS not available' });
    }

    const elacity = ipfs.getElacityPeerStatus();
    const connectedPeers = await ipfs.getConnectedPeers();

    res.json({
      connectedPeers: connectedPeers.length,
      peerList: connectedPeers.slice(0, 50),
      elacity: {
        peered: elacity.peered,
        configuredPeerIds: elacity.configuredPeerIds,
        configuredMultiaddrs: elacity.configuredMultiaddrs,
        matchedPeerIds: elacity.matchedPeerIds,
      },
    });
  } catch (error) {
    logger.error('[Storage API]: Error getting IPFS peers:', error);
    res.status(500).json({ error: 'Failed to get IPFS peers' });
  }
});

/**
 * POST /api/ipfs/add
 * Add raw content to IPFS and return the CID.
 * Accepts base64-encoded content in JSON body.
 * Used by the Creator Dashboard to upload encrypted assets.
 *
 * Body: { content: string (base64), announce?: boolean }
 * Response: { success: true, cid: string, size: number }
 */
router.post('/ipfs/add', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ipfs = req.app.locals.ipfs;
    if (!ipfs) {
      return res.status(503).json({ error: 'IPFS not available' });
    }

    const { content, announce } = req.body;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid content (expected base64 string)' });
    }

    const MAX_SIZE = 100 * 1024 * 1024; // 100MB limit
    const estimatedSize = Math.ceil(content.length * 0.75);
    if (estimatedSize > MAX_SIZE) {
      return res.status(413).json({ error: `Content too large (${Math.round(estimatedSize / 1024 / 1024)}MB). Max: 100MB` });
    }

    const data = Buffer.from(content, 'base64');
    logger.info(`[Storage API] Adding ${data.length} bytes to IPFS`);

    const cid = await ipfs.storeFile(data, { pin: true, announce: !!announce });

    logger.info(`[Storage API] Added to IPFS: ${cid} (${data.length} bytes)`);

    const db = req.app.locals.db;
    const walletAddress = req.user?.wallet_address;
    if (db && walletAddress) {
      try {
        db.trackPinnedCID(cid, walletAddress, data.length, 'creator');
      } catch (trackErr) {
        logger.warn(`[Storage API] Failed to track creator CID (non-fatal): ${cid}`, trackErr);
      }
    }

    if (announce && ipfs.canAnnounce()) {
      ipfs.announceCID(cid).then((announced: boolean) => {
        if (announced) {
          logger.info(`[Storage API] Announced creator CID to DHT: ${cid}`);
          db?.updatePinnedCIDAnnouncedAt(cid);
        }
      }).catch((err: any) => {
        logger.warn(`[Storage API] DHT announcement failed (non-fatal): ${cid}`, err);
      });
    }

    res.json({ success: true, cid, size: data.length });
  } catch (error: any) {
    logger.error('[Storage API]: Error adding content to IPFS:', error);
    res.status(500).json({ error: error.message || 'Failed to add content to IPFS' });
  }
});

/**
 * POST /api/ipfs/add-directory
 * Create an IPFS directory containing one or more named files.
 * Returns a directory CID where {dirCID}/{filename} resolves on IPFS gateways.
 *
 * Body: { files: Record<string, string (base64)>, announce?: boolean }
 *   e.g. { files: { "metadata.json": "<base64>", "content.json": "<base64>" } }
 * Response: { success: true, cid: string, fileCount: number }
 */
router.post('/ipfs/add-directory', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ipfs = req.app.locals.ipfs;
    if (!ipfs) {
      return res.status(503).json({ error: 'IPFS not available' });
    }

    const { files, announce } = req.body;
    if (!files || typeof files !== 'object' || Array.isArray(files)) {
      return res.status(400).json({ error: 'Missing or invalid files (expected { "filename": "base64content", ... })' });
    }

    const filenames = Object.keys(files);
    if (filenames.length === 0) {
      return res.status(400).json({ error: 'At least one file is required' });
    }

    const MAX_SIZE = 100 * 1024 * 1024;
    const fileBuffers: Record<string, Buffer> = {};
    let totalSize = 0;

    for (const [name, content] of Object.entries(files)) {
      if (typeof content !== 'string') {
        return res.status(400).json({ error: `File "${name}" content must be a base64 string` });
      }
      const buf = Buffer.from(content as string, 'base64');
      totalSize += buf.length;
      if (totalSize > MAX_SIZE) {
        return res.status(413).json({ error: `Total content too large. Max: 100MB` });
      }
      fileBuffers[name] = buf;
    }

    logger.info(`[Storage API] Creating IPFS directory with ${filenames.length} files (${totalSize} bytes total)`);

    const cid = await ipfs.storeDirectory(fileBuffers, { pin: true });

    logger.info(`[Storage API] IPFS directory created: ${cid} (${filenames.length} files, ${totalSize} bytes)`);

    const db = req.app.locals.db;
    const walletAddress = req.user?.wallet_address;
    if (db && walletAddress) {
      try {
        db.trackPinnedCID(cid, walletAddress, totalSize, 'creator');
      } catch (trackErr) {
        logger.warn(`[Storage API] Failed to track creator directory CID (non-fatal): ${cid}`, trackErr);
      }
    }

    if (announce && ipfs.canAnnounce()) {
      ipfs.announceCID(cid).then((announced: boolean) => {
        if (announced) {
          logger.info(`[Storage API] Announced creator directory CID to DHT: ${cid}`);
          db?.updatePinnedCIDAnnouncedAt(cid);
        }
      }).catch((err: any) => {
        logger.warn(`[Storage API] DHT announcement failed (non-fatal): ${cid}`, err);
      });
    }

    res.json({ success: true, cid, fileCount: filenames.length });
  } catch (error: any) {
    logger.error('[Storage API]: Error creating IPFS directory:', error);
    res.status(500).json({ error: error.message || 'Failed to create IPFS directory' });
  }
});

/**
 * GET /api/ipfs/pins
 * Returns the list of CIDs pinned locally for the authenticated user.
 */
router.get('/ipfs/pins', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = req.app.locals.db;
    if (!db) return res.status(503).json({ error: 'Database not available' });
    const walletAddress = req.user?.wallet_address;
    const cids = db.getPinnedCIDs(walletAddress);
    res.json({ success: true, cids });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list pinned CIDs' });
  }
});

/**
 * Supernode pin-mirror fan-out (SUPERNODE-MEDIA-PINNING task).
 *
 * Reads `SUPERNODE_PIN_MIRRORS` env var (comma-separated URLs). When set, every
 * successful /ipfs/pin call fires a fire-and-forget POST to each mirror so the
 * supernode Kubo daemons can pin the same CID and act as always-on redundant
 * providers.
 *
 * Default OFF. When the supernode-side endpoint lands, operators flip the env
 * var on and no client update is required. If any mirror URL is unreachable,
 * the caller is NOT impacted — requests are bounded by a 5 s timeout and run
 * outside the response path.
 */
interface MirrorProbeResult {
  url: string;
  lastCid: string;
  lastStatus: number | 'error';
  lastError?: string;
  lastDurationMs: number;
  lastAt: number;
}
const mirrorProbeState: Map<string, MirrorProbeResult> = new Map();

/**
 * Elacity Kubo pin forward (ELACITY-KUBO-PIN-FORWARD task).
 *
 * After every successful local pin, fire one authenticated request to
 * `ipfs.ela.city`'s Kubo API asking it to pin the same CID. Kubo then pulls
 * the content over libp2p (from this node, via IPFS-ELACITY-BOOTSTRAP peering)
 * and persists it in its own pinset — surviving this node going offline.
 *
 * Requires the Elacity ops team to have deployed the nginx patch in
 * `docs/handover/ELACITY_IPFS_PIN_ENDPOINT_NGINX_PATCH.md`. Until both
 * `ELACITY_PIN_FORWARD_URL` and `ELACITY_PIN_FORWARD_TOKEN` are set, this is
 * a no-op and no network traffic is generated.
 */
interface ElacityPinForwardConfig {
  url: string;
  token: string;
}

interface ElacityForwardProbeResult {
  url: string;
  lastCid: string;
  lastStatus: number | 'error';
  lastError?: string;
  lastDurationMs: number;
  lastAt: number;
}
let elacityForwardProbeState: ElacityForwardProbeResult | null = null;

function getElacityPinForwardConfig(): ElacityPinForwardConfig | null {
  const rawUrl = process.env.ELACITY_PIN_FORWARD_URL;
  const token = process.env.ELACITY_PIN_FORWARD_TOKEN;
  if (!rawUrl || !token) return null;
  const url = rawUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(url)) return null;
  return { url, token: token.trim() };
}

// Retry queue for Elacity Kubo pin forwards. In-memory only (pc2-node restarts
// are rare; a hypothetical restart during pending retries is acceptable because
// the next /ipfs/pin request from the client will re-trigger a forward). Back
// off exponentially so a blip on ipfs.ela.city doesn't DOS it on recovery.
const PIN_RETRY_MAX_ATTEMPTS = 5;
const PIN_RETRY_BACKOFF_MS: readonly number[] = [60_000, 120_000, 240_000, 480_000, 960_000];
const PIN_RETRY_MAX_QUEUE = 1000;
const PIN_RETRY_MAX_AGE_MS = 3_600_000;
const PIN_RETRY_TICK_MS = 30_000;

interface ElacityPinRetryState {
  cid: string;
  attempts: number;
  firstQueuedAt: number;
  nextAttemptAt: number;
  lastError: string;
}

const elacityPinRetryQueue = new Map<string, ElacityPinRetryState>();
let elacityRetrySchedulerStarted = false;

/**
 * Enqueue (or re-queue) a cid for a future pin-forward retry. Applies
 * exponential backoff and a hard cap on both attempts and total age so
 * a bad cid cannot sit in the queue forever.
 */
function queueElacityPinRetry(cid: string, error: string): void {
  const existing = elacityPinRetryQueue.get(cid);
  const attempts = (existing?.attempts ?? 0) + 1;

  if (attempts > PIN_RETRY_MAX_ATTEMPTS) {
    logger.error(
      `[Storage API] Elacity pin forward giving up after ${PIN_RETRY_MAX_ATTEMPTS} attempts: cid=${cid} lastError=${error}`,
    );
    elacityPinRetryQueue.delete(cid);
    return;
  }

  const now = Date.now();
  const firstQueuedAt = existing?.firstQueuedAt ?? now;

  if (now - firstQueuedAt > PIN_RETRY_MAX_AGE_MS) {
    logger.error(
      `[Storage API] Elacity pin forward aged out (>${Math.round(PIN_RETRY_MAX_AGE_MS / 60000)}min): cid=${cid} lastError=${error}`,
    );
    elacityPinRetryQueue.delete(cid);
    return;
  }

  if (!existing && elacityPinRetryQueue.size >= PIN_RETRY_MAX_QUEUE) {
    logger.warn(
      `[Storage API] Elacity pin retry queue full (${PIN_RETRY_MAX_QUEUE}), dropping cid=${cid}`,
    );
    return;
  }

  const backoff = PIN_RETRY_BACKOFF_MS[Math.min(attempts - 1, PIN_RETRY_BACKOFF_MS.length - 1)];
  elacityPinRetryQueue.set(cid, {
    cid,
    attempts,
    firstQueuedAt,
    nextAttemptAt: now + backoff,
    lastError: error,
  });
  logger.debug(
    `[Storage API] Elacity pin forward retry queued: cid=${cid} attempt=${attempts}/${PIN_RETRY_MAX_ATTEMPTS} backoffMs=${backoff}`,
  );
}

function ensureElacityPinRetrySchedulerStarted(): void {
  if (elacityRetrySchedulerStarted) return;
  if (!getElacityPinForwardConfig()) return;
  elacityRetrySchedulerStarted = true;

  const tick = (): void => {
    const now = Date.now();
    for (const [, state] of elacityPinRetryQueue) {
      if (state.nextAttemptAt <= now) {
        // forwardPinToElacityKubo re-enters queueElacityPinRetry on failure
        // or deletes the entry on success.
        forwardPinToElacityKubo(state.cid);
      }
    }
  };

  const timer = setInterval(tick, PIN_RETRY_TICK_MS);
  timer.unref?.();
  logger.info(
    `[Storage API] Elacity pin forward retry scheduler started (interval=${PIN_RETRY_TICK_MS}ms, maxAttempts=${PIN_RETRY_MAX_ATTEMPTS})`,
  );
}

function forwardPinToElacityKubo(cid: string): void {
  const config = getElacityPinForwardConfig();
  if (!config) return;

  const target = `${config.url}/api/v0/pin/add?arg=${encodeURIComponent(cid)}&recursive=true`;
  const start = Date.now();

  void fetch(target, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}` },
    signal: AbortSignal.timeout(30000),
  }).then(
    (response) => {
      const durationMs = Date.now() - start;
      elacityForwardProbeState = {
        url: config.url,
        lastCid: cid,
        lastStatus: response.status,
        lastDurationMs: durationMs,
        lastAt: Date.now(),
      };
      if (response.ok) {
        elacityPinRetryQueue.delete(cid);
        logger.info(`[Storage API] Elacity Kubo pin forward ok: cid=${cid} (${durationMs}ms)`);
        return;
      }
      // 4xx responses are the caller's fault (auth, bad CID) — no point retrying.
      // 5xx and gateway timeouts are transient — queue for retry.
      if (response.status >= 500) {
        logger.warn(
          `[Storage API] Elacity Kubo pin forward 5xx: cid=${cid} status=${response.status} (${durationMs}ms) — scheduling retry`,
        );
        queueElacityPinRetry(cid, `status=${response.status}`);
      } else {
        logger.warn(
          `[Storage API] Elacity Kubo pin forward non-retryable: cid=${cid} status=${response.status} (${durationMs}ms)`,
        );
      }
    },
    (err: any) => {
      const durationMs = Date.now() - start;
      const message = err?.message || 'unknown error';
      elacityForwardProbeState = {
        url: config.url,
        lastCid: cid,
        lastStatus: 'error',
        lastError: message,
        lastDurationMs: durationMs,
        lastAt: Date.now(),
      };
      // Network-level errors (timeout, DNS, refused connection) are always
      // transient; always retry.
      logger.debug(`[Storage API] Elacity Kubo pin forward failed: cid=${cid} (${durationMs}ms): ${message} — scheduling retry`);
      queueElacityPinRetry(cid, message);
    },
  );
}

// Emit a single boot-time info line so operators can confirm the forward
// state from logs. Any non-default env state that still ends up disabled
// gets a warning so misconfiguration is visible without grepping.
(() => {
  const config = getElacityPinForwardConfig();
  if (config) {
    logger.info(`[Storage API] Elacity Kubo pin forward: enabled -> ${config.url}`);
    ensureElacityPinRetrySchedulerStarted();
    return;
  }
  const hasUrl = !!process.env.ELACITY_PIN_FORWARD_URL;
  const hasToken = !!process.env.ELACITY_PIN_FORWARD_TOKEN;
  if (hasUrl && hasToken) {
    logger.warn(
      '[Storage API] Elacity Kubo pin forward: both env vars set but ELACITY_PIN_FORWARD_URL is not http(s):// — disabled',
    );
  } else if (hasUrl || hasToken) {
    logger.warn(
      '[Storage API] Elacity Kubo pin forward: partially configured (both ELACITY_PIN_FORWARD_URL and ELACITY_PIN_FORWARD_TOKEN required) — disabled',
    );
  }
})();

function getConfiguredPinMirrors(): string[] {
  const raw = process.env.SUPERNODE_PIN_MIRRORS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function fanOutSupernodePinMirrors(cid: string): void {
  const mirrors = getConfiguredPinMirrors();
  if (mirrors.length === 0) return;

  for (const url of mirrors) {
    const start = Date.now();
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cid, source: 'pc2-node-mirror' }),
      signal: AbortSignal.timeout(5000),
    }).then(
      (response) => {
        const durationMs = Date.now() - start;
        mirrorProbeState.set(url, {
          url,
          lastCid: cid,
          lastStatus: response.status,
          lastDurationMs: durationMs,
          lastAt: Date.now(),
        });
        if (response.ok) {
          logger.info(`[Storage API] Mirror pin ok: ${url} cid=${cid} status=${response.status} (${durationMs}ms)`);
        } else {
          logger.debug(`[Storage API] Mirror pin non-OK: ${url} cid=${cid} status=${response.status} (${durationMs}ms)`);
        }
      },
      (err: any) => {
        const durationMs = Date.now() - start;
        const message = err?.message || 'unknown error';
        mirrorProbeState.set(url, {
          url,
          lastCid: cid,
          lastStatus: 'error',
          lastError: message,
          lastDurationMs: durationMs,
          lastAt: Date.now(),
        });
        logger.debug(`[Storage API] Mirror pin failed: ${url} cid=${cid} (${durationMs}ms): ${message}`);
      },
    );
  }
}

/**
 * GET /api/storage/ipfs/pin-mirrors
 * Diagnostic: report configured supernode pin-mirror URLs and the last probe
 * result for each (populated after the first fan-out fires). Owner-guarded so
 * mirror topology doesn't leak to unauthenticated callers.
 */
router.get('/ipfs/pin-mirrors', authenticate, requireOwner, (_req: AuthenticatedRequest, res: Response) => {
  const configured = getConfiguredPinMirrors();
  res.json({
    enabled: configured.length > 0,
    configured,
    lastProbes: configured.map((url) => mirrorProbeState.get(url) ?? null),
  });
});

/**
 * GET /api/storage/ipfs/elacity-pin-forward
 * Diagnostic: report whether the Elacity Kubo pin forward is configured and
 * the last probe result. Owner-guarded — the token is never returned, only
 * a boolean flag confirming it is present.
 */
router.get('/ipfs/elacity-pin-forward', authenticate, requireOwner, (_req: AuthenticatedRequest, res: Response) => {
  const config = getElacityPinForwardConfig();
  const now = Date.now();
  // Cap exposed retry entries so a pathological queue doesn't balloon the
  // diagnostic payload. Scheduler still iterates the whole queue internally.
  const pendingSample = Array.from(elacityPinRetryQueue.values())
    .slice(0, 20)
    .map((s) => ({
      cid: s.cid,
      attempts: s.attempts,
      nextAttemptInMs: Math.max(0, s.nextAttemptAt - now),
      firstQueuedAgoMs: now - s.firstQueuedAt,
      lastError: s.lastError,
    }));
  res.json({
    enabled: config !== null,
    url: config?.url ?? null,
    tokenConfigured: config !== null,
    lastProbe: elacityForwardProbeState,
    retryQueue: {
      size: elacityPinRetryQueue.size,
      maxAttempts: PIN_RETRY_MAX_ATTEMPTS,
      maxQueueSize: PIN_RETRY_MAX_QUEUE,
      maxAgeMs: PIN_RETRY_MAX_AGE_MS,
      schedulerStarted: elacityRetrySchedulerStarted,
      pending: pendingSample,
    },
  });
});

/**
 * GET /api/storage/ipfs/cluster-pin
 * Diagnostic: report whether the IPFS Cluster pin forward is configured and
 * the last probe + retry queue state. Owner-guarded — token never returned.
 */
router.get('/ipfs/cluster-pin', authenticate, requireOwner, (_req: AuthenticatedRequest, res: Response) => {
  const config = getClusterPinConfig();
  res.json({
    enabled: config !== null,
    url: config?.url ?? null,
    tokenConfigured: config !== null,
    replication: config ? { min: config.replicationMin, max: config.replicationMax } : null,
    lastProbe: getClusterPinProbeState(),
    retryQueue: getClusterPinRetryQueueSnapshot(),
  });
});

/**
 * GET /api/storage/ipfs/cluster-availability/:cid
 * Public availability badge: query the IPFS Cluster for a CID's pin status.
 * Returns delegate multiaddrs the caller can use to dial directly.
 *
 * Returns 503 with {available: false, reason: 'cluster-not-configured'} when
 * SUPERNODE_CLUSTER_PIN_URL is not set so callers can fall back gracefully.
 */
router.get('/ipfs/cluster-availability/:cid', async (req, res: Response) => {
  const cid = String(req.params.cid ?? '').trim();
  if (!cid) {
    return res.status(400).json({ error: 'Missing CID' });
  }
  if (!getClusterPinConfig()) {
    return res.status(503).json({ available: false, reason: 'cluster-not-configured' });
  }
  try {
    const status = await queryClusterPinStatus(cid);
    if (!status) {
      return res.json({ available: false, status: 'unknown', delegates: [] });
    }
    res.json({
      available: status.status === 'pinned',
      status: status.status,
      delegates: status.delegates,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/ipfs/pin
 * Pin a remote CID to the local IPFS node (fetches content from the network/gateway).
 * Used by the Elacity Market to download owned media to the user's node.
 */
router.post('/ipfs/pin', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ipfs = req.app.locals.ipfs;
    if (!ipfs) {
      return res.status(503).json({ error: 'IPFS not available' });
    }

    const { cid, estimatedSize, buyerWallets } = req.body;
    if (!cid || typeof cid !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid CID' });
    }

    const cidClean = cid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '').split('/')[0];
    const walletAddress = req.user?.wallet_address;
    const extraWallets: string[] = Array.isArray(buyerWallets)
      ? buyerWallets.filter((w: unknown) => typeof w === 'string' && w.length > 0).map((w: string) => w.toLowerCase())
      : [];

    const seedingService = req.app.locals.seedingService;
    if (seedingService && walletAddress) {
      seedingService.seedContent(cidClean, walletAddress, {
        priority: 'immediate',
        estimatedSizeBytes: estimatedSize || 0,
      });

      const db = req.app.locals.db;
      if (db && extraWallets.length > 0) {
        for (const bw of extraWallets) {
          try { db.trackPinnedCID(cidClean, bw, estimatedSize || 0, 'marketplace'); } catch (_) { /* non-fatal */ }
        }
      }

      fanOutSupernodePinMirrors(cidClean);
      forwardPinToElacityKubo(cidClean);
      forwardPinToCluster(cidClean);

      return res.json({
        success: true,
        cid: cidClean,
        queued: true,
        message: 'Content queued for pinning and seeding',
      });
    }

    // Fallback: direct pin without seeding service
    logger.info(`[Storage API] Pinning remote CID (no seeding service): ${cidClean}`);
    const result = await ipfs.pinRemoteCID(cidClean, { timeoutMs: 180000 });

    if (result.success) {
      logger.info(`[Storage API] Successfully pinned CID: ${cidClean} (${result.size} bytes, ${result.type}, ${result.timeMs}ms)`);

      const db = req.app.locals.db;
      if (db && walletAddress) {
        try {
          db.trackPinnedCID(cidClean, walletAddress, result.size || 0, 'marketplace');
        } catch (trackErr) {
          logger.warn(`[Storage API] Failed to track pinned CID (non-fatal): ${cidClean}`, trackErr);
        }
      }
      if (db && extraWallets.length > 0) {
        for (const bw of extraWallets) {
          try { db.trackPinnedCID(cidClean, bw, result.size || 0, 'marketplace'); } catch (_) { /* non-fatal */ }
        }
      }

      if (ipfs.canAnnounce()) {
        ipfs.announceCID(cidClean).then((announced: boolean) => {
          if (announced) {
            db?.updatePinnedCIDAnnouncedAt(cidClean);
          }
        }).catch((err: any) => {
          logger.warn(`[Storage API] DHT announcement failed (non-fatal): ${cidClean}`, err);
        });
      }

      fanOutSupernodePinMirrors(cidClean);
      forwardPinToElacityKubo(cidClean);
      forwardPinToCluster(cidClean);

      res.json({
        success: true,
        cid: result.cid,
        totalSize: result.size,
        blockCount: result.blockCount || result.files || 1,
        type: result.type,
      });
    } else {
      res.status(500).json({ success: false, error: 'Failed to pin CID' });
    }
  } catch (error: any) {
    logger.error('[Storage API]: Error pinning remote CID:', error);
    res.status(500).json({ error: error.message || 'Failed to pin CID' });
  }
});

/**
 * GET /api/storage/ipfs/pin-status/:cid
 *
 * Returns the current pin state of a CID on this node. Drives the
 * download-first buy flow: the market app polls this every ~2s after
 * purchase to show honest progress; the file-open launch gate polls
 * this before launching the player/viewer for any `.ddrm` whose
 * descriptor carries `pinStatus !== 'complete'`.
 *
 * Pin status is a property of the CID on this node (not of the wallet
 * that purchased it) — a CID already complete on this node returns
 * `complete` immediately for subsequent buyers.
 *
 * Intentionally does NOT return a fake mid-download `pinnedBytes`.
 * Helia does not expose block-level pin progress cleanly. The client
 * shows elapsed time + expected total size instead of a fake %.
 */
router.get('/ipfs/pin-status/:cid', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cid } = req.params;
    if (!cid || typeof cid !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid CID' });
    }
    const cidClean = cid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '').split('/')[0];

    const db = req.app.locals.db;
    if (!db) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const detail = db.getPinnedCIDDetail(cidClean);
    if (!detail) {
      return res.json({
        cid: cidClean,
        status: 'not-pinned',
        sizeBytes: 0,
        bytesDownloaded: 0,
        progressPercent: 0,
        source: null,
        pinnedAt: null,
      });
    }

    const sizeBytes = detail.size || 0;
    const bytesDownloaded = Math.min(detail.bytes_downloaded || 0, sizeBytes || detail.bytes_downloaded || 0);
    // `progressPercent` is the primary field the market-app progress bar
    // consumes. When `complete`, snap to 100 regardless of byte counts so
    // an older row (pinned before Migration 31 populated bytes_downloaded)
    // can't show "Complete — 0%".
    const progressPercent = detail.pin_status === 'complete'
      ? 100
      : sizeBytes > 0
        ? Math.min(100, Math.floor((bytesDownloaded / sizeBytes) * 100))
        : 0;

    res.json({
      cid: cidClean,
      status: detail.pin_status,
      sizeBytes,
      bytesDownloaded,
      progressPercent,
      source: detail.source,
      pinnedAt: detail.pinned_at,
    });
  } catch (error: any) {
    logger.error('[Storage API]: Error fetching pin status:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch pin status' });
  }
});

/**
 * POST /api/storage/ipfs/pin/:cid/retry
 *
 * Re-queue a failed pin. Used by the download-first buy flow when a
 * previous pin attempt ended in `failed` state (network blip, content
 * not yet on any reachable peer, disk-quota window, etc).
 *
 * Guarded by a 30-second per-CID debounce so a user mashing the retry
 * button does not hammer seedingService / Elacity.
 */
const pinRetryLastAttempt = new Map<string, number>();
const PIN_RETRY_DEBOUNCE_MS = 30_000;

router.post('/ipfs/pin/:cid/retry', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cid } = req.params;
    if (!cid || typeof cid !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid CID' });
    }
    const cidClean = cid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '').split('/')[0];

    const now = Date.now();
    const last = pinRetryLastAttempt.get(cidClean) ?? 0;
    if (now - last < PIN_RETRY_DEBOUNCE_MS) {
      const waitMs = PIN_RETRY_DEBOUNCE_MS - (now - last);
      return res.status(429).json({
        error: 'Retry debounce active',
        retryAfterMs: waitMs,
        cid: cidClean,
      });
    }

    const seedingService = req.app.locals.seedingService;
    const walletAddress = req.user?.wallet_address;
    if (!seedingService || !walletAddress) {
      return res.status(503).json({ error: 'Seeding service unavailable' });
    }

    const db = req.app.locals.db;
    const detail = db?.getPinnedCIDDetail(cidClean);
    if (detail && detail.pin_status === 'complete') {
      return res.json({ success: true, cid: cidClean, status: 'already_complete' });
    }

    pinRetryLastAttempt.set(cidClean, now);
    seedingService.seedContent(cidClean, walletAddress, {
      priority: 'immediate',
      estimatedSizeBytes: detail?.size || 0,
    });

    logger.info(`[Storage API] Pin retry requested for ${cidClean} by ${walletAddress}`);

    return res.json({ success: true, cid: cidClean, queued: true });
  } catch (error: any) {
    logger.error('[Storage API]: Error retrying pin:', error);
    res.status(500).json({ error: error.message || 'Failed to retry pin' });
  }
});

/**
 * DELETE /api/ipfs/unpin/:cid
 * Remove a CID from seeding. Stops serving and removes tracking record.
 */
router.delete('/ipfs/unpin/:cid', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cid } = req.params;
    if (!cid) {
      return res.status(400).json({ error: 'Missing CID' });
    }

    const seedingService = req.app.locals.seedingService;
    if (seedingService) {
      seedingService.unseedContent(cid);
    } else {
      const db = req.app.locals.db;
      if (db) db.removePinnedCID(cid);
    }

    res.json({ success: true, cid, message: 'Content removed from seeding' });
  } catch (error: any) {
    logger.error(`[Storage API] Error unseeding CID ${req.params.cid}:`, error);
    res.status(500).json({ error: error.message || 'Failed to unseed CID' });
  }
});

// ─── NFT IPFS Pinning ────────────────────────────────────────────────────────

/**
 * POST /api/nft/pin
 * Pin an NFT's IPFS content to the local node and register it in the virtual filesystem.
 */
router.post('/nft/pin', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = req.app.locals.db;
    const ipfs = req.app.locals.ipfs;
    const seedingService = req.app.locals.seedingService;
    const filesystem = req.app.locals.filesystem;

    if (!db) return res.status(503).json({ error: 'Database not available' });
    if (!ipfs) return res.status(503).json({ error: 'IPFS not available' });

    const { cid, name, collection, contractAddress, tokenId, mimeType } = req.body;
    if (!cid || typeof cid !== 'string') return res.status(400).json({ error: 'Missing or invalid CID' });
    if (!name) return res.status(400).json({ error: 'Missing NFT name' });
    if (!contractAddress || !tokenId) return res.status(400).json({ error: 'Missing contract address or token ID' });

    const cidClean = cid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '').split('/')[0];
    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) return res.status(401).json({ error: 'No wallet address' });

    const ext = (mimeType || 'image/png').split('/').pop() || 'png';
    const safeName = (name || 'Untitled').replace(/[\/\\:*?"<>|]/g, '_').substring(0, 100);
    const safeCollection = (collection || 'Unknown').replace(/[\/\\:*?"<>|]/g, '_').substring(0, 80);
    const filePath = `/${walletAddress}/Pictures/NFTs/${safeCollection}/${safeName}.${ext}`;

    const existing = db.getNFTPin(cidClean, walletAddress);
    if (existing && existing.pin_status === 'complete') {
      return res.json({ success: true, cid: cidClean, status: 'already_pinned', filePath: existing.pin_status });
    }

    db.trackNFTPin({
      cid: cidClean,
      walletAddress,
      contractAddress,
      tokenId,
      name: safeName,
      collectionName: safeCollection,
      mimeType: mimeType || 'image/png',
      filePath,
    });

    if (seedingService) {
      seedingService.seedContent(cidClean, walletAddress, {
        priority: 'immediate',
        estimatedSizeBytes: 0,
      });
    } else {
      ipfs.pinRemoteCID(cidClean, { timeoutMs: 180000 }).then(async (result: any) => {
        if (result.success) {
          db.trackPinnedCID(cidClean, walletAddress, result.size || 0, 'nft');
          db.updateNFTPinStatus(cidClean, 'complete');
          if (ipfs.canAnnounce()) {
            ipfs.announceCID(cidClean).catch(() => { });
          }
          if (filesystem) {
            try {
              const parentDir = filePath.substring(0, filePath.lastIndexOf('/'));
              await filesystem.createDirectory(parentDir, walletAddress).catch(() => { });
              await filesystem.createDirectory(parentDir.substring(0, parentDir.lastIndexOf('/')), walletAddress).catch(() => { });
            } catch { /* directory may already exist */ }
          }
        } else {
          db.updateNFTPinStatus(cidClean, 'failed');
        }
      }).catch(() => {
        db.updateNFTPinStatus(cidClean, 'failed');
      });
    }

    db.trackPinnedCID(cidClean, walletAddress, 0, 'nft');

    if (filesystem) {
      try {
        const nftDir = `/${walletAddress}/Pictures/NFTs`;
        const collDir = `${nftDir}/${safeCollection}`;
        await filesystem.createDirectory(nftDir, walletAddress).catch(() => { });
        await filesystem.createDirectory(collDir, walletAddress).catch(() => { });
      } catch { /* directories may already exist */ }
    }

    res.json({
      success: true,
      cid: cidClean,
      queued: true,
      filePath,
      message: 'NFT content queued for pinning',
    });
  } catch (error: any) {
    logger.error('[NFT Pin] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to pin NFT' });
  }
});

/**
 * GET /api/nft/pins
 * List all NFTs pinned by the authenticated user with their status.
 */
router.get('/nft/pins', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = req.app.locals.db;
    if (!db) return res.status(503).json({ error: 'Database not available' });

    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) return res.status(401).json({ error: 'No wallet address' });

    const pins = db.getNFTPins(walletAddress);
    res.json({ success: true, pins });
  } catch (error: any) {
    logger.error('[NFT Pins] Error listing pins:', error);
    res.status(500).json({ error: error.message || 'Failed to list NFT pins' });
  }
});

/**
 * GET /api/nft/pin/:cid
 * Get pin status for a specific CID.
 */
router.get('/nft/pin/:cid', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = req.app.locals.db;
    if (!db) return res.status(503).json({ error: 'Database not available' });

    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) return res.status(401).json({ error: 'No wallet address' });

    const cidClean = req.params.cid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '').split('/')[0];
    const pin = db.getNFTPin(cidClean, walletAddress);
    if (!pin) return res.status(404).json({ success: false, pinned: false });

    res.json({ success: true, pinned: true, ...pin });
  } catch (error: any) {
    logger.error('[NFT Pin] Error getting pin status:', error);
    res.status(500).json({ error: error.message || 'Failed to get pin status' });
  }
});

/**
 * DELETE /api/nft/pin/:cid
 * Unpin an NFT and remove the filesystem entry.
 */
router.delete('/nft/pin/:cid', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = req.app.locals.db;
    if (!db) return res.status(503).json({ error: 'Database not available' });

    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) return res.status(401).json({ error: 'No wallet address' });

    const cidClean = req.params.cid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '').split('/')[0];

    db.removeNFTPin(cidClean, walletAddress);

    const seedingService = req.app.locals.seedingService;
    if (seedingService) {
      seedingService.unseedContent(cidClean);
    } else {
      db.removePinnedCID(cidClean);
    }

    res.json({ success: true, cid: cidClean, message: 'NFT unpinned' });
  } catch (error: any) {
    logger.error(`[NFT Pin] Error unpinning ${req.params.cid}:`, error);
    res.status(500).json({ error: error.message || 'Failed to unpin NFT' });
  }
});

// ─── Lit Protocol: Server Key + Encrypt/Decrypt ──────────────────────────────
//
// Architecture: The pc2-node backend is the trusted decryption service.
// - Encryption: Lit access conditions gate on the SERVER wallet (not the buyer)
// - Decryption: Server verifies buyer's AccessToken on-chain, then uses its own
//   Lit auth to decrypt. This mirrors Elacity's backend architecture.
//
// The server key is auto-generated on first use and stored in the data directory.

const __litFilename = fileURLToPath(import.meta.url);
const __litDirname = dirname(__litFilename);
const LIT_KEY_PATH = join(__litDirname, '../../data/.lit-server-key');
const CAPACITY_KEY_PATH = join(__litDirname, '../../data/.lit-capacity-key');
const CAPACITY_TOKEN_ID_PATH = join(__litDirname, '../../data/.lit-capacity-token-id');
const LIT_RELAYER_CONFIG_PATH = join(__litDirname, '../../data/.lit-relayer-config');

const LIT_RELAYER_URL = 'https://datil-relayer.getlit.dev';

function getConfiguredCapacityTokenId(): string {
  if (process.env.LIT_CAPACITY_TOKEN_ID) return process.env.LIT_CAPACITY_TOKEN_ID;
  if (existsSync(CAPACITY_TOKEN_ID_PATH)) return readFileSync(CAPACITY_TOKEN_ID_PATH, 'utf8').trim();
  return '';
}

interface RelayerConfig {
  apiKey: string;
  payerSecretKey: string;
}

function getRelayerConfig(): RelayerConfig | null {
  const apiKey = process.env.LIT_RELAYER_API_KEY;
  const payerSecretKey = process.env.LIT_PAYER_SECRET_KEY;
  if (apiKey && payerSecretKey) return { apiKey, payerSecretKey };

  if (existsSync(LIT_RELAYER_CONFIG_PATH)) {
    try {
      const raw = readFileSync(LIT_RELAYER_CONFIG_PATH, 'utf8').trim();
      const parsed = JSON.parse(raw);
      if (parsed.apiKey && parsed.payerSecretKey) return parsed;
    } catch { /* ignore parse errors */ }
  }
  return null;
}

let delegateeRegistered = false;

async function ensureDelegateeRegistered(walletAddress: string): Promise<void> {
  if (delegateeRegistered) return;

  const config = getRelayerConfig();
  if (!config) {
    logger.info('[Lit] No relayer config — skipping auto-registration (may already be registered)');
    delegateeRegistered = true;
    return;
  }

  try {
    const resp = await fetch(`${LIT_RELAYER_URL}/add-users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.apiKey,
        'payer-secret-key': config.payerSecretKey,
      },
      body: JSON.stringify([walletAddress]),
    });
    const result = await resp.json() as any;
    if (result.success) {
      logger.info(`[Lit] Registered as delegatee via Payment Delegation DB (tx: ${result.txHash || 'submitted'})`);
    } else {
      logger.warn(`[Lit] Delegatee registration response:`, result);
    }
  } catch (err: any) {
    logger.warn(`[Lit] Delegatee auto-registration failed (may already be registered): ${err.message}`);
  }
  delegateeRegistered = true;
}

let cachedCapacityTokenId: string | null = null;

let cachedServerWallet: any = null;
let cachedCapacityWallet: any = null;

async function getServerWallet() {
  if (cachedServerWallet) return cachedServerWallet;

  const { ethers } = await import('ethers');

  if (existsSync(LIT_KEY_PATH)) {
    const key = readFileSync(LIT_KEY_PATH, 'utf8').trim();
    cachedServerWallet = new ethers.Wallet(key);
    logger.info(`[Lit] Server wallet loaded: ${cachedServerWallet.address}`);
  } else {
    const dataDir = dirname(LIT_KEY_PATH);
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

    cachedServerWallet = ethers.Wallet.createRandom();
    writeFileSync(LIT_KEY_PATH, cachedServerWallet.privateKey, { mode: 0o600 });
    logger.info(`[Lit] Generated new server wallet: ${cachedServerWallet.address}`);
  }

  return cachedServerWallet;
}

/**
 * Load the capacity credit owner wallet.
 * This wallet must own the RLI NFT (capacity credit) on Chronicle Yellowstone.
 * Store its private key in data/.lit-capacity-key or set LIT_CAPACITY_KEY env var.
 */
async function getCapacityWallet(): Promise<any | null> {
  if (cachedCapacityWallet !== null) return cachedCapacityWallet || null;

  const { ethers } = await import('ethers');
  const envKey = process.env.LIT_CAPACITY_KEY;

  if (envKey) {
    cachedCapacityWallet = new ethers.Wallet(envKey.trim());
    logger.info(`[Lit] Capacity wallet loaded from env: ${cachedCapacityWallet.address}`);
    return cachedCapacityWallet;
  }

  if (existsSync(CAPACITY_KEY_PATH)) {
    const key = readFileSync(CAPACITY_KEY_PATH, 'utf8').trim();
    cachedCapacityWallet = new ethers.Wallet(key);
    logger.info(`[Lit] Capacity wallet loaded from file: ${cachedCapacityWallet.address}`);
    return cachedCapacityWallet;
  }

  logger.info('[Lit] No capacity credit wallet found (not required if registered in Payment Delegation DB).');
  logger.info('[Lit] Optional: set LIT_CAPACITY_KEY env var for legacy delegation, or configure LIT_RELAYER_API_KEY + LIT_PAYER_SECRET_KEY for auto-registration.');
  cachedCapacityWallet = false;
  return null;
}

/**
 * Auto-detect the latest valid RLI token owned by the capacity wallet.
 * Queries the Chronicle Yellowstone chain for the wallet's RLI balance
 * and finds a non-expired token.
 */
async function detectCapacityTokenId(capacityWalletAddress: string): Promise<string> {
  const configured = getConfiguredCapacityTokenId();
  if (configured) {
    logger.info(`[Lit] Using configured capacity token ID: ${configured}`);
    return configured;
  }

  if (cachedCapacityTokenId) return cachedCapacityTokenId;

  try {
    const { ethers } = await import('ethers');
    const { LIT_RPC } = await import('@lit-protocol/constants');
    const provider = new ethers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE);

    const RLI_CONTRACT = '0xd3DEC8965Aa9676a6AfB4e4D05DA14E28D8f11e8';
    const rliAbi = [
      'function balanceOf(address owner) view returns (uint256)',
      'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
      'function capacity(uint256 tokenId) view returns (uint256 requestsPerKilosecond, uint256 expiresAt)',
    ];

    const rli = new ethers.Contract(RLI_CONTRACT, rliAbi, provider);
    const balance = await rli.balanceOf(capacityWalletAddress);
    const count = Number(balance);

    if (count === 0) {
      logger.warn('[Lit] Capacity wallet owns no RLI tokens');
      return '';
    }

    let bestTokenId = '';
    let bestExpiry = 0;
    const now = Math.floor(Date.now() / 1000);

    for (let i = 0; i < Math.min(count, 30); i++) {
      try {
        const tokenId = await rli.tokenOfOwnerByIndex(capacityWalletAddress, i);
        const cap = await rli.capacity(tokenId);
        const expiresAt = Number(cap.expiresAt);
        if (expiresAt > now && expiresAt > bestExpiry) {
          bestExpiry = expiresAt;
          bestTokenId = tokenId.toString();
        }
      } catch { continue; }
    }

    if (bestTokenId) {
      const expiryDate = new Date(bestExpiry * 1000).toISOString().split('T')[0];
      logger.info(`[Lit] Auto-detected capacity token #${bestTokenId} (expires ${expiryDate})`);
      cachedCapacityTokenId = bestTokenId;
      return bestTokenId;
    }

    logger.warn('[Lit] All RLI tokens are expired');
    return '';
  } catch (err: any) {
    logger.error('[Lit] Failed to auto-detect capacity token:', err.message);
    return getConfiguredCapacityTokenId();
  }
}

let litClientInstance: any = null;
let litConnecting: Promise<void> | null = null;

async function getLitClient() {
  if (litClientInstance?.ready) {
    return litClientInstance;
  }

  if (litConnecting) {
    await litConnecting;
    if (litClientInstance?.ready) return litClientInstance;
  }

  const { LitNodeClientNodeJs } = await import('@lit-protocol/lit-node-client-nodejs');
  const { LIT_NETWORK } = await import('@lit-protocol/constants');

  litClientInstance = new LitNodeClientNodeJs({
    litNetwork: LIT_NETWORK.Datil,
    debug: false,
    connectTimeout: 120000,
  });

  litConnecting = litClientInstance.connect().then(() => {
    logger.info(`[Lit] Connected to Datil production (${litClientInstance.connectedNodes?.size || 0} nodes)`);
    litConnecting = null;
  }).catch((err: Error) => {
    logger.error('[Lit] Connection failed:', err.message);
    litClientInstance = null;
    litConnecting = null;
    throw err;
  });

  await litConnecting;
  return litClientInstance;
}

// ── Lit Action Configuration ───────────────────────────────────────
// Resolution is now provision-cache → hardcoded constant only. See
// chipotle-client.ts `getDecryptActionCid()`. The legacy env/file
// override path (LIT_ACTION_CID, data/.lit-action-cid) was removed; to
// rotate the action, update the supernode provision payload.
import { getDecryptActionCid } from './chipotle-client.js';
const DEFAULT_NON_MEDIA_ACTION_CID = getDecryptActionCid();

// Legacy decrypt CIDs accepted in delegation.actionIpfsId for backwards
// compatibility with assets encrypted under previous Lit Actions. Those
// legacy actions return the plaintext CEK (≤32 bytes); the unified
// `recoverCEKViaEnvelope` detects short payloads and passes them through.
const LEGACY_NON_MEDIA_ACTION_CIDS: ReadonlySet<string> = new Set([
  'bafkreihvm4zkyuefnuptlbdins6cmd2mbslj2xgnyzz3ssdg2ggg3jtkk4', // V1.2 sigauth non-media decrypt
  'QmSHMSxPogSsNki51fenDzsrkKB3eJfRMHXEPZKqPk6EAb',              // legacy media decrypt
]);

let NON_MEDIA_ACTION_CID = DEFAULT_NON_MEDIA_ACTION_CID;
logger.info(`[Lit] Action CID: ${NON_MEDIA_ACTION_CID}`);

// ── Lit Backend Selection ─────────────────────────────────────────
// LIT_BACKEND=datil (default)    — use Datil SDK (WebSocket, SIWE, capacity credits)
// LIT_BACKEND=chipotle           — use Chipotle REST API (stateless, API key auth)
//   Chipotle uses PKP-AES (Lit.Actions.Encrypt/Decrypt) for new assets.
//   Datil uses threshold BLS (client.encrypt/decryptAndCombine) for existing assets.
//   The litBackend metadata field on each asset tracks which scheme was used.
type LitBackend = 'chipotle' | 'datil';
const LIT_BACKEND: LitBackend = (process.env.LIT_BACKEND as LitBackend) || 'chipotle';
logger.info(`[Lit] Backend: ${LIT_BACKEND} (set LIT_BACKEND=chipotle for Chipotle REST API)`);

/**
 * Returns the server's authoritative sigauth Lit Action CID. Used by other
 * modules (e.g. media.ts) so that legacy PSSH-recorded action CIDs are
 * overridden by the server-controlled sigauth action when backend=chipotle.
 */
export function getNonMediaActionCid(): string {
  return NON_MEDIA_ACTION_CID || '';
}

/**
 * Returns true if the given CID is a known-good legacy decrypt action.
 * Used to honor PSSH-recorded actionIpfsId for assets encrypted under
 * previous Lit Actions instead of forcing them to the current CID.
 */
export function isLegacyNonMediaActionCid(cid: string): boolean {
  return LEGACY_NON_MEDIA_ACTION_CIDS.has(cid);
}

const DEFAULT_AUTHORITY = '0x09dBe796f40ECEffEAccf243c3d758C4c1d8D87D';

// ── Rate limiting for Lit endpoints ───────────────────────────
// Prevents cost-drain attacks by limiting Lit Action calls per user.
// 30 Lit calls/minute per wallet — enough for browsing, blocks abuse.
const LIT_RATE_LIMIT_WINDOW_MS = 60_000;
const LIT_RATE_LIMIT_MAX_CALLS = 30;
const litRateLimiter = new Map<string, { count: number; windowStart: number }>();

function checkLitRateLimit(walletAddress: string): boolean {
  const now = Date.now();
  const key = walletAddress.toLowerCase();
  const entry = litRateLimiter.get(key);

  if (!entry || now - entry.windowStart > LIT_RATE_LIMIT_WINDOW_MS) {
    litRateLimiter.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= LIT_RATE_LIMIT_MAX_CALLS) {
    return false;
  }

  entry.count++;
  return true;
}

// Periodic cleanup of stale rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of litRateLimiter) {
    if (now - entry.windowStart > LIT_RATE_LIMIT_WINDOW_MS * 2) {
      litRateLimiter.delete(key);
    }
  }
}, LIT_RATE_LIMIT_WINDOW_MS);

// ── Promise coalescing for concurrent Lit calls ──────────────
// Prevents duplicate $0.01 charges when concurrent requests hit for the same kid+buyer.
const pendingLitCalls = new Map<string, Promise<string>>();

// ── Session-scoped CEK cache ──────────────────────────────────
// Short-lived in-memory cache to avoid redundant Lit Action calls within a
// single viewing session (e.g. multi-page PDFs, multi-chapter EPUBs,
// window resize re-renders).
//
// Properties:
//   - 5 minute TTL, memory-only, cleared on process restart
//   - Keyed on (kid + buyerAddress.toLowerCase()) so different users
//     never share CEKs and checksummed/flat addresses collapse to one entry
//   - True LRU eviction: reads promote to most-recently-used; inserts at
//     capacity evict the least-recently-used entry
//   - Never written to disk — the AuthorityGateway remains the source of truth
//
// Known access-revocation tail: if a user's on-chain access is revoked
// after first decryption, they retain decrypt capability for the remainder
// of the TTL window. POST /api/admin/cache/flush-cek force-invalidates.
const CEK_CACHE_TTL_MS = 5 * 60 * 1000;
const CEK_CACHE_MAX_ENTRIES = 50;

// Aggregate counters for observability + admin flush diagnostics.
const cekCacheStats = {
  hits: 0,
  misses: 0,
  evictions: 0,
  expirations: 0,
  manualFlushes: 0,
  coalesced: 0,
};

const cekSessionCache = new Map<string, { cekBase64: string; expiresAt: number }>();

function cekCacheKey(kid: string, buyerAddress: string): string {
  return `${kid}:${buyerAddress.toLowerCase()}`;
}

function getCachedCEK(kid: string, buyerAddress: string): string | null {
  const key = cekCacheKey(kid, buyerAddress);
  const entry = cekSessionCache.get(key);
  if (!entry) {
    cekCacheStats.misses++;
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    cekSessionCache.delete(key);
    cekCacheStats.expirations++;
    cekCacheStats.misses++;
    return null;
  }
  // LRU promote: Map preserves insertion order, so delete-then-set moves
  // this entry to the tail (most-recently-used position). Next eviction
  // will pick the head of the Map (least-recently-used).
  cekSessionCache.delete(key);
  cekSessionCache.set(key, entry);
  cekCacheStats.hits++;
  return entry.cekBase64;
}

function cacheCEK(kid: string, buyerAddress: string, cekBase64: string): void {
  const key = cekCacheKey(kid, buyerAddress);
  // If the key already exists, we still want to promote it — delete first.
  if (cekSessionCache.has(key)) {
    cekSessionCache.delete(key);
  } else if (cekSessionCache.size >= CEK_CACHE_MAX_ENTRIES) {
    // Evict least-recently-used (head of insertion-ordered Map).
    const oldest = cekSessionCache.keys().next().value;
    if (oldest) {
      cekSessionCache.delete(oldest);
      cekCacheStats.evictions++;
    }
  }
  cekSessionCache.set(key, { cekBase64, expiresAt: Date.now() + CEK_CACHE_TTL_MS });
}

/**
 * Drop cached CEKs. Called by the admin flush endpoint (access revocation,
 * emergency response) and can be narrowed to a single kid or user.
 *
 * @param opts.kid           When set, only entries for this content kid are removed.
 * @param opts.buyerAddress  When set, only entries for this buyer (lowercased) are removed.
 *                           If both set, only the exact pair is removed.
 *                           If neither set, the entire cache is flushed.
 * @returns number of entries removed
 */
export function flushCEKCache(opts: { kid?: string; buyerAddress?: string } = {}): number {
  const kid = opts.kid;
  const addr = opts.buyerAddress ? opts.buyerAddress.toLowerCase() : undefined;

  if (!kid && !addr) {
    const n = cekSessionCache.size;
    cekSessionCache.clear();
    cekCacheStats.manualFlushes += n;
    return n;
  }

  let removed = 0;
  for (const key of Array.from(cekSessionCache.keys())) {
    // Keys are `${kid}:${addr}` — split on last ':' so kids containing ':' still parse.
    const sep = key.indexOf(':');
    if (sep === -1) continue;
    const entryKid = key.slice(0, sep);
    const entryAddr = key.slice(sep + 1);
    const kidMatch = !kid || entryKid === kid;
    const addrMatch = !addr || entryAddr === addr;
    if (kidMatch && addrMatch) {
      cekSessionCache.delete(key);
      removed++;
    }
  }
  cekCacheStats.manualFlushes += removed;
  return removed;
}

export function getCEKCacheStats() {
  return {
    ...cekCacheStats,
    size: cekSessionCache.size,
    capacity: CEK_CACHE_MAX_ENTRIES,
    ttlMs: CEK_CACHE_TTL_MS,
  };
}

/**
 * Build access conditions for Lit encrypt/decrypt.
 *
 * ONLY the self-referential check: ensures only the designated Lit Action
 * code (pinned on IPFS, immutable) can trigger decryption.
 *
 * The actual on-chain access verification (hasAccessByContentId) is performed
 * INSIDE the Lit Action code itself, where it checks the real buyer's address
 * passed via jsParams. This avoids the :userAddress problem where the server
 * wallet would be checked instead of the buyer.
 */
// Self-referential condition: only the Lit Action with this exact CID can decrypt.
// The action is pinned to Pinata (Lit's IPFS backend) so Lit nodes can fetch it.
// The action code itself performs the on-chain hasAccessByContentId() check.
function buildSelfRefConditions(outerActionCid: string, chain = 'base') {
  return [
    {
      conditionType: 'evmBasic',
      contractAddress: '',
      standardContractType: '',
      chain,
      method: '',
      parameters: [':currentActionIpfsId'],
      returnValueTest: {
        comparator: '=',
        value: outerActionCid,
      },
    },
  ];
}

async function createServerAuthSig(client: any, wallet: any) {
  const { createSiweMessage, generateAuthSig } = await import('@lit-protocol/auth-helpers');

  const nonce = await client.getLatestBlockhash();
  const toSign = await createSiweMessage({
    walletAddress: wallet.address,
    nonce,
    expiration: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });

  return generateAuthSig({ signer: wallet, toSign });
}

/**
 * Generate session signatures for Lit Action execution.
 * Requires both AccessControlConditionDecryption and LitActionExecution abilities.
 */
// Session sigs cache: avoids expensive Lit node handshake on every request.
// Sigs are valid for 15 min; we cache for 10 min to leave safety margin.
const SESSION_SIGS_TTL_MS = 10 * 60 * 1000;
let cachedSessionSigs: { sigs: any; createdAt: number } | null = null;
let sessionSigsPromise: Promise<any> | null = null;

async function getExecuteSessionSigs(client: any, wallet: any) {
  if (cachedSessionSigs && (Date.now() - cachedSessionSigs.createdAt) < SESSION_SIGS_TTL_MS) {
    logger.info(`[Lit] Reusing cached session sigs (age: ${Math.round((Date.now() - cachedSessionSigs.createdAt) / 1000)}s)`);
    return cachedSessionSigs.sigs;
  }

  // Coalesce concurrent requests: if another call is already generating sigs, wait for it
  if (sessionSigsPromise) {
    logger.info('[Lit] Session sigs generation in progress — waiting...');
    return sessionSigsPromise;
  }

  sessionSigsPromise = (async () => {
    try {
      const {
        LitAccessControlConditionResource,
        LitActionResource,
        RecapSessionCapabilityObject,
      } = await import('@lit-protocol/auth-helpers');
      const { LIT_ABILITY } = await import('@lit-protocol/constants');
      const { SiweMessage } = await import('siwe');

      const capacityWallet = await getCapacityWallet();
      const expiration = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      const accResource = new LitAccessControlConditionResource('*');
      const actionResource = new LitActionResource('*');

      const resourceAbilityRequests = [
        { resource: accResource, ability: LIT_ABILITY.AccessControlConditionDecryption },
        { resource: actionResource, ability: LIT_ABILITY.LitActionExecution },
      ];

      const sessionCapabilityObject = new RecapSessionCapabilityObject({}, []);
      sessionCapabilityObject.addCapabilityForResource(
        accResource,
        LIT_ABILITY.AccessControlConditionDecryption
      );
      sessionCapabilityObject.addCapabilityForResource(
        actionResource,
        LIT_ABILITY.LitActionExecution
      );

      const sessionOpts: any = {
        chain: 'ethereum',
        expiration,
        resourceAbilityRequests,
        sessionCapabilityObject,
        authNeededCallback: async (params: any) => {
          const siweMessage = new SiweMessage({
            domain: params.domain || 'localhost',
            address: wallet.address,
            statement: params.statement || 'Lit Protocol session signature',
            uri: params.uri || 'https://localhost/login',
            version: '1',
            chainId: 1,
            nonce: params.nonce || await client.getLatestBlockhash(),
            expirationTime: params.expiration || expiration,
            resources: params.resources || [],
          });
          const messageToSign = siweMessage.prepareMessage();
          const signature = await wallet.signMessage(messageToSign);
          return {
            sig: signature,
            derivedVia: 'web3.eth.personal.sign',
            signedMessage: messageToSign,
            address: wallet.address,
          };
        },
      };

      await ensureDelegateeRegistered(wallet.address);

      if (capacityWallet) {
        const tokenId = await detectCapacityTokenId(capacityWallet.address);
        if (tokenId) {
          try {
            const { capacityDelegationAuthSig } = await client.createCapacityDelegationAuthSig({
              dAppOwnerWallet: capacityWallet,
              capacityTokenId: tokenId,
              delegateeAddresses: [wallet.address],
              uses: '10',
              expiration: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            });
            sessionOpts.capacityDelegationAuthSig = capacityDelegationAuthSig;
            logger.info(`[Lit] Capacity delegation attached (token #${tokenId})`);
          } catch (delegErr: any) {
            logger.warn(`[Lit] Capacity delegation auth sig failed (delegation DB should cover): ${delegErr.message}`);
          }
        } else {
          logger.warn('[Lit] No valid capacity token found — relying on Payment Delegation DB');
        }
      }

      const sessionSigs = await client.getSessionSigs(sessionOpts);
      logger.info(`[Lit] Session sigs generated (${Object.keys(sessionSigs).length} nodes) — cached for ${SESSION_SIGS_TTL_MS / 60000} min`);

      cachedSessionSigs = { sigs: sessionSigs, createdAt: Date.now() };
      return sessionSigs;
    } finally {
      sessionSigsPromise = null;
    }
  })();

  return sessionSigsPromise;
}

/**
 * POST /api/storage/lit/encrypt
 * Two-layer encryption: AES-GCM for the file, Lit Protocol for the CEK.
 *
 * 1. Generate a random AES-256 key (CEK)
 * 2. AES-GCM encrypt the file data with the CEK (no size limit)
 * 3. Lit-encrypt only the CEK (32 bytes) with access conditions
 *
 * Body: { data: string (base64), actionCid?: string }
 * Response: { ciphertext (Lit-encrypted CEK), dataToEncryptHash, actionCid,
 *             conditions, encryptedData (AES-encrypted file, base64), iv (base64) }
 */
router.post('/lit/encrypt', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, actionCid } = req.body;

    if (!data) {
      res.status(400).json({ error: 'Missing required field: data (base64)' });
      return;
    }

    const effectiveActionCid = actionCid || NON_MEDIA_ACTION_CID;
    if (!effectiveActionCid) {
      res.status(400).json({
        error: 'No Lit Action CID configured. Pass actionCid in request body, or update the supernode provision payload.',
      });
      return;
    }

    const dataBytes = Buffer.from(data, 'base64');
    if (dataBytes.length === 0) {
      res.status(400).json({ error: 'Empty data' });
      return;
    }
    if (dataBytes.length > 100 * 1024 * 1024) {
      res.status(400).json({ error: 'Data exceeds 100MB limit' });
      return;
    }

    logger.info(`[Lit] Encrypting ${dataBytes.length} bytes (two-layer: AES + Lit CEK)`);

    // Layer 1: AES-256-GCM encrypt inside WASM — plaintext stays in WASM linear memory,
    // but the generated CEK is returned to Node.js for Lit-wrapping (see CEK Exposure Assessment).
    const wasmBinary = await loadRendererBinary();
    // Phase 2-D (deferred): deep dDRM helper, ambient pull preserved.
    const wasmRuntime = getWASMRuntime();
    const wasmEncryptResult = await wasmRuntime.executeEncrypt(wasmBinary, dataBytes, { timeoutMs: 60000 });

    if (!wasmEncryptResult.success || !wasmEncryptResult.encryptedBytes || !wasmEncryptResult.cekBase64 || !wasmEncryptResult.ivBase64) {
      throw new Error(`WASM encrypt failed: ${wasmEncryptResult.error || 'no output'}`);
    }

    const encryptedWithTag = wasmEncryptResult.encryptedBytes;
    const cekBase64 = wasmEncryptResult.cekBase64;
    const ivBase64 = wasmEncryptResult.ivBase64;

    logger.info(`[Lit] AES-GCM encrypted via WASM: ${dataBytes.length} → ${encryptedWithTag.length} bytes (${wasmEncryptResult.executionTimeMs}ms)`);

    // Layer 2: Lit-encrypt only the raw CEK (32 bytes — well under 4MB limit)
    let litCiphertext: string;
    let dataToEncryptHash: string;
    let litBackend: 'chipotle' | 'datil';

    if (LIT_BACKEND === 'chipotle') {
      const { encryptWithLitAction, DEFAULT_AUTHORITY } = await import('./chipotle-client.js');

      // Generate canonical 128-bit (16-byte) KID for non-media. Derived
      // from a UUIDv4 with dashes stripped — same shape as the media KID
      // produced by dashPackager::generateCEK(). Width matches the on-chain
      // bytes16 contentId so a single identifier applies across asset
      // types. See MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.
      const { randomUUID } = await import('crypto');
      const kidHex = randomUUID().replace(/-/g, '');
      const kidBytes = Buffer.from(kidHex, 'hex');
      const kidBase64 = kidBytes.toString('base64');

      const chipotleResult = await encryptWithLitAction({
        dataToEncrypt: Buffer.from(cekBase64, "base64"),
        kid: kidBase64,
        authority: DEFAULT_AUTHORITY,
        accessControlConditions: [],
      });
      litCiphertext = chipotleResult.ciphertext;
      dataToEncryptHash = String(chipotleResult.dataToEncryptHash || '');
      litBackend = 'chipotle';
      logger.info(`[Lit] CEK encrypted via Chipotle PKP-AES. Hash: ${dataToEncryptHash?.substring(0, 20)}...`);

      res.json({
        success: true,
        litCiphertext,
        dataToEncryptHash,
        kid: '0x' + kidHex,
        signature: chipotleResult.signature || '',
        issuer: chipotleResult.issuer || '',
        actionCid: effectiveActionCid,
        conditions: [],
        encryptedData: encryptedWithTag.toString('base64'),
        iv: ivBase64,
        litBackend,
        format: 'hex',
      });
    } else {
      throw new Error("Only Lit over Chipotle is supported");
    }
  } catch (error: any) {
    logger.error('[Lit] Encryption error:', error);
    res.status(500).json({ error: error.message || 'Lit encryption failed' });
  }
});

/**
 * Shared two-layer decryption: Lit Action recovers CEK, then AES-GCM decrypts file.
 * Returns raw decrypted Buffer. Caller is responsible for zeroing it after use.
 */
export interface DecryptParams {
  litCiphertext: string;
  dataToEncryptHash: string;
  iv: string;
  encryptedDataCid: string;
  kid: string;
  actionCid?: string;
  authority?: string;
  chain?: string;
  chainId?: number;
  rpc?: string;
  buyerAddress: string;
  litBackend?: LitBackend;
  /** V3 protection data: PKP issuer address (checksummed). Optional for legacy assets. */
  issuer?: string;
  /** V3 protection data: PKP signature over composite hash. Optional for legacy assets. */
  signature?: string;
  /**
   * Optional session-key delegation bundle (Option C). When present,
   * Phase 2c passes these through to the Lit Action instead of
   * `userAddress`. When absent, the legacy `userAddress` path runs.
   */
  secureViewSession?: {
    delegationCanonical: string;
    delegationSig: `0x${string}`;
    requestCanonical: string;
    requestSig: `0x${string}`;
  };
}

/**
 * Recover the CEK via Lit Protocol and fetch encrypted bytes from IPFS.
 * Returns { cekBase64, encryptedBytes } — the CEK is base64-encoded, the
 * encrypted bytes are raw. Neither the CEK nor plaintext is exposed here;
 * callers choose whether to AES-decrypt in Node.js or delegate to WASM.
 */
interface CEKRecoveryResult {
  cekBase64: string;
  encryptedBytes: Buffer;
}

async function recoverCEKAndFetchData(params: DecryptParams, ipfsService?: any): Promise<CEKRecoveryResult> {
  const {
    litCiphertext, dataToEncryptHash, encryptedDataCid, kid,
    actionCid, buyerAddress,
  } = params;

  // Server-controlled: never derive from client-supplied values
  const effectiveAuthority = DEFAULT_AUTHORITY;
  const effectiveChain = 'base';
  const effectiveChainId = 8453;
  const effectiveRpc = getBaseRpcUrl();
  const effectiveBackend = params.litBackend || LIT_BACKEND;

  logger.info(`[Lit] Recover CEK: kid=${kid}, buyer=${buyerAddress}, cid=${encryptedDataCid}, backend=${effectiveBackend}`);

  // Check session cache — avoids a $0.01 Lit call for multi-page PDFs
  // and re-renders within the same viewing session (5 min TTL).
  const cachedCek = getCachedCEK(kid, buyerAddress);

  // Kick off CEK recovery and IPFS fetch in parallel
  const litStart = Date.now();
  const coalescingKey = `${kid}:${buyerAddress.toLowerCase()}`;
  const cekPromise = (async () => {
    if (cachedCek) {
      logger.info(`[Lit] CEK cache hit for kid=${kid}, buyer=${buyerAddress.substring(0, 10)}... (saved $0.01)`);
      return cachedCek;
    }

    // Promise coalescing: if another request is already fetching this CEK, reuse the in-flight call
    const pending = pendingLitCalls.get(coalescingKey);
    if (pending) {
      cekCacheStats.coalesced++;
      logger.info(`[Lit] Coalescing duplicate Lit call for kid=${kid} (saved $0.01)`);
      return pending;
    }

    const doLitCall = async (): Promise<string> => {
      try {
        if (effectiveBackend === 'chipotle') {
          const { recoverCEKViaEnvelope } = await import('./chipotle-client.js');
          // Legacy support: if the asset's protection data carries its own
          // actionIpfsId, use it (the asset was encrypted against that specific
          // Lit Action and the delegation is bound to it). Otherwise fall back
          // to the server's configured universal decrypt CID.
          const effectiveActionCid = actionCid || NON_MEDIA_ACTION_CID;
          if (!effectiveActionCid) {
            throw new Error('No Lit Action CID configured (NON_MEDIA_ACTION_CID)');
          }
          if (actionCid && actionCid !== NON_MEDIA_ACTION_CID) {
            logger.info(`[Lit] Using legacy actionCid from protection data: ${actionCid}`);
          }
          const cekBase64 = await recoverCEKViaEnvelope({
            litCiphertext,
            dataToEncryptHash,
            kid,
            buyerAddress,
            actionCid: effectiveActionCid,
            authority: effectiveAuthority,
            chain: effectiveChain,
            chainId: effectiveChainId,
            rpc: effectiveRpc,
            signature: params.signature,
            issuer: params.issuer,
            secureViewSession: params.secureViewSession!,
          });
          logger.info(`[Lit] CEK recovered in ${Date.now() - litStart}ms (Chipotle REST)`);
          cacheCEK(kid, buyerAddress, cekBase64);
          return cekBase64;
        }

        // Datil fallback (LIT_BACKEND=datil). Phase 5 cutover: the
        // sigauth Lit Action recovers the authorised address from
        // delegation.coveredAddresses, so `userAddress` is no longer
        // sent as a jsParam. NON_MEDIA_ACTION_CID is authoritative.
        const wallet = await getServerWallet();
        const client = await getLitClient();
        const sessionSigs = await getExecuteSessionSigs(client, wallet);

        if (!NON_MEDIA_ACTION_CID) {
          throw new Error('No Lit Action CID configured (NON_MEDIA_ACTION_CID)');
        }
        if (!params.secureViewSession) {
          // Belt-and-braces: the HTTP handler already rejects bundle-less
          // requests, but recoverCEKAndFetchData is also called from
          // other code paths and we want the sigauth invariant enforced
          // at the Lit boundary too.
          throw new Error('secureViewSession bundle is required for Lit decryption');
        }

        const datilNonMediaParams: Record<string, unknown> = {
          ciphertext: litCiphertext,
          dataToEncryptHash,
          kid: kid.startsWith('0x') ? kid : `0x${kid}`,
          actionIpfsId: NON_MEDIA_ACTION_CID,
          authority: effectiveAuthority,
          chain: effectiveChain,
          chainId: effectiveChainId,
          rpc: effectiveRpc,
          delegation: params.secureViewSession.delegationCanonical,
          delegationSig: params.secureViewSession.delegationSig,
          request: params.secureViewSession.requestCanonical,
          requestSig: params.secureViewSession.requestSig,
        };
        const executeParams: any = {
          sessionSigs,
          jsParams: datilNonMediaParams,
          ipfsId: NON_MEDIA_ACTION_CID,
        };

        const result = await client.executeJs(executeParams);
        if (!result.response) throw new Error('Lit Action returned empty response');

        let cekBase64: string;
        try {
          const parsed = JSON.parse(result.response);
          if (parsed.error) throw new Error(parsed.error);
          cekBase64 = parsed.data || result.response;
        } catch (e: any) {
          if (e.message?.includes('Access denied')) throw e;
          cekBase64 = result.response;
        }

        logger.info(`[Lit] CEK recovered in ${Date.now() - litStart}ms (Datil SDK)`);
        cacheCEK(kid, buyerAddress, cekBase64);
        return cekBase64;
      } finally {
        pendingLitCalls.delete(coalescingKey);
      }
    };

    const callPromise = doLitCall();
    pendingLitCalls.set(coalescingKey, callPromise);
    return callPromise;
  })();

  // IPFS fetch: try local blockstore directly first, then HTTP fallback
  const ipfsStart = Date.now();
  const ipfsPromise = (async (): Promise<Buffer> => {
    // Direct local blockstore read — avoids HTTP round-trip to self
    if (ipfsService) {
      try {
        const bytes = await ipfsService.getFile(encryptedDataCid);
        if (bytes && bytes.length > 0) {
          logger.info(`[Lit] Fetched encrypted file: ${bytes.length} bytes from local blockstore (${Date.now() - ipfsStart}ms)`);
          return bytes;
        }
      } catch {
        logger.info(`[Lit] Local blockstore miss for ${encryptedDataCid}, trying HTTP...`);
      }
    }

    // HTTP fallback: localhost API then remote gateway
    const ipfsUrls = [
      `http://localhost:4200/ipfs/${encryptedDataCid}`,
      `https://ipfs.ela.city/ipfs/${encryptedDataCid}`,
    ];

    for (const url of ipfsUrls) {
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          logger.info(`[Lit] Fetched encrypted file: ${buf.length} bytes from ${url.includes('localhost') ? 'local IPFS' : 'Elacity IPFS'} (${Date.now() - ipfsStart}ms)`);
          return buf;
        }
      } catch { /* try next */ }
    }

    throw new Error(`Failed to fetch encrypted file from IPFS: ${encryptedDataCid}`);
  })();

  // Wait for both in parallel — IPFS fetch often completes while Lit is still working
  const [cekBase64, encryptedBytes] = await Promise.all([cekPromise, ipfsPromise]);

  if (!encryptedBytes || encryptedBytes.length === 0) {
    throw new Error(`Failed to fetch encrypted file from IPFS: ${encryptedDataCid}`);
  }

  return { cekBase64, encryptedBytes };
}

/**
 * Full two-layer decryption: Lit recovers CEK, AES-GCM decrypts file.
 * Primary path: WASM decrypt-only (decryption in WASM linear memory;
 *   CEK passes through Node.js during MemFS write).
 * Fallback: Node.js crypto for very large files or WASM failures.
 * Returns raw decrypted Buffer. Caller is responsible for zeroing it after use.
 */
const WASM_DECRYPT_MAX_BYTES = 200 * 1024 * 1024; // 200MB — above this, Node.js crypto is used (CEK briefly in V8)

export async function decryptAssetTwoLayer(params: DecryptParams, ipfsService?: any): Promise<Buffer> {
  const { cekBase64, encryptedBytes } = await recoverCEKAndFetchData(params, ipfsService);

  // Chipotle REST API may return base64 without padding — the Rust WASM
  // decrypt-only code path requires standard padded base64.
  const paddedCek = cekBase64.length % 4 === 0 ? cekBase64 : cekBase64 + '='.repeat(4 - (cekBase64.length % 4));

  // WASM path: decryption happens in WASM, but CEK is passed in via command.json
  if (encryptedBytes.length <= WASM_DECRYPT_MAX_BYTES) {
    try {
      const wasmBinary = await loadRendererBinary();
      // Phase 2-D (deferred): deep dDRM helper, ambient pull preserved.
      const runtime = getWASMRuntime();
      const result = await runtime.executeDecryptOnly(
        wasmBinary,
        paddedCek,
        params.iv,
        'application/octet-stream',
        encryptedBytes,
        { timeoutMs: 60000 },
      );

      if (result.success && result.decryptedBytes) {
        logger.info(`[Lit] Two-layer decrypt (WASM): ${result.decryptedBytes.length} bytes in ${result.executionTimeMs}ms for ${params.buyerAddress}`);
        return result.decryptedBytes;
      }

      logger.warn(`[Lit] WASM decrypt-only failed (${result.error}), falling back to Node.js`);
    } catch (wasmErr: any) {
      logger.warn(`[Lit] WASM decrypt-only error: ${wasmErr.message}, falling back to Node.js`);
    }
  } else {
    logger.info(`[Lit] File too large for WASM decrypt (${encryptedBytes.length}B > ${WASM_DECRYPT_MAX_BYTES}B), using Node.js`);
  }

  // Node.js fallback
  const crypto = await import('crypto');
  const cekBytes = Buffer.from(cekBase64, 'base64');
  const ivBytes = Buffer.from(params.iv, 'base64');

  if (cekBytes.length !== 32) {
    logger.warn(`[Lit] CEK length unexpected: ${cekBytes.length} bytes (expected 32)`);
  }

  const authTagLength = 16;
  const ciphertextOnly = encryptedBytes.subarray(0, encryptedBytes.length - authTagLength);
  const authTag = encryptedBytes.subarray(encryptedBytes.length - authTagLength);

  const decipher = crypto.createDecipheriv('aes-256-gcm', cekBytes, ivBytes);
  decipher.setAuthTag(authTag);
  const decryptedBytes = Buffer.concat([decipher.update(ciphertextOnly), decipher.final()]);

  cekBytes.fill(0);

  if (decryptedBytes.length === 0) throw new Error('AES decryption returned empty data');

  logger.info(`[Lit] Two-layer decrypt (Node.js fallback): ${decryptedBytes.length} bytes for ${params.buyerAddress}`);
  return decryptedBytes;
}

/**
 * POST /api/storage/lit/decrypt
 * DEPRECATED — raw plaintext endpoint removed for security.
 * Use /api/storage/lit/secure-view instead, which returns only rendered pixels.
 */
router.post('/lit/decrypt', authenticate, async (_req: AuthenticatedRequest, res: Response) => {
  res.status(410).json({
    error: 'This endpoint has been removed for security. Use /api/storage/lit/secure-view instead.',
  });
});

/**
 * GET /api/storage/admin/cek-cache/stats
 *
 * Owner-only. Returns CEK cache observability counters — hits, misses,
 * evictions, expirations, manual flushes, coalesced Lit calls, plus
 * current size / capacity / TTL.
 *
 * Useful for: diagnosing cost spikes (many misses = cache thrash, bump
 * capacity), verifying coalescing is working (high coalesced = good),
 * auditing manual flush activity.
 */
router.get('/admin/cek-cache/stats', authenticate, requireOwner, (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    ok: true,
    stats: getCEKCacheStats(),
  });
});

/**
 * POST /api/storage/admin/cek-cache/flush
 *
 * Owner-only. Force-invalidates cached CEKs. Use when:
 *   - A user's on-chain access has been revoked and you need to enforce
 *     the cutoff before the 5-minute TTL elapses
 *   - A content kid has been rotated and stale CEKs could be misused
 *   - Debugging / incident response
 *
 * Body (all optional):
 *   { kid?: string, buyerAddress?: string }
 *
 * Behaviour:
 *   - No body / empty body → full cache flush
 *   - kid only              → flush every user's entry for that kid
 *   - buyerAddress only     → flush every kid's entry for that buyer
 *   - both                  → flush the single (kid, buyer) pair
 *
 * Response: { ok: true, removed: number, stats: <current stats> }
 */
router.post('/admin/cek-cache/flush', authenticate, requireOwner, (req: AuthenticatedRequest, res: Response) => {
  const body = (req.body || {}) as { kid?: string; buyerAddress?: string };
  const kid = typeof body.kid === 'string' && body.kid.length > 0 ? body.kid : undefined;
  const buyerAddress = typeof body.buyerAddress === 'string' && body.buyerAddress.length > 0 ? body.buyerAddress : undefined;

  // Light input validation — prevents oversized garbage payloads polluting logs.
  if (kid && kid.length > 256) {
    res.status(400).json({ error: 'kid too long' });
    return;
  }
  if (buyerAddress && buyerAddress.length > 128) {
    res.status(400).json({ error: 'buyerAddress too long' });
    return;
  }

  const removed = flushCEKCache({ kid, buyerAddress });
  const actor = req.user?.wallet_address || 'unknown';
  const scope = kid && buyerAddress ? `kid=${kid.substring(0, 12)}…,buyer=${buyerAddress.substring(0, 10)}…`
    : kid ? `kid=${kid.substring(0, 12)}…`
      : buyerAddress ? `buyer=${buyerAddress.substring(0, 10)}…`
        : 'all';
  logger.info(`[CEKCache] Manual flush by ${actor.substring(0, 10)}… — scope=${scope}, removed=${removed}`);

  res.json({
    ok: true,
    removed,
    stats: getCEKCacheStats(),
  });
});

// ── WASM Renderer Integration ────────────────────────────────────────
//
// The dDRM WASM renderer performs decryption + rendering inside WASM linear
// memory. The *rendered pixels* and plaintext stay in WASM. However, the
// CEK is passed INTO WASM via command.json (base64), so it briefly exists
// in Node.js memory during the MemFS write. See CAPSULE_COMPATIBILITY.md
// "CEK Exposure Assessment" for the full data-flow audit.
// Path: wasm-apps/ddrm-renderer/ddrm-renderer.wasm

const DDRM_RENDERER_PATH = 'wasm-apps/ddrm-renderer/ddrm-renderer.wasm';
let cachedRendererBinary: ArrayBuffer | null = null;

async function loadRendererBinary(): Promise<ArrayBuffer> {
  if (cachedRendererBinary) return cachedRendererBinary;
  // Phase 2-D (deferred): deep dDRM helper, ambient pull preserved.
  const runtime = getWASMRuntime();
  cachedRendererBinary = await runtime.loadFromFile(DDRM_RENDERER_PATH);
  logger.info(`[SecureView] dDRM renderer WASM loaded (${cachedRendererBinary.byteLength} bytes)`);
  return cachedRendererBinary;
}

interface WASMRenderResult {
  contentType: string;
  rendered: Buffer;
  totalPages?: number;
  executionTimeMs: number;
  /** EPUB: total spine chapters. */
  totalChapters?: number;
  /** EPUB: table of contents (cached on first chapter request). */
  chapters?: Array<{ title: string; chapter_index: number; href: string }>;
  /** EPUB: `true` when rendition:layout=pre-paginated (fall back to pixel-lock). */
  fixedLayout?: boolean;
  /** EPUB: publication title from OPF metadata. */
  epubTitle?: string;
  /** EPUB: publication author from OPF metadata. */
  epubAuthor?: string;
}

/**
 * Render an asset via the WASM universal renderer.
 * Recovers CEK from Lit, fetches encrypted bytes from IPFS, then delegates
 * decryption + rendering to the WASM sandbox. Returns null if WASM rendering
 * is not available for the given MIME type.
 */
async function renderViaWASM(
  params: DecryptParams,
  mime: string,
  maxWidth: number,
  page?: number,
  ipfsService?: any,
  chapter?: number,
  viewportWidth?: number,
): Promise<WASMRenderResult | null> {
  const { cekBase64, encryptedBytes } = await recoverCEKAndFetchData(params, ipfsService);

  const paddedCek = cekBase64.length % 4 === 0 ? cekBase64 : cekBase64 + '='.repeat(4 - (cekBase64.length % 4));

  const watermarkText = `${params.buyerAddress.substring(0, 10)}...${params.buyerAddress.substring(params.buyerAddress.length - 6)} ${new Date().toISOString().split('T')[0]}`;
  const isEpub = mime === 'application/epub+zip' || mime === 'application/epub';

  const command: RendererCommand = {
    cek_b64: paddedCek,
    iv_b64: params.iv,
    mime_type: mime,
    watermark: watermarkText,
    page: !isEpub && page ? page - 1 : undefined,
    chapter: isEpub ? (chapter ?? 0) : undefined,
    max_width: maxWidth,
    max_height: Math.round(maxWidth * 1.5),
    output_format: isEpub ? 'html' : 'jpeg',
    forensic_mark: isEpub ? params.buyerAddress : undefined,
    viewport_width: isEpub ? (viewportWidth || 680) : undefined,
  };

  const wasmBinary = await loadRendererBinary();
  // Phase 2-D (deferred): deep dDRM helper, ambient pull preserved.
  const runtime = getWASMRuntime();
  const output = await runtime.executeRenderer(wasmBinary, command, encryptedBytes, {
    timeoutMs: 60000,
  });

  if (!output.result.success) {
    throw new Error(`WASM renderer: ${output.result.error}`);
  }

  // EPUB pre-paginated publications signal `fixed_layout=true` without
  // rendered bytes; caller should retry as CBZ-like pixel-lock.
  if (!output.renderedBytes && output.result.fixed_layout) {
    return {
      contentType: 'application/epub+zip',
      rendered: Buffer.alloc(0),
      totalPages: output.result.total_chapters,
      executionTimeMs: output.executionTimeMs,
      fixedLayout: true,
      totalChapters: output.result.total_chapters,
      epubTitle: output.result.epub_title,
      epubAuthor: output.result.epub_author,
    };
  }

  if (!output.renderedBytes) {
    throw new Error('WASM renderer produced no output');
  }

  return {
    contentType: output.result.content_type || 'image/jpeg',
    rendered: output.renderedBytes,
    totalPages: output.result.total_pages,
    executionTimeMs: output.executionTimeMs,
    totalChapters: output.result.total_chapters,
    chapters: output.result.chapters,
    fixedLayout: output.result.fixed_layout,
    epubTitle: output.result.epub_title,
    epubAuthor: output.result.epub_author,
  };
}

// ────────────────────────────────────────────────────────────────────
// Secure-View Session endpoints (Option C — session-key delegation)
//
// These endpoints implement the client-facing half of the Lit Action
// signature-auth protocol defined in
// `.cursor/tasks/LIT-ACTION-SIGNATURE-AUTH/DESIGN.md`.
//
// Lifecycle:
//   1. Client calls /begin-session with its ephemeral P-256 pubkey;
//      server returns an unsigned SecureViewDelegation payload bound
//      to the current Lit Action CID, chain, and owner.
//   2. User's wallet signs the canonical JSON (EIP-191 personal_sign);
//      client posts { delegation, delegationSig } to /complete-session.
//      Server verifies (EIP-191 first, EIP-1271 fallback via viem
//      PublicClient) and returns { ok: true, expiresAt }.
//   3. On every /lit/secure-view call the client attaches
//      { delegation, delegationSig, request, requestSig } — the
//      request fields are silently produced by the ephemeral key.
//   4. /revoke-session adds the delegation nonce to the per-node
//      revoke map for the rest of its natural window.
//
// No delegation state is persisted across PC2 restarts — each node
// re-verifies on every request, and the Lit Action inside the TEE
// is the real access boundary.
// ────────────────────────────────────────────────────────────────────

/** Lazy viem PublicClient for EIP-1271 eth_calls. */
let __viemPublicClient: any = null;
async function getViemPublicClient() {
  if (__viemPublicClient) return __viemPublicClient;
  const { createPublicClient, http } = await import('viem');
  const { base } = await import('viem/chains');
  __viemPublicClient = createPublicClient({
    chain: base,
    transport: http(getBaseRpcUrl()),
  });
  return __viemPublicClient;
}

/**
 * eth_call adapter matching the shape `secureViewSession.verifyDelegationEip1271`
 * expects. Delegates to viem.
 */
async function ethCallAdapter(tx: { to: `0x${string}`; data: `0x${string}` }): Promise<`0x${string}`> {
  const client = await getViemPublicClient();
  const raw = await client.request({
    method: 'eth_call',
    params: [{ to: tx.to, data: tx.data }, 'latest'],
  });
  return raw as `0x${string}`;
}

/**
 * POST /api/storage/lit/begin-session
 * Body: { sessionPublicKey: `0x04${string}`, coveredAddresses?: `0x${string}`[], ttlSeconds?: number }
 * Returns: { delegation: SecureViewDelegation, delegationCanonical: string, expectedActionIpfsId: string }
 *
 * `sessionPublicKey` is the client's ephemeral P-256 SEC1 uncompressed
 * public key (65 bytes). `coveredAddresses` defaults to
 * `[wallet_address, smart_account_address]` from the authenticated
 * session — clients can pass a subset but cannot introduce addresses
 * not attested by the PC2 session.
 */
router.post('/lit/begin-session', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user?.wallet_address;
    const smartAccountAddress = req.user?.smart_account_address;
    if (!walletAddress) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { sessionPublicKey, coveredAddresses, ttlSeconds } = req.body || {};
    if (typeof sessionPublicKey !== 'string' || !/^0x04[0-9a-fA-F]{128}$/.test(sessionPublicKey)) {
      res.status(400).json({ error: 'sessionPublicKey must be 65-byte SEC1 uncompressed P-256 hex (0x04||X||Y)' });
      return;
    }

    const defaultCovered: `0x${string}`[] = [walletAddress as `0x${string}`];
    if (smartAccountAddress && smartAccountAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      defaultCovered.push(smartAccountAddress as `0x${string}`);
    }

    let requestedCovered: `0x${string}`[] = defaultCovered;
    if (Array.isArray(coveredAddresses) && coveredAddresses.length > 0) {
      // Must be a subset of the authenticated session's addresses — we
      // never let the client smuggle addresses we haven't verified.
      const allowed = new Set(defaultCovered.map((a) => a.toLowerCase()));
      const filtered = coveredAddresses.filter(
        (a: unknown): a is `0x${string}` =>
          typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a) && allowed.has(a.toLowerCase()),
      );
      if (filtered.length === 0) {
        res.status(400).json({ error: 'coveredAddresses contains no address from the authenticated session' });
        return;
      }
      requestedCovered = filtered;
    }

    const actionIpfsId = NON_MEDIA_ACTION_CID;
    if (!actionIpfsId) {
      res.status(503).json({ error: 'Lit Action CID not configured on this node' });
      return;
    }

    const ttl = Math.min(
      Number.isFinite(ttlSeconds) ? Math.max(60, Number(ttlSeconds)) : MAX_DELEGATION_WINDOW_SECONDS,
      MAX_DELEGATION_WINDOW_SECONDS,
    );

    const delegation = buildDelegationPayload({
      ownerAddress: walletAddress as `0x${string}`,
      coveredAddresses: requestedCovered,
      sessionPublicKey: sessionPublicKey as `0x${string}`,
      actionIpfsId,
      chainId: 8453,
      ttlSeconds: ttl,
    });

    res.json({
      delegation,
      delegationCanonical: canonicalize(delegation),
      expectedActionIpfsId: actionIpfsId,
      maxDelegationWindowSeconds: MAX_DELEGATION_WINDOW_SECONDS,
      requestFreshnessWindowSeconds: REQUEST_FRESHNESS_WINDOW_SECONDS,
    });
  } catch (err: any) {
    logger.error(`[SecureView.session] begin-session failed: ${err.message}`);
    res.status(500).json({ error: err.message || 'begin-session failed' });
  }
});

/**
 * POST /api/storage/lit/complete-session
 * Body: { delegation: string | SecureViewDelegation, delegationSig: string }
 * Returns: { ok: true, ownerAddress, expiresAt, coveredAddresses } | { error }
 *
 * Server verifies the delegation was legitimately signed by the owner
 * address (EIP-191 first, EIP-1271 via eth_call fallback). This is a
 * "try it now" check — the client can confirm its session is workable
 * before attempting to open any assets. No state is persisted: every
 * /lit/secure-view re-verifies independently.
 */
router.post('/lit/complete-session', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { delegation: delIn, delegationSig } = req.body || {};
    if (!delIn || typeof delegationSig !== 'string') {
      res.status(400).json({ error: 'Missing delegation or delegationSig' });
      return;
    }

    // Accept either canonical JSON string or a parsed object.
    let delegationObj: SecureViewDelegation;
    let delegationCanonical: string;
    if (typeof delIn === 'string') {
      try {
        delegationObj = JSON.parse(delIn);
      } catch {
        res.status(400).json({ error: 'delegation is not valid JSON' });
        return;
      }
      delegationCanonical = delIn;
    } else {
      delegationObj = delIn;
      delegationCanonical = canonicalize(delIn);
    }

    // Session sanity: delegation.ownerAddress must match the authenticated wallet.
    if (
      typeof delegationObj.ownerAddress !== 'string' ||
      delegationObj.ownerAddress.toLowerCase() !== walletAddress.toLowerCase()
    ) {
      res.status(403).json({ error: 'delegation.ownerAddress does not match authenticated session' });
      return;
    }

    // actionIpfsId sanity — accept the current configured CID or any
    // known-good legacy CID (assets baked under previous Lit Actions
    // carry their own actionIpfsId in PSSH and the delegation has to
    // bind to that CID for the legacy Lit Action to accept it).
    const delegationActionCid = delegationObj.actionIpfsId;
    const isCurrentCid = delegationActionCid === NON_MEDIA_ACTION_CID;
    const isLegacyCid = LEGACY_NON_MEDIA_ACTION_CIDS.has(delegationActionCid);
    if (!isCurrentCid && !isLegacyCid) {
      res.status(400).json({ error: 'delegation.actionIpfsId does not match server-configured or known-legacy CID' });
      return;
    }
    if (isLegacyCid) {
      logger.info(`[SecureView.session] Legacy actionIpfsId accepted: ${delegationActionCid}`);
    }

    // EIP-191 first
    const recovered = await verifyDelegationEip191(delegationCanonical, delegationSig as `0x${string}`);
    let valid = recovered !== null && recovered.toLowerCase() === delegationObj.ownerAddress.toLowerCase();

    // EIP-1271 fallback — for smart wallets where the owner address IS a contract.
    if (!valid) {
      try {
        const { hashMessage } = await import('viem');
        const messageHash = hashMessage(delegationCanonical) as `0x${string}`;
        valid = await verifyDelegationEip1271(
          delegationObj.ownerAddress as `0x${string}`,
          messageHash,
          delegationSig as `0x${string}`,
          ethCallAdapter,
        );
      } catch (e: any) {
        logger.debug(`[SecureView.session] EIP-1271 fallback threw: ${e.message}`);
      }
    }

    if (!valid) {
      res.status(400).json({ error: 'Delegation signature does not verify (EIP-191 + EIP-1271 both failed)' });
      return;
    }

    res.json({
      ok: true,
      ownerAddress: delegationObj.ownerAddress,
      expiresAt: delegationObj.expiresAt,
      coveredAddresses: delegationObj.coveredAddresses,
      actionIpfsId: delegationObj.actionIpfsId,
    });
  } catch (err: any) {
    logger.error(`[SecureView.session] complete-session failed: ${err.message}`);
    res.status(500).json({ error: err.message || 'complete-session failed' });
  }
});

/**
 * POST /api/storage/lit/revoke-session
 * Body: { delegationNonce: `0x${string}`, expiresAt?: number }
 * Returns: { ok: true }
 *
 * Adds the delegation nonce to the per-node revoke map for the rest
 * of its natural window. The Lit Action cannot see our revoke map
 * (it is stateless across nodes), so this is a best-effort server-side
 * block: it prevents /lit/secure-view on THIS node from honouring the
 * delegation. Attackers with a fresh delegation that has not been
 * revoked on every node can still use it, which is why delegations
 * are intentionally short-lived.
 */
router.post('/lit/revoke-session', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { delegationNonce, expiresAt } = req.body || {};
    if (typeof delegationNonce !== 'string' || !/^0x[0-9a-fA-F]+$/.test(delegationNonce)) {
      res.status(400).json({ error: 'delegationNonce must be hex-encoded' });
      return;
    }
    const exp =
      Number.isFinite(expiresAt) && Number(expiresAt) > 0
        ? Number(expiresAt)
        : Math.floor(Date.now() / 1000) + MAX_DELEGATION_WINDOW_SECONDS;
    revokeDelegation(delegationNonce as `0x${string}`, exp);
    logger.info(
      `[SecureView.session] Revoked delegation nonce=${delegationNonce.substring(0, 10)}… by ${req.user?.wallet_address?.substring(0, 10)}…`,
    );
    res.json({ ok: true });
  } catch (err: any) {
    logger.error(`[SecureView.session] revoke-session failed: ${err.message}`);
    res.status(500).json({ error: err.message || 'revoke-session failed' });
  }
});

/**
 * GET /api/storage/admin/session-cache/stats (owner-only)
 * Surface in-memory session cache sizes for ops visibility.
 */
router.get(
  '/admin/session-cache/stats',
  authenticate,
  requireOwner,
  (_req: AuthenticatedRequest, res: Response) => {
    res.json(_getSessionCacheStats());
  },
);

/**
 * POST /api/storage/lit/secure-view
 * Secure viewer: decrypts asset server-side, renders to a locked representation,
 * streams binary. The raw file NEVER leaves server memory.
 *
 * Two render tiers:
 *   • Pixel-lock — images, PDFs, CBZ comics, source code → JPEG/WebP/PNG
 *   • HTML-lock  — reflowable EPUB → sanitized XHTML (no JS, strict CSP),
 *                   zero-width forensic watermark + diagonal SVG overlay
 *
 * Primary path: WASM renderer (plaintext confined to WASM linear memory;
 *   CEK passes through Node.js during MemFS write — see CEK Exposure Assessment)
 * Fallback: Node.js Sharp/Canvas/PDF.js (for PDFs or when WASM unavailable)
 *
 * Body: same as /lit/decrypt, plus:
 *   mimeType: string,   -- original asset MIME (image/png, application/pdf, etc.)
 *   page?: number,       -- page number for PDFs / CBZ (1-indexed, default 1)
 *   chapter?: number,    -- chapter index for EPUB (0-indexed, default 0)
 *   maxWidth?: number,   -- max render width (default 1200)
 *   viewportWidth?: number, -- EPUB reader pane width in CSS px (default 680)
 *
 * Response: pixel-lock returns image/jpeg; html-lock returns text/html
 *   Headers: X-Asset-Type, X-Asset-Pages (PDF/CBZ), X-Asset-Chapters (EPUB),
 *            X-Asset-TOC (base64 JSON for EPUB TOC), X-Watermark, X-Renderer
 *
 * Runtime convergence: this handler maps 1:1 to the future Viewer Provider
 *   Capsule. Capability scopes consumed: drm:decrypt, drm:verify-access,
 *   storage:fetch. Provided: drm:render. See PC2_CONVERGENCE_INVENTORY.
 */
router.post('/lit/secure-view', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  // Telemetry hook (A5b §P0): "Door 4" of the v1.2 funnel. Fires exactly
  // once per node lifetime — the first time a paid-content decrypt SUCCEEDS
  // (response status 2xx). Uses res.on('finish') because this handler has
  // 6 success exit points; wrapping each one would be brittle.
  recordTelemetryOnSuccess(req.app.locals.db, 'first_payment', res);

  const requestStart = Date.now();
  try {
    const {
      litCiphertext, dataToEncryptHash, iv, encryptedDataCid, kid,
      mimeType,
      page: pageNum,
      chapter: reqChapter,
      maxWidth: reqMaxWidth,
      viewportWidth: reqViewportWidth,
      litBackend: reqLitBackend,
      // Session-key delegation fields (Option C) — optional until
      // Phase 2d swaps the Lit Action CID to the verifying version.
      delegation: delegationIn,
      delegationSig,
      request: sessionRequestIn,
      requestSig,
    } = req.body;

    // Derive buyer addresses from authenticated session — never trust client
    const buyerAddress = req.user?.wallet_address;
    const buyerAddressAlt = req.user?.smart_account_address || undefined;

    if (!litCiphertext || !dataToEncryptHash || !kid || !buyerAddress || !iv || !encryptedDataCid) {
      res.status(400).json({ error: 'Missing required fields for secure view' });
      return;
    }

    // ── Session-sig enforcement (Phase 5 hard cutover) ──
    // The secure-view session bundle is now MANDATORY. The legacy
    // `userAddress`-in-jsParams path has been retired; any request
    // without { delegation, delegationSig, request, requestSig } is
    // rejected outright. The Lit Action still re-verifies everything
    // independently — this block fails malformed / expired / replayed
    // bundles fast, before we spend a $0.01 Lit call.
    const hasAnyBundleField =
      delegationIn !== undefined ||
      delegationSig !== undefined ||
      sessionRequestIn !== undefined ||
      requestSig !== undefined;

    if (
      !hasAnyBundleField ||
      delegationIn === undefined ||
      typeof delegationSig !== 'string' ||
      sessionRequestIn === undefined ||
      typeof requestSig !== 'string'
    ) {
      logger.warn(
        `[SecureView] Request rejected: session bundle missing or incomplete (buyer=${buyerAddress.substring(0, 10)}…)`,
      );
      res.status(401).json({
        error: 'session_bundle_required',
        message:
          'Secure-view requires a signed delegation + request bundle. Call POST /api/storage/lit/begin-session first.',
      });
      return;
    }

    {
      const delegationCanonical =
        typeof delegationIn === 'string' ? delegationIn : canonicalize(delegationIn);
      const requestCanonical =
        typeof sessionRequestIn === 'string' ? sessionRequestIn : canonicalize(sessionRequestIn);

      const { hashMessage } = await import('viem');
      const verify = await verifySecureViewBundle(
        {
          delegation: delegationCanonical,
          delegationSig: delegationSig as `0x${string}`,
          request: requestCanonical,
          requestSig: requestSig as `0x${string}`,
        },
        {
          expectedActionIpfsId: NON_MEDIA_ACTION_CID,
          expectedChainId: 8453,
          expectedKid: kid,
          ethCall: ethCallAdapter,
          messageHashForEip1271: hashMessage(delegationCanonical) as `0x${string}`,
        },
      );

      if (!verify.ok) {
        logger.warn(`[SecureView] Session bundle rejected: ${verify.error}`);
        res.status(401).json({ error: 'session_bundle_invalid', code: verify.error });
        return;
      }

      // Cross-check against authenticated session: delegation owner
      // must match the PC2-authenticated wallet. Prevents a user with
      // session X from handing us a delegation signed by a different
      // wallet Y.
      const del = verify.delegation!;
      if (
        del.ownerAddress.toLowerCase() !== buyerAddress.toLowerCase() &&
        (!buyerAddressAlt || del.ownerAddress.toLowerCase() !== buyerAddressAlt.toLowerCase())
      ) {
        logger.warn(
          `[SecureView] 403 delegation/session mismatch: owner=${del.ownerAddress.substring(0, 10)}… buyer=${buyerAddress.substring(0, 10)}… buyerAlt=${(buyerAddressAlt || '').substring(0, 10) || '(none)'}…`,
        );
        res.status(403).json({ error: 'delegation.ownerAddress does not match authenticated session' });
        return;
      }

      // Set a header so ops can see the session layer is in effect.
      res.setHeader('X-SecureView-Session', 'verified');
      logger.info(
        `[SecureView] Session bundle verified: owner=${del.ownerAddress.substring(0, 10)}… covered=${del.coveredAddresses.length}`,
      );
    }

    const mime = (mimeType || 'application/octet-stream').toLowerCase();
    const maxWidth = Math.min(reqMaxWidth || 1200, 2400);

    // Security headers
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'X-Asset-Type': mime,
      'X-Watermark': buyerAddress,
    });

    const ipfsService = req.app.locals.ipfs;

    // ── Preflight: resolve which address holds the AccessToken ──
    // Free on-chain eth_call — avoids wasting a $0.01 Lit Action on the wrong address.
    // Server-controlled: RPC and authority are NEVER taken from client requests.
    const effectiveBody = { ...req.body };
    const rpcUrl = getBaseRpcUrl();
    const authorityAddr = DEFAULT_AUTHORITY;
    let resolvedBuyer = buyerAddress;

    if (buyerAddressAlt && buyerAddressAlt.toLowerCase() !== buyerAddress.toLowerCase()) {
      try {
        const { ethers } = await import('ethers');
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const gateway = new ethers.Contract(authorityAddr, [
          'function hasAccessByContentId(address holder, bytes16 contentId) view returns (bool)',
        ], provider);
        const normalizedKid = kid.startsWith('0x') ? kid : `0x${kid}`;

        const [primaryHas, altHas] = await Promise.all([
          gateway.hasAccessByContentId(buyerAddress, normalizedKid).catch(() => false),
          gateway.hasAccessByContentId(buyerAddressAlt, normalizedKid).catch(() => false),
        ]);

        if (!primaryHas && altHas) {
          resolvedBuyer = buyerAddressAlt;
          logger.info(`[SecureView] Preflight: primary ${buyerAddress.substring(0, 10)} lacks AccessToken, using alt ${buyerAddressAlt.substring(0, 10)}`);
        } else if (primaryHas) {
          logger.info(`[SecureView] Preflight: primary ${buyerAddress.substring(0, 10)} holds AccessToken`);
        } else {
          logger.warn(`[SecureView] Preflight: neither address holds AccessToken — proceeding with primary`);
        }
      } catch (preflightErr: any) {
        logger.warn(`[SecureView] Preflight access check failed (non-fatal): ${preflightErr.message}`);
      }
    }

    effectiveBody.buyerAddress = resolvedBuyer;
    effectiveBody.rpc = rpcUrl;
    effectiveBody.authority = authorityAddr;

    // Pre-canonicalized session bundle forwarded to the Lit Action
    // via recoverNonMediaCEK. Always populated — the bundle is
    // mandatory (enforced above) and has been verified.
    effectiveBody.secureViewSession = {
      delegationCanonical:
        typeof delegationIn === 'string' ? delegationIn : canonicalize(delegationIn),
      delegationSig: delegationSig as `0x${string}`,
      requestCanonical:
        typeof sessionRequestIn === 'string' ? sessionRequestIn : canonicalize(sessionRequestIn),
      requestSig: requestSig as `0x${string}`,
    };

    // ── Rate Limiting ────────────────────────────────────
    if (!checkLitRateLimit(buyerAddress)) {
      logger.warn(`[SecureView] Rate limit exceeded for ${buyerAddress.substring(0, 10)}...`);
      res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
      return;
    }

    // ── WASM Renderer Path ──────────────────────────────
    // For images, text, PDFs, EPUB, and CBZ: decrypt + render inside WASM
    // linear memory. Plaintext stays in WASM; CEK passes through Node.js
    // during MemFS write.
    const wasmCodeTypes = ['application/javascript', 'application/json', 'application/xml', 'application/x-yaml', 'application/toml', 'application/x-sh'];
    const isEpub = mime === 'application/epub+zip' || mime === 'application/epub';
    const isCbz = mime === 'application/vnd.comicbook+zip' || mime === 'application/x-cbz';
    const wasmSupportedTypes = mime.startsWith('image/')
      || mime.startsWith('text/')
      || mime === 'application/pdf'
      || wasmCodeTypes.includes(mime)
      || isEpub
      || isCbz;
    if (wasmSupportedTypes) {
      try {
        const wasmResult = await renderViaWASM(
          effectiveBody,
          mime,
          maxWidth,
          pageNum,
          ipfsService,
          typeof reqChapter === 'number' ? reqChapter : undefined,
          typeof reqViewportWidth === 'number' ? Math.min(Math.max(reqViewportWidth, 320), 1600) : undefined,
        );
        if (wasmResult) {
          // Fixed-layout EPUB: tell the client to retry as pixel-lock.
          if (wasmResult.fixedLayout && wasmResult.rendered.length === 0) {
            res.set('X-Renderer', 'wasm');
            res.set('X-Asset-Layout', 'fixed');
            if (wasmResult.totalChapters) {
              res.set('X-Asset-Chapters', String(wasmResult.totalChapters));
            }
            if (wasmResult.epubTitle) res.set('X-Asset-Title', encodeURIComponent(wasmResult.epubTitle));
            if (wasmResult.epubAuthor) res.set('X-Asset-Author', encodeURIComponent(wasmResult.epubAuthor));
            res.status(409).json({
              error: 'epub-fixed-layout',
              message: 'Pre-paginated EPUB detected — use pixel-lock tier per chapter.',
              totalChapters: wasmResult.totalChapters || 0,
            });
            logger.info(`[SecureView] EPUB fixed-layout detected (${wasmResult.totalChapters} chapters) for ${resolvedBuyer}`);
            return;
          }

          res.set('Content-Type', wasmResult.contentType);
          res.set('Content-Length', String(wasmResult.rendered.length));
          res.set('X-Renderer', 'wasm');
          if (wasmResult.totalPages) res.set('X-Asset-Pages', String(wasmResult.totalPages));
          if (wasmResult.totalChapters) res.set('X-Asset-Chapters', String(wasmResult.totalChapters));
          if (wasmResult.epubTitle) res.set('X-Asset-Title', encodeURIComponent(wasmResult.epubTitle));
          if (wasmResult.epubAuthor) res.set('X-Asset-Author', encodeURIComponent(wasmResult.epubAuthor));
          if (wasmResult.chapters && wasmResult.chapters.length > 0) {
            // TOC is returned once; client caches it for the session.
            const tocB64 = Buffer.from(JSON.stringify(wasmResult.chapters), 'utf8').toString('base64');
            res.set('X-Asset-TOC', tocB64);
          }
          if (isEpub) {
            // Strict CSP for sanitized HTML: no JS, no remote resources.
            // Images are inlined as data-URIs by the WASM sanitizer.
            res.set(
              'Content-Security-Policy',
              "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none';",
            );
          }
          res.send(wasmResult.rendered);
          logger.info(`[SecureView] WASM rendered ${mime}: ${wasmResult.rendered.length} bytes (wasm: ${wasmResult.executionTimeMs}ms, total: ${Date.now() - requestStart}ms) for ${resolvedBuyer}`);
          return;
        }
      } catch (wasmErr: any) {
        logger.warn(`[SecureView] WASM renderer failed, falling back to Node.js: ${wasmErr.message}`);
        // EPUB and CBZ have no Node.js fallback — surface the error.
        if (isEpub || isCbz) {
          res.status(500).json({ error: `Ebook/comic render failed: ${wasmErr.message}` });
          return;
        }
      }
    }

    // ── Node.js Fallback Path ───────────────────────────
    // Used for PDFs (WASM PDF not yet implemented) and when WASM fails.
    const decryptedBytes = await decryptAssetTwoLayer(effectiveBody, ipfsService);

    // ── Image pipeline (fallback) ────────────────────────
    if (mime.startsWith('image/')) {
      let sharpMod: any;
      try {
        const mod = await import('sharp');
        sharpMod = mod.default || mod;
      } catch {
        decryptedBytes.fill(0);
        res.status(500).json({ error: 'Sharp not available for image rendering' });
        return;
      }

      const watermarkText = `${buyerAddress.substring(0, 10)}...${buyerAddress.substring(buyerAddress.length - 6)}`;
      const timestamp = new Date().toISOString().split('T')[0];

      const metadata = await sharpMod(decryptedBytes).metadata();
      const imgW = Math.min(metadata.width || 800, maxWidth);
      const imgH = metadata.height ? Math.round(metadata.height * (imgW / (metadata.width || 800))) : 600;

      const watermarkSvg = Buffer.from(`<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="wm" x="0" y="0" width="320" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(-25)">
            <text x="10" y="30" font-family="monospace" font-size="13" fill="rgba(255,255,255,0.18)" stroke="rgba(0,0,0,0.08)" stroke-width="0.5">${watermarkText}</text>
            <text x="10" y="52" font-family="monospace" font-size="10" fill="rgba(255,255,255,0.12)">${timestamp}</text>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wm)"/>
      </svg>`);

      const rendered = await sharpMod(decryptedBytes)
        .resize({ width: maxWidth, withoutEnlargement: true })
        .composite([{ input: watermarkSvg, gravity: 'centre' }])
        .jpeg({ quality: 82 })
        .toBuffer();

      decryptedBytes.fill(0);

      res.set('Content-Type', 'image/jpeg');
      res.set('Content-Length', String(rendered.length));
      res.set('X-Renderer', 'nodejs-sharp');
      res.send(rendered);

      logger.info(`[SecureView] Image rendered (fallback): ${rendered.length} bytes (${imgW}x${imgH}, total: ${Date.now() - requestStart}ms) for ${buyerAddress}`);
      return;
    }

    // ── PDF pipeline ─────────────────────────────────────
    if (mime === 'application/pdf') {
      let pdfjsMod: any;
      let canvasMod: any;
      let sharpMod: any;
      try {
        pdfjsMod = await import('pdfjs-dist/legacy/build/pdf.mjs');
        canvasMod = await import('canvas');
        const smod = await import('sharp');
        sharpMod = smod.default || smod;
      } catch {
        decryptedBytes.fill(0);
        res.status(500).json({ error: 'PDF.js/Canvas/Sharp not available for PDF rendering' });
        return;
      }

      const createCanvas = canvasMod.createCanvas;
      const registerFont = canvasMod.registerFont;
      const uint8 = new Uint8Array(decryptedBytes);

      const pdfjsResolved = fileURLToPath(import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs'));
      const fontDir = join(dirname(pdfjsResolved), '..', '..', 'standard_fonts');

      if (registerFont) {
        const fonts = [
          { file: 'LiberationSans-Regular.ttf', family: 'LiberationSans' },
          { file: 'LiberationSans-Bold.ttf', family: 'LiberationSans', weight: 'bold' },
          { file: 'LiberationSans-Italic.ttf', family: 'LiberationSans', style: 'italic' },
          { file: 'LiberationSans-BoldItalic.ttf', family: 'LiberationSans', weight: 'bold', style: 'italic' },
        ];
        for (const f of fonts) {
          try { registerFont(join(fontDir, f.file), { family: f.family, weight: f.weight, style: f.style }); } catch { /* already registered */ }
        }
      }

      class NodeCanvasFactory {
        create(w: number, h: number) { const c = createCanvas(w, h); return { canvas: c, context: c.getContext('2d') }; }
        reset(cc: any, w: number, h: number) { cc.canvas.width = w; cc.canvas.height = h; }
        destroy(cc: any) { cc.canvas.width = 0; cc.canvas.height = 0; }
      }

      const pdfDoc = await pdfjsMod.getDocument({
        data: uint8,
        canvasFactory: new NodeCanvasFactory(),
        useSystemFonts: true,
        disableFontFace: true,
      }).promise;
      const totalPages = pdfDoc.numPages;
      const requestedPage = Math.max(1, Math.min(pageNum || 1, totalPages));

      const pdfPage = await pdfDoc.getPage(requestedPage);
      const viewport = pdfPage.getViewport({ scale: 1.0 });
      const scale = Math.min(maxWidth / viewport.width, 2.0);
      const scaledVp = pdfPage.getViewport({ scale });

      const cvs = createCanvas(scaledVp.width, scaledVp.height);
      const ctx = cvs.getContext('2d');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, scaledVp.width, scaledVp.height);

      await pdfPage.render({ canvasContext: ctx, viewport: scaledVp }).promise;

      const textContent = await pdfPage.getTextContent();
      ctx.fillStyle = '#000000';
      for (const item of textContent.items as any[]) {
        if (!item.str || !item.transform) continue;
        const tx = item.transform;
        const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]) * scale;
        const x = tx[4] * scale;
        const y = scaledVp.height - (tx[5] * scale);
        ctx.font = `${fontSize}px LiberationSans, Helvetica, Arial, sans-serif`;
        ctx.fillText(item.str, x, y);
      }

      const wmText = `${buyerAddress.substring(0, 10)}...${buyerAddress.substring(buyerAddress.length - 6)}`;
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.font = '18px monospace';
      ctx.fillStyle = '#888';
      ctx.translate(scaledVp.width / 2, scaledVp.height / 2);
      ctx.rotate(-Math.PI / 6);
      for (let y = -scaledVp.height; y < scaledVp.height; y += 120) {
        for (let x = -scaledVp.width; x < scaledVp.width; x += 280) {
          ctx.fillText(wmText, x, y);
        }
      }
      ctx.restore();

      const pngBuf = cvs.toBuffer('image/png');
      decryptedBytes.fill(0);

      const rendered = await sharpMod(pngBuf).jpeg({ quality: 85 }).toBuffer();

      res.set('Content-Type', 'image/jpeg');
      res.set('Content-Length', String(rendered.length));
      res.set('X-Asset-Pages', String(totalPages));
      res.set('X-Asset-Page', String(requestedPage));
      res.set('X-Renderer', 'nodejs-pdfjs');
      res.send(rendered);

      logger.info(`[SecureView] PDF page ${requestedPage}/${totalPages} rendered: ${rendered.length} bytes (total: ${Date.now() - requestStart}ms) for ${buyerAddress}`);
      return;
    }

    // ── Text pipeline (fallback) ─────────────────────────
    if (mime.startsWith('text/')) {
      let canvasMod: any;
      let sharpMod: any;
      try {
        canvasMod = await import('canvas');
        const smod = await import('sharp');
        sharpMod = smod.default || smod;
      } catch {
        decryptedBytes.fill(0);
        res.status(500).json({ error: 'Canvas/Sharp not available for text rendering' });
        return;
      }

      const createCanvas = canvasMod.createCanvas;
      const text = decryptedBytes.toString('utf8');
      decryptedBytes.fill(0);

      const fontSize = 14;
      const lineHeight = 20;
      const padding = 24;
      const canvasW = 640;
      const maxCharsPerLine = Math.floor((canvasW - padding * 2) / (fontSize * 0.6));
      const maxOutputLines = 2000;

      // Word-wrap all lines
      const wrappedLines: string[] = [];
      for (const rawLine of text.split('\n')) {
        if (wrappedLines.length >= maxOutputLines) break;
        if (rawLine.trim() === '') {
          wrappedLines.push('');
          continue;
        }
        const words = rawLine.split(/\s+/);
        let current = '';
        for (const word of words) {
          if (wrappedLines.length >= maxOutputLines) break;
          if (current.length + word.length + 1 > maxCharsPerLine && current.length > 0) {
            wrappedLines.push(current);
            current = '';
          }
          if (word.length > maxCharsPerLine && current.length === 0) {
            for (let s = 0; s < word.length && wrappedLines.length < maxOutputLines; s += maxCharsPerLine) {
              wrappedLines.push(word.substring(s, s + maxCharsPerLine));
            }
            continue;
          }
          current = current.length > 0 ? current + ' ' + word : word;
        }
        if (current.length > 0 && wrappedLines.length < maxOutputLines) {
          wrappedLines.push(current);
        }
      }

      const canvasH = Math.max(200, padding * 2 + wrappedLines.length * lineHeight);

      const cvs = createCanvas(canvasW, canvasH);
      const ctx = cvs.getContext('2d');

      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(0, 0, canvasW, canvasH);

      ctx.fillStyle = '#d4d4d4';
      ctx.font = `${fontSize}px monospace`;
      ctx.textBaseline = 'top';

      let y = padding;
      for (const line of wrappedLines) {
        if (y + lineHeight > canvasH - padding) break;
        ctx.fillText(line, padding, y);
        y += lineHeight;
      }

      const wmText = `${buyerAddress.substring(0, 10)}...${buyerAddress.substring(buyerAddress.length - 6)}`;
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.font = '16px monospace';
      ctx.fillStyle = '#aaa';
      ctx.translate(canvasW / 2, canvasH / 2);
      ctx.rotate(-Math.PI / 6);
      for (let wy = -canvasH; wy < canvasH; wy += 100) {
        for (let wx = -canvasW; wx < canvasW; wx += 260) {
          ctx.fillText(wmText, wx, wy);
        }
      }
      ctx.restore();

      const pngBuf = cvs.toBuffer('image/png');
      const rendered = await sharpMod(pngBuf).jpeg({ quality: 85 }).toBuffer();

      res.set('Content-Type', 'image/jpeg');
      res.set('Content-Length', String(rendered.length));
      res.set('X-Renderer', 'nodejs-canvas');
      res.send(rendered);

      logger.info(`[SecureView] Text rendered (fallback): ${rendered.length} bytes (${wrappedLines.length} lines, total: ${Date.now() - requestStart}ms) for ${buyerAddress}`);
      return;
    }

    // ── Audio passthrough ─────────────────────────────────
    // Audio can't be rendered as an image — decrypt and pass through for playback.
    // The viewer displays an HTML5 audio player with anti-piracy measures.
    if (mime.startsWith('audio/')) {
      const audioLen = decryptedBytes.length;
      res.set('Content-Type', mime);
      res.set('Content-Length', String(audioLen));
      res.set('X-Renderer', 'passthrough');
      res.set('X-Asset-Type', 'audio');
      res.send(Buffer.from(decryptedBytes));
      decryptedBytes.fill(0);
      logger.info(`[SecureView] Audio passthrough: ${mime}, ${audioLen} bytes (total: ${Date.now() - requestStart}ms) for ${buyerAddress}`);
      return;
    }

    // ── Interactive content passthrough ───────────────────
    // 3D models, datasets, fonts, and archives are decrypted via WASM (CEK
    // stays in WASM linear memory) then passed to the client for interactive
    // rendering (Three.js, table, @font-face, JSZip). Blob URLs are revoked
    // after the client loads the content.
    const passthroughPrefixes = ['model/', 'font/'];
    const passthroughExact = [
      'text/csv', 'text/tab-separated-values',
      'application/zip', 'application/gzip', 'application/x-tar',
      'application/vnd.ms-fontobject',
    ];
    const isPassthrough = passthroughPrefixes.some(p => mime.startsWith(p)) || passthroughExact.includes(mime);
    if (isPassthrough) {
      const len = decryptedBytes.length;
      res.set('Content-Type', mime);
      res.set('Content-Length', String(len));
      res.set('X-Renderer', 'passthrough');
      res.set('X-Asset-Type', mime.split('/')[0]);
      res.send(Buffer.from(decryptedBytes));
      decryptedBytes.fill(0);
      logger.info(`[SecureView] Passthrough: ${mime}, ${len} bytes (total: ${Date.now() - requestStart}ms) for ${buyerAddress}`);
      return;
    }

    // ── Unsupported type ─────────────────────────────────
    decryptedBytes.fill(0);
    res.status(415).json({
      error: `Secure viewing not yet supported for ${mime}. Use /lit/decrypt for raw access.`,
      mimeType: mime,
    });

  } catch (error: any) {
    logger.error('[SecureView] Error:', error);
    const status = error.message?.includes('Access denied') ? 403 : 500;
    res.status(status).json({ error: error.message || 'Secure view failed' });
  }
});

/**
 * GET /api/storage/lit/server-info
 * Returns the server wallet address and current Lit Action CID.
 */
router.get('/lit/server-info', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const info: any = {
      actionCid: NON_MEDIA_ACTION_CID || null,
      authority: DEFAULT_AUTHORITY,
      backend: LIT_BACKEND,
    };

    res.json(info);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/storage/lit/deploy-action
 * Deploy the non-media Lit Action to IPFS and configure it for use.
 * This uploads the Lit Action JS code to Elacity's IPFS and sets the CID.
 */
router.post('/lit/deploy-action', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actionPath = join(__litDirname, '../../data/lit-actions/non-media-decrypt.js');
    if (!existsSync(actionPath)) {
      res.status(404).json({ error: 'Lit Action source not found at data/lit-actions/non-media-decrypt.js' });
      return;
    }

    const actionCode = readFileSync(actionPath, 'utf8');
    const actionBytes = Buffer.from(actionCode, 'utf8');

    logger.info(`[Lit] Deploying non-media Lit Action (${actionBytes.length} bytes) to IPFS...`);

    const ELACITY_UPLOAD = 'https://base.ela.city/api/2.0/files/upload';
    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(actionBytes)]), 'non-media-decrypt.js');

    const uploadResp = await fetch(ELACITY_UPLOAD, {
      method: 'POST',
      headers: { 'X-Target-Flow': 'ipfs' },
      body: formData,
    });

    if (!uploadResp.ok) {
      const errText = await uploadResp.text();
      res.status(502).json({ error: `IPFS upload failed: ${errText}` });
      return;
    }

    const uploadResult = await uploadResp.json() as any;
    let cid: string | undefined;

    if (uploadResult.cid || uploadResult.Hash || uploadResult.hash) {
      cid = uploadResult.cid || uploadResult.Hash || uploadResult.hash;
    } else if (Array.isArray(uploadResult) && uploadResult[0]?.path) {
      cid = uploadResult[0].path;
    }

    if (!cid) {
      res.status(502).json({ error: 'IPFS upload returned no CID', raw: uploadResult });
      return;
    }

    NON_MEDIA_ACTION_CID = cid;
    logger.info(`[Lit] Non-media Lit Action deployed: ${cid} (in-process only — update supernode provision to persist across restarts)`);

    res.json({
      success: true,
      actionCid: cid,
      ipfsUrl: `https://ipfs.ela.city/ipfs/${cid}`,
    });
  } catch (error: any) {
    logger.error('[Lit] Deploy action error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/storage/ipfs/upload-elacity
 * Upload content to Elacity's IPFS infrastructure for public reachability.
 *
 * Reads raw bytes from the request body (base64) or from a local CID,
 * then uploads to Elacity's IPFS endpoint. Returns the CID that resolves
 * on ipfs.ela.city — no third-party services, fully within the ecosystem.
 *
 * Body: { content: string (base64), filename?: string }
 *   OR: { cid: string, filename?: string }   — reads from local IPFS first
 * Response: { success: true, cid: string, size: number }
 */

router.post('/thumbnail', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { content, mimeType, filename } = req.body;
    if (!content || !mimeType) {
      res.status(400).json({ error: 'content and mimeType are required' });
      return;
    }
    const { generateThumbnail } = await import('../storage/thumbnail.js');
    const buf = Buffer.from(content, 'base64');
    const thumb = await generateThumbnail(buf, mimeType, filename || 'file');
    // Strip data URI prefix if present — callers expect raw base64
    let rawBase64 = thumb;
    if (rawBase64 && rawBase64.includes(',')) {
      rawBase64 = rawBase64.split(',')[1];
    }
    res.json({ thumbnail: rawBase64 });
  } catch (err: any) {
    logger.error('[Thumbnail API] Error:', err.message);
    res.status(500).json({ error: 'Thumbnail generation failed' });
  }
});

// Elacity backend's byte-upload proxy. Has been wedged on its internal
// Kubo /api/v0/add since ~2026-04-21: nginx returns 504 after exactly
// 60 s with no upstream response, regardless of payload size (a 100-byte
// probe and a 500 KB file both block for the full minute). We keep the
// fire-and-forget call as a best-effort byte path, but we never block
// the user response on it — the local Helia store + DHT announce +
// forwardPinToElacityKubo are the authoritative durability path.
const ELACITY_UPLOAD_URL = 'https://base.ela.city/api/2.0/files/upload';
const ELACITY_REPLICATION_TIMEOUT_MS = 8_000;

async function replicateBytesToElacityFireAndForget(
  bytes: Buffer,
  filename: string | undefined,
  expectedCid: string,
): Promise<void> {
  const start = Date.now();
  try {
    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(bytes)]), filename || 'content');
    const resp = await fetch(ELACITY_UPLOAD_URL, {
      method: 'POST',
      headers: { 'X-Target-Flow': 'ipfs' },
      body: formData,
      signal: AbortSignal.timeout(ELACITY_REPLICATION_TIMEOUT_MS),
    });
    const ms = Date.now() - start;
    if (resp.ok) {
      logger.info(`[IPFS-Elacity] base.ela.city replication ok for ${expectedCid} (${ms}ms)`);
    } else {
      logger.warn(
        `[IPFS-Elacity] base.ela.city replication non-2xx for ${expectedCid}: status=${resp.status} (${ms}ms) — local CID + DHT announce remain authoritative`,
      );
    }
  } catch (err: any) {
    const ms = Date.now() - start;
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    logger.warn(
      `[IPFS-Elacity] base.ela.city replication ${isTimeout ? 'timed out' : 'failed'} for ${expectedCid} (${ms}ms): ${err?.message || 'unknown'} — local CID + DHT announce remain authoritative`,
    );
  }
}

router.post('/ipfs/upload-elacity', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { content, cid, filename } = req.body;

    let bytes: Buffer;

    if (content) {
      bytes = Buffer.from(content, 'base64');
    } else if (cid) {
      const ipfs = req.app.locals.ipfs;
      if (!ipfs) {
        res.status(503).json({ error: 'IPFS not available' });
        return;
      }
      bytes = await ipfs.getFile(cid);
    } else {
      res.status(400).json({ error: 'Provide either content (base64) or cid' });
      return;
    }

    if (!bytes || bytes.length === 0) {
      res.status(400).json({ error: 'Empty content' });
      return;
    }

    const ipfs = req.app.locals.ipfs;
    if (!ipfs) {
      res.status(503).json({ error: 'IPFS not available' });
      return;
    }

    // 1. Store locally on Helia first. The resulting CID is byte-identical
    //    to what Elacity's Kubo would have produced (same UnixFS dag-pb
    //    chunking defaults), so callers (elacity-creator) get the canonical
    //    CID immediately rather than waiting up to 60 s for base.ela.city's
    //    wedged byte-upload proxy.
    const cidV1String = await ipfs.storeFile(bytes, { pin: true, announce: true });

    // 2. Convert CIDv1 → CIDv0 for Elacity's go-ipfs gateway compatibility.
    //    Same content hash, just different encoding. CIDv0 only supports
    //    dag-pb (codec 0x70); for raw blocks (codec 0x55) we keep the v1
    //    string. v1.2.7.5: pre-check codec to avoid an expected exception
    //    on every raw-block upload (was emitting warn-level noise).
    const { CID } = await import('multiformats/cid');
    const cidV1 = CID.parse(cidV1String);
    const DAG_PB_CODEC = 0x70;
    let finalCid: string;
    if (cidV1.code === DAG_PB_CODEC) {
      try {
        finalCid = cidV1.toV0().toString();
      } catch (err) {
        logger.warn(`[IPFS-Elacity] Unexpected CIDv1→CIDv0 conversion failure (codec=dag-pb): ${(err as Error).message} — using v1`);
        finalCid = cidV1String;
      }
    } else {
      logger.debug(`[IPFS-Elacity] Keeping CIDv1 (codec=0x${cidV1.code.toString(16)}, CIDv0 requires dag-pb)`);
      finalCid = cidV1String;
    }

    logger.info(`[IPFS-Elacity] Stored locally: ${finalCid} (${bytes.length} bytes) — DHT-announced, replication pending`);

    // 3. Respond IMMEDIATELY with the local CID. Elacity-side reachability
    //    happens via DHT discovery (auto-fired by storeFile above) and the
    //    fire-and-forget pin-forward + byte-replication kicked off below.
    res.json({
      success: true,
      cid: finalCid,
      size: bytes.length,
      replication: 'pending',
    });

    // 4. Ask Elacity's Kubo to durably pin (no-op when env vars unset;
    //    default off until ops gives green light).
    forwardPinToElacityKubo(finalCid);

    // 4b. Mirror to the IPFS Cluster pinning tier when configured (no-op
    //     when SUPERNODE_CLUSTER_PIN_URL/TOKEN unset). One call → CRDT
    //     replication across all cluster peers.
    forwardPinToCluster(finalCid, filename);

    // 5. Best-effort legacy byte-upload to base.ela.city. Hard-capped at
    //    8 s so we move on if the upstream is wedged. Failures logged only.
    void replicateBytesToElacityFireAndForget(bytes, filename, finalCid);
  } catch (error: any) {
    logger.error('[IPFS-Elacity] Upload error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Local IPFS store failed' });
    }
  }
});

/**
 * POST /api/storage/ipfs/upload-elacity-directory
 * Add metadata.json to local IPFS as a flat file, convert CIDv1→CIDv0,
 * then replicate to Elacity for public gateway reachability.
 *
 * CIDv0 (Qm...) is used as the tokenURI because Elacity's go-ipfs gateway
 * resolves CIDv0 natively. The content hash is identical — just different encoding.
 *
 * Body: { files: Record<string, string (base64)> }
 * Response: { success: true, cid: string (CIDv0) }
 */
router.post('/ipfs/upload-elacity-directory', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { files } = req.body;

    if (!files || typeof files !== 'object') {
      res.status(400).json({ error: 'Missing files object' });
      return;
    }

    const ipfs = req.app.locals.ipfs;
    if (!ipfs) {
      res.status(500).json({ error: 'IPFS service not available' });
      return;
    }

    // 1. Add metadata.json as a flat file to local IPFS (returns CIDv1 with dag-pb codec)
    const localFilesPayload = Object.fromEntries(
      Object.entries(files).map(
        ([filename, jsonValue]) => [filename, new TextEncoder().encode(JSON.stringify(jsonValue))]
      )
    );
    const cidV1String = await ipfs.storeDirectory(localFilesPayload, { pin: true, announce: true });
    logger.info(`[IPFS-Elacity] Metadata added to local IPFS: ${cidV1String}`);

    // 2. Convert CIDv1 (bafybei...) to CIDv0 (Qm...) — same content hash,
    //    just different encoding. CIDv0 only supports dag-pb (codec 0x70).
    //    v1.2.7.5: pre-check codec instead of catching an expected throw.
    const { CID } = await import('multiformats/cid');
    const cidV1 = CID.parse(cidV1String);
    const DAG_PB_CODEC = 0x70;
    let cidV0String: string;
    if (cidV1.code === DAG_PB_CODEC) {
      try {
        cidV0String = cidV1.toV0().toString();
      } catch (err) {
        logger.warn(`[IPFS-Elacity] Unexpected CIDv1→CIDv0 conversion failure (codec=dag-pb): ${(err as Error).message} — using v1`);
        cidV0String = cidV1String;
      }
    } else {
      logger.debug(`[IPFS-Elacity] Keeping CIDv1 (codec=0x${cidV1.code.toString(16)}, CIDv0 requires dag-pb)`);
      cidV0String = cidV1String;
    }
    logger.info(`[IPFS-Elacity] CIDv0: ${cidV0String}`);

    // 3. Respond IMMEDIATELY with the local CIDv0. Local Helia and Elacity's
    //    Kubo compute byte-identical CIDs for the same UnixFS payload, so
    //    overwriting finalCid with the remote response would yield the same
    //    string. We therefore skip the synchronous wait and kick off the
    //    Elacity-side replication paths fire-and-forget.
    res.json({ success: true, cid: cidV0String, replication: 'pending' });

    // 4. Ask Elacity's Kubo to durably pin (no-op when env vars unset).
    forwardPinToElacityKubo(cidV0String);

    // 4b. Mirror to the IPFS Cluster pinning tier when configured (no-op
    //     when SUPERNODE_CLUSTER_PIN_URL/TOKEN unset).
    forwardPinToCluster(cidV0String, 'metadata.json');

    // 5. Best-effort legacy byte-upload to base.ela.city (8 s hard cap so we
    //    don't accumulate hung promises when the upstream is wedged).
    void (async () => {
      const start = Date.now();
      try {
        const formData = new FormData();
        formData.append(
          'data',
          new Blob([new TextEncoder().encode(JSON.stringify(files))], { type: 'application/json' }),
          'metadata.json',
        );
        const uploadResp = await fetch(ELACITY_UPLOAD_URL, {
          method: 'POST',
          headers: { 'X-Target-Flow': 'dir,ipfs' },
          body: formData,
          signal: AbortSignal.timeout(ELACITY_REPLICATION_TIMEOUT_MS),
        });
        const ms = Date.now() - start;
        if (uploadResp.ok) {
          logger.info(`[IPFS-Elacity] Metadata replication ok for ${cidV0String} (${ms}ms)`);
        } else {
          logger.warn(
            `[IPFS-Elacity] Metadata replication non-2xx for ${cidV0String}: status=${uploadResp.status} (${ms}ms) — local CID + DHT announce remain authoritative`,
          );
        }
      } catch (replicateErr: any) {
        const ms = Date.now() - start;
        const isTimeout = replicateErr?.name === 'TimeoutError' || replicateErr?.name === 'AbortError';
        logger.warn(
          `[IPFS-Elacity] Metadata replication ${isTimeout ? 'timed out' : 'failed'} for ${cidV0String} (${ms}ms): ${replicateErr?.message || 'unknown'} — local CID + DHT announce remain authoritative`,
        );
      }
    })();
  } catch (error: any) {
    logger.error('[IPFS-Elacity] Metadata upload error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Local IPFS store failed' });
    }
  }
});

// Backend-specific initialization
// Lit SDK (Datil) is ALWAYS needed for encryption (Chipotle doesn't support it).
// Pre-warm the SDK lazily — it connects on first encrypt request.
if (LIT_BACKEND === 'datil') {
  // Full pre-warm: Datil used for both decrypt AND encrypt
  setTimeout(async () => {
    try {
      const [wallet, client] = await Promise.all([getServerWallet(), getLitClient()]);
      await getExecuteSessionSigs(client, wallet);
      logger.info('[Lit] Pre-warm complete: Datil client connected + session sigs cached');
    } catch (err: any) {
      logger.warn(`[Lit] Pre-warm failed (will retry on first request): ${err.message}`);
    }
  }, 2000);
} else {
  logger.info('[Lit] Chipotle REST backend for decrypt. Datil SDK will lazy-connect on first encrypt request.');
}

export { getServerWallet, getLitClient, getExecuteSessionSigs, ensureDelegateeRegistered, getCapacityWallet, detectCapacityTokenId };
export default router;
