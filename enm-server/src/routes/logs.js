/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * routes/logs.js — HTTP polling endpoint for log tails.
 *
 *   GET /api/logs/:chainId/tail?n=200
 *
 * Phase 3 ships a simple file-tail implementation. Full live streaming uses
 * the SSE endpoint at /api/events?topic=chains:<id>:logs (powered by
 * ProcessLogStreamer). This endpoint is for:
 *   - Initial page load — fetch recent history
 *   - Reattached chains — we don't have stdout pipes, only files on disk
 *   - Frontend reconnect — fetch missed window between SSE drops
 *
 * Every chain has a per-process stdout/stderr sink at chains/<id>/logs/<id>.log
 * (written by NativeProcessService, mirroring node.sh's per-process log files)
 * — this is what makes the tail work for the geth-fork sidechains, the oracle
 * node scripts, and the arbiter, none of which self-write a log dir. ela
 * mainchain additionally self-writes a richer structured log under
 * <dataDir>/elastos/logs/{node,dpos}/ rotated by ela itself (Rev 7 audit);
 * for mainchain we prefer that native log and fall back to the sink.
 */

'use strict';

const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');

const { ENM_LOG_PREFIX, errorBody, successBody } = require('../services/EnmConstants');
const { limit } = require('../services/EnmRateLimit');
const { readActorWallet } = require('../auth/OwnerCheckMiddleware');
const { chainDir, chainLogSinkPath } = require('../services/DataDir');

const DEFAULT_TAIL_LINES = 200;
const MAX_TAIL_LINES = 5000;
const TAIL_BYTE_BUDGET = 2 * 1024 * 1024; // 2 MiB read cap to bound memory

/**
 * @param {object} deps
 * @param {object} deps.extensionHandle
 * @returns {import('express').Router}
 */
function build(deps) {
    const { extensionHandle } = deps;
    const router = express.Router();

    /**
     * GET /:chainId/tail?n=200
     * Returns the last `n` lines of the chain's node log file.
     */
    router.get('/:chainId/tail', limit('read'), async (req, res) => {
        const wallet = readActorWallet(req);
        if (!wallet) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        const chainId = req.params.chainId;
        if (!/^[a-z0-9-]+$/.test(chainId)) {
            return res.status(400).json(errorBody(`Invalid chainId "${chainId}".`));
        }

        const requested = parseInt(req.query.n, 10);
        const n = Number.isInteger(requested) && requested > 0
            ? Math.min(requested, MAX_TAIL_LINES)
            : DEFAULT_TAIL_LINES;

        try {
            const lines = await tailLogFile(chainId, n);
            return res.json(successBody({ chainId, lines }));
        } catch (err) {
            if (err.code === 'ENOENT') {
                // No log file yet — chain hasn't started or hasn't logged.
                return res.json(successBody({ chainId, lines: [] }));
            }
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} GET /logs/${chainId}/tail failed: ${err.message}`,
            );
            return res.status(500).json(errorBody('Failed to read log file.'));
        }
    });

    return router;
}

/**
 * Return the last `n` lines of a chain's persisted log.
 *
 * Two log sources exist:
 *   1. The ENM per-chain stdout/stderr sink at chains/<id>/logs/<id>.log,
 *      written by NativeProcessService for EVERY chain (ela mainchain, the
 *      geth-fork EVM sidechains esc/eid/pg, the *-oracle node scripts, and
 *      the native arbiter). This is the only log the non-mainchain chains
 *      produce, mirroring node.sh's per-process tailable files.
 *   2. ela mainchain ALSO self-writes a richer structured log under
 *      elastos/logs/node/<timestamp>.log (rotated at 20 MB by ela itself,
 *      Rev 7 audit). It carries more than ela's piped stderr, so for
 *      mainchain we prefer the native log and fall back to the sink.
 *
 * For non-mainchain chains we read the sink; if it's missing we fall back to
 * the native node-log glob (harmless for chains that never create it). When
 * neither file exists yet we return [] (the route turns that into an empty
 * `lines` payload rather than a 500).
 *
 * @param {string} chainId
 * @param {number} n
 * @returns {Promise<Array<{ stream: 'file', line: string, ts: number }>>}
 */
async function tailLogFile(chainId, n) {
    const sinkPath = chainLogSinkPath(chainId);
    const nativeLogPath = await newestNativeNodeLog(chainId);

    // ela mainchain prefers its richer native log; every other chain has only
    // the sink. Either way, fall back to whichever file exists.
    const preferred = chainId === 'mainchain'
        ? [nativeLogPath, sinkPath]
        : [sinkPath, nativeLogPath];

    for (const candidate of preferred) {
        if (!candidate) {
            continue;
        }
        // 0.5.165 — C23: the sink is now size-rotated (active <id>.log +
        // one <id>.log.1). Right after a rotation the active file can be
        // tiny, so a tail of just <id>.log would look truncated. For the
        // sink only, span the tail across .log.1 when the active file
        // yields fewer than `n` lines — bounded so the COMBINED read never
        // exceeds TAIL_BYTE_BUDGET. The native ela log self-rotates and is
        // read unchanged.
        const lines = candidate === sinkPath
            ? await readSinkTailSpanningRotation(sinkPath, n)
            : await readTailOfFile(candidate, n);
        if (lines !== null) {
            return lines;
        }
    }
    return [];
}

/**
 * 0.5.165 — C23. Tail the size-rotated sink, spanning <id>.log.1 when the
 * active <id>.log is short (e.g. just after a rotation). Reads the active
 * file first within the byte budget; if it yields fewer than `n` lines and a
 * <id>.log.1 exists, reads the tail of .log.1 with the REMAINING budget and
 * prepends it, so the combined on-disk read never exceeds TAIL_BYTE_BUDGET.
 *
 * Returns null only when the active sink file is absent (preserving the
 * fallback-to-native contract in tailLogFile); otherwise an array (possibly
 * empty). A missing/oversized .log.1 is simply skipped — never fatal.
 *
 * @param {string} sinkPath active sink file path (chains/<id>/logs/<id>.log)
 * @param {number} n
 * @returns {Promise<Array<{ stream: 'file', line: string, ts: number }>|null>}
 */
async function readSinkTailSpanningRotation(sinkPath, n) {
    const active = await readTailBytes(sinkPath, n, TAIL_BYTE_BUDGET);
    if (active === null) {
        // No active sink file — let the caller fall back to the native log.
        return null;
    }
    if (active.lines.length >= n) {
        return active.lines;
    }
    // Active file came up short — try to backfill from the prior rotation,
    // but only with whatever budget the active read left unused so the
    // combined read stays within TAIL_BYTE_BUDGET.
    const remainingBudget = TAIL_BYTE_BUDGET - active.bytesRead;
    if (remainingBudget <= 0) {
        return active.lines;
    }
    const want = n - active.lines.length;
    const prev = await readTailBytes(`${sinkPath}.1`, want, remainingBudget);
    if (prev === null || prev.lines.length === 0) {
        return active.lines;
    }
    // Prepend the older rotation's tail (it precedes the active file in time).
    return prev.lines.concat(active.lines);
}

/**
 * Find the most recent rotated log file ela self-writes under
 * elastos/logs/node/. Returns null if the dir or any candidate is absent.
 *
 * @param {string} chainId
 * @returns {Promise<string|null>}
 */
async function newestNativeNodeLog(chainId) {
    const logDir = path.join(chainDir(chainId), 'elastos', 'logs', 'node');
    let entries;
    try {
        entries = await fs.readdir(logDir, { withFileTypes: true });
    } catch (err) {
        if (err.code === 'ENOENT') {
            return null;
        }
        throw err;
    }

    const candidates = entries
        .filter((e) => e.isFile() && e.name.endsWith('.log'))
        .map((e) => path.join(logDir, e.name));
    if (candidates.length === 0) {
        return null;
    }

    // Sort by mtime descending — most recent first.
    const stats = await Promise.all(candidates.map(async (p) => ({ p, stat: await fs.stat(p) })));
    stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    return stats[0].p;
}

/**
 * Read the last `n` lines of a single log file using a bounded tail read.
 *
 * Returns null if the file does not exist (so the caller can fall back to
 * another source); otherwise an array of line entries (possibly empty).
 *
 * @param {string} filePath
 * @param {number} n
 * @returns {Promise<Array<{ stream: 'file', line: string, ts: number }>|null>}
 */
async function readTailOfFile(filePath, n) {
    const res = await readTailBytes(filePath, n, TAIL_BYTE_BUDGET);
    return res === null ? null : res.lines;
}

/**
 * Bounded tail read of a single file with an explicit byte budget. Reads up to
 * `byteBudget` bytes from the END of the file (the whole file when smaller),
 * so callers that span multiple files (the C23 rotation pair) can divide one
 * shared budget between them and never exceed it in total.
 *
 * Returns null if the file does not exist (ENOENT) so callers can fall back;
 * otherwise `{ lines, bytesRead }` where `bytesRead` is the number of bytes
 * actually read from disk (for budget accounting).
 *
 * @param {string} filePath
 * @param {number} n        max line entries to return (last `n`)
 * @param {number} byteBudget  hard cap on bytes read from this file
 * @returns {Promise<{ lines: Array<{ stream: 'file', line: string, ts: number }>, bytesRead: number }|null>}
 */
async function readTailBytes(filePath, n, byteBudget) {
    if (!Number.isFinite(byteBudget) || byteBudget <= 0) {
        return { lines: [], bytesRead: 0 };
    }
    let stat;
    try {
        stat = await fs.stat(filePath);
    } catch (err) {
        if (err.code === 'ENOENT') {
            return null;
        }
        throw err;
    }
    if (!stat.isFile()) {
        return null;
    }

    // Read up to byteBudget bytes from the END of the file. For simplicity
    // we read the whole file when small; for big files we slice. Bounded so
    // operators don't trigger an OOM on a 20 MB log file.
    const readBytes = Math.min(stat.size, byteBudget);
    const handle = await fs.open(filePath, 'r');
    try {
        const buf = Buffer.alloc(readBytes);
        const offset = Math.max(0, stat.size - readBytes);
        await handle.read(buf, 0, readBytes, offset);
        const text = buf.toString('utf8');
        const lines = text.split('\n');
        // Drop the first line if we sliced mid-file — it's likely truncated.
        if (offset > 0 && lines.length > 0) {
            lines.shift();
        }
        const last = lines.slice(-n).filter((l) => l.length > 0);
        const ts = Date.now();
        return {
            lines: last.map((line) => ({ stream: 'file', line, ts })),
            bytesRead: readBytes,
        };
    } finally {
        await handle.close();
    }
}

module.exports = {
    build,
    tailLogFile,
    DEFAULT_TAIL_LINES,
    MAX_TAIL_LINES,
};
