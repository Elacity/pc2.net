/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EvmSidechainAdapter — Wave M3.1 (beta.3.95) — abstract base class
 * for the Elastos EVM PBFT sidechains (ESC, EID, PG — Class B per the
 * 5-class taxonomy in plan §2).
 *
 * WHY A SHARED BASE
 *
 * The three EVM sidechain binaries (esc, eid, pg) are all go-ethereum
 * forks with the same PBFT-on-mainchain-keystore architecture. They
 * differ in:
 *   - Binary name + chainId    (esc/eid/pg)
 *   - Display name + class label
 *   - Port number tuple        (per the audited Elastos docs)
 *   - Network ID / genesis hash for sanity checks
 *   - EID-specific: spvconfig.json materialization for testnet
 *   - PG-specific:  closed-source binary verification
 *
 * Everything else — spawn flag construction, PBFT-keystore wiring,
 * miner-address validation, RPC client construction, password-from-
 * mainchain-keystore decryption, start() lifecycle including pre-flight
 * keystore checks + UFW open + stdin password feed — is identical
 * across all three. M3.2 (EscAdapter / EidAdapter) and M5.1 (PgAdapter)
 * subclass this with minimal overrides.
 *
 * NODE.SH PARITY (per plan §17 Class B section + §4 anti-patterns)
 *
 * REPLICATED (operators expect these):
 *   - `--pbft.keystore ${SCRIPT_PATH}/ela/keystore.dat`
 *     The EVM sidechain's PBFT signing identity = the mainchain
 *     producer identity (node.sh:2144, 2218, 2289, 4382). H23 enforces
 *     "don't create separate per-chain PBFT keystores". We point at
 *     the mainchain keystore.dat via a stable path resolver — NOT a
 *     copy, NOT a symlink: a direct path reference. Reading is read-
 *     only from the child's perspective.
 *   - `--pbft.keystore.password <file>` — replaced with stdin-piped
 *     decrypted plaintext (the file pattern is the node.sh anti-
 *     pattern from H24; we decrypt + pipe at spawn time).
 *   - EVM keystore generation via the binary's own `account new` flow
 *     is handled by the M3.5 setup wizard (NOT by this adapter — the
 *     adapter assumes the keystore already exists at start time).
 *   - Per-chain data dir layout: chains/<chainId>/data/keystore/UTC--*
 *
 * DIVERGED (security/UX bugs ENM fixes):
 *   - No `--password "$(cat ...)"` in `ps auxw` — stdin only.
 *   - No `--allow-insecure-unlock` combined with external-bound RPC
 *     (H25). Default --http.addr is 127.0.0.1.
 *   - Strict miner-address validation (regex + EIP-55 warn) before
 *     accepting the operator's input — node.sh accepts "BANANA".
 *
 * SUBCLASS CONTRACT
 *
 * Each Class B subclass MUST provide:
 *   - chainId           (e.g. 'esc')
 *   - displayName       (e.g. 'Elastos Smart Chain')
 *   - binaryName        (e.g. 'esc')         — used by EnmBinaryDownloader
 *   - defaultRpcPort    (e.g. 20636 per docs)
 *   - chainIdValue      (e.g. 20 for ESC mainnet — the EIP-155 chain id)
 *   - generateExtraSpawnArgs(cfg, secrets)   — chain-specific flags
 *
 * Optionally override:
 *   - generateConfig(cfg, secrets) — most chains don't need an
 *     external config file; all knobs are CLI flags.
 *   - start(cfg) — only if pre-flight checks beyond the shared ones
 *     are required.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const ChainAdapter = require('./ChainAdapter');
const { EthRpcClient } = require('./EthRpcClient');
const { ENM_LOG_PREFIX } = require('./EnmConstants');
const { chainDir } = require('./DataDir');
const ConfigStore = require('./ConfigStore');
const EnmCrypto = require('./EnmCrypto');
const EnmFirewallManager = require('./EnmFirewallManager');
const ExtIpResolver = require('./ExtIpResolver');
const EnmPeerCache = require('./EnmPeerCache'); // v0.5.195 — last-known-good peer fallback

// Standard subdirectory layout matching node.sh's per-chain conventions
// (build/skeleton/node.sh paths).
const PBFT_KEYSTORE_RELPATH = 'keystore.dat';          // inside mainchain chainDir
// 0.5.157 — BUG-C8b: geth's --pbft.keystore.password takes a FILE PATH; we
// write the decrypted password here (0600) inside this chain's dir.
const PBFT_PASSWORD_FILENAME = '.pbft-keystore-password';
const EVM_KEYSTORE_RELPATH = path.join('data', 'keystore'); // inside this chain's chainDir
const DATA_RELPATH = 'data';
// FIX-C12 — the EVM keystore account's own password (NOT the mainchain
// PBFT keystore password). node.sh's *_init writes this to
// ~/.config/elastos/<chain>.txt (esc_init:3241) and the binary's
// `account new --password <file>` consumes it (esc_init:3245). We keep
// it next to the chain's data (0600), encrypt the value into cfg via
// EnmCrypto, and reuse it on every subsequent start.
const EVM_ACCOUNT_PASSWORD_FILENAME = '.evm-account-password';
// `account new` can be slow on a cold box (scrypt KDF + disk). node.sh
// gives it no explicit timeout; we use a generous one so a busy host
// doesn't spuriously fail the first miner start.
const EVM_ACCOUNT_NEW_TIMEOUT_MS = 120_000;

// FIX-C17 — ESC's frozen account list. These 11 addresses are frozen at
// the ESC consensus layer; an ESC validator that produces blocks WITHOUT
// them would diverge from the network. node.sh passes them to esc's geth
// as a REPEATED `--frozen.account.list <addr>` flag (one flag per address,
// NOT comma-separated) in the council miner branch — verbatim from
// node.sh:2156-2166. This applies to esc ONLY (NOT eid, NOT pg).
//
// v0.5.185 P1-E — DRIFT WARNING: this list is hard-coded against a specific
// node.sh revision. It is CONSENSUS-CRITICAL — a producing ESC validator that
// uses a different frozen set than the network diverges (forks). If Elastos
// amends ESC's mainnet frozen accounts in a future binary release, node.sh
// ships the update but THIS list goes stale. Re-verify against node.sh on every
// esc binary bump (the binary also appends 2 more frozen addrs in its mainnet
// default branch — so the effective set is these 11 + 2 = 13).
const ESC_FROZEN_ACCOUNTS = Object.freeze([
    '0xD3651037F719CC3f38ef819f919972e04A0762d4',
    '0xd5300C4091C4C45787C1BcB2b3d089F6a6094498',
    '0xE4F50ec2E5E75d28647ce11Fd249f1Bf44be4269',
    '0x1562996a963fBaff40E23C6Fc544Cc048Bc89E4d',
    '0x1A94cCFBAcf5DE728f3429A775bF1889082C96F3',
    '0x6eAB6c04A7a418e3968B44356F0C15FB9ec275db',
    '0x415dC0F88C5e8236EE1fC7970bDf5805e717645F',
    '0x0D28dC303d1f665B441E5486E152260a805D4857',
    '0x9b4f4E09375bd0F9D6385E9d0a39605a073DD01E',
    '0xB7f7f0C40aBb51589A8074665c6c5f5565F5780a',
    '0xA7cDb922183f826489707E1E41b68174BFdDbdDC',
]);

// v0.5.197 — SHIPPED default --bootnodes per EVM chain. So a fresh install peers
// out of the box without depending on the binary's (potentially dead) built-in
// foundation bootnodes. Unioned with operator config + the harvested cache in
// buildSpawnArgs (operator wins on dedupe; cache adds known-live peers; this
// list is the last-resort fallback for never-peered nodes).
//
// Why this is DDoS-safe even though the list is in open source: bootnodes are
// MEANT to be public (every chain ships theirs in its repo); the real mitigation
// is the per-node peer cache (EnmPeerCache) making these FIRST-CONTACT-ONLY —
// once a node has peered, it re-peers from its own cache and never depends on
// these seeds again, so attacking them can't take down the running network.
//
// CONTENT (extracted from the live chain binaries via `strings <bin> | grep enode`
// on a test node — the authoritative source since the chain repos aren't all public):
//   esc: 9 foundation :20630 enodes (Elastos.ELA.SideChain.ESC v0.2.7.1) —
//        AWS hosts across regions; empirically alive (the test node peers off them OOTB).
//   eid: 11 foundation :20640 enodes (Elastos.ELA.SideChain.EID v0.2.4) —
//        same AWS host pool; have been flaky/dead at times, but harmless to ship
//        (geth tries them via discv4 and moves on; cache + the same-operator-
//        runs-all-chains effect handle the live peering).
//   pg : 3 foundation :20670 enodes (Elastos.ELA.SideChain.PG v0.0.3.1) — the pg
//        repo isn't public on GitHub, so the running binary's compiled-in set is
//        the canonical source. (3 more entries in the binary have port :0 and
//        are unusable placeholders; skipped.)
//
// Per the same-operator-runs-all-chains observation, even one alive enode per
// chain is sufficient — the cache harvests the other ~11 multi-chain council
// operators on each chain's network within the first 20-min tick.
const DEFAULT_BOOTNODES = Object.freeze({
    esc: Object.freeze([
        'enode://dee112e94b17b3b49366e5dec78d7e8a1ee342ff363b490819d40a55482046d333b2bd51b3d1ce250078c5315bf302758d13f63ac94fd8e43f6e54be8412c316@52.74.28.202:20630',
        'enode://152fae4134f4db49d24905762ade694fc86e0a24124c0927c9c1cbc816bb9929e790d4fba236c7a55c9d9817df72c1d23353c2dccc3796bd397d72320a722ef1@52.62.113.83:20630',
        'enode://dbfdb62b5cf4cb5a12ee1df68bfb4c0626ad5335ec5ee0c594c315b08a61e7f0bc8ce5b264136eec0db17db1e55f1bb0f1de67f9bb9c57bea77feef74f2baa2c@35.156.51.127:20630',
        'enode://a1a37849c8a0d5247870fc2d70da053fdae503b99498daf63905728bc801a57818577a88b02895763a5af8037ab5378b3ea12eb01ec2546712cf5ebaab3e94c6@35.177.89.244:20630',
        'enode://30dc2b7986e2ec5902498ec26fad6fcecece617aa1652f227f684ede6a0939bb7a205ada1c91420d30b427c86bbdcc31fdfd6d955dd8f5854370f583025a0708@15.206.198.252:20630',
        'enode://5e1d6f9f74e33b2d1e2fda87efaf60a788b338c08eefd3a435e9c7de98645bc041421c27d9ed3927c7b5195febd691aff30de881842749f3030089df0e135232@13.234.24.155:20630',
        'enode://777e2a86687d675c05344acc6e24cefbd3e233759e8b89d7b3d101aeffc89e6292f66a115c5bfc30f250c120e6a2354a7a6ea304439cfded706de1c9ade61abf@3.111.241.201:20630',
        'enode://b0357d45e9070c1660f63f077e0e3b0054a18d93785589d498586b6e0b7ec7c5b39ef608e82e7280ca95019db7c36455275d98a3e8684916ba8f3a7aab4ad38b@13.234.249.168:20630',
        'enode://deb84117dada6c2c8f9c5d9d44f749b6fbbefdc987a1611b683ead6e4e2ce8e0d05a196591a713376eee5d9c165d3888d2e175e8eb842e5a381f273c0268edca@65.0.164.47:20630',
    ]),
    eid: Object.freeze([
        'enode://02acd3f3812d55d0e667427bf83dd1d5169800323c56e431750bbf55667cf45ef0cacd6a7c895a73170fe388524a7010a8063034a2212aefbe6cf2c7ef7c8b66@52.74.28.202:20640',
        'enode://11c94a56ffb38ac466cb8d49c98359dffa24d268091ffc8804dcb70189440f8f6a1f0026b62453067395d49a9005d8035f2bb19e66fdfdebc612afaae5368870@15.206.198.252:20640',
        'enode://1c57ab060416f968a1972e9713c2c433f4af77844ada4faede9926cf63858d4e4c347d3e703f1ef762cb5ecc29c047cff3e584c1b2dc73acbfab26c02661d54f@13.234.249.168:20640',
        'enode://35fc836cc3f0300d889e9f7fb572c40ecc37848eb5d634ed6d89645392a2dcc21f12be46a02021980d32259449004956077a185c45ded5d4487b5c50155454c7@65.0.164.47:20640',
        'enode://7ccf14cf7ca30177ac2533bd7c9c73fbacc59c4e8a012cb1fa1328da1f3ab06aef2dadbb378510d471a8a57d2c11c79585cfacfa8946fde55529c1db761a0910@3.111.241.201:20640',
        'enode://8104ddf1c74b602229df91cf72361b4579b94d024521860c3ffa0e693f2c98f93c084bc1c7fb9e548d486e925a589beadd7dedbd39fd4372ef14993e3a1b0d6c@35.177.89.244:20640',
        'enode://8839fc9b0cec7e63f0b3ffd0f6f6030ef05a0ccf2b47affdc59e8db5ac4b0ea2cbe52ac67b7e7a88060c38c1aa47f4eae2c12169b9f4c8d887bf6d3770aea206@35.156.51.127:20640',
        'enode://ae29f21785c49231e4cc7f505c046ad13eaa2c3851b0241ba737cabea98950efab9f095b2cae52c042bb6b977ddbbd19eeeb2c9a1f990d46850138dfbefcffba@15.206.236.124:20640',
        'enode://bcad5f7115806ded945d1d2dfb62fa1eb360466a962f8637348dd9e2a60c6b3d8d514b238a758c33502ba5a7487050880e0a575d36523b28189ab85f56a488df@34.229.27.111:20640',
        'enode://d4165872fc56b6baa6b11a4ddb17eb2ebe5b1ad92fd29dee46895c4c99c23d3e4859ee43805ddf883bdbe652b96aac4c2461599f49598e474d50942c3c67ef4b@13.234.24.155:20640',
        'enode://d82fae81d36b61afa01339c402992dc44434a9ad427ac0c7ea170fe650c86de49dde11c9ed57a4f7661534ccd130e6b420bb2f7db2bacbbce15ecec6427ed6e7@52.62.113.83:20640',
    ]),
    pg: Object.freeze([
        // 3 foundation :20670 enodes from the pg v0.0.3.1 binary scan.
        'enode://138f5bddd685b8bdd203075499f48f022894cd95041e89812dd5160439f196af36869dc5d8cdb97e508ad9c9e4e80511a93707a65badda1a93dc18252f3cffab@15.206.198.252:20670',
        'enode://e1a54ff3f8e3582d0fd7418024bf67b2ede860080b2f3cd450f856d94d8c9d8972eee0885a62d7d62d96201b90e47610e13922f9e410674e5a1b80af868bf422@13.234.249.168:20670',
        'enode://f7ecb7705471b103d2e6aee61427f014e6f3c658e4e28416b7a96aebfb180c83869e46312e19e69711db15cdedef9e2ed1002bb9d8c5af634c43d26e3a6eca7a@13.234.24.155:20670',
        // v0.5.198 — 2 live :20678 operator-network enodes harvested from a
        // production pg node's admin.peers (2026-05-22). Filtered per operator
        // directive to EXCLUDE IPs that also appear in the production eid peer
        // set (multi-chain council operators) — those 9 of 11 dialable were
        // dropped to avoid making council infra a public ENM bootnode (load
        // mitigation). These 2 are pg-only peers, safe to ship as defaults.
        'enode://f57a9717c4cc39851477904da13a1f4fa32fe09da7ce298a8444afc34de42ef563dc7a7ec00cabef0fe2c4a9ccde2147949bbcccdde860448263cf033f2567d9@47.239.224.179:20678',
        'enode://637237494d6cc765cbf5c8ec9489f0461b99989c419d942de9f896da4e588b7b083664f2926289f229e040b11e92d5889403ec2c1b0b7d54658f074e3b59ec95@47.83.8.127:20678',
    ]),
});
const MAX_BOOTNODES = 50;

class EvmSidechainAdapter extends ChainAdapter {
    /**
     * @param {object} deps  forwarded to ChainAdapter base
     */
    constructor(deps) {
        super(deps);
    }

    // -------- Required subclass overrides (throws if not implemented) --------

    /** @returns {string} e.g. 'esc' */
    get chainId() {
        throw new Error('EvmSidechainAdapter: subclass must override chainId');
    }
    /** @returns {string} e.g. 'Elastos Smart Chain' */
    get displayName() {
        throw new Error('EvmSidechainAdapter: subclass must override displayName');
    }
    /** @returns {string} binary file name expected on disk (e.g. 'esc') */
    get binaryName() {
        throw new Error('EvmSidechainAdapter: subclass must override binaryName');
    }
    /** @returns {number} default RPC port for sanity-checking cfg.ports.rpc */
    get defaultRpcPort() {
        throw new Error('EvmSidechainAdapter: subclass must override defaultRpcPort');
    }
    /** @returns {number} EIP-155 chain id used for net_version sanity check */
    get chainIdValue() {
        throw new Error('EvmSidechainAdapter: subclass must override chainIdValue');
    }

    // -------- Implementations shared by all Class B chains --------

    /**
     * Class B is always 'B' per the canonical map. Override of
     * ChainAdapter's getter purely for explicit-is-better-than-implicit;
     * the base class would compute the same value via classOf().
     */
    get chainClass() { return 'B'; }
    /** Class B chains have no parent in the dependency DAG. */
    get parentChainId() { return null; }
    /**
     * FIX-C16 — stop the geth EVM sidechains with SIGINT, not SIGTERM.
     * These binaries are an old go-ethereum fork whose clean-shutdown
     * handler (flushes leveldb) is keyed to SIGINT; node.sh stops esc/eid/pg
     * with `kill -s SIGINT` (node.sh:2412/4416). A SIGTERM stop risks a
     * less-clean shutdown and leveldb corruption. The base ChainAdapter.stop()
     * threads this signal into NativeProcessService.stop.
     */
    get stopSignal() { return 'SIGINT'; }

    /**
     * v0.5.188 — Recognize whether THIS node is an on-chain producer for the
     * EVM sidechains, by asking the MAIN CHAIN (getarbitersinfo) and checking
     * our DPoS node public key against the active + next arbiter slates.
     *
     * WHY (operator directive 2026-05-21 + verified against chain source):
     * mining is NOT an ENM toggle. An Elastos EVM sidechain's block producers
     * ARE the main chain's arbiters (CR-Council CRC arbiters + elected DPoS
     * arbiters), announced by the main chain (NextTurnDPOSInfo) and learned by
     * the sidechain over SPV — SideChain.ESC/spv/nextturn_dposinfo.go
     * GetProducers() -> SpvService.GetArbiters(elaHeight). The set ROTATES per
     * turn. The PBFT layer self-elects; a node only produces when its key is in
     * the slate. ENM must READ this, never store a `miner.enabled` flag.
     *
     * FAIL-SAFE: returns isProducer:null when the main-chain RPC is unavailable
     * or our pubkey isn't configured. Callers MUST treat null (and false) as
     * "do not mine" — mining while NOT a producer entrenches a chain fork
     * (the eid block-166410 wedge); merely missing a turn while genuinely
     * on-duty is harmless and self-recovers on the next re-check.
     *
     * Pure read (no side effects); accepts the full ConfigStore cfg OR a bare
     * chains-map so it is callable from start(), routes, and unit tests alike.
     *
     * @param {object} allChainsCfg  ConfigStore cfg ({chains:{mainchain}}) or chains-map ({mainchain})
     * @returns {Promise<{isProducer: boolean|null, inCurrent: boolean, inNext: boolean, arbiterCount: number, source: string, error?: string}>}
     */
    async detectProducerRole(allChainsCfg) {
        const out = {
            isProducer: null, inCurrent: false, inNext: false, arbiterCount: 0, source: 'unavailable',
        };
        try {
            // Tolerate either shape: full cfg ({chains:{mainchain}}) or chains-map ({mainchain}).
            const root = (allChainsCfg && allChainsCfg.chains) || allChainsCfg || {};
            const mainCfg = root.mainchain;
            const nodePubkeyRaw = mainCfg && mainCfg.dpos && mainCfg.dpos.nodePublicKey;
            if (!nodePubkeyRaw) { out.source = 'no-node-pubkey'; return out; }
            const mainRpc = mainCfg.rpc;
            if (!mainRpc || !mainRpc.user) { out.source = 'no-mainchain-rpc'; return out; }

            // Lazy require (matches the codebase's adapter pattern; keeps the
            // import block untouched and unit tests light).
            // v0.5.228 — EnmRpcClient is a NAMED export; the pre-228 bare
            // require returned the whole module object and `new
            // EnmRpcClient(...)` threw "EnmRpcClient is not a constructor"
            // → every detectProducerRole call returned source='error', so
            // /system/council-status reported every chain as "unknown".
            // Destructure to grab the class itself.
            const EnmCrypto = require('./EnmCrypto');
            const { EnmRpcClient } = require('./EnmRpcClient');

            let password = '';
            if (mainRpc.passwordEncrypted) {
                try {
                    password = EnmCrypto.decrypt(mainRpc.passwordEncrypted);
                } catch (e) {
                    out.source = 'rpc-password-undecryptable';
                    out.error = e && e.message ? e.message : String(e);
                    return out;
                }
            }
            const client = new EnmRpcClient({
                host: mainRpc.host || '127.0.0.1',
                port: mainRpc.port || 20336,
                user: mainRpc.user,
                password,
                timeoutMs: 5000,
            });
            const info = await client.getarbitersinfo();
            const norm = (s) => String(s || '').toLowerCase().replace(/^0x/, '');
            const me = norm(nodePubkeyRaw);
            // v0.5.229 (audit 2026-05-27) — TWO bugs fixed here:
            //   1. The current-slate field is `arbiters`, NOT `currentarbiters`.
            //      The pre-229 read of `info.currentarbiters` always landed on
            //      undefined → empty array → every Council operator looked
            //      Inactive even when on-duty. Verified against ELA struct
            //      definition at Elastos.ELA/servers/interfaces.go:884-892
            //      and confirmed by live curl 2026-05-27.
            //   2. ELA's RPC handler at servers/interfaces.go:906-912 emits
            //      an empty-string slot for any CRC arbiter whose IsNormal
            //      is false (= MemberState != MemberElected). Filter empties
            //      before .includes(me) so a Council member in MemberInactive
            //      isn't silently hidden by an empty-string slot.
            const current = Array.isArray(info && info.arbiters)
                ? info.arbiters.map(norm).filter((s) => s.length > 0)
                : [];
            const next = Array.isArray(info && info.nextarbiters)
                ? info.nextarbiters.map(norm).filter((s) => s.length > 0)
                : [];
            out.inCurrent = current.includes(me);
            out.inNext = next.includes(me);
            out.arbiterCount = current.length;
            // A synced main chain ALWAYS has a non-empty arbiter slate. An empty
            // slate means the main chain isn't returning real data yet (still
            // syncing / RPC not ready) — treat as UNKNOWN (isProducer stays null),
            // never a definitive "not a producer", so a genuine producer is not
            // demoted on a transient/unsynced read.
            if (current.length === 0 && next.length === 0) {
                out.source = 'empty-slate';
                return out;
            }
            out.isProducer = out.inCurrent || out.inNext;
            out.source = 'getarbitersinfo';
            return out;
        } catch (err) {
            // Fail-safe: unknown role. Callers treat null as "do not mine".
            out.source = 'error';
            out.error = err && err.message ? err.message : String(err);
            return out;
        }
    }

    /**
     * Build an EthRpcClient pointing at this chain's HTTP-RPC port.
     * No HTTP Basic auth — geth doesn't use it; access control is
     * loopback-bind + UFW.
     *
     * @param {object} cfg
     * @returns {import('./EthRpcClient').EthRpcClient}
     */
    rpcClient(cfg) {
        if (!cfg || !cfg.ports || !cfg.ports.rpc) {
            throw new Error(
                `${this.chainId}: rpcClient called with cfg missing ports.rpc`,
            );
        }
        return new EthRpcClient({
            host: '127.0.0.1',
            port: cfg.ports.rpc,
        });
    }

    /**
     * Default: no external config file. ESC/EID/PG drive everything
     * from CLI flags so generateConfig returns null. EID's testnet
     * spvconfig.json is materialized separately by EidAdapter's
     * generateConfig override (M3.7).
     *
     * @param {object} cfg
     * @returns {object|null}
     */
    // eslint-disable-next-line no-unused-vars
    generateConfig(cfg) { return null; }

    /**
     * Subclass hook for per-chain spawn flags. The shared base assembles
     * the common geth flags (--datadir, --http, --pbft.keystore, etc.);
     * subclasses can append chain-specific flags (e.g. ESC sets
     * --escdata, EID sets --spvconfig).
     *
     * @param {object} cfg
     * @param {object} secrets  { mainchainKeystorePath: string }
     * @returns {string[]}
     */
    // eslint-disable-next-line no-unused-vars
    generateExtraSpawnArgs(cfg, secrets) { return []; }

    /**
     * Build the full geth-style argv for this chain. Pure helper; tested
     * in unit tests via _internal export below.
     *
     * Sample output for ESC mainnet (verbose form for readability):
     *   esc
     *     --datadir <chainDir>/data
     *     --networkid 20
     *     --port 20638
     *     --discovery.port 20630   (UDP)
     *     --http
     *     --http.addr 127.0.0.1
     *     --http.port 20636
     *     --http.api eth,net,web3,admin
     *       (`personal` deliberately omitted — H25 anti-pattern: it
     *        exposes personal_unlockAccount via RPC, which combined
     *        with an externally-bound listener would enable remote
     *        unlock. The code below at line ~227 enforces this default.)
     *     --pbft.keystore /<mainchainDir>/keystore.dat
     *     --pbft.ipaddress <externalIP>            (only if known)
     *     --pbft.dposport 20639
     *     --miner.etherbase <minerAddress>         (only when miner.enabled)
     *     --mine --miner.threads 1                  (only when miner.enabled)
     *     --unlock <evmKeystoreAddress>             (only when miner.enabled)
     *     --allow-insecure-unlock                   (only when miner.enabled)
     *     --password <evmAccountPasswordFile>       (only when miner.enabled)
     *
     * FIX-C12 — the miner branch now passes --allow-insecure-unlock +
     * --password <file>, matching node.sh's council miner branch
     * (esc_start:2139,2143). The RPC listener stays bound to 127.0.0.1
     * (H25): --allow-insecure-unlock only relaxes geth's refusal to unlock
     * an account when RPC is reachable; it does NOT expose the listener.
     * geth's password resolution for --unlock reads from --password's
     * file, so the unlock is fully non-interactive (no stdin race).
     *
     * @param {object} cfg
     * @param {object} secrets   { mainchainKeystorePath: string, externalIp?: string,
     *                             pbftPasswordFile?: string, evmAccountPasswordFile?: string }
     * @returns {string[]}
     */
    buildSpawnArgs(cfg, secrets) {
        if (!cfg || !cfg.ports || !cfg.miner || !cfg.pbft) {
            throw new Error(
                `${this.chainId}: buildSpawnArgs requires cfg.{ports,miner,pbft}`,
            );
        }
        if (!secrets || typeof secrets.mainchainKeystorePath !== 'string') {
            throw new Error(
                `${this.chainId}: buildSpawnArgs requires secrets.mainchainKeystorePath`,
            );
        }
        const dataDir = path.join(chainDir(this.chainId), DATA_RELPATH);
        // 0.5.155 — BUG-C8 fix: the Elastos ESC/EID/PG binaries are an OLD
        // go-ethereum fork (Geth/v1.9.7.0-…) that uses LEGACY CLI flags, not
        // the modern --http* names. Pre-0.5.155 buildSpawnArgs passed
        // --http/--http.addr/--http.port/--http.api/--discovery.port/
        // --pbft.dposport/--pbft.ipaddress — none of which this binary
        // defines, so geth exited instantly with "flag provided but not
        // defined: -http" (code=1) and NO EVM sidechain could ever start.
        // Verified against `esc --help` on the live binary:
        //   --http*        → --rpc / --rpcaddr / --rpcport / --rpcapi
        //   --discovery.port → (none; old geth shares --port for TCP+UDP) → drop
        //   --pbft.dposport  → --pbft.net.port
        //   --pbft.ipaddress → --pbft.net.address
        // Confirmed: with these flags geth boots ("Started P2P networking",
        // "HTTP endpoint opened", "SPV Start Monitoring").
        const args = [
            '--datadir', dataDir,
            // v0.5.172 (#4 node.sh parity) — do NOT pass --networkid. node.sh
            // never sets it; the binary's built-in genesis selects the correct
            // Elastos network. Hardcoding it (esc=20 / eid=22 / pg=24 — and pg
            // was an *unverified guess* per PgAdapter) risks a network-id that
            // disagrees with the genesis → the node silently can't peer with the
            // real network. Letting the genesis decide matches node.sh exactly
            // and removes the guess. (this.chainIdValue is still used by EID's
            // spvconfig.json generation — that stays.)
            '--port', String(cfg.ports.p2p),
            // HTTP-RPC: loopback only by default (H25). Legacy --rpc* flag
            // names — this geth fork predates the --http* rename.
            '--rpc',
            '--rpcaddr', '127.0.0.1',
            '--rpcport', String(cfg.ports.rpc),
            // FIX-C12 — when mining, the PBFT consensus engine needs the
            // `pbft` (+ personal/txpool) RPC namespaces enabled so the
            // miner can drive consensus, mirroring node.sh's council miner
            // branch (esc_start:2150 uses 'db,eth,net,pbft,personal,txpool,
            // web3'). We keep our hardened set but add the consensus APIs.
            // Non-miner chains keep the minimal loopback set. cfg.rpcApis,
            // if explicitly set by the operator, always wins. The RPC
            // listener stays bound to 127.0.0.1 (H25) regardless.
            '--rpcapi',
            cfg.rpcApis
                // v0.5.172 (#7 node.sh parity) — node.sh's sets are
                // 'db,eth,net,pbft,personal,txpool,web3' (miner, esc_start:2150)
                // and 'admin,eth,net,txpool,web3' (non-miner). We cover both +
                // keep 'admin' (used by ENM's own diagnostics / SPV reads). All
                // loopback-bound (H25), so 'db' is harmless here.
                || (cfg.miner.enabled === true
                    // v0.5.194 — node.sh's EID miner branch uniquely adds the
                    // `miner` RPC namespace (node.sh:4388) on top of the common
                    // miner set; esc/pg do not. Mirror that per-chain.
                    ? (this.chainId === 'eid'
                        ? 'db,eth,miner,net,web3,admin,pbft,personal,txpool'
                        : 'db,eth,net,web3,admin,pbft,personal,txpool')
                    : 'eth,net,web3,admin,txpool'),
            // v0.5.194 — node.sh sets --rpcvhosts '*' on BOTH the miner and
            // follower branches (esc_start:2151). Harmless while --rpcaddr stays
            // 127.0.0.1 (the Host-header allowlist only bites once RPC is
            // widened), but it matches node.sh and future-proofs the operator's
            // RPC-access toggle so a widened RPC isn't rejected on its Host header.
            '--rpcvhosts', '*',
            // No separate discovery-port flag in this geth fork; UDP discovery
            // shares the TCP --port above (cfg.ports.discovery is reserved for
            // future use / firewall rules, not a geth CLI arg here).
            // v0.5.189 — PBFT signing flags (--pbft.keystore / --pbft.net.* /
            // --pbft.keystore.password) are added below ONLY in miner mode, matching
            // node.sh's follower branch which omits them entirely (a follower syncs
            // over devp2p and never signs). start() has already reconciled
            // cfg.miner.enabled to real on-chain on-duty status before this runs.
        ];
        // FIX-D (v0.5.173) — node.sh selects testnet purely with --testnet
        // (esc_start:2117 `ESC_OPTS=--testnet`); mainnet passes nothing. ENM
        // dropped --networkid (correct) but had NO testnet selector, so
        // activeNet:'testnet' silently produced a MAINNET node (wrong genesis →
        // 0 peers on testnet). The binary's genesis still selects the network;
        // --testnet is what flips it to the testnet genesis.
        if (cfg.activeNet === 'testnet') {
            args.push('--testnet');
        }
        if (secrets.externalIp) {
            // FIX-B2 (v0.5.174) — advertise the external IP at the ETH layer
            // (--nat extip:<ip>) for ALL chains incl. followers. Without it, geth's
            // default --nat=any auto-detect falls back to 127.0.0.1 on a VPS → the
            // node's enode advertises loopback → peers can't dial back → outbound-only
            // peering → very few peers on a thin network (esp. EID). Verified the fork
            // supports `--nat extip:<IP>` (eid --help: any|none|upnp|pmp|extip:<IP>).
            // (--pbft.net.address — the CONSENSUS bind — moved to the miner block,
            // v0.5.189: a follower doesn't join the PBFT consensus net.)
            args.push('--nat', `extip:${secrets.externalIp}`);
        }
        // FIX-B2 (v0.5.174) — discv4 bootnodes from cfg.bootnodes. node.sh relies
        // solely on the binary's built-in bootnodes; for niche/thin networks
        // (EID) those are stale → 0 peers. cfg.bootnodes lets the operator seed
        // discovery with a known-good node (e.g. their own production node), so
        // discv4 finds the rest of the network through it. Empty by default
        // (binary bootnodes only) — exactly node.sh's behavior until populated.
        // v0.5.196 — bootnode resolution: UNION of all sources, deduped by node-id
        // (operator's entries come FIRST in concat → kept on dedupe), capped at
        // MAX_BOOTNODES.
        //   1. operator cfg.bootnodes (explicit; always wins)
        //   2. EnmPeerCache: harvested live dialable peers from prior runs
        //      (purge-surviving local cache; the durability + DDoS-mitigation
        //      layer that makes these seeds FIRST-CONTACT-ONLY).
        //   3. DEFAULT_BOOTNODES per chain: shipped fallback so a never-peered
        //      fresh install still gets working seeds. esc populated (foundation
        //      :20630 — empirically alive); eid/pg pending live enodes (one
        //      operator-pasted enode each suffices — the cache will harvest the
        //      other ~11 multi-chain operators within the first 20-min tick).
        const opBootnodes = (Array.isArray(cfg.bootnodes) && cfg.bootnodes.length > 0) ? cfg.bootnodes : [];
        const cachedBootnodes = EnmPeerCache.readCachedBootnodes(this.chainId);
        const defaultBootnodes = DEFAULT_BOOTNODES[this.chainId] || [];
        const seedBootnodes = EnmPeerCache.dedupeByNodeId(
            [].concat(opBootnodes, cachedBootnodes, defaultBootnodes),
        ).slice(0, MAX_BOOTNODES);
        if (seedBootnodes.length > 0) {
            args.push('--bootnodes', seedBootnodes.join(','));
        }
        // 0.5.157 — BUG-C8b: this geth fork reads the PBFT keystore password
        // from the --pbft.keystore.password flag, whose value is a FILE PATH
        // (NOT the literal password — verified: passing the value fatals
        // "Failed to read password file: open <value>: no such file"). The
        // adapter previously piped the password to stdin (start() step 8),
        // which the binary ignored for PBFT → it logged "create dpos account
        // error: password wrong", fell back to a non-signing "common sync
        // node", and for EID (PBFT from block 0) escalated to "Failed to
        // prepare header for mining: wait for recoved states" → code=2 exit.
        // Fix: start() writes the password to a 0600 file and passes its path
        // here (node.sh's H24 pattern). Verified end-to-end: eid then unlocks
        // PBFT + enters consensus (onDuty list), no "password wrong". Bonus:
        // the password stays OUT of `ps`/`/proc/<pid>/cmdline`.
        // v0.5.189 — PBFT signing flags ONLY in miner mode (node.sh's follower omits
        // --pbft.keystore / --pbft.net.* / --pbft.keystore.password). cfg.miner.enabled
        // was reconciled to real on-chain on-duty status by start() before this.
        if (cfg.miner.enabled === true) {
            // ALWAYS the mainchain keystore.dat (H23 / node.sh:2144).
            args.push('--pbft.keystore', secrets.mainchainKeystorePath);
            args.push('--pbft.net.port', String(cfg.ports.dpos));
            if (secrets.externalIp) {
                args.push('--pbft.net.address', secrets.externalIp);
            }
            if (secrets.pbftPasswordFile) {
                args.push('--pbft.keystore.password', secrets.pbftPasswordFile);
            }
        }
        // Sync mode — v0.5.235: EVM chains ALWAYS full-sync (council-ready).
        //
        // Operator directive 2026-05-28: "all ENM apps should be council ready,
        // remove fast sync." ENM is a validator tool — a Council node produces
        // EVM blocks when on-duty, and node.sh runs producers on --syncmode full
        // (esc_start:2152, eid_start:4390). Rather than fast-when-following /
        // full-when-producing (the pre-v0.5.235 role-based flip), every EVM
        // chain now runs validator-grade FULL sync regardless of current
        // on-duty status, so the node is always production-ready with complete
        // self-validated state and never needs a fast→full re-sync when it goes
        // on-duty. This is safe for from-genesis sync ONLY because v0.5.235 also
        // wipes SPV in lockstep with geth (chainResync) — full-sync re-executes
        // every block (incl. EID's DID tx at 166,410), which requires the
        // arbiter context the lockstep SPV supplies.
        //
        // Fast sync is removed. An explicit 'archive' override is still honored
        // (full + retain all historical state); any other value — including a
        // legacy stored 'fast' — is coerced to 'full'.
        // v0.5.248 (validator-readiness audit P1-10) — archive = FULL sync that
        // RETAINS all historical state. In this geth fork that is
        // `--syncmode full --gcmode archive`, NOT `--syncmode archive` (not a
        // valid syncmode — it would silently fail to produce an archive node).
        // Default + any legacy stored 'fast' coerce to plain full.
        if (cfg.sync && cfg.sync.mode === 'archive') {
            args.push('--syncmode', 'full', '--gcmode', 'archive');
        } else {
            args.push('--syncmode', 'full');
        }
        // Miner — enabled for council validators (the sidechain produces
        // blocks). Values:
        //   miner.enabled         → enable mining at all
        //   miner.evmKeystoreAddr → --miner.etherbase + --unlock (the LOCAL
        //                           auto-created EVM account; see FIX-C12b)
        //   miner.threads         → --miner.threads (default 1)
        if (cfg.miner.enabled === true) {
            // FIX-C12b — the block signer / etherbase MUST be a LOCAL unlocked
            // account. esc's pre-PBFT mining engine (">>> is not pbft engine")
            // fatals "Failed to start mining: signer missing: unknown account"
            // when --miner.etherbase points at an address not in the keystore.
            // We previously set it to miner.rewardAddress (the operator's
            // EXTERNAL 0x reward address), which is NOT a local account → esc
            // died code=1 within 1.5s. (eid/pg use the PBFT engine + sign with
            // --pbft.keystore, so they tolerated the wrong etherbase, masking
            // the bug.) node.sh defaults the etherbase to the created --unlock
            // account; we set it explicitly to the auto-created, unlocked EVM
            // account (evmKeystoreAddr). EVM block rewards therefore accrue to
            // the node's own EVM account, exactly as in node.sh.
            if (!cfg.miner.evmKeystoreAddr) {
                throw new Error(
                    `${this.chainId}: miner.enabled=true but evmKeystoreAddr not set. `
                    + 'The EVM mining account must be created by start() before buildSpawnArgs.',
                );
            }
            args.push('--miner.etherbase', cfg.miner.evmKeystoreAddr);
            args.push('--mine');
            args.push('--miner.threads', String(cfg.miner.threads || 1));
            args.push('--unlock', cfg.miner.evmKeystoreAddr);
            // FIX-C12 — node.sh's council miner branch (esc_start:2139)
            // sets --allow-insecure-unlock. geth refuses to unlock an
            // account with a password file unless this is set (the
            // "Account unlock with HTTP access is forbidden" guard fires
            // even though our RPC is loopback-only). Required for the
            // --unlock + --password file combo below to take effect.
            args.push('--allow-insecure-unlock');
            // FIX-C12 — node.sh:2143 passes `--password <file>` so geth
            // can non-interactively unlock the --unlock account. The flag
            // value is a FILE PATH (same pattern as --pbft.keystore.password
            // / the H24 anti-pattern). start() writes the EVM account
            // password to a 0600 file and threads its path here. We pass a
            // file (NOT stdin) because this geth fork reads --unlock's
            // password from --password's file when present, and feeding it
            // on stdin instead is racy at boot.
            if (secrets.evmAccountPasswordFile) {
                args.push('--password', secrets.evmAccountPasswordFile);
            }
            // FIX-C (v0.5.173) — operator's PBFT block-reward address (FILE
            // path), node.sh esc_start:2134-2135. DISTINCT from --miner.etherbase
            // (the local EVM account above): on the PBFT engine the block reward
            // routes to --pbft.miner.address. Only set when the operator
            // configured a reward address (start() wrote the file).
            if (secrets.minerAddressFile) {
                args.push('--pbft.miner.address', secrets.minerAddressFile);
            }
            // FIX-C17 — ESC consensus-layer frozen accounts. node.sh passes
            // these in esc's council miner branch as a repeated
            // `--frozen.account.list <addr>` flag (node.sh:2156-2166). esc
            // ONLY — eid/pg get no frozen list. Omitting them on a producing
            // ESC validator would create blocks without the network's account
            // freezes (consensus divergence).
            if (this.chainId === 'esc') {
                for (const frozenAddr of ESC_FROZEN_ACCOUNTS) {
                    args.push('--frozen.account.list', frozenAddr);
                }
            }
        }
        // Subclass-provided extras (e.g. EID --spvconfig).
        const extras = this.generateExtraSpawnArgs(cfg, secrets);
        if (Array.isArray(extras)) {
            for (const a of extras) {
                if (typeof a !== 'string') {
                    throw new TypeError(
                        `${this.chainId}: generateExtraSpawnArgs returned non-string: ${typeof a}`,
                    );
                }
                args.push(a);
            }
        }
        return args;
    }

    /**
     * Resolve the absolute path to the mainchain keystore.dat. EVM
     * sidechain spawn requires this (--pbft.keystore points here). If
     * the mainchain isn't installed the EVM chain can't start; surface
     * a clear pre-flight error rather than letting the spawn fail
     * mysteriously.
     *
     * @returns {string} absolute path
     * @throws {Error} when keystore.dat doesn't exist
     */
    resolveMainchainKeystorePath() {
        const p = path.join(chainDir('mainchain'), PBFT_KEYSTORE_RELPATH);
        if (!fs.existsSync(p)) {
            throw new Error(
                `${this.chainId}: PBFT keystore (mainchain keystore.dat) not found at ${p}. `
                + 'Install + complete the mainchain BPoS setup before starting this chain.',
            );
        }
        return p;
    }

    /**
     * Read + decrypt the mainchain's keystore password. EVM sidechains
     * use the same password to unlock --pbft.keystore (it's the same
     * file). Decrypted plaintext is piped to the child's stdin at spawn
     * time; we never write it back to disk.
     *
     * @returns {Promise<string>} plaintext password
     * @throws {Error} when mainchain cfg missing or decrypt fails
     */
    async readMainchainKeystorePassword() {
        const cfg = await ConfigStore.load();
        const main = cfg && cfg.chains && cfg.chains.mainchain;
        if (!main || !main.dpos || !main.dpos.keystorePasswordEncrypted) {
            throw new Error(
                `${this.chainId}: mainchain keystore password not on file. `
                + 'The PBFT signing flow requires the mainchain keystore to be configured first.',
            );
        }
        try {
            return EnmCrypto.decrypt(main.dpos.keystorePasswordEncrypted);
        } catch (err) {
            throw new Error(
                `${this.chainId}: cannot decrypt mainchain keystore password: ${err.message}. `
                + 'Re-enter the mainchain keystore password in Settings → Identity.',
            );
        }
    }

    /**
     * Class B start() lifecycle:
     *   1. Verify binary present (ChainState reuse left for M3.8 — for
     *      M3.1 we trust cfg.binaryPath since the adapter is base-only
     *      and the install path lands in M3.8).
     *   2. Verify mainchain keystore.dat exists (--pbft.keystore target).
     *   3. FIX-C12 — ensure the EVM keystore account exists (auto-create
     *      via `account new` on first miner start, reuse thereafter); skip
     *      entirely when miner.enabled=false.
     *   4. Decrypt the mainchain keystore password.
     *   5. Compute spawn args via buildSpawnArgs (PBFT + EVM-account
     *      password files threaded in as --pbft.keystore.password /
     *      --password).
     *   6. Open UFW for this chain's P2P + discovery ports.
     *   7. Pass cfg.spawnArgs into NativeProcessService.start.
     *   8. No stdin step — both the PBFT keystore password and the EVM
     *      account unlock password are delivered via --password files
     *      (FIX-C12 / BUG-C8b), so the unlock is fully non-interactive.
     *
     * Pre-flight failures throw with actionable messages so the route
     * handler can surface them to the operator UI rather than a generic
     * 500.
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
                `${this.chainId}: binary not found at ${cfg.binaryPath}. `
                + 'Run the install step in the setup wizard.',
            );
        }
        // v0.5.188 — Derive mining from REAL on-chain producer status, not the
        // stored miner.enabled flag (operator directive: "the chain should know
        // if it's a miner; it shouldn't be something we decide"). An Elastos EVM
        // sidechain's producers ARE the main chain's rotating arbiters; a node
        // mines only when its DPoS key is in the slate, and the PBFT layer
        // self-elects. A NON-producer must run as a FOLLOWER — node.sh's else
        // branch: no --mine, no forced --syncmode full, default fast sync. That
        // is ALSO the structural fix for this node's eid wedge: forced full-sync
        // (from miner.enabled=true) re-executes block 166410's DID tx and fails
        // its PreviousTxid check; a fast-sync follower never full-executes it.
        //
        // v0.5.189 — derive mining from REAL on-chain on-duty status at EVERY boot,
        // both directions. shouldMine ONLY when detectProducerRole CONFIRMS the node's
        // DPoS key is in the arbiter slate (getarbitersinfo). DEFINITIVE-false AND
        // UNKNOWN (isProducer:null — main chain still syncing / RPC down) both →
        // FOLLOWER (no --mine, fast sync). This is safe for every case: the side
        // chain's PBFT engine self-gates production at SEAL time (a non-on-duty node
        // cannot seal even with --mine — Pbft.Seal returns errUnauthorizedSigner /
        // ErrSignerNotOnduty), and fast-sync avoids the forced-full-sync EID DID
        // wedge. A CONFIRMED on-duty node is PROMOTED to miner (full sync); the
        // EVM-account preflight below (_ensureEvmAccount, gated on miner.enabled)
        // then provisions its signing account. Mutated in-memory for this spawn and
        // re-derived on every start (idempotent), so a node that goes on/off duty is
        // reconciled at its next (re)start.
        const _roleLog = (this.extensionHandle && this.extensionHandle.log) || null;
        try {
            const allCfg = await ConfigStore.load();
            const role = await this.detectProducerRole(allCfg);
            let shouldMine = (role.isProducer === true);

            // v0.5.229c (P1 audit fix) — CROSS-REFERENCE crMember status.
            //
            // The chain's arbiter slate is FROZEN at compute-height before
            // a rotation actually starts. If an operator unclaims via
            // Essentials AFTER the next slate was frozen, their pubkey
            // stays in nextarbiters[] until the rotation after next.
            // detectProducerRole sees inNext=true → shouldMine=true →
            // ENM would pass --mine to the chain on next restart.
            //
            // Operator directive 2026-05-27: "I removed my council binding
            // to the server we are working until we fix it, so that i dont
            // interrupt chains." The intent of unclaim is "do NOT mine."
            // Without this cross-reference, ENM contradicts that intent
            // for the entire window between unclaim-confirmed and slate-
            // recomputed (potentially hours on mainnet).
            //
            // Decision rule: if the operator is a confirmed Council
            // install (cfg.global.council.installed === true) AND
            // CrMembershipService reports !isCrMember (the on-chain
            // Committee has no record of their dpospublickey), demote
            // to FOLLOWER regardless of nextarbiters membership. This
            // honors operator intent (the unclaim) over the chain's
            // frozen slate.
            //
            // Why this is safe even when wrong:
            //   - If unclaim is genuine: PBFT would refuse Seal() anyway
            //     when the rotation reaches the operator (the chain's
            //     own IsProducer() check is the floor). Adding --mine
            //     would force full-sync + try to seal blocks the chain
            //     refuses → wasted CPU + log noise. Skipping --mine
            //     saves both.
            //   - If unclaim is mistaken / operator re-claims later:
            //     CrMembershipService's 30s cache + next chain start
            //     reconciles in under a minute. No deploy needed.
            //
            // Cited file:line for the unclaim semantics:
            //   Elastos.ELA/dpos/state/arbitrators.go:2444+ (getCRC-
            //   ArbitersV2 reads from CRCommittee.Members[].DPOSPublicKey,
            //   not from the frozen arbiter slate)
            let crMemberCheck = null;
            const setupRole = (allCfg && allCfg.global && allCfg.global.council
                && allCfg.global.council.installed === true) ? 'council' : 'unknown';
            if (shouldMine && setupRole === 'council') {
                try {
                    const CrMembershipService = require('./CrMembershipService');
                    crMemberCheck = await CrMembershipService.detectCrMembership(
                        allCfg, { log: _roleLog },
                    );
                    if (crMemberCheck
                        && crMemberCheck.source !== 'error'
                        && crMemberCheck.isCrMember === false) {
                        // Operator unclaimed (or never claimed) but chain
                        // slate still has them queued. Honor intent over
                        // frozen-slate.
                        shouldMine = false;
                        if (_roleLog) {
                            _roleLog.info(
                                `${ENM_LOG_PREFIX} ${this.chainId}: shouldMine demoted to FOLLOWER `
                                + `despite inNext=${role.inNext}: setupRole=council but `
                                + `crMember.isCrMember=false (source=${crMemberCheck.source}). `
                                + 'The arbiter slate is frozen until the next rotation compute; '
                                + 'until then the chain still has this node\'s pubkey queued. '
                                + 'Spawning with --mine would contradict the operator\'s unclaim '
                                + 'and waste CPU on Seal attempts the chain would refuse.',
                            );
                        }
                    }
                } catch (e) {
                    // detectCrMembership threw — keep shouldMine as-is
                    // (the original getarbitersinfo decision). Surface
                    // the error so the operator can see it.
                    if (_roleLog) {
                        _roleLog.warn(
                            `${ENM_LOG_PREFIX} ${this.chainId}: CrMembershipService check failed `
                            + `(${e && e.message ? e.message : e}) — falling back to slate-only decision.`,
                        );
                    }
                }
            }

            const wasMiner = !!(cfg.miner && cfg.miner.enabled);
            if (cfg.miner) { cfg.miner.enabled = shouldMine; }
            // v0.5.248 (validator-readiness audit P1-2) — record WHY we chose
            // miner/follower so HealthChecker (detectF29) can alert when a
            // Council node fell back to FOLLOWER because it couldn't READ its
            // producer status (mainchain RPC down / creds undecryptable) rather
            // than because it's genuinely off-duty — the "silently stops
            // earning" hazard. source∈{getarbitersinfo,empty-slate}=real read.
            this._lastRoleDecision = {
                source: role.source,
                shouldMine,
                setupRole,
                at: Date.now(),
            };
            // v0.5.235 — syncmode is NO LONGER role-dependent. EVM chains
            // always full-sync (buildSpawnArgs hardcodes it). Producer status
            // controls ONLY --mine (miner.enabled), never the sync mode. The
            // old shouldMine→full / follower→fast flips are removed; the
            // forced-full-sync DID wedge they were avoiding is now handled
            // structurally by the lockstep SPV wipe (v0.5.235 chainResync).
            // Migrate any legacy stored 'fast' to 'full' so persisted config
            // stays honest with what actually runs.
            if (!cfg.sync) { cfg.sync = {}; }
            if (cfg.sync.mode === 'fast' || !cfg.sync.mode) { cfg.sync.mode = 'full'; }
            if (_roleLog) {
                const crNote = crMemberCheck
                    ? ` crMember.isCrMember=${crMemberCheck.isCrMember}, source=${crMemberCheck.source}.`
                    : '';
                _roleLog.info(
                    `${ENM_LOG_PREFIX} ${this.chainId}: producer-role check → isProducer=${role.isProducer} `
                    + `(source=${role.source}, inCurrent=${role.inCurrent}, inNext=${role.inNext})`
                    + crNote
                    + ` → ${shouldMine ? 'MINER (--mine)' : 'non-producer (no --mine)'}; sync=full (always)`
                    + `${wasMiner !== shouldMine ? (shouldMine ? ' [PROMOTED]' : ' [demoted]') : ''}. `
                    + 'Mining is on-chain producer state, not an ENM toggle.',
                );
            }
        } catch (err) {
            // Fail-safe: on an unexpected detection error, do NOT mine (never
            // --mine on an unknown role — the chain self-gates anyway). v0.5.235:
            // sync stays FULL even on detection failure; only mining is demoted.
            if (cfg.miner) { cfg.miner.enabled = false; }
            if (!cfg.sync) { cfg.sync = {}; }
            if (cfg.sync.mode === 'fast' || !cfg.sync.mode) { cfg.sync.mode = 'full'; }
            // v0.5.248 (audit P1-2) — detection threw: this is a can't-read
            // demotion to follower, the exact silent-earning-loss case F29 warns on.
            this._lastRoleDecision = {
                source: 'error',
                shouldMine: false,
                setupRole: (typeof setupRole !== 'undefined') ? setupRole : null,
                at: Date.now(),
            };
            if (_roleLog) {
                _roleLog.warn(
                    `${ENM_LOG_PREFIX} ${this.chainId}: producer-role detection failed `
                    + `(${err && err.message ? err.message : err}) — no --mine (fail-safe), sync=full.`,
                );
            }
        }

        // Step 2 — mainchain keystore.dat must exist.
        const mainchainKeystorePath = this.resolveMainchainKeystorePath();

        // Step 3 — FIX-C12 — EVM account auto-creation. node.sh's *_init
        // runs the geth binary's `account new` to create the EVM keystore
        // account (data/keystore/UTC--*) that the miner branch later
        // --unlocks + uses as --miner.etherbase (esc_init:3245). Pre-FIX-C12
        // start() simply ERRORED when miner.enabled and the keystore dir was
        // empty, so a fresh council install could never start its sidechains
        // as miners. We now create the account on first miner start (and
        // reuse it on every subsequent start). Mutates cfg.miner in place
        // (evmKeystoreAddr + evmKeystorePasswordEncrypted) and persists via
        // ConfigStore so buildSpawnArgs --unlock works.
        let evmAccountPasswordFile = null;
        if (cfg.miner && cfg.miner.enabled === true) {
            evmAccountPasswordFile = await this._ensureEvmAccount(cfg);
        }
        // Step 4 — mainchain password decryption (raises with friendly message).
        const pbftPassword = await this.readMainchainKeystorePassword();

        // Step 5 — spawn args.
        // FIX-B (v0.5.173) — node.sh ALWAYS advertises the node's external IP to
        // the PBFT/DPoS layer via `--pbft.net.address $(extip)` (esc_start:2146).
        // ENM only passed it when cfg.pbft.ipAddress was set (usually null), so
        // the sidechain never advertised a DPoS consensus address. Fall back to
        // the auto-resolved external IP (the same ExtIpResolver the mainchain
        // uses) when no manual address is configured. Best-effort: geth still
        // runs without it (just won't advertise for inbound DPoS peers).
        let externalIp = (cfg.pbft && cfg.pbft.ipAddress) || null;
        if (!externalIp) {
            try {
                const ext = await ExtIpResolver.resolve();
                if (ext && ext.ok) { externalIp = ext.ip; }
            } catch (_) { /* best-effort */ }
        }
        // FIX-C (v0.5.173) — node.sh writes the operator's PBFT block-reward
        // address to <chain>/data/miner_address.txt and passes
        // `--pbft.miner.address <file>` (esc_start:2134-2135). ENM collected +
        // validated cfg.miner.rewardAddress but NEVER passed it → PBFT block
        // rewards silently fell back to the local etherbase. Materialize the
        // file + thread its path into buildSpawnArgs.
        let minerAddressFile = null;
        if (cfg.miner && cfg.miner.enabled === true && cfg.miner.rewardAddress) {
            minerAddressFile = path.join(chainDir(this.chainId), DATA_RELPATH, 'miner_address.txt');
            await fs.promises.mkdir(path.dirname(minerAddressFile), { recursive: true });
            fs.writeFileSync(minerAddressFile, String(cfg.miner.rewardAddress), { mode: 0o600 });
        }
        // 0.5.157 — BUG-C8b: write the decrypted PBFT keystore password to a
        // 0600 file and hand its PATH to geth via --pbft.keystore.password
        // (the flag expects a file path, not the literal value). Overwritten
        // each start; sits next to keystore.dat (same 0600 sensitivity).
        const pbftPasswordFile = path.join(chainDir(this.chainId), PBFT_PASSWORD_FILENAME);
        fs.writeFileSync(pbftPasswordFile, pbftPassword, { mode: 0o600 });
        cfg.spawnArgs = this.buildSpawnArgs(cfg, {
            mainchainKeystorePath,
            externalIp,
            pbftPasswordFile,
            // FIX-C12 — path to the EVM account password file (0600) for the
            // miner branch's --password flag. null when not mining.
            evmAccountPasswordFile,
            // FIX-C — path to miner_address.txt (operator's PBFT reward address).
            minerAddressFile,
        });

        // Step 6 — UFW for P2P (TCP) + discovery (UDP) + dpos (TCP).
        // RPC port intentionally NOT opened (loopback-only per H25).
        try {
            await EnmFirewallManager.ensureAllowed(
                [cfg.ports.p2p, cfg.ports.dpos],
                {
                    // P0-15 — the p2p port ALSO needs UDP: geth's discv4 peer
                    // discovery runs over UDP on the same --port. Without this,
                    // a default-deny UFW host drops discovery → stuck at 0 peers.
                    udpPorts: [cfg.ports.p2p],
                    comment: `${this.chainId} P2P/DPoS (ENM auto)`,
                    logger: this.extensionHandle && this.extensionHandle.log,
                },
            );
        } catch (err) {
            // Non-fatal: chain still starts; F18 will fire later if
            // inbound stays 0 because UFW is blocking.
            if (this.extensionHandle && this.extensionHandle.log) {
                this.extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} ${this.chainId} firewall preflight failed: ${err.message}`,
                );
            }
        }

        // Step 7 — spawn via NativeProcessService (chain-id-keyed lock).
        const result = await this.processService.start(this.chainId, cfg);
        if (result.alreadyRunning) {
            return result;
        }

        // Step 8 — 0.5.157 (BUG-C8b): the PBFT keystore is unlocked via the
        // --pbft.keystore.password <file> flag (written in step 5), NOT
        // stdin. This geth fork ignores stdin for the PBFT password (it
        // logged "create dpos account error: password wrong", ran as a
        // non-signing "common sync node", and crashed EID with code=2). So we
        // no longer feed pbftPassword to stdin.
        //
        // FIX-C12 — the EVM keystore account's --unlock password is now ALSO
        // delivered via a file (--password <file>, written in
        // _ensureEvmAccount + threaded into buildSpawnArgs at step 5), exactly
        // as node.sh does (esc_start:2143). Pre-FIX-C12 we decrypted
        // evmKeystorePasswordEncrypted and piped it to stdin here, which is
        // racy at boot (geth may have already passed the unlock prompt). With
        // --password the unlock is fully non-interactive, so there is no
        // remaining stdin step for EVM sidechains. We deliberately feed
        // NOTHING to stdin now.
        return result;
    }

    /**
     * FIX-C12 — ensure an EVM keystore account exists for this chain and
     * return the path to its (0600) password file for the miner branch's
     * --password flag. Idempotent:
     *
     *   - If a UTC--* keystore file already exists under <dataDir>/keystore/
     *     AND we have the encrypted password on file, decrypt it, (re)write
     *     the 0600 password file, ensure cfg.miner.evmKeystoreAddr is set
     *     from the existing keystore, and return — NO `account new` run.
     *   - Otherwise generate a strong random password (node.sh gen_pass
     *     parity), write it to the 0600 file, run `<binary> --datadir
     *     <dataDir> account new --password <pwFile>` (node.sh esc_init:3245),
     *     resolve the created 0x address from the new UTC--* JSON, persist
     *     BOTH the encrypted password and the 0x address back into cfg via
     *     ConfigStore, and return the password-file path.
     *
     * @param {object} cfg  cfg.chains.<id> (mutated in place: miner.evmKeystoreAddr,
     *                       miner.evmKeystorePasswordEncrypted)
     * @returns {Promise<string>} absolute path to the 0600 EVM account password file
     * @throws {Error} loudly on any failure (account new, address parse, persist)
     */
    async _ensureEvmAccount(cfg) {
        const dataDir = path.join(chainDir(this.chainId), DATA_RELPATH);
        const keystoreDir = path.join(chainDir(this.chainId), EVM_KEYSTORE_RELPATH);
        const passwordFile = path.join(chainDir(this.chainId), EVM_ACCOUNT_PASSWORD_FILENAME);

        const existingAddr = this._findExistingEvmKeystoreAddress(keystoreDir);

        // ---- Idempotent reuse path: account already on disk ----
        if (existingAddr) {
            const envelope = cfg.miner && cfg.miner.evmKeystorePasswordEncrypted;
            if (!envelope) {
                // The keystore exists but we lost the password we created it
                // with — geth can't unlock it and we can't regenerate it
                // (the file is encrypted with the original password). Fail
                // loudly with an actionable message rather than silently
                // starting a non-mining node.
                throw new Error(
                    `${this.chainId}: an EVM keystore account (${existingAddr}) already exists `
                    + `at ${keystoreDir} but its password is not on file, so geth cannot unlock `
                    + 'it for mining. Remove that keystore file to let ENM recreate the account, '
                    + 'or import the matching password.',
                );
            }
            let password;
            try {
                password = EnmCrypto.decrypt(envelope);
            } catch (err) {
                throw new Error(
                    `${this.chainId}: cannot decrypt the stored EVM account password: ${err.message}. `
                    + 'The EVM keystore cannot be unlocked for mining.',
                );
            }
            fs.writeFileSync(passwordFile, password, { mode: 0o600 });
            // Keep cfg.miner.evmKeystoreAddr authoritative from disk.
            if (!cfg.miner.evmKeystoreAddr || cfg.miner.evmKeystoreAddr !== existingAddr) {
                cfg.miner.evmKeystoreAddr = existingAddr;
                await this._persistMinerAccount(existingAddr, envelope);
            }
            return passwordFile;
        }

        // ---- Creation path: no account yet → run `account new` ----
        if (this.extensionHandle && this.extensionHandle.log) {
            this.extensionHandle.log.info(
                `${ENM_LOG_PREFIX} ${this.chainId}: no EVM keystore account found — `
                + 'creating one via `account new` (FIX-C12 miner parity).',
            );
        }
        // Strong random password (node.sh gen_pass parity — 32 chars, all
        // four complexity classes). This is the EVM account's OWN password,
        // independent of the mainchain keystore password.
        const password = EnmCrypto.generatePassword(32);
        // Ensure the data dir exists so geth can write the keystore subtree.
        fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(passwordFile, password, { mode: 0o600 });

        // node.sh esc_init:3245 — `./esc --datadir <data> account new
        // --password <file>`. We add --verbosity 0 (esc_init does too) to
        // keep the keystore-creation output quiet. execFile (no shell) so the
        // password file path is never shell-interpreted.
        try {
            await execFileAsync(
                cfg.binaryPath,
                ['--datadir', dataDir, '--verbosity', '0', 'account', 'new', '--password', passwordFile],
                { timeout: EVM_ACCOUNT_NEW_TIMEOUT_MS },
            );
        } catch (err) {
            // Best-effort: remove the password file we just wrote so a failed
            // attempt doesn't leave a dangling secret with no matching account.
            try { fs.unlinkSync(passwordFile); } catch (_) { /* ignore */ }
            throw new Error(
                `${this.chainId}: \`account new\` failed: ${err.message}. `
                + 'Could not create the EVM mining account. Check the binary and disk space.',
            );
        }

        // Resolve the freshly-created address from the keystore UTC--* JSON.
        const createdAddr = this._findExistingEvmKeystoreAddress(keystoreDir);
        if (!createdAddr) {
            try { fs.unlinkSync(passwordFile); } catch (_) { /* ignore */ }
            throw new Error(
                `${this.chainId}: \`account new\` reported success but no keystore file `
                + `appeared under ${keystoreDir}. Cannot resolve the EVM mining address.`,
            );
        }

        // Persist encrypted password + 0x address back into cfg.
        const envelope = EnmCrypto.encrypt(password);
        cfg.miner.evmKeystoreAddr = createdAddr;
        cfg.miner.evmKeystorePasswordEncrypted = envelope;
        await this._persistMinerAccount(createdAddr, envelope);

        if (this.extensionHandle && this.extensionHandle.log) {
            this.extensionHandle.log.info(
                `${ENM_LOG_PREFIX} ${this.chainId}: created EVM mining account ${createdAddr}.`,
            );
        }
        return passwordFile;
    }

    /**
     * FIX-C12 — read the first UTC--* keystore file under keystoreDir and
     * return its 0x-prefixed address. go-ethereum keystore files are JSON
     * with a lowercase, un-prefixed `address` field (e.g. "abc123...").
     *
     * @param {string} keystoreDir
     * @returns {string|null} 0x-prefixed checksum-agnostic address, or null
     *   when no parseable keystore file exists.
     */
    _findExistingEvmKeystoreAddress(keystoreDir) {
        let entries;
        try {
            entries = fs.readdirSync(keystoreDir);
        } catch (err) {
            if (err && err.code === 'ENOENT') return null;
            throw err;
        }
        // go-ethereum names keystore files "UTC--<timestamp>--<address>".
        const utc = entries.filter((f) => f.startsWith('UTC--')).sort();
        if (utc.length === 0) return null;
        const filePath = path.join(keystoreDir, utc[0]);
        let parsed;
        try {
            parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (err) {
            throw new Error(
                `${this.chainId}: failed to parse EVM keystore file ${filePath}: ${err.message}`,
            );
        }
        if (!parsed || typeof parsed.address !== 'string' || parsed.address.length === 0) {
            throw new Error(
                `${this.chainId}: EVM keystore file ${filePath} has no usable .address field.`,
            );
        }
        const addr = parsed.address.startsWith('0x') ? parsed.address : `0x${parsed.address}`;
        return addr;
    }

    /**
     * FIX-C12 — persist the resolved EVM mining account (0x address +
     * encrypted password) back into the canonical cfg.chains.<id>.miner
     * block via ConfigStore, so the next start reuses it without a fresh
     * `account new`. Reloads cfg to avoid clobbering concurrent edits.
     *
     * @param {string} addr            0x-prefixed EVM address
     * @param {string} passwordEnvelope EnmCrypto.encrypt() envelope string
     */
    async _persistMinerAccount(addr, passwordEnvelope) {
        // P0-7 (v0.5.179) — atomic RMW so persisting the generated EVM mining
        // account doesn't clobber a concurrent operator/background config save.
        let missing = false;
        await ConfigStore.update((full) => {
            if (!full || !full.chains || !full.chains[this.chainId]) {
                missing = true; // shouldn't happen at start time — skip below
                return;
            }
            const m = full.chains[this.chainId].miner || {};
            m.evmKeystoreAddr = addr;
            m.evmKeystorePasswordEncrypted = passwordEnvelope;
            full.chains[this.chainId].miner = m;
        });
        if (missing && this.extensionHandle && this.extensionHandle.log) {
            this.extensionHandle.log.warn(
                `${ENM_LOG_PREFIX} ${this.chainId}: cfg.chains.${this.chainId} missing at `
                + 'EVM-account persist time; in-memory cfg still drives this start.',
            );
        }
    }

    /**
     * health() — PID-based, mirroring node.sh's `pgrep -f '^\./esc …'` status
     * check (esc_status, node.sh:2702).
     *
     * FIX-C19 — EVM sidechains speak Ethereum JSON-RPC (EthRpcClient:
     * getBlockNumber/getPeerCount), NOT ELA Bitcoin-style RPC. The base
     * ChainAdapter.health() (and HealthChecker._pingRpc) probed getblockcount(),
     * which EthRpcClient does not implement → the probe ALWAYS threw → rpcOk
     * stayed false → after the C15 initial-start grace, F2 (rpc-unreachable)
     * restart-looped every HEALTHY EVM sidechain (the durability killer).
     * node.sh never RPC-probes these chains for its restart decision — it
     * checks the process with pgrep. So process-alive IS the liveness signal,
     * exactly as for the oracle (C13). `cfg` kept for signature parity.
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
     * v0.5.168 (Phase 1) — EVM sidechains speak Ethereum JSON-RPC, not the
     * ELA Bitcoin-style RPC the base primaryHeight() uses. Map to:
     *   height        ← eth_blockNumber  (the chain's current block)
     *   peers         ← net_peerCount
     *   synced        ← (eth_syncing === false)
     *   networkHeight ← eth_syncing.highestBlock while still catching up
     * Never throws; each call is settled independently so one RPC blip doesn't
     * blank the whole hero.
     *
     * @param {object} cfg
     * @returns {Promise<{height:number|null, peers:number|null, networkHeight:number|null, synced:boolean|null, parentBlockHeight:number|null}>}
     */
    async primaryHeight(cfg) {
        const out = {
            height: null, peers: null, networkHeight: null, synced: null, parentBlockHeight: null,
        };
        let rpc;
        try { rpc = this.rpcClient(cfg); } catch (_) { return out; }
        const [hgt, prs, syn] = await Promise.allSettled([
            rpc.getBlockNumber(),
            rpc.getPeerCount(),
            rpc.syncing(),
        ]);
        if (hgt.status === 'fulfilled' && typeof hgt.value === 'number') { out.height = hgt.value; }
        if (prs.status === 'fulfilled' && typeof prs.value === 'number') { out.peers = prs.value; }
        if (syn.status === 'fulfilled') {
            const s = syn.value;
            if (s === false) {
                // eth_syncing === false means "not actively downloading" — which
                // is EITHER fully caught up OR isolated (no peers) / not started.
                // v0.5.171: only call it synced when the chain actually HAS blocks
                // AND at least one peer to have synced from. A height-0 / 0-peer
                // chain (e.g. pg before it finds peers) must NOT report "synced"
                // — geth returns false there too, and the old code mislabeled it.
                out.synced = (typeof out.height === 'number' && out.height > 0
                    && typeof out.peers === 'number' && out.peers > 0);
            } else if (s && typeof s === 'object') {
                out.synced = false;
                if (typeof s.highestBlock === 'number') { out.networkHeight = s.highestBlock; }
                // v0.5.192 — data truth for fast-sync. During geth fast-sync the
                // committed head (eth_blockNumber) stays at 0 until the pivot
                // state commits at the very end, so reporting it as `height`
                // makes a busy, peered, downloading chain look frozen at block 0
                // (and pins syncPercent = localHeight / networkHeight at 0%). The
                // real progress is eth_syncing.currentBlock — the block/receipt
                // download front, which climbs startingBlock → highestBlock.
                // Surface that as the height while catching up so the dashboard
                // shows real movement. When fully synced the `s === false` branch
                // above keeps height = eth_blockNumber (the true head); this only
                // applies mid-sync, and only lifts the height (never lowers it).
                if (typeof s.currentBlock === 'number'
                    && (out.height == null || s.currentBlock > out.height)) {
                    out.height = s.currentBlock;
                }
            }
        }
        return out;
    }
}

module.exports = EvmSidechainAdapter;
// Exported for tests.
module.exports._internal = {
    PBFT_KEYSTORE_RELPATH,
    EVM_KEYSTORE_RELPATH,
    DATA_RELPATH,
};
