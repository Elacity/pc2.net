/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/setup-conversation.js — v0.4.7 setup wizard.
 *
 * 7-card flow (replaces the alpha.28/beta.3 Card B/B2/B3/C/D/E/F
 * pipeline per operator directive 2026-05-19 "the council setup is
 * wrong and very dumb, too many steps, doesn't understand what it's
 * doing"):
 *
 *   Card 1  — welcome / role chooser (Council vs BPoS)
 *   Card 2  — system check (MANDATORY — OS/CPU/RAM/Disk thresholds)
 *   Card 3  — master password (one generated 32-char password
 *             covering every keystore on the node)
 *   Card 4  — wallet address (one EVM input + last-4 anti-typo
 *             gate; explainer mentions ESC/EID/PG mining rewards
 *             AND Arbiter cross-chain signing)
 *   Card 5  — confirm + install (preflight + snapshot toggle +
 *             "Install everything")
 *   Card 6  — install stepper (SSE + poll fallback; renders the
 *             13-step PLAN for Council, a 3-step plan for BPoS)
 *   Card 7  — done (celebrate + open dashboard)
 *
 * DOM contract unchanged:
 *
 *   .enm-wiz-shell
 *     .enm-wiz-body           ← swaps per-card
 *     .enm-setup-actions      ← stable footer (Cancel + Continue)
 *
 * Welcome-screen.js still wraps this component; Card 1's renderer
 * is _renderCardA (kept under that name for compatibility with the
 * existing welcome-screen shim).
 *
 * Council always installs ALL services (Mainchain + ESC + EID + PG
 * + 3 oracles + Arbiter); the prior PG opt-in was removed by
 * operator directive 2026-05-19 ("optional add-ons — don't do that").
 *
 * The alpha.28 invariants live on:
 *   - `_destroyed` flag flipped FIRST in destroy() so any in-flight
 *     SSE/poll/HTTP callbacks short-circuit
 *   - `_cardSeq` bumped on every body swap; `_stillRendering(seq)`
 *     gates every async .then so stale resolves can't mutate the
 *     new card's DOM
 *   - `_teardownInstallTracking` runs on destroy and on _goto out
 *     of Card 6 (prevents poll-after-navigate)
 *   - Cross-tab BC: setup-complete broadcast handled in app.js;
 *     _setupConv is stored on app so destroy() can fire on broadcast
 *
 * The 9-step alpha.1 wizard, its `_goal === 'help'` branch, and the
 * old Cards B/B2/B3/C/D/D2/E/F renderers are permanently retired.
 */

(function (root) {
    'use strict';

    function SetupConversation(opts) {
        if (!opts || !opts.api) {
            throw new TypeError('SetupConversation: { api, notifications, sse } required');
        }
        this.api = opts.api;
        this.notifications = opts.notifications || null;
        this.sse = opts.sse || null;
        this.announcer = opts.announcer || (root.enmAnnouncer || null);
        this.onComplete = typeof opts.onComplete === 'function'
            ? opts.onComplete
            : function () {};
        this.onCancel = typeof opts.onCancel === 'function'
            ? opts.onCancel
            : null;

        this.root = document.createElement('section');
        this.root.className = 'enm-wiz-shell';
        // role=region so the wizard reads as a named landmark in
        // screen-reader rotors. aria-labelledby set after the heading
        // mounts (per-card).
        this.root.setAttribute('role', 'region');
        this.root.setAttribute('aria-label', 'Setup wizard');

        this._goal = null;            // 'bpos' | 'council'
        this._currentCard = '1';      // which card is showing (1..7)
        this._cardSeq = 0;            // bump on every render to ignore stale callbacks
        this._unsubscribeInstall = null;
        this._installPollTimer = null;
        // beta.0.4.7 — in-memory collection from Cards 2-4. The
        // master password is generated server-side via /setup/keystore
        // and surfaced once for the operator to save; sharedRewardAddress
        // is collected on Card 4. Card 5 POSTs both to /setup/install-
        // council (Council path) or relies on the mainchain-only path
        // for BPoS. We avoid persisting these to localStorage — the
        // password is sensitive and the operator is told it's shown
        // ONCE; persisting would contradict that guarantee.
        this._masterPassword = null;
        this._sharedRewardAddress = null;
        // alpha.28.1 batch 83 — _destroyed flag so async resolves and
        // SSE callbacks can short-circuit if destroy() fires between
        // a poll dispatch and its .then. Symmetric with the original
        // alpha.28 setup-conversation; central to every async branch
        // in this file.
        this._destroyed = false;
    }

    /**
     * Cancel any in-flight install-council poll + SSE subscription.
     * Called from destroy() and from internal transitions that abandon
     * Card 6's progress UI. Without this the poll outlives navigation
     * and applies status to a DOM the user has navigated away from.
     */
    SetupConversation.prototype._teardownInstallTracking = function () {
        if (this._installPollTimer) {
            clearInterval(this._installPollTimer);
            this._installPollTimer = null;
        }
        if (this._unsubscribeInstall) {
            try { this._unsubscribeInstall(); } catch (_) { /* ignore */ }
            this._unsubscribeInstall = null;
        }
    };

    SetupConversation.prototype.mount = function (parent) {
        parent.appendChild(this.root);
        this._renderShell();
        var self = this;
        // Recovery: jump to the right card based on what already exists.
        // Without this, an operator who refreshes the page mid-install
        // would be sent back to Card A and lose context.
        this.api.get('/setup/state', { skipCache: true }).then(function (s) {
            if (self._destroyed) { return; }
            self._resumeFromState(s);
        }).catch(function () {
            if (self._destroyed) { return; }
            self._goto('a');
        });
        return this;
    };

    SetupConversation.prototype.destroy = function () {
        // alpha.28.1 batch 83 — flip flag FIRST so any in-flight poll/SSE
        // callbacks can see it before they mutate detached DOM.
        this._destroyed = true;
        this._teardownInstallTracking();
        if (this.root.parentNode) { this.root.parentNode.removeChild(this.root); }
    };

    /** @private */
    SetupConversation.prototype._renderShell = function () {
        // Two-region shell. The body region is swapped per card; the
        // footer (.enm-setup-actions) is a stable element whose Cancel/
        // Continue buttons mutate per card. Keeping the footer outside
        // the swap means screen-reader focus rings on the action row
        // don't blink off between card transitions.
        this.root.innerHTML =
            '<div class="enm-wiz-body"></div>'
            + '<div class="enm-setup-actions">'
              + '<button type="button" class="enm-btn enm-btn-secondary enm-setup-cancel" hidden></button>'
              + '<button type="button" class="enm-btn enm-btn-primary enm-setup-continue" disabled></button>'
            + '</div>';
        this._body         = this.root.querySelector('.enm-wiz-body');
        this._cancelBtn    = this.root.querySelector('.enm-setup-cancel');
        this._continueBtn  = this.root.querySelector('.enm-setup-continue');
    };

    /** @private */
    SetupConversation.prototype._resumeFromState = function (s) {
        // Already done? Skip the wizard entirely.
        // Truthy check — SQLite stores `completed: 1` not `=== true`.
        if (s && s.completed) {
            this.onComplete(s);
            return;
        }

        // beta.0.4.7 — the redesigned 7-card flow always re-enters at
        // Card 1 (role chooser). Card 2-5 are pre-install data
        // collection that runs in-memory; Card 6 is the only card
        // that maps to a backend step (install in progress). On a
        // refresh during install we route to Card 6 so its
        // /install-council/status auto-resume picks up the running
        // job. Council and BPoS paths both pass through Cards 2-7;
        // the difference is the payload sent to the install endpoints,
        // not the UI itself.
        var step = (s && s.currentStep) || 'welcome';
        var goal = this._resumeGoal();
        if (step === 'install' || step === 'preflight'
                || step === 'welcome' || step === 'bootstrap'
                || step === 'keystore') {
            // Pre-install or in-progress mainchain steps: re-enter
            // at the role chooser. The new wizard re-validates the
            // operator's choice (Council vs BPoS) on every visit
            // rather than trusting a half-written setup-state.
            this._goto('1');
        } else if (step === 'network' || step === 'confirm' || step === 'complete') {
            // Mainchain configured + identity collected; resume on
            // Card 6's stepper so the install-council job can take
            // over (or the dashboard can open if it already finished).
            this._goal = goal;
            this._goto('6');
        } else {
            // Unknown step value (schema drift, garbage response) —
            // fail safe by starting from the top.
            this._goto('1');
        }
    };

    /**
     * Recover the operator's setup intent from localStorage. Set by
     * Card 1's role-card click handler on every visit. Default is
     * 'bpos' (the older / smaller workload) so an operator who
     * cleared local storage and resumed mid-install doesn't get
     * pushed into the heavier Council path by accident.
     * @private
     */
    SetupConversation.prototype._resumeGoal = function () {
        try {
            var intent = window.localStorage.getItem('enm:setup-intent');
            if (intent === 'council' || intent === 'bpos') { return intent; }
        } catch (_) { /* private mode — fall through */ }
        return 'bpos';
    };

    /** @private */
    SetupConversation.prototype._goto = function (card) {
        // 0.5.2 audit Session 2 HIGH fix — hydrate `_goal` from
        // localStorage before any card renders. Pre-0.5.2 fix: only
        // Card 2 read the fallback; Cards 3/4/5/6/7 also branch on
        // `_goal` and would silently see undefined (treated as bpos)
        // on a fresh SetupConversation instance (refresh, back-nav).
        // Single recovery point in _goto means every card downstream
        // sees a hydrated goal without per-card duplication.
        if (!this._goal) {
            try { this._goal = window.localStorage.getItem('enm:setup-intent'); }
            catch (_) { /* private mode — _goal stays null */ }
        }
        // beta.0.4.7 — Card 6 owns the install-job SSE + poll
        // subscriptions. Tear them down on every navigation away
        // (operator hit Back, refresh, role-card re-click) so a
        // half-finished job's callbacks can't mutate a stale DOM
        // when Card 6 re-mounts.
        if (this._currentCard === '6' && card !== '6') {
            this._teardownInstallTracking();
        }
        this._currentCard = card;
        this._cardSeq += 1;
        var seq = this._cardSeq;
        this._body.innerHTML = '';
        // Reset footer to default hidden-Cancel + disabled-Continue.
        // Cards opt in by mutating these refs.
        this._resetFooter();

        if (card === '1' || card === 'a') { this._renderCardA(seq); }
        else if (card === '2') { this._renderCard2(seq); }
        else if (card === '3') { this._renderCard3(seq); }
        else if (card === '4') { this._renderCard4(seq); }
        else if (card === '5') { this._renderCard5(seq); }
        else if (card === '6') { this._renderCard6(seq); }
        else if (card === '7') { this._renderCard7(seq); }

        // a11y/focus: every card swap re-renders `_body.innerHTML`,
        // destroying the previously-focused control. Without an
        // explicit landing, focus drops to body and screen readers
        // don't announce that the wizard advanced. Move focus to the
        // new card's heading (with a temporary tabindex so it accepts
        // programmatic focus), and let the user Tab forward from there.
        try {
            var heading = this._body.querySelector('.enm-wiz-heading')
                || this._body.querySelector('h2, h3');
            if (heading && typeof heading.focus === 'function') {
                if (!heading.hasAttribute('tabindex')) {
                    heading.setAttribute('tabindex', '-1');
                }
                heading.focus({ preventScroll: true });
                // Announce the new step to screen readers via the
                // shared announcer (alpha.29 batch 97). The heading
                // focus catches sighted users; the announcer covers
                // VoiceOver/NVDA users who may have focus parked on
                // a different region.
                if (this.announcer && typeof this.announcer.polite === 'function') {
                    try { this.announcer.polite(heading.textContent || ''); } catch (_) { /* ignore */ }
                }
            }
        } catch (_) { /* DOM may be torn down mid-render */ }
    };

    /** @private — reset the stable footer between card swaps. */
    SetupConversation.prototype._resetFooter = function () {
        // Footer reset: each card re-wires the two buttons to its own
        // handlers. Clearing the handlers (by replacing the nodes)
        // is the simplest way to guarantee no stale listeners survive.
        var newCancel = this._cancelBtn.cloneNode(false);
        var newContinue = this._continueBtn.cloneNode(false);
        newCancel.hidden = true;
        newCancel.textContent = '';
        newCancel.disabled = false;
        newContinue.disabled = true;
        newContinue.textContent = '';
        this._cancelBtn.parentNode.replaceChild(newCancel, this._cancelBtn);
        this._continueBtn.parentNode.replaceChild(newContinue, this._continueBtn);
        this._cancelBtn = newCancel;
        this._continueBtn = newContinue;
    };

    // ====================================================================
    // Card A — role chooser (BPoS vs Council)
    // ====================================================================

    /** @private */
    SetupConversation.prototype._renderCardA = function (seq) {
        var t = root.enmT;
        // The mock heading is "How will you run this node?" but the
        // existing string key is friendly.welcome.title — Beta 3 reuses
        // it because the role-grid IS the welcome screen now. The
        // friendly.setup.card_a.title key ("What kind of node?") sits
        // closer to the mock copy, so we lead with that.
        var heading = t('friendly.setup.card_a.title');
        var para = t('friendly.welcome.body');
        // Card A's heading is the named landmark for the wizard region.
        this.root.setAttribute('aria-label', heading);
        this._body.innerHTML =
            '<h2 class="enm-wiz-heading" id="enm-wiz-heading-a">' + escapeHtml(heading) + '</h2>'
            + '<p class="enm-wiz-para">' + escapeHtml(para) + '</p>'
            + '<div class="enm-role-grid" role="radiogroup" aria-labelledby="enm-wiz-heading-a">'
              + '<button type="button" class="enm-role-card" data-goal="bpos" role="radio" aria-checked="false">'
                + '<div class="enm-role-card-head">'
                  + '<span class="enm-role-card-radio" aria-hidden="true"></span>'
                  + '<span class="enm-role-card-title">' + escapeHtml(t('friendly.setup.card_a.bpos_title')) + '</span>'
                + '</div>'
                + '<p class="enm-role-card-help">' + escapeHtml(t('friendly.setup.card_a.bpos_sub')) + '</p>'
                // 0.2.0-beta.3.6 — phase-06 mock spec is a three-line
                // meta list for the BPoS role-card: Requires / Wallet /
                // Auto-installs. Pre-beta.3.6 rendered a single
                // "APR ~17% · Stake 5,000 ELA" pair that didn't match
                // any mock variant and conflated reward economics with
                // setup requirements.
                + '<div class="enm-role-card-meta">'
                  + '<span><b>' + escapeHtml(t('friendly.setup.card_a.bpos_requires_label')) + ':</b> '
                    + escapeHtml(t('friendly.setup.card_a.bpos_requires_value')) + '</span>'
                  + '<span><b>' + escapeHtml(t('friendly.setup.card_a.bpos_wallet_label')) + ':</b> '
                    + escapeHtml(t('friendly.setup.card_a.bpos_wallet_value')) + '</span>'
                  + '<span><b>' + escapeHtml(t('friendly.setup.card_a.bpos_install_label')) + ':</b> '
                    + escapeHtml(t('friendly.setup.card_a.bpos_install_value')) + '</span>'
                + '</div>'
              + '</button>'
              + '<button type="button" class="enm-role-card" data-goal="council" role="radio" aria-checked="false">'
                // beta.0.4.3 — Council card now enabled. Removed
                // data-disabled / disabled / aria-disabled. The badge
                // changes from "Coming soon" to "Multi-chain" (read
                // from strings.js). Picking this card sets a setup
                // intent which app.js consumes after mainchain setup
                // completes to launch the Council expansion installer.
                + '<span class="enm-role-card-badge">'
                  + '<span class="enm-role-card-badge-long">'
                    + escapeHtml(t('friendly.setup.card_a.council_meta')) + '</span>'
                  + '<span class="enm-role-card-badge-short">'
                    + escapeHtml(t('friendly.setup.card_a.council_meta_compact')) + '</span>'
                + '</span>'
                + '<div class="enm-role-card-head">'
                  + '<span class="enm-role-card-radio" aria-hidden="true"></span>'
                  + '<span class="enm-role-card-title">' + escapeHtml(t('friendly.setup.card_a.council_title')) + '</span>'
                + '</div>'
                + '<p class="enm-role-card-help">' + escapeHtml(t('friendly.setup.card_a.council_sub')) + '</p>'
                + '<div class="enm-role-card-meta">'
                  + '<span><b>' + escapeHtml(t('friendly.setup.card_a.council_requires_label')) + ':</b> '
                    + escapeHtml(t('friendly.setup.card_a.council_requires_value')) + '</span>'
                  + '<span><b>' + escapeHtml(t('friendly.setup.card_a.council_wallet_label')) + ':</b> '
                    + escapeHtml(t('friendly.setup.card_a.council_wallet_value')) + '</span>'
                  + '<span><b>' + escapeHtml(t('friendly.setup.card_a.council_status_label')) + ':</b> '
                    + escapeHtml(t('friendly.setup.card_a.council_status_value')) + '</span>'
                  // 0.5.140 audit Session 140 — the alpha S1 amber callout
                  // ("Also enables: BPoS producer mode on Main chain —
                  // separate community vote required to earn block rewards")
                  // was dropped. It conflated two distinct paths to
                  // mainchain consensus and was operator-misleading.
                  //
                  // Verified against Elastos.ELA HEAD:
                  //   - main.go:114-130 — EnableArbiter=true only opens
                  //     the keystore so the node CAN sign blocks. It does
                  //     NOT register the operator as a BPoS producer
                  //     candidate. RegisterProducer is a separate on-chain
                  //     transaction (with a 2,000 ELA deposit) that ENM
                  //     does not invoke during setup.
                  //   - dpos/state/arbitrators.go:2439-2460 — Council
                  //     members are AUTOMATICALLY a CRC arbiter during
                  //     their election period (resetNextArbiterByCRC).
                  //     This is the chain code's behavior; no separate
                  //     vote is required.
                  //
                  // Net: Council nodes participate in mainchain consensus
                  // by virtue of being elected to the CR Committee — a
                  // different path from BPoS producer registration. The
                  // "Includes: Main chain + 3 EVM sidechains + 3 Oracles
                  // + Arbiter Service" line above already discloses
                  // mainchain participation, so the callout was redundant
                  // as well as wrong.
                + '</div>'
              + '</button>'
            + '</div>'
            // 0.5.0 audit Session 1 — wire the previously-DEAD `footer` +
            // new `footnote` strings. Renderer pre-0.5.0 never emitted
            // them; the comparison disclaimer was invisible since v0.4.3.
            // Footer = help text comparing the two roles. Footnote =
            // asterisk-explanation for the "*" in the meta badges.
            + '<p class="enm-wiz-para enm-card-footer">'
              + escapeHtml(t('friendly.setup.card_a.footer')) + '</p>'
            + '<p class="enm-wiz-footnote">'
              + escapeHtml(t('friendly.setup.card_a.footnote')) + '</p>';

        var self = this;
        var cards = this._body.querySelectorAll('.enm-role-card');
        cards.forEach(function (card) {
            // The Council card has data-disabled="true" + disabled attr;
            // the disabled attribute alone blocks the click but we also
            // guard inside the handler defensively.
            card.addEventListener('click', function () {
                if (self._destroyed || !self._stillRendering(seq)) { return; }
                if (card.getAttribute('data-disabled') === 'true') { return; }
                cards.forEach(function (c) {
                    c.removeAttribute('data-selected');
                    c.setAttribute('aria-checked', 'false');
                });
                card.setAttribute('data-selected', 'true');
                card.setAttribute('aria-checked', 'true');
                self._goal = card.getAttribute('data-goal');
                self._continueBtn.disabled = false;
                // beta.0.4.3 — persist the operator's setup intent.
                // app.js _showDashboard reads this after mainchain
                // setup completes; if 'council' it launches the
                // Council expansion installer (M6.2 wizard surface);
                // if 'bpos' it goes straight to the dashboard.
                // localStorage chosen over backend cfg because (a) the
                // operator hasn't completed setup yet (no cfg to write
                // to) and (b) intent is per-browser-session anyway.
                try {
                    if (self._goal === 'council') {
                        window.localStorage.setItem('enm:setup-intent', 'council');
                    } else if (self._goal === 'bpos') {
                        window.localStorage.setItem('enm:setup-intent', 'bpos');
                    }
                } catch (_) { /* private mode — no persistence */ }
            });
        });

        // Wire the footer Continue button for Card A. The Cancel button
        // stays hidden on the initial role-chooser — there's nothing to
        // cancel yet.
        this._continueBtn.textContent = 'Continue';
        this._continueBtn.disabled = true;
        var continueBtn = this._continueBtn;
        continueBtn.addEventListener('click', function () {
            if (self._destroyed || !self._stillRendering(seq)) { return; }
            // beta.0.4.7 — both BPoS and Council paths now flow through
            // the same 7-card sequence (1 → 2 → 3 → 4 → 5 → 6 → 7).
            // Card 2 reads self._goal to pick the per-path system-check
            // thresholds; Card 5 reads it to pick the install payload
            // (POST /install-council for Council, vanilla
            // /install/mainchain + /complete for BPoS).
            if (!self._goal) { return; }
            self._goto('2');
        });
    };

    // ====================================================================
    // Card 2 — system check (MANDATORY)
    // ====================================================================
    //
    // Renders the EnmSystemCheck report (OS / CPU / RAM / Disk) as
    // a list with per-row icons. Continue button is locked until
    // `canProceed: true`. Operator can Re-run after fixing whatever
    // failed. For BPoS-on-exactly-8GB hosts, the report surfaces an
    // `add-swap` remediation handle — we render a "Add swap
    // automatically" button that POSTs /setup/system/add-swap and
    // then re-runs the check on success.

    /** @private */
    SetupConversation.prototype._renderCard2 = function (seq) {
        var t = root.enmT;
        // 0.5.2 audit Session 2 — `_goal` is now hydrated centrally in
        // `_goto` from localStorage 'enm:setup-intent' so every card
        // including this one sees the right intent on refresh. Pre-0.5.2
        // the fallback was hardcoded to 'bpos' here, silently flipping
        // Council operators to BPoS thresholds (mode-confusion bug).
        var pathName = (this._goal === 'council') ? 'council' : 'bpos';
        var heading = t('friendly.setup.card_2.title');
        var sub = t('friendly.setup.card_2.sub', { path: pathName });
        this.root.setAttribute('aria-label', heading);
        // v0.5.188 — Council-only staged-sync note. Council brings up 8 chains;
        // on modest hardware they sync slowly when started together. The Main
        // chain comes up first and the sidechains + Arbiter depend on it (node.sh
        // all_start order: ela → sidechains → arbiter; the Arbiter dials Main-chain
        // RPC at startup and the sidechains learn their producer set from the Main
        // chain over SPV). So on a constrained server it is normal — and may be
        // necessary — to let the Main chain (and a sidechain) fully sync before the
        // rest catch up. Verified safe against node.sh (its per-chain model is
        // inherently staged). BPoS (single chain) doesn't need this.
        var perfNote = (pathName === 'council')
            ? '<p class="enm-wiz-footnote enm-syscheck-perf-note">'
                + escapeHtml(t('friendly.setup.card_2.perf_note')) + '</p>'
            : '';
        this._body.innerHTML = ''
            + '<h2 class="enm-wiz-heading" id="enm-wiz-heading-2">'
            +   escapeHtml(heading) + '</h2>'
            + '<p class="enm-wiz-para">' + escapeHtml(sub) + '</p>'
            + '<ul class="enm-syscheck-list" role="status" aria-live="polite">'
            +   '<li class="enm-syscheck-row" data-state="checking">'
            +     '<span class="enm-syscheck-icon" aria-hidden="true">⟳</span>'
            +     '<span class="enm-syscheck-text">'
            +       escapeHtml(t('friendly.setup.card_2.running')) + '</span>'
            +   '</li>'
            + '</ul>'
            + '<div class="enm-syscheck-remediation" hidden></div>'
            + '<div class="enm-syscheck-actions">'
            +   '<button type="button" class="enm-btn enm-btn-secondary" '
            +     'data-action="rerun">'
            +     escapeHtml(t('friendly.setup.card_2.rerun')) + '</button>'
            + '</div>'
            + perfNote;

        var self = this;
        var listEl = this._body.querySelector('.enm-syscheck-list');
        var remEl  = this._body.querySelector('.enm-syscheck-remediation');
        var rerun  = this._body.querySelector('[data-action="rerun"]');

        // Cancel = Back to Card 1 (role chooser). Continue stays
        // disabled until canProceed === true. NON-SKIPPABLE per
        // operator directive 2026-05-19.
        this._cancelBtn.hidden = false;
        this._cancelBtn.textContent = t('friendly.setup.back');
        this._cancelBtn.addEventListener('click', function () {
            if (self._destroyed) { return; }
            self._goto('1');
        });
        this._continueBtn.hidden = false;
        this._continueBtn.disabled = true;
        this._continueBtn.textContent = t('friendly.setup.card_2.cta');
        this._continueBtn.addEventListener('click', function () {
            if (self._destroyed || !self._stillRendering(seq)) { return; }
            if (self._continueBtn.disabled) { return; }
            self._goto('3');
        });

        function runChecks() {
            // 0.5.22 audit Session 22 — disable Re-run button while
            // in-flight. Same double-click guard rationale as Card 5
            // (v0.5.21).
            rerun.disabled = true;
            listEl.innerHTML = '<li class="enm-syscheck-row" data-state="checking">'
                + '<span class="enm-syscheck-icon" aria-hidden="true">⟳</span>'
                + '<span class="enm-syscheck-text">'
                + escapeHtml(t('friendly.setup.card_2.running')) + '</span></li>';
            remEl.hidden = true;
            remEl.innerHTML = '';
            self._continueBtn.disabled = true;
            self.api.get('/setup/system-check?path=' + pathName, { skipCache: true })
                .then(function (report) {
                    if (self._destroyed || !self._stillRendering(seq)) { return; }
                    rerun.disabled = false;
                    self._renderCard2Report(listEl, remEl, report, runChecks);
                })
                .catch(function (err) {
                    if (self._destroyed || !self._stillRendering(seq)) { return; }
                    rerun.disabled = false;
                    // 0.5.22 audit Session 22 — error row now matches the
                    // visual structure of successful syscheck rows (label
                    // + message) and surfaces a retry hint pointing at
                    // the Re-run button. Card 2 is non-skippable per
                    // operator directive 2026-05-19, so a stack-trace-
                    // style error with no recovery affordance hurts more
                    // here than on Card 5.
                    var errMsg = (err && err.message) || String(err);
                    var labelText = t('friendly.setup.card_2.err_label')
                        || 'System check could not run';
                    var bodyTpl = t('friendly.setup.card_2.err_body')
                        || 'Network or server problem: {error}';
                    var bodyText = bodyTpl.replace('{error}', errMsg);
                    var retryHint = t('friendly.setup.card_2.err_retry_hint')
                        || 'Press Re-run checks above to try again.';
                    listEl.innerHTML = '<li class="enm-syscheck-row" data-state="error">'
                        + '<span class="enm-syscheck-icon" aria-hidden="true">✗</span>'
                        + '<div class="enm-syscheck-text">'
                        +   '<div class="enm-syscheck-label">' + escapeHtml(labelText) + '</div>'
                        +   '<div class="enm-syscheck-message">'
                        +     escapeHtml(bodyText) + ' ' + escapeHtml(retryHint)
                        +   '</div>'
                        + '</div></li>';
                });
        }

        rerun.addEventListener('click', runChecks);
        runChecks();
    };

    /** @private */
    SetupConversation.prototype._renderCard2Report = function (listEl, remEl, report, rerun) {
        var t = root.enmT;
        var self = this;
        listEl.innerHTML = '';

        // 0.5.2 audit Session 2 — when backend signals previouslyVerified
        // OR installInProgress, render a clear banner instead of just one
        // synthetic check row. Operators were confused that a 6-row check
        // collapsed to 1 row — looked like the check was skipped without
        // explanation. Now: explicit banner explains WHY this step is
        // pre-passed. The Re-run button is also hidden in these states
        // (re-running would just yield the same synthetic pass).
        var rerunBtn = self._body && self._body.querySelector('[data-action="rerun"]');
        if (report && (report.previouslyVerified || report.installInProgress)) {
            var bannerKind = report.previouslyVerified ? 'completed' : 'in-progress';
            var bannerTitle = report.previouslyVerified
                ? 'System check previously passed'
                : 'Install in progress — system check passed earlier';
            var bannerBody = (report.checks && report.checks[0] && report.checks[0].message) || '';
            var li = document.createElement('li');
            li.className = 'enm-syscheck-row enm-syscheck-banner';
            li.setAttribute('data-state', 'ok');
            li.setAttribute('data-kind', bannerKind);
            li.innerHTML = ''
                + '<span class="enm-syscheck-icon" aria-hidden="true">✓</span>'
                + '<div class="enm-syscheck-text">'
                +   '<div class="enm-syscheck-label">' + escapeHtml(bannerTitle) + '</div>'
                +   '<div class="enm-syscheck-message">' + escapeHtml(bannerBody) + '</div>'
                + '</div>';
            listEl.appendChild(li);
            if (rerunBtn) { rerunBtn.hidden = true; }
            this._continueBtn.disabled = !report.canProceed;
            return;
        }
        // Real path — render every check + remediation as before.
        if (rerunBtn) { rerunBtn.hidden = false; }
        var checks = (report && report.checks) || [];
        checks.forEach(function (c) {
            // ok=true → ✓ (green); required failure → ✗ (red);
            // recommended failure → ⚠ (amber).
            var stateAttr = c.ok ? 'ok'
                          : (c.severity === 'required' ? 'error' : 'warn');
            var icon = c.ok ? '✓'
                     : (c.severity === 'required' ? '✗' : '⚠');
            var row = document.createElement('li');
            row.className = 'enm-syscheck-row';
            row.setAttribute('data-state', stateAttr);
            row.innerHTML = ''
                + '<span class="enm-syscheck-icon" aria-hidden="true">' + icon + '</span>'
                + '<div class="enm-syscheck-text">'
                +   '<div class="enm-syscheck-label">' + escapeHtml(c.label || c.id) + '</div>'
                +   '<div class="enm-syscheck-message">' + escapeHtml(c.message || '') + '</div>'
                + '</div>';
            listEl.appendChild(row);
        });

        // Render the add-swap remediation chip when offered. Only
        // BPoS-on-exactly-8GB hosts get this; other paths leave the
        // remEl hidden + empty.
        var rem = report && report.remediation && report.remediation['add-swap'];
        if (rem) {
            remEl.hidden = false;
            remEl.innerHTML = ''
                + '<p class="enm-syscheck-rem-label">'
                +   escapeHtml(t('friendly.setup.card_2.add_swap_label')) + '</p>'
                + '<button type="button" class="enm-btn enm-btn-primary" '
                +   'data-action="add-swap">'
                +   escapeHtml(t('friendly.setup.card_2.add_swap_btn')) + '</button>'
                + '<p class="enm-syscheck-rem-status" hidden></p>';
            var swapBtn = remEl.querySelector('[data-action="add-swap"]');
            var statusEl = remEl.querySelector('.enm-syscheck-rem-status');
            swapBtn.addEventListener('click', function () {
                if (self._destroyed) { return; }
                swapBtn.disabled = true;
                swapBtn.textContent = t('friendly.setup.card_2.add_swap_working');
                self.api.post('/setup/system/add-swap', {})
                    .then(function (resp) {
                        if (self._destroyed) { return; }
                        statusEl.hidden = false;
                        statusEl.textContent = t('friendly.setup.card_2.add_swap_done',
                            { freeGbAfter: String((resp && resp.freeGbAfter) || '?') });
                        // Re-run checks — swap should flip RAM check to ok=true.
                        rerun();
                    })
                    .catch(function (err) {
                        if (self._destroyed) { return; }
                        swapBtn.disabled = false;
                        swapBtn.textContent = t('friendly.setup.card_2.add_swap_btn');
                        statusEl.hidden = false;
                        statusEl.textContent = t('friendly.setup.card_2.add_swap_failed',
                            { error: (err && err.message) || String(err) });
                    });
            });
        } else {
            remEl.hidden = true;
            remEl.innerHTML = '';
        }

        this._continueBtn.disabled = !(report && report.canProceed);
        if (!report || !report.canProceed) {
            // Help line for the operator — clarifies why Continue is
            // locked + how to recover.
            var helpRow = document.createElement('li');
            helpRow.className = 'enm-syscheck-row enm-syscheck-help';
            helpRow.setAttribute('data-state', 'warn');
            helpRow.innerHTML = '<span class="enm-syscheck-icon" aria-hidden="true">!</span>'
                + '<div class="enm-syscheck-text">'
                +   '<div class="enm-syscheck-message">'
                +     escapeHtml(t('friendly.setup.card_2.blocked_help'))
                +   '</div>'
                + '</div>';
            listEl.appendChild(helpRow);
        }
    };

    // ====================================================================
    // Card 3 — master password (generate + acknowledge)
    // ====================================================================
    //
    // Reuses POST /setup/keystore (the existing keystore-generation
    // endpoint) — server returns a fresh 32-char password in
    // `generatedPassword`. We stash it in self._masterPassword so
    // Card 5's install-council payload can ship it as
    // `masterPassword`. For the BPoS path, the keystore is what
    // signs DPoS rounds; for Council, the same value re-encrypts
    // every EVM keystore + Arbiter wallet (H23 invariant on the
    // backend).

    /** @private */
    SetupConversation.prototype._renderCard3 = function (seq) {
        var t = root.enmT;
        var heading = t('friendly.setup.card_3.title');
        var sub = (this._goal === 'council')
            ? t('friendly.setup.card_3.sub_council')
            : t('friendly.setup.card_3.sub_bpos');
        this.root.setAttribute('aria-label', heading);
        this._body.innerHTML = ''
            + '<h2 class="enm-wiz-heading" id="enm-wiz-heading-3">' + escapeHtml(heading) + '</h2>'
            + '<p class="enm-wiz-para">' + escapeHtml(sub) + '</p>'
            + '<div class="enm-master-pw-body" id="enm-wiz-3-body"></div>';
        var self = this;
        var body = this._body.querySelector('#enm-wiz-3-body');

        // Cancel wires the same on first visit + on Back-from-Card-4.
        // Continue is bound after the cancel because _renderCard3Reveal
        // clones it; cloning Cancel would lose this handler.
        this._cancelBtn.hidden = false;
        this._cancelBtn.textContent = t('friendly.setup.back');
        this._cancelBtn.addEventListener('click', function () {
            if (self._destroyed) { return; }
            self._goto('2');
        });

        // If we already generated the password earlier (e.g. operator
        // navigated forward to Card 4, then Back), re-render the reveal
        // panel with the SAME password — don't ask the server again
        // (the keystore is already on disk).
        if (this._masterPassword) {
            this._renderCard3Reveal(body, seq, this._masterPassword);
            return;
        }

        // beta.0.4.7.1 — generate the master password CLIENT-SIDE. Pre-
        // 0.4.7.1 the wizard called POST /setup/keystore here, but that
        // endpoint creates keystore.dat via ela-cli — and on the Council
        // path the mainchain binary isn't installed yet at Card 3 (the
        // orchestrator hasn't run). Generating client-side decouples the
        // password from keystore materialization; the keystore.dat gets
        // created later by the orchestrator's install-mainchain-keystore
        // step using this same password (passed in via /install-council).
        //
        // localStorage stash survives refresh — operator never loses the
        // password between Card 3 reveal and Card 5 submission.
        var stashed = null;
        try { stashed = window.sessionStorage.getItem('enm:master-pw'); } catch (_) {}
        if (stashed) {
            this._masterPassword = stashed;
            this._renderCard3Reveal(body, seq, stashed);
            return;
        }

        // 0.5.103 audit Session 103 (Session 50 backlog #2) — detect an
        // EXISTING keystore.dat on disk before defaulting to generate.
        // The install-mainchain-keystore orchestrator step is idempotent
        // (skips creation if the file exists) but happily encrypts the
        // new client-side password into cfg.*.keystorePasswordEncrypted,
        // which can't unlock the existing keystore — so the node fails
        // to sign at first start, surfacing as an opaque F1 alert with
        // no hint about the cause.
        //
        // Reach the existing-keystore branch when: operator reinstalled
        // ENM but kept /var/lib/pc2/.../mainchain/keystore.dat; restored
        // a backup keystore manually; or wiped localStorage between
        // wizard runs while leaving the chain data dir intact.
        //
        // Render a placeholder ("Checking for an existing keystore…")
        // up front so the operator never sees an empty body, then
        // resolve from /identity. On fetch failure we silently fall
        // through to the generate-new path — the operator can still
        // proceed; the failure mode only matters when a keystore
        // actually exists, and a failed /identity probe means we don't
        // know whether one does.
        body.innerHTML = '<p class="enm-wiz-para enm-master-pw-probe">'
            + escapeHtml(t('friendly.setup.card_3.checking_existing'))
            + '</p>';
        this._continueBtn.hidden = true;
        this.api.get('/identity', { skipCache: true })
            .then(function (resp) {
                if (self._destroyed || !self._stillRendering(seq)) { return; }
                var exists = !!(resp && resp.keystoreExists);
                if (exists) {
                    self._renderCard3ExistingKeystore(body, seq);
                } else {
                    self._renderCard3GeneratePrompt(body, seq);
                }
            })
            .catch(function () {
                if (self._destroyed || !self._stillRendering(seq)) { return; }
                // /identity unreachable (network blip, auth lapse, route
                // 500). Fall through to generate — the failure mode this
                // session addresses only triggers when a keystore is
                // present; if we can't tell, the original flow is the
                // safe default.
                self._renderCard3GeneratePrompt(body, seq);
            });
    };

    /**
     * Render the original "Generate my master password" prompt. Split
     * out of _renderCard3 in v0.5.103 so the /identity probe path can
     * route here as the fallback after detecting that no keystore is
     * present.
     * @private
     */
    SetupConversation.prototype._renderCard3GeneratePrompt = function (body, seq) {
        var t = root.enmT;
        var self = this;
        // 0.5.105 audit Session 105 (Session 50 backlog #4) — recovery
        // link for the localStorage-clear-mid-setup case. Pre-0.5.105,
        // operators who copied their Card 3 password to a password
        // manager and then cleared localStorage (browser settings reset,
        // third-party-cookie purge, sandbox switch) had no way to
        // resume with their saved password — the wizard restarted at
        // Card 1 and Card 3 always offered Generate, never Paste.
        // Clicking Generate produced a NEW password that didn't match
        // the password manager entry. Operator only discovered the
        // mismatch much later (Settings → Backup unlock fails).
        //
        // The Session 103 existing-keystore branch covers the
        // post-install version of this gap, but the localStorage-clear
        // can happen BEFORE the install ran (keystore.dat doesn't yet
        // exist), so /identity returns keystoreExists=false and we
        // wouldn't otherwise offer the paste input. The "Use a password
        // I saved earlier" link below the Generate button surfaces the
        // paste affordance unconditionally — operator self-selects.
        body.innerHTML = ''
            + '<div class="enm-master-pw-recover-row">'
            +   '<button type="button" class="enm-link-button" '
            +     'data-action="paste-saved">'
            +     escapeHtml(t('friendly.setup.card_3.cta_paste_saved_link'))
            +   '</button>'
            + '</div>';
        this._continueBtn.hidden = false;
        this._continueBtn.disabled = false;
        this._continueBtn.textContent = t('friendly.setup.card_3.cta_generate');
        this._continueBtn.addEventListener('click', function onGenerate() {
            if (self._destroyed || !self._stillRendering(seq)) { return; }
            self._continueBtn.removeEventListener('click', onGenerate);
            var pw = generateMasterPassword();
            self._masterPassword = pw;
            try { window.sessionStorage.setItem('enm:master-pw', pw); } catch (_) {}
            self._renderCard3Reveal(body, seq, pw);
        });
        var pasteLink = body.querySelector('[data-action="paste-saved"]');
        if (pasteLink) {
            pasteLink.addEventListener('click', function () {
                if (self._destroyed || !self._stillRendering(seq)) { return; }
                self._renderCard3PasteSaved(body, seq);
            });
        }
    };

    /**
     * Render the "paste a password you saved earlier" recovery branch.
     * Reached from the Generate prompt's optional link. Distinct from
     * _renderCard3ExistingKeystore (Session 103) which only fires when
     * a keystore.dat is already on disk; this branch fires when no
     * keystore exists yet but the operator has a saved password from a
     * prior wizard run they couldn't complete (e.g. localStorage
     * cleared between Card 3 and Card 5, browser closed without
     * finishing, machine swap).
     *
     * Same downstream as _renderCard3ExistingKeystore — store the
     * pasted value as _masterPassword + localStorage stash + route into
     * _renderCard3Reveal. No verification (no keystore to test
     * against). The install will use this password verbatim when it
     * creates the keystore at Card 6.
     *
     * Includes a "Generate new instead" back-link in case the operator
     * decided after clicking the recovery link that they don't actually
     * have a saved password and want a fresh one. The link doesn't
     * appear in _renderCard3ExistingKeystore because flipping back to
     * generate there would create a keystore-vs-password mismatch.
     * @private
     */
    SetupConversation.prototype._renderCard3PasteSaved = function (body, seq) {
        var t = root.enmT;
        var self = this;
        body.innerHTML = ''
            + '<div class="enm-password-warning enm-master-pw-warning" role="alert">'
            +   '<span class="enm-password-warning-icon" aria-hidden="true">ℹ</span>'
            +   '<span class="enm-password-warning-body">'
            +     escapeHtml(t('friendly.setup.card_3.paste_saved_warning'))
            +   '</span>'
            + '</div>'
            + '<label class="enm-council-form-row enm-master-pw-existing-row">'
            +   '<span class="enm-council-form-label">'
            +     escapeHtml(t('friendly.setup.card_3.paste_saved_input_label'))
            +   '</span>'
            +   '<input type="password" id="enm-wiz-3-saved-pw" '
            +     'class="enm-council-form-input" '
            +     'autocomplete="off" spellcheck="false" '
            +     'placeholder="' + escapeHtml(t('friendly.setup.card_3.existing_input_placeholder')) + '" '
            +     'aria-describedby="enm-wiz-3-saved-hint enm-wiz-3-saved-err">'
            +   '<span class="enm-council-form-hint" id="enm-wiz-3-saved-hint">'
            +     escapeHtml(t('friendly.setup.card_3.paste_saved_input_hint'))
            +   '</span>'
            +   '<span class="enm-council-form-error" id="enm-wiz-3-saved-err" hidden></span>'
            + '</label>'
            + '<div class="enm-master-pw-recover-row">'
            +   '<button type="button" class="enm-link-button" '
            +     'data-action="back-to-generate">'
            +     escapeHtml(t('friendly.setup.card_3.cta_back_to_generate'))
            +   '</button>'
            + '</div>';

        var inputEl = body.querySelector('#enm-wiz-3-saved-pw');
        var errEl   = body.querySelector('#enm-wiz-3-saved-err');

        var newContinue = this._continueBtn.cloneNode(false);
        newContinue.hidden = false;
        newContinue.disabled = true;
        newContinue.textContent = t('friendly.setup.card_3.cta_use_saved');
        this._continueBtn.parentNode.replaceChild(newContinue, this._continueBtn);
        this._continueBtn = newContinue;

        function showErr(msg) {
            if (errEl) { errEl.textContent = msg || ''; errEl.hidden = !msg; }
        }
        function trim(s) { return String(s || '').trim(); }
        inputEl.addEventListener('input', function () {
            self._continueBtn.disabled = trim(inputEl.value).length === 0;
            showErr('');
        });
        this._continueBtn.addEventListener('click', function onUseSaved() {
            if (self._destroyed || !self._stillRendering(seq)) { return; }
            var pw = trim(inputEl.value);
            if (pw.length < 8 || pw.length > 64) {
                showErr(t('friendly.setup.card_3.existing_input_err_length'));
                return;
            }
            self._continueBtn.removeEventListener('click', onUseSaved);
            self._masterPassword = pw;
            try { window.sessionStorage.setItem('enm:master-pw', pw); } catch (_) {}
            self._renderCard3Reveal(body, seq, pw);
        });
        var backLink = body.querySelector('[data-action="back-to-generate"]');
        if (backLink) {
            backLink.addEventListener('click', function () {
                if (self._destroyed || !self._stillRendering(seq)) { return; }
                self._renderCard3GeneratePrompt(body, seq);
            });
        }
    };

    /**
     * Render the "existing keystore detected" branch. Operator pastes
     * the master password they used when the keystore was first
     * generated; we store it as `_masterPassword` and route into the
     * normal reveal panel so Card 5 / Card 6 see an indistinguishable
     * shape. No password verification happens here — at Card 3 time
     * the mainchain binary may not be installed yet (Council path).
     * Verification falls to ela's first start: if the password doesn't
     * unlock keystore.dat, the chain fails to spawn and F1 fires.
     *
     * The "Wipe and start fresh" link is intentionally not wired here
     * — wiping a keystore is a destructive action and pre-install
     * ENM doesn't have the unlock check needed to confirm intent.
     * Operators who want a clean slate must delete keystore.dat
     * manually (the body text spells out the path).
     * @private
     */
    SetupConversation.prototype._renderCard3ExistingKeystore = function (body, seq) {
        var t = root.enmT;
        var self = this;
        body.innerHTML = ''
            + '<div class="enm-password-warning enm-master-pw-warning" role="alert">'
            +   '<span class="enm-password-warning-icon" aria-hidden="true">⚠</span>'
            +   '<span class="enm-password-warning-body">'
            +     escapeHtml(t('friendly.setup.card_3.existing_warning'))
            +   '</span>'
            + '</div>'
            + '<label class="enm-council-form-row enm-master-pw-existing-row">'
            +   '<span class="enm-council-form-label">'
            +     escapeHtml(t('friendly.setup.card_3.existing_input_label'))
            +   '</span>'
            +   '<input type="password" id="enm-wiz-3-existing-pw" '
            +     'class="enm-council-form-input" '
            +     'autocomplete="off" spellcheck="false" '
            +     'placeholder="' + escapeHtml(t('friendly.setup.card_3.existing_input_placeholder')) + '" '
            +     'aria-describedby="enm-wiz-3-existing-hint enm-wiz-3-existing-err">'
            +   '<span class="enm-council-form-hint" id="enm-wiz-3-existing-hint">'
            +     escapeHtml(t('friendly.setup.card_3.existing_input_hint'))
            +   '</span>'
            +   '<span class="enm-council-form-error" id="enm-wiz-3-existing-err" hidden></span>'
            + '</label>';

        var inputEl = body.querySelector('#enm-wiz-3-existing-pw');
        var errEl   = body.querySelector('#enm-wiz-3-existing-err');

        var newContinue = this._continueBtn.cloneNode(false);
        newContinue.hidden = false;
        newContinue.disabled = true;
        newContinue.textContent = t('friendly.setup.card_3.cta_use_existing');
        this._continueBtn.parentNode.replaceChild(newContinue, this._continueBtn);
        this._continueBtn = newContinue;

        function showErr(msg) {
            if (errEl) { errEl.textContent = msg || ''; errEl.hidden = !msg; }
        }
        function trim(s) { return String(s || '').trim(); }
        inputEl.addEventListener('input', function () {
            self._continueBtn.disabled = trim(inputEl.value).length === 0;
            showErr('');
        });
        this._continueBtn.addEventListener('click', function onUseExisting() {
            if (self._destroyed || !self._stillRendering(seq)) { return; }
            var pw = trim(inputEl.value);
            // Length sanity check matches generateMasterPassword's
            // output (32-char URL-safe base64). We accept anything in
            // the 8-64 range so operators who imported a hand-rolled
            // keystore from an older Elastos node (those used shorter
            // passwords) aren't locked out. The real verification is
            // ela-cli unlock at first chain start.
            if (pw.length < 8 || pw.length > 64) {
                showErr(t('friendly.setup.card_3.existing_input_err_length'));
                return;
            }
            self._continueBtn.removeEventListener('click', onUseExisting);
            self._masterPassword = pw;
            try { window.sessionStorage.setItem('enm:master-pw', pw); } catch (_) {}
            self._renderCard3Reveal(body, seq, pw);
        });
    };

    /**
     * Generate a 32-character master password using the browser's CSPRNG.
     * Output is URL-safe base64 truncated to 32 chars (~192 bits entropy).
     * Identical complexity to backend EnmCrypto.generatePassword(32).
     * @returns {string}
     */
    function generateMasterPassword() {
        // 0.5.3 audit Session 3 HIGH fix — defensive throw if no CSPRNG.
        // Pre-0.5.3 we deref `(window.crypto || window.msCrypto)
        // .getRandomValues` without checking either exists; on very
        // old browsers this throws an opaque TypeError mid-render with
        // no operator-facing explanation. Master password is too
        // catastrophic to silently weaken — fail loudly so the
        // operator sees a clear error instead of a blank Card 3.
        var rng = (window.crypto && window.crypto.getRandomValues)
            ? window.crypto
            : (window.msCrypto && window.msCrypto.getRandomValues)
            ? window.msCrypto
            : null;
        if (!rng) {
            throw new Error(
                'Master password generation requires window.crypto.getRandomValues — '
                + 'your browser is too old. Use a current Chrome / Firefox / Safari / Edge build.',
            );
        }
        // 0.5.26 audit Session 26 — dropped the unreachable hex fallback
        // (every browser ENM targets has btoa). The fallback would have
        // produced 16 bytes of entropy after slicing to 32 hex chars vs
        // the intended 192 bits from 24-byte base64 — a security-degraded
        // path that contradicted the defensive throw at the top of this
        // function. The defensive throw is the right answer for "no
        // CSPRNG / no btoa"; falling back to a weaker password isn't.
        var bytes = new Uint8Array(24);  // 24 bytes → 32-char base64
        rng.getRandomValues(bytes);
        var str = '';
        for (var i = 0; i < bytes.length; i++) { str += String.fromCharCode(bytes[i]); }
        var b64 = window.btoa(str);
        // URL-safe (no + / =)
        return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
    }

    /** @private */
    SetupConversation.prototype._renderCard3Reveal = function (body, seq, password) {
        var t = root.enmT;
        var self = this;
        body.innerHTML = ''
            + '<div class="enm-password-warning enm-master-pw-warning" role="alert">'
            +   '<span class="enm-password-warning-icon" aria-hidden="true">⚠</span>'
            +   '<span class="enm-password-warning-body">'
            +     escapeHtml(t('friendly.setup.card_3.warning'))
            +   '</span>'
            + '</div>'
            + '<div class="enm-password-reveal enm-master-pw-reveal">'
            +   '<div class="enm-password-label">'
            +     escapeHtml(t('friendly.setup.card_3.password_label'))
            +   '</div>'
            // 0.5.3 audit Session 3 — Show/Hide toggle. Visible by default
            // (operator needs to read + save it once); button lets them
            // hide while filling a password manager / screen-share. The
            // password value lives in `data-pw` so toggling doesn't lose
            // it; visible state uses textContent=value, hidden uses dots.
            +   '<code class="enm-password-value" data-pw="' + escapeHtml(password) + '" data-shown="true">'
            +     escapeHtml(password) + '</code>'
            +   '<div class="enm-password-actions">'
            +     '<button type="button" class="enm-btn enm-btn-secondary enm-master-pw-toggle" '
            +       'data-action="toggle-visibility" aria-label="Hide master password">'
            +       escapeHtml(t('friendly.setup.card_3.hide')) + '</button>'
            +     '<span class="enm-master-pw-copy-slot"></span>'
            +   '</div>'
            + '</div>'
            + '<label class="enm-conv-checkbox enm-master-pw-ack">'
            +   '<input type="checkbox" id="enm-wiz-3-ack"/>'
            +   '<span>' + escapeHtml(t('friendly.setup.card_3.ack')) + '</span>'
            + '</label>';

        var pwEl = body.querySelector('.enm-password-value');
        if (typeof root.enmCopyButton === 'function') {
            var copyBtn = root.enmCopyButton({
                value: password,
                label: t('friendly.setup.card_3.cta_copy'),
                copiedLabel: t('friendly.setup.card_3.cta_copied'),
                ariaLabel: 'Copy master password',
                resetMs: 1500,
                notifications: self.notifications,
                failTitle: t('friendly.setup.card_3.copy_fail_title'),
                failBody: t('friendly.setup.card_3.copy_fail_body'),
                getDisplayEl: function () { return pwEl; },
            });
            copyBtn.classList.add('enm-password-copy');
            var slot = body.querySelector('.enm-master-pw-copy-slot');
            if (slot && slot.parentNode) {
                slot.parentNode.replaceChild(copyBtn, slot);
            }
        }

        // Continue is locked until the ack checkbox is ticked. The
        // existing footer button (still wired to onGenerate handler)
        // needs to be replaced — easiest is to clone it so the old
        // listener falls off.
        var newContinue = this._continueBtn.cloneNode(false);
        newContinue.hidden = false;
        newContinue.disabled = true;
        newContinue.textContent = t('friendly.setup.card_3.cta_continue');
        this._continueBtn.parentNode.replaceChild(newContinue, this._continueBtn);
        this._continueBtn = newContinue;
        this._continueBtn.addEventListener('click', function onContinue() {
            if (self._destroyed || !self._stillRendering(seq)) { return; }
            self._continueBtn.removeEventListener('click', onContinue);
            self._goto('4');
        });

        var ack = body.querySelector('#enm-wiz-3-ack');
        ack.addEventListener('change', function () {
            self._continueBtn.disabled = !ack.checked;
        });

        // 0.5.3 audit Session 3 — Show/Hide toggle. Operator may want
        // to hide the password while filling their password manager
        // or screen-sharing setup. Toggle flips data-shown + textContent
        // between the real value and a dot-mask (length-preserving so
        // the layout doesn't jitter). data-pw retains the source value;
        // no re-fetching needed.
        var toggle = body.querySelector('[data-action="toggle-visibility"]');
        if (toggle) {
            toggle.addEventListener('click', function () {
                var el = body.querySelector('.enm-password-value');
                if (!el) return;
                var shown = el.getAttribute('data-shown') === 'true';
                var actualPw = el.getAttribute('data-pw') || '';
                if (shown) {
                    // Hide: replace text with a dot-mask of same length.
                    var mask = '';
                    for (var i = 0; i < actualPw.length; i++) { mask += '•'; }
                    el.textContent = mask;
                    el.setAttribute('data-shown', 'false');
                    toggle.textContent = t('friendly.setup.card_3.show') || 'Show';
                    toggle.setAttribute('aria-label', 'Show master password');
                } else {
                    el.textContent = actualPw;
                    el.setAttribute('data-shown', 'true');
                    toggle.textContent = t('friendly.setup.card_3.hide') || 'Hide';
                    toggle.setAttribute('aria-label', 'Hide master password');
                }
            });
        }
    };

    // ====================================================================
    // Card 4 — wallet address (one input + last-4 anti-typo gate)
    // ====================================================================
    //
    // Single Ethereum-style input. The explainer (operator directive
    // 2026-05-19) calls out ESC/EID/PG MINING rewards + Arbiter
    // cross-chain signing so the operator understands the address
    // does double duty as reward destination AND Arbiter mining
    // address. Anti-typo gate: confirm-last-4-chars input appears
    // only after a syntactically valid address is in the main field.

    /** @private */
    SetupConversation.prototype._renderCard4 = function (seq) {
        var t = root.enmT;
        var heading = t('friendly.setup.card_4.title');
        // BPoS-only operators see a shorter sub-line (no Arbiter copy
        // because there's no Arbiter on the BPoS path). The label
        // wording is otherwise the same — one wallet input.
        var sub = (this._goal === 'council')
            ? t('friendly.setup.card_4.sub')
            : t('friendly.setup.card_4.sub_bpos');
        var rewardHint = (this._goal === 'council')
            ? t('friendly.setup.card_4.reward_hint')
            : t('friendly.setup.card_4.reward_hint_bpos');
        this.root.setAttribute('aria-label', heading);
        this._body.innerHTML = ''
            + '<h2 class="enm-wiz-heading" id="enm-wiz-heading-4">' + escapeHtml(heading) + '</h2>'
            + '<p class="enm-wiz-para">' + escapeHtml(sub) + '</p>'
            + '<form class="enm-council-form" novalidate>'
            +   '<label class="enm-council-form-row">'
            +     '<span class="enm-council-form-label">'
            +       escapeHtml(t('friendly.setup.card_4.reward_label')) + '</span>'
            +     '<input type="text" id="enm-wiz-4-reward" spellcheck="false" '
            +       'autocomplete="off" placeholder="0x…" required>'
            +     '<span class="enm-council-form-hint">' + escapeHtml(rewardHint) + '</span>'
            +     '<span class="enm-council-form-error" data-for="reward" hidden></span>'
            // 0.5.102 audit Session 102 — EIP-55 mixed-case warning
            // span, separate from the error span so it can display
            // alongside a valid-format address (operator pastes a
            // mixed-case address — format is valid, but checksum
            // might be wrong). Inline-styled (no CSS class) per the
            // audit-chain pattern of avoiding CSS changes in
            // session-scope code fixes.
            +     '<span class="enm-council-form-warn" data-for="reward" hidden '
            +       'style="color: var(--state-warning, #c97a00); '
            +       'font-size: 12px; display: block; margin-top: 4px;"></span>'
            +   '</label>'
            +   '<label class="enm-council-form-row" id="enm-wiz-4-confirm-row" hidden>'
            +     '<span class="enm-council-form-label">'
            +       escapeHtml(t('friendly.setup.card_4.confirm_label')) + '</span>'
            +     '<input type="text" id="enm-wiz-4-last4" spellcheck="false" '
            +       'autocomplete="off" maxlength="4" '
            +       'placeholder="last 4 chars" style="text-transform:lowercase">'
            +     '<span class="enm-council-form-hint">'
            +       escapeHtml(t('friendly.setup.card_4.confirm_hint')) + '</span>'
            +     '<span class="enm-council-form-error" data-for="last4" hidden></span>'
            +   '</label>'
            + '</form>';

        var self = this;
        var rewardEl = this._body.querySelector('#enm-wiz-4-reward');
        var last4Row = this._body.querySelector('#enm-wiz-4-confirm-row');
        var last4El  = this._body.querySelector('#enm-wiz-4-last4');

        // Pre-fill if operator navigated back from a later card.
        if (this._sharedRewardAddress) {
            rewardEl.value = this._sharedRewardAddress;
            last4Row.hidden = false;
        }

        function showError(field, msg) {
            var el = self._body.querySelector(
                '.enm-council-form-error[data-for="' + field + '"]');
            if (el) { el.textContent = msg; el.hidden = !msg; }
        }
        // 0.5.102 audit Session 102 — parallel showWarn for the
        // EIP-55 mixed-case soft warning (Session 50 backlog #3).
        function showWarn(field, msg) {
            var el = self._body.querySelector(
                '.enm-council-form-warn[data-for="' + field + '"]');
            if (el) { el.textContent = msg; el.hidden = !msg; }
        }
        // v0.5.216 audit Phase 2 (AUDIT-FLOW-C401/B01, P1) — the previous
        // `validateEth` + `hasMixedCase` + `normalizeEthInput` inline
        // helpers are gone; same logic now lives in js/utils-eth.js
        // (root.enmEthAddress) so settings-tab.js Class B + this Card
        // share ONE source of truth (closes XFLOW-04 + XFLOW-16
        // duplication). The shared helper also adds a HARD-block on
        // wrong EIP-55 checksum (via vendored js-sha3 keccak-256), so
        // a mixed-case address with one char's case flipped — which
        // would silently send rewards to a different account — is now
        // rejected at save time rather than passing through the soft
        // warning that the operator could ignore.
        var ethApi = root.enmEthAddress;
        // Defensive: if utils-eth.js failed to load (script order bug
        // / network blip), fall back to the pre-v0.5.216 soft warning
        // behavior so the wizard stays usable. This preserves operator
        // flow at the cost of dropping the EIP-55 hard-block until
        // utils-eth comes back.
        function checkAddr(raw) {
            if (ethApi && typeof ethApi.check === 'function') {
                return ethApi.check(raw);
            }
            // Stub matching enmEthAddress.check shape for the fallback.
            var stripped = String(raw == null ? '' : raw).replace(/\s+/g, '');
            if (/^0X/.test(stripped)) { stripped = '0x' + stripped.slice(2); }
            if (/^0x[0-9a-fA-F]{40}$/.test(stripped)) {
                return { ok: true, normalized: stripped, warn: 'no_keccak' };
            }
            if (/^[0-9a-fA-F]{40}$/.test(stripped)) {
                return { ok: false, error: 'missing_0x', suggested: '0x' + stripped };
            }
            return { ok: false, error: 'format' };
        }
        // Map enmEthAddress.check error codes → operator-facing copy.
        function errMessage(r) {
            if (!r || r.ok) { return ''; }
            if (r.error === 'missing_0x') {
                return t('friendly.setup.card_4.err_missing_0x',
                    { suggested: r.suggested });
            }
            if (r.error === 'eip55_checksum') {
                // New copy: HARD-block message + suggested canonical form.
                // strings.js still ships warn_mixed_case for the soft path.
                return 'Wrong checksum — looks like a typo. Did you mean: '
                    + (r.suggested || '?')
                    + ' (paste fresh from your wallet to be safe).';
            }
            return t('friendly.setup.card_4.err_format');
        }

        rewardEl.addEventListener('input', function () {
            showError('reward', '');
            showError('last4', '');
            var r = checkAddr(rewardEl.value);
            if (r.ok) {
                last4Row.hidden = false;
                if (r.warn === 'no_keccak' && ethApi && ethApi.hasMixedCase(r.normalized)) {
                    // utils-eth degraded mode (keccak unavailable) —
                    // preserve the pre-v0.5.216 soft warning so the
                    // operator at least sees the EIP-55 awareness hint.
                    showWarn('reward', t('friendly.setup.card_4.warn_mixed_case'));
                } else {
                    showWarn('reward', '');
                }
            } else {
                last4Row.hidden = true;
                last4El.value = '';
                showWarn('reward', '');
            }
        });

        this._cancelBtn.hidden = false;
        this._cancelBtn.textContent = t('friendly.setup.back');
        this._cancelBtn.addEventListener('click', function () {
            if (self._destroyed) { return; }
            self._goto('3');
        });
        this._continueBtn.hidden = false;
        this._continueBtn.disabled = false;
        this._continueBtn.textContent = t('friendly.setup.card_4.cta');
        this._continueBtn.addEventListener('click', function () {
            if (self._destroyed || !self._stillRendering(seq)) { return; }
            showError('reward', '');
            showError('last4', '');
            // v0.5.216 audit Phase 2 — single shared validation through
            // root.enmEthAddress (formerly 3 inline helpers). If r.error
            // === 'eip55_checksum' the HARD-block fires: a mixed-case
            // address with one char's case flipped used to pass through
            // the soft warning and silently send rewards to a different
            // account (AUDIT-FLOW-C401, P1). Now blocked at save time.
            var raw = rewardEl.value;
            var r = checkAddr(raw);
            if (r.ok && r.normalized && r.normalized !== raw) {
                rewardEl.value = r.normalized;
            }
            if (!r.ok) {
                showError('reward', errMessage(r));
                return;
            }
            var reward = r.normalized;
            var last4 = (last4El.value || '').trim().toLowerCase();
            var expected = reward.slice(-4).toLowerCase();
            if (last4.length === 0) {
                showError('last4', t('friendly.setup.card_4.err_last4_empty'));
                return;
            }
            if (last4 !== expected) {
                showError('last4',
                    t('friendly.setup.card_4.err_last4_match', { expected: expected }));
                return;
            }
            self._sharedRewardAddress = reward;
            self._goto('5');
        });
    };

    // ====================================================================
    // Card 5 — confirm + install (preflight + snapshot toggle + go)
    // ====================================================================
    //
    // Auto-runs GET /setup/install-council/preflight on mount, renders
    // each check as a row. Below the list: a "use official mainchain
    // snapshot" checkbox (default ON; ~10 GB download, ~220 GB free
    // needed for chaindata growth). v0.5.199 — mainchain only; EVM
    // chains always cold-sync from peers (see EnmSnapshotDownloader
    // for the nodekey-contamination rationale). Below that: the big
    // "Install everything" button which POSTs to /setup/install-council
    // with { masterPassword, sharedRewardAddress, useSnapshots,
    // activeNet }. BPoS path skips install-council entirely and goes
    // directly to /setup/install/mainchain.

    /** @private */
    SetupConversation.prototype._renderCard5 = function (seq) {
        var t = root.enmT;
        var heading = t('friendly.setup.card_5.title');
        var sub = (this._goal === 'council')
            ? t('friendly.setup.card_5.sub')
            : t('friendly.setup.card_5.sub_bpos');
        this.root.setAttribute('aria-label', heading);
        // v0.5.236 — initial-sync strategy choice (Council only; a BPoS node
        // runs only the mainchain, so "2 at a time" is meaningless there).
        // Default 'concurrent' (all-at-once, for recommended hardware); the
        // operator opts into 'staged' for lower-end hardware. Writes
        // this._syncStrategy, sent in the install-council body by _beginInstall.
        var stageRadioHtml = (this._goal === 'council')
            ? ('<fieldset class="enm-council-form-row enm-card5-syncmode">'
            +   '<legend class="enm-council-form-label">Initial sync</legend>'
            +   '<label class="enm-council-form-checkbox">'
            +     '<input type="radio" name="enm-wiz-5-syncstrategy" value="concurrent" checked>'
            +     '<span>'
            +       '<span class="enm-council-form-label">Start all chains at once (fastest)</span>'
            +       '<span class="enm-council-form-hint">Best on recommended hardware. All chains sync in parallel — quickest to fully online.</span>'
            +     '</span>'
            +   '</label>'
            +   '<label class="enm-council-form-checkbox">'
            +     '<input type="radio" name="enm-wiz-5-syncstrategy" value="staged">'
            +     '<span>'
            +       '<span class="enm-council-form-label">Conserve resources — sync 2 chains at a time</span>'
            +       '<span class="enm-council-form-hint">For lower-end hardware. Brings up 2 chains, waits for them to finish syncing, then starts the rest. Initial sync takes longer but won\'t overload the host (initial sync is the heaviest part).</span>'
            +     '</span>'
            +   '</label>'
            + '</fieldset>')
            : '';
        this._body.innerHTML = ''
            + '<h2 class="enm-wiz-heading" id="enm-wiz-heading-5">' + escapeHtml(heading) + '</h2>'
            + '<p class="enm-wiz-para">' + escapeHtml(sub) + '</p>'
            + '<ul class="enm-preflight-list" role="status" aria-live="polite">'
            +   '<li class="enm-preflight-row" data-state="checking">'
            +     '<span class="enm-preflight-icon">⟳</span>'
            +     '<span class="enm-preflight-text">'
            +       escapeHtml(t('friendly.setup.card_5.running')) + '</span>'
            +   '</li>'
            + '</ul>'
            + '<div class="enm-preflight-actions">'
            +   '<button type="button" class="enm-btn enm-btn-secondary" '
            +     'data-action="rerun">'
            +     escapeHtml(t('friendly.setup.card_5.rerun')) + '</button>'
            + '</div>'
            + '<label class="enm-council-form-row enm-council-form-checkbox '
            +   'enm-card5-snapshots">'
            +   '<input type="checkbox" id="enm-wiz-5-snapshots" checked>'
            +   '<span>'
            +     '<span class="enm-council-form-label">'
            +       escapeHtml(t('friendly.setup.card_5.snapshot_label')) + '</span>'
            +     '<span class="enm-council-form-hint">'
            +       escapeHtml(t('friendly.setup.card_5.snapshot_hint')) + '</span>'
            // v0.5.199 — second hint line that makes the mainchain-only
            // policy EXPLICIT (toggle controls mainchain snapshot only;
            // EVM sidechains always cold-sync from peers regardless).
            +     '<span class="enm-council-form-hint enm-council-form-hint-evm">'
            +       escapeHtml(t('friendly.setup.card_5.snapshot_evm_note')) + '</span>'
            +   '</span>'
            + '</label>'
            + stageRadioHtml;

        var self = this;
        var listEl   = this._body.querySelector('.enm-preflight-list');
        var rerunBtn = this._body.querySelector('[data-action="rerun"]');
        var snapsEl  = this._body.querySelector('#enm-wiz-5-snapshots');

        // v0.5.236 — track the sync-strategy radio (Council only). Default
        // 'concurrent'; flip to 'staged' when the operator picks the
        // conserve-resources option for lower-end hardware.
        this._syncStrategy = this._syncStrategy || 'concurrent';
        var syncRadios = this._body.querySelectorAll('input[name="enm-wiz-5-syncstrategy"]');
        Array.prototype.forEach.call(syncRadios, function (r) {
            if (r.checked) { self._syncStrategy = r.value; }
            r.addEventListener('change', function () {
                if (r.checked) { self._syncStrategy = r.value; }
            });
        });

        this._cancelBtn.hidden = false;
        this._cancelBtn.textContent = t('friendly.setup.back');
        this._cancelBtn.addEventListener('click', function () {
            if (self._destroyed) { return; }
            self._goto('4');
        });
        this._continueBtn.hidden = false;
        this._continueBtn.disabled = true;
        this._continueBtn.textContent = (self._goal === 'council')
            ? t('friendly.setup.card_5.cta')
            : t('friendly.setup.card_5.cta_bpos');

        function runPreflight() {
            // 0.5.21 audit Session 21 — disable Re-run button during in-
            // flight request. Pre-0.5.21 a fast double-click fired two
            // parallel preflight calls; whichever resolved last won the
            // DOM. _stillRendering(seq) already absorbs stale callbacks
            // when navigating between cards, but same-card double-fire
            // races weren't gated.
            rerunBtn.disabled = true;
            listEl.innerHTML = '<li class="enm-preflight-row" data-state="checking">'
                + '<span class="enm-preflight-icon">⟳</span>'
                + '<span class="enm-preflight-text">'
                + escapeHtml(t('friendly.setup.card_5.running')) + '</span></li>';
            self._continueBtn.disabled = true;
            // BPoS path uses the lighter mainchain preflight (no
            // disk-250GB / upstream-arbiter checks); Council uses the
            // full install-council preflight.
            var endpoint = (self._goal === 'council')
                ? '/setup/install-council/preflight'
                : '/setup/preflight';
            self.api.get(endpoint, { skipCache: true })
                .then(function (result) {
                    if (self._destroyed || !self._stillRendering(seq)) { return; }
                    rerunBtn.disabled = false;
                    self._renderCard5Preflight(listEl, result);
                })
                .catch(function (err) {
                    if (self._destroyed || !self._stillRendering(seq)) { return; }
                    rerunBtn.disabled = false;
                    // 0.5.21 audit Session 21 — error row now matches the
                    // visual structure of success rows (label + message)
                    // and surfaces a retry hint pointing at the Re-run
                    // button. Pre-0.5.21 dumped "Pre-flight call failed:
                    // Failed to fetch" in a flat <span> with no recovery
                    // affordance.
                    var errMsg = (err && err.message) || String(err);
                    var labelText = t('friendly.setup.card_5.err_label')
                        || 'Pre-flight check could not run';
                    var bodyTpl = t('friendly.setup.card_5.err_body')
                        || 'Network or server problem: {error}';
                    var bodyText = bodyTpl.replace('{error}', errMsg);
                    var retryHint = t('friendly.setup.card_5.err_retry_hint')
                        || 'Press Re-run pre-flight above to try again.';
                    listEl.innerHTML = '<li class="enm-preflight-row" data-state="error">'
                        + '<span class="enm-preflight-icon">✗</span>'
                        + '<div class="enm-preflight-text">'
                        +   '<div class="enm-preflight-label">' + escapeHtml(labelText) + '</div>'
                        +   '<div class="enm-preflight-message">'
                        +     escapeHtml(bodyText) + ' ' + escapeHtml(retryHint)
                        +   '</div>'
                        + '</div></li>';
                });
        }

        rerunBtn.addEventListener('click', runPreflight);
        this._continueBtn.addEventListener('click', function () {
            if (self._destroyed || !self._stillRendering(seq)) { return; }
            if (self._continueBtn.disabled) { return; }
            self._continueBtn.disabled = true;
            self._continueBtn.textContent = t('friendly.setup.card_5.cta_working');
            self._beginInstall(seq, !!(snapsEl && snapsEl.checked));
        });
        runPreflight();
    };

    /**
     * 0.5.5 audit Session 5 CRITICAL fix — normalize BPoS preflight shape.
     *
     * `/setup/install-council/preflight` returns `{ checks:[], allRequiredOk }`.
     * `/setup/preflight` (BPoS path, mainchain only) returns the OLDER shape
     * `{ os, disk, wallet, clockSkew }`. Pre-0.5.5 Card 5 only knew the
     * Council shape — on the BPoS path `result.checks` was empty, zero rows
     * rendered, and `allRequiredOk` was undefined (fell back to canProceed=
     * true) so the Continue button was ENABLED with no visible preflight.
     * Operator could blow past a failing OS check or a critical disk-low
     * warning with no UI signal at all.
     *
     * This transformer flattens both shapes into a `checks[]` array of the
     * same per-row contract (id/label/ok/severity/message). Existing render
     * loop below consumes the unified array; both paths now surface their
     * actual hardware/network state.
     */
    function normalizePreflight(result) {
        if (!result) return { checks: [], allRequiredOk: false };
        if (Array.isArray(result.checks)) {
            return result;  // Council shape, already normalized
        }
        // BPoS shape — flatten into checks[].
        var checks = [];
        if (result.os) {
            checks.push({
                id: 'os',
                label: 'Operating system',
                ok: !!result.os.ok,
                severity: 'required',
                message: result.os.ok
                    ? (result.os.distroId ? 'Detected: ' + result.os.distroId
                        + (result.os.version ? ' ' + result.os.version : '')
                        : 'OK')
                    : (result.os.reason || 'Unsupported OS'),
            });
        }
        if (result.disk) {
            var diskOk = result.disk.ok && result.disk.status !== 'critical';
            var diskSev = result.disk.status === 'critical' ? 'required'
                        : (result.disk.status === 'warning' ? 'recommended' : 'required');
            var diskMsg = result.disk.reason
                || ((result.disk.freeGb || 0).toFixed(1) + ' GB free of '
                    + ((result.disk.totalGb || 0).toFixed(1) + ' GB'));
            checks.push({
                id: 'disk',
                label: 'Disk space (mainchain)',
                ok: diskOk,
                severity: diskSev,
                message: diskMsg,
            });
        }
        if (result.wallet) {
            checks.push({
                id: 'wallet',
                label: 'Owner wallet (authenticated)',
                ok: !!result.wallet.ok,
                severity: 'required',
                message: result.wallet.walletAddress
                    ? 'Signed in as ' + result.wallet.walletAddress.slice(0, 6)
                      + '…' + result.wallet.walletAddress.slice(-4)
                    : 'Owner identity verified',
            });
        }
        if (result.clockSkew) {
            var skew = result.clockSkew;
            // Soft-skipped skew checks render as a warning row (not blocking).
            var skewSev = skew.skipped ? 'recommended' : 'required';
            var skewMsg = skew.skipped
                ? ('Skipped: ' + (skew.reason || 'probe unreachable'))
                : (typeof skew.absSkewMs === 'number'
                    ? ('Clock drift ' + skew.absSkewMs + ' ms '
                       + '(limit ' + (skew.maxSkewMs || '?') + ' ms)')
                    : 'NTP probe complete');
            checks.push({
                id: 'clock-skew',
                label: 'Clock skew (vs internet time)',
                ok: !!skew.ok,
                severity: skewSev,
                message: skewMsg,
            });
        }
        var allRequiredOk = checks
            .filter(function (c) { return c.severity === 'required'; })
            .every(function (c) { return c.ok; });
        return { checks: checks, allRequiredOk: allRequiredOk };
    }

    /** @private */
    SetupConversation.prototype._renderCard5Preflight = function (listEl, result) {
        var t = root.enmT;
        // 0.5.5 audit Session 5 — flatten both Council and BPoS preflight
        // shapes via normalizePreflight before render.
        var normalized = normalizePreflight(result);
        listEl.innerHTML = '';
        var checks = normalized.checks || [];
        checks.forEach(function (c) {
            var icon = c.ok ? '✓' : (c.severity === 'required' ? '✗' : '⚠');
            var stateAttr = c.ok ? 'ok'
                          : (c.severity === 'required' ? 'error' : 'warn');
            var row = document.createElement('li');
            row.className = 'enm-preflight-row';
            row.setAttribute('data-state', stateAttr);
            row.innerHTML = ''
                + '<span class="enm-preflight-icon">' + icon + '</span>'
                + '<div class="enm-preflight-text">'
                +   '<div class="enm-preflight-label">' + escapeHtml(c.label || c.id || '') + '</div>'
                +   '<div class="enm-preflight-message">' + escapeHtml(c.message || '') + '</div>'
                + '</div>';
            listEl.appendChild(row);
        });
        // 0.5.5 audit Session 5 — both shapes now flow through
        // normalizePreflight which always sets allRequiredOk to a real
        // boolean (true iff every required check is ok). Pre-0.5.5 the
        // BPoS shape returned undefined which fell through to canProceed
        // =true, silently bypassing every preflight failure on BPoS.
        var canProceed = !!normalized.allRequiredOk;
        this._continueBtn.disabled = !canProceed;
        if (!canProceed) {
            var helpRow = document.createElement('li');
            helpRow.className = 'enm-preflight-row';
            helpRow.setAttribute('data-state', 'warn');
            helpRow.innerHTML = '<span class="enm-preflight-icon">!</span>'
                + '<div class="enm-preflight-text">'
                +   '<div class="enm-preflight-message">'
                +     escapeHtml(t('friendly.setup.card_5.blocked'))
                +   '</div>'
                + '</div>';
            listEl.appendChild(helpRow);
        }
    };

    /**
     * Start the install + advance to Card 6 stepper. Council path
     * POSTs /setup/install-council with the new v0.4.7 payload
     * shape; BPoS path runs the simpler mainchain install + complete
     * sequence and skips Card 6's stepper (handled inside Card 6).
     * @private
     */
    SetupConversation.prototype._beginInstall = function (seq, useSnapshots) {
        var t = root.enmT;
        var self = this;
        if (this._goal === 'council') {
            // Stash inputs for the stepper to read on mount.
            this._installInputs = {
                masterPassword: this._masterPassword,
                // Backend's install-council validator still keys off
                // `rewardAddress`; we ALSO send `sharedRewardAddress`
                // to match the v0.4.7 frontend contract documented in
                // the prompt, so future backend schema changes don't
                // need a coordinated wizard rev.
                rewardAddress: this._sharedRewardAddress,
                sharedRewardAddress: this._sharedRewardAddress,
                useSnapshots: !!useSnapshots,
                // v0.5.236 — initial-sync strategy from Card 5's radio.
                // 'staged' → backend brings heavy chains up 2-at-a-time.
                syncStrategy: this._syncStrategy || 'concurrent',
                activeNet: 'mainnet',
            };
            this._goto('6');
        } else {
            // BPoS path: kick the mainchain installer directly, then
            // Card 6 watches setup:install:mainchain SSE. Inputs
            // stashed so Card 6 can re-trigger on retry.
            this._installInputs = {
                masterPassword: this._masterPassword,
                rewardAddress: this._sharedRewardAddress,
                useSnapshots: !!useSnapshots,
            };
            this._goto('6');
        }
    };

    // ====================================================================
    // Card 6 — install stepper (SSE + poll fallback + auto-resume)
    // ====================================================================
    //
    // For Council: subscribes to `setup:council:install`, renders 16
    // steps from the new orchestrator PLAN:
    //   council-strategy → install-{esc,eid,pg}-cfg →
    //   download-snapshots-parallel → install-binaries-parallel →
    //   install-node-runtime → download-oracle-scripts →
    //   install-{esc,eid,pg}-oracle → install-arbiter-cfg →
    //   start-chains.
    // Poll fallback (3s tick) if SSE silent for 30s. Auto-resume on
    // refresh: GET /install-council/status to see if a job is running.
    //
    // For BPoS: subscribes to `setup:install:mainchain`, then on
    // done runs /setup/network + /setup/complete + /chains/mainchain/
    // start (same finalize as the old Card D). The stepper renders
    // a 3-step plan: install-mainchain → finalize-setup → start-chain.

    // Step labels track the server-side install-council PLAN exactly.
    // Always covers all 4 chains (PG opt-out removed by operator
    // directive 2026-05-19). install-binaries-parallel covers ESC +
    // EID + PG + Arbiter binaries.
    // v0.5.199 — download-snapshots-parallel covers MAINCHAIN ONLY.
    // EVM chains (esc/eid/pg) cold-sync from peers after install
    // (the upstream EVM snapshots embed a duplicate nodekey — see
    // EnmSnapshotDownloader.SNAPSHOT_SOURCES for the full rationale).
    //
    // 0.5.24 audit Session 24 — labels rewritten to progressive verb
    // form so every row reads as an action ("Installing X" rather
    // than "X (config)"). Implementation leaks dropped: "(in parallel)",
    // "(ela binary)", "(crosschain_*.js)" — operator doesn't care.
    // Display name "Main chain" replaces raw "mainchain" id (parity
    // with chain_name.* convention used everywhere else since v0.5.18).
    var COUNCIL_STEP_LABELS = {
        'council-strategy':           'Planning Council install',
        'install-mainchain-binary':   'Installing Main chain',
        'install-mainchain-keystore': 'Creating Main chain keystore',
        'install-mainchain-cfg':      'Writing Main chain config',
        'install-esc-cfg':            'Configuring Smart Chain (ESC)',
        'install-eid-cfg':            'Configuring Identity Chain (EID)',
        'install-pg-cfg':             'Configuring PG Chain',
        'download-snapshots-parallel':'Downloading mainchain snapshot',
        'install-binaries-parallel':  'Downloading sidechain binaries',
        'install-node-runtime':       'Setting up Node.js (for oracles)',
        'download-oracle-scripts':    'Downloading oracle scripts',
        'install-esc-oracle':         'Installing ESC Oracle',
        'install-eid-oracle':         'Installing EID Oracle',
        'install-pg-oracle':          'Installing PG Oracle',
        'install-arbiter-cfg':        'Configuring Arbiter Service',
        'start-chains':               'Starting all chains',
    };
    var COUNCIL_STEP_ORDER = [
        'council-strategy',
        'install-mainchain-binary',
        'install-mainchain-keystore',
        'install-mainchain-cfg',
        'install-esc-cfg',
        'install-eid-cfg',
        'install-pg-cfg',
        'download-snapshots-parallel',
        'install-binaries-parallel',
        'install-node-runtime',
        'download-oracle-scripts',
        'install-esc-oracle',
        'install-eid-oracle',
        'install-pg-oracle',
        'install-arbiter-cfg',
        'start-chains',
    ];
    // 0.5.24 audit Session 24 — same progressive-verb + display-name
    // pass as the Council labels above. Keys unchanged so BPoS-only
    // backend flow is untouched (operator rule 4 reference behavior).
    var BPOS_STEP_LABELS = {
        'install-mainchain': 'Installing Main chain',
        'finalize-setup':    'Finalizing configuration',
        'start-chain':       'Starting Main chain',
    };
    var BPOS_STEP_ORDER = ['install-mainchain', 'finalize-setup', 'start-chain'];

    /** @private */
    SetupConversation.prototype._renderCard6 = function (seq) {
        if (this._goal === 'council') {
            this._renderCard6Council(seq);
        } else {
            this._renderCard6Bpos(seq);
        }
    };

    /** @private */
    SetupConversation.prototype._renderCard6Council = function (seq) {
        var t = root.enmT;
        var heading = t('friendly.setup.card_6.title');
        var sub = t('friendly.setup.card_6.sub');
        this.root.setAttribute('aria-label', heading);
        var stepsHtml = COUNCIL_STEP_ORDER.map(function (step) {
            return '<li class="enm-council-step" data-step="' + escapeHtml(step) + '" '
                +    'data-status="pending">'
                +  '<span class="enm-council-step-icon" aria-hidden="true">◯</span>'
                +  '<span class="enm-council-step-label">'
                +    escapeHtml(COUNCIL_STEP_LABELS[step]) + '</span>'
                +  '<span class="enm-council-step-message"></span>'
                + '</li>';
        }).join('');
        // 0.5.143 audit Session 143 — long-step guidance note for the
        // snapshot download phase. Shown only while
        // `download-snapshots-parallel` is the active running step;
        // hidden in every other phase. Operator-requested after they
        // sat watching the snapshot bar for 30+ minutes without any
        // expectation-setting about duration or what would interrupt
        // it. The note element is built up-front and toggled via the
        // [hidden] attribute in setStep / applyStatusSnapshot below
        // so the DOM doesn't re-flow when the step transitions.
        var snapNoteTitle = t('friendly.setup.card_6.snapshot_note_title');
        var snapNoteBody  = t('friendly.setup.card_6.snapshot_note_body');
        this._body.innerHTML = ''
            + '<h2 class="enm-wiz-heading" id="enm-wiz-heading-6">' + escapeHtml(heading) + '</h2>'
            + '<p class="enm-wiz-para">' + escapeHtml(sub) + '</p>'
            + '<ol class="enm-council-stepper" role="status" aria-live="polite">'
            +   stepsHtml
            + '</ol>'
            + '<div class="enm-council-step-note" data-for-step="download-snapshots-parallel" '
            +      'role="note" hidden>'
            +   '<div class="enm-council-step-note-title">' + escapeHtml(snapNoteTitle) + '</div>'
            +   '<div class="enm-council-step-note-body">' + escapeHtml(snapNoteBody) + '</div>'
            + '</div>'
            + '<div class="enm-council-summary" data-state="running">'
            +   '<div class="enm-install-bar" aria-hidden="true">'
            +     '<div class="enm-install-bar-fill" style="width:0%"></div>'
            +   '</div>'
            +   '<div class="enm-council-summary-text">Starting…</div>'
            + '</div>';

        var self = this;
        this._cancelBtn.hidden = true;
        this._continueBtn.hidden = false;
        this._continueBtn.disabled = true;
        this._continueBtn.textContent = t('friendly.setup.card_6.cta_working');

        function setStep(step, status, message) {
            var row = self._body.querySelector(
                '.enm-council-step[data-step="' + step + '"]');
            if (!row) { return; }
            row.setAttribute('data-status', status);
            var iconEl = row.querySelector('.enm-council-step-icon');
            var msgEl  = row.querySelector('.enm-council-step-message');
            if (status === 'start')      { iconEl.textContent = '⏵'; }
            else if (status === 'done')  { iconEl.textContent = '✓'; }
            else if (status === 'skip')  { iconEl.textContent = '⊘'; }
            else if (status === 'error') { iconEl.textContent = '✗'; }
            if (msgEl) { msgEl.textContent = message || ''; }
            // 0.5.143 audit Session 143 — show the snapshot-step
            // guidance note only while download-snapshots-parallel
            // is the active running step. Reveal on 'start', hide on
            // any terminal status (done / skip / error).
            var note = self._body.querySelector(
                '.enm-council-step-note[data-for-step="' + step + '"]');
            if (note) {
                note.hidden = (status !== 'start');
            }
        }
        function setSummary(state, text, percent) {
            var box = self._body.querySelector('.enm-council-summary');
            if (!box) { return; }
            box.setAttribute('data-state', state);
            var bar = box.querySelector('.enm-install-bar-fill');
            if (bar && typeof percent === 'number') {
                bar.style.width = percent + '%';
            }
            var tx = box.querySelector('.enm-council-summary-text');
            if (tx) { tx.textContent = text || ''; }
        }

        // Poll fallback (3s tick) — fires only when SSE has been
        // silent for 30s. Snapshot lands in applyStatusSnapshot.
        var lastEventAt = Date.now();
        function applyStatusSnapshot(s) {
            if (!s || !Array.isArray(s.completedSteps)) { return; }
            s.completedSteps.forEach(function (step) { setStep(step, 'done'); });
            // 0.5.6 audit Session 6 MEDIUM-1 fix — mark the failing step
            // red, not as 'start' (in-progress). Pre-0.5.6 a failed
            // install left the summary red but the offending step row
            // stayed yellow (start state). Operator could see "an error
            // happened" but had to read the summary text to know which
            // step. With s.error AND s.currentStep set, render the step
            // as 'error' so the stepper itself answers "which one died".
            if (s.currentStep
                    && COUNCIL_STEP_ORDER.indexOf(s.currentStep) !== -1) {
                setStep(s.currentStep, (!s.running && s.error) ? 'error' : 'start',
                    (!s.running && s.error) ? (s.error || '').replace(s.currentStep + ': ', '') : '');
            }
            var pct = s.totalSteps > 0
                ? Math.round((s.completedSteps.length / s.totalSteps) * 100)
                : 0;
            if (!s.running && s.success) {
                setSummary('done', t('friendly.setup.card_6.summary_done'), 100);
                self._continueBtn.disabled = false;
                self._continueBtn.textContent = t('friendly.setup.card_6.cta_done');
            } else if (!s.running && s.error) {
                setSummary('error', s.error, pct);
                self._continueBtn.disabled = false;
                self._continueBtn.textContent = t('friendly.setup.card_6.cta_retry');
            } else if (s.running) {
                // 0.5.144 audit Session 144 — summary text shows "Step N
                // of M" instead of duplicating the active step label
                // (the step row above the summary already shows the same
                // label with full visual treatment — repeating it in the
                // summary was operator-confusing "downloading snapshots
                // again when it was just finished").
                setSummary('running', buildSummaryText(s.currentStep), pct);
            }
        }
        function buildSummaryText(currentStep) {
            if (!currentStep) { return 'Working…'; }
            var idx = COUNCIL_STEP_ORDER.indexOf(currentStep);
            if (idx < 0) { return 'Working…'; }
            return 'Step ' + (idx + 1) + ' of ' + COUNCIL_STEP_ORDER.length;
        }
        function pollOnce() {
            if (self._destroyed || !self._stillRendering(seq)) { return; }
            self.api.get('/setup/install-council/status', { skipCache: true })
                .then(function (s) {
                    if (self._destroyed || !self._stillRendering(seq)) { return; }
                    applyStatusSnapshot(s);
                })
                .catch(function () { /* SSE may resume */ });
        }
        this._installPollTimer = setInterval(function () {
            if (Date.now() - lastEventAt > 30_000) { pollOnce(); }
        }, 3_000);

        if (this.sse && typeof this.sse.subscribe === 'function') {
            this._unsubscribeInstall = this.sse.subscribe(
                'setup:council:install',
                function (payload) {
                    if (self._destroyed || !self._stillRendering(seq)) { return; }
                    if (!payload || !payload.step) { return; }
                    lastEventAt = Date.now();
                    if (payload.step === 'finalize') {
                        if (payload.status === 'done') {
                            setSummary('done',
                                t('friendly.setup.card_6.summary_done'), 100);
                            self._continueBtn.disabled = false;
                            self._continueBtn.textContent =
                                t('friendly.setup.card_6.cta_done');
                        } else {
                            setSummary('error',
                                payload.message || t('friendly.setup.card_6.summary_error'),
                                payload.percent || 0);
                            self._continueBtn.disabled = false;
                            self._continueBtn.textContent =
                                t('friendly.setup.card_6.cta_retry');
                        }
                        return;
                    }
                    setStep(payload.step, payload.status, payload.message);
                    // 0.5.144 audit Session 144 — summary text shows
                    // "Step N of M" instead of repeating the active step
                    // label (the step row already shows the label +
                    // per-step message; mirroring it in the summary
                    // produced the "downloading snapshots again" double
                    // operator reported on Card 6).
                    setSummary('running', buildSummaryText(payload.step), payload.percent || 0);
                },
            );
        }

        // Auto-resume on refresh. If a job is running, just apply the
        // snapshot + let SSE take over. If it just finished
        // successfully (<60s ago), go straight to Card 7. Otherwise
        // POST install-council to kick a fresh job using the inputs
        // collected on Card 5.
        //
        // 0.5.6 audit Session 6 HIGH-2 fix — `_installInputs` is in-memory
        // only; a page refresh at Card 6 leaves it null. Pre-0.5.6 the
        // refresh path POSTed `{}` to install-council → backend rejected
        // 412 "masterPassword missing" → catch block showed a generic
        // network-error to the operator. Now: if NO job running AND no
        // recent success AND no in-memory inputs, redirect back to
        // Card 5 (with a notification) so the operator re-collects them.
        var inputs = this._installInputs;
        var inputsValid = inputs
            && typeof inputs.masterPassword === 'string'
            && inputs.masterPassword.length > 0
            && typeof (inputs.rewardAddress || inputs.sharedRewardAddress) === 'string';
        this.api.get('/setup/install-council/status', { skipCache: true })
            .then(function (s) {
                if (self._destroyed) { return; }
                if (s && s.running) {
                    applyStatusSnapshot(s);
                    return null;
                }
                if (s && s.success && s.finishedAt
                        && (Date.now() - s.finishedAt) < 60_000) {
                    self._goto('7');
                    return null;
                }
                if (!inputsValid) {
                    // Refresh-at-Card-6 with empty inputs path. Surface a
                    // notification + bounce to Card 5 so the operator can
                    // re-confirm the snapshot toggle + click Install.
                    if (self.notifications && typeof self.notifications.show === 'function') {
                        self.notifications.show({
                            id: 'card-6-refresh-recovery',
                            severity: 'info',
                            title: t('friendly.setup.card_6.refresh_recovery_title')
                                || 'Re-confirm install settings',
                            body: t('friendly.setup.card_6.refresh_recovery_body')
                                || 'You refreshed before the install started. '
                                 + 'Confirm your settings and click Install everything again.',
                        });
                    }
                    self._teardownInstallTracking();
                    self._goto('5');
                    return null;
                }
                return self.api.post('/setup/install-council', inputs);
            })
            .then(function (r) {
                if (self._destroyed || !r) { return; }
                if (r && r.success === false) {
                    setSummary('error',
                        r.error || t('friendly.setup.card_6.summary_error'), 0);
                    self._continueBtn.disabled = false;
                    self._continueBtn.textContent = t('friendly.setup.card_6.cta_retry');
                }
            })
            .catch(function (err) {
                if (self._destroyed) { return; }
                setSummary('error',
                    (err && err.message) || 'Network error', 0);
                self._continueBtn.disabled = false;
                self._continueBtn.textContent = t('friendly.setup.card_6.cta_retry');
            });

        this._continueBtn.addEventListener('click', function () {
            if (self._destroyed || !self._stillRendering(seq)) { return; }
            var state = self._body.querySelector('.enm-council-summary')
                .getAttribute('data-state');
            if (state === 'done') {
                self._teardownInstallTracking();
                try { window.localStorage.removeItem('enm:setup-intent'); } catch (_) {}
                self._goto('7');
            } else if (state === 'error') {
                self._teardownInstallTracking();
                self._renderCard6Council(self._cardSeq);
            }
        });
    };

    /** @private */
    SetupConversation.prototype._renderCard6Bpos = function (seq) {
        var t = root.enmT;
        var heading = t('friendly.setup.card_6.title');
        var sub = t('friendly.setup.card_6.sub_bpos');
        this.root.setAttribute('aria-label', heading);
        var stepsHtml = BPOS_STEP_ORDER.map(function (step) {
            return '<li class="enm-council-step" data-step="' + escapeHtml(step) + '" '
                +    'data-status="pending">'
                +  '<span class="enm-council-step-icon" aria-hidden="true">◯</span>'
                +  '<span class="enm-council-step-label">'
                +    escapeHtml(BPOS_STEP_LABELS[step]) + '</span>'
                +  '<span class="enm-council-step-message"></span>'
                + '</li>';
        }).join('');
        this._body.innerHTML = ''
            + '<h2 class="enm-wiz-heading" id="enm-wiz-heading-6">' + escapeHtml(heading) + '</h2>'
            + '<p class="enm-wiz-para">' + escapeHtml(sub) + '</p>'
            + '<ol class="enm-council-stepper" role="status" aria-live="polite">'
            +   stepsHtml
            + '</ol>'
            + '<div class="enm-council-summary" data-state="running">'
            +   '<div class="enm-install-bar" aria-hidden="true">'
            +     '<div class="enm-install-bar-fill" style="width:0%"></div>'
            +   '</div>'
            +   '<div class="enm-council-summary-text">Starting…</div>'
            + '</div>';

        var self = this;
        this._cancelBtn.hidden = true;
        this._continueBtn.hidden = false;
        this._continueBtn.disabled = true;
        this._continueBtn.textContent = t('friendly.setup.card_6.cta_working');

        function setStep(step, status, message) {
            var row = self._body.querySelector(
                '.enm-council-step[data-step="' + step + '"]');
            if (!row) { return; }
            row.setAttribute('data-status', status);
            var iconEl = row.querySelector('.enm-council-step-icon');
            var msgEl  = row.querySelector('.enm-council-step-message');
            if (status === 'start')      { iconEl.textContent = '⏵'; }
            else if (status === 'done')  { iconEl.textContent = '✓'; }
            else if (status === 'error') { iconEl.textContent = '✗'; }
            if (msgEl) { msgEl.textContent = message || ''; }
        }
        function setSummary(state, text, percent) {
            var box = self._body.querySelector('.enm-council-summary');
            if (!box) { return; }
            box.setAttribute('data-state', state);
            var bar = box.querySelector('.enm-install-bar-fill');
            if (bar && typeof percent === 'number') { bar.style.width = percent + '%'; }
            var tx = box.querySelector('.enm-council-summary-text');
            if (tx) { tx.textContent = text || ''; }
        }
        function fail(msg) {
            setSummary('error', msg, 0);
            self._continueBtn.disabled = false;
            self._continueBtn.textContent = t('friendly.setup.card_6.cta_retry');
        }

        // Three-step BPoS install: install binary → finalize cfg →
        // start chain. We subscribe to setup:install:mainchain for
        // the binary phase, then drive the finalize/start sequence
        // ourselves (no SSE for those — they're synchronous calls).
        var installDone = false;
        function applyBinaryStatus(s) {
            if (!s || installDone || self._destroyed
                    || !self._stillRendering(seq)) { return; }
            var pct = (s.bytesTotal && s.bytesDownloaded)
                ? Math.min(100, Math.floor((s.bytesDownloaded / s.bytesTotal) * 100))
                : (s.phase === 'done' ? 100 : (s.phase === 'verifying' ? 95 : 5));
            // Map binary install pct into the first step's row +
            // overall progress bar (split into 3 equal thirds for
            // BPoS: 0-33% binary, 33-66% finalize, 66-100% start).
            setStep('install-mainchain', s.phase === 'done' ? 'done' : 'start',
                s.phase + (s.bytesTotal ? ' — ' + pct + '%' : ''));
            setSummary('running',
                BPOS_STEP_LABELS['install-mainchain']
                    + (s.bytesTotal ? ' — ' + pct + '%' : ''),
                Math.round(pct / 3));
            if (s.phase === 'failed') {
                installDone = true;
                setStep('install-mainchain', 'error', s.error || 'failed');
                fail(s.error || 'install failed');
            }
            if (s.phase === 'done') {
                installDone = true;
                runFinalize();
            }
        }

        function runFinalize() {
            setStep('finalize-setup', 'start');
            setSummary('running', BPOS_STEP_LABELS['finalize-setup'], 50);
            self.api.post('/setup/network', { mode: 'auto' })
                .then(function () {
                    if (self._destroyed) { return null; }
                    return self.api.post('/setup/complete', {});
                })
                .then(function () {
                    if (self._destroyed) { return; }
                    setStep('finalize-setup', 'done');
                    runStart();
                })
                .catch(function (err) {
                    if (self._destroyed) { return; }
                    setStep('finalize-setup', 'error',
                        (err && err.message) || String(err));
                    fail((err && err.message) || String(err));
                });
        }

        function runStart() {
            setStep('start-chain', 'start');
            setSummary('running', BPOS_STEP_LABELS['start-chain'], 80);
            self.api.post('/chains/mainchain/start', {})
                .then(function () {
                    if (self._destroyed) { return; }
                    setStep('start-chain', 'done');
                    setSummary('done',
                        t('friendly.setup.card_6.summary_done'), 100);
                    self._continueBtn.disabled = false;
                    self._continueBtn.textContent =
                        t('friendly.setup.card_6.cta_done');
                })
                .catch(function (err) {
                    if (self._destroyed) { return; }
                    // Setup is OK even if start fails — surface as a
                    // warning + let operator open the dashboard.
                    setStep('start-chain', 'error',
                        (err && err.message) || String(err));
                    setSummary('done',
                        t('friendly.setup.card_6.summary_done')
                            + ' (chain didn\'t start; open the dashboard '
                            + 'and press Start.)',
                        100);
                    self._continueBtn.disabled = false;
                    self._continueBtn.textContent =
                        t('friendly.setup.card_6.cta_done');
                });
        }

        if (this.sse && typeof this.sse.subscribe === 'function') {
            this._unsubscribeInstall = this.sse.subscribe(
                'setup:install:mainchain', applyBinaryStatus);
        }
        // Poll fallback for the binary phase. Stops once
        // installDone latches true (finalize/start run sync).
        this._installPollTimer = setInterval(function () {
            if (installDone || self._destroyed || !self._stillRendering(seq)) {
                return;
            }
            self.api.get('/setup/install-status/mainchain', { skipCache: true })
                .then(function (s) {
                    if (self._destroyed) { return; }
                    applyBinaryStatus(s);
                })
                .catch(function () { /* poll again */ });
        }, 2500);

        // Kick the install. Idempotent on the backend.
        this.api.post('/setup/install/mainchain', {})
            .then(function (resp) {
                if (self._destroyed) { return; }
                applyBinaryStatus(resp && resp.status);
            })
            .catch(function (err) {
                if (self._destroyed) { return; }
                applyBinaryStatus({
                    phase: 'failed',
                    error: (err && err.message) || String(err),
                });
            });

        this._continueBtn.addEventListener('click', function () {
            if (self._destroyed || !self._stillRendering(seq)) { return; }
            var state = self._body.querySelector('.enm-council-summary')
                .getAttribute('data-state');
            if (state === 'done') {
                self._teardownInstallTracking();
                try { window.localStorage.removeItem('enm:setup-intent'); } catch (_) {}
                self._goto('7');
            } else if (state === 'error') {
                self._teardownInstallTracking();
                self._renderCard6Bpos(self._cardSeq);
            }
        });
    };

    // ====================================================================
    // Card 7 — done (celebrate + open dashboard)
    // ====================================================================

    /** @private */
    SetupConversation.prototype._renderCard7 = function (seq) {
        var t = root.enmT;
        var heading = (this._goal === 'council')
            ? t('friendly.setup.card_7.title')
            : t('friendly.setup.card_7.title_bpos');
        var sub = (this._goal === 'council')
            ? t('friendly.setup.card_7.sub')
            : t('friendly.setup.card_7.sub_bpos');
        this.root.setAttribute('aria-label', heading);
        this._body.innerHTML = ''
            + '<h2 class="enm-wiz-heading" id="enm-wiz-heading-7">' + escapeHtml(heading) + '</h2>'
            + '<p class="enm-wiz-para">' + escapeHtml(sub) + '</p>';

        var self = this;
        this._cancelBtn.hidden = true;
        this._continueBtn.hidden = false;
        this._continueBtn.disabled = false;
        this._continueBtn.textContent = t('friendly.setup.card_7.cta');
        this._continueBtn.addEventListener('click', function onDone() {
            if (self._destroyed || !self._stillRendering(seq)) { return; }
            self._continueBtn.removeEventListener('click', onDone);
            // 0.5.7 audit Session 7 HIGH fix — clear both localStorage
            // entries on Card 7 dismiss. Pre-0.5.7 only enm:setup-intent
            // was cleared; enm:master-pw stayed indefinitely. The
            // password is no longer needed in browser storage after
            // setup completes — backend has cfg.global.council
            // .masterPasswordEncrypted, operator has it in their
            // password manager (we ensured via the ack checkbox). Any
            // future XSS / compromised extension / debug session reading
            // localStorage from this origin would otherwise extract it.
            try { window.localStorage.removeItem('enm:setup-intent'); } catch (_) {}
            try { window.sessionStorage.removeItem('enm:master-pw'); } catch (_) {}
            // v0.5.227 audit Phase 17 follow-up (AUDIT-FLOW-C301, P2) — also
            // clean the legacy localStorage entry from operators upgrading
            // from a pre-v0.5.227 build (we moved to sessionStorage above).
            // One-shot best-effort migration; safe to keep indefinitely.
            try { window.localStorage.removeItem('enm:master-pw'); } catch (_) {}
            self.onComplete();
        });
    };

    // ====================================================================
    // Helpers
    // ====================================================================

    /** @private */
    SetupConversation.prototype._stillRendering = function (seq) {
        return !this._destroyed && this.root.isConnected && this._cardSeq === seq;
    };

    /** @private */
    SetupConversation.prototype._notify = function (title, body, severity) {
        if (!this.notifications) { return; }
        var fn = severity === 'warning' ? 'warning' : 'info';
        if (typeof this.notifications[fn] === 'function') {
            this.notifications[fn](title, body);
        }
    };

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    root.EnmSetupConversation = SetupConversation;
}(typeof window !== 'undefined' ? window : globalThis));
