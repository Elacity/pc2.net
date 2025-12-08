/*
 * Copyright (C) 2024-present Elacity
 *
 * PC2 Settings Panel
 * 
 * Allows the PC2 owner to:
 * - View node information
 * - Manage tethered wallets (invite/revoke)
 * - View audit log
 * - Configure node settings
 */

import { getPC2Service } from '../services/PC2ConnectionService.js';
import { createLogger } from '../helpers/logger.js';

const logger = createLogger('PC2Settings');

/**
 * Opens the PC2 Settings panel
 */
async function UIPC2Settings() {
    const pc2Service = getPC2Service();

    // Check if connected
    if (!pc2Service.isConnected()) {
        import('./UINotification.js').then(({ default: UINotification }) => {
            UINotification({
                icon: window.icons['warning.svg'],
                title: 'Not Connected',
                text: 'Please connect to your PC2 node first.',
                duration: 3000,
            });
        });
        return;
    }

    // Remove existing
    $('.pc2-settings-panel').remove();

    const panelHtml = `
        <div class="pc2-settings-panel">
            <div class="pc2-settings-overlay"></div>
            <div class="pc2-settings-window">
                <div class="pc2-settings-header">
                    <h2 class="pc2-settings-title">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                        </svg>
                        PC2 Settings
                    </h2>
                    <button class="pc2-settings-close" aria-label="Close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>

                <div class="pc2-settings-tabs">
                    <button class="pc2-tab active" data-tab="node">Node Info</button>
                    <button class="pc2-tab" data-tab="wallets">Trusted Wallets</button>
                    <button class="pc2-tab" data-tab="audit">Audit Log</button>
                </div>

                <div class="pc2-settings-content">
                    <!-- Node Info Tab -->
                    <div class="pc2-tab-content active" data-tab="node">
                        <div class="pc2-info-section">
                            <h3 class="pc2-section-title">Connection Status</h3>
                            <div class="pc2-info-grid">
                                <div class="pc2-info-item">
                                    <span class="pc2-info-label">Status</span>
                                    <span class="pc2-info-value pc2-status-badge connected">Connected</span>
                                </div>
                                <div class="pc2-info-item">
                                    <span class="pc2-info-label">Node Name</span>
                                    <span class="pc2-info-value pc2-node-name">Loading...</span>
                                </div>
                                <div class="pc2-info-item">
                                    <span class="pc2-info-label">Node URL</span>
                                    <span class="pc2-info-value pc2-node-url monospace">Loading...</span>
                                </div>
                                <div class="pc2-info-item">
                                    <span class="pc2-info-label">Your Wallet</span>
                                    <span class="pc2-info-value pc2-wallet monospace">Loading...</span>
                                </div>
                            </div>
                        </div>

                        <div class="pc2-info-section">
                            <h3 class="pc2-section-title">Actions</h3>
                            <div class="pc2-action-buttons">
                                <button class="pc2-action-btn pc2-disconnect-action">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z"/>
                                    </svg>
                                    Disconnect
                                </button>
                                <button class="pc2-action-btn pc2-forget-action danger">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                    </svg>
                                    Forget Node
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Trusted Wallets Tab -->
                    <div class="pc2-tab-content" data-tab="wallets">
                        <div class="pc2-info-section">
                            <div class="pc2-section-header">
                                <h3 class="pc2-section-title">Trusted Wallets</h3>
                                <button class="pc2-btn-small pc2-invite-btn">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                                    </svg>
                                    Invite Wallet
                                </button>
                            </div>
                            <p class="pc2-section-desc">Only these wallets can connect to your PC2 node.</p>
                            <div class="pc2-wallets-list">
                                <div class="pc2-loading">Loading wallets...</div>
                            </div>
                        </div>
                    </div>

                    <!-- Audit Log Tab -->
                    <div class="pc2-tab-content" data-tab="audit">
                        <div class="pc2-info-section">
                            <h3 class="pc2-section-title">Security Audit Log</h3>
                            <p class="pc2-section-desc">Recent activity on your PC2 node.</p>
                            <div class="pc2-audit-list">
                                <div class="pc2-loading">Loading audit log...</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Add styles
    if (!$('#pc2-settings-styles').length) {
        $('head').append(`
            <style id="pc2-settings-styles">
                .pc2-settings-panel {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 999999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .pc2-settings-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(4px);
                }

                .pc2-settings-window {
                    position: relative;
                    background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    width: 600px;
                    max-width: 90vw;
                    max-height: 80vh;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                .pc2-settings-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 20px 24px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                }

                .pc2-settings-title {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-size: 18px;
                    font-weight: 600;
                    color: #fff;
                    margin: 0;
                }

                .pc2-settings-title svg {
                    color: #667eea;
                }

                .pc2-settings-close {
                    background: transparent;
                    border: none;
                    color: rgba(255, 255, 255, 0.5);
                    cursor: pointer;
                    padding: 8px;
                    border-radius: 8px;
                    transition: all 0.2s;
                }

                .pc2-settings-close:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff;
                }

                .pc2-settings-tabs {
                    display: flex;
                    gap: 4px;
                    padding: 8px 16px;
                    background: rgba(0, 0, 0, 0.2);
                }

                .pc2-tab {
                    padding: 10px 16px;
                    background: transparent;
                    border: none;
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    border-radius: 8px;
                    transition: all 0.2s;
                }

                .pc2-tab:hover {
                    background: rgba(255, 255, 255, 0.05);
                    color: rgba(255, 255, 255, 0.8);
                }

                .pc2-tab.active {
                    background: rgba(102, 126, 234, 0.2);
                    color: #667eea;
                }

                .pc2-settings-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 24px;
                }

                .pc2-tab-content {
                    display: none;
                }

                .pc2-tab-content.active {
                    display: block;
                }

                .pc2-info-section {
                    margin-bottom: 24px;
                }

                .pc2-section-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 12px;
                }

                .pc2-section-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: #fff;
                    margin: 0 0 12px;
                }

                .pc2-section-header .pc2-section-title {
                    margin: 0;
                }

                .pc2-section-desc {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.5);
                    margin: 0 0 16px;
                }

                .pc2-info-grid {
                    display: grid;
                    gap: 12px;
                }

                .pc2-info-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 16px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 8px;
                }

                .pc2-info-label {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.6);
                }

                .pc2-info-value {
                    font-size: 13px;
                    color: #fff;
                    font-weight: 500;
                }

                .pc2-info-value.monospace {
                    font-family: 'SF Mono', 'Monaco', monospace;
                    font-size: 12px;
                    max-width: 300px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .pc2-status-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 10px;
                    border-radius: 12px;
                    font-size: 12px;
                }

                .pc2-status-badge.connected {
                    background: rgba(74, 222, 128, 0.2);
                    color: #4ade80;
                }

                .pc2-status-badge.connected::before {
                    content: '';
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: currentColor;
                }

                .pc2-action-buttons {
                    display: flex;
                    gap: 12px;
                }

                .pc2-action-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 16px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    color: rgba(255, 255, 255, 0.8);
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .pc2-action-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                }

                .pc2-action-btn.danger {
                    color: #f87171;
                }

                .pc2-action-btn.danger:hover {
                    background: rgba(248, 113, 113, 0.1);
                }

                .pc2-btn-small {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border: none;
                    border-radius: 6px;
                    color: #fff;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .pc2-btn-small:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                }

                .pc2-wallets-list,
                .pc2-audit-list {
                    display: grid;
                    gap: 8px;
                }

                .pc2-wallet-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 8px;
                }

                .pc2-wallet-icon {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #fff;
                    font-size: 14px;
                    font-weight: 600;
                }

                .pc2-wallet-details {
                    flex: 1;
                }

                .pc2-wallet-label {
                    font-size: 13px;
                    font-weight: 500;
                    color: #fff;
                    margin-bottom: 2px;
                }

                .pc2-wallet-address {
                    font-family: 'SF Mono', 'Monaco', monospace;
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.5);
                }

                .pc2-wallet-badge {
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 600;
                    text-transform: uppercase;
                }

                .pc2-wallet-badge.owner {
                    background: rgba(251, 191, 36, 0.2);
                    color: #fbbf24;
                }

                .pc2-wallet-revoke {
                    padding: 6px;
                    background: transparent;
                    border: none;
                    color: rgba(255, 255, 255, 0.3);
                    cursor: pointer;
                    border-radius: 4px;
                    transition: all 0.2s;
                }

                .pc2-wallet-revoke:hover {
                    background: rgba(248, 113, 113, 0.1);
                    color: #f87171;
                }

                .pc2-audit-item {
                    display: flex;
                    gap: 12px;
                    padding: 12px 16px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 8px;
                }

                .pc2-audit-icon {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }

                .pc2-audit-icon.auth {
                    background: rgba(74, 222, 128, 0.1);
                    color: #4ade80;
                }

                .pc2-audit-icon.admin {
                    background: rgba(251, 191, 36, 0.1);
                    color: #fbbf24;
                }

                .pc2-audit-icon.security {
                    background: rgba(248, 113, 113, 0.1);
                    color: #f87171;
                }

                .pc2-audit-details {
                    flex: 1;
                }

                .pc2-audit-action {
                    font-size: 13px;
                    color: #fff;
                    margin-bottom: 2px;
                }

                .pc2-audit-meta {
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.5);
                }

                .pc2-loading {
                    text-align: center;
                    padding: 24px;
                    color: rgba(255, 255, 255, 0.5);
                    font-size: 13px;
                }
            </style>
        `);
    }

    // Add panel to DOM
    $('body').append(panelHtml);
    const $panel = $('.pc2-settings-panel');

    // Populate node info
    const session = pc2Service.getSession();
    $panel.find('.pc2-node-name').text(session?.nodeName || 'Unknown');
    $panel.find('.pc2-node-url').text(pc2Service.getNodeUrl() || 'Unknown');
    $panel.find('.pc2-wallet').text(window.user?.wallet_address || 'Unknown');

    // Tab switching
    $panel.find('.pc2-tab').on('click', function() {
        const tab = $(this).data('tab');
        $panel.find('.pc2-tab').removeClass('active');
        $(this).addClass('active');
        $panel.find('.pc2-tab-content').removeClass('active');
        $panel.find(`.pc2-tab-content[data-tab="${tab}"]`).addClass('active');

        // Load tab content
        if (tab === 'wallets') loadWallets();
        if (tab === 'audit') loadAudit();
    });

    // Close button
    $panel.find('.pc2-settings-close').on('click', () => $panel.remove());
    $panel.find('.pc2-settings-overlay').on('click', () => $panel.remove());

    // Disconnect action
    $panel.find('.pc2-disconnect-action').on('click', () => {
        pc2Service.disconnect();
        $panel.remove();
    });

    // Forget node action
    $panel.find('.pc2-forget-action').on('click', () => {
        if (confirm('Are you sure you want to forget this PC2 node? You will need the setup token to reconnect.')) {
            pc2Service.clearConfig();
            $panel.remove();
        }
    });

    // Invite wallet
    $panel.find('.pc2-invite-btn').on('click', () => {
        const wallet = prompt('Enter wallet address to invite:');
        if (wallet && wallet.startsWith('0x')) {
            const label = prompt('Enter a label for this wallet (optional):');
            inviteWallet(wallet, label);
        }
    });

    // Load wallets list
    async function loadWallets() {
        const $list = $panel.find('.pc2-wallets-list');
        $list.html('<div class="pc2-loading">Loading wallets...</div>');

        try {
            const result = await pc2Service.request('GET', '/pc2/wallets');
            const wallets = result.wallets || [];

            if (wallets.length === 0) {
                $list.html('<div class="pc2-loading">No wallets configured</div>');
                return;
            }

            $list.empty();
            wallets.forEach(wallet => {
                const initial = wallet.label?.[0] || wallet.wallet_address[2].toUpperCase();
                const shortAddress = `${wallet.wallet_address.slice(0, 6)}...${wallet.wallet_address.slice(-4)}`;
                
                const $item = $(`
                    <div class="pc2-wallet-item">
                        <div class="pc2-wallet-icon">${initial}</div>
                        <div class="pc2-wallet-details">
                            <div class="pc2-wallet-label">${wallet.label || 'Wallet'}</div>
                            <div class="pc2-wallet-address">${shortAddress}</div>
                        </div>
                        ${wallet.is_owner ? '<span class="pc2-wallet-badge owner">Owner</span>' : ''}
                        ${!wallet.is_owner ? `
                            <button class="pc2-wallet-revoke" data-wallet="${wallet.wallet_address}" title="Revoke access">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                </svg>
                            </button>
                        ` : ''}
                    </div>
                `);

                $item.find('.pc2-wallet-revoke').on('click', async () => {
                    if (confirm(`Revoke access for ${shortAddress}?`)) {
                        await revokeWallet(wallet.wallet_address);
                        loadWallets();
                    }
                });

                $list.append($item);
            });
        } catch (error) {
            logger.error('[PC2]: Failed to load wallets:', error);
            $list.html(`<div class="pc2-loading">Error: ${error.message}</div>`);
        }
    }

    // Load audit log
    async function loadAudit() {
        const $list = $panel.find('.pc2-audit-list');
        $list.html('<div class="pc2-loading">Loading audit log...</div>');

        try {
            const result = await pc2Service.request('GET', '/pc2/audit?limit=50');
            const entries = result.entries || [];

            if (entries.length === 0) {
                $list.html('<div class="pc2-loading">No audit entries</div>');
                return;
            }

            $list.empty();
            entries.forEach(entry => {
                const date = new Date(entry.created_at * 1000);
                const timeStr = date.toLocaleString();
                const shortWallet = entry.wallet_address 
                    ? `${entry.wallet_address.slice(0, 6)}...${entry.wallet_address.slice(-4)}`
                    : 'System';

                const $item = $(`
                    <div class="pc2-audit-item">
                        <div class="pc2-audit-icon ${entry.action_category}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                ${getAuditIcon(entry.action_category)}
                            </svg>
                        </div>
                        <div class="pc2-audit-details">
                            <div class="pc2-audit-action">${formatAction(entry.action)}</div>
                            <div class="pc2-audit-meta">${shortWallet} • ${timeStr}</div>
                        </div>
                    </div>
                `);

                $list.append($item);
            });
        } catch (error) {
            logger.error('[PC2]: Failed to load audit log:', error);
            $list.html(`<div class="pc2-loading">Error: ${error.message}</div>`);
        }
    }

    // Invite wallet
    async function inviteWallet(wallet, label) {
        try {
            const message = JSON.stringify({
                action: 'invite',
                wallet: wallet,
                timestamp: Date.now(),
            });

            const signature = await window.ethereum.request({
                method: 'personal_sign',
                params: [message, window.user?.wallet_address],
            });

            await pc2Service.request('POST', '/pc2/invite', {
                ownerWallet: window.user?.wallet_address,
                newWallet: wallet,
                label: label,
                permissions: ['full'],
                signature,
                message,
            });

            loadWallets();
        } catch (error) {
            logger.error('[PC2]: Failed to invite wallet:', error);
            alert(`Failed to invite wallet: ${error.message}`);
        }
    }

    // Revoke wallet
    async function revokeWallet(wallet) {
        try {
            const message = JSON.stringify({
                action: 'revoke',
                wallet: wallet,
                timestamp: Date.now(),
            });

            const signature = await window.ethereum.request({
                method: 'personal_sign',
                params: [message, window.user?.wallet_address],
            });

            await pc2Service.request('POST', '/pc2/revoke', {
                ownerWallet: window.user?.wallet_address,
                targetWallet: wallet,
                signature,
                message,
            });
        } catch (error) {
            logger.error('[PC2]: Failed to revoke wallet:', error);
            throw error;
        }
    }

    // Helper functions
    function getAuditIcon(category) {
        switch (category) {
            case 'auth':
                return '<path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>';
            case 'admin':
                return '<path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>';
            case 'security':
                return '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>';
            default:
                return '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>';
        }
    }

    function formatAction(action) {
        return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
}

export default UIPC2Settings;

