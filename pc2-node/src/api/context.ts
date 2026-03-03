/**
 * Context API
 * 
 * Ingestion and query endpoints for the awareness layer.
 * Accepts location, photos, voice transcripts, and activity events
 * from the browser (and future mobile companion app).
 */

import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from './middleware.js';
import { ContextStore, ContextEvent } from '../storage/context.js';
import { createLogger } from '../utils/logger.js';
const log = createLogger('api-context');

const router = Router();

const VALID_TYPES = ['location', 'photo', 'voice_transcript', 'activity', 'environment'] as const;
type ValidType = typeof VALID_TYPES[number];

function isValidType(type: string): type is ValidType {
  return VALID_TYPES.includes(type as ValidType);
}

function getContextStore(req: AuthenticatedRequest): ContextStore | null {
  const dbManager = req.app.locals.db;
  const db = dbManager?.getDatabase?.();
  if (!db) return null;
  return new ContextStore(db);
}

/**
 * POST /api/context
 * Accept one or more context events.
 * Body: { event: ContextEvent } or { events: ContextEvent[] }
 */
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wallet = req.user?.wallet_address;
    if (!wallet) return res.status(401).json({ error: 'Unauthorized' });

    const store = getContextStore(req);
    if (!store) return res.status(500).json({ error: 'Database unavailable' });

    const events: ContextEvent[] = [];

    if (req.body.event) {
      events.push(req.body.event);
    } else if (req.body.events && Array.isArray(req.body.events)) {
      events.push(...req.body.events);
    } else {
      return res.status(400).json({ error: 'Provide "event" or "events" array' });
    }

    for (const event of events) {
      if (!event.type || !isValidType(event.type)) {
        return res.status(400).json({
          error: `Invalid event type: "${event.type}". Must be one of: ${VALID_TYPES.join(', ')}`
        });
      }
      if (!event.timestamp) {
        event.timestamp = new Date().toISOString();
      }
      if (!event.data || typeof event.data !== 'object') {
        return res.status(400).json({ error: 'Each event must have a "data" object' });
      }
    }

    const ids = store.storeEvents(wallet, events);

    res.json({
      success: true,
      stored: ids.length,
      ids,
    });
  } catch (error: any) {
    log.error('[Context API] Store error:', error.message);
    res.status(500).json({ error: 'Failed to store context events' });
  }
});

/**
 * GET /api/context/recent?hours=24&limit=100
 * Return recent context events for display.
 */
router.get('/recent', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wallet = req.user?.wallet_address;
    if (!wallet) return res.status(401).json({ error: 'Unauthorized' });

    const store = getContextStore(req);
    if (!store) return res.status(500).json({ error: 'Database unavailable' });

    const hours = Math.min(parseInt(req.query.hours as string) || 24, 168); // max 7 days
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    const events = store.getRecentEvents(wallet, hours, limit);

    res.json({ events, count: events.length });
  } catch (error: any) {
    log.error('[Context API] Recent error:', error.message);
    res.status(500).json({ error: 'Failed to fetch recent context' });
  }
});

/**
 * GET /api/context/summary
 * Return a pre-summarized context block suitable for system prompt injection.
 */
router.get('/summary', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wallet = req.user?.wallet_address;
    if (!wallet) return res.status(401).json({ error: 'Unauthorized' });

    const store = getContextStore(req);
    if (!store) return res.status(500).json({ error: 'Database unavailable' });

    const hours = Math.min(parseInt(req.query.hours as string) || 24, 168);
    const summary = store.summarizeRecentContext(wallet, hours);

    res.json({ summary, hasContext: summary.length > 0 });
  } catch (error: any) {
    log.error('[Context API] Summary error:', error.message);
    res.status(500).json({ error: 'Failed to generate context summary' });
  }
});

/**
 * GET /api/context/trajectory?start=ISO&end=ISO
 * Return ordered location history for map rendering.
 */
router.get('/trajectory', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wallet = req.user?.wallet_address;
    if (!wallet) return res.status(401).json({ error: 'Unauthorized' });

    const store = getContextStore(req);
    if (!store) return res.status(500).json({ error: 'Database unavailable' });

    const start = req.query.start as string;
    const end = req.query.end as string;
    if (!start || !end) {
      return res.status(400).json({ error: 'Provide "start" and "end" ISO timestamps' });
    }

    const trajectory = store.getLocationTrajectory(wallet, start, end);

    res.json({ trajectory, count: trajectory.length });
  } catch (error: any) {
    log.error('[Context API] Trajectory error:', error.message);
    res.status(500).json({ error: 'Failed to fetch trajectory' });
  }
});

export default router;
