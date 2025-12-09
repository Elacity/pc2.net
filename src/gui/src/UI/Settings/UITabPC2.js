/**
 * Copyright (C) 2024-present Puter Technologies Inc.
 * Copyright (C) 2024-present Elacity
 *
 * This file is part of Puter/ElastOS.
 * PC2 (Personal Cloud Compute) Settings Tab
 */

import { uiLogger as logger } from '../../helpers/logger.js';

// PC2 Settings Tab
export default {
    id: 'pc2',
    title_i18n_key: 'pc2_settings',
    icon: 'cloud.svg',
    html: () => {
        return `
            <h1 style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 24px;">☁️</span>
                Personal Cloud
            </h1>
            
            <div class="settings-card">
                <strong>Connection Status</strong>
                <div style="flex-grow:1; text-align: right;">
                    <span class="pc2-status-indicator" id="pc2-status-indicator" style="display: inline-flex; align-items: center; gap: 6px;">
                        <span class="pc2-status-dot" id="pc2-status-dot" style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #888;"></span>
                        <span id="pc2-status-text" style="font-size: 13px;">Not Connected</span>
                    </span>
                </div>
            </div>
            
            <div id="pc2-node-info" style="display: none;">
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
                        <span id="pc2-wallet-address" style="font-size: 12px; font-family: monospace;">-</span>
                    </div>
                </div>
                
                <div class="settings-card">
                    <strong>Storage Used</strong>
                    <div style="flex-grow:1; text-align: right;">
                        <span id="pc2-storage-used" style="font-size: 13px;">-</span>
                    </div>
                </div>
                
                <div class="settings-card">
                    <strong>Files Stored</strong>
                    <div style="flex-grow:1; text-align: right;">
                        <span id="pc2-files-count" style="font-size: 13px;">-</span>
                    </div>
                </div>
            </div>
            
            <div id="pc2-connect-section">
                <div class="settings-card" style="flex-direction: column; align-items: stretch; gap: 10px;">
                    <div style="display: flex; align-items: center;">
                        <strong>PC2 Node URL</strong>
                        <div style="flex-grow:1; display: flex; gap: 10px; justify-content: flex-end;">
                            <input type="text" id="pc2-connect-url" placeholder="http://localhost:4200" style="padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; width: 220px; font-size: 13px;" />
                        </div>
                    </div>
                    <div id="pc2-connect-error" style="color: #ef4444; font-size: 12px; display: none;"></div>
                </div>
            </div>
            
            <div id="pc2-actions" style="margin-top: 15px;">
                <button class="button button-primary" id="pc2-connect-btn" style="margin-right: 10px;">
                    Connect to PC2
                </button>
                <button class="button" id="pc2-disconnect-btn" style="display: none; margin-right: 10px;">
                    Disconnect
                </button>
                <button class="button button-danger" id="pc2-forget-btn" style="display: none;">
                    Forget Node
                </button>
            </div>
            
            <style>
                .pc2-status-dot.connected {
                    background: #22c55e !important;
                    box-shadow: 0 0 6px #22c55e;
                }
                .pc2-status-dot.disconnected {
                    background: #f59e0b !important;
                }
                .pc2-status-dot.connecting {
                    background: #f59e0b !important;
                    animation: pc2-pulse 1s infinite;
                }
                @keyframes pc2-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                .button-primary {
                    background: #3b82f6 !important;
                    color: white !important;
                    border: none !important;
                }
                .button-primary:hover {
                    background: #2563eb !important;
                }
                .button-danger {
                    background: transparent !important;
                    color: #ef4444 !important;
                    border: 1px solid #ef4444 !important;
                }
                .button-danger:hover {
                    background: #ef4444 !important;
                    color: white !important;
                }
            </style>
        `;
    },
    init: function($el_window) {
        const pc2Service = globalThis.services?.get('pc2');
        if (!pc2Service) {
            logger.warn('[PC2 Settings] PC2 service not available');
            return;
        }
        
        const $statusDot = $el_window.find('#pc2-status-dot');
        const $statusText = $el_window.find('#pc2-status-text');
        const $nodeInfo = $el_window.find('#pc2-node-info');
        const $connectSection = $el_window.find('#pc2-connect-section');
        const $nodeName = $el_window.find('#pc2-node-name');
        const $nodeUrl = $el_window.find('#pc2-node-url');
        const $walletAddress = $el_window.find('#pc2-wallet-address');
        const $storageUsed = $el_window.find('#pc2-storage-used');
        const $filesCount = $el_window.find('#pc2-files-count');
        const $connectUrl = $el_window.find('#pc2-connect-url');
        const $connectError = $el_window.find('#pc2-connect-error');
        const $connectBtn = $el_window.find('#pc2-connect-btn');
        const $disconnectBtn = $el_window.find('#pc2-disconnect-btn');
        const $forgetBtn = $el_window.find('#pc2-forget-btn');
        
        // Format bytes helper
        function formatBytes(bytes) {
            if (!bytes || bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        // Update UI based on connection status
        function updateUI() {
            const status = pc2Service.getStatus();
            const config = pc2Service.getConfig();
            
            // Update status indicator
            $statusDot.removeClass('connected disconnected connecting');
            
            if (status === 'connected') {
                $statusDot.addClass('connected');
                $statusText.text('Connected');
                $nodeInfo.show();
                $connectSection.hide();
                $connectBtn.hide();
                $disconnectBtn.show();
                $forgetBtn.show();
                
                // Load stats
                loadStats();
            } else if (status === 'connecting') {
                $statusDot.addClass('connecting');
                $statusText.text('Connecting...');
            } else {
                $statusDot.addClass('disconnected');
                $statusText.text('Not Connected');
                $nodeInfo.hide();
                $connectSection.show();
                $connectBtn.show();
                $disconnectBtn.hide();
                $forgetBtn.hide();
            }
            
            // Fill in known info
            if (config?.nodeUrl) {
                $connectUrl.val(config.nodeUrl);
                $nodeUrl.text(config.nodeUrl);
            }
            
            if (pc2Service.session?.nodeName) {
                $nodeName.text(pc2Service.session.nodeName);
            }
            
            if (window.user?.wallet_address) {
                const addr = window.user.wallet_address;
                $walletAddress.text(addr.substring(0, 10) + '...' + addr.substring(addr.length - 8));
            }
        }
        
        // Load stats from PC2 node
        async function loadStats() {
            try {
                const stats = await pc2Service.getStats();
                if (stats) {
                    $storageUsed.text(formatBytes(stats.storageUsed));
                    $filesCount.text(stats.filesCount || 0);
                }
            } catch (e) {
                logger.error('[PC2 Settings] Failed to load stats:', e);
                $storageUsed.text('-');
                $filesCount.text('-');
            }
        }
        
        // Connect button handler
        $connectBtn.on('click', async function() {
            const url = $connectUrl.val().trim();
            if (!url) {
                $connectError.text('Please enter a PC2 node URL').show();
                return;
            }
            
            $connectError.hide();
            $connectBtn.prop('disabled', true).text('Connecting...');
            
            try {
                await pc2Service.connect(url);
                updateUI();
            } catch (e) {
                $connectError.text(e.message || 'Connection failed').show();
            } finally {
                $connectBtn.prop('disabled', false).text('Connect to PC2');
            }
        });
        
        // Disconnect button handler
        $disconnectBtn.on('click', function() {
            pc2Service.disconnect();
            updateUI();
        });
        
        // Forget node button handler
        $forgetBtn.on('click', function() {
            if (confirm('Are you sure you want to forget this PC2 node? You will need to reconnect and sign again.')) {
                pc2Service.forget();
                $connectUrl.val('');
                updateUI();
            }
        });
        
        // Listen for status changes
        pc2Service.onStatusChange && pc2Service.onStatusChange(updateUI);
        
        // Initial UI update
        updateUI();
    },
    on_show: function($content) {
        // Refresh status when tab is shown
        const pc2Service = globalThis.services?.get('pc2');
        if (pc2Service) {
            const $statusDot = $content.find('#pc2-status-dot');
            const $statusText = $content.find('#pc2-status-text');
            const status = pc2Service.getStatus();
            
            $statusDot.removeClass('connected disconnected connecting');
            if (status === 'connected') {
                $statusDot.addClass('connected');
                $statusText.text('Connected');
            } else if (status === 'connecting') {
                $statusDot.addClass('connecting');
                $statusText.text('Connecting...');
            } else {
                $statusDot.addClass('disconnected');
                $statusText.text('Not Connected');
            }
        }
    }
};

