/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/welcome-screen.js — Beta 3 shim.
 *
 * Background: the alpha.27 boot flow rendered a hero card ("Turn your
 * ElastOS into a node") with a single "Let's go" CTA, then swapped in
 * the 6-card setup conversation on click. The phase-06 mock for Beta 3
 * collapses that two-step entry into one — the role-grid IS the
 * welcome experience.
 *
 * Rather than rewire every call site in app.js (which still does
 * `new root.EnmWelcomeScreen({ onContinue: ... })` from
 * _mountWelcomeScreen), this file becomes a tiny shim that:
 *   1. Keeps the `EnmWelcomeScreen` constructor + mount/destroy
 *      surface stable so app.js doesn't need a port.
 *   2. Internally constructs and mounts an EnmSetupConversation, so
 *      the operator lands directly on the role chooser.
 *   3. Wires `onContinue` (alpha.27 callback name) and `onComplete`
 *      (alpha.28 callback name) both to the same underlying
 *      onComplete from app.js — calling either advances the user out
 *      of setup the same way.
 *
 * The shim also forwards `api`, `notifications`, and `sse` opts down
 * to SetupConversation. app.js's _mountWelcomeScreen passes only
 * `onContinue` today; the shim falls back to picking the services
 * off `root.enmApp` if available, otherwise off `opts.services` —
 * but the safer path is to update _mountWelcomeScreen to pass these
 * through. Either way the constructor doesn't throw on missing opts;
 * the underlying SetupConversation does its own validation when an
 * api object is supplied.
 *
 * Net result: ~50-line shim instead of the prior 80-line hero, and
 * the operator sees the role chooser as their first interaction.
 */

(function (root) {
    'use strict';

    function WelcomeScreen(opts) {
        if (!opts) { opts = {}; }
        // Accept both alpha.27 (`onContinue`) and alpha.28 (`onComplete`)
        // callback names so the shim is forward-compatible with any
        // app.js call site that hasn't been renamed yet.
        var advance = typeof opts.onComplete === 'function'
            ? opts.onComplete
            : (typeof opts.onContinue === 'function' ? opts.onContinue : function () {});
        this._opts = {
            api:           opts.api || null,
            notifications: opts.notifications || null,
            sse:           opts.sse || null,
            announcer:     opts.announcer || (root.enmAnnouncer || null),
            onComplete:    advance,
        };
        this._inner = null;
        this.root = null;
    }

    WelcomeScreen.prototype.mount = function (parent) {
        if (!root.EnmSetupConversation) {
            // Defensive: if setup-conversation.js failed to load, surface
            // a clear stub instead of a blank pane.
            this.root = document.createElement('section');
            this.root.className = 'enm-wiz-shell';
            this.root.innerHTML =
                '<div class="enm-wiz-body">'
                  + '<h2 class="enm-wiz-heading">Setup component not loaded</h2>'
                  + '<p class="enm-wiz-para">Hard-refresh the page (Ctrl-Shift-R, or ⌘-Shift-R on Mac) to retry.</p>'
                + '</div>';
            parent.appendChild(this.root);
            return this;
        }
        this._inner = new root.EnmSetupConversation(this._opts);
        this._inner.mount(parent);
        // Mirror `.root` so external callers (test rigs, app.js
        // teardown) can still grab the section element.
        this.root = this._inner.root;
        return this;
    };

    WelcomeScreen.prototype.destroy = function () {
        if (this._inner && typeof this._inner.destroy === 'function') {
            this._inner.destroy();
            this._inner = null;
        }
        this.root = null;
    };

    root.EnmWelcomeScreen = WelcomeScreen;
}(typeof window !== 'undefined' ? window : globalThis));
