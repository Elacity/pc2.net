/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * ArbiterAdapter — Wave M6.1 (beta.0.3.10) — Elastos Arbiter
 * cross-chain signer adapter (Class D per the 5-class taxonomy).
 *
 * SECURITY POSTURE
 *
 * Arbiter is THE most security-critical component in this codebase
 * (plan §11 risk #1). Its wallet signs 1-of-N multisig payloads that
 * cross all Elastos sidechains; a compromised arbiter wallet equals
 * a compromised bridge across all chains. Mitigations enforced here:
 *
 *   1. Reuses the mainchain keystore.dat producer identity (H8 + plan
 *      §10 H23 — single source of truth). FIX-C14: the arbiter binary
 *      opens `./keystore.dat` from its OWN working directory and accepts
 *      NO path flag, so start() copies chains/mainchain/keystore.dat →
 *      chains/arbiter/keystore.dat at every spawn (node.sh:5545 does the
 *      same `cp -v`). The mainchain copy under chains/mainchain/ remains
 *      the canonical source; the arbiter copy is a derived, 0600,
 *      overwrite-on-start artifact. (Pre-FIX-C14 we kept only a "stable
 *      path reference" that was never wired into a CLI flag, so the
 *      arbiter found no keystore in its CWD and aborted.)
 *   2. Wallet password is the SAME as the mainchain keystore password
 *      (mainchain.dpos.keystorePasswordEncrypted). Stdin-piped at
 *      spawn time (H24 — no plaintext file).
 *   3. Mining address is an ELA MAINCHAIN address (NOT Ethereum) —
 *      it funds the SideChainPow heartbeats. Validated via
 *      EnmCrypto.validateElaAddress at install time.
 *
 * PRE-FLIGHT CHECK
 *
 * Arbiter cannot run without ALL 4 chains (mainchain + ESC + EID + PG)
 * configured. start() pre-flight checks each via ChainRegistry +
 * cfg.chains presence; missing chains throw with a precise message.
 * This is the "6-card wizard 4/4 pre-flight" gate from plan §5
 * Layer 2 Class D wizard.
 *
 * SIDE NODE LIST (M6.6)
 *
 * The arbiter's config.json carries a SideNodeList declaring the
 * other chains it bridges. ENM auto-populates this from
 * ChainRegistry.listChains() so adding a new sidechain doesn't
 * require editing the arbiter config.
 *
 * Canonical values (plan §14):
 *   chainId        — 'arbiter'
 *   defaultRpcPort — 20536 (the audited correct port; 20606 was a
 *                    historical typo and does NOT exist)
 *   p2pPort        — 20538
 *
 * NOT IMPLEMENTED IN M6.1 (deferred to M6.2-M6.6):
 *   - 6-card install wizard endpoint (M6.2)
 *   - Wallet create OR import flow (M6.3)
 *   - Cross-chain reachability matrix (M6.4)
 *   - F23 mining-funding monitor (M6.5)
 *   - SideNodeList materialization (M6.6 — config.json generator
 *     scaffolded here but actual file write happens on first start)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net'); // v0.5.193 — TCP probe to gate arbiter start on oracle readiness

const ChainAdapter = require('./ChainAdapter');
const { EnmRpcClient } = require('./EnmRpcClient');
const { chainDir, atomicWrite } = require('./DataDir');
const ConfigStore = require('./ConfigStore');
const EnmCrypto = require('./EnmCrypto');
const { ENM_LOG_PREFIX } = require('./EnmConstants');
const EnmFirewallManager = require('./EnmFirewallManager');
const { sleep } = require('./processUtils'); // FIX-C18 — bounded start-retry delay

const ARBITER_CONFIG_FILENAME = 'config.json';
const MAINCHAIN_KEYSTORE_FILENAME = 'keystore.dat';

// FIX-C18 — node.sh starts the arbiter in a loop that respawns it every ~5s
// `until pgrep -x arbiter` succeeds (node.sh:4961-4969), because the arbiter
// exits early at cold boot if the mainchain RPC / oracles aren't reachable
// yet. We replicate that INTENT with a BOUNDED retry so it can never hang the
// install orchestrator: after each spawn we wait ARBITER_START_PROBE_MS, check
// liveness, and respawn up to ARBITER_START_MAX_ATTEMPTS times.
const ARBITER_START_MAX_ATTEMPTS = 5;
const ARBITER_START_PROBE_MS = 4000;

// The four sidechains Arbiter expects in its SideNodeList. Order
// matters for some upstream tooling; we ship the canonical mainchain
// audit order.
const SIDECHAINS_REQUIRED = ['mainchain', 'esc', 'eid', 'pg'];

// FIX-C14 — the arbiter binary aborts (code=1) on a malformed config.json.
// node.sh generates a very specific schema (build/skeleton/node.sh:5372-5538);
// we reproduce it field-for-field. The SIDE-NODE entries below are the
// EVM sidechains the arbiter bridges (esc/eid/pg — we deliberately omit
// eco, which is not in our stack). The constants here are the per-net
// values node.sh hardcodes verbatim.
//
// Each EVM sidechain's HttpJsonPort in node.sh's arbiter config is the
// sidechain's INFO RPC port (esc=20632 / eid=20642 / pg=20672 for mainnet,
// node.sh:5470-5527), which maps to our ClassBPorts `httpInfo` field — NOT
// the geth `rpc` port (20636/...). We read cc.ports.httpInfo with a
// fall-back to cc.ports.rpc.
//
// node.sh's arbiter SideNodeList Name + per-chain Support* flags + the
// genesis/sync-height constants, taken verbatim from node.sh:
//   mainnet ESC (5470-5482), EID (5484-5496), PG (5513-5526)
//   testnet ESC (5386-5400), EID (5401-5414), PG (5430-5444)
const ARBITER_SIDE_NODE_DEFS = Object.freeze({
    mainnet: Object.freeze({
        esc: Object.freeze({
            Name: 'ESC',
            SyncStartHeight: 17886000,
            GenesisBlock: '6afc2eb01956dfe192dc4cd065efdf6c3c80448776ca367a7246d279e228ff0a',
            SupportQuickRecharge: true,
            SupportInvalidDeposit: true,
            SupportInvalidWithdraw: true,
            SupportNFT: true,
            PowChain: false,
        }),
        eid: Object.freeze({
            Name: 'EID',
            SyncStartHeight: 9611000,
            GenesisBlock: '7d0702054ad68913eff9137dfa0b0b6ff701d55062359deacad14859561f5567',
            SupportQuickRecharge: true,
            SupportInvalidDeposit: true,
            SupportInvalidWithdraw: true,
            // node.sh omits SupportNFT for EID — keep parity (no key).
            PowChain: false,
        }),
        pg: Object.freeze({
            Name: 'PG',
            SyncStartHeight: 0,
            GenesisBlock: 'aab1ef4455d93b45f440a8aaed032f2c38da03a06a0843d6f9b059dbfdd2a5b5',
            SupportQuickRecharge: false,
            SupportInvalidDeposit: true,
            SupportInvalidWithdraw: true,
            SupportNFT: false,
            PowChain: false,
        }),
    }),
    testnet: Object.freeze({
        esc: Object.freeze({
            Name: 'ESC',
            SyncStartHeight: 17058000,
            GenesisBlock: '698e5ec133064dabb7c42eb4b2bdfa21e7b7c2326b0b719d5ab7f452ae8f5ee4',
            SupportQuickRecharge: true,
            SupportInvalidDeposit: true,
            SupportInvalidWithdraw: true,
            SupportNFT: true,
            PowChain: false,
        }),
        eid: Object.freeze({
            Name: 'EID',
            SyncStartHeight: 9230000,
            GenesisBlock: '3d0f9da9320556f6d58129419e041de28cf515eedc6b59f8dae49df98e3f943c',
            SupportQuickRecharge: true,
            SupportInvalidDeposit: true,
            SupportInvalidWithdraw: true,
            PowChain: false,
        }),
        pg: Object.freeze({
            Name: 'PG',
            SyncStartHeight: 0,
            GenesisBlock: 'aab1ef4455d93b45f440a8aaed032f2c38da03a06a0843d6f9b059dbfdd2a5b5',
            SupportQuickRecharge: false,
            SupportInvalidDeposit: true,
            SupportInvalidWithdraw: true,
            SupportNFT: false,
            PowChain: false,
        }),
    }),
});

// node.sh's arbiter config ExchangeRate is 1 for every sidechain (it uses
// the integer 1; the task brief says 1.0 — JSON makes them identical).
const ARBITER_EXCHANGE_RATE = 1;

// node.sh testnet MainNode carries a Magic field (node.sh:5383); mainnet
// does not. The mainchain RPC port the arbiter dials is 20336 (mainnet,
// node.sh:5463) / 21336 (testnet, node.sh:5379).
const ARBITER_TESTNET_MAINNODE_MAGIC = 2050102;
const ELA_RPC_PORT_MAINNET = 20336;
const ELA_RPC_PORT_TESTNET = 21336;

class ArbiterAdapter extends ChainAdapter {
    constructor(deps) {
        super(deps);
    }

    get chainId()        { return 'arbiter'; }
    get displayName()    { return 'Arbiter Service'; }
    get chainClass()     { return 'D'; }
    get parentChainId()  { return null; }
    get binaryName()     { return 'arbiter'; }

    /**
     * Arbiter speaks ela-style JSON-RPC for getspvheight + status.
     *
     * @param {object} cfg
     * @returns {import('./EnmRpcClient').EnmRpcClient}
     */
    rpcClient(cfg) {
        if (!cfg || !cfg.ports || !cfg.ports.rpc) {
            throw new Error('arbiter: rpcClient requires cfg.ports.rpc');
        }
        // v0.5.169/170 — the arbiter RPC DOES require HTTP Basic auth: a bare
        // request returns "client authenticate failed" even from 127.0.0.1
        // (the RpcConfiguration.WhiteIPList does not bypass auth). The
        // user/pass are generated at start() (generateRpcCredentials) and
        // written ONLY into the arbiter's own config.json
        // (Configuration.RpcConfiguration.User/Pass) — they are never persisted
        // into ENM's cfg.chains.arbiter.rpc. So when cfg.rpc carries no creds,
        // read them back from config.json. Without this, getspvheight /
        // getsidechainblockheight always 401 → the SPV Module shows "—".
        let user = (cfg.rpc && cfg.rpc.user) || '';
        let password = (cfg.rpc && cfg.rpc.password) || '';
        if (!user && !password) {
            try {
                const cfgPath = path.join(chainDir(this.chainId), ARBITER_CONFIG_FILENAME);
                const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
                const rpcConf = parsed && parsed.Configuration && parsed.Configuration.RpcConfiguration;
                if (rpcConf) {
                    user = rpcConf.User || '';
                    password = rpcConf.Pass || '';
                }
            } catch (_) { /* config not written yet (pre-first-start); fall through */ }
        }
        return new EnmRpcClient({
            host: '127.0.0.1',
            port: cfg.ports.rpc,
            user,
            password,
        });
    }

    /**
     * FIX-C14 — build the arbiter config.json in node.sh's EXACT schema
     * (build/skeleton/node.sh:5372-5538). Pre-FIX-C14 we emitted an invented
     * shape (Configuration.{ActiveNet,NodePort,HttpJsonPort,Mining,SideNodeList
     * with ChainID/Address/Port/ActiveNet}) that the arbiter binary does not
     * understand → it aborted with code=1 on every start. The correct schema:
     *
     *   Configuration: {
     *     ActiveNet?: "testnet",                 // testnet only (node.sh:5375)
     *     MainNode: {
     *       Rpc: { IpAddress, HttpJsonPort, User, Pass },
     *       Magic?: <int>                          // testnet only (node.sh:5383)
     *     },
     *     SideNodeList: [ per esc/eid/pg: {
     *       Name, Rpc: { IpAddress, HttpJsonPort },
     *       SyncStartHeight, ExchangeRate, GenesisBlock,
     *       Support*…, PowChain
     *     } ],
     *     RpcConfiguration: { User, Pass, WhiteIPList: ["127.0.0.1"] }
     *   }
     *
     * NOTE — node.sh's arbiter config has NO Mining block (no MiningAddress
     * anywhere in node.sh:5372-5538). The arbiter funds its SideChainPow
     * heartbeats from the ela keystore it opens, not a config field. So the
     * invented `Mining` block is REMOVED here to match node.sh. The internal
     * cfg.chains.arbiter.mining ELA address (the C9 fix) is retained as ENM
     * bookkeeping + start-time validation but is intentionally NOT written
     * into config.json.
     *
     * SideNodeList covers ONLY esc/eid/pg (mainchain is the MainNode, not a
     * side node; eco is not in our stack). Each side node's HttpJsonPort is
     * the sidechain's INFO RPC port (ClassBPorts.httpInfo), matching node.sh.
     *
     * @param {object} cfg          cfg.chains.arbiter
     * @param {object} allChains    cfg.chains (full map)
     * @param {object} secrets      { mainchainRpcUser, mainchainRpcPass,
     *                                arbiterRpcUser, arbiterRpcPass }
     * @returns {object}
     */
    generateConfig(cfg, allChains, secrets) {
        if (!cfg || !cfg.ports) {
            throw new Error('arbiter: generateConfig requires cfg.ports');
        }
        if (!allChains || typeof allChains !== 'object') {
            throw new Error('arbiter: generateConfig requires allChains map');
        }
        const s = secrets || {};
        const isTestnet = (cfg.activeNet || 'mainnet') === 'testnet';
        const net = isTestnet ? 'testnet' : 'mainnet';

        // ---- MainNode (the ELA mainchain) ----
        const main = allChains.mainchain;
        if (!main) {
            throw new Error(
                'arbiter: mainchain not configured — cannot generate MainNode. '
                + 'Install all 4 chains (mainchain + esc + eid + pg) first.',
            );
        }
        const mainRpcPort = (main.ports && main.ports.rpc)
            || (isTestnet ? ELA_RPC_PORT_TESTNET : ELA_RPC_PORT_MAINNET);
        const mainNode = {
            Rpc: {
                IpAddress: '127.0.0.1',
                HttpJsonPort: mainRpcPort,
                User: s.mainchainRpcUser || '',
                Pass: s.mainchainRpcPass || '',
            },
        };
        // node.sh sets a Magic field on the testnet MainNode only.
        if (isTestnet) {
            mainNode.Magic = ARBITER_TESTNET_MAINNODE_MAGIC;
        }

        // ---- SideNodeList: esc / eid / pg (NOT mainchain, NOT eco) ----
        const sideDefs = ARBITER_SIDE_NODE_DEFS[net];
        const sideNodeList = [];
        for (const chainId of ['esc', 'eid', 'pg']) {
            const cc = allChains[chainId];
            if (!cc || !cc.ports) {
                throw new Error(
                    `arbiter: sidechain "${chainId}" not configured — cannot generate `
                    + 'SideNodeList. Install all 4 chains (mainchain + esc + eid + pg) first.',
                );
            }
            const def = sideDefs[chainId];
            // node.sh's arbiter config dials the sidechain's INFO RPC port
            // (httpInfo). Fall back to the geth rpc port only if httpInfo is
            // somehow absent from cfg (older installs).
            const httpJsonPort = cc.ports.httpInfo || cc.ports.rpc;
            const entry = {
                Name: def.Name,
                Rpc: {
                    IpAddress: '127.0.0.1',
                    HttpJsonPort: httpJsonPort,
                },
                SyncStartHeight: def.SyncStartHeight,
                ExchangeRate: ARBITER_EXCHANGE_RATE,
                GenesisBlock: def.GenesisBlock,
                SupportQuickRecharge: def.SupportQuickRecharge,
                SupportInvalidDeposit: def.SupportInvalidDeposit,
                SupportInvalidWithdraw: def.SupportInvalidWithdraw,
                PowChain: def.PowChain,
            };
            // node.sh includes SupportNFT for ESC + PG but omits it for EID;
            // mirror that exactly (only set the key when the def has it).
            if (Object.prototype.hasOwnProperty.call(def, 'SupportNFT')) {
                entry.SupportNFT = def.SupportNFT;
            }
            sideNodeList.push(entry);
        }

        // ---- top-level Configuration ----
        const configuration = {};
        // node.sh emits ActiveNet only for testnet (mainnet omits it).
        if (isTestnet) {
            configuration.ActiveNet = 'testnet';
        }
        configuration.MainNode = mainNode;
        configuration.SideNodeList = sideNodeList;
        configuration.RpcConfiguration = {
            User: s.arbiterRpcUser || '',
            Pass: s.arbiterRpcPass || '',
            WhiteIPList: ['127.0.0.1'],
        };
        return { Configuration: configuration };
    }

    /**
     * Resolve the absolute path to the mainchain keystore. Arbiter
     * reuses the mainchain producer keystore for multisig signing —
     * a stable absolute path is the cleanest reference (no copy, no
     * symlink to maintain).
     *
     * @returns {string}
     */
    resolveMainchainKeystorePath() {
        const p = path.join(chainDir('mainchain'), MAINCHAIN_KEYSTORE_FILENAME);
        if (!fs.existsSync(p)) {
            throw new Error(
                `arbiter: mainchain keystore.dat not found at ${p}. `
                + 'The Arbiter signs with the mainchain producer keystore; complete '
                + 'mainchain BPoS setup before installing Arbiter.',
            );
        }
        return p;
    }

    /**
     * Decrypt the mainchain keystore password — same envelope as
     * Class B (Arbiter signs WITH this same password).
     *
     * @returns {Promise<string>}
     */
    async readMainchainKeystorePassword() {
        const cfg = await ConfigStore.load();
        const main = cfg && cfg.chains && cfg.chains.mainchain;
        if (!main || !main.dpos || !main.dpos.keystorePasswordEncrypted) {
            throw new Error(
                'arbiter: mainchain keystore password not on file. '
                + 'Configure mainchain BPoS first.',
            );
        }
        try {
            return EnmCrypto.decrypt(main.dpos.keystorePasswordEncrypted);
        } catch (err) {
            throw new Error(
                `arbiter: cannot decrypt mainchain keystore password: ${err.message}. `
                + 'Re-enter via Settings → Identity.',
            );
        }
    }

    /**
     * Pre-flight check that all 4 required chains are configured.
     * Throws on the first missing chain.
     *
     * @param {object} allChains  cfg.chains map
     */
    static preflightAllChainsConfigured(allChains) {
        if (!allChains || typeof allChains !== 'object') {
            throw new Error('arbiter: cfg.chains map missing');
        }
        const missing = SIDECHAINS_REQUIRED.filter((id) => !allChains[id]);
        if (missing.length > 0) {
            throw new Error(
                `arbiter: cannot start — missing chains [${missing.join(', ')}]. `
                + 'Install all 4 chains (mainchain + esc + eid + pg) before starting Arbiter.',
            );
        }
    }

    /**
     * start() lifecycle:
     *   1. Verify binary present.
     *   2. Pre-flight: all 4 sidechains configured.
     *   3. Resolve mainchain keystore path.
     *   4. Validate mining address.
     *   5. Generate config.json.
     *   6. UFW open p2p + rpc ports.
     *   7. Decrypt mainchain keystore password.
     *   8. Spawn arbiter binary.
     *   9. Stdin-pipe the keystore password (Arbiter prompts on first
     *      block sign — pre-pipe so it never blocks).
     *
     * @param {object} cfg
     * @returns {Promise<{ pid: number, startedAt: number }>}
     */
    async start(cfg) {
        if (!cfg || typeof cfg !== 'object') {
            throw new TypeError('arbiter.start: cfg object required');
        }
        if (typeof cfg.binaryPath !== 'string' || !fs.existsSync(cfg.binaryPath)) {
            throw new Error(
                `arbiter: binary not found at ${cfg.binaryPath}. Run setup binary install.`,
            );
        }
        const fullCfg = await ConfigStore.load();
        const allChainsCfg = (fullCfg && fullCfg.chains) || {};
        ArbiterAdapter.preflightAllChainsConfigured(allChainsCfg);
        const mainchainKeystorePath = this.resolveMainchainKeystorePath();

        // Validate mining address (ELA mainchain, NOT Ethereum). FIX-C14:
        // node.sh's arbiter config has NO mining field, so this value is no
        // longer written into config.json. We KEEP the validation as ENM
        // bookkeeping (C9) — a bad ELA address here signals a misconfigured
        // install — but only when one is present; it's not required for the
        // arbiter to start.
        if (cfg.mining && cfg.mining.miningAddress) {
            const v = EnmCrypto.validateElaAddress(cfg.mining.miningAddress);
            if (!v.valid) {
                throw new Error(`arbiter: mining.miningAddress: ${v.warning}`);
            }
        }

        // FIX-C14 — gather the secrets node.sh injects into the arbiter
        // config.json (node.sh:5554-5568): the ELA mainchain RPC user/pass
        // (so the arbiter can call the mainchain RPC) and a freshly-generated
        // random user/pass for the arbiter's own RPC interface.
        let mainchainRpcUser = '';
        let mainchainRpcPass = '';
        const mainRpc = allChainsCfg.mainchain && allChainsCfg.mainchain.rpc;
        if (mainRpc) {
            mainchainRpcUser = mainRpc.user || '';
            if (mainRpc.passwordEncrypted) {
                try {
                    mainchainRpcPass = EnmCrypto.decrypt(mainRpc.passwordEncrypted);
                } catch (err) {
                    throw new Error(
                        `arbiter: cannot decrypt mainchain RPC password: ${err.message}. `
                        + 'Re-enter it in Settings → Mainchain Advanced.',
                    );
                }
            }
        }
        const arbRpc = EnmCrypto.generateRpcCredentials();

        // Generate + write config.json (node.sh schema).
        const cfgObj = this.generateConfig(cfg, allChainsCfg, {
            mainchainRpcUser,
            mainchainRpcPass,
            arbiterRpcUser: arbRpc.user,
            arbiterRpcPass: arbRpc.password,
        });
        const dir = chainDir(this.chainId);
        await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
        const configFile = path.join(dir, ARBITER_CONFIG_FILENAME);
        await atomicWrite(configFile, JSON.stringify(cfgObj, null, 2), { mode: 0o600 });

        // FIX-C14 — copy the mainchain keystore.dat into the arbiter dir
        // (node.sh:5545 `cp -v ela/keystore.dat arbiter/`). The arbiter opens
        // `./keystore.dat` from its CWD (chainDir('arbiter')) — it does NOT
        // accept a path flag — so a reference/symlink is not enough; an actual
        // copy must be present. Pre-FIX-C14 we relied on a "stable path
        // reference" that was never wired into a CLI flag, so the arbiter
        // found no keystore in its CWD. Overwrite each start so a rotated
        // mainchain keystore propagates.
        const arbiterKeystorePath = path.join(dir, MAINCHAIN_KEYSTORE_FILENAME);
        await fs.promises.copyFile(mainchainKeystorePath, arbiterKeystorePath);
        try { await fs.promises.chmod(arbiterKeystorePath, 0o600); }
        catch (_) { /* best-effort — copyFile already preserves perms on most FS */ }
        // cfg.spawnArgs is intentionally not set — arbiter reads config.json +
        // keystore.dat from its working directory at start time.

        // UFW open p2p + rpc (rpc is loopback-only too, but the operator
        // may forward through nginx if they want external admin access).
        try {
            await EnmFirewallManager.ensureAllowed(
                [cfg.ports.p2p],
                {
                    comment: 'arbiter P2P (ENM auto)',
                    logger: this.extensionHandle && this.extensionHandle.log,
                },
            );
        } catch (err) {
            if (this.extensionHandle && this.extensionHandle.log) {
                this.extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} arbiter firewall preflight failed: ${err.message}`,
                );
            }
        }

        // FIX-A (v0.5.173) — WAIT for the mainchain RPC to actually answer
        // before spawning. The arbiter dials ela's RPC (20336) at startup and
        // aborts with code=1 ("Get active dpos peers error ... connection
        // refused") if it isn't up yet. node.sh absorbs this by respawning the
        // arbiter in an UNBOUNDED `until pgrep -x arbiter; sleep 5` loop
        // (node.sh:4961-4969) until ela + the oracles are reachable. ENM
        // previously started the arbiter as soon as ela's PROCESS existed (not
        // its RPC) and capped respawns at ~20s, so cold boots → code=1 crash
        // loop → F1 budget exhausted → OWNER-CONFIRMS quarantine. Polling ela's
        // RPC here (bounded to a generous deadline so it can't hang forever)
        // means we spawn only when the arbiter will actually succeed.
        await this._waitForMainchainRpc(allChainsCfg, mainchainRpcUser, mainchainRpcPass);

        // v0.5.193 — ALSO wait for the oracle ports the arbiter dials. node.sh
        // gates the arbiter on the oracles in TWO ways: arbiter_init refuses
        // unless every oracle's .init exists (node.sh:5325-5349), and
        // arbiter_start respawns `until pgrep -x arbiter` (node.sh:4961-4969)
        // because the arbiter aborts at boot if any SideNodeList endpoint is
        // unreachable. ENM previously waited ONLY for the mainchain RPC, so on a
        // cold Council boot the arbiter spawned microseconds after the oracles
        // and could exhaust its bounded retry before their Express ports bound
        // (the `arbiter exited code=255` churn). The SideNodeList dials each
        // sidechain's httpInfo (oracle) port — 20632/20642/20672 — so we poll
        // exactly those before spawning. Bounded; on timeout we proceed and let
        // the spawn-retry + self-heal cover it (never hang the orchestrator).
        await this._waitForOracles(allChainsCfg);

        // Decrypt the mainchain keystore password BEFORE spawn so we can feed
        // it the instant the child exists (minimizing the prompt race below).
        const pbftPassword = await this.readMainchainKeystorePassword();

        // FIX-C18 — bounded start-retry. node.sh respawns the arbiter every
        // ~5s `until pgrep -x arbiter` succeeds (node.sh:4961-4969), because
        // the arbiter exits early at cold boot if the mainchain RPC / oracles
        // aren't reachable yet. We reproduce that intent but CAP the attempts
        // so a permanently-failing arbiter can never hang the install
        // orchestrator. Each attempt: spawn → feed password → wait → check
        // liveness. The keystore copy + config write above are idempotent and
        // already done once; re-spawning via processService.start() cleans up
        // any stale PID file from the prior early exit before respawning.
        const log = this.extensionHandle && this.extensionHandle.log;
        let result = null;
        for (let attempt = 1; attempt <= ARBITER_START_MAX_ATTEMPTS; attempt += 1) {
            // Spawn (idempotent — returns alreadyRunning if a live arbiter
            // is already attached).
            // eslint-disable-next-line no-await-in-loop
            result = await this.processService.start(this.chainId, cfg);
            if (result.alreadyRunning) {
                return result;
            }

            // FIX-C14 — feed the mainchain keystore password to the arbiter's
            // stdin. node.sh launches the arbiter as `cat ela.txt | nohup
            // ./arbiter` (node.sh:4963), i.e. the password is on stdin AT
            // spawn. Our NativeProcessService primitive has no at-spawn stdin
            // hook — it only exposes writeStdin() POST-spawn (which writes
            // then closes the stream). We therefore write immediately after
            // start() resolves; in practice this lands within microseconds of
            // spawn while the arbiter is still initializing, before it reaches
            // the keystore-unlock prompt. This mirrors how ElaMainChainAdapter
            // feeds the same password. The residual race (child prompts before
            // our write arrives) is theoretical at these timescales but noted
            // here; a true at-spawn stdin primitive would be the fully
            // race-free fix. We re-pipe on every retry because each respawn is
            // a fresh child with its own stdin.
            //
            // Unlike pre-FIX-C14 (which swallowed a failed pipe as a
            // debug-level non-event), a failed write means the arbiter will
            // hang on the unlock prompt and never sign — so we treat it as
            // fatal: stop the half-started process and throw so the operator
            // sees the problem.
            const wrote = this.processService.writeStdin(this.chainId, pbftPassword);
            if (!wrote) {
                // eslint-disable-next-line no-await-in-loop
                try { await this.processService.stop(this.chainId); }
                catch (_) { /* best-effort cleanup */ }
                throw new Error(
                    'arbiter: failed to feed the keystore password to the process at startup. '
                    + 'The arbiter cannot unlock its wallet to sign cross-chain payloads.',
                );
            }

            // Give the arbiter a moment to either settle or exit early (it
            // aborts fast when the mainchain RPC / oracles aren't up yet),
            // then probe liveness — node.sh's `pgrep -x arbiter` equivalent.
            // eslint-disable-next-line no-await-in-loop
            await sleep(ARBITER_START_PROBE_MS);
            const procStatus = this.processService.statusSync(this.chainId);
            if (procStatus.alive) {
                if (attempt > 1 && log) {
                    log.info(
                        `${ENM_LOG_PREFIX} arbiter: came up on start attempt ${attempt}/${ARBITER_START_MAX_ATTEMPTS} (pid ${procStatus.pid})`,
                    );
                }
                return result;
            }

            // Dead — the arbiter exited early. Log and (if attempts remain)
            // loop to respawn.
            if (log) {
                log.warn(
                    `${ENM_LOG_PREFIX} arbiter: process exited within ${ARBITER_START_PROBE_MS}ms on start attempt ${attempt}/${ARBITER_START_MAX_ATTEMPTS}`
                    + ' (mainchain RPC / oracles may not be reachable yet) —'
                    + (attempt < ARBITER_START_MAX_ATTEMPTS ? ' respawning.' : ' giving up; self-heal will retry.'),
                );
            }
        }

        // Exhausted attempts and the arbiter is still not alive. Do NOT throw —
        // node.sh would keep looping; we instead hand off to self-heal (F-rules
        // restart the arbiter once the mainchain/oracles come up) rather than
        // crash the whole install orchestrator. Return the last spawn result so
        // the caller still has the PID metadata.
        return result;
    }

    /**
     * FIX-A (v0.5.173) — poll the mainchain (ela) RPC until it answers, BEFORE
     * spawning the arbiter. The arbiter dials ela:20336 at startup and aborts
     * with code=1 ("Get active dpos peers error ... connection refused") if ela
     * isn't up yet. node.sh tolerates this via an UNBOUNDED respawn loop
     * (node.sh:4961-4969 `until pgrep -x arbiter; sleep 5`). We instead wait for
     * ela's RPC to actually answer (bounded to a generous deadline so it can
     * never hang the orchestrator), then spawn once — so the arbiter succeeds on
     * the first try instead of crash-looping into the F1 budget → quarantine.
     * Returns true if RPC became reachable, false on timeout (caller proceeds;
     * the bounded spawn-retry + self-heal still cover that case).
     *
     * @param {object} allChainsCfg  cfg.chains
     * @param {string} user          mainchain RPC user (may be '')
     * @param {string} password      mainchain RPC password (may be '')
     * @param {object} [opts]        { timeoutMs=300000, intervalMs=5000 }
     * @returns {Promise<boolean>}
     */
    async _waitForMainchainRpc(allChainsCfg, user, password, opts) {
        const log = this.extensionHandle && this.extensionHandle.log;
        const main = allChainsCfg && allChainsCfg.mainchain;
        const isTestnet = !!(main && main.activeNet === 'testnet');
        const port = (main && main.ports && main.ports.rpc)
            || (isTestnet ? ELA_RPC_PORT_TESTNET : ELA_RPC_PORT_MAINNET);
        const timeoutMs = (opts && opts.timeoutMs) || 300000;   // 5 min (node.sh waits indefinitely)
        const intervalMs = (opts && opts.intervalMs) || 5000;   // node.sh sleeps 5s between respawns
        const client = new EnmRpcClient({
            host: '127.0.0.1', port, user: user || '', password: password || '',
        });
        const deadline = Date.now() + timeoutMs;
        let logged = false;
        while (Date.now() < deadline) {
            try {
                const v = await client.getblockcount();
                if (typeof v === 'number' || (v && typeof v.result === 'number')) {
                    if (logged && log) {
                        log.info(`${ENM_LOG_PREFIX} arbiter: mainchain RPC reachable (127.0.0.1:${port}) — proceeding to start`);
                    }
                    return true;
                }
            } catch (_) { /* ela RPC not up yet */ }
            if (!logged && log) {
                log.info(`${ENM_LOG_PREFIX} arbiter: waiting for mainchain RPC (127.0.0.1:${port}) before start — the arbiter dials ela at startup and would abort otherwise`);
                logged = true;
            }
            // eslint-disable-next-line no-await-in-loop
            await sleep(intervalMs);
        }
        if (log) {
            log.warn(`${ENM_LOG_PREFIX} arbiter: mainchain RPC still unreachable after ${timeoutMs}ms — attempting start anyway (bounded spawn-retry + self-heal will cover it)`);
        }
        return false;
    }

    /**
     * v0.5.193 — poll the oracle ports the arbiter dials (the SideNodeList
     * httpInfo ports: esc-oracle 20632 / eid-oracle 20642 / pg-oracle 20672)
     * until each accepts a TCP connection, BEFORE spawning the arbiter. node.sh
     * gates the arbiter on the oracles being up — arbiter_init refuses unless
     * each oracle's .init exists (node.sh:5325-5349) and arbiter_start respawns
     * `until pgrep -x arbiter` (node.sh:4961-4969) because the arbiter aborts at
     * boot if any SideNodeList endpoint is unreachable. Without this gate a cold
     * Council boot races the oracle Express servers and the arbiter exits
     * (code=255) before they bind. We poll exactly the ports the SideNodeList
     * dials. Bounded so it can never hang the orchestrator; on timeout we
     * proceed and let the bounded spawn-retry + self-heal cover the residual.
     *
     * @param {object} allChainsCfg  cfg.chains
     * @param {object} [opts]        { timeoutMs=120000, intervalMs=5000, connectMs=2000 }
     * @returns {Promise<boolean>}
     */
    async _waitForOracles(allChainsCfg, opts) {
        const log = this.extensionHandle && this.extensionHandle.log;
        // Mirror the SideNodeList port computation exactly (httpInfo, falling
        // back to the geth rpc port for older installs) so we wait on precisely
        // what the arbiter will dial.
        const targets = [];
        for (const id of ['esc', 'eid', 'pg']) {
            const cc = allChainsCfg && allChainsCfg[id];
            const port = cc && cc.ports && (cc.ports.httpInfo || cc.ports.rpc);
            if (port) { targets.push({ id: `${id}-oracle`, port }); }
        }
        if (targets.length === 0) { return true; }

        const timeoutMs = (opts && opts.timeoutMs) || 120000;
        const intervalMs = (opts && opts.intervalMs) || 5000;
        const connectMs = (opts && opts.connectMs) || 2000;

        const probe = (port) => new Promise((resolve) => {
            const sock = net.connect({ host: '127.0.0.1', port });
            let settled = false;
            const finish = (ok) => {
                if (settled) { return; }
                settled = true;
                try { sock.destroy(); } catch (_) { /* ignore */ }
                resolve(ok);
            };
            sock.setTimeout(connectMs);
            sock.once('connect', () => finish(true));
            sock.once('timeout', () => finish(false));
            sock.once('error', () => finish(false));
        });

        const deadline = Date.now() + timeoutMs;
        let logged = false;
        while (Date.now() < deadline) {
            // eslint-disable-next-line no-await-in-loop
            const results = await Promise.all(targets.map((t) => probe(t.port)));
            const down = targets.filter((_, i) => !results[i]);
            if (down.length === 0) {
                if (logged && log) {
                    log.info(`${ENM_LOG_PREFIX} arbiter: all oracle ports reachable (${targets.map((t) => t.port).join(', ')}) — proceeding to start`);
                }
                return true;
            }
            if (!logged && log) {
                log.info(`${ENM_LOG_PREFIX} arbiter: waiting for oracle port(s) [${down.map((t) => `${t.id}:${t.port}`).join(', ')}] before start — the arbiter dials each oracle and aborts if any is unreachable (node.sh:4961-4969)`);
                logged = true;
            }
            // eslint-disable-next-line no-await-in-loop
            await sleep(intervalMs);
        }
        if (log) {
            log.warn(`${ENM_LOG_PREFIX} arbiter: some oracle ports still unreachable after ${timeoutMs}ms — attempting start anyway (bounded spawn-retry + self-heal will cover it)`);
        }
        return false;
    }

    /**
     * health() — PID-based, mirroring node.sh's `pgrep -x arbiter`
     * (arbiter_status, node.sh:5046).
     *
     * FIX-C19/C20 — the arbiter binary serves getspvheight (node.sh:5060 only
     * ever calls getspvheight on it), NOT the ELA getblockcount that the base
     * ChainAdapter.health() / HealthChecker._pingRpc probed → that probe threw
     * (or hit a method the arbiter doesn't expose) → rpcOk stayed false → F2
     * restart-looped a healthy arbiter after the grace. node.sh checks arbiter
     * liveness via pgrep, so process-alive is the signal. `cfg` kept for
     * signature parity.
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
     * v0.5.168 (Phase 1) — the arbiter's hero metric is its SPV height
     * (getspvheight, node.sh:5060). It does NOT serve getblockcount or a
     * connection count, so the base primaryHeight() would return all-null.
     * peers/networkHeight/synced stay null — the arbiter has no sync concept
     * to surface; the dashboard derives its coarse state from process-alive
     * (PID-based, matching node.sh's `pgrep -x arbiter`). The richer
     * per-sidechain getsidechainblockheight values power the SPV Module
     * (Phase 2 GET /spv), not this single hero number. Never throws.
     *
     * @param {object} cfg
     * @returns {Promise<{height:number|null, peers:number|null, networkHeight:number|null, synced:boolean|null, parentBlockHeight:number|null}>}
     */
    async primaryHeight(cfg) {
        const out = {
            height: null, peers: null, networkHeight: null, synced: null, parentBlockHeight: null,
        };
        try {
            const rpc = this.rpcClient(cfg);
            const v = await rpc.getspvheight();
            out.height = (typeof v === 'number') ? v
                : (v && typeof v.result === 'number') ? v.result : null;
        } catch (_) { /* arbiter RPC not ready; height stays null */ }
        return out;
    }
}

module.exports = ArbiterAdapter;
// Exported for tests.
module.exports._internal = {
    SIDECHAINS_REQUIRED,
    ARBITER_CONFIG_FILENAME,
    MAINCHAIN_KEYSTORE_FILENAME,
    // v0.5.168 (Phase 2) — exported so routes/spv.js can read each sidechain's
    // genesis block hash (the key getsidechainblockheight expects) without
    // duplicating the table. Single source of truth.
    ARBITER_SIDE_NODE_DEFS,
};
