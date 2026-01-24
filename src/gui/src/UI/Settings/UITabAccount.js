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
import walletService from '../../services/WalletService.js';

/**
 * Initialize Elastos Identity section
 * Handles DID tethering via QR code
 */
function initElastosIdentity($el_window) {
    // Check if DID is already tethered
    const tetheredDID = walletService.getTetheredDID();
    
    if (tetheredDID) {
        // Show tethered state
        $el_window.find('#elastos-did-not-tethered').hide();
        $el_window.find('#elastos-did-tethered').show();
        $el_window.find('#elastos-did-value').text(truncateDID(tetheredDID.did));
        
        // Show connected wallets if available
        const wallets = walletService.getTetheredWallets();
        if (wallets) {
            if (wallets.esc) $el_window.find('#elastos-esc-addr').text(truncateAddr(wallets.esc));
            if (wallets.elaMainchain) $el_window.find('#elastos-mainchain-addr').text(truncateAddr(wallets.elaMainchain));
            if (wallets.btc) $el_window.find('#elastos-btc-addr').text(truncateAddr(wallets.btc));
            if (wallets.tron) $el_window.find('#elastos-tron-addr').text(truncateAddr(wallets.tron));
        }
    }
    
    // Tether DID button click
    $el_window.find('#tether-did-btn').on('click', async function() {
        await showDIDTetherModal($el_window);
    });
    
    // Untether DID button click
    $el_window.find('#untether-did-btn').on('click', async function() {
        if (confirm('Are you sure you want to untether your Elastos DID? You will lose access to Mainchain ELA, Bitcoin, and Tron balances.')) {
            // TODO: Implement untether
            walletService.tetheredDID = null;
            walletService.tetheredWallets = null;
            
            // Update UI
            $el_window.find('#elastos-did-not-tethered').show();
            $el_window.find('#elastos-did-tethered').hide();
        }
    });
    
    // Copy DID button
    $el_window.find('.copy-did-btn').on('click', function() {
        const did = walletService.getTetheredDID()?.did;
        if (did) {
            navigator.clipboard.writeText(did).then(() => {
                $(this).html('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>');
                setTimeout(() => {
                    $(this).html('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>');
                }, 2000);
            });
        }
    });
}

/**
 * Show the DID Tether QR modal
 */
async function showDIDTetherModal($el_window) {
    // Use UIWindow pattern for consistency
    const { default: UIWindow } = await import('../UIWindow.js');
    
    const h = `
        <div style="padding: 20px; text-align: center;">
            <p style="color: #666; font-size: 13px; margin-bottom: 20px;">Scan with Essentials Wallet to link your Elastos DID</p>
            
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; display: inline-block; margin-bottom: 20px; border: 1px solid #e0e0e0;">
                <div style="width: 180px; height: 180px; display: flex; align-items: center; justify-content: center; color: #999;">
                    <div style="text-align: center;">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.5" style="margin-bottom: 8px;">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                        </svg>
                        <div style="font-size: 11px;">Coming Soon</div>
                    </div>
                </div>
            </div>
            
            <div style="text-align: left; font-size: 12px; color: #666; margin-bottom: 16px; padding: 12px; background: #f9f9f9; border-radius: 6px;">
                <div style="margin-bottom: 6px;">1. Open Essentials wallet</div>
                <div style="margin-bottom: 6px;">2. Scan this QR code</div>
                <div>3. Approve the connection</div>
            </div>
            
            <div style="font-size: 12px; color: #999;">
                Backend integration pending
            </div>
        </div>
    `;
    
    UIWindow({
        title: 'Tether Elastos DID',
        icon: null,
        uid: null,
        is_dir: false,
        body_content: h,
        has_head: true,
        selectable_body: false,
        allow_context_menu: false,
        is_resizable: false,
        is_droppable: false,
        init_center: true,
        allow_native_ctxmenu: true,
        allow_user_select: true,
        window_class: 'window-settings',
        width: 340,
        height: 'auto',
        dominant: true,
        show_in_taskbar: false,
        draggable_body: false,
        onAppend: function(el_window) {},
        window_css: { height: 'auto' },
    });
}

/**
 * Truncate DID for display
 */
function truncateDID(did) {
    if (!did) return '';
    if (did.length <= 30) return did;
    return did.substring(0, 20) + '...' + did.substring(did.length - 8);
}

/**
 * Truncate address for display
 */
function truncateAddr(addr) {
    if (!addr) return 'N/A';
    if (addr.length <= 16) return addr;
    return addr.substring(0, 8) + '...' + addr.substring(addr.length - 6);
}

// Account Tab - Compact Layout
export default {
    id: 'account',
    title_i18n_key: 'account',
    icon: 'user.svg',
    html: () => {
        let h = '';
        
        // Compact styles
        h += `<style>
            .account-section { margin-bottom: 16px; }
            .account-section-title {
                font-size: 11px;
                font-weight: 700;
                color: #000;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 8px;
                padding-left: 2px;
            }
            .account-card {
                background: #f9f9f9;
                border-radius: 8px;
                padding: 12px 14px;
                margin-bottom: 6px;
            }
            .account-group {
                background: #f9f9f9;
                border-radius: 8px;
                border: 1px solid #d0d0d0;
                overflow: hidden;
            }
            .account-group-row {
                padding: 12px 14px;
                border-bottom: 1px solid #e5e5e5;
            }
            .account-group-row:last-child {
                border-bottom: none;
            }
            .account-card-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .account-card-label {
                font-size: 13px;
                font-weight: 500;
                color: #333;
            }
            .account-card-value {
                font-size: 12px;
                color: #666;
                font-family: monospace;
                word-break: break-all;
            }
            .account-card-sublabel {
                font-size: 11px;
                color: #999;
                margin-top: 2px;
            }
            .copy-btn {
                cursor: pointer;
                opacity: 0.5;
                transition: opacity 0.2s;
                flex-shrink: 0;
                margin-left: 8px;
            }
            .copy-btn:hover { opacity: 1; }
            .account-input {
                padding: 6px 10px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 13px;
                width: 160px;
            }
            .account-btn {
                font-size: 12px;
                padding: 5px 12px;
                border-radius: 4px;
                cursor: pointer;
                line-height: 1.2;
                height: auto;
                margin: 0;
            }
            .recovery-word {
                background: #2a2a3e;
                padding: 4px 8px;
                border-radius: 4px;
                font-family: monospace;
                font-size: 11px;
                color: #fff;
            }
            .recovery-word .num {
                color: #6b7280;
                margin-right: 4px;
            }
        </style>`;

        // Profile Section - Compact
        const DEFAULT_PROFILE_PICTURE = window.location.origin + '/images/elastos-icon-default.svg';
        const profilePicUrl = window.user?.profile?.picture || DEFAULT_PROFILE_PICTURE;
        const displayName = window.user?.display_name || '';
        
        h += `<div class="account-section" style="text-align: center; padding: 12px 0;">`;
            h += `<div class="profile-picture change-profile-picture" style="background-image: url('${html_encode(profilePicUrl)}'); cursor: pointer; width: 110px; height: 110px; margin: 0 auto;" title="Click to change"></div>`;
            h += `<div id="profile-display-name" style="margin-top: 12px; font-size: 18px; font-weight: 600; color: #333;">${html_encode(displayName) || '<span style="color: #aaa; font-weight: 400; font-size: 13px;">Set display name</span>'}</div>`;
        h += `</div>`;
        
        // Display Name Input
        h += `<div class="account-section">`;
            h += `<div class="account-group">`;
                h += `<div class="account-group-row">`;
                    h += `<div class="account-card-row">`;
                        h += `<span class="account-card-label">Display Name</span>`;
                        h += `<div style="display: flex; align-items: center; gap: 6px;">`;
                            h += `<input type="text" id="account-display-name" class="account-input" value="${html_encode(displayName)}" placeholder="Your name">`;
                            h += `<button class="button account-btn save-display-name">Save</button>`;
                        h += `</div>`;
                    h += `</div>`;
                h += `</div>`;
            h += `</div>`;
        h += `</div>`;

        // Password/Username - only for non-wallet users
        if(!window.user.is_temp && !window.user.wallet_address){
            h += `<div class="account-section">`;
                h += `<div class="account-section-title">Security</div>`;
                h += `<div class="account-card">`;
                    h += `<div class="account-card-row">`;
                        h += `<span class="account-card-label">${i18n('password')}</span>`;
                        h += `<button class="button account-btn change-password">${i18n('change_password')}</button>`;
                    h += `</div>`;
                h += `</div>`;
            h += `</div>`;
        }

        if(!window.user.username && !window.user.wallet_address){
            h += `<div class="account-card">`;
                h += `<div class="account-card-row">`;
                h += `<div>`;
                        h += `<span class="account-card-label">${i18n('username')}</span>`;
                        h += `<div class="account-card-sublabel">${html_encode(window.user.username)}</div>`;
                    h += `</div>`;
                    h += `<button class="button account-btn change-username">${i18n('change_username')}</button>`;
                h += `</div>`;
            h += `</div>`;
        }
        
        // Wallets Section
        const walletAddr = window.user.wallet_address || '';
        const smartAddr = window.user.smart_account_address || '';
        
        if(walletAddr || smartAddr){
            h += `<div class="account-section">`;
                h += `<div class="account-section-title">Wallets</div>`;
                h += `<div class="account-group">`;
                
                    if(walletAddr){
                    h += `<div class="account-group-row">`;
                        h += `<div class="account-card-row">`;
                            h += `<div style="flex: 1; min-width: 0;">`;
                                h += `<span class="account-card-label">${smartAddr ? 'EOA Wallet' : 'Wallet Address'}</span>`;
                                h += `<div class="account-card-value" style="margin-top: 4px;">${html_encode(walletAddr.substring(0, 10))}...${html_encode(walletAddr.substring(walletAddr.length - 8))}</div>`;
                            h += `</div>`;
                            h += `<span class="copy-btn copy-address-btn" data-address="${html_encode(walletAddr)}" title="Copy">`;
                                h += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                            h += `</span>`;
                        h += `</div>`;
                        h += `</div>`;
                    }
                
                    if(smartAddr){
                    h += `<div class="account-group-row">`;
                        h += `<div class="account-card-row">`;
                            h += `<div style="flex: 1; min-width: 0;">`;
                                h += `<span class="account-card-label" style="color: #1976d2;">Smart Account</span>`;
                                h += `<div class="account-card-value" style="margin-top: 4px;">${html_encode(smartAddr.substring(0, 10))}...${html_encode(smartAddr.substring(smartAddr.length - 8))}</div>`;
                                h += `<div class="account-card-sublabel">ERC-4337 Account</div>`;
                            h += `</div>`;
                            h += `<span class="copy-btn copy-address-btn" data-address="${html_encode(smartAddr)}" title="Copy">`;
                                h += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                            h += `</span>`;
                        h += `</div>`;
                        h += `</div>`;
                    }
                h += `</div>`;
            h += `</div>`;
        }

        // Node Identity Section (PC2 mode only)
        h += `<div id="node-identity-section" style="display: none;">`;
            h += `<div class="account-section">`;
                h += `<div class="account-section-title">Node Identity</div>`;
                h += `<div class="account-group">`;
                
                // Node ID
                h += `<div class="account-group-row">`;
                    h += `<div class="account-card-row">`;
                        h += `<div style="flex: 1; min-width: 0;">`;
                            h += `<span class="account-card-label">Node ID</span>`;
                            h += `<div id="account-node-id" class="account-card-value" style="margin-top: 4px;">Loading...</div>`;
                        h += `</div>`;
                        h += `<span class="copy-btn copy-node-btn" data-target="account-node-id-full" title="Copy">`;
                            h += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                        h += `</span>`;
                    h += `</div>`;
                    h += `<input type="hidden" id="account-node-id-full" value="">`;
                h += `</div>`;
                
                // DID
                h += `<div class="account-group-row">`;
                    h += `<div class="account-card-row">`;
                        h += `<div style="flex: 1; min-width: 0;">`;
                            h += `<span class="account-card-label">DID</span>`;
                            h += `<div id="account-did" class="account-card-value" style="margin-top: 4px;">Loading...</div>`;
                        h += `</div>`;
                        h += `<span class="copy-btn copy-node-btn" data-target="account-did-full" title="Copy">`;
                            h += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                        h += `</span>`;
                    h += `</div>`;
                    h += `<input type="hidden" id="account-did-full" value="">`;
                h += `</div>`;
                
                // Public URL
                h += `<div class="account-group-row">`;
                    h += `<div class="account-card-row">`;
                        h += `<span class="account-card-label">Public URL</span>`;
                        h += `<a id="account-public-url" href="#" target="_blank" style="font-size: 12px; color: #3b82f6;">Not configured</a>`;
                    h += `</div>`;
                h += `</div>`;
                
                // Recovery Phrase - inside the group
                h += `<div class="account-group-row" id="recovery-phrase-card">`;
                    h += `<div class="account-card-row">`;
                        h += `<div>`;
                            h += `<span class="account-card-label">Recovery Phrase</span>`;
                            h += `<div id="account-recovery-status" class="account-card-sublabel">Checking...</div>`;
                        h += `</div>`;
                        h += `<div style="display: flex; gap: 6px;">`;
                            h += `<button id="view-recovery-btn" class="button account-btn" style="display: none;">View</button>`;
                            h += `<button id="open-encrypt-modal-btn" class="button account-btn" style="display: none;">Encrypt</button>`;
                        h += `</div>`;
                    h += `</div>`;
                    
                    // Mnemonic display (hidden)
                    h += `<div id="recovery-phrase-display" style="display: none; padding: 12px; background: #1a1a2e; border-radius: 6px; margin-top: 10px;">`;
                        h += `<div id="recovery-words" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px;"></div>`;
                        h += `<div style="display: flex; justify-content: space-between; align-items: center;">`;
                            h += `<span id="recovery-countdown" style="font-size: 11px; color: #f59e0b;">Auto-hide in 30s</span>`;
                            h += `<button id="hide-recovery-btn" class="button account-btn" style="font-size: 11px; padding: 4px 10px;">Hide</button>`;
                        h += `</div>`;
                    h += `</div>`;
                    
                    // No backup warning
                    h += `<div id="no-recovery-message" style="display: none; margin-top: 8px; padding: 10px; background: #fef3c7; border-radius: 6px; font-size: 12px; color: #92400e;">`;
                        h += `No encrypted backup. Click Encrypt to backup securely.`;
                    h += `</div>`;
                    
                    // Encrypt now section
                    h += `<div id="encrypt-now-section" style="display: none; margin-top: 8px; padding: 10px; background: rgba(59, 130, 246, 0.1); border-radius: 6px;">`;
                        h += `<div class="account-card-row">`;
                            h += `<span style="font-size: 12px; color: #3b82f6;">Encrypt your recovery phrase for backup</span>`;
                            h += `<button id="encrypt-now-btn" class="button account-btn" style="background: #3b82f6; color: white;">Encrypt</button>`;
                        h += `</div>`;
                        h += `<p id="encrypt-status" style="font-size: 11px; color: #666; margin-top: 6px; display: none;"></p>`;
                    h += `</div>`;
                h += `</div>`;
                h += `</div>`;
            h += `</div>`;
        h += `</div>`;

        // Elastos Identity Section (PC2 mode only)
        h += `<div id="elastos-identity-section" style="display: none;">`;
            h += `<div class="account-section">`;
                h += `<div class="account-section-title">Elastos Identity</div>`;
                h += `<div class="account-group">`;
                
                // DID Status row
                h += `<div class="account-group-row" id="elastos-did-row">`;
                    h += `<div id="elastos-did-not-tethered" style="display: block;">`;
                        h += `<div class="account-card-row" style="margin-bottom: 12px;">`;
                            h += `<div>`;
                                h += `<span class="account-card-label">Elastos DID</span>`;
                                h += `<div class="account-card-sublabel" style="color: #9ca3af;">Not linked</div>`;
                            h += `</div>`;
                        h += `</div>`;
                        h += `<div style="font-size: 12px; color: #6b7280; margin-bottom: 12px;">`;
                            h += `Link your Elastos DID to unlock:`;
                            h += `<ul style="margin: 8px 0 0 16px; padding: 0;">`;
                                h += `<li>View Mainchain ELA, Bitcoin, and Tron balances</li>`;
                                h += `<li>DAO voting and governance participation</li>`;
                                h += `<li>Verifiable credentials (coming soon)</li>`;
                            h += `</ul>`;
                        h += `</div>`;
                        h += `<button id="tether-did-btn" class="button account-btn">Tether DID</button>`;
                    h += `</div>`;
                    
                    // Tethered state (hidden by default)
                    h += `<div id="elastos-did-tethered" style="display: none;">`;
                        h += `<div class="account-card-row" style="margin-bottom: 12px;">`;
                            h += `<div style="flex: 1; min-width: 0;">`;
                                h += `<span class="account-card-label" style="color: #22c55e;">✓ DID Tethered</span>`;
                                h += `<div id="elastos-did-value" class="account-card-value" style="margin-top: 4px;">did:elastos:...</div>`;
                            h += `</div>`;
                            h += `<span class="copy-btn copy-did-btn" title="Copy DID">`;
                                h += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                            h += `</span>`;
                        h += `</div>`;
                        
                        h += `<div style="font-size: 12px; color: #6b7280; margin-bottom: 12px;">`;
                            h += `<strong>Connected Wallets:</strong>`;
                            h += `<div id="elastos-connected-wallets" style="margin-top: 8px; font-family: monospace; font-size: 11px;">`;
                                h += `<div style="margin-bottom: 4px;">• ESC: <span id="elastos-esc-addr">Loading...</span></div>`;
                                h += `<div style="margin-bottom: 4px;">• Mainchain: <span id="elastos-mainchain-addr">Loading...</span></div>`;
                                h += `<div style="margin-bottom: 4px;">• Bitcoin: <span id="elastos-btc-addr">Loading...</span></div>`;
                                h += `<div>• Tron: <span id="elastos-tron-addr">Loading...</span></div>`;
                            h += `</div>`;
                        h += `</div>`;
                        
                        h += `<button id="untether-did-btn" class="button account-btn" style="color: #dc2626;">Untether DID</button>`;
                    h += `</div>`;
                h += `</div>`;
                
                h += `</div>`;
            h += `</div>`;
        h += `</div>`;

        // Email Section
        if(window.user.email){
            h += `<div class="account-section">`;
                h += `<div class="account-card">`;
                    h += `<div class="account-card-row">`;
                h += `<div>`;
                            h += `<span class="account-card-label">${i18n('email')}</span>`;
                            h += `<div class="account-card-sublabel user-email">${html_encode(window.user.email)}</div>`;
                        h += `</div>`;
                        h += `<button class="button account-btn change-email">${i18n('change_email')}</button>`;
                h += `</div>`;
                h += `</div>`;
            h += `</div>`;
        }

        // Delete Account - Danger Zone
        h += `<div class="account-section" style="margin-top: 20px;">`;
            h += `<div class="account-section-title" style="color: #dc2626;">Danger Zone</div>`;
            h += `<div class="account-card" style="border: 1px solid #fecaca; background: #fef2f2;">`;
                h += `<div class="account-card-row">`;
                    h += `<span class="account-card-label">${i18n("delete_account")}</span>`;
                    h += `<button class="button button-danger account-btn delete-account">${i18n("delete_account")}</button>`;
                h += `</div>`;
            h += `</div>`;
        h += `</div>`;

        return h;
    },
    init: ($el_window) => {
        const copyIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        const checkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

        // Save display name
        $el_window.find('.save-display-name').on('click', async function() {
            const displayName = $el_window.find('#account-display-name').val().trim();
            const btn = $(this);
            btn.prop('disabled', true).text('...');
            
            try {
                const apiOrigin = window.api_origin || window.location.origin;
                const authToken = puter.authToken;
                
                if (!authToken) throw new Error('Not authenticated');
                
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
                    $el_window.find('#profile-display-name').html(displayName || '<span style="color: #aaa; font-weight: 400; font-size: 13px;">Set display name</span>');
                    try { localStorage.setItem('pc2_whoami_cache', JSON.stringify(window.user)); } catch (e) {}
                    btn.text('✓');
                    setTimeout(() => btn.text('Save'), 1000);
                } else {
                    throw new Error('Failed');
                }
            } catch (error) {
                console.error('[Account] Save failed:', error);
                btn.text('✗');
                setTimeout(() => btn.text('Save'), 1000);
            } finally {
                btn.prop('disabled', false);
            }
        });
        
        // Copy handlers
        $el_window.find('.copy-address-btn, .copy-node-btn').on('click', function() {
            const $btn = $(this);
            let value = $btn.data('address');
            if (!value) {
                const targetId = $btn.data('target');
                value = $el_window.find('#' + targetId).val();
            }
            if (value) {
                navigator.clipboard.writeText(value);
                $btn.html(checkIcon).css('opacity', '1');
                setTimeout(() => $btn.html(copyIcon).css('opacity', '0.5'), 1500);
            }
        });

        // PC2 Mode Check
        const isPC2Mode = () => window.api_origin && (
            window.api_origin.includes('127.0.0.1:4200') || 
            window.api_origin.includes('localhost:4200') ||
            window.api_origin.includes('127.0.0.1:4202') ||
            window.api_origin.includes('localhost:4202') ||
            window.location.origin === window.api_origin
        );
        
        const getAuthToken = () => {
            if (window.auth_token) return window.auth_token;
            try {
                const saved = localStorage.getItem('pc2_session');
                if (saved) return JSON.parse(saved).session?.token || null;
            } catch (e) {}
            return null;
        };
        
        // Load node identity
        async function loadNodeIdentity() {
            if (!isPC2Mode() || !window.api_origin) return;
            
            $el_window.find('#node-identity-section').show();
            $el_window.find('#elastos-identity-section').show();
            
            // Initialize Elastos Identity section
            initElastosIdentity($el_window);
            
            try {
                const authToken = getAuthToken();
                const headers = { 'Content-Type': 'application/json' };
                if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
                
                const response = await fetch(new URL('/api/boson/full-identity', window.api_origin).toString(), {
                    method: 'GET', headers
                });
                
                if (response.ok) {
                    const data = await response.json();
                    
                    const nodeIdShort = data.nodeId ? data.nodeId.substring(0, 12) + '...' : 'Not set';
                    const didShort = data.did ? data.did.substring(0, 20) + '...' : 'Not set';
                    
                    $el_window.find('#account-node-id').text(nodeIdShort);
                    $el_window.find('#account-node-id-full').val(data.nodeId || '');
                    $el_window.find('#account-did').text(didShort);
                    $el_window.find('#account-did-full').val(data.did || '');
                    
                    if (data.publicUrl) {
                        $el_window.find('#account-public-url').text(data.publicUrl).attr('href', data.publicUrl);
                    }
                    
                    if (data.hasMnemonicBackup) {
                        $el_window.find('#account-recovery-status').text('Encrypted backup available');
                        $el_window.find('#view-recovery-btn').show();
                        $el_window.find('#open-encrypt-modal-btn, #no-recovery-message, #encrypt-now-section').hide();
                    } else {
                        const needsCheck = await fetch(new URL('/api/boson/needs-securing', window.api_origin).toString());
                        const needsResult = await needsCheck.json();
                        
                        if (needsResult.hasMnemonicInMemory) {
                            $el_window.find('#account-recovery-status').text('Not yet encrypted');
                            $el_window.find('#encrypt-now-section').show();
                            $el_window.find('#view-recovery-btn, #open-encrypt-modal-btn, #no-recovery-message').hide();
                        } else {
                            $el_window.find('#account-recovery-status').text('No backup');
                            $el_window.find('#open-encrypt-modal-btn, #no-recovery-message').show();
                            $el_window.find('#view-recovery-btn, #encrypt-now-section').hide();
                        }
                    }
                }
            } catch (error) {
                console.error('[Account] Load identity failed:', error);
                $el_window.find('#account-node-id, #account-did').text('Error');
            }
        }
        
        // View recovery phrase
        let countdownInterval = null;
        
        $el_window.find('#view-recovery-btn').on('click', async function() {
            const $btn = $(this);
            $btn.prop('disabled', true).text('...');
            
            try {
                if (typeof window.ethereum === 'undefined') throw new Error('No wallet detected');
                
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                const walletAddress = accounts[0];
                if (!walletAddress) throw new Error('No account');
                
                const msgResponse = await fetch(new URL('/api/boson/mnemonic-sign-message', window.api_origin).toString(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ walletAddress })
                });
                const msgResult = await msgResponse.json();
                if (!msgResult.message) throw new Error('Failed to get message');
                
                const signature = await window.ethereum.request({
                    method: 'personal_sign',
                    params: [msgResult.message, walletAddress]
                });
                
                const authToken = getAuthToken();
                const headers = { 'Content-Type': 'application/json' };
                if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
                
                const decryptResponse = await fetch(new URL('/api/boson/decrypt-mnemonic', window.api_origin).toString(), {
                    method: 'POST', headers,
                    body: JSON.stringify({ signature, walletAddress })
                });
                const decryptResult = await decryptResponse.json();
                if (!decryptResponse.ok) throw new Error(decryptResult.error || 'Decryption failed');
                
                const words = decryptResult.mnemonic.split(' ');
                const $wordsContainer = $el_window.find('#recovery-words').empty();
                words.forEach((word, i) => {
                    $wordsContainer.append(`<div class="recovery-word"><span class="num">${i + 1}.</span>${word}</div>`);
                });
                
                $el_window.find('#recovery-phrase-display').show();
                $btn.hide();
                
                let seconds = 30;
                const $countdown = $el_window.find('#recovery-countdown');
                countdownInterval = setInterval(() => {
                    seconds--;
                    $countdown.text(`Auto-hide in ${seconds}s`);
                    if (seconds <= 0) hideMnemonic();
                }, 1000);
                
            } catch (error) {
                console.error('[Account] View error:', error);
                alert('Failed: ' + error.message);
                $btn.prop('disabled', false).text('View');
            }
        });
        
        function hideMnemonic() {
            if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
            $el_window.find('#recovery-phrase-display').hide();
            $el_window.find('#recovery-words').empty();
            $el_window.find('#view-recovery-btn').show().prop('disabled', false).text('View');
        }
        
        $el_window.find('#hide-recovery-btn').on('click', hideMnemonic);
        
        // Encrypt Now button
        $el_window.find('#encrypt-now-btn').on('click', async function() {
            const $btn = $(this);
            const $status = $el_window.find('#encrypt-status');
            $btn.prop('disabled', true).text('...');
            $status.show().text('');
            
            try {
                if (typeof window.ethereum === 'undefined') throw new Error('No wallet');
                
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                const walletAddress = accounts[0];
                if (!walletAddress) throw new Error('No account');
                
                $status.text('Sign in wallet...');
                
                const msgResponse = await fetch(new URL('/api/boson/mnemonic-sign-message', window.api_origin).toString(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ walletAddress })
                });
                const msgResult = await msgResponse.json();
                if (!msgResult.message) throw new Error('Failed');
                
                const signature = await window.ethereum.request({
                    method: 'personal_sign',
                    params: [msgResult.message, walletAddress]
                });
                
                $status.text('Encrypting...');
                
                const secureResponse = await fetch(new URL('/api/boson/secure-mnemonic', window.api_origin).toString(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ signature, walletAddress })
                });
                const secureResult = await secureResponse.json();
                if (!secureResponse.ok || !secureResult.success) throw new Error(secureResult.error || 'Failed');
                
                $status.text('Done!').css('color', '#22c55e');
                $el_window.find('#encrypt-now-section').hide();
                $el_window.find('#account-recovery-status').text('Encrypted backup available');
                $el_window.find('#view-recovery-btn').show();
                
            } catch (error) {
                console.error('[Account] Encrypt error:', error);
                $status.text('Error: ' + error.message).css('color', '#ef4444');
                $btn.prop('disabled', false).text('Encrypt');
            }
        });
        
        // Open encrypt modal
        $el_window.find('#open-encrypt-modal-btn').on('click', function() {
            const modalHtml = `
                <div id="encrypt-modal-overlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
                    <div style="background: white; border-radius: 8px; padding: 20px; max-width: 400px; width: 90%;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <h3 style="margin: 0; font-size: 15px;">Encrypt Recovery Phrase</h3>
                            <button id="close-encrypt-modal" style="background: none; border: none; font-size: 18px; cursor: pointer;">&times;</button>
                        </div>
                        <p style="font-size: 12px; color: #666; margin-bottom: 12px;">Enter your 24-word recovery phrase.</p>
                        <textarea id="modal-mnemonic-input" placeholder="word1 word2 word3..." style="width: 100%; height: 80px; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-family: monospace; font-size: 11px; resize: none; box-sizing: border-box;"></textarea>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                            <span id="modal-encrypt-status" style="font-size: 11px; color: #666;"></span>
                            <div style="display: flex; gap: 6px;">
                                <button id="cancel-encrypt-modal" class="button">Cancel</button>
                                <button id="confirm-encrypt-btn" class="button button-primary">Encrypt</button>
                            </div>
                        </div>
                    </div>
                </div>`;
            
            $('body').append(modalHtml);
            $('#modal-mnemonic-input').focus();
            
            $('#close-encrypt-modal, #cancel-encrypt-modal, #encrypt-modal-overlay').on('click', function(e) {
                if (e.target === this) $('#encrypt-modal-overlay').remove();
            });
            
            $('#encrypt-modal-overlay > div').on('click', e => e.stopPropagation());
            
            $('#confirm-encrypt-btn').on('click', async function() {
                const $btn = $(this);
                const $status = $('#modal-encrypt-status');
                const mnemonic = $('#modal-mnemonic-input').val().trim().toLowerCase();
                const words = mnemonic.split(/\s+/);
                
                if (words.length !== 24) {
                    $status.text('Need 24 words').css('color', '#ef4444');
                    return;
                }
                
                $btn.prop('disabled', true).text('...');
                
                try {
                    if (typeof window.ethereum === 'undefined') throw new Error('No wallet');
                    
                    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                    const walletAddress = accounts[0];
                    
                    const msgResponse = await fetch(new URL('/api/boson/mnemonic-sign-message', window.api_origin).toString(), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ walletAddress })
                    });
                    const msgResult = await msgResponse.json();
                    
                    const signature = await window.ethereum.request({
                        method: 'personal_sign',
                        params: [msgResult.message, walletAddress]
                    });
                    
                    const secureResponse = await fetch(new URL('/api/boson/encrypt-mnemonic', window.api_origin).toString(), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mnemonic, signature, walletAddress })
                    });
                    const secureResult = await secureResponse.json();
                    
                    if (!secureResponse.ok || !secureResult.success) throw new Error(secureResult.error || 'Failed');
                    
                    $status.text('Done!').css('color', '#22c55e');
                    $('#modal-mnemonic-input').val('');
                    
                    setTimeout(() => {
                        $('#encrypt-modal-overlay').remove();
                        $el_window.find('#no-recovery-message, #open-encrypt-modal-btn').hide();
                        $el_window.find('#account-recovery-status').text('Encrypted backup available');
                        $el_window.find('#view-recovery-btn').show();
                    }, 1000);
                    
                } catch (error) {
                    $status.text('Error: ' + error.message).css('color', '#ef4444');
                    $btn.prop('disabled', false).text('Encrypt');
                }
            });
        });

        loadNodeIdentity();

        // Standard button handlers
        $el_window.find('.change-password').on('click', () => UIWindowChangePassword({
            window_options: { parent_uuid: $el_window.attr('data-element_uuid'), disable_parent_window: true, parent_center: true }
        }));

        $el_window.find('.change-username').on('click', () => UIWindowChangeUsername({
            window_options: { parent_uuid: $el_window.attr('data-element_uuid'), disable_parent_window: true, parent_center: true }
        }));

        $el_window.find('.change-email').on('click', () => UIWindowChangeEmail({
            window_options: { parent_uuid: $el_window.attr('data-element_uuid'), disable_parent_window: true, parent_center: true }
        }));

        $el_window.find('.manage-sessions').on('click', () => UIWindowManageSessions({
            window_options: { parent_uuid: $el_window.attr('data-element_uuid'), disable_parent_window: true, parent_center: true }
        }));

        $el_window.find('.delete-account').on('click', () => UIWindowConfirmUserDeletion({
            window_options: { parent_uuid: $el_window.attr('data-element_uuid'), disable_parent_window: true, parent_center: true }
        }));

        // Profile picture handler
        const $profilePic = $el_window.find('.change-profile-picture');
        
        if (window.user?.profile_picture_url && $profilePic.length > 0) {
            setTimeout(() => {
                if (typeof window.refresh_profile_picture === 'function') window.refresh_profile_picture();
            }, 100);
        }
        
        $profilePic.on('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            UIWindow({
                path: '/' + (window.user?.username || window.user?.wallet_address || '') + '/Desktop',
                parent_uuid: $el_window.attr('data-element_uuid'),
                allowed_file_types: ['.png', '.jpg', '.jpeg', 'image/*'],
                show_maximize_button: false,
                show_minimize_button: false,
                title: 'Select Profile Picture',
                is_dir: true,
                is_openFileDialog: true,
                selectable_body: false,
            });    
        });

        // File opened handler
        const windowElement = $el_window.get(0);
        if (windowElement) {
            windowElement.addEventListener('file_opened', async function(e) {
            let selected_file = Array.isArray(e.detail) ? e.detail[0] : e.detail;
                let signed_url = selected_file.read_url || selected_file.readURL || selected_file.url;
                
                if (!signed_url && selected_file.path) {
                try {
                    let filePath = selected_file.path;
                        if (filePath.startsWith('~')) filePath = filePath.replace('~', `/${window.user?.username || window.user?.wallet_address || ''}`);
                    const signed = await puter.fs.sign(undefined, { path: filePath, action: 'read' });
                        if (signed?.items?.read_url) signed_url = signed.items.read_url;
                        else if (signed?.items?.[0]?.read_url) signed_url = signed.items[0].read_url;
                    } catch (err) {
                        console.warn('[Account] Sign failed:', err);
                    }
                }
                
                if (signed_url) {
                    const profile_pic_path = selected_file.path;
                $el_window.find('.profile-picture').css('background-image', `url("${signed_url}")`);
                    $('.profile-image').css('background-image', `url("${signed_url}")`).addClass('profile-image-has-picture');
                
                const userRoot = window.user?.username || window.user?.wallet_address || '';
                const publicFolder = `/${userRoot}/Public`;
                const fileName = profile_pic_path.split('/').pop();
                    const targetFileName = `profile-picture-${Date.now()}-${fileName}`;
                    
                    let sourcePath = profile_pic_path;
                    if (sourcePath.startsWith('~')) sourcePath = sourcePath.replace('~', `/${userRoot}`);
                    
                    try {
                        try { await puter.fs.mkdir(publicFolder); } catch (e) {}
                        const copyResult = await puter.fs.copy(sourcePath, publicFolder, { newName: targetFileName, overwrite: true });
                        
                        let savedPath = `${publicFolder}/${targetFileName}`;
                        if (copyResult?.[0]?.copied?.path) savedPath = copyResult[0].copied.path;
                        
                        if (signed_url.startsWith('http')) {
                            localStorage.setItem(window.getProfilePictureCacheKey('signed_url'), signed_url);
                        }
                        
                    $.ajax({
                        url: `${window.api_origin}/set-profile-picture`,
                        type: 'POST',
                            data: JSON.stringify({ url: savedPath }),
                        contentType: 'application/json',
                            headers: { 'Authorization': `Bearer ${puter.authToken}` },
                            success: function() {
                            if (window.user) {
                                window.user.profile_picture_url = savedPath;
                                    try { localStorage.setItem('pc2_whoami_cache', JSON.stringify(window.user)); } catch (e) {}
                                }
                            }
                        });
                    } catch (err) {
                        console.error('[Account] Copy failed:', err);
                    $.ajax({
                        url: `${window.api_origin}/set-profile-picture`,
                        type: 'POST',
                            data: JSON.stringify({ url: profile_pic_path }),
                        contentType: 'application/json',
                            headers: { 'Authorization': `Bearer ${puter.authToken}` }
                        });
                    }
                }
            });
        }
    },
};
