/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * utils-stale-and-errors.js — two small helpers bundled together:
 *
 * 1. enmStaleIndicator — v0.5.223 audit Phase 12 (XFLOW-20). Multiple
 *    poll-based components (peers-panel, node-identity-card, system-
 *    status) silently keep stale data on transient poll failures
 *    after first success. Operator gets no signal that data is stale.
 *    This helper attaches a tiny "Last updated Ns ago — retrying"
 *    label to a container element that updates on a 5s tick.
 *
 * 2. enmFriendlyError — v0.5.223 audit Phase 16 (parts of XFLOW-18).
 *    Maps raw err.message strings (TypeError, AbortError, HTTP 5xx)
 *    to operator-readable copy. Pre-v0.5.223 every catch block did
 *    `text = err.message || String(err)` which leaked stack-trace-
 *    flavored text to operator UI.
 */

(function (root) {
    'use strict';

    // ---------- stale indicator ----------

    /**
     * Attach a stale-indicator label inside `containerEl`. Returns an
     * object with markFresh()/markStale() controls so the caller can
     * report poll outcomes.
     *
     * @param {HTMLElement} containerEl
     * @param {object} [opts]
     * @param {number} [opts.staleAfterMs=10000]  When to start showing stale
     * @returns {{markFresh: function, markStale: function, destroy: function}}
     */
    function enmStaleIndicator(containerEl, opts) {
        if (!containerEl || !containerEl.appendChild) {
            return { markFresh: function () {}, markStale: function () {}, destroy: function () {} };
        }
        opts = opts || {};
        var staleAfterMs = (typeof opts.staleAfterMs === 'number') ? opts.staleAfterMs : 10000;
        var label = document.createElement('span');
        label.className = 'enm-stale-indicator';
        label.setAttribute('aria-live', 'polite');
        label.hidden = true;
        containerEl.appendChild(label);
        var lastFreshAt = Date.now();
        var stale = false;
        var tickTimer = null;

        function refresh() {
            if (!stale) { return; }
            var ageMs = Date.now() - lastFreshAt;
            var ageSec = Math.floor(ageMs / 1000);
            var ageText = ageSec < 60 ? (ageSec + 's')
                        : ageSec < 3600 ? (Math.floor(ageSec / 60) + 'm')
                        : (Math.floor(ageSec / 3600) + 'h');
            label.textContent = 'Last updated ' + ageText + ' ago — retrying…';
            label.hidden = false;
        }
        function start() {
            if (tickTimer) { return; }
            tickTimer = setInterval(refresh, 5000);
        }
        function stop() {
            if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
        }

        return {
            markFresh: function () {
                lastFreshAt = Date.now();
                stale = false;
                stop();
                label.hidden = true;
                label.textContent = '';
            },
            markStale: function () {
                // Wait staleAfterMs before showing, then tick.
                if (stale) { return; }
                stale = true;
                setTimeout(function () {
                    if (stale && Date.now() - lastFreshAt >= staleAfterMs) {
                        refresh();
                        start();
                    }
                }, staleAfterMs);
            },
            destroy: function () {
                stop();
                if (label.parentNode) { label.parentNode.removeChild(label); }
            },
        };
    }

    // ---------- friendly error mapper ----------

    function enmFriendlyError(err) {
        if (err == null) { return 'Action failed. Try again or check the logs.'; }
        var msg = (typeof err === 'string') ? err
                : (err.message || (err.toString && err.toString()) || 'Failed');
        // Map known patterns to operator-readable copy.
        if (/Failed to fetch|NetworkError|net::ERR/i.test(msg)) {
            return 'Couldn\'t reach ENM. Refresh the page or check your network.';
        }
        if (/AbortError|aborted/i.test(msg)) {
            return 'Request took too long. Try again.';
        }
        if (err && err.status === 401) { return null; }  // caller suppresses
        if (err && err.status === 403) {
            return 'Permission denied. Owner token may have expired.';
        }
        if (err && err.status === 404) {
            return 'Not found. The resource may have been removed.';
        }
        if (err && err.status === 409) {
            // Operator-facing 409 should usually be handled with structured
            // conflict-envelope toast; this fallback handles the bare case.
            return 'Conflict: another action is in progress, or this state isn\'t valid right now.';
        }
        if (err && err.status >= 500 && err.status < 600) {
            return 'Server error (HTTP ' + err.status + '). Check the logs.';
        }
        // Unknown — pass through cleaned-up.
        return msg;
    }

    root.enmStaleIndicator = enmStaleIndicator;
    root.enmFriendlyError = enmFriendlyError;
}(typeof window !== 'undefined' ? window : globalThis));
