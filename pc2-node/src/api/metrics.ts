/**
 * Metrics API (T-1C Phase 1)
 *
 * Read-only endpoint for the operator's own counter + histogram values.
 * Powers the "Aggregate Telemetry" card in the Health & Support
 * test-app. Auth-gated (same bearer token as `/api/diagnose`) because
 * raw counter values can fingerprint a specific user's activity pattern
 * even though they contain no PII directly.
 *
 * No outbound traffic. No mutation. Phase 4-6 will add the daily
 * flusher that posts a redacted, rolled-up summary to a supernode; that
 * lives in `runtime/telemetry-flusher.ts`, not here.
 */

import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from './middleware.js';
import { logger } from '../utils/logger.js';
import { listCounters, summariseHistograms, isTelemetryDisabled } from '../utils/metrics.js';

const router = Router();

/**
 * GET /api/metrics/snapshot — full counter + histogram dump
 *
 * Returns the current state of the local metric registry. Histograms
 * are pre-aggregated to p50/p95/p99/count/sum so the UI doesn't have to
 * push raw samples around. Optional ?windowMs= narrows the histogram
 * window (counters are always all-time since they're monotonic).
 */
router.get('/snapshot', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = req.app.locals.db;
        if (!db) {
            res.status(503).json({ error: 'database_unavailable' });
            return;
        }

        const windowMsRaw = req.query.windowMs;
        let windowMs: number | undefined;
        if (typeof windowMsRaw === 'string' && /^[0-9]+$/.test(windowMsRaw)) {
            const parsed = Number.parseInt(windowMsRaw, 10);
            if (Number.isFinite(parsed) && parsed > 0) windowMs = parsed;
        }

        const snapshot = {
            generatedAt: new Date().toISOString(),
            killSwitch: isTelemetryDisabled(),
            counters: listCounters(db),
            histograms: summariseHistograms(db, windowMs),
            note: 'T-1C Phase 1 — local plumbing only. No outbound traffic. Daily flusher to supernode lands in v1.2.9.0.',
        };

        res.json(snapshot);
    } catch (err: any) {
        logger.error('[Metrics] snapshot failed', { error: err?.message || 'unknown' });
        res.status(500).json({ error: 'snapshot_failed' });
    }
});

export default router;
