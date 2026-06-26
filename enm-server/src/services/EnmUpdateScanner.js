/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmUpdateScanner — detects when a newer ela mainchain release is
 * available upstream. Reads:
 *
 *   - The locally-installed binary version (chainConfig.binaryVersion,
 *     which mirrors `ela --version` per EnmBinaryLocator.smokeTest).
 *   - GitHub's tagged releases at api.github.com/repos/elastos/Elastos.ELA.
 *
 * Compares and exposes a small JSON envelope the Tools tab consumes.
 *
 * Lifecycle: lazy singleton — first GET /api/enm/updates/available kicks
 * off the scan, cached for 6h jittered. Operator can also force a refresh
 * via ?refresh=1 (rate-limited at the route).
 *
 * Failure modes:
 *   - GitHub down / 5xx → cached value stays; status: 'stale'
 *   - 60-req/h rate limit → ETag cache short-circuits to 304; no
 *     extra request budget burnt
 *   - Pre-release tagged → ignored (we only track stable channel today)
 *   - Network partition → status: 'unknown'; banner stays absent
 *
 * Wallet-identity-only invariant: no signing involved. Scanner is purely
 * an outbound HTTP poll + version comparison.
 */

'use strict';

const https = require('node:https');

// 6h jittered poll. The first scan fires on first request, not at boot,
// so we don't fight pc2-node startup (which already burns ~30s on
// AppProcessManager hydration). Jitter avoids 100-host stampedes when
// a CI tag is published — important once ENM has more than a single
// test-server install.
const POLL_PERIOD_MS    = 6 * 60 * 60 * 1000;
const POLL_JITTER_MS    = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

// GitHub Releases API — anonymous (no token). Anonymous limit is 60
// requests/hour per source IP, well above our 1/6h budget. ETag cache
// makes most polls return 304 without consuming any budget at all.
const GITHUB_REPO = 'elastos/Elastos.ELA';
const GITHUB_API_URL = 'https://api.github.com/repos/' + GITHUB_REPO + '/releases/latest';

// 0.2.0-alpha.9 — fallback path: when GitHub is unreachable from
// pc2-server (e.g. operator's host blocks outbound HTTPS to
// api.github.com), we still want the Status pane's Update card to
// show *something useful*. We read the build-time `knownGoodElaVersion`
// from enm-server/package.json and compare against that as a baked-in
// "last known stable" pointer. It's stale by design — the CI bundle
// only refreshes it on each ENM release — but a stale pointer beats
// nothing for offline operators.
function _readKnownGoodElaVersion() {
    try {
        // path resolved relative to this file (services/) → ../../
        const pkg = require('../../package.json');
        if (pkg && pkg.enm && typeof pkg.enm.knownGoodElaVersion === 'string') {
            return pkg.enm.knownGoodElaVersion;
        }
    } catch (_) { /* fall through to null */ }
    return null;
}
const FALLBACK_LATEST = _readKnownGoodElaVersion();

// 0.5.111 audit Session 111 — read the User-Agent version segment from
// package.json instead of hardcoding "0.2.0". Pre-0.5.111 the
// User-Agent stayed at "elastos-node-manager/0.2.0" while the actual
// shipped versions went through 0.4.x and 0.5.x — GitHub's analytics +
// any operator-side log scraper saw a misleading version string.
// Reading at module load is fine because package.json is bundled with
// the server and changes require a redeploy anyway.
function _readPackageVersion() {
    try {
        const pkg = require('../../package.json');
        if (pkg && typeof pkg.version === 'string') {
            return pkg.version;
        }
    } catch (_) { /* fall through */ }
    return '0.0.0';
}
const USER_AGENT = 'elastos-node-manager/' + _readPackageVersion();

function makeEnvelope({ current, latest, severity, status, releaseNotes, publishedAt, htmlUrl, lastCheckedAt, error, source }) {
    return {
        current:        current || null,
        latest:         latest || null,
        severity:       severity || null,            // 'patch' | 'minor' | 'major' | null
        updateAvailable: !!(current && latest && semverCompare(latest, current) > 0),
        // 'fresh'       — GitHub responded; envelope is < 6h old
        // 'up-to-date'  — current >= latest per GitHub
        // 'stale'       — last GitHub probe failed; envelope is older than 6h
        // 'fallback'    — never reached GitHub; latest is the build-time
        //                 knownGoodElaVersion baked into the bundle
        // 'unknown'     — never reached GitHub AND no fallback available
        status:         status || 'unknown',
        // 'github' | 'fallback' — tells the frontend whether to badge the
        // card as "live" or "offline (last known stable)".
        source:         source || (status === 'fallback' ? 'fallback' : 'github'),
        releaseNotes:   releaseNotes || null,
        publishedAt:    publishedAt || null,
        htmlUrl:        htmlUrl || null,
        lastCheckedAt:  lastCheckedAt || null,
        error:          error || null,
    };
}

/**
 * Loose semver compare. ela uses 4-segment versions (`v0.9.9.5`) plus
 * an optional pre-release tail. We strip the leading 'v' + any '-foo'
 * suffix, then numeric-compare segment-by-segment with missing segments
 * treated as zero. Returns negative if a < b, positive if a > b, 0 if equal.
 */
function semverCompare(a, b) {
    const strip = (s) => String(s).trim().replace(/^v/i, '').replace(/-.*$/, '');
    const parse = (s) => strip(s).split('.').map((x) => parseInt(x, 10) || 0);
    const A = parse(a); const B = parse(b);
    const len = Math.max(A.length, B.length);
    for (let i = 0; i < len; i += 1) {
        const ai = A[i] || 0;
        const bi = B[i] || 0;
        if (ai !== bi) return ai - bi;
    }
    return 0;
}

/**
 * Classify the diff between current and latest as 'patch' / 'minor' /
 * 'major'. ela uses 4-segment versions (e.g. v0.9.9.5). We map them:
 *   segment [0] = major  (vX.0.0.0)
 *   segment [1] = major  (v0.Y.0.0; ela's 0.10 → 0.11 IS substantial)
 *   segment [2] = minor  (v0.9.Y.0)
 *   segment [3] = patch  (v0.9.9.Y; the common case)
 * Returns null when latest <= current (no update). Strips leading 'v'
 * and any pre-release '-rc.N' suffix before comparing.
 */
function severityFor(current, latest) {
    if (!current || !latest) return null;
    if (semverCompare(latest, current) <= 0) return null;
    const strip = (s) => String(s).replace(/^v/i, '').replace(/-.*$/, '');
    const A = strip(current).split('.').map((x) => parseInt(x, 10) || 0);
    const B = strip(latest).split('.').map((x) => parseInt(x, 10) || 0);
    if ((B[0] || 0) > (A[0] || 0)) return 'major';
    if ((B[1] || 0) > (A[1] || 0)) return 'major';
    if ((B[2] || 0) > (A[2] || 0)) return 'minor';
    return 'patch';
}

class EnmUpdateScanner {
    constructor(opts) {
        opts = opts || {};
        this.logger = opts.logger || console;
        this._envelope = null;
        this._etag     = null;
        this._inflight = null;
        this._nextScanAt = 0;
    }

    /**
     * Read the cached scan or refresh if stale. Operator-callable via
     * the /updates/available route; safe to call concurrently — the
     * in-flight scan is shared.
     *
     * @param {{ refresh?: boolean, currentVersion?: string|null }} opts
     * @returns {Promise<object>} envelope shape per makeEnvelope
     */
    async snapshot(opts) {
        opts = opts || {};
        const force = !!opts.refresh;
        const now = Date.now();
        const stale = !this._envelope || now >= this._nextScanAt;
        if (!force && !stale && this._envelope) return this._envelope;
        if (this._inflight) return this._inflight;
        this._inflight = this._scan(opts.currentVersion);
        try {
            const envelope = await this._inflight;
            return envelope;
        } finally {
            this._inflight = null;
        }
    }

    /** Currently-known envelope without forcing a refresh. May be null. */
    peek() { return this._envelope; }

    /** @private */
    async _scan(currentVersion) {
        const startedAt = Date.now();
        try {
            const { status, body, etag, notModified } = await this._fetchLatestRelease();
            if (notModified && this._envelope) {
                // Reuse cached envelope; reschedule next poll.
                this._scheduleNext(startedAt);
                this._envelope = Object.assign({}, this._envelope, {
                    status: 'fresh',
                    lastCheckedAt: startedAt,
                });
                return this._envelope;
            }
            if (status !== 200 || !body) {
                this._envelope = makeEnvelope({
                    current: currentVersion,
                    latest: this._envelope && this._envelope.latest,
                    status: this._envelope ? 'stale' : 'unknown',
                    lastCheckedAt: startedAt,
                    error: 'GitHub releases endpoint returned status ' + status,
                });
                this._scheduleNext(startedAt);
                return this._envelope;
            }
            const release = JSON.parse(body);
            if (release.prerelease) {
                // Skip pre-releases; we only track the stable channel today.
                this._envelope = makeEnvelope({
                    current: currentVersion,
                    latest: this._envelope && this._envelope.latest,
                    status: 'fresh',
                    lastCheckedAt: startedAt,
                });
                this._scheduleNext(startedAt);
                if (etag) this._etag = etag;
                return this._envelope;
            }
            const latest = release.tag_name || release.name || null;
            const severity = severityFor(currentVersion, latest);
            const updateAvailable = !!(currentVersion && latest && semverCompare(latest, currentVersion) > 0);
            this._envelope = makeEnvelope({
                current:       currentVersion,
                latest,
                severity,
                status:        updateAvailable ? 'fresh' : 'up-to-date',
                releaseNotes:  truncateNotes(release.body),
                publishedAt:   release.published_at || null,
                htmlUrl:       release.html_url || null,
                lastCheckedAt: startedAt,
            });
            if (etag) this._etag = etag;
            this._scheduleNext(startedAt);
            return this._envelope;
        } catch (err) {
            this.logger.warn && this.logger.warn(
                '[ENM] EnmUpdateScanner: scan failed: ' + (err && err.message ? err.message : err),
            );
            // Fallback strategy:
            // 1. If we have a previous successful envelope, mark it stale
            //    and keep using it — the operator at least sees the last
            //    good value.
            // 2. Otherwise, fall back to the build-time
            //    knownGoodElaVersion. Stale by design, but better than
            //    "Couldn't reach GitHub."
            // 3. If neither, status: 'unknown' and the card renders the
            //    silent "we'll retry" line.
            const prevLatest = this._envelope && this._envelope.latest;
            let fallbackLatest = prevLatest;
            let fallbackStatus = 'stale';
            let fallbackSource = 'github';
            if (!prevLatest && FALLBACK_LATEST) {
                fallbackLatest = FALLBACK_LATEST;
                fallbackStatus = 'fallback';
                fallbackSource = 'fallback';
            } else if (!prevLatest) {
                fallbackStatus = 'unknown';
            }
            this._envelope = makeEnvelope({
                current:       currentVersion,
                latest:        fallbackLatest,
                severity:      severityFor(currentVersion, fallbackLatest),
                status:        fallbackStatus,
                source:        fallbackSource,
                lastCheckedAt: startedAt,
                // 0.5.111 audit Session 111 — replaced raw err.message
                // interpolation with a static fallback. Pre-0.5.111 the
                // Tools tab consumed envelope.error and surfaced verbose
                // Node network errors verbatim ("getaddrinfo ENOTFOUND
                // api.github.com", certificate-mismatch text, etc.). The
                // server-side logger.warn above retains err.message for
                // diagnostics; the operator-visible envelope is the
                // sanitized version. Matches audit-chain pattern from
                // Sessions 64/67/79/81-84.
                error:         'Could not reach GitHub. The next scheduled poll will retry.',
            });
            this._scheduleNext(startedAt);
            return this._envelope;
        }
    }

    /** @private */
    _scheduleNext(startedAt) {
        const jitter = Math.floor(Math.random() * POLL_JITTER_MS);
        this._nextScanAt = startedAt + POLL_PERIOD_MS + jitter;
    }

    /** @private */
    _fetchLatestRelease() {
        return new Promise((resolve, reject) => {
            const headers = {
                'User-Agent':     USER_AGENT,
                'Accept':         'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            };
            if (this._etag) headers['If-None-Match'] = this._etag;
            const req = https.get(GITHUB_API_URL, { headers, timeout: REQUEST_TIMEOUT_MS }, (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => resolve({
                    status:      res.statusCode,
                    body:        Buffer.concat(chunks).toString('utf8'),
                    etag:        res.headers && res.headers.etag,
                    notModified: res.statusCode === 304,
                }));
            });
            req.on('timeout', () => {
                req.destroy(new Error('GitHub request timed out after ' + REQUEST_TIMEOUT_MS + 'ms'));
            });
            req.on('error', reject);
        });
    }
}

/** Cap release-notes body at 4 KB so the envelope stays tiny. The Tools
 *  card can link to release.html_url for the full text. */
function truncateNotes(body) {
    if (typeof body !== 'string') return null;
    const MAX = 4096;
    if (body.length <= MAX) return body;
    return body.slice(0, MAX) + '\n\n…(truncated; see GitHub for full release notes)';
}

// Singleton — one scanner per enm-server process.
let _instance = null;
function getInstance(opts) {
    if (!_instance) _instance = new EnmUpdateScanner(opts);
    return _instance;
}

module.exports = {
    EnmUpdateScanner,
    getInstance,
    semverCompare,
    severityFor,
};
