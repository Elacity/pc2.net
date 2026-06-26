/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmSetupHelpers — small pure functions used by routes/setup.js. Extracted
 * here so they can be unit-tested without pulling in Express (which is a
 * peer dep we get from PC2 at runtime, not a direct devDep).
 */

'use strict';

const crypto = require('node:crypto');
const path = require('node:path');

/**
 * Per-wallet stash filename component. We don't put the wallet in the
 * filename directly — long EVM addresses are 42 chars and would make
 * filesystem listings noisy. SHA-256 first 12 hex chars is unique enough
 * for collision resistance within a single PC2 install (~3.6e14 buckets).
 *
 * Lowercases EVM-shaped input so case-variant addresses map to the same
 * scope id and the stash files don't multiply.
 *
 * @param {string} wallet
 * @returns {string} 12-char hex
 */
function walletScopeId(wallet) {
    return crypto.createHash('sha256')
        .update(String(wallet).toLowerCase())
        .digest('hex')
        .slice(0, 12);
}

/**
 * Validate a path the operator typed for keystore.dat. Returns {ok, reason?}.
 * Static checks only — no filesystem access. The route handler does the
 * fs.stat + size check separately so it can return the specific reason.
 *
 * @param {string} keystorePath
 */
function validateKeystorePath(keystorePath) {
    if (typeof keystorePath !== 'string' || keystorePath.length === 0) {
        return { ok: false, reason: 'keystorePath is required' };
    }
    if (!path.isAbsolute(keystorePath)) {
        return { ok: false, reason: 'keystorePath must be absolute' };
    }
    if (keystorePath.split(path.sep).some((seg) => seg === '..')) {
        return { ok: false, reason: 'keystorePath contains parent-directory references' };
    }
    return { ok: true };
}

module.exports = {
    walletScopeId,
    validateKeystorePath,
};
