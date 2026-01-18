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

/**
 * UIWindowWeb3Login - RainbowKit wallet connection for PC2
 * 
 * Features:
 * - Beautiful wallet selector UI (RainbowKit)
 * - WalletConnect QR code for mobile wallets
 * - Support for 50+ wallets
 * - Connects to Elastos Smart Chain
 * - Authenticates EOA with PC2 backend
 * 
 * @param {Object} options - Configuration options
 * @param {boolean} options.reload_on_success - Reload page after login (default: true)
 */
async function UIWindowWeb3Login(options = {}) {
    if (options.reload_on_success === undefined) {
        options.reload_on_success = true;
    }
    
    return new Promise(async (resolve, reject) => {
        const apiOrigin = window.api_origin || window.location.origin;
        const iframeSrc = `${apiOrigin}/particle-auth?mode=login&api_origin=${encodeURIComponent(apiOrigin)}`;
        
        console.log('[UIWindowWeb3Login]: Creating RainbowKit iframe:', iframeSrc);
        
        const h = `
            <iframe 
                id="wallet-connect-iframe"
                src="${iframeSrc}"
                style="width: 100%; height: 100%; border: none; background: #1a1a2e;"
                allow="clipboard-write"
            ></iframe>
        `;
        
        // Create the login window
        const el_window = await UIWindow({
            title: null,
            app: 'web3-login',
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
            width: '100%',
            height: '100%',
            dominant: true,
            ...options,
            window_class: 'window-web3-login',
            body_css: {
                width: '100%',
                height: '100%',
                padding: '0',
                overflow: 'hidden',
            }
        });
        
        const $window = $(el_window);
        
        // Listen for messages from the iframe
        const handleMessage = async (event) => {
            // Verify origin for security
            if (event.origin !== apiOrigin && event.origin !== window.location.origin) {
                return;
            }
            
            const { type, token, user, address } = event.data || {};
            
            if (type === 'wallet-auth-success') {
                console.log('[UIWindowWeb3Login]: Auth success from iframe:', address);
                
                // Remove the message listener
                window.removeEventListener('message', handleMessage);
                
                // Update auth data
                await window.update_auth_data(token, user);
                
                console.log('[UIWindowWeb3Login]: ✅ Login successful');
                
                if (options.reload_on_success) {
                    // Clean reload
                    sessionStorage.setItem('playChimeNextUpdate', 'yes');
                    window.onbeforeunload = null;
                    const cleanUrl = window.location.origin + window.location.pathname;
                    window.location.replace(cleanUrl);
                } else {
                    // Dispatch login event and close
                    document.dispatchEvent(new Event("login", { bubbles: true }));
                    setTimeout(() => {
                        $window.close();
                        resolve(true);
                    }, 500);
                }
            }
        };
        
        window.addEventListener('message', handleMessage);
        
        // Clean up on window close
        $window.on('remove', function() {
            window.removeEventListener('message', handleMessage);
            resolve(false);
        });
    });
}

export default UIWindowWeb3Login;
