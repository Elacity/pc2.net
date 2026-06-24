/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * ClockSkewChecker — host-clock vs. internet-clock comparison (F13).
 *
 * Why this matters (Rev 5 audit, agent 11):
 *   ELA's Schnorr signing fails silently if host clock skew exceeds 4.2s. The
 *   producer signs a block but the consensus partners reject the signature as
 *   out-of-window — the operator scores a missed-vote without warning. We
 *   measure skew long before the 4.2s threshold (>2s threshold) so the operator
 *   can fix NTP before they get penalized.
 *
 * How (per Rev 5):
 *   HTTPS HEAD to a known reliable endpoint; parse the `Date:` response header;
 *   compare to Date.now(). HTTPS HEAD is small (~1 KB) and tolerates network
 *   latency well — we add ½ RTT compensation per simple NTP-style approximation.
 *
 * Fail-soft: if egress fails (no internet, captive portal, firewall), we log
 *   a warning but DO NOT escalate to CRITICAL. F13 is "host clock vs. wall
 *   clock"; it's irrelevant if there's no wall clock to compare against.
 */

'use strict';

const https = require('node:https');
const { URL } = require('node:url');

const DEFAULT_ENDPOINTS = Object.freeze([
    'https://www.google.com',
    'https://cloudflare.com',
    'https://www.cloudflare.com',
]);
const DEFAULT_TIMEOUT_MS = 5_000;

// P1 (v0.5.183) — sanity bound on a single endpoint's computed skew. We trust
// a remote HTTP `Date:` header; a hijacked/misconfigured/buggy endpoint could
// report a wildly wrong time and scare the operator into "fixing" a perfectly
// good NTP clock. A real host-vs-internet skew that matters for F13 is on the
// order of seconds (the Schnorr window is ~4.2s); anything past an hour is far
// likelier a bad endpoint than a real clock that drifted that far unnoticed.
// Such a result is treated as untrusted and we fall through to the next endpoint.
const MAX_PLAUSIBLE_SKEW_MS = 60 * 60 * 1000; // 1 hour

/**
 * @typedef {object} SkewResult
 * @property {boolean} ok            true if we got a server time
 * @property {number} [skewMs]       host - server (positive = host ahead)
 * @property {number} [serverMs]
 * @property {number} [rtt]
 * @property {string} [endpoint]     which endpoint answered
 * @property {string} [reason]       set when ok=false
 */

/**
 * Probe one endpoint with HTTPS HEAD. Returns { ok, ... } on success or
 * { ok: false, reason } on failure.
 *
 * @param {string} endpoint
 * @param {number} timeoutMs
 * @returns {Promise<SkewResult>}
 */
function probeOne(endpoint, timeoutMs) {
    return new Promise((resolve) => {
        const url = new URL(endpoint);
        const t0 = Date.now();
        let settled = false;
        const finish = (out) => {
            if (settled) return;
            settled = true;
            resolve(out);
        };
        const req = https.request({
            host: url.hostname,
            port: url.port || 443,
            path: url.pathname || '/',
            method: 'HEAD',
            timeout: timeoutMs,
            // Most robust: don't pin a specific TLS protocol — let Node negotiate.
        }, (res) => {
            const dateHeader = res.headers && res.headers.date;
            const t1 = Date.now();
            res.resume(); // drain

            if (!dateHeader) {
                return finish({
                    ok: false,
                    endpoint,
                    reason: `${endpoint}: no Date response header`,
                });
            }
            const serverMs = Date.parse(dateHeader);
            if (Number.isNaN(serverMs)) {
                return finish({
                    ok: false,
                    endpoint,
                    reason: `${endpoint}: unparseable Date header "${dateHeader}"`,
                });
            }
            // Approximate the actual server-clock-at-our-receive-time by
            // shifting the Date header forward by half the RTT (the response
            // is in flight for half the round trip, then we read it).
            const rtt = t1 - t0;
            const serverAtReceive = serverMs + Math.floor(rtt / 2);
            const skewMs = t1 - serverAtReceive;
            return finish({ ok: true, skewMs, serverMs, rtt, endpoint });
        });
        req.on('timeout', () => {
            req.destroy(new Error('timeout'));
        });
        req.on('error', (err) => {
            finish({ ok: false, endpoint, reason: `${endpoint}: ${err.message}` });
        });
        req.end();
    });
}

/**
 * Public probe — tries each endpoint in order. A successful probe whose
 * computed skew exceeds MAX_PLAUSIBLE_SKEW_MS is treated as untrusted (likely
 * a bad/hijacked endpoint, not a real clock that drifted an hour unnoticed):
 * we discard it and fall through to the next endpoint.
 *
 * P1 (v0.5.183) — corroboration: a single HTTP Date endpoint is a single point
 * of trust. When >=2 endpoints are configured we require TWO independent
 * plausible successes before reporting ok, and return the lower-RTT (more
 * accurate) of the two. If only ONE endpoint is configured we keep working off
 * that single result (back-compat for callers that pin one endpoint).
 *
 * If no endpoint yields a trusted result, returns ok=false with the last reason.
 * Caller decides whether to escalate (we recommend WARNING tier — see header).
 *
 * @param {object} [opts]
 * @param {Array<string>} [opts.endpoints]
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<SkewResult>}
 */
async function check(opts) {
    const endpoints = (opts && Array.isArray(opts.endpoints) && opts.endpoints.length > 0)
        ? opts.endpoints : DEFAULT_ENDPOINTS;
    const timeout = (opts && Number.isInteger(opts.timeoutMs)) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    // Require corroboration only when there's more than one endpoint to corroborate with.
    const requiredAgreements = endpoints.length >= 2 ? 2 : 1;

    let last = null;
    const trusted = [];
    for (const ep of endpoints) {
        // eslint-disable-next-line no-await-in-loop
        const res = await probeOne(ep, timeout);
        last = res;
        if (!res.ok) { continue; }
        if (Math.abs(res.skewMs) > MAX_PLAUSIBLE_SKEW_MS) {
            // Implausible — distrust this endpoint and keep looking.
            last = {
                ok: false,
                endpoint: ep,
                reason: `${ep}: implausible skew ${res.skewMs}ms (> ${MAX_PLAUSIBLE_SKEW_MS}ms) — endpoint distrusted`,
            };
            continue;
        }
        trusted.push(res);
        if (trusted.length >= requiredAgreements) {
            // Prefer the lowest-RTT sample — its ½-RTT compensation is tightest.
            return trusted.reduce((best, r) => (r.rtt < best.rtt ? r : best));
        }
    }
    // Got at least one trusted sample but couldn't corroborate it.
    if (trusted.length > 0) {
        return {
            ok: false,
            endpoint: trusted[0].endpoint,
            reason: `could not corroborate clock skew across ${requiredAgreements} endpoints `
                + `(${trusted.length} of ${endpoints.length} responded with a plausible time)`,
        };
    }
    return last || { ok: false, reason: 'no endpoints' };
}

module.exports = {
    check,
    probeOne,
    DEFAULT_ENDPOINTS,
    DEFAULT_TIMEOUT_MS,
    MAX_PLAUSIBLE_SKEW_MS,
};
