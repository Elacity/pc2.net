/**
 * API Middleware
 *
 * Authentication and error handling middleware
 */

import { Request, Response, NextFunction } from 'express';
import type { DatabaseManager } from '../storage/database.js';
import { Config } from '../config/loader.js';
import { verifyOwner } from '../auth/owner.js';
import { logger } from '../utils/logger.js';
import { normalizeAddress, compareAddresses } from '../utils/wallet.js';
import { createHash } from 'crypto';
import { getNodeConfig } from './setup.js';
import { isRequestInScope } from './middleware/scope-check.js';

export interface AuthenticatedRequest extends Request {
    user?: {
        wallet_address: string;
        smart_account_address: string | null;
        session_token: string;
        /**
     * SEC-3c (2026-04 audit): when present, this session is resource-bound
     * (e.g. 'file' for /open_item iframe-app sessions). requireOwner and
     * other privilege checks MUST refuse scoped sessions even if the
     * underlying wallet matches the node owner.
     */
        session_scope?: string | null;
    };
    apiKey?: {
        key_id: string;
        wallet_address: string;
        scopes: string[];
        name: string;
    };
    principal?: CapabilityPrincipal;
}

/**
 * Structured auth principal with typed capabilities.
 * v1: user sessions get FULL_CAPABILITY_SET (backward compatible).
 * v2+: apps receive only their declared manifest capabilities.
 * Maps to ElastOS Runtime capability tokens.
 */
export interface CapabilityPrincipal {
    type: 'user' | 'apiKey' | 'app';
    wallet_address: string;
    scopes: string[];
}

/**
 * Authentication middleware
 * Verifies session token and attaches user to request
 */
export function authenticate(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): void {
    // Log all POST requests to filesystem endpoints for debugging
    if (req.method === 'POST' && (
        req.path === '/mkdir' ||
        req.path === '/delete' ||
        req.path === '/move' ||
        req.path === '/writeFile' ||
        req.path.startsWith('/api/files/')
    )) {
        logger.info('[Auth Middleware] Filesystem POST request intercepted', {
            path: req.path,
            method: req.method,
            query: req.query,
            hasAuthHeader: !!req.headers.authorization,
            bodyKeys: Object.keys(req.body || {}),
            bodyPreview: JSON.stringify(req.body).substring(0, 300),
        });
    }

    const db = (req.app.locals.db as DatabaseManager | undefined);
    const config = (req.app.locals.config as Config | undefined);

    if (!db) {
        res.status(500).json({ error: 'Database not initialized' });
        return;
    }

    // Special case: Allow /read requests for .__puter_gui.json without auth
    // This is critical for Puter GUI initialization (matching mock server behavior)
    if (req.path === '/read' || req.path.startsWith('/read')) {
        const pathParam = (req.query.path as string) ||
            (req.query.file as string) ||
            (req.body?.path as string) ||
            (req.body?.file as string);
        if (pathParam && (pathParam === '~/.__puter_gui.json' || pathParam.endsWith('.__puter_gui.json'))) {
            logger.info('[Auth Middleware] Allowing .__puter_gui.json read without auth');
            // Set req.user to undefined but allow request to proceed
            req.user = undefined;
            return next();
        }
    }

    // Get token from Authorization header, query, or body
    // Also check for auth_token in query params (SDK sometimes uses URL-based auth)
    // CRITICAL: Also check Referer header (for app iframes) - matching mock server behavior
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim(); // Remove "Bearer " prefix and trim whitespace
        // Check if token contains comma (multiple values) - take first one
        if (token.includes(',')) {
            logger.warn('⚠️ Authorization header contains multiple values, using first', {
                original: `${authHeader.substring(0, 50)}...`,
                extracted: `${token.substring(0, 20)}...`,
            });
            token = token.split(',')[0].trim();
        }
    } else if (req.query.token) {
        token = String(req.query.token).trim();
    } else if (req.query.auth_token) {
        token = String(req.query.auth_token).trim();
    } else if (req.query['puter.auth.token']) {
        // Check for puter.auth.token in query (common in app iframe URLs)
        token = String(req.query['puter.auth.token']).trim();
    } else if (req.body?.token) {
        token = String(req.body.token).trim();
    } else if (req.body?.auth_token) {
        token = String(req.body.auth_token).trim();
    }

    // CRITICAL FIX: Check Referer header for token (matching mock server behavior)
    // App iframes (viewer, player) pass token in URL params, which appear in Referer header
    if (!token && req.headers.referer) {
        try {
            const refererUrl = new URL(req.headers.referer);
            const refererToken = refererUrl.searchParams.get('puter.auth.token') ||
                refererUrl.searchParams.get('token') ||
                refererUrl.searchParams.get('auth_token');
            if (refererToken) {
                token = refererToken;
                logger.info('[Auth Middleware] Found token in Referer header', {
                    tokenPrefix: `${refererToken.substring(0, 20)}...`,
                    referer: `${req.headers.referer.substring(0, 100)}...`,
                });
            }
        } catch (e) {
            // Invalid Referer URL, continue without token
            logger.debug('[Auth Middleware] Failed to parse Referer URL', {
                referer: req.headers.referer?.substring(0, 100),
                error: e instanceof Error ? e.message : String(e),
            });
        }
    }

    // Check for API key authentication (X-API-Key header)
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
    if (apiKeyHeader && !token) {
        // Hash the API key to compare with stored hash
        const keyHash = createHash('sha256').update(apiKeyHeader).digest('hex');
        const apiKeyRecord = db.getApiKeyByHash(keyHash);

        if (apiKeyRecord) {
            // Check if key is revoked
            if (apiKeyRecord.revoked) {
                res.status(401).json({ error: 'API key revoked' });
                return;
            }

            // Check if key is expired
            if (apiKeyRecord.expires_at && apiKeyRecord.expires_at < Date.now()) {
                res.status(401).json({ error: 'API key expired' });
                return;
            }

            // Update last used timestamp
            db.updateApiKeyLastUsed(apiKeyRecord.key_id);

            // Set user and apiKey on request
            req.user = {
                wallet_address: apiKeyRecord.wallet_address,
                smart_account_address: null,
                session_token: `apikey-${apiKeyRecord.key_id}`,
            };
            req.apiKey = {
                key_id: apiKeyRecord.key_id,
                wallet_address: apiKeyRecord.wallet_address,
                scopes: apiKeyRecord.scopes.split(','),
                name: apiKeyRecord.name,
            };

            logger.info('[Auth Middleware] API key authenticated', {
                keyId: apiKeyRecord.key_id,
                name: apiKeyRecord.name,
                walletPrefix: `${apiKeyRecord.wallet_address.substring(0, 10)}...`,
                scopes: apiKeyRecord.scopes,
            });

            return next();
        } else {
            logger.warn('[Auth Middleware] Invalid API key', {
                path: req.path,
                method: req.method,
                keyPrefix: `${apiKeyHeader.substring(0, 8)}...`,
            });
            res.status(401).json({ error: 'Invalid API key' });
            return;
        }
    }

    // Log for debugging (remove in production)
    if (!token) {
        logger.warn('Authentication failed: No token provided', {
            path: req.path,
            method: req.method,
            hasAuthHeader: !!authHeader,
            authHeaderValue: authHeader ? `${authHeader.substring(0, 20)}...` : null,
            queryToken: !!(req.query.token || req.query.auth_token),
            bodyToken: !!(req.body?.token || req.body?.auth_token),
        });
        res.status(401).json({ error: 'Authentication required', message: 'No token provided' });
        return;
    }

    // Log successful token extraction (for debugging)
    logger.debug('Token extracted', {
        path: req.path,
        method: req.method,
        source: authHeader ? 'header' : (req.query.token || req.query.auth_token ? 'query' : 'body'),
        tokenPrefix: `${token.substring(0, 8)}...`,
        tokenLength: token.length,
        tokenFull: token.length <= 100 ? token : `${token.substring(0, 100)}...`, // Log full token if short, truncated if long
    });

    // SEC-3c (2026-04 audit): the previous implementation accepted two
    // dangerous token formats here:
    //   1. `token-0x{walletAddress}-...` -> trusted the path-derived wallet
    //      address and looked up *any* session for that wallet. An attacker
    //      who knew a victim wallet could mint a fake app token and inherit
    //      the victim's session.
    //   2. `mock-token-...` -> walked req.query/path/body for an `0x{40hex}`
    //      substring and used db.getSessionByWallet() on whatever it found.
    //      Any attacker controlling any URL parameter could pin themselves
    //      to any user's active session.
    // Both branches have been removed. All tokens MUST be real session tokens
    // looked up via db.getSession(token). Iframe-app tokens minted by
    // /open_item are now real scope='file' sessions (see api/other.ts) and
    // are validated below via isRequestInScope().
    const session = db.getSession(token);

    if (!session) {
        logger.warn('Session not found for token', {
            path: req.path,
            method: req.method,
            tokenPrefix: `${token.substring(0, 8)}...`,
            tokenLength: token.length,
        });
        res.status(401).json({ error: 'Authentication failed', message: 'Invalid session token' });
        return;
    }

    // Check expiration
    if (session.expires_at < Date.now()) {
        logger.warn('Session expired', {
            path: req.path,
            method: req.method,
            tokenPrefix: `${token.substring(0, 8)}...`,
            expiredAt: new Date(session.expires_at).toISOString(),
            now: new Date().toISOString(),
            expiredBy: `${Math.round((Date.now() - session.expires_at) / 1000)} seconds`,
        });
        res.status(401).json({ error: 'Authentication failed', message: 'Session expired' });
        return;
    }

    // SEC-3c (2026-04 audit): scope enforcement for resource-bound sessions.
    // Sessions minted by /open_item carry scope='file' + scope_data; the
    // helper validates that this request is targeting that exact file.
    // Unrestricted sessions (scope == null) pass through unchanged.
    if (session.scope) {
        const inScope = isRequestInScope(session, {
            query: req.query as { uid?: string; file?: string; path?: string },
            body: req.body as { uid?: string; file?: string; path?: string } | undefined,
            path: req.path,
        });
        if (!inScope) {
            logger.warn('[Auth Middleware] Scoped session rejected: request out of scope', {
                sessionScope: session.scope,
                reqPath: req.path,
                method: req.method,
                tokenPrefix: `${token.substring(0, 8)}...`,
            });
            res.status(403).json({
                error: 'Forbidden',
                message: 'Session not authorized for this resource',
            });
            return;
        }
    }

    // Extend session on activity (refresh expiration time).
    // Scoped sessions (SEC-3c) are intentionally NOT extended — they are
    // short-lived per design and must expire on schedule.
    if (db && config && !session.scope) {
        const maxExtension = config.security.session_duration_days * 24 * 60 * 60 * 1000;
        const newExpiresAt = Date.now() + maxExtension;
        db.updateSessionExpiration(token, newExpiresAt);
        logger.debug('Session extended', {
            tokenPrefix: `${token.substring(0, 8)}...`,
            newExpiresAt: new Date(newExpiresAt).toISOString(),
            expiresIn: `${Math.round(maxExtension / 1000 / 60)} minutes`,
        });
    }

    // Verify owner (if config is available)
    if (config) {
        const ownerCheck = verifyOwner(session.wallet_address, config);
        if (!ownerCheck.isAuthorized) {
            res.status(403).json({
                error: 'Unauthorized',
                message: ownerCheck.reason || 'Wallet is not authorized',
            });
            return;
        }
    }

    // Attach user to request
    req.user = {
        wallet_address: session.wallet_address,
        smart_account_address: session.smart_account_address,
        session_token: token,
        session_scope: session.scope ?? null,
    };

    next();
}

/**
 * Error handling middleware
 */
export function errorHandler(
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    logger.error('API Error:', err.message, { path: req.path, method: req.method });

    if (res.headersSent) {
        return next(err);
    }

    const errorResponse: any = {
        success: false,
        error: err.message || 'Internal server error',
        errorName: err.name,
    };

    // Include stack trace in development
    if (process.env.NODE_ENV === 'development') {
        errorResponse.details = err.stack?.substring(0, 1000);
    }

    res.status(500).json(errorResponse);
}

/**
 * Require owner middleware
 * Ensures the authenticated user is the node owner
 * Must be used after authenticate middleware
 * Supports both EVM and Solana addresses
 */
export function requireOwner(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): void {
    const nodeConfig = getNodeConfig();
    const config = (req.app.locals.config as Config | undefined);

    if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    // SEC-3c (2026-04 audit): scoped sessions are NEVER owners. A scope='file'
    // session minted by /open_item is bound to one resource; even if the
    // underlying wallet matches the node owner, this token type must not be
    // accepted as proof of owner intent. The authenticate middleware would
    // already 403 such a request when paired with isRequestInScope (since
    // owner endpoints carry no uid/file/path matching the scope), but
    // requireOwner is the last line of defense if a future route order
    // changes that ordering.
    if (req.user.session_scope) {
        logger.warn('[Auth] Scoped session attempted owner-only action', {
            sessionScope: req.user.session_scope,
            path: req.path,
        });
        res.status(403).json({ error: 'Owner access required' });
        return;
    }

    // Normalize user wallet (EVM lowercase, Solana as-is)
    const userWallet = normalizeAddress(req.user.wallet_address);

    // Check dynamic node config first (ownerWallet), then static config
    // Owner wallets are already normalized when stored
    const ownerWallet = nodeConfig.ownerWallet || config?.owner?.wallet_address;

    // Use compareAddresses for proper EVM/Solana comparison
    if (!ownerWallet || !compareAddresses(userWallet, ownerWallet)) {
        logger.warn('[Auth] Non-owner attempted restricted action', {
            userWallet: `${userWallet.substring(0, 10)}...`,
            ownerWallet: ownerWallet ? `${ownerWallet.substring(0, 10)}...` : 'not set',
        });
        res.status(403).json({ error: 'Owner access required' });
        return;
    }

    next();
}

/**
 * CORS middleware (already handled by Express, but for consistency)
 */
export function corsMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const origin = req.headers.origin || '';
    // SEC-CORS-AUDIT (2026-04 audit): SIWE/session cookies travel cross-origin
    // for *.ela.city + *.ela.local; these must be explicitly trusted so the
    // browser will deliver Authorization headers. Other origins still pass
    // through with `*` for legacy public reads, but credentialed requests
    // require an exact echo (handled by Access-Control-Allow-Credentials only
    // when origin matches the allowlist below).
    const allowed =
        !origin ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('https://localhost') ||
        origin.includes('.puter.localhost') ||
        origin.includes('.puter.me') ||
        origin.includes('.puter.site') ||
        origin.includes('.ela.city') ||
        origin.includes('.ela.local');

    if (allowed) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

    if (req.method === 'OPTIONS') {
        res.status(allowed ? 200 : 403).end();
        return;
    }

    next();
}

/**
 * Capability-aware middleware factory.
 * Checks that req.principal has the required scope before allowing access.
 *
 * In v1, this is advisory — user sessions get all scopes by default.
 * Wire on sensitive routes (e.g. DRM, wallet) as the first enforcement points.
 * In v2+, apps will only have their manifest-declared scopes.
 *
 * Usage: router.post('/lit/secure-view', authenticate, requireCapability('drm:decrypt'), handler)
 */
export function requireCapability(scope: string) {
    return function (req: AuthenticatedRequest, res: Response, next: NextFunction): void {
        if (!req.principal) {
            logger.warn('[Capability] No principal on request — authenticate middleware may be missing', {
                path: req.path,
                requiredScope: scope,
            });
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        if (!req.principal.scopes.includes(scope)) {
            logger.warn('[Capability] Scope denied', {
                path: req.path,
                principalType: req.principal.type,
                requiredScope: scope,
                grantedScopes: req.principal.scopes.join(', '),
            });
            res.status(403).json({
                error: 'Insufficient capabilities',
                required: scope,
                granted: req.principal.scopes,
            });
            return;
        }

        next();
    };
}

/**
 * Populates req.principal from req.user / req.apiKey.
 * Call after authenticate(). Separates auth (who are you?) from
 * authorization (what can you do?).
 *
 * v1 behavior: user sessions receive all scopes. API keys receive
 * their declared scopes. This ensures zero breakage.
 */
export function populatePrincipal(
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction,
): void {
    if (req.apiKey) {
        req.principal = {
            type: 'apiKey',
            wallet_address: req.apiKey.wallet_address,
            scopes: req.apiKey.scopes,
        };
    } else if (req.user) {
        req.principal = {
            type: 'user',
            wallet_address: req.user.wallet_address,
            scopes: [
                'storage:read', 'storage:write',
                'ipfs:fetch', 'ipfs:pin',
                'wallet:read', 'wallet:sign',
                'drm:decrypt', 'drm:encrypt',
                'compute:wasm', 'compute:ai',
                'network:rpc',
                'ipc:launch', 'ipc:message',
                'identity:auth',
            ],
        };
    }

    next();
}
