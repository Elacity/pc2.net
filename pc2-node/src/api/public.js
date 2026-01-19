/**
 * Public IPFS Gateway API
 *
 * Provides unauthenticated access to:
 * - Files in users' /Public folders
 * - Any pinned CID via /ipfs/:cid
 * - Public file listings
 *
 * This enables PC2 nodes to participate in the public IPFS network
 * and serve as gateways for dDRM marketplace content.
 */
import { Router } from 'express';
import { logger } from '../utils/logger.js';
import rateLimit from 'express-rate-limit';
// Rate limiting for public endpoints (prevent abuse)
const publicRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});
/**
 * Create the public gateway router
 */
export function createPublicRouter(db, filesystem, ipfs) {
    const router = Router();
    // NOTE: Rate limiting is applied per-route below, not globally.
    // This prevents the rate limiter from affecting non-public routes
    // when this router is mounted at root level.
    /**
     * GET /ipfs/:cid
     * GET /ipfs/:cid/:filename
     *
     * Serve content directly by CID. Works for any pinned content.
     * The optional filename parameter allows setting Content-Disposition for downloads.
     */
    router.get('/ipfs/:cid/:filename?', publicRateLimit, async (req, res) => {
        const { cid, filename } = req.params;
        if (!ipfs || !ipfs.isReady()) {
            return res.status(503).json({ error: 'IPFS not available' });
        }
        try {
            // Try to get file metadata from database (for mime type)
            const metadata = db.getFileByCID(cid);
            // Retrieve content from IPFS
            const content = await ipfs.getFile(cid);
            // Set response headers
            const mimeType = metadata?.mime_type || 'application/octet-stream';
            const contentFilename = filename || metadata?.path?.split('/').pop() || cid;
            res.set({
                'Content-Type': mimeType,
                'Content-Length': content.length.toString(),
                'X-IPFS-CID': cid,
                'X-IPFS-Path': `/ipfs/${cid}`,
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Expose-Headers': 'X-IPFS-CID, X-IPFS-Path',
            });
            // Set Content-Disposition if filename provided
            if (filename) {
                res.set('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
            }
            res.send(content);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            // Check if it's a "not found" type error
            if (message.includes('not found') || message.includes('Entry not found')) {
                return res.status(404).json({
                    error: 'Content not found',
                    cid,
                    hint: 'This CID is not pinned on this node'
                });
            }
            logger.error(`[Public Gateway] Error serving CID ${cid}:`, { error: message });
            res.status(500).json({ error: 'Failed to retrieve content' });
        }
    });
    /**
     * GET /public/:wallet/*
     *
     * Serve files from a user's /Public folder by path.
     * Only files marked as is_public=true are served.
     */
    router.get('/public/:wallet/*', publicRateLimit, async (req, res) => {
        const { wallet } = req.params;
        const subPath = req.params[0] || '';
        // Construct the full path within the Public folder
        const fullPath = `/${wallet}/Public${subPath ? '/' + subPath : ''}`;
        if (!ipfs || !ipfs.isReady()) {
            return res.status(503).json({ error: 'IPFS not available' });
        }
        try {
            // Get file metadata
            const metadata = db.getFile(fullPath, wallet);
            if (!metadata) {
                return res.status(404).json({
                    error: 'File not found',
                    path: fullPath
                });
            }
            // Verify it's actually in the Public folder and marked public
            if (!metadata.is_public) {
                return res.status(403).json({
                    error: 'Access denied',
                    message: 'This file is not publicly accessible'
                });
            }
            // If it's a directory, return listing
            if (metadata.is_dir) {
                const files = db.getPublicFiles(wallet, fullPath);
                return res.json({
                    path: fullPath,
                    isDirectory: true,
                    files: files.map(f => ({
                        name: f.path.split('/').pop(),
                        path: f.path.replace(`/${wallet}/Public`, ''),
                        cid: f.ipfs_hash,
                        size: f.size,
                        mimeType: f.mime_type,
                        isDirectory: f.is_dir,
                        createdAt: f.created_at
                    }))
                });
            }
            // Get file content from IPFS
            if (!metadata.ipfs_hash) {
                return res.status(404).json({ error: 'File has no content' });
            }
            const content = await ipfs.getFile(metadata.ipfs_hash);
            const filename = metadata.path.split('/').pop() || 'file';
            res.set({
                'Content-Type': metadata.mime_type || 'application/octet-stream',
                'Content-Length': content.length.toString(),
                'X-IPFS-CID': metadata.ipfs_hash,
                'X-IPFS-Path': `/ipfs/${metadata.ipfs_hash}/${filename}`,
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Expose-Headers': 'X-IPFS-CID, X-IPFS-Path',
                'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
            });
            res.send(content);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`[Public Gateway] Error serving ${fullPath}:`, { error: message });
            res.status(500).json({ error: 'Failed to retrieve file' });
        }
    });
    /**
     * GET /api/public/list/:wallet
     * GET /api/public/list/:wallet/*
     *
     * List all public files for a wallet with their CIDs.
     * Useful for discovery and indexing.
     */
    router.get('/api/public/list/:wallet', publicRateLimit, async (req, res) => {
        const { wallet } = req.params;
        const basePath = `/${wallet}/Public`;
        try {
            const files = db.getPublicFiles(wallet);
            res.json({
                wallet,
                basePath,
                totalFiles: files.length,
                files: files.map(f => ({
                    name: f.path.split('/').pop(),
                    path: f.path.replace(`/${wallet}/Public`, '') || '/',
                    cid: f.ipfs_hash,
                    size: f.size,
                    mimeType: f.mime_type,
                    isDirectory: f.is_dir,
                    createdAt: f.created_at,
                    // Include gateway URLs for convenience
                    gatewayUrl: f.ipfs_hash ? `/ipfs/${f.ipfs_hash}` : null,
                    publicUrl: `/public/${wallet}${f.path.replace(`/${wallet}/Public`, '')}`
                }))
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`[Public Gateway] Error listing files for ${wallet}:`, { error: message });
            res.status(500).json({ error: 'Failed to list files' });
        }
    });
    /**
     * GET /api/public/info/:cid
     *
     * Get metadata for a CID (if we have it).
     * Returns file info without the content.
     */
    router.get('/api/public/info/:cid', publicRateLimit, async (req, res) => {
        const { cid } = req.params;
        try {
            const metadata = db.getFileByCID(cid);
            if (!metadata) {
                return res.status(404).json({
                    error: 'CID not found in database',
                    cid,
                    hint: 'This CID may be pinned but not tracked, or not on this node'
                });
            }
            // Only expose info for public files
            if (!metadata.is_public) {
                return res.status(403).json({
                    error: 'This content is not publicly accessible',
                    cid
                });
            }
            res.json({
                cid,
                filename: metadata.path.split('/').pop(),
                size: metadata.size,
                mimeType: metadata.mime_type,
                isDirectory: metadata.is_dir,
                createdAt: metadata.created_at,
                gatewayUrl: `/ipfs/${cid}`,
                // Don't expose full path for privacy
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`[Public Gateway] Error getting info for ${cid}:`, { error: message });
            res.status(500).json({ error: 'Failed to get CID info' });
        }
    });
    /**
     * GET /api/public/stats
     *
     * Get public node statistics.
     */
    router.get('/api/public/stats', publicRateLimit, async (req, res) => {
        try {
            const stats = db.getPublicStats();
            res.json({
                nodeId: ipfs?.getNodeId() || null,
                publicFiles: stats.publicFileCount,
                totalPublicSize: stats.totalPublicSize,
                isGatewayEnabled: true,
                ipfsReady: ipfs?.isReady() || false
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error('[Public Gateway] Error getting stats:', { error: message });
            res.status(500).json({ error: 'Failed to get stats' });
        }
    });
    /**
     * GET /api/public/network
     *
     * Get network statistics (peers, mode, etc).
     */
    router.get('/api/public/network', publicRateLimit, async (req, res) => {
        try {
            if (!ipfs) {
                return res.status(503).json({ error: 'IPFS not available' });
            }
            const networkStats = await ipfs.getNetworkStats();
            const connectedPeers = await ipfs.getConnectedPeers();
            res.json({
                ...networkStats,
                peers: connectedPeers.slice(0, 20), // Limit to first 20 peers
                totalPeers: connectedPeers.length
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error('[Public Gateway] Error getting network stats:', { error: message });
            res.status(500).json({ error: 'Failed to get network stats' });
        }
    });
    /**
     * POST /api/pin/:cid
     *
     * Pin a remote CID from the IPFS network.
     * Used for marketplace purchases.
     * NOTE: This endpoint requires authentication (added in separate middleware).
     */
    router.post('/api/pin/:cid', publicRateLimit, async (req, res) => {
        const { cid } = req.params;
        // Check if user is authenticated (via header or session)
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Pinning requires a valid auth token'
            });
        }
        if (!ipfs || !ipfs.isReady()) {
            return res.status(503).json({ error: 'IPFS not available' });
        }
        try {
            const result = await ipfs.pinRemoteCID(cid);
            res.json({
                success: true,
                cid,
                size: result.size,
                chunks: result.chunks,
                message: 'Content pinned successfully'
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (message.includes('private')) {
                return res.status(400).json({
                    error: 'Remote pinning not available',
                    message: 'Node is in private mode - remote pinning requires public or hybrid mode'
                });
            }
            logger.error(`[Public Gateway] Failed to pin ${cid}:`, { error: message });
            res.status(500).json({
                error: 'Failed to pin content',
                message: 'Could not fetch content from IPFS network'
            });
        }
    });
    /**
     * DELETE /api/pin/:cid
     *
     * Unpin a CID (allow garbage collection).
     */
    router.delete('/api/pin/:cid', publicRateLimit, async (req, res) => {
        const { cid } = req.params;
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!ipfs || !ipfs.isReady()) {
            return res.status(503).json({ error: 'IPFS not available' });
        }
        try {
            await ipfs.unpinFile(cid);
            res.json({ success: true, cid, message: 'Content unpinned' });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`[Public Gateway] Failed to unpin ${cid}:`, { error: message });
            res.status(500).json({ error: 'Failed to unpin content' });
        }
    });
    return router;
}
export default createPublicRouter;
//# sourceMappingURL=public.js.map