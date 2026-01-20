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
  thumbnail: string | null;
  content_text: string | null;
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

export interface FileVersion {
  id: number;
  file_path: string;
  wallet_address: string;
  version_number: number;
  ipfs_hash: string;
  size: number;
  mime_type: string | null;
  created_at: number;
  created_by: string | null;
  comment: string | null;
}

export interface AIConfig {
  wallet_address: string;
  default_provider: string;
  default_model: string | null;
  api_keys: string; // JSON string: { "openai": "sk-...", "claude": "sk-ant-..." }
  ollama_base_url: string;
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
  getDB(): Database.Database {
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
   * Get all active sessions (not expired)
   */
  getAllActiveSessions(): Session[] {
    const db = this.getDB();
    const rows = db.prepare(`
      SELECT * FROM sessions 
      WHERE expires_at > ?
      ORDER BY created_at DESC
    `).all(Date.now()) as Session[];
    return rows;
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

  /**
   * Update session expiration time
   */
  updateSessionExpiration(token: string, newExpiresAt: number): void {
    const db = this.getDB();
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(newExpiresAt, token);
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
    `).run(
      metadata.path,
      metadata.wallet_address,
      metadata.ipfs_hash,
      metadata.size,
      metadata.mime_type,
      metadata.thumbnail || null,
      metadata.content_text || null,
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
      content_text: row.content_text ?? null, // Ensure content_text is always present (even if NULL)
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
      content_text: row.content_text ?? null, // Ensure content_text is always present (even if NULL)
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

  // ============================================================================
  // Public File Operations (for IPFS Gateway)
  // ============================================================================

  /**
   * Get file metadata by IPFS CID (hash)
   * Used for serving content via /ipfs/:cid gateway
   */
  getFileByCID(cid: string): FileMetadata | null {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM files WHERE ipfs_hash = ? LIMIT 1')
      .get(cid) as any;

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
  getPublicFiles(walletAddress: string, basePath?: string): FileMetadata[] {
    const db = this.getDB();
    
    let query: string;
    let params: string[];
    
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
    } else {
      // Get all public files (in /Public folder) - path-based detection
      query = `
        SELECT * FROM files 
        WHERE wallet_address = ? 
          AND path LIKE ?
        ORDER BY is_dir DESC, path ASC
      `;
      params = [walletAddress, `/${walletAddress}/Public/%`];
    }

    const rows = db.prepare(query).all(...params) as any[];

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
  getPublicStats(): { publicFileCount: number; totalPublicSize: number } {
    const db = this.getDB();
    // Use path-based detection: files in /*/Public/* are public
    const row = db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(size), 0) as total_size
      FROM files 
      WHERE path LIKE '%/Public/%' AND is_dir = 0
    `).get() as { count: number; total_size: number };

    return {
      publicFileCount: row.count,
      totalPublicSize: row.total_size
    };
  }

  /**
   * Check if a CID is publicly accessible
   */
  isPublicCID(cid: string): boolean {
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

  // ============================================================================
  // File Version Operations
  // ============================================================================

  /**
   * Create a new file version snapshot
   */
  createFileVersion(version: Omit<FileVersion, 'id'>): void {
    const db = this.getDB();
    db.prepare(`
      INSERT INTO file_versions (
        file_path, wallet_address, version_number, ipfs_hash, 
        size, mime_type, created_at, created_by, comment
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      version.file_path,
      version.wallet_address,
      version.version_number,
      version.ipfs_hash,
      version.size,
      version.mime_type || null,
      version.created_at,
      version.created_by || null,
      version.comment || null
    );
  }

  /**
   * Get all versions for a file (ordered by version number, newest first)
   */
  getFileVersions(filePath: string, walletAddress: string): FileVersion[] {
    const db = this.getDB();
    const rows = db.prepare(`
      SELECT * FROM file_versions
      WHERE file_path = ? AND wallet_address = ?
      ORDER BY version_number DESC
    `).all(filePath, walletAddress) as FileVersion[];
    return rows;
  }

  /**
   * Get a specific version of a file
   */
  getFileVersion(filePath: string, walletAddress: string, versionNumber: number): FileVersion | null {
    const db = this.getDB();
    const row = db.prepare(`
      SELECT * FROM file_versions
      WHERE file_path = ? AND wallet_address = ? AND version_number = ?
    `).get(filePath, walletAddress, versionNumber) as FileVersion | undefined;
    return row ?? null;
  }

  /**
   * Get the next version number for a file
   */
  getNextVersionNumber(filePath: string, walletAddress: string): number {
    const db = this.getDB();
    const row = db.prepare(`
      SELECT MAX(version_number) as max_version
      FROM file_versions
      WHERE file_path = ? AND wallet_address = ?
    `).get(filePath, walletAddress) as { max_version: number | null } | undefined;
    return (row?.max_version ?? 0) + 1;
  }

  /**
   * Delete all versions for a file (when file is deleted)
   */
  deleteFileVersions(filePath: string, walletAddress: string): void {
    const db = this.getDB();
    db.prepare(`
      DELETE FROM file_versions
      WHERE file_path = ? AND wallet_address = ?
    `).run(filePath, walletAddress);
  }

  /**
   * Update file path for all versions (when file is renamed/moved)
   */
  updateFileVersionPaths(oldPath: string, newPath: string, walletAddress: string): void {
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
  getVersionCount(filePath: string, walletAddress: string): number {
    const db = this.getDB();
    const row = db.prepare(`
      SELECT COUNT(*) as count
      FROM file_versions
      WHERE file_path = ? AND wallet_address = ?
    `).get(filePath, walletAddress) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  /**
   * Execute a raw SQL query (for custom queries not covered by standard methods)
   * Use with caution - prefer using standard methods when possible
   * Returns all rows
   */
  query(sql: string, ...params: any[]): any[] {
    const db = this.getDB();
    return db.prepare(sql).all(...params) as any[];
  }

  /**
   * Execute a raw SQL query and return single row
   * Returns single row or undefined
   */
  queryOne(sql: string, ...params: any[]): any {
    const db = this.getDB();
    return db.prepare(sql).get(...params);
  }

  // ============================================================================
  // AI Configuration Operations (Wallet-Scoped)
  // ============================================================================

  /**
   * Get AI configuration for a wallet
   */
  getAIConfig(walletAddress: string): AIConfig | null {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM ai_config WHERE wallet_address = ?')
      .get(walletAddress) as AIConfig | undefined;
    return row ?? null;
  }

  /**
   * Create or update AI configuration
   */
  setAIConfig(
    walletAddress: string,
    defaultProvider: string = 'ollama',
    defaultModel: string | null = null,
    apiKeys: Record<string, string> | null = null,
    ollamaBaseUrl: string = 'http://localhost:11434'
  ): void {
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
  updateAIAPIKeys(walletAddress: string, apiKeys: Record<string, string>): void {
    const db = this.getDB();
    const existing = this.getAIConfig(walletAddress);
    
    // Merge with existing keys
    let mergedKeys: Record<string, string> = {};
    if (existing?.api_keys) {
      try {
        mergedKeys = JSON.parse(existing.api_keys);
      } catch (e) {
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
    `).run(
      walletAddress,
      existing?.default_provider || 'ollama',
      existing?.default_model || null,
      JSON.stringify(mergedKeys),
      existing?.ollama_base_url || 'http://localhost:11434',
      now
    );
  }

  /**
   * Delete API key for a specific provider
   */
  deleteAIAPIKey(walletAddress: string, provider: string): void {
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
    } catch (e) {
      // If parsing fails, ignore
    }
  }

  // ============================================================================
  // Recent Apps Operations
  // ============================================================================

  /**
   * Record a recent app launch (upsert - update launched_at if exists)
   */
  recordRecentApp(walletAddress: string, appName: string): void {
    const db = this.getDB();
    const now = Date.now();
    
    db.prepare(`
      INSERT INTO recent_apps (wallet_address, app_name, launched_at)
      VALUES (?, ?, ?)
      ON CONFLICT(wallet_address, app_name) DO UPDATE SET
        launched_at = excluded.launched_at
    `).run(walletAddress, appName, now);
  }

  /**
   * Get recent apps for a user, ordered by most recent first
   */
  getRecentApps(walletAddress: string, limit: number = 10): string[] {
    const db = this.getDB();
    const rows = db.prepare(`
      SELECT app_name
      FROM recent_apps
      WHERE wallet_address = ?
      ORDER BY launched_at DESC
      LIMIT ?
    `).all(walletAddress, limit) as Array<{ app_name: string }>;
    
    return rows.map(row => row.app_name);
  }

  // ============================================================================
  // API Key Operations
  // ============================================================================

  /**
   * Create a new API key
   */
  createApiKey(keyId: string, keyHash: string, walletAddress: string, name: string, scopes: string, expiresAt?: number): void {
    const db = this.getDB();
    const now = Date.now();
    
    db.prepare(`
      INSERT INTO api_keys (key_id, key_hash, wallet_address, name, scopes, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(keyId, keyHash, walletAddress, name, scopes, now, expiresAt || null);
  }

  /**
   * Get API key by hash (for authentication)
   */
  getApiKeyByHash(keyHash: string): { key_id: string; wallet_address: string; name: string; scopes: string; expires_at: number | null; revoked: number } | null {
    const db = this.getDB();
    const row = db.prepare(`
      SELECT key_id, wallet_address, name, scopes, expires_at, revoked
      FROM api_keys
      WHERE key_hash = ? AND revoked = 0
    `).get(keyHash) as any;
    
    return row || null;
  }

  /**
   * Update last used timestamp for API key
   */
  updateApiKeyLastUsed(keyId: string): void {
    const db = this.getDB();
    db.prepare(`
      UPDATE api_keys SET last_used_at = ? WHERE key_id = ?
    `).run(Date.now(), keyId);
  }

  /**
   * List API keys for a user
   */
  listApiKeys(walletAddress: string): Array<{ key_id: string; name: string; scopes: string; created_at: number; expires_at: number | null; last_used_at: number | null; revoked: number }> {
    const db = this.getDB();
    const rows = db.prepare(`
      SELECT key_id, name, scopes, created_at, expires_at, last_used_at, revoked
      FROM api_keys
      WHERE wallet_address = ?
      ORDER BY created_at DESC
    `).all(walletAddress) as any[];
    
    return rows;
  }

  /**
   * Revoke an API key
   */
  revokeApiKey(keyId: string, walletAddress: string): boolean {
    const db = this.getDB();
    const result = db.prepare(`
      UPDATE api_keys SET revoked = 1 WHERE key_id = ? AND wallet_address = ?
    `).run(keyId, walletAddress);
    
    return result.changes > 0;
  }

  /**
   * Delete an API key
   */
  deleteApiKey(keyId: string, walletAddress: string): boolean {
    const db = this.getDB();
    const result = db.prepare(`
      DELETE FROM api_keys WHERE key_id = ? AND wallet_address = ?
    `).run(keyId, walletAddress);
    
    return result.changes > 0;
  }

  // ============================================================================
  // Audit Log Methods
  // ============================================================================

  /**
   * Create an audit log entry
   */
  createAuditLog(entry: {
    wallet_address: string;
    action: string;
    resource?: string;
    resource_path?: string;
    method: string;
    endpoint: string;
    status_code?: number;
    request_body?: string | null;
    response_summary?: string | null;
    ip_address?: string;
    user_agent?: string;
    api_key_id?: string;
    duration_ms?: number;
    created_at: number;
  }): void {
    const db = this.getDB();
    db.prepare(`
      INSERT INTO audit_logs (
        wallet_address, action, resource, resource_path, method, endpoint,
        status_code, request_body, response_summary, ip_address, user_agent,
        api_key_id, duration_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.wallet_address,
      entry.action,
      entry.resource || null,
      entry.resource_path || null,
      entry.method,
      entry.endpoint,
      entry.status_code || null,
      entry.request_body || null,
      entry.response_summary || null,
      entry.ip_address || null,
      entry.user_agent || null,
      entry.api_key_id || null,
      entry.duration_ms || null,
      entry.created_at
    );
  }

  /**
   * Get audit logs for a user
   */
  getAuditLogs(
    walletAddress: string,
    options: {
      limit?: number;
      offset?: number;
      action?: string;
      since?: number;
      until?: number;
    } = {}
  ): Array<{
    id: number;
    action: string;
    resource: string | null;
    resource_path: string | null;
    method: string;
    endpoint: string;
    status_code: number | null;
    request_body: string | null;
    response_summary: string | null;
    ip_address: string | null;
    user_agent: string | null;
    api_key_id: string | null;
    duration_ms: number | null;
    created_at: number;
  }> {
    const db = this.getDB();
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    
    let query = `
      SELECT id, action, resource, resource_path, method, endpoint,
        status_code, request_body, response_summary, ip_address, user_agent,
        api_key_id, duration_ms, created_at
      FROM audit_logs
      WHERE wallet_address = ?
    `;
    const params: any[] = [walletAddress];

    if (options.action) {
      query += ' AND action = ?';
      params.push(options.action);
    }
    if (options.since) {
      query += ' AND created_at >= ?';
      params.push(options.since);
    }
    if (options.until) {
      query += ' AND created_at <= ?';
      params.push(options.until);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return db.prepare(query).all(...params) as any[];
  }

  /**
   * Get audit log count for a user
   */
  getAuditLogsCount(
    walletAddress: string,
    options: {
      action?: string;
      since?: number;
      until?: number;
    } = {}
  ): number {
    const db = this.getDB();
    
    let query = 'SELECT COUNT(*) as count FROM audit_logs WHERE wallet_address = ?';
    const params: any[] = [walletAddress];

    if (options.action) {
      query += ' AND action = ?';
      params.push(options.action);
    }
    if (options.since) {
      query += ' AND created_at >= ?';
      params.push(options.since);
    }
    if (options.until) {
      query += ' AND created_at <= ?';
      params.push(options.until);
    }

    const result = db.prepare(query).get(...params) as { count: number };
    return result.count;
  }

  /**
   * Get audit stats for a user
   */
  getAuditStats(
    walletAddress: string,
    since: number
  ): {
    total_actions: number;
    actions_by_type: Record<string, number>;
    average_duration_ms: number;
    success_rate: number;
  } {
    const db = this.getDB();
    
    // Total actions
    const totalResult = db.prepare(`
      SELECT COUNT(*) as count FROM audit_logs
      WHERE wallet_address = ? AND created_at >= ?
    `).get(walletAddress, since) as { count: number };

    // Actions by type
    const actionResults = db.prepare(`
      SELECT action, COUNT(*) as count FROM audit_logs
      WHERE wallet_address = ? AND created_at >= ?
      GROUP BY action ORDER BY count DESC
    `).all(walletAddress, since) as Array<{ action: string; count: number }>;

    const actionsByType: Record<string, number> = {};
    for (const row of actionResults) {
      actionsByType[row.action] = row.count;
    }

    // Average duration
    const durationResult = db.prepare(`
      SELECT AVG(duration_ms) as avg FROM audit_logs
      WHERE wallet_address = ? AND created_at >= ? AND duration_ms IS NOT NULL
    `).get(walletAddress, since) as { avg: number | null };

    // Success rate (status 2xx or response_summary contains 'success')
    const successResult = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN (status_code >= 200 AND status_code < 300) OR response_summary LIKE '%success%' THEN 1 ELSE 0 END) as success
      FROM audit_logs
      WHERE wallet_address = ? AND created_at >= ?
    `).get(walletAddress, since) as { total: number; success: number };

    return {
      total_actions: totalResult.count,
      actions_by_type: actionsByType,
      average_duration_ms: Math.round(durationResult.avg || 0),
      success_rate: successResult.total > 0 ? (successResult.success / successResult.total) * 100 : 100,
    };
  }
}
