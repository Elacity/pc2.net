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

import UIWindow from './UIWindow.js';
import UINotification from './UINotification.js';
import walletService from '../services/WalletService.js';
import { truncateAddress, copyToClipboard } from '../helpers/wallet.js';

const Component = use('util.Component');

/**
 * UIWindowAccountReceive - Modal dialog for receiving tokens
 * 
 * Features:
 * - QR code generation for address
 * - Address display with copy functionality
 * - Smart Account vs EOA address selection
 * - Network information
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.address - Primary receiving address (Smart Account preferred)
 * @param {string} options.smartAccountAddress - Universal Account address
 * @param {string} options.eoaAddress - EOA wallet address
 */
async function UIWindowAccountReceive(options = {}) {
    const address = options.address || walletService.getAddress();
    const smartAccountAddress = options.smartAccountAddress || walletService.getSmartAccountAddress();
    const eoaAddress = options.eoaAddress || walletService.getEOAAddress();
    
    const hasSmartAccount = !!smartAccountAddress;
    const hasBothAddresses = hasSmartAccount && eoaAddress && smartAccountAddress !== eoaAddress;
    
    const h = `
        <div class="receive-modal-container" style="padding: 24px; text-align: center;">
            <!-- QR Code -->
            <div id="receive-qr-container" style="
                display: flex;
                justify-content: center;
                margin-bottom: 24px;
            ">
                <div id="receive-qr-code" style="
                    padding: 16px;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                "></div>
            </div>
            
            <!-- Address Type Selector (if both addresses available) -->
            ${hasBothAddresses ? `
                <div class="address-type-selector" style="
                    display: flex;
                    gap: 8px;
                    justify-content: center;
                    margin-bottom: 16px;
                ">
                    <button class="address-type-btn active" data-type="smart" style="
                        padding: 8px 16px;
                        border: 1px solid #3b82f6;
                        background: #3b82f6;
                        color: white;
                        border-radius: 20px;
                        font-size: 13px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    ">
                        Universal Account
                    </button>
                    <button class="address-type-btn" data-type="eoa" style="
                        padding: 8px 16px;
                        border: 1px solid #d1d5db;
                        background: white;
                        color: #374151;
                        border-radius: 20px;
                        font-size: 13px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    ">
                        EOA Wallet
                    </button>
                </div>
            ` : ''}
            
            <!-- Address Display -->
            <div class="address-display-section" style="margin-bottom: 24px;">
                <div style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">
                    ${hasSmartAccount ? 
                        (i18n('universal_account_address') || 'Universal Account Address') : 
                        (i18n('wallet_address') || 'Wallet Address')}
                </div>
                <div id="receive-address-display" 
                     class="address-display"
                     data-address="${html_encode(address)}"
                     style="
                         display: inline-flex;
                         align-items: center;
                         gap: 10px;
                         padding: 12px 16px;
                         background: #f3f4f6;
                         border-radius: 8px;
                         font-family: 'SF Mono', Monaco, monospace;
                         font-size: 13px;
                         color: #374151;
                         cursor: pointer;
                         transition: all 0.2s ease;
                         max-width: 100%;
                         overflow: hidden;
                     ">
                    <span class="address-text" style="word-break: break-all;">${address}</span>
                    <img class="copy-icon" src="${window.icons['copy.svg']}" alt="Copy" style="
                        width: 18px;
                        height: 18px;
                        opacity: 0.5;
                        flex-shrink: 0;
                    ">
                </div>
            </div>
            
            <!-- Copy Button -->
            <button id="receive-copy-btn" style="
                width: 100%;
                padding: 14px;
                background: #3b82f6;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            ">
                <img src="${window.icons['copy.svg']}" alt="" style="width: 18px; height: 18px; filter: brightness(0) invert(1);">
                ${i18n('copy_address') || 'Copy Address'}
            </button>
            
            <!-- Info Section -->
            <div style="
                margin-top: 20px;
                padding: 16px;
                background: rgba(59, 130, 246, 0.05);
                border-radius: 8px;
                text-align: left;
            ">
                <div style="display: flex; align-items: flex-start; gap: 10px;">
                    <img src="${window.icons['info.svg'] || window.icons['help.svg']}" alt="" style="
                        width: 18px;
                        height: 18px;
                        opacity: 0.6;
                        margin-top: 2px;
                    ">
                    <div style="font-size: 13px; color: #6b7280; line-height: 1.5;">
                        ${hasSmartAccount ? 
                            (i18n('universal_account_info') || 'This Universal Account address can receive tokens on any supported network. Funds are automatically unified across chains.') :
                            (i18n('eoa_info') || 'Send tokens to this address on the correct network to avoid loss of funds.')}
                    </div>
                </div>
            </div>
        </div>
        
        <style>
            #receive-copy-btn:hover {
                background: #2563eb;
            }
            .address-display:hover {
                background: #e5e7eb;
            }
            .address-display.copied {
                background: rgba(34, 197, 94, 0.1);
            }
            .address-type-btn:not(.active):hover {
                background: #f3f4f6;
            }
        </style>
    `;
    
    return new Promise(async (resolve) => {
        const el_window = await UIWindow({
            title: i18n('receive_tokens') || 'Receive Tokens',
            app: 'account-receive',
            single_instance: true,
            icon: window.icons['download.svg'] || window.icons['arrow-down.svg'],
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
            backdrop: true,
            width: 400,
            height: 'auto',
            dominant: true,
            show_in_taskbar: false,
            draggable_body: false,
            window_class: 'window-account-receive',
            body_css: {
                width: 'initial',
                height: '100%',
                overflow: 'auto',
                padding: '0',
            },
            ...options.window_options,
        });
        
        const $window = $(el_window);
        let currentAddress = address;
        
        // Generate QR code
        function generateQRCode(addr) {
            const $qrContainer = $window.find('#receive-qr-code');
            $qrContainer.empty();
            
            if (typeof QRCode !== 'undefined') {
                new QRCode($qrContainer[0], {
                    text: addr,
                    width: 200,
                    height: 200,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H,
                });
            } else {
                // Fallback: show address as text
                $qrContainer.html(`
                    <div style="
                        width: 200px;
                        height: 200px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: #f3f4f6;
                        border-radius: 8px;
                        font-size: 12px;
                        color: #6b7280;
                        text-align: center;
                        padding: 20px;
                        word-break: break-all;
                    ">
                        ${truncateAddress(addr, 10, 8)}
                    </div>
                `);
            }
        }
        
        // Initial QR code generation
        generateQRCode(currentAddress);
        
        // Address type selector
        $window.on('click', '.address-type-btn', function() {
            const type = $(this).data('type');
            
            $window.find('.address-type-btn').removeClass('active').css({
                'background': 'white',
                'color': '#374151',
                'border-color': '#d1d5db',
            });
            
            $(this).addClass('active').css({
                'background': '#3b82f6',
                'color': 'white',
                'border-color': '#3b82f6',
            });
            
            // Update address
            currentAddress = type === 'smart' ? smartAccountAddress : eoaAddress;
            $window.find('#receive-address-display').data('address', currentAddress);
            $window.find('#receive-address-display .address-text').text(currentAddress);
            
            // Regenerate QR
            generateQRCode(currentAddress);
        });
        
        // Copy address - click on address display
        $window.on('click', '#receive-address-display', async function() {
            const addr = $(this).data('address');
            await doCopy(addr);
        });
        
        // Copy address - copy button
        $window.on('click', '#receive-copy-btn', async function() {
            await doCopy(currentAddress);
        });
        
        async function doCopy(addr) {
            const success = await copyToClipboard(addr);
            
            if (success) {
                // Visual feedback
                $window.find('#receive-address-display').addClass('copied');
                $window.find('#receive-copy-btn').html(`
                    <img src="${window.icons['checkmark.svg']}" alt="" style="width: 18px; height: 18px; filter: brightness(0) invert(1);">
                    ${i18n('copied') || 'Copied!'}
                `);
                
                UINotification({
                    icon: window.icons['checkmark.svg'],
                    title: i18n('address_copied') || 'Address Copied',
                    text: truncateAddress(addr),
                });
                
                setTimeout(() => {
                    $window.find('#receive-address-display').removeClass('copied');
                    $window.find('#receive-copy-btn').html(`
                        <img src="${window.icons['copy.svg']}" alt="" style="width: 18px; height: 18px; filter: brightness(0) invert(1);">
                        ${i18n('copy_address') || 'Copy Address'}
                    `);
                }, 2000);
            }
        }
        
        // Cleanup
        $window.on('remove', function() {
            resolve();
        });
    });
}

export default UIWindowAccountReceive;

