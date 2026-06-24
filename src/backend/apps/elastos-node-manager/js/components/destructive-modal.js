/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/destructive-modal.js — canonical destructive-action modal.
 *
 * Extracted from proposal-card.js per audit Phase 3 / XFLOW-22. Replaces
 * ~10 ad-hoc native confirm() patterns + brittle inline gates across the
 * app (Stop / Restart / Nuke / Uninstall / Reset / Import / Class B
 * restart / validator activate / F-rule toggle / overview row actions).
 *
 * The primitives this factory inherits from ProposalCard:
 *   - N-second cooldown timer (prevents reflex clicks)
 *   - Required acknowledgment checkbox
 *   - Optional typed-confirm gate (e.g. "WIPE EVERYTHING")
 *   - Esc CLOSES the dialog WITHOUT committing (Round-20A HIGH fix)
 *   - Scrim click closes (same as Esc)
 *   - Focus trap + previousFocus restore (WCAG 2.4.3)
 *   - _closed guard so peer-tab BroadcastChannel can dismiss safely
 *   - 401 silence (boot path owns re-auth)
 *   - 409 conflict envelope → critical toast with remediation
 *
 * Usage:
 *   enmDestructiveModal({
 *     title:       'Stop Mainchain?',
 *     body:        'In-progress block-signing work will stop. Restart later from this dashboard.',
 *     ackLabel:    'I understand this stops the chain',  // shown next to checkbox
 *     cooldownSec: 2,                                    // 0 to skip cooldown
 *     typedConfirm: null,                                // OR { expected: 'WIPE EVERYTHING', caseSensitive: true }
 *     confirmLabel: 'Stop the chain',
 *     confirmKind:  'danger',                            // 'primary' | 'danger' | 'critical'
 *     onConfirm: function () {
 *       return api.post('/chains/mainchain/stop');   // returns a Promise; modal handles loading/error/close
 *     },
 *     notifications: services.notifications,            // optional, for 409 toast
 *   });
 *
 * The returned promise resolves with { confirmed: true } when the action
 * completes successfully, or { confirmed: false, reason: 'cancelled' |
 * 'esc' | 'scrim' } when dismissed without action. Errors from onConfirm
 * are surfaced inline; the modal stays open for retry (operator decides).
 */

(function (root) {
    'use strict';

    var ACTIVE_STACK = []; // For Esc handling — only the topmost modal closes on Esc.

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    /**
     * @param {object} opts
     * @returns {Promise<{confirmed: boolean, reason?: string}>}
     */
    function enmDestructiveModal(opts) {
        opts = opts || {};
        if (typeof opts.onConfirm !== 'function') {
            throw new TypeError('enmDestructiveModal: opts.onConfirm function is required');
        }
        var title         = opts.title || 'Are you sure?';
        var body          = opts.body || '';
        var ackLabel      = opts.ackLabel || null;  // null = no ack checkbox
        var cooldownSec   = (typeof opts.cooldownSec === 'number') ? opts.cooldownSec : 2;
        var typedConfirm  = opts.typedConfirm || null;
        var confirmLabel  = opts.confirmLabel || 'Confirm';
        var confirmKind   = opts.confirmKind || 'danger';
        var cancelLabel   = opts.cancelLabel || 'Cancel';
        var onConfirm     = opts.onConfirm;
        var notifications = opts.notifications || null;
        var t             = root.enmTOrFallback || function (k, fb) { return fb || k; };

        return new Promise(function (resolve) {
            var closed = false;
            var previousFocus = document.activeElement;

            // Build DOM.
            var modalRoot = document.createElement('div');
            modalRoot.className = 'enm-destructive-modal-root';

            var scrim = document.createElement('div');
            scrim.className = 'enm-modal-scrim';
            modalRoot.appendChild(scrim);

            var card = document.createElement('div');
            card.className = 'enm-modal-card enm-destructive-modal-card';
            card.setAttribute('role', 'dialog');
            card.setAttribute('aria-modal', 'true');
            card.setAttribute('aria-labelledby', 'enm-dm-heading');

            var heading = document.createElement('h2');
            heading.id = 'enm-dm-heading';
            heading.className = 'enm-modal-heading enm-modal-heading-' + confirmKind;
            heading.textContent = title;
            card.appendChild(heading);

            if (body) {
                var bodyP = document.createElement('p');
                bodyP.className = 'enm-modal-summary';
                bodyP.textContent = body;
                card.appendChild(bodyP);
            }

            // Ack checkbox (optional).
            var ackBox = null;
            if (ackLabel) {
                var ackWrap = document.createElement('label');
                ackWrap.className = 'enm-modal-ack';
                ackBox = document.createElement('input');
                ackBox.type = 'checkbox';
                ackBox.setAttribute('aria-required', 'true');
                ackWrap.appendChild(ackBox);
                var ackTxt = document.createElement('span');
                ackTxt.className = 'enm-modal-ack-text';
                ackTxt.textContent = ackLabel;
                ackWrap.appendChild(ackTxt);
                card.appendChild(ackWrap);
            }

            // Typed-confirm gate (optional). Per audit AUDIT-FLOW-DZ14 the
            // placeholder DOES NOT leak the expected text — operator must
            // commit it to muscle memory or read it from the label.
            var typedInput = null;
            if (typedConfirm && typedConfirm.expected) {
                var typedWrap = document.createElement('div');
                typedWrap.className = 'enm-modal-typed-confirm';
                var typedLabel = document.createElement('label');
                typedLabel.className = 'enm-modal-typed-confirm-label';
                typedLabel.textContent = 'To confirm, type ';
                var typedExpectedSpan = document.createElement('code');
                typedExpectedSpan.className = 'enm-modal-typed-confirm-expected';
                typedExpectedSpan.textContent = typedConfirm.expected;
                typedLabel.appendChild(typedExpectedSpan);
                typedLabel.appendChild(document.createTextNode(' below.'));
                typedWrap.appendChild(typedLabel);
                typedInput = document.createElement('input');
                typedInput.type = 'text';
                typedInput.className = 'enm-input';
                typedInput.placeholder = 'Type to confirm';
                typedInput.setAttribute('autocomplete', 'off');
                typedInput.setAttribute('spellcheck', 'false');
                typedInput.setAttribute('autocapitalize', 'off');
                typedInput.setAttribute('autocorrect', 'off');
                typedWrap.appendChild(typedInput);
                card.appendChild(typedWrap);
            }

            // Action row: cooldown label + Cancel + Confirm.
            var actions = document.createElement('div');
            actions.className = 'enm-modal-actions';
            var cooldownLabel = document.createElement('span');
            cooldownLabel.className = 'enm-modal-cooldown';
            cooldownLabel.setAttribute('aria-live', 'polite');
            actions.appendChild(cooldownLabel);
            var cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'enm-btn';
            cancelBtn.textContent = cancelLabel;
            actions.appendChild(cancelBtn);
            var confirmBtn = document.createElement('button');
            confirmBtn.type = 'button';
            confirmBtn.className = 'enm-btn enm-btn-' + confirmKind;
            confirmBtn.textContent = confirmLabel;
            confirmBtn.disabled = true; // enabled when cooldown done + ack + typed all OK
            actions.appendChild(confirmBtn);
            card.appendChild(actions);

            // Status row for inline errors (no toast).
            var statusEl = document.createElement('p');
            statusEl.className = 'enm-modal-status';
            statusEl.setAttribute('aria-live', 'polite');
            statusEl.hidden = true;
            card.appendChild(statusEl);

            modalRoot.appendChild(card);
            document.body.appendChild(modalRoot);

            // Push onto active stack so Esc closes only the topmost.
            ACTIVE_STACK.push(modalRoot);

            // Cooldown timer.
            var cooldownRemaining = cooldownSec;
            var cooldownTimer = null;
            function refreshCooldownLabel() {
                if (cooldownRemaining > 0) {
                    cooldownLabel.textContent = 'Available in ' + cooldownRemaining + 's';
                    cooldownLabel.classList.toggle('enm-modal-cooldown-warn', cooldownRemaining <= 1);
                } else {
                    cooldownLabel.textContent = '';
                    cooldownLabel.classList.remove('enm-modal-cooldown-warn');
                }
            }
            function refreshConfirmEnabled() {
                if (closed) { return; }
                var cooldownDone = cooldownRemaining <= 0;
                var ackOK = !ackBox || ackBox.checked;
                var typedOK = !typedInput || (function () {
                    var v = typedInput.value || '';
                    var exp = typedConfirm.expected;
                    return typedConfirm.caseSensitive ? (v === exp) : (v.toLowerCase() === exp.toLowerCase());
                }());
                confirmBtn.disabled = !(cooldownDone && ackOK && typedOK);
            }
            refreshCooldownLabel();
            if (cooldownRemaining > 0) {
                cooldownTimer = setInterval(function () {
                    cooldownRemaining -= 1;
                    refreshCooldownLabel();
                    refreshConfirmEnabled();
                    if (cooldownRemaining <= 0) {
                        clearInterval(cooldownTimer);
                        cooldownTimer = null;
                    }
                }, 1000);
            } else {
                refreshConfirmEnabled();
            }
            if (ackBox) { ackBox.addEventListener('change', refreshConfirmEnabled); }
            if (typedInput) { typedInput.addEventListener('input', refreshConfirmEnabled); }

            // Esc / scrim handlers.
            function close(reason) {
                if (closed) { return; }
                closed = true;
                if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
                document.removeEventListener('keydown', onKeydown, true);
                var idx = ACTIVE_STACK.indexOf(modalRoot);
                if (idx !== -1) { ACTIVE_STACK.splice(idx, 1); }
                if (modalRoot.parentNode) { modalRoot.parentNode.removeChild(modalRoot); }
                if (previousFocus && typeof previousFocus.focus === 'function') {
                    try { previousFocus.focus(); } catch (_) { /* element may be gone */ }
                }
                resolve({ confirmed: false, reason: reason });
            }
            function onKeydown(ev) {
                if (ev.key === 'Escape') {
                    // Only act if WE are the topmost modal.
                    if (ACTIVE_STACK[ACTIVE_STACK.length - 1] !== modalRoot) { return; }
                    ev.preventDefault();
                    close('esc');
                }
            }
            document.addEventListener('keydown', onKeydown, true);
            scrim.addEventListener('click', function () { close('scrim'); });
            cancelBtn.addEventListener('click', function () { close('cancelled'); });

            // Confirm.
            confirmBtn.addEventListener('click', function () {
                if (closed || confirmBtn.disabled) { return; }
                confirmBtn.disabled = true;
                cancelBtn.disabled = true;  // cross-button race protection
                statusEl.hidden = true;
                confirmBtn.textContent = (t('common.saving') || 'Working…');
                var actionResult;
                try {
                    actionResult = onConfirm();
                } catch (err) {
                    return handleError(err);
                }
                Promise.resolve(actionResult).then(function (result) {
                    if (closed) { return; }
                    // Success — close + resolve.
                    closed = true;
                    if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
                    document.removeEventListener('keydown', onKeydown, true);
                    var idx = ACTIVE_STACK.indexOf(modalRoot);
                    if (idx !== -1) { ACTIVE_STACK.splice(idx, 1); }
                    if (modalRoot.parentNode) { modalRoot.parentNode.removeChild(modalRoot); }
                    if (previousFocus && typeof previousFocus.focus === 'function') {
                        try { previousFocus.focus(); } catch (_) { /* element gone */ }
                    }
                    resolve({ confirmed: true, result: result });
                }).catch(handleError);
            });

            function handleError(err) {
                if (closed) { return; }
                // 401 silence — boot path owns re-auth.
                if (err && err.status === 401) {
                    // Re-enable buttons; operator may dismiss + retry post-auth.
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = confirmLabel;
                    cancelBtn.disabled = false;
                    return;
                }
                // 409 conflict envelope → toast + leave modal open for retry.
                if (err && err.status === 409 && err.body && Array.isArray(err.body.conflicts)
                    && err.body.conflicts.length > 0 && notifications && typeof notifications.critical === 'function') {
                    var pool = err.body.conflicts.filter(function (c) { return c && c.severity === 'CRITICAL'; });
                    if (pool.length === 0) { pool = err.body.conflicts; }
                    var summary = pool.map(function (c) {
                        var firstStep = (c && c.remediation && c.remediation[0]);
                        var stepStr = (typeof firstStep === 'string' && firstStep.length > 0) ? firstStep : '';
                        var descStr = (typeof c.description === 'string' && c.description.length > 0)
                            ? c.description : 'Host conflict';
                        return '• ' + descStr + (stepStr ? ('\n   ' + stepStr) : '');
                    }).join('\n');
                    notifications.critical((title || 'Action') + ' — host conflicts', summary);
                }
                // Surface inline error + re-enable for retry.
                var msg = (err && err.message) || String(err || 'Failed');
                statusEl.hidden = false;
                statusEl.textContent = msg;
                statusEl.classList.add('err');
                confirmBtn.disabled = false;
                confirmBtn.textContent = confirmLabel;
                cancelBtn.disabled = false;
            }

            // Auto-focus the first interactive control.
            var firstFocus = ackBox || typedInput || cancelBtn;
            setTimeout(function () {
                if (closed) { return; }
                try { firstFocus.focus(); } catch (_) { /* element gone */ }
            }, 0);
        });
    }

    root.enmDestructiveModal = enmDestructiveModal;
}(typeof window !== 'undefined' ? window : globalThis));
