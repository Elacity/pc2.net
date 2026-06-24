/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/audit-tab.js — beta.3 redesign.
 *
 * Hits GET /api/audit?chainId=&tier=&from=&to=. Renders rows in a
 * semantic <table> with sticky thead, chip-based When + Tier filters,
 * and a slide-in right-side drawer that exposes the per-row payload +
 * duration (fields the API already returns; the v0.1 table never
 * rendered them — see routes/audit.js:94–120 decodeRow()).
 *
 * The "Copy filtered rows" toolbar button replaces the v0.1 JSON Blob
 * download: same /audit?limit=500 fetch, written as TSV to the
 * clipboard so the operator can paste straight into a ticket. The
 * drawer Copy button writes just the row's payload JSON.
 *
 * alpha.28 invariants preserved verbatim:
 *   - _destroyed guard on every .then() resolver (load AND copy)
 *   - 401 suppression on every API call (boot path owns re-auth)
 *   - 5000-row session cap on accumulated rows (MAX_ROWS)
 *   - encodeURIComponent on every dynamic query-string segment
 *   - _loadSeq stale-fetch sentinel (filter-change race fix)
 *   - row-count i18n with singular split + grouped numbers
 */

(function (root) {
    'use strict';

    var PAGE_SIZE = 100;
    // Hard cap on accumulated rows — same rationale as alpha.27: with
    // audit retention.days = 0 an unbounded session could leak DOM.
    // 5000 fits ~50 days of typical healing activity; operators wanting
    // more should narrow filters or use the Copy button (limit=500).
    var MAX_ROWS = 5000;
    var COPY_LIMIT = 500;
    // Drawer slide-out transition. Matches the settings-drawer 320ms so
    // the visual cadence is consistent across the app.
    var DRAWER_CLOSE_MS = 320;

    var TIER_VALUES = [
        'AUTOMATED-SAFE',
        'OWNER-CONFIRMS',
        'CRITICAL-NOTIFY',
        'NEVER-AUTOMATIC',
        'HTTP-MUTATION',
    ];
    // Time-range chip presets. `null` means "no filter" (All time).
    // Custom is a future hook — clicking renders an info toast.
    var WHEN_PRESETS = {
        all:    { label: 'All time' },
        today:  { label: 'Today' },
        '7d':   { label: '7 days',  ms: 7  * 24 * 3600 * 1000 },
        '30d':  { label: '30 days', ms: 30 * 24 * 3600 * 1000 },
        custom: { label: 'Custom…', future: true },
    };

    // v0.5.168 (Phase 4) — friendly chain names for the audit "Chain" filter
    // chip. Runtime prefers enmT('chain_name.<id>'); this is the fallback used
    // before strings.js loads / in tests. Keys are the real cfg.chains.* ids
    // (the synthetic 'all'/'spv' selector keys never reach the audit tab).
    var CHAIN_AUDIT_NAME = {
        mainchain:    'Main chain',
        esc:          'Smart Chain',
        eid:          'Identity Chain',
        pg:           'PG Chain',
        'esc-oracle': 'ESC Oracle',
        'eid-oracle': 'EID Oracle',
        'pg-oracle':  'PG Oracle',
        arbiter:      'Arbiter Service',
    };

    /** Friendly display name for a chainId, preferring strings.js. */
    function chainAuditName(id) {
        var t = root.enmTOrFallback || root.enmT;
        if (typeof t === 'function') {
            var v = t('chain_name.' + id);
            if (v && v !== ('chain_name.' + id) && v !== ('[chain_name.' + id + ']')) { return v; }
        }
        return CHAIN_AUDIT_NAME[id] || id;
    }

    function AuditTab(opts) {
        if (!opts || !opts.api || !opts.notifications) {
            throw new TypeError('AuditTab: { api, notifications } required');
        }
        this.api = opts.api;
        this.notifications = opts.notifications;
        // 0.2.0-beta.3.8 — SSE service for the live `audit` topic.
        // Optional dependency; if absent, audit-tab falls back to
        // refresh-to-see-new-rows behaviour. mount() arms the
        // subscription; destroy() tears it down.
        this.sse = opts.sse || null;
        this._unsubAudit = null;

        // v0.5.168 (Phase 4) — the chain this audit view was mounted for (from
        // PaneRouter's active chain). Drives the "This chain only" filter chip
        // (adds chainId= to /audit). The audit tab is torn down + re-mounted on
        // chain change, so this is always the currently-selected chain. null
        // when mounted without a chain context (the chip group is then hidden).
        this.chainId = (opts && opts.chainId) || null;

        this.root = document.createElement('section');
        this.root.className = 'enm-audit';

        this._offset = 0;
        this._rows = [];
        // alpha.28.1 batch 16 — _destroyed flag + _loadSeq sequence
        // number preserved verbatim from alpha.27. _destroyed gates
        // every async resolver against detached-DOM writes; _loadSeq
        // makes stale Load-more fetches no-op after refresh() bumps
        // the seq (filter-change race fix).
        this._destroyed = false;
        this._loadSeq = 0;

        // Filter state. `tier` is one of TIER_VALUES or '' (any).
        // `when` is a key of WHEN_PRESETS. `from`/`to` are epoch ms
        // derived from `when` at refresh() time.
        // v0.5.218 audit Phase 4 (AUDIT-FLOW-AU04, P2) — persist via
        // enmPrefs so the operator's filter survives tab remount /
        // chain switch. Pre-v0.5.218 every remount reset filters.
        var DEFAULT_FILTERS = { tier: '', when: 'all', chain: '' };
        this._filters = (root.enmPrefs && typeof root.enmPrefs.get === 'function')
            ? root.enmPrefs.get('audit-tab:filters', DEFAULT_FILTERS)
            : DEFAULT_FILTERS;

        // Drawer state.
        this._drawer = null;
        this._drawerScrim = null;
        this._drawerOpen = false;
        this._drawerRowEl = null;     // currently expanded <tr>, if any
        this._previousFocus = null;
        this._escHandler = null;
        this._trapHandler = null;
        this._drawerCloseTimer = null;

        // beta.3.48 — restore the audit-mode preference (friendly /
        // technical) from sessionStorage so a toggle survives within
        // the session. Default is "friendly" — the operator's first
        // impression should be the plain-language view.
        try {
            if (typeof window !== 'undefined' && window.sessionStorage) {
                var stored = window.sessionStorage.getItem('enm-audit-mode');
                this._showTechnical = stored === 'technical';
            }
        } catch (_) { this._showTechnical = false; }

        this._renderShell();
    }

    AuditTab.prototype.mount = function (parent) {
        parent.appendChild(this.root);
        // beta.3.52 — the /whoami pre-warm + __enmCurrentOperatorWallet
        // cache was dropped. ENM no longer surfaces the PC2 wallet
        // anywhere; the audit row executor field is now a literal
        // 'operator'/'system' role label, so friendlyExecutor() needs
        // no per-session identity hint.
        this.refresh();
        // 0.2.0-beta.3.8 — subscribe to the live `audit` SSE topic so
        // new rows prepend in place instead of needing a manual
        // refresh. beta.3.52 made the SSE publish broadcast (single-
        // tenant ENM, owner-only /events subscription gate); audit-tab
        // still receives the same rows the GET /audit returns.
        if (this.sse && typeof this.sse.subscribe === 'function') {
            var self = this;
            this._unsubAudit = this.sse.subscribe('audit', function (row) {
                if (self._destroyed) { return; }
                self._handleLiveRow(row);
            });
        }
        return this;
    };

    AuditTab.prototype.destroy = function () {
        this._destroyed = true;
        // 0.2.0-beta.3.8 — drop the live SSE subscription. Defensive
        // try/catch because some sse service shapes return a no-op
        // function and others throw on double-unsub; either way the
        // teardown must not poison the rest of destroy().
        if (this._unsubAudit) {
            try { this._unsubAudit(); } catch (_) { /* idempotent */ }
            this._unsubAudit = null;
        }
        // Bump the seq so any in-flight fetch's resolver short-circuits.
        this._loadSeq += 1;
        // Tear down drawer global listeners if the drawer was open at
        // destroy time. Same reasoning as settings-drawer: a leaked
        // keydown listener fires into detached DOM and breaks Tab
        // navigation elsewhere in the app.
        this._teardownDrawerListeners();
        if (this._drawerCloseTimer) {
            clearTimeout(this._drawerCloseTimer);
            this._drawerCloseTimer = null;
        }
        if (this.root.parentNode) { this.root.parentNode.removeChild(this.root); }
    };

    /** Refresh from offset 0. */
    AuditTab.prototype.refresh = function () {
        // Bump the seq BEFORE clearing state so any in-flight Load-more
        // resolves into a stale-seq check and bails before touching
        // _rows / _tbody. (alpha.28.1 batch 16.)
        this._loadSeq += 1;
        this._offset = 0;
        this._rows = [];
        // Close drawer on refresh — the row it pointed at may no
        // longer exist after a filter change.
        if (this._drawerOpen) { this._closeDrawer(); }
        return this._loadMore(true);
    };

    // ------------------------------------------------------------------
    // Data loading
    // ------------------------------------------------------------------

    /** @private */
    AuditTab.prototype._loadMore = function (clear) {
        var self = this;
        var t = root.enmTOrFallback;
        var mySeq = this._loadSeq;
        var qs = this._currentFilterQs();
        qs += (qs ? '&' : '') + 'limit=' + PAGE_SIZE + '&offset=' + this._offset;
        return this.api.get('/audit?' + qs, { skipCache: true }).then(function (data) {
            if (self._destroyed || self._loadSeq !== mySeq) { return; }
            var entries = (data && data.entries) || [];
            if (clear) {
                self._tbody.innerHTML = '';
                self._rows = [];
            }
            self._rows = self._rows.concat(entries);
            entries.forEach(function (e) { self._appendRow(e); });
            self._offset += entries.length;

            var endOfFeed = (entries.length < PAGE_SIZE);
            var capReached = (self._rows.length >= MAX_ROWS);

            self._loadMoreBtn.disabled = endOfFeed || capReached;
            self._loadMoreBtn.textContent = capReached
                ? t('audit.load_more_capped')
                : t('audit.load_more');

            // Grouped row count — same i18n shape as alpha.27 (split
            // singular/plural keys so "1 rows" never prints).
            var fmtCount = (typeof window !== 'undefined' && window.enmFormatNumber)
                ? window.enmFormatNumber
                : function (n) { return String(n); };
            var n = self._rows.length;
            var rowsKeyId = n === 1 ? 'audit.row_count_one' : 'audit.row_count';
            var rowsKey = t(rowsKeyId, { n: fmtCount(n) });
            self._countLabel.textContent = (rowsKey && rowsKey !== rowsKeyId)
                ? rowsKey
                : fmtCount(n) + (n === 1 ? ' row' : ' rows');

            self._emptyMsg.hidden = (self._rows.length !== 0);
            // Hide the table wrap when empty so the empty-state has
            // visual weight; the foot stays attached to the wrap so
            // it disappears with it.
            self._tableWrap.hidden = (self._rows.length === 0);
        }).catch(function (err) {
            if (self._destroyed || self._loadSeq !== mySeq) { return; }
            // alpha.28.1 batch 51 — 401 suppressed (boot path owns
            // re-auth). Without this, an expired session triggered
            // a "Failed to load audit log" toast every filter-Apply
            // click. (Audit ad49e60e ⚠ 401-not-filtered finding.)
            if (err && err.status === 401) { return; }
            self.notifications.show({
                id: 'audit-load-fail',
                severity: 'warning',
                title: 'Failed to load audit log',
                body: err.message || String(err),
            });
        });
    };

    /**
     * beta.3.48 — toggle between friendly (default) and technical
     * modes. Updates the data-audit-mode on the root, swaps the
     * toggle label, and saves the preference so it persists across
     * tab re-mounts within the session.
     */
    AuditTab.prototype._toggleTechnical = function () {
        var t = root.enmTOrFallback;
        this._showTechnical = !this._showTechnical;
        this.root.dataset.auditMode = this._showTechnical ? 'technical' : 'friendly';
        if (this._technicalToggle) {
            this._technicalToggle.textContent = this._showTechnical
                ? t('audit.hide_technical')
                : t('audit.show_technical');
        }
        // Persist for the session (sessionStorage so reload resets;
        // operator's first impression should be the friendly view).
        try {
            if (typeof window !== 'undefined' && window.sessionStorage) {
                window.sessionStorage.setItem('enm-audit-mode',
                    this._showTechnical ? 'technical' : 'friendly');
            }
        } catch (_) { /* private mode etc. */ }
    };

    /** @private */
    AuditTab.prototype._currentFilterQs = function () {
        var parts = [];
        if (this._filters.tier) {
            parts.push('tier=' + encodeURIComponent(this._filters.tier));
        }
        // v0.5.168 (Phase 4) — scope to one chain when the operator picks the
        // "This chain only" chip. Backend /audit?chainId= filters server-side
        // (routes/audit.js:54 → EnmAuditLog.query chain_id = ?).
        if (this._filters.chain) {
            parts.push('chainId=' + encodeURIComponent(this._filters.chain));
        }
        var range = this._currentWhenRange();
        if (range.from != null) { parts.push('from=' + encodeURIComponent(range.from)); }
        if (range.to   != null) { parts.push('to='   + encodeURIComponent(range.to)); }
        return parts.join('&');
    };

    /** @private */
    AuditTab.prototype._currentWhenRange = function () {
        var key = this._filters.when;
        var preset = WHEN_PRESETS[key];
        if (!preset || key === 'all' || key === 'custom') { return { from: null, to: null }; }
        if (key === 'today') {
            // Midnight UTC today.
            var now = new Date();
            var from = Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate(),
            );
            return { from: from, to: null };
        }
        if (preset.ms) {
            return { from: Date.now() - preset.ms, to: null };
        }
        return { from: null, to: null };
    };

    // ------------------------------------------------------------------
    // Shell + chrome
    // ------------------------------------------------------------------

    /** @private */
    AuditTab.prototype._renderShell = function () {
        var t = root.enmTOrFallback;
        var self = this;

        // beta.3.48 — default to "friendly" mode (When / What / Result);
        // operator can flip to "technical" via the toolbar toggle.
        if (typeof this._showTechnical !== 'boolean') {
            this._showTechnical = false;
        }
        this.root.dataset.auditMode = this._showTechnical ? 'technical' : 'friendly';

        // --- Toolbar -------------------------------------------------
        var toolbar = el('div', 'enm-audit-toolbar');
        var title = el('h2', 'enm-audit-title');
        title.id = 'enm-audit-title';
        title.textContent = t('audit.heading');
        toolbar.appendChild(title);
        // 0.5.16 audit Session 16 — scope note rewrite. Pre-0.5.16 said
        // "All chains · audit retention as configured" — the "as
        // configured" hedge didn't tell the operator where to find the
        // setting, and most operators don't think in retention terms
        // anyway. "Newest events first" describes the only thing the
        // operator needs to know to read the table.
        var scope = el('div', 'enm-audit-scope-note');
        scope.textContent = 'All chains · newest events first';
        toolbar.appendChild(scope);

        var actions = el('div', 'enm-audit-actions');
        // beta.3.48 — technical toggle. Toggling re-renders the table
        // body too (header is shared; CSS hides cells per mode).
        this._technicalToggle = btn(
            this._showTechnical
                ? t('audit.hide_technical')
                : t('audit.show_technical'),
            'enm-btn-secondary enm-audit-technical-toggle',
            function () { self._toggleTechnical(); });
        actions.appendChild(this._technicalToggle);
        this._copyBtn = btn(t('audit.copy_filtered') || 'Copy filtered rows',
            'enm-btn-secondary enm-audit-copy', function () { self._copyTsv(); });
        actions.appendChild(this._copyBtn);
        toolbar.appendChild(actions);
        this.root.appendChild(toolbar);

        // --- Filters -------------------------------------------------
        this.root.appendChild(this._renderFilterBar());

        // --- Table wrap ---------------------------------------------
        var wrap = el('div', 'enm-audit-table-wrap');
        this._tableWrap = wrap;
        var scroller = el('div', 'enm-audit-table-scroller');
        var table = document.createElement('table');
        table.className = 'enm-audit-table';
        // a11y: scope=col so screen readers announce the header for
        // each cell when navigating the table grid.
        var thead = document.createElement('thead');
        var theadRow = document.createElement('tr');
        // beta.3.48 — 3 friendly columns (default) + 7 technical
        // (toggle-revealed). CSS hides one set or the other via the
        // data-audit-mode on this.root.
        var headerKeys = [
            // Friendly mode
            { key: 'col_when',     cls: 'col-when col-friendly' },
            { key: 'col_what',     cls: 'col-what col-friendly' },
            { key: 'col_result',   cls: 'col-result col-friendly' },
            // Technical mode
            { key: 'col_ts',       cls: 'col-ts col-technical' },
            { key: 'col_chain',    cls: 'col-chain col-technical' },
            { key: 'col_rule',     cls: 'col-rule col-technical' },
            { key: 'col_tier',     cls: 'col-tier col-technical' },
            { key: 'col_decision', cls: 'col-decision col-technical' },
            { key: 'col_executor', cls: 'col-executor col-technical' },
            { key: 'col_outcome',  cls: 'col-outcome col-technical' },
        ];
        headerKeys.forEach(function (h) {
            var th = document.createElement('th');
            th.className = h.cls;
            th.scope = 'col';
            th.textContent = t('audit.' + h.key);
            theadRow.appendChild(th);
        });
        thead.appendChild(theadRow);
        table.appendChild(thead);
        this._tbody = document.createElement('tbody');
        table.appendChild(this._tbody);
        scroller.appendChild(table);
        wrap.appendChild(scroller);

        // --- Foot (count + Load more) -------------------------------
        var foot = el('div', 'enm-audit-foot');
        this._countLabel = el('span', 'enm-audit-count');
        foot.appendChild(this._countLabel);
        this._loadMoreBtn = btn(t('audit.load_more'),
            'enm-btn-secondary enm-audit-load-more',
            function () { self._loadMore(false); });
        foot.appendChild(this._loadMoreBtn);
        wrap.appendChild(foot);
        this.root.appendChild(wrap);

        // --- Empty state --------------------------------------------
        this._emptyMsg = el('p', 'enm-audit-empty');
        this._emptyMsg.textContent = t('audit.empty');
        this._emptyMsg.hidden = true;
        this.root.appendChild(this._emptyMsg);

        // Drawer DOM is built lazily on first open — until then the
        // pane is just the table.
    };

    /** @private */
    AuditTab.prototype._renderFilterBar = function () {
        var t = root.enmTOrFallback;
        var self = this;
        var bar = el('div', 'enm-audit-filters');

        // --- When group ---------------------------------------------
        var whenGroup = el('div', 'enm-audit-filter-group');
        whenGroup.setAttribute('role', 'group');
        whenGroup.setAttribute('aria-label', t('audit.filter_when') || 'When');
        var whenLabel = el('span', 'enm-audit-filter-label');
        whenLabel.textContent = t('audit.filter_when') || 'When';
        whenGroup.appendChild(whenLabel);
        this._whenChips = {};
        ['all', 'today', '7d', '30d', 'custom'].forEach(function (key) {
            var chip = chipBtn(WHEN_PRESETS[key].label, key === 'all');
            chip.dataset.when = key;
            chip.addEventListener('click', function () { self._onWhenChip(key); });
            self._whenChips[key] = chip;
            whenGroup.appendChild(chip);
        });
        bar.appendChild(whenGroup);

        // --- Tier group ---------------------------------------------
        var tierGroup = el('div', 'enm-audit-filter-group');
        tierGroup.setAttribute('role', 'group');
        tierGroup.setAttribute('aria-label', t('audit.filter_tier') || 'Tier');
        var tierLabel = el('span', 'enm-audit-filter-label');
        tierLabel.textContent = t('audit.filter_tier') || 'Tier';
        tierGroup.appendChild(tierLabel);
        this._tierChips = {};

        var anyChip = chipBtn(t('audit.tier_any') || 'Any', true);
        anyChip.dataset.tier = '';
        anyChip.addEventListener('click', function () { self._onTierChip(''); });
        this._tierChips[''] = anyChip;
        tierGroup.appendChild(anyChip);

        TIER_VALUES.forEach(function (tier) {
            // beta.3.48 — chip label uses the friendly name (e.g.
            // "Auto-fix") instead of the internal tier code (e.g.
            // "AUTOMATED-SAFE"). Tier-specific border/background
            // styling still keys off data-tier so the existing CSS
            // palette in styles.css works unchanged.
            var chip = chipBtn(friendlyTierLabel(tier), false);
            chip.dataset.tier = tier;
            chip.addEventListener('click', function () { self._onTierChip(tier); });
            self._tierChips[tier] = chip;
            tierGroup.appendChild(chip);
        });
        bar.appendChild(tierGroup);

        // --- Chain group (v0.5.168 Phase 4) -------------------------
        // Only when mounted in a real chain context. Lets the operator scope
        // the global audit feed to just the active chain's rows. Default
        // "All chains" preserves the pre-0.5.168 global view.
        if (this.chainId && CHAIN_AUDIT_NAME[this.chainId]) {
            var chainGroup = el('div', 'enm-audit-filter-group');
            chainGroup.setAttribute('role', 'group');
            chainGroup.setAttribute('aria-label', t('audit.filter_chain') || 'Chain');
            var chainLabel = el('span', 'enm-audit-filter-label');
            chainLabel.textContent = t('audit.filter_chain') || 'Chain';
            chainGroup.appendChild(chainLabel);
            this._chainChips = {};

            var allChainsChip = chipBtn(t('audit.chain_all') || 'All chains', true);
            allChainsChip.dataset.chain = '';
            allChainsChip.addEventListener('click', function () { self._onChainChip(''); });
            this._chainChips[''] = allChainsChip;
            chainGroup.appendChild(allChainsChip);

            var thisChainChip = chipBtn(chainAuditName(this.chainId), false);
            thisChainChip.dataset.chain = this.chainId;
            thisChainChip.addEventListener('click', function () { self._onChainChip(self.chainId); });
            this._chainChips[this.chainId] = thisChainChip;
            chainGroup.appendChild(thisChainChip);

            bar.appendChild(chainGroup);
        }

        return bar;
    };

    /** @private */
    AuditTab.prototype._onWhenChip = function (key) {
        var preset = WHEN_PRESETS[key];
        if (preset && preset.future) {
            // Custom is a future hook. Toast informs the operator the
            // surface is intentional, not broken.
            if (this.notifications && this.notifications.info) {
                this.notifications.info('Custom date range coming soon', '');
            }
            return;
        }
        if (this._filters.when === key) { return; }
        this._filters.when = key;
        this._persistFilters();
        this._syncChipGroup(this._whenChips, key);
        this.refresh();
    };

    /** @private */
    AuditTab.prototype._onTierChip = function (tier) {
        if (this._filters.tier === tier) { return; }
        this._filters.tier = tier;
        this._persistFilters();
        this._syncChipGroup(this._tierChips, tier);
        this.refresh();
    };

    /** @private — v0.5.168 (Phase 4) — chain scope chip ('' = all chains). */
    AuditTab.prototype._onChainChip = function (chain) {
        if (this._filters.chain === chain) { return; }
        this._filters.chain = chain;
        this._persistFilters();
        this._syncChipGroup(this._chainChips, chain);
        this.refresh();
    };

    /**
     * v0.5.218 audit Phase 4 (AUDIT-FLOW-AU04, P2) — write current
     * filters to sessionStorage so they persist across remount /
     * chain switch. Called from every filter-mutator. Silent on
     * private-mode storage failure.
     * @private
     */
    AuditTab.prototype._persistFilters = function () {
        if (root.enmPrefs && typeof root.enmPrefs.set === 'function') {
            try { root.enmPrefs.set('audit-tab:filters', this._filters); }
            catch (_) { /* silent */ }
        }
    };

    /** @private */
    AuditTab.prototype._syncChipGroup = function (chipMap, activeKey) {
        Object.keys(chipMap).forEach(function (k) {
            var chip = chipMap[k];
            var match = (k === activeKey);
            if (match) { chip.classList.add('active'); }
            else { chip.classList.remove('active'); }
            chip.setAttribute('aria-pressed', match ? 'true' : 'false');
        });
    };

    // ------------------------------------------------------------------
    // Row rendering
    // ------------------------------------------------------------------

    /** @private */
    /**
     * 0.2.0-beta.3.8 — handle a live audit row arriving via the
     * `audit` SSE topic. Mirrors the filter logic in
     * _currentFilterQs (tier + when range) so a row that wouldn't
     * survive the operator's active filter doesn't visually pop
     * into the table. Inserts at the top of tbody (newest first
     * matches the DESC ORDER BY ts the backend uses); keeps the
     * array-index closure model intact by pushing to the END of
     * _rows + reading length-1 as the new idx.
     *
     * @private
     */
    AuditTab.prototype._handleLiveRow = function (e) {
        if (!e || typeof e !== 'object') { return; }
        // Filter: tier. Empty filter = any tier.
        if (this._filters && this._filters.tier
            && String(e.tier) !== this._filters.tier) {
            return;
        }
        // v0.5.224 audit (AUDIT-FLOW-AU09, P2) — chain filter MUST be
        // applied to live SSE rows. Pre-v0.5.224 only tier + when
        // range were checked; "This chain only" operator filter
        // silently leaked rows from other chains until next refresh.
        if (this._filters && this._filters.chain) {
            var rowChain = e.chainId || e.chain_id || '';
            if (String(rowChain) !== this._filters.chain) {
                return;
            }
        }
        // Filter: time range. Same logic as _currentWhenRange — for
        // 'today'/'7d'/'30d' there's a from-ms cutoff; rows older
        // than that are silently dropped. 'all' and 'custom' pass
        // every live row through.
        var range = this._currentWhenRange();
        if (range && range.from != null && typeof e.ts === 'number' && e.ts < range.from) {
            return;
        }
        // 5000-row cap — match the MAX_ROWS guard in _loadMore. Pre-
        // bumping the array would risk Object.assign'ing past the
        // limit and slowing the table; just drop oldest visual row
        // before insert.
        while (this._tbody.firstChild && this._rows.length >= MAX_ROWS) {
            this._tbody.removeChild(this._tbody.lastChild);
            this._rows.pop();
        }
        this._renderLiveRow(e);
        // Bump the meta count if the toolbar shows it.
        if (this._refreshMeta) { this._refreshMeta(); }
    };

    /**
     * 0.2.0-beta.3.8 — same shape as _appendRow but prepends the
     * <tr> instead of appending so the new row appears at the top
     * (matches the DESC ts ORDER). _rows array keeps push semantics
     * because click handlers capture idx in closure and reading
     * _rows[idx] must still return the right entry.
     *
     * @private
     */
    AuditTab.prototype._renderLiveRow = function (e) {
        var self = this;
        this._rows.push(e);
        var idx = this._rows.length - 1;
        var tr = document.createElement('tr');
        tr.dataset.tier = e.tier || '';
        // beta.3.49 — CRITICAL-INFO rows are descriptive duplicates
        // of the same HTTP mutation already represented by the
        // HTTP-MUTATION middleware row. Hide them in friendly mode
        // so the timeline isn't double-counted; still visible in
        // technical mode for forensic detail.
        if (e.tier === 'CRITICAL-INFO') {
            tr.classList.add('enm-audit-row-info-duplicate');
        }
        tr.dataset.idx = String(idx);
        tr.setAttribute('tabindex', '0');
        tr.setAttribute('role', 'button');
        tr.setAttribute('aria-label',
            (e.ruleId || e.rule_id || '—') + ' · ' + (e.decision || ''));
        // beta.3.48 — friendly cells (default) + technical cells
        // (toggle-revealed). CSS hides whichever set isn't active.
        addCell(tr, 'col-when col-friendly',
            formatTsRelative(e.ts), formatTsLocal(e.ts));
        addCell(tr, 'col-what col-friendly',
            friendlyAction(e), e.decision || '');
        // beta.3.66 — friendly column uses decision-first kind so
        // routine executed actions display as green "Done", not the
        // pre-3.66 orange "Notified". Technical column below still uses
        // outcomeKind on the raw outcome string (operator wants the
        // tech-mode badge to reflect the actual outcome text).
        addBadgeCell(tr, 'col-result col-friendly',
            friendlyResult(e), 'enm-outcome-badge',
            { kind: friendlyResultKind(e) });
        addCell(tr, 'col-ts col-technical',       formatTs(e.ts),                 formatTsLocal(e.ts));
        addCell(tr, 'col-chain col-technical',    e.chainId || e.chain_id || '—');
        addCell(tr, 'col-rule col-technical',     e.ruleId  || e.rule_id  || '—');
        addBadgeCell(tr, 'col-tier col-technical',
            friendlyTierLabel(e.tier), 'enm-tier-badge', { tier: e.tier });
        addCell(tr, 'col-decision col-technical', e.decision || '—');
        addCell(tr, 'col-executor col-technical',
            friendlyExecutor(e),
            e.executor || '');
        addBadgeCell(tr, 'col-outcome col-technical', e.outcome || '—', 'enm-outcome-badge',
            { kind: outcomeKind(e.outcome) });
        var openFromRow = function () { self._openDrawer(idx); };
        tr.addEventListener('click', openFromRow);
        tr.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                openFromRow();
            }
        });
        // Newest first: insert at top of tbody.
        if (this._tbody.firstChild) {
            this._tbody.insertBefore(tr, this._tbody.firstChild);
        } else {
            this._tbody.appendChild(tr);
        }
        // 0.2.0-beta.3.8 — bump the row-count label in the foot so
        // the operator can see the total without scrolling. Same
        // i18n shape as _loadMore's count formatter.
        if (this._countLabel) {
            var t = root.enmTOrFallback;
            var fmtCount = (typeof window !== 'undefined' && window.enmFormatNumber)
                ? window.enmFormatNumber : function (n) { return String(n); };
            var n = this._rows.length;
            var rowsKeyId = n === 1 ? 'audit.row_count_one' : 'audit.row_count';
            var rowsKey = t(rowsKeyId, { n: fmtCount(n) });
            this._countLabel.textContent = (rowsKey && rowsKey !== rowsKeyId)
                ? rowsKey
                : fmtCount(n) + (n === 1 ? ' row' : ' rows');
        }
        // Empty-state should hide and table-wrap should show on
        // the first live row arrival.
        if (this._emptyMsg) { this._emptyMsg.hidden = (this._rows.length !== 0); }
        if (this._tableWrap) { this._tableWrap.hidden = (this._rows.length === 0); }
        // Brief highlight so the operator notices the new row.
        tr.classList.add('enm-audit-row-new');
        var hl = setTimeout(function () {
            if (self._destroyed) { return; }
            tr.classList.remove('enm-audit-row-new');
        }, 2400);
        // Stash so destroy() can clear if needed (best-effort; the
        // listener is cheap so we just rely on _destroyed guard).
        this._liveHlTimer = hl;
    };

    AuditTab.prototype._appendRow = function (e) {
        var self = this;
        var tr = document.createElement('tr');
        tr.dataset.tier = e.tier || '';
        // beta.3.49 — same CRITICAL-INFO hide as _renderLiveRow.
        if (e.tier === 'CRITICAL-INFO') {
            tr.classList.add('enm-audit-row-info-duplicate');
        }
        // a11y: row is keyboard-actionable. Enter opens the drawer.
        tr.setAttribute('tabindex', '0');
        tr.setAttribute('role', 'button');
        tr.setAttribute('aria-label',
            (e.ruleId || e.rule_id || '—') + ' · ' + (e.decision || ''));

        // beta.3.48 — friendly cells (default) + technical cells
        // (toggle-revealed). CSS hides whichever set isn't active.
        addCell(tr, 'col-when col-friendly',
            formatTsRelative(e.ts), formatTsLocal(e.ts));
        addCell(tr, 'col-what col-friendly',
            friendlyAction(e), e.decision || '');
        // beta.3.66 — friendly uses decision-first kind (see _renderRow above).
        addBadgeCell(tr, 'col-result col-friendly',
            friendlyResult(e), 'enm-outcome-badge',
            { kind: friendlyResultKind(e) });
        addCell(tr, 'col-ts col-technical',       formatTs(e.ts),                 formatTsLocal(e.ts));
        addCell(tr, 'col-chain col-technical',    e.chainId || e.chain_id || '—');
        addCell(tr, 'col-rule col-technical',     e.ruleId  || e.rule_id  || '—');
        addBadgeCell(tr, 'col-tier col-technical',
            friendlyTierLabel(e.tier), 'enm-tier-badge', { tier: e.tier });
        addCell(tr, 'col-decision col-technical', e.decision || '—');
        addCell(tr, 'col-executor col-technical',
            friendlyExecutor(e),
            e.executor || '');
        addBadgeCell(tr, 'col-outcome col-technical', e.outcome || '—', 'enm-outcome-badge',
            { kind: outcomeKind(e.outcome) });

        // Row-index lookup so Prev/Next walk siblings without DOM math.
        var idx = this._rows.length - 1;
        tr.dataset.idx = String(idx);

        var openFromRow = function () { self._openDrawer(idx); };
        tr.addEventListener('click', openFromRow);
        tr.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                openFromRow();
            }
        });

        this._tbody.appendChild(tr);
    };

    // ------------------------------------------------------------------
    // Drawer
    // ------------------------------------------------------------------

    /** @private */
    AuditTab.prototype._ensureDrawer = function () {
        if (this._drawer) { return; }
        var self = this;

        this._drawerScrim = el('div', 'enm-audit-drawer-scrim');
        this._drawerScrim.hidden = true;
        this._drawerScrim.addEventListener('click', function () { self._closeDrawer(); });
        this.root.appendChild(this._drawerScrim);

        // a11y: role=dialog + aria-modal + aria-labelledby points at
        // the rule-id title. Same canonical pattern as settings-drawer.
        var d = document.createElement('div');
        d.className = 'enm-audit-drawer';
        d.setAttribute('role', 'dialog');
        d.setAttribute('aria-modal', 'true');
        d.setAttribute('aria-labelledby', 'enm-audit-drawer-title');
        d.hidden = true;

        d.innerHTML =
            '<div class="enm-audit-drawer-head">'
              + '<div class="enm-audit-drawer-head-body">'
                + '<div class="enm-audit-drawer-tier"></div>'
                + '<div class="enm-audit-drawer-title-mono" id="enm-audit-drawer-title"></div>'
                + '<div class="enm-audit-drawer-ts"></div>'
              + '</div>'
              + '<button type="button" class="enm-icon-btn enm-audit-drawer-close" aria-label="Close">×</button>'
            + '</div>'
            + '<div class="enm-audit-drawer-body">'
              + '<div class="enm-drawer-decision"></div>'
              + '<div class="enm-drawer-kv"></div>'
              + '<div class="enm-drawer-payload-section">'
                + '<div class="enm-drawer-payload-head">'
                  + '<span class="enm-drawer-payload-title">Payload</span>'
                  + '<button type="button" class="enm-btn enm-btn-secondary enm-btn-sm enm-drawer-payload-copy">Copy</button>'
                + '</div>'
                + '<pre class="enm-drawer-payload"></pre>'
              + '</div>'
            + '</div>'
            + '<div class="enm-audit-drawer-foot">'
              + '<button type="button" class="enm-btn enm-btn-secondary enm-drawer-prev">← Prev</button>'
              + '<button type="button" class="enm-btn enm-btn-secondary enm-drawer-next">Next →</button>'
            + '</div>';

        d.querySelector('.enm-audit-drawer-close')
            .addEventListener('click', function () { self._closeDrawer(); });
        d.querySelector('.enm-drawer-prev')
            .addEventListener('click', function () { self._stepDrawer(-1); });
        d.querySelector('.enm-drawer-next')
            .addEventListener('click', function () { self._stepDrawer(+1); });
        d.querySelector('.enm-drawer-payload-copy')
            .addEventListener('click', function () { self._copyDrawerPayload(); });

        this._drawer = d;
        this.root.appendChild(d);
    };

    /** @private */
    AuditTab.prototype._openDrawer = function (idx) {
        if (idx < 0 || idx >= this._rows.length) { return; }
        this._ensureDrawer();
        var entry = this._rows[idx];
        var self = this;

        // Mark the row expanded; clear the previous one.
        if (this._drawerRowEl) {
            this._drawerRowEl.classList.remove('expanded');
        }
        var rowEl = this._tbody.querySelector('tr[data-idx="' + idx + '"]');
        if (rowEl) {
            rowEl.classList.add('expanded');
            this._drawerRowEl = rowEl;
        }
        this._drawerIdx = idx;

        // Populate.
        this._fillDrawer(entry);

        // Show.
        var firstOpen = !this._drawerOpen;
        this._drawerOpen = true;
        this._drawerScrim.hidden = false;
        this._drawer.hidden = false;

        if (firstOpen) {
            // a11y: remember focus origin so close returns there.
            this._previousFocus = document.activeElement;
            // Wire global listeners only on first open. Step navigation
            // doesn't need to re-register them.
            var closeBtn = this._drawer.querySelector('.enm-audit-drawer-close');
            // Defer focus to next frame so the transition has started.
            requestAnimationFrame(function () {
                if (closeBtn && typeof closeBtn.focus === 'function') {
                    closeBtn.focus();
                }
            });
            this._escHandler = function (ev) {
                if (ev.key === 'Escape') { self._closeDrawer(); }
            };
            document.addEventListener('keydown', this._escHandler);

            // Focus trap — Tab and Shift+Tab cycle within the drawer.
            // Same shape as settings-drawer (alpha.28.1 batch 65, alpha.29
            // batch 95): same selector for first-focus and trap-bounds;
            // re-anchor focus inside the drawer if it was pushed out.
            this._trapHandler = function (ev) {
                if (ev.key !== 'Tab' || !self._drawerOpen || !self._drawer) { return; }
                var focusables = self._drawer.querySelectorAll(
                    'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
                );
                if (focusables.length === 0) { return; }
                var firstEl = focusables[0];
                var lastEl  = focusables[focusables.length - 1];
                if (!self._drawer.contains(document.activeElement)) {
                    ev.preventDefault();
                    firstEl.focus();
                    return;
                }
                if (ev.shiftKey && document.activeElement === firstEl) {
                    ev.preventDefault();
                    lastEl.focus();
                } else if (!ev.shiftKey && document.activeElement === lastEl) {
                    ev.preventDefault();
                    firstEl.focus();
                }
            };
            document.addEventListener('keydown', this._trapHandler, true);
        }
    };

    /** @private */
    AuditTab.prototype._closeDrawer = function () {
        if (!this._drawerOpen) { return; }
        this._drawerOpen = false;
        if (this._drawerRowEl) {
            this._drawerRowEl.classList.remove('expanded');
            this._drawerRowEl = null;
        }
        this._teardownDrawerListeners();

        // a11y: restore focus to the element that opened the drawer.
        if (this._previousFocus && typeof this._previousFocus.focus === 'function') {
            try { this._previousFocus.focus(); } catch (_) { /* gone */ }
        }
        this._previousFocus = null;

        // Hide after a short delay so a CSS slide-out transition (if
        // any) can play. Matches the settings-drawer cadence.
        var self = this;
        if (this._drawerCloseTimer) { clearTimeout(this._drawerCloseTimer); }
        this._drawerCloseTimer = setTimeout(function () {
            self._drawerCloseTimer = null;
            if (!self._drawerOpen && self._drawer) {
                self._drawer.hidden = true;
            }
            if (!self._drawerOpen && self._drawerScrim) {
                self._drawerScrim.hidden = true;
            }
        }, DRAWER_CLOSE_MS);
    };

    /** @private */
    AuditTab.prototype._teardownDrawerListeners = function () {
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
        if (this._trapHandler) {
            document.removeEventListener('keydown', this._trapHandler, true);
            this._trapHandler = null;
        }
    };

    /** @private */
    AuditTab.prototype._stepDrawer = function (delta) {
        if (!this._drawerOpen || this._drawerIdx == null) { return; }
        var next = this._drawerIdx + delta;
        if (next < 0 || next >= this._rows.length) { return; }
        this._openDrawer(next);
    };

    /** @private */
    AuditTab.prototype._fillDrawer = function (e) {
        var d = this._drawer;
        if (!d || !e) { return; }
        var tier = e.tier || '';

        // Head — tier badge + rule id (mono) + ts.
        var tierWrap = d.querySelector('.enm-audit-drawer-tier');
        tierWrap.innerHTML = '';
        if (tier) {
            var badge = el('span', 'enm-tier-badge');
            badge.setAttribute('data-tier', tier);
            badge.textContent = tier;
            tierWrap.appendChild(badge);
        }
        var titleEl = d.querySelector('.enm-audit-drawer-title-mono');
        titleEl.textContent = e.ruleId || e.rule_id || '—';
        var tsEl = d.querySelector('.enm-audit-drawer-ts');
        tsEl.textContent = formatTs(e.ts) + (e.id ? ' · id=' + e.id : '');

        // Decision line — show decision verb + tier path.
        var dec = d.querySelector('.enm-drawer-decision');
        dec.innerHTML = '';
        var decisionPrefix = document.createElement('strong');
        decisionPrefix.textContent = 'Decision: ' + (e.decision || '—');
        dec.appendChild(decisionPrefix);
        if (tier) {
            dec.appendChild(document.createTextNode(' · ' + tier + ' path'));
        }

        // KV grid.
        var kv = d.querySelector('.enm-drawer-kv');
        kv.innerHTML = '';
        addKv(kv, 'Chain',    e.chainId || e.chain_id || '—');
        addKv(kv, 'Rule',     e.ruleId  || e.rule_id  || '—', true);
        addKv(kv, 'Executor', e.executor || '—', true);
        var dur = (e.durationMs != null ? e.durationMs : e.duration_ms);
        addKv(kv, 'Duration',
            (dur == null || dur === '') ? '—' : (formatMs(dur)),
            true);
        // Outcome chip in the KV grid for at-a-glance status, mirroring
        // the table cell.
        var outRow = document.createElement('div');
        outRow.className = 'enm-drawer-kv-row';
        var outKey = el('span', 'enm-drawer-kv-key');
        outKey.textContent = 'Outcome';
        var outValWrap = el('span', 'enm-drawer-kv-value');
        var outBadge = el('span', 'enm-outcome-badge');
        outBadge.setAttribute('data-kind', outcomeKind(e.outcome));
        outBadge.textContent = e.outcome || '—';
        outValWrap.appendChild(outBadge);
        outRow.appendChild(outKey);
        outRow.appendChild(outValWrap);
        kv.appendChild(outRow);

        // Payload pre.
        var pre = d.querySelector('.enm-drawer-payload');
        var payload = (e.payload != null) ? e.payload : {};
        var pretty;
        try { pretty = JSON.stringify(payload, null, 2); }
        catch (_) { pretty = String(payload); }
        // innerHTML is safe here: highlightPayloadJson escapes < > & inside
        // the JSON string and ONLY emits its own <span class="..."> wrappers.
        pre.innerHTML = highlightPayloadJson(pretty);

        // Cache the current payload pretty-print on the drawer for the
        // payload Copy button to read.
        this._currentPayloadText = pretty;

        // Prev/Next disabled states.
        var prevBtn = d.querySelector('.enm-drawer-prev');
        var nextBtn = d.querySelector('.enm-drawer-next');
        prevBtn.disabled = (this._drawerIdx <= 0);
        nextBtn.disabled = (this._drawerIdx >= this._rows.length - 1);
    };

    // ------------------------------------------------------------------
    // Copy
    // ------------------------------------------------------------------

    /**
     * @private
     * Fetch up to COPY_LIMIT rows matching current filters, serialize
     * them to TSV (tab-separated, header row + one row per entry), and
     * write the string to the clipboard via enmCopyToClipboard. This
     * replaces the alpha.27 JSON Blob download per the mock spec:
     * "Copy-to-clipboard everywhere replaces JSON Blob download".
     */
    AuditTab.prototype._copyTsv = function () {
        var self = this;
        var qs = this._currentFilterQs();
        qs += (qs ? '&' : '') + 'limit=' + COPY_LIMIT + '&offset=0';
        this.api.get('/audit?' + qs, { skipCache: true }).then(function (data) {
            // alpha.29 batch 95 — _destroyed guard preserved. Without
            // it, an operator who clicks Copy and immediately switches
            // tabs would have the clipboard mutated after they've
            // navigated away.
            if (self._destroyed) { return; }
            var entries = (data && data.entries) || [];
            var tsv = entriesToTsv(entries);

            var nf = self.notifications;
            var copyBtn = self._copyBtn;
            if (root.enmCopyToClipboard) {
                root.enmCopyToClipboard(tsv, {
                    btn: copyBtn,
                    copiedLabel: 'Copied!',
                    notifications: nf,
                    notifyOnSuccess: !copyBtn,
                    successTitle: 'Audit rows copied',
                    successBody: entries.length.toLocaleString() + ' row'
                        + (entries.length === 1 ? '' : 's') + ' copied to clipboard.',
                    failTitle: 'Copy unavailable',
                    failBody: 'Browser blocked clipboard access.',
                });
                return;
            }
            // Fallback path.
            if (typeof navigator !== 'undefined'
                && navigator.clipboard
                && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(tsv).then(function () {
                    if (nf) { nf.info('Audit rows copied', entries.length + ' rows copied to clipboard.'); }
                }, function () {
                    if (nf) { nf.warning('Copy unavailable', 'Browser blocked clipboard access.'); }
                });
            } else if (nf) {
                nf.warning('Copy unavailable', 'Browser blocked clipboard access.');
            }
        }).catch(function (err) {
            if (self._destroyed) { return; }
            // alpha.28.1 batch 52 — same 401 suppression as the load
            // path.
            if (err && err.status === 401) { return; }
            self.notifications.show({
                id: 'audit-copy-fail',
                severity: 'warning',
                title: 'Copy failed',
                body: err.message || String(err),
            });
        });
    };

    /** @private */
    AuditTab.prototype._copyDrawerPayload = function () {
        var text = this._currentPayloadText || '';
        var nf = this.notifications;
        var btnEl = this._drawer && this._drawer.querySelector('.enm-drawer-payload-copy');
        if (root.enmCopyToClipboard) {
            root.enmCopyToClipboard(text, {
                btn: btnEl,
                copiedLabel: 'Copied!',
                notifications: nf,
                notifyOnSuccess: !btnEl,
                successTitle: 'Payload copied',
                successBody: 'Audit row payload copied to clipboard.',
                failTitle: 'Copy unavailable',
                failBody: 'Browser blocked clipboard access.',
            });
            return;
        }
        if (typeof navigator !== 'undefined'
            && navigator.clipboard
            && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                if (nf) { nf.info('Payload copied', ''); }
            }, function () {
                if (nf) { nf.warning('Copy unavailable', 'Browser blocked clipboard access.'); }
            });
        } else if (nf) {
            nf.warning('Copy unavailable', 'Browser blocked clipboard access.');
        }
    };

    // ------------------------------------------------------------------
    // Helpers — kept module-local because they're audit-specific
    // ------------------------------------------------------------------

    /**
     * Map a free-text outcome string to one of four data-kind values
     * the .enm-outcome-badge[data-kind] palette supports. Heuristic
     * order matters: 'skip' check first because 'no-owner-skip' would
     * otherwise match 'no-owner' alone. Failure check covers 'failure'
     * / 'failed' / 'error' / 'Unknown action'.
     */
    function outcomeKind(outcome) {
        if (outcome == null) { return 'warn'; }
        var s = String(outcome).toLowerCase();
        if (s === 'success' || s === 'acknowledged' || s === 'restarted') { return 'success'; }
        if (s.indexOf('skip') !== -1 || s.indexOf('no-owner') !== -1) { return 'skip'; }
        if (s === 'failure' || s.indexOf('fail') !== -1 || s.indexOf('error') !== -1
            || s.indexOf('unknown action') !== -1) { return 'error'; }
        // beta.3.47 — HTTP-shaped outcomes from EnmAuditMiddleware are
        // "<status> <text>". Map status-code prefix to kind:
        //   2xx → success, 4xx/5xx → error, else warn.
        if (/^2\d\d/.test(s)) { return 'success'; }
        if (/^[45]\d\d/.test(s)) { return 'error'; }
        return 'warn';
    }

    // beta.3.66 — decision-first kind. Used by the FRIENDLY result badge
    // so descriptive outcome strings like "Auto-started mainchain on ENM
    // boot" don't fall through to outcomeKind's 'warn' default (which
    // rendered as the alarming orange "!" Notified badge). Decision is
    // structured data so this mapping is unambiguous. Pre-3.66 the badge
    // icon/colour came from outcomeKind alone — every routine boot event
    // turned into a red "Notified" alert in the Activity tab.
    function friendlyResultKind(e) {
        var d = String(e.decision || '');
        if (d === 'executed' || d === 'success' || d === 'approved'
            || d === 'auto-resolved') {
            return 'success';
        }
        if (d === 'failed') { return 'error'; }
        if (d === 'rejected' || d === 'expired') { return 'skip'; }
        if (d === 'proposed') { return 'warn'; } // ONLY pending OWNER-CONFIRMS
        return outcomeKind(e.outcome); // unknown decision — fall back to legacy
    }

    /**
     * UTC ISO timestamp via the shared enmFormatDate helper (alpha.28.1
     * batch 35). Falls back to a manual toISOString rewrite if the
     * helper is missing (unit tests, older bundles).
     */
    function formatTs(ms) {
        return (typeof window !== 'undefined' && window.enmFormatDate)
            ? window.enmFormatDate(ms, { mode: 'iso' })
            : (ms ? new Date(ms).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC') : '—');
    }
    function formatTsLocal(ms) {
        if (!ms) return '';
        return (typeof window !== 'undefined' && window.enmFormatDate)
            ? window.enmFormatDate(ms, { mode: 'local' })
            : new Date(ms).toLocaleString();
    }

    // beta.3.48 — relative-time format for the friendly "When" column.
    // "Just now" / "5 min ago" / "Today 14:30" / "2 days ago" / explicit
    // date for anything older than ~30 days. Tooltip carries the
    // absolute UTC ISO so power users still see exact timing on hover.
    function formatTsRelative(ms) {
        if (!ms) { return '—'; }
        var now = Date.now();
        var dt = now - ms;
        if (dt < 0) { dt = 0; }
        var sec = Math.floor(dt / 1000);
        if (sec < 30)       { return 'Just now'; }
        if (sec < 60)       { return sec + 's ago'; }
        var min = Math.floor(sec / 60);
        if (min < 60)       { return min + ' min ago'; }
        var d = new Date(ms);
        var nowD = new Date();
        function _hhmm(date) {
            return ('' + date.getHours()).padStart(2, '0')
                + ':' + ('' + date.getMinutes()).padStart(2, '0');
        }
        var sameDay = d.getDate() === nowD.getDate()
            && d.getMonth() === nowD.getMonth()
            && d.getFullYear() === nowD.getFullYear();
        if (sameDay) {
            return 'Today ' + _hhmm(d);
        }
        // beta.3.49 — distinct "Yesterday HH:MM" label so the >24h
        // bucket doesn't get the awkward "0d ago" / "1d ago" wording
        // for events that happened just a few hours ago but past
        // local midnight.
        var yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (d.getDate() === yesterday.getDate()
            && d.getMonth() === yesterday.getMonth()
            && d.getFullYear() === yesterday.getFullYear()) {
            return 'Yesterday ' + _hhmm(d);
        }
        var hr = Math.floor(min / 60);
        var days = Math.floor(hr / 24);
        // Defensive: anything sub-24h on a different calendar day
        // already returned above. Treat a stray days===0 as Today.
        if (days < 1) { return 'Today ' + _hhmm(d); }
        if (days < 30) { return days + 'd ago'; }
        return formatTs(ms);  // older than 30 days — show full timestamp
    }

    // beta.3.48 — translate internal rule codes / HTTP routes into
    // operator-readable action labels for the friendly "What happened"
    // column. Unknown keys fall through to the raw rule/decision so
    // power users still see something meaningful.
    var RULE_FRIENDLY = {
        // Healing-engine rule codes. These are the F-numbers operators
        // see in the audit log when an automated rule fires.
        //
        // beta.3.66 — labels rewritten to match HealthRules RULE_METADATA.
        // The pre-3.66 set had wildly wrong labels (F2 = "Re-attached to
        // running ela" was actually the worst — F2 is "RPC unreachable
        // restart", not reattach; the operator saw mass "Re-attached"
        // events thinking the chain kept reconnecting when it was actually
        // restarting because RPC was unresponsive).
        'F1':  'Auto-restarted (process exited)',
        'F2':  'Restarted (RPC unresponsive)',
        'F3':  'Restarted (no peers)',
        'F4':  'Restart proposed (sync stalled)',
        'F5':  'Disk space low',
        'F6':  'OOM-killed (memory pressure)',
        // 0.5.20 audit Session 20 — F7/F8 swapped to match HealthRules
        // detect-function reality. detectF7 implements port conflict on
        // start; detectF8 implements binary version drift (with the
        // 1-hour binaryInstalledAt grace from v0.5.0). Pre-0.5.20 these
        // friendly labels were inherited from outdated RULE_METADATA
        // and gave operators wrong audit-row explanations.
        'F7':  'Port conflict on start',
        'F8':  'Binary version differs from install',
        'F9':  'Config file changed on disk',
        'F10': 'RPC password not set',
        'F11': 'BPoS arbiter rotation stuck',
        'F12': 'Producer missing rounds (Inactive risk)',
        'F13': 'Clock skew detected',
        'F16': 'Recovered from peer-zero',
        // 0.5.16 audit Session 16 — dropped "(BPoS)" parenthetical.
        // F18 fires on non-BPoS nodes too (OWNER-CONFIRMS / INFO severity
        // per the beta.3.27 fix in HealthRules.detectF18) — the marker was
        // misleading Council and follower operators who saw the row and
        // assumed it didn't apply to them. Severity is signalled by the
        // tier badge; the friendly label stays neutral.
        'F18': 'No inbound peers',
        'F19': 'Host port conflict',
        'F22': 'DPoS state desync detected',
        // beta.3.66 — missing label. AUTOSTART is the AUTOMATED-SAFE rule
        // fired by EnmAutoStart at ENM boot when an enabled chain isn't
        // running. Previously displayed as the raw string "AUTOSTART".
        'AUTOSTART': 'Auto-started chain on boot',
        // HTTP routes (normalised by the audit middleware). New
        // routes added in beta.3.33+ for maintenance and beta.3.43+
        // for identity.
        'POST /chains/:chainId/start':          'Started chain',
        'POST /chains/:chainId/stop':           'Stopped chain',
        'POST /chains/:chainId/restart':        'Restarted chain',
        'POST /chains/:chainId/bootstrap':      'Started bootstrap',
        'DELETE /chains/:chainId/bootstrap':    'Cancelled bootstrap',
        'POST /chains/:chainId/bpos/activate':  'Activated BPoS producer',
        'PUT /config/general':              'Updated general settings',
        'PUT /config/mainchain':            'Updated mainchain settings',
        'PUT /config/network':              'Updated network settings',
        'PUT /config/notifications':        'Updated alert thresholds',
        'PUT /config/storage':              'Updated storage settings',
        'POST /config/anti-snipe-password': 'Updated anti-snipe password',
        'POST /config/rollback':            'Rolled back config',
        'POST /maintenance/update':         'Started ENM update',
        'POST /maintenance/chain-resync':   'Started chain resync',
        'POST /maintenance/reset-everything': 'Started full ENM reset',
        // v0.5.232 — these three endpoints were retired and now return
        // 410 Gone, but the friendly-name mappings stay so historical
        // audit rows from before v0.5.232 (and any 410 rejection rows
        // written by the retired-endpoint handlers themselves) still
        // render with operator-meaningful copy. Remove after the audit
        // retention window has rolled over (~12 months).
        'POST /maintenance/uninstall':      'Started app uninstall (retired)',
        'POST /maintenance/nuke':           'Started nuclear wipe (retired)',
        'POST /identity/unlock':            'Unlocked keystore',
        'POST /identity/import':            'Imported keystore',
        'POST /identity/reset':             'Reset keystore (retired)',
        'POST /identity/integrity/rebaseline': 'Re-baselined integrity',
        // Setup-wizard transitions (alpha era — kept for older rows).
        'POST /setup/install/:chainId':     'Installed binary',
        'POST /setup/binary':               'Confirmed binary',
        'POST /setup/bootstrap':            'Chose bootstrap path',
        'POST /setup/keystore':             'Generated keystore',
        'POST /setup/network':              'Configured network',
        'POST /setup/complete':             'Finished setup',
        // beta.3.49 — extra routes the audit middleware records when
        // operators (or smoke tests) hit them. POST /maintenance/status
        // is the "wrong-method" canonical example (status is a GET-only
        // resource); show it as a route probe rather than the raw
        // path string.
        'POST /maintenance/status':         'Probed maintenance state',
        'GET /maintenance/status':          'Checked maintenance state',
        'POST /healing/confirm/:id': 'Approved healing proposal',
        'POST /healing/reject/:id':  'Rejected healing proposal',
    };
    function friendlyAction(e) {
        var rule = e.ruleId || e.rule_id;
        // Healing confirm/reject are recorded with a concrete proposal id
        // (the audit middleware normalizes only /chains/:chainId), so collapse
        // the id segment to the route shape used by the RULE_FRIENDLY keys.
        if (rule) { rule = String(rule).replace(/\/healing\/(confirm|reject)\/[^/]+/, '/healing/$1/:id'); }
        if (rule && Object.prototype.hasOwnProperty.call(RULE_FRIENDLY, rule)) {
            return RULE_FRIENDLY[rule];
        }
        // beta.3.49 — older rows (pre-3.47 middleware shape) had
        // ruleId=null + outcome="success". Surfacing "success" as the
        // action label is useless. Skip those status-only outcomes
        // and fall back to a tier-based generic label so the column
        // still reads sensibly while old rows roll off via retention.
        var outStr = e.outcome ? String(e.outcome) : '';
        var isJustStatus = /^(success|failure|failed|ok|done)$/i.test(outStr.trim());
        if (!rule && e.outcome && !isJustStatus) {
            return _sanitizeOutcomeText(outStr);
        }
        if (rule) { return rule; }
        if (e.tier === 'AUTOMATED-SAFE')  { return 'Automated maintenance'; }
        if (e.tier === 'CRITICAL-NOTIFY') { return 'Alert raised'; }
        if (e.tier === 'OWNER-CONFIRMS')  { return 'Healing proposal'; }
        if (e.tier === 'HTTP-MUTATION')   { return 'Setting change'; }
        return 'Activity recorded';
    }

    // beta.3.49 — strip technical detail (absolute paths, raw command
    // strings, stack traces) from descriptive outcome text so the
    // friendly column doesn't dump implementation specifics. The
    // technical Outcome column still shows the raw text verbatim.
    function _sanitizeOutcomeText(s) {
        var v = String(s);
        v = v.replace(/Command failed:.*$/, '').trim();
        v = v.replace(/\/var\/lib\/pc2\/data\/extensions\/elastos-node-manager\/\S+/g, '<ela-cli>');
        v = v.replace(/\s*stderr:.*$/, '').trim();
        v = v.replace(/:\s*ela-cli wallet account failed:?\s*$/, '').trim();
        if (/password wrong|open wallet failed|Password incorrect/i.test(v)) {
            return v.split(':')[0].trim() + ' (password incorrect)';
        }
        if (v.length > 140) { v = v.slice(0, 137) + '…'; }
        return v;
    }

    // Map tier codes to short friendly chip labels for both the table
    // tier column and the filter chips. Falls back to the raw code for
    // unknown tiers.
    var TIER_FRIENDLY_KEYS = {
        'AUTOMATED-SAFE':  'tier_label_AUTOMATED_SAFE',
        'OWNER-CONFIRMS':  'tier_label_OWNER_CONFIRMS',
        'CRITICAL-NOTIFY': 'tier_label_CRITICAL_NOTIFY',
        'NEVER-AUTOMATIC': 'tier_label_NEVER_AUTOMATIC',
        'HTTP-MUTATION':   'tier_label_HTTP_MUTATION',
        'CRITICAL-INFO':   'tier_label_CRITICAL_INFO',
    };
    function friendlyTierLabel(tier) {
        if (!tier) { return '—'; }
        var key = TIER_FRIENDLY_KEYS[tier];
        if (!key) { return tier; }
        var t = root.enmTOrFallback;
        var v = t('audit.' + key);
        // enmTOrFallback returns [audit.x] for missing keys; if that
        // happens (older strings.js), use the raw code as fallback.
        if (v && v.charAt(0) === '[') { return tier; }
        return v;
    }

    // Friendly outcome label — coarse "Done / Failed / Skipped /
    // Notified" based on outcomeKind(). Used in the friendly Result
    // column; the technical Outcome column still shows the raw
    // "200 OK" / "412 Precondition Required" / etc.
    // beta.3.66 — friendlyResult now keys off the structured `decision`
    // field (always one of executed/failed/proposed/auto-resolved/etc.)
    // instead of pattern-matching the outcome STRING. Pre-3.66 the
    // outcome-string fallback returned 'warn' → "Notified" for any
    // descriptive outcome it couldn't match against the success/error/
    // 2xx/4xx patterns. That made AUTOSTART success rows (outcome =
    // "Auto-started mainchain on ENM boot") show as "Notified" — an
    // alarming red badge for a routine boot event. Operator saw their
    // Activity tab fill with red Notified marks for normal operation
    // and reasonably thought the app was broken.
    //
    // Decision-first mapping is unambiguous: executed = Done, failed =
    // Failed, proposed (still pending) = Awaits you, auto-resolved =
    // Auto-resolved (resolved silently, no action needed).
    function friendlyResult(e) {
        var t = root.enmTOrFallback;
        var d = String(e.decision || '');
        // Structured decisions first — these are the authoritative source.
        if (d === 'executed' || d === 'success' || d === 'approved') {
            var done = t('audit.outcome_friendly_done');
            return (done && done.charAt(0) === '[') ? 'Done' : done;
        }
        if (d === 'failed') {
            var fail = t('audit.outcome_friendly_failed');
            return (fail && fail.charAt(0) === '[') ? 'Failed' : fail;
        }
        if (d === 'auto-resolved') {
            // Cleared without needing operator action.
            var ar = t('audit.outcome_friendly_auto_resolved');
            return (ar && ar.charAt(0) === '[') ? 'Auto-resolved' : ar;
        }
        if (d === 'proposed') {
            // OWNER-CONFIRMS proposal still awaiting operator confirm.
            // ONLY THIS PATH shows the "needs attention" badge — pending
            // proposals are the only case where the operator actually
            // has to do something.
            var pending = t('audit.outcome_friendly_pending');
            return (pending && pending.charAt(0) === '[') ? 'Awaits you' : pending;
        }
        if (d === 'rejected') {
            var rej = t('audit.outcome_friendly_rejected');
            return (rej && rej.charAt(0) === '[') ? 'Rejected' : rej;
        }
        if (d === 'expired') {
            var exp = t('audit.outcome_friendly_expired');
            return (exp && exp.charAt(0) === '[') ? 'Expired' : exp;
        }
        // Fall back to old outcome-string parsing only for legacy rows
        // with unknown decisions.
        var k = outcomeKind(e.outcome);
        var key = k === 'success' ? 'audit.outcome_friendly_done'
                : k === 'error'   ? 'audit.outcome_friendly_failed'
                : k === 'skip'    ? 'audit.outcome_friendly_skipped'
                :                   'audit.outcome_friendly_done'; // changed from 'noted'
        var v = t(key);
        return (v && v.charAt(0) === '[') ? '—' : v;
    }

    // beta.3.52 — Resolve a friendly "Who" label for the executor column.
    // ENM is decoupled from the PC2 wallet identity, so the executor is
    // always one of:
    //   - 'operator' → "Operator" (a human-initiated owner action)
    //   - 'system'   → "System"   (ENM did it autonomously: autostart, F1, etc.)
    //   - 'F1'/'F2'/.../'AUTOSTART' → the rule name (specific healing rule)
    // Legacy rows from pre-3.52 carry an EVM-shaped hex address in the
    // executor field — we map any non-system, non-rule value to "Operator"
    // so the PC2 wallet never leaks into the visible label.
    function friendlyExecutor(e /* , _legacyOwnerWallet */) {
        var w = e.executor || e.wallet_address || null;
        var t = root.enmTOrFallback;
        if (!w) { return t('audit.executor_system'); }
        var s = String(w);
        if (s === 'system') { return t('audit.executor_system'); }
        if (s === 'operator') { return t('audit.executor_operator'); }
        // Specific healing rule names (Fnn, AUTOSTART, etc.) — show as-is.
        if (/^[A-Z][A-Z0-9_-]{1,32}$/.test(s)) { return s; }
        // Legacy EVM hex or unknown value: collapse to generic operator label.
        return t('audit.executor_operator');
    }

    // beta.3.52 — getCurrentOperatorWallet() was removed. The PC2 wallet
    // is no longer surfaced anywhere in ENM's UI; the audit executor
    // column reads from the row's role label ('operator' / 'system' /
    // rule name) which friendlyExecutor() resolves directly.

    /** Grouped ms display so a 2847 reads as "2,847 ms" in the drawer. */
    function formatMs(n) {
        var fmt = (typeof window !== 'undefined' && window.enmFormatNumber)
            ? window.enmFormatNumber
            : function (v) { return String(v); };
        return fmt(n) + ' ms';
    }

    function shortenWallet(s) {
        if (!s) return '—';
        if (s === 'system') return 'system';
        if (s.length > 12) return s.slice(0, 6) + '…' + s.slice(-4);
        return s;
    }

    /** addCell(tr, colClass, text, fullTextForTitle?) */
    function addCell(tr, colClass, text, fullText) {
        var td = document.createElement('td');
        td.className = colClass;
        td.textContent = text;
        // a11y: cells truncate with text-overflow:ellipsis on narrow
        // widths. Mirror the full text into title= so hover + screen
        // readers + copy-paste keep working when visibly clipped.
        var titleSource = (fullText != null && fullText !== '')
            ? fullText
            : (text == null ? '' : text);
        td.title = String(titleSource);
        tr.appendChild(td);
    }

    /** Emit a styled badge inside a td. */
    function addBadgeCell(tr, colClass, text, badgeClass, dataAttrs) {
        var td = document.createElement('td');
        td.className = colClass;
        var span = document.createElement('span');
        span.className = badgeClass;
        span.textContent = (text == null) ? '—' : String(text);
        if (dataAttrs) {
            Object.keys(dataAttrs).forEach(function (k) {
                if (dataAttrs[k] != null) {
                    span.setAttribute('data-' + k, String(dataAttrs[k]));
                }
            });
        }
        td.appendChild(span);
        td.title = (text == null) ? '' : String(text);
        tr.appendChild(td);
    }

    /** Emit a drawer KV row. */
    function addKv(parent, key, value, mono) {
        var row = document.createElement('div');
        row.className = 'enm-drawer-kv-row';
        var k = el('span', 'enm-drawer-kv-key');
        k.textContent = key;
        var v = el('span', 'enm-drawer-kv-value' + (mono ? ' mono' : ''));
        v.textContent = (value == null) ? '—' : String(value);
        row.appendChild(k);
        row.appendChild(v);
        parent.appendChild(row);
    }

    /**
     * Convert audit entries to TSV. Header row first, one row per
     * entry. Fields are tab-separated; embedded tabs/newlines in
     * payload-like values are flattened to spaces so a paste into a
     * ticket / spreadsheet stays one-row-per-entry.
     */
    function entriesToTsv(entries) {
        var headers = ['timestamp', 'chain', 'rule', 'tier', 'decision', 'executor', 'outcome', 'durationMs', 'payload'];
        var lines = [headers.join('\t')];
        entries.forEach(function (e) {
            var payload;
            try { payload = JSON.stringify(e.payload != null ? e.payload : null); }
            catch (_) { payload = ''; }
            var row = [
                formatTs(e.ts),
                e.chainId || e.chain_id || '',
                e.ruleId  || e.rule_id  || '',
                e.tier    || '',
                e.decision || '',
                e.executor || '',
                e.outcome  || '',
                (e.durationMs != null ? e.durationMs : (e.duration_ms != null ? e.duration_ms : '')),
                payload || '',
            ];
            lines.push(row.map(flattenForTsv).join('\t'));
        });
        return lines.join('\n');
    }
    function flattenForTsv(v) {
        if (v == null) return '';
        return String(v).replace(/[\t\r\n]+/g, ' ');
    }

    /**
     * Lightweight JSON syntax highlighter. Operates over a JSON string
     * already pretty-printed by JSON.stringify. Escapes &, <, > first
     * so the output is safe to drop into innerHTML, then wraps tokens
     * in <span class="k|s|n|b">. The regex captures (in order):
     *   - quoted strings, optionally followed by ":" → key vs string
     *   - the literals true / false / null → booleans
     *   - integer/float numbers → numbers
     *
     * Key-string match strips the trailing colon out of the span and
     * appends it raw, matching the mock's exact shape
     * (`<span class="k">"action"</span>: <span class="s">"…"</span>`).
     */
    function highlightPayloadJson(json) {
        if (json == null) return '';
        var escaped = String(json)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        return escaped.replace(
            /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
            function (match) {
                if (/^"/.test(match)) {
                    var colonMatch = match.match(/^("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?$/);
                    if (colonMatch && colonMatch[2]) {
                        return '<span class="k">' + colonMatch[1] + '</span>' + colonMatch[2];
                    }
                    return '<span class="s">' + match + '</span>';
                }
                if (/^(?:true|false|null)$/.test(match)) {
                    return '<span class="b">' + match + '</span>';
                }
                return '<span class="n">' + match + '</span>';
            }
        );
    }

    function el(tag, cls) {
        var node = document.createElement(tag);
        if (cls) { node.className = cls; }
        return node;
    }

    function btn(text, cls, onClick) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'enm-btn ' + cls;
        b.textContent = text;
        b.addEventListener('click', onClick);
        return b;
    }

    /**
     * Chip button — a <button type="button"> so keyboard activation,
     * focus ring, and screen-reader semantics come for free. aria-pressed
     * reflects the active state per WAI-ARIA toggle-button pattern.
     */
    function chipBtn(label, active) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'enm-filter-chip' + (active ? ' active' : '');
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
        b.textContent = label;
        return b;
    }

    root.EnmAuditTab = AuditTab;
}(typeof window !== 'undefined' ? window : globalThis));
