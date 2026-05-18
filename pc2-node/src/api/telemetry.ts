/**
 * Telemetry On-Ramp API
 *
 * Anonymous funnel telemetry for the v1.2 launch (§P0 / Tier A · A6 in
 * V1.2-PRE-RELEASE-WORK). Tracks 4 events:
 *   install_started → wallet_ready → first_capsule_open → first_payment
 *
 * Privacy posture:
 *  - Each node generates ONE random UUID at first event ("install_id"),
 *    persisted in `settings` with key `telemetry_install_id`. Never tied
 *    to wallet/email/IP. Never regenerated.
 *  - POST is owner-only (only the node owner can attribute their own
 *    funnel progress). GET is public-read aggregated only — raw rows are
 *    NEVER exposed. Counts and unique-install totals only.
 *  - Env-var kill switch: `PC2_TELEMETRY_DISABLED=true` short-circuits
 *    the POST endpoint (returns 204, no DB write). GET still returns
 *    whatever counts already exist.
 */
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from './middleware.js';
import type { DatabaseManager } from '../storage/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('telemetry');

const ALLOWED_EVENTS = ['install_started', 'wallet_ready', 'first_capsule_open', 'first_payment'] as const;
export type OnRampEvent = typeof ALLOWED_EVENTS[number];

const INSTALL_ID_SETTING_KEY = 'telemetry_install_id';
const ONCE_KEY_PREFIX = 'telemetry_';
const ONCE_KEY_SUFFIX = '_at';

/**
 * Read-or-create the per-node anonymous install id. Stored in the
 * existing `settings` table; created lazily on first event.
 */
function getOrCreateInstallId(db: DatabaseManager): string {
  const sqlite = (db as any).db ?? (db as any);
  const row = sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(INSTALL_ID_SETTING_KEY) as { value: string } | undefined;
  if (row?.value) return row.value;
  const id = randomUUID();
  sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(INSTALL_ID_SETTING_KEY, id, Date.now());
  log.info('Generated anonymous telemetry install_id (first event on this node)');
  return id;
}

/**
 * Internal hook (A5b): fire a funnel event ONCE per node lifetime.
 *
 * Idempotent via `settings` key `telemetry_<event>_at` — second + Nth
 * invocations short-circuit and do nothing. Designed to be called
 * directly from existing flow handlers (auth, app launch, paid decrypt)
 * with zero auth ceremony — internal callers don't need an owner JWT.
 *
 * Strictly fire-and-forget: never throws, never blocks the caller.
 * If the DB is unavailable or the write fails, we log a warning and
 * silently continue so user flows are never disrupted by telemetry.
 */
export function recordTelemetryOnce(db: DatabaseManager | undefined, event: OnRampEvent): void {
  try {
    if (!db) return;
    if (process.env.PC2_TELEMETRY_DISABLED === 'true') return;
    if (!(ALLOWED_EVENTS as readonly string[]).includes(event)) return;

    const sqlite = (db as any).db ?? (db as any);
    const settingsKey = ONCE_KEY_PREFIX + event + ONCE_KEY_SUFFIX;
    const existing = sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(settingsKey);
    if (existing) return;

    const install_id = getOrCreateInstallId(db);
    const ts = Date.now();
    const insertEvent = sqlite.prepare('INSERT INTO telemetry_onramp (event, ts, install_id) VALUES (?, ?, ?)');
    const insertKey = sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
    sqlite.transaction(() => {
      insertEvent.run(event, ts, install_id);
      insertKey.run(settingsKey, String(ts), Date.now());
    })();
    log.info(`[telemetry] fired ${event} (first occurrence on this node)`);
  } catch (err: any) {
    log.warn(`[telemetry] failed to record ${event}: ${err.message}`);
  }
}

/**
 * Internal hook (A5b): fire a funnel event ONCE per node lifetime, but
 * only if the response succeeds (2xx). Use for endpoints with multiple
 * success exit points where wrapping every res.send/res.json site would
 * be brittle. Registers a one-shot `finish` listener on the response.
 */
export function recordTelemetryOnSuccess(db: DatabaseManager | undefined, event: OnRampEvent, res: Response): void {
  try {
    if (!db) return;
    if (process.env.PC2_TELEMETRY_DISABLED === 'true') return;
    res.once('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        recordTelemetryOnce(db, event);
      }
    });
  } catch (err: any) {
    log.warn(`[telemetry] failed to attach finish listener for ${event}: ${err.message}`);
  }
}

/**
 * POST /api/telemetry/onramp
 * Owner-only. Body: { event: <one of ALLOWED_EVENTS> }
 * Returns 201 with the recorded row, or 204 if telemetry is disabled,
 * or 400 for an unknown event.
 */
export async function postOnRampEvent(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (process.env.PC2_TELEMETRY_DISABLED === 'true') {
    res.status(204).json({ disabled: true });
    return;
  }

  const event = req.body?.event;
  if (typeof event !== 'string' || !(ALLOWED_EVENTS as readonly string[]).includes(event)) {
    res.status(400).json({ error: 'invalid_event', allowed: ALLOWED_EVENTS });
    return;
  }

  const db = req.app.locals.db as DatabaseManager | undefined;
  if (!db) {
    res.status(503).json({ error: 'database_unavailable' });
    return;
  }

  try {
    const install_id = getOrCreateInstallId(db);
    const ts = Date.now();
    const sqlite = (db as any).db ?? (db as any);
    sqlite.prepare('INSERT INTO telemetry_onramp (event, ts, install_id) VALUES (?, ?, ?)').run(event, ts, install_id);
    res.status(201).json({ event, ts, install_id });
  } catch (err: any) {
    log.error(`Failed to record telemetry event ${event}: ${err.message}`);
    res.status(500).json({ error: 'write_failed' });
  }
}

/**
 * GET /api/telemetry/onramp/summary
 * Public, no auth. Returns aggregated counts only — never raw rows or
 * install_ids — so this can safely be polled by a public dashboard.
 */
export async function getOnRampSummary(req: Request, res: Response): Promise<void> {
  const db = req.app.locals.db as DatabaseManager | undefined;
  if (!db) {
    res.status(503).json({ error: 'database_unavailable' });
    return;
  }

  try {
    const sqlite = (db as any).db ?? (db as any);
    const counts = sqlite.prepare('SELECT event, COUNT(*) as count FROM telemetry_onramp GROUP BY event').all() as Array<{ event: string; count: number }>;
    const events: Record<OnRampEvent, number> = {
      install_started: 0,
      wallet_ready: 0,
      first_capsule_open: 0,
      first_payment: 0,
    };
    for (const row of counts) {
      if ((ALLOWED_EVENTS as readonly string[]).includes(row.event)) {
        events[row.event as OnRampEvent] = row.count;
      }
    }

    const uniqueRow = sqlite.prepare('SELECT COUNT(DISTINCT install_id) as n FROM telemetry_onramp').get() as { n: number };
    const tsRange = sqlite.prepare('SELECT MIN(ts) as first, MAX(ts) as last FROM telemetry_onramp').get() as { first: number | null; last: number | null };

    res.json({
      events,
      unique_installs: uniqueRow?.n ?? 0,
      first_event_ts: tsRange?.first ?? null,
      last_event_ts: tsRange?.last ?? null,
      generated_at: Date.now(),
    });
  } catch (err: any) {
    log.error(`Failed to read telemetry summary: ${err.message}`);
    res.status(500).json({ error: 'read_failed' });
  }
}
