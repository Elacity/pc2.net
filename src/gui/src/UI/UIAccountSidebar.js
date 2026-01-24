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
import { createLogger } from '../helpers/logger.js';
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
import { CHAIN_INFO } from '../helpers/particle-constants.js';

const logger = createLogger('UIAccountSidebar');

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
                transition: transform 0.2s ease;
            }
            .refresh-btn:hover {
                background: rgba(255, 255, 255, 0.2);
            }
            .refresh-btn.loading svg {
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
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
            .solana-address-badge {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .solana-address-badge:hover {
                background: linear-gradient(135deg,rgba(153,69,255,0.35),rgba(20,241,149,0.35)) !important;
            }
            .solana-address-badge svg {
                stroke: #9ca3af;
            }
            .copy-btn {
                cursor: pointer;
                opacity: 0.7;
                transition: opacity 0.2s, transform 0.2s;
                display: inline-flex;
                align-items: center;
                padding: 2px;
                border-radius: 4px;
            }
            .copy-btn:hover {
                opacity: 1;
                background: rgba(255, 255, 255, 0.1);
                transform: scale(1.1);
            }
            .copy-btn svg {
                width: 14px;
                height: 14px;
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
                background: #ffffff;
                color: #000000;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
            }
            .action-btn:hover {
                background: #e5e5e5;
            }
            .action-btn.action-receive {
                background: #ffffff;
            }
            .action-btn.action-receive:hover {
                background: #e5e5e5;
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
            /* Network dropdown styles */
            .network-dropdown-container {
                position: relative;
                flex: 1;
            }
            .network-dropdown-btn {
                width: 100%;
                display: flex;
                align-items: center;
                justify-content: space-between;
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
            .network-dropdown-btn:hover {
                border-color: rgba(255, 255, 255, 0.3);
                color: #fff;
            }
            .network-dropdown-btn.active {
                background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(34, 197, 94, 0.2));
                border-color: rgba(34, 197, 94, 0.5);
                color: #fff;
            }
            .network-dropdown-btn .dropdown-arrow {
                transition: transform 0.2s ease;
            }
            .network-dropdown-btn.open .dropdown-arrow {
                transform: rotate(180deg);
            }
            .network-dropdown-menu {
                position: absolute;
                top: calc(100% + 4px);
                left: 0;
                right: 0;
                background: #2a2a2a;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
                z-index: 100;
                max-height: 450px;
                overflow-y: auto;
                display: none;
            }
            @media (min-width: 769px) {
                .network-dropdown-menu {
                    max-height: 550px;
                }
            }
            .network-dropdown-menu.open {
                display: block;
            }
            .network-dropdown-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px 12px;
                cursor: pointer;
                transition: background 0.15s ease;
                color: #e5e7eb;
                font-size: 13px;
            }
            .network-dropdown-item:hover {
                background: rgba(255, 255, 255, 0.1);
            }
            .network-dropdown-item.selected {
                background: rgba(34, 197, 94, 0.15);
            }
            .network-dropdown-item .network-icon {
                width: 20px;
                height: 20px;
                border-radius: 50%;
            }
            .network-dropdown-item .check-icon {
                margin-left: auto;
                color: #22c55e;
            }
            .network-dropdown-divider {
                height: 1px;
                background: rgba(255, 255, 255, 0.1);
                margin: 4px 0;
            }
            .network-dropdown-label {
                padding: 6px 12px;
                font-size: 10px;
                color: #6b7280;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .network-dropdown-item.locked {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .network-dropdown-item.locked:hover {
                background: transparent;
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
    const externalLinkIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
    
    // Mode icons
    const universalIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
    // Elastos logo - same size as Universal icon (cropped viewBox)
    const elastosIcon = `<svg width="18" height="18" viewBox="230 330 620 420" fill="none"><path d="M793 533l-61-36-26-15c-10-6-22-6-32 0l-119 69c-10 6-22 6-32 0l-118-69c-10-6-22-6-32 0l-26 15-61 36c-21 13-21 43 0 55l104 60 135 78c10 6 22 6 32 0l135-78 104-60c19-12 19-42-2-55z" fill="url(#ela1)"/><path d="M793 406l-88-51c-10-6-22-6-32 0l-119 69c-10 6-22 6-32 0l-119-69c-10-6-22-6-32 0l-86 51c-21 13-21 43 0 55l62 36 42 24 135 78c10 6 22 6 32 0l135-78 42-24 62-36c20-12 20-42-2-55z" fill="url(#ela2)"/><defs><linearGradient id="ela1" x1="540" y1="731" x2="540" y2="478" gradientUnits="userSpaceOnUse"><stop stop-color="#F6921A"/><stop offset="1" stop-color="#B04200"/></linearGradient><linearGradient id="ela2" x1="540" y1="447" x2="540" y2="604" gradientUnits="userSpaceOnUse"><stop stop-color="#FFEEDC"/><stop offset="1" stop-color="#FFC382"/></linearGradient></defs></svg>`;
    
    // Get current mode and network
    const currentMode = walletService.getMode();
    const selectedChainId = walletService.getSelectedEOAChainId();
    const availableNetworks = walletService.getAvailableEOANetworks();
    const currentNetwork = availableNetworks.find(n => n.chainId === selectedChainId) || availableNetworks[0];
    const displayAddress = currentMode === 'elastos' 
        ? (window.user?.wallet_address || address) 
        : address;
    
    // Dropdown arrow icon
    const dropdownArrowIcon = `<svg class="dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    const checkIcon = `<svg class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const lockIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
    
    // Build sidebar HTML
    const h = `
        <div id="${sidebar_id}" class="account-sidebar">
            <!-- Close Button -->
            <button class="account-sidebar-close" title="${i18n('close') || 'Close'}">
                ${closeIcon}
            </button>
            
            <!-- Refresh Button -->
            <button class="refresh-btn" title="${i18n('refresh') || 'Refresh balances'}">
                ${refreshIcon}
            </button>
            
            <!-- Header Section -->
            <div class="account-sidebar-header">
                <div class="account-sidebar-profile">
                    <div class="account-avatar">
                        ${getAvatarContent(displayAddress)}
                    </div>
                    <div class="account-addresses" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <div class="account-address" data-address="${html_encode(displayAddress || '')}" data-explorer-type="evm" title="Click to view on explorer">
                            <span class="address-text">${truncateAddress(displayAddress || '0x0000...0000')}</span>
                            <span class="copy-btn" title="Copy address">${copyIcon}</span>
                        </div>
                        <div class="solana-address-badge" id="solana-address-badge" data-address="" data-explorer-type="solana" title="Click to view on Solscan" style="display:none;background:linear-gradient(135deg,rgba(153,69,255,0.25),rgba(20,241,149,0.25));padding:6px 10px;border-radius:16px;font-size:12px;cursor:pointer;font-family:monospace;display:flex;align-items:center;gap:6px;">
                            <span class="sol-addr-text" style="color:#e5e7eb;">Loading...</span>
                            <span class="copy-btn" title="Copy address">${copyIcon}</span>
                        </div>
                    </div>
                </div>
                
                <div class="account-balance">
                    <span class="balance-amount">${formatUSD(walletData.totalBalance)}</span>
                    <span class="balance-label">${i18n('total_balance') || 'Total Balance'}</span>
                </div>
            </div>
            
            <!-- Mode Toggle -->
            <div class="wallet-mode-toggle" role="group" aria-label="Wallet mode selection">
                <button class="mode-btn ${currentMode === 'universal' ? 'active' : ''}" data-mode="universal" role="button" aria-pressed="${currentMode === 'universal'}" aria-label="Switch to Universal Account mode for multi-chain tokens">
                    <span class="mode-icon" aria-hidden="true">${universalIcon}</span>
                    <span class="mode-label">Universal</span>
                </button>
                <div class="network-dropdown-container">
                    <button class="network-dropdown-btn ${currentMode === 'elastos' ? 'active' : ''}" id="network-dropdown-btn" role="button" aria-haspopup="listbox" aria-expanded="false">
                        <span style="display:flex;align-items:center;gap:8px;">
                            <img src="${currentNetwork?.icon || ''}" class="network-icon" style="width:18px;height:18px;border-radius:50%;" onerror="this.style.display='none'" />
                            <span class="network-name">${currentNetwork?.shortName || currentNetwork?.name || 'Select Network'}</span>
                        </span>
                        ${dropdownArrowIcon}
                    </button>
                    <div class="network-dropdown-menu" id="network-dropdown-menu" role="listbox">
                        ${availableNetworks.map(network => `
                            <div class="network-dropdown-item ${network.isSelected ? 'selected' : ''}" data-chain-id="${network.chainId}" role="option" aria-selected="${network.isSelected}">
                                <img src="${network.icon || ''}" class="network-icon" onerror="this.style.display='none'" />
                                <span>${network.name}</span>
                                ${network.isSelected ? checkIcon : ''}
                            </div>
                        `).join('')}
                        <div class="network-dropdown-divider"></div>
                        <div class="network-dropdown-label" style="display: flex; align-items: center; justify-content: space-between;">
                            <span>DID Required</span>
                            <button class="link-did-btn" style="font-size: 10px; padding: 2px 8px; background: rgba(246,146,26,0.15); border: 1px solid rgba(246,146,26,0.3); color: #F6921A; border-radius: 4px; cursor: pointer;">Link DID</button>
                        </div>
                        <div class="network-dropdown-item locked" data-chain-id="mainchain" title="Tether your Elastos DID to view Mainchain ELA">
                            <img src="https://static.particle.network/token-list/elastos/native.png" class="network-icon" onerror="this.style.display='none'" />
                            <span>ELA Mainchain</span>
                            ${lockIcon}
                        </div>
                        <div class="network-dropdown-item locked" data-chain-id="btc" title="Tether your Elastos DID to view Bitcoin">
                            <img src="https://static.particle.network/token-list/bitcoin/native.png" class="network-icon" onerror="this.style.display='none'" />
                            <span>Bitcoin</span>
                            ${lockIcon}
                        </div>
                        <div class="network-dropdown-item locked" data-chain-id="tron" title="Tether your Elastos DID to view Tron">
                            <img src="https://static.particle.network/token-list/tron/native.png" class="network-icon" onerror="this.style.display='none'" />
                            <span>Tron</span>
                            ${lockIcon}
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Action Buttons -->
            <div class="account-sidebar-actions" role="group" aria-label="Wallet actions">
                <button class="action-btn action-send" role="button" aria-label="Send tokens to another wallet">
                    ${sendIcon}
                    <span>${i18n('send') || 'Send'}</span>
                </button>
                <button class="action-btn action-receive" role="button" aria-label="Receive tokens to your wallet">
                    ${receiveIcon}
                    <span>${i18n('receive') || 'Receive'}</span>
                </button>
            </div>
            
            <!-- Tab Navigation -->
            <div class="account-sidebar-tabs" role="tablist" aria-label="Wallet sections">
                <div class="sidebar-tab active" data-tab="tokens" role="tab" aria-selected="true" tabindex="0">${i18n('tokens') || 'Tokens'}</div>
                <div class="sidebar-tab" data-tab="history" role="tab" aria-selected="false" tabindex="-1">${i18n('history') || 'History'}</div>
            </div>
            
            <!-- Tab Content -->
            <div class="account-sidebar-content" role="tabpanel" aria-label="Wallet content">
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
    
    // Universal mode button
    $sidebar.on('click', '.mode-btn[data-mode="universal"]', async function() {
        const currentMode = walletService.getMode();
        
        if (currentMode === 'universal') return;
        
        // Update button states
        $sidebar.find('.mode-btn').removeClass('active');
        $(this).addClass('active');
        $sidebar.find('.network-dropdown-btn').removeClass('active');
        
        // Show loading state
        $sidebar.find('.balance-amount').text('...');
        $sidebar.find('.tokens-list').html('<div class="empty-state"><p>Loading...</p></div>');
        
        // Switch mode in wallet service
        try {
            await walletService.setMode('universal');
            
            // Update address display
            const newAddress = walletService.getAddress();
            $sidebar.find('.account-address').attr('data-address', newAddress);
            $sidebar.find('.address-text').text(truncateAddress(newAddress));
            $sidebar.find('.account-avatar').html(getAvatarContent(newAddress));
            
            // Update Solana address visibility based on mode
            updateSolanaAddressDisplay();
        } catch (error) {
            logger.error('Mode switch error:', error);
        }
    });
    
    // Network dropdown toggle
    $sidebar.on('click', '#network-dropdown-btn', function(e) {
        e.stopPropagation();
        const $btn = $(this);
        const $menu = $sidebar.find('#network-dropdown-menu');
        const isOpen = $menu.hasClass('open');
        
        if (isOpen) {
            $menu.removeClass('open');
            $btn.removeClass('open');
        } else {
            $menu.addClass('open');
            $btn.addClass('open');
            
            // If not in EOA mode, switch to it
            if (walletService.getMode() !== 'elastos') {
                // Update button states
                $sidebar.find('.mode-btn[data-mode="universal"]').removeClass('active');
                $btn.addClass('active');
                walletService.setMode('elastos');
            }
        }
    });
    
    // Network dropdown item selection
    $sidebar.on('click', '.network-dropdown-item:not(.locked)', async function() {
        const chainId = parseInt($(this).data('chain-id'));
        if (isNaN(chainId)) return;
        
        const $menu = $sidebar.find('#network-dropdown-menu');
        const $btn = $sidebar.find('#network-dropdown-btn');
        
        // Close dropdown
        $menu.removeClass('open');
        $btn.removeClass('open');
        
        // Update selection visual
        $menu.find('.network-dropdown-item').removeClass('selected');
        $(this).addClass('selected');
        
        // Update button text and icon
        const networkName = $(this).find('span').text();
        const networkIcon = $(this).find('.network-icon').attr('src');
        $btn.find('.network-name').text(networkName);
        $btn.find('.network-icon').attr('src', networkIcon).show();
        $btn.addClass('active');
        
        // Show loading state
        $sidebar.find('.balance-amount').text('...');
        $sidebar.find('.tokens-list').html('<div class="empty-state"><p>Loading...</p></div>');
        
        // Switch network in wallet service
        try {
            // Ensure we're in EOA mode
            if (walletService.getMode() !== 'elastos') {
                $sidebar.find('.mode-btn[data-mode="universal"]').removeClass('active');
                await walletService.setMode('elastos');
            }
            
            // Switch to selected network
            await walletService.setEOANetwork(chainId);
            
            // Update address display (EOA address)
            const newAddress = walletService.getEOAAddress();
            $sidebar.find('.account-address').attr('data-address', newAddress);
            $sidebar.find('.address-text').text(truncateAddress(newAddress));
            $sidebar.find('.account-avatar').html(getAvatarContent(newAddress));
            
            // Hide Solana address in EOA mode
            updateSolanaAddressDisplay();
        } catch (error) {
            logger.error('Network switch error:', error);
        }
    });
    
    // Close dropdown when clicking outside
    $(document).on('click.networkDropdown', function(e) {
        if (!$(e.target).closest('.network-dropdown-container').length) {
            $sidebar.find('#network-dropdown-menu').removeClass('open');
            $sidebar.find('#network-dropdown-btn').removeClass('open');
        }
    });
    
    // Link DID button - opens Settings > Account
    $sidebar.on('click', '.link-did-btn', function(e) {
        e.stopPropagation();
        
        // Close sidebar and dropdown
        $sidebar.find('#network-dropdown-menu').removeClass('open');
        $sidebar.find('#network-dropdown-btn').removeClass('open');
        closeSidebar();
        
        // Open settings window to Account tab
        if (window.UIWindowSettings) {
            window.UIWindowSettings({ active_tab: 'account' });
        } else {
            // Fallback: trigger settings open
            $(document).trigger('open-settings', ['account']);
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
    
    // Copy EVM address - only when clicking copy button
    $sidebar.on('click', '.account-address .copy-btn', async function(e) {
        e.stopPropagation(); // Prevent opening explorer
        
        const $parent = $(this).closest('.account-address');
        const addr = $parent.data('address');
        const success = await copyToClipboard(addr);
        
        if (success) {
            $parent.addClass('copied');
            $parent.find('.address-text').text(i18n('copied') || 'Copied!');
            
            setTimeout(() => {
                $parent.removeClass('copied');
                $parent.find('.address-text').text(truncateAddress(addr));
            }, 2000);
        }
    });
    
    // Click EVM address container → Open explorer
    $sidebar.on('click', '.account-address', function(e) {
        // Skip if clicking copy button (handled above)
        if ($(e.target).closest('.copy-btn').length) return;
        
        const currentMode = walletService.getMode();
        let url = null;
        
        if (currentMode === 'elastos') {
            // Elastos EOA mode → Elastos Explorer
            const eoaAddress = walletService.getEOAAddress();
            if (eoaAddress) {
                url = `https://esc.elastos.io/address/${eoaAddress}`;
            }
        } else {
            // Universal mode → DeBank for Smart Wallet
            const smartAddress = walletService.getSmartAccountAddress();
            if (smartAddress) {
                url = `https://debank.com/profile/${smartAddress.toLowerCase()}`;
            }
        }
        
        if (url) {
            logger.log('Opening explorer:', url);
            window.open(url, '_blank');
        }
    });
    
    // Copy Solana address - only when clicking copy button
    $sidebar.on('click', '.solana-address-badge .copy-btn', async function(e) {
        e.stopPropagation(); // Prevent opening explorer
        
        const $parent = $(this).closest('.solana-address-badge');
        const addr = $parent.data('address');
        if (!addr) return;
        
        const success = await copyToClipboard(addr);
        
        if (success) {
            $parent.addClass('copied');
            $parent.find('.sol-addr-text').text(i18n('copied') || 'Copied!');
            
            setTimeout(() => {
                $parent.removeClass('copied');
                $parent.find('.sol-addr-text').text(truncateAddress(addr, 4, 4));
            }, 2000);
        }
    });
    
    // Click Solana address container → Open Solscan
    $sidebar.on('click', '.solana-address-badge', function(e) {
        // Skip if clicking copy button (handled above)
        if ($(e.target).closest('.copy-btn').length) return;
        
        const solanaAddress = $(this).data('address');
        if (solanaAddress) {
            const url = `https://solscan.io/account/${solanaAddress}`;
            logger.log('Opening Solscan:', url);
            window.open(url, '_blank');
        }
    });
    
    // Update Solana address display based on mode and availability
    function updateSolanaAddressDisplay() {
        const mode = walletService.getMode();
        const solanaAddr = walletService.getSolanaAddress?.() || window.user?.solana_smart_account_address;
        const $badge = $sidebar.find('#solana-address-badge');
        
        if (mode === 'universal' && solanaAddr) {
            $badge.data('address', solanaAddr);
            $badge.find('.sol-addr-text').text(truncateAddress(solanaAddr, 4, 4));
            $badge.show();
        } else {
            $badge.hide();
        }
    }
    
    // Initial Solana address update
    updateSolanaAddressDisplay();
    
    // Refresh button - follows Elacity pattern
    $sidebar.on('click', '.refresh-btn', async function() {
        const $btn = $(this);
        if ($btn.hasClass('loading')) return; // Prevent concurrent refreshes
        
        $btn.addClass('loading');
        logger.log(' Refreshing balances...');
        
        try {
            // Refresh tokens (calls Particle API getPrimaryAssets)
            await walletService.refreshTokens();
            
            // Also refresh transactions
            await walletService.refreshTransactions();
            
            // Get updated data and refresh UI
            const newData = walletService.getData();
            
            // Update balance display
            $sidebar.find('.balance-amount').text(formatUSD(newData.totalBalance || 0));
            
            // Update token list
            const $tokenList = $sidebar.find('.token-list');
            if ($tokenList.length && newData.tokens?.length > 0) {
                $tokenList.html(renderTokenList(newData.tokens));
            }
            
            // Update Solana address display
            updateSolanaAddressDisplay();
            
            logger.log(' Balances refreshed successfully', {
                totalBalance: newData.totalBalance,
                tokensCount: newData.tokens?.length
            });
        } catch (error) {
            logger.error(' Refresh error:', error);
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
    
    // Transaction row click - fetch details and open explorer
    $sidebar.on('click', '.history-row', async function() {
        const transactionId = $(this).data('transaction-id');
        const chainId = $(this).data('chain-id');
        const currentMode = walletService.getMode();
        
        if (!transactionId) {
            logger.log('No transaction ID for click');
            return;
        }
        
        logger.log('Transaction click:', { transactionId, chainId, mode: currentMode });
        
        // Show loading state
        const $row = $(this);
        $row.css('opacity', '0.5');
        
        try {
            // For Elastos EOA mode, the transactionId IS the blockchain hash
            // No need to call Particle API - open explorer directly
            if (currentMode === 'elastos' && chainId === 20) {
                const url = `https://esc.elastos.io/tx/${transactionId}`;
                logger.log('Opening Elastos explorer:', url);
                window.open(url, '_blank');
                $row.css('opacity', '1');
                return;
            }
            
            // For Universal Account mode, fetch details from Particle
            const details = await walletService.getTransactionDetails(transactionId);
            
            logger.log('Transaction details:', details);
            
            if (details.blockchainTxHash) {
                const explorerChainId = details.chainId || chainId;
                const url = getExplorerUrl(explorerChainId, details.blockchainTxHash, 'tx');
                logger.log('Opening explorer:', url);
                window.open(url, '_blank');
            } else {
                // No blockchain tx hash yet - show notification
                import('./UINotification.js').then(({ default: UINotification }) => {
                    UINotification({
                        icon: window.icons['info.svg'],
                        title: 'Transaction Processing',
                        text: 'Transaction is still being processed. Blockchain hash not yet available.',
                        duration: 3000,
                    });
                });
            }
        } catch (error) {
            logger.error('Failed to get transaction details:', error);
            import('./UINotification.js').then(({ default: UINotification }) => {
                UINotification({
                    icon: window.icons['warning.svg'],
                    title: 'Error',
                    text: 'Failed to get transaction details',
                    duration: 3000,
                });
            });
        } finally {
            $row.css('opacity', '1');
        }
    });
    
    // ==========================================
    // Wallet Data Updates
    // ==========================================
    
    // Subscribe to wallet data updates - store for cleanup
    walletUnsubscribe = walletService.subscribe((data) => {
        logger.log('Received wallet update:', {
            mode: data.mode,
            chainId: data.selectedEOAChainId,
            totalBalance: data.totalBalance,
            tokensCount: data.tokens?.length,
            sidebarExists: !!sidebarInstance,
        });
        
        // Only update if sidebar still exists
        if (!sidebarInstance) return;
        
        // Update mode buttons
        if (data.mode === 'universal') {
            $sidebar.find('.mode-btn[data-mode="universal"]').addClass('active');
            $sidebar.find('.network-dropdown-btn').removeClass('active');
        } else {
            $sidebar.find('.mode-btn[data-mode="universal"]').removeClass('active');
            $sidebar.find('.network-dropdown-btn').addClass('active');
            
            // Update network dropdown selection
            const chainId = data.selectedEOAChainId;
            const $menu = $sidebar.find('#network-dropdown-menu');
            $menu.find('.network-dropdown-item').removeClass('selected');
            $menu.find(`.network-dropdown-item[data-chain-id="${chainId}"]`).addClass('selected');
            
            // Update button text with selected network
            const selectedNetwork = walletService.getAvailableEOANetworks().find(n => n.chainId === chainId);
            if (selectedNetwork) {
                $sidebar.find('.network-dropdown-btn .network-name').text(selectedNetwork.shortName || selectedNetwork.name);
                $sidebar.find('.network-dropdown-btn .network-icon').attr('src', selectedNetwork.icon || '').show();
            }
        }
        
        // Update balance - show native token amount for EOA mode, USD for Universal
        let formattedBalance;
        if (data.mode === 'elastos' && data.tokens?.length > 0) {
            const nativeToken = data.tokens[0]; // First token is always native
            formattedBalance = nativeToken ? `${parseFloat(nativeToken.balance).toFixed(4)} ${nativeToken.symbol}` : '0';
        } else {
            formattedBalance = formatUSD(data.totalBalance);
        }
        logger.log('Setting balance to:', formattedBalance);
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
    $(document).off('click.networkDropdown');
    
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
 * Render history list HTML (Elacity pattern with chain badges)
 */
function renderHistoryList(transactions) {
    const arrowUpIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
    const arrowDownIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`;
    const swapIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4"/></svg>`;
    
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
        // Determine transaction type
        const txType = tx.type || 'transfer';
        const isOutgoing = txType === 'send';
        const isSwap = txType === 'swap' || tx.tag === 'swap';
        
        // Get status badge
        const statusBadge = getStatusBadge(tx.status || tx.statusCode);
        
        // Get chain info for badge overlay
        const chainId = tx.chainId || tx.targetToken?.chainId;
        const chainInfo = chainId ? CHAIN_INFO[chainId] : null;
        
        // Amount color based on direction
        const textColor = isOutgoing ? '#ef4444' : '#22c55e';
        
        // Get symbol initial for fallback - always needed
        const symbolInitial = (tx.symbol || '?').charAt(0).toUpperCase();
        
        // Get token icon - AVOID particle.network URLs (CORS blocked)
        let rawIconUrl = tx.tokenIcon || tx.targetToken?.image || '';
        
        // Skip particle.network URLs - they're CORS blocked
        const isBlockedUrl = rawIconUrl.includes('particle.network') || rawIconUrl.includes('static.particle');
        
        // Map common symbols to local token images (relative to /images/tokens/)
        const symbolLower = (tx.symbol || '').toLowerCase();
        const localTokenIcons = {
            'usdc': '/images/tokens/USDC.png',
            'usdt': '/images/tokens/USDT.png', 
            'eth': '/images/tokens/ETH.png',
            'btc': '/images/tokens/BTC.svg',
            'sol': '/images/tokens/Sol.webp',
            'bnb': '/images/tokens/BNB.png',
            'mnt': '/images/tokens/MNT.webp',
            'ela': '/images/tokens/ELA.png',
        };
        
        // Use local icon if available, otherwise skip blocked URLs
        const tokenIconUrl = localTokenIcons[symbolLower] || (isBlockedUrl ? null : rawIconUrl);
        
        // Token icon HTML - always have letter fallback ready
        const tokenIconHtml = tokenIconUrl 
            ? `<img src="${html_encode(tokenIconUrl)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;background:#2a2a2a;" onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="width:100%;height:100%;border-radius:50%;display:none;align-items:center;justify-content:center;background:linear-gradient(135deg,#3b82f6,#8b5cf6);"><span style="font-size:16px;font-weight:600;color:#fff;">${symbolInitial}</span></div>`
            : `<div style="width:100%;height:100%;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#3b82f6,#8b5cf6);"><span style="font-size:16px;font-weight:600;color:#fff;">${symbolInitial}</span></div>`;
        
        // Chain badge HTML (bottom-right corner overlay)
        const chainBadgeHtml = chainInfo ? `
            <div class="chain-badge" title="${html_encode(chainInfo.name)}" style="
                position: absolute;
                bottom: -2px;
                right: -2px;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background-color: #1a1a1a;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 2px solid #1a1a1a;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            ">
                <img src="${html_encode(chainInfo.icon)}" alt="${html_encode(chainInfo.name)}" style="
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    object-fit: contain;
                " onerror="this.parentElement.style.display='none';" />
            </div>
        ` : '';
        
        // Chain name with icon inline - use shortName if available for compact display
        const displayChainName = chainInfo?.shortName || chainInfo?.name || '';
        const chainNameHtml = chainInfo ? `
            <span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;color:#6b7280;">
                • <img src="${html_encode(chainInfo.icon)}" style="width:12px;height:12px;border-radius:50%;" onerror="this.style.display='none';" />${html_encode(displayChainName)}
            </span>
        ` : '';
        
        return `
            <div class="history-row" 
                 data-transaction-id="${html_encode(tx.transactionId || '')}"
                 data-chain-id="${html_encode(chainId || '')}">
                <!-- Token Icon Container with Chain Badge -->
                <div class="tx-icon-container" style="position:relative;width:40px;height:40px;flex-shrink:0;margin-right:12px;">
                    <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);">
                        ${tokenIconHtml}
                    </div>
                    ${chainBadgeHtml}
                </div>
                <div class="tx-info" style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span class="tx-type">${getTransactionTypeLabel(txType, tx.tag)}</span>
                        ${statusBadge}
                    </div>
                    <div style="display:flex;align-items:center;gap:4px;">
                        <span class="tx-time" style="font-size:11px;color:#6b7280;">${formatRelativeTime(tx.timestamp || tx.createdAt)}</span>
                        ${chainNameHtml}
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:600;color:${textColor};">
                        ${isOutgoing ? '-' : '+'}${formatTokenBalance(tx.amount)} ${html_encode(tx.symbol || '')}
                    </div>
                    ${tx.amountInUSD ? `<div style="font-size:11px;color:#6b7280;">$${parseFloat(tx.amountInUSD).toFixed(2)}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Get status badge HTML
 */
function getStatusBadge(status) {
    const statusConfig = {
        'confirmed': { label: '✓', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)' },
        'pending': { label: '⏳', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
        'processing': { label: '⏳', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
        'failed': { label: '✕', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
    };
    
    // Handle numeric status codes
    let statusKey = status;
    if (typeof status === 'number') {
        statusKey = status === 1 || status === 7 ? 'confirmed' 
                  : status === -1 ? 'failed' 
                  : 'pending';
    }
    
    const config = statusConfig[statusKey] || statusConfig['pending'];
    
    if (statusKey === 'confirmed') {
        return ''; // Don't show badge for confirmed
    }
    
    return `<span style="padding:1px 6px;border-radius:4px;font-size:10px;background:${config.bg};color:${config.color};">${config.label}</span>`;
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
    
    // Create invisible edge trigger zone - wider for easier activation
    const edgeTrigger = $(`
        <div id="sidebar-edge-trigger" style="
            position: fixed;
            top: 0;
            right: 0;
            width: 20px;
            height: 100vh;
            z-index: 9990;
            cursor: e-resize;
        "></div>
    `);
    
    let hoverTimeout = null;
    let isHovering = false;
    
    edgeTrigger.on('mouseenter', function() {
        // Don't trigger if sidebar is already open or user not logged in
        if (sidebarInstance || !(window.user?.wallet_address || window.user?.smart_account_address)) return;
        
        isHovering = true;
        
        // Short delay for responsive feel while preventing accidental triggers
        hoverTimeout = setTimeout(() => {
            if (isHovering && !sidebarInstance) {
                UIAccountSidebar();
            }
        }, 50);
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

