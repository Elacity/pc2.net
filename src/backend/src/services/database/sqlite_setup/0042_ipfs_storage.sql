-- IPFS Storage Extension Schema
-- Stores IPFS node configuration and file CID mappings

-- User's IPFS node configuration
CREATE TABLE IF NOT EXISTS `user_ipfs_nodes` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id` INTEGER NOT NULL,
    `node_url` VARCHAR(255) NOT NULL DEFAULT 'http://localhost:5001',
    `api_key_encrypted` TEXT NULL,
    `is_active` BOOLEAN DEFAULT 1,
    `last_connected_at` INTEGER,
    `peer_id` VARCHAR(255),
    `created_at` INTEGER NOT NULL,
    `updated_at` INTEGER NOT NULL,
    
    FOREIGN KEY(`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_user_active_node` 
ON `user_ipfs_nodes` (`user_id`, `is_active`);

-- File CID mappings
CREATE TABLE IF NOT EXISTS `ipfs_files` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id` INTEGER NOT NULL,
    `file_path` VARCHAR(1024) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `cid` VARCHAR(255) NOT NULL,
    `file_size` BIGINT,
    `mime_type` VARCHAR(100),
    `is_encrypted` BOOLEAN DEFAULT 1,
    `is_pinned` BOOLEAN DEFAULT 1,
    `created_at` INTEGER NOT NULL,
    `updated_at` INTEGER NOT NULL,
    
    FOREIGN KEY(`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_user_path` 
ON `ipfs_files` (`user_id`, `file_path`);

CREATE INDEX IF NOT EXISTS `idx_user_cid` 
ON `ipfs_files` (`user_id`, `cid`);

CREATE INDEX IF NOT EXISTS `idx_pinned` 
ON `ipfs_files` (`user_id`, `is_pinned`);
