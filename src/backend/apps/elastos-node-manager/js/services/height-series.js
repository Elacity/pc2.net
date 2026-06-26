/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * services/height-series.js — client for the chain-card sparkline data.
 *
 * Singleton service that wraps two data sources:
 *
 *   1. Initial bootstrap + periodic full refresh
 *      GET /api/enm/chains/<id>/history?windowMin=60
 *      Returns a decimated ~12-point series. Called on first subscribe
 *      and every 5 minutes as a fallback in case SSE has dropped.
 *
 *   2. Incremental updates over SSE
 *      Topic: chains:<id>:height
 *      Payload: { chainId, point: { t, h } }
 *      HealthChecker._mediumTick publishes when a fresh height lands
 *      in HeightSeriesStore (flat-front ticks don't publish).
 *
 * Multiplexing: one subscription per chainId, fan-out to N listeners.
 * The first listener bootstraps the buffer; the last unsubscribe tears
 * down the SSE subscription + the fallback poll.
 *
 * Listeners receive a snapshot array on every change. The component
 * (chain-card) re-renders its sparkline on each callback.
 *
 * NOT a singleton in the strict sense — instantiated once by app.js and
 * shared via services.heightSeries. Lifetime tied to _showDashboard.
 */

(function (root) {
    'use strict';

    // Match the server-side default window.
    var WINDOW_MIN = 60;
    // 5-min refresh covers the case where SSE was disconnected (tab
    // backgrounded, network drop, server restart). Cheap call.
    var POLL_FALLBACK_MS = 5 * 60 * 1000;

    function HeightSeriesClient(api, sse) {
        if (!api) throw new TypeError('HeightSeriesClient: api required');
        this.api = api;
        this.sse = sse || null; // SSE is optional — degrades to poll-only
        /** @type {Map<string, Array<{t:number,h:number}>>} */
        this._buffers = new Map();
        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();
        /** @type {Map<string, { unsub: Function|null, intervalId: number }>} */
        this._wirings = new Map();
    }

    /**
     * Subscribe a callback to the height series for one chain. The
     * callback is invoked synchronously with the current buffer (if
     * any) and then on every subsequent change.
     *
     * @param {string} chainId
     * @param {(points: Array<{t:number,h:number}>) => void} cb
     * @returns {() => void} unsubscribe
     */
    HeightSeriesClient.prototype.subscribe = function (chainId, cb) {
        if (typeof cb !== 'function') return function () {};
        var self = this;
        var set = this._listeners.get(chainId);
        if (!set) { set = new Set(); this._listeners.set(chainId, set); }
        set.add(cb);
        if (set.size === 1) this._bootstrap(chainId);
        var snap = this._buffers.get(chainId);
        if (snap) {
            try { cb(snap.slice()); } catch (_) { /* swallow */ }
        }
        return function unsubscribe() {
            var s = self._listeners.get(chainId);
            if (!s) return;
            s.delete(cb);
            if (s.size === 0) self._teardown(chainId);
        };
    };

    /** @private
     *
     * One-time wiring: SSE subscription + periodic fallback. Split from
     * _refreshNow so the recurring interval can call _refreshNow without
     * re-wiring (the bug fixed in alpha.28.1 batch 14 — see the memory
     * audit). The pre-batch-14 _bootstrap called itself recursively from
     * the setInterval, which re-registered the SSE sub + a new interval
     * every POLL_FALLBACK_MS (5 min). 24h of dashboard uptime accrued
     * ~288 stacked SSE subscriptions on `chains:<id>:height` AND 288
     * nested intervals — every height delta then fanned out 288x into
     * the same buffer. Fix: register SSE + interval once per chainId;
     * the interval only re-fetches the snapshot.
     */
    HeightSeriesClient.prototype._bootstrap = function (chainId) {
        var self = this;

        // Early-return if we've already wired this chainId — refresh
        // the snapshot in place instead of stacking subscriptions.
        if (this._wirings.has(chainId)) {
            this._refreshNow(chainId);
            return;
        }

        // First-time bootstrap: snapshot fetch + SSE + interval.
        this._refreshNow(chainId);

        // SSE delta — push new points as HealthChecker records them.
        var unsub = null;
        if (this.sse && typeof this.sse.subscribe === 'function') {
            unsub = this.sse.subscribe('chains:' + chainId + ':height', function (payload) {
                if (!payload || !payload.point) return;
                if (typeof payload.point.t !== 'number'
                    || typeof payload.point.h !== 'number') return;
                // alpha.28.1 batch 24 — typeof NaN === 'number' so the
                // typeof check above was insufficient. A single
                // {h: NaN} from the backend propagated through
                // hMin/hMax/range in sparkline._render and produced
                // an SVG path "M NaN,NaN ..." that silently bricked
                // the sparkline until a snapshot refresh.
                // (Numerical edge-case audit adc48dd0.)
                if (!isFinite(payload.point.t) || !isFinite(payload.point.h)) return;
                var buf = self._buffers.get(chainId) || [];
                var last = buf[buf.length - 1];
                // Drop out-of-order / dupes — server already filters but
                // a reconnect can replay one.
                if (last && payload.point.t <= last.t) return;
                buf.push(payload.point);
                // Trim to a 60-min window client-side too. Decimation
                // happens at render time in the Sparkline component.
                var cutoff = Date.now() - WINDOW_MIN * 60_000;
                while (buf.length > 0 && buf[0].t < cutoff) buf.shift();
                self._buffers.set(chainId, buf);
                self._broadcast(chainId);
            });
        }

        // Periodic full refresh — covers SSE reconnect gaps and a tab
        // backgrounded for hours. Calls _refreshNow (not _bootstrap)
        // so the SSE sub + interval stay singleton. alpha.28.1 batch
        // 28 — wrapped in enmUseVisibilityPause so the 5-minute snapshot
        // poll stops while the tab is hidden. The original "covers a
        // tab backgrounded for hours" claim was actually misleading:
        // SSE is what kept the buffer warm, the interval just topped
        // up on resume. Now the resume-tick of the helper fires
        // _refreshNow immediately on visibility-resume, which is the
        // correct behaviour.
        var pauser = null;
        var intervalId = null;
        if (typeof root !== 'undefined' && typeof root.enmUseVisibilityPause === 'function') {
            pauser = root.enmUseVisibilityPause(function () {
                self._refreshNow(chainId);
            }, POLL_FALLBACK_MS);
        } else {
            intervalId = setInterval(function () {
                self._refreshNow(chainId);
            }, POLL_FALLBACK_MS);
        }

        this._wirings.set(chainId, { unsub: unsub, intervalId: intervalId, pauser: pauser });
    };

    /**
     * @private
     * Fetch the latest snapshot. On success, replace the local buffer
     * (server-side decimation owns the shape). On failure, keep
     * whatever we have — never reset to empty on a transient error,
     * that would erase the sparkline mid-tab.
     */
    HeightSeriesClient.prototype._refreshNow = function (chainId) {
        var self = this;
        this.api.get('/chains/' + encodeURIComponent(chainId) + '/history?windowMin=' + WINDOW_MIN)
            .then(function (res) {
                // alpha.28.1 batch 67 (Round-19B audit) — per-point
                // isFinite filter on the snapshot path. The SSE delta
                // path was hardened against {t: NaN, h: NaN} payloads
                // in batch 24 (audit adc48dd0) — the comment at lines
                // 113-120 explains how a single bad point "produced an
                // SVG path M NaN,NaN … that silently bricked the
                // sparkline". The snapshot path was NEVER hardened the
                // same way. Snapshot replays every 5 minutes AND on
                // visibility-resume, so one corrupted /history response
                // bricked every chain card's sparkline for the rest of
                // the session — strictly worse than the SSE failure
                // mode the original hardening addressed.
                var pts = (res && Array.isArray(res.points))
                    ? res.points.filter(function (p) {
                        return p
                            && typeof p.t === 'number' && isFinite(p.t)
                            && typeof p.h === 'number' && isFinite(p.h);
                    })
                    : [];
                self._buffers.set(chainId, pts);
                self._broadcast(chainId);
            })
            .catch(function () {
                // First bootstrap — seed empty so the sparkline component
                // can render its "no data" state cleanly.
                if (!self._buffers.has(chainId)) self._buffers.set(chainId, []);
                self._broadcast(chainId);
            });
    };

    /** @private */
    HeightSeriesClient.prototype._teardown = function (chainId) {
        var w = this._wirings.get(chainId);
        if (w) {
            if (typeof w.unsub === 'function') {
                try { w.unsub(); } catch (_) { /* swallow */ }
            }
            if (w.pauser && typeof w.pauser.stop === 'function') {
                try { w.pauser.stop(); } catch (_) { /* idempotent */ }
            }
            if (w.intervalId != null) { clearInterval(w.intervalId); }
        }
        this._wirings.delete(chainId);
        this._listeners.delete(chainId);
        this._buffers.delete(chainId);
    };

    /** @private */
    HeightSeriesClient.prototype._broadcast = function (chainId) {
        var set = this._listeners.get(chainId);
        if (!set) return;
        var snap = (this._buffers.get(chainId) || []).slice();
        set.forEach(function (cb) {
            try { cb(snap); } catch (_) { /* swallow — one bad listener
                shouldn't poison the others */ }
        });
    };

    /**
     * Tear down everything. Called from app._teardownHomeView when the
     * dashboard remounts (setup completion, fresh-install flow).
     */
    HeightSeriesClient.prototype.destroy = function () {
        var self = this;
        Array.from(this._listeners.keys()).forEach(function (chainId) {
            self._teardown(chainId);
        });
    };

    root.EnmHeightSeriesClient = HeightSeriesClient;
}(typeof window !== 'undefined' ? window : globalThis));
