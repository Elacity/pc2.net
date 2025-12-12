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

import { createLogger } from '../helpers/logger.js';
import { 
    getEthereumProvider, 
    hasEthereumProvider,
    switchToElastos,
    sendTransaction as sendEthTransaction,
    estimateGas,
    ELASTOS_CHAIN_CONFIG 
} from '../helpers/ethereum-provider.js';

// Import type definitions for JSDoc
/** @typedef {import('../types/wallet.js').Token} Token */
/** @typedef {import('../types/wallet.js').Transaction} Transaction */
/** @typedef {import('../types/wallet.js').WalletData} WalletData */
/** @typedef {import('../types/wallet.js').ElastosData} ElastosData */
/** @typedef {import('../types/wallet.js').FeeEstimate} FeeEstimate */
/** @typedef {import('../types/wallet.js').SendTransactionParams} SendTransactionParams */

const logger = createLogger('WalletService');

/**
 * WalletService - Manages wallet data communication with Particle Network
 * 
 * This service handles:
 * - Fetching token balances from Universal Account
 * - Fetching transaction history
 * - Caching wallet data for performance
 * - Communication with particle-auth iframe
 * 
 * @class WalletService
 */
class WalletService {
    constructor() {
        // Wallet mode: 'universal' (Smart Account + multi-chain) or 'elastos' (EOA + ELA)
        this.walletMode = 'universal';
        
        // Universal Account wallet data
        this.walletData = {
            tokens: [],
            transactions: [],
            totalBalance: 0,
            lastUpdated: null,
            isLoading: false,
            error: null,
        };
        
        // Elastos wallet data (separate cache)
        this.elastosData = {
            tokens: [],
            transactions: [],
            totalBalance: 0,
            lastUpdated: null,
            isLoading: false,
            error: null,
        };
        
        this.listeners = new Set();
        this.pollInterval = null;
        this.messageHandler = null;
        this.pendingRequests = new Map();
        this.requestId = 0;
        
        // Initialize message listener
        this._initMessageListener();
    }
    
    /**
     * Get current wallet mode
     * @returns {'universal' | 'elastos'}
     */
    getMode() {
        return this.walletMode;
    }
    
    /**
     * Set wallet mode and refresh data
     * @param {'universal' | 'elastos'} mode
     */
    async setMode(mode) {
        if (mode !== 'universal' && mode !== 'elastos') {
            logger.error('Invalid mode:', mode);
            return;
        }
        
        const previousMode = this.walletMode;
        this.walletMode = mode;
        
        logger.log('Mode changed from', previousMode, 'to', mode);
        
        // Notify listeners of mode change
        this._notifyListeners();
        
        // Refresh data for new mode (tokens AND transactions)
        await Promise.all([
            this.refreshTokens(),
            this.refreshTransactions(),
        ]);
    }
    
    /**
     * Initialize the postMessage listener for iframe communication
     */
    _initMessageListener() {
        this._iframeReady = false;
        
        this.messageHandler = (event) => {
            // Security: verify origin matches our app
            if (event.origin !== window.location.origin) return;
            
            const { type, payload, requestId } = event.data || {};
            
            switch (type) {
                case 'particle-wallet.ready':
                    logger.log('Particle wallet ready signal received', payload);
                    this._iframeReady = true;
                    // Store Solana address if provided
                    if (payload?.solanaSmartAccountAddress && window.user) {
                        window.user.solana_smart_account_address = payload.solanaSmartAccountAddress;
                        logger.log('Stored Solana Smart Account:', payload.solanaSmartAccountAddress);
                    }
                    // Store wallet address in window.user for auto-authentication
                    if (payload?.address && !window.user) {
                        window.user = { wallet_address: payload.address };
                    } else if (payload?.address && window.user) {
                        window.user.wallet_address = payload.address;
                    }
                    // Dispatch DOM event for auto-authentication listeners
                    window.dispatchEvent(new CustomEvent('particle-wallet.ready', {
                        detail: {
                            address: payload?.address,
                            eoaAddress: payload?.eoaAddress,
                            smartAccountAddress: payload?.smartAccountAddress,
                            solanaSmartAccountAddress: payload?.solanaSmartAccountAddress,
                            ...payload
                        }
                    }));
                    // Automatically fetch data when ready
                    this.refreshTokens().catch(() => {});
                    break;
                    
                case 'particle-wallet.address-mismatch':
                    // ⚠️ SAFETY CHECK: Particle session has different user than expected
                    // This can happen if browser cached an old Particle session
                    logger.warn('⚠️ Address mismatch detected!', payload);
                    logger.warn('Expected:', payload?.expected, 'Got:', payload?.actual);
                    logger.warn('Reinitializing to fix mismatch...');
                    
                    // Force reinitialize with correct addresses
                    this.reinitialize();
                    break;
                case 'particle-wallet.addresses-updated':
                    logger.log('Addresses updated received', payload);
                    // Store addresses
                    if (window.user) {
                        if (payload?.solanaSmartAccountAddress) {
                            window.user.solana_smart_account_address = payload.solanaSmartAccountAddress;
                            logger.log('Updated Solana Smart Account:', payload.solanaSmartAccountAddress);
                        }
                        if (payload?.smartAccountAddress) {
                            window.user.smart_account_address = payload.smartAccountAddress;
                        }
                    }
                    break;
                case 'particle-wallet.data':
                    this._handleWalletData(payload);
                    break;
                case 'particle-wallet.tokens':
                    this._handleTokensResponse(payload, requestId);
                    break;
                case 'particle-wallet.transactions':
                    this._handleTransactionsResponse(payload, requestId);
                    break;
                case 'particle-wallet.send-result':
                    logger.log('Received send-result message:', { requestId, payload });
                    this._handleSendResult(payload, requestId);
                    break;
                case 'particle-wallet.transaction-status':
                    logger.log('Received transaction-status message:', payload);
                    this._handleTransactionStatus(payload);
                    break;
                case 'particle-wallet.transaction-details':
                    logger.log('Received transaction-details message:', payload);
                    this._handleTransactionDetails(payload, requestId);
                    break;
                case 'particle-wallet.fee-estimate':
                    logger.log('Received fee-estimate message:', payload);
                    this._handleFeeEstimate(payload, requestId);
                    break;
                case 'particle-wallet.error':
                    this._handleError(payload, requestId);
                    break;
            }
        };
        
        window.addEventListener('message', this.messageHandler);
    }
    
    /**
     * Handle incoming wallet data from iframe
     */
    _handleWalletData(payload) {
        if (!payload) return;
        
        this.walletData = {
            ...this.walletData,
            tokens: payload.tokens || [],
            transactions: payload.transactions || [],
            totalBalance: payload.totalBalance || 0,
            lastUpdated: Date.now(),
            isLoading: false,
            error: null,
        };
        
        // Store in window for global access
        window.wallet_data = this.walletData;
        
        // Notify listeners
        this._notifyListeners();
        
        // Trigger jQuery event for component updates
        $(document).trigger('wallet:data:updated', [this.walletData]);
    }
    
    /**
     * Handle tokens response (both requested and auto-pushed)
     */
    _handleTokensResponse(payload, requestId) {
        logger.log('Received tokens response:', { 
            requestId, 
            tokensCount: payload?.tokens?.length, 
            totalBalance: payload?.totalBalance 
        });
        
        // Always update cached data (even for auto-push with requestId 0)
        if (payload?.tokens && payload.tokens.length > 0) {
            this.walletData.tokens = payload.tokens;
            this.walletData.totalBalance = payload.totalBalance || this._calculateTotalBalance(payload.tokens);
            this.walletData.lastUpdated = Date.now();
            this.walletData.isLoading = false;
            this.walletData.error = null;
            window.wallet_data = this.walletData;
            
            this._notifyListeners();
            $(document).trigger('wallet:data:updated', [this.walletData]);
        }
        
        // Resolve pending request if exists
        const resolver = this.pendingRequests.get(requestId);
        if (resolver) {
            this.pendingRequests.delete(requestId);
            resolver.resolve(payload);
        }
    }
    
    /**
     * Handle transactions response
     */
    _handleTransactionsResponse(payload, requestId) {
        const resolver = this.pendingRequests.get(requestId);
        if (resolver) {
            this.pendingRequests.delete(requestId);
            
            // Update cached data
            this.walletData.transactions = payload.transactions || [];
            this.walletData.hasMoreTransactions = payload.hasMore;
            this.walletData.transactionsTotalCount = payload.totalCount;
            this.walletData.lastUpdated = Date.now();
            window.wallet_data = this.walletData;
            
            this._notifyListeners();
            $(document).trigger('wallet:transactions:updated', [this.walletData.transactions]);
            
            resolver.resolve(payload);
        }
    }
    
    /**
     * Handle transaction details response
     */
    _handleTransactionDetails(payload, requestId) {
        const resolver = this.pendingRequests.get(requestId);
        if (resolver) {
            this.pendingRequests.delete(requestId);
            
            if (payload.error) {
                resolver.reject(new Error(payload.error));
            } else {
                resolver.resolve(payload);
            }
        }
    }
    
    /**
     * Handle fee estimate response
     */
    _handleFeeEstimate(payload, requestId) {
        logger.log('Processing fee estimate:', payload);
        
        const resolver = this.pendingRequests.get(requestId);
        if (resolver) {
            this.pendingRequests.delete(requestId);
            
            if (payload.success && payload.feeEstimate) {
                logger.log('Fee estimate received:', payload.feeEstimate);
                resolver.resolve(payload.feeEstimate);
            } else if (payload.error) {
                logger.error('Fee estimation failed:', payload.error);
                resolver.reject(new Error(payload.error));
            } else {
                // Fallback to default estimate
                resolver.resolve({
                    total: '0.01',
                    totalUSD: 0.01,
                    gas: '0.01',
                    gasUSD: 0.01,
                    service: '0',
                    serviceUSD: 0,
                    lp: '0',
                    lpUSD: 0,
                    freeGasFee: false,
                    freeServiceFee: true,
                });
            }
        }
    }
    
    /**
     * Handle send transaction result
     */
    _handleSendResult(payload, requestId) {
        logger.log('Received send result:', { requestId, payload });
        
        const resolver = this.pendingRequests.get(requestId);
        if (resolver) {
            this.pendingRequests.delete(requestId);
            
            if (payload.success) {
                logger.log('Transaction successful:', payload.hash);
                resolver.resolve(payload);
                // Refresh balances after successful send
                this.refreshTokens();
            } else if (payload.requiresWalletUI) {
                // Transaction requires the main Particle wallet UI
                // Reject with a specific error that the UI can handle
                logger.log('Transaction requires wallet UI');
                const error = new Error('Transaction signing requires Particle wallet. Please use the Particle wallet interface to send tokens.');
                error.requiresWalletUI = true;
                resolver.reject(error);
            } else {
                logger.log('Transaction failed:', payload.error);
                resolver.reject(new Error(payload.error || 'Transaction failed'));
            }
        } else {
            logger.warn('No pending request found for requestId:', requestId);
        }
    }
    
    /**
     * Handle transaction status updates (confirmed/failed)
     */
    _handleTransactionStatus(payload) {
        const { transactionId, status, txHash, error, message } = payload;
        
        logger.log('Transaction status update:', { transactionId, status, txHash });
        
        // Import UINotification dynamically to show notifications
        import('../UI/UINotification.js').then(({ default: UINotification }) => {
            if (status === 'confirmed') {
                UINotification({
                    icon: window.icons['checkmark.svg'],
                    title: 'Transaction Confirmed ✓',
                    text: txHash 
                        ? `Transaction confirmed on chain. Hash: ${txHash.slice(0, 10)}...${txHash.slice(-8)}`
                        : 'Transaction has been confirmed on the blockchain.',
                    duration: 5000, // Auto-close after 5 seconds
                });
                
                // Refresh balances after confirmation
                this.refreshTokens();
                
            } else if (status === 'failed') {
                UINotification({
                    icon: window.icons['warning.svg'],
                    title: 'Transaction Failed',
                    text: error || 'The transaction failed on the blockchain.',
                    duration: 5000, // Auto-close after 5 seconds
                });
                
            } else if (status === 'timeout') {
                UINotification({
                    icon: window.icons['info.svg'],
                    title: 'Status Check Timeout',
                    text: message || 'Could not confirm transaction status. Please check your wallet.',
                    duration: 5000, // Auto-close after 5 seconds
                });
            }
        }).catch(err => {
            logger.error('Failed to show notification:', err);
        });
        
        // Trigger event for any listeners
        $(document).trigger('wallet:transaction:status', [payload]);
    }
    
    /**
     * Handle error responses
     */
    _handleError(payload, requestId) {
        const resolver = this.pendingRequests.get(requestId);
        if (resolver) {
            this.pendingRequests.delete(requestId);
            resolver.reject(new Error(payload.message || 'Unknown error'));
        }
        
        this.walletData.error = payload.message;
        this.walletData.isLoading = false;
        this._notifyListeners();
    }
    
    /**
     * Create or get the hidden particle-auth iframe for wallet operations
     */
    _getOrCreateIframe() {
        let iframe = document.getElementById('particle-wallet-iframe');
        
        if (!iframe) {
            // Create a hidden iframe for wallet operations
            iframe = document.createElement('iframe');
            iframe.id = 'particle-wallet-iframe';
            
            // Pass user addresses via URL params so iframe can initialize UniversalAccount
            // without needing to restore the ConnectKit session
            const eoaAddress = window.user?.wallet_address || '';
            const smartAddress = window.user?.smart_account_address || '';
            const params = new URLSearchParams({
                mode: 'wallet',
                ...(eoaAddress && { address: eoaAddress }),
                ...(smartAddress && { smartAddress: smartAddress }),
                // Cache-busting timestamp to force fresh load
                _t: Date.now().toString(),
            });
            
            iframe.src = `/particle-auth?${params.toString()}`;
            iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;visibility:hidden;';
            document.body.appendChild(iframe);
            
            logger.log('Created hidden particle-auth iframe with addresses:', {
                eoaAddress: eoaAddress ? `${eoaAddress.slice(0, 10)}...` : 'none',
                smartAddress: smartAddress ? `${smartAddress.slice(0, 10)}...` : 'none',
            });
            
            // Mark that we need to wait for iframe to load
            this._iframeReady = false;
            iframe.onload = () => {
                logger.log('Particle iframe loaded');
                this._iframeReady = true;
            };
        }
        
        return iframe;
    }
    
    /**
     * Send a request to the particle-auth iframe
     */
    _sendToIframe(type, data = {}) {
        const requestId = ++this.requestId;
        const iframe = this._getOrCreateIframe();
        
        if (!iframe) {
            logger.warn('Could not create particle auth iframe');
            return Promise.reject(new Error('Wallet not connected'));
        }
        
        return new Promise((resolve, reject) => {
            // Set timeout for request
            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error('Request timeout'));
            }, 30000);
            
            this.pendingRequests.set(requestId, {
                resolve: (data) => {
                    clearTimeout(timeoutId);
                    resolve(data);
                },
                reject: (error) => {
                    clearTimeout(timeoutId);
                    reject(error);
                },
            });
            
            // Wait for iframe to be ready before sending message
            const sendMessage = () => {
                if (iframe.contentWindow) {
                    logger.log('Sending message to iframe:', type);
                    iframe.contentWindow.postMessage({
                        type,
                        requestId,
                        payload: data,
                    }, '*');
                } else {
                    logger.warn('iframe contentWindow not available');
                    this.pendingRequests.delete(requestId);
                    reject(new Error('iframe not ready'));
                }
            };
            
            // If iframe not ready, wait for ready signal or timeout
            if (!this._iframeReady) {
                logger.log('Waiting for iframe to be ready...');
                // Poll for ready state
                let attempts = 0;
                const maxAttempts = 30; // 15 seconds max
                const checkReady = setInterval(() => {
                    attempts++;
                    if (this._iframeReady) {
                        clearInterval(checkReady);
                        sendMessage();
                    } else if (attempts >= maxAttempts) {
                        clearInterval(checkReady);
                        logger.warn('Timeout waiting for iframe ready');
                        this.pendingRequests.delete(requestId);
                        reject(new Error('Wallet not ready - please ensure you are logged in'));
                    }
                }, 500);
            } else {
                sendMessage();
            }
        });
    }
    
    /**
     * Calculate total balance in USD from tokens
     */
    _calculateTotalBalance(tokens) {
        return tokens.reduce((total, token) => {
            return total + (parseFloat(token.usdValue) || 0);
        }, 0);
    }
    
    /**
     * Notify all registered listeners of data changes
     */
    _notifyListeners() {
        // Get the correct data based on current mode
        const data = this.getData();
        
        logger.log('Notifying', this.listeners.size, 'listeners with data:', {
            mode: this.walletMode,
            totalBalance: data.totalBalance,
            tokensCount: data.tokens?.length,
        });
        
        // Add mode to the data for UI awareness
        const dataWithMode = {
            ...data,
            mode: this.walletMode,
            address: this.getAddress(),
        };
        
        this.listeners.forEach(callback => {
            try {
                callback(dataWithMode);
            } catch (e) {
                logger.error('Listener error:', e);
            }
        });
    }
    
    /**
     * Subscribe to wallet data updates
     * @param {Function} callback - Function to call on updates
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
        this.listeners.add(callback);
        
        // Immediately call with current data if available
        if (this.walletData.lastUpdated) {
            callback(this.walletData);
        }
        
        // Return unsubscribe function
        return () => this.listeners.delete(callback);
    }
    
    /**
     * Get wallet address (Smart Account preferred)
     */
    /**
     * Get wallet address based on current mode
     * - Universal mode: Smart Account address (multi-chain)
     * - Elastos mode: EOA address
     */
    getAddress() {
        if (!window.user) return null;
        
        if (this.walletMode === 'elastos') {
            return window.user.wallet_address; // EOA for Elastos
        }
        return window.user.smart_account_address || window.user.wallet_address; // UA preferred
    }
    
    /**
     * Get EOA address (always returns EOA regardless of mode)
     */
    getEOAAddress() {
        return window.user?.wallet_address || null;
    }
    
    /**
     * Get Smart Account address (always returns UA regardless of mode)
     */
    getSmartAccountAddress() {
        return window.user?.smart_account_address || null;
    }
    
    /**
     * Get Solana Smart Account address
     */
    getSolanaAddress() {
        return window.user?.solana_smart_account_address || null;
    }
    
    /**
     * Check if wallet is connected
     */
    isConnected() {
        return !!(window.user?.wallet_address);
    }
    
    /**
     * Get current wallet data based on mode
     */
    getData() {
        if (this.walletMode === 'elastos') {
            return this.elastosData;
        }
        return this.walletData;
    }
    
    /**
     * Get tokens based on current mode
     */
    getTokens() {
        return this.getData().tokens;
    }
    
    /**
     * Initialize wallet connection (create iframe if user is logged in)
     * Call this early in app initialization if user has a wallet
     */
    initialize() {
        if (this.isConnected()) {
            logger.log('User has wallet, initializing iframe...');
            this._getOrCreateIframe();
            // Don't auto-fetch on init - let sidebar trigger it when opened
        }
    }
    
    /**
     * Wait for iframe to be ready (for use after login)
     */
    async waitForReady(timeout = 10000) {
        if (this._iframeReady) return true;
        
        return new Promise((resolve) => {
            const startTime = Date.now();
            const checkReady = setInterval(() => {
                if (this._iframeReady) {
                    clearInterval(checkReady);
                    resolve(true);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(checkReady);
                    resolve(false);
                }
            }, 100);
        });
    }
    
    /**
     * Check if using Universal Account
     */
    isUniversalAccount() {
        return window.user?.auth_type === 'universalx';
    }
    
    /**
     * Get transaction history based on mode
     */
    getTransactions() {
        return this.getData().transactions;
    }
    
    /**
     * Get total balance in USD based on mode
     */
    getTotalBalance() {
        return this.getData().totalBalance;
    }
    
    /**
     * Refresh token balances from Universal Account
     */
    async refreshTokens() {
        if (!this.isConnected()) {
            return Promise.reject(new Error('Wallet not connected'));
        }
        
        // Route to appropriate fetch method based on mode
        if (this.walletMode === 'elastos') {
            return this._fetchElastosTokens();
        }
        
        return this._fetchUniversalTokens();
    }
    
    /**
     * Fetch tokens for Universal Account mode (multi-chain)
     * Uses Particle's Universal Account API via iframe as PRIMARY method
     */
    async _fetchUniversalTokens() {
        this.walletData.isLoading = true;
        this._notifyListeners();
        
        logger.log('Fetching Universal Account tokens via Particle API...');
        
        // PRIMARY METHOD: Use Particle iframe (Universal Account's getPrimaryAssets)
        // This returns aggregated balances across ALL chains in one call
        try {
            const result = await Promise.race([
                this._sendToIframe('particle-wallet.get-tokens', {
                    address: this.getAddress(),
                }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('iframe timeout')), 15000)
                )
            ]);
            
            logger.log('Particle API returned:', result);
            
            // Update wallet data from Particle response
            if (result && result.tokens) {
                this.walletData.tokens = result.tokens;
                this.walletData.totalBalance = result.totalBalance || this._calculateTotalBalance(result.tokens);
                this.walletData.lastUpdated = Date.now();
                this.walletData.isLoading = false;
                this.walletData.error = null;
                
                this._notifyListeners();
                $(document).trigger('wallet:data:updated', [this.walletData]);
            }
            
            return result;
        } catch (iframeError) {
            logger.warn('Particle API failed:', iframeError.message);
            
            // Don't use direct RPC fallback - it causes rate limiting
            // Just show empty state and let user retry manually
            this.walletData.isLoading = false;
            this.walletData.error = 'Unable to fetch balances. Please refresh.';
            this._notifyListeners();
            
            return { tokens: [], totalBalance: 0 };
        }
    }
    
    /**
     * Fetch ELA balance for Elastos mode
     */
    async _fetchElastosTokens() {
        const address = this.getEOAAddress(); // Always use EOA for Elastos
        if (!address) return { tokens: [], totalBalance: 0 };
        
        this.elastosData.isLoading = true;
        this._notifyListeners();
        
        logger.log('Fetching Elastos ELA for EOA:', address);
        
        try {
            // Elastos Mainnet RPC
            const rpcUrl = 'https://api.elastos.io/eth';
            
            // Fetch native ELA balance
            const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_getBalance',
                    params: [address, 'latest'],
                    id: 1,
                }),
            });
            
            const data = await response.json();
            const tokens = [];
            
            if (!data.error && data.result) {
                const balanceWei = BigInt(data.result || '0');
                const balanceEla = Number(balanceWei) / 1e18;
                
                // Get ELA price (approximate)
                const elaPrice = await this._getTokenPrice('ELA');
                
                tokens.push({
                    symbol: 'ELA',
                    name: 'Elastos',
                    address: null, // Native token
                    balance: balanceEla.toFixed(6),
                    decimals: 18,
                    chainId: 20, // Elastos ESC chain ID
                    network: 'Elastos',
                    usdValue: balanceEla * elaPrice,
                    price: elaPrice,
                    icon: null, // Will use default
                });
            }
            
            // Update Elastos data
            this.elastosData.tokens = tokens;
            this.elastosData.totalBalance = this._calculateTotalBalance(tokens);
            this.elastosData.lastUpdated = Date.now();
            this.elastosData.isLoading = false;
            this.elastosData.error = null;
            
            this._notifyListeners();
            $(document).trigger('wallet:data:updated', [this.elastosData]);
            
            logger.log('Elastos ELA balance:', tokens);
            return { tokens, totalBalance: this.elastosData.totalBalance };
        } catch (error) {
            logger.error('Elastos fetch error:', error);
            this.elastosData.isLoading = false;
            this.elastosData.error = error.message;
            this._notifyListeners();
            throw error;
        }
    }
    
    /**
     * Fetch transaction history for Elastos EOA from blockchain explorer
     */
    async _fetchElastosTransactions(page = 1, pageSize = 20) {
        logger.log('_fetchElastosTransactions CALLED, page:', page);
        
        const address = this.getEOAAddress();
        logger.log('EOA Address for Elastos:', address);
        
        if (!address) {
            logger.log('No EOA address for Elastos transactions');
            return { transactions: [], hasMore: false };
        }
        
        logger.log('Fetching Elastos transactions for:', address);
        
        try {
            // Use our backend proxy to bypass CORS issues with esc.elastos.io
            // (Their API returns duplicate Access-Control-Allow-Origin headers)
            const apiUrl = `${window.api_origin}/api/elastos/transactions?address=${address}&page=${page}&pageSize=${pageSize}`;
            
            logger.log('Elastos API URL (via proxy):', apiUrl);
            
            const response = await fetch(apiUrl);
            const data = await response.json();
            
            logger.log('Elastos API response status:', data.status, 'result count:', data.result?.length);
            
            if (data.status !== '1' || !data.result) {
                logger.log('No Elastos transactions found or API error:', data.message);
                this.elastosData.transactions = [];
                this._notifyListeners();
                return { transactions: [], hasMore: false };
            }
            
            // Transform to our transaction format
            const transactions = data.result.map(tx => {
                const isOutgoing = tx.from.toLowerCase() === address.toLowerCase();
                const value = Number(tx.value) / 1e18; // Convert from wei
                const gasUsed = Number(tx.gasUsed || tx.gas || 0);
                const gasPrice = Number(tx.gasPrice || 0);
                const fee = (gasUsed * gasPrice) / 1e18;
                
                return {
                    transactionId: tx.hash,
                    hash: tx.hash,
                    type: isOutgoing ? 'send' : 'receive',
                    status: tx.txreceipt_status === '1' ? 'confirmed' : (tx.isError === '1' ? 'failed' : 'pending'),
                    createdAt: new Date(Number(tx.timeStamp) * 1000).toISOString(),
                    timestamp: Number(tx.timeStamp) * 1000,
                    from: tx.from,
                    to: tx.to,
                    amount: value.toFixed(6),
                    amountUSD: null, // Would need price lookup
                    fee: fee.toFixed(6),
                    feeUSD: null,
                    chainId: 20,
                    network: 'Elastos Smart Chain',
                    networkIcon: '/images/tokens/ELA.png',
                    // Include symbol at top level for renderHistoryList
                    symbol: 'ELA',
                    tokenIcon: '/images/tokens/ELA.png',
                    token: {
                        symbol: 'ELA',
                        name: 'Elastos',
                        decimals: 18,
                        address: null,
                    },
                    blockNumber: Number(tx.blockNumber),
                    explorerUrl: `https://esc.elastos.io/tx/${tx.hash}`,
                };
            });
            
            logger.log('Elastos transactions parsed:', transactions.length);
            
            // Update elastosData
            if (page === 1) {
                this.elastosData.transactions = transactions;
            } else {
                this.elastosData.transactions = [
                    ...this.elastosData.transactions,
                    ...transactions,
                ];
            }
            this.elastosData.hasMoreTransactions = transactions.length >= pageSize;
            this.elastosData.transactionsPage = page;
            
            logger.log('elastosData.transactions now has:', this.elastosData.transactions.length, 'items');
            logger.log('First transaction:', this.elastosData.transactions[0]);
            
            this._notifyListeners();
            
            // Also trigger the jQuery event for transactions
            $(document).trigger('wallet:transactions:updated', [this.elastosData.transactions]);
            
            return { 
                transactions, 
                hasMore: transactions.length >= pageSize,
                totalCount: data.result.length 
            };
            
        } catch (error) {
            logger.error('Elastos transactions fetch error:', error);
            this.elastosData.transactions = [];
            this._notifyListeners();
            return { transactions: [], hasMore: false };
        }
    }
    
    /**
     * Fetch tokens directly using Particle's Enhanced RPC API
     * This is a fallback when iframe communication fails
     */
    async _fetchTokensDirectly() {
        const address = this.getAddress();
        if (!address) return [];
        
        logger.log('Fetching tokens directly for:', address);
        
        // Major chains to check (with Particle chainIds)
        const chains = [
            { chainId: 1, name: 'Ethereum', symbol: 'ETH' },
            { chainId: 8453, name: 'Base', symbol: 'ETH' },
            { chainId: 137, name: 'Polygon', symbol: 'MATIC' },
            { chainId: 56, name: 'BSC', symbol: 'BNB' },
            { chainId: 42161, name: 'Arbitrum', symbol: 'ETH' },
            { chainId: 10, name: 'Optimism', symbol: 'ETH' },
        ];
        
        const allTokens = [];
        
        // Fetch from multiple chains in parallel
        const results = await Promise.allSettled(
            chains.map(chain => this._fetchChainTokens(address, chain))
        );
        
        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                allTokens.push(...result.value);
            } else {
                console.warn(`[WalletService]: Failed to fetch from ${chains[index].name}`);
            }
        });
        
        // Update wallet data
        this.walletData.tokens = allTokens;
        this.walletData.totalBalance = this._calculateTotalBalance(allTokens);
        this.walletData.lastUpdated = Date.now();
        this.walletData.isLoading = false;
        window.wallet_data = this.walletData;
        
        this._notifyListeners();
        $(document).trigger('wallet:data:updated', [this.walletData]);
        
        logger.log('Fetched tokens:', allTokens);
        return allTokens;
    }
    
    /**
     * Fetch tokens for a specific chain (native + common stablecoins)
     */
    async _fetchChainTokens(address, chain) {
        const tokens = [];
        const rpcUrl = this._getPublicRpcUrl(chain.chainId);
        if (!rpcUrl) return [];
        
        try {
            // 1. Fetch native token balance
            const nativeResponse = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_getBalance',
                    params: [address, 'latest'],
                    id: 1,
                }),
            });
            
            const nativeData = await nativeResponse.json();
            if (!nativeData.error) {
                const balanceWei = BigInt(nativeData.result || '0');
                const balanceEth = Number(balanceWei) / 1e18;
                
                if (balanceEth > 0.0001) {
                    const price = await this._getTokenPrice(chain.symbol);
                    tokens.push({
                        symbol: chain.symbol,
                        name: chain.name,
                        address: null,
                        balance: balanceEth.toFixed(6),
                        decimals: 18,
                        chainId: chain.chainId,
                        network: chain.name,
                        usdValue: balanceEth * price,
                        price: price,
                    });
                }
            }
            
            // 2. Fetch common stablecoin balances (USDC, USDT)
            const stablecoins = this._getStablecoinAddresses(chain.chainId);
            for (const stable of stablecoins) {
                try {
                    const balance = await this._getERC20Balance(rpcUrl, address, stable.address, stable.decimals);
                    if (balance > 0.01) {
                        tokens.push({
                            symbol: stable.symbol,
                            name: stable.name,
                            address: stable.address,
                            balance: balance.toFixed(stable.decimals > 6 ? 6 : 2),
                            decimals: stable.decimals,
                            chainId: chain.chainId,
                            network: chain.name,
                            usdValue: balance, // Stablecoins are ~$1
                            price: 1,
                        });
                    }
                } catch (e) {
                    // Ignore individual token errors
                }
            }
            
            return tokens;
        } catch (error) {
            console.warn(`[WalletService]: Error fetching ${chain.name}:`, error);
            return [];
        }
    }
    
    /**
     * Get ERC-20 token balance
     */
    async _getERC20Balance(rpcUrl, walletAddress, tokenAddress, decimals) {
        // balanceOf(address) function selector: 0x70a08231
        const data = '0x70a08231' + walletAddress.toLowerCase().replace('0x', '').padStart(64, '0');
        
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_call',
                params: [{ to: tokenAddress, data }, 'latest'],
                id: 1,
            }),
        });
        
        const result = await response.json();
        if (result.error || !result.result || result.result === '0x') return 0;
        
        const balanceWei = BigInt(result.result);
        return Number(balanceWei) / Math.pow(10, decimals);
    }
    
    /**
     * Get stablecoin addresses for a chain
     */
    _getStablecoinAddresses(chainId) {
        const stablecoins = {
            // Base (chainId 8453)
            8453: [
                { symbol: 'USDC', name: 'USD Coin', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
                { symbol: 'USDbC', name: 'USD Base Coin', address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', decimals: 6 },
            ],
            // Ethereum (chainId 1)
            1: [
                { symbol: 'USDC', name: 'USD Coin', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
                { symbol: 'USDT', name: 'Tether USD', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
            ],
            // Polygon (chainId 137)
            137: [
                { symbol: 'USDC', name: 'USD Coin', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6 },
                { symbol: 'USDT', name: 'Tether USD', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
            ],
            // BSC (chainId 56)
            56: [
                { symbol: 'USDC', name: 'USD Coin', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
                { symbol: 'USDT', name: 'Tether USD', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
            ],
            // Arbitrum (chainId 42161)
            42161: [
                { symbol: 'USDC', name: 'USD Coin', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
                { symbol: 'USDT', name: 'Tether USD', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
            ],
            // Optimism (chainId 10)
            10: [
                { symbol: 'USDC', name: 'USD Coin', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
                { symbol: 'USDT', name: 'Tether USD', address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 },
            ],
        };
        return stablecoins[chainId] || [];
    }
    
    /**
     * Get public RPC URL for a chain
     */
    _getPublicRpcUrl(chainId) {
        const rpcs = {
            1: 'https://eth.llamarpc.com',
            8453: 'https://mainnet.base.org',
            137: 'https://polygon-rpc.com',
            56: 'https://bsc-dataseed.binance.org',
            42161: 'https://arb1.arbitrum.io/rpc',
            10: 'https://mainnet.optimism.io',
        };
        return rpcs[chainId];
    }
    
    /**
     * Get approximate token price in USD
     */
    async _getTokenPrice(symbol) {
        try {
            // Use CoinGecko's simple price API
            const ids = {
                'ETH': 'ethereum',
                'MATIC': 'matic-network',
                'BNB': 'binancecoin',
                'ELA': 'elastos',
            };
            
            const id = ids[symbol];
            if (!id) return 0;
            
            const response = await fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
            );
            const data = await response.json();
            return data[id]?.usd || 0;
        } catch (error) {
            logger.warn('Price fetch failed:', error);
            // Fallback prices
            const fallbackPrices = { 'ETH': 2000, 'MATIC': 0.5, 'BNB': 300, 'ELA': 1.5 };
            return fallbackPrices[symbol] || 0;
        }
    }
    
    /**
     * Refresh transaction history
     * @param {number} page - Page number (default 1)
     * @param {number} pageSize - Items per page (default 20)
     */
    async refreshTransactions(page = 1, pageSize = 20) {
        if (!this.isConnected()) {
            return Promise.reject(new Error('Wallet not connected'));
        }
        
        // Route to appropriate fetch method based on mode
        if (this.walletMode === 'elastos') {
            return this._fetchElastosTransactions(page, pageSize);
        }
        
        try {
            logger.log('Fetching transactions:', { page, pageSize });
            
            const result = await this._sendToIframe('particle-wallet.get-transactions', {
                address: this.getAddress(),
                page,
                pageSize,
            });
            
            logger.log('Transactions response:', result);
            
            // Update wallet data with transactions
            if (result && result.transactions) {
                if (page === 1) {
                    // Replace transactions for first page
                    this.walletData.transactions = result.transactions;
                } else {
                    // Append for subsequent pages
                    this.walletData.transactions = [
                        ...this.walletData.transactions,
                        ...result.transactions,
                    ];
                }
                this.walletData.hasMoreTransactions = result.hasMore;
                this.walletData.transactionsTotalCount = result.totalCount;
                this.walletData.transactionsPage = page;
            }
            
            this._notifyListeners();
            
            // Trigger specific event for transactions
            $(document).trigger('wallet:transactions:updated', [this.walletData.transactions]);
            
            return result;
        } catch (error) {
            logger.error('Failed to fetch transactions:', error);
            this.walletData.error = error.message;
            this._notifyListeners();
            throw error;
        }
    }
    
    /**
     * Load more transactions (next page)
     */
    async loadMoreTransactions() {
        const nextPage = (this.walletData.transactionsPage || 1) + 1;
        return this.refreshTransactions(nextPage, 20);
    }
    
    /**
     * Get transaction details with blockchain tx hash
     * @param {string} transactionId - Particle's internal transaction ID
     */
    async getTransactionDetails(transactionId) {
        if (!this.isConnected()) {
            return Promise.reject(new Error('Wallet not connected'));
        }
        
        try {
            const result = await this._sendToIframe('particle-wallet.get-transaction-details', {
                transactionId,
            });
            return result;
        } catch (error) {
            logger.error('Failed to get transaction details:', error);
            throw error;
        }
    }
    
    /**
     * Send tokens using Universal Account or Elastos EOA
     * @param {Object} params - Send parameters
     * @param {string} params.to - Recipient address
     * @param {string} params.amount - Amount to send (human readable, e.g. "0.5")
     * @param {string} params.tokenAddress - Token contract address (null for native)
     * @param {number} params.chainId - Target chain ID
     * @param {number} params.decimals - Token decimals (default 18)
     * @param {string} params.mode - Wallet mode: 'universal' or 'elastos'
     */
    async sendTokens({ to, amount, tokenAddress, chainId, decimals = 18, mode }) {
        if (!this.isConnected()) {
            return Promise.reject(new Error('Wallet not connected'));
        }
        
        // Use current mode if not specified
        const walletMode = mode || this.walletMode;
        
        // ============================================
        // ELASTOS EOA MODE: Use window.ethereum directly (MetaMask)
        // NOT through Particle iframe!
        // ============================================
        if (walletMode === 'elastos' && chainId === 20) {
            logger.log('Using Elastos EOA mode - direct MetaMask transaction');
            return this._sendElastosEOATransaction({ to, amount, tokenAddress, decimals });
        }
        
        // Universal Account mode: Use Particle iframe
        return this._sendToIframe('particle-wallet.send', {
            from: this.getAddress(),
            to,
            amount,
            tokenAddress,
            chainId,
            decimals,
            mode: walletMode,
        });
    }
    
    /**
     * Send transaction via Elastos EOA using ethereum provider (MetaMask)
     * This bypasses Particle entirely and uses the user's external wallet
     * @param {Object} params - Transaction parameters
     * @param {string} params.to - Recipient address  
     * @param {string} params.amount - Amount to send
     * @param {string} [params.tokenAddress] - Token contract (null for native ELA)
     * @param {number} [params.decimals=18] - Token decimals
     * @returns {Promise<{success: boolean, hash: string, status: string, isElastosEOA: boolean}>}
     */
    async _sendElastosEOATransaction({ to, amount, tokenAddress, decimals = 18 }) {
        // Use safe provider accessor instead of window.ethereum
        const provider = getEthereumProvider();
        
        if (!provider) {
            throw new Error('No Ethereum wallet detected. Please install MetaMask to use Elastos EOA.');
        }
        
        // EOA address is the user's wallet address (from Particle auth)
        const fromAddress = window.user?.wallet_address || this.getAddress();
        
        if (!fromAddress) {
            throw new Error('EOA address not available. Please reconnect your wallet.');
        }
        
        logger.log('Using EOA address for Elastos:', fromAddress);
        
        try {
            // Step 1: Switch to Elastos Smart Chain using helper
            logger.log('Switching to Elastos Smart Chain...');
            await switchToElastos();
            
            // Step 2: Build transaction
            const amountStr = String(amount);
            const amountInWei = BigInt(Math.floor(parseFloat(amountStr) * Math.pow(10, decimals))).toString(16);
            
            let txParams;
            const isNativeELA = !tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000';
            
            if (isNativeELA) {
                // Native ELA transfer
                txParams = {
                    from: fromAddress,
                    to: to,
                    value: '0x' + amountInWei,
                };
                logger.log('Sending native ELA:', txParams);
            } else {
                // ERC-20 token transfer
                const recipientPadded = to.toLowerCase().replace('0x', '').padStart(64, '0');
                const amountHex = BigInt(Math.floor(parseFloat(amountStr) * Math.pow(10, decimals))).toString(16).padStart(64, '0');
                txParams = {
                    from: fromAddress,
                    to: tokenAddress, // ERC-20 contract address
                    value: '0x0',
                    data: '0xa9059cbb' + recipientPadded + amountHex, // transfer(address,uint256)
                };
                logger.log('Sending ERC-20 token:', txParams);
            }
            
            // Step 3: Estimate gas and add buffer for Elastos chain
            try {
                const gasEstimate = await estimateGas(txParams);
                // Add 20% buffer for safety
                const gasWithBuffer = Math.ceil(parseInt(gasEstimate, 16) * 1.2);
                txParams.gas = '0x' + gasWithBuffer.toString(16);
                logger.log('Gas estimate with buffer:', txParams.gas);
            } catch (gasError) {
                // If gas estimation fails, use a safe default for ELA transfers
                logger.warn('Gas estimation failed, using default:', gasError.message);
                txParams.gas = isNativeELA ? '0x5208' : '0x15F90'; // 21000 for native, 90000 for ERC-20
            }
            
            // Step 4: Send transaction via ethereum provider helper
            const txHash = await sendEthTransaction(txParams);
            
            logger.log('Elastos EOA transaction sent:', txHash);
            
            // Notify listeners of success
            this._notifyListeners();
            
            return {
                success: true,
                hash: txHash,
                status: 'pending',
                isElastosEOA: true,
            };
            
        } catch (error) {
            logger.error('Elastos EOA transaction failed:', error);
            throw error;
        }
    }
    
    /**
     * Estimate gas fee for a transaction
     * @param {Object} params - Transaction parameters
     */
    async estimateFee({ to, amount, tokenAddress, chainId, decimals = 18 }) {
        if (!this.isConnected()) {
            return Promise.reject(new Error('Wallet not connected'));
        }
        
        return this._sendToIframe('particle-wallet.estimate-fee', {
            from: this.getAddress(),
            to,
            amount,
            tokenAddress,
            chainId,
            decimals,
        });
    }
    
    /**
     * Start periodic polling for wallet data
     * @param {number} interval - Polling interval in ms (default 30s)
     */
    startPolling(interval = 30000) {
        if (this.pollInterval) return;
        
        // Initial fetch
        this.refreshTokens().catch(() => {});
        this.refreshTransactions().catch(() => {});
        
        // Set up polling
        this.pollInterval = setInterval(() => {
            this.refreshTokens().catch(() => {});
        }, interval);
    }
    
    /**
     * Stop periodic polling
     */
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
    
    /**
     * Cleanup service
     */
    destroy() {
        this.stopPolling();
        
        if (this.messageHandler) {
            window.removeEventListener('message', this.messageHandler);
            this.messageHandler = null;
        }
        
        // Remove the iframe so a fresh one is created for the next user
        this._destroyIframe();
        
        this.listeners.clear();
        this.pendingRequests.clear();
        
        // Reset cached data
        this.walletData = {
            tokens: [],
            transactions: [],
            totalBalance: 0,
            lastUpdated: null,
            isLoading: false,
            error: null,
        };
        this.elastosData = {
            tokens: [],
            transactions: [],
            totalBalance: 0,
            lastUpdated: null,
            isLoading: false,
            error: null,
        };
        this._iframeReady = false;
    }
    
    /**
     * Destroy the particle-auth iframe (called on logout)
     */
    _destroyIframe() {
        const iframe = document.getElementById('particle-wallet-iframe');
        if (iframe) {
            logger.log('Destroying particle-wallet-iframe');
            iframe.remove();
        }
        this._iframeReady = false;
    }
    
    /**
     * Reinitialize for a new user (call after login with different wallet)
     */
    reinitialize() {
        logger.log('Reinitializing for new user:', window.user?.wallet_address);
        this._destroyIframe();
        this._iframeReady = false;
        
        // Reset data caches
        this.walletData = {
            tokens: [],
            transactions: [],
            totalBalance: 0,
            lastUpdated: null,
            isLoading: false,
            error: null,
        };
        this.elastosData = {
            tokens: [],
            transactions: [],
            totalBalance: 0,
            lastUpdated: null,
            isLoading: false,
            error: null,
        };
        
        // Create new iframe with current user's addresses
        if (this.isConnected()) {
            this._getOrCreateIframe();
        }
    }
}

// Create singleton instance
const walletService = new WalletService();

// Expose on window for global access (needed for update_auth_data)
window.walletService = walletService;

// Export singleton
export default walletService;

