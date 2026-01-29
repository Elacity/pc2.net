/**
 * CryptoBox - NaCl CryptoBox Implementation for Active Proxy
 * 
 * Implements the encryption layer used by the Boson Active Proxy server.
 * Uses X25519 for key exchange and XSalsa20-Poly1305 for encryption.
 * 
 * Protocol compatibility:
 * - Server: Boson.Java boson-active-proxy-2.0.8-SNAPSHOT
 * - May require updates for Boson V2 (expected Feb 2026)
 * 
 * Key types:
 * - Ed25519: Used for node identity and signing challenges
 * - X25519: Used for CryptoBox encryption (derived from Ed25519)
 */

import nacl from 'tweetnacl';
// @ts-ignore - no types available
import ed25519ToX25519 from 'ed25519-to-x25519.wasm';
import { logger } from '../../utils/logger.js';

// Initialize the wasm module
let wasmReady = false;
let convertPublicKey: (ed25519PubKey: Uint8Array) => Uint8Array;
let convertPrivateKey: (ed25519PrivKey: Uint8Array) => Uint8Array;

// Initialize on module load
ed25519ToX25519.ready(() => {
  wasmReady = true;
  convertPublicKey = ed25519ToX25519.convert_public_key;
  convertPrivateKey = ed25519ToX25519.convert_private_key;
  logger.debug('[CryptoBox] ed25519-to-x25519 WASM module ready');
});

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
  /** Ed25519 public key size */
  ED25519_PUBLIC_KEY_SIZE: 32,
  /** Ed25519 secret key size (seed + public) */
  ED25519_SECRET_KEY_SIZE: 64,
  /** Ed25519 signature size */
  ED25519_SIGNATURE_SIZE: 64,
  /** XSalsa20 nonce size */
  NONCE_SIZE: 24,
  /** Poly1305 authentication tag size */
  AUTH_TAG_SIZE: 16,
  /** CryptoBox overhead (nonce + auth tag for box.open) */
  BOX_OVERHEAD: nacl.box.overheadLength, // 16 bytes
};

/**
 * Wait for the WASM module to be ready
 * Call this before using Ed25519 to X25519 conversion
 */
export async function ensureWasmReady(): Promise<void> {
  if (wasmReady) return;
  
  // Wait up to 5 seconds for WASM to initialize
  for (let i = 0; i < 50; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (wasmReady) return;
  }
  
  throw new Error('WASM module failed to initialize within timeout');
}

/**
 * Check if WASM module is ready
 */
export function isWasmReady(): boolean {
  return wasmReady;
}

/**
 * Convert Ed25519 public key to X25519 public key
 * Required for CryptoBox encryption with Ed25519 identity keys
 * 
 * @param ed25519PublicKey - 32-byte Ed25519 public key
 * @returns 32-byte X25519 public key
 */
export function ed25519PublicKeyToX25519(ed25519PublicKey: Uint8Array): Uint8Array {
  if (!wasmReady) {
    throw new Error('WASM module not ready - call ensureWasmReady() first');
  }
  
  if (ed25519PublicKey.length !== 32) {
    throw new Error(`Invalid Ed25519 public key length: ${ed25519PublicKey.length}, expected 32`);
  }
  
  return convertPublicKey(ed25519PublicKey);
}

/**
 * Convert Ed25519 private key to X25519 private key
 * Required for CryptoBox encryption with Ed25519 identity keys
 * 
 * @param ed25519PrivateKey - 64-byte Ed25519 private key (seed + public)
 * @returns 32-byte X25519 private key
 */
export function ed25519PrivateKeyToX25519(ed25519PrivateKey: Uint8Array): Uint8Array {
  if (!wasmReady) {
    throw new Error('WASM module not ready - call ensureWasmReady() first');
  }
  
  if (ed25519PrivateKey.length !== 64) {
    throw new Error(`Invalid Ed25519 private key length: ${ed25519PrivateKey.length}, expected 64`);
  }
  
  return convertPrivateKey(ed25519PrivateKey);
}

/**
 * Sign data with Ed25519 private key
 * Used for signing the server's challenge during handshake
 * 
 * @param message - Data to sign
 * @param privateKey - 64-byte Ed25519 private key
 * @returns 64-byte signature
 */
export function signEd25519(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  if (privateKey.length !== 64) {
    throw new Error(`Invalid Ed25519 private key length: ${privateKey.length}, expected 64`);
  }
  
  return nacl.sign.detached(message, privateKey);
}

/**
 * Verify Ed25519 signature
 * 
 * @param message - Original message
 * @param signature - 64-byte signature
 * @param publicKey - 32-byte Ed25519 public key
 * @returns true if valid, false otherwise
 */
export function verifyEd25519(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  if (signature.length !== 64) {
    return false;
  }
  if (publicKey.length !== 32) {
    return false;
  }
  
  return nacl.sign.detached.verify(message, signature, publicKey);
}

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
 * Derive a nonce from two X25519 public keys using XOR distance
 * 
 * This is how Boson CryptoContext computes the initial nonce:
 * nonce = XOR(sender_x25519_pubkey, receiver_x25519_pubkey), taking first 24 bytes
 * 
 * From Photon crypto_context.cc:
 *   auto receiver = Id(pk.blob());  // X25519 public key
 *   auto sender = Id(keypair.publicKey().blob());  // X25519 public key  
 *   auto dist = Id::distance(sender, receiver);  // XOR
 *   nonce = CryptoBox::Nonce({(uint8_t*)dist.data(), CryptoBox::Nonce::BYTES});
 * 
 * NOTE: This uses X25519 keys (NOT Ed25519). Convert Ed25519 to X25519 first!
 * 
 * @param senderX25519Pubkey - Sender's 32-byte X25519 public key
 * @param receiverX25519Pubkey - Receiver's 32-byte X25519 public key
 * @returns 24-byte nonce derived from XOR of the two X25519 keys
 */
export function deriveNonceFromX25519Keys(
  senderX25519Pubkey: Uint8Array,
  receiverX25519Pubkey: Uint8Array
): Uint8Array {
  if (senderX25519Pubkey.length !== 32) {
    throw new Error(`Invalid sender X25519 key length: ${senderX25519Pubkey.length}, expected 32`);
  }
  if (receiverX25519Pubkey.length !== 32) {
    throw new Error(`Invalid receiver X25519 key length: ${receiverX25519Pubkey.length}, expected 32`);
  }
  
  // XOR the two X25519 public keys
  const xorResult = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    xorResult[i] = senderX25519Pubkey[i] ^ receiverX25519Pubkey[i];
  }
  
  // Take first 24 bytes as nonce
  return xorResult.slice(0, CRYPTO_CONSTANTS.NONCE_SIZE);
}

/**
 * @deprecated Use deriveNonceFromX25519Keys instead (requires X25519 keys, not Ed25519)
 */
export function deriveNonceFromIds(
  senderId: Uint8Array,
  receiverId: Uint8Array
): Uint8Array {
  logger.warn('[CryptoBox] deriveNonceFromIds is deprecated - use deriveNonceFromX25519Keys with converted keys');
  return deriveNonceFromX25519Keys(senderId, receiverId);
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
  deriveNonceFromX25519Keys,
  deriveNonceFromIds,
  incrementNonce,
  encrypt,
  decrypt,
  encryptFull,
  decryptFull,
  parseServerHello,
  parseServerChallenge,
  buildClientHello,
  buildAuthPacket,
  buildAuthPayload,
  encryptPacket,
  decryptPacket,
  createSession,
  bufferToUint8Array,
  uint8ArrayToBuffer,
  ensureWasmReady,
  isWasmReady,
  ed25519PublicKeyToX25519,
  ed25519PrivateKeyToX25519,
  signEd25519,
  verifyEd25519,
  CRYPTO_CONSTANTS,
};
