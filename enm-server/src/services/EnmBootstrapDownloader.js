/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmBootstrapDownloader — fetch the official Elastos chain-data snapshot
 * and apply it to a chain's data dir so the operator skips the 1–3 day
 * genesis sync.
 *
 * NOTE (v0.5.199): this file is NOT the active install-path downloader.
 * The Council install orchestrator (routes/setup.js) uses
 * EnmSnapshotDownloader.js, which (a) handles disk preflight + retry +
 * the .enm-snapshot-complete sentinel, and (b) post-v0.5.199 enforces
 * a mainchain-only allow-list with a post-extract identity-key scrub
 * (defense against the cycle-13 nodekey contamination). This file
 * remains as an alternate SSE-driven path (`setup:bootstrap:<chainId>`
 * topic, single-flight per chain) for any future route that needs the
 * smaller surface — but it has ALWAYS been mainchain-only (see
 * SNAPSHOT_PATHS below), so the cycle-13 lesson does not apply here.
 * If you extend SNAPSHOT_PATHS, mirror EnmSnapshotDownloader's
 * stripIdentityFiles() scrub in the apply phase.
 *
 * Source pattern (verified via the upstream Elastos.Node script,
 * build/skeleton/node.sh:840-870 and the operator-facing FAQ):
 *
 *   https://node-data.elastos.io/<chain>/<chain>-data-latest.tgz
 *
 * The tarball contains a top-level `data/` directory whose contents map
 * directly to ela's data dir at:
 *
 *   ${ENM_DATA_DIR}/chains/<chainId>/elastos/data/
 *
 * (DataDir.js header documents this layout.)
 *
 * Size — today the mainchain snapshot is ~10 GB compressed and ~30 GB
 * once extracted. We preflight disk space with a wide margin before
 * touching the network.
 *
 * Integrity — no .sha256 / .sig is published alongside the tarball
 * (verified 2026-05-11). We rely on TLS for transport + tar's built-in
 * CRC for the gzip stream + a post-apply smoke check (data dir exists
 * and is non-empty). Same gap the node.sh script accepts.
 *
 * Atomicity — we download to a temp file, extract to a sibling temp
 * dir, and only swap into place once both finish cleanly. A failure
 * at any phase leaves the existing data/ untouched and the temp
 * artefacts cleaned. State machine:
 *
 *   idle → resolving → downloading → extracting → applying
 *        → verifying → done
 *                   (or → failed at any step)
 *
 * Single-flight per chain. Streaming progress is broadcast on the SSE
 * topic `setup:bootstrap:<chainId>` — symmetric with EnmBinaryDownloader's
 * `setup:install:<chainId>` so the frontend reuses the same wiring.
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const { spawn } = require('node:child_process');

const { ENM_LOG_PREFIX } = require('./EnmConstants');
const { enmDataDir, chainDir } = require('./DataDir');

// 0.5.113 audit Session 113 — read the User-Agent's version segment
// from package.json instead of hardcoding "0.2". Pre-0.5.113 both
// _head() and _download() used `'enm-server/0.2 (bootstrap)'` —
// stale since beta. Mirrors the Session 111 fix in EnmUpdateScanner.
// Cached at module load; redeploys refresh it.
function _readPackageVersion() {
    try {
        const pkg = require('../../package.json');
        if (pkg && typeof pkg.version === 'string') { return pkg.version; }
    } catch (_) { /* fall through */ }
    return '0.0.0';
}
const USER_AGENT = 'enm-server/' + _readPackageVersion() + ' (bootstrap)';

// Host + path of the snapshot. Mainchain only for now — ESC and EID
// don't publish snapshots in the same shape. Easy to extend when
// they do (parallel `CHAINS` table to EnmBinaryDownloader's).
const SNAPSHOT_HOST = 'node-data.elastos.io';
const SNAPSHOT_PATHS = {
    mainchain: '/ela/ela-data-latest.tgz',
};

// P1 (v0.5.183) — snapshot redirects must stay on the publisher's domain.
// Following a 30x Location to an arbitrary host is a supply-chain hijack
// vector (the bytes are extracted + run as root). node-data.elastos.io's
// only known redirect is HTTP→HTTPS on the same host, which this still
// allows. Mirrors EnmSnapshotDownloader.isAllowedSnapshotHost.
function isAllowedSnapshotHost(hostname) {
    if (!hostname) { return false; }
    const h = String(hostname).toLowerCase();
    return h === 'elastos.io' || h.endsWith('.elastos.io');
}

// Safety margin: require (tarballSize × 4) + 5 GB free at the data dir.
// 10 GB compressed → ~30 GB extracted → both files exist briefly during
// the swap → buffer for ela's own logs. Better an honest "needs N GB"
// error up front than a half-applied bootstrap and a corrupted chain.
const DISK_HEADROOM_BYTES = 5 * 1024 * 1024 * 1024;
const DISK_HEADROOM_MULTIPLIER = 4;

const PHASES = Object.freeze({
    IDLE:        'idle',
    RESOLVING:   'resolving',
    DOWNLOADING: 'downloading',
    EXTRACTING:  'extracting',
    APPLYING:    'applying',
    VERIFYING:   'verifying',
    DONE:        'done',
    FAILED:      'failed',
});

class EnmBootstrapDownloader {
    constructor(opts) {
        opts = opts || {};
        this.sseHub = opts.sseHub || null;
        this.logger = (opts.extensionHandle && opts.extensionHandle.log) || console;

        /** @type {Record<string, object>} chainId → status snapshot */
        this._status = {};
    }

    /**
     * Idempotent: if a bootstrap is already running for this chain, return
     * its current status with alreadyRunning=true. Otherwise kick a new
     * one off and return immediately (async pipeline runs in background).
     *
     * @param {string} chainId
     * @returns {Promise<{alreadyRunning: boolean, status: object}>}
     */
    async start(chainId) {
        const existing = this._status[chainId];
        if (existing && this._isInProgress(existing.phase)) {
            return { alreadyRunning: true, status: this.getStatus(chainId) };
        }

        const snapshotPath = SNAPSHOT_PATHS[chainId];
        if (!snapshotPath) {
            throw new Error(`No bootstrap snapshot available for chain "${chainId}".`);
        }

        const s = {
            chainId,
            phase: PHASES.RESOLVING,
            url: `https://${SNAPSHOT_HOST}${snapshotPath}`,
            bytesDownloaded: 0,
            bytesTotal: 0,
            startedAt: Date.now(),
            finishedAt: null,
            error: null,
            cancelled: false,
        };
        this._status[chainId] = s;
        this._emit(chainId, PHASES.RESOLVING, 'Resolving bootstrap snapshot...');

        // Run async; caller polls status or subscribes to SSE.
        this._run(chainId).catch((err) => {
            const cur = this._status[chainId];
            if (cur && cur.cancelled) {
                cur.phase = PHASES.FAILED;
                cur.error = 'Cancelled by operator.';
                cur.finishedAt = Date.now();
                this._emit(chainId, PHASES.FAILED, cur.error);
                this.logger.info(`${ENM_LOG_PREFIX} bootstrap ${chainId} cancelled`);
                return;
            }
            if (cur) {
                cur.phase = PHASES.FAILED;
                cur.error = err.message;
                cur.finishedAt = Date.now();
            }
            this._emit(chainId, PHASES.FAILED, err.message);
            this.logger.error(`${ENM_LOG_PREFIX} bootstrap ${chainId} failed: ${err.message}`);
        });

        return { alreadyRunning: false, status: this.getStatus(chainId) };
    }

    /**
     * Best-effort cancel. Aborts an in-flight download and tears down
     * temp artefacts. Cannot cancel an APPLYING phase mid-flight — at
     * that point we'd risk a half-applied snapshot worse than no
     * bootstrap at all, so we let it finish.
     *
     * @param {string} chainId
     */
    cancel(chainId) {
        const s = this._status[chainId];
        if (!s) return { cancelled: false, reason: 'no bootstrap in progress' };
        if (s.phase === PHASES.APPLYING || s.phase === PHASES.VERIFYING) {
            return { cancelled: false, reason: 'cannot cancel during apply phase' };
        }
        s.cancelled = true;
        if (s._abortDownload) {
            try { s._abortDownload(); } catch (_) { /* nothing useful to do */ }
        }
        this._emit(chainId, s.phase, 'Cancelling...');
        return { cancelled: true };
    }

    /**
     * @param {string} chainId
     * @returns {object} immutable snapshot of current state
     */
    getStatus(chainId) {
        const s = this._status[chainId];
        if (!s) {
            return { chainId, phase: PHASES.IDLE };
        }
        // Strip the internal _abortDownload handle from the public view.
        const { _abortDownload, ...pub } = s; /* eslint-disable-line no-unused-vars */
        return pub;
    }

    /**
     * Clean up `${ENM_DATA_DIR}/.tmp/bootstrap/` artefacts left by an
     * earlier crash or cancel. Safe to call at server boot.
     */
    async cleanupOrphans() {
        const tmpRoot = path.join(enmDataDir(), '.tmp', 'bootstrap');
        try { await fsp.rm(tmpRoot, { recursive: true, force: true }); } catch (_) { /* nothing */ }
    }

    // -------------------------------------------------------------------

    async _run(chainId) {
        const s = this._status[chainId];
        const snapshotPath = SNAPSHOT_PATHS[chainId];

        // ---- 1. RESOLVING — HEAD the URL, read size, preflight disk.
        // The HEAD is wrapped so cancel() during RESOLVING aborts it,
        // not just sets the cancelled flag and lets the operator wait
        // for the HTTPS timeout. _head registers an aborter via the
        // same s._abortDownload slot that _download will reuse later.
        const head = await this._head(SNAPSHOT_HOST, snapshotPath, (abortFn) => {
            s._abortDownload = abortFn;
        });
        s._abortDownload = null;
        if (s.cancelled) return;
        s.bytesTotal = head.contentLength;
        this._emit(chainId, PHASES.RESOLVING, '', {
            got: 0, total: head.contentLength, lastModified: head.lastModified,
        });

        const required = (head.contentLength * DISK_HEADROOM_MULTIPLIER) + DISK_HEADROOM_BYTES;
        const free = await this._freeBytes(enmDataDir());
        if (free < required) {
            throw new Error(
                `Insufficient disk space — bootstrap needs ~${this._fmtGb(required)} `
                + `free, you have ${this._fmtGb(free)}.`,
            );
        }

        // ---- 2. DOWNLOADING — stream tgz to a temp file under .tmp/bootstrap/.
        const tmpRoot = path.join(enmDataDir(), '.tmp', 'bootstrap', chainId);
        await fsp.mkdir(tmpRoot, { recursive: true });
        const tarball = path.join(tmpRoot, 'snapshot.tgz');

        s.phase = PHASES.DOWNLOADING;
        this._emit(chainId, PHASES.DOWNLOADING, 'Downloading snapshot...', {
            got: 0, total: head.contentLength,
        });

        await this._download(SNAPSHOT_HOST, snapshotPath, tarball, (got, total) => {
            if (s.cancelled) return;
            s.bytesDownloaded = got;
            if (total) s.bytesTotal = total;
            this._emit(chainId, PHASES.DOWNLOADING, '', { got, total });
        }, (abortFn) => { s._abortDownload = abortFn; });
        if (s.cancelled) {
            await fsp.rm(tmpRoot, { recursive: true, force: true });
            throw new Error('Cancelled by operator.');
        }

        // ---- 3. EXTRACTING — tar -xzf into a sibling temp dir.
        s.phase = PHASES.EXTRACTING;
        this._emit(chainId, PHASES.EXTRACTING, 'Extracting snapshot...');
        const extractDir = path.join(tmpRoot, 'extracted');
        await fsp.mkdir(extractDir, { recursive: true });
        await EnmBootstrapDownloader._extractTar(tarball, extractDir);
        if (s.cancelled) {
            await fsp.rm(tmpRoot, { recursive: true, force: true });
            throw new Error('Cancelled by operator.');
        }

        // Locate the top-level data/ dir inside the extract. Most tarballs
        // have it at the root, but some pack as `./data/` or
        // `mainchain/data/` — be tolerant.
        const dataSrc = await EnmBootstrapDownloader._locateDataDir(extractDir);
        if (!dataSrc) {
            throw new Error(
                "Snapshot tarball does not contain a 'data/' directory at the expected location.",
            );
        }

        // ---- 4. APPLYING — wipe existing data dir, mv extracted into place.
        // Past this point cancel is rejected — half-applied = worse than not bootstrapping.
        s.phase = PHASES.APPLYING;
        this._emit(chainId, PHASES.APPLYING, 'Applying snapshot to chain data dir...');

        const chainRoot = chainDir(chainId);
        const elastosDir = path.join(chainRoot, 'elastos');
        const dataDst = path.join(elastosDir, 'data');
        await fsp.mkdir(elastosDir, { recursive: true });

        // Move any existing data dir aside first (atomic-ish — if the
        // mv-back fails for some reason, the operator still has the
        // .bak copy to recover).
        const dataBak = `${dataDst}.bak-${Date.now()}`;
        if (fs.existsSync(dataDst)) {
            await fsp.rename(dataDst, dataBak);
        }
        try {
            await fsp.rename(dataSrc, dataDst);
        } catch (err) {
            // mv failed — restore the original if we moved it aside.
            if (fs.existsSync(dataBak)) {
                try { await fsp.rename(dataBak, dataDst); } catch (_) { /* best effort */ }
            }
            throw new Error(`Failed to apply snapshot to ${dataDst}: ${err.message}`);
        }
        // P1 (v0.5.183) — DO NOT delete the .bak here. Keeping the old data
        // dir aside until AFTER verify succeeds means a crash mid-apply (or a
        // failed verify) can recover the operator's previous chain data instead
        // of leaving them with a half-applied snapshot and nothing to fall back
        // to. The .bak is cleaned only once verify passes (below).

        // ---- 5. VERIFYING — sanity check the applied data.
        s.phase = PHASES.VERIFYING;
        this._emit(chainId, PHASES.VERIFYING, 'Verifying snapshot...');
        const entries = await fsp.readdir(dataDst);
        if (entries.length === 0) {
            // Verify failed — restore the original data dir from the .bak we
            // deliberately kept, so the operator isn't left with an empty dir.
            if (fs.existsSync(dataBak)) {
                try {
                    await fsp.rm(dataDst, { recursive: true, force: true });
                    await fsp.rename(dataBak, dataDst);
                } catch (_) { /* best effort — surface the original failure below */ }
            }
            throw new Error('Snapshot data dir is empty after extract.');
        }

        // Verify passed — now it's safe to drop the previous data dir. Async,
        // no need to block the operator on a multi-GB delete.
        if (fs.existsSync(dataBak)) {
            fsp.rm(dataBak, { recursive: true, force: true }).catch(() => { /* tidy-up */ });
        }

        // Clean up the tarball + the (now-empty) extract dir.
        await fsp.rm(tmpRoot, { recursive: true, force: true });

        // ---- DONE
        s.phase = PHASES.DONE;
        s.finishedAt = Date.now();
        this._emit(chainId, PHASES.DONE, 'Bootstrap applied — chain ready to start.', {
            durationMs: s.finishedAt - s.startedAt,
            dataDir: dataDst,
        });
    }

    _emit(chainId, phase, message, extra) {
        if (!this.sseHub) return;
        try {
            // 0.2.0-beta.3.9 — see EnmBinaryDownloader._emit comment.
            // `broadcast()` doesn't exist on SseHub; the call threw
            // and got silently swallowed, killing the live bootstrap
            // progress feed. `publish()` is the right method here.
            this.sseHub.publish(`setup:bootstrap:${chainId}`, {
                chainId, phase, message: message || '', ts: Date.now(), ...(extra || {}),
            });
        } catch (_) { /* SSE failures shouldn't break the bootstrap pipeline */ }
    }

    _isInProgress(phase) {
        return phase === PHASES.RESOLVING
            || phase === PHASES.DOWNLOADING
            || phase === PHASES.EXTRACTING
            || phase === PHASES.APPLYING
            || phase === PHASES.VERIFYING;
    }

    /**
     * HEAD a URL with redirect follow. Returns { contentLength, lastModified }.
     * abortRegister(fn) is called with an abort callback so the caller can
     * tear the request down during cancel — without this, a slow DNS or TLS
     * handshake leaves cancel as a no-op until the network layer times out.
     */
    _head(host, urlPath, abortRegister) {
        return new Promise((resolve, reject) => {
            let currentReq = null;
            if (abortRegister) {
                abortRegister(() => {
                    if (currentReq) currentReq.destroy(new Error('Aborted'));
                });
            }
            (function attempt(currentHost, currentPath, hops) {
                if (hops > 3) return reject(new Error('Too many redirects'));
                currentReq = https.request({
                    method: 'HEAD',
                    host: currentHost,
                    path: currentPath,
                    headers: { 'User-Agent': USER_AGENT },
                    timeout: 15_000,
                }, (res) => {
                    if (res.statusCode === 301 || res.statusCode === 302
                        || res.statusCode === 307 || res.statusCode === 308) {
                        const loc = res.headers.location;
                        if (!loc) return reject(new Error(`Redirect ${res.statusCode} without Location`));
                        res.resume();
                        try {
                            const u = new URL(loc, `https://${currentHost}${currentPath}`);
                            // P1 (v0.5.183) — refuse a redirect off the publisher's
                            // domain (supply-chain hijack guard; bytes run as root).
                            if (!isAllowedSnapshotHost(u.hostname)) {
                                return reject(new Error(`refusing snapshot redirect to disallowed host: ${u.host}`));
                            }
                            return attempt(u.host, u.pathname + u.search, hops + 1);
                        } catch (e) { return reject(e); }
                    }
                    if (res.statusCode !== 200) {
                        res.resume();
                        return reject(new Error(`HTTP ${res.statusCode} HEAD ${urlPath}`));
                    }
                    const contentLength = parseInt(res.headers['content-length'] || '0', 10);
                    if (!contentLength) {
                        return reject(new Error('Snapshot HEAD returned no Content-Length'));
                    }
                    resolve({
                        contentLength,
                        lastModified: res.headers['last-modified'] || null,
                    });
                    res.resume();
                });
                currentReq.on('error', reject);
                currentReq.on('timeout', () => currentReq.destroy(new Error(`Timeout HEADing ${currentHost}${currentPath}`)));
                currentReq.end();
            })(host, urlPath, 0);
        });
    }

    /**
     * GET with redirect follow, streaming to disk, progress callback.
     * The abortRegister callback receives a function the caller can use
     * to abort an in-flight download (set on cancel()).
     */
    _download(host, urlPath, dest, onProgress, abortRegister) {
        const tmp = `${dest}.partial`;
        return new Promise((resolve, reject) => {
            fs.rm(tmp, { force: true }, () => {
                let currentReq = null;
                let currentRes = null;
                if (abortRegister) {
                    abortRegister(() => {
                        if (currentReq) currentReq.destroy(new Error('Aborted'));
                        if (currentRes) currentRes.destroy();
                    });
                }

                (function attempt(currentHost, currentPath, hops) {
                    if (hops > 3) return reject(new Error('Too many redirects'));
                    currentReq = https.get({
                        host: currentHost, path: currentPath,
                        headers: { 'User-Agent': USER_AGENT },
                        timeout: 60_000,
                    }, (res) => {
                        currentRes = res;
                        if (res.statusCode === 301 || res.statusCode === 302
                            || res.statusCode === 307 || res.statusCode === 308) {
                            const loc = res.headers.location;
                            if (!loc) return reject(new Error(`Redirect ${res.statusCode} without Location`));
                            res.resume();
                            try {
                                const u = new URL(loc, `https://${currentHost}${currentPath}`);
                                return attempt(u.host, u.pathname + u.search, hops + 1);
                            } catch (e) { return reject(e); }
                        }
                        if (res.statusCode !== 200) {
                            res.resume();
                            return reject(new Error(`HTTP ${res.statusCode} downloading ${urlPath}`));
                        }
                        const total = parseInt(res.headers['content-length'] || '0', 10);
                        let got = 0;
                        const fileStream = fs.createWriteStream(tmp);
                        res.on('data', (c) => {
                            got += c.length;
                            if (onProgress) onProgress(got, total);
                        });
                        res.pipe(fileStream);
                        fileStream.on('finish', () => {
                            fileStream.close(() => {
                                // P1 (v0.5.183) — truncation guard. A stream that
                                // finishes "cleanly" but delivered fewer bytes than
                                // Content-Length (proxy/CDN cutoff, short read) would
                                // otherwise be renamed into place and extracted as if
                                // complete → truncated/corrupt archive applied to the
                                // chain. Reject instead. Mirrors EnmSnapshotDownloader.
                                if (total > 0 && got !== total) {
                                    fs.rm(tmp, { force: true }, () => reject(new Error(
                                        `truncated download: got ${got} of ${total} bytes`,
                                    )));
                                    return;
                                }
                                fs.rename(tmp, dest, (renameErr) => {
                                    if (renameErr) {
                                        fs.rm(tmp, { force: true }, () => reject(renameErr));
                                        return;
                                    }
                                    resolve();
                                });
                            });
                        });
                        fileStream.on('error', (err) => {
                            fs.rm(tmp, { force: true }, () => reject(err));
                        });
                        res.on('error', (err) => {
                            fs.rm(tmp, { force: true }, () => reject(err));
                        });
                    });
                    currentReq.on('error', reject);
                    currentReq.on('timeout', () => currentReq.destroy(new Error('Download timed out')));
                })(host, urlPath, 0);
            });
        });
    }

    static _extractTar(tarball, targetDir) {
        return new Promise((resolve, reject) => {
            const child = spawn('tar', ['-xzf', tarball, '-C', targetDir], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let stderr = '';
            child.stderr.on('data', (c) => { stderr += c.toString(); });
            child.on('error', reject);
            child.on('exit', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`tar exited ${code}: ${stderr.slice(0, 500)}`));
            });
        });
    }

    /**
     * The snapshot tarballs from node-data.elastos.io put the data dir
     * at the tarball root, but some upstream tools pack it differently.
     * Look up to two directory levels deep for the first dir literally
     * named `data` that has block files (a sentinel ending in .dat or .ldb).
     */
    static async _locateDataDir(root) {
        async function looksLikeChainData(p) {
            try {
                const entries = await fsp.readdir(p);
                return entries.some((e) => /\.(dat|ldb|log|sst)$/i.test(e))
                    || entries.includes('blocks')
                    || entries.includes('chainstate')
                    || entries.includes('mainchain');
            } catch (_) { return false; }
        }
        // Depth 0: root/data
        const direct = path.join(root, 'data');
        if (fs.existsSync(direct) && await looksLikeChainData(direct)) return direct;
        // Depth 1: root/*/data
        const lvl1 = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);
        for (const e of lvl1) {
            if (!e.isDirectory()) continue;
            const candidate = path.join(root, e.name, 'data');
            if (fs.existsSync(candidate) && await looksLikeChainData(candidate)) return candidate;
        }
        // Last resort: any 'data' dir we can find, even without sentinels
        if (fs.existsSync(direct)) return direct;
        for (const e of lvl1) {
            if (!e.isDirectory()) continue;
            const candidate = path.join(root, e.name, 'data');
            if (fs.existsSync(candidate)) return candidate;
        }
        return null;
    }

    /**
     * Free bytes at the filesystem hosting `dir`. Uses `df -k` so we
     * don't have to deal with statvfs portability. Returns 0 on error
     * — caller treats that as "unknown, fail closed".
     */
    async _freeBytes(dir) {
        return new Promise((resolve) => {
            const child = spawn('df', ['-Pk', dir], { stdio: ['ignore', 'pipe', 'pipe'] });
            let stdout = '';
            child.stdout.on('data', (c) => { stdout += c.toString(); });
            child.on('error', () => resolve(0));
            child.on('exit', () => {
                // df output: header + one line per fs. Free is column 4 (1K-blocks).
                const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
                if (lines.length < 2) return resolve(0);
                const cols = lines[lines.length - 1].split(/\s+/);
                const kb = parseInt(cols[3], 10);
                resolve(Number.isFinite(kb) ? kb * 1024 : 0);
            });
        });
    }

    _fmtGb(bytes) {
        return (bytes / (1024 ** 3)).toFixed(1) + ' GB';
    }
}

EnmBootstrapDownloader.PHASES = PHASES;

module.exports = EnmBootstrapDownloader;
