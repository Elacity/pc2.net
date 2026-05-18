/**
 * Authentication Endpoints
 *
 * Handles Particle Auth authentication and session creation
 */

import { Request, Response } from 'express';
import type { DatabaseManager } from '../storage/database.js';
import { Config, saveConfig } from '../config/loader.js';
import { verifyOwner, setOwner } from '../auth/owner.js';
import { AuthRequest, AuthResponse, UserInfo } from '../types/api.js';
import { AuthenticatedRequest } from './middleware.js';
import type { FilesystemManager } from '../storage/filesystem.js';
import { logger } from '../utils/logger.js';
import { normalizeAddress, compareAddresses, detectAddressType } from '../utils/wallet.js';
import crypto from 'crypto';
import { getNodeConfig, saveNodeConfig } from './setup.js';
import { challengeStore } from './auth/challenge-store.js';
import { verifySiweSignature } from './auth/siwe-verify.js';
import { firstRunTokenStore } from './setup/first-run-token.js';
import { recordTelemetryOnce } from './telemetry.js';

const LOOPBACK_RE = /^(127\.|::1$|::ffff:127\.)/;
function isLoopback (addr: string | undefined): boolean {
    return !!addr && LOOPBACK_RE.test(addr);
}

/**
 * SEC-3a (2026-04 audit): issue a single-use SIWE challenge.
 * GET /auth/challenge?address=0x...
 *
 * Even when config.security.siweRequired is false, this endpoint always
 * works so the GUI can be deployed first ("forward compatibility"). The
 * server only ENFORCES presence of a valid signature in handleParticleAuth
 * once the kill-switch flips.
 */
export function handleAuthChallenge (req: Request, res: Response): void {
    const address = (req.query.address as string | undefined) || '';
    if ( ! address ) {
        res.status(400).json({ error: 'address query param required' });
        return;
    }
    try {
        const host = req.headers.host || 'pc2-node.local';
        const proto = (req.headers['x-forwarded-proto'] as string) || (req.protocol || 'http');
        const challenge = challengeStore.issue(address, host, {
            uri: `${proto}://${host}`,
            chainId: 20,
            statement: 'Sign in to your PC2 node.',
        });
        res.json({
            nonce: challenge.nonce,
            message: challenge.message,
            expiresAt: challenge.expiresAt,
        });
    } catch (e) {
        logger.error('[Auth Challenge] issue failed:', e instanceof Error ? e.message : e);
        res.status(500).json({ error: 'failed to issue challenge' });
    }
}

/**
 * Authenticate with Particle Auth
 * POST /auth/particle
 *
 * SEC-3a (2026-04 audit): when config.security.siweRequired is true, the
 * caller must supply { signature, nonce, message } proving wallet
 * control. When false (default), legacy unauthenticated flow remains so
 * the GUI rollout is risk-free; the verification path is exercised
 * opportunistically (logged-only) to surface bugs before the flag flips.
 */
export async function handleParticleAuth (req: Request, res: Response): Promise<void> {
    const db = (req.app.locals.db as DatabaseManager | undefined);
    const config = (req.app.locals.config as Config | undefined);

    logger.info('🔐 Particle Auth request received', {
        method: req.method,
        path: req.path,
        bodyKeys: Object.keys(req.body || {}),
    });

    if ( ! db ) {
        res.status(500).json({ error: 'Database not initialized' });
        return;
    }

    if ( ! config ) {
        res.status(500).json({ error: 'Configuration not loaded' });
        return;
    }

    try {
        const body = req.body as any; // Accept flexible field names from Particle Auth
        // Prefer EOA so sessions and whoami use EOA (NFTs/tokens are held by EOA; address may be Smart Account in Universal mode)
        const wallet_address = body.eoaAddress || body.ownerAddress || body.wallet_address || body.walletAddress || body.address;
        // Smart account may be: smartAccountAddress or smart_account_address
        const smart_account_address = body.smart_account_address || body.smartAccountAddress;

        logger.info('🔐 Auth request details', {
            hasWalletAddress: !!wallet_address,
            walletAddress: wallet_address ? `${wallet_address.substring(0, 10) }...` : null,
            hasSmartAccount: !!smart_account_address,
            bodyKeys: Object.keys(body || {}),
        });

        if ( ! wallet_address ) {
            logger.warn('Auth request missing wallet address. Body keys:', Object.keys(body || {}));
            res.status(400).json({ error: 'Missing wallet address', received: Object.keys(body || {}) });
            return;
        }

        // Normalize wallet address (EVM lowercased, Solana kept as-is)
        const normalizedWallet = normalizeAddress(wallet_address);
        const addressType = detectAddressType(wallet_address);

        // SEC-3a (2026-04 audit): SIWE wallet-control proof.
        // Always run verification when caller supplied { signature, nonce, message }
        // (so we can validate the GUI before flipping the kill-switch). Only REJECT
        // missing/invalid signatures when config.security.siweRequired is true.
        const siweRequired = !!config.security.siweRequired;
        const { signature, nonce, message } = body as { signature?: string; nonce?: string; message?: string };

        if ( signature || nonce || message || siweRequired ) {
            const haveAll = !!(signature && nonce && message);
            if ( ! haveAll ) {
                if ( siweRequired ) {
                    logger.warn('🚫 SIWE required but request missing signature/nonce/message', {
                        wallet: `${normalizedWallet.substring(0, 10) }...`,
                        hasSignature: !!signature,
                        hasNonce: !!nonce,
                        hasMessage: !!message,
                    });
                    res.status(401).json({ error: 'siwe_required', message: 'A signed challenge is required. Fetch /auth/challenge first.' });
                    return;
                }
            } else {
                // Verify nonce — must exist, not be expired, bound to this address
                const consumed = challengeStore.consume(nonce, normalizedWallet);
                if ( ! consumed.ok ) {
                    if ( siweRequired ) {
                        logger.warn('🚫 SIWE nonce rejected', { reason: consumed.reason, wallet: `${normalizedWallet.substring(0, 10) }...` });
                        res.status(401).json({ error: 'invalid_nonce', message: consumed.reason });
                        return;
                    }
                    logger.warn('⚠️  SIWE nonce rejected (audit-only, kill-switch off)', { reason: consumed.reason });
                } else {
                    // Verify signature — EVM EOA path is the only one currently exercised by
                    // the Particle Auth GUI (smart accounts will need eip1271Verifier injection).
                    const verifyResult = await verifySiweSignature({
                        message: message!,
                        signature: signature!,
                        expectedAddress: normalizedWallet,
                        addressType: addressType === 'solana' ? 'solana' : 'evm',
                        // smartAccountAddress: smart_account_address || undefined,  // wire when EIP-1271 verifier is implemented
                    });
                    if ( ! verifyResult.valid ) {
                        if ( siweRequired ) {
                            logger.warn('🚫 SIWE signature verification failed', { reason: verifyResult.reason, wallet: `${normalizedWallet.substring(0, 10) }...` });
                            res.status(401).json({ error: 'invalid_signature', message: verifyResult.reason });
                            return;
                        }
                        logger.warn('⚠️  SIWE signature failed (audit-only, kill-switch off)', { reason: verifyResult.reason });
                    } else {
                        logger.info('✅ SIWE signature verified', { wallet: `${normalizedWallet.substring(0, 10) }...` });
                    }
                }
            }
        }

        logger.info('🔐 Address type detected', {
            addressType,
            original: `${wallet_address.substring(0, 10) }...`,
            normalized: `${normalizedWallet.substring(0, 10) }...`,
        });

        // ACCESS CONTROL: Check if this wallet is allowed to access this node
        const nodeConfig = getNodeConfig();

        // If owner is set, verify this wallet is authorized
        if ( nodeConfig.ownerWallet ) {
            const isOwner = compareAddresses(nodeConfig.ownerWallet, normalizedWallet);
            const allowedWallets = nodeConfig.allowedWallets || [];
            const isAllowed = allowedWallets.some((w: { wallet: string }) => compareAddresses(w.wallet, normalizedWallet));

            if ( !isOwner && !isAllowed ) {
                logger.warn('🚫 Access denied for wallet', {
                    wallet: `${normalizedWallet.substring(0, 10) }...`,
                    owner: `${nodeConfig.ownerWallet.substring(0, 10) }...`,
                    reason: 'Not owner or in allowed list',
                });

                res.status(403).json({
                    error: 'access_denied',
                    message: 'You are not authorized to access this node. The node owner must add your wallet address to the access list.',
                    wallet: normalizedWallet,
                });
                return;
            }

            logger.info('🔐 User authorized', {
                wallet: `${normalizedWallet.substring(0, 10) }...`,
                role: isOwner ? 'owner' : 'member',
            });
        } else {
            // No owner set yet - this wallet may claim ownership.
            //
            // SEC-3a (2026-04 audit): an unauthenticated attacker could previously
            // claim a brand-new node by simply POSTing any wallet address. The
            // gates below now require ONE of:
            //   (a) anti-snipe password proven this session (cookie set by
            //       /api/access/verify-password) — the original UX path,
            //   (b) request from loopback (local first-run setup wizard),
            //   (c) a valid X-First-Run-Token header (remote setup),
            //   (d) the kill-switch is still off (siweRequired=false) — legacy
            //       behavior preserved during rollout.
            // When siweRequired=true, we additionally require that the SIWE
            // signature has already been verified above (which it has, because
            // the only way past the SIWE block when siweRequired=true is success).
            const remoteAddr = req.socket.remoteAddress || '';
            const cookies = (req as Request & { cookies?: Record<string, string> }).cookies || {};
            const antiSnipeCookie = cookies.antiSnipeSession;
            const firstRunHeader = req.headers['x-first-run-token'];
            const firstRunToken = Array.isArray(firstRunHeader) ? firstRunHeader[0] : firstRunHeader;

            // Lazy import to avoid circular deps at module load
            const { verifyAntiSnipeSession } = await import('./access-control.js');
            const claimAllowed =
                (antiSnipeCookie && verifyAntiSnipeSession(antiSnipeCookie)) ||
                isLoopback(remoteAddr) ||
                (typeof firstRunToken === 'string' && firstRunTokenStore.verify(firstRunToken)) ||
                !siweRequired; // legacy escape hatch until kill-switch flips

            if ( ! claimAllowed ) {
                logger.warn('🚫 Ownership claim refused — no proof of intent', {
                    wallet: `${normalizedWallet.substring(0, 10) }...`,
                    remoteAddr: remoteAddr.substring(0, 32),
                    hasAntiSnipeCookie: !!antiSnipeCookie,
                    hasFirstRunToken: !!firstRunToken,
                });
                res.status(403).json({
                    error: 'claim_denied',
                    message: 'This node has no anti-snipe password set; first-claim is restricted to loopback or X-First-Run-Token.',
                });
                return;
            }

            logger.info('🔐 No owner set — first wallet will claim', {
                wallet: `${normalizedWallet.substring(0, 10) }...`,
                proofPath: antiSnipeCookie ? 'antiSnipeCookie'
                    : isLoopback(remoteAddr) ? 'loopback'
                        : firstRunToken ? 'firstRunToken'
                            : 'legacy(siweRequired=false)',
            });

            try {
                const updatedConfig = { ...nodeConfig };
                updatedConfig.ownerWallet = normalizedWallet;
                delete updatedConfig.antiSnipePasswordHash; // PERMANENTLY DELETE — claim is final
                saveNodeConfig(updatedConfig);
                logger.info(`✅ Ownership claimed by EOA ${normalizedWallet}, anti-snipe password deleted`);
            } catch ( ownershipError ) {
                logger.error('Failed to claim ownership:', ownershipError instanceof Error ? ownershipError.message : 'Unknown');
            }
        }

        // Create or get user
        db.createOrUpdateUser(normalizedWallet, smart_account_address || null);
        db.updateLastLogin(normalizedWallet);

        // Telemetry hook (A5b §P0): "Door 2" of the v1.2 funnel.
        // Fires exactly once per node lifetime — the first time any wallet
        // successfully completes auth + has a session-ready user record.
        // Idempotent on subsequent logins (same wallet OR different wallets).
        recordTelemetryOnce(db, 'wallet_ready');

        // Check for existing valid session
        const existingSession = db.getSessionByWallet(normalizedWallet);
        if ( existingSession && existingSession.expires_at > Date.now() ) {
            // Update smart account if provided and different from stored value
            if ( smart_account_address && smart_account_address !== existingSession.smart_account_address ) {
                logger.info('🔄 Updating session smart account', {
                    wallet: `${normalizedWallet.substring(0, 10) }...`,
                    oldSmartAccount: existingSession.smart_account_address?.substring(0, 10) || 'none',
                    newSmartAccount: `${smart_account_address.substring(0, 10) }...`,
                });
                db.updateSessionSmartAccount(existingSession.token, smart_account_address);
            }

            logger.info('✅ Returning existing session', {
                wallet: `${normalizedWallet.substring(0, 10) }...`,
                tokenPrefix: `${existingSession.token.substring(0, 8) }...`,
                expiresAt: new Date(existingSession.expires_at).toISOString(),
            });
            // Return existing session (with potentially updated smart account)
            const userInfo = buildUserInfo(normalizedWallet, smart_account_address || existingSession.smart_account_address, existingSession.token, config);
            const response: AuthResponse = {
                success: true,
                token: existingSession.token,
                user: userInfo,
            };
            res.json(response);
            return;
        } else if ( existingSession ) {
            logger.info('🔄 Existing session expired, creating new one', {
                wallet: `${normalizedWallet.substring(0, 10) }...`,
                expiredAt: new Date(existingSession.expires_at).toISOString(),
            });
        }

        // Create new session
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const sessionDuration = config.security.session_duration_days * 24 * 60 * 60 * 1000;
        const expiresAt = Date.now() + sessionDuration;

        logger.info('🔐 Creating session', {
            wallet: `${normalizedWallet.substring(0, 10) }...`,
            sessionDurationDays: config.security.session_duration_days,
            sessionDurationMs: sessionDuration,
            expiresAt: new Date(expiresAt).toISOString(),
            expiresIn: `${Math.round(sessionDuration / 1000 / 60) } minutes`,
        });

        db.createSession({
            token: sessionToken,
            wallet_address: normalizedWallet,
            smart_account_address: smart_account_address || null,
            created_at: Date.now(),
            expires_at: expiresAt,
        });

        // Ensure user's home directory structure exists (matching mock server behavior)
        const filesystem = (req.app.locals.filesystem as FilesystemManager | undefined);
        if ( filesystem ) {
            try {
                // Create user's root directory
                const userRoot = `/${normalizedWallet}`;
                try {
                    await filesystem.createDirectory(userRoot, normalizedWallet);
                } catch ( error ) {
                    // Directory might already exist, that's fine
                    logger.debug(`User root ${userRoot} already exists`);
                }

                // Create standard directories (Desktop, Documents, Public, Pictures, Videos, Trash)
                const standardDirs = ['Desktop', 'Documents', 'Public', 'Pictures', 'Videos', 'Trash'];
                for ( const dirName of standardDirs ) {
                    const dirPath = `${userRoot}/${dirName}`;
                    try {
                        await filesystem.createDirectory(dirPath, normalizedWallet);
                        logger.info(`✅ Created user directory: ${dirPath}`);
                    } catch ( error ) {
                        // Directory might already exist, that's fine
                        logger.debug(`Directory ${dirPath} already exists or creation failed:`, error instanceof Error ? error.message : 'Unknown');
                    }
                }
            } catch ( error ) {
                // Log but don't fail auth if directory creation fails
                logger.warn('Failed to create user home directory structure:', error instanceof Error ? error.message : 'Unknown');
            }
        } else {
            logger.warn('Filesystem not available, skipping user home directory creation');
        }

        logger.info(`✅ Created session for wallet: ${normalizedWallet.slice(0, 6)}...${normalizedWallet.slice(-4)}`, {
            tokenPrefix: `${sessionToken.substring(0, 8) }...`,
            tokenLength: sessionToken.length,
            expiresAt: new Date(expiresAt).toISOString(),
        });

        // Build user info
        const userInfo = buildUserInfo(normalizedWallet, smart_account_address, sessionToken, config);

        const response: AuthResponse = {
            success: true,
            token: sessionToken,
            user: userInfo,
        };

        // Set CORS headers (matching mock server)
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        res.json(response);
    } catch ( error ) {
        logger.error('Auth error:', error instanceof Error ? error.message : 'Unknown error');
        res.status(500).json({
            error: 'Authentication failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Grant user app access
 * POST /auth/grant-user-app
 */
export function handleGrantUserApp (req: AuthenticatedRequest, res: Response): void {
    // This endpoint is used by the frontend to grant app permissions
    // For now, just acknowledge the request
    res.json({ success: true, granted: true });
}

/**
 * GET /auth/get-user-app-token
 * Returns a token for app access (used by SDK)
 */
export function handleGetUserAppToken (req: AuthenticatedRequest, res: Response): void {
    // Return the user's session token as the app token
    // The SDK uses this to authenticate app requests
    const token = req.user?.session_token || '';
    res.json({ success: true, token });
}

/**
 * Build user info response
 */
function buildUserInfo (
    walletAddress: string,
    smartAccountAddress: string | null | undefined,
    sessionToken: string,
    config: Config,
): UserInfo {
    return {
        id: 1,
        uuid: walletAddress,
        username: walletAddress,
        wallet_address: walletAddress,
        smart_account_address: smartAccountAddress || null,
        email: null,
        email_confirmed: true,
        is_temp: false,
        taskbar_items: [],
        desktop_bg_url: '/images/wallpaper-elacity.png',
        desktop_bg_color: null,
        desktop_bg_fit: 'cover',
        token: sessionToken,
        auth_type: smartAccountAddress ? 'universalx' : 'wallet',
    };
}
