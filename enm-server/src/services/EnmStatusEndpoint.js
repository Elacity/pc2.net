/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmStatusEndpoint — a read-only, externally-reachable, authenticated
 * whole-node status endpoint for FLEET MONITORING.
 *
 * Background: operators monitor a fleet of validators centrally. node.sh's
 * `all_status` (and per-chain `*_status`) gave the whole-node roll-up — every
 * chain + service (mainchain, esc/eid/pg, their oracles, arbiter), each one's
 * version and active/inactive (+ height/peers) — and the monitor reached it by
 * being IP-whitelisted AND holding the RPC user/password (ela's
 * RpcConfiguration {User, Pass, WhiteIPList}). ENM already computes that whole-
 * node picture (CouncilOverviewService) but only behind the owner token on
 * loopback, so an external monitor can't read it.
 *
 * This service exposes that aggregate as ONE endpoint per node:
 *
 *   GET /status   →  JSON: { ts, node:{mode}, components:[ {id,name,class,
 *                     version,active,state,height,peers}, ... ] }
 *
 * gated by the SAME policy the operator already configures for RPC access:
 *   1. IP allow-list  = cfg.chains.mainchain.rpc.whiteIPList (real socket peer;
 *                       X-Forwarded-For ignored; 127.0.0.1 always allowed).
 *   2. HTTP Basic-Auth = cfg.chains.mainchain.rpc.user + decrypted password.
 *   3. Active only when cfg.chains.mainchain.rpc.enabled AND Council mode.
 *
 * It is READ-ONLY (no control, no secrets in the body, no chain RPC proxied —
 * geth/ela/arbiter listeners are untouched). It is the only externally-bound
 * ENM socket, so its surface is exactly GET /status (404 for everything else),
 * and it binds only while the policy is enabled (default off ⇒ no open port).
 */

'use strict';

const http = require('node:http');
const crypto = require('node:crypto');

const ConfigStore = require('./ConfigStore');
const ChainState = require('./ChainState');
let EnmFirewallManager = null;
try { EnmFirewallManager = require('./EnmFirewallManager'); } catch (_) { /* optional */ }

const DEFAULT_STATUS_PORT = 20920; // clear of the chain port map (20336/20536/2063x/2064x/2067x + p2p/dpos)

// Friendly display names keyed by chainId (oracles/arbiter included). Falls
// back to the snapshot's displayName, then the raw id.
const DISPLAY_NAME = {
    mainchain: 'ELA Mainchain',
    esc: 'Elastos Smart Chain',
    eid: 'Identity Chain',
    pg: 'Elastos DID 2.0 (PG)',
    'esc-oracle': 'ESC Oracle',
    'eid-oracle': 'EID Oracle',
    'pg-oracle': 'PG Oracle',
    arbiter: 'Arbiter',
};

/** Normalize an IPv4-mapped IPv6 peer (::ffff:1.2.3.4 → 1.2.3.4). */
function normalizeIp(ip) {
    if (typeof ip !== 'string') { return ''; }
    return ip.replace(/^::ffff:/i, '');
}

function ipv4ToInt(ip) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
    if (!m) { return null; }
    let n = 0;
    for (let i = 1; i <= 4; i += 1) {
        const o = Number(m[i]);
        if (o > 255) { return null; }
        n = (n * 256) + o;
    }
    return n >>> 0;
}

/** Match a peer IP against one whitelist entry (exact, or IPv4 CIDR). */
function entryMatches(peer, entry) {
    if (entry === peer) { return true; }
    if (entry.indexOf('/') === -1) { return false; }
    const [net, bitsStr] = entry.split('/');
    const bits = Number(bitsStr);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) { return false; }
    const pi = ipv4ToInt(peer);
    const ni = ipv4ToInt(net);
    if (pi === null || ni === null) { return false; }     // IPv6 CIDR → exact-only
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (pi & mask) === (ni & mask);
}

function ipAllowed(peer, whiteIPList) {
    const ip = normalizeIp(peer);
    if (ip === '127.0.0.1' || ip === '::1') { return true; } // loopback always
    if (!Array.isArray(whiteIPList)) { return false; }
    return whiteIPList.some((e) => entryMatches(ip, String(e).trim()));
}

/** Constant-time-ish string compare (length mismatch ⇒ false). */
function safeEqual(a, b) {
    const ba = Buffer.from(String(a || ''));
    const bb = Buffer.from(String(b || ''));
    if (ba.length !== bb.length) { return false; }
    try { return crypto.timingSafeEqual(ba, bb); } catch (_) { return false; }
}

class EnmStatusEndpoint {
    /**
     * @param {object} deps
     * @param {object} deps.extensionHandle  for .log
     * @param {() => object|null} deps.getOverviewService  resolver → CouncilOverviewService
     * @param {number} [deps.port]
     */
    constructor(deps) {
        this.log = (deps && deps.extensionHandle && deps.extensionHandle.log) || console;
        this._getOverview = (deps && deps.getOverviewService) || (() => null);
        this.port = (deps && deps.port) || DEFAULT_STATUS_PORT;
        this._server = null;
        // Policy snapshot, refreshed by reload(): never read config per-request.
        this._policy = { enabled: false, council: false, whiteIPList: ['127.0.0.1'], user: null, password: null };
        // Components we've kicked a one-shot version smoke-test for, so a cold
        // version cache (e.g. right after a server restart) fills in within a
        // poll or two without re-spawning `--version` on every request.
        this._warmed = new Set();
    }

    /**
     * Re-read the RPC-access policy from config and (un)bind the listener +
     * reconcile the firewall accordingly. Called on boot and after every
     * Access save. Safe to call repeatedly.
     */
    async reload() {
        let cfg;
        try { cfg = await ConfigStore.load(); } catch (_) { cfg = null; }
        const chains = (cfg && cfg.chains) || {};
        const mainCfg = chains.mainchain || null;
        const rpc = (mainCfg && mainCfg.rpc) || {};
        const council = Object.keys(chains).length >= 2; // ≥2 components ⇒ Council install
        let password = null;
        try {
            if (mainCfg && rpc.passwordEncrypted) { password = ConfigStore.getRpcPassword(mainCfg); }
        } catch (_) { password = null; }
        this._policy = {
            enabled: rpc.enabled === true,
            council,
            whiteIPList: Array.isArray(rpc.whiteIPList) ? rpc.whiteIPList.slice() : ['127.0.0.1'],
            user: rpc.user || null,
            password,
        };

        const shouldRun = this._policy.enabled && this._policy.council
            && !!this._policy.user && !!this._policy.password;
        if (shouldRun) { await this._ensureListening(); }
        else { await this._ensureStopped(); }

        // Firewall (defense-in-depth; in-process gate is primary). Open the
        // status port to whitelisted IPs only when running; tear down when not.
        if (EnmFirewallManager && typeof EnmFirewallManager.reconcileSourceRules === 'function') {
            try {
                await EnmFirewallManager.reconcileSourceRules(
                    this.port,
                    shouldRun ? this._policy.whiteIPList : [],
                    { comment: 'ENM monitor status (ENM policy)', logger: this.log },
                );
            } catch (err) {
                if (this.log && this.log.warn) {
                    this.log.warn('EnmStatusEndpoint: firewall reconcile failed: ' + (err && err.message));
                }
            }
        }
    }

    start() { return this.reload(); }

    async stop() { await this._ensureStopped(); }

    /** @private */
    _ensureListening() {
        if (this._server) { return Promise.resolve(); }
        return new Promise((resolve) => {
            const server = http.createServer((req, res) => this._handle(req, res));
            server.on('error', (err) => {
                if (this.log && this.log.error) {
                    this.log.error('EnmStatusEndpoint: listen error on :' + this.port + ' — ' + (err && err.message));
                }
                this._server = null;
                resolve();
            });
            server.listen(this.port, '0.0.0.0', () => {
                this._server = server;
                if (this.log && this.log.info) {
                    this.log.info('EnmStatusEndpoint: monitor status listening on 0.0.0.0:' + this.port + '/status');
                }
                resolve();
            });
        });
    }

    /** @private */
    _ensureStopped() {
        if (!this._server) { return Promise.resolve(); }
        const server = this._server;
        this._server = null;
        return new Promise((resolve) => {
            try { server.close(() => resolve()); } catch (_) { resolve(); }
        });
    }

    /** @private — request handler. GET /status only; everything else 404. */
    _handle(req, res) {
        const send = (code, obj) => {
            const body = JSON.stringify(obj);
            res.writeHead(code, {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'Cache-Control': 'no-store',
            });
            res.end(body);
        };
        try {
            // Surface only GET /status. Drop the rest (no info leak).
            const url = (req.url || '').split('?')[0];
            if (req.method !== 'GET' || url !== '/status') { send(404, { error: 'not found' }); return; }

            // 1. Disabled / not Council ⇒ behave as if absent.
            if (!this._policy.enabled || !this._policy.council) { send(404, { error: 'not found' }); return; }

            // 2. Source-IP allow-list (real peer; never trust X-Forwarded-For).
            const peer = req.socket && req.socket.remoteAddress;
            if (!ipAllowed(peer, this._policy.whiteIPList)) { res.socket && res.socket.destroy(); return; }

            // 3. HTTP Basic-Auth against the RPC credentials.
            if (!this._checkAuth(req)) {
                res.writeHead(401, {
                    'WWW-Authenticate': 'Basic realm="ENM monitor"',
                    'Content-Type': 'application/json',
                });
                res.end(JSON.stringify({ error: 'unauthorized' }));
                return;
            }

            // 4. Build + return the read-only aggregate.
            const payload = this._buildPayload();
            if (!payload) { send(503, { error: 'warming up' }); return; }
            send(200, payload);
        } catch (err) {
            if (this.log && this.log.warn) { this.log.warn('EnmStatusEndpoint: handler error: ' + (err && err.message)); }
            try { send(500, { error: 'internal' }); } catch (_) { /* ignore */ }
        }
    }

    /** @private */
    _checkAuth(req) {
        const hdr = req.headers && req.headers.authorization;
        if (typeof hdr !== 'string' || !/^basic\s+/i.test(hdr)) { return false; }
        let decoded;
        try { decoded = Buffer.from(hdr.replace(/^basic\s+/i, ''), 'base64').toString('utf8'); }
        catch (_) { return false; }
        const idx = decoded.indexOf(':');
        if (idx === -1) { return false; }
        const user = decoded.slice(0, idx);
        const pass = decoded.slice(idx + 1);
        return safeEqual(user, this._policy.user) && safeEqual(pass, this._policy.password);
    }

    /** @private — assemble the whole-node roll-up from ENM's existing data. */
    _buildPayload() {
        const overview = this._getOverview();
        const snap = overview && typeof overview.getCachedSnapshot === 'function'
            ? overview.getCachedSnapshot() : null;
        if (!snap || !Array.isArray(snap.chains)) { return null; }
        const components = snap.chains.map((c) => {
            let version = null;
            try {
                const s = ChainState.snapshot(c.chainId);
                version = (s && s.binaryVersion) ? s.binaryVersion : null;
            } catch (_) { version = null; }
            // Cold cache (e.g. just after a server restart) ⇒ kick a one-shot
            // smoke-test so the next poll has the version. snapshotVerified is
            // itself cached, and _warmed stops us re-spawning for components
            // that have no resolvable --version (oracle scripts).
            if (!version && !this._warmed.has(c.chainId)) {
                this._warmed.add(c.chainId);
                Promise.resolve().then(() => ChainState.snapshotVerified(c.chainId)).catch(() => { /* best-effort */ });
            }
            return {
                id: c.chainId,
                name: DISPLAY_NAME[c.chainId] || c.displayName || c.chainId,
                class: c.chainClass || null,
                version,
                active: !!c.alive,
                state: c.state || null,           // synced|syncing|starting|stalled|stopped|disabled|unconfigured
                height: (typeof c.height === 'number') ? c.height : null,
                networkHeight: (typeof c.networkHeight === 'number') ? c.networkHeight : null,
                peers: (typeof c.peers === 'number') ? c.peers : null,
                updateAvailable: !!c.updateAvailable,
            };
        });
        return {
            ts: Date.now(),
            node: { mode: components.length >= 2 ? 'council' : 'bpos' },
            components,
        };
    }
}

module.exports = {
    EnmStatusEndpoint,
    DEFAULT_STATUS_PORT,
    // exported for unit tests
    ipAllowed,
    entryMatches,
};
