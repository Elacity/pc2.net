/**
 * Copyright (C) 2024-present Puter Technologies Inc.
 * Copyright (C) 2024-present Elacity
 *
 * This file is part of Puter/ElastOS.
 * IPFS Storage Settings Tab
 */

// IPFS Settings Tab
export default {
    id: 'ipfs',
    title_i18n_key: 'ipfs_storage',
    icon: 'cube-outline.svg',
    html: () => {
        return `
            <h1>${i18n('ipfs_storage')}</h1>
            
            <div class="settings-card">
                <strong>Connection Status</strong>
                <div style="flex-grow:1; text-align: right;">
                    <span class="ipfs-status-dot" id="ipfs-status-dot" style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #888; margin-right: 6px;"></span>
                    <span id="ipfs-status-text" style="font-size: 13px;">Checking...</span>
                </div>
            </div>
            
            <div class="settings-card" id="ipfs-node-info-card" style="display: none;">
                <div style="font-size: 13px; color: #666; width: 100%;">
                    <div><strong>Peer ID:</strong> <span id="ipfs-peer-id">N/A</span></div>
                    <div><strong>Version:</strong> <span id="ipfs-version">Unknown</span></div>
                </div>
            </div>
            
            <div class="settings-card">
                <strong>IPFS Node URL</strong>
                <div style="flex-grow:1; display: flex; gap: 10px; justify-content: flex-end;">
                    <input type="text" id="ipfs-node-url" value="http://localhost:5001" style="padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; width: 200px; font-size: 13px;" />
                    <button class="button" id="ipfs-test-connection">Test</button>
                </div>
            </div>
            
            <div id="ipfs-test-result" style="padding: 0 15px; margin-bottom: 10px;"></div>
            
            <div class="settings-card">
                <strong>Pinned Files</strong>
                <div style="flex-grow:1; text-align: right;">
                    <span id="ipfs-pinned-count" style="font-size: 13px;">-</span>
                </div>
            </div>
            
            <div class="settings-card">
                <strong>Total Size</strong>
                <div style="flex-grow:1; text-align: right;">
                    <span id="ipfs-total-size" style="font-size: 13px;">-</span>
                </div>
            </div>
            
            <div class="settings-card">
                <strong>Encrypted Files</strong>
                <div style="flex-grow:1; text-align: right;">
                    <span id="ipfs-encrypted-count" style="font-size: 13px;">-</span>
                </div>
            </div>
            
            <style>
                .ipfs-status-dot.connected {
                    background: #22c55e !important;
                    box-shadow: 0 0 6px #22c55e;
                }
                .ipfs-status-dot.disconnected {
                    background: #ef4444 !important;
                }
                .ipfs-status-dot.checking {
                    background: #f59e0b !important;
                    animation: ipfs-pulse 1s infinite;
                }
                @keyframes ipfs-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            </style>
        `;
    },
    init: async function($el_window) {
        const $statusDot = $el_window.find('#ipfs-status-dot');
        const $statusText = $el_window.find('#ipfs-status-text');
        const $nodeInfoCard = $el_window.find('#ipfs-node-info-card');
        const $peerId = $el_window.find('#ipfs-peer-id');
        const $version = $el_window.find('#ipfs-version');
        const $testResult = $el_window.find('#ipfs-test-result');
        const $pinnedCount = $el_window.find('#ipfs-pinned-count');
        const $totalSize = $el_window.find('#ipfs-total-size');
        const $encryptedCount = $el_window.find('#ipfs-encrypted-count');
        
        // Check connection status on load
        async function checkConnection() {
            $statusDot.removeClass('connected disconnected').addClass('checking');
            $statusText.text('Checking...');
            
            try {
                const result = await puter.drivers.call('storage', 'ipfs', 'connect', {
                    nodeUrl: $el_window.find('#ipfs-node-url').val() || 'http://localhost:5001'
                });
                
                $statusDot.removeClass('checking disconnected').addClass('connected');
                $statusText.text('Connected');
                $nodeInfoCard.show();
                $peerId.text(result.peerId ? result.peerId.substring(0, 16) + '...' : 'N/A');
                $version.text(result.version || 'Unknown');
                return true;
            } catch (error) {
                $statusDot.removeClass('checking connected').addClass('disconnected');
                $statusText.text('Disconnected');
                $nodeInfoCard.hide();
                return false;
            }
        }
        
        // Load statistics
        async function loadStats() {
            try {
                const stats = await puter.drivers.call('storage', 'ipfs', 'list', {});
                
                const files = stats.files || [];
                const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);
                const encryptedFiles = files.filter(f => f.is_encrypted).length;
                
                $pinnedCount.text(files.length);
                $totalSize.text(formatBytes(totalSize));
                $encryptedCount.text(encryptedFiles);
            } catch (error) {
                $pinnedCount.text('0');
                $totalSize.text('0 Bytes');
                $encryptedCount.text('0');
            }
        }
        
        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        // Test connection button
        $el_window.find('#ipfs-test-connection').on('click', async function() {
            const $btn = $(this);
            $btn.prop('disabled', true).text('...');
            $testResult.html('');
            
            const connected = await checkConnection();
            
            $btn.prop('disabled', false).text('Test');
            
            if (connected) {
                $testResult.html('<span style="color: #22c55e; font-size: 13px;">✓ Connection successful</span>');
                loadStats();
            } else {
                $testResult.html('<span style="color: #ef4444; font-size: 13px;">✗ Connection failed</span>');
            }
        });
        
        // Initial check
        const connected = await checkConnection();
        if (connected) {
            loadStats();
        }
    }
};
