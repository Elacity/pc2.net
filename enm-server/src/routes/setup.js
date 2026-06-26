/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * routes/setup.js — setup wizard endpoints (Phase 1b skeleton).
 *
 * Phase 1b ships the route shapes and preflight checks (OS, disk, binary path).
 * Phase 5 fills in the wizard's full step machine + per-step confirmation flow.
 *
 * Endpoints:
 *   GET  /api/setup/state       → wizard progress + last-completed step
 *   GET  /api/setup/preflight   → run OS + disk + wallet checks (read-only, no mutation)
 *   POST /api/setup/binary      → operator submits ela path → validatePath → store
 *   POST /api/setup/complete    → mark setup done (Phase 5 expansion: trigger first start)
 */

'use strict';

const express = require('express');

const { ENM_LOG_PREFIX, errorBody, successBody } = require('../services/EnmConstants');
const { limit } = require('../services/EnmRateLimit');
const { requireOwner, readActorWallet } = require('../auth/OwnerCheckMiddleware');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const osPreflight = require('../services/OsPreflight');
const diskPreflight = require('../services/DiskPreflight');
const ClockSkewChecker = require('../services/ClockSkewChecker');
const binaryLocator = require('../services/EnmBinaryLocator');
const { enmDataDir, chainDir, atomicWrite } = require('../services/DataDir');
const ConfigStore = require('../services/ConfigStore');
const { encrypt } = require('../services/EnmEncryption');
const { ELA_DEFAULT_PORTS } = require('../services/EnmConstants');
const ExtIpResolver = require('../services/ExtIpResolver');
const crypto = require('node:crypto');
const { walletScopeId, validateKeystorePath } = require('../services/EnmSetupHelpers');
const HostConflictScanner = require('../services/HostConflictScanner');
const ChainRegistry = require('../services/ChainRegistry');

/**
 * Sentinel thrown from inside a ConfigStore.update mutator to abort the atomic
 * write when a cfg-dependent precondition fails (e.g. Council strategy not yet
 * set, chain already configured). update() runs the mutator before _saveInner,
 * so throwing here guarantees nothing is persisted; the caller stashes the HTTP
 * status/body in a closure and maps the abort back to that response.
 */
class SetupAbort extends Error {}

/**
 * @param {object} extensionHandle
 * @returns {import('express').Router}
 */
function build(extensionHandle) {
    const router = express.Router();

    /**
     * GET /setup/state
     * Returns { completed, currentStep, ...flags } for the calling owner.
     */
    router.get('/state', limit('read'), async (req, res) => {
        const wallet = readActorWallet(req);
        if (!wallet) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            // 0.5.148 audit Session 148 — COMPLETION IS DERIVED FROM DISK,
            // NOT STORED.
            //
            // Background (the operator's "why is it so hard for the app to
            // know it's deployed" question): pre-0.5.148 "is setup done?"
            // lived in THREE places that drift out of sync —
            //   1. cfg.setup.completed (cfg.json)
            //   2. enm_setup_state.completed (SQLite row)
            //   3. the actual filesystem (binary on disk + keystore.dat)
            // Only #3 is self-evident truth. #1 and #2 are bookkeeping that
            // every writer has to remember to keep aligned. The BPoS flow
            // wrote both; the Council flow wrote only #1; the DB table
            // didn't even exist on some installs. Result: completed
            // installs kept showing the wizard. S145 + S147 were patches
            // reconciling #1↔#2. This is the real fix: stop storing the
            // answer, compute it.
            //
            // ChainState.snapshot() is the codebase's established disk-truth
            // layer (Architectural Invariant #1, used by every adapter's
            // start()). `installed` = binary on disk + executable +
            // smoke-tested; `keystorePresent` = keystore.dat on disk. Both
            // true ⇒ a node that can actually run ⇒ setup is done, for
            // both BPoS and Council (Council additionally has sidechains,
            // but mainchain-installed-with-keystore is the minimum bar to
            // leave the wizard; the dashboard renders partial multi-chain
            // states gracefully). This answer cannot desync from reality
            // because it IS reality.
            let completed = false;
            let snap = {};
            try {
                const ChainState = require('../services/ChainState');
                snap = ChainState.snapshot('mainchain') || {};
                completed = !!(snap.installed && snap.keystorePresent);
            } catch (snapErr) {
                extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} /setup/state: ChainState.snapshot `
                    + `failed (${snapErr.message}) — treating as not-complete.`,
                );
            }

            // The DB row is consulted ONLY for the mid-wizard step cursor
            // (resume-at-the-right-card UX) and the ephemeral preflight
            // flags. It is NEVER the completion authority. A missing table
            // or row just means "no resume hint" — the wizard starts from
            // whatever isn't yet done on disk. Best-effort: a SELECT
            // failure (e.g. the table was never created) is non-fatal.
            let row = null;
            try {
                const { db } = extensionHandle.import('data');
                const rows = await db.read(
                    `SELECT * FROM enm_setup_state WHERE wallet_address = ?`,
                    [wallet],
                );
                if (Array.isArray(rows) && rows.length > 0) { row = rows[0]; }
            } catch (selectErr) {
                extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} /setup/state: step-cursor SELECT failed `
                    + `(${selectErr.message}) — proceeding with disk-derived `
                    + 'completion only (this is fine; the row is just a resume hint).',
                );
            }

            return res.json(successBody({
                completed,
                currentStep: completed
                    ? 'complete'
                    : (row && row.current_step ? row.current_step : 'welcome'),
                // Sub-flags: disk-derived where the disk knows, row-backed
                // for the ephemeral preflight results (which the disk
                // can't recover). When completed, the preflight gates are
                // moot — report them passed so the wizard never re-blocks
                // a working node on a stale threshold.
                osCheckPassed: completed || (row ? row.os_check_passed === 1 : false),
                diskCheckPassed: completed || (row ? row.disk_check_passed === 1 : false),
                walletCheckPassed: completed || (row ? row.wallet_check_passed === 1 : false),
                binaryPath: snap.binaryPath || (row ? row.binary_path : null),
                binaryVersion: snap.binaryVersion || (row ? row.binary_version : null),
                keystoreImported: !!snap.keystorePresent,
                configGenerated: completed || (row ? row.config_generated === 1 : false),
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} /setup/state error: ${err.message}`);
            return res.status(500).json(errorBody('Failed to load setup state.'));
        }
    });

    /**
     * GET /setup/conflicts
     * Scan the host for pre-existing Elastos state that would collide with
     * an ENM-managed run. Returns an array of conflicts; the wizard renders
     * each as a remediation card.
     *
     * Setup-time AND restart-time check — the start route calls this too and
     * refuses to spawn if any CRITICAL items are unresolved.
     */
    router.get('/conflicts', limit('read'), requireOwner, async (req, res) => {
        // requireOwner — the conflict scan reveals host fingerprinting
        // (PID files, port usage, binary paths) that we don't want to
        // expose to non-owner authenticated callers.
        try {
            const list = await HostConflictScanner.scan({
                logger: extensionHandle.log,
            });
            return res.json(successBody({
                conflicts: list,
                blockers: HostConflictScanner.blockers(list).length,
                total: list.length,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} /setup/conflicts: ${err.message}`);
            return res.status(500).json(errorBody('Conflict scan failed.'));
        }
    });

    /**
     * GET /setup/preflight
     * Read-only — runs OS + disk checks. The wallet check is implicit (this
     * endpoint requires authentication).
     */
    router.get('/preflight', limit('read'), async (req, res) => {
        const wallet = readActorWallet(req);
        if (!wallet) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const osResult = osPreflight.check();
            const diskResult = await diskPreflight.check(enmDataDir());
            const clockSkewResult = await runClockSkewCheck(extensionHandle);

            // Persist the booleans into setup-state so /setup/state and any
            // later UI surface (e.g., dashboard health tile) can show
            // "preflight passed" without re-running the checks.
            try {
                const { db } = extensionHandle.import('data');
                await upsertSetupState(db, wallet, {
                    os_check_passed: osResult && osResult.ok ? 1 : 0,
                    disk_check_passed: diskResult && diskResult.status !== 'critical' ? 1 : 0,
                    wallet_check_passed: 1,
                });
            } catch (persistErr) {
                extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} /setup/preflight: persist failed: ${persistErr.message}`,
                );
            }

            return res.json(successBody({
                os: osResult,
                disk: diskResult,
                wallet: { ok: true, walletAddress: wallet },
                clockSkew: clockSkewResult,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} /setup/preflight error: ${err.message}`);
            return res.status(500).json(errorBody('Preflight checks failed. Try again.'));
        }
    });

    // beta.0.4.7 — GET /setup/system-check
    //
    // Mandatory pre-install hardware gate for the redesigned Card 0
    // wizard step. Returns the structured EnmSystemCheck report
    // (`{ ts, path, checks, canProceed, remediation? }`) so the UI
    // can render per-check rows + the "Add 4 GB swap" remediation
    // chip when applicable.
    //
    // No auth — Card 0 fires this BEFORE the operator has done
    // anything that requires identity. The data we expose is host
    // hardware shape (cores/RAM/disk/storage type/OS); nothing
    // sensitive.
    //
    // Query param `path` selects the threshold table:
    //   ?path=council  → Council operator (default if omitted? see below)
    //   ?path=bpos     → BPoS producer only
    // Default is 'bpos' (Card 0 starts with the BPoS path because
    // mainchain setup lands first; the Council expansion is a
    // follow-up wizard).
    router.get('/system-check', limit('read'), async (req, res) => {
        try {
            const EnmSystemCheck = require('../services/EnmSystemCheck');
            const requested = String((req.query && req.query.path) || 'bpos');
            const pathName = (requested === 'council' || requested === 'bpos')
                ? requested : 'bpos';
            const report = await EnmSystemCheck.runSystemCheck({ path: pathName });
            return res.json(successBody(report));
        } catch (err) {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} /setup/system-check: ${err.message}`,
            );
            return res.status(500).json(errorBody('System check failed. Try again.'));
        }
    });

    // beta.0.4.7 — POST /setup/system/add-swap
    //
    // Remediation for exactly-8-GB BPoS hosts. EnmSystemCheck flags
    // these via `remediation['add-swap']` on the system-check report;
    // the wizard renders a "Create 4 GB swapfile" button that POSTs
    // here. Owner-only — the action is host-mutating (writes
    // /swapfile + /etc/fstab) and requires root privileges, which
    // PC2 inherits but we still gate on operator identity.
    //
    // Returns the service's structured result verbatim:
    //   - { ok: true, freeGbAfter }   → swap is active + persisted
    //   - { ok: false, error }        → service surfaced the failing step
    //
    // 400 on ok:false so the wizard can render the error without
    // having to parse a separate envelope.
    router.post('/system/add-swap', limit('admin'), requireOwner, async (req, res) => {
        try {
            const EnmSystemCheck = require('../services/EnmSystemCheck');
            const result = await EnmSystemCheck.addSwap();
            if (result && result.ok) {
                return res.json(successBody(result));
            }
            return res.status(400).json(errorBody(
                (result && result.error) || 'add-swap failed (no detail)',
            ));
        } catch (err) {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} /setup/system/add-swap: ${err.message}`,
            );
            return res.status(500).json(errorBody('Could not add swap space. Try again.'));
        }
    });

    /**
     * GET /setup/install-status/:chainId
     *
     * Snapshot of the binary installer state-machine for a single chain.
     * Uses getStatusWithDisk so a container restart doesn't make us forget
     * that the binary is already installed.
     */
    router.get('/install-status/:chainId', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const status = await ChainRegistry.getBinaryDownloader()
                .getStatusWithDisk(req.params.chainId);
            return res.json(successBody(status));
        } catch (err) {
            return res.status(400).json(errorBody('Failed to read install status.'));
        }
    });

    /**
     * GET /setup/chains
     *
     * Catalog of chains we know how to install AND start. We hide chains
     * that are downloadable but have no chain adapter — exposing them
     * would let the wizard install esc/eid/eco and then the dashboard's
     * Start button would 404. Better to keep them invisible until the
     * matching adapters land.
     */
    router.get('/chains', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const wired = new Set(ChainRegistry.listChains().map((c) => c.chainId));
            const chains = ChainRegistry.getBinaryDownloader()
                .listChains()
                .filter((c) => wired.has(c.chainId));
            return res.json(successBody({ chains }));
        } catch (err) {
            return res.status(500).json(errorBody('Failed to list installable chains.'));
        }
    });

    /**
     * POST /setup/install/:chainId
     *
     * Download + extract + verify the latest release of the given chain
     * from download.elastos.io. Mirrors what node.sh does — pre-built
     * tarballs only, no source build, no Go toolchain.
     *
     * Returns immediately. Caller subscribes to SSE topic
     * `setup:install:<chainId>` for live progress or polls
     * /setup/install-status/:chainId. Idempotent.
     */
    router.post('/install/:chainId', limit('write'), requireOwner, async (req, res) => {
        const wallet = readActorWallet(req);
        const chainId = req.params.chainId;
        try {
            const dl = ChainRegistry.getBinaryDownloader();
            const result = await dl.start(chainId);

            // Watcher: when the install finishes, persist into setup-state so
            // the wizard's "downloaded ela" tile checks itself, and so a later
            // /setup/complete can find the path without another round-trip.
            // Mainchain-only — sidechains track their own paths via the chain
            // adapter once we wire those up.
            if (chainId === 'mainchain') {
                const onPhase = setInterval(async () => {
                    const s = dl.getStatus(chainId);
                    if (s.phase === 'done' && s.binaryPath) {
                        clearInterval(onPhase);
                        try {
                            const { db } = extensionHandle.import('data');
                            await upsertSetupState(db, wallet, {
                                binary_path: s.binaryPath,
                                binary_version: s.version || null,
                                current_step: 'keystore',
                            });
                        } catch (err) {
                            extensionHandle.log.warn(
                                `${ENM_LOG_PREFIX} install ${chainId}: setup-state persist failed: ${err.message}`,
                            );
                        }
                    } else if (s.phase === 'failed') {
                        clearInterval(onPhase);
                    }
                }, 2000);
                setTimeout(() => clearInterval(onPhase), 15 * 60 * 1000).unref?.();
            } else if (['esc', 'eid', 'pg'].includes(chainId)) {
                // beta.4.02 (Wave M3.8) — Class B post-install hook.
                // Writes the resolved binaryPath + binaryVersion back into
                // cfg.chains[chainId] so the chain becomes startable
                // (cfg.binaryPath was empty after M3.5's install-class-b).
                // Does NOT flip enabled=true automatically — operator
                // decides when to bring it online via the chain-card
                // Start button.
                const onPhase = setInterval(async () => {
                    const s = dl.getStatus(chainId);
                    if (s.phase === 'done' && s.binaryPath) {
                        clearInterval(onPhase);
                        try {
                            // Atomic read-modify-write (P0-7) — this runs in a
                            // background timer that can race operator saves.
                            let wrote = false;
                            await ConfigStore.update((cfg) => {
                                if (cfg.chains && cfg.chains[chainId]) {
                                    cfg.chains[chainId].binaryPath = s.binaryPath;
                                    cfg.chains[chainId].binaryVersion = s.version || '';
                                    // beta.0.5.0 — stamp install time so F8
                                    // suppresses version-drift for 1h after install.
                                    cfg.chains[chainId].binaryInstalledAt = Date.now();
                                    wrote = true;
                                }
                            });
                            if (wrote) {
                                extensionHandle.log.info(
                                    `${ENM_LOG_PREFIX} install ${chainId} (Class B): wrote `
                                    + `binaryPath=${s.binaryPath} version=${s.version || 'unknown'} into cfg`,
                                );
                            }
                        } catch (err) {
                            extensionHandle.log.warn(
                                `${ENM_LOG_PREFIX} install ${chainId}: cfg persist failed: ${err.message}`,
                            );
                        }
                    } else if (s.phase === 'failed') {
                        clearInterval(onPhase);
                    }
                }, 2000);
                setTimeout(() => clearInterval(onPhase), 15 * 60 * 1000).unref?.();
            }

            return res.status(result.alreadyRunning ? 202 : 200).json(successBody({
                alreadyRunning: result.alreadyRunning,
                status: result.status,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} /setup/install/${chainId}: ${err.message}`);
            // 0.5.88 — mirror chains.js /update fix. Surface
            // EnmBinaryDownloader's operator-meaningful err.codes
            // verbatim so operators on unsupported hardware (or hitting
            // a malformed upstream release) see what's actually wrong
            // instead of looping on 'Try again'.
            const BINARY_CODES = new Set(['UNSUPPORTED_ARCH', 'BINARY_MISSING', 'SMOKE_TEST_FAILED']);
            const responseMessage = BINARY_CODES.has(err && err.code)
                ? err.message
                : 'Could not install the chain. Try again.';
            return res.status(500).json(errorBody(responseMessage));
        }
    });

    /**
     * POST /setup/binary  { binaryPath: string }
     * Phase 2: static validation + `./ela --version` smoke test.
     */
    router.post('/binary', limit('admin'), requireOwner, async (req, res) => {
        const wallet = readActorWallet(req);
        const binaryPath = req.body && typeof req.body.binaryPath === 'string'
            ? req.body.binaryPath.trim()
            : '';

        const validation = binaryLocator.validatePath(binaryPath);
        if (!validation.ok) {
            return res.status(400).json(errorBody(validation.reason));
        }

        // Smoke test — confirm it actually runs and reports a version.
        const smoke = await binaryLocator.smokeTest(validation.resolvedPath);
        if (!smoke.ok) {
            return res.status(400).json(errorBody(`Binary failed --version smoke test: ${smoke.reason}`));
        }

        try {
            const { db } = extensionHandle.import('data');
            await upsertSetupState(db, wallet, {
                binary_path: validation.resolvedPath,
                binary_version: smoke.version,
                // alpha.10: binary install advances into the bootstrap-or-genesis
                // choice card (was: straight to keystore). The wizard renders
                // Card B2; the operator's pick advances on to 'keystore' via
                // POST /setup/bootstrap below.
                current_step: 'bootstrap',
            });
            return res.json(successBody({
                resolvedPath: validation.resolvedPath,
                sizeBytes: validation.sizeBytes,
                version: smoke.version,
                versionOutput: smoke.output,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} /setup/binary error: ${err.message}`);
            return res.status(500).json(errorBody('Failed to persist setup state.'));
        }
    });

    /**
     * POST /setup/bootstrap  { choice: 'bootstrap' | 'genesis' }
     *
     * Records the operator's pick on Card B2 (fast-sync via snapshot, or
     * genesis sync from block 0) and advances the wizard to the keystore
     * card.
     *
     * This route does NOT trigger the download itself — the wizard hits
     * POST /chains/<id>/bootstrap directly so the existing progress UI
     * pattern (single-flight + SSE topic) works without setup-route
     * coupling. /setup/bootstrap is purely a step-transition + audit.
     */
    router.post('/bootstrap', limit('admin'), requireOwner, async (req, res) => {
        const wallet = readActorWallet(req);
        const choice = req.body && req.body.choice;
        if (choice !== 'bootstrap' && choice !== 'genesis') {
            return res.status(400).json(errorBody(
                'choice must be "bootstrap" or "genesis".',
            ));
        }
        try {
            const { db } = extensionHandle.import('data');
            // The choice itself isn't persisted to setup_state — the table
            // doesn't have a bootstrap_choice column yet and adding one
            // requires a migration we don't need for v1. The audit log
            // captures the action via the standard middleware.
            await upsertSetupState(db, wallet, {
                current_step: 'keystore',
            });
            return res.json(successBody({ choice, currentStep: 'keystore' }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} /setup/bootstrap error: ${err.message}`);
            return res.status(500).json(errorBody('Failed to persist setup state.'));
        }
    });

    /**
     * POST /setup/keystore  { password?: string, enableArbiter?: boolean }
     *
     * Generates a fresh keystore.dat by invoking ela-cli wallet create — same
     * exact command node.sh runs (build/skeleton/node.sh:1317). The operator
     * never has to touch a file path. If `password` is omitted, we generate a
     * 32-char random one and surface it back exactly once in the response;
     * the caller is responsible for showing it to the operator and offering
     * a download.
     *
     * Returns the resulting public key + address so the wizard can show the
     * producer identity for registration (Essentials mobile or server-side
     * `producer register v2`).
     */
    router.post('/keystore', limit('admin'), requireOwner, async (req, res) => {
        const wallet = readActorWallet(req);
        const body = req.body || {};
        const enableArbiter = body.enableArbiter !== false; // default to BPoS
        const password = typeof body.password === 'string' ? body.password : '';
        const ksStashPath = path.join(enmDataDir(), `.setup-keystore-${walletScopeId(wallet)}.json`);

        try {
            if (!enableArbiter) {
                // Full-node mode: no keystore needed, AND clear any stash
                // from a previous BPoS attempt — otherwise /setup/complete
                // would still see it and write enableArbiter=true into the
                // chain config.
                await fsp.unlink(ksStashPath).catch(() => {});
                const { db } = extensionHandle.import('data');
                await upsertSetupState(db, wallet, {
                    keystore_imported: 1,
                    current_step: 'network',
                });
                return res.json(successBody({ enableArbiter: false, keystoreImported: false }));
            }

            // Resolve ela-cli — first the in-memory downloader status
            // (fast path during a single install session), then the disk
            // (so a container restart doesn't break this step).
            const dl = ChainRegistry.getBinaryDownloader();
            const onDisk = await dl.getStatusWithDisk('mainchain');
            const cliPath = onDisk.cliPath;
            if (!cliPath) {
                return res.status(409).json(errorBody(
                    'ela-cli not yet installed. Complete the binary install step first.',
                ));
            }

            // beta.3.42 — if a keystore.dat already exists on disk AND
            // the operator didn't pass force=true, REUSE it instead of
            // generating a new one. Two paths reach this branch:
            //   1. Operator wiped chain data but kept the keystore
            //      (Chain Resync flow), then re-walked the wizard.
            //   2. Operator nuked + reinstalled, manually restored
            //      keystore.dat (today's flow on the test server).
            //
            // We still mark keystore_imported=1 in setup_state and
            // skip the "stash password" path because we don't HAVE
            // the password — the keystore was generated by a previous
            // wizard run that already showed + saved it. The dashboard's
            // node-identity tile reads keystore-account.json which the
            // earlier wizard run wrote alongside the keystore.
            const KEYSTORE_FILENAME = 'keystore.dat';
            const existingKeystore = path.join(chainDir('mainchain'), KEYSTORE_FILENAME);
            if (!body.force && fs.existsSync(existingKeystore)) {
                // 0.5.152 — BUG-K1 FIX (endpoint layer): validate the
                // operator-supplied password against the EXISTING keystore
                // before reusing it.
                //
                // Pre-0.5.152 this branch advanced the wizard on
                // keystore_imported=1 WITHOUT ever checking the password —
                // so a wrong password was accepted silently (operator
                // complaint: "I entered a wrong master password and it worked
                // lol"). The operator then believed they'd confirmed a
                // password the node never actually uses; the real password
                // (from the original wizard run) stays unknown to them AND to
                // /setup/complete, so BPoS signing later fails opaquely.
                //
                // ela-cli wallet account -p <pw> exits non-zero on a wrong
                // password, so EnmKeystoreService.readAccount() is a faithful
                // validity probe (read-only; does not disturb a running node —
                // node.sh itself runs `wallet account` right after create).
                //   - password supplied + correct → reuse, AND stash the
                //     now-verified envelope so /setup/complete can wire signing.
                //   - password supplied + wrong   → 400, do NOT advance.
                //   - password omitted            → can't validate; preserve
                //     the legacy reuse path but report validated:false.
                const ksReuse = ChainRegistry.getKeystoreService();
                let verified = null;
                if (password) {
                    try {
                        verified = await ksReuse.readAccount({ cliPath, password });
                    } catch (verifyErr) {
                        extensionHandle.log.warn(
                            `${ENM_LOG_PREFIX} /setup/keystore: supplied password rejected `
                            + `by existing keystore (${verifyErr.message}).`,
                        );
                        return res.status(400).json(errorBody(
                            'That password does not match this node\'s existing '
                            + 'keystore. Enter the master password you saved when '
                            + 'this node\'s key was first created, or replace the '
                            + 'keystore to start fresh.',
                        ));
                    }
                }

                extensionHandle.log.info(
                    `${ENM_LOG_PREFIX} /setup/keystore: reusing existing keystore at `
                    + `${existingKeystore} (force=false, password `
                    + `${password ? 'validated' : 'not supplied'})`,
                );

                // A validated password is the real one — stash its envelope
                // so /setup/complete wires mainchain.dpos.keystorePasswordEncrypted.
                // Without this, a reused-keystore install left the node unable
                // to sign because the envelope was never persisted.
                if (verified && password) {
                    try {
                        await atomicWrite(ksStashPath, JSON.stringify({
                            envelope: encrypt(password),
                            publicKey: verified.publicKey,
                            address: verified.address,
                        }), { mode: 0o600 });
                    } catch (stashErr) {
                        extensionHandle.log.warn(
                            `${ENM_LOG_PREFIX} /setup/keystore: failed to stash validated `
                            + `password envelope (${stashErr.message}) — reuse still proceeds.`,
                        );
                    }
                }

                // Cached identity file for the response (fallback when no
                // password was supplied to verify against).
                const identityPath = path.join(chainDir('mainchain'), 'keystore-account.json');
                let identity = null;
                try {
                    identity = JSON.parse(await fsp.readFile(identityPath, 'utf8'));
                } catch (_) { /* missing/unreadable — null is acceptable */ }
                const { db: db0 } = extensionHandle.import('data');
                await upsertSetupState(db0, wallet, {
                    keystore_imported: 1,
                    current_step: 'network',
                });
                return res.json(successBody({
                    enableArbiter: true,
                    keystoreImported: true,
                    reused: true,
                    validated: !!verified,
                    publicKey: (verified && verified.publicKey)
                        || (identity && identity.publicKey) || null,
                    address: (verified && verified.address)
                        || (identity && identity.address) || null,
                    // No generatedPassword — we did NOT generate a new keystore.
                    generatedPassword: null,
                }));
            }

            const ks = ChainRegistry.getKeystoreService();
            const result = await ks.create({
                cliPath,
                password: password || undefined,
                force: !!body.force,
            });

            // Encrypt + stash the password (consumed by /setup/complete).
            const envelope = encrypt(result.password);
            await atomicWrite(ksStashPath, JSON.stringify({
                envelope,
                publicKey: result.publicKey,
                address: result.address,
            }), { mode: 0o600 });

            // Cache the public identity (NOT the password) to a separate
            // file the dashboard's "node identity" tile can read without
            // a password. This file is NOT deleted by /setup/complete —
            // we want it to persist for the lifetime of the keystore.
            const identityPath = path.join(chainDir('mainchain'), 'keystore-account.json');
            await atomicWrite(identityPath, JSON.stringify({
                publicKey: result.publicKey,
                address: result.address,
                generatedAt: Date.now(),
            }), { mode: 0o600 });

            const { db } = extensionHandle.import('data');
            await upsertSetupState(db, wallet, {
                keystore_imported: 1,
                current_step: 'network',
            });

            return res.json(successBody({
                enableArbiter: true,
                keystoreImported: true,
                publicKey: result.publicKey,
                address: result.address,
                // Surfaced to the UI exactly once. The UI MUST prompt the
                // operator to save this — losing it means losing the
                // producer key permanently.
                generatedPassword: password ? null : result.password,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} /setup/keystore error: ${err.message}`);
            return res.status(500).json(errorBody('Could not save the keystore. Try again.'));
        }
    });

    /**
     * GET /setup/keystore/account
     *
     * Returns the current keystore's public key + address from the
     * cached keystore-account.json (written at /setup/keystore time).
     * No password needed because we store the public material in plain
     * JSON when we generate the keystore — the encrypted parts stay in
     * keystore.dat. Used by the dashboard's node-identity tile.
     */
    router.get('/keystore/account', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const ks = ChainRegistry.getKeystoreService();
            const exists = await ks.exists();
            if (!exists) {
                return res.json(successBody({ exists: false }));
            }
            const identityPath = path.join(chainDir('mainchain'), 'keystore-account.json');
            let publicKey = null;
            let address = null;
            try {
                const raw = await fsp.readFile(identityPath, 'utf8');
                const parsed = JSON.parse(raw);
                publicKey = parsed.publicKey || null;
                address = parsed.address || null;
            } catch (_) {
                // No cached identity — keystore was created by an older
                // build, or the file was deleted. The dashboard treats
                // missing pubkey as "regenerate not required, but we
                // can't show the producer identity right now."
            }
            return res.json(successBody({
                exists: true,
                keystorePath: ks.keystorePath(),
                publicKey,
                address,
            }));
        } catch (err) {
            return res.status(500).json(errorBody('Failed to read keystore status.'));
        }
    });

    /**
     * POST /setup/network  { mode: 'auto'|'manual', manualValue?: string }
     *
     * Records the IP override choice in enm_setup_state. /setup/complete reads
     * this and writes it into the chain config.
     */
    router.post('/network', limit('admin'), requireOwner, async (req, res) => {
        const wallet = readActorWallet(req);
        const body = req.body || {};
        const mode = body.mode === 'manual' ? 'manual' : 'auto';
        const manualValue = typeof body.manualValue === 'string' ? body.manualValue.trim() : '';

        try {
            // If mode=manual, validate the value here so we surface errors
            // before /setup/complete (which would otherwise reject via joi).
            if (mode === 'manual') {
                const validation = ExtIpResolver.validateOverride(manualValue);
                if (!validation.ok) {
                    return res.status(400).json(errorBody(validation.reason));
                }
            }
            const { db } = extensionHandle.import('data');
            await upsertSetupState(db, wallet, {
                current_step: 'confirm',
            });
            // Stash network choice — /setup/complete reads it.
            const stashPath = path.join(enmDataDir(), `.setup-network-${walletScopeId(wallet)}.json`);
            await atomicWrite(
                stashPath,
                JSON.stringify({ mode, manualValue: mode === 'manual' ? manualValue : null }),
                { mode: 0o600 },
            );
            return res.json(successBody({ mode, manualValue: mode === 'manual' ? manualValue : null }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} /setup/network error: ${err.message}`);
            return res.status(500).json(errorBody('Could not save network settings. Try again.'));
        }
    });

    /**
     * POST /setup/complete
     *
     * Final step. Reads the binary, keystore-envelope, and network choice
     * stashes; composes a chains.mainchain config; auto-generates a strong
     * RPC password (32-byte hex); writes the config; deletes the stashes.
     *
     * Does NOT start the chain — that's a separate explicit POST /chains/...
     * /start by the operator. v0.2 may add an optional auto-start flag.
     */
    router.post('/complete', limit('admin'), requireOwner, async (req, res) => {
        const wallet = readActorWallet(req);
        try {
            const { db } = extensionHandle.import('data');
            const stateRows = await db.read(
                `SELECT binary_path, binary_version FROM enm_setup_state WHERE wallet_address = ?`,
                [wallet],
            );
            const stateRow = (Array.isArray(stateRows) && stateRows[0]) || null;
            if (!stateRow || !stateRow.binary_path) {
                return res.status(409).json(errorBody(
                    'Cannot complete setup: binary path missing. Restart the wizard.',
                ));
            }

            // --- Read the keystore stash if BPoS, else null. ---
            const ksStashPath = path.join(enmDataDir(), `.setup-keystore-${walletScopeId(wallet)}.json`);
            let keystoreEnvelope = '';
            let enableArbiter = false;
            try {
                const ks = JSON.parse(await fsp.readFile(ksStashPath, 'utf8'));
                if (ks && typeof ks.envelope === 'string') {
                    keystoreEnvelope = ks.envelope;
                    enableArbiter = true;
                }
            } catch (err) {
                if (err.code !== 'ENOENT') {
                    extensionHandle.log.warn(
                        `${ENM_LOG_PREFIX} /setup/complete: keystore stash read failed: ${err.message}`,
                    );
                }
            }

            // --- Read the network stash. ---
            const netStashPath = path.join(enmDataDir(), `.setup-network-${walletScopeId(wallet)}.json`);
            let ipMode = 'auto';
            let ipManual = null;
            try {
                const net = JSON.parse(await fsp.readFile(netStashPath, 'utf8'));
                if (net && net.mode) ipMode = net.mode;
                if (net && net.manualValue) ipManual = net.manualValue;
            } catch (err) {
                if (err.code !== 'ENOENT') {
                    extensionHandle.log.warn(
                        `${ENM_LOG_PREFIX} /setup/complete: network stash read failed: ${err.message}`,
                    );
                }
            }

            // --- Generate a strong RPC password. The operator can override
            // it later via Settings → Mainchain Advanced. ---
            const rpcPasswordPlain = crypto.randomBytes(24).toString('hex');
            const rpcPasswordEnvelope = encrypt(rpcPasswordPlain);

            // --- Compose chains.mainchain config. Atomic read-modify-write
            // (P0-7) so a concurrent timer save can't clobber the wizard's
            // freshly-built mainchain config. ---
            await ConfigStore.update((cfg) => {
                cfg.chains = cfg.chains || {};
                cfg.chains.mainchain = {
                    enabled: true,
                    binaryPath: stateRow.binary_path,
                    binaryVersion: stateRow.binary_version || null,
                    // beta.0.5.0 — stamp install time so F8 suppresses
                    // version-drift proposals for 1h after install.
                    binaryInstalledAt: Date.now(),
                    dataDir: chainDir('mainchain'),
                    activeNet: 'mainnet',
                    ports: { ...ELA_DEFAULT_PORTS },
                    rpc: {
                        user: 'ela',
                        passwordEncrypted: rpcPasswordEnvelope,
                        whiteIPList: ['127.0.0.1'],
                    },
                    dpos: {
                        enableArbiter,
                        ipAddressMode: ipMode,
                        ipAddressManual: ipManual,
                        refreshOnRestart: true,
                        ownerPublicKey: '',
                        nodePublicKey: '',
                        keystorePasswordEncrypted: keystoreEnvelope,
                    },
                    memoryLimitMb: 4096,
                    archiveMode: false,
                    logLevel: 'info',
                };
                cfg.setup = cfg.setup || {};
                cfg.setup.completed = true;
                cfg.setup.completedAt = Date.now();
                cfg.setup.completedStep = 'complete';
            }, { logger: extensionHandle.log });

            // --- Mark setup-state row complete. ---
            const now = Date.now();
            await upsertSetupState(db, wallet, {
                completed: 1,
                config_generated: 1,
                current_step: 'complete',
                completed_at: now,
            });

            // --- Clean up stashes (best-effort — they're mode 0600 and would
            // be safe to leave, but tidy is better). ---
            await fsp.unlink(ksStashPath).catch(() => {});
            await fsp.unlink(netStashPath).catch(() => {});

            return res.json(successBody({
                completed: true,
                completedAt: now,
                enableArbiter,
            }));
        } catch (err) {
            extensionHandle.log.error(`${ENM_LOG_PREFIX} /setup/complete error: ${err.message}`);
            return res.status(500).json(errorBody('Could not complete setup. Try again.'));
        }
    });

    // beta.3.98 (Wave M3.4) — Layer 1 setup wizard endpoints.
    //
    // The Council operator answers two strategy questions BEFORE
    // installing the first non-mainchain chain:
    //   1. Password strategy: one EVM keystore password for all
    //      sidechains, or per-chain.
    //   2. Miner-address strategy: one Ethereum address for all chains,
    //      or per-chain.
    //
    // GET /setup/council-strategy returns the current state (or empty
    // object if not yet answered). POST persists answers. The M3.5
    // install wizard checks this state before any Class B install:
    // if either strategy is missing, the Layer 1 cards are shown first.

    router.get('/council-strategy', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const cfg = await ConfigStore.load();
            const c = (cfg.global && cfg.global.council) || {};
            // Don't echo the encrypted password back over the wire — the
            // operator never sees ciphertext in the UI, and exposing it
            // would let a read-only viewer attempt offline decryption.
            // Surface a `hasSharedPassword` bool instead.
            return res.json(successBody({
                passwordStrategy: c.passwordStrategy || null,
                hasSharedPassword: !!(c.sharedPasswordEncrypted),
                minerAddressStrategy: c.minerAddressStrategy || null,
                sharedMinerAddress: c.sharedMinerAddress || '',
                setupCompletedAt: c.setupCompletedAt || null,
            }));
        } catch (err) {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} GET /setup/council-strategy: ${err.message}`,
            );
            return res.status(500).json(errorBody('Failed to read Council strategy.'));
        }
    });

    router.post('/council-strategy', limit('admin'), requireOwner, async (req, res) => {
        try {
            const body = req.body || {};
            // Validate body + build the patch of resolved fields up front (none
            // of these checks depend on cfg) so the 400 early-returns stay at the
            // top level and a rejected request never touches the config file.
            const councilPatch = {};
            // Password strategy.
            if (body.passwordStrategy !== undefined) {
                const ps = String(body.passwordStrategy);
                if (!['shared', 'per-chain'].includes(ps)) {
                    return res.status(400).json(errorBody(
                        'passwordStrategy must be one of "shared" | "per-chain"',
                    ));
                }
                councilPatch.passwordStrategy = ps;
                if (ps === 'shared') {
                    // Require operator to supply the actual password so we
                    // can encrypt it now (per-chain installs reuse this
                    // ciphertext rather than re-prompting). H24: never
                    // store plaintext.
                    if (typeof body.sharedPassword !== 'string' || body.sharedPassword.length < 16) {
                        return res.status(400).json(errorBody(
                            'sharedPassword required (16+ chars) when passwordStrategy="shared". '
                            + 'Use EnmCrypto.generatePassword for a complexity-compliant random.',
                        ));
                    }
                    const EnmCrypto = require('../services/EnmCrypto');
                    if (!EnmCrypto.validatePasswordComplexity(body.sharedPassword)) {
                        return res.status(400).json(errorBody(
                            'sharedPassword fails complexity: must be 16+ chars with upper, lower, digit, non-alnum',
                        ));
                    }
                    councilPatch.sharedPasswordEncrypted = EnmCrypto.encrypt(body.sharedPassword);
                } else {
                    // Per-chain — clear any prior shared envelope.
                    councilPatch.sharedPasswordEncrypted = '';
                }
            }
            // Miner-address strategy.
            if (body.minerAddressStrategy !== undefined) {
                const ms = String(body.minerAddressStrategy);
                if (!['shared', 'per-chain'].includes(ms)) {
                    return res.status(400).json(errorBody(
                        'minerAddressStrategy must be one of "shared" | "per-chain"',
                    ));
                }
                councilPatch.minerAddressStrategy = ms;
                if (ms === 'shared') {
                    if (typeof body.sharedMinerAddress !== 'string' || body.sharedMinerAddress.length === 0) {
                        return res.status(400).json(errorBody(
                            'sharedMinerAddress required when minerAddressStrategy="shared"',
                        ));
                    }
                    const EnmCrypto = require('../services/EnmCrypto');
                    const v = EnmCrypto.validateEthAddress(body.sharedMinerAddress);
                    if (!v.valid) {
                        return res.status(400).json(errorBody(
                            `sharedMinerAddress: ${v.warning}`,
                        ));
                    }
                    councilPatch.sharedMinerAddress = v.normalized || body.sharedMinerAddress;
                } else {
                    councilPatch.sharedMinerAddress = '';
                }
            }
            // Atomic read-modify-write (P0-7). Merge the patch onto the freshly-
            // loaded council subdoc; capture the result via closure for the
            // response + log.
            let council;
            await ConfigStore.update((cfg) => {
                cfg.global = cfg.global || {};
                council = cfg.global.council || {};
                Object.assign(council, councilPatch);
                // Mark setup-complete when both strategies are set + at least
                // one of them was passed in this request (i.e. the operator
                // just finalized).
                if (council.passwordStrategy && council.minerAddressStrategy) {
                    council.setupCompletedAt = Date.now();
                }
                cfg.global.council = council;
            });
            extensionHandle.log.info(
                `${ENM_LOG_PREFIX} POST /setup/council-strategy saved: `
                + `password=${council.passwordStrategy} address=${council.minerAddressStrategy}`,
            );
            return res.json(successBody({
                passwordStrategy: council.passwordStrategy || null,
                hasSharedPassword: !!council.sharedPasswordEncrypted,
                minerAddressStrategy: council.minerAddressStrategy || null,
                sharedMinerAddress: council.sharedMinerAddress || '',
                setupCompletedAt: council.setupCompletedAt || null,
            }));
        } catch (err) {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} POST /setup/council-strategy: ${err.message}`,
            );
            return res.status(500).json(errorBody('Could not save Council strategy. Try again.'));
        }
    });

    // beta.3.99 (Wave M3.5) — Class B install endpoint. Creates the
    // cfg.chains.<chainId> entry for an EVM sidechain (ESC/EID/PG)
    // with the canonical port tuple, the operator-supplied (or shared)
    // miner address, and the encrypted EVM keystore password.
    //
    // PRE-REQUISITES (returns 412 on any miss):
    //   - cfg.global.council.passwordStrategy must be set (M3.4 wizard)
    //   - cfg.global.council.minerAddressStrategy must be set
    //   - When strategy='shared': the sharedPasswordEncrypted /
    //     sharedMinerAddress must be populated on cfg.global.council
    //
    // BINARY: M3.5 does NOT download the binary — that's M3.8. The
    // entry lands with binaryPath='' and enabled=false; the operator
    // runs the M3.8 download endpoint next to fetch + verify the
    // binary, then can flip enabled=true.
    //
    // Body shape:
    //   {
    //     chainId: 'esc' | 'eid' | 'pg',
    //     activeNet?: 'mainnet' | 'testnet',  // default 'mainnet'
    //     miner: {
    //       enabled?: boolean,                // default false
    //       rewardAddress?: string,           // required when strategy='per-chain'
    //       evmKeystoreAddr?: string,
    //       threads?: number,                 // default 1
    //     },
    //     evmKeystorePassword?: string,       // required when password strategy='per-chain'
    //     sync?: { mode?: 'fast'|'full'|'archive' },
    //   }
    router.post('/install-class-b', limit('admin'), requireOwner, async (req, res) => {
        try {
            const body = req.body || {};
            const ClassBPorts = require('../services/ClassBPorts');
            const EnmCrypto = require('../services/EnmCrypto');
            const chainId = String(body.chainId || '');
            if (!ClassBPorts.knownChainIds().includes(chainId)) {
                return res.status(400).json(errorBody(
                    `install-class-b: chainId must be one of ${ClassBPorts.knownChainIds().join('|')}, `
                    + `got "${chainId}".`,
                ));
            }
            const activeNet = body.activeNet === 'testnet' ? 'testnet' : 'mainnet';

            // Threads + sync.mode + EVM keystore-addr + sha256 validations are
            // body-only; resolve them up front so their 400s stay at the top
            // level. The council-derived resolution + idempotency check + assign
            // happen inside the atomic update() below (P0-7) against a fresh cfg.
            let evmKeystoreAddr = '';
            if (body.miner && body.miner.evmKeystoreAddr) {
                const v = EnmCrypto.validateEthAddress(String(body.miner.evmKeystoreAddr));
                if (!v.valid) {
                    return res.status(400).json(errorBody(
                        `miner.evmKeystoreAddr: ${v.warning}`,
                    ));
                }
                evmKeystoreAddr = v.normalized || body.miner.evmKeystoreAddr;
            }
            // Threads + sync.mode validations.
            let threads = 1;
            if (body.miner && Number.isInteger(body.miner.threads)) {
                if (body.miner.threads < 1 || body.miner.threads > 16) {
                    return res.status(400).json(errorBody('miner.threads must be integer in [1, 16]'));
                }
                threads = body.miner.threads;
            }
            // v0.5.235 — default + floor is FULL. Fast sync is removed; a
            // 'fast' request is accepted for backward-compat but coerced to
            // 'full' (EVM chains are always validator-grade full sync).
            let syncMode = 'full';
            if (body.sync && body.sync.mode) {
                if (!['fast', 'full', 'archive'].includes(body.sync.mode)) {
                    return res.status(400).json(errorBody(
                        'sync.mode must be one of full | archive',
                    ));
                }
                syncMode = (body.sync.mode === 'fast') ? 'full' : body.sync.mode;
            }
            const minerEnabled = body.miner && body.miner.enabled === true;
            // beta.0.4.1 (operator directive) — SHA256 manifest is
            // OPTIONAL for all Class B chains including PG. Original
            // M5.1 design made it required for PG; reverted because
            // (a) ESC/EID don't require it either, (b) operators
            // rarely have a trusted source for the hash, and (c) the
            // TLS-only posture is the default for every other binary.
            // If the operator passes binarySha256Expected, ENM still
            // honours it (PgAdapter.start verifies before spawn).
            let binarySha256Expected = '';
            if (typeof body.binarySha256Expected === 'string'
                && body.binarySha256Expected.length > 0) {
                if (!/^[0-9a-fA-F]{64}$/.test(body.binarySha256Expected)) {
                    return res.status(400).json(errorBody(
                        'binarySha256Expected: must be 64-char hex string',
                    ));
                }
                binarySha256Expected = body.binarySha256Expected.toLowerCase();
            }

            // Atomic read-modify-write (P0-7). The council-strategy + idempotency
            // preconditions and the per-chain reward/password validation read the
            // freshly-loaded cfg; on failure we stash the HTTP error and throw a
            // sentinel so update() aborts the write (nothing persisted).
            let chainCfg = null;
            let httpError = null;
            const savedCfg = await ConfigStore.update((cfg) => {
                const council = (cfg.global && cfg.global.council) || {};
                // Pre-requisite check 1 — Layer 1 strategy answered.
                if (!council.passwordStrategy || !council.minerAddressStrategy) {
                    httpError = { status: 412, body: errorBody(
                        'install-class-b: Council strategy not set. POST '
                        + '/api/enm/setup/council-strategy with passwordStrategy + '
                        + 'minerAddressStrategy before installing the first Class B chain.',
                    ) };
                    throw new SetupAbort();
                }
                // Pre-requisite check 2 — already-installed-chain idempotency.
                if (cfg.chains && cfg.chains[chainId]) {
                    httpError = { status: 409, body: errorBody(
                        `install-class-b: chain "${chainId}" is already configured. `
                        + 'Use the Settings tab on its pane to edit; uninstall first if you need to reset.',
                    ) };
                    throw new SetupAbort();
                }
                // Resolve miner.rewardAddress per strategy.
                let rewardAddress = '';
                const rewardAddressSource = council.minerAddressStrategy;
                if (council.minerAddressStrategy === 'shared') {
                    rewardAddress = council.sharedMinerAddress || '';
                    if (!rewardAddress) {
                        httpError = { status: 412, body: errorBody(
                            'install-class-b: minerAddressStrategy="shared" but sharedMinerAddress not set. '
                            + 'Re-run council-strategy with sharedMinerAddress populated.',
                        ) };
                        throw new SetupAbort();
                    }
                } else if ((body.miner && body.miner.rewardAddress) || body.miner === undefined) {
                    rewardAddress = String((body.miner && body.miner.rewardAddress) || '');
                    if (rewardAddress) {
                        const v = EnmCrypto.validateEthAddress(rewardAddress);
                        if (!v.valid) {
                            httpError = { status: 400, body: errorBody(
                                `miner.rewardAddress: ${v.warning}`,
                            ) };
                            throw new SetupAbort();
                        }
                        rewardAddress = v.normalized || rewardAddress;
                    }
                }
                // Resolve EVM keystore password envelope per strategy.
                let evmKeystorePasswordEncrypted = '';
                if (council.passwordStrategy === 'shared') {
                    evmKeystorePasswordEncrypted = council.sharedPasswordEncrypted || '';
                    if (!evmKeystorePasswordEncrypted) {
                        httpError = { status: 412, body: errorBody(
                            'install-class-b: passwordStrategy="shared" but sharedPasswordEncrypted not set. '
                            + 'Re-run council-strategy with sharedPassword supplied.',
                        ) };
                        throw new SetupAbort();
                    }
                } else if (typeof body.evmKeystorePassword === 'string' && body.evmKeystorePassword.length > 0) {
                    if (!EnmCrypto.validatePasswordComplexity(body.evmKeystorePassword)) {
                        httpError = { status: 400, body: errorBody(
                            'install-class-b: evmKeystorePassword fails complexity '
                            + '(16+ chars, upper + lower + digit + non-alnum required).',
                        ) };
                        throw new SetupAbort();
                    }
                    evmKeystorePasswordEncrypted = EnmCrypto.encrypt(body.evmKeystorePassword);
                }
                // Assemble the chain cfg block.
                const ports = ClassBPorts.portsFor(chainId, activeNet);
                chainCfg = {
                    enabled: false,           // operator flips after M3.8 binary download
                    binaryPath: '',           // filled by M3.8 install endpoint
                    binaryVersion: '',
                    // beta.0.5.0 — stamped when the binary download endpoint
                    // persists the resolved path/version (see M3.8 polling loop).
                    binaryInstalledAt: null,
                    activeNet,
                    ports,
                    pbft: {
                        usesMainchainKeystore: true,  // H23 invariant
                        ipAddress: null,              // EnmIpResolver fills at start
                    },
                    miner: {
                        enabled: !!minerEnabled,
                        rewardAddress,
                        rewardAddressSource,
                        evmKeystoreAddr,
                        evmKeystorePasswordEncrypted,
                        threads,
                    },
                    sync: { mode: syncMode },
                    bootnodes: [],
                    healing: { enabledRules: {} },
                    binarySha256Expected,   // empty for esc/eid; required for pg
                };
                cfg.chains = cfg.chains || {};
                cfg.chains[chainId] = chainCfg;
            }).catch((err) => {
                if (err instanceof SetupAbort) {
                    return null; // handled below via httpError
                }
                throw err;
            });
            if (httpError) {
                return res.status(httpError.status).json(httpError.body);
            }

            // Register the adapter immediately so listChains / overview pick
            // it up without waiting for a reboot.
            try {
                const ChainRegistry = require('../services/ChainRegistry');
                ChainRegistry.registerConfiguredAdapters({ cfg: savedCfg });
            } catch (err) {
                extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} install-class-b ${chainId}: post-install register failed: ${err.message}`,
                );
            }

            extensionHandle.log.info(
                `${ENM_LOG_PREFIX} install-class-b ${chainId} installed `
                + `(net=${activeNet}, miner=${minerEnabled ? 'on' : 'off'}, sync=${syncMode})`,
            );
            return res.json(successBody({
                chainId,
                chainCfg,
                next: 'POST /api/enm/setup/binary/' + chainId + ' to download the binary (M3.8)',
            }));
        } catch (err) {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} POST /setup/install-class-b: ${err.message}`,
            );
            return res.status(500).json(errorBody('Could not install the EVM sidechain. Try again.'));
        }
    });

    // beta.0.3.3 (Wave M4.3) — Node.js runtime endpoints. Oracles
    // (Class C) spawn against this interpreter; without it they can't
    // start. The wizard calls these in two steps:
    //   GET  /setup/node-runtime          → check if a usable node is present
    //   POST /setup/install-node-runtime  → download + install locally (idempotent)
    router.get('/node-runtime', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const NodeJsRuntime = require('../services/NodeJsRuntime');
            const found = await NodeJsRuntime.resolveAny();
            return res.json(successBody({
                pinnedVersion: NodeJsRuntime.PINNED_VERSION,
                minMajor: NodeJsRuntime.MIN_MAJOR,
                found: found ? {
                    path: found.path,
                    version: found.version.raw,
                    source: found.source,
                } : null,
            }));
        } catch (err) {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} GET /setup/node-runtime: ${err.message}`,
            );
            return res.status(500).json(errorBody('Failed to read node-runtime status.'));
        }
    });

    // beta.0.3.4 (Wave M4.4) — Class C (oracle) install endpoint.
    // Creates the cfg.chains.<oracle-id> entry once the parent EVM
    // sidechain is configured AND Node.js runtime is detected. Mirrors
    // install-class-b's prereq pattern.
    //
    // Body:
    //   {
    //     chainId: 'esc-oracle' | 'eid-oracle' | 'pg-oracle',
    //     scriptPath: string,          // absolute dir holding crosschain_*.js
    //     port?: number,               // default per chain (20632/20642/20672)
    //     activeNet?: 'mainnet'|'testnet',
    //   }
    router.post('/install-class-c', limit('admin'), requireOwner, async (req, res) => {
        try {
            const body = req.body || {};
            const chainId = String(body.chainId || '');
            const KNOWN = { 'esc-oracle': 'esc', 'eid-oracle': 'eid', 'pg-oracle': 'pg' };
            if (!KNOWN[chainId]) {
                return res.status(400).json(errorBody(
                    `install-class-c: chainId must be one of ${Object.keys(KNOWN).join('|')}, got "${chainId}".`,
                ));
            }
            const parentChainId = KNOWN[chainId];
            const activeNet = body.activeNet === 'testnet' ? 'testnet' : 'mainnet';
            const DEFAULT_PORTS = {
                'esc-oracle': activeNet === 'testnet' ? 21632 : 20632,
                'eid-oracle': activeNet === 'testnet' ? 21642 : 20642,
                'pg-oracle':  activeNet === 'testnet' ? 21672 : 20672,
            };
            const httpRpc = Number.isInteger(body.port) ? body.port : DEFAULT_PORTS[chainId];
            if (!Number.isInteger(httpRpc) || httpRpc < 1024 || httpRpc > 65535) {
                return res.status(400).json(errorBody('install-class-c: port must be 1024..65535'));
            }
            const scriptPath = String(body.scriptPath || '').trim();
            if (!scriptPath) {
                return res.status(400).json(errorBody(
                    'install-class-c: scriptPath is required (absolute path to directory '
                    + 'containing crosschain_*.js)',
                ));
            }

            // Atomic read-modify-write (P0-7). cfg-dependent preconditions +
            // the (async) Node.js runtime check run inside the mutator to
            // preserve exact ordering; failures stash an HTTP error and throw a
            // sentinel so update() aborts the write.
            const NodeJsRuntime = require('../services/NodeJsRuntime');
            let httpError = null;
            let runtime = null;
            const savedCfg = await ConfigStore.update(async (cfg) => {
                // Pre-req 1 — parent chain must be configured.
                if (!cfg.chains || !cfg.chains[parentChainId]) {
                    httpError = { status: 412, body: errorBody(
                        `install-class-c: parent chain "${parentChainId}" not configured. `
                        + `Install ${parentChainId} (M3.5) before installing its oracle.`,
                    ) };
                    throw new SetupAbort();
                }
                // Pre-req 2 — already-installed idempotency.
                if (cfg.chains[chainId]) {
                    httpError = { status: 409, body: errorBody(
                        `install-class-c: oracle "${chainId}" is already configured.`,
                    ) };
                    throw new SetupAbort();
                }
                // Pre-req 3 — Node.js runtime must be resolvable.
                runtime = await NodeJsRuntime.resolveAny();
                if (!runtime) {
                    httpError = { status: 412, body: errorBody(
                        'install-class-c: no Node.js runtime detected. POST '
                        + '/api/enm/setup/install-node-runtime first (M4.3) or '
                        + 'install Node.js v23.10.0 on the host.',
                    ) };
                    throw new SetupAbort();
                }
                // Compose cfg block.
                cfg.chains[chainId] = {
                    enabled: false,                  // operator flips after install
                    binaryPath: runtime.path,         // the node interpreter
                    binaryVersion: runtime.version.raw,
                    // beta.0.5.0 — stamp install time so F8 suppresses
                    // version-drift proposals for 1h after install.
                    binaryInstalledAt: Date.now(),
                    activeNet,
                    parentChainId,
                    scriptPath,
                    nodejsVersion: NodeJsRuntime.PINNED_VERSION,
                    ports: { httpRpc },
                    parent: { chainRpcUrl: '', mainchainRpcUrl: '' },
                    healing: { enabledRules: {} },
                };
            }).catch((err) => {
                if (err instanceof SetupAbort) {
                    return null; // handled below via httpError
                }
                throw err;
            });
            if (httpError) {
                return res.status(httpError.status).json(httpError.body);
            }
            // Register the adapter immediately so it appears in listChains.
            try {
                const ChainRegistry = require('../services/ChainRegistry');
                ChainRegistry.registerConfiguredAdapters({ cfg: savedCfg });
            } catch (err) {
                extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} install-class-c ${chainId}: registerConfiguredAdapters failed: ${err.message}`,
                );
            }
            extensionHandle.log.info(
                `${ENM_LOG_PREFIX} install-class-c ${chainId} installed `
                + `(parent=${parentChainId}, port=${httpRpc}, node=${runtime.version.raw} @ ${runtime.source})`,
            );
            return res.json(successBody({
                chainId,
                chainCfg: savedCfg.chains[chainId],
                next: 'POST /api/enm/chains/' + chainId + '/start to bring it online',
            }));
        } catch (err) {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} POST /setup/install-class-c: ${err.message}`,
            );
            return res.status(500).json(errorBody('Could not install the Oracle. Try again.'));
        }
    });

    // beta.0.3.11 (Wave M6.2+M6.3) — Class D (Arbiter) install endpoint.
    //
    // PRE-REQUISITES (returns 412 on any miss):
    //   - All 4 chains (mainchain + esc + eid + pg) must be configured.
    //   - mainchain.dpos.keystorePasswordEncrypted must be set (the
    //     Arbiter reuses it for its wallet — H8/H23 invariant).
    //
    // BODY:
    //   { miningAddress: string, sideChainPowFeeEla?: number,
    //     activeNet?: 'mainnet'|'testnet' }
    //
    // M6.3 NOTE: "Wallet create OR import" from plan §5 has only one
    // path in the M6 design — there's no separate Arbiter wallet to
    // create. The Arbiter signs WITH the mainchain producer keystore.
    // So this endpoint omits create/import — operator already created
    // the wallet during mainchain setup. The wizard's "wallet" card
    // in plan §5 reduces to "confirm mainchain wallet is the signer".
    router.post('/install-class-d', limit('admin'), requireOwner, async (req, res) => {
        try {
            const body = req.body || {};
            const EnmCrypto = require('../services/EnmCrypto');
            const ArbiterAdapter = require('../services/ArbiterAdapter');

            const activeNet = body.activeNet === 'testnet' ? 'testnet' : 'mainnet';
            // Atomic read-modify-write (P0-7). cfg-dependent preconditions +
            // body validations run inside the mutator (preserving order); a
            // failed precondition stashes an HTTP error and throws a sentinel so
            // update() aborts the write.
            let httpError = null;
            let miningAddress = '';
            const savedCfg = await ConfigStore.update((cfg) => {
                // Pre-req: all 4 chains configured (M6.1 helper).
                try {
                    ArbiterAdapter.preflightAllChainsConfigured(cfg.chains || {});
                } catch (e) {
                    httpError = { status: 412, body: errorBody(e.message) };
                    throw new SetupAbort();
                }
                // Idempotency.
                if (cfg.chains && cfg.chains.arbiter) {
                    httpError = { status: 409, body: errorBody(
                        'install-class-d: arbiter already configured.',
                    ) };
                    throw new SetupAbort();
                }
                // Mining address (ELA mainchain).
                miningAddress = String(body.miningAddress || '').trim();
                if (!miningAddress) {
                    httpError = { status: 400, body: errorBody(
                        'install-class-d: miningAddress is required (ELA mainchain address).',
                    ) };
                    throw new SetupAbort();
                }
                const v = EnmCrypto.validateElaAddress(miningAddress);
                if (!v.valid) {
                    httpError = { status: 400, body: errorBody(`miningAddress: ${v.warning}`) };
                    throw new SetupAbort();
                }
                const sideChainPowFeeEla = (typeof body.sideChainPowFeeEla === 'number'
                    && body.sideChainPowFeeEla >= 0 && body.sideChainPowFeeEla <= 100)
                    ? body.sideChainPowFeeEla : 0.1;

                // Canonical Arbiter ports per plan §14 (mainnet 20536/20538;
                // testnet 21536/21538 per H19 21xxx range).
                const ports = activeNet === 'testnet'
                    ? { rpc: 21536, p2p: 21538 }
                    : { rpc: 20536, p2p: 20538 };

                cfg.chains.arbiter = {
                    enabled: false,           // operator flips after install
                    binaryPath: '',           // M3.8-style download path; M6.7 lands binary
                    binaryVersion: '',
                    // beta.0.5.0 — stamped by the M3.8-style binary download
                    // path when arbiter binary actually lands.
                    binaryInstalledAt: null,
                    activeNet,
                    ports,
                    wallet: {
                        usesMainchainKeystore: true,           // H23 invariant
                        passwordSource: 'mainchain-ela-txt',
                    },
                    mining: {
                        miningAddress,
                        sideChainPowFeeEla,
                    },
                    crossChain: {
                        sideNodeList: [],                       // auto-populated at start
                        syncIntervalMs: 1000,                   // plan §14
                    },
                    healing: { enabledRules: {} },
                };
            }).catch((err) => {
                if (err instanceof SetupAbort) {
                    return null; // handled below via httpError
                }
                throw err;
            });
            if (httpError) {
                return res.status(httpError.status).json(httpError.body);
            }
            try {
                const ChainRegistry = require('../services/ChainRegistry');
                ChainRegistry.registerConfiguredAdapters({ cfg: savedCfg });
            } catch (err) {
                extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} install-class-d: registerConfiguredAdapters failed: ${err.message}`,
                );
            }
            extensionHandle.log.info(
                `${ENM_LOG_PREFIX} install-class-d arbiter installed `
                + `(net=${activeNet}, mining=${miningAddress.slice(0, 10)}...)`,
            );
            return res.json(successBody({
                chainId: 'arbiter',
                chainCfg: savedCfg.chains.arbiter,
                next: 'POST /api/enm/setup/install/arbiter to download the binary',
            }));
        } catch (err) {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} POST /setup/install-class-d: ${err.message}`,
            );
            return res.status(500).json(errorBody('Could not install the Arbiter. Try again.'));
        }
    });

    // GET /api/enm/setup/install-council/preflight — environment +
    // network readiness gate for Card 5 (Confirm + install). Each check
    // returns { id, label, ok, message, severity }. Card 5 renders them
    // as a checklist; Install everything stays disabled until every
    // required check is green.
    //
    // Checks (chain-state checks live in the orchestrator runStep
    // handlers, NOT here — preflight is environment/network only):
    //   - disk-space               (≥ 220 GB free in enmDataDir; v0.5.199)
    //   - github-reachable         (HEAD raw.githubusercontent.com)
    //   - elastos-downloads        (HEAD download.elastos.io)
    //   - node-data-reachable      (HEAD node-data.elastos.io)
    //   - nodejs-reachable         (HEAD nodejs.org/dist, recommended)
    //
    // Cheap probes — each has a short timeout. Total <5s on a healthy
    // host. Cached for 30s so repeated polls from the wizard don't
    // hammer upstream.
    router.get('/install-council/preflight', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        try {
            const result = await runCouncilPreflight({ extensionHandle });
            return res.json(successBody(result));
        } catch (err) {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} install-council/preflight: ${err.message}`,
            );
            return res.status(500).json(errorBody('Council install preflight failed. Try again.'));
        }
    });

    // beta.0.4.4 — POST /api/enm/setup/install-council — single
    // orchestrator endpoint that runs the full Council install
    // sequence (Layer 1 strategy → ESC + EID + PG cfg+binary → Node
    // runtime → oracle scripts → 3 Class C cfg + Class D cfg + start
    // every chain) in the background. Emits SSE on the topic
    // `setup:council:install` with per-step { step, total, status,
    // message, percent } so the Card F stepper in the wizard renders
    // real progress (operator directive 2026-05-18: no spinners; every
    // destructive/long action must show step-by-step progress).
    //
    // BODY:
    //   { sharedPassword:        '<16+ chars complexity-compliant>',
    //     sharedRewardAddress:   '0x<40 hex>',
    //     arbiterMiningAddress:  'E<33 base58>',
    //     activeNet:             'mainnet' | 'testnet' (default mainnet) }
    //
    // PRE-REQUISITES:
    //   - mainchain must be configured + binary installed (Card D
    //     completes mainchain before this endpoint is callable).
    //   - mainchain.dpos.keystorePasswordEncrypted must be set
    //     (Arbiter reuses it; Class B sidechains reuse the wallet via
    //     stdin pipe at start time — but this endpoint doesn't gate on
    //     keystore presence because Layer 1 strategy can be 'shared'
    //     with a per-chain password instead).
    //
    // IDEMPOTENCY: every sub-step checks if already done (skip + emit
    // a 'skip' event). Operator can re-run on failure; partial state
    // resumes from the failing step.
    //
    // ERROR HANDLING: each sub-step's failure emits 'error' event then
    // re-throws; the background job logs + sets a sticky failure
    // status the GET endpoint surfaces. Operator's wizard sees the
    // failure step + retries from that step (no full re-run needed).
    router.post('/install-council', limit('admin'), requireOwner, async (req, res) => {
        const body = req.body || {};
        const EnmCrypto = require('../services/EnmCrypto');

        // beta.0.4.10 — body shape (v0.4.7+ redesigned wizard):
        //   { masterPassword, rewardAddress, sharedRewardAddress?,
        //     useSnapshots?, activeNet? }
        //
        // Card 3 generates masterPassword client-side; Card 4 validates
        // rewardAddress; Card 5 toggles useSnapshots. The orchestrator's
        // first runStep (council-strategy) writes the encrypted master
        // password to cfg.global.council.masterPasswordEncrypted and the
        // install-mainchain-keystore step decrypts it to create
        // keystore.dat. No mainchain pre-existence required.
        //
        // Back-compat: pre-0.4.7 callers passed `sharedPassword` instead
        // of `masterPassword` — orchestrator (council-strategy step)
        // already falls back to that. If neither is set, we derive from
        // the existing mainchain envelope when one is present (a
        // resume-from-failure path).
        const rewardAddress = body.rewardAddress || body.sharedRewardAddress || '';
        const rewardCheck = EnmCrypto.validateEthAddress(rewardAddress);
        if (!rewardCheck.valid) {
            return res.status(400).json(errorBody(
                `install-council: rewardAddress: ${rewardCheck.warning}`,
            ));
        }
        const activeNet = body.activeNet === 'testnet' ? 'testnet' : 'mainnet';

        // Resolve the master password from one of three sources, in
        // priority order:
        //   1. body.masterPassword          — Card 3 (current wizard)
        //   2. body.sharedPassword          — pre-0.4.7 callers
        //   3. cfg.chains.mainchain.dpos.keystorePasswordEncrypted
        //                                   — resume path on a host where
        //                                     mainchain was installed by
        //                                     a previous wizard run
        // If none of the above yield a password, 412 — the wizard has
        // a bug we want surfaced loudly.
        const cfg = await ConfigStore.load();
        let masterPassword = body.masterPassword || body.sharedPassword || '';
        if (!masterPassword
            && cfg.chains && cfg.chains.mainchain
            && cfg.chains.mainchain.dpos
            && cfg.chains.mainchain.dpos.keystorePasswordEncrypted) {
            try {
                masterPassword = EnmCrypto.decrypt(
                    cfg.chains.mainchain.dpos.keystorePasswordEncrypted,
                );
            } catch (_) { /* leave masterPassword empty — handled below */ }
        }
        if (!masterPassword) {
            return res.status(412).json(errorBody(
                'install-council: masterPassword missing. The wizard\'s '
                + 'Card 3 must POST the operator-generated password in '
                + 'the request body. If you reached this directly, send '
                + '{ masterPassword: \'<32-char string>\', rewardAddress }.',
            ));
        }
        const sharedPassword = masterPassword;  // legacy alias for the orchestrator

        // v0.5.236 — persist the operator's initial-sync strategy (Card 5
        // hardware-tier choice). 'staged' tells EnmAutoStart to bring the
        // heavy chains up 2-at-a-time via EnmStageSyncOrchestrator so a
        // lower-end host isn't crushed by simultaneous EVM full-syncs.
        // Default 'concurrent' = legacy all-at-once. Written before the
        // orchestrator + first autoStart so it's in place when chains boot.
        const syncStrategy = body.syncStrategy === 'staged' ? 'staged' : 'concurrent';
        try {
            await ConfigStore.update((c) => {
                c.global = c.global || {};
                c.global.syncStrategy = syncStrategy;
            }, { logger: extensionHandle.log });
        } catch (err) {
            extensionHandle.log.warn(
                `${ENM_LOG_PREFIX} install-council: failed to persist syncStrategy `
                + `(${err.message}) — defaulting to concurrent`,
            );
        }

        // Return 202 immediately + run the orchestrator in the background.
        res.status(202).json(successBody({
            started: true,
            syncStrategy,
            sseTopic: 'setup:council:install',
            statusEndpoint: '/api/enm/setup/install-council/status',
        }));

        let sseHub = null;
        try {
            const ChainRegistry = require('../services/ChainRegistry');
            sseHub = ChainRegistry.getSseHub();
        } catch (_) { /* SSE optional */ }

        // beta.0.4.7 — Council install always covers all 4 chains +
        // all 3 oracles (operator directive 2026-05-19); the prior
        // PG opt-in is gone. Operator can choose to skip snapshot
        // downloads via useSnapshots=false (default: true).
        const useSnapshots = body.useSnapshots !== false;
        // masterPassword + sharedPassword are already resolved at the
        // top of this handler (body → cfg-fallback). Reuse them here.

        // 0.5.145 audit Session 145 — capture the actor wallet here so
        // the orchestrator's final start-chains step can mirror the
        // BPoS flow and write completed=1 into the enm_setup_state DB
        // row (the row /setup/state reads). Pre-0.5.145 the orchestrator
        // only wrote cfg.setup.completed=true to ConfigStore (cfg.json)
        // — operator finished setup, refreshed, GET /setup/state hit the
        // DB row (still completed=0), boot path re-mounted the wizard.
        const installerWallet = readActorWallet(req);
        runCouncilInstall({
            extensionHandle,
            cfg,
            inputs: {
                // beta.0.4.7 — masterPassword is the new authoritative
                // field. sharedPassword remains for downstream code
                // that hasn't been migrated yet.
                masterPassword,
                sharedPassword,
                sharedRewardAddress:  rewardCheck.normalized || body.rewardAddress,
                // BUG-C9 (v0.5.158) — the arbiter's mining.miningAddress must be
                // an ELA mainchain address (base58check), NOT the EVM 0x reward
                // address. Historically this defaulted to rewardAddress, so the
                // arbiter binary refused to start ("mining.miningAddress: not a
                // valid ELA address ... got 0x..."). Pass through only an
                // explicit ELA address here; when absent the install-arbiter-cfg
                // step derives the operator's own ELA address from the mainchain
                // keystore identity (keystore-account.json).
                arbiterMiningAddress: (body.arbiterMiningAddress || '').trim(),
                activeNet,
                useSnapshots,
            },
            sseHub,
            wallet: installerWallet,
        }).catch((err) => {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} install-council orchestrator crashed: ${err.message}`,
            );
        });
    });

    // beta.0.4.4 — GET /api/enm/setup/install-council/status —
    // expose the orchestrator's current job state. The wizard polls
    // this as a fallback when SSE isn't connected; SSE is the
    // primary live channel.
    router.get('/install-council/status', limit('read'), async (req, res) => {
        if (!readActorWallet(req)) {
            return res.status(401).json(errorBody('Authentication required.'));
        }
        const state = getCouncilInstallState();
        return res.json(successBody(state));
    });

    router.post('/install-node-runtime', limit('admin'), requireOwner, async (req, res) => {
        try {
            const NodeJsRuntime = require('../services/NodeJsRuntime');
            const result = await NodeJsRuntime.installLocal({
                onProgress: (msg) => extensionHandle.log.info(
                    `${ENM_LOG_PREFIX} node-runtime install: ${msg}`,
                ),
            });
            return res.json(successBody({
                path: result.path,
                version: result.version.raw,
            }));
        } catch (err) {
            extensionHandle.log.error(
                `${ENM_LOG_PREFIX} POST /setup/install-node-runtime: ${err.message}`,
            );
            return res.status(500).json(errorBody('Could not install the Node.js runtime. Try again.'));
        }
    });

    return router;
}

// walletScopeId + validateKeystorePath are imported from EnmSetupHelpers so
// they can be unit-tested without pulling Express into the test environment.

// Maximum tolerated host-vs-server clock skew before DPoS signing windows
// start rejecting (the chain itself enforces ~4.2s; we warn well below that
// so the operator has time to fix NTP before they get penalized).
const CLOCK_SKEW_MAX_MS = 2000;

// Hard outer timeout for the entire clock-skew probe. ClockSkewChecker has
// its own per-endpoint timeout (5s default × 3 endpoints), but if the host
// is in a captive portal that hangs all 3 we still want preflight to return
// promptly. Fail-soft on expiry — the wizard surfaces the skip reason and
// the operator can proceed.
const CLOCK_SKEW_OUTER_TIMEOUT_MS = 5000;

/**
 * Runs the clock-skew probe with a hard outer timeout AND fail-soft semantics.
 * The wizard MUST never get stuck on this step — if the probe can't complete
 * for any reason (no internet, captive portal, DNS failure, etc.), we return
 * a skipped result and let the operator continue with a yellow warning.
 *
 * @param {object} extensionHandle
 * @returns {Promise<object>} preflight-shaped result for the wizard
 */
async function runClockSkewCheck(extensionHandle) {
    try {
        const probe = ClockSkewChecker.check({ timeoutMs: CLOCK_SKEW_OUTER_TIMEOUT_MS });
        let timer;
        const timeoutPromise = new Promise((resolve) => {
            timer = setTimeout(() => resolve({
                ok: false,
                reason: `clock-skew probe exceeded ${CLOCK_SKEW_OUTER_TIMEOUT_MS}ms`,
            }), CLOCK_SKEW_OUTER_TIMEOUT_MS);
            if (timer && typeof timer.unref === 'function') { timer.unref(); }
        });
        const probeResult = await Promise.race([probe, timeoutPromise]);
        clearTimeout(timer);

        if (!probeResult || probeResult.ok !== true) {
            // Probe couldn't reach any endpoint — fail-soft so the wizard
            // can proceed. The UI renders a YELLOW warning telling the
            // operator to check NTP if they suspect host clock drift.
            return {
                ok: true,
                skipped: true,
                reason: (probeResult && probeResult.reason) || 'network unreachable',
                maxSkewMs: CLOCK_SKEW_MAX_MS,
            };
        }

        const skewMs = Number.isFinite(probeResult.skewMs) ? probeResult.skewMs : 0;
        const absSkewMs = Math.abs(skewMs);
        return {
            ok: absSkewMs <= CLOCK_SKEW_MAX_MS,
            skipped: false,
            skewMs,
            absSkewMs,
            maxSkewMs: CLOCK_SKEW_MAX_MS,
            source: probeResult.endpoint || null,
            rtt: probeResult.rtt || null,
        };
    } catch (err) {
        // Defence in depth — any unexpected throw from the probe is treated
        // as a skip, NEVER as a wizard blocker.
        extensionHandle.log.warn(
            `${ENM_LOG_PREFIX} clock-skew probe threw: ${err && err.message ? err.message : err}`,
        );
        return {
            ok: true,
            skipped: true,
            reason: 'probe error',
            maxSkewMs: CLOCK_SKEW_MAX_MS,
        };
    }
}

/**
 * Insert-or-update enm_setup_state for a wallet. Builds dynamic SQL from the
 * provided fields so Phase 5 can extend without rewriting.
 *
 * @param {object} db
 * @param {string} walletAddress
 * @param {object} fields
 */
async function upsertSetupState(db, walletAddress, fields) {
    const now = Date.now();
    const existing = await db.read(
        `SELECT 1 FROM enm_setup_state WHERE wallet_address = ?`,
        [walletAddress],
    );

    if (Array.isArray(existing) && existing.length > 0) {
        const setParts = [];
        const args = [];
        for (const [k, v] of Object.entries(fields)) {
            setParts.push(`${k} = ?`);
            args.push(v);
        }
        setParts.push('updated_at = ?');
        args.push(now);
        args.push(walletAddress);
        await db.write(
            `UPDATE enm_setup_state SET ${setParts.join(', ')} WHERE wallet_address = ?`,
            args,
        );
        return;
    }

    // First insert — fill required defaults.
    const cols = ['wallet_address', 'started_at', 'updated_at'];
    const vals = [walletAddress, now, now];
    for (const [k, v] of Object.entries(fields)) {
        cols.push(k);
        vals.push(v);
    }
    const placeholders = cols.map(() => '?').join(', ');
    await db.write(
        `INSERT INTO enm_setup_state (${cols.join(', ')}) VALUES (${placeholders})`,
        vals,
    );
}

// ============================================================
// beta.0.4.4 — Council install orchestrator
// ============================================================

/**
 * In-memory state for the install-council job. There's only ever one
 * running at a time per ENM process (single Council operator per
 * install), so a module-level singleton is fine. Wizard fetches via
 * GET /install-council/status; SSE drives live updates.
 */
let _councilInstallState = {
    running: false,
    startedAt: null,
    finishedAt: null,
    success: false,
    error: null,
    currentStep: null,    // string label of the current step
    completedSteps: [],   // array of step labels that succeeded
    totalSteps: 0,
};

function getCouncilInstallState() {
    return Object.assign({}, _councilInstallState, {
        completedSteps: _councilInstallState.completedSteps.slice(),
    });
}

/**
 * Run the full Council install pipeline.
 *
 * Steps (idempotent — each checks if already done):
 *   1.  POST council-strategy (Layer 1: shared password + reward)
 *   2.  install-class-b esc  + binary download
 *   3.  install-class-b eid  + binary download
 *   4.  install-class-b pg   + binary download (operator may opt-out
 *       in a future flag; for v0.4.4 we install all 3)
 *   5.  install-node-runtime (skip if host has Node 18+)
 *   6.  download oracle scripts (ESC + EID + PG)
 *   7.  install-class-c esc-oracle
 *   8.  install-class-c eid-oracle
 *   9.  install-class-c pg-oracle
 *   10. install-class-d arbiter + arbiter binary
 *   11. start mainchain + esc + eid + pg + arbiter + 3 oracles
 *
 * @param {object} args
 * @param {object} args.extensionHandle
 * @param {object} args.cfg                   pre-loaded ConfigStore.load()
 * @param {object} args.inputs                { sharedPassword, sharedRewardAddress, arbiterMiningAddress, activeNet }
 * @param {object|null} args.sseHub
 * @param {string|null} args.wallet           operator wallet (from readActorWallet),
 *                                            used by the final start-chains step to
 *                                            upsert completed=1 into enm_setup_state
 *                                            so /setup/state returns completed=true
 *                                            on the next boot (see S145 audit notes).
 */
async function runCouncilInstall(args) {
    const { extensionHandle, inputs, sseHub, wallet } = args;
    const log = extensionHandle.log;
    const EnmCrypto = require('../services/EnmCrypto');
    const ClassBPorts = require('../services/ClassBPorts');
    const NodeJsRuntime = require('../services/NodeJsRuntime');
    const OracleScriptDownloader = require('../services/OracleScriptDownloader');
    const ChainRegistry = require('../services/ChainRegistry');

    if (_councilInstallState.running) {
        throw new Error('install-council: another job is already running');
    }

    // beta.0.4.7 — Council ALWAYS installs all 4 chains + 3 oracles.
    // Operator directive 2026-05-19: "Optional add-ons dont do that,
    // council needs to run it all." PG oracle is now auto-downloadable
    // from download.elastos.io (same posture as ESC/EID), so the prior
    // PG opt-in escape hatch is gone.
    //
    // STEP `download-snapshots-parallel` runs BEFORE binary download.
    // v0.5.199 — mainchain only (~10 GB compressed). Pre-v0.5.199 this
    // shipped snapshots for all 4 chains (~50 GB compressed); EVM
    // chains now cold-sync from peers because the upstream EVM tarballs
    // embed a duplicate nodekey (cycle-13 lockup). Step name kept for
    // SSE topic stability; effectively single-chain now. The mainchain
    // tarball streams while the operator is still on the wizard's
    // Card D, before any chain process starts. EnmSnapshotDownloader
    // is idempotent — already-populated data dirs are left alone.
    //
    // beta.0.4.6 — ESC/EID/PG/Arbiter binaries download IN PARALLEL
    // via `install-binaries-parallel` (one step covering all 4). Cuts
    // wall time from ~4 min serial to ~1 min. Per-binary progress is
    // multiplexed into the same step message.
    // v0.4.7.1 — three mainchain steps inserted ahead of the sidechain
    // cfg writes. The old flow assumed mainchain was ALREADY installed
    // (Cards B/C/D of pre-0.4.7 did that work), but the redesigned 7-card
    // wizard generates the master password on Card 3 and then the Card 6
    // orchestrator owns everything — including the mainchain binary,
    // keystore, and cfg. Each new step is idempotent so re-running the
    // orchestrator after a partial run skips work already on disk.
    const PLAN = [
        'council-strategy',
        'install-mainchain-binary',     // v0.4.7.1
        'install-mainchain-keystore',   // v0.4.7.1
        'install-mainchain-cfg',        // v0.4.7.1
        'install-esc-cfg',
        'install-eid-cfg',
        'install-pg-cfg',
        'download-snapshots-parallel',
        'install-binaries-parallel',
        'install-node-runtime',
        'download-oracle-scripts',
        'install-esc-oracle',
        'install-eid-oracle',
        'install-pg-oracle',
        'install-arbiter-cfg',
        'start-chains',
    ];

    _councilInstallState = {
        running: true,
        startedAt: Date.now(),
        finishedAt: null,
        success: false,
        error: null,
        currentStep: null,
        completedSteps: [],
        totalSteps: PLAN.length,
    };

    function emit(step, status, message) {
        const payload = {
            step,
            status,                          // 'start' | 'skip' | 'done' | 'error'
            message: message || '',
            total: PLAN.length,
            completed: _councilInstallState.completedSteps.length,
            percent: Math.round(
                (_councilInstallState.completedSteps.length / PLAN.length) * 100,
            ),
            ts: Date.now(),
        };
        if (sseHub && typeof sseHub.publish === 'function') {
            try { sseHub.publish('setup:council:install', payload); }
            catch (_) { /* SSE best-effort */ }
        }
        log.info(`${ENM_LOG_PREFIX} install-council ${step}: ${status}`
            + (message ? ` — ${message}` : ''));
    }

    async function runStep(step, fn) {
        _councilInstallState.currentStep = step;
        emit(step, 'start');
        try {
            const r = await fn();
            _councilInstallState.completedSteps.push(step);
            emit(step, r && r.skipped ? 'skip' : 'done', r && r.message);
            return r;
        } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            emit(step, 'error', msg);
            _councilInstallState.error = `${step}: ${msg}`;
            throw err;
        }
    }

    try {
        // ---- STEP 1 — Layer 1 council strategy ----
        await runStep('council-strategy', async () => {
            // Atomic read-modify-write (P0-7). Idempotency short-circuit throws a
            // sentinel so update() aborts the write when the strategy is already
            // set (no needless no-op save).
            let skipped = false;
            await ConfigStore.update((cfg2) => {
                cfg2.global = cfg2.global || {};
                const c = cfg2.global.council = cfg2.global.council || {};
                if (c.passwordStrategy === 'shared'
                    && c.minerAddressStrategy === 'shared'
                    && (c.masterPasswordEncrypted || c.sharedPasswordEncrypted)
                    && c.sharedMinerAddress) {
                    skipped = true;
                    throw new SetupAbort();
                }
                c.passwordStrategy = 'shared';
                // beta.0.4.7 — master password covers ALL chain keystores
                // (mainchain DPoS signer + ESC/EID/PG EVM keystores +
                // Arbiter wallet). `sharedPasswordEncrypted` is kept for
                // backward-compat with v0.4.6 configs; both envelopes are
                // populated to the SAME ciphertext for now. A future
                // cleanup release can drop `sharedPasswordEncrypted` once
                // every downstream reader has migrated.
                const masterPlain = inputs.masterPassword || inputs.sharedPassword;
                const masterEnvelope = EnmCrypto.encrypt(masterPlain);
                c.masterPasswordEncrypted = masterEnvelope;
                c.sharedPasswordEncrypted = masterEnvelope; // back-compat
                c.minerAddressStrategy = 'shared';
                c.sharedMinerAddress = inputs.sharedRewardAddress;
                c.setupCompletedAt = Date.now();
            }).catch((err) => {
                if (err instanceof SetupAbort) { return null; }
                throw err;
            });
            if (skipped) {
                return { skipped: true, message: 'already set' };
            }
            return { message: 'shared strategy saved' };
        });

        // ---- v0.4.7.1 STEP A — Mainchain binary (ela + ela-cli) ----
        // Pre-0.4.7.1 the orchestrator assumed mainchain was already on
        // disk because Cards B/C/D ran first. The 7-card wizard removed
        // those intermediate cards, so the orchestrator must download
        // the mainchain binary itself. EnmBinaryDownloader is the same
        // single-flight component the parallel-binaries step uses for
        // ESC/EID/PG/Arbiter — we just kick off one chainId instead of
        // four. Idempotency: if cfg.chains.mainchain.binaryPath already
        // points to an extant file we skip; otherwise we start (or
        // adopt an already-running download) and block on the existing
        // waitForBinaryInstall poller. Failures bubble with the
        // downloader's error string so the operator sees a real cause
        // in the stepper.
        await runStep('install-mainchain-binary', async () => {
            const cfgInit = await ConfigStore.load();
            if (cfgInit.chains && cfgInit.chains.mainchain
                && cfgInit.chains.mainchain.binaryPath
                && fs.existsSync(cfgInit.chains.mainchain.binaryPath)) {
                return { skipped: true, message: 'Main chain binary already installed' };
            }
            const dl = ChainRegistry.getBinaryDownloader();
            // dl.start returns { alreadyRunning, status } and never
            // throws on single-flight reentry — the only failure path
            // here is a synchronous "unknown chain" which can't happen
            // for mainchain. Defensive try/catch matches the parallel
            // step's style for symmetry.
            try { await dl.start('mainchain'); }
            catch (err) {
                if (!/already.*running/i.test(err && err.message || '')) { throw err; }
            }
            const status = await waitForBinaryInstall(dl, 'mainchain', log);
            return {
                message: `ela${status && status.cliPath ? ' + ela-cli' : ''} installed`
                    + (status && status.version ? ` (${status.version})` : ''),
            };
        });

        // ---- v0.4.7.1 STEP B — Mainchain keystore.dat ----
        // Mirrors POST /setup/keystore: resolves ela-cli via
        // EnmBinaryDownloader.getStatusWithDisk (in-memory first, disk
        // fallback for after a container restart), then invokes
        // EnmKeystoreService.create which shells ela-cli with the
        // master password the operator picked on Card 3. We caches the
        // public identity (publicKey + address) to keystore-account.json
        // so the dashboard's node-identity tile can read it without a
        // password — same file /setup/keystore writes.
        //
        // NOTE: we do NOT stash the password to .setup-keystore-<wallet>.json.
        // That stash is the BPoS flow's mechanism for /setup/complete to
        // pick up the password later. The Council flow already has the
        // master password ciphertext sitting in
        // cfg.global.council.masterPasswordEncrypted (written by the
        // council-strategy step earlier in this PLAN), so we can pass
        // it directly to the cfg writer in Step C.
        await runStep('install-mainchain-keystore', async () => {
            const EnmEncryption = require('../services/EnmEncryption');
            const cfgInit = await ConfigStore.load();
            const council = cfgInit.global && cfgInit.global.council;
            if (!council || !council.masterPasswordEncrypted) {
                throw new Error(
                    'master password not yet stored — council-strategy step should have written '
                    + 'cfg.global.council.masterPasswordEncrypted before this step ran',
                );
            }
            let plaintext;
            try { plaintext = EnmEncryption.decrypt(council.masterPasswordEncrypted); }
            catch (err) {
                throw new Error('cannot decrypt master password envelope: ' + err.message);
            }

            // Idempotency: if keystore.dat is already on disk we reuse it
            // rather than re-create (force=false would throw; force=true
            // would replace + lose the producer key). BUT we must first
            // confirm the master password the operator entered THIS run
            // actually unlocks that existing keystore.
            //
            // 0.5.152 — BUG-K1 FIX (app-flow layer). Pre-0.5.152 this step
            // skipped silently on an existing keystore and trusted the typed
            // password matched. On a re-install where the operator typed the
            // WRONG existing password (Card 3 _renderCard3ExistingKeystore
            // accepts any 8–64 char string with NO verification), that wrong
            // password was then encrypted into
            // cfg.chains.mainchain.dpos.keystorePasswordEncrypted (and every
            // sidechain via H23). The node started, ela failed to unlock
            // keystore.dat, and the only signal was an opaque F1 alert long
            // after the wizard reported success — exactly the operator's
            // "wrong password worked" complaint. Validate here so a wrong
            // password fails the install step with a clear message instead.
            const KEYSTORE_FILENAME = 'keystore.dat';
            const existingKeystore = path.join(chainDir('mainchain'), KEYSTORE_FILENAME);
            if (fs.existsSync(existingKeystore)) {
                const dlChk = ChainRegistry.getBinaryDownloader();
                const onDiskChk = await dlChk.getStatusWithDisk('mainchain');
                const cliPathChk = onDiskChk && onDiskChk.cliPath;
                if (cliPathChk) {
                    try {
                        await ChainRegistry.getKeystoreService()
                            .readAccount({ cliPath: cliPathChk, password: plaintext });
                    } catch (verifyErr) {
                        extensionHandle.log.warn(
                            `${ENM_LOG_PREFIX} install-mainchain-keystore: master password `
                            + `does not unlock existing keystore (${verifyErr.message}).`,
                        );
                        throw new Error(
                            'The master password you entered does not match this '
                            + 'node\'s existing keystore. Re-run setup with the password '
                            + 'you saved when the node\'s key was first created, or remove '
                            + 'chains/mainchain/keystore.dat to generate a new one.',
                        );
                    }
                }
                return { skipped: true, message: 'keystore already on disk (password verified)' };
            }

            // Resolve ela-cli — in-memory state from Step A first, disk
            // fallback if the in-memory cache got cleared (container
            // restart between steps). Either way we need a real path.
            const dl = ChainRegistry.getBinaryDownloader();
            const onDisk = await dl.getStatusWithDisk('mainchain');
            const cliPath = onDisk && onDisk.cliPath;
            if (!cliPath) {
                throw new Error(
                    'ela-cli not resolvable on disk after install-mainchain-binary — '
                    + 'downloader status=' + (onDisk && onDisk.phase) + '. Re-run the install plan.',
                );
            }

            const ks = ChainRegistry.getKeystoreService();
            let result;
            try {
                result = await ks.create({ cliPath, password: plaintext, force: false });
            } catch (err) {
                throw new Error(
                    `keystore creation via ${cliPath} failed: ${err && err.message ? err.message : String(err)}`,
                );
            }

            // Cache the public identity (NOT the password) to a file the
            // dashboard tile can read without prompting for the password.
            // mode 0o600 matches /setup/keystore for consistency even
            // though the contents are non-secret.
            const identityPath = path.join(chainDir('mainchain'), 'keystore-account.json');
            await atomicWrite(identityPath, JSON.stringify({
                publicKey: result.publicKey,
                address: result.address,
                generatedAt: Date.now(),
            }), { mode: 0o600 });

            return {
                message: 'Main chain keystore created; node public key starts '
                    + (result.publicKey ? result.publicKey.slice(0, 16) + '…' : '<unknown>'),
            };
        });

        // ---- v0.4.7.1 STEP C — Mainchain config block ----
        // Writes cfg.chains.mainchain so the ELA adapter knows where
        // the binary + keystore live. Mirrors the shape /setup/complete
        // composes for the BPoS flow, with two intentional differences:
        //
        //   1. dpos.enableArbiter defaults to TRUE — CORRECTED EXPLANATION
        //      (v0.5.140 audit Session 140; the pre-0.5.140 explanation was
        //      wrong, see below):
        //
        //      This flag controls the ela binary's --enable-arbiter switch.
        //      Per Elastos.ELA main.go:114-130, --enable-arbiter ONLY tells
        //      the node to open its keystore on startup so it CAN sign blocks
        //      when called upon to do so. It does NOT register the operator
        //      as a BPoS producer (that's a separate RegisterProducer tx with
        //      a 2,000 ELA deposit, which ENM does not invoke during setup).
        //
        //      Becoming an active arbiter happens via one of two independent
        //      on-chain paths, neither of which is triggered by this flag:
        //        (a) BPoS path: operator submits RegisterProducer via wallet
        //            → community votes them in → top-N producers selected per
        //            DPoS round → signs blocks.
        //        (b) CR Committee path: operator elected to CR Council →
        //            during election period, Elastos.ELA
        //            dpos/state/arbitrators.go:2439-2460
        //            (resetNextArbiterByCRC) auto-promotes them to a CRC
        //            arbiter slot → signs blocks.
        //
        //      enableArbiter=true is the NECESSARY-BUT-NOT-SUFFICIENT
        //      precondition for either path — the node needs to be able to
        //      sign if/when the chain selects it. For Council operators,
        //      path (b) fires automatically during their election period; no
        //      "BPoS producer mode" enrollment happens by setting this flag.
        //
        //      Sidechain PBFT signing (H23) uses the mainchain keystore.dat
        //      via the sidechain binary's --pbft.keystore flag — independent
        //      of this flag entirely.
        //
        //      The pre-0.5.140 comment claimed enableArbiter=true puts the
        //      mainchain into "BPoS PRODUCER mode (eligible for community
        //      voting)" and described the Council-default as silently
        //      enrolling operators in producer mode. That was wrong on both
        //      counts (no enrollment happens; community voting is a separate
        //      RegisterProducer-driven on-chain process). The amber Card A
        //      callout that propagated this wrong copy to operators was also
        //      dropped in the same audit; see
        //      [[feedback-enm-council-auto-consensus]] memory.
        //
        //      (v0.6.0 backlog: still worth renaming the schema field to
        //      dpos.bposProducerEnabled or similar to remove the Arbiter
        //      naming collision with the separate Class D arbiter binary.)
        //
        //   2. keystorePasswordEncrypted is read from
        //      cfg.global.council.masterPasswordEncrypted (Council
        //      shared-password strategy), not from the per-wallet
        //      .setup-keystore-<wallet>.json stash the BPoS flow uses.
        //
        // Idempotency: skip if cfg.chains.mainchain.binaryPath is set AND
        // the binary + keystore.dat are both on disk. dposSchema (see
        // EnmConfigSchema.js:49-62) does NOT permit a `keystorePresent`
        // flag — Joi rejects unknown keys — so we check the actual file
        // existence instead. Disk state is canonical anyway.
        await runStep('install-mainchain-cfg', async () => {
            // Atomic read-modify-write (P0-7). The idempotency skip throws a
            // sentinel so update() aborts the write; genuine errors (binary not
            // resolvable) bubble through to runStep's failure handler.
            let skipped = false;
            const savedCfg = await ConfigStore.update(async (cfg2) => {
                cfg2.chains = cfg2.chains || {};
                cfg2.chains.mainchain = cfg2.chains.mainchain || {};
                const m = cfg2.chains.mainchain;
                const keystoreOnDisk = fs.existsSync(path.join(chainDir('mainchain'), 'keystore.dat'));
                if (m.binaryPath && fs.existsSync(m.binaryPath) && keystoreOnDisk
                    && m.dpos && m.dpos.keystorePasswordEncrypted) {
                    skipped = true;
                    throw new SetupAbort();
                }

                // Re-resolve binary path + version from the downloader
                // (covers a container restart between Step A and this step,
                // and avoids trusting any stale value in cfg).
                const dl = ChainRegistry.getBinaryDownloader();
                const onDisk = await dl.getStatusWithDisk('mainchain');
                if (!onDisk || !onDisk.binaryPath) {
                    throw new Error(
                        'mainchain binary not resolvable on disk — install-mainchain-binary '
                        + 'should have completed first (downloader phase='
                        + (onDisk && onDisk.phase) + ')',
                    );
                }

                // Read the identity cache Step B wrote so the
                // nodePublicKey field is populated for downstream consumers
                // (Producer registration, audit UI). Missing identity is
                // non-fatal — the field is allowed empty in the schema and
                // the keystore-account endpoint can repopulate it later.
                let nodePublicKey = '';
                try {
                    const identityPath = path.join(chainDir('mainchain'), 'keystore-account.json');
                    const identity = JSON.parse(await fsp.readFile(identityPath, 'utf8'));
                    if (identity && typeof identity.publicKey === 'string') {
                        nodePublicKey = identity.publicKey;
                    }
                } catch (_) { /* missing/unreadable — non-fatal */ }

                // Generate an RPC password the same way /setup/complete does.
                // Council operators rarely touch RPC settings later, but if
                // they do, Settings → Mainchain Advanced can replace this.
                const rpcPasswordPlain = crypto.randomBytes(24).toString('hex');
                const rpcPasswordEnvelope = encrypt(rpcPasswordPlain);

                const council = cfg2.global && cfg2.global.council;
                const keystoreEnvelope = (council && council.masterPasswordEncrypted) || '';

                cfg2.chains.mainchain = {
                    enabled: m.enabled !== false,
                    binaryPath: onDisk.binaryPath,
                    binaryVersion: onDisk.version || null,
                    // beta.0.5.0 — stamp install time so F8 suppresses
                    // version-drift proposals for 1h after install.
                    binaryInstalledAt: Date.now(),
                    dataDir: chainDir('mainchain'),
                    activeNet: inputs.activeNet || m.activeNet || 'mainnet',
                    ports: { ...ELA_DEFAULT_PORTS, ...(m.ports || {}) },
                    rpc: m.rpc && m.rpc.passwordEncrypted ? m.rpc : {
                        user: 'ela',
                        passwordEncrypted: rpcPasswordEnvelope,
                        whiteIPList: ['127.0.0.1'],
                    },
                    dpos: {
                        enableArbiter: true,                       // Council always signs
                        ipAddressMode: (m.dpos && m.dpos.ipAddressMode) || 'auto',
                        ipAddressManual: (m.dpos && m.dpos.ipAddressManual) || null,
                        refreshOnRestart: true,
                        ownerPublicKey: (m.dpos && m.dpos.ownerPublicKey) || '',
                        nodePublicKey: nodePublicKey || (m.dpos && m.dpos.nodePublicKey) || '',
                        keystorePasswordEncrypted: keystoreEnvelope,
                    },
                    memoryLimitMb: m.memoryLimitMb || 4096,
                    archiveMode: m.archiveMode === true,
                    logLevel: m.logLevel || 'info',
                    healing: m.healing || { enabledRules: {} },
                };
            }).catch((err) => {
                if (err instanceof SetupAbort) { return null; }
                throw err;
            });
            if (skipped) {
                return { skipped: true, message: 'Main chain config already written' };
            }
            try { ChainRegistry.registerConfiguredAdapters({ cfg: savedCfg }); }
            catch (_) { /* best-effort — adapter may already be registered */ }
            return { message: 'Main chain config written.' };
        });

        // ---- STEPS 2-4 — ESC + EID + PG cfg writes (cheap, sequential) ----
        // beta.0.4.7 — PG is always installed; no opt-out (operator
        // directive 2026-05-19).
        const classBChains = ['esc', 'eid', 'pg'];
        for (const chainId of classBChains) {
            await runStep(`install-${chainId}-cfg`, async () => {
                // Atomic read-modify-write (P0-7). The idempotency skip throws a
                // sentinel so update() aborts the write (no needless no-op save).
                let skipped = false;
                const savedCfg = await ConfigStore.update((cfg2) => {
                    if (cfg2.chains && cfg2.chains[chainId]) {
                        skipped = true;
                        throw new SetupAbort();
                    }
                    cfg2.chains = cfg2.chains || {};
                    const ports = ClassBPorts.portsFor(chainId, inputs.activeNet);
                    cfg2.chains[chainId] = {
                        enabled: false,
                        binaryPath: '',
                        binaryVersion: '',
                        // beta.0.5.0 — stamped when the binary actually lands
                        // in the install-binaries-parallel step (see below).
                        binaryInstalledAt: null,
                        activeNet: inputs.activeNet,
                        ports,
                        pbft: { usesMainchainKeystore: true, ipAddress: null },
                        miner: {
                            // v0.5.189 — DEFAULT FOLLOWER. Mining is on-chain
                            // producer state, NOT an install-time decision. An
                            // Elastos EVM sidechain's producers ARE the main chain's
                            // rotating arbiters; a node mines only when its DPoS key
                            // is confirmed in the on-chain arbiter slate. So we install
                            // every sidechain as a FOLLOWER (node.sh's else branch:
                            // no --mine, fast sync) and let EvmSidechainAdapter.start()
                            // PROMOTE it to a miner at boot IF detectProducerRole
                            // (getarbitersinfo) finds the node key on-duty. This also
                            // structurally avoids the forced-full-sync DID wedge: a
                            // non-producer (e.g. a fresh/never-registered node) never
                            // full-executes, so it can't wedge like eid did. (Earlier
                            // FIX-C12 forced miner+full here — wrong for non-producers,
                            // and harmless even for real producers since the PBFT layer
                            // self-gates production at seal time regardless.)
                            enabled: false,
                            rewardAddress: inputs.sharedRewardAddress,
                            rewardAddressSource: 'shared',
                            // evmKeystoreAddr + evmKeystorePasswordEncrypted are
                            // populated by EvmSidechainAdapter.start()'s EVM
                            // account-auto-creation preflight (FIX-C12) — it runs
                            // the geth binary's `account new` (node.sh esc_init:3245)
                            // the first time a miner-enabled chain starts, then
                            // persists the resolved 0x address + encrypted password
                            // back into this cfg block. Left empty here on purpose.
                            evmKeystoreAddr: '',
                            evmKeystorePasswordEncrypted: '',
                            threads: 1,
                        },
                        // v0.5.235 — install on FULL sync (council-ready). EVM
                        // chains always full-sync now; the old fast-follower
                        // default is removed. The forced-full-sync DID wedge
                        // that fast used to dodge is handled structurally by
                        // the lockstep SPV wipe (chainResync v0.5.235), so a
                        // from-genesis full-sync builds a correct DID index and
                        // validates cleanly (node.sh runs producers on full).
                        // miner.enabled stays false here — mining is promoted
                        // at boot by detectProducerRole when on-duty; only the
                        // sync mode is now unconditionally full.
                        sync: { mode: 'full' },
                        bootnodes: [],
                        healing: { enabledRules: {} },
                        binarySha256Expected: '',
                    };
                }).catch((err) => {
                    if (err instanceof SetupAbort) { return null; }
                    throw err;
                });
                if (skipped) {
                    return { skipped: true, message: 'Config already present' };
                }
                try { ChainRegistry.registerConfiguredAdapters({ cfg: savedCfg }); }
                catch (_) { /* best-effort */ }
                return { message: `cfg.chains.${chainId} written` };
            });
        }

        // ---- STEP — mainchain snapshot download (v0.5.199 mainchain-only) ----
        // Was multi-chain pre-v0.5.199; collapsed to mainchain after the
        // the cycle-13 nodekey-contamination lockup (2026-05-23). EVM
        // chains (esc/eid/pg) now cold-sync from peers — slower (3-7 days
        // each, in the background) but no shared-identity failure mode.
        // SSE topic kept as 'download-snapshots-parallel' for frontend
        // stability; the per-chain progress aggregator now reports a
        // single chain.
        //
        // EnmSnapshotDownloader is idempotent: any data dir that already
        // has content (via the .enm-snapshot-complete sentinel) is left
        // alone, so re-running the orchestrator is safe. When the operator
        // picked "sync from scratch" we skip the step entirely.
        await runStep('download-snapshots-parallel', async () => {
            const SnapshotDownloader = require('../services/EnmSnapshotDownloader');
            if (inputs.useSnapshots === false) {
                return { skipped: true, message: 'operator chose to sync from scratch' };
            }
            const cfg2 = await ConfigStore.load();
            const { chainDir } = require('../services/DataDir');
            const targetDirsByChain = {};
            // 0.5.146 audit Session 146 — per-chain snapshot extract targets.
            // Pre-0.5.146 every chain extracted to `<chainDir>/data/`,
            // which was wrong for mainchain. Verified live on the test
            // server (S146):
            //
            //   - ela mainchain reads its block data from
            //     `<chainDir>/elastos/data/...` (cwd=chainDir; ela main.go:50
            //     joins cfg.DataDir+"data" and our NativeProcessService:316
            //     mkdir's `<cwd>/elastos`; ela's actual writes land at
            //     `<chainDir>/elastos/data/`).
            //   - The upstream snapshot tarball at
            //     https://node-data.elastos.io/ela/ela-data-latest.tgz has a
            //     top-level `data/` entry containing the actual block dirs
            //     (blocks/, chain/, checkpoints/, dpos/, peers.json).
            //   - Pre-0.5.146 we passed target=`<chainDir>/data/` to `tar -xzf
            //     -C <target>`, producing `<chainDir>/data/data/blocks/...`.
            //     ela found `<chainDir>/elastos/data/` empty on first start
            //     and synced from genesis (the operator's "main chain
            //     didn't start from snapshot" symptom).
            //
            // Fix: extract mainchain to `<chainDir>/elastos/`. The tarball's
            // `data/` wrapping prefix then lands the block data at exactly
            // `<chainDir>/elastos/data/` where ela reads from. No
            // --strip-components flag needed.
            //
            // v0.5.199 — MAINCHAIN ONLY. The pre-v0.5.199 multi-chain
            // setup is gone. esc/eid/pg used to ship snapshots here, but
            // the upstream EVM tarballs embed the snapshot creator's
            // data/<chain>/nodekey → duplicate geth node ID across every
            // Council that applied them → 0 EVM peers → F1/F2 cascade →
            // eventually panic/exit (eid). Root-cause-fixed by removing
            // the EVM entries from EnmSnapshotDownloader.SNAPSHOT_SOURCES;
            // this iteration matches the downloader (mainchain only) so
            // the disk-preflight + UI sizing stay consistent.
            //
            // Historic BUG-C3 / fix-of-the-fix comments preserved: the
            // mainchain relpath is 'elastos' so the tarball's own `data/`
            // lands at exactly `<chainDir>/elastos/data/` where ela reads
            // from. No --strip-components flag needed.
            const SNAPSHOT_TARGET_RELPATH = {
                mainchain: 'elastos',  // tarball's `data/` → <chainDir>/elastos/data/
                // v0.5.199 — esc/eid/pg intentionally absent. EVM chains
                // cold-sync from peers; see SNAPSHOT_SOURCES rationale.
            };
            for (const cid of ['mainchain']) {
                if (cfg2.chains && cfg2.chains[cid]) {
                    const rel = Object.prototype.hasOwnProperty.call(SNAPSHOT_TARGET_RELPATH, cid)
                        ? SNAPSHOT_TARGET_RELPATH[cid]
                        : 'data';
                    targetDirsByChain[cid] = path.join(chainDir(cid), rel);
                }
            }
            // beta.0.4.12 — operator feedback "snapshots flicker soooo
            // fast!": EnmSnapshotDownloader fires onProgress ~every 500ms
            // per chain. With 4 chains in parallel that was 8 SSE events/s
            // each overwriting the step's message text — visually it was
            // strobe. Fix: aggregate per-chain percent in a closure +
            // throttle the SSE publish to once per 1000ms with a message
            // that shows all chains simultaneously.
            // v0.5.199 — single chain (mainchain); the aggregator still
            // works (it just has one key), and keeping the throttle in
            // place means the wizard still sees smooth 0→100 transitions.
            const chainPercents = {};
            let lastPublishMs = 0;
            const publishThrottled = () => {
                if (!sseHub) return;
                const now = Date.now();
                if (now - lastPublishMs < 1000) return;
                lastPublishMs = now;
                const parts = Object.keys(chainPercents).sort().map(
                    (cid) => `${cid} ${chainPercents[cid].percent}%`,
                );
                try {
                    sseHub.publish('setup:council:install', {
                        step: 'download-snapshots-parallel',
                        status: 'start',
                        message: parts.join(' · '),
                        total: PLAN.length,
                        completed: _councilInstallState.completedSteps.length,
                        percent: Math.round(
                            (_councilInstallState.completedSteps.length / PLAN.length) * 100,
                        ),
                        ts: now,
                    });
                } catch (_) { /* SSE best-effort */ }
            };
            const result = await SnapshotDownloader.downloadAll(targetDirsByChain, {
                chainIds: Object.keys(targetDirsByChain),
                onProgress: (p) => {
                    if (!p || !p.chainId) { return; }
                    // 0.5.142 audit Session 142 — pin extract-phase to 100%
                    // for the operator-visible composite.
                    //
                    // Operator-reported: "after mainchain went to 100% it
                    // became 0% — so weird". Root cause: EnmSnapshotDownloader
                    // emits `phase:'download', percent:0..100` during the
                    // streaming download, then ONE `phase:'extract', percent:0`
                    // event when extract begins (and no progressive extract
                    // events — the system `tar` call runs synchronously to
                    // completion). Pre-0.5.142 the aggregator blindly
                    // overwrote chainPercents[chainId] with the latest event's
                    // percent, so the visible bar fell from 100→0 the instant
                    // extract started for any chain, even though the chain
                    // was actually almost done.
                    //
                    // Fix: when phase === 'extract', show 100%. The chain
                    // has finished downloading; extract is the last step
                    // and is fast relative to download (seconds vs minutes
                    // for the snapshot sizes ENM ships). The operator sees
                    // a monotonic 0→100 bar per chain instead of the
                    // confusing 0→100→0→done plummet.
                    let pct;
                    if (p.phase === 'extract') {
                        pct = 100;
                    } else if (typeof p.percent === 'number') {
                        pct = p.percent;
                    } else {
                        return;
                    }
                    chainPercents[p.chainId] = { percent: pct, phase: p.phase };
                    publishThrottled();
                },
            });
            // result.results: { chainId → fulfilled-value | { error } }
            const failures = Object.entries(result.results || {})
                .filter(([, r]) => r && typeof r === 'object' && typeof r.error === 'string');
            if (failures.length > 0) {
                throw new Error(
                    `snapshot failed for: ${failures.map(([cid, r]) => `${cid} (${r.error})`).join(', ')}`,
                );
            }
            const applied = Object.keys(result.results || {});
            const secs = Math.round((result.durationMs || 0) / 1000);
            return { message: `snapshots applied for ${applied.join(', ')} in ${secs}s` };
        });

        // ---- STEP N+1 — parallel binary downloads ----
        // beta.0.4.6 — download ESC + EID + PG + Arbiter binaries
        // CONCURRENTLY. Pre-0.4.6 this was 4 serial steps (~4 min on
        // a typical Hostinger VPS); parallel runs in ~1 min wall time
        // since the downloads are network-bound not CPU-bound.
        //
        // Arbiter cfg lands AFTER this step (M6.1 needs the binary on
        // disk before generateConfig can validate the path). So the
        // arbiter-cfg row in the stepper is later in the plan.
        await runStep('install-binaries-parallel', async () => {
            const dl = ChainRegistry.getBinaryDownloader();
            const targets = classBChains.concat(['arbiter']);
            const cfgInit = await ConfigStore.load();
            const toDownload = targets.filter((cid) => {
                if (cid === 'arbiter') {
                    // arbiter cfg is written in a later step; binary
                    // download is independent of cfg state. Always try
                    // download unless we already have it on disk.
                    return true;
                }
                return !(cfgInit.chains[cid] && cfgInit.chains[cid].binaryPath);
            });
            if (toDownload.length === 0) {
                return { skipped: true, message: 'all binaries already on disk' };
            }
            // Kick off each download (fire-and-forget; EnmBinaryDownloader
            // tracks state per chainId). Then wait on each.
            const startPromises = toDownload.map(async (cid) => {
                try { await dl.start(cid); } catch (_) { /* already running OK */ }
            });
            await Promise.all(startPromises);
            const results = await Promise.all(toDownload.map(async (cid) => {
                try {
                    await waitForBinaryInstall(dl, cid, log);
                    const status = dl.getStatus(cid);
                    return { cid, ok: true, status };
                } catch (err) {
                    return { cid, ok: false, error: err.message };
                }
            }));
            // Persist successful binary paths into cfg. Atomic read-modify-write
            // (P0-7) so a concurrent timer save can't drop the binary paths.
            await ConfigStore.update((cfg2) => {
                for (const r of results) {
                    if (!r.ok) { continue; }
                    if (r.cid === 'arbiter') {
                        // arbiter cfg not yet written — defer persist to
                        // install-arbiter-cfg step. Stash the path for
                        // that step to read from the downloader.
                        continue;
                    }
                    if (cfg2.chains[r.cid]) {
                        cfg2.chains[r.cid].binaryPath = r.status.binaryPath;
                        cfg2.chains[r.cid].binaryVersion = r.status.version || '';
                        // beta.0.5.0 — stamp install time so F8 suppresses
                        // version-drift proposals for 1h after install.
                        cfg2.chains[r.cid].binaryInstalledAt = Date.now();
                    }
                }
            });
            const failed = results.filter((r) => !r.ok);
            if (failed.length > 0) {
                throw new Error(
                    `binary downloads failed: `
                    + failed.map((r) => `${r.cid} (${r.error})`).join(', '),
                );
            }
            return {
                message: `downloaded ${results.length} binar${results.length === 1 ? 'y' : 'ies'} in parallel`,
            };
        });

        // ---- STEP 8 — Node.js runtime (skip if host has v18+) ----
        await runStep('install-node-runtime', async () => {
            const found = await NodeJsRuntime.resolveAny();
            if (found && found.source === 'host') {
                return { skipped: true, message: `host has ${found.version.raw} at ${found.path}` };
            }
            if (found && found.source === 'local') {
                return { skipped: true, message: `local install present (${found.version.raw})` };
            }
            const r = await NodeJsRuntime.installLocal({
                onProgress: (m) => log.info(`${ENM_LOG_PREFIX} node-runtime: ${m}`),
            });
            return { message: `installed ${r.version.raw} at ${r.path}` };
        });

        // ---- STEP 9 — Download oracle scripts ----
        const scriptPaths = {};
        await runStep('download-oracle-scripts', async () => {
            const paths = await OracleScriptDownloader.downloadAll({
                onProgress: (m) => log.info(`${ENM_LOG_PREFIX} oracle-scripts: ${m}`),
            });
            Object.assign(scriptPaths, paths);
            return { message: `downloaded ${Object.keys(paths).length} script(s)` };
        });

        // ---- Class C oracles ----
        // beta.0.4.7 — PG oracle is now auto-downloadable from
        // download.elastos.io. No more "closed-source" graceful skip;
        // the Council always installs all three oracles.
        const oracleIds = ['esc-oracle', 'eid-oracle', 'pg-oracle'];
        for (const oracleId of oracleIds) {
            await runStep(`install-${oracleId}`, async () => {
                const parent = oracleId === 'esc-oracle' ? 'esc'
                             : oracleId === 'eid-oracle' ? 'eid' : 'pg';
                const portMap = { 'esc-oracle': 20632, 'eid-oracle': 20642, 'pg-oracle': 20672 };
                const port = inputs.activeNet === 'testnet'
                    ? portMap[oracleId] + 1000 : portMap[oracleId];
                // Atomic read-modify-write (P0-7). The idempotency skip throws a
                // sentinel so update() aborts the write; the runtime-missing
                // error bubbles to runStep's failure handler.
                let skipped = false;
                const savedCfg = await ConfigStore.update(async (cfg2) => {
                    if (cfg2.chains && cfg2.chains[oracleId]) {
                        skipped = true;
                        throw new SetupAbort();
                    }
                    const runtime = await NodeJsRuntime.resolveAny();
                    if (!runtime) {
                        throw new Error('no Node.js runtime resolvable (step 8 should have ensured one)');
                    }
                    cfg2.chains = cfg2.chains || {};
                    cfg2.chains[oracleId] = {
                        enabled: false,
                        binaryPath: runtime.path,
                        binaryVersion: runtime.version.raw,
                        // beta.0.5.0 — stamp install time so F8 suppresses
                        // version-drift proposals for 1h after install.
                        binaryInstalledAt: Date.now(),
                        activeNet: inputs.activeNet,
                        parentChainId: parent,
                        // beta.0.4.7 — per-oracle subdir layout. Pre-0.4.7
                        // OracleScriptDownloader stored every script in one
                        // flat dir; the rewrite gives each oracle its own
                        // dir so node_modules don't collide. OracleAdapter
                        // joins this with scriptFilename, so this MUST be
                        // the per-oracle dir, not the parent.
                        scriptPath: OracleScriptDownloader.scriptDirFor(oracleId),
                        nodejsVersion: NodeJsRuntime.PINNED_VERSION,
                        ports: { httpRpc: port },
                        parent: { chainRpcUrl: '', mainchainRpcUrl: '' },
                        healing: { enabledRules: {} },
                    };
                }).catch((err) => {
                    if (err instanceof SetupAbort) { return null; }
                    throw err;
                });
                if (skipped) {
                    return { skipped: true, message: 'Config already present' };
                }
                try { ChainRegistry.registerConfiguredAdapters({ cfg: savedCfg }); }
                catch (_) { /* best-effort */ }
                return { message: `cfg.chains.${oracleId} written (parent=${parent}, port=${port})` };
            });
        }

        // ---- Arbiter cfg (binary already downloaded in parallel step) ----
        await runStep('install-arbiter-cfg', async () => {
            // Atomic read-modify-write (P0-7). The idempotency skip throws a
            // sentinel so update() aborts the write; genuine errors (binary
            // missing, unresolvable ELA address) bubble to runStep's handler.
            let skipped = false;
            const savedCfg = await ConfigStore.update(async (cfg2) => {
                if (cfg2.chains && cfg2.chains.arbiter && cfg2.chains.arbiter.binaryPath) {
                    skipped = true;
                    throw new SetupAbort();
                }
                const dl = ChainRegistry.getBinaryDownloader();
                const arbStatus = dl.getStatus('arbiter');
                if (!arbStatus || arbStatus.phase !== 'done' || !arbStatus.binaryPath) {
                    throw new Error(
                        `arbiter binary not on disk (downloader phase=${arbStatus && arbStatus.phase}); `
                        + 'the parallel-binaries step should have downloaded it.',
                    );
                }
                const ports = inputs.activeNet === 'testnet'
                    ? { rpc: 21536, p2p: 21538 }
                    : { rpc: 20536, p2p: 20538 };
                // BUG-C9 (v0.5.158) — resolve a VALID ELA mainchain address for the
                // arbiter's mining.miningAddress. The arbiter binary validates this
                // at start and refuses a non-ELA value (the old default was the EVM
                // 0x reward address → "not a valid ELA address" → arbiter never
                // started). Prefer an explicit arbiterMiningAddress; otherwise use
                // the operator's own ELA address from the mainchain keystore identity
                // (keystore-account.json, written at install-mainchain-keystore time).
                let arbiterMining = '';
                const explicitMining = String(inputs.arbiterMiningAddress || '').trim();
                const explicitChk = explicitMining
                    ? EnmCrypto.validateElaAddress(explicitMining) : { valid: false };
                if (explicitChk.valid) {
                    arbiterMining = explicitChk.normalized || explicitMining;
                } else {
                    try {
                        const idRaw = await fsp.readFile(
                            path.join(chainDir('mainchain'), 'keystore-account.json'), 'utf8');
                        const id = JSON.parse(idRaw);
                        const idChk = (id && id.address)
                            ? EnmCrypto.validateElaAddress(id.address) : { valid: false };
                        if (idChk.valid) { arbiterMining = idChk.normalized || id.address; }
                    } catch (_) { /* handled by the guard below */ }
                }
                if (!arbiterMining) {
                    throw new Error(
                        'arbiter: could not resolve a valid ELA mining address '
                        + '(no explicit arbiterMiningAddress and the mainchain keystore '
                        + 'identity is missing or invalid).');
                }
                cfg2.chains = cfg2.chains || {};
                cfg2.chains.arbiter = {
                    enabled: false,
                    binaryPath: arbStatus.binaryPath,
                    binaryVersion: arbStatus.version || '',
                    // beta.0.5.0 — stamp install time so F8 suppresses
                    // version-drift proposals for 1h after install.
                    binaryInstalledAt: Date.now(),
                    activeNet: inputs.activeNet,
                    ports,
                    wallet: { usesMainchainKeystore: true, passwordSource: 'mainchain-ela-txt' },
                    mining: { miningAddress: arbiterMining, sideChainPowFeeEla: 0.1 },
                    crossChain: { sideNodeList: [], syncIntervalMs: 1000 },
                    healing: { enabledRules: {} },
                };
            }).catch((err) => {
                if (err instanceof SetupAbort) { return null; }
                throw err;
            });
            if (skipped) {
                return { skipped: true, message: 'Config and binary already in place' };
            }
            try { ChainRegistry.registerConfiguredAdapters({ cfg: savedCfg }); }
            catch (_) { /* best-effort */ }
            return { message: 'Arbiter config written.' };
        });

        // ---- Start all chains (DAG order: mainchain → B → C → D) ----
        // v0.4.7.1 — mainchain starts FIRST and we wait for it to be
        // alive before kicking off the sidechains. The EVM sidechains
        // (ESC/EID/PG) read the mainchain keystore at spawn time for
        // their PBFT consensus signer (passwordSource='mainchain-ela-txt');
        // starting them before mainchain has opened its RPC port races
        // against config readiness and tends to surface as "PBFT key
        // unavailable" errors on the sidechain side.
        //
        // The mainchain start is best-effort same as the others — if
        // it fails F1 self-heal retries it, and downstream chains will
        // still be marked enabled=true (their adapter handles
        // mainchain-down gracefully via reconnection backoff).
        await runStep('start-chains', async () => {
            // beta.0.4.7 — PG is always part of the start order.
            // v0.4.7.1 — mainchain enabled + started ahead of others.
            const startOrder = ['mainchain', 'esc', 'eid', 'pg',
                'esc-oracle', 'eid-oracle', 'pg-oracle', 'arbiter'];
            // Flip enabled=true so AUTOSTART/restart logic respects it. Atomic
            // read-modify-write (P0-7); the returned cfg drives the adapter
            // starts below.
            const cfg2 = await ConfigStore.update((c) => {
                for (const cid of startOrder) {
                    if (c.chains[cid]) { c.chains[cid].enabled = true; }
                }
            });

            const started = [];

            // Mainchain first — sequential and we briefly poll for
            // alive before continuing. Timeout is generous (20s) because
            // ela's start-up does an RPC bind + initial peer dial which
            // can take a few seconds on a fresh data dir; if it's not
            // up by then we still continue (F1 will retry) so the
            // sidechain start path isn't blocked indefinitely.
            try {
                const mAdapter = ChainRegistry.getAdapter('mainchain');
                const mCfg = cfg2.chains.mainchain;
                if (mAdapter && mCfg) {
                    await mAdapter.start(mCfg);
                    started.push('mainchain');
                    const ps = ChainRegistry.getProcessService();
                    const deadline = Date.now() + 20_000;
                    while (Date.now() < deadline) {
                        let alive = false;
                        try { alive = !!(ps.statusSync('mainchain').alive); }
                        catch (_) { alive = false; }
                        if (alive) { break; }
                        await new Promise((r) => setTimeout(r, 1000));
                    }
                }
            } catch (err) {
                log.warn(`${ENM_LOG_PREFIX} install-council start mainchain failed: ${err.message} `
                    + '(non-fatal; F1 self-heal will retry)');
            }

            // Sidechains + oracles + arbiter — sequential is fine here
            // (each adapter.start is fast and they don't contend), and
            // sequential keeps the SSE step messages readable.
            const downstream = startOrder.filter((cid) => cid !== 'mainchain');
            for (const cid of downstream) {
                try {
                    const adapter = ChainRegistry.getAdapter(cid);
                    const chainCfg = cfg2.chains[cid];
                    await adapter.start(chainCfg);
                    started.push(cid);
                } catch (err) {
                    log.warn(`${ENM_LOG_PREFIX} install-council start ${cid} failed: ${err.message} `
                        + '(non-fatal; F1 self-heal will retry)');
                }
            }
            // beta.0.5.0 — mark setup as completed so app.js doesn't re-mount the
            // wizard on the next page load. Pre-0.5.0 the orchestrator only set
            // _councilInstallState.success=true (in-memory); the BACKEND setup
            // state (cfg.setup.completed) was never written, so /setup/state
            // returned currentStep≠'welcome' on every reload → wizard re-mounted.
            //
            // Atomic read-modify-write (P0-7) — load+mutate+save under the write
            // lock so we don't clobber any concurrent writes from chain adapters
            // that ran during `await adapter.start(...)` above. (Pre-P0-7 this
            // used a fresh load() to narrow, but not close, that race window.)
            await ConfigStore.update((cfgFinal) => {
                cfgFinal.setup = cfgFinal.setup || {};
                cfgFinal.setup.completed = true;
                cfgFinal.setup.completedAt = Date.now();
                cfgFinal.setup.completedStep = 'council-install';
                // v0.5.229 (audit 2026-05-27) — durable "this is a Council
                // install" flag. The dashboard reads this via /system/identity
                // and /system/council-status to render Council-mode UI from
                // the first paint, before the live listcurrentcrs RPC has a
                // chance to respond. Pre-229 the wizard only saved
                // localStorage.enm:setup-intent which the dashboard never
                // read — so every Council operator saw the BPoS default
                // labelling instead.
                cfgFinal.global = cfgFinal.global || {};
                cfgFinal.global.council = cfgFinal.global.council || {};
                cfgFinal.global.council.installed = true;
                cfgFinal.global.council.installedAt = Date.now();
            });

            // 0.5.145 audit Session 145 — mirror BPoS /setup/complete (line
            // 788-793) and also upsert completed=1 into enm_setup_state.
            // The 0.5.0 fix above wrote cfg.setup.completed=true to cfg.json
            // (ConfigStore), but GET /setup/state reads from the SQLite
            // enm_setup_state TABLE, not cfg.json. Two different stores.
            // The boot path at app.js init() calls /setup/state and routes
            // to the dashboard when completed=true; the DB row still had
            // completed=0 so the wizard re-mounted on every page reload
            // even though setup was actually done.
            //
            // Wallet is captured at the POST /install-council handler via
            // readActorWallet(req) and plumbed through args. If it's
            // somehow missing (e.g. dev tooling calling runCouncilInstall
            // directly), fall back to a SELECT-based reverse lookup so
            // the install still completes cleanly rather than leaking the
            // pre-0.5.145 bug.
            try {
                const { db } = extensionHandle.import('data');
                let dbWallet = wallet;
                if (!dbWallet) {
                    const rows = await db.read(
                        `SELECT wallet_address FROM enm_setup_state LIMIT 1`,
                        [],
                    );
                    if (Array.isArray(rows) && rows.length > 0) {
                        dbWallet = rows[0].wallet_address;
                    }
                }
                if (dbWallet) {
                    await upsertSetupState(db, dbWallet, {
                        completed: 1,
                        current_step: 'complete',
                        completed_at: Date.now(),
                    });
                } else {
                    log.warn(`${ENM_LOG_PREFIX} install-council finalize: no wallet `
                        + 'available to upsert enm_setup_state.completed=1 — '
                        + 'cfg.setup.completed is true but /setup/state will still '
                        + 'return completed=false. Operator must POST /setup/complete '
                        + 'manually or restart the wizard once to fix.');
                }
            } catch (dbErr) {
                log.error(`${ENM_LOG_PREFIX} install-council finalize: `
                    + `enm_setup_state upsert failed: ${dbErr.message}. `
                    + 'cfg.setup.completed is true; DB row was not updated.');
            }
            return { message: `${started.length}/${startOrder.length} chains started` };
        });

        _councilInstallState.success = true;
    } finally {
        _councilInstallState.running = false;
        _councilInstallState.finishedAt = Date.now();
        emit('finalize', _councilInstallState.success ? 'done' : 'error',
            _councilInstallState.error || '');
    }
}

/**
 * beta.0.4.6 — Council preflight checker. Runs all the cheap probes
 * the wizard's Card D.5 needs to decide whether the install can
 * succeed. Each check returns { id, label, ok, message, severity }.
 *
 * Severity:
 *   'required'   — must be ok for Continue button to enable
 *   'recommended' — warning if not ok but doesn't block
 *
 * Caches results for 30s to avoid hammering upstream when the wizard
 * polls (e.g. Continue button → operator clicks Refresh).
 */
let _preflightCache = { ts: 0, result: null };

async function runCouncilPreflight(args) {
    const { extensionHandle } = args;
    const now = Date.now();
    if (_preflightCache.result && now - _preflightCache.ts < 30_000) {
        return _preflightCache.result;
    }
    // beta.0.5.0 — skip preflight when setup is already completed.
    // Pre-0.5.0, post-install navigation back to Card 5 would re-run the
    // preflight against current-disk-free (post-snapshot consumption) and
    // block on the disk threshold (was 250GB pre-v0.5.199, now 220GB);
    // the operator had a working node and the preflight refused to
    // acknowledge it. After install, the checks don't gate anything
    // useful — surface a synthetic "previously verified" report and let
    // the operator continue.
    try {
        const cfg = await ConfigStore.load();
        if (cfg.setup && cfg.setup.completed === true) {
            const result = {
                ts: Date.now(),
                previouslyVerified: true,
                checks: [{
                    id: 'setup-completed',
                    label: 'Setup previously completed',
                    ok: true,
                    message: `Completed at ${new Date(cfg.setup.completedAt || 0).toISOString()}`,
                    severity: 'required',
                }],
                allRequiredOk: true,
            };
            _preflightCache = { ts: Date.now(), result };
            return result;
        }
    } catch (_) { /* fall through to live check */ }
    const EnmCrypto = require('../services/EnmCrypto');
    const { enmDataDir } = require('../services/DataDir');
    const fs = require('node:fs');
    const fsp = require('node:fs/promises');
    const https = require('node:https');
    const checks = [];

    // beta.0.4.9 — `mainchain-alive` + `mainchain-keystore-pw` checks
    // were dropped here. In v0.4.6 the Council install ran AFTER a
    // completed BPoS-style mainchain setup, so requiring mainchain up
    // + keystore-readable was correct. In v0.4.7.1+ the orchestrator
    // INSTALLS mainchain itself (steps install-mainchain-binary /
    // -keystore / -cfg before any sidechain work), so those checks
    // were guaranteed-fail blockers on the redesigned wizard path.
    // The orchestrator's own runStep handlers fail loudly if anything
    // they need is missing — preflight just gates environment + network
    // readiness, not chain state.

    // 3. Disk space ≥ 220 GB in enmDataDir.
    // beta.0.4.7 — bumped from 20 GB. Council snapshots WERE ~50 GB
    // compressed plus ~200 GB extracted across mainchain + ESC + EID
    // + PG; 20 GB was a hold-over from the mainchain-only era and
    // would let an under-provisioned host start the install and then
    // ENOSPC mid-extraction.
    // beta.0.5.0 — opt-in dev relaxation. `ENM_DEV_RELAX_SYSCHECK=true`
    // lowers the threshold so the wizard can run on developer boxes;
    // production keeps the production floor.
    // v0.5.199 — dropped 250 → 220 GB (prod) and 50 → 40 GB (dev). ENM
    // now ships ONLY the mainchain snapshot (~10 GB compressed, ~30 GB
    // extracted at peak); EVM chains cold-sync from peers (no snapshot
    // download). The 220 GB floor is now dominated by EVM chaindata
    // growth (esc/eid/pg full chain ~50 GB each after months of sync)
    // rather than the install-time snapshot footprint.
    const DISK_MIN = process.env.ENM_DEV_RELAX_SYSCHECK === 'true' ? 40 : 220;
    let diskOk = false;
    let diskMsg = 'unknown';
    try {
        const dir = enmDataDir();
        await fsp.mkdir(dir, { recursive: true });
        // statfs added in node 18. Fall back to "ok-unless-fails" on older.
        if (typeof fsp.statfs === 'function') {
            const sf = await fsp.statfs(dir);
            const freeGb = Math.floor((sf.bavail * sf.bsize) / (1024 * 1024 * 1024));
            diskOk = freeGb >= DISK_MIN;
            diskMsg = `${freeGb} GB free`;
        } else {
            diskOk = true;
            diskMsg = 'statfs unavailable on this Node version — assuming OK';
        }
    } catch (err) {
        diskMsg = 'check failed: ' + err.message;
    }
    checks.push({
        id: 'disk-space',
        label: `Disk space ≥ ${DISK_MIN} GB free`,
        ok: diskOk,
        message: diskMsg,
        severity: 'required',
    });

    // v0.5.248 (validator-readiness audit P1) — clock-skew check. The
    // general /setup/preflight already runs this, but the Council install
    // preflight (Card D.5) did NOT, so a Council operator could install
    // onto a host whose clock is outside ela's ~4.2 s DPoS block-validation
    // tolerance and start missing blocks / earning penalties the moment it
    // goes on-duty. Recommended-severity (fail-soft): a >2 s skew warns but
    // doesn't hard-block (it's correctable post-install via NTP), and an
    // unreachable time probe is skipped rather than failed so the wizard
    // never wedges offline. Reuses the same probe + 5 s outer timeout as
    // /setup/preflight, so the worst-case added latency is bounded.
    const clockSkew = await runClockSkewCheck(extensionHandle);
    let clockMsg;
    if (clockSkew.skipped) {
        clockMsg = `couldn’t verify (${clockSkew.reason || 'network unreachable'}) — check host NTP (systemd-timesyncd) if you suspect clock drift`;
    } else if (clockSkew.ok) {
        clockMsg = `${clockSkew.skewMs >= 0 ? '+' : ''}${clockSkew.skewMs} ms (within ±${clockSkew.maxSkewMs} ms)`;
    } else {
        clockMsg = `clock off by ${clockSkew.absSkewMs} ms — exceeds ±${clockSkew.maxSkewMs} ms. ela’s DPoS block validation tolerates only ~4.2 s; fix NTP (systemd-timesyncd) before this node goes on-duty.`;
    }
    checks.push({
        id: 'clock-skew',
        label: `Clock within ±${clockSkew.maxSkewMs} ms of network time`,
        ok: clockSkew.ok,
        message: clockMsg,
        severity: 'recommended',
    });

    // 4-6. HEAD probes for the three upstream services we depend on.
    async function headProbe(url, timeoutMs) {
        return new Promise((resolve) => {
            const req = https.request(url, { method: 'HEAD', timeout: timeoutMs || 5000 },
                (res) => { res.resume(); resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, code: res.statusCode }); });
            req.on('error', (err) => resolve({ ok: false, error: err.message }));
            req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
            req.end();
        });
    }
    const githubProbe = await headProbe(
        'https://raw.githubusercontent.com/elastos/Elastos.ELA.SideChain.ESC/master/oracle/crosschain_oracle.js',
    );
    checks.push({
        id: 'github-reachable',
        label: 'GitHub.com reachable (for oracle scripts)',
        ok: githubProbe.ok,
        message: githubProbe.ok ? 'HEAD 200' : ('failed: ' + (githubProbe.error || ('HTTP ' + githubProbe.code))),
        severity: 'required',
    });
    const elastosProbe = await headProbe('https://download.elastos.io/elastos-arbiter/');
    checks.push({
        id: 'elastos-downloads',
        label: 'download.elastos.io reachable (for binaries)',
        ok: elastosProbe.ok,
        message: elastosProbe.ok ? 'HEAD 200' : ('failed: ' + (elastosProbe.error || ('HTTP ' + elastosProbe.code))),
        severity: 'required',
    });

    // beta.0.4.7 — snapshot host probe. Council install streams the
    // mainchain snapshot (~10 GB compressed; v0.5.199 mainchain-only)
    // from node-data.elastos.io before the binaries even start; if the
    // host is unreachable we want the operator to know on Card D.5
    // rather than blow up mid-step. EVM chains do NOT use this host
    // post-v0.5.199 (they cold-sync from peers), but the probe is still
    // required because every Council install downloads the mainchain
    // snapshot by default.
    const nodeDataProbe = await headProbe('https://node-data.elastos.io/ela/');
    checks.push({
        id: 'node-data-reachable',
        label: 'node-data.elastos.io reachable (for mainchain snapshot)',
        ok: nodeDataProbe.ok,
        message: nodeDataProbe.ok ? 'HEAD 200' : ('failed: ' + (nodeDataProbe.error || ('HTTP ' + nodeDataProbe.code))),
        severity: 'required',
    });

    // 7. Internet sanity (separate from the per-host probes — flags
    // generic offline-host case with a friendlier message).
    const nodejsProbe = await headProbe('https://nodejs.org/dist/');
    checks.push({
        id: 'nodejs-reachable',
        label: 'nodejs.org reachable (in case Node.js runtime install is needed)',
        ok: nodejsProbe.ok,
        message: nodejsProbe.ok ? 'HEAD 200' : ('failed: ' + (nodejsProbe.error || ('HTTP ' + nodejsProbe.code))),
        // Recommended-only because if the host already has Node v18+
        // we don't need nodejs.org at all (NodeJsRuntime.resolveAny
        // prefers the host install).
        severity: 'recommended',
    });

    const result = {
        ts: now,
        checks,
        allRequiredOk: checks.filter((c) => c.severity === 'required').every((c) => c.ok),
    };
    _preflightCache = { ts: now, result };
    return result;
}

/**
 * Wait until the EnmBinaryDownloader's job for a chainId finishes
 * (phase='done' or 'failed'). Polls every 2s, times out after 15min.
 *
 * @param {object} dl   EnmBinaryDownloader
 * @param {string} chainId
 * @param {object} log
 */
async function waitForBinaryInstall(dl, chainId, log) {
    const startedAt = Date.now();
    const TIMEOUT_MS = 15 * 60_000;
    while (Date.now() - startedAt < TIMEOUT_MS) {
        const status = dl.getStatus(chainId);
        if (status && status.phase === 'done') { return status; }
        if (status && status.phase === 'failed') {
            throw new Error(`binary install failed: ${status.error || 'unknown'}`);
        }
        await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`binary install timed out after ${TIMEOUT_MS / 60000} min`);
}

module.exports = {
    build,
    // Exported for tests.
    _internal: { getCouncilInstallState, runCouncilInstall, waitForBinaryInstall, runCouncilPreflight },
};
