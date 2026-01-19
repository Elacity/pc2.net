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
        
        // Login History (PC2 mode)
        if (isPC2Mode) {
            h += '<h2 style="font-size: 14px; margin: 25px 0 10px; color: #333;">Login History</h2>';
            h += '<div id="security-login-history" class="settings-card" style="flex-direction: column; align-items: stretch; min-height: 100px;">';
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
            (async () => {
                try {
                    const apiOrigin = window.api_origin || window.location.origin;
                    const authToken = puter.authToken;
                    
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
        }
    },
};
