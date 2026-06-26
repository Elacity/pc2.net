/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmProposalStore — own table for OWNER-CONFIRMS healings.
 *
 * Replaces the agent_proposals reuse considered in Rev 6 — Rev 7 mandated a
 * pure extension, so we cannot depend on PC2's proposal modal or schema.
 *
 * Lifecycle (state field):
 *   pending_approval → approved → executed   (success path)
 *                    ↘ rejected               (operator says no)
 *                    ↘ expired                (TTL elapsed without action)
 *                                ↘ failed     (post-approve execution error)
 *
 * Schema lives in EnmDb.initSchema (table `enm_proposals`).
 *
 * Status transitions are guarded server-side. The frontend modal mutates only
 * via /api/healing/confirm/:id and /api/healing/reject/:id. Direct row writes
 * outside this module are forbidden.
 */

'use strict';

const crypto = require('node:crypto');

const STATUS = Object.freeze({
    PENDING:  'pending_approval',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    EXECUTED: 'executed',
    EXPIRED:  'expired',
    FAILED:   'failed',
    // beta.3.55 — added so HealthChecker can retire pending proposals whose
    // underlying condition has cleared (chain back to alive+RPC-reachable).
    // Dashboard listPending filter excludes this status, so auto-resolved
    // rows stop nagging the operator after the system self-heals.
    AUTO_RESOLVED: 'auto_resolved',
});

const DEFAULT_TTL_SEC = 3600;
const MAX_TTL_SEC = 7 * 24 * 3600;

// P1 (v0.5.183) — default retention for resolved (terminal-status) proposals.
const RESOLVED_RETENTION_DAYS = 30;

// P1 (v0.5.183) — terminal statuses eligible for pruning. Pending/approved rows
// are live and must never be deleted by the cleanup tick.
const TERMINAL_STATUSES = Object.freeze([
    STATUS.EXECUTED,
    STATUS.REJECTED,
    STATUS.EXPIRED,
    STATUS.FAILED,
    STATUS.AUTO_RESOLVED,
]);

/**
 * P1 (v0.5.183) — create the auxiliary tables this store + the SelfHealingEngine
 * own that aren't in EnmDb.initSchema. Idempotent (CREATE TABLE IF NOT EXISTS),
 * safe to call on every boot.
 *
 * `enm_restart_budget` persists the engine's per-chain auto-restart budget across
 * ENM restarts. Without it the in-memory budget reset on every ENM bounce, so a
 * deep-broken chain on a flapping host got a fresh 3-restarts/10min window each
 * time — defeating the escalation cap that exists to stop thundering-herd loops.
 *
 * @param {object} db extension.import('data').db
 */
async function initSchema(db) {
    if (!db || typeof db.write !== 'function') {
        throw new Error('EnmProposalStore.initSchema: invalid db handle (missing .write)');
    }
    // Pass [] explicitly for parameterless DDL — PC2's param wrapper does
    // params.map(...) without an undefined guard (see EnmDb.initSchema note).
    await db.write(`
        CREATE TABLE IF NOT EXISTS enm_restart_budget (
            chain_id TEXT PRIMARY KEY,
            count INTEGER NOT NULL,
            first_at INTEGER NOT NULL
        )
    `, []);
}

/**
 * @typedef {object} ProposalInput
 * @property {string} walletAddress  owner wallet (lowercased EVM)
 * @property {string} chainId        e.g. "mainchain"
 * @property {string} ruleId         F1, F4, ...
 * @property {string} type           "enm.healing.<rule>" namespace
 * @property {string} summaryAction  short imperative ("Restart mainchain")
 * @property {string} [summaryReason] longer paragraph explaining the proposal
 * @property {object} [payload]      action params consumed by SelfHealingEngine.execute
 * @property {number} [ttlSec]       time-to-live, default 3600 (clamped to MAX_TTL_SEC)
 */

/**
 * @typedef {object} ProposalRow
 * @property {string} id
 * @property {string} wallet_address
 * @property {string} chain_id
 * @property {string} rule_id
 * @property {string} type
 * @property {string} status
 * @property {string} summary_action
 * @property {string|null} summary_reason
 * @property {number} proposed_at
 * @property {number} expires_at
 * @property {number|null} approved_at
 * @property {number|null} rejected_at
 * @property {number|null} executed_at
 * @property {string|null} rejection_reason
 * @property {string|null} outcome
 * @property {string|null} payload_json
 */

/**
 * Insert a new proposal in pending_approval state.
 *
 * @param {object} db
 * @param {ProposalInput} input
 * @returns {Promise<ProposalRow>}
 */
async function create(db, input) {
    if (!db || typeof db.write !== 'function') {
        throw new Error('EnmProposalStore.create: invalid db handle');
    }
    if (!input || !input.walletAddress || !input.chainId || !input.ruleId
        || !input.type || !input.summaryAction) {
        throw new Error(
            'EnmProposalStore.create: required: walletAddress, chainId, ruleId, type, summaryAction',
        );
    }

    const id = `enm_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
    const now = Date.now();
    const ttlSec = clampTtl(input.ttlSec);
    const expiresAt = now + (ttlSec * 1000);

    await db.write(
        `INSERT INTO enm_proposals (
            id, wallet_address, chain_id, rule_id, type, status,
            summary_action, summary_reason, proposed_at, expires_at, payload_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id,
            String(input.walletAddress).toLowerCase(),
            String(input.chainId),
            String(input.ruleId),
            String(input.type),
            STATUS.PENDING,
            String(input.summaryAction),
            input.summaryReason || null,
            now,
            expiresAt,
            input.payload ? JSON.stringify(input.payload) : null,
        ],
    );

    return getById(db, id);
}

/**
 * @param {object} db
 * @param {string} id
 * @returns {Promise<ProposalRow|null>}
 */
async function getById(db, id) {
    if (!db || !id) {
        return null;
    }
    const rows = await db.read(
        `SELECT id, wallet_address, chain_id, rule_id, type, status,
                summary_action, summary_reason, proposed_at, expires_at,
                approved_at, rejected_at, executed_at, rejection_reason,
                outcome, payload_json
         FROM enm_proposals WHERE id = ? LIMIT 1`,
        [id],
    );
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * List pending (non-expired) proposals scoped to a wallet. Sweeps expired ones
 * lazily on call so the dashboard never sees a stale entry.
 *
 * @param {object} db
 * @param {string} walletAddress
 * @returns {Promise<Array<ProposalRow>>}
 */
async function listPending(db, walletAddress) {
    if (!db || !walletAddress) {
        return [];
    }
    await sweepExpired(db);
    const rows = await db.read(
        `SELECT id, wallet_address, chain_id, rule_id, type, status,
                summary_action, summary_reason, proposed_at, expires_at,
                approved_at, rejected_at, executed_at, rejection_reason,
                outcome, payload_json
         FROM enm_proposals
         WHERE wallet_address = ? AND status = ?
         ORDER BY proposed_at DESC`,
        [String(walletAddress).toLowerCase(), STATUS.PENDING],
    );
    return Array.isArray(rows) ? rows : [];
}

/**
 * Recent history (any status) for the audit-tab UI.
 *
 * @param {object} db
 * @param {string} walletAddress
 * @param {number} [limit] default 50
 * @returns {Promise<Array<ProposalRow>>}
 */
async function listRecent(db, walletAddress, limit) {
    if (!db || !walletAddress) {
        return [];
    }
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const rows = await db.read(
        `SELECT id, wallet_address, chain_id, rule_id, type, status,
                summary_action, summary_reason, proposed_at, expires_at,
                approved_at, rejected_at, executed_at, rejection_reason,
                outcome, payload_json
         FROM enm_proposals
         WHERE wallet_address = ?
         ORDER BY proposed_at DESC
         LIMIT ?`,
        [String(walletAddress).toLowerCase(), lim],
    );
    return Array.isArray(rows) ? rows : [];
}

/**
 * Move from pending → approved. Returns the updated row, or null if the
 * proposal was already settled (approved/rejected/executed/expired/failed) —
 * the caller surfaces this to the operator as "no longer pending".
 *
 * @param {object} db
 * @param {string} id
 * @returns {Promise<ProposalRow|null>}
 */
async function approve(db, id) {
    const now = Date.now();
    // Guarded UPDATE: only flips status if still pending AND not expired. The
    // sweep would have already moved expired rows, but this is a belt-and-braces
    // check against TTL races between sweep and approve.
    const res = await db.write(
        `UPDATE enm_proposals
            SET status = ?, approved_at = ?
          WHERE id = ? AND status = ? AND expires_at > ?`,
        [STATUS.APPROVED, now, id, STATUS.PENDING, now],
    );
    if (!res || (res.changes != null && res.changes === 0)) {
        return null;
    }
    return getById(db, id);
}

/**
 * Move from pending → rejected. Optional operator-supplied reason.
 *
 * @param {object} db
 * @param {string} id
 * @param {string} [reason]
 * @returns {Promise<ProposalRow|null>}
 */
async function reject(db, id, reason) {
    const now = Date.now();
    const res = await db.write(
        `UPDATE enm_proposals
            SET status = ?, rejected_at = ?, rejection_reason = ?
          WHERE id = ? AND status = ?`,
        [STATUS.REJECTED, now, reason ? String(reason).slice(0, 500) : null, id, STATUS.PENDING],
    );
    if (!res || (res.changes != null && res.changes === 0)) {
        return null;
    }
    return getById(db, id);
}

/**
 * Move from approved → executed (success or failed).
 *
 * @param {object} db
 * @param {string} id
 * @param {{ success: boolean, outcome?: string }} result
 * @returns {Promise<ProposalRow|null>}
 */
async function markExecuted(db, id, result) {
    const now = Date.now();
    const status = (result && result.success) ? STATUS.EXECUTED : STATUS.FAILED;
    const outcome = (result && typeof result.outcome === 'string') ? result.outcome.slice(0, 500) : null;
    const res = await db.write(
        `UPDATE enm_proposals
            SET status = ?, executed_at = ?, outcome = ?
          WHERE id = ? AND status = ?`,
        [status, now, outcome, id, STATUS.APPROVED],
    );
    if (!res || (res.changes != null && res.changes === 0)) {
        return null;
    }
    return getById(db, id);
}

/**
 * beta.3.55 — list pending proposals for a specific chain, regardless of
 * wallet. Used by HealthChecker's auto-resolve sweep, which is keyed by
 * chain (the recovery condition is per-chain, not per-wallet).
 *
 * @param {object} db
 * @param {string} chainId
 * @returns {Promise<Array<ProposalRow>>}
 */
async function listPendingByChain(db, chainId) {
    if (!db || !chainId) {
        return [];
    }
    const rows = await db.read(
        `SELECT id, wallet_address, chain_id, rule_id, type, status,
                summary_action, summary_reason, proposed_at, expires_at,
                approved_at, rejected_at, executed_at, rejection_reason,
                outcome, payload_json
         FROM enm_proposals
         WHERE chain_id = ? AND status = ?`,
        [String(chainId), STATUS.PENDING],
    );
    return Array.isArray(rows) ? rows : [];
}

/**
 * beta.3.55 — retire a pending proposal because the underlying condition
 * has cleared (e.g., chain auto-restarted by F1 or autoStart). The reason
 * is stored in `outcome` so the audit-tab's history view explains why
 * the operator never had to act on it.
 *
 * No-op if the proposal isn't pending (already approved/rejected/expired).
 *
 * @param {object} db
 * @param {string} id
 * @param {string} reason
 * @returns {Promise<ProposalRow|null>}
 */
async function markAutoResolved(db, id, reason) {
    const now = Date.now();
    const outcomeText = reason ? String(reason).slice(0, 500) : null;
    const res = await db.write(
        `UPDATE enm_proposals
            SET status = ?, executed_at = ?, outcome = ?
          WHERE id = ? AND status = ?`,
        [STATUS.AUTO_RESOLVED, now, outcomeText, id, STATUS.PENDING],
    );
    if (!res || (res.changes != null && res.changes === 0)) {
        return null;
    }
    return getById(db, id);
}

/**
 * Bulk-mark expired pending rows. Called from listPending and from a 1-min
 * sweep timer in main.js (Phase 4 wiring).
 *
 * @param {object} db
 * @returns {Promise<number>} rows touched
 */
async function sweepExpired(db) {
    const now = Date.now();
    const res = await db.write(
        `UPDATE enm_proposals
            SET status = ?
          WHERE status = ? AND expires_at <= ?`,
        [STATUS.EXPIRED, STATUS.PENDING, now],
    );
    return (res && typeof res.changes === 'number') ? res.changes : 0;
}

/**
 * P1 (v0.5.183) — delete resolved (terminal-status) proposals older than the
 * retention window so enm_proposals doesn't grow monotonically. Live rows
 * (pending_approval / approved) are never touched.
 *
 * Mirrors EnmDb.cleanupOldAuditLogs: rowid-bounded batched DELETE so a large
 * reduction doesn't lock the DB, and skipped entirely when olderThanDays<=0
 * ("keep forever"). Age is measured against the most recent terminal timestamp
 * (executed_at / rejected_at) falling back to proposed_at for legacy rows that
 * predate those columns being populated.
 *
 * Needs wiring into a periodic tick by the caller (e.g. alongside the
 * audit-cleanup sweep in server.js). Exported so that wiring can call it.
 *
 * @param {object} db
 * @param {number} [olderThanDays]  default 30; 0 means keep forever (no-op)
 * @returns {Promise<number>} rows deleted
 */
async function pruneResolvedProposals(db, olderThanDays) {
    if (!db || typeof db.write !== 'function') {
        return 0;
    }
    const days = (olderThanDays === undefined) ? RESOLVED_RETENTION_DAYS : olderThanDays;
    if (!Number.isFinite(days) || days <= 0) {
        return 0; // keep forever
    }
    const BATCH = 10_000;
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const placeholders = TERMINAL_STATUSES.map(() => '?').join(', ');
    let total = 0;
    // SQLite (better-sqlite3) doesn't support DELETE ... LIMIT unless compiled
    // with SQLITE_ENABLE_UPDATE_DELETE_LIMIT, so bound by rowid like the
    // audit-log cleanup does.
    while (true) {
        // eslint-disable-next-line no-await-in-loop
        const res = await db.write(
            `DELETE FROM enm_proposals WHERE rowid IN (
                 SELECT rowid FROM enm_proposals
                 WHERE status IN (${placeholders})
                   AND COALESCE(executed_at, rejected_at, proposed_at) < ?
                 LIMIT ?
             )`,
            [...TERMINAL_STATUSES, cutoff, BATCH],
        );
        const changes = (res && typeof res.changes === 'number') ? res.changes : 0;
        total += changes;
        if (changes < BATCH) {
            break;
        }
    }
    return total;
}

/**
 * @param {number|undefined} ttlSec
 * @returns {number}
 */
function clampTtl(ttlSec) {
    const n = Number(ttlSec);
    if (!Number.isFinite(n) || n <= 0) {
        return DEFAULT_TTL_SEC;
    }
    return Math.min(Math.max(Math.floor(n), 60), MAX_TTL_SEC);
}

/**
 * Decode payload_json back to an object. Returns null on malformed payloads
 * rather than throwing, so a single bad row doesn't break the dashboard.
 *
 * @param {ProposalRow} row
 * @returns {object|null}
 */
function decodePayload(row) {
    if (!row || typeof row.payload_json !== 'string') {
        return null;
    }
    try {
        return JSON.parse(row.payload_json);
    } catch {
        return null;
    }
}

module.exports = {
    STATUS,
    DEFAULT_TTL_SEC,
    MAX_TTL_SEC,
    RESOLVED_RETENTION_DAYS,
    initSchema,
    create,
    getById,
    listPending,
    listPendingByChain,
    listRecent,
    approve,
    reject,
    markExecuted,
    markAutoResolved,
    sweepExpired,
    pruneResolvedProposals,
    decodePayload,
};
