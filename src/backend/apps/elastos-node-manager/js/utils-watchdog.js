/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * utils-watchdog.js — action-completion watchdog.
 *
 * v0.5.220 audit Phase 6 (XFLOW-01 + XFLOW-02). Operator clicks Start,
 * toast says "Mainchain started" — but reality is the chain is in
 * 'starting' state and may not reach alive within reasonable time
 * (RPC binding stuck / fork conflict / etc.). Pre-v0.5.220 nothing
 * watched whether the action took effect; operator had to actively
 * notice via the card. F-rule self-heal background system catches
 * most cases but lags 60-180s.
 *
 * This helper schedules a check after N seconds. If predicate hasn't
 * become true by then, fires onTimeout (typically a warning toast).
 *
 * Usage:
 *   var stop = enmWatchAction({
 *     timeoutMs: 90000,
 *     predicate: function () { return chainCard._lastCoarseState === 'synced' || ...; },
 *     onTimeout: function () { notifications.warning("Mainchain didn't start cleanly — check logs."); },
 *     pollMs: 5000, // optional, default 5s
 *   });
 *   // Cancel early on teardown:
 *   stop();
 */

(function (root) {
    'use strict';

    function enmWatchAction(opts) {
        opts = opts || {};
        if (typeof opts.predicate !== 'function') {
            throw new TypeError('enmWatchAction: opts.predicate required');
        }
        if (typeof opts.onTimeout !== 'function') {
            throw new TypeError('enmWatchAction: opts.onTimeout required');
        }
        var timeoutMs = (typeof opts.timeoutMs === 'number') ? opts.timeoutMs : 90000;
        var pollMs = (typeof opts.pollMs === 'number') ? opts.pollMs : 5000;
        var deadline = Date.now() + timeoutMs;
        var cancelled = false;
        var fired = false;

        function tick() {
            if (cancelled || fired) { return; }
            // Check predicate first — success short-circuits the watchdog.
            try {
                if (opts.predicate()) {
                    fired = true; // suppress timeout fire
                    return;
                }
            } catch (_) { /* predicate may throw; treat as not-yet-succeeded */ }
            // Hit deadline?
            if (Date.now() >= deadline) {
                fired = true;
                try { opts.onTimeout(); } catch (_) { /* swallow */ }
                return;
            }
            setTimeout(tick, pollMs);
        }
        // Defer initial tick to next event-loop turn so the caller can
        // wire up state changes before we check.
        setTimeout(tick, pollMs);

        return function cancel() { cancelled = true; };
    }

    root.enmWatchAction = enmWatchAction;
}(typeof window !== 'undefined' ? window : globalThis));
