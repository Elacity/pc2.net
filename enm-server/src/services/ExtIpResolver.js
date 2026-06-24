/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * ExtIpResolver — resolve the operator's external IPv4 address.
 *
 * Used to populate `Configuration.DPoSConfiguration.IPAddress` in ela's config
 * (Rev 5 audit, agent 10). The IP is advertised to DPoS peers — they need it
 * to dial back into our supernode.
 *
 * Mirrors node.sh's `extip()` (Rev 5 audit found it: `curl -s
 * https://checkip.amazonaws.com`). We use Node's built-in fetch (Node 18+).
 *
 * Caches successful results for 1 hour so we don't hammer the upstream on
 * every health-check tick. Operator can manual-override in Settings — that
 * value is stored in config and bypasses this resolver.
 */

'use strict';

// P1 (v0.5.182) — rotate over several echo-IP services. A single hardcoded
// endpoint is a fleet-wide SPOF: if it rate-limits the shared egress IP or has
// an outage, EVERY operator loses its advertised external IP at once → inbound-
// peer collapse across the fleet. First valid IPv4 wins.
const DEFAULT_ENDPOINTS = Object.freeze([
    'https://checkip.amazonaws.com',
    'https://api.ipify.org',
    'https://ifconfig.me/ip',
    'https://icanhazip.com',
]);
const DEFAULT_ENDPOINT = DEFAULT_ENDPOINTS[0]; // back-compat for existing callers/tests
const DEFAULT_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$/;

/**
 * P1 (v0.5.183) — true iff `ip` is a well-formed, GLOBALLY ROUTABLE IPv4.
 * The resolved value is advertised to DPoS peers as our dial-back address;
 * a private/loopback/link-local/CGNAT address is unroutable from the public
 * internet, so peers silently fail to connect (the "0 inbound peers" symptom).
 * An echo-IP service returning such a value means we saw a NAT/proxy hop, not
 * our real edge IP — reject it and try the next endpoint.
 *
 * Rejected ranges:
 *   10.0.0.0/8      private (RFC 1918)
 *   172.16.0.0/12   private (RFC 1918)
 *   192.168.0.0/16  private (RFC 1918)
 *   127.0.0.0/8     loopback
 *   169.254.0.0/16  link-local (RFC 3927)
 *   100.64.0.0/10   carrier-grade NAT (RFC 6598)
 *
 * @param {string} ip
 * @returns {boolean}
 */
function isPublicIpv4(ip) {
    if (typeof ip !== 'string' || !IPV4_REGEX.test(ip)) { return false; }
    const o = ip.split('.').map((p) => parseInt(p, 10));
    if (o[0] === 10) { return false; }
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) { return false; }
    if (o[0] === 192 && o[1] === 168) { return false; }
    if (o[0] === 127) { return false; }
    if (o[0] === 169 && o[1] === 254) { return false; }
    if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) { return false; }
    return true;
}

let cache = null; // { ip, fetchedAt }

/**
 * @typedef {object} ExtIpResult
 * @property {boolean} ok
 * @property {string} [ip]      e.g. "203.0.113.5"
 * @property {string} source    "cache" | "endpoint" | "manual"
 * @property {string} [reason]  set when ok=false
 */

/**
 * Resolve the external IP. Returns cached value if fresh.
 *
 * @param {object} [opts]
 * @param {string} [opts.endpoint] override (default checkip.amazonaws.com)
 * @param {number} [opts.timeoutMs]
 * @param {boolean} [opts.force]   bypass cache
 * @returns {Promise<ExtIpResult>}
 */
async function resolve(opts) {
    const o = opts || {};

    if (!o.force && cache && (Date.now() - cache.fetchedAt) < CACHE_TTL_MS) {
        return { ok: true, ip: cache.ip, source: 'cache' };
    }

    const timeoutMs = Number.isInteger(o.timeoutMs) ? o.timeoutMs : DEFAULT_TIMEOUT_MS;
    // Honor a single explicit override; otherwise try the fallback list in order.
    const endpoints = o.endpoint ? [o.endpoint] : DEFAULT_ENDPOINTS;

    let lastReason = 'External IP probe failed (network unreachable, DNS, or TLS error).';
    for (const ep of endpoints) {
        // eslint-disable-next-line no-await-in-loop — sequential by design: first success wins
        const r = await probeEndpoint(ep, timeoutMs);
        if (r.ok) {
            cache = { ip: r.ip, fetchedAt: Date.now() };
            return { ok: true, ip: r.ip, source: 'endpoint' };
        }
        lastReason = r.reason || lastReason;
    }
    return {
        ok: false,
        source: 'endpoint',
        reason: `${lastReason} You can paste your IP manually in Settings → Network.`,
    };
}

/**
 * @private — probe ONE echo-IP endpoint. Returns { ok, ip } or { ok:false, reason }.
 * Never throws. (0.5.115: keep the operator-facing reason generic — the recovery
 * is identical regardless of which network failure mode tripped.)
 */
async function probeEndpoint(endpoint, timeoutMs) {
    let controller;
    let timer;
    if (typeof AbortController !== 'undefined') {
        controller = new AbortController();
        timer = setTimeout(() => controller.abort(), timeoutMs);
    }
    let response;
    try {
        response = await fetch(endpoint, {
            method: 'GET',
            signal: controller ? controller.signal : undefined,
            redirect: 'follow',
            headers: { 'Accept': 'text/plain' },
        });
    } catch (_) {
        if (timer) { clearTimeout(timer); }
        return { ok: false, reason: 'External IP probe failed (network unreachable, DNS, or TLS error).' };
    }
    if (timer) { clearTimeout(timer); }

    if (!response.ok) {
        return { ok: false, reason: `External IP probe returned HTTP ${response.status}.` };
    }
    const text = (await response.text()).trim();
    if (!IPV4_REGEX.test(text)) {
        return { ok: false, reason: `External IP probe returned a non-IPv4 string (${truncate(text, 64)}).` };
    }
    // P1 (v0.5.183) — reject a private/loopback/CGNAT result. Advertising one of
    // those to DPoS peers is unroutable (silent inbound-peer collapse); it also
    // signals the probe saw a NAT hop, not our edge IP. Try the next endpoint.
    if (!isPublicIpv4(text)) {
        return { ok: false, reason: `External IP probe returned a non-public IPv4 (${truncate(text, 64)}).` };
    }
    return { ok: true, ip: text };
}

/**
 * Validate an operator-supplied IP or hostname. Hostnames are accepted because
 * DPoS supports DDNS (Rev 5 audit: `normalizeAddress` accepts FQDN).
 *
 * P1 (v0.5.183) — a private/loopback/CGNAT IPv4 override is accepted (ok:true)
 * but flagged with `warning` in the return shape: some operators legitimately
 * run on a private network behind their own routing/VPN, so we don't hard-block,
 * but the value is unroutable from the public DPoS mesh in the common case and
 * the caller should surface the warning so it isn't set by mistake.
 *
 * @param {string} value
 * @returns {{ ok: boolean, kind?: 'ipv4'|'hostname', reason?: string, warning?: string }}
 */
function validateOverride(value) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return { ok: false, reason: 'Override must be a non-empty string.' };
    }
    const trimmed = value.trim();
    if (IPV4_REGEX.test(trimmed)) {
        if (!isPublicIpv4(trimmed)) {
            return {
                ok: true,
                kind: 'ipv4',
                warning: `"${truncate(trimmed, 32)}" is a private/loopback/CGNAT address — `
                    + 'DPoS peers on the public internet cannot dial back to it. '
                    + 'Use this only if you route inbound traffic to it yourself.',
            };
        }
        return { ok: true, kind: 'ipv4' };
    }
    // If the input *looks* like a dotted-quad (4 numeric parts) but failed the
    // strict IPv4 test above, reject — accepting it as a hostname would let
    // "999.999.999.999" pass since RFC 1123 permits all-digit labels.
    if (/^\d+(?:\.\d+){3}$/.test(trimmed)) {
        return { ok: false, reason: `"${truncate(trimmed, 32)}" is not a valid IPv4 address.` };
    }
    // Accept RFC 1123 hostnames (also covers DDNS like myhost.dyndns.org).
    if (/^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?(\.[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?)*$/i.test(trimmed)) {
        return { ok: true, kind: 'hostname' };
    }
    return { ok: false, reason: `"${truncate(trimmed, 32)}" is not a valid IPv4 address or hostname.` };
}

function truncate(s, n) {
    return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** @internal — for tests only */
function _resetCacheForTests() { cache = null; }

module.exports = {
    resolve,
    validateOverride,
    isPublicIpv4,
    _resetCacheForTests,
    DEFAULT_ENDPOINT,
    CACHE_TTL_MS,
};
