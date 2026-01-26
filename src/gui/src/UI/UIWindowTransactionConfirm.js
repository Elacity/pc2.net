/**
 * Copyright (C) 2024-present Puter Technologies Inc.
 *
 * This file is part of Puter.
 *
 * Puter is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import UIWindow from './UIWindow.js';
import UINotification from './UINotification.js';
import walletService from '../services/WalletService.js';
import { createLogger } from '../helpers/logger.js';
import {
    formatTokenBalance,
    formatUSD,
    truncateAddress,
} from '../helpers/wallet.js';
import { CHAIN_INFO, getTokenAddress } from '../helpers/particle-constants.js';

const logger = createLogger('UIWindowTransactionConfirm');

/**
 * UIWindowTransactionConfirm - Modal dialog for approving/rejecting AI-proposed transactions
 */
async function UIWindowTransactionConfirm(options = {}) {
    const { proposal, onApprove, onReject, readOnly = false } = options;
    
    if (!proposal) {
        logger.error('No proposal provided');
        return null;
    }
    
    // Extract proposal details
    const {
        id: proposalId,
        type = 'transfer',
        token = {},
        to,
        recipient,
        chainId,
        summary = {},
        expiresAt,
        smartAccountAddress,
        status = 'pending_approval',
    } = proposal;
    
    const displayRecipient = recipient || to;
    const chainInfo = CHAIN_INFO[chainId] || { name: 'Unknown Chain', icon: '' };
    const expiresIn = expiresAt ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)) : 300;
    const expiresMinutes = Math.floor(expiresIn / 60);
    const expiresSeconds = expiresIn % 60;
    
    const typeLabels = { 'transfer': 'Send', 'swap': 'Swap', 'approve': 'Approve' };
    const typeLabel = typeLabels[type] || 'Transaction';
    
    // Swap-specific details (extract first for use in generic fields)
    const swap = proposal.swap || {};
    const isSwap = type === 'swap';
    const swapFromSymbol = swap.fromToken?.symbol || token.symbol || 'TOKEN';
    const swapToSymbol = swap.toToken?.symbol || '';
    const swapFromAmount = swap.fromToken?.amount || token.amount || '0';
    const swapExpectedOutput = swap.toToken?.expectedAmount || 'TBD';
    
    // For swaps, use swap data; for transfers, use token data
    const amount = isSwap ? swapFromAmount : (token.amount || '0');
    const symbol = isSwap ? swapFromSymbol : (token.symbol || 'TOKEN');
    
    // Token icon URL - use the "from" token for swaps
    const tokenIconUrl = token.icon || `/static/elacity/tokens/${symbol.toUpperCase()}.webp`;
    
    // Status display for read-only mode
    const statusLabels = {
        'pending_approval': { label: 'Pending', color: '#f59e0b', bg: '#fef3c7' },
        'approved': { label: 'Approved', color: '#059669', bg: '#d1fae5' },
        'executed': { label: 'Completed', color: '#059669', bg: '#d1fae5' },
        'rejected': { label: 'Rejected', color: '#dc2626', bg: '#fee2e2' },
        'expired': { label: 'Expired', color: '#6b7280', bg: '#f3f4f6' },
        'failed': { label: 'Failed', color: '#dc2626', bg: '#fee2e2' },
    };
    const statusInfo = statusLabels[status] || statusLabels['pending_approval'];
    
    const h = `
        <div class="tx-confirm-container">
            <!-- Header -->
            <div class="tx-confirm-header">
                <div class="ai-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2a4 4 0 0 1 4 4c0 1.1-.9 2-2 2h-4a2 2 0 0 1-2-2 4 4 0 0 1 4-4z"/>
                        <path d="M12 8v8"/>
                        <circle cx="12" cy="20" r="2"/>
                        <path d="M8 12h8"/>
                    </svg>
                    Agent Request
                </div>
                <div class="tx-type-badge">${html_encode(typeLabel)}</div>
            </div>
            
            <!-- Amount Card -->
            <div class="tx-summary-card">
                <div class="tx-amount-row">
                    <div class="tx-token-icon">
                        <img src="${html_encode(tokenIconUrl)}" 
                             onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
                        <div class="token-icon-fallback" style="display:none;">
                            ${symbol.charAt(0).toUpperCase()}
                        </div>
                    </div>
                    <div class="tx-amount-value">
                        <span class="amount-number">${html_encode(formatTokenBalance(amount))}</span>
                        <span class="amount-symbol">${html_encode(symbol)}</span>
                    </div>
                </div>
                <div class="tx-chain-badge">
                    <img src="${html_encode(chainInfo.icon)}" onerror="this.style.display='none'" />
                    <span>${html_encode(chainInfo.name)}</span>
                </div>
            </div>
            
            <!-- Transaction Details -->
            <div class="tx-details-section">
                ${isSwap ? `
                <!-- Swap-specific details -->
                <div class="tx-detail-row">
                    <span class="detail-label">You Send</span>
                    <span class="detail-value swap-token-value">
                        <strong>${html_encode(swapFromAmount)} ${html_encode(swapFromSymbol)}</strong>
                    </span>
                </div>
                
                <div class="tx-detail-row">
                    <span class="detail-label">You Receive</span>
                    <span class="detail-value swap-token-value" id="swap-expected-output">
                        ${readOnly ? `
                            <strong>${html_encode(swapExpectedOutput)} ${html_encode(swapToSymbol)}</strong>
                        ` : `
                            <span class="fee-loading" style="display: inline-flex; align-items: center; gap: 6px;">
                                <div class="fee-spinner"></div>
                                <span>Calculating...</span>
                            </span>
                        `}
                    </span>
                </div>
                
                <div class="tx-detail-row">
                    <span class="detail-label">Protocol</span>
                    <span class="detail-value" style="color: #7c3aed;">Particle UniversalX</span>
                </div>
                ` : `
                <!-- Transfer details -->
                <div class="tx-detail-row">
                    <span class="detail-label">To</span>
                    <span class="detail-value address-value" title="${html_encode(displayRecipient || '')}">
                        ${html_encode(truncateAddress(displayRecipient || '', 8, 6))}
                        <span class="copy-hint" data-address="${html_encode(displayRecipient || '')}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                        </span>
                    </span>
                </div>
                
                <div class="tx-detail-row">
                    <span class="detail-label">From</span>
                    <span class="detail-value address-value" title="${html_encode(smartAccountAddress || '')}">
                        ${html_encode(truncateAddress(smartAccountAddress || '', 8, 6))}
                    </span>
                </div>
                `}
                
                <div class="tx-detail-row">
                    <span class="detail-label">Network Fee</span>
                    <span class="detail-value fee-value">
                        ${readOnly ? `
                            <span id="fee-amount" class="fee-sponsored">~$0.0000</span>
                        ` : `
                            <span id="fee-loading" class="fee-loading">
                                <div class="fee-spinner"></div>
                            </span>
                            <span id="fee-amount">estimating...</span>
                        `}
                    </span>
                </div>
                
                <div class="tx-detail-row total-row">
                    <span class="detail-label">Total</span>
                    <span class="detail-value" id="total-cost">${html_encode(amount)} ${html_encode(symbol)}</span>
                </div>
            </div>
            
            ${readOnly ? `
            <!-- Status Badge (read-only mode) -->
            <div class="tx-status-badge" style="
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 12px;
                background: ${statusInfo.bg};
                border-radius: 6px;
                margin-bottom: 16px;
            ">
                <span style="font-weight: 600; color: ${statusInfo.color};">${statusInfo.label}</span>
            </div>
            
            <!-- Close Button (read-only mode) -->
            <div class="tx-actions">
                <button class="btn-close-readonly" id="btn-close-readonly" style="
                    width: 100%;
                    padding: 12px 16px;
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    background: #f3f4f6;
                    color: #374151;
                    border: 1px solid #d1d5db;
                ">Close</button>
            </div>
            ` : `
            <!-- Expiration -->
            <div class="tx-expiration">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                </svg>
                <span>Expires in <span id="expires-countdown">${expiresMinutes}:${expiresSeconds.toString().padStart(2, '0')}</span></span>
            </div>
            
            <!-- Action Buttons -->
            <div class="tx-actions">
                <button class="btn-reject" id="btn-reject">Reject</button>
                <button class="btn-approve" id="btn-approve">Approve & Send</button>
            </div>
            `}
        </div>
        
        <style>
            .tx-confirm-container {
                padding: 20px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #ffffff;
                color: #1f2937;
            }
            
            .tx-confirm-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
            }
            
            .ai-badge {
                display: flex;
                align-items: center;
                gap: 5px;
                background: #f3f4f6;
                color: #6b7280;
                padding: 5px 10px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 500;
            }
            
            .tx-type-badge {
                background: #f3f4f6;
                color: #6b7280;
                padding: 5px 10px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 500;
            }
            
            .tx-summary-card {
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 16px;
                text-align: center;
                margin-bottom: 16px;
            }
            
            .tx-amount-row {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                margin-bottom: 10px;
            }
            
            .tx-token-icon {
                width: 32px;
                height: 32px;
            }
            
            .tx-token-icon img {
                width: 100%;
                height: 100%;
                border-radius: 50%;
                object-fit: cover;
            }
            
            .token-icon-fallback {
                width: 100%;
                height: 100%;
                border-radius: 50%;
                background: #e5e7eb;
                color: #6b7280;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 600;
                font-size: 14px;
            }
            
            .tx-amount-value {
                display: flex;
                align-items: baseline;
                gap: 5px;
            }
            
            .amount-number {
                font-size: 24px;
                font-weight: 600;
                color: #1f2937;
            }
            
            .amount-symbol {
                font-size: 14px;
                color: #6b7280;
            }
            
            .tx-chain-badge {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                background: #e5e7eb;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 11px;
                color: #4b5563;
            }
            
            .tx-chain-badge img {
                width: 14px;
                height: 14px;
                border-radius: 50%;
            }
            
            .tx-details-section {
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 6px;
                padding: 12px;
                margin-bottom: 12px;
            }
            
            .tx-detail-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 6px 0;
                border-bottom: 1px solid #e5e7eb;
            }
            
            .tx-detail-row:last-child {
                border-bottom: none;
            }
            
            .tx-detail-row.total-row {
                border-top: 1px solid #d1d5db;
                margin-top: 6px;
                padding-top: 10px;
                font-weight: 600;
            }
            
            .detail-label {
                font-size: 12px;
                color: #6b7280;
            }
            
            .detail-value {
                font-size: 12px;
                color: #374151;
                font-weight: 500;
            }
            
            .address-value {
                font-family: 'SF Mono', Monaco, Consolas, monospace;
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 11px;
            }
            
            .copy-hint {
                cursor: pointer;
                opacity: 0.4;
                transition: opacity 0.2s;
            }
            
            .copy-hint:hover {
                opacity: 1;
            }
            
            .fee-loading {
                display: inline-flex;
                align-items: center;
            }
            
            .fee-spinner {
                width: 12px;
                height: 12px;
                border: 2px solid #e5e7eb;
                border-top: 2px solid #6b7280;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-right: 6px;
            }
            
            .fee-sponsored {
                color: #059669;
                font-weight: 500;
            }
            
            .fee-sponsored::after {
                content: ' (sponsored)';
                color: #6b7280;
                font-weight: 400;
            }
            
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            
            .tx-expiration {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                padding: 8px;
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 4px;
                font-size: 11px;
                color: #6b7280;
                margin-bottom: 16px;
            }
            
            .tx-actions {
                display: flex;
                gap: 10px;
            }
            
            .btn-reject, .btn-approve {
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 12px 16px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                border: none;
            }
            
            .btn-reject {
                background: #f3f4f6;
                color: #4b5563;
                border: 1px solid #d1d5db;
            }
            
            .btn-reject:hover {
                background: #e5e7eb;
                color: #374151;
            }
            
            .btn-approve {
                background: #F6921A;
                color: white;
            }
            
            .btn-approve:hover {
                background: #e07d0a;
            }
            
            .btn-approve:disabled, .btn-reject:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .processing-spinner {
                width: 14px;
                height: 14px;
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-top: 2px solid #ffffff;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                display: inline-block;
                margin-right: 6px;
            }
        </style>
    `;
    
    // Helper to close window and remove backdrop
    function closeWindowWithBackdrop(el) {
        const $el = $(el);
        // Try jQuery .close() method first (defined by UIWindow)
        if ($el.close && typeof $el.close === 'function') {
            $el.close();
        } else {
            // Fallback: remove backdrop or element directly
            const $backdrop = $el.closest('.window-backdrop');
            if ($backdrop.length) {
                $backdrop.remove();
            } else {
                $el.remove();
            }
        }
    }
    
    return new Promise(async (resolve) => {
        const el_window = await UIWindow({
            title: 'Confirm Transaction',
            app: 'transaction-confirm',
            single_instance: true,
            icon: window.icons['shield.svg'] || window.icons['checkmark.svg'],
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
            width: 380,
            height: 'auto',
            dominant: true,
            stay_on_top: true,
            show_in_taskbar: false,
            draggable_body: false,
            window_class: 'window-transaction-confirm',
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
        
        // Fetch real fee estimate from Particle
        async function estimateFee() {
            try {
                const tokenAddress = token.address || getTokenAddress(symbol, chainInfo.name);
                
                const result = await walletService.estimateFee({
                    to: displayRecipient,
                    amount: amount,
                    tokenAddress: tokenAddress,
                    chainId: chainId,
                    decimals: token.decimals || 6,
                });
                
                $window.find('#fee-loading').hide();
                
                if (result.freeGasFee) {
                    $window.find('#fee-amount').addClass('fee-sponsored').text('~$0.0000');
                } else {
                    const feeUSD = result.totalUSD || result.total || 0;
                    if (feeUSD < 0.01) {
                        // Very low fee - show as effectively free
                        $window.find('#fee-amount').addClass('fee-sponsored').text(`~$${parseFloat(feeUSD).toFixed(4)}`);
                    } else {
                        $window.find('#fee-amount').text(`~$${parseFloat(feeUSD).toFixed(4)}`);
                        // Update total if there's a significant fee
                        $window.find('#total-cost').text(`${amount} ${symbol} + ~$${parseFloat(feeUSD).toFixed(2)} fee`);
                    }
                }
            } catch (error) {
                logger.warn('Fee estimation failed:', error);
                $window.find('#fee-loading').hide();
                $window.find('#fee-amount').text('--');
            }
        }
        
        // Estimate swap output - gets real expected amount from Particle SDK
        async function estimateSwapOutput() {
            if (!isSwap) return;
            
            const swapInfo = proposal.swap || {};
            const fromTokenSymbol = swapInfo.fromToken?.symbol || token.symbol;
            const toTokenSymbol = swapInfo.toToken?.symbol;
            const fromAmountVal = swapInfo.fromToken?.amount || token.amount;
            
            if (!fromTokenSymbol || !toTokenSymbol || !fromAmountVal) {
                logger.warn('Missing swap info for estimation');
                return;
            }
            
            try {
                logger.log('Estimating swap output:', { fromTokenSymbol, toTokenSymbol, fromAmountVal, chainId });
                
                const result = await walletService.estimateSwap({
                    fromToken: fromTokenSymbol,
                    toToken: toTokenSymbol,
                    fromAmount: fromAmountVal,
                    toChainId: chainId,
                });
                
                logger.log('Swap estimation result:', result);
                
                if (result && result.expectedOutput) {
                    // Update the expected output display
                    const formattedOutput = parseFloat(result.expectedOutput).toFixed(6);
                    $window.find('#swap-expected-output').html(
                        `<strong>${formattedOutput} ${toTokenSymbol}</strong>` +
                        `<span style="color: #6b7280; font-size: 11px; margin-left: 4px;">(~$${result.fromAmountUSD || '0'})</span>`
                    );
                    
                    // Update fee display
                    $window.find('#fee-loading').hide();
                    if (result.fees) {
                        const totalFee = parseFloat(result.fees.totalFeeUSD) || 0;
                        if (totalFee < 0.01 || result.fees.freeGasFee) {
                            $window.find('#fee-amount').addClass('fee-sponsored').text('~$0.0000 (sponsored)');
                        } else {
                            $window.find('#fee-amount').text(`~$${totalFee.toFixed(4)}`);
                        }
                    } else if (result.tokenChangesFeeUSD) {
                        const fee = parseFloat(result.tokenChangesFeeUSD);
                        if (fee < 0.01) {
                            $window.find('#fee-amount').addClass('fee-sponsored').text('~$0.0000 (sponsored)');
                        } else {
                            $window.find('#fee-amount').text(`~$${fee.toFixed(4)}`);
                        }
                    }
                    
                    // Update total cost
                    $window.find('#total-cost').text(`${fromAmountVal} ${fromTokenSymbol} → ~${formattedOutput} ${toTokenSymbol}`);
                }
            } catch (error) {
                logger.warn('Swap estimation failed:', error);
                $window.find('#swap-expected-output').html(
                    `<strong>~${swapExpectedOutput} ${swapToSymbol}</strong>` +
                    `<span style="color: #dc2626; font-size: 11px; margin-left: 4px;">(estimation failed)</span>`
                );
                $window.find('#fee-loading').hide();
                $window.find('#fee-amount').text('--');
            }
        }
        
        // Start estimation (only for pending proposals)
        if (!readOnly) {
            if (isSwap) {
                estimateSwapOutput();
            } else {
                estimateFee();
            }
        }
        
        // Countdown timer (only for pending proposals)
        let countdown = expiresIn;
        let countdownInterval = null;
        if (!readOnly) {
            countdownInterval = setInterval(() => {
                countdown--;
                if (countdown <= 0) {
                    clearInterval(countdownInterval);
                    handleReject('expired');
                    return;
                }
                const mins = Math.floor(countdown / 60);
                const secs = countdown % 60;
                $window.find('#expires-countdown').text(`${mins}:${secs.toString().padStart(2, '0')}`);
            }, 1000);
        }
        
        // Copy address on click
        $window.on('click', '.copy-hint', async function() {
            const addr = $(this).data('address');
            if (!addr) return;
            
            try {
                await navigator.clipboard.writeText(addr);
                UINotification({
                    icon: window.icons['checkmark.svg'],
                    title: 'Copied',
                    text: 'Address copied to clipboard',
                    duration: 2000,
                });
            } catch (err) {
                logger.error('Copy failed:', err);
            }
        });
        
        // Reject handler
        async function handleReject(reason = 'user') {
            clearInterval(countdownInterval);
            
            logger.log('Transaction rejected:', proposalId, reason);
            
            if (onReject) {
                onReject({ proposalId, reason });
            }
            
            try {
                await walletService.rejectTransactionProposal(proposalId, reason);
            } catch (err) {
                logger.error('Failed to notify rejection:', err);
            }
            
            closeWindowWithBackdrop(el_window);
            resolve({ approved: false, reason });
        }
        
        // Approve handler
        async function handleApprove() {
            clearInterval(countdownInterval);
            
            const $approveBtn = $window.find('#btn-approve');
            const $rejectBtn = $window.find('#btn-reject');
            
            $approveBtn.prop('disabled', true).html(`
                <div class="processing-spinner"></div>
                Signing...
            `);
            $rejectBtn.prop('disabled', true);
            
            logger.log('Transaction approved, executing via Particle:', proposalId, 'type:', type);
            
            try {
                let result;
                
                if (type === 'swap') {
                    // Handle swap transactions
                    const swapInfo = proposal.swap || {};
                    result = await walletService.swapTokens({
                        fromToken: swapInfo.fromToken?.symbol || token.symbol,
                        toToken: swapInfo.toToken?.symbol,
                        fromAmount: swapInfo.fromToken?.amount || token.amount,
                        toChainId: chainId,
                    });
                    
                    logger.log('Swap executed via Particle:', result);
                    
                    UINotification({
                        icon: window.icons['checkmark.svg'],
                        title: 'Swap Submitted',
                        text: `Swapping ${swapInfo.fromToken?.amount || amount} ${swapInfo.fromToken?.symbol || symbol} → ${swapInfo.toToken?.symbol}`,
                        duration: 5000,
                    });
                } else {
                    // Handle transfer transactions
                    const actualRecipient = proposal.recipient || to;
                    
                    result = await walletService.sendTokens({
                        to: actualRecipient,
                        amount: token.amount || amount,
                        tokenAddress: token.address,
                        chainId: chainId,
                        decimals: token.decimals || 6,
                        mode: 'universal',
                    });
                    
                    logger.log('Transfer executed via Particle:', result);
                    
                    UINotification({
                        icon: window.icons['checkmark.svg'],
                        title: 'Transaction Sent',
                        text: `${formatTokenBalance(amount)} ${symbol} sent successfully`,
                        duration: 5000,
                    });
                }
                
                try {
                    await walletService.approveTransactionProposal(proposalId);
                } catch (backendErr) {
                    logger.warn('Failed to notify backend of execution:', backendErr);
                }
                
                if (onApprove) {
                    onApprove({ proposalId, result });
                }
                
                closeWindowWithBackdrop(el_window);
                resolve({ approved: true, result });
                
            } catch (error) {
                logger.error('Transaction execution failed:', error);
                
                UINotification({
                    icon: window.icons['warning.svg'],
                    title: 'Transaction Failed',
                    text: error.message || 'Failed to execute transaction',
                    duration: 5000,
                });
                
                $approveBtn.prop('disabled', false).text('Retry');
                $rejectBtn.prop('disabled', false);
            }
        }
        
        // Button handlers
        if (!readOnly) {
            $window.on('click', '#btn-reject', () => handleReject('user'));
            $window.on('click', '#btn-approve', handleApprove);
        }
        
        // Handle close button for read-only mode
        $window.on('click', '#btn-close-readonly', () => {
            closeWindowWithBackdrop(el_window);
            resolve({ closed: true });
        });
        
        // Handle window close button (X in header)
        // Remove UIWindow's default handler and replace with our own
        const $closeBtn = $window.find('.window-close-btn');
        $closeBtn.off('click'); // Remove UIWindow's default handler
        $closeBtn.on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (readOnly) {
                closeWindowWithBackdrop(el_window);
                resolve({ closed: true });
            } else {
                handleReject('user');
            }
        });
        
        // Handle backdrop click to close
        $(el_window).closest('.window-backdrop').on('click', function(e) {
            if ($(e.target).hasClass('window-backdrop')) {
                if (readOnly) {
                    closeWindowWithBackdrop(el_window);
                    resolve({ closed: true });
                } else {
                    handleReject('user');
                }
            }
        });
        
        // Clean up on window close
        $window.on('remove', () => {
            if (countdownInterval) {
                clearInterval(countdownInterval);
            }
        });
    });
}

export default UIWindowTransactionConfirm;
