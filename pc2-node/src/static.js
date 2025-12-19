import express from 'express';
import path from 'path';
import { existsSync, readFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { isAPIRoute, isStaticAsset } from './utils/routes.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export function setupStaticServing(app, options) {
    const { frontendPath, isProduction } = options;
    if (!existsSync(frontendPath)) {
        console.warn(`⚠️  Frontend directory not found: ${frontendPath}`);
        console.warn('   Static file serving will not work until frontend is built.');
        console.warn('   Run: npm run build:frontend');
    }
    app.get('/puter.js/v2', (req, res, next) => {
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
    app.use(express.static(frontendPath, {
        setHeaders: (res, filePath) => {
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.html' || filePath.endsWith('index.html')) {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            }
            else if (isProduction) {
                const assetExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.ico'];
                if (assetExtensions.includes(ext)) {
                    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                }
                else {
                    res.setHeader('Cache-Control', 'public, max-age=86400');
                }
            }
            else {
                res.setHeader('Cache-Control', 'no-cache');
            }
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'SAMEORIGIN');
            if (!isProduction) {
                res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: wss: https:; " +
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; " +
                    "style-src 'self' 'unsafe-inline' https:; " +
                    "img-src 'self' data: blob: https:; " +
                    "font-src 'self' data: https: moz-extension: chrome-extension:; " +
                    "connect-src 'self' ws: wss: http: https:;");
            }
        },
        etag: isProduction,
        lastModified: isProduction,
        maxAge: isProduction ? 31536000 : 0
    }));
    app.get('/dist/*', (req, res, next) => {
        const filePath = req.path.replace('/dist/', '');
        const fullPath = path.join(frontendPath, filePath);
        if (existsSync(fullPath) && !statSync(fullPath).isDirectory()) {
            const ext = path.extname(fullPath).toLowerCase();
            const mimeTypes = {
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
        next();
    });
    app.get('/dist/*', (req, res, next) => {
        const requestedPath = req.path;
        const actualPath = requestedPath.replace(/^\/dist\//, '/');
        const filePath = path.join(frontendPath, actualPath);
        if (existsSync(filePath)) {
            res.sendFile(filePath, (err) => {
                if (err) {
                    console.error(`Error serving ${actualPath}:`, err);
                    return next();
                }
            });
        }
        else {
            next();
        }
    });
    app.get('/particle-auth', (req, res, next) => {
        try {
            const projectRoot = path.resolve(__dirname, '../..');
            const possiblePaths = [
                path.join(frontendPath, 'particle-auth', 'index.html'),
                path.join(projectRoot, 'src/particle-auth/index.html'),
                path.join(process.cwd(), 'src/particle-auth/index.html'),
                path.join(process.cwd(), '../../src/particle-auth/index.html'),
                '/Users/mtk/Documents/Cursor/pc2.net/src/particle-auth/index.html'
            ];
            let particleAuthPath = null;
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
            let html;
            try {
                html = readFileSync(particleAuthPath, 'utf8');
            }
            catch (readError) {
                console.error(`[Particle Auth]: ❌ Error reading file:`, readError);
                return res.status(500).json({
                    error: 'Failed to read Particle Auth file',
                    message: readError instanceof Error ? readError.message : 'Unknown error'
                });
            }
            let apiOrigin;
            try {
                const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
                const url = new URL(fullUrl);
                apiOrigin = url.searchParams.get('api_origin') || `http://${req.headers.host}`;
            }
            catch (urlError) {
                console.error(`[Particle Auth]: ❌ Error parsing URL:`, urlError);
                apiOrigin = `http://${req.headers.host}`;
            }
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
            html = html.replace(/<head[^>]*>/i, (match) => `${match}${apiOriginScript}`);
            if (!isProduction) {
                res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: wss: https:; " +
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; " +
                    "style-src 'self' 'unsafe-inline' https:; " +
                    "img-src 'self' data: blob: https:; " +
                    "font-src 'self' data: https: moz-extension: chrome-extension:; " +
                    "connect-src 'self' ws: wss: http: https:;");
            }
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('Cache-Control', 'no-cache');
            res.send(html);
            return;
        }
        catch (error) {
            console.error(`[Particle Auth]: ❌ Unexpected error:`, error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    app.get('/particle-auth/assets/*', (req, res, next) => {
        const assetPath = req.path.replace('/particle-auth', '');
        const projectRoot = path.resolve(__dirname, '../..');
        const possiblePaths = [
            path.join(frontendPath, 'particle-auth', assetPath),
            path.join(projectRoot, 'src/particle-auth', assetPath),
            path.join(process.cwd(), 'src/particle-auth', assetPath),
            path.join(process.cwd(), '../../src/particle-auth', assetPath),
            path.join('/Users/mtk/Documents/Cursor/pc2.net/src/particle-auth', assetPath)
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
    app.get('/apps/*', (req, res, next) => {
        const appPath = req.path.replace('/apps/', '');
        const projectRoot = path.resolve(__dirname, '../..');
        const isTerminal = appPath.startsWith('terminal/') || appPath === 'terminal' || appPath === 'terminal/index.html';
        const terminalRelativePath = isTerminal ? appPath.replace(/^terminal\/?/, '') || 'index.html' : null;
        const isPhoenix = appPath.startsWith('phoenix/') || appPath === 'phoenix' || appPath === 'phoenix/index.html';
        const phoenixRelativePath = isPhoenix ? appPath.replace(/^phoenix\/?/, '') || 'index.html' : null;
        const possiblePaths = [
            path.join(projectRoot, 'src/backend/apps', appPath),
            path.join(process.cwd(), 'src/backend/apps', appPath),
            path.join(process.cwd(), '../../src/backend/apps', appPath),
            path.join('/Users/mtk/Documents/Cursor/pc2.net/src/backend/apps', appPath),
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
            ...(isPhoenix && phoenixRelativePath ? [
                path.join(projectRoot, 'src/phoenix/dist', phoenixRelativePath),
                path.join(process.cwd(), 'src/phoenix/dist', phoenixRelativePath),
                path.join(process.cwd(), '../../src/phoenix/dist', phoenixRelativePath),
                path.join('/Users/mtk/Documents/Cursor/pc2.net/src/phoenix/dist', phoenixRelativePath),
                path.join(projectRoot, 'src/phoenix/assets', phoenixRelativePath),
                path.join(process.cwd(), 'src/phoenix/assets', phoenixRelativePath),
                path.join(process.cwd(), '../../src/phoenix/assets', phoenixRelativePath),
                path.join('/Users/mtk/Documents/Cursor/pc2.net/src/phoenix/assets', phoenixRelativePath)
            ] : [])
        ];
        for (const possiblePath of possiblePaths) {
            const normalizedPath = path.normalize(possiblePath);
            if (existsSync(normalizedPath)) {
                const ext = path.extname(normalizedPath).toLowerCase();
                const mimeTypes = {
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
                if (ext === '.html') {
                    const baseUrl = req.protocol + '://' + req.get('host');
                    const sdkUrl = `${baseUrl}/puter.js/v2`;
                    let htmlContent = readFileSync(normalizedPath, 'utf8');
                    htmlContent = htmlContent.replace(/https?:\/\/[^'"]*\/puter\.js\/v2/g, sdkUrl);
                    res.send(htmlContent);
                    return;
                }
                res.sendFile(normalizedPath);
                return;
            }
        }
        next();
    });
    app.get('*', (req, res, next) => {
        if (isAPIRoute(req.path)) {
            return next();
        }
        if (isStaticAsset(req.path)) {
            return next();
        }
        if (req.path.startsWith('/particle-auth')) {
            return next();
        }
        const indexPath = path.join(frontendPath, 'index.html');
        if (!existsSync(indexPath)) {
            console.error(`❌ index.html not found: ${indexPath}`);
            return res.status(404).json({
                error: 'Frontend not built',
                message: 'Please run: npm run build:frontend'
            });
        }
        if (!isProduction) {
            res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: wss: https:; " +
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; " +
                "style-src 'self' 'unsafe-inline' https:; " +
                "img-src 'self' data: blob: https:; " +
                "font-src 'self' data: https: moz-extension: chrome-extension:; " +
                "connect-src 'self' ws: wss: http: https:;");
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
//# sourceMappingURL=static.js.map