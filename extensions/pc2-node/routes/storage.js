/*
 * Copyright (C) 2024-present Elacity
 *
 * PC2 Storage Routes
 * 
 * HTTP endpoints for file operations:
 * - Upload files
 * - Download files
 * - List directories
 * - Create/delete files and directories
 * - Get storage stats
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');

// Configure multer for file uploads (in-memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
    },
});

/**
 * Middleware to verify wallet authentication
 */
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing authorization header' });
    }

    const sessionToken = authHeader.split(' ')[1];
    const db = await req.services.get('database').get('read', 'pc2');

    // Verify session
    const session = await db.read(
        'SELECT wallet_address FROM pc2_sessions WHERE session_token = ? AND expires_at > ?',
        [sessionToken, Math.floor(Date.now() / 1000)]
    );

    if (session.length === 0) {
        return res.status(401).json({ error: 'Invalid or expired session' });
    }

    req.walletAddress = session[0].wallet_address;
    next();
}

/**
 * GET /pc2/storage/stats
 * 
 * Get storage statistics for the authenticated wallet
 */
router.get('/stats', requireAuth, async (req, res) => {
    try {
        const storageService = req.services.get('pc2-storage');
        const stats = await storageService.getStorageStats(req.walletAddress);
        res.json(stats);
    } catch (error) {
        console.error('[PC2 Storage Routes]: Stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /pc2/storage/list
 * 
 * List files in a directory
 * Query params:
 * - path: Directory path (default: "/")
 */
router.get('/list', requireAuth, async (req, res) => {
    try {
        const path = req.query.path || '/';
        const storageService = req.services.get('pc2-storage');
        const files = await storageService.listFiles(req.walletAddress, path);
        res.json({ files, path });
    } catch (error) {
        console.error('[PC2 Storage Routes]: List error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /pc2/storage/upload
 * 
 * Upload a file
 * Body (multipart/form-data):
 * - file: The file to upload
 * - path: Destination path in virtual filesystem
 * - encrypt: Whether to encrypt (default: true, except for /Public/)
 */
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const destPath = req.body.path;
        if (!destPath) {
            return res.status(400).json({ error: 'Destination path is required' });
        }

        const storageService = req.services.get('pc2-storage');
        const result = await storageService.uploadFile(
            req.walletAddress,
            destPath,
            req.file.buffer,
            {
                mimeType: req.file.mimetype,
                encrypt: req.body.encrypt !== 'false',
            }
        );

        res.json(result);
    } catch (error) {
        console.error('[PC2 Storage Routes]: Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /pc2/storage/download
 * 
 * Download a file
 * Query params:
 * - path: File path to download
 */
router.get('/download', requireAuth, async (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath) {
            return res.status(400).json({ error: 'File path is required' });
        }

        const storageService = req.services.get('pc2-storage');
        const file = await storageService.downloadFile(req.walletAddress, filePath);

        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Length', file.content.length);
        res.setHeader('X-IPFS-CID', file.cid);
        res.send(file.content);
    } catch (error) {
        console.error('[PC2 Storage Routes]: Download error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /pc2/storage/mkdir
 * 
 * Create a directory
 * Body:
 * - path: Directory path to create
 */
router.post('/mkdir', requireAuth, express.json(), async (req, res) => {
    try {
        const dirPath = req.body.path;
        if (!dirPath) {
            return res.status(400).json({ error: 'Directory path is required' });
        }

        const storageService = req.services.get('pc2-storage');
        const result = await storageService.createDirectory(req.walletAddress, dirPath);

        res.json(result);
    } catch (error) {
        console.error('[PC2 Storage Routes]: Mkdir error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /pc2/storage/delete
 * 
 * Delete a file or empty directory
 * Query params:
 * - path: Path to delete
 */
router.delete('/delete', requireAuth, async (req, res) => {
    try {
        const path = req.query.path;
        if (!path) {
            return res.status(400).json({ error: 'Path is required' });
        }

        const storageService = req.services.get('pc2-storage');
        await storageService.delete(req.walletAddress, path);

        res.json({ success: true, path });
    } catch (error) {
        console.error('[PC2 Storage Routes]: Delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /pc2/storage/public/:cid
 * 
 * Access a public file by CID (no auth required)
 * Only files in /Public/ folders can be accessed this way
 */
router.get('/public/:cid', async (req, res) => {
    try {
        const { cid } = req.params;
        const db = await req.services.get('database').get('read', 'pc2');

        // Find file by CID and ensure it's in a Public folder
        const files = await db.read(
            `SELECT * FROM pc2_files 
             WHERE cid = ? AND is_encrypted = 0 AND file_path LIKE '%/Public/%'`,
            [cid]
        );

        if (files.length === 0) {
            return res.status(404).json({ error: 'File not found or not public' });
        }

        const file = files[0];

        // Get IPFS service
        const storageService = req.services.get('pc2-storage');
        if (!storageService.ipfs) {
            return res.status(503).json({ error: 'IPFS not available' });
        }

        // Download from IPFS
        const chunks = [];
        for await (const chunk of storageService.ipfs.cat(cid)) {
            chunks.push(chunk);
        }
        const content = Buffer.concat(chunks);

        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
        res.setHeader('Content-Length', content.length);
        res.setHeader('X-IPFS-CID', cid);
        res.send(content);
    } catch (error) {
        console.error('[PC2 Storage Routes]: Public file error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = { StorageRoutes: router };

