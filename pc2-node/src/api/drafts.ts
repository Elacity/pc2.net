/**
 * Publish Drafts API
 * 
 * CRUD endpoints for publish queue / "sign later" drafts.
 * Drafts are wallet-scoped — each user only sees their own.
 */

import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from './middleware.js';
import type { DatabaseManager } from '../storage/database.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * POST /api/drafts
 * Create a new draft at the "ready to sign" checkpoint
 */
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) return res.status(401).json({ error: 'Not authenticated' });

    const {
      title, description, category, file_name, file_size, mime_type,
      asset_cid, metadata_cid, encrypt_hash, kid, channel, price,
      currency_address, currency_symbol, copies, access_method,
      reseller_cut, royalty_partners, thumbnail_cid, adult, steps,
    } = req.body;

    if (!asset_cid || !metadata_cid || !encrypt_hash || !channel || !title) {
      return res.status(400).json({ error: 'Missing required fields: title, asset_cid, metadata_cid, encrypt_hash, channel' });
    }

    const db = req.app.locals.db as DatabaseManager;
    const id = db.insertDraft({
      wallet_address: walletAddress,
      title,
      description,
      category,
      file_name,
      file_size,
      mime_type,
      asset_cid,
      metadata_cid,
      encrypt_hash,
      // Canonical asset KID — required for draft-resume mints to emit the
      // correct on-chain bytes16 contentId. See
      // MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.
      kid,
      channel,
      price,
      currency_address,
      currency_symbol,
      copies,
      access_method,
      reseller_cut,
      royalty_partners: royalty_partners ? JSON.stringify(royalty_partners) : undefined,
      thumbnail_cid,
      adult,
      steps: steps ? JSON.stringify(steps) : undefined,
    });

    logger.info(`[Drafts] Created draft #${id} for ${walletAddress.slice(0, 10)}...`);
    res.json({ id, status: 'ready' });
  } catch (error: any) {
    logger.error(`[Drafts] Create error: ${error.message}`);
    res.status(500).json({ error: 'Failed to create draft' });
  }
});

/**
 * GET /api/drafts
 * List all drafts for the authenticated wallet
 */
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) return res.status(401).json({ error: 'Not authenticated' });

    const db = req.app.locals.db as DatabaseManager;
    const drafts = db.getDraftsByWallet(walletAddress);

    // Parse JSON fields for the response
    const parsed = drafts.map((d: any) => ({
      ...d,
      royalty_partners: d.royalty_partners ? JSON.parse(d.royalty_partners) : null,
      steps: d.steps ? JSON.parse(d.steps) : null,
      adult: !!d.adult,
    }));

    res.json(parsed);
  } catch (error: any) {
    logger.error(`[Drafts] List error: ${error.message}`);
    res.status(500).json({ error: 'Failed to list drafts' });
  }
});

/**
 * GET /api/drafts/count
 * Badge count of active drafts (ready + processing)
 */
router.get('/count', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) return res.status(401).json({ count: 0 });

    const db = req.app.locals.db as DatabaseManager;
    const count = db.getDraftCount(walletAddress);
    res.json({ count });
  } catch (error: any) {
    res.json({ count: 0 });
  }
});

/**
 * GET /api/drafts/:id
 * Get a single draft by ID
 */
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) return res.status(401).json({ error: 'Not authenticated' });

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid draft ID' });

    const db = req.app.locals.db as DatabaseManager;
    const draft = db.getDraftById(id, walletAddress);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    res.json({
      ...draft,
      royalty_partners: draft.royalty_partners ? JSON.parse(draft.royalty_partners) : null,
      steps: draft.steps ? JSON.parse(draft.steps) : null,
      adult: !!draft.adult,
    });
  } catch (error: any) {
    logger.error(`[Drafts] Get error: ${error.message}`);
    res.status(500).json({ error: 'Failed to get draft' });
  }
});

/**
 * PATCH /api/drafts/:id
 * Update draft status
 */
router.patch('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) return res.status(401).json({ error: 'Not authenticated' });

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid draft ID' });

    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Missing status' });

    const db = req.app.locals.db as DatabaseManager;
    const updated = db.updateDraftStatus(id, walletAddress, status);
    if (!updated) return res.status(404).json({ error: 'Draft not found' });

    res.json({ id, status });
  } catch (error: any) {
    logger.error(`[Drafts] Update error: ${error.message}`);
    res.status(500).json({ error: 'Failed to update draft' });
  }
});

/**
 * DELETE /api/drafts/:id
 * Delete a draft (after successful mint or user cancel)
 */
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user?.wallet_address;
    if (!walletAddress) return res.status(401).json({ error: 'Not authenticated' });

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid draft ID' });

    const db = req.app.locals.db as DatabaseManager;
    const deleted = db.deleteDraft(id, walletAddress);
    if (!deleted) return res.status(404).json({ error: 'Draft not found' });

    logger.info(`[Drafts] Deleted draft #${id} for ${walletAddress.slice(0, 10)}...`);
    res.json({ deleted: true });
  } catch (error: any) {
    logger.error(`[Drafts] Delete error: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

export default router;
