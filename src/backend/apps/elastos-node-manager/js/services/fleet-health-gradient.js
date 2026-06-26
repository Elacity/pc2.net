/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * services/fleet-health-gradient.js — drives the page-wash colour.
 *
 * Sets <html data-fleet-health> based on the aggregate state of every
 * managed chain. CSS in styles.css picks up the attribute, flips the
 * --wash-a / --wash-b tokens, and the body::before gradient crossfades
 * to the new hue over --wash-blend-ms.
 *
 * Aggregation rule (most-severe wins):
 *   error          — any chain in 'error' state
 *   warning        — any chain 'stalled' (but no error)
 *   syncing        — any chain 'syncing' or 'recovering' (no warn/error)
 *   healthy        — every running chain is 'healthy'
 *   idle           — every chain is 'stopped' / 'unconfigured' (or none)
 *
 * Chain-card emits state via a CustomEvent on window
 * ('enm:chain-state') in phase 6 of the Apple Hero rewrite. This
 * service listens and recomputes. Until that wiring lands, the
 * service defaults to 'healthy' so the wash paints — phase 2 is
 * a visual landing strip, not a closed feedback loop.
 *
 * No SSE or HTTP calls — the controller is purely a CSS state machine.
 */

(function (root) {
    'use strict';

    // Priority order — higher index = more severe = wins the aggregate.
    // Maps a per-chain coarse state to the fleet-health bucket it
    // contributes to.
    var STATE_TO_FLEET = {
        error:        'error',
        stalled:      'warning',
        syncing:      'syncing',
        recovering:   'syncing',
        starting:     'syncing',
        healthy:      'healthy',
        stopped:      'idle',
        unconfigured: 'idle',
        disabled:     'idle',
    };

    // Severity rank — index in this array wins.
    var SEVERITY = ['idle', 'healthy', 'syncing', 'warning', 'error'];

    function FleetHealthGradient() {
        // Map of chainId → coarseState. Empty until chain-cards report in.
        this._chainStates = Object.create(null);
        // Bound listener kept on the instance so destroy() can remove it.
        this._onChainState = this._onChainState.bind(this);
        this._mounted = false;
    }

    /**
     * Wire the controller. Idempotent. Called at app boot from
     * _showDashboard so the wash appears as soon as the dashboard mounts.
     *
     * @param {string} [initialFleetHealth='healthy']
     *   Initial bucket to paint. Defaults to 'healthy' so the page
     *   isn't washed neutral while chain-cards spin up; once data lands
     *   the controller corrects it within one tick.
     */
    FleetHealthGradient.prototype.mount = function (initialFleetHealth) {
        if (this._mounted) return this;
        this._mounted = true;
        this.set(initialFleetHealth || 'healthy');
        // Listen for chain-card state-change events. Chain-card dispatches
        // these in phase 6 of the Apple Hero rewrite.
        root.addEventListener('enm:chain-state', this._onChainState);
        return this;
    };

    FleetHealthGradient.prototype.destroy = function () {
        if (!this._mounted) return;
        this._mounted = false;
        root.removeEventListener('enm:chain-state', this._onChainState);
        // alpha.28.1 batch 83 (Round-24 finding #6) — clear the per-
        // chain state map on teardown. The CSS attribute on <html> is
        // deliberately preserved (the comment below explains why), but
        // _chainStates is internal data that has no business surviving
        // a mount→destroy→mount cycle (e.g. Reinstall path). Without
        // this, the second mount carried the stale aggregate from the
        // first session and could emit the old bucket on first paint
        // before the new chain-cards reported in.
        this._chainStates = Object.create(null);
        // Don't strip the attribute — leaving it preserves the last
        // paint, which is less jarring than a sudden neutral wash if
        // the dashboard remounts (e.g. after a setup completion).
    };

    /**
     * Manually set the fleet-health bucket. Used by mount() and by any
     * caller that wants to bypass the aggregation (e.g., the error
     * pane forcing 'idle').
     *
     * @param {('healthy'|'syncing'|'warning'|'error'|'idle')} bucket
     */
    FleetHealthGradient.prototype.set = function (bucket) {
        if (SEVERITY.indexOf(bucket) === -1) bucket = 'idle';
        document.documentElement.dataset.fleetHealth = bucket;
    };

    /**
     * Per-chain state change handler. Called by chain-card via
     * window.dispatchEvent('enm:chain-state', {detail: {chainId, coarseState}}).
     * Recomputes the aggregate and applies it.
     *
     * @private
     */
    FleetHealthGradient.prototype._onChainState = function (ev) {
        var d = ev && ev.detail;
        if (!d || !d.chainId) return;
        // Record the latest state for this chain. If the chain is being
        // removed, the caller dispatches { removed: true } and we drop it.
        if (d.removed) {
            delete this._chainStates[d.chainId];
        } else {
            this._chainStates[d.chainId] = d.coarseState || 'unconfigured';
        }
        this.set(this._aggregate());
    };

    /**
     * Reduce the per-chain map to a single fleet bucket using the
     * most-severe-wins rule.
     *
     * @private
     * @returns {string}
     */
    FleetHealthGradient.prototype._aggregate = function () {
        var ids = Object.keys(this._chainStates);
        if (ids.length === 0) return 'idle';
        var winner = 'idle';
        var winnerRank = SEVERITY.indexOf(winner);
        for (var i = 0; i < ids.length; i++) {
            var bucket = STATE_TO_FLEET[this._chainStates[ids[i]]] || 'idle';
            var rank = SEVERITY.indexOf(bucket);
            if (rank > winnerRank) {
                winner = bucket;
                winnerRank = rank;
            }
        }
        return winner;
    };

    root.EnmFleetHealthGradient = FleetHealthGradient;
}(typeof window !== 'undefined' ? window : globalThis));
