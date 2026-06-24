/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * ProcessMetrics — per-PID CPU%, RSS, file-descriptor count from /proc.
 *
 * Why this exists: the multi-chain overview pane (v0.5.203) needs per-chain
 * process metrics to render usage cards + a "is this chain actually doing
 * work?" signal. The mainchain leveldb-compaction case (cycle-14 audit,
 * 2026-05-24) sat invisibly at 100% CPU for 6+ minutes; only `top` on the
 * box exposed it. Surfacing CPU% per chain in the overview makes that
 * visible without ssh.
 *
 * Mechanics:
 *
 *   - RSS:   /proc/<pid>/statm field 2 (resident pages) × page size
 *   - FD:    count of entries in /proc/<pid>/fd/
 *   - CPU%:  delta of (utime + stime) ticks between two samples, divided by
 *            delta wall-clock × clock-ticks-per-second × cores.
 *            Per-PID sample cache holds the last (timestamp, totalTicks) so
 *            the first getMetrics() call returns cpuPct=null (no delta yet)
 *            and subsequent calls return percent-of-one-core (so a 4-core
 *            box running flat-out at 400% reports 400, not 100). UI can
 *            normalize against the system cores count if a 0-100 scale is
 *            preferred.
 *
 * All reads are best-effort. /proc may be unavailable (macOS dev box,
 * containerized env without proc mount, race where pid exits between read
 * and stat). Returns nulls on any failure — never throws.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROC_ROOT = '/proc';

// Linux user_hz — clock ticks per second. Exposed via sysconf(_SC_CLK_TCK)
// but Node doesn't expose sysconf, so we use the de-facto-universal value
// (100 Hz on every modern kernel including the kernels Ubuntu 22.04/24.04
// ship). If a custom kernel uses a different USER_HZ this would skew CPU%;
// not worth a getconf shell-out for the 99.9% case.
const USER_HZ = 100;
// Page size in bytes for the RSS calculation. Same posture as USER_HZ —
// always 4096 on x86_64 Linux; ARM64 can be 16k but cloud VPSes use 4k.
const PAGE_SIZE_BYTES = 4096;

// In-memory per-PID sample cache for CPU% delta calc. {pid: {ts, ticks}}.
// Cleared on getMetrics(null pid) and when a stat read fails (the PID may
// have exited; the next start under a recycled PID would otherwise see a
// stale baseline and report a huge spike).
const _cpuSampleCache = new Map();

// v0.5.208 — per-PID result cache to stop back-to-back ticks from re-reading
// /proc for the same PID. The CouncilOverviewService ticks every 2s; if a
// frontend poll for /system/usage hits the API mid-tick the cache means
// only ONE actual /proc read per PID per RESULT_CACHE_TTL_MS regardless of
// how many callers ask. Significant relief on a CPU-saturated host where
// /proc reads themselves contend for CPU.
const _resultCache = new Map();
const RESULT_CACHE_TTL_MS = 3_000;

/**
 * Read /proc/<pid>/stat field 14+15 (utime+stime — total CPU time in
 * USER_HZ ticks consumed by this process).
 *
 * The format is space-separated but field 2 (comm) is parenthesized and can
 * contain spaces — split on the LAST `)` to recover positional fields safely.
 *
 * @param {number} pid
 * @returns {number|null} ticks, or null if /proc unavailable
 */
function readCpuTicks(pid) {
    try {
        const raw = fs.readFileSync(path.join(PROC_ROOT, String(pid), 'stat'), 'utf8');
        const closeParen = raw.lastIndexOf(')');
        if (closeParen < 0) { return null; }
        const after = raw.slice(closeParen + 2);  // skip ") "
        const fields = after.split(' ');
        // fields[0]=state, fields[1]=ppid, ..., fields[11]=utime, fields[12]=stime
        // (after the close-paren split, indices shift by 2 relative to the
        // raw /proc/<pid>/stat numbering)
        const utime = parseInt(fields[11], 10);
        const stime = parseInt(fields[12], 10);
        if (!Number.isFinite(utime) || !Number.isFinite(stime)) { return null; }
        return utime + stime;
    } catch (_) {
        return null;
    }
}

/**
 * Read /proc/<pid>/statm field 2 (resident set size in pages).
 *
 * @param {number} pid
 * @returns {number|null} RSS in bytes, or null if /proc unavailable
 */
function readRssBytes(pid) {
    try {
        const raw = fs.readFileSync(path.join(PROC_ROOT, String(pid), 'statm'), 'utf8');
        const fields = raw.trim().split(' ');
        const rssPages = parseInt(fields[1], 10);
        if (!Number.isFinite(rssPages)) { return null; }
        return rssPages * PAGE_SIZE_BYTES;
    } catch (_) {
        return null;
    }
}

/**
 * Count entries in /proc/<pid>/fd/ — the number of open file descriptors.
 * Useful for "ela is holding 290 fds" type diagnostics; spike usually means
 * a peer leak or leveldb compaction storm.
 *
 * @param {number} pid
 * @returns {number|null}
 */
function readFdCount(pid) {
    try {
        const entries = fs.readdirSync(path.join(PROC_ROOT, String(pid), 'fd'));
        return entries.length;
    } catch (_) {
        return null;
    }
}

/**
 * Read /proc/<pid>/status field "Threads:" — useful for chains that spawn a
 * lot of worker threads under load (geth typically runs 30+ goroutines as
 * OS threads).
 *
 * @param {number} pid
 * @returns {number|null}
 */
function readThreadCount(pid) {
    try {
        const raw = fs.readFileSync(path.join(PROC_ROOT, String(pid), 'status'), 'utf8');
        const m = raw.match(/^Threads:\s*(\d+)/m);
        if (!m) { return null; }
        const n = parseInt(m[1], 10);
        return Number.isFinite(n) ? n : null;
    } catch (_) {
        return null;
    }
}

/**
 * Get current process metrics for a PID. CPU% is null on the first call for
 * a given PID (need two samples for a delta) and reports percent-of-one-core
 * thereafter — so a process pinned at 100% on a single core reports 100, a
 * process saturating 4 cores reports ~400. UI normalizes against system
 * cores count if a 0-100 scale is wanted.
 *
 * @param {number|null|undefined} pid
 * @returns {{cpuPct: number|null, rssMb: number|null, fdCount: number|null, threadCount: number|null}}
 */
function getMetrics(pid) {
    const result = { cpuPct: null, rssMb: null, fdCount: null, threadCount: null };
    if (typeof pid !== 'number' || !Number.isFinite(pid) || pid <= 0) {
        return result;
    }

    // v0.5.208 — result cache. Saves redundant /proc reads when multiple
    // callers (CouncilOverviewService tick + /system/usage HTTP poll +
    // chain-card /chains/:id detail) ask for the same PID inside a 3s
    // window. CPU% deltas stay correct because the cache stores the
    // FINAL result for the PID (the in-flight cpuSampleCache the delta
    // math uses is untouched — a cached result was computed against a
    // real baseline so re-reading isn't needed).
    const cached = _resultCache.get(pid);
    if (cached && (Date.now() - cached.ts) < RESULT_CACHE_TTL_MS) {
        return cached.result;
    }

    // RSS / FD / threads are point-in-time reads.
    const rssBytes = readRssBytes(pid);
    if (typeof rssBytes === 'number') {
        result.rssMb = Math.round((rssBytes / (1024 * 1024)) * 10) / 10;  // 1 decimal place
    }
    result.fdCount = readFdCount(pid);
    result.threadCount = readThreadCount(pid);

    // CPU% needs two samples.
    const ticks = readCpuTicks(pid);
    const nowMs = Date.now();
    if (ticks == null) {
        // PID may have exited mid-read; drop any stale sample so we don't
        // compute a fake spike when a new process is born under the same PID.
        _cpuSampleCache.delete(pid);
        return result;
    }
    const prev = _cpuSampleCache.get(pid);
    _cpuSampleCache.set(pid, { ts: nowMs, ticks });
    if (prev && nowMs > prev.ts) {
        const deltaTicks = ticks - prev.ticks;
        const deltaSec = (nowMs - prev.ts) / 1000;
        if (deltaTicks >= 0 && deltaSec > 0) {
            // (delta_ticks / USER_HZ) seconds of CPU consumed in delta_sec wall
            // seconds → fraction of one core; × 100 → percent-of-one-core.
            const cpuPct = ((deltaTicks / USER_HZ) / deltaSec) * 100;
            result.cpuPct = Math.round(cpuPct * 10) / 10;
        }
    }
    // v0.5.208 — store in result cache for callers within RESULT_CACHE_TTL_MS.
    _resultCache.set(pid, { ts: nowMs, result });
    return result;
}

/**
 * Drop both the sample + result caches. Called by tests; not normally needed
 * by callers.
 * @returns {void}
 */
function resetCache() {
    _cpuSampleCache.clear();
    _resultCache.clear();   // v0.5.208 — also drop the new result cache
}

/**
 * Drop a single PID's sample + cached result. Called by NativeProcessService
 * when a chain exits, so the next process under a recycled PID starts with
 * a fresh baseline rather than computing a delta against a dead process's
 * ticks. Idempotent.
 * @param {number} pid
 */
function dropPid(pid) {
    if (typeof pid !== 'number') { return; }
    _cpuSampleCache.delete(pid);
    _resultCache.delete(pid);   // v0.5.208 — also evict from result cache
}

module.exports = {
    getMetrics,
    resetCache,
    dropPid,
    // Exported for tests.
    _internal: { readCpuTicks, readRssBytes, readFdCount, readThreadCount, USER_HZ, PAGE_SIZE_BYTES },
};
