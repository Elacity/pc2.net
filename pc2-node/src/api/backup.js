/**
 * Backup Management API
 *
 * Provides endpoints for managing backups:
 * - List backups
 * - Download backup files
 * - Delete backups
 *
 * CRITICAL: Backups should be downloaded to a separate device/server
 * to ensure they survive server failures.
 */
import { readdirSync, statSync, unlinkSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { createReadStream } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Get project root
const PROJECT_ROOT = resolve(__dirname, '../../');
const BACKUPS_DIR = join(PROJECT_ROOT, 'backups');
/**
 * Create a new backup
 * POST /api/backups/create
 *
 * Triggers the backup script to create a new backup archive.
 * This allows users to create backups through the UI/API.
 */
export async function createBackup(req, res) {
    try {
        const backupScriptPath = join(PROJECT_ROOT, 'scripts', 'backup.js');
        if (!existsSync(backupScriptPath)) {
            res.status(500).json({ error: 'Backup script not found' });
            return;
        }
        logger.info('[Backup API] Creating backup...', {
            user: req.user?.wallet_address
        });
        // Run backup script asynchronously
        // Note: This runs in background, we'll check for new backup after a delay
        execAsync(`node "${backupScriptPath}"`, {
            cwd: PROJECT_ROOT,
            env: process.env,
            timeout: 300000 // 5 minute timeout
        })
            .then(() => {
            logger.info('[Backup API] Backup created successfully');
        })
            .catch((error) => {
            logger.error('[Backup API] Backup creation failed:', error);
        });
        // Return immediately - backup is running in background
        res.json({
            success: true,
            message: 'Backup creation started. This may take a few minutes. Refresh the backup list to see the new backup when ready.',
            status: 'creating'
        });
    }
    catch (error) {
        logger.error('[Backup API] Failed to start backup creation:', error);
        res.status(500).json({ error: 'Failed to create backup: ' + (error instanceof Error ? error.message : 'Unknown error') });
    }
}
/**
 * List available backups
 * GET /api/backups
 */
export async function listBackups(req, res) {
    try {
        if (!existsSync(BACKUPS_DIR)) {
            res.json({ backups: [] });
            return;
        }
        const files = readdirSync(BACKUPS_DIR)
            .filter(file => file.endsWith('.tar.gz'))
            .map(file => {
            const filePath = join(BACKUPS_DIR, file);
            const stats = statSync(filePath);
            return {
                filename: file,
                size: stats.size,
                created: stats.birthtime.toISOString(),
                modified: stats.mtime.toISOString()
            };
        })
            .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
        res.json({ backups: files });
    }
    catch (error) {
        logger.error('[Backup API] Failed to list backups:', error);
        res.status(500).json({ error: 'Failed to list backups' });
    }
}
/**
 * Download a backup file
 * GET /api/backups/download/:filename
 *
 * CRITICAL: This allows users to download backups to their local device
 * (laptop, desktop) or another server, ensuring backups survive server failures.
 */
export async function downloadBackup(req, res) {
    try {
        const filename = req.params.filename;
        // Security: Prevent directory traversal
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            res.status(400).json({ error: 'Invalid filename' });
            return;
        }
        // Only allow .tar.gz files
        if (!filename.endsWith('.tar.gz')) {
            res.status(400).json({ error: 'Invalid backup file format' });
            return;
        }
        const filePath = join(BACKUPS_DIR, filename);
        if (!existsSync(filePath)) {
            res.status(404).json({ error: 'Backup file not found' });
            return;
        }
        const stats = statSync(filePath);
        // Set headers for file download
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', stats.size.toString());
        // Stream file to client
        const fileStream = createReadStream(filePath);
        fileStream.pipe(res);
        logger.info('[Backup API] Backup downloaded', {
            filename,
            size: stats.size,
            user: req.user?.wallet_address
        });
    }
    catch (error) {
        logger.error('[Backup API] Failed to download backup:', error);
        res.status(500).json({ error: 'Failed to download backup' });
    }
}
/**
 * Delete a backup file
 * DELETE /api/backups/:filename
 */
export async function deleteBackup(req, res) {
    try {
        const filename = req.params.filename;
        // Security: Prevent directory traversal
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            res.status(400).json({ error: 'Invalid filename' });
            return;
        }
        // Only allow .tar.gz files
        if (!filename.endsWith('.tar.gz')) {
            res.status(400).json({ error: 'Invalid backup file format' });
            return;
        }
        const filePath = join(BACKUPS_DIR, filename);
        if (!existsSync(filePath)) {
            res.status(404).json({ error: 'Backup file not found' });
            return;
        }
        unlinkSync(filePath);
        logger.info('[Backup API] Backup deleted', {
            filename,
            user: req.user?.wallet_address
        });
        res.json({ success: true, message: 'Backup deleted' });
    }
    catch (error) {
        logger.error('[Backup API] Failed to delete backup:', error);
        res.status(500).json({ error: 'Failed to delete backup' });
    }
}
/**
 * Restore from backup file
 * POST /api/backups/restore
 *
 * Accepts a backup file upload and restores PC2 node data.
 * This will stop the server, restore data, and require manual restart.
 *
 * Body: multipart/form-data with 'file' field containing .tar.gz backup file
 */
export async function restoreBackup(req, res) {
    try {
        // Check if file was uploaded
        if (!req.file) {
            res.status(400).json({ error: 'No backup file provided. Please upload a .tar.gz backup file.' });
            return;
        }
        // Validate file type
        if (!req.file.originalname.endsWith('.tar.gz')) {
            res.status(400).json({ error: 'Invalid backup file format. Backup files must be .tar.gz archives.' });
            return;
        }
        // Validate file size (max 10GB)
        const maxSize = 10 * 1024 * 1024 * 1024; // 10GB
        if (req.file.size > maxSize) {
            res.status(400).json({ error: 'Backup file too large. Maximum size is 10GB.' });
            return;
        }
        if (req.file.size === 0) {
            res.status(400).json({ error: 'Backup file is empty.' });
            return;
        }
        logger.info('[Backup API] Restore requested', {
            filename: req.file.originalname,
            size: req.file.size,
            user: req.user?.wallet_address
        });
        // Ensure backups directory exists
        if (!existsSync(BACKUPS_DIR)) {
            mkdirSync(BACKUPS_DIR, { recursive: true });
        }
        // Save uploaded file to backups directory
        const backupFilename = req.file.originalname;
        const backupPath = join(BACKUPS_DIR, backupFilename);
        // If file already exists, add timestamp to avoid overwriting
        let finalBackupPath = backupPath;
        if (existsSync(backupPath)) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const nameWithoutExt = backupFilename.replace('.tar.gz', '');
            finalBackupPath = join(BACKUPS_DIR, `${nameWithoutExt}-uploaded-${timestamp}.tar.gz`);
        }
        writeFileSync(finalBackupPath, req.file.buffer);
        const savedFilename = finalBackupPath.split('/').pop() || backupFilename;
        logger.info('[Backup API] Backup file saved', {
            savedPath: finalBackupPath,
            filename: savedFilename
        });
        // Get restore script path
        const restoreScriptPath = join(PROJECT_ROOT, 'scripts', 'restore.js');
        if (!existsSync(restoreScriptPath)) {
            res.status(500).json({ error: 'Restore script not found' });
            return;
        }
        // Run restore script asynchronously
        // Note: The restore script will stop the server, so we need to return response first
        execAsync(`node "${restoreScriptPath}" "${savedFilename}"`, {
            cwd: PROJECT_ROOT,
            env: process.env,
            timeout: 600000 // 10 minute timeout
        })
            .then(() => {
            logger.info('[Backup API] Restore completed successfully');
        })
            .catch((error) => {
            logger.error('[Backup API] Restore failed:', error);
        });
        // Return immediately - restore is running in background
        // The restore script will stop the server, so user needs to restart manually
        res.json({
            success: true,
            message: 'Restore process started. The server will stop automatically during restore. Please restart the server manually after restore completes (usually 5-10 minutes).',
            status: 'restoring',
            filename: savedFilename,
            note: 'The restore process will stop this server. You will need to restart it manually using: npm start'
        });
    }
    catch (error) {
        logger.error('[Backup API] Failed to start restore:', error);
        res.status(500).json({
            error: 'Failed to start restore: ' + (error instanceof Error ? error.message : 'Unknown error')
        });
    }
}
//# sourceMappingURL=backup.js.map