/**
 * URL Utilities
 * 
 * Shared utilities for URL handling across the PC2 node.
 */

import { Request } from 'express';

/**
 * Interface for Boson service (to avoid circular imports)
 */
interface BosonServiceLike {
  getPublicUrl?: () => string | null;
}

/**
 * Get the base URL for the request, respecting reverse proxy headers.
 * When behind Nginx or other reverse proxies, req.protocol may be 'http'
 * even when the original request was HTTPS.
 * 
 * When accessed via Boson Active Proxy, the Host header may contain the internal
 * IP:port. In this case, we use the Boson service's registered public URL.
 * 
 * @param req - Express request object
 * @param bosonService - Optional Boson service instance for public URL resolution
 * @returns The base URL (e.g., "https://test7.ela.city")
 */
export function getBaseUrl(req: Request, bosonService?: BosonServiceLike): string {
  const host = req.get('host') || 'localhost';
  
  // If host contains an IP address with port (e.g., "38.242.211.112:4200"),
  // it's likely coming through Active Proxy without proper Host header.
  // In this case, try to use the Boson service's public URL.
  const isIpWithPort = /^\d+\.\d+\.\d+\.\d+:\d+$/.test(host);
  if (isIpWithPort && bosonService?.getPublicUrl) {
    const publicUrl = bosonService.getPublicUrl();
    if (publicUrl) {
      return publicUrl;
    }
  }
  
  // Check x-forwarded-proto header (set by reverse proxies like Nginx)
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (forwardedProto === 'https') {
    return `https://${host}`;
  }
  
  // Check origin header (contains original protocol)
  const origin = req.headers.origin;
  if (origin && typeof origin === 'string' && origin.startsWith('https://')) {
    return `https://${host}`;
  }
  
  // Fallback to req.protocol
  return `${req.protocol}://${host}`;
}
