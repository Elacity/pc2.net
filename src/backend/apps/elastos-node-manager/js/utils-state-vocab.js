/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * utils-state-vocab.js — single source of truth for chain coarseState.
 *
 * v0.5.219 audit Phase 5 (XFLOW-04 + XFLOW-16). Eliminates the state-
 * vocabulary fragmentation that root-caused the 14 patch-release
 * regressions v0.5.200→v0.5.214: the backend introduced a new 7-tier
 * vocabulary (synced/syncing/starting/stalled/stopped/disabled/
 * unconfigured) but the frontend had hardcoded the old 5-tier
 * (healthy/running/...) at 5+ inline sites in chain-card.js plus a
 * dead COARSE_TO_VISUAL constant + a parallel STATE_LABEL_V2 +
 * normalizeStateV2 in multi-chain-overview.js. Each patch release
 * fixed ONE site at a time. This file is the canonical map; all
 * state-rendering surfaces (chain-card, overview, audit-tab, node-
 * identity-card, validator-registration-card) should source from
 * here.
 *
 * Backend backward-compat:
 *   'running' (v1) → 'synced' (v2)
 *   'healthy' (v1) → 'synced' (v2)
 * Older bundles may still emit these during a release rollout; the
 * normalize() function handles both.
 *
 * Future regressions are prevented by ENM_REGRESSION_PREVENTION.md
 * Pattern 1 (CI grep for new backend states without strings.js keys)
 * + Pattern 2 (lint rule no-state-string-literal — flags `=== 'healthy'`
 * style checks outside this file).
 */

(function (root) {
    'use strict';

    /**
     * Map every known state (v1 + v2) to its canonical v2 form.
     * Unknown values pass through (e.g. 'loading' is a chain-card-only
     * placeholder; 'recovering' and 'error' are backend states for
     * pre-7-tier chain health). Callers that need a SAFE coarse value
     * use stateVisual().
     */
    var V1_TO_V2 = {
        running: 'synced',
        healthy: 'synced',
    };

    /**
     * Operator-facing labels per state. Source of truth backed by
     * chain_state.* keys in strings.js — caller resolves via tFb.
     */
    var STATE_LABEL = {
        synced:       'Synced',
        syncing:      'Syncing',
        starting:     'Starting',
        stalled:      'Stalled',
        stopped:      'Stopped',
        disabled:     'Disabled',
        unconfigured: 'Not configured',
        loading:      'Loading…',
        recovering:   'Recovering',
        error:        'Error',
    };

    /**
     * Coarse-state → PowerCircle visual state. Old chain-card.js had
     * a dead COARSE_TO_VISUAL constant with this same data but the
     * code paths (5 inline `'healthy' || 'synced'` checks) didn't use
     * it — so when 'synced' arrived from the backend the inline checks
     * missed it AND the dead constant was wrong anyway. Centralizing
     * here closes both vectors.
     */
    var STATE_VISUAL = {
        synced:       'running',
        syncing:      'syncing',
        starting:     'booting',
        stalled:      'stalled',
        stopped:      'off',
        disabled:     'off',
        unconfigured: 'off',
        loading:      'off',
        recovering:   'syncing',
        error:        'error',
    };

    /**
     * Coarse-state → chip CSS modifier class.
     */
    var STATE_CHIP_CLASS = {
        synced:       '',           // default neutral chip
        syncing:      'accent',
        starting:     'accent',
        stalled:      'warn',
        stopped:      'muted',
        disabled:     'muted',
        unconfigured: 'muted',
        loading:      'muted',
        recovering:   'accent',
        error:        'error',
    };

    /**
     * Which states represent "the chain process is alive past startup
     * grace"? This is the canonical alive predicate.
     *
     * 'healthy' + 'running' included for backward-compat — normalize()
     * should be called first in new code; isAlive() is the shorthand
     * that also handles legacy input.
     */
    var ALIVE_STATES = new Set([
        'synced', 'syncing', 'stalled', 'recovering',
        'healthy', 'running', // v1 aliases — accepted for safety
    ]);

    /**
     * Which states represent "actively transitioning toward alive"?
     */
    var TRANSITIONING_STATES = new Set([
        'starting', 'syncing', 'recovering',
    ]);

    /**
     * Normalize a raw state value to the canonical v2 vocabulary.
     * @param {string|null|undefined} raw
     * @returns {string} canonical state ('unconfigured' for null/undefined)
     */
    function normalize(raw) {
        if (!raw || typeof raw !== 'string') { return 'unconfigured'; }
        return V1_TO_V2[raw] || raw;
    }

    /**
     * Operator-facing label for a state. Resolves via enmTOrFallback
     * so localizations can override; falls back to STATE_LABEL[v2].
     * @param {string} raw
     * @returns {string}
     */
    function stateLabel(raw) {
        var v2 = normalize(raw);
        var t = root.enmTOrFallback || root.enmT;
        if (typeof t === 'function') {
            var resolved = t('chain_state.' + v2);
            if (resolved && resolved !== ('chain_state.' + v2)
                && resolved !== ('[chain_state.' + v2 + ']')) {
                return resolved;
            }
        }
        return STATE_LABEL[v2] || v2;
    }

    /**
     * PowerCircle / hero visual state derived from the coarse state.
     * Unknown raw values default to 'off' (safest visual — no claim
     * of activity).
     * @param {string} raw
     * @returns {string} one of 'running' | 'syncing' | 'booting' | 'stalled' | 'error' | 'off'
     */
    function stateVisual(raw) {
        var v2 = normalize(raw);
        return STATE_VISUAL[v2] || 'off';
    }

    /**
     * Chip CSS modifier (empty string = default neutral).
     * @param {string} raw
     * @returns {string} '' | 'accent' | 'warn' | 'error' | 'muted'
     */
    function stateChipClass(raw) {
        var v2 = normalize(raw);
        var cls = STATE_CHIP_CLASS[v2];
        return (typeof cls === 'string') ? cls : '';
    }

    /**
     * Is the chain process alive past startup grace? Accepts v1 OR
     * v2 input (no need to pre-normalize).
     * @param {string} raw
     * @returns {boolean}
     */
    function isAlive(raw) {
        if (!raw || typeof raw !== 'string') { return false; }
        return ALIVE_STATES.has(raw);
    }

    /**
     * Is the chain process transitioning toward alive?
     * @param {string} raw
     * @returns {boolean}
     */
    function isTransitioning(raw) {
        var v2 = normalize(raw);
        return TRANSITIONING_STATES.has(v2);
    }

    /**
     * Is the chain in a state where action buttons should be hidden?
     * (Currently: 'loading' only — pre-API-response placeholder.)
     * @param {string} raw
     * @returns {boolean}
     */
    function isLoading(raw) {
        return normalize(raw) === 'loading';
    }

    /**
     * Is the chain explicitly unconfigured (404 from /chains/:id)?
     * @param {string} raw
     * @returns {boolean}
     */
    function isUnconfigured(raw) {
        return normalize(raw) === 'unconfigured';
    }

    root.enmStateVocab = {
        normalize:        normalize,
        stateLabel:       stateLabel,
        stateVisual:      stateVisual,
        stateChipClass:   stateChipClass,
        isAlive:          isAlive,
        isTransitioning:  isTransitioning,
        isLoading:        isLoading,
        isUnconfigured:   isUnconfigured,
        // Exported for unit-test / CI regression-prevention use.
        _KNOWN_STATES:    Object.keys(STATE_LABEL),
    };
}(typeof window !== 'undefined' ? window : globalThis));
