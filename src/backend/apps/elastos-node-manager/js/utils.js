/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * utils.js — shared frontend helpers.
 *
 * Loaded after strings.js (which defines window.enmT) but before any service
 * or component file. Centralizes the enmTOrFallback wrapper so we have one
 * source of truth for string lookup with a defensive fallback.
 */

(function (root) {
    'use strict';

    /**
     * Look up a string via window.enmT. If strings.js failed to load, return
     * the key unchanged so the UI is at least readable rather than blank.
     *
     * @param {string} key
     * @param {object} [vars]
     * @returns {string}
     */
    function enmTOrFallback(key, vars) {
        if (typeof root.enmT === 'function') {
            return root.enmT(key, vars);
        }
        return key;
    }

    /**
     * Pad an integer to two digits (e.g. 7 → "07"). Used by log timestamps.
     *
     * @param {number} n
     * @returns {string}
     */
    function pad2(n) {
        return n < 10 ? '0' + n : '' + n;
    }

    /**
     * Format a duration in seconds as the most useful unit.
     *
     * @param {number} seconds
     * @returns {string}
     */
    function formatUptime(seconds) {
        if (seconds == null || !isFinite(seconds)) { return '—'; }
        var s = Math.max(0, Math.floor(seconds));
        if (s < 60) { return s + 's'; }
        if (s < 3600) { return Math.floor(s / 60) + 'm'; }
        if (s < 86_400) {
            return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
        }
        var days = Math.floor(s / 86_400);
        var hours = Math.floor((s % 86_400) / 3600);
        return days + 'd ' + hours + 'h';
    }

    /**
     * Format a number with locale grouping. Returns the dash placeholder
     * for null / undefined / NaN / Infinity so the UI never prints raw
     * "NaN" or "Infinity" when the backend hiccups.
     *
     * @param {number} n
     * @param {{decimals?:number}} [opts]
     * @returns {string}
     */
    function formatNumber(n, opts) {
        if (n == null) { return '—'; }
        // alpha.28.1 batch 25 — coerce numeric strings via Number().
        // Backend contract drift is a real risk (the chain-card height
        // path already routes through Number(); audit a3e53e9a flagged
        // it as widespread). Doing the coercion at the helper level
        // means every caller (system-status disk, audit row count,
        // chain-card peers/latency/skew, etc.) is hardened with no
        // per-caller wrapper. `Number("943210")` → 943210; `Number("abc")`
        // → NaN which the isFinite guard catches.
        var num = (typeof n === 'number') ? n : Number(n);
        if (!isFinite(num)) { return '—'; }
        var decimals = (opts && typeof opts.decimals === 'number') ? opts.decimals : 0;
        return num.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        });
    }

    /**
     * Format a byte count with an adaptive unit. 2,150,000,000 → "2.0 GB".
     * Mirrors the dash placeholder rules from formatNumber.
     *
     * @param {number} bytes
     * @param {{precision?:number}} [opts]
     * @returns {string}
     */
    function formatBytes(bytes, opts) {
        if (bytes == null) { return '—'; }
        // alpha.28.1 batch 39 — mirror formatNumber: coerce numeric
        // strings via Number() so backend type drift doesn't surface
        // as "—". `Number("2150000000")` → 2150000000 → "2.0 GB".
        var n = (typeof bytes === 'number') ? bytes : Number(bytes);
        if (!isFinite(n)) { return '—'; }
        var precision = (opts && typeof opts.precision === 'number') ? opts.precision : 1;
        var abs = Math.abs(n);
        var units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        var i = 0;
        while (abs >= 1024 && i < units.length - 1) {
            abs /= 1024;
            i += 1;
        }
        var rounded = i === 0 ? Math.round(abs) : Number(abs.toFixed(precision));
        return (n < 0 ? '-' : '') + rounded.toLocaleString() + ' ' + units[i];
    }

    /**
     * Truncate a long opaque identifier (wallet, pubkey, tx hash) for
     * display while keeping enough head + tail to be recognizable.
     * Returns the original string when it already fits in head+tail+1.
     *
     * @param {string} s
     * @param {{head?:number,tail?:number}} [opts]
     * @returns {string}
     */
    function formatAddress(s, opts) {
        if (s == null) { return '—'; }
        var str = String(s);
        var head = (opts && typeof opts.head === 'number') ? opts.head : 6;
        var tail = (opts && typeof opts.tail === 'number') ? opts.tail : 4;
        if (str.length <= head + tail + 1) { return str; }
        return str.slice(0, head) + '…' + str.slice(-tail);
    }

    /**
     * Tri-state probe of `prefers-reduced-motion`. The CSS `*` catch-all
     * already neutralises every transition/animation under reduce-motion,
     * but JS timers carrying motion side effects (toast slide-out, drawer
     * close, attention pulses) still tick at their full duration. Call
     * this to shorten those waits to ~10ms when the user has asked for
     * less motion.
     *
     * Falsy in any environment that lacks matchMedia (older IE-like
     * shells, jsdom test sandboxes), so callers can treat the answer
     * as "assume full motion" without further branching.
     *
     * @returns {boolean}
     */
    function reducedMotion() {
        return !!(typeof root.matchMedia === 'function'
            && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    /**
     * Run an async click-handler exactly once at a time.
     *
     * The de facto guard around every mutating action in the app —
     * settings saves, chain start/stop, danger-zone Wipe, validator
     * Activate. Collapses the four duties every handler has to
     * implement by hand today:
     *   1. Refuse re-entry while a previous call is still in flight.
     *   2. Disable the trigger so the operator can't double-click it.
     *   3. Swap the label to something like "Saving…" when given.
     *   4. Restore label + disabled state when the promise settles.
     *
     * `fn` may return a promise or a synchronous value; the result is
     * wrapped in Promise.resolve so both paths converge on the same
     * finally cleanup.
     *
     * Returns a promise that resolves to `null` when the call was
     * refused (already in flight) so callers can short-circuit cleanly.
     *
     * @param {HTMLButtonElement} btn
     * @param {string|null}        runningLabel  optional "Saving…" override
     * @param {function:Promise=}  fn
     * @returns {Promise<any>}
     */
    function runOnce(btn, runningLabel, fn) {
        if (!btn || btn.dataset.busy === '1') { return Promise.resolve(null); }
        btn.dataset.busy = '1';
        var prevText = btn.textContent;
        var prevDisabled = btn.disabled;
        btn.disabled = true;
        if (runningLabel) { btn.textContent = runningLabel; }
        return Promise.resolve()
            .then(typeof fn === 'function' ? fn : function () { return null; })
            .finally(function () {
                btn.dataset.busy = '0';
                btn.disabled = prevDisabled;
                if (runningLabel) { btn.textContent = prevText; }
            });
    }

    /**
     * Schedule a recurring callback that automatically pauses when the
     * tab is backgrounded and snaps back to a fresh tick + cadence
     * when it returns to the foreground.
     *
     * Page Visibility audit (Round 16 a96c7d71) found 8 pollers
     * hammering the backend at full cadence while invisible (5000+
     * fetches/hr for a hidden dashboard). Components opt in by calling
     * enmUseVisibilityPause(fn, intervalMs) in mount() and storing the
     * returned handle's .stop() for destroy().
     *
     * Behaviour:
     *   - visible at start → runs setInterval(fn, intervalMs) normally
     *   - visibilitychange → hidden: clearInterval, no callback fires
     *   - visibilitychange → visible: fire `fn` once immediately
     *     (so the UI catches up after backgrounding), then re-arm
     *     setInterval at the same cadence
     *   - .stop() removes the visibilitychange listener and clears any
     *     pending interval (idempotent, safe to call after stop)
     *
     * @param {function():void} fn
     * @param {number} intervalMs
     * @returns {{stop: function():void}}
     */
    function useVisibilityPause(fn, intervalMs) {
        var timer = null;
        var stopped = false;
        function start() {
            if (stopped) { return; }
            if (timer != null) { return; }
            timer = setInterval(fn, intervalMs);
        }
        function pause() {
            if (timer != null) { clearInterval(timer); timer = null; }
        }
        function onVisChange() {
            if (stopped) { return; }
            if (typeof document !== 'undefined' && document.hidden) {
                pause();
            } else {
                // Catch up immediately on resume so the UI doesn't show
                // up-to-`intervalMs`-old data while waiting for the next
                // tick. Wrap in try so a throwing fn doesn't poison the
                // listener.
                try { fn(); } catch (_) { /* ignore */ }
                start();
            }
        }
        // Initial state — if we mount while hidden, start paused.
        if (typeof document !== 'undefined' && !document.hidden) {
            start();
        }
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
            document.addEventListener('visibilitychange', onVisChange);
        }
        return {
            stop: function () {
                stopped = true;
                pause();
                if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
                    document.removeEventListener('visibilitychange', onVisChange);
                }
            },
        };
    }

    /**
     * Format a server timestamp (ms since epoch) in one of three modes.
     * Three round audits (i18n / locale / numerical-edge) all flagged
     * that the codebase displays the same kind of timestamp four
     * different ways: audit-tab UTC ISO, log-viewer local HH:MM:SS,
     * tools-update relative, chain-card uptime counter. This helper
     * consolidates the three address-able formats; callers migrate
     * incrementally.
     *
     *   mode='iso'       — '2026-05-13 10:42:31 UTC' (canonical record)
     *   mode='local'     — operator's locale via toLocaleString
     *   mode='relative'  — '2 min ago' / 'just now' / '1 h ago'
     *
     * Returns '—' for null/undefined/NaN/Infinity so the UI never
     * prints raw 'NaN' or 'Invalid Date'.
     *
     * @param {number} ms  epoch milliseconds (numeric strings tolerated)
     * @param {{mode?:'iso'|'local'|'relative'}} [opts]
     * @returns {string}
     */
    function formatDate(ms, opts) {
        var n = (typeof ms === 'number') ? ms : Number(ms);
        if (n == null || !isFinite(n)) { return '—'; }
        var mode = (opts && opts.mode) || 'iso';
        try {
            var d = new Date(n);
            if (mode === 'local') {
                return d.toLocaleString();
            }
            if (mode === 'relative') {
                var diff = Math.max(0, Math.floor((Date.now() - n) / 1000));
                if (diff < 60)    { return 'just now'; }
                if (diff < 3600)  { return Math.floor(diff / 60) + ' min ago'; }
                if (diff < 86400) { return Math.floor(diff / 3600) + ' h ago'; }
                return Math.floor(diff / 86400) + ' d ago';
            }
            // default: iso with UTC suffix (canonical record format)
            return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
        } catch (e) {
            return '—';
        }
    }

    /**
     * Copy text to the clipboard with consistent feature-detect + operator
     * feedback. Round-6 clipboard-UX audit (a8a932d2) identified five copy
     * sites with three different "Copied!" confirmation patterns:
     *   - producer-identity (notifications-only)
     *   - setup-conversation (text-swap + select-fallback)
     *   - validator-registration-card (text-swap + select-fallback)
     *   - tools-update-card (text-swap + notifications fallback)
     *   - settings-tab credValueWithCopy (text-swap + select-fallback)
     * Same UX, five distinct codepaths. This helper is the single source of
     * truth for the feature-detect + writeText + result branching. Callers
     * supply policy via `opts` (which button to swap, which fallback to use)
     * but the clipboard-API plumbing is consolidated here.
     *
     * Behaviour:
     *   - Browser blocks clipboard          → onFallback() (caller supplies),
     *                                         resolves false
     *   - writeText() rejects               → onFallback() if given else
     *                                         notifications.warning, resolves
     *                                         false
     *   - writeText() resolves              → btn label swap (if given),
     *                                         notifications.info (if asked),
     *                                         onSuccess() (if given),
     *                                         resolves true
     *
     * The promise NEVER rejects — failure surfaces as resolve(false) so
     * callers can `.then(ok => ok && ...)` without try/catch ceremony.
     *
     * @param {string} text
     * @param {{
     *   btn?: HTMLButtonElement,
     *   copiedLabel?: string,
     *   resetMs?: number,
     *   notifications?: object,
     *   notifyOnSuccess?: boolean,
     *   successTitle?: string,
     *   successBody?: string,
     *   failTitle?: string,
     *   failBody?: string,
     *   onSuccess?: function():void,
     *   onFallback?: function():void
     * }} [opts]
     * @returns {Promise<boolean>}
     */
    function copyToClipboard(text, opts) {
        var o = opts || {};
        var btn = o.btn || null;
        var nf  = o.notifications || null;
        var failTitle = o.failTitle || 'Copy unavailable';
        var failBody  = o.failBody  || 'Browser blocked clipboard access. Select the value and press Ctrl-C (or ⌘-C on Mac).';
        var hasClipboard = !!(typeof navigator !== 'undefined'
            && navigator.clipboard
            && navigator.clipboard.writeText);
        function fallback() {
            if (typeof o.onFallback === 'function') {
                try { o.onFallback(); } catch (_) { /* swallow */ }
                return;
            }
            if (nf) { nf.warning(failTitle, failBody); }
        }
        if (!hasClipboard) {
            fallback();
            return Promise.resolve(false);
        }
        return navigator.clipboard.writeText(text).then(function () {
            if (btn) {
                // alpha.29 batch 106 — text-swap target can be a child
                // of the button (e.g. the aria-hidden visible span
                // enmCopyButton wraps the label in). Default to the
                // button itself for the existing direct-call sites.
                var swapEl = o.btnLabelEl || btn;
                var prev = swapEl.textContent;
                var copiedLabel = o.copiedLabel || 'Copied!';
                var resetMs = (typeof o.resetMs === 'number') ? o.resetMs : 1200;
                swapEl.textContent = copiedLabel;
                btn.dataset.copied = '1';
                // alpha.29 batch 105 (Round-35 finding #3, MED) —
                // race + lifecycle guards on the reset timer:
                // (a) back-to-back clicks used to queue two resets; the
                //     second one would race the first's prev capture
                //     and could revert to "Copied!" instead of "Copy".
                //     Track the latest timer on the button so a fresh
                //     click cancels the prior reset.
                // (b) If the button's parent re-renders (validator-card,
                //     setup-conversation both do this on state change)
                //     the timer fires on a detached node — silent
                //     wrong-state if a future pooled-DOM strategy
                //     reuses the node. isConnected guard skips the
                //     write entirely on detach.
                if (btn._enmResetTimer) { clearTimeout(btn._enmResetTimer); }
                btn._enmResetTimer = setTimeout(function () {
                    btn._enmResetTimer = null;
                    if (!btn.isConnected) { return; }
                    swapEl.textContent = prev;
                    delete btn.dataset.copied;
                }, resetMs);
            }
            if (o.notifyOnSuccess && nf) {
                nf.info(o.successTitle || 'Copied', o.successBody || '');
            }
            if (typeof o.onSuccess === 'function') {
                try { o.onSuccess(); } catch (_) { /* swallow */ }
            }
            return true;
        }, function () {
            fallback();
            return false;
        });
    }

    /**
     * EnmCopyButton — DOM-factory wrapper around enmCopyToClipboard.
     *
     * alpha.29 batch 96. Round-33 architectural triage flagged the
     * recurring boilerplate: every copy site (5 of them today —
     * producer-identity, settings-tab credValueWithCopy, setup-
     * conversation password, validator-registration-card, tools-update
     * modal) hand-builds the button markup with i18n aria-label + wires
     * its own click handler that calls enmCopyToClipboard. ~10-25 lines
     * of duplicate plumbing per site. Adding a new copy site (e.g. the
     * 4 missing sites flagged in audit a8a932d2: chain owner pubkey,
     * mismatch detail, audit executor cell, peer-summary host:port)
     * means re-inventing the same pattern again.
     *
     * This factory returns a fully-wired <button> ready to be appended.
     * Caller controls value resolution (a function so the value can be
     * captured fresh at click time, not snapshot at button-build time —
     * matters for the keystore-password copy that reads from a
     * dynamically-updated element). Optional `getDisplayEl` returns the
     * <code>/<span> whose contents should be range-selected on fallback.
     *
     * @param {{
     *   value: string | function():string,
     *   label?: string,                  // visible button text (default 'Copy')
     *   copiedLabel?: string,            // text-swap on success (default 'Copied!')
     *   ariaLabel?: string,              // explicit aria-label (default 'Copy ' + label)
     *   resetMs?: number,                // text-swap duration (default 1200)
     *   className?: string,              // additional CSS classes
     *   notifications?: object,          // notifications service
     *   getDisplayEl?: function():Element, // for select-text fallback
     *   failTitle?: string,              // i18n'd fallback title
     *   failBody?: string,               // i18n'd fallback body
     * }} opts
     * @returns {HTMLButtonElement}
     */
    function copyButton(opts) {
        if (!opts || (opts.value === undefined && typeof opts.value !== 'function')) {
            throw new TypeError('EnmCopyButton: { value } required');
        }
        var label = opts.label || 'Copy';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'enm-btn enm-btn-secondary' + (opts.className ? ' ' + opts.className : '');
        // alpha.29 batch 106 (Round-35 finding #5, MED) — wrap the
        // visible label in aria-hidden=true and put the stable
        // accessible name on the button. Previous shape used
        // textContent + aria-label, but a button without explicit
        // aria-hidden on its visible children gets both announced —
        // and when textContent swapped to "Copied!" then back to
        // "Copy", screen readers spoke the cadence "Copy. Copied!
        // Copy." on every action. Decoupling means the visible swap
        // is purely cosmetic; AT hears the stable aria-label only,
        // and the copy success is signaled by the announcer
        // (or a notifications.info toast) where callers wired it.
        var visible = document.createElement('span');
        visible.textContent = label;
        visible.setAttribute('aria-hidden', 'true');
        btn.appendChild(visible);
        btn.setAttribute('aria-label', opts.ariaLabel || ('Copy ' + label.toLowerCase()));
        btn.addEventListener('click', function () {
            var resolvedValue = (typeof opts.value === 'function')
                ? opts.value()
                : opts.value;
            if (resolvedValue == null || resolvedValue === '') { return; }
            root.enmCopyToClipboard(String(resolvedValue), {
                btn: btn,
                // batch 106 — swap the inner aria-hidden span's text,
                // not btn.textContent (which would wipe the span and
                // re-introduce the noisy SR cadence the wrap fixes).
                btnLabelEl: visible,
                copiedLabel: opts.copiedLabel || 'Copied!',
                resetMs: (typeof opts.resetMs === 'number') ? opts.resetMs : 1200,
                notifications: opts.notifications || null,
                failTitle: opts.failTitle,
                failBody: opts.failBody,
                onFallback: function () {
                    // If the caller pointed us at a display element,
                    // select its contents so Ctrl-C works manually.
                    if (typeof opts.getDisplayEl === 'function') {
                        try {
                            var el = opts.getDisplayEl();
                            if (el) {
                                var range = document.createRange();
                                range.selectNodeContents(el);
                                var sel = root.getSelection();
                                sel.removeAllRanges();
                                sel.addRange(range);
                            }
                        } catch (_) { /* manual triple-click is the fallback */ }
                    }
                    // Always show the toast on fallback (consistent with
                    // the validator-card + setup-conversation pattern
                    // from batches 87 + 88). Callers that don't want
                    // the toast can pass notifications=null.
                    if (opts.notifications) {
                        opts.notifications.warning(
                            opts.failTitle || 'Copy unavailable',
                            // 0.5.74 audit Session 74 — aligned with the
                            // copyToClipboard helper's default at L349
                            // (canonical Mac-parity wording from Session
                            // 49). Pre-0.5.74 the copyButton default
                            // claimed "The value is selected" but the
                            // selection only happens when the caller
                            // passes getDisplayEl — without it, the
                            // claim was false. All 6 current callers
                            // (node-identity-card / setup-conversation /
                            // validator-registration-card / settings-tab
                            // x2 / tools-update-card) override failBody
                            // or pass getDisplayEl, so the misleading
                            // default never fired in practice. Aligning
                            // both helpers' defaults so future callers
                            // get an honest default either way.
                            opts.failBody || 'Browser blocked clipboard access. Select the value and press Ctrl-C (or ⌘-C on Mac).'
                        );
                    }
                },
            });
        });
        return btn;
    }

    /**
     * Lazy-load a script by URL exactly once. Returns a promise that
     * resolves when the script has loaded (or already loaded) and
     * rejects on network/parse failure.
     *
     * alpha.29 batch 103. Round-33 architectural triage item #4
     * recommended deferring tab-specific JS (audit-tab 378 lines,
     * evm-tab 72, technical-view 680, settings-tab 1554, settings-
     * drawer 418 = ~3100 LOC, ~25% of the initial parse budget) until
     * the operator actually opens the tab. Helper-level caching keeps
     * a singleton promise per URL so concurrent tab activations don't
     * race two <script> tags into the DOM.
     *
     * @param {string} src  URL of the script to load (including any
     *                      ?ts= cache-bust query)
     * @returns {Promise<void>}
     */
    function loadScript(src) {
        if (!loadScript._cache) { loadScript._cache = new Map(); }
        if (loadScript._cache.has(src)) {
            return loadScript._cache.get(src);
        }
        var p = new Promise(function (resolve, reject) {
            // Defensive: a same-src script already in the DOM (e.g.
            // index.html ships it eagerly, or a previous resolved
            // load) — treat as resolved.
            var existing = document.querySelector('script[src="' + src + '"]');
            if (existing) {
                resolve();
                return;
            }
            var s = document.createElement('script');
            s.src = src;
            s.async = false; // preserve load order if multiple are batched
            s.onload = function () { resolve(); };
            s.onerror = function () {
                reject(new Error('Failed to load ' + src));
            };
            document.head.appendChild(s);
        });
        // alpha.29 batch 113 (Round-37 finding #1, HIGH) — evict
        // rejected promises from the cache so a transient load
        // failure (offline, slow network, 5xx) doesn't permanently
        // poison the lazy-load path for that script. Previous shape
        // cached the rejection forever: operator opens Audit while
        // wifi is flaky → script fails → cached rejection → every
        // subsequent re-open hits the cache and gets the same
        // "failed to load, refresh" stub, even after wifi recovers.
        // The exact scenario EnmOnlineWatcher exists to handle.
        // Chain a .catch that deletes the cache entry then re-throws
        // so awaiting callers still see the rejection on this attempt
        // but the NEXT call retries the network.
        var cached = p.catch(function (err) {
            if (loadScript._cache.get(src) === cached) {
                loadScript._cache.delete(src);
            }
            throw err;
        });
        loadScript._cache.set(src, cached);
        return cached;
    }

    root.enmTOrFallback = enmTOrFallback;
    root.enmPad2 = pad2;
    root.enmFormatUptime = formatUptime;
    root.enmFormatNumber = formatNumber;
    root.enmFormatBytes = formatBytes;
    root.enmFormatAddress = formatAddress;
    root.enmFormatDate = formatDate;
    root.enmReducedMotion = reducedMotion;
    root.enmRunOnce = runOnce;
    root.enmUseVisibilityPause = useVisibilityPause;
    root.enmCopyToClipboard = copyToClipboard;
    root.enmCopyButton = copyButton;
    root.enmLoadScript = loadScript;
    // v0.5.189 (P1.6) — single source of truth for the chainId → class map
    // (A=mainchain, B=EVM sidechain, C=oracle, D=arbiter/cross-chain, E=SPV).
    // Mirrors the backend ChainAdapter.CHAIN_ID_TO_CLASS. Was duplicated verbatim
    // in app.js (×2), settings-tab.js and chain-card.js; consolidated here so chains
    // are added in ONE place. utils.js loads before every consumer (index.html), so
    // module-scope references resolve safely.
    root.enmChainClass = Object.freeze({
        mainchain: 'A',
        esc: 'B', eid: 'B', pg: 'B',
        'esc-oracle': 'C', 'eid-oracle': 'C', 'pg-oracle': 'C',
        arbiter: 'D',
        spv: 'E',
    });
    root.enmChainClassFor = function (chainId) {
        return root.enmChainClass[chainId] || null;
    };
}(typeof window !== 'undefined' ? window : globalThis));
