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
        iframeUrl.searchParams.set('v', '20261014a');
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
        
        // SIWE bridge overlay state — created when iframe says it's about to
        // request the second signature, dismissed when auth resolves either way.
        // See showLoginStatusOverlay() for the styling rationale.
        let siweBridge = null;
        let siweBridgeHintTimer = null;

        const dismissSiweBridge = () => {
            if (siweBridgeHintTimer) {
                clearTimeout(siweBridgeHintTimer);
                siweBridgeHintTimer = null;
            }
            if (siweBridge) {
                siweBridge.hide();
                siweBridge = null;
            }
        };

        // Set up message listener for communication from iframe
        const messageHandler = (event) => {
            // For security, you might want to check the origin
            if (event.origin !== window.location.origin) return;
            
            const { type, payload } = event.data;
            
            // SIWE bridge: iframe is about to call personal_sign on the
            // user's wallet. Show a friendly overlay so the user knows what
            // to expect and the page never goes dark/silent on them.
            if (type === 'particle-auth.siwe-pending') {
                dismissSiweBridge(); // de-dupe in case it fires twice
                const method = (payload && payload.loginMethod) || 'wallet';
                // External-wallet methods show their signature prompt in a
                // browser-extension popup or mobile app push, OUTSIDE this
                // page → fullscreen blocker is fine and in fact helpful (it
                // tells the user "stop, look at your wallet, not the page").
                // Email/social Particle login shows its signature prompt
                // INSIDE the Particle iframe on this page → a fullscreen
                // blocker would COVER the iframe and the user can't see or
                // approve the dialog, leaving them stuck. For those, we drop
                // to the corner-toast variant.
                const isExternalWallet = method === 'metamask'
                    || method === 'walletconnect'
                    || method === 'coinbase';
                const walletLabel =
                    method === 'metamask' ? 'MetaMask'
                    : method === 'walletconnect' ? 'your wallet app'
                    : method === 'coinbase' ? 'Coinbase Wallet'
                    : 'your Particle wallet';
                siweBridge = showLoginStatusOverlay({
                    id: 'pc2-siwe-bridge-overlay',
                    title: 'Verifying wallet ownership',
                    message: `Check ${walletLabel} — we're requesting a one-time signature to securely sign you in.`,
                    hint: '',
                    position: isExternalWallet ? 'fullscreen' : 'corner',
                });
                // Escalating hints for slow relays (especially WalletConnect on Jetson)
                siweBridgeHintTimer = setTimeout(() => {
                    if (!siweBridge) return;
                    siweBridge.update({
                        hint: method === 'walletconnect'
                            ? 'Still waiting — open your wallet app and tap the pending request.'
                            : isExternalWallet
                                ? 'Still waiting — make sure your wallet popup is in the foreground.'
                                : 'Still waiting — approve the signature in the wallet dialog above.',
                    });
                    siweBridgeHintTimer = setTimeout(() => {
                        if (!siweBridge) return;
                        siweBridge.update({
                            hint: 'Taking longer than usual. If your wallet didn\'t prompt you, try closing this and signing in again.',
                        });
                    }, 12000);
                }, 8000);
                return;
            }

            // Handle both old and new message types for compatibility
            if (type === 'particle-auth-success' || type === 'particle-auth.success') {
                dismissSiweBridge();
                handleAuthSuccess(payload, container, el_window);
            }
            
            // Handle auth errors
            if (type === 'particle-auth.error') {
                dismissSiweBridge();
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
                dismissSiweBridge();
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
            dismissSiweBridge();
            $('#wc-trouble-link-container').remove();
            $('#pc2-system-readiness').remove();
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

        // System readiness badge — desktop: bottom-left, mobile: top-center below "Presented by"
        $('#pc2-system-readiness').remove();
        const readinessBadgeHtml = `
            <style>
                #pc2-system-readiness {
                    position: fixed;
                    bottom: 38px;
                    left: 16px;
                    z-index: 2147483647;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                #pc2-readiness-panel {
                    left: 0;
                    right: auto;
                    bottom: 36px;
                    top: auto;
                }
                @media (max-width: 768px) {
                    #pc2-system-readiness {
                        bottom: auto;
                        top: 48px;
                        left: 50%;
                        transform: translateX(-50%);
                    }
                    #pc2-readiness-panel {
                        left: 50% !important;
                        transform: translateX(-50%);
                        bottom: auto !important;
                        top: 36px !important;
                    }
                }
            </style>
            <div id="pc2-system-readiness">
                <div id="pc2-readiness-badge" style="
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    background: #1c1c1e;
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 20px;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-size: 12px;
                    color: #9ca3af;
                " onmouseover="this.style.background='#2c2c2e'" onmouseout="this.style.background='#1c1c1e'">
                    <span id="pc2-readiness-dot" style="
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        background: #6b7280;
                        flex-shrink: 0;
                    "></span>
                    <span id="pc2-readiness-label">Checking...</span>
                </div>
                <div id="pc2-readiness-panel" style="
                    display: none;
                    position: absolute;
                    width: 280px;
                    background: #1c1c1e;
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 16px;
                    padding: 16px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                ">
                    <div style="font-size: 13px; font-weight: 600; color: #ffffff; margin-bottom: 12px;">System Status</div>
                    <div id="pc2-readiness-items" style="display: flex; flex-direction: column; gap: 6px;"></div>
                    <div id="pc2-readiness-transport" style="
                        margin-top: 10px;
                        padding-top: 10px;
                        border-top: 1px solid rgba(255,255,255,0.06);
                    "></div>
                    <div id="pc2-readiness-footer" style="
                        margin-top: 12px;
                        padding-top: 10px;
                        border-top: 1px solid rgba(255,255,255,0.06);
                        font-size: 11px;
                        color: #8e8e93;
                    "></div>
                </div>
            </div>
        `;
        $('body').append(readinessBadgeHtml);

        // Toggle panel on badge click
        document.getElementById('pc2-readiness-badge').addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const panel = document.getElementById('pc2-readiness-panel');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });

        // Close panel when clicking elsewhere
        document.addEventListener('click', function(e) {
            const container = document.getElementById('pc2-system-readiness');
            if (container && !container.contains(e.target)) {
                const panel = document.getElementById('pc2-readiness-panel');
                if (panel) panel.style.display = 'none';
            }
        });

        // Fetch system readiness
        (async function checkSystemReadiness() {
            try {
                const apiOrigin = window.api_origin || window.location.origin;
                const resp = await fetch(`${apiOrigin}/api/system-readiness`);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const data = await resp.json();

                const dot = document.getElementById('pc2-readiness-dot');
                const label = document.getElementById('pc2-readiness-label');
                const items = document.getElementById('pc2-readiness-items');
                const transportEl = document.getElementById('pc2-readiness-transport');
                const footer = document.getElementById('pc2-readiness-footer');

                if (!dot || !label || !items || !footer) return;

                const dotColor = data.overall === 'ready' ? '#22c55e'
                               : data.overall === 'degraded' ? '#f59e0b'
                               : '#ef4444';
                dot.style.background = dotColor;
                label.textContent = `${data.ok}/${data.total} Ready`;
                label.style.color = data.overall === 'ready' ? '#9ca3af' : '#f59e0b';

                items.innerHTML = data.checks.map(function(c) {
                    const icon = c.status === 'ok'
                        ? '<span style="color:#22c55e;font-size:13px;">&#10003;</span>'
                        : '<span style="color:#f59e0b;font-size:13px;">&#9888;</span>';
                    const statusBadge = c.status === 'ok'
                        ? '<span style="font-size:10px;color:#22c55e;background:rgba(34,197,94,0.12);padding:2px 8px;border-radius:10px;">OK</span>'
                        : '<span style="font-size:10px;color:#f59e0b;background:rgba(245,158,11,0.12);padding:2px 8px;border-radius:10px;">Missing</span>';
                    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#2c2c2e;border-radius:10px;">'
                        + '<div style="display:flex;align-items:center;gap:8px;">'
                        + icon
                        + '<span style="font-size:12px;color:#ffffff;">' + c.label + '</span>'
                        + '</div>'
                        + statusBadge
                        + '</div>';
                }).join('');

                // v1.2.7.8 Fix 3.A: render the active transport row separately
                // from the binary-availability count. Pre-1.2.7.6 the user
                // saw "6/6 connected" while the cascade had silently fallen
                // to ActiveProxy; now the panel shows e.g.
                //   ✓ All 6 components installed
                //   ⚠ Active transport: ActiveProxy (fallback)
                // making the gap between "installed" and "in use" obvious.
                if (transportEl && data.transport) {
                    const t = data.transport;
                    const tColor = t.degraded ? '#f59e0b' : '#22c55e';
                    const tIcon = t.degraded
                        ? '<span style="color:#f59e0b;font-size:13px;">&#9888;</span>'
                        : '<span style="color:#22c55e;font-size:13px;">&#10003;</span>';
                    const tSuffix = t.degraded ? ' <span style="color:#f59e0b;font-size:10px;">(fallback)</span>' : '';
                    transportEl.innerHTML =
                        '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#2c2c2e;border-radius:10px;">'
                        + '<div style="display:flex;align-items:center;gap:8px;">'
                        + tIcon
                        + '<span style="font-size:12px;color:#ffffff;">Active transport</span>'
                        + '</div>'
                        + '<span style="font-size:11px;color:' + tColor + ';">'
                        + (t.label || 'Unknown') + tSuffix
                        + '</span>'
                        + '</div>';
                }

                const missingCount = data.total - data.ok;
                const transportFallback = data.transport && data.transport.degraded;
                if (missingCount > 0) {
                    footer.textContent = missingCount + ' component' + (missingCount > 1 ? 's' : '') + ' can be installed after login';
                } else if (transportFallback) {
                    const pref = data.transport.preferred;
                    const prefLabel = pref === 'wireguard' ? 'WireGuard'
                                   : pref === 'amnezia-wireguard' ? 'AmneziaWG'
                                   : 'preferred transport';
                    footer.textContent = 'All components installed but routing through ' + (data.transport.label || 'fallback')
                        + (pref ? '. ' + prefLabel + ' will activate once a peer is reachable.' : '.');
                    footer.style.color = '#f59e0b';
                } else {
                    footer.textContent = 'All systems operational';
                    footer.style.color = '#22c55e';
                }

                // Store readiness data for post-login fix flow
                window.__pc2SystemReadiness = data;

            } catch (err) {
                const label = document.getElementById('pc2-readiness-label');
                if (label) {
                    label.textContent = 'Status unavailable';
                    label.style.color = '#6b7280';
                }
            }
        })();
        
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
                newUrl.searchParams.set('v', '20261014a');
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
            // Persist loginMethod from Particle connector detection
            if (authData.loginMethod) {
                localStorage.setItem('pc2_login_method', authData.loginMethod);
            }
            
            // If the iframe already called the backend and got a token, use that directly
            if (authData.token && authData.user) {
                console.log('[Particle Auth]: Using pre-authenticated data from iframe');
                authData.user.login_method = authData.loginMethod || 'email';
                await completeAuthentication(authData.token, authData.user, container, el_window);
                return;
            }
            
            // The iframe is the only login path. An address without a
            // signature must not be posted to /auth/particle.
            if (typeof UINotification !== 'undefined') {
                new UINotification({
                    type: 'error',
                    message: 'Wallet signature is required to sign in.',
                    autoHide: true,
                });
            }
            return;
        }
        
        // Complete the authentication flow
        async function completeAuthentication(token, user, container, el_window) {
            // Store login method (email, metamask, walletconnect, etc.)
            const loginMethod = user.login_method || localStorage.getItem('pc2_login_method') || 'email';
            user.login_method = loginMethod;
            localStorage.setItem('pc2_login_method', loginMethod);
            
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

                // UX fix (#5): paint a persistent overlay over the brief
                // window between localStorage commit and the page reload.
                // Without this, the modal closes and the user sees a blank
                // dark frame for ~100ms+ before the dashboard re-mounts —
                // confusing on the Jetson where the reload can take longer.
                showLoginStatusOverlay({
                    id: 'pc2-login-reload-overlay',
                    title: 'Signing you in',
                    message: 'Loading your dashboard…',
                    hint: '',
                    accent: '#22c55e',
                });

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
                const authType = user.auth_type === 'universalx' ? 'Agent Account' : 'wallet';
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

// ---------------------------------------------------------------------------
// Login-status overlay (used by SIWE bridge + page-reload transition)
// ---------------------------------------------------------------------------
// Shared dark-themed status overlay. Matches the login modal palette
// (#1c1c1e panel, rgba(255,255,255,0.08) borders, #f59e0b accent) so the
// experience feels continuous. Used in two places:
//   1. SIWE bridge: after wallet connects but before the second signature
//      prompt arrives — kills the "dark hang" UX problem on Jetson + WC.
//   2. Page-reload transition: after successful auth, while the page is
//      replacing its URL — prevents a momentary blank window.
//
// Position modes (selected by the caller):
//   - 'fullscreen' (default): centered modal with dimmed backdrop. Use when
//     the signature prompt happens OUTSIDE this page (browser-extension
//     popup, mobile WalletConnect push) — the backdrop tells the user to
//     focus on their wallet, not the page.
//   - 'corner': compact bottom-right panel, no backdrop. Use when the
//     signature prompt happens INSIDE an iframe on this page (Particle
//     email/social login). A fullscreen overlay would COVER the iframe and
//     hide Particle's confirm dialog, leaving the user stuck. Visual
//     language matches buildWalletConnectPanel in UIWindowParticleSigning.js
//     for a consistent "we're waiting for you to act" mental model.
function showLoginStatusOverlay({ id, title, message, hint, accent, position }) {
    accent = accent || '#f59e0b';
    const isCorner = position === 'corner';

    // Inject keyframes once
    if (!document.querySelector('style#pc2-login-status-style')) {
        const style = document.createElement('style');
        style.id = 'pc2-login-status-style';
        style.textContent = `
            @keyframes pc2-login-status-spin  { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }
            @keyframes pc2-login-status-fade  { 0%{opacity:0} 100%{opacity:1} }
            @keyframes pc2-login-status-pop   { 0%{transform:scale(.96);opacity:0} 100%{transform:scale(1);opacity:1} }
            @keyframes pc2-login-status-slide { 0%{transform:translateY(20px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        `;
        document.head.appendChild(style);
    }

    // Replace any existing instance with the same id
    const existing = document.getElementById(id);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const overlay = document.createElement('div');
    overlay.id = id;

    if (isCorner) {
        // Compact bottom-right panel — no backdrop, doesn't block iframe.
        overlay.style.cssText = `
            position: fixed; right: 24px; bottom: 24px;
            z-index: 2147483642;
            background: #1c1c1e;
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            padding: 14px 16px 14px 14px;
            width: 320px; max-width: calc(100vw - 48px);
            box-shadow: 0 18px 40px -12px rgba(0,0,0,0.65);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            animation: pc2-login-status-slide 220ms cubic-bezier(.2,.9,.3,1) both;
            display: flex; gap: 12px; align-items: flex-start;
        `;

        overlay.innerHTML = `
            <div style="
                flex: 0 0 auto; width: 36px; height: 36px;
                border-radius: 50%;
                background: rgba(245, 158, 11, 0.10);
                display: flex; align-items: center; justify-content: center;
                position: relative;
            ">
                <div style="
                    position: absolute; inset: 0;
                    border: 2px solid rgba(245, 158, 11, 0.18);
                    border-top-color: ${accent};
                    border-radius: 50%;
                    animation: pc2-login-status-spin .9s linear infinite;
                "></div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
            </div>
            <div style="flex: 1 1 auto; min-width: 0;">
                <div data-overlay-title style="
                    font-size: 13px; font-weight: 600; color: #ffffff;
                    margin-bottom: 3px; letter-spacing: -0.01em;
                ">${title}</div>
                <div data-overlay-message style="
                    font-size: 12px; color: #9ca3af; line-height: 1.4;
                ">${message}</div>
                <div data-overlay-hint style="
                    margin-top: 6px; font-size: 11px; color: #6b7280; min-height: 0;
                ">${hint || ''}</div>
            </div>
        `;
    } else {
        // Fullscreen modal with backdrop (default).
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 2147483646;
            background: rgba(0, 0, 0, 0.78);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            animation: pc2-login-status-fade 180ms ease-out both;
        `;

        overlay.innerHTML = `
            <div style="
                background: #1c1c1e;
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 16px;
                padding: 28px 32px;
                max-width: 360px;
                width: calc(100% - 32px);
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6);
                text-align: center;
                animation: pc2-login-status-pop 220ms cubic-bezier(.2,.9,.3,1) both;
            ">
                <div style="
                    width: 56px; height: 56px; margin: 0 auto 18px;
                    border-radius: 50%;
                    background: rgba(245, 158, 11, 0.10);
                    display: flex; align-items: center; justify-content: center;
                    position: relative;
                ">
                    <div style="
                        position: absolute; inset: 0;
                        border: 2px solid rgba(245, 158, 11, 0.18);
                        border-top-color: ${accent};
                        border-radius: 50%;
                        animation: pc2-login-status-spin .9s linear infinite;
                    "></div>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                </div>
                <div data-overlay-title style="
                    font-size: 16px; font-weight: 600; color: #ffffff;
                    margin-bottom: 8px; letter-spacing: -0.01em;
                ">${title}</div>
                <div data-overlay-message style="
                    font-size: 13px; color: #9ca3af; line-height: 1.55;
                ">${message}</div>
                <div data-overlay-hint style="
                    margin-top: 20px;
                    font-size: 11px; color: #6b7280;
                    min-height: 14px;
                ">${hint || ''}</div>
            </div>
        `;
    }

    document.body.appendChild(overlay);

    return {
        element: overlay,
        update({ title, message, hint }) {
            if (title !== undefined) overlay.querySelector('[data-overlay-title]').textContent = title;
            if (message !== undefined) overlay.querySelector('[data-overlay-message]').textContent = message;
            if (hint !== undefined) overlay.querySelector('[data-overlay-hint]').textContent = hint || '';
        },
        hide() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        },
    };
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


// Expose showLoginStatusOverlay to non-bundled scripts that share this PC2
// origin (pc2-secure-view.js loads as a top-frame <script>, NOT through the
// GUI bundle, so it can't `import` from this module). The secure-view
// delegation flow uses this for the external-wallet personal_sign step,
// where there is otherwise zero PC2 parent-side UI cueing the user that
// their wallet popup is what's blocking progress.
if (typeof window !== 'undefined' && typeof window.pc2ShowLoginStatusOverlay !== 'function') {
    window.pc2ShowLoginStatusOverlay = showLoginStatusOverlay;
}

export default UIWindowParticleLogin;
