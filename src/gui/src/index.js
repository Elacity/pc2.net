/**
 * Copyright (C) 2024-present Puter Technologies Inc.
 *
 * This file is part of Puter.
 *
 * Puter is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// CRITICAL: Prevent gui.js from executing multiple times
// This can happen when Particle Auth iframes trigger page events
if (window._gui_js_executed) {
    console.log('[gui.js] Already executed, halting');
    // Use throw to halt module execution - can't use return at module level
    throw new Error('[gui.js] Duplicate execution prevented');
}
window._gui_js_executed = true;

window.puter_gui_enabled = true;

// Debug flag for PC2 initialization logging
const PC2_DEBUG = false;

/**
 * Initializes and configures the GUI (Graphical User Interface) settings based on the provided options.
 *
 * The function sets global variables in the window object for various settings such as origins and domain names.
 * It also handles loading different resources depending on the environment (development or production).
 *
 * @param {Object} options - Configuration options to initialize the GUI.
 * @param {string} [options.gui_origin='https://puter.com'] - The origin URL for the GUI.
 * @param {string} [options.api_origin='https://api.puter.com'] - The origin URL for the API.
 * @param {number} [options.max_item_name_length=500] - Maximum allowed length for an item name.
 * @param {boolean} [options.require_email_verification_to_publish_website=true] - Flag to decide whether email verification is required to publish a website.
 * @param {boolean} [options.disable_temp_users=false] - Flag to disable auto-generated temporary users.
 *
 * @property {string} [options.app_domain] - Extracted domain name from gui_origin. It's derived automatically if not provided.
 * @property {string} [window.gui_env] - The environment in which the GUI is running (e.g., "dev" or "prod").
 *
 * @returns {Promise<void>} Returns a promise that resolves when initialization and resource loading are complete.
 *
 * @example
 * window.gui({
 *     gui_origin: 'https://myapp.com',
 *     api_origin: 'https://myapi.com',
 *     max_item_name_length: 250
 * });
 */

window.gui = async (options) => {
    // CRITICAL: Prevent gui() from being called multiple times
    if (window._gui_function_executed) {
        console.log('[gui.js] gui() already executed, skipping');
        return;
    }
    window._gui_function_executed = true;
    
    options = options ?? {};
    // app_origin is deprecated, use gui_origin instead
    window.gui_params = options;
    window.gui_origin = options.gui_origin ?? options.app_origin ?? 'https://puter.com';
    window.app_domain = options.app_domain ?? new URL(window.gui_origin).hostname;
    window.hosting_domain = options.hosting_domain ?? 'puter.site';
    
    // 🚀 Check for PC2 node connection BEFORE setting api_origin
    // This ensures PC2 node URL is used instead of api.puter.com
    let pc2ApiOrigin = null;
    try {
        const savedConfig = localStorage.getItem('pc2_config');
        const savedSession = localStorage.getItem('pc2_session');
        PC2_DEBUG && PC2_DEBUG && console.log('[PC2]: Checking localStorage for PC2 config...', { hasConfig: !!savedConfig, hasSession: !!savedSession });
        if (savedConfig && savedSession) {
            const config = JSON.parse(savedConfig);
            const sessionData = JSON.parse(savedSession);
            const now = Date.now();
            const sessionAge = now - (sessionData.timestamp || 0);
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
            PC2_DEBUG && PC2_DEBUG && console.log('[PC2]: Config check:', { nodeUrl: config?.nodeUrl, hasToken: !!sessionData?.session?.token, sessionAge, maxAge, isValid: sessionAge < maxAge });
            if (config?.nodeUrl && sessionData?.session?.token && sessionAge < maxAge) {
                pc2ApiOrigin = config.nodeUrl.replace(/\/+$/, '');
                PC2_DEBUG && PC2_DEBUG && console.log('[PC2]: ✅ Early API origin set to PC2 node:', pc2ApiOrigin);
            } else {
                PC2_DEBUG && console.log('[PC2]: ⚠️ PC2 config exists but session invalid or expired');
            }
        } else {
            PC2_DEBUG && console.log('[PC2]: ⚠️ No PC2 config/session in localStorage');
        }
    } catch (e) {
        console.warn('[PC2]: Failed to check PC2 config, using default API origin:', e);
    }
    
    // Set api_origin - use PC2 node if available, otherwise use default
    // PHASE 1: Auto-detect same origin if api_origin is undefined (Puter on PC2 architecture)
    // Priority: 1) Same origin (if already set by HTML), 2) PC2 config, 3) Same origin (auto-detect), 4) Default
    
    // Check if window.api_origin was already set by HTML to same origin
    const currentApiOrigin = typeof window !== 'undefined' ? window.api_origin : null;
    const currentOrigin = typeof window !== 'undefined' && window.location ? window.location.origin : null;
    const isAlreadySameOrigin = currentApiOrigin && currentOrigin && currentApiOrigin === currentOrigin;
    
    if (isAlreadySameOrigin) {
        // Already set to same origin by HTML - keep it!
        PC2_DEBUG && console.log('[PC2]: ✅ Same-origin API already set by HTML:', currentApiOrigin);
        // Don't change it - it's already correct
    } else if (pc2ApiOrigin) {
        // Use PC2 node from config
        window.api_origin = pc2ApiOrigin;
        PC2_DEBUG && console.log('[PC2]: ✅ Using PC2 node from config:', pc2ApiOrigin);
    } else if (!options.api_origin && currentOrigin) {
        // If no api_origin provided, use same origin (frontend and backend on same server)
        window.api_origin = currentOrigin;
        PC2_DEBUG && console.log('[PC2]: 🚀 Same-origin detected (Puter on PC2), using:', window.api_origin);
    } else {
        // Legacy: If we're on elastos.localhost or puter.localhost (local dev), default to mock PC2 server
        const hostname = typeof window !== 'undefined' && window.location ? window.location.hostname : '';
        PC2_DEBUG && console.log('[PC2]: Current hostname:', hostname);
        if (!pc2ApiOrigin && (hostname === 'elastos.localhost' || hostname === 'puter.localhost' || hostname === 'localhost' || hostname.includes('localhost'))) {
            pc2ApiOrigin = 'http://127.0.0.1:4200';
            PC2_DEBUG && console.log('[PC2]: 🚀 Local dev detected, defaulting to mock PC2 server:', pc2ApiOrigin);
        }
        
        // Only set default if we don't already have a same-origin API set
        if (!currentApiOrigin || currentApiOrigin !== currentOrigin) {
            window.api_origin = pc2ApiOrigin || options.api_origin || 'https://api.puter.com';
            PC2_DEBUG && console.log('[PC2]: Final window.api_origin set to:', window.api_origin);
        } else {
            PC2_DEBUG && console.log('[PC2]: ✅ Preserving same-origin API:', currentApiOrigin);
        }
    }
    
    // Protect window.api_origin from being overwritten by SDK
    // PHASE 1: If we're on same origin (Puter on PC2), protect it from being changed
    const isSameOrigin = typeof window !== 'undefined' && window.location && 
                        window.api_origin === window.location.origin;
    
    let _protectedApiOrigin = window.api_origin;
    Object.defineProperty(window, 'api_origin', {
        get: function() {
            return _protectedApiOrigin;
        },
        set: function(value) {
            // PHASE 1: If same origin is set, never allow it to be changed
            if (isSameOrigin && value !== window.location.origin) {
                console.warn('[PC2]: ⚠️ Attempted to overwrite same-origin API with:', value, '- keeping same origin:', _protectedApiOrigin);
                return; // Don't allow overwriting same origin
            }
            
            // Only allow setting if it's the PC2 node URL or if we haven't set a PC2 URL
            if (pc2ApiOrigin && value !== pc2ApiOrigin && !value.includes('127.0.0.1:4200') && !value.includes('localhost:4200')) {
                console.warn('[PC2]: ⚠️ Attempted to overwrite api_origin with:', value, '- keeping PC2 node URL:', _protectedApiOrigin);
                return; // Don't allow overwriting
            }
            // Also protect against api.puter.localhost construction
            if (value && value.includes('api.puter.localhost')) {
                console.warn('[PC2]: ⚠️ SDK tried to set api.puter.localhost, redirecting to PC2 node:', _protectedApiOrigin);
                return; // Don't allow api.puter.localhost
            }
            // Also protect against api.puter.com when we have same origin
            if (isSameOrigin && value && value.includes('api.puter.com')) {
                console.warn('[PC2]: ⚠️ SDK tried to set api.puter.com, keeping same origin:', _protectedApiOrigin);
                return; // Don't allow api.puter.com when same origin is set
            }
            PC2_DEBUG && console.log('[PC2]: api_origin changed to:', value);
            _protectedApiOrigin = value;
        },
        configurable: true
    });
    window.max_item_name_length = options.max_item_name_length ?? 500;
    window.require_email_verification_to_publish_website = options.require_email_verification_to_publish_website ?? true;
    window.disable_temp_users = options.disable_temp_users ?? false;
    window.co_isolation_enabled = options.co_isolation_enabled;

    // 🚀 Ensure window.api_origin is set and protected BEFORE SDK loads
    // This prevents SDK from using default api.puter.com during initialization
    PC2_DEBUG && console.log('[PC2]: Pre-SDK load - window.api_origin:', window.api_origin);
    
    // DEV: Load the initgui.js file if we are in development mode
    if ( !window.gui_env || window.gui_env === 'dev' ) {
        await window.loadScript('/sdk/puter.dev.js');
        // Immediately set API origin after SDK loads
        if (window.puter && typeof window.puter.setAPIOrigin === 'function') {
            PC2_DEBUG && console.log('[PC2]: SDK loaded, setting API origin to:', window.api_origin);
            window.puter.setAPIOrigin(window.api_origin);
        }
    }

    if ( window.gui_env === 'dev2' ) {
        await window.loadScript('/puter.js/v2');
        await window.loadCSS('/dist/bundle.min.css');
        if (window.puter && typeof window.puter.setAPIOrigin === 'function') {
            PC2_DEBUG && console.log('[PC2]: SDK loaded, setting API origin to:', window.api_origin);
            window.puter.setAPIOrigin(window.api_origin);
        }
    }

    // PROD: load the minified bundles if we are in production mode
    // note: the order of the bundles is important
    // note: Build script will prepend `window.gui_env="prod"` to the top of the file
    else if ( window.gui_env === 'prod' ) {
        await window.loadScript('https://js.puter.com/v2/');
        // Load the minified bundles
        await window.loadCSS('/dist/bundle.min.css');
        if (window.puter && typeof window.puter.setAPIOrigin === 'function') {
            PC2_DEBUG && console.log('[PC2]: SDK loaded, setting API origin to:', window.api_origin);
            window.puter.setAPIOrigin(window.api_origin);
        }
    }

    // Load Cloudflare Turnstile script
    await window.loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js', { defer: true });

    // 🚀 Launch the GUI 🚀
    try {
        await window.initgui(options);
    } catch (error) {
        console.error('[PC2]: ❌ initgui() failed:', error);
        throw error; // Re-throw so the caller can handle it
    }
};

/**
* Dynamically loads an external JavaScript file.
* @param {string} url The URL of the external script to load.
* @param {Object} [options] Optional configuration for the script.
* @param {boolean} [options.isModule] Whether the script is a module.
* @param {boolean} [options.defer] Whether the script should be deferred.
* @param {Object} [options.dataAttributes] An object containing data attributes to add to the script element.
* @returns {Promise} A promise that resolves once the script has loaded, or rejects on error.
*/
window.loadScript = async function (url, options = {}) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;

        // Set default script loading behavior
        script.async = true;

        // Handle if it is a module
        if ( options.isModule ) {
            script.type = 'module';
        }

        // Handle defer attribute
        if ( options.defer ) {
            script.defer = true;
            script.async = false; // When "defer" is true, "async" should be false as they are mutually exclusive
        }

        // Add arbitrary data attributes
        if ( options.dataAttributes && typeof options.dataAttributes === 'object' ) {
            for ( const [key, value] of Object.entries(options.dataAttributes) ) {
                script.setAttribute(`data-${key}`, value);
            }
        }

        // Resolve the promise when the script is loaded
        script.onload = () => resolve();

        // Reject the promise if there's an error during load
        script.onerror = (error) => reject(new Error(`Failed to load script at url: ${url}`));

        // Append the script to the body
        document.body.appendChild(script);
    });
};

/**
* Dynamically loads an external CSS file.
* @param {string} url The URL of the external CSS to load.
* @returns {Promise} A promise that resolves once the CSS has loaded, or rejects on error.
*/
window.loadCSS = async function (url) {
    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;

        link.onload = () => {
            resolve();
        };

        link.onerror = (error) => {
            reject(new Error(`Failed to load CSS at url: ${url}`));
        };

        document.head.appendChild(link);
    });
};
// Self-XSS warning - only show once
if (!window._self_xss_warning_shown) {
    window._self_xss_warning_shown = true;
    console.log("%c⚠️Warning⚠️\n%cPlease refrain from adding or pasting any sort of code here, as doing so could potentially compromise your account. \nYou don't get what you intended anyway, but the hacker will! \n\n%cFor further information please visit https://developer.chrome.com/blog/self-xss",
                    "color:red; font-size:2rem; display:block; margin-left:0; margin-bottom: 20px; background: black; width: 100%; margin-top:20px; font-family: 'Helvetica Neue', HelveticaNeue, Helvetica, Arial, sans-serif;",
                    "font-size:1rem; font-family: 'Helvetica Neue', HelveticaNeue, Helvetica, Arial, sans-serif;",
                    "font-size:0.9rem; font-family: 'Helvetica Neue', HelveticaNeue, Helvetica, Arial, sans-serif;");
}
