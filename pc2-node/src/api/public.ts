/**
 * Public IPFS Gateway API
 * 
 * Provides unauthenticated access to:
 * - Files in users' /Public folders
 * - Any pinned CID via /ipfs/:cid
 * - Public file listings
 * 
 * This enables PC2 nodes to participate in the public IPFS network
 * and serve as gateways for dDRM marketplace content.
 */

import { Router, Request, Response } from 'express';
import { Readable, pipeline } from 'stream';
import type { DatabaseManager, FileMetadata } from '../storage/database.js';
import type { FilesystemManager } from '../storage/filesystem.js';
import { IPFSStorage } from '../storage/ipfs.js';
import { logger } from '../utils/logger.js';
import rateLimit from 'express-rate-limit';

// Rate limiting for API endpoints (metadata, listings, pinning)
const publicRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});

// In-memory CDN bandwidth tracking — accumulates bytes served without DB writes
// on every request. Stats are reset on server restart (intentional: lightweight).
interface CDNStats {
  bytesServed: number;
  requestCount: number;
  startedAt: number;
  bySource: Record<string, { bytes: number; requests: number }>;
}
const cdnStats: CDNStats = {
  bytesServed: 0,
  requestCount: 0,
  startedAt: Date.now(),
  bySource: {},
};

// Module-level reference set by createPublicRouter — used to update persistent
// serve stats (last_served_at / serve_count) for seeded content.
let _dbRef: DatabaseManager | null = null;

function trackCDNBandwidth(cid: string, bytes: number): void {
  cdnStats.bytesServed += bytes;
  cdnStats.requestCount += 1;
  if (!cdnStats.bySource[cid]) {
    cdnStats.bySource[cid] = { bytes: 0, requests: 0 };
  }
  cdnStats.bySource[cid].bytes += bytes;
  cdnStats.bySource[cid].requests += 1;

  recordBandwidth(bytes);

  // Persistent serve tracking for content seeding tier classification
  if (_dbRef) {
    try { _dbRef.updateServeStats(cid); } catch { /* non-critical */ }
  }
}

export function getCDNStats(): CDNStats {
  return cdnStats;
}

// Higher limit for content-serving routes -- video players make many Range
// requests per second and would instantly hit the 100/min API limit.
const contentRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});

// ---------------------------------------------------------------------------
// Bandwidth limiter — enforces seeding.max_upload_mbps (0 = unlimited)
// ---------------------------------------------------------------------------
let _bandwidthLimitBytesPerSec = 0;
let _bandwidthWindowBytes = 0;
let _bandwidthWindowStart = Date.now();
const BANDWIDTH_WINDOW_MS = 5000;

export function setBandwidthLimit(mbps: number): void {
  _bandwidthLimitBytesPerSec = mbps > 0 ? (mbps * 1_000_000 / 8) : 0;
  if (_bandwidthLimitBytesPerSec > 0) {
    logger.info(`[CDN] Bandwidth limit set: ${mbps} Mbps (${(_bandwidthLimitBytesPerSec / 1024).toFixed(0)} KB/s)`);
  }
}

function recordBandwidth(bytes: number): void {
  const now = Date.now();
  if (now - _bandwidthWindowStart > BANDWIDTH_WINDOW_MS) {
    _bandwidthWindowBytes = 0;
    _bandwidthWindowStart = now;
  }
  _bandwidthWindowBytes += bytes;
}

function isBandwidthExceeded(): boolean {
  if (_bandwidthLimitBytesPerSec <= 0) return false;
  const now = Date.now();
  if (now - _bandwidthWindowStart > BANDWIDTH_WINDOW_MS) {
    _bandwidthWindowBytes = 0;
    _bandwidthWindowStart = now;
    return false;
  }
  const elapsed = (now - _bandwidthWindowStart) / 1000;
  const currentRate = elapsed > 0 ? _bandwidthWindowBytes / elapsed : 0;
  return currentRate >= _bandwidthLimitBytesPerSec;
}

function bandwidthGuard(req: Request, res: Response, next: Function): void {
  if (isBandwidthExceeded()) {
    res.status(503).set('Retry-After', '5').json({
      error: 'Bandwidth limit reached, try again shortly',
    });
    return;
  }
  next();
}

/**
 * Parse an HTTP Range header into start/end byte offsets.
 * Returns null for invalid or multi-range requests.
 */
function parseRange(rangeHeader: string, fileSize: number): { start: number; end: number } | null {
  const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;

  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

  if (start > end || start >= fileSize || end >= fileSize) return null;
  return { start, end };
}

/**
 * Stream IPFS content to an HTTP response with proper backpressure.
 * Supports full-file and Range (206) responses.
 */
function streamToResponse(
  ipfs: IPFSStorage,
  cid: string,
  req: Request,
  res: Response,
  opts: {
    fileSize: number;
    mimeType: string;
    filename: string;
    extraHeaders?: Record<string, string>;
  }
): void {
  const { fileSize, mimeType, filename, extraHeaders } = opts;
  const isStreamable = /^(video|audio)\//.test(mimeType);

  const commonHeaders: Record<string, string> = {
    'Content-Type': mimeType,
    'X-IPFS-CID': cid,
    'X-IPFS-Path': `/ipfs/${cid}`,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'X-IPFS-CID, X-IPFS-Path, Content-Range, Accept-Ranges, Content-Length',
    'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
    ...extraHeaders,
  };

  if (isStreamable) {
    commonHeaders['Accept-Ranges'] = 'bytes';
  }

  // HEAD request -- return headers only, no content
  if (req.method === 'HEAD') {
    res.set({ ...commonHeaders, 'Content-Length': fileSize.toString() });
    res.status(200).end();
    return;
  }

  const rangeHeader = req.headers.range;
  let offset: number | undefined;
  let length: number | undefined;

  if (rangeHeader && isStreamable) {
    const range = parseRange(rangeHeader, fileSize);
    if (!range) {
      res.status(416).set({ 'Content-Range': `bytes */${fileSize}` }).end();
      return;
    }
    offset = range.start;
    length = range.end - range.start + 1;

    res.status(206).set({
      ...commonHeaders,
      'Content-Length': length.toString(),
      'Content-Range': `bytes ${range.start}-${range.end}/${fileSize}`,
    });
  } else {
    res.status(200).set({
      ...commonHeaders,
      'Content-Length': fileSize.toString(),
    });
  }

  const bytesToServe = length ?? fileSize;
  trackCDNBandwidth(cid, bytesToServe);

  const ipfsStream = ipfs.getFileStream(cid, { offset, length });
  const readable = Readable.from(ipfsStream);

  pipeline(readable, res, (err) => {
    if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      logger.error(`[Public Gateway] Stream error for CID ${cid}:`, { error: err.message });
    }
  });
}

const DAG_MIME_TYPES: Record<string, string> = {
  '.mpd': 'application/dash+xml',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/MP2T',
  '.webm': 'video/webm',
  '.xml': 'application/xml',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

function mimeFromPath(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  return DAG_MIME_TYPES[ext] || 'application/octet-stream';
}

function isContentMissingError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('not found')
    || lower.includes('entry not found')
    || lower.includes('missing block')
    || lower.includes('no link named')
    || lower.includes('block was not found')
    || lower.includes('content not found')
    // FsBlockstore throws Node.js fs ENOENT when a block file isn't on disk:
    //   ENOENT: no such file or directory, open '.../ipfs/blocks/XX/...data'
    // That's the canonical "block missing locally" signal — without this
    // the gateway would 500 instead of auto-pinning from peers / the
    // configured public-gateway prefetch URL. v1.2.6 fix.
    || lower.includes('enoent')
    || lower.includes('no such file');
}

async function tryPinForPublicRequest(ipfs: IPFSStorage, cid: string, context: string): Promise<boolean> {
  try {
    const result = await ipfs.pinRemoteCID(cid, {
      timeoutMs: 45000,
      maxFiles: 10000,
    });
    if (result.success) {
      logger.info(`[Public Gateway] Auto-fetched CID for ${context}: ${cid} (${result.type}, ${result.size} bytes)`);
      // v1.2.7: clear any stale 'failed' / 'queued' / 'pinning' rows in
      // pinned_cids for this CID. Two pin paths exist on a PC2 node — the
      // ContentSeedingService (driven by buy events, gives up after ~5 min)
      // and this public-gateway auto-fetch (driven by gateway requests,
      // succeeds whenever the bytes are reachable). They didn't talk to
      // each other before, so a successful auto-fetch left the seeding
      // service's stale 'failed' row in the DB forever. Subsequent
      // /api/media/init calls would see that 'failed' status and bounce
      // the user with a misleading error — even though the bytes were
      // sitting right there in local IPFS cache. Mark complete now so the
      // playback path's pin-status check reflects reality.
      if (_dbRef) {
        try {
          _dbRef.updatePinStatus(cid, 'complete');
        } catch (e: any) {
          logger.debug(`[Public Gateway] Could not refresh pinned_cids for ${cid}: ${e?.message ?? 'unknown'}`);
        }
      }
      return true;
    }
    return false;
  } catch (error: any) {
    logger.debug(`[Public Gateway] Auto-fetch failed for ${context} CID ${cid}: ${error?.message || 'unknown error'}`);
    return false;
  }
}

interface DirectoryListingEntry {
  name: string;
  cid: string;
  size: number;
  type: string;
  url: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function encodePathSegments(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return '-';
  if (size < 1024) return `${size} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = size;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function normalizeDirectoryEntries(
  rootCid: string,
  currentPath: string,
  entries: Array<{ name: string; cid: string; size: number; type: string }>
): DirectoryListingEntry[] {
  const cleanPath = currentPath.replace(/^\/+|\/+$/g, '');
  const currentPrefix = cleanPath ? `${cleanPath}/` : '';

  return [...entries]
    .sort((a, b) => {
      const aIsDir = a.type === 'directory';
      const bIsDir = b.type === 'directory';
      if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map(entry => {
      const entryPath = `${currentPrefix}${entry.name}`;
      return {
        ...entry,
        url: `/ipfs/${encodeURIComponent(rootCid)}/${encodePathSegments(entryPath)}`,
      };
    });
}

function renderDirectoryListing(
  req: Request,
  res: Response,
  opts: {
    rootCid: string;
    resolvedCid: string;
    currentPath: string;
    entries: DirectoryListingEntry[];
  }
): void {
  const { rootCid, resolvedCid, currentPath, entries } = opts;
  const cleanPath = currentPath.replace(/^\/+|\/+$/g, '');
  const pathSuffix = cleanPath ? `/${cleanPath}` : '';
  const fullPath = `/ipfs/${rootCid}${pathSuffix}`;
  const displayPath = cleanPath ? `/${cleanPath}` : '/';
  const pathParts = cleanPath ? cleanPath.split('/').filter(Boolean) : [];
  const parentPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';
  const parentUrl = cleanPath
    ? (parentPath
      ? `/ipfs/${encodeURIComponent(rootCid)}/${encodePathSegments(parentPath)}`
      : `/ipfs/${encodeURIComponent(rootCid)}`)
    : null;

  const baseHeaders: Record<string, string> = {
    'X-IPFS-CID': resolvedCid,
    'X-IPFS-Root': rootCid,
    'X-IPFS-Path': fullPath,
    'X-IPFS-Directory': 'true',
    'Cache-Control': 'public, max-age=30',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'X-IPFS-CID, X-IPFS-Root, X-IPFS-Path, X-IPFS-Directory',
  };

  if (req.method === 'HEAD') {
    res.status(200).set({
      ...baseHeaders,
      'Content-Type': 'text/html; charset=utf-8',
    }).end();
    return;
  }

  const accepted = req.accepts(['html', 'json']);
  if (accepted === 'json') {
    res.status(200).set({
      ...baseHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    }).json({
      cid: rootCid,
      path: displayPath,
      isDirectory: true,
      parent: parentUrl,
      entries,
    });
    return;
  }

  const rows = entries.map(entry => {
    const typeLabel = entry.type === 'directory' ? 'dir' : 'file';
    const sizeLabel = entry.type === 'directory' ? '-' : formatBytes(entry.size);
    const suffix = entry.type === 'directory' ? '/' : '';
    return `<tr><td><a href="${entry.url}">${escapeHtml(entry.name)}${suffix}</a></td><td>${typeLabel}</td><td>${sizeLabel}</td></tr>`;
  }).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>IPFS Directory ${escapeHtml(displayPath)}</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: ui-monospace, Menlo, Consolas, monospace; margin: 24px; max-width: 920px; }
    h1 { margin: 0 0 6px 0; font-size: 20px; }
    .meta { margin: 0 0 18px 0; color: #666; font-size: 13px; word-break: break-all; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #ccc4; }
    a { text-decoration: none; }
    a:hover { text-decoration: underline; }
    .nav { margin: 0 0 10px 0; font-size: 14px; }
    .empty { color: #777; font-style: italic; }
  </style>
</head>
<body>
  <h1>Directory Listing</h1>
  <p class="meta">CID: ${escapeHtml(rootCid)}<br>Path: ${escapeHtml(displayPath)}</p>
  ${parentUrl ? `<p class="nav"><a href="${parentUrl}">../ parent directory</a></p>` : ''}
  ${entries.length === 0
    ? '<p class="empty">Directory is empty.</p>'
    : `<table><thead><tr><th>Name</th><th>Type</th><th>Size</th></tr></thead><tbody>${rows}</tbody></table>`}
</body>
</html>`;

  res.status(200).set({
    ...baseHeaders,
    'Content-Type': 'text/html; charset=utf-8',
  }).send(html);
}

/**
 * Handler for /ipfs/:cid/* routes — resolves sub-paths within UnixFS DAG
 * directories.  This is what makes DASH streaming work from local IPFS:
 *   GET /ipfs/<rootCID>/stream.mpd
 *   GET /ipfs/<rootCID>/video/seg-1.m4s
 */
function ipfsDAGPathHandler(ipfs: IPFSStorage | null, db: DatabaseManager) {
  return async (req: Request, res: Response) => {
    const { cid } = req.params;
    const subPath = req.params[0] || '';

    if (!subPath) {
      return ipfsCidHandler(ipfs, db)(req, res);
    }

    if (!ipfs || !ipfs.isReady()) {
      return res.status(503).json({ error: 'IPFS not available' });
    }

    try {
      let resolved = await ipfs.resolveDAGPath(cid, subPath);
      if (!resolved) {
        const fetched = await tryPinForPublicRequest(ipfs, cid, `DAG path ${cid}/${subPath}`);
        if (fetched) {
          resolved = await ipfs.resolveDAGPath(cid, subPath);
        }
      }
      if (!resolved) {
        return res.status(404).json({
          error: 'Path not found in DAG',
          rootCid: cid,
          path: subPath,
        });
      }

      if (resolved.type === 'directory') {
        let listing: Array<{ name: string; cid: string; size: number; type: string }>;
        try {
          listing = await ipfs.listDirectory(resolved.cid);
        } catch (listErr) {
          const listMessage = listErr instanceof Error ? listErr.message : String(listErr);
          if (isContentMissingError(listMessage)) {
            const fetched = await tryPinForPublicRequest(ipfs, cid, `directory listing ${cid}/${subPath}`);
            if (!fetched) {
              throw listErr;
            }
            listing = await ipfs.listDirectory(resolved.cid);
          } else {
            throw listErr;
          }
        }
        const entries = normalizeDirectoryEntries(
          cid,
          subPath,
          listing
        );
        return renderDirectoryListing(req, res, {
          rootCid: cid,
          resolvedCid: resolved.cid,
          currentPath: subPath,
          entries,
        });
      }

      const mimeType = mimeFromPath(subPath);
      const filename = subPath.split('/').pop() || cid;
      const fileSize = resolved.size;

      streamDAGToResponse(ipfs, cid, subPath, req, res, {
        fileSize,
        mimeType,
        filename,
        resolvedCid: resolved.cid,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (isContentMissingError(message)) {
        return res.status(404).json({
          error: 'Content not found',
          rootCid: cid,
          path: subPath,
          hint: 'This CID may not be pinned on this node',
        });
      }
      logger.error(`[Public Gateway] Error serving DAG path ${cid}/${subPath}:`, { error: message });
      res.status(500).json({ error: 'Failed to retrieve content' });
    }
  };
}

/**
 * Stream DAG sub-path content to an HTTP response with Range support.
 */
function streamDAGToResponse(
  ipfs: IPFSStorage,
  rootCid: string,
  subPath: string,
  req: Request,
  res: Response,
  opts: {
    fileSize: number;
    mimeType: string;
    filename: string;
    resolvedCid: string;
  }
): void {
  const { fileSize, mimeType, filename, resolvedCid } = opts;
  const isStreamable = /^(video|audio)\//.test(mimeType) || mimeType === 'application/dash+xml';

  const commonHeaders: Record<string, string> = {
    'Content-Type': mimeType,
    'X-IPFS-CID': resolvedCid,
    'X-IPFS-Root': rootCid,
    'X-IPFS-Path': `/ipfs/${rootCid}/${subPath}`,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'X-IPFS-CID, X-IPFS-Root, X-IPFS-Path, Content-Range, Accept-Ranges, Content-Length',
    'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
  };

  if (isStreamable) {
    commonHeaders['Accept-Ranges'] = 'bytes';
  }

  if (req.method === 'HEAD') {
    res.set({ ...commonHeaders, 'Content-Length': fileSize.toString() });
    res.status(200).end();
    return;
  }

  const rangeHeader = req.headers.range;
  let offset: number | undefined;
  let length: number | undefined;

  if (rangeHeader && isStreamable) {
    const range = parseRange(rangeHeader, fileSize);
    if (!range) {
      res.status(416).set({ 'Content-Range': `bytes */${fileSize}` }).end();
      return;
    }
    offset = range.start;
    length = range.end - range.start + 1;

    res.status(206).set({
      ...commonHeaders,
      'Content-Length': length.toString(),
      'Content-Range': `bytes ${range.start}-${range.end}/${fileSize}`,
    });
  } else {
    res.status(200).set({
      ...commonHeaders,
      'Content-Length': fileSize.toString(),
    });
  }

  const bytesToServe = length ?? fileSize;
  trackCDNBandwidth(rootCid, bytesToServe);

  const ipfsStream = ipfs.getDAGFileStream(rootCid, subPath, { offset, length });
  const readable = Readable.from(ipfsStream);

  pipeline(readable, res, (err) => {
    if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      logger.error(`[Public Gateway] DAG stream error for ${rootCid}/${subPath}:`, { error: err.message });
    }
  });
}

/**
 * Handler for /ipfs/:cid routes (GET and HEAD).
 */
function ipfsCidHandler(ipfs: IPFSStorage | null, db: DatabaseManager) {
  return async (req: Request, res: Response) => {
    const { cid, filename } = req.params;

    if (!ipfs || !ipfs.isReady()) {
      return res.status(503).json({ error: 'IPFS not available' });
    }

    const serveCid = async (): Promise<void> => {
      const metadata = db.getFileByCID(cid);
      if (!filename) {
        const inspected = await ipfs.inspectCID(cid);
        if (inspected.type === 'directory') {
          const rootEntries = normalizeDirectoryEntries(cid, '', await ipfs.listDirectory(inspected.cid));
          return renderDirectoryListing(req, res, {
            rootCid: cid,
            resolvedCid: inspected.cid,
            currentPath: '',
            entries: rootEntries,
          });
        }

        try {
          const rootEntries = normalizeDirectoryEntries(cid, '', await ipfs.listDirectory(cid));
          return renderDirectoryListing(req, res, {
            rootCid: cid,
            resolvedCid: cid,
            currentPath: '',
            entries: rootEntries,
          });
        } catch (dirErr) {
          const dirMessage = dirErr instanceof Error ? dirErr.message : String(dirErr);
          if (isContentMissingError(dirMessage)) {
            // Bubble up so outer handler can auto-pin and retry.
            throw dirErr;
          }
          // Not a directory CID — continue with file flow.
        }
      }

      if (metadata?.is_dir) {
        const entries = normalizeDirectoryEntries(cid, '', await ipfs.listDirectory(cid));
        return renderDirectoryListing(req, res, {
          rootCid: cid,
          resolvedCid: cid,
          currentPath: '',
          entries,
        });
      }

      const mimeType = metadata?.mime_type || 'application/octet-stream';
      const contentFilename = filename || metadata?.path?.split('/').pop() || cid;

      // Use DB size for non-Range requests (fast); only hit IPFS when needed
      const needsIpfsSize = !!req.headers.range || !metadata?.size;
      let fileSize: number;
      try {
        fileSize = needsIpfsSize
          ? await ipfs.getFileSize(cid)
          : metadata!.size;
      } catch (sizeError) {
        const sizeErrorMessage = sizeError instanceof Error ? sizeError.message : String(sizeError);
        if (sizeErrorMessage.includes('not a file') || sizeErrorMessage.includes('type: directory')) {
          const entries = normalizeDirectoryEntries(cid, '', await ipfs.listDirectory(cid));
          return renderDirectoryListing(req, res, {
            rootCid: cid,
            resolvedCid: cid,
            currentPath: '',
            entries,
          });
        }
        throw sizeError;
      }

      streamToResponse(ipfs, cid, req, res, {
        fileSize,
        mimeType,
        filename: contentFilename,
      });
    };

    try {
      return await serveCid();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (isContentMissingError(message)) {
        const fetched = await tryPinForPublicRequest(ipfs, cid, `CID request ${cid}`);
        if (fetched) {
          try {
            return await serveCid();
          } catch (retryError) {
            const retryMessage = retryError instanceof Error ? retryError.message : 'Unknown error';
            logger.warn(`[Public Gateway] Retry serve failed for CID ${cid} after auto-fetch: ${retryMessage}`);
          }
        }
        return res.status(404).json({
          error: 'Content not found',
          cid,
          hint: 'This CID is not pinned on this node',
        });
      }
      logger.error(`[Public Gateway] Error serving CID ${cid}:`, { error: message });
      res.status(500).json({ error: 'Failed to retrieve content' });
    }
  };
}

/**
 * Handler for /public/:wallet/* routes (GET and HEAD).
 */
function publicWalletHandler(ipfs: IPFSStorage | null, db: DatabaseManager) {
  return async (req: Request, res: Response) => {
    const { wallet } = req.params;
    const subPath = req.params[0] || '';
    const fullPath = `/${wallet}/Public${subPath ? '/' + subPath : ''}`;

    if (!ipfs || !ipfs.isReady()) {
      return res.status(503).json({ error: 'IPFS not available' });
    }

    try {
      const metadata = db.getFile(fullPath, wallet);
      if (!metadata) {
        return res.status(404).json({ error: 'File not found', path: fullPath });
      }
      if (!metadata.is_public) {
        return res.status(403).json({ error: 'Access denied', message: 'This file is not publicly accessible' });
      }

      // Directory listings are small JSON -- no streaming needed
      if (metadata.is_dir) {
        const files = db.getPublicFiles(wallet, fullPath);
        return res.json({
          path: fullPath,
          isDirectory: true,
          files: files.map(f => ({
            name: f.path.split('/').pop(),
            path: f.path.replace(`/${wallet}/Public`, ''),
            cid: f.ipfs_hash,
            size: f.size,
            mimeType: f.mime_type,
            isDirectory: f.is_dir,
            createdAt: f.created_at,
          })),
        });
      }

      if (!metadata.ipfs_hash) {
        return res.status(404).json({ error: 'File has no content' });
      }

      const mimeType = metadata.mime_type || 'application/octet-stream';
      const filename = metadata.path.split('/').pop() || 'file';

      // Use DB size for non-Range requests (fast); only hit IPFS when needed
      const needsIpfsSize = !!req.headers.range || !metadata.size;
      const fileSize = needsIpfsSize
        ? await ipfs.getFileSize(metadata.ipfs_hash)
        : metadata.size;

      streamToResponse(ipfs, metadata.ipfs_hash, req, res, {
        fileSize,
        mimeType,
        filename,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[Public Gateway] Error serving ${fullPath}:`, { error: message });
      res.status(500).json({ error: 'Failed to retrieve file' });
    }
  };
}

/**
 * Create the public gateway router
 */
export function createPublicRouter(
  db: DatabaseManager,
  filesystem: FilesystemManager,
  ipfs: IPFSStorage | null
): Router {
  const router = Router();
  _dbRef = db;

  // NOTE: Rate limiting is applied per-route below, not globally.
  // This prevents the rate limiter from affecting non-public routes
  // when this router is mounted at root level.

  /**
   * GET|HEAD /ipfs/:cid/<sub-path>
   *
   * Resolve a file within a UnixFS DAG directory.  This enables local DASH
   * streaming: /ipfs/<rootCID>/stream.mpd, /ipfs/<rootCID>/video/seg-1.m4s
   * Must be registered BEFORE the :filename? route so multi-segment paths match.
   */
  router.head('/ipfs/:cid/*', contentRateLimit, bandwidthGuard, ipfsDAGPathHandler(ipfs, db));
  router.get('/ipfs/:cid/*', contentRateLimit, bandwidthGuard, ipfsDAGPathHandler(ipfs, db));

  /**
   * GET|HEAD /ipfs/:cid
   * GET|HEAD /ipfs/:cid/:filename
   * 
   * Serve content directly by CID with streaming and Range request support.
   * HEAD returns headers (size, MIME, Accept-Ranges) without loading content.
   */
  router.head('/ipfs/:cid/:filename?', contentRateLimit, bandwidthGuard, ipfsCidHandler(ipfs, db));
  router.get('/ipfs/:cid/:filename?', contentRateLimit, bandwidthGuard, ipfsCidHandler(ipfs, db));

  /**
   * GET|HEAD /public/:wallet/*
   * 
   * Serve files from a user's /Public folder with streaming and Range support.
   * Only files marked as is_public=true are served.
   */
  router.head('/public/:wallet/*', contentRateLimit, publicWalletHandler(ipfs, db));
  router.get('/public/:wallet/*', contentRateLimit, publicWalletHandler(ipfs, db));

  /**
   * GET /api/public/list/:wallet
   * GET /api/public/list/:wallet/*
   * 
   * List all public files for a wallet with their CIDs.
   * Useful for discovery and indexing.
   */
  router.get('/api/public/list/:wallet', publicRateLimit, async (req: Request, res: Response) => {
    const { wallet } = req.params;
    const basePath = `/${wallet}/Public`;

    try {
      const files = db.getPublicFiles(wallet);

      res.json({
        wallet,
        basePath,
        totalFiles: files.length,
        files: files.map(f => ({
          name: f.path.split('/').pop(),
          path: f.path.replace(`/${wallet}/Public`, '') || '/',
          cid: f.ipfs_hash,
          size: f.size,
          mimeType: f.mime_type,
          isDirectory: f.is_dir,
          createdAt: f.created_at,
          // Include gateway URLs for convenience
          gatewayUrl: f.ipfs_hash ? `/ipfs/${f.ipfs_hash}` : null,
          publicUrl: `/public/${wallet}${f.path.replace(`/${wallet}/Public`, '')}`
        }))
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[Public Gateway] Error listing files for ${wallet}:`, { error: message });
      res.status(500).json({ error: 'Failed to list public files' });
    }
  });

  /**
   * GET /api/public/info/:cid
   * 
   * Get metadata for a CID (if we have it).
   * Returns file info without the content.
   */
  router.get('/api/public/info/:cid', publicRateLimit, async (req: Request, res: Response) => {
    const { cid } = req.params;

    try {
      const metadata = db.getFileByCID(cid);

      if (!metadata) {
        return res.status(404).json({ 
          error: 'CID not found in database',
          cid,
          hint: 'This CID may be pinned but not tracked, or not on this node'
        });
      }

      // Only expose info for public files
      if (!metadata.is_public) {
        return res.status(403).json({
          error: 'This content is not publicly accessible',
          cid
        });
      }

      res.json({
        cid,
        filename: metadata.path.split('/').pop(),
        size: metadata.size,
        mimeType: metadata.mime_type,
        isDirectory: metadata.is_dir,
        createdAt: metadata.created_at,
        gatewayUrl: `/ipfs/${cid}`,
        // Don't expose full path for privacy
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[Public Gateway] Error getting info for ${cid}:`, { error: message });
      res.status(500).json({ error: 'Failed to get CID info' });
    }
  });

  /**
   * GET /api/public/stats
   * 
   * Get public node statistics.
   */
  router.get('/api/public/stats', publicRateLimit, async (req: Request, res: Response) => {
    try {
      const stats = db.getPublicStats();
      
      res.json({
        nodeId: ipfs?.getNodeId() || null,
        publicFiles: stats.publicFileCount,
        totalPublicSize: stats.totalPublicSize,
        isGatewayEnabled: true,
        ipfsReady: ipfs?.isReady() || false
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[Public Gateway] Error getting stats:', { error: message });
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });

  /**
   * GET /api/public/network
   * 
   * Get network statistics (peers, mode, etc).
   */
  router.get('/api/public/network', publicRateLimit, async (req: Request, res: Response) => {
    try {
      if (!ipfs) {
        return res.status(503).json({ error: 'IPFS not available' });
      }

      const networkStats = await ipfs.getNetworkStats();
      const connectedPeers = await ipfs.getConnectedPeers();

      res.json({
        ...networkStats,
        peers: connectedPeers.slice(0, 20), // Limit to first 20 peers
        totalPeers: connectedPeers.length
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[Public Gateway] Error getting network stats:', { error: message });
      res.status(500).json({ error: 'Failed to get network stats' });
    }
  });

  /**
   * POST /api/pin/:cid
   * 
   * Pin a remote CID from the IPFS network and save to user's Pinned folder.
   * Used for marketplace purchases.
   * NOTE: This endpoint requires authentication.
   * 
   * Query params:
   *   - timeout: Timeout in seconds (default: 60)
   *   - maxFiles: Max files for directories (default: 1000)
   *   - filename: Custom filename (default: CID)
   */
  router.post('/api/pin/:cid', publicRateLimit, async (req: Request, res: Response) => {
    const { cid } = req.params;
    const timeoutSec = parseInt(req.query.timeout as string) || 60;
    const maxFiles = parseInt(req.query.maxFiles as string) || 1000;
    const customFilename = req.query.filename as string;
    const targetFolder = req.query.folder as string || 'Public'; // Default to Public, can be 'Pictures', 'Documents', etc.

    // Check if user is authenticated (via header or session)
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Pinning requires a valid auth token'
      });
    }

    // Get wallet address from auth token
    let walletAddress: string | null = null;
    const token = authHeader.replace('Bearer ', '');
    if (db) {
      const session = db.getSession(token);
      walletAddress = session?.wallet_address || null;
    }

    if (!ipfs || !ipfs.isReady()) {
      return res.status(503).json({ error: 'IPFS not available' });
    }

    try {
      const result = await ipfs.pinRemoteCID(cid, {
        timeoutMs: timeoutSec * 1000,
        maxFiles
      });
      
      // Save to user's folder if authenticated
      // Content is pinned in IPFS cache regardless of where file is saved
      let savedPath: string | null = null;
      let detectedMime: string | null = null;
      if (walletAddress && filesystem && result.success) {
        try {
          // Validate and sanitize folder name (only allow known folders)
          const allowedFolders = ['Public', 'Pictures', 'Documents', 'Desktop', 'Videos'];
          const folder = allowedFolders.includes(targetFolder) ? targetFolder : 'Public';
          const saveFolder = `/${walletAddress}/${folder}`;
          
          // Get content - use gateway content if available, otherwise fetch from IPFS
          let content: Buffer | null = null;
          if (result.content) {
            // Content came from gateway fallback
            content = Buffer.from(result.content);
            logger.info(`[Public Gateway] Using gateway-provided content (${content.length} bytes)`);
          } else {
            // Try to get from local IPFS using actual CID if different
            const cidToFetch = result.actualCid || cid;
            content = await ipfs.getFile(cidToFetch);
          }
          
          if (content) {
            // Detect file type from magic bytes
            const detectExtension = (buffer: Buffer): { ext: string; mime: string } => {
              if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
                return { ext: '.jpg', mime: 'image/jpeg' };
              }
              if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
                return { ext: '.png', mime: 'image/png' };
              }
              if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
                return { ext: '.gif', mime: 'image/gif' };
              }
              if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
                return { ext: '.webp', mime: 'image/webp' };
              }
              if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
                return { ext: '.pdf', mime: 'application/pdf' };
              }
              if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
                return { ext: '.zip', mime: 'application/zip' };
              }
              if (buffer[0] === 0x1F && buffer[1] === 0x8B) {
                return { ext: '.gz', mime: 'application/gzip' };
              }
              // Check for text/HTML/JSON
              const firstChars = buffer.slice(0, 100).toString('utf8').trim();
              if (firstChars.startsWith('<!DOCTYPE') || firstChars.startsWith('<html')) {
                return { ext: '.html', mime: 'text/html' };
              }
              if (firstChars.startsWith('{') || firstChars.startsWith('[')) {
                return { ext: '.json', mime: 'application/json' };
              }
              return { ext: '', mime: 'application/octet-stream' };
            };
            
            const { ext, mime } = detectExtension(content);
            detectedMime = mime;
            
            // Determine filename - use custom name or generate from CID
            let filename = customFilename || `ipfs-${cid.substring(0, 8)}`;
            // Always add extension if detected and filename doesn't have one
            if (ext && !filename.includes('.')) {
              filename += ext;
            }
            savedPath = `${saveFolder}/${filename}`;
            logger.info(`[Public Gateway] Saving to folder: ${folder}, path: ${savedPath}`);
            
            // Only mark as public if saving to Public folder
            const isPublic = folder === 'Public';
            await filesystem.writeFile(savedPath, content, walletAddress, { isPublic });
            logger.info(`[Public Gateway] Saved pinned content to ${savedPath} (${mime}, public: ${isPublic})`);
          }
        } catch (saveError: any) {
          logger.warn(`[Public Gateway] Failed to save to Public folder: ${saveError.message}`);
          // Don't fail the whole request, just note it wasn't saved
          savedPath = null;
        }
      }
      
      // Track pinned CID and announce to DHT for CDN participation
      if (walletAddress && db && result.success) {
        db.trackPinnedCID(cid, walletAddress, result.size, 'marketplace');
        if (ipfs.canAnnounce()) {
          ipfs.announceCID(cid).catch((e: any) =>
            logger.warn(`[Public Gateway] DHT announce failed for ${cid}: ${e.message}`)
          );
        }
      }

      res.json({
        success: true,
        cid: result.cid,
        type: result.type,
        size: result.size,
        files: result.files,
        timeMs: result.timeMs,
        savedPath,
        mimeType: detectedMime,
        message: savedPath 
          ? `Downloaded to your ${['Public', 'Pictures', 'Documents', 'Desktop', 'Videos'].includes(targetFolder) ? targetFolder : 'Public'} folder`
          : (result.type === 'directory' 
              ? `Directory pinned (${result.files} files) - stored in IPFS cache`
              : 'Content pinned - stored in IPFS cache')
      });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const errorType = error.type || 'UNKNOWN';
      
      // Map error types to HTTP status codes
      const statusMap: Record<string, number> = {
        [IPFSStorage.PinErrorType.PRIVATE_MODE]: 400,
        [IPFSStorage.PinErrorType.INVALID_CID]: 400,
        [IPFSStorage.PinErrorType.TIMEOUT]: 504,
        [IPFSStorage.PinErrorType.NOT_FOUND]: 404,
        [IPFSStorage.PinErrorType.NETWORK_ERROR]: 502,
        [IPFSStorage.PinErrorType.DIRECTORY_TOO_LARGE]: 413,
      };

      const status = statusMap[errorType] || 500;

      // User-friendly error messages
      const errorMessages: Record<string, string> = {
        [IPFSStorage.PinErrorType.PRIVATE_MODE]: 'Node is in private mode - remote pinning requires public or hybrid mode',
        [IPFSStorage.PinErrorType.INVALID_CID]: 'The provided CID is not valid',
        [IPFSStorage.PinErrorType.TIMEOUT]: `Could not find content within ${timeoutSec}s - it may not be available on the network`,
        [IPFSStorage.PinErrorType.NOT_FOUND]: 'Content not found - no peers on the network have this content',
        [IPFSStorage.PinErrorType.NETWORK_ERROR]: 'Network error while fetching content',
        [IPFSStorage.PinErrorType.DIRECTORY_TOO_LARGE]: `Directory has more than ${maxFiles} files - use maxFiles parameter to increase limit`,
      };

      const userMessage = errorMessages[errorType] || message;

      logger.error(`[Public Gateway] Failed to pin ${cid}:`, { 
        error: message, 
        type: errorType,
        status 
      });

      res.status(status).json({ 
        error: errorType,
        message: userMessage,
        cid
      });
    }
  });

  /**
   * DELETE /api/pin/:cid
   * 
   * Unpin a CID (allow garbage collection).
   */
  router.delete('/api/pin/:cid', publicRateLimit, async (req: Request, res: Response) => {
    const { cid } = req.params;

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!ipfs || !ipfs.isReady()) {
      return res.status(503).json({ error: 'IPFS not available' });
    }

    try {
      await ipfs.unpinFile(cid);
      res.json({ success: true, cid, message: 'Content unpinned' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[Public Gateway] Failed to unpin ${cid}:`, { error: message });
      res.status(500).json({ error: 'Failed to unpin content' });
    }
  });

  /**
   * GET /api/cdn/stats
   *
   * Returns CDN bandwidth statistics for this node.
   * Tracks bytes served, request count, and per-CID breakdown.
   */
  router.get('/api/cdn/stats', publicRateLimit, async (_req: Request, res: Response) => {
    const stats = getCDNStats();
    const uptimeMs = Date.now() - stats.startedAt;
    const topCIDs = Object.entries(stats.bySource)
      .sort(([, a], [, b]) => b.bytes - a.bytes)
      .slice(0, 20)
      .map(([cid, data]) => ({ cid, ...data }));

    const pinnedCount = db.getPinnedCIDs().length;
    const publicCount = db.getPublicCIDCount();

    let ipfsStats: { peerId: string | null; connectedPeers: number; mode: string } | null = null;
    if (ipfs && ipfs.isReady()) {
      const network = await ipfs.getNetworkStats();
      ipfsStats = {
        peerId: network.peerId,
        connectedPeers: network.connectedPeers,
        mode: network.mode,
      };
    }

    res.json({
      bytesServed: stats.bytesServed,
      requestCount: stats.requestCount,
      uptimeMs,
      pinnedCIDs: pinnedCount,
      publicCIDs: publicCount,
      topCIDs,
      ipfs: ipfsStats,
    });
  });

  return router;
}

export default createPublicRouter;
