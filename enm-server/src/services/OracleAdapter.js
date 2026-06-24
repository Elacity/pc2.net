/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * OracleAdapter — Wave M4.1 (beta.0.3.1) — abstract base class for
 * the Elastos cross-chain Oracles (Class C per the 5-class taxonomy).
 *
 * WHY THIS DIFFERS FROM ELA/EVM ADAPTERS
 *
 * Oracles are stateless Node.js HTTP relayers. They have no:
 *   - keystore        (nothing to sign during the running daemon —
 *                      the one-time `deployctrt.js` setup script signs;
 *                      that's separate from this adapter)
 *   - peers           (single-tenant client over RPC)
 *   - block height    (relayer, not a chain)
 *   - mining rewards  (no production)
 *   - PBFT signing    (no consensus participation)
 *
 * They DO have:
 *   - parent chain    (ESC → esc, EID → eid, PG → pg) — the EVM
 *                     sidechain whose bridge contracts they watch
 *   - mainchain RPC   (to write cross-chain payloads to ELA mainchain)
 *   - script path     (the upstream JS entry point — varies per oracle)
 *   - HTTP port       (for health probes; oracles serve a tiny
 *                     status endpoint)
 *
 * SPAWN MODEL
 *
 * Unlike Class A/B/D which spawn a binary, Class C spawns:
 *   node <scriptPath>
 *
 * with env vars carrying the parent + mainchain RPC URLs + the
 * oracle's HTTP port. The `node` interpreter version is pinned by the
 * M4.3 runtime-distribution work (Node v23.10.0 per upstream); the
 * adapter only knows the path to the `node` binary.
 *
 * SUBCLASS CONTRACT
 *
 * Each subclass MUST provide:
 *   - chainId         (e.g. 'esc-oracle')
 *   - displayName     (e.g. 'Smart Chain Oracle')
 *   - parentChainId   (e.g. 'esc')
 *   - scriptFilename  (e.g. 'crosschain_oracle.js')
 *
 * The script's absolute path is resolved at spawn time from
 * `cfg.scriptPath` (operator-supplied or M3.8-downloader-resolved)
 * with the scriptFilename appended.
 *
 * NODE.SH PARITY (plan §17 Class C row)
 *
 * REPLICATE:
 *   - Per-oracle entry filenames (ESC=crosschain_oracle.js,
 *     EID=crosschain_eid.js, PG=crosschain_pg.js)
 *   - Node.js v23.10.0 runtime pin (M4.3 ships the runtime)
 *   - env=mainnet|testnet propagation
 *   - HTTP probe on the oracle port
 *   - `nohup node ...` (we use spawn { detached:true } + unref())
 *
 * DIVERGE:
 *   - No keystore / no password (no diverge to clean up — node.sh
 *     also doesn't ship one for Class C)
 *   - No --password / --rpcuser CLI flags (oracles need none)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ChainAdapter = require('./ChainAdapter');
const { EthRpcClient } = require('./EthRpcClient');
const { chainDir } = require('./DataDir');
const ConfigStore = require('./ConfigStore');
const { ENM_LOG_PREFIX } = require('./EnmConstants');
const { sleep } = require('./processUtils'); // P1 (v0.5.183) — bounded parent-RPC readiness poll

class OracleAdapter extends ChainAdapter {
    constructor(deps) {
        super(deps);
    }

    // -------- Required subclass overrides --------

    /** @returns {string} e.g. 'esc-oracle' */
    get chainId() {
        throw new Error('OracleAdapter: subclass must override chainId');
    }
    /** @returns {string} e.g. 'Smart Chain Oracle' */
    get displayName() {
        throw new Error('OracleAdapter: subclass must override displayName');
    }
    /** @returns {string} e.g. 'crosschain_oracle.js' (the upstream filename) */
    get scriptFilename() {
        throw new Error('OracleAdapter: subclass must override scriptFilename');
    }
    /** Overridden in subclasses or resolved via base CHAIN_ID_TO_PARENT map */
    // get parentChainId() inherited from ChainAdapter.

    // -------- Shared implementations --------

    get chainClass() { return 'C'; }

    /**
     * Oracles serve a minimal HTTP endpoint for health probes. EthRpcClient
     * is the closest reusable HTTP client; it speaks JSON-RPC which is what
     * the upstream oracle endpoints serve (their / endpoint accepts a
     * dummy eth_blockNumber-style request and replies with the relayer's
     * own version + status).
     *
     * For a fuller status-only probe we'd want a plain GET, but reusing
     * EthRpcClient keeps the surface small. The health() override below
     * uses it.
     *
     * @param {object} cfg
     * @returns {import('./EthRpcClient').EthRpcClient}
     */
    rpcClient(cfg) {
        if (!cfg || !cfg.ports || !cfg.ports.httpRpc) {
            throw new Error(
                `${this.chainId}: rpcClient called with cfg missing ports.httpRpc`,
            );
        }
        return new EthRpcClient({
            host: '127.0.0.1',
            port: cfg.ports.httpRpc,
        });
    }

    /**
     * Oracles don't read a config file — env vars carry everything.
     *
     * @param {object} cfg
     * @returns {null}
     */
    generateConfig() { return null; }

    /**
     * Build the spawn argv. Just the script path; env vars carry the
     * RPC URLs + ports.
     *
     * @param {object} cfg
     * @returns {string[]}
     */
    buildSpawnArgs(cfg) {
        if (!cfg || typeof cfg.scriptPath !== 'string') {
            throw new Error(`${this.chainId}: buildSpawnArgs requires cfg.scriptPath`);
        }
        const scriptAbs = path.join(cfg.scriptPath, this.scriptFilename);
        return [scriptAbs];
    }

    /**
     * Build the env vars handed to the oracle child. The script reads
     * these (env=, ENM_PARENT_RPC, etc.) to know where to relay.
     *
     * @param {object} cfg
     * @param {object} secrets  { parentRpcUrl, mainchainRpcUrl }
     * @returns {object}
     */
    buildEnv(cfg) {
        if (!cfg || !cfg.ports || !cfg.ports.httpRpc) {
            throw new Error(`${this.chainId}: buildEnv requires cfg.ports.httpRpc`);
        }
        // v0.5.172 (#2 node.sh parity) — the upstream crosschain_*.js + common.js
        // read ONLY process.env.env (to pick mainnet/testnet contract addresses);
        // node.sh likewise exports just `export env=...`. The listen port +
        // parent-RPC URL the oracle uses are HARDCODED in the script files and
        // are now rewritten from ENM's config by _alignScriptConfig() at start.
        // Pre-0.5.172 we also exported ENM_PARENT_CHAIN / ENM_PARENT_RPC /
        // ENM_MAINCHAIN_RPC / ENM_ORACLE_PORT — all DEAD: the scripts never read
        // them, so they only gave a false impression of configuring the oracle.
        return {
            env: cfg.activeNet || 'mainnet',
        };
    }

    /**
     * Resolve the parent EVM sidechain's RPC URL from cfg. Throws when
     * the parent isn't configured (the oracle can't run without its
     * parent's RPC reachable).
     *
     * @returns {Promise<string>}
     */
    async resolveParentRpcUrl() {
        const cfg = await ConfigStore.load();
        const parent = cfg && cfg.chains && cfg.chains[this.parentChainId];
        if (!parent || !parent.ports || !parent.ports.rpc) {
            throw new Error(
                `${this.chainId}: parent chain "${this.parentChainId}" not configured. `
                + 'Install the parent EVM sidechain first.',
            );
        }
        return `http://127.0.0.1:${parent.ports.rpc}/`;
    }

    /**
     * Resolve the mainchain RPC URL. Oracles write cross-chain payloads
     * to ELA mainchain so it must be reachable too.
     *
     * @returns {Promise<string>}
     */
    async resolveMainchainRpcUrl() {
        const cfg = await ConfigStore.load();
        const main = cfg && cfg.chains && cfg.chains.mainchain;
        if (!main || !main.ports || !main.ports.rpc) {
            throw new Error(
                `${this.chainId}: mainchain not configured. The Oracle relays to mainchain; `
                + 'install + start mainchain first.',
            );
        }
        return `http://127.0.0.1:${main.ports.rpc}/`;
    }

    /**
     * P1 (v0.5.183) — poll the PARENT EVM sidechain's RPC until it answers,
     * BEFORE spawning the oracle. The oracle is an Express relayer that dials
     * its parent (esc/eid/pg) at startup; if the parent RPC isn't up yet the
     * oracle process stays alive-but-orphaned — it never relays and nothing
     * auto-recovers it (health() is PID-based, so an orphaned-but-alive oracle
     * looks "Healthy"). This mirrors ArbiterAdapter._waitForMainchainRpc: wait
     * for the parent RPC to actually answer (bounded to a generous deadline so
     * it can never hang the install orchestrator), then proceed — on timeout we
     * log + proceed anyway (don't hard-fail; the parent may come up moments
     * later and self-heal covers the rest). Reuses the parentRpcUrl already
     * computed by resolveParentRpcUrl(); probes eth_blockNumber via
     * EthRpcClient (a short JSON-RPC POST). Returns true if the RPC became
     * reachable, false on timeout.
     *
     * @param {object} cfg              this oracle's chain config (unused; parent
     *                                  port parsed from parentRpcUrl)
     * @param {string} parentRpcUrl     e.g. http://127.0.0.1:20636/
     * @param {object} [opts]           { timeoutMs=120000, intervalMs=4000 }
     * @returns {Promise<boolean>}
     */
    async _waitForParentRpc(cfg, parentRpcUrl, opts) {  // eslint-disable-line no-unused-vars
        const log = this.extensionHandle && this.extensionHandle.log;
        // The parent RPC URL was already validated by resolveParentRpcUrl; pull
        // the port back out of it so we reuse that single source of truth.
        const portMatch = String(parentRpcUrl || '').match(/:(\d+)\/?$/);
        const port = portMatch ? parseInt(portMatch[1], 10) : NaN;
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            // Can't parse a probe target — proceed rather than block start.
            if (log) {
                log.warn(`${ENM_LOG_PREFIX} ${this.chainId}: cannot parse parent RPC port from `
                    + `"${parentRpcUrl}" — skipping readiness wait`);
            }
            return false;
        }
        const timeoutMs = (opts && opts.timeoutMs) || 120000;  // ~2 min
        const intervalMs = (opts && opts.intervalMs) || 4000;  // poll every 4s
        const client = new EthRpcClient({ host: '127.0.0.1', port });
        const deadline = Date.now() + timeoutMs;
        let logged = false;
        while (Date.now() < deadline) {
            try {
                const v = await client.getBlockNumber();
                if (typeof v === 'number') {
                    if (logged && log) {
                        log.info(`${ENM_LOG_PREFIX} ${this.chainId}: parent ${this.parentChainId} RPC `
                            + `reachable (127.0.0.1:${port}) — proceeding to start`);
                    }
                    return true;
                }
            } catch (_) { /* parent RPC not up yet */ }
            if (!logged && log) {
                log.info(`${ENM_LOG_PREFIX} ${this.chainId}: waiting for parent ${this.parentChainId} RPC `
                    + `(127.0.0.1:${port}) before start — the oracle relays to its parent and would `
                    + 'sit idle otherwise');
                logged = true;
            }
            // eslint-disable-next-line no-await-in-loop
            await sleep(intervalMs);
        }
        if (log) {
            log.warn(`${ENM_LOG_PREFIX} ${this.chainId}: parent ${this.parentChainId} RPC still `
                + `unreachable after ${timeoutMs}ms — starting anyway (self-heal will cover it)`);
        }
        return false;
    }

    /**
     * v0.5.172 (#2 node.sh parity) — the upstream crosschain_*.js + common.js
     * HARDCODE the oracle's listen port (e.g. `app.listen('20632')`) and its
     * parent-chain RPC URL (e.g. `new Web3("http://127.0.0.1:20636")`), and read
     * ONLY process.env.env. ENM's old ENM_* env vars were dead — the oracle
     * worked only because the hardcoded values equalled ENM's standard ports.
     * This rewrites those two values in-place from ENM's config so ENM is
     * authoritative. Idempotent: each rewrite fires only when its pattern
     * matches EXACTLY once (re-running with the same values no-ops).
     *
     * P1 (v0.5.183) — `onInstall` controls the 0-match severity. On the START
     * path (onInstall=false) a non-match is logged and the file left untouched
     * (oracle falls back to its hardcoded default = pre-0.5.172 behavior) so it
     * can never block start. On the INSTALL path (onInstall=true) a 0-match is
     * a HARD FAILURE (thrown): a silently-misaligned oracle would talk to the
     * wrong/stale port forever, so we surface it at install time rather than
     * bury it in a warning.
     *
     * @param {object} cfg          cfg.scriptPath (dir) + cfg.ports.httpRpc (desired listen port)
     * @param {string} parentRpcUrl parent EVM chain RPC, e.g. http://127.0.0.1:20636/
     * @param {boolean} [onInstall=false] when true, a 0-match throws instead of warning
     */
    async _alignScriptConfig(cfg, parentRpcUrl, onInstall = false) {
        const dir = (cfg && cfg.scriptPath) || '';
        const listenPort = cfg && cfg.ports && cfg.ports.httpRpc;
        const parentUrl = String(parentRpcUrl || '').replace(/\/+$/, '');
        if (listenPort) {
            await this._patchOnce(
                path.join(dir, this.scriptFilename),
                /app\.listen\((['"])\d+\1\)/g,
                `app.listen('${listenPort}')`,
                'oracle listen port',
                onInstall,
            );
        }
        if (parentUrl) {
            // P1 (v0.5.183) — broaden the host match from a hardcoded
            // `http://127.0.0.1:<port>` to ANY `https?://host:port` so an
            // upstream that ships a different host/scheme (or already-rewritten
            // URL) still matches and gets re-pointed at ENM's parent RPC. The
            // `[^"')]+` body stops at the closing quote/paren so we never
            // swallow trailing args. (Idempotent: re-running with the same
            // parentUrl rewrites to an identical string → _patchOnce no-ops.)
            await this._patchOnce(
                path.join(dir, 'common.js'),
                /new Web3\((['"])https?:\/\/[^"')]+\1\)/g,
                `new Web3("${parentUrl}")`,
                'parent RPC url',
                onInstall,
            );
        }
    }

    /**
     * P1 (v0.5.183) — install-time alignment with HARD-FAIL semantics. The
     * oracle install flow (after the scripts + deps are on disk) should call
     * this so a format drift that prevents ENM from rewriting the listen port /
     * parent RPC URL becomes a visible install failure rather than a silently
     * misaligned oracle discovered later. Resolves the parent RPC URL the same
     * way start() does, then runs _alignScriptConfig with onInstall=true (0
     * matches → throw). start() itself stays best-effort (never blocks start).
     *
     * @param {object} cfg  cfg.scriptPath (dir) + cfg.ports.httpRpc
     * @returns {Promise<void>}
     */
    async alignScriptConfigForInstall(cfg) {
        const parentRpcUrl = await this.resolveParentRpcUrl();
        await this._alignScriptConfig(cfg, parentRpcUrl, true);
    }

    /**
     * @private — rewrite `regex` → `replacement` in `file`, but only when the
     * pattern matches exactly once. Idempotent (no-op when already aligned).
     *
     * P1 (v0.5.183) — `onInstall` controls how a 0-match is handled. A 0-match
     * means an upstream format drift the regex no longer recognizes, which would
     * silently leave the oracle pointed at the wrong/stale value. On the INSTALL
     * path we THROW (a misaligned oracle must be a hard failure, not buried in a
     * warning); on the START path we keep the best-effort warn (so a transient
     * read problem can never block start). A read/write I/O error and an
     * ambiguous >1 match stay warn-only regardless — they aren't the silent-drift
     * case the install gate guards against.
     *
     * @param {string} file
     * @param {RegExp} regex
     * @param {string} replacement
     * @param {string} label
     * @param {boolean} [onInstall=false]
     */
    async _patchOnce(file, regex, replacement, label, onInstall = false) {
        const log = this.extensionHandle && this.extensionHandle.log;
        let text;
        try {
            text = await fs.promises.readFile(file, 'utf8');
        } catch (err) {
            if (log) {
                log.warn(`${ENM_LOG_PREFIX} ${this.chainId}: cannot read ${path.basename(file)} `
                    + `to align ${label} (${err.message}) — leaving oracle script as-is`);
            }
            return;
        }
        const matches = text.match(regex);
        const matchCount = matches ? matches.length : 0;
        if (matchCount !== 1) {
            // P1 (v0.5.183) — 0 matches on the install path is a silent-drift
            // hard failure: surface it instead of shipping a misaligned oracle.
            if (onInstall && matchCount === 0) {
                throw new Error(
                    `${this.chainId}: ${label} pattern matched 0x in ${path.basename(file)} `
                    + '(expected 1) — the upstream oracle script format has drifted and ENM can no '
                    + 'longer align it. The oracle would relay to the wrong/stale port; refusing to '
                    + 'proceed. Update the oracle scripts (or ENM\'s patch regex) and retry.',
                );
            }
            if (log) {
                log.warn(`${ENM_LOG_PREFIX} ${this.chainId}: ${label} pattern matched `
                    + `${matchCount}x in ${path.basename(file)} (expected 1) — `
                    + 'not patching; oracle keeps its hardcoded default');
            }
            return;
        }
        const next = text.replace(regex, replacement);
        if (next === text) { return; }   // already aligned — no-op
        try {
            await fs.promises.writeFile(file, next);
            if (log) {
                log.info(`${ENM_LOG_PREFIX} ${this.chainId}: aligned ${label} -> ${replacement}`);
            }
        } catch (err) {
            if (log) {
                log.warn(`${ENM_LOG_PREFIX} ${this.chainId}: failed writing ${label} to `
                    + `${path.basename(file)} (${err.message}) — oracle keeps its hardcoded default`);
            }
        }
    }

    /**
     * start() — overrides base to handle node-vs-binary spawn.
     *
     * Pre-flight:
     *   1. cfg.scriptPath must exist + contain the per-oracle script
     *   2. cfg.binaryPath must point at a `node` interpreter (M4.3
     *      runtime ships this; for M4.1 we trust the operator)
     *   3. Parent EVM sidechain must be configured
     *   4. Mainchain must be configured
     *
     * @param {object} cfg
     * @returns {Promise<{ pid: number, startedAt: number }>}
     */
    async start(cfg) {
        if (!cfg || typeof cfg !== 'object') {
            throw new TypeError(`${this.chainId}.start: cfg object required`);
        }
        if (typeof cfg.binaryPath !== 'string' || !fs.existsSync(cfg.binaryPath)) {
            throw new Error(
                `${this.chainId}: node interpreter not found at ${cfg.binaryPath}. `
                + 'Run the Node.js runtime install step (M4.3).',
            );
        }
        const scriptAbs = path.join(cfg.scriptPath || '', this.scriptFilename);
        if (!fs.existsSync(scriptAbs)) {
            throw new Error(
                `${this.chainId}: oracle script not found at ${scriptAbs}. `
                + 'Install the oracle scripts before starting.',
            );
        }
        const parentRpcUrl = await this.resolveParentRpcUrl();
        // Precondition only — the oracle relays to mainchain, so it must be
        // configured. (The URL is no longer passed as an env var; the script
        // reaches mainchain via its own bundled logic.)
        await this.resolveMainchainRpcUrl();
        // P1 (v0.5.183) — WAIT for the parent EVM sidechain's RPC to actually
        // answer before spawning. The oracle dials its parent at startup; if the
        // parent isn't up the oracle stays alive-but-orphaned (never relays) and
        // nothing recovers it. Bounded (~2 min) + non-fatal on timeout, mirroring
        // ArbiterAdapter._waitForMainchainRpc.
        await this._waitForParentRpc(cfg, parentRpcUrl);
        // v0.5.172 (#2) — rewrite the oracle script's hardcoded listen port +
        // parent-RPC URL from ENM's config so ENM is authoritative (the script
        // reads no env vars for these). Best-effort; never blocks start.
        await this._alignScriptConfig(cfg, parentRpcUrl);
        cfg.spawnArgs = this.buildSpawnArgs(cfg);
        cfg.spawnEnv = this.buildEnv(cfg);
        return this.processService.start(this.chainId, cfg);
    }

    /**
     * Override health() — PID-based, mirroring node.sh's <x>-oracle_status
     * which only checks `pgrep -fx 'node crosschain_<x>.js'` (node.sh:3581).
     *
     * BUG-C13 (node.sh parity) — the upstream crosschain_<x>.js oracle is a
     * PLAIN Express server (it serves `POST /` on a HARD-CODED port, e.g.
     * 20632/20642/20672) and does NOT speak JSON-RPC. The previous
     * net_version probe therefore ALWAYS failed → rpcOk=false forever →
     * HealthChecker F2 (rpc-unreachable-while-alive) restart-looped a
     * perfectly healthy oracle, and the SIGTERM/respawn churn eventually
     * exhausted the restart budget and left it stopped (cycle-6 finding).
     * The probe also targeted cfg.ports.httpRpc, which on testnet was a
     * fictional `+1000` port the oracle never listens on. For an oracle,
     * process-alive IS the health signal — exactly node.sh's model. The
     * `cfg` arg is kept for signature parity with the base adapter.
     *
     * @param {object} cfg
     * @returns {Promise<{ alive: boolean, rpcOk: boolean, pid: number|null }>}
     */
    async health(cfg) {  // eslint-disable-line no-unused-vars
        const procStatus = this.processService.statusSync(this.chainId);
        if (!procStatus.alive) {
            return { alive: false, rpcOk: false, pid: null };
        }
        return { alive: true, rpcOk: true, pid: procStatus.pid };
    }

    /**
     * v0.5.168 (Phase 1) — oracles are stateless relayers with no chain of
     * their own (height/peers/synced stay null — the chain card already skips
     * the height block for class C). For hero context we surface the PARENT
     * EVM sidechain's current block height (e.g. esc for esc-oracle) so the
     * operator can see what the relayer is tracking. Best-effort: loads the
     * parent's RPC port and reads eth_blockNumber. Never throws.
     *
     * @param {object} cfg  (this oracle's chain config — unused; parent looked
     *                       up from the full ConfigStore by parentChainId)
     * @returns {Promise<{height:number|null, peers:number|null, networkHeight:number|null, synced:boolean|null, parentBlockHeight:number|null}>}
     */
    async primaryHeight(cfg) {  // eslint-disable-line no-unused-vars
        const out = {
            height: null, peers: null, networkHeight: null, synced: null, parentBlockHeight: null,
        };
        try {
            const full = await ConfigStore.load();
            const parent = full && full.chains && full.chains[this.parentChainId];
            if (parent && parent.ports && parent.ports.rpc) {
                const rpc = new EthRpcClient({ host: '127.0.0.1', port: parent.ports.rpc });
                const v = await rpc.getBlockNumber();
                if (typeof v === 'number') { out.parentBlockHeight = v; }
            }
        } catch (_) { /* parent RPC unreachable; parentBlockHeight stays null */ }
        return out;
    }

    /**
     * v0.5.186 (Council Node UX P1.2) — real, truthful status for the Oracle
     * view. The oracle dashboard previously showed almost nothing because the
     * backend exposed only PID + parentBlockHeight. This surfaces what we CAN
     * honestly know without fabricating:
     *   - parentReachable / parentBlockHeight: can the oracle reach the EVM
     *     sidechain it relays FROM (it's useless if not)? Real eth_blockNumber probe.
     *   - lastLogAt: the oracle log file's mtime = the last time the relayer
     *     actually produced output (a real liveness/activity signal, not a guess).
     *   - lastError: the most recent error-shaped line in the log tail, or null.
     * Everything stays null when genuinely unknown — the UI renders "—" rather
     * than inventing a value. Best-effort; never throws.
     *
     * @param {object} cfg  this oracle's chain config (unused; parent from full cfg)
     * @returns {Promise<{parentChainId:string|null, parentReachable:boolean|null,
     *   parentBlockHeight:number|null, lastLogAt:number|null, lastError:string|null}>}
     */
    async oracleStatus(cfg) {  // eslint-disable-line no-unused-vars
        const out = {
            parentChainId: this.parentChainId || null,
            parentReachable: null,
            parentBlockHeight: null,
            lastLogAt: null,
            lastError: null,
        };
        try {
            const full = await ConfigStore.load();
            const parent = full && full.chains && full.chains[this.parentChainId];
            if (parent && parent.ports && parent.ports.rpc) {
                const rpc = new EthRpcClient({ host: '127.0.0.1', port: parent.ports.rpc });
                const v = await rpc.getBlockNumber();
                if (typeof v === 'number') {
                    out.parentReachable = true;
                    out.parentBlockHeight = v;
                } else {
                    out.parentReachable = false;
                }
            }
        } catch (_) { out.parentReachable = false; }
        try {
            const probe = await this._probeOracleLog();
            out.lastLogAt = probe.lastLogAt;
            out.lastError = probe.lastError;
        } catch (_) { /* log unreadable — fields stay null */ }
        return out;
    }

    /**
     * @private — tail the oracle's node log for liveness + last error. Returns
     * { lastLogAt (file mtime ms), lastError (recent error-shaped line | null) }.
     * Bounded 32KB read; never throws.
     */
    async _probeOracleLog() {
        const out = { lastLogAt: null, lastError: null };
        const MAX = 32 * 1024;
        const ERROR_RE = /\b(error|failed|failure|econnrefused|exception|cannot|unhandled)\b/i;
        const logDir = path.join(chainDir(this.chainId), 'logs');
        const entries = await fs.promises.readdir(logDir).catch(() => []);
        const logs = entries.filter((n) => /\.log$/.test(n)).sort();
        if (logs.length === 0) return out;
        const full = path.join(logDir, logs[logs.length - 1]);
        const stat = await fs.promises.stat(full).catch(() => null);
        if (!stat) return out;
        out.lastLogAt = stat.mtimeMs;
        const start = Math.max(0, stat.size - MAX);
        const fd = await fs.promises.open(full, 'r');
        try {
            const buf = Buffer.alloc(stat.size - start);
            await fd.read(buf, 0, buf.length, start);
            const lines = buf.toString('utf8').split('\n');
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i].trim();
                if (line && ERROR_RE.test(line)) {
                    out.lastError = line.slice(0, 200);
                    break;
                }
            }
        } finally {
            await fd.close().catch(() => {});
        }
        return out;
    }
}

module.exports = OracleAdapter;
