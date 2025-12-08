-- IPFS Storage - Add wallet address for decentralized identity
-- Enables per-user isolation based on wallet address (EOA) instead of internal user_id

-- Add wallet_address column to ipfs_files
ALTER TABLE ipfs_files ADD COLUMN `wallet_address` VARCHAR(42);

-- Add parent_cid for directory hierarchy if not exists (might already exist from 0043)
-- Using a safe approach that won't fail if column exists

-- Create index for wallet-based queries
CREATE INDEX IF NOT EXISTS `idx_ipfs_files_wallet` ON `ipfs_files` (`wallet_address`);
CREATE INDEX IF NOT EXISTS `idx_ipfs_files_wallet_path` ON `ipfs_files` (`wallet_address`, `file_path`);

