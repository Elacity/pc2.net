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
        // Use profile_picture_url from whoami response if available, otherwise fall back to profile.picture or default icon
        const profilePicUrl = window.user?.profile_picture_url || window.user?.profile?.picture || window.icons['profile.svg'];
        h += `<div style="overflow: hidden; display: flex; margin-bottom: 20px; flex-direction: column; align-items: center;">`;
            h += `<div class="profile-picture change-profile-picture" style="background-image: url('${html_encode(profilePicUrl)}'); cursor: pointer;" title="Click to change profile picture">`;
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

        // Profile picture click handler
        const $profilePic = $el_window.find('.change-profile-picture');
        console.log('[UITabAccount] Setting up profile picture click handler, found elements:', $profilePic.length);
        
        // Refresh profile picture with signed URL when Account tab is opened
        // This ensures the profile picture displays correctly even if Settings window opens after page load
        if (window.user?.profile_picture_url && $profilePic.length > 0) {
            console.log('[UITabAccount] Refreshing profile picture for Settings window');
            // Small delay to ensure DOM is ready
            setTimeout(() => {
                if (typeof window.refresh_profile_picture === 'function') {
                    window.refresh_profile_picture();
                }
            }, 100);
        }
        
        $profilePic.on('click', async function (e) {
            console.log('[UITabAccount] Profile picture clicked');
            e.preventDefault();
            e.stopPropagation();
            
            const parentUuid = $el_window.attr('data-element_uuid');
            console.log('[UITabAccount] Parent UUID:', parentUuid);
            console.log('[UITabAccount] Opening file dialog for profile picture');
            
            // open dialog
            UIWindow({
                path: '/' + (window.user?.username || window.user?.wallet_address || '') + '/Desktop',
                // this is the uuid of the window to which this dialog will return
                parent_uuid: parentUuid,
                allowed_file_types: ['.png', '.jpg', '.jpeg', 'image/*'],
                show_maximize_button: false,
                show_minimize_button: false,
                title: 'Select Profile Picture',
                is_dir: true,
                is_openFileDialog: true,
                selectable_body: false,
            });    
        });

        // File opened event listener - must be on the window element (not jQuery wrapper)
        console.log('[UITabAccount] Setting up file_opened event listener on window element');
        const windowElement = $el_window.get(0);
        if (windowElement) {
            windowElement.addEventListener('file_opened', async function(e) {
                console.log('[UITabAccount] file_opened event received:', e);
                console.log('[UITabAccount] Event detail:', e.detail);
            let selected_file = Array.isArray(e.detail) ? e.detail[0] : e.detail;
            console.log('[UITabAccount] File opened:', selected_file);
            console.log('[UITabAccount] File properties:', Object.keys(selected_file));
            
            // Get signed read_url for immediate display (works for CSS background-image)
            let signed_url = null;
            
            // Check various possible property names for the read URL
            if (selected_file.read_url) {
                signed_url = selected_file.read_url;
                console.log('[UITabAccount] Using read_url:', signed_url);
            } else if (selected_file.readURL) {
                signed_url = selected_file.readURL;
                console.log('[UITabAccount] Using readURL:', signed_url);
            } else if (selected_file.url) {
                signed_url = selected_file.url;
                console.log('[UITabAccount] Using url:', signed_url);
            } else if (selected_file.path) {
                // If we only have a path, sign it to get a read_url
                try {
                    console.log('[UITabAccount] Signing file path:', selected_file.path);
                    // Expand ~ to full path if needed
                    let filePath = selected_file.path;
                    if (filePath.startsWith('~')) {
                        filePath = filePath.replace('~', `/${window.user?.username || window.user?.wallet_address || ''}`);
                    }
                    
                    const signed = await puter.fs.sign(undefined, { path: filePath, action: 'read' });
                    console.log('[UITabAccount] Sign response:', signed);
                    
                    // Handle different response structures
                    let items = null;
                    if (signed && signed.items) {
                        items = Array.isArray(signed.items) ? signed.items : [signed.items];
                    } else if (signed && signed.signatures) {
                        items = Array.isArray(signed.signatures) ? signed.signatures : [signed.signatures];
                    } else if (signed && Array.isArray(signed)) {
                        items = signed;
                    } else if (signed && signed.read_url) {
                        signed_url = signed.read_url;
                        console.log('[UITabAccount] Got signed URL from single item:', signed_url);
                    }
                    
                    if (items && items.length > 0) {
                        const firstItem = items[0];
                        if (firstItem.read_url) {
                            signed_url = firstItem.read_url;
                            console.log('[UITabAccount] Got signed URL from items array:', signed_url);
                        } else if (firstItem.url) {
                            signed_url = firstItem.url;
                            console.log('[UITabAccount] Got URL from items array:', signed_url);
                        }
                    }
                } catch (err) {
                    console.warn('[UITabAccount] Failed to sign file:', err);
                }
            }
            
            if (signed_url) {
                // Store the file path for saving (not the signed URL)
                const profile_pic_path = selected_file.path || null;
                console.log('[UITabAccount] Setting profile picture - path:', profile_pic_path, 'signed_url:', signed_url);
                
                // Use signed URL for immediate display
                $el_window.find('.profile-picture').css('background-image', `url("${signed_url}")`);
                $('.profile-image').css('background-image', `url("${signed_url}")`);
                $('.profile-image').addClass('profile-image-has-picture');
                
                // Save the file path to backend (not base64)
                $.ajax({
                    url: `${window.api_origin}/set-profile-picture`,
                    type: 'POST',
                    data: JSON.stringify({
                        url: profile_pic_path,
                    }),
                    async: true,
                    contentType: 'application/json',
                    headers: {
                        'Authorization': `Bearer ${window.auth_token}`,
                    },
                    success: function(response) {
                        console.log('[UITabAccount] Profile picture saved successfully:', response);
                        // Also update window.user for immediate access
                        if (window.user) {
                            window.user.profile_picture_url = profile_pic_path;
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('[UITabAccount] Failed to save profile picture:', error, xhr);
                    },
                    statusCode: {
                        401: function () {
                            window.logout();
                        },
                    },
                });
            } else {
                console.warn('[UITabAccount] No signed URL available for file. File object:', selected_file);
            }
            });
        } else {
            console.warn('[UITabAccount] Window element not found, cannot attach file_opened listener');
        }
    },
};