/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/spv-module.js — v0.5.168 (Phase 2), v0.5.200 (semantic relabel).
 *
 * Mounts when the chain selector is set to "SPV Module" (key='spv'). Two
 * separate SPV systems run on a Council node:
 *
 *   1. The Arbiter has its OWN SPV that tracks the ELA Main chain tip
 *      (headers-only, fast) — exposed via arbiter `getspvheight`. This is the
 *      headline hero number.
 *
 *   2. Each EVM sidechain (esc/eid/pg) runs its OWN embedded SPV for
 *      cross-chain deposit verification. Upstream does NOT expose its height
 *      via RPC, so the only external liveness signal is the on-disk
 *      `<chainDir>/data/logs-spv/<timestamp>.log` mtime + last line. We
 *      render that as an "Active / Stale / No data" badge per row.
 *
 * What the per-sidechain NUMBER (`arbiterProcessedHeight`) means: NOT a SPV
 * height. It's the height the Arbiter has finished walking for cross-chain
 * transactions (withdraws / illegal-evidence / failed deposits). Persisted
 * every 1000 blocks by the arbiter. Slow to catch up for chains with many
 * blocks (ESC ~36M, EID ~27M). The old "Sidechain SPV heights" label was
 * misleading and led operators to think SPV was broken when this number
 * sat at half the network tip — v0.5.200 relabel corrects this.
 *
 * Read-only. Polls /spv every 5s (visibility-paused so a hidden tab stops
 * fetching). Logs are fetched on demand, not polled.
 *
 * app.js _mountDashboardForActiveChain picks this up:
 *   `if (root.EnmSpvModule) { new root.EnmSpvModule(common).mount(pane); }`.
 */

(function (root) {
    'use strict';

    var POLL_INTERVAL_MS = 5000;

    // Last-resort English fallbacks — runtime prefers strings.js
    // (spv_module.* keys) via enmT, these only show before strings load or
    // in tests that don't include strings.js.
    var SIDE_NAME_FALLBACK = {
        esc: 'Smart Chain',
        eid: 'Identity Chain',
        pg: 'PG Chain',
    };

    /**
     * strings.js lookup with English fallback (mirrors multi-chain-overview's
     * tFb). Avoids surfacing "[key]" placeholders before strings.js loads.
     *
     * @param {string} key
     * @param {string} fallback
     * @param {object} [vars]
     * @returns {string}
     */
    function tFb(key, fallback, vars) {
        var t = root.enmTOrFallback || root.enmT;
        if (typeof t !== 'function') { return formatVars(fallback, vars); }
        var v = t(key, vars);
        if (!v || v === key || v === ('[' + key + ']')) { return formatVars(fallback, vars); }
        return v;
    }

    function formatVars(s, vars) {
        if (!vars) { return s; }
        return String(s).replace(/\{([a-zA-Z0-9_]+)\}/g, function (m, name) {
            return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m;
        });
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** Format a height number with thousands separators; em-dash when null. */
    function fmtHeight(n) {
        return (typeof n === 'number' && isFinite(n)) ? n.toLocaleString() : '—';
    }

    /**
     * v0.5.200 — render an age duration ("3s", "12m", "2h", "5d") for the
     * embedded-SPV badge tooltip. Tight + friendly; matches the elapsed-time
     * convention used by chain-card's lastBlock display.
     *
     * @param {number|null} sec
     * @returns {string}
     */
    function fmtAge(sec) {
        if (typeof sec !== 'number' || !isFinite(sec) || sec < 0) { return '—'; }
        if (sec < 60) { return Math.round(sec) + 's'; }
        if (sec < 3600) { return Math.round(sec / 60) + 'm'; }
        if (sec < 86400) { return Math.round(sec / 3600) + 'h'; }
        return Math.round(sec / 86400) + 'd';
    }

    function EnmSpvModule(opts) {
        if (!opts || !opts.api) {
            throw new TypeError('EnmSpvModule: { api } required');
        }
        this.api = opts.api;
        this.notifications = opts.notifications || null;
        this._root = null;
        this._pauser = null;       // enmUseVisibilityPause handle
        this._timer = null;        // fallback setInterval when no pauser
        this._destroyed = false;
        this._openLogsChain = null; // chainId whose logs panel is open
    }

    EnmSpvModule.prototype.mount = function (parent) {
        if (!parent) { throw new TypeError('EnmSpvModule.mount: parent required'); }
        this._root = document.createElement('section');
        this._root.className = 'enm-spv';
        this._root.setAttribute('aria-label', tFb('spv_module.aria', 'SPV Module'));
        parent.appendChild(this._root);
        this._renderLoading();

        var self = this;
        this._fetch();
        // Visibility-paused poll (stops fetching when the tab is hidden) — the
        // same helper chain-card uses for its 5s metric poll.
        if (typeof root.enmUseVisibilityPause === 'function') {
            this._pauser = root.enmUseVisibilityPause(function () { self._fetch(); }, POLL_INTERVAL_MS);
        } else {
            this._timer = setInterval(function () { self._fetch(); }, POLL_INTERVAL_MS);
        }
    };

    EnmSpvModule.prototype.destroy = function () {
        if (this._destroyed) { return; }
        this._destroyed = true;
        if (this._pauser) { try { this._pauser.stop(); } catch (_) { /* idempotent */ } this._pauser = null; }
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
        if (this._root && this._root.parentNode) {
            this._root.parentNode.removeChild(this._root);
        }
        this._root = null;
    };

    /** @private */
    EnmSpvModule.prototype._renderLoading = function () {
        if (!this._root) { return; }
        this._root.innerHTML = ''
            + '<div class="enm-spv-loading" role="status" aria-live="polite">'
            + '<p>' + escapeHtml(tFb('spv_module.loading', 'Loading SPV status…')) + '</p>'
            + '</div>';
    };

    /** @private */
    EnmSpvModule.prototype._renderError = function (msg) {
        if (!this._root) { return; }
        this._root.innerHTML = ''
            + '<div class="enm-spv-error" role="alert">'
            + '<h2>' + escapeHtml(tFb('spv_module.error_title', 'SPV status unavailable')) + '</h2>'
            + '<p>' + escapeHtml(String(msg)) + '</p>'
            + '</div>';
    };

    /** @private */
    EnmSpvModule.prototype._fetch = function () {
        var self = this;
        this.api.get('/spv', { skipCache: true }).then(function (data) {
            if (self._destroyed) { return; }
            // api.js unwraps to parsed.result; be defensive about the envelope.
            var snap = (data && data.result && data.result.arbiter) ? data.result : data;
            self._render(snap);
        }).catch(function (err) {
            if (self._destroyed) { return; }
            // Only paint the error pane on the FIRST load — once we've shown
            // real data, a transient poll failure shouldn't blank the view.
            if (!self._root || !self._root.querySelector('.enm-spv-hero')) {
                self._renderError((err && err.message) || 'Network error');
            }
        });
    };

    /** @private */
    EnmSpvModule.prototype._render = function (snap) {
        if (!this._root) { return; }
        var arbiter = (snap && snap.arbiter) || {};
        var sidechains = (snap && Array.isArray(snap.sidechains)) ? snap.sidechains : [];

        var arbiterStateLabel = arbiter.running
            ? tFb('spv_module.arbiter_running', 'Arbiter running')
            : (arbiter.configured
                ? tFb('spv_module.arbiter_stopped', 'Arbiter stopped')
                : tFb('spv_module.arbiter_absent', 'Arbiter not installed'));
        var arbiterStateClass = arbiter.running ? 'running' : (arbiter.configured ? 'stopped' : 'absent');

        var html = ''
            + '<p class="enm-spv-intro">'
            +   escapeHtml(tFb('spv_module.intro',
                    'Two separate SPV systems run on a Council node: the Arbiter has its '
                    + 'own SPV that tracks the ELA Main chain (the headline number below), '
                    + 'and each EVM sidechain runs its own embedded SPV for cross-chain '
                    + 'deposit verification. This view aggregates both.'))
            + '</p>'
            // ---- Hero: arbiter SPV height (mainchain tip via arbiter's SPV) ----
            + '<div class="enm-card enm-spv-hero">'
            +   '<div class="enm-spv-hero-label">'
            +     escapeHtml(tFb('spv_module.hero_label', 'Arbiter SPV height'))
            +   '</div>'
            +   '<div class="enm-spv-hero-value">' + escapeHtml(fmtHeight(arbiter.spvHeight)) + '</div>'
            +   '<div class="enm-spv-hero-sub">'
            +     '<span class="enm-spv-dot ' + arbiterStateClass + '" aria-hidden="true"></span>'
            +     escapeHtml(arbiterStateLabel)
            +     ' &middot; '
            +     escapeHtml(tFb('spv_module.hero_sub', 'Tracks the ELA Main chain tip.'))
            +   '</div>'
            + '</div>';

        // ---- Per-sidechain catch-up + embedded SPV liveness ----
        // v0.5.200 — relabeled. The number column is the ARBITER's per-block
        // walk position for cross-chain transactions (NOT a SPV height); the
        // badge column is the EMBEDDED SPV liveness inferred from
        // logs-spv/<file>.log mtime (the embedded SPV's actual height isn't
        // RPC-exposed by upstream Elastos).
        html += '<div class="enm-card enm-spv-sidechains">'
            + '<h3>' + escapeHtml(tFb('spv_module.sidechains_title',
                'Arbiter ↔ sidechain catch-up')) + '</h3>'
            + '<p class="enm-spv-sidechains-intro">'
            +   escapeHtml(tFb('spv_module.sidechains_intro',
                  'How far the Arbiter has walked through each sidechain looking for '
                  + 'cross-chain transactions (withdraws, illegal evidence, failed '
                  + 'deposits). This catches up slowly for chains with many blocks — '
                  + 'the Arbiter walks every block and persists progress every 1,000 '
                  + 'blocks. Not the same as the sidechain block height or SPV height.'))
            + '</p>';
        if (sidechains.length === 0) {
            html += '<p class="enm-spv-empty">'
                + escapeHtml(tFb('spv_module.no_sidechains',
                    'No EVM sidechains are configured.'))
                + '</p>';
        } else {
            // Column header row so the per-row numbers + badge are scannable.
            html += '<div class="enm-spv-row enm-spv-row-head" aria-hidden="true">'
                + '<span class="enm-spv-dot" style="visibility:hidden"></span>'
                + '<span class="enm-spv-name enm-spv-col-name">'
                +   escapeHtml(tFb('spv_module.col_name', 'Sidechain')) + '</span>'
                + '<span class="enm-spv-height enm-spv-col-arbiter">'
                +   escapeHtml(tFb('spv_module.col_arbiter', 'Arbiter processed')) + '</span>'
                + '<span class="enm-spv-embedded enm-spv-col-embedded">'
                +   escapeHtml(tFb('spv_module.col_embedded', 'Embedded SPV')) + '</span>'
                + '<span class="enm-spv-actions"></span>'
                + '</div>';
            sidechains.forEach(function (sc) {
                var name = sc.displayName || SIDE_NAME_FALLBACK[sc.chainId] || sc.chainId;
                var dotClass = sc.running ? 'running' : 'stopped';
                // v0.5.200 — backend now serves arbiterProcessedHeight; fall
                // back to the deprecated spvBlockHeight alias for any older
                // bundle still in flight during the rollout.
                var arbiterHeight = (typeof sc.arbiterProcessedHeight === 'number')
                    ? sc.arbiterProcessedHeight
                    : sc.spvBlockHeight;
                var emb = sc.embeddedSpv || { state: 'unknown', ageSeconds: null, lastLine: null };
                var badgeState = emb.state || 'unknown';
                var badgeLabelKey = 'spv_module.embedded_' + badgeState;
                var badgeLabelFallback = badgeState === 'active' ? 'Active'
                    : (badgeState === 'stale' ? 'Stale' : 'No data');
                var badgeLabel = tFb(badgeLabelKey, badgeLabelFallback);
                var hintKey = 'spv_module.embedded_' + badgeState + '_hint';
                var hintFallback = (badgeState === 'active')
                    ? 'Last embedded-SPV log activity {age} ago.'
                    : (badgeState === 'stale'
                        ? 'No embedded-SPV log activity for {age}. Usually means the chain process or its SPV thread is down.'
                        : 'No embedded-SPV log files yet — the chain may be too freshly installed, or the SPV thread hasn\'t written anything.');
                var hint = tFb(hintKey, hintFallback, { age: fmtAge(emb.ageSeconds) });
                if (emb.lastLine) {
                    hint += '\n' + tFb('spv_module.embedded_last_event',
                        'Last event: {line}', { line: emb.lastLine });
                }

                html += '<div class="enm-spv-row" data-chain="' + escapeHtml(sc.chainId) + '">'
                    + '<span class="enm-spv-dot ' + dotClass + '" aria-hidden="true"></span>'
                    + '<span class="enm-spv-name">' + escapeHtml(name) + '</span>'
                    + '<span class="enm-spv-height">' + escapeHtml(fmtHeight(arbiterHeight)) + '</span>'
                    + '<span class="enm-spv-embedded enm-spv-embedded-' + escapeHtml(badgeState) + '" '
                    +   'title="' + escapeHtml(hint) + '">'
                    +   escapeHtml(badgeLabel)
                    + '</span>'
                    + '<span class="enm-spv-actions">';
                if (sc.logsSpvPresent) {
                    html += '<button type="button" class="enm-btn enm-btn-secondary enm-spv-logs-btn" '
                        + 'data-chain="' + escapeHtml(sc.chainId) + '">'
                        + escapeHtml(tFb('spv_module.view_logs', 'View SPV logs'))
                        + '</button>';
                } else {
                    html += '<span class="enm-spv-no-logs">'
                        + escapeHtml(tFb('spv_module.no_logs_yet', 'No SPV logs yet'))
                        + '</span>';
                }
                html += '</span></div>';
            });
        }
        html += '</div>';

        // ---- On-demand logs panel (hidden until a row's button is clicked) ----
        html += '<div class="enm-card enm-spv-logs-panel" hidden>'
            + '<h3 class="enm-spv-logs-title"></h3>'
            + '<pre class="enm-spv-logs-pre" tabindex="0"></pre>'
            + '</div>';

        this._root.innerHTML = html;
        this._wireLogButtons();
        // Re-open the logs panel if one was open before this re-render (poll).
        if (this._openLogsChain) {
            this._showLogs(this._openLogsChain, /* silent */ true);
        }
    };

    /** @private — attach click handlers to every "View SPV logs" button. */
    EnmSpvModule.prototype._wireLogButtons = function () {
        if (!this._root) { return; }
        var self = this;
        var btns = this._root.querySelectorAll('.enm-spv-logs-btn');
        Array.prototype.forEach.call(btns, function (btn) {
            btn.addEventListener('click', function () {
                self._showLogs(btn.getAttribute('data-chain'), false);
            });
        });
    };

    /**
     * @private — fetch + render the newest logs-spv tail for one sidechain.
     * @param {string} chainId
     * @param {boolean} silent  true when re-opening after a poll re-render
     */
    EnmSpvModule.prototype._showLogs = function (chainId, silent) {
        if (!this._root || !chainId) { return; }
        this._openLogsChain = chainId;
        var panel = this._root.querySelector('.enm-spv-logs-panel');
        var title = this._root.querySelector('.enm-spv-logs-title');
        var pre = this._root.querySelector('.enm-spv-logs-pre');
        if (!panel || !title || !pre) { return; }
        panel.hidden = false;
        title.textContent = tFb('spv_module.logs_title', 'SPV logs — {chain}', { chain: chainId.toUpperCase() });
        if (!silent) { pre.textContent = tFb('spv_module.logs_loading', 'Loading…'); }

        var self = this;
        this.api.get('/spv/' + encodeURIComponent(chainId) + '/logs', { skipCache: true }).then(function (data) {
            if (self._destroyed || self._openLogsChain !== chainId) { return; }
            var payload = (data && data.result && data.result.lines) ? data.result : data;
            var lines = (payload && Array.isArray(payload.lines)) ? payload.lines : [];
            pre.textContent = lines.length
                ? lines.join('\n')
                : tFb('spv_module.logs_empty', 'No SPV log lines yet for this chain.');
        }).catch(function (err) {
            if (self._destroyed || self._openLogsChain !== chainId) { return; }
            pre.textContent = tFb('spv_module.logs_error', 'Could not read SPV logs: {msg}',
                { msg: (err && err.message) || 'error' });
        });
    };

    root.EnmSpvModule = EnmSpvModule;
    // Exported for tests.
    root.EnmSpvModule._internal = { tFb, fmtHeight, fmtAge, escapeHtml };
}(typeof window !== 'undefined' ? window : globalThis));
