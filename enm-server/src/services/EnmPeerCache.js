/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmPeerCache — v0.5.195 — self-maintaining EVM peer cache.
 *
 * THE PROBLEM
 *
 * The EVM sidechains (esc/eid/pg) bootstrap their devp2p network from the
 * binary's built-in foundation bootnodes. Those are dead/flaky infra — which
 * ones answer flips cycle-to-cycle — so on a fresh install a chain can sit at
 * 0 peers and never sync. ENM ships no default bootnodes, so out of the box a
 * chain depends entirely on those (often dead) seeds.
 *
 * THE FIX (operator-directed: "an everyone fix, not a local fix" + "the local
 * peer-cache is the key mitigation")
 *
 * Every ENM node periodically harvests its OWN live, dialable peers and
 * persists them locally; on chain (re)start the adapter re-injects them as
 * `--bootnodes`. So once a node has peered even once, it remembers its good
 * peers and re-peers from them directly — it never needs a foundation seed
 * again. That makes the bootnodes FIRST-CONTACT-ONLY: attacking/killing the
 * seeds can only briefly slow a brand-new node's first connect, it can't take
 * the running network down.
 *
 * SECURITY POSTURE (operator raised DDoS/poisoning concerns)
 *
 * This is PURELY LOCAL state — the node's own observed peers, written to a
 * local file. There is NO network endpoint, NO publishing anywhere, nothing to
 * DDoS or poison. Entries are validated (EnmCrypto.validateEnode), capped, and
 * only ever ADD dial candidates (operator-set cfg.bootnodes always wins). Zero
 * new attack surface.
 *
 * PERSISTENCE (survives a full purge wipe)
 *
 * The cache lives at ${PC2_DATA_DIR}/enm-peer-cache/<chainId>.json — a SIBLING
 * of extensions/elastos-node-manager (the externalDataDirs the uninstall purges
 * with ?purge=true). So a wiped + reinstalled node re-peers automatically from
 * its last-known-good set, with no manual enode injection. (Bootstrap caveat: a
 * brand-new node that has never peered has an empty cache and still needs one
 * working seed for first contact — that's the separate shipped-default-bootnodes
 * piece; the cache prevents recurrence after a node has peered once.)
 *
 * SCOPE: class-B EVM sidechains only (esc/eid/pg). The mainchain peers via its
 * own config/DNS and isn't the 0-peer problem; oracles/arbiter aren't devp2p.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { pc2DataDir, atomicWrite } = require('./DataDir');
const { EthRpcClient } = require('./EthRpcClient');
const EnmCrypto = require('./EnmCrypto');
const ConfigStore = require('./ConfigStore');
const { ENM_LOG_PREFIX } = require('./EnmConstants');

// The EVM sidechains this cache covers + their default RPC ports (used when a
// chain's cfg doesn't carry an explicit port). Fixed set — these are the only
// class-B chains, so we don't need a registry lookup.
const EVM_CHAINS = Object.freeze(['esc', 'eid', 'pg']);
const DEFAULT_RPC_PORTS = Object.freeze({ esc: 20636, eid: 20646, pg: 20676 });

const TICK_MS = 20 * 60 * 1000;     // harvest every 20 min
const BOOT_DELAY_MS = 120 * 1000;   // 2 min after boot — let chains peer first
const MAX_CACHED = 30;              // cap per chain (recency-ordered, newest first)

/**
 * Cache dir — a SIBLING of the ENM externalDataDirs so it survives a
 * ?purge=true uninstall (the full-wipe case). Ensured to exist.
 * @returns {string}
 */
function peerCacheDir() {
    const dir = path.join(pc2DataDir(), 'enm-peer-cache');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
}

/** @param {string} chainId @returns {string} */
function cacheFilePath(chainId) {
    return path.join(peerCacheDir(), `${chainId}.json`);
}

/**
 * Dedupe enodes by their secp256k1 node id (the 128-hex before the @), keeping
 * first occurrence (callers pass newest-first). Falls back to the whole string
 * when the form is unexpected.
 * @param {string[]} enodes
 * @returns {string[]}
 */
function dedupeByNodeId(enodes) {
    const seen = new Set();
    const out = [];
    for (const e of enodes) {
        if (typeof e !== 'string') { continue; }
        const m = /^enode:\/\/([0-9a-fA-F]{128})@/.exec(e);
        const key = m ? m[1].toLowerCase() : e;
        if (seen.has(key)) { continue; }
        seen.add(key);
        out.push(e);
    }
    return out;
}

/**
 * SYNC, NEVER-THROWS read of the cached bootnodes for a chain. Called by
 * EvmSidechainAdapter.buildSpawnArgs at spawn time — must be synchronous and
 * must never break a chain start, so every failure path returns [].
 *
 * @param {string} chainId
 * @returns {string[]} validated enode URLs (possibly empty)
 */
function readCachedBootnodes(chainId) {
    try {
        if (!EVM_CHAINS.includes(chainId)) { return []; }
        const raw = fs.readFileSync(cacheFilePath(chainId), 'utf8');
        const obj = JSON.parse(raw);
        const enodes = (obj && Array.isArray(obj.enodes)) ? obj.enodes : [];
        return enodes.filter((e) => {
            if (typeof e !== 'string') { return false; }
            // EnmCrypto.validateEnode returns { valid, normalized } (NOT a bool).
            try { const r = EnmCrypto.validateEnode(e); return !!(r && r.valid === true); } catch (_) { return false; }
        });
    } catch (_) {
        // No cache file yet, unreadable, or malformed — behave exactly as before
        // the cache existed (binary built-in bootnodes only).
        return [];
    }
}

class EnmPeerCache {
    /**
     * @param {object} deps
     * @param {object} deps.extensionHandle  for logging (same shape as the rest)
     */
    constructor(deps) {
        this.extensionHandle = deps && deps.extensionHandle;
        this._timer = null;
        this._bootTimer = null;
        this._running = false;
    }

    start() {
        if (this._running) { return; }
        this._running = true;
        const self = this;
        this._bootTimer = setTimeout(function () {
            self._bootTimer = null;
            self._tick().catch(function (e) { self._log('warn', `peer-cache boot tick: ${e && e.message}`); });
            self._timer = setInterval(function () {
                self._tick().catch(function (e) { self._log('warn', `peer-cache tick: ${e && e.message}`); });
            }, TICK_MS);
        }, BOOT_DELAY_MS);
        this._log('info', `EnmPeerCache started — first harvest in ${BOOT_DELAY_MS / 1000}s, then every ${TICK_MS / 60000}min`);
    }

    stop() {
        if (!this._running) { return; }
        this._running = false;
        if (this._bootTimer) { clearTimeout(this._bootTimer); this._bootTimer = null; }
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
    }

    /** @private — one harvest pass across the EVM chains. */
    async _tick() {
        let cfg;
        try { cfg = await ConfigStore.load(); } catch (_) { return; }
        const chains = (cfg && cfg.chains) || {};
        for (const id of EVM_CHAINS) {
            const c = chains[id];
            if (!c || c.enabled === false) { continue; }
            const port = (c.ports && c.ports.rpc) || DEFAULT_RPC_PORTS[id];
            try {
                // eslint-disable-next-line no-await-in-loop
                await this._harvest(id, port);
            } catch (err) {
                // Chain not running / RPC down / admin namespace off — skip quietly.
                this._log('debug', `peer-cache ${id}: harvest skipped (${err && err.message})`);
            }
        }
    }

    /**
     * @private — harvest one chain's live dialable peers and merge into its cache.
     * @param {string} chainId
     * @param {number} rpcPort
     */
    async _harvest(chainId, rpcPort) {
        const client = new EthRpcClient({ host: '127.0.0.1', port: rpcPort });
        const peers = await client.call('admin_peers', []);
        if (!Array.isArray(peers) || peers.length === 0) { return; }

        // Prefer OUTBOUND peers — we dialed them, so their enode is their real
        // listener (dialable as a bootnode). Inbound peers advertise the
        // ephemeral source port of the socket they opened to us, which is NOT a
        // reusable listener (the lesson from the manual peer dumps). If the fork
        // doesn't expose network.inbound, fall back to every valid enode (a
        // non-listening enode just fails to dial later — harmless).
        let candidates = peers.filter((p) => p && p.network && p.network.inbound === false && typeof p.enode === 'string');
        if (candidates.length === 0) {
            candidates = peers.filter((p) => p && typeof p.enode === 'string');
        }

        // validateEnode returns { valid, normalized }; keep the normalized form
        // of each valid enode (lowercased node-id, canonical shape).
        const fresh = candidates
            .map((p) => p.enode)
            .map((e) => {
                try { const r = EnmCrypto.validateEnode(e); return (r && r.valid === true) ? r.normalized : null; }
                catch (_) { return null; }
            })
            .filter((e) => typeof e === 'string' && e.length > 0);
        if (fresh.length === 0) { return; }

        // Newest harvest first, then prior cache; dedupe by node id; cap.
        const existing = readCachedBootnodes(chainId);
        const merged = dedupeByNodeId([...fresh, ...existing]).slice(0, MAX_CACHED);

        await atomicWrite(
            cacheFilePath(chainId),
            JSON.stringify({ chainId, updatedAt: Date.now(), enodes: merged }, null, 2),
            { mode: 0o600 },
        );
        this._log('info', `peer-cache ${chainId}: harvested ${fresh.length} dialable peer(s); ${merged.length} cached`);
    }

    /** @private */
    _log(level, msg) {
        const lg = this.extensionHandle && this.extensionHandle.log;
        if (lg && typeof lg[level] === 'function') {
            lg[level](`${ENM_LOG_PREFIX} ${msg}`);
        }
    }
}

module.exports = {
    EnmPeerCache,
    readCachedBootnodes,
    peerCacheDir,
    cacheFilePath,
    dedupeByNodeId,
    EVM_CHAINS,
    DEFAULT_RPC_PORTS,
};
