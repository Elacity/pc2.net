/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * HealthChecker — periodic snapshotter + rule dispatcher.
 *
 * Three timer buckets per Rev 1 plan + Rev 9 native-binary architecture:
 *
 *   FAST   ( 5s) — process alive (kill -0 + /proc/<pid>/exe), RPC reachable
 *                  (single ping), exit-event drain
 *   MEDIUM (30s) — peer count, height delta, RPC latency, port conflict scan,
 *                  config validation
 *   SLOW   ( 5m) — disk free, binary --version cross-check
 *
 * State held per chain (the timeline that lets rules fire on durations):
 *   firstPeerZeroAt       — set on first 0-peer observation, cleared on >0
 *   firstRpcDownAt        — set on first RPC failure, cleared on success
 *   firstHeightStallAt    — set on the first poll where height didn't advance
 *   lastHeight            — used to detect "no change since last tick"
 *   restartAttempts       — informational only (engine owns the budget)
 *   lastBinaryVersion     — for F8
 *   lastExit              — most recent exit event (subscribed from processService)
 *
 * Phase 4 covers F1-F10. F11/F12 (BPoS), F13 (clock skew), F14 (daemon —
 * dropped in Rev 9 since no Docker), F15 (audit DB integrity) are Phase 5+.
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
// beta.3.77 — _probeDposDesyncSignal (line ~926) used path.join but the
// module never required node:path. The error was swallowed by the
// catch + .debug log, so the F22 desync detector silently returned
// false every tick. Logs show "_probeDposDesyncSignal(mainchain)
// failed (non-fatal): path is not defined" repeated every poll —
// F22 was effectively dead. Importing path here re-enables the
// detector.
const path = require('node:path');

const {
    ENM_LOG_PREFIX,
    HEALTH_TICK_MS,
} = require('./EnmConstants');
const HealthRules = require('./HealthRules');
const ConfigStore = require('./ConfigStore');
const { validate } = require('./EnmConfigSchema');
const { chainDir } = require('./DataDir');
const ClockSkewChecker = require('./ClockSkewChecker');
const HostConflictScanner = require('./HostConflictScanner');
// beta.3.55 — auto-resolve pending healing proposals when the chain recovers.
const ProposalStore = require('./EnmProposalStore');
const AuditLog = require('./EnmAuditLog');

class HealthChecker {
    /**
     * @param {object} deps
     * @param {object} deps.extensionHandle
     * @param {object} deps.processService
     * @param {object} deps.engine          SelfHealingEngine
     * @param {() => Array<{chainId:string}>} deps.listChains
     * @param {(chainId:string) => object}    deps.getAdapter
     */
    constructor(deps) {
        if (!deps || !deps.extensionHandle || !deps.processService
            || !deps.engine || typeof deps.listChains !== 'function'
            || typeof deps.getAdapter !== 'function') {
            throw new TypeError(
                'HealthChecker: { extensionHandle, processService, engine, listChains, getAdapter } required',
            );
        }
        this.extensionHandle = deps.extensionHandle;
        this.processService = deps.processService;
        this.engine = deps.engine;
        this.listChains = deps.listChains;
        this.getAdapter = deps.getAdapter;
        // Optional — when present, every height sample from the medium tick
        // is fed in so /chains/:id/sync can render velocity + ETA.
        this.syncTracker = deps.syncTracker || null;
        // 0.2.0-alpha.1 — parallel sink for the chain-card sparkline.
        // Same call site as syncTracker, separate concern (long-form
        // history retention vs short-window velocity math). When the
        // store is wired AND an sseHub is available, every appended
        // sample is also published on chains:<id>:height so clients
        // can update their sparkline without polling.
        this.heightSeriesStore = deps.heightSeriesStore || null;
        this.sseHub = deps.sseHub || null;
        // Injected loader makes the tick logic testable without disk I/O.
        // Defaults to ConfigStore.load so production wiring is unchanged.
        this.loadConfig = (typeof deps.loadConfig === 'function')
            ? deps.loadConfig
            : () => ConfigStore.load();
        /** @type {Map<string, object>} */
        this.state = new Map();
        this._timers = { fast: null, medium: null, slow: null };
        this._running = false;

        // Capture exits so F1/F6 know what happened. NativeProcessService emits
        // `{ chainId, code, signal, manualStop }`.
        this._onExit = ({ chainId, code, signal, manualStop }) => {
            const s = this._ensureState(chainId);
            s.lastExit = { code, signal, manualStop, at: Date.now() };
        };
        this.processService.on('exit', this._onExit);
    }

    start() {
        if (this._running) return;
        this._running = true;
        this._timers.fast   = setInterval(() => this._fastTick().catch(this._logTickErr('fast')),   HEALTH_TICK_MS.FAST);
        this._timers.medium = setInterval(() => this._mediumTick().catch(this._logTickErr('medium')), HEALTH_TICK_MS.MEDIUM);
        this._timers.slow   = setInterval(() => this._slowTick().catch(this._logTickErr('slow')),     HEALTH_TICK_MS.SLOW);
        this.extensionHandle.log.info(`${ENM_LOG_PREFIX} HealthChecker started`);
    }

    stop() {
        if (!this._running) return;
        this._running = false;
        for (const k of Object.keys(this._timers)) {
            if (this._timers[k]) {
                clearInterval(this._timers[k]);
                this._timers[k] = null;
            }
        }
        if (this._onExit) {
            this.processService.removeListener('exit', this._onExit);
        }
    }

    /**
     * Public: run all three buckets right now (used by tests + the chains-routes
     * post-restart hook so the operator sees fresh state without waiting 5s).
     */
    async tickNow() {
        await this._fastTick();
        await this._mediumTick();
        await this._slowTick();
    }

    // ========================================================================
    // Tick implementations
    // ========================================================================

    /** @private */
    async _fastTick() {
        // P1 (v0.5.183) — per-tick re-entrancy guard. The setInterval timers
        // fire on a fixed cadence regardless of how long the previous tick
        // took; a slow tick (RPC at the 10s per-call timeout × N chains) would
        // otherwise overlap the next, doubling load and racing the per-chain
        // ruleState timeline. Skip this fire if the previous one is still
        // in flight; the next interval picks it up.
        if (this._fastInFlight) return;
        this._fastInFlight = true;
        try {
            await this._fastTickBody();
        } finally {
            this._fastInFlight = false;
        }
    }

    /** @private */
    async _fastTickBody() {
        const cfg = await this._loadConfigSafe();
        for (const chainInfo of this.listChains()) {
            const chainId = chainInfo.chainId;
            const chainCfg = cfg && cfg.chains && cfg.chains[chainId];
            if (!chainCfg || !chainCfg.enabled) continue;

            const s = this._ensureState(chainId);
            const status = this.processService.statusSync(chainId);

            // F1 input: process alive vs not.
            const alive = !!status.alive;

            // beta.3.53 — synthesize a lastExit when we observe alive=true→false
            // without having received an 'exit' event from the child handle.
            // This is the only path F1 can use after reattach (where ENM has no
            // child handle and therefore can never get a real exit event).
            // Preconditions:
            //   - We saw this chain alive in our own lifetime (_observedAliveOnce)
            //   - The previous fast tick saw it alive (_wasAlivePrevTick)
            //   - Current tick sees it dead (alive === false)
            //   - We don't already have a lastExit recorded (don't clobber a
            //     real exit event)
            // Synthetic exit: code=null, signal=null, manualStop=false,
            // observedVia tag for debuggability. F1 treats this the same as
            // a real non-clean exit (code != 0 || signal present is false here,
            // but the cleanlyExited check in detectF1 requires code===0 to skip
            // — code===null does NOT skip, so F1 fires).
            // beta.3.59 — synthesis must give the real 'exit' EventEmitter
            // handler time to fire. Race condition observed on 3.58: stop()
            // sets handle.manualStop=true and SIGTERMs; ela exits; node
            // queues the 'exit' event handler async. If the fast tick runs
            // BEFORE that handler, we'd see alive=false + lastExit=null on
            // tick T and synthesize with manualStop=false → F1 fires for a
            // deliberate operator stop. Operator's chain-rollback workflow
            // hit this: stop succeeded, F1 fired 3s later, chain bounced
            // back, rollback precondition failed.
            //
            // Fix: only synthesize after TWO consecutive dead ticks (10s
            // of "alive=false" with still no lastExit). The exit handler
            // runs within milliseconds of the 'exit' event being emitted
            // by the OS, so 10s is more than enough headroom. Reattached
            // processes (which never have a child handle and therefore
            // never get an 'exit' event) still get synthesized at tick 2.
            //
            // beta.3.65 — counter increment fixed. Previous code only
            // incremented on the alive=true→false transition tick, then
            // _wasAlivePrevTick flipped to false so subsequent dead ticks
            // failed the `_wasAlivePrevTick && !alive` guard — counter
            // stalled at 1 forever, synthesis (>= 2) never fired. F1 was
            // silently broken for all reattached-process-died scenarios
            // since 3.60. Now: increment whenever current=dead, reset on
            // alive. Reaches >= 2 after two consecutive dead ticks (10s).
            if (!alive) {
                s._consecutiveDeadTicks = (s._consecutiveDeadTicks || 0) + 1;
            } else {
                s._consecutiveDeadTicks = 0;
            }
            if (s._observedAliveOnce && s._consecutiveDeadTicks >= 2 && !alive && !s.lastExit) {
                s.lastExit = {
                    code: null,
                    signal: null,
                    manualStop: false,
                    at: Date.now(),
                    observedVia: 'fastTick-transition',
                };
                this.extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} ${chainId}: alive→dead transition without exit event `
                    + `(reattached process gone); synthesizing lastExit so F1 fires.`,
                );
            }
            // Update transition trackers AFTER the synthesis check so we read
            // the previous-tick value first.
            s._wasAlivePrevTick = alive;
            if (alive) {
                s._observedAliveOnce = true;
                // First alive-tick of this up-period sets the timestamp.
                // Subsequent alive ticks leave it (so _aliveSinceMs grows
                // monotonically while up). A dead tick resets it to null.
                if (!s._aliveSinceMs) { s._aliveSinceMs = Date.now(); }
            } else {
                s._aliveSinceMs = null;
                // beta.3.62 — also reset firstRpcDownAt when chain dies.
                // Pre-3.62 bug: this timer was only cleared on rpcSummary.ok,
                // never on alive=false. Result: after a chain restart (deploy,
                // bootstrap, crash + autoStart), firstRpcDownAt kept its
                // hours-old timestamp. On the new ela's first fast tick post-
                // start, F2's "RPC down for >2 min" check immediately
                // returned TRUE (Date.now() - hours-old-ts >> 2min), so F2
                // escalated within seconds of the chain being created
                // instead of waiting the 2-min grace.
                //
                // Observed on a test node post-bootstrap: chain started at
                // 20:27:30, F2 escalated at 20:27:55 (25s in, with grace
                // supposed to be 120s). Then 3 budget attempts in the next
                // 4s — operator saw 5 notifications in 70 seconds.
                //
                // mediumTick already resets firstPeerZeroAt, firstHeightStallAt,
                // firstNoInboundAt on alive=false (line ~256 below). fastTick
                // owns firstRpcDownAt and was the missing reset.
                s.firstRpcDownAt = null;
            }

            // RPC reachability ping (cheap — one HTTP request via EnmRpcClient).
            let rpcSummary = null;
            if (alive) {
                rpcSummary = await this._pingRpc(chainId);
                if (rpcSummary.ok) {
                    s.firstRpcDownAt = null;
                } else if (!s.firstRpcDownAt) {
                    s.firstRpcDownAt = Date.now();
                }
            }

            const snap = {
                chainId,
                processStatus: status,
                processExit: s.lastExit || null,
                rpcSummary,
                diskInfo: null,
                ports: null,
                configValidation: null,
                chainConfig: chainCfg,
                ruleState: s,
            };
            this._enrichOracleSnap(snap, chainCfg);
            this._enrichArbiterSnap(snap);

            // F1 + F2 fire here.
            const dets = HealthRules.runAll(snap)
                .filter((d) => d.ruleId === 'F1' || d.ruleId === 'F2');
            if (dets.length > 0) {
                await this.engine.apply(chainId, dets, chainCfg);
            }

            // beta.3.55 — auto-resolve obsolete healing proposals. Operator
            // complaint: "opened ENM, autoStart restarted the chain, but I
            // still got a notification to click Restart." That notification
            // sources from pending OWNER-CONFIRMS proposals (F1/F2/F6/...)
            // that were created before the chain self-healed. The dashboard
            // has no way to know those proposals are obsolete unless we
            // explicitly retire them. Here we walk pending rows for this
            // chain whenever it's alive+RPC-reachable+stable and mark any
            // whose root-cause condition has cleared as 'auto_resolved'.
            // listPending in EnmProposalStore filters by status='pending_
            // approval', so retired rows stop appearing in the operator's
            // notification panel.
            //
            // Stable-uptime threshold (PROPOSAL_AUTORESOLVE_STABLE_MS) guards
            // against retiring proposals during a flap (alive→dead→alive in
            // <30s). If a chain just came back this tick and might die
            // again in the next, we wait until it's stayed up long enough
            // to be confident the issue is gone.
            if (alive && rpcSummary && rpcSummary.ok && status.pid) {
                // Cheap fire-and-forget. Errors logged but don't block tick.
                this._sweepAutoResolved(chainId, status, rpcSummary, s).catch((err) => {
                    this.extensionHandle.log.debug(
                        `${ENM_LOG_PREFIX} auto-resolve sweep ${chainId} failed: ${err.message}`,
                    );
                });
            }
        }
    }

    /** @private */
    async _mediumTick() {
        // P1 (v0.5.183) — per-tick re-entrancy guard (see _fastTick). The
        // medium tick does the per-chain RPC summaries, so it's the most
        // likely to run long when several chains are slow to answer.
        if (this._mediumInFlight) return;
        this._mediumInFlight = true;
        try {
            await this._mediumTickBody();
        } finally {
            this._mediumInFlight = false;
        }
    }

    /** @private */
    async _mediumTickBody() {
        const cfg = await this._loadConfigSafe();
        const cfgValidation = await this._validateConfigSafe(cfg);

        for (const chainInfo of this.listChains()) {
            const chainId = chainInfo.chainId;
            const chainCfg = cfg && cfg.chains && cfg.chains[chainId];
            if (!chainCfg || !chainCfg.enabled) continue;

            const s = this._ensureState(chainId);
            const status = this.processService.statusSync(chainId);
            if (!status.alive) {
                // Reset all timers — the next start will start fresh.
                s.firstPeerZeroAt = null;
                s.firstHeightStallAt = null;
                s.firstNoInboundAt = null;
                // beta.3.82 — Wave C item ⑤ — stuck-chain watchdog.
                // If an enabled chain has been dead for >STUCK_GRACE_MS
                // and the death wasn't operator-initiated, ask the
                // engine to notify the operator. The engine rate-limits
                // per chain (30min cooldown) so this fires every
                // medium tick (30s) but only writes audit/SSE every
                // half hour the chain stays down. Safety net for the
                // 23:56:42 test-node pattern where F1 escalation
                // happened once but the operator missed the SSE.
                const STUCK_GRACE_MS = 5 * 60_000;
                if (s.lastExit && !s.lastExit.manualStop && s.lastExit.at
                    && (Date.now() - s.lastExit.at) > STUCK_GRACE_MS
                    && this.engine
                    && typeof this.engine.notifyStuckChain === 'function') {
                    this.engine.notifyStuckChain(
                        chainId, Date.now() - s.lastExit.at,
                    ).catch((err) => {
                        this.extensionHandle.log.debug(
                            `${ENM_LOG_PREFIX} stuck-chain notify ${chainId} failed (non-fatal): ${err.message}`,
                        );
                    });
                }
                continue;
            }

            const rpcSummary = await this._fetchRpcSummary(chainId);
            // Update peer-zero timeline.
            if (rpcSummary.ok && rpcSummary.peers === 0) {
                if (!s.firstPeerZeroAt) s.firstPeerZeroAt = Date.now();
            } else {
                s.firstPeerZeroAt = null;
            }
            // Update height-stall timeline.
            if (rpcSummary.ok && typeof rpcSummary.height === 'number') {
                if (s.lastHeight === rpcSummary.height) {
                    if (!s.firstHeightStallAt) s.firstHeightStallAt = Date.now();
                } else {
                    s.firstHeightStallAt = null;
                    s.lastHeight = rpcSummary.height;
                    // v0.5.231 — F26 multi-tick consecutive gate: any forward
                    // height progress means the chain is NOT actually wedged,
                    // so reset the consecutive-fork-signature counter. Without
                    // this, an intermittent fork signature seen across stalls
                    // separated by brief advances could still accumulate to
                    // the threshold and propose a wipe.
                    s.evmForkDetectedConsecutive = 0;
                }
                // Feed the SyncTracker so /chains/:id/sync has live velocity
                // data. Doing this here (medium tick, every 30s) gives the
                // tracker a steady cadence regardless of dashboard polling.
                if (this.heightSeriesStore) {
                    // 0.2.0-alpha.1 — sparkline source. Mirrors the
                    // syncTracker call below; record() rejects out-of-
                    // order / duplicate / flat-front samples, returning
                    // the appended point or null. We only SSE-publish
                    // on a real append so the topic doesn't fire on
                    // every flat tick.
                    const appended = this.heightSeriesStore.record(chainId, rpcSummary.height);
                    if (appended && this.sseHub) {
                        try {
                            this.sseHub.publish(`chains:${chainId}:height`, {
                                chainId,
                                point: appended,
                            });
                        } catch (err) {
                            // SSE publish should never block the health tick.
                            this.extensionHandle.log.warn(
                                `[ENM] height SSE publish failed for ${chainId}: ${err.message}`,
                            );
                        }
                    }
                }
                if (this.syncTracker) {
                    this.syncTracker.record(chainId, rpcSummary.height);
                }
            }
            // v0.5.203 — push peer count to SyncTracker so the multi-chain
            // overview can render per-row peer counts on its 1s tick without
            // a second RPC. Outside the height success block: rpcSummary.peers
            // is populated by _fetchRpcSummary independently of height.
            if (this.syncTracker
                && rpcSummary.ok
                && typeof rpcSummary.peers === 'number'
                && Number.isInteger(rpcSummary.peers)
                && rpcSummary.peers >= 0) {
                try {
                    this.syncTracker.recordPeers(chainId, rpcSummary.peers);
                } catch (_) { /* recordPeers never throws today; defensive */ }
            }
            // Network-best feed for SyncTracker — kept OUTSIDE the local-height
            // success block so a getblockcount blip doesn't also wipe out our
            // ETA math. The audit (FIX 3/5) called out that without this,
            // SyncTracker.networkHeight stays null forever and the sync bar
            // renders as indeterminate stripes. getnodestate.Neighbors is the
            // canonical source per ela's RPC; _fetchRpcSummary already swallows
            // method-level failures into peerMaxHeight===undefined, so the
            // try/catch is belt-and-braces.
            if (this.syncTracker
                && typeof rpcSummary.peerMaxHeight === 'number'
                && rpcSummary.peerMaxHeight > 0) {
                try {
                    this.syncTracker.recordNetworkBest(chainId, rpcSummary.peerMaxHeight);
                } catch (err) {
                    // recordNetworkBest itself never throws, but a future API
                    // change shouldn't take the whole tick down.
                    this.extensionHandle.log.warn(
                        `${ENM_LOG_PREFIX} recordNetworkBest ${chainId} failed: ${err.message}`,
                    );
                }
            }
            // v0.5.211 — same feed for class B (EVM). primaryHeight returns
            // networkHeight from eth_syncing.highestBlock; recordNetworkBest
            // is monotonic so peerMaxHeight (class A only) and networkHeight
            // (class B) never collide. Without this push, EVM chains had no
            // networkHeight → syncTracker.syncSnapshot returned blocksBehind:
            // null → CoarseStateDerive saw syncState:null → state stayed
            // 'starting' forever even with peers + height advancing.
            if (this.syncTracker
                && typeof rpcSummary.networkHeight === 'number'
                && rpcSummary.networkHeight > 0) {
                try {
                    this.syncTracker.recordNetworkBest(chainId, rpcSummary.networkHeight);
                } catch (err) {
                    this.extensionHandle.log.warn(
                        `${ENM_LOG_PREFIX} recordNetworkBest ${chainId} (EVM) failed: ${err.message}`,
                    );
                }
            }
            // F18 timeline — inbound peers count is needed only when arbiter mode.
            if (chainCfg.dpos && chainCfg.dpos.enableArbiter
                && rpcSummary.ok
                && typeof rpcSummary.inboundCount === 'number'
                && typeof rpcSummary.outboundCount === 'number') {
                const noInbound = rpcSummary.inboundCount === 0 && rpcSummary.outboundCount > 0;
                if (noInbound) {
                    if (!s.firstNoInboundAt) s.firstNoInboundAt = Date.now();
                } else {
                    s.firstNoInboundAt = null;
                }
            } else {
                s.firstNoInboundAt = null;
            }

            // beta.3.63 — Phase 7 Layer 3: probe ela's log tail for the
            // DPoS-state-vs-block-ledger desync signature. Only worth
            // checking when height is already stalled (so F22 detection
            // can confirm "this isn't a generic stall, it's THE desync").
            // Read is cheap (just last few KB of one file).
            let dposDesyncDetected = false;
            if (status.alive && s.firstHeightStallAt) {
                dposDesyncDetected = await this._probeDposDesyncSignal(chainId);
            }

            // v0.5.184/185 — Class B (EVM) self-heal signals. Two probes:
            //  - evmSpvReady (P0-A/B): track the embedded SPV client's height
            //    each tick. The EVM chains validate blocks using the mainchain
            //    arbiter set learned via SPV, so a chain whose SPV is still
            //    bulk-downloading headers legitimately can't advance — F26 must
            //    not treat that as a fork and wipe it. "ready" = SPV present,
            //    >0, and advancing slowly (tracking the tip) vs bulk-download.
            //  - evmForkDetected (F26): the wedged-fork log signature, only
            //    probed once already height-stalled (cheap-gate). Same bounded
            //    64KB read as the DPoS probe; class-gated to skip ela/oracle/arbiter.
            let evmForkDetected = false;
            let evmRecoveryStall = false;
            let evmSpvReady; // undefined for non-Class-B; true/false for Class B
            let isEvm = false;
            try { isEvm = this.getAdapter(chainId).chainClass === 'B'; } catch (_) { isEvm = false; }
            if (isEvm && status.alive) {
                const spvH = await this._probeEvmSpvHeight(chainId);
                if (typeof spvH === 'number' && spvH > 0) {
                    const prev = s.lastEvmSpvHeight;
                    const delta = (typeof prev === 'number') ? (spvH - prev) : null;
                    // ready iff we have a prior sample AND the per-tick advance
                    // is small (tracking the tip), not a bulk header download.
                    evmSpvReady = (delta !== null && delta >= 0 && delta < HealthRules.SPV_CAUGHTUP_MAX_DELTA);
                    s.lastEvmSpvHeight = spvH;
                } else {
                    evmSpvReady = false; // no SPV height observed yet → not ready
                }
                if (s.firstHeightStallAt) {
                    evmForkDetected = await this._probeEvmForkSignal(chainId);
                    evmRecoveryStall = await this._probeEvmRecoveryStall(chainId);
                    // v0.5.231 — multi-tick gate for F26. Counter persists in
                    // the per-chain ruleState (`s`); detectF26 requires it to
                    // reach F26_CONSECUTIVE_TICKS_MIN before proposing a
                    // destructive wipe. Resets to 0 on any negative probe OR
                    // any height advance (handled above where s.lastHeight
                    // updates) — so a transient burst of fork-like errors
                    // that resolves within a tick cannot accumulate.
                    if (evmForkDetected) {
                        s.evmForkDetectedConsecutive = (s.evmForkDetectedConsecutive || 0) + 1;
                    } else {
                        s.evmForkDetectedConsecutive = 0;
                    }
                } else {
                    // Not stalled → probe didn't run → counter must be 0 so a
                    // future stall starts the consecutive count from scratch.
                    s.evmForkDetectedConsecutive = 0;
                }
            }

            const snap = {
                chainId,
                processStatus: status,
                processExit: s.lastExit || null,
                rpcSummary,
                diskInfo: null,
                ports: null,
                configValidation: cfgValidation,
                chainConfig: chainCfg,
                ruleState: s,
                dposDesyncDetected,
                evmForkDetected,
                evmRecoveryStall,
                evmSpvReady,
                // v0.5.248 (validator-readiness audit P1-2) — the EVM adapter's
                // last miner/follower decision {source, shouldMine, setupRole}.
                // Lets F29 flag a Council node that fell back to FOLLOWER because
                // it couldn't READ its producer status (mainchain RPC down /
                // creds undecryptable) — the "silently stops earning" hazard —
                // vs being genuinely off-duty.
                minerDecision: isEvm
                    ? (((this.getAdapter(chainId) || {})._lastRoleDecision) || null)
                    : null,
            };
            this._enrichOracleSnap(snap, chainCfg);
            this._enrichArbiterSnap(snap);

            const dets = HealthRules.runAll(snap).filter((d) =>
                d.ruleId === 'F3' || d.ruleId === 'F4' || d.ruleId === 'F9'
                || d.ruleId === 'F10' || d.ruleId === 'F16' || d.ruleId === 'F18'
                || d.ruleId === 'F22' || d.ruleId === 'F24' || d.ruleId === 'F23'
                || d.ruleId === 'F26' || d.ruleId === 'F27' || d.ruleId === 'F29');
            if (dets.length > 0) {
                await this.engine.apply(chainId, dets, chainCfg);
            }
        }
    }

    /** @private */
    async _slowTick() {
        // P1 (v0.5.183) — per-tick re-entrancy guard (see _fastTick). The slow
        // tick runs binary --version smoke-tests + disk + clock-skew probes,
        // each with their own timeouts; on a busy host it can outlast the next
        // 5-min fire.
        if (this._slowInFlight) return;
        this._slowInFlight = true;
        try {
            await this._slowTickBody();
        } finally {
            this._slowInFlight = false;
        }
    }

    /** @private */
    async _slowTickBody() {
        const cfg = await this._loadConfigSafe();
        // F13 — host clock check, runs once per slow tick (not per chain).
        const clockSkew = await this._checkClockSkew();
        // F19 — host conflict scan, also once per tick (cheap when nothing
        // matches; ss/lsof + readdir on a handful of paths). Cached for 5
        // minutes so a chain card doesn't re-scan on every refresh.
        const hostConflicts = await this._scanHostConflicts();

        for (const chainInfo of this.listChains()) {
            const chainId = chainInfo.chainId;
            const chainCfg = cfg && cfg.chains && cfg.chains[chainId];
            if (!chainCfg || !chainCfg.enabled) continue;

            const s = this._ensureState(chainId);
            const diskInfo = await this._diskFree(chainId);
            // Binary version check — for F8.
            const versionInfo = await this._binaryVersion(chainCfg.binaryPath);
            if (versionInfo.ok) {
                s.lastBinaryVersion = versionInfo.version;
            }

            // BPoS-only checks — F11/F12 only matter when arbiter mode is on.
            const bpos = chainCfg.dpos && chainCfg.dpos.enableArbiter
                ? await this._fetchBposState(chainId, chainCfg, s)
                : null;

            // v0.5.230 — CR Council membership snapshot for F28. Only the
            // mainchain has CR Committee state; non-Class-A chains pass null
            // and F28 self-gates on the chainId === 'mainchain' check. Best
            // effort; failure leaves cr=null and F28 stays quiet.
            const cr = (chainId === 'mainchain')
                ? await this._fetchCrState(chainCfg).catch(() => null)
                : null;

            const snap = {
                chainId,
                processStatus: this.processService.statusSync(chainId),
                processExit: s.lastExit || null,
                rpcSummary: null,
                diskInfo,
                ports: null,
                configValidation: null,
                chainConfig: chainCfg,
                ruleState: s,
                bpos,
                cr,
                clockSkew,
                hostConflicts,
            };
            this._enrichOracleSnap(snap, chainCfg);
            this._enrichArbiterSnap(snap);

            const dets = HealthRules.runAll(snap).filter((d) =>
                d.ruleId === 'F5'  || d.ruleId === 'F6'  || d.ruleId === 'F8'
                || d.ruleId === 'F11' || d.ruleId === 'F12' || d.ruleId === 'F13'
                || d.ruleId === 'F19' || d.ruleId === 'F25'
                || d.ruleId === 'F28');  // v0.5.230 — CR Council MemberState degraded
            if (dets.length > 0) {
                await this.engine.apply(chainId, dets, chainCfg);
            }
        }
    }

    /**
     * @private
     * Fetch producer + arbiter-rotation state. Returns null on transient
     * errors so health rules just stay quiet rather than firing CRITICAL.
     *
     * @param {string} chainId
     * @param {object} chainCfg
     * @param {object} ruleState  the same per-chain state HealthChecker owns
     * @returns {Promise<{ producer: object|null, rotationStuck: boolean }|null>}
     */
    async _fetchBposState(chainId, chainCfg, ruleState) {
        const ourPubkey = chainCfg.dpos && chainCfg.dpos.nodePublicKey;
        if (!ourPubkey || ourPubkey.length === 0) {
            return null;
        }
        try {
            const adapter = this.getAdapter(chainId);
            const client = adapter.rpcClient(chainCfg);
            const [producerInfo, info] = await Promise.all([
                client.getproducerinfo(ourPubkey).catch(() => null),
                client.getinfo().catch(() => null),
            ]);
            const currentHeight = info && typeof info.height === 'number' ? info.height
                                : info && typeof info.blocks === 'number' ? info.blocks
                                : null;

            // F12 input
            let producer = null;
            if (producerInfo) {
                const inactiveHeight = (producerInfo && typeof producerInfo.inactiveheight === 'number')
                    ? producerInfo.inactiveheight : null;
                const inactiveRounds = (currentHeight != null && inactiveHeight != null)
                    ? (currentHeight - inactiveHeight) : null;
                producer = {
                    state: producerInfo.state,
                    votes: producerInfo.votes,
                    dposv2votes: producerInfo.dposv2votes,
                    rank: producerInfo.index,
                    inactiveHeight,
                    inactiveRounds,
                };
            }

            // F11 input — query two ADJACENT heights in the same tick so the
            // H and H+1 comparison is exact (Phase 5 audit, agent 1: prior impl
            // compared across slow-tick boundaries which span ~150 blocks).
            //
            // Rotation-stuck means: between height H-1 and H, the on-duty
            // arbiter index didn't advance AND the slot at that index in the
            // current arbiters list is empty (the arbiter we expected to
            // produce missed). Our pubkey doesn't have to be that arbiter —
            // F11 surfaces ANY consensus stall the dashboard can show; F12
            // is the rule that talks specifically about our producer.
            let rotationStuck = false;
            if (currentHeight != null && currentHeight > 0) {
                try {
                    const [curr, prev] = await Promise.all([
                        client.getarbitratorgroupbyheight(currentHeight).catch(() => null),
                        client.getarbitratorgroupbyheight(currentHeight - 1).catch(() => null),
                    ]);
                    const currIdx = curr && typeof curr.ondutyarbitratorindex === 'number'
                        ? curr.ondutyarbitratorindex : null;
                    const prevIdx = prev && typeof prev.ondutyarbitratorindex === 'number'
                        ? prev.ondutyarbitratorindex : null;
                    const arbiters = Array.isArray(curr && curr.arbitrators) ? curr.arbitrators : [];
                    const onDutySlot = (currIdx != null) ? arbiters[currIdx] : undefined;
                    // Empty-string slot at the ON-DUTY index — only that one
                    // matters; other empty slots are arbiters out of duty.
                    const onDutyMissed = typeof onDutySlot === 'string' && onDutySlot.length === 0;
                    if (currIdx != null && prevIdx != null && currIdx === prevIdx && onDutyMissed) {
                        rotationStuck = true;
                    }
                } catch {
                    // RPC blip — leave rotationStuck=false.
                }
            }
            return { producer, rotationStuck };
        } catch (err) {
            this.extensionHandle.log.debug(
                `${ENM_LOG_PREFIX} bpos fetch ${chainId}: ${err.message}`,
            );
            return null;
        }
    }

    /**
     * @private
     * Run the host conflict scanner with a 5-minute cache. Slow-tick is also
     * 5 minutes, so this just guarantees we don't double-scan when tickNow is
     * called explicitly (e.g., immediately after a chain start).
     */
    async _scanHostConflicts() {
        const now = Date.now();
        if (this._hostConflictsCache
            && (now - this._hostConflictsCache.fetchedAt) < 5 * 60 * 1000) {
            return this._hostConflictsCache.value;
        }
        // beta.3.27 — collect the PIDs ENM manages so the port-binding
        // scanner can exempt them. Without this, port 20336 (rpc) and
        // 20338 (p2p) were tagged as conflicts on every health tick
        // while ela was running normally, because the scanner saw
        // those ports held by our own ela process and didn't know to
        // skip them.
        const ourPids = new Set();
        // beta.3.88 — Wave M1.4 — collect per-chain port list so the
        // scanner attributes any collision to a specific chain
        // (mainchain port 20336 vs ESC port 20636, etc.). Without
        // this, the scanner hardcoded ELA_DEFAULT_PORTS only and
        // missed ESC/EID/PG ports entirely on Council deployments.
        const chainPorts = [];
        try {
            const cfg = await this._loadConfigSafe();
            for (const chainInfo of this.listChains()) {
                const st = this.processService.statusSync(chainInfo.chainId);
                if (st && Number.isInteger(st.pid) && st.pid > 0) {
                    ourPids.add(st.pid);
                }
                const chainCfg = cfg && cfg.chains && cfg.chains[chainInfo.chainId];
                if (chainCfg && chainCfg.ports
                    && typeof chainCfg.ports === 'object') {
                    for (const [role, port] of Object.entries(chainCfg.ports)) {
                        if (Number.isInteger(port) && port > 0) {
                            chainPorts.push({ port, role, chainId: chainInfo.chainId });
                        }
                    }
                }
            }
        } catch (_) { /* defensive — empty sets are the safe fallback */ }
        try {
            const result = await HostConflictScanner.scan({
                logger: this.extensionHandle.log,
                ourPids,
                chainPorts,
            });
            this._hostConflictsCache = { value: result, fetchedAt: now };
            return result;
        } catch (err) {
            this.extensionHandle.log.debug(
                `${ENM_LOG_PREFIX} host conflict scan failed: ${err.message}`,
            );
            const fail = [];
            this._hostConflictsCache = { value: fail, fetchedAt: now };
            return fail;
        }
    }

    /**
     * @private
     * Wraps ClockSkewChecker with a 30-min cache. Slow-tick fires every 5 min,
     * but we don't need fresh internet probes that often.
     */
    async _checkClockSkew() {
        const now = Date.now();
        if (this._clockSkewCache
            && (now - this._clockSkewCache.fetchedAt) < 30 * 60 * 1000) {
            return this._clockSkewCache.value;
        }
        try {
            const result = await ClockSkewChecker.check({ timeoutMs: 5_000 });
            this._clockSkewCache = { value: result, fetchedAt: now };
            return result;
        } catch (err) {
            const fail = { ok: false, reason: err.message };
            this._clockSkewCache = { value: fail, fetchedAt: now };
            return fail;
        }
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    /**
     * beta.3.55 — walk pending healing proposals for this chain and retire
     * any whose root-cause condition has cleared. Called from _fastTick when
     * the chain looks healthy.
     *
     * @private
     * @param {string} chainId
     * @param {object} status     processStatus from statusSync (alive=true)
     * @param {object} rpcSummary {ok: true} when chain RPC is reachable
     */
    async _sweepAutoResolved(chainId, status, rpcSummary, ruleState) {
        // Only retire after the chain has been alive + RPC-reachable for at
        // least PROPOSAL_AUTORESOLVE_STABLE_MS. Otherwise we'd retire on the
        // very first tick after restart, before we've confirmed the chain
        // is actually stable. ruleState._aliveSinceMs is maintained by the
        // fast tick — set on the first alive=true observation, cleared on
        // any alive=false. So (now - _aliveSinceMs) is the contiguous
        // alive-duration of the current up-period.
        const PROPOSAL_AUTORESOLVE_STABLE_MS = 30_000;
        if (!ruleState || !ruleState._aliveSinceMs) { return; }
        const aliveMs = Date.now() - ruleState._aliveSinceMs;
        if (aliveMs < PROPOSAL_AUTORESOLVE_STABLE_MS) { return; }

        let db;
        try {
            db = this.extensionHandle.import('data').db;
        } catch (_) { /* db not ready — try again next tick */ return; }
        if (!db) { return; }

        let rows;
        try {
            rows = await ProposalStore.listPendingByChain(db, chainId);
        } catch (err) {
            this.extensionHandle.log.debug(
                `${ENM_LOG_PREFIX} listPendingByChain(${chainId}) failed: ${err.message}`,
            );
            return;
        }
        if (!rows || rows.length === 0) { return; }

        for (const row of rows) {
            const reason = describeAutoResolveReason(row, status, rpcSummary);
            if (!reason) { continue; }
            try {
                await ProposalStore.markAutoResolved(db, row.id, reason);
                await AuditLog.append(db, {
                    walletAddress: 'system',
                    chainId,
                    ruleId: row.rule_id,
                    tier: 'AUTOMATED-SAFE',
                    decision: 'auto-resolved',
                    executor: 'system',
                    outcome: reason,
                    payload: { action: 'auto-resolve', proposalId: row.id },
                });
                this.extensionHandle.log.info(
                    `${ENM_LOG_PREFIX} auto-resolved ${row.rule_id} proposal ${row.id} on ${chainId}: ${reason}`,
                );
                // beta.3.56 — push an SSE notification so the dashboard
                // dismisses any open proposal-card modal for this id and
                // surfaces a friendly "auto-resolved" toast in its place.
                // Without this, the operator continued to see the
                // "Confirmation needed" modal even after the backend
                // retired the row (visible in operator's screenshot of
                // 3.55 — modal asking to confirm restart side-by-side
                // with an "Auto-healed" toast).
                if (this.sseHub) {
                    try {
                        this.sseHub.publish('notifications', {
                            ts: Date.now(),
                            chainId,
                            ruleId: row.rule_id,
                            severity: 'info',
                            summary: row.summary_action || 'Healing proposal',
                            detail: reason,
                            // The two fields below are the signal the
                            // frontend uses to close the matching modal.
                            // Mirrors the BroadcastChannel cross-tab
                            // 'proposal-actioned' contract; same shape so
                            // the dashboard handler can branch off one
                            // check.
                            proposalActioned: true,
                            proposalId: row.id,
                            verdict: 'auto_resolved',
                        });
                    } catch (err) {
                        this.extensionHandle.log.debug(
                            `${ENM_LOG_PREFIX} auto-resolve SSE publish failed: ${err.message}`,
                        );
                    }
                }
            } catch (err) {
                this.extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} auto-resolve failed for ${row.id}: ${err.message}`,
                );
            }
        }
    }

    /**
     * beta.0.3.14 (Wave M6.5) — enrich an arbiter snapshot with
     * crossChainReach map. F23 reads snap.crossChainReach[<chainId>]
     * for each of the 4 cross-chain dependencies (mainchain/esc/eid/
     * pg). For non-arbiter chains this is a no-op.
     *
     * Uses processService.statusSync(parent) for each dependency —
     * cheap (no RPC). Treats process-alive as "RPC reachable" by
     * proxy; F2 fires the more precise "RPC alive but unreachable"
     * detection on each chain individually.
     *
     * @private
     */
    _enrichArbiterSnap(snap) {
        if (!snap || snap.chainId !== 'arbiter') { return; }
        const required = ['mainchain', 'esc', 'eid', 'pg'];
        const reach = {};
        for (const cid of required) {
            try {
                const st = this.processService.statusSync(cid);
                reach[cid] = !!(st && st.alive);
            } catch (_) {
                reach[cid] = false;
            }
        }
        snap.crossChainReach = reach;
    }

    /**
     * v0.5.230 — fetch CR Council membership state for F28.
     *
     * Thin wrapper over CrMembershipService.detectCrMembership, sharing
     * its 30s in-process cache so the slow-tick re-poll doesn't hammer
     * mainchain RPC. Returns the same shape the service returns:
     *   { isCrMember, state, nickname, impeachmentVotes, source, ... }
     * F28 reads .isCrMember + .state + .impeachmentVotes; everything else
     * is informational. Failure modes (no pubkey / RPC unreachable /
     * not-in-Committee) all surface via source !== 'matched'; F28
     * self-gates on isCrMember=true so non-Council operators don't
     * trigger it.
     *
     * @private
     * @param {object} chainCfg  mainchain cfg block (read pubkey + RPC from)
     * @returns {Promise<object|null>}
     */
    async _fetchCrState(chainCfg) {
        if (!chainCfg || !chainCfg.dpos || !chainCfg.dpos.nodePublicKey) {
            return null;
        }
        try {
            const CrMembershipService = require('./CrMembershipService');
            const ConfigStore = require('./ConfigStore');
            const cfg = await ConfigStore.load();
            return await CrMembershipService.detectCrMembership(cfg, {
                log: this.extensionHandle && this.extensionHandle.log,
            });
        } catch (_) {
            return null;
        }
    }

    /**
     * beta.0.3.5 (Wave M4.5) — enrich a snapshot with parent-chain
     * fields for Class C (oracle) chains. F24 reads snap.parentChainId
     * + snap.parentAlive. For non-oracle chains this is a no-op.
     *
     * Best-effort: looks up parentChainId via ChainAdapter.parentOf
     * (static map), then queries processService.statusSync(parent) for
     * alive state. If the parent isn't in the registry, parentAlive
     * stays null (F24 only fires on explicit false, so null is safe).
     *
     * @private
     * @param {object} snap
     * @param {object|null} chainCfg
     */
    _enrichOracleSnap(snap, chainCfg) {
        if (!snap || !snap.chainId) { return; }
        // Prefer adapter-supplied parentChainId (subclass override) but
        // fall back to the static map for safety.
        let parentChainId = null;
        try {
            const ChainAdapter = require('./ChainAdapter');
            parentChainId = ChainAdapter.parentOf(snap.chainId);
            // chainCfg.parentChainId may override if the operator
            // pointed the oracle at a custom parent (rare; covered).
            if (chainCfg && chainCfg.parentChainId) {
                parentChainId = chainCfg.parentChainId;
            }
        } catch (_) { /* swallow — parent stays null */ }
        if (!parentChainId) { return; }
        snap.parentChainId = parentChainId;
        try {
            const st = this.processService.statusSync(parentChainId);
            snap.parentAlive = !!(st && st.alive);
        } catch (_) {
            snap.parentAlive = null;  // unknown — F24 won't fire
        }
    }

    /** @private */
    _ensureState(chainId) {
        let s = this.state.get(chainId);
        if (!s) {
            s = {
                firstPeerZeroAt: null,
                firstRpcDownAt: null,
                firstHeightStallAt: null,
                firstNoInboundAt: null,           // Phase 5 F18
                lastHeight: null,
                lastBinaryVersion: null,
                lastExit: null,
                restartAttempts: 0,
                // beta.3.53 — F1 reattach fix. `lastExit` is populated by the
                // 'exit' EventEmitter callback that NativeProcessService fires
                // when a child process it spawned terminates. After ENM
                // reattaches to an ela that was spawned by a *previous* ENM
                // lifetime, there is no child handle — so no exit event ever
                // fires. Result: when the reattached ela dies, statusSync
                // detects alive=false but lastExit stays null, and F1's
                // `if (!exit) return null` guard silences the crash.
                //
                // We close the gap by tracking whether we ever saw this chain
                // alive in our own lifetime. If we did, and statusSync flips
                // alive=true → false without an exit event, we synthesize a
                // lastExit so F1 can fire. First-boot (never seen alive) is
                // unchanged — F1 stays silent on "unknown initial state".
                _wasAlivePrevTick: false,
                _observedAliveOnce: false,
                // beta.3.55 — tracks the timestamp the chain first went
                // alive in the current up-period. Reset to null on any
                // alive=false tick. Used by _sweepAutoResolved as the
                // "has been stable for at least N seconds" guard so we
                // don't retire pending proposals on the very first tick
                // after a flap.
                _aliveSinceMs: null,
            };
            this.state.set(chainId, s);
        }
        return s;
    }

    /** @private */
    async _loadConfigSafe() {
        try {
            const cfg = await this.loadConfig();
            // beta.3.19 — push operator-tuned alert thresholds from
            // cfg.global.notifications.thresholds into HealthRules.
            // Cheap + idempotent so we just do it on every load
            // rather than wire a config-change event. Defaults are
            // re-applied if the operator clears the section (set
            // to undefined).
            if (cfg && cfg.global && cfg.global.notifications
                && cfg.global.notifications.thresholds) {
                HealthRules.setThresholds(cfg.global.notifications.thresholds);
            }
            // beta.3.76 — push GLOBAL per-rule enabled overrides into
            // HealthRules. Pre-3.87 this was the only path; beta.3.87
            // retains it as the legacy fallback. Per-chain overrides
            // (pushed below) take precedence at read time.
            if (cfg && cfg.global && cfg.global.healing
                && cfg.global.healing.enabledRules) {
                const map = cfg.global.healing.enabledRules;
                for (const ruleId of Object.keys(map)) {
                    HealthRules.setRuleEnabled(ruleId, !!map[ruleId]);
                }
            }
            // beta.3.87 — Wave M1.3 — push PER-CHAIN per-rule enabled
            // overrides into HealthRules. Same idempotent pattern as the
            // global push above. When the operator clears a per-chain
            // toggle by removing the key, isRuleEnabled falls back to
            // the global override, then DEFAULT_ENABLED.
            if (cfg && cfg.chains) {
                for (const cId of Object.keys(cfg.chains)) {
                    const chainCfg = cfg.chains[cId];
                    if (chainCfg && chainCfg.healing
                        && chainCfg.healing.enabledRules) {
                        const map = chainCfg.healing.enabledRules;
                        for (const ruleId of Object.keys(map)) {
                            HealthRules.setRuleEnabled(ruleId, !!map[ruleId], cId);
                        }
                    }
                }
            }
            // beta.3.87 — Wave M1.3 — ONE-SHOT MIGRATION of legacy
            // cfg.global.healing.enabledRules → cfg.chains.mainchain.
            // healing.enabledRules. Only runs once per ENM lifetime
            // (guarded by an in-process flag — survives until next
            // reboot). The legacy global key is preserved for one
            // release as a fallback; M2+ removes it.
            if (!this._healingRulesMigrationDone) {
                this._healingRulesMigrationDone = true;
                try {
                    const globalRules = cfg && cfg.global && cfg.global.healing
                        && cfg.global.healing.enabledRules;
                    const mainchainCfg = cfg && cfg.chains && cfg.chains.mainchain;
                    if (globalRules && Object.keys(globalRules).length > 0
                        && mainchainCfg
                        && (!mainchainCfg.healing
                            || !mainchainCfg.healing.enabledRules
                            || Object.keys(mainchainCfg.healing.enabledRules).length === 0)) {
                        // Need a save — copy globalRules into mainchain.healing.
                        // ConfigStore is required lazily to avoid the cycle.
                        const ConfigStore = require('./ConfigStore');
                        // P0-7 (v0.5.179) — atomic RMW so this background
                        // migration write can't clobber a concurrent operator
                        // config save (load→mutate→save under the write lock).
                        let didMigrate = false;
                        await ConfigStore.update((fresh) => {
                            if (fresh && fresh.chains && fresh.chains.mainchain) {
                                fresh.chains.mainchain.healing = fresh.chains.mainchain.healing || {};
                                fresh.chains.mainchain.healing.enabledRules =
                                    Object.assign({}, globalRules);
                                didMigrate = true;
                            }
                        }, { logger: this.extensionHandle.log });
                        if (didMigrate) {
                            this.extensionHandle.log.info(
                                `${ENM_LOG_PREFIX} healing-rules migration (Wave M1.3): copied `
                                + `${Object.keys(globalRules).length} rule(s) from cfg.global.`
                                + `healing.enabledRules → cfg.chains.mainchain.healing.enabledRules`,
                            );
                            // Best-effort SSE notification so the operator
                            // sees the migration happened. Don't block on it.
                            if (this.sseHub && typeof this.sseHub.publish === 'function') {
                                try {
                                    this.sseHub.publish('notifications', {
                                        severity: 'INFO',
                                        summary: 'Healing rules moved to per-chain Settings',
                                        detail: 'Your existing rule toggles now live under '
                                            + 'Settings → Main chain → Security. Future per-chain toggles '
                                            + '(Smart Chain / Identity Chain / PG Chain) will be independent.',
                                        timestamp: Date.now(),
                                    });
                                } catch (_) { /* swallow */ }
                            }
                        }
                    }
                } catch (migErr) {
                    this.extensionHandle.log.warn(
                        `${ENM_LOG_PREFIX} healing-rules migration failed (non-fatal): ${migErr.message}`,
                    );
                }
            }
            return cfg;
        } catch (err) {
            this.extensionHandle.log.warn(
                `${ENM_LOG_PREFIX} HealthChecker config.load failed: ${err.message}`,
            );
            return null;
        }
    }

    /** @private */
    async _validateConfigSafe(cfg) {
        if (!cfg) {
            return { ok: false, error: 'config not loaded' };
        }
        try {
            validate(cfg);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    }

    /** @private */
    async _pingRpc(chainId) {
        try {
            const adapter = this.getAdapter(chainId);
            const cfg = await this._loadConfigSafe();
            const chain = cfg && cfg.chains && cfg.chains[chainId];
            if (!chain) return { ok: false, errCode: 'no-config' };
            // FIX-C19 — delegate liveness to the adapter's polymorphic health()
            // instead of hardcoding client.getblockcount(). getblockcount is an
            // ELA (Bitcoin-style) RPC method that ONLY the mainchain's
            // EnmRpcClient implements; EVM sidechains use EthRpcClient
            // (getBlockNumber/getPeerCount — no getblockcount), oracles are
            // plain HTTP (no JSON-RPC), and the arbiter serves getspvheight.
            // The old getblockcount() call therefore THREW for every
            // non-mainchain chain → rpcSummary.ok=false → once the C15
            // initial-start grace expired, F2 (rpc-unreachable) restart-LOOPED
            // 7/8 healthy chains (the durability killer). Each adapter's
            // health() now does the class-correct probe: mainchain RPC-pings
            // (getblockcount works), EVM/oracle/arbiter are PID-based exactly
            // like node.sh's per-chain pgrep status checks.
            const h = await adapter.health(chain);
            if (h && h.rpcOk) return { ok: true };
            return { ok: false, errCode: (h && h.alive) ? 'rpc-unreachable' : 'not-alive' };
        } catch (err) {
            return { ok: false, errCode: err.name || 'RpcError' };
        }
    }

    /** @private */
    async _fetchRpcSummary(chainId) {
        try {
            const adapter = this.getAdapter(chainId);
            const cfg = await this._loadConfigSafe();
            const chain = cfg && cfg.chains && cfg.chains[chainId];
            if (!chain) return { ok: false, errCode: 'no-config' };

            // P1 (v0.5.183) — class-aware summary (medium-tick analogue of the
            // C19 bug). The old body hardcoded ELA Bitcoin-style verbs
            // (getblockcount / getconnectioncount / getnodestate) on EVERY
            // chain via the adapter's rpcClient. Those methods ONLY exist on
            // the mainchain's EnmRpcClient. For Class B (EVM esc/eid/pg) the
            // rpcClient is an EthRpcClient and for Class C (oracle) there is
            // no chain RPC, so every call returned null → ok=false, height /
            // peers / sync NEVER tracked for non-mainchain chains. That left
            // the sparkline, ETA, and peer-stall timelines dead AND starved
            // the medium-tick rules of real data.
            //
            // Fix: drive height/peers from the adapter's class-correct
            // primaryHeight() (Bitcoin-RPC for A, eth_* for B, getspvheight
            // for D, parent-height for C — see ChainAdapter / EvmSidechain
            // Adapter / ArbiterAdapter / OracleAdapter). Only the mainchain
            // (Class A) keeps the getnodestate neighbor-walk for the rich
            // inbound/outbound peer detail F18 needs and the peerMaxHeight
            // SyncTracker feed.
            //
            // Per-class population (kept in lock-step with how F3/F4/F16/F18
            // consume the summary — each already early-returns on missing
            // data):
            //   A (mainchain) — height + peers from primaryHeight, PLUS the
            //                    neighbor-walk (inbound/outbound/peerMaxHeight).
            //   B (EVM)       — height + peers from primaryHeight. These chains
            //                    legitimately HAVE peers + an advancing height,
            //                    so F3/F4/F16 may fire on a real stall. F18
            //                    stays quiet because inbound/outboundCount are
            //                    left undefined (no getnodestate on geth).
            //   C/D (oracle / arbiter) — PID-only: ok:true with NO height/peers
            //                    so no height-stall or peer rule can fire (the
            //                    arbiter's spv height + oracle's parent height
            //                    are read-only hero telemetry, not a sync gate).
            const t0 = Date.now();
            const chainClass = (adapter && adapter.chainClass) || null;

            // primaryHeight is the class-correct, never-throwing probe shared
            // with the route layer. {height, peers, networkHeight, synced}.
            let primary = null;
            try {
                if (typeof adapter.primaryHeight === 'function') {
                    primary = await adapter.primaryHeight(chain);
                }
            } catch (_) { /* never throws by contract; belt-and-braces */ }

            // Class C/D — process is alive (medium tick only runs on alive
            // chains), but there is no per-chain sync to track. Report ok:true
            // with no height/peers so the height-stall (F4) and peer (F3/F16/
            // F18) rules all early-return.
            if (chainClass === 'C' || chainClass === 'D') {
                return { ok: true, latencyMs: Date.now() - t0 };
            }

            const height = primary && typeof primary.height === 'number'
                ? primary.height : undefined;
            const peers = primary && typeof primary.peers === 'number'
                ? primary.peers : undefined;
            // v0.5.211 — extract networkHeight from the class-correct probe.
            // EvmSidechainAdapter.primaryHeight returns it from
            // eth_syncing.highestBlock; ELA mainchain's primaryHeight doesn't
            // (mainchain uses peerMaxHeight from the getnodestate neighbor
            // walk above instead). Returned in the summary so the caller
            // can feed it to SyncTracker.recordNetworkBest, which unblocks
            // syncState derivation for EVM chains — without this, EVM
            // chains were stuck in 'starting' forever in the overview
            // because syncState stayed null.
            //
            // v0.5.213 — when adapter reports synced===true (eth_syncing
            // returned false AND chain has blocks AND has peers, per
            // EvmSidechainAdapter.primaryHeight), set networkHeight = height.
            // Without this fix, EVM chains caught up to tip showed 'syncing'
            // forever in the overview: eth_syncing=false means the adapter
            // can't return networkHeight from it; SyncTracker had no network
            // reference; blocksBehind stayed null; CoarseStateDerive's safety
            // net returned 'syncing' (operator screenshot today: ESC fully
            // synced reading 'syncing'). Since the chain reports itself
            // synced, its own height IS the tip we know — push that.
            let networkHeight = primary && typeof primary.networkHeight === 'number'
                ? primary.networkHeight : undefined;
            if (networkHeight === undefined
                && primary && primary.synced === true
                && typeof primary.height === 'number'
                && primary.height > 0) {
                networkHeight = primary.height;
            }

            // Mainchain (Class A) only — the getnodestate neighbor-walk powers
            // F18's inbound/outbound split and the SyncTracker peerMaxHeight
            // network-best feed. EVM/oracle/arbiter clients don't serve it.
            let inboundCount;
            let outboundCount;
            let peerMaxHeight;
            if (chainClass === 'A') {
                const client = adapter.rpcClient(chain);
                // Defensive: a future client variant or a test fake may not
                // implement getnodestate. A missing method becomes `null`,
                // not a thrown TypeError.
                const callOrNull = (fn) => {
                    if (typeof fn !== 'function') return Promise.resolve(null);
                    try { return Promise.resolve(fn()).catch(() => null); }
                    catch { return Promise.resolve(null); }
                };
                const nodeState = await callOrNull(
                    client.getnodestate && client.getnodestate.bind(client),
                );

                // F18 input — count inbound vs outbound from
                // getnodestate.Neighbors. peerMaxHeight (for SyncTracker) — max
                // of any height field peers report. Defensive: the schema may
                // evolve; guard each access.
                const neighbors = nodeState && Array.isArray(nodeState.neighbors)
                    ? nodeState.neighbors
                    : (nodeState && Array.isArray(nodeState.Neighbors) ? nodeState.Neighbors : null);
                if (Array.isArray(neighbors)) {
                    inboundCount = 0;
                    outboundCount = 0;
                    for (const n of neighbors) {
                        if (!n || typeof n !== 'object') continue;
                        const isInbound = (n.Inbound === true || n.inbound === true);
                        if (isInbound) inboundCount += 1;
                        else outboundCount += 1;
                        // v0.5.214 — ela's neighbor schema uses `lastblock` for
                        // the peer's current best height (verified via direct RPC
                        // call 2026-05-07; same field names chains.js /sync
                        // already uses). The old order here missed `lastblock`
                        // entirely → peerMaxHeight stayed undefined → SyncTracker.
                        // networkHeight stayed null → mainchain in the multi-
                        // chain overview was stuck reading 'SYNCING' even when
                        // fully caught up (the 2026-05-25 incident). `height` /
                        // `Height` / `lastHeight` kept for fallbacks in case
                        // upstream renames during a normalization pass.
                        const h = typeof n.lastblock === 'number' ? n.lastblock
                                : typeof n.startingheight === 'number' ? n.startingheight
                                : typeof n.Height === 'number' ? n.Height
                                : typeof n.height === 'number' ? n.height
                                : typeof n.lastHeight === 'number' ? n.lastHeight
                                : null;
                        if (h != null && (peerMaxHeight == null || h > peerMaxHeight)) {
                            peerMaxHeight = h;
                        }
                    }
                }
            }

            // P1 (v0.5.183) — ok semantics: a Class A/B chain is ok when it
            // reports both a numeric height and peer count from its class-
            // correct probe (matches the old getblockcount+getconnectioncount
            // contract for A, and is the right signal for B).
            return {
                ok: typeof height === 'number' && typeof peers === 'number',
                height,
                peers,
                // v0.5.211 — class-correct network-tip for SyncTracker. EVM
                // chains get this from primary (eth_syncing.highestBlock);
                // mainchain stays at undefined here and feeds peerMaxHeight
                // below instead.
                networkHeight,
                inboundCount,
                outboundCount,
                peerMaxHeight,
                latencyMs: Date.now() - t0,
            };
        } catch (err) {
            return { ok: false, errCode: err.name || 'RpcError' };
        }
    }

    /**
     * @private
     * beta.3.63 — Phase 7 Layer 3 probe. Read the tail of the most recent
     * ela log file and detect the DPoS-state-vs-block-ledger desync
     * signature. Either pattern below is a definitive marker that
     * default.dcp is out-of-sync with the block ledger:
     *
     *   - "sponsor is not in current or last arbitrators"
     *   - "PowCheckBlockContext error"
     *
     * Only the LAST ~64KB of the log is read so the cost is bounded
     * (one ~64KB read, one regex scan) regardless of how big the log
     * has grown. Skipped silently on filesystem errors.
     *
     * @param {string} chainId
     * @returns {Promise<boolean>}
     */
    async _probeDposDesyncSignal(chainId) {
        const PROBE_MAX_BYTES = 64 * 1024;
        const PATTERN = /sponsor is not in current or last arbitrators|PowCheckBlockContext error/i;
        try {
            const logDir = path.join(chainDir(chainId), 'elastos', 'logs', 'node');
            const entries = await fsp.readdir(logDir).catch(() => []);
            const logFiles = entries.filter((n) => /\.log$/.test(n));
            if (logFiles.length === 0) return false;
            // Pick the most recent (lexicographic sort works because file
            // names are YYYY-MM-DD_HH.MM.SS.log).
            logFiles.sort();
            const newest = logFiles[logFiles.length - 1];
            const full = path.join(logDir, newest);
            const stat = await fsp.stat(full).catch(() => null);
            if (!stat) return false;
            const startOffset = Math.max(0, stat.size - PROBE_MAX_BYTES);
            const fd = await fsp.open(full, 'r');
            try {
                const buf = Buffer.alloc(stat.size - startOffset);
                await fd.read(buf, 0, buf.length, startOffset);
                return PATTERN.test(buf.toString('utf8'));
            } finally {
                await fd.close().catch(() => {});
            }
        } catch (err) {
            this.extensionHandle.log.debug(
                `${ENM_LOG_PREFIX} _probeDposDesyncSignal(${chainId}) failed (non-fatal): ${err.message}`,
            );
            return false;
        }
    }

    /**
     * v0.5.184 — F26 probe. Read the tail of the most recent EVM node log and
     * detect the wedged-fork signature: geth dropping peers with "retrieved
     * hash chain is invalid" because the local chain has diverged onto a
     * minority fork (so every canonical peer's header chain fails to connect
     * to the local head). A SINGLE occurrence can be a transient bad peer, so
     * we require >= EVM_FORK_MIN_HITS in the tail — a genuinely wedged node
     * logs it continuously (once per peer it cycles through and drops),
     * whereas a healthy node that hit one bad peer recovers and stops.
     *
     * The EVM node log lives at <chainDir>/logs/<chainId>.log (verified on
     * disk: chains/pg/logs/pg.log) — distinct from ela's elastos/logs/node/.
     * Only the last ~64KB of the newest log is read (bounded cost), matching
     * _probeDposDesyncSignal. Skipped silently on filesystem errors.
     *
     * @param {string} chainId
     * @returns {Promise<boolean>}
     */
    async _probeEvmForkSignal(chainId) {
        // v0.5.231 — bumped from 64 KB to 256 KB so the recent-window filter
        // below has enough log surface to find hits even in a verbose chain;
        // the per-line timestamp check then narrows the count to the last 10
        // minutes regardless of how much we read.
        const PROBE_MAX_BYTES = 256 * 1024;
        // Two fork-class signatures, different confidence:
        //  - DOWNLOADER_FORK: geth's block downloader rejecting a peer's header
        //    chain. Emitted transiently by a single bad peer too. v0.5.231
        //    requires ≥10 hits (up from 3) AND all within the last 10 min to
        //    confirm a genuine local minority-fork wedge; a transient peer
        //    blip can no longer trip the wipe.
        //  - STATE_CORRUPT (v0.5.185 P0-C): a state/receipt-root mismatch or
        //    BAD BLOCK on the PBFT live-insert path. Definitive local-state
        //    corruption, so ≥1 hit still suffices — but it ALSO has to be
        //    inside the recent-window so a months-old BAD BLOCK in the same
        //    log file can't trigger a fresh wipe.
        const DOWNLOADER_FORK_RE = /retrieved hash chain is invalid/i;
        const STATE_CORRUPT_RE = /invalid merkle root|invalid receipt root hash|BAD BLOCK/i;
        const DOWNLOADER_MIN_HITS = 10;
        // Geth-flavoured log line prefix: [MM-DD|HH:MM:SS.mmm] LEVEL ...
        // We assume UTC and the current year; lines with a parsed timestamp
        // that lies in the future (year-rollover artefact at Dec/Jan) are
        // skipped. Lines we cannot parse a timestamp from are also skipped —
        // safer than counting an undated line that may be ancient.
        const TS_RE = /^\[(\d{2})-(\d{2})\|(\d{2}):(\d{2}):(\d{2})\.(\d{3})\]/;
        const RECENT_WINDOW_MS = 10 * 60_000;
        const nowMs = Date.now();
        const cutoffMs = nowMs - RECENT_WINDOW_MS;
        const currentYear = new Date(nowMs).getUTCFullYear();
        try {
            const logDir = path.join(chainDir(chainId), 'logs');
            const entries = await fsp.readdir(logDir).catch(() => []);
            const logFiles = entries.filter((n) => /\.log$/.test(n));
            if (logFiles.length === 0) return false;
            logFiles.sort();
            const newest = logFiles[logFiles.length - 1];
            const full = path.join(logDir, newest);
            const stat = await fsp.stat(full).catch(() => null);
            if (!stat) return false;
            const startOffset = Math.max(0, stat.size - PROBE_MAX_BYTES);
            const fd = await fsp.open(full, 'r');
            try {
                const buf = Buffer.alloc(stat.size - startOffset);
                await fd.read(buf, 0, buf.length, startOffset);
                const text = buf.toString('utf8');
                let recentStateHits = 0;
                let recentDownloaderHits = 0;
                const lines = text.split('\n');
                for (const line of lines) {
                    const m = line.match(TS_RE);
                    if (!m) continue;
                    const [, mo, day, hh, mm, ss, ms] = m;
                    const ts = Date.UTC(currentYear, (+mo) - 1, +day, +hh, +mm, +ss, +ms);
                    if (ts > nowMs) continue;       // year-rollover artefact
                    if (ts < cutoffMs) continue;    // outside the 10-min window
                    if (STATE_CORRUPT_RE.test(line)) recentStateHits += 1;
                    if (DOWNLOADER_FORK_RE.test(line)) recentDownloaderHits += 1;
                }
                if (recentStateHits >= 1) {
                    this.extensionHandle.log.debug(
                        `${ENM_LOG_PREFIX} _probeEvmForkSignal(${chainId}): state-corruption signature ×${recentStateHits} (silent-halt fork) within last 10min`,
                    );
                    return true;
                }
                if (recentDownloaderHits >= DOWNLOADER_MIN_HITS) {
                    this.extensionHandle.log.debug(
                        `${ENM_LOG_PREFIX} _probeEvmForkSignal(${chainId}): downloader-fork signature ×${recentDownloaderHits} within last 10min (threshold ${DOWNLOADER_MIN_HITS})`,
                    );
                    return true;
                }
                return false;
            } finally {
                await fd.close().catch(() => {});
            }
        } catch (err) {
            this.extensionHandle.log.debug(
                `${ENM_LOG_PREFIX} _probeEvmForkSignal(${chainId}) failed (non-fatal): ${err.message}`,
            );
            return false;
        }
    }

    /**
     * v0.5.185 (P0-A) — read an EVM chain's embedded-SPV height from its node
     * log. These chains log `GetCurrentConsensusMode ... spvHeight=N Mode=M`
     * continuously (esc src spv/blocklistener.go:218); we tail the newest log
     * and return the LAST spvHeight observed. Gates F26 (don't wipe a chain
     * whose SPV is still catching up — it can't validate yet) and suppresses
     * F4 sync-stall during SPV catch-up. Returns a number, or null if unknown.
     * Same bounded 64KB read as the fork/dpos probes; never throws.
     *
     * @param {string} chainId
     * @returns {Promise<number|null>}
     */
    async _probeEvmSpvHeight(chainId) {
        const PROBE_MAX_BYTES = 64 * 1024;
        const PATTERN = /spvHeight=(\d+)/g;
        try {
            const logDir = path.join(chainDir(chainId), 'logs');
            const entries = await fsp.readdir(logDir).catch(() => []);
            const logFiles = entries.filter((n) => /\.log$/.test(n));
            if (logFiles.length === 0) return null;
            logFiles.sort();
            const newest = logFiles[logFiles.length - 1];
            const full = path.join(logDir, newest);
            const stat = await fsp.stat(full).catch(() => null);
            if (!stat) return null;
            const startOffset = Math.max(0, stat.size - PROBE_MAX_BYTES);
            const fd = await fsp.open(full, 'r');
            try {
                const buf = Buffer.alloc(stat.size - startOffset);
                await fd.read(buf, 0, buf.length, startOffset);
                const text = buf.toString('utf8');
                let last = null;
                let m;
                while ((m = PATTERN.exec(text)) !== null) { last = m[1]; }
                return last !== null ? parseInt(last, 10) : null;
            } finally {
                await fd.close().catch(() => {});
            }
        } catch (err) {
            this.extensionHandle.log.debug(
                `${ENM_LOG_PREFIX} _probeEvmSpvHeight(${chainId}) failed (non-fatal): ${err.message}`,
            );
            return null;
        }
    }

    /**
     * v0.5.185 (P1-A) — detect a PBFT consensus-recovery STALL in an EVM chain's
     * node log: the node has peers + a flat height but is stuck unable to reach
     * quorum / recover state. Signatures (esc src consensus/pbft + network.go):
     * "wait for recoved states", "can not find active peer", "recover failed".
     * This is a re-peer / quorum problem — NOT a data fork — so a wipe+resync
     * (F26) cannot fix it and would waste days re-syncing a 20 GB chain. F27
     * surfaces it as an alert and detectF26 yields when this is set. Bounded
     * 64KB read; never throws.
     *
     * @param {string} chainId
     * @returns {Promise<boolean>}
     */
    async _probeEvmRecoveryStall(chainId) {
        const PROBE_MAX_BYTES = 64 * 1024;
        const PATTERN = /wait for recoved states|can not find active peer|recover failed/i;
        try {
            const logDir = path.join(chainDir(chainId), 'logs');
            const entries = await fsp.readdir(logDir).catch(() => []);
            const logFiles = entries.filter((n) => /\.log$/.test(n));
            if (logFiles.length === 0) return false;
            logFiles.sort();
            const newest = logFiles[logFiles.length - 1];
            const full = path.join(logDir, newest);
            const stat = await fsp.stat(full).catch(() => null);
            if (!stat) return false;
            const startOffset = Math.max(0, stat.size - PROBE_MAX_BYTES);
            const fd = await fsp.open(full, 'r');
            try {
                const buf = Buffer.alloc(stat.size - startOffset);
                await fd.read(buf, 0, buf.length, startOffset);
                return PATTERN.test(buf.toString('utf8'));
            } finally {
                await fd.close().catch(() => {});
            }
        } catch (err) {
            this.extensionHandle.log.debug(
                `${ENM_LOG_PREFIX} _probeEvmRecoveryStall(${chainId}) failed (non-fatal): ${err.message}`,
            );
            return false;
        }
    }

    /** @private */
    async _diskFree(chainId) {
        try {
            const dir = chainDir(chainId);
            const stats = await fsp.statfs(dir).catch(() => null);
            if (!stats) return null;
            const freeBytes = stats.bavail * stats.bsize;
            const totalBytes = stats.blocks * stats.bsize;
            return {
                freeGb: freeBytes / (1024 ** 3),
                totalGb: totalBytes / (1024 ** 3),
            };
        } catch (err) {
            this.extensionHandle.log.debug(
                `${ENM_LOG_PREFIX} disk free for ${chainId}: ${err.message}`,
            );
            return null;
        }
    }

    /** @private */
    async _binaryVersion(binaryPath) {
        if (!binaryPath || typeof binaryPath !== 'string') {
            return { ok: false };
        }
        if (!fs.existsSync(binaryPath)) {
            return { ok: false };
        }
        // EnmBinaryLocator.smokeTest is the canonical one-shot probe; we just
        // re-invoke it here so behavior is consistent with setup-wizard step 4.
        try {
            const Locator = require('./EnmBinaryLocator');
            const result = await Locator.smokeTest(binaryPath, { timeoutMs: 5_000 });
            return result.ok ? { ok: true, version: result.version } : { ok: false };
        } catch {
            return { ok: false };
        }
    }

    /** @private */
    _logTickErr(bucket) {
        return (err) => {
            this.extensionHandle.log.error(
                `${ENM_LOG_PREFIX} HealthChecker ${bucket} tick error: ${err.message}`,
            );
        };
    }
}

/**
 * beta.3.55 — decide whether a pending healing proposal's underlying
 * condition has cleared, given the current chain snapshot. Returns a
 * human-readable reason string when the proposal should be auto-resolved,
 * or null to leave it pending.
 *
 * Resolution rules (in order):
 *   F1 — restart on crash       → resolved if chain alive again
 *   F2 — restart on RPC down    → resolved if RPC reachable again
 *   F3 — restart on peers=0     → resolved if peer count > 0
 *   F6 — investigate OOM-kill   → resolved if chain stable
 *   F7 — port conflict          → never auto-resolved (operator must
 *                                 confirm the conflict is gone)
 *   F18 — no inbound peers      → resolved if peer count > 0
 *   default for action=restart  → resolved if chain alive + RPC reachable
 *   default otherwise           → never auto-resolved
 *
 * Why F7 is excluded: a port conflict can clear because the rogue
 * process exited OR because ela is now binding the port itself. We
 * can't tell which from inside ENM, and silently retiring the
 * proposal would hide a real "another node is running" warning from
 * the operator. They have to look at it.
 *
 * @param {object} proposal     row from listPendingByChain
 * @param {object} status       processStatus (alive=true at call site)
 * @param {object} rpcSummary   {ok: true, peers?: number, ...}
 * @returns {string|null}
 */
function describeAutoResolveReason(proposal, status, rpcSummary) {
    if (!proposal || !status || !status.alive || !rpcSummary || !rpcSummary.ok) {
        return null;
    }
    const ruleId = proposal.rule_id;
    let payload = null;
    try {
        if (proposal.payload_json) {
            payload = JSON.parse(proposal.payload_json);
        }
    } catch (_) { /* leave payload null */ }

    // Per-rule semantics:
    if (ruleId === 'F1') {
        return 'Chain is running again — restart no longer needed.';
    }
    if (ruleId === 'F2') {
        return 'RPC is reachable again — restart no longer needed.';
    }
    if (ruleId === 'F3' || ruleId === 'F18') {
        if (typeof rpcSummary.peers === 'number' && rpcSummary.peers > 0) {
            return `Peer count recovered (${rpcSummary.peers}) — proposal no longer applies.`;
        }
        return null;
    }
    if (ruleId === 'F4') {
        // beta.3.57 — F4 "sync stalled" must NOT use the generic
        // "chain healthy" rule because F4 FIRES when chain is healthy
        // (alive + RPC + peers). Its premise is "height stalled", so
        // the only valid resolution is "height moved past the height
        // that was stuck". The proposal's payload carries stuckHeight
        // captured at detection time; we resolve only when the live
        // rpcSummary.height exceeds it.
        //
        // Without this guard, beta.3.55+ created an infinite cycle:
        // F4 detects → propose → auto-resolve "chain healthy" → next
        // tick F4 detects again (still stuck) → propose → auto-resolve
        // → ... fast-tick rate spam at 12 proposals/min.
        const stuckAt = payload && typeof payload.stuckHeight === 'number'
            ? payload.stuckHeight
            : null;
        if (stuckAt != null && typeof rpcSummary.height === 'number'
            && rpcSummary.height > stuckAt) {
            return `Height advanced (${stuckAt} → ${rpcSummary.height}) — stall cleared.`;
        }
        // Still stuck (or no payload) → leave pending. Operator's
        // notification panel will show ONE F4 proposal at a time
        // (deduped by the engine), not a flood.
        return null;
    }
    if (ruleId === 'F6') {
        return 'Chain has been stable since the OOM-kill — investigation no longer urgent.';
    }
    if (ruleId === 'F7') {
        // Port conflict — operator must confirm; never auto-resolve.
        return null;
    }

    // beta.3.57 — REMOVED the generic "action==='restart' → resolve"
    // fallback. It was unsafe: F4 fires WHEN the chain looks healthy
    // (alive+RPC+peers) so the fallback resolved F4 instantly, breaking
    // the proposal dedupe and creating a spam loop. Each rule whose
    // proposed action is "restart" must declare its own resolution
    // condition above. If a rule isn't listed here, its proposals are
    // never auto-resolved — they expire via the TTL sweep instead.
    return null;
}

module.exports = {
    HealthChecker,
    // exported for tests
    _internal: { describeAutoResolveReason },
};
