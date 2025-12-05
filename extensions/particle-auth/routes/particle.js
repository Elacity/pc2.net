/*
 * Copyright (C) 2024-present Elacity & Puter Technologies Inc.
 *
 * This file is part of ElastOS (Puter fork).
 *
 * ElastOS is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Particle Network UniversalX Authentication Endpoint
 * 
 * Supports both EOA (wallet_address) and Smart Account (smart_account_address).
 * Users are identified by their Smart Account address for Elacity content ownership.
 */
const { v4: uuidv4 } = require('uuid');
const APIError = require("../../api/APIError");
const eggspress = require("../../api/eggspress");
const { Context } = require("../../util/context");
const { get_user } = require("../../helpers");
const config = require("../../config");
const { DB_WRITE } = require("../../services/database/consts");
const { generate_identifier } = require("../../util/identifier");

async function generate_random_username() {
    const { username_exists } = require('../../helpers');
    let username;
    do {
        username = generate_identifier();
    } while (await username_exists(username));
    return username;
}

module.exports = eggspress('/auth/particle', {
    subdomain: 'api',
    auth2: false, // No authentication required for login
    allowedMethods: ['POST'],
}, async (req, res, next) => {
    const x = Context.get();
    const svc_auth = x.get('services').get('auth');
    const svc_authAudit = x.get('services').get('auth-audit');
    const db = x.get('services').get('database').get(DB_WRITE, 'auth');
    
    // Record authentication attempt
    svc_authAudit.record({
        requester: Context.get('requester'),
        action: 'auth:particle',
        body: req.body,
    });
    
    // Extract auth data - supports both EOA-only and UniversalX Smart Account
    const { 
        address,                // EOA wallet address (required)
        chainId,               // Chain ID (optional)
        smartAccountAddress,   // UniversalX Smart Account address (optional, but preferred)
        particleUuid,          // Particle user UUID (optional)
        particleEmail,         // Particle email if social login (optional)
    } = req.body;
    
    // Validate the address (at minimum we need the EOA address)
    if (!address) {
        throw APIError.create('field_missing', null, {
            key: 'address',
        });
    }
    
    // Normalize addresses
    const eoaAddress = address.toLowerCase();
    const smartAddress = smartAccountAddress?.toLowerCase() || null;
    
    // Log the auth attempt for debugging
    console.log('[Particle Auth]: Auth attempt', {
        eoaAddress,
        smartAccountAddress: smartAddress,
        chainId,
        hasParticleUuid: !!particleUuid,
        hasParticleEmail: !!particleEmail,
    });
    
    try {
        // Look up user by Smart Account first (preferred), then by EOA
        let user = null;
        
        if (smartAddress) {
            // Try to find by Smart Account address (UniversalX identity)
            user = await get_user({ smart_account_address: smartAddress, cached: false });
        }
        
        if (!user) {
            // Fall back to EOA lookup (legacy or first-time user)
            user = await get_user({ wallet_address: eoaAddress, cached: false });
        }
        
        if (!user) {
            // Create a new user with wallet addresses
            // Use Smart Account address as username if available (more stable identity)
            const preferredAddress = smartAddress || eoaAddress;
            const username = `${preferredAddress}`;
            const user_uuid = uuidv4();
            
            // Check if username exists, if so generate a random one
            const { username_exists } = require('../../helpers');
            const finalUsername = await username_exists(username) ? 
                await generate_random_username() : 
                username;
            
            // Create audit metadata with full auth context
            const audit_metadata = {
                ip: req.connection.remoteAddress,
                ip_fwd: req.headers['x-forwarded-for'],
                user_agent: req.headers['user-agent'],
                origin: req.headers['origin'],
                server: config.server_id,
                wallet_address: eoaAddress,
                smart_account_address: smartAddress,
                chain_id: chainId,
                particle_uuid: particleUuid,
                particle_email: particleEmail,
                auth_type: smartAddress ? 'universalx' : 'eoa',
            };
            
            // Insert new user with both EOA and Smart Account addresses
            // Note: smart_account_address column must exist in user table
            const insert_res = await db.write(
                `INSERT INTO user
                (
                    username, wallet_address, smart_account_address, uuid, free_storage, 
                    audit_metadata, signup_ip, signup_ip_forwarded, 
                    signup_user_agent, signup_origin, signup_server
                ) 
                VALUES 
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    finalUsername,
                    eoaAddress,
                    smartAddress,
                    user_uuid,
                    config.storage_capacity,
                    JSON.stringify(audit_metadata),
                    req.connection.remoteAddress ?? null,
                    req.headers['x-forwarded-for'] ?? null,
                    req.headers['user-agent'] ?? null,
                    req.headers['origin'] ?? null,
                    config.server_id ?? null,
                ]
            );
            
            console.log('[Particle Auth]: Created new user', {
                username: finalUsername,
                eoaAddress,
                smartAccountAddress: smartAddress,
                authType: smartAddress ? 'universalx' : 'eoa',
            });
            
            // Record activity
            await db.write(
                'UPDATE `user` SET `last_activity_ts` = now() WHERE id=? LIMIT 1',
                [insert_res.insertId]
            );
            
            // Add user to default group
            const svc_group = x.get('services').get('group');
            await svc_group.add_users({
                uid: config.default_user_group,
                users: [finalUsername]
            });
            
            // Get the newly created user
            user = await get_user({ uuid: user_uuid });
            
            // Generate default filesystem entries
            const svc_user = x.get('services').get('user');
            await svc_user.generate_default_fsentries({ user });
        } else {
            // User exists - update Smart Account if provided and not already set
            if (smartAddress && !user.smart_account_address) {
                await db.write(
                    'UPDATE `user` SET `smart_account_address` = ? WHERE id = ? LIMIT 1',
                    [smartAddress, user.id]
                );
                console.log('[Particle Auth]: Updated existing user with Smart Account', {
                    userId: user.id,
                    smartAccountAddress: smartAddress,
                });
                // Refresh user data
                user = await get_user({ id: user.id, cached: false });
            }
        }
        
        // Create session token using AuthService
        const { token } = await svc_auth.create_session_token(user, { req });
        
        // Set session cookie
        res.cookie(config.cookie_name, token, {
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });
        
        // Get taskbar items
        const { get_taskbar_items } = require('../../helpers');
        const taskbar_items = await get_taskbar_items(user);
        
        // Generate referral code if service exists
        let referral_code;
        const svc_referralCode = x.get('services').get('referral-code', { optional: true });
        if (svc_referralCode) {
            referral_code = await svc_referralCode.gen_referral_code(user);
        }
        
        // Return success with user data including both addresses
        return res.json({
            success: true,
            token: token,
            user: {
                username: user.username,
                uuid: user.uuid,
                email: user.email,
                email_confirmed: 1,
                wallet_address: user.wallet_address,
                smart_account_address: user.smart_account_address || null,
                created_at: user.created_at,
                is_temp: false,
                taskbar_items,
                referral_code,
                // UniversalX metadata
                auth_type: user.smart_account_address ? 'universalx' : 'eoa',
            }
        });
    } catch (error) {
        console.error('Particle auth error:', error);
        throw APIError.create('internal_server_error', error.message);
    }
});
