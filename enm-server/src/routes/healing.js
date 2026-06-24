/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * routes/healing.js — OWNER-CONFIRMS proposal review endpoints.
 *
 *   GET  /healing/suggestions        list pending proposals scoped to caller wallet
 *   POST /healing/confirm/:id        owner-only — approve + execute
 *   POST /healing/reject/:id         owner-only — reject (optional reason)
 *   GET  /healing/history            recent terminal-state proposals (any tier)
 *
 * Confirm carries an optional anti-snipe password if the operator has set one
 * in PC2 (verified via PC2's bcrypt). Phase 4 ships a stub for the password
 * verification; if PC2 has no anti-snipe password set, the field is ignored.
 *
 * Auth: requireOwner on confirm + reject. Read-tier scopes for the list/history
 * endpoints (any authenticated user can read; write requires owner).
 */

'use strict';

const express = require('express');

const { ENM_LOG_PREFIX, errorBody, successBody } = require('../services/EnmConstants');
const { limit } = require('../services/EnmRateLimit');
const { requireOwner, readActorWallet } = require('../auth/OwnerCheckMiddleware');
const ProposalStore = require('../services/EnmProposalStore');
const HealthRules = require('../services/HealthRules');

/**
 * @param {object} deps
 * @param {object} deps.extensionHandle
 * @param {() => object} deps.getDb       lazy db handle (not ready at module load)
 * @param {object} deps.engine            SelfHealingEngine (Phase 4)
 * @returns {import('express').Router}
 */
function build(deps) {
    if (!deps || !deps.extensionHandle || typeof deps.getDb !== 'function' || !deps.engine) {
        throw new TypeError('routes/healing.build: { extensionHandle, getDb, engine } required');
    }
    const { extensionHandle, getDb, engine } = deps;
    const router = express.Router();

    // GET /suggestions — pending proposals for the authenticated wallet.
    router.get('/suggestions', limit('read'), async (req, res) => {
        const wallet = readActorWallet(req);
        if (!wallet) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const rows = await ProposalStore.listPending(getDb(), wallet);
            return res.json(successBody({ proposals: rows.map(serialize) }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} GET /healing/suggestions: ${err.message}`);
            return res.status(500).json(errorBody('Failed to list suggestions.'));
        }
    });

    // beta.3.21 — GET /rules.
    //
    // Phase 4 visibility. Returns the static rule registry: rule ID,
    // tier, operator-facing title + description, default-enabled
    // flag, and the currently-effective enabled flag (overrides
    // apply). Used by the Settings → Security section's "What auto-
    // runs" panel so the operator can see exactly what the healing
    // toggle controls. Read-only, authenticated, no rate-limit
    // sensitivity beyond the standard `read` bucket.
    router.get('/rules', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const rules = HealthRules.listRulesMetadata();
            return res.json(successBody({ rules }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} GET /healing/rules: ${err.message}`);
            return res.status(500).json(errorBody('Failed to list rules.'));
        }
    });

    // GET /history — recent (50) proposals for the authenticated wallet.
    router.get('/history', limit('read'), async (req, res) => {
        const wallet = readActorWallet(req);
        if (!wallet) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const lim = parseLimit(req.query.limit, 50);
            const rows = await ProposalStore.listRecent(getDb(), wallet, lim);
            return res.json(successBody({ proposals: rows.map(serialize) }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} GET /healing/history: ${err.message}`);
            return res.status(500).json(errorBody('Failed to load history.'));
        }
    });

    // POST /confirm/:id — owner approves + engine executes.
    router.post('/confirm/:id', limit('admin'), requireOwner, async (req, res) => {
        const id = req.params.id;
        if (!id || !/^enm_[a-z0-9_]+$/.test(id)) {
            return res.status(400).json(errorBody('Invalid proposal id.'));
        }
        // 0.2.0-beta.3.9 — frontend proposal-card sends an
        // antiSnipePassword field in the confirm body when the
        // proposal's payload sets requireAntiSnipe=true AND the host
        // has a nodeConfig.antiSnipePasswordHash configured. Extract
        // it here and pass to executeApproved; the engine verifies
        // against the stored hash before flipping the proposal to
        // APPROVED. Pre-beta.3.9 the field was extracted nowhere, so
        // the anti-snipe defense was silently a no-op — a confirm
        // arriving without a password (or with a wrong one) executed
        // anyway. Wire it through.
        const antiSnipePassword = req.body && typeof req.body.antiSnipePassword === 'string'
            ? req.body.antiSnipePassword
            : null;
        try {
            const result = await engine.executeApproved(id, req.actorWallet, { antiSnipePassword });
            if (!result.ok) {
                const status = result.error && result.error.indexOf('not found') >= 0 ? 404 : 409;
                return res.status(status).json(errorBody(result.error || 'Confirm failed.'));
            }
            return res.json(successBody({
                proposal: serialize(result.proposal),
                executed: !!result.executed,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} POST /healing/confirm/${id}: ${err.message}`);
            return res.status(500).json(errorBody('Confirm failed.'));
        }
    });

    // POST /reject/:id — owner rejects (optional reason).
    router.post('/reject/:id', limit('admin'), requireOwner, async (req, res) => {
        const id = req.params.id;
        if (!id || !/^enm_[a-z0-9_]+$/.test(id)) {
            return res.status(400).json(errorBody('Invalid proposal id.'));
        }
        const reason = req.body && typeof req.body.reason === 'string' ? req.body.reason : null;
        try {
            const result = await engine.rejectProposal(id, req.actorWallet, reason);
            if (!result.ok) {
                const status = result.error && result.error.indexOf('not found') >= 0 ? 404 : 409;
                return res.status(status).json(errorBody(result.error || 'Reject failed.'));
            }
            return res.json(successBody({ proposal: serialize(result.proposal) }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} POST /healing/reject/${id}: ${err.message}`);
            return res.status(500).json(errorBody('Reject failed.'));
        }
    });

    return router;
}

/**
 * Convert a raw proposal row into the wire shape the frontend modal expects.
 * Snake-case stays for forward-compat with v0.2 (PC2 modal reuse), so the
 * frontend's null-safety treats both shapes alike.
 *
 * @param {object} row
 * @returns {object|null}
 */
function serialize(row) {
    if (!row) return null;
    return {
        id: row.id,
        wallet_address: row.wallet_address,
        chain_id: row.chain_id,
        rule_id: row.rule_id,
        type: row.type,
        status: row.status,
        summary_action: row.summary_action,
        summaryAction: row.summary_action,
        summary_reason: row.summary_reason,
        summaryReason: row.summary_reason,
        proposed_at: row.proposed_at,
        proposedAt: row.proposed_at,
        expires_at: row.expires_at,
        expiresAt: row.expires_at,
        approved_at: row.approved_at,
        rejected_at: row.rejected_at,
        executed_at: row.executed_at,
        rejection_reason: row.rejection_reason,
        outcome: row.outcome,
    };
}

function parseLimit(v, def) {
    const n = parseInt(v, 10);
    if (!Number.isInteger(n) || n <= 0) return def;
    return Math.min(n, 500);
}

module.exports = { build };
