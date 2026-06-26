/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmAutoStart — wire `global.autoStart.onBoot` into the server.js boot path.
 *
 * Why this exists:
 *   EnmConfigSchema.js defines `global.autoStart = { onBoot: bool, delaySec: int }`
 *   with the schema-level docstring promising "start any chain whose enabled=true
 *   on boot; reattach handles the warm-restart case, this handles cold boots."
 *   server.js's boot docstring (line 16) also promises "(sweepers + auto-start)".
 *   But no code ever read the field — so every ENM restart (deploy, crash, host
 *   reboot) left enabled chains stopped until F1's slow self-heal tick eventually
 *   cleared whatever blocker (stale LOCK, etc.) and restarted them. That window
 *   was minutes to hours depending on F1 cadence. After a deploy on a test node
 *   the chain stayed `state=stopped` indefinitely until manual restart.
 *
 * What this does:
 *   - Reads cfg via ConfigStore.load()
 *   - Gates: setup must be complete, autoStart.onBoot must not be opted out
 *   - After `delaySec` (default 10) seconds: for each chain where `enabled=true`,
 *     check if it's already alive (reattach picked it up — skip) or start it.
 *   - Writes an AUTOMATED-SAFE audit row per chain so the Activity tab shows
 *     "Auto-started <chain> on ENM boot" in friendly mode.
 *   - Failure does NOT loop here — F1's self-healing engine handles retries.
 *     Auto-start is fire-and-forget; the audit row is the only side channel.
 *
 * Design constraints:
 *   - setTimeout-based delay so server.listen() is not blocked on startup
 *   - Sequential per-chain (no Promise.all) so a future multi-chain setup doesn't
 *     race on shared resources (port-bind, leveldb open, binary smoke-tests)
 *   - statusSync guard makes the whole module idempotent — calling runAutoStart
 *     twice in quick succession won't double-start a chain
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { ENM_LOG_PREFIX } = require('./EnmConstants');
const ConfigStore = require('./ConfigStore');
const AuditLog = require('./EnmAuditLog');
const { pc2DataDir } = require('./DataDir');

// v0.5.201 Phase 2 — deploy-in-progress marker. scripts/deploy-enm.sh writes
// this file BEFORE issuing the DELETE /api/installed-apps call and clears it
// AFTER the post-install health check passes. While present (and fresh), ENM
// skips autoStart on boot so the deploy's DELETE → install-local sequence
// doesn't trigger a respawn storm. The contract is intentionally simple — a
// flag file in pc2DataDir (which survives the bundle wipe in externalDataDirs).
//
// File path is mirrored in scripts/deploy-enm.sh; if you change it here,
// change it there too (or every deploy will skip the marker check entirely).
const DEPLOY_MARKER_FILE = '.enm-deploy-in-progress';
// 10 minutes — long enough to cover the slowest deploy (snapshot extract is
// minutes, install-local + verify is under 2), short enough that a crashed
// deploy script doesn't permanently disable autoStart. The deploy script
// also clears the marker on its own failure path, so this is a safety net.
const DEPLOY_MARKER_MAX_AGE_MS = 10 * 60 * 1000;
// Re-check cadence while the marker is present. 30s is short enough that
// chains come back promptly after the deploy clears the marker, long enough
// that we don't burn CPU on stat() during a multi-minute snapshot extract.
const DEPLOY_MARKER_RECHECK_MS = 30 * 1000;

// Module-level recheck handle so successive scheduleAutoStartRecheck calls
// don't pile up overlapping timers (e.g. if runAutoStart somehow gets called
// twice — defensive only; server.js calls it exactly once on boot).
let _recheckTimer = null;

/**
 * v0.5.201 Phase 2 — re-check helper. When Gate 0 in runAutoStart finds the
 * deploy marker present, it calls this to poll for marker disappearance and
 * then trigger a fresh runAutoStart. Without this, chains the deploy
 * intentionally drained (mainchain + arbiter) would stay stopped indefinitely
 * after the deploy clears the marker.
 *
 * Self-terminating: stops once the marker is gone OR the marker has aged past
 * DEPLOY_MARKER_MAX_AGE_MS. Re-entrant safe: clears any prior timer first.
 *
 * @param {object} deps  Same shape as runAutoStart deps (extensionHandle + registry).
 * @param {string} markerPath  Absolute path to the marker file.
 */
function scheduleAutoStartRecheck(deps, markerPath) {
    if (_recheckTimer) {
        clearTimeout(_recheckTimer);
        _recheckTimer = null;
    }
    const log = (deps.extensionHandle && deps.extensionHandle.log) || console;
    _recheckTimer = setTimeout(async () => {
        _recheckTimer = null;
        let st = null;
        try { st = fs.statSync(markerPath); } catch (_) { /* gone */ }
        if (!st) {
            log.info(`${ENM_LOG_PREFIX} autoStart: deploy marker cleared — running autoStart now`);
            try {
                await runAutoStart(deps);
            } catch (err) {
                log.error(`${ENM_LOG_PREFIX} autoStart re-run after deploy failed: ${err.message}`);
            }
            return;
        }
        const ageMs = Date.now() - st.mtimeMs;
        if (ageMs >= DEPLOY_MARKER_MAX_AGE_MS) {
            log.warn(
                `${ENM_LOG_PREFIX} autoStart: deploy marker now stale `
                + `(age ${Math.round(ageMs / 1000)}s) — running autoStart with marker ignored`,
            );
            try {
                await runAutoStart(deps);
            } catch (err) {
                log.error(`${ENM_LOG_PREFIX} autoStart re-run after stale marker failed: ${err.message}`);
            }
            return;
        }
        // Marker still present and still fresh — keep waiting.
        scheduleAutoStartRecheck(deps, markerPath);
    }, DEPLOY_MARKER_RECHECK_MS);
    // Don't keep the Node event loop alive purely on this timer — if ENM is
    // exiting for any reason, let it exit.
    if (_recheckTimer && typeof _recheckTimer.unref === 'function') {
        _recheckTimer.unref();
    }
}

const RULE_ID = 'AUTOSTART';
const TIER = 'AUTOMATED-SAFE';
const EXECUTOR = 'system';
// beta.3.52 — switched from 0x000…000 to the literal 'system' label.
// ENM audit rows never carry EVM-shaped wallet addresses anymore;
// the column holds an actor *role*, not a PC2 identity.
const SYSTEM_WALLET = 'system';

/**
 * Orchestrate auto-start of enabled chains on ENM boot.
 *
 * Called once from server.js right after the reattach() block. Returns a quick
 * decision object describing what was scheduled; the actual start work runs
 * asynchronously via setTimeout so the boot path can proceed to app.listen().
 *
 * @param {object} deps
 * @param {object} deps.extensionHandle  PC2 extension handle (for log + db)
 * @param {object} deps.registry         ChainRegistry singleton
 * @returns {Promise<{ scheduled: boolean, reason?: string, delayMs?: number, chainCount?: number }>}
 */
async function runAutoStart(deps) {
    if (!deps || !deps.extensionHandle || !deps.registry) {
        throw new TypeError('EnmAutoStart.runAutoStart: { extensionHandle, registry } required');
    }
    const { extensionHandle, registry } = deps;
    const log = extensionHandle.log || console;

    // Gate 0 (v0.5.201 Phase 2) — deploy in progress.
    //
    // scripts/deploy-enm.sh writes a marker file BEFORE the DELETE call and
    // clears it AFTER the post-install health check passes. While present
    // and fresh, skip autoStart so the deploy's DELETE → install-local
    // sequence doesn't trigger a respawn storm. The v0.5.200 deploy
    // (2026-05-24) cycled mainchain through 5 spawn/kill iterations because
    // every pc2-node-respawned ENM ran autoStart and spawned a fresh ela
    // before the next deploy step killed it — the final spawn (188337)
    // orphaned because its parent ENM died before the PID file was flushed.
    //
    // When the marker is present we don't just skip — we schedule a
    // re-check loop so that ONCE the deploy clears the marker, autoStart
    // runs automatically. Without this, chains the deploy drained
    // (mainchain + arbiter) would stay stopped until either the operator
    // manually started them or ENM was restarted again.
    //
    // Stale marker safety: if the deploy script crashed and left the
    // marker, we ignore it after DEPLOY_MARKER_MAX_AGE_MS (10 min). That
    // beats the alternative (autoStart silently disabled forever) and
    // matches the script's own age-cutoff comment.
    try {
        const markerPath = path.join(pc2DataDir(), DEPLOY_MARKER_FILE);
        const st = fs.statSync(markerPath);
        if (st && typeof st.mtimeMs === 'number') {
            const ageMs = Date.now() - st.mtimeMs;
            if (ageMs < DEPLOY_MARKER_MAX_AGE_MS) {
                log.info(
                    `${ENM_LOG_PREFIX} autoStart: deploy marker present `
                    + `(${markerPath}, age ${Math.round(ageMs / 1000)}s) — `
                    + `skipping; will re-check every ${DEPLOY_MARKER_RECHECK_MS / 1000}s`,
                );
                scheduleAutoStartRecheck(deps, markerPath);
                return { scheduled: false, reason: 'deploy-in-progress', recheck: true };
            }
            log.warn(
                `${ENM_LOG_PREFIX} autoStart: stale deploy marker `
                + `(age ${Math.round(ageMs / 1000)}s > ${DEPLOY_MARKER_MAX_AGE_MS / 1000}s) — `
                + 'ignoring marker and proceeding (deploy script may have crashed)',
            );
        }
    } catch (_) {
        // No marker file — normal boot path, proceed.
    }

    let cfg;
    try {
        cfg = await ConfigStore.load();
    } catch (err) {
        log.warn(`${ENM_LOG_PREFIX} autoStart: ConfigStore.load failed — skipping (${err.message})`);
        return { scheduled: false, reason: 'config-load-failed' };
    }

    // Gate 1 — setup wizard must be complete. We never start chains before the
    // operator has confirmed the binary path / keystore / config in the wizard.
    if (!cfg || !cfg.setup || cfg.setup.completed !== true) {
        log.info(`${ENM_LOG_PREFIX} autoStart: setup not complete — skipping`);
        return { scheduled: false, reason: 'setup-incomplete' };
    }

    // Gate 2 — operator opt-out. Defaults from the schema are `{ onBoot: true,
    // delaySec: 10 }` so this is opt-out, not opt-in.
    const opts = (cfg.global && cfg.global.autoStart) || { onBoot: true, delaySec: 10 };
    if (opts.onBoot === false) {
        log.info(`${ENM_LOG_PREFIX} autoStart: disabled in config — skipping`);
        return { scheduled: false, reason: 'disabled-in-config' };
    }

    const delaySec = Number.isInteger(opts.delaySec) && opts.delaySec >= 0 ? opts.delaySec : 10;
    const delayMs = delaySec * 1000;

    const enabledChainIds = Object.entries(cfg.chains || {})
        .filter(([_, c]) => c && c.enabled === true)
        .map(([id]) => id);

    if (enabledChainIds.length === 0) {
        log.info(`${ENM_LOG_PREFIX} autoStart: no chains have enabled=true — nothing to do`);
        return { scheduled: false, reason: 'no-enabled-chains' };
    }

    // v0.5.228 — oracle pairing. An EVM sidechain without its oracle is
    // half-broken: the chain produces / follows blocks fine, but cross-
    // chain transfers (SPV proofs the oracle relays from mainchain to
    // the sidechain) won't process. Operator directive 2026-05-27: "they
    // should be started together... on reboots and stuff both should
    // run." So whenever an EVM parent is in the enabled list, append
    // its oracle to the boot start list too — even if oracle.enabled is
    // currently false in cfg.json. Op can still stop an oracle manually
    // after boot if they want it off for a specific run. Dedupe in case
    // the operator already had the oracle in the enabled list.
    //
    // pairedOraclesSet is threaded into startAllChains so the "enabled"
    // recheck inside the loop has an exemption — without that exemption
    // the loop re-filters by cfg.enabled===true and the added oracles
    // get dropped right back out.
    const ChainAdapter = require('./ChainAdapter');
    const beforePair = enabledChainIds.slice();
    const paired = [];
    // Exemption set: any chainId added here bypasses the "skip if cfg.enabled
    // !== true" guard inside startAllChains. Holds both oracles (paired to
    // their EVM parent) and the arbiter (paired to the full 4-chain set).
    const pairedServicesSet = new Set();
    for (const cid of beforePair) {
        const oracleId = ChainAdapter.oracleOf(cid);
        if (oracleId
            && !enabledChainIds.includes(oracleId)
            && cfg.chains
            && cfg.chains[oracleId]) {  // oracle must be registered in cfg
            enabledChainIds.push(oracleId);
            pairedServicesSet.add(oracleId);
            paired.push(`${oracleId} (parent: ${cid})`);
        }
    }
    if (paired.length > 0) {
        log.info(
            `${ENM_LOG_PREFIX} autoStart: oracle-pairing added `
            + `${paired.length} oracle(s) to the boot list — ${paired.join(', ')}`,
        );
    }

    // v0.5.228 — arbiter pairing. The arbiter is the cross-chain bridge: it
    // SPV-syncs from mainchain to confirm transfers to/from esc/eid/pg, so
    // it functionally depends on ALL four chains being live (the adapter
    // declares SIDECHAINS_REQUIRED = ['mainchain','esc','eid','pg']). Same
    // operator directive as oracles ("on reboots and stuff both should
    // run") — when the full Council quartet is enabled, also boot the
    // arbiter even if its own cfg.enabled is false. Skipping is safe when
    // the quartet is incomplete: arbiter spawn would fail its pre-flight
    // anyway, so paired-start would just produce confusing errors.
    const ARBITER_REQUIRED = ['mainchain', 'esc', 'eid', 'pg'];
    const quartetEnabled = ARBITER_REQUIRED.every(
        (cid) => cfg.chains && cfg.chains[cid] && cfg.chains[cid].enabled === true,
    );
    if (quartetEnabled
        && cfg.chains
        && cfg.chains.arbiter
        && !enabledChainIds.includes('arbiter')) {
        enabledChainIds.push('arbiter');
        pairedServicesSet.add('arbiter');
        log.info(
            `${ENM_LOG_PREFIX} autoStart: arbiter-pairing — mainchain + 3 EVM chains all `
            + 'enabled, adding arbiter to the boot list (cfg.enabled='
            + `${cfg.chains.arbiter.enabled})`,
        );
    } else if (!quartetEnabled && cfg.chains && cfg.chains.arbiter
        && cfg.chains.arbiter.enabled !== true) {
        // Log why we're NOT pairing — helps operators understand why
        // arbiter stayed down after a partial-quartet boot.
        const missing = ARBITER_REQUIRED.filter(
            (cid) => !(cfg.chains[cid] && cfg.chains[cid].enabled === true),
        );
        log.info(
            `${ENM_LOG_PREFIX} autoStart: arbiter-pairing skipped — `
            + `quartet incomplete (missing: ${missing.join(', ')})`,
        );
    }

    // beta.3.88 — Wave M1.4 — dependency-DAG ordering. Pre-3.88 we
    // started chains in arbitrary Object.entries() order. For Council
    // nodes this races: an oracle starting before its parent EVM chain
    // is alive crashes on first RPC ping; Arbiter starting before all
    // chains are reachable fails its SPV catchup. The plan's boot
    // order (per node.sh + audited dependency graph):
    //
    //   mainchain → ESC | EID | PG (parallel) → their Oracles
    //   (after parent accepts RPC) → Arbiter (last, needs all 4)
    //
    // Sort the enabled list by class precedence:
    //   A (mainchain) → B (esc/eid/pg) → C (oracles) → D (arbiter) → E (spv)
    //
    // ChainAdapter.classOf returns null for unknown chainIds — those
    // sort last (treated as lowest priority). startAllChains is still
    // SEQUENTIAL within the sorted order to avoid port-bind races.
    // (ChainAdapter already required above for oracle-pairing.)
    const CLASS_ORDER = { A: 0, B: 1, C: 2, D: 3, E: 4 };
    const orderedChainIds = enabledChainIds.slice().sort((a, b) => {
        const ca = ChainAdapter.classOf(a);
        const cb = ChainAdapter.classOf(b);
        const pa = ca && CLASS_ORDER[ca] !== undefined ? CLASS_ORDER[ca] : 99;
        const pb = cb && CLASS_ORDER[cb] !== undefined ? CLASS_ORDER[cb] : 99;
        if (pa !== pb) return pa - pb;
        // Stable within class: alphabetical
        return a.localeCompare(b);
    });

    log.info(
        `${ENM_LOG_PREFIX} autoStart: scheduling ${orderedChainIds.length} chain(s) `
        + `[${orderedChainIds.join(' → ')}] (dependency-DAG order) to start in ${delaySec}s`,
    );

    // v0.5.236 — staged initial sync for constrained hosts. When
    // global.syncStrategy === 'staged', hand the bring-up to
    // EnmStageSyncOrchestrator, which runs ≤N heavy chains (mainchain +
    // esc/eid/pg) concurrently, waiting for each to reach the network tip
    // before starting the next — so a low-end host isn't crushed by 3
    // simultaneous EVM full-syncs. Default ('concurrent') keeps the legacy
    // all-at-once startAllChains path. The orchestrator is idempotent +
    // resumable (re-derives from live state), so it's safe to invoke on
    // every boot; once all chains are synced it just (re)starts them and
    // finishes immediately.
    const syncStrategy = (cfg.global && cfg.global.syncStrategy) || 'concurrent';
    const stagedConcurrency = (cfg.global && cfg.global.stagedSync
        && Number.isInteger(cfg.global.stagedSync.concurrency))
        ? cfg.global.stagedSync.concurrency : 2;

    setTimeout(() => {
        if (syncStrategy === 'staged') {
            log.info(
                `${ENM_LOG_PREFIX} autoStart: syncStrategy=staged — handing bring-up to `
                + `stage-sync orchestrator (window=${stagedConcurrency})`,
            );
            try {
                const Orchestrator = require('./EnmStageSyncOrchestrator');
                Orchestrator.startStaged({
                    extensionHandle,
                    registry,
                    chainIds: orderedChainIds,
                    concurrency: stagedConcurrency,
                });
            } catch (err) {
                // Fail safe: if the orchestrator can't start, fall back to the
                // all-at-once path so chains still come up (better an over-
                // eager sync than no node at all).
                log.error(
                    `${ENM_LOG_PREFIX} autoStart: stage-sync orchestrator failed to start `
                    + `(${err.message}) — falling back to concurrent startAllChains`,
                );
                startAllChains({
                    extensionHandle, registry, chainIds: orderedChainIds, pairedServices: pairedServicesSet,
                }).catch((e) => log.error(`${ENM_LOG_PREFIX} autoStart fallback crashed: ${e.message}`));
            }
            return;
        }
        // Re-read config inside the timer so operator changes during the grace
        // window (e.g. they disabled a chain right after boot) take effect.
        startAllChains({
            extensionHandle,
            registry,
            chainIds: orderedChainIds,
            // v0.5.228 — paired services (oracles + arbiter) bypass the
            // "enabled === true" guard inside the loop; see the pairing
            // blocks above for the why.
            pairedServices: pairedServicesSet,
        })
            .catch((err) => {
                log.error(`${ENM_LOG_PREFIX} autoStart loop crashed: ${err.message}`);
            });
    }, delayMs);

    return {
        scheduled: true, delayMs, chainCount: orderedChainIds.length,
        order: orderedChainIds, syncStrategy,
    };
}

/**
 * Iterate the chain ids and start each one in sequence. Sequential (not
 * parallel) so a future multi-chain setup doesn't race on port-bind, leveldb
 * open, or binary smoke-tests. Per-chain failure is logged + audited but does
 * not abort the loop — the next chain still gets a chance.
 *
 * @param {object} args
 * @param {object} args.extensionHandle
 * @param {object} args.registry
 * @param {string[]} args.chainIds
 */
async function startAllChains(args) {
    // v0.5.228 — pairedServices is the Set<chainId> of companion services
    // (oracles + arbiter) included in chainIds because their parent /
    // prerequisite chain(s) are enabled. They get an exemption from the
    // "skip if enabled !== true" guard below so the parent enabled-flag
    // implies the companion should boot too. Backward-compat accepts the
    // legacy `pairedOracles` name in case any external caller (tests)
    // still passes it.
    const { extensionHandle, registry, chainIds } = args;
    const pairedSetSource = args.pairedServices || args.pairedOracles;
    const log = extensionHandle.log || console;
    const pairedSet = pairedSetSource instanceof Set ? pairedSetSource : new Set();

    let cfg;
    try {
        cfg = await ConfigStore.load();
    } catch (err) {
        log.error(`${ENM_LOG_PREFIX} autoStart: ConfigStore.load (timer) failed — aborting: ${err.message}`);
        return;
    }

    let db = null;
    try {
        db = extensionHandle.import('data').db;
    } catch (err) {
        log.debug(`${ENM_LOG_PREFIX} autoStart: db handle unavailable — audit rows will be skipped (${err.message})`);
    }

    const proc = registry.getProcessService();

    for (const chainId of chainIds) {
        const chainCfg = cfg.chains && cfg.chains[chainId];

        // Re-check enabled: operator may have flipped it during the grace window.
        // v0.5.228 — paired oracles (added by oracle-pairing because their EVM
        // parent is enabled) get an exemption. Their own enabled flag is
        // informational only when the parent is up — config.enabled=false on
        // an oracle whose parent is enabled means "the operator opted into
        // having an EVM chain, the oracle is implied". This matches the
        // operator's expectation ("on reboots and stuff both should run").
        if (!chainCfg) {
            log.info(`${ENM_LOG_PREFIX} autoStart: ${chainId} no longer in cfg — skipping`);
            continue;
        }
        if (chainCfg.enabled !== true && !pairedSet.has(chainId)) {
            log.info(`${ENM_LOG_PREFIX} autoStart: ${chainId} no longer enabled — skipping`);
            continue;
        }
        if (chainCfg.enabled !== true && pairedSet.has(chainId)) {
            log.info(
                `${ENM_LOG_PREFIX} autoStart: ${chainId} cfg.enabled=false but its `
                + 'parent / prerequisite chains are enabled — starting as a paired '
                + 'service',
            );
        }

        // Skip if already alive — reattach() during boot has already bound us
        // to the existing ela process; double-starting would race the lock.
        try {
            const st = proc.statusSync(chainId);
            if (st && st.alive) {
                log.info(`${ENM_LOG_PREFIX} autoStart: ${chainId} already alive (pid=${st.pid}) — skipping`);
                continue;
            }
        } catch (err) {
            log.warn(`${ENM_LOG_PREFIX} autoStart: ${chainId} statusSync failed (${err.message}) — attempting start anyway`);
        }

        // Try to start.
        const startedAtMs = Date.now();
        try {
            const adapter = registry.getAdapter(chainId);
            await adapter.start(chainCfg);
            const durationMs = Date.now() - startedAtMs;
            log.info(`${ENM_LOG_PREFIX} autoStart: ${chainId} started OK in ${durationMs}ms`);
            await safeAudit(db, log, {
                chainId,
                outcome: `Auto-started ${chainId} on ENM boot`,
                decision: 'executed',
                durationMs,
            });
        } catch (err) {
            const durationMs = Date.now() - startedAtMs;
            // Don't loop here — F1 self-heal will pick this up on its next tick.
            // We just record the failure so the Activity tab shows what happened.
            log.warn(`${ENM_LOG_PREFIX} autoStart: ${chainId} start failed (${err.message}) — F1 will retry`);
            await safeAudit(db, log, {
                chainId,
                outcome: `Auto-start failed: ${err.message}`,
                decision: 'failed',
                durationMs,
            });
        }
    }
}

/**
 * Append an AUTOMATED-SAFE audit row. Never throws — audit failure must not
 * crash boot. Skips silently if the db handle was unavailable upstream.
 */
async function safeAudit(db, log, args) {
    // v0.5.236 — boilerplate (null-guard + try/catch + debug-log) moved to
    // AuditLog.safeAppend; this wrapper keeps the autostart-specific entry
    // fields. Behavior unchanged.
    await AuditLog.safeAppend(db, log, {
        walletAddress: SYSTEM_WALLET,
        chainId: args.chainId,
        tier: TIER,
        ruleId: RULE_ID,
        decision: args.decision,
        executor: EXECUTOR,
        outcome: args.outcome,
        durationMs: args.durationMs,
        payload: { action: 'autostart' },
    });
}

module.exports = {
    runAutoStart,
    // exported for tests
    _internal: { startAllChains, RULE_ID, TIER },
};
