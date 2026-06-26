/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * services/notifications.js — Toast notifications service for ENM Beta 3.
 *
 * Beta 3 rewrites the toast DOM to match enm-design-mocks/v2/phase-06's
 * `.toast-container > .toast[data-sev]` shape. Severity is communicated
 * visually by a 3px left border (info=accent, warning=warning,
 * critical=error + subtle bg gradient, healing=success). No icons in
 * the head; the border IS the indicator (works under forced-colors too).
 *
 * Severity tiers:
 *   info     — auto-dismiss 5s, accent border
 *   warning  — manual dismiss, warning border
 *   critical — manual dismiss, error border + bg tint, role="alert",
 *              optional Acknowledge button when onAck supplied
 *   healing  — manual dismiss, success border
 *
 * Stack: newest at bottom of column (flex column appends to end), cap
 * at MAX_VISIBLE. Sixth-and-onward arrivals drop the oldest toast and
 * fire its onDismiss callback if any.
 *
 * Public API (preserved across the alpha.28 → Beta 3 transition):
 *   show({ id, severity, title, body, onAck, onDismiss, durationMs })
 *   info(title, body, opts)
 *   warning(title, body, opts)
 *   critical(title, body, opts)
 *   healing(title, body, opts)
 *   dismiss(id)
 *   clear()
 *   mount(parent)
 *   destroy()
 *
 * Dedup-by-id (alpha.28.1 batch 19): show() with an id that already
 * exists updates the visible toast in place — refreshes title/body/ack
 * and restarts the auto-dismiss timer if applicable. The DOM node is
 * not recreated, so focus + screen-reader announcement state survive.
 *
 * enmCopyToClipboard fallback contract (alpha.29 batch 87): callers
 * pass this service in as opts.notifications. On clipboard rejection
 * utils.copyToClipboard calls notifications.warning(failTitle, failBody).
 * Preserved verbatim — the .warning(title, body) sugar wrapper still
 * resolves to show({ severity:'warning', title, body }).
 */

(function (root) {
    'use strict';

    var MAX_VISIBLE = 5;
    var INFO_AUTODISMISS_MS = 5000;
    var LEAVE_MS = 200;
    var LEAVE_MS_REDUCED_MOTION = 10;

    /**
     * Construct a notifications service.
     *
     * @param {object} [opts]
     * @param {HTMLElement} [opts.parent]    Mount point (default: document.body)
     * @param {string}      [opts.containerId] DOM id for the container element
     */
    function Notifications(opts) {
        opts = opts || {};
        this._items = [];           // [{ id, node, severity, timerId, onDismiss }]
        this._counter = 0;
        this._destroyed = false;
        this._containerId = opts.containerId || 'enm-toast-container';
        this.container = null;
        this.mount(opts.parent);
    }

    /**
     * Mount (or re-mount) the container under `parent`. Idempotent: if
     * the container already exists under the same parent this is a no-op.
     *
     * @param {HTMLElement} [parent]
     */
    Notifications.prototype.mount = function (parent) {
        if (this._destroyed) { return; }
        var host = parent || document.body;
        if (this.container && this.container.parentNode === host) {
            return;
        }
        if (!this.container) {
            this.container = buildContainer(this._containerId);
        }
        host.appendChild(this.container);
    };

    /**
     * Show a toast. If `id` matches an existing toast the existing node
     * is updated in place (title/body/ack swapped, auto-dismiss timer
     * restarted) instead of being replaced — preserves focus + AT state.
     *
     * @param {object} args
     * @param {'info'|'warning'|'critical'|'healing'} args.severity
     * @param {string} args.title
     * @param {string} [args.body]
     * @param {string} [args.id]              Stable id for dedup
     * @param {() => void} [args.onAck]        Critical only: renders Acknowledge button
     * @param {() => void} [args.onDismiss]    Fired when the toast leaves the screen
     * @param {number} [args.durationMs]       Override auto-dismiss (info defaults to 5000)
     * @returns {string}                       The toast id
     */
    Notifications.prototype.show = function (args) {
        if (this._destroyed) { return null; }
        if (!args || !args.severity || !args.title) {
            throw new TypeError('Notifications.show: { severity, title } required');
        }
        if (!isKnownSeverity(args.severity)) {
            throw new TypeError('Notifications.show: severity must be info|warning|critical|healing');
        }

        var id = args.id || ('enm-toast-' + (++this._counter));
        var existing = findItem(this._items, id);
        if (existing) {
            updateInPlace(existing, args, this);
            return id;
        }

        var node = renderToast(id, args, this);
        this.container.appendChild(node);
        var item = {
            id: id,
            node: node,
            severity: args.severity,
            timerId: null,
            onDismiss: typeof args.onDismiss === 'function' ? args.onDismiss : null,
        };
        this._items.push(item);
        this._trimVisible();
        scheduleAutoDismiss(item, args, this);
        return id;
    };

    /** Sugar wrapper: info toast (auto-dismiss 5s). */
    Notifications.prototype.info = function (title, body, opts) {
        return this.show(mergeSugar('info', title, body, opts));
    };

    /** Sugar wrapper: warning toast (manual dismiss). */
    Notifications.prototype.warning = function (title, body, opts) {
        return this.show(mergeSugar('warning', title, body, opts));
    };

    /** Sugar wrapper: critical toast (manual dismiss; role=alert; optional ack button). */
    Notifications.prototype.critical = function (title, body, opts) {
        return this.show(mergeSugar('critical', title, body, opts));
    };

    /** Sugar wrapper: healing toast (manual dismiss). */
    Notifications.prototype.healing = function (title, body, opts) {
        return this.show(mergeSugar('healing', title, body, opts));
    };

    /**
     * Dismiss a toast by id. Silently no-ops if the id is not visible.
     * Fires the toast's onDismiss callback (if any) after the leave
     * transition completes.
     */
    Notifications.prototype.dismiss = function (id) {
        var idx = findIndex(this._items, id);
        if (idx < 0) { return; }
        var item = this._items[idx];
        this._items.splice(idx, 1);
        removeWithLeave(item);
    };

    /**
     * Dismiss every visible toast. Each one's onDismiss callback fires.
     */
    Notifications.prototype.clear = function () {
        var items = this._items.slice();
        this._items.length = 0;
        for (var i = 0; i < items.length; i += 1) {
            removeWithLeave(items[i]);
        }
    };

    /**
     * Tear down the service. Clears all toasts, removes the container
     * from the DOM, and prevents further show() calls.
     */
    Notifications.prototype.destroy = function () {
        if (this._destroyed) { return; }
        // Cancel any pending auto-dismiss timers before clearing the
        // items array so timers fire against a stable reference set
        // (otherwise a 4.99s-into-its-life info toast could fire its
        // timer mid-destroy and try to splice from an emptied list).
        for (var i = 0; i < this._items.length; i += 1) {
            if (this._items[i].timerId != null) {
                clearTimeout(this._items[i].timerId);
                this._items[i].timerId = null;
            }
        }
        this.clear();
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.container = null;
        this._destroyed = true;
    };

    /* ─── internals ────────────────────────────────────────────── */

    /** @private Severity-overflow trim. Spec: drop oldest, fire onDismiss. */
    Notifications.prototype._trimVisible = function () {
        while (this._items.length > MAX_VISIBLE) {
            var dropped = this._items.shift();
            removeWithLeave(dropped);
        }
    };

    /**
     * @private
     * Build the container element. We don't append to the DOM here;
     * mount() owns parent attachment so the constructor can defer that
     * until a parent is known.
     */
    function buildContainer(id) {
        // Defensive: re-use any pre-existing container (e.g. boot-time
        // script ran twice, or the host page hand-stamped one). Honour
        // the same id so callers that hand us a parent can also seed
        // a container if they want.
        var existing = document.getElementById(id);
        if (existing) {
            ensureContainerAttrs(existing);
            return existing;
        }
        var el = document.createElement('div');
        el.id = id;
        el.className = 'enm-toast-container';
        ensureContainerAttrs(el);
        return el;
    }

    /**
     * @private
     * Apply (or re-apply) the container's accessibility attributes.
     * Spec: role=region, aria-live=polite, aria-label=Notifications.
     *
     * Pairing aria-live="polite" on the region with role="alert" on
     * critical toasts is intentional. Modern NVDA + JAWS + VoiceOver
     * handle this fine — they prefer the more-specific inner role.
     * Earlier ENM versions stripped aria-live to avoid a Safari/NVDA
     * double-announcement we saw in 2026, but that browser/AT combo
     * has since been validated clean and the Beta 3 mock + plan call
     * for the polite region. If a regression resurfaces, the fix is
     * to drop the inner role=alert on critical (still announced via
     * the polite region) rather than to strip aria-live again — the
     * region is what gives info/warning/healing AT support at all.
     */
    function ensureContainerAttrs(el) {
        el.setAttribute('role', 'region');
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-label', 'Notifications');
    }

    /**
     * @private
     * Render a fresh toast node. Beta 3 emits the phase-06 contract
     * exactly: .enm-toast > .enm-toast-head (.enm-toast-title + dismiss)
     * + optional .enm-toast-body + optional .enm-toast-ack (critical).
     */
    function renderToast(id, args, parent) {
        var sev = args.severity;
        var node = document.createElement('div');
        node.id = id;
        node.className = 'enm-toast';
        node.setAttribute('data-sev', sev);
        node.setAttribute('role', sev === 'critical' ? 'alert' : 'status');
        // Make the toast itself programmatically-focusable so keyboard
        // users can Tab into a critical alert and read it; pair with
        // an Esc-to-dismiss handler scoped to the toast so the
        // operator doesn't need to hunt for the dismiss button.
        // (Preserved from alpha.28 batch 38 a11y work.)
        node.setAttribute('tabindex', '-1');
        node.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape') {
                ev.stopPropagation();
                parent.dismiss(id);
            }
        });

        var head = document.createElement('div');
        head.className = 'enm-toast-head';

        var title = document.createElement('span');
        title.className = 'enm-toast-title';
        appendTitleContent(title, args.title, sev);
        head.appendChild(title);

        var dismissBtn = buildDismissButton(function () { parent.dismiss(id); });
        head.appendChild(dismissBtn);
        node.appendChild(head);

        if (args.body) {
            var body = document.createElement('p');
            body.className = 'enm-toast-body';
            body.textContent = args.body;
            node.appendChild(body);
        }

        if (sev === 'critical' && typeof args.onAck === 'function') {
            node.appendChild(buildAckButton(args.onAck, function () {
                parent.dismiss(id);
            }));
        }

        return node;
    }

    /**
     * @private
     * Update an existing toast's content + reset its auto-dismiss timer.
     * Keeps the same DOM node so focus / SR-announcement state survive.
     */
    function updateInPlace(item, args, parent) {
        var node = item.node;
        var sev = args.severity;
        // Severity can change on update (e.g. an info "Saving…" toast
        // dedup-id "save-config" upgrading to warning "Save failed").
        // Refresh the role + data-sev so the visual + AT class swap.
        node.setAttribute('data-sev', sev);
        node.setAttribute('role', sev === 'critical' ? 'alert' : 'status');
        item.severity = sev;
        if (typeof args.onDismiss === 'function') {
            item.onDismiss = args.onDismiss;
        }

        // Title: clear inner content + re-apply (SR severity prefix may
        // have changed if severity flipped).
        var title = node.querySelector('.enm-toast-title');
        if (title) {
            while (title.firstChild) { title.removeChild(title.firstChild); }
            appendTitleContent(title, args.title, sev);
        }

        // Body: create / update / remove to mirror the new args shape.
        var body = node.querySelector('.enm-toast-body');
        if (args.body) {
            if (!body) {
                body = document.createElement('p');
                body.className = 'enm-toast-body';
                // Insert after head so DOM order stays head → body → ack.
                var head = node.querySelector('.enm-toast-head');
                if (head && head.nextSibling) {
                    node.insertBefore(body, head.nextSibling);
                } else {
                    node.appendChild(body);
                }
            }
            body.textContent = args.body;
        } else if (body) {
            node.removeChild(body);
        }

        // Ack button: same create / update / remove pattern. Only valid
        // for critical severity with an onAck callback.
        var existingAck = node.querySelector('.enm-toast-ack');
        if (sev === 'critical' && typeof args.onAck === 'function') {
            // Always rebuild — the click handler is a closure over the
            // latest onAck, and reusing the old button would call the
            // previous onAck reference.
            if (existingAck) { node.removeChild(existingAck); }
            node.appendChild(buildAckButton(args.onAck, function () {
                parent.dismiss(item.id);
            }));
        } else if (existingAck) {
            node.removeChild(existingAck);
        }

        // Restart the auto-dismiss timer (severity may have changed
        // from info → warning, which should now persist; or vice versa,
        // which should now auto-dismiss).
        if (item.timerId != null) {
            clearTimeout(item.timerId);
            item.timerId = null;
        }
        scheduleAutoDismiss(item, args, parent);
    }

    /**
     * @private
     * Append the visible title text to the title span, prefixed by an
     * .enm-sr-only severity word (alpha.28 batch 38 — WCAG 1.4.1: the
     * visual severity stripe is invisible to screen readers, so we
     * read out "Notice: ", "Warning: ", "Critical: ", "Action needed: "
     * before the human title). The SR span is visually hidden — this
     * is NOT one of the head icons the mock spec prohibits.
     */
    function appendTitleContent(titleEl, titleText, sev) {
        var t = root.enmTOrFallback;
        var srWord = null;
        if (typeof t === 'function') {
            var key = 'notification.sr_' + sev;
            var resolved = t(key);
            if (resolved && resolved !== key) {
                srWord = resolved;
            }
        }
        if (!srWord) {
            srWord = ({
                info:     'Notice',
                warning:  'Warning',
                critical: 'Critical',
                healing:  'Action needed',
            })[sev] || 'Notice';
        }
        var srTag = document.createElement('span');
        srTag.className = 'enm-sr-only';
        srTag.textContent = srWord + ': ';
        titleEl.appendChild(srTag);
        titleEl.appendChild(document.createTextNode(titleText));
    }

    /**
     * @private
     * Build the head dismiss button. WCAG 2.5.5: 24×24 minimum touch
     * target. The inline width/height/min-width/min-height styles below
     * are intentional defensive fallbacks for the case where styles.css
     * hasn't yet sized .enm-toast-dismiss — they keep the touch target
     * legal even before CSS lands.
     */
    function buildDismissButton(onClick) {
        var t = root.enmTOrFallback;
        var label = (typeof t === 'function' ? t('notification.dismiss') : 'Dismiss');
        if (!label || label === 'notification.dismiss') { label = 'Dismiss'; }
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'enm-toast-dismiss';
        btn.setAttribute('aria-label', label);
        // U+00D7 MULTIPLICATION SIGN — same glyph the phase-06 mock
        // uses in its .toast-dismiss buttons.
        btn.textContent = '×';
        btn.style.minWidth = '24px';
        btn.style.minHeight = '24px';
        btn.addEventListener('click', onClick);
        return btn;
    }

    /**
     * @private
     * Build the optional Acknowledge button (critical toasts only).
     * Clicking fires the caller's onAck then dismisses the toast.
     * Wrapped in a single button — no surrounding container — so it
     * sits directly under .enm-toast-body matching the phase-06 DOM.
     */
    function buildAckButton(onAck, onAfter) {
        var t = root.enmTOrFallback;
        var label = (typeof t === 'function' ? t('notification.ack') : 'Acknowledge');
        if (!label || label === 'notification.ack') { label = 'Acknowledge'; }
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'enm-toast-ack';
        btn.textContent = label;
        btn.addEventListener('click', function () {
            try { onAck(); } catch (_) { /* host callback threw — still dismiss */ }
            onAfter();
        });
        return btn;
    }

    /**
     * @private
     * Schedule auto-dismiss for the toast. Info defaults to 5s; other
     * severities persist unless the caller passes an explicit
     * durationMs. A durationMs of 0 means "no auto-dismiss".
     */
    function scheduleAutoDismiss(item, args, parent) {
        var duration = computeDuration(args);
        if (duration <= 0) { return; }
        item.timerId = setTimeout(function () {
            item.timerId = null;
            parent.dismiss(item.id);
        }, duration);
    }

    /**
     * @private
     * Resolve the auto-dismiss duration for a show() call.
     *   - Explicit durationMs (including 0) wins.
     *   - Otherwise info defaults to INFO_AUTODISMISS_MS.
     *   - Otherwise no auto-dismiss.
     */
    function computeDuration(args) {
        if (typeof args.durationMs === 'number' && !isNaN(args.durationMs)) {
            return args.durationMs < 0 ? 0 : args.durationMs;
        }
        return args.severity === 'info' ? INFO_AUTODISMISS_MS : 0;
    }

    /**
     * @private
     * Remove a toast from the DOM with a short leave transition (or
     * near-instantly under prefers-reduced-motion). Fires onDismiss
     * after the node is actually detached.
     */
    function removeWithLeave(item) {
        if (item.timerId != null) {
            clearTimeout(item.timerId);
            item.timerId = null;
        }
        var node = item.node;
        if (node) {
            node.classList.add('enm-toast-leaving');
        }
        var reduceMotion = (typeof root.enmReducedMotion === 'function')
            ? root.enmReducedMotion()
            : false;
        var hideMs = reduceMotion ? LEAVE_MS_REDUCED_MOTION : LEAVE_MS;
        setTimeout(function () {
            if (node && node.parentNode) {
                node.parentNode.removeChild(node);
            }
            if (typeof item.onDismiss === 'function') {
                try { item.onDismiss(); } catch (_) { /* host hook threw */ }
            }
        }, hideMs);
    }

    /**
     * @private
     * Resolve the show() args for the .info/.warning/.critical/.healing
     * sugar wrappers. Callers can pass an optional third opts object
     * to supply id / onAck / onDismiss / durationMs (used by, e.g.,
     * proposal-card to pin a critical toast with a stable id).
     */
    function mergeSugar(severity, title, body, opts) {
        var merged = { severity: severity, title: title, body: body };
        if (opts && typeof opts === 'object') {
            if (opts.id != null)          { merged.id          = opts.id; }
            if (opts.onAck != null)       { merged.onAck       = opts.onAck; }
            if (opts.onDismiss != null)   { merged.onDismiss   = opts.onDismiss; }
            if (opts.durationMs != null)  { merged.durationMs  = opts.durationMs; }
        }
        return merged;
    }

    function isKnownSeverity(sev) {
        return sev === 'info' || sev === 'warning' || sev === 'critical' || sev === 'healing';
    }

    function findItem(items, id) {
        for (var i = 0; i < items.length; i += 1) {
            if (items[i].id === id) { return items[i]; }
        }
        return null;
    }

    function findIndex(items, id) {
        for (var i = 0; i < items.length; i += 1) {
            if (items[i].id === id) { return i; }
        }
        return -1;
    }

    root.EnmNotifications = Notifications;
}(typeof window !== 'undefined' ? window : globalThis));
