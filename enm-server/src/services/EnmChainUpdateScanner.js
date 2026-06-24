/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmChainUpdateScanner — per-chain binary update detection for the
 * multi-chain overview's "Update available" badge / Update button.
 *
 * WHY a second scanner (EnmUpdateScanner already exists): that one is
 * mainchain-only and polls GitHub's Elastos.ELA releases — which on a
 * locked-down VPS is often unreachable (egress to api.github.com blocked),
 * so it silently returns nulls. node.sh — the authoritative installer —
 * pulls EVERY chain (ela / esc / eid / pg) from the Elastos download mirror
 * at https://download.elastos.io/elastos-<name>/ and finds the newest build
 * by listing that directory (get_elastos_ver_latest: curl "…/?F=1" | grep
 * [DIR] | strip to the version suffix | sort -Vr | head -1). This scanner
 * mirrors that exactly, so it (a) works wherever node.sh's own update works,
 * and (b) covers all four chains uniformly. The installed version comes from
 * ChainState.snapshotVerified() — the same `<binary> --version` value
 * GET /chains/:id reports — and the formats line up directly (mirror dir
 * "elastos-esc-v0.2.7.1" vs installed "v0.2.7.1").
 *
 * Cheap-snapshot invariant: the overview tick must not spawn or block. So
 * this scanner caches per chain and refreshes on its own 6h cadence (kicked
 * fire-and-forget by the tick via ensureFresh()); the tick only ever reads
 * the cache synchronously via getCached(). Wallet-identity-only invariant:
 * outbound HTTP poll + version compare only; nothing is signed.
 */

'use strict';

const https = require('node:https');
const ConfigStore = require('./ConfigStore');
const ChainState = require('./ChainState');

// chainId → Elastos download-mirror product name. Only chains published on
// the mirror as their own versioned product are scannable here; oracles ship
// inside the EVM bundles and the arbiter isn't independently versioned on the
// mirror, so they're intentionally absent (getCached → null → no badge).
const DOWNLOAD_NAME = { mainchain: 'ela', esc: 'esc', eid: 'eid', pg: 'pg' };

const DOWNLOAD_HOST = 'download.elastos.io';
const TTL_MS = 6 * 60 * 60 * 1000;     // 6h between refresh attempts
const REQUEST_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 512 * 1024;     // Apache listings are tiny; cap defensively

function _readPackageVersion() {
    try {
        const pkg = require('../../package.json');
        if (pkg && typeof pkg.version === 'string') { return pkg.version; }
    } catch (_) { /* fall through */ }
    return '0.0.0';
}
const USER_AGENT = 'elastos-node-manager/' + _readPackageVersion();

/**
 * Compare two Elastos version strings (vX.Y.Z, optionally a 4th .W segment —
 * e.g. v0.2.7.1). Strips a leading "v", pads missing segments with 0.
 * @returns {number} -1 if a<b, 0 if equal, 1 if a>b
 */
function compareVersion(a, b) {
    const pa = String(a).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i += 1) {
        const x = pa[i] || 0;
        const y = pb[i] || 0;
        if (x !== y) { return x < y ? -1 : 1; }
    }
    return 0;
}

/**
 * Parse an Apache "?F=1" directory listing for the newest
 * elastos-<name>-vX.Y.Z entry. Mirrors node.sh get_elastos_ver_latest:
 * extract the version suffix off each DIR href, pick the highest.
 * @returns {string|null} e.g. 'v0.2.7.1', or null when nothing matched
 */
function parseLatest(html, name) {
    const safeName = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('href="elastos-' + safeName + '-([^"/]+)/?"', 'gi');
    let m;
    let best = null;
    while ((m = re.exec(html)) !== null) {
        const ver = m[1];
        // Strict: optional "v" then a dotted-numeric version only (X.Y[.Z[.W]]).
        // The mirror also carries commit-hash builds (e.g.
        // "elastos-ela-9dc17ff") and suffixed tags ("v0.9.8-hotfix"); a loose
        // /^v?\d/ accepted "9dc17ff", and parseInt("9dc17ff") === 9 made it
        // outrank v0.9.9.5 → a bogus "update available". Require clean dotted
        // numerals so only real release dirs are considered.
        if (!/^v?\d+(\.\d+)+$/.test(ver)) { continue; }
        if (best === null || compareVersion(ver, best) > 0) { best = ver; }
    }
    return best;
}

/** @returns {Promise<string>} raw HTML of the mirror directory listing */
function fetchListing(name) {
    return new Promise((resolve, reject) => {
        const req = https.get({
            host: DOWNLOAD_HOST,
            path: '/elastos-' + name + '/?F=1',
            headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
            timeout: REQUEST_TIMEOUT_MS,
        }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error('HTTP ' + res.statusCode));
                return;
            }
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                body += chunk;
                if (body.length > MAX_BODY_BYTES) { req.destroy(new Error('listing too large')); }
            });
            res.on('end', () => resolve(body));
        });
        req.on('timeout', () => { req.destroy(new Error('timeout')); });
        req.on('error', reject);
    });
}

class EnmChainUpdateScanner {
    constructor(opts) {
        this.log = (opts && opts.logger) || console;
        this._cache = new Map();   // chainId → { installed, latest, updateAvailable, checkedAt }
        this._refreshing = false;
        this._lastAttemptAt = 0;
    }

    /**
     * Synchronous, non-blocking cache read for the overview tick.
     * @returns {{installed:string, latest:string, updateAvailable:boolean, checkedAt:number}|null}
     */
    getCached(chainId) {
        return this._cache.get(chainId) || null;
    }

    /**
     * v0.5.249 — drop a chain's cached result and force the NEXT ensureFresh()
     * to re-poll immediately, instead of waiting out the remaining 6h TTL.
     *
     * Call this the moment a binary install/update changes the installed
     * version. Without it, the cache keeps the pre-update entry — whose
     * `installed` is the OLD version — so `updateAvailable` stays `true` and
     * the overview shows "Update available" even though the operator just
     * moved to the latest. (The reported "sometimes shows an update while I'm
     * already on the latest": the window between updating and the next 6h
     * refresh.) Resetting `_lastAttemptAt` is what actually un-gates the
     * re-poll — deleting the entry alone isn't enough when other chains keep
     * `_cache.size > 0`.
     *
     * @param {string} [chainId] — specific chain, or all chains when omitted.
     */
    invalidate(chainId) {
        if (chainId) { this._cache.delete(chainId); }
        else { this._cache.clear(); }
        this._lastAttemptAt = 0;
    }

    /**
     * Fire-and-forget. Kicks a full refresh when the cache is stale and no
     * refresh is already in flight; otherwise an instant no-op. Safe to call
     * every tick — it self-throttles to one attempt per TTL_MS.
     */
    ensureFresh() {
        if (this._refreshing) { return; }
        if (this._cache.size > 0 && (Date.now() - this._lastAttemptAt) < TTL_MS) { return; }
        this._lastAttemptAt = Date.now();
        this._refreshing = true;
        Promise.resolve()
            .then(() => this.refreshAll())
            .catch((err) => {
                if (this.log && typeof this.log.debug === 'function') {
                    this.log.debug('EnmChainUpdateScanner.refreshAll failed: ' + (err && err.message));
                }
            })
            .then(() => { this._refreshing = false; });
    }

    /** Refresh every scannable, enabled chain. Best-effort per chain. */
    async refreshAll() {
        let cfg;
        try { cfg = await ConfigStore.load(); } catch (_) { return; }
        const chains = (cfg && cfg.chains) || {};
        for (const chainId of Object.keys(DOWNLOAD_NAME)) {
            const c = chains[chainId];
            if (!c || !c.enabled) { continue; }
            let installed = null;
            try {
                const snap = await ChainState.snapshotVerified(chainId);
                installed = snap && snap.binaryVersion ? snap.binaryVersion : null;
            } catch (_) { /* leave installed null */ }
            if (!installed) { continue; }
            let latest = null;
            try {
                latest = parseLatest(await fetchListing(DOWNLOAD_NAME[chainId]), DOWNLOAD_NAME[chainId]);
            } catch (_) { /* leave latest null — keep last good cache entry */ }
            if (!latest) { continue; }
            this._cache.set(chainId, {
                installed,
                latest,
                updateAvailable: compareVersion(latest, installed) > 0,
                checkedAt: Date.now(),
            });
        }
    }
}

let _instance = null;
function getInstance(opts) {
    if (!_instance) { _instance = new EnmChainUpdateScanner(opts || {}); }
    return _instance;
}

module.exports = {
    getInstance,
    compareVersion,
    parseLatest,
    DOWNLOAD_NAME,
    EnmChainUpdateScanner,
};
