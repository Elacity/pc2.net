/*
 * Copyright (C) 2024-present Elacity & Puter Technologies Inc.
 *
 * This file is part of ElastOS (Puter fork).
 *
 * ElastOS is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * ParticleAuthDriver
 * 
 * Implements the 'auth' interface using Particle Network for blockchain-based authentication.
 * This driver allows users to authenticate using their Web3 wallets instead of passwords.
 * 
 * Methods:
 * - login: Authenticate user with wallet address and signature
 * - verify: Verify authentication token
 * - logout: End user session
 */

class ParticleAuthDriver {
    constructor() {
        this.name = 'particle';
        this.description = 'Particle Network blockchain authentication driver';
    }

    /**
     * Authenticate a user using their blockchain wallet
     * 
     * @param {Object} params - Authentication parameters
     * @param {string} params.walletAddress - User's blockchain wallet address
     * @param {string} params.signature - Signed message for verification
     * @param {number} [params.chainId] - Blockchain chain ID
     * @param {Object} context - Driver context from Puter
     * @returns {Promise<Object>} Authentication result with user info and token
     */
    async login({ walletAddress, signature, chainId }, context) {
        const services = context.services;
        const db = services.get('database').get('write');
        const particleAuthService = services.get('particle-auth');
        
        // Verify the signature
        const isValid = await particleAuthService.verifyWalletSignature(
            walletAddress,
            signature,
            'Login to ElastOS'
        );
        
        if (!isValid) {
            throw new Error('Invalid signature');
        }
        
        // Check if user exists
        let user = await db.read(
            'SELECT * FROM `user` WHERE `wallet_address` = ? LIMIT 1',
            [walletAddress]
        );
        
        if (user.length === 0) {
            // Create new user with wallet address
            const username = `user_${walletAddress.substring(0, 8)}`;
            const result = await db.write(
                'INSERT INTO `user` (username, wallet_address) VALUES (?, ?)',
                [username, walletAddress]
            );
            
            user = await db.read(
                'SELECT * FROM `user` WHERE `id` = ? LIMIT 1',
                [result.insertId]
            );
        }
        
        // Generate JWT token using Puter's auth service
        const authService = services.get('auth');
        const token = await authService.create_session_token(user[0], {
            type: 'particle-auth'
        });
        
        return {
            success: true,
            user: {
                id: user[0].id,
                username: user[0].username,
                walletAddress: user[0].wallet_address
            },
            token
        };
    }

    /**
     * Verify an authentication token
     * 
     * @param {Object} params - Verification parameters
     * @param {string} params.token - JWT authentication token
     * @param {Object} context - Driver context from Puter
     * @returns {Promise<Object>} Verification result with user info
     */
    async verify({ token }, context) {
        const services = context.services;
        const authService = services.get('auth');
        
        try {
            const actor = await authService.authenticate_from_token(token);
            
            return {
                success: true,
                valid: true,
                user: {
                    id: actor.type.user.id,
                    username: actor.type.user.username,
                    walletAddress: actor.type.user.wallet_address
                }
            };
        } catch (error) {
            return {
                success: true,
                valid: false,
                error: error.message
            };
        }
    }

    /**
     * End a user session
     * 
     * @param {Object} params - Logout parameters
     * @param {string} params.token - JWT authentication token
     * @param {Object} context - Driver context from Puter
     * @returns {Promise<Object>} Logout result
     */
    async logout({ token }, context) {
        const services = context.services;
        const authService = services.get('auth');
        
        try {
            await authService.revoke_session(token);
            
            return {
                success: true,
                message: 'Logged out successfully'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = ParticleAuthDriver;

