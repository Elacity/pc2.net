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

export default {
    id: 'access_control',
    title_i18n_key: 'access_control',
    icon: 'user.svg',
    html: () => {
        let h = `<h1>${i18n('access_control')}</h1>`;
        
        // Check if PC2 mode
        const isPC2Mode = window.api_origin && (
            window.api_origin.includes('127.0.0.1:4200') || 
            window.api_origin.includes('localhost:4200') ||
            window.api_origin.includes('127.0.0.1:4202') ||
            window.api_origin.includes('localhost:4202') ||
            window.location.origin === window.api_origin
        );

        if (!isPC2Mode) {
            h += '<p style="color: #888;">Access control is only available in PC2 mode.</p>';
            return h;
        }

        // Description
        h += `<p style="color: #666; margin-bottom: 20px; font-size: 13px;">
            Manage who can access your PC2 node. Only wallets in this list can log in.
        </p>`;

        // Owner info card
        h += `<div class="settings-card">`;
        h += `<div style="flex: 1;">`;
        h += `<strong style="display:block;">Node Owner</strong>`;
        h += `<span id="owner-wallet" style="display:block; margin-top:5px; font-size: 12px; color: #666; font-family: monospace;">Loading...</span>`;
        h += `</div>`;
        h += `</div>`;

        // Add wallet card
        h += `<h2 style="font-size: 14px; margin: 25px 0 10px; color: #333;">Add Wallet</h2>`;
        h += `<div class="settings-card" style="flex-direction: column; align-items: stretch;">`;
        h += `<div style="display: flex; gap: 10px; align-items: center;">`;
        h += `<input type="text" id="add-wallet-address" placeholder="0x..." style="flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-family: monospace; font-size: 13px;">`;
        h += `<select id="add-wallet-role" style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; min-width: 100px;">`;
        h += `<option value="member">Member</option>`;
        h += `<option value="admin">Admin</option>`;
        h += `</select>`;
        h += `<button id="btn-add-wallet" class="button button-primary">Add</button>`;
        h += `</div>`;
        h += `<div id="add-wallet-status" style="margin-top: 8px; font-size: 12px; min-height: 18px;"></div>`;
        h += `</div>`;

        // Allowed wallets section
        h += `<div style="display: flex; justify-content: space-between; align-items: center; margin: 25px 0 10px;">`;
        h += `<h2 style="font-size: 14px; color: #333; margin: 0;">Allowed Wallets</h2>`;
        h += `<button id="btn-refresh-wallets" class="button" style="font-size: 12px; padding: 4px 12px;">Refresh</button>`;
        h += `</div>`;
        
        h += `<div id="allowed-wallets-list" class="settings-card" style="flex-direction: column; align-items: stretch; min-height: 60px;">`;
        h += `<div style="text-align: center; padding: 15px; color: #999;">Loading...</div>`;
        h += `</div>`;

        return h;
    },
    init: ($el_window) => {
        const apiOrigin = window.api_origin || '';
        
        // Load owner info
        async function loadOwnerInfo() {
            try {
                const response = await fetch(`${apiOrigin}/api/access/status`, {
                    credentials: 'include'
                });
                const data = await response.json();
                
                const ownerEl = $el_window.find('#owner-wallet');
                if (data.ownerWallet) {
                    const short = data.ownerWallet.substring(0, 12) + '...' + data.ownerWallet.substring(data.ownerWallet.length - 8);
                    ownerEl.text(short);
                    ownerEl.attr('title', data.ownerWallet);
                } else {
                    ownerEl.text('Not set (first login will claim)');
                    ownerEl.css('color', '#f59e0b');
                }
            } catch (error) {
                console.error('Failed to load owner info:', error);
                $el_window.find('#owner-wallet').text('Error loading');
            }
        }
        
        // Load allowed wallets
        async function loadAllowedWallets() {
            const listEl = $el_window.find('#allowed-wallets-list');
            listEl.html('<div style="text-align: center; padding: 15px; color: #999;">Loading...</div>');
            
            try {
                const response = await fetch(`${apiOrigin}/api/access/list`, {
                    credentials: 'include'
                });
                const data = await response.json();
                
                if (!data.success) {
                    listEl.html(`<div style="color: #ef4444; padding: 12px;">${data.error || 'Failed to load'}</div>`);
                    return;
                }
                
                const wallets = data.wallets || [];
                
                if (wallets.length === 0) {
                    listEl.html('<div style="text-align: center; padding: 15px; color: #999;">No additional wallets added yet.</div>');
                    return;
                }
                
                let html = '';
                
                for (const entry of wallets) {
                    const shortWallet = entry.wallet.substring(0, 12) + '...' + entry.wallet.substring(entry.wallet.length - 6);
                    const roleColor = entry.role === 'admin' ? '#3b82f6' : '#22c55e';
                    const roleLabel = entry.role.charAt(0).toUpperCase() + entry.role.slice(1);
                    
                    html += `
                        <div class="wallet-entry" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #eee;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="font-family: monospace; font-size: 13px;" title="${entry.wallet}">${shortWallet}</span>
                                <span style="padding: 2px 8px; background: ${roleColor}15; color: ${roleColor}; border-radius: 4px; font-size: 11px; font-weight: 500;">${roleLabel}</span>
                            </div>
                            <button class="button btn-remove-wallet" data-wallet="${entry.wallet}" style="font-size: 11px; padding: 4px 10px; color: #ef4444; border-color: #ef4444;">
                                Remove
                            </button>
                        </div>
                    `;
                }
                
                listEl.html(html);
                
                // Bind remove handlers
                listEl.find('.btn-remove-wallet').on('click', async function() {
                    const wallet = $(this).data('wallet');
                    if (!confirm(`Remove wallet ${wallet.substring(0, 12)}...?`)) return;
                    
                    try {
                        const response = await fetch(`${apiOrigin}/api/access/remove`, {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ wallet })
                        });
                        const result = await response.json();
                        
                        if (result.success) {
                            loadAllowedWallets();
                        } else {
                            alert(result.error || 'Failed to remove wallet');
                        }
                    } catch (error) {
                        alert('Error removing wallet: ' + error.message);
                    }
                });
                
            } catch (error) {
                console.error('Failed to load wallets:', error);
                listEl.html('<div style="color: #ef4444; padding: 12px;">Error loading wallets</div>');
            }
        }
        
        // Add wallet handler
        $el_window.find('#btn-add-wallet').on('click', async function() {
            const walletInput = $el_window.find('#add-wallet-address');
            const roleSelect = $el_window.find('#add-wallet-role');
            const statusEl = $el_window.find('#add-wallet-status');
            const btn = $(this);
            
            const wallet = walletInput.val().trim().toLowerCase();
            const role = roleSelect.val();
            
            // Validate
            if (!wallet) {
                statusEl.html('<span style="color: #ef4444;">Please enter a wallet address</span>');
                return;
            }
            
            if (!/^0x[a-f0-9]{40}$/i.test(wallet)) {
                statusEl.html('<span style="color: #ef4444;">Invalid wallet address format</span>');
                return;
            }
            
            btn.prop('disabled', true);
            btn.text('Adding...');
            statusEl.html('<span style="color: #888;">Adding wallet...</span>');
            
            try {
                const response = await fetch(`${apiOrigin}/api/access/add`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ wallet, role })
                });
                const result = await response.json();
                
                if (result.success) {
                    statusEl.html('<span style="color: #22c55e;">Wallet added successfully!</span>');
                    walletInput.val('');
                    loadAllowedWallets();
                    
                    setTimeout(() => statusEl.html(''), 3000);
                } else {
                    statusEl.html(`<span style="color: #ef4444;">${result.error || 'Failed to add wallet'}</span>`);
                }
            } catch (error) {
                statusEl.html(`<span style="color: #ef4444;">Error: ${error.message}</span>`);
            } finally {
                btn.prop('disabled', false);
                btn.text('Add');
            }
        });
        
        // Refresh handler
        $el_window.find('#btn-refresh-wallets').on('click', function() {
            loadAllowedWallets();
        });
        
        // Initial load
        loadOwnerInfo();
        loadAllowedWallets();
    }
};
