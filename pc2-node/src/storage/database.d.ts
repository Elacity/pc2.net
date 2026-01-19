/**
 * Database Module
 *
 * SQLite database for persistent storage of users, sessions, files, and settings
 */
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
    api_keys: string;
    ollama_base_url: string;
    updated_at: number;
}
export declare class DatabaseManager {
    private db;
    private dbPath;
    constructor(dbPath: string);
    /**
     * Initialize database connection and run migrations
     */
    initialize(): void;
    /**
     * Get database instance (throws if not initialized)
     */
    private getDB;
    /**
     * Close database connection
     */
    close(): void;
    /**
     * Create or update user
     */
    createOrUpdateUser(walletAddress: string, smartAccountAddress?: string | null): void;
    /**
     * Get user by wallet address
     */
    getUser(walletAddress: string): User | null;
    /**
     * Update user's last login time
     */
    updateLastLogin(walletAddress: string): void;
    /**
     * Create session
     */
    createSession(session: Session): void;
    /**
     * Get session by token
     */
    getSession(token: string): Session | null;
    /**
     * Get session by wallet address (most recent)
     */
    getSessionByWallet(walletAddress: string): Session | null;
    /**
     * Get all active sessions (not expired)
     */
    getAllActiveSessions(): Session[];
    /**
     * Delete session
     */
    deleteSession(token: string): void;
    /**
     * Delete expired sessions
     */
    cleanupExpiredSessions(): number;
    /**
     * Delete all sessions for a wallet
     */
    deleteSessionsByWallet(walletAddress: string): void;
    /**
     * Update session expiration time
     */
    updateSessionExpiration(token: string, newExpiresAt: number): void;
    /**
     * Create or update file metadata
     */
    createOrUpdateFile(metadata: FileMetadata): void;
    /**
     * Get file metadata
     */
    getFile(path: string, walletAddress: string): FileMetadata | null;
    /**
     * List files in directory
     */
    listFiles(directoryPath: string, walletAddress: string): FileMetadata[];
    /**
     * Delete file metadata
     */
    deleteFile(path: string, walletAddress: string): void;
    /**
     * Delete all files for a wallet (cascade on user delete)
     */
    deleteFilesByWallet(walletAddress: string): void;
    /**
     * Get file metadata by IPFS CID (hash)
     * Used for serving content via /ipfs/:cid gateway
     */
    getFileByCID(cid: string): FileMetadata | null;
    /**
     * Get all public files for a wallet
     * Optionally filter by base path (for directory listings)
     */
    getPublicFiles(walletAddress: string, basePath?: string): FileMetadata[];
    /**
     * Get statistics for public files
     */
    getPublicStats(): {
        publicFileCount: number;
        totalPublicSize: number;
    };
    /**
     * Check if a CID is publicly accessible
     */
    isPublicCID(cid: string): boolean;
    /**
     * Get setting value
     */
    getSetting(key: string): string | null;
    /**
     * Set setting value
     */
    setSetting(key: string, value: string): void;
    /**
     * Delete setting
     */
    deleteSetting(key: string): void;
    /**
     * Get all settings
     */
    getAllSettings(): Setting[];
    /**
     * Create a new file version snapshot
     */
    createFileVersion(version: Omit<FileVersion, 'id'>): void;
    /**
     * Get all versions for a file (ordered by version number, newest first)
     */
    getFileVersions(filePath: string, walletAddress: string): FileVersion[];
    /**
     * Get a specific version of a file
     */
    getFileVersion(filePath: string, walletAddress: string, versionNumber: number): FileVersion | null;
    /**
     * Get the next version number for a file
     */
    getNextVersionNumber(filePath: string, walletAddress: string): number;
    /**
     * Delete all versions for a file (when file is deleted)
     */
    deleteFileVersions(filePath: string, walletAddress: string): void;
    /**
     * Update file path for all versions (when file is renamed/moved)
     */
    updateFileVersionPaths(oldPath: string, newPath: string, walletAddress: string): void;
    /**
     * Get version count for a file
     */
    getVersionCount(filePath: string, walletAddress: string): number;
    /**
     * Execute a raw SQL query (for custom queries not covered by standard methods)
     * Use with caution - prefer using standard methods when possible
     * Returns all rows
     */
    query(sql: string, ...params: any[]): any[];
    /**
     * Execute a raw SQL query and return single row
     * Returns single row or undefined
     */
    queryOne(sql: string, ...params: any[]): any;
    /**
     * Get AI configuration for a wallet
     */
    getAIConfig(walletAddress: string): AIConfig | null;
    /**
     * Create or update AI configuration
     */
    setAIConfig(walletAddress: string, defaultProvider?: string, defaultModel?: string | null, apiKeys?: Record<string, string> | null, ollamaBaseUrl?: string): void;
    /**
     * Update API keys for a wallet (merge with existing)
     */
    updateAIAPIKeys(walletAddress: string, apiKeys: Record<string, string>): void;
    /**
     * Delete API key for a specific provider
     */
    deleteAIAPIKey(walletAddress: string, provider: string): void;
}
//# sourceMappingURL=database.d.ts.map