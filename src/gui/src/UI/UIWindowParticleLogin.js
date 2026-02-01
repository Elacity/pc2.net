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
        
        // Pass API origin to Particle Auth iframe so it knows where to send auth requests
        // This is critical for PC2 deployment - each node has its own URL/IP
        const apiOrigin = window.api_origin || window.location.origin;
        const iframeUrl = new URL('/particle-auth', window.location.origin);
        iframeUrl.searchParams.set('api_origin', apiOrigin);
        
        // Pass custom WalletConnect project ID if configured by user
        // This allows users with IP addresses or custom domains to use their own WalletConnect project
        const customWcProjectId = localStorage.getItem('pc2_custom_wc_project_id');
        if (customWcProjectId) {
            iframeUrl.searchParams.set('wc_project_id', customWcProjectId);
            console.log('[UIWindowParticleLogin]: Using custom WalletConnect project ID');
        }
        
        iframe.src = iframeUrl.toString();
        console.log('[UIWindowParticleLogin]: Creating iframe with src:', iframe.src);
        console.log('[UIWindowParticleLogin]: API origin passed to iframe:', apiOrigin);
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
            
            // Handle access denied - redirect to access-denied page
            if (type === 'particle-auth.access-denied') {
                console.log('[Particle Auth]: Access denied for wallet:', payload?.wallet);
                // Close the login window
                $(el_window).close();
                // Redirect to access denied page
                window.location.href = payload?.redirectUrl || `/access-denied?wallet=${encodeURIComponent(payload?.wallet || '')}`;
            }
        };
        
        window.addEventListener('message', messageHandler);
        
        // Remove loading overlay when iframe is loaded and send API origin
        iframe.onload = () => {
            // Send API origin to Particle Auth iframe via postMessage
            // This ensures the React app knows where to send auth requests
            // Critical for PC2 deployment where each node has its own URL/IP
            const apiOrigin = window.api_origin || window.location.origin;
            iframe.contentWindow?.postMessage({
                type: 'puter-api-origin',
                apiOrigin: apiOrigin
            }, window.location.origin);
            console.log('[UIWindowParticleLogin]: Sent API origin to iframe:', apiOrigin);
            
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
            // Remove the trouble link when window closes
            $('#wc-trouble-link-container').remove();
        });
        
        // Add "Having trouble?" link at bottom-left (opposite to "Presented by ElacityLabs")
        // Remove any existing one first
        $('#wc-trouble-link-container').remove();
        const troubleLinkHtml = `
            <div id="wc-trouble-link-container" style="
                position: fixed;
                bottom: 12px;
                left: 16px;
                z-index: 2147483647;
            ">
                <a href="#" id="wc-trouble-link" style="
                    color: #6b7280;
                    font-size: 12px;
                    text-decoration: none;
                    opacity: 0.7;
                    transition: opacity 0.2s;
                " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
                    Having trouble connecting your wallet?
                </a>
            </div>
        `;
        $('body').append(troubleLinkHtml);
        
        // Set up "Having trouble?" link click handler
        document.getElementById('wc-trouble-link').addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            showWalletConnectSetupModal(iframe, iframeUrl);
        });
        
        // Function to show the WalletConnect setup modal - using direct DOM overlay for highest z-index
        function showWalletConnectSetupModal(iframe, baseIframeUrl) {
            const currentOrigin = window.location.origin;
            const existingProjectId = localStorage.getItem('pc2_custom_wc_project_id') || '';
            
            // Remove any existing modal
            $('#wc-setup-modal-overlay').remove();
            
            // Create overlay with highest possible z-index
            const overlayHtml = `
                <div id="wc-setup-modal-overlay" style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.7);
                    z-index: 2147483647;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <div id="wc-setup-modal" style="
                        background: #fff;
                        border-radius: 12px;
                        width: 480px;
                        max-width: 90vw;
                        max-height: 90vh;
                        overflow: auto;
                        box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
                    ">
                        <div style="padding: 20px 24px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                            <h2 style="margin: 0; font-size: 18px; color: #111;">Custom WalletConnect Setup</h2>
                            <button id="wc-modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280; line-height: 1;">&times;</button>
                        </div>
                        <div style="padding: 24px;">
                            <p style="color: #6b7280; font-size: 13px; margin: 0 0 20px 0;">
                                If wallet connection doesn't work (especially for IP addresses or custom domains), 
                                you can configure your own WalletConnect project.
                            </p>
                            
                            <div style="margin-bottom: 20px;">
                                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                                    <span style="background: #3b82f6; color: #fff; border-radius: 50%; min-width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 10px;">1</span>
                                    <span style="color: #111; font-size: 14px; font-weight: 500;">Create a WalletConnect Project</span>
                                </div>
                                <p style="color: #6b7280; font-size: 12px; margin: 0 0 0 34px;">
                                    Go to <a href="https://cloud.reown.com" target="_blank" style="color: #3b82f6;">cloud.reown.com</a> and create a free project.
                                </p>
                            </div>
                            
                            <div style="margin-bottom: 20px;">
                                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                                    <span style="background: #3b82f6; color: #fff; border-radius: 50%; min-width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 10px;">2</span>
                                    <span style="color: #111; font-size: 14px; font-weight: 500;">Add Your Origin to Allowlist</span>
                                </div>
                                <div style="margin-left: 34px;">
                                    <div style="background: #f3f4f6; padding: 10px 12px; border-radius: 6px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                                        <code style="color: #059669; font-size: 13px;">${currentOrigin}</code>
                                        <button id="wc-copy-origin" style="background: #e5e7eb; border: none; color: #374151; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;">Copy</button>
                                    </div>
                                    <p style="color: #6b7280; font-size: 12px; margin: 0;">
                                        Add this URL to your project's allowlist. Changes take ~15 min.
                                    </p>
                                </div>
                            </div>
                            
                            <div style="margin-bottom: 24px;">
                                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                                    <span style="background: #3b82f6; color: #fff; border-radius: 50%; min-width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 10px;">3</span>
                                    <span style="color: #111; font-size: 14px; font-weight: 500;">Enter Your Project ID</span>
                                </div>
                                <div style="margin-left: 34px;">
                                    <input type="text" id="wc-project-id-input" value="${existingProjectId}" 
                                        placeholder="e.g., 0d1ac2ba93587a74b54f92189bdc341e" 
                                        style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; color: #111; font-size: 13px; box-sizing: border-box;">
                                </div>
                            </div>
                            
                            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                                <button id="wc-clear-btn" style="background: #f3f4f6; border: 1px solid #d1d5db; color: #374151; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;">Clear & Use Default</button>
                                <button id="wc-save-btn" style="background: #3b82f6; border: none; color: #fff; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">Save & Reload</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Append to body
            $('body').append(overlayHtml);
            
            // Close button
            $('#wc-modal-close').on('click', function() {
                $('#wc-setup-modal-overlay').remove();
            });
            
            // Click outside to close
            $('#wc-setup-modal-overlay').on('click', function(e) {
                if (e.target === this) {
                    $(this).remove();
                }
            });
            
            // Copy origin button
            $('#wc-copy-origin').on('click', function() {
                navigator.clipboard.writeText(currentOrigin);
                $(this).text('Copied!');
                setTimeout(() => $(this).text('Copy'), 2000);
            });
            
            // Save button
            $('#wc-save-btn').on('click', function() {
                const projectId = $('#wc-project-id-input').val().trim();
                if (projectId && projectId.length > 20) {
                    localStorage.setItem('pc2_custom_wc_project_id', projectId);
                    $('#wc-setup-modal-overlay').remove();
                    // Update iframe URL and reload
                    const newUrl = new URL(baseIframeUrl);
                    newUrl.searchParams.set('wc_project_id', projectId);
                    iframe.src = newUrl.toString();
                    new UINotification({
                        type: 'success',
                        message: 'WalletConnect project ID saved. Reloading...',
                        autoHide: true,
                    });
                } else {
                    new UINotification({
                        type: 'error',
                        message: 'Please enter a valid project ID (32+ characters)',
                        autoHide: true,
                    });
                }
            });
            
            // Clear button
            $('#wc-clear-btn').on('click', function() {
                localStorage.removeItem('pc2_custom_wc_project_id');
                $('#wc-setup-modal-overlay').remove();
                // Reload iframe without custom project ID
                const newUrl = new URL('/particle-auth', window.location.origin);
                newUrl.searchParams.set('api_origin', window.api_origin || window.location.origin);
                iframe.src = newUrl.toString();
                new UINotification({
                    type: 'success',
                    message: 'Using default WalletConnect project. Reloading...',
                    autoHide: true,
                });
            });
        }
        
        // Set up message handler function that has access to options and resolve
        async function handleAuthSuccess(authData, container, el_window) {
            // If the iframe already called the backend and got a token, use that directly
            if (authData.token && authData.user) {
                console.log('[Particle Auth]: Using pre-authenticated data from iframe');
                await completeAuthentication(authData.token, authData.user, container, el_window);
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
                // Production: use window.api_origin or same-origin (PC2 is self-hosted, no external services)
                apiOrigin = window.api_origin || window.location.origin;
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
            .then(async data => {
                console.log('[Particle Auth]: Response data:', data);
                
                if (processingOverlay && processingOverlay.parentNode) {
                    processingOverlay.parentNode.removeChild(processingOverlay);
                }
                
                if (data && data.success) {
                    console.log('[Particle Auth]: ✅ Authentication successful, token:', data.token?.substring(0, 16) + '...');
                    await completeAuthentication(data.token, data.user, container, el_window);
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
        async function completeAuthentication(token, user, container, el_window) {
            // Update Puter's auth state - MUST await to ensure data is saved before reload
            await window.update_auth_data(token, user);
            
            // Log smart account info for debugging
            if (user.smart_account_address) {
                console.log('[Particle Auth]: Logged in with UniversalX Smart Account', user.smart_account_address);
            }
            
            if(options.reload_on_success){
                sessionStorage.setItem('playChimeNextUpdate', 'yes');
                window.onbeforeunload = null;
                console.log('[Particle Auth]: Token saved, preparing redirect...');
                console.log('[Particle Auth]: Verifying token in localStorage:', localStorage.getItem('auth_token')?.substring(0, 16) + '...');
                // Replace with a clean URL to prevent password leakage
                const cleanUrl = window.location.origin + window.location.pathname;
                // Small delay to ensure localStorage is fully synced before navigation
                setTimeout(() => {
                    console.log('[Particle Auth]: Redirecting to:', cleanUrl);
                    window.location.replace(cleanUrl);
                }, 100);
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
