/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * ElaMainChainAdapter — concrete adapter for ELA mainchain.
 *
 * Owns the chain-specific knowledge:
 *   - The shape of `config.json` consumed by the ela binary
 *   - The default port + magic + DPoS arbiter list (read from constants;
 *     audit-verified per common/config/config.go in Rev 1+4)
 *   - How to construct an EnmRpcClient with the right port + Basic auth
 *   - The "start" flow: write generated config.json + write keystore-password
 *     file (mode 0600) → process spawn → pipe password to stdin
 *
 * v0.1 supports mainnet only. testnet/regnet are wired through `activeNet`
 * but not surfaced in setup wizard — operator can flip in Settings → Advanced
 * if they know what they're doing.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ChainAdapter = require('./ChainAdapter');
const { EnmRpcClient } = require('./EnmRpcClient');
const { ENM_LOG_PREFIX, MAINNET_DNS_SEEDS } = require('./EnmConstants');
const { chainDir, atomicWrite } = require('./DataDir');
const { getRpcPassword } = require('./ConfigStore');
const { decrypt } = require('./EnmEncryption');
const ChainState = require('./ChainState');
const ExtIpResolver = require('./ExtIpResolver');
const EnmFirewallManager = require('./EnmFirewallManager');

const KEYSTORE_FILENAME = 'keystore.dat';
const KEYSTORE_PASSWORD_FILE = 'keystore-password.txt';
const CHAIN_CONFIG_FILENAME = 'config.json';

// P1 (v0.5.183) — grace delay before feeding the keystore password to ela's
// stdin. Lets the freshly-spawned child reach its stdin prompt-read state so
// the immediate end()-of-pipe inside writeStdin() can't deliver EOF before
// the prompt has been read (which would truncate it and hang BPoS unlock).
// Small enough to be invisible to the operator, large enough to clear the
// spawn → first-read window on a loaded host.
const STDIN_FEED_GRACE_MS = 1500;

/** Promise-based sleep used for the stdin-feed grace delay. */
function _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class ElaMainChainAdapter extends ChainAdapter {
    constructor(deps) {
        super(deps);
    }

    get chainId() { return 'mainchain'; }
    get displayName() { return 'ELA Mainchain'; }

    /**
     * Build the JSON config that ela reads from `./config.json` at startup.
     * Schema and defaults verified in Rev 4 audit (agent 4) — minimal viable
     * BPoS config, all hardcoded mainnet defaults inherited from ela's
     * common/config/config.go via ActiveNet="mainnet".
     *
     * @param {object} cfg     extension's chains.mainchain config
     * @param {object} secrets { rpcPassword: string, ipAddress: string|null }
     * @returns {object}
     */
    generateConfig(cfg, secrets) {
        if (!cfg || !cfg.ports || !cfg.rpc || !cfg.dpos) {
            throw new Error('ElaMainChainAdapter.generateConfig: cfg.ports/rpc/dpos required');
        }
        if (!secrets || typeof secrets.rpcPassword !== 'string') {
            throw new Error('ElaMainChainAdapter.generateConfig: secrets.rpcPassword required');
        }

        return {
            Configuration: {
                ActiveNet: cfg.activeNet || 'mainnet',
                NodePort: cfg.ports.nodePort,
                // v0.5.248 (validator-readiness audit P1-3) — the Info/REST/WS
                // servers are kept OFF, matching node.sh (which omits these
                // *Start flags entirely → ela defaults them false). They bind
                // 0.0.0.0 with NO auth (the REST server exposes `restart` +
                // `sendrawtransaction`), and ENM never calls them — its health
                // poll uses only the authed JSON-RPC port. Leaving them on was
                // gratuitous attack surface on a firewall-less host. Ports kept
                // (inert while *Start=false) so a future opt-in needs only the flag.
                HttpInfoPort: cfg.ports.httpInfo,
                HttpInfoStart: false,
                HttpRestPort: cfg.ports.httpRest,
                HttpRestStart: false,
                HttpWsPort: cfg.ports.httpWs,
                HttpWsStart: false,
                HttpJsonPort: cfg.ports.rpc,
                EnableRPC: true,
                PrintLevel: this._mapLogLevel(cfg.logLevel),
                EnableUtxoDB: true,
                // SECURITY (Rev 1 audit): default RPC bind is 0.0.0.0 in ela.
                // Our generated config restricts to 127.0.0.1 via WhiteIPList.
                // alpha.19: when cfg.rpc.enabled is false (default), we hard-
                // force WhiteIPList=['127.0.0.1'] regardless of what the
                // operator saved — RPC must be explicitly opened. The saved
                // whiteIPList is preserved in ENM's own config across toggles
                // so the operator doesn't lose their allow-list.
                RpcConfiguration: {
                    User: cfg.rpc.user,
                    Pass: secrets.rpcPassword,
                    WhiteIPList: cfg.rpc.enabled === true
                        ? (Array.isArray(cfg.rpc.whiteIPList) && cfg.rpc.whiteIPList.length > 0
                            ? cfg.rpc.whiteIPList
                            : ['127.0.0.1'])
                        : ['127.0.0.1'],
                },
                DPoSConfiguration: {
                    EnableArbiter: cfg.dpos.enableArbiter === true,
                    IPAddress: secrets.ipAddress || '',
                    DPoSPort: cfg.ports.dpos,
                },
                // DNSSeeds intentionally omitted — ela falls back to its built-in
                // mainnet seeds (verified Rev 4, common/config/config.go:128-133).
                // Operator can add PermanentPeers via Advanced if seeds go stale (F16).
                PermanentPeers: [],
            },
        };
    }

    rpcClient(cfg) {
        if (!cfg || !cfg.ports || !cfg.rpc) {
            throw new Error('ElaMainChainAdapter.rpcClient: cfg.ports/rpc required');
        }
        return new EnmRpcClient({
            host: '127.0.0.1',
            port: cfg.ports.rpc,
            user: cfg.rpc.user,
            password: getRpcPassword(cfg),
        });
    }

    /**
     * Override start() to handle ela-specific setup:
     *   1. Resolve external IP (auto or manual)
     *   2. Decrypt RPC password
     *   3. Generate config.json
     *   4. Verify keystore.dat exists
     *   5. Delegate to NativeProcessService
     *   6. Pipe keystore password to child stdin
     *
     * @param {object} cfg
     * @returns {Promise<{ pid: number, startedAt: number }>}
     */
    async start(cfg) {
        // 0. Pre-flight: verify what's actually on disk before we spend
        // time on config + spawn. Per Architectural Invariant #1, ChainState
        // is the source of truth — not the cfg blob, not the in-memory
        // downloader status. If the binary or keystore aren't where they
        // should be, fail loudly with an actionable message.
        const snap = ChainState.snapshot(this.chainId);
        if (!snap.installed) {
            throw new Error(
                `${this.chainId}: binary not installed. Run the install step in the setup wizard, `
                + `or POST /api/enm/setup/install/${this.chainId} to download it.`,
            );
        }
        if (cfg.dpos && cfg.dpos.enableArbiter && !snap.keystorePresent) {
            throw new Error(
                `${this.chainId}: BPoS mode enabled but keystore.dat not found. `
                + `Run the keystore step in the setup wizard, or switch to full-node mode.`,
            );
        }
        // The downloaded binary path may differ from any stale cfg.binaryPath
        // (e.g., after a binary upgrade). Always trust ChainState.
        cfg.binaryPath = snap.binaryPath;
        if (snap.binaryVersion) cfg.binaryVersion = snap.binaryVersion;

        // 1. External IP — use override if set, else resolve.
        let ipAddress = cfg.dpos.ipAddressManual;
        if (!ipAddress && cfg.dpos.ipAddressMode === 'auto') {
            const ext = await ExtIpResolver.resolve();
            ipAddress = ext.ok ? ext.ip : null; // null is fine — ela will run, just won't advertise IP
        }

        // 2. Decrypt RPC password (lives only in memory until ela reads config.json).
        let rpcPassword;
        try {
            rpcPassword = getRpcPassword(cfg);
        } catch (err) {
            throw new Error(`Cannot decrypt RPC password: ${err.message}. Re-enter it in Settings.`);
        }

        // 3. Generate the chain's own config.json.
        const cfgObj = this.generateConfig(cfg, { rpcPassword, ipAddress });
        const dir = chainDir(this.chainId);
        const configFile = path.join(dir, CHAIN_CONFIG_FILENAME);
        await atomicWrite(configFile, JSON.stringify(cfgObj, null, 2), { mode: 0o600 });

        // 4. Sanity check that keystore is present (operator imports it during setup
        // step 5 — we never generate, per Rev 6 RNG-bug finding).
        const keystoreFile = path.join(dir, KEYSTORE_FILENAME);
        if (cfg.dpos.enableArbiter && !fs.existsSync(keystoreFile)) {
            throw new Error(
                `BPoS mode requires keystore at ${keystoreFile}. Import it via the setup wizard.`,
            );
        }

        // 4.5. beta.3.30 — auto-open host firewall (UFW) for the chain's
        // P2P inbound ports. No-op when UFW isn't installed or isn't
        // active. When active with default-deny inbound, this is the
        // ONLY thing preventing peers from dialling us back — the bound
        // socket is up, but UFW silently drops every SYN at INPUT. The
        // symptom is: outbound peers form, inbound count stays 0
        // forever, F18 fires (correctly) but the alert misled operators
        // to look at NAT / router. Verified fix on a Hostinger Ubuntu
        // VPS, 2026-05-15. Now baked in so every install gets reachable
        // inbound P2P out of the box.
        //
        // RPC port (cfg.ports.rpc) intentionally not opened — ela's
        // RpcConfiguration.WhiteIPList=["127.0.0.1"] already keeps RPC
        // loopback-only inside ela; no reason to expose it to the
        // network even if the operator's firewall would permit it.
        try {
            const fwReport = await EnmFirewallManager.ensureAllowed(
                [cfg.ports.nodePort, cfg.ports.dpos],
                {
                    comment: `ela ${this.chainId} P2P (ENM auto)`,
                    logger: this.extensionHandle && this.extensionHandle.log,
                },
            );
            if (fwReport.skipped) {
                // Operator either doesn't have UFW or has it disabled —
                // either way, ENM can't (and shouldn't) act. The chain
                // will run; if there's a different firewall blocking,
                // F18 will surface it with the updated remediation copy.
            } else if (fwReport.added.length > 0 && this.extensionHandle && this.extensionHandle.log) {
                this.extensionHandle.log.info(
                    `${ENM_LOG_PREFIX} firewall: opened ufw allow `
                    + fwReport.added.map((p) => `${p}/tcp`).join(', ')
                    + ` for ${this.chainId} P2P/DPoS inbound`,
                );
            }
            if (fwReport.errors.length > 0 && this.extensionHandle && this.extensionHandle.log) {
                this.extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} firewall: failed to open `
                    + fwReport.errors.map((e) => `${e.port}/tcp (${e.message})`).join('; ')
                    + ` — chain will start anyway, but inbound peers may stay 0. `
                    + `Resolve manually: sudo ufw allow ${cfg.ports.nodePort}/tcp && `
                    + `sudo ufw allow ${cfg.ports.dpos}/tcp`,
                );
            }
        } catch (err) {
            // Firewall management failure is non-fatal — ela can still
            // start. Just log and continue; the operator may see F18
            // later if the firewall is in fact blocking.
            if (this.extensionHandle && this.extensionHandle.log) {
                this.extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} firewall preflight failed: ${err.message}`,
                );
            }
        }

        // 5. Spawn via the process service (also acquires the chain lock).
        const result = await this.processService.start(this.chainId, cfg);
        if (result.alreadyRunning) {
            return result;
        }

        // 6. Pipe keystore password to stdin so the ela process can unlock
        // the producer key. node.sh's equivalent is `cat ~/.config/elastos/
        // ela.txt | nohup ./ela` (build/skeleton/node.sh:866). Without this,
        // BPoS mode hangs forever on the password prompt.
        if (cfg.dpos.enableArbiter) {
            const envelope = cfg.dpos && cfg.dpos.keystorePasswordEncrypted;
            if (!envelope) {
                // Previously this was a warn-and-continue. ela then hung
                // on the password prompt forever, but ENM reported the
                // chain as "started successfully". Operator dashboard
                // showed a healthy chain that wasn't actually doing
                // anything. Now we kill the child + throw so the caller
                // (route handler) gets a real 500 with actionable text.
                try { await this.processService.stop(this.chainId); }
                catch (_) { /* best-effort cleanup */ }
                throw new Error(
                    'BPoS arbiter mode is enabled but no keystore password is on file. '
                    + 'Re-import the keystore via Settings → Reinstall my node.',
                );
            }
            let plaintext;
            try {
                plaintext = decrypt(envelope);
            } catch (err) {
                try { await this.processService.stop(this.chainId); }
                catch (_) { /* best-effort cleanup */ }
                throw new Error(
                    `Cannot decrypt keystore password: ${err.message}. `
                    + 'Re-import the keystore via Settings → Reinstall my node.',
                );
            }
            // P1 (v0.5.183) — stdin handshake robustness. writeStdin() writes
            // the password then immediately end()s the pipe (closes EOF).
            // Today this works only by pipe-buffering luck: ela reads its
            // password prompt from stdin a moment AFTER spawn, and the bytes
            // happen to still be buffered. On a slow host — or a future ela
            // build that reads stdin differently — an end() that fires before
            // ela has started reading can deliver EOF first and TRUNCATE the
            // prompt read, so ela hangs on an empty password while start()
            // already returned "success". We can't watch ela's stdout for a
            // "password" marker here (NativeProcessService owns the child's
            // stdout sink and doesn't surface it to the adapter), so we use
            // the pragmatic, non-breaking guard the task calls for: a short
            // grace delay BEFORE writing + ending, giving the freshly-spawned
            // child time to reach its stdin read. Best-effort — if the child
            // already died, writeStdin() below returns false and we handle it.
            await _sleep(STDIN_FEED_GRACE_MS);
            const wrote = this.processService.writeStdin(this.chainId, plaintext);
            if (!wrote) {
                // Same logic: writeStdin failed → ela never gets the
                // password → hangs. Don't return success.
                try { await this.processService.stop(this.chainId); }
                catch (_) { /* best-effort cleanup */ }
                throw new Error(
                    'Failed to feed keystore password to ela (child stdin closed). '
                    + 'Try Restart on the chain card; if it persists, file an issue '
                    + 'with the most recent enm-server logs.',
                );
            }
            // Plaintext goes out of scope here; v8 GC reclaims its
            // backing buffer on the next minor cycle. We don't keep
            // it on `this` and we don't write it to disk.
        }

        return result;
    }

    /**
     * Map our logLevel enum to ela's PrintLevel uint32.
     * ela log levels (per common/log/log.go): 0=trace, 1=debug, 2=info, 3=warn, 4=error.
     *
     * @private
     * @param {string} level
     * @returns {number}
     */
    _mapLogLevel(level) {
        switch (level) {
            case 'debug': return 1;
            case 'info':  return 2;
            case 'warn':  return 3;
            case 'error': return 4;
            default:      return 2;
        }
    }
}

module.exports = ElaMainChainAdapter;
