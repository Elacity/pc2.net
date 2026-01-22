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
import TeePromise from '../../util/TeePromise.js';
import UIComponentWindow from '../UIComponentWindow.js';
import UIWindow from '../UIWindow.js';
import UIAlert from '../UIAlert.js';
import UIWindow2FASetup from '../UIWindow2FASetup.js';

export default {
    id: 'security',
    title_i18n_key: 'security',
    icon: 'shield.svg',
    html: () => {
        let h = `<h1>${i18n('security')}</h1>`;
        let user = window.user;

        // Check if PC2 mode
        const isPC2Mode = window.api_origin && (
            window.api_origin.includes('127.0.0.1:4200') || 
            window.api_origin.includes('localhost:4200') ||
            window.api_origin.includes('127.0.0.1:4202') ||
            window.api_origin.includes('localhost:4202') ||
            window.location.origin === window.api_origin
        );

        // change password button (not for wallet users)
        if (!user.is_temp && !user.wallet_address) {
            h += '<div class="settings-card">';
            h += `<strong>${i18n('password')}</strong>`;
            h += '<div style="flex-grow:1;">';
            h += `<button class="button change-password" style="float:right;">${i18n('change_password')}</button>`;
            h += '</div>';
            h += '</div>';
        }

        // session manager
        h += '<div class="settings-card">';
        h += `<strong>${i18n('sessions')}</strong>`;
        h += '<div style="flex-grow:1;">';
        h += `<button class="button manage-sessions" style="float:right;">${i18n('manage_sessions')}</button>`;
        h += '</div>';
        h += '</div>';

        // configure 2FA (only for email users)
        if (!user.is_temp && user.email_confirmed && !user.wallet_address) {
            h += `<div class="settings-card settings-card-security ${user.otp ? 'settings-card-success' : 'settings-card-warning'}">`;
            h += '<div>';
            h += `<strong style="display:block;">${i18n('two_factor')}</strong>`;
            h += `<span class="user-otp-state" style="display:block; margin-top:5px;">${
                i18n(user.otp ? 'two_factor_enabled' : 'two_factor_disabled')
            }</span>`;
            h += '</div>';
            h += '<div style="flex-grow:1;">';
            h += `<button class="button enable-2fa" style="float:right;${user.otp ? 'display:none;' : ''}">${i18n('enable_2fa')}</button>`;
            h += `<button class="button disable-2fa" style="float:right;${user.otp ? '' : 'display:none;'}">${i18n('disable_2fa')}</button>`;
            h += '</div>';
            h += '</div>';
        }
        
        // PC2 Mode sections
        if (isPC2Mode) {
            // ACCESS CONTROL SECTION (First - most important for security)
            h += '<h2 style="font-size: 14px; margin: 25px 0 10px; color: #333;">Access Control</h2>';
            h += '<p style="color: #666; margin-bottom: 15px; font-size: 12px;">Manage who can access your PC2 node.</p>';
            
            // Owner info
            h += '<div class="settings-card">';
            h += '<div style="flex: 1;">';
            h += '<strong style="display:block;">Node Owner</strong>';
            h += '<span id="owner-wallet" style="display:block; margin-top:5px; font-size: 12px; color: #666; font-family: monospace;">Loading...</span>';
            h += '</div>';
            h += '</div>';

            // Add wallet - with proper height
            h += '<div class="settings-card" style="flex-direction: column; align-items: stretch; height: auto !important; overflow: visible !important;">';
            h += '<strong style="display:block; margin-bottom: 10px;">Add Wallet</strong>';
            h += '<div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap;">';
            h += '<input type="text" id="add-wallet-address" placeholder="0x..." style="flex: 1; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-family: monospace; font-size: 12px; min-width: 100px;">';
            h += '<select id="add-wallet-role" style="padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; width: 90px; flex-shrink: 0;">';
            h += '<option value="member">Member</option>';
            h += '<option value="admin">Admin</option>';
            h += '</select>';
            h += '<button id="btn-add-wallet" class="button" style="white-space: nowrap; flex-shrink: 0;">Add</button>';
            h += '</div>';
            h += '<div id="add-wallet-status" style="margin-top: 6px; font-size: 11px; min-height: 16px;"></div>';
            h += '</div>';

            // Allowed wallets list
            h += '<div class="settings-card" style="flex-direction: column; align-items: stretch; height: auto !important; overflow: visible !important;">';
            h += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">';
            h += '<strong>Allowed Wallets</strong>';
            h += '<button id="btn-refresh-wallets" class="button" style="font-size: 11px; padding: 6px 12px; line-height: 1;">Refresh</button>';
            h += '</div>';
            h += '<div id="allowed-wallets-list" style="min-height: 40px;">';
            h += '<div style="text-align: center; padding: 10px; color: #999; font-size: 12px;">Loading...</div>';
            h += '</div>';
            h += '</div>';

            // Login History
            h += '<h2 style="font-size: 14px; margin: 25px 0 10px; color: #333;">Login History</h2>';
            h += '<div id="security-login-history" class="settings-card" style="flex-direction: column; align-items: stretch; height: auto !important; overflow: visible !important; min-height: 60px;">';
            h += '<div style="text-align: center; padding: 20px; color: #999;">Loading...</div>';
            h += '</div>';
            
            // Wallet Security (for wallet users)
            if (user.wallet_address) {
                h += '<h2 style="font-size: 14px; margin: 25px 0 10px; color: #333;">Wallet Security</h2>';
                h += '<div class="settings-card">';
                h += '<div>';
                h += '<strong style="display: block;">Authentication Method</strong>';
                h += '<span style="font-size: 12px; color: #666;">Secured by your wallet signature</span>';
                h += '</div>';
                h += '<div style="flex-grow:1; text-align: right;">';
                h += '<span style="color: #16a34a; font-size: 13px;">Wallet Connected</span>';
                h += '</div>';
                h += '</div>';
                
                h += '<div class="settings-card" style="background: #f0fdf4; border-color: #86efac;">';
                h += '<div style="display: flex; align-items: center; gap: 10px;">';
                h += '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>';
                h += '<div>';
                h += '<strong style="display: block; color: #166534;">Decentralized Identity</strong>';
                h += '<span style="font-size: 12px; color: #15803d;">Your identity is secured by blockchain cryptography</span>';
                h += '</div>';
                h += '</div>';
                h += '</div>';
            }
            
            // API Keys Section (PC2 mode only)
            h += '<h2 style="font-size: 14px; margin: 25px 0 10px; color: #333;">API Keys</h2>';
            h += '<div class="settings-card" style="flex-direction: column; align-items: stretch; height: auto !important; overflow: visible !important;">';
            h += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">';
            h += '<div>';
            h += '<strong style="display: block;">Programmatic Access</strong>';
            h += '<span style="font-size: 12px; color: #666;">Enable AI agents and automation tools to access your PC2 node</span>';
            h += '</div>';
            h += '<button class="button api-keys-create-btn" style="white-space: nowrap;">+ Create Key</button>';
            h += '</div>';
            h += '<div id="security-api-keys-list" style="border-top: 1px solid #e5e7eb; padding-top: 10px; min-height: 50px;">';
            h += '<div style="text-align: center; padding: 15px; color: #999;">Loading API keys...</div>';
            h += '</div>';
            h += '</div>';
            
            // AI Agent Integration Guide
            h += '<h2 style="font-size: 14px; margin: 25px 0 10px; color: #333;">AI Agent Integration</h2>';
            h += '<div class="settings-card" style="flex-direction: column; align-items: stretch; height: auto !important; overflow: visible !important; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-color: #7dd3fc;">';
            h += '<div style="margin-bottom: 12px;">';
            h += '<strong style="display: block; color: #0369a1;">Connect AI Agents to Your PC2 Cloud</strong>';
            h += '<span style="font-size: 12px; color: #0c4a6e;">Use Claude Code, Cursor, or any AI agent to manage your files, run commands, and automate tasks.</span>';
            h += '</div>';
            
            // API Endpoint
            h += '<div style="background: #fff; border-radius: 6px; padding: 12px; margin-bottom: 10px;">';
            h += '<div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">API Endpoint</div>';
            h += `<code id="agent-api-endpoint" style="font-family: monospace; font-size: 13px; color: #0f172a; user-select: all;">${window.api_origin || 'http://localhost:4200'}</code>`;
            h += '</div>';
            
            // OpenAPI Schema link
            h += '<div style="background: #fff; border-radius: 6px; padding: 12px; margin-bottom: 10px;">';
            h += '<div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">Tool Schema (OpenAPI)</div>';
            h += `<a href="${window.api_origin || 'http://localhost:4200'}/api/tools/openapi" target="_blank" style="font-family: monospace; font-size: 13px; color: #2563eb; text-decoration: none;">`;
            h += `${window.api_origin || 'http://localhost:4200'}/api/tools/openapi`;
            h += '</a>';
            h += '</div>';
            
            // How to use section
            h += '<div style="background: #fff; border-radius: 6px; padding: 12px;">';
            h += '<div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">How to Connect an AI Agent</div>';
            h += '<ol style="margin: 0; padding-left: 20px; font-size: 12px; color: #334155; line-height: 1.8;">';
            h += '<li>Create an API key above with the scopes your agent needs</li>';
            h += '<li>Copy your API key and paste it into your agent\'s config</li>';
            h += '<li>Click the button below to copy setup instructions, then paste to your agent</li>';
            h += '</ol>';
            h += '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0;">';
            h += '<button class="button copy-agent-prompt-btn" style="font-size: 12px;">Copy Setup Prompt for AI</button>';
            h += '<div style="font-size: 10px; color: #64748b; margin-top: 6px;">Includes: API endpoint, authentication format, available tools, and usage examples</div>';
            h += '</div>';
            h += '</div>';
            h += '</div>';
            
            // API Keys Styles
            h += `<style>
                .api-key-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 0;
                    border-bottom: 1px solid #f3f4f6;
                }
                .api-key-item:last-child {
                    border-bottom: none;
                }
                .api-key-info {
                    flex: 1;
                    min-width: 0;
                }
                .api-key-name {
                    font-weight: 500;
                    font-size: 13px;
                    color: #1f2937;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .api-key-meta {
                    font-size: 11px;
                    color: #6b7280;
                    margin-top: 4px;
                }
                .api-key-scopes {
                    display: flex;
                    gap: 4px;
                    margin-left: 8px;
                }
                .api-key-scope {
                    font-size: 10px;
                    padding: 2px 6px;
                    border-radius: 3px;
                    background: #e0e7ff;
                    color: #3730a3;
                    font-weight: 500;
                }
                .api-key-scope.revoked {
                    background: #fee2e2;
                    color: #991b1b;
                }
                .api-key-revoke-btn {
                    background: none;
                    border: 1px solid #fca5a5;
                    color: #dc2626;
                    padding: 4px 10px;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                }
                .api-key-revoke-btn:hover {
                    background: #fee2e2;
                }
                .api-key-revoke-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            </style>`;
        }

        return h;
    },
    init: ($el_window) => {
        $el_window.find('.enable-2fa').on('click', async function (e) {

            const { promise } = await UIWindow2FASetup();
            const tfa_was_enabled = await promise;

            if ( tfa_was_enabled ) {
                $el_window.find('.enable-2fa').hide();
                $el_window.find('.disable-2fa').show();
                $el_window.find('.user-otp-state').text(i18n('two_factor_enabled'));
                $el_window.find('.settings-card-security').removeClass('settings-card-warning');
                $el_window.find('.settings-card-security').addClass('settings-card-success');
            }

            return;
        });

        $el_window.find('.disable-2fa').on('click', async function (e) {
            let win, password_entry;
            const password_confirm_promise = new TeePromise();
            const try_password = async () => {
                const value = password_entry.get('value');
                const resp = await fetch(`${window.api_origin}/user-protected/disable-2fa`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${puter.authToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        password: value,
                    }),
                });
                if ( resp.status !== 200 ) {
                    /* eslint no-empty: ["error", { "allowEmptyCatch": true }] */
                    let message; try {
                        message = (await resp.json()).message;
                    } catch (e) {
                    }
                    message = message || i18n('error_unknown_cause');
                    password_entry.set('error', message);
                    return;
                }
                password_confirm_promise.resolve(true);
                $(win).close();
            };

            let h = '';
            h += '<div style="display: flex; flex-direction: column; gap: 20pt; justify-content: center;">';
            h += '<div>';
            h += `<h3 style="text-align:center; font-weight: 500; font-size: 20px;">${i18n('disable_2fa_confirm')}</h3>`;
            h += `<p style="text-align:center; padding: 0 20px;">${i18n('disable_2fa_instructions')}</p>`;
            h += '</div>';
            h += '<div style="display: flex; gap: 5pt;">';
            h += '<input type="password" class="password-entry" />';
            h += `<button class="button confirm-disable-2fa">${i18n('disable_2fa')}</button>`;
            h += `<button class="button secondary cancel-disable-2fa">${i18n('cancel')}</button>`;
            h += '</div>';
            h += '</div>';

            win = await UIComponentWindow({
                html: h,
                width: 500,
                backdrop: true,
                is_resizable: false,
                body_css: {
                    width: 'initial',
                    'background-color': 'rgb(245 247 249)',
                    'backdrop-filter': 'blur(3px)',
                    padding: '20px',
                },
            });

            // Set up event listeners
            const $win = $(win);
            const $password_entry = $win.find('.password-entry');

            $password_entry.on('keypress', (e) => {
                if ( e.which === 13 ) { // Enter key
                    try_password();
                }
            });

            $win.find('.confirm-disable-2fa').on('click', () => {
                try_password();
            });

            $win.find('.cancel-disable-2fa').on('click', () => {
                password_confirm_promise.resolve(false);
                $win.close();
            });

            $password_entry.focus();

            const ok = await password_confirm_promise;
            if ( ! ok ) return;

            $el_window.find('.enable-2fa').show();
            $el_window.find('.disable-2fa').hide();
            $el_window.find('.user-otp-state').text(i18n('two_factor_disabled'));
            $el_window.find('.settings-card-security').removeClass('settings-card-success');
            $el_window.find('.settings-card-security').addClass('settings-card-warning');
        });
        
        // Load login history for PC2 mode
        const isPC2Mode = window.api_origin && (
            window.api_origin.includes('127.0.0.1:4200') || 
            window.api_origin.includes('localhost:4200') ||
            window.api_origin.includes('127.0.0.1:4202') ||
            window.api_origin.includes('localhost:4202') ||
            window.location.origin === window.api_origin
        );
        
        if (isPC2Mode) {
            const apiOrigin = window.api_origin || window.location.origin;
            const authToken = puter.authToken;
            
            // Load login history
            (async () => {
                try {
                    const response = await fetch(`${apiOrigin}/api/user/login-history`, {
                        headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
                    });
                    
                    const container = $el_window.find('#security-login-history');
                    
                    if (response.ok) {
                        const data = await response.json();
                        const logins = data.logins || [];
                        
                        if (logins.length === 0) {
                            container.html('<div style="text-align: center; padding: 20px; color: #999;">No login history available</div>');
                        } else {
                            let h = '';
                            logins.slice(0, 10).forEach(login => {
                                const date = new Date(login.timestamp).toLocaleString();
                                const isCurrent = login.is_current;
                                h += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #eee;">`;
                                h += `<div>`;
                                h += `<strong style="font-size: 13px;">${login.ip || 'Unknown'}</strong>`;
                                h += `<span style="font-size: 11px; color: #666; display: block;">${login.user_agent || 'Unknown device'}</span>`;
                                h += `</div>`;
                                h += `<div style="text-align: right;">`;
                                h += `<span style="font-size: 12px; color: #666;">${date}</span>`;
                                if (isCurrent) {
                                    h += `<span style="font-size: 10px; color: #16a34a; display: block;">Current session</span>`;
                                }
                                h += `</div>`;
                                h += `</div>`;
                            });
                            container.html(h);
                        }
                    } else {
                        container.html('<div style="text-align: center; padding: 20px; color: #999;">Login history not available</div>');
                    }
                } catch (error) {
                    console.error('[Security] Failed to load login history:', error);
                    $el_window.find('#security-login-history').html('<div style="text-align: center; padding: 20px; color: #999;">Failed to load</div>');
                }
            })();
            
            // ==================== API KEYS FUNCTIONALITY ====================
            
            // Load API Keys
            async function loadApiKeys() {
                const container = $el_window.find('#security-api-keys-list');
                container.html('<div style="text-align: center; padding: 15px; color: #999;">Loading...</div>');
                
                try {
                    const response = await fetch(`${apiOrigin}/api/keys`, {
                        headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Failed to load: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    const keys = data.keys || [];
                    
                    if (keys.length === 0) {
                        container.html('<div style="text-align: center; padding: 15px; color: #999;">No API keys yet. Create one to enable programmatic access.</div>');
                        return;
                    }
                    
                    // Separate active and revoked keys
                    const activeKeys = keys.filter(k => !k.revoked);
                    const revokedKeys = keys.filter(k => k.revoked);
                    
                    let h = '';
                    
                    // Render active keys
                    activeKeys.forEach(key => {
                        const created = new Date(key.created_at).toLocaleDateString();
                        const lastUsed = key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never';
                        const scopes = Array.isArray(key.scopes) ? key.scopes : [];
                        
                        h += `<div class="api-key-item" data-key-id="${key.key_id}">`;
                        h += `<div class="api-key-info">`;
                        h += `<div class="api-key-name">`;
                        const keyIcon = window.icons?.['shield.svg'] ? `<img src="${window.icons['shield.svg']}" style="width: 14px; height: 14px; vertical-align: middle; opacity: 0.7;">` : '';
                        h += `${keyIcon} ${key.name}`;
                        h += `<span class="api-key-scopes">`;
                        scopes.forEach(scope => {
                            h += `<span class="api-key-scope">${scope}</span>`;
                        });
                        h += `</span>`;
                        h += `</div>`;
                        h += `<div class="api-key-meta">Created: ${created} · Last used: ${lastUsed}</div>`;
                        h += `</div>`;
                        h += `<button class="api-key-revoke-btn" data-key-id="${key.key_id}" data-key-name="${key.name}">Revoke</button>`;
                        h += `</div>`;
                    });
                    
                    if (activeKeys.length === 0 && revokedKeys.length === 0) {
                        h += '<div style="text-align: center; padding: 15px; color: #999;">No API keys yet. Create one to enable programmatic access.</div>';
                    } else if (activeKeys.length === 0) {
                        h += '<div style="text-align: center; padding: 15px; color: #999;">No active API keys.</div>';
                    }
                    
                    // Show revoked keys section if any exist
                    if (revokedKeys.length > 0) {
                        h += `<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">`;
                        h += `<div style="font-size: 12px; color: #6b7280; margin-bottom: 10px;">${revokedKeys.length} revoked key${revokedKeys.length > 1 ? 's' : ''}</div>`;
                        revokedKeys.forEach(key => {
                            const created = new Date(key.created_at).toLocaleDateString();
                            h += `<div class="api-key-item" data-key-id="${key.key_id}" style="opacity: 0.6;">`;
                            h += `<div class="api-key-info">`;
                            h += `<div class="api-key-name" style="color: #9ca3af;">`;
                            h += `${key.name}`;
                            h += `<span class="api-key-scope revoked">REVOKED</span>`;
                            h += `</div>`;
                            h += `<div class="api-key-meta">Created: ${created}</div>`;
                            h += `</div>`;
                            h += `<button class="api-key-delete-btn" data-key-id="${key.key_id}" data-key-name="${key.name}" style="background: none; border: 1px solid #d1d5db; color: #6b7280; padding: 4px 10px; border-radius: 4px; font-size: 12px; cursor: pointer;">Delete</button>`;
                            h += `</div>`;
                        });
                        h += `</div>`;
                    }
                    
                    container.html(h);
                    
                    // Attach revoke handlers
                    container.find('.api-key-revoke-btn').on('click', async function() {
                        const keyId = $(this).data('key-id');
                        const keyName = $(this).data('key-name');
                        await revokeApiKey(keyId, keyName);
                    });
                    
                    // Attach delete handlers
                    container.find('.api-key-delete-btn').on('click', async function() {
                        const keyId = $(this).data('key-id');
                        const keyName = $(this).data('key-name');
                        await deleteApiKey(keyId, keyName);
                    });
                    
                } catch (error) {
                    console.error('[Security] Failed to load API keys:', error);
                    container.html('<div style="text-align: center; padding: 15px; color: #dc2626;">Failed to load API keys</div>');
                }
            }
            
            // Revoke API Key
            async function revokeApiKey(keyId, keyName) {
                const confirmed = await UIAlert({
                    type: 'confirm',
                    message: `Revoke API key "${keyName}"?<br><br>This key will immediately stop working and cannot be restored.`,
                    buttons: [
                        { label: 'Cancel', value: false, type: 'secondary' },
                        { label: 'Revoke', value: true, type: 'primary' },
                    ],
                    backdrop: true,
                });
                
                if (confirmed !== 'true' && confirmed !== true) {
                    return;
                }
                
                try {
                    const response = await fetch(`${apiOrigin}/api/keys/${keyId}/revoke`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
                        }
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Failed: ${response.status}`);
                    }
                    
                    // Show success toast if available
                    if (window.puter?.ui?.toast) {
                        puter.ui.toast(`API key "${keyName}" revoked`, { type: 'success' });
                    }
                    
                    // Reload the list
                    loadApiKeys();
                    
                } catch (error) {
                    console.error('[Security] Failed to revoke API key:', error);
                    alert('Failed to revoke API key: ' + error.message);
                }
            }
            
            // Delete API Key (permanently remove revoked keys)
            async function deleteApiKey(keyId, keyName) {
                const confirmed = await UIAlert({
                    type: 'confirm',
                    message: `Delete API key "${keyName}"?<br><br>This will permanently remove the key from your account.`,
                    buttons: [
                        { label: 'Cancel', value: false, type: 'secondary' },
                        { label: 'Delete', value: true, type: 'primary' },
                    ],
                    backdrop: true,
                });
                
                if (confirmed !== 'true' && confirmed !== true) {
                    return;
                }
                
                try {
                    const response = await fetch(`${apiOrigin}/api/keys/${keyId}`, {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
                        }
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Failed: ${response.status}`);
                    }
                    
                    // Show success toast if available
                    if (window.puter?.ui?.toast) {
                        puter.ui.toast(`API key "${keyName}" deleted`, { type: 'success' });
                    }
                    
                    // Reload the list
                    loadApiKeys();
                    
                } catch (error) {
                    console.error('[Security] Failed to delete API key:', error);
                    alert('Failed to delete API key: ' + error.message);
                }
            }
            
            // Create API Key Modal
            async function showCreateKeyModal() {
                let h = '';
                h += '<div style="padding: 20px; max-width: 450px;">';
                h += '<h3 style="margin: 0 0 20px; font-size: 18px; font-weight: 500;">Create API Key</h3>';
                
                // Name input
                h += '<div style="margin-bottom: 16px;">';
                h += '<label style="display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px;">Name</label>';
                h += '<input type="text" id="api-key-name-input" placeholder="e.g., claude-agent" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; box-sizing: border-box;" maxlength="100" />';
                h += '</div>';
                
                // Scopes
                h += '<div style="margin-bottom: 16px;">';
                h += '<label style="display: block; font-size: 13px; font-weight: 500; margin-bottom: 8px;">Permissions</label>';
                h += '<div style="display: flex; flex-direction: column; gap: 8px;">';
                h += '<label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;"><input type="checkbox" class="api-key-scope-cb" value="read" checked /> <span><strong>Read</strong> - Read files and data</span></label>';
                h += '<label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;"><input type="checkbox" class="api-key-scope-cb" value="write" checked /> <span><strong>Write</strong> - Write files and data</span></label>';
                h += '<label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;"><input type="checkbox" class="api-key-scope-cb" value="execute" checked /> <span><strong>Execute</strong> - Execute terminal commands</span></label>';
                h += '<label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;"><input type="checkbox" class="api-key-scope-cb" value="admin" /> <span><strong>Admin</strong> - Full administrative access</span></label>';
                h += '</div>';
                h += '</div>';
                
                // Expiration
                h += '<div style="margin-bottom: 20px;">';
                h += '<label style="display: block; font-size: 13px; font-weight: 500; margin-bottom: 8px;">Expiration</label>';
                h += '<div style="display: flex; gap: 12px; flex-wrap: wrap;">';
                h += '<label style="display: flex; align-items: center; gap: 4px; font-size: 13px; cursor: pointer;"><input type="radio" name="api-key-expiry" value="0" checked /> Never</label>';
                h += '<label style="display: flex; align-items: center; gap: 4px; font-size: 13px; cursor: pointer;"><input type="radio" name="api-key-expiry" value="30" /> 30 days</label>';
                h += '<label style="display: flex; align-items: center; gap: 4px; font-size: 13px; cursor: pointer;"><input type="radio" name="api-key-expiry" value="90" /> 90 days</label>';
                h += '<label style="display: flex; align-items: center; gap: 4px; font-size: 13px; cursor: pointer;"><input type="radio" name="api-key-expiry" value="365" /> 1 year</label>';
                h += '</div>';
                h += '</div>';
                
                // Error display
                h += '<div id="api-key-create-error" style="display: none; margin-bottom: 12px; padding: 10px; background: #fee2e2; color: #991b1b; border-radius: 6px; font-size: 13px;"></div>';
                
                // Buttons
                h += '<div style="display: flex; justify-content: flex-end; gap: 10px;">';
                h += '<button class="button api-key-cancel-btn">Cancel</button>';
                h += '<button class="button api-key-create-submit-btn" style="background: #3b82f6; color: white; border: none;">Create Key</button>';
                h += '</div>';
                h += '</div>';
                
                const win = await UIWindow({
                    body_content: h,
                    width: 480,
                    backdrop: true,
                    is_resizable: false,
                    has_head: false,
                    body_css: {
                        width: 'initial',
                        'background-color': '#fff',
                        padding: '0',
                        'border-radius': '8px',
                    },
                });
                
                const $win = $(win);
                
                // Cancel button
                $win.find('.api-key-cancel-btn').on('click', () => {
                    $win.close();
                });
                
                // Submit button
                $win.find('.api-key-create-submit-btn').on('click', async () => {
                    const name = $win.find('#api-key-name-input').val().trim();
                    const $errorDiv = $win.find('#api-key-create-error');
                    
                    if (!name) {
                        $errorDiv.text('Please enter a name for the API key').show();
                        return;
                    }
                    
                    // Get selected scopes
                    const scopes = [];
                    $win.find('.api-key-scope-cb:checked').each(function() {
                        scopes.push($(this).val());
                    });
                    
                    if (scopes.length === 0) {
                        $errorDiv.text('Please select at least one permission').show();
                        return;
                    }
                    
                    // Get expiration
                    const expiryDays = parseInt($win.find('input[name="api-key-expiry"]:checked').val(), 10);
                    
                    // Disable button
                    const $btn = $win.find('.api-key-create-submit-btn');
                    $btn.prop('disabled', true).text('Creating...');
                    $errorDiv.hide();
                    
                    try {
                        const response = await fetch(`${apiOrigin}/api/keys`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
                            },
                            body: JSON.stringify({
                                name,
                                scopes,
                                expires_in_days: expiryDays > 0 ? expiryDays : undefined
                            })
                        });
                        
                        if (!response.ok) {
                            const err = await response.json().catch(() => ({}));
                            throw new Error(err.error || `Failed: ${response.status}`);
                        }
                        
                        const data = await response.json();
                        $win.close();
                        
                        // Show the key
                        showKeyCreatedModal(data.key);
                        
                        // Reload list
                        loadApiKeys();
                        
                    } catch (error) {
                        console.error('[Security] Failed to create API key:', error);
                        $errorDiv.text('Failed to create: ' + error.message).show();
                        $btn.prop('disabled', false).text('Create Key');
                    }
                });
                
                // Focus name input
                setTimeout(() => $win.find('#api-key-name-input').focus(), 100);
            }
            
            // Show Key Created Modal
            async function showKeyCreatedModal(key) {
                const successIcon = window.icons?.['checkmark.svg'] ? `<img src="${window.icons['checkmark.svg']}" style="width: 24px; height: 24px;">` : '';
                const warnIcon = window.icons?.['warning-sign.svg'] ? `<img src="${window.icons['warning-sign.svg']}" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;">` : '';
                
                let h = '';
                h += '<div style="padding: 20px; max-width: 500px;">';
                h += '<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">';
                h += `<span style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; background: #dcfce7; border-radius: 50%;">${successIcon}</span>`;
                h += '<h3 style="margin: 0; font-size: 18px; font-weight: 500; color: #166534;">API Key Created</h3>';
                h += '</div>';
                
                // Warning
                h += '<div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 6px; padding: 12px; margin-bottom: 16px;">';
                h += `<strong style="display: block; color: #92400e; font-size: 13px; margin-bottom: 4px;">${warnIcon}Save this key now!</strong>`;
                h += '<span style="font-size: 12px; color: #78350f;">This key will only be shown once and cannot be retrieved later.</span>';
                h += '</div>';
                
                // Key display
                h += '<div style="background: #f3f4f6; border-radius: 6px; padding: 12px; margin-bottom: 16px; position: relative;">';
                h += `<code id="api-key-display" style="font-size: 12px; word-break: break-all; display: block; padding-right: 70px;">${key.api_key}</code>`;
                h += '<button id="api-key-copy-btn" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: #fff; border: 1px solid #d1d5db; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 12px;">Copy</button>';
                h += '</div>';
                
                // Usage example
                h += '<div style="margin-bottom: 16px;">';
                h += '<strong style="font-size: 13px; display: block; margin-bottom: 8px;">Usage:</strong>';
                h += '<div style="background: #1f2937; color: #e5e7eb; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 11px; overflow-x: auto;">';
                h += `curl -H "X-API-Key: ${key.api_key.substring(0, 20)}..." \\<br>&nbsp;&nbsp;${apiOrigin}/api/terminal/exec \\<br>&nbsp;&nbsp;-d '{"command": "echo Hello"}'`;
                h += '</div>';
                h += '</div>';
                
                // Key info
                h += '<div style="font-size: 12px; color: #6b7280;">';
                h += `<strong>Name:</strong> ${key.name}<br>`;
                h += `<strong>Scopes:</strong> ${key.scopes.join(', ')}<br>`;
                h += `<strong>Expires:</strong> ${key.expires_at ? new Date(key.expires_at).toLocaleDateString() : 'Never'}`;
                h += '</div>';
                
                // Done button
                h += '<div style="display: flex; justify-content: flex-end; margin-top: 20px;">';
                h += '<button class="button api-key-done-btn" style="background: #3b82f6; color: white; border: none;">Done</button>';
                h += '</div>';
                h += '</div>';
                
                const win = await UIWindow({
                    body_content: h,
                    width: 520,
                    backdrop: true,
                    is_resizable: false,
                    has_head: false,
                    body_css: {
                        width: 'initial',
                        'background-color': '#fff',
                        padding: '0',
                        'border-radius': '8px',
                    },
                });
                
                const $win = $(win);
                
                // Copy button
                $win.find('#api-key-copy-btn').on('click', async function() {
                    const keyText = key.api_key;
                    try {
                        await navigator.clipboard.writeText(keyText);
                        $(this).text('Copied!');
                        setTimeout(() => $(this).text('Copy'), 2000);
                    } catch (err) {
                        // Fallback
                        const textarea = document.createElement('textarea');
                        textarea.value = keyText;
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textarea);
                        $(this).text('Copied!');
                        setTimeout(() => $(this).text('Copy'), 2000);
                    }
                });
                
                // Done button
                $win.find('.api-key-done-btn').on('click', () => {
                    $win.close();
                });
            }
            
            // Create Key button handler
            $el_window.find('.api-keys-create-btn').on('click', () => {
                showCreateKeyModal();
            });
            
            // Copy Agent Prompt button handler
            $el_window.find('.copy-agent-prompt-btn').on('click', async function() {
                const $btn = $(this);
                const originalText = $btn.text();
                const apiEndpoint = window.api_origin || 'http://localhost:4200';
                
                const prompt = `I want you to help me manage my PC2 cloud storage. Here's how to connect:

**API Endpoint:** ${apiEndpoint}
**Authentication:** Use the X-API-Key header with my API key
**Tool Schema:** GET ${apiEndpoint}/api/tools/openapi

To make API calls, use this format:
\`\`\`bash
curl -X [METHOD] "${apiEndpoint}/[endpoint]" \\
  -H "X-API-Key: [API_KEY]" \\
  -H "Content-Type: application/json" \\
  -d '[JSON_BODY]'
\`\`\`

Available capabilities:
- File operations: read, write, copy, move, delete, search
- Terminal: execute commands and scripts  
- Git: clone, commit, push, pull, status
- HTTP: make external API requests, download files
- Scheduler: create cron-style automated tasks
- System: storage stats, backups, audit logs

Please fetch the OpenAPI schema first to see all available tools and their parameters.`;

                try {
                    await navigator.clipboard.writeText(prompt);
                    // Show success on button
                    $btn.text('Copied!').css('background', '#16a34a').css('color', '#fff');
                    setTimeout(() => {
                        $btn.text(originalText).css('background', '').css('color', '');
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy:', err);
                    // Show error on button
                    $btn.text('Failed to copy').css('background', '#dc2626').css('color', '#fff');
                    setTimeout(() => {
                        $btn.text(originalText).css('background', '').css('color', '');
                    }, 2000);
                }
            });
            
            // Initial load
            loadApiKeys();
            
            // ACCESS CONTROL INIT
            
            // Load owner info
            async function loadOwnerInfo() {
                try {
                    const response = await fetch(`${apiOrigin}/api/access/status`, { credentials: 'include' });
                    const data = await response.json();
                    const ownerEl = $el_window.find('#owner-wallet');
                    if (data.ownerWallet) {
                        const short = data.ownerWallet.substring(0, 10) + '...' + data.ownerWallet.substring(data.ownerWallet.length - 6);
                        ownerEl.text(short).attr('title', data.ownerWallet);
                    } else {
                        ownerEl.text('Not set (first login will claim)').css('color', '#f59e0b');
                    }
                } catch (error) {
                    $el_window.find('#owner-wallet').text('Error loading');
                }
            }
            
            // Load allowed wallets
            async function loadAllowedWallets() {
                const listEl = $el_window.find('#allowed-wallets-list');
                listEl.html('<div style="text-align: center; padding: 10px; color: #999; font-size: 12px;">Loading...</div>');
                try {
                    const response = await fetch(`${apiOrigin}/api/access/list`, { credentials: 'include' });
                    const data = await response.json();
                    if (!data.success) {
                        listEl.html(`<div style="color: #ef4444; padding: 10px; font-size: 12px;">${data.error || 'Failed to load'}</div>`);
                        return;
                    }
                    const wallets = data.wallets || [];
                    if (wallets.length === 0) {
                        listEl.html('<div style="text-align: center; padding: 10px; color: #999; font-size: 12px;">No additional wallets added.</div>');
                        return;
                    }
                    let html = '';
                    for (const entry of wallets) {
                        const shortWallet = entry.wallet.substring(0, 10) + '...' + entry.wallet.substring(entry.wallet.length - 4);
                        const roleColor = entry.role === 'admin' ? '#3b82f6' : '#22c55e';
                        html += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 12px;">
                            <div><span style="font-family: monospace;" title="${entry.wallet}">${shortWallet}</span>
                            <span style="margin-left: 6px; padding: 1px 6px; background: ${roleColor}15; color: ${roleColor}; border-radius: 3px; font-size: 10px;">${entry.role}</span></div>
                            <button class="button btn-remove-wallet" data-wallet="${entry.wallet}" style="font-size: 10px; padding: 3px 8px; color: #dc2626; border-color: #fca5a5;">Remove</button>
                        </div>`;
                    }
                    listEl.html(html);
                    listEl.find('.btn-remove-wallet').on('click', async function() {
                        const wallet = $(this).data('wallet');
                        if (!confirm('Remove this wallet?')) return;
                        const resp = await fetch(`${apiOrigin}/api/access/remove`, {
                            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                            credentials: 'include', body: JSON.stringify({ wallet })
                        });
                        const result = await resp.json();
                        if (result.success) loadAllowedWallets();
                        else alert(result.error || 'Failed');
                    });
                } catch (error) {
                    listEl.html('<div style="color: #ef4444; padding: 10px; font-size: 12px;">Error loading</div>');
                }
            }
            
            // Add wallet handler
            $el_window.find('#btn-add-wallet').on('click', async function() {
                const wallet = $el_window.find('#add-wallet-address').val().trim().toLowerCase();
                const role = $el_window.find('#add-wallet-role').val();
                const statusEl = $el_window.find('#add-wallet-status');
                const btn = $(this);
                if (!wallet) { statusEl.html('<span style="color: #ef4444;">Enter wallet address</span>'); return; }
                if (!/^0x[a-f0-9]{40}$/i.test(wallet)) { statusEl.html('<span style="color: #ef4444;">Invalid format</span>'); return; }
                btn.prop('disabled', true).text('Adding...');
                try {
                    const resp = await fetch(`${apiOrigin}/api/access/add`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        credentials: 'include', body: JSON.stringify({ wallet, role })
                    });
                    const result = await resp.json();
                    if (result.success) {
                        statusEl.html('<span style="color: #22c55e;">Added!</span>');
                        $el_window.find('#add-wallet-address').val('');
                        loadAllowedWallets();
                        setTimeout(() => statusEl.html(''), 2000);
                    } else {
                        statusEl.html(`<span style="color: #ef4444;">${result.error}</span>`);
                    }
                } catch (e) { statusEl.html('<span style="color: #ef4444;">Error</span>'); }
                btn.prop('disabled', false).text('Add');
            });
            
            $el_window.find('#btn-refresh-wallets').on('click', () => loadAllowedWallets());
            
            loadOwnerInfo();
            loadAllowedWallets();
        }
    },
};
