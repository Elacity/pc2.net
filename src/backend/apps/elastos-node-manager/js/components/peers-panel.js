/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/peers-panel.js — v0.5.175 — Peers & Bootnodes (Class B EVM).
 *
 * Mounts on the per-chain dashboard for EVM sidechains (esc / eid / pg) only
 * — app.js gates the mount to chainClass === 'B'.
 *
 * WHY THIS EXISTS: the EID/ESC geth fork ENM ships is built on an old
 * go-ethereum (v1.9.x-era) whose discv4 peer auto-discovery is weak. A fresh
 * sidechain node can sit at 0 peers indefinitely even when the wider network
 * is healthy, because the bootnodes it knows about advertise mostly INBOUND
 * peers that never propagate back out via discovery. Without a manual escape
 * hatch the operator's only recourse is "every node depends on one seed node"
 * — exactly the single-point-of-failure the operator flagged. This panel lets
 * any operator paste an enode and get unstuck on their own:
 *
 *   GET  /chains/:id/bootnodes  → { bootnodes, alive, peers, height, stuck }
 *   PUT  /chains/:id/bootnodes  → validate + persist (--bootnodes, survives
 *                                 restart) + live-dial via admin_addPeer
 *                                 (instant, no restart). Owner-gated server-side.
 *
 * Polls peer count every 5s (visibility-paused). The bootnode list + add
 * input are NOT re-rendered on poll — that would clobber half-typed input;
 * only the live status line + stuck banner refresh on the timer. A full
 * re-render happens on first load and after the operator's own add/remove.
 */

(function (root) {
    'use strict';

    var POLL_INTERVAL_MS = 5000;

    /**
     * strings.js lookup with English fallback (mirrors spv-module's tFb).
     * Avoids surfacing "[key]" placeholders before strings.js loads.
     *
     * @param {string} key
     * @param {string} fallback
     * @param {object} [vars]
     * @returns {string}
     */
    function tFb(key, fallback, vars) {
        var t = root.enmTOrFallback || root.enmT;
        if (typeof t !== 'function') { return formatVars(fallback, vars); }
        var v = t(key, vars);
        if (!v || v === key || v === ('[' + key + ']')) { return formatVars(fallback, vars); }
        return v;
    }

    function formatVars(s, vars) {
        if (!vars) { return s; }
        return String(s).replace(/\{([a-zA-Z0-9_]+)\}/g, function (m, name) {
            return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m;
        });
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** Format a count with thousands separators; em-dash when null. */
    function fmtN(n) {
        return (typeof n === 'number' && isFinite(n)) ? n.toLocaleString() : '—';
    }

    /**
     * Light client-side enode shape check so an obvious paste error gets
     * instant feedback before the round-trip. The backend (validateEnode)
     * is authoritative — this only catches the gross cases to keep the UX
     * snappy. Mirrors EnmCrypto.ENODE_RE loosely.
     *
     * @param {string} s
     * @returns {boolean}
     */
    function looksLikeEnode(s) {
        return /^enode:\/\/[0-9a-fA-F]{128}@.+:\d{1,5}(\?discport=\d{1,5})?$/.test(String(s || '').trim());
    }

    function EnmPeersPanel(opts) {
        if (!opts || !opts.api || !opts.chainId) {
            throw new TypeError('EnmPeersPanel: { api, chainId } required');
        }
        this.api = opts.api;
        this.chainId = opts.chainId;
        this.notifications = opts.notifications || null;
        this._root = null;
        this._pauser = null;
        this._timer = null;
        this._destroyed = false;
        this._builtOnce = false;
        this._bootnodes = [];   // last-known persisted list (drives remove)
        this._busy = false;     // guards against double-submit
    }

    EnmPeersPanel.prototype.mount = function (parent) {
        if (!parent) { throw new TypeError('EnmPeersPanel.mount: parent required'); }
        // v0.5.176 — lives inside a Settings <section> now (no .enm-card
        // framing, no internal <h3> — the section header owns the title).
        this._root = document.createElement('div');
        this._root.className = 'enm-peers';
        this._root.setAttribute('aria-label', tFb('peers_panel.aria', 'Peers and bootnodes'));
        parent.appendChild(this._root);
        this._renderLoading();

        var self = this;
        // v0.5.227 audit Phase 12 (AUDIT-FLOW-PP04, P3) — stale-indicator
        // for after-first-success poll failures. Pre-v0.5.227 transient
        // poll errors left the panel with stale data + no signal.
        if (typeof root.enmStaleIndicator === 'function') {
            this._staleIndicator = root.enmStaleIndicator(this._root, { staleAfterMs: 30000 });
        }
        this._fetch();
        if (typeof root.enmUseVisibilityPause === 'function') {
            this._pauser = root.enmUseVisibilityPause(function () { self._fetch(); }, POLL_INTERVAL_MS);
        } else {
            this._timer = setInterval(function () { self._fetch(); }, POLL_INTERVAL_MS);
        }
        return this;
    };

    EnmPeersPanel.prototype.destroy = function () {
        if (this._destroyed) { return; }
        this._destroyed = true;
        if (this._staleIndicator && typeof this._staleIndicator.destroy === 'function') {
            try { this._staleIndicator.destroy(); } catch (_) { /* idempotent */ }
            this._staleIndicator = null;
        }
        if (this._pauser) { try { this._pauser.stop(); } catch (_) { /* idempotent */ } this._pauser = null; }
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
        if (this._root && this._root.parentNode) {
            this._root.parentNode.removeChild(this._root);
        }
        this._root = null;
    };

    /** @private */
    EnmPeersPanel.prototype._renderLoading = function () {
        if (!this._root) { return; }
        this._root.innerHTML = ''
            + '<p class="enm-peers-loading" role="status" aria-live="polite">'
            + escapeHtml(tFb('peers_panel.loading', 'Loading peer status…')) + '</p>';
    };

    /** @private */
    EnmPeersPanel.prototype._fetch = function () {
        var self = this;
        this.api.get('/chains/' + encodeURIComponent(this.chainId) + '/bootnodes', { skipCache: true })
            .then(function (data) {
                if (self._destroyed) { return; }
                var snap = (data && data.result && data.result.chainId) ? data.result : data;
                if (!self._builtOnce) {
                    self._renderFull(snap);
                } else {
                    self._updateStatus(snap);
                }
                if (self._staleIndicator) { self._staleIndicator.markFresh(); }
            })
            .catch(function (err) {
                if (self._destroyed) { return; }
                // v0.5.227 audit Phase 12 — mark stale on transient errors
                // so the operator sees the data may not be current.
                if (self._staleIndicator) { self._staleIndicator.markStale(); }
                // Only paint the error state on FIRST load — a transient poll
                // failure shouldn't blank a panel the operator may be typing in.
                if (!self._builtOnce) {
                    var friendly = (typeof root.enmFriendlyError === 'function')
                        ? root.enmFriendlyError(err)
                        : ((err && err.message) || 'Network error');
                    self._renderError(friendly || 'Network error');
                }
            });
    };

    /** @private */
    EnmPeersPanel.prototype._renderError = function (msg) {
        if (!this._root) { return; }
        this._root.innerHTML = ''
            + '<p class="enm-peers-error" role="alert">' + escapeHtml(String(msg)) + '</p>';
    };

    /**
     * Full structural render. Runs on first load + after the operator's own
     * add/remove (never on the background poll, so typing isn't clobbered).
     * @private
     */
    EnmPeersPanel.prototype._renderFull = function (snap) {
        if (!this._root) { return; }
        snap = snap || {};
        this._bootnodes = Array.isArray(snap.bootnodes) ? snap.bootnodes.slice() : [];

        var html = ''
            // Live status line (peer count + state). Updated in place on poll.
            + '<div class="enm-peers-status" data-peers-status></div>'
            // Stuck banner — shown/hidden by _updateStatus.
            + '<div class="enm-peers-stuck" data-peers-stuck hidden role="status"></div>'
            // Instructions (collapsed by default).
            + '<details class="enm-peers-help">'
            +   '<summary>' + escapeHtml(tFb('peers_panel.help_summary', 'How do I get a peer to add?')) + '</summary>'
            +   '<div class="enm-peers-help-body">'
            +     '<p>' + escapeHtml(tFb('peers_panel.help_what',
                      'A peer is identified by its enode — its public key plus IP and port. '
                      + 'An IP on its own is not enough: the key is required for the encrypted '
                      + 'connection and cannot be looked up from the IP.')) + '</p>'
            +     '<p>' + escapeHtml(tFb('peers_panel.help_how',
                      'To copy the peers a working node already has, attach to it '
                      + '(./eid attach) and run:')) + '</p>'
            +     '<pre class="enm-peers-help-cmd" tabindex="0">admin.peers.forEach(p =&gt; console.log(p.enode))</pre>'
            +     '<p class="enm-peers-help-fmt">' + escapeHtml(tFb('peers_panel.help_format',
                      'Paste any enode (enode://<key>@<ip>:<port>) above. ENM saves it so it '
                      + 'survives a restart, and connects to it immediately if the chain is running.')) + '</p>'
            +   '</div>'
            + '</details>'
            // Current bootnodes list.
            + '<div class="enm-peers-list" data-peers-list></div>'
            // Add row.
            + '<form class="enm-peers-add" data-peers-add>'
            +   '<label class="enm-peers-add-label" for="enm-peers-input-' + escapeHtml(this.chainId) + '">'
            +     escapeHtml(tFb('peers_panel.add_label', 'Add a peer (enode URL)')) + '</label>'
            +   '<div class="enm-peers-add-row">'
            +     '<input type="text" class="enm-peers-input" id="enm-peers-input-' + escapeHtml(this.chainId) + '" '
            +       'placeholder="enode://…@host:port" autocomplete="off" spellcheck="false" />'
            +     '<button type="submit" class="enm-btn enm-btn-primary enm-peers-add-btn">'
            +       escapeHtml(tFb('peers_panel.add_btn', 'Add peer')) + '</button>'
            +   '</div>'
            +   '<p class="enm-peers-feedback" data-peers-feedback aria-live="polite"></p>'
            + '</form>';

        this._root.innerHTML = html;
        this._builtOnce = true;
        this._renderList();
        this._updateStatus(snap);
        this._wireAddForm();
    };

    /**
     * Render just the bootnode list (called on full render + after add/remove).
     * @private
     */
    EnmPeersPanel.prototype._renderList = function () {
        if (!this._root) { return; }
        var listEl = this._root.querySelector('[data-peers-list]');
        if (!listEl) { return; }
        if (this._bootnodes.length === 0) {
            listEl.innerHTML = '<p class="enm-peers-empty">'
                + escapeHtml(tFb('peers_panel.empty',
                    'No bootnodes configured. Your node relies on auto-discovery alone — '
                    + 'if it is stuck at 0 peers, add one below.'))
                + '</p>';
            return;
        }
        var self = this;
        var rowsHtml = this._bootnodes.map(function (enode) {
            // v0.5.176 — show the peer by IP (operator-friendly); the full
            // enode (with key + port) is in the title tooltip for the curious.
            return '<div class="enm-peers-row" data-enode="' + escapeHtml(enode) + '">'
                + '<span class="enm-peers-ip" title="' + escapeHtml(enode) + '">' + escapeHtml(enodeIp(enode)) + '</span>'
                + '<button type="button" class="enm-peers-remove" aria-label="'
                +   escapeHtml(tFb('peers_panel.remove_aria', 'Remove this peer')) + '" '
                +   'data-enode="' + escapeHtml(enode) + '">&times;</button>'
                + '</div>';
        }).join('');
        listEl.innerHTML = rowsHtml;
        var btns = listEl.querySelectorAll('.enm-peers-remove');
        Array.prototype.forEach.call(btns, function (btn) {
            btn.addEventListener('click', function () {
                self._removeEnode(btn.getAttribute('data-enode'));
            });
        });
    };

    /**
     * Update only the live status line + stuck banner. Safe to call on the
     * background poll — touches nothing the operator might be editing.
     * @private
     */
    EnmPeersPanel.prototype._updateStatus = function (snap) {
        if (!this._root) { return; }
        snap = snap || {};
        var statusEl = this._root.querySelector('[data-peers-status]');
        var stuckEl = this._root.querySelector('[data-peers-stuck]');
        var alive = !!snap.alive;
        var peers = (typeof snap.peers === 'number') ? snap.peers : null;

        if (statusEl) {
            var dotClass = !alive ? 'stopped' : (peers && peers > 0 ? 'running' : 'warn');
            var label;
            if (!alive) {
                label = tFb('peers_panel.status_stopped', 'Chain is stopped — start it to connect to peers.');
            } else if (peers === null) {
                label = tFb('peers_panel.status_unknown', 'Peer count unavailable.');
            } else {
                label = tFb('peers_panel.status_peers', '{n} peer(s) connected', { n: fmtN(peers) });
            }
            statusEl.innerHTML = '<span class="enm-peers-dot ' + dotClass + '" aria-hidden="true"></span>'
                + '<span class="enm-peers-status-text">' + escapeHtml(label) + '</span>';
        }

        if (stuckEl) {
            if (snap.stuck) {
                stuckEl.hidden = false;
                stuckEl.innerHTML = escapeHtml(tFb('peers_panel.stuck',
                    'This chain is running but has 0 peers, so it cannot sync. '
                    + 'Add a peer below to get it moving.'));
            } else {
                stuckEl.hidden = true;
                stuckEl.innerHTML = '';
            }
        }
    };

    /** @private */
    EnmPeersPanel.prototype._wireAddForm = function () {
        if (!this._root) { return; }
        var self = this;
        var form = this._root.querySelector('[data-peers-add]');
        if (!form) { return; }
        form.addEventListener('submit', function (ev) {
            ev.preventDefault();
            var input = self._root.querySelector('.enm-peers-input');
            if (!input) { return; }
            self._addEnode(input.value);
        });
    };

    /**
     * @private — add one enode: client pre-check → PUT full list → render
     * the server-confirmed result + feedback.
     */
    EnmPeersPanel.prototype._addEnode = function (raw) {
        if (this._busy) { return; }
        var value = String(raw || '').trim();
        if (!value) { return; }
        if (!looksLikeEnode(value)) {
            this._setFeedback(tFb('peers_panel.bad_format',
                'That does not look like an enode. Expected enode://<128 hex>@host:port.'), true);
            return;
        }
        // De-dup client-side too (server also dedups) for instant feedback.
        if (this._bootnodes.indexOf(value) !== -1) {
            this._setFeedback(tFb('peers_panel.already', 'That peer is already in the list.'), true);
            return;
        }
        var next = this._bootnodes.concat([value]);
        this._submit(next, value);
    };

    /** @private — remove one enode: PUT the list minus it. */
    EnmPeersPanel.prototype._removeEnode = function (enode) {
        if (this._busy || !enode) { return; }
        var next = this._bootnodes.filter(function (e) { return e !== enode; });
        this._submit(next, null);
    };

    /**
     * @private — PUT a new bootnode list and reconcile the UI from the
     * server's authoritative response (it normalizes + reports live-dial).
     * @param {string[]} nextList
     * @param {string|null} addedRaw  the enode just added (for feedback), or null on remove
     */
    EnmPeersPanel.prototype._submit = function (nextList, addedRaw) {
        var self = this;
        this._busy = true;
        this._setBusy(true);
        this.api.put('/chains/' + encodeURIComponent(this.chainId) + '/bootnodes', { bootnodes: nextList })
            .then(function (data) {
                if (self._destroyed) { return; }
                var res = (data && data.result && data.result.chainId) ? data.result : data;
                self._renderFull(res);  // resets list + clears input
                self._reportResult(res, addedRaw);
            })
            .catch(function (err) {
                if (self._destroyed) { return; }
                self._setFeedback((err && err.message) || tFb('peers_panel.save_failed', 'Could not save. Try again.'), true);
            })
            .then(function () {
                if (self._destroyed) { return; }
                self._busy = false;
                self._setBusy(false);
            });
    };

    /**
     * @private — turn a PUT response into operator-facing feedback covering the
     * three outcomes: live-dialed now / saved-but-needs-restart / dial-failed.
     */
    EnmPeersPanel.prototype._reportResult = function (res, addedRaw) {
        res = res || {};
        var applied = Array.isArray(res.applied) ? res.applied : [];
        var failed = Array.isArray(res.failed) ? res.failed : [];

        // Remove (addedRaw === null) — short confirmation, no toast.
        if (addedRaw === null) {
            this._setFeedback(tFb('peers_panel.removed', 'Peer removed.'), false);
            return;
        }
        if (failed.length > 0) {
            var fmsg = tFb('peers_panel.dial_failed',
                'Saved, but the live connection failed: {err}. ENM will retry it next time the chain restarts.',
                { err: (failed[0] && failed[0].error) || 'unknown error' });
            this._setFeedback(fmsg, true);
            this._toast('warning', tFb('peers_panel.toast_dial_failed_title', 'Peer saved (dial failed)'), fmsg);
            return;
        }
        if (res.restartRequired) {
            var rmsg = tFb('peers_panel.saved_restart',
                'Peer saved. Start or restart this chain for it to take effect.');
            this._setFeedback(rmsg, false);
            this._toast('info', tFb('peers_panel.toast_saved_title', 'Peer saved'), rmsg);
            return;
        }
        if (applied.length > 0) {
            var amsg = tFb('peers_panel.dialed',
                'Peer added and connected. Watch the peer count above start to climb.');
            this._setFeedback(amsg, false);
            this._toast('info', tFb('peers_panel.toast_dialed_title', 'Peer connected'), amsg);
            return;
        }
        // Persisted, chain alive, nothing newly dialed (e.g. already present).
        this._setFeedback(tFb('peers_panel.saved', 'Saved.'), false);
    };

    /** @private */
    EnmPeersPanel.prototype._setFeedback = function (msg, isError) {
        if (!this._root) { return; }
        var el = this._root.querySelector('[data-peers-feedback]');
        if (!el) { return; }
        el.textContent = msg || '';
        el.classList.toggle('enm-peers-feedback-error', !!isError);
    };

    /** @private */
    EnmPeersPanel.prototype._setBusy = function (busy) {
        if (!this._root) { return; }
        var btn = this._root.querySelector('.enm-peers-add-btn');
        if (btn) { btn.disabled = !!busy; }
        var input = this._root.querySelector('.enm-peers-input');
        if (input) { input.disabled = !!busy; }
    };

    /** @private — best-effort toast; the inline feedback is the source of truth. */
    EnmPeersPanel.prototype._toast = function (severity, title, body) {
        if (!this.notifications) { return; }
        try {
            if (severity === 'warning' && typeof this.notifications.warning === 'function') {
                this.notifications.warning(title, body);
            } else if (typeof this.notifications.info === 'function') {
                this.notifications.info(title, body);
            }
        } catch (_) { /* notifications are non-critical */ }
    };

    /**
     * Extract the peer's host (IP or hostname) from an enode, for the
     * operator-friendly list display ("IP only"). Handles IPv4, hostnames,
     * and bracketed IPv6. Falls back to a trimmed enode if it doesn't parse.
     * @param {string} enode
     * @returns {string}
     */
    function enodeIp(enode) {
        var s = String(enode || '');
        var m = /@(\[[0-9a-fA-F:]+\]|[^@:/]+):/.exec(s);
        if (m) { return m[1]; }
        return s.length > 40 ? (s.slice(0, 37) + '…') : s;
    }

    root.EnmPeersPanel = EnmPeersPanel;
    // Exported for tests.
    root.EnmPeersPanel._internal = { tFb, escapeHtml, fmtN, looksLikeEnode, enodeIp };
}(typeof window !== 'undefined' ? window : globalThis));
