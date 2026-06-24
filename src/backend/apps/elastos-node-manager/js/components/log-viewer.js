/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/log-viewer.js — terminal-style log panel with tail-follow.
 *
 * Beta 3 rewrite: emits the phase-05 DOM shape (`.enm-log-viewer >
 * .enm-log-toolbar + .enm-log-meta + .enm-log-scroller`). The
 * data/lifecycle substrate is preserved verbatim from alpha.28.1:
 *   - SSE subscribe on `chains:<chainId>:logs` (payload `{chainId,
 *     lines:[{stream, line, ts}]}` from ProcessLogStreamer).
 *   - Initial-tail seed via GET /logs/:id/tail?n=200, with the queued
 *     SSE-before-tail batch ordering buffer (Round-11 audit, batch 41).
 *   - 5000-line DOM cap with Range.deleteContents head-trim (Round-34
 *     audit, batch 107).
 *   - _destroyed lifecycle flag short-circuits every .then / SSE
 *     callback (Round-18 audit, batch 64).
 *   - Visibility-pause wrapper around the SSE handler (Round-16 audit).
 *   - role="log" + aria-relevant="additions"; aria-live="polite" was
 *     intentionally dropped in alpha.28.1 batch 24 because pairing it
 *     with role="log" forced screen readers to announce every batch
 *     (up to 500 lines/sec) — the role alone suffices. The new sticky
 *     cap banner gets its own role="status" when it un-hides.
 *
 * New for Beta 3:
 *   - Free-text search with `/regex/flags` form, debounced 200ms.
 *     Wraps matches in `.hl` spans. Updates the meta-match counter.
 *   - Inline level highlights: scan for `\b(INFO|DEBG|DEBUG|WARN|
 *     WARNING|ERROR|ERR)\b` and wrap with `.lvl-*` spans.
 *   - Stream label mapped to 3-letter code in `.enm-log-stream`
 *     (OUT/ERR/FILE/LOG); the data-stream attribute drives the
 *     colour via CSS.
 *   - Copy = clipboard write of the currently-visible (post-filter)
 *     lines. Uses root.enmCopyToClipboard if available so the
 *     "Copied!" feedback and notifications fall-through stay
 *     consistent with the rest of the app.
 *
 * v0.1 — no virtual scrolling yet; the 5000-line DOM cap keeps the
 * scroller smooth enough on baseline hardware. Full virtualization
 * waits until operators actually hit a bottleneck.
 */

(function (root) {
    'use strict';

    var MAX_DOM_LINES = 5000;
    var INITIAL_TAIL_N = 200;
    var SEARCH_DEBOUNCE_MS = 200;

    // Pre-compiled lvl-keyword regex. Word-bounded so "INFORMATION"
    // doesn't match "INFO" mid-word; case-insensitive because some
    // log writers emit lowercase. The capture group preserves the
    // exact spelling for display so an "ERR" stays "ERR" and an
    // "ERROR" stays "ERROR".
    // 0.2.0-beta.3.4 — ela emits 3-letter codes [INF]/[WRN]/[ERR]/[DBG]/[STAT]
    // post-ANSI-strip (see ANSI_REGEX below). The old regex only handled
    // the long forms (INFO/WARN/ERROR/DEBUG) so the operator's WRN lines
    // never got coloured. Add the 3-letter forms.
    var LVL_REGEX = /\b(INFO|INF|DEBG|DEBUG|DBG|WARN|WARNING|WRN|ERROR|ERR|STAT)\b/gi;
    var LVL_CLASS = {
        INFO: 'lvl-info',
        INF:  'lvl-info',
        STAT: 'lvl-info',
        DEBG: 'lvl-debug',
        DEBUG: 'lvl-debug',
        DBG:  'lvl-debug',
        WARN: 'lvl-warn',
        WARNING: 'lvl-warn',
        WRN:  'lvl-warn',
        ERROR: 'lvl-error',
        ERR:  'lvl-error',
    };

    var STREAM_LABEL = {
        stdout: 'OUT',
        stderr: 'ERR',
        // 0.2.0-beta.3.4 — was 'FILE' (4 chars), overflowed the 16px
        // grid cell. Phase-05 mock spec uses 3-char labels: out / err /
        // fil. CSS text-transform: uppercase visualizes as FIL.
        file:   'FIL',
    };

    // 0.2.0-beta.3.4 — ela writes its log file with ANSI colour escape
    // codes (e.g. `\x1b[1;33m[WRN]\x1b[m`). The browser drops the ESC
    // chars but renders the rest as visible noise (`[1;33m[WRN][m`).
    // Strip the whole CSI sequence before escapeHtml so the lvl regex
    // can match the bare `[WRN]` and the operator sees clean text.
    var ANSI_REGEX = /\x1b\[[0-9;]*[A-Za-z]/g;

    // batch 71 carry-over — guards against malformed truthy `ts`
    // values (Invalid Date → NaN:NaN:NaN in the timestamp before this
    // probe). `|| Date.now()` alone only catches falsy values.
    function safeDate(raw) {
        if (raw == null) { return new Date(); }
        var n = (typeof raw === 'number') ? raw : Date.parse(raw);
        if (!isFinite(n)) { return new Date(); }
        var d = new Date(n);
        if (isNaN(d.getTime())) { return new Date(); }
        return d;
    }

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function formatTimestamp(ts) {
        var d = safeDate(ts);
        return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    }

    function streamLabel(stream) {
        return STREAM_LABEL[stream] || 'LOG';
    }

    /**
     * beta.3.17 — signature used to collapse adjacent identical log
     * lines (journalctl `--no-pager` style). Strips the leading
     * "YYYY/MM/DD HH:MM:SS.ffffff" timestamp the ela writer prepends
     * so two errors emitted milliseconds apart still collide. Returns
     * the level-tagged body so [ERR] foo and [INFO] foo never
     * collapse together.
     *
     * Example flood that collapses to ONE line + a "× 47" chip:
     *   2026/05/14 22:49:06.974207 [ERR] v2 accumulateReward Sponsor not exist 0333...
     *   2026/05/14 22:49:06.977316 [ERR] v2 accumulateReward Sponsor not exist 0333...
     *   2026/05/14 22:49:06.980410 [ERR] v2 accumulateReward Sponsor not exist 0333...
     *
     * The non-timestamp portion has to match exactly — even a single
     * differing digit (e.g. block heights in [SYNC] new block received
     * height=N) defeats collapse on purpose, because those events ARE
     * meaningfully different despite looking similar.
     */
    var TS_PREFIX_REGEX = /^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?\s+/;
    function logSignature(raw, lvl) {
        if (typeof raw !== 'string') { return ''; }
        var body = raw.replace(TS_PREFIX_REGEX, '');
        return (lvl || 'info') + '|' + body;
    }

    // HTML-escape because we build innerHTML for the lvl + hl
    // highlight spans below. textContent isn't an option once we
    // need to overlay class spans on substrings.
    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Wrap every LVL_REGEX match in a `.lvl-*` span. Returns HTML —
     * caller MUST have already escaped the raw text.
     *
     * @param {string} escapedText
     * @returns {string}
     */
    function applyLvlHighlights(escapedText) {
        // Reset lastIndex defensively (global regex carries state).
        LVL_REGEX.lastIndex = 0;
        return escapedText.replace(LVL_REGEX, function (m) {
            var cls = LVL_CLASS[m.toUpperCase()] || 'lvl-info';
            return '<span class="' + cls + '">' + m + '</span>';
        });
    }

    /**
     * Wrap matches of `pattern` in `.hl` spans. Operates on the
     * lvl-decorated HTML by splitting on tag boundaries so we never
     * insert `.hl` spans inside an existing `.lvl-*` span's opening
     * tag (which would produce malformed nested HTML like
     * `<span class="<span class="hl">lvl-info</span>">`).
     *
     * @param {string} html  output of applyLvlHighlights
     * @param {RegExp|null} regex  null/undefined disables highlighting
     * @returns {{html: string, matched: boolean}}
     */
    function applySearchHighlights(html, regex) {
        if (!regex) {
            return { html: html, matched: false };
        }
        // Split on the existing `<span ...>` and `</span>` markers so
        // we only highlight inside text nodes. The split keeps the
        // delimiters (capture group) so we can re-emit them unchanged.
        var parts = html.split(/(<[^>]+>)/g);
        var matched = false;
        for (var i = 0; i < parts.length; i += 1) {
            var p = parts[i];
            if (p.charAt(0) === '<') { continue; } // tag — leave alone
            regex.lastIndex = 0;
            var next = p.replace(regex, function (m) {
                matched = true;
                return '<span class="hl">' + m + '</span>';
            });
            parts[i] = next;
        }
        return { html: parts.join(''), matched: matched };
    }

    /**
     * Parse the search input into a usable RegExp.
     *
     *   "/error/i"  → /error/i
     *   "/abc/"     → /abc/
     *   "block"     → /block/i (case-insensitive substring)
     *   ""          → null  (no filter)
     *
     * Malformed regex (e.g. an unterminated character class) falls
     * back to a literal substring search so the operator never sees a
     * broken filter input — the box "just works" with whatever they
     * type.
     *
     * @param {string} raw
     * @returns {{pattern: string, isRegex: boolean, regex: RegExp|null}}
     */
    function parseSearchPattern(raw) {
        var s = (raw == null) ? '' : String(raw);
        if (s.length === 0) {
            return { pattern: '', isRegex: false, regex: null };
        }
        // `/pattern/flags` form: at least 2 slashes, ≥1 char between.
        var slashed = /^\/(.+)\/([gimsuy]*)$/.exec(s);
        if (slashed) {
            try {
                // Force 'g' so .replace highlights every match; merge
                // with caller-supplied flags (deduped).
                var flags = slashed[2];
                if (flags.indexOf('g') === -1) { flags += 'g'; }
                return {
                    pattern: slashed[1],
                    isRegex: true,
                    regex: new RegExp(slashed[1], flags),
                };
            } catch (e) {
                // Malformed regex → degrade to literal substring of
                // the whole raw string (incl. slashes). Operator sees
                // their text highlighted; no error toast for a
                // mid-type half-typed regex.
            }
        }
        // Literal substring (case-insensitive). Escape regex
        // metacharacters so "1.2.3" doesn't match "1x2y3".
        var literal = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return {
            pattern: s,
            isRegex: false,
            regex: new RegExp(literal, 'gi'),
        };
    }

    /** v0.5.237 — friendly chain name for the in-pane picker; falls back to
     * the raw id when strings.js hasn't loaded or the key is missing. */
    function _logChainName(id) {
        var t = root.enmTOrFallback;
        if (typeof t === 'function') {
            var v = t('chain_name.' + id);
            if (v && v !== ('chain_name.' + id) && v !== ('[chain_name.' + id + ']')) { return v; }
        }
        return id;
    }

    function LogViewer(opts) {
        if (!opts || !opts.api) {
            throw new TypeError('LogViewer: { api, chainId } required');
        }
        this.api = opts.api;
        this.sse = opts.sse || null;        // optional — graceful degrade
        this.notifications = opts.notifications || null;
        // v0.5.237 — Logs is reachable from the overview now (tabs always
        // visible), where the router's active chain is 'all'. Normalize that
        // (and any falsy / aggregate value) to a real chain; the in-pane chain
        // picker lets the operator switch from here. Default: mainchain.
        var _cid = opts.chainId || 'mainchain';
        this.chainId = (_cid === 'all') ? 'mainchain' : _cid;
        // Installed chains for the in-pane picker; populated by _loadChainList.
        this._availableChains = null;
        this._chainSelect = null;

        this._lines = []; // { stream, line, ts } — most recent at end
        this._followTail = true;
        this._unsubscribe = null;
        this._sseStateUnsub = null;
        this._sseConnState = 'open';

        // Initial-tail vs first-SSE-batch ordering race (batch 41).
        // SSE batches that arrive while the /tail GET is still in-
        // flight get queued; the queue drains AFTER the tail seed
        // settles so newer SSE rows sit BELOW the historical tail.
        this._initialTailDone = false;
        this._pendingSseBatches = [];

        // Lifecycle flag — every .then / SSE callback short-circuits
        // when this flips. Without it, a teardown mid-fetch would
        // append into a detached scroller (already removed from DOM).
        this._destroyed = false;

        // DOM cache — populated by _renderShell.
        this.root = null;
        this._toolbar = null;
        this._searchInput = null;
        this._liveBtn = null;
        this._copyBtn = null;
        this._metaCount = null;
        this._metaMatches = null;
        this._metaSource = null;
        this._scroller = null;
        this._capBanner = null;

        // Search state.
        // v0.5.218 audit Phase 4 (AUDIT-FLOW-LV03, P2) — persist last search
        // via enmPrefs so it survives chain switch / tab remount.
        this._searchRaw = (root.enmPrefs && typeof root.enmPrefs.get === 'function')
            ? root.enmPrefs.get('log-viewer:search', '')
            : '';
        this._searchSpec = parseSearchPattern(this._searchRaw);
        this._searchDebounce = null;
        this._matchCount = 0;

        // Head-trim accounting (sticky banner once it un-hides).
        this._droppedCount = 0;
        // beta.3.17 — running tally of duplicate lines that got
        // collapsed into a "× N" chip rather than rendered as their
        // own DOM row. Surfaced in the meta count so the operator
        // sees "234 lines · 4,891 collapsed" instead of a quiet
        // dedupe.
        this._collapsedCount = 0;

        // beta.3.16 — severity filter chips. Operator feedback was that
        // ela.log floods the viewer with DEBG noise that buries what
        // matters (warnings + errors). Default-hides DEBG; INFO/WARN/
        // ERROR visible. _renderLine tags each <div.enm-log-line> with
        // `data-lvl` and `hidden` per the current filter; toggling a
        // chip flips _lvlFilters[lvl] then sweeps. Counts live on each
        // chip's inline <span class="enm-log-lvl-count">.
        // v0.5.218 audit Phase 4 (AUDIT-FLOW-LV02, P2) — load from
        // sessionStorage so the operator's "DEBG hidden" preference
        // survives chain-switch / tab-remount. Pre-v0.5.218 every
        // remount reset DEBG visible and the operator had to re-hide.
        var DEFAULT_LVL_FILTERS = { error: true, warn: true, info: true, debug: false };
        this._lvlFilters = (root.enmPrefs && typeof root.enmPrefs.get === 'function')
            ? root.enmPrefs.get('log-viewer:lvl-filters', DEFAULT_LVL_FILTERS)
            : DEFAULT_LVL_FILTERS;
        this._lvlChips = {};   // populated by _renderShell
        this._lvlCounts = { error: 0, warn: 0, info: 0, debug: 0 };

        this._renderShell();
    }

    /**
     * Detect the severity level of a raw log line.
     * Matches the same vocabulary as LVL_REGEX but returns a single
     * canonical key ('error' / 'warn' / 'info' / 'debug'). Empty or
     * unknown lines classify as 'info' (the safe default — we'd
     * rather show ambiguous content than hide it).
     */
    function detectLevel(raw) {
        if (typeof raw !== 'string') { return 'info'; }
        // Probe in order of severity — first hit wins. The chain emits
        // INFO + [STAT] on the same line all the time; if we walked
        // alphabetically we'd misclassify [WRN] [STAT] lines as info.
        if (/\b(ERROR|ERR)\b/i.test(raw))         { return 'error'; }
        if (/\b(WARN|WARNING|WRN)\b/i.test(raw))  { return 'warn'; }
        if (/\b(DEBG|DEBUG|DBG)\b/i.test(raw))    { return 'debug'; }
        return 'info';
    }

    LogViewer.prototype.mount = function (parent) {
        parent.appendChild(this.root);
        this._loadInitialTail();
        this._subscribe();
        this._loadChainList();
        return this;
    };

    /** @private — v0.5.237 — populate the in-pane chain picker from GET
     * /config so the operator can switch which chain's logs they view. Best-
     * effort: on failure the picker keeps just the current (seed) chain. */
    LogViewer.prototype._loadChainList = function () {
        var self = this;
        if (!this.api || typeof this.api.get !== 'function') { return; }
        this.api.get('/config').then(function (data) {
            if (self._destroyed || !self._chainSelect) { return; }
            var cfg = (data && data.result && data.result.config)
                   || (data && data.config) || data || {};
            var chains = (cfg && cfg.chains) || {};
            var ids = Object.keys(chains);
            if (ids.length === 0) { return; }
            self._availableChains = ids;
            self._chainSelect.innerHTML = '';
            ids.forEach(function (id) {
                var opt = document.createElement('option');
                opt.value = id;
                opt.textContent = _logChainName(id);
                self._chainSelect.appendChild(opt);
            });
            // Edge case: current chain not in the configured set — keep it
            // selectable so the viewer never points at a missing option.
            if (ids.indexOf(self.chainId) === -1) {
                var cur = document.createElement('option');
                cur.value = self.chainId;
                cur.textContent = _logChainName(self.chainId);
                self._chainSelect.insertBefore(cur, self._chainSelect.firstChild);
            }
            self._chainSelect.value = self.chainId;
        }).catch(function () { /* keep the seed option */ });
    };

    /** @private — v0.5.237 — switch the viewer to a different chain's logs:
     * unsubscribe the old SSE topic, reset the buffer + counters, clear the
     * scroller, then re-seed the tail + subscribe the new topic. The toolbar
     * (search, live, level filters) is preserved — no full remount. */
    LogViewer.prototype._switchChain = function (newId) {
        if (!newId || newId === this.chainId || this._destroyed) { return; }
        if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
        this.chainId = newId;
        this._lines = [];
        this._lvlCounts = { error: 0, warn: 0, info: 0, debug: 0 };
        this._collapsedCount = 0;
        this._initialTailDone = false;
        this._pendingSseBatches = [];
        if (this._scroller) { this._scroller.innerHTML = ''; }
        if (this._chainSelect && this._chainSelect.value !== newId) {
            this._chainSelect.value = newId;
        }
        // Reset the meta count + per-level chips to zero for the new chain.
        if (typeof this._refreshMeta === 'function') { this._refreshMeta(); }
        ['error', 'warn', 'info', 'debug'].forEach(function (lvl) {
            if (typeof this._refreshLvlChipCount === 'function') {
                this._refreshLvlChipCount(lvl);
            }
        }, this);
        this._loadInitialTail();
        this._subscribe();
    };

    LogViewer.prototype.destroy = function () {
        // Mark destroyed FIRST so any in-flight _loadInitialTail
        // resolutions short-circuit before mutating detached DOM.
        this._destroyed = true;
        if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
        if (this._sseStateUnsub) { this._sseStateUnsub(); this._sseStateUnsub = null; }
        if (this._searchDebounce) {
            clearTimeout(this._searchDebounce);
            this._searchDebounce = null;
        }
        if (this.root && this.root.parentNode) {
            this.root.parentNode.removeChild(this.root);
        }
    };

    /** @private */
    LogViewer.prototype._renderShell = function () {
        var t = root.enmTOrFallback || function (k, fb) { return fb || k; };
        var self = this;

        this.root = document.createElement('section');
        this.root.className = 'enm-log-viewer';

        // ---- toolbar -----------------------------------------------------
        var toolbar = document.createElement('div');
        toolbar.className = 'enm-log-toolbar';
        this._toolbar = toolbar;

        var toolbarLeft = document.createElement('div');
        toolbarLeft.className = 'enm-log-toolbar-left';

        var title = document.createElement('div');
        title.className = 'enm-log-title';
        title.textContent = 'Logs';
        toolbarLeft.appendChild(title);

        // v0.5.237 — in-pane chain picker (replaces the static chain pill).
        // The top chain-selector dropdown was removed, so Logs owns its own
        // chain scope. Populated by _loadChainList from GET /config; switching
        // re-seeds the tail + swaps the SSE topic without a full remount.
        var chainSelect = document.createElement('select');
        chainSelect.className = 'enm-log-chain-select';
        chainSelect.setAttribute('aria-label', 'Log chain');
        var seedOpt = document.createElement('option');
        seedOpt.value = this.chainId;
        seedOpt.textContent = _logChainName(this.chainId);
        chainSelect.appendChild(seedOpt);
        chainSelect.value = this.chainId;
        chainSelect.addEventListener('change', function () {
            self._switchChain(chainSelect.value);
        });
        this._chainSelect = chainSelect;
        toolbarLeft.appendChild(chainSelect);

        // Search input. Debounced 200ms so the regex compile + DOM
        // re-walk doesn't fire on every keystroke.
        var searchWrap = document.createElement('div');
        searchWrap.className = 'enm-log-search';

        // The mock uses a glyph as the icon. We emit an inline SVG-
        // alike so the icon scales with the input font-size; the
        // glyph kept as the rendered character is fine.
        var searchIcon = document.createElement('span');
        searchIcon.className = 'enm-log-search-icon';
        searchIcon.setAttribute('aria-hidden', 'true');
        searchIcon.textContent = '⌕'; // ⌕
        searchWrap.appendChild(searchIcon);

        var searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'enm-log-search-input';
        searchInput.placeholder = 'Filter… (or /regex/)';
        searchInput.setAttribute('aria-label', 'Filter visible log lines');
        // v0.5.218 audit Phase 4 — prefill persisted search.
        if (this._searchRaw) {
            searchInput.value = this._searchRaw;
        }
        searchInput.addEventListener('input', function () {
            self._scheduleSearchUpdate(searchInput.value);
        });
        this._searchInput = searchInput;
        searchWrap.appendChild(searchInput);

        toolbarLeft.appendChild(searchWrap);
        toolbar.appendChild(toolbarLeft);

        var toolbarRight = document.createElement('div');
        toolbarRight.className = 'enm-log-toolbar-right';

        // Live / paused button. data-paused="true|false" drives the
        // gray vs accent state in CSS; class .enm-log-following
        // stays on while SSE state-tracking matches alpha.28.
        var liveBtn = document.createElement('button');
        liveBtn.type = 'button';
        liveBtn.className = 'enm-log-live-btn';
        liveBtn.setAttribute('data-paused', 'false');
        var liveDot = document.createElement('span');
        liveDot.className = 'enm-log-live-dot';
        liveDot.setAttribute('aria-hidden', 'true');
        liveBtn.appendChild(liveDot);
        // Wrap the label in a span so the dot stays untouched when we
        // toggle text. Keeps the markup stable for AT users.
        var liveLabel = document.createElement('span');
        liveLabel.className = 'enm-log-live-label';
        liveLabel.textContent = t('log_viewer.live', 'Live');
        liveBtn.appendChild(liveLabel);
        liveBtn.addEventListener('click', function () {
            // Don't toggle while disconnected — non-actionable then.
            if (self._sseConnState !== 'open') { return; }
            self._followTail = !self._followTail;
            self._refreshLiveLabel();
            if (self._followTail) { self._scrollToBottom(); }
        });
        this._liveBtn = liveBtn;
        this._liveLabel = liveLabel;
        toolbarRight.appendChild(liveBtn);

        // Copy. Uses enmCopyToClipboard when available so the
        // "Copied!" label-swap + notifications fall-through stays
        // consistent with every other copy site in the app.
        var copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'enm-btn enm-btn-secondary enm-log-copy';
        copyBtn.textContent = 'Copy';
        copyBtn.setAttribute('aria-label', 'Copy visible log lines to clipboard');
        copyBtn.addEventListener('click', function () { self._copyVisible(); });
        this._copyBtn = copyBtn;
        toolbarRight.appendChild(copyBtn);

        toolbar.appendChild(toolbarRight);
        this.root.appendChild(toolbar);

        // ---- meta row ----------------------------------------------------
        // Hidden by default on narrow/compact via CSS; built unconditionally
        // here because CSS handles the visibility (DRY — JS doesn't need to
        // know breakpoints).
        var meta = document.createElement('div');
        meta.className = 'enm-log-meta';

        var metaCount = document.createElement('span');
        metaCount.className = 'enm-log-meta-count';
        metaCount.textContent = '0 lines';
        this._metaCount = metaCount;
        meta.appendChild(metaCount);

        // Match counter — hidden until a search is active. We
        // toggle visibility with the `hidden` attribute so AT users
        // don't read the "0 match" caption every render.
        var metaMatches = document.createElement('span');
        metaMatches.className = 'enm-log-meta-matches';
        metaMatches.hidden = true;
        this._metaMatches = metaMatches;
        meta.appendChild(metaMatches);

        var metaSep = document.createElement('span');
        metaSep.className = 'enm-log-meta-sep';
        metaSep.textContent = '·'; // ·
        meta.appendChild(metaSep);

        // 0.5.17 audit Session 17 — operator-facing meta source rewrite.
        // Pre-0.5.17 read "Tail seeded from /tail?n=200 · SSE
        // chains:mainchain:logs" — leaked internal API paths and SSE
        // channel names that operators don't curl or subscribe to. The
        // new copy tells the operator the same thing in operator terms.
        var metaSource = document.createElement('span');
        metaSource.className = 'enm-log-meta-source';
        metaSource.textContent = 'Showing last '
            + INITIAL_TAIL_N.toLocaleString() + ' lines · live updates';
        this._metaSource = metaSource;
        meta.appendChild(metaSource);

        this.root.appendChild(meta);

        // ---- severity filter chips --------------------------------------
        // beta.3.16 — operator-driven noise filter. DEBG defaults off; the
        // other three default on. Each chip is a toggle (aria-pressed) and
        // carries its own running count. Clicking a chip flips _lvlFilters
        // and sweeps the DOM. Cheap (~5 ms on 5,000 lines via a single
        // querySelectorAll + a hidden-attribute flip).
        var lvlBar = document.createElement('div');
        lvlBar.className = 'enm-log-lvl-bar';
        lvlBar.setAttribute('role', 'toolbar');
        lvlBar.setAttribute('aria-label', 'Filter log lines by severity');

        var lvlOrder = ['error', 'warn', 'info', 'debug'];
        var lvlLabel = { error: 'Errors', warn: 'Warnings', info: 'Info', debug: 'Debug' };
        var self2 = this;
        lvlOrder.forEach(function (lvl) {
            var chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'enm-log-lvl-chip enm-log-lvl-chip-' + lvl;
            chip.setAttribute('data-lvl', lvl);
            chip.setAttribute('aria-pressed', String(!!self2._lvlFilters[lvl]));
            var label = document.createElement('span');
            label.className = 'enm-log-lvl-chip-label';
            label.textContent = lvlLabel[lvl];
            chip.appendChild(label);
            var count = document.createElement('span');
            count.className = 'enm-log-lvl-chip-count';
            count.textContent = '0';
            chip.appendChild(count);
            chip.addEventListener('click', function () { self2._toggleLevel(lvl); });
            self2._lvlChips[lvl] = chip;
            lvlBar.appendChild(chip);
        });
        this.root.appendChild(lvlBar);

        // ---- scroller ----------------------------------------------------
        var scroller = document.createElement('div');
        scroller.className = 'enm-log-scroller';
        // a11y: role="log" alone — pairing with aria-live="polite"
        // forced screen readers to announce every SSE batch (up to
        // 500 lines/sec). aria-relevant="additions" tells AT to focus
        // on appended content if it's queried explicitly.
        scroller.setAttribute('role', 'log');
        scroller.setAttribute('aria-relevant', 'additions');
        scroller.setAttribute('aria-label', 'Log lines for chain ' + this.chainId);
        this._scroller = scroller;

        // Sticky cap banner — hidden until the 5000 line cap is hit.
        var cap = document.createElement('div');
        cap.className = 'enm-log-cap-banner';
        cap.hidden = true;
        // 0.5.17 audit Session 17 — drop "DOM cap" dev jargon. Pre-0.5.17
        // said "5,000-line DOM cap reached. Older lines dropped from the
        // top." — operators don't think in DOM terms and "dropped from
        // the top" isn't actionable. New copy tells them what's shown +
        // how to find older lines.
        cap.textContent = 'Showing the most recent 5,000 lines. '
            + 'Older lines have scrolled off — use Copy or the filter '
            + 'to find what you need.';
        this._capBanner = cap;
        scroller.appendChild(cap);

        // Auto-pause on scroll-up; auto-resume on scroll-to-bottom.
        // The previous (alpha.28) shape only auto-paused; resuming
        // required clicking the live button. The new behaviour mirrors
        // tailing tools (less +F, journalctl -f) where reaching the
        // bottom re-engages the follow.
        scroller.addEventListener('scroll', function () {
            if (self._destroyed) { return; }
            var nearBottom = (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop) < 4;
            if (!nearBottom && self._followTail) {
                self._followTail = false;
                self._refreshLiveLabel();
            } else if (nearBottom && !self._followTail && self._sseConnState === 'open') {
                self._followTail = true;
                self._refreshLiveLabel();
            }
        });

        this.root.appendChild(scroller);

        // ---- SSE state tracking -----------------------------------------
        // Same shape as alpha.28 — the "live" pill flips to "reconnecting…"
        // (with the dot animation killed via CSS) whenever the
        // EventSource is mid-reconnect.
        if (this.sse && typeof this.sse.onState === 'function') {
            this._sseStateUnsub = this.sse.onState(function (state) {
                if (self._destroyed) { return; }
                self._sseConnState = state;
                self._refreshLiveLabel();
            });
        }
        this._refreshLiveLabel();
    };

    /** @private */
    LogViewer.prototype._refreshLiveLabel = function () {
        if (!this._liveBtn) { return; }
        if (this._sseConnState !== 'open') {
            // Disconnected — neutralize the button. data-paused="true"
            // gives the gray theme; class .enm-log-reconnecting can
            // be styled separately if needed. The dot animation is
            // gated off in CSS via [data-paused="true"].
            this._liveBtn.setAttribute('data-paused', 'true');
            this._liveBtn.classList.add('enm-log-reconnecting');
            this._liveLabel.textContent = 'reconnecting…';
            this._liveBtn.title = 'Live log stream lost — auto-reconnecting';
            return;
        }
        this._liveBtn.classList.remove('enm-log-reconnecting');
        this._liveBtn.setAttribute('data-paused', this._followTail ? 'false' : 'true');
        this._liveLabel.textContent = this._followTail ? 'Live' : 'Paused';
        // Clear title= when the label already says everything visible.
        this._liveBtn.removeAttribute('title');
    };

    /** @private */
    LogViewer.prototype._loadInitialTail = function () {
        var self = this;
        return this.api.get('/logs/' + encodeURIComponent(this.chainId) + '/tail?n=' + INITIAL_TAIL_N, { skipCache: true })
            .then(function (data) {
                if (self._destroyed) { return; }
                if (data && Array.isArray(data.lines) && data.lines.length > 0) {
                    self._appendBatch(data.lines);
                }
            })
            .catch(function () {
                // Silent — chain may not have started yet, /tail returns empty.
            })
            .then(function () {
                if (self._destroyed) { return; }
                self._initialTailDone = true;
                self._drainPendingSseBatches();
            });
    };

    /** @private */
    LogViewer.prototype._drainPendingSseBatches = function () {
        if (!this._pendingSseBatches || this._pendingSseBatches.length === 0) {
            return;
        }
        var queued = this._pendingSseBatches;
        this._pendingSseBatches = [];
        for (var i = 0; i < queued.length; i += 1) {
            this._appendBatch(queued[i]);
        }
    };

    /** @private */
    LogViewer.prototype._subscribe = function () {
        if (!this.sse || typeof this.sse.subscribe !== 'function') {
            // No SSE service — graceful degrade to the initial tail
            // only. The Live button stays interactive but no new
            // lines arrive.
            return;
        }
        var self = this;
        var topic = 'chains:' + this.chainId + ':logs';
        // Visibility-pause: drop SSE appends to the DOM when the tab
        // is hidden so a 500 lines/sec firehose doesn't keep allocating
        // nodes nobody's looking at. Lines arriving while hidden are
        // pushed into the `_lines` buffer (so copy/serialization still
        // sees them) but the DOM doesn't grow. On visibility resume
        // the existing scroller stays as-is and the next real SSE
        // batch picks it up — for v0.1 the rolling MAX_DOM_LINES
        // window is the operator-facing contract; a future "replay
        // missed-while-hidden" feature can re-render from `_lines`.
        // (The Round-16 Page-Visibility audit's enmUseVisibilityPause
        // is shaped for setInterval pollers and isn't a clean fit for
        // SSE handlers, so we open-code the visibility branch.)
        var handler = function (payload) {
            if (self._destroyed) { return; }
            if (!payload || !Array.isArray(payload.lines)) { return; }
            if (!self._initialTailDone) {
                self._pendingSseBatches.push(payload.lines);
                return;
            }
            if (typeof document !== 'undefined' && document.hidden) {
                // Accumulate into the entry buffer without touching DOM.
                // MAX_DOM_LINES is enforced only on render so the buffer
                // doesn't grow unbounded — cap here too.
                for (var i = 0; i < payload.lines.length; i += 1) {
                    self._lines.push(payload.lines[i]);
                }
                if (self._lines.length > MAX_DOM_LINES) {
                    self._lines.splice(0, self._lines.length - MAX_DOM_LINES);
                }
                return;
            }
            self._appendBatch(payload.lines);
        };

        this._unsubscribe = this.sse.subscribe(topic, handler);
    };

    /** @private */
    LogViewer.prototype._scheduleSearchUpdate = function (raw) {
        var self = this;
        this._searchRaw = raw;
        // v0.5.218 audit Phase 4 — persist alongside the debounce so the
        // operator's search survives remount.
        if (root.enmPrefs && typeof root.enmPrefs.set === 'function') {
            try { root.enmPrefs.set('log-viewer:search', raw); }
            catch (_) { /* silent */ }
        }
        if (this._searchDebounce) {
            clearTimeout(this._searchDebounce);
        }
        this._searchDebounce = setTimeout(function () {
            self._searchDebounce = null;
            if (self._destroyed) { return; }
            self._applySearch();
        }, SEARCH_DEBOUNCE_MS);
    };

    /** @private */
    LogViewer.prototype._applySearch = function () {
        var spec = parseSearchPattern(this._searchRaw);
        this._searchSpec = spec;
        // Re-walk the existing line nodes and re-decorate. We don't
        // re-build the whole list because the underlying `_lines`
        // buffer is unchanged — only the per-line classification
        // (match / no-match) and the highlight span overlay shift.
        var nodes = this._scroller.querySelectorAll('.enm-log-line');
        var totalMatches = 0;
        for (var i = 0; i < nodes.length; i += 1) {
            var node = nodes[i];
            var raw = node.getAttribute('data-line') || '';
            var html = applyLvlHighlights(escapeHtml(raw));
            var hl = applySearchHighlights(html, spec.regex);
            var textNode = node.querySelector('.enm-log-text');
            if (textNode) {
                textNode.innerHTML = hl.html;
                // beta.3.17 — rebuilding innerHTML wiped the dup-count
                // chip; re-append it so a collapsed run keeps its
                // "× N" indicator across search interactions.
                var count = parseInt(node.getAttribute('data-count') || '1', 10) || 1;
                if (count > 1) {
                    var chip = document.createElement('span');
                    chip.className = 'enm-log-dup-count';
                    chip.setAttribute('aria-label', 'Repeat count');
                    chip.textContent = '× ' + count.toLocaleString();
                    textNode.appendChild(document.createTextNode(' '));
                    textNode.appendChild(chip);
                }
            }
            if (hl.matched) {
                node.classList.add('match');
                totalMatches += 1;
            } else {
                node.classList.remove('match');
            }
        }
        this._matchCount = totalMatches;
        this._refreshMeta();
    };

    /**
     * beta.3.16 — flip a severity-filter chip. Sweeps every existing
     * `[data-lvl=X]` line and toggles its `hidden` attribute. The
     * chip's aria-pressed state stays in sync for AT. New lines that
     * arrive afterward pick up the current state via _renderLine.
     * @private
     */
    LogViewer.prototype._toggleLevel = function (lvl) {
        if (!Object.prototype.hasOwnProperty.call(this._lvlFilters, lvl)) { return; }
        this._lvlFilters[lvl] = !this._lvlFilters[lvl];
        // v0.5.218 audit Phase 4 — persist so the choice survives remount.
        if (root.enmPrefs && typeof root.enmPrefs.set === 'function') {
            try { root.enmPrefs.set('log-viewer:lvl-filters', this._lvlFilters); }
            catch (_) { /* private mode etc. — silent */ }
        }
        var chip = this._lvlChips[lvl];
        if (chip) {
            chip.setAttribute('aria-pressed', String(this._lvlFilters[lvl]));
        }
        // Sweep: visible = filter true, hidden = filter false.
        var on = this._lvlFilters[lvl];
        var nodes = this._scroller.querySelectorAll('.enm-log-line[data-lvl="' + lvl + '"]');
        for (var i = 0; i < nodes.length; i += 1) {
            nodes[i].hidden = !on;
        }
        // If we just un-hid a class of lines and were following the
        // tail, the operator probably wants to keep seeing live tail —
        // scroll to the new bottom so the un-hidden lines flow into
        // view. If we hid lines, the visible viewport shrinks; no
        // scroll needed.
        if (on && this._followTail) {
            this._scrollToBottom();
        }
    };

    /**
     * beta.3.16 — push the running count for `lvl` to its chip.
     * Cheap; called from _renderLine on every new line.
     * @private
     */
    LogViewer.prototype._refreshLvlChipCount = function (lvl) {
        var chip = this._lvlChips && this._lvlChips[lvl];
        if (!chip) { return; }
        var count = chip.querySelector('.enm-log-lvl-chip-count');
        if (!count) { return; }
        var n = this._lvlCounts[lvl] || 0;
        // Compact format for big numbers (DEBG can hit thousands fast).
        count.textContent = (n >= 1000) ? (Math.floor(n / 100) / 10).toFixed(1) + 'k' : String(n);
    };

    /** @private */
    LogViewer.prototype._refreshMeta = function () {
        if (!this._metaCount) { return; }
        var n = this._lines.length;
        var dedup = this._collapsedCount || 0;
        // beta.3.17 — surface the dedupe activity in the meta count.
        // When the chain floods identical errors (the
        // "v2 accumulateReward Sponsor not exist" hot path during sync
        // is the inspiration), the operator should see "234 lines ·
        // 4,891 collapsed" so the dedupe doesn't silently swallow
        // signal-of-volume.
        var label = n.toLocaleString() + (n === 1 ? ' line' : ' lines');
        if (dedup > 0) {
            label += ' · ' + dedup.toLocaleString() + ' collapsed';
        }
        this._metaCount.textContent = label;
        if (this._searchSpec && this._searchSpec.regex) {
            this._metaMatches.hidden = false;
            this._metaMatches.textContent = '· ' + this._matchCount.toLocaleString()
                + (this._matchCount === 1 ? ' match' : ' matches');
        } else {
            this._metaMatches.hidden = true;
            this._metaMatches.textContent = '';
        }
    };

    /** @private */
    LogViewer.prototype._appendBatch = function (lines) {
        if (!Array.isArray(lines) || lines.length === 0) {
            return;
        }

        var frag = document.createDocumentFragment();
        var spec = this._searchSpec;
        var matchesAdded = 0;
        // beta.3.17 — journalctl-style adjacent-duplicate collapse.
        // We compute a signature per line (lvl + body-without-ts) and
        // compare against the last appended node's signature. On a
        // hit, increment that node's data-count + its visible "× N"
        // chip; don't append a new DOM row. The severity-chip count
        // still bumps for the underlying event so the chip-bar
        // reflects the real event rate, not the visible-row count.
        //
        // "Last appended" walks BOTH the existing DOM tail AND any
        // rows we just queued into `frag` this iteration — otherwise
        // a flood of 50 identical lines within a single batch would
        // bloom 50 nodes before the first scroll-to-bottom flush.
        var tailNode = null;
        var existingLineNodes = this._scroller.querySelectorAll('.enm-log-line');
        if (existingLineNodes.length > 0) {
            tailNode = existingLineNodes[existingLineNodes.length - 1];
        }
        var dedupedCount = 0;
        for (var i = 0; i < lines.length; i += 1) {
            var entry = lines[i];
            var raw = (entry && entry.line != null) ? String(entry.line) : '';
            raw = raw.replace(ANSI_REGEX, '');
            var lvl = detectLevel(raw);
            var sig = logSignature(raw, lvl);

            // Severity chip count always bumps — operator wants to
            // see total events of each level, even if we collapsed
            // the visible rows. _renderLine bumps the chip count
            // when it actually creates a node; for collapsed dupes
            // we bump it here, skipping _renderLine entirely.
            if (tailNode && tailNode.getAttribute('data-sig') === sig) {
                var prevCount = parseInt(tailNode.getAttribute('data-count') || '1', 10) || 1;
                tailNode.setAttribute('data-count', String(prevCount + 1));
                var chip = tailNode.querySelector('.enm-log-dup-count');
                if (chip) {
                    chip.textContent = '× ' + (prevCount + 1).toLocaleString();
                    chip.hidden = false;
                }
                // Update the tooltip so hovering a collapsed run gives
                // the first/last timestamps of the run rather than just
                // the original line's ISO.
                tailNode.setAttribute(
                    'data-last-ts',
                    (entry && entry.ts != null) ? String(entry.ts) : ''
                );
                this._lvlCounts[lvl] = (this._lvlCounts[lvl] || 0) + 1;
                this._refreshLvlChipCount(lvl);
                dedupedCount += 1;
                continue;
            }

            this._lines.push(entry);
            var node = this._renderLine(entry, spec);
            node.setAttribute('data-sig', sig);
            node.setAttribute('data-count', '1');
            if (node.classList.contains('match')) { matchesAdded += 1; }
            frag.appendChild(node);
            tailNode = node;
        }
        this._scroller.appendChild(frag);
        this._collapsedCount = (this._collapsedCount || 0) + dedupedCount;

        // Trim to MAX_DOM_LINES — drop oldest from the top. Use
        // Range.deleteContents for the bulk removal so we get ONE
        // layout invalidation per trim, not N (batch 107).
        if (this._lines.length > MAX_DOM_LINES) {
            var excess = this._lines.length - MAX_DOM_LINES;
            // Drop the same range from the search-match count first
            // (before we slice the array) so the meta counter stays
            // in sync. Counted by reading the DOM head nodes' .match
            // class because the search-state is the source of truth.
            var trimmedMatches = 0;
            // beta.3.16 — also decrement per-level counts so the chips
            // stay honest after a head-trim. Walk the same node range
            // once; check both match-class and data-lvl in one pass.
            var trimmedLvls = { error: 0, warn: 0, info: 0, debug: 0 };
            // beta.3.17 — when a head-trim drops a collapsed row, the
            // duplicate events that fed its "× N" badge are gone too.
            // Decrement _collapsedCount by (count - 1) per dropped row
            // and decrement _lvlCounts by `count` (since each repeat
            // bumped the chip).
            var trimmedCollapsed = 0;
            var lineNodes = this._scroller.querySelectorAll('.enm-log-line');
            var trimEnd = Math.min(excess, lineNodes.length);
            for (var k = 0; k < trimEnd; k += 1) {
                if (lineNodes[k].classList.contains('match')) {
                    trimmedMatches += 1;
                }
                var trimLvl = lineNodes[k].getAttribute('data-lvl') || 'info';
                var trimCount = parseInt(lineNodes[k].getAttribute('data-count') || '1', 10) || 1;
                if (Object.prototype.hasOwnProperty.call(trimmedLvls, trimLvl)) {
                    trimmedLvls[trimLvl] += trimCount;
                }
                if (trimCount > 1) {
                    trimmedCollapsed += (trimCount - 1);
                }
            }
            this._collapsedCount = Math.max(0, this._collapsedCount - trimmedCollapsed);
            // Apply the decrements + refresh affected chips.
            var self3 = this;
            ['error', 'warn', 'info', 'debug'].forEach(function (lvl) {
                if (trimmedLvls[lvl] > 0) {
                    self3._lvlCounts[lvl] = Math.max(0, (self3._lvlCounts[lvl] || 0) - trimmedLvls[lvl]);
                    self3._refreshLvlChipCount(lvl);
                }
            });
            this._lines.splice(0, excess);

            if (lineNodes.length > 0 && typeof document.createRange === 'function') {
                var first = lineNodes[0];
                var last = lineNodes[Math.min(excess, lineNodes.length) - 1];
                var range = document.createRange();
                range.setStartBefore(first);
                range.setEndAfter(last);
                range.deleteContents();
            } else {
                // Fallback: per-child loop. Skips .enm-log-cap-banner
                // because the banner is sticky and not a log line.
                for (var j = 0; j < excess; j += 1) {
                    var next = this._scroller.querySelector('.enm-log-line');
                    if (!next) { break; }
                    this._scroller.removeChild(next);
                }
            }

            this._matchCount = Math.max(0, this._matchCount - trimmedMatches);
            this._droppedCount += excess;
            if (this._capBanner && this._capBanner.hidden) {
                this._capBanner.hidden = false;
                this._capBanner.setAttribute('role', 'status');
            }
        }

        this._matchCount += matchesAdded;
        this._refreshMeta();

        if (this._followTail) {
            this._scrollToBottom();
        }
    };

    /** @private */
    LogViewer.prototype._renderLine = function (entry, searchSpec) {
        var div = document.createElement('div');
        div.className = 'enm-log-line';
        var stream = (entry && entry.stream) || 'log';
        div.setAttribute('data-stream', stream);
        // Stash the raw line text in a data-attr so _applySearch can
        // re-decorate without needing the entry object again. ANSI
        // colour sequences from ela.log are stripped first so the
        // operator sees clean text + the lvl regex below can match
        // bare keywords like [WRN] instead of [1;33m[WRN][m.
        var raw = (entry && entry.line != null) ? String(entry.line) : '';
        raw = raw.replace(ANSI_REGEX, '');
        div.setAttribute('data-line', raw);

        // beta.3.16 — severity classification. data-lvl drives the
        // chip-filter sweep AND lets future CSS rules (e.g. a
        // "highlight all errors" mode) target levels directly. The
        // `hidden` attribute is what actually removes the line from
        // the visual flow; CSS adds a `display: none` fallback for
        // browsers that strip the attribute under DOM optimization.
        var lvl = detectLevel(raw);
        div.setAttribute('data-lvl', lvl);
        if (!this._lvlFilters[lvl]) { div.hidden = true; }
        // Bump the running tally + push to the chip label.
        this._lvlCounts[lvl] = (this._lvlCounts[lvl] || 0) + 1;
        this._refreshLvlChipCount(lvl);

        var d = safeDate(entry && entry.ts);
        var time = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());

        var ts = document.createElement('span');
        ts.className = 'enm-log-ts';
        ts.textContent = time;
        div.appendChild(ts);

        var streamCell = document.createElement('span');
        streamCell.className = 'enm-log-stream';
        streamCell.textContent = streamLabel(stream);
        div.appendChild(streamCell);

        var text = document.createElement('span');
        text.className = 'enm-log-text';
        // Build the decorated HTML: lvl spans first, search-highlight
        // spans overlaid on top. Both pass through escapeHtml so the
        // raw line text can't inject markup.
        var html = applyLvlHighlights(escapeHtml(raw));
        var hl = applySearchHighlights(html, searchSpec && searchSpec.regex);
        text.innerHTML = hl.html;
        // beta.3.17 — dup-count chip rendered inside the text cell at
        // the end. Hidden by default; _appendBatch unhides + updates
        // textContent when adjacent duplicate lines collapse into
        // this row. Kept as a child of .enm-log-text (not a 4th grid
        // column) so a long log message wraps the chip onto the next
        // visual line naturally instead of forcing a horizontal
        // scroll.
        var dupCount = document.createElement('span');
        dupCount.className = 'enm-log-dup-count';
        dupCount.hidden = true;
        dupCount.setAttribute('aria-label', 'Repeat count');
        text.appendChild(document.createTextNode(' '));
        text.appendChild(dupCount);
        div.appendChild(text);

        if (hl.matched) {
            div.classList.add('match');
        }

        // Full ISO + stream in the tooltip so the operator can read
        // the exact timestamp without expanding the line.
        div.title = d.toISOString() + ' [' + stream + ']';
        return div;
    };

    /** @private */
    LogViewer.prototype._scrollToBottom = function () {
        var self = this;
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(function () {
                if (self._destroyed || !self._scroller) { return; }
                self._scroller.scrollTop = self._scroller.scrollHeight;
            });
        } else {
            this._scroller.scrollTop = this._scroller.scrollHeight;
        }
    };

    /**
     * Serialize the currently-visible (post-filter) lines into a
     * plaintext blob and copy to clipboard.
     *
     * @private
     */
    LogViewer.prototype._copyVisible = function () {
        var spec = this._searchSpec;
        var filtered = [];
        var entries = this._lines;
        for (var i = 0; i < entries.length; i += 1) {
            var e = entries[i];
            var line = (e && e.line != null) ? String(e.line) : '';
            if (spec && spec.regex) {
                spec.regex.lastIndex = 0;
                if (!spec.regex.test(line)) { continue; }
            }
            var d = safeDate(e && e.ts);
            var ts;
            try { ts = d.toISOString(); }
            catch (err) { ts = '?'; }
            filtered.push(ts + ' [' + ((e && e.stream) || 'log') + '] ' + line);
        }
        var text = filtered.join('\n') + (filtered.length > 0 ? '\n' : '');

        var nf = this.notifications;
        var copyBtn = this._copyBtn;
        if (root.enmCopyToClipboard) {
            root.enmCopyToClipboard(text, {
                btn: copyBtn,
                copiedLabel: 'Copied!',
                notifications: nf,
                notifyOnSuccess: !copyBtn,  // notification only if no in-button feedback
                successTitle: 'Logs copied',
                successBody: filtered.length.toLocaleString() + ' line'
                    + (filtered.length === 1 ? '' : 's') + ' copied to clipboard.',
                failTitle: 'Copy unavailable',
                failBody: 'Browser blocked clipboard access.',
            });
            return;
        }
        // Fallback path — older browsers or unit tests without the
        // util. Direct clipboard write, no in-button feedback.
        if (typeof navigator !== 'undefined'
            && navigator.clipboard
            && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                if (nf) { nf.info('Logs copied', filtered.length + ' lines copied to clipboard.'); }
            }, function () {
                if (nf) { nf.warning('Copy unavailable', 'Browser blocked clipboard access.'); }
            });
        } else if (nf) {
            nf.warning('Copy unavailable', 'Browser blocked clipboard access.');
        }
    };

    root.EnmLogViewer = LogViewer;
}(typeof window !== 'undefined' ? window : globalThis));
