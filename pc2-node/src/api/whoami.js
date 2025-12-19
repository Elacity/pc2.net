import { logger } from '../utils/logger.js';
export function handleWhoami(req, res) {
    const db = req.app.locals.db;
    const config = req.app.locals.config;
    if (!db) {
        res.status(500).json({ error: 'Database not initialized' });
        return;
    }
    let token;
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const headerParts = authHeader.split(',').map(p => p.trim());
        const allTokens = [];
        for (const part of headerParts) {
            if (part.startsWith('Bearer ')) {
                allTokens.push(part.substring(7).trim());
            }
            else if (part.length > 0) {
                allTokens.push(part);
            }
        }
        if (allTokens.length > 1) {
            logger.info('[Whoami] Multiple tokens detected in header', {
                totalTokens: allTokens.length,
                tokenPrefixes: allTokens.map(t => t.substring(0, 8) + '...')
            });
            for (const candidateToken of allTokens) {
                const candidateSession = db.getSession(candidateToken);
                if (candidateSession && candidateSession.expires_at > Date.now()) {
                    token = candidateToken;
                    logger.info('[Whoami] Found valid session for token from multiple tokens', {
                        tokenPrefix: token.substring(0, 8) + '...',
                        walletPrefix: candidateSession.wallet_address.substring(0, 10) + '...'
                    });
                    break;
                }
            }
            if (!token) {
                const realToken = allTokens.find(t => t.length === 64 && /^[0-9a-f]+$/i.test(t));
                if (realToken) {
                    token = realToken;
                    logger.info('[Whoami] No valid session found, using real session token format', {
                        tokenPrefix: token.substring(0, 8) + '...'
                    });
                }
                else {
                    token = allTokens[0];
                    logger.warn('[Whoami] No valid session found, using first token', {
                        tokenPrefix: token.substring(0, 8) + '...',
                        totalTokens: allTokens.length
                    });
                }
            }
        }
        else if (allTokens.length === 1) {
            token = allTokens[0];
        }
        else if (authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7).trim();
        }
    }
    else if (req.query.token) {
        token = String(req.query.token).trim();
    }
    else if (req.query.auth_token) {
        token = String(req.query.auth_token).trim();
    }
    else if (req.query['puter.auth.token']) {
        token = String(req.query['puter.auth.token']).trim();
    }
    if (!token && req.headers.referer) {
        try {
            const refererUrl = new URL(req.headers.referer);
            const refererToken = refererUrl.searchParams.get('puter.auth.token') ||
                refererUrl.searchParams.get('token') ||
                refererUrl.searchParams.get('auth_token');
            if (refererToken) {
                token = refererToken.trim();
                logger.info('[Whoami] Token extracted from Referer header', {
                    tokenPrefix: token.substring(0, 8) + '...'
                });
            }
        }
        catch (e) {
        }
    }
    logger.info('[Whoami] Request received', {
        hasUser: !!req.user,
        userWallet: req.user?.wallet_address,
        hasToken: !!token,
        tokenPrefix: token ? token.substring(0, 8) + '...' : null,
        hasAuthHeader: !!authHeader
    });
    if (!req.user && token) {
        const isMockToken = token.startsWith('mock-token-');
        let session = db.getSession(token);
        if (!session && isMockToken) {
            const pathToCheck = req.query.path ||
                req.query.file ||
                req.body?.path ||
                req.body?.file ||
                (req.headers.referer || '');
            let walletAddress = null;
            const walletMatch = pathToCheck.match(/\/0x([a-fA-F0-9]{40})/);
            if (walletMatch && walletMatch[1]) {
                walletAddress = '0x' + walletMatch[1];
            }
            if (walletAddress) {
                logger.info('[Whoami] Mock token detected, looking up session by wallet from path', {
                    walletPrefix: walletAddress.substring(0, 10) + '...'
                });
                session = db.getSessionByWallet(walletAddress);
                if (session) {
                    logger.info('[Whoami] Found session for mock token wallet', {
                        walletPrefix: walletAddress.substring(0, 10) + '...',
                        sessionTokenPrefix: session.token.substring(0, 8) + '...'
                    });
                    token = session.token;
                }
            }
            else {
                logger.warn('[Whoami] Mock token detected, no wallet in path, cannot determine user', {
                    pathToCheck: pathToCheck.substring(0, 100) + (pathToCheck.length > 100 ? '...' : ''),
                    message: 'Cannot use fallback session - would return wrong user. Returning unauthenticated state.'
                });
            }
        }
        if (session) {
            if (session.expires_at > Date.now()) {
                req.user = {
                    wallet_address: session.wallet_address,
                    smart_account_address: session.smart_account_address,
                    session_token: token
                };
                logger.info('[Whoami] Authenticated via token (no middleware)', {
                    wallet: session.wallet_address.substring(0, 10) + '...',
                    expiresAt: new Date(session.expires_at).toISOString(),
                    wasMockToken: isMockToken
                });
            }
            else {
                logger.warn('[Whoami] Session expired', {
                    tokenPrefix: token.substring(0, 8) + '...',
                    expiredAt: new Date(session.expires_at).toISOString(),
                    expiredBy: Math.round((Date.now() - session.expires_at) / 1000) + ' seconds'
                });
            }
        }
        else {
            logger.warn('[Whoami] Session not found for token', {
                tokenPrefix: token.substring(0, 8) + '...',
                tokenLength: token.length,
                isMockToken
            });
        }
    }
    if (!req.user) {
        logger.info('[Whoami] No user - returning unauthenticated state');
        res.json({
            username: null,
            address: null,
            is_owner: false,
            node_name: config?.server?.name || 'PC2 Node'
        });
        return;
    }
    const session = db.getSession(req.user.session_token);
    if (!session) {
        res.json({
            username: null,
            address: null,
            is_owner: false,
            node_name: config?.server?.name || 'PC2 Node'
        });
        return;
    }
    let user = db.getUser(req.user.wallet_address);
    if (!user) {
        db.createOrUpdateUser(req.user.wallet_address, req.user.smart_account_address || null);
        user = db.getUser(req.user.wallet_address);
        if (!user) {
            res.json({
                username: null,
                address: null,
                is_owner: false,
                node_name: config?.server?.name || 'PC2 Node'
            });
            return;
        }
    }
    const walletAddress = req.user.wallet_address || session.wallet_address;
    if (!walletAddress) {
        logger.error('[Whoami] Wallet address is null/undefined', {
            hasReqUser: !!req.user,
            reqUserWallet: req.user?.wallet_address,
            sessionWallet: session?.wallet_address
        });
        res.json({
            username: null,
            address: null,
            is_owner: false,
            node_name: config?.server?.name || 'PC2 Node'
        });
        return;
    }
    const userInfo = {
        id: 1,
        uuid: walletAddress,
        username: walletAddress,
        wallet_address: walletAddress,
        smart_account_address: req.user.smart_account_address || session.smart_account_address,
        email: null,
        email_confirmed: true,
        is_temp: false,
        taskbar_items: [],
        desktop_bg_url: '/images/flint-2.jpg',
        desktop_bg_color: null,
        desktop_bg_fit: 'cover',
        token: req.user.session_token,
        auth_type: (req.user.smart_account_address || session.smart_account_address) ? 'universalx' : 'wallet'
    };
    logger.info('[Whoami] Returning user info', {
        walletAddress,
        hasToken: !!req.user.session_token
    });
    res.json(userInfo);
}
//# sourceMappingURL=whoami.js.map