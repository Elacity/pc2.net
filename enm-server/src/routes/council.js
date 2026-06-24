/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * /api/enm/council/* — Wave M2.2 (beta.3.90) — endpoints backing the
 * multi-chain overview pane (M2.3) and any future Council-scope APIs.
 *
 * Routes:
 *   GET  /overview  → aggregate snapshot for all configured chains
 *                     (read from CouncilOverviewService cache; falls
 *                     back to a fresh build when cache is empty)
 *
 * Auth: read-only — same posture as GET /api/enm/chains (any
 * authenticated wallet, no owner gate). Mutations would require
 * requireOwner; none exist yet in this surface.
 */

'use strict';

const express = require('express');

const { successBody, errorBody } = require('../services/EnmConstants');
const { readActorWallet } = require('../auth/OwnerCheckMiddleware');

/**
 * @param {object} deps
 * @param {object} deps.extensionHandle
 * @param {() => import('../services/CouncilOverviewService').CouncilOverviewService|null} deps.getOverviewService
 *        Lazy accessor for the CouncilOverviewService — wired in
 *        server.js after ChainRegistry.initHealing. Lazy so the
 *        router can mount during install.routes (overview service
 *        not yet built) and the first request finds it ready.
 * @returns {import('express').Router}
 */
function build(deps) {
    if (!deps || !deps.extensionHandle || typeof deps.getOverviewService !== 'function') {
        throw new TypeError(
            'routes/council.build: { extensionHandle, getOverviewService } required',
        );
    }
    const router = express.Router();

    router.get('/overview', async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        const svc = deps.getOverviewService();
        if (!svc) {
            // The healing engine isn't ready yet (boot still in
            // progress). Return an empty-but-shape-valid snapshot so
            // the M2.3 pane can render its empty state without an
            // error toast.
            return res.json(successBody({
                ts: Date.now(),
                chains: [],
                totals: {
                    total: 0, running: 0, enabled: 0, stopped: 0, disabled: 0,
                    byClass: { A: 0, B: 0, C: 0, D: 0, E: 0 },
                },
                stale: true,
                reason: 'overview-service-not-ready',
            }));
        }
        // Prefer the cached snapshot — it's published every 5s + on
        // every chain exit so it's usually <5s old. If cache is null
        // (very first request before the first tick), build a fresh
        // one synchronously.
        let snap = svc.getCachedSnapshot();
        if (!snap) {
            try {
                snap = await svc.build();
            } catch (err) {
                deps.extensionHandle.log.warn(
                    `[ENM] council/overview build failed: ${err.message}`,
                );
                return res.status(500).json(errorBody('Overview build failed.'));
            }
        }
        return res.json(successBody(snap));
    });

    return router;
}

module.exports = { build };
