import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import { existsSync, readFileSync, statSync } from 'fs';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
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

  // Handle /puter.js/v2 - SDK file (must be served with correct MIME type)
  // MUST be before express.static() middleware to override default MIME type
  app.get('/puter.js/v2', (req: Request, res: Response, next: NextFunction) => {
    const sdkPath = path.join(frontendPath, 'puter.js', 'v2');
    
    if (existsSync(sdkPath) && !statSync(sdkPath).isDirectory()) {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.sendFile(sdkPath);
      return;
    }
    
    console.warn(`⚠️  SDK file not found: ${sdkPath}`);
    next();
  });

  // Serve static files with appropriate cache headers
  app.use(express.static(frontendPath, {
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
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; " +
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
  }));

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
        '/Users/mtk/Documents/Cursor/pc2.net/src/particle-auth/index.html' // Fallback absolute path
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
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; " +
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
      path.join('/Users/mtk/Documents/Cursor/pc2.net/src/particle-auth', assetPath) // Fallback absolute path
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
  app.get('/apps/*', (req: Request, res: Response, next: NextFunction) => {
    const appPath = req.path.replace('/apps/', '');
    const projectRoot = path.resolve(__dirname, '../..');
    
    // Special handling for terminal app (located in src/terminal/ instead of src/backend/apps/terminal/)
    const isTerminal = appPath.startsWith('terminal/') || appPath === 'terminal' || appPath === 'terminal/index.html';
    const terminalRelativePath = isTerminal ? appPath.replace(/^terminal\/?/, '') || 'index.html' : null;
    
    // Special handling for phoenix app (located in src/phoenix/ instead of src/backend/apps/phoenix/)
    const isPhoenix = appPath.startsWith('phoenix/') || appPath === 'phoenix' || appPath === 'phoenix/index.html';
    const phoenixRelativePath = isPhoenix ? appPath.replace(/^phoenix\/?/, '') || 'index.html' : null;
    
    const possiblePaths = [
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
          const baseUrl = req.protocol + '://' + req.get('host');
          const sdkUrl = `${baseUrl}/puter.js/v2`;
          let htmlContent = readFileSync(normalizedPath, 'utf8');
          // Replace any hardcoded SDK URL with the local server's SDK URL
          // This ensures apps work with PC2 node's local SDK
          htmlContent = htmlContent.replace(/https?:\/\/[^'"]*\/puter\.js\/v2/g, sdkUrl);
          res.send(htmlContent);
          return;
        }
        
        res.sendFile(normalizedPath);
        return;
      }
    }
    
    // If file not found, continue to next handler (might be handled by SPA fallback)
    next();
  });

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
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; " +
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

