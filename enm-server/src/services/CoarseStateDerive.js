/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * CoarseStateDerive — single source for the chain "coarse state" vocabulary
 * used by both the multi-chain overview pane and the per-chain dashboard.
 *
 * Why this exists: pre-v0.5.203, two separate derivations existed and they
 * disagreed:
 *
 *   - CouncilOverviewService.coarseState() returned 5 values:
 *       unconfigured | disabled | stopped | starting | running
 *     ("running" was used for any alive chain past the 60s startup grace —
 *      including chains stuck mid-sync or with no peers)
 *
 *   - chains.js deriveCoarseState() returned a different 5 values:
 *       unconfigured | disabled | stopped | healthy | syncing
 *     ("healthy" for class C/D alive; "syncing" for alive class A/B that
 *      weren't synced)
 *
 * Result: the same alive arbiter showed "Running" in the overview and
 * "Healthy" in the per-chain dashboard. Operators ended up trusting one
 * label and being surprised by the other.
 *
 * v0.5.203 — both callers now use derive() below, which returns one of
 * SEVEN states. The new vocabulary makes the overview's "syncing vs
 * running" distinction explicit + adds 'stalled' for the
 * alive-but-not-advancing case + adds 'starting' as the
 * alive-but-RPC-not-yet-bound case (the mainchain leveldb-compaction case
 * we hit during the v0.5.200 deploy postmortem).
 *
 * State semantics (in priority order — first match wins):
 *
 *   - unconfigured: cfg.chains[id] is null/undefined (chain not set up)
 *   - disabled:     cfg present, operator-disabled (enabled !== true)
 *   - stopped:      cfg.enabled === true, process not alive
 *   - starting:     alive AND uptimeSec < STARTUP_GRACE_SEC (60s by default).
 *                   Also returned when alive but RPC is not yet responsive
 *                   even past the grace window (the "alive-but-blank-rpc"
 *                   case — caller can pass rpcResponsive:false to force it).
 *   - synced:       alive AND (class C/D pgrep-healthy) OR (class A/B/E
 *                   synced=true OR blocksBehind=0)
 *   - syncing:      alive AND syncState='syncing' (catching up)
 *   - stalled:      alive AND syncState='stalled' (no progress for N min)
 *
 * Any state not derivable from inputs falls through to 'starting' (the
 * safest "we don't know yet" bucket — it's a transient label and self-heal
 * will resolve it on the next tick).
 */

'use strict';

// Startup grace window before we expect RPC to be bound + height to flow.
// Mirrors CouncilOverviewService.STARTUP_GRACE_SEC. The overview pane treats
// every chain inside this window as 'starting' so a fresh autoStart doesn't
// blink through 'stopped → syncing'.
const STARTUP_GRACE_SEC = 60;

/**
 * The full ordered enumeration of states. Exposed so the frontend strings.js
 * loader can iterate + ensure every label has copy. Order is the
 * priority-of-render: a chain that matches multiple predicates picks the
 * EARLIER entry.
 */
const STATES = Object.freeze([
    'unconfigured',
    'disabled',
    'stopped',
    'starting',
    'synced',
    'syncing',
    'stalled',
]);

/**
 * Derive the coarse state for one chain.
 *
 * @param {object} args
 * @param {boolean} args.alive  Process is up (NativeProcessService.statusSync().alive)
 * @param {object|null} args.chainCfg  cfg.chains[id] — null/undefined if unconfigured
 * @param {number|null} args.uptimeSec  Seconds since process started; null if not alive
 * @param {string|null} args.chainClass  'A' | 'B' | 'C' | 'D' | 'E' | null
 * @param {string|null} [args.syncState]  'synced' | 'syncing' | 'stalled' | null
 *                       (from SyncTracker; null when no network reference available)
 * @param {boolean} [args.rpcResponsive]  When false, forces 'starting' even past
 *                       the grace window. Caller (chains.js detail) knows this
 *                       from the most recent RPC probe.
 * @returns {string} one of STATES
 */
function derive(args) {
    const a = args || {};
    if (!a.chainCfg) { return 'unconfigured'; }
    if (!a.alive) { return a.chainCfg.enabled ? 'stopped' : 'disabled'; }

    // Within the grace window OR RPC explicitly unresponsive → 'starting'.
    const inGrace = (typeof a.uptimeSec === 'number' && a.uptimeSec < STARTUP_GRACE_SEC);
    if (inGrace || a.rpcResponsive === false) { return 'starting'; }

    // Class C (oracles) + Class D (arbiter) are services, not chains that
    // sync to a tip. node.sh treats them as pgrep-healthy = good. Return
    // 'synced' for the green dot — operators read this as "doing its job".
    // (Pre-v0.5.203 the chains.js detail used 'healthy' here; merged to
    // 'synced' so the chip vocabulary is uniform across all classes.)
    if (a.chainClass === 'C' || a.chainClass === 'D') { return 'synced'; }

    // Class A/B/E — use the SyncTracker-derived syncState.
    if (a.syncState === 'synced') { return 'synced'; }
    if (a.syncState === 'stalled') { return 'stalled'; }
    if (a.syncState === 'syncing') { return 'syncing'; }

    // v0.5.211 — safety net for "no syncState yet but chain clearly past
    // startup." The 2026-05-24 incident: EVM chains stuck in 'starting'
    // forever in the overview because HealthChecker wasn't pushing
    // networkHeight to SyncTracker for class B (now fixed) — but even with
    // that fix, there's a window between chain start + first networkHeight
    // sample where syncState is null. If the chain has peers (handshakes
    // succeeded → RPC works), 'syncing' is a more honest label than
    // 'starting' for the operator. peers===0 stays 'starting' (chain still
    // bootstrapping its peer table).
    if (typeof a.peers === 'number' && a.peers > 0) {
        return 'syncing';
    }

    // Alive past grace, RPC responsive (caller didn't pass false), no
    // syncState available yet (height samples not collected yet by the
    // SyncTracker). Best label: 'starting' — we know less than we did when
    // the chain was inside the grace window, so don't lie about 'synced'.
    return 'starting';
}

module.exports = {
    derive,
    STATES,
    STARTUP_GRACE_SEC,
};
