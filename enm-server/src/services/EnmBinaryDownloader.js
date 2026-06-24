/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmBinaryDownloader — fetch prebuilt Elastos binaries from the official
 * download server. Mirrors what node.sh has done since 2018.
 *
 * Source pattern (verified via the upstream Elastos.Node script,
 * build/skeleton/node.sh:572-702):
 *
 *   https://download.elastos.io/elastos-<chain>/elastos-<chain>-<ver>/
 *     elastos-<chain>-<ver>-linux-{x86_64|arm64}.tgz
 *
 * The directory listing at .../elastos-<chain>/ exposes versions via
 * Apache's auto-index (?F=1). We fetch that, parse the version directory
 * names, and pick the highest semver.
 *
 * No checksums are published upstream — node.sh has a `# TODO: verify
 * checksum` comment from 2019. We document the same gap here and rely on
 * TLS + the smoke test (./ela --version) to detect a corrupted or
 * tampered tarball.
 *
 * State machine: idle → resolving → downloading → extracting → verifying
 *                → done   (or → failed at any step)
 *
 * Single-flight per chain. The streaming progress is broadcast on the SSE
 * topic `setup:install:<chainId>`.
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const { spawn, execFile } = require('node:child_process');

const { ENM_LOG_PREFIX } = require('./EnmConstants');
const { enmDataDir } = require('./DataDir');

// Catalog of supported chains. The URL key matches the path segment
// download.elastos.io uses; the entry-point key is the file under
// the extracted tarball that we treat as the canonical executable.
//
// `fallbackVersion` is the last release we know the upstream had at
// the time this catalog was reviewed. If the directory-index scrape
// fails (Apache config change, redirect, transient parse failure),
// we fall back to this so the install doesn't dead-end. The smoke
// test still proves the binary actually works.
const CHAINS = Object.freeze({
    mainchain: {
        urlSlug: 'elastos-ela',
        binary:  'ela',
        cli:     'ela-cli',
        description: 'Mainchain (ELA) — required for any node setup.',
        fallbackVersion: 'v0.9.9.5',
    },
    esc: {
        urlSlug: 'elastos-esc',
        binary:  'esc',
        cli:     null,
        description: 'EVM sidechain (ESC) — Solidity smart contracts.',
        // beta.0.4.6 — bumped from v0.1.4 (stale; pre-existed in catalog).
        // Upstream's latest at time of write is v0.2.7.1. Auto-resolution
        // via the directory-index scrape still happens first; fallback
        // only kicks in if the scrape fails.
        fallbackVersion: 'v0.2.7.1',
    },
    eid: {
        urlSlug: 'elastos-eid',
        binary:  'eid',
        cli:     null,
        description: 'Identity Chain (EID) — decentralised identity (DID).',
        // beta.0.4.6 — v1.2.4 confirmed via upstream catalog.
        fallbackVersion: 'v1.2.4',
    },
    // beta.4.02 (Wave M3.8) — PG entry added. PG is closed-source per
    // plan §11 risk #2; the URL slug follows the elastos-* convention.
    // P0-13 (v0.5.181) CORRECTION: an earlier comment here claimed
    // "verifyChecksum will reject any mismatch" — that method DOES NOT
    // EXIST. PG (like every binary today) is fetched with the same
    // TLS-only posture as the others, now hardened with a redirect
    // host allow-list + Content-Length truncation guard (see _download)
    // and the post-extract --version smoke test. Real SHA256-manifest
    // verification remains a TODO (was scoped as "M5.1"); until it ships
    // there is NO content integrity check beyond TLS + size. This entry
    // is reachable only by an explicit POST /setup/install/pg.
    pg: {
        urlSlug: 'elastos-pg',
        binary:  'pg',
        cli:     null,
        description: 'PG Chain (closed-source) — operator-supplied SHA256 manifest required (M5.1).',
        fallbackVersion: 'v1.0.0',
    },
    // beta.0.4.4 — Arbiter binary entry. node.sh's URL slug for the
    // Arbiter is 'elastos-arbiter' (per build/skeleton/node.sh §arbiter).
    // No CLI — Arbiter is a single binary that reads its config.json
    // from cwd. Used by the install-council orchestrator step 12.
    arbiter: {
        urlSlug: 'elastos-arbiter',
        binary:  'arbiter',
        cli:     null,
        description: 'Arbiter — cross-chain signer (multisig 1-of-N across all 4 chains).',
        // beta.0.4.6 — corrected from v1.4.1 (didn't exist upstream).
        // Probed download.elastos.io/elastos-arbiter/?F=1 — latest is
        // v0.4.1.2. Arbiter still on 0.x as of 2026-05-18.
        fallbackVersion: 'v0.4.1.2',
    },
    // ECO entry removed per H3 (ECO chain is permanently out-of-scope
    // for ENM; the plan §10 hard rules forbid ECO support).
});

const PHASES = Object.freeze({
    IDLE:        'idle',
    RESOLVING:   'resolving',
    DOWNLOADING: 'downloading',
    EXTRACTING:  'extracting',
    VERIFYING:   'verifying',
    DONE:        'done',
    FAILED:      'failed',
});

const DOWNLOAD_HOST = 'download.elastos.io';

class EnmBinaryDownloader {
    constructor(opts = {}) {
        this.logger = opts.logger || console;
        this.sseHub = opts.sseHub || null;
        // Per-chain status, keyed by chainId.
        this._status = Object.create(null);
        for (const id of Object.keys(CHAINS)) {
            this._status[id] = this._initialStatus(id);
        }
    }

    _initialStatus(chainId) {
        return {
            chainId,
            phase: PHASES.IDLE,
            version: null,
            url: null,
            bytesDownloaded: 0,
            bytesTotal: 0,
            installedAt: null,
            binaryPath: null,
            cliPath: null,
            startedAt: null,
            finishedAt: null,
            error: null,
        };
    }

    listChains() {
        return Object.entries(CHAINS).map(([id, info]) => ({
            chainId: id,
            urlSlug: info.urlSlug,
            description: info.description,
            installed: this._status[id].phase === PHASES.DONE,
            installedVersion: this._status[id].version,
        }));
    }

    getStatus(chainId) {
        if (!this._status[chainId]) {
            throw new Error(`Unknown chain: ${chainId}`);
        }
        return { ...this._status[chainId] };
    }

    /**
     * Resolve the chain's binary on disk, regardless of whether we have
     * live in-memory state for it. Used after restart: the binary may
     * already be installed under enmDataDir()/bin/<chainId>/ but our
     * downloader's status is back to IDLE.
     *
     * Returns { binaryPath, cliPath } if the install artifacts exist on
     * disk, or null otherwise.
     *
     * @param {string} chainId
     * @returns {Promise<{binaryPath: string, cliPath: string|null}|null>}
     */
    async resolveOnDisk(chainId) {
        const info = CHAINS[chainId];
        if (!info) return null;
        const root = path.join(enmDataDir(), 'bin', chainId);
        try {
            await fsp.access(root);
        } catch (_) {
            return null;
        }
        const binaryPath = await EnmBinaryDownloader._locateInTree(root, info.binary);
        if (!binaryPath) return null;
        const cliPath = info.cli
            ? await EnmBinaryDownloader._locateInTree(root, info.cli)
            : null;
        return { binaryPath, cliPath };
    }

    /**
     * Like getStatus, but rehydrates from disk when in-memory state is
     * IDLE and artifacts already exist. The wizard uses this to detect
     * "already installed" after a container restart.
     */
    async getStatusWithDisk(chainId) {
        const status = this.getStatus(chainId);
        if (status.phase !== PHASES.IDLE) return status;
        const onDisk = await this.resolveOnDisk(chainId);
        if (!onDisk) return status;
        // Synthesize a DONE status — version is unknown unless we can read
        // it back from --version, which is cheap (the smoke test we already
        // do). Fall back to "installed" string.
        const versionOut = await EnmBinaryDownloader._smokeTest(onDisk.binaryPath).catch(() => ({ ok: false }));
        const version = versionOut.ok
            ? (versionOut.output.match(/v[0-9]+(?:\.[0-9]+)+/) || [null])[0]
            : null;
        const synthesized = {
            ...this._initialStatus(chainId),
            phase: PHASES.DONE,
            binaryPath: onDisk.binaryPath,
            cliPath: onDisk.cliPath,
            version,
            installedAt: null,
        };
        // Cache it so subsequent calls don't re-stat.
        this._status[chainId] = synthesized;
        return { ...synthesized };
    }

    /**
     * Resolve the latest version of a chain from the download index.
     *
     * Real-world scrape: the Apache auto-index at download.elastos.io
     * is mostly stable but quoting (single vs double, no quotes) and
     * URL prefixing (relative slug vs absolute path) drift across the
     * different chain subdirs. We try every plausible href shape, and
     * if none of them match, we fall back to the catalog's
     * `fallbackVersion` rather than dead-ending the install.
     *
     * Caller logs the fallback path so the operator can see "we used
     * the pinned vX.Y.Z because we couldn't read the index."
     */
    async resolveLatestVersion(chainId) {
        const info = CHAINS[chainId];
        if (!info) throw new Error(`Unknown chain: ${chainId}`);

        let html = '';
        try {
            // ?F=1 forces the FancyIndexing layout; without the query
            // some mirrors return a redirect, others a plain list.
            html = await this._httpGetString(DOWNLOAD_HOST, `/${info.urlSlug}/?F=1`);
        } catch (err) {
            this.logger.warn(`${ENM_LOG_PREFIX} resolve ${chainId}: index fetch failed (${err.message}). Using fallback ${info.fallbackVersion}.`);
            return info.fallbackVersion;
        }

        const versions = EnmBinaryDownloader._scanVersions(html, info.urlSlug);
        if (versions.length === 0) {
            this.logger.warn(`${ENM_LOG_PREFIX} resolve ${chainId}: no versions matched the index format. First 240 chars: ${html.slice(0, 240).replace(/\s+/g, ' ')}`);
            this.logger.warn(`${ENM_LOG_PREFIX} resolve ${chainId}: falling back to pinned ${info.fallbackVersion}.`);
            return info.fallbackVersion;
        }
        versions.sort(EnmBinaryDownloader._semverCompare);
        return versions[versions.length - 1];
    }

    /**
     * Scan a directory-index HTML blob for version directories.
     * Tolerates: single/double/no quotes, leading slash, absolute or
     * relative href, mixed case attribute names. Extracts the version
     * stem (e.g. "v0.9.9.5") regardless of the surrounding chrome.
     */
    static _scanVersions(html, urlSlug) {
        const found = new Set();
        // Two-pass approach: anything that looks like
        //   <slug>-vN(.N)+(/-pre/-rc/-anything)*
        // we consider a version dir.
        const versionStem = '(v[0-9]+(?:\\.[0-9]+)+(?:[-_.][0-9a-zA-Z]+)*)';
        const patterns = [
            // href="slug-v..." or href='slug-v...' or href=slug-v...
            new RegExp(`(?:href|HREF)\\s*=\\s*["']?[^"'>]*?${urlSlug}-${versionStem}/?["'>]?`, 'g'),
            // bare text (e.g. inside a directory listing's <pre>)
            new RegExp(`${urlSlug}-${versionStem}/`, 'g'),
        ];
        for (const re of patterns) {
            let m;
            while ((m = re.exec(html))) found.add(m[1]);
        }
        // v0.5.248 (validator-readiness audit P1-6) — the capture above
        // tolerates -rc/-hotfix/commit-hash suffixes so the index parses, but
        // the INSTALLER must never SELECT one (it would silently push a
        // pre-release/untested build onto a validator). Keep only clean
        // dotted-numeric releases (vX.Y[.Z[.W]]), matching EnmChainUpdateScanner.
        // If nothing clean matched, caller falls back to the pinned version.
        const STRICT_VERSION = /^v[0-9]+(?:\.[0-9]+)+$/;
        return Array.from(found).filter((v) => STRICT_VERSION.test(v));
    }

    /**
     * Start a download + install for a chain. Returns immediately; progress
     * lives on the chain's status object and on SSE topic
     * `setup:install:<chainId>`.
     */
    async start(chainId) {
        const info = CHAINS[chainId];
        if (!info) throw new Error(`Unknown chain: ${chainId}`);
        const status = this._status[chainId];

        // Single-flight guard.
        const inFlight = [PHASES.RESOLVING, PHASES.DOWNLOADING, PHASES.EXTRACTING, PHASES.VERIFYING];
        if (inFlight.includes(status.phase)) {
            return { alreadyRunning: true, status: this.getStatus(chainId) };
        }

        // Reset to a fresh run.
        this._status[chainId] = this._initialStatus(chainId);
        const s = this._status[chainId];
        s.startedAt = Date.now();
        this._emit(chainId, PHASES.RESOLVING, 'Resolving latest version...');

        // Run the pipeline async; caller polls or subscribes.
        this._run(chainId).catch((err) => {
            s.phase = PHASES.FAILED;
            s.error = err.message;
            s.finishedAt = Date.now();
            this._emit(chainId, PHASES.FAILED, err.message);
            this.logger.error(`${ENM_LOG_PREFIX} install ${chainId} failed: ${err.message}`);
        });

        return { alreadyRunning: false, status: this.getStatus(chainId) };
    }

    async _run(chainId) {
        const info = CHAINS[chainId];
        const s = this._status[chainId];

        // 1. Resolve version
        const version = await this.resolveLatestVersion(chainId);
        s.version = version;

        // 2. Download
        const arch = EnmBinaryDownloader._arch();
        const filename = `${info.urlSlug}-${version}-linux-${arch}.tgz`;
        const remotePath = `/${info.urlSlug}/${info.urlSlug}-${version}/${filename}`;
        s.url = `https://${DOWNLOAD_HOST}${remotePath}`;

        const cacheDir = path.join(enmDataDir(), 'cache', 'downloads');
        await fsp.mkdir(cacheDir, { recursive: true });
        const tarball = path.join(cacheDir, filename);

        s.phase = PHASES.DOWNLOADING;
        this._emit(chainId, PHASES.DOWNLOADING, `Downloading ${filename}...`);
        await this._download(DOWNLOAD_HOST, remotePath, tarball, (got, total) => {
            s.bytesDownloaded = got;
            s.bytesTotal = total;
            this._emit(chainId, PHASES.DOWNLOADING, '', { got, total });
        });

        // 3. Extract into a STAGING dir, smoke-test there, THEN atomically
        //    swap into the live bin dir (validator-readiness audit P1-5).
        //    Pre-v0.5.248 the tar extracted directly over the live binary, so
        //    a crash / SIGKILL / disk-full mid-extract — or a failed smoke
        //    test — could leave a half-written binary that won't start.
        //    node.sh avoids this by staging then `cp`. We stage → smoke →
        //    rename, and keep the previous binary as <id>.bak for one-step
        //    rollback. (The update route already requires the chain be stopped,
        //    so the live binary file is never open during the rename.)
        s.phase = PHASES.EXTRACTING;
        this._emit(chainId, PHASES.EXTRACTING, 'Extracting...');
        const binRoot = path.join(enmDataDir(), 'bin');
        const liveDir = path.join(binRoot, chainId);
        const stagingDir = path.join(binRoot, `${chainId}.staging`);
        const bakDir = path.join(binRoot, `${chainId}.bak`);
        await fsp.mkdir(binRoot, { recursive: true });
        await fsp.rm(stagingDir, { recursive: true, force: true }); // clear any prior aborted stage
        await fsp.mkdir(stagingDir, { recursive: true });
        await EnmBinaryDownloader._extractTar(tarball, stagingDir);

        // Locate + chmod the binary IN STAGING — the live dir is untouched
        // until the swap below, so a malformed tarball can't brick the chain.
        const stagedBinary = await EnmBinaryDownloader._locateInTree(stagingDir, info.binary);
        if (!stagedBinary) {
            await fsp.rm(stagingDir, { recursive: true, force: true });
            // 0.5.88 — err.code lets chains.js/setup.js surface a specific
            // "upstream tarball malformed → file a bug" message.
            const e = new Error(`Binary "${info.binary}" not found inside extracted tarball.`);
            e.code = 'BINARY_MISSING';
            throw e;
        }
        await fsp.chmod(stagedBinary, 0o755);
        if (info.cli) {
            const stagedCli = await EnmBinaryDownloader._locateInTree(stagingDir, info.cli);
            if (stagedCli) { await fsp.chmod(stagedCli, 0o755); }
        }

        // 4. Smoke test the STAGED binary BEFORE swapping the live one.
        s.phase = PHASES.VERIFYING;
        this._emit(chainId, PHASES.VERIFYING, 'Verifying binary...');
        const versionOut = await EnmBinaryDownloader._smokeTest(stagedBinary);
        if (!versionOut.ok) {
            await fsp.rm(stagingDir, { recursive: true, force: true }); // live binary never touched
            const e = new Error(`Binary smoke test failed: ${versionOut.error}`);
            e.code = 'SMOKE_TEST_FAILED';
            throw e;
        }

        // 5. Atomic swap (same-fs renames): live → .bak, staging → live.
        //    On any failure, restore the previous binary so the chain can run.
        await fsp.rm(bakDir, { recursive: true, force: true }); // drop the prior backup
        let liveExisted = true;
        try { await fsp.access(liveDir); } catch (_) { liveExisted = false; }
        try {
            if (liveExisted) { await fsp.rename(liveDir, bakDir); }
            await fsp.rename(stagingDir, liveDir);
        } catch (swapErr) {
            let liveOk = true;
            try { await fsp.access(liveDir); } catch (_) { liveOk = false; }
            if (!liveOk && liveExisted) {
                try { await fsp.rename(bakDir, liveDir); } catch (_2) { /* nothing more we can do */ }
            }
            await fsp.rm(stagingDir, { recursive: true, force: true });
            throw swapErr;
        }

        // Re-locate the binary in the now-live dir for the status payload.
        const binaryPath = await EnmBinaryDownloader._locateInTree(liveDir, info.binary);
        s.binaryPath = binaryPath;
        if (info.cli) {
            const cliPath = await EnmBinaryDownloader._locateInTree(liveDir, info.cli);
            if (cliPath) { s.cliPath = cliPath; }
        }

        s.phase = PHASES.DONE;
        s.finishedAt = Date.now();
        s.installedAt = s.finishedAt;
        this._emit(chainId, PHASES.DONE, `Installed ${info.binary} ${version}`, {
            binaryPath: s.binaryPath,
            cliPath: s.cliPath,
            version,
        });

        // v0.5.249 — the installed binary just changed. Drop the per-chain
        // update scanner's cached result and force its next poll, so the
        // overview's "Update available" badge clears immediately instead of
        // lingering up to the scanner's 6h TTL (the reported "shows an update
        // while already on the latest" right after updating). Best-effort +
        // late require so a load cycle or a missing scanner can't fail an
        // otherwise-successful install — the badge self-corrects on the next
        // 6h refresh regardless.
        try {
            require('./EnmChainUpdateScanner').getInstance().invalidate(chainId);
        } catch (_) { /* non-fatal */ }
    }

    _emit(chainId, phase, message, extra) {
        if (!this.sseHub) return;
        try {
            // 0.2.0-beta.3.9 — was `.broadcast(...)`, which doesn't
            // exist on SseHub. SseHub exposes `publish(topic, data)`
            // (all subscribers to topic) and `publishToWallet(...)`
            // (scoped). Install progress is a system-level event
            // — every subscribed operator wants to see it — so we
            // use publish(). The pre-fix throw was silently caught
            // by the outer try/catch, leaving the frontend setup-
            // conversation to fall back to its 4s REST poll. Wizard
            // still worked but the snappy SSE live feed was dead.
            this.sseHub.publish(`setup:install:${chainId}`, {
                chainId, phase, message: message || '', ts: Date.now(), ...(extra || {}),
            });
        } catch (_) { /* SSE failures shouldn't break the install */ }
    }

    /**
     * GET a URL and return the body as a string (UTF-8). Used for the
     * directory index parse.
     */
    _httpGetString(host, urlPath) {
        return new Promise((resolve, reject) => {
            const req = https.get({
                host, path: urlPath, headers: { 'User-Agent': 'enm-server/0.2' },
                timeout: 15_000,
            }, (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error(`HTTP ${res.statusCode} on ${host}${urlPath}`));
                }
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
                res.on('error', reject);
            });
            req.on('error', reject);
            req.on('timeout', () => req.destroy(new Error(`Timeout reaching ${host}${urlPath}`)));
        });
    }

    /**
     * GET a URL and stream the body to a file. Reports progress via
     * onProgress(bytesGot, bytesTotal). Follows redirects up to 3 hops.
     *
     * Writes to ${dest}.partial first then renames to dest on a clean
     * 'finish' event. A failed/aborted download leaves the partial behind
     * but never corrupts the final path — so the subsequent _extractTar
     * call doesn't choke on a half-written tarball. Any pre-existing
     * partial from an earlier failure is unlinked before we start.
     */
    _download(host, urlPath, dest, onProgress) {
        const tmp = `${dest}.partial`;
        return new Promise((resolve, reject) => {
            // Clear any leftover partial from a previous failed attempt.
            fs.rm(tmp, { force: true }, () => {
                (function attempt(currentHost, currentPath, hops) {
                    if (hops > 3) return reject(new Error('Too many redirects'));
                    const req = https.get({
                        host: currentHost, path: currentPath,
                        headers: { 'User-Agent': 'enm-server/0.2' },
                        timeout: 60_000,
                    }, (res) => {
                        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                            const loc = res.headers.location;
                            if (!loc) return reject(new Error(`Redirect ${res.statusCode} without Location`));
                            res.resume();
                            try {
                                const u = new URL(loc, `https://${currentHost}${currentPath}`);
                                // P0-13 — only follow redirects that stay on the
                                // publisher's domain. A 30x to an arbitrary host is a
                                // supply-chain hijack vector — the bytes are chmod +x'd
                                // and executed as the chain process (root).
                                const h = u.hostname.toLowerCase();
                                if (!(h === 'elastos.io' || h.endsWith('.elastos.io'))) {
                                    return reject(new Error(`refusing binary redirect to disallowed host: ${u.host}`));
                                }
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
                                // P0-13 — truncation guard. A stream that finishes
                                // "cleanly" but delivered fewer bytes than Content-Length
                                // (proxy/CDN cutoff, short read) would otherwise be renamed
                                // to dest and extracted/executed as if complete. Reject so
                                // the caller re-downloads instead of running a partial binary.
                                if (total > 0 && got !== total) {
                                    fs.rm(tmp, { force: true }, () => reject(new Error(
                                        `truncated download: got ${got} of ${total} bytes for ${urlPath}`,
                                    )));
                                    return;
                                }
                                // Atomic-ish: rename only after a clean close.
                                // Any reader that was watching dest sees either
                                // the previous version or the new one — never
                                // a half-written one.
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
                    req.on('error', reject);
                    req.on('timeout', () => req.destroy(new Error('Download timed out')));
                })(host, urlPath, 0);
            });
        });
    }

    static _arch() {
        const a = os.arch();
        if (a === 'x64')   return 'x86_64';
        if (a === 'arm64') return 'arm64';
        // 0.5.88 — see BINARY_MISSING above. UNSUPPORTED_ARCH is the
        // primary motivating case for the err.code branching: operator
        // running on i386/aarch64-be/riscv needs to know their host
        // isn't supported, not see a generic 'Try again' loop.
        const e = new Error(`Unsupported architecture: ${a}. download.elastos.io publishes x86_64 + arm64 only.`);
        e.code = 'UNSUPPORTED_ARCH';
        throw e;
    }

    static _extractTar(tarball, targetDir) {
        return new Promise((resolve, reject) => {
            const child = spawn('tar', ['-xzf', tarball, '-C', targetDir], { stdio: ['ignore', 'pipe', 'pipe'] });
            let stderr = '';
            child.stderr.on('data', (c) => { stderr += c.toString(); });
            child.on('error', reject);
            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`tar exited with code ${code}: ${stderr.trim()}`));
            });
        });
    }

    static async _locateInTree(rootDir, basename) {
        const entries = await fsp.readdir(rootDir, { withFileTypes: true });
        for (const e of entries) {
            const full = path.join(rootDir, e.name);
            if (e.isDirectory()) {
                const found = await EnmBinaryDownloader._locateInTree(full, basename);
                if (found) return found;
            } else if (e.isFile() && e.name === basename) {
                return full;
            }
        }
        return null;
    }

    /**
     * Confirm a downloaded binary is executable + reports its version.
     * Elastos binaries don't share a single version flag convention:
     *   - ela mainchain:   accepts `--version`
     *   - arbiter:         accepts `-v` ONLY (help: "-v print version and exit")
     *   - esc/eid/pg:      Geth forks; in practice reject `-version` on this build
     *                       — try `version` subcommand and `--help` as fallbacks
     *
     * Try a sequence of flags; resolve {ok:true} on the FIRST one that exits 0.
     * If all attempts fail, return the most-informative error string.
     */
    static _smokeTest(binaryPath) {
        const ATTEMPTS = [
            ['--version'],   // ela, most geth-style
            ['-v'],          // arbiter, urfave/cli-style binaries
            ['version'],     // subcommand-style (geth-style "version" command)
            ['--help'],      // last resort — executable + parses flags = good enough
        ];
        return new Promise((resolve) => {
            let lastError = '';
            let i = 0;
            function tryNext() {
                if (i >= ATTEMPTS.length) {
                    return resolve({ ok: false, error: lastError || 'no version flag accepted' });
                }
                const args = ATTEMPTS[i++];
                execFile(binaryPath, args, { timeout: 10_000 }, (err, stdout, stderr) => {
                    if (!err) {
                        return resolve({
                            ok: true,
                            output: (stdout || stderr).trim().split('\n')[0],
                            flagUsed: args.join(' '),
                        });
                    }
                    const errStr = (stderr || err.message || '').trim();
                    // Hold onto the FIRST error — it's usually the most informative.
                    if (!lastError) { lastError = errStr; }
                    tryNext();
                });
            }
            tryNext();
        });
    }

    /** Compare two semver-like strings ("v0.9.9.5"). Returns -1/0/1. */
    static _semverCompare(a, b) {
        const norm = (s) => s.replace(/^v/, '').split(/[.-]/).map((p) => /^\d+$/.test(p) ? parseInt(p, 10) : p);
        const A = norm(a), B = norm(b);
        for (let i = 0; i < Math.max(A.length, B.length); i++) {
            const x = A[i], y = B[i];
            if (x === y) continue;
            if (x === undefined) return -1;
            if (y === undefined) return 1;
            if (typeof x === 'number' && typeof y === 'number') return x - y;
            return String(x).localeCompare(String(y));
        }
        return 0;
    }
}

module.exports = {
    EnmBinaryDownloader,
    CHAINS,
    PHASES,
};
