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

import UIWindowChangePassword from '../UIWindowChangePassword.js';
import UIWindowChangeEmail from './UIWindowChangeEmail.js';
import UIWindowChangeUsername from '../UIWindowChangeUsername.js';
import UIWindowConfirmUserDeletion from './UIWindowConfirmUserDeletion.js';
import UIWindowManageSessions from '../UIWindowManageSessions.js';
import UIWindow from '../UIWindow.js';

// About
export default {
    id: 'account',
    title_i18n_key: 'account',
    icon: 'user.svg',
    html: () => {
        let h = '';
        // h += `<h1>${i18n('account')}</h1>`;

        // profile picture
        h += `<div style="overflow: hidden; display: flex; margin-bottom: 20px; flex-direction: column; align-items: center;">`;
            h += `<div class="profile-picture change-profile-picture" style="background-image: url('${html_encode(window.user?.profile?.picture ?? window.icons['profile.svg'])}');">`;
            h += `</div>`;
        h += `</div>`;

        // change password button
        if(!window.user.is_temp && !window.user.wallet_address){
            h += `<div class="settings-card">`;
                h += `<strong>${i18n('password')}</strong>`;
                h += `<div style="flex-grow:1;">`;
                    h += `<button class="button change-password" style="float:right;">${i18n('change_password')}</button>`;
                h += `</div>`;
            h += `</div>`;
        }

        // change username button
        if(!window.user.username && !window.user.wallet_address){
            h += `<div class="settings-card">`;
                h += `<div>`;
                    h += `<strong style="display:block;">${i18n('username')}</strong>`;
                    h += `<span class="username" style="display:block; margin-top:5px;">${html_encode(window.user.username)}</span>`;
                h += `</div>`;
                h += `<div style="flex-grow:1;">`;
                    h += `<button class="button change-username" style="float:right;">${i18n('change_username')}</button>`;
                h += `</div>`
            h += `</div>`;
        }
        
        // display user wallet addresses (EOA and Smart Account)
        const walletAddr = window.user.wallet_address || '';
        const smartAddr = window.user.smart_account_address || '';
        console.log('[Settings Account] wallet_address:', walletAddr, 'smart_account_address:', smartAddr);
        
        if(walletAddr || smartAddr){
            h += `<div class="settings-card" style="height: auto; min-height: 45px; flex-direction: column; align-items: flex-start; padding: 15px;">`;
                h += `<div style="width: 100%;">`;
                    // Show EOA wallet first
                    if(walletAddr){
                        h += `<div style="${smartAddr ? 'margin-bottom: 15px;' : ''}">`;
                            h += `<strong style="display:block;">${smartAddr ? i18n('eoa_address') : i18n('wallet_address')}</strong>`;
                            h += `<div style="display: flex; align-items: center; gap: 8px; margin-top: 5px;">`;
                                h += `<span style="font-family: monospace; font-size: 12px; word-break: break-all;">${html_encode(walletAddr)}</span>`;
                                h += `<span class="copy-address-btn" data-address="${html_encode(walletAddr)}" style="cursor: pointer; opacity: 0.6; flex-shrink: 0;" title="Copy address">`;
                                    h += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                                h += `</span>`;
                            h += `</div>`;
                            if(smartAddr){
                                h += `<span style="display:block; margin-top:3px; font-size: 11px; color: #666;">Externally Owned Account</span>`;
                            }
                        h += `</div>`;
                    }
                    // Show Smart Account below EOA (UniversalX identity)
                    if(smartAddr){
                        h += `<div>`;
                            h += `<strong style="display:block; color: #1976d2;">${i18n('smart_account_address')}</strong>`;
                            h += `<div style="display: flex; align-items: center; gap: 8px; margin-top: 5px;">`;
                                h += `<span style="font-family: monospace; font-size: 12px; word-break: break-all;">${html_encode(smartAddr)}</span>`;
                                h += `<span class="copy-address-btn" data-address="${html_encode(smartAddr)}" style="cursor: pointer; opacity: 0.6; flex-shrink: 0;" title="Copy address">`;
                                    h += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                                h += `</span>`;
                            h += `</div>`;
                            h += `<span style="display:block; margin-top:3px; font-size: 11px; color: #666;">UniversalX Smart Account (ERC-4337)</span>`;
                        h += `</div>`;
                    }
                h += `</div>`;
            h += `</div>`;
        }

        // change email button
        if(window.user.email){
            h += `<div class="settings-card">`;
                h += `<div>`;
                    h += `<strong style="display:block;">${i18n('email')}</strong>`;
                    h += `<span class="user-email" style="display:block; margin-top:5px;">${html_encode(window.user.email)}</span>`;
                h += `</div>`;
                h += `<div style="flex-grow:1;">`;
                    h += `<button class="button change-email" style="float:right;">${i18n('change_email')}</button>`;
                h += `</div>`;
            h += `</div>`;
        }

        // 'Delete Account' button
        h += `<div class="settings-card settings-card-danger">`;
            h += `<strong style="display: inline-block;">${i18n("delete_account")}</strong>`;
            h += `<div style="flex-grow:1;">`;
                h += `<button class="button button-danger delete-account" style="float:right;">${i18n("delete_account")}</button>`;
            h += `</div>`;
        h += `</div>`;

        return h;
    },
    init: ($el_window) => {
        const copyIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        const checkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

        // Copy address to clipboard
        $el_window.find('.copy-address-btn').on('click', function (e) {
            const address = $(this).data('address');
            const $btn = $(this);
            navigator.clipboard.writeText(address).then(() => {
                // Show checkmark
                $btn.html(checkIcon);
                $btn.css('opacity', '1');
                $btn.attr('title', 'Copied!');
                setTimeout(() => {
                    $btn.html(copyIcon);
                    $btn.css('opacity', '0.6');
                    $btn.attr('title', 'Copy address');
                }, 1500);
            });
        });

        // Hover effect for copy buttons
        $el_window.find('.copy-address-btn').on('mouseenter', function() {
            $(this).css('opacity', '1');
        }).on('mouseleave', function() {
            $(this).css('opacity', '0.6');
        });

        $el_window.find('.change-password').on('click', function (e) {
            UIWindowChangePassword({
                window_options:{
                    parent_uuid: $el_window.attr('data-element_uuid'),
                    disable_parent_window: true,
                    parent_center: true,
                }
            });
        });

        $el_window.find('.change-username').on('click', function (e) {
            UIWindowChangeUsername({
                window_options:{
                    parent_uuid: $el_window.attr('data-element_uuid'),
                    disable_parent_window: true,
                    parent_center: true,
                }
            });
        });

        $el_window.find('.change-email').on('click', function (e) {
            UIWindowChangeEmail({
                window_options:{
                    parent_uuid: $el_window.attr('data-element_uuid'),
                    disable_parent_window: true,
                    parent_center: true,
                }
            });
        });

        $el_window.find('.manage-sessions').on('click', function (e) {
            UIWindowManageSessions({
                window_options:{
                    parent_uuid: $el_window.attr('data-element_uuid'),
                    disable_parent_window: true,
                    parent_center: true,
                }
            });
        });

        $el_window.find('.delete-account').on('click', function (e) {
            UIWindowConfirmUserDeletion({
                window_options:{
                    parent_uuid: $el_window.attr('data-element_uuid'),
                    disable_parent_window: true,
                    parent_center: true,
                }
            });
        });

        $el_window.find('.change-profile-picture').on('click', async function (e) {
            // open dialog
            UIWindow({
                path: '/' + window.user.username + '/Desktop',
                // this is the uuid of the window to which this dialog will return
                parent_uuid: $el_window.attr('data-element_uuid'),
                allowed_file_types: ['.png', '.jpg', '.jpeg'],
                show_maximize_button: false,
                show_minimize_button: false,
                title: 'Open',
                is_dir: true,
                is_openFileDialog: true,
                selectable_body: false,
            });    
        })

        $el_window.on('file_opened', async function(e){
            let selected_file = Array.isArray(e.detail) ? e.detail[0] : e.detail;
            // set profile picture
            const profile_pic = await puter.fs.read(selected_file.path)
            // blob to base64
            const reader = new FileReader();
            reader.readAsDataURL(profile_pic);
            reader.onloadend = function() {
                // resizes the image to 150x150
                const img = new Image();
                img.src = reader.result;
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = 150;
                    canvas.height = 150;
                    ctx.drawImage(img, 0, 0, 150, 150);
                    const base64data = canvas.toDataURL('image/png');
                    // update profile picture
                    $el_window.find('.profile-picture').css('background-image', 'url(' + html_encode(base64data) + ')');
                    $('.profile-image').css('background-image', 'url(' + html_encode(base64data) + ')');
                    $('.profile-image').addClass('profile-image-has-picture');
                    // update profile picture
                    update_profile(window.user.username, {picture: base64data})
                }
            }
        })
    },
};