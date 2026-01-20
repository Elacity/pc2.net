-- PC2 Node Database Schema
-- SQLite database for persistent storage

-- Users table: Wallet-based user accounts
CREATE TABLE IF NOT EXISTS users (
  wallet_address TEXT PRIMARY KEY,
  smart_account_address TEXT,
  created_at INTEGER NOT NULL,
  last_login INTEGER
);

-- Sessions table: Active user sessions
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  smart_account_address TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
);

-- Files metadata table: File and directory metadata
CREATE TABLE IF NOT EXISTS files (
  path TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  ipfs_hash TEXT,
  size INTEGER DEFAULT 0,
  mime_type TEXT,
  thumbnail TEXT,
  is_dir INTEGER DEFAULT 0,
  is_public INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (path, wallet_address),
  FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
);

-- Settings table: Node configuration and settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Recent apps table: Track recently launched apps per user
CREATE TABLE IF NOT EXISTS recent_apps (
  wallet_address TEXT NOT NULL,
  app_name TEXT NOT NULL,
  launched_at INTEGER NOT NULL,
  PRIMARY KEY (wallet_address, app_name),
  FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
);

-- API Keys table: For programmatic/agent access
CREATE TABLE IF NOT EXISTS api_keys (
  key_id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  name TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT 'read',
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  last_used_at INTEGER,
  revoked INTEGER DEFAULT 0,
  FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_wallet ON sessions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_files_wallet ON files(wallet_address);
CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
CREATE INDEX IF NOT EXISTS idx_recent_apps_wallet ON recent_apps(wallet_address);
CREATE INDEX IF NOT EXISTS idx_api_keys_wallet ON api_keys(wallet_address);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
