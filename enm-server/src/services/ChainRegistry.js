/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * ChainRegistry — singleton holding NativeProcessService + per-chain adapters.
 *
 * Created in main.js's `init` lifecycle hook and shared with route handlers
 * via a module-level reference. Avoids passing dependencies through every
 * route's closure.
 */

'use strict';

const { NativeProcessService } = require('./NativeProcessService');
const { SseHub } = require('./SseHub');
const { ProcessLogStreamer } = require('./ProcessLogStreamer');
const ElaMainChainAdapter = require('./ElaMainChainAdapter');
const ChainAdapter = require('./ChainAdapter');
// beta.3.96 (Wave M3.2) — Class B adapters. Required up-front so the
// require() cost is paid at boot rather than at registration time;
// registration itself is gated on cfg.chains[id] presence to avoid
// listing uninstalled chains in listChains() / the multi-chain
// overview. Plan §17 Class B row.
const EscAdapter = require('./EscAdapter');
const EidAdapter = require('./EidAdapter');
// beta.0.3.1 (Wave M4.1) — Class C oracles. Same lazy-registration
// gating; an oracle only joins the registry when its cfg entry exists.
const EscOracleAdapter = require('./EscOracleAdapter');
const EidOracleAdapter = require('./EidOracleAdapter');
// beta.0.3.6 (Wave M5.1) — PG (closed-source) + its oracle.
const PgAdapter = require('./PgAdapter');
const PgOracleAdapter = require('./PgOracleAdapter');
// beta.0.3.10 (Wave M6.1) — Arbiter (Class D cross-chain signer).
const ArbiterAdapter = require('./ArbiterAdapter');
const { SelfHealingEngine } = require('./SelfHealingEngine');
const { HealthChecker } = require('./HealthChecker');
const { readNodeOwner } = require('../auth/OwnerCheckMiddleware');
const { SyncTracker } = require('./SyncTracker');
const { HeightSeriesStore } = require('./HeightSeriesStore');
const HostConflictScanner = require('./HostConflictScanner');
const { EnmBinaryDownloader } = require('./EnmBinaryDownloader');
const EnmBootstrapDownloader = require('./EnmBootstrapDownloader');
const { EnmKeystoreService } = require('./EnmKeystoreService');
const ChainState = require('./ChainState');

let initialized = false;
let processService = null;
let sseHub = null;
let logStreamer = null;
let engine = null;
let healthChecker = null;
let syncTracker = null;
let heightSeriesStore = null;
let binaryDownloader = null;
let bootstrapDownloader = null;
let keystoreService = null;
let extensionHandleRef = null;
/** @type {Map<string, import('./ChainAdapter')>} */
let adapters = new Map();

/**
 * Idempotent init. Called from main.js init hook with the extension handle.
 *
 * @param {object} extensionHandle
 */
function init(extensionHandle) {
    if (initialized) {
        return;
    }
    if (!extensionHandle) {
        throw new TypeError('ChainRegistry.init: extensionHandle required');
    }
    extensionHandleRef = extensionHandle;
    processService = new NativeProcessService({ extensionHandle });
    sseHub = new SseHub({ extensionHandle });
    // ProcessLogStreamer subscribes to processService events on construction.
    logStreamer = new ProcessLogStreamer({ processService, sseHub, extensionHandle });
    syncTracker = new SyncTracker();
    // 0.2.0-alpha.1 — backs the chain-card sparkline. Same shape as
    // SyncTracker (in-memory, per-chain ring buffer); separate concern
    // (long-form history retention vs velocity math).
    heightSeriesStore = new HeightSeriesStore();
    binaryDownloader = new EnmBinaryDownloader({ logger: extensionHandle.log, sseHub });
    bootstrapDownloader = new EnmBootstrapDownloader({ extensionHandle, sseHub });
    // Sweep any stale .tmp/bootstrap/ artefacts left by a previous crash
    // or cancel so a fresh bootstrap can start cleanly.
    bootstrapDownloader.cleanupOrphans().catch(() => { /* best-effort */ });
    keystoreService = new EnmKeystoreService({ logger: extensionHandle.log });
    // beta.3.85 — Wave M1.1 — register mainchain via the new
    // registerAdapter() API instead of the previous direct
    // `adapters.set()` call. Behaviour is identical for mainchain
    // today (the only registered adapter); the API exists so future
    // Class B/C/D/E adapters can be registered without touching
    // ChainRegistry's internals. See ChainAdapter.classOf for the
    // chainId → class lookup table.
    registerAdapter('mainchain', new ElaMainChainAdapter({ processService, extensionHandle }));

    // Clear SyncTracker's height-sample buffer + HostConflictScanner's
    // dedup map on chain exit so the next start sees a clean slate. Two
    // bugs the audit caught:
    //   - SyncTracker zombie velocity ("1150 blocks/min · Network
    //     height unknown")
    //   - HostConflictScanner silently swallowing "conflict resolved"
    //     signals because the 1h TTL was still hot
    processService.on('exit', ({ chainId }) => {
        syncTracker.clearForChain(chainId);
        HostConflictScanner.clearDedup(chainId);
        // Drop the sparkline buffer so the restarted chain doesn't
        // inherit heights from the previous binary version.
        if (heightSeriesStore) heightSeriesStore.clearForChain(chainId);
    });

    // Boot self-heal: walk every known chain, reconcile in-memory state with
    // disk reality. Per Architectural Invariant #6, ENM recovers from kill -9
    // / DB loss / abandoned wizards without operator intervention.
    try {
        const summary = ChainState.reconcileOnBoot(
            Array.from(adapters.keys()),
            (level, msg) => {
                const fn = extensionHandle.log[level] || extensionHandle.log.info;
                fn(msg);
            },
        );
        extensionHandle.log.info(
            `[ENM] boot reconcile: ${summary.reconciled} chain(s), ${summary.stalePidsCleared} stale PID(s) cleared`
            + (summary.anomalies.length ? `, anomalies: ${summary.anomalies.join('; ')}` : ''),
        );
    } catch (err) {
        extensionHandle.log.warn(`[ENM] boot reconcile failed (non-fatal): ${err.message}`);
    }

    initialized = true;
}

function getBinaryDownloader() {
    if (!binaryDownloader) throw new Error('ChainRegistry: not initialized');
    return binaryDownloader;
}

function getBootstrapDownloader() {
    if (!bootstrapDownloader) throw new Error('ChainRegistry: not initialized');
    return bootstrapDownloader;
}

function getKeystoreService() {
    if (!keystoreService) throw new Error('ChainRegistry: not initialized');
    return keystoreService;
}

function getSyncTracker() {
    if (!syncTracker) {
        throw new Error('ChainRegistry: not initialized');
    }
    return syncTracker;
}

function getHeightSeriesStore() {
    if (!heightSeriesStore) {
        throw new Error('ChainRegistry: not initialized');
    }
    return heightSeriesStore;
}

/**
 * Disk-derived snapshot of every known chain. Cheap; safe to call per-request.
 * Returns the same shape as ChainState.snapshot but with one entry per chain.
 *
 * @returns {object[]} array of ChainState snapshots
 */
function snapshots() {
    if (!initialized) return [];
    return Array.from(adapters.keys()).map((id) => ChainState.snapshot(id));
}

/**
 * Lazy build the healing engine + health checker. Called from main.js `ready`
 * (NOT init) because the data API is reliably available by then and the owner
 * wallet has been claimed in PC2's setup flow.
 *
 * @param {() => object} getDb  lazy db handle accessor (extension.import('data').db)
 */
function initHealing(getDb) {
    if (!initialized) {
        throw new Error('ChainRegistry: must call init() before initHealing()');
    }
    if (engine) {
        return;
    }
    if (typeof getDb !== 'function') {
        throw new TypeError('ChainRegistry.initHealing: getDb required');
    }
    let owner = null;
    try {
        owner = readNodeOwner();
    } catch (err) {
        // Owner read failure shouldn't block boot — engine starts in no-owner
        // mode and gates all proposals. Operator can complete setup later.
        extensionHandleRef.log.warn(`[ENM] readNodeOwner failed during initHealing: ${err.message}`);
    }
    engine = new SelfHealingEngine({
        extensionHandle: extensionHandleRef,
        getDb,
        processService,
        sseHub,
        ownerWallet: owner,
    });
    healthChecker = new HealthChecker({
        extensionHandle: extensionHandleRef,
        processService,
        engine,
        listChains,
        getAdapter,
        syncTracker,
        heightSeriesStore,
        sseHub,
    });
}

function getEngine() {
    if (!engine) {
        throw new Error('ChainRegistry: healing not initialized — call initHealing() in extension ready hook');
    }
    return engine;
}

function getHealthChecker() {
    if (!healthChecker) {
        throw new Error('ChainRegistry: healing not initialized');
    }
    return healthChecker;
}

function getProcessService() {
    if (!processService) {
        throw new Error('ChainRegistry: not initialized — call init() in extension init hook first');
    }
    return processService;
}

function getSseHub() {
    if (!sseHub) {
        throw new Error('ChainRegistry: not initialized');
    }
    return sseHub;
}

function getLogStreamer() {
    if (!logStreamer) {
        throw new Error('ChainRegistry: not initialized');
    }
    return logStreamer;
}

/**
 * @param {string} chainId
 * @returns {import('./ChainAdapter')}
 */
function getAdapter(chainId) {
    if (!initialized) {
        throw new Error('ChainRegistry: not initialized');
    }
    const adapter = adapters.get(chainId);
    if (!adapter) {
        throw new Error(`ChainRegistry: unknown chainId "${chainId}"`);
    }
    return adapter;
}

/**
 * beta.3.96 — Wave M3.2 — register Class B adapters when their cfg is
 * present. Called from server.js post-boot after ConfigStore.load
 * succeeds (cfg load is async; ChainRegistry.init is sync). On a
 * mainchain-only install (the default today) this is a no-op: cfg.chains
 * has no esc/eid keys so neither adapter registers; listChains() stays
 * exactly mainchain.
 *
 * Idempotent — re-calls are safe; registerAdapter() throws on duplicates
 * but we check has() first. The function never throws on partial
 * success: per-chain registration failures are logged + skipped so a
 * single broken cfg entry doesn't block the rest of boot.
 *
 * @param {object} args
 * @param {object} args.cfg  ConfigStore.load() result
 */
function registerConfiguredAdapters(args) {
    if (!initialized) {
        throw new Error('ChainRegistry: must call init() before registerConfiguredAdapters()');
    }
    if (!args || !args.cfg || typeof args.cfg !== 'object') {
        throw new TypeError('registerConfiguredAdapters: { cfg } required');
    }
    const chains = (args.cfg.chains && typeof args.cfg.chains === 'object') ? args.cfg.chains : {};
    // Map cfg-key → adapter class. M3.2 wired Class B; M4.1 adds
    // Class C oracles. Class D (Arbiter) lands in M6.1.
    const REGISTRABLE = {
        esc:          EscAdapter,
        eid:          EidAdapter,
        pg:           PgAdapter,           // beta.0.3.6 (Wave M5.1)
        'esc-oracle': EscOracleAdapter,
        'eid-oracle': EidOracleAdapter,
        'pg-oracle':  PgOracleAdapter,     // beta.0.3.9 (Wave M5.4)
        arbiter:      ArbiterAdapter,      // beta.0.3.10 (Wave M6.1)
    };
    for (const [chainId, AdapterClass] of Object.entries(REGISTRABLE)) {
        if (!chains[chainId]) continue;          // not installed; skip
        if (adapters.has(chainId)) continue;     // already registered
        try {
            registerAdapter(chainId, new AdapterClass({
                processService,
                extensionHandle: extensionHandleRef,
            }));
        } catch (err) {
            if (extensionHandleRef && extensionHandleRef.log) {
                extensionHandleRef.log.warn(
                    `[ENM] failed to register ${chainId} adapter: ${err.message}`,
                );
            }
        }
    }
}

/**
 * beta.3.85 — Wave M1.1 — public API for registering a chain adapter.
 *
 * Replaces the pre-3.85 pattern of `adapters.set(chainId, new XAdapter(...))`
 * scattered across init(). Future Class B/C/D/E adapters register here
 * (lazy registration at setup-wizard time, not at boot — uninstalled
 * chains never appear in listChains() or the multi-chain overview).
 *
 * Guards:
 *  - throws if registry not initialized (caller must wait for init())
 *  - throws on duplicate chainId (catches accidental re-registration)
 *  - logs the registered chainId + chainClass at info level so the
 *    operator can grep the log for "registered adapter" to see which
 *    adapters are live this boot
 *
 * @param {string} chainId
 * @param {import('./ChainAdapter')} adapter
 */
function registerAdapter(chainId, adapter) {
    if (!chainId || typeof chainId !== 'string') {
        throw new TypeError('ChainRegistry.registerAdapter: chainId required');
    }
    if (!adapter || typeof adapter.chainId !== 'string') {
        throw new TypeError('ChainRegistry.registerAdapter: adapter must be a ChainAdapter instance');
    }
    if (adapter.chainId !== chainId) {
        throw new Error(
            `ChainRegistry.registerAdapter: chainId mismatch — `
            + `caller passed "${chainId}" but adapter.chainId is "${adapter.chainId}"`,
        );
    }
    if (adapters.has(chainId)) {
        throw new Error(`ChainRegistry.registerAdapter: chainId "${chainId}" already registered`);
    }
    adapters.set(chainId, adapter);
    const klass = adapter.chainClass || '?';
    if (extensionHandleRef && extensionHandleRef.log) {
        extensionHandleRef.log.info(
            `[ENM] registered adapter chainId=${chainId} class=${klass} displayName="${adapter.displayName}"`,
        );
    }
}

/**
 * beta.3.85 — Wave M1.1 — list adapters filtered by chain class.
 *
 * Used by:
 *  - MultiChainOverviewPane (M2) to group rows by class
 *  - HealthChecker (M1.3) to apply DPoS-specific rules only to Class A
 *  - CouncilOverviewService aggregator (M2)
 *
 * @param {string} className  one of 'A'|'B'|'C'|'D'|'E'
 * @returns {Array<{ chainId: string, displayName: string, chainClass: string|null }>}
 */
function getAdaptersByClass(className) {
    if (!initialized) return [];
    return Array.from(adapters.values())
        .filter((a) => a.chainClass === className)
        .map((a) => ({
            chainId: a.chainId,
            displayName: a.displayName,
            chainClass: a.chainClass,
        }));
}

/**
 * @returns {Array<{ chainId: string, displayName: string, chainClass: string|null, parentChainId: string|null }>}
 *
 * beta.3.85 — extended the return shape to include chainClass +
 * parentChainId. Pre-3.85 callers reading only chainId+displayName
 * are unaffected (extra fields are extra, not breaking). New M2+
 * callers can use the class/parent fields directly without an
 * extra getAdapter() roundtrip.
 */
function listChains() {
    if (!initialized) {
        return [];
    }
    return Array.from(adapters.values()).map((a) => ({
        chainId: a.chainId,
        displayName: a.displayName,
        chainClass: a.chainClass,
        parentChainId: a.parentChainId,
    }));
}

/** @internal — for tests only */
function _resetForTests() {
    if (sseHub) {
        try { sseHub.close(); } catch (_) { /* swallow */ }
    }
    if (healthChecker) {
        try { healthChecker.stop(); } catch (_) { /* swallow */ }
    }
    initialized = false;
    extensionHandleRef = null;
    processService = null;
    sseHub = null;
    logStreamer = null;
    engine = null;
    healthChecker = null;
    syncTracker = null;
    heightSeriesStore = null;
    binaryDownloader = null;
    bootstrapDownloader = null;
    keystoreService = null;
    adapters = new Map();
}

module.exports = {
    init,
    initHealing,
    getProcessService,
    getSseHub,
    getLogStreamer,
    getAdapter,
    getEngine,
    getHealthChecker,
    getSyncTracker,
    getHeightSeriesStore,
    getBinaryDownloader,
    getBootstrapDownloader,
    getKeystoreService,
    listChains,
    snapshots,
    registerAdapter,             // beta.3.85 — Wave M1.1
    getAdaptersByClass,          // beta.3.85 — Wave M1.1
    registerConfiguredAdapters,  // beta.3.96 — Wave M3.2
    _resetForTests,
};
