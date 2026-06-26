/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * Shared constants for the Elastos Node Manager extension.
 *
 * One source of truth — change here, never duplicate.
 */

'use strict';

const ENM_NAME = 'elastos-node-manager';
const ENM_LOG_PREFIX = '[ENM]';
// Under the standalone enm-server (post 0.1-alpha pivot from Puter-extension
// to PC2 app + sidecar), API routes live at /api/enm/*. The frontend at
// src/backend/apps/elastos-node-manager/ is served by pc2-node and calls us
// cross-origin. ENM_ROUTE_PREFIX is unused now (the frontend isn't served
// by enm-server) but kept exported for backward compat with audit log
// records that reference it.
const ENM_ROUTE_PREFIX = `/apps/${ENM_NAME}`;
const ENM_API_PREFIX = '/api/enm';

// Default ports for ELA mainchain (per common/config/config.go:127,174,266-269).
// Operator can override in Settings → Advanced.
const ELA_DEFAULT_PORTS = Object.freeze({
    rpc: 20336,        // HttpJsonPort — JSON-RPC (HTTP Basic auth)
    nodePort: 20338,   // NodePort — P2P
    httpInfo: 20333,   // HttpInfoPort — REST info (NO auth, used for --health-cmd)
    httpRest: 20334,   // HttpRestPort — REST API
    httpWs: 20335,     // HttpWsPort — WebSocket
    dpos: 20339,       // DPoSPort — DPoS p2p (BPoS only)
});

// MaxInactiveRounds (consensus penalty threshold) per common/config/config.go:192.
// At ~2 min/block, 1440 blocks ≈ 48h continuous miss before forced inactive state.
const MAX_INACTIVE_ROUNDS = 1440;

// BPoS deposit threshold per cr/state/state.go:26-27.
const MIN_DPOSV2_DEPOSIT_ELA = 2000;

// Producer state machine per dpos/state/state.go:36-60.
// Six states (Rev 1 audit corrected initial 5-state assumption).
const PRODUCER_STATES = Object.freeze([
    'Pending', 'Active', 'Inactive', 'Canceled', 'Illegal', 'Returned',
]);

// Hardcoded mainnet DNS seeds per common/config/config.go:128-133.
// Last updated 2023-03-25 in Elastos.ELA — F16 watches for prolonged peer-zero state.
const MAINNET_DNS_SEEDS = Object.freeze([
    '52.74.28.202:20338',
    '52.62.113.83:20338',
    '35.156.51.127:20338',
    '35.177.89.244:20338',
]);

// Healing decision tiers (Rev 1 plan, mapped per F-rule).
const HEALING_TIERS = Object.freeze({
    AUTOMATED_SAFE: 'AUTOMATED-SAFE',
    OWNER_CONFIRMS: 'OWNER-CONFIRMS',
    CRITICAL_NOTIFY: 'CRITICAL-NOTIFY',
    NEVER_AUTOMATIC: 'NEVER-AUTOMATIC',
    // Synthetic tier for the per-route HTTP audit middleware. Distinct from
    // the four healing tiers so the audit-tab UI can filter healing decisions
    // separately from raw HTTP mutation logs (Phase 4 audit, agent 1).
    HTTP_MUTATION: 'HTTP-MUTATION',
});

// Severity levels for notifications + audit log.
const SEVERITY = Object.freeze({
    INFO: 'INFO',
    WARNING: 'WARNING',
    CRITICAL: 'CRITICAL',
    HEALING: 'HEALING',
});

// Chain states for the dashboard UI (color tokens defined in CSS).
const CHAIN_STATES = Object.freeze([
    'healthy', 'syncing', 'stalled', 'stopped', 'error', 'recovering',
    // beta.3.83 — Wave D — chain process is alive but RPC hasn't bound
    // yet. ela takes ~30s after launch to open the RPC port + load
    // indexes; during that window status.alive=true but getblockcount
    // returns null. Pre-3.83 the dashboard rendered "Healthy" with
    // blank height/peers widgets (confusing). 'starting' is the
    // honest answer: process is up, RPC isn't ready, give it a moment.
    'starting',
]);

// Health-check polling buckets (Rev 1 plan: fast/medium/slow).
const HEALTH_TICK_MS = Object.freeze({
    FAST: 5_000,    // process alive, RPC reachable
    MEDIUM: 30_000, // peer count, height delta, RPC latency
    SLOW: 300_000,  // disk usage, BPoS state, arbiter rotation, clock skew
});

// Process lifecycle constants (Rev 8/9 — native binary).
const PROCESS_STOP_GRACE_MS = 60_000;       // SIGTERM → wait → SIGKILL
const PROCESS_RESTART_COOLDOWN_MS = 30_000; // between F1 attempts
const PROCESS_MAX_RESTART_ATTEMPTS = 3;     // before escalating to OWNER_CONFIRMS
// Rolling window for the budget. Per Rev 9 plan ("F1/F2/F3 escalate to
// OWNER-CONFIRMS after 3 attempts in 10 min"), this is independent of the
// cooldown — set it conservatively so we don't loop a chain that's broken at
// a deeper layer than restart can heal.
const PROCESS_RESTART_BUDGET_WINDOW_MS = 10 * 60 * 1000;

// v0.5.184 — graceful-drain budget on ENM shutdown. The per-chain stop path
// (NativeProcessService._signalAndWait) already waits PROCESS_STOP_GRACE_MS for
// a clean flush, but ENM's OWN shutdown (server.js onShutdown + /teardown) used
// to fire SIGINT to the children fire-and-forget then exit within ms — so geth
// (which needs tens of seconds to flush leveldb) got SIGKILLed mid-write by the
// process-group teardown → dirty DB → rewind on restart → (for a mining EVM
// node) fork. We now AWAIT the children's clean exit up to this budget before
// letting ENM exit.
//
// v0.5.185 (P0-D) — raised 45s → 120s. Diagnosed root cause of the recurring
// EVM forks: pc2-node's service cgroup (KillMode=control-group) SIGKILLs ENM +
// all 8 chains when its 90s systemd TimeoutStopSec expires, and the 20 GB
// esc/eid geth chains can take far longer than 45s to flush leveldb → killed
// mid-write → corruption → fork. The host's TimeoutStopSec was raised to 300s
// (pc2-node.service.d/timeoutstop.conf drop-in), so this 120s drain now fits
// comfortably inside the supervisor's stop budget and lets the big chains flush.
const SHUTDOWN_DRAIN_GRACE_MS = 120_000;

// v0.5.184 — F26 auto-resync rate limit. Wiping + re-syncing an EVM chain is
// destructive (drops to genesis, hours to rebuild) though recoverable (keystore
// always preserved). We allow AT MOST one automatic resync per chain per this
// window; if the chain re-forks again inside it, F26 escalates to OWNER_CONFIRMS
// instead of wiping in a loop. Persisted via the audit log (survives restart).
const EVM_RESYNC_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Audit log tier labels (matches HEALING_TIERS but flat strings for SQL).
const AUDIT_DECISION = Object.freeze({
    PROPOSED: 'proposed',
    CONFIRMED: 'confirmed',
    REJECTED: 'rejected',
    EXECUTED: 'executed',
    FAILED: 'failed',
    MANUAL_ONLY: 'manual-only',
    // beta.3.80 — emitted when an AUTOMATED-SAFE action was suppressed
    // by a master toggle (currently cfg.global.healing.autoExecuteSafe).
    // Distinct from REJECTED (which means the operator declined a
    // proposal) and FAILED (which means execution attempted but errored).
    SKIPPED: 'skipped',
});

// HTTP error format (matches PC2 convention from Rev 4 audit:
// inline try/catch + res.status().json({ success: false, error: '...' })).
//
// 0.5.113 audit Session 113 — defensive guard. Pre-0.5.113 a caller
// that invoked errorBody() with null / undefined / no argument
// produced { error: "undefined" } or { error: "null" } in the
// response body — every operator-facing 4xx/5xx surface would have
// shown the literal string "undefined" instead of a recovery hint.
// Now: fall back to a static "Unknown error" string. Doesn't paper
// over the real bug (callers should always pass a message) — the
// fallback just keeps the operator-facing copy readable while the
// caller's missing-message gets fixed.
function errorBody(message) {
    const text = (message == null || message === '')
        ? 'Unknown error'
        : String(message);
    return { success: false, error: text };
}

function successBody(result) {
    return { success: true, result };
}

module.exports = {
    ENM_NAME,
    ENM_LOG_PREFIX,
    ENM_ROUTE_PREFIX,
    ENM_API_PREFIX,
    ELA_DEFAULT_PORTS,
    MAX_INACTIVE_ROUNDS,
    MIN_DPOSV2_DEPOSIT_ELA,
    PRODUCER_STATES,
    MAINNET_DNS_SEEDS,
    HEALING_TIERS,
    SEVERITY,
    CHAIN_STATES,
    HEALTH_TICK_MS,
    PROCESS_STOP_GRACE_MS,
    SHUTDOWN_DRAIN_GRACE_MS,
    EVM_RESYNC_MIN_INTERVAL_MS,
    PROCESS_RESTART_COOLDOWN_MS,
    PROCESS_MAX_RESTART_ATTEMPTS,
    PROCESS_RESTART_BUDGET_WINDOW_MS,
    AUDIT_DECISION,
    errorBody,
    successBody,
};
