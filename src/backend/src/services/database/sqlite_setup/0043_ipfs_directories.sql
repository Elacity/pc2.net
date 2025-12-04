-- IPFS Storage - Add directory support
-- Adds is_dir and parent_cid columns for full filesystem support

ALTER TABLE `ipfs_files` ADD COLUMN `is_dir` BOOLEAN DEFAULT 0;
ALTER TABLE `ipfs_files` ADD COLUMN `parent_cid` VARCHAR(255);

CREATE INDEX IF NOT EXISTS `idx_parent_cid` ON `ipfs_files` (`parent_cid`);
