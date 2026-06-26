/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * PgAdapter — Wave M5.1 (beta.0.3.6) — PG Chain adapter.
 *
 * Class B (EVM PBFT sidechain) — extends EvmSidechainAdapter base.
 *
 * KEY DIFFERENCE FROM ESC/EID (plan §11 risk #2, §17 Class B / PG row)
 *
 * PG is CLOSED-SOURCE. ENM cannot trust-verify the binary the way it
 * can for ESC/EID (which build reproducibly from public source). The
 * mitigation is OPERATOR-SUPPLIED SHA256 MANIFEST + hard-fail on
 * mismatch:
 *
 *   1. Operator obtains the SHA256 manifest from a trusted source
 *      (Elastos foundation announcement, official PG project channel).
 *   2. Operator supplies the manifest at install time
 *      (cfg.chains.pg.binarySha256Expected).
 *   3. PgAdapter.start() pre-flight reads the binary from disk,
 *      computes SHA256, compares against expected. Hard-fail (throw)
 *      on mismatch so the chain never starts with an unverified
 *      binary.
 *
 * Without this gate, the PG install path would be a supply-chain
 * vulnerability: any tarball at the expected URL would be trusted by
 * default. Plan §11 lists this as the highest-risk Class B item.
 *
 * The rest of the adapter is identical to Esc/EidAdapter (Class B
 * spawn flags, PBFT keystore reuse from mainchain, miner address
 * validation, etc.) — handled by the EvmSidechainAdapter base.
 *
 * Canonical values (plan §14 + Elastos docs):
 *   chainId        — 'pg'
 *   chainIdValue   — 24 (EIP-155 mainnet chain id for PG; assumes the
 *                    sequence ESC=20, EID=22, PG=24)
 *   defaultRpcPort — 20676
 *
 * Ports for PG mainnet (plan §14):
 *   20670 — UDP discovery (operator-confirmed at install; M5.3 diagnostic)
 *   20672 — HTTP info (legacy)
 *   20676 — HTTP-RPC
 *   20678 — P2P TCP+UDP
 *   20679 — DPoS TCP
 */

'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');

const EvmSidechainAdapter = require('./EvmSidechainAdapter');

class PgAdapter extends EvmSidechainAdapter {
    get chainId()        { return 'pg'; }
    get displayName()    { return 'PG Chain'; }
    get binaryName()     { return 'pg'; }
    get defaultRpcPort() { return 20676; }
    get chainIdValue()   { return 24; }

    /**
     * SHA256-verify the binary against the operator-supplied expected
     * hash. Throws on mismatch (start aborts; chain never spawns).
     *
     * Reads the binary as a single buffer; PG binaries are ~50MB so
     * this is fine on any host that can actually run them.
     *
     * @param {string} binaryPath
     * @param {string} expectedSha256  64-char hex (case-insensitive)
     * @returns {Promise<string>} the computed hex digest (for logging)
     */
    static async verifyBinarySha256(binaryPath, expectedSha256) {
        if (typeof binaryPath !== 'string' || !fs.existsSync(binaryPath)) {
            throw new Error(`pg: binary not found at ${binaryPath}`);
        }
        if (typeof expectedSha256 !== 'string'
            || !/^[0-9a-fA-F]{64}$/.test(expectedSha256)) {
            throw new Error(
                'pg: binarySha256Expected must be 64-char hex; got '
                + (typeof expectedSha256 === 'string' ? `length ${expectedSha256.length}` : typeof expectedSha256),
            );
        }
        const buf = await fs.promises.readFile(binaryPath);
        const computed = crypto.createHash('sha256').update(buf).digest('hex');
        if (computed.toLowerCase() !== expectedSha256.toLowerCase()) {
            throw new Error(
                'pg: binary SHA256 mismatch.\n'
                + `  path: ${binaryPath}\n`
                + `  expected: ${expectedSha256.toLowerCase()}\n`
                + `  computed: ${computed}\n`
                + 'Refusing to start PG with an unverified binary. Either '
                + 'redownload from the trusted source OR update '
                + 'cfg.chains.pg.binarySha256Expected with the correct hash.',
            );
        }
        return computed;
    }

    /**
     * Override start. SHA256 verification is OPTIONAL (beta.0.4.1 —
     * operator directive). If cfg.binarySha256Expected is set, ENM
     * verifies before spawning; if empty, ENM trusts TLS + the smoke
     * test (same posture as ESC/EID). The static verifyBinarySha256
     * helper stays exported for any future tooling that wants to
     * verify manually.
     *
     * Original M5.1 design hard-failed without an operator-supplied
     * manifest. Reverted post-loop because (a) ESC/EID don't require
     * manifests either, (b) operators rarely have a trusted source
     * for the hash anyway, and (c) the TLS-only posture is already
     * the default for every other binary we download.
     *
     * @param {object} cfg
     * @returns {Promise<{ pid: number, startedAt: number }>}
     */
    async start(cfg) {
        const expected = cfg && cfg.binarySha256Expected;
        if (expected) {
            await PgAdapter.verifyBinarySha256(cfg.binaryPath, expected);
            if (this.extensionHandle && this.extensionHandle.log) {
                this.extensionHandle.log.info(
                    `[ENM] pg: SHA256 ${expected.toLowerCase()} verified — proceeding to spawn`,
                );
            }
        }
        return super.start(cfg);
    }
}

module.exports = PgAdapter;
