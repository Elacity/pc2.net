/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmMaintenanceManager — beta.3.33. Backs the Settings → Danger Zone
 * actions: update / chain-resync / uninstall / nuke.
 *
 * Why this exists:
 *   Until beta.3.32 the only way to update or uninstall ENM was SSH +
 *   /root/deploy-enm.sh. The operator asked for an in-UI flow with the
 *   four destructive options spelled out. This module is the backend
 *   half of that work — the frontend Danger Zone card calls into the
 *   /api/enm/maintenance/* routes which delegate here.
 *
 * Action semantics:
 *
 *   checkLatestVersion()
 *     GET-only. Returns { current, latest, updateAvailable, tag,
 *     releaseUrl, publishedAt }. Hits the GitHub releases API
 *     unauthenticated (60 req/hr/IP — fine for occasional polls).
 *
 *   update({ tag })
 *     Spawns /root/deploy-enm.sh <tag> detached and returns
 *     "update queued". deploy-enm.sh is the canonical path — it
 *     handles the SIGKILL-self-then-reinstall dance that an in-
 *     process update can't because the HTTP response gets cut off
 *     mid-stream when pc2-node kills ENM. Frontend polls
 *     /system/status afterwards to learn the new version is up.
 *
 *   chainResync(chainId)
 *     Inline (no detach). Stops chain via ChainAdapter, backs up
 *     keystore via EnmStorageMaintenance, deletes the LevelDB +
 *     peers.json, starts chain. Keystore + config.json preserved.
 *
 *   uninstall()
 *     Spawns curl DELETE …?purge=false detached. pc2-node tears down
 *     the bundle; the data dir (chain DB, keystore, audit log,
 *     backups) survives at /var/lib/pc2/data/extensions/elastos-
 *     node-manager so reinstall can recover.
 *
 *   nuke()
 *     Detaches a script that DELETE …?purge=true, then rm -rf the
 *     extension data dir. Operator loses the keystore. Confirmation
 *     gate is "WIPE EVERYTHING" (case-sensitive) on the frontend.
 *
 * Concurrency:
 *   In-process lock prevents two destructive actions running at once.
 *   Lock is module-scoped and self-clearing on completion or on
 *   process exit (since ENM dies anyway after uninstall/nuke/update).
 *
 * Audit:
 *   Each action writes an audit row via EnmAuditLog.append with
 *   tier:CRITICAL-INFO, decision:executed, executor:operator.
 *   chainId='mainchain' for all (single-chain v0.2). The payload
 *   carries the action name + outcome.
 *
 * Why a detached child process for update/uninstall/nuke and not
 * an inline await? Because we are about to kill ourselves. The
 * Express response stream needs to flush first, then the script
 * tears down pc2-node's child process for ENM. If we await the
 * shell-out inline, the client never sees the success envelope —
 * just a TCP RST when our PID dies. Detach + unref decouples it.
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const { spawn } = require('node:child_process');

const { ENM_LOG_PREFIX } = require('./EnmConstants');
const DataDir = require('./DataDir');
const ChainRegistry = require('./ChainRegistry');
const ConfigStore = require('./ConfigStore');

const KEYSTORE_FILENAME = 'keystore.dat';

// 0.5.118 audit Session 118 — read the User-Agent's version segment
// from package.json instead of hardcoding "0.2.0". Pre-0.5.118 the
// GitHub API hit at line ~653 used "ENM-MaintenanceManager/0.2.0" —
// stale since beta. Mirrors the Session 111 fix (EnmUpdateScanner)
// and Session 113 fix (EnmBootstrapDownloader); third User-Agent
// drift caught by the audit chain.
function _readPackageVersion() {
    try {
        const pkg = require('../../package.json');
        if (pkg && typeof pkg.version === 'string') { return pkg.version; }
    } catch (_) { /* fall through */ }
    return '0.0.0';
}
const USER_AGENT = 'ENM-MaintenanceManager/' + _readPackageVersion();

const GITHUB_OWNER = '4HM3DMD';
const GITHUB_REPO = 'pc2-testing';
const DEPLOY_SCRIPT = '/root/deploy-enm.sh';
const SELF_DATA_DIR_DEFAULT = '/var/lib/pc2/data/extensions/elastos-node-manager';
// beta.3.35 — operate on PC2 at the filesystem + sqlite layer rather
// than through its HTTP API. We're already running as root inside
// pc2-node; needing a self-auth token to delete our own files is
// theatre. /etc/pc2.env may be unreadable on hardened hosts anyway.
const PC2_SQLITE_PATH = '/var/lib/pc2/data/pc2-node.sqlite';
const INSTALLED_APPS_DIR = '/var/lib/pc2/data/installed-apps/elastos-node-manager';
const APP_NAME = 'elastos-node-manager';

// In-process lock — only one destructive action at a time.
let _busy = null; // { action, startedAtMs }

function _acquire(action) {
    if (_busy) {
        const e = new Error(
            `Another maintenance action is already running: ${_busy.action} `
            + `(started ${Math.round((Date.now() - _busy.startedAtMs) / 1000)}s ago).`,
        );
        e.code = 'BUSY';
        throw e;
    }
    _busy = { action, startedAtMs: Date.now() };
}

function _release() {
    _busy = null;
}

/**
 * beta.3.35 — uninstall + nuke no longer call pc2-node's HTTP API,
 * so the owner-token reader is no longer needed by those paths.
 * Kept as a stub returning null for backward compatibility with
 * callers that may still import it (none in-tree).
 *
 * Why the rewrite: operator complaint — "why do we even need this?"
 * Reading /etc/pc2.env to authenticate to the same process tree we
 * already live inside was theatre. We're root, we have shell, we
 * have the sqlite file at a known path. Just do the work directly.
 */
function readOwnerToken() {
    return null;
}

/**
 * Query the GitHub releases API for the most recent release whose tag
 * starts with `enm-v`. We don't authenticate — public repo, public
 * releases, and the rate limit (60/hr/IP) is way above what a polling
 * Danger Zone card can hit.
 *
 * @param {string} currentVersion — semver-shaped, e.g. "0.2.0-beta.3.32"
 * @returns {Promise<{
 *   current: string,
 *   latest: string|null,
 *   tag: string|null,
 *   updateAvailable: boolean,
 *   releaseUrl: string|null,
 *   publishedAt: string|null,
 *   error?: string,
 * }>}
 */
async function checkLatestVersion(currentVersion) {
    const current = String(currentVersion || '').replace(/^v/, '');
    try {
        const releases = await _httpsGetJson(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=20`,
        );
        if (!Array.isArray(releases)) {
            return {
                current, latest: null, tag: null, updateAvailable: false,
                releaseUrl: null, publishedAt: null,
                error: 'GitHub releases response was not an array',
            };
        }
        // Filter to enm-v* prereleases + releases, pick newest by publishedAt.
        const candidates = releases
            .filter((r) => r && typeof r.tag_name === 'string' && r.tag_name.startsWith('enm-v'))
            .filter((r) => !r.draft);
        if (candidates.length === 0) {
            return {
                current, latest: null, tag: null, updateAvailable: false,
                releaseUrl: null, publishedAt: null,
            };
        }
        candidates.sort((a, b) => {
            const ta = a.published_at ? Date.parse(a.published_at) : 0;
            const tb = b.published_at ? Date.parse(b.published_at) : 0;
            return tb - ta;
        });
        const newest = candidates[0];
        const latestSemver = String(newest.tag_name).replace(/^enm-v/, '');
        const updateAvailable = _semverIsNewer(latestSemver, current);
        return {
            current,
            latest: latestSemver,
            tag: newest.tag_name,
            updateAvailable,
            releaseUrl: newest.html_url || null,
            publishedAt: newest.published_at || null,
        };
    } catch (err) {
        return {
            current, latest: null, tag: null, updateAvailable: false,
            releaseUrl: null, publishedAt: null,
            error: err.message || String(err),
        };
    }
}

/**
 * Launch the ENM update flow. Spawns /root/deploy-enm.sh <tag> as a
 * detached child; the script handles SIGKILL-self + reinstall via
 * pc2-node's install-local route + restart. We return immediately so
 * the operator's request gets a clean response before our process
 * dies.
 *
 * @param {{ tag: string, log?: object }} opts
 * @returns {Promise<{ action: 'update', tag: string, scriptPath: string }>}
 */
async function update(opts) {
    const tag = String((opts && opts.tag) || '').trim();
    if (!/^enm-v\d/.test(tag)) {
        throw Object.assign(new Error('Invalid tag — expected "enm-v…"'), { code: 'BAD_TAG' });
    }
    _acquire('update');
    try {
        const log = (opts && opts.log) || _noopLog();
        // Make sure the deploy script is present + executable. We don't
        // want to return success and then have the operator hit a silent
        // ENOENT a second later.
        try {
            await fsp.access(DEPLOY_SCRIPT, fs.constants.X_OK);
        } catch (err) {
            throw Object.assign(
                new Error(`Deploy script ${DEPLOY_SCRIPT} not found or not executable (${err.code}).`),
                { code: 'NO_DEPLOY_SCRIPT' },
            );
        }

        // Build the detached script. We pipe deploy-enm.sh output to a
        // diagnostic log under enmDataDir so operators (or us, on a
        // follow-up SSH) can see what happened.
        const dataDir = _dataDirSafe();
        const logFile = path.join(dataDir, `update-${Date.now()}.log`);

        // The token is required for the install-local PC2 call inside
        // deploy-enm.sh. The script reads it from /etc/pc2.env so we
        // don't need to pass it here.
        const sh =
            `set -e\n`
            + `( ${DEPLOY_SCRIPT} '${_shellEscape(tag)}' > '${_shellEscape(logFile)}' 2>&1 ) &\n`
            + `disown\n`;
        const child = spawn('bash', ['-c', sh], {
            detached: true,
            stdio: 'ignore',
        });
        child.unref();
        log.info(`${ENM_LOG_PREFIX} maintenance.update queued: ${tag} (log → ${logFile})`);
        return {
            action: 'update',
            tag,
            scriptPath: DEPLOY_SCRIPT,
            logFile,
        };
    } finally {
        // We can release immediately — the child is detached and we're
        // about to be killed by it anyway. If the child fails to fire
        // (ENOENT etc.) the operator can retry.
        _release();
    }
}

/**
 * Stop chain → backup keystore → wipe LevelDB + peers.json + dpos/
 * → restart chain. Keystore, config, and audit log all survive.
 *
 * @param {{ chainId: string, log?: object }} opts
 * @returns {Promise<{ action: 'chain-resync', chainId, removedPaths: string[], keystoreBackup: string|null }>}
 */
async function chainResync(opts) {
    const chainId = String((opts && opts.chainId) || '').trim();
    if (!/^[a-z0-9-]+$/.test(chainId)) {
        throw Object.assign(new Error('Invalid chainId'), { code: 'BAD_CHAIN' });
    }
    _acquire('chain-resync');
    const log = (opts && opts.log) || _noopLog();
    try {
        let adapter;
        try {
            adapter = ChainRegistry.getAdapter(chainId);
        } catch (err) {
            throw Object.assign(
                new Error(`Unknown chain "${chainId}"`),
                { code: 'NO_CHAIN' },
            );
        }
        // P0-6 (v0.5.179) — DISABLE the chain BEFORE stopping it. HealthChecker
        // (all 3 tick loops) and AutoStart both skip chains with enabled=false,
        // so this prevents F1 self-heal or a boot autostart from RESPAWNING the
        // chain mid-`rm` — which would corrupt the half-deleted leveldb or
        // silently undo the wipe (ela re-opens the dir before we finish deleting).
        // The chain stays disabled until the operator completes the re-appearing
        // bootstrap wizard, which re-enables + starts it.
        try {
            await ConfigStore.update((cfg) => {
                if (cfg.chains && cfg.chains[chainId]) { cfg.chains[chainId].enabled = false; }
            }, { logger: log });
        } catch (err) {
            log.warn(
                `${ENM_LOG_PREFIX} maintenance.chainResync: could not disable ${chainId} before `
                + `wipe (${err.message}) — self-heal could race the wipe`,
            );
        }

        log.info(`${ENM_LOG_PREFIX} maintenance.chainResync(${chainId}) — stopping chain`);
        try {
            await adapter.stop();
        } catch (err) {
            log.warn(`${ENM_LOG_PREFIX} maintenance.chainResync: stop returned: ${err.message}`);
            // Continue — if the process was already dead the rm path is still safe.
        }

        // Best-effort keystore backup before we touch chain data. This
        // mirrors EnmStorageMaintenance._backupKeystoreIfDue without
        // calling into the class API (which is private). Same target
        // path so the existing /system/storage UI surfaces it.
        const keystoreBackup = await _backupKeystoreNow(chainId, log).catch((err) => {
            log.warn(`${ENM_LOG_PREFIX} maintenance.chainResync: keystore backup failed: ${err.message}`);
            return null;
        });

        // beta.3.42 — ela's working directory is <chainDir>/elastos/,
        // NOT <chainDir>/ directly. The leveldb + peers + dpos state
        // live under <chainDir>/elastos/data/, peers.json/dpos/logs at
        // <chainDir>/elastos/*. Pre-3.42 we targeted <chainDir>/data
        // which didn't exist — so the rm -rf silently no-op'd and
        // operators wondered why "Chain Resync" didn't actually
        // resync. Confirmed against the bootstrap-apply code at the
        // top of EnmBootstrapDownloader._run.
        const cdir = DataDir.chainDir(chainId);
        const removed = [];
        // v0.5.231 — Preserve network identity (nodekey) across the wipe. The
        // chain state we're wiping has NO causal relationship with the nodekey:
        // nodekey is just the libp2p discovery key that lets peers find us, and
        // throwing it away every wipe means every peer in our address book has
        // to re-add us by IP — which slows peer reconvergence from seconds to
        // ~10 min. The on-chain identity (the mining keystore) is preserved
        // separately by _backupKeystoreNow above. We read the nodekey into a
        // dotfile OUTSIDE the geth/pgp dir so it survives the rm sweep below,
        // then restore it before adapter.start runs.
        // (Anchor: the 2026-05-27 EID wipe regenerated nodekey at 17:32:45,
        // causing peer churn during the resync; v0.5.231 keeps the same key.)
        let nodekeyBackup = null;
        if (adapter.chainClass === 'B') {
            const gethInstance = (chainId === 'pg') ? 'pgp' : 'geth';
            const srcNodekey = path.join(cdir, 'data', gethInstance, 'nodekey');
            try {
                const buf = await fsp.readFile(srcNodekey);
                const backupPath = path.join(cdir, 'data', '.nodekey.preserved');
                await fsp.writeFile(backupPath, buf, { mode: 0o600 });
                nodekeyBackup = { instance: gethInstance, restorePath: srcNodekey, backupPath };
                log.info(
                    `${ENM_LOG_PREFIX} maintenance.chainResync(${chainId}) — nodekey backed up `
                    + `(${buf.length} bytes) for restore after wipe`,
                );
            } catch (err) {
                // ENOENT here just means the chain has never started, or it
                // was already wiped — nothing to preserve, not an error.
                if (err.code !== 'ENOENT') {
                    log.warn(
                        `${ENM_LOG_PREFIX} maintenance.chainResync(${chainId}) — nodekey backup `
                        + `failed: ${err.message} — geth will generate a fresh identity post-wipe`,
                    );
                }
            }
        }
        // P1-7 (v0.5.180) — class-aware resync targets. The wipe list used to be
        // ELA-only (elastos/*), so for EVM sidechains (esc/eid/pg) it silently
        // NO-OP'd — the UI "Chain Resync" couldn't repair a forked/corrupt EVM
        // chain (e.g. pg wedged on a dead fork where every peer returns "retrieved
        // hash chain is invalid"). EVM chain data lives under <chainDir>/data/geth;
        // the MINING KEYSTORE is the sibling <chainDir>/data/keystore and MUST
        // survive — so we target data/geth PRECISELY (never data/) plus the stale
        // peer cache. data/keystore, data/miner_address.txt, and the SPV
        // mainchain-watch state (data/header, data/store, data/spv_transaction_info.db)
        // are intentionally NOT in the list and are preserved.
        let candidates;
        if (adapter.chainClass === 'B') {
            const dataDir = path.join(cdir, 'data');
            // The EVM chaindata dir is named after the geth fork's instance:
            // esc/eid use "geth", but the PG fork uses "pgp" (verified on disk:
            // chains/pg/data/pgp/chaindata). Each chain has exactly ONE of these,
            // so listing both is safe — the absent one is a no-op rm.
            //
            // v0.5.235 — LOCKSTEP WIPE. The SPV mainchain-watch state
            // (data/header, data/store, data/spv_transaction_info.db,
            // data/logs-spv) is now wiped ALONGSIDE the geth chaindata.
            // Pre-v0.5.235 it was preserved "to save the hours-long SPV
            // re-download" — but that was exactly backwards: wiping geth to
            // genesis while keeping SPV at the mainchain tip DECOUPLES the
            // arbiter context an EVM PBFT chain needs to validate headers,
            // so the resync wedges forever (proven on EID 2026-05-27:
            // stuck at block 574,384 for 9h with "retrieved hash chain is
            // invalid"). node.sh never decouples them — its SPV lives as a
            // sibling of geth under <chain>/data/ and is only ever rebuilt
            // TOGETHER with the chain. Wiping both → geth + SPV re-sync from
            // genesis in lockstep, SPV feeding arbiter sets in order → the
            // chain validates cleanly (proven: the joint wipe drove EID from
            // 574k → 4M+ in ~15 min). The SPV bulk header re-sync is fast
            // (404k → 1.75M mainchain blocks in 15 min observed), so the
            // "saves hours" rationale was false; preserving it caused a
            // PERMANENT stall, which is far worse.
            //
            // The mining keystore (data/keystore) + network identity
            // (data/{geth|pgp}/nodekey, backed up above and restored after)
            // are still preserved — those are operator identity, not chain
            // state.
            candidates = [
                path.join(dataDir, 'geth'),        // esc/eid EVM blockchain DB
                path.join(dataDir, 'pgp'),         // pg EVM blockchain DB
                path.join(dataDir, 'geth.ipc'),    // stale ipc socket (esc/eid)
                path.join(dataDir, 'pgp.ipc'),     // v0.5.185 P2-B — stale ipc socket (pg)
                // v0.5.235 — SPV mainchain-watch state, wiped in lockstep
                // with geth (see rationale above).
                path.join(dataDir, 'header'),
                path.join(dataDir, 'store'),
                path.join(dataDir, 'spv_transaction_info.db'),
                path.join(dataDir, 'logs-spv'),
                // peers.json IS now wiped too: it is the SPV addrmgr peer
                // cache; on a from-genesis SPV resync a stale cache only
                // slows the re-handshake, and keeping it served no purpose
                // once SPV itself is wiped.
                path.join(dataDir, 'peers.json'),
                path.join(DataDir.enmDataDir(), '.tmp', 'bootstrap', chainId),
            ];
        } else {
            // beta.3.42 — Class A (ela): working dir is <chainDir>/elastos/.
            const elastosDir = path.join(cdir, 'elastos');
            candidates = [
                path.join(elastosDir, 'data'),
                path.join(elastosDir, 'peers.json'),
                path.join(elastosDir, 'dpos'),
                path.join(elastosDir, 'logs', 'node'),  // chain logs from ela
                // Also nuke the .tmp/bootstrap/<chainId>/ partial download dir so a
                // resync forces a fresh bootstrap instead of resuming a corrupt .partial.
                path.join(DataDir.enmDataDir(), '.tmp', 'bootstrap', chainId),
            ];
        }
        // P1-7 hard safety net — NEVER delete the mining keystore (identity),
        // which is permanent + unrecoverable. This stays absolute.
        //
        // v0.5.235 — the SPV state (header/store/spv_transaction_info.db/
        // logs-spv) is DELIBERATELY no longer protected: it must be wiped in
        // lockstep with geth (see the candidates comment above). The old
        // "preserve SPV" guard caused the arbiter-context decoupling that
        // wedged EID. The network identity (data/{geth|pgp}/nodekey) is
        // preserved separately by the backup/restore added in v0.5.231.
        const protectedPaths = [path.join(cdir, 'data', 'keystore')];
        candidates = candidates.filter((p) => {
            for (const prot of protectedPaths) {
                const rel = path.relative(p, prot);
                const wouldHit = (p === prot)
                    || (rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel));
                if (wouldHit) {
                    log.warn(
                        `${ENM_LOG_PREFIX} maintenance.chainResync: REFUSING to delete ${p} — `
                        + `it is or contains protected state (${path.basename(prot)})`,
                    );
                    return false;
                }
            }
            return true;
        });
        for (const p of candidates) {
            try {
                await fsp.rm(p, { recursive: true, force: true });
                removed.push(p);
                log.info(`${ENM_LOG_PREFIX} maintenance.chainResync removed: ${p}`);
            } catch (err) {
                log.warn(`${ENM_LOG_PREFIX} maintenance.chainResync rm ${p} failed: ${err.message}`);
            }
        }

        // v0.5.231 — Restore the preserved nodekey so geth boots with our
        // existing libp2p discovery key instead of generating a new one. We
        // unconditionally restore here (not only on autoRestart) because the
        // operator may also start the chain manually later — same reasoning
        // either way: a fresh peerset reconverges much faster when we keep
        // our identity. mkdir the geth/pgp dir if missing (rm above deleted
        // it); writeFile with 0o600 mirrors geth's own permissions.
        if (nodekeyBackup) {
            try {
                const dir = path.dirname(nodekeyBackup.restorePath);
                await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
                const buf = await fsp.readFile(nodekeyBackup.backupPath);
                await fsp.writeFile(nodekeyBackup.restorePath, buf, { mode: 0o600 });
                await fsp.unlink(nodekeyBackup.backupPath).catch(() => {});
                log.info(
                    `${ENM_LOG_PREFIX} maintenance.chainResync(${chainId}) — nodekey restored to `
                    + `${nodekeyBackup.restorePath}; network identity preserved across wipe`,
                );
            } catch (err) {
                log.warn(
                    `${ENM_LOG_PREFIX} maintenance.chainResync(${chainId}) — nodekey restore `
                    + `failed: ${err.message} — geth will generate a fresh identity`,
                );
            }
        }

        // v0.5.184 — F26 auto-heal path. The operator-driven resync (default)
        // resets the wizard + leaves the chain DISABLED so the operator walks
        // Card B2. For an UNATTENDED self-heal that would strand the chain off
        // forever — defeating the "no manual step" goal. With autoRestart we
        // instead RE-ENABLE the chain and start it so it re-syncs clean from
        // peers automatically. The wipe already removed the forked chaindata;
        // the mining keystore is preserved (filter above), so the chain comes
        // back with the same identity on a fresh, canonical chain.
        if (opts && opts.autoRestart) {
            try {
                await ConfigStore.update((cfg) => {
                    if (cfg.chains && cfg.chains[chainId]) { cfg.chains[chainId].enabled = true; }
                }, { logger: log });
            } catch (err) {
                log.warn(
                    `${ENM_LOG_PREFIX} maintenance.chainResync(autoRestart): re-enable ${chainId} `
                    + `failed: ${err.message} — chain may stay disabled`,
                );
            }
            let autoRestarted = false;
            try {
                // cfg.chains[chainId] is the runnable shape adapter.start expects
                // (binaryPath/ports/miner/pbft) — same shape the engine's restart
                // path loads. Reload AFTER the re-enable so enabled=true is seen.
                const cfg = await ConfigStore.load();
                const runCfg = cfg && cfg.chains && cfg.chains[chainId];
                if (!runCfg) { throw new Error(`no config for ${chainId} after wipe`); }
                await adapter.start(runCfg);
                autoRestarted = true;
                log.info(
                    `${ENM_LOG_PREFIX} maintenance.chainResync(${chainId}) — data wiped + chain `
                    + 're-enabled and restarted (auto-resync); re-syncing clean from peers',
                );
            } catch (err) {
                log.error(
                    `${ENM_LOG_PREFIX} maintenance.chainResync(autoRestart): start ${chainId} `
                    + `failed: ${err.message} — chain wiped but not running`,
                );
            }
            return {
                action: 'chain-resync',
                chainId,
                removedPaths: removed,
                keystoreBackup,
                autoRestarted,
                wizardReturns: false,
            };
        }

        // beta.3.42 — instead of auto-restarting the chain (which would
        // just begin a silent re-sync), reset the setup_state so the
        // wizard re-appears at Card B2 (bootstrap-vs-genesis). Keystore
        // stays preserved (keystore_imported=1) so the operator doesn't
        // walk Card C again. The operator explicitly asked for this:
        // "Chain resync should bring back the wizard while understanding
        // what is saved so things don't duplicate".
        const setupStateReset = await _resetSetupStateForResync(opts).catch((err) => {
            log.warn(`${ENM_LOG_PREFIX} maintenance.chainResync: setup_state reset failed: ${err.message}`);
            return { ok: false, error: err.message };
        });

        log.info(`${ENM_LOG_PREFIX} maintenance.chainResync(${chainId}) — data wiped, wizard will reappear at bootstrap step`);
        return {
            action: 'chain-resync',
            chainId,
            removedPaths: removed,
            keystoreBackup,
            setupStateReset,
            wizardReturns: true,
        };
    } finally {
        _release();
    }
}

/**
 * Reset rows in enm_setup_state so the wizard reappears at the
 * bootstrap-vs-genesis step. Keeps keystore_imported + binary_path
 * (operator has these on disk; making them walk through generation
 * again would clobber the existing keystore.dat). Wipes
 * config_generated + completed.
 *
 * We don't know which wallet_address rows to touch (there may be
 * multiple operators sharing a node). Reset every row — chain
 * data is shared between operators, so a chain resync invalidates
 * everyone's wizard state.
 *
 * @returns {Promise<{ok: boolean, rowsAffected?: number, error?: string}>}
 */
async function _resetSetupStateForResync(opts) {
    const extensionHandle = opts && opts.extensionHandle;
    // Falls back to require()ing ChainRegistry to grab the engine's
    // DB handle if the caller didn't pass one.
    let db;
    if (extensionHandle && typeof extensionHandle.import === 'function') {
        try { db = extensionHandle.import('data').db; } catch (_) { /* fall through */ }
    }
    if (!db) {
        // ChainRegistry caches the DB handle too — works inside ENM's
        // own process without needing the route layer to pass it.
        try {
            const cr = require('./ChainRegistry');
            const eng = cr.getEngine && cr.getEngine();
            db = eng && eng.getDb && eng.getDb();
        } catch (_) { /* swallow */ }
    }
    if (!db || typeof db.write !== 'function') {
        return { ok: false, error: 'no DB handle' };
    }
    const r = await db.write(
        `UPDATE enm_setup_state SET
            current_step = 'bootstrap',
            config_generated = 0,
            completed = 0,
            completed_at = NULL,
            updated_at = ?
         WHERE 1=1`,
        [Date.now()],
    );
    return { ok: true, rowsAffected: (r && (r.changes || r.rowsAffected)) || 0 };
}

/**
 * v0.5.232 — Reset ENM to a fresh-install state, IN PLACE.
 *
 * Replaces the retired uninstall + nuke + identity/reset paths. The script:
 *   1. Sleeps 2s so Express flushes the 200 response.
 *   2. Kills ALL chain + oracle children (mainchain/esc/eid/pg/arbiter +
 *      3 oracle node scripts).
 *   3. rm -rf the extension data dir (chain data, keystore, nodekey,
 *      enm.db, audit log, healing history) + the backups dir.
 *   4. SIGKILL ENM's own PID.
 *   5. *** DOES NOT touch the bundle dir or the installed_apps sqlite row ***
 *      pc2-node's process supervisor respawns ENM with empty data → the
 *      setup wizard reappears, and the iframe never loses its server
 *      (which was the root cause of the "another pc2 inside the app"
 *      symptom: the pre-v0.5.232 nuke deleted the bundle, so pc2-node's
 *      fallback served the pc2 desktop root into the orphaned ENM iframe).
 *
 * @param {{ log?: object }} opts
 * @returns {Promise<{ action: 'reset-everything', logFile: string }>}
 */
async function resetEverything(opts) {
    _acquire('reset-everything');
    const log = (opts && opts.log) || _noopLog();
    try {
        const dataDir = _dataDirSafe();
        const logFile = `/tmp/enm-reset-${Date.now()}.log`;
        const sh = _buildTeardownScript({
            label: 'reset-everything',
            logFile,
            wipeDataDir: true,
            preserveBundle: true,   // KEY: keeps bundle + installed_apps row
            dataDir,
        });
        const child = spawn('bash', ['-c', sh], { detached: true, stdio: 'ignore' });
        child.unref();
        log.info(
            `${ENM_LOG_PREFIX} maintenance.resetEverything queued (log → ${logFile}, `
            + `data dir → ${dataDir}, bundle preserved for pc2-node respawn)`,
        );
        return { action: 'reset-everything', logFile };
    } finally {
        _release();
    }
}

/**
 * Public status accessor — used by the route layer to surface "an
 * action is in flight" without re-attempting the lock.
 */
function status() {
    if (!_busy) { return { busy: false, action: null, startedAtMs: null }; }
    return { busy: true, action: _busy.action, startedAtMs: _busy.startedAtMs };
}

// ============================================================================
// Helpers
// ============================================================================

function _dataDirSafe() {
    try {
        return DataDir.enmDataDir();
    } catch (_) {
        return SELF_DATA_DIR_DEFAULT;
    }
}

/**
 * Compose the detached bash script that ENM hands off to before it
 * dies. The script always:
 *   1. Sleeps 2s so the HTTP response flushes.
 *   2. Kills child processes ENM was supervising (scope depends on label).
 *   3. (preserveBundle=false only) Removes the installed_apps sqlite row +
 *      the bundle install dir so pc2-node forgets us.
 *   4. (wipeDataDir=true only) rm -rf the extension data dir + backups dir.
 *   5. SIGKILL our own PID.
 *
 * v0.5.232 — added `preserveBundle` mode for the in-app "Reset ENM" flow.
 * When true, the bundle + installed_apps row stay in place so pc2-node's
 * process supervisor respawns ENM with empty data → the setup wizard
 * appears, and the iframe never loses its server (which was the root cause
 * of the "another pc2 inside the app" symptom: pre-v0.5.232 nuke deleted
 * the bundle, so pc2-node's fallback served the pc2 desktop root into the
 * orphaned ENM iframe).
 *
 * v0.5.232 — `killChainPattern` widened from ".*ela" to also catch eid /
 * esc / pg / arbiter / oracle node scripts when label is 'reset-everything'.
 * Necessary because the reset must clear ALL chain children, not just ela.
 *
 * @param {{
 *   label:'uninstall'|'nuke'|'reset-everything',
 *   logFile:string,
 *   wipeDataDir:boolean,
 *   preserveBundle?:boolean,
 *   dataDir?:string
 * }} opts
 * @returns {string} script text
 */
function _buildTeardownScript(opts) {
    const label = opts.label;
    const logFile = opts.logFile;
    const wipe = !!opts.wipeDataDir;
    const preserveBundle = !!opts.preserveBundle;
    const dataDir = opts.dataDir || SELF_DATA_DIR_DEFAULT;
    // The pc2-node SQLite row removal. We try the sqlite3 CLI first
    // (standard on Ubuntu); if it's missing, we fall back to invoking
    // node with our own better-sqlite3 from node_modules. If both fail,
    // the file disappears but the sqlite row stays — operator sees a
    // ghost app on the dashboard until next pc2-node restart, at which
    // point the boot sweeper reaps the rowless install. Worst case
    // is cosmetic, not data-loss.
    //
    // v0.5.232 — preserveBundle=true (reset-everything) keeps this row so
    // pc2-node respawns ENM. Skipped entirely in that branch.
    const sqliteCleanup = preserveBundle ? '' :
        `  echo "[${label} $(date -u +%FT%TZ)] removing installed_apps row"\n`
        + `  if command -v sqlite3 >/dev/null 2>&1; then\n`
        + `    sqlite3 '${_shellEscape(PC2_SQLITE_PATH)}' \\\n`
        + `      "DELETE FROM installed_apps WHERE app_name='${_shellEscape(APP_NAME)}'" \\\n`
        + `      && echo "  sqlite3 cli: row deleted" \\\n`
        + `      || echo "  sqlite3 cli: failed"\n`
        + `  else\n`
        + `    node -e "try { const sq = require('${_shellEscape(INSTALLED_APPS_DIR)}/backend/node_modules/better-sqlite3'); const db = new sq('${_shellEscape(PC2_SQLITE_PATH)}'); db.prepare(\\"DELETE FROM installed_apps WHERE app_name='${_shellEscape(APP_NAME)}'\\").run(); db.close(); console.log('  better-sqlite3: row deleted'); } catch (e) { console.log('  fallback failed:', e.message); }" || echo "  no sqlite available; boot sweeper will reap on next pc2-node restart"\n`
        + `  fi\n`;
    // v0.5.232 — kill scope depends on label. reset-everything kills ALL
    // chain children + oracle scripts (8 services); uninstall/nuke only
    // kill ela (legacy BPoS-era behaviour; the data dir gets rm'd next so
    // surviving children would just exit on missing files anyway). Both
    // forms tolerate "no process found" — that's the success case after
    // a clean stop.
    const killChildren = label === 'reset-everything'
        ? `  echo "[${label} $(date -u +%FT%TZ)] killing all chain + oracle children"\n`
          + `  pkill -9 -f '/var/lib/pc2/data/extensions/elastos-node-manager/bin' || true\n`
          + `  pkill -9 -f '/var/lib/pc2/data/extensions/elastos-node-manager/_oracle-scripts' || true\n`
          + `  echo "  done"\n`
        : `  echo "[${label} $(date -u +%FT%TZ)] killing ela children"\n`
          + `  pkill -9 -f '/var/lib/pc2/data/extensions/elastos-node-manager/.*ela' && echo "  killed" || echo "  no ela process"\n`;
    const removeBundle = preserveBundle ? '' :
        `  echo "[${label} $(date -u +%FT%TZ)] removing bundle dir"\n`
        + `  rm -rf '${_shellEscape(INSTALLED_APPS_DIR)}' || true\n`;
    const removeData = wipe
        ? `  echo "[${label} $(date -u +%FT%TZ)] rm -rf data dir + backups"\n`
          + `  rm -rf '${_shellEscape(dataDir)}' || true\n`
          + `  # Backups live one level outside the extension dir per\n`
          + `  # EnmStorageMaintenance convention.\n`
          + `  rm -rf '/var/lib/pc2/data/backups/elastos-node-manager' || true\n`
        : `  echo "[${label} $(date -u +%FT%TZ)] preserving data dir at ${_shellEscape(dataDir)}"\n`;
    const killSelf =
        `  echo "[${label} $(date -u +%FT%TZ)] killing ENM"\n`
        + `  pkill -9 -f 'elastos-node-manager.*server.js' || true\n`
        + `  echo "[${label} $(date -u +%FT%TZ)] done"\n`;
    return (
        `(\n`
        + `  sleep 2\n`
        + killChildren
        + sqliteCleanup
        + removeBundle
        + removeData
        + killSelf
        + `) > '${_shellEscape(logFile)}' 2>&1 &\n`
        + `disown\n`
    );
}

/**
 * Copy the chain's signing/mining identity to
 * PC2_DATA_DIR/backups/elastos-node-manager/ before a destructive resync.
 * Returns the backup path (or, for EVM, the FIRST copied path) or null if
 * there's nothing to back up (pre-setup operator). Idempotent and safe.
 *
 * P1 (v0.5.183) — class-aware identity backup. The mainchain (class A) keeps
 * its identity in <chainDir>/keystore.dat. EVM sidechains (esc/eid/pg, class
 * B) keep their MINING identity in <chainDir>/data/keystore/UTC--* (geth's
 * standard keystore layout) — there is NO keystore.dat for them. Before this
 * fix, _backupKeystoreNow looked only for keystore.dat, so a resync of an EVM
 * chain returned null and the operator's mining key was NEVER backed up ahead
 * of the wipe. We now also copy the EVM UTC--* key file(s). The resync wipe
 * list already preserves data/keystore (P1-7), so this is defence-in-depth —
 * but it makes the backup honest about what it captured.
 *
 * We also mirror the AES master key (encryption.key) so a backups-only
 * migration can still decrypt the operator's stored passwords — same
 * data-loss rationale as the keystore-import archive path.
 */
async function _backupKeystoreNow(chainId, log) {
    const cdir = DataDir.chainDir(chainId);
    // PC2_DATA_DIR convention from server.js — fall back to two levels
    // above enmDataDir so we land at /var/lib/pc2/data/backups/...
    const pc2Data = process.env.PC2_DATA_DIR
        || path.dirname(path.dirname(DataDir.enmDataDir()));
    const backupRoot = path.join(pc2Data, 'backups', 'elastos-node-manager');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');

    // Determine chain class. Prefer the adapter's declared class; fall back
    // to a filesystem probe (data/keystore exists ⇒ treat as EVM) so a
    // missing/odd adapter can't silently skip an EVM key backup.
    let isEvm = false;
    try {
        const adapter = ChainRegistry.getAdapter(chainId);
        isEvm = adapter && adapter.chainClass === 'B';
    } catch (_) { /* adapter unavailable — fall through to fs probe */ }
    const evmKeystoreDir = path.join(cdir, 'data', 'keystore');
    if (!isEvm && fs.existsSync(evmKeystoreDir)) { isEvm = true; }

    // --- Class A (mainchain): keystore.dat ---
    const ksDat = path.join(cdir, KEYSTORE_FILENAME);
    let firstBackup = null;
    if (fs.existsSync(ksDat)) {
        await fsp.mkdir(backupRoot, { recursive: true, mode: 0o700 });
        const dst = path.join(backupRoot, `keystore-${chainId}-${ts}.dat`);
        await fsp.copyFile(ksDat, dst);
        await fsp.chmod(dst, 0o600);
        log.info(`${ENM_LOG_PREFIX} maintenance: keystore backed up → ${dst}`);
        firstBackup = dst;
    }

    // --- Class B (EVM esc/eid/pg): data/keystore/UTC--* mining key(s) ---
    if (isEvm) {
        try {
            const entries = await fsp.readdir(evmKeystoreDir).catch(() => []);
            const utcFiles = entries.filter((n) => n.startsWith('UTC--'));
            if (utcFiles.length > 0) {
                await fsp.mkdir(backupRoot, { recursive: true, mode: 0o700 });
            }
            for (const name of utcFiles) {
                const keyDst = path.join(backupRoot, `evm-keystore-${chainId}-${ts}-${name}`);
                await fsp.copyFile(path.join(evmKeystoreDir, name), keyDst);
                await fsp.chmod(keyDst, 0o600);
                log.info(`${ENM_LOG_PREFIX} maintenance: EVM mining key backed up → ${keyDst}`);
                if (!firstBackup) { firstBackup = keyDst; }
            }
        } catch (err) {
            log.warn(`${ENM_LOG_PREFIX} maintenance: EVM keystore backup failed: ${err.message}`);
        }
    }

    if (!firstBackup) {
        log.info(`${ENM_LOG_PREFIX} maintenance: no keystore/mining key for ${chainId} to back up`);
        return null;
    }

    // P1 (v0.5.183) — mirror the AES master key so the backup is self-
    // sufficient for password decryption after a host migration. Best-effort.
    await _backupEncryptionKeyInto(backupRoot, ts, log);
    return firstBackup;
}

/**
 * P1 (v0.5.183) — copy encryption.key into the backup dir (mode 0600) so a
 * config+backups-only migration can still decrypt stored passwords. Mirrors
 * EnmKeystoreIdentity._backupEncryptionKeyInto. Idempotent + best-effort:
 * returns null on any failure so it never aborts a keystore backup.
 */
async function _backupEncryptionKeyInto(backupRoot, ts, log) {
    try {
        const keySrc = DataDir.encryptionKeyPath();
        if (!fs.existsSync(keySrc)) { return null; }
        const keyDst = path.join(backupRoot, `encryption-key-${ts}.key`);
        await fsp.copyFile(keySrc, keyDst);
        await fsp.chmod(keyDst, 0o600);
        log.info(`${ENM_LOG_PREFIX} maintenance: backed up encryption.key → ${keyDst}`);
        return keyDst;
    } catch (err) {
        log.warn(
            `${ENM_LOG_PREFIX} maintenance: encryption.key backup failed (${err.message}) — `
            + 'keystore archived, but stored passwords may be unrecoverable if the master key is lost',
        );
        return null;
    }
}

function _noopLog() {
    return { info() {}, warn() {}, error() {}, debug() {} };
}

/**
 * Single-quote shell-escape: replace ' with '\''. The strings we
 * receive (tag names, paths under /var/lib/pc2/data, the owner token)
 * are tightly constrained upstream — Joi schemas reject anything that
 * isn't [a-fA-F0-9.] for the tag, [a-z0-9-_/.] for chainId/path. This
 * escape is defence in depth, not the primary boundary.
 */
function _shellEscape(s) {
    return String(s).replace(/'/g, `'\\''`);
}

/**
 * Compare two semver-shaped strings like "0.2.0-beta.3.32". Returns
 * true iff `a` is strictly newer than `b`. Handles the beta.M.N suffix
 * shape we use: lexical comparison would order beta.3.10 < beta.3.9,
 * so we split on dots and compare numerically where possible.
 */
function _semverIsNewer(a, b) {
    if (!a) return false;
    if (!b) return true;
    const ta = _semverTokenize(a);
    const tb = _semverTokenize(b);
    const n = Math.max(ta.length, tb.length);
    for (let i = 0; i < n; i += 1) {
        const xa = ta[i];
        const xb = tb[i];
        if (xa === undefined) { return false; } // a is shorter ⇒ older
        if (xb === undefined) { return true; }  // b is shorter ⇒ a is newer
        if (typeof xa === 'number' && typeof xb === 'number') {
            if (xa !== xb) { return xa > xb; }
        } else {
            const sa = String(xa), sb = String(xb);
            if (sa !== sb) { return sa > sb; }
        }
    }
    return false;
}

function _semverTokenize(s) {
    // "0.2.0-beta.3.32" → [0, 2, 0, "beta", 3, 32]
    return String(s).split(/[.\-]/).map((t) => {
        if (/^\d+$/.test(t)) { return parseInt(t, 10); }
        return t;
    });
}

/**
 * HTTPS GET with User-Agent (GitHub requires it) returning parsed
 * JSON. 6-second timeout, follow up to 3 redirects.
 */
function _httpsGetJson(url, depth) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = https.request({
            method: 'GET',
            hostname: u.hostname,
            path: u.pathname + u.search,
            port: u.port || 443,
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            timeout: 6_000,
        }, (res) => {
            // Follow redirects manually so we keep our headers on the hop.
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const d = (depth || 0) + 1;
                if (d > 3) { return reject(new Error('Too many redirects')); }
                res.resume();
                return _httpsGetJson(res.headers.location, d).then(resolve, reject);
            }
            let buf = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { buf += c; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 200)}`));
                }
                try { resolve(JSON.parse(buf)); }
                catch (err) { reject(new Error(`JSON parse failed: ${err.message}`)); }
            });
        });
        req.on('timeout', () => req.destroy(new Error('Request timeout')));
        req.on('error', reject);
        req.end();
    });
}

module.exports = {
    checkLatestVersion,
    update,
    chainResync,
    resetEverything,
    status,
    readOwnerToken,
    // exported for tests
    _internals: {
        _semverIsNewer,
        _shellEscape,
    },
};
