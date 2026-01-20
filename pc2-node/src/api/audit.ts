/**
 * Audit Logging API
 * Track and query agent/API actions
 */

import { Response, Router, NextFunction } from 'express';
import { AuthenticatedRequest, authenticate } from './middleware.js';
import { logger } from '../utils/logger.js';
import { DatabaseManager } from '../storage/index.js';

const router = Router();

/**
 * Endpoints that should be audited
 */
const AUDITED_ENDPOINTS = [
  // Filesystem operations
  '/write', '/mkdir', '/delete', '/move', '/rename', '/copy',
  // Terminal operations
  '/api/terminal/exec', '/api/terminal/script',
  // Git operations
  '/api/git/',
  // HTTP operations
  '/api/http',
  // Backup operations
  '/api/backups/',
  // AI operations
  '/api/ai/chat',
  // Key-value operations
  '/kv/',
];

/**
 * Check if an endpoint should be audited
 */
function shouldAudit(endpoint: string): boolean {
  return AUDITED_ENDPOINTS.some(prefix => endpoint.startsWith(prefix));
}

/**
 * Extract action name from endpoint
 */
function extractAction(method: string, endpoint: string): string {
  // Remove query string
  const path = endpoint.split('?')[0];
  
  // Map common endpoints to action names
  const actionMap: Record<string, string> = {
    'POST /write': 'file_write',
    'POST /mkdir': 'dir_create',
    'POST /delete': 'file_delete',
    'POST /move': 'file_move',
    'POST /rename': 'file_rename',
    'POST /copy': 'file_copy',
    'POST /api/terminal/exec': 'terminal_exec',
    'POST /api/terminal/script': 'terminal_script',
    'POST /api/git/clone': 'git_clone',
    'POST /api/git/commit': 'git_commit',
    'POST /api/git/push': 'git_push',
    'POST /api/git/pull': 'git_pull',
    'POST /api/http': 'http_request',
    'POST /api/http/download': 'http_download',
    'POST /api/backups/create': 'backup_create',
    'POST /api/backups/restore': 'backup_restore',
    'POST /api/ai/chat': 'ai_chat',
  };

  const key = `${method} ${path}`;
  if (actionMap[key]) {
    return actionMap[key];
  }

  // For KV operations
  if (path.startsWith('/kv/')) {
    return method === 'GET' ? 'kv_read' : 'kv_write';
  }

  // Fallback: generate from path
  const parts = path.split('/').filter(p => p && !p.startsWith(':'));
  return parts.join('_').toLowerCase() || 'unknown';
}

/**
 * Sanitize request body for logging (remove sensitive data)
 */
function sanitizeBody(body: any): string | null {
  if (!body || Object.keys(body).length === 0) {
    return null;
  }

  const sanitized = { ...body };
  
  // Remove sensitive fields
  const sensitiveFields = ['password', 'secret', 'token', 'key', 'api_key', 'private'];
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  // Truncate large fields
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'string' && value.length > 500) {
      sanitized[key] = value.substring(0, 500) + '...[truncated]';
    }
    if (Array.isArray(value) && value.length > 10) {
      sanitized[key] = [...value.slice(0, 10), `...[${value.length - 10} more]`];
    }
  }

  try {
    return JSON.stringify(sanitized);
  } catch {
    return null;
  }
}

/**
 * Create audit log entry
 */
export function createAuditLog(
  db: DatabaseManager,
  entry: {
    wallet_address: string;
    action: string;
    resource?: string;
    resource_path?: string;
    method: string;
    endpoint: string;
    status_code?: number;
    request_body?: string | null;
    response_summary?: string | null;
    ip_address?: string;
    user_agent?: string;
    api_key_id?: string;
    duration_ms?: number;
  }
): void {
  try {
    db.createAuditLog({
      ...entry,
      created_at: Date.now(),
    });
  } catch (error) {
    logger.error('[Audit] Failed to create audit log', { error });
  }
}

/**
 * Audit logging middleware
 */
export function auditMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  // Only audit specific endpoints
  if (!shouldAudit(req.path)) {
    next();
    return;
  }

  const startTime = Date.now();
  const originalSend = res.send.bind(res);
  let responseSummary: string | null = null;

  // Intercept response to capture status
  res.send = function(body: any): Response {
    if (typeof body === 'object') {
      try {
        const parsed = typeof body === 'string' ? JSON.parse(body) : body;
        if (parsed.success !== undefined) {
          responseSummary = parsed.success ? 'success' : 'failed';
        } else if (parsed.error) {
          responseSummary = `error: ${parsed.error}`;
        }
      } catch {
        // Ignore parse errors
      }
    }
    return originalSend(body);
  };

  // Log after response
  res.on('finish', () => {
    if (!req.user) return;

    const db = req.app.locals.db as DatabaseManager | undefined;
    if (!db) return;

    const duration = Date.now() - startTime;
    const action = extractAction(req.method, req.path);

    createAuditLog(db, {
      wallet_address: req.user.wallet_address,
      action,
      resource: req.body?.path || req.body?.source || req.body?.url || undefined,
      resource_path: req.body?.destination || req.body?.to || undefined,
      method: req.method,
      endpoint: req.path,
      status_code: res.statusCode,
      request_body: sanitizeBody(req.body),
      response_summary: responseSummary,
      ip_address: req.ip || req.socket.remoteAddress,
      user_agent: req.get('User-Agent'),
      api_key_id: (req as any).apiKeyId,
      duration_ms: duration,
    });
  });

  next();
}

interface AuditLogEntry {
  id: number;
  wallet_address: string;
  action: string;
  resource: string | null;
  resource_path: string | null;
  method: string;
  endpoint: string;
  status_code: number | null;
  request_body: string | null;
  response_summary: string | null;
  ip_address: string | null;
  user_agent: string | null;
  api_key_id: string | null;
  duration_ms: number | null;
  created_at: number;
}

/**
 * List audit logs
 * GET /api/audit
 */
async function handleListAuditLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const db = req.app.locals.db as DatabaseManager | undefined;
  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;
  const action = req.query.action as string | undefined;
  const since = req.query.since ? parseInt(req.query.since as string) : undefined;
  const until = req.query.until ? parseInt(req.query.until as string) : undefined;

  try {
    const logs = db.getAuditLogs(req.user.wallet_address, {
      limit,
      offset,
      action,
      since,
      until,
    });

    const total = db.getAuditLogsCount(req.user.wallet_address, { action, since, until });

    res.json({
      success: true,
      logs,
      pagination: {
        limit,
        offset,
        total,
        has_more: offset + logs.length < total,
      },
    });
  } catch (error) {
    logger.error('[Audit] Failed to list logs', { error });
    res.status(500).json({ error: 'Failed to list audit logs' });
  }
}

/**
 * Get audit log summary/stats
 * GET /api/audit/stats
 */
async function handleAuditStats(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const db = req.app.locals.db as DatabaseManager | undefined;
  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  const since = req.query.since ? parseInt(req.query.since as string) : Date.now() - 24 * 60 * 60 * 1000; // Last 24h

  try {
    const stats = db.getAuditStats(req.user.wallet_address, since);

    res.json({
      success: true,
      since,
      stats,
    });
  } catch (error) {
    logger.error('[Audit] Failed to get stats', { error });
    res.status(500).json({ error: 'Failed to get audit stats' });
  }
}

// Register routes
router.get('/', authenticate, handleListAuditLogs);
router.get('/stats', authenticate, handleAuditStats);

export { router as auditRouter };
