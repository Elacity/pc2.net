/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * DiskPreflight — free-disk-space check for the chain data dir.
 *
 * Mainnet DB grows 50–80 GB initial sync + 2–5 GB/month (Rev 4 audit).
 *
 * Thresholds (from package.json `enm.minDiskFreeGb` / `warnDiskFreeGb`):
 *   < 50 GB free   → hard stop, refuse setup
 *   < 100 GB free  → warning, allow with explicit ack
 *   ≥ 100 GB free  → ok
 *
 * Uses fs.statfs (Node 18.15+, native — no extra dep). Path can be the chain
 * data dir or any directory on the same filesystem.
 */

'use strict';

const fsp = require('node:fs/promises');

const { gbDisplay } = require('./EnmFormat');

const HARD_STOP_GB = 50;
const WARN_GB = 100;
const BYTES_PER_GB = 1024 * 1024 * 1024;

/**
 * @typedef {object} DiskPreflightResult
 * @property {boolean} ok
 * @property {'critical'|'warning'|'good'} status
 * @property {number} freeGb
 * @property {number} totalGb
 * @property {string} [reason]
 */

/**
 * @param {string} dirPath
 * @returns {Promise<DiskPreflightResult>}
 */
async function check(dirPath) {
    if (!dirPath || typeof dirPath !== 'string') {
        throw new TypeError('DiskPreflight.check: dirPath required');
    }

    let stats;
    try {
        stats = await fsp.statfs(dirPath);
    } catch (_) {
        // 0.5.116 audit Session 116 — replaced err.message interpolation
        // with a static fallback. Pre-0.5.116 we leaked Node fs errno
        // strings ("ENOENT: no such file...", EACCES details) into the
        // setup wizard's system-check copy. Path is already in the
        // message, and the recovery action is the same regardless of
        // which fs errno fired — fix the path or fix the mount.
        // Matches Sessions 64/67/79/81-84 + 107-112 leak-sweep pattern.
        return {
            ok: false,
            status: 'critical',
            freeGb: 0,
            totalGb: 0,
            reason: `Could not read filesystem stats for ${dirPath}. Check the path exists and is accessible.`,
        };
    }

    // bavail = blocks available to non-root user. We choose `bavail` over
    // `bfree` even though PC2 runs as root (so we technically have access
    // to the reserved blocks) — `bavail` is the conservative number:
    // under-reports free space, never lets a borderline host through. Same
    // rationale as EnmSystemCheck.checkDisk's bavail usage.
    // 0.5.116 audit Session 116 — corrected stale comment that claimed
    // "NOT root". PC2 runs as root in production (verified per project
    // deployment notes); the comment now reflects the actual runtime
    // contract.
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    const freeGb = freeBytes / BYTES_PER_GB;
    const totalGb = totalBytes / BYTES_PER_GB;

    if (freeGb < HARD_STOP_GB) {
        return {
            ok: false,
            status: 'critical',
            freeGb,
            totalGb,
            reason: `Less than ${HARD_STOP_GB} GB free on ${dirPath} (${gbDisplay(freeGb)} GB available). Mainnet DB requires ~50–80 GB initial sync plus 2–5 GB/month growth.`,
        };
    }
    if (freeGb < WARN_GB) {
        return {
            ok: true,
            status: 'warning',
            freeGb,
            totalGb,
            reason: `${gbDisplay(freeGb)} GB free — recommended minimum is ${WARN_GB} GB for ~10 months of chain growth headroom.`,
        };
    }
    return { ok: true, status: 'good', freeGb, totalGb };
}

module.exports = {
    check,
    HARD_STOP_GB,
    WARN_GB,
};
