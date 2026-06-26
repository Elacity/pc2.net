/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmStorageMaintenance — beta.3.20 (Phase 3).
 *
 * Periodic background tasks that keep an ENM-managed BPoS supernode's
 * disk under control without operator intervention. Per operator
 * directive #4 ("no manual, everything should be automatic for the
 * user"), this module exposes NO routes — it just runs on a timer
 * after server boot.
 *
 * Two responsibilities, scheduled together so they share one timer:
 *
 *   1. Log compaction + retention. Calls LogCompactor.compactNow on
 *      a 24h cadence for every chain in the registry. Gzips files
 *      older than cfg.global.logRotation.gzipAfterDays (default 7)
 *      and deletes *.gz older than logRotation.purgeAfterDays
 *      (default 30 — was 90 in LogCompactor's defaults; Phase 3
 *      tightens to 30 to match what operators actually need on a
 *      typical 100 GB volume).
 *
 *   2. Keystore auto-backup. Copies chains/mainchain/keystore.dat to
 *      ${PC2_DATA_DIR}/backups/elastos-node-manager/keystore-<ISO>.dat
 *      on a configurable interval (default every 7 days). Keeps the
 *      most recent N backups (default 4) and deletes the rest. This
 *      mirrors the same backup convention used by the loopback-only
 *      /teardown route — restore is "copy the .dat file back into
 *      keystore.dat before starting ENM".
 *
 * The keystore backup runs ONLY if a keystore exists; on a fresh
 * install before setup, the task is a no-op. The backup interval is
 * tracked in cfg.global.backup.lastKeystoreBackupAt so the cadence
 * survives ENM restarts.
 *
 * Scheduling: first sweep 90 s after boot (past the reattach window),
 * then every 24 h. The 24 h cadence is right for both log compaction
 * (file-system churn) and keystore backup (the keystore changes only
 * on rare setup operations).
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const { ENM_LOG_PREFIX } = require('./EnmConstants');
const ConfigStore = require('./ConfigStore');
const LogCompactor = require('./LogCompactor');
const { chainDir, enmDataDir } = require('./DataDir');

// v0.5.194 — hourly (was 24h) so rotated chain logs are gzipped promptly,
// closer to node.sh's */10 compress_log cron. The keystore backup shares this
// timer but stays gated by its own multi-day interval, so it does not over-run.
const TICK_MS = 60 * 60 * 1000;
const BOOT_DELAY_MS = 90 * 1000;

// v0.5.194 — gzip rotated logs after 1 day (was 7). mtime-based, so the active
// log file is never touched; this just stops up to a week of inactive rotated
// logs sitting uncompressed (node.sh gzips all-but-newest every 10 min).
const DEFAULT_GZIP_AFTER_DAYS = 1;
const DEFAULT_PURGE_AFTER_DAYS = 30;
const DEFAULT_KEYSTORE_INTERVAL_DAYS = 7;
const DEFAULT_KEYSTORE_KEEP = 4;

const KEYSTORE_FILENAME = 'keystore.dat';

class EnmStorageMaintenance {
    /**
     * @param {object} deps
     * @param {object} deps.extensionHandle  same shape main.js builds
     * @param {() => Array<{chainId:string}>} deps.listChains
     *        callback that returns the currently-registered chains
     *        (typically `() => ChainRegistry.listChains()`)
     */
    constructor(deps) {
        this.extensionHandle = deps.extensionHandle;
        this.listChains = deps.listChains;
        this._timer = null;
        this._bootTimer = null;
        this._running = false;
    }

    start() {
        if (this._running) { return; }
        this._running = true;
        const self = this;
        this._bootTimer = setTimeout(function () {
            self._bootTimer = null;
            self._tick().catch(self._logErr('boot tick'));
            self._timer = setInterval(function () {
                self._tick().catch(self._logErr('periodic tick'));
            }, TICK_MS);
        }, BOOT_DELAY_MS);
        this._log('info', `EnmStorageMaintenance started — first sweep in ${BOOT_DELAY_MS / 1000}s, then every ${TICK_MS / 3_600_000}h`);
    }

    stop() {
        if (!this._running) { return; }
        this._running = false;
        if (this._bootTimer) {
            clearTimeout(this._bootTimer);
            this._bootTimer = null;
        }
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    }

    /**
     * Run a single sweep right now (used by tests + by the boot timer's
     * first fire). Catches everything internally so a single failure
     * doesn't stop subsequent sweeps.
     */
    async _tick() {
        const cfg = await this._loadConfigSafe();
        if (!cfg) { return; }

        await this._compactLogs(cfg);
        await this._backupKeystoreIfDue(cfg);
    }

    /** @private */
    async _compactLogs(cfg) {
        const gz = (cfg.global && cfg.global.logRotation
                    && cfg.global.logRotation.gzipAfterDays);
        const pg = (cfg.global && cfg.global.logRotation
                    && cfg.global.logRotation.purgeAfterDays);
        const gzipAfterDays = Number.isFinite(gz) ? gz : DEFAULT_GZIP_AFTER_DAYS;
        const purgeAfterDays = Number.isFinite(pg) ? pg : DEFAULT_PURGE_AFTER_DAYS;

        const chains = (typeof this.listChains === 'function')
            ? (this.listChains() || [])
            : [];
        for (const c of chains) {
            const chainId = c && c.chainId;
            if (!chainId) { continue; }
            try {
                const report = await LogCompactor.compactNow({
                    chainId,
                    gzipAfterDays,
                    purgeAfterDays,
                    logger: this.extensionHandle.log,
                });
                if (report && (report.gzipped > 0 || report.purged > 0)) {
                    this._log('info',
                        `log compact ${chainId}: gzipped=${report.gzipped} purged=${report.purged} freed=${formatMb(report.bytesFreed)}`);
                }
            } catch (err) {
                this._log('warn', `log compact ${chainId} failed: ${err.message || err}`);
            }
        }
    }

    /** @private */
    async _backupKeystoreIfDue(cfg) {
        const intervalDays = readNumber(cfg, ['global', 'backup', 'keystoreIntervalDays'],
            DEFAULT_KEYSTORE_INTERVAL_DAYS);
        const keepCount = readNumber(cfg, ['global', 'backup', 'keystoreKeepCount'],
            DEFAULT_KEYSTORE_KEEP);

        const src = path.join(chainDir('mainchain'), KEYSTORE_FILENAME);
        if (!fs.existsSync(src)) {
            // Pre-setup: nothing to back up. Don't log every 24h about
            // it — operators in setup mode don't care.
            return;
        }

        const lastAt = readNumber(cfg, ['global', 'backup', 'lastKeystoreBackupAt'], 0);
        const dueAtMs = lastAt + intervalDays * 24 * 60 * 60 * 1000;
        if (Date.now() < dueAtMs) {
            return;
        }

        // Mirror the /teardown convention: PC2_DATA_DIR/backups/elastos-
        // node-manager/keystore-<ISO>.dat at mode 0600.
        const pc2Data = process.env.PC2_DATA_DIR || path.dirname(path.dirname(enmDataDir()));
        const backupRoot = path.join(pc2Data, 'backups', 'elastos-node-manager');
        try {
            fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
        } catch (err) {
            this._log('warn', `keystore backup: mkdir ${backupRoot} failed: ${err.message}`);
            return;
        }

        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const dst = path.join(backupRoot, `keystore-${ts}.dat`);
        try {
            fs.copyFileSync(src, dst);
            fs.chmodSync(dst, 0o600);
            this._log('info', `keystore auto-backup: ${dst}`);
        } catch (err) {
            this._log('warn', `keystore backup copyFileSync failed: ${err.message}`);
            return;
        }

        // Trim oldest backups beyond keepCount.
        try {
            await this._trimBackups(backupRoot, keepCount);
        } catch (err) {
            this._log('warn', `keystore backup trim failed: ${err.message}`);
        }

        // Persist last-backup timestamp + path so the UI can show
        // "last backup: X days ago".
        try {
            // P0-7 (v0.5.179) — atomic RMW so this 24h timer's timestamp write
            // can't clobber a concurrent operator config save.
            await ConfigStore.update((fresh) => {
                fresh.global = fresh.global || {};
                fresh.global.backup = fresh.global.backup || {};
                fresh.global.backup.lastKeystoreBackupAt = Date.now();
                fresh.global.backup.lastKeystoreBackupPath = dst;
            }, { logger: this.extensionHandle.log });
        } catch (err) {
            this._log('warn', `keystore backup: persisting timestamp failed: ${err.message}`);
        }
    }

    /** @private */
    async _trimBackups(dir, keep) {
        let entries;
        try {
            entries = await fsp.readdir(dir);
        } catch (_) { return; }
        const files = entries
            .filter((n) => /^keystore-.*\.dat$/.test(n))
            .map((n) => path.join(dir, n));
        if (files.length <= keep) { return; }
        // Sort newest-first by mtime, then drop everything after `keep`.
        const stats = await Promise.all(files.map(async (f) => {
            try {
                const s = await fsp.stat(f);
                return { f, mtime: s.mtimeMs };
            } catch (_) {
                return { f, mtime: 0 };
            }
        }));
        stats.sort((a, b) => b.mtime - a.mtime);
        const toDelete = stats.slice(keep);
        for (const e of toDelete) {
            try {
                await fsp.unlink(e.f);
                this._log('info', `keystore backup pruned: ${e.f}`);
            } catch (err) {
                this._log('warn', `keystore backup prune ${e.f} failed: ${err.message}`);
            }
        }
    }

    /** @private */
    async _loadConfigSafe() {
        try { return await ConfigStore.load(); }
        catch (err) {
            this._log('warn', `config load failed: ${err.message}`);
            return null;
        }
    }

    /** @private */
    _log(level, msg) {
        const fn = this.extensionHandle
            && this.extensionHandle.log
            && this.extensionHandle.log[level];
        if (typeof fn === 'function') {
            fn(`${ENM_LOG_PREFIX} StorageMaintenance: ${msg}`);
        }
    }

    /** @private */
    _logErr(label) {
        const self = this;
        return function (err) {
            self._log('error', `${label}: ${err && err.stack || err}`);
        };
    }
}

function readNumber(obj, pathArr, fallback) {
    let cur = obj;
    for (const seg of pathArr) {
        if (cur == null || typeof cur !== 'object') { return fallback; }
        cur = cur[seg];
    }
    return Number.isFinite(cur) ? cur : fallback;
}

function formatMb(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) { return '0 MB'; }
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

module.exports = {
    EnmStorageMaintenance,
    DEFAULT_GZIP_AFTER_DAYS,
    DEFAULT_PURGE_AFTER_DAYS,
    DEFAULT_KEYSTORE_INTERVAL_DAYS,
    DEFAULT_KEYSTORE_KEEP,
};
