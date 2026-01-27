/**
 * Agent Selector Popup
 * 
 * Shows a popup to select an AI agent for the current session.
 * When an agent is selected, the AI Chat uses that agent's config.
 */

import UIPopover from './UIPopover.js';

async function UIAgentSelector(options = {}) {
    const { snapToElement, onSelect } = options;
    
    // Fetch available agents
    let agents = [];
    try {
        const response = await $.ajax({
            url: '/api/gateway/agents',
            method: 'GET',
            headers: { 'Authorization': `Bearer ${window.auth_token}` }
        });
        if (response.success && response.data) {
            agents = response.data.filter(a => a.enabled);
        }
    } catch (e) {
        console.warn('[AgentSelector] Could not fetch agents:', e);
    }
    
    // Build agent list HTML
    const currentAgentId = window.selectedAgentId || null;
    
    // Default robot icon SVG for agents without images
    const defaultAgentIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="11"/><circle cx="8" cy="16" r="1" fill="#6b7280"/><circle cx="16" cy="16" r="1" fill="#6b7280"/></svg>';
    const defaultAssistantIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>';
    
    // Helper to render agent image or fallback icon
    const renderAgentIcon = (imageUrl, isDefault = false) => {
        if (imageUrl) {
            return `<div style="width: 32px; height: 32px; background: url('${imageUrl}') center/cover; border-radius: 8px;"></div>`;
        }
        return `<div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: #f3f4f6; border-radius: 8px;">${isDefault ? defaultAssistantIcon : defaultAgentIcon}</div>`;
    };
    
    let contentHtml = `
        <div class="agent-selector" style="padding: 12px; min-width: 220px;">
            <div style="font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb;">
                Select Agent
            </div>
            
            <!-- No Agent Option -->
            <div class="agent-option ${!currentAgentId ? 'selected' : ''}" data-agent-id="" 
                style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: background 0.15s; ${!currentAgentId ? 'background: #eff6ff; border: 1px solid #3b82f6;' : 'border: 1px solid transparent;'}">
                ${renderAgentIcon(null, true)}
                <div style="flex: 1;">
                    <div style="font-size: 13px; font-weight: 500; color: #374151;">Default Assistant</div>
                    <div style="font-size: 10px; color: #888;">No specific agent</div>
                </div>
            </div>
            
            ${agents.length > 0 ? `
                <div style="height: 1px; background: #e5e7eb; margin: 8px 0;"></div>
                
                ${agents.map(agent => {
                    const isSelected = currentAgentId === agent.id;
                    const imageUrl = agent.identity?.imageUrl || '';
                    const displayName = agent.identity?.displayName || agent.name;
                    const desc = agent.description || 'Custom agent';
                    
                    return `
                        <div class="agent-option ${isSelected ? 'selected' : ''}" data-agent-id="${agent.id}" data-image-url="${imageUrl}"
                            style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: background 0.15s; margin-top: 4px; ${isSelected ? 'background: #eff6ff; border: 1px solid #3b82f6;' : 'border: 1px solid transparent;'}">
                            <div class="agent-icon-container" style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: #f3f4f6; border-radius: 8px;">${defaultAgentIcon}</div>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-size: 13px; font-weight: 500; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${displayName}</div>
                                <div style="font-size: 10px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${desc}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            ` : `
                <div style="padding: 16px; text-align: center; color: #888; font-size: 12px;">
                    No agents configured.<br>
                    <a href="#" class="open-settings" style="color: #3b82f6; text-decoration: none;">Create one in Settings</a>
                </div>
            `}
        </div>
    `;
    
    // Create popover
    const popover = UIPopover({
        content: contentHtml,
        snapToElement: snapToElement,
        parent_element: snapToElement,
        width: 280,
        class: 'agent-selector-popover',
        center_horizontally: true,
    });
    
    // Load agent images with signed URLs
    $(popover).find('.agent-option[data-image-url]').each(async function() {
        const $option = $(this);
        const imageUrl = $option.data('image-url');
        if (imageUrl && typeof puter !== 'undefined' && puter.fs && puter.fs.sign) {
            try {
                const signedUrl = await puter.fs.sign(imageUrl, { expiry: 3600 });
                if (signedUrl) {
                    $option.find('.agent-icon-container').css({
                        'background': `url('${signedUrl}') center/cover`,
                        'background-size': 'cover'
                    }).html('');
                }
            } catch (err) {
                console.warn('[AgentSelector] Could not sign image URL:', imageUrl, err);
            }
        }
    });
    
    // Handle agent selection
    $(popover).on('click', '.agent-option', function() {
        const agentId = $(this).data('agent-id') || null;
        
        // Update global selected agent
        window.selectedAgentId = agentId;
        
        // Update visual selection
        $(popover).find('.agent-option').removeClass('selected').css({
            'background': 'transparent',
            'border': '1px solid transparent'
        });
        $(this).addClass('selected').css({
            'background': '#eff6ff',
            'border': '1px solid #3b82f6'
        });
        
        // Notify AI Chat if open
        if (window.updateAIChatAgent) {
            window.updateAIChatAgent(agentId);
        }
        
        // Callback
        const selectedAgent = agents.find(a => a.id === agentId);
        if (onSelect) {
            onSelect(agentId, selectedAgent);
        }
        
        // Close popover
        setTimeout(() => {
            $(popover).fadeOut(150, function() {
                $(this).remove();
            });
        }, 100);
    });
    
    // Handle hover
    $(popover).on('mouseenter', '.agent-option', function() {
        if (!$(this).hasClass('selected')) {
            $(this).css('background', '#f9fafb');
        }
    }).on('mouseleave', '.agent-option', function() {
        if (!$(this).hasClass('selected')) {
            $(this).css('background', 'transparent');
        }
    });
    
    // Handle settings link
    $(popover).on('click', '.open-settings', function(e) {
        e.preventDefault();
        $(popover).remove();
        // Open settings to AI tab
        if (window.UIWindowSettings) {
            window.UIWindowSettings({ active_tab: 'ai' });
        }
    });
    
    return popover;
}

export default UIAgentSelector;
