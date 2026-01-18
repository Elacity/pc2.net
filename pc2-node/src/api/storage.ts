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

export default router;

