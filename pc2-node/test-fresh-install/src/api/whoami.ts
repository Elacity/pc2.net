/**
 * Whoami Endpoint
 * 
 * Returns current user information based on session token
 */

import { Request, Response } from 'express';
import { DatabaseManager } from '../storage/database.js';
import { AuthenticatedRequest } from './middleware.js';
import { UserInfo } from '../types/api.js';

/**
 * Get current user information
 * GET /whoami
 */
export function handleWhoami(req: AuthenticatedRequest, res: Response): void {
  const db = (req.app.locals.db as DatabaseManager | undefined);

  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Get user from database
  const user = db.getUser(req.user.wallet_address);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Get session
  const session = db.getSession(req.user.session_token);
  if (!session) {
    res.status(401).json({ error: 'Session not found' });
    return;
  }

  // Build user info response (Puter API format)
  const userInfo: UserInfo = {
    id: 1,
    uuid: req.user.wallet_address,
    username: req.user.wallet_address,
    wallet_address: req.user.wallet_address,
    smart_account_address: req.user.smart_account_address,
    email: null,
    email_confirmed: true,
    is_temp: false,
    taskbar_items: [],
    desktop_bg_url: '/images/flint-2.jpg', // PC2 default background
    desktop_bg_color: null,
    desktop_bg_fit: 'cover',
    token: req.user.session_token,
    auth_type: req.user.smart_account_address ? 'universalx' : 'wallet'
  };

  res.json(userInfo);
}
