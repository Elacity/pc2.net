/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * CouncilOverviewService — Wave M2.2 (beta.3.90) — multi-chain
 * aggregator backing the future MultiChainOverviewPane (M2.3) and the
 * new `council:overview` SSE topic.
 *
 * WHY THIS EXISTS
 *
 * Pre-3.90 the chain-card hero was the only widget that read live
 * chain state, and it was hard-bound to a single chainId. A Council
 * operator running 9 services has no aggregate view — they'd have to
 * click each chain in the selector to see whether it's alive. The
 * overview pane (M2.3) renders one row per configured chain with a
 * mini status badge + sparkline, and clicking a row routes to that
 * chain via PaneRouter (M2.1).
 *
 * The pane needs a lightweight server-side aggregation that doesn't
 * stack 9× per-chain RPC fans every 5 seconds. CouncilOverviewService
 * pulls from CHEAP sources only:
 *
 *   - ChainRegistry.listChains() → names + classes + parentChainId
 *   - NativeProcessService.statusSync(chainId) → alive/pid (no RPC)
 *   - ConfigStore.load() → enabled flags
 *   - meta sidecar startedAt → uptimeSec for the 'starting' grace window
 *
 * Per-chain RPC details (block height, peer count, sync%, producer
 * state) stay in `GET /api/enm/chains/<id>`; the overview is a HEADER
 * view, not a replacement for the per-chain detail panes.
 *
 * BOOT INTEGRATION
 *
 * Started in server.js after ChainRegistry.initHealing() so the
 * HealthChecker is already running (the overview piggy-backs on the
 * NativeProcessService exit hook which is registered during
 * ChainRegistry.init).
 *
 * SSE CONTRACT
 *
 * Topic: 'council:overview' (matches SseHub topic regex /^[a-z0-9:-]+$/)
 * Payload:
 *   {
 *     ts: number,                  // Date.now() snapshot timestamp
 *     chains: [
 *       {
 *         chainId, displayName, chainClass, parentChainId,
 *         enabled, alive, pid, attached,
 *         uptimeSec,                // null if stopped or meta missing
 *         state,                    // 'unconfigured'|'disabled'|'stopped'|'starting'|'running'
 *       }, ...
 *     ],
 *     totals: {
 *       total, running, enabled, stopped, disabled,
 *       byClass: { A, B, C, D, E }
 *     }
 *   }
 *
 * Publication policy:
 *   - Periodic tick every TICK_INTERVAL_MS (5s) when subscribers exist
 *   - Immediate re-publish on process-exit hook (any chain dies)
 *   - De-duped against last snapshot: identical content is not re-sent
 *     (saves wire frames; clients can rely on receiving a frame only
 *     when something actually changed)
 *
 * Cache:
 *   - getCachedSnapshot() returns the last-built snapshot for the
 *     GET /api/enm/council/overview initial-fetch endpoint (M2.3
 *     hydrates the pane before SSE delivers the first delta).
 */

'use strict';

const { ENM_LOG_PREFIX } = require('./EnmConstants');
const ConfigStore = require('./ConfigStore');
const ProcessMetrics = require('./ProcessMetrics');
const CoarseStateDerive = require('./CoarseStateDerive');
// v0.5.244 — per-chain binary update detection (download.elastos.io mirror).
const ChainUpdateScanner = require('./EnmChainUpdateScanner');

// v0.5.208 — tick interval set to 2s. v0.5.203 dropped 5s → 1s per the
// "refresh should be immediate" directive, but on a CPU-saturated box
// (mainchain leveldb compaction + 3 EVM doing state-sync = ~800% CPU
// across 8 cores) the 1s tick + per-chain /proc reads + SSE publishes
// starved Express's request handling — health endpoint took 8s to
// respond, /chains timed out, all frontend cards showed errors. 2s is
// still "feels immediate" while leaving room for the chain processes
// to actually run + Express to serve requests. Event-driven publishes
// (chain exit, autoStart success) still fire instantly regardless of
// tick — operators get sub-second feedback on state transitions even
// at this tick.
// v0.5.209 — dialed down further 2s → 3s. Even at 2s the operator was
// reporting "main chain yet to start and so buggy" — the per-tick work
// + the host being CPU-saturated from chain processes meant ENM was
// still contending. 3s gives the host enough breathing room while
// staying well below the perceptual "this is slow" threshold for an
// operator dashboard.
const TICK_INTERVAL_MS = 3_000;
const STARTUP_GRACE_SEC = CoarseStateDerive.STARTUP_GRACE_SEC;
const SSE_TOPIC = 'council:overview';

/**
 * v0.5.204 — classify WHY a chain is in 'starting' state, from observable
 * signals only (no extra RPC). The frontend uses this to surface
 * class-specific copy ("leveldb compaction in progress", etc.) and to
 * compose the sticky banner that tells operators "don't restart anything,
 * this is expected."
 *
 * Drove this: the v0.5.203 deploy left ELA mainchain in STARTING for 7+
 * minutes (leveldb compaction from the prior day's restart storm). The UI
 * had no signal explaining that — the operator's reasonable read was "did
 * the deploy break something?" — and the temptation is to hit restart,
 * which restarts the compaction.
 *
 * Returns one of: 'normal' | 'rpc-not-bound' | 'leveldb-busy' |
 * 'evm-state-sync' | 'awaiting-parent' | 'normal-slow'.
 *
 * @param {object} args
 * @returns {string}
 */
function computeStartingReason(args) {
    const a = args || {};
    // Within the startup grace window — just spawned, no opinion yet.
    if (typeof a.uptimeSec === 'number' && a.uptimeSec < 60) { return 'normal'; }
    // Arbiter (class D) — its _waitForMainchainRpc gate is the most common
    // starting cause. Surface explicitly so the banner can say "waiting on
    // mainchain" rather than a generic "warming up."
    if (a.chainId === 'arbiter' || a.chainClass === 'D') { return 'awaiting-parent'; }
    // Class A (mainchain) — no peers means RPC isn't bound yet (peers come
    // from HealthChecker getconnectioncount which goes through the RPC).
    // High CPU + uptime > 60s is the leveldb-busy signature: ela is
    // compacting / repairing leveldb on startup. Common after a hard
    // shutdown (cgroup-kill from pc2-node, SIGKILL during deploy storm).
    if (a.chainClass === 'A') {
        if ((a.peers == null || a.peers === 0)
            && typeof a.cpuPct === 'number' && a.cpuPct > 50) {
            return 'leveldb-busy';
        }
        if (a.peers == null || a.peers === 0) {
            return 'rpc-not-bound';
        }
        return 'normal-slow';
    }
    // Class B (EVM sidechains) — has peers + no/low height + high CPU is the
    // geth fast-sync state-download signature. Pre-pivot phase pulls the
    // entire state trie from peers; height stays at 0 until pivot completes,
    // then jumps to ~tip. Normal but can take 1-3 hours on a fresh install.
    if (a.chainClass === 'B') {
        const hasPeers = (typeof a.peers === 'number' && a.peers > 0);
        const lowHeight = (a.height == null || a.height < 1000);
        const highCpu = (typeof a.cpuPct === 'number' && a.cpuPct > 30);
        if (hasPeers && lowHeight && highCpu) { return 'evm-state-sync'; }
        if (!hasPeers) { return 'rpc-not-bound'; }
        return 'normal-slow';
    }
    // Class C (oracles) + everything else — just slow startup.
    if (a.peers == null || a.peers === 0) { return 'rpc-not-bound'; }
    return 'normal-slow';
}

class CouncilOverviewService {
    /**
     * @param {object} deps
     * @param {object} deps.extensionHandle  PC2 extension handle (for log)
     * @param {object} deps.registry         ChainRegistry singleton
     * @param {object} deps.sseHub           SseHub for publishing
     */
    constructor(deps) {
        if (!deps || !deps.extensionHandle || !deps.registry || !deps.sseHub) {
            throw new TypeError(
                'CouncilOverviewService: { extensionHandle, registry, sseHub } required',
            );
        }
        this.extensionHandle = deps.extensionHandle;
        this.registry = deps.registry;
        this.sseHub = deps.sseHub;
        this.log = deps.extensionHandle.log || console;
        this._tickHandle = null;
        this._lastSnapshot = null;
        this._started = false;
        this._exitHook = null;
    }

    /**
     * Start the periodic publish loop + register the exit hook on
     * NativeProcessService. Idempotent.
     */
    start() {
        if (this._started) { return; }
        this._started = true;
        this._tickHandle = setInterval(() => { this._tickOnce(); }, TICK_INTERVAL_MS);
        if (typeof this._tickHandle.unref === 'function') {
            this._tickHandle.unref();
        }
        // Publish the first snapshot immediately so subscribers connecting
        // before the first tick get fresh state.
        setImmediate(() => { this._tickOnce(); });
        // Re-publish on any chain exit so the overview reacts within
        // ~10ms of the death signal (vs up to TICK_INTERVAL_MS).
        try {
            const proc = this.registry.getProcessService();
            if (proc && typeof proc.on === 'function') {
                this._exitHook = (evt) => {
                    const cId = (evt && evt.chainId) || '?';
                    this.log.debug(
                        `${ENM_LOG_PREFIX} council:overview: exit signal `
                        + `from ${cId} — re-publishing`,
                    );
                    this._tickOnce();
                };
                proc.on('exit', this._exitHook);
            }
        } catch (err) {
            this.log.debug(
                `${ENM_LOG_PREFIX} council:overview: exit-hook registration `
                + `failed (non-fatal): ${err.message}`,
            );
        }
    }

    /**
     * Stop the periodic loop + unregister the exit hook. Idempotent.
     */
    stop() {
        if (!this._started) { return; }
        this._started = false;
        if (this._tickHandle) {
            clearInterval(this._tickHandle);
            this._tickHandle = null;
        }
        if (this._exitHook) {
            try {
                const proc = this.registry.getProcessService();
                if (proc && typeof proc.off === 'function') {
                    proc.off('exit', this._exitHook);
                } else if (proc && typeof proc.removeListener === 'function') {
                    proc.removeListener('exit', this._exitHook);
                }
            } catch (_) { /* idempotent */ }
            this._exitHook = null;
        }
    }

    /**
     * Build a fresh snapshot from the cheap sources. Async only because
     * ConfigStore.load() is async (it reads the cfg file once with a
     * small in-process cache).
     *
     * @returns {Promise<object>} snapshot payload
     */
    async build() {
        let cfg = { chains: {} };
        try {
            cfg = await ConfigStore.load();
        } catch (err) {
            this.log.debug(
                `${ENM_LOG_PREFIX} council:overview: ConfigStore.load failed `
                + `(${err.message}); rendering chains as unconfigured`,
            );
            cfg = { chains: {} };
        }
        const chainsCfg = (cfg && cfg.chains) || {};
        // v0.5.244 — fire-and-forget kick of the per-chain update scanner. It
        // self-throttles to one refresh per 6h and does its HTTP/spawn work
        // off-tick; buildChainEntry only reads its synchronous cache, so the
        // overview snapshot stays cheap (no new RPC/spawn on the tick path).
        try { ChainUpdateScanner.getInstance({ logger: this.log }).ensureFresh(); }
        catch (_) { /* update badge is best-effort; never block the overview */ }
        let proc = null;
        try { proc = this.registry.getProcessService(); }
        catch (_) { proc = null; }

        // v0.5.186 (Council Node UX P1.3) — the SyncTracker already holds each
        // chain's latest height (fed by HealthChecker's poll), so the overview
        // can show real height + sync state with ZERO new RPCs — it stays a
        // cheap snapshot. null when unavailable (entry height stays null → "—").
        let syncTracker = null;
        try { syncTracker = this.registry.getSyncTracker(); } catch (_) { syncTracker = null; }

        const list = this.registry.listChains();
        const items = list.map((meta) => {
            return buildChainEntry({
                meta,
                chainCfg: chainsCfg[meta.chainId] || null,
                proc,
                syncTracker,
                log: this.log,
            });
        });

        const totals = aggregateTotals(items);

        return {
            ts: Date.now(),
            chains: items,
            totals,
        };
    }

    /**
     * Returns the most recently published snapshot, or null if no tick
     * has run yet. Used by the GET /api/enm/council/overview endpoint
     * so M2.3's pane can hydrate before the first SSE frame lands.
     *
     * @returns {object|null}
     */
    getCachedSnapshot() {
        return this._lastSnapshot;
    }

    /**
     * Force a tick now (used by chain-mutation routes like /start, /stop
     * to push an overview update without waiting up to TICK_INTERVAL_MS).
     * Returns the snapshot built. Always safe to call — internal errors
     * are logged + swallowed.
     *
     * @returns {Promise<object|null>}
     */
    async triggerPublish() {
        return this._tickOnce();
    }

    /** @private */
    async _tickOnce() {
        let snap = null;
        try {
            snap = await this.build();
        } catch (err) {
            this.log.warn(`${ENM_LOG_PREFIX} council:overview build failed: ${err.message}`);
            return null;
        }
        // Always update cache even if no subscribers; GET endpoint
        // reads the cache so it should be current.
        this._lastSnapshot = snap;
        const subs = (typeof this.sseHub.subscriberCount === 'function')
            ? this.sseHub.subscriberCount(SSE_TOPIC) : 0;
        if (subs === 0) {
            return snap;
        }
        // De-dupe: only push if anything changed since the last push.
        // shallowEqualSnap intentionally ignores the timestamp + uptime
        // so seconds-ticking-up doesn't flood SSE; clients can show
        // "as of <ts>" from the last received frame.
        if (this._lastPublished && shallowEqualSnap(this._lastPublished, snap)) {
            return snap;
        }
        this._lastPublished = snap;
        try {
            this.sseHub.publish(SSE_TOPIC, snap);
        } catch (err) {
            this.log.debug(
                `${ENM_LOG_PREFIX} council:overview publish failed `
                + `(non-fatal): ${err.message}`,
            );
        }
        return snap;
    }
}

/**
 * Build a single chain entry. Pure: takes everything as input + returns
 * a fresh object. Exported via _internal for unit tests.
 *
 * @param {object} args
 * @param {object} args.meta       ChainRegistry.listChains() entry
 * @param {object|null} args.chainCfg  cfg.chains[id] or null
 * @param {object|null} args.proc  NativeProcessService instance
 * @param {object} args.log
 * @returns {object} chain entry
 */
function buildChainEntry(args) {
    const { meta, chainCfg, proc, syncTracker, log } = args;
    const cId = meta.chainId;
    let st = null;
    try {
        st = proc ? proc.statusSync(cId) : null;
    } catch (err) {
        log.debug(
            `${ENM_LOG_PREFIX} council:overview: statusSync(${cId}) failed: ${err.message}`,
        );
        st = null;
    }
    const alive = !!(st && st.alive);
    const pid = alive ? (st.pid || null) : null;
    const attached = alive ? !!st.attached : false;
    let uptimeSec = null;
    if (alive) {
        // Read meta sidecar for startedAt → uptime. Best-effort; missing
        // file is normal for chains that crashed before writing meta.
        try {
            // Lazy require so unit tests that mock fs don't have to mock
            // processUtils too — only the meta-read path needs it.
            const fs = require('node:fs');
            const { metaFilePath } = require('./processUtils');
            const buf = fs.readFileSync(metaFilePath(cId), 'utf8');
            const m = JSON.parse(buf);
            if (m && typeof m.startedAt === 'number') {
                uptimeSec = Math.max(0, Math.floor((Date.now() - m.startedAt) / 1000));
            }
        } catch (_) { /* uptime stays null */ }
    }
    const state = coarseState({
        alive,
        chainCfg,
        uptimeSec,
    });
    // v0.5.186 (Council Node UX P1.3) — real height + sync state from the
    // SyncTracker cache (no new RPC). Lets the multi-chain control center show
    // height + healthy/syncing/stalled, not just running/stopped. height stays
    // null for class C/D (services with no chain height) and for chains without
    // samples yet; syncState stays null when there's no network reference (we
    // never guess "stalled" without knowing the chain is behind).
    let height = null;
    let networkHeight = null;
    let blocksBehind = null;
    let syncPercent = null;
    let syncState = null;
    // v0.5.203 — surfaces "last height bump" for the staleness display + the
    // overview's new lastHeightAdvanceMs field. SyncTracker tracks
    // `lastSampleAt` per chain on every height push; if it hasn't moved in
    // a while the chain is either at tip (good, for class A/B once synced=true)
    // or stalled (bad, when blocksBehind > 0).
    let lastHeightAdvanceMs = null;
    if (alive && syncTracker && typeof syncTracker.syncSnapshot === 'function') {
        try {
            const sy = syncTracker.syncSnapshot(cId);
            height = (typeof sy.localHeight === 'number') ? sy.localHeight : null;
            networkHeight = (typeof sy.networkHeight === 'number') ? sy.networkHeight : null;
            blocksBehind = (typeof sy.blocksBehind === 'number') ? sy.blocksBehind : null;
            syncPercent = (typeof sy.percent === 'number') ? sy.percent : null;
            lastHeightAdvanceMs = (typeof sy.lastSampleAt === 'number') ? sy.lastSampleAt : null;
            if (height != null && blocksBehind != null) {
                if (blocksBehind === 0) { syncState = 'synced'; }
                else if (sy.stale) { syncState = 'stalled'; }
                else { syncState = 'syncing'; }
            }
        } catch (err) {
            log.debug(`${ENM_LOG_PREFIX} council:overview: syncSnapshot(${cId}) failed: ${err.message}`);
        }
    }

    // v0.5.203 — per-chain process metrics (CPU%, RSS, FD count). Best-effort:
    // /proc may be unavailable (macOS dev, container without /proc mount).
    // Returns nulls in those cases — frontend renders "—".
    let processMetrics = null;
    if (alive && pid) {
        try {
            processMetrics = ProcessMetrics.getMetrics(pid);
        } catch (err) {
            log.debug(`${ENM_LOG_PREFIX} council:overview: getMetrics(${cId} pid=${pid}) failed: ${err.message}`);
        }
    }

    // v0.5.203 — peer count from SyncTracker if it cached one (HealthChecker
    // pushes peer counts alongside height samples for class A/B). Null for
    // every chain that hasn't reported one yet OR for class C/D (which have
    // no peer concept — they're services).
    let peers = null;
    if (alive && syncTracker && typeof syncTracker.peerSnapshot === 'function') {
        try {
            const peerSnap = syncTracker.peerSnapshot(cId);
            if (peerSnap && typeof peerSnap.count === 'number') { peers = peerSnap.count; }
        } catch (_) { /* peers stays null */ }
    }

    // v0.5.204 — `startingReason` field for the operator-facing "what's
    // actually happening" subtitle + the sticky banner. Only meaningful when
    // unifiedState === 'starting'; null otherwise. Computed from observable
    // signals (uptime + peers + height + CPU) without any extra RPC.
    //
    // Operator pain point that drove this: after the v0.5.203 deploy, ELA
    // mainchain stayed in STARTING for 7+ minutes due to leveldb compaction
    // from yesterday's restart storm, with no UI signal explaining "this is
    // expected, don't restart anything." The reasons below let the frontend
    // surface class-specific copy ("leveldb compaction in progress",
    // "geth state-sync downloading from peers", etc.) instead of just an
    // opaque orange chip.

    // v0.5.203 — use the shared 7-tier state helper so the overview + the
    // chain-detail dashboard report IDENTICAL state strings. Before this,
    // the overview said "Running" for any alive chain past 60s grace while
    // the detail correctly said "Syncing" / "Healthy" — operators got
    // contradictory labels for the same chain.
    const unifiedState = CoarseStateDerive.derive({
        alive,
        chainCfg,
        uptimeSec,
        chainClass: meta.chainClass,
        syncState,
        // v0.5.211 — peers feed for the safety-net branch in derive() that
        // returns 'syncing' instead of 'starting' when alive past grace +
        // peers > 0 + no syncState yet. Without this the EVM chains were
        // stuck in 'starting' for the full window from spawn → first
        // networkHeight RPC sample (could be minutes on a busy box).
        peers,
    });

    // v0.5.204 — derive `startingReason` from observable signals. Only set
    // when unifiedState==='starting'; the frontend uses it for class-specific
    // copy ("leveldb compaction in progress", "geth state-sync downloading
    // from peers", etc.) and to compose the sticky banner that warns the
    // operator not to restart anything while warm-up is in flight.
    let startingReason = null;
    if (unifiedState === 'starting' && alive) {
        startingReason = computeStartingReason({
            chainClass: meta.chainClass,
            chainId: cId,
            uptimeSec,
            peers,
            height,
            cpuPct: processMetrics ? processMetrics.cpuPct : null,
        });
    }

    return {
        chainId: cId,
        displayName: meta.displayName,
        chainClass: meta.chainClass,
        parentChainId: meta.parentChainId,
        enabled: chainCfg ? !!chainCfg.enabled : false,
        alive,
        pid,
        attached,
        uptimeSec,
        // v0.5.203 — `state` is now from CoarseStateDerive (7-tier); kept on
        // the same key so existing consumers keep working with richer values.
        state: unifiedState,
        // Pre-v0.5.203 `state` value (5-tier, overview-local) — kept as a
        // separate field for any consumer that depended on the old vocabulary
        // strictly. Drop in v0.5.205 once frontend has fully migrated.
        legacyState: state,
        // v0.5.204 — null unless state==='starting'. One of:
        //   'normal' — just spawned (<60s grace)
        //   'rpc-not-bound' — alive past grace, no peers reported yet (RPC
        //                     server still binding)
        //   'leveldb-busy' — class A, no peers (RPC unbound), CPU high —
        //                    leveldb compaction/repair after dirty shutdown.
        //                    The mainchain ~7-min STARTING case the
        //                    operator hit on 2026-05-24.
        //   'evm-state-sync' — class B, has peers, height not yet (or low),
        //                    CPU high — geth fast-sync state download.
        //                    Normal pre-pivot behaviour.
        //   'awaiting-parent' — class D (arbiter), waiting for mainchain RPC
        //   'normal-slow' — alive, has peers, but height not yet — could be
        //                   slow RPC bind or block import warmup
        startingReason,
        height,
        networkHeight,
        blocksBehind,
        syncPercent,
        syncState,
        // v0.5.203 — enrichments for the redesigned overview pane.
        peers,
        lastHeightAdvanceMs,
        processMetrics,
        // v0.5.244 — per-chain "update available" flag for the overview badge +
        // Update action button. Synchronous cache read (EnmChainUpdateScanner,
        // refreshed off-tick); false when no entry yet, the chain isn't on the
        // download mirror (oracles/arbiter), or the binary is current.
        updateAvailable: (function () {
            try {
                const u = ChainUpdateScanner.getInstance().getCached(cId);
                return !!(u && u.updateAvailable);
            } catch (_) { return false; }
        }()),
    };
}

/**
 * Cheap state classifier — no RPC. The richer per-chain endpoint
 * (`GET /api/enm/chains/<id>`) does the full healthy/syncing/stalled
 * analysis; overview uses these coarse buckets:
 *
 *   - unconfigured: no cfg entry (chain not set up)
 *   - disabled:     cfg present, operator-disabled (enabled=false)
 *   - stopped:      cfg.enabled=true, process not alive
 *   - starting:     process alive, uptime < 60s (RPC may not be bound yet)
 *   - running:      process alive, uptime ≥ 60s (sync state unknown here)
 *
 * The frontend overview pane can show a yellow/green dot per state.
 * Clicking the row routes to the per-chain pane which renders the
 * full coarse state from /api/enm/chains/<id>.
 *
 * @param {object} args
 * @param {boolean} args.alive
 * @param {object|null} args.chainCfg
 * @param {number|null} args.uptimeSec
 * @returns {string}
 */
function coarseState(args) {
    const { alive, chainCfg, uptimeSec } = args;
    if (!chainCfg) { return 'unconfigured'; }
    if (!alive) { return chainCfg.enabled ? 'stopped' : 'disabled'; }
    if (typeof uptimeSec === 'number' && uptimeSec < STARTUP_GRACE_SEC) {
        return 'starting';
    }
    return 'running';
}

/**
 * Aggregate totals across the chains array.
 *
 * @param {object[]} items
 * @returns {object}
 */
function aggregateTotals(items) {
    const totals = {
        total: items.length,
        running: 0,
        enabled: 0,
        stopped: 0,
        disabled: 0,
        byClass: { A: 0, B: 0, C: 0, D: 0, E: 0 },
    };
    for (const it of items) {
        if (it.alive) totals.running += 1;
        if (it.enabled) totals.enabled += 1;
        if (it.enabled && !it.alive) totals.stopped += 1;
        if (!it.enabled) totals.disabled += 1;
        if (it.chainClass && totals.byClass[it.chainClass] !== undefined) {
            totals.byClass[it.chainClass] += 1;
        }
    }
    return totals;
}

/**
 * Deep-compare two snapshots minus the volatile fields (ts + uptimeSec).
 * Used by _tickOnce to suppress wire frames when nothing operator-
 * visible changed (uptime ticking up alone isn't actionable; the
 * frontend computes uptime client-side from the last frame's ts +
 * its own clock).
 *
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
function shallowEqualSnap(a, b) {
    if (!a || !b) { return false; }
    if (!Array.isArray(a.chains) || !Array.isArray(b.chains)) { return false; }
    if (a.chains.length !== b.chains.length) { return false; }
    for (let i = 0; i < a.chains.length; i += 1) {
        const x = a.chains[i];
        const y = b.chains[i];
        if (!x || !y) { return false; }
        if (x.chainId !== y.chainId) { return false; }
        if (x.alive !== y.alive) { return false; }
        if (x.enabled !== y.enabled) { return false; }
        if (x.state !== y.state) { return false; }
        if (x.pid !== y.pid) { return false; }
        if (x.attached !== y.attached) { return false; }
    }
    if (!a.totals || !b.totals) { return false; }
    if (a.totals.total !== b.totals.total) { return false; }
    if (a.totals.running !== b.totals.running) { return false; }
    if (a.totals.enabled !== b.totals.enabled) { return false; }
    if (a.totals.stopped !== b.totals.stopped) { return false; }
    if (a.totals.disabled !== b.totals.disabled) { return false; }
    return true;
}

module.exports = {
    CouncilOverviewService,
    SSE_TOPIC,
    TICK_INTERVAL_MS,
    STARTUP_GRACE_SEC,
    // Exported for unit tests
    _internal: {
        buildChainEntry,
        coarseState,
        aggregateTotals,
        shallowEqualSnap,
    },
};
