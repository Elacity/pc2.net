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

import UIWindow from './UIWindow.js';
import UINotification from './UINotification.js';

// Function-based implementation similar to UIWindowLogin
async function UIWindowParticleLogin(options = {}) {
    // Set default reload_on_success if not provided
    if(options.reload_on_success === undefined)
        options.reload_on_success = true;
    
    return new Promise(async (resolve) => {
        // Create a container for the Particle login UI
        const h = `
            <div style="width:100%; height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center;">
                <div id="particle-auth-container" style="width:100%; height:100%; position:relative;"></div>
            </div>
        `;
    
        // Create the window
        console.log('[UIWindowParticleLogin]: Creating window...');
        const el_window = await UIWindow({
        title: null,
        app: 'particle-auth',
        single_instance: true,
        icon: null,
        uid: null,
        is_dir: false,
        body_content: h,
        has_head: false,
        selectable_body: false,
        draggable_body: false,
        allow_context_menu: false,
        is_draggable: false,
        is_droppable: false,
        is_resizable: false,
        stay_on_top: false,
        allow_native_ctxmenu: true,
        allow_user_select: true,
        is_fullpage: true,
        cover_page: true,
        width: 600,
        height: 650,
        dominant: true,
        ...options,
        window_class: 'window-particle-login',
        body_css: {
            width: 'initial',
            padding: '0',
            // 'background-color': 'rgb(255 255 255, 1)',
            'backdrop-filter': 'blur(3px)',
            'display': 'flex',
            'flex-direction': 'column',
            'justify-content': 'center',
            'align-items': 'center',
            'overflow': 'hidden'
        }
    });
        console.log('[UIWindowParticleLogin]: ✅ Window created:', el_window);
        
        // Ensure window is visible (fix display: none issue)
        $(el_window).css('display', 'block');
        $(el_window).show();
        console.log('[UIWindowParticleLogin]: Window display after show():', $(el_window).css('display'));
        
        // Get the container element
        const container = $(el_window).find('#particle-auth-container')[0];
        console.log('[UIWindowParticleLogin]: Container element:', container);
        
        if (!container) {
            console.error('[UIWindowParticleLogin]: ❌ Container not found!');
            return;
        }
        
        // Create and append iframe with full content visible
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.overflow = 'hidden';
        iframe.src = '/particle-auth';
        console.log('[UIWindowParticleLogin]: Creating iframe with src:', iframe.src);
        container.appendChild(iframe);
        console.log('[UIWindowParticleLogin]: ✅ Iframe appended to container');
        
        // Set up message listener for communication from iframe
        const messageHandler = (event) => {
            // For security, you might want to check the origin
            if (event.origin !== window.location.origin) return;
            
            const { type, payload } = event.data;
            
            // Handle both old and new message types for compatibility
            if (type === 'particle-auth-success' || type === 'particle-auth.success') {
                handleAuthSuccess(payload, container, el_window);
            }
            
            // Handle auth errors
            if (type === 'particle-auth.error') {
                console.error('[Particle Auth]:', payload?.message);
                // Show error notification
                if (typeof UINotification !== 'undefined') {
                    new UINotification({
                        type: 'error',
                        message: payload?.message || 'Authentication failed',
                        autoHide: true,
                    });
                }
            }
        };
        
        window.addEventListener('message', messageHandler);
        
        // Remove loading overlay when iframe is loaded
        iframe.onload = () => {
            setTimeout(() => {
                const loadingOverlay = container.querySelector('.loading-overlay');
                if (loadingOverlay && loadingOverlay.parentNode) {
                    loadingOverlay.parentNode.removeChild(loadingOverlay);
                }
            }, 500); // Short delay to ensure content is rendered
        };
    
        // Clean up event listener when window is closed
        $(el_window).on('remove', function() {
            window.removeEventListener('message', messageHandler);
        });
        
        // Set up message handler function that has access to options and resolve
        function handleAuthSuccess(authData, container, el_window) {
            // If the iframe already called the backend and got a token, use that directly
            if (authData.token && authData.user) {
                console.log('[Particle Auth]: Using pre-authenticated data from iframe');
                completeAuthentication(authData.token, authData.user, container, el_window);
                return;
            }
            
            // Show loading state
            const processingOverlay = showProcessingOverlay(container);
            
            // Build request payload with Smart Account support
            const requestPayload = {
                address: authData.address,
                chainId: authData.chainId,
            };
            
            // Include Smart Account address if available (UniversalX)
            if (authData.smartAccountAddress) {
                requestPayload.smartAccountAddress = authData.smartAccountAddress;
                console.log('[Particle Auth]: Authenticating with Smart Account', authData.smartAccountAddress);
            }
            
            // Call Puter's backend to authenticate with Particle Network
            // FORCE mock PC2 server for local development (iframe may have different window.api_origin)
            let apiOrigin;
            const isLocalDev = window.location.hostname === 'puter.localhost' || 
                               window.location.hostname === 'localhost' || 
                               window.location.hostname.includes('localhost') ||
                               window.location.hostname === '127.0.0.1';
            
            if (isLocalDev) {
                // Always use mock PC2 server for local dev, regardless of window.api_origin
                apiOrigin = 'http://127.0.0.1:4200';
                console.log('[Particle Auth]: 🚀 Local dev detected, forcing mock PC2 server:', apiOrigin);
            } else {
                // Production: use window.api_origin or default
                apiOrigin = window.api_origin || 'https://api.puter.com';
                console.log('[Particle Auth]: Using API origin:', apiOrigin);
            }
            console.log('[Particle Auth]: Calling auth endpoint:', `${apiOrigin}/auth/particle`);
            console.log('[Particle Auth]: Request payload:', JSON.stringify(requestPayload));
            
            fetch(`${apiOrigin}/auth/particle`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestPayload),
            })
            .then(response => {
                console.log('[Particle Auth]: Response status:', response.status, response.statusText);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('[Particle Auth]: Response data:', data);
                
                if (processingOverlay && processingOverlay.parentNode) {
                    processingOverlay.parentNode.removeChild(processingOverlay);
                }
                
                if (data && data.success) {
                    console.log('[Particle Auth]: ✅ Authentication successful, token:', data.token?.substring(0, 16) + '...');
                    completeAuthentication(data.token, data.user, container, el_window);
                } else {
                    console.warn('[Particle Auth]: ❌ Authentication failed, data:', data);
                    // Show error
                    if (typeof UINotification !== 'undefined') {
                        new UINotification({
                            type: 'error',
                            message: data?.message || 'Authentication failed',
                            autoHide: true,
                        });
                    }
                }
            })
            .catch(error => {
                console.error('[Particle Auth]: ❌ Fetch error:', error);
                
                // Hide processing overlay
                if (processingOverlay && processingOverlay.parentNode) {
                    processingOverlay.parentNode.removeChild(processingOverlay);
                }
                
                // Show error
                if (typeof UINotification !== 'undefined') {
                    new UINotification({
                        type: 'error',
                        message: 'Failed to authenticate with Particle Network',
                        autoHide: true,
                    });
                }
            });
        }
        
        // Complete the authentication flow
        function completeAuthentication(token, user, container, el_window) {
            // Update Puter's auth state
            window.update_auth_data(token, user);
            
            // Log smart account info for debugging
            if (user.smart_account_address) {
                console.log('[Particle Auth]: Logged in with UniversalX Smart Account', user.smart_account_address);
            }
            
            if(options.reload_on_success){
                sessionStorage.setItem('playChimeNextUpdate', 'yes');
                window.onbeforeunload = null;
                console.log('About to redirect, checking URL parameters:', window.location.search);
                // Replace with a clean URL to prevent password leakage
                const cleanUrl = window.location.origin + window.location.pathname;
                window.location.replace(cleanUrl);
            }else{
                // Trigger login event FIRST to load desktop
                document.dispatchEvent(new Event("login", { bubbles: true }));
                
                // Wait a moment for desktop to start loading, then close login window
                setTimeout(() => {
                    $(el_window).close();
                    resolve(true);
                }, 500);
            }
            
            // Show success notification
            if (typeof UINotification !== 'undefined') {
                const authType = user.auth_type === 'universalx' ? 'UniversalX Smart Account' : 'wallet';
                new UINotification({
                    type: 'success',
                    message: `Successfully logged in with ${authType}`,
                    autoHide: true,
                });
            }
        }
    });
}

// Helper function to show loading overlay
function showLoading(container) {
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.innerHTML = `
        <div class="loading-spinner"></div>
        <div class="loading-text">Loading Particle Network...</div>
    `;
    loadingOverlay.style.position = 'absolute';
    loadingOverlay.style.top = '0';
    loadingOverlay.style.left = '0';
    loadingOverlay.style.width = '100%';
    loadingOverlay.style.height = '100%';
    loadingOverlay.style.display = 'flex';
    loadingOverlay.style.flexDirection = 'column';
    loadingOverlay.style.alignItems = 'center';
    loadingOverlay.style.justifyContent = 'center';
    loadingOverlay.style.backgroundColor = 'transparent';
    loadingOverlay.style.zIndex = '10';
    
    const spinner = loadingOverlay.querySelector('.loading-spinner');
    spinner.style.width = '40px';
    spinner.style.height = '40px';
    spinner.style.border = '4px solid rgba(255, 255, 255, 0.2)';
    spinner.style.borderTop = '4px solid #F6921A';
    spinner.style.borderRadius = '50%';
    spinner.style.animation = 'spin 1s linear infinite';
    
    const text = loadingOverlay.querySelector('.loading-text');
    text.style.marginTop = '15px';
    text.style.color = 'rgba(255, 255, 255, 0.8)';
    
    // Add keyframes for spinner animation
    if (!document.querySelector('style#particle-spinner-style')) {
        const style = document.createElement('style');
        style.id = 'particle-spinner-style';
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
    
    container.appendChild(loadingOverlay);
}

// Helper function to show processing overlay
function showProcessingOverlay(container) {
    const processingOverlay = document.createElement('div');
    processingOverlay.className = 'processing-overlay';
    processingOverlay.innerHTML = `
        <div class="loading-spinner"></div>
        <div class="loading-text">Processing login...</div>
    `;
    processingOverlay.style.position = 'absolute';
    processingOverlay.style.top = '0';
    processingOverlay.style.left = '0';
    processingOverlay.style.width = '100%';
    processingOverlay.style.height = '100%';
    processingOverlay.style.display = 'flex';
    processingOverlay.style.flexDirection = 'column';
    processingOverlay.style.alignItems = 'center';
    processingOverlay.style.justifyContent = 'center';
    processingOverlay.style.backgroundColor = 'transparent';
    processingOverlay.style.zIndex = '10';
    
    const spinner = processingOverlay.querySelector('.loading-spinner');
    spinner.style.width = '40px';
    spinner.style.height = '40px';
    spinner.style.border = '4px solid rgba(255, 255, 255, 0.2)';
    spinner.style.borderTop = '4px solid #F6921A';
    spinner.style.borderRadius = '50%';
    spinner.style.animation = 'spin 1s linear infinite';
    
    const text = processingOverlay.querySelector('.loading-text');
    text.style.marginTop = '15px';
    text.style.color = 'rgba(255, 255, 255, 0.8)';
    
    container.appendChild(processingOverlay);
    
    return processingOverlay;
}


export default UIWindowParticleLogin;
