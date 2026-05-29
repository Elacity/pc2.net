/**
 * Publish Intents API
 *
 * REST surface for the Monetisation Agent's pre-encryption working state.
 * Mirrors the input-side of publish_drafts. The Creator app consumes an
 * intent via puter.args.resumeIntent, pre-fills its wizard, encrypts +
 * pins, then writes a publish_drafts row and marks the intent 'consumed'.
 *
 * Wallet-scoped — each user only sees their own intents.
 * See .cursor/tasks/AGENT-CREATOR-STUDIO-2026-05/PLAN.md §6 + §7.
 */

import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from './middleware.js';
import type { DatabaseManager } from '../storage/database.js';
import { logger } from '../utils/logger.js';
import { validateIntentFields, normalizeForDb } from '../utils/intentValidation.js';

const router = Router();

/**
 * Decorate an intent row for the response: parse JSON fields, coerce flags.
 */
function decorateRow(row: any): any {
  if (!row) return row;
  return {
    ...row,
    tags: row.tags ? (() => { try { return JSON.parse(row.tags); } catch { return row.tags; } })() : null,
    royalty_partners: row.royalty_partners ? (() => { try { return JSON.parse(row.royalty_partners); } catch { return null; } })() : null,
    adult: !!row.adult,
  };
}

/**
 * POST /api/intents
 * Create a new intent. All input fields optional (the agent fills incrementally).
 * Wallet ownership is set from the auth context, never the body.
 */
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) return res.status(401).json({ error: 'Not authenticated' });

    const validationError = validateIntentFields(req.body || {});
    if (validationError) return res.status(400).json({ error: validationError });

    const fields = normalizeForDb(req.body || {});
    const db = req.app.locals.db as DatabaseManager;
    const id = db.insertIntent({
      wallet_address: walletAddress,
      conversation_id: fields.conversation_id,
      source_file_path: fields.source_file_path,
      title: fields.title,
      description: fields.description,
      category: fields.category,
      file_name: fields.file_name,
      file_size: fields.file_size,
      mime_type: fields.mime_type,
      tags: fields.tags,
      channel: fields.channel,
      price: fields.price,
      currency_address: fields.currency_address,
      currency_symbol: fields.currency_symbol,
      copies: fields.copies,
      access_method: fields.access_method,
      reseller_cut: fields.reseller_cut,
      royalty_partners: fields.royalty_partners,
      license_profile: fields.license_profile,
      thumbnail_cid: fields.thumbnail_cid,
      thumbnail_path: fields.thumbnail_path,
      adult: fields.adult,
    });

    const created = db.getIntentById(id, walletAddress);
    logger.info(`[Intents] Created intent #${id} for ${walletAddress.slice(0, 10)}...`);
    res.json(decorateRow(created));
  } catch (error: any) {
    logger.error(`[Intents] Create error: ${error.message}`);
    res.status(500).json({ error: 'Failed to create intent' });
  }
});

/**
 * GET /api/intents
 * List intents for the authenticated wallet, optionally filtered by status.
 */
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) return res.status(401).json({ error: 'Not authenticated' });

    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const limit = typeof req.query.limit === 'string' ? Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200) : 50;

    const db = req.app.locals.db as DatabaseManager;
    const rows = db.getIntentsByWallet(walletAddress, status, limit);
    res.json(rows.map(decorateRow));
  } catch (error: any) {
    logger.error(`[Intents] List error: ${error.message}`);
    res.status(500).json({ error: 'Failed to list intents' });
  }
});

/**
 * GET /api/intents/:id
 * Fetch a single intent by ID (wallet-scoped).
 */
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) return res.status(401).json({ error: 'Not authenticated' });

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid intent ID' });

    const db = req.app.locals.db as DatabaseManager;
    const intent = db.getIntentById(id, walletAddress);
    if (!intent) return res.status(404).json({ error: 'Intent not found' });

    res.json(decorateRow(intent));
  } catch (error: any) {
    logger.error(`[Intents] Get error: ${error.message}`);
    res.status(500).json({ error: 'Failed to get intent' });
  }
});

/**
 * PUT /api/intents/:id
 * Partial update — only fields present in the body are written.
 * Only intents in 'draft' status can be edited. Use PATCH for status transitions.
 */
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) return res.status(401).json({ error: 'Not authenticated' });

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid intent ID' });

    const validationError = validateIntentFields(req.body || {});
    if (validationError) return res.status(400).json({ error: validationError });

    const db = req.app.locals.db as DatabaseManager;
    const existing = db.getIntentById(id, walletAddress);
    if (!existing) return res.status(404).json({ error: 'Intent not found' });
    if (existing.status !== 'draft') {
      return res.status(409).json({ error: `Intent is ${existing.status}, only draft intents can be edited` });
    }

    const updated = db.updateIntent(id, walletAddress, normalizeForDb(req.body || {}));
    if (!updated) return res.status(400).json({ error: 'No valid fields to update' });

    const fresh = db.getIntentById(id, walletAddress);
    res.json(decorateRow(fresh));
  } catch (error: any) {
    logger.error(`[Intents] Update error: ${error.message}`);
    res.status(500).json({ error: 'Failed to update intent' });
  }
});

/**
 * PATCH /api/intents/:id/status
 * Status transitions only. Valid transitions:
 *   draft → handed_off (when agent calls open_creator_to_mint)
 *   draft|handed_off → abandoned (when user cancels)
 *   draft|handed_off → consumed (when Creator successfully writes a publish_drafts row; pass consumed_draft_id)
 */
router.patch('/:id/status', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) return res.status(401).json({ error: 'Not authenticated' });

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid intent ID' });

    const { status, consumed_draft_id } = req.body || {};
    if (!status) return res.status(400).json({ error: 'Missing status' });

    const db = req.app.locals.db as DatabaseManager;
    const existing = db.getIntentById(id, walletAddress);
    if (!existing) return res.status(404).json({ error: 'Intent not found' });

    let ok = false;
    if (status === 'handed_off') {
      ok = db.markIntentHandedOff(id, walletAddress);
    } else if (status === 'consumed') {
      const draftId = parseInt(consumed_draft_id, 10);
      if (isNaN(draftId)) return res.status(400).json({ error: 'consumed_draft_id is required when transitioning to consumed' });
      ok = db.markIntentConsumed(id, walletAddress, draftId);
    } else if (status === 'abandoned') {
      // Generic update path
      const dbAny = (req.app.locals.db as DatabaseManager) as any;
      const result = dbAny.getDB().prepare(`
        UPDATE publish_intents SET status = 'abandoned', updated_at = datetime('now')
        WHERE id = ? AND wallet_address = ? AND status IN ('draft', 'handed_off')
      `).run(id, walletAddress.toLowerCase());
      ok = result.changes > 0;
    } else {
      return res.status(400).json({ error: `Invalid status transition target: ${status}` });
    }

    if (!ok) return res.status(409).json({ error: `Cannot transition intent from ${existing.status} to ${status}` });

    const fresh = db.getIntentById(id, walletAddress);
    res.json(decorateRow(fresh));
  } catch (error: any) {
    logger.error(`[Intents] Status error: ${error.message}`);
    res.status(500).json({ error: 'Failed to update intent status' });
  }
});

/**
 * DELETE /api/intents/:id
 * Hard delete (only intents in draft / abandoned status).
 */
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) return res.status(401).json({ error: 'Not authenticated' });

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid intent ID' });

    const db = req.app.locals.db as DatabaseManager;
    const existing = db.getIntentById(id, walletAddress);
    if (!existing) return res.status(404).json({ error: 'Intent not found' });
    if (existing.status === 'handed_off' || existing.status === 'consumed') {
      return res.status(409).json({ error: `Cannot delete a ${existing.status} intent; mark abandoned first if needed` });
    }

    const ok = db.deleteIntent(id, walletAddress);
    if (!ok) return res.status(404).json({ error: 'Intent not found' });

    logger.info(`[Intents] Deleted intent #${id} for ${walletAddress.slice(0, 10)}...`);
    res.json({ deleted: true });
  } catch (error: any) {
    logger.error(`[Intents] Delete error: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete intent' });
  }
});

export default router;
