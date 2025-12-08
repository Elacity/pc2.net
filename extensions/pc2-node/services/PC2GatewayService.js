/*
 * Copyright (C) 2024-present Elacity
 *
 * PC2 Gateway Service
 * 
 * Handles secure WebSocket connections from browsers to the PC2 node.
 * Implements wallet-based authentication and request proxying.
 */

const crypto = require('crypto');
const { ethers } = require('ethers');
const WebSocket = require('ws');

// Rate limiting constants
const MAX_AUTH_ATTEMPTS_PER_MINUTE = 5;
const LOCKOUT_DURATION_MS = 60 * 60 * 1000; // 1 hour
const MESSAGE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

class PC2GatewayService {
    constructor({ services, config }) {
        this.services = services;
        this.config = config;
        this.wss = null;
        this.connections = new Map(); // wallet_address -> WebSocket
        this.db = null;
    }

    async _init() {
        this.db = await this.services.get('database').get('write', 'pc2');
        
        const wsPort = this.config.ws_port || 4200;
        
        // Create WebSocket server
        this.wss = new WebSocket.Server({
            port: wsPort,
            verifyClient: (info, callback) => this._verifyClient(info, callback),
        });

        this.wss.on('connection', (ws, req) => this._handleConnection(ws, req));
        this.wss.on('error', (error) => {
            console.error('[PC2 Gateway]: WebSocket server error:', error);
        });

        // Clean up expired sessions periodically
        setInterval(() => this._cleanupExpiredSessions(), 60 * 1000);

        console.log(`[PC2 Gateway]: Secure WebSocket server started on port ${wsPort}`);
    }

    /**
     * Verify client before allowing WebSocket connection
     */
    async _verifyClient(info, callback) {
        const ip = info.req.socket.remoteAddress;
        
        try {
            const url = new URL(info.req.url, 'http://localhost');
            const signature = url.searchParams.get('signature');
            const message = url.searchParams.get('message');
            const wallet = url.searchParams.get('wallet');

            // Check required parameters
            if (!signature || !message || !wallet) {
                await this._logFailedAuth(ip, wallet, 'wallet_connect', 'Missing parameters');
                callback(false, 401, 'Missing authentication parameters');
                return;
            }

            // Check rate limiting
            const isLocked = await this._checkRateLimit(ip);
            if (isLocked) {
                callback(false, 429, 'Too many failed attempts. Try again later.');
                return;
            }

            // Verify wallet signature
            let recoveredAddress;
            try {
                recoveredAddress = ethers.verifyMessage(message, signature);
            } catch (e) {
                await this._logFailedAuth(ip, wallet, 'wallet_connect', 'Invalid signature format');
                callback(false, 401, 'Invalid signature');
                return;
            }

            if (recoveredAddress.toLowerCase() !== wallet.toLowerCase()) {
                await this._logFailedAuth(ip, wallet, 'wallet_connect', 'Signature mismatch');
                callback(false, 401, 'Signature does not match wallet');
                return;
            }

            // Verify message timestamp (replay protection)
            let messageData;
            try {
                messageData = JSON.parse(message);
            } catch (e) {
                await this._logFailedAuth(ip, wallet, 'wallet_connect', 'Invalid message format');
                callback(false, 401, 'Invalid message format');
                return;
            }

            const now = Date.now();
            if (!messageData.timestamp || Math.abs(now - messageData.timestamp) > MESSAGE_EXPIRY_MS) {
                await this._logFailedAuth(ip, wallet, 'wallet_connect', 'Message expired');
                callback(false, 401, 'Message expired. Please try again.');
                return;
            }

            // Check if wallet is tethered (in whitelist)
            const isTethered = await this._isWalletTethered(wallet);
            if (!isTethered) {
                await this._logFailedAuth(ip, wallet, 'wallet_connect', 'Wallet not tethered');
                callback(false, 403, 'Wallet not authorized for this PC2 node');
                return;
            }

            // All checks passed
            callback(true);
            
        } catch (error) {
            console.error('[PC2 Gateway]: Verification error:', error);
            await this._logFailedAuth(ip, null, 'wallet_connect', error.message);
            callback(false, 500, 'Internal verification error');
        }
    }

    /**
     * Handle new WebSocket connection
     */
    async _handleConnection(ws, req) {
        const url = new URL(req.url, 'http://localhost');
        const wallet = url.searchParams.get('wallet').toLowerCase();
        const ip = req.socket.remoteAddress;

        console.log(`[PC2 Gateway]: New connection from ${wallet}`);

        // Close any existing connection for this wallet
        if (this.connections.has(wallet)) {
            const existingWs = this.connections.get(wallet);
            existingWs.close(1000, 'New connection established');
        }

        // Store new connection
        this.connections.set(wallet, ws);

        // Create session
        const sessionToken = await this._createSession(wallet, ip, req.headers['user-agent']);

        // Get node info
        const nodeConfig = await this.db.read('SELECT node_name FROM pc2_config LIMIT 1');
        const nodeName = nodeConfig[0]?.node_name || 'PC2 Node';

        // Send session token to client
        ws.send(JSON.stringify({
            type: 'session',
            token: sessionToken,
            node: nodeName,
            wallet: wallet,
        }));

        // Log successful connection
        await this._logAudit(wallet, 'connect', 'auth', true, { ip });

        // Handle incoming messages
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                await this._updateSessionActivity(sessionToken);
                const response = await this._handleAPIRequest(wallet, message);
                ws.send(JSON.stringify(response));
            } catch (error) {
                console.error('[PC2 Gateway]: Message handling error:', error);
                ws.send(JSON.stringify({
                    error: error.message,
                    requestId: null,
                }));
            }
        });

        ws.on('close', async () => {
            console.log(`[PC2 Gateway]: Disconnected: ${wallet}`);
            this.connections.delete(wallet);
            await this._endSession(sessionToken);
            await this._logAudit(wallet, 'disconnect', 'auth', true, { ip });
        });

        ws.on('error', (error) => {
            console.error(`[PC2 Gateway]: Connection error for ${wallet}:`, error);
        });
    }

    /**
     * Handle API request from client
     */
    async _handleAPIRequest(wallet, message) {
        const { requestId, method, path, body } = message;

        // Get user for this wallet
        const user = await this._getUserForWallet(wallet);
        if (!user) {
            return { requestId, error: 'User not found for wallet' };
        }

        try {
            // Route to appropriate Puter service
            const result = await this._routeRequest(user, method, path, body);
            return { requestId, success: true, data: result };
        } catch (error) {
            console.error(`[PC2 Gateway]: API request error:`, error);
            return { requestId, error: error.message };
        }
    }

    /**
     * Route request to Puter backend services
     */
    async _routeRequest(user, method, path, body) {
        // This is where we bridge tunnel requests to Puter's internal services
        // Implementation depends on Puter's service architecture
        
        // For now, return a placeholder
        // TODO: Implement actual routing to FilesystemService, etc.
        return { message: 'API routing not yet implemented', path, method };
    }

    /**
     * Claim ownership of this PC2 node
     */
    async claimOwnership(walletAddress, setupToken, signature, message, ip) {
        // Get node config
        const nodeConfig = await this.db.read('SELECT * FROM pc2_config LIMIT 1');
        
        if (nodeConfig.length === 0) {
            throw new Error('PC2 node not initialized');
        }

        const config = nodeConfig[0];

        // Check if already owned
        if (config.node_status === 'OWNED') {
            throw new Error('This PC2 node already has an owner');
        }

        // Check if locked out
        if (config.setup_token_lockout_until && config.setup_token_lockout_until > Date.now() / 1000) {
            throw new Error('Too many failed attempts. Please wait before trying again.');
        }

        // Verify setup token
        const providedTokenHash = crypto.createHash('sha256')
            .update(setupToken.replace('PC2-SETUP-', ''))
            .digest('hex');

        if (providedTokenHash !== config.setup_token_hash) {
            // Increment failed attempts
            const attempts = (config.setup_token_attempts || 0) + 1;
            const lockoutUntil = attempts >= 10 
                ? Math.floor(Date.now() / 1000) + 3600 // 1 hour lockout
                : null;

            await this.db.write(
                'UPDATE pc2_config SET setup_token_attempts = ?, setup_token_lockout_until = ? WHERE id = ?',
                [attempts, lockoutUntil, config.id]
            );

            await this._logFailedAuth(ip, walletAddress, 'setup_token', 'Invalid token');
            throw new Error('Invalid setup token');
        }

        // Verify wallet signature
        let recoveredAddress;
        try {
            recoveredAddress = ethers.verifyMessage(message, signature);
        } catch (e) {
            await this._logFailedAuth(ip, walletAddress, 'setup_token', 'Invalid signature');
            throw new Error('Invalid wallet signature');
        }

        if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
            await this._logFailedAuth(ip, walletAddress, 'setup_token', 'Signature mismatch');
            throw new Error('Signature does not match wallet address');
        }

        // SUCCESS - Claim ownership
        const now = Math.floor(Date.now() / 1000);

        // Update node config
        await this.db.write(
            `UPDATE pc2_config SET 
                setup_token_used = 1, 
                owner_wallet_address = ?, 
                node_status = 'OWNED',
                updated_at = ?
             WHERE id = ?`,
            [walletAddress.toLowerCase(), now, config.id]
        );

        // Add wallet to tethered list as owner
        await this.db.write(
            `INSERT INTO pc2_tethered_wallets 
                (wallet_address, wallet_address_lower, label, is_owner, permissions, created_at)
             VALUES (?, ?, ?, 1, ?, ?)`,
            [walletAddress, walletAddress.toLowerCase(), 'Owner', '["full", "admin"]', now]
        );

        // Ensure user exists in Puter's user table
        await this._ensureUserExists(walletAddress);

        // Log successful claim
        await this._logAudit(walletAddress, 'claim_ownership', 'admin', true, { ip });

        console.log(`[PC2 Gateway]: Ownership claimed by ${walletAddress}`);

        return { 
            success: true, 
            wallet: walletAddress,
            message: 'You are now the owner of this PC2 node'
        };
    }

    /**
     * Invite a new wallet (owner only)
     */
    async inviteWallet(ownerWallet, newWallet, label, permissions, ip) {
        // Verify owner
        const isOwner = await this._isWalletOwner(ownerWallet);
        if (!isOwner) {
            throw new Error('Only the owner can invite new wallets');
        }

        // Check if wallet already tethered
        const existing = await this.db.read(
            'SELECT id FROM pc2_tethered_wallets WHERE wallet_address_lower = ?',
            [newWallet.toLowerCase()]
        );

        if (existing.length > 0) {
            throw new Error('Wallet is already tethered');
        }

        // Check max wallets limit
        const nodeConfig = await this.db.read('SELECT max_tethered_wallets FROM pc2_config LIMIT 1');
        const maxWallets = nodeConfig[0]?.max_tethered_wallets || 10;

        const currentCount = await this.db.read(
            'SELECT COUNT(*) as count FROM pc2_tethered_wallets WHERE is_active = 1'
        );

        if (currentCount[0].count >= maxWallets) {
            throw new Error(`Maximum number of tethered wallets (${maxWallets}) reached`);
        }

        const now = Math.floor(Date.now() / 1000);

        // Add new wallet
        await this.db.write(
            `INSERT INTO pc2_tethered_wallets 
                (wallet_address, wallet_address_lower, label, permissions, invited_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [newWallet, newWallet.toLowerCase(), label || 'Trusted Wallet', 
             JSON.stringify(permissions || ['full']), ownerWallet.toLowerCase(), now]
        );

        // Ensure user exists
        await this._ensureUserExists(newWallet);

        // Log
        await this._logAudit(ownerWallet, 'invite_wallet', 'admin', true, { 
            invited: newWallet, label, ip 
        });

        return { success: true, wallet: newWallet };
    }

    /**
     * Revoke a wallet's access (owner only)
     */
    async revokeWallet(ownerWallet, targetWallet, ip) {
        // Verify owner
        const isOwner = await this._isWalletOwner(ownerWallet);
        if (!isOwner) {
            throw new Error('Only the owner can revoke wallets');
        }

        // Can't revoke owner
        const targetIsOwner = await this._isWalletOwner(targetWallet);
        if (targetIsOwner) {
            throw new Error('Cannot revoke owner wallet');
        }

        const now = Math.floor(Date.now() / 1000);

        await this.db.write(
            `UPDATE pc2_tethered_wallets 
             SET is_active = 0, revoked_at = ?, revoked_by = ?
             WHERE wallet_address_lower = ?`,
            [now, ownerWallet.toLowerCase(), targetWallet.toLowerCase()]
        );

        // Close any active connection
        if (this.connections.has(targetWallet.toLowerCase())) {
            const ws = this.connections.get(targetWallet.toLowerCase());
            ws.close(1000, 'Access revoked');
        }

        // Log
        await this._logAudit(ownerWallet, 'revoke_wallet', 'admin', true, { 
            revoked: targetWallet, ip 
        });

        return { success: true };
    }

    // ==================== HELPER METHODS ====================

    async _isWalletTethered(wallet) {
        const result = await this.db.read(
            'SELECT id FROM pc2_tethered_wallets WHERE wallet_address_lower = ? AND is_active = 1',
            [wallet.toLowerCase()]
        );
        return result.length > 0;
    }

    async _isWalletOwner(wallet) {
        const result = await this.db.read(
            'SELECT id FROM pc2_tethered_wallets WHERE wallet_address_lower = ? AND is_owner = 1 AND is_active = 1',
            [wallet.toLowerCase()]
        );
        return result.length > 0;
    }

    async _ensureUserExists(walletAddress) {
        const db = await this.services.get('database').get('write', 'user');
        
        const existing = await db.read(
            'SELECT id FROM user WHERE wallet_address = ?',
            [walletAddress.toLowerCase()]
        );

        if (existing.length === 0) {
            const uuid = crypto.randomUUID();
            const now = Math.floor(Date.now() / 1000);
            const shortAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
            
            await db.write(
                `INSERT INTO user (uuid, username, wallet_address, created_at)
                 VALUES (?, ?, ?, ?)`,
                [uuid, shortAddress, walletAddress.toLowerCase(), now]
            );
        }
    }

    async _getUserForWallet(wallet) {
        const db = await this.services.get('database').get('read', 'user');
        const result = await db.read(
            'SELECT * FROM user WHERE wallet_address = ?',
            [wallet.toLowerCase()]
        );
        return result[0] || null;
    }

    async _createSession(wallet, ip, userAgent) {
        const token = crypto.randomBytes(32).toString('hex');
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = now + Math.floor(SESSION_DURATION_MS / 1000);

        await this.db.write(
            `INSERT INTO pc2_sessions 
                (wallet_address, session_token, ip_address, user_agent, created_at, expires_at, last_activity_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [wallet.toLowerCase(), token, ip, userAgent, now, expiresAt, now]
        );

        return token;
    }

    async _updateSessionActivity(token) {
        const now = Math.floor(Date.now() / 1000);
        await this.db.write(
            'UPDATE pc2_sessions SET last_activity_at = ? WHERE session_token = ?',
            [now, token]
        );
    }

    async _endSession(token) {
        await this.db.write(
            'DELETE FROM pc2_sessions WHERE session_token = ?',
            [token]
        );
    }

    async _cleanupExpiredSessions() {
        const now = Math.floor(Date.now() / 1000);
        await this.db.write(
            'DELETE FROM pc2_sessions WHERE expires_at < ?',
            [now]
        );
    }

    async _checkRateLimit(ip) {
        const oneMinuteAgo = Math.floor(Date.now() / 1000) - 60;
        
        const recentAttempts = await this.db.read(
            'SELECT COUNT(*) as count FROM pc2_failed_auth WHERE ip_address = ? AND created_at > ?',
            [ip, oneMinuteAgo]
        );

        return recentAttempts[0].count >= MAX_AUTH_ATTEMPTS_PER_MINUTE;
    }

    async _logFailedAuth(ip, wallet, attemptType, reason) {
        const now = Math.floor(Date.now() / 1000);
        await this.db.write(
            `INSERT INTO pc2_failed_auth (ip_address, wallet_address, attempt_type, reason, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [ip, wallet?.toLowerCase() || null, attemptType, reason, now]
        );
    }

    async _logAudit(wallet, action, category, success, details) {
        const now = Math.floor(Date.now() / 1000);
        await this.db.write(
            `INSERT INTO pc2_audit_log (wallet_address, action, action_category, success, details, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [wallet?.toLowerCase() || null, action, category, success ? 1 : 0, 
             JSON.stringify(details || {}), now]
        );
    }
}

module.exports = { PC2GatewayService };


