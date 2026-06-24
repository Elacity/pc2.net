/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/proposal-card.js — own simple OWNER-CONFIRMS proposal review.
 *
 * Beta 3 rewrite: shares the phase-06 modal-card chrome (.enm-modal-scrim +
 * .enm-modal-card + .enm-modal-* body classes) with the tools-update modal.
 * The old enm-proposal-overlay / enm-proposal-card / enm-proposal-* shapes
 * are gone — every selector in this file resolves against the shared
 * phase-06 stylesheet that lives in css/styles.css.
 *
 * Body order (matches mock at enm-design-mocks/v2/phase-06-wizard-modals.html
 * lines 418-432):
 *   heading → summary → (reason) → ack checkbox → (anti-snipe input) →
 *   actions row (cooldown · Confirm · Reject) → reject-reason input
 *
 * UX invariants preserved from alpha.28:
 *   - 4-second cooldown on Confirm button (prevents accidental clicks)
 *   - Required checkbox: "I understand this will [action]"
 *   - Optional anti-snipe password prompt if proposal.requireAntiSnipe
 *   - Reject button immediately enabled with optional reason
 *   - Modal overlay; ESC closes WITHOUT acting (alpha.28.1 batch 72)
 *   - 401 suppression on both confirm + reject (batches 60-61)
 *   - 409 conflict-envelope -> critical toast with remediation lines (new in Beta 3)
 *   - _closed guard on every .then() (batch 93)
 *   - Focus trap + previous-focus restore for WCAG 2.4.3
 *   - enmRunOnce() wrap on the two action handlers so double-clicks
 *     can't double-POST
 */

(function (root) {
    'use strict';

    var COOLDOWN_SEC = 4;

    /**
     * Map proposal.severity to a modifier class on .enm-modal-heading so
     * the heading bar adopts the severity tint. The mock leaves the
     * heading neutral; severity tint kicks in when the proposal payload
     * carries `severity: 'critical' | 'warning' | 'healing' | 'info'`.
     * Anything else (or missing severity) renders the default neutral
     * heading. Keeping the mapping in one place so chain-card et al can
     * pick up the same modifiers later if needed.
     */
    var SEVERITY_CLASSES = {
        critical: 'enm-modal-heading-critical',
        warning:  'enm-modal-heading-warning',
        healing:  'enm-modal-heading-healing',
        info:     'enm-modal-heading-info',
    };

    function ProposalCard(opts) {
        if (!opts || !opts.proposal || !opts.api || !opts.notifications) {
            throw new TypeError('ProposalCard: { proposal, api, notifications } required');
        }
        this.proposal = opts.proposal;
        this.api = opts.api;
        this.notifications = opts.notifications;
        this.onClose = typeof opts.onClose === 'function' ? opts.onClose : function () {};
        // alpha.28.1 batch 22 — onActioned hook so app.js can broadcast
        // a `proposal-actioned` BC event after a successful confirm/
        // reject. Peer windows then dismiss their own copy of the modal
        // silently instead of catching a stale 404/409 from the
        // already-actioned proposal. (Multi-window audit ac31f3a08.)
        this.onActioned = typeof opts.onActioned === 'function' ? opts.onActioned : function () {};
        this._cooldownTimer = null;
        this._closed = false;

        // Beta 3 chrome: .enm-modal-scrim wraps the whole overlay, with
        // the actual dialog rendered as a sibling .enm-modal-card so the
        // scrim can click-through to close. Both are kept on `this.root`
        // (a wrapper div) so mount/destroy stay one-shot.
        this.root = document.createElement('div');
        this.root.className = 'enm-proposal-modal-root';

        this._scrim = document.createElement('div');
        this._scrim.className = 'enm-modal-scrim';
        this.root.appendChild(this._scrim);

        this._card = document.createElement('div');
        this._card.className = 'enm-modal-card';
        this._card.setAttribute('role', 'dialog');
        this._card.setAttribute('aria-modal', 'true');
        this._card.setAttribute('aria-labelledby', 'enm-prop-heading-' + this.proposal.id);
        this.root.appendChild(this._card);

        this._renderShell();
    }

    ProposalCard.prototype.mount = function (parent) {
        // Remember what the operator was focused on so we can restore it on close
        // (WCAG 2.4.3 Focus Order). Without this, focus jumps to <body> after
        // the dialog closes and a screen reader loses context.
        this._previousFocus = document.activeElement;
        parent.appendChild(this.root);
        this._startCooldown();
        this._installEscHandler();
        this._installScrimHandler();
        this._installFocusTrap();
        // Move focus into the dialog. The ack checkbox is the natural entry
        // point because the Confirm button is disabled during the cooldown.
        var firstFocusable = this._checkbox || this._card.querySelector('button, input, [tabindex]');
        if (firstFocusable && typeof firstFocusable.focus === 'function') {
            // BP-E audit fix — guard against close() racing the deferred
            // focus. Without this check, an Esc-during-mount (the modal
            // pops, the operator dismisses immediately before the
            // setTimeout(0) fires) would call .focus() on an element that
            // close() has already detached, throwing in some browsers.
            var self = this;
            this._focusTimer = setTimeout(function () {
                self._focusTimer = null;
                if (self._closed) { return; }
                firstFocusable.focus();
            }, 0);
        }
        return this;
    };

    ProposalCard.prototype.close = function () {
        if (this._closed) { return; }
        this._closed = true;
        // BP-E audit fix — clear the deferred-focus setTimeout so a fast
        // Esc-during-mount doesn't fire .focus() on a detached element.
        if (this._focusTimer) { clearTimeout(this._focusTimer); this._focusTimer = null; }
        if (this._cooldownTimer) { clearInterval(this._cooldownTimer); this._cooldownTimer = null; }
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
        if (this._trapHandler) {
            document.removeEventListener('keydown', this._trapHandler, true);
            this._trapHandler = null;
        }
        if (this._scrimHandler && this._scrim) {
            this._scrim.removeEventListener('click', this._scrimHandler);
            this._scrimHandler = null;
        }
        if (this.root.parentNode) { this.root.parentNode.removeChild(this.root); }
        // Return focus to wherever the operator was before the dialog opened.
        if (this._previousFocus && typeof this._previousFocus.focus === 'function') {
            try { this._previousFocus.focus(); } catch (_) { /* element may be gone */ }
        }
        this.onClose();
    };

    // Alias for symmetry with other components — some parents call destroy()
    // unconditionally during teardown. Idempotent via the _closed guard.
    ProposalCard.prototype.destroy = function () { this.close(); };

    /** @private */
    ProposalCard.prototype._renderShell = function () {
        var t = root.enmTOrFallback;
        var p = this.proposal;
        var self = this;

        // Heading. Severity modifier class is appended when the proposal
        // payload carries a known severity; unknown/missing severities
        // fall back to the neutral heading.
        var heading = document.createElement('h2');
        heading.id = 'enm-prop-heading-' + p.id;
        heading.className = 'enm-modal-heading';
        var severityClass = p.severity && SEVERITY_CLASSES[p.severity];
        if (severityClass) { heading.classList.add(severityClass); }
        heading.textContent = t('proposal.heading');
        this._card.appendChild(heading);

        // alpha.28.1 batch 69 (Round-19B audit finding #4) — provide a
        // non-empty fallback when BOTH summary_action and summaryAction
        // are absent. The acknowledgment ceremony is the ENTIRE point
        // of this card: "I understand this will <ACTION>" with the
        // operator's deliberate click confirming a destructive op. An
        // empty action label silently defeats that ceremony — the ack
        // text reads "I understand this will " (trailing space, no
        // action), and the post-action notifications fire "Confirmed" /
        // "Rejected" with empty bodies, leaving the operator with NO
        // record of what they just confirmed. Falling back to the i18n
        // 'proposal.fallback_action' key — or a hard-coded English
        // string if strings.js isn't loaded — keeps the ceremony intact.
        var actionLabel = p.summary_action || p.summaryAction
            || t('proposal.fallback_action')
            || 'this operation';
        // Stash on `this` so _handleConfirm / _handleReject can reuse
        // the same resolved label in their post-action notifications.
        this._actionLabel = actionLabel;

        var summary = document.createElement('p');
        summary.className = 'enm-modal-summary';
        summary.textContent = actionLabel;
        this._card.appendChild(summary);

        // Reason paragraph is optional — only rendered when the
        // proposal payload includes it. Matches mock lines 421+454.
        if (p.summary_reason || p.summaryReason) {
            var reason = document.createElement('p');
            reason.className = 'enm-modal-reason';
            reason.textContent = p.summary_reason || p.summaryReason;
            this._card.appendChild(reason);
        }

        // Ack checkbox: "I understand this will [action]". Native input
        // with the phase-06 accent-color so the check tick uses the cyan.
        var checkboxWrap = document.createElement('label');
        checkboxWrap.className = 'enm-modal-ack';
        this._checkbox = document.createElement('input');
        this._checkbox.type = 'checkbox';
        this._checkbox.setAttribute('aria-required', 'true');
        this._checkbox.addEventListener('change', function () { self._refreshConfirmEnabled(); });
        checkboxWrap.appendChild(this._checkbox);
        var ackText = document.createElement('span');
        ackText.className = 'enm-modal-ack-text';
        ackText.textContent = t('proposal.confirm_label', { summary: actionLabel });
        checkboxWrap.appendChild(ackText);
        this._card.appendChild(checkboxWrap);

        // Optional anti-snipe input — only rendered if the proposal
        // sets requireAntiSnipe AND the host pre-set a password hash.
        // Default proposals never render this; the mock leaves it out.
        if (p.requireAntiSnipe) {
            this._antiSnipe = document.createElement('input');
            this._antiSnipe.type = 'password';
            this._antiSnipe.className = 'enm-input enm-modal-anti-snipe';
            // alpha.28.1 batch 37 — strings.js sourced for locale parity.
            var antiLabel = root.enmTOrFallback('proposal.anti_snipe_label');
            this._antiSnipe.placeholder = antiLabel;
            this._antiSnipe.setAttribute('aria-label', antiLabel);
            // SAFETY: never use current-password here. Healing proposal
            // confirmation is destructive — autocomplete="current-password"
            // would let a password manager auto-fill this field on render
            // and the length check at _refreshConfirmEnabled would then
            // silently enable Confirm without operator intent (a "drive-
            // by confirm" on autofill). off + 'one-time-code' both block
            // PM autofill across Chrome/Safari/Firefox/1Password.
            this._antiSnipe.setAttribute('autocomplete', 'off');
            this._antiSnipe.setAttribute('autocorrect', 'off');
            this._antiSnipe.setAttribute('autocapitalize', 'off');
            this._antiSnipe.setAttribute('spellcheck', 'false');
            this._antiSnipe.addEventListener('input', function (ev) {
                // Belt-and-braces: only honour InputEvents that came from
                // real keystrokes / paste. A programmatic .value= from a
                // password manager fires `change` but `inputType` is
                // empty or 'insertReplacementText'. Require a known
                // keystroke type so synthesised fills can't sneak past.
                if (ev && ev.inputType
                    && ev.inputType !== 'insertText'
                    && ev.inputType !== 'insertFromPaste'
                    && ev.inputType !== 'deleteContentBackward'
                    && ev.inputType !== 'deleteContentForward'
                    && ev.inputType !== 'insertCompositionText') {
                    return;
                }
                self._refreshConfirmEnabled();
            });
            this._card.appendChild(this._antiSnipe);
        }

        // Action row: cooldown label + Confirm + Reject. Cooldown is
        // first in DOM order so screen readers announce it first; CSS
        // pushes Confirm/Reject to the right via .enm-modal-cooldown
        // margin-right: auto.
        var actions = document.createElement('div');
        actions.className = 'enm-modal-actions';

        this._cooldownLabel = document.createElement('span');
        this._cooldownLabel.className = 'enm-modal-cooldown';
        this._cooldownLabel.textContent = t('proposal.cooldown_pending', { seconds: COOLDOWN_SEC });
        actions.appendChild(this._cooldownLabel);

        this._confirmBtn = document.createElement('button');
        this._confirmBtn.type = 'button';
        this._confirmBtn.className = 'enm-btn enm-btn-primary';
        this._confirmBtn.textContent = t('proposal.confirm_button');
        this._confirmBtn.disabled = true;
        this._confirmBtn.addEventListener('click', function () { self._handleConfirm(); });
        actions.appendChild(this._confirmBtn);

        this._rejectBtn = document.createElement('button');
        this._rejectBtn.type = 'button';
        this._rejectBtn.className = 'enm-btn';
        this._rejectBtn.textContent = t('proposal.reject_button');
        this._rejectBtn.addEventListener('click', function () { self._handleReject(); });
        actions.appendChild(this._rejectBtn);

        this._card.appendChild(actions);

        // Optional reject-reason input — visible by default but empty.
        // Matches mock line 431.
        this._rejectReason = document.createElement('input');
        this._rejectReason.type = 'text';
        this._rejectReason.className = 'enm-modal-reject-reason';
        this._rejectReason.placeholder = t('proposal.reject_reason_placeholder');
        this._rejectReason.setAttribute('aria-label', t('proposal.reject_reason_placeholder'));
        this._card.appendChild(this._rejectReason);
    };

    /** @private */
    ProposalCard.prototype._startCooldown = function () {
        var self = this;
        var remaining = COOLDOWN_SEC;
        var t = root.enmTOrFallback;
        this._cooldownLabel.textContent = t('proposal.cooldown_pending', { seconds: remaining });
        this._cooldownLabel.classList.toggle('enm-modal-cooldown-warn', remaining <= 1);
        this._cooldownTimer = setInterval(function () {
            remaining -= 1;
            if (remaining <= 0) {
                clearInterval(self._cooldownTimer);
                self._cooldownTimer = null;
                self._cooldownLabel.textContent = '';
                self._cooldownLabel.classList.remove('enm-modal-cooldown-warn');
                self._refreshConfirmEnabled();
                return;
            }
            self._cooldownLabel.textContent = t('proposal.cooldown_pending', { seconds: remaining });
            // Warn tint kicks in for the final second — visible cue that
            // Confirm is about to enable. Matches mock .modal-cooldown.warn
            // at line 137 of phase-06 css.
            self._cooldownLabel.classList.toggle('enm-modal-cooldown-warn', remaining <= 1);
        }, 1000);
    };

    /** @private */
    ProposalCard.prototype._refreshConfirmEnabled = function () {
        if (this._closed) { return; }
        var cooldownDone = !this._cooldownTimer;
        var ack = this._checkbox.checked;
        var pw = !this._antiSnipe || this._antiSnipe.value.length > 0;
        this._confirmBtn.disabled = !(cooldownDone && ack && pw);
    };

    /**
     * @private
     * Surface a 409 conflict envelope as a critical toast with
     * remediation lines. Pattern matches chain-card.js batch 68:
     * defensive shape validation so a backend bug shipping
     * `{ description: undefined, remediation: [{foo:'bar'}] }`
     * does not render "• undefined" + "[object Object]" in the toast.
     * Returns true when the err looked like a conflict envelope and
     * was handled here; the caller should skip its default warning
     * toast in that case.
     */
    ProposalCard.prototype._handleConflictEnvelope = function (err, verb) {
        if (!err || err.status !== 409 || !err.body) { return false; }
        var conflicts = err.body.conflicts;
        if (!Array.isArray(conflicts) || conflicts.length === 0) { return false; }
        var blockers = conflicts.filter(function (c) {
            return c && c.severity === 'CRITICAL';
        });
        var pool = blockers.length > 0 ? blockers : conflicts;
        var summary = pool.map(function (c) {
            var firstStep = (c && c.remediation && c.remediation[0]);
            var stepStr = (typeof firstStep === 'string' && firstStep.length > 0)
                ? firstStep : '';
            var descStr = (typeof c.description === 'string' && c.description.length > 0)
                ? c.description : 'Host conflict';
            return '• ' + descStr + (stepStr ? ('\n   ' + stepStr) : '');
        }).join('\n');
        this.notifications.critical(
            'Cannot ' + verb + ' proposal — host conflicts',
            summary,
        );
        return true;
    };

    /** @private */
    ProposalCard.prototype._handleConfirm = function () {
        var self = this;
        // alpha.28.1 batch 53 — disable BOTH buttons during the request
        // so a double-click can't queue a parallel reject. enmRunOnce
        // takes care of the busy flag on the Confirm button itself;
        // the explicit reject disable guards the cross-button case.
        this._rejectBtn.disabled = true;
        var body = {};
        if (this._antiSnipe) { body.antiSnipePassword = this._antiSnipe.value; }
        var runOnce = root.enmRunOnce || function (_btn, _lbl, fn) {
            return Promise.resolve().then(fn);
        };
        var t = root.enmTOrFallback;
        var runningLabel = t('common.saving') || 'Working…';
        runOnce(this._confirmBtn, runningLabel, function () {
            // alpha.28.1 batch 69 (Round-19C audit finding #2) —
            // encodeURIComponent on the proposal.id path segment. proposal.id
            // sources from a backend response (GET /healing/suggestions); a
            // malicious/buggy backend returning "x/../delete" could pivot the
            // call to a different endpoint. Backend-compromise only, but
            // every other dynamic path segment in audit-tab uses
            // encodeURIComponent so this is consistency too.
            return self.api.post('/healing/confirm/' + encodeURIComponent(self.proposal.id), body);
        }).then(function () {
            // alpha.28.1 batch 93 (Round-30 audit) — guard against the
            // case where a peer tab's BroadcastChannel proposal-actioned
            // event closed this dialog between the POST starting and
            // resolving. Without the guard, the toast fires for an
            // action that no longer represents this tab's verdict, and
            // self.onActioned re-broadcasts a redundant second
            // proposal-actioned event. The catch branch already had
            // the equivalent guard.
            if (self._closed) { return; }
            self.notifications.info('Confirmed', self._actionLabel || '');
            try { self.onActioned('confirmed'); } catch (_) { /* host hook threw */ }
            self.close();
        }).catch(function (err) {
            if (self._closed) { return; }
            // alpha.28.1 batch 53 — 401 suppression. Boot owns re-auth.
            if (err && err.status === 401) {
                // Restore reject so the operator has a recovery action
                // after re-auth even if they no longer want to confirm.
                self._rejectBtn.disabled = false;
                self._refreshConfirmEnabled();
                return;
            }
            // 409 conflict envelope shape validation — emit a critical
            // toast with remediation lines instead of the generic
            // "Confirmation failed". Mirrors chain-card.js batch 68.
            if (self._handleConflictEnvelope(err, 'confirm')) {
                self._rejectBtn.disabled = false;
                self._refreshConfirmEnabled();
                return;
            }
            self.notifications.warning(
                'Confirmation failed',
                err && err.message ? err.message : String(err),
            );
            // Re-enable both buttons via the full validation path (cooldown +
            // ack checkbox + anti-snipe length) instead of an
            // unconditional disabled=false. Without _refreshConfirmEnabled
            // the catch path could re-arm Confirm even when the cooldown
            // is still running, the ack was unticked, or the anti-snipe
            // input was cleared between click and error response.
            // (Race-conditions audit aaf1f87d, finding B8.)
            self._rejectBtn.disabled = false;
            self._refreshConfirmEnabled();
        });
    };

    /** @private */
    ProposalCard.prototype._handleReject = function () {
        var self = this;
        // Disable both so the operator can't double-submit a reject and
        // confirm in parallel.
        this._confirmBtn.disabled = true;
        var body = { reason: this._rejectReason.value || '' };
        var runOnce = root.enmRunOnce || function (_btn, _lbl, fn) {
            return Promise.resolve().then(fn);
        };
        var t = root.enmTOrFallback;
        var runningLabel = t('common.saving') || 'Working…';
        runOnce(this._rejectBtn, runningLabel, function () {
            // Batch 69 — encodeURIComponent on proposal.id (same rationale
            // as the confirm path above).
            return self.api.post('/healing/reject/' + encodeURIComponent(self.proposal.id), body);
        }).then(function () {
            // batch 93 — same _closed guard rationale as _handleConfirm above.
            if (self._closed) { return; }
            self.notifications.info('Rejected', self._actionLabel || '');
            try { self.onActioned('rejected'); } catch (_) { /* host hook threw */ }
            self.close();
        }).catch(function (err) {
            if (self._closed) { return; }
            // alpha.28.1 batch 53 — 401 suppression. Boot owns re-auth.
            // Reject button stays enabled either way so the operator
            // can retry once re-authed.
            if (err && err.status === 401) {
                // alpha.28.1 batch 61 (Round-18 audit) — _handleReject
                // disables BOTH _rejectBtn and _confirmBtn at start.
                // The previous 401 branch only re-enabled _rejectBtn,
                // leaving Confirm permanently disabled until the parent
                // re-mounted the card. The operator could no longer
                // confirm OR reject anything from this dialog.
                // Symmetrical with _handleConfirm's 401 path which
                // calls _refreshConfirmEnabled.
                self._refreshConfirmEnabled();
                return;
            }
            // 409 conflict envelope — same as Confirm path.
            if (self._handleConflictEnvelope(err, 'reject')) {
                self._refreshConfirmEnabled();
                return;
            }
            self.notifications.warning(
                'Reject failed',
                err && err.message ? err.message : String(err),
            );
            // Same fix in the generic-error branch — _confirmBtn was
            // disabled at start and never re-enabled.
            self._refreshConfirmEnabled();
        });
    };

    /** @private */
    ProposalCard.prototype._installEscHandler = function () {
        var self = this;
        // alpha.28.1 batch 72 (Round-20A audit finding #1, HIGH) — Esc
        // closes the dialog WITHOUT committing reject. The previous
        // shape fired _handleReject() (POST /healing/reject — destructive
        // + irreversible). Operators with universal-Esc-is-cancel muscle
        // memory pressed Esc expecting "dismiss the modal", and silently
        // rejected valid healing proposals.
        //
        // The healing backend re-suggests valid proposals on the next
        // cycle, so close-without-act is the correct dismiss semantic:
        //   - Operator wants to actually reject? Click the Reject button.
        //   - Operator wants more time? Press Esc → close → proposal
        //     re-appears next cycle (typically <5 min).
        // Topmost-overlay guard kept so a drawer / tools-update modal
        // opened on top still wins Esc.
        this._escHandler = function (ev) {
            if (ev.key !== 'Escape') { return; }
            var drawerOpen = document.querySelector('.enm-drawer-root.enm-drawer-open');
            var updateModal = document.querySelector('.enm-tools-update-modal-root');
            if (drawerOpen || updateModal) { return; }
            self.close();
        };
        document.addEventListener('keydown', this._escHandler);
    };

    /**
     * @private
     * Click-the-scrim-to-close. Same semantics as Esc: dismiss without
     * acting. The proposal re-suggests on the next healing cycle so a
     * stray click is recoverable. Click events on the card itself
     * bubble up but their target won't equal _scrim, so we filter for
     * that to avoid closing on intra-card clicks.
     */
    ProposalCard.prototype._installScrimHandler = function () {
        var self = this;
        this._scrimHandler = function (ev) {
            if (ev.target === self._scrim) { self.close(); }
        };
        this._scrim.addEventListener('click', this._scrimHandler);
    };

    /**
     * @private
     * Focus trap: Tab and Shift+Tab cycle within the dialog only. Without this,
     * keyboard focus can escape onto elements behind the overlay, violating
     * WCAG 2.4.3 (Focus Order) for modal dialogs. The handler runs on capture
     * so it sees the keydown before any inner element can intercept it.
     */
    ProposalCard.prototype._installFocusTrap = function () {
        var self = this;
        this._trapHandler = function (ev) {
            if (ev.key !== 'Tab' || self._closed) { return; }
            // Re-query each press because cooldown enables Confirm mid-lifecycle.
            var focusables = self._card.querySelectorAll(
                'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
            );
            if (focusables.length === 0) { return; }
            var first = focusables[0];
            var last  = focusables[focusables.length - 1];
            if (ev.shiftKey && document.activeElement === first) {
                ev.preventDefault();
                last.focus();
            } else if (!ev.shiftKey && document.activeElement === last) {
                ev.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', this._trapHandler, true);
    };

    root.EnmProposalCard = ProposalCard;
}(typeof window !== 'undefined' ? window : globalThis));
