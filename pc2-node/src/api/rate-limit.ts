/**
 * Rate Limiting for API Requests
 * Implements per-key and per-wallet rate limiting with configurable limits
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './middleware.js';
import { logger } from '../utils/logger.js';

/**
 * Rate limit configuration per scope
 */
interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Maximum requests per window
  message?: string;      // Custom error message
}

/**
 * Default rate limits by scope
 */
const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  // Read operations - higher limit
  read: {
    windowMs: 60 * 1000,     // 1 minute
    maxRequests: 100,        // 100 requests per minute
  },
  // Write operations - medium limit
  write: {
    windowMs: 60 * 1000,     // 1 minute
    maxRequests: 60,         // 60 requests per minute
  },
  // Execute operations - lower limit (terminal, git, etc.)
  execute: {
    windowMs: 60 * 1000,     // 1 minute
    maxRequests: 30,         // 30 requests per minute
  },
  // Admin operations - strict limit
  admin: {
    windowMs: 60 * 1000,     // 1 minute
    maxRequests: 10,         // 10 requests per minute
  },
  // Default for unscoped requests
  default: {
    windowMs: 60 * 1000,     // 1 minute
    maxRequests: 60,         // 60 requests per minute
  },
};

/**
 * In-memory store for rate limit tracking
 * Key format: {wallet_address}:{api_key_id | 'session'}:{scope}
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore: Map<string, RateLimitEntry> = new Map();

/**
 * Clean up expired entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 60 * 1000); // Clean up every minute

/**
 * Map endpoint to scope for rate limiting
 */
function getEndpointScope(method: string, path: string): string {
  // Read operations
  const readEndpoints = [
    '/api/tools', '/api/stats', '/api/audit', '/df', '/kv/',
    '/readdir', '/read', '/stat', '/search', '/whoami',
    '/api/git/status', '/api/git/log', '/api/git/diff',
    '/get-launch-apps', '/api/backups',
  ];
  
  // Execute operations (more intensive)
  const executeEndpoints = [
    '/api/terminal/exec', '/api/terminal/script',
    '/api/git/clone', '/api/git/push', '/api/git/pull', '/api/git/commit',
    '/api/http', '/api/ai/chat',
  ];
  
  // Admin operations
  const adminEndpoints = [
    '/api/backups/create', '/api/backups/restore',
    '/api/terminal/destroy',
  ];
  
  // Write operations
  const writeEndpoints = [
    '/write', '/mkdir', '/delete', '/move', '/rename', '/copy',
    '/kv/',
  ];

  // Check each category
  for (const endpoint of adminEndpoints) {
    if (path.startsWith(endpoint)) return 'admin';
  }
  for (const endpoint of executeEndpoints) {
    if (path.startsWith(endpoint)) return 'execute';
  }
  if (method === 'GET') {
    for (const endpoint of readEndpoints) {
      if (path.startsWith(endpoint)) return 'read';
    }
  }
  for (const endpoint of writeEndpoints) {
    if (path.startsWith(endpoint)) return 'write';
  }
  
  // Default to 'read' for GET, 'write' for others
  return method === 'GET' ? 'read' : 'write';
}

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware(
  customLimits?: Partial<Record<string, RateLimitConfig>>
) {
  const limits = { ...DEFAULT_LIMITS, ...customLimits };

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // Skip if no user (let auth middleware handle it)
    if (!req.user) {
      next();
      return;
    }

    const walletAddress = req.user.wallet_address;
    const apiKeyId = (req as any).apiKeyId || 'session';
    const scope = getEndpointScope(req.method, req.path);
    const config = limits[scope] || limits.default || DEFAULT_LIMITS.default;
    
    const key = `${walletAddress}:${apiKeyId}:${scope}`;
    const now = Date.now();
    
    // Get or create entry
    let entry = rateLimitStore.get(key);
    
    if (!entry || entry.resetTime <= now) {
      // Create new window
      entry = {
        count: 0,
        resetTime: now + config.windowMs,
      };
      rateLimitStore.set(key, entry);
    }
    
    // Increment count
    entry.count++;
    
    // Check if over limit
    if (entry.count > config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      
      logger.warn('[RateLimit] Request rejected', {
        wallet: walletAddress.substring(0, 10),
        apiKey: apiKeyId,
        scope,
        count: entry.count,
        limit: config.maxRequests,
        retryAfter,
      });
      
      res.set({
        'X-RateLimit-Limit': String(config.maxRequests),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(entry.resetTime),
        'Retry-After': String(retryAfter),
      });
      
      res.status(429).json({
        error: 'Too Many Requests',
        message: config.message || `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        retry_after: retryAfter,
        limit: config.maxRequests,
        window_ms: config.windowMs,
      });
      return;
    }
    
    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': String(config.maxRequests),
      'X-RateLimit-Remaining': String(Math.max(0, config.maxRequests - entry.count)),
      'X-RateLimit-Reset': String(entry.resetTime),
    });
    
    next();
  };
}

/**
 * Get current rate limit status for a user
 */
export function getRateLimitStatus(
  walletAddress: string,
  apiKeyId?: string
): Record<string, { remaining: number; limit: number; reset: number }> {
  const keyPrefix = `${walletAddress}:${apiKeyId || 'session'}`;
  const now = Date.now();
  const status: Record<string, { remaining: number; limit: number; reset: number }> = {};
  
  for (const scope of Object.keys(DEFAULT_LIMITS)) {
    const key = `${keyPrefix}:${scope}`;
    const entry = rateLimitStore.get(key);
    const config = DEFAULT_LIMITS[scope];
    
    if (entry && entry.resetTime > now) {
      status[scope] = {
        remaining: Math.max(0, config.maxRequests - entry.count),
        limit: config.maxRequests,
        reset: entry.resetTime,
      };
    } else {
      status[scope] = {
        remaining: config.maxRequests,
        limit: config.maxRequests,
        reset: now + config.windowMs,
      };
    }
  }
  
  return status;
}

export { DEFAULT_LIMITS, RateLimitConfig };
