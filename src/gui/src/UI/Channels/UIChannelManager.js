/**
 * Channel Manager Window
 * 
 * Manages saved channel credentials (bots/accounts).
 * Users can add, edit, and remove Telegram bots, WhatsApp accounts, Discord bots, etc.
 */

import UIWindow from '../UIWindow.js';

const UIChannelManager = async function(options = {}) {
    const { channelType, onUpdate } = options;
    
    // Fetch saved channels
    let savedChannels = [];
    try {
        const response = await $.ajax({
            url: '/api/gateway/saved-channels',
            method: 'GET',
            headers: { 'Authorization': `Bearer ${window.auth_token}` }
        });
        if (response.success && response.data) {
            savedChannels = response.data;
            if (channelType) {
                savedChannels = savedChannels.filter(c => c.type === channelType);
            }
        }
    } catch (e) {
        console.warn('[ChannelManager] Could not fetch saved channels:', e);
    }
    
    // Fetch current connection status
    let gatewayStatus = {};
    try {
        const response = await $.ajax({
            url: '/api/gateway/status',
            method: 'GET',
            headers: { 'Authorization': `Bearer ${window.auth_token}` }
        });
        if (response.success && response.data) {
            gatewayStatus = response.data.channels || {};
        }
    } catch (e) {
        console.warn('[ChannelManager] Could not fetch gateway status:', e);
    }
    
    // Channel type icons
    const channelIcons = {
        telegram: `<svg width="16" height="16" viewBox="0 0 24 24" fill="#0088cc"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,
        whatsapp: `<svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`,
        discord: `<svg width="16" height="16" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/></svg>`,
    };
    
    // Build saved channels list
    const buildChannelsList = () => {
        if (savedChannels.length === 0) {
            return `
                <div style="text-align: center; padding: 24px; color: #888;">
                    <div style="font-size: 32px; margin-bottom: 8px;">📱</div>
                    <div style="font-size: 13px;">No channels configured</div>
                    <div style="font-size: 11px; margin-top: 4px;">Add a Telegram bot, WhatsApp, or Discord to get started</div>
                </div>
            `;
        }
        
        return savedChannels.map(ch => {
            const icon = channelIcons[ch.type] || '';
            const isConnected = gatewayStatus[ch.type] === 'connected';
            const statusColor = isConnected ? '#10b981' : '#999';
            const statusText = isConnected ? 'Connected' : 'Disconnected';
            
            return `
                <div class="saved-channel-row" data-channel-id="${ch.id}" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: #f9fafb; border-radius: 8px; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        ${icon}
                        <div>
                            <div style="font-weight: 500; font-size: 13px;">${ch.name}</div>
                            <div style="font-size: 10px; color: #666; display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                                <span style="width: 6px; height: 6px; border-radius: 50%; background: ${statusColor};"></span>
                                ${statusText}
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        ${!isConnected ? `<button class="button connect-channel-btn" style="padding: 4px 10px; font-size: 10px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">Connect</button>` : ''}
                        ${isConnected ? `<button class="button disconnect-channel-btn" style="padding: 4px 10px; font-size: 10px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer;">Disconnect</button>` : ''}
                        <button class="button delete-channel-btn" style="padding: 4px 10px; font-size: 10px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; cursor: pointer;">Delete</button>
                    </div>
                </div>
            `;
        }).join('');
    };
    
    const h = `
        <div class="channel-manager" style="display: flex; flex-direction: column; height: 100%; background: #fff;">
            <!-- Header -->
            <div style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background: #f9fafb;">
                <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Manage Channels</h2>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #666;">
                    Add and manage your messaging bot credentials
                </p>
            </div>
            
            <!-- Content -->
            <div style="flex: 1; overflow-y: auto; padding: 20px;">
                <!-- Add New Channel -->
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 12px; font-weight: 600; margin-bottom: 8px; color: #374151;">Add New Channel</div>
                    <div style="display: flex; gap: 8px;">
                        <button class="add-channel-btn" data-type="telegram" style="display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 12px;">
                            ${channelIcons.telegram}
                            <span>Telegram Bot</span>
                        </button>
                        <button class="add-channel-btn" data-type="whatsapp" style="display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 12px; opacity: 0.5;" disabled>
                            ${channelIcons.whatsapp}
                            <span>WhatsApp</span>
                            <span style="font-size: 9px; color: #888;">(Soon)</span>
                        </button>
                        <button class="add-channel-btn" data-type="discord" style="display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 12px; opacity: 0.5;" disabled>
                            ${channelIcons.discord}
                            <span>Discord</span>
                            <span style="font-size: 9px; color: #888;">(Soon)</span>
                        </button>
                    </div>
                </div>
                
                <!-- Saved Channels -->
                <div>
                    <div style="font-size: 12px; font-weight: 600; margin-bottom: 8px; color: #374151;">Your Channels</div>
                    <div id="saved-channels-list">
                        ${buildChannelsList()}
                    </div>
                </div>
            </div>
            
            <!-- Footer -->
            <div style="padding: 16px 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end;">
                <button class="button close-btn" style="padding: 8px 16px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 13px;">Close</button>
            </div>
        </div>
    `;
    
    const el_window = await UIWindow({
        title: 'Manage Channels',
        icon: null,
        uid: null,
        is_dir: false,
        app: 'channel-manager',
        body_content: h,
        has_head: true,
        selectable_body: false,
        allow_context_menu: false,
        is_resizable: true,
        is_droppable: false,
        init_center: true,
        allow_native_ctxmenu: false,
        allow_user_select: false,
        backdrop: true,
        width: 520,
        height: 500,
        dominant: false,
        show_in_taskbar: false,
        onAppend: function(el_window) {
            const $win = $(el_window);
            
            function closeWindow() {
                if ($win.close && typeof $win.close === 'function') {
                    $win.close();
                } else {
                    const $backdrop = $win.closest('.window-backdrop');
                    if ($backdrop.length) {
                        $backdrop.remove();
                    } else {
                        $win.remove();
                    }
                }
            }
            
            // Close button
            $win.find('.close-btn').on('click', closeWindow);
            $win.find('.window-close-btn').off('click').on('click', function(e) {
                e.stopPropagation();
                closeWindow();
            });
            
            // Add Telegram bot
            $win.find('.add-channel-btn[data-type="telegram"]').on('click', async function() {
                const { default: UITelegramConnect } = await import('./UITelegramConnect.js');
                UITelegramConnect({
                    onSuccess: async (botToken, botUsername) => {
                        // Save the channel
                        try {
                            await $.ajax({
                                url: '/api/gateway/saved-channels',
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${window.auth_token}` },
                                contentType: 'application/json',
                                data: JSON.stringify({
                                    type: 'telegram',
                                    name: botUsername ? `@${botUsername}` : 'Telegram Bot',
                                    telegram: { botToken, botUsername }
                                })
                            });
                            
                            // Refresh list
                            closeWindow();
                            UIChannelManager({ channelType, onUpdate });
                            if (onUpdate) onUpdate();
                        } catch (e) {
                            console.error('[ChannelManager] Error saving channel:', e);
                            alert('Failed to save channel: ' + (e.responseJSON?.error || e.message));
                        }
                    }
                });
            });
            
            // Connect saved channel
            $win.find('.connect-channel-btn').on('click', async function() {
                const channelId = $(this).closest('.saved-channel-row').data('channel-id');
                const $btn = $(this);
                $btn.text('Connecting...').prop('disabled', true);
                
                try {
                    await $.ajax({
                        url: `/api/gateway/saved-channels/${channelId}/connect`,
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${window.auth_token}` }
                    });
                    
                    // Refresh
                    closeWindow();
                    UIChannelManager({ channelType, onUpdate });
                    if (onUpdate) onUpdate();
                } catch (e) {
                    console.error('[ChannelManager] Error connecting channel:', e);
                    $btn.text('Connect').prop('disabled', false);
                    alert('Failed to connect: ' + (e.responseJSON?.error || e.message));
                }
            });
            
            // Disconnect
            $win.find('.disconnect-channel-btn').on('click', async function() {
                const channelId = $(this).closest('.saved-channel-row').data('channel-id');
                const saved = savedChannels.find(c => c.id === channelId);
                
                if (saved) {
                    try {
                        await $.ajax({
                            url: `/api/gateway/channels/${saved.type}/disconnect`,
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${window.auth_token}` }
                        });
                        
                        closeWindow();
                        UIChannelManager({ channelType, onUpdate });
                        if (onUpdate) onUpdate();
                    } catch (e) {
                        console.error('[ChannelManager] Error disconnecting:', e);
                    }
                }
            });
            
            // Delete
            $win.find('.delete-channel-btn').on('click', async function() {
                const channelId = $(this).closest('.saved-channel-row').data('channel-id');
                
                if (!confirm('Delete this channel? This cannot be undone.')) return;
                
                try {
                    await $.ajax({
                        url: `/api/gateway/saved-channels/${channelId}`,
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${window.auth_token}` }
                    });
                    
                    closeWindow();
                    UIChannelManager({ channelType, onUpdate });
                    if (onUpdate) onUpdate();
                } catch (e) {
                    console.error('[ChannelManager] Error deleting channel:', e);
                }
            });
        }
    });
    
    return el_window;
};

export default UIChannelManager;
