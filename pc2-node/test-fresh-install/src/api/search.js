import { logger } from '../utils/logger.js';
export function handleSearch(req, res) {
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
        const searchReq = {
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
        if (searchReq.ipfsHash && (!searchReq.text || searchReq.text.trim() === '')) {
            return handleIPFSSearch(db, userAddress, searchReq, res);
        }
        const textValue = searchReq.text?.trim() || '';
        const looksLikeCID = /^(bafkrei|bafy|bafz|Qm|z[a-z0-9]+)/i.test(textValue) && textValue.length >= 10;
        if (looksLikeCID && !searchReq.ipfsHash) {
            searchReq.ipfsHash = textValue;
            return handleIPFSSearch(db, userAddress, searchReq, res);
        }
        if (!searchReq.text || searchReq.text.trim() === '') {
            res.json([]);
            return;
        }
        const sanitizedText = searchReq.text.trim().replace(/%/g, '\\%').replace(/_/g, '\\_');
        const searchPattern = `%${sanitizedText}%`;
        const filenameMatchPattern = `%/${sanitizedText}%`;
        const metadataFilters = [];
        const filterParams = [userAddress];
        if (searchReq.fileType) {
            const mimePrefixes = {
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
        if (searchReq.mimeType) {
            metadataFilters.push('mime_type = ?');
            filterParams.push(searchReq.mimeType);
        }
        if (searchReq.minSize !== undefined) {
            metadataFilters.push('size >= ?');
            filterParams.push(searchReq.minSize);
        }
        if (searchReq.maxSize !== undefined) {
            metadataFilters.push('size <= ?');
            filterParams.push(searchReq.maxSize);
        }
        if (searchReq.minDate !== undefined) {
            metadataFilters.push('updated_at >= ?');
            filterParams.push(searchReq.minDate * 1000);
        }
        if (searchReq.maxDate !== undefined) {
            metadataFilters.push('updated_at <= ?');
            filterParams.push(searchReq.maxDate * 1000);
        }
        const metadataFilterClause = metadataFilters.length > 0
            ? `AND ${metadataFilters.join(' AND ')}`
            : '';
        let results = [];
        try {
            const dbInstance = db.getDB();
            const fts5Exists = dbInstance.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='files_fts'
      `).get();
            if (fts5Exists) {
                const ftsQuery = searchReq.text.trim()
                    .replace(/"/g, '""')
                    .replace(/'/g, "''")
                    .replace(/[^\w\s]/g, ' ');
                const ftsMatchQuery = `"${ftsQuery}"* OR ${ftsQuery}*`;
                try {
                    const ftsFilterParams = [userAddress, ftsMatchQuery, ...filterParams.slice(1)];
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
          `).all(filenameMatchPattern, searchPattern, userAddress, ftsMatchQuery, ...filterParams.slice(1), searchReq.limit);
                    if (ftsResults.length > 0) {
                        results = ftsResults
                            .sort((a, b) => {
                            if (b.match_priority !== a.match_priority) {
                                return b.match_priority - a.match_priority;
                            }
                            if (a.rank !== b.rank) {
                                return a.rank - b.rank;
                            }
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
                }
                catch (ftsError) {
                    logger.debug('[Search] FTS5 query failed, using LIKE search:', ftsError);
                }
            }
        }
        catch (error) {
            logger.debug('[Search] FTS5 table not available, using LIKE search:', error);
        }
        if (results.length < 100) {
            const queryParams = [userAddress, searchPattern, searchPattern];
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
      `, ...queryParams);
            results = [...results, ...likeResults];
        }
        const uniqueResults = Array.from(new Map(results.map(r => [r.path, r])).values()).slice(0, 100);
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
        logger.info(`[Search] Found ${formattedResults.length} results for query: "${searchReq.text}"`, {
            filters: {
                fileType: searchReq.fileType,
                mimeType: searchReq.mimeType,
                sizeRange: searchReq.minSize || searchReq.maxSize ? `${searchReq.minSize || 0}-${searchReq.maxSize || '∞'}` : undefined,
                dateRange: searchReq.minDate || searchReq.maxDate ? `${searchReq.minDate || 0}-${searchReq.maxDate || '∞'}` : undefined
            }
        });
        res.json(formattedResults);
    }
    catch (error) {
        logger.error('[Search] Error performing search:', error);
        res.status(500).json({ error: 'Search failed' });
    }
}
function handleIPFSSearch(db, userAddress, searchReq, res) {
    try {
        const dbInstance = db.getDB();
        const ipfsHash = searchReq.ipfsHash?.trim() || '';
        if (!ipfsHash) {
            res.json([]);
            return;
        }
        let query;
        let params;
        if (ipfsHash.length >= 10) {
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
        }
        else {
            res.json([]);
            return;
        }
        const results = dbInstance.prepare(query).all(...params);
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
    }
    catch (error) {
        logger.error('[Search] Error performing IPFS search:', error);
        res.status(500).json({ error: 'IPFS search failed' });
    }
}
//# sourceMappingURL=search.js.map