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
    constructor(dbPath) {
        this.db = null;
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
      INSERT INTO files (path, wallet_address, ipfs_hash, size, mime_type, thumbnail, is_dir, is_public, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(path, wallet_address) DO UPDATE SET
        ipfs_hash = excluded.ipfs_hash,
        size = excluded.size,
        mime_type = excluded.mime_type,
        thumbnail = excluded.thumbnail,
        is_dir = excluded.is_dir,
        is_public = excluded.is_public,
        updated_at = excluded.updated_at
    `).run(metadata.path, metadata.wallet_address, metadata.ipfs_hash, metadata.size, metadata.mime_type, metadata.thumbnail || null, metadata.is_dir ? 1 : 0, metadata.is_public ? 1 : 0, metadata.created_at, metadata.updated_at);
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
}
