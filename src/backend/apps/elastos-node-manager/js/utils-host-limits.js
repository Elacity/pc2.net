/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * utils-host-limits.js — frontend wrapper around backend `/system/host-limits`.
 *
 * v0.5.225 audit Phase 21 (constrained-host mode). Triggered by the
 * Hostinger incident 2026-05-25: provider imposed a CPU cap on the
 * VPS during EVM sync; node was paused. Pre-v0.5.225 ENM had no
 * awareness of provider-imposed cgroup limits — the threshold-aware
 * styling (XFLOW-12) marked cards red when CPU > 95% but couldn't
 * distinguish "actual host load" from "provider cap reached."
 *
 * Operator directive (2026-05-25): "budget features should not be
 * for everyone" — auto-trigger + opt-in only, default behavior
 * unchanged for well-resourced operators.
 *
 * This helper:
 *   - Fetches /system/host-limits on demand (cached for 60s).
 *   - Returns { cpuCapCores, memoryCapGb, isConstrained } shape.
 *   - isConstrained = true iff (cpuCapCores < 4 OR memoryCapGb < 8).
 *     These are the empirical thresholds for "comfortable Council node"
 *     based on test-node sizing.
 *   - Returns null if backend doesn't expose the endpoint (older bundle).
 *
 * Backend endpoint (TO BUILD — separate PR):
 *   GET /system/host-limits → {
 *     cpuCapCores: 2 | null,         // null = no cgroup CPU cap detected
 *     memoryCapGb: 4 | null,         // null = no cgroup memory cap
 *     source: 'cgroup-v2' | 'cgroup-v1' | 'rlimit' | 'none',
 *     readAt: <unix-ms>,
 *   }
 *   Reads from /sys/fs/cgroup/cpu.max (v2), /sys/fs/cgroup/cpu/cpu.cfs_quota_us
 *   (v1), or systemd's CPUQuota property. Returns null when no cap
 *   is detected — operator on a bare-metal box gets nothing in the UI.
 */

(function (root) {
    'use strict';

    var CACHE_TTL_MS = 60000;
    var _cache = null;
    var _cachedAt = 0;
    var _inflight = null;

    function isConstrained(limits) {
        if (!limits) { return false; }
        var cpuTight = (typeof limits.cpuCapCores === 'number') && limits.cpuCapCores < 4;
        var memTight = (typeof limits.memoryCapGb === 'number') && limits.memoryCapGb < 8;
        return cpuTight || memTight;
    }

    /**
     * Fetch host limits via the API client. Returns a Promise resolving to
     * an object (with isConstrained derived) OR null if the endpoint is
     * unavailable. Cached for CACHE_TTL_MS to avoid hammering the backend.
     *
     * @param {object} api  — the api service (must have .get)
     * @returns {Promise<{cpuCapCores, memoryCapGb, source, isConstrained}|null>}
     */
    function fetch(api) {
        if (!api || typeof api.get !== 'function') { return Promise.resolve(null); }
        // Cache hit?
        if (_cache && (Date.now() - _cachedAt < CACHE_TTL_MS)) {
            return Promise.resolve(_cache);
        }
        // In-flight dedup so simultaneous callers share one request.
        if (_inflight) { return _inflight; }
        _inflight = api.get('/system/host-limits', { skipCache: true }).then(function (resp) {
            _inflight = null;
            var data = (resp && resp.result) || resp || null;
            if (!data || typeof data !== 'object') { _cache = null; _cachedAt = Date.now(); return null; }
            data.isConstrained = isConstrained(data);
            _cache = data;
            _cachedAt = Date.now();
            return data;
        }).catch(function (err) {
            _inflight = null;
            // 404 = backend doesn't support this yet (older bundle). Silent.
            // 401 = auth; boot path handles re-auth.
            // Other errors = treat as no-limits-known (don't surface a banner
            // we can't substantiate).
            _cache = null;
            _cachedAt = Date.now();
            return null;
        });
        return _inflight;
    }

    /**
     * Invalidate cache — call this when operator manually refreshes or after
     * a known-relevant config change.
     */
    function invalidate() {
        _cache = null;
        _cachedAt = 0;
    }

    root.enmHostLimits = { fetch: fetch, invalidate: invalidate, isConstrained: isConstrained };
}(typeof window !== 'undefined' ? window : globalThis));
