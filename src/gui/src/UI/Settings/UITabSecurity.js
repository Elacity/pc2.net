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
        let h = '';
        let user = window.user;

        // Compact styles
        h += `<style>
            .security-section { margin-bottom: 16px; }
            .security-section-title {
                font-size: 11px;
                font-weight: 700;
                color: #000;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 8px;
                padding-left: 2px;
            }
            .security-card {
                background: #f9f9f9;
                border-radius: 8px;
                padding: 12px 14px;
                margin-bottom: 6px;
            }
            .security-group {
                background: #f9f9f9;
                border-radius: 8px;
                border: 1px solid #d0d0d0;
                overflow: hidden;
            }
            .security-group-row {
                padding: 12px 14px;
                border-bottom: 1px solid #e5e5e5;
            }
            .security-group-row:last-child {
                border-bottom: none;
            }
            .security-card-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .security-card-label {
                font-size: 13px;
                font-weight: 500;
                color: #333;
            }
            .security-card-sublabel {
                font-size: 11px;
                color: #999;
                margin-top: 2px;
            }
            .security-btn {
                font-size: 12px;
                padding: 5px 12px;
                border-radius: 4px;
                cursor: pointer;
                line-height: 1.2;
                height: auto;
                margin: 0;
            }
            .security-input {
                padding: 6px 10px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 12px;
            }
        </style>`;

        // Check if PC2 mode
        const isPC2Mode = window.api_origin && (
            window.api_origin.includes('127.0.0.1:4200') || 
            window.api_origin.includes('localhost:4200') ||
            window.api_origin.includes('127.0.0.1:4202') ||
            window.api_origin.includes('localhost:4202') ||
            window.location.origin === window.api_origin
        );

        // Authentication Section
        h += `<div class="security-section">`;
        h += `<div class="security-section-title">Authentication</div>`;
        h += `<div class="security-group">`;
        
        // Password (not for wallet users)
        if (!user.is_temp && !user.wallet_address) {
            h += `<div class="security-group-row">`;
            h += `<div class="security-card-row">`;
            h += `<span class="security-card-label">${i18n('password')}</span>`;
            h += `<button class="button security-btn change-password">${i18n('change_password')}</button>`;
            h += `</div></div>`;
        }

        // Session manager
        h += `<div class="security-group-row">`;
        h += `<div class="security-card-row">`;
        h += `<span class="security-card-label">${i18n('sessions')}</span>`;
        h += `<button class="button security-btn manage-sessions">${i18n('manage_sessions')}</button>`;
        h += `</div></div>`;

        // 2FA (only for email users)
        if (!user.is_temp && user.email_confirmed && !user.wallet_address) {
            const statusClass = user.otp ? 'status-ok' : 'status-warning';
            h += `<div class="security-group-row">`;
            h += `<div class="security-card-row">`;
            h += `<div>`;
            h += `<span class="security-card-label">${i18n('two_factor')}</span>`;
            h += `<div class="security-card-sublabel user-otp-state ${statusClass}">${i18n(user.otp ? 'two_factor_enabled' : 'two_factor_disabled')}</div>`;
            h += `</div>`;
            h += `<div>`;
            h += `<button class="button security-btn enable-2fa" style="${user.otp ? 'display:none;' : ''}">${i18n('enable_2fa')}</button>`;
            h += `<button class="button security-btn disable-2fa" style="${user.otp ? '' : 'display:none;'}">${i18n('disable_2fa')}</button>`;
            h += `</div>`;
            h += `</div></div>`;
        }
        
        // Wallet Security (for wallet users)
        if (user.wallet_address) {
            h += `<div class="security-group-row" style="background: #f0fdf4;">`;
            h += `<div class="security-card-row">`;
            h += `<div style="display: flex; align-items: center; gap: 8px;">`;
            h += `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>`;
            h += `<div>`;
            h += `<span class="security-card-label" style="color: #166534;">Wallet Authentication</span>`;
            h += `<div class="security-card-sublabel" style="color: #15803d;">Secured by blockchain cryptography</div>`;
            h += `</div>`;
            h += `</div>`;
            h += `<span style="color: #16a34a; font-size: 12px;">Connected</span>`;
            h += `</div></div>`;
        }
        h += `</div>`;
        h += `</div>`;
        
        // PC2 Mode sections
        if (isPC2Mode) {
            // ACCESS CONTROL
            h += `<div class="security-section">`;
            h += `<div class="security-section-title">Access Control</div>`;
            h += `<div class="security-group">`;
            
            // Owner info
            h += `<div class="security-group-row">`;
            h += `<div class="security-card-row">`;
            h += `<span class="security-card-label">Node Owner</span>`;
            h += `<span id="owner-wallet" style="font-size: 11px; font-family: monospace; color: #666;">Loading...</span>`;
            h += `</div></div>`;

            // Add wallet account
            h += `<div class="security-group-row">`;
            h += `<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">`;
            h += `<span class="security-card-label">Add Wallet Account</span>`;
            h += `<span style="cursor: help; color: #9ca3af; font-size: 12px;" title="This wallet will be able to create an account on this PC2 node with its own files and settings.">ⓘ</span>`;
            h += `</div>`;
            h += `<div style="display: flex; gap: 6px; align-items: center;">`;
            h += `<input type="text" id="add-wallet-address" class="security-input" placeholder="0x..." style="flex: 1; font-family: monospace;">`;
            h += `<select id="add-wallet-role" class="security-input" style="width: 80px;"><option value="member">Member</option><option value="admin">Admin</option></select>`;
            h += `<button id="btn-add-wallet" class="button security-btn">Add</button>`;
            h += `</div>`;
            h += `<div id="add-wallet-status" style="margin-top: 4px; font-size: 10px; min-height: 14px;"></div>`;
            h += `</div>`;

            // Accounts on this node
            h += `<div class="security-group-row">`;
            h += `<div class="security-card-row" style="margin-bottom: 8px;">`;
            h += `<span class="security-card-label">Accounts on this Node</span>`;
            h += `<button id="btn-refresh-wallets" class="button security-btn" style="font-size: 10px; padding: 3px 8px;">Refresh</button>`;
            h += `</div>`;
            h += `<div id="allowed-wallets-list" style="min-height: 30px; font-size: 12px;">Loading...</div>`;
            h += `</div>`;
            h += `</div>`;
            h += `</div>`;

            // LOGIN HISTORY
            h += `<div class="security-section">`;
            h += `<div class="security-section-title">Login History</div>`;
            h += `<div class="security-group">`;
            h += `<div id="security-login-history" class="security-group-row" style="min-height: 40px;">Loading...</div>`;
            h += `</div>`;
            h += `</div>`;
            
            // API KEYS
            h += `<div class="security-section">`;
            h += `<div class="security-section-title">API Keys</div>`;
            h += `<div class="security-group">`;
            h += `<div class="security-group-row">`;
            h += `<div class="security-card-row" style="margin-bottom: 8px;">`;
            h += `<div>`;
            h += `<span class="security-card-label">Programmatic Access</span>`;
            h += `<div class="security-card-sublabel">Enable AI agents and automation</div>`;
            h += `</div>`;
            h += `<button class="button security-btn api-keys-create-btn">+ Create Key</button>`;
            h += `</div>`;
            h += `<div id="security-api-keys-list" style="border-top: 1px solid #e5e7eb; padding-top: 8px; min-height: 30px; font-size: 12px;">Loading...</div>`;
            h += `</div>`;
            h += `</div>`;
            h += `</div>`;
            
            // AI AGENT INTEGRATION
            h += `<div class="security-section">`;
            h += `<div class="security-section-title">AI Agent Integration</div>`;
            h += `<div class="security-card" style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border: 1px solid #7dd3fc;">`;
            h += `<div class="security-card-label" style="color: #0369a1; margin-bottom: 8px;">Connect AI Agents to Your PC2 Cloud</div>`;
            
            h += `<div style="background: #fff; border-radius: 4px; padding: 8px; margin-bottom: 6px; font-size: 11px;">`;
            h += `<div style="color: #64748b; margin-bottom: 2px;">API Endpoint</div>`;
            h += `<code style="font-family: monospace; font-size: 12px;">${window.api_origin || 'http://localhost:4200'}</code>`;
            h += `</div>`;
            
            h += `<div style="background: #fff; border-radius: 4px; padding: 8px; margin-bottom: 6px; font-size: 11px;">`;
            h += `<div style="color: #64748b; margin-bottom: 2px;">OpenAPI Schema</div>`;
            h += `<a href="${window.api_origin || 'http://localhost:4200'}/api/tools/openapi" target="_blank" style="font-family: monospace; font-size: 11px; color: #2563eb;">${window.api_origin || 'http://localhost:4200'}/api/tools/openapi</a>`;
            h += `</div>`;
            
            h += `<button class="button security-btn copy-agent-prompt-btn" style="margin-top: 6px;">Copy Setup Prompt for AI</button>`;
            h += `</div>`;
            h += `</div>`;
            
            // API Key styles
            h += `<style>
                .api-key-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
                .api-key-item:last-child { border-bottom: none; }
                .api-key-name { font-weight: 500; font-size: 12px; color: #1f2937; }
                .api-key-meta { font-size: 10px; color: #6b7280; margin-top: 2px; }
                .api-key-scope { font-size: 9px; padding: 1px 4px; border-radius: 2px; background: #e0e7ff; color: #3730a3; margin-left: 4px; }
                .api-key-scope.revoked { background: #fee2e2; color: #991b1b; }
                .status-ok { color: #16a34a !important; }
                .status-warning { color: #d97706 !important; }
            </style>`;
        }

        return h;
    },
    init: ($el_window) => {
        // 2FA handlers
        $el_window.find('.enable-2fa').on('click', async function() {
            const { promise } = await UIWindow2FASetup();
            const tfa_was_enabled = await promise;
            if (tfa_was_enabled) {
                $el_window.find('.enable-2fa').hide();
                $el_window.find('.disable-2fa').show();
                $el_window.find('.user-otp-state').text(i18n('two_factor_enabled')).removeClass('status-warning').addClass('status-ok');
            }
        });

        $el_window.find('.disable-2fa').on('click', async function() {
            let win;
            const password_confirm_promise = new TeePromise();
            
            const try_password = async () => {
                const value = $(win).find('.password-entry').val();
                const resp = await fetch(`${window.api_origin}/user-protected/disable-2fa`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${puter.authToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: value }),
                });
                if (resp.status !== 200) {
                    let message; try { message = (await resp.json()).message; } catch (e) {}
                    alert(message || 'Failed');
                    return;
                }
                password_confirm_promise.resolve(true);
                $(win).close();
            };

            win = await UIComponentWindow({
                html: `<div style="padding: 20px;"><h3 style="margin: 0 0 12px; font-size: 16px;">${i18n('disable_2fa_confirm')}</h3><p style="font-size: 13px; margin-bottom: 12px;">${i18n('disable_2fa_instructions')}</p><div style="display: flex; gap: 6px;"><input type="password" class="password-entry" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" /><button class="button confirm-disable-2fa">${i18n('disable_2fa')}</button><button class="button cancel-disable-2fa">Cancel</button></div></div>`,
                width: 400, backdrop: true, is_resizable: false,
                body_css: { width: 'initial', 'background-color': '#fff', padding: '0' },
            });

            const $win = $(win);
            $win.find('.password-entry').on('keypress', e => { if (e.which === 13) try_password(); });
            $win.find('.confirm-disable-2fa').on('click', try_password);
            $win.find('.cancel-disable-2fa').on('click', () => { password_confirm_promise.resolve(false); $win.close(); });
            $win.find('.password-entry').focus();

            const ok = await password_confirm_promise;
            if (!ok) return;

            $el_window.find('.enable-2fa').show();
            $el_window.find('.disable-2fa').hide();
            $el_window.find('.user-otp-state').text(i18n('two_factor_disabled')).removeClass('status-ok').addClass('status-warning');
        });
        
        // PC2 Mode functionality
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
                            container.html('<div style="color: #999; font-size: 12px;">No login history</div>');
                        } else {
                            let h = '';
                            logins.slice(0, 5).forEach(login => {
                                const date = new Date(login.timestamp).toLocaleString();
                                const isCurrent = login.is_current;
                                h += `<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; font-size: 11px;">`;
                                h += `<div><strong>${login.ip || 'Unknown'}</strong><br><span style="color: #666;">${(login.user_agent || '').substring(0, 30)}...</span></div>`;
                                h += `<div style="text-align: right;">${date}${isCurrent ? '<br><span style="color: #16a34a;">Current</span>' : ''}</div>`;
                                h += `</div>`;
                            });
                            container.html(h);
                        }
                    } else {
                        container.html('<div style="color: #999; font-size: 12px;">Not available</div>');
                    }
                } catch (error) {
                    $el_window.find('#security-login-history').html('<div style="color: #999; font-size: 12px;">Failed to load</div>');
                }
            })();
            
            // API Keys
            async function loadApiKeys() {
                const container = $el_window.find('#security-api-keys-list');
                container.html('<div style="color: #999;">Loading...</div>');
                
                try {
                    const response = await fetch(`${apiOrigin}/api/keys`, {
                        headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
                    });
                    
                    if (!response.ok) throw new Error('Failed');
                    
                    const data = await response.json();
                    const keys = data.keys || [];
                    
                    if (keys.length === 0) {
                        container.html('<div style="color: #999;">No API keys. Create one to enable access.</div>');
                        return;
                    }
                    
                    let h = '';
                    keys.filter(k => !k.revoked).forEach(key => {
                        const created = new Date(key.created_at).toLocaleDateString();
                        const scopes = (key.scopes || []).map(s => `<span class="api-key-scope">${s}</span>`).join('');
                        h += `<div class="api-key-item" data-key-id="${key.key_id}">`;
                        h += `<div><div class="api-key-name">${key.name}${scopes}</div><div class="api-key-meta">Created: ${created}</div></div>`;
                        h += `<button class="button security-btn api-key-revoke-btn" data-key-id="${key.key_id}" style="color: #dc2626; border-color: #fca5a5; font-size: 10px; padding: 3px 8px;">Revoke</button>`;
                        h += `</div>`;
                    });
                    
                    container.html(h || '<div style="color: #999;">No active keys.</div>');
                    
                    container.find('.api-key-revoke-btn').on('click', async function() {
                        const keyId = $(this).data('key-id');
                        if (!confirm('Revoke this key?')) return;
                        await fetch(`${apiOrigin}/api/keys/${keyId}/revoke`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) }
                        });
                        loadApiKeys();
                    });
                } catch (error) {
                    container.html('<div style="color: #dc2626;">Failed to load</div>');
                }
            }
            
            // Create API Key
            $el_window.find('.api-keys-create-btn').on('click', async () => {
                let h = '<div style="padding: 16px; max-width: 380px;">';
                h += '<h3 style="margin: 0 0 12px; font-size: 15px;">Create API Key</h3>';
                h += '<input type="text" id="api-key-name-input" placeholder="Key name (e.g., claude-agent)" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px; box-sizing: border-box; font-size: 13px;">';
                h += '<div style="margin-bottom: 10px; font-size: 12px;"><strong>Permissions:</strong><br>';
                h += '<label style="display: block; margin: 4px 0;"><input type="checkbox" class="scope-cb" value="read" checked> Read</label>';
                h += '<label style="display: block; margin: 4px 0;"><input type="checkbox" class="scope-cb" value="write" checked> Write</label>';
                h += '<label style="display: block; margin: 4px 0;"><input type="checkbox" class="scope-cb" value="execute" checked> Execute</label>';
                h += '</div>';
                h += '<div id="create-key-error" style="display: none; color: #dc2626; font-size: 12px; margin-bottom: 8px;"></div>';
                h += '<div style="display: flex; gap: 6px; justify-content: flex-end;">';
                h += '<button class="button cancel-btn">Cancel</button>';
                h += '<button class="button create-btn" style="background: #3b82f6; color: white;">Create</button>';
                h += '</div></div>';
                
                const win = await UIWindow({ body_content: h, width: 400, backdrop: true, is_resizable: false, has_head: false, body_css: { 'background-color': '#fff', padding: '0', 'border-radius': '8px' } });
                const $win = $(win);
                
                $win.find('.cancel-btn').on('click', () => $win.close());
                $win.find('.create-btn').on('click', async () => {
                    const name = $win.find('#api-key-name-input').val().trim();
                    const scopes = []; $win.find('.scope-cb:checked').each(function() { scopes.push($(this).val()); });
                    if (!name) { $win.find('#create-key-error').text('Enter a name').show(); return; }
                    if (scopes.length === 0) { $win.find('#create-key-error').text('Select at least one permission').show(); return; }
                    
                    $win.find('.create-btn').prop('disabled', true).text('...');
                    try {
                        const resp = await fetch(`${apiOrigin}/api/keys`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) },
                            body: JSON.stringify({ name, scopes })
                        });
                        if (!resp.ok) throw new Error('Failed');
                        const data = await resp.json();
                        $win.close();
                        
                        // Show key
                        const keyWin = await UIWindow({
                            body_content: `<div style="padding: 16px;"><h3 style="margin: 0 0 8px; font-size: 15px; color: #166534;">Key Created!</h3><p style="font-size: 12px; color: #92400e; margin-bottom: 10px;">Save this key now - it won't be shown again.</p><div style="background: #f3f4f6; padding: 10px; border-radius: 4px; margin-bottom: 10px;"><code style="font-size: 11px; word-break: break-all;">${data.key.api_key}</code></div><button class="button copy-key-btn" style="width: 100%;">Copy Key</button></div>`,
                            width: 380, backdrop: true, is_resizable: false, has_head: false, body_css: { 'background-color': '#fff', padding: '0', 'border-radius': '8px' }
                        });
                        $(keyWin).find('.copy-key-btn').on('click', function() {
                            navigator.clipboard.writeText(data.key.api_key);
                            $(this).text('Copied!');
                            setTimeout(() => $(keyWin).close(), 1000);
                        });
                        loadApiKeys();
                    } catch (e) {
                        $win.find('#create-key-error').text('Failed to create').show();
                        $win.find('.create-btn').prop('disabled', false).text('Create');
                    }
                });
                $win.find('#api-key-name-input').focus();
            });
            
            // Copy Agent Prompt
            $el_window.find('.copy-agent-prompt-btn').on('click', async function() {
                const $btn = $(this);
                const prompt = `PC2 Cloud API
Endpoint: ${window.api_origin || 'http://localhost:4200'}
Auth: X-API-Key header
Schema: ${window.api_origin || 'http://localhost:4200'}/api/tools/openapi

Capabilities: files, terminal, git, http, scheduler`;
                try {
                    await navigator.clipboard.writeText(prompt);
                    $btn.text('Copied!');
                    setTimeout(() => $btn.text('Copy Setup Prompt for AI'), 2000);
                } catch (e) {
                    $btn.text('Failed');
                    setTimeout(() => $btn.text('Copy Setup Prompt for AI'), 2000);
                }
            });
            
            // Access Control
            async function loadOwnerInfo() {
                try {
                    const resp = await fetch(`${apiOrigin}/api/access/status`, { 
                        headers: { 'Authorization': `Bearer ${authToken}` },
                        credentials: 'include' 
                    });
                    const data = await resp.json();
                    const ownerEl = $el_window.find('#owner-wallet');
                    if (data.ownerWallet) {
                        const short = data.ownerWallet.substring(0, 8) + '...' + data.ownerWallet.substring(data.ownerWallet.length - 4);
                        ownerEl.text(short).attr('title', data.ownerWallet);
                    } else {
                        ownerEl.text('Not set').css('color', '#f59e0b');
                    }
                } catch (e) {
                    $el_window.find('#owner-wallet').text('Error');
                }
            }
            
            async function loadAllowedWallets() {
                const listEl = $el_window.find('#allowed-wallets-list');
                listEl.html('Loading...');
                try {
                    const resp = await fetch(`${apiOrigin}/api/access/list`, { 
                        headers: { 'Authorization': `Bearer ${authToken}` },
                        credentials: 'include' 
                    });
                    const data = await resp.json();
                    if (!data.success) { listEl.html('Failed'); return; }
                    const wallets = data.wallets || [];
                    if (wallets.length === 0) { listEl.html('<span style="color: #999;">No additional wallets</span>'); return; }
                    
                    let h = '';
                    wallets.forEach(entry => {
                        const short = entry.wallet.substring(0, 8) + '...' + entry.wallet.substring(entry.wallet.length - 4);
                        const roleColor = entry.role === 'admin' ? '#3b82f6' : '#22c55e';
                        h += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid #eee;">`;
                        h += `<span><code style="font-size: 10px;">${short}</code> <span style="font-size: 9px; padding: 1px 4px; background: ${roleColor}15; color: ${roleColor}; border-radius: 2px;">${entry.role}</span></span>`;
                        h += `<button class="button security-btn btn-remove-wallet" data-wallet="${entry.wallet}" style="font-size: 9px; padding: 2px 6px; color: #dc2626;">×</button>`;
                        h += `</div>`;
                    });
                    listEl.html(h);
                    listEl.find('.btn-remove-wallet').on('click', async function() {
                        if (!confirm('Remove?')) return;
                        await fetch(`${apiOrigin}/api/access/remove`, { 
                            method: 'DELETE', 
                            headers: { 
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${authToken}`
                            }, 
                            credentials: 'include', 
                            body: JSON.stringify({ wallet: $(this).data('wallet') }) 
                        });
                        loadAllowedWallets();
                    });
                } catch (e) { listEl.html('Error'); }
            }
            
            $el_window.find('#btn-add-wallet').on('click', async function() {
                const wallet = $el_window.find('#add-wallet-address').val().trim().toLowerCase();
                const role = $el_window.find('#add-wallet-role').val();
                const statusEl = $el_window.find('#add-wallet-status');
                if (!wallet || !/^0x[a-f0-9]{40}$/i.test(wallet)) { statusEl.html('<span style="color: #ef4444;">Invalid</span>'); return; }
                $(this).prop('disabled', true).text('...');
                try {
                    const resp = await fetch(`${apiOrigin}/api/access/add`, { 
                        method: 'POST', 
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authToken}`
                        }, 
                        credentials: 'include', 
                        body: JSON.stringify({ wallet, role }) 
                    });
                    const result = await resp.json();
                    if (result.success) { statusEl.html('<span style="color: #22c55e;">Added!</span>'); $el_window.find('#add-wallet-address').val(''); loadAllowedWallets(); }
                    else statusEl.html(`<span style="color: #ef4444;">${result.error}</span>`);
                } catch (e) { statusEl.html('<span style="color: #ef4444;">Error</span>'); }
                $(this).prop('disabled', false).text('Add');
            });
            
            $el_window.find('#btn-refresh-wallets').on('click', loadAllowedWallets);
            
            loadOwnerInfo();
            loadAllowedWallets();
            loadApiKeys();
        }
    },
};
