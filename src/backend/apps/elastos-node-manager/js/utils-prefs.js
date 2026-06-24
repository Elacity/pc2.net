/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * utils-prefs.js — sessionStorage helper for operator preferences.
 *
 * v0.5.218 audit Phase 4 (XFLOW-19, AUDIT-FLOW-LV02 + LV03 + LV12 +
 * AU04). Multiple components (log-viewer level filters, log-viewer
 * search query, audit-tab filters, etc.) reset to defaults every time
 * the component remounts because each one wrote its preference state
 * to a hardcoded field instead of persisting to storage. Audit-tab's
 * _showTechnical correctly uses sessionStorage (audit positive note
 * SD01); this primitive generalizes that pattern.
 *
 * Why sessionStorage (not localStorage):
 *   - Operator preferences should reset on tab close (matches their
 *     mental model of "fresh session").
 *   - Lower exfiltration risk than localStorage (no cross-session
 *     leakage for credentials accidentally stored here).
 *   - Same shape-validation discipline as settings-drawer.js loadPrefs
 *     (audit a8adaad6 — typed-value validation against default).
 *
 * Usage:
 *   var hidden = enmPrefs.get('log-viewer:lvl-filters',
 *                             { error: true, warn: true, info: true, debug: false });
 *   enmPrefs.set('log-viewer:lvl-filters', { error: true, warn: true, info: true, debug: true });
 *
 * Keys MUST be `<component>:<knob>` style for grep-ability.
 */

(function (root) {
    'use strict';

    var STORAGE_PREFIX = 'enm-prefs:';

    function storageAvail() {
        try {
            return typeof root.sessionStorage !== 'undefined' && root.sessionStorage !== null;
        } catch (_) {
            return false;
        }
    }

    /**
     * Per-key type validation. If the saved value's runtime type doesn't
     * match the default's runtime type, fall back to default. Prevents a
     * malformed entry (private-mode hiccup, manual edit, schema drift)
     * from polluting the runtime state. Mirrors settings-drawer.js
     * loadPrefs() at line 64-72.
     *
     * For object defaults (e.g. _lvlFilters), validate by checking that
     * saved is a plain object AND every key in default has matching type.
     */
    function shapeMatches(saved, defaultVal) {
        if (defaultVal == null) { return true; }
        if (typeof saved !== typeof defaultVal) { return false; }
        if (typeof defaultVal === 'object' && !Array.isArray(defaultVal)) {
            if (saved == null || Array.isArray(saved)) { return false; }
            // Each declared default key must exist with matching type.
            for (var k in defaultVal) {
                if (!Object.prototype.hasOwnProperty.call(defaultVal, k)) { continue; }
                if (typeof saved[k] !== typeof defaultVal[k]) { return false; }
            }
            return true;
        }
        if (Array.isArray(defaultVal)) {
            return Array.isArray(saved);
        }
        return true;
    }

    /**
     * Load a pref, or return defaultValue if absent / malformed / private-mode.
     * @param {string} key
     * @param {*} defaultValue
     * @returns {*}
     */
    function get(key, defaultValue) {
        if (!storageAvail()) { return defaultValue; }
        try {
            var raw = root.sessionStorage.getItem(STORAGE_PREFIX + key);
            if (raw == null) { return defaultValue; }
            var parsed = JSON.parse(raw);
            if (!shapeMatches(parsed, defaultValue)) { return defaultValue; }
            // For object defaults, merge over default so newly-added keys
            // get their defaults (schema evolution without migration).
            if (typeof defaultValue === 'object' && defaultValue != null && !Array.isArray(defaultValue)) {
                var merged = {};
                for (var dk in defaultValue) {
                    if (Object.prototype.hasOwnProperty.call(defaultValue, dk)) {
                        merged[dk] = (typeof parsed[dk] === typeof defaultValue[dk])
                            ? parsed[dk] : defaultValue[dk];
                    }
                }
                return merged;
            }
            return parsed;
        } catch (_) {
            return defaultValue;
        }
    }

    /**
     * Save a pref. Silent on failure (private mode, quota, etc.).
     * @param {string} key
     * @param {*} value
     */
    function set(key, value) {
        if (!storageAvail()) { return; }
        try {
            root.sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
        } catch (_) { /* swallow */ }
    }

    /**
     * Remove a pref.
     * @param {string} key
     */
    function clear(key) {
        if (!storageAvail()) { return; }
        try { root.sessionStorage.removeItem(STORAGE_PREFIX + key); }
        catch (_) { /* swallow */ }
    }

    /**
     * Remove ALL ENM prefs. Used by the settings-drawer "Reset all
     * preferences" affordance (AUDIT-FLOW-SD03 fix).
     */
    function clearAll() {
        if (!storageAvail()) { return; }
        try {
            var toRemove = [];
            for (var i = 0; i < root.sessionStorage.length; i += 1) {
                var k = root.sessionStorage.key(i);
                if (k && k.indexOf(STORAGE_PREFIX) === 0) { toRemove.push(k); }
            }
            toRemove.forEach(function (k) { root.sessionStorage.removeItem(k); });
        } catch (_) { /* swallow */ }
    }

    /**
     * Enumerate all ENM-namespaced prefs (key → value). For debugging.
     */
    function listKeys() {
        if (!storageAvail()) { return []; }
        var out = [];
        try {
            for (var i = 0; i < root.sessionStorage.length; i += 1) {
                var k = root.sessionStorage.key(i);
                if (k && k.indexOf(STORAGE_PREFIX) === 0) {
                    out.push(k.slice(STORAGE_PREFIX.length));
                }
            }
        } catch (_) { /* swallow */ }
        return out;
    }

    root.enmPrefs = { get: get, set: set, clear: clear, clearAll: clearAll, listKeys: listKeys };
}(typeof window !== 'undefined' ? window : globalThis));
