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

// Script is in pc2-node/scripts/, so go up 2 levels to project root
const PROJECT_ROOT = join(__dirname, '../..');
const GUI_DIR = join(PROJECT_ROOT, 'src/gui');
const FRONTEND_DIST = join(GUI_DIR, 'dist');
// Target is pc2-node/frontend (relative to script location)
const TARGET_DIR = join(__dirname, '..', 'frontend');

// Particle Auth paths - CRITICAL: Must sync after build to prevent stale bundles!
const PARTICLE_AUTH_SOURCE = join(PROJECT_ROOT, 'packages/particle-auth/dist');
const PARTICLE_AUTH_TARGET = join(PROJECT_ROOT, 'src/particle-auth');

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

    // Copy apps from src/backend/apps/ to frontend/apps/
    const APPS_SOURCE = join(PROJECT_ROOT, 'src/backend/apps');
    const APPS_TARGET = join(TARGET_DIR, 'apps');
    
    if (existsSync(APPS_SOURCE)) {
      console.log('\n📦 Copying apps directory...');
      if (!existsSync(APPS_TARGET)) {
        mkdirSync(APPS_TARGET, { recursive: true });
      }
      cpSync(APPS_SOURCE, APPS_TARGET, { recursive: true });
      console.log(`   ✅ Apps copied: ${APPS_TARGET}`);
    } else {
      console.warn(`   ⚠️  Apps directory not found: ${APPS_SOURCE}`);
    }

    // Copy WASM apps from pc2-node/wasm-apps/ to frontend/apps/ if they exist
    const WASM_APPS_SOURCE = join(__dirname, '..', 'wasm-apps');
    if (existsSync(WASM_APPS_SOURCE)) {
      console.log('\n📦 Copying WASM apps...');
      const wasmApps = readdirSync(WASM_APPS_SOURCE, { withFileTypes: true });
      for (const app of wasmApps) {
        if (app.isDirectory()) {
          const appSource = join(WASM_APPS_SOURCE, app.name);
          const appTarget = join(APPS_TARGET, app.name);
          if (!existsSync(appTarget)) {
            mkdirSync(appTarget, { recursive: true });
          }
          cpSync(appSource, appTarget, { recursive: true });
          console.log(`   ✅ WASM app copied: ${app.name}`);
        }
      }
    }

    // Copy static assets (setup wizard, update notifier, etc.)
    const STATIC_ASSETS_SOURCE = join(__dirname, '..', 'static-assets');
    if (existsSync(STATIC_ASSETS_SOURCE)) {
      console.log('\n📦 Copying static assets...');
      const staticAssets = readdirSync(STATIC_ASSETS_SOURCE, { withFileTypes: true });
      for (const asset of staticAssets) {
        const assetSource = join(STATIC_ASSETS_SOURCE, asset.name);
        const assetTarget = join(TARGET_DIR, asset.name);
        if (asset.isDirectory()) {
          if (!existsSync(assetTarget)) {
            mkdirSync(assetTarget, { recursive: true });
          }
          cpSync(assetSource, assetTarget, { recursive: true });
          console.log(`   ✅ Directory copied: ${asset.name}`);
        } else {
          cpSync(assetSource, assetTarget);
          console.log(`   ✅ File copied: ${asset.name}`);
        }
      }
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
                        const localOrigin = window.location.origin.replace(/^https/, 'wss').replace(/^http/, 'ws');
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
    <!-- PC2 Loading Screen - Shows immediately, hidden by JS when ready -->
    <div id="pc2-loading-screen">
        <div class="pc2-loading-content">
            <!-- Profile image or fallback (no spinner) -->
            <div id="pc2-loading-profile" class="pc2-loading-profile">
                <span class="pc2-loading-fallback">PC2</span>
            </div>
            <div class="pc2-loading-title">Personal Cloud</div>
            <div class="pc2-loading-bar-container">
                <div id="pc2-loading-bar" class="pc2-loading-bar"></div>
            </div>
            <div id="pc2-loading-status" class="pc2-loading-status">Initializing...</div>
        </div>
    </div>
    <style>
        #pc2-loading-screen {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background-color: #242424;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            transition: opacity 0.4s ease-out, visibility 0.4s ease-out;
        }
        #pc2-loading-screen.hidden {
            opacity: 0;
            visibility: hidden;
        }
        .pc2-loading-content {
            text-align: center;
        }
        .pc2-loading-profile {
            width: 100px;
            height: 100px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            margin: 0 auto 20px;
        }
        .pc2-loading-profile img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 50%;
        }
        .pc2-loading-fallback {
            color: rgba(255, 255, 255, 0.7);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 24px;
            font-weight: 600;
        }
        .pc2-loading-title {
            color: rgba(255, 255, 255, 0.9);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 18px;
            font-weight: 300;
            letter-spacing: 2px;
            margin-bottom: 30px;
        }
        .pc2-loading-bar-container {
            width: 200px;
            height: 3px;
            background: rgba(255, 255, 255, 0.15);
            border-radius: 2px;
            overflow: hidden;
            margin: 0 auto;
        }
        .pc2-loading-bar {
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #F59E0B 0%, #FBBF24 100%);
            border-radius: 2px;
            transition: width 0.3s ease-out;
            animation: pc2-loading-initial 2.5s ease-in-out forwards;
        }
        @keyframes pc2-loading-initial {
            0% { width: 0%; }
            20% { width: 15%; }
            40% { width: 30%; }
            60% { width: 45%; }
            80% { width: 60%; }
            100% { width: 70%; }
        }
        .pc2-loading-status {
            color: rgba(255, 255, 255, 0.5);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 12px;
            margin-top: 15px;
            min-height: 18px;
        }
    </style>
    <script>
        // Try to load cached profile picture immediately (user-specific)
        (function() {
            try {
                var profileEl = document.getElementById('pc2-loading-profile');
                if (!profileEl) return;
                
                // Try to get wallet address from localStorage cache
                var walletAddress = null;
                try {
                    var whoamiData = localStorage.getItem('pc2_whoami_cache');
                    if (whoamiData) {
                        var user = JSON.parse(whoamiData);
                        walletAddress = user.wallet_address || user.username;
                    }
                } catch (e) {}
                
                function loadProfilePicture(wallet) {
                    if (!wallet) wallet = 'unknown';
                    var normalizedWallet = wallet.toLowerCase();
                    var cachedCID = localStorage.getItem('pc2_profile_picture_cid_' + normalizedWallet);
                    var imageUrl = null;
                    var DEFAULT_PROFILE_PICTURE = '/images/elastos-icon-default.svg';
                    
                    if (cachedCID) {
                        imageUrl = '/ipfs/' + cachedCID;
                    } else {
                        imageUrl = localStorage.getItem('pc2_profile_picture_signed_url_' + normalizedWallet);
                    }
                    
                    if (!imageUrl) {
                        imageUrl = DEFAULT_PROFILE_PICTURE;
                    }
                    
                    var img = document.createElement('img');
                    img.src = imageUrl;
                    img.onerror = function() { 
                        if (imageUrl !== DEFAULT_PROFILE_PICTURE) {
                            this.src = DEFAULT_PROFILE_PICTURE;
                        } else {
                            this.style.display = 'none';
                        }
                    };
                    img.onload = function() {
                        var fallback = profileEl.querySelector('.pc2-loading-fallback');
                        if (fallback) fallback.style.display = 'none';
                    };
                    profileEl.insertBefore(img, profileEl.firstChild);
                }
                
                if (walletAddress) {
                    loadProfilePicture(walletAddress);
                }
            } catch (e) { /* ignore cache errors */ }
        })();
    </script>
    <script>
        // Loading screen helper functions (available immediately)
        window.updateLoadingStatus = function(message, progress) {
            var statusEl = document.getElementById('pc2-loading-status');
            var barEl = document.getElementById('pc2-loading-bar');
            if (statusEl) statusEl.textContent = message;
            if (barEl && typeof progress === 'number') {
                barEl.style.animation = 'none';
                barEl.style.width = progress + '%';
            }
        };
        window.hideLoadingScreen = function() {
            var screen = document.getElementById('pc2-loading-screen');
            if (screen) {
                screen.classList.add('hidden');
                setTimeout(function() { 
                    if (screen.parentNode) screen.parentNode.removeChild(screen); 
                }, 400);
            }
        };
    </script>
    
    <div id="app"></div>
    <script src="/bundle.min.js"></script>
    <script src="/gui.js"></script>
    
    <!-- Initialize GUI -->
    <script type="text/javascript">
        // CRITICAL: Guard against multiple initializations
        // IMPORTANT: Don't reset flags if already set (prevents re-init on script re-execution)
        if (typeof window._gui_init_started === 'undefined') {
            window._gui_init_started = false;
        }
        if (typeof window._gui_init_completed === 'undefined') {
            window._gui_init_completed = false;
        }
        
        // Only define initializeGUI once
        if (!window._initializeGUI_defined) {
            window._initializeGUI_defined = true;
            
            window.initializeGUI = function() {
                // Guard: Only initialize once
                if (window._gui_init_started || window._gui_init_completed) {
                    return;
                }
                window._gui_init_started = true;
                
                if (typeof gui === 'function' || typeof window.gui === 'function') {
                    const guiFunc = gui || window.gui;
                    guiFunc({
                        gui_origin: window.location.origin,
                        api_origin: undefined,
                        title: 'ElastOS',
                        max_item_name_length: 150,
                        require_email_verification_to_publish_website: false,
                        short_description: 'ElastOS is a privacy-first personal cloud.',
                    }).then(() => {
                        window._gui_init_completed = true;
                    }).catch((e) => {
                        console.error('[PC2]: GUI init failed:', e);
                        // Only allow retry if we haven't completed initialization
                        if (!window._gui_init_completed) {
                            window._gui_init_started = false;
                        }
                    });
                } else {
                    window._gui_init_started = false; // Allow retry
                    setTimeout(window.initializeGUI, 500);
                }
            };
            
            // Only add event listener once
            window.addEventListener('load', function() {
                if (!window._gui_init_started && !window._gui_init_completed) {
                    setTimeout(window.initializeGUI, 100);
                }
            });
        }
        
        // Initial trigger (but guard against re-execution)
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            if (!window._gui_init_started && !window._gui_init_completed) {
                setTimeout(window.initializeGUI, 100);
            }
        }
    </script>
</body>
</html>`;
      writeFileSync(indexHtmlPath, HTML_TEMPLATE, 'utf8');
      console.log(`   ✅ Created: ${indexHtmlPath}`);
    }

    // CRITICAL: Sync particle-auth build to src/particle-auth
    // The server checks multiple paths and src/particle-auth is found FIRST
    // If we don't sync, stale bundles will be served causing debugging nightmares
    if (existsSync(PARTICLE_AUTH_SOURCE)) {
      console.log('\n📦 Syncing particle-auth build...');
      
      // Remove old particle-auth directory
      if (existsSync(PARTICLE_AUTH_TARGET)) {
        rmSync(PARTICLE_AUTH_TARGET, { recursive: true, force: true });
        console.log('   🗑️  Removed old particle-auth');
      }
      
      // Copy fresh build
      cpSync(PARTICLE_AUTH_SOURCE, PARTICLE_AUTH_TARGET, { recursive: true });
      console.log(`   ✅ Synced particle-auth: ${PARTICLE_AUTH_SOURCE} → ${PARTICLE_AUTH_TARGET}`);
    } else {
      console.warn(`\n⚠️  particle-auth dist not found: ${PARTICLE_AUTH_SOURCE}`);
      console.warn('   Run: cd packages/particle-auth && npm run build');
    }

    console.log('\n✅ Frontend build complete!');
    console.log(`   Files copied to: ${TARGET_DIR}`);
  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
  }
}

main();
