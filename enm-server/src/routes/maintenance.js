/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * routes/maintenance.js — Settings → Danger Zone (beta.3.33; reshaped v0.5.232).
 *
 *   GET  /maintenance/check-update          owner — latest GitHub tag vs current
 *   GET  /maintenance/status                owner — busy/idle of any pending action
 *   POST /maintenance/update                owner — fire deploy-enm.sh <tag>
 *   POST /maintenance/chain-resync          owner — wipe one or many chains' data,
 *                                                   keep keystore + nodekey
 *   POST /maintenance/reset-everything      owner — wipe ALL data (incl. keystore),
 *                                                   restart ENM in place (bundle
 *                                                   stays so pc2-node respawns us)
 *
 *   POST /maintenance/uninstall             RETIRED (410 Gone) — duplicated pc2 desktop
 *   POST /maintenance/nuke                  RETIRED (410 Gone) — replaced by reset-everything
 *   POST /identity/reset                    RETIRED (410 Gone) — folded into reset-everything
 *
 * All write paths are owner-gated, rate-limited via `admin` scope, and
 * accept a `confirm` field that the route validates against the exact
 * sentinel expected for that action. The frontend Danger Zone card
 * enforces the same typed-confirmation gate; this is defence in depth.
 *
 * Typed-confirmation sentinels (case-sensitive):
 *   chain-resync (single):   "<chainId>"           (legacy, e.g. "mainchain")
 *   chain-resync (multi):    "RESYNC"              (v0.5.232 Council mode)
 *   reset-everything:        "RESET EVERYTHING"    (v0.5.232 in-place reset)
 *
 * Each successful action emits an EnmAuditLog row with tier
 * "CRITICAL-INFO", decision "executed", executor "operator",
 * walletAddress = the request actor wallet, chainId = "mainchain"
 * (single-chain v0.2). Failed actions emit decision "failed" + outcome
 * containing the error message.
 *
 * Note on the response-then-die pattern: update / uninstall / nuke all
 * detach a shell-out that kills our own process. We send the 200
 * response first (Express flushes synchronously); the detached child
 * sleeps briefly before firing the destructive command so the operator
 * sees confirmation before TCP RST.
 */

'use strict';

const express = require('express');

const { ENM_LOG_PREFIX, errorBody, successBody } = require('../services/EnmConstants');
const { limit } = require('../services/EnmRateLimit');
const { requireOwner, readActorWallet } = require('../auth/OwnerCheckMiddleware');
const RequestSchemas = require('../services/EnmRequestSchemas');
const MaintenanceManager = require('../services/EnmMaintenanceManager');
const AuditLog = require('../services/EnmAuditLog');

// The current ENM version. Read once at module load from package.json so
// we never disagree with the deploy tag.
const CURRENT_VERSION = (() => {
    try {
        // require is relative to this file: ../../package.json
        return require('../../package.json').version;
    } catch (_) { return '0.0.0-unknown'; }
})();

/**
 * @param {object} deps
 * @param {object} deps.extensionHandle
 * @param {() => object} deps.getDb  lazy DB handle
 * @returns {import('express').Router}
 */
function build(deps) {
    if (!deps || !deps.extensionHandle || typeof deps.getDb !== 'function') {
        throw new Error('routes/maintenance.build: { extensionHandle, getDb } required');
    }
    const { extensionHandle, getDb } = deps;
    const router = express.Router();

    // ------------------------------------------------------------------
    // GET /maintenance/check-update
    //
    // Returns whether an ENM extension update is available on GitHub,
    // alongside the version strings the frontend needs for the card.
    // ------------------------------------------------------------------
    router.get('/check-update', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const info = await MaintenanceManager.checkLatestVersion(CURRENT_VERSION);
            return res.json(successBody(info));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} GET /maintenance/check-update: ${err.message}`);
            return res.status(500).json(errorBody('Could not check for binary updates. Will retry on the next poll.'));
        }
    });

    // ------------------------------------------------------------------
    // GET /maintenance/status
    //
    // Busy/idle of any pending destructive action. Used by the
    // frontend to disable buttons during an in-flight action.
    // ------------------------------------------------------------------
    router.get('/status', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        return res.json(successBody(MaintenanceManager.status()));
    });

    // ------------------------------------------------------------------
    // POST /maintenance/update    owner
    //
    // Body: { tag: "enm-v0.2.0-beta.3.33" }
    //
    // Spawns /root/deploy-enm.sh <tag> as a detached child. ENM dies
    // mid-deploy; pc2-node reinstalls + restarts. Audit emitted before
    // detach so the row survives our PID's death.
    // ------------------------------------------------------------------
    router.post('/update', limit('admin'), requireOwner, async (req, res) => {
        const { value, details } = RequestSchemas.validateBody(
            RequestSchemas.maintenanceUpdateBody, req.body,
        );
        if (details) {
            return res.status(400).json({
                ...errorBody('Invalid request body.'),
                details,
            });
        }
        const wallet = readActorWallet(req);
        const tag = value.tag;
        try {
            // Audit FIRST so the row lands before the script kills us.
            // If the script then ENOENTs we'll have an orphan audit row
            // saying "operator clicked update", which is fine — the
            // operator will see the (still-running) ENM and notice the
            // version didn't change.
            await _audit(getDb, extensionHandle.log, {
                walletAddress: wallet,
                ruleId: null, tier: 'CRITICAL-INFO',
                decision: 'executed', executor: 'operator',
                outcome: `Maintenance update queued: ${tag}`,
                payload: { action: 'update', tag },
            });
            const r = await MaintenanceManager.update({
                tag, log: extensionHandle.log,
            });
            return res.json(successBody({
                queued: true,
                tag: r.tag,
                logFile: r.logFile,
                message: 'Update queued. ENM will restart in a few seconds. '
                    + 'Reload this page after ~30 seconds to see the new version.',
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} POST /maintenance/update: ${err.message}`);
            await _audit(getDb, extensionHandle.log, {
                walletAddress: wallet,
                ruleId: null, tier: 'CRITICAL-INFO',
                decision: 'failed', executor: 'operator',
                outcome: `Maintenance update failed: ${err.message}`,
                payload: { action: 'update', tag, code: err.code },
            });
            const status = err.code === 'BUSY' ? 409 : 500;
            // BUSY message ("Another maintenance action is in progress")
            // is operator-meaningful; 500 fallbacks could leak ENOENT
            // paths / script-exit-code internals, so use a static message
            // and let the operator open the Activity tab where the audit
            // row above (line 148-154) carries the full err.message.
            const responseMessage = status === 500
                ? 'Update failed. Check the Activity tab for the underlying error.'
                : err.message;
            return res.status(status).json(errorBody(responseMessage));
        }
    });

    // ------------------------------------------------------------------
    // POST /maintenance/chain-resync    owner
    //
    // v0.5.232 — accepts both shapes:
    //
    //   Legacy single-chain (BPoS):
    //     { chainId: "mainchain", confirm: "mainchain" }
    //     confirm must equal chainId (frontend types the chain name).
    //
    //   Multi-chain (v0.5.232 Council):
    //     { chainIds: ["mainchain","esc","eid","pg"], confirm: "RESYNC" }
    //     confirm is the static string "RESYNC".
    //
    // Schema's .or('chainId','chainIds') guarantees at least one is set;
    // route normalizes to chainIds[] internally. Arbiter + oracles are
    // rejected (no chaindata to wipe — they're services, not chains).
    // ------------------------------------------------------------------
    // chainIds that have no on-disk chaindata to wipe. Resyncing these is a
    // no-op at best and a confusing audit-log entry at worst — fail loud.
    const RESYNC_INELIGIBLE = new Set([
        'arbiter', 'esc-oracle', 'eid-oracle', 'pg-oracle',
    ]);
    router.post('/chain-resync', limit('admin'), requireOwner, async (req, res) => {
        const { value, details } = RequestSchemas.validateBody(
            RequestSchemas.maintenanceChainResyncBody, req.body,
        );
        if (details) {
            return res.status(400).json({
                ...errorBody('Invalid request body.'),
                details,
            });
        }
        const wallet = readActorWallet(req);
        const { chainId, chainIds: chainIdsBody, confirm } = value;
        // Normalize to an ordered, deduped array.
        const ids = Array.isArray(chainIdsBody) && chainIdsBody.length > 0
            ? Array.from(new Set(chainIdsBody))
            : (chainId ? [chainId] : []);
        if (ids.length === 0) {
            return res.status(400).json(errorBody(
                'Provide either chainId (string) or chainIds (array).',
            ));
        }
        // v0.5.232 — reject ineligible chains (no chaindata to wipe).
        const ineligible = ids.filter((c) => RESYNC_INELIGIBLE.has(c));
        if (ineligible.length > 0) {
            return res.status(400).json(errorBody(
                `These chains have no chaindata to resync: ${ineligible.join(', ')}. `
                + 'Restart them instead via /chains/:id/restart.',
            ));
        }
        // Confirm logic: legacy single-chain expects confirm===chainId; new
        // multi-chain (any time chainIds is used OR multiple ids resolved)
        // expects the static "RESYNC". This preserves the v0.5.231 BPoS
        // gate while letting Council operators confirm 1-N chains uniformly.
        const isMulti = Array.isArray(chainIdsBody);
        if (isMulti) {
            if (confirm !== 'RESYNC') {
                return res.status(400).json(errorBody(
                    'Confirmation must be exactly "RESYNC" (uppercase) for the multi-chain form.',
                ));
            }
        } else {
            if (confirm !== ids[0]) {
                return res.status(400).json(errorBody(
                    'Confirmation does not match chain name.',
                ));
            }
        }
        // Run resyncs serially — parallel wipes would thrash disk + race
        // each other through the maintenance lock. The HTTP response is
        // queued, not streamed: operators see "queued" then watch chain
        // states transition through the dashboard / Activity tab.
        const results = [];
        const failures = [];
        for (const id of ids) {
            try {
                const r = await MaintenanceManager.chainResync({
                    chainId: id,
                    log: extensionHandle.log,
                    extensionHandle,
                });
                results.push({ chainId: id, ok: true, ...r });
                await _audit(getDb, extensionHandle.log, {
                    walletAddress: wallet,
                    chainId: id,
                    ruleId: null, tier: 'CRITICAL-INFO',
                    decision: 'executed', executor: 'operator',
                    outcome: `Chain resync ${id}: wiped ${r.removedPaths.length} path(s); keystore backup=${r.keystoreBackup || 'none'}`,
                    payload: r,
                });
            } catch (err) {
                failures.push({ chainId: id, error: err.message, code: err.code });
                extensionHandle.log.error(
                    `${ENM_LOG_PREFIX} POST /maintenance/chain-resync (${id}): ${err.message}`,
                );
                await _audit(getDb, extensionHandle.log, {
                    walletAddress: wallet,
                    chainId: id,
                    ruleId: null, tier: 'CRITICAL-INFO',
                    decision: 'failed', executor: 'operator',
                    outcome: `Chain resync ${id} failed: ${err.message}`,
                    payload: { action: 'chain-resync', chainId: id, code: err.code },
                });
                // If the FIRST chain hit BUSY, stop the loop and surface
                // 409 to the operator — they can retry once the in-flight
                // maintenance finishes. Subsequent chains' BUSY is rare
                // because chainResync acquires + releases per-call.
                if (err.code === 'BUSY' && results.length === 0) {
                    return res.status(409).json(errorBody(err.message));
                }
            }
        }
        const allFailed = results.length === 0 && failures.length > 0;
        if (allFailed) {
            return res.status(500).json({
                ...errorBody('All chain resyncs failed. Check the Activity tab.'),
                failures,
            });
        }
        return res.json(successBody({
            action: 'chain-resync',
            chainIds: ids,
            results,
            failures,
            message: failures.length === 0
                ? `Chain data wiped for ${ids.length} chain(s). Re-sync started — may take 4–8 hours.`
                : `Chain data wiped for ${results.length}/${ids.length} chain(s); ${failures.length} failed (see Activity tab).`,
        }));
    });

    // ------------------------------------------------------------------
    // POST /maintenance/reset-everything    owner (v0.5.232)
    //
    // Body: { confirm: "RESET EVERYTHING" }     case-sensitive
    //
    // The single in-app destructive flow. Wipes ALL data (chain data,
    // keystore, nodekey, enm.db, audit log, healing history) and SIGKILLs
    // ENM, but KEEPS the bundle and the pc2-node installed_apps row so
    // pc2-node's process supervisor respawns ENM with empty data — the
    // setup wizard appears, and the iframe is never orphaned. Replaces
    // the retired /maintenance/uninstall, /maintenance/nuke, and
    // /identity/reset routes (all return 410 Gone now).
    // ------------------------------------------------------------------
    router.post('/reset-everything', limit('admin'), requireOwner, async (req, res) => {
        const { value, details } = RequestSchemas.validateBody(
            RequestSchemas.maintenanceResetEverythingBody, req.body,
        );
        if (details) {
            return res.status(400).json({
                ...errorBody('Invalid request body.'),
                details,
            });
        }
        const wallet = readActorWallet(req);
        if (value.confirm !== 'RESET EVERYTHING') {
            return res.status(400).json(errorBody(
                'Confirmation must be exactly "RESET EVERYTHING" (uppercase).',
            ));
        }
        try {
            await _audit(getDb, extensionHandle.log, {
                walletAddress: wallet,
                ruleId: null, tier: 'CRITICAL-INFO',
                decision: 'executed', executor: 'operator',
                outcome: 'Reset everything queued — all data wiped, ENM will restart to wizard',
                payload: { action: 'reset-everything' },
            });
            const r = await MaintenanceManager.resetEverything({ log: extensionHandle.log });
            return res.json(successBody({
                queued: true,
                logFile: r.logFile,
                message: 'Reset queued. ENM will wipe all data and restart within '
                    + '~10 seconds. The setup wizard will reappear when it comes '
                    + 'back up. If the page does not reload automatically, refresh it.',
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} POST /maintenance/reset-everything: ${err.message}`);
            await _audit(getDb, extensionHandle.log, {
                walletAddress: wallet,
                ruleId: null, tier: 'CRITICAL-INFO',
                decision: 'failed', executor: 'operator',
                outcome: `Reset everything failed: ${err.message}`,
                payload: { action: 'reset-everything', code: err.code },
            });
            const status = err.code === 'BUSY' ? 409 : 500;
            const responseMessage = status === 500
                ? 'Reset failed. Check the Activity tab for the underlying error.'
                : err.message;
            return res.status(status).json(errorBody(responseMessage));
        }
    });

    // ------------------------------------------------------------------
    // RETIRED v0.5.232 — these three endpoints all return 410 Gone with
    // a message pointing to the replacement flow. Kept in the router so
    // any external caller (or a stale frontend mid-upgrade) gets a useful
    // error instead of a silent 404. Remove after 2 release cycles.
    // ------------------------------------------------------------------
    router.post('/uninstall', requireOwner, (_req, res) => {
        return res.status(410).json(errorBody(
            'POST /maintenance/uninstall was retired in v0.5.232. To remove the ENM '
            + 'extension from PC2, right-click the ENM tile on the PC2 desktop and '
            + 'choose Uninstall. To wipe data and start fresh inside the app, use '
            + 'Settings → Reset ENM.',
        ));
    });
    router.post('/nuke', requireOwner, (_req, res) => {
        return res.status(410).json(errorBody(
            'POST /maintenance/nuke was retired in v0.5.232. Use Settings → Reset ENM '
            + '(POST /maintenance/reset-everything) instead — the new flow wipes the '
            + 'same data but keeps the extension installed so the wizard reappears '
            + 'in place, fixing the "another pc2 inside the app" reload bug.',
        ));
    });

    return router;
}

/**
 * Best-effort audit write. The audit row is high-value (operator
 * accountability for destructive actions) but a failed write must not
 * block the action — the operator already authorised, and the audit
 * loss is preferable to a 500 that leaves the operator unsure.
 *
 * @param {() => object} getDb
 * @param {object} log
 * @param {object} entry
 */
async function _audit(getDb, log, entry) {
    try {
        const db = getDb();
        await AuditLog.append(db, {
            walletAddress: entry.walletAddress || '0x0',
            chainId: 'mainchain',
            ruleId: entry.ruleId,
            tier: entry.tier,
            decision: entry.decision,
            executor: entry.executor,
            outcome: entry.outcome,
            payload: entry.payload,
        });
    } catch (err) {
        log.warn(`${ENM_LOG_PREFIX} maintenance audit append failed: ${err.message}`);
    }
}

module.exports = { build, CURRENT_VERSION };
