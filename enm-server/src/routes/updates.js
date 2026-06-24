/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * routes/updates.js — read-only update-available endpoint backing
 * the Tools tab Binary Update card (0.2.0-alpha.8).
 *
 * Endpoints:
 *   GET /api/enm/updates/available[?refresh=1]
 *     Returns the current EnmUpdateScanner envelope. With ?refresh=1
 *     the scanner is forced to re-poll GitHub (rate-limited at the
 *     standard /read bucket so an angry operator can't burn the
 *     anonymous 60 req/h budget).
 *
 * Future endpoints (alpha.9 / .10):
 *   POST /api/enm/updates/start    (preflight + execute)
 *   GET  /api/enm/updates/status   (in-flight state machine)
 *   POST /api/enm/updates/snooze   (operator dismiss)
 */

'use strict';

const express = require('express');

const { ENM_LOG_PREFIX, errorBody, successBody } = require('../services/EnmConstants');
const { limit } = require('../services/EnmRateLimit');
const { readActorWallet } = require('../auth/OwnerCheckMiddleware');
const ConfigStore = require('../services/ConfigStore');
const ChainRegistry = require('../services/ChainRegistry');
const UpdateScanner = require('../services/EnmUpdateScanner');

function build(extensionHandle) {
    const router = express.Router();

    router.get('/available', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            // Pull the currently-installed binary version from the chain
            // config. EnmBinaryLocator.smokeTest() writes this on every
            // successful start, so it's the truthful "what's running."
            let currentVersion = null;
            try {
                const cfg = await ConfigStore.load();
                const mainchain = cfg && cfg.chains && cfg.chains.mainchain;
                if (mainchain && typeof mainchain.binaryVersion === 'string') {
                    currentVersion = mainchain.binaryVersion;
                }
            } catch (_) { /* config not loaded yet; envelope just reports current=null */ }

            const scanner = UpdateScanner.getInstance({ logger: extensionHandle.log });
            const envelope = await scanner.snapshot({
                refresh: req.query && req.query.refresh === '1',
                currentVersion,
            });
            return res.json(successBody(envelope));
        } catch (err) {
            // 0.2.0-alpha.11 — log the full stack so operators can grep
            // the actual failure mode out of pc2-node.log when the card
            // shows "Update info endpoint returned an error." The msg
            // alone (e.g. "Cannot read properties of undefined") doesn't
            // tell you which line.
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} GET /updates/available: ${err && err.message ? err.message : err}`,
            );
            if (err && err.stack) {
                extensionHandle.log.error(`${ENM_LOG_PREFIX} /updates/available stack: ${err.stack}`);
            }
            return res.status(500).json(errorBody('Failed to fetch update info: ' + (err && err.message ? err.message : 'unknown')));
        }
    });

    return router;
}

module.exports = { build };
