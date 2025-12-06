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
import walletService from '../services/WalletService.js';
import {
    formatTokenBalance,
    formatUSD,
    truncateAddress,
} from '../helpers/wallet.js';
import {
    CHAIN_INFO,
    AVAILABLE_NETWORKS,
    getAvailableNetworksForToken,
    getTokenAddress,
    getTokenIconUrl,
    isValidAddressForChain,
    getNetworkByName,
} from '../helpers/particle-constants.js';

/**
 * UIWindowAccountSend - Modal dialog for sending tokens via Particle Universal Account
 * 
 * Features:
 * - Token selection dropdown with balance display
 * - Network selector (filtered by selected token)
 * - Recipient address input with EVM/Solana validation
 * - Amount input with MAX button
 * - Debounced fee estimation (800ms)
 * - Transaction confirmation and tracking
 * 
 * Based on Elacity's implementation pattern
 * 
 * @param {Object} options - Configuration options
 * @param {Array} options.tokens - Available tokens for sending
 * @param {string} options.address - Sender's address
 */
async function UIWindowAccountSend(options = {}) {
    const tokens = options.tokens || walletService.getTokens();
    const senderAddress = options.address || walletService.getAddress();
    
    // Get the first token with balance as default
    const defaultToken = tokens.find(t => parseFloat(t.balance) > 0) || tokens[0] || null;
    const defaultSymbol = defaultToken?.symbol?.toUpperCase() || 'USDC';
    
    // Get available networks for default token
    const defaultNetworks = getAvailableNetworksForToken(defaultSymbol);
    const defaultNetwork = defaultNetworks[0] || AVAILABLE_NETWORKS[0];
    
    // Build token options HTML
    const tokenOptionsHtml = tokens.map(token => {
        const iconUrl = token.icon || token.logoURI || getTokenIconUrl(token.symbol);
        return `
            <div class="token-option" 
                data-symbol="${html_encode(token.symbol)}"
                data-balance="${html_encode(token.balance)}"
                data-decimals="${html_encode(token.decimals || 18)}"
                 data-usd-value="${html_encode(token.usdValue || 0)}"
                 data-price="${html_encode(token.price || 0)}"
                 data-icon="${html_encode(iconUrl)}">
                <img src="${html_encode(iconUrl)}" class="token-option-icon" onerror="this.style.display='none'" />
                <div class="token-option-info">
                    <span class="token-option-symbol">${html_encode(token.symbol)}</span>
                    <span class="token-option-name">${html_encode(token.name || token.symbol)}</span>
                </div>
                <div class="token-option-balance">
                    <span>${formatTokenBalance(token.balance)}</span>
                    <span class="token-option-usd">${formatUSD(token.usdValue)}</span>
                </div>
            </div>
        `;
    }).join('');
    
    const h = `
        <div class="send-modal-container" style="padding: 24px;">
            <!-- Token Selection -->
            <div class="form-group" style="margin-bottom: 20px;">
                <label class="form-label">${i18n('token') || 'Token'}</label>
                <div class="custom-dropdown" id="token-dropdown">
                    <div class="dropdown-selected" id="token-selected">
                        <img src="${html_encode(defaultToken?.icon || defaultToken?.logoURI || getTokenIconUrl(defaultSymbol))}" 
                             class="dropdown-icon" onerror="this.style.display='none'" />
                        <span class="dropdown-text">
                            <strong>${html_encode(defaultSymbol)}</strong> - 
                            ${formatTokenBalance(defaultToken?.balance || 0)} 
                            (${formatUSD(defaultToken?.usdValue || 0)})
                        </span>
                        <svg class="dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                    <div class="dropdown-options" id="token-options" style="display: none;">
                        ${tokenOptionsHtml || '<div class="dropdown-empty">No tokens available</div>'}
                    </div>
                </div>
                <div class="token-balance-display">
                    ${i18n('available') || 'Available'}: 
                    <span id="available-balance">${defaultToken ? formatTokenBalance(defaultToken.balance) : '0'}</span> 
                    <span id="available-symbol">${defaultSymbol}</span>
                </div>
            </div>
            
            <!-- Network Selection -->
            <div class="form-group" style="margin-bottom: 20px;">
                <label class="form-label">${i18n('network') || 'Network'}</label>
                <div class="custom-dropdown" id="network-dropdown">
                    <div class="dropdown-selected" id="network-selected">
                        <img src="${html_encode(CHAIN_INFO[defaultNetwork?.chainId]?.icon || '')}" 
                             class="dropdown-icon" onerror="this.style.display='none'" />
                        <span class="dropdown-text">${html_encode(defaultNetwork?.name || 'Select Network')}</span>
                        <svg class="dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                    <div class="dropdown-options" id="network-options" style="display: none;"></div>
                </div>
                <div id="network-info" class="network-info" style="display: none;"></div>
            </div>
            
            <!-- Recipient Address -->
            <div class="form-group" style="margin-bottom: 20px;">
                <label class="form-label">${i18n('recipient_address') || 'Recipient Address'}</label>
                <input type="text" 
                       id="send-recipient" 
                       class="form-input"
                       placeholder="0x... or Solana address"
                       autocomplete="off"
                       spellcheck="false">
                <div id="recipient-error" class="form-error"></div>
            </div>
            
            <!-- Amount -->
            <div class="form-group" style="margin-bottom: 20px;">
                <label class="form-label">${i18n('amount') || 'Amount'}</label>
                <div class="amount-input-wrapper">
                    <input type="text" 
                           id="send-amount" 
                           class="form-input amount-input"
                           placeholder="0.0"
                           inputmode="decimal"
                           autocomplete="off">
                    <button id="send-max-btn" type="button" class="max-button">MAX</button>
                </div>
                <div id="amount-error" class="form-error"></div>
                <div id="amount-usd" class="amount-usd">≈ $0.00</div>
            </div>
            
            <!-- Fee Estimation -->
            <div class="fee-section">
                <div class="fee-row">
                    <span class="fee-label">${i18n('estimated_fee') || 'Estimated Fee'}</span>
                    <div class="fee-value">
                        <span id="fee-estimate">--</span>
                        <span id="fee-free" class="fee-free-badge" style="display: none;">FREE GAS</span>
                    </div>
                </div>
                <div id="fee-loading" class="fee-loading" style="display: none;">
                    <div class="fee-spinner"></div>
                    <span>Calculating...</span>
                </div>
                <div id="fee-error" class="form-error"></div>
            </div>
            
            <!-- Send Button -->
            <button id="send-confirm-btn" type="button" class="send-button" disabled>
                ${i18n('send') || 'Send'}
            </button>
            
            <!-- Sending State -->
            <div id="sending-state" class="sending-state" style="display: none;">
                <div class="loading-spinner"></div>
                <div class="sending-title">${i18n('sending') || 'Sending...'}</div>
                <div class="sending-subtitle">${i18n('please_wait') || 'Please wait for confirmation'}</div>
            </div>
        </div>
        
        <style>
            .send-modal-container {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            
            .form-group {
                margin-bottom: 20px;
            }
            
            .form-label {
                display: block;
                margin-bottom: 8px;
                font-weight: 500;
                font-size: 14px;
                color: #374151;
            }
            
            .form-input {
                               width: 100%;
                padding: 12px 16px;
                               border: 1px solid #d1d5db;
                               border-radius: 8px;
                               font-size: 14px;
                               box-sizing: border-box;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            
            .form-input:focus {
                outline: none;
                border-color: #F6921A;
                box-shadow: 0 0 0 3px rgba(246, 146, 26, 0.1);
            }
            
            .form-input.error {
                border-color: #ef4444;
            }
            
            .form-error {
                color: #ef4444;
                font-size: 13px;
                margin-top: 4px;
                display: none;
            }
            
            .form-error:not(:empty) {
                display: block;
            }
            
            /* Custom Dropdown */
            .custom-dropdown {
                position: relative;
            }
            
            .dropdown-selected {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 12px 16px;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                cursor: pointer;
                background: white;
                transition: border-color 0.2s;
            }
            
            .dropdown-selected:hover {
                border-color: #F6921A;
            }
            
            .dropdown-icon {
                width: 24px;
                height: 24px;
                border-radius: 50%;
            }
            
            .dropdown-text {
                flex: 1;
                font-size: 14px;
            }
            
            .dropdown-arrow {
                color: #6b7280;
                transition: transform 0.2s;
            }
            
            .dropdown-open .dropdown-arrow {
                transform: rotate(180deg);
            }
            
            .dropdown-options {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                margin-top: 4px;
                background: white;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                max-height: 250px;
                overflow-y: auto;
                z-index: 100;
            }
            
            .token-option, .network-option {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 12px 16px;
                cursor: pointer;
                transition: background 0.15s;
            }
            
            .token-option:hover, .network-option:hover {
                background: #f3f4f6;
            }
            
            .token-option-icon, .network-option-icon {
                width: 32px;
                height: 32px;
                border-radius: 50%;
            }
            
            .token-option-info {
                flex: 1;
            }
            
            .token-option-symbol {
                display: block;
                font-weight: 600;
                font-size: 14px;
            }
            
            .token-option-name {
                display: block;
                font-size: 12px;
                color: #6b7280;
            }
            
            .token-option-balance {
                text-align: right;
            }
            
            .token-option-balance span {
                display: block;
            }
            
            .token-option-usd {
                font-size: 12px;
                color: #6b7280;
            }
            
            .network-option-name {
                font-weight: 500;
            }
            
            .token-balance-display, .network-info {
                margin-top: 8px;
                font-size: 13px;
                color: #6b7280;
            }
            
            /* Amount Input */
            .amount-input-wrapper {
                position: relative;
            }
            
            .amount-input {
                padding-right: 70px !important;
                font-family: 'SF Mono', Monaco, monospace;
            }
            
            .max-button {
                                position: absolute;
                                right: 8px;
                                top: 50%;
                                transform: translateY(-50%);
                                padding: 6px 12px;
                background: #F6921A;
                                color: white;
                                border: none;
                                border-radius: 6px;
                                font-size: 12px;
                font-weight: 600;
                                cursor: pointer;
                transition: background 0.2s;
            }
            
            .max-button:hover {
                background: #e5820f;
            }
            
            .amount-usd {
                margin-top: 4px;
                font-size: 13px;
                color: #6b7280;
            }
            
            /* Fee Section */
            .fee-section {
                background: #f9fafb;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 20px;
            }
            
            .fee-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .fee-label {
                color: #6b7280;
                font-size: 14px;
            }
            
            .fee-value {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            #fee-estimate {
                font-weight: 500;
                color: #374151;
            }
            
            .fee-free-badge {
                background: #22c55e;
                color: white;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 600;
            }
            
            .fee-loading {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-top: 8px;
                font-size: 13px;
                color: #6b7280;
            }
            
            .fee-spinner {
                width: 14px;
                height: 14px;
                border: 2px solid #e5e7eb;
                border-top-color: #F6921A;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            
            /* Send Button */
            .send-button {
                        width: 100%;
                        padding: 14px;
                background: #F6921A;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        font-size: 16px;
                font-weight: 600;
                        cursor: pointer;
                transition: background 0.2s, opacity 0.2s;
            }
            
            .send-button:disabled {
                        opacity: 0.5;
                cursor: not-allowed;
            }
            
            .send-button:not(:disabled):hover {
                background: #e5820f;
            }
            
            /* Sending State */
            .sending-state {
                text-align: center;
                padding: 40px 0;
            }
            
            .loading-spinner {
                    width: 48px;
                    height: 48px;
                    border: 4px solid #f3f3f3;
                border-top: 4px solid #F6921A;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 16px;
            }
            
            .sending-title {
                font-size: 16px;
                font-weight: 500;
                color: #374151;
            }
            
            .sending-subtitle {
                font-size: 14px;
                color: #6b7280;
                margin-top: 8px;
            }
            
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            
            .dropdown-empty {
                padding: 16px;
                text-align: center;
                color: #6b7280;
            }
        </style>
    `;
    
    return new Promise(async (resolve) => {
        const el_window = await UIWindow({
            title: i18n('send_tokens') || 'Send Tokens',
            app: 'account-send',
            single_instance: true,
            icon: window.icons['upload.svg'] || window.icons['arrow-up.svg'],
            uid: null,
            is_dir: false,
            body_content: h,
            has_head: true,
            selectable_body: false,
            allow_context_menu: false,
            is_resizable: false,
            is_droppable: false,
            init_center: true,
            allow_native_ctxmenu: true,
            allow_user_select: true,
            backdrop: true,
            width: 420,
            height: 'auto',
            dominant: true,
            show_in_taskbar: false,
            draggable_body: false,
            window_class: 'window-account-send',
            body_css: {
                width: 'initial',
                height: '100%',
                overflow: 'auto',
                padding: '0',
                background: '#ffffff',
            },
            ...options.window_options,
        });
        
        const $window = $(el_window);
        
        // State
        let selectedToken = defaultToken;
        let selectedNetwork = defaultNetwork;
        let feeEstimate = null;
        let feeTimeout = null;
        let isEstimatingFee = false;
        
        // ============================================
        // UPDATE NETWORK DROPDOWN
        // ============================================
        function updateNetworkOptions() {
            const symbol = selectedToken?.symbol?.toUpperCase() || 'USDC';
            const availableNetworks = getAvailableNetworksForToken(symbol);
            
            const networkOptionsHtml = availableNetworks.map(network => {
                const chainInfo = CHAIN_INFO[network.chainId] || {};
                return `
                    <div class="network-option" 
                         data-name="${html_encode(network.name)}"
                         data-chain-id="${html_encode(network.chainId)}"
                         data-chain-type="${html_encode(network.chainType)}">
                        <img src="${html_encode(chainInfo.icon || '')}" 
                             class="network-option-icon" 
                             onerror="this.style.display='none'" />
                        <span class="network-option-name">${html_encode(network.name)}</span>
                    </div>
                `;
            }).join('');
            
            $window.find('#network-options').html(networkOptionsHtml || '<div class="dropdown-empty">No networks available</div>');
            
            // Check if current network is still valid
            const isCurrentNetworkValid = availableNetworks.find(n => n.name === selectedNetwork?.name);
            if (!isCurrentNetworkValid && availableNetworks.length > 0) {
                // Switch to first available network
                selectNetwork(availableNetworks[0]);
            }
        }
        
        // ============================================
        // SELECT NETWORK
        // ============================================
        function selectNetwork(network) {
            selectedNetwork = network;
            const chainInfo = CHAIN_INFO[network.chainId] || {};
            
            $window.find('#network-selected').html(`
                <img src="${html_encode(chainInfo.icon || '')}" 
                     class="dropdown-icon" 
                     onerror="this.style.display='none'" />
                <span class="dropdown-text">${html_encode(network.name)}</span>
                <svg class="dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            `);
            
            // Update address placeholder based on chain type
            const placeholder = network.chainType === 'solana' 
                ? 'Enter Solana address' 
                : '0x...';
            $window.find('#send-recipient').attr('placeholder', placeholder);
            
            // Re-validate address for new chain type
            validateForm();
            debouncedEstimateFee();
        }
        
        // ============================================
        // SELECT TOKEN
        // ============================================
        function selectToken(tokenData) {
            const symbol = tokenData.symbol;
            const balance = tokenData.balance;
            const icon = tokenData.icon;
            const usdValue = tokenData.usdValue;
            
            selectedToken = tokens.find(t => t.symbol === symbol) || {
                symbol,
                balance,
                icon,
                usdValue,
                decimals: tokenData.decimals || 18,
                price: tokenData.price || 0,
            };
            
            $window.find('#token-selected').html(`
                <img src="${html_encode(icon || getTokenIconUrl(symbol))}" 
                     class="dropdown-icon" 
                     onerror="this.style.display='none'" />
                <span class="dropdown-text">
                    <strong>${html_encode(symbol)}</strong> - 
                    ${formatTokenBalance(balance)} 
                    (${formatUSD(usdValue)})
                </span>
                <svg class="dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            `);
            
            $window.find('#available-balance').text(formatTokenBalance(balance));
            $window.find('#available-symbol').text(symbol);
            
            // Update network options for this token
            updateNetworkOptions();
            
            // Re-validate
            validateForm();
            updateAmountUSD();
            debouncedEstimateFee();
        }
        
        // ============================================
        // DROPDOWN HANDLERS
        // ============================================
        
        // Token dropdown toggle
        $window.find('#token-dropdown').on('click', '.dropdown-selected', function(e) {
            e.stopPropagation();
            const $dropdown = $(this).closest('.custom-dropdown');
            const $options = $dropdown.find('.dropdown-options');
            const isOpen = $options.is(':visible');
            
            // Close all dropdowns
            $window.find('.dropdown-options').hide();
            $window.find('.custom-dropdown').removeClass('dropdown-open');
            
            if (!isOpen) {
                $options.show();
                $dropdown.addClass('dropdown-open');
            }
        });
        
        // Token option click
        $window.find('#token-options').on('click', '.token-option', function(e) {
            e.stopPropagation();
            
            const tokenData = {
                symbol: $(this).data('symbol'),
                balance: $(this).data('balance'),
                decimals: $(this).data('decimals'),
                usdValue: $(this).data('usd-value'),
                price: $(this).data('price'),
                icon: $(this).data('icon'),
            };
            
            selectToken(tokenData);
            
            // Close dropdown
            $window.find('#token-options').hide();
            $window.find('#token-dropdown').removeClass('dropdown-open');
        });
        
        // Network dropdown toggle
        $window.find('#network-dropdown').on('click', '.dropdown-selected', function(e) {
            e.stopPropagation();
            const $dropdown = $(this).closest('.custom-dropdown');
            const $options = $dropdown.find('.dropdown-options');
            const isOpen = $options.is(':visible');
            
            // Close all dropdowns
            $window.find('.dropdown-options').hide();
            $window.find('.custom-dropdown').removeClass('dropdown-open');
            
            if (!isOpen) {
                $options.show();
                $dropdown.addClass('dropdown-open');
            }
        });
        
        // Network option click
        $window.find('#network-options').on('click', '.network-option', function(e) {
            e.stopPropagation();
            
            const network = {
                name: $(this).data('name'),
                chainId: $(this).data('chain-id'),
                chainType: $(this).data('chain-type'),
            };
            
            selectNetwork(network);
            
            // Close dropdown
            $window.find('#network-options').hide();
            $window.find('#network-dropdown').removeClass('dropdown-open');
        });
        
        // Close dropdowns when clicking outside
        $(document).on('click.sendModal', function() {
            $window.find('.dropdown-options').hide();
            $window.find('.custom-dropdown').removeClass('dropdown-open');
        });
        
        // ============================================
        // FORM VALIDATION
        // ============================================
        function validateForm() {
            const recipient = $window.find('#send-recipient').val().trim();
            const amount = parseFloat($window.find('#send-amount').val()) || 0;
            const balance = parseFloat(selectedToken?.balance) || 0;
            const chainType = selectedNetwork?.chainType || 'evm';
            
            let isValid = true;
            
            // Validate recipient
            $window.find('#recipient-error').text('');
            $window.find('#send-recipient').removeClass('error');
            
            if (recipient && !isValidAddressForChain(recipient, chainType)) {
                const errorMsg = chainType === 'solana' 
                    ? 'Invalid Solana address'
                    : 'Invalid EVM address (should start with 0x)';
                $window.find('#recipient-error').text(errorMsg);
                $window.find('#send-recipient').addClass('error');
                isValid = false;
            }
            
            // Validate amount
            $window.find('#amount-error').text('');
            $window.find('#send-amount').removeClass('error');
            
            if (amount > 0 && amount > balance) {
                $window.find('#amount-error').text('Insufficient balance');
                $window.find('#send-amount').addClass('error');
                isValid = false;
            } else if (amount > 0 && amount < 0.000001) {
                $window.find('#amount-error').text('Amount too small');
                $window.find('#send-amount').addClass('error');
                isValid = false;
            }
            
            // Enable/disable send button
            const canSend = isValid && 
                           recipient && 
                           amount > 0 && 
                           selectedToken && 
                           selectedNetwork &&
                           !isEstimatingFee;
            
            $window.find('#send-confirm-btn').prop('disabled', !canSend);
            
            return isValid;
        }
        
        // ============================================
        // UPDATE USD DISPLAY
        // ============================================
        function updateAmountUSD() {
            const amount = parseFloat($window.find('#send-amount').val()) || 0;
            const price = parseFloat(selectedToken?.price) || 0;
            const usdValue = amount * price;
            
            $window.find('#amount-usd').text(`≈ ${formatUSD(usdValue)}`);
        }
        
        // ============================================
        // DEBOUNCED FEE ESTIMATION (800ms)
        // ============================================
        function debouncedEstimateFee() {
            // Clear previous timeout
            if (feeTimeout) {
                clearTimeout(feeTimeout);
            }
            
            const recipient = $window.find('#send-recipient').val().trim();
            const amount = $window.find('#send-amount').val();
            const chainType = selectedNetwork?.chainType || 'evm';
            
            // Don't estimate if form is incomplete
            if (!recipient || !amount || !selectedToken || !selectedNetwork) {
                return;
            }
            
            // Don't estimate if address is invalid
            if (!isValidAddressForChain(recipient, chainType)) {
                return;
            }
            
            // Show loading state
            $window.find('#fee-loading').show();
            $window.find('#fee-estimate').text('--');
            $window.find('#fee-free').hide();
            isEstimatingFee = true;
            validateForm();
            
            // Debounce: wait 800ms after user stops typing
            feeTimeout = setTimeout(async () => {
                try {
                    const tokenAddress = getTokenAddress(
                        selectedToken.symbol,
                        selectedNetwork.name
                    );
                    
                    const result = await walletService.estimateFee({
                        to: recipient,
                        amount: amount,
                        tokenAddress: tokenAddress,
                        chainId: selectedNetwork.chainId,
                        decimals: selectedToken.decimals || 18,
                    });
                    
                    feeEstimate = result;
                    
                    // Display fee
                    if (result.freeGasFee) {
                        $window.find('#fee-estimate').text('$0.00');
                        $window.find('#fee-free').show();
                    } else {
                        const feeUSD = result.totalUSD || result.total || 0;
                        $window.find('#fee-estimate').text(`~$${parseFloat(feeUSD).toFixed(4)}`);
                        $window.find('#fee-free').hide();
                    }
                    
                    $window.find('#fee-error').text('');
                    
                } catch (error) {
                    console.error('[SendModal]: Fee estimation failed:', error);
                    $window.find('#fee-estimate').text('--');
                    $window.find('#fee-error').text('Could not estimate fee');
                    feeEstimate = null;
                } finally {
                    $window.find('#fee-loading').hide();
                    isEstimatingFee = false;
                    validateForm();
                }
            }, 800);
        }
        
        // ============================================
        // INPUT HANDLERS
        // ============================================
        
        // Recipient input
        $window.find('#send-recipient').on('input', function() {
            validateForm();
            debouncedEstimateFee();
        });
        
        // Amount input
        $window.find('#send-amount').on('input', function() {
            validateForm();
            updateAmountUSD();
            debouncedEstimateFee();
        });
        
        // Max button
        $window.find('#send-max-btn').on('click', function() {
            if (selectedToken) {
                const maxAmount = selectedToken.balance || '0';
                $window.find('#send-amount').val(maxAmount);
                validateForm();
                updateAmountUSD();
                debouncedEstimateFee();
            }
        });
        
        // ============================================
        // SEND TRANSACTION
        // ============================================
        $window.find('#send-confirm-btn').on('click', async function() {
            const recipient = $window.find('#send-recipient').val().trim();
            const amount = $window.find('#send-amount').val();
            
            if (!validateForm()) {
                return;
            }
            
            // Show sending state
            $window.find('.send-modal-container > *:not(#sending-state)').hide();
            $window.find('#sending-state').show();
            
            try {
                const tokenAddress = getTokenAddress(
                    selectedToken.symbol,
                    selectedNetwork.name
                );
                
                // Ensure amount is a string (required by Particle SDK)
                const amountStr = String(amount);
                
                console.log('[SendModal]: Sending transaction:', {
                    to: recipient,
                    amount: amountStr,
                    amountType: typeof amountStr,
                    tokenAddress,
                    chainId: selectedNetwork.chainId,
                    network: selectedNetwork.name,
                    token: selectedToken.symbol,
                });
                
                // WalletService.sendTokens expects an OBJECT, not positional args!
                const result = await walletService.sendTokens({
                    to: recipient,
                    amount: amountStr,
                    tokenAddress: tokenAddress,
                    chainId: selectedNetwork.chainId,
                    decimals: selectedToken.decimals || 18,
                });
                
                // Success notification
                UINotification({
                    icon: window.icons['checkmark.svg'],
                    title: i18n('transaction_sent') || 'Transaction Sent',
                    text: `${formatTokenBalance(amount)} ${selectedToken.symbol} sent to ${truncateAddress(recipient)} on ${selectedNetwork.name}`,
                    duration: 5000,
                });
                
                // Close modal
                $window.close();
                resolve(result);
                
            } catch (error) {
                console.error('[SendModal]: Send failed:', error);
                
                // Restore form
                $window.find('.send-modal-container > *:not(#sending-state)').show();
                $window.find('#sending-state').hide();
                
                // Show error notification
                UINotification({
                    icon: window.icons['warning.svg'],
                    title: i18n('transaction_failed') || 'Transaction Failed',
                    text: error.message || 'Failed to send transaction',
                    duration: 5000,
                });
            }
        });
        
        // ============================================
        // CLEANUP
        // ============================================
        $window.on('remove', function() {
            $(document).off('click.sendModal');
            if (feeTimeout) {
                clearTimeout(feeTimeout);
            }
        });
        
        // ============================================
        // INITIALIZE
        // ============================================
        updateNetworkOptions();
        
    });
}

export default UIWindowAccountSend;
