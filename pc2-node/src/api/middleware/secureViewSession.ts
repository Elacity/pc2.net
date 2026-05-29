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
import type { BackendSessionView, WasmSessionView } from '../chipotle-client.js';
import {
  sessionService,
  type StoredSession,
} from '../../services/session/BackendSessionService.js';
import { isDelegationRevoked } from '../../utils/secureViewSession.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('SecureViewMiddleware');

/**
 * Either backend's view. Both implement `ISessionView` + `ICencDecryptor`;
 * downstream handlers depend on the union, not the concrete class.
 */
export type SecureViewSessionView = BackendSessionView | WasmSessionView;

export interface SecureViewRequest extends AuthenticatedRequest {
  secureViewSession?: {
    stored: StoredSession;
    view: SecureViewSessionView;
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

  // Revocation gate (security.mdc). When the owner revokes a delegation via
  // POST /lit/revoke-session it must stop working on this node IMMEDIATELY —
  // not merely fail the (unused) defence-in-depth bundle verifier. The
  // revoked nonce lives inside the wallet-signed canonical delegation, so we
  // read it back here and reject before the session view is resurrected.
  try {
    const del = JSON.parse(stored.delegationCanonical) as { nonce?: string };
    if (del?.nonce && isDelegationRevoked(del.nonce as `0x${string}`)) {
      res.status(401).json({ error: 'session_revoked' });
      return;
    }
  } catch {
    // Malformed canonical delegation should never happen for a stored
    // session; fall through and let getSessionView fail closed if it is bad.
  }

  try {
    // The factory dispatches on `stored.backend`. For the WASM backend it
    // returns `null` when `wasm.session_lookup` has lost the session
    // (typically a process restart between createSession and this request);
    // surface that as the same `session_token_invalid` signal the client
    // already handles by re-bootstrapping.
    const view = await sessionService.getSessionView(token);
    if (!view) {
      res.status(401).json({ error: 'session_token_invalid' });
      return;
    }
    req.secureViewSession = { stored, view };
    res.setHeader('X-SecureView-Session', 'verified');
    next();
  } catch (err: any) {
    logger.error(`session resurrection failed: ${err?.message}`);
    res.status(500).json({ error: 'session_resurrect_failed' });
  }
}
