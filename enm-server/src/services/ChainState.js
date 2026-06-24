/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * ChainState — single source of truth for what's actually on disk.
 *
 * Per the v0.3 rebuild's Architectural Invariant #1:
 *
 *     Disk is the source of truth. Chain state is derived from disk on
 *     every read. DB is for audit log + in-flight progress only.
 *
 * Why: prior versions kept duplicate state in `enm_setup_state` (SQLite)
 * which routinely diverged from reality after container restarts, abandoned
 * wizards, or DB loss. The dashboard would say "mainchain Not configured"
 * while the DB said `completed=true`, and there was no recovery path
 * without manual intervention.
 *
 * This module deletes that divergence by computing state from disk every
 * time something asks. It is intentionally cheap (a handful of stat() and
 * read() calls per chain) and stateless across calls.
 *
 * snapshot(chainId) returns:
 *   {
 *     chainId,
 *     installed:        binary on disk + executable + smoke-tested
 *     binaryPath,       absolute path or null
 *     binaryVersion,    cached `--version` output or null
 *     cliPath,          absolute path to ela-cli (mainchain) or null
 *     configured:       config.json present in chain dir
 *     keystorePresent:  keystore.dat present in chain dir
 *     publicKey,        from keystore-account.json sidecar (cached pubkey) or null
 *     address,          producer address from keystore-account.json or null
 *     running:          PID file points to a live process
 *     pid,              the PID, or null
 *     coarseState:      'unconfigured' | 'stopped' | 'running' | 'error'
 *     setupStep:        suggested wizard step ('welcome' | 'install' | 'confirm' | 'complete')
 *   }
 *
 * `coarseState` is consumed by the chain-card UI; `setupStep` by the wizard.
 * Neither requires a DB lookup.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const { ENM_LOG_PREFIX } = require('./EnmConstants');
const { enmDataDir, chainDir, pidFilePath } = require('./DataDir');

// In-process cache for binaryVersion (--version output) to avoid spawning
// every snapshot call. Invalidated when the binary's mtime changes.
const _versionCache = new Map(); // binaryPath -> { mtimeMs, version }
// P2 (v0.5.183) — bound the version cache. Keyed by binaryPath, it would
// otherwise accumulate one stale entry per binary path seen across months
// of upgrades (each update lands the binary at a new versioned path), and
// nothing ever evicted. ~8 chains × a handful of historical paths each
// fits comfortably under this cap; on overflow we drop the oldest insert
// (Map preserves insertion order, so the first key is the oldest).
const _VERSION_CACHE_MAX = 64;

/**
 * Set into _versionCache with a simple size cap. On overflow, evict the
 * oldest-inserted key before adding the new one.
 */
function _versionCacheSet(binaryPath, entry) {
    if (!_versionCache.has(binaryPath) && _versionCache.size >= _VERSION_CACHE_MAX) {
        const oldest = _versionCache.keys().next().value;
        if (oldest !== undefined) { _versionCache.delete(oldest); }
    }
    _versionCache.set(binaryPath, entry);
}

// P2 (v0.5.183) — per-chainId cache of the located binary path so the hot
// snapshot() path doesn't run a recursive readdirSync walk on every health
// tick. Disk stays the source of truth: a cached path is only returned
// after an existsSync() check confirms it's still there; any miss re-walks.
const _binaryPathCache = new Map(); // chainId -> absolute binary path

/**
 * @param {string} chainId
 * @returns {object} snapshot — see header comment for shape
 */
function snapshot(chainId) {
    if (!chainId || typeof chainId !== 'string') {
        throw new TypeError('ChainState.snapshot: chainId required');
    }

    const binDir = path.join(enmDataDir(), 'bin', chainId);
    const cDir = chainDir(chainId);

    // ---- binary + cli ----
    const binaryPath = _locateBinaryCached(chainId, binDir, _binaryNameFor(chainId));
    const cliPath = chainId === 'mainchain' ? _locate(binDir, 'ela-cli') : null;
    const installed = !!binaryPath && _isExecutable(binaryPath);
    const binaryVersion = installed ? _versionFor(binaryPath) : null;

    // ---- config + keystore ----
    const configFile = path.join(cDir, 'config.json');
    const keystoreFile = path.join(cDir, 'keystore.dat');
    const accountFile = path.join(cDir, 'keystore-account.json');
    const configured = fs.existsSync(configFile);
    const keystorePresent = fs.existsSync(keystoreFile);

    let publicKey = null;
    let address = null;
    if (fs.existsSync(accountFile)) {
        try {
            const a = JSON.parse(fs.readFileSync(accountFile, 'utf8'));
            publicKey = a.publicKey || null;
            address = a.address || null;
        } catch (_) { /* corrupted account cache — treat as missing */ }
    }

    // ---- pid + liveness ----
    let pid = null;
    let running = false;
    const pf = pidFilePath(chainId);
    if (fs.existsSync(pf)) {
        try {
            const txt = fs.readFileSync(pf, 'utf8').trim();
            const candidate = parseInt(txt, 10);
            if (Number.isFinite(candidate) && candidate > 0) {
                if (_pidAlive(candidate)) {
                    pid = candidate;
                    running = true;
                }
            }
        } catch (_) { /* unreadable pidfile = not running */ }
    }

    // ---- derived state ----
    const coarseState = _deriveCoarse({ installed, configured, running });
    const setupStep = _deriveSetupStep({ installed, configured, keystorePresent });

    return {
        chainId,
        installed,
        binaryPath,
        binaryVersion,
        cliPath,
        configured,
        keystorePresent,
        publicKey,
        address,
        running,
        pid,
        coarseState,
        setupStep,
    };
}

/**
 * snapshot() but always also smoke-tests the binary (slow path). Used by
 * /api/enm/setup/install-status to give the wizard authoritative output.
 */
async function snapshotVerified(chainId) {
    const snap = snapshot(chainId);
    if (snap.installed && !snap.binaryVersion) {
        const v = await _smokeTest(snap.binaryPath);
        if (v.ok) snap.binaryVersion = _extractVersion(v.output);
    }
    return snap;
}

/**
 * Used by ChainRegistry.init() on container boot. Walks every known chain,
 * reconciles in-memory state with disk, and reports anomalies. Returns a
 * summary the registry logs at INFO level.
 *
 * @param {string[]} chainIds
 * @param {(level: 'info'|'warn', msg: string) => void} log
 */
function reconcileOnBoot(chainIds, log) {
    const summary = { reconciled: 0, stalePidsCleared: 0, anomalies: [] };
    for (const chainId of chainIds) {
        try {
            const snap = snapshot(chainId);
            summary.reconciled += 1;
            // If a stale PID file points to a dead process, clean it.
            const pf = pidFilePath(chainId);
            if (fs.existsSync(pf) && !snap.running) {
                try {
                    fs.unlinkSync(pf);
                    summary.stalePidsCleared += 1;
                    log('info', `${ENM_LOG_PREFIX} reconcile: cleared stale PID file for ${chainId}`);
                } catch (_) { /* best effort */ }
            }
            // Diverged: binary present but never recorded? Just log.
            if (snap.installed && !snap.configured) {
                summary.anomalies.push(`${chainId}: installed but not configured (operator can resume wizard)`);
            }
        } catch (err) {
            log('warn', `${ENM_LOG_PREFIX} reconcile: ${chainId} failed: ${err.message}`);
        }
    }
    return summary;
}

// ============================================================
// internals
// ============================================================

function _binaryNameFor(chainId) {
    switch (chainId) {
        case 'mainchain': return 'ela';
        case 'esc':       return 'esc';
        case 'eid':       return 'eid';
        // beta.4.02 (Wave M3.8) — PG added per the M5.1 binary
        // download path. ECO removed per H3 (permanently out of
        // scope).
        case 'pg':        return 'pg';
        case 'arbiter':   return 'arbiter';
        case 'spv':       return 'service';   // SPV uses 'service' binary (plan §14)
        default:          return chainId;
    }
}

/**
 * P2 (v0.5.183) — cached wrapper around _locate() for the per-chain binary,
 * keyed by chainId. snapshot() is on the hot path (called per chain per
 * health tick); without this it ran a recursive readdirSync walk every
 * time. Disk remains the source of truth: a cached path is validated with
 * existsSync() before being returned, and any miss (no cache entry, or the
 * cached path no longer exists) falls through to a fresh _locate() walk and
 * re-populates / clears the cache. This changes only WHEN we walk, never
 * the disk-truth result.
 */
function _locateBinaryCached(chainId, rootDir, basename) {
    const cached = _binaryPathCache.get(chainId);
    if (cached && fs.existsSync(cached)) {
        return cached;
    }
    const found = _locate(rootDir, basename);
    if (found) {
        _binaryPathCache.set(chainId, found);
    } else {
        _binaryPathCache.delete(chainId);
    }
    return found;
}

function _locate(rootDir, basename) {
    if (!fs.existsSync(rootDir)) return null;
    const stack = [rootDir];
    const MAX = 200;
    let n = 0;
    while (stack.length > 0 && n < MAX) {
        const cur = stack.pop();
        n += 1;
        let entries;
        try { entries = fs.readdirSync(cur, { withFileTypes: true }); }
        catch (_) { continue; }
        for (const e of entries) {
            const full = path.join(cur, e.name);
            if (e.isDirectory()) stack.push(full);
            else if (e.isFile() && e.name === basename) return full;
        }
    }
    return null;
}

function _isExecutable(p) {
    try {
        fs.accessSync(p, fs.constants.X_OK);
        return true;
    } catch (_) {
        return false;
    }
}

function _pidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        // EPERM means the process exists but we can't signal — treat as alive.
        if (err && err.code === 'EPERM') return true;
        return false;
    }
}

function _versionFor(binaryPath) {
    let mtimeMs;
    try { mtimeMs = fs.statSync(binaryPath).mtimeMs; }
    catch (_) { return null; }
    const cached = _versionCache.get(binaryPath);
    if (cached && cached.mtimeMs === mtimeMs) return cached.version;
    // We don't spawn synchronously — that would hang the request. Snapshot
    // returns null for binaryVersion until snapshotVerified() is called.
    return cached ? cached.version : null;
}

function _smokeTest(binaryPath) {
    return new Promise((resolve) => {
        execFile(binaryPath, ['--version'], { timeout: 8_000 }, (err, stdout, stderr) => {
            if (err) {
                return resolve({ ok: false, error: (stderr || err.message).trim() });
            }
            const output = (stdout || stderr || '').trim();
            try {
                const mtimeMs = fs.statSync(binaryPath).mtimeMs;
                _versionCacheSet(binaryPath, { mtimeMs, version: _extractVersion(output) });
            } catch (_) { /* cache miss is fine */ }
            resolve({ ok: true, output });
        });
    });
}

function _extractVersion(output) {
    if (!output) return null;
    const m = output.match(/v[0-9]+(?:\.[0-9]+)+(?:[-.][0-9a-zA-Z]+)*/);
    return m ? m[0] : output.split(/\r?\n/)[0];
}

function _deriveCoarse({ installed, configured, running }) {
    if (running) return 'running';
    if (!installed || !configured) return 'unconfigured';
    return 'stopped';
}

function _deriveSetupStep({ installed, configured, keystorePresent }) {
    if (!installed) return 'install';
    if (!keystorePresent) return 'install';   // wizard's combined install+keystore step
    if (!configured) return 'confirm';
    return 'complete';
}

module.exports = {
    snapshot,
    snapshotVerified,
    reconcileOnBoot,
    // exposed for tests + the rare consumer that needs the raw binary version sync
    _versionCache,
    // P2 (v0.5.183) — exposed for tests (cap eviction + path-cache invalidation)
    _binaryPathCache,
};
