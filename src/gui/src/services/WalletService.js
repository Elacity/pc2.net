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

/**
 * WalletService - Manages wallet data communication with Particle Network
 * 
 * This service handles:
 * - Fetching token balances from Universal Account
 * - Fetching transaction history
 * - Caching wallet data for performance
 * - Communication with particle-auth iframe
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
            console.error('[WalletService]: Invalid mode:', mode);
            return;
        }
        
        const previousMode = this.walletMode;
        this.walletMode = mode;
        
        console.log('[WalletService]: Mode changed from', previousMode, 'to', mode);
        
        // Notify listeners of mode change
        this._notifyListeners();
        
        // Refresh data for new mode
        await this.refreshTokens();
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
                    console.log('[WalletService]: Particle wallet ready signal received', payload);
                    this._iframeReady = true;
                    // Automatically fetch data when ready
                    this.refreshTokens().catch(() => {});
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
                    this._handleSendResult(payload, requestId);
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
        console.log('[WalletService]: Received tokens response:', { 
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
            this.walletData.lastUpdated = Date.now();
            window.wallet_data = this.walletData;
            
            this._notifyListeners();
            $(document).trigger('wallet:transactions:updated', [this.walletData.transactions]);
            
            resolver.resolve(payload);
        }
    }
    
    /**
     * Handle send transaction result
     */
    _handleSendResult(payload, requestId) {
        const resolver = this.pendingRequests.get(requestId);
        if (resolver) {
            this.pendingRequests.delete(requestId);
            
            if (payload.success) {
                resolver.resolve(payload);
                // Refresh balances after successful send
                this.refreshTokens();
            } else {
                resolver.reject(new Error(payload.error || 'Transaction failed'));
            }
        }
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
            });
            
            iframe.src = `/particle-auth?${params.toString()}`;
            iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;visibility:hidden;';
            document.body.appendChild(iframe);
            
            console.log('[WalletService]: Created hidden particle-auth iframe with addresses:', {
                eoaAddress: eoaAddress ? `${eoaAddress.slice(0, 10)}...` : 'none',
                smartAddress: smartAddress ? `${smartAddress.slice(0, 10)}...` : 'none',
            });
            
            // Mark that we need to wait for iframe to load
            this._iframeReady = false;
            iframe.onload = () => {
                console.log('[WalletService]: Particle iframe loaded');
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
            console.warn('[WalletService]: Could not create particle auth iframe');
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
                    console.log('[WalletService]: Sending message to iframe:', type);
                    iframe.contentWindow.postMessage({
                        type,
                        requestId,
                        payload: data,
                    }, '*');
                } else {
                    console.warn('[WalletService]: iframe contentWindow not available');
                    this.pendingRequests.delete(requestId);
                    reject(new Error('iframe not ready'));
                }
            };
            
            // If iframe not ready, wait for ready signal or timeout
            if (!this._iframeReady) {
                console.log('[WalletService]: Waiting for iframe to be ready...');
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
                        console.warn('[WalletService]: Timeout waiting for iframe ready');
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
        
        console.log('[WalletService]: Notifying', this.listeners.size, 'listeners with data:', {
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
                console.error('[WalletService]: Listener error:', e);
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
            console.log('[WalletService]: User has wallet, initializing iframe...');
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
        
        console.log('[WalletService]: Fetching Universal Account tokens via Particle API...');
        
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
            
            console.log('[WalletService]: Particle API returned:', result);
            
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
            console.warn('[WalletService]: Particle API failed:', iframeError.message);
            
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
        
        console.log('[WalletService]: Fetching Elastos ELA for EOA:', address);
        
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
            
            console.log('[WalletService]: Elastos ELA balance:', tokens);
            return { tokens, totalBalance: this.elastosData.totalBalance };
        } catch (error) {
            console.error('[WalletService]: Elastos fetch error:', error);
            this.elastosData.isLoading = false;
            this.elastosData.error = error.message;
            this._notifyListeners();
            throw error;
        }
    }
    
    /**
     * Fetch tokens directly using Particle's Enhanced RPC API
     * This is a fallback when iframe communication fails
     */
    async _fetchTokensDirectly() {
        const address = this.getAddress();
        if (!address) return [];
        
        console.log('[WalletService]: Fetching tokens directly for:', address);
        
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
        
        console.log('[WalletService]: Fetched tokens:', allTokens);
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
            console.warn('[WalletService]: Price fetch failed:', error);
            // Fallback prices
            const fallbackPrices = { 'ETH': 2000, 'MATIC': 0.5, 'BNB': 300, 'ELA': 1.5 };
            return fallbackPrices[symbol] || 0;
        }
    }
    
    /**
     * Refresh transaction history
     */
    async refreshTransactions() {
        if (!this.isConnected()) {
            return Promise.reject(new Error('Wallet not connected'));
        }
        
        try {
            const result = await this._sendToIframe('particle-wallet.get-transactions', {
                address: this.getAddress(),
            });
            return result;
        } catch (error) {
            this.walletData.error = error.message;
            this._notifyListeners();
            throw error;
        }
    }
    
    /**
     * Send tokens using Universal Account
     * @param {Object} params - Send parameters
     * @param {string} params.to - Recipient address
     * @param {string} params.amount - Amount to send
     * @param {string} params.tokenAddress - Token contract address (null for native)
     * @param {number} params.chainId - Target chain ID
     */
    async sendTokens({ to, amount, tokenAddress, chainId }) {
        if (!this.isConnected()) {
            return Promise.reject(new Error('Wallet not connected'));
        }
        
        return this._sendToIframe('particle-wallet.send', {
            from: this.getAddress(),
            to,
            amount,
            tokenAddress,
            chainId,
        });
    }
    
    /**
     * Estimate gas fee for a transaction
     * @param {Object} params - Transaction parameters
     */
    async estimateFee({ to, amount, tokenAddress, chainId }) {
        if (!this.isConnected()) {
            return Promise.reject(new Error('Wallet not connected'));
        }
        
        return this._sendToIframe('particle-wallet.estimate-fee', {
            from: this.getAddress(),
            to,
            amount,
            tokenAddress,
            chainId,
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
        
        this.listeners.clear();
        this.pendingRequests.clear();
    }
}

// Create singleton instance
const walletService = new WalletService();

// Export singleton
export default walletService;

