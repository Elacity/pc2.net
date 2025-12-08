/*
 * Copyright (C) 2024-present Elacity
 *
 * PC2 Routes
 * 
 * HTTP endpoints for PC2 node management:
 * - Claim ownership (first-time setup)
 * - Invite wallets
 * - Revoke access
 * - Node status
 */

const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');

/**
 * GET /pc2/status
 * 
 * Returns the node's public status (no auth required)
 */
router.get('/status', async (req, res) => {
    try {
        const db = await req.services.get('database').get('read', 'pc2');
        const config = await db.read('SELECT node_name, node_status FROM pc2_config LIMIT 1');
        
        if (config.length === 0) {
            return res.json({ 
                status: 'NOT_INITIALIZED',
                message: 'PC2 node not initialized'
            });
        }

        res.json({
            status: config[0].node_status,
            nodeName: config[0].node_name,
            // Don't expose sensitive info
        });
    } catch (error) {
        console.error('[PC2 Routes]: Status error:', error);
        res.status(500).json({ error: 'Failed to get node status' });
    }
});

/**
 * POST /pc2/claim-ownership
 * 
 * Claim ownership of this PC2 node (requires setup token)
 * 
 * Body:
 * - walletAddress: The claiming wallet
 * - setupToken: The one-time setup token (from server console)
 * - signature: Wallet signature of the message
 * - message: JSON string with action, nodeUrl, timestamp
 */
router.post('/claim-ownership', express.json(), async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress;
    
    try {
        const { walletAddress, setupToken, signature, message } = req.body;

        // Validate required fields
        if (!walletAddress || !setupToken || !signature || !message) {
            return res.status(400).json({ 
                error: 'Missing required fields: walletAddress, setupToken, signature, message' 
            });
        }

        // Validate wallet address format
        if (!ethers.isAddress(walletAddress)) {
            return res.status(400).json({ error: 'Invalid wallet address format' });
        }

        // Get PC2 gateway service
        const pc2Gateway = req.services.get('pc2-gateway');
        
        const result = await pc2Gateway.claimOwnership(
            walletAddress,
            setupToken,
            signature,
            message,
            ip
        );

        res.json(result);
        
    } catch (error) {
        console.error('[PC2 Routes]: Claim ownership error:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /pc2/invite
 * 
 * Invite a new wallet to access this PC2 node (owner only)
 * Requires wallet signature for authorization
 * 
 * Body:
 * - ownerWallet: The owner's wallet address
 * - newWallet: The wallet to invite
 * - label: Optional friendly name
 * - permissions: Optional array of permissions
 * - signature: Owner's signature
 * - message: JSON string with action, timestamp
 */
router.post('/invite', express.json(), async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress;
    
    try {
        const { ownerWallet, newWallet, label, permissions, signature, message } = req.body;

        // Validate required fields
        if (!ownerWallet || !newWallet || !signature || !message) {
            return res.status(400).json({ 
                error: 'Missing required fields' 
            });
        }

        // Validate addresses
        if (!ethers.isAddress(ownerWallet) || !ethers.isAddress(newWallet)) {
            return res.status(400).json({ error: 'Invalid wallet address format' });
        }

        // Verify signature
        let recoveredAddress;
        try {
            recoveredAddress = ethers.verifyMessage(message, signature);
        } catch (e) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        if (recoveredAddress.toLowerCase() !== ownerWallet.toLowerCase()) {
            return res.status(401).json({ error: 'Signature does not match owner wallet' });
        }

        // Verify message timestamp
        const messageData = JSON.parse(message);
        if (Math.abs(Date.now() - messageData.timestamp) > 5 * 60 * 1000) {
            return res.status(401).json({ error: 'Message expired' });
        }

        // Get PC2 gateway service
        const pc2Gateway = req.services.get('pc2-gateway');
        
        const result = await pc2Gateway.inviteWallet(
            ownerWallet,
            newWallet,
            label,
            permissions,
            ip
        );

        res.json(result);
        
    } catch (error) {
        console.error('[PC2 Routes]: Invite error:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /pc2/revoke
 * 
 * Revoke a wallet's access (owner only)
 * 
 * Body:
 * - ownerWallet: The owner's wallet address
 * - targetWallet: The wallet to revoke
 * - signature: Owner's signature
 * - message: JSON string with action, timestamp
 */
router.post('/revoke', express.json(), async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress;
    
    try {
        const { ownerWallet, targetWallet, signature, message } = req.body;

        // Validate required fields
        if (!ownerWallet || !targetWallet || !signature || !message) {
            return res.status(400).json({ 
                error: 'Missing required fields' 
            });
        }

        // Validate addresses
        if (!ethers.isAddress(ownerWallet) || !ethers.isAddress(targetWallet)) {
            return res.status(400).json({ error: 'Invalid wallet address format' });
        }

        // Verify signature
        let recoveredAddress;
        try {
            recoveredAddress = ethers.verifyMessage(message, signature);
        } catch (e) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        if (recoveredAddress.toLowerCase() !== ownerWallet.toLowerCase()) {
            return res.status(401).json({ error: 'Signature does not match owner wallet' });
        }

        // Verify message timestamp
        const messageData = JSON.parse(message);
        if (Math.abs(Date.now() - messageData.timestamp) > 5 * 60 * 1000) {
            return res.status(401).json({ error: 'Message expired' });
        }

        // Get PC2 gateway service
        const pc2Gateway = req.services.get('pc2-gateway');
        
        const result = await pc2Gateway.revokeWallet(
            ownerWallet,
            targetWallet,
            ip
        );

        res.json(result);
        
    } catch (error) {
        console.error('[PC2 Routes]: Revoke error:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * GET /pc2/wallets
 * 
 * List tethered wallets (owner only, requires auth header)
 */
router.get('/wallets', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing authorization header' });
        }

        const sessionToken = authHeader.split(' ')[1];
        const db = await req.services.get('database').get('read', 'pc2');

        // Verify session
        const session = await db.read(
            'SELECT wallet_address FROM pc2_sessions WHERE session_token = ? AND expires_at > ?',
            [sessionToken, Math.floor(Date.now() / 1000)]
        );

        if (session.length === 0) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }

        const walletAddress = session[0].wallet_address;

        // Check if owner
        const isOwner = await db.read(
            'SELECT id FROM pc2_tethered_wallets WHERE wallet_address_lower = ? AND is_owner = 1',
            [walletAddress]
        );

        if (isOwner.length === 0) {
            return res.status(403).json({ error: 'Only owner can list wallets' });
        }

        // Get all tethered wallets
        const wallets = await db.read(
            `SELECT wallet_address, label, permissions, is_owner, is_active, created_at, last_connected_at
             FROM pc2_tethered_wallets ORDER BY created_at ASC`
        );

        res.json({ wallets });
        
    } catch (error) {
        console.error('[PC2 Routes]: List wallets error:', error);
        res.status(500).json({ error: 'Failed to list wallets' });
    }
});

/**
 * GET /pc2/audit
 * 
 * Get audit log (owner only)
 */
router.get('/audit', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing authorization header' });
        }

        const sessionToken = authHeader.split(' ')[1];
        const db = await req.services.get('database').get('read', 'pc2');

        // Verify session and owner
        const session = await db.read(
            'SELECT wallet_address FROM pc2_sessions WHERE session_token = ? AND expires_at > ?',
            [sessionToken, Math.floor(Date.now() / 1000)]
        );

        if (session.length === 0) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }

        const walletAddress = session[0].wallet_address;

        const isOwner = await db.read(
            'SELECT id FROM pc2_tethered_wallets WHERE wallet_address_lower = ? AND is_owner = 1',
            [walletAddress]
        );

        if (isOwner.length === 0) {
            return res.status(403).json({ error: 'Only owner can view audit log' });
        }

        // Get recent audit entries
        const limit = parseInt(req.query.limit) || 100;
        const entries = await db.read(
            `SELECT * FROM pc2_audit_log ORDER BY created_at DESC LIMIT ?`,
            [limit]
        );

        res.json({ entries });
        
    } catch (error) {
        console.error('[PC2 Routes]: Audit log error:', error);
        res.status(500).json({ error: 'Failed to get audit log' });
    }
});

module.exports = { PC2Routes: router };


