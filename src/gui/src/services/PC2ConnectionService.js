/*
 * Copyright (C) 2024-present Elacity
 *
 * PC2 Connection Service
 * 
 * Manages secure WebSocket connections from the browser to the user's PC2 node.
 * Handles ownership claiming, authentication, and API proxying.
 */

import { createLogger } from '../helpers/logger.js';

const logger = createLogger('PC2');

/**
 * @typedef {Object} PC2Config
 * @property {string} nodeUrl - The PC2 node URL
 * @property {string} nodeName - Friendly name of the node
 * @property {boolean} isOwner - Whether current wallet is the owner
 * @property {'disconnected'|'connecting'|'connected'|'error'} status - Connection status
 */

/**
 * @typedef {Object} PC2Session
 * @property {string} token - Session token
 * @property {string} wallet - Connected wallet address
 * @property {string} nodeName - Node name
 */

class PC2ConnectionService {
    constructor() {
        /** @type {WebSocket|null} */
        this.ws = null;
        
        /** @type {PC2Config|null} */
        this.config = null;
        
        /** @type {PC2Session|null} */
        this.session = null;
        
        /** @type {'disconnected'|'connecting'|'connected'|'error'} */
        this.status = 'disconnected';
        
        /** @type {string|null} */
        this.lastError = null;
        
        /** @type {Map<string, Function>} */
        this.pendingRequests = new Map();
        
        /** @type {number} */
        this.requestCounter = 0;
        
        /** @type {Set<Function>} */
        this.statusListeners = new Set();
        
        /** @type {number|null} */
        this.reconnectTimer = null;
        
        /** @type {number} */
        this.reconnectAttempts = 0;
        
        /** @type {number} */
        this.maxReconnectAttempts = 5;
        
        // Load saved config from localStorage
        this._loadConfig();
    }

    /**
     * Get singleton instance
     * @returns {PC2ConnectionService}
     */
    static getInstance() {
        if (!PC2ConnectionService._instance) {
            PC2ConnectionService._instance = new PC2ConnectionService();
        }
        return PC2ConnectionService._instance;
    }

    /**
     * Load saved PC2 configuration from localStorage
     * @private
     */
    _loadConfig() {
        try {
            const saved = localStorage.getItem('pc2_config');
            if (saved) {
                this.config = JSON.parse(saved);
                logger.log('[PC2]: Loaded saved config:', this.config?.nodeUrl);
            }
            
            // Load saved session
            const savedSession = localStorage.getItem('pc2_session');
            if (savedSession) {
                const sessionData = JSON.parse(savedSession);
                // Check if session is still valid (7 days)
                const now = Date.now();
                const sessionAge = now - (sessionData.timestamp || 0);
                const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
                
                if (sessionAge < maxAge) {
                    this.session = sessionData.session;
                    logger.log('[PC2]: Loaded valid session, expires in', Math.round((maxAge - sessionAge) / (24 * 60 * 60 * 1000)), 'days');
                } else {
                    logger.log('[PC2]: Saved session expired');
                    localStorage.removeItem('pc2_session');
                }
            }
        } catch (e) {
            logger.error('[PC2]: Failed to load config:', e);
        }
    }

    /**
     * Save PC2 configuration to localStorage
     * @private
     */
    _saveConfig() {
        try {
            if (this.config) {
                localStorage.setItem('pc2_config', JSON.stringify(this.config));
            } else {
                localStorage.removeItem('pc2_config');
            }
            
            // Save session with timestamp
            if (this.session) {
                localStorage.setItem('pc2_session', JSON.stringify({
                    session: this.session,
                    timestamp: Date.now()
                }));
            } else {
                localStorage.removeItem('pc2_session');
            }
        } catch (e) {
            logger.error('[PC2]: Failed to save config:', e);
        }
    }

    /**
     * Add a status change listener
     * @param {Function} callback - Called with (status, error)
     * @returns {Function} Unsubscribe function
     */
    onStatusChange(callback) {
        this.statusListeners.add(callback);
        // Immediately call with current status
        callback(this.status, this.lastError);
        return () => this.statusListeners.delete(callback);
    }

    /**
     * Notify all status listeners
     * @private
     */
    _notifyStatusChange() {
        for (const listener of this.statusListeners) {
            try {
                listener(this.status, this.lastError);
            } catch (e) {
                logger.error('[PC2]: Status listener error:', e);
            }
        }
    }

    /**
     * Set connection status
     * @param {'disconnected'|'connecting'|'connected'|'error'} status
     * @param {string|null} error
     * @private
     */
    _setStatus(status, error = null) {
        this.status = status;
        this.lastError = error;
        this._notifyStatusChange();
    }

    /**
     * Check if PC2 is configured
     * @returns {boolean}
     */
    isConfigured() {
        return !!this.config?.nodeUrl;
    }

    /**
     * Check if connected to PC2
     * @returns {boolean}
     */
    isConnected() {
        return this.status === 'connected';
    }
    
    /**
     * Get PC2 node stats
     * @returns {Promise<Object>}
     */
    async getStats() {
        if (!this.config?.nodeUrl) {
            throw new Error('No PC2 node configured');
        }
        
        try {
            const url = new URL('/api/stats', this.config.nodeUrl);
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
            
            if (response.ok) {
                return response.json();
            }
        } catch (e) {
            logger.error('[PC2]: Failed to get stats:', e);
        }
        
        return null;
    }
    
    /**
     * Authenticate with an existing PC2 node (not owner)
     * @param {string} nodeUrl - The PC2 node URL
     * @param {boolean} useStoredSession - Try to use stored session first
     * @returns {Promise<{success: boolean, sessionToken: string}>}
     */
    async authenticate(nodeUrl, useStoredSession = true) {
        const walletAddress = window.user?.wallet_address;
        if (!walletAddress) {
            throw new Error('Wallet not connected');
        }

        // Try to use stored session first if requested
        if (useStoredSession && this.session?.token) {
            logger.log('[PC2]: Attempting to use stored session, token:', this.session.token.substring(0, 8) + '...');
            
            // Verify session is still valid
            try {
                const url = new URL('/api/auth/verify', nodeUrl);
                const response = await fetch(url.toString(), {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.session.token}`
                    },
                    body: JSON.stringify({ walletAddress }),
                });

                logger.log('[PC2]: Session verify response:', response.status);
                
                if (response.ok) {
                    const result = await response.json();
                    logger.log('[PC2]: Session verify result:', result);
                    if (result.valid) {
                        logger.log('[PC2]: ✅ Stored session is valid, skipping signature!');
                        this.config = {
                            nodeUrl,
                            nodeName: result.nodeName || this.session.nodeName || 'PC2 Node',
                            isOwner: result.isOwner || false,
                            status: 'connected',
                        };
                        this._setStatus('connected');
                        return { success: true, sessionToken: this.session.token };
                    } else {
                        logger.log('[PC2]: Session marked as invalid by server');
                    }
                } else {
                    logger.log('[PC2]: Session verify failed with status:', response.status);
                }
            } catch (e) {
                logger.log('[PC2]: Session verification error:', e);
            }
        } else {
            logger.log('[PC2]: No stored session to use, useStoredSession:', useStoredSession, 'has token:', !!this.session?.token);
        }

        // Need to sign new message
        logger.log('[PC2]: Requesting new signature for authentication');
        const nonce = Date.now().toString();
        const message = JSON.stringify({
            action: 'authenticate',
            nodeUrl: nodeUrl,
            nonce,
            timestamp: Date.now(),
        });

        const signature = await this._signMessage(message);

        const url = new URL('/api/auth', nodeUrl);
        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                walletAddress,
                signature,
                message,
                nonce,
            }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Authentication failed');
        }

        // Save config and session
        this.config = {
            nodeUrl,
            nodeName: result.nodeName || 'PC2 Node',
            isOwner: result.isOwner || false,
            status: 'connected',
        };
        this.session = {
            token: result.sessionToken,
            wallet: walletAddress,
            nodeName: result.nodeName,
        };
        this._saveConfig();
        this._setStatus('connected');

        logger.log('[PC2]: Authenticated successfully with new session');
        return result;
    }

    /**
     * Get the current PC2 node URL
     * @returns {string|null}
     */
    getNodeUrl() {
        return this.config?.nodeUrl || null;
    }

    /**
     * Get the current session
     * @returns {PC2Session|null}
     */
    getSession() {
        return this.session;
    }

    /**
     * Check PC2 node status (no auth required)
     * @param {string} nodeUrl - The PC2 node URL to check
     * @returns {Promise<{status: string, nodeName: string, hasOwner: boolean}>}
     */
    async checkNodeStatus(nodeUrl) {
        // Try /api/info first (mock server), then /pc2/status (full server)
        const endpoints = ['/api/info', '/api/health', '/pc2/status'];
        
        for (const endpoint of endpoints) {
            try {
                const url = new URL(endpoint, nodeUrl);
                const response = await fetch(url.toString(), {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                });

                if (response.ok) {
                    const data = await response.json();
                    return {
                        status: data.status || data.node_status || 'unknown',
                        nodeName: data.name || data.node_name || 'PC2 Node',
                        hasOwner: data.hasOwner || data.status === 'ACTIVE',
                    };
                }
            } catch (e) {
                // Try next endpoint
                continue;
            }
        }
        
        throw new Error('Failed to connect to PC2 node');
    }

    /**
     * Claim ownership of a PC2 node (first-time setup)
     * @param {string} nodeUrl - The PC2 node URL
     * @param {string} setupToken - The one-time setup token
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async claimOwnership(nodeUrl, setupToken) {
        const walletAddress = window.user?.wallet_address;
        if (!walletAddress) {
            throw new Error('Wallet not connected');
        }

        // Create message to sign
        const message = JSON.stringify({
            action: 'claim-ownership',
            nodeUrl: nodeUrl,
            timestamp: Date.now(),
        });

        // Sign with wallet
        const signature = await this._signMessage(message);

        // Try /api/claim first (mock server), then /pc2/claim-ownership (full server)
        const endpoints = ['/api/claim', '/pc2/claim-ownership'];
        let lastError = null;
        
        for (const endpoint of endpoints) {
            try {
                const url = new URL(endpoint, nodeUrl);
                const response = await fetch(url.toString(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        walletAddress,
                        setupToken,
                        signature,
                        message,
                    }),
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    // Save config
                    this.config = {
                        nodeUrl,
                        nodeName: result.nodeName || 'My PC2',
                        isOwner: true,
                        status: 'disconnected',
                    };
                    this._saveConfig();
                    this._setStatus('connected');

                    logger.log('[PC2]: Ownership claimed successfully');
                    return result;
                } else {
                    lastError = result.error || 'Failed to claim ownership';
                }
            } catch (e) {
                lastError = e.message;
                continue;
            }
        }
        
        throw new Error(lastError || 'Failed to claim ownership');
    }

    /**
     * Connect to the PC2 node
     * @param {string} [nodeUrl] - Optional node URL (uses saved config if not provided)
     * @returns {Promise<void>}
     */
    async connect(nodeUrl) {
        const url = nodeUrl || this.config?.nodeUrl;
        if (!url) {
            throw new Error('No PC2 node URL configured');
        }

        const walletAddress = window.user?.wallet_address;
        if (!walletAddress) {
            throw new Error('Wallet not connected');
        }

        // Don't reconnect if already connected to same node
        if (this.isConnected() && this.config?.nodeUrl === url) {
            logger.log('[PC2]: Already connected');
            return;
        }

        // Disconnect existing connection
        this.disconnect();

        this._setStatus('connecting');

        try {
            // Create message to sign
            const message = JSON.stringify({
                action: 'connect',
                nodeUrl: url,
                timestamp: Date.now(),
            });

            // Sign with wallet
            const signature = await this._signMessage(message);

            // Build WebSocket URL
            const wsUrl = new URL('/pc2/tunnel', url);
            wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
            wsUrl.searchParams.set('wallet', walletAddress);
            wsUrl.searchParams.set('signature', signature);
            wsUrl.searchParams.set('message', message);

            // Create WebSocket
            this.ws = new WebSocket(wsUrl.toString());

            // Setup event handlers
            this.ws.onopen = () => this._onOpen();
            this.ws.onclose = (e) => this._onClose(e);
            this.ws.onerror = (e) => this._onError(e);
            this.ws.onmessage = (e) => this._onMessage(e);

            // Update config
            if (!this.config || this.config.nodeUrl !== url) {
                this.config = {
                    nodeUrl: url,
                    nodeName: 'PC2 Node',
                    isOwner: false,
                    status: 'connecting',
                };
            }

        } catch (error) {
            logger.error('[PC2]: Connection failed:', error);
            this._setStatus('error', error.message);
            throw error;
        }
    }

    /**
     * Disconnect from PC2 node
     */
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            this.ws.onclose = null; // Prevent reconnect attempt
            this.ws.close(1000, 'User disconnect');
            this.ws = null;
        }

        this.session = null;
        this.pendingRequests.clear();
        this.reconnectAttempts = 0;
        this._setStatus('disconnected');
    }

    /**
     * Clear PC2 configuration (forget node)
     */
    clearConfig() {
        this.disconnect();
        this.config = null;
        this.session = null;
        this._saveConfig();
        logger.log('[PC2]: Configuration cleared');
    }

    /**
     * Send API request through PC2 tunnel
     * @param {string} method - HTTP method
     * @param {string} path - API path
     * @param {Object} [body] - Request body
     * @returns {Promise<any>}
     */
    async request(method, path, body) {
        if (!this.isConnected()) {
            throw new Error('Not connected to PC2');
        }

        return new Promise((resolve, reject) => {
            const requestId = `req_${++this.requestCounter}`;
            
            // Set timeout
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error('Request timeout'));
            }, 30000);

            // Store pending request
            this.pendingRequests.set(requestId, { resolve, reject, timeout });

            // Send request
            this.ws.send(JSON.stringify({
                requestId,
                method,
                path,
                body,
            }));
        });
    }

    // ==================== PRIVATE METHODS ====================

    /**
     * Sign a message with the user's wallet
     * @param {string} message
     * @returns {Promise<string>}
     * @private
     */
    async _signMessage(message) {
        if (typeof window.ethereum === 'undefined') {
            throw new Error('MetaMask not available');
        }

        const walletAddress = window.user?.wallet_address;
        if (!walletAddress) {
            throw new Error('Wallet address not available');
        }

        // Use personal_sign for message signing
        const signature = await window.ethereum.request({
            method: 'personal_sign',
            params: [message, walletAddress],
        });

        return signature;
    }

    /**
     * Handle WebSocket open
     * @private
     */
    _onOpen() {
        logger.log('[PC2]: WebSocket connected');
        this.reconnectAttempts = 0;
        // Status will be set to 'connected' when we receive session message
    }

    /**
     * Handle WebSocket close
     * @param {CloseEvent} event
     * @private
     */
    _onClose(event) {
        logger.log('[PC2]: WebSocket closed:', event.code, event.reason);
        
        this.ws = null;
        this.session = null;

        // Clear pending requests
        for (const [id, { reject, timeout }] of this.pendingRequests) {
            clearTimeout(timeout);
            reject(new Error('Connection closed'));
        }
        this.pendingRequests.clear();

        // Attempt reconnect if not intentional disconnect
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this._setStatus('connecting', 'Reconnecting...');
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            logger.log(`[PC2]: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
            this.reconnectTimer = setTimeout(() => this.connect(), delay);
        } else {
            this._setStatus('disconnected', event.reason || null);
        }
    }

    /**
     * Handle WebSocket error
     * @param {Event} event
     * @private
     */
    _onError(event) {
        logger.error('[PC2]: WebSocket error:', event);
        this._setStatus('error', 'Connection error');
    }

    /**
     * Handle WebSocket message
     * @param {MessageEvent} event
     * @private
     */
    _onMessage(event) {
        try {
            const data = JSON.parse(event.data);

            // Handle session message
            if (data.type === 'session') {
                this.session = {
                    token: data.token,
                    wallet: data.wallet,
                    nodeName: data.node,
                };
                if (this.config) {
                    this.config.nodeName = data.node;
                    this._saveConfig();
                }
                this._setStatus('connected');
                logger.log('[PC2]: Session established:', data.node);
                return;
            }

            // Handle API response
            if (data.requestId && this.pendingRequests.has(data.requestId)) {
                const { resolve, reject, timeout } = this.pendingRequests.get(data.requestId);
                this.pendingRequests.delete(data.requestId);
                clearTimeout(timeout);

                if (data.error) {
                    reject(new Error(data.error));
                } else {
                    resolve(data.data);
                }
                return;
            }

            // Handle other messages (events, etc.)
            logger.log('[PC2]: Received message:', data);

        } catch (error) {
            logger.error('[PC2]: Failed to parse message:', error);
        }
    }
}

// Singleton instance
PC2ConnectionService._instance = null;

// Export singleton getter
export const getPC2Service = () => PC2ConnectionService.getInstance();

export default PC2ConnectionService;

