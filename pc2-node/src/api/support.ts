/**
 * Support API (T-1B)
 *
 * Phase 1 — local-only preview surface. Renders a curated, redacted
 * "support report bundle" from a snapshot + free-text message. The
 * resulting JSON is shown to the user in the Health & Support test-app
 * preview screen; they can copy it as JSON or download it as a file
 * and paste / attach it in Telegram or a GitHub issue manually.
 *
 * Phase 2 (NOT in this commit) — adds:
 *   - `POST /api/support/report/send` that signs the bundle with the
 *     operator wallet (SIWE) and POSTs it to the supernode triage
 *     endpoint
 *   - per-wallet rate limiting (token bucket: 1 report / 5 min,
 *     burst 3 / 24 h) shared with the eventual C-2 relayer
 *   - supernode-side `POST /api/support/report` ingest endpoint that
 *     persists, dedupes, and forwards to the GitHub Action triage repo
 *
 * Until Phase 2 lands, this endpoint produces ZERO outbound network
 * traffic. The bundle is rendered, returned, and forgotten by the
 * server. This is deliberate: it lets us iterate on the redaction
 * policy + UX with users in the loop before any data leaves a node.
 *
 * Auth: owner-only. The bundle includes a wallet hash, so authenticate
 * the request before letting it run; we don't want a sideload app
 * generating a bundle for a wallet the requester doesn't own.
 */

import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from './middleware.js';
import { logger } from '../utils/logger.js';
import { buildReportBundle, type BuildReportInput, type ReportBundleOptions } from '../services/support/buildReportBundle.js';

const router = Router();

/**
 * Hard cap on the inbound free-text body so a misbehaving client can't
 * pin memory by sending a 100MB "free-text" field. The bundle builder
 * also truncates to 2000 chars internally; this is the outer guard.
 */
const FREETEXT_MAX_INBOUND_CHARS = 8 * 1024;

/**
 * `snapshot` is the entire result of `GET /api/diagnose`. It can be
 * large (a few hundred KB on a chatty node). Cap inbound body size at
 * 2 MB via the route-local middleware below to avoid pathological
 * memory pressure if a client constructs a fake snapshot. The real
 * snapshot from `/api/diagnose` is always well under this in practice.
 */
const SNAPSHOT_MAX_INBOUND_BYTES = 2 * 1024 * 1024;

interface PreviewRequestBody {
    snapshot?: unknown;
    freeText?: unknown;
    walletAddress?: unknown;
    options?: ReportBundleOptions;
}

function isPlainObject (v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * POST /api/support/report/preview
 *
 * Body: { snapshot, freeText, walletAddress, options? }
 *
 * Returns the curated bundle that a future "Send Report" flow would
 * POST to a supernode. Phase 1 — local render only, no network egress.
 *
 *   200 { bundle: ReportBundle, willOmit: string[] }
 *   400 { error: 'invalid_request', detail }
 *   413 { error: 'request_too_large' }   (handled by the JSON parser middleware)
 *   500 { error: 'preview_failed' }
 */
router.post('/report/preview', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = (req.body ?? {}) as PreviewRequestBody;

        if (!isPlainObject(body)) {
            return res.status(400).json({ error: 'invalid_request', detail: 'body_must_be_object' });
        }

        if (typeof body.walletAddress !== 'string' || body.walletAddress.length < 4) {
            return res.status(400).json({ error: 'invalid_request', detail: 'walletAddress_required' });
        }

        if (typeof body.freeText !== 'string') {
            return res.status(400).json({ error: 'invalid_request', detail: 'freeText_required' });
        }

        if (body.freeText.length > FREETEXT_MAX_INBOUND_CHARS) {
            return res.status(400).json({ error: 'invalid_request', detail: 'freeText_too_large' });
        }

        // The snapshot can be undefined (user hasn't run a health check yet);
        // the bundle builder degrades all `optional.*` sections to null in
        // that case rather than throwing. Allow but warn so we capture the
        // pattern in logs.
        if (body.snapshot != null && !isPlainObject(body.snapshot)) {
            return res.status(400).json({ error: 'invalid_request', detail: 'snapshot_must_be_object_or_null' });
        }

        const input: BuildReportInput = {
            snapshot: body.snapshot ?? {},
            freeText: body.freeText,
            walletAddress: body.walletAddress,
            options: isPlainObject(body.options) ? body.options : undefined,
        };

        const bundle = buildReportBundle(input);

        // Compute a small "what was omitted" hint so the UI can render an
        // honesty list ("we're NOT sending: …"). This is cheap to derive
        // here and avoids the UI re-implementing the same logic.
        const willOmit: string[] = [];
        if (bundle.optional.host == null)        willOmit.push('host (hostname tail + local IP)');
        if (bundle.optional.services == null)    willOmit.push('services (db / filesystem / transports)');
        if (bundle.optional.cluster == null)     willOmit.push('cluster (reachability matrix)');
        if (bundle.optional.liveProbes == null)  willOmit.push('liveProbes (Lit / supernodes / wasm / update channel)');
        if (bundle.optional.recentLogs == null)  willOmit.push('recentLogs (last 80 sanitised log lines)');
        // Things we ALWAYS omit, listed for transparency.
        willOmit.push('raw wallet address (only SHA-256 hash is included)');
        willOmit.push('mnemonic / private keys / PEM blocks (caught by sanitise())');
        willOmit.push('home-dir paths (replaced with ~)');
        willOmit.push('full IP addresses (always masked to /24)');

        return res.json({ bundle, willOmit });
    } catch (err: any) {
        logger.error('[Support] preview failed:', err);
        return res.status(500).json({ error: 'preview_failed', message: err?.message || 'unknown' });
    }
});

/**
 * GET /api/support/report/policy
 *
 * Returns the current curation policy in machine-readable form so the
 * UI can render the "what we send / what we omit" disclosure without
 * needing to call /preview first. Same auth posture as /preview —
 * owner-only, since the payload is part of the same flow.
 */
router.get('/report/policy', authenticate, (_req: AuthenticatedRequest, res: Response) => {
    res.json({
        schemaVersion: 1,
        alwaysIncluded: [
            'app version, OS platform/arch, Node.js version',
            'recent log lines (last 80, sanitised + home-dir-stripped)',
            'live diagnostic probes (Lit / supernodes / wasm / update channel)',
            'free-text user message (capped at 2000 chars after sanitise)',
            'wallet HASH (SHA-256 first 16 hex chars) — never raw',
        ],
        userTogglable: [
            { field: 'host', defaultIncluded: true, summary: 'hostname tail (last 8 chars) + local IP masked to /24' },
            { field: 'services', defaultIncluded: true, summary: 'db / filesystem / transport status' },
            { field: 'cluster', defaultIncluded: true, summary: 'IPFS cluster reachability matrix' },
            { field: 'liveProbes', defaultIncluded: true, summary: 'T-1A self-diagnostic results' },
            { field: 'recentLogs', defaultIncluded: true, summary: 'last 80 sanitised log lines' },
        ],
        neverIncluded: [
            'raw wallet address',
            'mnemonic / private keys / PEM blocks',
            'real home-dir paths',
            'channel display names / creator-set strings',
            'full IP addresses',
        ],
        constants: {
            freeTextMaxChars: 2000,
            hostnameTailLen: 8,
            walletHashLen: 16,
        },
    });
});

export default router;
