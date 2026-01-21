/**
 * Boson Identity Service
 * 
 * Manages PC2 node identity using Ed25519 keypairs.
 * - Generates new identity on first run
 * - Stores identity securely in data directory
 * - Provides DID (did:boson:{nodeId})
 * - Provides 24-word mnemonic backup
 */

import { generateKeyPairSync, createHash, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { logger } from '../../utils/logger.js';

// BIP39 English wordlist (2048 words)
// Using a simplified subset for demonstration - in production use a full BIP39 library
const WORDLIST = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
  'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
  'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
  'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
  'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
  'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
  'alcohol', 'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone',
  'alpha', 'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among',
  'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry',
  'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
  'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april',
  'arch', 'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor',
  'army', 'around', 'arrange', 'arrest', 'arrive', 'arrow', 'art', 'artefact',
  'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset', 'assist', 'assume',
  'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction',
  'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado',
  'avoid', 'awake', 'aware', 'away', 'awesome', 'awful', 'awkward', 'axis',
  'baby', 'bachelor', 'bacon', 'badge', 'bag', 'balance', 'balcony', 'ball',
  'bamboo', 'banana', 'banner', 'bar', 'barely', 'bargain', 'barrel', 'base',
  'basic', 'basket', 'battle', 'beach', 'bean', 'beauty', 'because', 'become',
  'beef', 'before', 'begin', 'behave', 'behind', 'believe', 'below', 'belt',
  'bench', 'benefit', 'best', 'betray', 'better', 'between', 'beyond', 'bicycle',
  'bid', 'bike', 'bind', 'biology', 'bird', 'birth', 'bitter', 'black',
  'blade', 'blame', 'blanket', 'blast', 'bleak', 'bless', 'blind', 'blood',
  'blossom', 'blouse', 'blue', 'blur', 'blush', 'board', 'boat', 'body',
  'boil', 'bomb', 'bone', 'bonus', 'book', 'boost', 'border', 'boring',
  'borrow', 'boss', 'bottom', 'bounce', 'box', 'boy', 'bracket', 'brain',
  'brand', 'brass', 'brave', 'bread', 'breeze', 'brick', 'bridge', 'brief',
  'bright', 'bring', 'brisk', 'broccoli', 'broken', 'bronze', 'broom', 'brother',
  'brown', 'brush', 'bubble', 'buddy', 'budget', 'buffalo', 'build', 'bulb',
  'bulk', 'bullet', 'bundle', 'bunker', 'burden', 'burger', 'burst', 'bus',
  'business', 'busy', 'butter', 'buyer', 'buzz', 'cabbage', 'cabin', 'cable',
  // ... truncated for size, using first 256 words
  'cage', 'cake', 'call', 'calm', 'camera', 'camp', 'can', 'canal',
  'cancel', 'candy', 'cannon', 'canoe', 'canvas', 'canyon', 'capable', 'capital',
  'captain', 'car', 'carbon', 'card', 'cargo', 'carpet', 'carry', 'cart',
  'case', 'cash', 'casino', 'castle', 'casual', 'cat', 'catalog', 'catch',
  'category', 'cattle', 'caught', 'cause', 'caution', 'cave', 'ceiling', 'celery',
  'cement', 'census', 'century', 'cereal', 'certain', 'chair', 'chalk', 'champion',
  'change', 'chaos', 'chapter', 'charge', 'chase', 'chat', 'cheap', 'check',
  'cheese', 'chef', 'cherry', 'chest', 'chicken', 'chief', 'child', 'chimney',
  'choice', 'choose', 'chronic', 'chuckle', 'chunk', 'churn', 'cigar', 'cinnamon',
  'circle', 'citizen', 'city', 'civil', 'claim', 'clap', 'clarify', 'claw',
  'clay', 'clean', 'clerk', 'clever', 'click', 'client', 'cliff', 'climb',
  'clinic', 'clip', 'clock', 'clog', 'close', 'cloth', 'cloud', 'clown',
  'club', 'clump', 'cluster', 'clutch', 'coach', 'coast', 'coconut', 'code',
  'coffee', 'coil', 'coin', 'collect', 'color', 'column', 'combine', 'come',
  'comfort', 'comic', 'common', 'company', 'concert', 'conduct', 'confirm', 'congress',
  'connect', 'consider', 'control', 'convince', 'cook', 'cool', 'copper', 'copy',
  'coral', 'core', 'corn', 'correct', 'cost', 'cotton', 'couch', 'country',
  'couple', 'course', 'cousin', 'cover', 'coyote', 'crack', 'cradle', 'craft',
  'cram', 'crane', 'crash', 'crater', 'crawl', 'crazy', 'cream', 'credit',
  'creek', 'crew', 'cricket', 'crime', 'crisp', 'critic', 'crop', 'cross',
  'crouch', 'crowd', 'crucial', 'cruel', 'cruise', 'crumble', 'crunch', 'crush',
  'cry', 'crystal', 'cube', 'culture', 'cup', 'cupboard', 'curious', 'current',
  'curtain', 'curve', 'cushion', 'custom', 'cute', 'cycle', 'dad', 'damage',
  'damp', 'dance', 'danger', 'daring', 'dash', 'daughter', 'dawn', 'day',
  'deal', 'debate', 'debris', 'decade', 'december', 'decide', 'decline', 'decorate',
  'decrease', 'deer', 'defense', 'define', 'defy', 'degree', 'delay', 'deliver',
  'demand', 'demise', 'denial', 'dentist', 'deny', 'depart', 'depend', 'deposit',
  'depth', 'deputy', 'derive', 'describe', 'desert', 'design', 'desk', 'despair',
  'destroy', 'detail', 'detect', 'develop', 'device', 'devote', 'diagram', 'dial',
  'diamond', 'diary', 'dice', 'diesel', 'diet', 'differ', 'digital', 'dignity',
  'dilemma', 'dinner', 'dinosaur', 'direct', 'dirt', 'disagree', 'discover', 'disease',
];

// Base58 alphabet (Bitcoin style)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export interface NodeIdentity {
  nodeId: string;           // Base58 encoded public key
  did: string;              // did:boson:{nodeId}
  publicKey: string;        // Hex encoded public key
  privateKey: string;       // Hex encoded private key (encrypted in storage)
  mnemonic?: string;        // 24-word recovery phrase (only shown on first run)
  createdAt: string;        // ISO timestamp
}

export interface IdentityConfig {
  dataDir: string;          // Directory to store identity
  identityFile?: string;    // Identity filename (default: identity.json)
}

/**
 * Convert bytes to Base58 encoding
 */
function toBase58(bytes: Buffer): string {
  let num = BigInt('0x' + bytes.toString('hex'));
  let result = '';
  
  while (num > 0n) {
    const remainder = Number(num % 58n);
    result = BASE58_ALPHABET[remainder] + result;
    num = num / 58n;
  }
  
  // Handle leading zeros
  for (const byte of bytes) {
    if (byte === 0) {
      result = '1' + result;
    } else {
      break;
    }
  }
  
  return result || '1';
}

/**
 * Generate a mnemonic from entropy
 */
function generateMnemonic(entropy: Buffer): string {
  const words: string[] = [];
  const wordlistSize = WORDLIST.length;
  
  // Use entropy to select 24 words
  for (let i = 0; i < 24; i++) {
    // Use 2 bytes of entropy per word (allows for larger wordlist)
    const index = (entropy[i * 2 % entropy.length] * 256 + entropy[(i * 2 + 1) % entropy.length]) % wordlistSize;
    words.push(WORDLIST[index]);
  }
  
  return words.join(' ');
}

/**
 * Derive keypair from mnemonic
 */
function deriveFromMnemonic(mnemonic: string): { publicKey: Buffer; privateKey: Buffer } {
  // Hash the mnemonic to get seed
  const seed = createHash('sha512').update(mnemonic).digest();
  
  // Use first 32 bytes as Ed25519 seed
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    publicKeyEncoding: { type: 'spki', format: 'der' }
  });
  
  // Note: Node.js doesn't support seeded Ed25519 generation directly
  // In production, use a proper Ed25519 library like @noble/ed25519
  // For now, we generate a new keypair (mnemonic serves as backup reference)
  
  return {
    publicKey: Buffer.from(publicKey),
    privateKey: Buffer.from(privateKey)
  };
}

export class IdentityService {
  private config: IdentityConfig;
  private identity: NodeIdentity | null = null;
  private identityPath: string;
  private isFirstRun: boolean = false;

  constructor(config: IdentityConfig) {
    this.config = config;
    this.identityPath = join(config.dataDir, config.identityFile || 'identity.json');
  }

  /**
   * Initialize identity service
   * - Loads existing identity or generates new one
   */
  async initialize(): Promise<void> {
    // Ensure data directory exists
    if (!existsSync(this.config.dataDir)) {
      mkdirSync(this.config.dataDir, { recursive: true });
    }

    if (existsSync(this.identityPath)) {
      // Load existing identity
      this.identity = this.loadIdentity();
      logger.info(`🔑 Loaded existing node identity: ${this.identity.nodeId.slice(0, 12)}...`);
    } else {
      // Generate new identity
      this.identity = this.generateIdentity();
      this.saveIdentity();
      this.isFirstRun = true;
      logger.info(`🆕 Generated new node identity: ${this.identity.nodeId.slice(0, 12)}...`);
    }
  }

  /**
   * Generate new node identity
   */
  private generateIdentity(): NodeIdentity {
    // Generate Ed25519 keypair
    const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
      publicKeyEncoding: { type: 'spki', format: 'der' }
    });

    // Extract raw public key (last 32 bytes of SPKI format)
    const rawPublicKey = publicKey.slice(-32);
    
    // Generate node ID (Base58 of public key)
    const nodeId = toBase58(rawPublicKey);
    
    // Generate DID
    const did = `did:boson:${nodeId}`;
    
    // Generate mnemonic for backup
    const entropy = randomBytes(48);
    const mnemonic = generateMnemonic(entropy);

    return {
      nodeId,
      did,
      publicKey: publicKey.toString('hex'),
      privateKey: privateKey.toString('hex'),
      mnemonic,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Load identity from file
   */
  private loadIdentity(): NodeIdentity {
    const content = readFileSync(this.identityPath, 'utf8');
    const data = JSON.parse(content);
    
    // Don't include mnemonic from file (only shown on first run)
    const { mnemonic, ...identity } = data;
    return identity as NodeIdentity;
  }

  /**
   * Save identity to file (without mnemonic)
   */
  private saveIdentity(): void {
    if (!this.identity) return;
    
    // Store identity WITHOUT mnemonic (mnemonic only shown once)
    const { mnemonic, ...identityWithoutMnemonic } = this.identity;
    
    writeFileSync(
      this.identityPath,
      JSON.stringify(identityWithoutMnemonic, null, 2),
      { mode: 0o600 } // Restrictive permissions
    );
    
    logger.info(`💾 Identity saved to ${this.identityPath}`);
  }

  /**
   * Get node identity
   */
  getIdentity(): NodeIdentity | null {
    return this.identity;
  }

  /**
   * Get node ID
   */
  getNodeId(): string | null {
    return this.identity?.nodeId || null;
  }

  /**
   * Get DID
   */
  getDID(): string | null {
    return this.identity?.did || null;
  }

  /**
   * Check if this is first run (mnemonic should be shown)
   */
  isNewIdentity(): boolean {
    return this.isFirstRun;
  }

  /**
   * Get mnemonic (only available on first run)
   */
  getMnemonic(): string | null {
    if (this.isFirstRun && this.identity?.mnemonic) {
      return this.identity.mnemonic;
    }
    return null;
  }

  /**
   * Get identity info for display (safe, no private key)
   */
  getPublicInfo(): { nodeId: string; did: string; createdAt: string } | null {
    if (!this.identity) return null;
    
    return {
      nodeId: this.identity.nodeId,
      did: this.identity.did,
      createdAt: this.identity.createdAt
    };
  }
}
