/*
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
    
    const { address, chainId } = req.body;
    
    // Validate the address
    if (!address) {
        throw APIError.create('field_missing', null, {
            key: 'address',
        });
    }
    
    try {
        // Check if a user with this wallet address already exists
        let user = await get_user({ wallet_address: address.toLowerCase(), cached: false });
        
        if (!user) {
            // Create a new user with this wallet address
            const username = `${address.toLowerCase()}`;
            const user_uuid = uuidv4();
            
            // Check if username exists, if so generate a random one
            const { username_exists } = require('../../helpers');
            const finalUsername = await username_exists(username) ? 
                await generate_random_username() : 
                username;
            
            // Create audit metadata
            const audit_metadata = {
                ip: req.connection.remoteAddress,
                ip_fwd: req.headers['x-forwarded-for'],
                user_agent: req.headers['user-agent'],
                origin: req.headers['origin'],
                server: config.server_id,
                wallet_address: address.toLowerCase(),
                chain_id: chainId
            };
            
            // Insert new user
            const insert_res = await db.write(
                `INSERT INTO user
                (
                    username, wallet_address, uuid, free_storage, 
                    audit_metadata, signup_ip, signup_ip_forwarded, 
                    signup_user_agent, signup_origin, signup_server
                ) 
                VALUES 
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    finalUsername,
                    address.toLowerCase(),
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
        
        // Return success with user data and JWT token
        return res.json({
            success: true,
            token: token,
            user: {
                username: user.username,
                uuid: user.uuid,
                email: user.email,
                email_confirmed: 1,
                wallet_address: user.wallet_address,
                created_at: user.created_at,
                is_temp: false,
                taskbar_items,
                referral_code
            }
        });
    } catch (error) {
        console.error('Particle auth error:', error);
        throw APIError.create('internal_server_error', error.message);
    }
});
