/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmAuditLog — append-only event log writer.
 *
 * Writes ONLY on:
 *   - Healing decisions (proposed / confirmed / rejected / executed / failed)
 *   - State transitions (Healthy → Degraded → Critical → Healing → Healthy)
 *   - Config changes
 *   - Owner-confirms answered
 *   - Notifications acknowledged
 *
 * Does NOT write on every health-poll tick (Rev 4 audit: would generate ~17k
 * rows/day per chain and serve no purpose). Worst-case real volume: ~96 rows/day.
 *
 * Schema is in EnmDb.initSchema().
 *
 * Reads use a separate query helper for the audit-tab UI.
 */

'use strict';

const { AUDIT_DECISION, ENM_LOG_PREFIX } = require('./EnmConstants');

/**
 * @typedef {object} AuditEntry
 * @property {string} walletAddress  who triggered (operator wallet, lowercased EVM)
 * @property {string} chainId        e.g. "mainchain"
 * @property {string} [ruleId]       F1, F2, ..., or null for non-healing events
 * @property {string} tier           AUTOMATED-SAFE | OWNER-CONFIRMS | CRITICAL-NOTIFY | NEVER-AUTOMATIC
 * @property {string} decision       proposed | confirmed | rejected | executed | failed | manual-only
 * @property {string} executor       'system' or wallet DID
 * @property {string} [outcome]      'success' | 'failure' | 'timeout' | etc.
 * @property {number} [durationMs]
 * @property {object} [payload]      JSON-serializable extra context (redacted before write)
 */

/**
 * @param {object} db extension.import('data').db
 * @param {AuditEntry} entry
 * @returns {Promise<number>} inserted row id
 */
async function append(db, entry) {
    if (!db || typeof db.write !== 'function') {
        throw new Error('EnmAuditLog.append: invalid db handle');
    }
    if (!entry || !entry.walletAddress || !entry.chainId || !entry.tier || !entry.decision || !entry.executor) {
        throw new Error('EnmAuditLog.append: required fields: walletAddress, chainId, tier, decision, executor');
    }

    const ts = Date.now();
    const redactedPayload = entry.payload ? redactSensitive(entry.payload) : null;
    // 0.5.112 audit Session 112 — guard against circular-reference
    // payloads. Pre-0.5.112 JSON.stringify could throw if a caller
    // (a future SelfHealingEngine extension or a test fixture) passed
    // an object with cycles — the throw aborts append() before the
    // INSERT runs, so the audit trail loses the row entirely.
    // Healing decisions still execute; they just become invisible
    // for audit / SSE. With this guard the row still gets written;
    // only the payload diagnostic is null'd out and a stderr warning
    // points the operator at the unserializable payload.
    let payloadJson = null;
    if (redactedPayload) {
        try {
            payloadJson = JSON.stringify(redactedPayload);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(
                `${ENM_LOG_PREFIX} EnmAuditLog.append: payload not serializable, `
                + `writing row with payload_json=NULL (caller=${entry.executor || 'unknown'}, `
                + `rule=${entry.ruleId || 'none'}): ${err.message}`,
            );
            payloadJson = null;
        }
    }

    // Defence in depth: lowercase EVM-shaped wallet addresses so a future
    // caller passing mixed case can't accidentally produce a row that doesn't
    // match the lowercased query filter the audit-tab UI uses.
    const wallet = normalizeWallet(entry.walletAddress);

    const res = await db.write(
        `INSERT INTO enm_audit_logs (
            ts, wallet_address, chain_id, rule_id, tier, decision,
            executor, outcome, duration_ms, payload_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            ts,
            wallet,
            String(entry.chainId),
            entry.ruleId || null,
            String(entry.tier),
            String(entry.decision),
            String(entry.executor),
            entry.outcome || null,
            Number.isInteger(entry.durationMs) ? entry.durationMs : null,
            payloadJson,
        ],
    );
    const id = (res && res.lastInsertRowid) || 0;

    // 0.2.0-beta.3.8 — fire the publish-hook (registered once in
    // server.js boot) so the new row reaches the audit-tab's SSE
    // subscription. Hook is null-safe; tests + early-boot inserts
    // before the hook is registered just skip publish silently.
    if (typeof _publishHook === 'function') {
        try {
            // Match the camelCase row shape that routes/audit.js
            // ships from GET /audit so the frontend doesn't need a
            // separate decoder for SSE rows vs paginated rows.
            _publishHook({
                id,
                ts,
                walletAddress: wallet,
                chainId: String(entry.chainId),
                ruleId: entry.ruleId || null,
                tier: String(entry.tier),
                decision: String(entry.decision),
                executor: String(entry.executor),
                outcome: entry.outcome || null,
                durationMs: Number.isInteger(entry.durationMs) ? entry.durationMs : null,
                payload: redactedPayload,
            });
        } catch (err) {
            // Publish failures must not poison the insert path. We
            // already wrote the row; SSE is best-effort UX.
            if (typeof _publishHookOnError === 'function') {
                try { _publishHookOnError(err); } catch (_) { /* logger may be down */ }
            }
        }
    }

    return id;
}

// 0.2.0-beta.3.8 — module-level publish hook. server.js sets this
// once at boot to forward every audit row to the SseHub on the
// `audit` topic, scoped to the row's wallet. Kept as a module-
// level closure (not constructor-injected) because the existing
// 8 SelfHealingEngine call sites pass a bare `db` handle to
// append() and threading a hub through each would be invasive.
let _publishHook = null;
let _publishHookOnError = null;
function setPublishHook(fn, onErr) {
    _publishHook = (typeof fn === 'function') ? fn : null;
    _publishHookOnError = (typeof onErr === 'function') ? onErr : null;
}

function normalizeWallet(addr) {
    const s = String(addr);
    if (s.length === 42 && s.startsWith('0x')) {
        return s.toLowerCase();
    }
    return s;
}

/**
 * Paginated read for the audit-tab UI. All filters optional.
 *
 * @param {object} db
 * @param {object} [opts]
 * @param {string} [opts.walletAddress]  scope by wallet (operator viewing own log)
 * @param {string} [opts.chainId]
 * @param {string} [opts.tier]
 * @param {number} [opts.fromTs]
 * @param {number} [opts.toTs]
 * @param {number} [opts.limit]   default 100, max 500
 * @param {number} [opts.offset]
 * @returns {Promise<Array<object>>}
 */
async function query(db, opts) {
    const o = opts || {};
    const where = [];
    const args = [];
    if (o.walletAddress) { where.push('wallet_address = ?'); args.push(o.walletAddress); }
    if (o.chainId)       { where.push('chain_id = ?');       args.push(o.chainId); }
    if (o.tier)          { where.push('tier = ?');           args.push(o.tier); }
    if (Number.isInteger(o.fromTs)) { where.push('ts >= ?'); args.push(o.fromTs); }
    if (Number.isInteger(o.toTs))   { where.push('ts <= ?'); args.push(o.toTs); }

    const limit = Math.min(Math.max(Number(o.limit) || 100, 1), 500);
    const offset = Math.max(Number(o.offset) || 0, 0);

    const sql = `SELECT id, ts, wallet_address, chain_id, rule_id, tier, decision,
                        executor, outcome, duration_ms, payload_json
                 FROM enm_audit_logs
                 ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY ts DESC
                 LIMIT ? OFFSET ?`;
    args.push(limit, offset);
    const rows = await db.read(sql, args);
    return Array.isArray(rows) ? rows : [];
}

/**
 * Strip known-sensitive keys before serializing into payload_json. Defence in
 * depth — callers should already not pass these, but we make it impossible.
 *
 * @param {object} obj
 * @returns {object}
 */
function redactSensitive(obj) {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }
    const REDACTED = '[REDACTED]';
    const SENSITIVE_KEYS = [
        'password', 'rpcPassword', 'rpc_password',
        'antiSnipePassword', 'anti_snipe_password',
        'keystorePassword', 'keystore_password',
        'signature', 'privateKey', 'private_key',
        'secret', 'token', 'auth_token',
        'encryptedPassword', 'encrypted_password',
    ];
    const out = Array.isArray(obj) ? [] : {};
    for (const [k, v] of Object.entries(obj)) {
        if (SENSITIVE_KEYS.includes(k)) {
            out[k] = REDACTED;
        } else if (v && typeof v === 'object') {
            out[k] = redactSensitive(v);
        } else {
            out[k] = v;
        }
    }
    return out;
}

/**
 * v0.5.236 — swallow-errors convenience wrapper around append(). Four call
 * sites (routes/maintenance, routes/identity, EnmAutoStart,
 * EnmStageSyncOrchestrator) each hand-rolled the SAME "skip if no db → append →
 * log on failure" boilerplate. Centralized here so the null-guard + try/catch
 * live once; callers still build their own entry (tier / ruleId / defaults
 * differ per caller, so the field-building stays at the call site). NEVER
 * throws — a lost audit row must never block the action that authorised it.
 *
 * @param {object|null} db    extension data db (null → no-op, returns false)
 * @param {object} log        logger with .debug/.warn
 * @param {object} entry      full AuditEntry (see append())
 * @returns {Promise<boolean>} true if the row was written, false otherwise
 */
async function safeAppend(db, log, entry) {
    if (!db) { return false; }
    try {
        await append(db, entry);
        return true;
    } catch (err) {
        try {
            (log && log.debug ? log.debug : (() => {}))(
                `${ENM_LOG_PREFIX} audit safeAppend failed (non-fatal): ${err.message}`,
            );
        } catch (_) { /* logger unavailable — swallow */ }
        return false;
    }
}

module.exports = {
    append,
    safeAppend,
    query,
    redactSensitive,
    // 0.2.0-beta.3.8 — wire the SSE publish hook from server.js boot.
    // See append() above for the hook signature.
    setPublishHook,
};
