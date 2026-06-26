/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmBposService — BPoS lifecycle operations that node.sh exposes via
 * `ela_activate_bpos` / `ela_unregister_bpos` / `ela_register_bpos`.
 *
 * v0.4 ships .activate() (ela_activate_bpos): the on-chain command
 * that brings an Inactive producer back to Active. Operators hit this
 * after a producer accumulates too many missed-rounds and the chain
 * flags them inactive; without reactivation, they keep losing votes.
 *
 *     node.sh:1590  ela_activate_bpos()
 *     ela-cli wallet buildtx producer activate --nodepublickey <pk>
 *     ela-cli wallet sendtx -f ready_to_send.txn
 *
 * v0.5+ may add .unregister() (which on DPoS 2.0 means
 * `producer returndeposit` — see node.sh:1620), .vote(), .stake(),
 * .unstake(), .claim(). Those need user-supplied amounts and
 * additional UTXO lookups, so they live behind a wallet-aware UI we
 * haven't built yet.
 *
 * Why server-side. Per Architectural Invariant #2 ENM never asks the
 * operator's BROWSER wallet to sign chain ops. But the keystore.dat
 * we already manage on disk is the producer signing key — using it
 * server-side is exactly what node.sh does. The browser-wallet ban is
 * about preventing accidental WC/Particle coupling, not about banning
 * all on-chain ops.
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');

const { ENM_LOG_PREFIX } = require('./EnmConstants');
const { chainDir } = require('./DataDir');
const { decrypt } = require('./EnmEncryption');
const { buildSafeChildEnv } = require('./processUtils');

// Keep ela-cli runs short-bounded — both buildtx and sendtx are RPC
// calls, not long-running. 60s is generous for a slow VPS link.
const CLI_TIMEOUT_MS = 60_000;

class EnmBposService {
    constructor({ logger } = {}) {
        this.logger = logger || console;
    }

    /**
     * Run `ela-cli wallet buildtx producer activate` then `wallet sendtx`.
     * Returns the captured stdout/stderr from each step so the operator
     * can see exactly what the chain replied — useful when an activate
     * fails with one of node.sh's documented errors:
     *
     *     [ERROR] code 43001 — "payload content invalid"
     *     [ERROR] code 45002 — "not enough utxo"
     *
     * @param {object} opts
     * @param {string} opts.chainId      — 'mainchain' (only one BPoS chain today)
     * @param {string} opts.cliPath      — absolute path to ela-cli binary
     * @param {string} opts.publicKey    — the producer's node public key
     * @param {string} opts.password     — decrypted keystore password (caller decrypts)
     * @returns {Promise<{ok: boolean, buildOutput: string, sendOutput: string, error?: string}>}
     */
    async activate(opts) {
        if (!opts || !opts.chainId || !opts.cliPath || !opts.publicKey || !opts.password) {
            throw new Error('EnmBposService.activate: { chainId, cliPath, publicKey, password } required');
        }
        const cwd = chainDir(opts.chainId);

        // Clean up any stale tx files from a previous run — node.sh does the
        // same (build/skeleton/node.sh:1601) so each call starts fresh.
        await this._removeIfExists(path.join(cwd, 'ready_to_send.txn'));
        await this._removeIfExists(path.join(cwd, 'to_be_signed.txn'));

        // Step 1: build the activate transaction. node.sh has a feature-
        // probe pattern (line 1605) — newer ela-cli uses
        // `producer activate`, older just `activate`. We assume modern
        // ela-cli (v0.9.x+ matches our installer's catalog).
        const buildArgs = [
            'wallet', 'buildtx', 'producer', 'activate',
            '--nodepublickey', opts.publicKey,
            '-p', opts.password,
        ];
        const buildOutput = await this._run(opts.cliPath, buildArgs, { cwd });

        // Step 2: send it.
        const sendOutput = await this._run(
            opts.cliPath,
            ['wallet', 'sendtx', '-f', 'ready_to_send.txn', '-p', opts.password],
            { cwd },
        );

        // ela-cli emits errors to stderr but EXITS 0 on the [ERROR] code
        // path — so we have to scan the captured stdout for the marker.
        const failureLine = this._extractFailureLine(buildOutput + '\n' + sendOutput);
        if (failureLine) {
            return {
                ok: false,
                buildOutput,
                sendOutput,
                error: failureLine,
            };
        }

        return {
            ok: true,
            buildOutput,
            sendOutput,
        };
    }

    /** @private */
    _run(cliPath, args, opts) {
        // Phase 6: never spread process.env — buildSafeChildEnv() forwards
        // only PATH/HOME/locale so PC2 secrets (DB credentials, encryption
        // key path, OAuth tokens etc.) don't reach ela-cli. Same hardening
        // NativeProcessService applies to the ela spawn.
        const childEnv = Object.assign(buildSafeChildEnv(), { NO_COLOR: '1' });
        return new Promise((resolve, reject) => {
            execFile(cliPath, args, {
                cwd: opts && opts.cwd,
                timeout: CLI_TIMEOUT_MS,
                env: childEnv,
                maxBuffer: 4 * 1024 * 1024,
            }, (err, stdout, stderr) => {
                if (err) {
                    const combined = (stderr ? stderr.trim() : '')
                        || (stdout ? stdout.trim() : '')
                        || err.message;
                    // args.slice(0, 4) — the four leading positional args
                    // (e.g. "wallet buildtx producer activate"). The
                    // password lives at index 6/4 depending on the call,
                    // outside the slice, so this never leaks it. Same
                    // truncation node.sh uses in its own audit log.
                    return reject(new Error(
                        `ela-cli ${args.slice(0, 4).join(' ')} failed: ${combined}`,
                    ));
                }
                resolve(stdout || '');
            });
        });
    }

    /** @private — strip control chars, find the first [ERROR] line. */
    _extractFailureLine(haystack) {
        if (!haystack) return null;
        for (const raw of haystack.split(/\r?\n/)) {
            const line = raw.trim();
            if (!line) continue;
            if (line.indexOf('[ERROR]') !== -1) {
                return line;
            }
        }
        return null;
    }

    /** @private */
    async _removeIfExists(file) {
        try { await fsp.unlink(file); }
        catch (err) { if (err.code !== 'ENOENT') throw err; }
    }
}

module.exports = EnmBposService;
