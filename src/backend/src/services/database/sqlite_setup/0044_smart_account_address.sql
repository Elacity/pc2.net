-- Add smart_account_address column for UniversalX Smart Account support
-- This enables users to authenticate with Particle Network's Universal Accounts (ERC-4337)
-- while maintaining compatibility with standard EOA wallet addresses

ALTER TABLE user ADD COLUMN smart_account_address VARCHAR(42) NULL;
CREATE INDEX idx_smart_account_address ON user(smart_account_address);
