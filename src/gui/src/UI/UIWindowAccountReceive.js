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
import { CHAIN_INFO } from '../helpers/particle-constants.js';

// Network asset support configuration
const NETWORK_ASSET_SUPPORT = {
    'Elastos': {
        chainId: 20,
        chainType: 'evm',
        assets: ['ELA'],
        gasWarning: false,
        recommended: true, // Default for Elastos mode
    },
    'Solana': {
        chainId: 101,
        chainType: 'solana',
        assets: ['SOL', 'USDC', 'USDT'],
        gasWarning: false,
    },
    'Base': {
        chainId: 8453,
        chainType: 'evm',
        assets: ['ETH', 'USDC', 'BTC'],
        gasWarning: false,
        recommended: true,
    },
    'Ethereum': {
        chainId: 1,
        chainType: 'evm',
        assets: ['ETH', 'USDC', 'USDT', 'BTC'],
        gasWarning: true,
    },
    'Arbitrum': {
        chainId: 42161,
        chainType: 'evm',
        assets: ['ETH', 'USDC', 'USDT', 'BTC'],
        gasWarning: false,
    },
    'Optimism': {
        chainId: 10,
        chainType: 'evm',
        assets: ['ETH', 'USDC', 'USDT', 'BTC'],
        gasWarning: false,
    },
    'Polygon': {
        chainId: 137,
        chainType: 'evm',
        assets: ['POL', 'ETH', 'USDC', 'USDT', 'BTC'],
        gasWarning: false,
    },
    'BNB Chain': {
        chainId: 56,
        chainType: 'evm',
        assets: ['BNB', 'ETH', 'USDC', 'USDT', 'BTC'],
        gasWarning: false,
    },
    'Avalanche': {
        chainId: 43114,
        chainType: 'evm',
        assets: ['ETH', 'USDC', 'USDT', 'BTC'],
        gasWarning: false,
    },
    'Linea': {
        chainId: 59144,
        chainType: 'evm',
        assets: ['ETH', 'USDC', 'USDT', 'BTC'],
        gasWarning: false,
    },
};

// Get EVM networks only
const EVM_NETWORKS = Object.entries(NETWORK_ASSET_SUPPORT)
    .filter(([_, config]) => config.chainType === 'evm')
    .map(([name, config]) => ({ name, ...config }));

/**
 * UIWindowAccountReceive - Modal dialog for receiving tokens
 * Shows different UI based on wallet mode:
 * - Universal mode: Shows Smart Account (EVM) + Solana addresses
 * - Elastos mode: Shows EOA address for Elastos Smart Chain
 */
async function UIWindowAccountReceive(options = {}) {
    // Get current wallet mode
    const walletMode = options.mode || walletService.getMode();
    const isElastosMode = walletMode === 'elastos';
    
    // Get addresses based on mode
    const smartAccountAddress = walletService.getSmartAccountAddress();
    const solanaAddress = walletService.getSolanaAddress?.() || '';
    const eoaAddress = walletService.getEOAAddress();
    
    // In Elastos mode, use EOA; in Universal mode, use Smart Account
    const evmAddress = isElastosMode ? eoaAddress : (smartAccountAddress || eoaAddress);
    const hasSolana = !isElastosMode && !!solanaAddress;
    
    // Default to Base (recommended, low fees)
    const defaultNetwork = 'Base';
    const defaultNetworkConfig = NETWORK_ASSET_SUPPORT[defaultNetwork];
    
    // Generate network options for custom dropdown with icons
    const networkOptionsHtml = EVM_NETWORKS.map(n => {
        const info = CHAIN_INFO[n.chainId] || {};
        const isSelected = n.name === defaultNetwork;
        return `<div class="network-option ${isSelected ? 'selected' : ''}" data-network="${html_encode(n.name)}" data-chainid="${n.chainId}" style="
            display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;
            background:${isSelected ? '#f3f4f6' : 'white'};
        ">
            <img src="${html_encode(info.icon || '')}" style="width:20px;height:20px;border-radius:50%;" onerror="this.style.display='none'" />
            <span>${n.name}</span>
        </div>`;
    }).join('');
    
    const defaultNetworkIcon = CHAIN_INFO[defaultNetworkConfig.chainId]?.icon || '';
    
    // Generate asset badges
    function renderAssetBadges(assets, warning = false) {
        return assets.map(asset => {
            const iconMap = {
                'ETH': '/images/tokens/ETH.png',
                'USDC': '/images/tokens/USDC.png',
                'USDT': '/images/tokens/USDT.png',
                'BTC': '/images/tokens/BTC.svg',
                'SOL': '/images/tokens/Sol.webp',
                'BNB': '/images/tokens/BNB.png',
                'POL': '/images/tokens/Polygon.png',
                'ELA': '/images/tokens/ELA.png',
            };
            const icon = iconMap[asset] || '';
            return `<span style="
                display:inline-flex;align-items:center;gap:4px;
                padding:4px 10px;background:#f3f4f6;border-radius:16px;
                font-size:12px;font-weight:500;color:#374151;
            ">
                ${icon ? `<img src="${icon}" style="width:14px;height:14px;border-radius:50%;" onerror="this.style.display='none'" />` : ''}
                ${asset}
            </span>`;
        }).join('') + (warning ? '<span style="display:inline-flex;align-items:center;gap:2px;font-size:10px;color:#dc2626;margin-left:6px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>High gas</span>' : '');
    }
    
    const solanaConfig = NETWORK_ASSET_SUPPORT['Solana'];
    
    const h = `
        <div class="receive-modal-container" style="padding: 20px;">
            
            ${isElastosMode ? `
            <!-- ===== ELASTOS EOA ADDRESS SECTION ===== -->
            <div class="address-section" style="
                background: linear-gradient(135deg, rgba(246,146,26,0.05), rgba(246,146,26,0.02));
                border: 1px solid rgba(246,146,26,0.3);
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 16px;
            ">
                <div style="display:flex;gap:16px;">
                    <!-- Left side: Address and info -->
                    <div style="flex:1;min-width:0;">
                        <!-- Elastos Header -->
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                            <img src="/images/tokens/ELA.png" style="width:32px;height:32px;border-radius:50%;" onerror="this.style.display='none'" />
                            <div>
                                <div style="font-weight:600;font-size:14px;color:#1f2937;">Elastos EOA Address</div>
                                <div style="font-size:10px;color:#6b7280;display:flex;align-items:center;gap:4px;">
                                    <span>Your wallet address on Elastos Smart Chain</span>
                                    <a href="https://esc.elastos.io/address/${html_encode(eoaAddress)}" 
                                       target="_blank" 
                                       rel="noopener noreferrer"
                                       title="View on Elastos Explorer"
                                       style="color:#F6921A;text-decoration:none;display:inline-flex;align-items:center;">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                            <polyline points="15 3 21 3 21 9"></polyline>
                                            <line x1="10" y1="14" x2="21" y2="3"></line>
                                        </svg>
                                    </a>
                                </div>
                            </div>
                        </div>
                        
                        <!-- EOA Address -->
                        <div class="address-display eoa-address" 
                             data-address="${html_encode(eoaAddress)}"
                             style="
                                 display:flex;align-items:center;gap:8px;
                                 padding:10px 12px;background:white;border-radius:8px;
                                 font-family:'SF Mono',Monaco,monospace;font-size:11px;
                                 color:#374151;cursor:pointer;border:1px solid rgba(246,146,26,0.3);
                                 word-break:break-all;margin-bottom:10px;
                             ">
                            <span style="flex:1;">${eoaAddress}</span>
                            <img src="${window.icons?.['copy.svg'] || ''}" class="copy-indicator" style="width:16px;height:16px;opacity:0.5;flex-shrink:0;" onerror="this.outerHTML='<span class=\\'copy-indicator\\' style=\\'opacity:0.5;flex-shrink:0;font-size:14px;\\'>Copy</span>'" />
                        </div>
                        
                        <!-- Accepted Tokens on Elastos -->
                        <div>
                            <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">
                                Tokens Supported:
                            </div>
                            <div style="display:flex;flex-wrap:wrap;gap:6px;">
                                ${renderAssetBadges(['ELA'])}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Right side: QR Code -->
                    <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;">
                        <div id="eoa-qr-code" style="
                            padding:8px;background:white;border-radius:8px;border:1px solid rgba(246,146,26,0.3);
                "></div>
                        <div style="font-size:9px;color:#9ca3af;margin-top:4px;text-align:center;">Scan QR</div>
                    </div>
                </div>
            </div>
            ` : `
            <!-- ===== EVM ADDRESS SECTION (Universal Mode) ===== -->
            <div class="address-section" style="
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 16px;
                ">
                <div style="display:flex;gap:16px;">
                    <!-- Left side: Address and tokens -->
                    <div style="flex:1;min-width:0;">
                        <!-- EVM Header with Network Selector -->
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <img src="/images/tokens/ETH.png" style="width:32px;height:32px;border-radius:50%;" onerror="this.style.display='none'" />
                                <div>
                                    <div style="font-weight:600;font-size:14px;color:#1f2937;">EVM Address</div>
                                    <div style="font-size:10px;color:#6b7280;">Same address for all EVM networks</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Custom Network Dropdown with Icons -->
                        <div id="network-dropdown" style="position:relative;margin-bottom:10px;">
                            <!-- Selected Network Display -->
                            <div id="network-selected" style="
                                display:flex;align-items:center;gap:8px;
                                padding:10px 12px;
                                border:1px solid #d1d5db;
                                border-radius:8px;
                                background:white;
                                cursor:pointer;
                                font-size:13px;
                            ">
                                <img id="selected-network-icon" src="${html_encode(defaultNetworkIcon)}" style="width:20px;height:20px;border-radius:50%;" onerror="this.style.display='none'" />
                                <span id="selected-network-text" style="flex:1;">${defaultNetwork}</span>
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="opacity:0.5;"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </div>
                            
                            <!-- Dropdown Options -->
                            <div id="network-options" style="
                                display:none;
                                position:absolute;
                                top:100%;
                                left:0;
                                right:0;
                                background:white;
                                border:1px solid #d1d5db;
                                border-radius:8px;
                                margin-top:4px;
                                box-shadow:0 4px 12px rgba(0,0,0,0.15);
                                z-index:100;
                                max-height:250px;
                                overflow-y:auto;
                            ">
                                ${networkOptionsHtml}
                            </div>
                </div>
                        
                        <!-- EVM Address -->
                        <div class="address-display evm-address" 
                             data-address="${html_encode(evmAddress)}"
                     style="
                                 display:flex;align-items:center;gap:8px;
                                 padding:10px 12px;background:white;border-radius:8px;
                                 font-family:'SF Mono',Monaco,monospace;font-size:11px;
                                 color:#374151;cursor:pointer;border:1px solid #e5e7eb;
                                 word-break:break-all;margin-bottom:10px;
                             ">
                            <span style="flex:1;">${evmAddress}</span>
                            <img src="${window.icons?.['copy.svg'] || ''}" class="copy-indicator" style="width:16px;height:16px;opacity:0.5;flex-shrink:0;" onerror="this.outerHTML='<span class=\\'copy-indicator\\' style=\\'opacity:0.5;flex-shrink:0;font-size:14px;\\'>Copy</span>'" />
                        </div>
                        
                        <!-- Accepted Tokens for Selected Network -->
                        <div>
                            <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">
                                Tokens on <span id="selected-network-name" style="font-weight:600;">${defaultNetwork}</span>:
                            </div>
                            <div id="evm-accepted-tokens" style="display:flex;flex-wrap:wrap;gap:6px;">
                                ${renderAssetBadges(defaultNetworkConfig.assets, defaultNetworkConfig.gasWarning)}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Right side: QR Code -->
                    <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;">
                        <div id="evm-qr-code" style="
                            padding:8px;background:white;border-radius:8px;border:1px solid #e5e7eb;
                "></div>
                        <div style="font-size:9px;color:#9ca3af;margin-top:4px;text-align:center;">Scan QR</div>
                    </div>
                </div>
            </div>
            `}
            
            ${!isElastosMode ? `
            <!-- ===== SOLANA ADDRESS SECTION (Universal Mode Only) ===== -->
            <div class="address-section" style="
                background: linear-gradient(135deg, rgba(153,69,255,0.05), rgba(20,241,149,0.05));
                border: 1px solid rgba(153,69,255,0.2);
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 16px;
            ">
                <div style="display:flex;gap:16px;">
                    <!-- Left side: Address and tokens -->
                    <div style="flex:1;min-width:0;">
                        <!-- Solana Header -->
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                            <img src="/images/tokens/Sol.webp" style="width:32px;height:32px;border-radius:50%;" onerror="this.style.display='none'" />
                            <div>
                                <div style="font-weight:600;font-size:14px;color:#1f2937;">Solana Address</div>
                                <div style="font-size:10px;color:#6b7280;">For Solana network only</div>
                            </div>
                        </div>
                        
                        <!-- Solana Address -->
                        ${hasSolana ? `
                        <div class="address-display solana-address" 
                             data-address="${html_encode(solanaAddress)}"
                             style="
                                 display:flex;align-items:center;gap:8px;
                                 padding:10px 12px;background:white;border-radius:8px;
                                 font-family:'SF Mono',Monaco,monospace;font-size:11px;
                                 color:#374151;cursor:pointer;border:1px solid #e9d5ff;
                                 word-break:break-all;margin-bottom:10px;
                             ">
                            <span style="flex:1;">${solanaAddress}</span>
                            <img src="${window.icons?.['copy.svg'] || ''}" class="copy-indicator" style="width:16px;height:16px;opacity:0.5;flex-shrink:0;" onerror="this.outerHTML='<span class=\\'copy-indicator\\' style=\\'opacity:0.5;flex-shrink:0;font-size:14px;\\'>Copy</span>'" />
                        </div>
                        ` : `
                        <div style="
                            padding:10px 12px;background:rgba(255,255,255,0.5);border-radius:8px;
                            font-size:12px;color:#6b7280;text-align:center;border:1px dashed #e9d5ff;
                            margin-bottom:10px;
                        ">
                            Loading Solana address...
                        </div>
                        `}
                        
                        <!-- Accepted Tokens on Solana -->
                        <div>
                            <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">Tokens on Solana:</div>
                            <div style="display:flex;flex-wrap:wrap;gap:6px;">
                                ${renderAssetBadges(solanaConfig.assets)}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Right side: QR Code -->
                    ${hasSolana ? `
                    <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;">
                        <div id="solana-qr-code" style="
                            padding:8px;background:white;border-radius:8px;border:1px solid #e9d5ff;
                        "></div>
                        <div style="font-size:9px;color:#9ca3af;margin-top:4px;text-align:center;">Scan QR</div>
                    </div>
                    ` : ''}
                </div>
            </div>
            ` : ''}
            
            <!-- ===== EXTERNAL LINK (Universal Mode Only) ===== -->
            ${!isElastosMode ? `
            <div style="text-align:center;">
                <a href="https://universalx.app/overview" 
                   target="_blank" 
                   rel="noopener noreferrer"
                   style="font-size:12px;color:#3b82f6;text-decoration:underline;">
                    Access SmartWallet outside ElastOS →
                </a>
            </div>
            ` : ''}
        </div>
        
        <style>
            .address-display:hover {
                background: #f3f4f6 !important;
            }
            .address-display.copied {
                background: rgba(34, 197, 94, 0.1) !important;
            }
            .address-display.copied .copy-indicator {
                opacity: 1;
            }
            #network-selected:hover {
                border-color: #9ca3af;
            }
            .network-option:hover {
                background: #f9fafb !important;
            }
            #network-options::-webkit-scrollbar {
                width: 6px;
            }
            #network-options::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 3px;
            }
            #network-options::-webkit-scrollbar-thumb {
                background: #c1c1c1;
                border-radius: 3px;
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
            width: 580,
            height: 'auto',
            dominant: true,
            stay_on_top: true,
            show_in_taskbar: false,
            draggable_body: false,
            window_class: 'window-account-receive',
            body_css: {
                width: 'initial',
                height: 'auto',
                maxHeight: '85vh',
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '0',
            },
            ...options.window_options,
        });
        
        const $window = $(el_window);
        
        // Generate QR code for a specific container
        function generateQRCode(containerId, addr, size = 100) {
            const $qrContainer = $window.find(containerId);
            if (!$qrContainer.length || !addr) return;
            
            $qrContainer.empty();
            
            if (typeof QRCode !== 'undefined') {
                new QRCode($qrContainer[0], {
                    text: addr,
                    width: size,
                    height: size,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H,
                });
            } else {
                $qrContainer.html(`
                    <div style="
                        width:${size}px;height:${size}px;
                        display:flex;align-items:center;justify-content:center;
                        background:#f3f4f6;border-radius:8px;
                        font-size:10px;color:#6b7280;text-align:center;
                        padding:8px;word-break:break-all;
                    ">
                        ${truncateAddress(addr, 6, 4)}
                    </div>
                `);
            }
        }
        
        // Generate QR codes based on mode
        if (isElastosMode) {
            // EOA mode - single QR for Elastos address
            generateQRCode('#eoa-qr-code', eoaAddress, 100);
        } else {
            // Universal mode - EVM and optionally Solana QR
            generateQRCode('#evm-qr-code', evmAddress, 100);
            if (hasSolana) {
                generateQRCode('#solana-qr-code', solanaAddress, 100);
            }
        }
        
        // Custom dropdown toggle
        $window.on('click', '#network-selected', function(e) {
            e.stopPropagation();
            const $options = $window.find('#network-options');
            $options.toggle();
        });
        
        // Close dropdown when clicking outside
        $(document).on('click.networkDropdown', function() {
            $window.find('#network-options').hide();
        });
        
        // Network option click
        $window.on('click', '.network-option', function() {
            const networkName = $(this).data('network');
            const chainId = $(this).data('chainid');
            const config = NETWORK_ASSET_SUPPORT[networkName];
            const info = CHAIN_INFO[chainId] || {};
            
            // Update selected display
            $window.find('#selected-network-text').text(networkName);
            $window.find('#selected-network-icon').attr('src', info.icon || '');
            
            // Update selected state
            $window.find('.network-option').removeClass('selected').css('background', 'white');
            $(this).addClass('selected').css('background', '#f3f4f6');
            
            // Update network name in tokens label
            $window.find('#selected-network-name').text(networkName);
            
            // Update accepted tokens
            const tokensHtml = renderAssetBadges(config.assets, config.gasWarning);
            $window.find('#evm-accepted-tokens').html(tokensHtml);
            
            // Close dropdown
            $window.find('#network-options').hide();
        });
        
        // Hover effect for options
        $window.on('mouseenter', '.network-option:not(.selected)', function() {
            $(this).css('background', '#f9fafb');
        }).on('mouseleave', '.network-option:not(.selected)', function() {
            $(this).css('background', 'white');
        });
        
        // Click on EVM address - copy
        $window.on('click', '.evm-address', async function() {
            const addr = $(this).data('address');
            await doCopy(addr, $(this));
        });
        
        // Click on EOA address (Elastos mode) - copy
        $window.on('click', '.eoa-address', async function() {
            const addr = $(this).data('address');
            await doCopy(addr, $(this));
        });
        
        // Click on Solana address - copy
        $window.on('click', '.solana-address', async function() {
            const addr = $(this).data('address');
            await doCopy(addr, $(this));
        });
        
        async function doCopy(addr, $element) {
            const success = await copyToClipboard(addr);
            
            if (success) {
                $element.addClass('copied');
                const $indicator = $element.find('.copy-indicator');
                if ($indicator.is('img')) {
                    $indicator.attr('src', window.icons?.['checkmark.svg'] || '');
                } else {
                    $indicator.text('Copied');
                }
                
                UINotification({
                    icon: window.icons['checkmark.svg'],
                    title: i18n('address_copied') || 'Address Copied',
                    text: truncateAddress(addr),
                    duration: 3000,
                });
                
                setTimeout(() => {
                    $element.removeClass('copied');
                    if ($indicator.is('img')) {
                        $indicator.attr('src', window.icons?.['copy.svg'] || '');
                    } else {
                        $indicator.text('Copy');
                    }
                }, 2000);
            }
        }
        
        // Helper to render asset badges (needed for dynamic updates)
        function renderAssetBadges(assets, warning = false) {
            const iconMap = {
                'ETH': '/images/tokens/ETH.png',
                'USDC': '/images/tokens/USDC.png',
                'USDT': '/images/tokens/USDT.png',
                'BTC': '/images/tokens/BTC.svg',
                'SOL': '/images/tokens/Sol.webp',
                'BNB': '/images/tokens/BNB.png',
                'POL': '/images/tokens/Polygon.png',
                'ELA': '/images/tokens/ELA.png',
            };
            return assets.map(asset => {
                const icon = iconMap[asset] || '';
                return `<span style="
                    display:inline-flex;align-items:center;gap:4px;
                    padding:4px 10px;background:#f3f4f6;border-radius:16px;
                    font-size:12px;font-weight:500;color:#374151;
                ">
                    ${icon ? `<img src="${icon}" style="width:14px;height:14px;border-radius:50%;" onerror="this.style.display='none'" />` : ''}
                    ${asset}
                </span>`;
            }).join('') + (warning ? '<span style="display:inline-flex;align-items:center;gap:2px;font-size:10px;color:#dc2626;margin-left:6px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>High gas</span>' : '');
        }
        
        // Cleanup
        $window.on('remove', function() {
            $(document).off('click.networkDropdown');
            resolve();
        });
    });
}

export default UIWindowAccountReceive;
