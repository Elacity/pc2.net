/**
 * HTTP Client API for Agent External Requests
 * Enables agents to make HTTP requests to external APIs
 */

import { Response, Router } from 'express';
import { AuthenticatedRequest, authenticate } from './middleware.js';
import { logger } from '../utils/logger.js';

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
 * Check if a host is blocked
 */
function isBlockedHost(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    
    // Check against blocked hosts
    if (BLOCKED_HOSTS.some(blocked => hostname === blocked || hostname.endsWith(`.${blocked}`))) {
      return true;
    }
    
    // Block internal IP ranges
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      return true;
    }
    
    return false;
  } catch {
    return true; // Invalid URL is blocked
  }
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

  // Check for blocked hosts
  if (isBlockedHost(body.url)) {
    res.status(403).json({ error: 'Request to this host is not allowed' });
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

    const fetchOptions: RequestInit = {
      method,
      headers: requestHeaders,
      signal: controller.signal,
      redirect: followRedirects ? 'follow' : 'manual',
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

    const response = await fetch(body.url, fetchOptions);
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

  // Check for blocked hosts
  if (isBlockedHost(body.url)) {
    res.status(403).json({ error: 'Request to this host is not allowed' });
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

    const response = await fetch(body.url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PC2-Node-Agent/1.0',
      },
      signal: controller.signal,
    });

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
