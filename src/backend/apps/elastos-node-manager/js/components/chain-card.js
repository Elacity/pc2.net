/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/chain-card.js — single-chain status card. (0.2.0-alpha.1)
 *
 * Apple Hero rewrite. The visual hierarchy is:
 *
 *   1. PowerCircle hero — 220px Apple Activity Ring (state colour +
 *      sync percent + sonar-ping breath when healthy).
 *   2. Chain name (h3) + state subtitle (Active / Catching up / etc.).
 *   3. Primary metric — block height number stacked above a small label.
 *   4. Sparkline of last-hour block-height growth (hides when no data).
 *   5. Stats strip — peers / version / uptime, value-on-top hierarchy.
 *   6. Action row — Start / Stop / Restart / Configure (state-gated).
 *
 * What changed from alpha.18:
 *   - The Details disclosure is GONE. The sync panel and BPoS panel
 *     no longer live in the card. Sync info is communicated by the
 *     PowerCircle's filled ring + percent and the X / Y primary metric;
 *     BPoS info moves to the Identity sub-tab.
 *   - The card mounts an EnmSparkline subscribed via heightSeries.
 *   - On every state change the card dispatches 'enm:chain-state' on
 *     window so EnmFleetHealthGradient can recompute the wash hue.
 *
 * The polling cadence (refresh every 5s, sync poll adaptive, producer
 * poll every 60s when relevant) is preserved verbatim — the visual
 * surface changed, not the data layer.
 */

(function (root) {
    'use strict';

    // v0.5.219 audit Phase 5 (AUDIT-FLOW-S01, P3) — the dead
    // COARSE_TO_VISUAL constant that used to live here was DELETED.
    // It was never referenced anywhere in this file (the 5 inline
    // `'healthy' || 'synced'` checks did NOT use it), and the table
    // itself was missing 'synced' / 'loading' (the v0.5.203 vocab
    // update never reached the dead constant). A future "let's clean
    // up by using the constant" refactor would have silently re-
    // introduced the v0.5.203 regression. Source of truth now lives
    // in js/utils-state-vocab.js (root.enmStateVocab). The 5 inline
    // checks below are migrated to enmStateVocab.isAlive() etc. in
    // the v0.5.219 batch.

    // beta.3.92 (Wave M2.4) — operator-facing display-name fallback
    // for every known chainId. Used when the per-chain API response
    // doesn't carry a displayName (rare) or to bridge the brief window
    // between mount + first refresh(). The map mirrors the one in
    // multi-chain-overview.js + chain-selector.js so the chip text,
    // the overview row, and the selector trigger label all match.
    //
    // No ECO entry per H3 (ECO is permanently out-of-scope).
    var CHAIN_DISPLAY_FALLBACK = {
        mainchain:    'Mainchain',
        esc:          'Smart Chain',
        'esc-oracle': 'ESC Oracle',
        eid:          'Identity Chain',
        'eid-oracle': 'EID Oracle',
        pg:           'PG Chain',
        'pg-oracle':  'PG Oracle',
        arbiter:      'Arbiter',
        spv:          'SPV',
    };

    // beta.3.92 (M2.4) — chainId → chain class mapping for in-component
    // section gating. The producer-state chip variant + DPoS rotation
    // strip are Class A only. Mirror of ChainAdapter.CHAIN_ID_TO_CLASS
    // (backend) so the frontend doesn't need to wait for the first /chain
    // API roundtrip to decide which sections to render.
    // P1.6 (v0.5.189) — single source of truth in utils.js (root.enmChainClass);
    // was a verbatim duplicate of the same map in app.js + settings-tab.js.
    var CHAIN_ID_TO_CLASS = root.enmChainClass;

    function ChainCard(opts) {
        if (!opts || !opts.chainId || !opts.api || !opts.notifications) {
            throw new TypeError('ChainCard: { chainId, api, notifications } required');
        }
        this.chainId = opts.chainId;
        this.api = opts.api;
        this.notifications = opts.notifications;
        this.sse = opts.sse || null;
        // beta.3.92 (M2.4) — chainClass for class-aware section gating.
        // Caller (PaneRouter / app.js _mountDashboardForActiveChain) can
        // pass it explicitly; otherwise we fall back to the static lookup.
        // Both paths converge on 'A' for mainchain (the only chain we
        // actively render today), so existing call sites work unchanged.
        this.chainClass = opts.chainClass
            || CHAIN_ID_TO_CLASS[this.chainId]
            || null;
        // 0.2.0-alpha.1 — height-series client backs the sparkline. When
        // absent (test rigs, defensive boot) the sparkline simply never
        // shows; the rest of the card still works.
        this.heightSeries = opts.heightSeries || null;
        this.onStateChange = typeof opts.onStateChange === 'function' ? opts.onStateChange : function () {};
        this.onReconfigure = typeof opts.onReconfigure === 'function' ? opts.onReconfigure : null;

        this.root = document.createElement('article');
        this.root.className = 'enm-chain-card';
        this.root.dataset.chainId = this.chainId;
        // beta.3.92 — also surface the class on the root so CSS can
        // layer per-class styles (e.g. arbiter card uses a different
        // hero color in M6). Defensive: only set when known.
        if (this.chainClass) {
            this.root.dataset.chainClass = this.chainClass;
        }
        // v0.5.207 — initial state is 'loading', NOT 'unconfigured'. Before
        // the v0.5.207 fix, every chain-card mount paint claimed "NOT
        // CONFIGURED" for the 5-20s window before /chains/:id returned (slow
        // for chains doing heavy work — eid mid-state-sync, mainchain in
        // leveldb compaction). Operators read that as "the chain is broken"
        // when in fact it's just the API call in flight. The real
        // 'unconfigured' state is reserved for the 404 branch of the API
        // response (chain-card.js:252) where the backend explicitly tells us
        // the chain isn't configured. Loading visually = neutral chip +
        // skeleton hero + hidden action buttons.
        this.root.dataset.state = 'loading';
        this._busy = false;

        this._renderShell();
    }

    ChainCard.prototype.mount = function (parent) {
        parent.appendChild(this.root);
        this.refresh();
        var self = this;
        if (this.sse) {
            this._unsubscribe = this.sse.subscribe(
                'chains:' + this.chainId + ':status',
                function (payload) { self._applyState(payload); },
            );
            // 0.2.0-alpha.1 — SSE state listener. Toggles the
            // reconnecting pill + sets data-sse-state on the card
            // root so CSS can pause the breath / dim the ring when
            // we've lost the supervisor channel.
            if (typeof this.sse.onState === 'function') {
                this._unsubSse = this.sse.onState(function (sseState) {
                    if (self._destroyed) return;
                    self._applySseState(sseState);
                });
            }
        }
        // Live-metric poll — height/peers/uptime move constantly while
        // the chain is alive. 5s matches alpha.18; backend can absorb it
        // and the dashboard feels live. alpha.28.1 batch 27 — wrapped
        // in enmUseVisibilityPause so the 720 fetches/hr stop when the
        // tab is backgrounded (audit a96c7d71). Falls back to raw
        // setInterval if the helper failed to load.
        if (typeof root !== 'undefined' && typeof root.enmUseVisibilityPause === 'function') {
            this._metricsPauser = root.enmUseVisibilityPause(function () { self.refresh(); }, 5_000);
        } else {
            this._metricsTimer = setInterval(function () { self.refresh(); }, 5_000);
        }
        // Sync poll — adaptive cadence. Drives the PowerCircle percent
        // and the primary-metric "X / Y" line. alpha.28.1 batch 31 —
        // visibility listener wakes the chained-setTimeout chain on
        // resume (the _syncPausedByHidden flag is set in _refreshSync
        // when document.hidden at scheduling time).
        this._onSyncVisChange = function () {
            if (self._destroyed) { return; }
            if (typeof document !== 'undefined' && !document.hidden && self._syncPausedByHidden) {
                self._syncPausedByHidden = false;
                self._refreshSync();
            }
        };
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
            document.addEventListener('visibilitychange', this._onSyncVisChange);
        }
        this._refreshSync();
        // 0.2.0-alpha.7 — DPoS rotation poll (improvement #02). 60s
        // cadence; rotation only changes on round boundaries so no need
        // to hammer the RPC faster than that.
        this._refreshRotation();
        // alpha.28.1 batch 30 — visibility-pause wrap on the 60s
        // rotation poll. Saves 60 hidden-tab fetches/hr; resume-tick
        // re-fetches immediately so the rotation strip stays accurate.
        //
        // 0.5.10 audit Session 10 — skip the timer entirely for non-A
        // chains. Pre-0.5.10 the interval fired every 60s for Class B/
        // C/D/E cards too; _refreshRotation early-returned but the
        // closure still ran. Now: no timer at all when chainClass != A.
        if (this.chainClass && this.chainClass !== 'A') {
            // Non-A chains never need rotation polling.
        } else if (typeof root !== 'undefined' && typeof root.enmUseVisibilityPause === 'function') {
            this._rotationPauser = root.enmUseVisibilityPause(function () { self._refreshRotation(); }, 60_000);
        } else {
            this._rotationTimer = setInterval(function () { self._refreshRotation(); }, 60_000);
        }
        // Beta 3 — Sparkline DROPPED from the chain-card mount path.
        // phase-03 mock has no sparkline in the Dashboard view; block
        // velocity moves into the .enm-sync-progress-bar text line
        // ("Receiving N new blocks/min from peers"). The heightSeries
        // service is left untouched in case BP-C / BP-D wants to reuse
        // it for a different surface; we just don't subscribe here.
        return this;
    };

    ChainCard.prototype.destroy = function () {
        this._destroyed = true;
        if (this._metricsPauser)   { try { this._metricsPauser.stop(); } catch (_) { /* idempotent */ } this._metricsPauser = null; }
        if (this._metricsTimer)    { clearInterval(this._metricsTimer);    this._metricsTimer = null; }
        if (this._uptimeTickTimer) { clearInterval(this._uptimeTickTimer); this._uptimeTickTimer = null; }
        if (this._rotationPauser)  { try { this._rotationPauser.stop(); } catch (_) { /* idempotent */ } this._rotationPauser = null; }
        if (this._rotationTimer)   { clearInterval(this._rotationTimer);   this._rotationTimer = null; }
        if (this._syncTimer)       { clearTimeout(this._syncTimer);        this._syncTimer = null; }
        if (this._onSyncVisChange) {
            try {
                if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
                    document.removeEventListener('visibilitychange', this._onSyncVisChange);
                }
            } catch (_) { /* swallow */ }
            this._onSyncVisChange = null;
        }
        if (this._unsubscribe)     { this._unsubscribe(); this._unsubscribe = null; }
        if (this._unsubSse)        { this._unsubSse();    this._unsubSse = null; }
        if (this._unsubHeight)     { this._unsubHeight(); this._unsubHeight = null; }
        if (this._sparkline)       { this._sparkline.destroy(); this._sparkline = null; }
        // alpha.28.1 batch 24 — symmetry: chain-card creates+mounts a
        // PowerCircle at line 184 but previously never called its
        // destroy(). Cosmetic today (PowerCircle has no timers; its
        // DOM is removed when `this.root` is removed below), but the
        // pattern was asymmetric and prone to regress if PowerCircle
        // ever grows internal listeners. (Lifecycle audit aff18c172.)
        if (this._powerCircle && typeof this._powerCircle.destroy === 'function') {
            try { this._powerCircle.destroy(); } catch (_) { /* idempotent */ }
            this._powerCircle = null;
        }
        // 0.2.0-alpha.1 — tell FleetHealthGradient we're going away so it
        // can drop this chain from its aggregate. Without this, a remount
        // would double-count.
        try {
            root.dispatchEvent(new root.CustomEvent('enm:chain-state', {
                detail: { chainId: this.chainId, removed: true },
            }));
        } catch (_) { /* old browsers without CustomEvent — skip */ }
        if (this.root.parentNode) { this.root.parentNode.removeChild(this.root); }
    };

    /**
     * Re-fetch /chains/:id and re-render. Single-flight guarded so the
     * 5s timer, post-action refreshes, and SSE events collapse to one
     * in-flight request.
     */
    ChainCard.prototype.refresh = function () {
        if (this._destroyed) { return Promise.resolve(); }
        if (this._refreshInFlight) { return this._refreshInFlight; }
        var self = this;
        // 0.5.19 audit Session 19 — resolve display name once for the
        // refresh-fail toast (parity with _do at chain-card.js:1023).
        var t = root.enmTOrFallback;
        var displayName = t('chain_name.' + this.chainId);
        if (!displayName || displayName === 'chain_name.' + this.chainId) {
            displayName = this.chainId;
        }
        this._refreshInFlight = this.api.get('/chains/' + this.chainId, { skipCache: true }).then(function (state) {
            self._applyState(state);
        }).catch(function (err) {
            if (self._destroyed) { return; }
            if (err && err.status === 404) {
                self._applyState({ chainId: self.chainId, state: 'unconfigured' });
                return;
            }
            // 401 → expired session, suppressed here (the boot path
            // owns the re-auth UX); without this every 5s poll during
            // an expired session stacks a fresh "Failed to refresh"
            // warning. Matches the system-status pattern.
            if (err && err.status === 401) { return; }
            // alpha.28.1 batch 19 (audit ad49e60e) — stable id so a
            // 10-minute backend outage doesn't stack 120 identical
            // toasts. show() dedupes by id, updating the existing
            // toast in place instead of mounting a fresh one.
            // v0.5.227 audit Phase 16 (XFLOW-18) — friendly error mapping
            // replaces raw err.message which leaked stack-trace-flavored
            // text like "TypeError: Failed to fetch" to operator UI.
            var friendlyBody = (typeof root.enmFriendlyError === 'function')
                ? root.enmFriendlyError(err)
                : (err && err.message ? err.message : String(err));
            if (friendlyBody == null) { return; }  // 401 silenced upstream
            self.notifications.show({
                id: 'chain-refresh-fail-' + self.chainId,
                severity: 'warning',
                title: 'Failed to refresh ' + displayName,
                body: friendlyBody,
            });
        }).then(function () {
            self._refreshInFlight = null;
        }, function () {
            self._refreshInFlight = null;
        });
        return this._refreshInFlight;
    };

    /**
     * @private
     * Beta 3 — Dashboard view rebuilt from `enm-design-mocks/v2/
     * phase-03-status.html`. The DOM now mirrors the mock structure:
     *
     *   .enm-chain-card                          ← this.root
     *     .enm-chain-card-content                ← 2-col grid auto / 1fr
     *       .enm-hero-power[data-state]   OR     ← hero swap
     *       .enm-hero-sync (with sync %)
     *       .enm-chain-meta
     *         .enm-state-chip                    ← state pill with dot
     *         <div>
     *           .enm-chain-height-label "Block height"
     *           .enm-chain-height "1,742,891"
     *         </div>
     *         .enm-chain-subline                 ← "Fully synced" or sync info
     *         .enm-sync-progress-bar (hidden when not syncing)
     *         .enm-chain-reconnect (alpha.28 batch — kept for SSE drops)
     *     .enm-chain-rotation (alpha.7 — hidden by default)
     *     .enm-stats > .enm-stat (peers / version / uptime)
     *     .enm-chain-actions > .enm-btn ...
     *
     * The PowerCircle + Sparkline mounts from alpha.27 are GONE. The
     * mock has no sparkline on Dashboard, and the hero is now a small
     * div the chain-card owns directly (state-driven via CSS data
     * attribute). The alpha.28 lifecycle invariants (refresh poll,
     * sync poll, SSE wiring, _destroyed guard, BPoS rotation) are
     * preserved verbatim — only the DOM target selectors change.
     */
    ChainCard.prototype._renderShell = function () {
        var t = root.enmTOrFallback;
        var self = this;

        // .enm-chain-card-content — the 2-col grid (hero | meta).
        this._content = document.createElement('div');
        this._content.className = 'enm-chain-card-content';

        // Hero slot — we swap .enm-hero-power vs .enm-hero-sync into here
        // depending on coarse state. Initial render is power/stopped so
        // the card has SOMETHING the first paint before _applyState lands.
        this._heroSlot = document.createElement('div');
        this._heroSlot.className = 'enm-chain-hero-slot';
        // Clickable hero — keeps the alpha.18 "tap circle to do the
        // obvious thing" affordance. Same handler as the old
        // PowerCircle's onTap.
        this._heroSlot.setAttribute('role', 'button');
        this._heroSlot.setAttribute('tabindex', '0');
        this._heroSlot.setAttribute('aria-label',
            t('chain_card.tap_circle_aria', { chainName: this.chainId }) || 'Chain status');
        this._heroSlot.addEventListener('click', function () { self._handleCircleTap(); });
        this._heroSlot.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                self._handleCircleTap();
            }
        });
        this._content.appendChild(this._heroSlot);

        // .enm-chain-meta — right column
        this._meta = document.createElement('div');
        this._meta.className = 'enm-chain-meta';

        // state-chip
        this._stateChip = document.createElement('span');
        this._stateChip.className = 'enm-state-chip';
        // a11y: state changes get announced politely (alpha.28 carry).
        this._stateChip.setAttribute('role', 'status');
        var chipDot = document.createElement('span');
        chipDot.className = 'enm-state-chip-dot';
        this._stateChip.appendChild(chipDot);
        // v0.5.207 — initial chip text is 'Loading…', not 'Not configured'.
        // Matches the dataset.state='loading' default; honest pre-API copy.
        this._stateChipText = document.createTextNode(t('chain_state.loading') || 'Loading…');
        this._stateChip.appendChild(this._stateChipText);
        this._meta.appendChild(this._stateChip);

        // height block
        // 0.5.10 audit Session 10 — class-aware height block.
        //   Class A (mainchain), Class B (ESC/EID/PG): "Block height"
        //   Class D (Arbiter): "SPV height" — the value comes from
        //       getspvheight RPC, NOT a chain the arbiter produces.
        //       Renaming clarifies the SPV-mirror semantics.
        //   Class C (Oracles): NO height concept at all. Oracles are
        //       stateless HTTP relayers; rendering "Block height: —"
        //       forever was misleading. Skip the block entirely.
        //   Class E (SPV): "SPV header height" — like arbiter, it's an
        //       SPV-side height. Renamed for clarity (E is deferred
        //       in v0.4.x but we wire the right label now for forward
        //       compat).
        var heightLabelKey;
        if (this.chainClass === 'D') {
            heightLabelKey = 'chain_card.primary_label_spv_height';
        } else if (this.chainClass === 'E') {
            heightLabelKey = 'chain_card.primary_label_spv_header_height';
        } else {
            heightLabelKey = 'chain_card.primary_label_height';
        }
        var heightLabelFallback = (this.chainClass === 'D' || this.chainClass === 'E')
            ? 'SPV height'
            : 'Block height';
        if (this.chainClass !== 'C') {
            var heightBlock = document.createElement('div');
            var heightLabel = document.createElement('div');
            heightLabel.className = 'enm-chain-height-label';
            heightLabel.textContent = t(heightLabelKey) || heightLabelFallback;
            heightBlock.appendChild(heightLabel);
            this._chainHeight = document.createElement('div');
            this._chainHeight.className = 'enm-chain-height';
            this._chainHeight.textContent = '—';
            heightBlock.appendChild(this._chainHeight);
            this._meta.appendChild(heightBlock);
        } else {
            // Oracle (Class C): no height block. _chainHeight stays
            // null; any updater that pokes it must null-check.
            this._chainHeight = null;
            // 0.5.11 audit Session 11 — surface parent-chain context
            // so the card isn't functionally a state-pill-only row.
            // Oracle's only useful identity info is "I relay for X";
            // the rest (port, last-seen) belongs in the Settings tab.
            // Single row in the meta column; populated by _applyState
            // when a snapshot lands with parentChainId.
            this._oracleParentBlock = document.createElement('div');
            this._oracleParentBlock.className = 'enm-chain-oracle-parent';
            var oracleParentLabel = document.createElement('div');
            oracleParentLabel.className = 'enm-chain-height-label';
            oracleParentLabel.textContent = t('chain_card.oracle_parent_label')
                || 'Relays for';
            this._oracleParentBlock.appendChild(oracleParentLabel);
            this._oracleParentValue = document.createElement('div');
            this._oracleParentValue.className = 'enm-chain-oracle-parent-value';
            this._oracleParentValue.textContent = '—';
            this._oracleParentBlock.appendChild(this._oracleParentValue);
            this._meta.appendChild(this._oracleParentBlock);
        }

        // subline — fully-synced ✓ tick OR sync info "Receiving 12 blocks/min"
        this._subline = document.createElement('div');
        this._subline.className = 'enm-chain-subline';
        this._meta.appendChild(this._subline);

        // sync-progress-bar — visible only when syncing. Carries the
        // "Receiving N blocks/min from peers" feedback line per mock.
        this._syncBar = document.createElement('div');
        this._syncBar.className = 'enm-sync-progress-bar';
        this._syncBar.hidden = true;
        this._meta.appendChild(this._syncBar);

        // alpha.28.1 — SSE-disconnect indicator pill. The mock has no
        // explicit slot for it; we tuck it inside meta so it sits with
        // the rest of the chain status info. role=status preserved.
        this._reconnectPill = document.createElement('span');
        this._reconnectPill.className = 'enm-chain-reconnect';
        this._reconnectPill.setAttribute('role', 'status');
        this._reconnectPill.textContent = t('chain_card.sse_reconnecting') || 'Reconnecting…';
        this._reconnectPill.hidden = true;
        this._meta.appendChild(this._reconnectPill);

        this._content.appendChild(this._meta);
        this.root.appendChild(this._content);

        // alpha.7 — DPoS rotation strip (improvement #02). Hidden unless
        // on-duty / in-slate / next-slate. Sits between the meta and
        // the stats row.
        this._rotationStrip = document.createElement('div');
        this._rotationStrip.className = 'enm-chain-rotation';
        this._rotationStrip.hidden = true;
        this.root.appendChild(this._rotationStrip);

        // .enm-stats — phase-03 row of stat cells. Peers/version/uptime.
        this._statsStrip = document.createElement('div');
        this._statsStrip.className = 'enm-stats';
        this._statFields = {};
        this._statCells = {};
        ['peers', 'version', 'uptime'].forEach(function (k) {
            var cell = document.createElement('div');
            cell.className = 'enm-stat enm-stat-' + k;
            var label = document.createElement('span');
            label.className = 'enm-stat-label';
            label.textContent = t('chain_card.' + k);
            // 0.2.0-beta.3.6 — phase-03 mock: the Peers stat shows a tiny
            // "i" hint glyph after its label and a hover-popover
            // (.enm-peer-pop) listing each connected peer's direction /
            // address / height / ping. Wire the glyph + an empty
            // popover container so _applyState can populate it as
            // peerSummary lands.
            if (k === 'peers') {
                cell.classList.add('enm-stat-has-pop');
                cell.style.position = 'relative';
                cell.style.cursor = 'help';
                var info = document.createElement('span');
                info.className = 'enm-stat-info';
                info.setAttribute('aria-hidden', 'true');
                info.textContent = 'i';
                label.appendChild(document.createTextNode(' '));
                label.appendChild(info);
            }
            cell.appendChild(label);
            var value = document.createElement('span');
            value.className = 'enm-stat-value';
            value.textContent = '—';
            cell.appendChild(value);
            self._statsStrip.appendChild(cell);
            self._statFields[k] = value;
            self._statCells[k] = cell;
        });
        // Peer popover element (phase-03 .peer-pop). Mounted inside the
        // peers stat-cell so CSS can position it absolutely under the
        // label. Visibility flipped via [data-visible] on hover/focus.
        this._peerPop = document.createElement('div');
        this._peerPop.className = 'enm-peer-pop';
        this._peerPop.setAttribute('role', 'tooltip');
        this._peerPop.setAttribute('aria-hidden', 'true');
        this._peerPop.dataset.visible = 'false';
        if (this._statCells.peers) {
            this._statCells.peers.appendChild(this._peerPop);
            // Hover / focus reveal. Keep on document keyboard nav too.
            var peerCell = this._statCells.peers;
            var pop = this._peerPop;
            peerCell.addEventListener('mouseenter', function () {
                if (self._peerPopHasData) { pop.dataset.visible = 'true'; pop.setAttribute('aria-hidden', 'false'); }
            });
            peerCell.addEventListener('mouseleave', function () {
                pop.dataset.visible = 'false';
                pop.setAttribute('aria-hidden', 'true');
            });
            peerCell.addEventListener('focusin', function () {
                if (self._peerPopHasData) { pop.dataset.visible = 'true'; pop.setAttribute('aria-hidden', 'false'); }
            });
            peerCell.addEventListener('focusout', function (ev) {
                // Only hide if focus left the entire cell.
                if (!peerCell.contains(ev.relatedTarget)) {
                    pop.dataset.visible = 'false';
                    pop.setAttribute('aria-hidden', 'true');
                }
            });
            // Make label keyboard-focusable so screen reader users can
            // surface the popover content via Tab + arrow keys.
            peerCell.setAttribute('tabindex', '0');
        }
        this.root.appendChild(this._statsStrip);

        // .enm-chain-actions — Configure (when unconfigured) / Start /
        // Restart / Stop. Mock order is Restart first then Stop; we keep
        // that order so the destructive Stop is the rightmost button
        // (less likely to be clicked accidentally).
        var actions = document.createElement('div');
        actions.className = 'enm-chain-actions';
        this._configureBtn = makeBtn(t('chain_actions.configure'), 'enm-btn enm-btn-primary',   this._handleConfigure.bind(this));
        this._startBtn     = makeBtn(t('chain_actions.start'),     'enm-btn enm-btn-primary',   this._handleStart.bind(this));
        this._restartBtn   = makeBtn(t('chain_actions.restart'),   'enm-btn',                   this._handleRestart.bind(this));
        this._stopBtn      = makeBtn(t('chain_actions.stop'),      'enm-btn enm-btn-danger',    this._handleStop.bind(this));
        actions.appendChild(this._configureBtn);
        actions.appendChild(this._startBtn);
        actions.appendChild(this._restartBtn);
        actions.appendChild(this._stopBtn);
        this.root.appendChild(actions);

        // alpha.28 carry — `this._stateSubtitle` and `this._primaryMetric` /
        // `this._primaryLabel` are EXPECTED by _applyState + _refreshSync.
        // The new DOM doesn't have those as separate elements; we point
        // them at compatibility proxies so the old methods keep working
        // without a full rewrite. (Future Beta 3 audit pass can refactor
        // _applyState to write to the new field names directly.)
        this._stateSubtitle = this._stateChip;          // writes to text node below
        this._primaryMetric = this._chainHeight;        // value
        this._primaryLabel  = heightLabel;              // "Block height"

        // Initial hero render — empty/stopped until _applyState lands.
        this._renderHeroPower('stopped');
    };

    /**
     * @private
     * Swap the hero slot to .enm-hero-power with the given data-state.
     * Mock visual states: 'running' (green halo + pulsing dot),
     * 'stopped' (gray, no glow, no dot), 'stalled' (amber halo + dot),
     * 'error' (red, designed but not rendered in the phase-03 mock).
     */
    ChainCard.prototype._renderHeroPower = function (state) {
        var t = root.enmTOrFallback;
        // beta.3.16 — rebuild even on same-state if we need to swap
        // the caption (e.g. state transition keeps power mode but
        // caption needs to appear/disappear). Cheap guard: still
        // bail when state AND caption-visibility match.
        var needCaption = (state === 'stopped' || state === 'error');
        var hasCaption = !!this._heroSlot.querySelector('.enm-hero-tap-caption');
        if (this._heroMode === 'power' && this._heroSlot.firstChild
            && this._heroSlot.firstChild.dataset.state === state
            && needCaption === hasCaption) {
            return; // no-op if already in this state — avoid DOM churn
        }
        this._heroSlot.innerHTML = '';
        var hero = document.createElement('div');
        hero.className = 'enm-hero-power';
        hero.dataset.state = state;
        var live = document.createElement('div');
        live.className = 'enm-hero-power-live';
        hero.appendChild(live);
        // SVG uses <use> to reference the shared #enm-power-icon symbol
        // defined at body top in index.html.
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'enm-hero-power-icon');
        svg.setAttribute('viewBox', '0 0 24 24');
        var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#enm-power-icon');
        use.setAttribute('href', '#enm-power-icon');
        svg.appendChild(use);
        hero.appendChild(svg);
        // beta.3.16 — visible "Tap to start" caption when the chain is
        // stopped or errored. Hidden in alive states; redundant in the
        // unconfigured state (the chip + the Configure CTA already
        // tell that story).
        if (needCaption) {
            var caption = document.createElement('div');
            caption.className = 'enm-hero-tap-caption';
            caption.textContent = t('chain_card.tap_to_start_caption', { chainName: this.chainId }) || 'Tap to start';
            // Caption is decorative — the aria-label on the slot already
            // says "Start mainchain". aria-hidden prevents double-speak.
            caption.setAttribute('aria-hidden', 'true');
            hero.appendChild(caption);
        }
        this._heroSlot.appendChild(hero);
        this._heroMode = 'power';

        // beta.3.16 — dynamic aria-label per state. Tap-able states
        // (stopped / error / unconfigured / disabled) announce the
        // action they trigger; alive states announce status only.
        //
        // 0.5.123 audit Session 123 — branch order fix. Pre-0.5.123 the
        // "configure" branch was unreachable: the `stopped || error`
        // catch fired first, so a card whose visual state is 'stopped'
        // AND whose underlying coarse state is 'unconfigured' got the
        // generic "tap to start" aria. Screen-reader users tapping an
        // unconfigured chain's hero never heard "Configure {chainName}"
        // (strings.js:828 key existed but was never resolved). Putting
        // the more-specific check first restores the intended a11y
        // behavior. Harmless if the unconfigured-while-stopped state
        // never materializes in practice; defensive otherwise.
        var aria;
        if (state === 'stopped' && this._lastCoarseState === 'unconfigured') {
            aria = t('chain_card.tap_circle_aria_configure', { chainName: this.chainId });
        } else if (state === 'stopped' || state === 'error') {
            aria = t('chain_card.tap_circle_aria_start', { chainName: this.chainId });
        } else if (state === 'running') {
            aria = t('chain_card.tap_circle_aria_running', { chainName: this.chainId });
        } else {
            aria = t('chain_card.tap_circle_aria', { chainName: this.chainId });
        }
        this._heroSlot.setAttribute('aria-label', aria || 'Chain status');
    };

    /**
     * @private
     * Swap the hero slot to .enm-hero-sync with the given percent (0-100).
     * Mock spec: concentric SVG circles r=45, stroke-dasharray=282.6
     * (= 2πr), dashoffset = circumference × (1 - pct/100). Inner block
     * shows the percent + "Syncing" label.
     */
    ChainCard.prototype._renderHeroSync = function (percent) {
        var pct = Math.max(0, Math.min(100, percent || 0));
        var circ = 282.6; // 2π × 45 ≈ 282.74; mock uses 282.6 — keep parity
        var offset = (circ * (1 - pct / 100)).toFixed(1);
        if (this._heroMode === 'sync') {
            // In-place update: don't rebuild the SVG, just adjust dashoffset
            // + percent text so the ring animates smoothly via CSS
            // transition.
            var ring = this._heroSlot.querySelector('.enm-hero-sync svg circle:nth-of-type(2)');
            var pctEl = this._heroSlot.querySelector('.enm-hero-pct');
            if (ring) { ring.setAttribute('stroke-dashoffset', offset); }
            if (pctEl) {
                pctEl.firstChild.nodeValue = String(Math.round(pct));
            }
            return;
        }
        this._heroSlot.innerHTML = '';
        var hero = document.createElement('div');
        hero.className = 'enm-hero-sync';
        hero.innerHTML =
            '<svg viewBox="0 0 100 100" aria-hidden="true">'
            +   '<circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="6"/>'
            +   '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#enm-sync-grad)" stroke-width="6"'
            +     ' stroke-dasharray="' + circ + '"'
            +     ' stroke-dashoffset="' + offset + '"'
            +     ' stroke-linecap="round" transform="rotate(-90 50 50)"/>'
            + '</svg>'
            + '<div class="enm-hero-sync-inner">'
            +   '<div class="enm-hero-pct">' + Math.round(pct) + '<span class="enm-hero-pct-suffix">%</span></div>'
            +   '<div class="enm-hero-pct-label">Syncing</div>'
            + '</div>';
        this._heroSlot.appendChild(hero);
        this._heroMode = 'sync';
    };

    /**
     * @private
     * Tap-the-circle on the Apple Hero card is a "do the obvious thing"
     * affordance. No more disclosure to toggle since details are gone.
     *
     *   unconfigured     → open Configure wizard
     *   stopped / error  → pulse the action row so eye lands on Start
     *   alive            → pulse the action row (Stop / Restart visible)
     */
    ChainCard.prototype._handleCircleTap = function () {
        var coarse = this._lastCoarseState || 'unconfigured';
        // beta.3.16 — tap-to-start. Previously the tap only configured
        // (when unconfigured) and pulsed the action row everywhere else,
        // so tapping a stopped node looked broken. Operator feedback:
        // tap should START a stopped node, but NEVER stop a running one
        // (an accidental stop is destructive; we keep stop opt-in via
        // the explicit Stop button).
        if (coarse === 'unconfigured' || coarse === 'disabled') {
            return this._handleConfigure();
        }
        if (coarse === 'stopped' || coarse === 'error') {
            // Reuse the same path the Start button uses (handles
            // 401-suppress, 409 host-conflict toasts, btn.disabled
            // reset). The action row also pulses via _do().
            this._pulseActionRow();
            return this._handleStart();
        }
        // alive (healthy/syncing/starting/recovering/stalled) — no
        // tap-to-stop. Just draw the eye to the action row so the
        // operator can find Stop / Restart if that's what they want.
        return this._pulseActionRow();
    };

    /**
     * @private
     * Brief animation on the action row so the operator's eye lands on
     * the visible buttons. Inherited from alpha.18 — the keyframe lives
     * in styles.css. One-shot setTimeout so back-to-back taps re-fire.
     */
    ChainCard.prototype._pulseActionRow = function () {
        var row = this.root.querySelector('.enm-chain-actions');
        if (!row) return;
        // alpha.29 batch 108 (Round-34 perf finding #2, MED) — replace
        // the forced-layout `row.offsetWidth` reflow trick with a
        // requestAnimationFrame defer. Same effect (re-apply the class
        // after the browser has registered the remove) without the
        // synchronous style/layout flush. The previous trick worked
        // but caused a measurable ~1-2ms layout flush on every
        // operator click, compounding on multi-chain dashboards where
        // pulses can overlap.
        row.classList.remove('enm-chain-actions-pulse');
        var self = this;
        if (typeof requestAnimationFrame === 'function') {
            // BP-E audit fix — guard against destroy() detaching the row
            // between the schedule and the RAF firing. Without this check,
            // a fast unmount (e.g. operator switches chains mid-pulse on a
            // multi-chain dashboard) mutates a detached DOM subtree, which
            // is wasted work and trips on _destroyed-invariant CI checks.
            requestAnimationFrame(function () {
                if (self._destroyed) { return; }
                row.classList.add('enm-chain-actions-pulse');
            });
        } else {
            row.classList.add('enm-chain-actions-pulse');
        }
        // BP-E audit fix — same _destroyed guard on the 700ms removal so a
        // late-arriving "remove pulse" doesn't fire on a torn-down card.
        setTimeout(function () {
            if (self._destroyed) { return; }
            row.classList.remove('enm-chain-actions-pulse');
        }, 700);
    };

    ChainCard.prototype._applyState = function (state) {
        if (this._destroyed) { return; }
        var t = root.enmTOrFallback;
        var coarse = (state && state.state) ? state.state : 'unconfigured';
        this._lastCoarseState = coarse;
        this._lastBackendState = state || {};
        this.root.dataset.state = coarse;

        // Beta 3 — hero swap per phase-03 mock. `.hero-power` for stopped/
        // running/stalled/error; `.hero-sync` for syncing/recovering/
        // starting. Percent for sync hero lands later from _refreshSync;
        // initial percent is 0 until /sync resolves.
        if (coarse === 'syncing' || coarse === 'recovering' || coarse === 'starting') {
            this._renderHeroSync(this._lastSyncPercent || 0);
        } else {
            // Map coarse → hero-power data-state. Mock defines: running /
            // stopped / stalled / error. Unconfigured / disabled visually
            // are 'stopped' (gray, no glow).
            // v0.5.219 audit Phase 5 — route through enmStateVocab
            // (XFLOW-04 / XFLOW-16). The shared utility handles the
            // v1 'healthy' / 'running' aliases, future state additions,
            // and the visual mapping. Replaces the inline ternary that
            // had to be updated at every state-vocab change.
            var heroState = (root.enmStateVocab && root.enmStateVocab.stateVisual)
                ? root.enmStateVocab.stateVisual(coarse)
                : (coarse === 'healthy' || coarse === 'synced') ? 'running'
                  : (coarse === 'stalled') ? 'stalled'
                  : (coarse === 'error')   ? 'error'
                  : 'stopped';
            // Map enmStateVocab's wider visual vocab to the hero-power
            // component's narrower set (it supports running/stalled/
            // error/off — 'syncing'/'booting' don't apply here since
            // those states render the sync-ring hero instead).
            var heroPowerState = (heroState === 'running') ? 'running'
                : (heroState === 'stalled') ? 'stalled'
                : (heroState === 'error')   ? 'error'
                : 'stopped';
            this._renderHeroPower(heroPowerState);
        }

        // State-chip — text + modifier class. Mock variants: .accent
        // (syncing), .warn (stalled), .error (error), .muted (stopped),
        // default (healthy). The chain-chip-dot pulses; muted variant
        // mutes the pulse.
        //
        // 0.2.0-beta.3.4 — phase-03 mock pattern for chip TEXT is
        // chain-name + state + version. Examples from the mock:
        //   running fully synced: "Mainchain · v0.9.7"
        //   syncing:               "Mainchain · syncing · v0.9.7"
        //   stalled / error / stopped: just the state name (e.g. "Stopped")
        // We render the producer state on top of that when applicable
        // (the chain has both a system state AND a producer state).
        // beta.3.92 (M2.4) — chain name now sources from (1) the
        // server-side displayName (canonical, set per-class by the
        // adapter), (2) strings.js `chain_name.<chainId>` for i18n
        // (M2.6), (3) the static CHAIN_DISPLAY_FALLBACK table,
        // (4) the chainId itself as last resort.
        // Pre-3.92 the hardcoded `(chainId === 'mainchain') ? 'Mainchain'
        // : String(chainId)` ternary printed "esc" / "eid" / "arbiter"
        // as the chip text once non-mainchain dashboards land in M3+.
        // beta.3.94 (M2.6) — strings.js lookup inserted between server
        // displayName and the static fallback. enmT returns `[key]` for
        // missing entries; treat that as "no override" and fall through.
        var chainNameLabel;
        if (state && state.displayName) {
            chainNameLabel = state.displayName;
        } else {
            var i18nName = t('chain_name.' + this.chainId);
            chainNameLabel = (i18nName && i18nName !== ('[chain_name.' + this.chainId + ']'))
                ? i18nName
                : (CHAIN_DISPLAY_FALLBACK[this.chainId] || String(this.chainId || 'Chain'));
        }
        // beta.3.92 (M2.4) — producer-state chip variant is Class A
        // (BPoS mainchain) only. EVM sidechains have a separate
        // mining/miner-address concept (M3); Oracles + Arbiter have
        // no producer at all. Gating by chainClass keeps the chip
        // honest if a future regression accidentally returns
        // producerState on a non-A chain's response.
        var producerState = (this.chainClass === 'A' && state && state.producerState)
            ? state.producerState : null;
        // v0.5.229 (Phase D) — Council membership chip overrides BPoS
        // producer state when the operator is bound to a CR Committee
        // seat. CR seats are higher-tier than BPoS slots in Elastos's
        // DPoS rotation, so a "Council · Elected" chip is more
        // informative than "Active" for a CR operator who happens to
        // ALSO be a BPoS producer. Falls through to BPoS when crMember
        // is null (pure BPoS operator or mainchain RPC down).
        // v0.5.229d (P4 audit fix) — also stash on the instance so the
        // rotation strip's _applyRotation can read it for the
        // "unclaim pending; slate freeze" qualifier without doing its
        // own /system/identity fetch.
        var crMember = (this.chainClass === 'A' && state && state.crMember)
            ? state.crMember : null;
        this._lastCrMember = crMember;
        var crChipLabel = null;
        if (crMember && crMember.isCrMember && crMember.state) {
            crChipLabel = 'Council · ' + crMember.state;
        } else if (crMember && crMember.inNextCommittee && crMember.state) {
            crChipLabel = 'Council · Next term';
        }
        var version = (state && state.binaryVersion) ? state.binaryVersion : '';
        var versionSuffix = version ? ' · ' + version : '';
        var chipText;
        // v0.5.219 audit Phase 5 — route through enmStateVocab.isAlive
        // (handles 'healthy'/'synced'/'syncing'/'stalled'/'recovering' uniformly,
        // including v1 'healthy'/'running' aliases). Closes 2 of the 3
        // remaining inline `'healthy' || 'synced'` sites in this file.
        var aliveForChip = (root.enmStateVocab && root.enmStateVocab.isAlive)
            ? (root.enmStateVocab.isAlive(coarse) || coarse === 'syncing')
            : (coarse === 'healthy' || coarse === 'synced' || coarse === 'syncing' || coarse === 'stalled');
        if (crChipLabel && aliveForChip) {
            // v0.5.229 — Council chip wins when applicable. Versionsuffix
            // appended same as the BPoS chip below; dataset.state encodes
            // the Council state for CSS theming (.state="...-council-elected" etc.).
            chipText = crChipLabel + versionSuffix;
            this._stateChip.dataset.state = coarse + '-council-' + String(crMember.state || 'unknown').toLowerCase();
        } else if (producerState && aliveForChip) {
            // 0.2.0-beta.3.6 — include the version suffix on producer-state
            // chips too. Pre-beta.3.6 dropped it when producerState was set,
            // leaving "Active" alone on the chip. Mock keeps the version
            // for layout consistency: "Active · v0.9.7" / "Rank #42 · v0.9.7".
            chipText = producerState + versionSuffix;
            this._stateChip.dataset.state = coarse + '-producer-' + String(producerState).toLowerCase();
        } else if (root.enmStateVocab && root.enmStateVocab.normalize(coarse) === 'synced') {
            chipText = chainNameLabel + versionSuffix;
            this._stateChip.dataset.state = coarse;
        } else if (coarse === 'syncing' || coarse === 'recovering' || coarse === 'starting') {
            chipText = chainNameLabel + ' · ' + t('chain_state.' + coarse).toLowerCase() + versionSuffix;
            this._stateChip.dataset.state = coarse;
        } else {
            // stopped / error / stalled / unconfigured / disabled — just
            // the coarse-state name; the chain context is conveyed by the
            // dashboard itself (operator already knows it's the mainchain
            // pane).
            chipText = t('chain_state.' + coarse);
            this._stateChip.dataset.state = coarse;
        }
        // Update the text node without wiping the dot child.
        this._stateChipText.nodeValue = chipText;
        // Modifier classes
        this._stateChip.classList.remove('accent', 'warn', 'error', 'muted');
        if (coarse === 'syncing' || coarse === 'recovering' || coarse === 'starting') {
            this._stateChip.classList.add('accent');
        } else if (coarse === 'stalled') {
            this._stateChip.classList.add('warn');
        } else if (coarse === 'error') {
            this._stateChip.classList.add('error');
        } else if (coarse === 'stopped' || coarse === 'unconfigured' || coarse === 'disabled') {
            this._stateChip.classList.add('muted');
        }

        // Block-height number. The "/ network" suffix when syncing is set
        // later by _refreshSync via _applySyncSnapshot.
        var height = (state && state.height != null) ? state.height : null;
        // 0.5.10 audit Session 10 — Class C oracle cards skip the height
        // block entirely (oracles have no chain); _chainHeight is null.
        if (this._chainHeight) {
            // v0.5.191 flicker fix — reuse the cached /sync snapshot so the metric
            // keeps its final "local / network" shape and the 5s state-poll no longer
            // re-flips it to height-only. For a syncing chain whose first /sync hasn't
            // resolved yet, leave the placeholder ('—') instead of painting a bare
            // height that _applySyncSnapshot would immediately re-format to
            // "local / network" — that two-format double-render is the reported flicker.
            var _snap = this._lastSyncSnapshot || null;
            var _syncingLike = (coarse === 'syncing' || coarse === 'recovering' || coarse === 'starting');
            if (_snap || !_syncingLike) {
                this._chainHeight.textContent = formatPrimaryValue(t, coarse, height, _snap);
            }
        }
        // The "Block height" label stays static in phase-03; in alpha.27
        // it swapped to "connecting to peers" while we waited for the
        // first peer handshake. Preserve that behaviour but write into
        // the new heightLabel node (proxied via _primaryLabel).
        // Same Class-C guard as _chainHeight — Class C card omits the
        // _primaryLabel along with the height block.
        if (this._primaryLabel) {
            this._primaryLabel.textContent = formatPrimaryLabel(t, coarse, height, null);
        }
        // 0.5.11 audit Session 11 — Class C oracle: populate the
        // "Relays for" row from state.parentChainId (per CouncilOverview
        // Service snapshot shape at line 317). Falls back to '—' when
        // the snapshot hasn't arrived yet; once it does, this fires
        // and renders e.g. "Smart Chain (ESC)" for esc-oracle.
        if (this._oracleParentValue && state && state.parentChainId) {
            var parentDisplay = CHAIN_DISPLAY_FALLBACK[state.parentChainId]
                || state.parentChainId;
            // v0.5.168 (Phase 1/3) — append the parent EVM chain's current
            // block height when the backend surfaces it (GET /chains/:id
            // parentBlockHeight) so the oracle card shows WHAT it relays from,
            // not just the chain name. Stays just the name until it arrives.
            if (state.parentBlockHeight != null) {
                parentDisplay += ' · ' + fmtH(state.parentBlockHeight);
            }
            this._oracleParentValue.textContent = parentDisplay;
        }

        // Subline — at-tip "Fully synced" check when healthy, or sync
        // info during sync (lands from _refreshSync). Cleared otherwise.
        this._renderSubline(coarse, state, null);

        // Stats strip.
        // 0.2.0-alpha.28.1 — peers/latency/skew numbers now go through
        // enmFormatNumber so thousands group consistently with block
        // height (and screen readers get a steady rhythm). Falls back to
        // the raw value if the util didn't load.
        var fmtN = (typeof window !== 'undefined' && window.enmFormatNumber)
            ? window.enmFormatNumber
            : function (n) { return (n == null || !isFinite(n)) ? '—' : String(n); };
        this._statFields.peers.textContent   = state && state.peers         != null ? fmtN(state.peers) : '—';
        // 0.2.0-beta.3.6 — peer popover (phase-03 .peer-pop). The pre-
        // beta.3.6 impl only set a `title` attribute as a flat tooltip.
        // The mock spec is a hover card with per-peer rows (direction,
        // address, height, ping). Backend's getnodestate.neighbors gives
        // us a richer summary in state.peerSummary; we render whatever
        // shape it provides and degrade gracefully when fields are
        // missing.
        this._renderPeerPop(state && state.peerSummary, state && state.peers);
        this._statFields.version.textContent = state && state.binaryVersion ? state.binaryVersion : '—';
        // 0.2.0-alpha.5 — uptime gets a local 1-second tick instead of
        // riding the 5s refresh poll. We anchor _uptimeBaseMs to
        // (now - uptimeSec) every time the backend reports a number,
        // then the local interval recomputes the displayed value off
        // Date.now() each second. Effect: smooth 37s → 38s → 39s
        // counter instead of jumps from 37s → 42s every poll.
        if (state && state.uptimeSec != null) {
            this._uptimeBaseMs = Date.now() - state.uptimeSec * 1000;
            this._statFields.uptime.textContent = root.enmFormatUptime(state.uptimeSec);
            if (!this._uptimeTickTimer) {
                var card = this;
                this._uptimeTickTimer = setInterval(function () {
                    if (card._destroyed || card._uptimeBaseMs == null) return;
                    var elapsedSec = Math.floor((Date.now() - card._uptimeBaseMs) / 1000);
                    card._statFields.uptime.textContent = root.enmFormatUptime(elapsedSec);
                }, 1_000);
            }
        } else {
            this._uptimeBaseMs = null;
            this._statFields.uptime.textContent = '—';
            if (this._uptimeTickTimer) {
                clearInterval(this._uptimeTickTimer);
                this._uptimeTickTimer = null;
            }
        }

        // Action row enable/disable.
        // v0.5.219 audit Phase 5 — single source-of-truth for the
        // alive predicate. Pre-v0.5.219 this inline OR-chain at 5
        // sites in this file caused the v0.5.203 vocab regression
        // (chain showed "TAP TO START" + hid Stop/Restart when state
        // was 'synced'). Now: enmStateVocab.isAlive() handles every
        // v1/v2 alias + future additions.
        var alive = (root.enmStateVocab && root.enmStateVocab.isAlive)
            ? (root.enmStateVocab.isAlive(coarse) || coarse === 'syncing' || coarse === 'starting')
            : (coarse === 'healthy' || coarse === 'synced'
                || coarse === 'syncing' || coarse === 'stalled'
                || coarse === 'recovering' || coarse === 'starting');
        var unconfigured = (coarse === 'unconfigured');
        // v0.5.207 — 'loading' is the pre-API placeholder. Hide every action
        // button while we don't know what the chain's true state is —
        // showing Configure / Start / Stop while we don't know the state
        // tempted operators to click buttons that would do the wrong thing
        // for the actual chain. Buttons re-appear with correct visibility
        // once _applyState lands a real state value.
        var loading = (coarse === 'loading');
        // v0.5.207 — hide every action button while loading. The buttons
        // re-appear with correct visibility once _applyState resolves to a
        // real state. Pre-v0.5.207 this card's first paint showed Configure
        // (or Start/Stop/Restart depending on prior state) which was a
        // misleading invitation to act on incomplete information.
        this._configureBtn.hidden = loading || !unconfigured || !this.onReconfigure;
        this._startBtn.hidden     = loading || unconfigured;
        this._stopBtn.hidden      = loading || unconfigured;
        this._restartBtn.hidden   = loading || unconfigured;
        this._startBtn.disabled   = loading || alive;
        this._stopBtn.disabled    = loading || !alive || coarse === 'stopped';
        this._restartBtn.disabled = loading || !alive;

        // 0.2.0-alpha.1 — notify FleetHealthGradient. CustomEvent on
        // window so the controller can subscribe once and aggregate
        // without dependency injection through technical-view / app.js.
        try {
            root.dispatchEvent(new root.CustomEvent('enm:chain-state', {
                detail: { chainId: this.chainId, coarseState: coarse },
            }));
        } catch (_) { /* old browsers without CustomEvent — skip */ }

        this.onStateChange(coarse, state);
    };

    // 0.2.0-alpha.4 — treat-as-synced threshold. When a new block lands
    // upstream the network heads forward by 1 before we've fetched it,
    // briefly putting us "1 block behind" — the formatter used to flip
    // the primary metric to "X / X+1" for one polling tick and then
    // back to "X+1" once we caught up. Reads as flicker. Anything ≤
    // this many blocks behind is treated as caught-up for the display.
    var TREAT_AS_SYNCED_THRESHOLD = 2;

    /**
     * Build the big block-height number under the state subtitle. When
     * a /sync snapshot is in flight, _refreshSync overrides this with
     * "local / network" (e.g. "943,210 / 1,123,455"). The local-only
     * variant wins when blocksBehind ≤ TREAT_AS_SYNCED_THRESHOLD even
     * if the backend's synced flag is false, so the steady-state
     * dashboard doesn't flicker on every block.
     */
    function formatPrimaryValue(t, coarse, height, syncSnapshot) {
        if (coarse === 'unconfigured') {
            return t('chain_card.primary_metric_unconfigured');
        }
        if (coarse === 'stopped') {
            return t('chain_card.primary_metric_off');
        }
        // Backend contract guard (audit a3e53e9a) — every site below
        // calls `.toLocaleString()` directly on the height field.
        // toLocaleString exists on strings AND numbers but the string
        // overload doesn't group thousands, so a backend that ever
        // typed heights as JSON strings (`"943210"`) would silently
        // break the display. enmFormatNumber coerces via Number() and
        // routes through the canonical NaN/Infinity → "—" guard.
        var fmtH = (typeof window !== 'undefined' && window.enmFormatNumber)
            ? function (v) {
                var n = typeof v === 'number' ? v : Number(v);
                return window.enmFormatNumber(n);
            }
            : function (v) {
                return (v == null) ? '—' : String(v);
            };
        if (syncSnapshot) {
            var basicallySynced = syncSnapshot.synced
                || (typeof syncSnapshot.blocksBehind === 'number'
                    && syncSnapshot.blocksBehind <= TREAT_AS_SYNCED_THRESHOLD);
            if (basicallySynced && syncSnapshot.localHeight != null) {
                return fmtH(syncSnapshot.localHeight);
            }
            if (syncSnapshot.networkHeight != null && syncSnapshot.localHeight != null) {
                return fmtH(syncSnapshot.localHeight)
                    + ' / ' + fmtH(syncSnapshot.networkHeight);
            }
            if (syncSnapshot.localHeight != null) {
                return fmtH(syncSnapshot.localHeight);
            }
        }
        if (height != null) return fmtH(height);
        return '—';
    }

    /**
     * Lowercase caption under the big number. Apple Hero pattern.
     *
     * 0.2.0-alpha.4 — when the chain is alive but we don't have a
     * block height yet (cold start, ~30-60s before peer handshake
     * completes), the value is an em-dash and the caption swaps to
     * "connecting to peers" so the operator knows the empty state is
     * intentional + ~about a minute.
     */
    function formatPrimaryLabel(t, coarse, height, syncSnapshot) {
        if (coarse === 'unconfigured') return t('chain_card.primary_label_unconfigured');
        if (coarse === 'stopped')      return t('chain_card.primary_label_off');
        var haveHeight = (height != null)
            || (syncSnapshot && syncSnapshot.localHeight != null);
        if (!haveHeight) return t('chain_card.primary_label_connecting');
        return t('chain_card.primary_label_height');
    }

    /** @private */
    ChainCard.prototype._handleConfigure = function () {
        if (typeof this.onReconfigure === 'function') this.onReconfigure(this.chainId);
    };

    /** @private — Start is non-destructive, no confirm needed. */
    ChainCard.prototype._handleStart = function () {
        this._do('start', '/chains/' + this.chainId + '/start');
    };
    /** @private — v0.5.217 audit Phase 3 (AUDIT-FLOW-S02, P2) — Stop now
     * gates through enmDestructiveModal. Pre-v0.5.217 the danger-red
     * Stop button had NO confirmation; one misclick stopped a producing
     * chain mid-block. The alpha.28.1 batch 46 rationale ("click-and-busy
     * pattern is enough") only protected against DOUBLE-fire, not against
     * intentional-but-accidental clicks. enmDestructiveModal adds a 2s
     * cooldown + ack checkbox before delegating to _do(). */
    ChainCard.prototype._handleStop = function () {
        var self = this;
        var displayName = this._resolveDisplayName();
        if (typeof root.enmDestructiveModal !== 'function') {
            // Defensive fallback if the modal primitive failed to load.
            return this._do('stop', '/chains/' + this.chainId + '/stop');
        }
        root.enmDestructiveModal({
            title:        'Stop ' + displayName + '?',
            body:         'The chain process will stop and the node will no longer produce blocks or respond to RPC. Start it again from this card when ready. No chain data is lost.',
            ackLabel:     'I understand this stops ' + displayName,
            cooldownSec:  2,
            confirmLabel: 'Stop ' + displayName,
            confirmKind:  'danger',
            notifications: self.notifications,
            onConfirm: function () {
                // _do handles toast + refresh; we just delegate.
                self._do('stop', '/chains/' + self.chainId + '/stop');
                return Promise.resolve();
            },
        });
    };
    /** @private — v0.5.217 audit Phase 3 (AUDIT-FLOW-B04, P2) — Restart
     * now confirms too. Restart interrupts sync work and chain is
     * unavailable for 20-60s; matches multi-chain-overview's existing
     * confirm UX so operator habits formed on one entry transfer. */
    ChainCard.prototype._handleRestart = function () {
        var self = this;
        var displayName = this._resolveDisplayName();
        if (typeof root.enmDestructiveModal !== 'function') {
            return this._do('restart', '/chains/' + this.chainId + '/restart');
        }
        root.enmDestructiveModal({
            title:        'Restart ' + displayName + '?',
            body:         'The chain will stop, then start again automatically (typical pause: 20-60 seconds). Sync resumes from the current block — no data is lost. In-progress block-signing work is interrupted.',
            ackLabel:     null,  // restart is less destructive than stop; cooldown alone is sufficient gate
            cooldownSec:  1,
            confirmLabel: 'Restart ' + displayName,
            confirmKind:  'primary',
            notifications: self.notifications,
            onConfirm: function () {
                self._do('restart', '/chains/' + self.chainId + '/restart');
                return Promise.resolve();
            },
        });
    };
    /** @private — Helper for the display-name resolution used by Stop/Restart
     * confirm modals (parallel of the _do() displayName fallback). */
    ChainCard.prototype._resolveDisplayName = function () {
        var t = root.enmTOrFallback;
        var displayName = t('chain_name.' + this.chainId);
        if (!displayName || displayName === 'chain_name.' + this.chainId) {
            displayName = this.chainId;
        }
        return displayName;
    };

    /** @private */
    ChainCard.prototype._do = function (kind, path) {
        if (this._busy) return;
        this._busy = true;
        var t = root.enmTOrFallback;
        var btn = (kind === 'start' ? this._startBtn : (kind === 'stop' ? this._stopBtn : this._restartBtn));
        var prev = btn.textContent;
        btn.textContent = t('chain_actions.' + kind + 'ing');
        btn.disabled = true;
        var self = this;
        // 0.5.18 audit Session 18 — operator-friendly toast strings.
        // Pre-0.5.18 used raw self.chainId ('mainchain' / 'esc' /
        // 'arbiter') and bare verb ('start' / 'stop' / 'restart') so
        // the success toast read "mainchain start". Use the display
        // name from i18n + past tense for the success path; keep the
        // imperative verb for error paths (they describe what the
        // operator's failed action was).
        var displayName = t('chain_name.' + this.chainId);
        if (!displayName || displayName === 'chain_name.' + this.chainId) {
            displayName = this.chainId;
        }
        // v0.5.220 audit Phase 6 (XFLOW-01, AUDIT-FLOW-S04) — present-
        // progressive verbs replace past-tense. Pre-v0.5.220 the toast
        // said "Mainchain started" the instant the POST resolved, but
        // the chain was actually in 'starting' state for 20-60s before
        // becoming RPC-bound. Operator-perception mismatch closed.
        var progressiveVerb = ({ start: 'is starting…', stop: 'is stopping…', restart: 'is restarting…' })[kind] || kind;
        this.api.post(path).then(function () {
            self.notifications.info(displayName + ' ' + progressiveVerb, '');
            // v0.5.220 audit Phase 6 (XFLOW-02, AUDIT-FLOW-S05) — arm a
            // 90s watchdog after Start/Restart. If the chain hasn't
            // reached alive by then, fire a warning so the operator
            // doesn't have to actively notice the silent stuck state.
            // Stop has no watchdog — there's no "alive" target.
            if ((kind === 'start' || kind === 'restart')
                && typeof root.enmWatchAction === 'function'
                && root.enmStateVocab) {
                root.enmWatchAction({
                    timeoutMs: 90000,
                    pollMs: 5000,
                    predicate: function () {
                        if (self._destroyed) { return true; } // teardown — cancel
                        return root.enmStateVocab.isAlive(self._lastCoarseState);
                    },
                    onTimeout: function () {
                        if (self._destroyed) { return; }
                        if (root.enmStateVocab.isAlive(self._lastCoarseState)) { return; }
                        self.notifications.warning(
                            displayName + ' didn\'t reach a running state',
                            'The ' + kind + ' completed but the chain is still in '
                              + (self._lastCoarseState || 'unknown')
                              + '. Check logs and consider another restart.',
                        );
                    },
                });
            }
            return self.refresh();
        }).catch(function (err) {
            // alpha.28.1 batch 52 — 401 suppressed; boot path owns
            // re-auth UX. Without this, expired-session caused the
            // operator's Start/Stop/Restart click to surface a
            // generic "Failed to start" toast on top of whatever
            // the error pane was already saying.
            if (err && err.status === 401) { return; }
            // Host-conflict 409 surfaces structured remediation steps.
            // alpha.28.1 batch 68 (Round-19B audit) — defensive shape
            // validation on the conflict envelope. Backend bug or stale-
            // cache replay could ship `{ description: undefined,
            // remediation: [{foo: 'bar'}] }` — the previous shape rendered
            // the resulting critical toast as "• undefined" and
            // "[object Object]" verbatim. Operator can't act on that.
            if (err && err.body && Array.isArray(err.body.conflicts)
                && err.body.conflicts.length > 0) {
                var blockers = err.body.conflicts.filter(function (c) {
                    return c && c.severity === 'CRITICAL';
                });
                var summary = blockers.map(function (c) {
                    var firstStep = (c.remediation && c.remediation[0]);
                    var stepStr = (typeof firstStep === 'string' && firstStep.length > 0)
                        ? firstStep : '';
                    var descStr = (typeof c.description === 'string' && c.description.length > 0)
                        ? c.description : 'Host conflict';
                    return '• ' + descStr + (stepStr ? ('\n   ' + stepStr) : '');
                }).join('\n');
                self.notifications.critical(
                    'Cannot ' + kind + ' ' + displayName + ' — host conflicts',
                    summary,
                );
            } else {
                self.notifications.warning(
                    'Failed to ' + kind + ' ' + displayName,
                    err && err.message ? err.message : String(err),
                );
            }
        }).then(function () {
            // alpha.28.1 batch 60 (Round-18 audit) — explicitly clear
            // btn.disabled here. _do() sets `btn.disabled = true` at the
            // start; on the success path _applyState's downstream call
            // would re-enable it, but on the 401-suppressed path
            // refresh() early-returns at the top guard and _applyState
            // never runs. Result before this fix: a single 401 on
            // Start/Stop/Restart leaves the button greyed out until a
            // non-401 poll lands (5+ seconds, or forever if the session
            // truly expired). Clearing disabled here re-evaluates from
            // coarse state via the queued refresh().
            btn.textContent = prev;
            btn.disabled = false;
            self._busy = false;
            self.refresh();
        });
    };

    /**
     * Adaptive sync poll. Drives the PowerCircle percent and the
     * "local / network" suffix on the primary metric. NO more sync
     * panel in 0.2.0-alpha.1 — the ring + the X / Y line tell the
     * sync story end-to-end.
     *
     * Cadence:
     *   syncing  → 10s (operator is watching the percent move)
     *   anything → 60s (drift check)
     *
     * @private
     */
    ChainCard.prototype._refreshSync = function () {
        if (this._destroyed) return;
        var self = this;
        this.api.get('/chains/' + this.chainId + '/sync', { skipCache: true }).then(function (data) {
            if (self._destroyed) return;
            self._applySyncSnapshot(data);
        }).catch(function () {
            if (self._destroyed) return;
            self._applySyncSnapshot(null);
        }).then(function () {
            if (self._destroyed || !self.root || !self.root.isConnected) return;
            // alpha.28.1 batch 31 — pause adaptive sync poll when the
            // tab is backgrounded. The chained-setTimeout pattern
            // doesn't fit the standard enmUseVisibilityPause helper
            // (which is setInterval-shaped), so we inline:
            //   - hidden: set a paused flag, skip scheduling.
            //   - visible (handled by _onSyncVisibilityChange wired at
            //     mount): clear flag + re-enter _refreshSync to catch
            //     up immediately.
            // Saves up to 360 fetches/hr while syncing on a hidden tab.
            if (typeof document !== 'undefined' && document.hidden) {
                self._syncPausedByHidden = true;
                return;
            }
            var nextMs = (self._lastCoarseState === 'syncing') ? 10_000 : 60_000;
            self._syncTimer = setTimeout(function () { self._refreshSync(); }, nextMs);
        });
    };

    /**
     * Update the PowerCircle percent + primary metric line from a
     * /sync response. Replaces _renderSyncPanel from alpha.18 — the
     * heavy panel rendering is gone; only the two visual surfaces
     * the user actually sees (ring + metric) update.
     *
     * @private
     * @param {object|null} data
     */
    ChainCard.prototype._applySyncSnapshot = function (data) {
        var t = root.enmTOrFallback;
        var coarse = this._lastCoarseState || 'unconfigured';
        // v0.5.191 — cache the latest /sync snapshot so _applyState's 5s state-poll
        // reuses it and renders the same "local / network" shape (no height↔slash
        // flicker). null on a failed /sync → _applyState falls back to bare height.
        this._lastSyncSnapshot = data || null;

        // Beta 3 hero — update the sync ring percent in place. Phase-03
        // mock shows the percent number + dashoffset together; we update
        // the existing .enm-hero-sync if we're in sync mode, otherwise
        // ignore the sync snapshot (coarse state already drove the hero
        // to .enm-hero-power).
        if (data && typeof data.percent === 'number'
            && (coarse === 'syncing' || coarse === 'recovering' || coarse === 'starting')) {
            this._lastSyncPercent = data.percent;
            this._renderHeroSync(data.percent);
        }

        // Block-height number — when syncing, formatter shows
        // "local / network"; once basicallySynced, just local.
        // 0.5.10 audit Session 10 — Class C oracle skips height block;
        // _chainHeight + _primaryLabel both null. Guard each write.
        var height = (this._lastBackendState && this._lastBackendState.height != null)
            ? this._lastBackendState.height : null;
        if (this._chainHeight) {
            this._chainHeight.textContent = formatPrimaryValue(t, coarse, height, data);
        }
        if (this._primaryLabel) {
            this._primaryLabel.textContent = formatPrimaryLabel(t, coarse, height, data);
        }

        // Subline — sync info ("Fully synced in ~4 min · 381,436 blocks
        // behind") + sync-progress-bar ("Receiving 12 new blocks/min from
        // peers"). Per phase-03 mock when syncing.
        this._renderSubline(coarse, this._lastBackendState, data);
    };

    /**
     * @private
     * Beta 3 — render the chain-subline below the chain-height per
     * phase-03 mock. When healthy: a single `.at-tip` "Fully synced"
     * chip with a ✓ glyph (CSS ::before). When syncing: an ETA line
     * + "N blocks behind" line, plus a sync-progress-bar showing
     * "Receiving N new blocks/min from peers". Otherwise: empty.
     */
    ChainCard.prototype._renderSubline = function (coarse, state, syncData) {
        if (!this._subline) { return; }
        var fmtN = (typeof window !== 'undefined' && window.enmFormatNumber)
            ? window.enmFormatNumber
            : function (n) { return (n == null || !isFinite(n)) ? '—' : String(n); };
        this._subline.innerHTML = '';
        this._syncBar.hidden = true;
        this._syncBar.innerHTML = '';

        // v0.5.219 audit Phase 5 — route through enmStateVocab.normalize
        // for the alive-and-synced subline. Last of the 5 inline state
        // checks this file had pre-v0.5.219; all 5 now closed.
        var normalizedCoarse = (root.enmStateVocab && root.enmStateVocab.normalize)
            ? root.enmStateVocab.normalize(coarse) : coarse;
        if (normalizedCoarse === 'synced' || coarse === 'healthy') {
            var atTip = document.createElement('span');
            atTip.className = 'enm-at-tip';
            atTip.textContent = 'Fully synced';
            this._subline.appendChild(atTip);
            return;
        }

        if (coarse === 'syncing' || coarse === 'recovering' || coarse === 'starting') {
            // ETA + blocks-behind line
            if (syncData) {
                if (syncData.etaMinutes != null) {
                    var eta = document.createElement('span');
                    eta.innerHTML = 'Fully synced in <b>~' + fmtN(syncData.etaMinutes) + ' min</b>';
                    this._subline.appendChild(eta);
                }
                if (syncData.blocksBehind != null) {
                    if (this._subline.children.length) {
                        var sep = document.createElement('span');
                        sep.className = 'enm-chain-subline-sep';
                        sep.textContent = '·';
                        this._subline.appendChild(sep);
                    }
                    var behind = document.createElement('span');
                    behind.innerHTML = '<b>' + fmtN(syncData.blocksBehind) + '</b> blocks behind';
                    this._subline.appendChild(behind);
                }
                // sync-progress-bar — block velocity feedback. Only
                // when we have a positive rate; otherwise omit so the
                // operator doesn't see "0 new blocks/min" while peers
                // are still handshaking.
                if (syncData.blocksPerMin != null && syncData.blocksPerMin > 0) {
                    this._syncBar.hidden = false;
                    var bar = document.createElement('span');
                    bar.innerHTML = 'Receiving <b>' + fmtN(syncData.blocksPerMin)
                        + ' new blocks/min</b> from peers';
                    this._syncBar.appendChild(bar);
                }
            }
            return;
        }

        // Stopped / unconfigured / error — leave subline empty. The
        // state-chip already communicates what's happening; the height
        // number reads "—" or the relevant message.
    };

    /**
     * @private
     * Apply an SSE connection-state change. Updates the card's
     * data-sse-state attribute (drives CSS dimming + breath pause)
     * and toggles the reconnecting pill. Open = everything hidden;
     * anything else = pill on, ring dimmed.
     *
     * @param {('open'|'reconnecting'|'closed')} sseState
     */
    ChainCard.prototype._applySseState = function (sseState) {
        this.root.dataset.sseState = sseState || 'open';
        if (!this._reconnectPill) return;
        this._reconnectPill.hidden = (sseState === 'open');
    };

    /**
     * 0.2.0-beta.3.6 — phase-03 peer popover. Populates
     * `.enm-peer-pop` with whatever peerSummary fields the backend
     * actually ships. The mock spec describes per-peer rows
     * (direction / address / height / ping); when the backend only
     * sends aggregates (latency avg, version distribution, max
     * clock skew) we degrade to a compact summary block + version
     * pills. Either way the popover stays informative.
     *
     * Renders nothing (and sets _peerPopHasData=false so the hover
     * handler refuses to show the box) when ps is null/empty.
     *
     * @private
     * @param {object|null} ps  peerSummary off /chains/:id.
     * @param {number|null} peerCount  state.peers — total connections.
     */
    ChainCard.prototype._renderPeerPop = function (ps, peerCount) {
        if (!this._peerPop) { return; }
        var fmtN = (typeof window !== 'undefined' && window.enmFormatNumber)
            ? window.enmFormatNumber
            : function (n) { return (n == null || !isFinite(n)) ? '—' : String(n); };
        // Detect whether we have ANY peer data worth showing.
        var hasNeighbors = ps && Array.isArray(ps.neighbors) && ps.neighbors.length > 0;
        var hasAggregate = ps && (
            ps.latencyMsAvg != null
            || (ps.versions && ps.versions.length)
            || ps.timeOffsetMaxAbsMs != null
            || ps.inbound != null
            || ps.outbound != null
        );
        if (!hasNeighbors && !hasAggregate) {
            this._peerPop.innerHTML = '';
            this._peerPopHasData = false;
            this._peerPop.dataset.visible = 'false';
            this._peerPop.setAttribute('aria-hidden', 'true');
            return;
        }
        this._peerPopHasData = true;

        // Build the head: "PEERS" caption + count chip.
        var html = ''
            + '<div class="enm-peer-pop-head">'
                + '<span class="enm-peer-pop-title">Peers</span>'
                + '<span class="enm-peer-pop-count">'
                    + (peerCount != null ? fmtN(peerCount) + ' connected' : '')
                    + (ps && ps.inbound != null && ps.outbound != null
                        ? ' · ' + fmtN(ps.inbound) + ' in / ' + fmtN(ps.outbound) + ' out'
                        : '')
                + '</span>'
            + '</div>';

        if (hasNeighbors) {
            // Per-peer rows — mock's primary case.
            // neighbor shape: { addr, direction:'in'|'out', height, pingMs }.
            html += '<div class="enm-peer-pop-rows">';
            ps.neighbors.slice(0, 20).forEach(function (n) {
                var dir = (n && n.direction === 'in') ? 'in' : 'out';
                var glyph = (dir === 'in') ? '↓' : '↑';
                var addr = (n && n.addr) ? String(n.addr) : '—';
                var height = (n && n.height != null) ? fmtN(n.height) : '';
                var ping = (n && n.pingMs != null) ? fmtN(n.pingMs) + 'ms' : '';
                html += ''
                    + '<div class="enm-peer-row">'
                        + '<span class="enm-peer-dir ' + dir + '" aria-hidden="true">' + glyph + '</span>'
                        + '<span class="enm-peer-addr">' + escapeText(addr) + '</span>'
                        + '<span class="enm-peer-h">' + escapeText(height) + '</span>'
                        + '<span class="enm-peer-ping">' + escapeText(ping) + '</span>'
                    + '</div>';
            });
            if (ps.neighbors.length > 20) {
                html += '<div class="enm-peer-pop-more">+'
                    + (ps.neighbors.length - 20) + ' more</div>';
            }
            html += '</div>';
        } else {
            // Aggregate-only fallback. Mock has no example of this
            // shape, but the spirit is the same: surface what's
            // actionable to the operator. Latency / version /
            // skew are exactly what alpha.7 surfaced via title.
            html += '<div class="enm-peer-pop-rows">';
            if (ps.latencyMsAvg != null) {
                html += '<div class="enm-peer-row enm-peer-row-agg">'
                    + '<span class="enm-peer-agg-label">Avg ping</span>'
                    + '<span class="enm-peer-agg-value">'
                    + fmtN(ps.latencyMsAvg) + ' ms</span></div>';
            }
            if (ps.versions && ps.versions.length) {
                ps.versions.forEach(function (v) {
                    html += '<div class="enm-peer-row enm-peer-row-agg">'
                        + '<span class="enm-peer-agg-label">'
                        + escapeText(v.version || '?') + '</span>'
                        + '<span class="enm-peer-agg-value">× '
                        + fmtN(v.count != null ? v.count : 0) + '</span></div>';
                });
            }
            if (ps.timeOffsetMaxAbsMs != null) {
                html += '<div class="enm-peer-row enm-peer-row-agg">'
                    + '<span class="enm-peer-agg-label">Max clock skew</span>'
                    + '<span class="enm-peer-agg-value">±'
                    + fmtN(ps.timeOffsetMaxAbsMs) + ' ms</span></div>';
            }
            html += '</div>';
        }

        this._peerPop.innerHTML = html;
    };

    // Local HTML escaper for the peer popover. Reuses standard pattern
    // so the rest of chain-card doesn't need to import it.
    function escapeText(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * @private
     * 0.2.0-alpha.7 — DPoS rotation poll. Polls /chains/:id/rotation
     * every 60s (or once on mount). Renders the rotation strip:
     *
     *  - When the operator's pubkey is on duty: green "On duty now"
     *  - When it's in the slate but not on duty: "Your slot — N of M",
     *    plus a "next up at block X" countdown if their next-arbiter
     *    index is known
     *  - When it's NOT in the slate: hide the strip entirely (no
     *    rotation context to surface)
     *
     * Hides on chain dead / not configured / not in slate. Errors
     * silently — rotation visibility is decorative, not load-bearing.
     */
    ChainCard.prototype._refreshRotation = function () {
        if (this._destroyed) return;
        // beta.3.92 (M2.4) — rotation strip is BPoS-only (Class A).
        // Non-A chains (EVM sidechains, Oracles, Arbiter, SPV) have no
        // DPoS arbiter rotation concept; the rotation endpoint would
        // 501 (M1.4 gating in chains.js routes) anyway. Hide the strip
        // + skip the poll entirely for non-A chains so we don't burn
        // 60 fetches/hr against an endpoint that can't answer.
        if (this.chainClass && this.chainClass !== 'A') {
            if (this._rotationStrip) this._rotationStrip.hidden = true;
            return;
        }
        // Skip when the chain is dead — no rotation context.
        if (this._lastCoarseState && (this._lastCoarseState === 'stopped'
            || this._lastCoarseState === 'unconfigured')) {
            if (this._rotationStrip) this._rotationStrip.hidden = true;
            return;
        }
        var self = this;
        this.api.get('/chains/' + this.chainId + '/rotation', { skipCache: true })
            .then(function (data) {
                if (self._destroyed || !self._rotationStrip) return;
                self._applyRotation(data);
            })
            .catch(function () {
                if (self._destroyed || !self._rotationStrip) return;
                self._rotationStrip.hidden = true;
            });
    };

    /**
     * @private
     * Render the rotation strip from a /rotation snapshot. Three states:
     *   on-duty  — operator's pubkey === ondutyarbiter, green chip
     *   in-slate — operator is in the slate but not on duty, info chip
     *   absent   — not in slate; strip hidden
     */
    ChainCard.prototype._applyRotation = function (data) {
        var strip = this._rotationStrip;
        if (!strip) return;
        if (!data || !data.enabled || !data.alive) {
            strip.hidden = true;
            return;
        }
        var inSlate     = (data.ourIndex >= 0);
        var inNextSlate = (data.ourNextIndex >= 0);
        if (!inSlate && !inNextSlate) {
            // Not currently a BPoS arbiter. No rotation context to surface.
            strip.hidden = true;
            return;
        }
        strip.hidden = false;
        strip.innerHTML = '';

        var dot = document.createElement('span');
        dot.className = 'enm-chain-rotation-dot';
        strip.appendChild(dot);

        var text = document.createElement('span');
        text.className = 'enm-chain-rotation-text';
        strip.appendChild(text);

        // v0.5.229d (P4 audit fix) — slate-freeze qualifier. The chain's
        // next-rotation arbiter slate is COMPUTED IN ADVANCE (at a
        // height before nextTurnStartHeight) and then FROZEN until that
        // rotation actually starts. If an operator unclaims via Essentials
        // AFTER the slate was frozen, their pubkey stays in nextarbiters[]
        // until the rotation AFTER next. Pre-229d the rotation strip just
        // said "Queued for next round · 16 of 36" with no context for
        // why an unclaimed operator was still queued. Now we cross-
        // reference miner.chainState... wait, we don't have crMember
        // directly here. /chains/mainchain DOES include crMember (Phase
        // D); the chain-card stashed _lastCrMember from the previous
        // render of the chip. Use that.
        var unclaimPending = !!(this._lastCrMember
            && this._lastCrMember.isCrMember === false
            && (data.ourIndex >= 0 || data.ourNextIndex >= 0));
        var unclaimNote = unclaimPending
            ? ' (unclaim pending; slate freeze in effect until next compute)'
            : '';

        if (data.isOnDuty) {
            strip.dataset.state = 'onduty';
            text.textContent = 'On duty now · signing the current block' + unclaimNote;
        } else if (inSlate) {
            strip.dataset.state = 'inslate';
            // alpha.28.1 batch 68 (Round-19B audit) — guard
            // rotationLength being absent/null. The branch guard at
            // line 786 (`data.ourIndex >= 0`) validates ourIndex but
            // NOT rotationLength. If the backend omits the field
            // (one-direction RPC drift) the previous shape rendered
            // "Your slot · 3 of undefined" verbatim to the operator.
            // Matches the defensive treatment already applied to
            // nextArbiters in the next-slate branch below.
            var rl = (data.rotationLength != null) ? data.rotationLength : '—';
            text.textContent = 'Your slot · '
                + (data.ourIndex + 1) + ' of ' + rl + unclaimNote;
        } else {
            strip.dataset.state = 'nextslate';
            // 0.5.125 audit Session 125 — defensive '—' fallback for
            // missing/empty nextArbiters. Pre-0.5.125 the expression
            // `(data.nextArbiters || []).length` collapsed to 0 when
            // the array was missing, rendering "Queued for next round
            // · 5 of 0" — confusing since ourNextIndex=4 implies a
            // 5th position in a slate that supposedly has 0 entries.
            // Mirrors the rotationLength fallback already applied to
            // the in-slate branch above (alpha.28.1 batch 68 pattern).
            // Reaches the operator on RPC drift where ourNextIndex is
            // emitted but nextArbiters isn't.
            var nl = (data.nextArbiters && data.nextArbiters.length > 0)
                ? data.nextArbiters.length : '—';
            text.textContent = 'Queued for next round · '
                + (data.ourNextIndex + 1) + ' of ' + nl + unclaimNote;
        }
    };

    /** Build a button. Plain helper. */
    function makeBtn(label, className, onClick) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'enm-btn ' + className;
        b.textContent = label;
        b.addEventListener('click', onClick);
        return b;
    }

    root.EnmChainCard = ChainCard;
}(typeof window !== 'undefined' ? window : globalThis));
