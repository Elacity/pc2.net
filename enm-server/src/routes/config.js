/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * routes/config.js — read + write the operator-facing settings (Phase 5).
 *
 *   GET  /config                            owner-redacted view of the full config
 *   GET  /config/rpc/credentials/:chainId   owner-only — plaintext RPC user/pass + reachable hosts
 *   PUT  /config/network                    update DPoS IP override + mode
 *   PUT  /config/mainchain                  update advanced mainchain knobs
 *   PUT  /config/general                    update healing/notifications/audit prefs
 *   POST /config/rollback                   restore previous .bak version
 *
 * Mutations are owner-only and rate-limited via the `admin` scope. Reads are
 * authenticated but do not require owner — most operators run a single-owner
 * PC2 and the config is operationally safe to inspect.
 *
 * Sensitive fields (rpc.passwordEncrypted) never leave this server in
 * plaintext. The PUT endpoints accept a new RPC password as `rpcPassword` and
 * pipe it through ConfigStore.setRpcPassword (AES-GCM encrypt before persist).
 */

'use strict';

const express = require('express');

const { ENM_LOG_PREFIX, errorBody, successBody } = require('../services/EnmConstants');
const { limit } = require('../services/EnmRateLimit');
const { requireOwner, readActorWallet } = require('../auth/OwnerCheckMiddleware');
const os = require('node:os');
const ConfigStore = require('../services/ConfigStore');
const { redactSecrets } = require('../services/EnmConfigRedact');
// beta.3.31 — wire RPC enable toggle to UFW so flipping the switch in
// Settings → Access opens/closes port 20336 at the host firewall. Without
// this, an operator who enables external RPC sees the toggle go green but
// inbound SYN packets still get dropped at UFW INPUT (same root cause as
// the 20338/20339 issue documented in EnmFirewallManager.js).
const EnmFirewallManager = require('../services/EnmFirewallManager');
// 0.2.0-beta.3.11 — request-body Joi schemas replace the per-route
// inline `typeof body.X === 'Y'` checks. See EnmRequestSchemas.js
// for the rationale (4 categories of problems with the old approach).
const RequestSchemas = require('../services/EnmRequestSchemas');

/**
 * Sentinel thrown from inside a ConfigStore.update mutator to abort the atomic
 * write when a cfg-dependent precondition fails (e.g. enabling RPC with no
 * password). update() runs the mutator before _saveInner, so throwing here
 * guarantees nothing is persisted; the route's catch maps it back to the
 * original HTTP status using a closure flag (no write on rejection).
 */
class ConfigPreconditionError extends Error {}

/**
 * @param {object} extensionHandle
 * @returns {import('express').Router}
 */
function build(extensionHandle, opts) {
    const router = express.Router();
    // v0.5.246 — lazy resolver for the fleet-monitoring status endpoint (built
    // post-boot in server.js). Used to reload it after an Access save.
    const getStatusEndpoint = (opts && opts.getStatusEndpoint) || (() => null);

    // GET /config — full config minus secrets.
    router.get('/', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const cfg = await ConfigStore.load();
            return res.json(successBody({ config: redactSecrets(cfg) }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} GET /config: ${err.message}`);
            return res.status(500).json(errorBody('Failed to load config.'));
        }
    });

    // GET /config/rpc/credentials/:chainId — owner-only.
    //
    // Returns the live RPC user + plaintext password so the operator can
    // wire an external wallet / dApp / monitoring tool to the chain. This
    // is the ONLY endpoint that returns the password unredacted, hence the
    // requireOwner gate and the `admin` rate-limit scope.
    //
    // Reachable hosts: ela's RPC server binds to 0.0.0.0 by default, and
    // we restrict access via WhiteIPList. The response includes:
    //   - localUrl    : http://127.0.0.1:<port>     (always works locally)
    //   - lanUrls[]   : http://<lan-ip>:<port>       (one per non-loopback iface)
    // The operator picks the URL appropriate to where their client lives,
    // and ensures the client's source IP is in whiteIPList.
    router.get('/rpc/credentials/:chainId', limit('admin'), requireOwner, async (req, res) => {
        try {
            const chainId = req.params.chainId;
            const cfg = await ConfigStore.load();
            const chain = cfg.chains && cfg.chains[chainId];
            if (!chain) {
                return res.status(404).json(errorBody(`Chain "${chainId}" is not configured.`));
            }
            if (!chain.rpc || typeof chain.rpc.passwordEncrypted !== 'string'
                || chain.rpc.passwordEncrypted.length === 0) {
                return res.status(409).json(errorBody('RPC password not set yet — finish setup first.'));
            }
            let password;
            try {
                password = ConfigStore.getRpcPassword(chain);
            } catch (err) {
                extensionHandle.log.error(`${ENM_LOG_PREFIX} GET /config/rpc/credentials: decrypt failed: ${err.message}`);
                return res.status(500).json(errorBody('Failed to decrypt RPC password.'));
            }

            const port = chain.ports && chain.ports.rpc;
            const lanUrls = collectLanUrls(port);

            return res.json(successBody({
                chainId,
                user: chain.rpc.user,
                password,
                port,
                localUrl: `http://127.0.0.1:${port}`,
                lanUrls,
                // alpha.19: master enable state — frontend uses this to drive
                // the on/off toggle.
                enabled: chain.rpc.enabled === true,
                whiteIPList: Array.isArray(chain.rpc.whiteIPList) ? chain.rpc.whiteIPList : ['127.0.0.1'],
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} GET /config/rpc/credentials: ${err.message}`);
            return res.status(500).json(errorBody('Failed to read RPC credentials.'));
        }
    });

    // PUT /config/network — DPoS external IP knobs.
    // 0.2.0-beta.3.10 — PUT /config/network request schema.
    //
    //   {
    //     mode:        'auto' | 'manual'  // optional; required for valid save
    //     manualValue: string              // IPv4 / IPv6 / CIDR; required when
    //                                      // mode === 'manual', ignored when 'auto'
    //   }
    //
    // Owner-only. Writes:
    //   chain.dpos.ipAddressMode     ← body.mode
    //   chain.dpos.ipAddressManual   ← body.manualValue (trimmed; null on 'auto')
    //
    // Errors: 400 on invalid mode; 409 when mainchain not configured.
    // Side-effect: ela process needs restart for the IP change to take
    // effect — the frontend Settings card carries a "Restart required"
    // tag (beta.3.6) reflecting this.
    router.put('/network', limit('admin'), requireOwner, async (req, res) => {
        // 0.2.0-beta.3.11 — Joi-validated body (replaces inline typeof
        // checks). Schema in EnmRequestSchemas.networkBody:
        //   mode: 'auto' | 'manual' (optional)
        //   manualValue: string '' / max 64 (optional)
        const { value, details } = RequestSchemas.validateBody(
            RequestSchemas.networkBody, req.body,
        );
        if (details) {
            return res.status(400).json({
                ...errorBody('Invalid request body.'),
                details,
            });
        }
        const { mode, manualValue } = value;
        try {
            // Atomic read-modify-write (P0-7). The 409 + the dpos subdoc for the
            // response are captured via closure from the freshly-loaded cfg.
            let chain = null;
            await ConfigStore.update((cfg) => {
                chain = cfg.chains && cfg.chains.mainchain;
                if (!chain) {
                    return;
                }
                chain.dpos = chain.dpos || {};
                if (mode) chain.dpos.ipAddressMode = mode;
                chain.dpos.ipAddressManual = (mode === 'manual' && typeof manualValue === 'string')
                    ? manualValue.trim()
                    : (mode === 'auto' ? null : chain.dpos.ipAddressManual);
            }, { logger: extensionHandle.log });
            if (!chain) {
                return res.status(409).json(errorBody('Main chain not configured.'));
            }
            return res.json(successBody({ dpos: chain.dpos }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} PUT /config/network: ${err.message}`);
            return res.status(500).json(errorBody('Could not save Network settings. Try again.'));
        }
    });

    // 0.2.0-beta.3.10 — PUT /config/mainchain request schema.
    //
    //   {
    //     logLevel:      'debug' | 'info' | 'warn' | 'error'  // optional
    //     archiveMode:   boolean                              // optional
    //     memoryLimitMb: integer 512..32768                   // optional
    //     rpcEnabled:    boolean                              // optional;
    //                                                          master toggle
    //                                                          for external RPC
    //     rpcUser:       non-empty string                     // optional
    //     rpcPassword:   non-empty string (plaintext)         // optional;
    //                                                          encrypted at rest
    //                                                          via ConfigStore.
    //                                                          setRpcPassword
    //     whiteIPList:   string[] (IPv4/IPv6/CIDR)            // optional;
    //                                                          127.0.0.1 forced
    //                                                          back in if absent
    //   }
    //
    // Owner-only. Each field is optional (PATCH semantics in PUT clothing
    // — caller sends only the fields they want to change). Writes go to
    // cfg.chains.mainchain.*. Side-effect: ela process needs restart for
    // logLevel / archiveMode / memoryLimitMb / rpcEnabled / whiteIPList
    // changes; rpcUser + rpcPassword take effect on next restart too
    // since they end up in ela.conf RPCConfiguration.
    //
    // Errors: 409 when mainchain not configured. Invalid fields are
    // silently ignored (defensive — frontend has inline validation).
    router.put('/mainchain', limit('admin'), requireOwner, async (req, res) => {
        // 0.2.0-beta.3.11 — Joi-validated body (replaces inline typeof
        // checks). Schema in EnmRequestSchemas.mainchainBody.
        const { value, details } = RequestSchemas.validateBody(
            RequestSchemas.mainchainBody, req.body,
        );
        if (details) {
            return res.status(400).json({
                ...errorBody('Invalid request body.'),
                details,
            });
        }
        const body = value;
        // P1 (v0.5.183) — reject world-open whitelist entries. The form
        // accepts any IPv4/IPv6+CIDR, but 0.0.0.0/0 and ::/0 mean "every
        // host on the internet can hit the RPC" — that's never what an
        // operator intends and silently opens the node to the world. We
        // gate it here (not in the schema) so the operator gets a clear,
        // actionable 400 instead of a generic "invalid" rejection. Body-only
        // check — hoisted above the atomic write so a rejected request never
        // touches the config file.
        if (Array.isArray(body.whiteIPList)) {
            // v0.5.246 — reject not just 0.0.0.0/0 // ::/0 but any prefix broader
            // than /24 (IPv4) or /64 (IPv6): those grant access to whole ISP
            // blocks rather than a known host. The whitelist now also gates the
            // externally-reachable monitor endpoint, so over-broad ranges are
            // doubly unsafe. Gated here (not the schema) for a clear 400.
            const tooBroad = body.whiteIPList.find((entry) => {
                if (typeof entry !== 'string') { return false; }
                const e = entry.trim();
                if (e === '0.0.0.0/0' || e === '::/0') { return true; }
                const slash = e.indexOf('/');
                if (slash === -1) { return false; }            // bare IP is fine
                const bits = Number(e.slice(slash + 1));
                if (!Number.isInteger(bits)) { return false; } // Joi validated shape already
                const isV6 = e.indexOf(':') !== -1;
                return isV6 ? (bits < 64) : (bits < 24);
            });
            if (tooBroad) {
                return res.status(400).json(errorBody(
                    `Whitelist entry "${tooBroad.trim()}" is too broad — list specific `
                    + 'IPs, or subnets no wider than /24 (IPv4) or /64 (IPv6).',
                ));
            }
        }
        // Hoisted above the try so the catch can read them (the mutator runs
        // inside ConfigStore.update below and signals via these closures).
        let chain = null;
        let rpcEnabledBefore = false;
        let rpcPasswordMissing = false;
        try {
            // Atomic read-modify-write (P0-7). The 409s + the values needed for
            // the post-save firewall sync are captured via closure from the
            // freshly-loaded cfg. cfg-dependent precondition failures throw a
            // tagged sentinel so the save is aborted (no write on rejection).
            await ConfigStore.update((cfg) => {
                chain = cfg.chains && cfg.chains.mainchain;
                if (!chain) {
                    return;
                }
                chain.rpc = chain.rpc || {};
                // P1 (v0.5.183) — refuse to open external RPC without a password.
                // Enabling RPC (rpcEnabled=true) while no password has ever been
                // set would expose an unauthenticated RPC endpoint to whatever the
                // whitelist allows. Require a password first — either already on
                // disk (chain.rpc.passwordEncrypted) or supplied in this same
                // request (body.rpcPassword, encrypted below).
                if (body.rpcEnabled === true) {
                    const hasStoredPassword = typeof chain.rpc.passwordEncrypted === 'string'
                        && chain.rpc.passwordEncrypted.length > 0;
                    const suppliesPassword = typeof body.rpcPassword === 'string'
                        && body.rpcPassword.length > 0;
                    if (!hasStoredPassword && !suppliesPassword) {
                        rpcPasswordMissing = true;
                        throw new ConfigPreconditionError();
                    }
                }
                // Joi validated types already — these checks are now just
                // "did the operator send the field?" presence guards.
                if (body.logLevel != null)     { chain.logLevel = body.logLevel; }
                if (body.archiveMode != null)  { chain.archiveMode = body.archiveMode; }
                if (body.memoryLimitMb != null){ chain.memoryLimitMb = body.memoryLimitMb; }

                chain.rpc = chain.rpc || {};
                // alpha.19: master gate for external RPC access. Defaults to false
                // on new installs (see EnmConfigSchema). When false, the generated
                // ela config.json hard-forces WhiteIPList=['127.0.0.1'] regardless
                // of what the operator saved here.
                //
                // beta.3.31: capture the prior state so we know whether the
                // operator is toggling ON (false → true: open firewall) or
                // toggling OFF (true → false: close firewall). Same-state
                // saves are a no-op on the firewall side.
                rpcEnabledBefore = chain.rpc.enabled === true;
                if (body.rpcEnabled != null) {
                    chain.rpc.enabled = body.rpcEnabled;
                }
                if (body.rpcUser) {
                    chain.rpc.user = body.rpcUser;
                }
                if (body.rpcPassword) {
                    ConfigStore.setRpcPassword(chain, body.rpcPassword);
                }
                if (body.whiteIPList) {
                    // Joi already filtered to strings + validated each as IP/CIDR.
                    chain.rpc.whiteIPList = body.whiteIPList.slice();
                    // SAFETY NET (alpha.19): 127.0.0.1 is required for ENM's own
                    // RPC calls + local diagnostics. Force-include if a UI bug or
                    // sloppy client tries to remove it — operator can't lock us out.
                    if (!chain.rpc.whiteIPList.includes('127.0.0.1')) {
                        chain.rpc.whiteIPList.unshift('127.0.0.1');
                    }
                }
            }, { logger: extensionHandle.log });
            if (!chain) {
                return res.status(409).json(errorBody('Main chain not configured.'));
            }
            // P1 (v0.5.183) — a running ela only re-reads RpcConfiguration
            // (RpcServiceLevel / WhiteIPList) on (re)start, so toggling RPC or
            // editing the whitelist here does NOT take effect until the chain
            // restarts. We do NOT auto-restart (that would interrupt sync /
            // signing); we just signal it so the UI can surface a "Restart
            // required" prompt. Reflects exactly what the operator changed in
            // this request.
            const rpcSettingChanged = body.rpcEnabled != null
                || body.whiteIPList != null;

            // beta.3.31 — keep the host firewall in sync with the RPC
            // toggle. We do this AFTER the config save so the persisted
            // state is the source of truth even if the UFW shell-out
            // misbehaves. UFW failure is non-fatal: ela's own WhiteIPList
            // is still the security boundary; the worst case is that the
            // operator's external clients can't reach 20336 even though
            // they "enabled" RPC, which is the safer failure mode.
            //
            // No-op when:
            //   - rpcEnabled wasn't in the request body (operator only
            //     touched logLevel / user / password / whitelist)
            //   - prior state == new state (idempotent save)
            //   - UFW not installed or inactive (EnmFirewallManager
            //     handles this internally and returns skipped:true)
            if (body.rpcEnabled != null && body.rpcEnabled !== rpcEnabledBefore) {
                const rpcPort = chain.ports && chain.ports.rpc;
                if (Number.isInteger(rpcPort)) {
                    try {
                        if (body.rpcEnabled) {
                            const fw = await EnmFirewallManager.ensureAllowed(
                                [rpcPort],
                                {
                                    comment: 'ela mainchain RPC (ENM toggle)',
                                    logger: extensionHandle.log,
                                },
                            );
                            if (fw.errors && fw.errors.length) {
                                extensionHandle.log.warn(
                                    `${ENM_LOG_PREFIX} PUT /config/mainchain: `
                                    + `UFW open ${rpcPort}/tcp failed: `
                                    + fw.errors.map((e) => e.message).join('; '),
                                );
                            }
                        } else {
                            await EnmFirewallManager.removeRule(rpcPort, {
                                logger: extensionHandle.log,
                            });
                        }
                    } catch (fwErr) {
                        // Defensive — EnmFirewallManager shouldn't throw,
                        // but if a future change ever does, we don't want
                        // to fail the config save the operator already
                        // committed.
                        extensionHandle.log.warn(
                            `${ENM_LOG_PREFIX} PUT /config/mainchain: `
                            + `UFW sync threw: ${fwErr.message}`,
                        );
                    }
                }
            }

            // v0.5.246 — refresh the fleet-monitoring status endpoint so an
            // Access change (enable / whitelist / creds) takes effect live: it
            // re-reads the policy and (un)binds its listener + reconciles its
            // UFW per-source rules. Fire-and-forget — never block or fail the
            // save the operator already committed. (The sidechain monitor view
            // applies immediately; only ela's own RPC still needs a restart.)
            try {
                const se = getStatusEndpoint();
                if (se && typeof se.reload === 'function') {
                    Promise.resolve(se.reload()).catch(() => { /* non-fatal */ });
                }
            } catch (_) { /* non-fatal */ }

            // P1 (v0.5.183) — surface restart requirement for RPC-setting
            // changes (rpcEnabled / whiteIPList). Omitted entirely otherwise
            // so unrelated saves (logLevel etc.) don't nag.
            return res.json(successBody(
                rpcSettingChanged ? { ok: true, restartRequired: true } : { ok: true },
            ));
        } catch (err) {
            // cfg-dependent precondition (RPC enable without a password) aborts
            // the atomic write via a tagged throw — surface it as the original
            // 409, not a generic 500.
            if (err instanceof ConfigPreconditionError && rpcPasswordMissing) {
                return res.status(409).json(errorBody(
                    'Set an RPC password before enabling external RPC access.',
                ));
            }
            extensionHandle.log.error(`${ENM_LOG_PREFIX} PUT /config/mainchain: ${err.message}`);
            return res.status(500).json(errorBody('Could not save Main chain settings. Try again.'));
        }
    });

    // 0.2.0-beta.3.10 — PUT /config/general request schema.
    //
    //   {
    //     autoExecuteSafe:      boolean       // optional; flips
    //                                          cfg.global.healing.autoExecuteSafe
    //     criticalRequiresAck:  boolean       // optional; flips
    //                                          cfg.global.notifications.criticalRequiresAck
    //     auditRetentionDays:   integer >= 0  // optional; 0 = forever; max 3650
    //                                          (3650 frontend-only cap, backend
    //                                          accepts any non-negative int)
    //   }
    //
    // Owner-only. No restart needed for any field — settings take
    // effect on next operation. Healing engine reads autoExecuteSafe
    // each tick; notifications service reads criticalRequiresAck each
    // toast; audit-cleanup sweep (beta.3.7, server.js) reads
    // auditRetentionDays each run.
    //
    // Errors: 500 on ConfigStore.save failure.
    //
    // Note: anti-snipe password sits on cfg.global.antiSnipePasswordHash
    // but has its own endpoint (POST /config/anti-snipe-password) to
    // keep the security-sensitive path isolated from this PUT. Adding
    // antiSnipePassword here would be a mistake — the dedicated route
    // is owner-only AND uses scrypt at the boundary.
    router.put('/general', limit('admin'), requireOwner, async (req, res) => {
        // 0.2.0-beta.3.11 — Joi-validated body. Schema bounds
        // auditRetentionDays to 0..3650 + types of the toggles.
        const { value, details } = RequestSchemas.validateBody(
            RequestSchemas.generalBody, req.body,
        );
        if (details) {
            return res.status(400).json({
                ...errorBody('Invalid request body.'),
                details,
            });
        }
        const body = value;
        try {
            // Atomic read-modify-write (P0-7). Capture the mutated global subdoc
            // via closure for the response.
            let global;
            await ConfigStore.update((cfg) => {
                cfg.global = cfg.global || {};
                cfg.global.healing = cfg.global.healing || {};
                cfg.global.notifications = cfg.global.notifications || {};
                cfg.global.audit = cfg.global.audit || {};
                if (body.autoExecuteSafe != null) {
                    cfg.global.healing.autoExecuteSafe = body.autoExecuteSafe;
                }
                if (body.criticalRequiresAck != null) {
                    cfg.global.notifications.criticalRequiresAck = body.criticalRequiresAck;
                }
                if (body.auditRetentionDays != null) {
                    cfg.global.audit.retentionDays = body.auditRetentionDays;
                }
                global = cfg.global;
            }, { logger: extensionHandle.log });
            return res.json(successBody({ global }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} PUT /config/general: ${err.message}`);
            return res.status(500).json(errorBody('Could not save general settings. Try again.'));
        }
    });

    // beta.3.20 — PUT /config/storage.
    //
    // Phase 3 Storage section. Knobs for the EnmStorageMaintenance
    // service:
    //   logGzipAfterDays  — gzip closed *.log files past this age
    //   logRetentionDays  — delete *.log.gz past this age
    //   keystoreIntervalDays  — how often the auto-backup runs
    //   keystoreKeepCount     — how many backup files to retain
    //
    // No chain restart needed — EnmStorageMaintenance reads from
    // cfg.global.{logRotation,backup} on every 24h tick, picking up
    // the new values on its next fire.
    router.put('/storage', limit('admin'), requireOwner, async (req, res) => {
        const { value, details } = RequestSchemas.validateBody(
            RequestSchemas.storageBody, req.body,
        );
        if (details) {
            return res.status(400).json({
                ...errorBody('Invalid request body.'),
                details,
            });
        }
        const body = value;
        try {
            // Atomic read-modify-write (P0-7). Capture the mutated subdocs via
            // closure for the response.
            let logRotation;
            let backup;
            await ConfigStore.update((cfg) => {
                cfg.global = cfg.global || {};
                cfg.global.logRotation = cfg.global.logRotation || {};
                cfg.global.backup = cfg.global.backup || {};
                if (body.logGzipAfterDays != null) {
                    cfg.global.logRotation.gzipAfterDays = body.logGzipAfterDays;
                }
                if (body.logRetentionDays != null) {
                    cfg.global.logRotation.purgeAfterDays = body.logRetentionDays;
                }
                if (body.keystoreIntervalDays != null) {
                    cfg.global.backup.keystoreIntervalDays = body.keystoreIntervalDays;
                }
                if (body.keystoreKeepCount != null) {
                    cfg.global.backup.keystoreKeepCount = body.keystoreKeepCount;
                }
                logRotation = cfg.global.logRotation;
                backup = cfg.global.backup;
            }, { logger: extensionHandle.log });
            return res.json(successBody({
                logRotation,
                backup,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} PUT /config/storage: ${err.message}`);
            return res.status(500).json(errorBody('Could not save Storage settings. Try again.'));
        }
    });

    // beta.3.19 — PUT /config/notifications.
    //
    // Phase 2 Alerts section. Operator-tunable thresholds that drive
    // the HealthChecker's F3 (peer-zero) / F4 (sync-stall) / F5 (disk-
    // space) detectors. The values land in
    // cfg.global.notifications.thresholds.* and HealthChecker pushes
    // them into HealthRules.setThresholds() on its next
    // _loadConfigSafe() tick (≤5 s cadence on the fast bucket).
    //
    // Defaults match the alpha.28 hardcoded values: warn at 20 GB,
    // critical at 5 GB, peer-zero grace 5 min, sync-stall grace 10 min.
    // Cross-field validation (critical < warn) is enforced in the Joi
    // schema upstream, so by the time we get here the body is sane.
    //
    // No chain restart needed — HealthRules picks up the new thresholds
    // on the next tick. The Settings Alerts section ships with the
    // "No restart needed" tag.
    router.put('/notifications', limit('admin'), requireOwner, async (req, res) => {
        const { value, details } = RequestSchemas.validateBody(
            RequestSchemas.notificationsBody, req.body,
        );
        if (details) {
            return res.status(400).json({
                ...errorBody('Invalid request body.'),
                details,
            });
        }
        const body = value;
        try {
            // Atomic read-modify-write (P0-7). Capture the mutated thresholds
            // slot via closure for the response.
            let slot;
            await ConfigStore.update((cfg) => {
                cfg.global = cfg.global || {};
                cfg.global.notifications = cfg.global.notifications || {};
                cfg.global.notifications.thresholds =
                    cfg.global.notifications.thresholds || {};
                slot = cfg.global.notifications.thresholds;
                if (body.diskFreeWarnGb != null) {
                    slot.diskFreeWarnGb = body.diskFreeWarnGb;
                }
                if (body.diskFreeCriticalGb != null) {
                    slot.diskFreeCriticalGb = body.diskFreeCriticalGb;
                }
                if (body.peerZeroGraceMin != null) {
                    slot.peerZeroGraceMin = body.peerZeroGraceMin;
                }
                if (body.syncStallGraceMin != null) {
                    slot.syncStallGraceMin = body.syncStallGraceMin;
                }
            }, { logger: extensionHandle.log });
            return res.json(successBody({ thresholds: slot }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} PUT /config/notifications: ${err.message}`);
            return res.status(500).json(errorBody('Could not save Alerts thresholds. Try again.'));
        }
    });

    // beta.3.76 — PUT /config/healing.
    //
    // Per-rule enable/disable overrides for the healing engine. Body:
    //   { enabledRules: { F1: true, F2: false, F22: true, ... } }
    //
    // Only the keys present in the body are written; omitted rules
    // keep their previous override (or DEFAULT_ENABLED if never set).
    // To "clear" a rule back to default, send the boolean of its
    // DEFAULT_ENABLED value (true for every rule today).
    //
    // No chain restart needed — HealthChecker._loadConfigSafe pushes
    // the new map into HealthRules on its next tick (≤5 s cadence).
    // The Settings → Healing section ships with a "No restart needed"
    // tag matching the Alerts section.
    router.put('/healing', limit('admin'), requireOwner, async (req, res) => {
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        const enabledRules = body.enabledRules;
        if (!enabledRules || typeof enabledRules !== 'object' || Array.isArray(enabledRules)) {
            return res.status(400).json(errorBody(
                'Missing or malformed rule toggles — expected a map of rule ID to true/false.',
            ));
        }
        // Validate keys + values inline (Joi schema enforces this too,
        // but a clearer 400 here avoids the operator hitting the cfg
        // save layer's generic validation error).
        const RULE_KEY_RE = /^(F\d{1,2}|AUTOSTART)$/;
        for (const k of Object.keys(enabledRules)) {
            if (!RULE_KEY_RE.test(k)) {
                return res.status(400).json(errorBody(
                    `Invalid rule ID "${k}". Rule IDs must be F1-F99 or AUTOSTART.`,
                ));
            }
            if (typeof enabledRules[k] !== 'boolean') {
                return res.status(400).json(errorBody(
                    `Rule "${k}" must be true or false.`,
                ));
            }
        }
        try {
            // Atomic read-modify-write (P0-7). Capture the mutated enabledRules
            // slot via closure for the response.
            let slot;
            await ConfigStore.update((cfg) => {
                cfg.global = cfg.global || {};
                cfg.global.healing = cfg.global.healing || {};
                cfg.global.healing.enabledRules =
                    cfg.global.healing.enabledRules || {};
                slot = cfg.global.healing.enabledRules;
                for (const k of Object.keys(enabledRules)) {
                    slot[k] = !!enabledRules[k];
                }
            }, { logger: extensionHandle.log });
            return res.json(successBody({ enabledRules: slot }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} PUT /config/healing: ${err.message}`);
            return res.status(500).json(errorBody('Could not save healing-rule toggles. Try again.'));
        }
    });

    // 0.2.0-beta.3.10 — POST /config/anti-snipe-password.
    //
    // Sets (or clears) the scrypt hash that SelfHealingEngine.
    // _verifyAntiSnipePassword consults when a proposal payload has
    // requireAntiSnipe=true. Body:
    //   { password: "..." }   → hash + store at cfg.global.antiSnipePasswordHash
    //   { password: "" }      → clear (disable anti-snipe)
    //   {}                    → no-op (returns current set/unset state)
    //
    // Owner-gated. Password never echoes back; response carries only a
    // boolean `set` derived from the resulting hash presence. Hash
    // format matches what _verifyAntiSnipePassword expects exactly:
    //   `scrypt$<saltHex>$<derivedHex>`.
    //
    // Pre-beta.3.10 the anti-snipe feature was half-shipped: the
    // verify path was wired in beta.3.9 but no operator-facing way
    // to set the hash existed. This endpoint closes that loop.
    router.post('/anti-snipe-password', limit('admin'), requireOwner, async (req, res) => {
        // 0.2.0-beta.3.11 — Joi-validated body. Schema accepts:
        //   {}                  → probe (return current set state)
        //   { password: "..." } → set (min 1, schema-level; route checks 8)
        //   { password: "" }    → clear
        const { value, details } = RequestSchemas.validateBody(
            RequestSchemas.antiSnipeBody, req.body,
        );
        if (details) {
            return res.status(400).json({
                ...errorBody('Invalid request body.'),
                details,
            });
        }
        try {
            // Joi delivers `password: undefined` for the probe case;
            // empty string for explicit clear; non-empty for set.
            const password = (typeof value.password === 'string') ? value.password : null;
            // null = no-op (operator probably hit the endpoint with no
            // body to query state); empty-string = explicit clear.
            if (password == null) {
                const cfg = await ConfigStore.load();
                return res.json(successBody({
                    set: !!(cfg && cfg.global && cfg.global.antiSnipePasswordHash),
                }));
            }
            if (password === '') {
                // Explicit clear. Strip the field entirely so a future
                // GET /config doesn't leak even the metadata that a
                // hash USED to be set. Atomic read-modify-write (P0-7).
                await ConfigStore.update((cfg) => {
                    cfg.global = cfg.global || {};
                    delete cfg.global.antiSnipePasswordHash;
                }, { logger: extensionHandle.log });
                return res.json(successBody({ set: false }));
            }
            // Reject obviously-weak passwords. Server-side sanity only —
            // the operator deserves to know they typed " " by accident.
            if (password.length < 8) {
                return res.status(400).json(errorBody(
                    'Anti-snipe password must be at least 8 characters.',
                ));
            }
            // Hash with scrypt — matches SelfHealingEngine.
            // _verifyAntiSnipePassword exactly. Random 16-byte salt
            // + 64-byte derived key. KDF cost defaults match Node's
            // recommendation (N=16384, r=8, p=1). Owner-only path,
            // so we can use the slightly heavier sync default. Computed
            // before the atomic write since it doesn't depend on cfg.
            const crypto = require('crypto');
            const salt = crypto.randomBytes(16);
            const derived = await new Promise((resolve, reject) => {
                crypto.scrypt(password, salt, 64, (err, key) => {
                    if (err) { reject(err); } else { resolve(key); }
                });
            });
            const passwordHash = 'scrypt$'
                + salt.toString('hex') + '$' + derived.toString('hex');
            // Atomic read-modify-write (P0-7).
            await ConfigStore.update((cfg) => {
                cfg.global = cfg.global || {};
                cfg.global.antiSnipePasswordHash = passwordHash;
            }, { logger: extensionHandle.log });
            return res.json(successBody({ set: true }));
        } catch (err) {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} POST /config/anti-snipe-password: ${err.message}`,
            );
            return res.status(500).json(errorBody('Could not save the anti-snipe password. Try again.'));
        }
    });

    // POST /config/rollback — F9 healing path.
    router.post('/rollback', limit('admin'), requireOwner, async (req, res) => {
        try {
            const restored = await ConfigStore.rollback();
            if (!restored) {
                return res.status(404).json(errorBody('No backup available.'));
            }
            return res.json(successBody({ config: redactSecrets(restored) }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} POST /config/rollback: ${err.message}`);
            return res.status(500).json(errorBody('Config rollback failed. Try again.'));
        }
    });

    return router;
}

/**
 * Build http://<ip>:<port> URLs for every non-loopback IPv4 interface so the
 * operator can pick the address matching where their client lives. IPv6 link-
 * local entries are skipped — they're rarely useful for RPC clients.
 *
 * @param {number} port
 * @returns {string[]}
 */
function collectLanUrls(port) {
    if (!Number.isInteger(port)) return [];
    const out = [];
    let ifaces;
    try { ifaces = os.networkInterfaces(); } catch { return []; }
    for (const name of Object.keys(ifaces || {})) {
        for (const a of ifaces[name] || []) {
            if (!a || a.internal) continue;
            if (a.family === 'IPv4' || a.family === 4) {
                out.push(`http://${a.address}:${port}`);
            }
        }
    }
    return out;
}

module.exports = { build, redactSecrets };
