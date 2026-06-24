/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * routes/identity.js — Settings → Identity tab (beta.3.43).
 *
 *   GET  /identity                       owner-read — current cached identity + producer state
 *   POST /identity/unlock                owner — smoke-test password, refresh cache
 *   GET  /identity/backup                owner — stream keystore.dat for download
 *   POST /identity/import                owner — replace keystore.dat with uploaded file
 *   POST /identity/reset                 owner — wipe + regenerate keystore + new password
 *
 * Producer-state guard: the destructive routes (import / reset) check
 * the on-chain producer record BEFORE touching disk. If state is
 * Active/Pending/Inactive and force!=true, return 412 PRECONDITION_REQUIRED
 * so the UI can surface the lost-rewards modal. Operator must re-submit
 * with force=true to acknowledge.
 *
 * IMPORTANT: this is NOT a slashing-risk modal. Mainnet penalty config
 * sets InactivePenalty = 0 (common/config/config.go:193) — inactivity
 * does NOT slash the deposit. The actual operator risk is lost
 * REWARDS during the missed-rounds window plus on-chain identity
 * orphaning, recoverable via DPoSV2UpdateProducer signed in
 * Essentials with the new NodePublicKey. The 200-ELA penalty
 * (DPoSV2IllegalPenalty) only applies for illegal-evidence
 * (double-sign of proposal/vote/block/sidechain) and a keystore-
 * swapped node can't produce valid signatures at all, so it can't
 * produce illegal evidence. See memory/feedback_enm_bpos_slashing_truth.md
 * for citations.
 *
 * Audit: every action emits an EnmAuditLog row with tier
 * "CRITICAL-INFO", decision "executed"/"failed", executor "operator".
 * Passwords are redacted out via the existing redactSensitive list
 * (Joi-validated body, audit middleware applies redactSensitive
 * BEFORE persisting the payload).
 *
 * Anti-snipe: /identity/reset honours cfg.global.antiSnipePasswordHash
 * the same way SelfHealingEngine's protected proposals do. Mirrors the
 * pattern in beta.3.10's anti-snipe wiring.
 */

'use strict';

const express = require('express');

const { ENM_LOG_PREFIX, errorBody, successBody } = require('../services/EnmConstants');
const { limit } = require('../services/EnmRateLimit');
const { requireOwner, readActorWallet } = require('../auth/OwnerCheckMiddleware');
const RequestSchemas = require('../services/EnmRequestSchemas');
const KeystoreIdentity = require('../services/EnmKeystoreIdentity');
const IntegrityChecker = require('../services/EnmIntegrityChecker');
const AuditLog = require('../services/EnmAuditLog');
const ConfigStore = require('../services/ConfigStore');

// Producer states that imply the operator is locked in to a specific
// NodePublicKey on chain. Destructive ops while in these states require
// explicit force=true acknowledgement — not because they cause deposit
// slashing (InactivePenalty=0 on mainnet) but because they orphan the
// on-chain registration and the operator stops accruing block-
// production rewards until they UpdateProducer in Essentials.
const LOCKED_IN_PRODUCER_STATES = new Set([
    'Active', 'Pending',
    // Inactive producers are recoverable via ActivateProducer +
    // UpdateProducer — orphaning their NodePublicKey extends the
    // recovery window, so still gate them behind the warning.
    'Inactive',
]);

const CHAIN_ID = 'mainchain';
// v0.5.232 — RESET_CONFIRM_PHRASE removed along with POST /identity/reset.
// The unified Settings → Reset ENM flow lives in routes/maintenance.js
// (POST /maintenance/reset-everything, confirm: "RESET EVERYTHING").
const IMPORT_CONFIRM_PHRASE = 'import';
const MAX_IMPORT_BYTES = 10 * 1024;

/**
 * @param {object} deps
 * @param {object} deps.extensionHandle
 * @param {() => object} deps.getDb
 * @returns {import('express').Router}
 */
function build(deps) {
    if (!deps || !deps.extensionHandle || typeof deps.getDb !== 'function') {
        throw new Error('routes/identity.build: { extensionHandle, getDb } required');
    }
    const { extensionHandle, getDb } = deps;
    const router = express.Router();

    // GET /identity
    router.get('/', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const cached = await KeystoreIdentity.getCachedIdentity(CHAIN_ID);
            const producer = await KeystoreIdentity.getProducerState(CHAIN_ID);
            const ks = require('../services/ChainRegistry').getKeystoreService();
            const exists = await ks.exists();
            // v0.5.229d (P2 audit fix) — Settings tab consumes /identity
            // (this endpoint), NOT /system/identity. The Phase B
            // crMember + setupRole fields were added to /system/identity
            // only. Mirror them here so the Settings → Identity grid
            // can branch the pill text on Council mode.
            let crMember = null;
            let setupRole = 'unknown';
            try {
                const ConfigStore = require('../services/ConfigStore');
                const cfg = await ConfigStore.load();
                if (cfg && cfg.global && cfg.global.council
                    && cfg.global.council.installed === true) {
                    setupRole = 'council';
                } else if (cached && cached.publicKey && producer && producer.state) {
                    setupRole = 'bpos';
                }
                if (cached && cached.publicKey) {
                    const CrMembershipService = require('../services/CrMembershipService');
                    crMember = await CrMembershipService.detectCrMembership(cfg, {
                        log: extensionHandle.log,
                    });
                }
            } catch (_) { /* graceful — leave defaults */ }
            return res.json(successBody({
                chainId: CHAIN_ID,
                keystoreExists: exists,
                identity: cached || null,
                producer: producer || null,
                // v0.5.229d additions:
                crMember,
                setupRole,
                // Convenience flag the UI uses to decide whether to
                // show the Unlock card.
                identityCacheMissing: exists && !cached,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} GET /identity: ${err.message}`);
            return res.status(500).json(errorBody('Failed to read node identity.'));
        }
    });

    // POST /identity/unlock
    router.post('/unlock', limit('admin'), requireOwner, async (req, res) => {
        const { value, details } = RequestSchemas.validateBody(
            RequestSchemas.identityUnlockBody, req.body,
        );
        if (details) {
            return res.status(400).json({
                ...errorBody('Invalid request body.'),
                details,
            });
        }
        const wallet = readActorWallet(req);
        try {
            const r = await KeystoreIdentity.unlock(CHAIN_ID, value.password);
            if (!r.ok) {
                await _audit(getDb, extensionHandle.log, {
                    walletAddress: wallet,
                    decision: 'failed',
                    outcome: `Identity unlock failed: ${r.error}`,
                    payload: { action: 'identity-unlock' },
                });
                return res.status(400).json(errorBody(r.error));
            }
            await _audit(getDb, extensionHandle.log, {
                walletAddress: wallet,
                decision: 'executed',
                outcome: `Identity unlocked: pubkey ${r.publicKey.slice(0, 10)}…${r.publicKey.slice(-6)}`,
                payload: { action: 'identity-unlock', publicKey: r.publicKey, address: r.address },
            });
            return res.json(successBody({
                publicKey: r.publicKey,
                address: r.address,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} POST /identity/unlock: ${err.message}`);
            return res.status(500).json(errorBody('Could not verify keystore password. Try again.'));
        }
    });

    // GET /identity/backup
    //
    // Streams the on-disk keystore.dat. Owner-only because the file is
    // operationally sensitive even when encrypted (loss of the file
    // means loss of the producer key if you also lose the password).
    router.get('/backup', limit('admin'), requireOwner, async (req, res) => {
        const wallet = readActorWallet(req);
        try {
            const r = await KeystoreIdentity.readBackup(CHAIN_ID);
            await _audit(getDb, extensionHandle.log, {
                walletAddress: wallet,
                decision: 'executed',
                outcome: `Identity backup downloaded: ${r.filename} (${r.buffer.length} bytes)`,
                payload: { action: 'identity-backup', filename: r.filename, size: r.buffer.length },
            });
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition',
                'attachment; filename="' + r.filename.replace(/"/g, '') + '"');
            res.setHeader('Content-Length', String(r.buffer.length));
            res.setHeader('X-Content-Type-Options', 'nosniff');
            return res.end(r.buffer);
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} GET /identity/backup: ${err.message}`);
            const status = err.code === 'NO_KEYSTORE' ? 404 : 500;
            // 404 NO_KEYSTORE is operator-correctable (finish setup first);
            // 500 fallback per Sessions 64/67/79 template.
            const responseMessage = status === 404
                ? 'No keystore on disk yet — finish the setup wizard first.'
                : 'Could not download the keystore backup. Try again.';
            return res.status(status).json(errorBody(responseMessage));
        }
    });

    // POST /identity/import
    //
    // Body: raw keystore.dat bytes (Content-Type: application/octet-
    // stream). Password + confirm + force passed as headers
    // (X-Keystore-Password, X-Keystore-Confirm, X-Keystore-Force). We
    // avoid multipart to keep the route lean; keystore.dat is <10 KB
    // so a single buffer is fine.
    router.post('/import',
        limit('admin'),
        requireOwner,
        express.raw({ type: '*/*', limit: MAX_IMPORT_BYTES + 1024 }),
        async (req, res) => {
            const wallet = readActorWallet(req);
            const password = String(req.get('x-keystore-password') || '');
            const confirm = String(req.get('x-keystore-confirm') || '');
            const force = req.get('x-keystore-force') === 'true';
            if (!password) {
                return res.status(400).json(errorBody('Keystore password is required.'));
            }
            if (confirm !== IMPORT_CONFIRM_PHRASE) {
                return res.status(400).json(errorBody(
                    `Type "${IMPORT_CONFIRM_PHRASE}" in the confirm field to proceed.`,
                ));
            }
            const buf = (req.body instanceof Buffer) ? req.body : null;
            if (!buf || buf.length === 0) {
                return res.status(400).json(errorBody('No keystore bytes received.'));
            }
            // Producer-state guard.
            const producer = await KeystoreIdentity.getProducerState(CHAIN_ID);
            // P1 (v0.5.183) — getProducerState() returns null both for
            // "confirmed not-registered" AND for "couldn't determine" (RPC
            // down, adapter not wired, chain stopped — all collapse to null
            // via the .catch in EnmKeystoreIdentity.getProducerState). If a
            // keystore identity exists, a null is INDETERMINATE: the node may
            // be an Active producer whose state we just failed to read. Wiping
            // it then would orphan the on-chain registration + lose rewards.
            // Block on indeterminate unless the operator passes force.
            const indeterminate = await _producerStateIndeterminate(producer);
            if (indeterminate && !force) {
                return res.status(412).json({
                    ...errorBody(
                        'Couldn\'t verify the on-chain producer state (the mainchain RPC may be '
                        + 'briefly unreachable). Importing a different keystore now could orphan an '
                        + 'Active producer registration and lose block-production rewards. Retry once '
                        + 'the node is synced and reachable, or acknowledge the rewards-loss warning '
                        + 'to proceed anyway.',
                    ),
                    code: 'PRODUCER_STATE_UNVERIFIED',
                });
            }
            if (producer && LOCKED_IN_PRODUCER_STATES.has(producer.state) && !force) {
                return res.status(412).json({
                    ...errorBody(
                        `Producer is ${producer.state}. Importing a different keystore creates a new `
                        + 'node public key that won\'t match the on-chain registration — you\'ll miss '
                        + 'block-production rewards until you sign DPoSV2UpdateProducer in Essentials '
                        + 'with the new key. No deposit penalty (InactivePenalty=0 on mainnet). '
                        + 'Acknowledge the rewards-loss warning to proceed.',
                    ),
                    code: 'PRODUCER_LOCKED_IN',
                    producerState: producer.state,
                });
            }
            try {
                const r = await KeystoreIdentity.importKeystore(CHAIN_ID, buf, password, {
                    log: extensionHandle.log,
                });
                if (!r.ok) {
                    await _audit(getDb, extensionHandle.log, {
                        walletAddress: wallet,
                        decision: 'failed',
                        outcome: `Identity import failed: ${r.error}`,
                        payload: { action: 'identity-import' },
                    });
                    return res.status(400).json(errorBody(r.error));
                }
                // v0.5.248 (validator-readiness audit P1-9) — importing a
                // producer keystore is intent to SIGN, so ensure the mainchain
                // runs with the DPoS arbiter enabled. Closes the edge where a
                // node first set up keyless (enableArbiter=false) then imported
                // a key later would hold a key but never sign. Best-effort: a
                // failure here must not fail the import the operator committed.
                try {
                    await ConfigStore.update((cfg) => {
                        if (cfg.chains && cfg.chains[CHAIN_ID] && cfg.chains[CHAIN_ID].dpos) {
                            cfg.chains[CHAIN_ID].dpos.enableArbiter = true;
                        }
                        return cfg;
                    });
                } catch (cfgErr) {
                    extensionHandle.log.warn(
                        `${ENM_LOG_PREFIX} POST /identity/import: enableArbiter set failed (non-fatal): ${cfgErr.message}`,
                    );
                }
                await _audit(getDb, extensionHandle.log, {
                    walletAddress: wallet,
                    decision: 'executed',
                    outcome: `Identity imported: pubkey ${r.publicKey.slice(0, 10)}…${r.publicKey.slice(-6)} (archived → ${r.archivedTo || 'none'})`,
                    payload: {
                        action: 'identity-import',
                        publicKey: r.publicKey,
                        address: r.address,
                        archivedTo: r.archivedTo,
                    },
                });
                return res.json(successBody({
                    publicKey: r.publicKey,
                    address: r.address,
                    archivedTo: r.archivedTo,
                }));
            } catch (err) {
                extensionHandle.log.error(`${ENM_LOG_PREFIX} POST /identity/import: ${err.message}`);
                return res.status(500).json(errorBody('Keystore import failed. Try again.'));
            }
        });

    // POST /identity/reset — RETIRED v0.5.232.
    //
    // Folded into POST /maintenance/reset-everything. The standalone
    // identity reset was footgun-shaped: rotating the keystore without
    // wiping chain data orphans the on-chain producer/CR registration
    // (the new pubkey doesn't match), and the operator still has to
    // re-walk wizard cards anyway. The new reset-everything flow does
    // both in one atomic operation. Returns 410 Gone to surface the
    // change to any stale frontend or external caller. The original
    // handler is preserved in git history (see commit b19c15bf and
    // earlier) — anti-snipe gate, producer-state guard, and
    // KeystoreIdentity.resetKeystore call all live there if any future
    // work needs to revive a narrower "keystore-only" rotation path.
    router.post('/reset', requireOwner, (_req, res) => {
        return res.status(410).json(errorBody(
            'POST /identity/reset was retired in v0.5.232. Use Settings → Reset ENM '
            + '(POST /maintenance/reset-everything) instead — full reset wipes the '
            + 'keystore alongside chain data and restarts ENM with the wizard, in '
            + 'place. A standalone keystore rotation orphans your on-chain producer/'
            + 'CR registration anyway, so the unified reset is the only safe path.',
        ));
    });

    // ------------------------------------------------------------------
    // GET /identity/integrity     beta.3.46
    //
    // Server-integrity panel under Identity tab. Honest about scope:
    // detects tamper-EVIDENCE (changes since install) not tamper-PROOF
    // (correctness at install). Hypervisor-level threats (live RAM
    // snapshot, pre-install disk image) remain undetectable from
    // inside the guest. UI surfaces this honestly.
    //
    // Cheap to run — file hashing on ~60 MB binaries is <100 ms; rest
    // is metadata. Frontend caches for ~3 min via the API client's
    // default TTL so opening the Identity tab multiple times in a
    // session doesn't re-hash on every paint.
    // ------------------------------------------------------------------
    router.get('/integrity', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const r = await IntegrityChecker.runAll({ log: extensionHandle.log });
            return res.json(successBody(r));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} GET /identity/integrity: ${err.message}`);
            return res.status(500).json(errorBody('Failed to run the integrity check.'));
        }
    });

    // ------------------------------------------------------------------
    // POST /identity/integrity/rebaseline    beta.3.46
    //
    // Operator-blessed reset of the integrity baseline. Used after a
    // legitimate change (binary update, keystore reset/import, owner
    // token rotation) so the next integrity run doesn't keep flagging
    // the "drift". Owner-gated, audit-logged. No body required.
    // ------------------------------------------------------------------
    router.post('/integrity/rebaseline', limit('admin'), requireOwner, async (req, res) => {
        const wallet = readActorWallet(req);
        try {
            const b = await IntegrityChecker.rebaseline({ log: extensionHandle.log });
            await _audit(getDb, extensionHandle.log, {
                walletAddress: wallet,
                decision: 'executed',
                outcome: 'Integrity baseline re-captured',
                payload: { action: 'integrity-rebaseline', capturedAt: b.capturedAt },
            });
            return res.json(successBody({ baseline: b }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} POST /identity/integrity/rebaseline: ${err.message}`);
            return res.status(500).json(errorBody('Could not re-capture the integrity baseline. Try again.'));
        }
    });

    return router;
}

/**
 * P1 (v0.5.183) — decide whether a null producer state is INDETERMINATE
 * (RPC couldn't confirm) versus genuinely "not a registered producer".
 *
 * getProducerState() flattens both cases to null. We disambiguate from
 * what the route can observe: if a keystore identity exists (cached
 * pubkey on disk), the node MIGHT be a registered producer whose state
 * we just failed to read — so a null is treated as indeterminate and the
 * destructive op is blocked unless force=true. If no identity exists yet,
 * there is nothing on-chain to orphan, so a null is safe to proceed on.
 *
 * A non-null producer is, by definition, a confirmed read — never
 * indeterminate.
 *
 * @param {object|null} producer  result of KeystoreIdentity.getProducerState
 * @returns {Promise<boolean>}
 */
async function _producerStateIndeterminate(producer) {
    if (producer) { return false; }
    try {
        const cached = await KeystoreIdentity.getCachedIdentity(CHAIN_ID);
        return !!(cached && cached.publicKey);
    } catch (_) {
        // If we can't even read the identity cache, fail safe: treat as
        // indeterminate so we don't wipe a possibly-registered keystore.
        return true;
    }
}

// v0.5.232 — _verifyAntiSnipe() removed. Its only caller was the retired
// POST /identity/reset handler. The canonical anti-snipe verifier is
// SelfHealingEngine._verifyAntiSnipePassword (same scrypt$<salt>$<hash>
// shape, see services/SelfHealingEngine.js:1125) — use that if any
// future code needs to gate destructive actions on anti-snipe.

/**
 * Best-effort audit write. Never blocks the action — operator already
 * authorised, losing the audit row is preferable to a 500 that leaves
 * them unsure whether the action ran.
 */
async function _audit(getDb, log, entry) {
    try {
        const db = getDb();
        await AuditLog.append(db, {
            walletAddress: entry.walletAddress || '0x0',
            chainId: CHAIN_ID,
            ruleId: null,
            tier: 'CRITICAL-INFO',
            decision: entry.decision,
            executor: 'operator',
            outcome: entry.outcome,
            payload: entry.payload,
        });
    } catch (err) {
        log.warn(`${ENM_LOG_PREFIX} identity audit append failed: ${err.message}`);
    }
}

module.exports = { build };
