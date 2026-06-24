/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * HostConflictScanner — detect pre-existing Elastos node state that would
 * collide with ENM-managed runs.
 *
 * Why this matters:
 *   The operator may have used node.sh (the legacy bash installer) before, or
 *   have another `ela` process running, or have a systemd unit that fights us
 *   for control. If we just spawn on top of that, the chain crashes on port
 *   bind or two ela processes write to the same LevelDB and corrupt it.
 *
 *   This scanner runs:
 *     1. At setup-wizard time (new step BEFORE binary)  → guides operator
 *     2. On every POST /chains/:id/start                 → blocks CRITICALs
 *     3. As a slow-tick health check                     → surfaces drift
 *
 * Conflict catalog:
 *   LEGACY_CONFIG       WARNING  ~/.config/elastos exists (node.sh default)
 *   ROGUE_PROCESS       CRITICAL ela process running outside our control
 *   PORT_BOUND          CRITICAL one of the 6 ELA ports is occupied
 *   SYSTEMD_UNIT        WARNING  systemd unit named node|ela|elastos enabled
 *   STALE_DATA          INFO     prior chain data at known default paths
 *   PERMISSION_DENIED   CRITICAL ENM data dir owned by another uid (root, etc.)
 *   STALE_PID_FILE      WARNING  ENM PID file points at a dead process
 *
 * Each result is JSON-friendly so the frontend can render remediation cards.
 *
 * Pure functions where possible — the only side effects are filesystem reads,
 * `ps` parsing, and `lsof`/`ss` invocations. Testable via dependency injection
 * for `runCmd` (default: child_process.execFile).
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');

const { ELA_DEFAULT_PORTS, ENM_LOG_PREFIX } = require('./EnmConstants');
const { enmDataDir, runDir, pidFilePath } = require('./DataDir');
const { isPidAlive } = require('./processUtils');

const SEVERITY = Object.freeze({
    CRITICAL: 'CRITICAL',  // blocks chain start
    WARNING:  'WARNING',   // surfaces but doesn't block
    INFO:     'INFO',      // informational only
});

const TYPES = Object.freeze({
    LEGACY_CONFIG:     'LEGACY_CONFIG',
    ROGUE_PROCESS:     'ROGUE_PROCESS',
    PORT_BOUND:        'PORT_BOUND',
    SYSTEMD_UNIT:      'SYSTEMD_UNIT',
    STALE_DATA:        'STALE_DATA',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    STALE_PID_FILE:    'STALE_PID_FILE',
});

// Known legacy locations from node.sh (sister-repos/Node/build/skeleton/node.sh
// Rev 1 audit: lines 864/869/1208/1306).
const LEGACY_CONFIG_PATHS = [
    '~/.config/elastos',
    '/root/.config/elastos',
];
const LEGACY_DATA_PATHS = [
    '~/elastos',
    '~/.config/elastos/data',
    '/root/elastos',
];

const SYSTEMD_UNIT_NAMES = ['node', 'ela', 'elastos', 'elamain'];

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * @typedef {object} Conflict
 * @property {string} type      one of TYPES
 * @property {string} severity  one of SEVERITY
 * @property {string} description human-readable single-line summary
 * @property {string[]} remediation step-by-step fix
 * @property {object} [details] type-specific extra fields (pid, port, path...)
 */

/**
 * Run the full scan. All probes are best-effort — if a sub-probe fails (e.g.,
 * `ps` not on PATH on a stripped-down container), we log and continue rather
 * than fail the whole scan.
 *
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs] per-subcommand timeout
 * @param {(name: string, args: string[], opts?: object) => Promise<{stdout:string,stderr:string}>} [opts.runCmd]
 *   For tests — replace child_process invocation with a stub.
 * @param {{warn?: (msg:string)=>void, debug?: (msg:string)=>void}} [opts.logger]
 * @returns {Promise<Array<Conflict>>}
 */
async function scan(opts) {
    const o = opts || {};
    const log = o.logger || { warn() {}, debug() {} };
    const timeoutMs = Number.isInteger(o.timeoutMs) ? o.timeoutMs : DEFAULT_TIMEOUT_MS;
    const run = typeof o.runCmd === 'function' ? o.runCmd : defaultRun(timeoutMs);
    // beta.3.27 — opts.ourPids is the set of PIDs ENM itself owns
    // (typically the running ela child). scanPortBindings uses it to
    // skip ports held by us — the previous shape fired F19 on every
    // health tick because the port-conflict scanner didn't know its
    // own children. Optional; when missing the scanner behaves as
    // before.
    const ourPids = (o.ourPids instanceof Set) ? o.ourPids
        : new Set(Array.isArray(o.ourPids) ? o.ourPids.filter(Number.isInteger) : []);

    // beta.3.88 — Wave M1.4 — operator-supplied dynamic port list.
    // Pre-3.88 the scanner hardcoded ELA_DEFAULT_PORTS (6 mainchain
    // ports). For Council nodes we need to scan every chain's
    // configured ports — ESC's 20636/20638/etc., EID's 20646/20648,
    // etc. HealthChecker passes opts.chainPorts (computed from
    // ChainRegistry.listChains()) so the scanner stays decoupled
    // from ChainRegistry. When omitted, falls back to mainchain
    // defaults for backward compat (unit-test friendly).
    const chainPorts = Array.isArray(o.chainPorts) && o.chainPorts.length > 0
        ? o.chainPorts
        : [
            { port: ELA_DEFAULT_PORTS.rpc,      role: 'rpc',              chainId: 'mainchain' },
            { port: ELA_DEFAULT_PORTS.nodePort, role: 'p2p (NodePort)',   chainId: 'mainchain' },
            { port: ELA_DEFAULT_PORTS.httpInfo, role: 'HttpInfo',         chainId: 'mainchain' },
            { port: ELA_DEFAULT_PORTS.httpRest, role: 'HttpRest',         chainId: 'mainchain' },
            { port: ELA_DEFAULT_PORTS.httpWs,   role: 'HttpWs',           chainId: 'mainchain' },
            { port: ELA_DEFAULT_PORTS.dpos,     role: 'DPoS p2p',         chainId: 'mainchain' },
        ];

    /** @type {Array<Conflict>} */
    const conflicts = [];

    await Promise.all([
        scanLegacyConfig(conflicts, log),
        scanLegacyData(conflicts, log),
        scanRogueProcesses(conflicts, run, log),
        scanPortBindings(conflicts, run, log, ourPids, chainPorts),
        scanSystemdUnits(conflicts, run, log),
        scanPermissions(conflicts, log),
        scanStalePidFiles(conflicts, log),
    ]);

    // Sort: CRITICAL first, then WARNING, then INFO. Stable inside each tier.
    const order = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    conflicts.sort((a, b) => (order[a.severity] - order[b.severity]));
    return conflicts;
}

/**
 * Convenience: filter to only CRITICAL conflicts (chain start should refuse
 * if any CRITICALs remain unresolved).
 *
 * @param {Array<Conflict>} all
 * @returns {Array<Conflict>}
 */
function blockers(all) {
    return Array.isArray(all) ? all.filter((c) => c.severity === SEVERITY.CRITICAL) : [];
}

/**
 * Detection-deduplication.
 *
 * The HealthChecker's slow tick fires `scan()` every 5 minutes. Without
 * dedup, every tick that finds the same conflict (e.g., the same legacy
 * config dir at ~/.config/elastos) re-emits the same audit-log entry. The
 * operator's audit log filled with 100+ identical F19/F4 rows over 8
 * hours.
 *
 * shouldEmit(signature, ttlMs) returns true only if no detection with the
 * same signature has been seen within the TTL window. The signature
 * combines (type, key fields) so distinct conflicts (different ports,
 * different paths) emit independently — only TRUE duplicates suppress.
 *
 * Caller pattern (HealthChecker, post-scan):
 *   for (const c of scan()) {
 *     const sig = HostConflictScanner.signatureFor(c);
 *     if (HostConflictScanner.shouldEmit(sig, 60 * 60_000)) emitAudit(c);
 *   }
 */
const _seenDetections = new Map(); // signature -> lastEmittedAtMs
function signatureFor(conflict) {
    if (!conflict || typeof conflict !== 'object') return '';
    const d = conflict.details || {};
    return [
        conflict.type || '',
        d.port || '',
        d.role || '',
        d.path || '',
        d.unit || '',
        d.pid || '',
    ].join('|');
}
function shouldEmit(signature, ttlMs) {
    if (!signature) return true;
    const now = Date.now();
    const last = _seenDetections.get(signature);
    if (last && (now - last) < (ttlMs || 60 * 60_000)) return false;
    _seenDetections.set(signature, now);
    // Drop entries older than 2x TTL to bound memory.
    if (_seenDetections.size > 256) {
        for (const [k, t] of _seenDetections.entries()) {
            if ((now - t) > 2 * (ttlMs || 60 * 60_000)) _seenDetections.delete(k);
        }
    }
    return true;
}
function _clearDedupForTests() { _seenDetections.clear(); }

/**
 * Public: clear the dedup map for a specific chain, OR all chains.
 * Called from ChainRegistry on chain restart so the operator can see
 * "conflict resolved" signals after they've fixed the underlying issue
 * — without this, the 1-hour TTL silently swallows the recovery
 * notification.
 *
 * @param {string} [chainId]  if given, only clear signatures involving
 *                            that chain's ports; otherwise clear all
 */
function clearDedup(chainId) {
    if (!chainId) {
        _seenDetections.clear();
        return;
    }
    // Signatures don't directly include chainId (only port/role), so we
    // can't filter precisely. The conservative behaviour: clear all
    // entries on any chain restart. False positives = an extra audit
    // entry; false negatives = the bug we're fixing. Choose false +ves.
    _seenDetections.clear();
}

// ============================================================================
// Probes
// ============================================================================

/** @private */
async function scanLegacyConfig(out, log) {
    for (const raw of LEGACY_CONFIG_PATHS) {
        const p = expandHome(raw);
        try {
            const stat = await fsp.stat(p).catch(() => null);
            if (!stat || !stat.isDirectory()) continue;
            const entries = await fsp.readdir(p).catch(() => []);
            // Only flag if it looks like a real install (has config.json or
            // keystore.dat). Empty directories from package installs are noise.
            const looksReal = entries.some((e) => e === 'config.json' || e === 'keystore.dat' || e === 'ela.txt');
            if (!looksReal) continue;

            out.push({
                type: TYPES.LEGACY_CONFIG,
                severity: SEVERITY.WARNING,
                description: `Legacy node.sh config detected at ${p}`,
                remediation: [
                    'A previous Elastos installation lives here.',
                    'ENM uses its own data dir — these files are not read by ENM.',
                    'If the old node is still running:',
                    '  sudo systemctl stop node 2>/dev/null || true',
                    `  pkill -f 'ela' || true`,
                    'Then either move the legacy dir aside:',
                    `  mv ${p} ${p}.legacy-$(date +%Y%m%d)`,
                    'or import the existing keystore via the setup wizard.',
                ],
                details: { path: p, entries: entries.slice(0, 20) },
            });
        } catch (err) {
            log.debug(`${ENM_LOG_PREFIX} legacy-config probe failed for ${p}: ${err.message}`);
        }
    }
}

/** @private */
async function scanLegacyData(out, log) {
    for (const raw of LEGACY_DATA_PATHS) {
        const p = expandHome(raw);
        try {
            const stat = await fsp.stat(p).catch(() => null);
            if (!stat || !stat.isDirectory()) continue;
            const entries = await fsp.readdir(p).catch(() => []);
            // Real chain data has a `data` subdir or a leveldb-style file.
            const looksReal = entries.some(
                (e) => e === 'data' || e.startsWith('CURRENT') || e.endsWith('.ldb'),
            );
            if (!looksReal) continue;
            const lastModified = stat.mtimeMs;

            out.push({
                type: TYPES.STALE_DATA,
                severity: SEVERITY.INFO,
                description: `Existing chain data at ${p} (last modified ${new Date(lastModified).toISOString().slice(0, 10)})`,
                remediation: [
                    'ENM stores chain data under its own dataDir. The existing',
                    'data here is left untouched.',
                    'If you want ENM to reuse this data:',
                    '  Settings → Mainchain Advanced → set dataDir',
                    'Otherwise it can be archived later:',
                    `  mv ${p} ${p}.legacy-$(date +%Y%m%d)`,
                ],
                details: { path: p, lastModifiedMs: lastModified },
            });
        } catch (err) {
            log.debug(`${ENM_LOG_PREFIX} legacy-data probe failed for ${p}: ${err.message}`);
        }
    }
}

/** @private */
async function scanRogueProcesses(out, run, log) {
    if (os.platform() !== 'linux' && os.platform() !== 'darwin') {
        return; // ps/pgrep semantics differ; we ship Linux/Mac dev support only
    }
    try {
        // `pgrep -af` lists pid + full command-line. We match the ela binary
        // by its basename and exclude any pid we recognize as our own
        // managed instance.
        const { stdout } = await run('pgrep', ['-af', String.raw`(^|/)ela($|\s)`])
            .catch(() => ({ stdout: '' }));
        const lines = stdout.split('\n').map((s) => s.trim()).filter(Boolean);
        const ourPids = await readOurManagedPids();

        for (const line of lines) {
            const m = line.match(/^(\d+)\s+(.+)$/);
            if (!m) continue;
            const pid = parseInt(m[1], 10);
            const cmd = m[2];
            if (!Number.isInteger(pid) || pid <= 0) continue;
            if (pid === process.pid) continue;            // PC2 itself
            if (ourPids.has(pid)) continue;               // ENM-managed
            // Heuristic to skip false positives like "elastoshell" or "el-shell".
            // Match the binary basename "ela" with no other letters before/after.
            if (!/(^|\/)ela(\s|$)/.test(cmd)) continue;
            // Skip things like /usr/bin/elasticsearch — basename === ela only.
            const tokens = cmd.split(/\s+/);
            const bin = tokens[0] || '';
            const base = path.basename(bin);
            if (base !== 'ela') continue;

            out.push({
                type: TYPES.ROGUE_PROCESS,
                severity: SEVERITY.CRITICAL,
                description: `Another ela process is running (pid=${pid})`,
                remediation: [
                    'A non-ENM ela process will collide with the chain ENM tries to start.',
                    `  ps -fp ${pid}      # see what started it`,
                    'If it was started by node.sh / systemd:',
                    '  sudo systemctl stop node 2>/dev/null || true',
                    'If it was started manually:',
                    `  kill ${pid}`,
                    `  # if it doesn't exit:`,
                    `  kill -9 ${pid}`,
                    'Then click "Re-scan" in the wizard.',
                ],
                details: { pid, cmd },
            });
        }
    } catch (err) {
        log.debug(`${ENM_LOG_PREFIX} pgrep probe failed: ${err.message}`);
    }
}

/** @private */
async function scanPortBindings(out, run, log, ourPids, portsToCheck) {
    const platform = os.platform();
    if (platform !== 'linux' && platform !== 'darwin') {
        return;
    }
    // beta.3.88 — Wave M1.4 — portsToCheck supplied by scan() caller
    // (defaults to mainchain ports when omitted). Each entry includes
    // an optional chainId so the conflict message attributes the
    // collision to a specific chain (e.g. "ESC port 20636 conflict"
    // not just "port 20636 conflict").
    if (!Array.isArray(portsToCheck) || portsToCheck.length === 0) {
        return;
    }

    for (const entry of portsToCheck) {
        const { port, role } = entry;
        const chainId = entry.chainId || 'mainchain';
        try {
            const inUse = await checkPortInUse(port, run);
            if (!inUse.bound) continue;

            // Benign holders we ignore:
            //   - docker-proxy: when our own docker-compose maps the port via
            //     `ports: - "20336:20336"`, dockerd starts a docker-proxy
            //     process that holds the host-side port and forwards into the
            //     container's network namespace. Inside the container, ela can
            //     still bind the same port (different namespace). Flagging
            //     this as CRITICAL produced the F19 spam the operator hit.
            //   - beta.3.27: our own managed ela child PID. The previous
            //     comment said "handled elsewhere" but that wasn't true —
            //     port-binding scan didn't actually skip our PID, so F19
            //     fired CRITICAL every health tick while ela ran normally.
            //     ourPids is passed in by HealthChecker (the managed PID
            //     from ProcessService.statusSync) plus the setup-time
            //     caller passes an empty set so a stale ela that ENM
            //     doesn't own still trips the conflict.
            //
            // The holder string from ss/lsof contains the process name + PID
            // and is sometimes multiline (long ss output, line-wrapped). The
            // previous regex `/docker-proxy/i.test(inUse.holder)` failed when
            // the "docker-proxy" token was on a different line than expected.
            // Split on newlines and check each line — accept docker-proxy OR
            // docker-compose (newer compose v2 sometimes shows the latter).
            if (inUse.holder) {
                const lines = String(inUse.holder).split(/\r?\n/);
                const benign = lines.some(line => /docker-proxy|docker-compose/i.test(line));
                if (benign) {
                    log.debug(
                        `${ENM_LOG_PREFIX} port ${port} held by docker-proxy — `
                        + `benign (compose port mapping forwarding into container).`,
                    );
                    continue;
                }
                // Skip if any holder PID is one we manage. `ss -tlnp`
                // emits `users:(("ela",pid=12345,fd=N))` and lsof
                // emits the PID in column 2. Parse both forms.
                if (ourPids && ourPids.size > 0) {
                    const holderPids = parseHolderPids(inUse.holder);
                    const ours = holderPids.find((pid) => ourPids.has(pid));
                    if (ours) {
                        log.debug(
                            `${ENM_LOG_PREFIX} port ${port} held by our own `
                            + `managed pid=${ours} — not a conflict.`,
                        );
                        continue;
                    }
                }
            }

            // beta.3.88 — Wave M1.4 — surface chainId in the conflict
            // message so multi-chain operators can tell which chain's
            // port is colliding.
            const chainLabel = chainId === 'mainchain'
                ? 'Mainchain'
                : (chainId || 'unknown chain');
            out.push({
                type: TYPES.PORT_BOUND,
                severity: SEVERITY.CRITICAL,
                description: `${chainLabel} port ${port} (${role}) is already in use`,
                remediation: [
                    'A different process is bound to this port.',
                    platform === 'linux'
                        ? `  sudo ss -tlnp | grep :${port}`
                        : `  sudo lsof -i :${port}`,
                    'Either stop that process, or change the port:',
                    `  Settings → ${chainLabel} → Advanced → Ports`,
                ],
                details: { port, role, chainId, holder: inUse.holder },
            });
        } catch (err) {
            log.debug(`${ENM_LOG_PREFIX} port-${port} probe failed: ${err.message}`);
        }
    }
}

/** @private */
/**
 * beta.3.27 — pull PIDs out of an `ss -tlnp` or `lsof -i` holder
 * string. Both tools expose the PID in distinct shapes:
 *
 *   ss output examples:
 *     users:(("ela",pid=12345,fd=18))
 *     users:(("docker-proxy",pid=678,fd=4))
 *
 *   lsof output example (after the column header is dropped upstream):
 *     ela     12345 root   18u  IPv4  ... TCP *:20336 (LISTEN)
 *
 * Returns an array of integer PIDs in the order they were found.
 * Empty array on unparseable input.
 */
function parseHolderPids(holder) {
    if (typeof holder !== 'string' || holder.length === 0) { return []; }
    var pids = [];
    // ss form: pid=NNNN
    var ssRe = /pid=(\d+)/g;
    var m;
    while ((m = ssRe.exec(holder)) !== null) {
        var n = parseInt(m[1], 10);
        if (Number.isInteger(n)) { pids.push(n); }
    }
    if (pids.length > 0) { return pids; }
    // lsof form: command name + whitespace + PID on each line. Look
    // for tokens that are pure digits, taking the FIRST one per line
    // since lsof's PID column comes right after the command name.
    var lines = holder.split(/\r?\n/);
    for (var i = 0; i < lines.length; i += 1) {
        var tokens = lines[i].trim().split(/\s+/);
        for (var j = 1; j < tokens.length; j += 1) {
            if (/^\d+$/.test(tokens[j])) {
                pids.push(parseInt(tokens[j], 10));
                break; // first numeric token per line is the PID
            }
        }
    }
    return pids;
}

async function checkPortInUse(port, run) {
    // Prefer ss (Linux) — lighter than lsof. Fall back to lsof on macOS or
    // when ss isn't available.
    if (os.platform() === 'linux') {
        // beta.3.32 — add `-p` so ss emits the `users:(("ela",pid=N,fd=N))`
        // block. Without it, the holder string is just the bare socket
        // tuple (LISTEN 0 4096 0.0.0.0:20336 0.0.0.0:*) and parseHolderPids
        // returns []. That meant the "skip our own managed pid" exemption
        // at lines 398-407 silently never matched, F19 fired CRITICAL on
        // every 5-min health tick while ela was running normally. `-p`
        // requires root to expose other processes' PIDs; ENM runs as
        // root, so this works. On hosts where root privileges are absent
        // ss just shows '-' in the pid column, parseHolderPids harmlessly
        // returns [] (same behavior as today) and the conflict is
        // surfaced — that's the conservative path.
        const { stdout } = await run('ss', ['-tlnHp', `sport = :${port}`])
            .catch(() => ({ stdout: '' }));
        if (stdout && stdout.trim().length > 0) {
            return { bound: true, holder: stdout.trim().split('\n')[0] };
        }
        return { bound: false };
    }
    // macOS / fallback
    const { stdout } = await run('lsof', ['-iTCP', `-i:${port}`, '-sTCP:LISTEN', '-P', '-n'])
        .catch(() => ({ stdout: '' }));
    if (stdout && stdout.split('\n').length > 1) {
        return { bound: true, holder: stdout.trim().split('\n').slice(1).join('\n') };
    }
    return { bound: false };
}

/** @private */
async function scanSystemdUnits(out, run, log) {
    if (os.platform() !== 'linux') return;
    for (const name of SYSTEMD_UNIT_NAMES) {
        try {
            // is-enabled returns 0 if enabled, non-zero otherwise. We capture
            // the exit status via the rejected promise's `code`.
            const { stdout, ok } = await run('systemctl', ['is-enabled', `${name}.service`])
                .then((r) => ({ stdout: (r.stdout || '').trim(), ok: true }))
                .catch((err) => ({ stdout: (err.stdout || '').trim(), ok: false }));
            // Only flag if the unit actually exists. systemctl prints
            // "enabled" / "disabled" / "static" / etc. when it does.
            const known = ['enabled', 'static', 'alias', 'masked', 'disabled', 'indirect'];
            if (!known.includes(stdout)) continue;
            // We only flag enabled or static units (auto-start at boot).
            if (stdout !== 'enabled' && stdout !== 'static') continue;

            out.push({
                type: TYPES.SYSTEMD_UNIT,
                severity: SEVERITY.WARNING,
                description: `systemd unit ${name}.service is ${stdout}`,
                remediation: [
                    'A systemd unit may auto-start ela on boot, fighting ENM for control.',
                    `  sudo systemctl disable --now ${name}`,
                    'Then re-scan in the wizard.',
                ],
                details: { unit: name, state: stdout, ok },
            });
        } catch (err) {
            log.debug(`${ENM_LOG_PREFIX} systemd ${name} probe failed: ${err.message}`);
        }
    }
}

/** @private */
async function scanPermissions(out, log) {
    try {
        const dir = enmDataDir();
        await fsp.mkdir(dir, { recursive: true, mode: 0o700 }).catch(() => {});
        const stat = await fsp.stat(dir).catch(() => null);
        if (!stat) return;

        const ourUid = process.getuid && process.getuid();
        // If our process can't write, the dir is unusable regardless of stat.
        try {
            await fsp.access(dir, fs.constants.W_OK | fs.constants.X_OK);
        } catch {
            out.push({
                type: TYPES.PERMISSION_DENIED,
                severity: SEVERITY.CRITICAL,
                description: `ENM data dir ${dir} is not writable by our user`,
                remediation: [
                    `Fix ownership so PC2 can write here:`,
                    `  sudo chown -R $(id -u):$(id -g) ${dir}`,
                    `Or move the directory aside and let ENM recreate it:`,
                    `  mv ${dir} ${dir}.bad && mkdir -p ${dir}`,
                ],
                details: { path: dir, owner: stat.uid, ourUid: ourUid != null ? ourUid : null },
            });
        }
    } catch (err) {
        log.debug(`${ENM_LOG_PREFIX} permission probe failed: ${err.message}`);
    }
}

/** @private */
async function scanStalePidFiles(out, log) {
    try {
        const dir = runDir();
        const files = await fsp.readdir(dir).catch(() => []);
        for (const fname of files) {
            if (!fname.startsWith('ela-') || !fname.endsWith('.pid')) continue;
            const full = path.join(dir, fname);
            let pid;
            try {
                pid = parseInt((await fsp.readFile(full, 'utf8')).trim(), 10);
            } catch {
                continue;
            }
            if (!Number.isInteger(pid) || pid <= 0) {
                out.push({
                    type: TYPES.STALE_PID_FILE,
                    severity: SEVERITY.WARNING,
                    description: `Malformed PID file at ${full}`,
                    remediation: [`  rm ${full}`],
                    details: { path: full },
                });
                continue;
            }
            if (!isPidAlive(pid)) {
                out.push({
                    type: TYPES.STALE_PID_FILE,
                    severity: SEVERITY.WARNING,
                    description: `Stale PID file at ${full} (pid=${pid} no longer running)`,
                    remediation: [
                        'A previous chain crashed without cleaning up.',
                        'ENM normally cleans this on next start; if it persists:',
                        `  rm ${full}`,
                    ],
                    details: { path: full, pid },
                });
            }
        }
    } catch (err) {
        log.debug(`${ENM_LOG_PREFIX} stale-pid probe failed: ${err.message}`);
    }
}

// ============================================================================
// Helpers
// ============================================================================

function expandHome(p) {
    if (!p) return p;
    if (p.startsWith('~/')) {
        return path.join(os.homedir(), p.slice(2));
    }
    return p;
}

/**
 * @returns {Promise<Set<number>>} PIDs of ENM-managed ela processes (so we
 * exclude them from the rogue-process scan).
 */
async function readOurManagedPids() {
    const pids = new Set();
    try {
        const dir = runDir();
        const files = await fsp.readdir(dir).catch(() => []);
        for (const fname of files) {
            if (!fname.startsWith('ela-') || !fname.endsWith('.pid')) continue;
            try {
                const raw = await fsp.readFile(path.join(dir, fname), 'utf8');
                const n = parseInt(raw.trim(), 10);
                if (Number.isInteger(n) && n > 0) pids.add(n);
            } catch { /* skip */ }
        }
    } catch { /* skip */ }
    return pids;
}

/**
 * Default subcommand runner. Times out, captures stdout/stderr, and rejects
 * non-zero exits with `code` + `stdout` attached so callers can branch.
 *
 * @param {number} timeoutMs
 */
function defaultRun(timeoutMs) {
    return function runCmd(name, args, opts) {
        return new Promise((resolve, reject) => {
            execFile(name, args, {
                timeout: timeoutMs,
                maxBuffer: 256 * 1024,
                ...(opts || {}),
            }, (err, stdout, stderr) => {
                if (err) {
                    err.stdout = stdout;
                    err.stderr = stderr;
                    return reject(err);
                }
                resolve({ stdout: stdout || '', stderr: stderr || '' });
            });
        });
    };
}

module.exports = {
    SEVERITY,
    TYPES,
    LEGACY_CONFIG_PATHS,
    LEGACY_DATA_PATHS,
    SYSTEMD_UNIT_NAMES,
    scan,
    blockers,
    signatureFor,
    shouldEmit,
    clearDedup,
    _clearDedupForTests,
    // exposed for tests
    _internals: {
        scanLegacyConfig,
        scanLegacyData,
        scanRogueProcesses,
        scanPortBindings,
        scanSystemdUnits,
        scanPermissions,
        scanStalePidFiles,
        expandHome,
        readOurManagedPids,
    },
};
