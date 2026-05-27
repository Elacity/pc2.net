/**
 * requireSecureViewSession — load + attach the backend secure-view session.
 *
 * Must run AFTER `authenticate` so `req.user.wallet_address` is populated.
 * Extracts the opaque bearer token (in order):
 *
 *   1. `X-SecureView-Session` header
 *   2. `req.body.sessionToken`
 *
 * On success: attaches `req.secureViewSession = { stored, view }`. The view
 * is a fully-resurrected `BackendSessionView` ready to sign per-asset
 * requests and unwrap CEK envelopes. Downstream handlers must NOT re-load
 * by token — pass `req.secureViewSession.view` directly to
 * `recoverCEKEnvelope` / `recoverWithSession`.
 *
 * Failure modes:
 *   401 session_token_required  — no token in request
 *   401 session_token_invalid   — token unknown or expired
 *   403 session_owner_mismatch  — token's owner ≠ authenticated wallet
 *   500 session_resurrect_failed — `BackendSessionView.fromStoredSession` threw
 */

import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware.js';
import { BackendSessionView } from '../chipotle-client.js';
import {
  sessionService,
  type StoredSession,
} from '../../services/session/BackendSessionService.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('SecureViewMiddleware');

export interface SecureViewRequest extends AuthenticatedRequest {
  secureViewSession?: {
    stored: StoredSession;
    view: BackendSessionView;
  };
}

const HEADER_NAME = 'x-secureview-session';

function extractToken(req: SecureViewRequest): string | null {
  const headerVal = req.headers[HEADER_NAME];
  if (typeof headerVal === 'string' && headerVal.length > 0) return headerVal;
  if (Array.isArray(headerVal) && headerVal.length > 0 && typeof headerVal[0] === 'string') {
    return headerVal[0];
  }
  const bodyVal = (req.body as Record<string, unknown> | undefined)?.sessionToken;
  if (typeof bodyVal === 'string' && bodyVal.length > 0) return bodyVal;
  return null;
}

export async function requireSecureViewSession(
  req: SecureViewRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userWallet = req.user?.wallet_address;
  if (!userWallet) {
    res.status(401).json({ error: 'authentication_required' });
    return;
  }

  const token = extractToken(req);
  if (!token) {
    res.status(401).json({
      error: 'session_token_required',
      message: 'Provide the secure-view session bearer token via X-SecureView-Session header or body.sessionToken. Call POST /api/storage/lit/begin-session first.',
    });
    return;
  }

  const stored = sessionService.getSessionByToken(token);
  if (!stored) {
    res.status(401).json({ error: 'session_token_invalid' });
    return;
  }

  // Defense-in-depth ownership check. The Lit Action repeats the same check
  // inside the TEE via ecrecover(delegationSig) === del.ownerAddress.
  const userAlt = req.user?.smart_account_address || undefined;
  const ownerLower = stored.ownerAddress.toLowerCase();
  if (
    ownerLower !== userWallet.toLowerCase() &&
    (!userAlt || ownerLower !== userAlt.toLowerCase())
  ) {
    logger.warn(
      `session/auth mismatch: owner=${stored.ownerAddress.substring(0, 10)}… user=${userWallet.substring(0, 10)}…`,
    );
    res.status(403).json({ error: 'session_owner_mismatch' });
    return;
  }

  try {
    const view = await BackendSessionView.fromStoredSession(stored);
    req.secureViewSession = { stored, view };
    res.setHeader('X-SecureView-Session', 'verified');
    next();
  } catch (err: any) {
    logger.error(`session resurrection failed: ${err?.message}`);
    res.status(500).json({ error: 'session_resurrect_failed' });
  }
}
