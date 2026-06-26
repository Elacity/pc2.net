/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * NodeJsRuntime — Wave M4.3 (beta.0.3.3) — locate or install the
 * Node.js v23.10.0 interpreter the Class C Oracles need.
 *
 * Plan §12 Q1 recommended bundling (+50MB) but the bundle path is a
 * release-engineering concern — for the runtime side we ship two
 * resolution paths:
 *
 *   1. detectOnHost()  — search PATH + standard install locations for
 *      a node binary >= v23.10.0. Returns the absolute path + reported
 *      version, or null if nothing usable was found.
 *
 *   2. installLocal()  — download the official prebuilt tarball from
 *      nodejs.org/dist/<version>/node-<version>-linux-<arch>.tar.gz,
 *      extract to chains/_runtime/node-<version>/, return the resolved
 *      `bin/node` path. Idempotent (skip if already installed).
 *
 * NODE.SH PARITY (plan §17 Class C row + node.sh:nodejs_setenv)
 *
 * node.sh's nodejs_setenv (line 520) hardcodes v23.10.0 and downloads
 * from nodejs.org. ENM mirrors the download but installs under our
 * data dir (not /usr/local) so we don't need sudo. The version string
 * is the same single source of truth — operators with a host node 23.x
 * just have it auto-detected; everyone else gets the local install on
 * first oracle setup.
 *
 * Why not just `npm install` an SDK? The oracle scripts are
 * standalone Node binaries with their own dependency vendoring; they
 * just need an interpreter. No package manager / project layout.
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const crypto = require('node:crypto'); // P1 (v0.5.183) — SHA256 tarball verify
const { execFile } = require('node:child_process');

const { enmDataDir } = require('./DataDir');

// P1 (v0.5.183) — bounded download retry. A transient network blip
// (reset/timeout) used to dead-end the whole oracle setup on the first
// failure; we now retry a few times with linear backoff before giving up.
const DOWNLOAD_MAX_ATTEMPTS = 3;
const DOWNLOAD_RETRY_BASE_MS = 2000;

// PINNED_VERSION is what installLocal() downloads as a LAST RESORT
// when the host doesn't have any usable Node.js. Matches node.sh:520
// for parity but is no longer the floor: any v18+ runtime works.
const PINNED_VERSION = 'v23.10.0';

// beta.0.4.1 (operator directive) — lowered MIN_MAJOR from 23 → 18.
// The oracle scripts use web3 + express + standard fs/net APIs that
// have wide Node.js compatibility. v18 is the same floor PC2 itself
// requires (enm-server/package.json engines: ">=20.18.0"), so any
// host running ENM already has a usable Node.js — no separate
// download needed in 99% of cases.
//
// resolveAny() now prefers HOST detection over LOCAL install so we
// reuse whatever Node.js PC2 brought to the host. installLocal stays
// as the last-resort fallback for stripped-down containers that
// somehow lack any usable Node.js.
const MIN_MAJOR = 18;

// Standard search paths for detectOnHost. PATH is searched first via
// `which node` (cheaper + canonical); these fall-back paths cover the
// "nvm install but not yet activated" case.
const HOST_SEARCH_PATHS = [
    '/usr/bin/node',
    '/usr/local/bin/node',
    '/opt/node/bin/node',
    path.join(os.homedir(), '.local/bin/node'),
    path.join(os.homedir(), '.nvm/versions/node/' + PINNED_VERSION + '/bin/node'),
];

// Where installLocal puts the runtime. _runtime/ is intentionally an
// underscore-prefixed sibling of chains/ so the chainId regex can't
// match it (defence against a malicious cfg.chains.*_runtime entry).
function runtimeRoot() {
    return path.join(enmDataDir(), '_runtime');
}

function archSuffix() {
    const a = os.arch();
    if (a === 'x64')   { return 'x64'; }
    if (a === 'arm64') { return 'arm64'; }
    if (a === 'arm')   { return 'armv7l'; }
    throw new Error(`NodeJsRuntime: unsupported arch ${a} (need x64/arm64/armv7l)`);
}

function platformSuffix() {
    const p = os.platform();
    if (p === 'linux')  { return 'linux'; }
    if (p === 'darwin') { return 'darwin'; }
    throw new Error(`NodeJsRuntime: unsupported platform ${p} (need linux/darwin)`);
}

/**
 * Build the canonical download URL for a given version.
 *
 * @param {string} version  e.g. 'v23.10.0'
 * @returns {string}
 */
function downloadUrl(version) {
    const v = String(version || PINNED_VERSION);
    return `https://nodejs.org/dist/${v}/node-${v}-${platformSuffix()}-${archSuffix()}.tar.gz`;
}

/**
 * Parse a `node --version` output line into a { major, minor, patch }
 * object. Returns null on parse failure (gracefully degrade vs throw
 * so the caller can swallow with "not usable").
 *
 * @param {string} stdout
 * @returns {{ major: number, minor: number, patch: number, raw: string }|null}
 */
function parseVersion(stdout) {
    const s = String(stdout || '').trim();
    const m = s.match(/^v(\d+)\.(\d+)\.(\d+)/);
    if (!m) { return null; }
    return {
        major: parseInt(m[1], 10),
        minor: parseInt(m[2], 10),
        patch: parseInt(m[3], 10),
        raw: s,
    };
}

/**
 * P1 (v0.5.183) — compare two parsed versions. Returns >0 if `a` is newer
 * than `b`, <0 if older, 0 if equal. Used to pick the highest already-installed
 * local runtime in detectAnyLocal().
 *
 * @param {{major:number,minor:number,patch:number}} a
 * @param {{major:number,minor:number,patch:number}} b
 * @returns {number}
 */
function compareVersions(a, b) {
    if (a.major !== b.major) { return a.major - b.major; }
    if (a.minor !== b.minor) { return a.minor - b.minor; }
    return a.patch - b.patch;
}

/**
 * Run `<bin> --version` with a short timeout. Returns parsed version
 * or null on any failure.
 *
 * @param {string} binPath
 * @returns {Promise<{major,minor,patch,raw}|null>}
 */
function probeVersion(binPath) {
    return new Promise((resolve) => {
        execFile(binPath, ['--version'], { timeout: 5000 }, (err, stdout) => {
            if (err) { return resolve(null); }
            resolve(parseVersion(stdout));
        });
    });
}

/**
 * P1 (v0.5.183) — resolve `node` from process.env.PATH directly (split the
 * PATH + probe each `<dir>/node`) instead of shelling out to `which`. `which`
 * is not guaranteed to be installed (stripped-down containers, minimal
 * images), so relying on it made host detection silently fail on exactly the
 * machines that need it most. Returns the first PATH entry whose `node`
 * probes major >= MIN_MAJOR, or null.
 *
 * @returns {Promise<string|null>}
 */
async function resolveNodeFromPath() {
    const rawPath = process.env.PATH || '';
    if (!rawPath) { return null; }
    const seen = new Set();
    for (const dir of rawPath.split(path.delimiter)) {
        if (!dir || seen.has(dir)) { continue; }
        seen.add(dir);
        const candidate = path.join(dir, 'node');
        if (!fs.existsSync(candidate)) { continue; }
        // eslint-disable-next-line no-await-in-loop
        const v = await probeVersion(candidate);
        if (v && v.major >= MIN_MAJOR) { return candidate; }
    }
    return null;
}

/**
 * Find a usable node binary on the host. First resolves `node` from
 * process.env.PATH directly; then falls back to HOST_SEARCH_PATHS. Returns
 * the first binary whose --version reports major >= MIN_MAJOR.
 *
 * @returns {Promise<{ path: string, version: {major,minor,patch,raw} } | null>}
 */
async function detectOnHost() {
    // 1. PATH lookup (split process.env.PATH + probe — no `which` dependency).
    const pathHit = await resolveNodeFromPath();
    if (pathHit) {
        const v = await probeVersion(pathHit);
        if (v && v.major >= MIN_MAJOR) {
            return { path: pathHit, version: v };
        }
    }
    // 2. Standard install locations.
    for (const candidate of HOST_SEARCH_PATHS) {
        if (!fs.existsSync(candidate)) { continue; }
        // eslint-disable-next-line no-await-in-loop
        const v = await probeVersion(candidate);
        if (v && v.major >= MIN_MAJOR) {
            return { path: candidate, version: v };
        }
    }
    return null;
}

/**
 * Resolve the locally-installed runtime path. Returns the path if a
 * prior installLocal() finished successfully + the binary is still
 * present + still reports a usable version. null otherwise.
 *
 * @param {string} [version=PINNED_VERSION]
 * @returns {Promise<{ path: string, version: {major,minor,patch,raw} } | null>}
 */
async function detectLocal(version) {
    const v = version || PINNED_VERSION;
    const expectedDir = path.join(
        runtimeRoot(),
        `node-${v}-${platformSuffix()}-${archSuffix()}`,
    );
    const bin = path.join(expectedDir, 'bin', 'node');
    if (!fs.existsSync(bin)) { return null; }
    const probed = await probeVersion(bin);
    if (probed && probed.major >= MIN_MAJOR) {
        return { path: bin, version: probed };
    }
    return null;
}

/**
 * P1 (v0.5.183) — accept ANY already-installed runtime under runtimeRoot(),
 * not just the exact PINNED_VERSION dir. detectLocal() only matches the pinned
 * `node-<PINNED_VERSION>-...` directory, so bumping PINNED_VERSION used to
 * orphan a perfectly good prior install and force a needless re-download.
 * Here we scan runtimeRoot() for any `node-v*` dir with a `bin/node`, probe
 * each, and return the highest-versioned one that meets MIN_MAJOR.
 * Best-effort: an unreadable/empty runtimeRoot() yields null.
 *
 * @returns {Promise<{ path: string, version: {major,minor,patch,raw} } | null>}
 */
async function detectAnyLocal() {
    let entries;
    try {
        entries = await fsp.readdir(runtimeRoot());
    } catch (_) {
        return null; // runtimeRoot() doesn't exist yet
    }
    let best = null;
    for (const name of entries) {
        if (!name.startsWith('node-v')) { continue; }
        const bin = path.join(runtimeRoot(), name, 'bin', 'node');
        if (!fs.existsSync(bin)) { continue; }
        // eslint-disable-next-line no-await-in-loop
        const probed = await probeVersion(bin);
        if (!probed || probed.major < MIN_MAJOR) { continue; }
        if (!best || compareVersions(probed, best.version) > 0) {
            best = { path: bin, version: probed };
        }
    }
    return best;
}

/**
 * Combined resolver. beta.0.4.1 (operator directive) — flipped to
 * prefer HOST detection over LOCAL install. Rationale: PC2 itself
 * requires Node v20+ (enm-server/package.json engines), so the host
 * is guaranteed to have a usable runtime in normal deployments. No
 * point downloading our own +50MB tarball when there's already a
 * perfectly good interpreter on PATH.
 *
 * Order of preference:
 *   1. detectOnHost   — whatever PC2 already uses (zero extra disk)
 *   2. detectAnyLocal — ANY usable runtime we previously installed (P1
 *                       (v0.5.183) — not just the exact PINNED_VERSION dir, so
 *                       a version bump doesn't force a needless re-download)
 *   3. null           — caller (OracleAdapter.start) refuses to spawn
 *
 * The installLocal endpoint is still useful for stripped-down
 * containers that lack Node.js entirely, but the common case never
 * needs it.
 *
 * @returns {Promise<{ path: string, version: object, source: 'local'|'host' } | null>}
 */
async function resolveAny() {
    const host = await detectOnHost();
    if (host) { return { ...host, source: 'host' }; }
    // P1 (v0.5.183) — accept any already-installed runtime (>= MIN_MAJOR),
    // preferring the exact pinned dir but falling back to any node-v* install.
    const localPinned = await detectLocal(PINNED_VERSION);
    if (localPinned) { return { ...localPinned, source: 'local' }; }
    const localAny = await detectAnyLocal();
    if (localAny) { return { ...localAny, source: 'local' }; }
    return null;
}

/**
 * Download the official nodejs.org prebuilt tarball + extract it
 * under runtimeRoot(). Returns the resolved bin path.
 *
 * Idempotent — if the target already exists + works, returns it
 * without re-downloading.
 *
 * The tarball is fetched over HTTPS (the official endpoint signs +
 * CDN-distributes; we trust TLS + the smoke test).
 *
 * P1 (v0.5.183) — robustness: the download now retries a few times with
 * backoff on transient failure, and (best-effort) verifies the tarball's
 * SHA256 against nodejs.org's SHASUMS256.txt before extracting. The SHA file
 * is unsigned so this is NOT tamper resistance over TLS — but it catches a
 * truncated/corrupt download (the common real-world failure) that would
 * otherwise blow up later in `tar -xzf` with a confusing error. If SHASUMS
 * can't be fetched/parsed we proceed (don't make verification a hard
 * dependency). A future M-task can integrate the Node.js Foundation GPG
 * signatures for real tamper resistance.
 *
 * @param {object} [opts]
 * @param {string} [opts.version=PINNED_VERSION]
 * @param {(msg:string) => void} [opts.onProgress]
 * @returns {Promise<{ path: string, version: object }>}
 */
async function installLocal(opts) {
    const o = opts || {};
    const version = o.version || PINNED_VERSION;
    const onProgress = o.onProgress || (() => {});

    // Idempotent check.
    const existing = await detectLocal(version);
    if (existing) {
        onProgress('Already installed.');
        return existing;
    }

    await fsp.mkdir(runtimeRoot(), { recursive: true, mode: 0o755 });
    const url = downloadUrl(version);
    const tarballName = path.basename(url);
    const tarballPath = path.join(runtimeRoot(), tarballName);

    // P1 (v0.5.183) — bounded retry with backoff on transient download
    // failure. downloadFile unlinks its own partial on stream error, so each
    // attempt starts clean.
    let lastErr = null;
    for (let attempt = 1; attempt <= DOWNLOAD_MAX_ATTEMPTS; attempt += 1) {
        try {
            onProgress(
                'Downloading ' + url
                + (attempt > 1 ? ` (attempt ${attempt}/${DOWNLOAD_MAX_ATTEMPTS})` : ''),
            );
            // eslint-disable-next-line no-await-in-loop
            await downloadFile(url, tarballPath);
            lastErr = null;
            break;
        } catch (err) {
            lastErr = err;
            // Drop any partial before retrying (downloadFile already tries, but
            // be defensive against a write that finished then failed validation).
            // eslint-disable-next-line no-await-in-loop
            try { await fsp.unlink(tarballPath); } catch (_) { /* best-effort */ }
            if (attempt < DOWNLOAD_MAX_ATTEMPTS) {
                onProgress(`Download failed (${err.message}) — retrying...`);
                // eslint-disable-next-line no-await-in-loop
                await delay(DOWNLOAD_RETRY_BASE_MS * attempt);
            }
        }
    }
    if (lastErr) {
        throw new Error(
            `NodeJsRuntime.installLocal: download failed after ${DOWNLOAD_MAX_ATTEMPTS} attempts `
            + `(${lastErr.message}).`,
        );
    }

    // P1 (v0.5.183) — best-effort SHA256 verify against nodejs.org's
    // SHASUMS256.txt. Catches a truncated/corrupt download before extract. If
    // the SHA file isn't fetchable/parseable we proceed (not a hard dependency).
    try {
        const expectedSha = await fetchExpectedSha256(version, tarballName);
        if (expectedSha) {
            onProgress('Verifying SHA256 of ' + tarballName);
            const actualSha = await sha256File(tarballPath);
            if (actualSha.toLowerCase() !== expectedSha.toLowerCase()) {
                try { await fsp.unlink(tarballPath); } catch (_) { /* best-effort */ }
                throw new Error(
                    `NodeJsRuntime.installLocal: SHA256 mismatch for ${tarballName} `
                    + `(expected ${expectedSha}, got ${actualSha}) — download corrupt; aborting.`,
                );
            }
            onProgress('SHA256 OK');
        }
    } catch (err) {
        // A genuine mismatch above re-threw with our "SHA256 mismatch" message;
        // surface that. Anything else (SHASUMS unreachable / unparseable) is
        // non-fatal — TLS already protected the transport.
        if (/SHA256 mismatch/.test(err.message)) { throw err; }
        onProgress('SHA256 verification skipped (' + err.message + ')');
    }

    onProgress('Extracting ' + tarballName);
    await extractTarball(tarballPath, runtimeRoot());
    // Clean up the tarball — saves disk for what's already extracted.
    try { await fsp.unlink(tarballPath); } catch (_) { /* best-effort */ }

    const detected = await detectLocal(version);
    if (!detected) {
        throw new Error(
            'NodeJsRuntime.installLocal: extracted but no usable node binary found. '
            + 'Check ' + runtimeRoot() + ' for unexpected layout.',
        );
    }
    onProgress('Installed ' + detected.version.raw + ' at ' + detected.path);
    return detected;
}

/** @private — HTTPS GET with redirect support, stream to disk.
 * P1 (v0.5.183) — unlink any partial file on stream/transport error so a
 * failed attempt never leaves a truncated tarball behind for the retry. */
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        // Reject after removing any partial output written so far.
        function fail(err) {
            fs.unlink(destPath, () => reject(err)); // best-effort unlink, then reject
        }
        function get(u, redirectsLeft) {
            const req = https.get(u, (res) => {
                // Follow 30x redirects.
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    if (redirectsLeft <= 0) {
                        return reject(new Error('Too many redirects'));
                    }
                    return get(res.headers.location, redirectsLeft - 1);
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error('HTTP ' + res.statusCode + ' from ' + u));
                }
                const out = fs.createWriteStream(destPath, { mode: 0o644 });
                res.pipe(out);
                out.on('finish', () => { out.close(resolve); });
                out.on('error', fail);
                // A mid-stream transport drop fires on the response — abort the
                // write and clean up the partial.
                res.on('error', (err) => { out.destroy(); fail(err); });
            });
            req.on('error', fail);
            req.setTimeout(120_000, () => {
                req.destroy(new Error('Download timeout after 120s'));
            });
        }
        get(url, 5);
    });
}

/** @private — Promise-based delay (linear backoff between download retries). */
function delay(ms) {
    return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/** @private — stream a file through SHA256 and return the lowercase hex digest. */
function sha256File(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

/** @private — HTTPS GET a small text body (SHASUMS256.txt), following
 * redirects. Bounded body size + timeout so a hostile/huge response can't
 * exhaust memory or hang. */
function fetchText(url) {
    return new Promise((resolve, reject) => {
        function get(u, redirectsLeft) {
            const req = https.get(u, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    if (redirectsLeft <= 0) { return reject(new Error('Too many redirects')); }
                    return get(res.headers.location, redirectsLeft - 1);
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error('HTTP ' + res.statusCode + ' from ' + u));
                }
                const chunks = [];
                let bytes = 0;
                res.on('data', (c) => {
                    bytes += c.length;
                    if (bytes > 1_000_000) { // SHASUMS256.txt is a few KB; cap at 1MB
                        res.destroy();
                        return reject(new Error('SHASUMS response too large'));
                    }
                    chunks.push(c);
                });
                res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
                res.on('error', reject);
            });
            req.on('error', reject);
            req.setTimeout(30_000, () => {
                req.destroy(new Error('SHASUMS fetch timeout after 30s'));
            });
        }
        get(url, 5);
    });
}

/**
 * @private — fetch + parse nodejs.org's SHASUMS256.txt for `version` and return
 * the expected SHA256 hex for `tarballName`, or null if not found. Each line is
 * `<sha256>  <filename>`.
 *
 * @param {string} version      e.g. 'v23.10.0'
 * @param {string} tarballName  e.g. 'node-v23.10.0-linux-x64.tar.gz'
 * @returns {Promise<string|null>}
 */
async function fetchExpectedSha256(version, tarballName) {
    const v = String(version || PINNED_VERSION);
    const text = await fetchText(`https://nodejs.org/dist/${v}/SHASUMS256.txt`);
    for (const line of text.split('\n')) {
        const m = line.trim().match(/^([0-9a-fA-F]{64})\s+(.+)$/);
        if (m && m[2] === tarballName) { return m[1]; }
    }
    return null;
}

/** @private — extract via `tar -xzf`. */
function extractTarball(tarPath, destDir) {
    return new Promise((resolve, reject) => {
        execFile('tar', ['-xzf', tarPath, '-C', destDir], { timeout: 120_000 }, (err) => {
            if (err) { return reject(err); }
            resolve();
        });
    });
}

module.exports = {
    PINNED_VERSION,
    MIN_MAJOR,
    detectOnHost,
    detectLocal,
    detectAnyLocal,
    resolveAny,
    installLocal,
    // exported for tests
    _internal: {
        parseVersion,
        compareVersions,
        probeVersion,
        downloadUrl,
        runtimeRoot,
        archSuffix,
        platformSuffix,
        resolveNodeFromPath,
        sha256File,
        fetchExpectedSha256,
    },
};
