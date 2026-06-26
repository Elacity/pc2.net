/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmStageSyncOrchestrator — backend staged initial-sync for constrained hosts.
 *
 * v0.5.236 (operator directive 2026-05-28: "lower-end recommended hardware
 * should have an option to run 2 chains at once and sync the rest when the
 * first two are fully synced — initial sync takes the most resources").
 *
 * WHY BACKEND (not the frontend EnmStageSync):
 *   The Council install brings up 8 services; on a constrained host the
 *   simultaneous EVM *full*-sync of esc + eid + pg (v0.5.235 made them full,
 *   heavier than the old fast-sync) saturates CPU and the provider pauses the
 *   VPS. A from-genesis full-sync now takes hours-to-days, so the operator WILL
 *   close the wizard tab — the frontend-only EnmStageSync (utils-stage-sync.js)
 *   dies with the tab. This is the backend port that utils-stage-sync.js's own
 *   header called "a future Phase 22.1 ... survives tab close, single source of
 *   truth."
 *
 * MODEL — sliding window of N (default 2) over the HEAVY chains:
 *   Heavy chains = class A (mainchain) + class B (esc/eid/pg) — the ones with a
 *   real height to sync. Start at most N concurrently; when one reaches the
 *   network tip, free its slot and start the next pending heavy chain. Light
 *   services don't count against the window:
 *     - An EVM chain's oracle (class C) is started alongside its parent ("they
 *       should run together" — operator 2026-05-27); it's a light node script.
 *     - The arbiter (class D) starts after all heavy chains are up (it SPV-syncs
 *       independently and needs all four chains alive).
 *
 * IDEMPOTENT / RESUMABLE:
 *   No persisted progress file — the LIVE chain states ARE the progress. On each
 *   (re)start the orchestrator re-derives, per heavy chain: synced→done,
 *   alive-but-behind→inflight (counts against the window), stopped→pending. So a
 *   host reboot mid-stage resumes cleanly, and once everything is synced a normal
 *   boot just starts everything (all already at tip → light).
 *
 * STALL SAFETY:
 *   A genuinely-stuck heavy chain must not block the window forever. We track
 *   blocksBehind per inflight chain; if it fails to DECREASE for
 *   STALL_GRACE_TICKS consecutive polls (~20 min) while still behind, we free its
 *   slot (start the next pending chain) and log a warning — the stuck chain stays
 *   running and the F-rule self-heal engine surfaces it to the operator. This is
 *   progress-based, NOT wall-clock, because a legitimate full-sync is slow but
 *   progressing and must keep its slot.
 */

'use strict';

const { ENM_LOG_PREFIX } = require('./EnmConstants');
const ConfigStore = require('./ConfigStore');
const ChainAdapter = require('./ChainAdapter');
const AuditLog = require('./EnmAuditLog');

const SYSTEM_WALLET = 'system';

// Poll cadence — sync state moves slowly (full-sync executes blocks), so a
// 15s tick is plenty and keeps RPC pressure negligible.
const POLL_MS = 15000;
// "Caught up" threshold: blocksBehind at or under this frees the window slot.
// A few blocks of lag is normal (the network keeps producing); we don't wait
// for an exact 0 that a live chain never durably hits.
const SYNCED_BLOCKS_THRESHOLD = 8;
// Stall detection: if blocksBehind doesn't decrease across this many
// consecutive polls (~20 min at 15s) while still behind, treat the slot as
// freeable so the remaining chains aren't blocked by one stuck chain.
const STALL_GRACE_TICKS = 80;

let _running = false;     // module-level guard — one orchestration at a time
let _cancelled = false;

/**
 * Is this chain "done" for window purposes?
 *   - class C/D services: alive === done (no height to sync).
 *   - class A/B heavy chains: alive AND blocksBehind <= threshold.
 * Returns { done, alive, blocksBehind }.
 */
function inspectChain(chainId, proc, registry) {
    const cls = ChainAdapter.classOf(chainId);
    let alive = false;
    try {
        const st = proc.statusSync(chainId);
        alive = !!(st && st.alive);
    } catch (_) { alive = false; }
    if (!alive) { return { done: false, alive: false, blocksBehind: null }; }
    if (cls === 'C' || cls === 'D') { return { done: true, alive: true, blocksBehind: null }; }
    // Heavy chain — consult SyncTracker for blocksBehind.
    let blocksBehind = null;
    try {
        const snap = registry.getSyncTracker().syncSnapshot(chainId);
        if (snap && typeof snap.blocksBehind === 'number') { blocksBehind = snap.blocksBehind; }
    } catch (_) { /* tracker not ready — treat as unknown */ }
    const done = (typeof blocksBehind === 'number') && (blocksBehind <= SYNCED_BLOCKS_THRESHOLD);
    return { done, alive: true, blocksBehind };
}

/** Start one chain via its adapter; audit the outcome. Never throws. */
async function startChain(chainId, registry, db, log) {
    const startedAtMs = Date.now();
    try {
        const cfg = await ConfigStore.load();
        const chainCfg = cfg.chains && cfg.chains[chainId];
        if (!chainCfg) { log.warn(`${ENM_LOG_PREFIX} stage-sync: ${chainId} not in cfg — skip`); return false; }
        const adapter = registry.getAdapter(chainId);
        await adapter.start(chainCfg);
        const durationMs = Date.now() - startedAtMs;
        log.info(`${ENM_LOG_PREFIX} stage-sync: started ${chainId} in ${durationMs}ms`);
        await safeAudit(db, log, {
            chainId, decision: 'executed', durationMs,
            outcome: `Staged-start ${chainId} on ENM boot`,
        });
        return true;
    } catch (err) {
        const durationMs = Date.now() - startedAtMs;
        log.warn(`${ENM_LOG_PREFIX} stage-sync: ${chainId} start failed (${err.message}) — F1 will retry`);
        await safeAudit(db, log, {
            chainId, decision: 'failed', durationMs,
            outcome: `Staged-start failed: ${err.message}`,
        });
        return false;
    }
}

/**
 * Run the staged bring-up. Returns immediately after seeding; the window
 * advances on a setTimeout poll loop.
 *
 * @param {object} args
 * @param {object} args.extensionHandle
 * @param {object} args.registry
 * @param {string[]} args.chainIds       full ordered list (class A→D) from autoStart
 * @param {number}  [args.concurrency]   heavy-chain window size (default 2)
 */
function startStaged(args) {
    const { extensionHandle, registry, chainIds } = args;
    const log = (extensionHandle && extensionHandle.log) || console;
    const N = (Number.isInteger(args.concurrency) && args.concurrency >= 1) ? args.concurrency : 2;
    if (_running) {
        log.info(`${ENM_LOG_PREFIX} stage-sync: already running — ignoring duplicate start`);
        return { started: false, reason: 'already-running' };
    }
    _running = true;
    _cancelled = false;

    const proc = registry.getProcessService();
    let db = null;
    try { db = extensionHandle.import('data').db; } catch (_) { db = null; }
    let sseHub = null;
    try { sseHub = registry.getSseHub(); } catch (_) { sseHub = null; }

    // Partition the autoStart-ordered list into heavy (A/B, windowed) + the
    // light services (C oracles / D arbiter) that ride alongside / trail.
    const heavyAll = chainIds.filter((c) => {
        const k = ChainAdapter.classOf(c);
        return k === 'A' || k === 'B';
    });
    const arbiterId = chainIds.find((c) => ChainAdapter.classOf(c) === 'D') || null;

    // Window state.
    const pending = heavyAll.slice();   // heavy chains not yet started this run
    const inflight = new Map();         // chainId → { lastBehind, stallTicks }
    const done = new Set();             // heavy chains at tip
    const startedOracles = new Set();   // oracles we've already paired-started
    let arbiterStarted = false;

    // Seed from LIVE state so a restart resumes mid-stage.
    for (let i = pending.length - 1; i >= 0; i -= 1) {
        const cid = pending[i];
        const s = inspectChain(cid, proc, registry);
        if (s.done) {
            done.add(cid);
            pending.splice(i, 1);
        } else if (s.alive) {
            inflight.set(cid, { lastBehind: s.blocksBehind, stallTicks: 0 });
            pending.splice(i, 1);
        }
    }

    log.info(
        `${ENM_LOG_PREFIX} stage-sync: starting (window=${N}) — `
        + `heavy=[${heavyAll.join(', ')}] seeded done=[${[...done].join(', ')}] `
        + `inflight=[${[...inflight.keys()].join(', ')}] pending=[${pending.join(', ')}]`,
    );

    // Pair an EVM chain's oracle (start it alongside the parent — light).
    async function pairOracle(parentId) {
        const oracleId = ChainAdapter.oracleOf(parentId);
        if (!oracleId || startedOracles.has(oracleId)) { return; }
        const cfg = await ConfigStore.load();
        if (!cfg.chains || !cfg.chains[oracleId]) { return; }
        startedOracles.add(oracleId);
        await startChain(oracleId, registry, db, log);
    }

    function emit(phase) {
        if (!sseHub) { return; }
        try {
            sseHub.publish('stage-sync:status', {
                phase,
                window: N,
                done: [...done],
                inflight: [...inflight.keys()],
                pending: pending.slice(),
                arbiterStarted,
            });
        } catch (_) { /* SSE best-effort */ }
    }

    // Fill free window slots from pending; pair each started chain's oracle.
    async function fillSlots() {
        while (inflight.size < N && pending.length > 0) {
            const cid = pending.shift();
            inflight.set(cid, { lastBehind: null, stallTicks: 0 });
            emit('starting');
            const ok = await startChain(cid, registry, db, log);
            if (!ok) {
                // start failed — drop from inflight so F1 handles it and the
                // window isn't permanently consumed by a chain that won't boot.
                inflight.delete(cid);
            }
            await pairOracle(cid);
        }
    }

    async function tick() {
        if (_cancelled) { _running = false; return; }
        // Advance inflight → done; detect stalls.
        for (const [cid, meta] of [...inflight.entries()]) {
            const s = inspectChain(cid, proc, registry);
            if (s.done) {
                inflight.delete(cid);
                done.add(cid);
                await pairOracle(cid); // ensure oracle up even if pair on start was skipped
                emit('synced');
                log.info(`${ENM_LOG_PREFIX} stage-sync: ${cid} reached tip — freeing slot`);
                continue;
            }
            // Stall detection — blocksBehind must keep decreasing.
            if (typeof s.blocksBehind === 'number') {
                if (meta.lastBehind != null && s.blocksBehind >= meta.lastBehind) {
                    meta.stallTicks += 1;
                } else {
                    meta.stallTicks = 0;
                }
                meta.lastBehind = s.blocksBehind;
                if (meta.stallTicks >= STALL_GRACE_TICKS) {
                    log.warn(
                        `${ENM_LOG_PREFIX} stage-sync: ${cid} stalled (blocksBehind=${s.blocksBehind} `
                        + `not decreasing for ${STALL_GRACE_TICKS} polls) — freeing slot so the rest `
                        + 'can proceed; the chain keeps running and F-rule self-heal will surface it.',
                    );
                    inflight.delete(cid);
                    emit('stalled');
                }
            }
        }

        await fillSlots();

        // All heavy chains done? Start the arbiter (last) and finish.
        if (pending.length === 0 && inflight.size === 0) {
            if (arbiterId && !arbiterStarted) {
                arbiterStarted = true;
                emit('arbiter-starting');
                await startChain(arbiterId, registry, db, log);
            }
            emit('complete');
            log.info(`${ENM_LOG_PREFIX} stage-sync: complete — all heavy chains synced; services up`);
            _running = false;
            return;
        }
        setTimeout(() => { tick().catch((e) => {
            log.error(`${ENM_LOG_PREFIX} stage-sync tick crashed: ${e.message}`);
            _running = false;
        }); }, POLL_MS);
    }

    // Kick the first fill + loop.
    fillSlots()
        .then(() => { emit('waiting'); return tick(); })
        .catch((e) => {
            log.error(`${ENM_LOG_PREFIX} stage-sync initial fill crashed: ${e.message}`);
            _running = false;
        });

    return { started: true, window: N, heavy: heavyAll, pending: pending.slice() };
}

function cancel() { _cancelled = true; }
function isRunning() { return _running; }

async function safeAudit(db, log, args) {
    // v0.5.236 — shared null-guard + try/catch via AuditLog.safeAppend; this
    // wrapper keeps the stage-sync-specific entry fields. Behavior unchanged.
    await AuditLog.safeAppend(db, log, {
        walletAddress: SYSTEM_WALLET,
        chainId: args.chainId,
        ruleId: null,
        tier: 'AUTOMATED-SAFE',
        decision: args.decision,
        executor: 'system',
        outcome: args.outcome,
        durationMs: args.durationMs,
        payload: { action: 'stage-sync' },
    });
}

module.exports = { startStaged, cancel, isRunning };
