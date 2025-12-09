/**
 * Copyright (C) 2024-present Elacity
 *
 * PC2 Personal Cloud Settings Tab
 * Integrated into Puter Settings panel
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
            
            <div class="settings-card">
                <strong>Connection Status</strong>
                <div style="flex-grow:1; text-align: right;">
                    <span class="pc2-status-indicator" id="pc2-status-dot" style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #888; margin-right: 6px;"></span>
                    <span id="pc2-status-text" style="font-size: 13px;">Not Connected</span>
                </div>
            </div>
            
            <div id="pc2-connected-info" style="display: none;">
                <div class="settings-card">
                    <strong>Node Name</strong>
                    <div style="flex-grow:1; text-align: right;">
                        <span id="pc2-node-name" style="font-size: 13px;">-</span>
                    </div>
                </div>
                
                <div class="settings-card">
                    <strong>Node URL</strong>
                    <div style="flex-grow:1; text-align: right;">
                        <span id="pc2-node-url" style="font-size: 13px; font-family: monospace;">-</span>
                    </div>
                </div>
                
                <div class="settings-card">
                    <strong>Your Wallet</strong>
                    <div style="flex-grow:1; text-align: right;">
                        <span id="pc2-wallet" style="font-size: 12px; font-family: monospace; max-width: 200px; overflow: hidden; text-overflow: ellipsis; display: inline-block;">-</span>
                    </div>
                </div>
                
                <div class="settings-card">
                    <strong>Storage Used</strong>
                    <div style="flex-grow:1; text-align: right;">
                        <span id="pc2-storage" style="font-size: 13px;">-</span>
                    </div>
                </div>
                
                <div class="settings-card">
                    <strong>Files Stored</strong>
                    <div style="flex-grow:1; text-align: right;">
                        <span id="pc2-files" style="font-size: 13px;">-</span>
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 15px; padding: 0 15px;">
                    <button class="button" id="pc2-disconnect-btn">Disconnect</button>
                    <button class="button button-danger" id="pc2-forget-btn" style="background: #dc2626; color: white;">Forget Node</button>
                </div>
            </div>
            
            <div id="pc2-not-connected-info">
                <div class="settings-card" style="flex-direction: column; align-items: flex-start; gap: 12px;">
                    <p style="margin: 0; font-size: 13px; color: #666;">
                        Connect to your Personal Cloud (PC2) node to store files on your own hardware using decentralized identity.
                    </p>
                    <button class="button button-primary" id="pc2-connect-btn" style="background: #3b82f6; color: white;">
                        Connect to PC2
                    </button>
                </div>
            </div>
            
            <div id="pc2-trusted-wallets" style="display: none; margin-top: 20px;">
                <h2 style="font-size: 16px; margin-bottom: 10px;">Trusted Wallets</h2>
                <div class="settings-card" style="flex-direction: column; align-items: stretch;">
                    <div id="pc2-wallets-list" style="width: 100%;">
                        <span style="color: #888; font-size: 13px;">Loading...</span>
                    </div>
                    <button class="button" id="pc2-invite-btn" style="margin-top: 10px; align-self: flex-start;">
                        + Invite Wallet
                    </button>
                </div>
            </div>
            
            <style>
                .pc2-status-indicator.connected {
                    background: #22c55e !important;
                    box-shadow: 0 0 6px #22c55e;
                }
                .pc2-status-indicator.disconnected {
                    background: #f59e0b !important;
                }
                .pc2-status-indicator.connecting {
                    background: #f59e0b !important;
                    animation: pc2-pulse 1s infinite;
                }
                @keyframes pc2-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                .pc2-wallet-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 0;
                    border-bottom: 1px solid #eee;
                }
                .pc2-wallet-item:last-child {
                    border-bottom: none;
                }
                .pc2-wallet-address {
                    font-family: monospace;
                    font-size: 12px;
                    color: #666;
                }
                .pc2-wallet-badge {
                    font-size: 10px;
                    padding: 2px 6px;
                    border-radius: 4px;
                    background: #fef3c7;
                    color: #92400e;
                    font-weight: 600;
                }
                .pc2-wallet-revoke {
                    background: none;
                    border: none;
                    color: #dc2626;
                    cursor: pointer;
                    font-size: 12px;
                }
                .pc2-wallet-revoke:hover {
                    text-decoration: underline;
                }
            </style>
        `;
    },
    init: async function($el_window) {
        const pc2Service = getPC2Service();
        
        const $statusDot = $el_window.find('#pc2-status-dot');
        const $statusText = $el_window.find('#pc2-status-text');
        const $connectedInfo = $el_window.find('#pc2-connected-info');
        const $notConnectedInfo = $el_window.find('#pc2-not-connected-info');
        const $trustedWallets = $el_window.find('#pc2-trusted-wallets');
        
        // Update UI based on connection status
        function updateUI() {
            const isConnected = pc2Service.isConnected();
            const isConfigured = pc2Service.isConfigured();
            
            if (isConnected) {
                $statusDot.removeClass('disconnected connecting').addClass('connected');
                $statusText.text('Connected');
                $connectedInfo.show();
                $notConnectedInfo.hide();
                $trustedWallets.show();
                
                // Populate info
                const session = pc2Service.getSession();
                $el_window.find('#pc2-node-name').text(session?.nodeName || 'My PC2 Node');
                $el_window.find('#pc2-node-url').text(pc2Service.getNodeUrl() || '-');
                $el_window.find('#pc2-wallet').text(window.user?.wallet_address || '-');
                
                // Load stats
                loadStats();
                loadWallets();
            } else if (isConfigured) {
                $statusDot.removeClass('connected connecting').addClass('disconnected');
                $statusText.text('Disconnected');
                $connectedInfo.hide();
                $notConnectedInfo.show();
                $trustedWallets.hide();
            } else {
                $statusDot.removeClass('connected connecting disconnected');
                $statusText.text('Not Configured');
                $connectedInfo.hide();
                $notConnectedInfo.show();
                $trustedWallets.hide();
            }
        }
        
        // Load stats from PC2 node
        async function loadStats() {
            try {
                const stats = await pc2Service.getStats();
                $el_window.find('#pc2-storage').text(formatBytes(stats.storageUsed || 0));
                $el_window.find('#pc2-files').text(stats.filesCount || 0);
            } catch (error) {
                logger.error('[PC2Tab] Failed to load stats:', error);
                $el_window.find('#pc2-storage').text('-');
                $el_window.find('#pc2-files').text('-');
            }
        }
        
        // Load trusted wallets
        async function loadWallets() {
            const $list = $el_window.find('#pc2-wallets-list');
            try {
                const result = await pc2Service.request('GET', '/api/wallets');
                const wallets = result.wallets || [];
                
                if (wallets.length === 0) {
                    $list.html('<span style="color: #888; font-size: 13px;">No wallets configured</span>');
                    return;
                }
                
                $list.empty();
                wallets.forEach(wallet => {
                    const shortAddr = `${wallet.wallet_address.slice(0, 6)}...${wallet.wallet_address.slice(-4)}`;
                    const $item = $(`
                        <div class="pc2-wallet-item">
                            <div>
                                <span class="pc2-wallet-address">${shortAddr}</span>
                                ${wallet.is_owner ? '<span class="pc2-wallet-badge">Owner</span>' : ''}
                            </div>
                            ${!wallet.is_owner ? '<button class="pc2-wallet-revoke" data-wallet="' + wallet.wallet_address + '">Revoke</button>' : ''}
                        </div>
                    `);
                    $list.append($item);
                });
                
                // Revoke handlers
                $list.find('.pc2-wallet-revoke').on('click', async function() {
                    const wallet = $(this).data('wallet');
                    if (confirm(`Revoke access for ${wallet.slice(0, 6)}...${wallet.slice(-4)}?`)) {
                        try {
                            await pc2Service.request('POST', '/api/revoke', { wallet });
                            loadWallets();
                        } catch (error) {
                            alert('Failed to revoke: ' + error.message);
                        }
                    }
                });
            } catch (error) {
                $list.html('<span style="color: #888; font-size: 13px;">Unable to load wallets</span>');
            }
        }
        
        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        // Connect button - opens the setup wizard
        $el_window.find('#pc2-connect-btn').on('click', async function() {
            const { default: UIPC2SetupWizard } = await import('../UIPC2SetupWizard.js');
            UIPC2SetupWizard();
        });
        
        // Disconnect button
        $el_window.find('#pc2-disconnect-btn').on('click', function() {
            pc2Service.disconnect();
            updateUI();
        });
        
        // Forget button
        $el_window.find('#pc2-forget-btn').on('click', function() {
            if (confirm('Are you sure you want to forget this PC2 node? You will need the setup token to reconnect.')) {
                pc2Service.clearConfig();
                updateUI();
            }
        });
        
        // Invite button
        $el_window.find('#pc2-invite-btn').on('click', async function() {
            const wallet = prompt('Enter wallet address to invite:');
            if (wallet && wallet.startsWith('0x')) {
                try {
                    await pc2Service.request('POST', '/api/invite', { wallet });
                    loadWallets();
                } catch (error) {
                    alert('Failed to invite: ' + error.message);
                }
            }
        });
        
        // Listen for PC2 status changes
        window.addEventListener('pc2-status-changed', updateUI);
        
        // Initial update
        updateUI();
    },
    on_show: function($content) {
        // Refresh when tab is shown
        const pc2Service = getPC2Service();
        if (pc2Service.isConnected()) {
            // Trigger a refresh
            $content.find('#pc2-connect-btn').length === 0 && this.init($content.closest('.window-settings'));
        }
    }
};

