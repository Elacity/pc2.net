/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/oracle-status-card.js — Council Node UX Phase 3 (v0.5.187).
 *
 * Additive per-chain dashboard card for the cross-chain Oracles (Class C:
 * esc-oracle / eid-oracle / pg-oracle). It mounts BELOW the shared chain-card
 * hero (which already shows the "Relays for <parent>" identity row + coarse
 * state for an oracle). The chain-card is the Main Chain (Class A) reference
 * and is left untouched — this card lives alongside it for Class C only, so
 * the Class-A render path is byte-for-byte unchanged.
 *
 * Before Phase 1 the backend exposed almost nothing for an oracle, so the
 * dashboard could not answer "is this relayer actually working?". This card
 * surfaces the real operational signals from the Phase 1 probe (P1.2):
 *   - Parent reachable     — can the oracle reach its EVM parent's RPC?
 *   - Parent chain height  — the parent's current block (is it advancing?)
 *   - Last activity        — mtime of the oracle log = last relayer write
 *   - Last error           — most recent error-shaped line in the log tail
 *
 * Data source: GET /api/enm/chains/:id → .oracle { parentChainId,
 * parentReachable, parentBlockHeight, lastLogAt, lastError } + top-level
 * parentChainId. Real-data-only: null → "—" / "Unknown", never invented.
 *
 * Polling: 30 s, visibility-paused (reachability + activity move faster than
 * the EVM mining config, but a relayer is not high-frequency). alpha.28
 * invariants preserved: _destroyed guard on async resolves, 401-suppress on
 * the background fetch, aria-labelledby. Copy is inline English to match the
 * peer node-identity-card (pending any future bulk i18n pass).
 */

(function (root) {
    'use strict';

    var POLL_INTERVAL_MS = 30_000;

    // Last-resort parent display names (strings.js / server displayName win
    // when present). Mirrors the overview's CHAIN_DISPLAY_FALLBACK for the
    // three EVM parents an oracle can relay for.
    var PARENT_DISPLAY = { esc: 'Smart Chain', eid: 'Identity Chain', pg: 'PG Chain' };

    function OracleStatusCard(opts) {
        if (!opts || !opts.api) { throw new TypeError('EnmOracleStatusCard: { api } required'); }
        if (!opts.chainId)      { throw new TypeError('EnmOracleStatusCard: { chainId } required'); }
        this.api           = opts.api;
        this.chainId       = opts.chainId;
        this.notifications = opts.notifications || null;

        this.root = document.createElement('section');
        this.root.className = 'enm-card enm-section-card enm-oracle-status-card';
        this.root.setAttribute('role', 'region');
        this._titleId = 'enm-oracle-status-title-' + Math.random().toString(36).slice(2, 8);
        this.root.setAttribute('aria-labelledby', this._titleId);
        this.root.innerHTML =
            '<header class="enm-section-card-head">'
            + '<div class="enm-section-card-headbody">'
            +   '<div class="enm-section-card-title" id="' + this._titleId + '">Oracle status</div>'
            +   '<div class="enm-section-card-help">Reading oracle relayer status…</div>'
            + '</div>'
            + '</header>';

        this._destroyed   = false;
        this._pollPauser  = null;
        this._pollTimer   = null;
        this._lastPayload = null;
        this._lastHtml    = null;  // v0.5.191 — render-dedup cache
    }

    OracleStatusCard.prototype.mount = function (parent) {
        parent.appendChild(this.root);
        var self = this;
        this._poll();
        if (typeof root.enmUseVisibilityPause === 'function') {
            this._pollPauser = root.enmUseVisibilityPause(function () { self._poll(); }, POLL_INTERVAL_MS);
        } else {
            this._pollTimer = setInterval(function () { self._poll(); }, POLL_INTERVAL_MS);
        }
        return this;
    };

    OracleStatusCard.prototype.refresh = function () { this._poll(); };

    OracleStatusCard.prototype.destroy = function () {
        this._destroyed = true;
        if (this._pollPauser) {
            try { this._pollPauser.stop(); } catch (_) { /* idempotent */ }
            this._pollPauser = null;
        }
        if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
        if (this.root.parentNode) { this.root.parentNode.removeChild(this.root); }
    };

    /** @private */
    OracleStatusCard.prototype._poll = function () {
        var self = this;
        this.api.get('/chains/' + this.chainId).then(function (env) {
            if (self._destroyed) { return; }
            var d = (env && env.result) || (env && env.data) || env || {};
            self._lastPayload = d;
            self._render(d);
        }).catch(function (err) {
            if (self._destroyed) { return; }
            if (err && err.status === 401) { return; }  // boot path owns re-auth
            if (!self._lastPayload) {
                var help = self.root.querySelector('.enm-section-card-help');
                if (help) { help.textContent = 'Couldn’t read oracle status — retrying every 30s.'; }
            }
        });
    };

    /** @private */
    OracleStatusCard.prototype._render = function (d) {
        var oracle = d && d.oracle ? d.oracle : null;
        var parentId = (oracle && oracle.parentChainId) || d.parentChainId || null;
        var parentName = parentId ? (PARENT_DISPLAY[parentId] || parentId) : null;

        // Head tag = parent reachability (the single most important signal).
        var reachable = oracle ? oracle.parentReachable : null;
        var tag;
        if (reachable === true)       { tag = '<span class="enm-section-card-tag success">Parent reachable</span>'; }
        else if (reachable === false) { tag = '<span class="enm-section-card-tag warn">Parent unreachable</span>'; }
        else                          { tag = '<span class="enm-section-card-tag muted">Parent unknown</span>'; }

        var help = parentName
            ? ('Relays cross-chain messages between ' + esc(parentName) + ' and the Main chain.')
            : 'Relays cross-chain messages between its parent EVM chain and the Main chain.';

        var parentHeight = (oracle && typeof oracle.parentBlockHeight === 'number' && isFinite(oracle.parentBlockHeight))
            ? formatNumber(oracle.parentBlockHeight) : null;
        var lastActivity = (oracle && typeof oracle.lastLogAt === 'number')
            ? relTime(oracle.lastLogAt) : null;
        var lastError = (oracle && oracle.lastError) ? String(oracle.lastError) : null;

        var html = ''
            + '<header class="enm-section-card-head">'
            +   '<div class="enm-section-card-headbody">'
            +     '<div class="enm-section-card-title" id="' + this._titleId + '">Oracle status</div>'
            +     '<div class="enm-section-card-help">' + help + '</div>'
            +   '</div>'
            +   tag
            + '</header>'
            + '<div class="enm-section-card-body">'
            +   '<div class="enm-detail-list">'
            +     statRow('Parent chain', parentName)
            +     statRow('Parent chain height', parentHeight)
            +     statRow('Last activity', lastActivity)
            +   '</div>'
            + '</div>'
            + '<div class="enm-section-card-foot">'
            +   (!oracle
                   ? '<span class="enm-section-card-foot-status">Oracle status unavailable.</span>'
                   : (lastError
                        ? '<span class="enm-section-card-foot-status error">Last error: ' + esc(lastError.slice(0, 200)) + '</span>'
                        : '<span class="enm-section-card-foot-status success">No recent errors in the oracle log.</span>'))
            + '</div>';

        // v0.5.191 perf — skip the innerHTML rebuild when the 30s poll produced
        // byte-identical markup (the common steady state). The compare is over
        // the whole string, so a genuine change (height moved, error appeared,
        // reachability flipped) still repaints. Avoids needless DOM churn.
        if (html === this._lastHtml) { return; }
        this._lastHtml = html;
        this.root.innerHTML = html;
    };

    /** @private — horizontal label / value row. value null → "—" (never faked). */
    function statRow(label, value) {
        var has = value != null && value !== '';
        return '<div class="enm-detail-row' + (has ? '' : ' is-empty') + '">'
            + '<span class="enm-detail-label">' + esc(label) + '</span>'
            + '<span class="enm-detail-value">' + (has ? esc(value) : '—') + '</span>'
            + '</div>';
    }

    /** @private — relative time via the shared util; falls back to a local
     * computation so the component works in tests without utils.js. */
    function relTime(ms) {
        if (typeof root.enmFormatDate === 'function') {
            try {
                var s = root.enmFormatDate(ms, { mode: 'relative' });
                if (s) { return s; }
            } catch (_) { /* fall through */ }
        }
        var diff = Math.floor((Date.now() - ms) / 1000);
        if (!isFinite(diff) || diff < 0) { return null; }
        if (diff < 60)    { return 'just now'; }
        if (diff < 3600)  { return Math.floor(diff / 60) + ' min ago'; }
        if (diff < 86400) { return Math.floor(diff / 3600) + ' h ago'; }
        return Math.floor(diff / 86400) + ' d ago';
    }

    /** @private — thousands-separated integer via the shared util / fallback. */
    function formatNumber(n) {
        if (typeof n !== 'number' || !isFinite(n)) { return '—'; }  // v0.5.191 — no "NaN" to operator
        if (typeof root.enmFormatNumber === 'function') {
            try { return root.enmFormatNumber(n); } catch (_) { /* fall through */ }
        }
        try { return n.toLocaleString('en-US'); } catch (_) { /* fall through */ }
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /** @private — HTML-escape displayed strings */
    function esc(s) {
        if (s == null) { return ''; }
        return String(s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    root.EnmOracleStatusCard = OracleStatusCard;
}(typeof window !== 'undefined' ? window : globalThis));
