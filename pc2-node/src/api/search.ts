/**
 * Search API Endpoint
 * 
 * Handles file search operations - filename, path, and metadata search
 */

import { Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
import { logger } from '../utils/logger.js';

/**
 * Search request interface
 */
interface SearchRequest {
  text: string;
  fileType?: string; // e.g., 'image', 'video', 'document', 'audio'
  mimeType?: string; // Specific MIME type filter
  minSize?: number; // Minimum file size in bytes
  maxSize?: number; // Maximum file size in bytes
  minDate?: number; // Minimum modified date (Unix timestamp)
  maxDate?: number; // Maximum modified date (Unix timestamp)
  ipfsHash?: string; // Search by IPFS CID (exact or partial)
  searchMode?: 'filename' | 'content' | 'both'; // Search mode preference
  limit?: number; // Maximum results (default: 50)
}

/**
 * Search for files by filename, path, content, or metadata
 * POST /search
 * Body: { text: string, fileType?: string, mimeType?: string, minSize?: number, maxSize?: number, minDate?: number, maxDate?: number, ipfsHash?: string, searchMode?: 'filename'|'content'|'both', limit?: number }
 */
export function handleSearch(req: AuthenticatedRequest, res: Response): void {
  try {
    const db = req.app.locals.db;
    const userAddress = req.user?.wallet_address;

    if (!userAddress) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!db) {
      res.status(500).json({ error: 'Database not available' });
      return;
    }

    // Parse search request
    const searchReq: SearchRequest = {
      text: req.body?.text || '',
      fileType: req.body?.fileType,
      mimeType: req.body?.mimeType,
      minSize: req.body?.minSize,
      maxSize: req.body?.maxSize,
      minDate: req.body?.minDate,
      maxDate: req.body?.maxDate,
      ipfsHash: req.body?.ipfsHash,
      searchMode: req.body?.searchMode || 'both',
      limit: req.body?.limit || 50
    };
    
    // If searching by IPFS hash only, skip text search
    if (searchReq.ipfsHash && (!searchReq.text || searchReq.text.trim() === '')) {
      return handleIPFSSearch(db, userAddress, searchReq, res);
    }
    
    // Also check if text looks like a CID (starts with bafkrei, bafy, bafz, Qm, etc.)
    const textValue = searchReq.text?.trim() || '';
    const looksLikeCID = /^(bafkrei|bafy|bafz|Qm|z[a-z0-9]+)/i.test(textValue) && textValue.length >= 10;
    
    if (looksLikeCID && !searchReq.ipfsHash) {
      // Treat as CID search
      searchReq.ipfsHash = textValue;
      return handleIPFSSearch(db, userAddress, searchReq, res);
    }
    
    if (!searchReq.text || searchReq.text.trim() === '') {
      res.json([]);
      return;
    }

    // Sanitize search text for SQL LIKE (escape special characters)
    const sanitizedText = searchReq.text.trim().replace(/%/g, '\\%').replace(/_/g, '\\_');
    const searchPattern = `%${sanitizedText}%`;

    // Search files by:
    // 1. Filename (extracted from path) - highest priority
    // 2. Full-text content search (FTS5) - if content_text is available
    // 3. Full path contains search text
    // 4. MIME type (if search text matches)
    // 
    // Filename match pattern: path ends with /searchtext (e.g., /path/to/searchtext)
    const filenameMatchPattern = `%/${sanitizedText}%`;
    
    // Build metadata filters
    const metadataFilters: string[] = [];
    const filterParams: any[] = [userAddress];
    
    // File type filter (e.g., 'image', 'video', 'document')
    if (searchReq.fileType) {
      const mimePrefixes: Record<string, string[]> = {
        'image': ['image/'],
        'video': ['video/'],
        'audio': ['audio/'],
        'document': ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument', 'text/'],
        'text': ['text/'],
        'code': ['text/', 'application/json', 'application/xml']
      };
      
      const prefixes = mimePrefixes[searchReq.fileType.toLowerCase()];
      if (prefixes) {
        const conditions = prefixes.map(() => 'mime_type LIKE ?').join(' OR ');
        metadataFilters.push(`(${conditions})`);
        filterParams.push(...prefixes.map(p => `${p}%`));
      }
    }
    
    // Specific MIME type filter
    if (searchReq.mimeType) {
      metadataFilters.push('mime_type = ?');
      filterParams.push(searchReq.mimeType);
    }
    
    // Size filters
    if (searchReq.minSize !== undefined) {
      metadataFilters.push('size >= ?');
      filterParams.push(searchReq.minSize);
    }
    if (searchReq.maxSize !== undefined) {
      metadataFilters.push('size <= ?');
      filterParams.push(searchReq.maxSize);
    }
    
    // Date filters (on updated_at)
    if (searchReq.minDate !== undefined) {
      metadataFilters.push('updated_at >= ?');
      filterParams.push(searchReq.minDate * 1000); // Convert to milliseconds
    }
    if (searchReq.maxDate !== undefined) {
      metadataFilters.push('updated_at <= ?');
      filterParams.push(searchReq.maxDate * 1000); // Convert to milliseconds
    }
    
    const metadataFilterClause = metadataFilters.length > 0 
      ? `AND ${metadataFilters.join(' AND ')}` 
      : '';
    
    // Try FTS5 content search first (if FTS5 table exists and has content)
    let results: Array<{
      path: string;
      size: number;
      type: string | null;
      ipfs_hash: string | null;
      thumbnail: string | null;
      is_dir: number;
      created_at: number;
      modified: number;
    }> = [];
    
    try {
      // Check if FTS5 table exists and try content search
      const dbInstance = (db as any).getDB();
      const fts5Exists = dbInstance.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='files_fts'
      `).get();
      
      if (fts5Exists) {
        // FTS5 search: search in name, path, and content columns
        // FTS5 uses MATCH operator - escape special characters
        // FTS5 syntax: "term" for exact phrase, term* for prefix, term OR term2 for OR
        const ftsQuery = searchReq.text.trim()
          .replace(/"/g, '""')  // Escape quotes
          .replace(/'/g, "''")  // Escape single quotes
          .replace(/[^\w\s]/g, ' '); // Replace special chars with spaces
        
        // Build FTS5 query: search in all columns (name, path, content)
        const ftsMatchQuery = `"${ftsQuery}"* OR ${ftsQuery}*`;
        
        try {
          // Build FTS5 query with metadata filters
          const ftsFilterParams = [userAddress, ftsMatchQuery, ...filterParams.slice(1)];
          // FTS5 search - prioritize filename matches by checking path pattern
          // We'll use a subquery to calculate priority based on path matching
          const ftsResults = dbInstance.prepare(`
            SELECT 
              f.path,
              f.size,
              f.mime_type as type,
              f.ipfs_hash,
              f.thumbnail,
              f.is_dir,
              f.created_at,
              f.updated_at as modified,
              bm25(files_fts) as rank,
              CASE 
                WHEN f.path LIKE ? THEN 10  -- Filename match (highest priority)
                WHEN f.path LIKE ? THEN 5   -- Path contains search text
                ELSE 1                      -- Content match only
              END as match_priority
            FROM files_fts
            JOIN files f ON f.rowid = files_fts.rowid
            WHERE f.wallet_address = ?
              AND f.is_dir = 0
              AND files_fts MATCH ?
              ${metadataFilterClause}
            ORDER BY match_priority DESC, rank, f.updated_at DESC
            LIMIT ?
          `).all(filenameMatchPattern, searchPattern, userAddress, ftsMatchQuery, ...filterParams.slice(1), searchReq.limit) as Array<{
            path: string;
            size: number;
            type: string | null;
            ipfs_hash: string | null;
            thumbnail: string | null;
            is_dir: number;
            created_at: number;
            modified: number;
            rank: number;
            match_priority: number;
          }>;
          
          if (ftsResults.length > 0) {
            // Prioritize filename matches over content matches
            results = ftsResults
              .sort((a, b) => {
                // First sort by match priority (filename > path > content)
                if (b.match_priority !== a.match_priority) {
                  return b.match_priority - a.match_priority;
                }
                // Then by BM25 rank (lower is better)
                if (a.rank !== b.rank) {
                  return a.rank - b.rank;
                }
                // Finally by recency
                return b.modified - a.modified;
              })
              .map(r => ({
                path: r.path,
                size: r.size,
                type: r.type,
                ipfs_hash: r.ipfs_hash,
                thumbnail: r.thumbnail,
                is_dir: r.is_dir,
                created_at: r.created_at,
                modified: r.modified
              }));
          }
        } catch (ftsError) {
          // FTS5 query might fail (e.g., invalid syntax), fall back to LIKE
          logger.debug('[Search] FTS5 query failed, using LIKE search:', ftsError);
        }
      }
    } catch (error) {
      // FTS5 table might not exist, fall back to LIKE search
      logger.debug('[Search] FTS5 table not available, using LIKE search:', error);
    }
    
    // If FTS5 didn't return results, or we want to combine with filename search,
    // also search by filename/path using LIKE
    if (results.length < 100) {
      // Build query parameters
      const queryParams: any[] = [userAddress, searchPattern, searchPattern];
      
      // Add exclusion list if we have FTS5 results
      let exclusionClause = '';
      if (results.length > 0) {
        const excludePaths = results.map(r => r.path);
        exclusionClause = `AND path NOT IN (${excludePaths.map(() => '?').join(',')})`;
        queryParams.push(...excludePaths);
      }
      
      queryParams.push(filenameMatchPattern, searchPattern, 100 - results.length);
      
      const likeResults = db.query(`
        SELECT 
          path,
          size,
          mime_type as type,
          ipfs_hash,
          thumbnail,
          is_dir,
          created_at,
          updated_at as modified
        FROM files
        WHERE wallet_address = ?
          AND is_dir = 0
          AND (
            path LIKE ? ESCAPE '\\'
            OR mime_type LIKE ? ESCAPE '\\'
          )
          ${exclusionClause}
        ORDER BY 
          CASE 
            WHEN path LIKE ? ESCAPE '\\' THEN 1  -- Filename match (highest priority)
            WHEN path LIKE ? ESCAPE '\\' THEN 2  -- Path contains search text
            ELSE 3
          END,
          updated_at DESC
        LIMIT ?
      `, ...queryParams) as Array<{
        path: string;
        size: number;
        type: string | null;
        ipfs_hash: string | null;
        thumbnail: string | null;
        is_dir: number;
        created_at: number;
        modified: number;
      }>;
      
      // Combine results (FTS5 results first, then LIKE results)
      results = [...results, ...likeResults];
    }
    
    // Remove duplicates and limit to 100
    const uniqueResults = Array.from(
      new Map(results.map(r => [r.path, r])).values()
    ).slice(0, 100) as Array<{
      path: string;
      size: number;
      type: string | null;
      ipfs_hash: string | null;
      is_dir: number;
      created_at: number;
      modified: number;
    }>;

    // Transform results to match frontend expectations
    const formattedResults = results.map(file => {
      // Extract filename from path
      const pathParts = file.path.split('/');
      const fileName = pathParts[pathParts.length - 1] || file.path;

      // Generate uid from path (matching filesystem.ts pattern)
      // Pattern: uuid-${path.replace(/\//g, '-')}
      // Paths start with /, so /path/to/file becomes uuid--path-to-file
      const uid = `uuid-${file.path.replace(/\//g, '-')}`;

      return {
        path: file.path,
        name: fileName,
        uid: uid,
        is_dir: file.is_dir === 1,
        type: file.type || null,
        size: file.size,
        modified: file.modified,
        ipfs_hash: file.ipfs_hash,
        thumbnail: file.thumbnail || null
      };
    });

    logger.info(`[Search] Found ${formattedResults.length} results for query: "${searchReq.text}"`, {
      filters: {
        fileType: searchReq.fileType,
        mimeType: searchReq.mimeType,
        sizeRange: searchReq.minSize || searchReq.maxSize ? `${searchReq.minSize || 0}-${searchReq.maxSize || '∞'}` : undefined,
        dateRange: searchReq.minDate || searchReq.maxDate ? `${searchReq.minDate || 0}-${searchReq.maxDate || '∞'}` : undefined
      }
    });
    
    res.json(formattedResults);
  } catch (error) {
    logger.error('[Search] Error performing search:', error);
    res.status(500).json({ error: 'Search failed' });
  }
}

/**
 * Handle IPFS CID search
 */
function handleIPFSSearch(
  db: any,
  userAddress: string,
  searchReq: SearchRequest,
  res: Response
): void {
  try {
    const dbInstance = (db as any).getDB();
    const ipfsHash = searchReq.ipfsHash?.trim() || '';
    
    if (!ipfsHash) {
      res.json([]);
      return;
    }
    
    // Build query - support exact match or partial match
    let query: string;
    let params: any[];
    
    if (ipfsHash.length >= 10) {
      // Partial or exact CID search
      query = `
        SELECT 
          path,
          size,
          mime_type as type,
          ipfs_hash,
          thumbnail,
          is_dir,
          created_at,
          updated_at as modified
        FROM files
        WHERE wallet_address = ?
          AND is_dir = 0
          AND ipfs_hash LIKE ?
        ORDER BY updated_at DESC
        LIMIT ?
      `;
      params = [userAddress, `%${ipfsHash}%`, searchReq.limit || 50];
    } else {
      res.json([]);
      return;
    }
    
    const results = dbInstance.prepare(query).all(...params) as Array<{
      path: string;
      size: number;
      type: string | null;
      ipfs_hash: string | null;
      thumbnail: string | null;
      is_dir: number;
      created_at: number;
      modified: number;
    }>;
    
    // Transform results
    const formattedResults = results.map(file => {
      const pathParts = file.path.split('/');
      const fileName = pathParts[pathParts.length - 1] || file.path;
      const uid = `uuid-${file.path.replace(/\//g, '-')}`;
      
      return {
        path: file.path,
        name: fileName,
        uid: uid,
        is_dir: file.is_dir === 1,
        type: file.type || null,
        size: file.size,
        modified: file.modified,
        ipfs_hash: file.ipfs_hash,
        thumbnail: file.thumbnail || null
      };
    });
    
    logger.info(`[Search] Found ${formattedResults.length} results for IPFS CID: "${ipfsHash}"`);
    res.json(formattedResults);
  } catch (error) {
    logger.error('[Search] Error performing IPFS search:', error);
    res.status(500).json({ error: 'IPFS search failed' });
  }
}

