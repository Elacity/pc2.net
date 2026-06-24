/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * utils-stage-sync.js — frontend orchestrator for staged chain starts.
 *
 * v0.5.226 audit Phase 22 (constrained-host follow-up to Phase 21).
 *
 * What this does:
 *   The Council install starts 8 services (mainchain + 3 EVM sidechains +
 *   3 oracles + arbiter). On a constrained host (per Hostinger incident
 *   2026-05-25), simultaneous EVM fast-sync of esc + eid + pg saturates
 *   ~3 CPU cores and the provider pauses the VPS. Stage-sync waits for
 *   each chain to reach `synced` before starting the next, so CPU spikes
 *   are sequential (1 spike at a time, not 3 concurrent).
 *
 * Design trade-off — FRONTEND-only:
 *   A backend stage-sync service is the correct long-term home (survives
 *   tab close, single source of truth). This frontend implementation
 *   ships sooner + closes the immediate Hostinger pain point. Operator
 *   closing the tab mid-orchestration is acceptable: each chain start
 *   has already been issued; the remaining ones can be started manually
 *   later, OR the operator re-opens the tab and clicks "Resume" to
 *   continue from where it left off.
 *
 *   A future Phase 22.1 should port this to a backend EnmStageSyncOrchestrator
 *   service with SSE-driven status. Until then, frontend.
 *
 * Per operator directive 2026-05-25 ("budget features should not be for
 * everyone"), this is OPT-IN — only reachable via Settings → Advanced
 * → "Stage-sync now" button which is itself only highlighted when the
 * constrained-host banner has been shown to the operator.
 *
 * Usage:
 *   var sync = new EnmStageSync({
 *     api: services.api,
 *     chainOrder: ['mainchain', 'esc', 'eid', 'pg', 'arbiter', 'esc-oracle', 'eid-oracle', 'pg-oracle'],
 *     onPhase: function (event) {
 *       // event.phase = 'starting' | 'waiting' | 'synced' | 'complete' | 'error' | 'paused'
 *       // event.chainId = the chain being acted on
 *       // event.elapsedMinutes = how long the current chain has been syncing
 *     },
 *   });
 *   sync.start();          // kicks off the sequence
 *   sync.pause();          // stops at end of current chain's sync wait
 *   sync.resume();         // resumes from the paused chain
 *   sync.cancel();         // aborts entirely
 *   sync.status();         // returns { phase, chainId, completedChains[] }
 */

(function (root) {
    'use strict';

    var DEFAULT_POLL_MS    = 10000;   // 10s — chain sync state moves slowly
    var DEFAULT_TIMEOUT_MS = 4 * 60 * 60 * 1000;  // 4hr per chain (EVM cold-sync can take 1-3hr)

    function EnmStageSync(opts) {
        if (!opts || !opts.api || typeof opts.api.post !== 'function'
            || typeof opts.api.get !== 'function') {
            throw new TypeError('EnmStageSync: { api } with post + get required');
        }
        if (!Array.isArray(opts.chainOrder) || opts.chainOrder.length === 0) {
            throw new TypeError('EnmStageSync: chainOrder array required');
        }
        this.api          = opts.api;
        this.chainOrder   = opts.chainOrder.slice();
        this.onPhase      = (typeof opts.onPhase === 'function') ? opts.onPhase : function () {};
        this.pollMs       = opts.pollMs || DEFAULT_POLL_MS;
        this.timeoutMsPer = opts.timeoutMsPer || DEFAULT_TIMEOUT_MS;
        this._currentIdx  = 0;
        this._currentChainId = null;
        this._chainStartAt = 0;
        this._completed   = [];
        this._cancelled   = false;
        this._paused      = false;
        this._pollTimer   = null;
        this._waiting     = false;  // mid-poll-wait flag
    }

    EnmStageSync.prototype.start = function () {
        if (this._currentChainId) { return; } // already running
        this._cancelled = false;
        this._paused = false;
        this._currentIdx = 0;
        this._completed = [];
        this._startNext();
    };

    EnmStageSync.prototype.pause = function () {
        if (!this._currentChainId || this._cancelled) { return; }
        this._paused = true;
        this._emit('paused');
    };

    EnmStageSync.prototype.resume = function () {
        if (!this._paused || this._cancelled) { return; }
        this._paused = false;
        this._emit('resumed');
        this._tickPoll();  // resume the wait loop
    };

    EnmStageSync.prototype.cancel = function () {
        this._cancelled = true;
        this._paused = false;
        if (this._pollTimer) { clearTimeout(this._pollTimer); this._pollTimer = null; }
        this._emit('cancelled');
    };

    EnmStageSync.prototype.status = function () {
        return {
            phase: this._cancelled ? 'cancelled'
                : this._paused ? 'paused'
                : !this._currentChainId ? 'idle'
                : this._waiting ? 'waiting' : 'starting',
            chainId: this._currentChainId,
            completedChains: this._completed.slice(),
            remainingChains: this.chainOrder.slice(this._currentIdx + 1),
            elapsedMinutes: this._currentChainId
                ? Math.floor((Date.now() - this._chainStartAt) / 60000)
                : 0,
        };
    };

    /** @private — start the next chain in the order. */
    EnmStageSync.prototype._startNext = function () {
        if (this._cancelled) { return; }
        if (this._currentIdx >= this.chainOrder.length) {
            this._currentChainId = null;
            this._emit('complete');
            return;
        }
        var chainId = this.chainOrder[this._currentIdx];
        this._currentChainId = chainId;
        this._chainStartAt = Date.now();
        this._waiting = false;
        var self = this;
        this._emit('starting');
        this.api.post('/chains/' + encodeURIComponent(chainId) + '/start').then(function () {
            if (self._cancelled) { return; }
            // POST succeeded — chain is at least spawning. Now poll for synced.
            self._waiting = true;
            self._emit('waiting');
            self._tickPoll();
        }).catch(function (err) {
            if (self._cancelled) { return; }
            // 409 likely means "already running" — accept and move on.
            if (err && err.status === 409) {
                self._waiting = true;
                self._emit('waiting');
                self._tickPoll();
                return;
            }
            // 401 — auth gone. Boot path will handle. Emit error + stop.
            self._currentChainId = null;
            self._emit('error', err);
        });
    };

    /** @private — poll /chains/:id until synced OR timeout. */
    EnmStageSync.prototype._tickPoll = function () {
        if (this._cancelled || this._paused) { return; }
        var elapsed = Date.now() - this._chainStartAt;
        if (elapsed >= this.timeoutMsPer) {
            // Timeout — treat as moving on (chain may still sync in background;
            // operator can intervene). Don't mark as completed so it surfaces
            // in status as a "skipped due to timeout".
            this._emit('timeout');
            this._currentIdx += 1;
            setTimeout(this._startNext.bind(this), 1000);
            return;
        }
        var self = this;
        var chainId = this._currentChainId;
        this.api.get('/chains/' + encodeURIComponent(chainId), { skipCache: true }).then(function (resp) {
            if (self._cancelled || self._paused) { return; }
            var state = (resp && resp.result && resp.result.state) || (resp && resp.state);
            // Use enmStateVocab if available; else inline check for 'synced' + v1 aliases.
            var isAlive = root.enmStateVocab && root.enmStateVocab.isAlive
                ? root.enmStateVocab.isAlive(state)
                : (state === 'synced' || state === 'healthy' || state === 'running');
            // For stage-sync we want a STABLE alive state, not just transitioning.
            // 'synced' (or v1 'healthy'/'running') = at-tip. 'syncing' / 'starting'
            // are NOT enough — continue waiting.
            var atTip = state === 'synced' || state === 'healthy' || state === 'running';
            // For oracles + arbiter, there's no chain to sync — they're "synced"
            // as soon as they're alive (class C/D have no height to track).
            // Heuristic: if chainId ends in '-oracle' or === 'arbiter', accept alive.
            var isServiceClass = /-oracle$/.test(chainId) || chainId === 'arbiter';
            if (atTip || (isServiceClass && isAlive)) {
                self._completed.push(chainId);
                self._emit('synced');
                self._currentIdx += 1;
                self._currentChainId = null;
                self._waiting = false;
                setTimeout(self._startNext.bind(self), 1000);
                return;
            }
            // Not yet — schedule next tick.
            self._pollTimer = setTimeout(self._tickPoll.bind(self), self.pollMs);
        }).catch(function (err) {
            if (self._cancelled || self._paused) { return; }
            // Transient — keep polling (don't abort the whole orchestration on a
            // single 5xx). Only 401 stops everything.
            if (err && err.status === 401) {
                self._currentChainId = null;
                self._emit('error', err);
                return;
            }
            self._pollTimer = setTimeout(self._tickPoll.bind(self), self.pollMs);
        });
    };

    /** @private — fire status callback safely. */
    EnmStageSync.prototype._emit = function (phase, err) {
        try {
            this.onPhase({
                phase: phase,
                chainId: this._currentChainId,
                completedChains: this._completed.slice(),
                remainingChains: this.chainOrder.slice(this._currentIdx + 1),
                elapsedMinutes: this._currentChainId
                    ? Math.floor((Date.now() - this._chainStartAt) / 60000)
                    : 0,
                error: err || null,
            });
        } catch (_) { /* host callback threw — swallow */ }
    };

    root.EnmStageSync = EnmStageSync;
}(typeof window !== 'undefined' ? window : globalThis));
