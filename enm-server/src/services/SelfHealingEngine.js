/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * SelfHealingEngine — applies HealthRules detections.
 *
 * Two modes per detection.tier:
 *   AUTOMATED-SAFE  → execute immediately under withChainLock; record audit
 *   OWNER-CONFIRMS  → create an enm_proposals row + emit SSE notification;
 *                     the operator confirms via /api/healing/confirm/:id which
 *                     calls executeApproved() on this engine
 *
 * Restart-attempt budget (Rev 6 audit, agent 6):
 *   AUTOMATED-SAFE F1/F2/F3 actions can fire at most PROCESS_MAX_RESTART_ATTEMPTS
 *   times in PROCESS_RESTART_COOLDOWN_MS * N before escalating the next attempt
 *   to OWNER_CONFIRMS. This prevents thundering-herd restart loops on a chain
 *   that's broken at a deeper layer.
 *
 * Idempotency: the engine deduplicates pending proposals by (chainId, ruleId).
 * Re-fires of the same detection within the proposal's TTL no-op.
 */

'use strict';

const {
    AUDIT_DECISION,
    HEALING_TIERS,
    SEVERITY,
    ENM_LOG_PREFIX,
    PROCESS_MAX_RESTART_ATTEMPTS,
    PROCESS_RESTART_BUDGET_WINDOW_MS,
    EVM_RESYNC_MIN_INTERVAL_MS,
} = require('./EnmConstants');

const ProposalStore = require('./EnmProposalStore');
const AuditLog = require('./EnmAuditLog');
const { withChainLock } = require('./withChainLock');

class SelfHealingEngine {
    /**
     * @param {object} deps
     * @param {object} deps.extensionHandle
     * @param {() => object} deps.getDb         lazy db getter (data may not be ready at ctor time)
     * @param {object} deps.processService      NativeProcessService
     * @param {object} deps.sseHub              SseHub for `notifications` topic
     * @param {string} deps.ownerWallet         lower-cased EVM address for proposal scoping + audit
     */
    constructor(deps) {
        if (!deps || !deps.extensionHandle || typeof deps.getDb !== 'function'
            || !deps.processService || !deps.sseHub) {
            throw new TypeError(
                'SelfHealingEngine: { extensionHandle, getDb, processService, sseHub, ownerWallet } required',
            );
        }
        this.extensionHandle = deps.extensionHandle;
        this.getDb = deps.getDb;
        this.processService = deps.processService;
        this.sseHub = deps.sseHub;
        this.ownerWallet = deps.ownerWallet || null;
        /** @type {Map<string, { count: number, firstAt: number }>} */
        this._restartBudget = new Map();
        // P1 (v0.5.183) — the restart budget is now PERSISTED in the
        // enm_restart_budget table so it survives ENM restarts. The
        // in-memory Map above is kept as a write-through cache for speed;
        // it's rehydrated from the table on first budget access via
        // _ensureBudgetHydrated(). Before this, the budget was in-memory
        // only, so a deep-broken chain on a flapping host got a fresh
        // 3-restarts/10min window on every ENM bounce — defeating the
        // escalation cap that exists to stop thundering-herd restart loops.
        /** @type {Promise<void>|null} memoized one-time table-create + rehydrate */
        this._budgetHydration = null;
        // beta.3.57 — per-(chainId,ruleId) "last proposal" timestamp.
        // Defense-in-depth: even if the DB-level dedupe in
        // _applyOwnerConfirms fails for any reason (race with
        // auto-resolve sweep, TTL expiry, etc.), we won't fire the
        // same rule again within PROPOSAL_RATE_LIMIT_MS. Operator's
        // beta.3.55+ regression saw F4 fire 30+ times in 26 min
        // because auto-resolve cleared pending faster than dedupe
        // could match — this cap is the last-resort safeguard.
        /** @type {Map<string, number>} */
        this._lastProposalAt = new Map();
        // beta.3.68 — engine boot timestamp. Used to suppress the audit
        // row + notification for the FIRST F1 firing in the first
        // POST_DEPLOY_SUPPRESS_MS after engine construction (= ENM
        // extension boot). That F1 is almost certainly the deploy
        // bounce (pc2-node SIGTERMs the extension → child ela dies →
        // new ENM reattaches, finds dead pid, F1 fires within ~10s).
        // The restart STILL happens — just no audit noise for a
        // routine deploy event. The deploy itself is already audited
        // by the HTTP-MUTATION row from /chains/:id/start (or by
        // AUTOSTART when autoStart fires the start). One event per
        // deploy is enough.
        this._bootAtMs = Date.now();
        // beta.3.82 — Wave C item ③ — at-most-one-suppression-per-boot
        // flag. Pre-3.82 the suppression fired for ALL F1 events in the
        // first 30s of ENM boot, hiding legitimate chain crashes that
        // happened to land in that window. Now we suppress at most one
        // (the actual deploy bounce); any subsequent F1 fire in the
        // window is audited normally. Flipped to true on first
        // suppression; never reset until ENM reboots (and the engine
        // is reconstructed with this back at false).
        this._postDeployF1Suppressed = false;
        // beta.3.82 — Wave C item ⑤ — per-chain "we already told the
        // operator this chain is stuck" timestamps so the watchdog
        // doesn't spam CRITICAL_NOTIFY rows every 30s for the same
        // dead chain. Rate-limit per (chain) to STUCK_NOTIFY_COOLDOWN_MS.
        /** @type {Map<string, number>} */
        this._stuckChainNotifiedAt = new Map();
        // P0-2 (v0.5.179) — per-(chainId,ruleId) timestamp of the last
        // auto-recovery restart attempted from an OPEN escalation. Lets a chain
        // that escalated on a TRANSIENT fault recover on its own after a long
        // backoff instead of staying down until a human clicks Confirm — the
        // core requirement for an unattended fleet. See _maybeRetryFromEscalation.
        /** @type {Map<string, number>} */
        this._lastEscalationRetryAt = new Map();
    }

    /**
     * @param {string} ownerWallet  call from setup-complete or owner-rotation
     */
    setOwnerWallet(ownerWallet) {
        this.ownerWallet = ownerWallet ? String(ownerWallet).toLowerCase() : null;
    }

    /**
     * Process a batch of detections from a single tick.
     *
     * @param {string} chainId
     * @param {Array<import('./HealthRules').Detection>} detections
     * @param {object} chainConfig
     */
    async apply(chainId, detections, chainConfig) {
        if (!Array.isArray(detections) || detections.length === 0) {
            return;
        }
        if (!this.ownerWallet) {
            // No owner wallet means setup hasn't claimed an owner yet. Skip
            // healing — proposals would have nowhere to live. Detections still
            // log so the operator sees them in the audit tab once configured.
            for (const d of detections) {
                await this._auditNoOwner(chainId, d);
            }
            return;
        }

        for (const det of detections) {
            try {
                if (det.tier === HEALING_TIERS.AUTOMATED_SAFE) {
                    await this._applyAutomatedSafe(chainId, det, chainConfig);
                } else if (det.tier === HEALING_TIERS.OWNER_CONFIRMS) {
                    await this._applyOwnerConfirms(chainId, det);
                } else {
                    // CRITICAL_NOTIFY / NEVER_AUTOMATIC handled by HealthChecker
                    // notification path; engine just audits the proposal step.
                    await this._auditOnly(chainId, det);
                }
            } catch (err) {
                this.extensionHandle.log.error(
                    `${ENM_LOG_PREFIX} healing apply ${chainId}/${det.ruleId} error: ${err.message}`,
                );
                await this._auditFailure(chainId, det, err);
            }
        }
    }

    /**
     * Called from /api/healing/confirm/:id route after operator approval.
     * Re-fetches the proposal under wallet+pending guard, transitions
     * pending → approved, executes the action, then marks executed/failed.
     *
     * @param {string} proposalId
     * @param {string} walletAddress  must match proposal's owner
     * @param {object} [opts]
     * @param {string|null} [opts.antiSnipePassword]  required when the proposal
     *   payload's requireAntiSnipe flag is set AND the operator has configured
     *   nodeConfig.antiSnipePasswordHash. Verified against the stored hash
     *   before approval; mismatch returns 401-shaped { ok: false, error }.
     * @returns {Promise<{ ok: boolean, proposal: object|null, executed?: boolean, error?: string }>}
     */
    async executeApproved(proposalId, walletAddress, opts) {
        const db = this.getDb();
        const owner = String(walletAddress || '').toLowerCase();
        const antiSnipePassword = (opts && typeof opts.antiSnipePassword === 'string')
            ? opts.antiSnipePassword : null;

        const proposal = await ProposalStore.getById(db, proposalId);
        if (!proposal) {
            return { ok: false, error: 'Proposal not found.' };
        }
        if (proposal.wallet_address !== owner) {
            return { ok: false, error: 'Proposal does not belong to this wallet.' };
        }
        if (proposal.status !== ProposalStore.STATUS.PENDING) {
            return {
                ok: false,
                proposal,
                error: 'Proposal is no longer pending — refresh to see its current status.',
            };
        }

        // 0.2.0-beta.3.9 — anti-snipe verification. The proposal's
        // payload may set requireAntiSnipe=true (the rule that
        // produced it wants a password gate on confirm). The
        // password's bcrypt-hash lives on nodeConfig at boot. If
        // either is missing/mismatched, refuse the approval. The
        // pre-beta.3.9 path silently accepted any confirm.
        const payload = ProposalStore.decodePayload(proposal);
        if (payload && payload.requireAntiSnipe) {
            const verified = await this._verifyAntiSnipePassword(antiSnipePassword);
            if (!verified) {
                return {
                    ok: false,
                    proposal,
                    error: 'Anti-snipe password verification failed.',
                };
            }
        }

        const approved = await ProposalStore.approve(db, proposalId);
        if (!approved) {
            // Race: another thread approved/expired between getById and approve.
            const fresh = await ProposalStore.getById(db, proposalId);
            return { ok: false, proposal: fresh, error: 'Proposal could not be approved (already settled).' };
        }

        const startedAt = Date.now();
        let execResult = { success: false, outcome: 'unhandled' };
        try {
            execResult = await this._executePayload(approved);
        } catch (err) {
            execResult = { success: false, outcome: err.message };
        }

        const finalRow = await ProposalStore.markExecuted(db, proposalId, execResult);
        await AuditLog.append(db, {
            walletAddress: owner,
            chainId: approved.chain_id,
            ruleId: approved.rule_id,
            tier: HEALING_TIERS.OWNER_CONFIRMS,
            decision: execResult.success ? AUDIT_DECISION.EXECUTED : AUDIT_DECISION.FAILED,
            executor: owner,
            outcome: execResult.outcome,
            durationMs: Date.now() - startedAt,
            payload: ProposalStore.decodePayload(approved),
        });

        return { ok: true, proposal: finalRow, executed: execResult.success };
    }

    /**
     * Called from /api/healing/reject/:id route.
     *
     * @param {string} proposalId
     * @param {string} walletAddress
     * @param {string} [reason]
     */
    async rejectProposal(proposalId, walletAddress, reason) {
        const db = this.getDb();
        const owner = String(walletAddress || '').toLowerCase();

        const proposal = await ProposalStore.getById(db, proposalId);
        if (!proposal) {
            return { ok: false, error: 'Proposal not found.' };
        }
        if (proposal.wallet_address !== owner) {
            return { ok: false, error: 'Proposal does not belong to this wallet.' };
        }
        if (proposal.status !== ProposalStore.STATUS.PENDING) {
            return { ok: false, proposal, error: 'Proposal is no longer pending — refresh to see its current status.' };
        }

        const updated = await ProposalStore.reject(db, proposalId, reason);
        await AuditLog.append(db, {
            walletAddress: owner,
            chainId: proposal.chain_id,
            ruleId: proposal.rule_id,
            tier: HEALING_TIERS.OWNER_CONFIRMS,
            decision: AUDIT_DECISION.REJECTED,
            executor: owner,
            outcome: reason ? `rejected: ${reason}` : 'rejected',
            payload: ProposalStore.decodePayload(proposal),
        });
        return { ok: true, proposal: updated };
    }

    // ========================================================================
    // Internal — automated-safe path
    // ========================================================================

    /** @private */
    async _applyAutomatedSafe(chainId, det, chainConfig) {
        // beta.3.80 — Wave A item ① — honour the master "auto-execute
        // safe healing" toggle from Settings → Security. Prior to this
        // it was persisted via PUT /config/general but never read; the
        // operator-facing switch was dead. Treat undefined as true
        // (preserves the default-on behaviour for any config that never
        // explicitly set the field).
        //
        // ConfigStore.load() is cached by mtime so the hot-path cost is
        // a single fs.stat per tick — negligible.
        try {
            const ConfigStore = require('./ConfigStore');
            const cfg = await ConfigStore.load();
            const autoSafe = cfg && cfg.global && cfg.global.healing
                ? cfg.global.healing.autoExecuteSafe
                : undefined;
            if (autoSafe === false) {
                // Audit the skip so the operator can confirm the gate
                // is engaged + which rule was suppressed. Failure to
                // write the audit row is non-fatal — we must not silently
                // bypass the gate just because the DB hiccupped.
                try {
                    const db = this.getDb();
                    await AuditLog.append(db, {
                        walletAddress: 'system',
                        chainId,
                        ruleId: det.ruleId,
                        tier: HEALING_TIERS.AUTOMATED_SAFE,
                        decision: AUDIT_DECISION.SKIPPED,
                        executor: 'system',
                        outcome: 'Auto-execute safe healing is off — operator must intervene manually.',
                        durationMs: 0,
                        payload: det.payload || null,
                    });
                } catch (auditErr) {
                    this.extensionHandle.log.debug(
                        `${ENM_LOG_PREFIX} ${chainId}/${det.ruleId} skip-audit failed (non-fatal): ${auditErr.message}`,
                    );
                }
                this.extensionHandle.log.info(
                    `${ENM_LOG_PREFIX} ${chainId}/${det.ruleId} skipped — autoExecuteSafe toggle is off.`,
                );
                return;
            }
        } catch (cfgErr) {
            // Fail-open: if config can't load, preserve default-on
            // behaviour. A dead engine that won't heal because config
            // is unreadable is worse than one that heals with a
            // possibly-stale "on" assumption — operator can always
            // toggle off again once config is reachable.
            this.extensionHandle.log.debug(
                `${ENM_LOG_PREFIX} ${chainId}/${det.ruleId} autoExecuteSafe probe failed (non-fatal): ${cfgErr.message}`,
            );
        }
        // Restart-loop budget: count attempts within a rolling window.
        if (this._isRestartAction(det)) {
            // beta.3.58 — if an OWNER-CONFIRMS escalation proposal for
            // the SAME rule on this chain is already pending, the
            // operator has been notified and the auto-restart cycle
            // must STOP — repeated restarts won't fix the underlying
            // issue (otherwise we wouldn't have escalated). Each
            // budget-window reset (every 10 min) would otherwise fire
            // 3 more attempts indefinitely. Operator complaint on 3.56
            // showed F2 cycling 3 restarts every 10 min for 1+ hour
            // while the chain was actually stuck in arbitrator-state
            // mismatch (restart can't fix). Defer to operator action.
            let escalationOpen = false;
            let pendingProp = null;
            try {
                const db = this.getDb();
                const pending = await ProposalStore.listPendingByChain(db, chainId);
                pendingProp = pending.find((p) => p.rule_id === det.ruleId) || null;
                escalationOpen = !!pendingProp;
            } catch (err) {
                // listPendingByChain failure shouldn't block healing — worst
                // case we proceed to the budget check below.
                this.extensionHandle.log.debug(
                    `${ENM_LOG_PREFIX} ${chainId}/${det.ruleId} pending-proposal probe failed (non-fatal): ${err.message}`,
                );
            }

            if (escalationOpen) {
                // P0-2 (v0.5.179) — an open escalation USED to suppress all
                // further auto-restarts indefinitely (a bare `return`), so a chain
                // that escalated on a TRANSIENT fault (e.g. a 10-min upstream
                // outage that burned the 3-restart budget) stayed DOWN until a
                // human clicked Confirm — unacceptable for an unattended fleet.
                // Now: after a long backoff, attempt ONE more auto-restart (budget
                // reset) so a transient fault self-recovers. The proposal stays
                // open for visibility; a genuinely-broken chain just keeps failing
                // + re-escalating on this slow cadence instead of staying dead.
                if (!(await this._maybeRetryFromEscalation(chainId, det.ruleId, pendingProp))) {
                    return; // still within the backoff window — defer to operator
                }
                // past backoff → fall through to the restart below (the budget was
                // reset inside _maybeRetryFromEscalation, so skip the consume gate).
            } else {
                // Note: F1's detectF1 in HealthRules.js already gates on
                // snap.processExit.manualStop, so a manually-stopped chain
                // never reaches this path.
                const allowed = await this._consumeRestartBudget(chainId);
                if (!allowed) {
                    // Escalate: convert this AUTOMATED-SAFE into an OWNER-CONFIRMS.
                    this.extensionHandle.log.warn(
                        `${ENM_LOG_PREFIX} ${chainId}/${det.ruleId} budget exhausted — escalating to OWNER-CONFIRMS`,
                    );
                    const escalated = {
                        ...det,
                        tier: HEALING_TIERS.OWNER_CONFIRMS,
                        summaryReason:
                            (det.summaryReason || '') +
                            ' (escalated after multiple auto-restart attempts)',
                    };
                    return this._applyOwnerConfirms(chainId, escalated);
                }
            }
        }

        // v0.5.184 — F26 resync budget. The resync is DESTRUCTIVE (wipe +
        // re-sync from genesis), so unlike the restart budget (3 / 10 min) we
        // allow AT MOST ONE automatic resync per chain per
        // EVM_RESYNC_MIN_INTERVAL_MS (24h). If the chain re-forked inside that
        // window the resync didn't durably help — escalate to OWNER_CONFIRMS
        // rather than wiping in a destructive loop. The "did we resync
        // recently?" lookup is the audit log (persisted; survives an ENM
        // restart) so a deploy bounce can't reset the guard.
        if (this._isResyncAction(det)) {
            let recentResync = false;
            try {
                const adb = this.getDb();
                const since = Date.now() - EVM_RESYNC_MIN_INTERVAL_MS;
                const rows = await AuditLog.query(adb, { chainId, fromTs: since, limit: 100 });
                recentResync = Array.isArray(rows) && rows.some((r) =>
                    r.rule_id === 'F26' && r.decision === AUDIT_DECISION.EXECUTED);
            } catch (err) {
                // Fail SAFE: on an unknown budget state, do NOT auto-wipe —
                // escalate to the operator instead of risking a wipe loop.
                this.extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} ${chainId}/F26 resync-budget lookup failed (${err.message}) `
                    + '— escalating to OWNER_CONFIRMS to be safe',
                );
                recentResync = true;
            }
            if (recentResync) {
                this.extensionHandle.log.warn(
                    `${ENM_LOG_PREFIX} ${chainId}/F26 already auto-resynced within `
                    + `${Math.round(EVM_RESYNC_MIN_INTERVAL_MS / 3_600_000)}h — escalating to `
                    + 'OWNER_CONFIRMS (chain re-forked; not wiping again automatically)',
                );
                const escalated = {
                    ...det,
                    tier: HEALING_TIERS.OWNER_CONFIRMS,
                    summaryReason:
                        (det.summaryReason || '')
                        + ' NOTE: this chain was already auto-resynced once in the last 24h and '
                        + 'forked again — confirm to resync once more, or check the peer set / '
                        + 'bootnodes (a wipe alone may not durably fix a recurring fork).',
                };
                return this._applyOwnerConfirms(chainId, escalated);
            }
        }

        const startedAt = Date.now();
        const db = this.getDb();
        let outcome = 'success';
        let success = true;
        try {
            // v0.5.184 — branch the executor by action. F26 wipes+resyncs;
            // every other AUTOMATED_SAFE detection is a restart.
            if (this._isResyncAction(det)) {
                await this._executeChainResync(chainId);
            } else
            // beta.3.54 — DROPPED outer withChainLock. _executeRestart calls
            // processService.restart, which already wraps itself in
            // withChainLock(chainId). Nested locks on the SAME chainId deadlock
            // (withChainLock is FIFO non-reentrant per its own docstring).
            // Result before this fix: F1 detection ran successfully through
            // the budget check, but the restart hung forever inside the inner
            // lock. No audit row was written (the row was after the deadlocked
            // await), no error was thrown, no restart happened. Eventually the
            // budget counter (synchronous, no lock needed) exhausted and the
            // engine escalated to OWNER-CONFIRMS — the only F1 audit row that
            // ever appeared.
            //
            // Single lock is sufficient: the operator's HTTP /restart route
            // and our F1 path both end up in processService.restart's own
            // lock, so they serialize correctly.
            //
            // beta.3.78 — state-restore dispatch removed with the
            // snapshot service. F22 detections now propose alert-only;
            // they don't reach this AUTOMATED_SAFE path.
            await this._executeRestart(chainId, chainConfig);
        } catch (err) {
            success = false;
            outcome = err.message;
            this.extensionHandle.log.error(
                `${ENM_LOG_PREFIX} ${chainId}/${det.ruleId} automated-safe failed: ${err.message}`,
            );
        }
        // beta.3.68 — suppress audit row + notification for the routine
        // post-deploy F1 bounce. After a deploy, ENM extension boots,
        // reattach finds dead ela (pc2-node killed the process group),
        // F1 fires within ~10s, restart succeeds. That's not a notable
        // chain event — operator was annoyed seeing 3+ "Auto-restarted"
        // rows per deploy day. Conditions:
        //   - rule is F1 (other rules don't have this pattern)
        //   - within POST_DEPLOY_SUPPRESS_MS of engine boot
        //   - restart succeeded (failures still get audited so a
        //     stuck post-deploy state surfaces normally)
        //
        // The restart STILL ran above; we only skip the row + toast.
        // Internal log line stays so SSH-level forensics still show
        // what happened.
        const POST_DEPLOY_SUPPRESS_MS = 30_000;
        // beta.3.82 — Wave C item ③ — tighter suppression. Suppress at
        // most ONE F1 per ENM boot (the actual deploy bounce). Any
        // subsequent F1 within the 30s window is a legitimate chain
        // crash and gets the full audit + SSE notification.
        const isFirstF1InBootWindow = success
            && det && det.ruleId === 'F1'
            && this._isRestartAction(det)
            && (Date.now() - this._bootAtMs) < POST_DEPLOY_SUPPRESS_MS
            && !this._postDeployF1Suppressed;
        if (isFirstF1InBootWindow) {
            this._postDeployF1Suppressed = true;
            this.extensionHandle.log.info(
                `${ENM_LOG_PREFIX} ${chainId}/F1 fired within ${Math.round((Date.now() - this._bootAtMs) / 1000)}s of boot — suppressing audit row (first F1 post-deploy bounce; subsequent F1 fires in this window will be audited).`,
            );
            return;
        }
        // beta.3.80 — Wave A item ② — attribute autonomous engine actions
        // to the literal string 'system'. Pre-3.80 we wrote
        // `walletAddress: this.ownerWallet` which made every F1/AUTOSTART
        // audit row look operator-initiated (e.g. "wallet:
        // 0xf0e57...") even though `executor: 'system'` was set right
        // next to it. Operators reading the audit log couldn't tell
        // "I did this" from "the engine did this". The two fields
        // now agree.
        await AuditLog.append(db, {
            walletAddress: 'system',
            chainId,
            ruleId: det.ruleId,
            tier: HEALING_TIERS.AUTOMATED_SAFE,
            decision: success ? AUDIT_DECISION.EXECUTED : AUDIT_DECISION.FAILED,
            executor: 'system',
            outcome,
            durationMs: Date.now() - startedAt,
            payload: det.payload || null,
        });
        this._publishNotification({
            chainId,
            ruleId: det.ruleId,
            severity: success ? SEVERITY.HEALING : SEVERITY.WARNING,
            summary: det.summaryAction,
            detail: success ? 'Auto-healed.' : `Auto-heal failed: ${outcome}`,
        });
    }

    /** @private */
    _isRestartAction(det) {
        return det && det.payload && det.payload.action === 'restart';
    }

    /** @private — v0.5.184 — F26's wipe+resync action (Class B wedged fork). */
    _isResyncAction(det) {
        return det && det.payload && det.payload.action === 'evm-fork-resync';
    }

    /**
     * P0-2 — decide whether to attempt ONE auto-recovery restart from an OPEN
     * escalation. Returns true (and resets the restart budget) at most once per
     * ESCALATION_RETRY_BACKOFF_MS per (chain,rule); false to keep deferring to
     * the operator. The first eligible retry is gated off the proposal's age, and
     * subsequent ones off the last retry we attempted.
     * @private
     */
    async _maybeRetryFromEscalation(chainId, ruleId, pendingProp) {
        const ESCALATION_RETRY_BACKOFF_MS = 30 * 60_000; // 30 min
        const key = `${chainId}:${ruleId}`;
        const lastRetry = this._lastEscalationRetryAt.get(key);
        const since = (typeof lastRetry === 'number')
            ? lastRetry
            : (pendingProp && Number(pendingProp.created_at)) || 0;
        if (Date.now() - since < ESCALATION_RETRY_BACKOFF_MS) {
            return false;
        }
        this._lastEscalationRetryAt.set(key, Date.now());
        await this._resetRestartBudget(chainId);
        this.extensionHandle.log.warn(
            `${ENM_LOG_PREFIX} ${chainId}/${ruleId} escalated + idle ≥`
            + `${Math.round(ESCALATION_RETRY_BACKOFF_MS / 60_000)}min — attempting one `
            + 'auto-recovery restart (proposal stays open for operator visibility)',
        );
        return true;
    }

    /**
     * P1 (v0.5.183) — ensure the enm_restart_budget table exists and the
     * in-memory cache has been rehydrated from it. Memoized so the
     * CREATE + SELECT runs at most once per engine lifetime; subsequent
     * budget operations resolve the cached promise immediately.
     *
     * getDb() returns the { write, read } wrapper (async). We rehydrate so
     * a chain's count carries across the ENM bounce that just reconstructed
     * this engine. Best-effort: a DB hiccup here must not block healing, so
     * on failure we proceed with whatever the in-memory Map holds (the
     * pre-3.183 behaviour) rather than throwing.
     * @private
     */
    _ensureBudgetHydrated() {
        if (this._budgetHydration) {
            return this._budgetHydration;
        }
        this._budgetHydration = (async () => {
            const db = this.getDb();
            await ProposalStore.initSchema(db);
            const rows = await db.read(
                'SELECT chain_id, count, first_at FROM enm_restart_budget',
                [],
            );
            if (Array.isArray(rows)) {
                for (const r of rows) {
                    if (r && r.chain_id != null) {
                        this._restartBudget.set(String(r.chain_id), {
                            count: Number(r.count) || 0,
                            firstAt: Number(r.first_at) || 0,
                        });
                    }
                }
            }
        })().catch((err) => {
            this.extensionHandle.log.warn(
                `${ENM_LOG_PREFIX} restart-budget hydrate failed (non-fatal): ${err.message}`,
            );
        });
        return this._budgetHydration;
    }

    /**
     * P1 (v0.5.183) — write-through a chain's budget row to the persisted
     * table. Best-effort: a failed persist falls back to in-memory-only
     * (no worse than the pre-3.183 behaviour). @private
     */
    async _persistBudget(chainId, entry) {
        try {
            const db = this.getDb();
            await db.write(
                `INSERT INTO enm_restart_budget (chain_id, count, first_at)
                 VALUES (?, ?, ?)
                 ON CONFLICT(chain_id) DO UPDATE SET count = excluded.count, first_at = excluded.first_at`,
                [String(chainId), entry.count, entry.firstAt],
            );
        } catch (err) {
            this.extensionHandle.log.warn(
                `${ENM_LOG_PREFIX} ${chainId} restart-budget persist failed (non-fatal): ${err.message}`,
            );
        }
    }

    /**
     * P1 (v0.5.183) — clear a chain's restart budget so the next consume
     * starts fresh. Now also deletes the persisted row (write-through).
     * @private
     */
    async _resetRestartBudget(chainId) {
        await this._ensureBudgetHydrated();
        this._restartBudget.delete(chainId);
        try {
            const db = this.getDb();
            await db.write('DELETE FROM enm_restart_budget WHERE chain_id = ?', [String(chainId)]);
        } catch (err) {
            this.extensionHandle.log.warn(
                `${ENM_LOG_PREFIX} ${chainId} restart-budget reset persist failed (non-fatal): ${err.message}`,
            );
        }
    }

    // beta.3.78 — _isStateRestoreAction + _executeStateRestore removed
    // with the snapshot service. State desync recovery is now operator-
    // driven: F22 alerts with manual steps (stop chain, delete corrupt
    // cp_dpos checkpoint, restart, let ela rebuild from blocks).

    /**
     * @private
     * P1 (v0.5.183) — async because the budget is now persisted (write-through
     * to enm_restart_budget) so it survives ENM restarts. Window math
     * (PROCESS_RESTART_BUDGET_WINDOW_MS, PROCESS_MAX_RESTART_ATTEMPTS) is
     * unchanged.
     */
    async _consumeRestartBudget(chainId) {
        await this._ensureBudgetHydrated();
        // Rolling window per Rev 9 plan: at most PROCESS_MAX_RESTART_ATTEMPTS
        // automated restarts per PROCESS_RESTART_BUDGET_WINDOW_MS. Beyond
        // that, the engine escalates to OWNER-CONFIRMS so the operator can
        // intervene rather than burn cycles on a chain broken below the
        // restart-fixable layer.
        const now = Date.now();
        const cur = this._restartBudget.get(chainId);
        // Use >= so that exactly-at-window restarts reset the counter
        // (was > strict; an exact-window restart was treating the old
        // count as still hot, leaving the operator stuck in budget-
        // exhausted state until the next restart bumped it past).
        if (!cur || (now - cur.firstAt) >= PROCESS_RESTART_BUDGET_WINDOW_MS) {
            const entry = { count: 1, firstAt: now };
            this._restartBudget.set(chainId, entry);
            await this._persistBudget(chainId, entry);
            return true;
        }
        if (cur.count >= PROCESS_MAX_RESTART_ATTEMPTS) {
            return false;
        }
        cur.count += 1;
        await this._persistBudget(chainId, cur);
        return true;
    }

    /** @private */
    async _executeRestart(chainId, chainConfig) {
        // The chainConfig must include binaryPath; the chains-route layer
        // already merged user config into a runnable shape before HealthChecker
        // ever reaches us (Phase 2 contract).
        //
        // BUG-C6b (v0.5.158) — route the automated restart through the chain's
        // ADAPTER, exactly like POST /chains/:id/restart. Class B (EVM,
        // spawnArgs) and Class C (oracle, spawnEnv) build their spawn recipe
        // inside adapter.start(); calling processService.restart() directly
        // with a bare chainConfig (no spawnArgs) tripped NativeProcessService's
        // config.json precondition ("config.json missing"), so self-heal could
        // NEVER recover a sidechain/oracle after it exited — they stayed down
        // until OWNER-CONFIRMS (cycle-4 turnkey finding). ela mainchain
        // (config.json-based) still works on the fallback path if its adapter
        // is somehow unavailable.
        let adapter = null;
        try {
            const ChainRegistry = require('./ChainRegistry');
            adapter = ChainRegistry.getAdapter(chainId);
        } catch (_) { adapter = null; }
        if (adapter && typeof adapter.restart === 'function') {
            // Load the authoritative runnable cfg (same shape the manual
            // route passes) so the adapter can rebuild spawnArgs/spawnEnv.
            let runCfg = chainConfig;
            try {
                const ConfigStore = require('./ConfigStore');
                const cfg = await ConfigStore.load();
                if (cfg && cfg.chains && cfg.chains[chainId]) {
                    runCfg = cfg.chains[chainId];
                }
            } catch (_) { /* fall back to the passed chainConfig */ }
            // P0-3 (v0.5.182) — ensure the binary is on disk before restarting. A
            // vanished binary (interrupted download, manual delete, disk issue)
            // otherwise makes adapter.start() throw with no recovery → crash-loop →
            // quarantine → manual SSH. Auto-redownload first. Only binary-downloader
            // chains (A=ela, B=EVM, D=arbiter); oracles (C) use the Node runtime.
            if (adapter.chainClass === 'A' || adapter.chainClass === 'B' || adapter.chainClass === 'D') {
                await this._ensureBinaryPresent(chainId);
            }
            return adapter.restart(runCfg);
        }
        return this.processService.restart(chainId, chainConfig);
    }

    /**
     * v0.5.231 — Final sanity check before an operator-confirmed evm-fork-resync
     * actually destroys chaindata. The OWNER_CONFIRMS path can leave a proposal
     * sitting in the dashboard for minutes-to-hours; by the time the operator
     * clicks confirm, peers may have re-converged or a slow sync may have caught
     * up. We re-poll the chain's RPC and abort the wipe if:
     *
     *   - the local height has advanced ≥ ABORT_PROGRESS_BLOCKS past the
     *     stuckHeight recorded in the proposal payload (chain is recovering), OR
     *   - the RPC is unreachable (we cannot confirm the condition still exists,
     *     so we refuse to wipe; fail safe).
     *
     * On abort we write an AuditLog row so the dashboard shows why nothing
     * happened. Returns `{abort:true, outcome:string}` to abort, or null to
     * proceed with the wipe.
     *
     * @param {object} proposal
     * @param {object} payload   decoded proposal.payload
     * @returns {Promise<{abort:boolean, outcome:string}|null>}
     * @private
     */
    async _preWipeRecheck(proposal, payload) {
        const ABORT_PROGRESS_BLOCKS = 50;
        const chainId = proposal.chain_id;
        const stuckHeight = (payload && typeof payload.stuckHeight === 'number')
            ? payload.stuckHeight : null;
        if (stuckHeight === null) {
            return null; // legacy proposal with no stuckHeight — proceed as before
        }
        let currentHeight = null;
        try {
            const cfg = await this._loadChainConfig(chainId);
            const port = cfg && cfg.ports && cfg.ports.rpc;
            if (!port) {
                throw new Error('no RPC port configured');
            }
            const { EthRpcClient } = require('./EthRpcClient');
            const client = new EthRpcClient({ host: '127.0.0.1', port, timeoutMs: 3000 });
            // getBlockNumber returns a parsed Number; throws on RPC error.
            currentHeight = await client.getBlockNumber();
            if (!Number.isFinite(currentHeight)) {
                throw new Error(`eth_blockNumber returned non-finite: ${currentHeight}`);
            }
        } catch (err) {
            const outcome = `Aborted pre-wipe: RPC unreachable (${err.message}) — refusing to destroy chaindata without confirming the chain is still stuck`;
            await this._appendPreWipeAbortAudit(proposal, payload, outcome);
            return { abort: true, outcome };
        }
        if (currentHeight > stuckHeight + ABORT_PROGRESS_BLOCKS) {
            const outcome = `Aborted pre-wipe: chain advanced from stuck height ${stuckHeight} to ${currentHeight} (${currentHeight - stuckHeight} blocks) since the proposal was raised — chain is recovering, no wipe needed`;
            await this._appendPreWipeAbortAudit(proposal, payload, outcome);
            return { abort: true, outcome };
        }
        return null;
    }

    /** @private */
    async _appendPreWipeAbortAudit(proposal, payload, outcome) {
        try {
            const db = this.getDb();
            await AuditLog.append(db, {
                walletAddress: proposal.wallet_address || this.ownerWallet,
                chainId: proposal.chain_id,
                ruleId: proposal.rule_id || 'F26',
                tier: HEALING_TIERS.OWNER_CONFIRMS,
                decision: AUDIT_DECISION.EXECUTED, // operator did confirm; we declined
                executor: 'system',
                outcome,
                payload: payload || null,
            });
        } catch (err) {
            this.extensionHandle.log.warn(
                `${ENM_LOG_PREFIX} pre-wipe-abort audit append failed (${err.message}) — abort itself succeeded`,
            );
        }
    }

    /**
     * v0.5.184 — F26 executor. Wipe the forked EVM chaindata (mining keystore
     * preserved) and re-sync clean from peers, via EnmMaintenanceManager's
     * autoRestart path. That manager acquires its OWN maintenance lock and
     * drives adapter.stop()/start() (each per-chain locked internally) — so we
     * deliberately do NOT wrap an outer withChainLock here (the same nested-
     * lock deadlock hazard _executeRestart documents). Throws on failure so the
     * caller records a FAILED audit row.
     *
     * @param {string} chainId
     * @private
     */
    async _executeChainResync(chainId) {
        const MaintenanceManager = require('./EnmMaintenanceManager');
        const result = await MaintenanceManager.chainResync({
            chainId,
            autoRestart: true,
            log: this.extensionHandle.log,
        });
        // chainResync swallows a failed restart (logs + returns autoRestarted
        // false) so the wipe isn't lost; surface it here as a FAILED heal so
        // the operator sees the chain is wiped-but-down and the next autostart
        // (or a manual start) brings it up.
        if (!result || result.autoRestarted !== true) {
            throw new Error(
                `chain-resync wiped ${chainId} but the chain did not restart — `
                + 'it will come up on the next autostart or a manual start',
            );
        }
        return result;
    }

    /**
     * P0-3 — if a chain's binary is missing from disk, auto-redownload it before
     * the (re)start so a vanished binary self-heals instead of crash-looping into
     * quarantine. Best-effort + never throws: on any failure we log and let the
     * subsequent start surface the real error (no worse than before).
     *
     * @param {string} chainId
     * @private
     */
    async _ensureBinaryPresent(chainId) {
        let dl;
        try { dl = require('./ChainRegistry').getBinaryDownloader(); } catch (_) { return; }
        if (!dl || typeof dl.resolveOnDisk !== 'function') { return; }
        let onDisk = null;
        try { onDisk = await dl.resolveOnDisk(chainId); } catch (_) { return; }
        // resolveOnDisk only returns a path it actually located on disk, so a
        // non-null binaryPath means the binary is present. null = missing.
        if (onDisk && onDisk.binaryPath) { return; }
        try {
            this.extensionHandle.log.warn(
                `${ENM_LOG_PREFIX} ${chainId}: binary missing on disk — auto-redownloading before restart (P0-3)`,
            );
            await dl.start(chainId);
            this.extensionHandle.log.info(
                `${ENM_LOG_PREFIX} ${chainId}: binary redownload complete — proceeding with restart`,
            );
        } catch (err) {
            this.extensionHandle.log.warn(
                `${ENM_LOG_PREFIX} ${chainId}: binary redownload failed (${err && err.message ? err.message : err}) `
                + '— proceeding; the restart will surface the underlying error',
            );
        }
    }

    // ========================================================================
    // Internal — owner-confirms path
    // ========================================================================

    /** @private */
    async _applyOwnerConfirms(chainId, det) {
        // Serialize per-chain so two concurrent fast/medium/slow ticks can't
        // both walk past listPending and double-insert (Phase 4 audit, agent 1).
        return withChainLock(`enm-proposal:${chainId}`, async () => {
            const db = this.getDb();
            // beta.3.57 — per-(chain,rule) rate limit. Independent of the
            // DB dedupe below; covers the case where a previous proposal
            // was auto-resolved (or expired) and the rule fires again
            // before the underlying condition has had time to actually
            // change. Without this, F4 in beta.3.55+ created 30+
            // proposals in 26 min on a test node (fast-tick rate).
            //
            // beta.3.61 — bumped 30min → 90min. With the previous 30min
            // value, a permanently-stuck chain still got an F4 proposal
            // EVERY HOUR because: proposal TTL is 1hr → expires → 30min
            // rate-limit had already passed (since previous proposal at
            // T-1hr) → next F4 detection fires a new proposal. Operator
            // saw 476 auto_resolved + 12 expired F4 proposals over 24h
            // on a test node with this pattern (every :29:37 sharp).
            // 90min > 60min TTL → the window always overlaps an
            // already-expired proposal, blocking the re-fire.
            const PROPOSAL_RATE_LIMIT_MS = 90 * 60_000;
            const rateKey = `${chainId}:${det.ruleId}`;
            const lastAt = this._lastProposalAt.get(rateKey);
            if (lastAt && (Date.now() - lastAt) < PROPOSAL_RATE_LIMIT_MS) {
                return; // recently proposed — silently drop the dup tick
            }
            const existing = await ProposalStore.listPending(db, this.ownerWallet);
            const dup = existing.find((p) => p.chain_id === chainId && p.rule_id === det.ruleId);
            if (dup) {
                return; // already represented in the dashboard
            }
            // Record rate-limit timestamp BEFORE the create so a concurrent
            // tick that's already past the dedupe also gets blocked. Cleared
            // automatically by the 30-min window expiry.
            this._lastProposalAt.set(rateKey, Date.now());
            const proposal = await ProposalStore.create(db, {
                walletAddress: this.ownerWallet,
                chainId,
                ruleId: det.ruleId,
                type: `enm.healing.${det.ruleId.toLowerCase()}`,
                summaryAction: det.summaryAction,
                summaryReason: det.summaryReason,
                payload: det.payload || null,
            });
            await AuditLog.append(db, {
                walletAddress: this.ownerWallet,
                chainId,
                ruleId: det.ruleId,
                tier: HEALING_TIERS.OWNER_CONFIRMS,
                decision: AUDIT_DECISION.PROPOSED,
                executor: 'system',
                outcome: 'Awaiting operator confirmation.',
                payload: det.payload || null,
            });
            this._publishNotification({
                chainId,
                ruleId: det.ruleId,
                severity: det.severity || SEVERITY.WARNING,
                summary: det.summaryAction,
                detail: det.summaryReason || '',
                proposalId: proposal.id,
            });
        });
    }

    /** @private */
    async _auditOnly(chainId, det) {
        const db = this.getDb();
        await AuditLog.append(db, {
            walletAddress: this.ownerWallet,
            chainId,
            ruleId: det.ruleId,
            tier: det.tier || HEALING_TIERS.CRITICAL_NOTIFY,
            decision: AUDIT_DECISION.MANUAL_ONLY,
            executor: 'system',
            outcome: det.summaryAction,
            payload: det.payload || null,
        });
        this._publishNotification({
            chainId,
            ruleId: det.ruleId,
            severity: det.severity || SEVERITY.CRITICAL,
            summary: det.summaryAction,
            detail: det.summaryReason || '',
        });
    }

    /** @private */
    async _auditNoOwner(chainId, det) {
        // Detection fired before setup completed — log a placeholder row so
        // the audit tab eventually shows the operator we noticed.
        try {
            const db = this.getDb();
            await AuditLog.append(db, {
                walletAddress: '__pre_setup__',
                chainId,
                ruleId: det.ruleId,
                tier: det.tier || HEALING_TIERS.CRITICAL_NOTIFY,
                decision: AUDIT_DECISION.MANUAL_ONLY,
                executor: 'system',
                outcome: 'no-owner-skip',
                payload: det.payload || null,
            });
        } catch (err) {
            // Non-fatal: db may not yet be wired during boot.
            this.extensionHandle.log.debug(
                `${ENM_LOG_PREFIX} preview audit write failed (${err.message}) — likely DB not ready`,
            );
        }
    }

    /** @private */
    async _auditFailure(chainId, det, err) {
        try {
            const db = this.getDb();
            await AuditLog.append(db, {
                walletAddress: this.ownerWallet || '__pre_setup__',
                chainId,
                ruleId: det.ruleId,
                tier: det.tier || HEALING_TIERS.CRITICAL_NOTIFY,
                decision: AUDIT_DECISION.FAILED,
                executor: 'system',
                outcome: err.message,
                payload: det.payload || null,
            });
        } catch (_) { /* swallow secondary failure */ }
    }

    /**
     * beta.3.82 — Wave C item ⑤ — stuck-chain watchdog.
     *
     * Background: the 23:56:42 test-node incident showed F1 can silently
     * stop firing on a dead chain when an OWNER_CONFIRMS escalation
     * proposal already exists for the same rule on that chain (the
     * "escalationOpen" guard in _applyAutomatedSafe returns early to
     * avoid spam). If the operator never sees that original proposal
     * (browser closed, SSE missed, page refreshed past it), the chain
     * sits dead indefinitely with no further notifications.
     *
     * This watchdog is the safety net: HealthChecker calls it from its
     * medium-tick whenever a chain has been dead for >STUCK_GRACE_MS
     * (5 min) and the death wasn't operator-initiated. We emit a
     * CRITICAL_NOTIFY audit row + SSE notification at most once per
     * STUCK_NOTIFY_COOLDOWN_MS (30 min) per chain, so the operator
     * gets a fresh reminder every half hour the chain stays down.
     *
     * The watchdog's audit row uses a synthetic ruleId 'STUCK' so it's
     * easy to filter from real F-rule activity in the Activity tab.
     *
     * @param {string} chainId
     * @param {number} stoppedSinceMs  how long the chain has been dead
     */
    async notifyStuckChain(chainId, stoppedSinceMs) {
        const STUCK_NOTIFY_COOLDOWN_MS = 30 * 60_000;
        const lastAt = this._stuckChainNotifiedAt.get(chainId);
        if (lastAt && (Date.now() - lastAt) < STUCK_NOTIFY_COOLDOWN_MS) {
            return; // silent — operator was already notified within the cooldown
        }
        this._stuckChainNotifiedAt.set(chainId, Date.now());
        const stoppedForMin = Math.max(1, Math.round(stoppedSinceMs / 60_000));
        try {
            const db = this.getDb();
            await AuditLog.append(db, {
                walletAddress: 'system',
                chainId,
                ruleId: 'STUCK',
                tier: HEALING_TIERS.CRITICAL_NOTIFY,
                decision: AUDIT_DECISION.MANUAL_ONLY,
                executor: 'system',
                outcome:
                    `${chainId} has been stopped for ${stoppedForMin} min `
                    + 'without recovery — operator intervention required.',
                payload: {
                    chainId,
                    stoppedSinceMs,
                    stoppedForMin,
                    recoveryHints: [
                        'Check Activity tab for an open proposal — F1 may have escalated.',
                        `Open the ${chainId} chain card and tap the power circle to restart.`,
                        'If repeated, check the external-sigterm-source forensic log:',
                        '  grep "external-sigterm-source" /var/lib/pc2/data/logs/elastos-node-manager.log | tail -1',
                    ],
                },
            });
        } catch (err) {
            this.extensionHandle.log.debug(
                `${ENM_LOG_PREFIX} stuck-chain audit write failed (non-fatal): ${err.message}`,
            );
        }
        this._publishNotification({
            chainId,
            ruleId: 'STUCK',
            severity: SEVERITY.CRITICAL,
            summary: `${chainId} stopped for ${stoppedForMin} min`,
            detail: 'Chain has been down without recovery. Check Activity tab for open proposals or restart manually.',
        });
        this.extensionHandle.log.warn(
            `${ENM_LOG_PREFIX} stuck-chain watchdog: ${chainId} stopped for ${stoppedForMin}min — operator notified.`,
        );
    }

    // ========================================================================
    // Internal — anti-snipe verification (0.2.0-beta.3.9)
    // ========================================================================

    /**
     * 0.2.0-beta.3.9 — verify the operator-supplied anti-snipe password
     * against the bcrypt hash stored in nodeConfig.antiSnipePasswordHash.
     * Returns true when the password matches. Returns false (refuses
     * approval) when:
     *   - the operator hasn't configured a password hash (refuse-by-
     *     default: a rule asking for anti-snipe with no hash means
     *     misconfigured host, not silently bypass)
     *   - the supplied password is empty / not a string
     *   - bcrypt.compare fails
     *
     * Uses ConfigStore.load() to read nodeConfig.antiSnipePasswordHash
     * fresh on each verify so an operator setting/updating the hash via
     * Settings doesn't require a server restart.
     *
     * @private
     * @param {string|null} candidate
     * @returns {Promise<boolean>}
     */
    async _verifyAntiSnipePassword(candidate) {
        if (typeof candidate !== 'string' || candidate.length === 0) {
            return false;
        }
        let storedHash = null;
        try {
            const ConfigStore = require('./ConfigStore');
            const cfg = await ConfigStore.load();
            // The hash lives on cfg.global.antiSnipePasswordHash per the
            // mock spec referencing proposal-card.js:100-108 ("only
            // renders when proposal.requireAntiSnipe AND the host has
            // pre-set nodeConfig.antiSnipePasswordHash"). We tolerate
            // both 'global' and 'nodeConfig' locations for forward
            // compat with whichever shape the operator's config uses.
            storedHash = (cfg && cfg.global && cfg.global.antiSnipePasswordHash)
                      || (cfg && cfg.nodeConfig && cfg.nodeConfig.antiSnipePasswordHash)
                      || null;
        } catch (err) {
            this.extensionHandle.log.error(
                `${ENM_LOG_PREFIX} anti-snipe verify: config load failed: ${err.message}`,
            );
            return false;
        }
        if (!storedHash || typeof storedHash !== 'string') {
            // No hash stored → refuse. A proposal that asks for anti-
            // snipe on a host that hasn't been configured for it is a
            // misconfiguration the operator must fix; we don't silently
            // bypass.
            this.extensionHandle.log.warn(
                `${ENM_LOG_PREFIX} anti-snipe verify: rejected, no hash configured`,
            );
            return false;
        }
        // 0.2.0-beta.3.9 — use Node's built-in scrypt for verification
        // (no external dep, FIPS-grade KDF, timing-safe compare). Hash
        // format: `scrypt$<saltHex>$<derivedHex>`. The `scrypt$` prefix
        // lets us pivot to bcrypt / argon2 later if security
        // requirements change, without invalidating existing hashes —
        // future verifier checks the prefix to pick the algorithm.
        // Tooling to GENERATE the hash (operator-facing CLI or
        // Settings UI) is deferred — manually-set hashes in
        // ConfigStore work fine in the meantime.
        const parts = storedHash.split('$');
        if (parts.length !== 3 || parts[0] !== 'scrypt') {
            this.extensionHandle.log.warn(
                `${ENM_LOG_PREFIX} anti-snipe verify: unrecognised hash format`,
            );
            return false;
        }
        try {
            const crypto = require('crypto');
            const salt = Buffer.from(parts[1], 'hex');
            const expected = Buffer.from(parts[2], 'hex');
            if (salt.length === 0 || expected.length === 0) {
                return false;
            }
            const derived = await new Promise((resolve, reject) => {
                crypto.scrypt(candidate, salt, expected.length, (err, key) => {
                    if (err) { reject(err); } else { resolve(key); }
                });
            });
            // timingSafeEqual short-circuits on different lengths
            // before the per-byte compare, so we pre-check length.
            if (derived.length !== expected.length) { return false; }
            return crypto.timingSafeEqual(derived, expected);
        } catch (err) {
            this.extensionHandle.log.error(
                `${ENM_LOG_PREFIX} anti-snipe verify: scrypt compare failed: ${err.message}`,
            );
            return false;
        }
    }

    // ========================================================================
    // Internal — execute approved payload
    // ========================================================================

    /** @private */
    async _executePayload(proposal) {
        const payload = ProposalStore.decodePayload(proposal);
        const action = payload && payload.action;

        switch (action) {
            case 'restart':
                return this._actRestart(proposal.chain_id);

            case 'evm-fork-resync':
                // v0.5.184 — F26 escalated to OWNER_CONFIRMS (the chain
                // re-forked inside the 24h auto-resync budget) and the
                // operator confirmed. Perform the wipe + resync now.
                // v0.5.231 — pre-execution sanity recheck. The proposal may
                // have sat in the dashboard for minutes-to-hours before the
                // operator confirmed; the underlying condition can have
                // resolved itself in that gap (slow sync caught up, peers
                // re-converged, etc.). Before destroying chaindata, re-poll
                // the chain's RPC: if the height has advanced past the
                // stuckHeight captured at detection time, abort. Better to
                // stall an old proposal than wipe a recovered chain.
                {
                    const recheck = await this._preWipeRecheck(proposal, payload);
                    if (recheck && recheck.abort) {
                        return { success: false, outcome: recheck.outcome };
                    }
                }
                try {
                    await this._executeChainResync(proposal.chain_id);
                    return { success: true, outcome: 'chain-resync (operator-confirmed) complete — re-syncing from peers' };
                } catch (err) {
                    return { success: false, outcome: err.message };
                }

            case 'config-rollback':
                // Implemented in routes/config.js (Phase 5). Mark as deferred
                // so the audit tab doesn't show a misleading success.
                return { success: false, outcome: 'Rollback acknowledged — the .bak restore is operator-driven (not yet automated).' };

            case 'prune-suggestion':
            case 'oom-suggestion':
            case 'port-conflict':
            case 'open-settings':
            case 'version-record':
                // These are pure suggestions — the operator's "Confirm" means
                // "yes I read it", not "yes execute". Mark success without
                // performing a side-effect.
                return { success: true, outcome: 'acknowledged' };

            default:
                return { success: false, outcome: `Unknown action "${action}"` };
        }
    }

    /** @private */
    async _actRestart(chainId) {
        // Caller already approved the proposal; we don't need to reload chain
        // config inside the engine — let processService.restart figure out what
        // to spawn from its known-good last-start config.
        try {
            // chainConfig is required for restart; we go through the adapter via
            // a lazy lookup. The engine intentionally avoids storing its own
            // chain registry to keep the dependency graph linear.
            const reg = require('./ChainRegistry'); // late require to dodge cycle
            const adapter = reg.getAdapter(chainId);
            const chainConfig = await this._loadChainConfig(chainId);
            await adapter.start(chainConfig);
            return { success: true, outcome: 'restarted' };
        } catch (err) {
            return { success: false, outcome: err.message };
        }
    }

    /** @private */
    async _loadChainConfig(chainId) {
        const ConfigStore = require('./ConfigStore'); // late require
        const cfg = await ConfigStore.load();
        const chain = cfg && cfg.chains && cfg.chains[chainId];
        if (!chain) {
            throw new Error(`No config for chainId "${chainId}"`);
        }
        return chain;
    }

    // ========================================================================
    // Internal — SSE notification
    // ========================================================================

    /** @private */
    _publishNotification(args) {
        // Healing notifications include proposalIds — those grant the right to
        // confirm the action via /api/healing/confirm/:id. Even though the
        // confirm route enforces requireOwner, we keep the proposalId off the
        // SSE wire of unrelated wallets (Phase 4 audit, agent 2).
        try {
            const payload = {
                ts: Date.now(),
                chainId: args.chainId,
                ruleId: args.ruleId,
                severity: args.severity,
                summary: args.summary,
                detail: args.detail,
                proposalId: args.proposalId || null,
            };
            if (this.ownerWallet && typeof this.sseHub.publishToWallet === 'function') {
                this.sseHub.publishToWallet(this.ownerWallet, 'notifications', payload);
            } else {
                // No owner yet — broadcast as a plain notification (no proposalId
                // gets through this path since pre-owner detections never create
                // proposals). Behavior equivalent to before the wallet-filter
                // patch for the bootstrap case.
                this.sseHub.publish('notifications', payload);
            }
        } catch (err) {
            this.extensionHandle.log.warn(
                `${ENM_LOG_PREFIX} healing notification publish failed: ${err.message}`,
            );
        }
    }
}

module.exports = {
    SelfHealingEngine,
};
