/**
 * CryptoBox - NaCl CryptoBox Implementation for Active Proxy
 * 
 * Implements the encryption layer used by the Boson Active Proxy server.
 * Uses X25519 for key exchange and XSalsa20-Poly1305 for encryption.
 * 
 * Protocol compatibility:
 * - Server: Boson.Java boson-active-proxy-2.0.8-SNAPSHOT
 * - May require updates for Boson V2 (expected Feb 2026)
 */

import nacl from 'tweetnacl';
import { logger } from '../../utils/logger.js';

/**
 * Key pair for X25519 key exchange
 */
export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/**
 * Encrypted message with nonce
 */
export interface EncryptedMessage {
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}

/**
 * CryptoBox session state after handshake
 */
export interface CryptoSession {
  sharedKey: Uint8Array;
  serverPublicKey: Uint8Array;
  clientKeyPair: KeyPair;
  nonceCounter: bigint;
}

/**
 * NaCl constants
 */
export const CRYPTO_CONSTANTS = {
  /** X25519 public key size */
  PUBLIC_KEY_SIZE: 32,
  /** X25519 secret key size */
  SECRET_KEY_SIZE: 32,
  /** XSalsa20 nonce size */
  NONCE_SIZE: 24,
  /** Poly1305 authentication tag size */
  AUTH_TAG_SIZE: 16,
  /** CryptoBox overhead (nonce + auth tag for box.open) */
  BOX_OVERHEAD: nacl.box.overheadLength, // 16 bytes
};

/**
 * Generate a new X25519 key pair for the handshake
 */
export function generateKeyPair(): KeyPair {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
  };
}

/**
 * Compute the shared secret using X25519 Diffie-Hellman
 * 
 * @param ourSecretKey - Our X25519 secret key
 * @param theirPublicKey - Their X25519 public key
 * @returns Shared secret (32 bytes)
 */
export function computeSharedSecret(
  ourSecretKey: Uint8Array,
  theirPublicKey: Uint8Array
): Uint8Array {
  // nacl.box.before computes the shared key for subsequent box/open operations
  return nacl.box.before(theirPublicKey, ourSecretKey);
}

/**
 * Generate a random nonce for encryption
 */
export function generateNonce(): Uint8Array {
  return nacl.randomBytes(CRYPTO_CONSTANTS.NONCE_SIZE);
}

/**
 * Increment a nonce for the next message (counter mode)
 * 
 * @param nonce - Current nonce (24 bytes)
 * @returns Incremented nonce
 */
export function incrementNonce(nonce: Uint8Array): Uint8Array {
  const result = new Uint8Array(nonce);
  
  // Increment as little-endian 192-bit integer
  for (let i = 0; i < result.length; i++) {
    result[i]++;
    if (result[i] !== 0) break; // No overflow, we're done
  }
  
  return result;
}

/**
 * Encrypt a message using CryptoBox with a precomputed shared key
 * 
 * @param message - Plaintext message
 * @param nonce - 24-byte nonce
 * @param sharedKey - Precomputed shared key from computeSharedSecret
 * @returns Encrypted ciphertext (includes auth tag)
 */
export function encrypt(
  message: Uint8Array,
  nonce: Uint8Array,
  sharedKey: Uint8Array
): Uint8Array {
  return nacl.box.after(message, nonce, sharedKey);
}

/**
 * Decrypt a message using CryptoBox with a precomputed shared key
 * 
 * @param ciphertext - Encrypted message (includes auth tag)
 * @param nonce - 24-byte nonce used for encryption
 * @param sharedKey - Precomputed shared key from computeSharedSecret
 * @returns Decrypted plaintext, or null if authentication fails
 */
export function decrypt(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  sharedKey: Uint8Array
): Uint8Array | null {
  return nacl.box.open.after(ciphertext, nonce, sharedKey);
}

/**
 * Encrypt a message using the full CryptoBox (includes key computation)
 * Use when you don't have a precomputed shared key
 * 
 * @param message - Plaintext message
 * @param nonce - 24-byte nonce
 * @param theirPublicKey - Recipient's public key
 * @param ourSecretKey - Our secret key
 * @returns Encrypted ciphertext
 */
export function encryptFull(
  message: Uint8Array,
  nonce: Uint8Array,
  theirPublicKey: Uint8Array,
  ourSecretKey: Uint8Array
): Uint8Array {
  return nacl.box(message, nonce, theirPublicKey, ourSecretKey);
}

/**
 * Decrypt a message using the full CryptoBox (includes key computation)
 * 
 * @param ciphertext - Encrypted message
 * @param nonce - 24-byte nonce
 * @param theirPublicKey - Sender's public key
 * @param ourSecretKey - Our secret key
 * @returns Decrypted plaintext, or null if authentication fails
 */
export function decryptFull(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  theirPublicKey: Uint8Array,
  ourSecretKey: Uint8Array
): Uint8Array | null {
  return nacl.box.open(ciphertext, nonce, theirPublicKey, ourSecretKey);
}

/**
 * Parse the Server Challenge message from Active Proxy
 * 
 * Server sends: [2-byte length][random challenge bytes]
 * The challenge is NOT encrypted - it's raw bytes that the client must sign.
 * 
 * @param data - Raw data from server
 * @returns Parsed challenge or null if invalid
 */
export function parseServerChallenge(data: Buffer): {
  challenge: Uint8Array;
  bytesConsumed: number;
} | null {
  // Minimum size: 2 (length) + some challenge bytes
  const MIN_SIZE = 2 + 32;
  
  if (data.length < MIN_SIZE) {
    logger.debug(`[CryptoBox] Challenge too short: ${data.length} bytes, need at least ${MIN_SIZE}`);
    return null;
  }
  
  // Read 2-byte length (big-endian) - includes itself
  const messageLength = data.readUInt16BE(0);
  
  // Validate length makes sense (challenge is 32-256 bytes per Java code)
  if (messageLength < 34 || messageLength > 258) {
    logger.debug(`[CryptoBox] Invalid challenge length: ${messageLength}`);
    return null;
  }
  
  // Validate we have complete message
  if (data.length < messageLength) {
    logger.debug(`[CryptoBox] Challenge incomplete: have ${data.length}, need ${messageLength}`);
    return null;
  }
  
  // Extract challenge (after 2-byte length)
  const challenge = new Uint8Array(data.slice(2, messageLength));
  
  logger.debug(`[CryptoBox] Parsed challenge: ${challenge.length} bytes`);
  
  return {
    challenge,
    bytesConsumed: messageLength,
  };
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use parseServerChallenge instead
 */
export function parseServerHello(data: Buffer): {
  serverPublicKey: Uint8Array;
  nonce: Uint8Array;
  encryptedPayload: Uint8Array;
} | null {
  // The old implementation was incorrect - server sends challenge, not encrypted hello
  // This is kept for compatibility but returns fake data structure
  const challenge = parseServerChallenge(data);
  if (!challenge) return null;
  
  // Return dummy structure - caller should use parseServerChallenge
  return {
    serverPublicKey: challenge.challenge.slice(0, 32),
    nonce: new Uint8Array(24),
    encryptedPayload: challenge.challenge.slice(32),
  };
}

/**
 * Build AUTH packet for Active Proxy
 * 
 * Format: [2-byte length][1-byte type=0x00][32-byte nodeId][encrypted payload]
 * Encrypted payload contains: [32-byte clientPubkey][24-byte nonce][64-byte signature][1-byte domainLen][domain]
 * 
 * The encryption is done with the server's permanent public key (from DHT).
 * 
 * @param nodeId - Client's 32-byte node ID (Ed25519 public key)
 * @param encryptedPayload - Already encrypted auth payload
 * @returns Complete AUTH packet
 */
export function buildAuthPacket(
  nodeId: Uint8Array,
  encryptedPayload: Uint8Array
): Buffer {
  // Format: [2-byte len][1-byte type][32-byte nodeId][encrypted]
  const packetLength = 2 + 1 + 32 + encryptedPayload.length;
  
  const packet = Buffer.alloc(packetLength);
  
  // Write length (includes itself)
  packet.writeUInt16BE(packetLength, 0);
  
  // Write type (AUTH = 0x00)
  packet.writeUInt8(0x00, 2);
  
  // Write node ID
  Buffer.from(nodeId).copy(packet, 3);
  
  // Write encrypted payload
  Buffer.from(encryptedPayload).copy(packet, 3 + 32);
  
  return packet;
}

/**
 * Build the plaintext AUTH payload (before encryption)
 * 
 * Payload: [32-byte clientPubkey][24-byte nonce][64-byte signature][1-byte domainLen][domain]
 * 
 * @param clientCryptoPubkey - Client's X25519 public key for session encryption
 * @param nonce - 24-byte nonce for session
 * @param challengeSignature - Ed25519 signature of the server's challenge
 * @param domain - Optional domain name to register
 * @returns Plaintext payload to be encrypted
 */
export function buildAuthPayload(
  clientCryptoPubkey: Uint8Array,
  nonce: Uint8Array,
  challengeSignature: Uint8Array,
  domain?: string
): Buffer {
  const domainBytes = domain ? Buffer.from(domain, 'utf8') : Buffer.alloc(0);
  const domainLen = Math.min(domainBytes.length, 255);
  
  // Payload: [32][24][64][1][domain]
  const payloadLength = 32 + 24 + 64 + 1 + domainLen;
  const payload = Buffer.alloc(payloadLength);
  
  let pos = 0;
  
  // Client crypto public key (X25519)
  Buffer.from(clientCryptoPubkey).copy(payload, pos);
  pos += 32;
  
  // Nonce
  Buffer.from(nonce).copy(payload, pos);
  pos += 24;
  
  // Signature
  Buffer.from(challengeSignature).copy(payload, pos);
  pos += 64;
  
  // Domain length
  payload.writeUInt8(domainLen, pos);
  pos += 1;
  
  // Domain
  if (domainLen > 0) {
    domainBytes.copy(payload, pos, 0, domainLen);
  }
  
  return payload;
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use buildAuthPacket instead
 */
export function buildClientHello(
  clientPublicKey: Uint8Array,
  nonce: Uint8Array,
  encryptedAuth: Uint8Array
): Buffer {
  // This old format is incorrect - use buildAuthPacket
  const payloadLength = 32 + 24 + encryptedAuth.length;
  const message = Buffer.alloc(2 + payloadLength);
  message.writeUInt16BE(2 + payloadLength, 0);
  Buffer.from(clientPublicKey).copy(message, 2);
  Buffer.from(nonce).copy(message, 2 + 32);
  Buffer.from(encryptedAuth).copy(message, 2 + 32 + 24);
  return message;
}

/**
 * Encrypt a packet for transmission (after handshake)
 * 
 * Format: [2-byte length][24-byte nonce][encrypted data]
 * 
 * @param data - Plaintext data to encrypt
 * @param session - Active crypto session
 * @returns Encrypted packet ready for transmission
 */
export function encryptPacket(
  data: Buffer,
  session: CryptoSession
): { packet: Buffer; newNonce: Uint8Array } {
  // Generate nonce based on counter
  const nonce = generateNonce();
  
  // Encrypt
  const encrypted = encrypt(new Uint8Array(data), nonce, session.sharedKey);
  
  // Build packet: [2-byte length][24-byte nonce][encrypted data]
  const packetLength = 24 + encrypted.length;
  const packet = Buffer.alloc(2 + packetLength);
  
  packet.writeUInt16BE(2 + packetLength, 0); // Length includes itself
  Buffer.from(nonce).copy(packet, 2);
  Buffer.from(encrypted).copy(packet, 2 + 24);
  
  return { packet, newNonce: nonce };
}

/**
 * Decrypt a received packet (after handshake)
 * 
 * @param data - Raw packet data (including length prefix)
 * @param session - Active crypto session
 * @returns Decrypted plaintext or null if decryption fails
 */
export function decryptPacket(
  data: Buffer,
  session: CryptoSession
): Buffer | null {
  // Minimum: 2 (length) + 24 (nonce) + 16 (min ciphertext with auth tag)
  if (data.length < 42) {
    logger.warn(`[CryptoBox] Packet too short for decryption: ${data.length} bytes`);
    return null;
  }
  
  // Read length
  const messageLength = data.readUInt16BE(0);
  
  if (data.length < messageLength) {
    logger.debug(`[CryptoBox] Incomplete packet: have ${data.length}, need ${messageLength}`);
    return null;
  }
  
  // Extract nonce and ciphertext
  const nonce = new Uint8Array(data.slice(2, 26));
  const ciphertext = new Uint8Array(data.slice(26, messageLength));
  
  // Decrypt
  const plaintext = decrypt(ciphertext, nonce, session.sharedKey);
  
  if (!plaintext) {
    logger.warn('[CryptoBox] Decryption failed - authentication error');
    return null;
  }
  
  return Buffer.from(plaintext);
}

/**
 * Create a new crypto session after successful handshake
 */
export function createSession(
  clientKeyPair: KeyPair,
  serverPublicKey: Uint8Array
): CryptoSession {
  const sharedKey = computeSharedSecret(clientKeyPair.secretKey, serverPublicKey);
  
  return {
    sharedKey,
    serverPublicKey,
    clientKeyPair,
    nonceCounter: BigInt(0),
  };
}

/**
 * Utility: Convert Buffer to Uint8Array
 */
export function bufferToUint8Array(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/**
 * Utility: Convert Uint8Array to Buffer
 */
export function uint8ArrayToBuffer(array: Uint8Array): Buffer {
  return Buffer.from(array);
}

export default {
  generateKeyPair,
  computeSharedSecret,
  generateNonce,
  incrementNonce,
  encrypt,
  decrypt,
  encryptFull,
  decryptFull,
  parseServerHello,
  buildClientHello,
  encryptPacket,
  decryptPacket,
  createSession,
  bufferToUint8Array,
  uint8ArrayToBuffer,
  CRYPTO_CONSTANTS,
};
