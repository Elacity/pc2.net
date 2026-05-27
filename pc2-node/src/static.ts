import express, { Express, Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { existsSync, statSync } from 'fs';
import fs from 'fs';
import { readFile as readFileAsync } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import https from 'https';
import { isAPIRoute, isStaticAsset } from './utils/routes.js';
import { verifyAntiSnipeSession } from './api/access-control.js';
import { getNodeConfig } from './api/setup.js';
import { getBaseUrl } from './utils/urlUtils.js';
import { createLogger } from './utils/logger.js';
const log = createLogger('static');

// Data directory from environment or default
const DATA_DIR = process.env.PC2_DATA_DIR || './data';
const SETUP_COMPLETE_FILE = path.join(DATA_DIR, 'setup-complete');

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface StaticOptions {
  frontendPath: string;
  isProduction: boolean;
}

/**
 * Setup production-grade static file serving
 * 
 * Features:
 * - Proper MIME type detection
 * - Cache headers (different for assets vs HTML)
 * - SPA fallback (only for non-API routes)
 * - Error handling
 * - Security headers
 */
export function setupStaticServing(app: Express, options: StaticOptions): void {
  const { frontendPath, isProduction } = options;

  // Cookie parser (required for anti-snipe session cookies)
  app.use(cookieParser());

  // Verify frontend directory exists
  if (!existsSync(frontendPath)) {
    log.warn(`⚠️  Frontend directory not found: ${frontendPath}`);
    log.warn('   Static file serving will not work until frontend is built.');
    log.warn('   Run: npm run build:frontend');
  }

  // IMPORTANT: Register /apps/* route BEFORE express.static()
  // This ensures app HTML files are processed by our middleware for SDK injection
  // We'll define the route handler inline here to ensure it runs before static file serving
  
  // Handle /sdk/puter.dev.js - alias for the SDK (bundle.min.js loads this path in dev mode)
  app.get('/sdk/puter.dev.js', (req: Request, res: Response) => {
    res.redirect(301, '/puter.js/v2');
  });

  // Handle /puter.js/v2 - SDK file (must be served with correct MIME type)
  // MUST be before express.static() middleware to override default MIME type
  // If file doesn't exist locally, proxy to api.puter.com
  app.get('/puter.js/v2', async (req: Request, res: Response, next: NextFunction) => {
    const sdkPath = path.join(frontendPath, 'puter.js', 'v2');
    
    if (existsSync(sdkPath) && !statSync(sdkPath).isDirectory()) {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.sendFile(sdkPath);
      return;
    }
    
    // SDK file not found locally - proxy to api.puter.com
    log.warn(`⚠️  SDK file not found locally: ${sdkPath}, proxying to api.puter.com`);
    try {
      const httpsGet = (url: string): Promise<string> => {
        return new Promise((resolve, reject) => {
          https.get(url, (response) => {
            if (response.statusCode !== 200) {
              reject(new Error(`Failed to fetch: ${response.statusCode}`));
              return;
            }
            let data = '';
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => resolve(data));
            response.on('error', reject);
          }).on('error', reject);
        });
      };
      
      const sdkContent = await httpsGet('https://api.puter.com/puter.js/v2');
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache for proxied content
      res.send(sdkContent);
      return;
    } catch (error) {
      log.error('Failed to proxy SDK from api.puter.com:', error);
    }
    
    next();
  });

  // IMPORTANT: Register /apps/* route BEFORE express.static()
  // This ensures app HTML files are processed by our middleware for SDK injection
  // We'll define the route handler function here and register it before static middleware
  
  // Log all requests to help debug routing
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.includes('phoenix') || req.path.includes('terminal')) {
      log.debug(`[static.ts] 🔍 Request: ${req.method} ${req.path} (from ${req.get('referer') || 'direct'})`);
    }
    next();
  });

  // Serve static files with appropriate cache headers
  // IMPORTANT: Skip express.static() for /apps/* and /builtin/* paths
  // This ensures our route handlers (registered later) can process these paths
  const staticMiddleware = express.static(frontendPath, {
    // Cache control: long cache for assets, no cache for HTML
    setHeaders: (res: Response, filePath: string) => {
      const ext = path.extname(filePath).toLowerCase();
      
      // HTML files: no cache (always fresh for SPA)
      if (ext === '.html' || filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else if (isProduction) {
        // Production: long cache for assets (JS, CSS, images, fonts)
        const assetExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.ico'];
        if (assetExtensions.includes(ext)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          // Other files: moderate cache
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
      } else {
        // Development: no cache
        res.setHeader('Cache-Control', 'no-cache');
      }

      // Security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      
      // Content Security Policy - allow eval and external scripts for development
      // In production, this should be more restrictive
      if (!isProduction) {
        res.setHeader('Content-Security-Policy', 
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: wss: https:; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://js.puter.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://challenges.cloudflare.com; " +
          "style-src 'self' 'unsafe-inline' https:; " +
          "img-src 'self' data: blob: https:; " +
          "font-src 'self' data: https: moz-extension: chrome-extension:; " +
          "connect-src 'self' ws: wss: http: https:;"
        );
      }
    },
    etag: isProduction,
    lastModified: isProduction,
    maxAge: isProduction ? 31536000 : 0 // 1 year in production, 0 in dev
  });
  
  // IMPORTANT: Setup redirect MUST come BEFORE static file serving
  // This ensures fresh nodes show the setup wizard instead of serving index.html
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Only check for GET requests to prevent redirects on API calls
    if (req.method !== 'GET') {
      return next();
    }
    
    // Skip API routes, setup routes, static assets, and health checks
    if (
      req.path.startsWith('/api/') ||
      req.path.startsWith('/setup') ||
      req.path.startsWith('/health') ||
      req.path.startsWith('/version') ||
      req.path.startsWith('/particle-auth') ||
      req.path.startsWith('/auth/') ||
      req.path.startsWith('/socket.io') ||
      isStaticAsset(req.path)
    ) {
      return next();
    }
    
    // Check if setup is complete
    if (!existsSync(SETUP_COMPLETE_FILE)) {
      // Check if boson is enabled and username is not set
      const bosonService = req.app.locals.bosonService;
      const hasUsername = bosonService?.getUsernameService()?.hasUsername() || false;
      
      if (!hasUsername) {
        // Redirect to setup wizard
        log.info(`[Setup] Redirecting ${req.path} to /setup (needs username setup)`);
        return res.redirect('/setup');
      }
    }
    
    // Anti-snipe gate: Check if owner is set, if not require password
    const nodeConfig = getNodeConfig();
    if (!nodeConfig.ownerWallet && nodeConfig.antiSnipePasswordHash) {
      // Skip access-gate route to prevent redirect loop
      if (req.path.startsWith('/access-gate')) {
        return next();
      }
      
      // Check for valid session cookie
      const sessionToken = req.cookies?.antiSnipeSession;
      if (!sessionToken || !verifyAntiSnipeSession(sessionToken)) {
        log.info(`[AntiSnipe] Redirecting ${req.path} to /access-gate (password required)`);
        return res.redirect('/access-gate');
      }
    }
    
    next();
  });

  // Rewrite absolute-path asset requests from embedded dApps.
  // Apps loaded in iframes may reference assets with absolute paths (e.g. /images/foo.png)
  // which resolve to the PC2 origin root instead of the app's directory. This middleware
  // first checks the Referer header to identify the source app, then falls back to scanning
  // all installed apps (needed when sandboxed iframes strip the Referer).
  const installedAppsBase = path.resolve(process.env.PC2_DATA_DIR || path.join(process.cwd(), 'data'), 'installed-apps');
  const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico']);

  // Resolve absolute asset paths from embedded dApps back to the correct app directory.
  // Apps in iframes use <img src="/static/..."> or <img src="/images/..."> which resolve
  // to the PC2 root instead of the app's directory. This handler checks Referer first,
  // then falls back to scanning all installed apps.
  const resolveInstalledAppAsset = (req: Request, res: Response, next: NextFunction) => {
    const relativeAsset = decodeURIComponent(req.path.slice(1)); // strip leading /

    // Strategy 1: use Referer to identify the app
    const referer = req.headers.referer || '';
    const appMatch = referer.match(/\/(?:apps|installed-apps)\/([a-z0-9][a-z0-9-]*[a-z0-9])/);
    if (appMatch) {
      const appName = appMatch[1];
      const assetPath = path.resolve(installedAppsBase, appName, relativeAsset);
      if (assetPath.startsWith(path.resolve(installedAppsBase, appName) + path.sep) && existsSync(assetPath)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.sendFile(assetPath);
      }
    }

    // Strategy 2: scan installed apps for the asset (fallback when Referer is absent)
    try {
      const apps = fs.readdirSync(installedAppsBase, { withFileTypes: true });
      for (const entry of apps) {
        if (!entry.isDirectory()) continue;
        const candidate = path.resolve(installedAppsBase, entry.name, relativeAsset);
        if (candidate.startsWith(path.resolve(installedAppsBase, entry.name) + path.sep) && existsSync(candidate)) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          return res.sendFile(candidate);
        }
      }
    } catch { /* installed-apps dir may not exist yet */ }

    next();
  };

  app.get('/images/*', (req: Request, res: Response, next: NextFunction) => {
    const ext = path.extname(req.path).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) return next();
    resolveInstalledAppAsset(req, res, next);
  });

  app.get('/static/*', resolveInstalledAppAsset);
  app.get('/fonts/*', resolveInstalledAppAsset);

  // RPC proxy for embedded dApps (e.g. Glide Finance)
  // Features: response caching with per-method TTLs, fallback RPC endpoints
  const ESC_RPC_URLS = [
    'https://api.elastos.io/eth',
    'https://api.elastos.io/esc',
    'https://rpc.glidefinance.io',
  ];

  // Base mainnet RPC fallback list.
  // Used by `/api/rpc/base` to shield the Particle iframe's `eth_getCode`
  // smart-account-deployment probe AND the Elacity Market's AuthorityGateway
  // read burst (sellersOf + listings + balanceOf on every asset detail open)
  // from the public `mainnet.base.org` rate limiter.
  //
  // Ordering (first succeeds, rest are fallbacks):
  //   1. llamarpc — ~300 req/min, very reliable, generous read budget
  //   2. publicnode — ~200 req/min, geo-distributed, good uptime
  //   3. Ankr public — ~100 req/min, wide geo coverage
  //   4. BlockPI public — ~100 req/min, Asia-Pacific priority
  //   5. mainnet.base.org (Coinbase official) — tight ~60 req/min, LAST
  //
  // mainnet.base.org was the first entry until 2026-04-28 when user
  // reports of intermittent "price not showing" traced back to its throttle
  // saturating and our JSON-wrapped-error fallback logic (prior to
  // a3c599d6c) never failing over. With the fallback fix AND this reorder,
  // most reads now hit llamarpc first and `mainnet.base.org` is only used
  // if all three alternatives are down simultaneously (vanishingly rare).
  //
  // SUPERNODE_RPC_URLS (comma-separated env var) prepends authoritative
  // supernode-backed endpoints ahead of the public community RPCs. When the
  // supernode proxies are deployed (SUPERNODE-RPC-PROXY task), operators flip
  // the env var on and no code change is required. The existing rate-limit /
  // HTTP-error fallback logic transparently rolls to the public RPCs if any
  // supernode URL misbehaves, so adding them at the front of the list is
  // zero-risk.
  const supernodeRpcUrlsEnv = (process.env.SUPERNODE_RPC_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const BASE_RPC_URLS = [
    ...supernodeRpcUrlsEnv,
    'https://base-rpc.publicnode.com',
    'https://rpc.ankr.com/base',
    'https://base.blockpi.network/v1/rpc/public',
    'https://mainnet.base.org',
  ];
  if (supernodeRpcUrlsEnv.length > 0) {
    log.info(`[rpc-proxy] ${supernodeRpcUrlsEnv.length} supernode RPC endpoint(s) prepended to BASE_RPC_URLS`);
  }

  // Per-method cache TTLs (milliseconds). Methods not listed are not cached.
  //
  // `eth_call` is parameterized by (to, data) so the cache key already
  // uniquely identifies each call. 2 seconds = ~1 Base block — long enough
  // to deduplicate the rapid re-open burst (renderOpTypeBadge fires
  // sellersOf + N × listings on EVERY asset detail open, plus balanceOf,
  // plus opType checks; 8-12 reads per click), short enough that listing
  // state changes (cancel / new seller) surface within one block. The
  // client-side wallet.js cache (4defea25c) is 30 s and sits on top of
  // this server-side cache — session cache hits first, then proxy cache
  // backstops any request that escapes it (e.g. from a different tab or
  // a fresh iframe instance after app open).
  const RPC_CACHE_TTLS: Record<string, number> = {
    'eth_chainId': 3600000,        // 1 hour (never changes)
    'net_version': 3600000,        // 1 hour
    'eth_gasPrice': 5000,          // 5s (updates per block)
    'eth_blockNumber': 5000,       // 5s
    'eth_getBlockByNumber': 30000, // 30s (immutable once confirmed)
    'eth_getBlockByHash': 60000,   // 60s (immutable)
    'eth_getCode': 300000,         // 5 min (rarely changes)
    'eth_call': 2000,              // 2s — dedupe read bursts within a block
  };

  const rpcCache = new Map<string, { data: any; expires: number }>();
  let highestBlockSeen = 0;

  // `chainKey` namespaces the cache so ESC (`eth_chainId` = 0x14) and Base
  // (`eth_chainId` = 0x2105) don't collide on identical (method, params).
  function getRpcCacheKey(chainKey: string, method: string, params: any[]): string {
    return `${chainKey}:${method}:${JSON.stringify(params)}`;
  }

  function getCachedRpcResponse(chainKey: string, method: string, params: any[]): any | null {
    const ttl = RPC_CACHE_TTLS[method];
    if (!ttl) return null;
    const key = getRpcCacheKey(chainKey, method, params);
    const entry = rpcCache.get(key);
    if (entry && Date.now() < entry.expires) return entry.data;
    if (entry) rpcCache.delete(key);
    return null;
  }

  function setCachedRpcResponse(chainKey: string, method: string, params: any[], data: any): void {
    const ttl = RPC_CACHE_TTLS[method];
    if (!ttl) return;

    if (method === 'eth_blockNumber' && data?.result) {
      const blockNum = parseInt(data.result, 16);
      if (blockNum < highestBlockSeen) return;
      highestBlockSeen = blockNum;
    }

    // Don't cache `eth_getCode` "contract not deployed" replies — this is a
    // transient state that flips the moment the user deploys, and a stale
    // `0x` would cause the Particle iframe to re-attempt deployment after a
    // successful deploy (wasted UserOp). `0x` / `"0x"` both observed in the
    // wild depending on RPC provider.
    if (method === 'eth_getCode') {
      const result = data?.result;
      if (typeof result === 'string' && (result === '0x' || result === '0x0')) {
        return;
      }
    }

    const key = getRpcCacheKey(chainKey, method, params);
    rpcCache.set(key, { data, expires: Date.now() + ttl });
    if (rpcCache.size > 500) {
      const now = Date.now();
      for (const [k, v] of rpcCache) {
        if (now >= v.expires) rpcCache.delete(k);
      }
    }
  }

  // Shared JSON-RPC proxy handler: tries `rpcUrls` in order, caches successful
  // responses under `chainKey`, returns 502 if every upstream fails.
  // Base's public RPC (mainnet.base.org) returns HTTP 200 with a JSON-wrapped
  // rpc error for transport-level throttling, e.g.
  //   { error: { message: "rate-limited until QuantaInstant(Nanos(...))" } }
  // We must treat these as transport failures and fall over to the next RPC
  // in the list, NOT forward them as-is. Otherwise our llamarpc / publicnode
  // fallbacks never get used and every read stalls on a single throttled
  // upstream (observed 2026-04-28 during mint+buy burst: price section
  // flickered, sellersOf/listings back-fill silently failed).
  //
  // Guard: contract reverts are also JSON errors but carry a `data` hex
  // string or a `code` like 3 with an "execution reverted" message — those
  // are legitimate, per-tx responses and must NOT trigger a fallback (that
  // would mask the real revert and spam the fallback RPCs).
  function isTransportRateLimit(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const err = (data as { error?: { message?: string; data?: unknown } }).error;
    if (!err || typeof err.message !== 'string') return false;
    if (err.data !== undefined) return false;
    const m = err.message.toLowerCase();
    return (
      m.includes('rate-limit') ||
      m.includes('rate limit') ||
      m.includes('too many requests') ||
      m.includes('429')
    );
  }

  async function handleJsonRpcProxy(
    req: Request,
    res: Response,
    chainKey: string,
    rpcUrls: string[],
  ): Promise<void> {
    const rpcReq = req.body;
    const method = rpcReq?.method;
    const params = rpcReq?.params ?? [];

    const cached = getCachedRpcResponse(chainKey, method, params);
    if (cached) {
      res.json({ ...cached, id: rpcReq?.id ?? null });
      return;
    }

    const body = JSON.stringify(rpcReq);
    let lastError: string | null = null;

    for (const rpcUrl of rpcUrls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const upstream = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!upstream.ok) {
          lastError = `${rpcUrl}: HTTP ${upstream.status}`;
          continue;
        }

        const data = await upstream.json();

        if (isTransportRateLimit(data)) {
          const rlMsg = (data as { error?: { message?: string } }).error?.message ?? 'unknown';
          lastError = `${rpcUrl}: rate-limited (${rlMsg})`;
          log.info(`[rpc-proxy] ${chainKey} ${method ?? '?'} rate-limited on ${rpcUrl}, trying next fallback`);
          continue;
        }

        if (data && !data.error) {
          setCachedRpcResponse(chainKey, method, params, data);
        }

        res.json(data);
        return;
      } catch (err: any) {
        lastError = `${rpcUrl}: ${err.message}`;
      }
    }

    res.status(502).json({
      jsonrpc: '2.0',
      id: rpcReq?.id ?? null,
      error: { code: -32603, message: `All ${chainKey.toUpperCase()} RPCs failed: ${lastError}` },
    });
  }

  app.post('/api/rpc/esc', (req, res) => handleJsonRpcProxy(req, res, 'esc', ESC_RPC_URLS));

  // Base mainnet JSON-RPC proxy.
  // Exists to silence `mainnet.base.org` 429s from the Particle iframe's
  // smart-account deployment probe (see `packages/particle-auth/.../ParticleNetworkContext.tsx`
  // lines ~814, ~988). Rewritten-to transparently by the interceptor script
  // injected by the `/particle-auth` route handler below.
  app.post('/api/rpc/base', (req, res) => handleJsonRpcProxy(req, res, 'base', BASE_RPC_URLS));

  // IMPORTANT: Register /apps/* route BEFORE the static middleware wrapper
  // Express checks app.get() routes before app.use() middleware, but only if registered first
  // The route handler function (appsRouteHandler) is defined later (around line 374) as a function declaration
  // Function declarations are hoisted, so we can register the route here even though the handler is defined below
  app.get('/apps/*', appsRouteHandler);
  app.get('/builtin/*', appsRouteHandler); // Also handle builtin apps (phoenix, terminal) that use BUILTIN_PREFIX

  // Serve installed dApps from data/installed-apps/<name>/
  app.get('/installed-apps/*', async (req: Request, res: Response, next: NextFunction) => {
    const dataDir = process.env.PC2_DATA_DIR || path.join(process.cwd(), 'data');
    const installedAppsDir = path.resolve(dataDir, 'installed-apps');
    const relativePath = decodeURIComponent(req.path.replace('/installed-apps/', ''));

    // Extract app name (first path segment) and resolve full path
    const appName = relativePath.split('/')[0];
    if (!appName || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(appName)) {
      res.status(400).send('Invalid app name');
      return;
    }

    const filePath = path.resolve(installedAppsDir, relativePath);
    const appDir = path.resolve(installedAppsDir, appName);

    // Security: resolved path must be strictly within this app's directory
    if (!filePath.startsWith(appDir + path.sep) && filePath !== appDir) {
      res.status(403).send('Forbidden');
      return;
    }

    if (!existsSync(filePath)) {
      // SPA fallback: serve the app's index.html for extensionless paths
      // so client-side routers (React Router, Vue Router, etc.) work correctly
      const appIndexPath = path.resolve(installedAppsDir, appName, 'index.html');
      if (existsSync(appDir) && existsSync(appIndexPath) && !path.extname(relativePath)) {
        const bosonService = req.app?.locals?.bosonService;
        const baseUrl = getBaseUrl(req, bosonService);
        let html = await readFileAsync(appIndexPath, 'utf-8');
        const walletShimTag = `<script src="${baseUrl}/pc2-wallet-provider.js?v=20260421a"></script>`;
        html = html.replace(/<head[^>]*>/i, (match: string) => `${match}\n    ${walletShimTag}`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.type('html').send(html);
        return;
      }
      return next();
    }
    const appInstallService = req.app?.locals?.appInstallService;
    if (appInstallService) {
      const installedApp = appInstallService.get(appName);
      if (installedApp) {
        try {
          const requirements = JSON.parse(installedApp.requirements_json);
          if (requirements?.headers?.includes('cross-origin-isolation')) {
            res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          }
        } catch { /* ignore parse errors */ }
      }
    }

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    // Inject wallet provider shim into HTML files
    if (filePath.endsWith('.html')) {
      const bosonService = req.app?.locals?.bosonService;
      const baseUrl = getBaseUrl(req, bosonService);
      let html = await readFileAsync(filePath, 'utf-8');
      const walletShimTag = `<script src="${baseUrl}/pc2-wallet-provider.js?v=20260421a"></script>`;
      html = html.replace(/<head[^>]*>/i, (match: string) => `${match}\n    ${walletShimTag}`);
      res.type('html').send(html);
      return;
    }

    res.sendFile(filePath);
  });

  // Wrap static middleware to skip /apps/*, /builtin/*, and /installed-apps/* paths
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/apps/') || req.path.startsWith('/builtin/') || req.path.startsWith('/installed-apps/')) {
      log.debug(`[static.ts] ⏭️  Skipping express.static() for ${req.path} - will be handled by route`);
      return next(); // Skip static file serving, continue to route handlers
    }
    // For other paths, use the static middleware
    staticMiddleware(req, res, next);
  });

  // Handle /dist/* paths - serve from frontend root (frontend expects /dist/bundle.min.css but files are at root)
  app.get('/dist/*', (req: Request, res: Response, next: NextFunction) => {
    const filePath = req.path.replace('/dist/', ''); // Remove /dist/ prefix
    const fullPath = path.join(frontendPath, filePath);
    
    if (existsSync(fullPath) && !statSync(fullPath).isDirectory()) {
      // Set correct MIME type based on extension
      const ext = path.extname(fullPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.ico': 'image/x-icon'
      };
      
      if (mimeTypes[ext]) {
        res.setHeader('Content-Type', mimeTypes[ext]);
      }
      
      res.sendFile(fullPath);
      return;
    }
    
    // File not found, continue to next handler
    next();
  });
  
  // Handle /dist/* paths - redirect to root (frontend expects /dist/bundle.min.css but files are at root)
  app.get('/dist/*', (req: Request, res: Response, next: NextFunction) => {
    const requestedPath = req.path;
    // Remove /dist prefix and serve from root
    const actualPath = requestedPath.replace(/^\/dist\//, '/');
    const filePath = path.join(frontendPath, actualPath);
    
    if (existsSync(filePath)) {
      res.sendFile(filePath, (err) => {
        if (err) {
          log.error(`Error serving ${actualPath}:`, err);
          return next();
        }
      });
    } else {
      // File doesn't exist, continue to next handler
      next();
    }
  });

  // Particle Auth route - must come BEFORE SPA fallback
  app.get('/particle-auth', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Try multiple possible locations for particle-auth
      // __dirname in compiled code will be dist/, so go up to project root
      const projectRoot = path.resolve(__dirname, '../..');
      const possiblePaths = [
        path.join(frontendPath, 'particle-auth', 'index.html'),
        path.join(projectRoot, 'src/particle-auth/index.html'),
        path.join(process.cwd(), 'src/particle-auth/index.html'),
        path.join(process.cwd(), '../../src/particle-auth/index.html'),
        // Development: check packages/particle-auth/dist (before build copies to src/particle-auth)
        path.join(projectRoot, 'packages/particle-auth/dist/index.html'),
        path.join(process.cwd(), '../../packages/particle-auth/dist/index.html'),
      ];
      
      let particleAuthPath: string | null = null;
      for (const possiblePath of possiblePaths) {
        const normalizedPath = path.normalize(possiblePath);
        if (existsSync(normalizedPath)) {
          particleAuthPath = normalizedPath;
          log.info(`[Particle Auth]: ✅ Found at: ${particleAuthPath}`);
          break;
        }
      }
      
      if (!particleAuthPath) {
        log.error(`[Particle Auth]: ❌ Not found in any of these locations:`, possiblePaths);
        return res.status(404).json({ 
          error: 'Particle Auth not found',
          message: 'Please ensure particle-auth is built and available',
          checkedPaths: possiblePaths
        });
      }
      
      let html: string;
      try {
        html = await readFileAsync(particleAuthPath, 'utf8');
      } catch (readError) {
        log.error(`[Particle Auth]: ❌ Error reading file:`, readError);
        return res.status(500).json({ 
          error: 'Failed to read Particle Auth file',
          message: readError instanceof Error ? readError.message : 'Unknown error'
        });
      }
        
      // Extract API origin from URL params, respecting reverse proxy headers
      // Get bosonService from app.locals for public URL resolution via Active Proxy
      const bosonService = req.app?.locals?.bosonService;
      let apiOrigin: string;
      try {
        const fullUrl = getBaseUrl(req, bosonService) + req.originalUrl;
        const url = new URL(fullUrl);
        apiOrigin = url.searchParams.get('api_origin') || getBaseUrl(req, bosonService);
      } catch (urlError) {
        log.error(`[Particle Auth]: ❌ Error parsing URL:`, urlError);
        apiOrigin = getBaseUrl(req, bosonService);
      }
      
      // Inject API origin script (same as mock server)
      // Also rewrites `https://mainnet.base.org` -> `${currentOrigin}/api/rpc/base`
      // so the Particle SDK's public-RPC traffic (both the explicit
      // `eth_getCode` probes in our wrapper code AND viem's internal RPC
      // transport called from inside `createTransferTransaction`) goes through
      // our cached, multi-fallback proxy instead of hammering the
      // rate-limited public Base RPC (429 during rapid polling).
      //
      // The interceptor must handle all three argument shapes that modern
      // SDKs pass to `fetch`: raw string URLs (our wrapper code), `Request`
      // objects (viem's HTTP transport does `new Request(url, opts)` before
      // calling fetch), and `URL` objects. `Request.url` is read-only, so
      // string-assignment to it silently no-ops — we must clone the Request
      // with the rewritten URL.
      const apiOriginScript = `
    <script>
        (function() {
            window.PUTER_API_ORIGIN = ${JSON.stringify(apiOrigin)};
            console.log('[Particle Auth]: ✅ API origin set to:', window.PUTER_API_ORIGIN);
            
            const currentOrigin = window.location.origin;
            const apiPuterPattern = /https?:\\/\\/api\\.puter\\.[^\\/:]+(?:\\:\\d+)?/gi;
            const baseMainnetPattern = /https?:\\/\\/mainnet\\.base\\.org(?:\\:\\d+)?/gi;
            const baseProxyUrl = currentOrigin + '/api/rpc/base';
            
            function rewriteUrlString(s) {
                if (typeof s !== 'string') return s;
                if (s.includes('api.puter.')) return s.replace(apiPuterPattern, currentOrigin);
                if (s.includes('mainnet.base.org')) return s.replace(baseMainnetPattern, baseProxyUrl);
                return s;
            }
            
            const originalFetch = window.fetch;
            window.fetch = function(...args) {
                const input = args[0];
                if (typeof input === 'string') {
                    args[0] = rewriteUrlString(input);
                } else if (typeof Request !== 'undefined' && input instanceof Request) {
                    const rewritten = rewriteUrlString(input.url);
                    if (rewritten !== input.url) {
                        args[0] = new Request(rewritten, input);
                    }
                } else if (typeof URL !== 'undefined' && input instanceof URL) {
                    const rewritten = rewriteUrlString(input.href);
                    if (rewritten !== input.href) {
                        args[0] = rewritten;
                    }
                } else if (input && typeof input === 'object' && typeof input.url === 'string') {
                    // Legacy {url, ...} descriptor
                    const rewritten = rewriteUrlString(input.url);
                    if (rewritten !== input.url) {
                        try { input.url = rewritten; } catch { args[0] = rewritten; }
                    }
                }
                return originalFetch.apply(this, args);
            };
            
            const originalXHROpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                if (typeof url === 'string') {
                    url = rewriteUrlString(url);
                } else if (typeof URL !== 'undefined' && url instanceof URL) {
                    url = rewriteUrlString(url.href);
                }
                return originalXHROpen.call(this, method, url, ...rest);
            };
            
            window.addEventListener('message', function(event) {
                if (event.origin !== window.location.origin) return;
                if (event.data && event.data.type === 'puter-api-origin') {
                    window.PUTER_API_ORIGIN = event.data.apiOrigin;
                }
            });
        })();
    </script>
`;
      
      html = html.replace(/<head[^>]*>/i, (match: string) => `${match}${apiOriginScript}`);
      
      if (!isProduction) {
        res.setHeader('Content-Security-Policy', 
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: wss: https:; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://js.puter.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://challenges.cloudflare.com; " +
          "style-src 'self' 'unsafe-inline' https:; " +
          "img-src 'self' data: blob: https:; " +
          "font-src 'self' data: https: moz-extension: chrome-extension:; " +
          "connect-src 'self' ws: wss: http: https:;"
        );
      }
      
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(html);
      return;
    } catch (error) {
      log.error(`[Particle Auth]: ❌ Unexpected error:`, error);
      return res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Particle Auth assets
  app.get('/particle-auth/assets/*', (req: Request, res: Response, next: NextFunction) => {
    const assetPath = req.path.replace('/particle-auth', '');
    const projectRoot = path.resolve(__dirname, '../..');
    const possiblePaths = [
      path.join(frontendPath, 'particle-auth', assetPath),
      path.join(projectRoot, 'src/particle-auth', assetPath),
      path.join(process.cwd(), 'src/particle-auth', assetPath),
      path.join(process.cwd(), '../../src/particle-auth', assetPath),
      // Development: check packages/particle-auth/dist
      path.join(projectRoot, 'packages/particle-auth/dist', assetPath),
      path.join(process.cwd(), '../../packages/particle-auth/dist', assetPath),
    ];
    
    for (const possiblePath of possiblePaths) {
      const normalizedPath = path.normalize(possiblePath);
      if (existsSync(normalizedPath)) {
        res.sendFile(normalizedPath);
        return;
      }
    }
    
    log.warn(`[Particle Auth]: Asset not found: ${assetPath}`);
    next();
  });

  // Serve apps from src/backend/apps/
  // NOTE: This route handler function is defined here, but it's registered BEFORE express.static() above (around line 151)
  // Express checks app.get() routes before app.use() middleware, so this will be checked first
  // The route registration was moved to before the static middleware wrapper to ensure proper order
  // We use a function declaration (not const) so it can be hoisted and registered before it's defined
  async function appsRouteHandler(req: Request, res: Response, next: NextFunction) {
    // Handle both /apps/* and /builtin/* paths
    const isBuiltin = req.path.startsWith('/builtin/');
    const isApps = req.path.startsWith('/apps/');
    log.debug(`[static.ts] 📱 ${isBuiltin ? '/builtin/*' : '/apps/*'} route hit! Path: ${req.path}, Full URL: ${req.url}`);
    log.debug(`[static.ts] 📱 Request method: ${req.method}`);
    log.debug(`[static.ts] 📱 This route should process app HTML files`);
    const appPath = isBuiltin ? req.path.replace('/builtin/', '') : req.path.replace('/apps/', '');
    log.debug(`[static.ts] 📱 Extracted appPath: ${appPath}`);
    const projectRoot = path.resolve(__dirname, '../..');
    
    log.debug(`[static.ts] 📦 Serving app: ${appPath} (full path: ${req.path})`);
    
    // Special handling for terminal app (located in src/terminal/ instead of src/backend/apps/terminal/)
    const isTerminal = appPath.startsWith('terminal/') || appPath === 'terminal' || appPath === 'terminal/index.html';
    const terminalRelativePath = isTerminal ? appPath.replace(/^terminal\/?/, '') || 'index.html' : null;
    
    // Special handling for phoenix app (located in src/phoenix/ instead of src/backend/apps/phoenix/)
    const isPhoenix = appPath.startsWith('phoenix/') || appPath === 'phoenix' || appPath === 'phoenix/index.html';
    const phoenixRelativePath = isPhoenix ? appPath.replace(/^phoenix\/?/, '') || 'index.html' : null;
    
    // Special handling for calculator app (located in frontend/apps/calculator/)
    const isCalculator = appPath.startsWith('calculator/') || appPath === 'calculator' || appPath === 'calculator/index.html';
    const calculatorRelativePath = isCalculator ? appPath.replace(/^calculator\/?/, '') || 'index.html' : null;
    
    if (isPhoenix) {
      log.debug(`[static.ts] 🐦 Phoenix detected! appPath: ${appPath}, phoenixRelativePath: ${phoenixRelativePath}`);
    }
    
    if (isCalculator) {
      log.debug(`[static.ts] 🧮 Calculator detected! appPath: ${appPath}, calculatorRelativePath: ${calculatorRelativePath}`);
    }
    
    const dataDir = process.env.PC2_DATA_DIR || path.join(process.cwd(), 'data');
    const possiblePaths = [
      // Installed dApps (highest priority - user-installed / bundled apps)
      path.join(dataDir, 'installed-apps', appPath),
      // Frontend apps path (for calculator and other new apps)
      path.join(projectRoot, 'frontend/apps', appPath),
      path.join(process.cwd(), 'frontend/apps', appPath),
      // Standard app paths
      path.join(projectRoot, 'src/backend/apps', appPath),
      path.join(process.cwd(), 'src/backend/apps', appPath),
      path.join(process.cwd(), '../../src/backend/apps', appPath),
      // Terminal app special paths (if it's the terminal app)
      // Try dist/ first (built version), then assets/ (source)
      ...(isTerminal && terminalRelativePath ? [
        path.join(projectRoot, 'src/terminal/dist', terminalRelativePath),
        path.join(process.cwd(), 'src/terminal/dist', terminalRelativePath),
        path.join(process.cwd(), '../../src/terminal/dist', terminalRelativePath),
        path.join(projectRoot, 'src/terminal/assets', terminalRelativePath),
        path.join(process.cwd(), 'src/terminal/assets', terminalRelativePath),
        path.join(process.cwd(), '../../src/terminal/assets', terminalRelativePath),
      ] : []),
      // Phoenix app special paths (if it's the phoenix app)
      // Try dist/ first (built version), then assets/ (source)
      ...(isPhoenix && phoenixRelativePath ? [
        path.join(projectRoot, 'src/phoenix/dist', phoenixRelativePath),
        path.join(process.cwd(), 'src/phoenix/dist', phoenixRelativePath),
        path.join(process.cwd(), '../../src/phoenix/dist', phoenixRelativePath),
        path.join(projectRoot, 'src/phoenix/assets', phoenixRelativePath),
        path.join(process.cwd(), 'src/phoenix/assets', phoenixRelativePath),
        path.join(process.cwd(), '../../src/phoenix/assets', phoenixRelativePath),
      ] : [])
    ];
    
    for (const possiblePath of possiblePaths) {
      const normalizedPath = path.normalize(possiblePath);
      if (existsSync(normalizedPath)) {
        // Determine MIME type based on file extension
        const ext = path.extname(normalizedPath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.json': 'application/json'
        };
        
        if (mimeTypes[ext]) {
          res.setHeader('Content-Type', mimeTypes[ext]);
        }

        if (!isProduction) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
        
        // Special handling for app HTML files - inject correct SDK URL
        // This applies to all apps (terminal, phoenix, player, viewer, pdf, editor, etc.)
        if (ext === '.html') {
          log.debug(`[static.ts] 📄 Processing HTML file: ${normalizedPath}, isPhoenix: ${isPhoenix}, isTerminal: ${isTerminal}, isCalculator: ${isCalculator}`);
          // Use getBaseUrl to correctly handle Active Proxy (which may not preserve Host header)
          const bosonService = req.app?.locals?.bosonService;
          const baseUrl = getBaseUrl(req, bosonService);
          const sdkUrl = `${baseUrl}/puter.js/v2`;
          let htmlContent = await readFileAsync(normalizedPath, 'utf8');
          // Replace any hardcoded SDK URL with the local server's SDK URL
          // This ensures apps work with PC2 node's local SDK
          htmlContent = htmlContent.replace(/https?:\/\/[^'"]*\/puter\.js\/v2/g, sdkUrl);
          log.debug(`[static.ts] ✅ SDK URL replaced in HTML`);
          
          // Inject PC2 wallet provider shim into app HTML
          // This creates window.ethereum inside sandboxed iframes via postMessage bridge
          const walletShimTag = `<script src="${baseUrl}/pc2-wallet-provider.js?v=20260421a"></script>`;
          htmlContent = htmlContent.replace(/<head[^>]*>/i, (match: string) => `${match}\n    ${walletShimTag}`);
          
          // Per-app COOP/COEP headers for apps that need cross-origin isolation
          // (e.g. media player needs SharedArrayBuffer for DRM decryption)
          const appNameForHeaders = appPath.split('/')[0];
          const appInstallSvc = req.app?.locals?.appInstallService;
          if (appInstallSvc) {
            try {
              const installedApp = appInstallSvc.get(appNameForHeaders);
              if (installedApp) {
                const reqs = JSON.parse(installedApp.requirements_json);
                if (reqs?.headers?.includes('cross-origin-isolation')) {
                  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
                  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
                  log.info(`[static.ts] 🔒 COOP/COEP headers set for app: ${appNameForHeaders}`);
                }
              }
            } catch { /* ignore parse errors */ }
          }
          
          // For calculator app, add SDK initialization script to set API origin
          if (isCalculator) {
            const sdkInitScript = `
    <script>
        // Set API origin before SDK loads (for calculator app)
        window.api_origin = '${baseUrl}';
        window.puter_api_origin = '${baseUrl}';
        console.log('[Calculator] Setting API origin to:', window.api_origin);
    </script>
`;
            // Insert before the SDK script tag
            htmlContent = htmlContent.replace(/(<script[^>]*src=["']\/puter\.js\/v2["'][^>]*>)/i, sdkInitScript + '$1');
            log.debug(`[static.ts] ✅ Calculator SDK initialization added`);
          }
          
          // For terminal app, add SDK initialization script to set API origin
          if (isTerminal) {
            const sdkInitScript = `
    <script>
        // Set API origin before SDK loads (for terminal app)
        window.api_origin = '${baseUrl}';
        window.puter_api_origin = '${baseUrl}';
        console.log('[Terminal] Setting API origin to:', window.api_origin);
        
        // Enhanced debugging for terminal app
        window.addEventListener('error', (e) => {
            console.error('[Terminal] Global error:', e.error, e.message, e.filename, e.lineno);
        });
        window.addEventListener('unhandledrejection', (e) => {
            console.error('[Terminal] Unhandled promise rejection:', e.reason);
        });
    </script>`;
            // Insert after the SDK script tag
            htmlContent = htmlContent.replace(
              /(<script src="[^"]*puter\.js\/v2"><\/script>)/,
              `$1${sdkInitScript}`
            );
            
            // Also enhance the main_term initialization with better error handling
            htmlContent = htmlContent.replace(
              /if \(typeof puter === 'undefined'\) \{[^}]*return;[^}]*\}/s,
              `if (typeof puter === 'undefined') {
                console.error('[Terminal] Puter SDK failed to load after ${100 * 50}ms');
                console.error('[Terminal] window.puter:', typeof window.puter);
                console.error('[Terminal] window.api_origin:', window.api_origin);
                document.body.innerHTML = '<div style="padding: 20px; color: red;">Terminal Error: SDK failed to load. Check console.</div>';
                return;
            }
            console.log('[Terminal] ✅ SDK loaded, puter type:', typeof puter);
            console.log('[Terminal] puter object:', puter);
            console.log('[Terminal] puter.ui:', puter.ui);
            console.log('[Terminal] puter.ui.launchApp:', typeof puter.ui.launchApp);
            console.log('[Terminal] puter.env:', puter.env);
            console.log('[Terminal] puter.appInstanceID:', puter.appInstanceID);
            console.log('[Terminal] window.parent:', window.parent);
            console.log('[Terminal] window.parent === window:', window.parent === window);
            
            // Listen for all postMessage events to debug communication
            window.addEventListener('message', (event) => {
                if (event.data && (event.data.$ === 'puter-ipc' || event.data.msg === 'launchApp' || event.data.msg === 'childAppLaunched' || event.data.msg === 'READY')) {
                    console.log('[Terminal] 📨 Received message from parent:', event.data, 'origin:', event.origin);
                }
            });
            
            // Intercept postMessage to see what's being sent
            const originalPostMessage = window.parent.postMessage;
            window.parent.postMessage = function(...args) {
                const msg = args[0];
                if (msg && (msg.$ === 'puter-ipc' || msg.msg === 'launchApp' || msg.msg === 'READY')) {
                    console.log('[Terminal] 📤 Sending message to parent:');
                    console.log('  $:', msg.$);
                    console.log('  v:', msg.v);
                    console.log('  msg:', msg.msg);
                    console.log('  appInstanceID:', msg.appInstanceID);
                    console.log('  env:', msg.env);
                    console.log('  parameters:', msg.parameters);
                    console.log('  uuid:', msg.uuid);
                    console.log('  targetOrigin:', args[1]);
                }
                return originalPostMessage.apply(window.parent, args);
            };
            
            console.log('[Terminal] Calling main_term()...');
            let mainTermResolved = false;
            try {
                const result = main_term();
                console.log('[Terminal] main_term() returned:', result);
                if (result && typeof result.then === 'function') {
                    console.log('[Terminal] Waiting for main_term() promise...');
                    result.then((res) => {
                        mainTermResolved = true;
                        console.log('[Terminal] ✅ main_term() promise resolved:', res);
                        // Check if terminal element exists
                        setTimeout(() => {
                            const termEl = document.getElementById('terminal');
                            console.log('[Terminal] Terminal element after resolution:', termEl);
                            if (termEl) {
                                console.log('[Terminal] Terminal element found, checking xterm instance...');
                                const term = termEl._xterm;
                                console.log('[Terminal] xterm instance:', term);
                            } else {
                                console.warn('[Terminal] ⚠️ Terminal element not found after main_term() resolved');
                            }
                        }, 1000);
                    }).catch((err) => {
                        mainTermResolved = true;
                        console.error('[Terminal] ❌ main_term() promise rejected:', err);
                        console.error('[Terminal] Error details:', err.message, err.stack);
                        document.body.innerHTML = '<div style="padding: 20px; color: red; font-family: monospace;">Terminal Error: ' + (err.message || String(err)) + '<br><br>Stack: ' + (err.stack || 'No stack trace') + '</div>';
                    });
                    // Also add a timeout to catch hanging promises
                    setTimeout(() => {
                        if (!mainTermResolved) {
                            console.error('[Terminal] ⚠️ main_term() promise still pending after 10 seconds - likely launchApp() is hanging');
                            console.error('[Terminal] This usually means the parent window is not responding to puter-ipc messages');
                        }
                    }, 10000);
                } else {
                    console.log('[Terminal] main_term() returned non-promise:', result);
                }
            } catch (error) {
                console.error('[Terminal] ❌ Error calling main_term():', error);
                console.error('[Terminal] Error stack:', error.stack);
                document.body.innerHTML = '<div style="padding: 20px; color: red; font-family: monospace;">Terminal Error: ' + error.message + '<br><br>Stack: ' + (error.stack || 'No stack trace') + '</div>';
            }`
            );
          }
          
          // For phoenix app, add SDK initialization script to set API origin
          if (isPhoenix) {
            log.debug('[static.ts] 🐦 Processing phoenix app HTML, injecting SDK initialization...');
            const sdkInitScript = `
    <script>
        // IMMEDIATE visual indicator - show this as soon as possible
        (function() {
            try {
                // Create indicator immediately, even before DOM is ready
                const indicator = document.createElement('div');
                indicator.id = 'phoenix-middleware-indicator';
                indicator.style.cssText = 'padding: 10px; color: #00ff00; font-family: monospace; background: #000; position: fixed; top: 0; left: 0; right: 0; z-index: 99999; border-bottom: 2px solid #00ff00;';
                indicator.textContent = '[Phoenix] ✅ HTML processed by middleware - SDK loading...';
                if (document.body) {
                    document.body.appendChild(indicator);
                } else {
                    // If body doesn't exist yet, wait for it
                    document.addEventListener('DOMContentLoaded', () => {
                        if (document.body) document.body.appendChild(indicator);
                    });
                    // Also try to prepend to html if body doesn't exist
                    if (document.documentElement) {
                        document.documentElement.insertBefore(indicator, document.documentElement.firstChild);
                    }
                }
            } catch (e) {
                console.error('[Phoenix] Failed to create indicator:', e);
            }
        })();
        
        // Set API origin before SDK loads (for phoenix app)
        window.api_origin = '${baseUrl}';
        window.puter_api_origin = '${baseUrl}';
        console.log('[Phoenix] Setting API origin to:', window.api_origin);
        
        // Enhanced debugging for phoenix app
        window.addEventListener('error', (e) => {
            console.error('[Phoenix] Global error:', e.error, e.message, e.filename, e.lineno);
            const indicator = document.getElementById('phoenix-middleware-indicator');
            if (indicator) indicator.textContent = '[Phoenix] ❌ Error: ' + (e.message || String(e.error));
        });
        window.addEventListener('unhandledrejection', (e) => {
            console.error('[Phoenix] Unhandled promise rejection:', e.reason);
            const indicator = document.getElementById('phoenix-middleware-indicator');
            if (indicator) indicator.textContent = '[Phoenix] ❌ Unhandled rejection: ' + String(e.reason);
        });
    </script>`;
            // Insert after the SDK script tag
            htmlContent = htmlContent.replace(
              /(<script src="[^"]*puter\.js\/v2"><\/script>)/,
              `$1${sdkInitScript}`
            );
            
            // Enhance the phoenix initialization with better error handling
            // Match the actual phoenix HTML structure: if (typeof puter === 'undefined') { ... return; }
            const beforeInitReplace = htmlContent;
            htmlContent = htmlContent.replace(
              /if \(typeof puter === 'undefined'\) \{[\s\S]*?return;[\s\S]*?\}/,
              `if (typeof puter === 'undefined') {
                console.error('[Phoenix] Puter SDK failed to load after ${100 * 50}ms');
                console.error('[Phoenix] window.puter:', typeof window.puter);
                console.error('[Phoenix] window.api_origin:', window.api_origin);
                const indicator = document.getElementById('phoenix-middleware-indicator');
                if (indicator) indicator.textContent = '[Phoenix] ❌ SDK failed to load';
                document.body.innerHTML = '<div style="padding: 20px; color: red;">Phoenix Error: SDK failed to load. Check console.</div>';
                return;
            }
            console.log('[Phoenix] ✅ SDK loaded, puter type:', typeof puter);
            console.log('[Phoenix] puter object:', puter);
            console.log('[Phoenix] puter.env:', puter.env);
            console.log('[Phoenix] puter.appInstanceID:', puter.appInstanceID);
            console.log('[Phoenix] puter.parentInstanceID:', puter.parentInstanceID);
            console.log('[Phoenix] puter.ui:', puter.ui);
            console.log('[Phoenix] puter.ui.parentApp:', typeof puter.ui?.parentApp);
            console.log('[Phoenix] URL params:', new URLSearchParams(window.location.search).toString());
            console.log('[Phoenix] parent_instance_id from URL:', new URLSearchParams(window.location.search).get('puter.parent_instance_id'));
            const indicator = document.getElementById('phoenix-middleware-indicator');
            if (indicator) indicator.textContent = '[Phoenix] ✅ SDK loaded - checking parentApp()...';
            console.log('[Phoenix] Testing puter.ui.parentApp()...');
            const parentApp = puter.ui.parentApp();
            console.log('[Phoenix] puter.ui.parentApp() result:', parentApp);
            if (!parentApp) {
                console.error('[Phoenix] ❌ parentApp() returned null - phoenix will exit!');
                console.error('[Phoenix] This means puter.parentInstanceID is not set correctly');
                console.error('[Phoenix] puter.parentInstanceID value:', puter.parentInstanceID);
                console.error('[Phoenix] URL search params:', window.location.search);
                if (indicator) indicator.textContent = '[Phoenix] ❌ parentApp() returned null - EXITING';
                document.body.innerHTML = '<div style="padding: 20px; color: red; font-family: monospace;">Phoenix Error: parentApp() returned null. puter.parentInstanceID: ' + (puter.parentInstanceID || 'undefined') + '<br><br>URL params: ' + window.location.search + '</div>';
            } else {
                console.log('[Phoenix] ✅ parentApp() returned connection:', parentApp);
                if (indicator) indicator.textContent = '[Phoenix] ✅ parentApp() OK - initializing shell...';
            }
            console.log('[Phoenix] Calling main_shell()...');
            try {
                const result = main_shell();
                console.log('[Phoenix] main_shell() returned:', result);
                if (result && typeof result.then === 'function') {
                    console.log('[Phoenix] main_shell() returned a promise, waiting...');
                    result.then((res) => {
                        console.log('[Phoenix] ✅ main_shell() promise resolved:', res);
                        if (indicator) indicator.textContent = '[Phoenix] ✅ Shell initialized successfully';
                    }).catch((err) => {
                        console.error('[Phoenix] ❌ main_shell() promise rejected:', err);
                        console.error('[Phoenix] Error details:', err.message, err.stack);
                        if (indicator) indicator.textContent = '[Phoenix] ❌ Shell init failed: ' + (err.message || String(err));
                        document.body.innerHTML = '<div style="padding: 20px; color: red; font-family: monospace;">Phoenix Error: ' + (err.message || String(err)) + '<br><br>Stack: ' + (err.stack || 'No stack trace') + '</div>';
                    });
                }
            } catch (error) {
                console.error('[Phoenix] ❌ Error calling main_shell():', error);
                console.error('[Phoenix] Error stack:', error.stack);
                if (indicator) indicator.textContent = '[Phoenix] ❌ Error: ' + error.message;
                document.body.innerHTML = '<div style="padding: 20px; color: red; font-family: monospace;">Phoenix Error: ' + error.message + '<br><br>Stack: ' + (error.stack || 'No stack trace') + '</div>';
            }`
            );
            if (htmlContent === beforeInitReplace) {
              log.warn('[static.ts] ⚠️ Phoenix initialization code replacement failed - pattern not found in HTML');
            } else {
              log.info('[static.ts] ✅ Phoenix initialization code enhanced');
            }
          }
          
          res.send(htmlContent);
          return;
        }
        
        res.sendFile(normalizedPath);
        return;
      }
    }
    
    // SPA fallback for installed dApps: serve the app's index.html for extensionless
    // paths so client-side routers (React Router, Vue Router, etc.) work correctly
    const spaAppName = appPath.split('/')[0];
    if (spaAppName && !path.extname(appPath)) {
      const spaAppIndex = path.join(dataDir, 'installed-apps', spaAppName, 'index.html');
      if (existsSync(spaAppIndex)) {
        const bosonService = req.app?.locals?.bosonService;
        const baseUrl = getBaseUrl(req, bosonService);
        const sdkUrl = `${baseUrl}/puter.js/v2`;
        let htmlContent = await readFileAsync(spaAppIndex, 'utf8');
        htmlContent = htmlContent.replace(/https?:\/\/[^'"]*\/puter\.js\/v2/g, sdkUrl);
        const walletShimTag = `<script src="${baseUrl}/pc2-wallet-provider.js?v=20260421a"></script>`;
        htmlContent = htmlContent.replace(/<head[^>]*>/i, (match: string) => `${match}\n    ${walletShimTag}`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.type('html').send(htmlContent);
        return;
      }
    }

    next();
  }
  
  // Serve setup wizard (redirect middleware is registered earlier in the file)
  app.use('/setup', express.static(path.join(frontendPath, 'setup'), {
    setHeaders: (res: Response) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }));

  // Serve access gate page (anti-snipe password entry)
  app.use('/access-gate', express.static(path.join(frontendPath, 'access-gate'), {
    setHeaders: (res: Response) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }));

  // Serve access denied page (unauthorized wallet)
  app.use('/access-denied', express.static(path.join(frontendPath, 'access-denied'), {
    setHeaders: (res: Response) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }));

  // SPA fallback: serve index.html for all non-API GET requests
  // This must come AFTER static file serving and API routes
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    // Skip if this is an API route (should have been handled already)
    if (isAPIRoute(req.path)) {
      return next();
    }

    // Skip if this is a static asset request (has file extension)
    if (isStaticAsset(req.path)) {
      return next();
    }
    
    // Skip particle-auth routes (already handled above)
    if (req.path.startsWith('/particle-auth')) {
      return next();
    }

    // Serve index.html for SPA routing
    const indexPath = path.join(frontendPath, 'index.html');
    
    if (!existsSync(indexPath)) {
      log.error(`❌ index.html not found: ${indexPath}`);
      return res.status(404).json({ 
        error: 'Frontend not built',
        message: 'Please run: npm run build:frontend'
      });
    }

    // Set CSP headers for HTML files (SPA fallback)
    if (!isProduction) {
      res.setHeader('Content-Security-Policy', 
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: wss: https:; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://js.puter.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://challenges.cloudflare.com; " +
        "style-src 'self' 'unsafe-inline' https:; " +
        "img-src 'self' data: blob: https:; " +
        "font-src 'self' data: https: moz-extension: chrome-extension:; " +
        "connect-src 'self' ws: wss: http: https:;"
      );
    }

    res.sendFile(indexPath, (err) => {
      if (err) {
        log.error('Error serving index.html:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to serve frontend' });
        }
      }
    });
  });
}

