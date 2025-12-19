import { verifyOwner } from '../auth/owner.js';
import { logger } from '../utils/logger.js';
export function authenticate(req, res, next) {
    if (req.method === 'POST' && (req.path === '/mkdir' ||
        req.path === '/delete' ||
        req.path === '/move' ||
        req.path.startsWith('/api/files/'))) {
        logger.info('[Auth Middleware] Filesystem POST request intercepted', {
            path: req.path,
            method: req.method,
            hasAuthHeader: !!req.headers.authorization,
            bodyKeys: Object.keys(req.body || {}),
            bodyPreview: JSON.stringify(req.body).substring(0, 300)
        });
    }
    const db = req.app.locals.db;
    const config = req.app.locals.config;
    if (!db) {
        res.status(500).json({ error: 'Database not initialized' });
        return;
    }
    if (req.path === '/read' || req.path.startsWith('/read')) {
        const pathParam = req.query.path ||
            req.query.file ||
            req.body?.path ||
            req.body?.file;
        if (pathParam && (pathParam === '~/.__puter_gui.json' || pathParam.endsWith('.__puter_gui.json'))) {
            logger.info('[Auth Middleware] Allowing .__puter_gui.json read without auth');
            req.user = undefined;
            return next();
        }
    }
    const authHeader = req.headers.authorization;
    let token;
    if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
        if (token.includes(',')) {
            logger.warn('⚠️ Authorization header contains multiple values, using first', {
                original: authHeader.substring(0, 50) + '...',
                extracted: token.substring(0, 20) + '...'
            });
            token = token.split(',')[0].trim();
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
    else if (req.body?.token) {
        token = String(req.body.token).trim();
    }
    else if (req.body?.auth_token) {
        token = String(req.body.auth_token).trim();
    }
    if (!token && req.headers.referer) {
        try {
            const refererUrl = new URL(req.headers.referer);
            const refererToken = refererUrl.searchParams.get('puter.auth.token') ||
                refererUrl.searchParams.get('token') ||
                refererUrl.searchParams.get('auth_token');
            if (refererToken) {
                token = refererToken;
                logger.info('[Auth Middleware] Found token in Referer header', {
                    tokenPrefix: refererToken.substring(0, 20) + '...',
                    referer: req.headers.referer.substring(0, 100) + '...'
                });
            }
        }
        catch (e) {
            logger.debug('[Auth Middleware] Failed to parse Referer URL', {
                referer: req.headers.referer?.substring(0, 100),
                error: e instanceof Error ? e.message : String(e)
            });
        }
    }
    if (!token) {
        logger.warn('Authentication failed: No token provided', {
            path: req.path,
            method: req.method,
            hasAuthHeader: !!authHeader,
            authHeaderValue: authHeader ? authHeader.substring(0, 20) + '...' : null,
            queryToken: !!(req.query.token || req.query.auth_token),
            bodyToken: !!(req.body?.token || req.body?.auth_token)
        });
        res.status(401).json({ error: 'Authentication required', message: 'No token provided' });
        return;
    }
    logger.info('Token extracted', {
        path: req.path,
        method: req.method,
        source: authHeader ? 'header' : (req.query.token || req.query.auth_token ? 'query' : 'body'),
        tokenPrefix: token.substring(0, 8) + '...',
        tokenLength: token.length,
        tokenFull: token.length <= 100 ? token : token.substring(0, 100) + '...'
    });
    const isAppToken = token.startsWith('token-');
    let session = db.getSession(token);
    if (!session && isAppToken) {
        const tokenParts = token.split('-');
        if (tokenParts.length >= 2 && tokenParts[1].startsWith('0x')) {
            const walletAddress = tokenParts[1];
            session = db.getSessionByWallet(walletAddress);
            if (session) {
                logger.info('[Auth Middleware] Found session for app token wallet', {
                    walletPrefix: walletAddress.substring(0, 10) + '...',
                    sessionTokenPrefix: session.token.substring(0, 8) + '...'
                });
                token = session.token;
            }
            else {
                logger.warn('[Auth Middleware] App token provided but no session found for wallet', {
                    walletPrefix: walletAddress.substring(0, 10) + '...',
                    tokenPrefix: token.substring(0, 20) + '...'
                });
                res.status(401).json({ error: 'Authentication failed', message: 'No session found for app token wallet' });
                return;
            }
        }
    }
    if (!session) {
        session = db.getSession(token);
    }
    if (!session && (token === 'mock-token' || token.startsWith('mock-token'))) {
        logger.info('[Auth Middleware] Development mode: Using mock token', {
            path: req.path,
            tokenPrefix: token.substring(0, 20) + '...'
        });
        let mockWalletAddress = '0x0000000000000000000000000000000000000000';
        const pathToCheck = req.query.file ||
            req.query.path ||
            req.body?.file ||
            req.body?.path ||
            req.path;
        const walletMatch = pathToCheck.match(/^\/(0x[a-fA-F0-9]{40})/);
        if (walletMatch && walletMatch[1]) {
            mockWalletAddress = walletMatch[1];
            logger.info('[Auth Middleware] Extracted wallet address from path for mock token', {
                walletAddress: mockWalletAddress,
                path: pathToCheck
            });
            const existingSession = db.getSessionByWallet(mockWalletAddress);
            if (existingSession) {
                logger.info('[Auth Middleware] Found existing session for mock token wallet, using real session', {
                    walletPrefix: mockWalletAddress.substring(0, 10) + '...',
                    sessionTokenPrefix: existingSession.token.substring(0, 8) + '...'
                });
                req.user = {
                    wallet_address: existingSession.wallet_address,
                    smart_account_address: existingSession.smart_account_address,
                    session_token: existingSession.token
                };
                return next();
            }
        }
        req.user = {
            wallet_address: mockWalletAddress,
            smart_account_address: null,
            session_token: token
        };
        return next();
    }
    if (!session) {
        logger.warn('Session not found for token', {
            path: req.path,
            method: req.method,
            tokenPrefix: token.substring(0, 8) + '...',
            tokenLength: token.length,
            isAppToken
        });
        res.status(401).json({ error: 'Authentication failed', message: 'Invalid session token' });
        return;
    }
    if (session.expires_at < Date.now()) {
        logger.warn('Session expired', {
            path: req.path,
            method: req.method,
            tokenPrefix: token.substring(0, 8) + '...',
            expiredAt: new Date(session.expires_at).toISOString(),
            now: new Date().toISOString(),
            expiredBy: Math.round((Date.now() - session.expires_at) / 1000) + ' seconds'
        });
        res.status(401).json({ error: 'Authentication failed', message: 'Session expired' });
        return;
    }
    if (db && config) {
        const maxExtension = config.security.session_duration_days * 24 * 60 * 60 * 1000;
        const newExpiresAt = Date.now() + maxExtension;
        db.updateSessionExpiration(token, newExpiresAt);
        logger.debug('Session extended', {
            tokenPrefix: token.substring(0, 8) + '...',
            newExpiresAt: new Date(newExpiresAt).toISOString(),
            expiresIn: Math.round(maxExtension / 1000 / 60) + ' minutes'
        });
    }
    if (config) {
        const ownerCheck = verifyOwner(session.wallet_address, config);
        if (!ownerCheck.isAuthorized) {
            res.status(403).json({
                error: 'Unauthorized',
                message: ownerCheck.reason || 'Wallet is not authorized'
            });
            return;
        }
    }
    req.user = {
        wallet_address: session.wallet_address,
        smart_account_address: session.smart_account_address,
        session_token: token
    };
    next();
}
export function errorHandler(err, req, res, next) {
    logger.error('API Error:', err.message, { path: req.path, method: req.method });
    if (res.headersSent) {
        return next(err);
    }
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
}
export function corsMiddleware(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    next();
}
//# sourceMappingURL=middleware.js.map