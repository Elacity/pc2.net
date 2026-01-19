/**
 * Database Module
 *
 * SQLite database for persistent storage of users, sessions, files, and settings
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { runMigrations } from './migrations.js';
export class DatabaseManager {
    db = null;
    dbPath;
    constructor(dbPath) {
        this.dbPath = dbPath;
    }
    /**
     * Initialize database connection and run migrations
     */
    initialize() {
        if (this.db) {
            return; // Already initialized
        }
        // Ensure data directory exists
        const dbDir = dirname(this.dbPath);
        if (!existsSync(dbDir)) {
            mkdirSync(dbDir, { recursive: true });
        }
        // Open database connection
        this.db = new Database(this.dbPath);
        // Enable foreign keys
        this.db.pragma('foreign_keys = ON');
        // Run migrations
        runMigrations(this.db);
        console.log(`✅ Database initialized: ${this.dbPath}`);
    }
    /**
     * Get database instance (throws if not initialized)
     */
    getDB() {
        if (!this.db) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return this.db;
    }
    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            console.log('✅ Database connection closed');
        }
    }
    // ============================================================================
    // User Operations
    // ============================================================================
    /**
     * Create or update user
     */
    createOrUpdateUser(walletAddress, smartAccountAddress = null) {
        const db = this.getDB();
        const now = Date.now();
        db.prepare(`
      INSERT INTO users (wallet_address, smart_account_address, created_at, last_login)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(wallet_address) DO UPDATE SET
        smart_account_address = excluded.smart_account_address,
        last_login = excluded.last_login
    `).run(walletAddress, smartAccountAddress, now, now);
    }
    /**
     * Get user by wallet address
     */
    getUser(walletAddress) {
        const db = this.getDB();
        const row = db.prepare('SELECT * FROM users WHERE wallet_address = ?').get(walletAddress);
        return row ?? null;
    }
    /**
     * Update user's last login time
     */
    updateLastLogin(walletAddress) {
        const db = this.getDB();
        db.prepare('UPDATE users SET last_login = ? WHERE wallet_address = ?')
            .run(Date.now(), walletAddress);
    }
    // ============================================================================
    // Session Operations
    // ============================================================================
    /**
     * Create session
     */
    createSession(session) {
        const db = this.getDB();
        db.prepare(`
      INSERT INTO sessions (token, wallet_address, smart_account_address, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(session.token, session.wallet_address, session.smart_account_address, session.created_at, session.expires_at);
    }
    /**
     * Get session by token
     */
    getSession(token) {
        const db = this.getDB();
        const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
        return row ?? null;
    }
    /**
     * Get session by wallet address (most recent)
     */
    getSessionByWallet(walletAddress) {
        const db = this.getDB();
        const row = db.prepare(`
      SELECT * FROM sessions 
      WHERE wallet_address = ? AND expires_at > ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(walletAddress, Date.now());
        return row ?? null;
    }
    /**
     * Get all active sessions (not expired)
     */
    getAllActiveSessions() {
        const db = this.getDB();
        const rows = db.prepare(`
      SELECT * FROM sessions 
      WHERE expires_at > ?
      ORDER BY created_at DESC
    `).all(Date.now());
        return rows;
    }
    /**
     * Delete session
     */
    deleteSession(token) {
        const db = this.getDB();
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
    /**
     * Delete expired sessions
     */
    cleanupExpiredSessions() {
        const db = this.getDB();
        const result = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
        return result.changes;
    }
    /**
     * Delete all sessions for a wallet
     */
    deleteSessionsByWallet(walletAddress) {
        const db = this.getDB();
        db.prepare('DELETE FROM sessions WHERE wallet_address = ?').run(walletAddress);
    }
    /**
     * Update session expiration time
     */
    updateSessionExpiration(token, newExpiresAt) {
        const db = this.getDB();
        db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(newExpiresAt, token);
    }
    // ============================================================================
    // File Operations
    // ============================================================================
    /**
     * Create or update file metadata
     */
    createOrUpdateFile(metadata) {
        const db = this.getDB();
        db.prepare(`
      INSERT INTO files (path, wallet_address, ipfs_hash, size, mime_type, thumbnail, content_text, is_dir, is_public, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(path, wallet_address) DO UPDATE SET
        ipfs_hash = excluded.ipfs_hash,
        size = excluded.size,
        mime_type = excluded.mime_type,
        thumbnail = excluded.thumbnail,
        content_text = excluded.content_text,
        is_dir = excluded.is_dir,
        is_public = excluded.is_public,
        updated_at = excluded.updated_at
    `).run(metadata.path, metadata.wallet_address, metadata.ipfs_hash, metadata.size, metadata.mime_type, metadata.thumbnail || null, metadata.content_text || null, metadata.is_dir ? 1 : 0, metadata.is_public ? 1 : 0, metadata.created_at, metadata.updated_at);
    }
    /**
     * Get file metadata
     */
    getFile(path, walletAddress) {
        const db = this.getDB();
        const row = db.prepare('SELECT * FROM files WHERE path = ? AND wallet_address = ?')
            .get(path, walletAddress);
        if (!row) {
            return null;
        }
        return {
            ...row,
            content_text: row.content_text ?? null, // Ensure content_text is always present (even if NULL)
            is_dir: row.is_dir === 1,
            is_public: row.is_public === 1
        };
    }
    /**
     * List files in directory
     */
    listFiles(directoryPath, walletAddress) {
        const db = this.getDB();
        const rows = db.prepare(`
      SELECT * FROM files 
      WHERE path LIKE ? AND wallet_address = ?
      ORDER BY is_dir DESC, path ASC
    `).all(`${directoryPath}%`, walletAddress);
        return rows.map(row => ({
            ...row,
            content_text: row.content_text ?? null, // Ensure content_text is always present (even if NULL)
            is_dir: row.is_dir === 1,
            is_public: row.is_public === 1
        }));
    }
    /**
     * Delete file metadata
     */
    deleteFile(path, walletAddress) {
        const db = this.getDB();
        db.prepare('DELETE FROM files WHERE path = ? AND wallet_address = ?')
            .run(path, walletAddress);
    }
    /**
     * Delete all files for a wallet (cascade on user delete)
     */
    deleteFilesByWallet(walletAddress) {
        const db = this.getDB();
        db.prepare('DELETE FROM files WHERE wallet_address = ?').run(walletAddress);
    }
    // ============================================================================
    // Public File Operations (for IPFS Gateway)
    // ============================================================================
    /**
     * Get file metadata by IPFS CID (hash)
     * Used for serving content via /ipfs/:cid gateway
     */
    getFileByCID(cid) {
        const db = this.getDB();
        const row = db.prepare('SELECT * FROM files WHERE ipfs_hash = ? LIMIT 1')
            .get(cid);
        if (!row) {
            return null;
        }
        return {
            ...row,
            content_text: row.content_text ?? null,
            is_dir: row.is_dir === 1,
            is_public: row.is_public === 1
        };
    }
    /**
     * Get all public files for a wallet
     * Optionally filter by base path (for directory listings)
     */
    getPublicFiles(walletAddress, basePath) {
        const db = this.getDB();
        let query;
        let params;
        if (basePath) {
            // Get direct children of the specified path (path-based public detection)
            query = `
        SELECT * FROM files 
        WHERE wallet_address = ? 
          AND path LIKE '%/Public/%'
          AND path LIKE ?
          AND path NOT LIKE ?
        ORDER BY is_dir DESC, path ASC
      `;
            // Match direct children only (path/% but not path/%/%)
            params = [walletAddress, `${basePath}/%`, `${basePath}/%/%`];
        }
        else {
            // Get all public files (in /Public folder) - path-based detection
            query = `
        SELECT * FROM files 
        WHERE wallet_address = ? 
          AND path LIKE ?
        ORDER BY is_dir DESC, path ASC
      `;
            params = [walletAddress, `/${walletAddress}/Public/%`];
        }
        const rows = db.prepare(query).all(...params);
        return rows.map(row => ({
            ...row,
            content_text: row.content_text ?? null,
            is_dir: row.is_dir === 1,
            is_public: row.is_public === 1
        }));
    }
    /**
     * Get statistics for public files
     */
    getPublicStats() {
        const db = this.getDB();
        // Use path-based detection: files in /*/Public/* are public
        const row = db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(size), 0) as total_size
      FROM files 
      WHERE path LIKE '%/Public/%' AND is_dir = 0
    `).get();
        return {
            publicFileCount: row.count,
            totalPublicSize: row.total_size
        };
    }
    /**
     * Check if a CID is publicly accessible
     */
    isPublicCID(cid) {
        const db = this.getDB();
        // Use path-based detection: files in /*/Public/* are public
        const row = db.prepare(`
      SELECT 1 FROM files 
      WHERE ipfs_hash = ? AND path LIKE '%/Public/%'
      LIMIT 1
    `).get(cid);
        return !!row;
    }
    // ============================================================================
    // Settings Operations
    // ============================================================================
    /**
     * Get setting value
     */
    getSetting(key) {
        const db = this.getDB();
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        return row?.value ?? null;
    }
    /**
     * Set setting value
     */
    setSetting(key, value) {
        const db = this.getDB();
        db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run(key, value, Date.now());
    }
    /**
     * Delete setting
     */
    deleteSetting(key) {
        const db = this.getDB();
        db.prepare('DELETE FROM settings WHERE key = ?').run(key);
    }
    /**
     * Get all settings
     */
    getAllSettings() {
        const db = this.getDB();
        return db.prepare('SELECT * FROM settings').all();
    }
    // ============================================================================
    // File Version Operations
    // ============================================================================
    /**
     * Create a new file version snapshot
     */
    createFileVersion(version) {
        const db = this.getDB();
        db.prepare(`
      INSERT INTO file_versions (
        file_path, wallet_address, version_number, ipfs_hash, 
        size, mime_type, created_at, created_by, comment
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(version.file_path, version.wallet_address, version.version_number, version.ipfs_hash, version.size, version.mime_type || null, version.created_at, version.created_by || null, version.comment || null);
    }
    /**
     * Get all versions for a file (ordered by version number, newest first)
     */
    getFileVersions(filePath, walletAddress) {
        const db = this.getDB();
        const rows = db.prepare(`
      SELECT * FROM file_versions
      WHERE file_path = ? AND wallet_address = ?
      ORDER BY version_number DESC
    `).all(filePath, walletAddress);
        return rows;
    }
    /**
     * Get a specific version of a file
     */
    getFileVersion(filePath, walletAddress, versionNumber) {
        const db = this.getDB();
        const row = db.prepare(`
      SELECT * FROM file_versions
      WHERE file_path = ? AND wallet_address = ? AND version_number = ?
    `).get(filePath, walletAddress, versionNumber);
        return row ?? null;
    }
    /**
     * Get the next version number for a file
     */
    getNextVersionNumber(filePath, walletAddress) {
        const db = this.getDB();
        const row = db.prepare(`
      SELECT MAX(version_number) as max_version
      FROM file_versions
      WHERE file_path = ? AND wallet_address = ?
    `).get(filePath, walletAddress);
        return (row?.max_version ?? 0) + 1;
    }
    /**
     * Delete all versions for a file (when file is deleted)
     */
    deleteFileVersions(filePath, walletAddress) {
        const db = this.getDB();
        db.prepare(`
      DELETE FROM file_versions
      WHERE file_path = ? AND wallet_address = ?
    `).run(filePath, walletAddress);
    }
    /**
     * Update file path for all versions (when file is renamed/moved)
     */
    updateFileVersionPaths(oldPath, newPath, walletAddress) {
        const db = this.getDB();
        db.prepare(`
      UPDATE file_versions
      SET file_path = ?
      WHERE file_path = ? AND wallet_address = ?
    `).run(newPath, oldPath, walletAddress);
    }
    /**
     * Get version count for a file
     */
    getVersionCount(filePath, walletAddress) {
        const db = this.getDB();
        const row = db.prepare(`
      SELECT COUNT(*) as count
      FROM file_versions
      WHERE file_path = ? AND wallet_address = ?
    `).get(filePath, walletAddress);
        return row?.count ?? 0;
    }
    /**
     * Execute a raw SQL query (for custom queries not covered by standard methods)
     * Use with caution - prefer using standard methods when possible
     * Returns all rows
     */
    query(sql, ...params) {
        const db = this.getDB();
        return db.prepare(sql).all(...params);
    }
    /**
     * Execute a raw SQL query and return single row
     * Returns single row or undefined
     */
    queryOne(sql, ...params) {
        const db = this.getDB();
        return db.prepare(sql).get(...params);
    }
    // ============================================================================
    // AI Configuration Operations (Wallet-Scoped)
    // ============================================================================
    /**
     * Get AI configuration for a wallet
     */
    getAIConfig(walletAddress) {
        const db = this.getDB();
        const row = db.prepare('SELECT * FROM ai_config WHERE wallet_address = ?')
            .get(walletAddress);
        return row ?? null;
    }
    /**
     * Create or update AI configuration
     */
    setAIConfig(walletAddress, defaultProvider = 'ollama', defaultModel = null, apiKeys = null, ollamaBaseUrl = 'http://localhost:11434') {
        const db = this.getDB();
        const now = Math.floor(Date.now() / 1000);
        const apiKeysJson = apiKeys ? JSON.stringify(apiKeys) : null;
        db.prepare(`
      INSERT INTO ai_config (wallet_address, default_provider, default_model, api_keys, ollama_base_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(wallet_address) DO UPDATE SET
        default_provider = excluded.default_provider,
        default_model = excluded.default_model,
        api_keys = excluded.api_keys,
        ollama_base_url = excluded.ollama_base_url,
        updated_at = excluded.updated_at
    `).run(walletAddress, defaultProvider, defaultModel, apiKeysJson, ollamaBaseUrl, now);
    }
    /**
     * Update API keys for a wallet (merge with existing)
     */
    updateAIAPIKeys(walletAddress, apiKeys) {
        const db = this.getDB();
        const existing = this.getAIConfig(walletAddress);
        // Merge with existing keys
        let mergedKeys = {};
        if (existing?.api_keys) {
            try {
                mergedKeys = JSON.parse(existing.api_keys);
            }
            catch (e) {
                // If parsing fails, start fresh
            }
        }
        // Merge new keys
        Object.assign(mergedKeys, apiKeys);
        // Update config
        const now = Math.floor(Date.now() / 1000);
        db.prepare(`
      INSERT INTO ai_config (wallet_address, default_provider, default_model, api_keys, ollama_base_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(wallet_address) DO UPDATE SET
        api_keys = excluded.api_keys,
        updated_at = excluded.updated_at
    `).run(walletAddress, existing?.default_provider || 'ollama', existing?.default_model || null, JSON.stringify(mergedKeys), existing?.ollama_base_url || 'http://localhost:11434', now);
    }
    /**
     * Delete API key for a specific provider
     */
    deleteAIAPIKey(walletAddress, provider) {
        const db = this.getDB();
        const existing = this.getAIConfig(walletAddress);
        if (!existing?.api_keys) {
            return; // No keys to delete
        }
        try {
            const keys = JSON.parse(existing.api_keys);
            delete keys[provider];
            const now = Math.floor(Date.now() / 1000);
            db.prepare(`
        UPDATE ai_config 
        SET api_keys = ?, updated_at = ?
        WHERE wallet_address = ?
      `).run(JSON.stringify(keys), now, walletAddress);
        }
        catch (e) {
            // If parsing fails, ignore
        }
    }
}
//# sourceMappingURL=database.js.map