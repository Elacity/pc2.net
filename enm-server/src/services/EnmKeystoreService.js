/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmKeystoreService — wraps `ela-cli wallet` for BPoS keystore management.
 *
 * Mirrors what node.sh does (build/skeleton/node.sh:1317, 1331):
 *
 *     ./ela-cli wallet create  -p "$KEYSTORE_PASS"
 *     ./ela-cli wallet account -p "$KEYSTORE_PASS"
 *
 * The password is fed via the `-p` flag rather than stdin because that's
 * what node.sh does. We immediately re-read the keystore via
 * `wallet account` to extract the public key and address; the operator
 * needs the public key to register the producer (either via Essentials
 * mobile or via an on-chain `producer register v2` tx).
 *
 * The password is encrypted at rest using EnmEncryption (AES-256-GCM)
 * and stashed in our SQLite. We also surface it as a one-time
 * downloadable file to the operator — once we hand them the password,
 * losing it means losing the producer key, so we make it explicit.
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');

const { ENM_LOG_PREFIX } = require('./EnmConstants');
const { enmDataDir, chainDir } = require('./DataDir');
const { buildSafeChildEnv } = require('./processUtils');
const EnmCrypto = require('./EnmCrypto'); // v0.5.194 — policy-guaranteed password generator

const KEYSTORE_FILENAME = 'keystore.dat';
// We pin the keystore to the chain's own dir so it sits next to the chain's
// config.json + its data tree. ElaMainChainAdapter.start() looks here for
// the file; if we wrote it elsewhere, BPoS starts always failed with
// "BPoS mode requires keystore at ...". One canonical home, no glue copy.
const DEFAULT_CHAIN = 'mainchain';

/**
 * Generate a strong random keystore password matching node.sh's policy
 * (gen_pass at line 409-447): 32 chars, base64-style, fits the
 * 16+upper+lower+digit+symbol heuristic via base64 alphabet + a forced
 * symbol prefix.
 */
function generatePassword() {
    // v0.5.194 — delegate to EnmCrypto.generatePassword, which GUARANTEES
    // node.sh's gen_pass complexity policy (≥16 + upper + lower + digit +
    // symbol, node.sh:423-434) by re-drawing until compliant. The previous
    // base64(48).slice(0,32) had no guaranteed special char (~36% of draws
    // contained none), so a generated keystore password could fail the policy
    // ela-cli enforces on `wallet create -p`. Operator-supplied passwords are
    // validated separately via EnmCrypto.validatePasswordComplexity.
    return EnmCrypto.generatePassword(32);
}

class EnmKeystoreService {
    constructor(opts = {}) {
        this.logger = opts.logger || console;
    }

    keystorePath() {
        return path.join(chainDir(DEFAULT_CHAIN), KEYSTORE_FILENAME);
    }

    async exists() {
        try {
            await fsp.access(this.keystorePath(), fs.constants.R_OK);
            return true;
        } catch (_) {
            return false;
        }
    }

    /**
     * Create a fresh keystore.dat. Idempotent only if `force` is true —
     * by default this errors if a keystore already exists, since
     * overwriting silently would lose the producer key.
     *
     * @param {object}  opts
     * @param {string}  opts.cliPath   absolute path to ela-cli
     * @param {string}  [opts.password]  if omitted, we generate one
     * @param {boolean} [opts.force]   allow overwrite of existing keystore
     * @returns {Promise<{password: string, publicKey: string, address: string, keystorePath: string}>}
     */
    async create(opts) {
        if (!opts || !opts.cliPath) {
            throw new Error('EnmKeystoreService.create: { cliPath } required');
        }

        const dir = path.dirname(this.keystorePath());
        await fsp.mkdir(dir, { recursive: true, mode: 0o700 });

        const exists = await this.exists();
        if (exists && !opts.force) {
            throw new Error(
                `Keystore already exists at ${this.keystorePath()}. Pass force=true to overwrite — losing the existing one means losing the producer key.`,
            );
        }
        if (exists && opts.force) {
            // Move the existing one aside rather than delete, so the operator
            // can still recover it if they realise mid-flow they made a mistake.
            const backup = this.keystorePath() + '.replaced-' + Date.now();
            await fsp.rename(this.keystorePath(), backup);
            this.logger.warn(`${ENM_LOG_PREFIX} keystore: existing file moved to ${backup}`);
        }

        const password = opts.password || generatePassword();

        // Defensive +x: a previous container's volume may have
        // dropped the executable bit (rare, but cheap to ensure).
        try { await fsp.chmod(opts.cliPath, 0o755); } catch (_) { /* not fatal */ }

        // ela-cli writes keystore.dat into the CWD it's invoked from.
        // Run it in the keystore dir so the file lands where we want it.
        await this._run(opts.cliPath, ['wallet', 'create', '-p', password], { cwd: dir });
        await fsp.chmod(this.keystorePath(), 0o600);

        // Read back the public key + address.
        const accountOutput = await this._run(opts.cliPath, ['wallet', 'account', '-p', password], { cwd: dir });
        const parsed = EnmKeystoreService._parseAccount(accountOutput);
        if (!parsed.publicKey) {
            throw new Error(
                `keystore created but ela-cli wallet account did not return a public key. Output:\n${accountOutput.slice(0, 400)}`,
            );
        }

        return {
            password,
            publicKey: parsed.publicKey,
            address: parsed.address,
            keystorePath: this.keystorePath(),
        };
    }

    /**
     * Read the public key + address from an existing keystore. Used when
     * the operator already has a keystore and we're just refreshing the
     * UI's view of the producer identity.
     *
     * @param {object} opts
     * @param {string} opts.cliPath
     * @param {string} opts.password
     */
    async readAccount(opts) {
        if (!opts || !opts.cliPath || !opts.password) {
            throw new Error('EnmKeystoreService.readAccount: { cliPath, password } required');
        }
        if (!(await this.exists())) {
            throw new Error('No keystore.dat found.');
        }
        const dir = path.dirname(this.keystorePath());
        const out = await this._run(opts.cliPath, ['wallet', 'account', '-p', opts.password], { cwd: dir });
        const parsed = EnmKeystoreService._parseAccount(out);
        if (!parsed.publicKey) {
            throw new Error(`ela-cli wallet account returned unexpected output:\n${out.slice(0, 400)}`);
        }
        return parsed;
    }

    /**
     * Move the operator-visible keystore.dat aside (does NOT delete) so a
     * fresh `create` call works. Used by the "regenerate keystore" path
     * in settings.
     */
    async archive() {
        if (!(await this.exists())) return null;
        const backup = this.keystorePath() + '.archived-' + Date.now();
        await fsp.rename(this.keystorePath(), backup);
        return backup;
    }

    /**
     * Run ela-cli, return stdout. Stderr is included in the error on
     * non-zero exit so the operator can see what failed.
     */
    _run(cliPath, args, opts) {
        // Phase 6: filtered env so PC2 secrets don't reach ela-cli
        // (matches the NativeProcessService spawn hardening).
        const childEnv = Object.assign(buildSafeChildEnv(), { NO_COLOR: '1' });
        return new Promise((resolve, reject) => {
            execFile(cliPath, args, {
                cwd: opts && opts.cwd,
                timeout: 30_000,
                env: childEnv,
            }, (err, stdout, stderr) => {
                if (err) {
                    return reject(new Error(
                        `ela-cli ${args.slice(0, 2).join(' ')} failed: ${stderr.trim() || err.message}`,
                    ));
                }
                resolve(stdout);
            });
        });
    }

    /**
     * Parse `ela-cli wallet account` output. The real-world format
     * (Elastos.ELA/cmd/wallet/account.go, current behaviour as of
     * v0.9.9.5) is:
     *
     *   ADDRESS                            PUBLIC KEY
     *   ---------------------------------- ----------------------------------
     *   ELPPBGPmxXFc1...                   024e0bc9d4fed...
     *   ---------------------------------- ----------------------------------
     *
     * No INDEX column, no TYPE column — earlier versions of this
     * comment said there was one, which is why our previous parser
     * required a leading numeric column and rejected real output.
     *
     * Robust strategy: scan every line for the pattern
     *     <addressy-token> <hex-pubkey>
     * where the pubkey is a 60+ char hex string. Address is whatever
     * non-whitespace token sits to its left on the same line.
     */
    static _parseAccount(output) {
        // Accept any line where an address-shaped token sits before a
        // 60+ char hex pubkey. This handles current ela-cli output
        // (ADDRESS PUBLIC_KEY columns), older output (INDEX ADDRESS
        // PUBLIC_KEY [TYPE]), and anything in between. We don't anchor
        // on $/^ because future ela-cli versions might add columns.
        const re = /\b([A-Za-z0-9]{30,})\s+([0-9a-fA-F]{60,})\b/;
        for (const line of output.split(/\r?\n/)) {
            const m = re.exec(line);
            if (m) {
                return { address: m[1], publicKey: m[2] };
            }
        }
        return { publicKey: null, address: null };
    }
}

module.exports = {
    EnmKeystoreService,
    generatePassword,
};
