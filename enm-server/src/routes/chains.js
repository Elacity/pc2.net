/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * routes/chains.js — chain control endpoints (Phase 2).
 *
 *   GET    /chains                   list registered chains + summary state
 *   GET    /chains/:id               full state for one chain
 *   POST   /chains/:id/start         owner-only — spawn the process
 *   POST   /chains/:id/stop          owner-only — graceful stop
 *   POST   /chains/:id/restart       owner-only — atomic stop+start
 *   GET    /chains/:id/version       binary version (cached)
 *   GET    /chains/:id/peers         RPC: getnodestate
 *   GET    /chains/:id/height        RPC: getblockcount
 *   GET    /chains/:id/info          RPC: getinfo + getmininginfo
 *   GET    /chains/:id/dpos          RPC: BPoS-specific (Phase 5 will fill in F11/F12)
 *
 * Error handling per Rev 4 audit: inline try/catch + res.status().json(errorBody).
 * Auth: requireOwner on every mutation. Reads only require authentication.
 */

'use strict';

const express = require('express');

const { ENM_LOG_PREFIX, errorBody, successBody } = require('../services/EnmConstants');
const { limit } = require('../services/EnmRateLimit');
const { requireOwner, readActorWallet } = require('../auth/OwnerCheckMiddleware');
const ChainRegistry = require('../services/ChainRegistry');
const ConfigStore = require('../services/ConfigStore');
const HostConflictScanner = require('../services/HostConflictScanner');
const Diagnostics = require('../services/Diagnostics');
const LogCompactor = require('../services/LogCompactor');
const ChainState = require('../services/ChainState');
const EnmBposService = require('../services/EnmBposService');
const { decrypt } = require('../services/EnmEncryption');
// P1 (v0.5.183) — per-chain mutex for destructive maintenance ops (TOCTOU fix).
const { withChainLock } = require('../services/withChainLock');

// P1 (v0.5.183) — in-flight guard for BPoS activate. Two concurrent activate
// POSTs for the same chain share temp files in the chain dir; a Set of chainIds
// currently running an activate lets the second caller fail fast with 409.
const activateInFlight = new Set();
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { chainDir, pidFilePath } = require('../services/DataDir');

/** Promise-based sleep used to give async actions time to take effect
 *  before re-checking process state. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** v0.5.175 — upper bound on persisted bootnodes per EVM chain. geth's
 *  default --maxpeers is 50; there's no reason to persist more bootnodes
 *  than that, and an unbounded list is a footgun on the spawn arg line. */
const MAX_BOOTNODES = 50;

// v0.5.228d — per-chain cache for detectProducerRole results, used by
// GET /chains/:id to attach the derived chainState to its response
// (so the dashboard's EVM detail card stops reading the stale on-disk
// miner.enabled value — audit F4). 30s TTL keeps the mainchain RPC
// hit-rate bounded even if multiple dashboard cards poll concurrently.
const PRODUCER_ROLE_CACHE_TTL_MS = 30_000;
const _producerRoleCache = new Map();  // chainId → { ts, role }
async function getCachedProducerRole(adapter, cfg) {
    if (!adapter || adapter.chainClass !== 'B') { return null; }
    const cid = adapter.chainId;
    const now = Date.now();
    const cached = _producerRoleCache.get(cid);
    if (cached && (now - cached.ts) < PRODUCER_ROLE_CACHE_TTL_MS) {
        return cached.role;
    }
    if (typeof adapter.detectProducerRole !== 'function') { return null; }
    try {
        const role = await adapter.detectProducerRole(cfg);
        _producerRoleCache.set(cid, { ts: now, role });
        return role;
    } catch (_) {
        return null;
    }
}
/** Map detectProducerRole output → operator-facing chainState label.
 *  Shared between GET /chains/:id and GET /system/council-status so
 *  the dashboard card and the Validator-status badge in Settings
 *  never disagree on what to call the same on-chain state. */
function chainStateFromRole(role) {
    if (!role) { return 'unknown'; }
    if (role.inCurrent === true) { return 'on-duty'; }
    if (role.inNext === true) { return 'standby'; }
    if (role.isProducer === null) { return 'unknown'; }
    return 'inactive';
}

/**
 * @param {object} extensionHandle
 * @returns {import('express').Router}
 */
function build(extensionHandle) {
    const router = express.Router();

    // --- list chains ---
    router.get('/', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const chains = ChainRegistry.listChains();
            const cfg = await ConfigStore.load();
            const result = await Promise.all(chains.map(async (c) => {
                const chainCfg = cfg.chains[c.chainId];
                const status = ChainRegistry.getProcessService().statusSync(c.chainId);
                return {
                    chainId: c.chainId,
                    displayName: c.displayName,
                    enabled: !!(chainCfg && chainCfg.enabled),
                    configured: !!chainCfg,
                    state: deriveCoarseState(status, chainCfg, null, c.chainClass),
                    pid: status.pid,
                };
            }));
            return res.json(successBody({ chains: result }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} GET /chains: ${err.message}`);
            return res.status(500).json(errorBody('Failed to list chains.'));
        }
    });

    // --- single chain detail ---
    router.get('/:chainId', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            const cfg = await ConfigStore.load();
            const chainCfg = cfg.chains[adapter.chainId];
            if (!chainCfg) {
                return res.status(404).json(errorBody(`Chain "${adapter.chainId}" not configured yet.`));
            }
            const status = ChainRegistry.getProcessService().statusSync(adapter.chainId);

            // Pull live RPC + uptime when the chain is alive. The chain-card
            // UI needs height/peers/uptime to render real values; without
            // this they fall back to "—" even though the chain is healthy.
            // Each lookup is in its own try/catch so a single RPC blip
            // doesn't take down the whole status response.
            let height = null, peers = null, uptimeSec = null;
            // v0.5.168 (Phase 1) — hoisted so the class-aware primaryHeight()
            // call below can pre-fill them for non-A classes. For class A they
            // stay at these defaults here and are filled by the getnodestate
            // neighbor walk further down.
            let synced = false;
            let lastBlockTime = null;
            let networkHeight = null;
            let producerState = null;
            // 0.2.0-alpha.7 — peer-quality summary surfaced for the chain-card
            // hover panel. Populated inside the synced/at-tip neighbors walk
            // below so we don't make a second `getnodestate` RPC for it.
            let peerSummary = null;
            // v0.5.168 (Phase 1) — class C oracle context: the parent EVM
            // sidechain's current block height. null for every non-oracle.
            let parentBlockHeight = null;
            if (status && status.alive) {
                // Uptime — read from the meta sidecar's startedAt.
                try {
                    const m = JSON.parse(
                        require('fs').readFileSync(require('../services/processUtils').metaFilePath(adapter.chainId), 'utf8'),
                    );
                    if (m && typeof m.startedAt === 'number') {
                        uptimeSec = Math.max(0, Math.floor((Date.now() - m.startedAt) / 1000));
                    }
                } catch (_) { /* meta missing; uptime stays null */ }

                // v0.5.168 (Phase 1) — class-aware primary metric. Each adapter
                // probes with its own RPC dialect (ELA getblockcount, EVM
                // eth_blockNumber, arbiter getspvheight, oracle parent-chain
                // block) via primaryHeight(). Pre-0.5.168 this called
                // getblockcount/getconnectioncount unconditionally, so every
                // non-mainchain chain rendered "—" for height + peers.
                try {
                    const pm = await adapter.primaryHeight(chainCfg);
                    height = pm.height;
                    peers = pm.peers;
                    // Non-A classes carry their own networkHeight/synced (e.g.
                    // EVM eth_syncing). Class A leaves these null here and fills
                    // them from the neighbor walk below.
                    if (pm.networkHeight != null) { networkHeight = pm.networkHeight; }
                    if (typeof pm.synced === 'boolean') { synced = pm.synced; }
                    if (pm.parentBlockHeight != null) { parentBlockHeight = pm.parentBlockHeight; }
                } catch (_) { /* primaryHeight never throws, but stay defensive */ }
            }

            // alpha.14/.15 — synced detection. The truthful signal on
            // ela mainchain is EITHER:
            //   (a) the best block's timestamp is within ~5 min of now
            //       (wallets use this heuristic), OR
            //   (b) our local height equals or exceeds the network's best
            //       height per peers' reported tips (transient "ahead of
            //       peers" by 1 also counts as synced — we just mined or
            //       received a block they haven't propagated yet).
            //
            // alpha.14 only checked (a), which left chains stuck on
            // "syncing" during slow-block periods even when fully caught
            // up. alpha.15 adds (b) by also calling getnodestate for
            // peers' max height.
            //
            // v0.5.168 (Phase 1) — this walk is class-A ONLY: it relies on
            // ela's getbestblockhash + getnodestate Neighbors[] schema, which
            // EVM (EthRpcClient) / arbiter / oracle classes don't serve. Those
            // classes already populated synced + networkHeight from
            // primaryHeight() above, so we gate the walk to class A to avoid
            // wasted failing RPCs. (synced/lastBlockTime/networkHeight/
            // producerState/peerSummary are declared at the top of the handler.)
            if (adapter.chainClass === 'A' && status && status.alive && height != null) {
                try {
                    const rpc = adapter.rpcClient(chainCfg);

                    // Parallel: best-block header (for ageSec) + node-state (for peers' max height).
                    const [bestHashRes, nodeStateRes] = await Promise.allSettled([
                        rpc.getbestblockhash(),
                        rpc.getnodestate(),
                    ]);

                    // (a) Recency check via block timestamp.
                    let recentEnough = false;
                    if (bestHashRes.status === 'fulfilled') {
                        const hash = bestHashRes.value && bestHashRes.value.result
                            ? bestHashRes.value.result : bestHashRes.value;
                        if (typeof hash === 'string' && hash.length > 0) {
                            try {
                                const headerResp = await rpc.getblockheader(hash, 2);
                                const header = headerResp && headerResp.result
                                    ? headerResp.result : headerResp;
                                if (header && typeof header.time === 'number') {
                                    lastBlockTime = header.time;
                                    const ageSec = Math.floor(Date.now() / 1000) - header.time;
                                    recentEnough = (ageSec >= 0 && ageSec <= 5 * 60);
                                }
                            } catch (_) { /* header lookup failed; recencyEnough stays false */ }
                        }
                    }

                    // (b) Network-tip check via peers' max height.
                    // 0.2.0-alpha.7 — also extracts peer-quality fields
                    // (improvement #12). ENM already fetched this data
                    // for the at-tip check; the parity audit flagged that
                    // we throw it away. Latency/version/offset are now
                    // surfaced so the chain card can show a hover panel.
                    let atTipOrAhead = false;
                    if (nodeStateRes.status === 'fulfilled') {
                        const v = nodeStateRes.value;
                        const ns = v && v.result ? v.result : v;
                        const neighbors = ns && Array.isArray(ns.Neighbors) ? ns.Neighbors
                            : ns && Array.isArray(ns.neighbors) ? ns.neighbors : null;
                        if (Array.isArray(neighbors)) {
                            let maxH = null;
                            let latencySum = 0;
                            let latencyCount = 0;
                            const versionCounts = Object.create(null);
                            let maxAbsOffsetMs = 0;
                            // 0.2.0-beta.3.7 — collect per-peer rows for the
                            // chain-card peer popover (phase-03 .peer-pop).
                            // Pre-beta.3.7 the neighbors array was dropped
                            // after aggregation; now we keep a slim summary
                            // (≤ 50 rows) the frontend can render directly.
                            const neighborRows = [];
                            let inboundCount = 0;
                            let outboundCount = 0;
                            for (const n of neighbors) {
                                if (!n || typeof n !== 'object') continue;
                                const h = typeof n.lastblock === 'number' ? n.lastblock
                                        : typeof n.startingheight === 'number' ? n.startingheight
                                        : typeof n.Height === 'number' ? n.Height
                                        : typeof n.height === 'number' ? n.height
                                        : null;
                                if (h != null && (maxH == null || h > maxH)) maxH = h;

                                // Last-ping in microseconds (ela's wire field). Zero or
                                // negative = no pong received; skip from the average.
                                const ping = typeof n.lastpingmicros === 'number' ? n.lastpingmicros
                                           : typeof n.LastPingMicros === 'number' ? n.LastPingMicros
                                           : null;
                                const pingMs = (ping != null && ping > 0) ? Math.round(ping / 1000) : null;
                                if (pingMs != null) {
                                    latencySum += pingMs;
                                    latencyCount += 1;
                                }

                                // Peer NodeVersion / user-agent string. Pre-`getnodestate`
                                // strip the wire user-agent, so this only reads what the
                                // RPC surfaces today — often just the protocol-version
                                // integer (e.g. "20000", "80000"). Still useful for
                                // detecting fleet drift across major protocol bumps.
                                const ver = typeof n.nodeversion === 'string' ? n.nodeversion
                                          : typeof n.NodeVersion === 'string' ? n.NodeVersion
                                          : typeof n.version === 'string' ? n.version
                                          : (typeof n.protocolversion === 'number' ? String(n.protocolversion) : null);
                                if (ver) versionCounts[ver] = (versionCounts[ver] || 0) + 1;

                                // TimeOffset is reported in seconds vs us. Convert to ms
                                // for parity with the latency unit.
                                const offsetSec = typeof n.timeoffset === 'number' ? n.timeoffset
                                                : typeof n.TimeOffset === 'number' ? n.TimeOffset
                                                : null;
                                if (offsetSec != null) {
                                    const abs = Math.abs(offsetSec) * 1000;
                                    if (abs > maxAbsOffsetMs) maxAbsOffsetMs = abs;
                                }

                                // Direction. ela's getnodestate reports a boolean
                                // `inbound` (lowercase). Some legacy wire shapes use
                                // `Inbound`. We default to 'out' on missing field
                                // since outbound is the more common shape after
                                // peer discovery handshake completes.
                                let dir = null;
                                if (typeof n.inbound === 'boolean')      dir = n.inbound ? 'in' : 'out';
                                else if (typeof n.Inbound === 'boolean') dir = n.Inbound ? 'in' : 'out';
                                if (dir === 'in')       inboundCount += 1;
                                else if (dir === 'out') outboundCount += 1;

                                // Address — addrs may be "ipv6:port", "ipv4:port",
                                // a raw IP, or absent. Normalise to a single string.
                                const addr = (typeof n.addr === 'string' && n.addr)        ? n.addr
                                           : (typeof n.Addr === 'string' && n.Addr)        ? n.Addr
                                           : (typeof n.address === 'string' && n.address)  ? n.address
                                           : null;

                                if (neighborRows.length < 50) {
                                    neighborRows.push({
                                        addr,
                                        direction: dir,
                                        height: h,
                                        pingMs,
                                    });
                                }
                            }
                            if (maxH != null) {
                                networkHeight = maxH;
                                atTipOrAhead = (height >= maxH);
                            }
                            // Build peerSummary for the chain-card hover.
                            // 0.2.0-beta.3.7 — now ships per-peer rows
                            // (mock .peer-pop) + computed inbound/outbound
                            // split. Top-3 versions cap kept for the
                            // aggregate path (frontend falls back to it
                            // when neighbors[] is empty or backend hasn't
                            // populated yet).
                            const topVersions = Object.keys(versionCounts)
                                .map((k) => ({ version: k, count: versionCounts[k] }))
                                .sort((a, b) => b.count - a.count)
                                .slice(0, 3);
                            peerSummary = {
                                count: neighbors.length,
                                inbound: inboundCount,
                                outbound: outboundCount,
                                latencyMsAvg: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
                                versions: topVersions,     // [{version, count}, ...]
                                timeOffsetMaxAbsMs: maxAbsOffsetMs > 0 ? Math.round(maxAbsOffsetMs) : null,
                                neighbors: neighborRows,   // [{addr, direction, height, pingMs}, ...]
                            };
                        }
                    }

                    synced = recentEnough || atTipOrAhead;
                } catch (_) { /* synced stays false */ }
            }

            // Producer state — surface it inline so the chain-card subtitle
            // can show "Active" / "Inactive" / "Illegal" (the operator-
            // facing label the chain actually exposes) instead of the
            // generic "Healthy" when a producer is registered. One extra
            // RPC call, only when pubkey is configured.
            const ourPubkey = chainCfg.dpos && chainCfg.dpos.nodePublicKey;
            if (status && status.alive && ourPubkey) {
                try {
                    const rpc = adapter.rpcClient(chainCfg);
                    const pi = await rpc.getproducerinfo(ourPubkey).catch(() => null);
                    if (pi && pi.state) producerState = pi.state;
                    else if (pi && pi.result && pi.result.state) producerState = pi.result.state;
                } catch (_) { /* producer state stays null */ }
            }

            const syncSnapshot = { synced, alive: !!(status && status.alive), lastBlockTime };

            // beta.3.81 — Wave B item ④ phase 1 — diagnostic when the
            // chain claims alive but every downstream RPC returned null.
            // Symptom: operator UI flashes blank widgets (height/peers/
            // networkHeight all "—") even though the chain card claims
            // "Healthy". The Wave B log confirmed this is a startup
            // race: ela process is up but RPC hasn't bound to port
            // 20336 yet within the first ~30s.
            const aliveButBlankRpc = status && status.alive
                && height == null && peers == null && networkHeight == null;
            if (aliveButBlankRpc) {
                extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} chain-status:alive-but-blank-rpc `
                    + `chain=${adapter.chainId} pid=${status.pid} `
                    + `uptimeSec=${uptimeSec} `
                    + `producerState=${producerState} `
                    + `synced=${synced} `
                    + `— treating as state='starting' (RPC bind in progress)`,
                );
            }

            // beta.3.83 — Wave D item ④ phase 2 — startup-race state.
            // When the chain is alive but RPC isn't responsive AND the
            // process is young (uptime < STARTUP_GRACE_SEC), surface
            // 'starting' instead of letting deriveCoarseState return
            // 'syncing' (or 'healthy' if it sees synced=true from a
            // stale snapshot). 'starting' is in CHAIN_STATES + has a
            // dedicated frontend rendering (chain-card.js already
            // handles it as a hero-spinner state).
            //
            // After uptime crosses 60s the blank RPC is no longer a
            // startup race — it's a real stall, and we fall through to
            // deriveCoarseState (which returns 'syncing'), so the
            // operator sees the underlying problem rather than an
            // optimistic 'starting' that never resolves.
            const STARTUP_GRACE_SEC = 60;
            let coarseState;
            if (aliveButBlankRpc
                && typeof uptimeSec === 'number'
                && uptimeSec < STARTUP_GRACE_SEC) {
                coarseState = 'starting';
            } else {
                coarseState = deriveCoarseState(status, chainCfg, syncSnapshot, adapter.chainClass);
            }

            // v0.5.186 (Council Node UX P1.2) — class C oracle real status
            // (parent reachability + parent height + last log activity + last
            // error). Only oracles; null elsewhere so the UI shows "—".
            let oracleInfo = null;
            if (adapter.chainClass === 'C' && typeof adapter.oracleStatus === 'function') {
                oracleInfo = await adapter.oracleStatus(chainCfg).catch(() => null);
            }

            // v0.5.228d (audit F4/F5/F6) — for class B (EVM sidechains)
            // attach the LIVE derived chainState from the on-chain arbiter
            // slate so the dashboard card stops reading the stale
            // cfg.miner.enabled disk value. Adapter.start overrides
            // cfg.miner.enabled in-memory at every spawn but does NOT
            // persist back; without this attachment, GET /chains/:id
            // returned the disk value and the EVM detail card's "Mining
            // on/off" tag could disagree with the live badge in Settings
            // after a Council binding TX confirmed on-chain.
            // Uses the 30s cache so concurrent dashboard polls (one per
            // visible EVM card) don't multiply mainchain RPC hits.
            let derivedRole = null;
            let derivedChainState = null;
            if (adapter.chainClass === 'B') {
                try {
                    const cfg = await ConfigStore.load();
                    derivedRole = await getCachedProducerRole(adapter, cfg);
                    derivedChainState = chainStateFromRole(derivedRole);
                } catch (_) { /* leave derivedRole/derivedChainState null on any error */ }
            }

            // v0.5.229 (Phase D) — for the MAINCHAIN response, also attach
            // CR Committee membership data so the dashboard chain-card's
            // status chip can label a Council operator with their actual
            // Council state ("Council · Elected" / "Council · Inactive")
            // instead of falling through to the BPoS producer.state label
            // (which is null for a pure Council operator). Uses
            // CrMembershipService's 30s internal cache so attaching here is
            // a cheap hashmap lookup once mainchain RPC is warm.
            let crMemberSummary = null;
            if (adapter.chainClass === 'A') {
                try {
                    const cfg = await ConfigStore.load();
                    const CrMembershipService = require('../services/CrMembershipService');
                    const cr = await CrMembershipService.detectCrMembership(cfg, {
                        log: extensionHandle.log,
                    });
                    // Only attach a non-null block when the CR lookup
                    // actually completed (matched OR not-in-committee).
                    // 'error' state → leave null so the chip doesn't
                    // flicker on transient RPC failures.
                    if (cr && cr.source !== 'error') {
                        crMemberSummary = {
                            isCrMember: !!cr.isCrMember,
                            state: cr.state || null,
                            nickname: cr.nickname || null,
                            inNextCommittee: !!cr.inNextCommittee,
                            source: cr.source,
                        };
                    }
                } catch (_) { /* leave crMemberSummary null */ }
            }

            return res.json(successBody({
                chainId: adapter.chainId,
                displayName: adapter.displayName,
                enabled: !!chainCfg.enabled,
                state: coarseState,
                synced,
                lastBlockTime,
                networkHeight,
                producerState,
                pid: status.pid,
                attached: status.attached,
                ports: chainCfg.ports,
                binaryPath: chainCfg.binaryPath,
                binaryVersion: chainCfg.binaryVersion,
                activeNet: chainCfg.activeNet,
                // Operator intent (from setup conversation) — distinct from
                // producer.enabled (registration status). The hero card uses
                // this to label the role correctly even before on-chain
                // registration is complete.
                enableArbiter: !!(chainCfg.dpos && chainCfg.dpos.enableArbiter),
                hasKeystore: !!(chainCfg.dpos && chainCfg.dpos.keystorePasswordEncrypted),
                // Live values — null when chain is dead OR RPC isn't ready
                // yet. Frontend renders null as "—" instead of fabricating.
                height,
                peers,
                uptimeSec,
                // alpha.7 — peer quality (improvement #12). Populated from
                // the same `getnodestate.neighbors` we already walked for
                // the at-tip check; null when chain is dead or RPC missed.
                peerSummary,
                // v0.5.168 (Phase 1) — class C oracle context, surfaced so the
                // oracle card's "Relays for <parent>" row + parent-block metric
                // populate from the live poll (not just the boot-time overview
                // snapshot). null/absent for every non-oracle chain.
                parentChainId: adapter.parentChainId || null,
                parentBlockHeight,
                // v0.5.186 (Council Node UX P1.2) — class C oracle real status,
                // so the Oracle view shows running/parent-reachable/last-activity/
                // last-error instead of almost nothing. null for non-oracles.
                oracle: oracleInfo,
                // v0.5.186 (Council Node UX P1.1) — EVM (class B) miner identity.
                // The geth/EVM account address + the operator's PBFT block-reward
                // address + mining on/off live in cfg.miner (set by
                // EvmSidechainAdapter._ensureEvmAccount + the class-b-config route)
                // but were never returned, so the EVM dashboard structurally could
                // not show the two addresses an operator most wants to verify. Class
                // B only; null elsewhere so the UI renders "—" rather than guessing.
                // The encrypted account password is NEVER included.
                miner: (adapter.chainClass === 'B' && chainCfg.miner) ? {
                    enabled: !!chainCfg.miner.enabled,
                    rewardAddress: chainCfg.miner.rewardAddress || null,
                    evmKeystoreAddr: chainCfg.miner.evmKeystoreAddr || null,
                    // v0.5.228d — derived live state. chainState mirrors
                    // /system/council-status's per-chain.chainState; one
                    // source of truth for both the dashboard EVM card
                    // (which polls /chains/:id) and the Settings badge
                    // (which polls /system/council-status). Null when the
                    // detect call couldn't complete (mainchain RPC down).
                    chainState: derivedChainState,
                    isOnDuty: derivedRole ? !!derivedRole.inCurrent : null,
                    inNextRotation: derivedRole ? !!derivedRole.inNext : null,
                } : null,
                // v0.5.237 — persisted sync mode (full | archive) per EVM
                // sidechain, so the consolidated Sidechain settings tab reads
                // the REAL value instead of assuming 'full' (the frontend's
                // pre-237 fallback). Class B only; null elsewhere. fast is
                // coerced to full at write time (v0.5.235), so a legacy stored
                // 'fast' surfaces as 'full' here too.
                sync: (adapter.chainClass === 'B' && chainCfg.sync) ? {
                    mode: (chainCfg.sync.mode && chainCfg.sync.mode !== 'fast') ? chainCfg.sync.mode : 'full',
                } : null,
                // v0.5.229 (Phase D) — CR Committee membership summary,
                // only attached to the MAINCHAIN response so the chain-
                // card chip can label Council operators correctly. Null
                // for non-mainchain or when the lookup failed. Frontend
                // reads .crMember and falls back to producerState when
                // null (preserves pre-229 behavior for BPoS operators
                // and for mid-warmup RPC failures).
                crMember: crMemberSummary,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} GET /chains/${req.params.chainId}: ${err.message}`);
            return res.status(500).json(errorBody('Failed to read chain state.'));
        }
    });

    // 0.2.0-alpha.7 — DPoS rotation snapshot (improvement #02). Powers the
    // chain-card rotation strip: who's on duty, when does this node's slot
    // come up, where in the slate is this node. The parity audit found
    // node.sh has zero rotation awareness and Monitor's onduty checks are
    // post-hoc email batches, so ENM is genuinely first here.
    //
    // Returns the raw `getarbitersinfo` envelope plus convenience fields
    // computed for ENM's configured nodePublicKey:
    //   ourIndex        — position in currentarbiters[] (-1 if not in slate)
    //   ourNextIndex    — position in nextarbiters[] (-1 if not in next slate)
    //   isOnDuty        — true when the operator's pubkey === ondutyarbiter
    //   rotationLength  — length of currentarbiters[]
    //
    // Read-only, no auth gate beyond readActorWallet, same rate-limit bucket.
    router.get('/:chainId/rotation', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            const cfg = await ConfigStore.load();
            const chainCfg = cfg.chains[adapter.chainId];
            if (!chainCfg) {
                return res.status(404).json(errorBody('Not configured.'));
            }
            const status = ChainRegistry.getProcessService().statusSync(adapter.chainId);
            if (!status || !status.alive) {
                return res.json(successBody({ enabled: false, alive: false }));
            }
            const rpc = adapter.rpcClient(chainCfg);
            const info = await rpc.getarbitersinfo().catch(() => null);
            const a = info && (info.result || info);
            if (!a || typeof a !== 'object') {
                return res.json(successBody({ enabled: false, alive: true }));
            }
            // ela's wire field names are inconsistent across endpoints; accept both
            // camelCase and lower-case variants per the existing precedent on
            // getproducerinfo + getnodestate.
            const onDuty = a.ondutyarbiter || a.onDutyArbiter || null;
            const curStart = (typeof a.currentturnstartheight === 'number')
                ? a.currentturnstartheight
                : (typeof a.currentTurnStartHeight === 'number' ? a.currentTurnStartHeight : null);
            const nextStart = (typeof a.nextturnstartheight === 'number')
                ? a.nextturnstartheight
                : (typeof a.nextTurnStartHeight === 'number' ? a.nextTurnStartHeight : null);
            // v0.5.229 (audit 2026-05-27) — TWO bugs fixed here, same as
            // EvmSidechainAdapter.detectProducerRole:
            //   1. The current-slate field on ELA's getarbitersinfo response
            //      is `arbiters`, NOT `currentarbiters`. The pre-229 reads
            //      (with the camelCase `currentArbiters` defensive fallback)
            //      both targeted fields that don't exist in the chain
            //      response — confirmed against Elastos.ELA struct definition
            //      at servers/interfaces.go:884-892. The rotation strip on
            //      the mainchain card has been broken for every Council
            //      operator since this endpoint shipped.
            //   2. Empty-string entries in the slate (CRC arbiters with
            //      IsNormal=false at servers/interfaces.go:906-912) must
            //      be filtered before .findIndex so a MemberInactive
            //      operator's empty-string slot doesn't match anything.
            const normalize = (s) => (typeof s === 'string' ? s.toLowerCase() : '');
            const current = Array.isArray(a.arbiters)
                ? a.arbiters.map(normalize).filter((s) => s.length > 0)
                : [];
            const next = Array.isArray(a.nextarbiters)
                ? a.nextarbiters.map(normalize).filter((s) => s.length > 0)
                : [];
            const ourPubkey = chainCfg.dpos && chainCfg.dpos.nodePublicKey;
            const ourLower = normalize(ourPubkey);
            const ourIndex = ourLower
                ? current.findIndex((k) => k === ourLower)
                : -1;
            const ourNextIndex = ourLower
                ? next.findIndex((k) => k === ourLower)
                : -1;
            const isOnDuty = !!(ourLower && onDuty && normalize(onDuty) === ourLower);
            return res.json(successBody({
                enabled: true,
                alive: true,
                onDutyArbiter:        onDuty,
                currentTurnStartHeight: curStart,
                nextTurnStartHeight:    nextStart,
                rotationLength:         current.length,
                currentArbiters:        current,
                nextArbiters:           next,
                ourPubkey,
                ourIndex,
                ourNextIndex,
                isOnDuty,
            }));
        } catch (err) {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} GET /chains/${req.params.chainId}/rotation: ${err.message}`,
            );
            return res.status(500).json(errorBody('Failed to read rotation.'));
        }
    });

    // 0.2.0-alpha.1 — chain-card sparkline source. Decimated (≈12 pt)
    // (t, h) series spanning the requested window. The series lives in
    // the in-memory HeightSeriesStore filled by HealthChecker every 30s.
    // Read-only, no host-conflict gate, same rate-limit bucket as
    // other reads. Live updates flow over SSE topic chains:<id>:height.
    router.get('/:chainId/history', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            const reqMin = Number.parseInt(req.query.windowMin, 10);
            const windowMin = Number.isFinite(reqMin)
                ? Math.max(10, Math.min(240, reqMin))
                : 60;
            const store = ChainRegistry.getHeightSeriesStore();
            const points = store.snapshot(adapter.chainId, windowMin * 60_000);
            return res.json(successBody({
                chainId:     adapter.chainId,
                points,
                windowMin,
                cadenceSec:  30,
                sourceTopic: `chains:${adapter.chainId}:height`,
            }));
        } catch (err) {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} GET /chains/${req.params.chainId}/history: ${err.message}`,
            );
            return res.status(500).json(errorBody('Failed to read height history.'));
        }
    });

    // --- mutations: start / stop / restart ---
    router.post('/:chainId/start', limit('write'), requireOwner, async (req, res) => {
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            const cfg = await ConfigStore.load();
            const chainCfg = cfg.chains[adapter.chainId];
            if (!chainCfg) {
                return res.status(409).json(errorBody(
                    `Chain "${adapter.chainId}" is not configured. Complete the setup wizard first.`,
                ));
            }

            // Host conflict scan — refuse to spawn if anything CRITICAL is
            // unresolved (rogue ela process, port already bound, permission
            // denied on data dir). The operator can override by passing
            // ?force=1, which the dashboard surfaces as a guarded checkbox.
            const force = req.query && req.query.force === '1';
            // 0.5.154 — BUG-C4 fix: pass ourPids so the scan EXCLUDES ports
            // held by ENM's OWN running chains. Without this, starting a
            // sidechain (esc/eid/pg/oracle/arbiter) while mainchain is running
            // flagged mainchain's own ela (ports 20333-20339) as 6 CRITICAL
            // PORT_BOUND conflicts → 409 refusal, so no sidechain could be
            // started by hand while mainchain ran (and the Council install's
            // mainchain-first start order guarantees mainchain IS running by
            // the time the sidechains start). HostConflictScanner.js:419 only
            // honours the own-pid exemption when ourPids is non-empty;
            // HealthChecker + Diagnostics already build this set — the start
            // route was the missing twin. statusSync throws ENOENT for stopped
            // chains (no pid file) — caught + skipped.
            const ps = ChainRegistry.getProcessService();
            const ourPids = new Set();
            for (const c of ChainRegistry.listChains()) {
                try {
                    const st = ps.statusSync(c.chainId);
                    if (st && Number.isInteger(st.pid) && st.pid > 0 && st.alive) {
                        ourPids.add(st.pid);
                    }
                } catch (_) { /* stopped chain / no pid file — safe to skip */ }
            }
            const conflicts = await HostConflictScanner.scan({ logger: extensionHandle.log, ourPids });
            const blockers = HostConflictScanner.blockers(conflicts);
            if (blockers.length > 0 && !force) {
                extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} refusing start of ${adapter.chainId} — ${blockers.length} CRITICAL host conflicts`,
                );
                return res.status(409).json({
                    success: false,
                    error: 'Host has unresolved conflicts; refusing to start. Resolve them, or use the Force start option to override.',
                    conflicts,
                });
            }

            const result = await adapter.start(chainCfg);
            // Verify the action took effect — adapter.start may return a
            // pid but the child can die immediately (binary missing,
            // config invalid, port collision after pre-flight). Wait
            // briefly + recheck so the operator gets honest feedback
            // instead of a "started" response on a dead chain.
            await sleep(1500);
            const liveCheck = ChainRegistry.getProcessService().statusSync(adapter.chainId);
            if (!liveCheck.alive) {
                return res.status(500).json(errorBody(
                    'Chain spawned but exited within 1.5s. Check logs (Settings → Show technical details → Logs).',
                ));
            }

            // v0.5.228 — oracle pairing on manual start. If the operator
            // started an EVM sidechain (esc / eid / pg), also start its
            // companion oracle so cross-chain SPV proofs can be relayed.
            // Best-effort: failure to start the oracle does NOT fail the
            // parent's start response — the chain is up, the operator
            // can retry the oracle from the Oracle card. Operator
            // directive 2026-05-27: "they should be started together".
            // We skip the conflict scan for the cascade since the parent
            // already passed it 1.5s ago and the oracle uses a disjoint
            // port set (oracle is a node script, not a chain binary).
            let oraclePaired = null;
            const ChainAdapter = require('../services/ChainAdapter');
            const pairedOracleId = ChainAdapter.oracleOf(adapter.chainId);
            if (pairedOracleId && cfg.chains && cfg.chains[pairedOracleId]) {
                const oracleAdapter = ChainRegistry.getAdapter(pairedOracleId);
                if (oracleAdapter) {
                    try {
                        // Check first — if already running, no-op success.
                        const oracleStatus = ChainRegistry.getProcessService()
                            .statusSync(pairedOracleId);
                        if (oracleStatus && oracleStatus.alive) {
                            oraclePaired = { chainId: pairedOracleId, status: 'already-running' };
                        } else {
                            await oracleAdapter.start(cfg.chains[pairedOracleId]);
                            oraclePaired = { chainId: pairedOracleId, status: 'started' };
                            extensionHandle.log.info(
                                `${ENM_LOG_PREFIX} POST /chains/${adapter.chainId}/start: `
                                + `paired oracle ${pairedOracleId} also started`,
                            );
                        }
                    } catch (oracleErr) {
                        // Don't fail the parent response — surface the oracle
                        // failure as a warning so the UI can prompt a retry.
                        extensionHandle.log.warn(
                            `${ENM_LOG_PREFIX} POST /chains/${adapter.chainId}/start: `
                            + `paired oracle ${pairedOracleId} start failed: ${oracleErr.message}`,
                        );
                        oraclePaired = {
                            chainId: pairedOracleId,
                            status: 'start-failed',
                            error: oracleErr.message,
                        };
                    }
                }
            }

            return res.json(successBody({
                ...result,
                // Surface non-blocking conflicts so the dashboard can show a
                // banner ("legacy node.sh data nearby") without aborting.
                warnings: conflicts.filter((c) => c.severity !== 'CRITICAL'),
                // v0.5.228 — oracle pairing outcome (null when no oracle
                // applies; { chainId, status } when a cascade was attempted).
                oraclePaired,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} POST /chains/${req.params.chainId}/start: ${err.message}`);
            return res.status(500).json(errorBody('Could not start the chain. Try again.'));
        }
    });

    router.post('/:chainId/stop', limit('write'), requireOwner, async (req, res) => {
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            const result = await adapter.stop();
            // Verify the chain actually stopped. Some failure modes (kill
            // signal queued, child unresponsive) will return success from
            // adapter.stop but leave the process alive.
            await sleep(800);
            const liveCheck = ChainRegistry.getProcessService().statusSync(adapter.chainId);
            if (liveCheck.alive) {
                return res.status(500).json(errorBody(
                    'Stop command issued but chain is still alive. May be hung — try Restart, or kill the PID manually.',
                ));
            }
            return res.json(successBody(result));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} POST /chains/${req.params.chainId}/stop: ${err.message}`);
            return res.status(500).json(errorBody('Could not stop the chain. Try again.'));
        }
    });

    router.post('/:chainId/restart', limit('write'), requireOwner, async (req, res) => {
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            const cfg = await ConfigStore.load();
            const chainCfg = cfg.chains[adapter.chainId];
            if (!chainCfg) {
                return res.status(409).json(errorBody(
                    `Chain "${adapter.chainId}" is not configured.`,
                ));
            }

            // 0.2.0-alpha.4 — host-conflict scan removed from /restart.
            // The earlier "same gate as /start" copy-paste was wrong: the
            // chain is RUNNING here, holding ports 20333-20339, so the
            // scan trips PORT_BOUND CRITICAL on the chain's own ports
            // and refuses every restart. The promised "exclude our own
            // managed PIDs" filter in the prior comment was never
            // implemented. /restart's adapter.restart() stops the old
            // process and starts a new one — if a real external conflict
            // grabs a port between stop and start (rare race), the chain
            // surfaces it as a bind error in the chain log, which the
            // operator can see via the Logs tab.
            const result = await adapter.restart(chainCfg);
            return res.json(successBody(result));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} POST /chains/${req.params.chainId}/restart: ${err.message}`);
            return res.status(500).json(errorBody('Could not restart the chain. Try again.'));
        }
    });

    // --- read-only RPC proxies (auth required, no owner-only restriction) ---
    router.get('/:chainId/version', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            const cfg = await ConfigStore.load();
            const chainCfg = cfg.chains[adapter.chainId];
            if (!chainCfg) {
                return res.status(404).json(errorBody('Not configured.'));
            }
            return res.json(successBody({
                binaryPath: chainCfg.binaryPath,
                binaryVersion: chainCfg.binaryVersion,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} GET /chains/${req.params.chainId}/version: ${err.message}`);
            return res.status(500).json(errorBody('Failed to read binary version.'));
        }
    });

    router.get('/:chainId/peers', limit('read'), wrapRpc('peers',
        async (rpc) => ({ nodestate: await rpc.getnodestate() }),
        extensionHandle,
    ));

    router.get('/:chainId/height', limit('read'), wrapRpc('height',
        async (rpc) => ({ blockcount: await rpc.getblockcount() }),
        extensionHandle,
    ));

    router.get('/:chainId/info', limit('read'), wrapRpc('info',
        async (rpc) => {
            const [info, mining] = await Promise.all([rpc.getinfo(), rpc.getmininginfo()]);
            return { info, mining };
        },
        extensionHandle,
    ));

    // Live sync progress for the dashboard's progress bar.
    //
    // Reads from SyncTracker — populated by HealthChecker's medium tick at
    // 30s cadence. The tracker computes velocity (blocks per minute) from a
    // rolling 30-min window of (ts, height) samples and ETA-to-fully-synced
    // from velocity + (networkBest - localHeight).
    //
    // Returns a structured snapshot:
    //   { localHeight, networkHeight, blocksBehind, percent, velocityBpm,
    //     etaSec, sampleCount, windowMinutes, lastSampleAt, stale }
    //
    // Frontend polls this every 10s when state==='syncing' (vs 60s when
    // healthy) so the bar updates smoothly without burning request budget.
    router.get('/:chainId/sync', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            // Every other handler in this file loads cfg up front. Keep that
            // pattern here — the live-RPC enrichment block below references
            // cfg.chains[adapter.chainId] and used to throw silently when this
            // line was missing, leaving networkHeight / peers / lastBlockTime
            // permanently null even though the chain was healthy.
            const cfg = await ConfigStore.load();
            let snapshot;
            try {
                snapshot = ChainRegistry.getSyncTracker().syncSnapshot(adapter.chainId);
            } catch (err) {
                // Tracker not yet initialized (boot race). Return an empty
                // snapshot so the UI can show "—" rather than 500.
                return res.json(successBody({
                    localHeight: null,
                    networkHeight: null,
                    blocksBehind: null,
                    percent: null,
                    velocityBpm: null,
                    etaSec: null,
                    sampleCount: 0,
                    windowMinutes: null,
                    lastSampleAt: null,
                    stale: true,
                }));
            }
            // Enrich the snapshot with two reliable signals SyncTracker
            // doesn't currently surface:
            //
            //   networkHeight — peers report their tip height in
            //                   getpeerinfo[*].height. Max of those is a
            //                   far better network reference than guessing
            //                   from local-height drift. Available within
            //                   ~30s of chain start (handshake completion).
            //
            //   lastBlockTime — the latest local block's timestamp. If it's
            //                   within 5 min of now, the chain is fully
            //                   synced regardless of what peers report.
            //                   This is what wallets use to determine
            //                   "synced" and works even with 0 peers.
            //
            //   synced        — derived: lastBlockTime within 5 min of now,
            //                   OR blocksBehind === 0 with networkHeight
            //                   known.
            try {
                const status = ChainRegistry.getProcessService().statusSync(adapter.chainId);
                snapshot.alive = !!(status && status.alive);
                snapshot.uptimeSec = null;
                snapshot.synced = false;
                snapshot.lastBlockTime = null;
                snapshot.peers = null;

                if (!snapshot.alive) {
                    // Chain not running — null any zombie buffer fields and
                    // mark stale. UI hides the panel entirely.
                    snapshot.velocityBpm = null;
                    snapshot.etaSec = null;
                    snapshot.percent = null;
                    snapshot.networkHeight = null;
                    snapshot.stale = true;
                } else {
                    // Live chain — pull the truthful signals over RPC.
                    //
                    // ela exposes peer info via `getnodestate` (returns
                    // .Neighbors[]), NOT via `getpeerinfo` (Bitcoin-style
                    // method that ela rejects). The earlier handler used
                    // `getpeerinfo` and four parallel RPC calls — three
                    // of them failed, leaving networkHeight + peers + the
                    // synced check all null. This rewrite uses the same
                    // proven shape HealthChecker uses: just two RPC calls,
                    // peers + max-height both parsed from Neighbors.
                    const cfgChain = cfg.chains[adapter.chainId];
                    // v0.5.168 (Phase 1) — the ela getblockcount/getnodestate/
                    // getbestblockhash enrichment below is class-A only. Non-A
                    // classes get their localHeight/peers/networkHeight/synced
                    // from the class-aware primaryHeight() else-branch instead.
                    if (cfgChain && adapter.chainClass === 'A') {
                        try {
                            const rpc = adapter.rpcClient(cfgChain);
                            const [blockCount, nodeStateRes] = await Promise.allSettled([
                                rpc.getblockcount(),
                                rpc.getnodestate(),
                            ]);

                            // ALWAYS prefer fresh RPC value for the displayed
                            // localHeight. SyncTracker holds a HISTORY of
                            // samples used to compute velocity / ETA — it
                            // is not the source of truth for "how many
                            // blocks do I have right now."
                            if (blockCount.status === 'fulfilled') {
                                const v = blockCount.value;
                                const h = (typeof v === 'number') ? v : (v && v.result);
                                if (typeof h === 'number') { snapshot.localHeight = h; }
                            }

                            // Parse getnodestate: peer count + peer max
                            // height come from the same Neighbors array.
                            // Defensive: ela's schema uses capital N
                            // (.Neighbors) but lowercase appears in some
                            // versions; same for height/Height/lastHeight.
                            if (nodeStateRes.status === 'fulfilled') {
                                const v = nodeStateRes.value;
                                const ns = v && v.result ? v.result : v;
                                const neighbors = ns && Array.isArray(ns.Neighbors) ? ns.Neighbors
                                    : ns && Array.isArray(ns.neighbors) ? ns.neighbors
                                    : null;
                                if (Array.isArray(neighbors)) {
                                    snapshot.peers = neighbors.length;
                                    let maxH = null;
                                    for (const n of neighbors) {
                                        if (!n || typeof n !== 'object') continue;
                                        // ela's neighbor schema (verified via direct RPC call
                                        // 2026-05-07) uses `lastblock` for the peer's current
                                        // best height. `startingheight` is what the peer had
                                        // at handshake (older). Bitcoin-style Height/height
                                        // fields are also accepted in case the schema gets
                                        // a normalisation pass upstream.
                                        const h = typeof n.lastblock === 'number' ? n.lastblock
                                                : typeof n.startingheight === 'number' ? n.startingheight
                                                : typeof n.Height === 'number' ? n.Height
                                                : typeof n.height === 'number' ? n.height
                                                : typeof n.lastHeight === 'number' ? n.lastHeight
                                                : null;
                                        if (h != null && (maxH == null || h > maxH)) maxH = h;
                                    }
                                    if (maxH != null) snapshot.networkHeight = maxH;
                                }
                            }

                            // lastBlockTime → "synced" detection. Best-block
                            // hash + header gives us the block's timestamp;
                            // if it's within ~5 min of now, the chain is
                            // caught up regardless of peer reports. Sequenced
                            // (not in the parallel batch) so the chained
                            // getblockheader doesn't compete for the RPC
                            // pool with the two main calls above.
                            try {
                                const bestHashResp = await rpc.getbestblockhash();
                                const hash = bestHashResp && bestHashResp.result
                                    ? bestHashResp.result : bestHashResp;
                                if (typeof hash === 'string' && hash.length > 0) {
                                    try {
                                        const headerResp = await rpc.getblockheader(hash, 2);
                                        const header = headerResp && headerResp.result
                                            ? headerResp.result : headerResp;
                                        if (header && typeof header.time === 'number') {
                                            snapshot.lastBlockTime = header.time;
                                            const ageSec = Math.floor(Date.now() / 1000) - header.time;
                                            // alpha.15 — synced = (recent block) OR (at/ahead of network).
                                            // Either condition alone is sufficient. Without the second
                                            // arm, a slow-block period (network calm) leaves a
                                            // fully-caught-up node stuck on "syncing" even when
                                            // localHeight >= networkHeight.
                                            const recentEnough = (ageSec >= 0 && ageSec <= 5 * 60);
                                            const atTipOrAhead = (snapshot.networkHeight != null
                                                && snapshot.localHeight != null
                                                && snapshot.localHeight >= snapshot.networkHeight);
                                            snapshot.synced = recentEnough || atTipOrAhead;
                                        }
                                    } catch (_) { /* getblockheader may fail on early boot */ }
                                }
                            } catch (_) { /* getbestblockhash failed — lastBlockTime stays null, synced stays false */ }
                        } catch (_) { /* RPC failed entirely; leave snapshot as-is */ }
                    } else if (cfgChain) {
                        // v0.5.168 (Phase 1) — non-mainchain classes: pull the
                        // class-correct localHeight / peers / networkHeight /
                        // synced from primaryHeight() (EVM eth_blockNumber +
                        // eth_syncing; arbiter getspvheight). The recompute
                        // block below then derives percent/blocksBehind/ETA the
                        // same way as for class A.
                        try {
                            const pm = await adapter.primaryHeight(cfgChain);
                            if (pm.height != null) { snapshot.localHeight = pm.height; }
                            if (pm.peers != null) { snapshot.peers = pm.peers; }
                            if (pm.networkHeight != null) { snapshot.networkHeight = pm.networkHeight; }
                            if (typeof pm.synced === 'boolean') { snapshot.synced = pm.synced; }
                        } catch (_) { /* leave snapshot as-is */ }
                    }

                    // Recompute progress now that we may have a fresh
                    // networkHeight — SyncTracker computed an early one
                    // with a possibly null reference.
                    if (snapshot.networkHeight != null && snapshot.localHeight != null) {
                        snapshot.blocksBehind = Math.max(0, snapshot.networkHeight - snapshot.localHeight);
                        const denom = Math.max(snapshot.networkHeight, 1);
                        snapshot.percent = Math.max(0, Math.min(100,
                            (snapshot.localHeight / denom) * 100));
                    }
                    // Synced overrides everything else — even if we can't
                    // resolve networkHeight, a fresh block timestamp says
                    // we're caught up.
                    if (snapshot.synced) {
                        snapshot.percent = 100;
                        snapshot.blocksBehind = 0;
                        snapshot.etaSec = 0;
                        // velocity isn't meaningful when synced (no catch-up)
                        snapshot.velocityBpm = null;
                    } else if (snapshot.networkHeight == null) {
                        // Live chain, peers may exist, but we can't compute
                        // a meaningful velocity yet. Suppress so the UI
                        // doesn't show stale numbers.
                        snapshot.velocityBpm = null;
                        snapshot.etaSec = null;
                    }

                    // Uptime for the freshly-started banner the UI shows.
                    try {
                        const m = JSON.parse(
                            require('fs').readFileSync(
                                require('../services/processUtils').metaFilePath(adapter.chainId), 'utf8',
                            ),
                        );
                        if (m && typeof m.startedAt === 'number') {
                            snapshot.uptimeSec = Math.max(0, Math.floor((Date.now() - m.startedAt) / 1000));
                        }
                    } catch (_) { /* meta missing */ }
                }
            } catch (_) { /* status read failed; leave snapshot as-is */ }

            return res.json(successBody(snapshot));
        } catch (err) {
            extensionHandle.log.debug(
                `${ENM_LOG_PREFIX} GET /chains/${req.params.chainId}/sync: ${err.message}`,
            );
            return res.status(500).json(errorBody('Failed to read sync status.'));
        }
    });

    // BPoS-specific listing — full producer set + height. Useful for an
    // operator browsing the supernode roster from the dashboard.
    router.get('/:chainId/dpos', limit('read'), wrapRpc('dpos',
        async (rpc) => {
            const [producers, height] = await Promise.all([
                rpc.listproducers({ start: 0, limit: -1, state: 'all' }),
                rpc.getblockcount(),
            ]);
            return { producers, height };
        },
        extensionHandle,
    ));

    // BPoS — single-producer focused. Returns our specific producer's state +
    // votes + inactiveheight + computed inactiveRounds. F12 surfaces this on
    // the chain-card; the operator sees their own stats without scanning the
    // full producer list.
    router.get('/:chainId/producer', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            const cfg = await ConfigStore.load();
            const chainCfg = cfg.chains[adapter.chainId];
            if (!chainCfg) {
                return res.status(404).json(errorBody('Not configured.'));
            }
            const ourPubkey = chainCfg.dpos && chainCfg.dpos.nodePublicKey;
            if (!ourPubkey) {
                return res.json(successBody({ enabled: false }));
            }
            const rpc = adapter.rpcClient(chainCfg);
            // 0.2.0-beta.3.8 — add deposit + rewards calls alongside the
            // existing info+producerinfo pair. ela's RPC names:
            //   getdepositcoin(producerPubkey) → { available, deducted, ... }
            //     where amounts are decimal-string ELA. Pre-DPoSv2 deployments
            //     used the owner key; DPoSv2 split-key uses the node pubkey.
            //     We try the node pubkey first (mirrors what ENM registered
            //     with); if the chain rejects, we fall back to owner.
            //   getdposrewards(ownerPubkey) → [{ height, total, ... }] of
            //     reward entries. We sum the last N entries for a rough
            //     "round earnings" figure. Best-effort: not every fork of
            //     ela exposes this RPC; null on failure.
            // Both calls are .catch(() => null) so a missing or failing
            // method doesn't break the existing /producer response shape.
            const ownerPubkey = (chainCfg.dpos && chainCfg.dpos.ownerPublicKey) || ourPubkey;
            const [info, producerInfo, depositInfo, rewardsInfo] = await Promise.all([
                rpc.getinfo().catch(() => null),
                rpc.getproducerinfo(ourPubkey).catch(() => null),
                rpc.getdepositcoin(ourPubkey).catch(() => {
                    // Some forks of ela take owner pubkey in this slot. Try it.
                    if (ownerPubkey && ownerPubkey !== ourPubkey) {
                        return rpc.getdepositcoin(ownerPubkey).catch(() => null);
                    }
                    return null;
                }),
                // 0.5.151 QA Session 151 — getdposrewards does NOT exist on
                // EnmRpcClient (EnmRpcClient.js:244 — the real method is
                // dposv2rewardinfo, address-keyed; the node signing address
                // has no rewards bookkeeping anyway). The old call evaluated
                // `undefined(ownerPubkey)` which threw a SYNCHRONOUS TypeError
                // BEFORE the `.catch()` could run — bypassing the per-call
                // guard and 500-ing the entire GET /chains/:id/producer
                // endpoint (caught only by the outer try → "Failed to read
                // producer state."). Found via QA campaign R1 read-sweep.
                // Resolve null so rewardsInfo stays null and recentRewardsEla
                // renders "—" (the honest value — BPoS rewards accrue to the
                // owner stake address in Essentials, not this node key).
                Promise.resolve(null),
            ]);
            const currentHeight = info && (
                typeof info.height === 'number' ? info.height
              : typeof info.blocks === 'number' ? info.blocks
              : null
            );
            const inactiveHeight = producerInfo && typeof producerInfo.inactiveheight === 'number'
                ? producerInfo.inactiveheight : null;
            const inactiveRounds = (currentHeight != null && inactiveHeight != null)
                ? (currentHeight - inactiveHeight) : null;
            // 0.2.0-alpha.6 — wallet ↔ on-chain binding check (improvement #18).
            // Surface the owner + node pubkeys the chain reports for ENM's
            // configured nodePublicKey, plus a derived `binding` status the UI
            // can chip. The parity audit found node.sh:1642 silently passes
            // node pubkey under owner slot to `getdepositcoin` — wrong for any
            // DPoSV2 split-key producer. ENM exposes both keys so the operator
            // can eyeball-match against what they registered from in Essentials.
            //
            // Deposit-address derivation (the §2 base58 dance with the
            // decimal-string-of-bigint quirk) is deferred to alpha.7 once we
            // have golden vectors round-tripped against the chain.
            const chainNodePubkey  = producerInfo && (producerInfo.nodepublickey  || producerInfo.NodePublicKey);
            const chainOwnerPubkey = producerInfo && (producerInfo.ownerpublickey || producerInfo.OwnerPublicKey);
            let binding;
            if (!producerInfo) {
                binding = 'unregistered';
            } else if (chainNodePubkey && ourPubkey
                    && chainNodePubkey.toLowerCase() !== ourPubkey.toLowerCase()) {
                // Defensive — should be impossible (we queried by ourPubkey),
                // but if some normalization happens we'd want to know.
                binding = 'mismatch';
            } else {
                binding = 'bound';
            }
            // 0.2.0-beta.3.8 — deposit + rewards extraction.
            // depositInfo from getdepositcoin is an envelope:
            //   { available: "5000.00000000", deducted: "0", assets: "...", ... }
            // We expose `depositLockedEla` (the `available` field — the still-
            // locked stake) and let the operator-facing chip show "5,000 ELA"
            // per phase-03 mock. Fields are decimal strings ELA; we keep
            // them as strings to avoid float precision loss on big stakes.
            let depositLockedEla = null;
            if (depositInfo && typeof depositInfo === 'object') {
                if (typeof depositInfo.available === 'string')      { depositLockedEla = depositInfo.available; }
                else if (typeof depositInfo.deposit === 'string')   { depositLockedEla = depositInfo.deposit; }
                else if (typeof depositInfo.assets === 'string')    { depositLockedEla = depositInfo.assets; }
            }
            // Rewards: getdposrewards returns an array of {height, total}
            // entries (per-round totals). We sum the last 24 entries as
            // an aggregate "recent rounds" figure for the active-card
            // stat. Best-effort; not every fork exposes this.
            let recentRewardsEla = null;
            if (Array.isArray(rewardsInfo) && rewardsInfo.length > 0) {
                let sum = 0;
                const recent = rewardsInfo.slice(-24);
                for (const r of recent) {
                    const v = r && (
                        typeof r.total === 'number' ? r.total
                      : typeof r.total === 'string' ? Number(r.total)
                      : null
                    );
                    if (v != null && isFinite(v)) { sum += v; }
                }
                if (sum > 0) {
                    // Round to 4 decimals — ELA reward amounts are typically
                    // small fractions like 0.0123 per block; 4 dp keeps the
                    // operator-facing display readable.
                    recentRewardsEla = sum.toFixed(4);
                }
            }
            return res.json(successBody({
                enabled: true,
                ourPubkey,
                state: producerInfo && producerInfo.state,
                votes: producerInfo && producerInfo.votes,
                dposv2votes: producerInfo && producerInfo.dposv2votes,
                rank: producerInfo && producerInfo.index,
                inactiveHeight,
                inactiveRounds,
                currentHeight,
                // 0.2.0-beta.3.8 — additional stats for the BPoS active
                // card grid (phase-03 mock variant C). Both fields are
                // null when the RPC method isn't supported, returns an
                // empty/malformed payload, or the chain hasn't accrued
                // any rewards yet. The frontend renders "—" in that case.
                depositLockedEla,         // string ELA, e.g. "5000.00000000"
                recentRewardsEla,         // string ELA, sum of last ~24 reward entries
                // alpha.6 — binding check fields
                chainNodePubkey,
                chainOwnerPubkey,
                binding,
            }));
        } catch (err) {
            const status = err && err.name === 'RpcUnreachableError' ? 503 : 500;
            extensionHandle.log.debug(
                `${ENM_LOG_PREFIX} GET /chains/${req.params.chainId}/producer failed: ${err.message}`,
            );
            const responseMessage = status === 503
                ? 'Chain RPC is unreachable. Is the chain running?'
                : 'Failed to read producer state.';
            return res.status(status).json(errorBody(responseMessage));
        }
    });

    // GET /:chainId/diagnose
    // Walk every subsystem (config → binary → host conflicts → process →
    // stale PID → leveldb LOCK → RPC → peers → sync → disk) and return a
    // structured findings array the dashboard renders as an "exactly what's
    // wrong" report.
    router.get('/:chainId/diagnose', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            const cfg = await ConfigStore.load();
            const chainCfg = cfg.chains && cfg.chains[adapter.chainId];
            const report = await Diagnostics.runFullDiagnose({
                chainId: adapter.chainId,
                chainConfig: chainCfg || null,
                processService: ChainRegistry.getProcessService(),
                adapter,
                syncTracker: (() => { try { return ChainRegistry.getSyncTracker(); } catch { return null; } })(),
                logger: extensionHandle.log,
            });
            return res.json(successBody(report));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} GET /chains/${req.params.chainId}/diagnose: ${err.message}`);
            return res.status(500).json(errorBody('Diagnosis failed. Try again.'));
        }
    });

    // POST /:chainId/auto-fix?action=<key>
    // Whitelisted, idempotent remediations the operator can trigger from the
    // diagnose UI. Each action maps to a single safe step — never anything
    // that touches live keys or rewrites chain data.
    router.post('/:chainId/auto-fix', limit('admin'), requireOwner, async (req, res) => {
        const action = (req.query && typeof req.query.action === 'string') ? req.query.action : '';
        if (!Object.values(Diagnostics.AUTO_FIX_ACTIONS).includes(action)) {
            return res.status(400).json(errorBody(`Unknown auto-fix action "${action}".`));
        }
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            // beta.3.59 — chain-rollback takes a `height` query param. Hoisted
            // into runAutoFix via the third options arg so the existing
            // narrow-action contract isn't disrupted for the other actions.
            const opts = { query: req.query || {} };
            const result = await runAutoFix(action, adapter, extensionHandle, opts);
            return res.json(successBody({ action, ...result }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} POST /chains/${req.params.chainId}/auto-fix: ${err.message}`);
            // beta.3.53 — classify known precondition failures as 409 Conflict
            // instead of a misleading 500. These are operator-correctable
            // states (chain is alive when we'd need it stopped; no backup to
            // restore; etc.) — they aren't internal-server errors. 500 stays
            // the default for genuinely-unexpected failures.
            const statusCode = classifyAutoFixError(err);
            // 409 preconditions ("chain is running, stop it first", "no
            // backup to restore", etc.) are operator-correctable — keep
            // the err.message there. 500 is unhandled / unexpected;
            // static fallback per Sessions 64/67 template.
            const responseMessage = statusCode === 500
                ? 'Auto-fix failed. Try again, or report this if it persists.'
                : err.message;
            return res.status(statusCode).json(errorBody(responseMessage));
        }
    });

    // POST /:chainId/compact-logs
    // Manually trigger a log rotation pass. Same routine that runs daily —
    // exposed for the operator's "free space now" button in Settings.
    router.post('/:chainId/compact-logs', limit('admin'), requireOwner, async (req, res) => {
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            const cfg = await ConfigStore.load();
            const opts = (cfg.global && cfg.global.logRotation) || {};
            const report = await LogCompactor.compactNow({
                chainId: adapter.chainId,
                gzipAfterDays: opts.gzipAfterDays,
                purgeAfterDays: opts.purgeAfterDays,
                logger: extensionHandle.log,
            });
            return res.json(successBody(report));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} POST /chains/${req.params.chainId}/compact-logs: ${err.message}`);
            return res.status(500).json(errorBody('Could not compact logs. Try again.'));
        }
    });

    // Re-download the latest binary in place. Mirrors node.sh's
    // `ela_update` (build/skeleton/node.sh:1173). Caller decides whether
    // to stop/start the chain around it; this route just kicks off the
    // download. Progress flows on the existing SSE topic
    // `setup:install:<chainId>` so the wizard's progress UI works here too.
    router.post('/:chainId/update', limit('admin'), requireOwner, async (req, res) => {
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            // P1 (v0.5.183) — hold the per-chain lock across the alive-check +
            // binary swap. Without it, a concurrent /start or a HealthChecker
            // auto-start between statusSync() and downloader.start() could open
            // the binary while we replace it on disk (TOCTOU → corrupt swap).
            // This handler does not call adapter.start/stop/restart, so the
            // non-reentrant lock cannot deadlock.
            const update = await withChainLock(adapter.chainId, async () => {
                // Gate: require chain to be stopped before re-downloading the
                // binary. Replacing a binary while ela has it open is unsafe
                // (file descriptor caching, partial reads, signed-section
                // mismatches) — the operator's flow should be Stop → Update
                // → Start. Front end can still bypass by stopping first.
                const status = ChainRegistry.getProcessService().statusSync(adapter.chainId);
                if (status && status.alive) {
                    return { conflict: true };
                }
                const downloader = ChainRegistry.getBinaryDownloader();
                if (!downloader) {
                    return { unavailable: true };
                }
                return { result: await downloader.start(adapter.chainId) };
            });
            if (update.conflict) {
                return res.status(409).json(errorBody(
                    'Stop the chain before updating the binary. Click Stop on the chain card, wait for the badge to change to "Stopped", then run Update again.',
                ));
            }
            if (update.unavailable) {
                return res.status(503).json(errorBody('Binary downloader is not available.'));
            }
            return res.json(successBody({
                alreadyRunning: update.result.alreadyRunning,
                status: update.result.status,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} POST /chains/${req.params.chainId}/update: ${err.message}`);
            // 0.5.88 — surface EnmBinaryDownloader's operator-meaningful
            // err.codes verbatim (Sessions 64/67/79 sanitization was too
            // aggressive — see Session 87 backlog flag). For unknown
            // errors keep the static fallback.
            const BINARY_CODES = new Set(['UNSUPPORTED_ARCH', 'BINARY_MISSING', 'SMOKE_TEST_FAILED']);
            const responseMessage = BINARY_CODES.has(err && err.code)
                ? err.message
                : 'Could not start the binary update. Try again.';
            return res.status(500).json(errorBody(responseMessage));
        }
    });

    // ------------------------------------------------------------------
    // Bootstrap (alpha.10) — fetch the official Elastos chain-data snapshot
    // and apply it to the chain's data dir, replacing genesis-sync (1–3 days)
    // with snapshot-download (~15 min). Pure operator-facing acceleration —
    // the chain still verifies blocks as it catches up the tail.
    //
    // Routes:
    //   POST /:chainId/bootstrap         start a bootstrap run (owner-only)
    //   GET  /:chainId/bootstrap         current status snapshot
    //   DELETE /:chainId/bootstrap       best-effort cancel (mid-download only)
    //
    // Progress streams on SSE topic `setup:bootstrap:<chainId>` (mirrors the
    // existing `setup:install:<chainId>` topic the binary downloader uses).
    // ------------------------------------------------------------------
    router.post('/:chainId/bootstrap', limit('admin'), requireOwner, async (req, res) => {
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            // P1 (v0.5.183) — hold the per-chain lock across the alive-check +
            // snapshot apply. Without it, a concurrent /start or a HealthChecker
            // auto-start between statusSync() and downloader.start() could open
            // the data dir while we overwrite it (TOCTOU → corrupt data dir).
            // This handler does not call adapter.start/stop/restart, so the
            // non-reentrant lock cannot deadlock.
            const boot = await withChainLock(adapter.chainId, async () => {
                // Same gate as /update — applying a snapshot while ela holds the
                // data dir open would corrupt the chain. Operator stops first.
                const status = ChainRegistry.getProcessService().statusSync(adapter.chainId);
                if (status && status.alive) {
                    return { conflict: true };
                }
                const downloader = ChainRegistry.getBootstrapDownloader();
                if (!downloader) {
                    return { unavailable: true };
                }
                return { result: await downloader.start(adapter.chainId) };
            });
            if (boot.conflict) {
                return res.status(409).json(errorBody(
                    'Stop the chain before bootstrapping. Click Stop on the chain card, wait for the badge to change to "Stopped", then run Bootstrap again.',
                ));
            }
            if (boot.unavailable) {
                return res.status(503).json(errorBody('Bootstrap downloader is not available.'));
            }
            return res.json(successBody({
                alreadyRunning: boot.result.alreadyRunning,
                status: boot.result.status,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} POST /chains/${req.params.chainId}/bootstrap: ${err.message}`);
            // 412 if it's a disk-space preflight failure — operator-actionable.
            const isPreflight = /insufficient disk|disk space|free, you have/i.test(err.message);
            // 412 preflight strings are operator-actionable ("Insufficient
            // disk: 5 GB free, you have only 2 GB") — keep err.message
            // there. 500 fallback is dev-jargon; static per Sessions 64/67.
            const responseMessage = isPreflight
                ? err.message
                : 'Could not start the bootstrap. Try again.';
            return res.status(isPreflight ? 412 : 500).json(errorBody(responseMessage));
        }
    });

    router.get('/:chainId/bootstrap', limit('read'), async (req, res) => {
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            const downloader = ChainRegistry.getBootstrapDownloader();
            return res.json(successBody({ status: downloader.getStatus(adapter.chainId) }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} GET /chains/${req.params.chainId}/bootstrap: ${err.message}`);
            return res.status(500).json(errorBody('Failed to read bootstrap status.'));
        }
    });

    router.delete('/:chainId/bootstrap', limit('admin'), requireOwner, async (req, res) => {
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            const downloader = ChainRegistry.getBootstrapDownloader();
            const result = downloader.cancel(adapter.chainId);
            return res.json(successBody(result));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} DELETE /chains/${req.params.chainId}/bootstrap: ${err.message}`);
            return res.status(500).json(errorBody('Could not cancel the bootstrap. Try again.'));
        }
    });

    // ela_activate_bpos — bring an Inactive producer back to Active.
    // The keystore + password live on this server (server-side signing
    // is allowed; only browser-wallet signing is forbidden per
    // Architectural Invariant #2).
    router.post('/:chainId/bpos/activate', limit('admin'), requireOwner, async (req, res) => {
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            const chainId = adapter.chainId;
            // beta.3.88 — Wave M1.4 — per-class endpoint gate. BPoS
            // operations (ActivateProducer + future producer-management
            // routes) are Class A only. Pre-3.88 returned 400 on
            // non-mainchain; 501 ("Not Implemented") is the semantically
            // correct status for a request that's well-formed but maps
            // to a feature the target resource doesn't expose. This
            // helps clients distinguish "bad input" from "feature
            // unavailable for this chain class".
            if (adapter.chainClass !== 'A') {
                return res.status(501).json(errorBody(
                    `BPoS lifecycle is defined only for Class A (UTXO/DPoS) chains. `
                    + `'${chainId}' is class ${adapter.chainClass || 'unknown'} — operation not implemented.`,
                ));
            }
            // P1 (v0.5.183) — in-flight guard. Concurrent activates for the same
            // chain race on shared temp files in the chain dir; reject the second
            // with 409. Released in the finally below.
            if (activateInFlight.has(chainId)) {
                return res.status(409).json(errorBody(
                    'A reactivation is already in progress for this chain.',
                ));
            }
            activateInFlight.add(chainId);
            try {
            const snapshot = await ChainState.snapshot(chainId);
            if (!snapshot.cliPath) {
                return res.status(400).json(errorBody(
                    'ela-cli not yet installed. Open Settings → Show technical details → Status and click Update binary first.',
                ));
            }
            if (!snapshot.keystorePresent) {
                return res.status(400).json(errorBody(
                    'No keystore on disk — generate one via the setup wizard first.',
                ));
            }
            // Gate: chain must be alive AND fully synced before submitting
            // an activate transaction. An unsynced node has stale producer
            // state, and the chain may reject the tx with code 43001.
            const procStatus = ChainRegistry.getProcessService().statusSync(chainId);
            if (!procStatus || !procStatus.alive) {
                return res.status(409).json(errorBody(
                    'Chain must be running before reactivating. Start the chain and wait for it to fully sync first.',
                ));
            }
            // P0-1 (v0.5.178) — load config HERE, before the sync-gate RPC probe.
            // Both the probe and the keystore-password lookup below reference it; it
            // was previously declared AFTER this try block → temporal-dead-zone
            // ReferenceError → every activate threw and 500'd ("Producer
            // reactivation failed"). ActivateProducer was 100% broken.
            const cfg = await ConfigStore.load();
            const chainCfg = cfg.chains && cfg.chains[chainId];
            try {
                // P0-1b (v0.5.179) — staleness gate using methods THIS ela build
                // actually serves. The old probe used getblockheader, which this
                // build answers "method not found" → the gate always 503'd, so
                // ActivateProducer could never pass even after the P0-1 TDZ fix.
                // Compare local height (getblockcount) to the max height our peers
                // report (getnodestate Neighbors[]); refuse only when clearly
                // behind. Both methods are confirmed served by ela.
                const rpc = adapter.rpcClient(chainCfg);
                const [localResp, nodeStateResp] = await Promise.all([
                    rpc.getblockcount(),
                    rpc.getnodestate().catch(() => null),
                ]);
                const local = (typeof localResp === 'number') ? localResp
                    : (localResp && typeof localResp.result === 'number') ? localResp.result : null;
                if (local == null) {
                    return res.status(503).json(errorBody(
                        'Cannot read chain height to verify sync. Refusing reactivation while chain state is unclear.',
                    ));
                }
                let networkHeight = null;
                const ns = (nodeStateResp && nodeStateResp.result) ? nodeStateResp.result : nodeStateResp;
                const neighbors = ns && (ns.neighbors || ns.Neighbors);
                if (Array.isArray(neighbors)) {
                    for (const n of neighbors) {
                        const h = (typeof n.height === 'number') ? n.height
                            : (typeof n.Height === 'number') ? n.Height
                            : (typeof n.startingheight === 'number') ? n.startingheight : null;
                        if (h != null && (networkHeight == null || h > networkHeight)) { networkHeight = h; }
                    }
                }
                // Only refuse when peers report a height AND we're clearly behind
                // (>2 blocks). If no peer reports a height we can't prove staleness,
                // so we allow the operator-initiated activate to proceed.
                if (networkHeight != null && local < networkHeight - 2) {
                    const behind = networkHeight - local;
                    return res.status(409).json(errorBody(
                        `Chain is not yet fully synced (${behind} blocks behind peers). Reactivation transactions `
                        + 'need a synced node — wait until the dashboard shows "Fully synced", then try again.',
                    ));
                }
            } catch (rpcErr) {
                // Can't confirm sync — refuse rather than risk a wasted tx.
                return res.status(503).json(errorBody(
                    `Cannot verify sync status (RPC error: ${rpcErr.message}). Refusing to submit reactivation while chain state is unclear.`,
                ));
            }
            // P1 (v0.5.183) — producer-state gate. Reactivation only applies to
            // an Inactive producer (dpos/state/state.go state machine). Mirror
            // EnmKeystoreIdentity.getProducerState / HealthRules F12: read the
            // producer record via getproducerinfo(ourPubkey) and inspect .state.
            // Only hard-block when state is determinable AND not 'Inactive'; an
            // RPC error / null / missing state leaves it indeterminate, so we
            // let the operator-initiated activate proceed rather than false-block.
            try {
                const rpc = adapter.rpcClient(chainCfg);
                if (rpc && typeof rpc.getproducerinfo === 'function' && snapshot.publicKey) {
                    const p = await rpc.getproducerinfo(snapshot.publicKey).catch(() => null);
                    const state = p && p.state ? p.state : null;
                    if (state && state !== 'Inactive') {
                        return res.status(409).json(errorBody(
                            `Producer is not Inactive (state=${state}) — reactivation only applies to an inactive producer.`,
                        ));
                    }
                }
            } catch (_) {
                // Indeterminate producer state — allow the activate to proceed.
            }
            const envelope = chainCfg && chainCfg.dpos && chainCfg.dpos.keystorePasswordEncrypted;
            if (!envelope) {
                return res.status(400).json(errorBody(
                    'Keystore password not stashed — re-import the keystore via Reinstall my node.',
                ));
            }
            let password;
            try { password = decrypt(envelope); }
            catch (err) {
                return res.status(500).json(errorBody(
                    `Cannot decrypt keystore password: ${err.message}.`,
                ));
            }

            const bpos = new EnmBposService({ logger: extensionHandle.log });
            const result = await bpos.activate({
                chainId,
                cliPath: snapshot.cliPath,
                publicKey: snapshot.publicKey,
                password,
            });

            // Don't keep the plaintext on the response or in any cache.
            password = null;

            if (!result.ok) {
                extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} ${chainId} BPoS activate rejected by chain: ${result.error}`,
                );
                return res.status(400).json(errorBody(result.error, {
                    buildOutput: result.buildOutput,
                    sendOutput: result.sendOutput,
                }));
            }
            return res.json(successBody({
                buildOutput: result.buildOutput,
                sendOutput: result.sendOutput,
            }));
            } finally {
                // P1 (v0.5.183) — always release the in-flight guard, even on
                // an early return or thrown error inside the body above.
                activateInFlight.delete(chainId);
            }
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} POST /chains/${req.params.chainId}/bpos/activate: ${err.message}`);
            return res.status(500).json(errorBody('Producer reactivation failed. Try running the activate command via ela-cli manually.'));
        }
    });

    // beta.3.97 (Wave M3.3) — PUT /chains/<id>/class-b-config — update
    // an installed Class B chain's miner + sync + bootnodes settings.
    // Other fields (ports, pbft.*, binary, activeNet) are install-time
    // immutables and ONLY mutable via the M3.5 setup wizard. The
    // settings UI calls this on Save in Class B Settings → Mining &
    // Rewards.
    //
    // Body shape (all fields optional; only present fields are merged):
    //   {
    //     miner: { enabled?, rewardAddress?, threads?, evmKeystoreAddr? },
    //     sync:  { mode? },
    //     bootnodes: string[]?
    //   }
    //
    // Returns 501 on non-B chains, 404 on unknown chain, 400 on
    // miner-address shape failure (with the address-validation warning
    // text from EnmCrypto so the UI can surface "EIP-55 mismatch" etc.).
    // --- GET peers + bootnodes (Class B EVM only) ---
    // v0.5.175 — feeds the "Peers & Bootnodes" settings panel. Returns the
    // persisted bootnode list plus the LIVE peer count so the UI can show a
    // "stuck" banner when an EVM sidechain is alive but isolated (0 peers).
    // The old EID/ESC geth fork has weak discv4 auto-discovery; an operator
    // whose chain finds no peers needs to add one by hand (see PUT below).
    router.get('/:chainId/bootnodes', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            const chainId = adapter.chainId;
            if (adapter.chainClass !== 'B') {
                return res.status(501).json(errorBody(
                    `Peer management is available only for Class B (EVM sidechain) chains. `
                    + `'${chainId}' is class ${adapter.chainClass || 'unknown'}.`,
                ));
            }
            const cfg = await ConfigStore.load();
            const chainCfg = cfg.chains && cfg.chains[chainId];
            if (!chainCfg) {
                return res.status(404).json(errorBody(`Chain '${chainId}' not configured.`));
            }
            const status = ChainRegistry.getProcessService().statusSync(chainId);
            const alive = !!(status && status.alive);
            let peers = null;
            let height = null;
            let synced = null;
            if (alive) {
                const ph = await adapter.primaryHeight(chainCfg);
                peers = ph.peers;
                height = ph.height;
                synced = ph.synced;
            }
            // "stuck" = running but isolated (no peers to sync from). Only
            // meaningful while alive; a stopped chain isn't "stuck".
            const stuck = alive && peers === 0;
            return res.json(successBody({
                chainId,
                bootnodes: Array.isArray(chainCfg.bootnodes) ? chainCfg.bootnodes.slice() : [],
                alive,
                peers,
                height,
                synced,
                stuck,
            }));
        } catch (err) {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} GET /chains/${req.params.chainId}/bootnodes: ${err.message}`,
            );
            return res.status(500).json(errorBody('Failed to read peer info.'));
        }
    });

    // --- PUT bootnodes: validate + persist + live-apply (Class B EVM only) ---
    // v0.5.175 — the operator-facing "add a peer because my chain is stuck"
    // action. Distinct from class-b-config (bulk settings, persist-only / takes
    // effect next restart): this route VALIDATES each enode, persists the list
    // to cfg.bootnodes (so it survives restart as --bootnodes), AND — when the
    // chain is alive — live-dials each NEWLY added enode via admin_addPeer +
    // admin_addTrustedPeer so the fix takes effect immediately, no restart.
    // That live-dial is the "auto adjustment when added by ENM" the operator
    // asked for. admin_* RPC was enabled for EVM chains in v0.5.172.
    router.put('/:chainId/bootnodes', limit('admin'), requireOwner, async (req, res) => {
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            const chainId = adapter.chainId;
            if (adapter.chainClass !== 'B') {
                return res.status(501).json(errorBody(
                    `Peer management is available only for Class B (EVM sidechain) chains. `
                    + `'${chainId}' is class ${adapter.chainClass || 'unknown'}.`,
                ));
            }
            const body = req.body || {};
            if (!Array.isArray(body.bootnodes)) {
                return res.status(400).json(errorBody('bootnodes: array of enode URLs required'));
            }
            if (body.bootnodes.length > MAX_BOOTNODES) {
                return res.status(400).json(errorBody(`bootnodes: too many (max ${MAX_BOOTNODES})`));
            }
            const { validateEnode } = require('../services/EnmCrypto');
            const normalized = [];
            for (const raw of body.bootnodes) {
                const v = validateEnode(raw);
                if (!v.valid) {
                    return res.status(400).json(errorBody(`bootnodes: ${v.warning}`));
                }
                // De-dup on the normalized (lowercased-pubkey) form so the
                // same peer pasted twice doesn't bloat the spawn arg line.
                if (!normalized.includes(v.normalized)) {
                    normalized.push(v.normalized);
                }
            }
            // Atomic read-modify-write (P0-7). Capture the prior list + the
            // not-found case via closure so the HTTP 404 is decided after the
            // mutator runs against the freshly-loaded cfg.
            let chainCfg = null;
            let previous = [];
            await ConfigStore.update((cfg) => {
                chainCfg = cfg.chains && cfg.chains[chainId];
                if (!chainCfg) {
                    return;
                }
                previous = Array.isArray(chainCfg.bootnodes) ? chainCfg.bootnodes.slice() : [];
                chainCfg.bootnodes = normalized;
            }, { logger: extensionHandle.log });
            if (!chainCfg) {
                return res.status(404).json(errorBody(`Chain '${chainId}' not configured.`));
            }

            // Live-apply only the NEWLY added enodes against a running chain.
            // Nodes already in the persisted list were dialed on a prior call
            // (or via --bootnodes at start), so re-dialing them is wasted work.
            const status = ChainRegistry.getProcessService().statusSync(chainId);
            const alive = !!(status && status.alive);
            const added = normalized.filter((e) => !previous.includes(e));
            const applied = [];
            const failed = [];
            if (alive && added.length > 0) {
                let rpc = null;
                try { rpc = adapter.rpcClient(chainCfg); } catch (_) { rpc = null; }
                if (rpc) {
                    for (const enode of added) {
                        try {
                            await rpc.addPeer(enode);
                            // Trusted = exempt from the maxpeers slot cap so a
                            // hand-added rescue peer can't be evicted. Best-effort:
                            // some builds gate admin_addTrustedPeer behind a flag.
                            try { await rpc.addTrustedPeer(enode); } catch (_) { /* non-fatal */ }
                            applied.push(enode);
                        } catch (err) {
                            failed.push({ enode, error: err.message });
                            extensionHandle.log.warn(
                                `${ENM_LOG_PREFIX} ${chainId} admin_addPeer failed: ${err.message}`,
                            );
                        }
                    }
                }
            }
            extensionHandle.log.info(
                `${ENM_LOG_PREFIX} PUT /chains/${chainId}/bootnodes saved `
                + `(${normalized.length} total, ${applied.length} live-applied, ${failed.length} failed)`,
            );
            return res.json(successBody({
                chainId,
                bootnodes: normalized,
                alive,
                applied,
                failed,
                // When the chain is stopped, new bootnodes only take effect on
                // next start (--bootnodes). Tell the UI so it can prompt.
                restartRequired: !alive && added.length > 0,
            }));
        } catch (err) {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} PUT /chains/${req.params.chainId}/bootnodes: ${err.message}`,
            );
            return res.status(500).json(errorBody('Could not save peers. Try again.'));
        }
    });

    router.put('/:chainId/class-b-config', limit('admin'), requireOwner, async (req, res) => {
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            const chainId = adapter.chainId;
            if (adapter.chainClass !== 'B') {
                return res.status(501).json(errorBody(
                    `class-b-config is defined only for Class B (EVM sidechain) chains. `
                    + `'${chainId}' is class ${adapter.chainClass || 'unknown'}.`,
                ));
            }
            const body = req.body || {};
            // Validate + normalize the (cfg-independent) body fields up front so
            // the 400 early-returns stay at the top level. The resulting closures
            // are then applied in place inside the atomic update() below (P0-7).
            const minerMutations = [];
            // v0.5.228 — track when a legacy `miner.enabled` write came
            // in. The field is derived from on-chain arbiter slate at
            // every chain start (EvmSidechainAdapter.detectProducerRole
            // overwrites it in-memory before spawn), so persisting an
            // operator-supplied value is a no-op at next start. We accept
            // it for backward compatibility with older frontends, log a
            // warning, and surface a hint in the response so callers can
            // migrate. New frontends (v0.5.228+) omit the field entirely
            // and read derived state from GET /system/council-status.
            let derivedHintEmitted = false;
            // Optional miner subdoc merge.
            if (body.miner && typeof body.miner === 'object') {
                if (typeof body.miner.enabled === 'boolean') {
                    const enabled = body.miner.enabled;
                    minerMutations.push((miner) => { miner.enabled = enabled; });
                    derivedHintEmitted = true;
                    extensionHandle.log.warn(
                        `${ENM_LOG_PREFIX} PUT /chains/${chainId}/class-b-config: `
                        + `client sent miner.enabled=${enabled} but the field is derived `
                        + `from on-chain arbiter slate at every spawn — value will be `
                        + `overwritten by detectProducerRole. Caller should stop sending it; `
                        + `read GET /system/council-status for the true state.`,
                    );
                }
                if (body.miner.rewardAddress !== undefined) {
                    const addr = String(body.miner.rewardAddress || '');
                    if (addr.length > 0) {
                        const v = require('../services/EnmCrypto').validateEthAddress(addr);
                        if (!v.valid) {
                            return res.status(400).json(errorBody(
                                `miner.rewardAddress: ${v.warning}`,
                            ));
                        }
                        const rewardAddress = v.normalized || addr;
                        minerMutations.push((miner) => { miner.rewardAddress = rewardAddress; });
                        if (v.warning) {
                            // Soft warning (e.g. EIP-55 checksum mismatch).
                            extensionHandle.log.info(
                                `${ENM_LOG_PREFIX} ${chainId} miner.rewardAddress accepted with warning: ${v.warning}`,
                            );
                        }
                    } else {
                        minerMutations.push((miner) => { miner.rewardAddress = ''; });
                    }
                }
                if (body.miner.evmKeystoreAddr !== undefined) {
                    const addr = String(body.miner.evmKeystoreAddr || '');
                    if (addr.length > 0) {
                        const v = require('../services/EnmCrypto').validateEthAddress(addr);
                        if (!v.valid) {
                            return res.status(400).json(errorBody(
                                `miner.evmKeystoreAddr: ${v.warning}`,
                            ));
                        }
                        const evmKeystoreAddr = v.normalized || addr;
                        minerMutations.push((miner) => { miner.evmKeystoreAddr = evmKeystoreAddr; });
                    } else {
                        minerMutations.push((miner) => { miner.evmKeystoreAddr = ''; });
                    }
                }
                if (Number.isInteger(body.miner.threads)) {
                    if (body.miner.threads < 1 || body.miner.threads > 16) {
                        return res.status(400).json(errorBody(
                            'miner.threads: must be integer in [1, 16]',
                        ));
                    }
                    const threads = body.miner.threads;
                    minerMutations.push((miner) => { miner.threads = threads; });
                }
            }
            // Optional sync subdoc merge.
            let syncMode;
            if (body.sync && typeof body.sync === 'object') {
                if (body.sync.mode !== undefined) {
                    const m = String(body.sync.mode);
                    if (!['fast', 'full', 'archive'].includes(m)) {
                        return res.status(400).json(errorBody(
                            'sync.mode: must be one of full | archive',
                        ));
                    }
                    // v0.5.235 — fast sync removed; coerce a legacy 'fast'
                    // request to 'full' (EVM chains are always full-sync).
                    syncMode = (m === 'fast') ? 'full' : m;
                }
            }
            // Optional bootnodes array replace. v0.5.175 — validate each as a
            // real enode URL (same check as PUT /:id/bootnodes) so the two
            // write-paths can't diverge and persist garbage that geth then
            // rejects at spawn. Persist-only here; live-apply is the dedicated
            // peer route's job.
            let normalizedBootnodes;
            if (Array.isArray(body.bootnodes)) {
                if (body.bootnodes.length > MAX_BOOTNODES) {
                    return res.status(400).json(errorBody(`bootnodes: too many (max ${MAX_BOOTNODES})`));
                }
                const { validateEnode } = require('../services/EnmCrypto');
                normalizedBootnodes = [];
                for (const b of body.bootnodes) {
                    const v = validateEnode(b);
                    if (!v.valid) {
                        return res.status(400).json(errorBody(`bootnodes: ${v.warning}`));
                    }
                    if (!normalizedBootnodes.includes(v.normalized)) {
                        normalizedBootnodes.push(v.normalized);
                    }
                }
            }
            // Atomic read-modify-write (P0-7). The 404 + the mutated subdoc for
            // the response are captured via closure from the freshly-loaded cfg.
            let chainCfg = null;
            await ConfigStore.update((cfg) => {
                chainCfg = cfg.chains && cfg.chains[chainId];
                if (!chainCfg) {
                    return;
                }
                for (const apply of minerMutations) {
                    apply(chainCfg.miner);
                }
                if (syncMode !== undefined) {
                    chainCfg.sync.mode = syncMode;
                }
                if (normalizedBootnodes !== undefined) {
                    chainCfg.bootnodes = normalizedBootnodes;
                }
            });
            if (!chainCfg) {
                return res.status(404).json(errorBody(`Chain '${chainId}' not configured.`));
            }
            extensionHandle.log.info(
                `${ENM_LOG_PREFIX} PUT /chains/${chainId}/class-b-config saved`,
            );
            // v0.5.228 — surface the derived-field hint in the response
            // so a frontend developer who sends miner.enabled sees a
            // signal in the network panel that the field is deprecated.
            const responsePayload = { chainId, chain: chainCfg };
            if (derivedHintEmitted) {
                responsePayload.deprecations = [{
                    field: 'miner.enabled',
                    reason: 'derived from on-chain arbiter slate at every chain start',
                    readFrom: 'GET /system/council-status',
                }];
            }
            return res.json(successBody(responsePayload));
        } catch (err) {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} PUT /chains/${req.params.chainId}/class-b-config: ${err.message}`,
            );
            return res.status(500).json(errorBody('Could not save settings. Try again.'));
        }
    });

    return router;
}

/**
 * beta.3.53 — Map known precondition error messages thrown by runAutoFix
 * to the HTTP status that actually describes them. "Chain is alive" (refuse
 * to clear LOCK on a running DB) is a 409 Conflict, not a 500: the operator
 * has to stop the chain before this action can succeed — nothing crashed on
 * the server. Genuine unexpected errors keep 500.
 *
 * @param {Error} err
 * @returns {number} HTTP status code
 */
function classifyAutoFixError(err) {
    const msg = (err && err.message) ? String(err.message) : '';
    // Precondition: resource state doesn't permit this action right now.
    if (/Chain is alive/i.test(msg)) { return 409; }
    if (/No backup config/i.test(msg)) { return 409; }
    // beta.3.61 — 412 for the explicit-confirm safety gate on chain-rollback.
    // Distinct from 409 (state-based) — this is "you didn't pass the
    // dangerous-action confirmation flag" which is a missing-parameter
    // / precondition-failed semantic.
    if (/chain-rollback is destructive/.test(msg)) { return 412; }
    if (/Invalid rollback target/.test(msg)) { return 400; }
    // Unknown — keep the default.
    return 500;
}

/**
 * Run a whitelisted auto-fix action. Each branch is intentionally narrow:
 * the operator is implicitly granting permission to do exactly this one
 * thing, no more.
 *
 * @param {string} action     one of Diagnostics.AUTO_FIX_ACTIONS
 * @param {object} adapter    chain adapter (already 404-guarded)
 * @param {object} extensionHandle
 * @returns {Promise<{ ok: boolean, detail: string }>}
 */
async function runAutoFix(action, adapter, extensionHandle, opts) {
    const A = Diagnostics.AUTO_FIX_ACTIONS;
    if (action === A.REMOVE_STALE_PID) {
        const p = pidFilePath(adapter.chainId);
        try {
            await fsp.unlink(p);
            return { ok: true, detail: 'Removed ' + p };
        } catch (err) {
            if (err.code === 'ENOENT') return { ok: true, detail: 'No PID file to remove' };
            throw err;
        }
    }
    if (action === A.RESTART_CHAIN) {
        const cfg = await ConfigStore.load();
        const chainCfg = cfg.chains && cfg.chains[adapter.chainId];
        if (!chainCfg) throw new Error('Chain not configured.');
        await adapter.restart(chainCfg);
        return { ok: true, detail: 'Restart issued — see audit tab' };
    }
    if (action === A.CONFIG_ROLLBACK) {
        const restored = await ConfigStore.rollback();
        if (!restored) return { ok: false, detail: 'No backup config to roll back to' };
        return { ok: true, detail: 'Rolled back to previous config' };
    }
    if (action === A.CLEAR_LEVELDB_LOCK) {
        // Refuse if the chain is alive — clearing LOCK on a live ela would
        // corrupt the DB. We trust the diagnose step: it only reports the
        // LOCK file when the process is gone.
        const proc = ChainRegistry.getProcessService();
        if (proc.statusSync(adapter.chainId).alive) {
            throw new Error('Chain is alive — refuse to clear LOCK on a running DB.');
        }
        const lockPath = path.join(chainDir(adapter.chainId), 'elastos', 'data', 'chain', 'LOCK');
        try {
            await fsp.unlink(lockPath);
            return { ok: true, detail: 'Removed ' + lockPath };
        } catch (err) {
            if (err.code === 'ENOENT') return { ok: true, detail: 'No LOCK file present' };
            throw err;
        }
    }
    if (action === A.CHAIN_ROLLBACK) {
        return runChainRollback(adapter, extensionHandle, opts);
    }
    throw new Error('Unhandled action: ' + action);
}

/**
 * beta.3.59 — operator-triggered chain rollback for the arbitrator-state
 * mismatch failure mode. After a SIGKILL of ela (OOM, deploy bounce, hard
 * reboot) the cp_dpos/default.dcp may have a stale arbitrator view; new
 * blocks reference sponsors not in our local set; PowCheckBlockContext
 * keeps rejecting them; height freezes. The recovery KB-confirmed by the
 * Elastos.ELA source (cmd/rollback/rollback.go) is: stop ela, run
 * ela-cli rollback --height N --datadir <chainDir>/elastos, restart.
 *
 * Safety:
 *   - Chain must be stopped (409 Conflict otherwise via classifyAutoFixError)
 *   - Height must be a positive integer, sufficiently below current height
 *   - Backup of default.dcp is taken before any mutation
 *   - keystore.dat lives at <chainDir>/keystore.dat, OUTSIDE the rollback
 *     scope (which is <chainDir>/elastos/data/), so it's untouched
 *   - No automatic restart afterwards — operator confirms a restart
 *     separately so they can see the post-rollback state first
 *
 * @param {object} adapter
 * @param {object} extensionHandle
 * @param {object} opts
 * @param {object} opts.query   parsed query string (height)
 * @returns {Promise<{ok: boolean, detail: string, height: number, backupPath?: string}>}
 */
async function runChainRollback(adapter, extensionHandle, opts) {
    // beta.3.61 — explicit confirmation gate. The KB-cited rollback path
    // (ela-cli rollback) is "non-transactional, DANGEROUS". An interrupted
    // rollback (SSH drop, OS reboot, OOM) leaves FFLDB block index and
    // UTXO state desynchronized — verified empirically on a test node when
    // a long-running rollback was interrupted and subsequent boots got
    // stuck at "INITIALIZE FINISHED → server shutting down" with no
    // recovery short of full chain wipe + bootstrap. The caller MUST
    // pass confirm=I-understand-rollback-is-destructive to proceed.
    const confirm = opts && opts.query && opts.query.confirm;
    if (confirm !== 'I-understand-rollback-is-destructive') {
        throw new Error(
            'chain-rollback is destructive and may corrupt the chain if interrupted. '
            + 'Pass ?confirm=I-understand-rollback-is-destructive to proceed. '
            + 'For most "chain stuck" cases, use chain-resync + bootstrap instead.',
        );
    }
    // P1 (v0.5.183) — hold the per-chain lock across the alive-check + the
    // ela-cli rollback that rewrites the data dir. Without it, a concurrent
    // /start or a HealthChecker auto-start between proc.statusSync() and the
    // rollback could bring ela up against the data dir mid-rewrite (TOCTOU →
    // corrupt FFLDB/UTXO state). This helper does not call
    // adapter.start/stop/restart, so the non-reentrant lock cannot deadlock.
    return withChainLock(adapter.chainId, async () => {
    const proc = ChainRegistry.getProcessService();
    if (proc.statusSync(adapter.chainId).alive) {
        throw new Error('Chain is alive — stop the chain before rollback.');
    }
    const heightRaw = opts && opts.query && opts.query.height;
    const height = Number(heightRaw);
    if (!Number.isInteger(height) || height < 1_000_000) {
        // Floor guard: a rollback target below 1M almost certainly indicates
        // operator typo, not a real arbitrator-mismatch recovery. The KB
        // says rollback is "DANGEROUS, non-transactional" — be paranoid.
        throw new Error('Invalid rollback target — height must be an integer >= 1,000,000.');
    }
    // Locate ela-cli via the binary downloader's known-good state.
    const downloader = ChainRegistry.getBinaryDownloader();
    if (!downloader) {
        throw new Error('Binary downloader not available — cannot locate ela-cli.');
    }
    const onDisk = await downloader.getStatusWithDisk(adapter.chainId);
    const cliPath = onDisk && onDisk.cliPath;
    if (!cliPath) {
        throw new Error('ela-cli not found on disk — cannot perform rollback.');
    }
    const dataDir = path.join(chainDir(adapter.chainId), 'elastos');
    // Backup default.dcp before mutating. Non-fatal if it doesn't exist —
    // the rollback itself rewinds blockchain state, default.dcp will be
    // regenerated on next start.
    const dcpPath = path.join(dataDir, 'data', 'checkpoints', 'cp_dpos', 'default.dcp');
    const backupTs = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `/tmp/default.dcp.bak.${backupTs}`;
    try {
        await fsp.copyFile(dcpPath, backupPath);
        extensionHandle.log.info(`${ENM_LOG_PREFIX} chain-rollback ${adapter.chainId}: backed up default.dcp to ${backupPath}`);
    } catch (err) {
        if (err.code !== 'ENOENT') { throw err; }
        // No default.dcp to back up — proceed; rollback regenerates it.
    }
    // Spawn ela-cli rollback. Use execFile (no shell), pass args directly.
    const { execFile } = require('node:child_process');
    const result = await new Promise((resolve, reject) => {
        execFile(cliPath, [
            'rollback',
            '--height', String(height),
            '--datadir', dataDir,
        ], {
            timeout: 5 * 60_000,  // 5 minutes — rollback of ~1000 blocks is fast
            maxBuffer: 4 * 1024 * 1024,
        }, (err, stdout, stderr) => {
            if (err) {
                err.stdout = stdout;
                err.stderr = stderr;
                return reject(err);
            }
            resolve({ stdout, stderr });
        });
    });
    extensionHandle.log.info(`${ENM_LOG_PREFIX} chain-rollback ${adapter.chainId}: completed at height=${height}; stdout(tail)=${String(result.stdout).slice(-200)}`);
    // ALSO delete default.dcp so ela rebuilds from the most-recent
    // <height>.dcp ≤ N on next start. Without this, ela might re-load
    // the still-present (now-stale relative to rollback height) default.dcp.
    try {
        await fsp.unlink(dcpPath);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            extensionHandle.log.warn(`${ENM_LOG_PREFIX} chain-rollback ${adapter.chainId}: could not unlink default.dcp (non-fatal): ${err.message}`);
        }
    }
    return {
        ok: true,
        detail: `Chain rolled back to height ${height}. Start the chain to resume sync from there. Backup at ${backupPath}.`,
        height,
        backupPath,
    };
    }); // P1 (v0.5.183) — end withChainLock
}

/**
 * Look up an adapter for `:chainId` or send 404 + return null.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {object} extensionHandle
 * @returns {import('../services/ChainAdapter')|null}
 */
function adapterOr404(req, res, extensionHandle) {
    const id = req.params.chainId;
    try {
        return ChainRegistry.getAdapter(id);
    } catch (err) {
        extensionHandle.log.debug(`${ENM_LOG_PREFIX} unknown chainId "${id}": ${err.message}`);
        res.status(404).json(errorBody(`Unknown chain "${id}".`));
        return null;
    }
}

/**
 * Build a route handler that loads the chain config, gets an RpcClient, runs
 * the supplied async function, and packages the response. Centralizes the
 * try/catch + auth boilerplate.
 *
 * @param {string} kind  short label for log messages
 * @param {(rpc: import('../services/EnmRpcClient').EnmRpcClient) => Promise<object>} fn
 * @param {object} extensionHandle
 * @returns {import('express').RequestHandler}
 */
function wrapRpc(kind, fn, extensionHandle) {
    return async function rpcProxy(req, res) {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const adapter = adapterOr404(req, res, extensionHandle);
            if (!adapter) return undefined;
            const cfg = await ConfigStore.load();
            const chainCfg = cfg.chains[adapter.chainId];
            if (!chainCfg) {
                return res.status(404).json(errorBody('Not configured.'));
            }
            const rpc = adapter.rpcClient(chainCfg);
            const payload = await fn(rpc);
            return res.json(successBody(payload));
        } catch (err) {
            // Distinguish "chain not running" (RpcUnreachableError) from real failures.
            const status = err && err.name === 'RpcUnreachableError' ? 503 : 500;
            extensionHandle.log.debug(
                `${ENM_LOG_PREFIX} GET /chains/${req.params.chainId}/${kind} failed: ${err.message}`,
            );
            const responseMessage = status === 503
                ? 'Chain RPC is unreachable. Is the chain running?'
                : 'Failed to read chain data.';
            return res.status(status).json(errorBody(responseMessage));
        }
    };
}

/**
 * Coarse state for the dashboard ("healthy" | "syncing" | "stopped" | ...).
 * Phase 4's HealthChecker will replace this with the real state machine.
 *
 * @param {{ alive: boolean, pid: number|null, attached: boolean }} status
 * @param {object|null} chainCfg
 * @returns {string}
 */
/**
 * Coarse-state derivation.
 *
 * alpha.14 — previously always returned 'syncing' for any alive chain,
 * which meant the UI never flipped to "Healthy" even on a fully caught-
 * up node. Operators saw 100% + "Syncing" forever. Fixed by accepting
 * an optional `syncSnapshot` arg from /sync's enriched response — when
 * `syncSnapshot.synced === true` (lastBlockTime within 5 min of now,
 * the truthful signal wallets use) we return 'healthy'.
 *
 * @param {object} status        from NativeProcessService.statusSync
 * @param {object|null} chainCfg from ConfigStore.load().chains[id]
 * @param {object} [syncSnapshot]  optional sync info — { synced, alive, … }
 */
function deriveCoarseState(status, chainCfg, syncSnapshot, chainClass) {
    // v0.5.203 — delegate to the shared CoarseStateDerive helper so the
    // multi-chain overview pane + the per-chain dashboard report IDENTICAL
    // state labels. Pre-v0.5.203 the two used different 5-tier vocabularies
    // ('healthy' here vs 'running' in overview) for the same alive chain.
    //
    // Map the legacy syncSnapshot shape to the new helper's input:
    //   syncSnapshot.synced=true → syncState='synced'
    //   syncSnapshot.synced!==true → fall through to overview's syncTracker
    //     state (the overview enriches with the SyncTracker analysis); from
    //     the chains.js detail endpoint we only know "synced or not" so we
    //     pass syncState='syncing' as the not-synced fallback (matches the
    //     pre-v0.5.203 behaviour of 'syncing' for class A/B that aren't at
    //     the tip yet).
    const CoarseStateDerive = require('../services/CoarseStateDerive');
    let syncState = null;
    if (syncSnapshot && syncSnapshot.synced === true) { syncState = 'synced'; }
    else if (syncSnapshot && syncSnapshot.synced === false) { syncState = 'syncing'; }
    return CoarseStateDerive.derive({
        alive: !!(status && status.alive),
        chainCfg,
        uptimeSec: (status && typeof status.uptimeSec === 'number') ? status.uptimeSec : null,
        chainClass,
        syncState,
    });
}

module.exports = {
    build,
};
