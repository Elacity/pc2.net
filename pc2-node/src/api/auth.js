import { logger } from '../utils/logger.js';
import crypto from 'crypto';
export async function handleParticleAuth(req, res) {
    const db = req.app.locals.db;
    const config = req.app.locals.config;
    logger.info('🔐 Particle Auth request received', {
        method: req.method,
        path: req.path,
        bodyKeys: Object.keys(req.body || {})
    });
    if (!db) {
        res.status(500).json({ error: 'Database not initialized' });
        return;
    }
    if (!config) {
        res.status(500).json({ error: 'Configuration not loaded' });
        return;
    }
    try {
        const body = req.body;
        const wallet_address = body.wallet_address || body.address || body.walletAddress || body.eoaAddress;
        const smart_account_address = body.smart_account_address || body.smartAccountAddress;
        logger.info('🔐 Auth request details', {
            hasWalletAddress: !!wallet_address,
            walletAddress: wallet_address ? wallet_address.substring(0, 10) + '...' : null,
            hasSmartAccount: !!smart_account_address,
            bodyKeys: Object.keys(body || {})
        });
        if (!wallet_address) {
            logger.warn('Auth request missing wallet address. Body keys:', Object.keys(body || {}));
            res.status(400).json({ error: 'Missing wallet address', received: Object.keys(body || {}) });
            return;
        }
        const normalizedWallet = wallet_address.toLowerCase();
        logger.info('🔐 User authentication', {
            wallet: normalizedWallet.substring(0, 10) + '...',
            mode: 'multi-user'
        });
        db.createOrUpdateUser(normalizedWallet, smart_account_address || null);
        db.updateLastLogin(normalizedWallet);
        const existingSession = db.getSessionByWallet(normalizedWallet);
        if (existingSession && existingSession.expires_at > Date.now()) {
            logger.info('✅ Returning existing session', {
                wallet: normalizedWallet.substring(0, 10) + '...',
                tokenPrefix: existingSession.token.substring(0, 8) + '...',
                expiresAt: new Date(existingSession.expires_at).toISOString()
            });
            const userInfo = buildUserInfo(normalizedWallet, smart_account_address, existingSession.token, config);
            const response = {
                success: true,
                token: existingSession.token,
                user: userInfo
            };
            res.json(response);
            return;
        }
        else if (existingSession) {
            logger.info('🔄 Existing session expired, creating new one', {
                wallet: normalizedWallet.substring(0, 10) + '...',
                expiredAt: new Date(existingSession.expires_at).toISOString()
            });
        }
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const sessionDuration = config.security.session_duration_days * 24 * 60 * 60 * 1000;
        const expiresAt = Date.now() + sessionDuration;
        logger.info('🔐 Creating session', {
            wallet: normalizedWallet.substring(0, 10) + '...',
            sessionDurationDays: config.security.session_duration_days,
            sessionDurationMs: sessionDuration,
            expiresAt: new Date(expiresAt).toISOString(),
            expiresIn: Math.round(sessionDuration / 1000 / 60) + ' minutes'
        });
        db.createSession({
            token: sessionToken,
            wallet_address: normalizedWallet,
            smart_account_address: smart_account_address || null,
            created_at: Date.now(),
            expires_at: expiresAt
        });
        const filesystem = req.app.locals.filesystem;
        if (filesystem) {
            try {
                const userRoot = `/${normalizedWallet}`;
                try {
                    await filesystem.createDirectory(userRoot, normalizedWallet);
                }
                catch (error) {
                    logger.debug(`User root ${userRoot} already exists`);
                }
                const standardDirs = ['Desktop', 'Documents', 'Public', 'Pictures', 'Videos', 'Trash'];
                for (const dirName of standardDirs) {
                    const dirPath = `${userRoot}/${dirName}`;
                    try {
                        await filesystem.createDirectory(dirPath, normalizedWallet);
                        logger.info(`✅ Created user directory: ${dirPath}`);
                    }
                    catch (error) {
                        logger.debug(`Directory ${dirPath} already exists or creation failed:`, error instanceof Error ? error.message : 'Unknown');
                    }
                }
            }
            catch (error) {
                logger.warn('Failed to create user home directory structure:', error instanceof Error ? error.message : 'Unknown');
            }
        }
        else {
            logger.warn('Filesystem not available, skipping user home directory creation');
        }
        logger.info(`✅ Created session for wallet: ${normalizedWallet.slice(0, 6)}...${normalizedWallet.slice(-4)}`, {
            tokenPrefix: sessionToken.substring(0, 8) + '...',
            tokenLength: sessionToken.length,
            expiresAt: new Date(expiresAt).toISOString()
        });
        const userInfo = buildUserInfo(normalizedWallet, smart_account_address, sessionToken, config);
        const response = {
            success: true,
            token: sessionToken,
            user: userInfo
        };
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.json(response);
    }
    catch (error) {
        logger.error('Auth error:', error instanceof Error ? error.message : 'Unknown error');
        res.status(500).json({
            error: 'Authentication failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
export function handleGrantUserApp(req, res) {
    res.json({ success: true, granted: true });
}
export function handleGetUserAppToken(req, res) {
    const token = req.user?.session_token || '';
    res.json({ success: true, token });
}
function buildUserInfo(walletAddress, smartAccountAddress, sessionToken, config) {
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
        desktop_bg_url: '/images/flint-2.jpg',
        desktop_bg_color: null,
        desktop_bg_fit: 'cover',
        token: sessionToken,
        auth_type: smartAccountAddress ? 'universalx' : 'wallet'
    };
}
//# sourceMappingURL=auth.js.map