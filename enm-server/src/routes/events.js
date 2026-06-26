/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * routes/events.js — single SSE endpoint for the dashboard.
 *
 *   GET /api/events?topic=chains:mainchain:logs&topic=chains:mainchain:status
 *
 * Browser code: `new EventSource('/extensions/elastos-node-manager/api/events?...')`
 * Each `topic` query param subscribes the response to that topic.
 *
 * Auth: must have an authenticated session (readActorWallet). We do NOT
 * require owner here — viewing log/status is a read operation. Rate-limited
 * via EnmRateLimit (read scope, 100/min). One open connection generally
 * counts as 1 req in our limiter; the heartbeat is server-internal.
 *
 * Topic safelist:
 *   system
 *   notifications
 *   chains:<chainId>:status
 *   chains:<chainId>:logs
 */

'use strict';

const express = require('express');

const { ENM_LOG_PREFIX, errorBody } = require('../services/EnmConstants');
const { limit } = require('../services/EnmRateLimit');
const { readActorWallet } = require('../auth/OwnerCheckMiddleware');

function looksLikeEvm(addr) {
    return typeof addr === 'string' && addr.length === 42 && addr.startsWith('0x');
}

// 0.2.0-alpha.3 — `height` joined the chain topic set in phase 4 of
// the Apple Hero rewrite. HealthChecker publishes (t, h) deltas on
// chains:<id>:height every 30s; the chain-card's sparkline subscribes
// via the height-series client. Forgetting to add `height` to this
// whitelist 400'd every SSE connect and looped the client forever.
// 0.2.0-beta.3.8 — `audit` topic added. EnmAuditLog.append publishes
// every new row to this topic via publishToWallet (scoped to the row's
// wallet) so the operator's audit-tab SSE subscription receives live
// updates instead of having to reload. The wallet scoping protects
// per-operator privacy: row writes for other wallets never reach this
// connection.
//
// 0.2.0-beta.3.9 — `setup:install:<chainId>` and `setup:bootstrap:
// <chainId>` topics added. EnmBinaryDownloader._emit and
// EnmBootstrapDownloader._emit publish progress events here so the
// setup-conversation wizard's live progress bar updates without
// polling. Pre-beta.3.9 these topics were rejected by the events
// route (TOPIC_REGEX miss) AND the downloaders were calling a non-
// existent .broadcast() method anyway. Both fixed in beta.3.9; the
// regex now matches the topic names the downloaders publish.
//
// 0.2.0-beta.3.90 (Wave M2.2) — `council:overview` topic added.
// CouncilOverviewService publishes a snapshot every 5s + on every
// chain exit. MultiChainOverviewPane (M2.3) subscribes here to
// keep the aggregate dashboard live without polling. Topic is
// fixed-name (not parameterized) — there's a single Council scope
// per ENM install. Future per-class topics (e.g. council:dpos)
// would extend this disjunction.
// beta.0.4.4 — `setup:council:install` added. The install-council
// orchestrator (routes/setup.js runCouncilInstall) emits per-step
// progress on this topic; the wizard's Card F stepper subscribes for
// live updates. Fixed name (single orchestrator per ENM install).
const TOPIC_REGEX = /^(?:system|notifications|audit|chains:[a-z0-9-]+:(?:status|logs|height)|setup:(?:install|bootstrap):[a-z0-9-]+|council:overview|setup:council:install)$/;
const MAX_TOPICS_PER_REQUEST = 16;

/**
 * @param {object} deps
 * @param {object} deps.extensionHandle
 * @param {import('../services/SseHub').SseHub} deps.sseHub
 * @returns {import('express').Router}
 */
function build(deps) {
    if (!deps || !deps.sseHub || !deps.extensionHandle) {
        throw new TypeError('routes/events.build: { extensionHandle, sseHub } required');
    }
    const { sseHub, extensionHandle } = deps;
    const router = express.Router();

    router.get('/', limit('read'), (req, res) => {
        const wallet = readActorWallet(req);
        if (!wallet) {
            return res.status(401).json(errorBody('Authentication required.'));
        }

        // Express normalizes ?topic=a&topic=b into either an array or a single string.
        const raw = req.query.topic;
        const topics = Array.isArray(raw) ? raw : (raw ? [raw] : []);
        if (topics.length === 0) {
            return res.status(400).json(errorBody('At least one ?topic= is required.'));
        }
        if (topics.length > MAX_TOPICS_PER_REQUEST) {
            return res.status(400).json(errorBody(
                `At most ${MAX_TOPICS_PER_REQUEST} topics per connection.`,
            ));
        }

        for (const t of topics) {
            if (typeof t !== 'string' || !TOPIC_REGEX.test(t)) {
                return res.status(400).json(errorBody(`Invalid topic "${t}".`));
            }
        }

        // Long-lived SSE responses must not be killed by Node's default socket
        // timeout. setTimeout(0) disables it; keepAlive keeps the TCP socket
        // active across reverse proxies (Phase 3 audit, agent 4).
        if (res.socket) {
            res.socket.setKeepAlive(true);
        }
        if (typeof res.setTimeout === 'function') {
            res.setTimeout(0);
        }

        try {
            // Normalize EVM-shaped wallets to lowercase so per-wallet SSE
            // routing (publishToWallet) compares apples to apples regardless
            // of how the operator typed it during sign-in (Phase 4 audit).
            const normalized = looksLikeEvm(wallet) ? wallet.toLowerCase() : wallet;
            sseHub.subscribe(res, { topics, walletAddress: normalized });
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} SSE subscribe failed: ${err.message}`);
            // sseHub.subscribe may have set headers — only respond if we can.
            if (!res.headersSent) {
                return res.status(500).json(errorBody(err.message));
            }
            return undefined;
        }
        return undefined;
    });

    return router;
}

module.exports = {
    build,
    TOPIC_REGEX,
    MAX_TOPICS_PER_REQUEST,
};
