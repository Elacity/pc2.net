/**
 * Database Module
 * 
 * SQLite database for persistent storage of users, sessions, files, and settings
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { runMigrations } from './migrations.js';

export interface User {
  wallet_address: string;
  smart_account_address: string | null;
  created_at: number;
  last_login: number | null;
}

export interface Session {
  token: string;
  wallet_address: string;
  smart_account_address: string | null;
  created_at: number;
  expires_at: number;
}

export interface FileMetadata {
  path: string;
  wallet_address: string;
  ipfs_hash: string | null;
  size: number;
  mime_type: string | null;
  is_dir: boolean;
  is_public: boolean;
  created_at: number;
  updated_at: number;
}

export interface Setting {
  key: string;
  value: string;
  updated_at: number;
}

export class DatabaseManager {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * Initialize database connection and run migrations
   */
  initialize(): void {
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
  private getDB(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Close database connection
   */
  close(): void {
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
  createOrUpdateUser(walletAddress: string, smartAccountAddress: string | null = null): void {
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
  getUser(walletAddress: string): User | null {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM users WHERE wallet_address = ?').get(walletAddress) as User | undefined;
    return row ?? null;
  }

  /**
   * Update user's last login time
   */
  updateLastLogin(walletAddress: string): void {
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
  createSession(session: Session): void {
    const db = this.getDB();
    db.prepare(`
      INSERT INTO sessions (token, wallet_address, smart_account_address, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      session.token,
      session.wallet_address,
      session.smart_account_address,
      session.created_at,
      session.expires_at
    );
  }

  /**
   * Get session by token
   */
  getSession(token: string): Session | null {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token) as Session | undefined;
    return row ?? null;
  }

  /**
   * Get session by wallet address (most recent)
   */
  getSessionByWallet(walletAddress: string): Session | null {
    const db = this.getDB();
    const row = db.prepare(`
      SELECT * FROM sessions 
      WHERE wallet_address = ? AND expires_at > ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(walletAddress, Date.now()) as Session | undefined;
    return row ?? null;
  }

  /**
   * Delete session
   */
  deleteSession(token: string): void {
    const db = this.getDB();
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  /**
   * Delete expired sessions
   */
  cleanupExpiredSessions(): number {
    const db = this.getDB();
    const result = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    return result.changes;
  }

  /**
   * Delete all sessions for a wallet
   */
  deleteSessionsByWallet(walletAddress: string): void {
    const db = this.getDB();
    db.prepare('DELETE FROM sessions WHERE wallet_address = ?').run(walletAddress);
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  /**
   * Create or update file metadata
   */
  createOrUpdateFile(metadata: FileMetadata): void {
    const db = this.getDB();
    db.prepare(`
      INSERT INTO files (path, wallet_address, ipfs_hash, size, mime_type, is_dir, is_public, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(path, wallet_address) DO UPDATE SET
        ipfs_hash = excluded.ipfs_hash,
        size = excluded.size,
        mime_type = excluded.mime_type,
        is_dir = excluded.is_dir,
        is_public = excluded.is_public,
        updated_at = excluded.updated_at
    `).run(
      metadata.path,
      metadata.wallet_address,
      metadata.ipfs_hash,
      metadata.size,
      metadata.mime_type,
      metadata.is_dir ? 1 : 0,
      metadata.is_public ? 1 : 0,
      metadata.created_at,
      metadata.updated_at
    );
  }

  /**
   * Get file metadata
   */
  getFile(path: string, walletAddress: string): FileMetadata | null {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM files WHERE path = ? AND wallet_address = ?')
      .get(path, walletAddress) as any;

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
  listFiles(directoryPath: string, walletAddress: string): FileMetadata[] {
    const db = this.getDB();
    const rows = db.prepare(`
      SELECT * FROM files 
      WHERE path LIKE ? AND wallet_address = ?
      ORDER BY is_dir DESC, path ASC
    `).all(`${directoryPath}%`, walletAddress) as any[];

    return rows.map(row => ({
      ...row,
      is_dir: row.is_dir === 1,
      is_public: row.is_public === 1
    }));
  }

  /**
   * Delete file metadata
   */
  deleteFile(path: string, walletAddress: string): void {
    const db = this.getDB();
    db.prepare('DELETE FROM files WHERE path = ? AND wallet_address = ?')
      .run(path, walletAddress);
  }

  /**
   * Delete all files for a wallet (cascade on user delete)
   */
  deleteFilesByWallet(walletAddress: string): void {
    const db = this.getDB();
    db.prepare('DELETE FROM files WHERE wallet_address = ?').run(walletAddress);
  }

  /**
   * Get storage statistics for a wallet
   */
  getStorageStats(walletAddress: string): {
    totalSize: number;
    fileCount: number;
    directoryCount: number;
  } {
    const db = this.getDB();
    
    // Get total size and counts
    const stats = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN is_dir = 0 THEN size ELSE 0 END), 0) as total_size,
        COUNT(CASE WHEN is_dir = 0 THEN 1 END) as file_count,
        COUNT(CASE WHEN is_dir = 1 THEN 1 END) as directory_count
      FROM files
      WHERE wallet_address = ?
    `).get(walletAddress) as { total_size: number; file_count: number; directory_count: number };
    
    return {
      totalSize: stats.total_size || 0,
      fileCount: stats.file_count || 0,
      directoryCount: stats.directory_count || 0
    };
  }

  // ============================================================================
  // Settings Operations
  // ============================================================================

  /**
   * Get setting value
   */
  getSetting(key: string): string | null {
    const db = this.getDB();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  /**
   * Set setting value
   */
  setSetting(key: string, value: string): void {
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
  deleteSetting(key: string): void {
    const db = this.getDB();
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }

  /**
   * Get all settings
   */
  getAllSettings(): Setting[] {
    const db = this.getDB();
    return db.prepare('SELECT * FROM settings').all() as Setting[];
  }
}

