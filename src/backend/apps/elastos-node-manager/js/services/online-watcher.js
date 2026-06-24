/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * services/online-watcher.js — operator-visible offline + recovery banner.
 *
 * alpha.29 batch 98 (Round-33 architectural triage, item #3). Today
 * `navigator.onLine` is consulted ONCE inside app.js's error-pane
 * branch (the message reads "Looks like your network is offline"
 * iff a fetch fails AND navigator.onLine is false at the moment of
 * the error). If the operator was already on the dashboard when wifi
 * dropped — laptop sleep, captive portal, VPN drop — they see SSE
 * stop with no explanation; chain-card pills go silent; backend
 * fetches start failing one-by-one across the next minute. No
 * coherent "you're offline" signal until something forces a re-render.
 *
 * This service:
 *   1. Subscribes to window `online` + `offline` events at mount.
 *   2. Renders a persistent banner above the tab strip while offline,
 *      with a "Retry now" button that re-fires the current pane's
 *      refresh path.
 *   3. On `online`: fades the banner out, fires an immediate refresh
 *      via the consumer's refresh callback, and announces "Connection
 *      restored" via enmAnnouncer.
 *   4. Stays silent when navigator.onLine is true at mount; only the
 *      transition matters.
 *
 * The banner sits above the tab strip so it doesn't compete with
 * existing in-pane status indicators (chain-card pill, log-viewer
 * pill); they keep showing their per-feature state, while the banner
 * carries the page-level "you're disconnected" signal.
 *
 * Behaviour matrix:
 *   navigator.onLine === true  at boot → silent
 *   transition online → offline       → banner appears, role=alert
 *   transition offline → online       → banner fades, polite announce,
 *                                       refresh callback fires
 *
 * Not a replacement for SSE backoff or fetch retry — those handle
 * server-side outages. This is specifically about client-side network
 * loss (laptop sleep, wifi drop, VPN flap).
 */

(function (root) {
    'use strict';

    function EnmOnlineWatcher() {
        this._banner = null;
        this._retryBtn = null;
        this._onlineHandler = null;
        this._offlineHandler = null;
        this._refreshCb = null;
        this._mounted = false;
    }

    /**
     * Install window listeners + create the banner DOM. The banner is
     * inserted at the top of document.body (above the app shell) and
     * stays `hidden` until the offline transition fires.
     *
     * @param {object} opts
     * @param {function():void} [opts.onRetry]  — called on Retry click +
     *                                            on the offline→online
     *                                            transition. Typically
     *                                            the consumer passes
     *                                            self.refresh() or
     *                                            self._refreshActivePane.
     * @param {object} [opts.announcer]  — EnmAnnouncer (or compatible).
     *                                     Used for the "Connection
     *                                     restored" polite announcement.
     */
    EnmOnlineWatcher.prototype.mount = function (opts) {
        if (this._mounted) { return this; }
        if (typeof document === 'undefined' || !document.body) { return this; }
        this._refreshCb = (opts && typeof opts.onRetry === 'function') ? opts.onRetry : null;
        this._announcer = (opts && opts.announcer) || root.enmAnnouncer || null;
        this._t = (typeof root.enmTOrFallback === 'function')
            ? root.enmTOrFallback
            : function (key) { return key; };

        this._banner = document.createElement('div');
        this._banner.className = 'enm-online-banner';
        // role=alert ONLY while offline so a screen reader gets the
        // immediate notification; we drop the role on transition back
        // to online so the "Connection restored" line goes through
        // enmAnnouncer.polite instead.
        this._banner.hidden = true;

        var msg = document.createElement('span');
        msg.className = 'enm-online-banner-msg';
        msg.textContent = this._t('app.offline_banner');
        if (!msg.textContent || msg.textContent === 'app.offline_banner') {
            msg.textContent = 'You appear to be offline. The dashboard will refresh when your connection returns.';
        }
        this._banner.appendChild(msg);

        this._retryBtn = document.createElement('button');
        this._retryBtn.type = 'button';
        this._retryBtn.className = 'enm-btn enm-btn-secondary enm-online-banner-retry';
        var retryLabel = this._t('app.offline_retry');
        this._retryBtn.textContent = (retryLabel && retryLabel !== 'app.offline_retry')
            ? retryLabel : 'Retry now';
        var self = this;
        this._retryBtn.addEventListener('click', function () {
            if (typeof self._refreshCb === 'function') {
                try { self._refreshCb(); } catch (_) { /* ignore */ }
            }
        });
        this._banner.appendChild(this._retryBtn);

        // Insert as the FIRST child of body so it stacks above the
        // app shell visually (CSS will style position/colour later;
        // for now it's an unstyled banner — visible enough for SR
        // notification + the operator-visible retry affordance).
        document.body.insertBefore(this._banner, document.body.firstChild);

        // Window event subscriptions. Singleton guard via flag on root
        // so a hot-reloaded init() doesn't stack listeners (same
        // pattern as the BroadcastChannel guard in app.js).
        this._onlineHandler  = function () { self._onTransition(true); };
        this._offlineHandler = function () { self._onTransition(false); };
        root.addEventListener('online',  this._onlineHandler);
        root.addEventListener('offline', this._offlineHandler);

        // Initial state — if we're already offline at mount, show the
        // banner immediately. Only the transition matters for the
        // online side.
        if (typeof root.navigator !== 'undefined' && root.navigator.onLine === false) {
            this._onTransition(false);
        }

        this._mounted = true;
        return this;
    };

    /** @private */
    EnmOnlineWatcher.prototype._onTransition = function (isOnline) {
        if (!this._banner) { return; }
        var self = this;
        // alpha.29 batch 110 (Round-36 finding #1, HIGH) — cancel any
        // pending deferred role-removal timer at the top of every
        // transition. Without this, a rapid online → offline → online
        // → offline flap could land like this:
        //   T0: offline → role=alert, banner shown
        //   T1: online  → setTimeout(0) queued to strip role
        //   T2: offline → role=alert reset (banner re-shown)
        //   T3: pending timer from T1 fires → strips role=alert
        //         from the freshly-re-shown banner
        // Net effect: banner is operator-visible but AT-silent. The
        // _lastFocus = null at the end of the timer also clobbered the
        // T2-captured focus target. Cancel-and-rebind defeats both.
        if (this._pendingRoleRemoveTimer) {
            clearTimeout(this._pendingRoleRemoveTimer);
            this._pendingRoleRemoveTimer = null;
        }
        if (isOnline) {
            // alpha.29 batch 104 (Round-35 finding #2, HIGH) — defer
            // the role=alert removal by one macrotask so any in-flight
            // AT readout of the banner can complete cleanly. The
            // previous shape stripped role + hid + announced in one
            // sync block; if NVDA/JAWS was mid-utterance of the
            // offline message, the role removal truncated the readout
            // AND the polite announce collided with the still-buffered
            // alert text.
            // New order:
            //   1. hide visually (sync — operator sees recovery quickly)
            //   2. polite-announce "Connection restored" via the shared
            //      announcer (a separate live region, so it doesn't
            //      contend with the banner's role=alert region)
            //   3. fire the refresh callback (sync)
            //   4. setTimeout(0) → remove role=alert AFTER the current
            //      macrotask completes, allowing the AT to finish any
            //      in-flight utterance.
            // Also: restore focus if the Retry button had it. Without
            // this fix, focus fell to document.body (no visible
            // indicator) and keyboard operators lost their place.
            // (Round-35 finding #6, LOW — bundled here since same path.)
            var retryHadFocus = (document.activeElement === this._retryBtn);
            this._banner.hidden = true;
            if (this._announcer && typeof this._announcer.polite === 'function') {
                var msg = this._t('app.online_restored');
                if (!msg || msg === 'app.online_restored') {
                    msg = 'Connection restored. Refreshing data.';
                }
                this._announcer.polite(msg);
            }
            if (typeof this._refreshCb === 'function') {
                try { this._refreshCb(); } catch (_) { /* ignore */ }
            }
            this._pendingRoleRemoveTimer = setTimeout(function () {
                self._pendingRoleRemoveTimer = null;
                // Belt-and-braces: if a subsequent offline transition
                // already re-shown the banner, DON'T strip its role —
                // even though the offline branch's clearTimeout above
                // should have cancelled this timer first. Guarding here
                // costs nothing and defends against an edge where the
                // timer queue's clearTimeout was processed AFTER this
                // callback was dequeued (theoretically possible in
                // some runtimes).
                if (self._banner && self._banner.hidden) {
                    self._banner.removeAttribute('role');
                }
                // alpha.29 batch 113 (Round-37 finding #3, LOW) —
                // restore _lastFocus UNCONDITIONALLY on recovery, not
                // just when the Retry button held focus. The much
                // more common scenario: operator was typing in a
                // chip-input / settings field when wifi dropped; the
                // offline transition captured that input as
                // _lastFocus; recovery should put the operator back
                // where they were. Previous shape only restored when
                // retryHadFocus was true, making the capture a
                // bookkeeping no-op in ~95% of real flows.
                var target = self._lastFocus
                    && typeof self._lastFocus.focus === 'function'
                    && document.contains(self._lastFocus)
                    ? self._lastFocus
                    : null;
                if (target) {
                    try { target.focus({ preventScroll: true }); }
                    catch (_) { /* element may be in a weird state — ignore */ }
                }
                self._lastFocus = null;
            }, 0);
        } else {
            // Capture focus target BEFORE showing the banner so we can
            // restore it on recovery (Round-35 finding #6).
            this._lastFocus = document.activeElement;
            this._banner.hidden = false;
            // role=alert so AT picks up the change immediately. We
            // don't use enmAnnouncer.assertive here because the banner
            // is the operator-visible signal AND the AT signal in one
            // — wiring both would double-announce.
            this._banner.setAttribute('role', 'alert');
        }
    };

    /**
     * Tear down. Removes both window listeners and the banner DOM.
     * Idempotent — a second call is a no-op.
     */
    EnmOnlineWatcher.prototype.destroy = function () {
        // batch 110 — cancel any pending deferred role-removal timer
        // so a teardown mid-recovery doesn't leak the closure or
        // touch a now-removed banner.
        if (this._pendingRoleRemoveTimer) {
            clearTimeout(this._pendingRoleRemoveTimer);
            this._pendingRoleRemoveTimer = null;
        }
        if (this._onlineHandler) {
            root.removeEventListener('online', this._onlineHandler);
            this._onlineHandler = null;
        }
        if (this._offlineHandler) {
            root.removeEventListener('offline', this._offlineHandler);
            this._offlineHandler = null;
        }
        if (this._banner && this._banner.parentNode) {
            this._banner.parentNode.removeChild(this._banner);
        }
        this._banner = null;
        this._retryBtn = null;
        this._refreshCb = null;
        this._lastFocus = null;
        this._mounted = false;
    };

    root.EnmOnlineWatcher = EnmOnlineWatcher;
    root.enmOnlineWatcher = new EnmOnlineWatcher();
}(typeof window !== 'undefined' ? window : globalThis));
