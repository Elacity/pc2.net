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
    isValidAddress,
    formatTokenBalance,
    formatUSD,
    getChainName,
    getDefaultTokenIcon,
    truncateAddress,
} from '../helpers/wallet.js';

/**
 * UIWindowAccountSend - Modal dialog for sending tokens
 * 
 * Features:
 * - Token selection dropdown
 * - Recipient address input with validation
 * - Amount input with max button
 * - Fee estimation
 * - Transaction confirmation
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
    
    // Build token options HTML
    const tokenOptionsHtml = tokens.map(token => `
        <option value="${html_encode(token.address || 'native')}" 
                data-symbol="${html_encode(token.symbol)}"
                data-balance="${html_encode(token.balance)}"
                data-decimals="${html_encode(token.decimals || 18)}"
                data-chain-id="${html_encode(token.chainId)}"
                data-icon="${html_encode(token.icon || token.logoURI || '')}">
            ${html_encode(token.symbol)} - ${formatTokenBalance(token.balance)} (${formatUSD(token.usdValue)})
        </option>
    `).join('');
    
    const h = `
        <div class="send-modal-container" style="padding: 24px;">
            <!-- Token Selection -->
            <div class="form-group" style="margin-bottom: 20px;">
                <label class="form-label" style="display: block; margin-bottom: 8px; font-weight: 500; color: #374151;">
                    ${i18n('token') || 'Token'}
                </label>
                <div class="token-select-wrapper" style="position: relative;">
                    <select id="send-token-select" class="form-select" style="
                        width: 100%;
                        padding: 12px 16px;
                        border: 1px solid #d1d5db;
                        border-radius: 8px;
                        font-size: 14px;
                        background: white;
                        cursor: pointer;
                    ">
                        ${tokenOptionsHtml || '<option disabled>No tokens available</option>'}
                    </select>
                </div>
                <div class="token-balance-display" style="margin-top: 8px; font-size: 13px; color: #6b7280;">
                    ${i18n('available') || 'Available'}: <span id="available-balance">${defaultToken ? formatTokenBalance(defaultToken.balance) : '0'}</span> <span id="available-symbol">${defaultToken?.symbol || ''}</span>
                </div>
            </div>
            
            <!-- Recipient Address -->
            <div class="form-group" style="margin-bottom: 20px;">
                <label class="form-label" style="display: block; margin-bottom: 8px; font-weight: 500; color: #374151;">
                    ${i18n('recipient_address') || 'Recipient Address'}
                </label>
                <input type="text" 
                       id="send-recipient" 
                       class="form-input"
                       placeholder="0x..."
                       style="
                           width: 100%;
                           padding: 12px 16px;
                           border: 1px solid #d1d5db;
                           border-radius: 8px;
                           font-size: 14px;
                           font-family: 'SF Mono', Monaco, monospace;
                           box-sizing: border-box;
                       ">
                <div id="recipient-error" class="form-error" style="color: #ef4444; font-size: 13px; margin-top: 4px; display: none;"></div>
            </div>
            
            <!-- Amount -->
            <div class="form-group" style="margin-bottom: 20px;">
                <label class="form-label" style="display: block; margin-bottom: 8px; font-weight: 500; color: #374151;">
                    ${i18n('amount') || 'Amount'}
                </label>
                <div style="position: relative;">
                    <input type="number" 
                           id="send-amount" 
                           class="form-input"
                           placeholder="0.0"
                           step="any"
                           min="0"
                           style="
                               width: 100%;
                               padding: 12px 70px 12px 16px;
                               border: 1px solid #d1d5db;
                               border-radius: 8px;
                               font-size: 14px;
                               box-sizing: border-box;
                           ">
                    <button id="send-max-btn" 
                            type="button"
                            style="
                                position: absolute;
                                right: 8px;
                                top: 50%;
                                transform: translateY(-50%);
                                padding: 6px 12px;
                                background: #3b82f6;
                                color: white;
                                border: none;
                                border-radius: 6px;
                                font-size: 12px;
                                font-weight: 500;
                                cursor: pointer;
                            ">
                        MAX
                    </button>
                </div>
                <div id="amount-error" class="form-error" style="color: #ef4444; font-size: 13px; margin-top: 4px; display: none;"></div>
                <div id="amount-usd" style="margin-top: 4px; font-size: 13px; color: #6b7280;">≈ $0.00</div>
            </div>
            
            <!-- Fee Estimation -->
            <div class="fee-section" style="
                background: #f9fafb;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 20px;
            ">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: #6b7280; font-size: 14px;">${i18n('estimated_fee') || 'Estimated Fee'}</span>
                    <span id="fee-estimate" style="font-weight: 500; color: #374151;">--</span>
                </div>
                <div id="fee-error" style="color: #ef4444; font-size: 13px; margin-top: 8px; display: none;"></div>
            </div>
            
            <!-- Send Button -->
            <button id="send-confirm-btn" 
                    type="button"
                    disabled
                    style="
                        width: 100%;
                        padding: 14px;
                        background: #3b82f6;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: 500;
                        cursor: pointer;
                        opacity: 0.5;
                        transition: all 0.2s ease;
                    ">
                ${i18n('send') || 'Send'}
            </button>
            
            <!-- Sending State -->
            <div id="sending-state" style="display: none; text-align: center; padding: 40px 0;">
                <div class="loading-spinner" style="
                    width: 48px;
                    height: 48px;
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #3b82f6;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 16px;
                "></div>
                <div style="font-size: 16px; font-weight: 500; color: #374151;">${i18n('sending') || 'Sending...'}</div>
                <div style="font-size: 14px; color: #6b7280; margin-top: 8px;">${i18n('please_wait') || 'Please wait for confirmation'}</div>
            </div>
        </div>
        
        <style>
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            #send-confirm-btn:not(:disabled):hover {
                background: #2563eb;
            }
            #send-max-btn:hover {
                background: #2563eb;
            }
            .form-input:focus {
                outline: none;
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }
            .form-input.error {
                border-color: #ef4444;
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
            },
            ...options.window_options,
        });
        
        const $window = $(el_window);
        let selectedToken = defaultToken;
        let feeEstimate = null;
        let feeTimeout = null;
        
        // Token selection change
        $window.find('#send-token-select').on('change', function() {
            const $selected = $(this).find(':selected');
            const tokenAddress = $(this).val();
            
            selectedToken = tokens.find(t => (t.address || 'native') === tokenAddress);
            
            if (selectedToken) {
                $window.find('#available-balance').text(formatTokenBalance(selectedToken.balance));
                $window.find('#available-symbol').text(selectedToken.symbol);
            }
            
            // Re-validate amount
            validateForm();
            estimateFee();
        });
        
        // Recipient input
        $window.find('#send-recipient').on('input', function() {
            validateForm();
            estimateFee();
        });
        
        // Amount input
        $window.find('#send-amount').on('input', function() {
            validateForm();
            updateAmountUSD();
            estimateFee();
        });
        
        // Max button
        $window.find('#send-max-btn').on('click', function() {
            if (selectedToken) {
                // For native token, leave some for gas
                const maxAmount = selectedToken.address ? 
                    selectedToken.balance : 
                    Math.max(0, parseFloat(selectedToken.balance) - 0.01);
                    
                $window.find('#send-amount').val(maxAmount).trigger('input');
            }
        });
        
        // Send button
        $window.find('#send-confirm-btn').on('click', async function() {
            const recipient = $window.find('#send-recipient').val().trim();
            const amount = $window.find('#send-amount').val();
            
            if (!validateForm()) return;
            
            // Show sending state
            $window.find('.send-modal-container > *:not(#sending-state)').hide();
            $window.find('#sending-state').show();
            
            try {
                const result = await walletService.sendTokens({
                    to: recipient,
                    amount: amount,
                    tokenAddress: selectedToken?.address || null,
                    chainId: selectedToken?.chainId,
                });
                
                // Success
                UINotification({
                    icon: window.icons['checkmark.svg'],
                    title: i18n('transaction_sent') || 'Transaction Sent',
                    text: `${formatTokenBalance(amount)} ${selectedToken?.symbol} sent to ${truncateAddress(recipient)}`,
                });
                
                $window.close();
                resolve(result);
                
            } catch (error) {
                // Show error and restore form
                $window.find('.send-modal-container > *:not(#sending-state)').show();
                $window.find('#sending-state').hide();
                
                UINotification({
                    icon: window.icons['warning.svg'],
                    title: i18n('transaction_failed') || 'Transaction Failed',
                    text: error.message || 'Failed to send transaction',
                });
            }
        });
        
        // Form validation
        function validateForm() {
            const recipient = $window.find('#send-recipient').val().trim();
            const amount = $window.find('#send-amount').val();
            let isValid = true;
            
            // Validate recipient
            if (!recipient) {
                $window.find('#recipient-error').hide();
            } else if (!isValidAddress(recipient)) {
                $window.find('#recipient-error').text(i18n('invalid_address') || 'Invalid address').show();
                $window.find('#send-recipient').addClass('error');
                isValid = false;
            } else {
                $window.find('#recipient-error').hide();
                $window.find('#send-recipient').removeClass('error');
            }
            
            // Validate amount
            if (!amount || parseFloat(amount) <= 0) {
                $window.find('#amount-error').hide();
                isValid = false;
            } else if (selectedToken && parseFloat(amount) > parseFloat(selectedToken.balance)) {
                $window.find('#amount-error').text(i18n('insufficient_balance') || 'Insufficient balance').show();
                $window.find('#send-amount').addClass('error');
                isValid = false;
            } else {
                $window.find('#amount-error').hide();
                $window.find('#send-amount').removeClass('error');
            }
            
            // Enable/disable send button
            const canSend = isValid && recipient && amount && parseFloat(amount) > 0;
            $window.find('#send-confirm-btn').prop('disabled', !canSend).css('opacity', canSend ? '1' : '0.5');
            
            return isValid && recipient && amount;
        }
        
        // Update USD value display
        function updateAmountUSD() {
            const amount = parseFloat($window.find('#send-amount').val()) || 0;
            
            if (selectedToken && selectedToken.usdValue && selectedToken.balance) {
                const pricePerToken = parseFloat(selectedToken.usdValue) / parseFloat(selectedToken.balance);
                const usdValue = amount * pricePerToken;
                $window.find('#amount-usd').text(`≈ ${formatUSD(usdValue)}`);
            } else {
                $window.find('#amount-usd').text('≈ $0.00');
            }
        }
        
        // Estimate fee
        function estimateFee() {
            // Debounce fee estimation
            if (feeTimeout) clearTimeout(feeTimeout);
            
            const recipient = $window.find('#send-recipient').val().trim();
            const amount = $window.find('#send-amount').val();
            
            if (!isValidAddress(recipient) || !amount || parseFloat(amount) <= 0) {
                $window.find('#fee-estimate').text('--');
                return;
            }
            
            $window.find('#fee-estimate').text(i18n('estimating') || 'Estimating...');
            
            feeTimeout = setTimeout(async () => {
                try {
                    const result = await walletService.estimateFee({
                        to: recipient,
                        amount: amount,
                        tokenAddress: selectedToken?.address || null,
                        chainId: selectedToken?.chainId,
                    });
                    
                    feeEstimate = result;
                    $window.find('#fee-estimate').text(`~${formatTokenBalance(result.fee)} ${result.feeSymbol || 'ETH'} (${formatUSD(result.feeUSD)})`);
                    $window.find('#fee-error').hide();
                    
                } catch (error) {
                    $window.find('#fee-estimate').text('--');
                    $window.find('#fee-error').text(error.message || 'Failed to estimate fee').show();
                }
            }, 500);
        }
        
        // Cleanup on close
        $window.on('remove', function() {
            if (feeTimeout) clearTimeout(feeTimeout);
            resolve(null);
        });
    });
}

export default UIWindowAccountSend;

