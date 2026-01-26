/**
 * Agent Channels Modal
 * 
 * Assign messaging channels to an agent.
 * Each channel can only be assigned to one agent at a time.
 */

import UIWindow from '../UIWindow.js';

const UIAgentChannels = async function(options = {}) {
    const { agentId, agentName, onSave } = options;
    
    // Fetch current channel statuses and assignments
    let channels = [];
    let currentAssignments = {};
    
    try {
        const [statusResponse, configResponse] = await Promise.all([
            $.ajax({
                url: '/api/gateway/status',
                method: 'GET',
                headers: { 'Authorization': `Bearer ${window.auth_token}` }
            }),
            $.ajax({
                url: '/api/gateway/config',
                method: 'GET',
                headers: { 'Authorization': `Bearer ${window.auth_token}` }
            })
        ]);
        
        if (statusResponse.success) {
            const channelStatuses = statusResponse.data.channels || {};
            channels = Object.entries(channelStatuses).map(([id, status]) => ({
                id,
                status,
                enabled: status === 'connected',
            }));
        }
        
        if (configResponse.success) {
            // Get channel-to-agent mappings
            const config = configResponse.data;
            Object.entries(config.channels || {}).forEach(([channelId, channelConfig]) => {
                if (channelConfig.agentId) {
                    currentAssignments[channelId] = channelConfig.agentId;
                }
            });
        }
    } catch (e) {
        console.warn('[AgentChannels] Could not fetch data:', e);
        channels = [
            { id: 'telegram', status: 'disconnected', enabled: false },
            { id: 'whatsapp', status: 'disconnected', enabled: false },
            { id: 'discord', status: 'disconnected', enabled: false },
        ];
    }
    
    const channelIcons = {
        telegram: { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="#0088cc"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`, color: '#0088cc', name: 'Telegram' },
        whatsapp: { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>`, color: '#25D366', name: 'WhatsApp' },
        discord: { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z"/></svg>`, color: '#5865F2', name: 'Discord' },
        signal: { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="#3A76F0"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0z"/></svg>`, color: '#3A76F0', name: 'Signal' },
    };
    
    const channelRows = channels
        .filter(ch => ['telegram', 'whatsapp', 'discord'].includes(ch.id))
        .map(ch => {
            const info = channelIcons[ch.id] || { icon: '', color: '#999', name: ch.id };
            const isAssigned = currentAssignments[ch.id] === agentId;
            const assignedToOther = currentAssignments[ch.id] && currentAssignments[ch.id] !== agentId;
            const isConnected = ch.status === 'connected';
            const isDisabled = !isConnected || (ch.id !== 'telegram'); // Only Telegram enabled for now
            
            return `
                <label class="channel-assign-row" style="display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; cursor: ${isDisabled ? 'not-allowed' : 'pointer'}; opacity: ${isDisabled ? '0.5' : '1'};">
                    <input type="checkbox" class="channel-checkbox" data-channel="${ch.id}" 
                        ${isAssigned ? 'checked' : ''} 
                        ${isDisabled ? 'disabled' : ''}>
                    <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                        ${info.icon}
                        <div>
                            <div style="font-weight: 600; font-size: 13px;">${info.name}</div>
                            <div style="font-size: 10px; color: ${isConnected ? '#10b981' : '#999'};">
                                ${isConnected ? 'Connected' : 'Not connected'}
                                ${assignedToOther ? ' (assigned to another agent)' : ''}
                                ${!isConnected && ch.id !== 'telegram' ? ' - Coming soon' : ''}
                            </div>
                        </div>
                    </div>
                </label>
            `;
        }).join('');

    const h = `
        <div class="agent-channels-modal" style="padding: 20px; width: 400px;">
            <h2 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">
                Assign Channels
            </h2>
            <p style="color: #666; font-size: 13px; margin: 0 0 20px 0;">
                Select which channels should route to <strong>${agentName}</strong>
            </p>
            
            <div id="channels-assignment-list">
                ${channelRows}
            </div>
            
            <p style="font-size: 11px; color: #888; margin: 16px 0 0 0;">
                Messages from selected channels will be handled by this agent.
            </p>
            
            <!-- Actions -->
            <div style="display: flex; gap: 10px; justify-content: flex-end; padding-top: 15px; margin-top: 15px; border-top: 1px solid #eee;">
                <button class="button cancel-btn" style="padding: 10px 20px;">Cancel</button>
                <button class="button save-btn" style="padding: 10px 20px; background: #0088cc; color: white;">Save</button>
            </div>
        </div>
    `;

    const el_window = await UIWindow({
        title: null,
        icon: null,
        uid: null,
        is_dir: false,
        body_content: h,
        has_head: false,
        selectable_body: false,
        draggable_body: true,
        allow_context_menu: false,
        is_resizable: false,
        is_droppable: false,
        init_center: true,
        allow_native_ctxmenu: true,
        allow_user_select: true,
        backdrop: true,
        width: 440,
        dominant: true,
        onAppend: function(el_window) {
            const $win = $(el_window);
            
            // Cancel
            $win.find('.cancel-btn').on('click', function() {
                $win.close();
            });
            
            // Save
            $win.find('.save-btn').on('click', async function() {
                const selectedChannels = [];
                $win.find('.channel-checkbox:checked').each(function() {
                    selectedChannels.push($(this).data('channel'));
                });
                
                try {
                    // Update channel-agent assignments
                    for (const channel of selectedChannels) {
                        await $.ajax({
                            url: `/api/gateway/channels/${channel}`,
                            method: 'PUT',
                            headers: { 'Authorization': `Bearer ${window.auth_token}` },
                            contentType: 'application/json',
                            data: JSON.stringify({ agentId })
                        });
                    }
                    
                    $win.close();
                    
                    if (onSave) {
                        onSave(selectedChannels);
                    }
                } catch (error) {
                    console.error('[AgentChannels] Save error:', error);
                    alert('Failed to save channel assignments. Please try again.');
                }
            });
        }
    });

    return el_window;
};

export default UIAgentChannels;
