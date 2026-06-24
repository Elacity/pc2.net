/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * LogCompactor — gzip + rotate ela's on-disk log files.
 *
 * ela writes to elastos/logs/node/*.log and elastos/logs/dpos/*.log; on a
 * BPoS supernode they grow ~50-200 MB/day. ela does not rotate them itself.
 * Without rotation, /var fills up and F5 fires (or worse, the chain halts
 * mid-vote because of a write failure).
 *
 * What this module does:
 *   1. Walks the on-disk log dirs under chainDir/elastos/logs.
 *   2. For files older than `gzipAfterDays` (default 7), gzips them in place
 *      to *.log.<date>.gz, keeping the original mtime as the compressed name
 *      suffix so future scans skip them.
 *   3. For *.gz files older than `purgeAfterDays` (default 90), deletes them.
 *   4. Returns a structured report so the dashboard can show "freed 1.2 GB
 *      across 14 files".
 *
 * Idempotent and safe to run while ela is live — gzipping a closed log file
 * doesn't disturb a running ela. The CURRENT log file (today's) is left
 * alone; only files older than gzipAfterDays get rotated.
 *
 * Wiring:
 *   - main.js scheduler calls compactNow() once at boot and every 24h.
 *   - Settings → Mainchain Advanced → "Compact logs now" button hits the
 *     POST /chains/:id/compact-logs route which calls this directly.
 *   - cfg.global.logRotation.gzipAfterDays / purgeAfterDays are operator-
 *     tunable (default 7 / 90).
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { pipeline } = require('node:stream/promises');

const { ENM_LOG_PREFIX } = require('./EnmConstants');
const { chainDir } = require('./DataDir');

const DEFAULT_GZIP_AFTER_DAYS = 1; // v0.5.194 — gzip inactive rotated logs after 1 day (was 7)
const DEFAULT_PURGE_AFTER_DAYS = 90;
// 'logs' covers ENM's per-chain stdout/stderr sink (chains/<id>/logs/<id>.log,
// written by NativeProcessService for every chain) so it's gzipped + purged by
// the same daily pass and never grows unbounded. The elastos/* entries cover
// ela mainchain's own rotated node/dpos logs.
const DEFAULT_LOG_SUBDIRS = ['elastos/logs/node', 'elastos/logs/dpos', 'elastos/logs', 'logs'];

/**
 * @typedef {object} CompactReport
 * @property {string} chainId
 * @property {number} gzipped     count of files compressed this run
 * @property {number} purged      count of *.gz files deleted this run
 * @property {number} bytesFreed  approximate bytes saved by compression + delete
 * @property {string[]} files     paths touched (capped at 50 for the response)
 * @property {Array<{path:string, error:string}>} errors per-file failures
 */

/**
 * Run one compaction pass on a chain's log dir.
 *
 * @param {object} args
 * @param {string} args.chainId
 * @param {number} [args.gzipAfterDays]
 * @param {number} [args.purgeAfterDays]
 * @param {object} [args.logger]
 * @returns {Promise<CompactReport>}
 */
async function compactNow(args) {
    if (!args || typeof args.chainId !== 'string') {
        throw new TypeError('compactNow: { chainId } required');
    }
    const log = args.logger || { info() {}, warn() {}, debug() {} };
    const gzipAfterMs = msFromDays(args.gzipAfterDays, DEFAULT_GZIP_AFTER_DAYS);
    const purgeAfterMs = msFromDays(args.purgeAfterDays, DEFAULT_PURGE_AFTER_DAYS);

    /** @type {CompactReport} */
    const report = {
        chainId: args.chainId,
        gzipped: 0,
        purged: 0,
        bytesFreed: 0,
        files: [],
        errors: [],
    };

    const baseDir = chainDir(args.chainId);
    const now = Date.now();

    for (const sub of DEFAULT_LOG_SUBDIRS) {
        const dir = path.join(baseDir, sub);
        let entries;
        try {
            entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch (err) {
            if (err.code !== 'ENOENT') {
                log.debug(`${ENM_LOG_PREFIX} compact: readdir ${dir} failed: ${err.message}`);
            }
            continue;
        }

        for (const ent of entries) {
            if (!ent.isFile()) continue;
            const full = path.join(dir, ent.name);
            const stat = await fsp.stat(full).catch(() => null);
            if (!stat) continue;
            const ageMs = now - stat.mtimeMs;

            // 1. Gzip plain *.log files older than threshold.
            if (ent.name.endsWith('.log') && ageMs > gzipAfterMs) {
                try {
                    const stamp = new Date(stat.mtimeMs).toISOString().slice(0, 10);
                    const gzPath = `${full}.${stamp}.gz`;
                    if (fs.existsSync(gzPath)) {
                        // Skip — earlier run already produced this archive
                        // for the same date. Avoids redundant compression.
                        continue;
                    }
                    const sizeBefore = stat.size;
                    await pipeline(
                        fs.createReadStream(full),
                        zlib.createGzip({ level: zlib.constants.Z_BEST_COMPRESSION }),
                        fs.createWriteStream(gzPath, { mode: 0o600 }),
                    );
                    const gzStat = await fsp.stat(gzPath);
                    await fsp.unlink(full);
                    report.gzipped += 1;
                    report.bytesFreed += Math.max(0, sizeBefore - gzStat.size);
                    if (report.files.length < 50) report.files.push(gzPath);
                } catch (err) {
                    report.errors.push({ path: full, error: err.message });
                    log.warn(`${ENM_LOG_PREFIX} compact: gzip ${full} failed: ${err.message}`);
                }
                continue;
            }

            // 2. Purge old *.gz archives.
            if (ent.name.endsWith('.gz') && ageMs > purgeAfterMs) {
                try {
                    const sizeBefore = stat.size;
                    await fsp.unlink(full);
                    report.purged += 1;
                    report.bytesFreed += sizeBefore;
                    if (report.files.length < 50) report.files.push(full);
                } catch (err) {
                    report.errors.push({ path: full, error: err.message });
                    log.warn(`${ENM_LOG_PREFIX} compact: unlink ${full} failed: ${err.message}`);
                }
            }
        }
    }

    log.info(
        `${ENM_LOG_PREFIX} log compaction ${args.chainId}: `
        + `gzipped=${report.gzipped} purged=${report.purged} bytesFreed=${report.bytesFreed}`,
    );
    return report;
}

function msFromDays(input, fallback) {
    const n = Number(input);
    if (!Number.isFinite(n) || n < 0) {
        return fallback * 24 * 60 * 60 * 1000;
    }
    return n * 24 * 60 * 60 * 1000;
}

module.exports = {
    compactNow,
    DEFAULT_GZIP_AFTER_DAYS,
    DEFAULT_PURGE_AFTER_DAYS,
    DEFAULT_LOG_SUBDIRS,
};
