/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * ChainAdapter — abstract base for per-chain logic.
 *
 * v0.1 has only ElaMainChainAdapter. v0.2+ will add ElaEsccAdapter,
 * ElaEidAdapter, ElaArbiterAdapter, etc. Subclasses share lifecycle hooks
 * (start/stop/restart/health/version/peers/height/sync) so the route layer
 * doesn't need per-chain conditionals.
 *
 * Concrete subclasses must implement:
 *   - chainId         (string getter — e.g. "mainchain")
 *   - displayName     (string getter — e.g. "ELA Mainchain")
 *   - generateConfig(cfg) → string  (writes the chain's config.json contents)
 *   - rpcClient(cfg) → EnmRpcClient instance
 *
 * Lifecycle methods (start/stop/restart) are implemented in the base using
 * NativeProcessService. Subclasses can override if they need chain-specific
 * spawn behavior — but most won't.
 */

'use strict';

const { ENM_LOG_PREFIX } = require('./EnmConstants');

/**
 * beta.3.85 — Wave M1.1 — Council-node taxonomy.
 *
 * Static chainId → architectural class lookup. The 5 classes (see the
 * approved plan at ~/.claude/plans/mellow-sprouting-barto.md) are:
 *
 *   A — UTXO Consensus       (mainchain only)
 *   B — EVM PBFT Sidechain   (esc, eid, pg)
 *   C — Sidekick Oracle      (esc-oracle, eid-oracle, pg-oracle)
 *   D — Cross-chain Signer   (arbiter)
 *   E — Light Client         (spv)
 *
 * Returns null for unknown chainIds — callers must handle that case
 * defensively (treat as "not yet supported by this ENM version").
 */
const CHAIN_ID_TO_CLASS = Object.freeze({
    mainchain:    'A',
    esc:          'B',
    eid:          'B',
    pg:           'B',
    'esc-oracle': 'C',
    'eid-oracle': 'C',
    'pg-oracle':  'C',
    arbiter:      'D',
    spv:          'E',
});

/**
 * beta.3.85 — Wave M1.1 — Oracle → parent-chain mapping. Used by
 * ChainRegistry to wire oracle-restart-on-parent-exit and by the
 * multi-chain overview to render oracles nested under their parent
 * chain. Non-oracles return null.
 */
const CHAIN_ID_TO_PARENT = Object.freeze({
    'esc-oracle': 'esc',
    'eid-oracle': 'eid',
    'pg-oracle':  'pg',
});

class ChainAdapter {
    /**
     * @param {object} deps
     * @param {object} deps.processService  NativeProcessService instance
     * @param {object} deps.extensionHandle PC2 extension global (for log/db access)
     */
    constructor(deps) {
        if (!deps || !deps.processService || !deps.extensionHandle) {
            throw new TypeError('ChainAdapter: { processService, extensionHandle } required');
        }
        this.processService = deps.processService;
        this.extensionHandle = deps.extensionHandle;
    }

    /**
     * beta.3.85 — Static helper: which class does a given chainId belong to?
     * Returns one of 'A'|'B'|'C'|'D'|'E' or null for unknown chainIds.
     *
     * @param {string} chainId
     * @returns {string|null}
     */
    static classOf(chainId) {
        return CHAIN_ID_TO_CLASS[chainId] || null;
    }

    /**
     * beta.3.85 — Static helper: for an oracle chainId, which chain is its
     * parent? Returns the parent chainId or null for non-oracles.
     *
     * @param {string} chainId
     * @returns {string|null}
     */
    static parentOf(chainId) {
        return CHAIN_ID_TO_PARENT[chainId] || null;
    }

    /**
     * v0.5.228 — reverse of parentOf: for an EVM parent chain (esc / eid /
     * pg), which oracle chainId rides alongside it? Returns the oracle's
     * chainId or null for chains with no companion oracle (mainchain,
     * arbiter, the oracles themselves).
     *
     * Used by autoStart + the POST /chains/:id/start route to keep an
     * EVM chain and its oracle paired across pc2-node restarts, system
     * reboots, and explicit operator starts. Operator directive
     * 2026-05-27: "they should be started together... on reboots and
     * stuff both should run."
     *
     * @param {string} parentChainId
     * @returns {string|null}
     */
    static oracleOf(parentChainId) {
        for (const [oracleId, parentId] of Object.entries(CHAIN_ID_TO_PARENT)) {
            if (parentId === parentChainId) { return oracleId; }
        }
        return null;
    }

    /** Override in subclass. */
    get chainId() {
        throw new Error('ChainAdapter: subclass must override chainId');
    }

    /** Override in subclass. */
    get displayName() {
        throw new Error('ChainAdapter: subclass must override displayName');
    }

    /**
     * beta.3.85 — The chain's architectural class (A/B/C/D/E). Default
     * resolves via ChainAdapter.classOf(this.chainId); subclasses can
     * override if they need to declare a class for a chainId not in the
     * canonical map (e.g. test-only adapters). Returning null is legal
     * but means callers like CouncilOverviewService will treat the
     * adapter as "unclassified" and skip class-specific rendering.
     */
    get chainClass() {
        return ChainAdapter.classOf(this.chainId);
    }

    /**
     * beta.3.85 — For oracles, the parent chain's chainId; null otherwise.
     * Default resolves via the static parentOf map.
     */
    get parentChainId() {
        return ChainAdapter.parentOf(this.chainId);
    }

    /**
     * FIX-C16 — the OS signal used to begin a graceful stop. Default
     * 'SIGTERM' matches node.sh's plain `kill` for ela / arbiter / oracles.
     * EvmSidechainAdapter overrides this to 'SIGINT' because the geth EVM
     * sidechains (esc/eid/pg) key their clean-shutdown (leveldb flush) to
     * SIGINT (node.sh stops them with `kill -s SIGINT`). stop() threads this
     * into NativeProcessService.stop.
     */
    get stopSignal() {
        return 'SIGTERM';
    }

    /**
     * Generate the chain's `config.json` contents from our extension config.
     *
     * @param {object} chainConfig from EnmConfigSchema (e.g. config.chains.mainchain)
     * @param {object} secrets     { rpcPassword: string, ipAddress: string|null }
     * @returns {object}           plain object that JSON.stringify-es to ela's config.json
     */
    // eslint-disable-next-line no-unused-vars
    generateConfig(chainConfig, secrets) {
        throw new Error('ChainAdapter: subclass must override generateConfig');
    }

    /**
     * Return an RPC client wired to this chain's RPC port + auth.
     *
     * @param {object} chainConfig
     * @returns {import('./EnmRpcClient').EnmRpcClient}
     */
    // eslint-disable-next-line no-unused-vars
    rpcClient(chainConfig) {
        throw new Error('ChainAdapter: subclass must override rpcClient');
    }

    /**
     * Start the chain process. Subclasses can override to add pre-flight
     * checks, but the default delegates to NativeProcessService.
     *
     * @param {object} chainConfig
     * @returns {Promise<{ pid: number, startedAt: number }>}
     */
    async start(chainConfig) {
        return this.processService.start(this.chainId, chainConfig);
    }

    /**
     * Stop the chain process gracefully. Default: SIGTERM, wait 60s, SIGKILL.
     * FIX-C16 — pass this adapter's stopSignal (SIGINT for EVM sidechains)
     * down to NativeProcessService so the right shutdown handler fires.
     *
     * @returns {Promise<{ exitCode: number|null, signal: string|null }>}
     */
    async stop() {
        return this.processService.stop(this.chainId, { signal: this.stopSignal });
    }

    /**
     * Restart = stop then start.
     *
     * FIX-C6b-v2 — go through THIS adapter's own stop()+start() (not
     * processService.restart directly) so subclasses that build a spawn
     * recipe in start() restart correctly: EVM sidechains build --spawnArgs
     * and oracles build --spawnEnv in their start() override. The old
     * `processService.restart(this.chainId, chainConfig)` passed a bare
     * chainConfig with NO spawnArgs, so NativeProcessService threw
     * "config.json missing" for every arg/env-configured chain — which is why
     * self-heal (SelfHealingEngine._executeRestart → adapter.restart) AND the
     * manual POST /chains/:id/restart route could never recover a sidechain or
     * oracle. start() is the single source of the spawn recipe, so restart is
     * literally stop + start.
     *
     * @param {object} chainConfig
     * @returns {Promise<{ pid: number, startedAt: number }>}
     */
    async restart(chainConfig) {
        try { await this.stop(); }
        catch (_) { /* already stopped / never started — proceed to start */ }
        return this.start(chainConfig);
    }

    /**
     * Quick liveness probe — does the process exist + is RPC reachable?
     *
     * @param {object} chainConfig
     * @returns {Promise<{ alive: boolean, rpcOk: boolean, pid: number|null }>}
     */
    async health(chainConfig) {
        const procStatus = this.processService.statusSync(this.chainId);
        if (!procStatus.alive) {
            return { alive: false, rpcOk: false, pid: null };
        }
        let rpcOk = false;
        try {
            await this.rpcClient(chainConfig).getblockcount();
            rpcOk = true;
        } catch (err) {
            this.extensionHandle.log.debug(`${ENM_LOG_PREFIX} ${this.chainId} health probe RPC error: ${err.message}`);
        }
        return { alive: true, rpcOk, pid: procStatus.pid };
    }

    /**
     * v0.5.168 (Phase 1) — class-aware primary metric for the dashboard hero.
     *
     * Returns { height, peers, networkHeight, synced, parentBlockHeight } with
     * any field null when unavailable. WHY this exists: the dashboard endpoints
     * (GET /chains/:id and /:id/sync) used to fetch height/peers unconditionally
     * via getblockcount + getconnectioncount — ELA (Bitcoin-style) RPCs that
     * ONLY the mainchain's EnmRpcClient serves. EVM sidechains (EthRpcClient),
     * the arbiter (getspvheight only), and oracles (no chain) therefore showed
     * "—" for every metric. Each subclass now does its own class-correct probe,
     * mirroring the FIX-C19 polymorphic health() pattern so the route layer
     * stays free of per-chain conditionals.
     *
     * This base implementation is the ELA / class-A shape: getblockcount +
     * getconnectioncount. networkHeight + synced are left null here — the
     * mainchain route fills them from its getnodestate neighbor walk (peer max
     * height + best-block recency). Caller guarantees the process is alive
     * before calling. NEVER throws: RPC failures resolve to null fields so the
     * UI renders "—" honestly. This is read-only telemetry — it does NOT feed
     * the F2 self-heal gate (that stays PID-based via health()).
     *
     * @param {object} chainConfig
     * @returns {Promise<{height:number|null, peers:number|null, networkHeight:number|null, synced:boolean|null, parentBlockHeight:number|null}>}
     */
    async primaryHeight(chainConfig) {
        const out = {
            height: null, peers: null, networkHeight: null, synced: null, parentBlockHeight: null,
        };
        try {
            const rpc = this.rpcClient(chainConfig);
            const [h, p] = await Promise.allSettled([
                rpc.getblockcount(),
                rpc.getconnectioncount(),
            ]);
            if (h.status === 'fulfilled') {
                const v = h.value;
                out.height = (typeof v === 'number') ? v
                    : (v && typeof v.result === 'number') ? v.result : null;
            }
            if (p.status === 'fulfilled') {
                const v = p.value;
                out.peers = (typeof v === 'number') ? v
                    : (v && typeof v.result === 'number') ? v.result : null;
            }
        } catch (_) { /* RPC unreachable; fields stay null */ }
        return out;
    }
}

module.exports = ChainAdapter;
