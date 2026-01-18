import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import { existsSync, readFileSync, statSync } from 'fs';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import https from 'https';
import { isAPIRoute, isStaticAsset } from './utils/routes.js';

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

  // Verify frontend directory exists
  if (!existsSync(frontendPath)) {
    console.warn(`⚠️  Frontend directory not found: ${frontendPath}`);
    console.warn('   Static file serving will not work until frontend is built.');
    console.warn('   Run: npm run build:frontend');
  }

  // IMPORTANT: Register /apps/* route BEFORE express.static()
  // This ensures app HTML files are processed by our middleware for SDK injection
  // We'll define the route handler inline here to ensure it runs before static file serving
  
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
    console.warn(`⚠️  SDK file not found locally: ${sdkPath}, proxying to api.puter.com`);
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
      console.error('Failed to proxy SDK from api.puter.com:', error);
    }
    
    next();
  });

  // IMPORTANT: Register /apps/* route BEFORE express.static()
  // This ensures app HTML files are processed by our middleware for SDK injection
  // We'll define the route handler function here and register it before static middleware
  
  // Log all requests to help debug routing
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.includes('phoenix') || req.path.includes('terminal')) {
      console.log(`[static.ts] 🔍 Request: ${req.method} ${req.path} (from ${req.get('referer') || 'direct'})`);
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
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://js.puter.com https://cdn.jsdelivr.net https://challenges.cloudflare.com; " +
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
  
  // IMPORTANT: Register /apps/* route BEFORE the static middleware wrapper
  // Express checks app.get() routes before app.use() middleware, but only if registered first
  // The route handler function (appsRouteHandler) is defined later (around line 374) as a function declaration
  // Function declarations are hoisted, so we can register the route here even though the handler is defined below
  app.get('/apps/*', appsRouteHandler);
  app.get('/builtin/*', appsRouteHandler); // Also handle builtin apps (phoenix, terminal) that use BUILTIN_PREFIX
  
  // Wrap static middleware to skip /apps/* and /builtin/* paths
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/apps/') || req.path.startsWith('/builtin/')) {
      console.log(`[static.ts] ⏭️  Skipping express.static() for ${req.path} - will be handled by route`);
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
          console.error(`Error serving ${actualPath}:`, err);
          return next();
        }
      });
    } else {
      // File doesn't exist, continue to next handler
      next();
    }
  });

  // Particle Auth route - must come BEFORE SPA fallback
  app.get('/particle-auth', (req: Request, res: Response, next: NextFunction) => {
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
          console.log(`[Particle Auth]: ✅ Found at: ${particleAuthPath}`);
          break;
        }
      }
      
      if (!particleAuthPath) {
        console.error(`[Particle Auth]: ❌ Not found in any of these locations:`, possiblePaths);
        return res.status(404).json({ 
          error: 'Particle Auth not found',
          message: 'Please ensure particle-auth is built and available',
          checkedPaths: possiblePaths
        });
      }
      
      let html: string;
      try {
        html = readFileSync(particleAuthPath, 'utf8');
      } catch (readError) {
        console.error(`[Particle Auth]: ❌ Error reading file:`, readError);
        return res.status(500).json({ 
          error: 'Failed to read Particle Auth file',
          message: readError instanceof Error ? readError.message : 'Unknown error'
        });
      }
        
      // Extract API origin from URL params
      let apiOrigin: string;
      try {
        const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
        const url = new URL(fullUrl);
        apiOrigin = url.searchParams.get('api_origin') || `http://${req.headers.host}`;
      } catch (urlError) {
        console.error(`[Particle Auth]: ❌ Error parsing URL:`, urlError);
        apiOrigin = `http://${req.headers.host}`;
      }
      
      // Inject API origin script (same as mock server)
      const apiOriginScript = `
    <script>
        (function() {
            window.PUTER_API_ORIGIN = ${JSON.stringify(apiOrigin)};
            console.log('[Particle Auth]: ✅ API origin set to:', window.PUTER_API_ORIGIN);
            
            const currentOrigin = window.location.origin;
            const apiPuterPattern = /https?:\\/\\/api\\.puter\\.[^\\/:]+(?:\\:\\d+)?/gi;
            
            const originalFetch = window.fetch;
            window.fetch = function(...args) {
                let url = args[0];
                if (typeof url === 'string' && url.includes('api.puter.')) {
                    args[0] = url.replace(apiPuterPattern, currentOrigin);
                } else if (url && typeof url === 'object' && url.url && url.url.includes('api.puter.')) {
                    url.url = url.url.replace(apiPuterPattern, currentOrigin);
                }
                return originalFetch.apply(this, args);
            };
            
            const originalXHROpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                if (typeof url === 'string' && url.includes('api.puter.')) {
                    url = url.replace(apiPuterPattern, currentOrigin);
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
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://js.puter.com https://cdn.jsdelivr.net https://challenges.cloudflare.com; " +
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
      console.error(`[Particle Auth]: ❌ Unexpected error:`, error);
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
    
    console.warn(`[Particle Auth]: Asset not found: ${assetPath}`);
    next();
  });

  // Serve apps from src/backend/apps/
  // NOTE: This route handler function is defined here, but it's registered BEFORE express.static() above (around line 151)
  // Express checks app.get() routes before app.use() middleware, so this will be checked first
  // The route registration was moved to before the static middleware wrapper to ensure proper order
  // We use a function declaration (not const) so it can be hoisted and registered before it's defined
  function appsRouteHandler(req: Request, res: Response, next: NextFunction) {
    // Handle both /apps/* and /builtin/* paths
    const isBuiltin = req.path.startsWith('/builtin/');
    const isApps = req.path.startsWith('/apps/');
    console.log(`[static.ts] 📱 ${isBuiltin ? '/builtin/*' : '/apps/*'} route hit! Path: ${req.path}, Full URL: ${req.url}`);
    console.log(`[static.ts] 📱 Request method: ${req.method}`);
    console.log(`[static.ts] 📱 This route should process app HTML files`);
    const appPath = isBuiltin ? req.path.replace('/builtin/', '') : req.path.replace('/apps/', '');
    console.log(`[static.ts] 📱 Extracted appPath: ${appPath}`);
    const projectRoot = path.resolve(__dirname, '../..');
    
    console.log(`[static.ts] 📦 Serving app: ${appPath} (full path: ${req.path})`);
    
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
      console.log(`[static.ts] 🐦 Phoenix detected! appPath: ${appPath}, phoenixRelativePath: ${phoenixRelativePath}`);
    }
    
    if (isCalculator) {
      console.log(`[static.ts] 🧮 Calculator detected! appPath: ${appPath}, calculatorRelativePath: ${calculatorRelativePath}`);
    }
    
    const possiblePaths = [
      // Frontend apps path (for calculator and other new apps)
      path.join(projectRoot, 'frontend/apps', appPath),
      path.join(process.cwd(), 'frontend/apps', appPath),
      // Standard app paths
      path.join(projectRoot, 'src/backend/apps', appPath),
      path.join(process.cwd(), 'src/backend/apps', appPath),
      path.join(process.cwd(), '../../src/backend/apps', appPath),
      path.join('/Users/mtk/Documents/Cursor/pc2.net/src/backend/apps', appPath), // Fallback absolute path
      // Terminal app special paths (if it's the terminal app)
      // Try dist/ first (built version), then assets/ (source)
      ...(isTerminal && terminalRelativePath ? [
        path.join(projectRoot, 'src/terminal/dist', terminalRelativePath),
        path.join(process.cwd(), 'src/terminal/dist', terminalRelativePath),
        path.join(process.cwd(), '../../src/terminal/dist', terminalRelativePath),
        path.join('/Users/mtk/Documents/Cursor/pc2.net/src/terminal/dist', terminalRelativePath), // Fallback absolute path
        path.join(projectRoot, 'src/terminal/assets', terminalRelativePath),
        path.join(process.cwd(), 'src/terminal/assets', terminalRelativePath),
        path.join(process.cwd(), '../../src/terminal/assets', terminalRelativePath),
        path.join('/Users/mtk/Documents/Cursor/pc2.net/src/terminal/assets', terminalRelativePath) // Fallback absolute path
      ] : []),
      // Phoenix app special paths (if it's the phoenix app)
      // Try dist/ first (built version), then assets/ (source)
      ...(isPhoenix && phoenixRelativePath ? [
        path.join(projectRoot, 'src/phoenix/dist', phoenixRelativePath),
        path.join(process.cwd(), 'src/phoenix/dist', phoenixRelativePath),
        path.join(process.cwd(), '../../src/phoenix/dist', phoenixRelativePath),
        path.join('/Users/mtk/Documents/Cursor/pc2.net/src/phoenix/dist', phoenixRelativePath), // Fallback absolute path
        path.join(projectRoot, 'src/phoenix/assets', phoenixRelativePath),
        path.join(process.cwd(), 'src/phoenix/assets', phoenixRelativePath),
        path.join(process.cwd(), '../../src/phoenix/assets', phoenixRelativePath),
        path.join('/Users/mtk/Documents/Cursor/pc2.net/src/phoenix/assets', phoenixRelativePath) // Fallback absolute path
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
        
        // Special handling for app HTML files - inject correct SDK URL
        // This applies to all apps (terminal, phoenix, player, viewer, pdf, editor, etc.)
        if (ext === '.html') {
          console.log(`[static.ts] 📄 Processing HTML file: ${normalizedPath}, isPhoenix: ${isPhoenix}, isTerminal: ${isTerminal}, isCalculator: ${isCalculator}`);
          const baseUrl = req.protocol + '://' + req.get('host');
          const sdkUrl = `${baseUrl}/puter.js/v2`;
          let htmlContent = readFileSync(normalizedPath, 'utf8');
          // Replace any hardcoded SDK URL with the local server's SDK URL
          // This ensures apps work with PC2 node's local SDK
          htmlContent = htmlContent.replace(/https?:\/\/[^'"]*\/puter\.js\/v2/g, sdkUrl);
          console.log(`[static.ts] ✅ SDK URL replaced in HTML`);
          
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
            console.log(`[static.ts] ✅ Calculator SDK initialization added`);
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
            console.log('[static.ts] 🐦 Processing phoenix app HTML, injecting SDK initialization...');
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
              console.warn('[static.ts] ⚠️ Phoenix initialization code replacement failed - pattern not found in HTML');
            } else {
              console.log('[static.ts] ✅ Phoenix initialization code enhanced');
            }
          }
          
          res.send(htmlContent);
          return;
        }
        
        res.sendFile(normalizedPath);
        return;
      }
    }
    
    // If file not found, continue to next handler (might be handled by SPA fallback)
    next();
  }
  
  // Route handler registration was moved to before the static middleware (around line 151)
  // We register it there even though the handler is defined here, because function declarations are hoisted
  
  // Route handler registration was moved to before the static middleware (around line 152)
  // We register it there even though the handler is defined here, because function declarations are hoisted
  // The /builtin/* route is now handled by the same appsRouteHandler function (registered at line 152)

  // REMOVED: Duplicate /builtin/* route handler - now using appsRouteHandler for both /apps/* and /builtin/*
  // The old handler code is below (commented out) for reference:
  /*
  app.get('/builtin/*', (req: Request, res: Response, next: NextFunction) => {
    console.log(`[static.ts] 🔵 /builtin/* route hit! Path: ${req.path}, Full URL: ${req.url}`);
    const appPath = req.path.replace('/builtin/', '');
    console.log(`[static.ts] 🔵 Extracted appPath: ${appPath}`);
    const projectRoot = path.resolve(__dirname, '../..');
    
    // Special handling for terminal app
    const isTerminal = appPath.startsWith('terminal/') || appPath === 'terminal' || appPath === 'terminal/index.html';
    const terminalRelativePath = isTerminal ? appPath.replace(/^terminal\/?/, '') || 'index.html' : null;
    
    // Special handling for phoenix app
    const isPhoenix = appPath.startsWith('phoenix/') || appPath === 'phoenix' || appPath === 'phoenix/index.html';
    const phoenixRelativePath = isPhoenix ? appPath.replace(/^phoenix\/?/, '') || 'index.html' : null;
    
    const possiblePaths = [
      // Terminal app special paths
      ...(isTerminal && terminalRelativePath ? [
        path.join(projectRoot, 'src/terminal/dist', terminalRelativePath),
        path.join(process.cwd(), 'src/terminal/dist', terminalRelativePath),
        path.join(process.cwd(), '../../src/terminal/dist', terminalRelativePath),
        path.join('/Users/mtk/Documents/Cursor/pc2.net/src/terminal/dist', terminalRelativePath),
        path.join(projectRoot, 'src/terminal/assets', terminalRelativePath),
        path.join(process.cwd(), 'src/terminal/assets', terminalRelativePath),
        path.join(process.cwd(), '../../src/terminal/assets', terminalRelativePath),
        path.join('/Users/mtk/Documents/Cursor/pc2.net/src/terminal/assets', terminalRelativePath)
      ] : []),
      // Phoenix app special paths
      ...(isPhoenix && phoenixRelativePath ? [
        path.join(projectRoot, 'src/phoenix/dist', phoenixRelativePath),
        path.join(process.cwd(), 'src/phoenix/dist', phoenixRelativePath),
        path.join(process.cwd(), '../../src/phoenix/dist', phoenixRelativePath),
        path.join('/Users/mtk/Documents/Cursor/pc2.net/src/phoenix/dist', phoenixRelativePath),
        path.join(projectRoot, 'src/phoenix/assets', phoenixRelativePath),
        path.join(process.cwd(), 'src/phoenix/assets', phoenixRelativePath),
        path.join(process.cwd(), '../../src/phoenix/assets', phoenixRelativePath),
        path.join('/Users/mtk/Documents/Cursor/pc2.net/src/phoenix/assets', phoenixRelativePath)
      ] : []),
      // Standard app paths (fallback)
      path.join(projectRoot, 'src/backend/apps', appPath),
      path.join(process.cwd(), 'src/backend/apps', appPath),
      path.join(process.cwd(), '../../src/backend/apps', appPath),
      path.join('/Users/mtk/Documents/Cursor/pc2.net/src/backend/apps', appPath)
    ];
    
    for (const possiblePath of possiblePaths) {
      const normalizedPath = path.normalize(possiblePath);
      if (existsSync(normalizedPath)) {
        console.log(`[static.ts] ✅ Found file: ${normalizedPath}, isPhoenix: ${isPhoenix}, isTerminal: ${isTerminal}, appPath: ${appPath}`);
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
          '.webp': 'image/webp',
          '.json': 'application/json',
          '.woff': 'font/woff',
          '.woff2': 'font/woff2',
          '.ttf': 'font/ttf',
          '.eot': 'application/vnd.ms-fontobject'
        };
        
        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        res.setHeader('Content-Type', mimeType);
        
        // Special handling for app HTML files - inject correct SDK URL
        if (ext === '.html') {
          const baseUrl = req.protocol + '://' + req.get('host');
          const sdkUrl = `${baseUrl}/puter.js/v2`;
          let htmlContent = readFileSync(normalizedPath, 'utf8');
          // Replace any hardcoded SDK URL with the local server's SDK URL
          htmlContent = htmlContent.replace(/https?:\/\/[^'"]*\/puter\.js\/v2/g, sdkUrl);
          
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
            console.log('[static.ts] 🐦 Processing phoenix app HTML, injecting SDK initialization...');
            console.log('[static.ts] 🐦 Phoenix HTML length:', htmlContent.length);
            console.log('[static.ts] 🐦 Phoenix HTML contains "main_shell":', htmlContent.includes('main_shell'));
            const sdkInitScript = `
    <script>
        // Visual indicator that phoenix HTML was processed by middleware
        if (document.body) {
            document.body.style.backgroundColor = '#1a1a1a';
            const indicator = document.createElement('div');
            indicator.id = 'phoenix-middleware-indicator';
            indicator.style.cssText = 'padding: 10px; color: #00ff00; font-family: monospace; background: #000; position: fixed; top: 0; left: 0; right: 0; z-index: 99999; border-bottom: 2px solid #00ff00;';
            indicator.textContent = '[Phoenix] ✅ HTML processed by middleware - SDK loading...';
            document.body.appendChild(indicator);
        }
        
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
            const beforeReplace = htmlContent;
            htmlContent = htmlContent.replace(
              /(<script src="[^"]*puter\.js\/v2"><\/script>)/,
              `$1${sdkInitScript}`
            );
            if (htmlContent === beforeReplace) {
              console.warn('[static.ts] ⚠️ Phoenix SDK script tag replacement failed - SDK script tag not found in HTML');
            } else {
              console.log('[static.ts] ✅ Phoenix SDK initialization script injected');
            }
            
            // Enhance the phoenix initialization with better error handling
            // Match the actual phoenix HTML structure: if (typeof puter === 'undefined') { ... return; }
            const beforeInitReplace = htmlContent;
            htmlContent = htmlContent.replace(
              /if \(typeof puter === 'undefined'\) \{[\s\S]*?return;[\s\S]*?\}/,
              `if (typeof puter === 'undefined') {
                console.error('[Phoenix] Puter SDK failed to load after ${100 * 50}ms');
                console.error('[Phoenix] window.puter:', typeof window.puter);
                console.error('[Phoenix] window.api_origin:', window.api_origin);
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
            console.log('[Phoenix] Testing puter.ui.parentApp()...');
            const parentApp = puter.ui.parentApp();
            console.log('[Phoenix] puter.ui.parentApp() result:', parentApp);
            if (!parentApp) {
                console.error('[Phoenix] ❌ parentApp() returned null - phoenix will exit!');
                console.error('[Phoenix] This means puter.parentInstanceID is not set correctly');
                console.error('[Phoenix] puter.parentInstanceID value:', puter.parentInstanceID);
                console.error('[Phoenix] URL search params:', window.location.search);
            } else {
                console.log('[Phoenix] ✅ parentApp() returned connection:', parentApp);
            }
            console.log('[Phoenix] Calling main_shell()...');
            try {
                const result = main_shell();
                console.log('[Phoenix] main_shell() returned:', result);
                if (result && typeof result.then === 'function') {
                    console.log('[Phoenix] main_shell() returned a promise, waiting...');
                    result.then((res) => {
                        console.log('[Phoenix] ✅ main_shell() promise resolved:', res);
                    }).catch((err) => {
                        console.error('[Phoenix] ❌ main_shell() promise rejected:', err);
                        console.error('[Phoenix] Error details:', err.message, err.stack);
                        document.body.innerHTML = '<div style="padding: 20px; color: red; font-family: monospace;">Phoenix Error: ' + (err.message || String(err)) + '<br><br>Stack: ' + (err.stack || 'No stack trace') + '</div>';
                    });
                }
            } catch (error) {
                console.error('[Phoenix] ❌ Error calling main_shell():', error);
                console.error('[Phoenix] Error stack:', error.stack);
                document.body.innerHTML = '<div style="padding: 20px; color: red; font-family: monospace;">Phoenix Error: ' + error.message + '<br><br>Stack: ' + (error.stack || 'No stack trace') + '</div>';
            }`
            );
            if (htmlContent === beforeInitReplace) {
              console.warn('[static.ts] ⚠️ Phoenix initialization code replacement failed - pattern not found in HTML');
            } else {
              console.log('[static.ts] ✅ Phoenix initialization code enhanced');
            }
          }
          
          res.send(htmlContent);
          return;
        }
        
        res.sendFile(normalizedPath);
        return;
      }
    }
    
    // If file not found, continue to next handler
    next();
  });
  */

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
      console.error(`❌ index.html not found: ${indexPath}`);
      return res.status(404).json({ 
        error: 'Frontend not built',
        message: 'Please run: npm run build:frontend'
      });
    }

    // Set CSP headers for HTML files (SPA fallback)
    if (!isProduction) {
      res.setHeader('Content-Security-Policy', 
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: wss: https:; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://js.puter.com https://cdn.jsdelivr.net https://challenges.cloudflare.com; " +
        "style-src 'self' 'unsafe-inline' https:; " +
        "img-src 'self' data: blob: https:; " +
        "font-src 'self' data: https: moz-extension: chrome-extension:; " +
        "connect-src 'self' ws: wss: http: https:;"
      );
    }

    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error('Error serving index.html:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to serve frontend' });
        }
      }
    });
  });
}

