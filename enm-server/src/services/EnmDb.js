/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmDb — schema initialization for our extension's tables.
 *
 * We do NOT add migrations to PC2's pc2-node/src/storage/migrations.ts (Rev 7
 * additive-only constraint). Instead we run idempotent CREATE TABLE IF NOT EXISTS
 * statements during the extension's `init` lifecycle hook.
 *
 * Tables we own (all prefixed `enm_`):
 *   enm_audit_logs     — append-only state transitions + healing decisions
 *   enm_proposals      — own OWNER-CONFIRMS proposal flow (replaces agent_proposals reuse)
 *   enm_setup_state    — first-run wizard progress
 *
 * Access pattern: extension.import('data') → { db, kv } where db.write/read execute
 * SQL. Foreign keys to PC2's `users(wallet_address)` are intentionally NOT used
 * because extensions get a scoped DB view and we must not depend on PC2's schema.
 */

'use strict';

/**
 * Run all CREATE TABLE IF NOT EXISTS statements. Idempotent — safe to run on
 * every extension init (which happens on every PC2 boot).
 *
 * @param {object} db extension.import('data').db
 */
async function initSchema(db) {
    if (!db || typeof db.write !== 'function') {
        throw new Error('EnmDb.initSchema: invalid db handle (missing .write)');
    }

    // PC2's SqliteDatabaseAccessService.sqlite_transform_params_ does
    // params.map(...) without a defensive undefined check, so every
    // db.write/db.read call MUST pass a params array — even for parameterless
    // DDL like CREATE TABLE. We pass [] explicitly so the wrapper's .map
    // succeeds. (Otherwise: "Cannot read properties of undefined (reading
    // 'map')" at SqliteDatabaseAccessService.js:380.)

    // Audit log — state transitions and healing decisions only (NOT every poll tick,
    // per Rev 4 audit recommendation to keep write volume low).
    await db.write(`
        CREATE TABLE IF NOT EXISTS enm_audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            wallet_address TEXT NOT NULL,
            chain_id TEXT NOT NULL,
            rule_id TEXT,
            tier TEXT NOT NULL,
            decision TEXT NOT NULL,
            executor TEXT NOT NULL,
            outcome TEXT,
            duration_ms INTEGER,
            payload_json TEXT
        )
    `, []);
    await db.write(`CREATE INDEX IF NOT EXISTS idx_enm_audit_ts ON enm_audit_logs(ts DESC)`, []);
    await db.write(`CREATE INDEX IF NOT EXISTS idx_enm_audit_wallet ON enm_audit_logs(wallet_address, ts DESC)`, []);
    await db.write(`CREATE INDEX IF NOT EXISTS idx_enm_audit_chain ON enm_audit_logs(chain_id, ts DESC)`, []);

    // OWNER-CONFIRMS proposals (we do NOT reuse PC2's agent_proposals; v0.2 may revisit).
    await db.write(`
        CREATE TABLE IF NOT EXISTS enm_proposals (
            id TEXT PRIMARY KEY,
            wallet_address TEXT NOT NULL,
            chain_id TEXT NOT NULL,
            rule_id TEXT NOT NULL,
            type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending_approval',
            summary_action TEXT NOT NULL,
            summary_reason TEXT,
            proposed_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            approved_at INTEGER,
            rejected_at INTEGER,
            executed_at INTEGER,
            rejection_reason TEXT,
            outcome TEXT,
            payload_json TEXT
        )
    `, []);
    await db.write(`CREATE INDEX IF NOT EXISTS idx_enm_prop_status ON enm_proposals(status, expires_at)`, []);
    await db.write(`CREATE INDEX IF NOT EXISTS idx_enm_prop_wallet ON enm_proposals(wallet_address, proposed_at DESC)`, []);

    // Setup wizard state — single-row table keyed by node owner.
    // Tracks step progression so the operator can resume after restart.
    await db.write(`
        CREATE TABLE IF NOT EXISTS enm_setup_state (
            wallet_address TEXT PRIMARY KEY,
            completed INTEGER NOT NULL DEFAULT 0,
            current_step TEXT NOT NULL DEFAULT 'welcome',
            os_check_passed INTEGER NOT NULL DEFAULT 0,
            disk_check_passed INTEGER NOT NULL DEFAULT 0,
            wallet_check_passed INTEGER NOT NULL DEFAULT 0,
            binary_path TEXT,
            binary_version TEXT,
            keystore_imported INTEGER NOT NULL DEFAULT 0,
            config_generated INTEGER NOT NULL DEFAULT 0,
            started_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            completed_at INTEGER
        )
    `, []);
}

// P1 (v0.5.182) — hard ceiling on audit-log rows (disk-fill backstop).
const AUDIT_LOG_MAX_ROWS = 100_000;

/**
 * Delete audit rows older than retention window. Called from boot + 24h interval.
 * Batched so a 365 → 30 day reduction doesn't lock the DB.
 *
 * @param {object} db
 * @param {number} olderThanDays  0 means keep forever (no-op)
 * @returns {Promise<number>} rows deleted
 */
async function cleanupOldAuditLogs(db, olderThanDays) {
    const BATCH = 10_000;
    let total = 0;
    // Time-based pruning. Skipped when olderThanDays<=0 ("keep forever").
    if (Number.isInteger(olderThanDays) && olderThanDays > 0) {
        const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
        // SQLite doesn't support DELETE ... LIMIT by default in better-sqlite3 unless
        // SQLITE_ENABLE_UPDATE_DELETE_LIMIT was compiled in. Use rowid-bounded delete instead.
        while (true) {
            // eslint-disable-next-line no-await-in-loop
            const res = await db.write(
                `DELETE FROM enm_audit_logs WHERE rowid IN (
                     SELECT rowid FROM enm_audit_logs WHERE ts < ? LIMIT ?
                 )`,
                [cutoff, BATCH],
            );
            const changes = (res && typeof res.changes === 'number') ? res.changes : 0;
            total += changes;
            if (changes < BATCH) {
                break;
            }
        }
    }
    // P1 (v0.5.182) — absolute row-count backstop, applied REGARDLESS of the time
    // setting. retentionDays=0 ("keep forever", an operator-settable value) +
    // any nonzero write rate grows the table unbounded over months → disk fill.
    // Trim the oldest rows beyond AUDIT_LOG_MAX_ROWS so there's always a ceiling.
    total += await capAuditRows(db, AUDIT_LOG_MAX_ROWS);
    return total;
}

/** @private — delete oldest rows so the table never exceeds maxRows. */
async function capAuditRows(db, maxRows) {
    const countRes = await db.read('SELECT COUNT(*) AS n FROM enm_audit_logs', []);
    const n = (countRes && countRes[0]) ? Number(countRes[0].n) : 0;
    if (n <= maxRows) { return 0; }
    const res = await db.write(
        `DELETE FROM enm_audit_logs WHERE rowid IN (
             SELECT rowid FROM enm_audit_logs ORDER BY rowid ASC LIMIT ?
         )`,
        [n - maxRows],
    );
    return (res && typeof res.changes === 'number') ? res.changes : 0;
}

module.exports = {
    initSchema,
    cleanupOldAuditLogs,
};
