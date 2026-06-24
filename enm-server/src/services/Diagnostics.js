/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * Diagnostics — "tell me exactly why my node isn't working" report.
 *
 * The healing engine fires when a known failure mode trips. This module is
 * the operator-facing companion: it walks every relevant subsystem in order,
 * stopping at the first definitive blocker, and produces a structured report
 * the dashboard renders as a step-by-step list. Each finding carries:
 *   - status: 'ok' | 'warn' | 'fail' | 'skip' | 'unknown'
 *   - title  one-line summary
 *   - detail explanation of what was probed and what we found
 *   - fixes  ordered list of step-by-step shell commands or UI paths
 *   - autoFix one of the AUTO_FIX_ACTIONS keys when a safe remediation
 *            exists, or null
 *
 * The route at /chains/:id/diagnose returns the array. The UI renders each
 * step with its status badge; "Auto-fix" buttons surface only when autoFix
 * is non-null and call POST /chains/:id/auto-fix?action=<key>.
 *
 * Doesn't run anything destructive itself — pure read + report.
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const { ENM_LOG_PREFIX, ELA_DEFAULT_PORTS } = require('./EnmConstants');
const { chainDir, pidFilePath } = require('./DataDir');
const HostConflictScanner = require('./HostConflictScanner');
const { isPidAlive } = require('./processUtils');
const EnmBinaryLocator = require('./EnmBinaryLocator');
const { validate } = require('./EnmConfigSchema');

/**
 * Auto-fix action keys. The route's auto-fix handler whitelists these.
 * Any action not in this set is rejected — guards against arbitrary command
 * injection via the query string.
 */
const AUTO_FIX_ACTIONS = Object.freeze({
    REMOVE_STALE_PID:    'remove-stale-pid',
    RESTART_CHAIN:       'restart-chain',
    CONFIG_ROLLBACK:     'config-rollback',
    CLEAR_LEVELDB_LOCK:  'clear-leveldb-lock',
    // beta.3.59 — operator-triggered chain rollback for the
    // arbitrator-mismatch failure mode (sponsor-not-in-arbitrators
    // validation rejection from a SIGKILLed-ela inconsistency).
    // Invokes ela-cli rollback --height N --datadir <chainDir>/elastos.
    // Requires the chain to be stopped first; backs up the live
    // default.dcp before mutating any chain data. Keystore.dat is
    // OUTSIDE the data path so the producer identity is untouched.
    CHAIN_ROLLBACK:      'chain-rollback',
});

const STATUS = Object.freeze({
    OK:      'ok',
    WARN:    'warn',
    FAIL:    'fail',
    SKIP:    'skip',
    UNKNOWN: 'unknown',
});

/**
 * @typedef {object} Finding
 * @property {string} id
 * @property {string} status one of STATUS
 * @property {string} title
 * @property {string} detail
 * @property {string[]} [fixes]
 * @property {string|null} [autoFix] AUTO_FIX_ACTIONS key
 * @property {object} [data]
 */

/**
 * Run the full diagnostic walk.
 *
 * @param {object} deps
 * @param {string} deps.chainId
 * @param {object} deps.chainConfig may be null if not configured yet
 * @param {object} deps.processService
 * @param {object} deps.adapter
 * @param {object} [deps.syncTracker]
 * @param {object} [deps.logger]
 * @returns {Promise<{ findings: Finding[], summary: { ok: number, warn: number, fail: number } }>}
 */
async function runFullDiagnose(deps) {
    const { chainId, chainConfig, processService, adapter, syncTracker } = deps;
    const log = deps.logger || { warn() {}, debug() {} };

    /** @type {Finding[]} */
    const findings = [];

    // 1. Configuration present
    if (!chainConfig) {
        findings.push({
            id: 'config-missing',
            status: STATUS.FAIL,
            title: 'No configuration for this chain',
            detail: 'The setup wizard has not produced a chains.<id> entry in the config.',
            fixes: ['Open the setup wizard and complete every step.'],
            autoFix: null,
        });
        return summarize(findings);
    }
    findings.push({
        id: 'config-present',
        status: STATUS.OK,
        title: 'Configuration present',
        detail: 'chains.' + chainId + ' is configured.',
    });

    // 2. Config schema validates
    try {
        validate({
            version: 1,
            chains: { [chainId]: chainConfig },
            global: {},
            setup: { completed: true, completedStep: 'complete' },
        });
        findings.push({
            id: 'config-valid',
            status: STATUS.OK,
            title: 'Configuration passes schema validation',
            detail: 'All required fields present and within range.',
        });
    } catch (err) {
        findings.push({
            id: 'config-invalid',
            status: STATUS.FAIL,
            title: 'Configuration fails schema validation (F9)',
            detail: err.message.split('\n').slice(0, 4).join('\n'),
            fixes: [
                'Roll back to the previous valid config:',
                'Settings → Mainchain Advanced → Rollback',
                'Or POST /api/config/rollback',
            ],
            autoFix: AUTO_FIX_ACTIONS.CONFIG_ROLLBACK,
        });
    }

    // 3. Binary path validates + smoke-tests
    const bin = chainConfig.binaryPath;
    const pathOk = bin ? EnmBinaryLocator.validatePath(bin) : { ok: false, reason: 'binaryPath not set' };
    if (!pathOk.ok) {
        findings.push({
            id: 'binary-path',
            status: STATUS.FAIL,
            title: chainId + ' binary path invalid',
            detail: pathOk.reason || 'Path is missing or not executable.',
            fixes: [
                // v0.5.168 (Phase 5, C22) — chain-generic. Pre-0.5.168 this
                // hard-coded "Build ela from source" + "Mainchain Advanced",
                // wrong for esc/eid/pg/arbiter/oracle binary-path failures.
                'Re-run the setup wizard to (re)install the binary for this chain,',
                'or set an existing binary path under Settings then Advanced for this chain',
            ],
            autoFix: null,
        });
    } else {
        findings.push({
            id: 'binary-path',
            status: STATUS.OK,
            title: chainId + ' binary present and executable',
            detail: bin + ' (' + (pathOk.sizeBytes || 0) + ' bytes)',
        });
        // Smoke test (cheap — runs `ela --version`)
        try {
            const smoke = await EnmBinaryLocator.smokeTest(bin, { timeoutMs: 4_000 });
            if (smoke.ok) {
                findings.push({
                    id: 'binary-smoke',
                    status: STATUS.OK,
                    title: chainId + ' --version reports ' + smoke.version,
                    detail: 'Binary runs and prints a recognizable version.',
                });
                if (chainConfig.binaryVersion && smoke.version !== chainConfig.binaryVersion) {
                    findings.push({
                        id: 'binary-version-drift',
                        status: STATUS.WARN,
                        title: 'Binary version drift (F8)',
                        detail: 'Recorded ' + chainConfig.binaryVersion + ' but ' + chainId + ' now reports ' + smoke.version + '.',
                        fixes: [
                            'If you intentionally rebuilt, accept the new version:',
                            '  Settings → Mainchain Advanced → Save',
                            'If unintentional, the binary may have been replaced.',
                        ],
                    });
                }
            } else {
                findings.push({
                    id: 'binary-smoke',
                    status: STATUS.FAIL,
                    title: chainId + ' --version did not return cleanly',
                    detail: smoke.reason || 'unknown failure',
                    fixes: [
                        'Re-run the build:',
                        '  cd ~/Elastos.ELA && make all',
                        'Make sure the file is mode 0755:',
                        '  chmod +x ' + bin,
                    ],
                });
            }
        } catch (_) {
            // 0.5.112 audit Session 112 — replaced err.message with a
            // static fallback. After Session 110 the EnmBinaryLocator
            // smokeTest doesn't throw for the common spawn failures
            // (those return structured non-ok results), so reaching
            // this catch means something unexpected — and unexpected
            // err.message strings shouldn't leak into the operator-
            // facing detail field. The server-side log.debug below
            // retains the diagnostic for maintainers.
            findings.push({
                id: 'binary-smoke',
                status: STATUS.UNKNOWN,
                title: 'Could not smoke-test the binary',
                detail: 'An unexpected error blocked the version check. The binary may be present but unreadable, or the host may be under heavy load — try diagnosing again in a minute.',
            });
        }
    }

    // 4. Host conflict scan (rogue process, port bound, permission denied,
    // legacy /.config/elastos, systemd unit). This is the same scanner used
    // by the start route — we surface it here as part of the report so the
    // operator sees the full picture without a separate panel.
    //
    // beta.3.50 — forward ourPids so the scanner skips ports that our own
    // managed ela is correctly holding. Without this, every diagnose run
    // against a *running* chain returned 6 fake CRITICAL port_bound
    // findings (rpc 20336, p2p 20338, info 20333, rest 20334, ws 20335,
    // dpos 20339) — because HostConflictScanner's own-pid exemption (see
    // beta.3.27 + beta.3.32 in HostConflictScanner.js) was unreachable
    // from this code path. HealthChecker.js:455-468 already does this
    // for the periodic scan; runFullDiagnose was the missing twin.
    const ourPids = new Set();
    try {
        const st = processService.statusSync(chainId);
        if (st && Number.isInteger(st.pid) && st.pid > 0 && st.alive) {
            ourPids.add(st.pid);
        }
    } catch (_) { /* empty set is the safe fallback */ }
    try {
        const conflicts = await HostConflictScanner.scan({ logger: log, ourPids });
        for (const c of conflicts) {
            findings.push({
                id: 'host-conflict-' + c.type.toLowerCase(),
                status: c.severity === 'CRITICAL' ? STATUS.FAIL
                      : c.severity === 'WARNING'  ? STATUS.WARN
                      : STATUS.OK,
                title: c.description,
                detail: (c.remediation || []).slice(0, 2).join(' '),
                fixes: c.remediation,
                data: c.details,
            });
        }
    } catch (_) {
        // 0.5.112 audit Session 112 — static fallback. HostConflictScanner
        // throwing is unexpected (its own probes catch their own errors)
        // — reaching this branch means infrastructure failure (fs probe
        // refusal, sub-shell unavailable) rather than an operator-
        // actionable condition. err.message would be Node-internal
        // wording with no recovery hint.
        findings.push({
            id: 'host-conflict-scan',
            status: STATUS.UNKNOWN,
            title: 'Host conflict scan failed',
            detail: 'An unexpected error blocked the host probe. The chain may still be runnable; try diagnosing again or restart enm-server to clear transient state.',
        });
    }

    // 5. Process state
    const status = processService.statusSync(chainId);
    if (!status.alive) {
        findings.push({
            id: 'process-state',
            status: STATUS.FAIL,
            title: 'Chain process is not running',
            detail: chainConfig.enabled
                ? 'enabled=true but no live PID. F1 should auto-restart.'
                : 'enabled=false — operator stopped this chain.',
            fixes: [
                'Click Start in the dashboard.',
                'If start refuses with host conflicts, resolve them first.',
                'Check the audit tab to see why the last run exited.',
            ],
            autoFix: chainConfig.enabled ? AUTO_FIX_ACTIONS.RESTART_CHAIN : null,
        });
    } else {
        findings.push({
            id: 'process-state',
            status: STATUS.OK,
            title: 'Chain process is alive',
            detail: 'pid=' + status.pid + (status.attached ? ' (managed)' : ' (reattached)'),
        });
    }

    // 6. Stale PID file
    try {
        const pidPath = pidFilePath(chainId);
        if (fs.existsSync(pidPath)) {
            const raw = await fsp.readFile(pidPath, 'utf8');
            const pid = parseInt(raw.trim(), 10);
            if (!Number.isInteger(pid) || pid <= 0) {
                findings.push({
                    id: 'stale-pid',
                    status: STATUS.WARN,
                    title: 'Malformed PID file',
                    detail: 'PID file exists at ' + pidPath + ' but contents are unreadable.',
                    fixes: ['rm ' + pidPath, 'Then click Start.'],
                    autoFix: AUTO_FIX_ACTIONS.REMOVE_STALE_PID,
                });
            } else if (!isPidAlive(pid)) {
                findings.push({
                    id: 'stale-pid',
                    status: STATUS.WARN,
                    title: 'Stale PID file (process gone)',
                    detail: 'PID ' + pid + ' is no longer alive but the file remains.',
                    fixes: ['rm ' + pidPath, 'Or click Auto-fix.'],
                    autoFix: AUTO_FIX_ACTIONS.REMOVE_STALE_PID,
                });
            }
        }
    } catch (err) {
        log.debug(`${ENM_LOG_PREFIX} stale-pid probe: ${err.message}`);
    }

    // 7. LevelDB LOCK file (chain crashed mid-write — common cause of "won't start")
    try {
        const lockPath = path.join(chainDir(chainId), 'elastos', 'data', 'chain', 'LOCK');
        if (fs.existsSync(lockPath) && !status.alive) {
            const lockStat = await fsp.stat(lockPath);
            findings.push({
                id: 'leveldb-lock',
                status: STATUS.WARN,
                title: 'Stale LevelDB LOCK file detected',
                detail: 'File at ' + lockPath + ' exists with no live owner. ' + chainId + ' will refuse to start.',
                fixes: [
                    'rm ' + lockPath,
                    'Then click Start.',
                ],
                autoFix: AUTO_FIX_ACTIONS.CLEAR_LEVELDB_LOCK,
                data: { path: lockPath, mtimeMs: lockStat.mtimeMs },
            });
        }
    } catch (err) {
        log.debug(`${ENM_LOG_PREFIX} leveldb-lock probe: ${err.message}`);
    }

    // 8. RPC reachability + sync state
    // P0-14 (v0.5.178) — class-aware. Only Class A (ela) speaks the Bitcoin-style
    // getblockcount/getconnectioncount this probe uses; EVM (B) speaks eth_*,
    // arbiter (D) only getspvheight, oracles (C) have no RPC. Running these verbs
    // on B/C/D threw → false "RPC unreachable (F2)" with a RESTART_CHAIN autofix →
    // restart-looped healthy non-mainchain chains (the C19 bug, in the diagnose
    // path). For non-A, liveness IS process-alive (node.sh pgrep model); surface
    // the class-correct primaryHeight() metric with no destructive autofix.
    if (status.alive && adapter.chainClass !== 'A') {
        let metric = '';
        try {
            const ph = await adapter.primaryHeight(chainConfig);
            if (ph && typeof ph.height === 'number') {
                metric = ' — height ' + ph.height
                    + (typeof ph.peers === 'number' ? ', ' + ph.peers + ' peers' : '');
            }
        } catch (_) { /* metric is best-effort; its absence is not a failure */ }
        findings.push({
            id: 'rpc-reachable',
            status: STATUS.OK,
            title: 'Process running (class ' + adapter.chainClass + ')' + metric,
            detail: 'Liveness is process-alive, matching node.sh. This chain class '
                + 'does not expose the ELA-style RPC this probe checks.',
        });
    } else if (status.alive) {
        try {
            const rpc = adapter.rpcClient(chainConfig);
            const t0 = Date.now();
            const height = await rpc.getblockcount();
            const peers = await rpc.getconnectioncount().catch(() => null);
            const dt = Date.now() - t0;
            findings.push({
                id: 'rpc-reachable',
                status: STATUS.OK,
                title: 'RPC reachable',
                detail: 'getblockcount=' + height + (peers != null ? ', peers=' + peers : '') + ' (' + dt + 'ms)',
            });

            // Peer count assessment
            if (peers === 0) {
                findings.push({
                    id: 'peer-count',
                    status: STATUS.FAIL,
                    title: 'Peer count is zero (F3 / F16)',
                    detail: chainId + ' cannot reach any peer. The DNS seeds may be down or our network egress is blocked.',
                    fixes: [
                        'Check outbound TCP from this host:',
                        '  curl -v https://api.elastos.io/ela',
                        'If blocked, fix firewall/NAT.',
                        'Otherwise restart the chain to reseed peers.',
                    ],
                    autoFix: AUTO_FIX_ACTIONS.RESTART_CHAIN,
                });
            } else if (peers != null && peers < 3) {
                findings.push({
                    id: 'peer-count',
                    status: STATUS.WARN,
                    title: 'Few peers (' + peers + ')',
                    detail: 'Healthy nodes typically maintain 8+ peers.',
                    fixes: ['Wait — peer set grows over the first few minutes.'],
                });
            } else if (peers != null) {
                findings.push({
                    id: 'peer-count',
                    status: STATUS.OK,
                    title: peers + ' peers connected',
                    detail: 'Within the healthy range.',
                });
            }

            // Sync progress
            if (syncTracker) {
                const snap = syncTracker.syncSnapshot(chainId);
                if (snap.networkHeight != null && snap.blocksBehind != null && snap.blocksBehind > 0) {
                    const eta = snap.etaSec ? Math.ceil(snap.etaSec / 60) + ' min' : 'unknown';
                    findings.push({
                        id: 'sync-progress',
                        status: snap.blocksBehind > 1000 ? STATUS.WARN : STATUS.OK,
                        title: 'Syncing — ' + snap.blocksBehind + ' blocks behind',
                        detail: 'Velocity ' + (snap.velocityBpm ? snap.velocityBpm.toFixed(1) : '?') +
                                ' bpm. ETA ' + eta + '.',
                    });
                } else if (snap.networkHeight != null) {
                    findings.push({
                        id: 'sync-progress',
                        status: STATUS.OK,
                        title: 'Fully synced at height ' + snap.localHeight,
                        detail: 'Local height matches network.',
                    });
                }
            }
        } catch (err) {
            // F2 — RPC unreachable
            findings.push({
                id: 'rpc-reachable',
                status: STATUS.FAIL,
                title: 'RPC unreachable (F2)',
                detail: err.message + '. Process is alive but JSON-RPC won\'t respond.',
                fixes: [
                    'Common causes:',
                    '  1. Chain still booting — wait 30 seconds and re-diagnose.',
                    '  2. RPC password mismatch — Settings → Mainchain Advanced → re-set.',
                    '  3. WhiteIPList wrong — check the rpc.whiteIPList in config.',
                    '  4. Port collision or proxy in front of 20336.',
                    'If still failing after 2 minutes, restart the chain.',
                ],
                autoFix: AUTO_FIX_ACTIONS.RESTART_CHAIN,
            });
        }
    } else {
        findings.push({
            id: 'rpc-reachable',
            status: STATUS.SKIP,
            title: 'RPC check skipped (process not running)',
            detail: 'Start the chain first.',
        });
    }

    // 9. Disk space check
    try {
        const dir = chainDir(chainId);
        const stat = await fsp.statfs(dir).catch(() => null);
        if (stat) {
            const freeGb = (stat.bavail * stat.bsize) / (1024 ** 3);
            if (freeGb < 5) {
                findings.push({
                    id: 'disk-space',
                    status: STATUS.FAIL,
                    title: 'Disk space critical (F5): ' + freeGb.toFixed(1) + ' GB free',
                    detail: chainId + ' halts on disk-full. You have minutes to act.',
                    fixes: [
                        'Free space immediately:',
                        '  sudo apt-get autoremove --purge',
                        '  sudo journalctl --vacuum-size=1G',
                        '  Compact ENM logs: Settings → Mainchain Advanced → Compact logs',
                        'Long-term: move dataDir to a larger volume.',
                    ],
                });
            } else if (freeGb < 20) {
                findings.push({
                    id: 'disk-space',
                    status: STATUS.WARN,
                    title: 'Disk space low: ' + freeGb.toFixed(1) + ' GB free',
                    // v0.5.168 (Phase 5, C22) — chain-generic (was ELA-specific
                    // "ELA grows ~5 GB/month" + "Mainchain Advanced").
                    detail: 'Chain data grows over time. Plan a prune or volume migration.',
                    fixes: ['Compact logs under Settings then Advanced for this chain'],
                });
            } else {
                findings.push({
                    id: 'disk-space',
                    status: STATUS.OK,
                    title: 'Disk space ok: ' + freeGb.toFixed(1) + ' GB free',
                    detail: 'Above the 20 GB warn threshold.',
                });
            }
        }
    } catch (err) {
        log.debug(`${ENM_LOG_PREFIX} disk probe: ${err.message}`);
    }

    return summarize(findings);
}

function summarize(findings) {
    // beta.3.61 — dedupe findings by (id, data.path). HostConflictScanner
    // emits one finding per detected source of conflict, but for the same
    // root cause it can report duplicates (e.g., legacy_config returned
    // twice when /root/.config/elastos is detected by two probes). The
    // operator saw the same "Legacy node.sh config detected" warning
    // listed twice in the diagnose panel for weeks.
    const seen = new Set();
    const deduped = [];
    for (const f of findings) {
        const dataPath = f.data && f.data.path ? f.data.path : '';
        const key = (f.id || '') + '|' + dataPath;
        if (seen.has(key)) { continue; }
        seen.add(key);
        deduped.push(f);
    }
    const summary = { ok: 0, warn: 0, fail: 0, skip: 0, unknown: 0 };
    for (const f of deduped) {
        summary[f.status] = (summary[f.status] || 0) + 1;
    }
    return { findings: deduped, summary };
}

module.exports = {
    runFullDiagnose,
    AUTO_FIX_ACTIONS,
    STATUS,
};
