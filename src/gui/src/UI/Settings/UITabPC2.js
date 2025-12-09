/**
 * Copyright (C) 2024-present Elacity
 *
 * Personal Cloud (PC2) Settings Tab
 * 
 * Consolidated tab for all personal cloud functionality:
 * - Connection status & node management
 * - Storage stats (IPFS-backed)
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
                <div style="flex-grow:1; text-align: right;">
                    <span class="pc2-status-indicator" id="pc2-status-dot" style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #888; margin-right: 6px;"></span>
                    <span id="pc2-status-text" style="font-size: 13px;">Not Connected</span>
                </div>
            </div>
            
            <!-- Not Connected State -->
            <div id="pc2-not-connected" style="display: none;">
                <div class="settings-card" style="flex-direction: column; align-items: flex-start; gap: 12px;">
                    <p style="margin: 0; font-size: 13px; color: #666;">
                        Connect to your Personal Cloud node to store files on your own hardware using decentralized identity.
                    </p>
                    <button class="button button-primary" id="pc2-connect-btn" style="background: #3b82f6; color: white;">
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
                
                <!-- IPFS Section (Collapsible) - NOT using settings-card to avoid conflicts -->
                <div id="pc2-ipfs-toggle" class="pc2-collapsible-header">
                    <strong>IPFS Node</strong>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="pc2-ipfs-status" id="pc2-ipfs-status-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #888;"></span>
                        <span id="pc2-ipfs-status-text" style="font-size: 13px; color: #666;">Checking...</span>
                        <svg id="pc2-ipfs-caret" style="width: 16px; height: 16px; transition: transform 0.2s;" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
                    </div>
                </div>
                
                <div id="pc2-ipfs-details" class="pc2-collapsible-content">
                    <div class="pc2-info-row">
                        <span>Peer ID</span>
                        <span id="pc2-ipfs-peer" style="font-family: monospace; font-size: 12px;">-</span>
                    </div>
                    <div class="pc2-info-row">
                        <span>Version</span>
                        <span id="pc2-ipfs-version">-</span>
                    </div>
                    <div class="pc2-info-row">
                        <span>Node URL</span>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <input type="text" id="pc2-ipfs-url" value="http://localhost:5001" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; width: 150px; font-size: 12px;" />
                            <button class="button" id="pc2-ipfs-test" style="padding: 4px 10px; font-size: 12px;">Test</button>
                        </div>
                    </div>
                    <div id="pc2-ipfs-test-result" style="margin-top: 8px;"></div>
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
                <div style="display: flex; gap: 10px; margin-top: 20px; padding: 0 15px;">
                    <button class="button" id="pc2-disconnect-btn">Disconnect</button>
                    <button class="button" id="pc2-forget-btn" style="background: #fee2e2; color: #dc2626; border-color: #fecaca;">Forget Node</button>
                </div>
            </div>
            
            <style>
                .pc2-status-indicator.connected, .pc2-ipfs-status.connected {
                    background: #22c55e !important;
                    box-shadow: 0 0 4px #22c55e;
                }
                .pc2-status-indicator.disconnected, .pc2-ipfs-status.disconnected {
                    background: #f59e0b !important;
                }
                .pc2-status-indicator.connecting, .pc2-ipfs-status.checking {
                    background: #f59e0b !important;
                    animation: pc2-pulse 1s infinite;
                }
                @keyframes pc2-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                
                /* IPFS Collapsible Section */
                .pc2-collapsible-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 15px;
                    margin: 0 0 1px;
                    background: #fff;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                    user-select: none;
                }
                .pc2-collapsible-header:hover {
                    background: #f9fafb;
                }
                .pc2-collapsible-content {
                    display: none;
                    padding: 12px 15px;
                    margin: -1px 0 0;
                    background: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-top: none;
                    border-radius: 0 0 6px 6px;
                }
                .pc2-info-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 0;
                    font-size: 13px;
                    border-bottom: 1px solid #e5e7eb;
                }
                .pc2-info-row:last-of-type {
                    border-bottom: none;
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
                    padding: 8px 14px;
                }
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
        
        // Update UI based on connection status
        async function updateUI() {
            const isConnected = pc2Service.isConnected?.() || false;
            const isConfigured = pc2Service.isConfigured?.() || false;
            
            if (isConnected) {
                $statusDot.removeClass('disconnected connecting').addClass('connected');
                $statusText.text('Connected');
                $connected.show();
                $notConnected.hide();
                
                // Populate node info
                const session = pc2Service.getSession?.() || {};
                $el_window.find('#pc2-node-name').text(session.nodeName || 'My PC2 Node');
                $el_window.find('#pc2-wallet').text(
                    window.user?.wallet_address 
                        ? `${window.user.wallet_address.slice(0, 6)}...${window.user.wallet_address.slice(-4)}`
                        : '-'
                );
                
                // Load all data
                await Promise.all([
                    loadStorageStats(),
                    loadIPFSStatus(),
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
                const stats = await pc2Service.getStats?.();
                if (stats) {
                    const used = stats.storageUsed || stats.storage?.used || 0;
                    const limit = stats.storageLimit || stats.storage?.limit || 10 * 1024 * 1024 * 1024;
                    const files = stats.filesCount || stats.files || 0;
                    const encrypted = stats.encryptedCount || 0;
                    
                    $el_window.find('#pc2-storage-used').text(formatBytes(used));
                    $el_window.find('#pc2-storage-limit').text(formatBytes(limit));
                    $el_window.find('#pc2-files-count').text(files);
                    $el_window.find('#pc2-encrypted-count').text(encrypted);
                    
                    // Update progress bar
                    const percent = Math.min(100, (used / limit) * 100);
                    $el_window.find('#pc2-storage-bar').css('width', `${percent}%`);
                }
            } catch (error) {
                logger.error('[PC2Tab] Failed to load storage stats:', error);
                $el_window.find('#pc2-storage-used').text('-');
                $el_window.find('#pc2-storage-limit').text('-');
            }
        }
        
        // Load IPFS node status
        async function loadIPFSStatus() {
            const $ipfsDot = $el_window.find('#pc2-ipfs-status-dot');
            const $ipfsText = $el_window.find('#pc2-ipfs-status-text');
            
            $ipfsDot.removeClass('connected disconnected').addClass('checking');
            $ipfsText.text('Checking...');
            
            try {
                const result = await puter.drivers?.call?.('storage', 'ipfs', 'connect', {
                    nodeUrl: $el_window.find('#pc2-ipfs-url').val() || 'http://localhost:5001'
                });
                
                $ipfsDot.removeClass('checking disconnected').addClass('connected');
                $ipfsText.text('Connected');
                $el_window.find('#pc2-ipfs-peer').text(
                    result.peerId ? `${result.peerId.substring(0, 12)}...` : '-'
                );
                $el_window.find('#pc2-ipfs-version').text(result.version || '-');
                return true;
            } catch (error) {
                $ipfsDot.removeClass('checking connected').addClass('disconnected');
                $ipfsText.text('Not Available');
                $el_window.find('#pc2-ipfs-peer').text('-');
                $el_window.find('#pc2-ipfs-version').text('-');
                return false;
            }
        }
        
        // Load trusted wallets
        async function loadWallets() {
            const $list = $el_window.find('#pc2-wallets-list');
            try {
                const result = await pc2Service.request?.('GET', '/api/wallets');
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
                            await pc2Service.request?.('POST', '/api/revoke', { wallet });
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
        
        // IPFS section toggle - simple show/hide
        $el_window.on('click', '#pc2-ipfs-toggle', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const $details = $el_window.find('#pc2-ipfs-details');
            const $caret = $el_window.find('#pc2-ipfs-caret');
            const $header = $(this);
            
            if ($details.is(':visible')) {
                $details.slideUp(150);
                $caret.css('transform', 'rotate(0deg)');
                $header.css('border-radius', '6px');
            } else {
                $details.slideDown(150);
                $caret.css('transform', 'rotate(180deg)');
                $header.css('border-radius', '6px 6px 0 0');
            }
            
            return false;
        });
        
        // IPFS test button
        $el_window.find('#pc2-ipfs-test').on('click', async function() {
            const $btn = $(this);
            const $result = $el_window.find('#pc2-ipfs-test-result');
            
            $btn.prop('disabled', true).text('...');
            $result.html('');
            
            const connected = await loadIPFSStatus();
            
            $btn.prop('disabled', false).text('Test');
            
            if (connected) {
                $result.html('<span style="color: #22c55e; font-size: 12px;">✓ Connection successful</span>');
            } else {
                $result.html('<span style="color: #ef4444; font-size: 12px;">✗ Connection failed</span>');
            }
        });
        
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
                await pc2Service.request?.('POST', '/api/invite', { wallet });
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
