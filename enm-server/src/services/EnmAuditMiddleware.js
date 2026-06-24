/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmAuditMiddleware — per-route HTTP audit with sensitive-field redaction.
 *
 * PC2's auditMiddleware (pc2-node/src/api/audit.ts) only audits routes in its
 * AUDITED_ENDPOINTS whitelist and its sanitizeBody redaction list does NOT
 * cover our sensitive fields (rpcPassword, signature, antiSnipePassword,
 * encryptedPassword) — verified Rev 6 audit.
 *
 * We're a pure extension and cannot extend PC2's middleware (Rev 7 additive-only),
 * so we provide our own here. Applies to all our /extensions/elastos-node-manager/api/*
 * routes via routes/index.js.
 *
 * Captures the same fields PC2 captures (method, endpoint, status, duration)
 * for parity with the operator's existing audit experience.
 */

'use strict';

const { ENM_LOG_PREFIX, AUDIT_DECISION, HEALING_TIERS } = require('./EnmConstants');
const { append: appendAudit, redactSensitive } = require('./EnmAuditLog');
const { readActorWallet } = require('../auth/OwnerCheckMiddleware');

/**
 * Build the middleware. We need the extension handle to access the DB.
 *
 * @param {object} extensionHandle PC2 extension global
 * @returns {import('express').RequestHandler}
 */
function build(extensionHandle) {
    let cachedDb = null;
    function getDb() {
        if (!cachedDb) {
            cachedDb = extensionHandle.import('data').db;
        }
        return cachedDb;
    }

    return function enmAuditMiddleware(req, res, next) {
        const start = Date.now();

        // Skip GET requests — read-only routes don't need audit-log entries.
        // (HTTP-level access can still be inferred from PC2's own auditMiddleware
        // if the operator enables it for our path.)
        if (req.method === 'GET') {
            return next();
        }

        // Capture body BEFORE the handler may mutate it.
        const requestBody = req.body ? redactSensitive(req.body) : null;

        // Hook into response finish to record outcome.
        res.on('finish', () => {
            // beta.3.52 — only check that the request was authenticated; we no
            // longer propagate the PC2 wallet into the audit row. ENM keystore
            // and PC2 wallet are decoupled identities (the keystore identity
            // is the producer; PC2 wallet only gates access). Anonymous
            // mutations are skipped because the handler already 401'd.
            if (!readActorWallet(req)) {
                return;
            }

            const durationMs = Date.now() - start;
            const success = res.statusCode >= 200 && res.statusCode < 400;

            // beta.3.47 — audit table mock expects:
            //   Rule    column shows the HTTP route (e.g. "PUT /config/mainchain")
            //   Outcome column shows "<status> <text>" (e.g. "200 OK", "404 Not Found")
            // Pre-3.47 we wrote ruleId=null + outcome="success"/"failure", which
            // collapsed every HTTP-mutation row to an indistinct "—" / "success".
            // Now we surface the actual mutation shape so operators can scan
            // the audit page meaningfully.
            const routeRule = `${req.method} ${normalizeRoutePath(req.originalUrl || req.url || '')}`;
            const statusText = STATUS_TEXTS[res.statusCode] || '';
            const httpOutcome = statusText
                ? `${res.statusCode} ${statusText}`
                : String(res.statusCode);

            // Asynchronous fire-and-forget. Audit failure must not propagate to the
            // user response (already sent).
            //
            // beta.3.52 — walletAddress + executor are the literal 'operator'
            // label, never the PC2 wallet hex. ENM audit rows describe what THIS
            // node did, not which PC2 wallet authorized it. Auth gating is the
            // PC2 wallet's job (requireOwner middleware); past that point the
            // PC2 identity is not propagated into ENM's data model.
            Promise.resolve().then(() => appendAudit(getDb(), {
                walletAddress: 'operator',
                chainId: extractChainId(req) || 'system',
                ruleId: routeRule,
                tier: HEALING_TIERS.HTTP_MUTATION,
                decision: success ? AUDIT_DECISION.EXECUTED : AUDIT_DECISION.FAILED,
                executor: 'operator',
                outcome: httpOutcome,
                durationMs,
                payload: {
                    method: req.method,
                    endpoint: req.originalUrl || req.url,
                    statusCode: res.statusCode,
                    body: requestBody,
                },
            })).catch((err) => {
                extensionHandle.log.error(`${ENM_LOG_PREFIX} audit middleware write failed: ${err.message}`);
            });
        });

        return next();
    };
}

/**
 * Extract a chain id from the URL if present (e.g., /chains/mainchain/start).
 * Returns null if no chain context.
 *
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractChainId(req) {
    if (req.params && typeof req.params.chainId === 'string') {
        return req.params.chainId;
    }
    // Fallback: parse the URL path. Defence in depth — req.params depends on
    // the matched route shape.
    const url = req.originalUrl || req.url || '';
    const m = url.match(/\/chains\/([a-z0-9-]+)/i);
    return m ? m[1] : null;
}

/**
 * beta.3.47 — normalize the URL path for the audit ruleId column.
 * Strips the /api/enm prefix and replaces any chain-id segment with
 * ":chainId" so the audit log groups by route shape, not by every
 * distinct URL. Example:
 *   /api/enm/chains/mainchain/start  →  /chains/:chainId/start
 *   /api/enm/identity/reset          →  /identity/reset
 *   /api/enm/config/general?x=1      →  /config/general
 */
function normalizeRoutePath(rawUrl) {
    // Drop the API prefix.
    let p = String(rawUrl).replace(/^\/api\/enm/, '');
    // Drop the querystring.
    const qIdx = p.indexOf('?');
    if (qIdx >= 0) { p = p.slice(0, qIdx); }
    // Drop URL fragment.
    const hIdx = p.indexOf('#');
    if (hIdx >= 0) { p = p.slice(0, hIdx); }
    // Substitute chain-id segments. Match /chains/<id>/ where id is
    // [a-z0-9-]+; preserve everything after.
    p = p.replace(/\/chains\/[a-z0-9-]+/i, '/chains/:chainId');
    return p || '/';
}

// HTTP status texts we surface in the Outcome column. Minimal set —
// any status we don't recognise falls back to the bare numeric code.
//
// 0.5.117 audit Session 117 — corrected 412 text. RFC 7231 §6.5.10
// defines 412 as "Precondition Failed"; "Precondition Required" is
// 428 (RFC 6585 §3 — added later specifically for the required
// semantic). Pre-0.5.117 setup.js 412 responses (masterPassword
// missing) and maintenance.js 412 responses (chain busy) showed the
// wrong RFC text in the audit log's Outcome column. Added 428 too in
// case a future route uses the newer code.
const STATUS_TEXTS = Object.freeze({
    200: 'OK',
    201: 'Created',
    202: 'Accepted',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    412: 'Precondition Failed',
    428: 'Precondition Required',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    501: 'Not Implemented',
    503: 'Service Unavailable',
});

module.exports = {
    build,
};
