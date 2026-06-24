/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmKeystoreIdentity — beta.3.43. Settings → Identity tab backend.
 *
 * Wraps the existing EnmKeystoreService primitives (create / readAccount
 * / archive / exists) into operator-facing identity flows:
 *
 *   unlock(chainId, password)
 *     Smoke-test the password against the on-disk keystore via
 *     `ela-cli wallet account -p`. On success, write keystore-
 *     account.json so the dashboard renders the pubkey + address
 *     without future password prompts. The password is discarded —
 *     never written to disk, never logged, never echoed.
 *
 *   readBackup(chainId)
 *     Stream the current keystore.dat for download. No password
 *     needed — the file IS encrypted at rest, the download is just a
 *     copy. Caller is responsible for keeping the off-server backup
 *     safe.
 *
 *   importKeystore(chainId, fileBuffer, password)
 *     Validate fileBuffer is a real keystore (smoke-test via
 *     readAccount), stop chain, archive existing keystore, write
 *     fileBuffer to keystore.dat, chmod 0600, refresh identity cache,
 *     restart chain. If any step after the archive fails we leave the
 *     archive in place — operator can manually rename it back.
 *
 *   resetKeystore(chainId)
 *     Stop chain, archive existing keystore, ela-cli wallet create with
 *     a generated 32-char password, refresh identity cache, restart
 *     chain. Returns the generated password ONCE in the response —
 *     caller is responsible for showing it + getting an ack from the
 *     operator before the response is discarded. Mirrors the wizard's
 *     Card C reveal pattern.
 *
 *   getProducerState(chainId)
 *     Read the producer record for this node. Returns { state, rank,
 *     ... } if registered, null if not. Used as the precondition for
 *     destructive ops — if the producer is Active or Pending,
 *     destroying the keystore equals missing on-duty rounds, which
 *     equals slashing. The route layer enforces the typed-confirm gate.
 *
 * Architectural notes:
 *   - All keystore writes go to <chainDir>/keystore.dat (where ela
 *     looks for it). On import we ALSO write to <chainDir>/elastos/
 *     keystore.dat for parity with the wizard's restore-path layout
 *     established earlier this session.
 *   - We never persist the operator's password. The shell-out to
 *     ela-cli gets it as an argv parameter; argv leaks via /proc on
 *     other root accounts. This is acceptable on a single-tenant
 *     PC2 host but documented for future hardening.
 *   - Chain control routes through ChainRegistry.getAdapter() so the
 *     stop/start respects the same lifecycle the dashboard uses.
 *
 * 0.2.0-beta.3.43.
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const { ENM_LOG_PREFIX } = require('./EnmConstants');
const DataDir = require('./DataDir');
const ChainRegistry = require('./ChainRegistry');

const KEYSTORE_FILENAME = 'keystore.dat';
const ACCOUNT_CACHE_FILENAME = 'keystore-account.json';
// Max size we'll accept for an uploaded keystore. ela's keystore.dat is
// ~700 bytes today; 10 KB allows for future format growth + small
// metadata without admitting absurdly large blobs.
const MAX_IMPORT_BYTES = 10 * 1024;

/**
 * @typedef {object} IdentityResult
 * @property {boolean} ok
 * @property {string|null} [publicKey]
 * @property {string|null} [address]
 * @property {string|null} [error]
 * @property {string|null} [archivedAt]
 */

function _ksPath(chainId) {
    return path.join(DataDir.chainDir(chainId), KEYSTORE_FILENAME);
}

function _ksPathElastos(chainId) {
    return path.join(DataDir.chainDir(chainId), 'elastos', KEYSTORE_FILENAME);
}

function _identityCachePath(chainId) {
    return path.join(DataDir.chainDir(chainId), ACCOUNT_CACHE_FILENAME);
}

async function _resolveCliPath() {
    const dl = ChainRegistry.getBinaryDownloader();
    if (!dl) { return null; }
    const onDisk = await dl.getStatusWithDisk('mainchain').catch(() => null);
    return (onDisk && onDisk.cliPath) || null;
}

/**
 * Read the cached identity (publicKey + address) for the chain. Returns
 * null if the file doesn't exist or fails to parse.
 *
 * @param {string} chainId
 * @returns {Promise<{publicKey: string, address: string, generatedAt?: number}|null>}
 */
async function getCachedIdentity(chainId) {
    try {
        const raw = await fsp.readFile(_identityCachePath(chainId), 'utf8');
        const j = JSON.parse(raw);
        if (j && typeof j.publicKey === 'string' && typeof j.address === 'string') {
            return j;
        }
    } catch (_) { /* missing/unreadable */ }
    return null;
}

/**
 * Write/refresh the identity cache. Atomic via DataDir.atomicWrite,
 * 0600 mode, parent dir auto-created.
 */
async function writeIdentityCache(chainId, { publicKey, address }) {
    const target = _identityCachePath(chainId);
    const body = JSON.stringify({
        publicKey,
        address,
        generatedAt: Date.now(),
    });
    await DataDir.atomicWrite(target, body, { mode: 0o600 });
}

/**
 * Smoke-test the password by asking ela-cli for the account. On
 * success, refresh the cache file and return the identity.
 *
 * @param {string} chainId
 * @param {string} password
 * @returns {Promise<IdentityResult>}
 */
async function unlock(chainId, password) {
    if (typeof password !== 'string' || password.length === 0) {
        return { ok: false, error: 'Password is required.' };
    }
    const cliPath = await _resolveCliPath();
    if (!cliPath) {
        return { ok: false, error: 'ela-cli not installed yet.' };
    }
    if (!fs.existsSync(_ksPath(chainId))) {
        return { ok: false, error: 'No keystore on disk to unlock.' };
    }
    const ks = ChainRegistry.getKeystoreService();
    let parsed;
    try {
        parsed = await ks.readAccount({ cliPath, password });
    } catch (err) {
        const msg = (err && err.message) || String(err);
        // Wrong password = "open wallet failed" / "password wrong" from ela-cli.
        // Pass it through so the operator knows the password didn't match;
        // anything else (ENOENT, timeout) goes verbatim.
        return { ok: false, error: /password wrong|open wallet failed/i.test(msg)
            ? 'Password incorrect.'
            : msg };
    }
    if (!parsed.publicKey || !parsed.address) {
        return { ok: false, error: 'ela-cli accepted the password but did not return a public key + address.' };
    }
    await writeIdentityCache(chainId, parsed);
    return { ok: true, publicKey: parsed.publicKey, address: parsed.address };
}

/**
 * Read the keystore.dat into a Buffer for download. Caller is
 * responsible for the HTTP layer (Content-Type, Disposition headers).
 *
 * @param {string} chainId
 * @returns {Promise<{buffer: Buffer, filename: string}>}
 */
async function readBackup(chainId) {
    const src = _ksPath(chainId);
    if (!fs.existsSync(src)) {
        const e = new Error('No keystore on disk to back up.');
        e.code = 'NO_KEYSTORE';
        throw e;
    }
    const buffer = await fsp.readFile(src);
    // Filename includes a short identifier so multiple backups don't
    // overwrite each other in the operator's download folder. We use
    // the cache's publicKey suffix if available, else "node".
    const cached = await getCachedIdentity(chainId);
    const short = cached && cached.publicKey
        ? cached.publicKey.slice(-8)
        : 'node';
    const iso = new Date().toISOString().replace(/[:.]/g, '-');
    return {
        buffer,
        filename: `keystore-${chainId}-${short}-${iso}.dat`,
    };
}

/**
 * Producer state probe — used by destructive ops as a slashing-risk
 * gate. Returns null if the chain is not running OR not registered.
 *
 * @param {string} chainId
 * @returns {Promise<{state: string, rank: number|null}|null>}
 */
async function getProducerState(chainId) {
    try {
        const cached = await getCachedIdentity(chainId);
        if (!cached || !cached.publicKey) {
            // No cached pubkey — we can't query the chain for our
            // producer record. Treat as "unknown" = not locked-in.
            return null;
        }
        const ConfigStore = require('./ConfigStore');
        const cfg = await ConfigStore.load();
        const chainCfg = cfg && cfg.chains && cfg.chains[chainId];
        if (!chainCfg) { return null; }
        const adapter = ChainRegistry.getAdapter(chainId);
        if (!adapter || typeof adapter.rpcClient !== 'function') { return null; }
        const client = adapter.rpcClient(chainCfg);
        if (!client || typeof client.getproducerinfo !== 'function') { return null; }
        const p = await client.getproducerinfo(cached.publicKey).catch(() => null);
        if (!p || !p.state) { return null; }
        return {
            state: p.state,
            rank: typeof p.index === 'number' ? p.index : null,
        };
    } catch (_) { return null; }
}

/**
 * Stop chain, archive existing, write fileBuffer, refresh cache,
 * restart chain. Atomicity: we keep the archive even if subsequent
 * steps fail; operator can rollback by renaming.
 *
 * @param {string} chainId
 * @param {Buffer} fileBuffer
 * @param {string} password
 * @param {{log?: object}} [opts]
 * @returns {Promise<IdentityResult & {keystorePath: string, archivedTo: string|null}>}
 */
async function importKeystore(chainId, fileBuffer, password, opts) {
    const log = (opts && opts.log) || _noopLog();
    if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
        return { ok: false, error: 'No file uploaded.' };
    }
    if (fileBuffer.length > MAX_IMPORT_BYTES) {
        return { ok: false, error: `Keystore file too large (>${MAX_IMPORT_BYTES} bytes). Real keystores are ~700 bytes.` };
    }
    if (typeof password !== 'string' || password.length === 0) {
        return { ok: false, error: 'Password is required to validate the upload.' };
    }
    const cliPath = await _resolveCliPath();
    if (!cliPath) {
        return { ok: false, error: 'ela-cli not installed yet.' };
    }

    // Write to quarantine dir + smoke-test there. If invalid we never
    // touch the live keystore path.
    const qDir = path.join(DataDir.enmDataDir(), 'quarantine');
    await fsp.mkdir(qDir, { recursive: true, mode: 0o700 });
    const qFile = path.join(qDir, `keystore-import-${Date.now()}.dat`);
    await fsp.writeFile(qFile, fileBuffer, { mode: 0o600 });
    let parsed;
    try {
        // readAccount needs the keystore at the standard chainDir
        // location. Temporarily mount it there in a sandbox dir.
        // BUT ela-cli wallet account accepts --wallet <path>, so
        // we can point directly at the quarantine file. The
        // EnmKeystoreService wrapper doesn't expose --wallet
        // directly; call ela-cli ourselves here for the validation.
        parsed = await _walletAccountAt(cliPath, qFile, password);
    } catch (err) {
        await fsp.unlink(qFile).catch(() => {});
        const msg = (err && err.message) || String(err);
        return { ok: false, error: /password wrong|open wallet failed/i.test(msg)
            ? 'Password did not decrypt the uploaded keystore.'
            : 'Upload did not validate as a keystore: ' + msg };
    }
    if (!parsed.publicKey || !parsed.address) {
        await fsp.unlink(qFile).catch(() => {});
        return { ok: false, error: 'Uploaded file decrypted but did not yield a public key + address.' };
    }

    // Past the validation gate. Time to swap the live keystore.
    let archivedTo = null;
    try {
        await _stopChain(chainId, log);
        archivedTo = await _archiveExistingKeystore(chainId, log);
        // Move quarantine file into chain dir + duplicate at the
        // elastos/ path the wizard also writes to.
        const target = _ksPath(chainId);
        await fsp.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        await fsp.rename(qFile, target);
        await fsp.chmod(target, 0o600);
        try {
            const elasMirror = _ksPathElastos(chainId);
            await fsp.mkdir(path.dirname(elasMirror), { recursive: true, mode: 0o700 });
            await fsp.copyFile(target, elasMirror);
            await fsp.chmod(elasMirror, 0o600);
        } catch (_) { /* the elastos/ mirror is defence-in-depth */ }
        await writeIdentityCache(chainId, parsed);
        log.info(`${ENM_LOG_PREFIX} identity.importKeystore: keystore swapped (archived → ${archivedTo})`);
    } catch (err) {
        // Don't try to roll back here — the operator can see the
        // archive path in the response and recover manually.
        return {
            ok: false,
            error: `Import partially applied: ${err.message}. Original keystore is at ${archivedTo || '(no archive made)'}.`,
            archivedTo,
        };
    }

    // Best-effort chain restart. Failure is non-fatal — the keystore
    // is in place; operator can start the chain from the dashboard.
    await _startChain(chainId, log).catch((err) => {
        log.warn(`${ENM_LOG_PREFIX} identity.importKeystore: chain restart failed: ${err.message}`);
    });

    return {
        ok: true,
        publicKey: parsed.publicKey,
        address: parsed.address,
        keystorePath: _ksPath(chainId),
        archivedTo,
    };
}

/**
 * Stop chain, archive existing, generate fresh keystore + password,
 * refresh cache, restart chain. The fresh password is returned ONCE.
 *
 * @param {string} chainId
 * @param {{log?: object}} [opts]
 * @returns {Promise<IdentityResult & {generatedPassword: string|null, archivedTo: string|null, keystorePath: string}>}
 */
async function resetKeystore(chainId, opts) {
    const log = (opts && opts.log) || _noopLog();
    const cliPath = await _resolveCliPath();
    if (!cliPath) {
        return { ok: false, error: 'ela-cli not installed yet.' };
    }
    await _stopChain(chainId, log);
    const archivedTo = await _archiveExistingKeystore(chainId, log);
    const ks = ChainRegistry.getKeystoreService();
    // KeystoreService.create with no force=false because we just
    // archived the existing one — it should no longer exist on disk
    // and `force` isn't required. Belt + braces: if the archive failed,
    // we pass force=true so we don't deadlock the operator on an edge
    // case (the archive bug means they end up with .replaced-<ts>
    // anyway). The slashing risk surfaced server-side already.
    let result;
    try {
        result = await ks.create({
            cliPath,
            force: archivedTo == null,
        });
    } catch (err) {
        // If create failed we're in a bad state: keystore gone, no
        // replacement. Operator must restore from the archive manually.
        return {
            ok: false,
            error: `keystore create failed: ${err.message}. Old keystore archived at ${archivedTo}.`,
            archivedTo,
        };
    }
    // Mirror the new keystore at the elastos/ path the wizard uses.
    try {
        const elasMirror = _ksPathElastos(chainId);
        await fsp.mkdir(path.dirname(elasMirror), { recursive: true, mode: 0o700 });
        await fsp.copyFile(_ksPath(chainId), elasMirror);
        await fsp.chmod(elasMirror, 0o600);
    } catch (_) { /* defence in depth */ }
    await writeIdentityCache(chainId, {
        publicKey: result.publicKey,
        address: result.address,
    });
    log.info(`${ENM_LOG_PREFIX} identity.resetKeystore: new keystore at ${result.keystorePath} (archived → ${archivedTo})`);

    await _startChain(chainId, log).catch((err) => {
        log.warn(`${ENM_LOG_PREFIX} identity.resetKeystore: chain restart failed: ${err.message}`);
    });

    return {
        ok: true,
        publicKey: result.publicKey,
        address: result.address,
        generatedPassword: result.password,
        keystorePath: result.keystorePath,
        archivedTo,
    };
}

// ===========================================================================
// Internal helpers
// ===========================================================================

function _noopLog() {
    return { info() {}, warn() {}, error() {}, debug() {} };
}

async function _stopChain(chainId, log) {
    try {
        const adapter = ChainRegistry.getAdapter(chainId);
        if (adapter && typeof adapter.stop === 'function') {
            log.info(`${ENM_LOG_PREFIX} identity: stopping chain ${chainId}`);
            await adapter.stop();
        }
    } catch (err) {
        // Adapter not yet wired (rare) — chain wasn't running, OK to
        // proceed with the keystore op.
        log.warn(`${ENM_LOG_PREFIX} identity: stop returned: ${err.message}`);
    }
}

async function _startChain(chainId, log) {
    const ConfigStore = require('./ConfigStore');
    const cfg = await ConfigStore.load();
    const chainCfg = cfg && cfg.chains && cfg.chains[chainId];
    if (!chainCfg) {
        log.warn(`${ENM_LOG_PREFIX} identity: chain config for ${chainId} missing — skipping restart`);
        return;
    }
    const adapter = ChainRegistry.getAdapter(chainId);
    if (!adapter || typeof adapter.start !== 'function') {
        log.warn(`${ENM_LOG_PREFIX} identity: chain adapter unavailable — skipping restart`);
        return;
    }
    log.info(`${ENM_LOG_PREFIX} identity: restarting chain ${chainId}`);
    await adapter.start(chainCfg);
}

async function _archiveExistingKeystore(chainId, log) {
    const src = _ksPath(chainId);
    if (!fs.existsSync(src)) {
        // Mirror — if the elastos/ copy exists but the main one doesn't,
        // still archive the mirror so the operator's old keystore is
        // recoverable.
        const mirror = _ksPathElastos(chainId);
        if (fs.existsSync(mirror)) {
            return await _archiveOne(mirror, log);
        }
        return null;
    }
    const archived = await _archiveOne(src, log);
    // Also archive the mirror if present.
    try {
        const mirror = _ksPathElastos(chainId);
        if (fs.existsSync(mirror)) { await _archiveOne(mirror, log); }
    } catch (_) { /* swallow — mirror is defence in depth */ }
    return archived;
}

async function _archiveOne(src, log) {
    const pc2Data = process.env.PC2_DATA_DIR
        || path.dirname(path.dirname(DataDir.enmDataDir()));
    const backupRoot = path.join(pc2Data, 'backups', 'elastos-node-manager');
    await fsp.mkdir(backupRoot, { recursive: true, mode: 0o700 });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dst = path.join(backupRoot, `keystore-${ts}.dat`);
    await fsp.copyFile(src, dst);
    await fsp.chmod(dst, 0o600);
    // P1 (v0.5.183) — CRITICAL data-loss fix. The keystore.dat is encrypted
    // at rest, but its decryption (and every RPC/keystore password envelope)
    // depends on the AES master key at DataDir.encryptionKeyPath(). If that
    // key is lost (volume gone, host migration that copies only this
    // backups/ dir), the backed-up keystore.dat is still openable with the
    // operator's wallet password, BUT every password ENM stored for them
    // (RPC pass, keystore-password.enc) becomes permanently undecryptable.
    // So we mirror encryption.key alongside EVERY keystore archive, mode
    // 0600, in the same backup dir. Best-effort: a missing key (pre-first-
    // run) or copy failure must not abort the keystore archive itself.
    await _backupEncryptionKeyInto(backupRoot, ts, log);
    await fsp.unlink(src);
    log.info(`${ENM_LOG_PREFIX} identity: archived ${src} → ${dst}`);
    return dst;
}

/**
 * P1 (v0.5.183) — copy the AES master key (encryption.key) into the keystore
 * backup dir so a config+backups migration carries everything needed to
 * decrypt the operator's stored passwords. Without it, keystore.dat survives
 * but RPC/keystore password envelopes are unrecoverable on a new host.
 *
 * Idempotent + best-effort: returns null (and logs a warning) on any failure
 * so it can never abort the keystore archive that calls it. The copy is
 * timestamp-suffixed to match its sibling keystore archive, written 0600.
 *
 * @param {string} backupRoot  the backups/elastos-node-manager dir
 * @param {string} ts          the same ISO timestamp used for the keystore archive
 * @param {object} log
 * @returns {Promise<string|null>} the key backup path, or null if skipped
 */
async function _backupEncryptionKeyInto(backupRoot, ts, log) {
    try {
        const keySrc = DataDir.encryptionKeyPath();
        if (!fs.existsSync(keySrc)) {
            // No master key yet (operator hasn't stored any secret). Nothing
            // to back up — silently skip.
            return null;
        }
        const keyDst = path.join(backupRoot, `encryption-key-${ts}.key`);
        await fsp.copyFile(keySrc, keyDst);
        await fsp.chmod(keyDst, 0o600);
        log.info(`${ENM_LOG_PREFIX} identity: backed up encryption.key → ${keyDst}`);
        return keyDst;
    } catch (err) {
        log.warn(
            `${ENM_LOG_PREFIX} identity: encryption.key backup failed (${err.message}) — `
            + 'keystore archived, but stored passwords may be unrecoverable if the master key is lost',
        );
        return null;
    }
}

/**
 * Run `ela-cli wallet account --wallet <path> -p <password>` and parse
 * the publicKey + address out of stdout. Same parser as
 * EnmKeystoreService._parseAccount but lets us point at an arbitrary
 * keystore path (for quarantine validation).
 */
function _walletAccountAt(cliPath, ksPath, password) {
    const { execFile } = require('node:child_process');
    return new Promise((resolve, reject) => {
        execFile(cliPath, ['wallet', 'account', '--wallet', ksPath, '-p', password], {
            timeout: 8_000,
            maxBuffer: 256 * 1024,
        }, (err, stdout, stderr) => {
            if (err) {
                const e = new Error((stderr || stdout || err.message || '').trim().split('\n')[0]);
                return reject(e);
            }
            // Pubkey is 66 hex chars starting with 02 or 03 (compressed
            // secp256k1). Address is the ELA base58 form (starts with E,
            // 33-34 chars).
            const out = String(stdout || '');
            const pubM  = out.match(/\b0[2-3][a-fA-F0-9]{64}\b/);
            const addrM = out.match(/\bE[a-km-zA-HJ-NP-Z1-9]{32,34}\b/);
            resolve({
                publicKey: pubM ? pubM[0] : null,
                address:   addrM ? addrM[0] : null,
                raw: out,
            });
        });
    });
}

module.exports = {
    unlock,
    readBackup,
    importKeystore,
    resetKeystore,
    getProducerState,
    getCachedIdentity,
    writeIdentityCache,
    // exported for tests
    _internals: {
        _walletAccountAt,
        _archiveExistingKeystore,
        _backupEncryptionKeyInto, // P1 (v0.5.183)
        MAX_IMPORT_BYTES,
    },
};
