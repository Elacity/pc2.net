/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * ConfigStore — load/save the extension's config file.
 *
 * Responsibilities:
 *   - Atomic write via temp + rename (DataDir.atomicWrite, mode 0600)
 *   - Backup-on-write (config.json.bak from previous version) for F9 rollback
 *   - Joi validation on load + save (rejects typos, missing fields)
 *   - RPC password encryption (AES-256-GCM via EnmEncryption)
 *   - In-process cache invalidated on file mtime change
 *
 * The on-disk shape matches EnmConfigSchema. Sensitive fields:
 *   chains.mainchain.rpc.passwordEncrypted   — AES-GCM envelope (string)
 * The plaintext password never lives in the config — only the envelope.
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');

const { ENM_LOG_PREFIX } = require('./EnmConstants');
const { configPath, configBackupPath, atomicWrite } = require('./DataDir');
const { validate, defaultConfig } = require('./EnmConfigSchema');
const { encrypt, decrypt } = require('./EnmEncryption');

/** @type {{ value: object, mtimeMs: number }|null} */
let cache = null;

// P0-7 (v0.5.179) — serialize config writes. ~15+ callers across routes AND
// background timers (HealthChecker, SelfHealingEngine, StorageMaintenance,
// autostart, adapters) each do load()→mutate→save() with no coordination. A
// timer's save interleaving an operator's save → last-write-wins → the
// operator's change silently vanishes. This promise-chain mutex serializes all
// writes; update() runs the FULL read-modify-write under the lock so concurrent
// writers each see the prior one's result instead of a stale snapshot.
let writeChain = Promise.resolve();
function withConfigWriteLock(fn) {
    const run = writeChain.then(fn, fn);
    // Keep the chain alive regardless of this op's outcome (swallow here only;
    // the real result/rejection is returned to the caller via `run`).
    writeChain = run.then(() => {}, () => {});
    return run;
}

/**
 * Read the config from disk. Returns the default config (with setup.completed
 * = false) if no file exists yet — so the setup wizard can populate it.
 *
 * @returns {Promise<object>} validated, default-filled config
 */
async function load() {
    const filePath = configPath();
    let stat;
    try {
        stat = await fsp.stat(filePath);
    } catch (err) {
        if (err.code === 'ENOENT') {
            return defaultConfig();
        }
        throw err;
    }

    if (cache && cache.mtimeMs === stat.mtimeMs) {
        return cache.value;
    }

    const raw = await fsp.readFile(filePath, 'utf8');
    let validated;
    try {
        validated = validate(JSON.parse(raw));
    } catch (err) {
        // P0-8 (v0.5.178) — the main config is unreadable (corrupt JSON or fails
        // schema validation). Throwing here bricks startup: the server can't read
        // its config → won't boot → manual file repair on every affected node.
        // Instead recover from the last-good `.bak` that save() keeps. Only throw
        // if the backup is also unusable.
        return _recoverFromBackup(filePath, err);
    }
    cache = { value: validated, mtimeMs: stat.mtimeMs };
    return validated;
}

/**
 * P0-8 — restore config from the `.bak` when the main file is corrupt/invalid.
 * Returns the recovered (validated) config or throws if the backup is also
 * unusable. Rewrites the main file from the good backup so subsequent boots
 * don't re-trigger recovery.
 *
 * @param {string} filePath  the (corrupt) main config path
 * @param {Error}  originalErr  why the main file failed
 * @returns {Promise<object>}
 */
async function _recoverFromBackup(filePath, originalErr) {
    const bakPath = configBackupPath();
    let bakRaw;
    try {
        bakRaw = await fsp.readFile(bakPath, 'utf8');
    } catch (bakErr) {
        throw new Error(
            `${ENM_LOG_PREFIX} ConfigStore.load: ${filePath} is corrupt (${originalErr.message}) `
            + `and no usable backup exists at ${bakPath} (${bakErr.code || bakErr.message}). `
            + 'Manual recovery required.',
        );
    }
    let validated;
    try {
        validated = validate(JSON.parse(bakRaw));
    } catch (bakErr) {
        throw new Error(
            `${ENM_LOG_PREFIX} ConfigStore.load: ${filePath} is corrupt (${originalErr.message}) AND `
            + `the backup ${bakPath} is also unusable (${bakErr.message}). Manual recovery required.`,
        );
    }
    // Loud, because this is a brick-avoidance event operators/logs must see.
    // eslint-disable-next-line no-console
    console.error(
        `${ENM_LOG_PREFIX} ConfigStore.load: ${filePath} was corrupt (${originalErr.message}); `
        + `recovered from backup ${bakPath}.`,
    );
    try {
        await atomicWrite(filePath, JSON.stringify(validated, null, 2));
    } catch (writeErr) {
        // Could not rewrite the main file (e.g. read-only fs). Still run on the
        // recovered config in memory rather than refusing to boot.
        // eslint-disable-next-line no-console
        console.error(
            `${ENM_LOG_PREFIX} ConfigStore.load: recovered from backup but could not rewrite `
            + `${filePath} (${writeErr.message}); running on backup contents in memory.`,
        );
        cache = null;
        return validated;
    }
    const newStat = await fsp.stat(filePath).catch(() => null);
    cache = newStat ? { value: validated, mtimeMs: newStat.mtimeMs } : null;
    return validated;
}

/**
 * Save the config atomically. Creates a `.bak` of the previous version (used
 * by the F9 rollback path).
 *
 * @param {object} next
 * @param {object} [opts]
 * @param {{ warn?: (msg: string) => void }} [opts.logger]
 *   Optional logger for non-fatal warnings (e.g., backup write failure). Pass
 *   `extensionHandle.log` from a route handler. Defaults to a silent logger so
 *   tests and stand-alone callers don't pollute stderr.
 * @returns {Promise<void>}
 */
async function save(next, opts) {
    // Serialize the write so two concurrent saves can't interleave their
    // backup+atomicWrite steps. (Lost-update protection for the FULL
    // read-modify-write lives in update() below — prefer it for new code.)
    return withConfigWriteLock(() => _saveInner(next, opts));
}

/** @private — the actual save, run only while holding withConfigWriteLock. */
async function _saveInner(next, opts) {
    const filePath = configPath();
    const validated = validate(next);
    const logger = (opts && opts.logger) || SILENT_LOGGER;

    // 1. Backup the existing file (best-effort — first save has no backup).
    //    Use atomicWrite so a container kill mid-backup can't leave a
    //    half-written .bak that breaks the next rollback() attempt.
    try {
        const current = await fsp.readFile(filePath, 'utf8');
        await atomicWrite(configBackupPath(), current);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            // We don't abort save on backup failure — that would prevent recovery
            // from a corrupted .bak. Log via the supplied extension logger and continue.
            logger.warn(`${ENM_LOG_PREFIX} ConfigStore.save: backup failed: ${err.message}`);
        }
    }

    // 2. Atomic write.
    const serialized = JSON.stringify(validated, null, 2);
    await atomicWrite(filePath, serialized);

    // 3. Refresh cache.
    const stat = await fsp.stat(filePath);
    cache = { value: validated, mtimeMs: stat.mtimeMs };
}

const SILENT_LOGGER = Object.freeze({
    warn() { /* intentionally silent — see save()'s logger param */ },
});

/**
 * P0-7 — atomic read-modify-write. Runs load() → mutatorFn(cfg) → save() while
 * holding the write lock, so concurrent writers serialize and each sees the
 * prior one's committed state (no lost updates). Prefer this over a bare
 * load()+save() pair anywhere config is mutated.
 *
 * @param {(cfg: object) => void|Promise<void>} mutatorFn  mutates cfg in place
 * @param {object} [opts]  forwarded to save() (e.g. { logger })
 * @returns {Promise<object>} the saved (validated) config
 */
async function update(mutatorFn, opts) {
    if (typeof mutatorFn !== 'function') {
        throw new TypeError('ConfigStore.update: mutatorFn function required');
    }
    return withConfigWriteLock(async () => {
        const cfg = await load();        // fresh under the lock (sees prior saves)
        await mutatorFn(cfg);            // mutate in place (may be async)
        await _saveInner(cfg, opts);
        return cfg;
    });
}

/**
 * Rollback to the previous version. Returns the restored config or null if
 * no backup exists.
 *
 * @returns {Promise<object|null>}
 */
async function rollback() {
    const bakPath = configBackupPath();
    let raw;
    try {
        raw = await fsp.readFile(bakPath, 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') {
            return null;
        }
        throw err;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error(`${ENM_LOG_PREFIX} ConfigStore.rollback: corrupted backup at ${bakPath}: ${err.message}`);
    }
    const validated = validate(parsed);
    await atomicWrite(configPath(), JSON.stringify(validated, null, 2));
    cache = null; // force re-read
    return validated;
}

/**
 * Encrypt and store an RPC password. Mutates a chain's rpc.passwordEncrypted
 * field. Caller is responsible for save()-ing the result.
 *
 * @param {object} chainConfig  e.g. config.chains.mainchain
 * @param {string} plaintext
 */
function setRpcPassword(chainConfig, plaintext) {
    if (!chainConfig || typeof chainConfig !== 'object') {
        throw new TypeError('ConfigStore.setRpcPassword: chainConfig required');
    }
    if (typeof plaintext !== 'string' || plaintext.length === 0) {
        throw new TypeError('ConfigStore.setRpcPassword: non-empty plaintext required');
    }
    if (!chainConfig.rpc) {
        chainConfig.rpc = {};
    }
    chainConfig.rpc.passwordEncrypted = encrypt(plaintext);
}

/**
 * Decrypt the RPC password for a chain. Used by NativeProcessService just
 * before generating the chain's own config.json.
 *
 * @param {object} chainConfig
 * @returns {string} plaintext
 */
function getRpcPassword(chainConfig) {
    if (!chainConfig || !chainConfig.rpc || typeof chainConfig.rpc.passwordEncrypted !== 'string') {
        throw new Error('ConfigStore.getRpcPassword: rpc.passwordEncrypted is missing');
    }
    return decrypt(chainConfig.rpc.passwordEncrypted);
}

/** @internal — for tests only */
function _resetCacheForTests() {
    cache = null;
    try {
        fs.unlinkSync(configPath());
    } catch (err) { if (err.code !== 'ENOENT') throw err; }
    try {
        fs.unlinkSync(configBackupPath());
    } catch (err) { if (err.code !== 'ENOENT') throw err; }
}

module.exports = {
    load,
    save,
    update,
    rollback,
    setRpcPassword,
    getRpcPassword,
    _resetCacheForTests,
};
