/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/multi-chain-overview.js — Wave M2.3 (beta.3.91) — the
 * aggregate dashboard pane that mounts when the chain selector is
 * set to "Multi-chain overview" (key='all').
 *
 * Replaces the M2.1 stub. PaneRouter._mountMultiChainOverview picks
 * this up automatically: `if (root.EnmMultiChainOverviewPane) { … }`
 * branch fires once this script is loaded; otherwise the stub copy
 * stays in place.
 *
 * BEHAVIOR
 *
 *   1. mount(parent) — paints a loading skeleton, then:
 *        a. GETs /api/enm/council/overview to hydrate immediately
 *        b. Subscribes to the `council:overview` SSE topic for live updates
 *
 *   2. Each snapshot delivers chains[] + totals. Render groups chains
 *      by class (A→B→C→D→E), one section per class, one row per chain:
 *        [● state-dot]  Chain name  ·  state  ·  uptime  ·  sparkline  ·  →
 *
 *   3. Clicking a row routes to that chain's per-chain pane by dispatching
 *      the enm:chain-change event (v0.5.237 — the old chain-selector +
 *      localStorage contract was removed). PaneRouter listens for that event,
 *      drills into the chain's dashboard, and shows a "Back to overview"
 *      control. Drill-in is session-only; a reload returns to the overview.
 *
 *   4. destroy() unsubscribes SSE + per-chain height-series subs + tears
 *      down all per-chain sparkline instances + removes the root element.
 *
 * EMPTY-STATE: when /council/overview returns 0 chains (very first
 * boot, before setup) we show the friendly "no chains configured yet"
 * copy + a hint to use the setup wizard. The setup wizard is in
 * pane-dashboard at that point so the operator can see both.
 *
 * SPARKLINE: per-chain height series. Uses EnmHeightSeriesClient
 * (services/height-series.js) — the same backend that drives the
 * chain-card hero sparkline. Mount is best-effort: missing client or
 * missing sparkline holder is silently skipped (overview still useful
 * without sparklines on chains that haven't reported height yet).
 *
 * ACCESSIBILITY (v0.5.244): chain cards are NOT role=button (they hold
 * native action buttons; nesting interactive content is an anti-pattern).
 * Mouse users route by clicking the card body; keyboard / screen-reader
 * users route via each card's native "Manage ›" button. Oracle lines, which
 * have no inner buttons, are role="button" + tabindex="0" with an aria-label
 * of "Open <chain> dashboard" and an Enter/Space keydown handler.
 */

(function (root) {
    'use strict';

    var SSE_TOPIC = 'council:overview';

    // beta.3.94 (Wave M2.6) — these fallback maps remain in the file
    // for two reasons: (1) strings.js may not have loaded yet on the
    // very first paint, and (2) tests that don't include strings.js
    // still need a working component. Runtime always prefers
    // enmT('chain_name.<id>') / ('chain_class_label.<X>') /
    // ('overview_state.<state>'); these are last-resort fallbacks.
    var CLASS_LABEL = {
        // 0.5.70 audit Session 70 — fallback canonicalization (matches
        // strings.js chain_class_label.A fix in same release).
        A: 'Main chain',
        B: 'EVM sidechains',
        C: 'Oracles',
        D: 'Cross-chain',
        E: 'Light clients',
        '?': 'Other',
    };
    var CHAIN_DISPLAY_FALLBACK = {
        mainchain:    'Main chain',
        esc:          'Smart Chain',
        'esc-oracle': 'ESC Oracle',
        eid:          'Identity Chain',
        'eid-oracle': 'EID Oracle',
        pg:           'PG Chain',
        'pg-oracle':  'PG Oracle',
        arbiter:      'Arbiter Service',
        spv:          'SPV Module',
    };
    var STATE_LABEL = {
        running:      'Running',
        starting:     'Starting',
        stopped:      'Stopped',
        disabled:     'Disabled',
        unconfigured: 'Not configured',
    };
    // v0.5.203 — new 7-tier state vocabulary that matches the backend's
    // CoarseStateDerive.STATES. Same chain reports the same string here
    // and in the per-chain dashboard (pre-v0.5.203 they disagreed —
    // overview said "Running", detail said "Healthy" for the same alive
    // arbiter). Fallbacks here only matter if strings.js hasn't loaded.
    var STATE_LABEL_V2 = {
        synced:       'Synced',
        syncing:      'Syncing',
        starting:     'Starting',
        stalled:      'Stalled',
        stopped:      'Stopped',
        disabled:     'Disabled',
        unconfigured: 'Not configured',
    };
    // v0.5.219 audit Phase 5 (XFLOW-04 / XFLOW-16) — these helpers now
    // DELEGATE to the canonical root.enmStateVocab helper (extracted in
    // utils-state-vocab.js) so this file no longer maintains a parallel
    // state-vocabulary mapping. Pre-v0.5.219 STATE_LABEL_V2 here was
    // missing 'recovering' / 'error' / 'loading' (any backend addition
    // would silently fall through to the raw state name). Inline stubs
    // preserve the wrapper signatures the rest of this file calls so the
    // migration is local. Defensive fallback preserved if utils-state-
    // vocab.js failed to load.
    function normalizeStateV2(state) {
        if (root.enmStateVocab && typeof root.enmStateVocab.normalize === 'function') {
            return root.enmStateVocab.normalize(state);
        }
        if (!state) return 'unconfigured';
        if (state === 'running') return 'synced';
        if (state === 'healthy') return 'synced';
        return state;
    }
    function stateLabelForV2(state) {
        if (root.enmStateVocab && typeof root.enmStateVocab.stateLabel === 'function') {
            return root.enmStateVocab.stateLabel(state);
        }
        var v2 = normalizeStateV2(state);
        return tFb('chain_state_v2.' + v2, STATE_LABEL_V2[v2] || v2);
    }
    function stateHintForV2(state) {
        var v2 = normalizeStateV2(state);
        return tFb('chain_state_v2_hint.' + v2, '');
    }

    /**
     * Look up a strings.js key; if missing or not-a-string, fall back
     * to the provided default (the in-file English copy). Combines
     * enmT (full lookup) with a manual fallback so missing keys don't
     * surface "[key]" placeholder copy to the operator.
     *
     * @param {string} key      strings.js dot-path
     * @param {string} fallback English fallback when key is missing
     * @param {object} [vars]   {var} substitution
     * @returns {string}
     */
    function tFb(key, fallback, vars) {
        var t = root.enmTOrFallback || root.enmT;
        if (typeof t !== 'function') { return formatVars(fallback, vars); }
        var v = t(key, vars);
        // enmTOrFallback returns key when strings missing; enmT returns
        // "[key]" when missing. Either way we detect + fall back.
        if (!v || v === key || v === ('[' + key + ']')) {
            return formatVars(fallback, vars);
        }
        return v;
    }

    function formatVars(s, vars) {
        if (!vars) { return s; }
        return String(s).replace(/\{([a-zA-Z0-9_]+)\}/g, function (m, name) {
            return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m;
        });
    }

    function chainNameFor(chainId, serverDisplayName) {
        if (serverDisplayName) { return serverDisplayName; }
        return tFb('chain_name.' + chainId, CHAIN_DISPLAY_FALLBACK[chainId] || chainId);
    }
    function classLabelFor(klass) {
        var k = klass || '?';
        var fallback = CLASS_LABEL[k] || k;
        if (k === '?') { return tFb('chain_class_label.unknown', fallback); }
        return tFb('chain_class_label.' + k, fallback);
    }
    function stateLabelFor(state) {
        return tFb('overview_state.' + state, STATE_LABEL[state] || state || 'unknown');
    }

    // Ordering for chain-class sections.
    var CLASS_ORDER = ['A', 'B', 'C', 'D', 'E', '?'];

    function EnmMultiChainOverviewPane(opts) {
        if (!opts || !opts.api) {
            throw new TypeError('EnmMultiChainOverviewPane: { api } required');
        }
        this.api = opts.api;
        this.sse = opts.sse || null;
        this.notifications = opts.notifications || null;
        this.announcer = opts.announcer || null;
        this._parent = null;
        this._root = null;
        this._unsubSse = null;
        this._lastSnap = null;
        this._lastHtml = null;   // v0.5.191 — last rendered markup, for render dedup
        // v0.5.239 — sparklines removed from the overview (height plot was
        // visual noise; per-chain trend lives on the detail page). The
        // heightSeries/_sparklines/_sparkUnsubs machinery was fully dead and
        // dropped in v0.5.240.
        this._destroyed = false;
        // v0.5.240 audit fix — paused while the operator is on another in-app
        // tab (Logs / Settings / Activity). enmUseVisibilityPause only pauses
        // on browser-tab visibility (document.hidden), not an in-app tab
        // switch, so without an explicit pause the 3s /system/usage poll + the
        // council:overview SSE kept running + re-rendering into a hidden pane.
        this._paused = false;
        // P2.2 — a single in-flight quick action (start/stop/restart) across
        // the whole pane. While set, SSE re-render is suppressed so the
        // pending button isn't wiped by a wholesale innerHTML rebuild.
        this._pendingAction = null;
        // v0.5.203 — usage cards data + poll handle. /system/usage is polled
        // on its own cadence (1s default per operator "refresh should be
        // immediate" directive). Decoupled from /council/overview SSE so a
        // chain-state event doesn't have to wait for the next usage tick.
        this._lastUsage = null;
        this._usagePollHandle = null;
        // v0.5.225 audit Phase 21 — provider-cap (cgroup limits) state.
        // Auto-fetched on mount; surfaces a banner only when a tight cap
        // is detected (cpu<4 cores OR mem<8 GB). Well-resourced operators
        // never see it.
        this._hostLimits = null;
        this._constrainedDismissed = false;
    }

    EnmMultiChainOverviewPane.prototype.mount = function (parent) {
        if (!parent) { throw new TypeError('EnmMultiChainOverviewPane.mount: parent required'); }
        this._parent = parent;
        this._root = document.createElement('section');
        this._root.className = 'enm-overview';
        this._root.setAttribute('aria-label', 'Multi-chain overview');
        parent.appendChild(this._root);
        this._renderLoading();
        this._subscribe();
        this._fetchInitial();
        this._startUsagePoll();
        // v0.5.225 audit Phase 21 — fire-and-forget probe for cgroup limits.
        // Cached 60s server-roundtrip-free after first hit. Renders nothing
        // when no cap is detected (the typical bare-metal case).
        var self = this;
        if (root.enmHostLimits && typeof root.enmHostLimits.fetch === 'function') {
            root.enmHostLimits.fetch(this.api).then(function (limits) {
                if (self._destroyed) { return; }
                self._hostLimits = limits;
                if (limits && limits.isConstrained && self._lastSnap) {
                    // Force a re-render so the banner appears on first load.
                    self._lastHtml = null;
                    self._render(self._lastSnap);
                }
            });
        }
    };

    EnmMultiChainOverviewPane.prototype.destroy = function () {
        if (this._destroyed) { return; }
        this._destroyed = true;
        if (this._unsubSse) {
            try { this._unsubSse(); } catch (_) { /* idempotent */ }
            this._unsubSse = null;
        }
        this._stopUsagePoll();
        if (this._root && this._root.parentNode) {
            this._root.parentNode.removeChild(this._root);
        }
        this._root = null;
    };

    /**
     * v0.5.240 audit fix — suspend the live machinery while the operator is on
     * a different in-app tab. Unsubscribes the council:overview SSE and stops
     * the /system/usage poll, but keeps the DOM + last snapshot so switching
     * back shows the prior state instantly (resume() then re-fetches fresh).
     * Idempotent; no-op once destroyed.
     * @public
     */
    EnmMultiChainOverviewPane.prototype.pause = function () {
        if (this._destroyed || this._paused) { return; }
        this._paused = true;
        if (this._unsubSse) {
            try { this._unsubSse(); } catch (_) { /* idempotent */ }
            this._unsubSse = null;
        }
        this._stopUsagePoll();
    };

    /**
     * v0.5.240 audit fix — inverse of pause(). Re-subscribes the SSE, restarts
     * the usage poll, and re-fetches a fresh snapshot so the operator returning
     * to the Dashboard tab sees current state. No-op unless currently paused.
     * @public
     */
    EnmMultiChainOverviewPane.prototype.resume = function () {
        if (this._destroyed || !this._paused) { return; }
        this._paused = false;
        this._subscribe();
        this._startUsagePoll();
        this._fetchInitial();
    };

    /**
     * v0.5.203 — /system/usage poll for the four header cards. Uses the same
     * visibility-pause helper chain-card uses for its metric polls so a
     * hidden tab stops fetching. 1s cadence per operator "refresh should be
     * immediate" directive — /system/usage is cheap (one statfs + cached
     * `du` walks), no harm.
     * @private
     */
    EnmMultiChainOverviewPane.prototype._startUsagePoll = function () {
        var self = this;
        function tick() {
            if (self._destroyed) { return; }
            self.api.get('/system/usage', { skipCache: true }).then(function (data) {
                if (self._destroyed) { return; }
                // api.js unwraps to parsed.result; be defensive about envelope.
                var usage = (data && data.result && data.result.cpu) ? data.result : data;
                if (!usage || !usage.cpu) { return; }
                self._lastUsage = usage;
                // Re-render usage cards in place WITHOUT touching the chain
                // rows below them — _renderUsageCards is targeted at the
                // .enm-overview-usage container, leaving sparklines + action
                // buttons untouched.
                self._renderUsageCards();
            }).catch(function () { /* network blip — keep last value visible */ });
        }
        // v0.5.209 — usage poll cadence 2s → 3s. v0.5.208 took us from 1s →
        // 2s after the 1s saturated /system/usage on a CPU-busy box; even at
        // 2s the operator reported the host was still struggling (mainchain
        // not coming up cleanly). 3s matches the CouncilOverviewService tick
        // so backend + frontend don't compound. Still under any perceptual
        // "this is slow" threshold for a dashboard.
        var USAGE_POLL_MS = 3000;
        tick();
        if (typeof root.enmUseVisibilityPause === 'function') {
            this._usagePollHandle = root.enmUseVisibilityPause(tick, USAGE_POLL_MS);
        } else {
            this._usagePollHandle = { stop: (function () {
                var id = setInterval(tick, USAGE_POLL_MS);
                return function () { clearInterval(id); };
            })() };
        }
    };

    /** @private */
    EnmMultiChainOverviewPane.prototype._stopUsagePoll = function () {
        if (!this._usagePollHandle) { return; }
        try {
            if (typeof this._usagePollHandle.stop === 'function') {
                this._usagePollHandle.stop();
            } else if (typeof this._usagePollHandle === 'function') {
                this._usagePollHandle();
            }
        } catch (_) { /* idempotent */ }
        this._usagePollHandle = null;
    };

    /** @private */
    EnmMultiChainOverviewPane.prototype._renderLoading = function () {
        this._lastHtml = null;  // invalidate render-dedup cache (DOM no longer shows rows)
        this._root.innerHTML = ''
            + '<div class="enm-overview-loading" role="status" aria-live="polite">'
            + '<p>' + escapeHtml(tFb('overview_pane.loading', 'Loading Council overview…')) + '</p>'
            + '</div>';
    };

    /** @private */
    EnmMultiChainOverviewPane.prototype._renderError = function (msg) {
        if (!this._root) { return; }
        this._lastHtml = null;  // invalidate render-dedup cache (DOM now shows the error pane)
        // 0.5.9 audit Session 9 — add Retry button. Pre-0.5.9 the error
        // pane was terminal: operator on a flaky network or transient
        // backend hiccup saw "Overview unavailable" with no recovery
        // action except a full ENM tile reload. The Retry button calls
        // back into _fetchInitial which clears + re-renders on success.
        this._root.innerHTML = ''
            + '<div class="enm-overview-error" role="alert">'
            + '<h2>' + escapeHtml(tFb('overview_pane.error_title', 'Overview unavailable')) + '</h2>'
            + '<p>' + escapeHtml(String(msg)) + '</p>'
            + '<button type="button" class="enm-btn enm-btn-secondary enm-overview-retry" '
            +   'data-action="retry">'
            +   escapeHtml(tFb('overview_pane.retry', 'Retry'))
            + '</button>'
            + '</div>';
        var self = this;
        var btn = this._root.querySelector('[data-action="retry"]');
        if (btn) {
            btn.addEventListener('click', function () {
                if (self._destroyed) { return; }
                self._renderLoading();
                self._fetchInitial();
            });
        }
    };

    /** @private */
    EnmMultiChainOverviewPane.prototype._fetchInitial = function () {
        var self = this;
        this.api.get('/council/overview', { skipCache: true }).then(function (data) {
            if (self._destroyed) { return; }
            // successBody wraps as { success: true, result: snap }.
            // Defensive: also accept the bare snap (future-proofing).
            var snap = (data && data.result) ? data.result : data;
            self._applySnapshot(snap);
        }).catch(function (err) {
            if (self._destroyed) { return; }
            self._renderError((err && err.message) || 'Network error');
        });
        // v0.5.229d (P3 audit fix) — also fetch /system/identity to know
        // the operator's DAO Council / BPoS role. Stashed on the instance
        // (this._lastIdentity) and read by _identityCardHtml to render the
        // "This node" card (DAO Council + BPoS pills). Best-effort — if
        // /system/identity fails, _lastIdentity stays null and the card
        // simply doesn't render (never a faked/empty-state flash).
        this.api.get('/system/identity').then(function (env) {
            if (self._destroyed) { return; }
            var d = (env && env.result) || (env && env.data) || env || {};
            self._lastIdentity = d;
            // Trigger a re-render if we already have a snapshot — the
            // identity arrived after the chain data, the prefix needs
            // to land in the next paint.
            if (self._lastSnap) { self._render(self._lastSnap); }
        }).catch(function () { /* graceful degrade — leave _lastIdentity null */ });
    };

    /** @private */
    EnmMultiChainOverviewPane.prototype._subscribe = function () {
        if (!this.sse || typeof this.sse.subscribe !== 'function') { return; }
        var self = this;
        try {
            this._unsubSse = this.sse.subscribe(SSE_TOPIC, function (payload) {
                if (self._destroyed) { return; }
                self._applySnapshot(payload);
            });
        } catch (err) {
            // SSE subscribe failure is non-fatal; fetchInitial covers it.
            if (typeof console !== 'undefined') {
                console.warn('EnmMultiChainOverviewPane: SSE subscribe failed:', err && err.message);
            }
        }
    };

    /** @private */
    EnmMultiChainOverviewPane.prototype._applySnapshot = function (snap) {
        if (!snap || !Array.isArray(snap.chains)) {
            this._renderError(tFb('overview_pane.error_malformed', 'Overview snapshot is malformed.'));
            return;
        }
        this._lastSnap = snap;
        // P2.2 — while a quick action is in flight, keep the latest snapshot
        // but skip the wholesale innerHTML rebuild (it would wipe the pending
        // button mid-action). The action's completion handler re-fetches and
        // renders the fresh state.
        if (this._pendingAction) { return; }
        this._render(snap);
    };

    /** @private */
    EnmMultiChainOverviewPane.prototype._render = function (snap) {
        if (!this._root) { return; }
        // Sort by class precedence then chainId alphabetical (stable).
        var ORDER = { A: 0, B: 1, C: 2, D: 3, E: 4 };
        var sorted = snap.chains.slice().sort(function (a, b) {
            var pa = ORDER[a.chainClass] !== undefined ? ORDER[a.chainClass] : 99;
            var pb = ORDER[b.chainClass] !== undefined ? ORDER[b.chainClass] : 99;
            if (pa !== pb) { return pa - pb; }
            return String(a.chainId).localeCompare(String(b.chainId));
        });
        // Group by class for visual section headers.
        var byClass = {};
        sorted.forEach(function (c) {
            var k = c.chainClass || '?';
            if (!byClass[k]) { byClass[k] = []; }
            byClass[k].push(c);
        });

        var html = [
            '<header class="enm-overview-header">',
            '<h2>' + escapeHtml(tFb('overview_pane.title', 'Council overview')) + '</h2>',
            '</header>',
            // v0.5.239 — health headline (single verdict) + bulk actions;
            // replaces the old per-chain summary line.
            this._healthHeadlineHtml(snap),
            // v0.5.238 — "This node" identity card: DAO Council membership +
            // BPoS producer status (truthful for ENM's own node key). Empty
            // string until /system/identity resolves into _lastIdentity.
            this._identityCardHtml(),
            // v0.5.225 audit Phase 21 — provider-cap banner. Only renders
            // when /system/host-limits reports a tight cap AND operator
            // hasn't dismissed it. Auto-detected; opt-in per operator
            // directive 2026-05-25.
            this._constrainedHostBannerHtml(),
            // v0.5.204 — sticky banner shown when ≥1 chain is in 'starting'
            // for > STARTUP_BANNER_THRESHOLD_SEC. Reassures the operator
            // that long warm-ups are expected + warns NOT to restart.
            this._startupBannerHtml(snap),
            // v0.5.203 — usage cards row. _renderUsageCards re-paints the
            // INNER markup of this container on the 1s /system/usage tick;
            // the wholesale chain-row rebuild happens separately on SSE.
            '<div class="enm-overview-usage" aria-label="' + escapeAttr(tFb('overview_pane.usage_cards_aria', 'Host usage summary')) + '">',
            this._usageCardsHtml(snap),
            '</div>',
            '<div class="enm-overview-body">',
        ];
        var hasRows = false;
        var self = this;

        // v0.5.228 — visual hierarchy rewrite. Operator directive 2026-05-27:
        // "multi chain looks very ugly honestly". Pre-228 rendered the 8
        // services as 4 flat sections with identical row treatment — the
        // mainchain (the actual node) looked the same as a satellite
        // oracle, and there was no visual link between an EVM and its
        // companion oracle. The new structure matches the "one Council
        // node, many services" mental model the operator reinforced this
        // week (oracle pairing, arbiter pairing):
        //
        //   1. Main chain as a HERO card at the top (accent ring, larger
        //      typography, prominent metrics) — it IS the node.
        //   2. "EVM sidechains" group with one CARD per EVM that nests
        //      its companion oracle visually inside. The card reads as
        //      one functional unit (the cross-chain bridge for that EVM).
        //   3. Arbiter as a compact card at the bottom — service-tier
        //      treatment, not the operator's focus.
        //   4. Orphan oracles + classes E/? fall back to the old flat
        //      rendering so unusual installs still surface every service.
        //
        // Click routing stays per-row: each routable LI keeps the
        // .enm-overview-row class with its own data-chain-id, so the
        // existing event handler resolves the right destination by
        // closest('.enm-overview-row').
        var mainchain = (byClass['A'] || [])[0] || null;
        var evmChains = byClass['B'] || [];
        var oracles   = byClass['C'] || [];
        var arbiters  = byClass['D'] || [];

        if (mainchain) {
            hasRows = true;
            html.push('<section class="enm-overview-section enm-overview-section-hero" data-class="A">');
            html.push('<ul class="enm-overview-rows" role="list">');
            html.push(self._rowHtml(mainchain, { variant: 'hero' }));
            html.push('</ul>');
            html.push('</section>');
        }

        if (evmChains.length > 0) {
            hasRows = true;
            html.push('<section class="enm-overview-section enm-overview-section-evm" data-class="B">');
            html.push('<h3 class="enm-overview-section-heading">'
                + escapeHtml(tFb('overview_pane.evm_group_heading', 'EVM sidechains'))
                + '</h3>');
            html.push('<div class="enm-overview-evm-grid">');
            evmChains.forEach(function (evm) {
                var oracle = null;
                for (var i = 0; i < oracles.length; i++) {
                    if (oracles[i].parentChainId === evm.chainId) {
                        oracle = oracles[i];
                        break;
                    }
                }
                // v0.5.239 — fold the oracle line INTO the EVM card (between
                // the metrics and the action footer) as a collapsible
                // one-liner, instead of a separate row below it.
                var oracleHtml = oracle ? self._rowHtml(oracle, { variant: 'oracle-nested' }) : '';
                html.push('<div class="enm-overview-evm-card">');
                html.push('<ul class="enm-overview-rows" role="list">');
                html.push(self._rowHtml(evm, { variant: 'evm', oracleHtml: oracleHtml }));
                html.push('</ul>');
                html.push('</div>');
            });
            html.push('</div>');
            html.push('</section>');
        }

        // Orphan oracles (parent missing from snap — defensive). Renders
        // under its own heading so the operator can still see + act on it.
        var orphanOracles = oracles.filter(function (o) {
            for (var i = 0; i < evmChains.length; i++) {
                if (evmChains[i].chainId === o.parentChainId) { return false; }
            }
            return true;
        });
        if (orphanOracles.length > 0) {
            hasRows = true;
            html.push('<section class="enm-overview-section enm-overview-section-orphan" data-class="C">');
            html.push('<h3 class="enm-overview-section-heading">'
                + escapeHtml(tFb('overview_pane.orphan_oracles_heading', 'Oracles (parent chain not configured)'))
                + '</h3>');
            html.push('<ul class="enm-overview-rows" role="list">');
            orphanOracles.forEach(function (c) { html.push(self._rowHtml(c)); });
            html.push('</ul>');
            html.push('</section>');
        }

        if (arbiters.length > 0) {
            hasRows = true;
            html.push('<section class="enm-overview-section enm-overview-section-arbiter" data-class="D">');
            html.push('<ul class="enm-overview-rows" role="list">');
            arbiters.forEach(function (c) {
                html.push(self._rowHtml(c, { variant: 'arbiter' }));
            });
            html.push('</ul>');
            html.push('</section>');
        }

        // Fallback rendering for any other class (E SPV module, unknown)
        // so the operator never loses sight of a configured service.
        ['E', '?'].forEach(function (k) {
            var rows = byClass[k];
            if (!rows || rows.length === 0) { return; }
            hasRows = true;
            html.push('<section class="enm-overview-section enm-overview-class" data-class="' + k + '">');
            html.push('<h3 class="enm-overview-section-heading">' + escapeHtml(classLabelFor(k)) + '</h3>');
            html.push('<ul class="enm-overview-rows" role="list">');
            rows.forEach(function (c) { html.push(self._rowHtml(c)); });
            html.push('</ul>');
            html.push('</section>');
        });
        if (!hasRows) {
            html.push('<div class="enm-overview-empty">');
            html.push('<p><strong>' + escapeHtml(tFb('overview_pane.empty_title', 'No chains configured yet.')) + '</strong></p>');
            html.push('<p>' + escapeHtml(tFb('overview_pane.empty_body',
                'Use the setup wizard to install your first chain. Once Main chain '
                + 'is running you can add EVM sidechains, Oracles, and Arbiter from '
                + 'the same wizard.')) + '</p>');
            html.push('</div>');
        }
        html.push('</div>');

        // v0.5.191 perf — dedup the wholesale rebuild. The full innerHTML swap
        // destroys+rebuilds every row, tears down all sparkline canvases, and
        // re-wires click handlers; it ran on every ~5s poll/SSE tick even when
        // the rendered markup was byte-identical (the steady state for healthy
        // chains). Skip the DOM churn + re-wire when nothing visible changed —
        // sparklines still reconcile below (their membership diff is a no-op
        // when unchanged), so live height plotting continues uninterrupted.
        var joined = html.join('');
        if (joined !== this._lastHtml) {
            this._lastHtml = joined;
            this._root.innerHTML = joined;

            // Wire row clicks → chain-change dispatch. A click on a quick-action
            // button runs the action instead of routing; a click anywhere else on
            // the row routes. The card itself is NOT role=button (it contains
            // native <button>s; nesting interactive content is an a11y
            // anti-pattern) — keyboard users route via the per-card "Manage ›"
            // button (native, handles Enter/Space itself; its click bubbles
            // here). Oracle lines ARE role=button (no inner buttons) and get a
            // keydown handler below. (v0.5.244 — pre-v0.5.244 EVM/oracle cards
            // were mouse-only and unreachable by keyboard.)
            var rowEls = this._root.querySelectorAll('.enm-overview-row');
            Array.prototype.forEach.call(rowEls, function (row) {
                row.addEventListener('click', function (ev) {
                    var t = ev.target;
                    // v0.5.242 — match the labelled action button by its own
                    // class. (Was '.enm-overview-action', the legacy icon-button
                    // class that's now removed — see the dual-class cleanup.)
                    // Bulk Start/Restart-all buttons also use .enm-ovx-act but
                    // live in the health header, never inside a .enm-overview-row,
                    // so this row handler never sees them.
                    var actionBtn = t && t.closest ? t.closest('.enm-ovx-act') : null;
                    if (actionBtn) {
                        ev.stopPropagation();
                        self._onAction(actionBtn.dataset.action, actionBtn.dataset.chainId, actionBtn);
                        return;
                    }
                    // v0.5.239 — "Manage" (hero) routes to the chain detail.
                    var manageBtn = t && t.closest ? t.closest('.enm-ovx-manage') : null;
                    if (manageBtn) {
                        ev.stopPropagation();
                        self._routeToChain(manageBtn.dataset.chainId || row.dataset.chainId);
                        return;
                    }
                    // v0.5.240 audit fix — clicking the nested oracle line
                    // routes into the oracle's own dashboard (it carries its
                    // own data-chain-id). It used to merely toggle a "relays
                    // for…" reveal, which left the oracle detail page
                    // unreachable from the overview. stopPropagation so the
                    // parent EVM card doesn't also route to itself.
                    var oracleEl = t && t.closest ? t.closest('.enm-ovx-oracle') : null;
                    if (oracleEl) {
                        ev.stopPropagation();
                        self._routeToChain(oracleEl.dataset.chainId || row.dataset.chainId);
                        return;
                    }
                    self._routeToChain(row.dataset.chainId);
                });
            });
            // v0.5.244 a11y — oracle lines are role=button divs (focusable), so
            // wire Enter/Space to route the same way a click does. (Native
            // buttons elsewhere handle their own keyboard activation.)
            var oracleEls = this._root.querySelectorAll('.enm-ovx-oracle');
            Array.prototype.forEach.call(oracleEls, function (o) {
                o.addEventListener('keydown', function (ev) {
                    if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
                        ev.preventDefault();
                        ev.stopPropagation();
                        self._routeToChain(o.dataset.chainId);
                    }
                });
            });
            // v0.5.239 — bulk Start all / Restart all in the health headline.
            var bulkBtns = this._root.querySelectorAll('[data-bulk]');
            Array.prototype.forEach.call(bulkBtns, function (b) {
                b.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    self._onBulk(b.dataset.bulk, b);
                });
            });
            // v0.5.225 audit Phase 21 — constrained-host banner dismiss.
            // Dismissal persists for the session (this._constrainedDismissed
            // flag, not localStorage) so a page reload re-shows the banner
            // — operator should be reminded each session their host is
            // constrained.
            var constrainedDismiss = this._root.querySelector('[data-action="dismiss-constrained-banner"]');
            if (constrainedDismiss) {
                var self_cb = this;
                constrainedDismiss.addEventListener('click', function () {
                    if (self_cb._destroyed) { return; }
                    self_cb._constrainedDismissed = true;
                    self_cb._lastHtml = null;
                    if (self_cb._lastSnap) { self_cb._render(self_cb._lastSnap); }
                });
            }
            // v0.5.204 — wire dismiss button on the startup banner. Remembers
            // which chainIds are dismissed; banner re-shows when a NEW chain
            // enters starting state (handled in _startupBannerHtml's known-set
            // check).
            var dismissBtn = this._root.querySelector('[data-action="dismiss-startup-banner"]');
            if (dismissBtn) {
                dismissBtn.addEventListener('click', function () {
                    if (self._destroyed) { return; }
                    self._dismissedStartingIds = {};
                    if (self._lastSnap && Array.isArray(self._lastSnap.chains)) {
                        self._lastSnap.chains.forEach(function (c) {
                            if (normalizeStateV2(c.state) === 'starting') {
                                self._dismissedStartingIds[c.chainId] = true;
                            }
                        });
                    }
                    // Re-render to immediately hide the banner.
                    self._lastHtml = null;
                    if (self._lastSnap) { self._render(self._lastSnap); }
                });
            }
        }

        // v0.5.239 — sparklines removed from the overview (the green-triangle
        // height plot was visual noise; per-chain trend lives on the detail
        // page). The reconcile/teardown sparkline machinery was fully dead and
        // dropped in v0.5.240.
    };

    /** @private — v0.5.186 (Council Node UX P2.1) — control-center row: name +
     * state chip + a class-specific operational line (height + sync badge for
     * A/B, "relays for <parent>" for C) + uptime + sparkline + open-arrow. All
     * values are real (from the Phase 1-enriched /council/overview); when a value
     * is genuinely unknown (e.g. height before RPC warms) we show an honest
     * "height pending…", never a guess. */
    EnmMultiChainOverviewPane.prototype._rowHtml = function (c, opts) {
        // v0.5.203 — normalize state through the new vocabulary so a backend
        // returning legacy 'running' / 'healthy' (during rollout) still maps
        // to a styled chip.
        // v0.5.228 — opts.variant adds a modifier class so the same markup
        // can render at different visual weights:
        //   'hero'           — mainchain at the top of the overview (large)
        //   'evm'            — EVM sidechain inside its grouped card
        //   'oracle-nested'  — oracle inside its parent's grouped card (small)
        //   'arbiter'        — arbiter compact footer card
        //   undefined        — default flat-row look (orphans, fallback)
        // Variants are visual only; the data + click routing are identical.
        var variant = opts && opts.variant ? opts.variant : null;
        var v2State = normalizeStateV2(c.state);
        var stateClass = 'state-' + escapeAttr(v2State);
        var uptime = c.uptimeSec != null ? formatUptime(c.uptimeSec) : '';
        var displayName = chainNameFor(c.chainId, c.displayName);
        var stateLabel = stateLabelForV2(c.state);
        var stateHint = stateHintForV2(c.state);
        var ariaLabel = tFb('overview_pane.row_aria_open', 'Open {chainName} dashboard', { chainName: displayName });
        var chainIdAttr = escapeAttr(c.chainId);
        var uptimeHtml = uptime
            ? '<span class="enm-overview-uptime" title="Uptime since last start">' + escapeHtml(uptime) + '</span>'
            : '<span class="enm-overview-uptime" aria-hidden="true"></span>';
        var stateChipAttrs = ' class="enm-overview-state ' + stateClass + '"';
        if (stateHint) { stateChipAttrs += ' title="' + escapeAttr(stateHint) + '"'; }
        // v0.5.239 — card redesign. Sparkline + uptime + open-arrow removed
        // (the whole card routes on click; a "Manage" link sits in the hero
        // footer). Layout is now a vertical card: header (dot+name+state chip
        // +optional update badge) → meta (block/height) → metrics (peers+RAM)
        // → optional folded oracle line → labelled action footer.
        void uptimeHtml;

        // Oracle: a compact one-liner folded into its parent EVM card. NOT an
        // .enm-overview-row, but it carries its own data-chain-id and routes to
        // the oracle's own dashboard on click — the card click handler has a
        // dedicated .enm-ovx-oracle branch for it (mirrors how the sibling EVM
        // card routes on a body click). v0.5.240 audit fix — it used to be
        // 'collapsed' + click-to-toggle, which left the oracle's own detail
        // page completely unreachable from the overview. The "Relays for …"
        // line now always shows and the › caret means "open".
        if (variant === 'oracle-nested') {
            var rel = c.parentChainId
                ? escapeHtml(tFb('overview_pane.relays_for', 'Relays for {parent}', { parent: chainNameFor(c.parentChainId, null) }))
                : '';
            return '<div class="enm-ovx-oracle" data-chain-id="' + chainIdAttr + '"'
                + ' role="button" tabindex="0" aria-label="' + escapeAttr(ariaLabel) + '">'
                + '<span class="enm-overview-dot ' + stateClass + '" aria-hidden="true"></span>'
                + '<span class="enm-ovx-oracle-name">' + escapeHtml(displayName) + '</span>'
                + '<span' + stateChipAttrs + '>' + escapeHtml(stateLabel) + '</span>'
                + '<span class="enm-ovx-oracle-rel">' + rel + '</span>'
                + '<span class="enm-ovx-caret" aria-hidden="true">›</span>'
                + '</div>';
        }

        var rowClasses = 'enm-overview-row enm-ovx-card';
        if (variant) { rowClasses += ' enm-overview-row--' + variant + ' enm-ovx-' + variant; }
        if (v2State === 'stopped' || v2State === 'stalled' || v2State === 'disabled') {
            rowClasses += ' enm-ovx-attention';
        }
        var updateBadge = c.updateAvailable
            ? '<span class="enm-ovx-update-badge">↑ ' + escapeHtml(tFb('overview_pane.update_available', 'Update available')) + '</span>'
            : '';
        var metaH = this._metaHtmlV2(c);
        var metricsH = this._metricsHtml(c);
        return '<li class="' + rowClasses + '" data-chain-id="' + chainIdAttr
            + '" data-state="' + escapeAttr(v2State) + '">'
            + '<div class="enm-ovx-top">'
            +   '<span class="enm-overview-dot ' + stateClass + '" aria-hidden="true"></span>'
            +   '<span class="enm-overview-name">' + escapeHtml(displayName) + '</span>'
            +   '<span' + stateChipAttrs + '>' + escapeHtml(stateLabel) + '</span>'
            +   updateBadge
            + '</div>'
            + (metaH ? '<div class="enm-overview-meta enm-ovx-meta">' + metaH + '</div>' : '')
            + (metricsH ? '<div class="enm-ovx-metrics">' + metricsH + '</div>' : '')
            + ((opts && opts.oracleHtml) ? opts.oracleHtml : '')
            + this._actionsHtml(c, variant)
            + '</li>';
    };

    /**
     * v0.5.225 audit Phase 21 — constrained-host banner.
     * Surfaces only when cgroup limits are tight AND operator hasn't
     * dismissed. Operator directive 2026-05-25 ("budget features should
     * not be for everyone") → auto-detected + opt-in dismissal. Well-
     * resourced operators never see this.
     * @private
     */
    EnmMultiChainOverviewPane.prototype._constrainedHostBannerHtml = function () {
        if (this._constrainedDismissed) { return ''; }
        var hl = this._hostLimits;
        if (!hl || !hl.isConstrained) { return ''; }
        var capStr = '';
        if (typeof hl.cpuCapCores === 'number' && hl.cpuCapCores < 4) {
            capStr = hl.cpuCapCores + ' CPU core' + (hl.cpuCapCores === 1 ? '' : 's');
        }
        if (typeof hl.memoryCapGb === 'number' && hl.memoryCapGb < 8) {
            capStr += (capStr ? ' + ' : '') + hl.memoryCapGb + ' GB RAM';
        }
        // Source label ("cgroup-v2" / "cgroup-v1") is for the title attribute
        // (debug); operator-facing copy stays plain English.
        var sourceTitle = 'Detected via ' + (hl.source || 'cgroup');
        return ''
            + '<div class="enm-overview-constrained-banner" role="status" aria-live="polite" '
            +      'title="' + escapeAttr(sourceTitle) + '">'
            +   '<div class="enm-overview-constrained-banner-icon" aria-hidden="true">⚠</div>'
            +   '<div class="enm-overview-constrained-banner-body">'
            +     '<div class="enm-overview-constrained-banner-title">Budget-tier host detected</div>'
            +     '<div class="enm-overview-constrained-banner-body-text">'
            +       'This host is limited to ' + escapeHtml(capStr) + '. '
            +       'A full Council install (4 chains + arbiter + 3 oracles) typically needs '
            +       '4+ CPU cores during EVM sync; on a budget VPS tier (common across most '
            +       'shared / low-cost cloud providers) the provider may pause your node when '
            +       'usage spikes. Consider enabling stage-sync in '
            +       '<strong>Settings → Advanced → Stage-sync</strong> '
            +       '(starts EVM chains one at a time so sync CPU spikes are sequential, not concurrent).'
            +     '</div>'
            +   '</div>'
            +   '<button type="button" class="enm-overview-constrained-banner-dismiss" '
            +     'data-action="dismiss-constrained-banner" aria-label="Dismiss">×</button>'
            + '</div>';
    };

    // v0.5.206 — show the banner almost immediately. v0.5.204 used 120s which
    // missed the most common case: operator just triggered a deploy/restart,
    // looks at the overview, sees ALL chains orange "STARTING" and panics
    // before the banner ever appears. 5s catches every meaningful warm-up
    // (post-deploy, post-restart, self-heal) while still allowing sub-second
    // spawn blips to pass without the banner flashing on screen.
    var STARTUP_BANNER_THRESHOLD_SEC = 5;

    /**
     * v0.5.204 — sticky banner under the header that explains long warm-ups.
     * Empty string when no chain qualifies. Groups starting chains by their
     * computed reason so the banner can say "esc, eid: geth state-sync"
     * rather than one generic line.
     * @private
     */
    EnmMultiChainOverviewPane.prototype._startupBannerHtml = function (snap) {
        if (!snap || !Array.isArray(snap.chains)) { return ''; }
        // If the operator has dismissed this banner for this session AND no
        // NEW chain has entered 'starting' since dismissal, skip rendering.
        // Re-render forced when a new starting chain shows up.
        var startingChains = snap.chains.filter(function (c) {
            return normalizeStateV2(c.state) === 'starting'
                && typeof c.uptimeSec === 'number'
                && c.uptimeSec >= STARTUP_BANNER_THRESHOLD_SEC;
        });
        if (startingChains.length === 0) {
            this._dismissedStartingIds = null;  // reset dismissal when condition clears
            return '';
        }
        // Have any new chains entered starting since dismissal?
        if (this._dismissedStartingIds) {
            var allKnown = startingChains.every(function (c) {
                return self_dismissedHas.call(this, c.chainId);
            }, this);
            if (allKnown) { return ''; }
        }

        // Bucket by reason for class-aware bullet copy.
        var byReason = {};
        startingChains.forEach(function (c) {
            var r = c.startingReason || 'normal-slow';
            if (!byReason[r]) { byReason[r] = []; }
            byReason[r].push(c);
        });

        function namesOf(chains) {
            return chains.map(function (c) {
                return chainNameFor(c.chainId, c.displayName);
            }).join(', ');
        }
        function lineForReason(reason, key, fallback) {
            if (!byReason[reason] || byReason[reason].length === 0) { return ''; }
            return '<li>' + escapeHtml(tFb('overview_pane.startup_banner.' + key, fallback,
                { chains: namesOf(byReason[reason]) })) + '</li>';
        }

        var titleKey = startingChains.length === 1
            ? 'overview_pane.startup_banner.title_one'
            : 'overview_pane.startup_banner.title_many';
        var titleFallback = startingChains.length === 1
            ? '1 chain warming up'
            : '{n} chains warming up';
        var title = tFb(titleKey, titleFallback, { n: startingChains.length });

        var bullets = ''
            + lineForReason('leveldb-busy', 'leveldb_chains',
                '{chains}: leveldb compaction is busy. Common after a hard shutdown; can take 5–15 min.')
            + lineForReason('evm-state-sync', 'state_sync_chains',
                '{chains}: geth state-sync is downloading chain state from peers. Pre-pivot phase; can take 1–3 hours on a fresh install.')
            + lineForReason('awaiting-parent', 'awaiting_parent_chains',
                '{chains}: waiting for Main chain RPC to be reachable.')
            + lineForReason('rpc-not-bound', 'rpc_binding_chains',
                '{chains}: RPC server still binding. Usually completes within 60 seconds of warm-up.');

        var dontRestart = tFb('overview_pane.startup_banner.dont_restart',
            'Please don\'t restart any chain during warm-up — startup work (leveldb open, state-sync, peer handshake) will start over from scratch.');
        var dismissLabel = tFb('overview_pane.startup_banner.dismiss', 'Dismiss');
        // v0.5.206 — when 3+ chains are simultaneously starting, that's the
        // post-deploy / post-PC2-restart / "Restart all" pattern. Surface a
        // context line so the operator immediately understands "this is
        // expected" instead of "did the deploy break everything?"
        var postRestartHtml = '';
        if (startingChains.length >= 3) {
            var postRestartHint = tFb('overview_pane.startup_banner.post_restart_hint',
                'This is the expected pattern after a deploy, PC2 restart, or "Restart all" — every chain comes back at once and the slowest ones (Main chain leveldb open, EVM state-sync) gate the others.');
            postRestartHtml = '<div class="enm-overview-startup-banner-postrestart">'
                + escapeHtml(postRestartHint) + '</div>';
        }

        return '<div class="enm-overview-startup-banner" role="status" aria-live="polite">'
            + '<div class="enm-overview-startup-banner-icon" aria-hidden="true">⏱</div>'
            + '<div class="enm-overview-startup-banner-body">'
            +   '<div class="enm-overview-startup-banner-title">' + escapeHtml(title) + '</div>'
            +   postRestartHtml
            +   (bullets ? '<ul class="enm-overview-startup-banner-bullets">' + bullets + '</ul>' : '')
            +   '<div class="enm-overview-startup-banner-warn"><strong>'
            +     escapeHtml(dontRestart) + '</strong></div>'
            + '</div>'
            + '<button type="button" class="enm-overview-startup-banner-dismiss" '
            +   'data-action="dismiss-startup-banner" aria-label="' + escapeAttr(dismissLabel) + '">×</button>'
            + '</div>';
    };

    // v0.5.204 — dismissal tracking helper. Stored on `this` not localStorage:
    // dismissal lasts for the current page session, so a refresh or a new
    // chain entering starting state will re-show the banner.
    function self_dismissedHas(chainId) {
        if (!this._dismissedStartingIds) { return false; }
        return this._dismissedStartingIds[chainId] === true;
    }

    /**
     * v0.5.203 — meta line v2: block height shown WITH network height + blocks
     * behind, peer count chip, last-block-age for synced chains. Honest about
     * what's unavailable (em-dashes, not placeholder numbers).
     * @private
     */
    EnmMultiChainOverviewPane.prototype._metaHtmlV2 = function (c) {
        var klass = c.chainClass;
        // Class C (oracle) — what EVM sidechain it relays for + last activity age.
        if (klass === 'C') {
            var bits = [];
            if (c.parentChainId) {
                bits.push('<span class="enm-overview-relays">'
                    + escapeHtml(tFb('overview_pane.relays_for', 'Relays for {parent}',
                        { parent: chainNameFor(c.parentChainId, null) }))
                    + '</span>');
            }
            if (c.lastHeightAdvanceMs) {
                bits.push('<span class="enm-overview-meta-muted">'
                    + escapeHtml(tFb('overview_pane.last_activity_ago', 'last activity {age} ago',
                        { age: formatAge((Date.now() - c.lastHeightAdvanceMs) / 1000) }))
                    + '</span>');
            }
            return bits.join(' · ');
        }
        // Class A / B / E — block height + network height + behind count.
        // v0.5.191 — isFinite guard against NaN/Infinity heights.
        if (klass === 'A' || klass === 'B' || klass === 'E') {
            // Special case: 'starting' state with no height yet — explain WHY.
            // v0.5.204 — use the backend-derived startingReason + show elapsed
            // time so the operator has REAL information, not just "warming up."
            var v2 = normalizeStateV2(c.state);
            if (v2 === 'starting' && c.alive) {
                return '<span class="enm-overview-meta-muted">'
                    + escapeHtml(startingReasonCopy(c))
                    + '</span>';
            }
            var hasHeight = (typeof c.height === 'number' && isFinite(c.height));
            var hasNet = (typeof c.networkHeight === 'number' && isFinite(c.networkHeight));
            if (hasHeight && hasNet) {
                var behind = (typeof c.blocksBehind === 'number' && isFinite(c.blocksBehind)) ? c.blocksBehind : null;
                var line = '<span class="enm-overview-height">'
                    + escapeHtml(tFb('overview_pane.block_of', 'Block {h} / {nh}',
                        { h: formatNumber(c.height), nh: formatNumber(c.networkHeight) }))
                    + '</span>';
                if (behind != null && behind > 0) {
                    var behindKey = behind === 1 ? 'overview_pane.blocks_behind_one' : 'overview_pane.blocks_behind';
                    var behindFallback = behind === 1 ? '1 behind' : '{behind} behind';
                    line += ' · <span class="enm-overview-behind">'
                        + escapeHtml(tFb(behindKey, behindFallback, { behind: formatNumber(behind) }))
                        + '</span>';
                }
                return line;
            }
            if (hasHeight) {
                // Have height but no network reference — show just the height.
                return '<span class="enm-overview-height">'
                    + escapeHtml(tFb('overview_pane.block', 'Block {n}', { n: formatNumber(c.height) }))
                    + '</span>';
            }
            if (c.alive) {
                return '<span class="enm-overview-meta-muted">'
                    + escapeHtml(tFb('overview_pane.height_pending', 'height pending…'))
                    + '</span>';
            }
            return '';
        }
        // Class D (arbiter) — same "waiting on mainchain" treatment when
        // starting; otherwise the chip already carries the headline.
        // v0.5.204 — uses the same startingReasonCopy helper as A/B/E so the
        // copy is sourced from one place (and arbiter gets the "waiting for
        // mainchain RPC" copy by way of its 'awaiting-parent' reason).
        if (klass === 'D') {
            var v2d = normalizeStateV2(c.state);
            if (v2d === 'starting' && c.alive) {
                return '<span class="enm-overview-meta-muted">'
                    + escapeHtml(startingReasonCopy(c))
                    + '</span>';
            }
            if (c.lastHeightAdvanceMs) {
                return '<span class="enm-overview-meta-muted">'
                    + escapeHtml(tFb('overview_pane.last_activity_ago', 'last activity {age} ago',
                        { age: formatAge((Date.now() - c.lastHeightAdvanceMs) / 1000) }))
                    + '</span>';
            }
            return '';
        }
        return '';
    };

    /**
     * v0.5.203 — third-row metrics line under each chain row: peers · CPU% ·
     * RAM · FD · disk. Only renders cells we have data for; empty cells are
     * collapsed (no whitespace gaps). Hidden entirely when the chain is not
     * alive (nothing useful to show).
     * @private
     */
    EnmMultiChainOverviewPane.prototype._metricsHtml = function (c) {
        if (!c.alive) { return ''; }
        var pm = c.processMetrics || {};
        var bits = [];
        // Peers (only for chains where the concept exists — A/B/E)
        if (c.chainClass === 'A' || c.chainClass === 'B' || c.chainClass === 'E') {
            if (typeof c.peers === 'number' && isFinite(c.peers)) {
                var peersKey, peersFallback;
                if (c.peers === 0) { peersKey = 'overview_pane.peers_label_none'; peersFallback = '0 peers'; }
                else if (c.peers === 1) { peersKey = 'overview_pane.peers_label_one'; peersFallback = '1 peer'; }
                else { peersKey = 'overview_pane.peers_label'; peersFallback = '{n} peers'; }
                var peersClass = (c.peers === 0) ? 'enm-overview-metric is-warn' : 'enm-overview-metric';
                bits.push('<span class="' + peersClass + '">'
                    + escapeHtml(tFb(peersKey, peersFallback, { n: c.peers }))
                    + '</span>');
            }
        }
        // v0.5.239 — per-chain CPU% removed (redundant with the top stat
        // strip's global CPU load; operator: "doesn't need to show CPU for all
        // pages"). The overview's per-chain metrics are now just peers + RAM.
        // RAM (MB if <1024, GB otherwise)
        if (typeof pm.rssMb === 'number' && isFinite(pm.rssMb)) {
            if (pm.rssMb >= 1024) {
                bits.push('<span class="enm-overview-metric">'
                    + escapeHtml(tFb('overview_pane.metric_ram_gb', 'RAM {gb} GB',
                        { gb: (pm.rssMb / 1024).toFixed(1) }))
                    + '</span>');
            } else {
                bits.push('<span class="enm-overview-metric">'
                    + escapeHtml(tFb('overview_pane.metric_ram', 'RAM {mb} MB',
                        { mb: Math.round(pm.rssMb) }))
                    + '</span>');
            }
        }
        // v0.5.239 — FD count + per-chain disk removed from the overview
        // (internal noise; still available on the per-chain detail page).
        return bits.join(' ');
    };

    /**
     * v0.5.204 — class-aware "starting" subtitle copy. Pulls the right
     * string from overview_pane.starting_reason.<reason> and formats {elapsed}
     * with formatAge(uptimeSec). Backend ships `startingReason`; if the
     * backend is older (pre-v0.5.204), fall back to the generic warming-up
     * string so the row still renders cleanly during a rollout.
     */
    function startingReasonCopy(c) {
        var reason = c && c.startingReason;
        var elapsed = (typeof c.uptimeSec === 'number') ? formatAge(c.uptimeSec) : '—';
        if (!reason) {
            // Backwards-compat: older bundle, no startingReason field.
            return tFb('overview_pane.starting_warming_up', 'warming up (RPC binding)…');
        }
        var key = 'overview_pane.starting_reason.' + reason;
        var fallbacks = {
            'normal':           'starting up…',
            'rpc-not-bound':    'starting up · RPC server still binding ({elapsed} elapsed)',
            'leveldb-busy':     'leveldb compaction in progress · {elapsed} elapsed (common after a hard restart; can take 5–15 min)',
            'evm-state-sync':   'geth state-sync · downloading chain state from peers ({elapsed} elapsed; can take 1–3 hours on a fresh install)',
            'awaiting-parent':  'waiting for Main chain RPC ({elapsed} elapsed)',
            'normal-slow':      'starting up · {elapsed} elapsed',
        };
        return tFb(key, fallbacks[reason] || fallbacks['normal-slow'], { elapsed: elapsed });
    }

    /**
     * v0.5.203 — friendly age formatter for "last activity 4s ago" displays.
     * 0..59s → "Ns"; <60m → "Nm"; <24h → "Nh"; else "Nd".
     * @private
     */
    function formatAge(sec) {
        if (typeof sec !== 'number' || !isFinite(sec) || sec < 0) { return '—'; }
        if (sec < 60) { return Math.round(sec) + 's'; }
        if (sec < 3600) { return Math.round(sec / 60) + 'm'; }
        if (sec < 86400) { return Math.round(sec / 3600) + 'h'; }
        return Math.round(sec / 86400) + 'd';
    }

    /** @private — v0.5.186 (Council Node UX P2.2) — state-gated compact quick
     * actions. alive → Restart + Stop; stopped → Start; disabled/unconfigured →
     * none (manage those in Settings). Buttons carry data-action + data-chain-id;
     * the row delegate intercepts their clicks so acting on a chain never also
     * navigates into it. Always rendered (the empty cell keeps the grid aligned)
     * and always visible for touch discoverability. */
    EnmMultiChainOverviewPane.prototype._actionsHtml = function (c, variant) {
        var cid = escapeAttr(c.chainId);
        function btn(action, glyph, key, fallback, cls) {
            var label = tFb(key, fallback);
            return '<button type="button" class="enm-ovx-act ' + cls + '"'
                + ' data-action="' + action + '" data-chain-id="' + cid + '">'
                + '<span class="enm-ovx-ico" aria-hidden="true">' + glyph + '</span>'
                + escapeHtml(label) + '</button>';
        }
        var inner = '';
        if (c.alive) {
            inner += btn('restart', '⟳', 'chain_actions.restart', 'Restart', 'is-restart');
            inner += btn('stop', '■', 'chain_actions.stop', 'Stop', 'is-stop');
        } else if (c.state === 'stopped') {
            inner += btn('start', '▶', 'chain_actions.start', 'Start', 'is-start');
        }
        // v0.5.239 — Update only when the backend reports an update available
        // for this chain. Per-EVM detection is a backend follow-up, so this
        // stays hidden until that lands (mainchain can light up sooner).
        if (c.updateAvailable) {
            inner += btn('update', '↑', 'chain_actions.update', 'Update', 'is-update');
        }
        // v0.5.244 a11y — every routable chain card gets a keyboard-reachable
        // "Manage ›" control (was hero-only). The card body still routes on
        // click for mouse users, but keyboard / screen-reader users previously
        // had no way into an EVM or arbiter dashboard (the card isn't a button
        // — that would nest the action buttons inside a button). Oracle lines
        // get their own role=button + tabindex in _rowHtml instead.
        var manage = '<span class="enm-ovx-spacer"></span>'
            + '<button type="button" class="enm-ovx-manage" data-chain-id="' + cid + '">'
            + escapeHtml(tFb('overview_pane.manage', 'Manage')) + ' ›</button>';
        if (!inner && !manage) { return ''; }
        return '<div class="enm-ovx-foot">' + inner + manage + '</div>';
    };

    /** @private — P2.2 quick action runner. Mirrors chain-card._do: pane-wide
     * busy guard, pending button state, POST, success/fail toast (incl. 401
     * suppression + 409 host-conflict remediation), then a fresh re-fetch.
     * Disruptive actions (stop/restart) confirm first; start does not. */
    EnmMultiChainOverviewPane.prototype._onAction = function (kind, chainId, btn) {
        if (!kind || !chainId || !btn) { return; }
        // v0.5.239 — "Update" isn't a start/stop POST; it drills into the
        // chain's dashboard where the binary-update flow lives.
        if (kind === 'update') { this._routeToChain(chainId); return; }
        if (this._pendingAction) { return; }  // one action at a time, pane-wide
        var self = this;
        var displayName = chainNameFor(chainId, null);
        // v0.5.217 audit Phase 3 (AUDIT-FLOW-O04 + O05, P2) — replace
        // native browser confirm() with enmDestructiveModal. Closes
        // O04 (native dialog UX inconsistency) AND O05 (ambiguous
        // "interrupted" copy that confused operators about whether the
        // chain ends in STOPPED or RESTARTS). The modal's body copy is
        // now action-specific + quantifies the impact.
        if (kind === 'stop' || kind === 'restart') {
            if (typeof root.enmDestructiveModal !== 'function') {
                // Defensive: modal failed to load — fall back to native.
                var fb = 'Are you sure you want to ' + kind + ' ' + displayName + '?';
                if (typeof root.confirm === 'function' && !root.confirm(fb)) { return; }
                this._runAction(kind, chainId, btn, displayName);
                return;
            }
            var bodyCopy = (kind === 'stop')
                ? 'The chain process will stop and the node will no longer produce blocks or respond to RPC. Start it again from this card when ready. No chain data is lost.'
                : 'The chain will stop, then start again automatically (typical pause: 20-60 seconds). Sync resumes from the current block — no data is lost.';
            root.enmDestructiveModal({
                title:        (kind === 'stop' ? 'Stop ' : 'Restart ') + displayName + '?',
                body:         bodyCopy,
                ackLabel:     (kind === 'stop') ? ('I understand this stops ' + displayName) : null,
                cooldownSec:  (kind === 'stop') ? 2 : 1,
                confirmLabel: (kind === 'stop' ? 'Stop ' : 'Restart ') + displayName,
                confirmKind:  (kind === 'stop') ? 'danger' : 'primary',
                notifications: self.notifications,
                onConfirm: function () {
                    self._runAction(kind, chainId, btn, displayName);
                    return Promise.resolve();
                },
            });
            return;
        }
        // Non-destructive (start) — no confirm needed.
        this._runAction(kind, chainId, btn, displayName);
    };

    /**
     * @private — extracted from _onAction so the confirm path + the direct
     * (start) path share the same POST + busy-state + 401/409 handling.
     * v0.5.217 audit Phase 3.
     */
    EnmMultiChainOverviewPane.prototype._runAction = function (kind, chainId, btn, displayName) {
        this._pendingAction = { chainId: chainId, kind: kind };
        var self = this;
        var glyphSpan = btn.querySelector('span');
        var prevGlyph = glyphSpan ? glyphSpan.innerHTML : '';
        btn.disabled = true;
        btn.classList.add('is-busy');
        // v0.5.220 audit Phase 6 (XFLOW-01, AUDIT-FLOW-O06) — present-
        // progressive verbs replace past-tense (parallel of chain-card._do).
        var progressiveVerb = ({ start: 'is starting…', stop: 'is stopping…', restart: 'is restarting…' })[kind] || kind;
        this.api.post('/chains/' + chainId + '/' + kind).then(function () {
            if (self.notifications && typeof self.notifications.info === 'function') {
                self.notifications.info(displayName + ' ' + progressiveVerb, '');
            }
            // v0.5.220 audit Phase 6 (XFLOW-02, AUDIT-FLOW-O07) — startup
            // watchdog for Start/Restart from the overview. If the chain
            // hasn't reached alive in 90s, fire a warning. Predicate
            // reads from the cached overview snapshot.
            if ((kind === 'start' || kind === 'restart')
                && typeof root.enmWatchAction === 'function'
                && root.enmStateVocab) {
                root.enmWatchAction({
                    timeoutMs: 90000,
                    pollMs: 5000,
                    predicate: function () {
                        if (self._destroyed) { return true; }
                        if (!self._lastSnap || !Array.isArray(self._lastSnap.chains)) { return false; }
                        var c = self._lastSnap.chains.filter(function (x) { return x.chainId === chainId; })[0];
                        return c && root.enmStateVocab.isAlive(c.state);
                    },
                    onTimeout: function () {
                        if (self._destroyed) { return; }
                        if (self.notifications && typeof self.notifications.warning === 'function') {
                            self.notifications.warning(
                                displayName + ' didn\'t reach a running state',
                                'The ' + kind + ' completed but the chain is still not alive. Check the chain card and logs.',
                            );
                        }
                    },
                });
            }
        }).catch(function (err) {
            if (err && err.status === 401) { return; }  // boot path owns re-auth UX
            if (!self.notifications) { return; }
            if (err && err.body && Array.isArray(err.body.conflicts) && err.body.conflicts.length > 0) {
                var blockers = err.body.conflicts.filter(function (cf) { return cf && cf.severity === 'CRITICAL'; });
                var summary = blockers.map(function (cf) {
                    var firstStep = cf.remediation && cf.remediation[0];
                    var stepStr = (typeof firstStep === 'string' && firstStep.length > 0) ? firstStep : '';
                    var descStr = (typeof cf.description === 'string' && cf.description.length > 0) ? cf.description : 'Host conflict';
                    return '• ' + descStr + (stepStr ? ('\n   ' + stepStr) : '');
                }).join('\n');
                if (typeof self.notifications.critical === 'function') {
                    self.notifications.critical('Cannot ' + kind + ' ' + displayName + ' — host conflicts', summary);
                }
            } else if (typeof self.notifications.warning === 'function') {
                self.notifications.warning('Failed to ' + kind + ' ' + displayName, err && err.message ? err.message : String(err));
            }
        }).then(function () {
            self._pendingAction = null;
            if (self._destroyed) { return; }
            // Restore the button in case the upcoming fetch is slow, then
            // re-fetch fresh state (SSE was suppressed while pending).
            btn.disabled = false;
            btn.classList.remove('is-busy');
            if (glyphSpan) { glyphSpan.innerHTML = prevGlyph; }
            self._fetchInitial();
        });
    };

    /**
     * v0.5.203 — render the four usage cards (Chains / CPU / Memory / Disk).
     * Called both inline from _render (with the freshest available usage
     * snapshot) and on the 1s /system/usage tick to re-paint just the cards
     * without disturbing the chain rows below.
     *
     * Returns the inner HTML for .enm-overview-usage. Safe to call with no
     * usage data — renders placeholder cards with em-dash values.
     * @private
     */
    EnmMultiChainOverviewPane.prototype._usageCardsHtml = function (snap) {
        var usage = this._lastUsage || {};
        var totals = (snap && snap.totals) || { total: 0 };
        // Chain bucket counts pulled from the rich snapshot (the v0.5.203
        // backend serves new states; legacy snapshots fall through to '—').
        var chains = (snap && Array.isArray(snap.chains)) ? snap.chains : [];
        var synced = 0, syncing = 0, other = 0, up = 0;
        chains.forEach(function (c) {
            var st = normalizeStateV2(c.state);
            if (c.alive) { up += 1; }
            if (st === 'synced') { synced += 1; }
            else if (st === 'syncing') { syncing += 1; }
            else { other += 1; }
        });

        function card(klass, titleKey, titleFallback, valueHtml, subHtml) {
            return '<div class="enm-usage-card enm-usage-card-' + klass + '">'
                + '<div class="enm-usage-card-title">'
                +   escapeHtml(tFb('overview_pane.' + titleKey, titleFallback))
                + '</div>'
                + '<div class="enm-usage-card-value">' + valueHtml + '</div>'
                + '<div class="enm-usage-card-sub">' + subHtml + '</div>'
                + '</div>';
        }

        // Card 1 — chains
        var chainsValue = (totals.total > 0)
            ? escapeHtml(tFb('overview_pane.chains_card_value', '{up}/{total}',
                { up: up, total: totals.total }))
            : '—';
        var chainsSub = (totals.total > 0)
            ? escapeHtml(tFb('overview_pane.chains_card_sub',
                '{synced} synced · {syncing} syncing · {other} other',
                { synced: synced, syncing: syncing, other: other }))
            : escapeHtml(tFb('overview_pane.summary_no_chains', 'No chains yet.'));

        // Card 2 — CPU
        var cpuValue = '—', cpuSub = '';
        if (usage.cpu) {
            cpuValue = escapeHtml(tFb('overview_pane.cpu_card_value', '{pct}%',
                { pct: (usage.cpu.loadPct != null ? usage.cpu.loadPct : '—') }));
            cpuSub = escapeHtml(tFb('overview_pane.cpu_card_sub', 'load {load1} on {cores} cores',
                { load1: (usage.cpu.loadAvg1m != null ? usage.cpu.loadAvg1m.toFixed(2) : '—'),
                  cores: (usage.cpu.cores != null ? usage.cpu.cores : '—') }));
        }

        // Card 3 — memory
        var memValue = '—', memSub = '';
        if (usage.memory) {
            memValue = escapeHtml(tFb('overview_pane.mem_card_value', '{usedGb} / {totalGb} GB',
                { usedGb: (usage.memory.usedGb != null ? usage.memory.usedGb : '—'),
                  totalGb: (usage.memory.totalGb != null ? usage.memory.totalGb : '—') }));
            memSub = escapeHtml(tFb('overview_pane.mem_card_sub', '{usedPct}% used',
                { usedPct: (usage.memory.usedPct != null ? usage.memory.usedPct : '—') }));
        }

        // Card 4 — disk
        var diskValue = '—', diskSub = '';
        if (usage.disk) {
            diskValue = escapeHtml(tFb('overview_pane.disk_card_value', '{usedGb} / {totalGb} GB',
                { usedGb: (usage.disk.usedGb != null ? usage.disk.usedGb : '—'),
                  totalGb: (usage.disk.totalGb != null ? usage.disk.totalGb : '—') }));
            diskSub = escapeHtml(tFb('overview_pane.disk_card_sub', '{freeGb} GB free',
                { freeGb: (usage.disk.freeGb != null ? usage.disk.freeGb : '—') }));
        }

        return ''
            + card('chains', 'chains_card_title', 'Chains', chainsValue, chainsSub)
            + card('cpu',    'cpu_card_title',    'CPU load', cpuValue, cpuSub)
            + card('mem',    'mem_card_title',    'Memory', memValue, memSub)
            + card('disk',   'disk_card_title',   'Disk', diskValue, diskSub);
    };

    /**
     * v0.5.203 — re-paint just the .enm-overview-usage container without
     * touching the chain rows or sparklines. Called from the 1s
     * /system/usage poll tick.
     * @private
     */
    EnmMultiChainOverviewPane.prototype._renderUsageCards = function () {
        if (!this._root) { return; }
        var container = this._root.querySelector('.enm-overview-usage');
        if (!container) { return; }   // initial render hasn't placed it yet
        container.innerHTML = this._usageCardsHtml(this._lastSnap);
        // v0.5.221 audit Phase 8 (XFLOW-12, AUDIT-FLOW-O10/O11/O12) —
        // apply threshold-aware styling to the disk/CPU/memory cards.
        // Pre-v0.5.221 these cards had no warn/critical visual state;
        // operator got NO inline cue when disk was approaching full or
        // CPU was saturated.
        var u = this._lastUsage || {};
        var apply = root.enmApplyThreshold;
        if (typeof apply !== 'function') { return; }
        var diskCard = container.querySelector('.enm-usage-card-disk');
        if (diskCard && u.disk && typeof u.disk.freeGb === 'number') {
            // freeGb LOW is bad. Default thresholds match the ENM package.json
            // enm.warnDiskFreeGb (100) + enm.minDiskFreeGb (50). Backend may
            // ship these in a future revision of /system/usage; until then,
            // hardcoded matches the package.json declared values.
            apply(diskCard, u.disk.freeGb, { warnAt: 100, criticalAt: 50 });
        }
        var cpuCard = container.querySelector('.enm-usage-card-cpu');
        if (cpuCard && u.cpu && typeof u.cpu.loadPct === 'number') {
            // loadPct HIGH is bad.
            apply(cpuCard, u.cpu.loadPct, { warnAt: 80, criticalAt: 95, invert: true });
        }
        var memCard = container.querySelector('.enm-usage-card-mem');
        if (memCard && u.memory && typeof u.memory.usedPct === 'number') {
            apply(memCard, u.memory.usedPct, { warnAt: 85, criticalAt: 95, invert: true });
        }
    };

    /**
     * v0.5.203 — new summary line that counts by the 7-tier state vocabulary
     * instead of the legacy "running/stopped/disabled/total" buckets. Makes
     * "8 synced · 0 syncing · 1 stalled · 0 stopped · 9 total" the operator's
     * single-glance health line.
     * @private
     */
    /**
     * v0.5.239 — health headline: a single at-a-glance verdict for the whole
     * node (green when all healthy; warns + names the troubled service when
     * not) plus bulk Start all / Restart all. Answers the operator's #1
     * question — "is my node OK?" — in one line.
     * @private
     */
    EnmMultiChainOverviewPane.prototype._healthHeadlineHtml = function (snap) {
        var chains = (snap && Array.isArray(snap.chains)) ? snap.chains : [];
        if (chains.length === 0) { return ''; }
        var total = chains.length, synced = 0, starting = 0, attention = [];
        chains.forEach(function (c) {
            var st = normalizeStateV2(c.state);
            if (st === 'synced') { synced += 1; }
            else if (st === 'syncing' || st === 'starting') { starting += 1; }
            else if (st === 'disabled') { /* intentionally off — not a problem. */ }
            // v0.5.240 audit fix — every other state (stopped, stalled, error,
            // recovering, unconfigured, loading, …) is something the operator
            // must see. The old code only bucketed stopped/stalled, so an
            // errored or unconfigured chain silently fell through to the
            // "All services healthy" verdict.
            else { attention.push(c); }
        });
        var dotClass, verdict, detail;
        if (attention.length > 0) {
            dotClass = 'warn';
            verdict = (attention.length === 1)
                ? tFb('overview_pane.health_attention_one', '1 service needs attention')
                : tFb('overview_pane.health_attention_many', '{n} services need attention', { n: attention.length });
            var names = attention.map(function (c) {
                return chainNameFor(c.chainId, c.displayName) + ' ' + stateLabelForV2(c.state).toLowerCase();
            }).join(', ');
            detail = '· ' + names + ' · ' + synced + ' of ' + total + ' synced';
        } else if (starting > 0) {
            dotClass = 'warn';
            verdict = tFb('overview_pane.health_syncing', 'Syncing');
            detail = '· ' + synced + ' of ' + total + ' synced';
        } else {
            dotClass = 'ok';
            verdict = tFb('overview_pane.health_healthy', 'All services healthy');
            // v0.5.240 audit fix — report the real synced count, not total.
            // The healthy branch is reached when nothing needs attention and
            // nothing is starting, so any non-synced remainder is disabled.
            detail = '· ' + synced + ' synced';
        }
        var anyStopped = chains.some(function (c) { return c.state === 'stopped'; });
        var bulk = '';
        if (anyStopped) {
            bulk += '<button type="button" class="enm-ovx-act is-start" data-bulk="start">'
                + '<span class="enm-ovx-ico" aria-hidden="true">▶</span>'
                + escapeHtml(tFb('overview_pane.bulk_start', 'Start all')) + '</button>';
        }
        bulk += '<button type="button" class="enm-ovx-act is-restart" data-bulk="restart">'
            + '<span class="enm-ovx-ico" aria-hidden="true">⟳</span>'
            + escapeHtml(tFb('overview_pane.bulk_restart', 'Restart all')) + '</button>';
        return '<section class="enm-ovx-health' + (dotClass === 'warn' ? ' warn' : '') + '">'
            + '<div class="enm-ovx-health-l">'
            +   '<span class="enm-ovx-dot-lg ' + dotClass + '" aria-hidden="true"></span>'
            +   '<span class="enm-ovx-health-verdict">' + escapeHtml(verdict) + '</span>'
            +   '<span class="enm-ovx-health-detail">' + escapeHtml(detail) + '</span>'
            + '</div>'
            + '<div class="enm-ovx-health-r">' + bulk + '</div>'
            + '</section>';
    };

    /**
     * v0.5.239 — bulk Start all / Restart all from the health headline.
     * Computes targets (start → stopped chains; restart → alive chains);
     * Restart all confirms first (v0.5.240 audit fix — it's disruptive),
     * Start all runs immediately. The actual POSTs + busy/pending state live
     * in _runBulk. Frontend-orchestrated; no bulk backend endpoint needed.
     * @private
     */
    EnmMultiChainOverviewPane.prototype._onBulk = function (kind, btn) {
        if (this._pendingAction) { return; }  // one action at a time, pane-wide
        var self = this;
        var chains = (this._lastSnap && Array.isArray(this._lastSnap.chains)) ? this._lastSnap.chains : [];
        var targets = chains.filter(function (c) {
            return (kind === 'start') ? (c.state === 'stopped') : !!c.alive;
        }).map(function (c) { return c.chainId; });
        if (targets.length === 0) { return; }
        // v0.5.240 audit fix — "Restart all" is disruptive (it stops then
        // restarts every running chain at once), so it gets the same confirm
        // gate the per-chain restart uses. "Start all" is non-destructive and
        // runs immediately.
        if (kind === 'restart') {
            if (typeof root.enmDestructiveModal !== 'function') {
                var fb = 'Restart all ' + targets.length + ' running chains now?';
                if (typeof root.confirm === 'function' && !root.confirm(fb)) { return; }
                this._runBulk(kind, btn, targets);
                return;
            }
            root.enmDestructiveModal({
                title:        'Restart all running chains?',
                body:         'All ' + targets.length + ' running chains will stop, then start again automatically (typical pause: 20-60 seconds each). Sync resumes from the current block — no data is lost.',
                cooldownSec:  1,
                confirmLabel: 'Restart ' + targets.length + ' chains',
                confirmKind:  'primary',
                notifications: self.notifications,
                onConfirm: function () {
                    self._runBulk(kind, btn, targets);
                    return Promise.resolve();
                },
            });
            return;
        }
        this._runBulk(kind, btn, targets);
    };

    /**
     * @private — shared POST runner for bulk Start all / Restart all. Sets the
     * pane-wide pending guard so SSE + other actions pause while the batch is
     * in flight, fires the per-chain POSTs in parallel, then clears the guard
     * and re-fetches. v0.5.240 audit fix (was inlined in _onBulk, which checked
     * _pendingAction but never set it).
     */
    EnmMultiChainOverviewPane.prototype._runBulk = function (kind, btn, targets) {
        var self = this;
        this._pendingAction = { bulk: kind };
        if (self.notifications && typeof self.notifications.info === 'function') {
            self.notifications.info(
                (kind === 'start' ? 'Starting ' : 'Restarting ') + targets.length + ' chains…', '');
        }
        if (btn) { btn.disabled = true; btn.classList.add('is-busy'); }
        Promise.all(targets.map(function (cid) {
            return self.api.post('/chains/' + cid + '/' + kind).catch(function () { return null; });
        })).then(function () {
            self._pendingAction = null;
            if (self._destroyed) { return; }
            if (btn) { btn.disabled = false; btn.classList.remove('is-busy'); }
            self._fetchInitial();
        });
    };

    /**
     * v0.5.238 — "This node" identity card. Surfaces ENM's own node status the
     * way node.sh's `status` does, but labeled "DAO Council" (the Cyber
     * Republic / CR Council is the Elastos DAO): DAO Council membership
     * (name + state) and BPoS producer status (name + state), side by side,
     * plus the mining key + address. Truthful — reflects ENM's node key, so a
     * node that isn't bound to a Council seat reads "Not a Council member" and
     * an unregistered producer reads "Not registered". (CRC and BPoS are
     * independent roles; a Council member earns automatically as a CRC arbiter
     * and does NOT register as a BPoS producer — so no hint is shown here.)
     * Sourced from /system/identity (this._lastIdentity); returns '' until that
     * resolves so the card never flashes an empty state.
     * @private
     */
    EnmMultiChainOverviewPane.prototype._identityCardHtml = function () {
        var id = this._lastIdentity;
        if (!id) { return ''; }
        var ks = id.keystore || {};
        var cr = id.crMember || null;
        var prod = id.producer || null;
        var setupRole = id.setupRole || 'unknown';

        function trunc(s, head, tail) {
            s = String(s || '');
            if (s.length <= head + tail + 1) { return s; }
            return s.slice(0, head) + '…' + s.slice(-tail);
        }
        function pill(label, dotState, valueText) {
            return '<div class="enm-identity-pill">'
                + '<span class="enm-identity-pill-label">' + escapeHtml(label) + '</span>'
                + '<span class="enm-identity-pill-val">'
                +   '<span class="enm-identity-dot state-' + escapeAttr(dotState) + '" aria-hidden="true"></span>'
                +   escapeHtml(valueText)
                + '</span></div>';
        }

        // DAO Council (CRC) row.
        var councilDot, councilText;
        if (cr && cr.isCrMember) {
            councilDot = 'synced';
            councilText = (cr.state || 'Member') + (cr.nickname ? ' · ' + cr.nickname : '');
        } else {
            councilDot = 'unconfigured';
            councilText = (setupRole === 'council')
                ? tFb('overview_pane.identity.council_unbound', 'Not bound to a seat')
                : tFb('overview_pane.identity.not_council', 'Not a Council member');
        }

        // BPoS producer row.
        var bposDot, bposText;
        if (prod && prod.state) {
            bposDot = (prod.state === 'Active') ? 'synced' : 'syncing';
            bposText = prod.state + (prod.nickname ? ' · ' + prod.nickname : '');
        } else {
            bposDot = 'unconfigured';
            bposText = tFb('overview_pane.identity.bpos_unregistered', 'Not registered');
        }

        // v0.5.243 — removed the BPoS hint. It claimed a Council node "still
        // registers as a BPoS producer separately to earn staking rewards",
        // which is wrong: an elected CR member is auto-promoted to a CRC
        // arbiter and earns the per-block CRC reward automatically (Elastos.ELA
        // dpos/state/arbitrators.go — CRC-type arbiters with MemberState ==
        // MemberElected are paid without any RegisterProducer). node.sh keeps
        // CRC and BPoS as independent roles (register_crc vs register_bpos);
        // the only shared step is `activate`, an inactivity-recovery tx, not an
        // onboarding requirement. The DAO Council pill already states the real
        // status, so no explanatory text is added in its place.

        // Mining key + address.
        var keyLine = '';
        var keyParts = [];
        if (ks.publicKey) {
            keyParts.push('<span class="enm-identity-kv"><span class="enm-identity-kv-k">'
                + escapeHtml(tFb('overview_pane.identity.key_label', 'Key')) + '</span> '
                + '<span class="enm-mono">' + escapeHtml(trunc(ks.publicKey, 6, 4)) + '</span></span>');
        }
        if (ks.address) {
            keyParts.push('<span class="enm-identity-kv"><span class="enm-identity-kv-k">'
                + escapeHtml(tFb('overview_pane.identity.addr_label', 'Address')) + '</span> '
                + '<span class="enm-mono">' + escapeHtml(trunc(ks.address, 6, 4)) + '</span></span>');
        }
        if (keyParts.length) {
            keyLine = '<div class="enm-identity-keys">'
                + keyParts.join('<span class="enm-identity-sep" aria-hidden="true">·</span>')
                + '</div>';
        }

        return '<section class="enm-overview-identity" aria-label="'
            + escapeAttr(tFb('overview_pane.identity.aria', 'This node identity')) + '">'
            + '<div class="enm-identity-head">'
            +   escapeHtml(tFb('overview_pane.identity.title', 'This node'))
            + '</div>'
            + '<div class="enm-identity-pills">'
            +   pill(tFb('overview_pane.identity.council_label', 'DAO Council'), councilDot, councilText)
            +   pill(tFb('overview_pane.identity.bpos_label', 'BPoS'), bposDot, bposText)
            + '</div>'
            + keyLine
            + '</section>';
    };

    /**
     * Drill into a chain's dashboard by dispatching the enm:chain-change event
     * that PaneRouter (app.js) listens for. v0.5.237 removed the chain-selector
     * dropdown, so this event is now the only routing path — nothing is
     * persisted (drill-in is session-only; a reload lands a Council node back
     * on the overview). Also announces the switch for screen readers.
     *
     * @private
     * @param {string} chainId
     */
    EnmMultiChainOverviewPane.prototype._routeToChain = function (chainId) {
        if (!chainId) { return; }
        // v0.5.237 — the chain selector dropdown was removed. Row clicks route
        // PURELY via the enm:chain-change event below; PaneRouter catches it
        // and drills into the chain's dashboard (rendering a "Back to overview"
        // control). Nothing is persisted — drill-in is session-only, so a
        // reload always lands a Council node back on the overview.
        try {
            document.dispatchEvent(new CustomEvent('enm:chain-change', {
                detail: { key: chainId, source: 'overview-row-click' },
                bubbles: true,
            }));
        } catch (_) { /* IE-era fallback unnecessary */ }
        if (this.announcer && typeof this.announcer.polite === 'function') {
            try {
                this.announcer.polite(tFb(
                    'overview_pane.announce_switched_to',
                    'Switched to {chainName}',
                    { chainName: chainNameFor(chainId, null) },
                ));
            } catch (_) { /* ignore */ }
        }
    };

    function formatUptime(sec) {
        if (typeof sec !== 'number' || sec < 0) { return ''; }
        if (sec < 60)    { return sec + 's'; }
        if (sec < 3600)  { return Math.floor(sec / 60) + 'm'; }
        if (sec < 86400) { return Math.floor(sec / 3600) + 'h'; }
        return Math.floor(sec / 86400) + 'd';
    }

    // v0.5.186 (Council Node UX P2.1) — thousands-separated block height.
    // Prefer the shared util when present (utils.js enmFormatNumber); fall
    // back to a local Intl/regex grouping so the component still works in
    // unit tests that don't load utils.js.
    function formatNumber(n) {
        // v0.5.191 — never surface "NaN"/"undefined"/"null" to the operator;
        // an em-dash is an honest "no value". Callers guard upstream, so this
        // is a defensive last resort.
        if (typeof n !== 'number' || !isFinite(n)) { return '—'; }
        if (typeof root.enmFormatNumber === 'function') {
            try { return root.enmFormatNumber(n); } catch (_) { /* fall through */ }
        }
        try { return n.toLocaleString('en-US'); } catch (_) { /* fall through */ }
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttr(s) {
        return escapeHtml(String(s));
    }

    root.EnmMultiChainOverviewPane = EnmMultiChainOverviewPane;
    // Exported for unit tests.
    root.EnmMultiChainOverviewPane._internal = {
        formatUptime,
        escapeHtml,
        escapeAttr,
        CLASS_LABEL,
        STATE_LABEL,
        CHAIN_DISPLAY_FALLBACK,
        SSE_TOPIC,
    };
}(typeof window !== 'undefined' ? window : globalThis));
