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
        // Don't use profile_picture_url directly as it's a file path, not a URL
        // Use default Elastos icon initially, refresh_profile_picture will update with signed URL
        const DEFAULT_PROFILE_PICTURE = window.location.origin + '/images/elastos-icon-default.svg';
        const profilePicUrl = window.user?.profile?.picture || DEFAULT_PROFILE_PICTURE;
        const displayName = window.user?.display_name || '';
        
        h += `<div style="overflow: hidden; display: flex; margin-bottom: 20px; flex-direction: column; align-items: center;">`;
            h += `<div class="profile-picture change-profile-picture" style="background-image: url('${html_encode(profilePicUrl)}'); cursor: pointer;" title="Click to change profile picture">`;
            h += `</div>`;
            // Display name shown below profile picture
            h += `<div id="profile-display-name" style="margin-top: 12px; font-size: 20px; font-weight: 600; color: #333; text-align: center;">${html_encode(displayName) || '<span style="color: #999; font-weight: 400;">Set your display name</span>'}</div>`;
        h += `</div>`;
        
        // Display name setting (per-wallet)
        h += `<div class="settings-card">`;
            h += `<div style="flex: 1;">`;
                h += `<strong style="display:block;">Display Name</strong>`;
                h += `<span style="display:block; margin-top:5px; font-size: 12px; color: #666;">How you appear to others</span>`;
            h += `</div>`;
            h += `<div style="display: flex; align-items: center; gap: 8px;">`;
                h += `<input type="text" id="account-display-name" value="${html_encode(displayName)}" placeholder="Enter display name" style="padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; width: 180px; font-size: 13px;">`;
                h += `<button class="button save-display-name" style="font-size: 12px; padding: 0 12px; height: 28px; line-height: 28px;">Save</button>`;
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
            h += `<div style="margin: 24px 0 12px 0;"><strong style="font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Wallets</strong></div>`;
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

        // Node Identity Section (PC2 mode only)
        h += `<div id="node-identity-section" style="display: none;">`;
            h += `<div style="margin: 24px 0 12px 0;"><strong style="font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Node Identity</strong></div>`;
            
            // All node identity fields in one card (including recovery phrase)
            h += `<div class="settings-card" id="recovery-phrase-card" style="height: auto; min-height: 45px; flex-direction: column; align-items: flex-start; padding: 15px;">`;
                h += `<div style="width: 100%;">`;
                    // Node ID
                    h += `<div style="margin-bottom: 15px;">`;
                        h += `<strong style="display:block;">Node ID</strong>`;
                        h += `<div style="display: flex; align-items: center; gap: 8px; margin-top: 5px;">`;
                            h += `<span id="account-node-id" style="font-family: monospace; font-size: 12px; word-break: break-all;">Loading...</span>`;
                            h += `<span class="copy-node-btn" data-target="account-node-id-full" style="cursor: pointer; opacity: 0.6; flex-shrink: 0;" title="Copy Node ID">`;
                                h += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                            h += `</span>`;
                        h += `</div>`;
                        h += `<input type="hidden" id="account-node-id-full" value="">`;
                    h += `</div>`;
                    
                    // DID
                    h += `<div style="margin-bottom: 15px;">`;
                        h += `<strong style="display:block;">DID</strong>`;
                        h += `<div style="display: flex; align-items: center; gap: 8px; margin-top: 5px;">`;
                            h += `<span id="account-did" style="font-family: monospace; font-size: 12px; word-break: break-all;">Loading...</span>`;
                            h += `<span class="copy-node-btn" data-target="account-did-full" style="cursor: pointer; opacity: 0.6; flex-shrink: 0;" title="Copy DID">`;
                                h += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                            h += `</span>`;
                        h += `</div>`;
                        h += `<input type="hidden" id="account-did-full" value="">`;
                    h += `</div>`;
                    
                    // Public URL
                    h += `<div style="margin-bottom: 15px;">`;
                        h += `<strong style="display:block;">Public URL</strong>`;
                        h += `<div style="margin-top: 5px;">`;
                            h += `<a id="account-public-url" href="#" target="_blank" style="font-size: 13px; color: #3b82f6; text-decoration: none;">Not configured</a>`;
                        h += `</div>`;
                    h += `</div>`;
                    
                    // Recovery Phrase (part of node identity)
                    h += `<div style="padding-top: 15px; border-top: 1px solid #e5e7eb;">`;
                        h += `<div style="display: flex; justify-content: space-between; align-items: center;">`;
                            h += `<div>`;
                                h += `<strong style="display: block;">Recovery Phrase</strong>`;
                                h += `<span id="account-recovery-status" style="font-size: 12px; color: #666;">Checking...</span>`;
                            h += `</div>`;
                            h += `<button id="view-recovery-btn" class="button" style="display: none;">View</button>`;
                            h += `<button id="open-encrypt-modal-btn" class="button" style="display: none;">Encrypt</button>`;
                        h += `</div>`;
                        
                        // Mnemonic display area (hidden by default)
                        h += `<div id="recovery-phrase-display" style="display: none; padding: 16px; background: #1a1a2e; border-radius: 8px; margin-top: 12px;">`;
                            h += `<div id="recovery-words" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px;"></div>`;
                            h += `<div style="display: flex; justify-content: space-between; align-items: center;">`;
                                h += `<span id="recovery-countdown" style="font-size: 12px; color: #f59e0b;">Auto-hide in 30s</span>`;
                                h += `<button id="hide-recovery-btn" class="button" style="font-size: 12px; padding: 4px 12px; margin: 0; line-height: 1;">Hide</button>`;
                            h += `</div>`;
                        h += `</div>`;
                        
                        // No backup warning (no button here anymore - button is in header)
                        h += `<div id="no-recovery-message" style="display: none; margin-top: 12px;">`;
                            h += `<div style="padding: 12px; background: #fef3c7; border-radius: 6px; font-size: 13px; color: #92400e;">`;
                                h += `<strong>No encrypted backup available.</strong><br>`;
                                h += `<span style="font-size: 12px;">If you saved it during setup, click Encrypt to backup securely.</span>`;
                            h += `</div>`;
                        h += `</div>`;
                        
                        // Encrypt now section
                        h += `<div id="encrypt-now-section" style="display: none; padding: 12px; background: rgba(59, 130, 246, 0.1); border-radius: 6px; margin-top: 12px;">`;
                            h += `<div style="display: flex; justify-content: space-between; align-items: center;">`;
                                h += `<div>`;
                                    h += `<strong style="display: block; color: #3b82f6;">Secure Your Recovery Phrase</strong>`;
                                    h += `<span style="font-size: 12px; color: #666;">Encrypt with your wallet to access later</span>`;
                                h += `</div>`;
                                h += `<button id="encrypt-now-btn" class="button" style="background: #3b82f6; color: white;">Encrypt Now</button>`;
                            h += `</div>`;
                            h += `<p id="encrypt-status" style="font-size: 12px; color: #666; margin-top: 8px; display: none;"></p>`;
                        h += `</div>`;
                    h += `</div>`;
                h += `</div>`;
            h += `</div>`;
        h += `</div>`;
        
        // Recovery word styles (injected once)
        h += `<style>
            .recovery-word {
                background: #2a2a3e;
                padding: 6px 10px;
                border-radius: 4px;
                font-family: monospace;
                font-size: 12px;
                color: #fff;
            }
            .recovery-word .num {
                color: #6b7280;
                margin-right: 4px;
            }
        </style>`;

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

        // Save display name
        $el_window.find('.save-display-name').on('click', async function() {
            const displayName = $el_window.find('#account-display-name').val().trim();
            const btn = $(this);
            btn.prop('disabled', true).text('Saving...');
            
            try {
                const apiOrigin = window.api_origin || window.location.origin;
                const authToken = puter.authToken;
                
                if (!authToken) {
                    throw new Error('Not authenticated');
                }
                
                const response = await fetch(`${apiOrigin}/api/user/profile`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify({ display_name: displayName })
                });
                
                if (response.ok) {
                    window.user.display_name = displayName;
                    // Update the display name shown below profile picture
                    $el_window.find('#profile-display-name').html(displayName || '<span style="color: #999; font-weight: 400;">Set your display name</span>');
                    // Update localStorage cache
                    try {
                        localStorage.setItem('pc2_whoami_cache', JSON.stringify(window.user));
                    } catch (e) {}
                    // Show brief success feedback on button
                    btn.text('Saved!');
                    setTimeout(() => btn.text('Save'), 1500);
                } else {
                    throw new Error('Failed to save');
                }
            } catch (error) {
                console.error('[Account] Failed to save display name:', error);
                btn.text('Error');
                setTimeout(() => btn.text('Save'), 1500);
            } finally {
                btn.prop('disabled', false);
            }
        });
        
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

        // === Node Identity Section (PC2 mode only) ===
        const isPC2Mode = () => {
            return window.api_origin && (
                window.api_origin.includes('127.0.0.1:4200') || 
                window.api_origin.includes('localhost:4200') ||
                window.api_origin.includes('127.0.0.1:4202') ||
                window.api_origin.includes('localhost:4202') ||
                window.location.origin === window.api_origin
            );
        };
        
        const getAuthToken = () => {
            if (window.auth_token) return window.auth_token;
            try {
                const saved = localStorage.getItem('pc2_session');
                if (saved) {
                    const data = JSON.parse(saved);
                    return data.session?.token || null;
                }
            } catch (e) {}
            return null;
        };
        
        // Load node identity from API
        async function loadNodeIdentity() {
            if (!isPC2Mode() || !window.api_origin) {
                return; // Section stays hidden
            }
            
            // Show the section
            $el_window.find('#node-identity-section').show();
            
            try {
                const authToken = getAuthToken();
                const headers = { 'Content-Type': 'application/json' };
                if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
                
                const response = await fetch(new URL('/api/boson/full-identity', window.api_origin).toString(), {
                    method: 'GET',
                    headers
                });
                
                if (response.ok) {
                    const data = await response.json();
                    
                    // Display truncated values
                    const nodeIdShort = data.nodeId ? data.nodeId.substring(0, 16) + '...' : 'Not set';
                    const didShort = data.did ? data.did.substring(0, 24) + '...' : 'Not set';
                    
                    $el_window.find('#account-node-id').text(nodeIdShort);
                    $el_window.find('#account-node-id-full').val(data.nodeId || '');
                    
                    $el_window.find('#account-did').text(didShort);
                    $el_window.find('#account-did-full').val(data.did || '');
                    
                    if (data.publicUrl) {
                        $el_window.find('#account-public-url').text(data.publicUrl).attr('href', data.publicUrl);
                    } else {
                        $el_window.find('#account-public-url').text('Not configured').attr('href', '#');
                    }
                    
                    // Recovery phrase status
                    if (data.hasMnemonicBackup) {
                        $el_window.find('#account-recovery-status').text('Encrypted backup available');
                        $el_window.find('#view-recovery-btn').show();
                        $el_window.find('#open-encrypt-modal-btn').hide();
                        $el_window.find('#no-recovery-message').hide();
                        $el_window.find('#encrypt-now-section').hide();
                    } else {
                        // Check if mnemonic can still be encrypted
                        const needsCheck = await fetch(new URL('/api/boson/needs-securing', window.api_origin).toString());
                        const needsResult = await needsCheck.json();
                        
                        if (needsResult.hasMnemonicInMemory) {
                            $el_window.find('#account-recovery-status').text('Not yet encrypted');
                            $el_window.find('#view-recovery-btn').hide();
                            $el_window.find('#open-encrypt-modal-btn').hide();
                            $el_window.find('#no-recovery-message').hide();
                            $el_window.find('#encrypt-now-section').show();
                        } else {
                            $el_window.find('#account-recovery-status').text('No encrypted backup');
                            $el_window.find('#view-recovery-btn').hide();
                            $el_window.find('#open-encrypt-modal-btn').show();
                            $el_window.find('#no-recovery-message').show();
                            $el_window.find('#encrypt-now-section').hide();
                        }
                    }
                } else {
                    throw new Error('Failed to load identity');
                }
            } catch (error) {
                console.error('[Account] Failed to load node identity:', error);
                $el_window.find('#account-node-id').text('Error loading');
                $el_window.find('#account-did').text('Error loading');
                $el_window.find('#account-recovery-status').text('Error loading');
            }
        }
        
        // Copy node identity buttons
        $el_window.find('.copy-node-btn').on('click', function() {
            const targetId = $(this).data('target');
            const value = $el_window.find('#' + targetId).val();
            if (value) {
                navigator.clipboard.writeText(value);
                const $btn = $(this);
                $btn.html(checkIcon);
                $btn.css('opacity', '1');
                setTimeout(() => {
                    $btn.html(copyIcon);
                    $btn.css('opacity', '0.6');
                }, 1500);
            }
        });
        
        $el_window.find('.copy-node-btn').on('mouseenter', function() {
            $(this).css('opacity', '1');
        }).on('mouseleave', function() {
            $(this).css('opacity', '0.6');
        });
        
        // View recovery phrase
        let countdownInterval = null;
        
        $el_window.find('#view-recovery-btn').on('click', async function() {
            const $btn = $(this);
            $btn.prop('disabled', true).text('Connecting...');
            
            try {
                if (typeof window.ethereum === 'undefined') {
                    throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.');
                }
                
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                const walletAddress = accounts[0];
                
                if (!walletAddress) {
                    throw new Error('No wallet account found');
                }
                
                $btn.text('Sign to view...');
                
                const msgResponse = await fetch(new URL('/api/boson/mnemonic-sign-message', window.api_origin).toString(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ walletAddress })
                });
                
                const msgResult = await msgResponse.json();
                if (!msgResult.message) {
                    throw new Error('Failed to get sign message');
                }
                
                const signature = await window.ethereum.request({
                    method: 'personal_sign',
                    params: [msgResult.message, walletAddress]
                });
                
                $btn.text('Decrypting...');
                
                const authToken = getAuthToken();
                const headers = { 'Content-Type': 'application/json' };
                if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
                
                const decryptResponse = await fetch(new URL('/api/boson/decrypt-mnemonic', window.api_origin).toString(), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ signature, walletAddress })
                });
                
                const decryptResult = await decryptResponse.json();
                
                if (!decryptResponse.ok) {
                    throw new Error(decryptResult.error || 'Decryption failed');
                }
                
                // Display mnemonic
                const words = decryptResult.mnemonic.split(' ');
                const $wordsContainer = $el_window.find('#recovery-words');
                $wordsContainer.empty();
                
                words.forEach((word, i) => {
                    $wordsContainer.append(`<div class="recovery-word"><span class="num">${i + 1}.</span>${word}</div>`);
                });
                
                $el_window.find('#recovery-phrase-display').show();
                $btn.hide();
                
                // Start countdown
                let seconds = 30;
                const $countdown = $el_window.find('#recovery-countdown');
                
                countdownInterval = setInterval(() => {
                    seconds--;
                    $countdown.text(`Auto-hide in ${seconds}s`);
                    
                    if (seconds <= 0) {
                        hideMnemonic();
                    }
                }, 1000);
                
            } catch (error) {
                console.error('[Account] View recovery error:', error);
                alert('Failed to view recovery phrase: ' + error.message);
                $btn.prop('disabled', false).text('View');
            }
        });
        
        function hideMnemonic() {
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }
            $el_window.find('#recovery-phrase-display').hide();
            $el_window.find('#recovery-words').empty();
            $el_window.find('#view-recovery-btn').show().prop('disabled', false).text('View');
        }
        
        $el_window.find('#hide-recovery-btn').on('click', hideMnemonic);
        
        // Encrypt Now button handler
        $el_window.find('#encrypt-now-btn').on('click', async function() {
            const $btn = $(this);
            const $status = $el_window.find('#encrypt-status');
            
            $btn.prop('disabled', true).text('Connecting...');
            $status.show().text('');
            
            try {
                if (typeof window.ethereum === 'undefined') {
                    throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.');
                }
                
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                const walletAddress = accounts[0];
                
                if (!walletAddress) {
                    throw new Error('No wallet account found');
                }
                
                $btn.text('Sign to encrypt...');
                $status.text('Please sign the message in your wallet');
                
                const msgResponse = await fetch(new URL('/api/boson/mnemonic-sign-message', window.api_origin).toString(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ walletAddress })
                });
                
                const msgResult = await msgResponse.json();
                if (!msgResult.message) {
                    throw new Error('Failed to get sign message');
                }
                
                const signature = await window.ethereum.request({
                    method: 'personal_sign',
                    params: [msgResult.message, walletAddress]
                });
                
                $btn.text('Encrypting...');
                $status.text('Encrypting your recovery phrase...');
                
                const secureResponse = await fetch(new URL('/api/boson/secure-mnemonic', window.api_origin).toString(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ signature, walletAddress })
                });
                
                const secureResult = await secureResponse.json();
                
                if (!secureResponse.ok || !secureResult.success) {
                    throw new Error(secureResult.error || 'Encryption failed');
                }
                
                // Success - update UI
                $status.text('Recovery phrase encrypted successfully!').css('color', '#22c55e');
                $el_window.find('#encrypt-now-section').hide();
                $el_window.find('#account-recovery-status').text('Encrypted backup available');
                $el_window.find('#view-recovery-btn').show();
                $el_window.find('#open-encrypt-modal-btn').hide();
                
            } catch (error) {
                console.error('[Account] Encrypt error:', error);
                $status.text('Error: ' + error.message).css('color', '#ef4444');
                $btn.prop('disabled', false).text('Encrypt Now');
            }
        });
        
        // Open encrypt modal button handler
        $el_window.find('#open-encrypt-modal-btn').on('click', function() {
            // Create modal overlay
            const modalHtml = `
                <div id="encrypt-modal-overlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
                    <div style="background: white; border-radius: 8px; padding: 24px; max-width: 450px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <h3 style="margin: 0; font-size: 16px; color: #333;">Encrypt Your Recovery Phrase</h3>
                            <button id="close-encrypt-modal" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #666; padding: 0; line-height: 1;">&times;</button>
                        </div>
                        <p style="font-size: 13px; color: #666; margin-bottom: 16px;">Enter your 24-word recovery phrase to encrypt and backup securely.</p>
                        <textarea id="modal-mnemonic-input" placeholder="Enter your 24-word recovery phrase..." style="width: 100%; height: 100px; padding: 12px; border: 1px solid #d1d5db; border-radius: 6px; font-family: monospace; font-size: 12px; resize: none; box-sizing: border-box; margin-bottom: 12px;"></textarea>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span id="modal-encrypt-status" style="font-size: 12px; color: #666;"></span>
                            <div style="display: flex; gap: 8px;">
                                <button id="cancel-encrypt-modal" class="button">Cancel</button>
                                <button id="confirm-encrypt-btn" class="button button-primary">Encrypt & Save</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            $('body').append(modalHtml);
            
            // Focus the textarea
            $('#modal-mnemonic-input').focus();
            
            // Close modal handlers
            $('#close-encrypt-modal, #cancel-encrypt-modal, #encrypt-modal-overlay').on('click', function(e) {
                if (e.target === this) {
                    $('#encrypt-modal-overlay').remove();
                }
            });
            
            // Prevent clicks inside modal from closing it
            $('#encrypt-modal-overlay > div').on('click', function(e) {
                e.stopPropagation();
            });
            
            // Encrypt button handler
            $('#confirm-encrypt-btn').on('click', async function() {
                const $btn = $(this);
                const $status = $('#modal-encrypt-status');
                const $input = $('#modal-mnemonic-input');
                
                const mnemonic = $input.val().trim().toLowerCase();
                
                // Validate mnemonic format (24 words)
                const words = mnemonic.split(/\s+/);
                if (words.length !== 24) {
                    $status.text('Please enter all 24 words').css('color', '#ef4444');
                    return;
                }
                
                $btn.prop('disabled', true).text('Connecting...');
                $status.text('').css('color', '#666');
                
                try {
                    if (typeof window.ethereum === 'undefined') {
                        throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.');
                    }
                    
                    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                    const walletAddress = accounts[0];
                    
                    if (!walletAddress) {
                        throw new Error('No wallet account found');
                    }
                    
                    $btn.text('Sign to encrypt...');
                    $status.text('Please sign the message in your wallet');
                    
                    const msgResponse = await fetch(new URL('/api/boson/mnemonic-sign-message', window.api_origin).toString(), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ walletAddress })
                    });
                    
                    const msgResult = await msgResponse.json();
                    if (!msgResult.message) {
                        throw new Error('Failed to get sign message');
                    }
                    
                    const signature = await window.ethereum.request({
                        method: 'personal_sign',
                        params: [msgResult.message, walletAddress]
                    });
                    
                    $btn.text('Encrypting...');
                    $status.text('Encrypting your recovery phrase...');
                    
                    // Use a new endpoint that accepts the mnemonic directly
                    const secureResponse = await fetch(new URL('/api/boson/encrypt-mnemonic', window.api_origin).toString(), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mnemonic, signature, walletAddress })
                    });
                    
                    const secureResult = await secureResponse.json();
                    
                    if (!secureResponse.ok || !secureResult.success) {
                        throw new Error(secureResult.error || 'Encryption failed');
                    }
                    
                    // Success - update UI
                    $status.text('Recovery phrase encrypted successfully!').css('color', '#22c55e');
                    $input.val(''); // Clear the input for security
                    
                    // Close modal and update settings UI after delay
                    setTimeout(() => {
                        $('#encrypt-modal-overlay').remove();
                        $el_window.find('#no-recovery-message').hide();
                        $el_window.find('#account-recovery-status').text('Encrypted backup available');
                        $el_window.find('#view-recovery-btn').show();
                        $el_window.find('#open-encrypt-modal-btn').hide();
                    }, 1500);
                    
                } catch (error) {
                    console.error('[Account] Manual encrypt error:', error);
                    $status.text('Error: ' + error.message).css('color', '#ef4444');
                    $btn.prop('disabled', false).text('Encrypt & Save');
                }
            });
        });
        
        // Load node identity data
        loadNodeIdentity();

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
        
        // Refresh profile picture with signed URL when Account tab is opened
        if (window.user?.profile_picture_url && $profilePic.length > 0) {
            setTimeout(() => {
                if (typeof window.refresh_profile_picture === 'function') {
                    window.refresh_profile_picture();
                }
            }, 100);
        }
        
        $profilePic.on('click', async function (e) {
            e.preventDefault();
            e.stopPropagation();
            
            const parentUuid = $el_window.attr('data-element_uuid');
            
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
        const windowElement = $el_window.get(0);
        if (windowElement) {
            windowElement.addEventListener('file_opened', async function(e) {
            let selected_file = Array.isArray(e.detail) ? e.detail[0] : e.detail;
            
            // Get signed read_url for immediate display (works for CSS background-image)
            let signed_url = null;
            
            // Check various possible property names for the read URL
            if (selected_file.read_url) {
                signed_url = selected_file.read_url;
            } else if (selected_file.readURL) {
                signed_url = selected_file.readURL;
            } else if (selected_file.url) {
                signed_url = selected_file.url;
            } else if (selected_file.path) {
                // If we only have a path, sign it to get a read_url
                try {
                    let filePath = selected_file.path;
                    if (filePath.startsWith('~')) {
                        filePath = filePath.replace('~', `/${window.user?.username || window.user?.wallet_address || ''}`);
                    }
                    
                    const signed = await puter.fs.sign(undefined, { path: filePath, action: 'read' });
                    
                    // Handle different response structures
                    let items = null;
                    if (signed && signed.items) {
                        // items can be an array or a single object
                        if (Array.isArray(signed.items)) {
                            items = signed.items;
                        } else {
                            // items is a single object - check for read_url directly
                            if (signed.items.read_url) {
                                signed_url = signed.items.read_url;
                            } else if (signed.items.url) {
                                signed_url = signed.items.url;
                            } else {
                                // wrap in array for processing below
                                items = [signed.items];
                            }
                        }
                    } else if (signed && signed.signatures) {
                        items = Array.isArray(signed.signatures) ? signed.signatures : [signed.signatures];
                    } else if (signed && Array.isArray(signed)) {
                        items = signed;
                    } else if (signed && signed.read_url) {
                        signed_url = signed.read_url;
                    }
                    
                    if (!signed_url && items && items.length > 0) {
                        const firstItem = items[0];
                        if (firstItem.read_url) {
                            signed_url = firstItem.read_url;
                        } else if (firstItem.url) {
                            signed_url = firstItem.url;
                        }
                    }
                } catch (err) {
                    console.warn('[UITabAccount] Failed to sign file:', err);
                }
            }
            
            if (signed_url) {
                // Store the file path for saving (not the signed URL)
                const profile_pic_path = selected_file.path || null;
                
                // Use signed URL for immediate display
                $el_window.find('.profile-picture').css('background-image', `url("${signed_url}")`);
                $('.profile-image').css('background-image', `url("${signed_url}")`);
                $('.profile-image').addClass('profile-image-has-picture');
                
                // Copy the file to Public folder for public IPFS access
                const userRoot = window.user?.username || window.user?.wallet_address || '';
                const publicFolder = `/${userRoot}/Public`;
                const fileName = profile_pic_path.split('/').pop();
                // Use a single timestamp for consistency between file path and saved setting
                const timestamp = Date.now();
                const targetFileName = `profile-picture-${timestamp}-${fileName}`;
                const publicPath = `${publicFolder}/${targetFileName}`;
                
                // Expand ~ in source path if needed
                let sourcePath = profile_pic_path;
                if (sourcePath.startsWith('~')) {
                    sourcePath = sourcePath.replace('~', `/${userRoot}`);
                }
                
                try {
                    // Ensure Public folder exists first
                    try {
                        await puter.fs.mkdir(publicFolder);
                    } catch (mkdirErr) {
                        // Folder might already exist, that's fine
                    }
                    
                    // Copy to Public folder
                    const copyResult = await puter.fs.copy(sourcePath, publicFolder, {
                        newName: targetFileName,
                        overwrite: true
                    });
                    
                    // Get the actual path from the copy result
                    let savedPath = publicPath;
                    if (copyResult && copyResult[0] && copyResult[0].copied && copyResult[0].copied.path) {
                        savedPath = copyResult[0].copied.path;
                    }
                    
                    // Cache the signed URL immediately (from the original file selection) - user-specific
                    if (signed_url && signed_url.startsWith('http')) {
                        localStorage.setItem(window.getProfilePictureCacheKey('signed_url'), signed_url);
                        console.log('[UITabAccount] Cached signed URL:', signed_url);
                    }
                    
                    // Get the IPFS CID for the profile picture (for loading screen)
                    // Also try to sign the copied file to get a fresh signed URL
                    try {
                        const stat = await new Promise((resolve, reject) => {
                            puter.fs.stat(savedPath, (result) => result ? resolve(result) : reject(new Error('stat failed')));
                        });
                        if (stat && stat.ipfs_hash) {
                            localStorage.setItem(window.getProfilePictureCacheKey('cid'), stat.ipfs_hash);
                            console.log('[UITabAccount] Cached profile picture CID:', stat.ipfs_hash);
                        }
                        
                        // Try to sign the copied file to get a fresh signed URL for the Public folder file
                        try {
                            const publicSigned = await puter.fs.sign(undefined, { path: savedPath, action: 'read' });
                            let publicSignedUrl = null;
                            
                            if (publicSigned && publicSigned.items) {
                                if (Array.isArray(publicSigned.items) && publicSigned.items.length > 0) {
                                    publicSignedUrl = publicSigned.items[0].read_url || publicSigned.items[0].url;
                                } else if (publicSigned.items.read_url) {
                                    publicSignedUrl = publicSigned.items.read_url;
                                } else if (publicSigned.items.url) {
                                    publicSignedUrl = publicSigned.items.url;
                                }
                            } else if (publicSigned && publicSigned.signatures) {
                                const items = Array.isArray(publicSigned.signatures) ? publicSigned.signatures : [publicSigned.signatures];
                                if (items.length > 0) {
                                    publicSignedUrl = items[0].read_url || items[0].url;
                                }
                            } else if (publicSigned && publicSigned.read_url) {
                                publicSignedUrl = publicSigned.read_url;
                            }
                            
                            if (publicSignedUrl && publicSignedUrl.startsWith('http')) {
                                localStorage.setItem(window.getProfilePictureCacheKey('signed_url'), publicSignedUrl);
                                console.log('[UITabAccount] Cached signed URL for Public folder file:', publicSignedUrl);
                                // Update display with the new signed URL
                                $el_window.find('.profile-picture').css('background-image', `url("${publicSignedUrl}")`);
                                $('.profile-image').css('background-image', `url("${publicSignedUrl}")`);
                            }
                        } catch (signErr) {
                            console.warn('[UITabAccount] Could not sign Public folder file:', signErr);
                        }
                    } catch (statErr) {
                        console.warn('[UITabAccount] Could not get IPFS CID for profile picture:', statErr);
                    }
                    
                    // Save the public path to backend
                    $.ajax({
                        url: `${window.api_origin}/set-profile-picture`,
                        type: 'POST',
                        data: JSON.stringify({
                            url: savedPath,
                        }),
                        async: true,
                        contentType: 'application/json',
                        headers: {
                            'Authorization': `Bearer ${puter.authToken}`,
                        },
                        success: function(response) {
                            if (window.user) {
                                window.user.profile_picture_url = savedPath;
                                // Update whoami cache for loading screen
                                try {
                                    localStorage.setItem('pc2_whoami_cache', JSON.stringify(window.user));
                                } catch (e) {}
                            }
                            if (typeof puter?.ui?.toast === 'function') {
                                puter.ui.toast('Profile picture saved', { type: 'success' });
                            }
                        },
                        error: function(xhr, status, error) {
                            console.error('[UITabAccount] Failed to save profile picture:', error);
                        },
                        statusCode: {
                            401: function () {
                                window.logout();
                            },
                        },
                    });
                } catch (copyErr) {
                    console.error('[UITabAccount] Failed to copy to Public folder:', copyErr?.message || copyErr);
                    
                    // Show user that we're using private storage instead
                    if (typeof puter?.ui?.toast === 'function') {
                        puter.ui.toast('Profile picture saved (private storage)', { type: 'info' });
                    }
                    
                    // Fall back to private storage
                    $.ajax({
                        url: `${window.api_origin}/set-profile-picture`,
                        type: 'POST',
                        data: JSON.stringify({
                            url: profile_pic_path,
                        }),
                        async: true,
                        contentType: 'application/json',
                        headers: {
                            'Authorization': `Bearer ${puter.authToken}`,
                        },
                        success: function(response) {
                            if (window.user) {
                                window.user.profile_picture_url = profile_pic_path;
                            }
                        },
                        error: function(xhr, status, error) {
                            console.error('[UITabAccount] Failed to save profile picture:', error, xhr);
                        },
                    });
                }
            } else {
                console.warn('[UITabAccount] No signed URL available for file. File object:', selected_file);
            }
            });
        } else {
            console.warn('[UITabAccount] Window element not found, cannot attach file_opened listener');
        }
    },
};