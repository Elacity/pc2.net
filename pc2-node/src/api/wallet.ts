/**
 * Wallet API Router
 * 
 * Handles transaction proposals for Agent Account operations.
 * These endpoints allow the frontend to approve/reject AI-proposed transactions.
 */

import express, { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from './middleware.js';
import { logger } from '../utils/logger.js';
import { pendingProposals, AgentKitExecutor } from '../services/ai/tools/AgentKitExecutor.js';
import type { DatabaseManager } from '../storage/database.js';

const router: Router = express.Router();

/**
 * GET /api/wallet/proposals/pending
 * Get all pending transaction proposals for the current user
 */
router.get('/proposals/pending', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const walletAddress = req.user?.wallet_address?.toLowerCase();
    
    if (!walletAddress) {
      res.status(401).json({ error: 'Wallet address required' });
      return;
    }
    
    // Get proposals from database (includes all historical proposals)
    const db = req.app.locals.db as DatabaseManager;
    const dbProposals = db.getProposals(walletAddress, 50);
    
    // Merge with in-memory pending proposals (in case DB is behind)
    const now = Date.now();
    const proposalMap = new Map<string, any>();
    
    // Add database proposals first
    for (const p of dbProposals) {
      proposalMap.set(p.id, p);
    }
    
    // Add/update with in-memory proposals
    for (const [id, proposal] of pendingProposals.entries()) {
      proposalMap.set(id, proposal);
    }
    
    // Convert to array and sort by creation time
    const allProposals = Array.from(proposalMap.values()).sort((a, b) => 
      (b.createdAt || 0) - (a.createdAt || 0)
    );
    
    logger.info(`[Wallet API] Found ${allProposals.length} proposals for ${walletAddress}`);
    
    res.json({
      success: true,
      proposals: allProposals,
    });
  } catch (error: any) {
    logger.error('[Wallet API] Get pending proposals failed:', error);
    res.status(500).json({ error: error.message || 'Failed to get proposals' });
  }
});

/**
 * GET /api/wallet/proposals/:id
 * Get a specific transaction proposal
 */
router.get('/proposals/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check memory first, then database
    let proposal = pendingProposals.get(id);
    
    if (!proposal) {
      const db = req.app.locals.db as DatabaseManager;
      proposal = db.getProposal(id);
    }
    
    if (!proposal) {
      res.status(404).json({ error: 'Proposal not found' });
      return;
    }
    
    res.json({
      success: true,
      proposal,
    });
  } catch (error: any) {
    logger.error('[Wallet API] Get proposal failed:', error);
    res.status(500).json({ error: error.message || 'Failed to get proposal' });
  }
});

/**
 * POST /api/wallet/proposals/:id/approve
 * Approve and execute a transaction proposal
 */
router.post('/proposals/:id/approve', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const walletAddress = req.user?.wallet_address;
    
    logger.info(`[Wallet API] Approving proposal ${id} for ${walletAddress}`);
    
    let proposal = pendingProposals.get(id);
    
    if (!proposal) {
      const db = req.app.locals.db as DatabaseManager;
      proposal = db.getProposal(id);
    }
    
    if (!proposal) {
      res.status(404).json({ error: 'Proposal not found or expired' });
      return;
    }

    // SEC-A12 (2026-04-22 audit): proposals are bound to the wallet that
    // created them (stored in proposal.from). Reject cross-wallet approvals
    // so a tethered wallet cannot mutate another wallet's proposal records
    // (on-chain signing is still gated by the key-holding wallet, but the
    // DB record drives owner-facing audit/UI).
    const proposalWallet = (proposal.from || '').toLowerCase();
    const callerWallet = (walletAddress || '').toLowerCase();
    if (!proposalWallet || proposalWallet !== callerWallet) {
      logger.warn('[Wallet API] proposal-mismatch on approve', {
        proposalId: id,
        proposalWallet: proposalWallet ? `${proposalWallet.substring(0, 10)}...` : 'unset',
        callerWallet: callerWallet ? `${callerWallet.substring(0, 10)}...` : 'unset',
      });
      res.status(403).json({ error: 'this proposal belongs to a different wallet' });
      return;
    }

    // Check if proposal is still valid
    if (proposal.status !== 'pending_approval') {
      res.status(400).json({ error: `Proposal already ${proposal.status}` });
      return;
    }
    
    if (proposal.expiresAt < Date.now()) {
      // Update status
      AgentKitExecutor.updateProposalStatus(id, 'expired');
      res.status(400).json({ error: 'Proposal has expired' });
      return;
    }
    
    // Update proposal status
    const updatedProposal = AgentKitExecutor.updateProposalStatus(id, 'approved');
    
    logger.info(`[Wallet API] Proposal ${id} approved, awaiting execution...`);
    
    // Notify via WebSocket
    const io = req.app.locals.io;
    if (io) {
      io.emit('wallet-agent:proposal-approved', { proposalId: id, proposal: updatedProposal });
    }
    
    res.json({
      success: true,
      proposalId: id,
      status: 'approved',
      message: 'Transaction approved. Execute via wallet.',
      proposal: updatedProposal,
    });
    
  } catch (error: any) {
    logger.error('[Wallet API] Approve proposal failed:', error);
    res.status(500).json({ error: error.message || 'Failed to approve proposal' });
  }
});

/**
 * POST /api/wallet/proposals/:id/reject
 * Reject a transaction proposal
 */
router.post('/proposals/:id/reject', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason = 'user' } = req.body;
    const callerWallet = (req.user?.wallet_address || '').toLowerCase();

    logger.info(`[Wallet API] Rejecting proposal ${id}, reason: ${reason}`);

    // SEC-A12 (2026-04-22 audit): bind reject to proposal owner. Fetch
    // first so we can verify the caller owns the proposal before mutating.
    let proposal = pendingProposals.get(id);
    if (!proposal) {
      const db = req.app.locals.db as DatabaseManager;
      proposal = db.getProposal(id);
    }
    if (!proposal) {
      res.status(404).json({ error: 'Proposal not found' });
      return;
    }
    const proposalWallet = (proposal.from || '').toLowerCase();
    if (!proposalWallet || proposalWallet !== callerWallet) {
      logger.warn('[Wallet API] proposal-mismatch on reject', {
        proposalId: id,
        proposalWallet: proposalWallet ? `${proposalWallet.substring(0, 10)}...` : 'unset',
        callerWallet: callerWallet ? `${callerWallet.substring(0, 10)}...` : 'unset',
      });
      res.status(403).json({ error: 'this proposal belongs to a different wallet' });
      return;
    }

    // Update proposal status in memory and database
    const updatedProposal = AgentKitExecutor.updateProposalStatus(id, 'rejected', { rejectionReason: reason });
    
    if (!updatedProposal) {
      // Also try to update in database directly
      const db = req.app.locals.db as DatabaseManager;
      db.updateProposalStatus(id, 'rejected', { rejectionReason: reason });
    }
    
    // Notify via WebSocket
    const io = req.app.locals.io;
    if (io) {
      io.emit('wallet-agent:proposal-rejected', { proposalId: id, reason, proposal: updatedProposal });
    }
    
    res.json({
      success: true,
      proposalId: id,
      status: 'rejected',
      reason,
    });
    
  } catch (error: any) {
    logger.error('[Wallet API] Reject proposal failed:', error);
    res.status(500).json({ error: error.message || 'Failed to reject proposal' });
  }
});

/**
 * POST /api/wallet/proposals/:id/execute
 * Execute an approved transaction (called by frontend after Particle signing)
 */
router.post('/proposals/:id/execute', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { txHash, signature } = req.body;
    const callerWallet = (req.user?.wallet_address || '').toLowerCase();

    logger.info(`[Wallet API] Executing proposal ${id}, txHash: ${txHash}`);

    // SEC-A12 (2026-04-22 audit): bind execute to proposal owner. Fetch
    // first so we can verify the caller owns the proposal before flipping
    // the record to 'executed'.
    let proposal = pendingProposals.get(id);
    if (!proposal) {
      const db = req.app.locals.db as DatabaseManager;
      proposal = db.getProposal(id);
    }
    if (!proposal) {
      res.status(404).json({ error: 'Proposal not found' });
      return;
    }
    const proposalWallet = (proposal.from || '').toLowerCase();
    if (!proposalWallet || proposalWallet !== callerWallet) {
      logger.warn('[Wallet API] proposal-mismatch on execute', {
        proposalId: id,
        proposalWallet: proposalWallet ? `${proposalWallet.substring(0, 10)}...` : 'unset',
        callerWallet: callerWallet ? `${callerWallet.substring(0, 10)}...` : 'unset',
      });
      res.status(403).json({ error: 'this proposal belongs to a different wallet' });
      return;
    }

    // Update proposal status to executed
    const updatedProposal = AgentKitExecutor.updateProposalStatus(id, 'executed', { txHash });
    
    if (!updatedProposal) {
      // Also try to update in database directly
      const db = req.app.locals.db as DatabaseManager;
      db.updateProposalStatus(id, 'executed', { txHash });
    }
    
    // Notify via WebSocket
    const io = req.app.locals.io;
    if (io) {
      io.emit('wallet-agent:proposal-executed', { proposalId: id, txHash, proposal: updatedProposal });
    }
    
    // Clean up old proposals from memory after some time (DB keeps them)
    setTimeout(() => {
      pendingProposals.delete(id);
    }, 60000); // Keep in memory for 1 minute
    
    res.json({
      success: true,
      proposalId: id,
      status: 'executed',
      txHash,
    });
    
  } catch (error: any) {
    logger.error('[Wallet API] Execute proposal failed:', error);
    res.status(500).json({ error: error.message || 'Failed to execute proposal' });
  }
});

export default router;
