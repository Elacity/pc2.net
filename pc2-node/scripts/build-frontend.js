#!/usr/bin/env node
/**
 * Build Frontend Script
 * 
 * Builds the ElastOS frontend and copies it to pc2-node/frontend/
 * This script is cross-platform compatible (works on Windows, macOS, Linux)
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, cpSync, rmSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Script is in pc2-node/test-fresh-install/scripts/, so go up 3 levels to project root
const PROJECT_ROOT = join(__dirname, '../../..');
const GUI_DIR = join(PROJECT_ROOT, 'src/gui');
const FRONTEND_DIST = join(GUI_DIR, 'dist');
// Target is pc2-node/test-fresh-install/frontend (relative to script location)
const TARGET_DIR = join(__dirname, '..', 'frontend');

async function main() {
  console.log('🔨 Building frontend...');
  console.log(`   GUI directory: ${GUI_DIR}`);
  console.log(`   Target directory: ${TARGET_DIR}`);

  // Check if GUI directory exists
  if (!existsSync(GUI_DIR)) {
    console.error(`❌ GUI directory not found: ${GUI_DIR}`);
    process.exit(1);
  }

  // Check if package.json exists in GUI directory
  const guiPackageJson = join(GUI_DIR, 'package.json');
  if (!existsSync(guiPackageJson)) {
    console.error(`❌ package.json not found in GUI directory: ${guiPackageJson}`);
    process.exit(1);
  }

  try {
    // Build frontend (use build:only to avoid infinite loop - build:only just runs build.js)
    console.log('\n📦 Running frontend build...');
    execSync('npm run build:only', {
      cwd: GUI_DIR,
      stdio: 'inherit'
    });
    
    // CRITICAL: Always copy bundle after build to ensure frontend directory has latest
    // This prevents serving stale bundles that cause debugging confusion

    // Check if dist directory was created
    if (!existsSync(FRONTEND_DIST)) {
      console.error(`❌ Build output not found: ${FRONTEND_DIST}`);
      process.exit(1);
    }

    // Create target directory if it doesn't exist
    if (!existsSync(TARGET_DIR)) {
      mkdirSync(TARGET_DIR, { recursive: true });
    }

    // Clean target directory (but keep .gitkeep)
    const gitkeepPath = join(TARGET_DIR, '.gitkeep');
    const hasGitkeep = existsSync(gitkeepPath);
    
    if (existsSync(TARGET_DIR)) {
      const files = readdirSync(TARGET_DIR);
      for (const file of files) {
        if (file !== '.gitkeep') {
          rmSync(join(TARGET_DIR, file), { recursive: true, force: true });
        }
      }
    }

    // Copy dist contents to target directory
    console.log('\n📋 Copying files to frontend directory...');
    cpSync(FRONTEND_DIST, TARGET_DIR, { recursive: true });

    // Copy SDK file to frontend/puter.js/v2
    const SDK_SOURCE = join(PROJECT_ROOT, 'src/puter-js/dist/puter.js');
    const SDK_TARGET_DIR = join(TARGET_DIR, 'puter.js');
    const SDK_TARGET = join(SDK_TARGET_DIR, 'v2');
    
    if (existsSync(SDK_SOURCE)) {
      console.log('\n📦 Copying SDK file...');
      if (!existsSync(SDK_TARGET_DIR)) {
        mkdirSync(SDK_TARGET_DIR, { recursive: true });
      }
      cpSync(SDK_SOURCE, SDK_TARGET);
      console.log(`   ✅ SDK copied: ${SDK_TARGET}`);
    } else {
      console.warn(`   ⚠️  SDK file not found: ${SDK_SOURCE}`);
      console.warn(`   ⚠️  Terminal app will proxy SDK from api.puter.com`);
    }

    // Restore .gitkeep if it existed
    if (hasGitkeep) {
      writeFileSync(gitkeepPath, '');
    }

    // Generate index.html if it doesn't exist
    const indexHtmlPath = join(TARGET_DIR, 'index.html');
    if (!existsSync(indexHtmlPath)) {
      console.log('\n📄 Generating index.html...');
      // Generate index.html with full initialization code
      const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ElastOS - Personal Cloud</title>
    <link rel="stylesheet" href="/bundle.min.css">
    
    <!-- Initialize API origin before SDK loads -->
    <script>
        // CRITICAL: Intercept WebSocket IMMEDIATELY, before ANY other code runs
        (function() {
            const OriginalWebSocket = window.WebSocket;
            window.WebSocket = function(url, protocols) {
                if (typeof url === 'string') {
                    if (url.includes('api.puter.com') || url.includes('puter.com')) {
                        let cleanUrl = url.replace(/:443/g, '');
                        const localOrigin = window.location.origin.replace(/^https?/, 'ws');
                        let localUrl = cleanUrl
                            .replace(/wss?:\\/\\/api\\.puter\\.com/g, localOrigin)
                            .replace(/https?:\\/\\/api\\.puter\\.com/g, localOrigin)
                            .replace(/wss?:\\/\\/puter\\.com/g, localOrigin)
                            .replace(/https?:\\/\\/puter\\.com/g, localOrigin);
                        console.log('[PC2]: 🔌 Intercepting WebSocket (EARLY):', url, '->', localUrl);
                        url = localUrl;
                    }
                }
                const ws = new OriginalWebSocket(url, protocols);
                if (url && typeof url === 'string' && url.includes('socket.io')) {
                    console.log('[PC2]: ✅ WebSocket created for:', url);
                }
                return ws;
            };
            Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);
            Object.defineProperty(window.WebSocket, 'prototype', {
                value: OriginalWebSocket.prototype,
                writable: false
            });
            Object.defineProperty(window.WebSocket, 'CONNECTING', { value: OriginalWebSocket.CONNECTING });
            Object.defineProperty(window.WebSocket, 'OPEN', { value: OriginalWebSocket.OPEN });
            Object.defineProperty(window.WebSocket, 'CLOSING', { value: OriginalWebSocket.CLOSING });
            Object.defineProperty(window.WebSocket, 'CLOSED', { value: OriginalWebSocket.CLOSED });
            console.log('[PC2]: ✅ WebSocket interceptor installed (EARLY)');
        })();
        
        // Auto-detect API origin from current page URL
        window.api_origin = window.location.origin;
        console.log('[PC2]: Auto-detected API origin:', window.api_origin);
        window.puter_gui_enabled = true;
        
        // Load stored auth token from localStorage
        const storedToken = localStorage.getItem('auth_token');
        if (storedToken) {
            window.auth_token = storedToken;
            console.log('[PC2]: ✅ Loaded auth token from localStorage, length:', storedToken.length, 'prefix:', storedToken.substring(0, 8) + '...');
        }
        
        // Extract auth_token from URL if present
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('auth_token') || urlParams.get('token');
        if (urlToken) {
            window.auth_token = urlToken;
            localStorage.setItem('auth_token', urlToken);
            console.log('[PC2]: ✅ Extracted auth token from URL, length:', urlToken.length, 'prefix:', urlToken.substring(0, 8) + '...');
            const newUrl = window.location.pathname + (window.location.hash || '');
            window.history.replaceState({}, '', newUrl);
        }
        
        // Intercept fetch calls to redirect api.puter.com to local server
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            const url = args[0];
            let options = args[1] || {};
            const token = window.auth_token || localStorage.getItem('auth_token') || null;
            
            if (typeof url === 'string') {
                if (url.includes('api.puter.com') || url.includes('puter.com')) {
                    let cleanUrl = url.replace(/:443/g, '');
                    const localOrigin = window.location.origin;
                    let localUrl = cleanUrl
                        .replace(/https?:\\/\\/api\\.puter\\.com/g, localOrigin)
                        .replace(/https?:\\/\\/puter\\.com/g, localOrigin);
                    console.log('[PC2]: Intercepting fetch:', url, '->', localUrl);
                    
                    if (token && (!options.headers || !options.headers['Authorization'])) {
                        options.headers = options.headers || {};
                        if (typeof options.headers === 'object' && !Array.isArray(options.headers)) {
                            options.headers['Authorization'] = 'Bearer ' + token;
                        }
                    }
                    
                    args[0] = localUrl;
                    args[1] = options;
                }
            }
            return originalFetch.apply(this, args);
        };
        
        // Intercept XMLHttpRequest to redirect and inject auth token
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
        
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this._url = url;
            this._originalMethod = method;
            
            if (typeof url === 'string') {
                if (url.includes('api.puter.com') || url.includes('puter.com')) {
                    let cleanUrl = url.replace(/:443/g, '');
                    const localOrigin = window.location.origin;
                    let localUrl = cleanUrl
                        .replace(/https?:\\/\\/api\\.puter\\.com/g, localOrigin)
                        .replace(/https?:\\/\\/puter\\.com/g, localOrigin);
                    console.log('[PC2]: Intercepting XHR:', url, '->', localUrl);
                    url = localUrl;
                    this._interceptedUrl = localUrl;
                    this._url = localUrl;
                }
            }
            return originalXHROpen.call(this, method, url, ...rest);
        };
        
        XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
            const token = window.auth_token || localStorage.getItem('auth_token') || null;
            if (this._interceptedUrl && header.toLowerCase() !== 'authorization') {
                if (token) {
                    originalXHRSetRequestHeader.call(this, 'Authorization', 'Bearer ' + token);
                }
            }
            return originalXHRSetRequestHeader.call(this, header, value);
        };
        
        const originalXHRSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(data) {
            const xhr = this;
            const originalOnReadyStateChange = xhr.onreadystatechange;
            const token = window.auth_token || localStorage.getItem('auth_token') || null;
            const url = this._interceptedUrl || this._url || '';
            const isLocalAPIRequest = url.includes('localhost:4202') || 
                                     url.includes(window.location.origin) ||
                                     (url.startsWith('/') && !url.startsWith('//'));
            
            if (isLocalAPIRequest && !url.includes('socket.io') && !url.includes('particle-auth')) {
                if (token) {
                    try {
                        originalXHRSetRequestHeader.call(this, 'Authorization', 'Bearer ' + token);
                        console.log('[PC2]: ✅ Injected auth token into XHR request:', url || 'local API', 'token:', token.substring(0, 8) + '...');
                    } catch (e) {
                        console.error('[PC2]: ❌ Failed to inject token:', e);
                    }
                }
            }
            
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    try {
                        const responseText = xhr.responseText;
                        if (responseText) {
                            const response = JSON.parse(responseText);
                            if (response.token || response.auth_token) {
                                const token = response.token || response.auth_token;
                                if (token.length === 64 && /^[0-9a-f]+$/i.test(token)) {
                                    window.auth_token = token;
                                    localStorage.setItem('auth_token', token);
                                    console.log('[PC2]: ✅ Captured real session token from response, length:', token.length, 'prefix:', token.substring(0, 8) + '...');
                                }
                            }
                        }
                    } catch (e) {
                        // Not JSON or parsing failed, ignore
                    }
                }
                if (originalOnReadyStateChange) {
                    originalOnReadyStateChange.call(this);
                }
            };
            
            return originalXHRSend.call(this, data);
        };
        
        window.puter_api_origin = window.location.origin;
        
        // Initialize service_script_api_promise
        let serviceScriptResolve, serviceScriptReject;
        const serviceScriptPromise = new Promise((resolve, reject) => {
            serviceScriptResolve = resolve;
            serviceScriptReject = reject;
        });
        const serviceScriptAPI = {
            then: serviceScriptPromise.then.bind(serviceScriptPromise),
            catch: serviceScriptPromise.catch.bind(serviceScriptPromise),
            finally: serviceScriptPromise.finally.bind(serviceScriptPromise),
            resolve: serviceScriptResolve,
            reject: serviceScriptReject
        };
        window.service_script_api_promise = serviceScriptAPI;
        globalThis.service_script_api_promise = serviceScriptAPI;
        
        window.service_script = async function(fn) {
            try {
                await fn(await window.service_script_api_promise);
            } catch (e) {
                console.error('service_script(ERROR)', e);
            }
        };
    </script>
</head>
<body>
    <div id="app"></div>
    <script src="/bundle.min.js"></script>
    <script src="/gui.js"></script>
    
    <!-- Initialize GUI -->
    <script type="text/javascript">
        // Wait for both scripts to load before initializing
        function initializeGUI() {
            console.log('[PC2]: Checking for gui function...');
            console.log('[PC2]: typeof gui:', typeof gui);
            console.log('[PC2]: typeof window.gui:', typeof window.gui);
            
            if (typeof gui === 'function' || typeof window.gui === 'function') {
                const guiFunc = gui || window.gui;
                console.log('[PC2]: ✅ gui() function found, initializing...');
                guiFunc({
                    gui_origin: window.location.origin, // CRITICAL: Use same origin for socket.io connection
                    api_origin: undefined, // Will auto-detect from window.location.origin
                    title: 'ElastOS',
                    max_item_name_length: 150,
                    require_email_verification_to_publish_website: false,
                    short_description: 'ElastOS is a privacy-first personal cloud that houses all your files, apps, and games in one private and secure place, accessible from anywhere at any time.',
                }).then(() => {
                    console.log('[PC2]: ✅ gui() initialization completed');
                }).catch((e) => {
                    console.error('[PC2]: ❌ gui() initialization failed:', e);
                    console.error('[PC2]: Error details:', e.stack || e.message);
                });
            } else {
                console.error('[PC2]: ❌ GUI function not found. typeof gui:', typeof gui, 'typeof window.gui:', typeof window.gui);
                console.error('[PC2]: Available window properties:', Object.keys(window).filter(k => k.includes('gui')));
                // Retry after a short delay in case scripts are still loading
                setTimeout(initializeGUI, 500);
            }
        }
        
        window.addEventListener('load', function() {
            console.log('[PC2]: Window loaded, initializing GUI...');
            // Small delay to ensure all scripts are loaded
            setTimeout(initializeGUI, 100);
        });
        
        // Also try immediately if DOM is already ready
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(initializeGUI, 100);
        }
    </script>
</body>
</html>`;
      writeFileSync(indexHtmlPath, HTML_TEMPLATE, 'utf8');
      console.log(`   ✅ Created: ${indexHtmlPath}`);
    }

    console.log('\n✅ Frontend build complete!');
    console.log(`   Files copied to: ${TARGET_DIR}`);
  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
  }
}

main();
