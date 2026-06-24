/**
 * AppProcessManager — spawns and supervises long-running Node backends
 * for installed apps of `type: "service"`.
 *
 * Why this exists
 *   pc2-node natively only handles static-bundle apps (web/wasm/data/
 *   microvm/agent — all served as files or sandboxed in the browser).
 *   Apps whose backend has to run on the host (e.g. Elastos Node
 *   Manager spawning ela-mainchain) had no managed lifecycle. This
 *   class provides one: install spawns, uninstall stops, crashes
 *   auto-restart with backoff, repeated crashes quarantine.
 *
 * Trust boundary
 *   A spawned service inherits pc2-node's user privileges. Service-type
 *   installs MUST be gated at the install-handler layer on a verified
 *   distribution.signature from a publisher in the trusted set. This
 *   class only spawns what it's told to spawn — it does not enforce
 *   trust. Wiring that gate is the install handler's responsibility.
 *
 * Lifecycle
 *   1. install handler calls processManager.start(name, manifest, dir)
 *   2. We spawn `node <entry>` with cwd=bundleDir, env merged from
 *      the manifest's `backend.env` plus PORT/APP_DATA_DIR/APP_BUNDLE_DIR
 *   3. Optional health check pings backend.healthCheck every 30s
 *   4. On exit: count the crash; if under threshold, schedule a backoff
 *      restart; if over threshold, mark quarantined and stop trying
 *   5. uninstall handler calls processManager.stop(name) — SIGTERM,
 *      grace, SIGKILL fallback
 *   6. pc2-node's own shutdown calls processManager.shutdown() to SIGTERM
 *      every managed child before pc2-node exits
 *   7. On pc2-node restart, processManager.hydrate() re-scans the DB
 *      for service-type apps and re-spawns each
 */

import { spawn, ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';

import { createLogger } from '../utils/logger.js';
import { DatabaseManager } from '../storage/database.js';
import { AppManifest } from './AppInstallService.js';

const log = createLogger('app-process');

// =============================================================================
// Types
// =============================================================================

export interface AppProcessStatus {
    /** App name from the manifest. */
    name: string;
    /** True iff the child process is currently spawned and not exited. */
    running: boolean;
    pid?: number;
    port?: number;
    /** Wall-clock ms when the process was spawned (NULL when stopped). */
    startedAt?: number;
    /** ms since startedAt at the time of the call. */
    uptimeMs?: number;
    /** Crash counter, lifetime — does not reset across pc2-node restarts. */
    crashCount: number;
    /** Wall-clock ms of the last successful health-check ping. NULL if never. */
    lastHealthOk?: number | null;
    /** Set when not-running due to quarantine (too many crashes). */
    lastFailureReason?: string;
}

export interface AppProcessManagerOpts {
    /** DB handle for runtime-state persistence. */
    db: DatabaseManager;
    /** Root dir where installed-app bundles live (manifest_json's bundle root). */
    appsDir: string;
    /**
     * Where each spawned service's stdout+stderr goes —
     * `<logsDir>/<app_name>.log`. Auto-created if missing.
     */
    logsDir: string;
    /** Health-check interval ms. Default 30 000 (30s). Pass 0 to disable. */
    healthCheckIntervalMs?: number;
    /**
     * Crash count within a rolling window that trips quarantine.
     * Default 3 — i.e. 3 crashes in a row before the runtime gives up.
     */
    crashThreshold?: number;
    /**
     * Initial restart delay ms. Each subsequent crash doubles up to
     * a cap of 32× this value. Default 2 000 → 2s, 4s, 8s, 16s, 32s.
     */
    restartBaseMs?: number;
    /** Override the spawn command. Defaults to "node". Tests use this. */
    nodeCmd?: string;
}

interface ProcessRecord {
    name: string;
    process: ChildProcess;
    startedAt: number;
    port: number;
    manifest: AppManifest;
    bundleDir: string;
    crashCount: number;
    lastHealthOk: number | null;
    healthTimer?: NodeJS.Timeout;
    restartTimer?: NodeJS.Timeout;
}

// =============================================================================
// Manager
// =============================================================================

const HEALTH_CHECK_TIMEOUT_MS = 5_000;
const SIGKILL_GRACE_MS_DEFAULT = 10_000;
const RESTART_DELAY_CAP_MULTIPLIER = 16;

export class AppProcessManager {
    private readonly db: DatabaseManager;
    private readonly appsDir: string;
    private readonly logsDir: string;
    private readonly healthCheckIntervalMs: number;
    private readonly crashThreshold: number;
    private readonly restartBaseMs: number;
    private readonly nodeCmd: string;

    private readonly running = new Map<string, ProcessRecord>();
    private readonly quarantined = new Set<string>();
    private shutdownInProgress = false;

    constructor(opts: AppProcessManagerOpts) {
        this.db = opts.db;
        this.appsDir = opts.appsDir;
        this.logsDir = opts.logsDir;
        this.healthCheckIntervalMs = opts.healthCheckIntervalMs ?? 30_000;
        this.crashThreshold = opts.crashThreshold ?? 3;
        this.restartBaseMs = opts.restartBaseMs ?? 2_000;
        this.nodeCmd = opts.nodeCmd ?? 'node';

        if (!existsSync(this.logsDir)) {
            mkdirSync(this.logsDir, { recursive: true });
        }
    }

    // --- Public API ---------------------------------------------------------

    /**
     * Spawn an installed service app. Idempotent: if the app is already
     * running, this is a no-op. Throws on quarantined apps and on
     * malformed manifests (defense-in-depth — the install handler's
     * validateManifest should have caught these earlier).
     */
    async start(name: string, manifest: AppManifest, bundleDir: string): Promise<void> {
        if (this.shutdownInProgress) {
            throw new Error(`AppProcessManager is shutting down; cannot start "${name}"`);
        }
        if (this.running.has(name)) {
            log.info(`[start] "${name}" already running, no-op`);
            return;
        }
        if (this.quarantined.has(name)) {
            throw new Error(`App "${name}" is quarantined after ${this.crashThreshold} repeated crashes`);
        }
        if (manifest.type !== 'service') {
            throw new Error(`App "${name}" is type="${manifest.type}", not "service"`);
        }
        const backend = manifest.backend;
        if (!backend) {
            throw new Error(`App "${name}" has type "service" but no backend block`);
        }

        const entryPath = resolvePath(bundleDir, backend.entry);
        if (!existsSync(entryPath)) {
            throw new Error(`Backend entry not found: ${entryPath}`);
        }

        // Open the per-app log file for append. spawn dups the fd so we
        // don't have to keep ours open after the child takes ownership.
        const logPath = join(this.logsDir, `${name}.log`);
        const logFd = openSync(logPath, 'a');

        // PC2 conventions every spawned service inherits — paths the service
        // can use to locate pc2-node's own state. Operator can override either
        // via process.env (pc2-node's own env). App author can override via
        // manifest.backend.env (rarely correct — these are typically set by
        // pc2-node's deployment).
        const dataDir = process.env.PC2_DATA_DIR || '/data';
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            // Where pc2-node's session DB lives. Services that need to
            // validate the requester's PC2 wallet (e.g. ENM's
            // OwnerCheckMiddleware) read it from here.
            PC2_NODE_DB_PATH:     process.env.PC2_NODE_DB_PATH     ?? join(dataDir, 'pc2-node.sqlite'),
            // Where pc2-node's owner record lives.
            PC2_NODE_CONFIG_PATH: process.env.PC2_NODE_CONFIG_PATH ?? join(dataDir, 'node-config.json'),
            // App-author overrides go after the conventions but before the
            // PORT/APP_*_DIR vars below — those are pc2-node-controlled and
            // an app must NOT override them.
            ...(backend.env ?? {}),
            PORT: String(backend.port),
            APP_DATA_DIR: join(bundleDir, '.data'),
            APP_BUNDLE_DIR: bundleDir,
        };

        const args = [entryPath, ...(backend.args ?? [])];

        log.info(`[start] spawning "${name}" — ${this.nodeCmd} ${entryPath} (port ${backend.port})`);
        const child = spawn(this.nodeCmd, args, {
            cwd: bundleDir,
            env,
            // stdio: stdin closed, stdout+stderr → log file fd
            stdio: ['ignore', logFd, logFd],
            // detached: false so the child dies with pc2-node if we crash
            detached: false,
        });

        const startedAt = Date.now();
        const record: ProcessRecord = {
            name,
            process: child,
            startedAt,
            port: backend.port,
            manifest,
            bundleDir,
            crashCount: this.priorCrashCount(name),
            lastHealthOk: null,
        };

        child.on('error', (err) => {
            log.error(`[${name}] spawn error: ${err.message}`);
            this.handleExit(record, -1, `spawn error: ${err.message}`);
        });

        child.on('exit', (code, signal) => {
            // SIGTERM is a clean stop we initiated; everything else is a crash.
            const reason = signal ? `killed by ${signal}` : `exit ${code}`;
            log.warn(`[${name}] ${reason}`);
            this.handleExit(record, code ?? -1, reason);
        });

        this.running.set(name, record);

        // Persist runtime state so /status + boot-hydrate see it.
        this.db.setAppRuntime(name, {
            pid: child.pid ?? null,
            port: backend.port,
            started_at: startedAt,
            crash_count: record.crashCount,
        });

        // Schedule periodic health check if the manifest declares one.
        if (backend.healthCheck && this.healthCheckIntervalMs > 0) {
            record.healthTimer = setInterval(
                () => { this.runHealthCheck(record).catch(() => { /* logged inside */ }); },
                this.healthCheckIntervalMs,
            );
            record.healthTimer.unref();
        }

        log.info(`[start] ✅ "${name}" running pid=${child.pid} port=${backend.port}`);
    }

    /**
     * Stop a running app: SIGTERM, wait `graceMs` (default 10 000), then
     * SIGKILL if still alive. Idempotent: returns immediately if not
     * running. Clears the auto-restart timer so a clean stop doesn't
     * trigger a respawn.
     */
    async stop(name: string, opts: { graceMs?: number } = {}): Promise<void> {
        const rec = this.running.get(name);
        if (!rec) {
            log.info(`[stop] "${name}" not running, no-op`);
            return;
        }

        const graceMs = opts.graceMs ?? SIGKILL_GRACE_MS_DEFAULT;
        log.info(`[stop] terminating "${name}" pid=${rec.process.pid}`);

        if (rec.healthTimer) clearInterval(rec.healthTimer);
        if (rec.restartTimer) clearTimeout(rec.restartTimer);

        // Remove from running BEFORE sending SIGTERM, so handleExit doesn't
        // misread the clean stop as a crash and try to auto-restart.
        this.running.delete(rec.name);

        await new Promise<void>((resolveP) => {
            const onExit = () => {
                clearTimeout(killTimer);
                resolveP();
            };
            rec.process.once('exit', onExit);

            try { rec.process.kill('SIGTERM'); } catch { /* already dead */ }

            const killTimer = setTimeout(() => {
                log.warn(`[stop] "${name}" did not exit after ${graceMs}ms; SIGKILL`);
                try { rec.process.kill('SIGKILL'); } catch { /* already dead */ }
            }, graceMs);
            killTimer.unref();
        });

        this.db.clearAppRuntime(name);
        log.info(`[stop] ✅ "${name}" stopped`);
    }

    /**
     * Stop, then start. Used by the install handler when the operator
     * upgrades a service app: extract the new bundle, then restart so
     * the new entry script runs.
     */
    async restart(name: string, manifest: AppManifest, bundleDir: string): Promise<void> {
        await this.stop(name);
        await this.start(name, manifest, bundleDir);
    }

    /** Snapshot of one app's process state. */
    getStatus(name: string): AppProcessStatus {
        const rec = this.running.get(name);
        if (!rec) {
            const base: AppProcessStatus = {
                name,
                running: false,
                crashCount: this.priorCrashCount(name),
            };
            if (this.quarantined.has(name)) {
                base.lastFailureReason = `quarantined: crashed ${this.crashThreshold}× — manual restart required`;
            }
            return base;
        }
        return {
            name,
            running: true,
            pid: rec.process.pid,
            port: rec.port,
            startedAt: rec.startedAt,
            uptimeMs: Date.now() - rec.startedAt,
            crashCount: rec.crashCount,
            lastHealthOk: rec.lastHealthOk,
        };
    }

    /** Snapshot of every currently-running app. */
    list(): AppProcessStatus[] {
        return Array.from(this.running.keys()).map((n) => this.getStatus(n));
    }

    /**
     * Lift the quarantine flag and reset the crash counter. Intended for
     * an explicit "Try to start it again" button in the launcher UI
     * after the operator has investigated whatever was crashing.
     */
    clearQuarantine(name: string): void {
        this.quarantined.delete(name);
        this.db.setAppRuntime(name, { pid: null, port: null, started_at: null, crash_count: 0 });
        log.info(`[quarantine] cleared for "${name}"`);
    }

    /**
     * Re-spawn every service-type app marked installed in the DB.
     * Called once at pc2-node boot (via the install-handler's wiring),
     * so a pc2-node restart brings managed services back up.
     */
    async hydrate(): Promise<void> {
        const apps = this.db.listInstalledApps();
        for (const app of apps) {
            let manifest: AppManifest;
            try {
                manifest = JSON.parse(app.manifest_json) as AppManifest;
            } catch (err: any) {
                log.warn(`[hydrate] skip "${app.app_name}" — manifest_json parse error: ${err.message}`);
                continue;
            }
            if (manifest.type !== 'service') continue;

            const bundleDir = join(this.appsDir, app.app_name);
            try {
                await this.start(app.app_name, manifest, bundleDir);
            } catch (err: any) {
                log.error(`[hydrate] failed to start "${app.app_name}": ${err.message}`);
                // continue with the next app; one failure shouldn't block all
            }
        }
    }

    /**
     * SIGTERM all managed processes with a tight grace window. Called
     * from pc2-node's own shutdown handler before it tears down the
     * server / db. Marks the manager as shutting down so any in-flight
     * auto-restart timers no-op.
     */
    async shutdown(): Promise<void> {
        if (this.shutdownInProgress) return;
        this.shutdownInProgress = true;
        log.info(`[shutdown] stopping ${this.running.size} managed app(s)`);
        const stops = Array.from(this.running.keys()).map((n) =>
            this.stop(n, { graceMs: 5_000 }).catch((err) => {
                log.warn(`[shutdown] ${n}: ${err.message}`);
            }),
        );
        await Promise.all(stops);
        log.info(`[shutdown] done`);
    }

    // --- Private ------------------------------------------------------------

    /**
     * Read the persisted crash counter for an app. Lets a fresh-spawn
     * inherit the count from a previous pc2-node session so quarantine
     * thresholds aren't reset on every pc2-node restart.
     */
    private priorCrashCount(name: string): number {
        const row = this.db.getInstalledApp(name);
        return row?.crash_count ?? 0;
    }

    /**
     * Crash handler: count the crash, persist, decide to quarantine or
     * schedule an auto-restart with exponential backoff.
     */
    private handleExit(rec: ProcessRecord, code: number, reason: string): void {
        if (this.shutdownInProgress) return;
        // If a clean stop already removed the record, nothing to do.
        if (!this.running.has(rec.name)) return;

        this.running.delete(rec.name);
        if (rec.healthTimer) clearInterval(rec.healthTimer);

        rec.crashCount++;
        log.warn(`[${rec.name}] crashed (${reason}) — count=${rec.crashCount}`);

        this.db.setAppRuntime(rec.name, {
            pid: null,
            port: null,
            started_at: null,
            crash_count: rec.crashCount,
        });

        if (rec.crashCount >= this.crashThreshold) {
            log.error(`[${rec.name}] crashed ${rec.crashCount}× — quarantining; manual clearQuarantine() required`);
            this.quarantined.add(rec.name);
            return;
        }

        // Exponential backoff: base, 2×, 4×, 8×, 16× — capped at 16× base
        const multiplier = Math.min(1 << (rec.crashCount - 1), RESTART_DELAY_CAP_MULTIPLIER);
        const delay = this.restartBaseMs * multiplier;
        log.info(`[${rec.name}] auto-restart in ${delay}ms`);

        rec.restartTimer = setTimeout(() => {
            // After the wait, re-call start() with a fresh record. Pass
            // the same manifest + bundleDir; the previous record's
            // crashCount has already been persisted via setAppRuntime,
            // so priorCrashCount() will read it back when start()
            // builds the new record.
            this.start(rec.name, rec.manifest, rec.bundleDir).catch((err: Error) => {
                log.error(`[${rec.name}] auto-restart failed: ${err.message}`);
            });
        }, delay);
        rec.restartTimer.unref();
    }

    /**
     * Run one health-check ping. Updates lastHealthOk on success, logs
     * on failure. Failures alone don't trigger a restart — only a
     * process exit does.
     */
    private async runHealthCheck(rec: ProcessRecord): Promise<void> {
        const path = rec.manifest.backend?.healthCheck;
        if (!path) return;
        const url = `http://127.0.0.1:${rec.port}${path}`;
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), HEALTH_CHECK_TIMEOUT_MS);
        try {
            const res = await fetch(url, { signal: ctl.signal });
            if (res.ok) {
                rec.lastHealthOk = Date.now();
            } else {
                log.warn(`[${rec.name}] health check ${url} returned ${res.status}`);
            }
        } catch (err: any) {
            log.warn(`[${rec.name}] health check failed: ${err.message ?? String(err)}`);
        } finally {
            clearTimeout(timer);
        }
    }
}
