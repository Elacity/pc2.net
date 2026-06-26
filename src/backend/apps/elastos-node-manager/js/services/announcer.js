/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * services/announcer.js — unified screen-reader announcer.
 *
 * alpha.29 batch 97 (Round-33 architectural triage, item #2). Until
 * this lands, components that wanted to surface a message to assistive
 * technology had to either:
 *   (a) render their own role="status" or role="alert" region, OR
 *   (b) fire a toast via EnmNotifications
 * Each component-local live region carries its own lifecycle + ARIA
 * boilerplate; (b) is too heavyweight for transient status updates
 * the operator shouldn't see visually (e.g. "Saved", "Settings
 * refreshed", "Theme switched to dark").
 *
 * EnmAnnouncer mounts a single hidden live region at boot. Any code
 * can call enmAnnouncer.polite(msg) / .assertive(msg). The container
 * is hidden visually (enm-sr-only) so it only manifests as a
 * screen-reader announcement.
 *
 * Why two regions? Pairing role="status" + role="alert" allows
 * polite-vs-assertive priority without one queue stomping the other.
 * Some screen readers (older NVDA, Safari) double-announce when a
 * single region carries both an aria-live attribute and a role, so
 * we use role-only and rely on the implicit aria-live mapping
 * (status=polite, alert=assertive).
 *
 * Usage:
 *   root.enmAnnouncer.polite('Settings saved');
 *   root.enmAnnouncer.assertive('Chain stopped unexpectedly');
 *
 * Same-message dedup: writing the same textContent in succession is
 * a no-op for some screen readers. We append a zero-width space on
 * repeats so the value actually changes, triggering re-announcement.
 */

(function (root) {
    'use strict';

    function EnmAnnouncer() {
        this._politeEl = null;
        this._assertiveEl = null;
        this._lastPolite = '';
        this._lastAssertive = '';
        this._mounted = false;
    }

    /**
     * Mount the hidden live regions on document.body. Idempotent —
     * a second mount() is a no-op so app.js can call it unconditionally
     * during init() without a singleton check.
     */
    EnmAnnouncer.prototype.mount = function () {
        if (this._mounted) { return this; }
        // Defensive: body may not exist yet if a script (mistakenly)
        // calls mount() before parse reaches <body>. The boot path
        // calls this after the els block is populated, so body is
        // guaranteed by then.
        if (typeof document === 'undefined' || !document.body) { return this; }
        // alpha.29 batch 105 (Round-35 finding #4, MED) — aria-atomic=true
        // on both regions. role=status / role=alert IMPLICITLY map to
        // aria-live but NOT to aria-atomic. NVDA 2024.1 + Chromium 121+
        // treats partial-text updates (the ZWSP repeat trick below)
        // as a diff rather than the whole new string — JAWS speaks
        // only the appended `​` ("zero width space") character on
        // some voices. aria-atomic=true forces the region to be read
        // as a single unit on every change. Explicit and portable.
        this._politeEl = document.createElement('div');
        this._politeEl.className = 'enm-sr-only';
        this._politeEl.setAttribute('role', 'status');
        this._politeEl.setAttribute('aria-atomic', 'true');
        this._politeEl.setAttribute('id', 'enm-announcer-polite');
        document.body.appendChild(this._politeEl);

        this._assertiveEl = document.createElement('div');
        this._assertiveEl.className = 'enm-sr-only';
        this._assertiveEl.setAttribute('role', 'alert');
        this._assertiveEl.setAttribute('aria-atomic', 'true');
        this._assertiveEl.setAttribute('id', 'enm-announcer-assertive');
        document.body.appendChild(this._assertiveEl);

        this._mounted = true;
        return this;
    };

    /**
     * Announce at polite priority. Polite announcements queue without
     * interrupting the operator's current AT focus — appropriate for
     * "Saved", "Refreshed", "Theme switched", and similar status
     * transitions the operator caused intentionally.
     *
     * @param {string} msg
     */
    EnmAnnouncer.prototype.polite = function (msg) {
        if (!this._mounted) { this.mount(); }
        if (!this._politeEl) { return; }
        var text = (msg == null) ? '' : String(msg);
        // Same-text repeat — append ZWSP so the value actually changes.
        if (text === this._lastPolite && text.length > 0) {
            text = text + '​';
        }
        this._lastPolite = text;
        this._politeEl.textContent = text;
    };

    /**
     * Announce at assertive priority. Use sparingly — assertive
     * messages interrupt the operator's AT and should be reserved for
     * "chain stopped", "validator deactivated", "save failed", etc.
     * "Loaded" and other ambient transitions should use polite().
     *
     * @param {string} msg
     */
    EnmAnnouncer.prototype.assertive = function (msg) {
        if (!this._mounted) { this.mount(); }
        if (!this._assertiveEl) { return; }
        var text = (msg == null) ? '' : String(msg);
        if (text === this._lastAssertive && text.length > 0) {
            text = text + '​';
        }
        this._lastAssertive = text;
        this._assertiveEl.textContent = text;
    };

    /**
     * Clear both regions. Useful at e.g. dashboard re-mount when stale
     * announcements ("Welcome screen…") would be confusing on the new
     * view. Optional — most callers don't need this.
     */
    EnmAnnouncer.prototype.clear = function () {
        if (this._politeEl) { this._politeEl.textContent = ''; }
        if (this._assertiveEl) { this._assertiveEl.textContent = ''; }
        this._lastPolite = '';
        this._lastAssertive = '';
    };

    /**
     * Tear down for tests / app reinstall. Removes both regions from
     * the DOM. mount() can be called again afterward to re-create.
     */
    EnmAnnouncer.prototype.destroy = function () {
        if (this._politeEl && this._politeEl.parentNode) {
            this._politeEl.parentNode.removeChild(this._politeEl);
        }
        if (this._assertiveEl && this._assertiveEl.parentNode) {
            this._assertiveEl.parentNode.removeChild(this._assertiveEl);
        }
        this._politeEl = null;
        this._assertiveEl = null;
        this._mounted = false;
    };

    // Singleton — most callers want the one shared instance.
    root.EnmAnnouncer = EnmAnnouncer;
    root.enmAnnouncer = new EnmAnnouncer();
}(typeof window !== 'undefined' ? window : globalThis));
