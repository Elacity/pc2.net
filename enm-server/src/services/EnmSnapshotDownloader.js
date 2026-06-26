/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmSnapshotDownloader — Wave v0.4.7 — fetch official Elastos chain
 * data snapshots so a freshly-installed Council node can skip the
 * multi-day initial sync and come online inside an hour.
 *
 * Why this exists: a virgin mainchain (ELA) node needs to replay
 * ~3M blocks from genesis; ESC/EID/PG behave the same way at their
 * own scale. Operators staring at 5+ days of "Card C: syncing 12%"
 * abandon the install. node.sh has shipped a snapshot-download path
 * since 2020 — we mirror it in-process so the Council install wizard
 * (Card D) can run before the binaries even start.
 *
 * UPSTREAM SOURCE
 *
 * Elastos Foundation publishes nightly snapshots at
 * https://node-data.elastos.io/<chain>/<chain>-data-latest.tgz —
 * verified 2026-05-19 via HEAD probe against each URL. Each tarball
 * extracts into the chain's data directory (the layout matches what
 * the binary writes itself when syncing from scratch).
 *
 * Snapshots are LARGE (the ELA mainchain tarball is ~10 GB compressed
 * today; v0.5.199 makes mainchain the only supported chain — see
 * SNAPSHOT_SOURCES below). We stream them to disk and unpack on-the-fly
 * with system `tar -xzf` — the same shape EnmBinaryDownloader uses to
 * avoid pulling a new npm dependency.
 *
 * INVARIANT: ECO snapshot URLs exist at /eco/ but are forbidden per
 * the H3 ENM scope rule (ECO is OUT OF SCOPE forever). Do NOT add an
 * `eco` entry to SNAPSHOT_SOURCES — a future contributor seeing the
 * pattern might assume completeness; this comment is the load-bearing
 * gate.
 *
 * NO CHECKSUM verification today — same posture as
 * OracleScriptDownloader / EnmBinaryDownloader: TLS + a non-empty
 * extracted directory smoke test. TODO: layer Elastos Foundation
 * GPG signatures once the upstream publishes them (tracked under
 * the v0.4.x M5.1 follow-up).
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const { spawn } = require('node:child_process');

const { enmDataDir } = require('./DataDir');

// Catalog of supported chains. Each entry holds the canonical
// upstream tarball URL plus a rough operator-facing size estimate
// (used by the Card D pre-flight to warn about disk free space
// before kicking off the download).
//
// v0.5.199 — MAINCHAIN ONLY.
//
// EVM chains (esc/eid/pg) were removed after the cycle-13
// lockup (2026-05-23). The upstream EVM snapshot tarballs at
// node-data.elastos.io/<esc|eid|pg>/...-data-latest.tgz embed the
// snapshot creator's data/<chain>/nodekey — the 64-byte secp256k1
// private key that derives the geth node ID on the EVM peer mesh.
// Every operator who applied an EVM snapshot booted with a
// DUPLICATE node ID (originally that of 18.190.98.27); the EVM
// network rejects the duplicate → 0 peers → F1/F2 auto-heal
// cascade → eventual panic/exit (eid: nil-pointer in
// eth/downloader.synchronise). Diagnosed on a test node 2026-05-23 and
// recorded in ENM_QA_CATALOG.md under "CYCLE-13 RE-FINALIZATION".
//
// The ELA mainchain snapshot does NOT contain a node-identity
// file (mainchain uses Bitcoin-style P2P with no persistent
// nodekey), so it remains safe and high-value: a virgin Council
// install replays ~3 M ELA blocks from genesis in 1-3 days; the
// snapshot collapses that to ~15-30 min.
//
// DO NOT re-add esc/eid/pg entries here without (a) confirming
// the upstream no longer embeds nodekeys, AND (b) keeping the
// stripIdentityFiles() post-extract scrub below. ECO remains out
// of scope (H3 invariant).
const SNAPSHOT_SOURCES = Object.freeze({
    mainchain: {
        url: 'https://node-data.elastos.io/ela/ela-data-latest.tgz',
        sizeEstimateGb: 10,
    },
});

// 30 minutes per-request. Snapshots are big; 60s (the Oracle script
// timeout) would always trip. The TCP socket-level timeout fires on
// inactivity, so a healthy 200MB/s pipe still finishes inside this
// window for the mainchain (~10 GB) tarball with wide headroom.
const DOWNLOAD_TIMEOUT_MS = 1_800_000;

// Progress callback throttle. Emitting on every TCP chunk would
// flood the SSE bus + log file; 500ms matches what the Card D UI
// renders.
const PROGRESS_THROTTLE_MS = 500;

// Max redirect hops. download.elastos.io / node-data.elastos.io
// historically redirect once (HTTP→HTTPS) but we follow up to 5
// in case the CDN inserts more in front of us.
const MAX_REDIRECTS = 5;

// P0-11/12/13 (v0.5.181):
// Completion sentinel — written into the chain data dir ONLY after a verified
// extract. isSnapshotApplied() gates on this, NOT "dir is non-empty", so an
// interrupted/partial extract is never mistaken for a finished snapshot (which
// would boot the chain on corrupt data → silent genesis resync / crash-loop).
const SNAPSHOT_COMPLETE_SENTINEL = '.enm-snapshot-complete';
// Disk-footprint multiplier over the COMPRESSED size estimate: during extract the
// tarball (compressed) and the extracted tree coexist, so peak ≈ 3-4×.
const EXTRACT_FOOTPRINT_FACTOR = 4;
const BYTES_PER_GB = 1024 * 1024 * 1024;
// Bounded retries for a transient download/extract failure (network drop, 5xx).
const MAX_DOWNLOAD_ATTEMPTS = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolve the staging directory where in-flight .tgz tarballs land
 * before extraction. Sibling of _oracle-scripts/ for consistency.
 *
 * @returns {string}
 */
function snapshotsDir() {
    return path.join(enmDataDir(), '_snapshots');
}

/** Free space (GB) on the filesystem holding `dir`. null if undeterminable. */
async function freeGb(dir) {
    try {
        const st = await fsp.statfs(dir);
        return (Number(st.bavail) * Number(st.bsize)) / BYTES_PER_GB;
    } catch (_) {
        return null;
    }
}

/**
 * P0-13 — snapshot redirects must stay on the publisher's domain. Following a
 * 30x Location to an arbitrary host is a supply-chain hijack vector (the bytes
 * are run as root after extract). node-data.elastos.io's only known redirect is
 * HTTP→HTTPS on the same host, which this still allows.
 */
function isAllowedSnapshotHost(urlStr) {
    try {
        const h = new URL(urlStr).hostname.toLowerCase();
        return h === 'elastos.io' || h.endsWith('.elastos.io');
    } catch (_) {
        return false;
    }
}

/** Heuristic: is a download/extract error worth retrying (transient network)? */
function looksTransient(err) {
    const m = (err && err.message ? err.message : String(err)).toLowerCase();
    return /timeout|econnreset|econnrefused|socket hang up|enetunreach|etimedout|network|http 5\d\d/.test(m);
}

/**
 * Heuristic "is this chain already populated?" check. Used by
 * downloadAndExtract to short-circuit when the operator has either
 * (a) already run this flow, or (b) restored the data dir manually.
 *
 * True iff targetDataDir exists, is a directory, and has at least
 * one child entry. Empty dirs (just-mkdir'd by some prior step) are
 * treated as NOT applied so the snapshot still installs into them.
 *
 * Synchronous on purpose — this fires inside the install wizard
 * critical path and the syscalls are O(1) on a populated dir.
 *
 * @param {string} targetDataDir
 * @returns {boolean}
 */
function isSnapshotApplied(targetDataDir) {
    // P0-11 (v0.5.181) — gate on the completion sentinel, NOT "dir is non-empty".
    // An interrupted extract (disk full, SIGKILL, network drop) leaves a partial
    // datadir; the old non-empty check treated that as "applied" → the chain
    // booted on corrupt/incomplete data → silent genesis resync or crash-loop with
    // no clear cause. The sentinel is written only after a verified-complete extract.
    try {
        return fs.existsSync(path.join(targetDataDir, SNAPSHOT_COMPLETE_SENTINEL));
    } catch (_) {
        return false;
    }
}

/**
 * Download one chain snapshot and unpack it into targetDataDir.
 * Idempotent: returns `{ skipped: true }` if the target already has
 * data so re-running the install wizard never clobbers a working
 * node.
 *
 * Progress callback shape:
 *   onProgress({
 *     chainId,
 *     phase:           'download' | 'extract',
 *     bytesDownloaded: number,
 *     totalBytes:      number,    // 0 if Content-Length absent
 *     percent:         number,    // 0-100, 0 during extract phase
 *   })
 *
 * @param {string} chainId   key of SNAPSHOT_SOURCES
 * @param {string} targetDataDir absolute path to e.g. /var/lib/pc2/data/chains/mainchain/data/
 * @param {object} [opts]
 * @param {(p:object) => void} [opts.onProgress]
 * @returns {Promise<{chainId:string, targetDataDir:string, bytesDownloaded:number, durationMs:number} | {skipped:true, reason:string}>}
 */
async function downloadAndExtract(chainId, targetDataDir, opts) {
    const o = opts || {};
    const onProgress = typeof o.onProgress === 'function' ? o.onProgress : () => {};

    if (isSnapshotApplied(targetDataDir)) {
        return { skipped: true, reason: 'already applied' };
    }

    // v0.5.199 — explicit allow-list. If a caller somewhere ever passes
    // 'esc', 'eid', or 'pg' (e.g. an older setup.js path that hasn't
    // been updated, or a future route that re-iterates over all 4
    // chains), fail FAST and loud rather than silently no-op or extract
    // a contaminated tarball. SNAPSHOT_SOURCES is the structural lock;
    // this is the behavioral one — defense in depth.
    const ALLOWED = new Set(['mainchain']);
    if (!ALLOWED.has(chainId)) {
        throw new Error(
            `EnmSnapshotDownloader: chain "${chainId}" is not allowed to use `
            + 'snapshots (v0.5.199 policy — EVM chains must cold-sync from peers; '
            + 'see SNAPSHOT_SOURCES comment for the nodekey-contamination rationale).',
        );
    }

    const src = SNAPSHOT_SOURCES[chainId];
    if (!src) {
        throw new Error(`EnmSnapshotDownloader: unknown chainId "${chainId}"`);
    }

    await fsp.mkdir(snapshotsDir(), { recursive: true, mode: 0o755 });
    await fsp.mkdir(targetDataDir, { recursive: true, mode: 0o755 });

    // P0-12 — disk preflight. A multi-GB extract that fills the disk mid-way
    // corrupts the datadir (and can wedge the host). Refuse up front when free
    // space is below the estimated peak footprint (compressed + extracted).
    const requiredGb = (src.sizeEstimateGb || 0) * EXTRACT_FOOTPRINT_FACTOR;
    const avail = await freeGb(snapshotsDir());
    if (avail != null && avail < requiredGb) {
        throw new Error(
            `not enough disk for the ${chainId} snapshot: need ~${requiredGb} GB free `
            + `(≈${src.sizeEstimateGb} GB compressed × ${EXTRACT_FOOTPRINT_FACTOR}), have ${Math.floor(avail)} GB`,
        );
    }

    const tarballPath = path.join(snapshotsDir(), `${chainId}-data-latest.tgz`);
    const sentinelPath = path.join(targetDataDir, SNAPSHOT_COMPLETE_SENTINEL);
    const startedAt = Date.now();
    let bytesDownloaded = 0;
    let lastErr = null;

    // P0-12 — bounded retry. A transient network drop used to fail the whole step
    // (the snapshot path had NO retry). Now we re-download (streamDownload cleans
    // its own .partial) up to MAX_DOWNLOAD_ATTEMPTS for transient errors.
    for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt += 1) {
        try {
            // --- Phase 1: stream .tgz to disk -------------------------------
            bytesDownloaded = await streamDownload(src.url, tarballPath, (got, total) => {
                const percent = total > 0 ? Math.floor((got / total) * 100) : 0;
                onProgress({ chainId, phase: 'download', bytesDownloaded: got, totalBytes: total, percent });
            });

            // --- Phase 2: extract via system tar ----------------------------
            onProgress({ chainId, phase: 'extract', bytesDownloaded, totalBytes: bytesDownloaded, percent: 0 });
            await extractTarball(tarballPath, targetDataDir);

            // --- Phase 3: verify extraction non-empty -----------------------
            const populated = fs.readdirSync(targetDataDir);
            if (populated.length === 0) {
                throw new Error(`extraction left "${targetDataDir}" empty — upstream tarball may be malformed`);
            }

            // v0.5.199 defense-in-depth — strip any embedded node-identity
            // files from the extracted snapshot. The current mainchain
            // tarball doesn't ship one (mainchain uses Bitcoin-style P2P),
            // but if the upstream tarball shape ever changes — or a future
            // contributor re-adds an EVM entry to SNAPSHOT_SOURCES without
            // remembering the cycle-13 lesson — this scrub keeps us from
            // re-introducing duplicate-identity peering failures. Loud-logs
            // any hits so we notice immediately if upstream changes.
            try {
                const stripped = await stripIdentityFiles(targetDataDir);
                if (stripped.length > 0) {
                    // eslint-disable-next-line no-console
                    console.warn(
                        `[ENM] EnmSnapshotDownloader[${chainId}]: SCRUBBED `
                        + `${stripped.length} identity file(s) from snapshot — `
                        + `${stripped.join(', ')}. Upstream tarball shape may have `
                        + 'changed; review before next release.',
                    );
                }
            } catch (e) {
                // Best-effort — never fail the extract over the scrub.
                // eslint-disable-next-line no-console
                console.warn(
                    `[ENM] EnmSnapshotDownloader[${chainId}]: identity scrub error: ${e.message}`,
                );
            }

            // P0-11 — mark complete ONLY now, after a verified non-empty extract.
            // isSnapshotApplied() keys off this sentinel, so a partial/interrupted
            // extract is never mistaken for a finished snapshot.
            await fsp.writeFile(
                sentinelPath,
                `${new Date().toISOString()} ${chainId} bytes=${bytesDownloaded}\n`,
                { mode: 0o644 },
            );
            // Drop the staging tarball — it has done its job.
            await fsp.rm(tarballPath, { force: true });

            return { chainId, targetDataDir, bytesDownloaded, durationMs: Date.now() - startedAt };
        } catch (err) {
            lastErr = err;
            // Clean the partial tarball before a retry or before giving up. We do
            // NOT wipe targetDataDir; the missing sentinel already prevents a
            // partial extract from being treated as applied, and a retry's tar
            // overwrites it.
            await fsp.rm(tarballPath, { force: true }).catch(() => {});
            await fsp.rm(`${tarballPath}.partial`, { force: true }).catch(() => {});
            if (attempt < MAX_DOWNLOAD_ATTEMPTS && looksTransient(err)) {
                await sleep(2000 * attempt);
                continue;
            }
            break;
        }
    }

    const wrapped = new Error(
        `EnmSnapshotDownloader[${chainId}]: ${lastErr && lastErr.message ? lastErr.message : String(lastErr)}`,
    );
    if (lastErr && lastErr.stack) wrapped.stack = lastErr.stack;
    throw wrapped;
}

/**
 * Download every snapshot in `chainIds` concurrently. Uses
 * Promise.allSettled so one failed chain doesn't kill the others —
 * Card D surfaces the per-chain status separately.
 *
 * @param {Record<string,string>} targetDirsByChain map chainId → absolute dir
 * @param {object} [opts]
 * @param {string[]} [opts.chainIds] subset (default: all of SNAPSHOT_SOURCES)
 * @param {(p:object) => void} [opts.onProgress]
 * @returns {Promise<{results: Record<string, object>, durationMs:number}>}
 */
async function downloadAll(targetDirsByChain, opts) {
    const o = opts || {};
    const chainIds = Array.isArray(o.chainIds) && o.chainIds.length > 0
        ? o.chainIds
        : Object.keys(SNAPSHOT_SOURCES);
    const onProgress = typeof o.onProgress === 'function' ? o.onProgress : () => {};

    const startedAt = Date.now();

    // P0-12 — summed disk preflight. downloadAll runs the chains in PARALLEL, so
    // their extracts share one filesystem; each individually "fitting" doesn't mean
    // they collectively fit. Refuse up front if free space is below the sum of the
    // selected chains' peak footprints (a mid-extract disk-full corrupts datadirs).
    const totalRequiredGb = chainIds.reduce((sum, cid) => {
        const s = SNAPSHOT_SOURCES[cid];
        return sum + ((s && s.sizeEstimateGb ? s.sizeEstimateGb : 0) * EXTRACT_FOOTPRINT_FACTOR);
    }, 0);
    const avail = await freeGb(snapshotsDir());
    if (avail != null && avail < totalRequiredGb) {
        throw new Error(
            `EnmSnapshotDownloader.downloadAll: not enough disk for ${chainIds.length} snapshot(s): `
            + `need ~${totalRequiredGb} GB free, have ${Math.floor(avail)} GB. `
            + 'Free space or install fewer chains at once.',
        );
    }

    const tasks = chainIds.map((cid) => {
        const target = targetDirsByChain && targetDirsByChain[cid];
        if (!target) {
            return Promise.reject(new Error(
                `EnmSnapshotDownloader.downloadAll: missing target dir for "${cid}"`,
            ));
        }
        return downloadAndExtract(cid, target, { onProgress });
    });

    const settled = await Promise.allSettled(tasks);
    const results = {};
    settled.forEach((s, i) => {
        const cid = chainIds[i];
        if (s.status === 'fulfilled') {
            results[cid] = s.value;
        } else {
            const e = s.reason;
            results[cid] = {
                error: e && e.message ? e.message : String(e),
            };
        }
    });

    return { results, durationMs: Date.now() - startedAt };
}

/**
 * @private
 * Stream-download `url` to `${destPath}.partial`, rename to
 * destPath on a clean finish. Follows HTTPS redirects up to
 * MAX_REDIRECTS hops. Reports byte progress via throttled
 * onByteProgress(got, total). Resolves with the final byte count.
 *
 * Atomic-ish: a torn-down download leaves only the .partial sibling;
 * the next attempt cleans it up before re-streaming.
 *
 * @param {string} url
 * @param {string} destPath
 * @param {(got:number, total:number) => void} onByteProgress
 * @returns {Promise<number>}
 */
function streamDownload(url, destPath, onByteProgress) {
    const tmp = `${destPath}.partial`;
    return new Promise((resolve, reject) => {
        fs.rm(tmp, { force: true }, () => {
            let lastEmittedAt = 0;

            function attempt(currentUrl, hops) {
                if (hops > MAX_REDIRECTS) {
                    return reject(new Error(`Too many redirects (>${MAX_REDIRECTS}) starting at ${url}`));
                }
                const req = https.get(currentUrl, {
                    headers: { 'User-Agent': 'enm-server/0.4.7-snapshot' },
                    timeout: 60_000,
                }, (res) => {
                    const status = res.statusCode || 0;
                    if (status >= 300 && status < 400 && res.headers.location) {
                        res.resume();
                        let next;
                        try {
                            next = new URL(res.headers.location, currentUrl).toString();
                        } catch (e) {
                            return reject(new Error(`Bad redirect Location: ${res.headers.location}`));
                        }
                        // P0-13 — only follow redirects that stay on the publisher's
                        // domain. Following a 30x to an arbitrary host is a supply-chain
                        // hijack vector (the bytes are extracted + run as root).
                        if (!isAllowedSnapshotHost(next)) {
                            return reject(new Error(
                                `refusing snapshot redirect to disallowed host: ${(() => {
                                    try { return new URL(next).host; } catch (_) { return next; }
                                })()}`,
                            ));
                        }
                        return attempt(next, hops + 1);
                    }
                    if (status < 200 || status >= 300) {
                        res.resume();
                        return reject(new Error(`HTTP ${status} from ${currentUrl}`));
                    }

                    const total = parseInt(res.headers['content-length'] || '0', 10);
                    let got = 0;
                    const fileStream = fs.createWriteStream(tmp, { mode: 0o644 });

                    res.on('data', (chunk) => {
                        got += chunk.length;
                        const now = Date.now();
                        if (now - lastEmittedAt >= PROGRESS_THROTTLE_MS) {
                            lastEmittedAt = now;
                            try { onByteProgress(got, total); } catch (_) { /* swallow */ }
                        }
                    });

                    res.pipe(fileStream);

                    fileStream.on('finish', () => {
                        fileStream.close(() => {
                            // Emit a final tick at 100% so SSE consumers
                            // don't get stuck on the last throttled value.
                            try { onByteProgress(got, total || got); } catch (_) {}
                            // P0-13 — truncation guard. A stream that finishes "cleanly"
                            // but delivered fewer bytes than Content-Length (proxy/CDN
                            // cutoff, short read) would otherwise be renamed to the final
                            // path and extracted as if complete → corrupt datadir. Reject
                            // so the bounded retry re-downloads.
                            if (total > 0 && got !== total) {
                                fs.rm(tmp, { force: true }, () => reject(new Error(
                                    `truncated download: got ${got} of ${total} bytes`,
                                )));
                                return;
                            }
                            fs.rename(tmp, destPath, (renameErr) => {
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
                req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
                    req.destroy(new Error(`Download timeout after ${DOWNLOAD_TIMEOUT_MS}ms`));
                });
            }

            attempt(url, 0);
        });
    });
}

/**
 * @private
 * Extract a .tgz tarball into targetDir using system `tar -xzf`.
 * Matches EnmBinaryDownloader._extractTar — we deliberately do NOT
 * add a JS tar package to keep enm-server's dependency surface
 * minimal; every Ubuntu/Debian we support ships GNU tar in the
 * default OS image.
 *
 * `--strip-components` is intentionally NOT used. The upstream
 * tarballs are packed at the top level with the chain data files
 * directly inside (no wrapper dir), so a plain `-xzf -C` lands
 * everything in targetDir as expected.
 *
 * @param {string} tarballPath
 * @param {string} targetDir
 * @returns {Promise<void>}
 */
function extractTarball(tarballPath, targetDir) {
    return new Promise((resolve, reject) => {
        // 0.5.146 audit Session 146 — --no-same-owner is required when
        // enm-server runs as root (the default in pc2-node's systemd
        // unit). tar's default behavior under root is to preserve the
        // ARCHIVED uid/gid from the tarball, not the current process's
        // identity. The upstream snapshots at node-data.elastos.io are
        // packaged with uid 1001 (the publisher's user). Without
        // --no-same-owner the extracted block dirs end up owned by
        // uid 1001, leaving ela (running as root) with read-only access
        // and unable to write new blocks into the snapshot dir as it
        // syncs forward. Verified on the test server: post-extract
        // chown -R root:root was needed to recover; --no-same-owner
        // pre-empts that for fresh installs.
        const child = spawn(
            'tar',
            ['-xzf', tarballPath, '-C', targetDir, '--no-same-owner'],
            { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let stderr = '';
        child.stderr.on('data', (c) => { stderr += c.toString(); });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) return resolve();
            reject(new Error(`tar exited with code ${code}: ${stderr.trim()}`));
        });
    });
}

/**
 * v0.5.199 — walk `dir` recursively and delete any file named `nodekey`.
 * geth's secp256k1 node-identity key lives under `data/<chain>/nodekey`
 * (or `data/geth/nodekey` depending on layout); an embedded one in a
 * snapshot tarball is the cycle-13 contamination signature. Returns the
 * relative paths removed so the caller can loud-log them.
 *
 * Best-effort: ignores permission errors / vanished dirs (callers wrap
 * in try/catch and never fail the extract over this).
 *
 * @param {string} dir Absolute path to walk
 * @returns {Promise<string[]>} Relative paths of removed files
 */
async function stripIdentityFiles(dir) {
    const removed = [];
    async function walk(p, relBase) {
        let entries;
        try {
            entries = await fsp.readdir(p, { withFileTypes: true });
        } catch (_) {
            return;
        }
        for (const ent of entries) {
            const full = path.join(p, ent.name);
            const rel = relBase ? path.join(relBase, ent.name) : ent.name;
            if (ent.isFile() && ent.name === 'nodekey') {
                try {
                    await fsp.rm(full, { force: true });
                    removed.push(rel);
                } catch (_) { /* best-effort */ }
            } else if (ent.isDirectory()) {
                await walk(full, rel);
            }
        }
    }
    await walk(dir, '');
    return removed;
}

module.exports = {
    SNAPSHOT_SOURCES,
    DOWNLOAD_TIMEOUT_MS,
    snapshotsDir,
    isSnapshotApplied,
    downloadAndExtract,
    downloadAll,
    stripIdentityFiles,
};
