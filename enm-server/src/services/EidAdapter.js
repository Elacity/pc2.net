/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EidAdapter — Wave M3.2 (beta.3.96) + Wave M3.7 (beta.4.01) —
 * Elastos Identity (DID) Chain adapter.
 *
 * Class B (EVM PBFT sidechain) — extends EvmSidechainAdapter base.
 *
 * IMPORTANT NAMING CALLOUTS (per plan §14 external-chains audit):
 *   - The binary + chainId is 'eid' (Elastos Identity).
 *   - The chain is operator-facing-labelled "Identity Chain (EID)"
 *     (plan §12 Q9 recommended "(EID)" over "(DID)" everywhere; we
 *     comply here).
 *   - The Arbiter's SideNodeList registers this chain as "DID"
 *     (not "ID") — handled by ArbiterAdapter in M6.1.
 *   - The KYC precompile at EID is 0x7D7 (= decimal 2007), NOT 0x14.
 *     plan §14 corrected the earlier audit; this address belongs to
 *     EID-specific contracts, not our adapter — noted here for future
 *     contract-interaction work (out of scope for M3.7).
 *
 * Canonical values (plan §14 + Elastos docs):
 *   chainId        — 'eid'
 *   chainIdValue   — 22 (EIP-155 mainnet chain id for EID)
 *   defaultRpcPort — 20646
 *
 * Ports for EID mainnet:
 *   20640 — UDP discovery
 *   20642 — HTTP info (legacy)
 *   20646 — HTTP-RPC (cfg.ports.rpc)
 *   20648 — P2P TCP+UDP (cfg.ports.p2p)
 *   20649 — DPoS TCP (cfg.ports.dpos)
 *
 * SPV CONFIG (M3.7 — beta.4.01)
 *
 * On testnet, EID needs an spvconfig.json file passed via --spvconfig
 * (node.sh:4356-4366). The SPV client inside EID watches the mainchain
 * (ELA) testnet for cross-chain transactions targeting the EID side.
 * Mainnet has hard-coded SPV defaults baked into the EID binary, so no
 * config file is needed; only testnet branches into here.
 *
 * The materialization is best-effort: we generate the file on every
 * start, write atomically, and add --spvconfig <abs path> to the
 * spawn args. If the operator's running mainnet, generateExtraSpawnArgs
 * returns []; the file isn't touched.
 *
 * The schema we emit matches the SPV.Configuration shape used by
 * upstream ela-spv: Magic + Foundation + ChainID + SeedList. Values
 * derived from the ELA testnet defaults (Magic 2018201, Foundation =
 * testnet foundation address). These were stable as of the M3.7
 * upstream audit (plan §14); future EID releases may bake more
 * defaults into the binary, at which point we'd drop the file.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EvmSidechainAdapter = require('./EvmSidechainAdapter');
const { chainDir, atomicWrite } = require('./DataDir');

const SPVCONFIG_FILENAME = 'spvconfig.json';

// ELA testnet defaults sourced from the canonical Elastos.ELA repo
// (params/testnet/config.go). Stable across recent ela releases; we
// snapshot here so EID can resolve cross-chain transactions against
// the testnet ELA mainchain even when the operator hasn't installed
// our own mainchain in testnet mode.
// FIX-E (v0.5.173) — node.sh writes ela TESTNET magic 2018101 (node.sh:4361),
// NOT 2018201. 2018201 is ela's RegNet magic — a spvconfig with that magic
// points EID's mainchain-watch SPV at the wrong network and never handshakes.
const ELA_TESTNET_MAGIC = 2018101;

class EidAdapter extends EvmSidechainAdapter {
    get chainId()        { return 'eid'; }
    get displayName()    { return 'Elastos Identity Chain'; }
    get binaryName()     { return 'eid'; }
    get defaultRpcPort() { return 20646; }
    get chainIdValue()   { return 22; }

    /**
     * Build the SPV config JSON the EID binary reads on testnet. Pure
     * function (no IO) so tests can verify the shape without disk
     * interaction. Mainnet returns null — no config file needed.
     *
     * @param {object} cfg  chains.eid config block
     * @returns {object|null}
     */
    generateSpvConfig(cfg) {
        if (!cfg || cfg.activeNet !== 'testnet') { return null; }
        // FIX-E (v0.5.173) — match node.sh EXACTLY: it writes only
        // {"Configuration":{"Magic":2018101}} (node.sh:4358-4364). The EID
        // binary unmarshals into PreferParams{ Config Configuration
        // `json:"Configuration"` } (spv/spv_config.go), so the top-level
        // "Configuration" WRAPPER is REQUIRED — pre-0.5.173 ENM emitted a flat
        // {Magic,Foundation,ChainID,SeedList} object that the parser dropped
        // entirely (no wrapper) and whose Foundation/ChainID/SeedList match no
        // field on the struct anyway. EID inherits DNSSeeds/Foundation from the
        // binary's built-in testnet defaults.
        return {
            Configuration: {
                Magic: ELA_TESTNET_MAGIC,
            },
        };
    }

    /**
     * Materialize the SPV config file on disk and return the absolute
     * path. No-op (returns null) on mainnet.
     *
     * @param {object} cfg
     * @returns {Promise<string|null>}
     */
    async writeSpvConfigIfNeeded(cfg) {
        const obj = this.generateSpvConfig(cfg);
        if (!obj) { return null; }
        const out = path.join(chainDir(this.chainId), SPVCONFIG_FILENAME);
        await atomicWrite(out, JSON.stringify(obj, null, 2), { mode: 0o600 });
        return out;
    }

    /**
     * Subclass hook from EvmSidechainAdapter — append --spvconfig flag
     * only on testnet. M3.7 leaves the file-write side to start()
     * override below (called BEFORE the base class spawns); here we
     * only declare the flag.
     *
     * @param {object} cfg
     * @returns {string[]}
     */
    generateExtraSpawnArgs(cfg) {
        if (!cfg || cfg.activeNet !== 'testnet') { return []; }
        const p = path.join(chainDir(this.chainId), SPVCONFIG_FILENAME);
        return ['--spvconfig', p];
    }

    /**
     * Materialize spvconfig.json on testnet BEFORE delegating to the
     * base class spawn. The file path matches what generateExtraSpawnArgs
     * declared so geth finds it when it parses --spvconfig.
     *
     * Defence-in-depth: pre-flight fail if the file isn't writable.
     * The base class catches its own pre-flight errors and rethrows
     * with the chainId prefix.
     *
     * @param {object} cfg
     * @returns {Promise<{ pid: number, startedAt: number }>}
     */
    async start(cfg) {
        if (cfg && cfg.activeNet === 'testnet') {
            try {
                await this.writeSpvConfigIfNeeded(cfg);
            } catch (err) {
                throw new Error(
                    `eid: failed to materialize spvconfig.json: ${err.message}. `
                    + 'Check chain dir write permissions.',
                );
            }
        }
        return super.start(cfg);
    }
}

module.exports = EidAdapter;
// Exported for unit tests.
module.exports._internal = {
    SPVCONFIG_FILENAME,
    ELA_TESTNET_MAGIC,
};
