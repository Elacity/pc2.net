import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import { existsSync } from 'fs';
import { isAPIRoute, isStaticAsset } from './utils/routes.js';

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
    },
    etag: isProduction,
    lastModified: isProduction,
    maxAge: isProduction ? 31536000 : 0 // 1 year in production, 0 in dev
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

    // Serve index.html for SPA routing
    const indexPath = path.join(frontendPath, 'index.html');
    
    if (!existsSync(indexPath)) {
      console.error(`❌ index.html not found: ${indexPath}`);
      return res.status(404).json({ 
        error: 'Frontend not built',
        message: 'Please run: npm run build:frontend'
      });
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
