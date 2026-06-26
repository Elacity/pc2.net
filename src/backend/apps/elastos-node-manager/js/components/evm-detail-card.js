/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/evm-detail-card.js — Council Node UX Phase 3 (v0.5.187).
 *
 * Additive per-chain dashboard card for EVM sidechains (Class B: esc / eid /
 * pg). It mounts BELOW the shared chain-card hero, which already shows
 * height / state / sync / health / start-stop-restart for every class. The
 * chain-card is the Main Chain (Class A) reference and is intentionally left
 * untouched — this card lives alongside it for Class B only, so the Class-A
 * render path is byte-for-byte unchanged.
 *
 * Surfaces the three EVM-specific values the generic hero never shows and
 * that an operator most wants to verify:
 *   1. Validator status           (derived from miner.chainState — backed
 *                                  by detectProducerRole against the
 *                                  on-chain CR-Council / DPoS arbiter
 *                                  slate; NOT an operator toggle)
 *   2. EVM account address        (the geth keystore account — evmKeystoreAddr)
 *   3. Block-reward address       (operator-supplied — miner.rewardAddress)
 *
 * Data source: GET /api/enm/chains/:id → .miner { enabled, evmKeystoreAddr,
 * rewardAddress } (added in Phase 1, P1.1). Real-data-only: a null field
 * renders as "—", never a fabricated address. The encrypted account password
 * is never sent by the backend and is never shown here.
 *
 * The per-EVM-chain binary Update flow is Phase 5, not here. Node output
 * lives in the Logs tab; this card does not invent an error line.
 *
 * Polling: 60 s, visibility-paused (addresses + the mining flag change
 * rarely). alpha.28 invariants preserved: _destroyed guard on async
 * resolves, 401-suppress on the background fetch, enmCopyButton for copy,
 * aria-labelledby on the card root. Copy is inline English to match the
 * peer node-identity-card (pending any future bulk i18n pass).
 *
 * v0.5.237 — this card is READ-ONLY on the dashboard. Block-reward editing
 * moved to the single global Settings → Sidechain settings tab (one reward
 * address for all EVM sidechains), so both address rows render without an
 * Edit affordance. The former inline reward editor + post-save restart
 * banner (and their state) were removed entirely. The EVM account row was
 * always read-only — that's the auto-generated local keystore account and
 * changing it would orphan the geth keystore.
 */

(function (root) {
    'use strict';

    var POLL_INTERVAL_MS = 60_000;

    function EvmDetailCard(opts) {
        if (!opts || !opts.api) { throw new TypeError('EnmEvmDetailCard: { api } required'); }
        if (!opts.chainId)      { throw new TypeError('EnmEvmDetailCard: { chainId } required'); }
        this.api           = opts.api;
        this.chainId       = opts.chainId;
        this.notifications = opts.notifications || null;

        this.root = document.createElement('section');
        this.root.className = 'enm-card enm-section-card enm-evm-detail-card';
        this.root.setAttribute('role', 'region');
        this._titleId = 'enm-evm-detail-title-' + Math.random().toString(36).slice(2, 8);
        this.root.setAttribute('aria-labelledby', this._titleId);
        this.root.innerHTML =
            '<header class="enm-section-card-head">'
            + '<div class="enm-section-card-headbody">'
            +   '<div class="enm-section-card-title" id="' + this._titleId + '">Mining &amp; rewards</div>'
            +   '<div class="enm-section-card-help">Reading EVM mining configuration…</div>'
            + '</div>'
            + '</header>';

        this._destroyed  = false;
        this._pollPauser = null;
        this._pollTimer  = null;
        this._lastMiner  = null;
        this._lastState  = null;  // v0.5.228 — most-recent chain state for restart-now affordance
        this._lastHtml   = null;  // v0.5.191 — render-dedup cache
        // v0.5.237 — the inline reward editor was removed (this card is
        // read-only; reward editing lives in Settings → Sidechain settings),
        // so its state fields (_editingReward / _editingValue / _editorMsg /
        // _editorMsgKind / _pendingRestartHint) are gone.
    }

    EvmDetailCard.prototype.mount = function (parent) {
        parent.appendChild(this.root);
        var self = this;
        this._poll();
        if (typeof root.enmUseVisibilityPause === 'function') {
            this._pollPauser = root.enmUseVisibilityPause(function () { self._poll(); }, POLL_INTERVAL_MS);
        } else {
            this._pollTimer = setInterval(function () { self._poll(); }, POLL_INTERVAL_MS);
        }
        return this;
    };

    EvmDetailCard.prototype.refresh = function () { this._poll(); };

    EvmDetailCard.prototype.destroy = function () {
        this._destroyed = true;
        if (this._pollPauser) {
            try { this._pollPauser.stop(); } catch (_) { /* idempotent */ }
            this._pollPauser = null;
        }
        if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
        if (this.root.parentNode) { this.root.parentNode.removeChild(this.root); }
    };

    /** @private */
    EvmDetailCard.prototype._poll = function () {
        var self = this;
        this.api.get('/chains/' + this.chainId).then(function (env) {
            if (self._destroyed) { return; }
            var d = (env && env.result) || (env && env.data) || env || {};
            self._lastMiner = d.miner || null;
            self._lastState = (d && d.state) || null;
            self._render(d);
        }).catch(function (err) {
            if (self._destroyed) { return; }
            if (err && err.status === 401) { return; }  // boot path owns re-auth
            // Keep the last good render; only show an error sub if we never had one.
            if (!self._lastMiner) {
                var help = self.root.querySelector('.enm-section-card-help');
                if (help) { help.textContent = 'Couldn’t read mining configuration — retrying every 60s.'; }
            }
        });
    };

    /** @private */
    EvmDetailCard.prototype._render = function (d) {
        var miner = d && d.miner ? d.miner : null;
        var evmAddr = miner && miner.evmKeystoreAddr ? miner.evmKeystoreAddr : null;
        var rewardAddr = miner && miner.rewardAddress ? miner.rewardAddress : null;

        // v0.5.228d (audit F4/F5/F6) — read the DERIVED validator state
        // from the new miner.chainState field (now returned by GET
        // /chains/:id alongside miner.enabled). Pre-228d the header tag
        // read cfg.miner.enabled which is the on-disk operator-set
        // value; after a real Council binding the spawn path's
        // in-memory override of miner.enabled is NOT persisted, so the
        // disk value stayed stale and the dashboard tag could disagree
        // with the live badge in Settings. miner.chainState comes from
        // the same chainStateFromRole helper the /system/council-status
        // endpoint uses, so both surfaces always agree.
        //
        // Fallback to the legacy miner.enabled if chainState is missing
        // (older backend version, mainchain RPC down, fresh install
        // before first detect). This keeps the tag rendering even when
        // the derived data is unavailable.
        var validatorState = (miner && miner.chainState) ? miner.chainState : null;
        if (!validatorState && miner) {
            validatorState = miner.enabled ? 'on-duty' : 'inactive';
        }
        var mining = validatorState === 'on-duty';
        var TAG_LABELS = {
            'on-duty':  { cls: 'success', text: 'Validator · On-duty' },
            'standby':  { cls: 'warn',    text: 'Validator · Standby' },
            'inactive': { cls: 'muted',   text: 'Validator · Inactive' },
            'unknown':  { cls: 'muted',   text: 'Validator · Detecting' },
            'follower': { cls: 'muted',   text: 'Validator · Follower' },
        };
        var tagMeta = TAG_LABELS[validatorState] || TAG_LABELS.inactive;
        var tag = '<span class="enm-section-card-tag ' + tagMeta.cls + '">'
            + tagMeta.text + '</span>';

        // v0.5.228 patch — re-ordered so reward address (operator-supplied,
        // the thing they configured at setup) shows FIRST, and the auto-
        // generated EVM account second. Pre-patch the operator's eye landed
        // on "EVM account: —" (which is blank only because this node isn't
        // mining yet — the geth keystore is lazily created on first mining
        // start) and read "no mining address". The reward address — the
        // one they actually entered — was below the fold of the value
        // stack. Reordering + tighter EVM-account hint copy resolves it.
        var evmAccountHint = mining
            ? 'Local geth keystore account this node mines with. Auto-generated; never operator-supplied.'
            : 'Local geth keystore account — only created the first time this node mines. Blank here doesn\'t affect rewards (those go to the address below).';
        var html = ''
            + '<header class="enm-section-card-head">'
            +   '<div class="enm-section-card-headbody">'
            +     '<div class="enm-section-card-title" id="' + this._titleId + '">Mining &amp; rewards</div>'
            +     '<div class="enm-section-card-help">'
            +       (mining
                       ? 'This node produces blocks for the sidechain. Block rewards are credited to the reward address below.'
                       : 'This node is a follower (not producing blocks). The reward address stays configured for if you ever turn mining on — followers don\'t earn EVM block rewards.')
            +     '</div>'
            +   '</div>'
            +   tag
            + '</header>'
            + '<div class="enm-section-card-body">'
            +   '<div class="enm-detail-list">'
            +     this._addrRow('Block reward address',
                    'Where this node\'s block rewards are credited (geth flag --pbft.miner.address). '
                    + 'v0.5.237 — read-only here; edit it (for all sidechains at once) in '
                    + 'Settings → Sidechain settings.',
                    rewardAddr, 'reward')
            +     this._addrRow('EVM account', evmAccountHint, evmAddr, 'evm-account')
            +   '</div>'
            + '</div>'
            + '<div class="enm-section-card-foot">'
            +   '<span class="enm-section-card-foot-status">Node output is in the Logs tab.</span>'
            + '</div>';

        // v0.5.191 perf — skip the rebuild when the 60s poll produced identical
        // markup (the common steady state — addresses + the mining flag rarely
        // change). MUST early-return before the copy-button mount below, which
        // appends (not replaces) — re-running it on unchanged DOM would stack
        // duplicate copy buttons. Every render-relevant value (mining flag,
        // both addresses via data-copy-value + is-empty) is in `html`.
        if (html === this._lastHtml) {
            return;
        }
        this._lastHtml = html;
        this.root.innerHTML = html;

        // Fill long monospace values via textContent (deterministic copy-by-selection).
        var fillEvm = this.root.querySelector('[data-fill="evm-account"]');
        if (fillEvm) { fillEvm.textContent = evmAddr || '—'; }
        var fillReward = this.root.querySelector('[data-fill="reward"]');
        if (fillReward) { fillReward.textContent = rewardAddr || '—'; }

        // Mount copy buttons only for rows that have a real value.
        if (typeof root.enmCopyButton === 'function') {
            var slots = this.root.querySelectorAll('.enm-detail-copy-slot');
            for (var i = 0; i < slots.length; i++) {
                (function (slot) {
                    var value = slot.getAttribute('data-copy-value') || '';
                    if (!value) { return; }
                    var btn = root.enmCopyButton({
                        value: value,
                        label: 'Copy',
                        ariaLabel: 'Copy ' + (slot.dataset.copy || 'value'),
                        notifications: null,
                        className: 'enm-detail-copy-btn',
                    });
                    slot.appendChild(btn);
                })(slots[i]);
            }
        }

    };

    /** @private — stacked label + hint + monospace address value + copy button.
     * When the value is unknown we render "—" and omit the copy button (nothing
     * to copy) — never a fabricated address. v0.5.237 — read-only: the inline
     * Edit affordance was removed (reward editing lives in Settings → Sidechain
     * settings). data-key is kept for stable row identity. */
    EvmDetailCard.prototype._addrRow = function (label, hint, value, key) {
        var copySlot = value
            ? '<span class="enm-detail-copy-slot" data-copy="' + esc(key) + '" data-copy-value="' + esc(value) + '"></span>'
            : '';
        return '<div class="enm-detail-addr-row' + (value ? '' : ' is-empty') + '"'
            + ' data-key="' + esc(key) + '">'
            + '<div class="enm-detail-row-head">'
            +   '<span class="enm-detail-label">' + esc(label) + '</span>'
            +   '<span class="enm-detail-hint">' + esc(hint) + '</span>'
            + '</div>'
            + '<div class="enm-detail-value-stack">'
            +   '<code class="enm-detail-addr" data-fill="' + esc(key) + '"></code>'
            +   copySlot
            + '</div>'
            + '</div>';
    };

    /** @private — HTML-escape displayed strings */
    function esc(s) {
        if (s == null) { return ''; }
        return String(s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    root.EnmEvmDetailCard = EvmDetailCard;
}(typeof window !== 'undefined' ? window : globalThis));
