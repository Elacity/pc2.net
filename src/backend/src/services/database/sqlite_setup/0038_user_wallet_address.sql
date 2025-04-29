-- Add wallet_address column to user table for Particle Network integration
ALTER TABLE user ADD COLUMN wallet_address VARCHAR(42) NULL;
CREATE INDEX idx_wallet_address ON user(wallet_address);
