/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * HeightSeriesStore — in-memory rolling buffer of (timestamp, height)
 * samples per chain. Powers the chain-card sparkline added in the
 * 0.2.0-alpha.1 Apple Hero rewrite.
 *
 * Why a backend buffer (not client-side):
 *   - Survives page reloads (server-side state lives across browser sessions)
 *   - Single source of truth (no client/client divergence with two tabs open)
 *   - Reuses the existing HealthChecker._mediumTick (30s) — zero new RPC load
 *
 * Why RAM-only (not SQLite):
 *   - Schema migration is free (no ALTER TABLE)
 *   - Buffer is decorative — losing the last hour on restart is acceptable
 *   - Memory cap is hard-coded (240 samples × 16 bytes × chains ≈ 4 KB/chain)
 *
 * Wiring (matches the data-pipeline plan §2.2):
 *   - ChainRegistry constructs the singleton, exposes getHeightSeriesStore()
 *   - HealthChecker._mediumTick calls record() after every successful height
 *     read, then publishes the appended point on SSE topic chains:<id>:height
 *   - routes/chains.js exposes GET /:chainId/history (decimated snapshot)
 *   - ChainRegistry's processService.on('exit') clears the buffer so a chain
 *     restart doesn't inherit zombie heights from the previous binary
 *
 * No public dependency on EnmDb or any SQL — pure in-memory store.
 */

'use strict';

// Tuning knobs. The plan picked these values; see plan/03-data-pipeline.md.
const MAX_SAMPLES = 240;                  // 240 × 30s = 120 min raw samples
const RETENTION_MS = 60 * 60 * 1000;      // 60 min view window
const DECIMATE_TARGET_POINTS = 12;        // matches mock's 12-point sparkline

class HeightSeriesStore {
    constructor() {
        /** @type {Map<string, Array<{t: number, h: number}>>} */
        this._series = new Map();
    }

    /**
     * Append a (t, h) sample for one chain. Called from
     * HealthChecker._mediumTick whenever a successful height read lands.
     *
     * Drops:
     *   - non-string / empty chainIds (defensive)
     *   - non-integer / negative heights (RPC noise)
     *   - out-of-order timestamps (clock skew or duplicate ticks)
     *   - flat-line duplicates (same height as last sample, <90s since
     *     last point) — keeps the line truthful without burying 240
     *     identical points when the chain is alive but waiting between
     *     blocks. One sample every ~90s during a flat run is enough to
     *     draw the line.
     *
     * @param {string} chainId
     * @param {number} height
     * @param {number} [tMs]  defaults to Date.now()
     * @returns {{t:number,h:number}|null} the appended point, or null when rejected.
     *   Callers use the return value to decide whether to publish on SSE.
     */
    record(chainId, height, tMs) {
        if (typeof chainId !== 'string' || !chainId) return null;
        if (!Number.isInteger(height) || height < 0) return null;
        const t = Number.isFinite(tMs) ? tMs : Date.now();

        let s = this._series.get(chainId);
        if (!s) { s = []; this._series.set(chainId, s); }

        const last = s[s.length - 1];
        if (last && t <= last.t) return null;
        if (last && last.h === height && (t - last.t) < 90_000) return null;

        const point = { t, h: height };
        s.push(point);
        // Trim by age AND count. Age is the soft cap operators care about;
        // count is the hard memory cap defending against clock-skew floods.
        const cutoff = t - 2 * RETENTION_MS;
        while (s.length > 0 && s[0].t < cutoff) s.shift();
        if (s.length > MAX_SAMPLES) s.splice(0, s.length - MAX_SAMPLES);
        return point;
    }

    /**
     * Read the buffer for one chain, decimated to ~DECIMATE_TARGET_POINTS
     * points spanning the requested window. Decimation = nearest-sample
     * to evenly-spaced timestamps; no interpolation (operators trust
     * actual recorded heights, never synthesised values).
     *
     * Returns the raw points slice (no decimation) when there are fewer
     * than DECIMATE_TARGET_POINTS in the window — graceful degradation
     * for a freshly-started chain.
     *
     * @param {string} chainId
     * @param {number} [windowMs]  defaults to RETENTION_MS (60 min)
     * @returns {Array<{t:number,h:number}>}
     */
    snapshot(chainId, windowMs) {
        const win = Number.isFinite(windowMs) ? windowMs : RETENTION_MS;
        const all = this._series.get(chainId) || [];
        if (all.length === 0) return [];
        const cutoff = Date.now() - win;
        const inWindow = all.filter((p) => p.t >= cutoff);
        if (inWindow.length <= DECIMATE_TARGET_POINTS) return inWindow.slice();

        // Even-stride decimation across the window's actual time span.
        // We snap each target timestamp to the closest real sample, then
        // de-duplicate so a sparse middle doesn't produce repeated points.
        const first = inWindow[0].t;
        const last = inWindow[inWindow.length - 1].t;
        const stride = (last - first) / (DECIMATE_TARGET_POINTS - 1);
        const out = [];
        let j = 0;
        for (let i = 0; i < DECIMATE_TARGET_POINTS; i += 1) {
            const target = first + (i * stride);
            while (j + 1 < inWindow.length
                && Math.abs(inWindow[j + 1].t - target) < Math.abs(inWindow[j].t - target)) {
                j += 1;
            }
            const candidate = inWindow[j];
            // Skip duplicate adjacent reads — happens when the chain
            // produced no new block for several stride windows.
            const prev = out[out.length - 1];
            if (!prev || prev.t !== candidate.t) out.push(candidate);
        }
        return out;
    }

    /**
     * Drop all samples for one chain. Called from ChainRegistry's
     * processService.on('exit') handler so a chain restart starts the
     * sparkline fresh instead of inheriting old samples that no longer
     * reflect the running binary.
     *
     * @param {string} chainId
     */
    clearForChain(chainId) { this._series.delete(chainId); }

    /** @internal — for tests only */
    _sizeForChain(chainId) {
        const s = this._series.get(chainId);
        return s ? s.length : 0;
    }
}

module.exports = {
    HeightSeriesStore,
    MAX_SAMPLES,
    RETENTION_MS,
    DECIMATE_TARGET_POINTS,
};
