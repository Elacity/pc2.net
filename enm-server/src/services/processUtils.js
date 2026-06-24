/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * processUtils — small POSIX process helpers shared by NativeProcessService
 * and tests. Kept separate so NativeProcessService stays under the per-file
 * LOC cap and so tests can exercise the helpers in isolation.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runDir } = require('./DataDir');

/**
 * Allowlist of env vars passed to spawned ela processes. PC2 may carry secrets
 * in its env (Phase 2 security audit, agent 2: GITHUB_TOKEN, OPENAI_KEY, AWS_*,
 * etc.) and ela has no use for any of them. Defence in depth: forward only what
 * a Linux process legitimately needs to start.
 */
const SAFE_CHILD_ENV_KEYS = Object.freeze([
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'SHELL',
    'TERM',
    'LANG',
    'LC_ALL',
    'LC_CTYPE',
    'LC_MESSAGES',
    'LC_TIME',
    'TZ',
    'TMPDIR',
]);

/**
 * Probe whether a given PID is currently alive. Uses signal 0 — POSIX way of
 * asking "do you exist?" without actually sending a signal.
 *
 * @param {number} pid
 * @returns {boolean}
 */
function isPidAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) {
        return false;
    }
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        // EPERM means the process exists but we can't signal it — still alive.
        if (err && err.code === 'EPERM') {
            return true;
        }
        return false;
    }
}

/**
 * Path to the metadata sidecar for a chain's running process.
 *
 * @param {string} chainId
 * @returns {string}
 */
function metaFilePath(chainId) {
    return path.join(runDir(), `ela-${chainId}.meta.json`);
}

/**
 * Promise-based sleep. Used by the SIGTERM-then-SIGKILL grace loop.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Best-effort verification that `pid` belongs to a process running the
 * expected binary. Defends against PID reuse (Phase 2 audit, agent 4: kernel
 * recycles PIDs after offline period; we'd otherwise signal a stranger).
 *
 * Linux: reads /proc/<pid>/exe symlink. Bulletproof.
 * macOS / others: falls back to `isPidAlive` (no /proc).
 *
 * @param {number} pid
 * @param {string} expectedBinaryPath  absolute path
 * @returns {boolean}
 */
function isOurProcess(pid, expectedBinaryPath) {
    if (!isPidAlive(pid)) {
        return false;
    }
    if (!expectedBinaryPath) {
        // No path to compare — accept the alive check.
        return true;
    }
    if (os.platform() !== 'linux') {
        // /proc is Linux-only (also Solaris, but we don't target it). Accept.
        return true;
    }
    try {
        const exe = fs.readlinkSync(`/proc/${pid}/exe`);
        return exe === expectedBinaryPath;
    } catch (err) {
        // /proc/<pid>/exe may be unreadable for processes owned by another
        // user. We refuse the attach in that case — better safe than signaling
        // someone else's process.
        if (err && (err.code === 'EACCES' || err.code === 'EPERM')) {
            return false;
        }
        // ENOENT means the process disappeared between isPidAlive and readlink.
        return false;
    }
}

/**
 * Filter `process.env` down to the safe-to-forward subset (see SAFE_CHILD_ENV_KEYS).
 *
 * @returns {NodeJS.ProcessEnv}
 */
function buildSafeChildEnv() {
    const out = {};
    for (const key of SAFE_CHILD_ENV_KEYS) {
        if (typeof process.env[key] === 'string') {
            out[key] = process.env[key];
        }
    }
    // PATH must always be present so the kernel + dynamic linker can find shared libs.
    if (typeof out.PATH !== 'string' || out.PATH.length === 0) {
        out.PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
    }
    return out;
}

module.exports = {
    isPidAlive,
    isOurProcess,
    metaFilePath,
    sleep,
    buildSafeChildEnv,
    SAFE_CHILD_ENV_KEYS,
};
