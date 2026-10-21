/**
 * HTTP Client API for Agent External Requests
 * Enables agents to make HTTP requests to external APIs
 */

import { Response, Router } from 'express';
import { AuthenticatedRequest, authenticate } from './middleware.js';
import { logger } from '../utils/logger.js';
import { lookup as dnsLookup } from 'dns/promises';
import { isIP } from 'net';
import { Agent } from 'undici';
import { TRUSTED_ROOT_CERTIFICATES } from '../utils/tlsTrust.js';

const router = Router();

/**
 * Default blocked hosts for security
 * Prevents SSRF attacks on internal services
 */
const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254', // AWS metadata
  'metadata.google.internal', // GCP metadata
  '100.100.100.200', // Alibaba Cloud metadata
];

/**
 * Maximum allowed request timeout (30 seconds)
 */
const MAX_TIMEOUT = 30000;

/**
 * Maximum allowed response size (10MB)
 */
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;

interface HttpRequestBody {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  follow_redirects?: boolean;
}

/**
 * IPv4 ranges that must never be reachable via /api/http or /api/download.
 *
 * Covers loopback (127/8), RFC1918 private space (10/8, 172.16/12, 192.168/16),
 * link-local incl. cloud metadata (169.254/16), the wildcard (0/8), and
 * carrier-grade NAT (100.64/10).
 */
const IPV4_PRIVATE_REGEXES = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/,
];

function isPrivateIPv4(ip: string): boolean {
  return IPV4_PRIVATE_REGEXES.some((rx) => rx.test(ip));
}

/**
 * IPv6 private/loopback/link-local + IPv4-mapped IPv6 cover.
 * - ::1, :: → loopback / unspecified
 * - fc00::/7 → ULA (RFC 4193)
 * - fe80::/10 → link-local (RFC 4291), incl. fe80, fe90, fea0, feb0 prefixes
 * - ::ffff:a.b.c.d → IPv4-mapped, defer to IPv4 check
 */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
  const v4mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4mapped) return isPrivateIPv4(v4mapped[1]);
  return false;
}

interface ResolvedTarget {
  ip: string;
  family: 4 | 6;
}

/**
 * Resolve a hostname to a concrete IP and validate it against the
 * private/loopback/link-local blocklist. Returns the resolved IP so the
 * caller can pin the connect-time lookup to it — closing the DNS-rebind
 * window where the validation IP differs from the connection IP (A11).
 *
 * Throws an Error whose message starts with one of:
 *   PRIVATE_IP            — a literal private IP was passed
 *   DNS_RESOLVED_PRIVATE  — the hostname resolved to a private IP
 *   DNS_RESOLVE_FAILED    — DNS lookup failed entirely
 */
async function resolveAndValidate(hostname: string): Promise<ResolvedTarget> {
  const lowerHost = hostname.toLowerCase();
  if (BLOCKED_HOSTS.some((blocked) => lowerHost === blocked || lowerHost.endsWith(`.${blocked}`))) {
    throw new Error(`PRIVATE_IP:${hostname}`);
  }

  const literalFamily = isIP(hostname);
  if (literalFamily === 4) {
    if (isPrivateIPv4(hostname)) throw new Error(`PRIVATE_IP:${hostname}`);
    return { ip: hostname, family: 4 };
  }
  if (literalFamily === 6) {
    if (isPrivateIPv6(hostname)) throw new Error(`PRIVATE_IP:${hostname}`);
    return { ip: hostname, family: 6 };
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await dnsLookup(hostname, { all: true, verbatim: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`DNS_RESOLVE_FAILED:${msg}`);
  }
  if (!records.length) throw new Error(`DNS_RESOLVE_FAILED:no records for ${hostname}`);

  for (const rec of records) {
    const isPriv = rec.family === 4 ? isPrivateIPv4(rec.address) : isPrivateIPv6(rec.address);
    if (isPriv) {
      throw new Error(`DNS_RESOLVED_PRIVATE:${hostname}->${rec.address}`);
    }
  }
  const first = records[0];
  return { ip: first.address, family: first.family === 6 ? 6 : 4 };
}

/**
 * Build a per-request undici Agent that pins the TCP/TLS connect to the
 * already-validated IP. This prevents the classic DNS-rebind attack where
 * the attacker flips the A-record between our validation lookup and the
 * fetch's own lookup.
 */
function makePinnedDispatcher(target: ResolvedTarget): Agent {
  return new Agent({
    connect: {
      ca: TRUSTED_ROOT_CERTIFICATES,
      lookup: (_host: string, _opts: unknown, cb: (err: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
        cb(null, target.ip, target.family);
      },
    },
  });
}

/**
 * Make HTTP request to external service
 * POST /api/http
 */
async function handleHttpRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = req.body as HttpRequestBody;

  if (!body.url) {
    res.status(400).json({ error: 'Missing required parameter: url' });
    return;
  }

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(body.url);
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  // Only allow HTTP and HTTPS
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    res.status(400).json({ error: 'Only HTTP and HTTPS protocols are allowed' });
    return;
  }

  // Resolve hostname now and pin the connect-time lookup to the result.
  // Closes the DNS-rebind window where the validation lookup and the
  // fetch lookup return different IPs (A11).
  let target: ResolvedTarget;
  try {
    target = await resolveAndValidate(parsedUrl.hostname);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('PRIVATE_IP') || msg.startsWith('DNS_RESOLVED_PRIVATE')) {
      logger.warn('[HTTP Client] ssrf-blocked', { url: body.url, reason: msg });
      res.status(403).json({ error: 'Request to this host is not allowed' });
    } else {
      logger.warn('[HTTP Client] dns-resolve-failed', { url: body.url, reason: msg });
      res.status(502).json({ error: 'Failed to resolve host' });
    }
    return;
  }

  const method = (body.method || 'GET').toUpperCase();
  const timeout = Math.min(body.timeout || 10000, MAX_TIMEOUT);
  const followRedirects = body.follow_redirects !== false;

  logger.info('[HTTP Client] Making request', {
    url: body.url,
    method,
    wallet: req.user.wallet_address,
    hasBody: !!body.body,
    hasHeaders: !!body.headers
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const requestHeaders: Record<string, string> = {
      'User-Agent': 'PC2-Node-Agent/1.0',
      ...(body.headers || {}),
    };

    // Remove potentially dangerous headers
    delete requestHeaders['host'];
    delete requestHeaders['cookie'];

    const dispatcher = makePinnedDispatcher(target);
    const fetchOptions: RequestInit & { dispatcher?: Agent } = {
      method,
      headers: requestHeaders,
      signal: controller.signal,
      redirect: followRedirects ? 'follow' : 'manual',
      dispatcher,
    };

    // Add body for methods that support it
    if (['POST', 'PUT', 'PATCH'].includes(method) && body.body) {
      if (typeof body.body === 'object') {
        fetchOptions.body = JSON.stringify(body.body);
        if (!requestHeaders['content-type']) {
          requestHeaders['Content-Type'] = 'application/json';
        }
      } else {
        fetchOptions.body = String(body.body);
      }
    }

    let response: globalThis.Response;
    try {
      response = await fetch(body.url, fetchOptions);
    } finally {
      // Always tear down the per-request dispatcher to avoid socket leaks.
      void dispatcher.close().catch(() => { /* noop */ });
    }
    clearTimeout(timeoutId);

    // Check response size
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
      res.status(413).json({ error: 'Response too large' });
      return;
    }

    // Read response
    const responseText = await response.text();
    
    if (responseText.length > MAX_RESPONSE_SIZE) {
      res.status(413).json({ error: 'Response too large' });
      return;
    }

    // Try to parse as JSON
    let responseBody: any = responseText;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      // Keep as text
    }

    // Convert headers to object
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    logger.info('[HTTP Client] Request completed', {
      url: body.url,
      status: response.status,
      responseSize: responseText.length
    });

    res.json({
      success: true,
      status: response.status,
      status_text: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      url: response.url, // Final URL after redirects
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('aborted')) {
      logger.warn('[HTTP Client] Request timed out', { url: body.url });
      res.status(408).json({ error: 'Request timed out' });
      return;
    }

    logger.error('[HTTP Client] Request failed', {
      url: body.url,
      error: errorMessage
    });

    res.status(500).json({
      error: 'Request failed',
      message: errorMessage
    });
  }
}

/**
 * Maximum allowed download size (50MB)
 */
const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024;

interface DownloadRequestBody {
  url: string;
  destination: string;
  filename?: string;
  timeout?: number;
}

/**
 * Download file from URL to user storage
 * POST /api/download
 */
async function handleDownload(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const filesystem = req.app.locals.filesystem;
  if (!filesystem) {
    res.status(500).json({ error: 'Filesystem not initialized' });
    return;
  }

  const body = req.body as DownloadRequestBody;

  if (!body.url) {
    res.status(400).json({ error: 'Missing required parameter: url' });
    return;
  }

  if (!body.destination) {
    res.status(400).json({ error: 'Missing required parameter: destination' });
    return;
  }

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(body.url);
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  // Only allow HTTP and HTTPS
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    res.status(400).json({ error: 'Only HTTP and HTTPS protocols are allowed' });
    return;
  }

  // Resolve hostname now and pin the connect-time lookup to the result.
  // Closes the DNS-rebind window where the validation lookup and the
  // fetch lookup return different IPs (A11). Same logic as /api/http.
  let target: ResolvedTarget;
  try {
    target = await resolveAndValidate(parsedUrl.hostname);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('PRIVATE_IP') || msg.startsWith('DNS_RESOLVED_PRIVATE')) {
      logger.warn('[Download] ssrf-blocked', { url: body.url, reason: msg });
      res.status(403).json({ error: 'Request to this host is not allowed' });
    } else {
      logger.warn('[Download] dns-resolve-failed', { url: body.url, reason: msg });
      res.status(502).json({ error: 'Failed to resolve host' });
    }
    return;
  }

  // Resolve destination path
  let destPath = body.destination;
  if (destPath.startsWith('~')) {
    destPath = destPath.replace('~', `/${req.user.wallet_address}`);
  } else if (!destPath.startsWith('/')) {
    destPath = `/${req.user.wallet_address}/${destPath}`;
  }

  // Determine filename
  let filename = body.filename;
  if (!filename) {
    // Extract from URL path
    const urlPath = parsedUrl.pathname;
    filename = urlPath.split('/').pop() || 'download';
    // Remove query params if present
    if (filename.includes('?')) {
      filename = filename.split('?')[0];
    }
    // If still no filename, use a default
    if (!filename || filename === '') {
      filename = `download-${Date.now()}`;
    }
  }

  const fullPath = `${destPath}/${filename}`;
  const timeout = Math.min(body.timeout || 60000, 120000); // Max 2 minutes for downloads

  logger.info('[Download] Starting download', {
    url: body.url,
    destination: fullPath,
    wallet: req.user.wallet_address
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const dispatcher = makePinnedDispatcher(target);
    let response: globalThis.Response;
    try {
      response = await fetch(body.url, {
        method: 'GET',
        headers: {
          'User-Agent': 'PC2-Node-Agent/1.0',
        },
        signal: controller.signal,
        dispatcher,
      } as RequestInit & { dispatcher?: Agent });
    } finally {
      void dispatcher.close().catch(() => { /* noop */ });
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      res.status(response.status).json({
        error: `Download failed: ${response.statusText}`,
        status: response.status
      });
      return;
    }

    // Check content length
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_DOWNLOAD_SIZE) {
      res.status(413).json({ error: 'File too large (max 50MB)' });
      return;
    }

    // Read as buffer
    const arrayBuffer = await response.arrayBuffer();
    
    if (arrayBuffer.byteLength > MAX_DOWNLOAD_SIZE) {
      res.status(413).json({ error: 'File too large (max 50MB)' });
      return;
    }

    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // Write to filesystem
    await filesystem.writeFile(fullPath, buffer, req.user.wallet_address, {
      mimeType: contentType
    });

    logger.info('[Download] Download completed', {
      url: body.url,
      destination: fullPath,
      size: buffer.length,
      contentType
    });

    res.json({
      success: true,
      path: fullPath,
      filename,
      size: buffer.length,
      content_type: contentType,
      source_url: body.url
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('aborted')) {
      logger.warn('[Download] Download timed out', { url: body.url });
      res.status(408).json({ error: 'Download timed out' });
      return;
    }

    logger.error('[Download] Download failed', {
      url: body.url,
      error: errorMessage
    });

    res.status(500).json({
      error: 'Download failed',
      message: errorMessage
    });
  }
}

// Register routes
router.post('/', authenticate, handleHttpRequest);
router.post('/download', authenticate, handleDownload);

export { router as httpClientRouter, handleHttpRequest, handleDownload };
