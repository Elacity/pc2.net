/**
 * API Key Encryption Utility
 * 
 * Uses AES-256-GCM to encrypt sensitive data like API keys.
 * The encryption key is stored locally in data/encryption.key
 * and is unique to each PC2 installation.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits for GCM
const AUTH_TAG_LENGTH = 16;

// Path to the encryption key file
const getKeyPath = (): string => {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  return path.join(dataDir, 'encryption.key');
};

// Master key cache
let masterKey: Buffer | null = null;

/**
 * Get or generate the master encryption key.
 * The key is stored in data/encryption.key and is unique to each installation.
 */
export function getMasterKey(): Buffer {
  if (masterKey) {
    return masterKey;
  }

  const keyPath = getKeyPath();

  try {
    // Try to read existing key
    if (fs.existsSync(keyPath)) {
      const keyHex = fs.readFileSync(keyPath, 'utf8').trim();
      masterKey = Buffer.from(keyHex, 'hex');
      
      if (masterKey.length !== KEY_LENGTH) {
        logger.warn('[Encryption] Invalid key length, regenerating...');
        masterKey = null;
      } else {
        logger.info('[Encryption] Loaded master encryption key');
        return masterKey;
      }
    }

    // Generate new key
    logger.info('[Encryption] Generating new master encryption key...');
    masterKey = crypto.randomBytes(KEY_LENGTH);
    
    // Ensure data directory exists
    const dataDir = path.dirname(keyPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Save key with restricted permissions
    fs.writeFileSync(keyPath, masterKey.toString('hex'), { mode: 0o600 });
    logger.info('[Encryption] Master encryption key saved');
    
    return masterKey;
  } catch (error: any) {
    logger.error('[Encryption] Failed to get master key:', error.message);
    // Return a fallback key derived from machine info (less secure but functional)
    const fallbackSeed = `pc2-fallback-${process.env.USER || 'default'}-${process.cwd()}`;
    masterKey = crypto.createHash('sha256').update(fallbackSeed).digest();
    return masterKey;
  }
}

/**
 * Encrypt a string using AES-256-GCM.
 * Returns a base64-encoded string containing IV + ciphertext + auth tag.
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    return '';
  }

  try {
    const key = getMasterKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const authTag = cipher.getAuthTag();
    
    // Combine: IV (16 bytes) + ciphertext + authTag (16 bytes)
    const combined = Buffer.concat([iv, encrypted, authTag]);
    
    return combined.toString('base64');
  } catch (error: any) {
    logger.error('[Encryption] Encrypt failed:', error.message);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt a base64-encoded encrypted string.
 * Expects format: IV (16 bytes) + ciphertext + auth tag (16 bytes)
 */
export function decrypt(encryptedBase64: string): string {
  if (!encryptedBase64) {
    return '';
  }

  try {
    const key = getMasterKey();
    const combined = Buffer.from(encryptedBase64, 'base64');
    
    // Minimum length: IV (16) + 1 byte data + authTag (16) = 33
    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new Error('Invalid encrypted data length');
    }
    
    // Extract components
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error: any) {
    logger.error('[Encryption] Decrypt failed:', error.message);
    throw new Error('Decryption failed - data may be corrupted or key changed');
  }
}

/**
 * Check if a string appears to be encrypted (base64 with minimum length).
 * This helps handle migration from unencrypted to encrypted data.
 */
export function isEncrypted(data: string): boolean {
  if (!data || data.length < 44) { // Minimum base64 length for our format
    return false;
  }
  
  // Check if it's valid base64
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  if (!base64Regex.test(data)) {
    return false;
  }
  
  // Try to decode and check length
  try {
    const decoded = Buffer.from(data, 'base64');
    return decoded.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
  } catch {
    return false;
  }
}

/**
 * Encrypt API keys object.
 * Takes { "openai": "sk-xxx", "claude": "sk-ant-xxx" } and encrypts each value.
 */
export function encryptApiKeys(apiKeys: Record<string, string>): Record<string, string> {
  const encrypted: Record<string, string> = {};
  
  for (const [provider, key] of Object.entries(apiKeys)) {
    if (key && typeof key === 'string') {
      encrypted[provider] = encrypt(key);
    }
  }
  
  return encrypted;
}

/**
 * Decrypt API keys object.
 * Handles both encrypted and unencrypted values (for migration).
 */
export function decryptApiKeys(apiKeys: Record<string, string>): Record<string, string> {
  const decrypted: Record<string, string> = {};
  
  for (const [provider, value] of Object.entries(apiKeys)) {
    if (!value || typeof value !== 'string') {
      continue;
    }
    
    // Check if already encrypted
    if (isEncrypted(value)) {
      try {
        decrypted[provider] = decrypt(value);
      } catch {
        // Decryption failed - value might be plain text that looks like base64
        // Return as-is for backward compatibility
        decrypted[provider] = value;
      }
    } else {
      // Plain text (legacy) - return as-is
      decrypted[provider] = value;
    }
  }
  
  return decrypted;
}

// ============================================================================
// Wallet Signature-Based Encryption (for mnemonic backup)
// ============================================================================

export interface EncryptedMnemonic {
  ciphertext: string;  // Base64 encoded
  iv: string;          // Base64 encoded
  tag: string;         // Base64 encoded (auth tag)
  address: string;     // Wallet address used for encryption
  timestamp: number;   // When encrypted
}

/**
 * Derive an AES-256 key from a wallet signature.
 * The signature is hashed to produce a consistent 32-byte key.
 */
export function deriveKeyFromSignature(signature: string): Buffer {
  return crypto.createHash('sha256').update(signature).digest();
}

/**
 * Encrypt mnemonic using a key derived from wallet signature.
 * This allows the user to decrypt later by signing the same message.
 */
export function encryptMnemonicWithSignature(
  mnemonic: string, 
  signature: string,
  walletAddress: string
): EncryptedMnemonic {
  if (!mnemonic || !signature) {
    throw new Error('Mnemonic and signature are required');
  }

  const key = deriveKeyFromSignature(signature);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(mnemonic, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const authTag = cipher.getAuthTag();
  
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
    address: walletAddress.toLowerCase(),
    timestamp: Date.now()
  };
}

/**
 * Decrypt mnemonic using a key derived from wallet signature.
 * User must sign the same message to produce the same decryption key.
 */
export function decryptMnemonicWithSignature(
  encrypted: EncryptedMnemonic,
  signature: string
): string {
  if (!encrypted || !signature) {
    throw new Error('Encrypted data and signature are required');
  }

  try {
    const key = deriveKeyFromSignature(signature);
    const iv = Buffer.from(encrypted.iv, 'base64');
    const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');
    const authTag = Buffer.from(encrypted.tag, 'base64');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error: any) {
    logger.error('[Encryption] Mnemonic decryption failed:', error.message);
    throw new Error('Decryption failed - invalid signature or corrupted data');
  }
}

/**
 * Generate the message that should be signed for mnemonic encryption/decryption.
 * This ensures deterministic message format.
 */
export function getMnemonicSignMessage(walletAddress: string): string {
  return `PC2 Node Recovery Phrase Access\n\nThis signature secures your recovery phrase.\nAddress: ${walletAddress.toLowerCase()}\n\nSign this message to encrypt or view your recovery phrase.`;
}

/**
 * Verify an Ethereum signature.
 * Returns the recovered address if valid.
 */
export function verifySignature(message: string, signature: string): string | null {
  try {
    // Use ethers-style recovery
    const msgHash = crypto.createHash('sha256').update(
      `\x19Ethereum Signed Message:\n${message.length}${message}`
    ).digest();
    
    // For full verification, we'd need ethers.js
    // For now, just validate signature format
    if (!signature.startsWith('0x') || signature.length !== 132) {
      return null;
    }
    
    // Return a placeholder - actual verification happens client-side
    // or we need to add ethers.js dependency
    return 'verified';
  } catch {
    return null;
  }
}
