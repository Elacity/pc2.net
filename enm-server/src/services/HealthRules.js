/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * HealthRules — F1-F10 detection logic.
 *
 * Pure functions: each rule receives a snapshot of inputs and returns either
 * null (no fire) or a detection object the SelfHealingEngine can act on. The
 * checker module collects snapshots (process state, RPC results, disk free,
 * config validation) and feeds rules in order.
 *
 * Rules are stateless. State that drifts over time (height-unchanged-for-10-min,
 * peer-zero-for-5-min, restart-attempt-counts) is held in HealthChecker so the
 * rules themselves stay easy to test. Each rule receives the relevant slice of
 * timeline + the current snapshot.
 *
 * Tier mapping per Rev 9 plan, "Self-healing engine":
 *   F1, F2, F3            AUTOMATED-SAFE  (engine acts; logs to audit)
 *   F4, F5, F6, F7, F8, F9, F10  OWNER-CONFIRMS  (engine creates a proposal)
 *
 * F11-F15 (BPoS, clock skew, daemon, audit corruption) are Phase 5+.
 */

'use strict';

const { HEALING_TIERS, MAX_INACTIVE_ROUNDS } = require('./EnmConstants');

// Thresholds — beta.3.19 made these mutable so HealthChecker can push
// operator-tuned values in from cfg.global.notifications.thresholds at
// each tick. Defaults match the alpha.28 hardcoded values so behavior
// is identical when no override is configured. RPC_UNREACHABLE_GRACE_MS
// stays a const for now — operator audit didn't flag it as a knob worth
// exposing and the 2-min grace is well-calibrated.
let PEER_ZERO_GRACE_MS         = 5 * 60_000;
const RPC_UNREACHABLE_GRACE_MS = 2 * 60_000;
let HEIGHT_STALL_GRACE_MS      = 10 * 60_000;
let DISK_CRITICAL_GB           = 5;
let DISK_WARN_GB               = 20;

// FIX-C15 — initial-start grace. node.sh never restarts a node just for
// being fresh/at-genesis with no peers; it starts a node and leaves it
// alone. Our self-heal F2 (RPC unreachable), F3 (peers=0), and F4 (sync
// stalled) could otherwise restart a chain that is merely still coming up —
// a freshly-started EVM sidechain or arbiter has no RPC, no peers, and a
// flat height for the first minutes by definition. Suppress F2/F3/F4 for
// the first N minutes after the chain process came alive. The per-rule
// grace timers (RPC ≥2min, peer-zero ≥5min, height-stall ≥10min) overlap
// with this but key off DIFFERENT first-seen timestamps; this gate keys off
// the process's own up-since time so the WHOLE early-boot window is quiet
// regardless of when the individual condition timers first armed.
const INITIAL_SYNC_GRACE_MS    = 10 * 60_000;

/**
 * beta.3.19 — apply operator-tuned thresholds from
 * cfg.global.notifications.thresholds. Called by HealthChecker on
 * every tick (cheap, idempotent). Unset / invalid fields are
 * ignored — they fall back to the defaults above. Cross-field
 * validation (criticalGb < warnGb) is enforced upstream in the Joi
 * schema; this function trusts its input.
 *
 * @param {{diskFreeWarnGb?:number, diskFreeCriticalGb?:number,
 *          peerZeroGraceMin?:number, syncStallGraceMin?:number}} overrides
 */
function setThresholds(overrides) {
    if (!overrides || typeof overrides !== 'object') { return; }
    if (Number.isFinite(overrides.diskFreeWarnGb)) {
        DISK_WARN_GB = overrides.diskFreeWarnGb;
    }
    if (Number.isFinite(overrides.diskFreeCriticalGb)) {
        DISK_CRITICAL_GB = overrides.diskFreeCriticalGb;
    }
    if (Number.isFinite(overrides.peerZeroGraceMin)) {
        PEER_ZERO_GRACE_MS = overrides.peerZeroGraceMin * 60_000;
    }
    if (Number.isFinite(overrides.syncStallGraceMin)) {
        HEIGHT_STALL_GRACE_MS = overrides.syncStallGraceMin * 60_000;
    }
}

/** beta.3.19 — current effective threshold values (used by tests + the
 *  frontend Alerts section's GET round-trip to read what's live). */
function getThresholds() {
    return {
        diskFreeWarnGb:     DISK_WARN_GB,
        diskFreeCriticalGb: DISK_CRITICAL_GB,
        peerZeroGraceMin:   PEER_ZERO_GRACE_MS / 60_000,
        syncStallGraceMin:  HEIGHT_STALL_GRACE_MS / 60_000,
    };
}

/**
 * FIX-C15 — resolve the timestamp (ms epoch) at which the chain's current
 * up-period began, or null when unknown.
 *
 * HealthChecker maintains `ruleState._aliveSinceMs`: it is set on the first
 * tick the process is observed alive, grows monotonically while up, and is
 * reset to null the moment a dead tick is seen (HealthChecker.js:219-226).
 * That makes it the contiguous "process start" timestamp for the running
 * instance — and it re-arms cleanly after a restart, so each fresh up-period
 * gets its own grace window. It is the only start-time signal reachable from
 * the snapshot the rules receive (statusSync exposes no startedAt; the meta
 * sidecar's startedAt is not threaded into snap).
 *
 * @param {object} snap
 * @returns {number|null} ms epoch the process came alive, or null if unknown
 */
function processAliveSinceMs(snap) {
    if (!snap || !snap.ruleState) return null;
    const t = snap.ruleState._aliveSinceMs;
    return (typeof t === 'number' && t > 0) ? t : null;
}

/**
 * FIX-C15 — true when the chain came alive less than INITIAL_SYNC_GRACE_MS
 * ago (so restart-on-fresh-start rules F2/F3/F4 must hold their fire). When
 * the start time is unknown we return false (do NOT suppress) — the existing
 * per-rule grace timers still apply, so this stays safe rather than silently
 * disabling healing.
 *
 * @param {object} snap
 * @returns {boolean}
 */
function withinInitialStartGrace(snap) {
    const since = processAliveSinceMs(snap);
    if (since == null) return false;
    return (Date.now() - since) < INITIAL_SYNC_GRACE_MS;
}

// Phase 5 thresholds.
const PEER_ZERO_FALLBACK_MS      = 10 * 60_000;       // F16 — promote to fallback peer suggestion
const NO_INBOUND_GRACE_MS        = 5 * 60_000;        // F18 — BPoS needs inbound peers
const CLOCK_SKEW_WARN_MS         = 2_000;             // F13 — well below ELA's 4.2s tolerance
const PRODUCER_INACTIVE_WARN     = 720;               // F12 — inactiveRounds approaching MAX_INACTIVE_ROUNDS/2
const PRODUCER_INACTIVE_CRITICAL = 1300;              // F12 — close to forced-inactive at 1440

// v0.5.184 — F26 wedged-EVM-fork grace. Deliberately LONGER than F4's 10-min
// height-stall grace: F26's action is a destructive resync (wipe + re-sync from
// genesis), so we want extra certainty the chain is genuinely wedged — not just
// in a slow snap-sync batch or a brief peer churn — before triggering it. The
// fork log-signature (≥10 "retrieved hash chain is invalid" in HealthChecker's
// probe, all timestamped within the last 10 min) is the definitive marker; this
// grace ensures the wedge has persisted.
const EVM_FORK_STALL_GRACE_MS    = 20 * 60_000;

// v0.5.231 — F26 near-tip safety gate. A chain whose local head is within this
// many blocks of the peer-reported network tip is NOT considered forked, no
// matter what log signatures appear — it's just slow-syncing. Sized for ~5.8d
// of 5s EVM blocks: enough headroom for a chain genuinely behind to still get
// help, but tight enough that a 12k-block lag (~16h) gets a hard veto and a
// destructive wipe is never proposed on a near-fully-synced chain. (Anchor:
// F26 wiped EID at 27,835,801 vs tip 27,847,941 on 2026-05-27 — only 12k
// blocks behind, classified as "stuck" → 16h of sync work destroyed.)
const F26_NEAR_TIP_BLOCKS_GUARD  = 100_000;

// v0.5.231 — F26 multi-tick consecutive-signature gate. The 64KB log probe is
// stateless and a single tick can catch a transient burst of fork-like errors
// that resolve within seconds; require the signature to PERSIST across this
// many consecutive medium ticks (~30s each, so ~90s of unbroken evidence)
// before proposing a wipe. Counter is owned by HealthChecker, resets to 0 on
// any negative probe or any height advance.
const F26_CONSECUTIVE_TICKS_MIN  = 3;

// v0.5.185 (P0-B) — max per-medium-tick (30s) SPV-height advance still counted
// as "tracking the mainchain tip" rather than an initial bulk header download.
// Normal tip-tracking moves ~tens of blocks per 30s; a fresh SPV catching up
// moves thousands. Above this delta the embedded SPV client is still syncing,
// so the EVM chain legitimately can't validate yet — F26 must NOT wipe it (the
// "fork" would just be SPV-not-ready, and a resync would re-fork identically).
const SPV_CAUGHTUP_MAX_DELTA      = 2000;

/**
 * @typedef {object} HealthSnapshot
 * @property {string} chainId
 * @property {object} processStatus  { alive: boolean, pid: number|null, attached: boolean }
 * @property {object} processExit    { code: number|null, signal: string|null, manualStop: boolean }|null
 *                                   — populated by HealthChecker on most-recent exit
 * @property {object|null} rpcSummary { ok: boolean, errCode?: string, height?: number,
 *                                       peers?: number, latencyMs?: number }
 * @property {object|null} diskInfo  { freeGb: number, totalGb: number }
 * @property {object|null} ports     { conflicting: Array<{port:number, role:string}> }
 * @property {object|null} configValidation { ok: boolean, error?: string }
 * @property {object|null} chainConfig
 * @property {object} ruleState      timeline state from HealthChecker:
 *   { firstPeerZeroAt, firstRpcDownAt, firstHeightStallAt, lastHeight, restartAttempts, lastBinaryVersion }
 */

/**
 * @typedef {object} Detection
 * @property {string} ruleId        F1, F2, ...
 * @property {string} tier          AUTOMATED-SAFE | OWNER-CONFIRMS | CRITICAL-NOTIFY
 * @property {string} summaryAction short imperative for the proposal card
 * @property {string} [summaryReason] more detail (1-2 sentences)
 * @property {object} [payload]     opaque to the engine; consumed by execute()
 * @property {string} [severity]    optional — defaults to severity-by-tier
 */

/**
 * F1 — process exited unexpectedly.
 * Detection: process is dead, last exit was non-zero or SIGKILL, AND the user
 * did not manually stop it.
 */
function detectF1(snap) {
    if (!snap || !snap.processStatus) return null;
    if (snap.processStatus.alive) return null;
    if (!snap.chainConfig || snap.chainConfig.enabled !== true) {
        // Operator disabled the chain — silence is correct.
        return null;
    }

    const exit = snap.processExit;
    // No exit info means we never observed the process die — first-boot or
    // pre-reattach. Treat as not-yet-known; we do NOT fire F1 in that case.
    if (!exit) return null;
    if (exit.manualStop) return null;

    // exit code 0 + no signal: clean operator-initiated shutdown via SIGTERM
    // that the process handled gracefully. Skip — same intent as manualStop.
    const cleanlyExited = exit.code === 0 && !exit.signal;
    if (cleanlyExited) return null;

    return {
        ruleId: 'F1',
        tier: HEALING_TIERS.AUTOMATED_SAFE,
        summaryAction: `Restart ${snap.chainId}`,
        summaryReason: `Process exited (code=${exit.code}, signal=${exit.signal || 'none'}) — auto-restart.`,
        payload: { action: 'restart', chainId: snap.chainId },
    };
}

/**
 * F2 — RPC unreachable for >= 2 minutes despite process being alive.
 * Common causes: ela startup not finished, RPC binding failure, port hijack.
 */
function detectF2(snap) {
    if (!snap || !snap.processStatus || !snap.processStatus.alive) return null;
    if (!snap.rpcSummary) return null;
    if (snap.rpcSummary.ok) return null;

    // FIX-C15 — a just-started chain has no RPC yet (geth/ela open the HTTP
    // endpoint a little after boot). Don't restart it during the initial
    // start grace; node.sh never restarts a node merely for being fresh.
    if (withinInitialStartGrace(snap)) return null;

    // We need at least RPC_UNREACHABLE_GRACE_MS of continuous failure.
    const firstDown = snap.ruleState && snap.ruleState.firstRpcDownAt;
    if (!firstDown) return null;
    if (Date.now() - firstDown < RPC_UNREACHABLE_GRACE_MS) return null;

    return {
        ruleId: 'F2',
        tier: HEALING_TIERS.AUTOMATED_SAFE,
        summaryAction: `Restart ${snap.chainId} (RPC unreachable)`,
        summaryReason: `RPC has been unreachable for >2 minutes (${snap.rpcSummary.errCode || 'unknown'}).`,
        payload: { action: 'restart', chainId: snap.chainId },
    };
}

/**
 * F3 — peer count zero for >= 5 minutes.
 * Heals by restarting networking (i.e., restart the chain — ela reseeds peers
 * from DNS on startup per p2p/server/seed.go:80).
 */
function detectF3(snap) {
    if (!snap || !snap.processStatus || !snap.processStatus.alive) return null;
    if (!snap.rpcSummary || !snap.rpcSummary.ok) return null;
    if (snap.rpcSummary.peers !== 0) return null;

    // FIX-C15 — a freshly-started node has 0 peers until it dials the DNS
    // seeds and completes handshakes. Don't restart during the initial start
    // grace; restarting just resets the same cold-start clock.
    if (withinInitialStartGrace(snap)) return null;

    const firstZero = snap.ruleState && snap.ruleState.firstPeerZeroAt;
    if (!firstZero) return null;
    if (Date.now() - firstZero < PEER_ZERO_GRACE_MS) return null;

    return {
        ruleId: 'F3',
        tier: HEALING_TIERS.AUTOMATED_SAFE,
        summaryAction: `Restart ${snap.chainId} (no peers)`,
        summaryReason: 'Peer count has been 0 for >5 minutes. Restarting reseeds from DNS.',
        payload: { action: 'restart', chainId: snap.chainId },
    };
}

/**
 * F4 — sync stalled. Height has not advanced for >= 10 minutes despite RPC
 * being healthy and peers connected.
 */
function detectF4(snap) {
    if (!snap || !snap.processStatus || !snap.processStatus.alive) return null;
    if (!snap.rpcSummary || !snap.rpcSummary.ok) return null;
    if (typeof snap.rpcSummary.height !== 'number') return null;
    if (snap.rpcSummary.peers === 0) return null;  // F3 owns this case

    // v0.5.184 — F26 owns the wedged-EVM-fork case. When the log probe has
    // confirmed the "retrieved hash chain is invalid" fork signature, a plain
    // restart (F4's action) does NOT help — geth comes back on the same
    // forked head and re-wedges. F26 (which runs before F4 and wipes+resyncs)
    // handles it. Yield here so the operator doesn't also get F4's useless
    // restart proposal for the same condition.
    if (snap.evmForkDetected) return null;
    // v0.5.185 (P1-C) — suppress the generic sync-stall restart while a Class B
    // chain's SPV client is still catching up: its height legitimately can't
    // advance until SPV reaches the tip, so a restart neither helps nor is the
    // stall a fault. evmSpvReady is set (true/false) only for Class B.
    if (snap.evmSpvReady === false) return null;
    // v0.5.185 (P1-A) — a PBFT recovery stall is owned by F27 (alert-only). A
    // generic F4 restart can loop on a quorum problem, so yield here too.
    if (snap.evmRecoveryStall) return null;

    // FIX-C15 — height legitimately sits flat right after start (a node at
    // genesis, or one that just restored a snapshot, hasn't begun advancing
    // yet). Don't treat that as a stall during the initial start grace.
    if (withinInitialStartGrace(snap)) return null;

    // v0.5.228 audit — false-positive stall suppression. If our height is at
    // (or within 1 block of) the network's best known height, the chain isn't
    // stalled — the WHOLE network just hasn't produced new blocks recently.
    // Elastos mainchain can go 10-20 min between blocks during quiet periods;
    // pre-v0.5.228 F4 fired on these naturally quiet windows and prompted
    // operators to restart a perfectly healthy chain (real-world repro:
    // 2026-05-26 — node held at block 2221127 for 14 min, ALL peers also at
    // 2221127, then resumed normally; ENM had already proposed a restart).
    //
    // networkHeight is populated by the adapters' primaryHeight() probe:
    //   - Class A (mainchain): max peer height from getnodestate.Neighbors
    //   - Class B (EVM):       eth_syncing.highestBlock
    // When it's a real number > 0 and we're at-or-near it, suppress the stall.
    if (typeof snap.rpcSummary.networkHeight === 'number'
        && snap.rpcSummary.networkHeight > 0
        && snap.rpcSummary.height >= snap.rpcSummary.networkHeight - 1) {
        return null;
    }

    const firstStall = snap.ruleState && snap.ruleState.firstHeightStallAt;
    if (!firstStall) return null;
    if (Date.now() - firstStall < HEIGHT_STALL_GRACE_MS) return null;

    return {
        ruleId: 'F4',
        tier: HEALING_TIERS.OWNER_CONFIRMS,
        summaryAction: `Restart ${snap.chainId} to clear sync stall`,
        summaryReason: `Block height ${snap.rpcSummary.height} has not advanced for >10 minutes.`,
        // beta.3.57 — stuckHeight in payload so the auto-resolve sweep
        // can tell "F4 cleared" (height advanced past stuckHeight) from
        // "still stuck" (height same as when proposed). Without it the
        // sweep resolved every F4 instantly because the rule's own
        // precondition (alive + RPC + peers) looked like "healthy".
        payload: { action: 'restart', chainId: snap.chainId, stuckHeight: snap.rpcSummary.height },
    };
}

/**
 * F5 — disk space low.
 * Fires at <5 GB free as CRITICAL-tier OWNER-CONFIRMS; the action is a
 * suggestion, not an automated prune (we never delete operator data).
 */
function detectF5(snap) {
    if (!snap || !snap.diskInfo) return null;
    const free = snap.diskInfo.freeGb;
    if (typeof free !== 'number') return null;
    if (free >= DISK_WARN_GB) return null;

    if (free < DISK_CRITICAL_GB) {
        return {
            ruleId: 'F5',
            tier: HEALING_TIERS.OWNER_CONFIRMS,
            severity: 'CRITICAL',
            summaryAction: `Free disk space on the ${snap.chainId} data folder`,
            summaryReason: `Only ${free.toFixed(1)} GB free — chain may halt below ~1 GB. Action: enable archive prune or move the data folder to a larger volume.`,
            payload: { action: 'prune-suggestion', chainId: snap.chainId, freeGb: free },
        };
    }

    // Warn band (5-20 GB) — we surface it as a low-priority OWNER-CONFIRMS
    // instead of auto-firing every poll. SelfHealingEngine deduplicates so
    // the operator doesn't see this every 5 minutes.
    return {
        ruleId: 'F5',
        tier: HEALING_TIERS.OWNER_CONFIRMS,
        severity: 'WARNING',
        summaryAction: `${snap.chainId}: disk space getting low (${free.toFixed(1)} GB free)`,
        summaryReason: `Below the ${DISK_WARN_GB} GB warn threshold. Plan a prune or volume migration before it crosses ${DISK_CRITICAL_GB} GB.`,
        payload: { action: 'prune-suggestion', chainId: snap.chainId, freeGb: free },
    };
}

/**
 * F6 — process killed by OOM (SIGKILL with no manual stop).
 * Distinct from F1 because the action is "raise memory limit", not "restart".
 *
 * Linux OOM-killer sends SIGKILL (signal 9). Node receives this as
 * `signal === 'SIGKILL'` on the exit event. We use the most-recent exit
 * snapshot from HealthChecker; if F1 already restarted, that doesn't matter —
 * F6 still wants to surface the cause to the operator.
 */
function detectF6(snap) {
    if (!snap || !snap.processExit) return null;
    if (snap.processExit.manualStop) return null;
    if (snap.processExit.signal !== 'SIGKILL') return null;

    return {
        ruleId: 'F6',
        tier: HEALING_TIERS.OWNER_CONFIRMS,
        summaryAction: `Investigate OOM-kill on ${snap.chainId}`,
        summaryReason: 'The chain was killed by the Linux out-of-memory killer (SIGKILL). Raise the Memory limit in Settings → Mainchain Advanced, or free RAM on the host.',
        payload: { action: 'oom-suggestion', chainId: snap.chainId },
    };
}

/**
 * F7 — port conflict on start. Fires when chains route's PortManager check
 * finds one of our ports already bound by something else.
 */
function detectF7(snap) {
    if (!snap || !snap.ports || !Array.isArray(snap.ports.conflicting)) return null;
    if (snap.ports.conflicting.length === 0) return null;

    const ports = snap.ports.conflicting.map((p) => `${p.port} (${p.role})`).join(', ');
    return {
        ruleId: 'F7',
        tier: HEALING_TIERS.OWNER_CONFIRMS,
        summaryAction: `Reassign conflicting ports on ${snap.chainId}`,
        summaryReason: `Ports already bound by other processes: ${ports}. Open Settings → Advanced and pick free ports, or stop the conflicting service.`,
        payload: { action: 'port-conflict', chainId: snap.chainId, conflicting: snap.ports.conflicting },
    };
}

/**
 * F8 — binary version mismatch. The on-disk ela --version reports something
 * different from what ConfigStore recorded. Don't auto-restart — the operator
 * may have intentionally rebuilt; just surface for confirmation.
 */
function detectF8(snap) {
    if (!snap || !snap.chainConfig) return null;
    // 0.5.150 audit Session 150 — F8 only applies to the ela MAINCHAIN.
    // Geth-derived sidechains (esc/eid/pg) + their oracles report their
    // UPSTREAM geth library version (e.g. "1.9.7.0") on the version
    // subcommand — a different numbering universe from the elastos-fork
    // release tag ENM records (e.g. "v0.0.3.1" / "v0.2.4" / "v0.2.7.1").
    // They can NEVER be equal, so F8 fired a PERMANENT false-alarm
    // "Binary version changed" proposal for every sidechain once the
    // 1-hour install grace (below) expired — exactly what the operator
    // hit (3 simultaneous popups). The grace only delayed the noise; the
    // mismatch is structural. Sidechain/oracle binary integrity is
    // covered separately by EnmIntegrityChecker + the PG SHA256 manifest
    // gate (binarySha256Expected), so dropping F8 for non-mainchain
    // loses no real protection. F8's expected-vs-actual string compare
    // is only meaningful for the mainchain custom binary, whose
    // `ela --version` tag matches the release tag we record.
    if (snap.chainId !== 'mainchain') return null;
    const expected = snap.chainConfig.binaryVersion;
    const actual = snap.ruleState && snap.ruleState.lastBinaryVersion;
    if (!expected || !actual) return null;
    if (expected === actual) return null;
    // beta.0.5.0 — suppress for 1 hour after install. Retained for the
    // mainchain genuine-swap case: a freshly recorded binaryInstalledAt
    // means the operator just installed/updated, so a transient
    // expected≠actual during the version-record settle is expected noise.
    const installedAt = snap.chainConfig.binaryInstalledAt;
    if (installedAt && Date.now() - installedAt < 3_600_000) return null;
    return {
        ruleId: 'F8',
        tier: HEALING_TIERS.OWNER_CONFIRMS,
        summaryAction: `Binary version changed (${expected} → ${actual})`,
        summaryReason: `The ela binary at ${snap.chainConfig.binaryPath} now reports ${actual}; ENM expected ${expected}. Confirm to update the recorded version.`,
        payload: { action: 'version-record', chainId: snap.chainId, version: actual },
    };
}

/**
 * F9 — config file failed validation. Joi error from ConfigStore.load.
 * Action: offer rollback to the .bak file produced on the previous save.
 */
function detectF9(snap) {
    if (!snap || !snap.configValidation) return null;
    if (snap.configValidation.ok) return null;

    return {
        ruleId: 'F9',
        tier: HEALING_TIERS.OWNER_CONFIRMS,
        summaryAction: 'Rollback config to previous version',
        summaryReason: `Validation failed: ${snap.configValidation.error || 'unknown'}. The previous .bak version is still on disk.`,
        payload: { action: 'config-rollback', chainId: snap.chainId },
    };
}

/**
 * F10 — RPC password not set. The chain config exists but rpc.passwordEncrypted
 * is missing or empty. Without it we cannot start the chain.
 */
function detectF10(snap) {
    if (!snap || !snap.chainConfig || !snap.chainConfig.rpc) return null;
    const enc = snap.chainConfig.rpc.passwordEncrypted;
    if (typeof enc === 'string' && enc.length > 0) return null;

    return {
        ruleId: 'F10',
        tier: HEALING_TIERS.OWNER_CONFIRMS,
        summaryAction: `Set RPC password for ${snap.chainId}`,
        summaryReason: 'RPC password is unset. Open Settings → Mainchain Advanced and provide one.',
        payload: { action: 'open-settings', chainId: snap.chainId, deepLink: 'settings.mainchain.advanced.rpc' },
    };
}

/**
 * F11 — BPoS: arbiter rotation stuck.
 *
 * Detection: snap.bpos.rotationStuck is set by the slow-tick when comparing
 * `getarbitratorgroupbyheight` results across consecutive rounds. The actual
 * compare lives in HealthChecker so this rule stays pure.
 *
 * Tier CRITICAL_NOTIFY — the operator must investigate; we never automate.
 */
function detectF11(snap) {
    if (!snap || !snap.bpos) return null;
    if (!snap.bpos.rotationStuck) return null;
    return {
        ruleId: 'F11',
        tier: HEALING_TIERS.CRITICAL_NOTIFY,
        severity: 'CRITICAL',
        summaryAction: `BPoS arbiter rotation stuck on ${snap.chainId}`,
        summaryReason:
            'getarbitratorgroupbyheight reports the same on-duty arbiter index '
            + 'across consecutive heights with our node listed in the empty slot. '
            + 'Investigate consensus state — Node Manager will not auto-recover.',
        payload: { action: 'bpos-rotation-investigate', chainId: snap.chainId, bpos: snap.bpos },
    };
}

/**
 * F12 — BPoS: producer in Inactive state, approaching forced-inactive penalty.
 *
 * Detection: getproducerinfo(ourPubkey) returned state="Inactive" in the slow
 * tick. We compute (currentHeight - inactiveheight); warn at >720 rounds, fire
 * CRITICAL_NOTIFY at >1300 (~10% slack from MAX_INACTIVE_ROUNDS=1440 before
 * permanent penalty).
 *
 * Action: NEVER_AUTOMATIC (operator-initiated; not auto-fired). v0.5.248 fix
 * (validator-readiness audit P1-1): ActivateProducer is NODE-KEY signed
 * (Elastos.ELA/core/transaction/activateproducertransaction.go:208-227) — it
 * uses the keystore Node Manager already holds, so ENM CAN and DOES submit it
 * via the in-app Activate control (POST /chains/:id/bpos/activate,
 * EnmBposService). The summary points the operator THERE, not at ela-cli. It
 * stays NEVER_AUTOMATIC because WHEN to reactivate is the operator's call —
 * not because ENM is unable to. (The prior copy wrongly said "owner key …
 * Node Manager cannot do this for you", steering validators to ela-cli at the
 * exact moment they're losing their slot.)
 */
function detectF12(snap) {
    if (!snap || !snap.bpos || !snap.bpos.producer) return null;
    const p = snap.bpos.producer;

    // Producer state machine has 6 values (Pending/Active/Inactive/Canceled/
    // Illegal/Returned per dpos/state/state.go:36-60). Inactive is the only
    // recoverable-by-operator state — Canceled means the operator already
    // signed CancelProducer and the deposit is frozen until the timelock
    // expires. Returned means the deposit was already withdrawn. Illegal
    // means the producer was caught misbehaving and forfeited the deposit.
    // None of those are actionable here, so we stay silent and let the
    // operator see the state in the chain card without an alert.
    if (p.state !== 'Inactive') return null;

    const inactiveRounds = (typeof p.inactiveRounds === 'number') ? p.inactiveRounds : null;
    if (inactiveRounds == null) return null;

    if (inactiveRounds < PRODUCER_INACTIVE_WARN) {
        return null;
    }

    const isCritical = inactiveRounds >= PRODUCER_INACTIVE_CRITICAL;
    return {
        ruleId: 'F12',
        tier: HEALING_TIERS.NEVER_AUTOMATIC,
        severity: isCritical ? 'CRITICAL' : 'WARNING',
        summaryAction: `Producer Inactive — Activate from the Main chain card (${inactiveRounds}/${MAX_INACTIVE_ROUNDS} rounds)`,
        summaryReason:
            `Your producer is in Inactive state. ${isCritical ? 'Critical: ' : ''}`
            + `${inactiveRounds} rounds elapsed (${MAX_INACTIVE_ROUNDS} = forced inactive). `
            + 'Reactivate now from the Main chain dashboard card — Node Manager signs the '
            + 'ActivateProducer transaction with your node key (no ela-cli needed).',
        payload: {
            action: 'bpos-activate-producer',
            chainId: snap.chainId,
            inactiveRounds,
            inactiveHeight: p.inactiveHeight,
        },
    };
}

/**
 * F13 — host clock skew exceeds CLOCK_SKEW_WARN_MS.
 *
 * Detection: snap.clockSkew is set by the slow-tick from ClockSkewChecker.
 * Fail-soft: when ok=false (no internet, captive portal), we don't fire
 * CRITICAL — the operator may legitimately be on an air-gapped network.
 */
function detectF13(snap) {
    if (!snap || !snap.clockSkew) return null;
    if (!snap.clockSkew.ok) return null;
    const abs = Math.abs(snap.clockSkew.skewMs);
    if (abs <= CLOCK_SKEW_WARN_MS) return null;

    return {
        ruleId: 'F13',
        tier: HEALING_TIERS.OWNER_CONFIRMS,
        severity: 'WARNING',
        summaryAction: `Host clock drift detected (${abs} ms)`,
        summaryReason:
            `Host clock differs from ${snap.clockSkew.endpoint || 'reference'} by ${abs} ms. `
            + 'ELA Schnorr signing fails silently above ~4.2 s — fix NTP before that. '
            + 'Linux: sudo systemctl restart chrony  (or: sudo ntpdate -s pool.ntp.org).',
        payload: { action: 'ntp-suggestion', chainId: snap.chainId, skewMs: snap.clockSkew.skewMs },
    };
}

/**
 * F16 — peer count zero >= 10 minutes (extends F3's 5 min auto-restart).
 * If F3's auto-restart didn't recover the peer set, the DNS seeds may be down
 * or our network egress is broken. Surface a CRITICAL with fallback peer
 * config suggestions; engine should NOT auto-restart again.
 */
function detectF16(snap) {
    if (!snap || !snap.processStatus || !snap.processStatus.alive) return null;
    if (!snap.rpcSummary || !snap.rpcSummary.ok) return null;
    if (snap.rpcSummary.peers !== 0) return null;

    const firstZero = snap.ruleState && snap.ruleState.firstPeerZeroAt;
    if (!firstZero) return null;
    if (Date.now() - firstZero < PEER_ZERO_FALLBACK_MS) return null;

    return {
        ruleId: 'F16',
        tier: HEALING_TIERS.CRITICAL_NOTIFY,
        severity: 'CRITICAL',
        summaryAction: `${snap.chainId}: still zero peers after auto-restart`,
        summaryReason:
            'Peer count has been 0 for >10 minutes. F3 auto-restart did not help. '
            + 'DNS seeds may be unreachable. Open Settings → Network → Permanent peers '
            + 'and add a fallback list (foundation/community-operated nodes).',
        payload: { action: 'fallback-peers', chainId: snap.chainId },
    };
}

/**
 * F18 — outbound peers > 0 but inbound peers = 0 for >= 5 minutes.
 *
 * BPoS supernodes must accept inbound P2P (port 20338) AND DPoS p2p (20339).
 * If we see only outbound, the operator's NAT/UPnP isn't forwarding ports —
 * we'll silently get penalized for missed votes despite the chain "looking
 * fine" by other metrics.
 *
 * snap.rpcSummary.inboundCount and outboundCount are populated by HealthChecker
 * from `getnodestate.Neighbors[].Inbound`.
 */
function detectF18(snap) {
    if (!snap || !snap.processStatus || !snap.processStatus.alive) return null;
    if (!snap.rpcSummary || !snap.rpcSummary.ok) return null;
    if (typeof snap.rpcSummary.inboundCount !== 'number') return null;
    if (typeof snap.rpcSummary.outboundCount !== 'number') return null;
    if (snap.rpcSummary.inboundCount > 0) return null;
    if (snap.rpcSummary.outboundCount === 0) return null; // F3 owns the no-peers case

    const firstNoInbound = snap.ruleState && snap.ruleState.firstNoInboundAt;
    if (!firstNoInbound) return null;
    if (Date.now() - firstNoInbound < NO_INBOUND_GRACE_MS) return null;

    // beta.3.27 — gate severity on whether the operator is actually a
    // BPoS supernode. The "missed votes accumulate silently" framing
    // only applies if the node is registered as a producer. On a
    // follower / observer node the same condition is technically true
    // (cloud hosters typically block inbound by default) but the
    // consequence is just less peer diversity, not slashing risk.
    // Operator on a test node (Hostinger, no BPoS registration) hit
    // this as a CRITICAL alert with copy that didn't match their
    // situation. Downgrade for non-BPoS; keep the urgent shape for
    // BPoS operators where ports actually matter.
    const isBpos = !!(snap.chainConfig && snap.chainConfig.dpos
        && snap.chainConfig.dpos.enableArbiter);

    if (isBpos) {
        return {
            ruleId: 'F18',
            tier: HEALING_TIERS.CRITICAL_NOTIFY,
            severity: 'CRITICAL',
            summaryAction: `${snap.chainId}: no inbound peers — firewall blocking 20338/20339?`,
            summaryReason:
                'Outbound peers > 0 but inbound = 0. BPoS requires inbound on P2P (20338) '
                + 'and DPoS p2p (20339) to receive consensus messages. On a hosted VPS the '
                + 'usual cause is the host firewall: run `sudo ufw allow 20338/tcp && '
                + 'sudo ufw allow 20339/tcp` (verified fix on a test node, 2026-05-15). At '
                + 'home behind a router: forward those ports or enable UPnP. Either way, '
                + 'missed votes accumulate silently.',
            payload: {
                action: 'nat-forward',
                chainId: snap.chainId,
                ports: [20338, 20339],
            },
        };
    }

    return {
        ruleId: 'F18',
        tier: HEALING_TIERS.OWNER_CONFIRMS,
        severity: 'INFO',
        summaryAction: `${snap.chainId}: no inbound peers (firewall blocking 20338/20339)`,
        summaryReason:
            'Your node has outbound peers but isn’t reachable from the network. Common '
            + 'cause on a hosted VPS: host firewall (UFW) is active and doesn’t allow '
            + '20338 / 20339 inbound. Quick check: `sudo ufw status verbose` — if active '
            + 'and the chain ports aren’t in the allow list, run `sudo ufw allow 20338/tcp '
            + '&& sudo ufw allow 20339/tcp`. Otherwise harmless for a follower node, but '
            + 'mandatory before you register as a BPoS supernode.',
        payload: {
            action: 'nat-forward-info',
            chainId: snap.chainId,
            ports: [20338, 20339],
        },
    };
}

/**
 * F19 — host conflict detected at runtime.
 *
 * Mirrors the setup-time scanner but fires inside the slow tick so a
 * conflict introduced AFTER setup (e.g., operator manually started node.sh,
 * or systemd auto-started a stale unit on reboot) gets surfaced even though
 * setup completed successfully.
 *
 * snap.hostConflicts is populated by HealthChecker via HostConflictScanner.
 * Only CRITICAL conflicts fire the rule; warnings stay quiet to avoid
 * notification spam — they're visible in the dashboard banner instead.
 */
function detectF19(snap) {
    if (!snap || !Array.isArray(snap.hostConflicts)) return null;
    const blockers = snap.hostConflicts.filter((c) => c && c.severity === 'CRITICAL');
    if (blockers.length === 0) return null;

    // Pick the most-actionable type to put in the title; the full list lives
    // in the proposal payload so the operator can read every entry.
    const titles = blockers.map((c) => c.description).slice(0, 3);
    const summary = `Host conflict on ${snap.chainId}: ${titles[0]}`;
    return {
        ruleId: 'F19',
        tier: HEALING_TIERS.CRITICAL_NOTIFY,
        severity: 'CRITICAL',
        summaryAction: summary,
        summaryReason:
            (titles.length > 1
                ? `Plus ${blockers.length - 1} more conflict(s). `
                : '')
            + 'Open the Conflicts panel to resolve before the next restart.',
        payload: {
            action: 'host-conflict',
            chainId: snap.chainId,
            conflicts: blockers,
        },
    };
}

/**
 * F22 — DPoS state desync (alert-only, beta.3.78 onwards).
 *
 * Fires when ALL of:
 *   - process alive
 *   - RPC reachable + peers > 0
 *   - height stalled past HEIGHT_STALL_GRACE_MS (same grace as F4)
 *   - HealthChecker's medium-tick log probe set snap.dposDesyncDetected
 *
 * The log probe (HealthChecker._probeDposDesyncSignal) reads the tail of
 * the most recent ela log file and looks for either:
 *   - "sponsor is not in current or last arbitrators"
 *   - "PowCheckBlockContext error"
 * within the last ~2 minutes of log lines. Either is a definitive marker
 * of the local arbitrator-state-vs-block-ledger inconsistency.
 *
 * Pre-beta.3.78 F22 dispatched a 'state-restore' action that rolled the
 * cp_dpos checkpoint back to a snapshot. Per operator review:
 *   - the snapshot service was a band-aid for an upstream ela bug
 *     (crash on corrupt cp_dpos read instead of rebuilding from blocks);
 *   - auto-rollback to a stale state could mask real corruption AND
 *     cause further desync against blocks the chain already advanced past;
 *   - manual recovery (stop chain, delete corrupt cache, restart, let
 *     ela rebuild) is more honest than silently rolling state back.
 *
 * So F22 now tiers as CRITICAL_NOTIFY — the engine alerts the operator
 * with recovery steps; it does not act. Action field is omitted entirely
 * (rather than 'alert') so the dispatcher's _isRestartAction / similar
 * guards short-circuit cleanly. F22 still takes precedence over F4 in
 * the detector queue so the operator sees the DPoS-specific alert
 * rather than the generic restart proposal.
 */
function detectF22(snap) {
    if (!snap || !snap.processStatus || !snap.processStatus.alive) return null;
    if (!snap.rpcSummary || !snap.rpcSummary.ok) return null;
    if (snap.rpcSummary.peers === 0) return null;
    if (typeof snap.rpcSummary.height !== 'number') return null;
    const firstStall = snap.ruleState && snap.ruleState.firstHeightStallAt;
    if (!firstStall) return null;
    if (Date.now() - firstStall < HEIGHT_STALL_GRACE_MS) return null;
    if (!snap.dposDesyncDetected) return null;
    return {
        ruleId: 'F22',
        tier: HEALING_TIERS.CRITICAL_NOTIFY,
        summaryAction: `${snap.chainId}: DPoS state appears desynced`,
        summaryReason:
            `Height ${snap.rpcSummary.height} has been stalled for >10 min and `
            + 'the ela log shows the arbitrator-state-vs-ledger desync signature. '
            + 'Manual recovery: stop the chain, delete the corrupt cp_dpos '
            + 'checkpoint files, restart the chain, and let ela rebuild '
            + 'state from blocks.',
        payload: {
            chainId: snap.chainId,
            stuckHeight: snap.rpcSummary.height,
            // No `action` field — F22 is alert-only as of beta.3.78.
            recoverySteps: [
                'systemctl stop pc2-node  # or: kill the ela PID',
                'rm -rf <chain-dir>/elastos/elastos/data/checkpoints/cp_dpos',
                'systemctl start pc2-node  # let ela rebuild cp_dpos from blocks',
            ],
        },
    };
}

/**
 * F23 — Class D (Arbiter) cross-chain RPC unreachable.
 *
 * Fires when:
 *   - chain is Class D (arbiter)
 *   - arbiter process is alive
 *   - any of the 4 cross-chain RPC reachability checks fails
 *     (snap.crossChainReach.{mainchain,esc,eid,pg} === false)
 *
 * The Arbiter relays multisig signatures across all 4 chains; if any
 * is unreachable, signatures it produces can't be validated AND it
 * may sign for state that's diverged from the unreachable chain.
 * Tier CRITICAL_NOTIFY: operator must investigate which chain is
 * down (the F-rules on the affected chain will also be firing). The
 * arbiter itself stays running so the OTHER chains continue.
 */
function detectF23(snap) {
    if (!snap || !snap.processStatus || !snap.processStatus.alive) return null;
    if (!snap.crossChainReach || typeof snap.crossChainReach !== 'object') return null;
    const unreachable = Object.keys(snap.crossChainReach)
        .filter((id) => snap.crossChainReach[id] === false);
    if (unreachable.length === 0) return null;
    return {
        ruleId: 'F23',
        tier: HEALING_TIERS.CRITICAL_NOTIFY,
        summaryAction: `arbiter: cross-chain RPC unreachable [${unreachable.join(', ')}]`,
        summaryReason:
            'The Arbiter relays multisig signatures across all 4 chains. '
            + `One or more cross-chain RPCs are unreachable: ${unreachable.join(', ')}. `
            + 'Bring the affected chain(s) back online (their per-chain pane '
            + 'will show the specific failure). The Arbiter will resume cross-'
            + 'chain operations automatically once all 4 are reachable.',
        payload: {
            chainId: 'arbiter',
            unreachable,
        },
    };
}

/**
 * F24 — Class C (Oracle) parent-chain offline.
 *
 * Fires when:
 *   - chain is Class C (esc-oracle / eid-oracle / pg-oracle)
 *   - oracle process is alive
 *   - parent chain (esc/eid/pg) is either:
 *     - not configured in cfg.chains[parent], OR
 *     - configured but process not alive (snap.parentAlive=false)
 *
 * Oracles relay cross-chain transactions FROM the parent EVM
 * sidechain TO mainchain. If the parent isn't alive there's nothing
 * to relay; the oracle is "orphaned" — still consuming CPU + holding
 * a port but accomplishing nothing.
 *
 * Tier: CRITICAL_NOTIFY — operator action: bring the parent back up
 * (or stop the oracle if intentional). The restart-hook in
 * ChainRegistry (M4.5 sibling) handles the auto-restart-on-parent-
 * back-up case so F24 should clear naturally.
 *
 * snap.parentAlive is set by HealthChecker's snapshot builder for
 * Class C chains (M4.5 backend wiring).
 */
function detectF24(snap) {
    if (!snap || !snap.processStatus || !snap.processStatus.alive) return null;
    // Defensive: parentChainId comes from the adapter; if missing skip.
    if (!snap.parentChainId) return null;
    // snap.parentAlive is a boolean OR null (null = not yet evaluated).
    // We only fire on an explicit false.
    if (snap.parentAlive !== false) return null;
    return {
        ruleId: 'F24',
        tier: HEALING_TIERS.CRITICAL_NOTIFY,
        summaryAction: `${snap.chainId}: parent chain "${snap.parentChainId}" is offline`,
        summaryReason:
            `${snap.chainId} is an Oracle that relays from ${snap.parentChainId} `
            + 'to the Main chain. With the parent chain offline there is nothing to '
            + 'relay; the oracle is consuming resources without producing work. '
            + `Start ${snap.parentChainId} via its chain card or stop ${snap.chainId} `
            + 'if you intended to take it down.',
        payload: {
            chainId: snap.chainId,
            parentChainId: snap.parentChainId,
        },
    };
}

/**
 * F25 — Class B (EVM sidechain) miner-address-unset warning.
 *
 * Fires when:
 *   - chain is Class B (esc/eid/pg)
 *   - cfg.chains[id].enabled = true (operator wants the chain on)
 *   - cfg.chains[id].miner.enabled = true (operator wants to mine)
 *   - cfg.chains[id].miner.rewardAddress is empty
 *
 * Without a miner address, geth would either refuse to start (we throw
 * pre-flight in EvmSidechainAdapter.start) or — worse — start with the
 * default zero address and silently mine to nowhere. Either way the
 * operator's intent (produce blocks for rewards) is unfulfilled. F25
 * is alert-only — ENM cannot supply the address (operator must paste
 * it from their wallet; H22).
 *
 * Tier: CRITICAL_NOTIFY — operator action required, no auto-fix.
 *
 * Sibling note: M3.5's install-class-b endpoint already 412s when
 * the operator-supplied address fails validation; F25 catches the
 * post-install case where the operator opened Settings and cleared
 * the address (or where the install never set one because miner.
 *
 * v0.5.229e (P11 audit note) — F-rule Council-mode safety review:
 * every F-rule defined above null-guards on snap.bpos (or snap.bpos.
 * producer) before reading producer.state etc. → a pure-Council
 * operator with snap.bpos.producer === null never triggers any of
 * F11 (rotation stuck), F12 (producer Inactive), F22 (DPoS state
 * desync), so they don't fire wrongly. The remaining GAP is an
 * unimplemented "F-rule for CR Committee MemberState=Inactive"
 * (parallel to F12 but on crMember.state). It would consume the
 * CrMembershipService output and warn when impeachmentVotes climbs
 * or state flips to Inactive. Deferred — not a regression, just a
 * missing feature; documented here so the next F-rule pass picks
 * it up.
 * enabled was false at install time and is now true).
 */
function detectF25(snap) {
    if (!snap || !snap.chainConfig) return null;
    const c = snap.chainConfig;
    if (!c.enabled) return null;
    if (!c.miner || c.miner.enabled !== true) return null;
    if (typeof c.miner.rewardAddress === 'string' && c.miner.rewardAddress.length > 0) {
        return null;
    }
    return {
        ruleId: 'F25',
        tier: HEALING_TIERS.CRITICAL_NOTIFY,
        summaryAction: `${snap.chainId}: mining is enabled but no reward address is set`,
        summaryReason:
            `Mining is enabled on ${snap.chainId} but no reward address is set. `
            + 'Without one, the chain either refuses to start or mines to '
            + '0x0 (rewards are lost). Open Settings → Mining & Rewards on the '
            + `${snap.chainId} pane and paste an Ethereum address you control.`,
        payload: {
            chainId: snap.chainId,
            // No `action` field — operator-driven only (H22).
        },
    };
}

/**
 * F26 — wedged EVM sidechain fork (Class B, v0.5.184; HARDENED v0.5.231).
 *
 * v0.5.231 — this rule's tier was DEMOTED from AUTOMATED_SAFE to OWNER_CONFIRMS
 * after a false positive on 2026-05-27 wiped EID's chaindata while the chain
 * was 99.96% synced (12k blocks from network tip). F26 now NEVER auto-executes
 * a destructive resync — the operator MUST confirm. Three additional safety
 * gates layer on top of the original detection:
 *
 *   1. Near-tip guard (F26_NEAR_TIP_BLOCKS_GUARD): if we know the peer tip and
 *      our local head is within ~100k blocks of it, do NOT propose a wipe —
 *      slow sync ≠ fork. If peer tip is unobservable, also refuse (fail safe).
 *   2. Multi-tick consecutive gate (F26_CONSECUTIVE_TICKS_MIN): the fork log
 *      signature must persist across ≥3 consecutive medium ticks (~90s of
 *      unbroken evidence). HealthChecker maintains the counter and resets it
 *      on any negative probe OR any height advance.
 *   3. Pre-execution sanity recheck (SelfHealingEngine._executeChainResync):
 *      after the operator confirms, the engine re-polls RPC and refuses to
 *      wipe if the chain has advanced past stuckHeight by ≥50 blocks.
 *
 * Original detection (still required, on top of the above):
 *   - process alive
 *   - RPC reachable + peers > 0          (so it's NOT a connectivity / peer-zero
 *                                          problem — F3/F16 own that)
 *   - height stalled past EVM_FORK_STALL_GRACE_MS (20 min)
 *   - HealthChecker's medium-tick log probe set snap.evmForkDetected (≥10
 *     "retrieved hash chain is invalid" lines timestamped within last 10 min
 *     in the recent EVM node-log tail — strengthened in v0.5.231)
 *   - snap.evmSpvReady === true (SPV catching up ≠ data fork)
 *
 * What it means when ALL gates pass: the local chaindata has diverged onto a
 * minority fork, so geth rejects every canonical peer's header chain
 * ("retrieved hash chain is invalid") and can never advance. A restart does
 * NOT help — geth comes back on the same forked head. The only recovery is to
 * wipe the EVM chaindata (mining keystore + nodekey preserved as of v0.5.231)
 * and re-sync clean from peers — but the operator confirms first, every time.
 *
 * Runs BEFORE F4 in the detector queue; detectF4 also yields on
 * snap.evmForkDetected so only F26 owns the fork case (no duplicate restart
 * proposal).
 */
function detectF26(snap) {
    if (!snap || !snap.processStatus || !snap.processStatus.alive) return null;
    if (!snap.rpcSummary || !snap.rpcSummary.ok) return null;
    // Require a positive peer count: the fork diagnosis is "we have peers but
    // reject all their chains". A peerless node is F3/F16's domain, not F26's.
    if (!(snap.rpcSummary.peers > 0)) return null;
    // v0.5.185 (P1-A) — yield to F27 on a PBFT recovery stall. A quorum/peer
    // problem is NOT a data fork; wiping + resyncing a 20 GB chain cannot fix it
    // and would waste days. F27 alerts the operator instead.
    if (snap.evmRecoveryStall) return null;
    // The definitive marker — set only by HealthChecker._probeEvmForkSignal.
    if (!snap.evmForkDetected) return null;
    // v0.5.185 (P0-B) — SPV-readiness gate. The EVM chains validate blocks via
    // the mainchain arbiter set learned over their embedded SPV client. If SPV
    // is still bulk-downloading headers (a fresh install can take hours), the
    // chain genuinely cannot validate and any transient fork signal is NOT a
    // real local fork — wiping + resyncing would just re-fork the same way once
    // it re-validates against the not-yet-ready SPV. Only wipe when SPV has
    // caught up to the tip (set by HealthChecker; true/false only for Class B).
    if (snap.evmSpvReady !== true) return null;
    // A freshly-started node may log transient sync errors before it settles;
    // don't wipe it during the initial start grace.
    if (withinInitialStartGrace(snap)) return null;
    const firstStall = snap.ruleState && snap.ruleState.firstHeightStallAt;
    if (!firstStall) return null;
    if (Date.now() - firstStall < EVM_FORK_STALL_GRACE_MS) return null;

    // v0.5.231 — multi-tick consecutive gate. A single-tick fork signature can
    // be a transient burst; require ≥3 consecutive medium ticks before we even
    // PROPOSE (let alone execute) a destructive wipe. HealthChecker owns the
    // counter — resets to 0 on any negative probe OR any height advance.
    const consec = (snap.ruleState && snap.ruleState.evmForkDetectedConsecutive) || 0;
    if (consec < F26_CONSECUTIVE_TICKS_MIN) return null;

    // v0.5.231 — near-tip safety guard. F26 fired on EID at 27,835,801 vs tip
    // 27,847,941 on 2026-05-27 — only 12k blocks (~16h) behind, but ruled
    // "forked" and wiped. A chain that's nearly caught up is almost certainly
    // slow-syncing, not on a minority fork. Refuse to propose a wipe if we
    // can see the peer tip and we're within F26_NEAR_TIP_BLOCKS_GUARD of it.
    // Fail safe: if we can't see the peer tip at all, also refuse — better to
    // stall the rule than risk another false-positive 16h-loss wipe.
    const localHeight = snap.rpcSummary.height || 0;
    const peerTip = snap.rpcSummary.peerMaxHeight
        || snap.rpcSummary.networkHeight
        || 0;
    if (peerTip <= 0) return null;
    if ((peerTip - localHeight) < F26_NEAR_TIP_BLOCKS_GUARD) return null;

    // v0.5.234 — branding pass: use the canonical display name in the
    // operator-facing proposal copy instead of the raw lowercase chainId.
    // Convention is "Main chain" for mainchain and all-caps for the EVM
    // sidechains (ESC/EID/PG), per strings.js (~line 444) + session 28's
    // wizard sub copy. PG is a PUBLIC EVM PBFT sidechain — never
    // parenthesise it as "(Privacy)".
    const chainDisplay = snap.chainId === 'mainchain'
        ? 'Main chain'
        : (snap.chainId || '').toUpperCase();
    return {
        ruleId: 'F26',
        // v0.5.231 — NEVER auto-execute. Operator confirms every destructive
        // wipe; the rate-limit/escalation logic in SelfHealingEngine stays in
        // place to add context (e.g. "this chain was wiped in the last 24h").
        tier: HEALING_TIERS.OWNER_CONFIRMS,
        summaryAction: `Confirm resync of ${chainDisplay} (suspected fork wedge)`,
        summaryReason:
            `${chainDisplay} has been stuck at block ${snap.rpcSummary.height} for >20 min, the network `
            + `tip is at block ${peerTip} (${peerTip - localHeight} blocks ahead), and its node log has `
            + 'shown "retrieved hash chain is invalid" persistently for the last several health checks — '
            + 'the local chain data appears to have forked off the network and cannot recover by '
            + 'restarting. Confirm to wipe the chain data (mining keystore AND network identity '
            + 'preserved) and re-sync clean from peers. If you suspect the chain is just slow-syncing '
            + 'or a peer-connectivity blip, dismiss this and check peers/bootnodes first.',
        // stuckHeight lets the engine's auto-resolve sweep tell "still forked"
        // from "recovered" (height climbed past it), AND drives the v0.5.231
        // pre-execution sanity recheck in _executeChainResync.
        payload: {
            action: 'evm-fork-resync',
            chainId: snap.chainId,
            stuckHeight: snap.rpcSummary.height,
            peerTipAtDetection: peerTip,
            consecutiveTicks: consec,
        },
    };
}

/**
 * F27 — EVM sidechain PBFT consensus-recovery stall (Class B, v0.5.185 P1-A).
 *
 * Fires when an EVM chain is alive + height-stalled past EVM_FORK_STALL_GRACE_MS
 * and HealthChecker's log probe found a recovery-stall signature ("wait for
 * recoved states" / "can not find active peer" / "recover failed"). Unlike F26,
 * this is a quorum / re-peer problem, NOT a local data fork — a wipe+resync
 * cannot fix it and would waste days rebuilding a 20 GB chain. Alert-only
 * (CRITICAL_NOTIFY); detectF26 yields when evmRecoveryStall is set so the two
 * never both fire on the same condition.
 */
function detectF27(snap) {
    if (!snap || !snap.processStatus || !snap.processStatus.alive) return null;
    if (!snap.evmRecoveryStall) return null;
    const firstStall = snap.ruleState && snap.ruleState.firstHeightStallAt;
    if (!firstStall) return null;
    if (Date.now() - firstStall < EVM_FORK_STALL_GRACE_MS) return null;

    return {
        ruleId: 'F27',
        tier: HEALING_TIERS.CRITICAL_NOTIFY,
        severity: 'CRITICAL',
        summaryAction: `${snap.chainId}: PBFT consensus stuck (cannot reach quorum)`,
        summaryReason:
            `${snap.chainId} has peers but its height has been stalled for >20 min and its node `
            + 'log shows a PBFT recovery stall ("wait for recoved states" / "can not find active '
            + 'peer"). This is a consensus / peer-quorum problem, not a forked chain — an auto-resync '
            + 'will NOT help. Check the chain\'s peers/bootnodes (Settings → EVM → Peers) and that '
            + 'other validators are reachable; restart the chain once peers are restored.',
        payload: { chainId: snap.chainId },  // no `action` → alert-only
    };
}

/**
 * F28 — CR Council MemberState degraded (Class A / mainchain only).
 *
 * v0.5.230 — parallel to F12 for the Council operator audience. F12 fires
 * when the BPoS producer-registry record reads state='Inactive'; F28
 * fires when this node's CR Committee record (in `listcurrentcrs`'s
 * `crmembersinfo[]`) reads MemberState != 'Elected'. Both rules surface
 * the same kind of operator-facing risk (missed rotation rounds → lost
 * rewards) for the two distinct roles a node can play in Elastos DPoS.
 *
 * Snap shape consumed: `snap.cr` populated by HealthChecker._fetchCrState
 * (mirrors _fetchBposState), itself a thin wrapper over CrMembership
 * Service.detectCrMembership. Null when:
 *   - chain is not class A (rule self-gates below)
 *   - operator has no node pubkey configured
 *   - mainchain RPC unreachable (CrMembershipService returns source='error')
 *   - the operator is not a CR Committee member (source='not-in-committee')
 * In all those cases F28 stays quiet (returns null), same defensive
 * pattern as F12's null-guard on snap.bpos.producer.
 *
 * State decision table (mirrors Elastos.ELA/cr/state/keyframe.go:24-42):
 *   Elected     → no fire (steady state, healthy)
 *   Inactive    → WARN if impeachmentVotes==0, CRITICAL if > 0 (close to
 *                 impeachment threshold). Recoverable IN-APP (Validator card
 *                 → Reactivate Council node; node-key-signed ActivateProducer,
 *                 activateproducertransaction.go:113/212 — no owner key).
 *   Impeached   → CRITICAL (impeachment threshold reached; seat lost for
 *                 the rest of this term)
 *   Returned    → CRITICAL (operator voluntarily withdrew; deposit
 *                 returnable but seat gone)
 *   Terminated  → CRITICAL (term ended without re-election; informational
 *                 only post-term)
 *   Illegal     → CRITICAL (caught misbehaving — deposit forfeited)
 *
 * Tier: NEVER_AUTOMATIC (alert-only — ENM never AUTO-submits an on-chain
 * activation tx; activation is rate-limited on-chain to once per inactive
 * window per ActivateDuration, so an auto-retry loop would be harmful). But
 * the Inactive state IS recoverable on operator action: the Validator card's
 * "Reactivate Council node" button submits a node-key-signed ActivateProducer
 * (activateproducertransaction.go:113/212 — no owner key, just the keystore
 * ENM already holds). The terminal states (Impeached/Returned/Terminated/
 * Illegal) are not recoverable this term; for those the summary points the
 * operator at Essentials.
 *
 * Hard-gated to mainchain (snap.chainId === 'mainchain') because CR
 * Committee membership is a Class-A-only concept; the rule runner would
 * still skip non-A chains via _fetchCrState returning null, but the
 * explicit chainId gate makes the intent clear in code-review.
 */
function detectF28(snap) {
    if (!snap || snap.chainId !== 'mainchain') return null;
    if (!snap.cr) return null;
    const cr = snap.cr;
    if (!cr.isCrMember) return null;
    const state = String(cr.state || '').toLowerCase();
    if (state === 'elected') return null;  // healthy steady state

    // Pre-fire severity decision. Inactive with no impeachment votes is
    // WARN (still recoverable cheaply); Inactive with votes climbing,
    // or any terminal state, is CRITICAL.
    const impeachmentVotes = parseFloat(cr.impeachmentVotes || '0');
    const isCritical = (state !== 'inactive') || (impeachmentVotes > 0);
    const severity = isCritical ? 'CRITICAL' : 'WARNING';

    // Recovery copy is state-specific so the operator gets the right hint.
    let summaryAction;
    let summaryReason;
    if (state === 'inactive') {
        // v0.5.248 (validator-readiness audit P1) — corrected. Reactivating an
        // Inactive CR member is a NODE-KEY-signed ActivateProducer tx
        // (activateproducertransaction.go:113/212), so ENM CAN do it with the
        // keystore it already holds — no owner/deposit wallet, no Essentials.
        // The old copy ("sign from the wallet that holds your deposit, via
        // Essentials. ENM cannot do this for you") was wrong on both counts.
        summaryAction = 'CR Council member Inactive — reactivate in Node Manager';
        summaryReason = 'Your CR Committee member record reads MemberState=Inactive '
            + '(the chain skipped your DPoS slot for too many consecutive rounds). '
            + 'Node Manager can recover this: open the Validator card and click '
            + '“Reactivate Council node”. The activation is signed with this node’s '
            + 'key (no wallet needed); the node must be running and fully synced.'
            + (impeachmentVotes > 0 ? ` Impeachment votes: ${cr.impeachmentVotes} — `
                + 'reactivate before votes pass the impeachment threshold.' : '');
    } else if (state === 'impeached') {
        summaryAction = 'CR Council member Impeached — seat lost for this term';
        summaryReason = 'Your CR Committee member record reads MemberState=Impeached. '
            + 'The impeachment vote threshold was reached on-chain; your seat is gone '
            + 'for the rest of this Committee term. Your registration deposit is still '
            + 'yours but Activate is no longer an option. Re-register via Essentials '
            + 'in the next CR election cycle.';
    } else if (state === 'returned') {
        summaryAction = 'CR Council member Returned — deposit refundable';
        summaryReason = 'Your CR Committee member record reads MemberState=Returned, '
            + 'which means you voluntarily withdrew from the seat (or the chain '
            + 'returned you after impeachment). Deposit is refundable via Essentials; '
            + 'your DPoS slot is no longer in the arbiter slate.';
    } else {
        // Terminated / Illegal / any future MemberState value.
        summaryAction = `CR Council member ${cr.state} — investigate via Essentials`;
        summaryReason = `Your CR Committee member record reads MemberState=${cr.state}. `
            + 'This is a terminal state for the current term; check Elastos Essentials '
            + 'for the specific cause and next steps.';
    }

    return {
        ruleId: 'F28',
        tier: HEALING_TIERS.NEVER_AUTOMATIC,
        severity,
        summaryAction,
        summaryReason,
        payload: {
            action: 'cr-council-investigate',
            chainId: snap.chainId,
            crState: cr.state,
            impeachmentVotes: cr.impeachmentVotes || null,
            nickname: cr.nickname || null,
        },
    };
}

/**
 * Per-rule enable defaults. Per Architectural Invariant #7, healing ships
 * with F1 (auto-restart on unexpected exit) only. F2-F19 are off until
 * the operator opts in via /api/enm/healing/rules/:ruleId/enable.
 *
 * Why: prior versions ran every rule on every tick, producing 12 audit-log
 * events per hour for the same conflict (the operator's F4/F19 spam). With
 * F1-only, default installs see exactly one event per actual incident.
 *
 * Operators who want the full healing suite back can either flip these in
 * code or hit the per-rule enable endpoint. The detection logic stays
 * intact — we only gate which detectors actually run.
 */
/**
 * beta.3.21 — static metadata for the Settings → Security "What
 * auto-runs" panel. The detect functions construct tier + summary
 * at runtime when they fire, but the UI needs to list the rules
 * BEFORE any of them fires so the operator can see what the toggle
 * actually controls. The tier here MUST match what each detect
 * function returns; the description is operator-facing copy.
 */
/**
 * F29 — Council EVM sidechain silently FOLLOWING because producer status was
 * UNREADABLE (validator-readiness audit P1-2). When detectProducerRole can't
 * read the main-chain arbiter slate (mainchain RPC down / creds undecryptable /
 * error), the adapter fail-safes to FOLLOWER (no --mine). On a Council node
 * that is genuinely on-duty, that means it quietly stops producing EVM blocks
 * and earning — with only a log line. This surfaces it. When the source IS a
 * real read (getarbitersinfo / empty-slate), following is correct → stay silent.
 *
 * Tier: OWNER_CONFIRMS (a notice; recovery = fix mainchain RPC + restart the
 * chain, never an auto-action).
 */
function detectF29(snap) {
    if (!snap || !snap.minerDecision) return null;
    const d = snap.minerDecision;
    if (d.setupRole !== 'council') return null;          // BPoS sidechains follow by design
    if (d.shouldMine !== false) return null;             // only when demoted to follower
    const CANT_READ = ['no-mainchain-rpc', 'rpc-password-undecryptable', 'error', 'unavailable', 'no-node-pubkey'];
    if (!CANT_READ.includes(d.source)) return null;      // genuine off-duty read → not this rule
    const alive = !!(snap.processStatus && snap.processStatus.alive);
    if (!alive) return null;                             // only meaningful while running

    return {
        ruleId: 'F29',
        tier: HEALING_TIERS.OWNER_CONFIRMS,
        severity: 'WARNING',
        summaryAction: `${snap.chainId}: running as follower — couldn’t read producer status`,
        summaryReason:
            `${snap.chainId} started as a FOLLOWER (not producing) because Node Manager couldn’t read `
            + `your on-chain producer status (${d.source}) — usually the Main chain RPC being unreachable `
            + 'or its credentials undecryptable. If your node is on-duty it is NOT producing this '
            + `sidechain’s blocks or earning. Fix Main chain RPC, then restart ${snap.chainId} so it `
            + 're-checks the arbiter slate and resumes producing.',
        payload: { action: 'evm-follower-degraded', chainId: snap.chainId, source: d.source },
    };
}

const RULE_METADATA = Object.freeze({
    F1:  { tier: 'AUTOMATED_SAFE',  title: 'Auto-restart on crash',
           description: 'If the chain process exits unexpectedly (non-zero or SIGKILL) and the operator didn’t manually stop it, restart it.' },
    F2:  { tier: 'AUTOMATED_SAFE',  title: 'Restart on stuck RPC',
           description: 'If the chain’s RPC stops responding for over 2 minutes while the process is alive, restart it.' },
    F3:  { tier: 'AUTOMATED_SAFE',  title: 'Restart on peer-zero',
           description: 'If peer count stays at 0 longer than your alert threshold, restart so the chain reseeds peers from DNS.' },
    F4:  { tier: 'OWNER_CONFIRMS',  title: 'Restart on sync stall',
           description: 'If block height hasn’t advanced for over your sync-stall threshold despite peers, ask the operator before restarting.' },
    F5:  { tier: 'OWNER_CONFIRMS',  title: 'Disk space low',
           description: 'Surface a notice when free disk drops below the warn / critical thresholds in the Alerts section. Action stays operator-driven (ENM never deletes operator data).' },
    F6:  { tier: 'OWNER_CONFIRMS',  title: 'Process killed by OOM',
           description: 'If the chain process was SIGKILL’d (Linux OOM), suggest raising the memory limit instead of just restarting blindly.' },
    // 0.5.20 audit Session 20 — F7/F8 metadata realigned to detect-
    // function reality. Pre-0.5.20 these titles described an early
    // spec that was never built (no height-regression detector exists
    // anywhere in this file). Behavior unchanged; pure label fix.
    F7:  { tier: 'OWNER_CONFIRMS',  title: 'Port conflict on start',
           description: 'A port the chain needs is already bound by another process. Open Settings → Advanced and pick free ports, or stop the conflicting service.' },
    F8:  { tier: 'OWNER_CONFIRMS',  title: 'Binary version drift',
           description: 'The ela binary on disk reports a different version than ENM recorded at install. Suppressed for 1 hour after a fresh install (Geth-fork sidechains report their internal geth version on the `version` subcommand, not the elastos-fork tag). After the grace window, surfaces an OWNER_CONFIRMS proposal to update the recorded version.' },
    F9:  { tier: 'OWNER_CONFIRMS',  title: 'Config drift on disk',
           description: 'Notice when the chain’s config file on disk has been edited outside of ENM (manual operator change).' },
    // 0.5.52 audit Session 52 — F10/F11 metadata realigned to detect-
    // function reality. Pre-0.5.52 these described phantom features
    // (rotation reminder / deposit-drift) that have never existed in
    // any detect function. detectF10 fires on empty/missing RPC password;
    // detectF11 fires on arbiter rotation stuck (same-index across H/H-1
    // with our node in the empty slot). Behavior unchanged; pure label
    // fix. Same Session 20 pattern as F7/F8.
    F10: { tier: 'OWNER_CONFIRMS',  title: 'RPC password not set',
           description: 'If the chain’s RPC password is missing or empty, surface a notice — ENM cannot start the chain without it.' },
    F11: { tier: 'CRITICAL_NOTIFY', title: 'BPoS arbiter rotation stuck',
           description: 'Compares on-duty arbiter index across consecutive heights via getarbitratorgroupbyheight. If the index doesn’t advance and our node is in the empty slot, surface a critical alert — consensus state needs manual investigation.' },
    F12: { tier: 'NEVER_AUTOMATIC', title: 'Producer inactiveRounds rising',
           description: 'Producer is missing rounds and approaching the forced-inactive penalty at 1,440. Manual investigation only.' },
    F13: { tier: 'OWNER_CONFIRMS',  title: 'Clock skew',
           description: 'NTP skew above 2 s — close to ela’s 4.2 s tolerance for block validation. Suggest fixing systemd-timesyncd.' },
    F16: { tier: 'CRITICAL_NOTIFY', title: 'Peer-zero fallback',
           description: 'Promotes a peer-zero condition to a fallback peer suggestion when restart-by-restart hasn’t helped.' },
    F18: { tier: 'CRITICAL_NOTIFY', title: 'BPoS no-inbound',
           description: 'BPoS needs inbound peers to publish proposals. Surface a critical alert if there have been none for 5 minutes.' },
    F19: { tier: 'CRITICAL_NOTIFY', title: 'Host port conflict',
           description: 'Another process on this host is bound to a port the chain needs. Surface critical for operator triage.' },
    F22: { tier: 'CRITICAL_NOTIFY', title: 'DPoS state desync (alert)',
           description: 'When the chain freezes with "sponsor is not in current or last arbitrators" — the signature of cp_dpos/default.dcp diverging from the block ledger — surface a critical alert with manual recovery steps. Pre-beta.3.78 this rule auto-rolled state back to a snapshot; that path was removed per operator review since it papered over upstream ela bugs and risked further desync.' },
    // beta.4.00 (Wave M3.6) — Class B-only. miner.enabled=true but
    // miner.rewardAddress unset. Alert-only — operator must supply
    // the address (H22; ENM never derives a reward address).
    F25: { tier: 'CRITICAL_NOTIFY', title: 'EVM miner address unset',
           description: 'On an EVM sidechain (ESC/EID/PG) where mining is enabled, the miner.rewardAddress must be set or block rewards are lost. Surfaces a critical alert if the operator turned mining on without supplying an address.' },
    // beta.0.3.5 (Wave M4.5) — Class C-only. Oracle alive but its
    // parent EVM sidechain is offline. Auto-clears once parent
    // restarts (ChainRegistry exit-hook handles the restart side).
    F24: { tier: 'CRITICAL_NOTIFY', title: 'Oracle parent chain offline',
           description: 'An Oracle (ESC/EID/PG) relays from its parent EVM sidechain to the Main chain. If the parent is stopped while the oracle is running, surface a critical alert so the operator can bring the parent back online (or stop the orphaned oracle intentionally).' },
    // beta.0.3.14 (Wave M6.5) — Class D-only. Arbiter cross-chain
    // RPC unreachable (any of mainchain/esc/eid/pg).
    F23: { tier: 'CRITICAL_NOTIFY', title: 'Arbiter cross-chain unreachable',
           description: 'The Arbiter signs multisig payloads across all 4 chains. If any cross-chain RPC becomes unreachable, the Arbiter cannot validate or produce cross-chain signatures for that chain. Operator must investigate the affected chain; alert auto-clears when all 4 RPCs respond.' },
    // v0.5.184 — Class B-only. EVM sidechain wedged on a minority fork.
    // v0.5.231 — DEMOTED to OWNER_CONFIRMS after a false-positive wiped EID at
    // 99.96% synced. Operator now confirms every destructive resync; three
    // additional safety gates (near-tip / multi-tick / pre-exec recheck) make
    // it close to impossible to propose a wipe on a chain that isn't actually
    // forked. See detectF26 docstring + audit log 2026-05-27 17:32:45.
    F26: { tier: 'OWNER_CONFIRMS', title: 'Confirm resync of wedged EVM fork',
           description: 'On an EVM sidechain (ESC/EID/PG) that has been stuck for >20 min, is FAR from the network tip (>100k blocks behind), and whose node log persistently shows "retrieved hash chain is invalid" across multiple consecutive health checks, the local chain data appears to have forked off the network and a restart cannot recover it. Proposes a destructive resync that wipes the chain data (mining keystore AND network identity/nodekey preserved) and re-syncs from peers. ALWAYS requires operator confirmation — never auto-executes. Just before the wipe runs, conditions are re-verified and the action aborts if the chain has advanced since the proposal was raised. (v0.5.231 hardened after a 2026-05-27 false positive wiped a 99.96%-synced chain.)' },
    // v0.5.185 (P1-A) — Class B-only, alert-only. PBFT consensus-recovery stall.
    F27: { tier: 'CRITICAL_NOTIFY', title: 'EVM consensus-recovery stall',
           description: 'On an EVM sidechain (ESC/EID/PG) that is stuck for >20 min with peers but a PBFT recovery-stall log signature ("wait for recoved states" / "can not find active peer"), surface a critical alert. This is a quorum / peer problem, not a data fork — an auto-resync cannot fix it, so F26 yields to this alert and the operator restores peers/bootnodes instead.' },
    // v0.5.230 — Class A (mainchain) — alert-only. CR Council MemberState drift.
    F28: { tier: 'NEVER_AUTOMATIC', title: 'CR Council member state degraded',
           description: 'Parallel to F12 for BPoS producers. Fires when this node\'s CR Committee MemberState is anything other than \'Elected\' — typically Inactive (skipped slots for too many consecutive rounds), Impeached, Returned, Terminated, or Illegal. Inactive is recoverable in-app: the Validator card\'s "Reactivate Council node" button submits a node-key-signed ActivateProducer (no owner key needed). The other states are terminal for the current term and need the operator to investigate via Essentials. Alert-only — ENM never auto-submits the activation (it is rate-limited on-chain), so recovery is always an explicit operator click.' },
    // v0.5.248 (validator-readiness audit P1-2) — Class B-only, Council-only,
    // alert-only. EVM sidechain silently fell back to FOLLOWER because the
    // adapter couldn't read on-chain producer status (mainchain RPC down /
    // creds undecryptable / error). On an on-duty Council node that means it
    // quietly stops producing this sidechain's blocks. Surfaces it so the
    // operator fixes mainchain RPC + restarts; never auto-acts.
    F29: { tier: 'OWNER_CONFIRMS', title: 'EVM sidechain following (producer status unreadable)',
           description: 'On a Council node, an EVM sidechain (ESC/EID/PG) started as a FOLLOWER (not producing blocks) because Node Manager could not read your on-chain producer status — usually the Main chain RPC being unreachable or its credentials undecryptable. If your node is on-duty it is NOT producing this sidechain\'s blocks or earning. Recovery is operator-driven: fix Main chain RPC, then restart the sidechain so it re-checks the arbiter slate. ENM never auto-flips mining on (that would forge blocks an off-duty node has no right to).' },
});

// beta.3.22 — every rule is enabled by default. The operator-facing
// audit found EVERY rule except F1 was sitting off, which made the
// "Auto-execute safe healing" toggle nearly meaningless: even the
// alerts that just notify (CRITICAL_NOTIFY tier) never fired. Per
// directive #4 ("automatic for the user"), the healing system should
// work out-of-the-box without the operator hand-toggling 15
// detectors. Grace periods on each detect function (peer-zero ≥5min,
// RPC unreachable ≥2min, height stall ≥10min, etc.) absorb normal
// startup / transient conditions, so flipping the default to true is
// safe — false positives during boot are gated by the grace timers,
// not by the rule being off.
const DEFAULT_ENABLED = Object.freeze({
    F1: true,   // process exited unexpectedly → auto-restart
    F2: true,   // RPC unreachable (2-min grace)
    F3: true,   // peer count zero (5-min grace, operator-tunable)
    F4: true,   // sync stalled (10-min grace, operator-tunable)
    F5: true,   // disk space (operator-tunable thresholds)
    F6: true,   // OOM killed
    F7: true,   // port conflict on start (0.5.20 — comment realigned to detectF7's actual implementation)
    F8: true,   // binary version drift (with 1h binaryInstalledAt grace from v0.5.0)
    F9: true,   // config drift on disk
    F10: true,  // RPC password not set (0.5.52 — comment realigned to detectF10)
    F11: true,  // BPoS arbiter rotation stuck (0.5.52 — comment realigned to detectF11)
    F12: true,  // producer inactiveRounds (NEVER_AUTOMATIC; alert only)
    F13: true,  // clock skew
    F16: true,  // peer-zero fallback
    F18: true,  // BPoS no-inbound
    F19: true,  // host conflict (HostConflictScanner has its own dedup)
    F22: true,  // DPoS state desync (Phase 7) — auto-heal via snapshot restore
    F25: true,  // beta.4.00 — Class B miner address unset (alert-only)
    F24: true,  // beta.0.3.5 — Class C oracle parent offline (alert-only)
    F23: true,  // beta.0.3.14 — Class D arbiter cross-chain unreachable
    F26: true,  // v0.5.184 — Class B wedged-fork auto-resync (rate-limited)
    F27: true,  // v0.5.185 — Class B PBFT recovery-stall alert (alert-only)
    F28: true,  // v0.5.230 — Class A CR Council MemberState degraded (alert-only)
    F29: true,  // v0.5.248 — Class B Council EVM silently following (alert-only)
});

// Global rule overrides (apply to all chains). Pre-3.87 this was the only
// override mechanism. Beta.3.87 adds per-chain overrides below — per-chain
// wins over global wins over DEFAULT_ENABLED.
const _enabledOverrides = new Map();

// beta.3.87 — Wave M1.3 — per-chain rule overrides keyed by
// `${chainId}:${ruleId}`. Lookup order in isRuleEnabled(ruleId, chainId):
//   1. per-chain override (if chainId given AND key present)
//   2. global override (legacy `cfg.global.healing.enabledRules`)
//   3. DEFAULT_ENABLED
//
// This preserves the pre-3.87 behaviour exactly when callers don't pass
// chainId (per-chain map is just empty) AND when no per-chain config
// migration has happened yet (the migration in HealthChecker copies
// global → cfg.chains.mainchain.healing.enabledRules on first boot).
const _perChainEnabledOverrides = new Map();

/**
 * @param {string} ruleId
 * @param {boolean} enabled
 * @param {string} [chainId] — beta.3.87 — when provided, sets a per-chain
 *   override; when omitted, sets the legacy global override. Per-chain
 *   override wins over global at read time.
 */
function setRuleEnabled(ruleId, enabled, chainId) {
    if (chainId) {
        _perChainEnabledOverrides.set(`${chainId}:${ruleId}`, !!enabled);
    } else {
        _enabledOverrides.set(ruleId, !!enabled);
    }
}

/**
 * @param {string} ruleId
 * @param {string} [chainId] — beta.3.87 — when provided, per-chain override
 *   is checked first. Fall-back chain: per-chain → global → DEFAULT_ENABLED.
 */
function isRuleEnabled(ruleId, chainId) {
    if (chainId) {
        const perChainKey = `${chainId}:${ruleId}`;
        if (_perChainEnabledOverrides.has(perChainKey)) {
            return _perChainEnabledOverrides.get(perChainKey);
        }
    }
    if (_enabledOverrides.has(ruleId)) return _enabledOverrides.get(ruleId);
    return !!DEFAULT_ENABLED[ruleId];
}

function listRuleStates(chainId) {
    const all = Object.keys(DEFAULT_ENABLED);
    return all.map((ruleId) => ({
        ruleId,
        defaultEnabled: DEFAULT_ENABLED[ruleId],
        currentlyEnabled: isRuleEnabled(ruleId, chainId),
        overridden: chainId
            ? (_perChainEnabledOverrides.has(`${chainId}:${ruleId}`)
               || _enabledOverrides.has(ruleId))
            : _enabledOverrides.has(ruleId),
    }));
}

/**
 * beta.3.87 — test helper to wipe per-chain overrides. Used by unit tests
 * to ensure isolation between cases. Not exported for production callers.
 * @private
 */
function _clearPerChainOverridesForTest() {
    _perChainEnabledOverrides.clear();
}

/**
 * beta.3.21 — full metadata + state per rule for the Settings →
 * Security visibility panel. Combines RULE_METADATA (static
 * description + tier) with DEFAULT_ENABLED + override state so the
 * UI can render the operator-facing "what would auto-run" list in
 * one round trip.
 */
function listRulesMetadata() {
    const all = Object.keys(DEFAULT_ENABLED);
    return all.map((ruleId) => {
        const meta = RULE_METADATA[ruleId] || {};
        return {
            ruleId,
            tier: meta.tier || 'OWNER_CONFIRMS',
            title: meta.title || ruleId,
            description: meta.description || '',
            defaultEnabled: !!DEFAULT_ENABLED[ruleId],
            currentlyEnabled: isRuleEnabled(ruleId),
            overridden: _enabledOverrides.has(ruleId),
        };
    });
}

/**
 * Run F1-F19 in declaration order. Engine consumes the array as a queue —
 * higher-priority rules (F1 process-dead) appear first so a single tick
 * doesn't propose conflicting actions.
 *
 * @param {HealthSnapshot} snap
 * @returns {Array<Detection>}
 */
function runAll(snap) {
    /** @type {Array<Detection>} */
    const out = [];
    const detectors = [
        ['F1',  detectF1],  ['F2',  detectF2],  ['F3',  detectF3],
        // F22 evaluates BEFORE F4 so when both could fire (height stalled
        // + desync signal present), F22's specific DPoS-desync alert wins
        // over F4's generic restart proposal. Operator gets the
        // alert with manual recovery steps; F4 stays suppressed by the
        // "one detection per rule per chain per tick" gate.
        ['F22', detectF22],
        // v0.5.184 — F26 (Class B wedged-fork resync) also evaluates BEFORE
        // F4: a forked EVM chain needs a wipe+resync, NOT a restart. detectF4
        // additionally yields on snap.evmForkDetected so F26 owns the case.
        ['F26', detectF26],
        // v0.5.185 (P1-A) — F27 (recovery-stall alert) before F4 too, so the
        // consensus-stall alert wins over a generic restart proposal.
        ['F27', detectF27],
        ['F4',  detectF4],  ['F5',  detectF5],  ['F6',  detectF6],
        ['F7',  detectF7],  ['F8',  detectF8],  ['F9',  detectF9],
        ['F10', detectF10], ['F11', detectF11], ['F12', detectF12],
        ['F13', detectF13], ['F16', detectF16], ['F18', detectF18],
        ['F19', detectF19],
        // beta.4.00 (Wave M3.6) — Class B miner-address-unset.
        ['F25', detectF25],
        // beta.0.3.5 (Wave M4.5) — Class C oracle parent offline.
        ['F24', detectF24],
        // beta.0.3.14 (Wave M6.5) — Class D arbiter cross-chain.
        ['F23', detectF23],
        // v0.5.230 — Class A CR Council MemberState degraded (F12 sibling).
        ['F28', detectF28],
        // v0.5.248 (validator-readiness P1-2) — Class B Council EVM silently
        // following because producer status was unreadable (alert-only).
        ['F29', detectF29],
    ];

    // beta.3.87 — Wave M1.3 — DPoS-only rules. F11 (rotation stuck),
    // F12 (producer Inactive), F22 (DPoS state desync) ONLY make sense
    // for Class A chains (ELA mainchain with BPoS). For non-Class-A
    // chains they short-circuit silently — even though the existing
    // detectors already self-gate via snap-field presence (snap.bpos,
    // snap.dposDesyncDetected populated only for mainchain), making
    // the class gate explicit prevents accidental misfires if a future
    // Class B/C/D chain populates a bpos-shaped snap field by mistake.
    //
    // F18 stays HYBRID (audited): the existing detector dispatches its
    // own CRITICAL-vs-INFO severity based on `chainConfig.dpos.enableArbiter`.
    // For Class B chains lacking a `dpos` config block, the BPoS-CRITICAL
    // path falls through to INFO automatically. No explicit gate needed
    // for F18 at this layer.
    //
    // Import here (function scope) instead of at module top to avoid
    // a circular: ChainAdapter requires EnmConstants which... actually,
    // no cycle today; static import safe. But function-scope require
    // means HealthRules unit tests don't need ChainAdapter loaded.
    const ChainAdapter = require('./ChainAdapter');
    const DPOS_ONLY_RULES = new Set(['F11', 'F12', 'F22']);
    // beta.4.00 (Wave M3.6) — Class B-only rules. F25 is mining-address
    // semantics that only apply to EVM sidechains; for mainchain (Class A)
    // or oracles (Class C) etc., the rule is silently skipped.
    // v0.5.184/185 — F26 (wedged-fork auto-resync) + F27 (recovery-stall alert)
    // are EVM-sidechain-only.
    // v0.5.248 — F29 (Council EVM silently following, producer status unreadable)
    // is also EVM-sidechain-only; the detector additionally self-gates on
    // setupRole==='council' via snap.minerDecision.
    const CLASS_B_ONLY_RULES = new Set(['F25', 'F26', 'F27', 'F29']);
    // beta.0.3.5 (Wave M4.5) — Class C-only rules. F24 fires only for
    // oracles (esc-oracle/eid-oracle/pg-oracle) where the parent-
    // chain abstraction exists.
    const CLASS_C_ONLY_RULES = new Set(['F24']);
    // beta.0.3.14 (Wave M6.5) — Class D-only rules. F23 fires only
    // for the arbiter; the cross-chain reachability abstraction
    // doesn't apply to single-chain components.
    const CLASS_D_ONLY_RULES = new Set(['F23']);
    const chainId = snap && snap.chainId;
    const chainClass = chainId ? ChainAdapter.classOf(chainId) : null;

    for (const [ruleId, fn] of detectors) {
        // Per-chain enable check — falls back to global override then
        // DEFAULT_ENABLED if no per-chain override exists. Pre-3.87
        // behaviour preserved when no per-chain override set.
        if (!isRuleEnabled(ruleId, chainId)) continue;
        // beta.3.87 — Class A gate for DPoS-only rules. chainClass is
        // 'A' for mainchain, 'B/C/D/E' for sidechains/oracles/arbiter/spv,
        // null for unknown chainIds (treat null as legacy-permissive
        // since pre-3.85 didn't have classification — backward compat).
        if (DPOS_ONLY_RULES.has(ruleId)
            && chainClass !== null
            && chainClass !== 'A') {
            continue;
        }
        if (CLASS_B_ONLY_RULES.has(ruleId)
            && chainClass !== null
            && chainClass !== 'B') {
            continue;
        }
        if (CLASS_C_ONLY_RULES.has(ruleId)
            && chainClass !== null
            && chainClass !== 'C') {
            continue;
        }
        if (CLASS_D_ONLY_RULES.has(ruleId)
            && chainClass !== null
            && chainClass !== 'D') {
            continue;
        }
        const d = fn(snap);
        if (d) out.push(d);
    }
    return out;
}

module.exports = {
    runAll,
    DEFAULT_ENABLED,
    setRuleEnabled,
    isRuleEnabled,
    listRuleStates,
    listRulesMetadata,
    RULE_METADATA,
    // beta.3.19 — operator-tunable thresholds (Phase 2 Alerts section).
    setThresholds,
    getThresholds,
    detectF1, detectF2, detectF3, detectF4, detectF5,
    detectF6, detectF7, detectF8, detectF9, detectF10,
    detectF11, detectF12, detectF13, detectF16, detectF18,
    detectF22,
    detectF19,
    detectF25,  // beta.4.00 (Wave M3.6)
    detectF24,  // beta.0.3.5 (Wave M4.5)
    detectF23,  // beta.0.3.14 (Wave M6.5)
    detectF26,  // v0.5.184 — Class B wedged-fork auto-resync
    detectF27,  // v0.5.185 (P1-A) — Class B PBFT recovery-stall alert
    detectF28,  // v0.5.230 — Class A CR Council MemberState degraded
    detectF29,  // v0.5.248 — Class B Council EVM silently following
    EVM_FORK_STALL_GRACE_MS,
    SPV_CAUGHTUP_MAX_DELTA,  // v0.5.185 (P0-B)
    PEER_ZERO_GRACE_MS,
    RPC_UNREACHABLE_GRACE_MS,
    HEIGHT_STALL_GRACE_MS,
    INITIAL_SYNC_GRACE_MS,   // FIX-C15
    DISK_CRITICAL_GB,
    DISK_WARN_GB,
    PEER_ZERO_FALLBACK_MS,
    NO_INBOUND_GRACE_MS,
    CLOCK_SKEW_WARN_MS,
    PRODUCER_INACTIVE_WARN,
    PRODUCER_INACTIVE_CRITICAL,
    // beta.3.87 — Wave M1.3 — test-only helper to clear per-chain
    // override state between cases. Not for production callers.
    _clearPerChainOverridesForTest,
};
