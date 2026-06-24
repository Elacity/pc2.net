/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * OwnerCheckMiddleware — wallet-gated route protection for the standalone
 * enm-server.
 *
 * The original extension version (Rev 7) read req.actor from Puter's auth
 * middleware. We're not running inside Puter anymore — we're a sidecar that
 * shares pc2-node's session storage. So we read the wallet from pc2-node's
 * sessions table directly:
 *
 *   1. Extract Bearer token from Authorization header (matches how pc2-node's
 *      own middleware extracts tokens — see pc2-node/src/api/middleware.ts:86).
 *   2. Look up the token in pc2-node's SQLite sessions table (read-only mount
 *      at PC2_NODE_DB_PATH, defaults to /data/pc2-node/pc2.db).
 *   3. Verify expiration; cache the lookup briefly to avoid hitting SQLite
 *      on every request burst.
 *   4. Return the wallet_address.
 *
 * For ownership checks we compare the requester's wallet against pc2-node's
 * own owner record stored in node-config.json (path PC2_NODE_CONFIG_PATH,
 * defaults to /data/pc2-node/node-config.json). The operator claims pc2-node
 * ownership first via the desktop's wallet-connect flow; ENM inherits that
 * owner record. No second claim, no separate owner DB.
 *
 * Address comparison: case-insensitive for hex (EVM); exact match for non-hex
 * (Solana, ed25519 etc.). Same model the old extension used.
 *
 * --- ARCHITECTURAL INVARIANT ---
 *
 * The wallet here is **identity-only**. ENM never asks the operator's
 * browser wallet to sign anything. The Elastos mainchain is a UTXO chain
 * (not EVM) — its transactions are signed by `keystore.dat` on the server
 * via `ela-cli`, never by a browser wallet. The only thing this wallet
 * address does is:
 *
 *   1. prove the requester is the same wallet that claimed pc2-node, AND
 *   2. attribute audit log entries to a stable identity.
 *
 * Future EVM features (ESC sidechain, cross-chain bridges) will live in a
 * SEPARATE namespace under /api/enm/evm/* (v0.5+) and may use the wallet
 * for actual signing. That namespace must NOT leak into this middleware.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const { ENM_LOG_PREFIX, errorBody } = require('../services/EnmConstants');

const PC2_NODE_DB_PATH = process.env.PC2_NODE_DB_PATH || '/data/pc2-node/pc2.db';
const PC2_NODE_CONFIG_PATH = process.env.PC2_NODE_CONFIG_PATH || '/data/pc2-node/node-config.json';
const SESSION_CACHE_TTL_MS = 5_000;
const OWNER_CACHE_TTL_MS = 30_000;

let dbHandle = null;
function getDb() {
    if (dbHandle) return dbHandle;
    if (!fs.existsSync(PC2_NODE_DB_PATH)) {
        throw new Error(`pc2-node session DB not found at ${PC2_NODE_DB_PATH} — is the bind-mount configured?`);
    }
    // Read-only with file_must_exist guard. WAL mode left to pc2-node.
    dbHandle = new Database(PC2_NODE_DB_PATH, { readonly: true, fileMustExist: true });
    return dbHandle;
}

/** P1 (v0.5.182) — drop the cached read-only handle so the next getDb() reopens.
 *  Called when a query errors because pc2-node rotated/replaced pc2.db. */
function _closeDb() {
    if (dbHandle) {
        try { dbHandle.close(); } catch (_) { /* already gone */ }
        dbHandle = null;
    }
}

/** @type {Map<string, { wallet: string|null, fetchedAt: number }>} */
const sessionCache = new Map();
// P1 (v0.5.182) — cap the session cache. It's keyed by raw token (incl. every
// invalid/garbage token, cached as null), so without a bound it grows forever
// under token rotation or a token-spray → memory leak. 5k entries × 5s TTL is
// plenty for a real fleet's working set.
const MAX_SESSION_CACHE = 5000;
function _sessionCacheSet(token, wallet, now) {
    if (sessionCache.size >= MAX_SESSION_CACHE) {
        for (const [k, v] of sessionCache) {
            if (now - v.fetchedAt >= SESSION_CACHE_TTL_MS) { sessionCache.delete(k); }
        }
        while (sessionCache.size >= MAX_SESSION_CACHE) {
            const oldest = sessionCache.keys().next().value; // insertion order = oldest
            if (oldest === undefined) { break; }
            sessionCache.delete(oldest);
        }
    }
    sessionCache.set(token, { wallet, fetchedAt: now });
}

/**
 * Extract Bearer token, look up session in pc2-node's DB, return wallet.
 * Returns null if no token, expired, or not found.
 *
 * Token sources matched to pc2-node's own middleware (middleware.ts:80-107):
 *   - Authorization: Bearer <token>
 *   - ?token= query param
 *   - ?auth_token= query param
 *   - ?puter.auth.token= query param (set when desktop launches an app iframe)
 */
function extractToken(req) {
    const authHeader = req.headers && req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7).trim().split(',')[0].trim();
    }
    if (req.query) {
        const q = req.query;
        if (q.token) return String(q.token).trim();
        if (q.auth_token) return String(q.auth_token).trim();
        if (q['puter.auth.token']) return String(q['puter.auth.token']).trim();
    }
    return null;
}

/**
 * Resolve a Bearer token to a wallet address by querying pc2-node's sessions
 * table. Cached for SESSION_CACHE_TTL_MS so the auth middleware doesn't pound
 * SQLite on every fetch in a burst.
 */
function resolveWalletFromToken(token) {
    if (!token) return null;

    const cached = sessionCache.get(token);
    const now = Date.now();
    if (cached && (now - cached.fetchedAt) < SESSION_CACHE_TTL_MS) {
        return cached.wallet;
    }

    let wallet = null;
    // P1 (v0.5.182) — retry once with a fresh handle. The cached read-only handle
    // goes stale if pc2-node rotates/replaces pc2.db (restart, vacuum, restore);
    // without a reopen, EVERY operator gets 401'd until enm-server restarts
    // (node-wide auth outage). Drop + reopen on error, retry once.
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const db = getDb();
            const row = db.prepare(
                'SELECT wallet_address, expires_at FROM sessions WHERE token = ?'
            ).get(token);
            if (row && row.expires_at > now) {
                wallet = row.wallet_address;
            }
            break; // success
        } catch (err) {
            _closeDb();
            if (attempt === 0) { continue; } // reopen + retry once
            // Cache the null result briefly so we don't hammer the DB on a known-bad path.
            _sessionCacheSet(token, null, now);
            throw err;
        }
    }

    _sessionCacheSet(token, wallet, now);
    return wallet;
}

/**
 * Public: returns the wallet of the authenticated requester, or null.
 * Used by routes that need to know "who is this" without enforcing owner.
 */
function readActorWallet(req) {
    const token = extractToken(req);
    if (!token) return null;
    try {
        return resolveWalletFromToken(token);
    } catch (err) {
        // Fail closed on auth lookup errors.
        return null;
    }
}

/** @type {{ ownerWallet: string|null, mtimeMs: number, loadedAt: number }} */
let cachedOwner = null;

/**
 * Read pc2-node's owner wallet from node-config.json. Cached for
 * OWNER_CACHE_TTL_MS plus invalidated on mtime change so an operator
 * who re-claims doesn't have to wait for cache expiry.
 */
function readNodeOwner() {
    let stat;
    try {
        stat = fs.statSync(PC2_NODE_CONFIG_PATH);
    } catch (err) {
        // No config yet means no owner claimed yet.
        return null;
    }
    const now = Date.now();
    if (
        cachedOwner &&
        cachedOwner.mtimeMs === stat.mtimeMs &&
        (now - cachedOwner.loadedAt) < OWNER_CACHE_TTL_MS
    ) {
        return cachedOwner.ownerWallet;
    }
    const raw = fs.readFileSync(PC2_NODE_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    cachedOwner = {
        ownerWallet: parsed.ownerWallet || null,
        mtimeMs: stat.mtimeMs,
        loadedAt: now,
    };
    return cachedOwner.ownerWallet;
}

/**
 * Case-insensitive hex compare for EVM addresses, exact compare otherwise.
 * Mirrors the original extension's logic so non-EVM wallet types still match.
 */
function walletsEqual(a, b) {
    if (!a || !b) return false;
    const isHex = /^0x[0-9a-fA-F]+$/.test(a) && /^0x[0-9a-fA-F]+$/.test(b);
    return isHex ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * Express middleware: enforces that the request comes from pc2-node's owner.
 *   - 401 if no auth.
 *   - 403 if authenticated wallet doesn't match the owner record.
 *   - 503 if no owner has been claimed yet on pc2-node (operator must
 *     complete pc2-node setup before ENM is usable).
 */
function requireOwner(req, res, next) {
    const wallet = readActorWallet(req);
    if (!wallet) {
        return res.status(401).json(errorBody('Authentication required.'));
    }

    let owner;
    try {
        owner = readNodeOwner();
    } catch (err) {
        return res.status(500).json(errorBody(`Owner check failed: ${err.message}`));
    }

    if (!owner) {
        return res.status(503).json(errorBody(
            'pc2-node has not yet been claimed. Complete the wallet-claim flow on the PC2 dashboard first.'
        ));
    }

    if (!walletsEqual(wallet, owner)) {
        return res.status(403).json(errorBody('You are not the owner of this PC2 node.'));
    }

    // Stash for downstream handlers (routes use this for audit logging etc).
    req.actorWallet = wallet;
    req.user = req.user || {};
    req.user.wallet_address = wallet;
    return next();
}

module.exports = {
    requireOwner,
    readActorWallet,
    // ChainRegistry needs the owner wallet for self-healing audit attribution
    // when no operator request is in flight (cron sweepers etc).
    readNodeOwner,
    // Exported for tests.
    _walletsEqual: walletsEqual,
};
