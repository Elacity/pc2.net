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

import UIWindowAccountSend from './UIWindowAccountSend.js';
import UIWindowAccountReceive from './UIWindowAccountReceive.js';
import UINotification from './UINotification.js';
import walletService from '../services/WalletService.js';
import {
    truncateAddress,
    formatTokenBalance,
    formatUSD,
    formatRelativeTime,
    getChainName,
    getDefaultTokenIcon,
    sortTokensByValue,
    copyToClipboard,
    getExplorerUrl,
    getTransactionTypeLabel,
} from '../helpers/wallet.js';

// Track sidebar instance and cleanup functions
let sidebarInstance = null;
let walletUnsubscribe = null;

/**
 * UIAccountSidebar - Slide-out wallet panel for Puter OS
 * 
 * Features:
 * - Token balances display
 * - Transaction history
 * - Send tokens modal
 * - Receive tokens with QR code
 * - Real-time balance updates
 * 
 * @param {Object} options - Configuration options
 * @returns {HTMLElement} The sidebar element
 */
async function UIAccountSidebar(options = {}) {
    // If sidebar already open, toggle it
    if (sidebarInstance) {
        closeSidebar();
        return null;
    }
    
    // Clean up any orphaned elements from previous sessions - AGGRESSIVE cleanup
    $('.account-sidebar-backdrop').css('pointer-events', 'none').off().remove();
    $('.account-sidebar').css('pointer-events', 'none').off().remove();
    $(document).off('.accountSidebar');
    $(document).off('keydown.accountSidebar');
    
    // Double-check no orphan elements remain
    $('[class*="account-sidebar"]').css('pointer-events', 'none').off().remove();
    
    // Clean up any orphaned subscriptions
    if (walletUnsubscribe) {
        walletUnsubscribe();
        walletUnsubscribe = null;
    }
    
    // Check if wallet is connected - for testing, allow even without wallet
    const isConnected = walletService.isConnected();
    const address = isConnected ? walletService.getAddress() : (window.user?.wallet_address || window.user?.smart_account_address || '0x0000...0000');
    
    if (!address && !window.user) {
        UINotification({
            icon: window.icons['warning.svg'],
            title: i18n('wallet_not_connected') || 'Wallet Not Connected',
            text: i18n('please_connect_wallet') || 'Please connect your wallet first.',
        });
        return null;
    }
    
    const sidebar_id = `account-sidebar-${window.global_element_id++}`;
    const isUA = walletService.isUniversalAccount();
    
    // Get initial wallet data
    const walletData = walletService.getData();
    
    // Inject inline styles if not already present (DARK MODE)
    if (!document.getElementById('account-sidebar-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'account-sidebar-styles';
        styleEl.textContent = `
            .account-sidebar {
                position: fixed;
                top: 0;
                right: 0;
                width: 380px;
                height: 100vh;
                background: #1f2020;
                box-shadow: -4px 0 20px rgba(0, 0, 0, 0.4);
                z-index: 9998;
                display: flex;
                flex-direction: column;
                border-left: 1px solid rgba(255, 255, 255, 0.1);
                transform: translateX(100%);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), pointer-events 0s;
                color: #fff;
                pointer-events: none;
            }
            .account-sidebar.open {
                transform: translateX(0);
                pointer-events: auto;
            }
            .account-sidebar-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.5);
                z-index: 9997;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.3s ease;
            }
            .account-sidebar-backdrop.visible {
                opacity: 1;
                pointer-events: auto;
            }
            .account-sidebar-close {
                position: absolute;
                top: 12px;
                right: 12px;
                width: 28px;
                height: 28px;
                border: none;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10;
                color: #fff;
            }
            .account-sidebar-close:hover {
                background: rgba(255, 255, 255, 0.2);
            }
            .account-sidebar-close svg, .refresh-btn svg {
                stroke: #fff;
            }
            .refresh-btn {
                position: absolute;
                top: 12px;
                left: 12px;
                width: 28px;
                height: 28px;
                border: none;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #fff;
            }
            .refresh-btn:hover {
                background: rgba(255, 255, 255, 0.2);
            }
            .account-sidebar-header {
                padding: 60px 20px 20px;
                border-bottom: none;
                background: transparent;
            }
            .account-sidebar-profile {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 16px;
            }
            .account-avatar {
                width: 44px;
                height: 44px;
                border-radius: 50%;
                background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                font-weight: 600;
                color: white;
            }
            .account-address {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 6px 10px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 16px;
                font-family: monospace;
                font-size: 12px;
                color: #e5e7eb;
                cursor: pointer;
            }
            .account-address:hover {
                background: rgba(255, 255, 255, 0.15);
            }
            .account-address svg {
                stroke: #9ca3af;
            }
            .account-balance {
                text-align: center;
                padding-top: 8px;
            }
            .balance-amount {
                display: block;
                font-size: 28px;
                font-weight: 700;
                color: #fff;
            }
            .balance-label {
                display: block;
                font-size: 12px;
                color: #9ca3af;
                margin-top: 4px;
            }
            .account-sidebar-actions {
                display: flex;
                gap: 10px;
                padding: 16px 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }
            .action-btn {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 4px;
                padding: 12px;
                border: none;
                border-radius: 10px;
                background: #3b82f6;
                color: white;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
            }
            .action-btn:hover {
                background: #2563eb;
            }
            .action-btn.action-receive {
                background: #10b981;
            }
            .action-btn.action-receive:hover {
                background: #059669;
            }
            .account-sidebar-tabs {
                display: flex;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }
            .sidebar-tab {
                flex: 1;
                padding: 12px;
                text-align: center;
                font-size: 13px;
                font-weight: 500;
                color: #9ca3af;
                cursor: pointer;
                border-bottom: 2px solid transparent;
                background: transparent;
            }
            .sidebar-tab:hover {
                color: #e5e7eb;
            }
            .sidebar-tab.active {
                color: #F6921A;
                border-bottom-color: #F6921A;
            }
            .account-sidebar-content {
                flex: 1;
                overflow-y: auto;
            }
            .tab-content {
                display: none;
            }
            .tab-content.active {
                display: block;
            }
            .tokens-list, .history-list {
                padding: 8px 0;
            }
            .token-row, .history-row {
                display: flex;
                align-items: center;
                padding: 10px 20px;
                gap: 10px;
                cursor: pointer;
            }
            .token-row:hover, .history-row:hover {
                background: rgba(255, 255, 255, 0.05);
            }
            .token-icon {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.1);
            }
            .token-info, .tx-info {
                flex: 1;
            }
            .token-symbol, .tx-type {
                font-weight: 600;
                font-size: 14px;
                color: #fff;
                display: block;
            }
            .token-network, .tx-time {
                font-size: 11px;
                color: #9ca3af;
                display: block;
            }
            .token-balance {
                text-align: right;
            }
            .token-amount {
                font-weight: 500;
                font-size: 14px;
                color: #fff;
                display: block;
            }
            .token-usd {
                font-size: 11px;
                color: #9ca3af;
                display: block;
            }
            .empty-state {
                padding: 60px 20px;
                text-align: center;
                color: #6b7280;
            }
            .empty-state svg {
                width: 48px;
                height: 48px;
                stroke: #4b5563;
                margin-bottom: 16px;
            }
            /* Mode Toggle Styles */
            .wallet-mode-toggle {
                display: flex;
                gap: 8px;
                padding: 0 20px 16px;
            }
            .mode-btn {
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 10px 12px;
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 8px;
                background: transparent;
                color: #9ca3af;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .mode-btn:hover {
                border-color: rgba(255, 255, 255, 0.3);
                color: #fff;
            }
            .mode-btn.active {
                background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2));
                border-color: rgba(139, 92, 246, 0.5);
                color: #fff;
            }
            .mode-btn.active.elastos {
                background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(34, 197, 94, 0.2));
                border-color: rgba(34, 197, 94, 0.5);
            }
            .mode-icon {
                width: 18px;
                height: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .mode-label {
                font-size: 12px;
            }
            @media (max-width: 768px) {
                .account-sidebar {
                    width: 100%;
                }
            }
        `;
        document.head.appendChild(styleEl);
    }
    
    // Inline SVG icons for reliability
    const closeIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    const refreshIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`;
    const sendIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
    const receiveIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;
    const copyIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    
    // Mode icons
    const universalIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
    // Elastos logo - simplified version of official logo
    const elastosIcon = `<svg width="18" height="18" viewBox="0 0 1080 1080" fill="none"><path d="M793 533l-61-36-26-15c-10-6-22-6-32 0l-119 69c-10 6-22 6-32 0l-118-69c-10-6-22-6-32 0l-26 15-61 36c-21 13-21 43 0 55l104 60 135 78c10 6 22 6 32 0l135-78 104-60c19-12 19-42-2-55z" fill="url(#ela1)"/><path d="M793 406l-88-51c-10-6-22-6-32 0l-119 69c-10 6-22 6-32 0l-119-69c-10-6-22-6-32 0l-86 51c-21 13-21 43 0 55l62 36 42 24 135 78c10 6 22 6 32 0l135-78 42-24 62-36c20-12 20-42-2-55z" fill="url(#ela2)"/><defs><linearGradient id="ela1" x1="540" y1="731" x2="540" y2="478" gradientUnits="userSpaceOnUse"><stop stop-color="#F6921A"/><stop offset="1" stop-color="#B04200"/></linearGradient><linearGradient id="ela2" x1="540" y1="447" x2="540" y2="604" gradientUnits="userSpaceOnUse"><stop stop-color="#FFEEDC"/><stop offset="1" stop-color="#FFC382"/></linearGradient></defs></svg>`;
    
    // Get current mode
    const currentMode = walletService.getMode();
    const displayAddress = currentMode === 'elastos' 
        ? (window.user?.wallet_address || address) 
        : address;
    
    // Build sidebar HTML
    const h = `
        <div id="${sidebar_id}" class="account-sidebar">
            <!-- Close Button -->
            <button class="account-sidebar-close" title="${i18n('close') || 'Close'}">
                ${closeIcon}
            </button>
            
            <!-- Refresh Button -->
            <button class="refresh-btn" title="${i18n('refresh') || 'Refresh'}">
                ${refreshIcon}
            </button>
            
            <!-- Header Section -->
            <div class="account-sidebar-header">
                <div class="account-sidebar-profile">
                    <div class="account-avatar">
                        ${getAvatarContent(displayAddress)}
                    </div>
                    <div class="account-address" data-address="${html_encode(displayAddress || '')}" title="${i18n('click_to_copy') || 'Click to copy'}">
                        <span class="address-text">${truncateAddress(displayAddress || '0x0000...0000')}</span>
                        ${copyIcon}
                    </div>
                </div>
                
                <div class="account-balance">
                    <span class="balance-amount">${formatUSD(walletData.totalBalance)}</span>
                    <span class="balance-label">${i18n('total_balance') || 'Total Balance'}</span>
                </div>
            </div>
            
            <!-- Mode Toggle -->
            <div class="wallet-mode-toggle">
                <button class="mode-btn ${currentMode === 'universal' ? 'active' : ''}" data-mode="universal">
                    <span class="mode-icon">${universalIcon}</span>
                    <span class="mode-label">Universal</span>
                </button>
                <button class="mode-btn elastos ${currentMode === 'elastos' ? 'active' : ''}" data-mode="elastos">
                    <span class="mode-icon">${elastosIcon}</span>
                    <span class="mode-label">Elastos</span>
                </button>
            </div>
            
            <!-- Action Buttons -->
            <div class="account-sidebar-actions">
                <button class="action-btn action-send">
                    ${sendIcon}
                    <span>${i18n('send') || 'Send'}</span>
                </button>
                <button class="action-btn action-receive">
                    ${receiveIcon}
                    <span>${i18n('receive') || 'Receive'}</span>
                </button>
            </div>
            
            <!-- Tab Navigation -->
            <div class="account-sidebar-tabs">
                <div class="sidebar-tab active" data-tab="tokens">${i18n('tokens') || 'Tokens'}</div>
                <div class="sidebar-tab" data-tab="history">${i18n('history') || 'History'}</div>
            </div>
            
            <!-- Tab Content -->
            <div class="account-sidebar-content">
                <div class="tab-content active" data-tab="tokens">
                    <div class="tokens-list">
                        ${renderTokensList(walletData.tokens)}
                    </div>
                </div>
                <div class="tab-content" data-tab="history">
                    <div class="history-list">
                        ${renderHistoryList(walletData.transactions)}
                    </div>
                </div>
            </div>
        </div>
        <div id="${sidebar_id}-backdrop" class="account-sidebar-backdrop"></div>
    `;
    
    // Append to body
    $('body').append(h);
    
    const $sidebar = $(`#${sidebar_id}`);
    const $backdrop = $(`#${sidebar_id}-backdrop`);
    
    // Store instance reference with backdrop ID
    sidebarInstance = {
        sidebar: $sidebar[0],
        backdropId: `${sidebar_id}-backdrop`
    };
    
    // Trigger open animation
    requestAnimationFrame(() => {
        $sidebar.addClass('open');
        $backdrop.addClass('visible');
    });
    
    // ==========================================
    // Event Handlers
    // ==========================================
    
    // Tab switching
    $sidebar.on('click', '.sidebar-tab', function() {
        const tab = $(this).data('tab');
        $sidebar.find('.sidebar-tab').removeClass('active');
        $(this).addClass('active');
        $sidebar.find('.tab-content').removeClass('active');
        $sidebar.find(`.tab-content[data-tab="${tab}"]`).addClass('active');
        
        // Refresh data when switching to history tab
        if (tab === 'history' && walletData.transactions.length === 0) {
            walletService.refreshTransactions().catch(() => {});
        }
    });
    
    // Send button
    $sidebar.on('click', '.action-send', function() {
        UIWindowAccountSend({
            tokens: walletService.getTokens(),
            address: walletService.getAddress(),
        });
    });
    
    // Receive button
    $sidebar.on('click', '.action-receive', function() {
        UIWindowAccountReceive({
            address: walletService.getAddress(),
            smartAccountAddress: walletService.getSmartAccountAddress(),
            eoaAddress: walletService.getEOAAddress(),
        });
    });
    
    // Mode toggle buttons
    $sidebar.on('click', '.mode-btn', async function() {
        const mode = $(this).data('mode');
        const currentMode = walletService.getMode();
        
        if (mode === currentMode) return;
        
        // Update button states
        $sidebar.find('.mode-btn').removeClass('active');
        $(this).addClass('active');
        
        // Show loading state
        $sidebar.find('.balance-amount').text('...');
        $sidebar.find('.tokens-list').html('<div class="empty-state"><p>Loading...</p></div>');
        
        // Switch mode in wallet service
        try {
            await walletService.setMode(mode);
            
            // Update address display
            const newAddress = walletService.getAddress();
            $sidebar.find('.account-address').attr('data-address', newAddress);
            $sidebar.find('.address-text').text(truncateAddress(newAddress));
            $sidebar.find('.account-avatar').html(getAvatarContent(newAddress));
        } catch (error) {
            console.error('[UIAccountSidebar]: Mode switch error:', error);
        }
    });
    
    // Close button
    $sidebar.on('click', '.account-sidebar-close', function() {
        closeSidebar();
    });
    
    // Backdrop click - use namespace for proper cleanup
    $backdrop.on('click.accountSidebar', function() {
        closeSidebar();
    });
    
    // ESC key to close
    $(document).on('keydown.accountSidebar', function(e) {
        if (e.key === 'Escape') {
            closeSidebar();
        }
    });
    
    // Copy address
    $sidebar.on('click', '.account-address', async function() {
        const addr = $(this).data('address');
        const success = await copyToClipboard(addr);
        
        if (success) {
            $(this).addClass('copied');
            $(this).find('.address-text').text(i18n('copied') || 'Copied!');
            
            setTimeout(() => {
                $(this).removeClass('copied');
                $(this).find('.address-text').text(truncateAddress(addr));
            }, 2000);
        }
    });
    
    // Refresh button
    $sidebar.on('click', '.refresh-btn', async function() {
        const $btn = $(this);
        if ($btn.hasClass('loading')) return;
        
        $btn.addClass('loading');
        
        try {
            await Promise.all([
                walletService.refreshTokens(),
                walletService.refreshTransactions(),
            ]);
        } catch (error) {
            console.error('[AccountSidebar]: Refresh error:', error);
        } finally {
            $btn.removeClass('loading');
        }
    });
    
    // Token row click - open explorer
    $sidebar.on('click', '.token-row', function() {
        const tokenAddress = $(this).data('token-address');
        const chainId = $(this).data('chain-id');
        
        if (tokenAddress && chainId) {
            const url = getExplorerUrl(chainId, tokenAddress, 'address');
            window.open(url, '_blank');
        }
    });
    
    // Transaction row click - open explorer
    $sidebar.on('click', '.history-row', function() {
        const txHash = $(this).data('tx-hash');
        const chainId = $(this).data('chain-id');
        
        if (txHash && chainId) {
            const url = getExplorerUrl(chainId, txHash, 'tx');
            window.open(url, '_blank');
        }
    });
    
    // ==========================================
    // Wallet Data Updates
    // ==========================================
    
    // Subscribe to wallet data updates - store for cleanup
    walletUnsubscribe = walletService.subscribe((data) => {
        console.log('[UIAccountSidebar]: Received wallet update:', {
            mode: data.mode,
            totalBalance: data.totalBalance,
            tokensCount: data.tokens?.length,
            sidebarExists: !!sidebarInstance,
        });
        
        // Only update if sidebar still exists
        if (!sidebarInstance) return;
        
        // Update mode buttons
        $sidebar.find('.mode-btn').removeClass('active');
        $sidebar.find(`.mode-btn[data-mode="${data.mode}"]`).addClass('active');
        
        // Update balance - show ELA amount for Elastos mode, USD for Universal
        let formattedBalance;
        if (data.mode === 'elastos' && data.tokens?.length > 0) {
            const elaToken = data.tokens.find(t => t.symbol === 'ELA');
            formattedBalance = elaToken ? `${parseFloat(elaToken.balance).toFixed(4)} ELA` : '0 ELA';
        } else {
            formattedBalance = formatUSD(data.totalBalance);
        }
        console.log('[UIAccountSidebar]: Setting balance to:', formattedBalance);
        $sidebar.find('.balance-amount').text(formattedBalance);
        
        // Update address display
        if (data.address) {
            $sidebar.find('.account-address').attr('data-address', data.address);
            $sidebar.find('.address-text').text(truncateAddress(data.address));
            $sidebar.find('.account-avatar').html(getAvatarContent(data.address));
        }
        
        // Update tokens list
        $sidebar.find('.tokens-list').html(renderTokensList(data.tokens));
        
        // Update history list
        $sidebar.find('.history-list').html(renderHistoryList(data.transactions));
    });
    
    // Also listen for jQuery events
    $(document).on('wallet:data:updated.accountSidebar', function(e, data) {
        if (!sidebarInstance) return;
        
        $sidebar.find('.balance-amount').text(formatUSD(data.totalBalance));
        $sidebar.find('.tokens-list').html(renderTokensList(data.tokens));
    });
    
    $(document).on('wallet:transactions:updated.accountSidebar', function(e, transactions) {
        if (!sidebarInstance) return;
        
        $sidebar.find('.history-list').html(renderHistoryList(transactions));
    });
    
    // Start polling for updates (60 seconds - balance doesn't change that often)
    walletService.startPolling(60000);
    
    // Initial data fetch
    walletService.refreshTokens().catch(() => {});
    
    // Note: cleanup is handled by closeSidebar() function
    // The unsubscribe is called when the sidebar is properly closed
    
    return $sidebar[0];
}

/**
 * Close the sidebar with animation
 */
function closeSidebar() {
    if (!sidebarInstance) return;
    
    const $sidebar = $(sidebarInstance.sidebar);
    const backdropId = sidebarInstance.backdropId;
    const $backdrop = $(`#${backdropId}`);
    
    // Immediately reset sidebarInstance to prevent double-close issues
    sidebarInstance = null;
    
    // Unsubscribe from wallet updates
    if (walletUnsubscribe) {
        walletUnsubscribe();
        walletUnsubscribe = null;
    }
    
    // Clean up document-level handlers immediately
    $(document).off('.accountSidebar');
    $(document).off('keydown.accountSidebar');
    
    // Stop wallet polling immediately
    walletService.stopPolling();
    
    // IMMEDIATELY remove backdrop to allow clicks through - don't wait for animation
    $backdrop.off().remove();
    
    // Remove classes to trigger close animation on sidebar
    $sidebar.removeClass('open');
    $sidebar.css('pointer-events', 'none');
    
    // Remove sidebar after animation completes
    setTimeout(() => {
        $sidebar.off();
        $sidebar.remove();
        
        // Final cleanup - remove ANY orphaned elements
        $('.account-sidebar-backdrop').off().remove();
        $('.account-sidebar').off().remove();
        $('[class*="account-sidebar"]').off().remove();
    }, 350);
}

/**
 * Get avatar content (initials or image)
 */
function getAvatarContent(address) {
    if (!address) return '?';
    
    // Use first 2 chars after 0x as initials
    const initials = address.slice(2, 4).toUpperCase();
    return initials;
}

/**
 * Render tokens list HTML
 */
function renderTokensList(tokens) {
    if (!tokens || tokens.length === 0) {
        return `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4b5563" stroke-width="1.5" style="display:block;margin:0 auto 16px;">
                    <circle cx="9" cy="9" r="7"/>
                    <path d="M17.5 12.5a7 7 0 1 1-5-12"/>
                </svg>
                <div style="font-size:14px;font-weight:500;color:#9ca3af;margin-bottom:4px;">${i18n('no_tokens') || 'No Tokens Found'}</div>
                <div style="font-size:12px;color:#6b7280;">${i18n('tokens_will_appear') || 'Your tokens will appear here'}</div>
            </div>
        `;
    }
    
    // Sort by USD value
    const sortedTokens = sortTokensByValue(tokens);
    
    // Token image paths (relative to gui/src/images/tokens/)
    const tokenImages = {
        'ELA': 'images/tokens/ELA.png',
        'ETH': 'images/tokens/ETH.png',
        'USDC': 'images/tokens/USDC.png',
        'USDT': 'images/tokens/USDT.png',
        'BNB': 'images/tokens/BNB.png',
        'SOL': 'images/tokens/Sol.webp',
        'BTC': 'images/tokens/BTC.svg',
        'MNT': 'images/tokens/MNT.webp',
        'MATIC': 'images/tokens/ETH.png', // Fallback to ETH style
    };
    
    // Fallback styling for tokens without images
    const getTokenIconStyle = (symbol) => {
        const styles = {
            'ELA': 'background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;',
            'ETH': 'background:linear-gradient(135deg,#627eea,#3b52ce);color:#fff;',
            'USDC': 'background:#2775ca;color:#fff;',
            'USDT': 'background:#26a17b;color:#fff;',
            'BNB': 'background:#f3ba2f;color:#000;',
        };
        return styles[symbol] || 'background:rgba(255,255,255,0.1);color:#9ca3af;';
    };
    
    const getTokenIconHtml = (symbol) => {
        const imgPath = tokenImages[symbol];
        if (imgPath) {
            return `<img src="${imgPath}" alt="${symbol}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.style.display='none';this.nextSibling.style.display='flex';" /><span style="display:none;width:100%;height:100%;align-items:center;justify-content:center;${getTokenIconStyle(symbol)}font-weight:600;font-size:12px;border-radius:50%;">${symbol ? symbol.slice(0, 2).toUpperCase() : '??'}</span>`;
        }
        return `<span style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;${getTokenIconStyle(symbol)}font-weight:600;font-size:12px;border-radius:50%;">${symbol ? symbol.slice(0, 2).toUpperCase() : '??'}</span>`;
    };
    
    return sortedTokens.map(token => `
        <div class="token-row" 
             data-token-address="${html_encode(token.address || '')}"
             data-chain-id="${html_encode(token.chainId || '')}">
            <div class="token-icon" style="display:flex;align-items:center;justify-content:center;overflow:hidden;">
                ${getTokenIconHtml(token.symbol)}
            </div>
            <div class="token-info">
                <span class="token-symbol">${html_encode(token.symbol || 'Unknown')}</span>
                <span class="token-network">${html_encode(token.network || getChainName(token.chainId))}</span>
            </div>
            <div class="token-balance">
                <span class="token-amount">${formatTokenBalance(token.balance, token.decimals)}</span>
                <span class="token-usd">${formatUSD(token.usdValue)}</span>
            </div>
        </div>
    `).join('');
}

/**
 * Render history list HTML
 */
function renderHistoryList(transactions) {
    const arrowUpIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
    const arrowDownIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`;
    
    if (!transactions || transactions.length === 0) {
        return `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4b5563" stroke-width="1.5" style="display:block;margin:0 auto 16px;">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                </svg>
                <div style="font-size:14px;font-weight:500;color:#9ca3af;margin-bottom:4px;">${i18n('no_transactions') || 'No Transactions Yet'}</div>
                <div style="font-size:12px;color:#6b7280;">${i18n('transactions_will_appear') || 'Your transaction history will appear here'}</div>
            </div>
        `;
    }
    
    return transactions.map(tx => {
        const txType = tx.type || (tx.from?.toLowerCase() === walletService.getAddress()?.toLowerCase() ? 'send' : 'receive');
        const isOutgoing = txType === 'send';
        
        return `
            <div class="history-row" 
                 data-tx-hash="${html_encode(tx.hash || tx.transactionHash || '')}"
                 data-chain-id="${html_encode(tx.chainId || '')}">
                <div style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${isOutgoing ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)'};color:${isOutgoing ? '#ef4444' : '#22c55e'};">
                    ${isOutgoing ? arrowUpIcon : arrowDownIcon}
                </div>
                <div class="tx-info">
                    <span class="tx-type">${getTransactionTypeLabel(txType)}</span>
                    <span class="tx-time">${formatRelativeTime(tx.timestamp || tx.createdAt)}</span>
                </div>
                <div style="font-weight:600;color:${isOutgoing ? '#ef4444' : '#22c55e'};">
                    ${isOutgoing ? '-' : '+'}${formatTokenBalance(tx.value || tx.amount)} ${html_encode(tx.symbol || 'ETH')}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Toggle sidebar open/close
 */
function toggleAccountSidebar() {
    if (sidebarInstance) {
        closeSidebar();
    } else {
        UIAccountSidebar();
    }
}

/**
 * Check if sidebar is open
 */
function isAccountSidebarOpen() {
    return !!sidebarInstance;
}

/**
 * Initialize edge hover trigger for opening sidebar
 * Creates an invisible zone on the right edge of the screen
 */
function initEdgeHoverTrigger() {
    // Remove existing trigger if any
    $('#sidebar-edge-trigger').remove();
    
    // Create invisible edge trigger zone
    const edgeTrigger = $(`
        <div id="sidebar-edge-trigger" style="
            position: fixed;
            top: 0;
            right: 0;
            width: 8px;
            height: 100vh;
            z-index: 9990;
            cursor: e-resize;
        "></div>
    `);
    
    let hoverTimeout = null;
    let isHovering = false;
    
    edgeTrigger.on('mouseenter', function() {
        // Don't trigger if sidebar is already open or user not logged in
        if (sidebarInstance || !window.user?.wallet_address) return;
        
        isHovering = true;
        
        // Small delay to prevent accidental triggers
        hoverTimeout = setTimeout(() => {
            if (isHovering && !sidebarInstance) {
                UIAccountSidebar();
            }
        }, 150);
    });
    
    edgeTrigger.on('mouseleave', function() {
        isHovering = false;
        if (hoverTimeout) {
            clearTimeout(hoverTimeout);
            hoverTimeout = null;
        }
    });
    
    $('body').append(edgeTrigger);
}

// Initialize edge trigger when DOM is ready
$(document).ready(function() {
    // Small delay to ensure app is initialized
    setTimeout(initEdgeHoverTrigger, 1000);
});

// Re-initialize when user logs in
$(document).on('user:logged_in', function() {
    initEdgeHoverTrigger();
});

// Export for global access
window.UIAccountSidebar = UIAccountSidebar;
window.toggleAccountSidebar = toggleAccountSidebar;
window.isAccountSidebarOpen = isAccountSidebarOpen;
window.initEdgeHoverTrigger = initEdgeHoverTrigger;

export default UIAccountSidebar;
export { toggleAccountSidebar, isAccountSidebarOpen, closeSidebar, initEdgeHoverTrigger };

