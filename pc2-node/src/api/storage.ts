/**
 * Storage API Endpoint
 * 
 * Provides storage usage statistics including IPFS CID data
 */

import { Router, Response } from 'express';
import { authenticate, requireOwner, AuthenticatedRequest } from './middleware.js';
import { requireSecureViewSession, type SecureViewRequest } from './middleware/secureViewSession.js';
import { recordTelemetryOnSuccess } from './telemetry.js';
import { logger } from '../utils/logger.js';
import { getEffectiveStorageLimit } from './info.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { WASMRuntime, RendererCommand } from '../services/wasm/WASMRuntime.js';
import {
  forwardPinToCluster,
  getClusterPinConfig,
  getClusterPinProbeState,
  getClusterPinRetryQueueSnapshot,
  queryClusterPinStatus,
} from '../services/clusterPin.js';
import { getBaseRpcUrl, getPublicProxyUrl, getHealthyBaseRpcUrls, rotateBaseRpc } from '../utils/rpc.js';
import {
  canonicalize,
  verifyDelegationEip1271,
  revokeDelegation,
  _getSessionCacheStats,
  MAX_DELEGATION_WINDOW_SECONDS,
  REQUEST_FRESHNESS_WINDOW_SECONDS,
} from '../utils/secureViewSession.js';
import type { LitBackend, DecryptParams, WASMRenderResult, CEKRecoveryResult, RenderContext } from './renderer/types.js';
import { resolveRenderer } from './renderer/secure-view/registry.js';
export type { DecryptParams } from './renderer/types.js';

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
const pendingLitCalls = new Map<string, Promise<string | undefined>>();

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

/**
 * Parallel cache for WASM-backed sessions. Stores the `ddrm-decrypt` L2
 * `requestHandle` (the opaque integer returned by `unwrapEnvelope`) keyed
 * on `(sessionId, kid, buyer)`. Reusing the handle on subsequent requests
 * (e.g. multi-page PDF/EPUB rendering) skips both the Lit action and the
 * envelope unwrap — the CEK remains in WASM linear memory the whole time.
 *
 * Keyed on sessionId additionally because WASM handles are scoped to the
 * `WasmDdrmDecryptRuntime` instance; if the process restarts, the handle
 * is gone, but so is the session, so the cache invalidates implicitly via
 * `getSessionView(token)` returning null (the session lookup fails first).
 *
 * TTL matches `CEK_CACHE_TTL_MS` (5 min) which is shorter than the WASM L2
 * TTL (2h), so we never serve an expired handle from this cache.
 */
const wasmRequestCache = new Map<string, { handle: number; expiresAt: number }>();

function wasmCacheKey(sessionId: string, kid: string, buyerAddress: string): string {
  return `${sessionId}:${kid}:${buyerAddress.toLowerCase()}`;
}

function getCachedWasmRequestHandle(sessionId: string, kid: string, buyerAddress: string): number | null {
  const key = wasmCacheKey(sessionId, kid, buyerAddress);
  const entry = wasmRequestCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    wasmRequestCache.delete(key);
    return null;
  }
  // LRU promote.
  wasmRequestCache.delete(key);
  wasmRequestCache.set(key, entry);
  return entry.handle;
}

function cacheWasmRequestHandle(sessionId: string, kid: string, buyerAddress: string, handle: number): void {
  const key = wasmCacheKey(sessionId, kid, buyerAddress);
  if (wasmRequestCache.has(key)) {
    wasmRequestCache.delete(key);
  } else if (wasmRequestCache.size >= CEK_CACHE_MAX_ENTRIES) {
    const oldest = wasmRequestCache.keys().next().value;
    if (oldest) wasmRequestCache.delete(oldest);
  }
  wasmRequestCache.set(key, { handle, expiresAt: Date.now() + CEK_CACHE_TTL_MS });
}

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
    // Phase 2-D-helpers: route handler reads wasmRuntime from app.locals;
    // threaded through to deep dDRM helpers below.
    const wasmRuntime = req.app.locals.wasmRuntime as WASMRuntime;
    const wasmBinary = await loadRendererBinary(wasmRuntime);
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

async function recoverWithSession(
  params: DecryptParams,
  ipfsService: any | undefined,
  sessionView: import('./chipotle-client.js').BackendSessionView | import('./chipotle-client.js').WasmSessionView,
): Promise<CEKRecoveryResult> {
  const {
    litCiphertext, 
    dataToEncryptHash, 
    encryptedDataCid, 
    kid,
    actionCid, 
    buyerAddress,
  } = params;

  // Server-controlled: never derive from client-supplied values
  const effectiveAuthority = DEFAULT_AUTHORITY;
  const effectiveChain = 'base';
  const effectiveChainId = 8453;
  // Prefer the operator-configured public proxy URL so the Lit Action's
  // `gateway.hasAccessByContentId(...)` flows through our caching +
  // multi-RPC failover proxy. When unset, hand the Lit Action a
  // currently-HEALTHY public RPC (skips upstreams recently sidelined for
  // 5xx/429) rather than the blind pool head — the action gets one URL
  // with no rotation, so it must not be a known-failing one. See
  // `.cursor/tasks/RPC-PROXY-UNIFICATION-2026-05`.
  const effectiveRpc = getPublicProxyUrl() || getHealthyBaseRpcUrls()[0] || getBaseRpcUrl();
  const effectiveBackend = params.litBackend || LIT_BACKEND;

  logger.info(`[Lit] Recover CEK: kid=${kid}, buyer=${buyerAddress}, cid=${encryptedDataCid}, backend=${effectiveBackend}`);

  // Session cache avoids a $0.01 Lit call for multi-page PDFs and re-renders
  // within the same viewing session (5 min TTL). Per-backend strategy:
  //   - JS view: cache the base64 CEK string (`cekSessionCache`).
  //   - WASM view: cache the `ddrm-decrypt` L2 request handle
  //     (`wasmRequestCache`) keyed on the session as well, since handles
  //     are scoped to the WASM runtime instance. Reusing the handle skips
  //     both the Lit call AND the envelope unwrap — the CEK stays in WASM.
  const isJsBackedView = 'cekBase64' in sessionView;
  const cachedCek = isJsBackedView ? getCachedCEK(kid, buyerAddress) : null;
  // For WASM, only attempt the cache if the view has a stable sessionId
  // (it does — set at construction time from the StoredSession).
  const cachedWasmHandle = !isJsBackedView
    ? getCachedWasmRequestHandle((sessionView as { sessionId: string }).sessionId, kid, buyerAddress)
    : null;
  if (cachedWasmHandle !== null) {
    logger.info(`[Lit] WASM request handle cache hit for kid=${kid}, buyer=${buyerAddress.substring(0, 10)}... (saved $0.01 + envelope unwrap)`);
    // Attach the cached handle to this view so subsequent decryptAsset /
    // decryptSegment calls use it without re-running the Lit action.
    (sessionView as import('./chipotle-client.js').WasmSessionView).attachRequestHandle(cachedWasmHandle);
  }

  // Kick off CEK recovery and IPFS fetch in parallel
  const litStart = Date.now();
  const coalescingKey = `${kid}:${buyerAddress.toLowerCase()}`;
  const cekPromise = (async () => {
    if (cachedCek) {
      logger.info(`[Lit] CEK cache hit for kid=${kid}, buyer=${buyerAddress.substring(0, 10)}... (saved $0.01)`);
      return cachedCek;
    }
    // WASM-cache hit: the request handle was already attached above. The
    // CEK lives in WASM linear memory; we don't need to return a string.
    // The caller will branch on `cekBase64 === undefined` and call
    // sessionView.decryptAsset() which uses the attached handle.
    if (cachedWasmHandle !== null) return undefined;

    // Promise coalescing: if another request is already fetching this CEK, reuse the in-flight call
    const pending = pendingLitCalls.get(coalescingKey);
    if (pending) {
      cekCacheStats.coalesced++;
      logger.info(`[Lit] Coalescing duplicate Lit call for kid=${kid} (saved $0.01)`);
      return pending;
    }

    const doLitCall = async (): Promise<string | undefined> => {
      try {
        if (effectiveBackend === 'chipotle') {
          const { recoverCEKEnvelope } = await import('./chipotle-client.js');

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

          const envelope = await recoverCEKEnvelope(
            {
              litCiphertext,
              dataToEncryptHash,
              kid,
              actionCid: effectiveActionCid,
              authority: effectiveAuthority,
              chain: effectiveChain,
              chainId: effectiveChainId,
              rpc: effectiveRpc,
              ...(params.signature && { signature: params.signature }),
              ...(params.issuer && { issuer: params.issuer }),
            },
            sessionView,
          );

          let cekBase64: string | undefined;
          if (envelope.length <= 32) {
            // Legacy plaintext CEK — pre-envelope Lit Actions returned the
            // CEK directly. This path predates the WASM backend and is JS
            // only (the byte string IS the CEK, so we surface it as cekBase64).
            cekBase64 = envelope.toString('base64');
          } else {
            await sessionView.unwrapEnvelope(envelope);
            // `cekBase64` lives only on the JS-backed view. WASM-backed
            // views keep the CEK inside WASM and expose it through
            // `decryptAsset` / `decryptSegment`. Callers branch:
            //   - decryptAssetTwoLayer: ignores cekBase64, uses
            //     `sessionView.decryptAsset(encryptedBytes, iv)` — backend-agnostic.
            //   - renderViaWASM: still reads cekBase64 for the JS path; for
            //     WASM it calls `sessionView.decryptAsset` and uses the
            //     renderer's `render_only` mode with plaintext.
            if ('cekBase64' in sessionView) {
              cekBase64 = sessionView.cekBase64;
            } else {
              cekBase64 = undefined;
              // Cache the freshly-minted WASM L2 handle so subsequent
              // /lit/secure-view calls for the same (sessionId, kid, buyer)
              // skip both the Lit action and the unwrap. Handle stays alive
              // for the WASM L2 TTL (2h); our JS-side cache TTL (5 min) is
              // strictly shorter, so we never serve an expired entry.
              const wasmView = sessionView as import('./chipotle-client.js').WasmSessionView;
              if (wasmView.requestHandle !== null) {
                cacheWasmRequestHandle(wasmView.sessionId, kid, buyerAddress, wasmView.requestHandle);
              }
            }
          }

          logger.info(`[Lit] CEK recovered in ${Date.now() - litStart}ms (Chipotle backend session)`);
          if (cekBase64) cacheCEK(kid, buyerAddress, cekBase64);
          return cekBase64;
        }
        throw new Error(`Unsupported LIT_BACKEND: ${effectiveBackend}`);
      } catch(e){
        logger.error(`[Lit] Execution failed`, e);
        throw e;
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

export async function decryptAssetTwoLayer(
  params: DecryptParams,
  ipfsService: any,
  _wasmRuntime: WASMRuntime,
  sessionView: import('./chipotle-client.js').BackendSessionView | import('./chipotle-client.js').WasmSessionView,
): Promise<Buffer> {
  const { encryptedBytes } = await recoverWithSession(params, ipfsService, sessionView);
  const ivBytes = Buffer.from(params.iv, 'base64');

  const startDecrypt = Date.now();
  // Backend-agnostic decrypt: BackendSessionView runs AES-256-GCM via
  // node:crypto with the CEK in its `_cekBase64` field; WasmSessionView
  // delegates to ddrm-decrypt where the CEK never leaves linear memory.
  // The renderer's previous `decrypt_only` mode and the standalone
  // node:crypto fallback are both subsumed here.
  const plaintext = await sessionView.decryptAsset(encryptedBytes, ivBytes);
  const elapsed = Date.now() - startDecrypt;

  if (plaintext.length === 0) {
    throw new Error('AES decryption returned empty data');
  }

  const backendTag = 'cekBase64' in sessionView ? 'js' : 'wasm';
  logger.info(`[Lit] Two-layer decrypt (${backendTag}): ${plaintext.length} bytes in ${elapsed}ms for ${params.buyerAddress}`);
  return plaintext;
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

async function loadRendererBinary(wasmRuntime: WASMRuntime): Promise<ArrayBuffer> {
  if (cachedRendererBinary) return cachedRendererBinary;
  cachedRendererBinary = await wasmRuntime.loadFromFile(DDRM_RENDERER_PATH);
  logger.info(`[SecureView] dDRM renderer WASM loaded (${cachedRendererBinary.byteLength} bytes)`);
  return cachedRendererBinary;
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
  wasmRuntime: WASMRuntime,
  sessionView: import('./chipotle-client.js').BackendSessionView | import('./chipotle-client.js').WasmSessionView,
  page?: number,
  ipfsService?: any,
  chapter?: number,
  viewportWidth?: number,
): Promise<WASMRenderResult | null> {
  const { cekBase64, encryptedBytes } = await recoverWithSession(params, ipfsService, sessionView);

  const watermarkText = `${params.buyerAddress.substring(0, 10)}...${params.buyerAddress.substring(params.buyerAddress.length - 6)} ${new Date().toISOString().split('T')[0]}`;
  const isEpub = mime === 'application/epub+zip' || mime === 'application/epub';

  // Backend dispatch:
  //   - JS-backed view: cekBase64 is set; pass it to the renderer which
  //     does AES-GCM decrypt internally (legacy path, unchanged).
  //   - WASM-backed view: cekBase64 is undefined because the CEK lives
  //     inside `ddrm-decrypt`. Decrypt here via `sessionView.decryptAsset`
  //     (which delegates to ddrm-decrypt — CEK stays in linear memory)
  //     and pass plaintext to the renderer in `render_only` mode. The
  //     renderer skips its decrypt step and routes straight to the MIME
  //     dispatcher. CEK containment is preserved end-to-end.
  let rendererInput: Buffer;
  let command: RendererCommand;
  if (cekBase64 === undefined) {
    const ivBytes = Buffer.from(params.iv, 'base64');
    rendererInput = await sessionView.decryptAsset(encryptedBytes, ivBytes);
    command = {
      cek_b64: '',
      iv_b64: '',
      mime_type: mime,
      mode: 'render_only',
      watermark: watermarkText,
      page: !isEpub && page ? page - 1 : undefined,
      chapter: isEpub ? (chapter ?? 0) : undefined,
      max_width: maxWidth,
      max_height: Math.round(maxWidth * 1.5),
      output_format: isEpub ? 'html' : 'jpeg',
      forensic_mark: isEpub ? params.buyerAddress : undefined,
      viewport_width: isEpub ? (viewportWidth || 680) : undefined,
    };
  } else {
    const paddedCek = cekBase64.length % 4 === 0 ? cekBase64 : cekBase64 + '='.repeat(4 - (cekBase64.length % 4));
    rendererInput = encryptedBytes;
    command = {
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
  }

  const wasmBinary = await loadRendererBinary(wasmRuntime);
  const output = await wasmRuntime.executeRenderer(wasmBinary, command, rendererInput, {
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
// Secure-View Session endpoints (BackendSessionService — server-owned P-256)
//
// Architecture:
//   1. /lit/begin-session   — backend generates a P-256 keypair, builds an
//                              unsigned delegation payload, returns
//                              { sessionId, delegationCanonical }.
//   2. The client wallet signs delegationCanonical (personal_sign).
//   3. /lit/complete-session — backend verifies ecrecover(sig) === ownerAddress
//                              and issues an opaque bearer token.
//   4. Subsequent content requests carry sessionToken; the server loads
//                              the BackendSessionView from it to sign per-asset
//                              requests and unwrap CEK envelopes.
//   5. /lit/renew-session    — same keypair, fresh delegation (new timestamps
//                              + nonce); wallet re-signs without keypair churn.
//   6. /lit/revoke-session   — nonce-based per-node revoke list (best-effort).
//
// The CEK is recovered ONLY inside BackendSessionView (Node heap) and only
// surfaces to MediaSession.cekBase64. The Lit Action inside the TEE is the
// authoritative access boundary.
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
 * Body: { chainId?: number, ttlSeconds?: number, backend?: 'js' | 'wasm' }
 * Returns: { sessionId, delegationCanonical, expiresAt, backend }
 *
 * Backend generates the P-256 session keypair. The client never sees the
 * private key. `ownerAddress` comes from the authenticated PC2 session —
 * we never trust the request body for it. The client must have the user's
 * wallet sign `delegationCanonical` (`personal_sign`) and submit it to
 * `/lit/complete-session` to receive the bearer token.
 *
 * The optional `backend` selector picks which holder owns the session's
 * private key — `'js'` (default, WebCrypto + FileSessionStore) or `'wasm'`
 * (ddrm-decrypt linear memory). The selector is included verbatim inside
 * `delegationCanonical` so the wallet signature binds it; an attacker
 * cannot downgrade by stripping the field between sign and submit. The
 * default flips to `'wasm'` in Phase 5 of DDRM-DECRYPT-WASM.
 */
router.post('/lit/begin-session', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { chainId, ttlSeconds, backend: requestedBackend } = req.body || {};

    // Validate backend selector — anything other than the two known values
    // is a client bug, not a fallback. Default to 'wasm' now that Phase 5
    // of DDRM-DECRYPT-WASM has landed: WASM-backed sessions can satisfy
    // /skills/install (decryptAssetTwoLayer), /lit/secure-view (renderViaWASM
    // via the renderer's render_only mode), and /media (segment dispatch on
    // MediaSession.wasmRequestHandle). Set `PC2_DDRM_BACKEND=js` env override
    // or pass `backend: 'js'` explicitly to fall back to the JS path.
    const ENV_BACKEND = (process.env.PC2_DDRM_BACKEND === 'js' || process.env.PC2_DDRM_BACKEND === 'wasm')
      ? (process.env.PC2_DDRM_BACKEND as 'js' | 'wasm')
      : undefined;
    let backend: 'js' | 'wasm' = ENV_BACKEND ?? 'wasm';
    if (requestedBackend !== undefined) {
      if (requestedBackend !== 'js' && requestedBackend !== 'wasm') {
        res.status(400).json({ error: 'invalid_backend', message: 'backend must be "js" or "wasm"' });
        return;
      }
      backend = requestedBackend;
    }

    const { sessionService } = await import('../services/session/BackendSessionService.js');
    const result = await sessionService.createSession({
      ownerAddress: walletAddress,
      chainId: Number.isFinite(chainId) ? Number(chainId) : undefined,
      ttlSeconds: Number.isFinite(ttlSeconds) ? Math.max(60, Number(ttlSeconds)) : undefined,
      backend,
    });

    res.json({
      sessionId: result.sessionId,
      delegationCanonical: result.delegationCanonical,
      expiresAt: result.expiresAt,
      backend,
      maxDelegationWindowSeconds: MAX_DELEGATION_WINDOW_SECONDS,
      requestFreshnessWindowSeconds: REQUEST_FRESHNESS_WINDOW_SECONDS,
    });
  } catch (err: any) {
    logger.error(`[SecureView.session] begin-session failed: ${err.message}`);
    res.status(err.statusCode || 500).json({ error: err.message || 'begin-session failed' });
  }
});

/**
 * POST /api/storage/lit/complete-session
 * Body: { sessionId, delegationSig }
 * Returns: { ok: true, token, sessionId, expiresAt }
 *
 * Verifies that `ecrecover(delegationSig)` matches the session's
 * `ownerAddress` (set at `/begin-session` from the PC2 auth context).
 * Issues an opaque bearer token that the client stores and presents on
 * subsequent content requests via `sessionToken`.
 */
router.post('/lit/complete-session', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { sessionId, delegationSig } = req.body || {};
    if (typeof sessionId !== 'string' || typeof delegationSig !== 'string') {
      res.status(400).json({ error: 'sessionId and delegationSig required' });
      return;
    }

    const { sessionService } = await import('../services/session/BackendSessionService.js');
    const stored = sessionService.getSessionById(sessionId);
    if (!stored) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    // Cross-check ownerAddress against the PC2-authenticated wallet — only
    // the same wallet that started the session can complete it.
    if (stored.ownerAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      res.status(403).json({ error: 'sessionId does not belong to authenticated session' });
      return;
    }

    let confirmed: { token: string; expiresAt: number; sessionId: string };
    try {
      confirmed = sessionService.confirmSession({ sessionId, delegationSig });
    } catch (confirmErr: any) {
      // Defense-in-depth: EIP-191 fallback failed. Try EIP-1271 (smart wallet)
      // before giving up — sessionService only does plain ecrecover.
      try {
        const { hashMessage } = await import('viem');
        const messageHash = hashMessage(stored.delegationCanonical) as `0x${string}`;
        const okEip1271 = await verifyDelegationEip1271(
          stored.ownerAddress as `0x${string}`,
          messageHash,
          delegationSig as `0x${string}`,
          ethCallAdapter,
        );
        if (!okEip1271) {
          throw confirmErr;
        }
        // Manually mint the token — bypassing confirmSession's ecrecover check.
        const { randomBytes } = await import('node:crypto');
        const token = randomBytes(32).toString('hex');
        sessionService.importSession({ ...stored, token, delegationSig });
        confirmed = { token, expiresAt: stored.expiresAt, sessionId: stored.id };
      } catch {
        res.status(confirmErr.statusCode || 400).json({
          error: confirmErr.message || 'delegationSig does not verify (EIP-191 + EIP-1271 both failed)',
        });
        return;
      }
    }

    res.json({
      ok: true,
      token: confirmed.token,
      sessionId: confirmed.sessionId,
      expiresAt: confirmed.expiresAt,
    });
  } catch (err: any) {
    logger.error(`[SecureView.session] complete-session failed: ${err.message}`);
    res.status(err.statusCode || 500).json({ error: err.message || 'complete-session failed' });
  }
});

/**
 * POST /api/storage/lit/renew-session
 * Body: { sessionId, chainId?, ttlSeconds? }
 * Returns: { sessionId, delegationCanonical, expiresAt }
 *
 * Same P-256 keypair; the server only rotates the delegation timestamps
 * and nonce. The previous bearer token is cleared — the client must call
 * `/lit/complete-session` with a fresh wallet signature to obtain a new one.
 */
router.post('/lit/renew-session', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { sessionId, chainId, ttlSeconds } = req.body || {};
    if (typeof sessionId !== 'string') {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }

    const { sessionService } = await import('../services/session/BackendSessionService.js');
    const result = await sessionService.renewSession({
      sessionId,
      ownerAddress: walletAddress,
      chainId: Number.isFinite(chainId) ? Number(chainId) : undefined,
      ttlSeconds: Number.isFinite(ttlSeconds) ? Math.max(60, Number(ttlSeconds)) : undefined,
    });

    res.json({
      sessionId,
      delegationCanonical: result.delegationCanonical,
      expiresAt: result.expiresAt,
    });
  } catch (err: any) {
    logger.error(`[SecureView.session] renew-session failed: ${err.message}`);
    res.status(err.statusCode || 500).json({ error: err.message || 'renew-session failed' });
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

/** True when an ethers error originated from an HTTP 5xx RPC response. */
function isRpcHttp5xx(err: any): boolean {
  const status =
    err?.info?.response?.statusCode ??
    err?.info?.responseStatus ??
    err?.status;
  if (typeof status === 'number') return status >= 500 && status < 600;
  // ethers v6 surfaces a 5xx as code SERVER_ERROR with the status in the
  // message, e.g. "server response 503 Service Unavailable".
  const text = `${err?.shortMessage ?? ''} ${err?.message ?? ''}`;
  return err?.code === 'SERVER_ERROR' && /\b5\d\d\b/.test(text);
}

const RPC_5XX_MAX_RETRIES = 5;

/**
 * Runs `fn`, and if it fails with an HTTP 5xx RPC error, rotates the Base RPC
 * endpoint and retries `fn`. `fn` is expected to read the current endpoint via
 * `getBaseRpcUrl()`, so the rotation takes effect on the next attempt. Non-5xx
 * errors propagate immediately; the last 5xx error propagates once retries
 * are exhausted.
 */
export async function withRpc5xxRetry<T>(fn: () => Promise<T>, retriesLeft = RPC_5XX_MAX_RETRIES): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isRpcHttp5xx(err) || retriesLeft <= 0) throw err;
    logger.warn(`[SecureView] Preflight: RPC ${getBaseRpcUrl()} returned 5xx — rotating (${retriesLeft} retries left)`);
    rotateBaseRpc();
    return withRpc5xxRetry(fn, retriesLeft - 1);
  }
}

/** Calls `hasAccessByContentId`, rotating the Base RPC on 5xx (see withRpc5xxRetry). */
export function hasAccessByContentIdWithFailover(
  holder: string,
  normalizedKid: string,
  authorityAddr: string,
): Promise<boolean> {
  return withRpc5xxRetry(async () => {
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(getBaseRpcUrl());
    const gateway = new ethers.Contract(authorityAddr, [
      'function hasAccessByContentId(address holder, bytes16 contentId) view returns (bool)',
    ], provider);
    return gateway.hasAccessByContentId(holder, normalizedKid) as Promise<boolean>;
  });
}

router.post('/lit/secure-view', authenticate, requireSecureViewSession, async (req: SecureViewRequest, res: Response) => {
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

      // ciphertext integrity verification payload
      issuer,
      signature,
    } = req.body;

    // Derive buyer addresses from authenticated session — never trust client.
    // `requireSecureViewSession` middleware has already cross-checked that
    // the bearer token's ownerAddress matches one of these.
    const buyerAddress = req.user?.wallet_address;

    if (!litCiphertext || !dataToEncryptHash || !kid || !buyerAddress || !iv || !encryptedDataCid) {
      res.status(400).json({ error: 'Missing required fields for secure view' });
      return;
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
    // Prefer the operator-configured public proxy URL when set so the
    // Lit Action's downstream chain reads benefit from cache + fallback.
    // When unset, pick a currently-HEALTHY public RPC (not the blind
    // pool head) so a recently-rate-limited upstream isn't reused.
    // See `.cursor/tasks/RPC-PROXY-UNIFICATION-2026-05`.
    const rpcUrl = getPublicProxyUrl() || getHealthyBaseRpcUrls()[0] || getBaseRpcUrl();
    const authorityAddr = DEFAULT_AUTHORITY;
    let resolvedBuyer = buyerAddress;

    effectiveBody.buyerAddress = resolvedBuyer;
    effectiveBody.rpc = rpcUrl;
    effectiveBody.authority = authorityAddr;
    effectiveBody.litBackend = reqLitBackend;

    // ── Rate Limiting ────────────────────────────────────
    if (!checkLitRateLimit(buyerAddress)) {
      logger.warn(`[SecureView] Rate limit exceeded for ${buyerAddress.substring(0, 10)}...`);
      res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
      return;
    }

    // ── Content-type dispatch ─────────────────────────────────────────
    const renderer = resolveRenderer(mime);
    if (!renderer) {
      res.status(415).json({
        error: `Secure viewing not yet supported for ${mime}. Use /lit/decrypt for raw access.`,
        mimeType: mime,
      });
      return;
    }

    const renderCtx: RenderContext = {
      effectiveBody,
      mime,
      maxWidth,
      page: pageNum,
      chapter: typeof reqChapter === 'number' ? reqChapter : undefined,
      viewportWidth: typeof reqViewportWidth === 'number' ? Math.min(Math.max(reqViewportWidth, 320), 1600) : undefined,
      buyerAddress: resolvedBuyer,
      ipfsService,
      requestStart,
    };

    const wasmRuntime = req.app.locals.wasmRuntime as WASMRuntime;
    const sessionView = req.secureViewSession!.view;
    const output = await renderer.render(renderCtx, {
      renderViaWASM: (params, mime, maxWidth, page, ipfsService, chapter, viewportWidth) =>
        renderViaWASM({ ...params, issuer, signature }, mime, maxWidth, wasmRuntime, sessionView, page, ipfsService, chapter, viewportWidth),
      decryptAssetTwoLayer: (params, ipfsService) =>
        decryptAssetTwoLayer({ ...params, issuer, signature}, ipfsService, wasmRuntime, sessionView),
    });

    for (const [key, value] of Object.entries(output.headers)) {
      res.set(key, value);
    }

    if (output.status !== 200) {
      res.status(output.status).json(output.errorBody);
      return;
    }

    res.set('Content-Type', output.contentType!);
    res.set('Content-Length', String(output.body!.length));
    res.send(output.body);
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

export default router;
