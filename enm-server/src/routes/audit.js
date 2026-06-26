/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * routes/audit.js — paginated audit log query endpoint.
 *
 *   GET /audit                        own wallet's audit rows (most recent 100)
 *   GET /audit?chainId=&tier=&from=&to=&limit=&offset=
 *
 * The CSV / JSON export option in the dashboard hits the same endpoint with
 * limit=500 and the page composes a Blob client-side. Server stays simple.
 *
 * Auth (beta.3.52): owner-gated. ENM is single-tenant — one operator, one
 * keystore — so the previous "filter rows by actor wallet" model was both
 * unnecessary and actively wrong: it forced PC2 wallet to be propagated into
 * every audit row, coupling PC2 identity to ENM's data model. We now gate at
 * the route level with requireOwner and return ALL rows. The PC2 wallet never
 * leaves the auth boundary.
 */

'use strict';

const express = require('express');

const { ENM_LOG_PREFIX, errorBody, successBody } = require('../services/EnmConstants');
const { limit } = require('../services/EnmRateLimit');
const { requireOwner } = require('../auth/OwnerCheckMiddleware');
const AuditLog = require('../services/EnmAuditLog');

const ALLOWED_TIERS = new Set([
    'AUTOMATED-SAFE', 'OWNER-CONFIRMS', 'CRITICAL-NOTIFY', 'NEVER-AUTOMATIC',
    'HTTP-MUTATION',
]);

/**
 * @param {object} deps
 * @param {object} deps.extensionHandle
 * @param {() => object} deps.getDb
 * @returns {import('express').Router}
 */
function build(deps) {
    if (!deps || !deps.extensionHandle || typeof deps.getDb !== 'function') {
        throw new TypeError('routes/audit.build: { extensionHandle, getDb } required');
    }
    const { extensionHandle, getDb } = deps;
    const router = express.Router();

    router.get('/', limit('read'), requireOwner, async (req, res) => {
        // beta.3.52 — requireOwner gates the route. No more wallet-filter
        // inside the query; the owner sees every audit row in the table
        // (HTTP-MUTATION, AUTOMATED-SAFE/AUTOSTART, CRITICAL-INFO, etc.).
        try {
            const opts = {
                chainId: typeof req.query.chainId === 'string' ? req.query.chainId : undefined,
                tier: parseTier(req.query.tier),
                fromTs: parseTs(req.query.from),
                toTs: parseTs(req.query.to),
                limit: parseInt(req.query.limit, 10),
                offset: parseInt(req.query.offset, 10),
            };
            const rows = await AuditLog.query(getDb(), opts);
            return res.json(successBody({
                entries: rows.map(decodeRow),
                count: rows.length,
                limit: opts.limit || 100,
                offset: opts.offset || 0,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} GET /audit: ${err.message}`);
            return res.status(500).json(errorBody('Failed to query audit log.'));
        }
    });

    return router;
}

function parseTier(v) {
    if (typeof v !== 'string') return undefined;
    return ALLOWED_TIERS.has(v) ? v : undefined;
}

function parseTs(v) {
    if (v == null || v === '') return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.floor(n);
}

/**
 * Convert raw row → wire shape: parse payload_json, expose camelCase aliases
 * alongside snake_case. Bad JSON in payload_json shows as `null` rather than
 * blowing up the whole audit tab.
 */
function decodeRow(row) {
    let payload = null;
    if (row && typeof row.payload_json === 'string') {
        try {
            payload = JSON.parse(row.payload_json);
        } catch {
            payload = null;
        }
    }
    return {
        id: row.id,
        ts: row.ts,
        wallet_address: row.wallet_address,
        walletAddress: row.wallet_address,
        chain_id: row.chain_id,
        chainId: row.chain_id,
        rule_id: row.rule_id,
        ruleId: row.rule_id,
        tier: row.tier,
        decision: row.decision,
        executor: row.executor,
        outcome: row.outcome,
        duration_ms: row.duration_ms,
        durationMs: row.duration_ms,
        payload,
    };
}

module.exports = { build };
