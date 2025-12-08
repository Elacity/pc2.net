-- PC2 Personal Cloud Node Database Schema
-- Secure wallet-based authentication and tethering

-- PC2 Node Configuration
-- Stores the node's identity and ownership status
CREATE TABLE IF NOT EXISTS `pc2_config` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `node_name` VARCHAR(255) NOT NULL DEFAULT 'My PC2',
    `node_description` TEXT,
    
    -- Security: Setup token (hashed, one-time use)
    `setup_token_hash` VARCHAR(64),
    `setup_token_used` BOOLEAN DEFAULT 0,
    `setup_token_attempts` INTEGER DEFAULT 0,
    `setup_token_lockout_until` INTEGER,
    
    -- Owner information
    `owner_wallet_address` VARCHAR(42),
    `node_status` VARCHAR(20) DEFAULT 'AWAITING_OWNER',  -- AWAITING_OWNER | OWNED | LOCKED
    
    -- Configuration
    `ipfs_node_url` VARCHAR(255) DEFAULT 'http://localhost:5001',
    `public_url` VARCHAR(255),
    `allow_discovery` BOOLEAN DEFAULT 0,
    `max_tethered_wallets` INTEGER DEFAULT 10,
    
    -- Timestamps
    `created_at` INTEGER NOT NULL,
    `updated_at` INTEGER NOT NULL
);

-- Tethered Wallets (Access Whitelist)
-- Only wallets in this table can connect to this PC2 node
CREATE TABLE IF NOT EXISTS `pc2_tethered_wallets` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `wallet_address` VARCHAR(42) NOT NULL,
    `wallet_address_lower` VARCHAR(42) NOT NULL,  -- Lowercase for comparison
    
    -- Identity
    `label` VARCHAR(255),
    `is_owner` BOOLEAN DEFAULT 0,
    `invited_by` VARCHAR(42),
    
    -- Permissions (JSON array)
    -- ["full"] | ["read"] | ["read", "write"] | ["read", "write", "admin"]
    `permissions` TEXT DEFAULT '["full"]',
    
    -- Status
    `is_active` BOOLEAN DEFAULT 1,
    `revoked_at` INTEGER,
    `revoked_by` VARCHAR(42),
    
    -- Timestamps
    `created_at` INTEGER NOT NULL,
    `last_connected_at` INTEGER,
    
    UNIQUE(`wallet_address_lower`)
);

-- Active Sessions
-- Tracks currently connected wallets
CREATE TABLE IF NOT EXISTS `pc2_sessions` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `wallet_address` VARCHAR(42) NOT NULL,
    `session_token` VARCHAR(255) NOT NULL,
    
    -- Connection info
    `ip_address` VARCHAR(45),
    `user_agent` TEXT,
    `connection_type` VARCHAR(20) DEFAULT 'websocket',  -- websocket | http
    
    -- Timestamps
    `created_at` INTEGER NOT NULL,
    `expires_at` INTEGER NOT NULL,
    `last_activity_at` INTEGER NOT NULL,
    
    UNIQUE(`session_token`)
);

-- Audit Log
-- Records all significant events for security monitoring
CREATE TABLE IF NOT EXISTS `pc2_audit_log` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `wallet_address` VARCHAR(42),
    
    -- Event details
    `action` VARCHAR(50) NOT NULL,
    `action_category` VARCHAR(20) NOT NULL,  -- auth | file | admin | security
    `success` BOOLEAN DEFAULT 1,
    `details` TEXT,  -- JSON details
    
    -- Context
    `ip_address` VARCHAR(45),
    `user_agent` TEXT,
    `session_token` VARCHAR(255),
    
    -- Timestamp
    `created_at` INTEGER NOT NULL
);

-- Failed Authentication Attempts
-- For rate limiting and security monitoring
CREATE TABLE IF NOT EXISTS `pc2_failed_auth` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `ip_address` VARCHAR(45) NOT NULL,
    `wallet_address` VARCHAR(42),
    `attempt_type` VARCHAR(20) NOT NULL,  -- setup_token | wallet_connect | session
    `reason` VARCHAR(100),
    `created_at` INTEGER NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS `idx_tethered_wallet` ON `pc2_tethered_wallets` (`wallet_address_lower`);
CREATE INDEX IF NOT EXISTS `idx_tethered_active` ON `pc2_tethered_wallets` (`is_active`, `wallet_address_lower`);
CREATE INDEX IF NOT EXISTS `idx_session_token` ON `pc2_sessions` (`session_token`);
CREATE INDEX IF NOT EXISTS `idx_session_wallet` ON `pc2_sessions` (`wallet_address`);
CREATE INDEX IF NOT EXISTS `idx_session_expiry` ON `pc2_sessions` (`expires_at`);
CREATE INDEX IF NOT EXISTS `idx_audit_wallet` ON `pc2_audit_log` (`wallet_address`, `created_at`);
CREATE INDEX IF NOT EXISTS `idx_audit_action` ON `pc2_audit_log` (`action`, `created_at`);
CREATE INDEX IF NOT EXISTS `idx_failed_auth_ip` ON `pc2_failed_auth` (`ip_address`, `created_at`);


