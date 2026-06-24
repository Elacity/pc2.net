/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * NativeProcessService — spawn, monitor, stop, and reattach to ela processes.
 *
 * Replaces the entire Docker stack from earlier plan revisions. Per Rev 9:
 * Ubuntu-only, native binary built by the operator, no Docker.
 *
 * Design (per Rev 6 audits):
 *   - `child_process.spawn(binaryPath, [], { cwd, detached:true })` so the
 *     ela process outlives PC2 if PC2 itself crashes (good for BPoS uptime).
 *   - `child.unref()` so PC2 can shut down cleanly without waiting for ela.
 *   - PID + metadata sidecar files at ${runDir}/ela-<chainId>.{pid,meta.json}
 *   - Stop: SIGTERM → wait 60s → SIGKILL (Rev 6: ela's leveldb close + peer
 *     disconnect is 2-8s typical, 60s gives ample slack).
 *   - Reattach on PC2 boot: read PID file, kill(pid, 0) liveness check. If
 *     alive, register the chain as "running" but logs come from on-disk
 *     files (we lost stdio after parent restart).
 *   - Exit code aware: F1 only fires on non-zero exit OR SIGTERM+enabled.
 *   - withChainLock around every mutation — no double-starts (Rev 6 finding).
 *
 * What this DOES NOT do:
 *   - Generate the chain's config.json (that's ChainAdapter.generateConfig)
 *   - Decrypt the keystore password (caller passes it in)
 *   - Decide healing actions (SelfHealingEngine, Phase 4)
 */

'use strict';

const { spawn, exec } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const EventEmitter = require('node:events');

const {
    ENM_LOG_PREFIX,
    PROCESS_STOP_GRACE_MS,
} = require('./EnmConstants');
const {
    chainDir,
    pidFilePath,
    chainLogSinkPath,
    runDir,
    atomicWrite,
} = require('./DataDir');
const { withChainLock } = require('./withChainLock');
const {
    isPidAlive,
    isOurProcess,
    metaFilePath,
    sleep,
    buildSafeChildEnv,
} = require('./processUtils');

/** @typedef {{ pid: number, binaryPath: string, startedAt: number, version?: string|null }} ProcessMeta */

/**
 * 0.5.165 — C23 fix. Per-chain disk-sink rotation threshold. The C21 sink
 * (added 0.5.164) is a single appended file with NO size bound; a council EVM
 * chain (esc/eid/pg — geth at default verbosity 3, mining genesis) emits
 * ~1 MB/s ≈ 85 GB/day each, filling the disk in ~1.5 days → chains crash on
 * ENOSPC. The daily LogCompactor only gzips after 7 days — far too late. We
 * hard-cap the on-disk footprint per chain by rotating the active <id>.log to
 * <id>.log.1 (retention = 1) once it crosses this size, mirroring node.sh's
 * `rotatelogs ... 20M` (build/skeleton/node.sh:2169/2386/3603). Worst-case
 * footprint per chain ≈ 2 × this value (active + one rotation).
 */
const LOG_SINK_ROTATE_BYTES = 20 * 1024 * 1024; // 20 MB — matches node.sh rotatelogs 20M

class NativeProcessService extends EventEmitter {
    /**
     * @param {object} deps
     * @param {object} deps.extensionHandle
     */
    constructor(deps) {
        super();
        if (!deps || !deps.extensionHandle) {
            throw new TypeError('NativeProcessService: { extensionHandle } required');
        }
        this.extensionHandle = deps.extensionHandle;
        /** @type {Map<string, { child: import('node:child_process').ChildProcess, meta: ProcessMeta, manualStop: boolean }>} */
        this.handles = new Map();
    }

    /**
     * Synchronous status probe. Does NOT touch the network. Used by health
     * checker fast tick (5s).
     *
     * @param {string} chainId
     * @returns {{ alive: boolean, pid: number|null, attached: boolean }}
     */
    statusSync(chainId) {
        const handle = this.handles.get(chainId);
        if (handle) {
            // We have an in-process child — trust the kill(0) result. Cross-check
            // the binary path on Linux to defend against PID reuse (audit agent 4).
            const alive = isOurProcess(handle.meta.pid, handle.meta.binaryPath);
            return { alive, pid: handle.meta.pid, attached: true };
        }
        // Maybe a previous PC2 instance left a PID file (reattach not yet run).
        const pidPath = pidFilePath(chainId);
        let raw;
        try {
            raw = fs.readFileSync(pidPath, 'utf8');
        } catch (err) {
            // ENOENT or any read error — treat as not running.
            // 0.5.154 — BUG-C7: ENOENT (no pid file) is the NORMAL "chain
            // stopped" state. Logging it fired on every HealthChecker tick for
            // every stopped chain (7 sidechains/oracles/arbiter on a council
            // node) and flooded elastos-node-manager.log — noise that buried
            // the real BUG-C6 start error during diagnosis. Stay silent on
            // ENOENT; only log genuinely unexpected read errors (permissions,
            // corrupt fs) the operator might care about.
            if (err && err.code !== 'ENOENT') {
                this.extensionHandle.log.debug(`${ENM_LOG_PREFIX} statusSync(${chainId}) read pid: ${err.message}`);
            }
            return { alive: false, pid: null, attached: false };
        }
        const pid = parseInt(raw.trim(), 10);
        if (!Number.isInteger(pid) || pid <= 0) {
            return { alive: false, pid: null, attached: false };
        }
        // Best-effort binary-path cross-check via the meta sidecar.
        let expectedBinary = null;
        try {
            const m = JSON.parse(fs.readFileSync(metaFilePath(chainId), 'utf8'));
            if (m && typeof m.binaryPath === 'string') {
                expectedBinary = m.binaryPath;
            }
        } catch (_) { /* meta missing → fall back to alive-only check */ }
        return { alive: isOurProcess(pid, expectedBinary), pid, attached: false };
    }

    /**
     * Start the chain. Locked per chainId. Idempotent: if already running,
     * returns the existing PID without spawning twice.
     *
     * Caller must:
     *   1. Have already validated the binary path (EnmBinaryLocator.smokeTest).
     *   2. Have already written the chain's config.json + keystore.dat to chainDir.
     *
     * @param {string} chainId
     * @param {object} chainConfig
     * @returns {Promise<{ pid: number, startedAt: number, alreadyRunning?: boolean }>}
     */
    start(chainId, chainConfig) {
        return withChainLock(chainId, async () => {
            const existing = this.statusSync(chainId);
            if (existing.alive) {
                return {
                    pid: existing.pid,
                    startedAt: 0,
                    alreadyRunning: true,
                };
            }
            // Stale PID file from crashed previous run — clean up.
            if (existing.pid) {
                await this._unlinkSilent(pidFilePath(chainId));
            }

            return this._spawnLocked(chainId, chainConfig);
        });
    }

    /**
     * beta.3.84 — Wave E — mark every currently-tracked chain handle as
     * manualStop=true, synchronously, without sending any signal. Used
     * by the /teardown route + the ENM SIGTERM handler so that when
     * pc2-node tears us down (and our child ela processes get killed
     * as a side effect of the extension's process group dying), the
     * subsequent exit events are correctly classified as `manual=true`
     * instead of `manual=false`. Without this, every deploy looked
     * like an external killer in the logs — chased as a phantom bug
     * for the entire 2026-05-18 session until Wave B forensics proved
     * silence (no real external SIGTERM source existed).
     *
     * No await, no signal — purely a metadata flip.
     *
     * @returns {string[]} chainIds marked
     */
    markAllManualStop() {
        const marked = [];
        for (const [chainId, handle] of this.handles.entries()) {
            if (handle && !handle.manualStop) {
                handle.manualStop = true;
                marked.push(chainId);
            }
        }
        if (marked.length > 0) {
            this.extensionHandle.log.info(
                `${ENM_LOG_PREFIX} markAllManualStop: ${marked.length} chain(s) marked: ${marked.join(', ')}`,
            );
        }
        return marked;
    }

    /**
     * v0.5.172 (#3) — fire-and-forget send `signal` to every child WE spawned,
     * giving them a graceful-flush head start when ENM itself is shutting down
     * (a deploy/restart). EVM sidechains especially need SIGINT for a clean
     * leveldb flush (node.sh stops them with `kill -s SIGINT`); ela/arbiter/
     * oracles all handle SIGINT as a graceful stop too. Without this, the
     * children only receive whatever pc2-node sends when it tears the app down,
     * which can be an abrupt mid-write kill → unclean shutdown.
     *
     * No wait, no grace timer — this is meant to run inside the synchronous
     * shutdown handler (pc2-node then finishes the kill). Pair with
     * markAllManualStop() FIRST so the resulting exits classify as manual.
     * Only signals children with a live ChildProcess handle (skips chains we
     * merely reattached to — those have no handle); never throws.
     *
     * @param {string} [signal='SIGINT']
     * @returns {number} count of children signalled
     */
    signalAll(signal = 'SIGINT') {
        let sent = 0;
        const signaled = new Set();
        // 1. Chains we spawned THIS session — signal via the live ChildProcess.
        for (const [chainId, handle] of this.handles.entries()) {
            const child = handle && handle.child;
            if (!child || child.killed || typeof child.pid !== 'number') { continue; }
            try {
                child.kill(signal);
                signaled.add(chainId);
                sent += 1;
            } catch (err) {
                this.extensionHandle.log.debug(
                    `${ENM_LOG_PREFIX} signalAll: ${chainId} kill(${signal}) failed: ${err.message}`,
                );
            }
        }
        // 2. P0-5 (v0.5.179) — chains that SURVIVED a prior ENM restart were
        // re-adopted via reattach(), which records NO ChildProcess handle (their
        // stdio belonged to the dead parent). The loop above misses them, so after
        // ANY ENM restart the graceful-flush SIGINT reached ZERO children — EVM
        // geth then got only pc2-node's abrupt kill mid-write → unclean leveldb
        // shutdown / corruption, the exact thing this flush exists to prevent.
        // Scan the PID files and signal those PIDs directly. statusSync cross-checks
        // /proc/<pid>/exe (isOurProcess), so we never signal a recycled-PID stranger.
        try {
            for (const fname of fs.readdirSync(runDir())) {
                const m = fname.match(/^ela-([a-z0-9-]+)\.pid$/);
                if (!m) { continue; }
                const chainId = m[1];
                if (signaled.has(chainId)) { continue; }
                let status;
                try { status = this.statusSync(chainId); } catch (_) { continue; }
                if (!status || !status.alive || typeof status.pid !== 'number') { continue; }
                try {
                    process.kill(status.pid, signal);
                    signaled.add(chainId);
                    sent += 1;
                } catch (err) {
                    this.extensionHandle.log.debug(
                        `${ENM_LOG_PREFIX} signalAll: ${chainId} (reattached pid=${status.pid}) `
                        + `kill(${signal}) failed: ${err.message}`,
                    );
                }
            }
        } catch (_) {
            /* runDir missing/unreadable — nothing to flush */
        }
        if (sent > 0) {
            this.extensionHandle.log.info(
                `${ENM_LOG_PREFIX} signalAll: sent ${signal} to ${sent} child(ren) for graceful flush`,
            );
        }
        return sent;
    }

    /**
     * v0.5.184 — wait until every tracked/reattached chain process has exited,
     * or until graceMs elapses. Used by ENM's OWN shutdown path (server.js
     * onShutdown + /teardown): after signalAll('SIGINT'), the children — esp.
     * EVM geth — need tens of seconds to flush leveldb cleanly. Pre-v0.5.184
     * ENM fired the SIGINT then exited within ms, so the process-group teardown
     * SIGKILLed geth mid-write → dirty DB → rewind on restart → (mining node)
     * fork. Awaiting their clean exit here lets the flush finish. Bounded by
     * graceMs so a wedged child can't hang shutdown forever; on timeout we log
     * who's still alive and proceed (no worse than the old fire-and-forget).
     *
     * Watches the union of (a) chains spawned this session and (b) reattached
     * chains with a live PID file — statusSync covers both cohorts, exactly
     * like signalAll. Never throws.
     *
     * @param {number} graceMs  max time to wait for all children to exit
     * @returns {Promise<{stopped:number, total:number, stillAlive:string[]}>}
     */
    async awaitAllStopped(graceMs) {
        const POLL_MS = 1_000;
        const deadline = Date.now() + Math.max(0, Number(graceMs) || 0);
        const watch = new Set(this.handles.keys());
        try {
            for (const fname of fs.readdirSync(runDir())) {
                const m = fname.match(/^ela-([a-z0-9-]+)\.pid$/);
                if (m) { watch.add(m[1]); }
            }
        } catch (_) { /* runDir missing — only the live handles to watch */ }

        const stillAliveIds = () => {
            const alive = [];
            for (const chainId of watch) {
                let st;
                try { st = this.statusSync(chainId); } catch (_) { continue; }
                if (st && st.alive) { alive.push(chainId); }
            }
            return alive;
        };

        const total = watch.size;
        let alive = stillAliveIds();
        while (alive.length > 0 && Date.now() < deadline) {
            // eslint-disable-next-line no-await-in-loop — bounded poll by design
            await new Promise((r) => setTimeout(r, POLL_MS));
            alive = stillAliveIds();
        }
        if (alive.length > 0) {
            this.extensionHandle.log.warn(
                `${ENM_LOG_PREFIX} awaitAllStopped: ${alive.length}/${total} chain(s) still alive after `
                + `${Math.round((Number(graceMs) || 0) / 1000)}s grace: ${alive.join(', ')} — proceeding `
                + 'with shutdown (the supervisor may SIGKILL them)',
            );
        } else if (total > 0) {
            this.extensionHandle.log.info(
                `${ENM_LOG_PREFIX} awaitAllStopped: all ${total} child(ren) exited cleanly within grace`,
            );
        }
        return { stopped: total - alive.length, total, stillAlive: alive };
    }

    /**
     * Stop the chain. <stopSignal> → wait grace → SIGKILL. Marks as
     * user-initiated so F1 honors the stop and doesn't try to restart.
     * Locked per chainId.
     *
     * FIX-C16 — `opts.signal` selects the initial stop signal so the geth EVM
     * sidechains can be stopped with SIGINT (clean leveldb flush), matching
     * node.sh. Defaults to 'SIGTERM' so all existing callers are unchanged.
     *
     * @param {string} chainId
     * @param {object} [opts]
     * @param {string} [opts.signal='SIGTERM'] initial stop signal
     * @returns {Promise<{ exitCode: number|null, signal: string|null, killed?: boolean }>}
     */
    stop(chainId, opts = {}) {
        const stopSignal = (opts && opts.signal) || 'SIGTERM';
        return withChainLock(chainId, async () => {
            const handle = this.handles.get(chainId);
            const pidPath = pidFilePath(chainId);

            if (!handle) {
                // Maybe a reattached process — try to signal by PID file.
                let pid = null;
                try {
                    pid = parseInt((await fsp.readFile(pidPath, 'utf8')).trim(), 10);
                } catch (err) {
                    if (err.code !== 'ENOENT') throw err;
                }
                if (!pid || !isPidAlive(pid)) {
                    await this._unlinkSilent(pidPath);
                    return { exitCode: null, signal: null };
                }
                return this._signalAndWait(pid, chainId, stopSignal);
            }

            handle.manualStop = true;
            const result = await this._signalAndWait(handle.meta.pid, chainId, stopSignal);
            this.handles.delete(chainId);
            await this._unlinkSilent(pidPath);
            await this._unlinkSilent(metaFilePath(chainId));
            return result;
        });
    }

    /**
     * Restart = stop then start. Locked atomically — no other action can race.
     *
     * @param {string} chainId
     * @param {object} chainConfig
     * @returns {Promise<{ pid: number, startedAt: number }>}
     */
    restart(chainId, chainConfig) {
        return withChainLock(chainId, async () => {
            const status = this.statusSync(chainId);
            if (status.alive && status.pid) {
                if (this.handles.has(chainId)) {
                    this.handles.get(chainId).manualStop = false; // F1 may re-start; we want to count this as auto
                }
                await this._signalAndWait(status.pid, chainId);
                this.handles.delete(chainId);
                await this._unlinkSilent(pidFilePath(chainId));
                await this._unlinkSilent(metaFilePath(chainId));
            }
            return this._spawnLocked(chainId, chainConfig);
        });
    }

    /**
     * Reattach to all chains whose PID files reference live processes. Called
     * once at extension boot (via main.js 'ready' lifecycle hook in Phase 2+).
     *
     * After reattach, we know the PID is alive but we DO NOT have the child
     * handle (its stdio was inherited by the previous PC2 process). Logs must
     * come from on-disk files (Rev 9 architecture note).
     *
     * @returns {Promise<Array<{ chainId: string, pid: number }>>}
     */
    async reattach() {
        const dir = runDir();
        const files = await fsp.readdir(dir).catch(() => []);
        const reattached = [];
        for (const fname of files) {
            const m = fname.match(/^ela-([a-z0-9-]+)\.pid$/);
            if (!m) continue;
            const chainId = m[1];
            const pidPath = path.join(dir, fname);
            let pid;
            try {
                const raw = await fsp.readFile(pidPath, 'utf8');
                pid = parseInt(raw.trim(), 10);
            } catch {
                continue;
            }
            if (!Number.isInteger(pid) || pid <= 0) {
                await this._unlinkSilent(pidPath);
                await this._unlinkSilent(metaFilePath(chainId));
                continue;
            }
            // Best-effort metadata read — non-fatal if missing.
            const meta = await this._readMetaSafe(chainId);
            const expectedBinary = (meta && typeof meta.binaryPath === 'string') ? meta.binaryPath : null;
            // Cross-check against /proc/<pid>/exe so we don't reattach to a
            // recycled-PID stranger (Phase 2 audit, agent 4).
            if (!isOurProcess(pid, expectedBinary)) {
                this.extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} reattach(${chainId}): pid=${pid} did not match expected binary "${expectedBinary || '<unknown>'}" — cleaning stale state`,
                );
                await this._unlinkSilent(pidPath);
                await this._unlinkSilent(metaFilePath(chainId));
                continue;
            }
            this.extensionHandle.log.info(
                `${ENM_LOG_PREFIX} reattached to running ${chainId} (pid=${pid})`,
            );
            this.emit('reattached', { chainId, pid, meta });
            reattached.push({ chainId, pid });
        }
        return reattached;
    }

    // ========================================================================
    // Private — must run inside withChainLock
    // ========================================================================

    /**
     * @private
     * @param {string} chainId
     * @param {object} chainConfig
     */
    async _spawnLocked(chainId, chainConfig) {
        if (!chainConfig || typeof chainConfig.binaryPath !== 'string') {
            throw new TypeError('NativeProcessService.start: chainConfig.binaryPath required');
        }
        const cwd = chainDir(chainId);
        const binaryPath = chainConfig.binaryPath;

        // Defence: confirm cwd has the things the chain expects at startup.
        //
        // 0.5.154 — BUG-C6 fix. This config.json precondition is for
        // FILE-configured chains only: ela mainchain reads config.json at
        // startup (ElaMainChainAdapter writes it), and the arbiter likewise.
        // EVM sidechains (esc/eid/pg) configure via geth CLI flags in
        // chainConfig.spawnArgs and oracles (Class C) via chainConfig.spawnEnv
        // — neither reads a config.json and their adapters intentionally never
        // write one. Pre-0.5.154 this unconditional check threw "config.json
        // missing" for EVERY EVM/oracle start, so the Council install's
        // start-chains step failed each sidechain (caught as non-fatal warn)
        // and the operator saw "sidechains don't work / nothing changed".
        // Require config.json ONLY when the chain is neither arg- nor
        // env-configured (i.e. a file-configured chain like mainchain).
        const usesSpawnArgs = Array.isArray(chainConfig.spawnArgs)
            && chainConfig.spawnArgs.length > 0;
        const usesSpawnEnv = chainConfig.spawnEnv
            && typeof chainConfig.spawnEnv === 'object'
            && Object.keys(chainConfig.spawnEnv).length > 0;
        const configFile = path.join(cwd, 'config.json');
        if (!usesSpawnArgs && !usesSpawnEnv && !fs.existsSync(configFile)) {
            throw new Error(
                `NativeProcessService.start: ${configFile} missing — generate it before calling start()`,
            );
        }
        // Pre-create the chain's data subtree so ela doesn't trip on a
        // missing dir on its first write. ela mkdir's its data tree
        // itself in current versions, but that wasn't always true and
        // costs us nothing to ensure.
        try {
            fs.mkdirSync(path.join(cwd, 'elastos'), { recursive: true, mode: 0o700 });
        } catch (_) { /* swallow — best-effort */ }

        const startedAt = Date.now();
        // detached: true so the child survives if PC2 itself crashes.
        // unref() so PC2 doesn't wait for the child on its own shutdown.
        // env filtered: forward only PATH/HOME/locale (Phase 2 audit, agent 2 —
        // raw process.env could leak PC2 secrets to ela).
        //
        // beta.3.95 (Wave M3.1) — chainConfig.spawnArgs support. ela
        // mainchain takes no args (configures via config.json) so the
        // pre-3.95 hardcoded `[]` was correct. EVM sidechains (geth-
        // derived: ESC/EID/PG) need CLI flags like --datadir, --rpcport,
        // --miner.etherbase, --pbft.keystore. Adapters compute the array
        // in their start() override + pass it through chainConfig.
        // Validate to keep this primitive boring: array of strings only.
        var spawnArgs = [];
        if (Array.isArray(chainConfig.spawnArgs)) {
            for (var i = 0; i < chainConfig.spawnArgs.length; i += 1) {
                var arg = chainConfig.spawnArgs[i];
                if (typeof arg !== 'string') {
                    throw new TypeError(
                        'NativeProcessService.start: spawnArgs['
                        + i + '] must be string, got ' + typeof arg,
                    );
                }
                spawnArgs.push(arg);
            }
        }
        // beta.0.3.1 (Wave M4.1) — chainConfig.spawnEnv support. Oracles
        // (Class C) need env vars like ENM_PARENT_RPC + ENM_MAINCHAIN_RPC
        // since their script reads connectivity from env, not config
        // files. The safe env baseline (PATH/HOME/locale) stays as the
        // base; spawnEnv extras layer on top with same-key precedence
        // going to the explicit spawnEnv (so adapters can override TZ,
        // NODE_OPTIONS, etc.).
        var childEnv = buildSafeChildEnv();
        if (chainConfig.spawnEnv && typeof chainConfig.spawnEnv === 'object') {
            for (const k of Object.keys(chainConfig.spawnEnv)) {
                const v = chainConfig.spawnEnv[k];
                if (typeof v !== 'string') {
                    throw new TypeError(
                        'NativeProcessService.start: spawnEnv.' + k
                        + ' must be string, got ' + typeof v,
                    );
                }
                childEnv[k] = v;
            }
        }
        // v0.5.193 — node.sh raises the open-file limit (`ulimit -n 40960`,
        // set_env:62-68) before launching ANY chain, because ela/geth open
        // hundreds of sockets + files and the inherited default (~1024 on stock
        // Ubuntu) risks EMFILE under peer load. Node has no setrlimit binding, so
        // we launch the binary under a minimal POSIX shell that raises the soft
        // limit (best-effort: silenced + capped by the hard limit when
        // unprivileged, exactly like node.sh's behavior) and then `exec`s the
        // binary IN PLACE. `exec` replaces the shell image, so child.pid IS the
        // chain process and /proc/<pid>/exe still resolves to binaryPath for the
        // reattach cross-check (processUtils.isOurProcess). The shell reads no
        // stdin, so the post-spawn keystore-password pipe (ela/arbiter) still
        // reaches the chain. argv is forwarded verbatim ($0=binary, "$@"=args).
        const NOFILE_SOFT_TARGET = 40960;
        // v0.5.230 — stdio: keep stdin as a pipe (ela reads its keystore
        // password from stdin per node.sh:878 + the BPoS arbiter mode
        // password feed below), but route stdout/stderr to /dev/null
        // ('ignore') instead of through ENM's runtime pipes.
        //
        // Why: every chain binary already writes its own logs via its
        // own --log/--logdir flags (ela → chains/mainchain/elastos/logs/
        // node/*.log; geth forks → their own logdir; oracle scripts →
        // their stdout was unread anyway). The pre-230 ['pipe', 'pipe',
        // 'pipe'] only existed for the stdin password feed; the stdout/
        // stderr pipes back to ENM were never read, but they DID hold an
        // FD attached to ENM's process lifecycle.
        //
        // The consequence pre-230: when ENM exited (deploy SIGTERM,
        // crash, OOM, anything), Node closed those pipe FDs. The
        // chain's NEXT write to stdout/stderr would deliver SIGPIPE →
        // the chain process terminates by default. Net effect: every
        // ENM restart killed all 8 child chains, even with detached:
        // true. autoStart then respawned them ~60s later. Operator-
        // visible as "all chains briefly down on every deploy."
        //
        // 'ignore' makes the kernel-level fd be /dev/null inside the
        // child. The child can write to stdout/stderr forever without
        // anyone closing on them — ENM exiting is invisible to the
        // child's stdio. Combined with detached:true + child.unref(),
        // children are now truly long-lived across ENM lifecycle events.
        const child = spawn(
            '/bin/sh',
            ['-c', `ulimit -n ${NOFILE_SOFT_TARGET} 2>/dev/null; exec "$0" "$@"`, binaryPath, ...spawnArgs],
            {
                cwd,
                env: childEnv,
                stdio: ['pipe', 'ignore', 'ignore'],
                detached: true,
            },
        );
        child.unref();

        if (!child.pid) {
            throw new Error(`NativeProcessService.start: spawn returned no PID for ${binaryPath}`);
        }

        // beta.3.63 — Phase 7 Layer 1: harden ela against the Linux OOM
        // killer by lowering its oom_score_adj. Default for child processes
        // is 0; range is [-1000, 1000] where -1000 = "never kill" and
        // 1000 = "kill first". -500 gives strong resistance without making
        // ela completely OOM-immune (we still want the kernel to reclaim
        // memory if ela itself goes runaway).
        //
        // Why this matters: OOM-killing ela mid-write is the #1 trigger of
        // the DPoS-state-vs-block-ledger inconsistency that locks up the
        // chain. With this score, the kernel preferentially kills almost
        // any other userspace process before reaching for ela. Best-effort
        // only — non-root can't lower below 0, so this is no-op when ENM
        // runs unprivileged. Failure is silent.
        try {
            fs.writeFileSync(`/proc/${child.pid}/oom_score_adj`, '-500');
            this.extensionHandle.log.info(
                `${ENM_LOG_PREFIX} ${chainId} oom_score_adj=-500 (OOM-resistant)`,
            );
        } catch (err) {
            // Non-fatal — silent unless debug. Common on non-Linux dev hosts
            // or when ENM lacks root. ela just runs with default OOM score.
            this.extensionHandle.log.debug(
                `${ENM_LOG_PREFIX} ${chainId} could not set oom_score_adj (${err.message}); ela runs at default OOM priority`,
            );
        }

        // ela reads its keystore password from stdin per node.sh:878 (Rev 1 audit).
        // The caller (ElaMainChainAdapter) is responsible for piping the plaintext
        // password via the child stdin if BPoS arbiter mode is enabled. This
        // primitive stays chain-agnostic.

        // Persist PID + metadata for reattach across PC2 restarts. If either
        // write fails we kill the orphan rather than leak an unmanaged process
        // (Phase 2 audit, agent 4: spawn-failure rollback).
        const meta = {
            pid: child.pid,
            binaryPath,
            startedAt,
            version: chainConfig.binaryVersion || null,
        };
        try {
            await atomicWrite(pidFilePath(chainId), `${child.pid}\n`, { mode: 0o600 });
            await atomicWrite(metaFilePath(chainId), JSON.stringify(meta, null, 2), { mode: 0o600 });
        } catch (writeErr) {
            this.extensionHandle.log.error(
                `${ENM_LOG_PREFIX} ${chainId} PID/meta write failed (${writeErr.message}); killing orphan child pid=${child.pid}`,
            );
            try { process.kill(child.pid, 'SIGKILL'); } catch (_) { /* already dead */ }
            await this._unlinkSilent(pidFilePath(chainId));
            await this._unlinkSilent(metaFilePath(chainId));
            throw writeErr;
        }

        // Open a per-chain disk sink for the child's stdout+stderr. node.sh
        // persists every process to a tailable file (esc/pg/oracle via
        // rotatelogs, ela/arbiter via `2>output`); ENM matches so the HTTP
        // tail endpoint (routes/logs.js) works for EVERY chain — not just ela
        // mainchain, which is the only binary that self-writes elastos/logs/
        // node/. The live SSE path (ProcessLogStreamer) is unaffected: the
        // emit() calls below stay intact, so both consumers coexist.
        //
        // Robustness: a sink failure (disk full, EACCES, etc.) must NEVER kill
        // the chain. We swallow open errors, attach an 'error' handler that
        // warns and continues, and guard the close against double-invocation
        // from the exit handler + any spawn-failure cleanup path.
        //
        // 0.5.165 — C23: the sink is now SIZE-bounded. We rotate the active
        // <id>.log to <id>.log.1 (retention = 1) once it crosses
        // LOG_SINK_ROTATE_BYTES, so the on-disk footprint is hard-capped at
        // ~2 × LOG_SINK_ROTATE_BYTES per chain regardless of write rate. We
        // track bytes in a counter (no per-write fs.stat) and rotate inline on
        // the data-listener tick using SYNC fs ops so the rename is atomic
        // within the single tick — no other write can interleave mid-rotation.
        let logSink = null;
        let logSinkClosed = false;
        let sinkBytes = 0;
        const sinkPath = chainLogSinkPath(chainId);
        // openSink — (re)open a fresh write stream at sinkPath with the standard
        // 'error' handler wiring, assigning it to logSink. Shared by the initial
        // open and the post-rotation reopen so the createWriteStream + handler
        // setup lives in exactly one place. May throw synchronously if the open
        // itself fails (caught by the initial-open try/catch); async write
        // failures are handled by the attached 'error' handler.
        const openSink = () => {
            const stream = fs.createWriteStream(sinkPath, { flags: 'a', mode: 0o600 });
            stream.on('error', (err) => {
                // Disk full / permissions / fd exhaustion — log once at warn
                // and stop writing. The chain keeps running; only on-disk log
                // capture degrades (SSE tailing still works).
                this.extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} ${chainId} log sink write error (${err.message}); on-disk logging disabled for this run`,
                );
                logSinkClosed = true;
                logSink = null;
            });
            logSink = stream;
        };
        const closeLogSink = () => {
            if (logSinkClosed || !logSink) {
                return;
            }
            logSinkClosed = true;
            try {
                logSink.end();
            } catch (_) { /* already destroyed — nothing to do */ }
            logSink = null;
        };
        // rotateSink — move the full <id>.log to <id>.log.1 (dropping any prior
        // .1) and reopen a fresh active file. Halts writes first (null logSink)
        // so nothing appends mid-rotation, then end()s the current stream: on
        // POSIX the fd stays valid after the rename, so any buffered bytes still
        // flush into the now-renamed .log.1 — no data loss. SYNC rm/rename keeps
        // the swap atomic within this data-listener tick. Any fault → warn and
        // leave logSink null (disable capture for this run; chain keeps running).
        const rotateSink = () => {
            if (logSinkClosed) {
                return;
            }
            const cur = logSink;
            logSink = null; // stop further writes before we touch the file
            try {
                if (cur) {
                    try { cur.end(); } catch (_) { /* already destroyed */ }
                }
                fs.rmSync(`${sinkPath}.1`, { force: true }); // retention = 1
                fs.renameSync(sinkPath, `${sinkPath}.1`);
                openSink();
                sinkBytes = 0;
            } catch (err) {
                this.extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} ${chainId} log sink rotation failed (${err.message}); on-disk logging disabled for this run`,
                );
                logSink = null;
            }
        };
        // writeToSink — single write path used by BOTH stdout and stderr
        // listeners so byte-accounting + rotation can never drift between them.
        const writeToSink = (chunk) => {
            if (!logSink) {
                return;
            }
            try {
                logSink.write(chunk);
            } catch (_) {
                // error handler already fired / stream torn down — bail without
                // counting; never let a logging fault touch the chain process.
                return;
            }
            sinkBytes += chunk.length;
            if (sinkBytes >= LOG_SINK_ROTATE_BYTES) {
                rotateSink();
            }
        };
        try {
            fs.mkdirSync(path.dirname(sinkPath), { recursive: true, mode: 0o700 });
            // Rotate-on-open: a stale oversized <id>.log from a prior run must
            // not be appended onto (it already busts the cap). If it's at/over
            // the threshold, rotate it to .1 first; if it's smaller, seed
            // sinkBytes with its current size so the pre-existing bytes still
            // count toward the cap. Stat failures fall through to a 0 baseline.
            let existingSize = 0;
            try {
                existingSize = fs.statSync(sinkPath).size;
            } catch (_) { /* no pre-existing file (ENOENT) or unreadable — baseline 0 */ }
            if (existingSize >= LOG_SINK_ROTATE_BYTES) {
                fs.rmSync(`${sinkPath}.1`, { force: true }); // retention = 1
                fs.renameSync(sinkPath, `${sinkPath}.1`);
                sinkBytes = 0;
            } else {
                sinkBytes = existingSize;
            }
            openSink();
        } catch (err) {
            // Failed to even open the sink (mkdir/create/rotate). Non-fatal —
            // proceed without on-disk capture rather than blocking chain start.
            this.extensionHandle.log.warn(
                `${ENM_LOG_PREFIX} ${chainId} could not open log sink (${err.message}); on-disk logging disabled for this run`,
            );
            logSink = null;
        }

        const handle = { child, meta, manualStop: false };
        this.handles.set(chainId, handle);

        // Wire up exit handler. We swallow the close event silently if it's a
        // managed stop; otherwise emit so SelfHealingEngine can fire F1.
        child.on('exit', (code, signal) => {
            const wasManual = handle.manualStop;
            const exitedPid = child.pid;
            this.handles.delete(chainId);
            // Close the disk sink so we don't leak a file descriptor across
            // restarts. Guarded against double-close (see closeLogSink).
            closeLogSink();
            // best-effort cleanup; don't await inside the listener
            this._unlinkSilent(pidFilePath(chainId)).catch(() => {});
            this._unlinkSilent(metaFilePath(chainId)).catch(() => {});

            this.extensionHandle.log.info(
                `${ENM_LOG_PREFIX} ${chainId} exited (code=${code}, signal=${signal}, manual=${wasManual})`,
            );
            this.emit('exit', { chainId, code, signal, manualStop: wasManual });

            // beta.3.81 — Wave B item ⑧ — external SIGTERM forensics.
            // When ela exits via SIGTERM but ENM didn't initiate the
            // stop (wasManual=false), something outside ENM killed the
            // process. Operators on a test node hit this repeatedly:
            // chain dies every 30-90min, no audit row, no clue who's
            // sending the signal. Capture a forensic snapshot to the
            // server log so the next death event leaves a trail we
            // can read offline. Fire-and-forget — must not block the
            // exit handler or impact F1's restart latency.
            if (signal === 'SIGTERM' && !wasManual) {
                this._captureSigtermForensics(chainId, exitedPid).catch((err) => {
                    this.extensionHandle.log.debug(
                        `${ENM_LOG_PREFIX} ${chainId} SIGTERM forensics failed (non-fatal): ${err.message}`,
                    );
                });
            }
        });
        child.on('error', (err) => {
            // A spawn-level error (e.g. ENOENT/EACCES on the binary) may fire
            // without a paired 'exit'. Close the sink here too so we never leak
            // its fd; closeLogSink is idempotent so a later 'exit' is a no-op.
            closeLogSink();
            this.extensionHandle.log.error(`${ENM_LOG_PREFIX} ${chainId} child error: ${err.message}`);
            this.emit('child-error', { chainId, error: err });
        });

        // Bubble stdio up so the log streamer (Phase 3) can subscribe, AND
        // append every chunk to the per-chain disk sink for the HTTP tail
        // endpoint. Both consumers coexist — the emit() keeps live SSE working;
        // the writeToSink() persists for reattach/initial-load/reconnect reads.
        // writeToSink centralises the null-guard, byte-accounting, and
        // size-rotation (0.5.165 — C23) so stdout/stderr stay in sync and a
        // logging fault never touches the chain process.
        if (child.stdout) {
            child.stdout.on('data', (chunk) => {
                this.emit('stdout', { chainId, chunk });
                writeToSink(chunk);
            });
        }
        if (child.stderr) {
            child.stderr.on('data', (chunk) => {
                this.emit('stderr', { chainId, chunk });
                writeToSink(chunk);
            });
        }

        this.extensionHandle.log.info(
            `${ENM_LOG_PREFIX} ${chainId} started (pid=${child.pid}, bin=${binaryPath})`,
        );
        this.emit('started', { chainId, pid: child.pid, startedAt });

        return { pid: child.pid, startedAt };
    }

    /**
     * Write to a running child's stdin, then close the writeable side.
     * Used by ElaMainChainAdapter to feed the keystore password to ela on
     * its first prompt (per node.sh's `cat ~/.config/elastos/ela.txt | nohup
     * ./ela` pattern, build/skeleton/node.sh:866). Without this, ela hangs
     * forever waiting for input on a detached child.
     *
     * Returns true if we wrote something, false if the child is gone or
     * its stdin is already closed (e.g. after a reattach across restarts —
     * we have the PID but not the original handle).
     *
     * @param {string} chainId
     * @param {string} text   raw text; we append a newline so ela's prompt
     *                        reader treats it as a line.
     * @returns {boolean}
     */
    writeStdin(chainId, text) {
        const handle = this.handles.get(chainId);
        if (!handle || !handle.child || !handle.child.stdin || handle.child.stdin.destroyed) {
            return false;
        }
        try {
            handle.child.stdin.write(String(text));
            if (!String(text).endsWith('\n')) {
                handle.child.stdin.write('\n');
            }
            handle.child.stdin.end();
            return true;
        } catch (err) {
            this.extensionHandle.log.warn(
                `${ENM_LOG_PREFIX} ${chainId} writeStdin failed: ${err.message}`,
            );
            return false;
        }
    }

    /**
     * @private
     * Send the stop signal (default SIGTERM), wait up to
     * PROCESS_STOP_GRACE_MS, then escalate to SIGKILL.
     *
     * FIX-C16 — `stopSignal` lets the caller choose the initial signal. The
     * geth-based EVM sidechains (esc/eid/pg) must be stopped with SIGINT
     * because their clean-shutdown handler (leveldb flush) is keyed to
     * SIGINT — node.sh stops them with `kill -s SIGINT` (node.sh:2412/4416),
     * while ela/arbiter/oracles use a plain `kill` = SIGTERM. Defaults to
     * 'SIGTERM' so existing callers are unchanged.
     */
    async _signalAndWait(pid, chainId, stopSignal = 'SIGTERM') {
        if (!isPidAlive(pid)) {
            return { exitCode: null, signal: null };
        }

        try {
            process.kill(pid, stopSignal);
        } catch (err) {
            // ESRCH = no such process; already dead — treat as success.
            if (err.code !== 'ESRCH') {
                throw err;
            }
            return { exitCode: null, signal: stopSignal };
        }

        const start = Date.now();
        const handle = this.handles.get(chainId);

        while (Date.now() - start < PROCESS_STOP_GRACE_MS) {
            if (!isPidAlive(pid)) {
                return {
                    exitCode: handle && handle.child && handle.child.exitCode != null ? handle.child.exitCode : null,
                    signal: handle && handle.child && handle.child.signalCode ? handle.child.signalCode : stopSignal,
                };
            }
            // eslint-disable-next-line no-await-in-loop
            await sleep(200);
        }

        // Grace expired — SIGKILL.
        this.extensionHandle.log.warn(
            `${ENM_LOG_PREFIX} ${chainId} did not exit within ${PROCESS_STOP_GRACE_MS}ms — sending SIGKILL`,
        );
        try {
            process.kill(pid, 'SIGKILL');
        } catch (err) {
            if (err.code !== 'ESRCH') throw err;
        }
        // SIGKILL is delivered immediately, but reaping is a separate beat.
        await sleep(100);
        return { exitCode: null, signal: 'SIGKILL', killed: true };
    }

    /** @private */
    async _readMetaSafe(chainId) {
        try {
            const raw = await fsp.readFile(metaFilePath(chainId), 'utf8');
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    /** @private */
    async _unlinkSilent(p) {
        try {
            await fsp.unlink(p);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                this.extensionHandle.log.debug(`${ENM_LOG_PREFIX} unlink ${p} failed: ${err.message}`);
            }
        }
    }

    /**
     * beta.3.81 — Wave B item ⑧ — capture forensic context when ela
     * receives an external SIGTERM (manual=false). Goal: identify the
     * killer, which has been a mystery in testing for weeks.
     *
     * Strategy: collect the cheapest "what was happening around the
     * moment of death" signals available. All commands are bounded
     * (`tail`, time-windowed `journalctl --since`) so the worst-case
     * data volume is ~30KB per event. Fire-and-forget; nothing on
     * the F1 / restart hot path waits for this.
     *
     * Output: a single structured log line prefixed with
     * `external-sigterm-source` that operators can grep:
     *
     *     grep -A50 'external-sigterm-source' /var/lib/pc2/data/logs/elastos-node-manager.log
     *
     * @private
     * @param {string} chainId
     * @param {number} exitedPid
     */
    async _captureSigtermForensics(chainId, exitedPid) {
        const captureStart = Date.now();
        const log = this.extensionHandle.log;
        // Best-effort shell capture with hard timeouts. exec uses /bin/sh
        // which is dash on Ubuntu — keep the commands POSIX-y.
        const runCmd = (cmd, timeoutMs) => new Promise((resolve) => {
            exec(cmd, { timeout: timeoutMs, maxBuffer: 64 * 1024 }, (err, stdout, stderr) => {
                if (err && err.killed) {
                    resolve(`<timed out after ${timeoutMs}ms>`);
                    return;
                }
                if (err && err.code) {
                    resolve(`<exit ${err.code}: ${(stderr || '').slice(0, 200)}>`);
                    return;
                }
                resolve(String(stdout || '').slice(0, 8 * 1024)); // cap each at 8KB
            });
        });

        // Five forensic probes in parallel. Each is bounded; combined
        // budget is ~5s wall-clock, almost always faster.
        const [dmesgTail, journalTail, psTree, parentInfo, ppidProbe] = await Promise.all([
            // dmesg: OOM kills + kernel-side signals show up here
            runCmd('dmesg --time-format iso 2>/dev/null | tail -20', 2000),
            // journalctl: catches systemd unit activity (e.g. another unit
            // that stops the process, or pc2-node restarting)
            runCmd(`journalctl --since "20 seconds ago" --no-pager 2>/dev/null | tail -60`, 3000),
            // ps tree: see who's alive, parent relationships
            runCmd('ps -ef --forest 2>/dev/null | head -80', 2000),
            // /proc/<pid> may be gone already (process exited), but a
            // partial read is informative if we win the race
            runCmd(`cat /proc/${exitedPid}/status 2>/dev/null | head -20 || echo '<proc gone>'`, 1000),
            // The PPID at time of exit. exec is async so PPID==1 usually;
            // we capture it for the record.
            runCmd(`ls -la /proc/${exitedPid} 2>/dev/null | head -5 || echo '<proc gone>'`, 1000),
        ]);

        const elapsedMs = Date.now() - captureStart;
        // Single structured log entry, JSON-on-one-line so operators can
        // pipe to jq if they want.
        const payload = {
            tag: 'external-sigterm-source',
            chainId,
            exitedPid,
            capturedAt: new Date().toISOString(),
            captureElapsedMs: elapsedMs,
            dmesgTail: dmesgTail.split('\n').slice(-20),
            journalTail: journalTail.split('\n').slice(-30),
            psTree: psTree.split('\n').slice(-40),
            procStatus: parentInfo.split('\n').slice(-10),
            procDir: ppidProbe.split('\n').slice(-5),
        };
        log.warn(
            `${ENM_LOG_PREFIX} ${chainId} external-sigterm-source forensic snapshot: ${JSON.stringify(payload)}`,
        );
        // Emit an event so SseHub / SelfHealingEngine can surface this
        // to operators as a CRITICAL_NOTIFY if they want. Decoupled
        // from this service so we don't have to know about SseHub here.
        this.emit('external-sigterm', { chainId, exitedPid, payload });
    }
}

module.exports = {
    NativeProcessService,
    // Re-export for backward compatibility — callers may have already imported
    // isPidAlive from this module.
    isPidAlive,
};
