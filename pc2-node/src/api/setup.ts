/**
 * Setup API Routes
 *
 * First-run setup wizard endpoints for PC2 node configuration.
 * Handles username selection, identity generation, and initial setup.
 * Includes pre-auth restore endpoint for backup restoration during setup.
 */

import { Router, Request, Response } from 'express';
import { existsSync, writeFileSync, readFileSync, mkdirSync, rmSync, renameSync, chmodSync, statSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { createHmac, createDecipheriv } from 'crypto';
import bcrypt from 'bcrypt';
import multer from 'multer';
import os from 'os';
import { extract as extractTar } from 'tar';
import nacl from 'tweetnacl';
import { logger } from '../utils/logger.js';
import { toBase58, deriveFromMnemonic } from '../services/boson/IdentityService.js';
import { requireSetupAuth } from './setup/setup-auth.js';
import { setupCompleteBlockReason } from './setup/setup-guard.js';

const router = Router();

// Data directory from environment or default
const DATA_DIR = process.env.PC2_DATA_DIR || './data';
const SETUP_COMPLETE_FILE = join(DATA_DIR, 'setup-complete');
const NODE_CONFIG_FILE = join(DATA_DIR, 'node-config.json');
const RESTORE_STAGING_DIR = join(DATA_DIR, '.restore-staging');

// Project root for restore operations
const PROJECT_ROOT = resolve(dirname(DATA_DIR));

// Rate limiting for restore endpoint (simple in-memory tracker)
const restoreAttempts = new Map<string, { count: number; resetAt: number }>();
const RESTORE_RATE_LIMIT = 5;
const RESTORE_RATE_WINDOW_MS = 15 * 60 * 1000;

function checkRestoreRateLimit (ip: string): boolean {
    const now = Date.now();
    const entry = restoreAttempts.get(ip);
    if ( !entry || now > entry.resetAt ) {
        restoreAttempts.set(ip, { count: 1, resetAt: now + RESTORE_RATE_WINDOW_MS });
        return true;
    }
    if ( entry.count >= RESTORE_RATE_LIMIT ) return false;
    entry.count += 1;
    return true;
}

// Disk-based upload for restore (avoids OOM with large backups)
const restoreUploadDir = join(os.tmpdir(), 'pc2-restore-uploads');
if ( ! existsSync(restoreUploadDir) ) mkdirSync(restoreUploadDir, { recursive: true });

// SEC-A19 (2026-04 Wave 5.5): the multer disk filename MUST NOT include
// `file.originalname` directly. With the previous `${unique}-${originalname}`
// pattern, an originalname like `../../../etc/cron.d/evil` resolves to a path
// outside the upload directory because `path.join` collapses `..` segments.
// We use a synthetic `${unique}.tar.gz` for disk and tighten the fileFilter
// from `endsWith('.tar.gz')` to a strict whitelist regex so a path-traversal
// originalname is rejected before any disk write happens.
const VALID_RESTORE_BACKUP_NAME = /^[A-Za-z0-9_.-]+\.tar\.gz$/;
const restoreUpload = multer({
    storage: multer.diskStorage({
        destination: restoreUploadDir,
        filename: (_req, _file, cb) => {
            const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            cb(null, `${unique}.tar.gz`);
        },
    }),
    limits: { fileSize: 10 * 1024 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const baseName = (file.originalname || '').split(/[\\/]/).pop() || '';
        if ( VALID_RESTORE_BACKUP_NAME.test(baseName) ) {
            cb(null, true);
        } else {
            cb(new Error('Invalid backup filename. Use only letters, numbers, dot, underscore, hyphen; must end in .tar.gz.'));
        }
    },
});

// DER prefixes for reconstructing identity from mnemonic
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

// Allowed wallet entry
interface AllowedWalletEntry {
    wallet: string;
    role: 'admin' | 'member';
    addressType?: 'evm' | 'solana' | 'unknown'; // Type of wallet address
    addedAt: string;
    updatedAt?: string;
}

// Tethered DID entry
interface TetheredDIDEntry {
    did: string;
    tetheredAt: string;
    wallets?: {
        elaMainchain?: string;
        btc?: string;
        tron?: string;
    };
}

// Node config interface
interface NodeConfig {
    antiSnipePasswordHash?: string;
    ownerWallet?: string | null;
    createdAt?: string;
    allowedWallets?: AllowedWalletEntry[];
    // Tethered DIDs keyed by wallet address (lowercase)
    tetheredDIDs?: Record<string, TetheredDIDEntry>;
    // Public URL for callbacks (optional)
    publicUrl?: string;
    // Node DID for signing (optional, future use)
    nodeDID?: string;
}

// Helper to read node config
function getNodeConfig (): NodeConfig {
    try {
        if ( existsSync(NODE_CONFIG_FILE) ) {
            return JSON.parse(readFileSync(NODE_CONFIG_FILE, 'utf-8'));
        }
    } catch (e) {
        logger.error('[Setup] Failed to read node config:', e);
    }
    return {};
}

// Helper to save node config
function saveNodeConfig (config: NodeConfig): void {
    const configDir = dirname(NODE_CONFIG_FILE);
    if ( ! existsSync(configDir) ) {
        mkdirSync(configDir, { recursive: true });
    }
    writeFileSync(NODE_CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Export for use by other modules
export { getNodeConfig, saveNodeConfig, NODE_CONFIG_FILE };

/**
 * Check if setup is needed
 * GET /api/setup/status
 */
router.get('/status', (req: Request, res: Response) => {
    try {
        const bosonService = req.app.locals.bosonService;

        const setupComplete = existsSync(SETUP_COMPLETE_FILE);
        const hasUsername = bosonService?.getUsernameService()?.hasUsername() || false;
        const hasIdentity = bosonService?.getIdentityService()?.getNodeId() !== null;
        const hasMnemonic = bosonService?.getFirstRunMnemonic() !== null;
        const hasMnemonicBackup = bosonService?.hasMnemonicBackup() || false;

        const hasPendingRestore = existsSync(RESTORE_STAGING_DIR);
        const hasEncryptedIdentity = existsSync(join(DATA_DIR, 'identity.enc'));

        // Extended flow: welcome -> username -> complete
        // Always show welcome first on fresh installs so restore option is visible
        let step: 'welcome' | 'restore-mnemonic' | 'username' | 'complete' = 'complete';

        if ( ! setupComplete ) {
            if ( hasEncryptedIdentity && !hasIdentity ) {
                step = 'restore-mnemonic';
            } else if ( ! hasUsername ) {
                step = 'welcome';
            } else {
                step = 'complete';
            }
        }

        res.json({
            needsSetup: !setupComplete && !hasUsername,
            setupComplete,
            hasUsername,
            hasIdentity,
            hasMnemonic,
            hasMnemonicBackup,
            hasPendingRestore,
            hasEncryptedIdentity,
            step,
        });
    } catch ( error ) {
        logger.error('[Setup] Status check error:', error);
        res.status(500).json({ error: 'Failed to check setup status' });
    }
});

/**
 * Validate username format
 * POST /api/setup/validate-username
 */
router.post('/validate-username', (req: Request, res: Response) => {
    try {
        const { username } = req.body;

        if ( !username || typeof username !== 'string' ) {
            return res.json({ valid: false, error: 'Username is required' });
        }

        const bosonService = req.app.locals.bosonService;
        const usernameService = bosonService?.getUsernameService();

        if ( ! usernameService ) {
            return res.status(503).json({ error: 'Username service not available' });
        }

        const validation = usernameService.validateUsername(username);
        res.json(validation);
    } catch ( error ) {
        logger.error('[Setup] Validate username error:', error);
        res.status(500).json({ error: 'Failed to validate username' });
    }
});

/**
 * Check username availability
 * POST /api/setup/check-username
 */
router.post('/check-username', async (req: Request, res: Response) => {
    try {
        const { username } = req.body;

        if ( !username || typeof username !== 'string' ) {
            return res.json({ available: false, error: 'Username is required' });
        }

        const bosonService = req.app.locals.bosonService;
        const usernameService = bosonService?.getUsernameService();

        if ( ! usernameService ) {
            return res.status(503).json({ error: 'Username service not available' });
        }

        // First validate format
        const validation = usernameService.validateUsername(username);
        if ( ! validation.valid ) {
            return res.json({ available: false, error: validation.error });
        }

        // Then check availability
        const available = await usernameService.isAvailable(username);

        res.json({
            available,
            username: username.toLowerCase(),
            publicUrl: available ? usernameService.getPublicUrl() : null,
        });
    } catch ( error ) {
        logger.error('[Setup] Check username error:', error);
        res.status(500).json({ error: 'Failed to check username availability' });
    }
});

/**
 * Register username and complete setup
 * POST /api/setup/complete
 *
 * Accepts username and anti-snipe password.
 * Password is hashed and stored; will be deleted after first wallet login.
 */
router.post('/complete', async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

        if ( !username || typeof username !== 'string' ) {
            return res.status(400).json({ success: false, error: 'Username is required' });
        }

        if ( !password || typeof password !== 'string' || password.length < 6 ) {
            return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
        }

        const bosonService = req.app.locals.bosonService;

        const blockReason = setupCompleteBlockReason({
            setupMarkerExists: existsSync(SETUP_COMPLETE_FILE),
            ownerWallet: getNodeConfig().ownerWallet,
            storedUsername: bosonService?.getUsernameService?.()?.getUsername?.() ?? null,
            requestedUsername: username,
        });
        if ( blockReason ) {
            logger.warn(`[Setup] Refused /complete: ${blockReason}`);
            return res.status(409).json({ success: false, error: blockReason });
        }

        if ( ! bosonService ) {
            return res.status(503).json({ success: false, error: 'Boson service not available' });
        }

        // Register the username
        const result = await bosonService.registerUsername(username);

        if ( ! result.success ) {
            return res.status(400).json({ success: false, error: result.error });
        }

        // Get node info
        const nodeId = bosonService.getNodeId();
        const did = bosonService.getDID();
        const publicUrl = result.publicUrl;

        // Hash the anti-snipe password
        const passwordHash = await bcrypt.hash(password, 12);

        // An owner may have claimed while the gateway call and bcrypt ran.
        if ( getNodeConfig().ownerWallet || existsSync(SETUP_COMPLETE_FILE) ) {
            logger.warn('[Setup] Refused /complete: node was claimed during setup');
            return res.status(409).json({ success: false, error: 'This node already has an owner.' });
        }

        // Save node config with password hash (owner not yet set)
        // Include publicUrl so DID tethering can use it for callbacks
        saveNodeConfig({
            antiSnipePasswordHash: passwordHash,
            ownerWallet: null,
            createdAt: new Date().toISOString(),
            publicUrl: publicUrl || null,
        });

        logger.info('[Setup] Anti-snipe password set for node');

        // Ensure data directory exists
        const setupDir = dirname(SETUP_COMPLETE_FILE);
        if ( ! existsSync(setupDir) ) {
            mkdirSync(setupDir, { recursive: true });
        }

        // Mark setup as complete
        writeFileSync(SETUP_COMPLETE_FILE, JSON.stringify({
            completedAt: new Date().toISOString(),
            username,
            nodeId,
        }));

        // NOTE: Do NOT clear mnemonic here - it will be encrypted on first login

        logger.info(`[Setup] Setup completed for username: ${username}`);

        res.json({
            success: true,
            nodeId,
            did,
            publicUrl,
            setupComplete: true,
        });
    } catch ( error ) {
        logger.error('[Setup] Complete error:', error);
        res.status(500).json({ success: false, error: 'Failed to complete setup' });
    }
});

/**
 * Get the message to sign for mnemonic encryption
 * POST /api/setup/mnemonic-sign-message
 *
 * SEC-7 (2026-04 audit): gated by requireSetupAuth so a remote attacker
 * cannot harvest the wallet→mnemonic-encryption challenge string and
 * race the operator to claim mnemonic encryption with their own wallet.
 */
router.post('/mnemonic-sign-message', requireSetupAuth, (req: Request, res: Response) => {
    try {
        const { walletAddress } = req.body;

        if ( !walletAddress || typeof walletAddress !== 'string' ) {
            return res.status(400).json({ error: 'Wallet address is required' });
        }

        const bosonService = req.app.locals.bosonService;

        if ( ! bosonService ) {
            return res.status(503).json({ error: 'Boson service not available' });
        }

        const message = bosonService.getMnemonicSignMessage(walletAddress);

        res.json({ message });
    } catch ( error ) {
        logger.error('[Setup] Get sign message error:', error);
        res.status(500).json({ error: 'Failed to get sign message' });
    }
});

/**
 * Acknowledge mnemonic backup and encrypt it with wallet signature
 * POST /api/setup/acknowledge-mnemonic
 *
 * If signature is provided, the mnemonic will be encrypted and stored.
 * This allows the user to view it later by signing the same message.
 *
 * SEC-7 (2026-04 audit): gated by requireSetupAuth — without this gate,
 * an unauthenticated remote attacker can submit their own wallet's
 * signature here BEFORE the legitimate operator does, encrypting the
 * mnemonic against the attacker's wallet and silently hijacking
 * future identity recovery.
 */
router.post('/acknowledge-mnemonic', requireSetupAuth, (req: Request, res: Response) => {
    try {
        const { signature, walletAddress, skipEncryption } = req.body;

        const bosonService = req.app.locals.bosonService;

        if ( ! bosonService ) {
            return res.status(503).json({ success: false, error: 'Boson service not available' });
        }

        // Get info before clearing
        const nodeId = bosonService.getNodeId();
        const usernameService = bosonService.getUsernameService();
        const username = usernameService?.getUsername();

        let mnemonicEncrypted = false;

        // If signature provided, encrypt and store the mnemonic
        if ( signature && walletAddress && !skipEncryption ) {
            mnemonicEncrypted = bosonService.encryptAndStoreMnemonic(signature, walletAddress);
            if ( mnemonicEncrypted ) {
                logger.info('[Setup] Mnemonic encrypted and stored for later access');
            } else {
                logger.warn('[Setup] Failed to encrypt mnemonic, proceeding without backup');
            }
        } else if ( ! skipEncryption ) {
            logger.info('[Setup] No signature provided, mnemonic will not be recoverable');
        }

        // Ensure data directory exists
        const setupDir = dirname(SETUP_COMPLETE_FILE);
        if ( ! existsSync(setupDir) ) {
            mkdirSync(setupDir, { recursive: true });
        }

        // Mark setup as complete
        writeFileSync(SETUP_COMPLETE_FILE, JSON.stringify({
            completedAt: new Date().toISOString(),
            username,
            nodeId,
            mnemonicEncrypted,
        }));

        // Clear mnemonic from memory (already cleared if encrypted successfully)
        bosonService.clearMnemonic();

        logger.info('[Setup] Mnemonic acknowledged, setup complete');

        res.json({
            success: true,
            setupComplete: true,
            mnemonicEncrypted,
        });
    } catch ( error ) {
        logger.error('[Setup] Acknowledge mnemonic error:', error);
        res.status(500).json({ success: false, error: 'Failed to acknowledge mnemonic' });
    }
});

/**
 * Get mnemonic for copying during setup
 * GET /api/setup/mnemonic
 *
 * This endpoint returns the mnemonic during the setup phase so the user
 * can copy and save it locally. Only available during first-run setup.
 *
 * SEC-7 (2026-04 audit): gated by requireSetupAuth. Without this gate,
 * any unauthenticated client could read the bare BIP39 phrase and
 * permanently take over the node's Boson DID and gateway handle.
 */
router.get('/mnemonic', requireSetupAuth, (req: Request, res: Response) => {
    try {
        const bosonService = req.app.locals.bosonService;

        if ( ! bosonService ) {
            return res.status(503).json({ error: 'Boson service not available' });
        }

        const mnemonic = bosonService.getFirstRunMnemonic();

        if ( ! mnemonic ) {
            return res.status(404).json({
                error: 'Recovery phrase not available',
                message: 'The recovery phrase is only available during initial setup. If the node was restarted, it can no longer be retrieved.',
            });
        }

        res.json({ mnemonic });
    } catch ( error ) {
        logger.error('[Setup] Get mnemonic error:', error);
        res.status(500).json({ error: 'Failed to get recovery phrase' });
    }
});

/**
 * Get current setup info (for resuming setup)
 * GET /api/setup/info
 *
 * SEC-7 (2026-04 audit): gated by requireSetupAuth. Returns setup-state
 * recon (hasMnemonic, hasIdentity) which lets a remote attacker time
 * their hijack attempts. Loopback callers (the local setup wizard) are
 * unaffected.
 */
router.get('/info', requireSetupAuth, (req: Request, res: Response) => {
    try {
        const bosonService = req.app.locals.bosonService;

        if ( ! bosonService ) {
            return res.json({
                ready: false,
                error: 'Boson service not available',
            });
        }

        const nodeId = bosonService.getNodeId();
        const did = bosonService.getDID();
        const usernameService = bosonService.getUsernameService();
        const username = usernameService?.getUsername();
        const publicUrl = usernameService?.getPublicUrl();
        const mnemonic = bosonService.getFirstRunMnemonic();

        res.json({
            ready: true,
            nodeId,
            did,
            username,
            publicUrl,
            hasMnemonic: !!mnemonic,
            hasMnemonicBackup: bosonService?.hasMnemonicBackup() || false,
            setupComplete: existsSync(SETUP_COMPLETE_FILE),
        });
    } catch ( error ) {
        logger.error('[Setup] Get info error:', error);
        res.status(500).json({ error: 'Failed to get setup info' });
    }
});

// ============================================================================
// Backup Restore Endpoints (pre-auth, used during setup wizard)
// ============================================================================

/**
 * Mnemonic-only identity restore.
 * POST /api/setup/restore-mnemonic
 *
 * Rebuilds `identity.json` deterministically from a 24-word recovery
 * phrase. Intended for the scenario where a node operator lost their
 * Docker volume / data directory but kept their recovery phrase —
 * because the DID is derived from the mnemonic alone, re-supplying
 * the phrase regenerates the same node identity (and therefore the
 * same `yourname.ela.city` handle on the gateway).
 *
 * Guarded by:
 *   - Rate limit: 5 attempts / 15 min / IP (shared with /restore)
 *   - Only runs when setup is NOT complete and identity.json is absent
 *     (will never clobber an active identity; use the authenticated
 *     API or `npm run recover-mnemonic` CLI for explicit overwrite)
 *   - 24-word phrase, lower-case ASCII, single-space separated
 *
 * Body: { mnemonic: string }   — 24 words
 * Response: { success, nodeId, did, publicUrl? }
 *
 * Security note: the phrase never leaves this handler; it lives only
 * in the request body buffer and is discarded at response time. The
 * derived private key is written to `identity.json` with mode 0600.
 */
router.post('/restore-mnemonic', (req: Request, res: Response) => {
    try {
    // Never clobber an active identity. If the user really wants to
    // overwrite, they need to either (a) delete identity.json from
    // the data volume and retry, or (b) use the CLI helper which
    // explicitly moves the existing identity aside.
        const identityPath = join(DATA_DIR, 'identity.json');
        if ( existsSync(SETUP_COMPLETE_FILE) || existsSync(identityPath) ) {
            return res.status(403).json({
                error:
          'Identity already present. Use the CLI (`npm run recover-mnemonic`) or clear the data directory to restore from a mnemonic.',
            });
        }

        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
        if ( ! checkRestoreRateLimit(clientIp) ) {
            return res.status(429).json({ error: 'Too many restore attempts. Try again later.' });
        }

        const { mnemonic } = req.body as { mnemonic?: unknown };
        if ( typeof mnemonic !== 'string' || mnemonic.length === 0 ) {
            return res.status(400).json({ error: 'mnemonic is required (string)' });
        }

        // Normalise: lowercase, collapse whitespace. IdentityService.js
        // uses the raw mnemonic text verbatim as HKDF IKM, so any
        // normalisation here MUST match what the generator did originally.
        // The generator writes `words.join(' ')` after lowercasing from
        // the fixed wordlist, so we mirror that exactly.
        const words = mnemonic
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 0);

        if ( words.length !== 24 ) {
            return res.status(400).json({ error: `Mnemonic must be exactly 24 words (got ${words.length}).` });
        }
        if ( ! words.every((w) => /^[a-z]+$/.test(w)) ) {
            return res.status(400).json({ error: 'Mnemonic words must be lower-case letters only.' });
        }

        const normalized = words.join(' ');

        let publicKey: Buffer;
        let privateKey: Buffer;
        try {
            const derived = deriveFromMnemonic(normalized);
            publicKey = derived.publicKey;
            privateKey = derived.privateKey;
        } catch ( err: any ) {
            logger.error('[Setup] restore-mnemonic: derive failed:', err?.message || err);
            return res.status(400).json({ error: 'Failed to derive identity from mnemonic.' });
        }

        const rawPublicKey = publicKey.slice(-32);
        const nodeId = toBase58(rawPublicKey);
        const did = `did:boson:${nodeId}`;

        // Reconstruct the same on-disk shape that IdentityService produces
        // on first run — but without persisting the plaintext mnemonic
        // (users already have it, we never want to store it unencrypted).
        const identity = {
            nodeId,
            did,
            publicKey: publicKey.toString('hex'),
            privateKey: privateKey.toString('hex'),
            identityVersion: 2,
            createdAt: new Date().toISOString(),
            restoredFromMnemonic: true,
        };

        if ( ! existsSync(DATA_DIR) ) {
            mkdirSync(DATA_DIR, { recursive: true });
        }
        writeFileSync(identityPath, JSON.stringify(identity, null, 2), { mode: 0o600 });

        logger.info(`[Setup] Identity restored from mnemonic: ${nodeId.substring(0, 12)}...`);

        return res.json({
            success: true,
            nodeId,
            did,
            message:
        'Identity restored. Restart the node to reload the identity, then finish the setup wizard to re-claim your username on the gateway.',
            needsRestart: true,
        });
    } catch ( error: any ) {
        logger.error('[Setup] restore-mnemonic failed:', error);
        return res.status(500).json({ error: `Failed to restore identity: ${ error?.message || 'unknown error'}` });
    }
});

/**
 * Upload and validate a backup for restoration.
 * POST /api/setup/restore
 *
 * Accepts multipart/form-data with a 'file' field.
 * Extracts the backup to a staging directory and returns metadata.
 * If the backup contains an encrypted identity (v2), the response indicates
 * that a mnemonic is required to complete the restore.
 */
router.post('/restore', restoreUpload.single('file'), async (req: Request, res: Response) => {
    try {
    // Only allowed during setup (before setup is complete)
        if ( existsSync(SETUP_COMPLETE_FILE) && !existsSync(join(DATA_DIR, 'identity.enc')) ) {
            return res.status(403).json({ error: 'Setup already complete. Use the authenticated restore endpoint.' });
        }

        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
        if ( ! checkRestoreRateLimit(clientIp) ) {
            return res.status(429).json({ error: 'Too many restore attempts. Try again later.' });
        }

        if ( ! req.file ) {
            return res.status(400).json({ error: 'No backup file provided.' });
        }

        const uploadedPath = req.file.path;

        // Clean staging directory
        if ( existsSync(RESTORE_STAGING_DIR) ) {
            rmSync(RESTORE_STAGING_DIR, { recursive: true, force: true });
        }
        mkdirSync(RESTORE_STAGING_DIR, { recursive: true });

        // Extract backup
        await extractTar({ file: uploadedPath, cwd: RESTORE_STAGING_DIR, strip: 0 });

        // Clean up uploaded file
        try {
            rmSync(uploadedPath);
        } catch { /* ignore */ }

        // Read backup metadata
        const metaPath = join(RESTORE_STAGING_DIR, 'backup-meta.json');
        let backupMeta = { formatVersion: 1, identityVersion: 1, createdAt: '' };
        if ( existsSync(metaPath) ) {
            try {
                backupMeta = JSON.parse(readFileSync(metaPath, 'utf8'));
            } catch { /* use defaults */ }
        }

        const extractedData = join(RESTORE_STAGING_DIR, 'data');
        const isV2 = backupMeta.formatVersion >= 2;
        const hasEncryptedIdentity = existsSync(join(extractedData, 'identity.enc'));
        const hasPlaintextIdentity = existsSync(join(extractedData, 'identity.json'));
        const needsMnemonic = isV2 && hasEncryptedIdentity;

        // Build contents summary
        const contents: string[] = [];
        if ( existsSync(join(extractedData, 'pc2.db')) ) contents.push('database');
        if ( existsSync(join(extractedData, 'ipfs')) ) contents.push('ipfs');
        if ( hasEncryptedIdentity ) contents.push('identity (encrypted)');
        if ( hasPlaintextIdentity ) contents.push('identity');
        if ( existsSync(join(extractedData, 'encryption.key')) ) contents.push('encryption-key');
        if ( existsSync(join(extractedData, 'node-config.json')) ) contents.push('node-config');
        if ( existsSync(join(extractedData, 'username.json')) ) contents.push('username');
        if ( existsSync(join(extractedData, 'installed-apps')) ) contents.push('installed-apps');
        if ( existsSync(join(extractedData, 'agents')) ) contents.push('agents');
        if ( existsSync(join(RESTORE_STAGING_DIR, 'config', 'config.json')) ) contents.push('server-config');

        logger.info('[Setup Restore] Backup uploaded and validated', {
            formatVersion: backupMeta.formatVersion,
            needsMnemonic,
            contents,
        });

        res.json({
            success: true,
            needsMnemonic,
            formatVersion: backupMeta.formatVersion,
            identityVersion: backupMeta.identityVersion,
            createdAt: backupMeta.createdAt,
            contents,
        });
    } catch ( error: any ) {
    // Clean up on failure
        if ( req.file?.path && existsSync(req.file.path) ) {
            try {
                rmSync(req.file.path);
            } catch { /* ignore */ }
        }
        logger.error('[Setup Restore] Upload/validate failed:', error);
        res.status(500).json({ error: `Failed to process backup: ${ error.message}` });
    }
});

/**
 * Finalize a backup restoration.
 * POST /api/setup/restore/finalize
 *
 * If the backup had an encrypted identity, the mnemonic must be provided.
 * Decrypts the identity, moves all data into place, and removes setup-complete
 * so the setup wizard continues with username registration.
 *
 * Body: { mnemonic?: string } (required for v2 backups)
 */
router.post('/restore/finalize', async (req: Request, res: Response) => {
    try {
        if ( ! existsSync(RESTORE_STAGING_DIR) ) {
            return res.status(400).json({ error: 'No pending restore. Upload a backup first.' });
        }

        const extractedData = join(RESTORE_STAGING_DIR, 'data');
        const extractedConfig = join(RESTORE_STAGING_DIR, 'config');
        const identityEncPath = join(extractedData, 'identity.enc');
        const identityJsonPath = join(extractedData, 'identity.json');

        // Read backup metadata
        const metaPath = join(RESTORE_STAGING_DIR, 'backup-meta.json');
        let backupMeta = { formatVersion: 1, identityVersion: 1 };
        if ( existsSync(metaPath) ) {
            try {
                backupMeta = JSON.parse(readFileSync(metaPath, 'utf8'));
            } catch { /* defaults */ }
        }

        const isV2 = backupMeta.formatVersion >= 2;
        const hasEncryptedIdentity = existsSync(identityEncPath);
        let restoredIdentity: any = null;

        // Decrypt identity if v2 backup
        if ( isV2 && hasEncryptedIdentity ) {
            const { mnemonic } = req.body;
            if ( !mnemonic || typeof mnemonic !== 'string' ) {
                return res.status(400).json({ error: 'Mnemonic is required to restore from this backup.' });
            }

            const words = mnemonic.trim().split(/\s+/);
            if ( words.length !== 24 ) {
                return res.status(400).json({ error: 'Mnemonic must be exactly 24 words.' });
            }

            // Derive keypair from mnemonic
            const salt = Buffer.from('pc2-boson-identity-v2', 'utf8');
            const info = Buffer.from('ed25519-seed', 'utf8');
            const ikm = Buffer.from(mnemonic.trim(), 'utf8');
            const prk = createHmac('sha256', salt).update(ikm).digest();
            const seed = createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([0x01])])).digest();
            const kp = nacl.sign.keyPair.fromSeed(new Uint8Array(seed));

            const rawPub = Buffer.from(kp.publicKey);
            const spki = Buffer.concat([ED25519_SPKI_PREFIX, rawPub]);
            const pkcs8 = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);

            // Derive AES key from the public key (same derivation as backup.js)
            const encSalt = Buffer.from('pc2-backup-identity-encryption', 'utf8');
            const encInfo = Buffer.from('aes-256-gcm-key', 'utf8');
            const encPrk = createHmac('sha256', encSalt).update(spki).digest();
            const aesKey = createHmac('sha256', encPrk).update(Buffer.concat([encInfo, Buffer.from([0x01])])).digest();

            // Read and decrypt identity.enc
            const encPayload = JSON.parse(readFileSync(identityEncPath, 'utf8'));
            const iv = Buffer.from(encPayload.iv, 'hex');
            const authTag = Buffer.from(encPayload.authTag, 'hex');
            const ciphertext = Buffer.from(encPayload.ciphertext, 'hex');

            try {
                const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
                decipher.setAuthTag(authTag);
                const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
                restoredIdentity = JSON.parse(decrypted.toString('utf8'));
            } catch {
                return res.status(400).json({ error: 'Invalid mnemonic. Could not decrypt identity.' });
            }

            // Verify the decrypted identity matches the derived keypair
            if ( restoredIdentity.publicKey !== spki.toString('hex') ) {
                return res.status(400).json({ error: 'Mnemonic does not match this backup identity.' });
            }

            // Write decrypted identity.json to staging
            writeFileSync(identityJsonPath, JSON.stringify(restoredIdentity, null, 2), { mode: 0o600 });
            logger.info('[Setup Restore] Identity decrypted and verified');
        }

        // Move existing data out of the way
        const oldBackupDir = join(DATA_DIR, '.old-restore-backup');
        if ( existsSync(oldBackupDir) ) {
            rmSync(oldBackupDir, { recursive: true, force: true });
        }
        mkdirSync(oldBackupDir, { recursive: true });

        // Critical files to restore from staging
        const filesToRestore = [
            { src: 'pc2.db', dest: join(DATA_DIR, 'pc2.db') },
            { src: 'pc2.db-wal', dest: join(DATA_DIR, 'pc2.db-wal') },
            { src: 'pc2.db-shm', dest: join(DATA_DIR, 'pc2.db-shm') },
            { src: 'encryption.key', dest: join(DATA_DIR, 'encryption.key'), perms: 0o600 },
            { src: 'node-config.json', dest: join(DATA_DIR, 'node-config.json') },
            { src: 'identity.json', dest: join(DATA_DIR, 'identity.json'), perms: 0o600 },
            { src: 'username.json', dest: join(DATA_DIR, 'username.json') },
        ];

        const restored: string[] = [];

        for ( const entry of filesToRestore ) {
            const srcPath = join(extractedData, entry.src);
            if ( ! existsSync(srcPath) ) continue;

            // Back up existing
            if ( existsSync(entry.dest) ) {
                const oldDest = join(oldBackupDir, entry.src);
                mkdirSync(dirname(oldDest), { recursive: true });
                renameSync(entry.dest, oldDest);
            }

            renameSync(srcPath, entry.dest);
            if ( entry.perms ) chmodSync(entry.dest, entry.perms);
            restored.push(entry.src);
        }

        // Restore directories (IPFS, installed-apps, agents)
        const dirsToRestore = [
            { src: 'ipfs', dest: join(DATA_DIR, 'ipfs') },
            { src: 'installed-apps', dest: join(DATA_DIR, 'installed-apps') },
            { src: 'agents', dest: join(DATA_DIR, 'agents') },
        ];

        for ( const dir of dirsToRestore ) {
            const srcPath = join(extractedData, dir.src);
            if ( !existsSync(srcPath) || !statSync(srcPath).isDirectory() ) continue;

            if ( existsSync(dir.dest) ) {
                const oldDest = join(oldBackupDir, dir.src);
                mkdirSync(dirname(oldDest), { recursive: true });
                renameSync(dir.dest, oldDest);
            }

            renameSync(srcPath, dir.dest);
            restored.push(`${dir.src }/`);
        }

        // Restore server config if present
        const configSrc = join(extractedConfig, 'config.json');
        const configDest = join(PROJECT_ROOT, 'config', 'config.json');
        if ( existsSync(configSrc) ) {
            if ( existsSync(configDest) ) {
                const oldConfigDest = join(oldBackupDir, 'config.json');
                renameSync(configDest, oldConfigDest);
            }
            mkdirSync(dirname(configDest), { recursive: true });
            renameSync(configSrc, configDest);
            restored.push('config.json');
        }

        // Remove setup-complete so the wizard continues with username step
        const setupComplete = join(DATA_DIR, 'setup-complete');
        if ( existsSync(setupComplete) ) {
            rmSync(setupComplete);
        }

        // Clean up staging
        rmSync(RESTORE_STAGING_DIR, { recursive: true, force: true });

        // Determine the nodeId from restored identity
        let nodeId: string | null = null;
        const identityDest = join(DATA_DIR, 'identity.json');
        if ( existsSync(identityDest) ) {
            try {
                const identity = JSON.parse(readFileSync(identityDest, 'utf8'));
                nodeId = identity.nodeId;
            } catch { /* ignore */ }
        }

        logger.info('[Setup Restore] Restore finalized', { restored, nodeId });

        res.json({
            success: true,
            restored,
            nodeId,
            message: 'Backup restored. The node will restart with the restored data. Complete the setup wizard to register your username.',
            needsRestart: true,
        });
    } catch ( error: any ) {
        logger.error('[Setup Restore] Finalize failed:', error);
        res.status(500).json({ error: `Failed to finalize restore: ${ error.message}` });
    }
});

/**
 * Cancel a pending restore (clean up staging)
 * DELETE /api/setup/restore
 */
router.delete('/restore', (_req: Request, res: Response) => {
    try {
        if ( existsSync(RESTORE_STAGING_DIR) ) {
            rmSync(RESTORE_STAGING_DIR, { recursive: true, force: true });
        }
        res.json({ success: true });
    } catch ( error: any ) {
        res.status(500).json({ error: `Failed to cancel restore: ${ error.message}` });
    }
});

export default router;
