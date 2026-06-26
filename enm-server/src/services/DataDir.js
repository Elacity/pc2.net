/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * DataDir — extension's on-disk paths.
 *
 * Layout under PC2's data dir:
 *   ${PC2_DATA_DIR}/extensions/elastos-node-manager/
 *     ├── encryption.key                    # AES-256 master key (mode 0600)
 *     ├── config.json                       # operator-edited config (encrypted fields)
 *     ├── config.json.bak                   # previous version (atomic-write rollback)
 *     ├── chains/
 *     │   └── mainchain/
 *     │       ├── config.json               # generated for ela process
 *     │       ├── keystore.dat              # operator-imported (mode 0600, we never generate)
 *     │       ├── keystore-password.enc     # AES-encrypted, decrypted at spawn
 *     │       └── elastos/                  # ela's data dir (chain DB + logs)
 *     │           ├── data/                 # block files
 *     │           ├── logs/{node,dpos}/     # rotated by ela itself
 *     │           └── checkpoints/
 *     └── run/
 *         └── ela-mainchain.pid             # PID of running ela process
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');

const { ENM_NAME } = require('./EnmConstants');

/**
 * Resolve PC2's data dir. PC2 sets process.env.PC2_DATA_DIR or defaults to ./data
 * (per pc2-node Dockerfile). We never hard-code an absolute path.
 *
 * @returns {string}
 */
function pc2DataDir() {
    return process.env.PC2_DATA_DIR || path.resolve(process.cwd(), 'data');
}

/**
 * Our data dir, ensured to exist on first call.
 *
 * Resolution order (highest priority first):
 *   1. ENM_DATA_DIR — what the operator's docker-compose sets, mapped onto a
 *      bind-mounted volume (e.g. /data/enm). This is THE production path.
 *   2. PC2_DATA_DIR + extensions/elastos-node-manager — back-compat from the
 *      Puter-extension days when ENM lived inside PC2's data tree.
 *   3. ./data/extensions/elastos-node-manager — last-resort fallback for a
 *      developer running enm-server outside docker. Drops into the cwd.
 *
 * Why this matters: in the deployed setup the docker-compose mounts
 * ./enm-data:/data/enm and exports ENM_DATA_DIR=/data/enm. If we ignore that
 * env var and just use the Puter-extension path, every artifact (downloaded
 * binary, keystore, chain data, PID files) lands inside the container's
 * ephemeral writable layer instead of the bind-mounted volume — so a
 * `docker compose down` wipes everything.
 *
 * @returns {string}
 */
function enmDataDir() {
    const dir = process.env.ENM_DATA_DIR
        ? process.env.ENM_DATA_DIR
        : path.join(pc2DataDir(), 'extensions', ENM_NAME);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
}

/**
 * Per-chain data dir. Currently only 'mainchain' for v0.1.
 *
 * @param {string} chainId
 * @returns {string}
 */
function chainDir(chainId) {
    if (!chainId || typeof chainId !== 'string') {
        throw new Error('DataDir.chainDir: chainId required');
    }
    if (!/^[a-z0-9-]+$/.test(chainId)) {
        // Defence against path traversal — chainId is operator-influenced via config.
        throw new Error(`DataDir.chainDir: invalid chainId "${chainId}"`);
    }
    const dir = path.join(enmDataDir(), 'chains', chainId);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
}

/**
 * Run-state dir for PID files and other transient process state.
 *
 * @returns {string}
 */
function runDir() {
    const dir = path.join(enmDataDir(), 'run');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
}

/** PID file path for a given chain. */
function pidFilePath(chainId) {
    return path.join(runDir(), `ela-${chainId}.pid`);
}

/**
 * Per-chain stdout/stderr sink file. NativeProcessService appends every
 * child's stdout+stderr here; routes/logs.js tails it for the HTTP log
 * viewer. Single source of truth so the writer (Part A) and reader (Part B)
 * cannot drift.
 *
 * Mirrors node.sh, which writes each non-ela process to
 * $SCRIPT_PATH/<chain>/logs/<chain>-...log (build/skeleton/node.sh:2169,
 * 2386, 3603 for esc/pg/oracle; arbiter/ela use `2>output` at :4963/:878).
 * ela mainchain ALSO self-writes a richer structured log under
 * elastos/logs/node/ via its own logger — the tail handler prefers that
 * native log for mainchain and uses this sink for every other chain.
 *
 * Lives under chains/<id>/logs/ (NOT elastos/logs/node which ela owns).
 * Growth is bounded by NativeProcessService's size-based rotation (0.5.165 —
 * C23): the active <id>.log is rotated to <id>.log.1 at LOG_SINK_ROTATE_BYTES
 * with retention=1, hard-capping disk to ~2× that per chain regardless of
 * write rate. (LogCompactor sweeps the 'logs' subdir too, but only gzips
 * names ending in '.log' — the active file rarely goes stale while live and
 * '.log.1' is skipped — so rotation, not compaction, is the real bound.)
 *
 * @param {string} chainId
 * @returns {string}
 */
function chainLogSinkPath(chainId) {
    return path.join(chainDir(chainId), 'logs', `${chainId}.log`);
}

/**
 * v0.5.168 (Phase 2) — the embedded-SPV log directory for an EVM sidechain.
 * The geth fork (esc/eid/pg) runs its light-client SPV module against its
 * --datadir (chains/<id>/data) and writes SPV logs under data/logs-spv (the
 * node.sh layout). The SPV Module view (GET /spv/:id/logs) tails the newest
 * file here to surface per-chain SPV evidence. Returns the path even when it
 * doesn't exist yet — callers fs-check before reading. Distinct from
 * chainLogSinkPath() (the process stdout/stderr sink under chains/<id>/logs).
 *
 * @param {string} chainId
 * @returns {string}
 */
function chainSpvLogDir(chainId) {
    return path.join(chainDir(chainId), 'data', 'logs-spv');
}

/** Master encryption key path. */
function encryptionKeyPath() {
    return path.join(enmDataDir(), 'encryption.key');
}

/** Main extension config (separate from generated chain config.json). */
function configPath() {
    return path.join(enmDataDir(), 'config.json');
}

/** Backup of previous config (atomic-write rollback target). */
function configBackupPath() {
    return `${configPath()}.bak`;
}

/**
 * Atomic write: write to .tmp, then rename. POSIX rename is atomic; the file at
 * the target path is either the old version or the new — never half-written.
 *
 * @param {string} target absolute path
 * @param {string|Buffer} contents
 * @param {object} [opts] optional { mode } — defaults to 0o600
 * @returns {Promise<void>}
 */
async function atomicWrite(target, contents, opts) {
    const mode = (opts && typeof opts.mode === 'number') ? opts.mode : 0o600;
    // P0-9 (v0.5.178) — collision-safe temp name. `pid + Date.now()` alone
    // collides when two writes to the SAME target land in the same millisecond
    // (one truncates the other; the loser's rename then ENOENTs). Random entropy
    // makes the temp path unique per call.
    const tmp = `${target}.tmp.${process.pid}.${Date.now()}.${crypto.randomBytes(6).toString('hex')}`;
    const dir = path.dirname(target);
    // Ensure the parent dir exists. Only swallow EEXIST — masking EACCES/ENOSPC
    // here turns a real failure into an opaque ENOENT from the write below.
    try {
        await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    } catch (err) {
        if (err.code !== 'EEXIST') { throw err; }
    }
    // P0-9 — fsync the temp file's DATA before the rename. POSIX rename is atomic
    // w.r.t. ordering but NOT durability: on power loss the rename can be journaled
    // while the temp's data blocks are not yet flushed → a zero-length/truncated
    // file at the target (a bricked config.json). Sync the fd, rename, then sync the
    // parent dir so the rename (directory entry) is itself durable.
    let fh;
    try {
        fh = await fsp.open(tmp, 'w', mode);
        await fh.writeFile(contents);
        await fh.sync();
    } finally {
        if (fh) { await fh.close(); }
    }
    await fsp.rename(tmp, target);
    // Enforce mode even when the target pre-existed with looser perms — the temp's
    // mode only governs the new inode, so a previously world-readable secret would
    // otherwise keep its perms. Cheap + idempotent.
    await fsp.chmod(target, mode).catch(() => {});
    // Durably persist the directory entry created by the rename. Best-effort: some
    // platforms reject O_RDONLY dir fsync; the temp-fd fsync above already covers
    // the file contents, so this only further hardens the rename's durability.
    let dh;
    try {
        dh = await fsp.open(dir, 'r');
        await dh.sync();
    } catch (_) {
        /* dir fsync unsupported here — acceptable */
    } finally {
        if (dh) { await dh.close().catch(() => {}); }
    }
}

module.exports = {
    pc2DataDir,
    enmDataDir,
    chainDir,
    runDir,
    pidFilePath,
    chainLogSinkPath,
    chainSpvLogDir,
    encryptionKeyPath,
    configPath,
    configBackupPath,
    atomicWrite,
};
