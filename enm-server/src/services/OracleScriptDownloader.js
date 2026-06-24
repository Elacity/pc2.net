/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * OracleScriptDownloader — v0.4.7 — fetch the upstream oracle relayer
 * bundles (crosschain_oracle.js / crosschain_eid.js / crosschain_pg.js
 * plus their pinned node_modules) that Class C (Oracle) adapters spawn
 * against.
 *
 * Why this exists: the M4.1 OracleAdapter requires cfg.chains.<id>
 * .scriptPath to point at a directory containing crosschain_<X>.js,
 * and the M4.4 install-class-c endpoint refuses to write the cfg
 * entry unless the operator supplies that path. Without an automatic
 * download path, the operator has to manually clone the Elastos
 * Github repo and tell ENM where it landed — friction the Council
 * install wizard is meant to eliminate.
 *
 * UPSTREAM SOURCE — corrected in v0.4.7
 *
 * v0.4.4 → v0.4.6 fetched single .js files from
 * `raw.githubusercontent.com`, then expected callers to run `npm
 * install` separately to bring in web3@1.7.3 + express@4.18.1. That
 * was always fragile (raw URLs drift across upstream restructures)
 * and PG was incorrectly marked "closed-source — no public repo".
 *
 * Re-reading upstream `node.sh` (lines 4150-4300 of
 * https://raw.githubusercontent.com/elastos/Elastos.Node/master/build/skeleton/node.sh)
 * confirms ALL THREE oracles ship as canonical .tgz bundles on
 * download.elastos.io — same host EnmBinaryDownloader uses for the
 * ELA/ESC/EID/Arbiter binaries. The .tgz contains the script PLUS
 * its `node_modules` (web3@1.7.3 + express@4.18.1 per node.sh:4295),
 * so the operator never has to run `npm install`.
 *
 * URL pattern (mirrors EnmBinaryDownloader):
 *
 *   https://download.elastos.io/elastos-<chain>-oracle/
 *     elastos-<chain>-oracle-<ver>/elastos-<chain>-oracle-<ver>.tgz
 *
 *   chain ∈ { esc, eid, pg }
 *
 * Each chain's directory listing exposes versioned subdirs via
 * Apache's auto-index (?F=1). We fetch that, parse the version
 * directory names, and pick the highest semver. On any listing
 * failure we fall back to `fallbackVersion` so the install doesn't
 * dead-end.
 *
 * On-disk layout (changed in v0.4.7):
 *
 *   <enmDataDir>/_oracle-scripts/
 *     ├── esc-oracle/
 *     │   ├── crosschain_oracle.js
 *     │   ├── node_modules/...
 *     │   └── package.json
 *     ├── eid-oracle/
 *     │   ├── crosschain_eid.js
 *     │   └── node_modules/...
 *     └── pg-oracle/
 *         ├── crosschain_pg.js
 *         └── node_modules/...
 *
 * Per-oracle subdirs (vs the pre-0.4.7 flat scripts/ dir) so each
 * oracle's node_modules can't collide with another's pin. Callers
 * that write cfg.chains.<oracleId>.scriptPath should now use
 * scriptDirFor(chainId) — the per-oracle directory — rather than
 * scriptsDir() (the parent). scriptsDir() is preserved as an export
 * for diagnostics and the install routine's working-dir setup.
 *
 * NO CHECKSUM verification today — same posture as
 * EnmBinaryDownloader: TLS + smoke-test (require the script and
 * verify it loads its deps). A future task can layer the official
 * Elastos Foundation GPG signatures on top.
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const { execFile } = require('node:child_process');

const { enmDataDir } = require('./DataDir');
const { ENM_LOG_PREFIX } = require('./EnmConstants');

// Per-oracle catalog. Drops the pre-0.4.7 `url` (URL is now computed
// from chainName + version) and `autoDownloadable` flag (all three
// are auto-downloadable now that we've confirmed PG also publishes
// on download.elastos.io).
//
// `scriptName` is the file inside the .tgz that OracleAdapter spawns
// via `node <scriptPath>/<scriptName>`. `chainName` is the URL slug
// at download.elastos.io. `fallbackVersion` is the last release we
// know upstream had at the time this catalog was reviewed — used
// when the directory-index scrape fails (Apache config drift,
// transient HTTP error, etc.).
//
// Pin sources (node.sh:4150-4300):
//   ESC oracle v0.2.7  — crosschain_oracle.js
//   EID oracle v0.2.1  — crosschain_eid.js
//   PG  oracle v0.0.3.3 — crosschain_pg.js
const ORACLE_SOURCES = Object.freeze({
    'esc-oracle': {
        scriptName: 'crosschain_oracle.js',
        chainName: 'esc-oracle',
        fallbackVersion: 'v0.2.7',
    },
    'eid-oracle': {
        scriptName: 'crosschain_eid.js',
        chainName: 'eid-oracle',
        fallbackVersion: 'v0.2.1',
    },
    'pg-oracle': {
        scriptName: 'crosschain_pg.js',
        chainName: 'pg-oracle',
        fallbackVersion: 'v0.0.3.3',
    },
});

// Bundles include node_modules so they're 5-50 MB. 10 minutes lets a
// slow VPS line finish without spurious timeouts. Smaller than the
// chain-binary downloads (which are 100-500 MB) so 10 min is enough.
const DOWNLOAD_TIMEOUT_MS = 600_000;

const DOWNLOAD_HOST = 'download.elastos.io';

// HTTP timeouts for the small ops (index scrape, redirects).
const INDEX_FETCH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the parent directory under which all per-oracle subdirs
 * live. Stable across versions so the wizard can show it in
 * diagnostics ("Oracle scripts root: ...").
 *
 * @returns {string}
 */
function scriptsDir() {
    return path.join(enmDataDir(), '_oracle-scripts');
}

/**
 * Resolve the per-oracle directory where the script + its
 * node_modules live. This is what cfg.chains.<oracleId>.scriptPath
 * should reference — OracleAdapter does
 * `path.join(cfg.scriptPath, this.scriptFilename)` to build the
 * spawn argv.
 *
 * @param {string} chainId  'esc-oracle' | 'eid-oracle' | 'pg-oracle'
 * @returns {string}
 */
function scriptDirFor(chainId) {
    const src = ORACLE_SOURCES[chainId];
    if (!src) {
        throw new Error(`OracleScriptDownloader: unknown oracle chainId "${chainId}"`);
    }
    return path.join(scriptsDir(), chainId);
}

/**
 * Resolve the absolute path to the .js entry-point for an oracle.
 * Used by isInstalled() and by callers that want to verify a
 * specific file is on disk.
 *
 * @param {string} chainId  'esc-oracle' | 'eid-oracle' | 'pg-oracle'
 * @returns {string}
 */
function scriptPathFor(chainId) {
    const src = ORACLE_SOURCES[chainId];
    if (!src) {
        throw new Error(`OracleScriptDownloader: unknown oracle chainId "${chainId}"`);
    }
    return path.join(scriptDirFor(chainId), src.scriptName);
}

/**
 * Check if the script is already on disk + non-empty. Treat empty
 * files as "missing" — a previous failed download could leave a 0B
 * stub; better to re-download than mis-spawn.
 *
 * @param {string} chainId
 * @returns {boolean}
 */
function isInstalled(chainId) {
    try {
        const p = scriptPathFor(chainId);
        const st = fs.statSync(p);
        if (!st.isFile() || st.size === 0) { return false; }
        // node.sh PARITY (node.sh:4207 <x>-oracle_init) — an oracle is only
        // "installed" when its node_modules are present too. The upstream
        // tarball ships SOURCE ONLY (crosschain_<x>.js + helpers), NOT
        // node_modules, so without `npm install web3 express` the script
        // crashes code=1 on require('express'). Treat missing deps as
        // not-installed so downloadOne re-runs (re-fetch + npm install).
        const expressDir = path.join(scriptDirFor(chainId), 'node_modules', 'express');
        return fs.existsSync(expressDir);
    } catch (_) {
        return false;
    }
}

// ---------------------------------------------------------------------------
// HTTP helpers
//
// TODO(v0.4.8): these duplicate the equivalent helpers in
// EnmBinaryDownloader (_httpGetString / _download / _semverCompare /
// _scanVersions). Once both files are stable, extract them into a
// shared EnmDownloadHelpers module. Keeping the duplication for now
// to avoid a cross-file churn before the v0.4.7 ship.
// ---------------------------------------------------------------------------

/** @private — GET a URL and return the body as UTF-8 string. */
function httpGetString(host, urlPath) {
    return new Promise((resolve, reject) => {
        const req = https.get({
            host,
            path: urlPath,
            headers: { 'User-Agent': 'enm-server/0.4.7' },
            timeout: INDEX_FETCH_TIMEOUT_MS,
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
 * @private — GET a URL and stream the body to a file. Reports
 * progress via onProgress(bytesGot, bytesTotal). Follows redirects
 * up to 3 hops.
 *
 * Writes to ${dest}.partial first then renames to dest on a clean
 * 'finish' event. A failed/aborted download leaves the partial
 * behind but never corrupts the final path — so the subsequent tar
 * extraction can't choke on a half-written tarball. Any pre-existing
 * partial from an earlier failure is unlinked before we start.
 */
function downloadFile(host, urlPath, dest, onProgress) {
    const tmp = `${dest}.partial`;
    return new Promise((resolve, reject) => {
        fs.rm(tmp, { force: true }, () => {
            (function attempt(currentHost, currentPath, hops) {
                if (hops > 3) return reject(new Error('Too many redirects'));
                const req = https.get({
                    host: currentHost,
                    path: currentPath,
                    headers: { 'User-Agent': 'enm-server/0.4.7' },
                    timeout: DOWNLOAD_TIMEOUT_MS,
                }, (res) => {
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
                            // Atomic-ish: rename only after a clean close.
                            fs.rename(tmp, dest, (renameErr) => {
                                if (renameErr) {
                                    fs.rm(tmp, { force: true }, () => reject(renameErr));
                                    return;
                                }
                                resolve(got);
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
                req.on('timeout', () => req.destroy(new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`)));
            })(host, urlPath, 0);
        });
    });
}

/**
 * @private — Scan a directory-index HTML blob for version
 * subdirectories. Tolerates single/double/no quotes, leading
 * slash, absolute or relative href, mixed-case attribute names.
 * Extracts the version stem (e.g. "v0.2.7" or "v0.0.3.3")
 * regardless of the surrounding markup.
 *
 * Mirrors EnmBinaryDownloader._scanVersions so a future shared-
 * helpers extraction is a literal move.
 */
function scanVersions(html, urlSlug) {
    const found = new Set();
    const versionStem = '(v[0-9]+(?:\\.[0-9]+)+(?:[-_.][0-9a-zA-Z]+)*)';
    const patterns = [
        new RegExp(`(?:href|HREF)\\s*=\\s*["']?[^"'>]*?${urlSlug}-${versionStem}/?["'>]?`, 'g'),
        new RegExp(`${urlSlug}-${versionStem}/`, 'g'),
    ];
    for (const re of patterns) {
        let m;
        while ((m = re.exec(html))) found.add(m[1]);
    }
    return Array.from(found);
}

/** @private — Compare two semver-like strings ("v0.2.7"). Returns -1/0/1. */
function semverCompare(a, b) {
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

/**
 * @private — Resolve the latest published version for an oracle by
 * scraping its directory index. Falls back to the catalog's
 * `fallbackVersion` on any failure (logged but non-fatal) so a
 * transient index-fetch error doesn't dead-end the install.
 */
async function resolveLatestVersion(chainId, logger) {
    const src = ORACLE_SOURCES[chainId];
    const slug = `elastos-${src.chainName}`;
    let html = '';
    try {
        html = await httpGetString(DOWNLOAD_HOST, `/${slug}/?F=1`);
    } catch (err) {
        if (logger && logger.warn) {
            logger.warn(`${ENM_LOG_PREFIX} oracle-scripts ${chainId}: index fetch failed (${err.message}). Using fallback ${src.fallbackVersion}.`);
        }
        return src.fallbackVersion;
    }
    const versions = scanVersions(html, slug);
    if (versions.length === 0) {
        if (logger && logger.warn) {
            logger.warn(`${ENM_LOG_PREFIX} oracle-scripts ${chainId}: no versions matched the index format. Falling back to pinned ${src.fallbackVersion}.`);
        }
        return src.fallbackVersion;
    }
    versions.sort(semverCompare);
    return versions[versions.length - 1];
}

// ---------------------------------------------------------------------------
// Tar extraction
// ---------------------------------------------------------------------------

/**
 * @private — Extract a .tgz to a target directory by shelling out
 * to `tar -xzf`. The `tar` npm package isn't in enm-server's deps
 * (deliberately — same posture as EnmBinaryDownloader), so we
 * lean on the system tar that every supported Ubuntu/Debian box
 * ships with. execFile (not exec) keeps argv un-shell-interpreted
 * so a maliciously-named tarball can't shell-inject.
 */
function extractTar(tarball, targetDir) {
    return new Promise((resolve, reject) => {
        execFile('tar', ['-xzf', tarball, '-C', targetDir], { timeout: DOWNLOAD_TIMEOUT_MS }, (err, _stdout, stderr) => {
            if (err) {
                return reject(new Error(`tar -xzf failed: ${stderr ? stderr.trim() : err.message}`));
            }
            resolve();
        });
    });
}

// node.sh PARITY (node.sh:4207 <x>-oracle_init) — pinned oracle deps. The
// upstream download.elastos.io tarball ships SOURCE ONLY; node.sh installs
// these in the oracle dir right after fetching the scripts so `node
// crosschain_<x>.js` can require('express')/('web3'). web3@1.7.3 +
// express@4.18.1 are the exact pins node.sh uses for all three oracles.
const ORACLE_NPM_DEPS = Object.freeze(['web3@1.7.3', 'express@4.18.1']);
const NPM_INSTALL_TIMEOUT_MS = 300_000;

/**
 * @private — Run `npm install web3@1.7.3 express@4.18.1` inside the oracle's
 * script dir so it is self-contained + runnable, mirroring node.sh. Uses the
 * host Node.js runtime PC2 already runs (npm sits next to node in the same
 * bin dir); prepends that bin dir to PATH so the right node drives npm.
 * Throws (loud, non-silent) if npm fails or express is still missing.
 *
 * @param {string} targetDir  the per-oracle script dir (scriptDirFor result)
 * @param {string} chainId
 * @param {object} [opts]  { onProgress, logger }
 */
async function installOracleDeps(targetDir, chainId, opts) {
    const o = opts || {};
    const onProgress = o.onProgress || (() => {});
    const logger = o.logger || console;

    // Skip if deps already present (idempotent re-install).
    if (fs.existsSync(path.join(targetDir, 'node_modules', 'express'))) {
        onProgress(`${chainId}: oracle deps already present`);
        return;
    }

    const NodeJsRuntime = require('./NodeJsRuntime');
    const rt = await NodeJsRuntime.resolveAny();
    if (!rt || !rt.path) {
        throw new Error(
            `OracleScriptDownloader: no Node.js runtime available to install ${chainId} `
            + 'oracle deps (web3/express). Ensure Node.js v20+ is on the host.');
    }
    const nodeBinDir = path.dirname(rt.path);
    const npmBin = path.join(nodeBinDir, 'npm');

    onProgress(`${chainId}: installing oracle deps (${ORACLE_NPM_DEPS.join(' ')})...`);
    await new Promise((resolve, reject) => {
        execFile(
            fs.existsSync(npmBin) ? npmBin : 'npm',
            ['install', ...ORACLE_NPM_DEPS, '--no-audit', '--no-fund', '--loglevel=error'],
            {
                cwd: targetDir,
                timeout: NPM_INSTALL_TIMEOUT_MS,
                env: { ...process.env, PATH: `${nodeBinDir}:${process.env.PATH || ''}` },
                maxBuffer: 16 * 1024 * 1024,
            },
            (err, _stdout, stderr) => {
                if (err) {
                    const tail = stderr ? stderr.trim().split('\n').slice(-3).join(' | ') : err.message;
                    return reject(new Error(
                        `npm install (${ORACLE_NPM_DEPS.join(' ')}) failed for ${chainId} in ${targetDir}: ${tail}`));
                }
                resolve();
            },
        );
    });

    if (!fs.existsSync(path.join(targetDir, 'node_modules', 'express'))) {
        throw new Error(
            `OracleScriptDownloader: ${chainId} npm install completed but `
            + 'node_modules/express is still missing.');
    }
    if (logger && typeof logger.info === 'function') {
        logger.info(`${ENM_LOG_PREFIX} ${chainId}: oracle deps installed (${ORACLE_NPM_DEPS.join(' ')})`);
    }
}

/**
 * @private — Walk a directory tree to find a file by basename.
 * Returns the first match's absolute path, or null. Mirrors
 * EnmBinaryDownloader._locateInTree.
 */
async function locateInTree(rootDir, basename) {
    const entries = await fsp.readdir(rootDir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(rootDir, e.name);
        if (e.isDirectory()) {
            const found = await locateInTree(full, basename);
            if (found) return found;
        } else if (e.isFile() && e.name === basename) {
            return full;
        }
    }
    return null;
}

/**
 * @private — Move every entry in srcDir into dstDir. Recursive
 * because the extracted tarball usually wraps its contents in a
 * single top-level dir (`elastos-esc-oracle-v0.2.7/`), and we want
 * the contents — not the wrapper — to land in dstDir.
 *
 * If srcDir contains a SINGLE top-level entry that's a directory,
 * unwrap one level. Otherwise copy entries as-is.
 */
async function moveExtractedContents(srcDir, dstDir) {
    const entries = await fsp.readdir(srcDir, { withFileTypes: true });
    let effectiveSrc = srcDir;
    if (entries.length === 1 && entries[0].isDirectory()) {
        effectiveSrc = path.join(srcDir, entries[0].name);
    }
    await fsp.mkdir(dstDir, { recursive: true, mode: 0o755 });
    const items = await fsp.readdir(effectiveSrc, { withFileTypes: true });
    for (const it of items) {
        const from = path.join(effectiveSrc, it.name);
        const to = path.join(dstDir, it.name);
        // rename within same filesystem; falls back to cp -R if EXDEV.
        try {
            await fsp.rename(from, to);
        } catch (err) {
            if (err && err.code === 'EXDEV') {
                await fsp.cp(from, to, { recursive: true, force: true });
                await fsp.rm(from, { recursive: true, force: true });
            } else {
                throw err;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Public download API
// ---------------------------------------------------------------------------

/**
 * Download one oracle bundle if not already present. Idempotent.
 *
 * Steps:
 *   1. If isInstalled(chainId), return { skipped: true, path }.
 *   2. Resolve latest version (falls back to source.fallbackVersion).
 *   3. Download .tgz to a per-chain staging dir.
 *   4. Extract the .tgz into staging.
 *   5. Locate the crosschain_*.js inside the extracted tree.
 *   6. Move the extracted directory's contents into
 *      `<scriptsDir>/<chainId>/`.
 *   7. Delete staging.
 *   8. Verify the script exists + is non-empty.
 *
 * @param {string} chainId
 * @param {object} [opts]
 * @param {(msg:string) => void} [opts.onProgress]
 * @param {object} [opts.logger]   passed through to version resolution
 * @returns {Promise<{
 *   chainId: string,
 *   path: string,
 *   version: string,
 *   bytesDownloaded: number,
 *   durationMs: number,
 *   skipped?: boolean,
 * }>}
 */
async function downloadOne(chainId, opts) {
    const o = opts || {};
    const onProgress = o.onProgress || (() => {});
    const logger = o.logger || console;
    const t0 = Date.now();

    const src = ORACLE_SOURCES[chainId];
    if (!src) {
        throw new Error(`OracleScriptDownloader: unknown oracle chainId "${chainId}"`);
    }

    if (isInstalled(chainId)) {
        onProgress(`already installed: ${chainId}`);
        return {
            chainId,
            path: scriptPathFor(chainId),
            version: null,
            bytesDownloaded: 0,
            durationMs: Date.now() - t0,
            skipped: true,
        };
    }

    // 2. Resolve version
    onProgress(`resolving latest version for ${chainId}...`);
    const version = await resolveLatestVersion(chainId, logger);
    onProgress(`${chainId}: using version ${version}`);

    // 3. Stage
    const slug = `elastos-${src.chainName}`;
    const filename = `${slug}-${version}.tgz`;
    const remotePath = `/${slug}/${slug}-${version}/${filename}`;
    const stagingRoot = path.join(scriptsDir(), '_staging', chainId);
    await fsp.rm(stagingRoot, { recursive: true, force: true });
    await fsp.mkdir(stagingRoot, { recursive: true, mode: 0o755 });
    const tarball = path.join(stagingRoot, filename);

    // 4. Download
    onProgress(`downloading ${filename}...`);
    const bytesDownloaded = await downloadFile(DOWNLOAD_HOST, remotePath, tarball, (got, total) => {
        // Coarse progress: only fire when we cross a 10% boundary so we
        // don't flood the SSE channel. Total may be 0 if the server
        // omits Content-Length; in that case just report bytes.
        if (total > 0) {
            const pct = Math.floor((got / total) * 10);
            if (downloadOne._lastPct !== pct) {
                downloadOne._lastPct = pct;
                onProgress(`${chainId}: downloaded ${Math.floor((got / total) * 100)}%`);
            }
        }
    });
    delete downloadOne._lastPct;

    // 5. Extract
    onProgress(`${chainId}: extracting ${filename}...`);
    const extractDir = path.join(stagingRoot, 'extracted');
    await fsp.mkdir(extractDir, { recursive: true, mode: 0o755 });
    await extractTar(tarball, extractDir);

    // 6. Locate the script inside the extracted tree
    const foundScript = await locateInTree(extractDir, src.scriptName);
    if (!foundScript) {
        throw new Error(
            `OracleScriptDownloader: ${src.scriptName} not found inside ${filename}. `
            + 'The upstream bundle layout may have changed.',
        );
    }

    // 7. Move extracted contents into the canonical per-oracle dir.
    // Wipe any prior contents at the destination first — a stale
    // node_modules from an interrupted install can shadow the new
    // version's deps and cause confusing module-not-found errors at
    // spawn time.
    const finalDir = scriptDirFor(chainId);
    await fsp.rm(finalDir, { recursive: true, force: true });
    onProgress(`${chainId}: installing to ${finalDir}...`);
    await moveExtractedContents(extractDir, finalDir);

    // 7b. node.sh PARITY (node.sh:4207) — the upstream tarball is source-only,
    // so install the oracle's runtime deps (web3 + express) in the script dir.
    // Without this the oracle spawns then crashes code=1 on
    // require('express'), and self-heal can't fix a missing-module crash.
    await installOracleDeps(finalDir, chainId, { onProgress, logger });

    // 8. Cleanup staging
    await fsp.rm(stagingRoot, { recursive: true, force: true });

    // 9. Verify the canonical script path is on disk + non-empty.
    const finalPath = scriptPathFor(chainId);
    let stat;
    try {
        stat = await fsp.stat(finalPath);
    } catch (err) {
        throw new Error(
            `OracleScriptDownloader: post-install verification failed — ${finalPath} `
            + `is not readable (${err.message}). The extraction may have placed the `
            + 'script under an unexpected subdirectory.',
        );
    }
    if (!stat.isFile() || stat.size === 0) {
        throw new Error(
            `OracleScriptDownloader: post-install verification failed — ${finalPath} `
            + 'is empty or not a regular file.',
        );
    }

    onProgress(`${chainId}: installed ${version} (${bytesDownloaded} bytes)`);

    return {
        chainId,
        path: finalPath,
        version,
        bytesDownloaded,
        durationMs: Date.now() - t0,
    };
}

/**
 * Download every oracle bundle (or the subset given via
 * opts.chainIds). Returns a map keyed by chainId. Throws on the
 * first failure — caller decides whether to retry the survivors.
 *
 * @param {object} [opts]
 * @param {(msg:string) => void} [opts.onProgress]
 * @param {string[]} [opts.chainIds]  subset to download (default all 3)
 * @param {object} [opts.logger]
 * @returns {Promise<Record<string, {
 *   chainId: string,
 *   path: string,
 *   version: string,
 *   bytesDownloaded: number,
 *   durationMs: number,
 *   skipped?: boolean,
 * }>>}
 */
async function downloadAll(opts) {
    const o = opts || {};
    const chainIds = Array.isArray(o.chainIds) && o.chainIds.length > 0
        ? o.chainIds : Object.keys(ORACLE_SOURCES);
    const results = {};
    for (const cid of chainIds) {
        results[cid] = await downloadOne(cid, {
            onProgress: o.onProgress,
            logger: o.logger,
        });
    }
    return results;
}

/**
 * Diagnose an installed oracle. Reports version (best-effort —
 * read from package.json if present), script size, and whether
 * the expected runtime dependencies (web3, express) are present
 * under node_modules.
 *
 * Returns `{ installed: false }` if the script isn't on disk.
 *
 * @param {string} chainId
 * @returns {Promise<{
 *   installed: boolean,
 *   path?: string,
 *   version?: string|null,
 *   scriptBytes?: number,
 *   nodeModulesPresent?: boolean,
 *   dependencies?: Record<string, boolean>,
 * }>}
 */
async function verify(chainId) {
    const src = ORACLE_SOURCES[chainId];
    if (!src) {
        throw new Error(`OracleScriptDownloader: unknown oracle chainId "${chainId}"`);
    }
    if (!isInstalled(chainId)) {
        return { installed: false };
    }
    const dir = scriptDirFor(chainId);
    const scriptAbs = scriptPathFor(chainId);

    // Script size
    const st = await fsp.stat(scriptAbs);

    // Try to read package.json for version + name (best-effort).
    let version = null;
    try {
        const pkgRaw = await fsp.readFile(path.join(dir, 'package.json'), 'utf8');
        const pkg = JSON.parse(pkgRaw);
        if (pkg && typeof pkg.version === 'string' && pkg.version.length > 0) {
            version = pkg.version.startsWith('v') ? pkg.version : `v${pkg.version}`;
        }
    } catch (_) { /* package.json optional */ }

    // node_modules presence + key deps that node.sh:4295 pins.
    const nmDir = path.join(dir, 'node_modules');
    let nodeModulesPresent = false;
    try {
        const nmStat = await fsp.stat(nmDir);
        nodeModulesPresent = nmStat.isDirectory();
    } catch (_) { /* missing — leave false */ }

    const dependencies = { web3: false, express: false };
    if (nodeModulesPresent) {
        for (const dep of Object.keys(dependencies)) {
            try {
                const dStat = await fsp.stat(path.join(nmDir, dep));
                dependencies[dep] = dStat.isDirectory();
            } catch (_) { /* missing — leave false */ }
        }
    }

    return {
        installed: true,
        path: scriptAbs,
        version,
        scriptBytes: st.size,
        nodeModulesPresent,
        dependencies,
    };
}

module.exports = {
    ORACLE_SOURCES,
    scriptsDir,
    scriptDirFor,
    scriptPathFor,
    isInstalled,
    downloadOne,
    downloadAll,
    verify,
    DOWNLOAD_TIMEOUT_MS,
    // Internals exposed for tests + diagnostic tooling. Not part of
    // the stable API — names may change without a deprecation cycle.
    _internals: Object.freeze({
        DOWNLOAD_HOST,
        resolveLatestVersion,
        scanVersions,
        semverCompare,
    }),
};
