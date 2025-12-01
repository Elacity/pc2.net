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
    
        // Get the container element
        const container = $(el_window).find('#particle-auth-container')[0];
        
        // Create and append iframe with full content visible
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.overflow = 'hidden';
        iframe.src = '/particle-auth';
        container.appendChild(iframe);
        
        // Add loading indicator
        showLoading(container);
        
        // Set up message listener for communication from iframe
        const messageHandler = (event) => {
            // For security, you might want to check the origin
            if (event.origin !== window.location.origin) return;
            
            const { type, payload } = event.data;
            
            if (type === 'particle-auth-success') {
                handleAuthSuccess(payload, container, el_window);
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
            // Show loading state
            const processingOverlay = showProcessingOverlay(container);
            
            // Call Puter's backend to authenticate with Particle Network
            fetch(`${window.api_origin}/auth/particle`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(authData),
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Update Puter's auth state
                    window.update_auth_data(data.token, data.user);
                    
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
                        new UINotification({
                            type: 'success',
                            message: 'Successfully logged in with Particle Network',
                            autoHide: true,
                        });
                    }
                } else {
                    // Hide processing overlay
                    if (processingOverlay && processingOverlay.parentNode) {
                        processingOverlay.parentNode.removeChild(processingOverlay);
                    }
                    
                    // Show error
                    if (typeof UINotification !== 'undefined') {
                        new UINotification({
                            type: 'error',
                            message: data.message || 'Authentication failed',
                            autoHide: true,
                        });
                    }
                }
            })
            .catch(error => {
                console.error('Particle auth error:', error);
                
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
    loadingOverlay.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    loadingOverlay.style.zIndex = '10';
    
    const spinner = loadingOverlay.querySelector('.loading-spinner');
    spinner.style.width = '40px';
    spinner.style.height = '40px';
    spinner.style.border = '4px solid #f3f3f3';
    spinner.style.borderTop = '4px solid #3498db';
    spinner.style.borderRadius = '50%';
    spinner.style.animation = 'spin 1s linear infinite';
    
    const text = loadingOverlay.querySelector('.loading-text');
    text.style.marginTop = '15px';
    text.style.color = '#333';
    
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
    processingOverlay.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    processingOverlay.style.zIndex = '10';
    
    const spinner = processingOverlay.querySelector('.loading-spinner');
    spinner.style.width = '40px';
    spinner.style.height = '40px';
    spinner.style.border = '4px solid #f3f3f3';
    spinner.style.borderTop = '4px solid #3498db';
    spinner.style.borderRadius = '50%';
    spinner.style.animation = 'spin 1s linear infinite';
    
    const text = processingOverlay.querySelector('.loading-text');
    text.style.marginTop = '15px';
    text.style.color = '#333';
    
    container.appendChild(processingOverlay);
    
    return processingOverlay;
}


export default UIWindowParticleLogin;
