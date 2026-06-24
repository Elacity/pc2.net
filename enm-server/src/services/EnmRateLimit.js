/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmRateLimit — per-route in-process rate limiting.
 *
 * PC2's global rate limiter (pc2-node/src/api/rate-limit.ts) only fires for
 * routes registered before its mount point AND only knows about endpoints in
 * its hardcoded path-to-scope map (Rev 4 audit). Since we're an extension
 * mounting our own routes, we cannot extend PC2's map without core changes
 * (Rev 7 additive-only constraint).
 *
 * We implement a small fixed-window counter per (wallet, endpoint, scope).
 * Three scopes match PC2's intent (Rev 5 audit recommendation):
 *   read    — 100 req/min  (GET routes)
 *   write   —  60 req/min  (POST /chains/<id>/start, restart, stop, generic mutations)
 *   admin   —  10 req/min  (POST /healing/confirm/<id>, PUT /config/<id>)
 *
 * Memory bounded: stale buckets are pruned every 60s. Keys never persisted —
 * lost on restart, which is the right behaviour for transient request limiters.
 */

'use strict';

const { errorBody } = require('./EnmConstants');
const { readActorWallet } = require('../auth/OwnerCheckMiddleware');

const SCOPE_LIMITS = Object.freeze({
    read:  { max: 100, windowMs: 60_000 },
    write: { max:  60, windowMs: 60_000 },
    admin: { max:  10, windowMs: 60_000 },
});

/** @type {Map<string, { count: number, resetAt: number }>} */
const buckets = new Map();
let pruneTimer = null;

/** Start the periodic pruner once. Idempotent. */
function ensurePrunerRunning() {
    if (pruneTimer) {
        return;
    }
    pruneTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, bucket] of buckets.entries()) {
            if (bucket.resetAt < now) {
                buckets.delete(key);
            }
        }
    }, 60_000);
    // Don't keep the event loop alive just for pruning.
    if (typeof pruneTimer.unref === 'function') {
        pruneTimer.unref();
    }
}

/**
 * Build a middleware enforcing the given scope.
 *
 * @param {'read'|'write'|'admin'} scope
 * @returns {import('express').RequestHandler}
 */
function limit(scope) {
    const cfg = SCOPE_LIMITS[scope];
    if (!cfg) {
        throw new Error(`EnmRateLimit.limit: unknown scope "${scope}"`);
    }
    ensurePrunerRunning();

    return function enmRateLimitMiddleware(req, res, next) {
        // SECURITY NOTE: When falling back to req.ip for unauthenticated requests, the
        // value depends on PC2's Express `trust proxy` setting. PC2 itself does not set
        // this in pc2-node/src/server.ts (audit Rev 6). If PC2 is later run behind an
        // untrusted reverse proxy without `app.set('trust proxy', N)`, X-Forwarded-For
        // could be spoofed and an attacker could bypass per-IP limits. For v0.1, our
        // routes always require auth (requireOwner) before mutations, so the wallet is
        // always present and the IP fallback is read-only / dev-mode only. Phase 2
        // should verify PC2's deployment-time proxy config or document the assumption.
        const wallet = readActorWallet(req) || `anon:${req.ip || 'unknown'}`;
        const endpoint = (req.route && req.route.path) || req.path || 'unknown';
        const key = `${scope}|${wallet}|${endpoint}`;

        const now = Date.now();
        let bucket = buckets.get(key);
        if (!bucket || bucket.resetAt < now) {
            bucket = { count: 0, resetAt: now + cfg.windowMs };
            buckets.set(key, bucket);
        }

        bucket.count += 1;
        const remaining = Math.max(cfg.max - bucket.count, 0);

        res.setHeader('X-RateLimit-Limit', String(cfg.max));
        res.setHeader('X-RateLimit-Remaining', String(remaining));
        res.setHeader('X-RateLimit-Reset', String(Math.floor(bucket.resetAt / 1000)));

        if (bucket.count > cfg.max) {
            const retryAfter = Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1);
            res.setHeader('Retry-After', String(retryAfter));
            // 0.5.110 audit Session 110 — operator-friendly copy. Pre-
            // 0.5.110 the body leaked the internal scope name verbatim
            // ("Rate limit exceeded for read scope") which is jargon —
            // operators don't know what a "scope" is. The rewritten copy
            // names the request shape ("requests"), the limit ("100/min"),
            // and the next-try window in plain seconds, matching the
            // Retry-After header for callers that prefer structured data.
            return res.status(429).json(errorBody(
                `Too many requests (limit: ${cfg.max} per minute). Try again in ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`,
            ));
        }

        return next();
    };
}

/** @internal — for tests only */
function _resetForTests() {
    buckets.clear();
    if (pruneTimer) {
        clearInterval(pruneTimer);
        pruneTimer = null;
    }
}

module.exports = {
    limit,
    SCOPE_LIMITS,
    _resetForTests,
};
