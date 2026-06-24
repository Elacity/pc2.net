/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * routes/spv.js — SPV Module endpoints (v0.5.168 Phase 2, v0.5.200 relabel).
 *
 *   GET /spv             aggregate SPV status + per-sidechain detail
 *   GET /spv/:id/logs    tail the newest embedded-SPV log for one EVM sidechain
 *
 * WHY this module exists: SPV (class E in the taxonomy) is NOT a standalone
 * process. node.sh embeds it inside the EVM sidechains (esc/eid/pg keep their
 * own light-client state under data/logs-spv) and inside the arbiter (which
 * exposes getspvheight for its own SPV view + getsidechainblockheight for each
 * bridged sidechain — node.sh:5060,5073-5145). The frontend "SPV Module" tile
 * needs ONE place to read all of that. This route aggregates:
 *
 *   - the arbiter's own SPV height (the headline number — tracks ELA mainchain
 *     tip via headers-only sync), and
 *   - per-sidechain:
 *       - `arbiterProcessedHeight` (from arbiter getsidechainblockheight) — the
 *         height the ARBITER has finished walking for cross-chain transactions
 *         (withdraws / illegal evidence / failed deposits). NOT SPV; it's the
 *         arbiter's per-block processing position. node.sh labels this
 *         "ESC Height" / "EID Height" — we used to call it "SPV height" which
 *         was misleading (v0.5.199 lockup investigation surfaced the confusion).
 *       - `embeddedSpv` evidence — the EVM sidechain's OWN embedded SPV
 *         (Elastos.ELA.SideChain.<EID|ESC|...>/spv/.../GetSpvHeight) tracks
 *         the ELA mainchain tip for cross-chain deposit verification. Upstream
 *         does NOT expose this height via RPC, so the only external signal is
 *         the on-disk data/logs-spv directory — newest file mtime + last line
 *         tells us whether the embedded SPV is alive (recent activity) or
 *         stale.
 *
 * Read-only: like GET /chains/:id it requires an authenticated actor but no
 * owner gate (no mutation). Every probe is best-effort — a missing arbiter or
 * an unreachable RPC resolves to null so the UI renders "—" honestly.
 */

'use strict';

const express = require('express');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const { ENM_LOG_PREFIX, errorBody, successBody } = require('../services/EnmConstants');
const { limit } = require('../services/EnmRateLimit');
const { readActorWallet } = require('../auth/OwnerCheckMiddleware');
const ChainRegistry = require('../services/ChainRegistry');
const ConfigStore = require('../services/ConfigStore');
const { chainSpvLogDir } = require('../services/DataDir');
const ArbiterAdapter = require('../services/ArbiterAdapter');

// The EVM sidechains the arbiter bridges + tracks via SPV. Mirrors
// ArbiterAdapter.SIDECHAINS_REQUIRED minus the mainchain (which is the
// arbiter's MainNode, not a side node).
const SPV_SIDECHAINS = Object.freeze(['esc', 'eid', 'pg']);

// Bound the per-log read so a multi-GB logs-spv file can never blow memory.
const SPV_LOG_TAIL_BYTE_CAP = 256 * 1024;
const SPV_LOG_TAIL_MAX_LINES = 500;
const SPV_LOG_TAIL_DEFAULT_LINES = 200;

// v0.5.200 — embedded-SPV liveness threshold. The EVM-sidechain embedded SPV
// (Elastos.ELA.SideChain.*/spv/) writes a fresh log entry every few seconds
// while it's tracking the mainchain (peer handshakes, header receipt, etc.).
// A logs-spv file whose mtime is older than this is treated as STALE — the
// SPV worker has stopped writing, which usually means the chain process is
// down or the SPV thread inside it died. 5 min gives wide headroom over
// the usual 1-2s cadence without producing false "stale" flags during a
// brief pause between header batches.
const SPV_EMBEDDED_STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * Coerce an RPC result that may be a raw number or a { result } envelope into
 * a Number or null. ela/arbiter JSON-RPC sometimes returns the unwrapped value
 * (EnmRpcClient.call already unwraps .result), but stay defensive either way.
 *
 * @param {unknown} v
 * @returns {number|null}
 */
function asHeight(v) {
    if (typeof v === 'number') { return v; }
    if (v && typeof v.result === 'number') { return v.result; }
    return null;
}

/**
 * @param {object} extensionHandle
 * @returns {import('express').Router}
 */
function build(extensionHandle) {
    const router = express.Router();

    // --- aggregate SPV status + per-sidechain detail ---
    router.get('/', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const cfg = await ConfigStore.load();
            const chains = (cfg && cfg.chains) || {};
            const net = (((chains.arbiter && chains.arbiter.activeNet) || 'mainnet') === 'testnet')
                ? 'testnet' : 'mainnet';
            const sideDefs = (ArbiterAdapter._internal
                && ArbiterAdapter._internal.ARBITER_SIDE_NODE_DEFS
                && ArbiterAdapter._internal.ARBITER_SIDE_NODE_DEFS[net]) || {};
            const ps = ChainRegistry.getProcessService();

            // ---- Arbiter aggregate (the headline SPV height) ----
            let arbiterAdapter = null;
            try { arbiterAdapter = ChainRegistry.getAdapter('arbiter'); }
            catch (_) { /* arbiter not configured — leave null */ }
            const arbiterRunning = !!(ps.statusSync('arbiter').alive);
            let arbiterRpc = null;
            let arbiterSpvHeight = null;
            if (arbiterAdapter && arbiterRunning && chains.arbiter) {
                try {
                    arbiterRpc = arbiterAdapter.rpcClient(chains.arbiter);
                    arbiterSpvHeight = asHeight(await arbiterRpc.getspvheight());
                } catch (_) { /* arbiter RPC not ready; spvHeight stays null */ }
            }

            // ---- Per-sidechain detail ----
            const sidechains = [];
            for (const chainId of SPV_SIDECHAINS) {
                if (!chains[chainId]) { continue; }   // not installed
                let displayName = chainId.toUpperCase();
                try { displayName = ChainRegistry.getAdapter(chainId).displayName; }
                catch (_) { /* fall back to upper-cased id */ }
                const def = sideDefs[chainId] || {};
                const genesisBlock = def.GenesisBlock || null;
                const running = !!(ps.statusSync(chainId).alive);

                // The arbiter's per-block-walk processing position for THIS
                // sidechain (node.sh:5073-5145 — `getsidechainblockheight`).
                // It is NOT a SPV height — it's the height the arbiter has
                // finished walking looking for cross-chain transactions
                // (withdraws / illegal-evidence / failed deposits). Persisted
                // every 1000 blocks per sideChainHeightInterval. Only
                // resolvable while the arbiter RPC is reachable.
                let arbiterProcessedHeight = null;
                if (arbiterRpc && genesisBlock) {
                    try {
                        // eslint-disable-next-line no-await-in-loop
                        arbiterProcessedHeight = asHeight(
                            await arbiterRpc.getsidechainblockheight(genesisBlock),
                        );
                    } catch (_) { /* leave null */ }
                }

                // v0.5.200 — embedded SPV liveness probe. The EVM sidechain
                // (esc/eid/pg) runs its own embedded SPV that tracks the ELA
                // mainchain tip for cross-chain deposit verification. Upstream
                // does NOT expose its height via RPC, so we infer liveness
                // from the newest file in <chainDir>/data/logs-spv:
                //   - mtime within SPV_EMBEDDED_STALE_AFTER_MS → "active"
                //   - mtime older                              → "stale"
                //   - dir absent / empty                       → "unknown"
                // eslint-disable-next-line no-await-in-loop
                const embeddedSpv = await probeEmbeddedSpv(chainId);

                sidechains.push({
                    chainId,
                    displayName,
                    genesisBlock,
                    running,
                    arbiterProcessedHeight,
                    // v0.5.200 — kept as a deprecated alias for one release so a
                    // frontend that hasn't redeployed doesn't render "—". Drop
                    // in v0.5.201 once spv-module.js consumers are all updated.
                    spvBlockHeight: arbiterProcessedHeight,
                    embeddedSpv,
                    // logs-spv presence — kept for frontend "View SPV logs" gate.
                    logsSpvPresent: embeddedSpv.state !== 'unknown',
                });
            }

            return res.json(successBody({
                arbiter: {
                    configured: !!chains.arbiter,
                    running: arbiterRunning,
                    spvHeight: arbiterSpvHeight,
                },
                sidechains,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} GET /spv: ${err.message}`);
            return res.status(500).json(errorBody('Failed to read SPV status.'));
        }
    });

    // --- tail the newest embedded-SPV log for one EVM sidechain ---
    router.get('/:chainId/logs', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        const { chainId } = req.params;
        if (!SPV_SIDECHAINS.includes(chainId)) {
            return res.status(404).json(errorBody(`No embedded SPV logs for "${chainId}".`));
        }
        try {
            const requested = parseInt(req.query.lines, 10);
            const n = Math.max(1, Math.min(
                SPV_LOG_TAIL_MAX_LINES,
                Number.isInteger(requested) ? requested : SPV_LOG_TAIL_DEFAULT_LINES,
            ));
            const lines = await tailSpvLog(chainId, n);
            return res.json(successBody({ chainId, lines }));
        } catch (err) {
            extensionHandle.log.debug(`${ENM_LOG_PREFIX} GET /spv/${chainId}/logs: ${err.message}`);
            return res.status(500).json(errorBody('Failed to read SPV logs.'));
        }
    });

    return router;
}

/**
 * Tail the newest file in a sidechain's logs-spv directory. The geth fork
 * rotates SPV logs into that dir, so we pick the most-recently-modified
 * regular file and return its last `n` non-empty lines. Reads at most
 * SPV_LOG_TAIL_BYTE_CAP from the tail so a huge log can't exhaust memory.
 * Returns [] when the dir or any file is missing/unreadable.
 *
 * @param {string} chainId
 * @param {number} n
 * @returns {Promise<string[]>}
 */
async function tailSpvLog(chainId, n) {
    const dir = chainSpvLogDir(chainId);
    let entries;
    try { entries = await fsp.readdir(dir); }
    catch (_) { return []; }            // dir absent — SPV not active yet
    if (!entries || entries.length === 0) { return []; }

    let newest = null;
    for (const name of entries) {
        const full = path.join(dir, name);
        try {
            // eslint-disable-next-line no-await-in-loop
            const st = await fsp.stat(full);
            if (st.isFile() && (!newest || st.mtimeMs > newest.mtimeMs)) {
                newest = { full, mtimeMs: st.mtimeMs, size: st.size };
            }
        } catch (_) { /* skip unreadable entry */ }
    }
    if (!newest) { return []; }

    const start = Math.max(0, newest.size - SPV_LOG_TAIL_BYTE_CAP);
    const len = newest.size - start;
    if (len <= 0) { return []; }
    const fh = await fsp.open(newest.full, 'r');
    try {
        const buf = Buffer.alloc(len);
        await fh.read(buf, 0, len, start);
        return buf.toString('utf8')
            .split(/\r?\n/)
            .filter((l) => l.length > 0)
            .slice(-n);
    } finally {
        await fh.close();
    }
}

/**
 * v0.5.200 — embedded SPV liveness probe for one EVM sidechain.
 *
 * Walks <chainDir>/data/logs-spv, picks the newest regular file, returns its
 * mtime + last non-empty line + an active/stale/unknown verdict based on
 * SPV_EMBEDDED_STALE_AFTER_MS. The actual sidechain-embedded SPV height
 * (`spv.GetSpvHeight()` in the Go source) is NOT exposed via RPC by upstream
 * Elastos, so log-file mtime is the only external liveness signal available.
 *
 * Return shape (all fields populated even when state==='unknown' so the
 * frontend can render uniform rows):
 *   {
 *     state: 'active' | 'stale' | 'unknown',
 *     lastEventAt: ISO-8601 string | null,
 *     ageSeconds: number | null,
 *     lastLine: string | null,
 *   }
 *
 * @param {string} chainId
 * @returns {Promise<object>}
 */
async function probeEmbeddedSpv(chainId) {
    const empty = { state: 'unknown', lastEventAt: null, ageSeconds: null, lastLine: null };
    const dir = chainSpvLogDir(chainId);
    let entries;
    try { entries = await fsp.readdir(dir); }
    catch (_) { return empty; }
    if (!entries || entries.length === 0) { return empty; }

    let newest = null;
    for (const name of entries) {
        const full = path.join(dir, name);
        try {
            // eslint-disable-next-line no-await-in-loop
            const st = await fsp.stat(full);
            if (st.isFile() && (!newest || st.mtimeMs > newest.mtimeMs)) {
                newest = { full, mtimeMs: st.mtimeMs, size: st.size };
            }
        } catch (_) { /* skip unreadable */ }
    }
    if (!newest) { return empty; }

    const ageMs = Date.now() - newest.mtimeMs;
    const state = ageMs <= SPV_EMBEDDED_STALE_AFTER_MS ? 'active' : 'stale';

    // Last non-empty line from the tail of the newest file. Bounded read so
    // an attacker-uploaded multi-GB log can never blow memory.
    let lastLine = null;
    if (newest.size > 0) {
        const start = Math.max(0, newest.size - 8 * 1024);
        const len = newest.size - start;
        try {
            const fh = await fsp.open(newest.full, 'r');
            try {
                const buf = Buffer.alloc(len);
                await fh.read(buf, 0, len, start);
                const lines = buf.toString('utf8').split(/\r?\n/).filter((l) => l.length > 0);
                if (lines.length > 0) { lastLine = lines[lines.length - 1]; }
            } finally {
                await fh.close();
            }
        } catch (_) { /* leave null */ }
    }

    return {
        state,
        lastEventAt: new Date(newest.mtimeMs).toISOString(),
        ageSeconds: Math.round(ageMs / 1000),
        lastLine,
    };
}

module.exports = {
    build,
    // Exported for tests.
    _internal: {
        SPV_SIDECHAINS,
        SPV_EMBEDDED_STALE_AFTER_MS,
        tailSpvLog,
        probeEmbeddedSpv,
        asHeight,
    },
};
