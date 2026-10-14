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


// Debug flag for initgui logging
const INITGUI_DEBUG = false;

// PC2 GUI build marker (v1.2.1 hotfix). Mirrors the particle-auth marker
// so we can verify the user is running the latest GUI bundle (not a
// browser-cached stale copy) when triaging logout / signing reports.
console.log('[PC2 GUI]: BUILD v2026.04.30.pc2net.wcsigning-hardening loaded');

// CRITICAL: Guard against multiple initgui.js executions
// This can happen when Particle Auth iframes trigger page events
if (window._initgui_js_loaded) {
    console.log('[initgui.js] Already loaded, skipping module re-execution');
}
window._initgui_js_loaded = true;

// ============================================================
// Theme Initialization - Apply IMMEDIATELY to prevent flash
// PC2 defaults to dark mode. Light mode only if explicitly set.
// ============================================================
(function initTheme() {
    try {
        const savedDarkMode = localStorage.getItem('pc2_dark_mode');
        console.log('[initgui.js] Theme check - localStorage pc2_dark_mode:', savedDarkMode);
        
        // Dark mode is default (null/undefined/'true' all mean dark)
        // Only light mode if explicitly set to 'false'
        const isLightMode = savedDarkMode === 'false';
        
        if (isLightMode) {
            document.documentElement.setAttribute('data-theme', 'light');
            console.log('[initgui.js] Applied LIGHT theme');
        } else {
            // Explicitly remove any stale light theme attribute to ensure dark mode
            document.documentElement.removeAttribute('data-theme');
            console.log('[initgui.js] Applied DARK theme (default)');
        }
    } catch (e) {
        console.warn('[initgui.js] Theme initialization failed:', e);
    }
})();

import UIDesktop from './UI/UIDesktop.js'
import UIWindow from './UI/UIWindow.js'
import UIAlert from './UI/UIAlert.js'
import UIWindowParticleLogin from './UI/UIWindowParticleLogin.js';
import UIWindowSignup from './UI/UIWindowSignup.js';
import path from "./lib/path.js";
import UIWindowSaveAccount from './UI/UIWindowSaveAccount.js';
import UIWindowNewPassword from './UI/UIWindowNewPassword.js';
import UIWindowLoginInProgress from './UI/UIWindowLoginInProgress.js';
import UIWindowEmailConfirmationRequired from './UI/UIWindowEmailConfirmationRequired.js';
import UIWindowSessionList from './UI/UIWindowSessionList.js';
import UIWindowRequestPermission from './UI/UIWindowRequestPermission.js';
import UIWindowChangeUsername from './UI/UIWindowChangeUsername.js';
import update_last_touch_coordinates from './helpers/update_last_touch_coordinates.js';
import update_title_based_on_uploads from './helpers/update_title_based_on_uploads.js';
import { ThemeService } from './services/ThemeService.js';
import { BroadcastService } from './services/BroadcastService.js';
import { ProcessService } from './services/ProcessService.js';
import { PROCESS_RUNNING } from './definitions.js';
import { LocaleService } from './services/LocaleService.js';
import { SettingsService } from './services/SettingsService.js';
import UIComponentWindow from './UI/UIComponentWindow.js';
import update_mouse_position from './helpers/update_mouse_position.js';
import { LaunchOnInitService } from './services/LaunchOnInitService.js';
import item_icon from './helpers/item_icon.js';
import { AntiCSRFService } from './services/AntiCSRFService.js';
import { IPCService } from './services/IPCService.js';
import { ExecService } from './services/ExecService.js';
import { DebugService } from './services/DebugService.js';
import { AIToolService } from './services/AIToolService.js';
import { privacy_aware_path } from './util/desktop.js';
import initKeyboardShortcuts from './helpers/keyboard_shortcuts.js';
import './UI/UIUpdateModal.js'; // Update notification system

// DEBUG: Add global message listener to see ALL messages before xd-incoming filtering
// Also try to directly call ipc_listener if xd-incoming is filtering it out
// Guard: Only register once
if (typeof window !== 'undefined' && !window._initgui_message_listener_registered) {
    window._initgui_message_listener_registered = true;
    window.addEventListener('message', async (event) => {
        if (event.data && (event.data.msg === 'showSaveFilePicker' || event.data.msg === 'showOpenFilePicker')) {
            const sourceInfo = event.source ? (event.source === window ? 'self' : (event.source.location ? 'cross-origin-frame' : 'unknown-source')) : 'no-source';
            INITGUI_DEBUG && console.log('[initgui.js]: 🔍 RAW window message received:', event.data.msg, 'appInstanceID:', event.data.appInstanceID, 'env:', event.data.env, 'origin:', event.origin, 'source:', sourceInfo, 'full data:', event.data);
            
            // Try to directly call ipc_listener if it's available (bypass xd-incoming filter)
            if (window.ipc_listener_direct) {
                INITGUI_DEBUG && console.log('[initgui.js]: 🚀 Attempting direct ipc_listener call (bypassing xd-incoming)');
                const handled = { resolve: (val) => INITGUI_DEBUG && console.log('[initgui.js]: ipc_listener handled:', val) };
                try {
                    await window.ipc_listener_direct(event, handled);
                } catch (e) {
                    INITGUI_DEBUG && console.error('[initgui.js]: Direct ipc_listener call failed:', e);
                }
            }
        }
    }, false);
    INITGUI_DEBUG && console.log('[initgui.js]: ✅ Global message listener registered');
}

const launch_services = async function (options) {
    // === Services Data Structures ===
    const services_l_ = [];
    const services_m_ = {};
    globalThis.services = {
        get: (name) => services_m_[name],
        emit: (id, args) => {
            for (const [_, instance] of services_l_) {
                instance.__on(id, args ?? []);
            }
        }
    };
    const register = (name, instance) => {
        services_l_.push([name, instance]);
        services_m_[name] = instance;
    }

    globalThis.def(UIComponentWindow, 'ui.UIComponentWindow');

    // === Hooks for Service Scripts from Backend ===
    const service_script_deferred = { services: [], on_ready: [] };
    const service_script_api = {
        register: (...a) => service_script_deferred.services.push(a),
        on_ready: fn => service_script_deferred.on_ready.push(fn),
        // Some files can't be imported by service scripts,
        // so this hack makes that possible.
        def: globalThis.def,
        use: globalThis.use,
        // use: name => ({ UIWindow, UIComponentWindow })[name],
    };
    globalThis.service_script_api_promise.resolve(service_script_api);

    // === Builtin Services ===
    register('ipc', new IPCService());
    register('exec', new ExecService());
    register('debug', new DebugService());
    register('broadcast', new BroadcastService());
    register('theme', new ThemeService());
    register('process', new ProcessService());
    register('locale', new LocaleService());
    register('settings', new SettingsService());
    register('anti-csrf', new AntiCSRFService());
    register('ai-tool', new AIToolService());
    register('__launch-on-init', new LaunchOnInitService());

    // === Service-Script Services ===
    for (const [name, script] of service_script_deferred.services) {
        register(name, script);
    }

    for (const [_, instance] of services_l_) {
        await instance.construct({
            gui_params: options,
        });
    }

    for (const [_, instance] of services_l_) {
        await instance.init({
            services: globalThis.services,
        });
    }

    // === Service-Script Ready ===
    for (const fn of service_script_deferred.on_ready) {
        await fn();
    }

    // Set init process status
    {
        const svc_process = globalThis.services.get('process');
        svc_process.get_init().chstatus(PROCESS_RUNNING);
    }
};

// This code snippet addresses the issue flagged by Lighthouse regarding the use of
// passive event listeners to enhance scrolling performance. It provides custom
// implementations for touchstart, touchmove, wheel, and mousewheel events in jQuery.
// By setting the 'passive' option appropriately, it ensures that default browser
// behavior is prevented when necessary, thereby improving page scroll performance.
// More info: https://stackoverflow.com/a/62177358
if(jQuery){
    jQuery.event.special.touchstart = {
        setup: function( _, ns, handle ) {
            this.addEventListener("touchstart", handle, { passive: !ns.includes("noPreventDefault") });
        }
    };
    jQuery.event.special.touchmove = {
        setup: function( _, ns, handle ) {
            this.addEventListener("touchmove", handle, { passive: !ns.includes("noPreventDefault") });
        }
    };
    jQuery.event.special.wheel = {
        setup: function( _, ns, handle ){
            this.addEventListener("wheel", handle, { passive: true });
        }
    };
    jQuery.event.special.mousewheel = {
        setup: function( _, ns, handle ){
            this.addEventListener("mousewheel", handle, { passive: true });
        }
    };
}

window.initgui = async function(options){
    // CRITICAL: Skip initialization if we're inside an iframe
    // The particle-auth creates hidden iframes that load copies of the main page
    // These iframe copies should NOT run initgui
    if (window !== window.top) {
        INITGUI_DEBUG && console.log('[initgui]: ⚠️ BLOCKED - running inside iframe, skipping');
        return;
    }
    
    // Also skip if this is the particle-auth page
    if (window.location.pathname.includes('particle-auth')) {
        INITGUI_DEBUG && console.log('[initgui]: ⚠️ BLOCKED - particle-auth page, skipping');
        return;
    }
    
    // Use DOM-based guard as backup
    const GUARD_ID = '__pc2_initgui_guard__';
    const existingGuard = document.getElementById(GUARD_ID);
    
    if (existingGuard) {
        INITGUI_DEBUG && console.log('[initgui]: ⚠️ BLOCKED by DOM guard - initgui() already ran');
        return;
    }
    
    // Create DOM guard element IMMEDIATELY before any async work
    const guard = document.createElement('div');
    guard.id = GUARD_ID;
    guard.style.display = 'none';
    document.body.appendChild(guard);
    INITGUI_DEBUG && console.log('[initgui]: ✅ Running in top window, starting initialization...');
    
    window.initgui_in_progress = true;
    // 🚀 Initialize PC2ConnectionService EARLY to set API origin before SDK initializes
    // PC2 is self-hosted: all API calls go to same origin (no external services)
    try {
        const { getPC2Service } = await import('./services/PC2ConnectionService.js');
        getPC2Service(); // Initialize singleton - this will set window.api_origin if session exists
    } catch (e) {
        console.warn('[initgui]: Failed to initialize PC2ConnectionService early:', e);
    }
    
    const url = new URL(window.location).href;
    INITGUI_DEBUG && console.log('[initgui]: URL:', url);
    window.url = url;
    const url_paths = window.location.pathname.split('/').filter(element => element);
    window.url_paths = url_paths

    let picked_a_user_for_sdk_login = false;
    
    // Initialize url_query_params early so it's available for all code
    // This must be done before any code tries to use window.url_query_params
    if (!window.url_query_params) {
        window.url_query_params = new URLSearchParams(window.location.search);
    }

    // Check for auth token in URL params (for apps launched with token)
    // This handles 'puter.auth.token' param that apps receive when launched
    const urlAuthToken = window.url_query_params.get('puter.auth.token');
    if (urlAuthToken) {
        INITGUI_DEBUG && console.log('[initgui]: Found puter.auth.token in URL params, setting SDK auth token');
        puter.setAuthToken(urlAuthToken);
        window.auth_token = urlAuthToken;
    }
    
    // Check for API origin in URL params (for apps)
    const urlApiOrigin = window.url_query_params.get('puter.api_origin');
    if (urlApiOrigin) {
        INITGUI_DEBUG && console.log('[initgui]: Found puter.api_origin in URL params, setting SDK API origin:', urlApiOrigin);
        puter.setAPIOrigin(urlApiOrigin);
        window.api_origin = urlApiOrigin;
    }

    // update SDK if auth_token is different from the one in the SDK
    if(window.auth_token && puter.authToken !== window.auth_token)
        puter.setAuthToken(window.auth_token);
    // update SDK if api_origin is different from the one in the SDK
    if(window.api_origin && puter.APIOrigin !== window.api_origin)
        puter.setAPIOrigin(window.api_origin);

    // Print the version to the console (only once)
    if (!window._puter_version_printed) {
        window._puter_version_printed = true;
        puter.os.version()
        .then(res => {
            const deployed_date = new Date(res.deploy_timestamp);
            console.log(`Your Puter information:\n• Version: ${(res.version)}\n• Server: ${(res.location)}\n• Deployed: ${(deployed_date)}`);
        })
        .catch(error => {
            console.error("Failed to fetch server info:", error);
        });
    }

    // Checks the type of device the user is on (phone, tablet, or desktop).
    // Depending on the device type, it sets a class attribute on the body tag
    // to style or script the page differently for each device type.
    if(isMobile.phone)
        $('body').attr('class', 'device-phone');
    else if(isMobile.tablet)
        $('body').attr('class', 'device-tablet');
    else
        $('body').attr('class', 'device-desktop');

    // Appends a meta tag to the head of the document specifying the character encoding to be UTF-8.
    // This ensures that special characters and symbols display correctly across various platforms and browsers.
    $('head').append(`<meta charset="utf-8">`);

    // Appends a viewport meta tag to the head of the document, ensuring optimal display on mobile devices.
    // This tag sets the width of the viewport to the device width, and locks the zoom level to 1 (prevents user scaling).
    $('head').append(`<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">`);

    // GET query params provided (already initialized earlier, but ensure it exists here for compatibility)
    if (!window.url_query_params) {
        window.url_query_params = new URLSearchParams(window.location.search);
    }

    // will hold the result of the whoami API call
    let whoami;

    //--------------------------------------------------------------------------------------
    // Extract 'action' from URL
    //--------------------------------------------------------------------------------------
    let action;
    if (window.url_paths[0]?.toLocaleLowerCase() === 'action' && window.url_paths[1]) {
        action = window.url_paths[1].toLowerCase();
    }
    
    //--------------------------------------------------------------------------------------
    // Determine if we are in full-page mode
    // i.e. https://puter.com/app/<app_name>/?puter.fullpage=true
    //--------------------------------------------------------------------------------------
    if(window.url_query_params.has('puter.fullpage') && (window.url_query_params.get('puter.fullpage') === 'false' || window.url_query_params.get('puter.fullpage') === '0')){
        window.is_fullpage_mode = false;
    }else if(window.url_query_params.has('puter.fullpage') && (window.url_query_params.get('puter.fullpage') === 'true' || window.url_query_params.get('puter.fullpage') === '1')){
        // In fullpage mode, we want to hide the taskbar for better UX
        window.taskbar_height = 0;

        // Puter is in fullpage mode.
        window.is_fullpage_mode = true;
    }

    // Launch services before any UI is rendered
    await launch_services(options);

    //--------------------------------------------------------------------------------------
    // Is attempt_temp_user_creation?
    // i.e. https://puter.com/?attempt_temp_user_creation=true
    //--------------------------------------------------------------------------------------
    if(window.url_query_params.has('attempt_temp_user_creation') && (window.url_query_params.get('attempt_temp_user_creation') === 'true' || window.url_query_params.get('attempt_temp_user_creation') === '1')){
        window.attempt_temp_user_creation = true;
    }

    //--------------------------------------------------------------------------------------
    // Is GUI embedded in a popup?
    // i.e. https://puter.com/?embedded_in_popup=true
    //--------------------------------------------------------------------------------------
    if(window.url_query_params.has('embedded_in_popup') && (window.url_query_params.get('embedded_in_popup') === 'true' || window.url_query_params.get('embedded_in_popup') === '1')){
        window.embedded_in_popup = true;
        $('body').addClass('embedded-in-popup');

        // determine the origin of the opener
        window.openerOrigin = document.referrer;

        // if no referrer, request it from the opener via messaging
        if(!document.referrer){
            try{
                window.openerOrigin = await requestOpenerOrigin();
            }catch(e){
                throw new Error('No referrer found');
            }
        }

        // this is the referrer in terms of user acquisition
        window.referrerStr = window.openerOrigin;

        if(action === 'sign-in' && !window.is_auth() && !(window.attempt_temp_user_creation && window.first_visit_ever)){
            // show signup window
            if(await UIWindowSignup({
                reload_on_success: false,
                send_confirmation_code: false,
                show_close_button: false,
                window_options:{
                    has_head: false,
                    cover_page: true,
                }
            }))
                await window.getUserAppToken(window.openerOrigin);
        }
        else if(action === 'sign-in' && window.is_auth() && !(window.attempt_temp_user_creation && window.first_visit_ever)){
            picked_a_user_for_sdk_login = await UIWindowSessionList({
                reload_on_success: false,
                draggable_body: false,
                has_head: false,
                cover_page: true,
            });

            if(picked_a_user_for_sdk_login){
                await window.getUserAppToken(window.openerOrigin);
            }

        }
    }
    
    //--------------------------------------------------------------------------------------
    // Display an error if the query parameters have an error
    //--------------------------------------------------------------------------------------
    if ( window.url_query_params.has('error') ) {
        // TODO: i18n
        await UIAlert({
            message: window.url_query_params.get('message')
        });
    }

    //--------------------------------------------------------------------------------------
    // Get user referral code from URL query params
    // i.e. https://puter.com/?r=123456
    //--------------------------------------------------------------------------------------
    if(window.url_query_params.has('r')){
        window.referral_code = window.url_query_params.get('r');
        // remove 'r' from URL
        window.history.pushState(null, document.title, '/');
        // show referral notice, this will be used later if Desktop is loaded
        if(window.first_visit_ever){
            window.show_referral_notice = true;
        }
    }

    //--------------------------------------------------------------------------------------
    // Action: Request Permission
    //--------------------------------------------------------------------------------------
    if(action === 'request-permission'){
        let app_uid = window.url_query_params.get('app_uid');
        let origin = window.openerOrigin ?? window.url_query_params.get('origin');
        let permission = window.url_query_params.get('permission');

        let granted = await UIWindowRequestPermission({
            app_uid: app_uid,
            origin: origin,
            permission: permission,
        });

        let messageTarget = window.embedded_in_popup ? window.opener : window.parent;
        messageTarget.postMessage({
            msg: "permissionGranted",
            granted: granted,
        }, origin);
    }
    //--------------------------------------------------------------------------------------
    // Action: Password recovery
    //--------------------------------------------------------------------------------------
    else if(action === 'set-new-password'){
        let user = window.url_query_params.get('user');
        let token = window.url_query_params.get('token');

        await UIWindowNewPassword({
            user: user,
            token: token,
        });
    }
    //--------------------------------------------------------------------------------------
    // Action: Change Username
    //--------------------------------------------------------------------------------------
    else if(action === 'change-username'){
        await UIWindowChangeUsername();
    }
    //--------------------------------------------------------------------------------------
    // Action: Login with Particle
    //--------------------------------------------------------------------------------------
    else if(action === 'login'){
        // await UIWindowParticleLogin();
        window.location.href = '/particle-auth?v=20261014a';
    }
    //--------------------------------------------------------------------------------------
    // Action: Signup
    //--------------------------------------------------------------------------------------
    else if(action === 'signup'){
        await UIWindowSignup();
    }

    // -------------------------------------------------------------------------------------
    // If in embedded in a popup, it is important to check whether the opener app has a relationship with the user
    // if yes, we need to get the user app token and send it to the opener
    // if not, we need to ask the user for confirmation before proceeding BUT only if the action is a file-picker action
    // -------------------------------------------------------------------------------------
    if(window.embedded_in_popup && window.openerOrigin){
        let response = await window.checkUserSiteRelationship(window.openerOrigin);
        window.userAppToken = response.token;

        if(!picked_a_user_for_sdk_login && window.logged_in_users.length > 1 && (!window.userAppToken || window.url_query_params.get('request_auth') )){
            picked_a_user_for_sdk_login = await UIWindowSessionList({
                reload_on_success: false,
                draggable_body: false,
                has_head: false,
                cover_page: true,
            });
        }
    }
    // -------------------------------------------------------------------------------------
    // `auth_token` provided in URL, use it to log in
    // -------------------------------------------------------------------------------------
    else if(window.url_query_params.has('auth_token')){
        INITGUI_DEBUG && console.log('[initgui]: Processing auth_token from URL');
        
        // Guard: If user is already authenticated and desktop is loaded, skip processing
        // This prevents double initialization when Particle Auth redirects after login event
        if (window.is_auth() && window.desktop_loaded) {
            INITGUI_DEBUG && console.log('[initgui]: User already authenticated and desktop loaded, removing auth_token from URL');
            window.history.pushState(null, document.title, '/');
            return;
        }
        
        let query_param_auth_token = window.url_query_params.get('auth_token');

        puter.setAuthToken(query_param_auth_token);

        try{
            whoami = await puter.os.user({query: 'icon_size=64'});
        }catch(e){
            if(e.status === 401){
                window.logout();
                return;
            }
        }

        if(whoami){
            if(whoami.requires_email_confirmation){
                let is_verified;
                do{
                    is_verified = await UIWindowEmailConfirmationRequired({
                        stay_on_top: true,
                        has_head: false
                    });
                }
                while(!is_verified)
            }
            // if user is logging in using an auth token that means it's not their first ever visit to Puter.com
            // it might be their first visit to Puter on this specific device but it's not their first time ever visiting Puter.
            window.first_visit_ever = false;
            // show login progress window
            // UIWindowLoginInProgress({user_info: whoami});
            // update auth data - MUST await to ensure desktop_path is set before UIDesktop loads
            await window.update_auth_data(query_param_auth_token, whoami);
            
            // Reset flags before reload so initgui() can run again after redirect
            // This ensures desktop items are loaded properly
            window.initgui_in_progress = false;
            window.initgui_completed = false;
            window.desktop_loaded = false; // Reset desktop loaded flag
            
            // For Particle auth redirects, do a clean reload to ensure full desktop initialization
            // This matches how other login methods work (see UIWindowLogin.js)
            window.onbeforeunload = null;
            location.replace('/');
            return; // Stop execution, page will reload
        }
        // remove auth_token from URL (only reached if whoami failed)
        window.history.pushState(null, document.title, '/');
    }

    /**
     * Logout without showing confirmation or "Save Account" action,
     * and without authenticating with the server.
     */
    const bad_session_logout = async () => {
        try {
            // TODO: i18n
            await UIAlert({
                message: 'Your session is invalid. You will be logged out.'
            });
            // clear local storage
            localStorage.clear();
            // reload the page
            window.location.reload();
        }catch(e){
            // TODO: i18n
            await UIAlert({
                message: 'Session is invalid and logout failed; ' +
                    'please clear local storage manually.'
            });
        }
    };

    // -------------------------------------------------------------------------------------
    // Authed
    // -------------------------------------------------------------------------------------
    if(window.is_auth()){
        INITGUI_DEBUG && console.log('[initgui]: User is authed, proceeding with desktop initialization');
        // Update loading screen
        if (window.updateLoadingStatus) window.updateLoadingStatus('Authenticating...', 30);
        
        // try to get user data using /whoami, only if that data is missing
        if(!whoami){
            try{
                whoami = await puter.os.user({query: 'icon_size=64'});
            }catch(e){
                console.warn('[initgui]: whoami call failed:', e.message || e);
                if(e.status === 401){
                    bad_session_logout();
                    return;
                }
                // For other errors, try to proceed with cached user data
                if (window.user) {
                    console.log('[initgui]: Using cached user data from localStorage');
                    whoami = window.user;
                }
            }
        }
        // update local user data - proceed even with cached data
        if(whoami || window.user){
            // Update loading screen
            if (window.updateLoadingStatus) window.updateLoadingStatus('Loading profile...', 50);
            
            // Use cached user if whoami failed
            if (!whoami && window.user) {
                whoami = window.user;
                console.log('[initgui]: Proceeding with cached user data');
            }
            // is email confirmation required?
            if(whoami.requires_email_confirmation){
                let is_verified;
                do{
                    is_verified = await UIWindowEmailConfirmationRequired({
                        stay_on_top: true,
                        has_head: false
                    });
                }
                while(!is_verified)
            }
            // MUST await to ensure desktop_path is set before UIDesktop loads
            await window.update_auth_data(whoami.token || window.auth_token, whoami);

            // -------------------------------------------------------------------------------------
            // Load desktop, only if we're not embedded in a popup
            // -------------------------------------------------------------------------------------
            if(!window.embedded_in_popup){
                // Guard: Prevent duplicate desktop loading
                if (window.desktop_loaded) {
                    INITGUI_DEBUG && console.log('[initgui]: Desktop already loaded, skipping UIDesktop call');
                    window.initgui_in_progress = false;
                    window.initgui_completed = true;
                    return;
                }
                
                window.desktop_loaded = true; // Mark as loaded
                INITGUI_DEBUG && console.log('[initgui]: Loading desktop for path:', window.desktop_path);
                
                // Update loading screen
                if (window.updateLoadingStatus) window.updateLoadingStatus('Preparing desktop...', 70);
                
                await window.get_auto_arrange_data()
                
                // Use Promise-based stat with proper error handling
                try {
                    const desktop_fsentry = await new Promise((resolve, reject) => {
                        const timeoutId = setTimeout(() => {
                            reject(new Error('Desktop stat timeout after 10s'));
                        }, 10000);
                        
                        puter.fs.stat(window.desktop_path, (result) => {
                            clearTimeout(timeoutId);
                            if (result) {
                                resolve(result);
                            } else {
                                // If no result, still proceed with empty fsentry
                                resolve(null);
                            }
                        });
                    });
                    
                    INITGUI_DEBUG && console.log('[initgui]: puter.fs.stat success, calling UIDesktop');
                    // Update loading screen
                    if (window.updateLoadingStatus) window.updateLoadingStatus('Loading desktop...', 90);
                    
                    // Mark initialization as complete when desktop loads
                    window.initgui_in_progress = false;
                    window.initgui_completed = true;
                    UIDesktop({desktop_fsentry: desktop_fsentry});
                    // Initialize keyboard shortcuts
                    initKeyboardShortcuts();
                    
                    // Hide loading screen after a brief delay to ensure desktop is visible
                    setTimeout(() => {
                        if (window.updateLoadingStatus) window.updateLoadingStatus('Welcome!', 100);
                        setTimeout(() => { if (window.hideLoadingScreen) window.hideLoadingScreen(); }, 200);
                    }, 100);
                    
                    // Check for updates after desktop loads (30 second delay)
                    setTimeout(() => window.checkForUpdates?.(), 30000);

                    // Check system readiness and offer to fix missing dependencies (5s delay)
                    setTimeout(async () => {
                        try {
                            const readinessResp = await fetch(`${window.api_origin || ''}/api/system-readiness`);
                            if (!readinessResp.ok) return;
                            const readiness = await readinessResp.json();
                            const missing = readiness.checks.filter(c => c.status !== 'ok' && c.fixable);
                            if (missing.length === 0) return;

                            const names = missing.map(c => c.label).join(', ');
                            UIAlert({
                                message: `${missing.length} system component${missing.length > 1 ? 's' : ''} not installed: ${names}.\n\nWould you like to install them now? This downloads transport binaries needed for reliable connectivity.`,
                                buttons: [
                                    { label: 'Install Now', value: 'install', type: 'primary' },
                                    { label: 'Later', value: 'later' },
                                ],
                            }).then(async (choice) => {
                                if (choice !== 'install') return;
                                try {
                                    const fixResp = await fetch(`${window.api_origin || ''}/api/system-readiness/fix`, {
                                        method: 'POST',
                                        headers: {
                                            'Authorization': `Bearer ${window.auth_token}`,
                                            'Content-Type': 'application/json',
                                        },
                                    });
                                    const result = await fixResp.json();
                                    UIAlert({
                                        message: result.success
                                            ? (result.message || 'Transport binaries installed successfully.')
                                            : (result.message || 'Failed to install some components. Try running scripts/fix-networking.sh manually.'),
                                        buttons: [{ label: 'OK', value: 'ok', type: 'primary' }],
                                    });
                                } catch {
                                    UIAlert({
                                        message: 'Failed to install components. Try running scripts/fix-networking.sh manually.',
                                        buttons: [{ label: 'OK', value: 'ok', type: 'primary' }],
                                    });
                                }
                            });
                        } catch { /* readiness check failed, skip silently */ }
                    }, 5000);
                } catch (statError) {
                    console.warn('[initgui]: Desktop stat failed, loading desktop anyway:', statError.message);
                    // Still load desktop even if stat fails - better than grey screen
                    window.initgui_in_progress = false;
                    window.initgui_completed = true;
                    UIDesktop({desktop_fsentry: null});
                    initKeyboardShortcuts();
                    
                    // Hide loading screen even on error
                    setTimeout(() => { if (window.hideLoadingScreen) window.hideLoadingScreen(); }, 300);
                }
            }
            // -------------------------------------------------------------------------------------
            // If embedded in a popup, send the token to the opener and close the popup
            // -------------------------------------------------------------------------------------
            else{
                let msg_id = window.url_query_params.get('msg_id');
                try{
                    let data = await window.getUserAppToken(new URL(window.openerOrigin).origin);
                    // This is an implicit app and the app_uid is sent back from the server
                    // we cache it here so that we can use it later
                    window.host_app_uid = data.app_uid;
                    // send token to parent
                    window.opener.postMessage({
                        msg: 'puter.token',
                        success: true,
                        token: data.token,
                        app_uid: data.app_uid,
                        username: window.user.username,
                        msg_id: msg_id,
                    }, window.openerOrigin);
                    // close popup
                    if(!action || action==='sign-in'){
                        window.close();
                        window.open('','_self').close();
                    }
                }catch(err){
                    // send error to parent
                    window.opener.postMessage({
                        msg: 'puter.token',
                        success: false,
                        token: null,
                        msg_id: msg_id,
                    }, window.openerOrigin);
                    // close popup
                    window.close();
                    window.open('','_self').close();
                }

                let app_uid;

                if(window.openerOrigin){
                    app_uid = await window.getAppUIDFromOrigin(window.openerOrigin);
                    window.host_app_uid = app_uid;
                }

                if(action === 'show-open-file-picker'){
                    let options = window.url_query_params.get('options');
                    options = JSON.parse(options ?? '{}');

                    // Open dialog
                    UIWindow({
                        allowed_file_types: options?.accept,
                        selectable_body: options?.multiple,
                        path: '/' + window.user.username + '/Desktop',
                        // this is the uuid of the window to which this dialog will return
                        return_to_parent_window: true,
                        show_maximize_button: false,
                        show_minimize_button: false,
                        title: 'Open',
                        is_dir: true,
                        is_openFileDialog: true,
                        is_resizable: false,
                        has_head: false,
                        cover_page: true,
                        // selectable_body: is_selectable_body,
                        iframe_msg_uid: msg_id,
                        center: true,
                        initiating_app_uuid: app_uid,
                        on_close: function(){
                            window.opener.postMessage({
                                msg: "fileOpenCanceled",
                                original_msg_id: msg_id,
                            }, '*');
                        }
                    });
                }
                //--------------------------------------------------------------------------------------
                // Action: Show Directory Picker
                //--------------------------------------------------------------------------------------
                else if(action === 'show-directory-picker'){
                    // open directory picker dialog
                    UIWindow({
                        path: '/' + window.user.username + '/Desktop',
                        // this is the uuid of the window to which this dialog will return
                        // parent_uuid: event.data.appInstanceID,
                        return_to_parent_window: true,
                        show_maximize_button: false,
                        show_minimize_button: false,
                        title: 'Open',
                        is_dir: true,
                        is_directoryPicker: true,
                        is_resizable: false,
                        has_head: false,
                        cover_page: true,
                        // selectable_body: is_selectable_body,
                        iframe_msg_uid: msg_id,
                        center: true,
                        initiating_app_uuid: app_uid,
                        on_close: function(){
                            window.opener.postMessage({
                                msg: "directoryOpenCanceled",
                                original_msg_id: msg_id,
                            }, '*');
                        }
                    });
                }
                //--------------------------------------------------------------------------------------
                // Action: Show Save File Dialog
                //--------------------------------------------------------------------------------------
                else if(action === 'show-save-file-picker'){
                    let allowed_file_types = window.url_query_params.get('allowed_file_types');

                    // send 'sendMeFileData' event to parent
                    window.opener.postMessage({
                        msg: 'sendMeFileData',
                    }, '*');

                    // listen for 'showSaveFilePickerPopup' event from parent
                    window.addEventListener('message', async (event) => {
                        if(event.data.msg !== 'showSaveFilePickerPopup')
                            return;

                        // Open dialog
                        UIWindow({
                            allowed_file_types: allowed_file_types,
                            path: '/' + window.user.username + '/Desktop',
                            // this is the uuid of the window to which this dialog will return
                            return_to_parent_window: true,
                            show_maximize_button: false,
                            show_minimize_button: false,
                            title: 'Save',
                            is_dir: true,
                            is_saveFileDialog: true,
                            is_resizable: false,
                            has_head: false,
                            cover_page: true,
                            // selectable_body: is_selectable_body,
                            iframe_msg_uid: msg_id,
                            center: true,
                            initiating_app_uuid: app_uid,
                            on_close: function(){
                                window.opener.postMessage({
                                    msg: "fileSaveCanceled",
                                    original_msg_id: msg_id,
                                }, '*');
                            },
                            onSaveFileDialogSave: async function(target_path, el_filedialog_window){
                                $(el_filedialog_window).find('.window-disable-mask, .busy-indicator').show();
                                let busy_init_ts = Date.now();

                                let overwrite = false;
                                let file_to_upload = new File([event.data.content], path.basename(target_path));
                                let item_with_same_name_already_exists = true;
                                while(item_with_same_name_already_exists){
                                    // overwrite?
                                    if(overwrite)
                                        item_with_same_name_already_exists = false;
                                    // upload
                                    try{
                                        const res = await puter.fs.write(
                                            target_path,
                                            file_to_upload,
                                            {
                                                dedupeName: false,
                                                overwrite: overwrite
                                            }
                                        );

                                        let file_signature = await puter.fs.sign(app_uid, {uid: res.uid, action: 'write'});
                                        file_signature = file_signature.items;

                                        item_with_same_name_already_exists = false;
                                        window.opener.postMessage({
                                            msg: "fileSaved",
                                            original_msg_id: msg_id,
                                            filename: res.name,
                                            saved_file: {
                                                name: file_signature.fsentry_name,
                                                readURL: file_signature.read_url,
                                                writeURL: file_signature.write_url,
                                                metadataURL: file_signature.metadata_url,
                                                type: file_signature.type,
                                                uid: file_signature.uid,
                                                path: privacy_aware_path(res.path),
                                            },
                                        }, '*');

                                        window.close();
                                        window.open('','_self').close();
                                    }
                                    catch(err){
                                        // item with same name exists
                                        if(err.code === 'item_with_same_name_exists'){
                                            const alert_resp = await UIAlert({
                                                message: `<strong>${html_encode(err.entry_name)}</strong> already exists.`,
                                                buttons:[
                                                    {
                                                        label: i18n('replace'),
                                                        value: 'replace',
                                                        type: 'primary',
                                                    },
                                                    {
                                                        label: i18n('cancel'),
                                                        value: 'cancel',
                                                    },
                                                ],
                                                parent_uuid: $(el_filedialog_window).attr('data-element_uuid'),
                                            })
                                            if(alert_resp === 'replace'){
                                                overwrite = true;
                                            }else if(alert_resp === 'cancel'){
                                                // enable parent window
                                                $(el_filedialog_window).find('.window-disable-mask, .busy-indicator').hide();
                                                return;
                                            }
                                        }
                                        else{
                                            console.log(err);
                                            // show error
                                            await UIAlert({
                                                message: err.message ?? "Upload failed.",
                                                parent_uuid: $(el_filedialog_window).attr('data-element_uuid'),
                                            });
                                            // enable parent window
                                            $(el_filedialog_window).find('.window-disable-mask, .busy-indicator').hide();
                                            return;
                                        }
                                    }
                                }

                                // done
                                let busy_duration = (Date.now() - busy_init_ts);
                                if( busy_duration >= window.busy_indicator_hide_delay){
                                    $(el_filedialog_window).close();
                                }else{
                                    setTimeout(() => {
                                        // close this dialog
                                        $(el_filedialog_window).close();
                                    }, Math.abs(window.busy_indicator_hide_delay - busy_duration));
                                }
                            }
                        });
                    });
                }
            }

            // ----------------------------------------------------------
            // Get user's sites
            // ----------------------------------------------------------
            window.update_sites_cache();
        }
    }
    //--------------------------------------------------------------------------------------
    // `share_token` provided
    // i.e. https://puter.com/?share_token=<share_token>
    //--------------------------------------------------------------------------------------
    if(window.url_query_params.has('share_token')){
        let share_token = window.url_query_params.get('share_token');

        fetch(`${puter.APIOrigin}/sharelink/check`, {
            "headers": {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${puter.authToken}`,
            },
            "body": JSON.stringify({
                token: share_token,
            }),
            "method": "POST",
        }).then(response => response.json())
        .then(async data => {
            // Show register screen
            if(data.email && data.email !== window.user?.email){
                await UIWindowSignup({
                    reload_on_success: true,
                    email: data.email,
                    send_confirmation_code: false,
                    window_options:{
                        has_head: false
                    }
                });
            }
            // Show email confirmation screen
            else if(data.email && data.email === window.user.email && !window.user.email_confirmed){
                // todo show email confirmation window
                await UIWindowEmailConfirmationRequired({
                    stay_on_top: true,
                    has_head: false
                });
            }

            // show shared item
            UIWindow({
                path: data.path,
                title: path.basename(data.path),
                icon: await item_icon({is_dir: data.is_dir, path: data.path}),
                is_dir: data.is_dir,
                app: 'explorer',
            });
        }).catch(error => {
            console.error('Error:', error);
        })
    }

    // -------------------------------------------------------------------------------------
    // Un-authed but not first visit -> try to log in/sign up
    // -------------------------------------------------------------------------------------
    INITGUI_DEBUG && console.log('[initgui]: Checking authentication status...');
    INITGUI_DEBUG && console.log('[initgui]: window.is_auth():', window.is_auth());
    INITGUI_DEBUG && console.log('[initgui]: window.logged_in_users.length:', window.logged_in_users?.length || 0);
    
    if(!window.is_auth()){
        INITGUI_DEBUG && console.log('[initgui]: ❌ User is NOT authenticated');
        // Hide loading screen before showing login
        if (window.hideLoadingScreen) window.hideLoadingScreen();
        
        // PC2: Always show Particle login directly (skip Puter session list)
        // This ensures users see Particle Auth instead of Puter's standard login UI
        INITGUI_DEBUG && console.log('[initgui]: Showing Particle login (PC2 mode - skipping session list)...');
        // ELACITY: Embed Particle Auth inside the OS instead of redirecting
        // Set reload_on_success to true to ensure desktop loads correctly after login
        INITGUI_DEBUG && console.log('[initgui]: Calling UIWindowParticleLogin()...');
        await UIWindowParticleLogin({ reload_on_success: true });
        INITGUI_DEBUG && console.log('[initgui]: ✅ UIWindowParticleLogin() completed');
    } else {
        INITGUI_DEBUG && console.log('[initgui]: ✅ User IS authenticated');
        // Mark initialization as complete when user is already authenticated
        window.initgui_in_progress = false;
        window.initgui_completed = true;
        // -------------------------------------------------------------------------------------
        // Desktop Background
        // Only load after authentication to avoid black background showing during login
        // -------------------------------------------------------------------------------------
        if(!window.is_fullpage_mode && !window.embedded_in_popup){
            window.refresh_desktop_background();
        }
        
        // -------------------------------------------------------------------------------------
        // Profile Picture
        // Load profile picture after authentication
        // -------------------------------------------------------------------------------------
        if(window.user && window.user.profile_picture_url){
            window.refresh_profile_picture();
        }
    }

    // -------------------------------------------------------------------------------------
    // Un-authed and first visit ever -> create temp user
    // -------------------------------------------------------------------------------------
    /* else if(!window.is_auth() && window.first_visit_ever && !window.disable_temp_users){
        let referrer;
        try{
            referrer = new URL(window.location.href).pathname;
        }catch(e){
            console.log(e)
        }

        referrer = window.openerOrigin ?? referrer;

        // a global object that will be used to store the user's referrer
        window.referrerStr = referrer;

        // in case there is also a referrer query param, add it to the referrer URL
        if(window.url_query_params.has('ref')){
            if(!referrer)
                referrer = '/';
            referrer += '?ref=' + html_encode(window.url_query_params.get('ref'));
        }

        let headers = {};
        if(window.custom_headers)
            headers = window.custom_headers;

        // if this is a popup, show a spinner
        let spinner_init_ts = Date.now();
        if(window.embedded_in_popup){
            puter.ui.showSpinner('<span style="-webkit-font-smoothing: antialiased;">Setting up your <a href="https://puter.com" target="_blank">Puter.com</a> account for secure AI and Cloud features</span>');
        }

        $.ajax({
            url: window.gui_origin + "/signup",
            type: 'POST',
            async: true,
            headers: headers,
            contentType: "application/json",
            data: JSON.stringify({
                referrer: referrer,
                referral_code: window.referral_code,
                is_temp: true,
            }),
            success: async function (data){
                // if this is a popup, hide the spinner, make sure it was visible for at least 2 seconds
                if(window.embedded_in_popup){
                    let spinner_duration = (Date.now() - spinner_init_ts);
                    setTimeout(() => {
                        window.update_auth_data(data.token, data.user);
                        document.dispatchEvent(new Event("login", { bubbles: true}));        
                        puter.ui.hideSpinner();
                    }, spinner_duration > 2000 ? 10 : 2000 - spinner_duration);

                    return;
                }else{
                    window.update_auth_data(data.token, data.user);
                    document.dispatchEvent(new Event("login", { bubbles: true}));
                }
            },
            error: async (err) => {
                UIAlert({
                    message: html_encode(err.responseText),
                });
            },
            complete: function(){
                
            }
        });
    } */

    // if there is at least one window open (only non-Explorer windows), ask user for confirmation when navigating away from puter
    if(window.feature_flags.prompt_user_when_navigation_away_from_puter){
        window.onbeforeunload = function(){
            if($(`.window:not(.window[data-app="explorer"])`).length > 0)
                return true;
        };
    }

    // -------------------------------------------------------------------------------------
    // `login` event handler
    // --------------------------------------------------------------------------------------
    $(document).on("login", async (e) => {
        // Guard: Prevent duplicate desktop loading
        if (window.desktop_loaded) {
            INITGUI_DEBUG && console.log('[initgui]: Desktop already loaded, skipping login event handler');
            return;
        }
        
        // close all windows
        $('.window').close();

        // -------------------------------------------------------------------------------------
        // Load desktop, if not embedded in a popup
        // -------------------------------------------------------------------------------------
        if(!window.embedded_in_popup){
            window.desktop_loaded = true; // Mark as loaded to prevent duplicates
            await window.get_auto_arrange_data();
            
            // Use Promise-based stat with proper error handling
            try {
                const desktop_fsentry = await new Promise((resolve, reject) => {
                    const timeoutId = setTimeout(() => {
                        reject(new Error('Desktop stat timeout'));
                    }, 10000);
                    
                    puter.fs.stat(window.desktop_path, (result) => {
                        clearTimeout(timeoutId);
                        resolve(result || null);
                    });
                });
                
                UIDesktop({ desktop_fsentry: desktop_fsentry });
                // Check for updates after login (30 second delay)
                setTimeout(() => window.checkForUpdates?.(), 30000);
            } catch (statError) {
                console.warn('[initgui]: Login event - desktop stat failed:', statError.message);
                // Still load desktop even if stat fails
                UIDesktop({ desktop_fsentry: null });
                // Check for updates after login (30 second delay)
                setTimeout(() => window.checkForUpdates?.(), 30000);
            }
        }
        // -------------------------------------------------------------------------------------
        // If embedded in a popup, send the 'ready' event to referrer and close the popup
        // -------------------------------------------------------------------------------------
        else{
            let msg_id = window.url_query_params.get('msg_id');
            try{

                let data = await window.getUserAppToken(new URL(window.openerOrigin).origin);
                // This is an implicit app and the app_uid is sent back from the server
                // we cache it here so that we can use it later
                window.host_app_uid = data.app_uid;
                // send token to parent
                window.opener.postMessage({
                    msg: 'puter.token',
                    success: true,
                    msg_id: msg_id,
                    token: data.token,
                    username: window.user.username,
                    app_uid: data.app_uid,
                }, window.openerOrigin);
                // close popup
                if(!action || action==='sign-in'){
                    window.close();
                    window.open('','_self').close();
                }
            }catch(err){
                // send error to parent
                window.opener.postMessage({
                    msg: 'puter.token',
                    msg_id: msg_id,
                    success: false,
                    token: null,
                }, window.openerOrigin);
                // close popup
                window.close();
                window.open('','_self').close();
            }


            let app_uid;

            if(window.openerOrigin){
                app_uid = await window.getAppUIDFromOrigin(window.openerOrigin);
                window.host_app_uid = app_uid;
            }

            //--------------------------------------------------------------------------------------
            // Action: Show Open File Picker
            //--------------------------------------------------------------------------------------
            if(action === 'show-open-file-picker'){
                let options = window.url_query_params.get('options');
                options = JSON.parse(options ?? '{}');

                // Open dialog
                UIWindow({
                    allowed_file_types: options?.accept,
                    selectable_body: options?.multiple,
                    path: '/' + window.user.username + '/Desktop',
                    return_to_parent_window: true,
                    show_maximize_button: false,
                    show_minimize_button: false,
                    title: 'Open',
                    is_dir: true,
                    is_openFileDialog: true,
                    is_resizable: false,
                    has_head: false,
                    cover_page: true,
                    iframe_msg_uid: msg_id,
                    center: true,
                    initiating_app_uuid: app_uid,
                    on_close: function(){
                        window.opener.postMessage({
                            msg: "fileOpenCanceled",
                            original_msg_id: msg_id,
                        }, '*');
                    }
                });
            }
            //--------------------------------------------------------------------------------------
            // Action: Show Directory Picker
            //--------------------------------------------------------------------------------------
            else if(action === 'show-directory-picker'){
                // open directory picker dialog
                UIWindow({
                    path: '/' + window.user.username + '/Desktop',
                    // this is the uuid of the window to which this dialog will return
                    // parent_uuid: event.data.appInstanceID,
                    return_to_parent_window: true,
                    show_maximize_button: false,
                    show_minimize_button: false,
                    title: 'Open',
                    is_dir: true,
                    is_directoryPicker: true,
                    is_resizable: false,
                    has_head: false,
                    cover_page: true,
                    // selectable_body: is_selectable_body,
                    iframe_msg_uid: msg_id,
                    center: true,
                    initiating_app_uuid: app_uid,
                    on_close: function(){
                        window.opener.postMessage({
                            msg: "directoryOpenCanceled",
                            original_msg_id: msg_id,
                        }, '*');
                    }
                });
            }

            //--------------------------------------------------------------------------------------
            // Action: Show Save File Dialog
            //--------------------------------------------------------------------------------------
            else if(action === 'show-save-file-picker'){
                let allowed_file_types = window.url_query_params.get('allowed_file_types');

                // send 'sendMeFileData' event to parent
                window.opener.postMessage({
                    msg: 'sendMeFileData',
                }, '*');

                // listen for 'showSaveFilePickerPopup' event from parent
                window.addEventListener('message', async (event) => {
                    if(event.data.msg !== 'showSaveFilePickerPopup')
                        return;

                    // Open dialog
                    UIWindow({
                        allowed_file_types: allowed_file_types,
                        path: '/' + window.user.username + '/Desktop',
                        // this is the uuid of the window to which this dialog will return
                        return_to_parent_window: true,
                        show_maximize_button: false,
                        show_minimize_button: false,
                        title: 'Save',
                        is_dir: true,
                        is_saveFileDialog: true,
                        is_resizable: false,
                        has_head: false,
                        cover_page: true,
                        // selectable_body: is_selectable_body,
                        iframe_msg_uid: msg_id,
                        center: true,
                        initiating_app_uuid: app_uid,
                        on_close: function(){
                            window.opener.postMessage({
                                msg: "fileSaveCanceled",
                                original_msg_id: msg_id,
                            }, '*');
                        },
                        onSaveFileDialogSave: async function(target_path, el_filedialog_window){
                            $(el_filedialog_window).find('.window-disable-mask, .busy-indicator').show();
                            let busy_init_ts = Date.now();

                            let overwrite = false;
                            let file_to_upload = new File([event.data.content], path.basename(target_path));
                            let item_with_same_name_already_exists = true;
                            while(item_with_same_name_already_exists){
                                // overwrite?
                                if(overwrite)
                                    item_with_same_name_already_exists = false;
                                // upload
                                try{
                                    const res = await puter.fs.write(
                                        target_path,
                                        file_to_upload,
                                        {
                                            dedupeName: false,
                                            overwrite: overwrite
                                        }
                                    );

                                    let file_signature = await puter.fs.sign(app_uid, {uid: res.uid, action: 'write'});
                                    file_signature = file_signature.items;

                                    item_with_same_name_already_exists = false;
                                    window.opener.postMessage({
                                        msg: "fileSaved",
                                        original_msg_id: msg_id,
                                        filename: res.name,
                                        saved_file: {
                                            name: file_signature.fsentry_name,
                                            readURL: file_signature.read_url,
                                            writeURL: file_signature.write_url,
                                            metadataURL: file_signature.metadata_url,
                                            type: file_signature.type,
                                            uid: file_signature.uid,
                                            path: privacy_aware_path(res.path),
                                        },
                                    }, '*');

                                    window.close();
                                    window.open('','_self').close();
                                    // show_save_account_notice_if_needed();
                                }
                                catch(err){
                                    // item with same name exists
                                    if(err.code === 'item_with_same_name_exists'){
                                        const alert_resp = await UIAlert({
                                            message: `<strong>${html_encode(err.entry_name)}</strong> already exists.`,
                                            buttons:[
                                                {
                                                    label: i18n('replace'),
                                                    value: 'replace',
                                                    type: 'primary',
                                                },
                                                {
                                                    label: i18n('cancel'),
                                                    value: 'cancel',
                                                },
                                            ],
                                            parent_uuid: $(el_filedialog_window).attr('data-element_uuid'),
                                        })
                                        if(alert_resp === 'replace'){
                                            overwrite = true;
                                        }else if(alert_resp === 'cancel'){
                                            // enable parent window
                                            $(el_filedialog_window).find('.window-disable-mask, .busy-indicator').hide();
                                            return;
                                        }
                                    }
                                    else{
                                        console.log(err);
                                        // show error
                                        await UIAlert({
                                            message: err.message ?? "Upload failed.",
                                            parent_uuid: $(el_filedialog_window).attr('data-element_uuid'),
                                        });
                                        // enable parent window
                                        $(el_filedialog_window).find('.window-disable-mask, .busy-indicator').hide();
                                        return;
                                    }
                                }
                            }

                            // done
                            let busy_duration = (Date.now() - busy_init_ts);
                            if( busy_duration >= window.busy_indicator_hide_delay){
                                $(el_filedialog_window).close();
                            }else{
                                setTimeout(() => {
                                    // close this dialog
                                    $(el_filedialog_window).close();
                                }, Math.abs(window.busy_indicator_hide_delay - busy_duration));
                            }
                        }

                    });
                });
            }

        }

    })

    $(".popover, .context-menu").on("remove", function () {
        $('.window-active .window-app-iframe').css('pointer-events', 'all');
    })

    // If the document is clicked/tapped somewhere
    $(document).bind("mousedown touchstart", function (e) {
        // update last touch coordinates
        update_last_touch_coordinates(e);

        // dismiss touchstart on regular devices
        if(e.type === 'touchstart' && !isMobile.phone && !isMobile.tablet)
            return;

        // If .item-container clicked, unselect all its item children
        if($(e.target).hasClass('item-container') && !e.ctrlKey && !e.metaKey){
            $(e.target).children('.item-selected').removeClass('item-selected');
            window.update_explorer_footer_selected_items_count(e.target);
        }

        // If the clicked element is not a context menu, remove all context menus
        if ($(e.target).parents(".context-menu").length === 0) {
            const $ctxmenus = $(".context-menu");
            $ctxmenus.fadeOut(200, function(){
                $ctxmenus.remove();
            });
        }

        // click on anything will close all popovers, but there are some exceptions
        if(!$(e.target).hasClass('start-app')
            && !$(e.target).hasClass('launch-search')
            && !$(e.target).hasClass('launch-search-clear')
            && $(e.target).closest('.start-app').length === 0
            && !isMobile.phone && !isMobile.tablet
            && !$(e.target).hasClass('popover')
            && $(e.target).parents('.popover').length === 0){

            $(".popover").removeClass('popover-visible');
            setTimeout(function () {
                $(".popover").remove();
            }, 200);
        }

        // Close all tooltips
        $('.ui-tooltip').remove();

        // rename items whose names were being edited
        if(!$(e.target).hasClass('item-name-editor')){
            // blurring an Item Name Editor will automatically trigger renaming the item
            $(".item-name-editor-active").blur();
        }

        // update active_item_container
        if($(e.target).hasClass('item-container')){
            window.active_item_container = e.target;
        }else{
            let ic = $(e.target).closest('.item-container')
            if(ic.length > 0){
                window.active_item_container = ic.get(0);
            }else{
                let pp = $(e.target).find('.item-container')
                if(pp.length > 0){
                    window.active_item_container = pp.get(0);
                }
            }
        }

        //active element
        window.active_element = e.target;
    });

    // update mouse position coordinates
    $(document).mousemove(function(event){
        update_mouse_position(event.clientX, event.clientY);
    });

    //--------------------------------------------------------
    // Window Activation
    //--------------------------------------------------------
    $(document).on('mousedown', function(e){
        // if taskbar or any parts of it is clicked, drop the event
        if($(e.target).hasClass('taskbar') || $(e.target).closest('.taskbar').length > 0){
            return;
        }
        // if toolbar or any parts of it is clicked, drop the event
        if($(e.target).hasClass('toolbar') || $(e.target).closest('.toolbar').length > 0){
            return;
        }
        // if mouse is clicked on a window, activate it
        if(window.mouseover_window !== undefined && window.mouseover_window !== null){
            // if popover clicked on, don't activate window. This is because if an app 
            // is using the popover API to show a popover, the popover will be closed if the window is activated
            if($(e.target).hasClass('popover') || $(e.target).parents('.popover').length > 0)
                return;
            const $win = $(window.mouseover_window);
            // Defensive check: ensure jQuery plugin is available before calling
            if ($win.length > 0 && typeof $win.focusWindow === 'function') {
                $win.focusWindow(e);
            }
        }
    })

    // if an element has the .long-hover class, fire a long-hover event after 600ms
    $(document).on('mouseenter', '.long-hover', function(){
        let el = this;
        el.long_hover_timeout = setTimeout(() => {
            $(el).trigger('long-hover');
        }, 600);
    })

    // if an element has the .long-hover class, cancel the long-hover event if the mouse leaves
    $(document).on('mouseleave', '.long-hover', function(){
        clearTimeout(this.long_hover_timeout);
    })

    document.addEventListener("visibilitychange", (event) => {
        if (document.visibilityState !== "visible") {
            window.doc_title_before_blur = document.title;
            if(!_.isEmpty(window.active_uploads)){
                update_title_based_on_uploads();
            }
        }else if(window.active_uploads){
            document.title = window.doc_title_before_blur ?? 'ElastOS';
        }
    });

    /**
     * Event handler for a custom 'logout' event attached to the document.
     * This function handles the process of logging out, including user confirmation,
     * communication with the backend, and subsequent UI updates. It takes special
     * precautions if the user is identified as using a temporary account.
     *
     * @listens Document#event:logout
     * @async
     * @param {Event} event - The JQuery event object associated with the logout event.
     * @returns {Promise<void>} - This function does not return anything meaningful, but it performs an asynchronous operation.
     */
    $(document).on("logout", async function(event) {
        // is temp user?
        if(window.user && window.user.is_temp && !window.user.deleted){
            const alert_resp = await UIAlert({
                message: `<strong>Save account before logging out!</strong><p>You are using a temporary account and logging out will erase all your data.</p>`,
                buttons:[
                    {
                        label: i18n('save_account'),
                        value: 'save_account',
                        type: 'primary',
                    },
                    {
                        label: i18n('log_out'),
                        value: 'log_out',
                        type: 'danger',
                    },
                    {
                        label: i18n('cancel'),
                    },
                ]
            })
            if(alert_resp === 'save_account'){
                let saved = await UIWindowSaveAccount({
                    send_confirmation_code: false,
                    default_username: window.user.username
                });
                if(saved)
                    window.logout();
            }else if (alert_resp === 'log_out'){
                window.logout();
            }
            else{
                return;
            }
        }

        // PC2 logout-fix (v1.2.1): the previous flow `await`ed the server
        // /logout call BEFORE clearing local state. If the server hung or
        // was slow (e.g. on a flaky tunnel), the awaited promise never
        // resolved, the localStorage clear and `window.location.href = '/'`
        // never ran, and the user was left with the original session token
        // intact. They'd refresh the page and land back in PC2 fully
        // signed in, perceived as "logout doesn't work / it auto-signs me
        // back in". Fix: kick the server /logout off as fire-and-forget,
        // bound by a short timeout, while local cleanup proceeds
        // immediately and unconditionally.
        //
        // PC2 logout-fix #2 (v1.2.1): even with the fire-and-forget above,
        // there is still a race window. PC2 wraps every XHR with an
        // interceptor (see pc2-node/scripts/build-frontend.js, the
        // `Captured real session token from response` block) that, on any
        // 200 response with a `token`/`auth_token` field, writes the token
        // back to localStorage. Logout is synchronous — clear localStorage,
        // then `window.location.href = '/'`. Browsers don't unload
        // immediately: the current task finishes, then any *already-queued*
        // XHR `readystatechange` callbacks run, *then* navigation begins.
        // If a `whoami`/`readdir`/etc. response (which echoes the session
        // token in its body) lands in that window, the interceptor
        // re-writes the token we just cleared, the page reloads with the
        // token intact, and the user is silently auto-restored. Same
        // hazard for `update_auth_data` callbacks queued by in-flight
        // requests.
        //
        // PC2 logout boot-gate (v1.2.1): also write a `pc2_logout_at`
        // timestamp to BOTH localStorage and sessionStorage. The
        // synchronous boot-gate in build-frontend.js reads this on every
        // page load BEFORE any XHR fires and unconditionally nukes the
        // auth keys if it's < 60 s old. This is the only race-proof fix
        // — even if every other guard below fails (server hang, browser
        // task ordering, callback we missed), the next page load will
        // refuse to auto-restore the session.
        try {
            const _now = String(Date.now());
            localStorage.setItem('pc2_logout_at', _now);
            sessionStorage.setItem('pc2_logout_at', _now);
            console.log('[initgui]: 🚪 logout marker set, beginning cleanup');
        } catch (e) {
            console.warn('[initgui]: failed to set logout marker:', e);
        }
        window.__pc2_logging_out = true;

        // PC2 logout-fix #3 (v1.2.1): MetaMask (and other injected wallets
        // implementing EIP-2255) remember the origin's authorization across
        // sessions independently of localStorage. So even after we wipe
        // every localStorage / wagmi / ConnectKit key and reload the page,
        // wagmi's injected connector silently calls `eth_accounts` on
        // mount, MetaMask returns the previously-approved account WITHOUT
        // prompting, the login UI sees a connected account, and SIWE
        // auto-fires — perceived by the user as "I clicked logout but it
        // immediately signs me back in". Fix: explicitly revoke the
        // origin's permission via EIP-2255 (`wallet_revokePermissions`)
        // so MetaMask forgets the approval. Best-effort: not all wallets
        // support EIP-2255 (Coinbase Wallet, older MetaMask, Phantom),
        // wrap in try/catch with a short timeout. Fired in parallel with
        // the rest of the cleanup so it doesn't block navigation.
        if (window.ethereum && typeof window.ethereum.request === 'function') {
            Promise.race([
                window.ethereum.request({
                    method: 'wallet_revokePermissions',
                    params: [{ eth_accounts: {} }],
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('wallet_revokePermissions timeout')), 1500)),
            ]).then(() => {
                console.log('[initgui]: 🔌 wallet_revokePermissions OK — injected wallet should not auto-reconnect on next load');
            }).catch((e) => {
                INITGUI_DEBUG && console.warn('[initgui]: wallet_revokePermissions not supported / timed out:', e?.message || e);
            });
        }
        const _serverLogoutAuthHeader = window.auth_token; // captured before clear
        const _serverLogoutOrigin = window.gui_origin;
        Promise.race([
            (async () => {
                const resp = await fetch(`${_serverLogoutOrigin}/get-anticsrf-token`);
                const { token } = await resp.json();
                await $.ajax({
                    url: _serverLogoutOrigin + "/logout",
                    type: 'POST',
                    async: true,
                    contentType: "application/json",
                    headers: {
                        "Authorization": "Bearer " + _serverLogoutAuthHeader
                    },
                    data: JSON.stringify({ anti_csrf: token }),
                    timeout: 4000,
                    statusCode: {
                        401: function () {
                        },
                    },
                });
            })(),
            new Promise((resolve) => setTimeout(resolve, 4000))
        ]).catch((serverErr) => {
            // Server-side logout is best-effort. Local state is cleared regardless.
            INITGUI_DEBUG && console.warn('[initgui]: Server logout failed/timed out (continuing):', serverErr);
        });

        // remove this user from the array of logged_in_users
        for (let i = 0; i < window.logged_in_users.length; i++) {
            if(window.logged_in_users[i].uuid === window.user.uuid){
                window.logged_in_users.splice(i, 1);
                break;
            }
        }

        // PC2: Clear all logged_in_users on logout to ensure Particle login is shown
        // This prevents the Puter session list from appearing after logout
        window.logged_in_users = [];
        
        // update logged_in_users in local storage
        localStorage.setItem('logged_in_users', JSON.stringify(window.logged_in_users));

        // delete this user from local storage
        window.user = null;
        localStorage.removeItem('user');
        window.auth_token = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('puter_auth_token'); // Alternative auth token key
        
        // Clear PC2 session data
        localStorage.removeItem('pc2_session');
        localStorage.removeItem('pc2_config');
        localStorage.removeItem('pc2_explicitly_disconnected');
        
        // Clear sessionStorage to remove any cached auth
        sessionStorage.clear();

        // disconnect particle under iframe 
        localStorage.setItem('disconnect_particle', 'true');
        
        // Clear ConnectKit/wagmi persistence so it cannot auto-reconnect on reload
        for (const key of Object.keys(localStorage)) {
            if (
                key.startsWith('wagmi') ||
                key.startsWith('wc@') ||
                key.startsWith('-walletlink') ||
                key.toLowerCase().includes('connectkit') ||
                key.toLowerCase().includes('recentconnector')
            ) {
                localStorage.removeItem(key);
            }
        }

        // WC IndexedDB cleanup (v1.2.1): WalletConnect Core persists pending
        // session_requests + session metadata in IndexedDB, NOT just
        // localStorage. Without this, after a logout + re-login the WC client
        // resurrects stale pending requests from previous sessions —
        // observed in real logs as:
        //   "Object Error: emitting session_request:1777596439974387
        //    without any listeners"
        // and as a phantom second wallet prompt on the next sign-in
        // ("the second signature didn't progress me to my desktop, I had to
        // click cancel on my wallet"). Deleting the DBs forces WC to start
        // clean. Best-effort — failures are non-fatal (deleteDatabase
        // resolves async; we don't await because reload is imminent).
        try {
            const wcDatabases = [
                'WALLET_CONNECT_V2_INDEXED_DB',
                'walletconnect',
                '@walletconnect/keyvaluestorage',
            ];
            wcDatabases.forEach(dbName => {
                try {
                    indexedDB.deleteDatabase(dbName);
                } catch (delErr) {
                    console.warn('[initgui]: failed to delete WC IndexedDB', dbName, delErr);
                }
            });
            // Some browsers also expose databases() to enumerate — defence-in-depth
            if (typeof indexedDB.databases === 'function') {
                indexedDB.databases().then(dbs => {
                    dbs.forEach(db => {
                        if (db.name && (db.name.toLowerCase().includes('walletconnect') || db.name.toLowerCase().includes('wc_'))) {
                            try { indexedDB.deleteDatabase(db.name); } catch (_) { /* best effort */ }
                        }
                    });
                }).catch(() => { /* best effort */ });
            }
        } catch (idbErr) {
            console.warn('[initgui]: WC IndexedDB cleanup failed (non-fatal):', idbErr);
        }

        // Reset initialization flags to allow fresh login
        window.initgui_in_progress = false;
        window.initgui_completed = false;
        window.desktop_loaded = false;

        // close all windows
        $('.window').close();
        // close all ctxmenus
        $('.context-menu').remove();
        // remove desktop
        $('.desktop').remove();
        // remove taskbar
        $('.taskbar').remove();
        // disable native browser exit confirmation
        window.onbeforeunload = null;
        // Reset initialization flags on logout
        window.initgui_in_progress = false;
        window.initgui_completed = false;
        window.desktop_loaded = false; // Reset desktop loaded flag
        
        // Clear PC2 session data
        localStorage.removeItem('pc2_session');
        localStorage.removeItem('pc2_config');
        localStorage.removeItem('pc2_explicitly_disconnected');
        localStorage.removeItem('puter_auth_token');
        
        // Clear sessionStorage to remove any cached auth
        sessionStorage.clear();

        // PC2 logout boot-gate (v1.2.1): re-write the marker AFTER the
        // sessionStorage.clear() above blew it away, and AFTER the
        // localStorage.removeItem chain. This is the second/last write —
        // whichever survives the next page boot is fine, the boot-gate
        // only needs ONE of them.
        try {
            const _now = String(Date.now());
            localStorage.setItem('pc2_logout_at', _now);
            sessionStorage.setItem('pc2_logout_at', _now);
            console.log('[initgui]: 🚪 logout marker re-set, navigating to /');
        } catch (e) {
            console.warn('[initgui]: failed to re-set logout marker:', e);
        }

        INITGUI_DEBUG && console.log('[initgui]: Logout complete, redirecting to home...');
        // Use location.replace so the user can't simply hit Back to land
        // on the cached, still-authed view (which the boot-gate would
        // then nuke anyway, but replace is cleaner UX).
        window.location.replace('/');
    });
}

function requestOpenerOrigin() {
    return new Promise((resolve, reject) => {
        if (!window.opener) {
            reject(new Error("No window.opener available"));
            return;
        }

        // Function to handle the message event
        const handleMessage = (event) => {
            // Check if the message is the expected response
            if (event.data.msg === 'originResponse') {
                // Clean up by removing the event listener
                window.removeEventListener('message', handleMessage);
                resolve(event.origin);
            }
        };

        // Set up the listener for the response
        window.addEventListener('message', handleMessage, false);

        // DEBUG: Add raw message listener to see ALL messages
        window.addEventListener('message', (event) => {
            if (event.data && (event.data.msg === 'showSaveFilePicker' || event.data.msg === 'showOpenFilePicker')) {
                console.log('[initgui.js]: 🔍 RAW message received:', event.data.msg, 'appInstanceID:', event.data.appInstanceID, 'origin:', event.origin, 'source:', event.source, 'full data:', event.data);
            }
        }, false);

        // Send the request to the opener
        window.opener.postMessage({ msg: 'requestOrigin' }, '*');

        // Optional: Reject the promise if no response is received within a timeout
        setTimeout(() => {
            window.removeEventListener('message', handleMessage);
            reject(new Error("Response timed out"));
        }, 5000); // Timeout after 5 seconds
    });
}

$(document).on('click', '.generic-close-window-button', function(e){
    const $win = $(this).closest('.window');
    if (typeof $win.close === 'function') $win.close();
});

$(document).on('click', function(e){
    if(!$(e.target).hasClass('window-search') && $(e.target).closest('.window-search').length === 0 && !$(e.target).is('.toolbar-btn.search-btn')){
        const $ws = $('.window-search');
        if (typeof $ws.close === 'function') $ws.close();
    }
})

// Re-calculate desktop height and width on window resize and re-position the login and signup windows
$(window).on("resize", function () {
    // If host env is popup, don't continue because the popup window has its own resize requirements.
    if (window.embedded_in_popup)
        return;

    const ratio = window.desktop_width / window.innerWidth;

    window.desktop_height = window.innerHeight - window.toolbar_height - window.taskbar_height;
    window.desktop_width = window.innerWidth;

    // Re-center the login window
    const top = $(".window-login").position()?.top;
    const width = $(".window-login").width();
    $(".window-login").css({
        left: (window.desktop_width - width) / 2,
        top: top / ratio,
    });

    // Re-center the create account window
    const top2 = $(".window-signup").position()?.top;
    const width2 = $(".window-signup").width();
    $(".window-signup").css({
        left: (window.desktop_width - width2) / 2,
        top: top2 / ratio,
    });
});

$(document).on('contextmenu', '.disable-context-menu', function(e){
    if($(e.target).hasClass('disable-context-menu') ){
        e.preventDefault();
        return false;
    }
})

// util/desktop.js
window.privacy_aware_path = privacy_aware_path({ window });

$(window).on('system-logout-event', function(){
    // Clear cookie
    document.cookie = 'puter=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    // Redirect to clean URL without any query parameters
    const cleanUrl = window.location.origin + window.location.pathname;
    window.location.replace(cleanUrl);
});
