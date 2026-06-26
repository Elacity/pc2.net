/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/system-status.js — top-bar with CPU / RAM / disk / OS / uptime.
 *
 * Polls /api/system/status every 5 seconds (visibility-paused). The strip
 * marks every cell stale on poll failure and recovers on the next
 * success. Uptime ticks smoothly at 1 Hz between polls, re-anchored from
 * the server-reported value on every successful refresh.
 */

(function (root) {
    'use strict';

    // 5-second poll matches chain-card so the dashboard feels live across
    // the board. /system/status is a cheap stat() over a few /proc paths
    // — minimal load even at this cadence.
    var POLL_INTERVAL_MS = 5_000;

    function SystemStatus(opts) {
        if (!opts || !opts.api) {
            throw new TypeError('SystemStatus: { api } required');
        }
        this.api = opts.api;
        this.notifications = opts.notifications || null;

        this.root = document.createElement('section');
        this.root.className = 'enm-system-status';
        // beta.3.15 a11y — explicit region semantics so screen-reader
        // users can identify what this strip is. aria-labelledby points
        // at an internal label created in _renderShell (the strip has
        // no visible heading, so we add an offscreen one). aria-live on
        // the strip lets value updates announce without stealing focus.
        this.root.setAttribute('role', 'region');
        this._regionLabelId = 'enm-sys-region-label-' + Math.random().toString(36).slice(2, 8);
        this.root.setAttribute('aria-labelledby', this._regionLabelId);
        this.root.setAttribute('aria-live', 'polite');
        this.root.setAttribute('aria-atomic', 'false');
        this._timer = null;
        // alpha.28.1 batch 16 — _destroyed flag so the 5s poll's pending
        // .then can short-circuit if destroy() fires while a fetch is in
        // flight. Without this the resolver mutates _cells in a removed
        // DOM subtree (harmless visually, but pins component closures).
        this._destroyed = false;

        this._renderShell();
    }

    SystemStatus.prototype.mount = function (parent) {
        parent.appendChild(this.root);
        this.refresh();
        var self = this;
        // alpha.28.1 batch 27 — visibility-pause wrap so a hidden tab
        // doesn't fetch /system/status every 5s. 720 hits/hr saved per
        // hidden dashboard. (Audit a96c7d71.)
        if (typeof root !== 'undefined' && typeof root.enmUseVisibilityPause === 'function') {
            this._pauser = root.enmUseVisibilityPause(function () { self.refresh(); }, POLL_INTERVAL_MS);
        } else {
            this._timer = setInterval(function () { self.refresh(); }, POLL_INTERVAL_MS);
        }
        // alpha.28.1 batch 74 (Round-20A audit finding #6) — uptime
        // anchor + 1s tick. Previously the uptime cell only updated on
        // the 5s /system/status poll, so the value jumped "37s → 42s →
        // 47s" right next to the chain-card uptime which ticks smoothly
        // (chain-card anchors _uptimeBaseMs and re-derives every second).
        // The two adjacent cells reading inconsistently was the easiest
        // way to make the dashboard feel laggy. This 1s tick recomputes
        // from the most recent anchor; no extra network cost.
        this._uptimeTimer = setInterval(function () {
            if (self._destroyed || self._uptimeBaseMs == null) { return; }
            // alpha.29 batch 111 (Round-34 perf finding #4, LOW) —
            // skip the textContent write when:
            // (a) tab is hidden — no operator-visible benefit, and
            //     the next visibility-resume will catch up via the
            //     visibility-paused poll which re-anchors
            // (b) formatted value hasn't changed since the previous
            //     tick — enmFormatUptime rounds to coarse units
            //     (e.g. "5m", "1h 23m"), so the same string can
            //     repeat for whole minutes / hours at a time. textContent
            //     on an unchanged value still costs a node-replace in
            //     some browsers; caching the last printed string short-
            //     circuits ~99% of writes once the uptime crosses
            //     the first minute boundary.
            if (typeof document !== 'undefined' && document.hidden) { return; }
            var seconds = Math.floor((Date.now() - self._uptimeBaseMs) / 1000)
                + (self._uptimeBaseSec || 0);
            var formatted = root.enmFormatUptime(seconds);
            if (formatted === self._lastUptimeText) { return; }
            self._lastUptimeText = formatted;
            var up = formatUptimeParts(formatted);
            self._setCell('uptime', up.main, 'ok', up.sub);
        }, 1000);
        return this;
    };

    SystemStatus.prototype.destroy = function () {
        this._destroyed = true;
        if (this._pauser) { try { this._pauser.stop(); } catch (_) { /* idempotent */ } this._pauser = null; }
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
        if (this._uptimeTimer) { clearInterval(this._uptimeTimer); this._uptimeTimer = null; }
        if (this.root.parentNode) { this.root.parentNode.removeChild(this.root); }
    };

    SystemStatus.prototype.refresh = function () {
        var self = this;
        return this.api.get('/system/status', { skipCache: true }).then(function (s) {
            if (self._destroyed) { return; }
            // Beta 3 — formatters return { main, sub } shapes.
            var cpu = formatCpu(s.cpu);
            var mem = formatMem(s.memory);
            var disk = formatDisk(s.disk);
            var os  = formatOs(s.os);
            self._setCell('cpu',  cpu.main,  healthCpu(s.cpu),     cpu.sub);
            self._setCell('mem',  mem.main,  healthMem(s.memory),  mem.sub);
            self._setCell('disk', disk.main, healthDisk(s.disk),   disk.sub);
            self._setCell('os',   os.main,   healthOs(s.os),       os.sub);
            // Backend contract guard (audit a3e53e9a) — if /system/status
            // ever returns without a `node` envelope (partial response,
            // schema drift, proxy quirk) the previous `s.node.uptimeSec`
            // crashed the entire refresh, dropping straight into the
            // stale-everything catch path. Tolerant access keeps the
            // rest of the cells rendering and just shows uptime as the
            // dash placeholder.
            var uptimeSec = (s && s.node) ? s.node.uptimeSec : null;
            var upInit = formatUptimeParts(root.enmFormatUptime(uptimeSec));
            self._setCell('uptime', upInit.main, 'ok', upInit.sub);
            // Anchor for the 1s smooth-tick (see mount() comment).
            // We store the SERVER-reported seconds at the instant we
            // received it + the client's wall-clock then; the 1s tick
            // adds (Date.now() - base) / 1000 to derive the live value.
            // Server clock drift is irrelevant — we're only computing
            // increments from the anchor, not absolute time.
            if (typeof uptimeSec === 'number' && isFinite(uptimeSec)) {
                self._uptimeBaseMs = Date.now();
                self._uptimeBaseSec = uptimeSec;
            } else {
                self._uptimeBaseMs = null;
            }
            // Clear any prior stale visual marker.
            Object.keys(self._cells).forEach(function (k) {
                self._cells[k].classList.remove('enm-sys-stale');
            });
            self.root.dataset.stale = '0';
            // 0.5.107 audit Session 107 — clear the stale tooltip set by
            // the previous .catch path. Pre-0.5.107 the title attribute
            // ("System status temporarily unavailable — values may be
            // stale.") persisted across recovery because only
            // dataset.stale and the per-cell class were reset. Operators
            // who hovered the strip after a transient outage saw the
            // stale warning long after the values were live again.
            if (self.root.title) { self.root.title = ''; }
        }).catch(function (err) {
            if (self._destroyed) { return; }
            // Mark every cell as stale so the operator can see the values
            // are not live anymore. CSS dims/strikes-through stale cells.
            Object.keys(self._cells).forEach(function (k) {
                self._cells[k].classList.add('enm-sys-stale');
                self._cells[k].dataset.health = 'unknown';
            });
            self.root.dataset.stale = '1';
            self.root.title = 'System status temporarily unavailable — values may be stale.';
            if (self.notifications && err && err.status !== 401) {
                // Reuse one stable id so a 5-min backend outage doesn't
                // stack 60 identical toasts (cap = 5 visible, but the
                // operator still sees the same warning recycled twelve
                // times a minute). Single-id show() dedupes via dismiss-
                // and-replace, so the toast updates in place instead.
                //
                // 0.5.107 audit Session 107 — static body. Pre-0.5.107
                // we leaked err.message into the toast verbatim, which
                // could expose backend paths / stack fragments on 500.
                // /system/status has no operator-meaningful error
                // codes (no 412/409/503 branches like the sessions-
                // 64/67/79 routes), so a flat static fallback is the
                // right shape — the visible stale cells + strip
                // tooltip already convey "not live" without the toast
                // needing to carry the raw error.
                self.notifications.show({
                    id: 'enm-sys-status-unavailable',
                    severity: 'warning',
                    title: 'System status unavailable',
                    body: 'Couldn’t reach the backend for system stats. '
                        + 'The strip will refresh once the next poll succeeds.',
                });
            }
        });
    };

    /**
     * @private
     * Update one cell's value text + health attribute. The leading status
     * dot is rendered via CSS ::before driven by data-health, so all this
     * function does is set strings.
     *
     * @param {string} key   one of cpu/mem/disk/os/uptime
     * @param {string} valueText   formatted "value" string (e.g. "362 GB free")
     * @param {('ok'|'warning'|'critical'|'unknown')} health
     */
    SystemStatus.prototype._setCell = function (key, valueText, health, subText) {
        var cell = this._cells[key];
        if (!cell) return;
        var mainNode = this._fields[key + '_main'];
        var sub      = this._subs[key];
        var bar      = this._bars[key];
        // Beta 3 — split value text: main number + sub units. If only
        // valueText supplied (the most common path for OS / disk), the
        // sub stays empty.
        if (mainNode) {
            mainNode.nodeValue = valueText;
        }
        if (sub) {
            sub.textContent = subText || '';
        }
        // a11y title — full combined text for hover/AT/copy-paste.
        var combined = subText ? (valueText + ' ' + subText) : valueText;
        if (this._fields[key]) {
            this._fields[key].title = combined;
        }
        // Health → bar colour. Mock supports default (ok) / .warn / .crit.
        // Unknown drops the colour back to default.
        if (bar) {
            bar.classList.remove('warn', 'crit');
            if (health === 'warning')  bar.classList.add('warn');
            if (health === 'critical') bar.classList.add('crit');
        }
        // a11y: state was previously conveyed only by background-color on
        // the ::before dot (WCAG 1.4.1 fail for colour-blind operators).
        // Keep the explicit aria-label that names the verdict.
        //
        // 0.5.107 audit Session 107 — use the visible label
        // (t('system_status.cpu') → "cpu load" etc.) instead of the
        // internal symbol. Pre-0.5.107 the aria-label assembled "mem"
        // / "cpu" / "os" verbatim, so screen-reader users heard "mem
        // ok: 48 % of 16 GB" while sighted users read "ram used 48 %
        // of 16 GB". Fall back to the symbol if the i18n helper
        // hasn't loaded yet (defensive — boot path always loads it
        // before mount).
        var labelMap = { ok: 'ok', warning: 'warning', critical: 'critical', unknown: 'unknown' };
        var tLabel = (typeof root.enmTOrFallback === 'function')
            ? root.enmTOrFallback('system_status.' + key)
            : key;
        cell.setAttribute('aria-label', tLabel + ' ' + (labelMap[health] || 'ok') + ': ' + combined);
        cell.dataset.health = health || 'ok';
    };

    /** @private — Beta 3 mock-aligned shell. Reference: phase-03 mock.
     *
     *  <div class="enm-sys-strip">
     *    <div class="enm-sys-cell">
     *      <span class="enm-sys-bar"></span>     ← health-coloured bar
     *      <div class="enm-sys-content">
     *        <div class="enm-sys-label">CPU</div>
     *        <div class="enm-sys-value">0.42<span class="enm-sys-value-sub">8 cores</span></div>
     *      </div>
     *    </div>
     *    ...
     *  </div>
     */
    SystemStatus.prototype._renderShell = function () {
        var t = root.enmTOrFallback;
        // Root carries .enm-sys-strip per the mock; the alpha.28 class
        // .enm-system-status is kept as a secondary marker so any
        // outstanding CSS query still finds the element.
        this.root.classList.add('enm-sys-strip');
        // beta.3.15 a11y — invisible label for the region. Visually
        // hidden but read by AT to give the strip a name.
        var regionLabel = document.createElement('span');
        regionLabel.id = this._regionLabelId;
        regionLabel.className = 'enm-sr-only';
        regionLabel.textContent = (root.enmTOrFallback && root.enmTOrFallback('system_status.region_label')) || 'System status';
        this.root.appendChild(regionLabel);
        this._fields = {};   // value spans
        this._subs   = {};   // sub-value spans (e.g. "8 cores", "% of 16 GB")
        this._bars   = {};   // .enm-sys-bar elements (health colour goes here)
        this._cells  = {};   // cell wrappers (for stale marking)

        ['cpu', 'mem', 'disk', 'os', 'uptime'].forEach(function (k) {
            var cell = document.createElement('div');
            cell.className = 'enm-sys-cell enm-sys-' + k;

            var bar = document.createElement('span');
            bar.className = 'enm-sys-bar';
            cell.appendChild(bar);

            var content = document.createElement('div');
            content.className = 'enm-sys-content';

            var label = document.createElement('div');
            label.className = 'enm-sys-label';
            label.textContent = t('system_status.' + k);
            content.appendChild(label);

            var value = document.createElement('div');
            value.className = 'enm-sys-value';
            // Mocks split the cell text into a main value + an in-line
            // sub. e.g. "0.42" + "8 cores", "48" + "% of 16 GB". We
            // create the sub span up front so _setCell can fill it
            // without rebuilding the value node.
            var main = document.createTextNode('—');
            var sub = document.createElement('span');
            sub.className = 'enm-sys-value-sub';
            value.appendChild(main);
            value.appendChild(sub);
            content.appendChild(value);

            cell.appendChild(content);
            this._fields[k] = value;     // legacy ref — _setCell updates main text node
            this._fields[k + '_main'] = main; // direct text-node ref for split values
            this._subs[k]   = sub;
            this._bars[k]   = bar;
            this._cells[k]  = cell;
            this.root.appendChild(cell);
        }, this);
    };

    /* --- Value formatters ------------------------------------------------ */

    // alpha.15 — values trimmed so they fit the cell width without
    // ellipsis-truncating ("346 GB fr..." / "ubuntu 2..."). Context that
    // used to live in the value text ("free" suffix on disk, the
    // "/ NN GB" on RAM) moves to the cell label below.

    // alpha.28.1 batch 62 (Round-18 audit) — route CPU load + memory
    // percent through enmFormatNumber instead of calling .toFixed
    // directly. The codebase already acknowledged backend type drift as
    // a real risk (chain-card.js:530-544 height path explicitly Number()-
    // coerces; utils.js:78 documents the pattern). System-status was the
    // last hold-out: `cpu.loadAvg1m.toFixed(2)` and `mem.usedPct.toFixed(0)`
    // crash with TypeError if the backend ever returns those as JSON
    // strings ("1.83" instead of 1.83). The crash happens INSIDE the
    // render fn (not the .catch), so it slips past refresh()'s catch and
    // leaves the row stuck on stale cells until the next poll. formatNumber
    // already coerces via Number() and guards isFinite → dash placeholder
    // on failure, no crash.
    function _fmt(n, decimals) {
        var f = (typeof window !== 'undefined' && window.enmFormatNumber)
            ? window.enmFormatNumber
            : function (x, o) { return (typeof x === 'number' ? x : Number(x)).toFixed((o && o.decimals) || 0); };
        return f(n, { decimals: decimals });
    }
    // Beta 3 — formatters return { main, sub } per phase-03 mock split.
    // The main fills .enm-sys-value's text node; sub fills the
    // .enm-sys-value-sub span. _setCell handles both.
    function formatCpu(cpu) {
        if (!cpu) return { main: '—', sub: '' };
        return {
            main: _fmt(cpu.loadAvg1m, 2),
            sub:  (cpu.cores != null) ? (cpu.cores + ' cores') : '',
        };
    }
    function formatMem(mem) {
        if (!mem) return { main: '—', sub: '' };
        return {
            main: _fmt(mem.usedPct, 0),
            sub:  (mem.totalGb != null) ? ('% of ' + _fmt(mem.totalGb, 0) + ' GB') : '%',
        };
    }
    function formatDisk(disk) {
        if (!disk) return { main: '—', sub: '' };
        return {
            main: _fmt(disk.freeGb, 0),
            sub:  'GB free',
        };
    }
    function formatOs(os) {
        if (!os) return { main: '—', sub: '' };
        var name = os.distroId || os.platform || 'unknown';
        return {
            main: name,
            sub:  os.version ? String(os.version).split(' ')[0] : '',
        };
    }
    // Uptime is rendered by enmFormatUptime which returns a single
    // string like "14d 6h"; we wrap it to match the {main, sub} shape.
    // Callers can also call _setCell with separate strings.
    function formatUptimeParts(uptimeStr) {
        if (!uptimeStr || uptimeStr === '—') return { main: '—', sub: '' };
        // Split "14d 6h" → main "14d", sub "6h" when there's a space.
        var parts = String(uptimeStr).split(' ');
        if (parts.length >= 2) {
            return { main: parts[0], sub: parts.slice(1).join(' ') };
        }
        return { main: uptimeStr, sub: '' };
    }

    /* --- Health computation --------------------------------------------- */

    /** load-per-core > 1.0 = warning, > 1.5 = critical (host overloaded). */
    function healthCpu(cpu) {
        if (!cpu || cpu.loadAvg1m == null || !cpu.cores) return 'unknown';
        var perCore = cpu.loadAvg1m / cpu.cores;
        if (perCore > 1.5) return 'critical';
        if (perCore > 1.0) return 'warning';
        return 'ok';
    }
    /** > 90% = critical (OOM risk), > 80% = warning. */
    function healthMem(mem) {
        if (!mem || mem.usedPct == null) return 'unknown';
        if (mem.usedPct > 90) return 'critical';
        if (mem.usedPct > 80) return 'warning';
        return 'ok';
    }
    /** Trust the backend's status field — it knows ENM's disk thresholds. */
    function healthDisk(disk) {
        if (!disk) return 'unknown';
        if (disk.status === 'critical') return 'critical';
        if (disk.status === 'warning')  return 'warning';
        if (disk.freeGb != null && disk.freeGb < 10) return 'critical';
        if (disk.freeGb != null && disk.freeGb < 50) return 'warning';
        return 'ok';
    }
    /** OS preflight emits .ok=false for unsupported distros. */
    function healthOs(os) {
        if (!os) return 'unknown';
        return os.ok === false ? 'warning' : 'ok';
    }

    root.EnmSystemStatus = SystemStatus;
}(typeof window !== 'undefined' ? window : globalThis));
