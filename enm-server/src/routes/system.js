/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * routes/system.js — system info endpoints (Phase 1b skeleton).
 *
 * Phase 1b: GET /api/system/status returns OS + disk + extension version.
 * Phase 5 expansion: CPU/RAM live stats, Docker daemon status (n/a since
 * Ubuntu-only native), orphan-process detection.
 */

'use strict';

const express = require('express');
const os = require('node:os');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

// beta.3.20 — synchronous fs used for the existsSync probe in
// GET /system/storage. Wrapped in a function so the module can be
// loaded in environments that mock `fs` (the test-server build).
function fsSync() { return fs; }

/**
 * beta.3.20 — recursive directory size in bytes. Catches every
 * stat/readdir error and returns 0 for that branch so a single
 * unreadable file doesn't fail the whole walk. Bounded depth (32)
 * to defeat symlink loops; bounded entries (50k) to keep the walk
 * cheap on pathological dirs.
 */
async function dirSizeSafe(p, depth) {
    if (typeof p !== 'string' || p.length === 0) { return 0; }
    if ((depth || 0) > 32) { return 0; }
    let stat;
    try { stat = await fsp.stat(p); }
    catch (_) { return 0; }
    if (stat.isFile()) { return stat.size; }
    if (!stat.isDirectory()) { return 0; }
    let entries;
    try { entries = await fsp.readdir(p); }
    catch (_) { return 0; }
    let total = 0;
    let count = 0;
    for (const name of entries) {
        if (++count > 50_000) { break; }
        total += await dirSizeSafe(path.join(p, name), (depth || 0) + 1);
    }
    return total;
}

async function fileSizeSafe(p) {
    if (typeof p !== 'string' || p.length === 0) { return 0; }
    try {
        const s = await fsp.stat(p);
        return s.isFile() ? s.size : 0;
    } catch (_) { return 0; }
}

function bytesToMb(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) { return 0; }
    return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

const { ENM_LOG_PREFIX, errorBody, successBody } = require('../services/EnmConstants');
const { limit } = require('../services/EnmRateLimit');
const { readActorWallet } = require('../auth/OwnerCheckMiddleware');
const osPreflight = require('../services/OsPreflight');
const diskPreflight = require('../services/DiskPreflight');
const { enmDataDir, chainDir } = require('../services/DataDir');
const { round } = require('../services/EnmFormat');
const ExtIpResolver = require('../services/ExtIpResolver');
const ChainRegistry = require('../services/ChainRegistry');
const ConfigStore = require('../services/ConfigStore');

const PKG = require('../../package.json');

// v0.5.203 — per-chain disk-usage cache for /system/usage.
// v0.5.208 — TTL bumped 30s → 60s.
// v0.5.210 — async refresh pattern. Pre-v0.5.210, when the cache TTL expired,
// the next /system/usage call BLOCKED on the dirSizeSafe walk (sequential
// awaits across N chains, each walking a multi-GB tree). On a CPU-saturated
// host with mainchain doing leveldb compaction (200%+ CPU contending with
// disk I/O), this walk could take 15+ seconds — long enough for the
// frontend's /system/usage poll to time out and report "System status
// unavailable". Now: stale cache returned IMMEDIATELY; refresh fires in the
// background and lands in the cache for the NEXT poll. Worst-case operator
// staleness: 60s of slightly-old disk numbers. Acceptable since chain data
// grows by MB/min, not GB.
let _perChainDiskCache = { ts: 0, data: {} };
let _perChainDiskRefreshInFlight = false;
function getPerChainDiskMb() {
    const now = Date.now();
    // Always return cache immediately — sync, never blocks the response.
    const stale = (now - _perChainDiskCache.ts) >= 60_000;
    // If stale and no refresh already in flight, kick a background refresh.
    if (stale && !_perChainDiskRefreshInFlight) {
        _perChainDiskRefreshInFlight = true;
        refreshPerChainDisk().finally(() => { _perChainDiskRefreshInFlight = false; });
    }
    return _perChainDiskCache.data;
}
async function refreshPerChainDisk() {
    const chainsRoot = path.join(enmDataDir(), 'chains');
    let chainIds;
    try {
        chainIds = (await fsp.readdir(chainsRoot)).filter((n) => !n.startsWith('.'));
    } catch (_) {
        _perChainDiskCache = { ts: Date.now(), data: {} };
        return;
    }
    const out = {};
    await Promise.all(chainIds.map(async (cid) => {
        try {
            const bytes = await dirSizeSafe(path.join(chainsRoot, cid));
            out[cid] = Math.round((bytes / (1024 * 1024)) * 10) / 10;
        } catch (_) { out[cid] = null; }
    }));
    _perChainDiskCache = { ts: Date.now(), data: out };
}

/**
 * @param {object} extensionHandle
 * @returns {import('express').Router}
 */
function build(extensionHandle) {
    const router = express.Router();

    /**
     * GET /system/status
     * Aggregate health snapshot — what the dashboard polls every 30s.
     */
    router.get('/status', limit('read'), async (req, res) => {
        const wallet = readActorWallet(req);
        if (!wallet) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const memTotalGb = os.totalmem() / (1024 ** 3);
            const memFreeGb = os.freemem() / (1024 ** 3);
            const loadAvg = os.loadavg();
            const disk = await diskPreflight.check(enmDataDir());
            const osCheck = osPreflight.check();

            return res.json(successBody({
                version: PKG.version,
                node: {
                    platform: os.platform(),
                    release: os.release(),
                    arch: os.arch(),
                    nodeVersion: process.version,
                    uptimeSec: Math.floor(process.uptime()),
                },
                cpu: {
                    cores: os.cpus().length,
                    loadAvg1m: loadAvg[0],
                    loadAvg5m: loadAvg[1],
                    loadAvg15m: loadAvg[2],
                },
                memory: {
                    totalGb: round(memTotalGb, 2),
                    freeGb: round(memFreeGb, 2),
                    usedPct: round(((memTotalGb - memFreeGb) / memTotalGb) * 100, 2),
                },
                disk,
                os: osCheck,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} /system/status error: ${err.message}`);
            return res.status(500).json(errorBody('Failed to read system status.'));
        }
    });

    /**
     * GET /system/identity
     *
     * beta.3.13 — single source for the Node-identity dashboard card.
     * Joins three concepts the operator needs to see in one place:
     *
     *   1. walletAddress  — PC2 session wallet. The operator's login
     *      identity for ENM (authorization, audit log attribution).
     *      ENM never asks this wallet to sign chain transactions.
     *
     *   2. keystore       — the ELA producer keystore stored on this
     *      server. publicKey is what operators paste into Essentials
     *      to register a producer; address is the on-chain ELA address
     *      derived from that keystore (signs blocks + receives BPoS
     *      rewards). balanceEla is best-effort via getbalancebyaddr.
     *
     *   3. producer       — when registered, surface state + votes +
     *      deposit + claimable rewards so the operator gets a single-
     *      glance "this is my node on-chain" view. null when the
     *      pubkey isn't registered yet OR the chain isn't running.
     *
     * Best-effort: any RPC failure degrades that section to null
     * without failing the whole response (the dashboard card already
     * has to render before the chain is up).
     */
    router.get('/identity', limit('read'), async (req, res) => {
        const wallet = readActorWallet(req);
        if (!wallet) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const ks = ChainRegistry.getKeystoreService();
            const keystoreExists = await ks.exists();

            let publicKey = null;
            let address = null;
            if (keystoreExists) {
                const identityPath = path.join(chainDir('mainchain'), 'keystore-account.json');
                try {
                    const raw = await fsp.readFile(identityPath, 'utf8');
                    const parsed = JSON.parse(raw);
                    publicKey = parsed.publicKey || null;
                    address = parsed.address || null;
                } catch (_) { /* missing cache — surface as null */ }
            }

            let producer = null;

            // Only try RPC when we have a node public key AND the chain
            // is alive. beta.3.15: dropped the keystore-address balance
            // lookup entirely — the node signing address never holds
            // funds (verified at dpos/state/arbitrators.go:732-801), so
            // surfacing its balance was both misleading and broken
            // (getbalancebyaddr isn't on the JSON-RPC interface anyway).
            if (publicKey) {
                try {
                    const cfg = await ConfigStore.load();
                    const chainCfg = cfg.chains && cfg.chains.mainchain;
                    const chainAlive = ChainRegistry.getProcessService()
                        .statusSync('mainchain');
                    if (chainCfg && chainAlive && chainAlive.alive) {
                        const adapter = ChainRegistry.getAdapter('mainchain');
                        const rpc = adapter.rpcClient(chainCfg);

                        const pi = await rpc.getproducerinfo(publicKey)
                            .catch(() => null);
                        if (pi && (pi.state || pi.ownerpublickey || pi.nickname)) {
                            // Deposit is keyed by OWNER public key (the
                            // Essentials wallet). We have it from
                            // getproducerinfo.ownerpublickey.
                            const ownerPubkey = pi.ownerpublickey || null;
                            const deposit = ownerPubkey
                                ? await rpc.getdepositcoin(ownerPubkey).catch(() => null)
                                : null;

                            // Rewards are keyed by OWNER address; we don't
                            // derive that here (the chain's stake-prefix
                            // address conversion is non-trivial without
                            // pulling in crypto primitives). The Essentials
                            // app surfaces this — operator can check there.
                            // Leaving rewards null until we add an address
                            // derivation helper or operators ask for it.
                            producer = {
                                state: pi.state || null,
                                nickname: pi.nickname || null,
                                url: pi.url || null,
                                votes: pi.votes || null,
                                dposv2votes: pi.dposv2votes || null,
                                registerheight: pi.registerheight || null,
                                illegalheight: pi.illegalheight || null,
                                inactiveheight: pi.inactiveheight || null,
                                ownerPublicKey: ownerPubkey,
                                deposit: deposit && (deposit.available || deposit) || null,
                            };
                        }
                    }
                } catch (_) { /* graceful degrade — leave producer null */ }
            }

            // v0.5.229 (audit 2026-05-27) — CR Council membership lookup,
            // in PARALLEL with the BPoS producer lookup above. Council and
            // BPoS are independent roles on Elastos; an operator can be
            // one, the other, both, or neither. Pre-229 the endpoint only
            // surfaced BPoS state — so every Council operator saw "BPoS
            // supernode: not yet registered" on the dashboard regardless
            // of their actual CR Committee binding. node.sh:1117-1129
            // shows the reference contract: query listcurrentcrs +
            // listproducers SEPARATELY and surface BOTH side-by-side.
            //
            // CrMembershipService.detectCrMembership handles failure
            // modes (no pubkey / no RPC / Committee not in election
            // period) by returning a sentinel `source` value — we pass
            // that through so the frontend can render the right copy
            // even when isCrMember is false (e.g. "not bound" vs
            // "Committee not currently active").
            let crMember = null;
            if (publicKey) {
                try {
                    const cfg2 = await ConfigStore.load();
                    const CrMembershipService = require('../services/CrMembershipService');
                    crMember = await CrMembershipService.detectCrMembership(cfg2, {
                        log: extensionHandle.log,
                    });
                } catch (_) { /* graceful degrade — leave crMember null */ }
            }

            // v0.5.229 — derive setup-role hint from cfg.global.council
            // so the frontend can pick Council-vs-BPoS UI even before
            // listcurrentcrs returns (e.g. during mainchain warm-up).
            // Defaults to 'unknown' when no install path can be inferred.
            let setupRole = 'unknown';
            try {
                const cfg3 = await ConfigStore.load();
                if (cfg3 && cfg3.global && cfg3.global.council
                    && cfg3.global.council.installed === true) {
                    setupRole = 'council';
                } else if (publicKey && producer && producer.state) {
                    setupRole = 'bpos';
                }
            } catch (_) { /* leave setupRole = 'unknown' */ }

            // beta.3.52 — `walletAddress` removed from response. ENM's identity
            // is the keystore (ELA mainchain producer), NOT the PC2 owner wallet.
            // The two are completely separate concerns:
            //   - PC2 wallet authenticates the request (handled by requireOwner)
            //   - ENM keystore is what this node represents on-chain
            // Returning the PC2 wallet here implied they were coupled.
            return res.json(successBody({
                keystore: {
                    exists: keystoreExists,
                    publicKey,
                    address,
                },
                producer,
                // v0.5.229 — CR Council membership (null when no pubkey).
                // Frontend treats `isCrMember === true` as the canonical
                // signal to render Council UI; otherwise falls back to
                // producer + setupRole to decide BPoS / unregistered.
                crMember,
                setupRole,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} /system/identity error: ${err.message}`);
            return res.status(500).json(errorBody('Failed to read node identity.'));
        }
    });

    /**
     * GET /system/storage
     *
     * beta.3.20 (Phase 3) — disk-usage breakdown + auto-backup
     * status for the Settings Storage section. Read-only; aggregates
     * directory sizes from the chain data dir, log subdirs, the ENM
     * SQLite DB, and the keystore-backup root.
     *
     * Output shape:
     * {
     *   diskMb: {
     *     chainData: number,   // chains/<id>/elastos minus logs
     *     logs:      number,   // chains/<id>/elastos/logs
     *     auditDb:   number,   // enm.db
     *     backups:   number,   // backups/elastos-node-manager
     *     total:     number,
     *   },
     *   backup: {
     *     lastAt:        number|null,   // epoch ms
     *     lastPath:      string|null,
     *     intervalDays:  number,
     *     keepCount:     number,
     *     keystorePresent: boolean,     // true iff chains/<id>/keystore.dat exists
     *   },
     *   logRotation: { gzipAfterDays, purgeAfterDays },
     * }
     */
    router.get('/storage', limit('read'), async (req, res) => {
        const wallet = readActorWallet(req);
        if (!wallet) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const cfg = await ConfigStore.load();
            const chainsDir = path.join(enmDataDir(), 'chains');
            const mainchainRoot = chainDir('mainchain');
            const elastosRoot = path.join(mainchainRoot, 'elastos');
            const logsRoot = path.join(elastosRoot, 'logs');
            const dbPath = path.join(enmDataDir(), 'enm.db');
            const pc2Data = process.env.PC2_DATA_DIR
                || path.dirname(path.dirname(enmDataDir()));
            const backupRoot = path.join(pc2Data, 'backups', 'elastos-node-manager');

            // Walk sizes in parallel. Each walk catches its own errors
            // so a missing dir (pre-setup) returns 0 instead of
            // throwing the whole request.
            const [elastosBytes, logsBytes, dbBytes, backupsBytes] = await Promise.all([
                dirSizeSafe(elastosRoot),
                dirSizeSafe(logsRoot),
                fileSizeSafe(dbPath),
                dirSizeSafe(backupRoot),
            ]);
            // Chain data = elastos minus logs (don't double-count).
            const chainDataBytes = Math.max(0, elastosBytes - logsBytes);

            const keystoreSrc = path.join(mainchainRoot, 'keystore.dat');
            const keystorePresent = fsSync().existsSync(keystoreSrc);

            const g = (cfg && cfg.global) || {};
            const b = (g.backup) || {};
            const lr = (g.logRotation) || {};

            const diskMb = {
                chainData: bytesToMb(chainDataBytes),
                logs:      bytesToMb(logsBytes),
                auditDb:   bytesToMb(dbBytes),
                backups:   bytesToMb(backupsBytes),
                total:     bytesToMb(chainDataBytes + logsBytes + dbBytes + backupsBytes),
            };
            const backup = {
                lastAt:          Number.isFinite(b.lastKeystoreBackupAt) ? b.lastKeystoreBackupAt : null,
                lastPath:        typeof b.lastKeystoreBackupPath === 'string' ? b.lastKeystoreBackupPath : null,
                intervalDays:    Number.isFinite(b.keystoreIntervalDays) ? b.keystoreIntervalDays : 7,
                keepCount:       Number.isFinite(b.keystoreKeepCount) ? b.keystoreKeepCount : 4,
                keystorePresent,
                backupDir:       backupRoot,
            };
            const logRotation = {
                gzipAfterDays:  Number.isFinite(lr.gzipAfterDays) ? lr.gzipAfterDays : 7,
                purgeAfterDays: Number.isFinite(lr.purgeAfterDays) ? lr.purgeAfterDays : 30,
            };

            return res.json(successBody({ diskMb, backup, logRotation }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} /system/storage error: ${err.message}`);
            return res.status(500).json(errorBody('Failed to read storage status.'));
        }
    });

    /**
     * v0.5.203 — GET /system/usage
     *
     * The multi-chain overview's top-row "usage cards" data source. Returns
     * a single compact snapshot of host-level CPU + memory + disk + a
     * per-chain disk breakdown.
     *
     * Why a separate endpoint from /system/status: /status is broad (OS +
     * preflight + node version) and predates the overview redesign. /usage
     * is shaped for the four cards exactly + adds the per-chain disk
     * breakdown (the previous /storage endpoint only carries top-level
     * totals).
     *
     * Cost: cheap. CPU + memory are O(1) `os.*` calls. Disk-free is one
     * statfs. Per-chain disk uses a 30-second module-level cache so the 1s
     * overview tick doesn't trigger a `du`-walk every second.
     */
    router.get('/usage', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const memTotalGb = os.totalmem() / (1024 ** 3);
            const memFreeGb = os.freemem() / (1024 ** 3);
            const memUsedGb = memTotalGb - memFreeGb;
            const loadAvg = os.loadavg();
            const cpuCores = os.cpus().length;

            // Disk — total / used / free at the ENM data dir mountpoint.
            const dataDir = enmDataDir();
            await fsp.mkdir(dataDir, { recursive: true });
            let diskTotalGb = null, diskFreeGb = null, diskUsedGb = null;
            try {
                if (typeof fsp.statfs === 'function') {
                    const sf = await fsp.statfs(dataDir);
                    diskTotalGb = (sf.blocks * sf.bsize) / (1024 ** 3);
                    diskFreeGb = (sf.bavail * sf.bsize) / (1024 ** 3);
                    diskUsedGb = diskTotalGb - diskFreeGb;
                }
            } catch (_) { /* statfs unavailable — render '—' */ }

            // Per-chain disk usage with 30-second cache. The chain-data tree
            // grows slowly (chain blocks land 1/4s for mainchain, slower for
            // sidechains); a 30s stale cache is well within "visibly current"
            // for the operator.
            // v0.5.210 — getPerChainDiskMb is now sync (returns cache,
            // refreshes in background). No await; the response goes out
            // immediately with whatever the cache holds (refresh lands
            // for the next call, max 60s of staleness).
            const perChainDiskMb = getPerChainDiskMb();

            return res.json(successBody({
                ts: Date.now(),
                cpu: {
                    cores: cpuCores,
                    loadAvg1m:  loadAvg[0],
                    loadAvg5m:  loadAvg[1],
                    loadAvg15m: loadAvg[2],
                    // Rough "system busyness" pct = (load1 / cores) × 100,
                    // capped at 100. A box at load 8.0 on 8 cores reads ~100%;
                    // at load 4.0 on 8 cores ~50%. Not the same as
                    // sum-of-process-CPU% but it's the standard Linux signal
                    // the operator already understands from `top`.
                    loadPct: cpuCores > 0 ? Math.min(100, Math.round((loadAvg[0] / cpuCores) * 100)) : null,
                },
                memory: {
                    totalGb: round(memTotalGb, 2),
                    usedGb:  round(memUsedGb, 2),
                    freeGb:  round(memFreeGb, 2),
                    usedPct: round((memUsedGb / memTotalGb) * 100, 1),
                },
                disk: {
                    totalGb: diskTotalGb != null ? round(diskTotalGb, 2) : null,
                    usedGb:  diskUsedGb  != null ? round(diskUsedGb,  2) : null,
                    freeGb:  diskFreeGb  != null ? round(diskFreeGb,  2) : null,
                    usedPct: (diskTotalGb && diskTotalGb > 0)
                        ? round((diskUsedGb / diskTotalGb) * 100, 1) : null,
                    perChainMb: perChainDiskMb,
                },
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} /system/usage error: ${err.message}`);
            return res.status(500).json(errorBody('Failed to read system usage.'));
        }
    });

    /**
     * GET /system/host-limits
     *
     * v0.5.225 — read provider-imposed cgroup limits so the frontend
     * can surface a "constrained host" banner before EVM sync overwhelms
     * the VPS. Triggered by the Hostinger incident 2026-05-25 where
     * /var/lib/pc2's host had a 2-core cap and ESC + EID + PG starting
     * simultaneously pushed total CPU past it; provider paused the node.
     *
     * Returns null fields when no limit is detected (bare-metal host,
     * unlimited container). isConstrained derivation happens on the
     * frontend (utils-host-limits.js) per operator directive that
     * budget features should be opt-in / auto-detected, not default.
     *
     * cgroup v2 (newer Linux, most modern hosting): /sys/fs/cgroup/cpu.max
     *   format: "<quota> <period>" microseconds, OR "max <period>" = no cap
     * cgroup v1 (older + some VPS): /sys/fs/cgroup/cpu/cpu.cfs_quota_us +
     *   cpu.cfs_period_us. quota = -1 means unlimited.
     */
    router.get('/host-limits', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            let cpuCapCores = null;
            let memoryCapGb = null;
            let source = 'none';

            // ---- CPU cap — cgroup v2 first ----
            try {
                const v2 = await fsp.readFile('/sys/fs/cgroup/cpu.max', 'utf8');
                const parts = v2.trim().split(/\s+/);
                // "max <period>" → no cap. "<quota_us> <period_us>" → cap.
                if (parts.length === 2 && parts[0] !== 'max') {
                    const quotaUs = parseInt(parts[0], 10);
                    const periodUs = parseInt(parts[1], 10);
                    if (Number.isFinite(quotaUs) && Number.isFinite(periodUs)
                        && quotaUs > 0 && periodUs > 0) {
                        cpuCapCores = round(quotaUs / periodUs, 2);
                        source = 'cgroup-v2';
                    }
                }
            } catch (_) { /* not v2 — try v1 */ }

            // ---- cgroup v1 fallback ----
            if (cpuCapCores == null) {
                try {
                    const quotaRaw = await fsp.readFile('/sys/fs/cgroup/cpu/cpu.cfs_quota_us', 'utf8');
                    const periodRaw = await fsp.readFile('/sys/fs/cgroup/cpu/cpu.cfs_period_us', 'utf8');
                    const quotaUs = parseInt(quotaRaw.trim(), 10);
                    const periodUs = parseInt(periodRaw.trim(), 10);
                    if (Number.isFinite(quotaUs) && Number.isFinite(periodUs)
                        && quotaUs > 0 && periodUs > 0) {
                        cpuCapCores = round(quotaUs / periodUs, 2);
                        source = 'cgroup-v1';
                    }
                } catch (_) { /* no cgroup v1 cpu — give up on CPU cap */ }
            }

            // ---- Memory cap — cgroup v2 first ----
            try {
                const v2 = await fsp.readFile('/sys/fs/cgroup/memory.max', 'utf8');
                const trimmed = v2.trim();
                if (trimmed !== 'max') {
                    const bytes = parseInt(trimmed, 10);
                    if (Number.isFinite(bytes) && bytes > 0) {
                        memoryCapGb = round(bytes / (1024 ** 3), 2);
                        if (source === 'none') { source = 'cgroup-v2'; }
                    }
                }
            } catch (_) { /* try v1 */ }

            if (memoryCapGb == null) {
                try {
                    const v1 = await fsp.readFile('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8');
                    const bytes = parseInt(v1.trim(), 10);
                    // cgroup v1 "unlimited" is usually 9223372036854771712 (≈8 EB).
                    // Treat anything > total RAM × 16 as effectively unlimited.
                    const sanityCap = os.totalmem() * 16;
                    if (Number.isFinite(bytes) && bytes > 0 && bytes < sanityCap) {
                        memoryCapGb = round(bytes / (1024 ** 3), 2);
                        if (source === 'none') { source = 'cgroup-v1'; }
                    }
                } catch (_) { /* no v1 memory either */ }
            }

            return res.json(successBody({
                cpuCapCores,           // null = no cap detected (or unreadable)
                memoryCapGb,           // null = no cap
                source,                // 'cgroup-v2' | 'cgroup-v1' | 'none'
                cpuTotalCores: os.cpus().length,
                memoryTotalGb: round(os.totalmem() / (1024 ** 3), 2),
                readAt: Date.now(),
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} /system/host-limits error: ${err.message}`);
            return res.status(500).json(errorBody('Failed to read host limits.'));
        }
    });

    /**
     * GET /system/extip
     * Settings → Network → "Detect now". Hits checkip.amazonaws.com and
     * returns the resolved IP (with cache).
     */
    router.get('/extip', limit('read'), async (req, res) => {
        const wallet = readActorWallet(req);
        if (!wallet) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const force = req.query && req.query.force === '1';
            const result = await ExtIpResolver.resolve({ force });
            return res.json(successBody(result));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} /system/extip error: ${err.message}`);
            return res.status(500).json(errorBody('Failed to resolve external IP.'));
        }
    });

    // -----------------------------------------------------------------
    // v0.5.228 — GET /system/council-status
    //
    // Operator directive 2026-05-27: ENM has been falsely modeling
    // "mining" as an operator-settable toggle. In reality (per node.sh,
    // verified end-to-end in this session):
    //   - node.sh:2133 only gates --mine on existence of the password
    //     file from `<chain>_init`, then always passes --mine
    //   - The sidechain's PBFT consensus engine self-gates production
    //     via IsProducer() + IsOnduty(); a node not in the arbiter
    //     slate simply fails Seal() silently
    //   - Council membership is BOUND on-chain via CRCouncilMember-
    //     ClaimNode TX (submitted in Essentials); once confirmed,
    //     ELA's getCRCArbitersV2 enrolls the node and each sidechain
    //     polls the slate and starts producing automatically
    //
    // The backend (EvmSidechainAdapter.detectProducerRole + start)
    // has already implemented this correctly since v0.5.188 — mining
    // flags are derived per-spawn from on-chain arbiter slate, not
    // from cfg.miner.enabled. This endpoint exposes that DERIVED
    // status to the UI so the new "Validator status" badge replaces
    // the misleading Mining on/off toggle in Settings.
    //
    // Returns per-EVM-chain status:
    //   {
    //     nodePublicKey: '04abc…',
    //     chains: {
    //       esc: { isOnDuty, inCurrent, inNext, source, error? },
    //       eid: { ... },
    //       pg:  { ... },
    //     },
    //     lastChecked: <iso>,
    //   }
    //
    // The four state labels the UI uses are computed in the frontend
    // from these flags:
    //   - "On-duty"  — inCurrent=true (actively producing this rotation)
    //   - "Standby"  — inNext=true && inCurrent=false (next rotation)
    //   - "Inactive" — adapter exists + cfg present, but neither in
    //                  current nor next slate (e.g. registered as
    //                  producer but not Council-bound, or rotation
    //                  doesn't include this node)
    //   - "Follower" — adapter not registered / chain not configured
    //                  (operator didn't run init for this chain)
    //
    // Cached: returns whatever detectProducerRole gave last time it
    // ran (~30s freshness via its own internal call to mainchain RPC).
    // No additional caching layer here — keeps this thin.
    // -----------------------------------------------------------------
    router.get('/council-status', limit('read'), async (req, res) => {
        const wallet = readActorWallet(req);
        if (!wallet) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const cfg = await ConfigStore.load();
            // Read the operator's node public key from the same cached
            // keystore-account.json that /system/identity reads. We
            // never expose it to non-owner callers, but the wallet
            // already matched above so this is owner-gated.
            let nodePublicKey = null;
            try {
                const ks = ChainRegistry.getKeystoreService();
                const keystoreExists = await ks.exists();
                if (keystoreExists) {
                    const identityPath = path.join(chainDir('mainchain'), 'keystore-account.json');
                    const raw = await fsp.readFile(identityPath, 'utf8');
                    const parsed = JSON.parse(raw);
                    nodePublicKey = parsed.publicKey || null;
                }
            } catch (_) { /* missing cache / keystore not unlocked — leave null */ }

            const EVM_CHAINS = ['esc', 'eid', 'pg'];
            // v0.5.228d (audit F10) — sequential 3× mainchain RPC was
            // ~3× the wall-clock cost of necessary. detectProducerRole
            // is pure-read against mainchain getarbitersinfo (no
            // ordering dependency between EVM chains), so fire them in
            // parallel via Promise.all. On a slow mainchain this drops
            // page-load latency from ~15s worst-case to ~5s.
            //
            // Per-chain failures still degrade gracefully: a rejected
            // promise becomes an `{ chainState: 'unknown', error: ... }`
            // entry, the request as a whole still returns 200, and the
            // operator gets a partial picture rather than a 500.
            //
            // The local chainStateFromRole helper mirrors the one used
            // by GET /chains/:id (in routes/chains.js) so the dashboard
            // card and the Settings badge label the same on-chain state
            // identically. Kept inline (rather than imported) so this
            // route stays self-contained.
            function chainStateFromRole(role) {
                if (!role) { return 'unknown'; }
                if (role.inCurrent === true) { return 'on-duty'; }
                if (role.inNext === true) { return 'standby'; }
                if (role.isProducer === null) { return 'unknown'; }
                return 'inactive';
            }
            const perChainEntries = await Promise.all(EVM_CHAINS.map(async (cid) => {
                const adapter = ChainRegistry.getAdapter(cid);
                if (!adapter) {
                    return [cid, {
                        isOnDuty: false,
                        inCurrent: false,
                        inNext: false,
                        source: 'not-configured',
                        chainState: 'follower',
                    }];
                }
                if (typeof adapter.detectProducerRole !== 'function') {
                    return [cid, {
                        isOnDuty: false,
                        inCurrent: false,
                        inNext: false,
                        source: 'unsupported',
                        chainState: 'unknown',
                        error: 'adapter does not support detectProducerRole',
                    }];
                }
                try {
                    const role = await adapter.detectProducerRole(cfg);
                    return [cid, {
                        isOnDuty: role.inCurrent === true,
                        inCurrent: !!role.inCurrent,
                        inNext: !!role.inNext,
                        source: role.source,
                        chainState: chainStateFromRole(role),
                        // v0.5.228d (audit F11) — flag whether the
                        // arbiter slate was actually known. When the
                        // adapter returns empty slates we can't tell
                        // "no arbiters" from "mainchain not synced
                        // yet"; this lets the UI render "Detecting…"
                        // vs "Inactive" honestly.
                        arbiterSlateKnown: typeof role.arbiterCount === 'number'
                            && role.arbiterCount > 0,
                        error: role.error || undefined,
                    }];
                } catch (err) {
                    return [cid, {
                        isOnDuty: false,
                        inCurrent: false,
                        inNext: false,
                        source: 'error',
                        chainState: 'unknown',
                        error: (err && err.message) || String(err),
                    }];
                }
            }));
            const perChain = Object.fromEntries(perChainEntries);

            // v0.5.229 — include CR Council membership in the top-level
            // response so the UI can render Council badges + the per-chain
            // Validator-status badges from the same fetch. Same service
            // /system/identity uses; cached in-process so adding it here
            // is one in-memory hash lookup if recent, otherwise one
            // listcurrentcrs RPC (under the 30s TTL).
            let crMember = null;
            try {
                const CrMembershipService = require('../services/CrMembershipService');
                crMember = await CrMembershipService.detectCrMembership(cfg, {
                    log: extensionHandle.log,
                });
            } catch (_) { /* graceful — leave crMember null */ }

            // v0.5.229 — setup-role hint, same logic as /system/identity.
            let setupRole = 'unknown';
            if (cfg && cfg.global && cfg.global.council
                && cfg.global.council.installed === true) {
                setupRole = 'council';
            }

            return res.json(successBody({
                nodePublicKey,
                chains: perChain,
                crMember,
                setupRole,
                lastChecked: new Date().toISOString(),
            }));
        } catch (err) {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} /system/council-status error: ${err.message}`,
            );
            return res.status(500).json(errorBody('Failed to read Council status.'));
        }
    });

    // -----------------------------------------------------------------
    // v0.5.229 (Phase F) — GET /system/role-debug
    //
    // Diagnostic endpoint that returns the RAW chain responses ENM uses
    // to derive role state, alongside ENM's parsed view of each. The
    // goal is to make a class of bug like the v0.5.228d
    // `info.currentarbiters` field-name typo *impossible* to recur
    // silently — anyone debugging the dashboard can curl this endpoint,
    // compare ENM's parse to the raw chain response, and spot a mismatch
    // in seconds.
    //
    // Three sections in the response:
    //   chain.getarbitersinfo: raw response of the getarbitersinfo RPC
    //   chain.listcurrentcrs:  raw response of the listcurrentcrs RPC
    //   chain.listproducers:   raw response of the listproducers RPC
    //                          (filtered to just the operator's pubkey)
    //   parsed.fromGetarbiters: ENM's detectProducerRole output
    //   parsed.fromListCurrent: ENM's CrMembershipService output
    //   summary.{nodePubkey,setupRole,chainsAlive}: at-a-glance status
    //
    // Owner-gated. No persistent caching (the operator triggering this
    // wants fresh data); CrMembershipService's 30s cache still applies
    // under the hood.
    // -----------------------------------------------------------------
    router.get('/role-debug', limit('read'), async (req, res) => {
        const wallet = readActorWallet(req);
        if (!wallet) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const cfg = await ConfigStore.load();
            const mainCfg = cfg && cfg.chains && cfg.chains.mainchain;
            const nodePubkey = mainCfg && mainCfg.dpos && mainCfg.dpos.nodePublicKey;
            const out = {
                summary: {
                    nodePublicKey: nodePubkey || null,
                    setupRole: (cfg && cfg.global && cfg.global.council
                        && cfg.global.council.installed === true) ? 'council' : 'unknown',
                    setupRoleSource: 'cfg.global.council.installed',
                    lastChecked: new Date().toISOString(),
                },
                chain: {
                    getarbitersinfo: null,
                    listcurrentcrs: null,
                    listproducers: null,
                },
                parsed: {
                    fromGetarbiters: null,
                    fromListCurrent: null,
                },
                errors: [],
            };

            // Build an RPC client identical to detectProducerRole / Cr-
            // MembershipService so any auth/encoding issue surfaces the
            // same way it does in production.
            const rpcCfg = mainCfg && mainCfg.rpc;
            if (!nodePubkey) {
                out.errors.push('cfg.chains.mainchain.dpos.nodePublicKey is empty');
                return res.json(successBody(out));
            }
            if (!rpcCfg || !rpcCfg.user) {
                out.errors.push('cfg.chains.mainchain.rpc.user is empty');
                return res.json(successBody(out));
            }

            const EnmCrypto = require('../services/EnmCrypto');
            const { EnmRpcClient } = require('../services/EnmRpcClient');
            let password = '';
            if (rpcCfg.passwordEncrypted) {
                try {
                    password = EnmCrypto.decrypt(rpcCfg.passwordEncrypted);
                } catch (e) {
                    out.errors.push('rpc password decrypt failed: ' + (e.message || e));
                    return res.json(successBody(out));
                }
            }
            const client = new EnmRpcClient({
                host: rpcCfg.host || '127.0.0.1',
                port: rpcCfg.port || 20336,
                user: rpcCfg.user,
                password,
                timeoutMs: 6000,
            });

            // Raw chain responses, parallel for speed.
            const [arbInfo, crInfo, producerInfo] = await Promise.all([
                client.getarbitersinfo().catch((err) => ({ _error: err.message || String(err) })),
                client.listcurrentcrs().catch((err) => ({ _error: err.message || String(err) })),
                // listproducers can return THOUSANDS of producers; filter
                // server-side via getproducerinfo (single producer lookup)
                // to avoid sending a 500KB payload through the response.
                client.getproducerinfo(nodePubkey).catch(() => null),
            ]);

            // For arbiters: capture top-level keys + the operator's
            // index in each slate so the operator can immediately see
            // "I'm in arbiters[15]" or "I'm not in arbiters".
            if (arbInfo && !arbInfo._error) {
                const norm = (s) => String(s || '').toLowerCase().replace(/^0x/, '');
                const me = norm(nodePubkey);
                const arbiters = Array.isArray(arbInfo.arbiters) ? arbInfo.arbiters : [];
                const nextArbiters = Array.isArray(arbInfo.nextarbiters) ? arbInfo.nextarbiters : [];
                out.chain.getarbitersinfo = {
                    topLevelKeys: Object.keys(arbInfo).sort(),
                    arbitersLength: arbiters.length,
                    nextArbitersLength: nextArbiters.length,
                    emptyStringSlots: {
                        arbiters: arbiters.filter((s) => s === '').length,
                        nextArbiters: nextArbiters.filter((s) => s === '').length,
                    },
                    ourIndexInArbiters: arbiters.findIndex((k) => norm(k) === me),
                    ourIndexInNextArbiters: nextArbiters.findIndex((k) => norm(k) === me),
                    ondutyArbiter: arbInfo.ondutyarbiter || null,
                    currentTurnStartHeight: arbInfo.currentturnstartheight || null,
                    nextTurnStartHeight: arbInfo.nextturnstartheight || null,
                };
            } else {
                out.errors.push('getarbitersinfo: ' + (arbInfo && arbInfo._error));
            }

            if (crInfo && !crInfo._error) {
                const members = Array.isArray(crInfo.crmembersinfo) ? crInfo.crmembersinfo : [];
                const normLow = (s) => String(s || '').toLowerCase().replace(/^0x/, '');
                const meLow = normLow(nodePubkey);
                const matchedIndex = members.findIndex(
                    (m) => m && normLow(m.dpospublickey) === meLow,
                );
                out.chain.listcurrentcrs = {
                    topLevelKeys: Object.keys(crInfo).sort(),
                    totalcounts: crInfo.totalcounts || 0,
                    membersLength: members.length,
                    ourIndexInMembers: matchedIndex,
                    // Don't dump every member's PII (nicknames, CIDs).
                    // Just our own match record + the count of others.
                    ourRecord: matchedIndex >= 0 ? members[matchedIndex] : null,
                };
            } else {
                out.errors.push('listcurrentcrs: ' + (crInfo && crInfo._error));
            }

            if (producerInfo) {
                out.chain.listproducers = {
                    nickname: producerInfo.nickname || null,
                    state: producerInfo.state || null,
                    votes: producerInfo.votes || null,
                    dposv2votes: producerInfo.dposv2votes || null,
                    ownerpublickey: producerInfo.ownerpublickey || null,
                    inactiveheight: producerInfo.inactiveheight || null,
                    illegalheight: producerInfo.illegalheight || null,
                };
            } else {
                out.chain.listproducers = null;  // not a registered BPoS producer
            }

            // Parsed views — what ENM concluded from these raw responses.
            // v0.5.229e (P7 audit fix) — bypass the 30s CrMembershipService
            // cache when the operator triggers this debug endpoint. The
            // whole point of the role-debug surface is to see CURRENT
            // chain truth; serving a 29-second-old cached result hurts
            // exactly the diagnostic workflow this endpoint exists for.
            try {
                const ChainRegistry = require('../services/ChainRegistry');
                const escAdapter = ChainRegistry.getAdapter('esc');
                if (escAdapter && typeof escAdapter.detectProducerRole === 'function') {
                    out.parsed.fromGetarbiters = await escAdapter.detectProducerRole(cfg);
                }
                const CrMembershipService = require('../services/CrMembershipService');
                CrMembershipService.clearCache();  // best-effort — also invalidate cached value
                out.parsed.fromListCurrent = await CrMembershipService.detectCrMembership(cfg, {
                    log: extensionHandle.log,
                    skipCache: true,
                });
            } catch (e) {
                out.errors.push('parsed view: ' + (e.message || e));
            }

            return res.json(successBody(out));
        } catch (err) {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} /system/role-debug error: ${err.message}`,
            );
            return res.status(500).json(errorBody('Failed to read role debug info.'));
        }
    });

    return router;
}

module.exports = {
    build,
};
