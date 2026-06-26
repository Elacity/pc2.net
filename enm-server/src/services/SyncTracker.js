/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * SyncTracker — per-chain rolling window of (ts, height) samples used to
 * compute live velocity (blocks per minute) and ETA-to-fully-synced.
 *
 * Why we don't compute these from getblockcount alone:
 *   A single height value tells us where we are, not how fast we're moving.
 *   The chain-card "syncing" pulse animation is visual feedback only — the
 *   operator wants to see "324 blocks behind, ~14 min remaining at 23 bpm",
 *   which requires a derivative.
 *
 * Design:
 *   - In-memory ring buffer per chainId, capped at MAX_SAMPLES (90 entries
 *     ≈ 30 min @ 20s sampling rate).
 *   - Bounded memory: 90 × ~16 bytes = ~1.5 KB per chain. With one chain in
 *     v0.1, total impact is negligible.
 *   - velocityBpm = (latest.height - oldest.height) / (latest.ts - oldest.ts) × 60_000
 *   - etaSec = blocksBehind / (velocityBpm / 60). Caps at MAX_ETA_SEC (24 h)
 *     so a UI doesn't show "ETA: 17 days" on a stalled chain.
 *
 * This is a stateless plain class — HealthChecker constructs one instance and
 * feeds it samples on every medium tick. Routes/chains.js reads the latest
 * derived state via syncSnapshot(chainId).
 */

'use strict';

const MAX_SAMPLES = 90;            // ~30 min @ 20s sampling
const MIN_SAMPLES_FOR_VELOCITY = 3;
const MAX_ETA_SEC = 24 * 60 * 60;  // 24 h cap so the UI never shows "ETA: 17 days"
const STALE_AGE_MS = 5 * 60 * 1000; // discard the window if the newest sample is >5 min old

class SyncTracker {
    constructor() {
        /** @type {Map<string, Array<{ts: number, height: number}>>} */
        this._samples = new Map();
        /** @type {Map<string, number>} */
        this._networkHeights = new Map();
        // v0.5.203 — peer count cache. HealthChecker.recordPeers() pushes here
        // on every poll so the multi-chain overview can render peer counts
        // without an extra per-chain RPC on the 1s tick.
        /** @type {Map<string, {count: number, ts: number}>} */
        this._peers = new Map();
    }

    /**
     * Append a new (ts, height) sample. The window self-trims to MAX_SAMPLES.
     * Out-of-order samples (ts <= last sample's ts) are dropped — the medium
     * tick is the only writer, so this guards against clock skew between
     * checker restarts.
     *
     * @param {string} chainId
     * @param {number} height
     * @param {number} [tsMs]
     */
    record(chainId, height, tsMs) {
        if (typeof chainId !== 'string' || chainId.length === 0) return;
        if (!Number.isInteger(height) || height < 0) return;
        const ts = Number.isFinite(tsMs) ? tsMs : Date.now();

        let window = this._samples.get(chainId);
        if (!window) {
            window = [];
            this._samples.set(chainId, window);
        }
        const last = window[window.length - 1];
        if (last && ts <= last.ts) {
            return; // out-of-order or duplicate timestamp
        }
        window.push({ ts, height });
        if (window.length > MAX_SAMPLES) {
            window.splice(0, window.length - MAX_SAMPLES);
        }
    }

    /**
     * Optional: record the network's best-known height (from peer reports or a
     * public reference RPC). When set, syncSnapshot uses it to compute
     * blocksBehind and percent. When absent, percent reports null.
     *
     * @param {string} chainId
     * @param {number} height
     */
    recordNetworkBest(chainId, height) {
        if (typeof chainId !== 'string' || chainId.length === 0) return;
        if (!Number.isInteger(height) || height < 0) return;
        const existing = this._networkHeights.get(chainId);
        // Network height is monotonic in the absence of a fork — accept the
        // higher value to defend against a single peer regressing.
        if (existing == null || height > existing) {
            this._networkHeights.set(chainId, height);
        }
    }

    /**
     * v0.5.203 — record the most recent peer count for a chain. Called by
     * HealthChecker on every poll where it already has the peer count (no
     * extra RPC needed). The overview pane reads via peerSnapshot() to
     * render per-row peer counts at 1s tick cadence.
     *
     * @param {string} chainId
     * @param {number} count  Peer count (≥0). Non-integers / negatives ignored.
     * @param {number} [tsMs]
     */
    recordPeers(chainId, count, tsMs) {
        if (typeof chainId !== 'string' || chainId.length === 0) return;
        if (!Number.isInteger(count) || count < 0) return;
        this._peers.set(chainId, { count, ts: Number.isFinite(tsMs) ? tsMs : Date.now() });
    }

    /**
     * v0.5.203 — read the most recent peer snapshot for a chain.
     *
     * @param {string} chainId
     * @returns {{count: number, ts: number}|null}
     */
    peerSnapshot(chainId) {
        const cur = this._peers.get(chainId);
        return cur ? { count: cur.count, ts: cur.ts } : null;
    }

    /**
     * Snapshot of the derived state for the chain card.
     *
     * @param {string} chainId
     * @returns {{
     *   localHeight: number|null,
     *   networkHeight: number|null,
     *   blocksBehind: number|null,
     *   percent: number|null,
     *   velocityBpm: number|null,
     *   etaSec: number|null,
     *   sampleCount: number,
     *   windowMinutes: number|null,
     *   lastSampleAt: number|null,
     *   stale: boolean
     * }}
     */
    syncSnapshot(chainId) {
        const window = this._samples.get(chainId) || [];
        const networkHeight = this._networkHeights.get(chainId) ?? null;

        const out = {
            localHeight: null,
            networkHeight,
            blocksBehind: null,
            percent: null,
            velocityBpm: null,
            etaSec: null,
            sampleCount: window.length,
            windowMinutes: null,
            lastSampleAt: null,
            stale: false,
        };
        if (window.length === 0) {
            return out;
        }

        const latest = window[window.length - 1];
        out.localHeight = latest.height;
        out.lastSampleAt = latest.ts;
        out.stale = (Date.now() - latest.ts) > STALE_AGE_MS;

        // velocity (BPM) needs ≥2 samples spanning some elapsed time.
        if (window.length >= MIN_SAMPLES_FOR_VELOCITY) {
            const oldest = window[0];
            const dtMs = latest.ts - oldest.ts;
            const dh = latest.height - oldest.height;
            if (dtMs > 0 && dh >= 0) {
                out.velocityBpm = (dh / dtMs) * 60_000;
                out.windowMinutes = dtMs / 60_000;
            }
        }

        // sync progress + ETA — only meaningful if we have a network reference.
        if (networkHeight != null) {
            out.blocksBehind = Math.max(0, networkHeight - latest.height);
            const denom = Math.max(networkHeight, 1);
            const pct = (latest.height / denom) * 100;
            out.percent = Math.max(0, Math.min(100, pct));

            if (out.velocityBpm != null && out.velocityBpm > 0 && out.blocksBehind > 0) {
                const eta = (out.blocksBehind / out.velocityBpm) * 60;
                out.etaSec = Math.min(MAX_ETA_SEC, Math.max(0, Math.floor(eta)));
            } else if (out.blocksBehind === 0) {
                out.etaSec = 0;
            }
        }

        return out;
    }

    /**
     * Drop all sample/network-height state for one chain. Called when the
     * chain exits — without this, the next `start()` inherits height
     * samples from the previous run, producing zombie velocity numbers
     * (the "1150 blocks/min next to Network height unknown" lie that
     * prompted the v0.5 audit).
     *
     * @param {string} chainId
     */
    clearForChain(chainId) {
        this._samples.delete(chainId);
        this._networkHeights.delete(chainId);
    }

    /** @internal */
    _resetForTests() {
        this._samples.clear();
        this._networkHeights.clear();
    }
}

module.exports = {
    SyncTracker,
    MAX_SAMPLES,
    MIN_SAMPLES_FOR_VELOCITY,
    MAX_ETA_SEC,
    STALE_AGE_MS,
};
