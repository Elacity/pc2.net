/**
 * Copyright (C) 2024-present Elacity
 *
 * Personal Cloud (PC2) Settings Tab
 * 
 * Consolidated tab for all personal cloud functionality:
 * - Connection status & node management
 * - Storage stats
 * - Files & encryption
 * - Access control (trusted wallets)
 */

import { getPC2Service } from '../../services/PC2ConnectionService.js';
import { createLogger } from '../../helpers/logger.js';

const logger = createLogger('PC2Settings');

export default {
    id: 'pc2',
    title_i18n_key: 'personal_cloud',
    icon: 'cloud.svg',
    html: () => {
        return `
            <h1>Personal Cloud</h1>
            
            <!-- Connection Status -->
            <div class="settings-card">
                <strong>Connection</strong>
                <div style="flex-grow:1; text-align: right; display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
                    <span class="pc2-status-dot" id="pc2-status-dot"></span>
                    <span id="pc2-status-text" style="font-size: 13px;">Not Connected</span>
                </div>
            </div>
            
            <!-- Not Connected State -->
            <div id="pc2-not-connected" style="display: none;">
                <div class="pc2-connect-card">
                    <p>
                        Connect to your Personal Cloud node to store files on your own hardware using decentralized identity.
                    </p>
                    <button class="button pc2-btn-primary" id="pc2-connect-btn">
                        Connect to PC2
                    </button>
                </div>
            </div>
            
            <!-- Connected State -->
            <div id="pc2-connected" style="display: none;">
                
                <!-- Node Info -->
                <div class="settings-card">
                    <strong>Node</strong>
                    <div style="flex-grow:1; text-align: right;">
                        <span id="pc2-node-name" style="font-size: 13px;">-</span>
                    </div>
                </div>
                
                <div class="settings-card">
                    <strong>Your Wallet</strong>
                    <div style="flex-grow:1; text-align: right;">
                        <span id="pc2-wallet" style="font-size: 12px; font-family: monospace;">-</span>
                    </div>
                </div>
                
                <!-- Storage Section -->
                <h2 style="font-size: 15px; margin: 20px 0 10px; color: #333;">Storage</h2>
                
                <div class="settings-card">
                    <strong>Used</strong>
                    <div style="flex-grow:1; text-align: right;">
                        <span id="pc2-storage-used" style="font-size: 13px;">-</span>
                        <span style="color: #999; font-size: 12px;"> of </span>
                        <span id="pc2-storage-limit" style="font-size: 13px;">-</span>
                    </div>
                </div>
                
                <div id="pc2-storage-bar-wrapper" style="padding: 0 15px; margin-bottom: 15px;">
                    <div style="background: #e5e7eb; border-radius: 4px; height: 8px; overflow: hidden;">
                        <div id="pc2-storage-bar" style="background: #3b82f6; height: 100%; width: 0%; transition: width 0.3s;"></div>
                    </div>
                </div>
                
                <div class="settings-card">
                    <strong>Files Stored</strong>
                    <div style="flex-grow:1; text-align: right;">
                        <span id="pc2-files-count" style="font-size: 13px;">-</span>
                    </div>
                </div>
                
                <div class="settings-card">
                    <strong>Encrypted Files</strong>
                    <div style="flex-grow:1; text-align: right;">
                        <span id="pc2-encrypted-count" style="font-size: 13px;">-</span>
                    </div>
                </div>
                
                <!-- Access Control Section -->
                <h2 style="font-size: 15px; margin: 20px 0 10px; color: #333;">Access Control</h2>
                
                <div class="pc2-access-control-card">
                    <div class="pc2-access-header">
                        <strong>Trusted Wallets</strong>
                        <button class="button" id="pc2-invite-btn">
                            <span style="margin-right: 4px;">+</span> Invite
                        </button>
                    </div>
                    
                    <!-- Inline invite form (hidden by default) -->
                    <div id="pc2-invite-form" class="pc2-invite-form">
                        <div style="margin-bottom: 8px; font-size: 13px; color: #374151;">Enter wallet address to invite:</div>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" id="pc2-invite-input" placeholder="0x..." />
                            <button class="button pc2-btn-primary" id="pc2-invite-confirm">Add</button>
                            <button class="button" id="pc2-invite-cancel">Cancel</button>
                        </div>
                        <div id="pc2-invite-error" class="pc2-error-text"></div>
                    </div>
                    
                    <div id="pc2-wallets-list">
                        <span style="color: #888; font-size: 13px;">Loading...</span>
                    </div>
                </div>
                
                <!-- Actions -->
                <div style="display: flex; gap: 10px; margin-top: 20px; padding: 0 15px 30px;">
                    <button class="button" id="pc2-disconnect-btn">Disconnect</button>
                    <button class="button" id="pc2-forget-btn" style="background: #fee2e2; color: #dc2626; border-color: #fecaca;">Forget Node</button>
                </div>
            </div>
            
            <style>
                /* Status Dot - inline next to text */
                .pc2-status-dot {
                    display: inline-block;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #9ca3af;
                }
                .pc2-status-dot.connected {
                    background: #22c55e;
                    box-shadow: 0 0 4px #22c55e;
                }
                .pc2-status-dot.disconnected {
                    background: #f59e0b;
                }
                .pc2-status-dot.connecting {
                    background: #f59e0b;
                    animation: pc2-pulse 1s infinite;
                }
                @keyframes pc2-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                
                /* Connect Card - Not Connected State */
                .pc2-connect-card {
                    margin: 0 15px 20px;
                    padding: 20px;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    background: #f9fafb;
                }
                .pc2-connect-card p {
                    margin: 0 0 15px;
                    font-size: 13px;
                    color: #666;
                    line-height: 1.5;
                }
                
                /* Access Control Card - Dynamic height */
                .pc2-access-control-card {
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    background: #fff;
                    padding: 15px;
                    margin: 0 15px;
                }
                .pc2-access-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }
                .pc2-access-header .button {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 6px 14px;
                    font-size: 13px;
                }
                
                /* Invite Form */
                .pc2-invite-form {
                    display: none;
                    margin-bottom: 12px;
                    padding: 12px;
                    background: #f3f4f6;
                    border-radius: 6px;
                }
                .pc2-invite-form input {
                    flex: 1;
                    padding: 8px 12px;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    font-size: 13px;
                    font-family: monospace;
                }
                .pc2-invite-form .button {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 8px 16px;
                    font-size: 13px;
                    min-width: 70px;
                }
                
                /* Primary Button */
                .pc2-btn-primary {
                    background: #3b82f6 !important;
                    color: white !important;
                    border: none !important;
                }
                .pc2-error-text {
                    margin-top: 8px;
                    font-size: 12px;
                    color: #dc2626;
                }
                
                /* Wallet Items */
                .pc2-wallet-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 10px 0;
                    border-bottom: 1px solid #e5e7eb;
                }
                .pc2-wallet-item:last-child {
                    border-bottom: none;
                }
                .pc2-wallet-badge {
                    font-size: 10px;
                    padding: 2px 6px;
                    border-radius: 4px;
                    background: #fef3c7;
                    color: #92400e;
                    font-weight: 600;
                    margin-left: 8px;
                }
                .pc2-wallet-revoke {
                    background: none;
                    border: none;
                    color: #dc2626;
                    cursor: pointer;
                    font-size: 12px;
                    padding: 4px 8px;
                }
                .pc2-wallet-revoke:hover {
                    background: #fee2e2;
                    border-radius: 4px;
                }
            </style>
        `;
    },
    init: async function($el_window) {
        const pc2Service = getPC2Service();
        
        const $statusDot = $el_window.find('#pc2-status-dot');
        const $statusText = $el_window.find('#pc2-status-text');
        const $connected = $el_window.find('#pc2-connected');
        const $notConnected = $el_window.find('#pc2-not-connected');
        
        // Format bytes helper
        function formatBytes(bytes) {
            if (!bytes || bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        // Check if we're in PC2 mode (self-hosted)
        function isPC2Mode() {
            return window.api_origin && (
                window.api_origin.includes('127.0.0.1:4200') || 
                window.api_origin.includes('localhost:4200') ||
                window.location.origin === window.api_origin
            );
        }
        
        // Get auth token for PC2 mode API calls
        function getAuthToken() {
            // Try window.auth_token first (most reliable - set by SDK)
            if (window.auth_token) {
                return window.auth_token;
            }
            // Try PC2 service session
            const session = pc2Service.getSession?.();
            if (session?.token) {
                return session.token;
            }
            // Fallback to localStorage
            try {
                const savedSession = localStorage.getItem('pc2_session');
                if (savedSession) {
                    const sessionData = JSON.parse(savedSession);
                    return sessionData.session?.token || null;
                }
            } catch (e) {
                // Ignore localStorage errors
            }
            return null;
        }
        
        // Update UI based on connection status
        async function updateUI() {
            // SIMPLIFIED AUTH: In PC2 mode, connection status = authentication status
            const pc2Mode = isPC2Mode();
            
            // In PC2 mode, use authentication status; otherwise use service connection status
            let isConnected;
            if (pc2Mode) {
                isConnected = window.is_auth && window.is_auth() || false;
            } else {
                isConnected = pc2Service.isConnected?.() || false;
            }
            
            const isConfigured = pc2Service.isConfigured?.() || false;
            
            if (isConnected) {
                $statusDot.removeClass('disconnected connecting').addClass('connected');
                $statusText.text('Connected');
                $connected.show();
                $notConnected.hide();
                
                // Populate node info
                const session = pc2Service.getSession?.() || {};
                // In PC2 mode, show "This PC2 Node" to match status bar
                const nodeName = pc2Mode ? 'This PC2 Node' : (session.nodeName || 'My PC2 Node');
                $el_window.find('#pc2-node-name').text(nodeName);
                $el_window.find('#pc2-wallet').text(
                    window.user?.wallet_address 
                        ? `${window.user.wallet_address.slice(0, 6)}...${window.user.wallet_address.slice(-4)}`
                        : '-'
                );
                
                // Load all data
                await Promise.all([
                    loadStorageStats(),
                    loadWallets()
                ]);
            } else {
                $statusDot.removeClass('connected connecting').addClass('disconnected');
                $statusText.text(isConfigured ? 'Disconnected' : 'Not Configured');
                $connected.hide();
                $notConnected.show();
            }
        }
        
        // Load storage stats from PC2
        async function loadStorageStats() {
            try {
                let stats;
                // In PC2 mode, use direct fetch (we're already on the node)
                if (isPC2Mode() && window.api_origin) {
                    try {
                        const url = new URL('/api/stats', window.api_origin);
                        const authToken = getAuthToken();
                        const headers = {
                            'Content-Type': 'application/json'
                        };
                        if (authToken) {
                            headers['Authorization'] = `Bearer ${authToken}`;
                        }
                        
                        logger.log('[PC2Tab] Fetching stats from:', url.toString());
                        const response = await fetch(url.toString(), {
                            method: 'GET',
                            headers
                        });
                        
                        if (response.ok) {
                            stats = await response.json();
                            logger.log('[PC2Tab] Stats loaded successfully:', stats);
                        } else {
                            const errorText = await response.text().catch(() => '');
                            logger.error('[PC2Tab] Stats request failed:', response.status, response.statusText, errorText);
                            // Try without auth token if first attempt failed
                            if (authToken && response.status === 401) {
                                logger.log('[PC2Tab] Retrying without auth token...');
                                const retryResponse = await fetch(url.toString(), {
                                    method: 'GET',
                                    headers: { 'Content-Type': 'application/json' }
                                });
                                if (retryResponse.ok) {
                                    stats = await retryResponse.json();
                                    logger.log('[PC2Tab] Stats loaded without auth:', stats);
                                }
                            }
                        }
                    } catch (fetchError) {
                        logger.error('[PC2Tab] Fetch error:', fetchError);
                        throw fetchError;
                    }
                } else {
                    // Legacy mode: use service method
                    stats = await pc2Service.getStats?.();
                }
                
                if (stats) {
                    const used = stats.storageUsed || stats.storage?.used || 0;
                    const limit = stats.storageLimit || stats.storage?.limit || 10 * 1024 * 1024 * 1024;
                    const files = stats.filesCount || stats.files || 0;
                    const encrypted = stats.encryptedCount || 0;
                    
                    logger.log('[PC2Tab] Parsed stats - used:', used, 'limit:', limit, 'files:', files);
                    
                    $el_window.find('#pc2-storage-used').text(formatBytes(used));
                    $el_window.find('#pc2-storage-limit').text(formatBytes(limit));
                    $el_window.find('#pc2-files-count').text(files);
                    $el_window.find('#pc2-encrypted-count').text(encrypted);
                    
                    // Update progress bar
                    const percent = Math.min(100, (used / limit) * 100);
                    $el_window.find('#pc2-storage-bar').css('width', `${percent}%`);
                } else {
                    logger.warn('[PC2Tab] No stats data received');
                }
            } catch (error) {
                logger.error('[PC2Tab] Failed to load storage stats:', error);
                $el_window.find('#pc2-storage-used').text('-');
                $el_window.find('#pc2-storage-limit').text('-');
                $el_window.find('#pc2-files-count').text('-');
                $el_window.find('#pc2-encrypted-count').text('-');
            }
        }
        
        // Load trusted wallets
        async function loadWallets() {
            const $list = $el_window.find('#pc2-wallets-list');
            try {
                let result;
                // In PC2 mode, use direct fetch (we're already on the node)
                if (isPC2Mode() && window.api_origin) {
                    const url = new URL('/api/wallets', window.api_origin);
                    const authToken = getAuthToken();
                    const headers = {
                        'Content-Type': 'application/json'
                    };
                    if (authToken) {
                        headers['Authorization'] = `Bearer ${authToken}`;
                    }
                    const response = await fetch(url.toString(), {
                        method: 'GET',
                        headers
                    });
                    if (response.ok) {
                        result = await response.json();
                    } else {
                        throw new Error(`Failed to load wallets: ${response.status}`);
                    }
                } else {
                    // Legacy mode: use WebSocket tunnel
                    result = await pc2Service.request?.('GET', '/api/wallets');
                }
                const wallets = result?.wallets || [];
                
                if (wallets.length === 0) {
                    // Show owner wallet at minimum
                    const ownerWallet = window.user?.wallet_address;
                    if (ownerWallet) {
                        $list.html(`
                            <div class="pc2-wallet-item">
                                <div>
                                    <span style="font-family: monospace; font-size: 12px;">${ownerWallet.slice(0, 6)}...${ownerWallet.slice(-4)}</span>
                                    <span class="pc2-wallet-badge">Owner</span>
                                </div>
                            </div>
                        `);
                    } else {
                        $list.html('<span style="color: #888; font-size: 13px;">No wallets configured</span>');
                    }
                    return;
                }
                
                $list.empty();
                wallets.forEach(wallet => {
                    const shortAddr = `${wallet.wallet_address.slice(0, 6)}...${wallet.wallet_address.slice(-4)}`;
                    const $item = $(`
                        <div class="pc2-wallet-item">
                            <div>
                                <span style="font-family: monospace; font-size: 12px;">${shortAddr}</span>
                                ${wallet.is_owner ? '<span class="pc2-wallet-badge">Owner</span>' : ''}
                            </div>
                            ${!wallet.is_owner ? `<button class="pc2-wallet-revoke" data-wallet="${wallet.wallet_address}">Revoke</button>` : ''}
                        </div>
                    `);
                    $list.append($item);
                });
                
                // Revoke handlers
                $list.find('.pc2-wallet-revoke').on('click', async function() {
                    const wallet = $(this).data('wallet');
                    if (confirm(`Revoke access for ${wallet.slice(0, 6)}...${wallet.slice(-4)}?`)) {
                        try {
                            // In PC2 mode, use direct fetch (we're already on the node)
                            if (isPC2Mode() && window.api_origin) {
                                const url = new URL('/api/revoke', window.api_origin);
                                const authToken = getAuthToken();
                                const headers = {
                                    'Content-Type': 'application/json'
                                };
                                if (authToken) {
                                    headers['Authorization'] = `Bearer ${authToken}`;
                                }
                                const response = await fetch(url.toString(), {
                                    method: 'POST',
                                    headers,
                                    body: JSON.stringify({ wallet })
                                });
                                if (!response.ok) {
                                    throw new Error(`Failed to revoke: ${response.status}`);
                                }
                            } else {
                                // Legacy mode: use WebSocket tunnel
                            await pc2Service.request?.('POST', '/api/revoke', { wallet });
                            }
                            loadWallets();
                        } catch (error) {
                            alert('Failed to revoke: ' + error.message);
                        }
                    }
                });
            } catch (error) {
                // Show owner wallet as fallback
                const ownerWallet = window.user?.wallet_address;
                if (ownerWallet) {
                    $list.html(`
                        <div class="pc2-wallet-item">
                            <div>
                                <span style="font-family: monospace; font-size: 12px;">${ownerWallet.slice(0, 6)}...${ownerWallet.slice(-4)}</span>
                                <span class="pc2-wallet-badge">Owner</span>
                            </div>
                        </div>
                    `);
                } else {
                    $list.html('<span style="color: #888; font-size: 13px;">Unable to load</span>');
                }
            }
        }
        
        // Connect button
        $el_window.find('#pc2-connect-btn').on('click', async function() {
            const { default: UIPC2SetupWizard } = await import('../UIPC2SetupWizard.js');
            UIPC2SetupWizard();
        });
        
        // Disconnect button
        $el_window.find('#pc2-disconnect-btn').on('click', function() {
            pc2Service.disconnect?.();
            updateUI();
        });
        
        // Forget button
        $el_window.find('#pc2-forget-btn').on('click', function() {
            if (confirm('Forget this PC2 node? You will need the setup token to reconnect.')) {
                pc2Service.clearConfig?.();
                updateUI();
            }
        });
        
        // Invite button - show inline form
        const $inviteForm = $el_window.find('#pc2-invite-form');
        const $inviteInput = $el_window.find('#pc2-invite-input');
        const $inviteError = $el_window.find('#pc2-invite-error');
        
        $el_window.on('click', '#pc2-invite-btn', function(e) {
            e.preventDefault();
            $inviteForm.slideDown(200);
            setTimeout(() => $inviteInput.val('').focus(), 50);
            $inviteError.text('');
        });
        
        // Cancel invite
        $el_window.on('click', '#pc2-invite-cancel', function(e) {
            e.preventDefault();
            $inviteForm.slideUp(200);
            $inviteInput.val('');
            $inviteError.text('');
        });
        
        // Confirm invite
        $el_window.on('click', '#pc2-invite-confirm', async function(e) {
            e.preventDefault();
            const wallet = $inviteInput.val().trim();
            $inviteError.text('');
            
            if (!wallet) {
                $inviteError.text('Please enter a wallet address');
                return;
            }
            
            if (!wallet.startsWith('0x') || wallet.length !== 42) {
                $inviteError.text('Invalid address. Must start with 0x and be 42 characters.');
                return;
            }
            
            const $btn = $(this);
            $btn.prop('disabled', true).text('Adding...');
            
            try {
                // In PC2 mode, use direct fetch (we're already on the node)
                if (isPC2Mode() && window.api_origin) {
                    const url = new URL('/api/invite', window.api_origin);
                    const authToken = getAuthToken();
                    const headers = {
                        'Content-Type': 'application/json'
                    };
                    if (authToken) {
                        headers['Authorization'] = `Bearer ${authToken}`;
                    }
                    const response = await fetch(url.toString(), {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ wallet })
                    });
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ error: `Failed: ${response.status}` }));
                        throw new Error(errorData.error || `Failed: ${response.status}`);
                    }
                } else {
                    // Legacy mode: use WebSocket tunnel
                await pc2Service.request?.('POST', '/api/invite', { wallet });
                }
                $inviteForm.slideUp(200);
                $inviteInput.val('');
                loadWallets();
            } catch (error) {
                $inviteError.text('Failed: ' + error.message);
            } finally {
                $btn.prop('disabled', false).text('Add');
            }
        });
        
        // Allow Enter key to submit
        $inviteInput.on('keypress', function(e) {
            if (e.which === 13) {
                $el_window.find('#pc2-invite-confirm').click();
            }
        });
        
        // Listen for PC2 status changes
        window.addEventListener('pc2-status-changed', updateUI);
        
        // Initial update
        await updateUI();
    },
    on_show: async function($content) {
        // Refresh data when tab is shown
        const pc2Service = getPC2Service();
        if (pc2Service.isConnected?.()) {
            // Re-init to refresh all data
            this.init($content.closest('.window-settings'));
        }
    }
};
