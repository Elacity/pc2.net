/**
 * Agent Editor Modal
 * 
 * Create or edit an AI agent with:
 * - Name and avatar
 * - AI Model selection
 * - Personality (SOUL.md based)
 * - Permissions
 */

import UIWindow from '../UIWindow.js';

const UIAgentEditor = async function(options = {}) {
    const { agentId, onSave } = options;
    const isNew = !agentId;
    
    // Fetch existing agent if editing
    let agent = {
        id: '',
        name: '',
        model: 'ollama:llama3.2',
        personality: 'friendly',
        customSoul: '',
        permissions: {
            fileRead: true,
            fileWrite: false,
            walletAccess: true,
            webBrowsing: false,
            codeExecution: false,
        }
    };
    
    if (agentId) {
        try {
            const response = await $.ajax({
                url: `/api/gateway/agents/${agentId}`,
                method: 'GET',
                headers: { 'Authorization': `Bearer ${window.auth_token}` }
            });
            if (response.success && response.data) {
                agent = { ...agent, ...response.data };
            }
        } catch (e) {
            console.warn('[AgentEditor] Could not fetch agent:', e);
        }
    }
    
    // Get available AI models
    let availableModels = [
        { id: 'ollama:llama3.2', name: 'Llama 3.2 (Local)', provider: 'ollama' },
    ];
    try {
        const aiConfig = await $.ajax({
            url: '/api/ai/config',
            method: 'GET',
            headers: { 'Authorization': `Bearer ${window.auth_token}` }
        });
        if (aiConfig.providers) {
            availableModels = [];
            Object.entries(aiConfig.providers).forEach(([provider, config]) => {
                if (config.enabled && config.models) {
                    config.models.forEach(model => {
                        availableModels.push({
                            id: `${provider}:${model}`,
                            name: `${model} (${provider})`,
                            provider
                        });
                    });
                }
            });
        }
    } catch (e) {
        // Use defaults
    }
    
    // Personality presets
    const personalityPresets = [
        { id: 'professional', name: 'Professional', description: 'Formal, concise, business-focused', color: '#3b82f6' },
        { id: 'friendly', name: 'Friendly', description: 'Warm, conversational, approachable', color: '#10b981' },
        { id: 'technical', name: 'Technical', description: 'Detailed, precise, developer-focused', color: '#8b5cf6' },
        { id: 'support', name: 'Support', description: 'Patient, thorough, customer-service', color: '#f59e0b' },
        { id: 'custom', name: 'Custom', description: 'Define your own personality', color: '#6b7280' },
    ];
    
    const modelOptions = availableModels.map(m => 
        `<option value="${m.id}" ${m.id === agent.model ? 'selected' : ''}>${m.name}</option>`
    ).join('');
    
    const personalityCards = personalityPresets.map(p => `
        <div class="personality-card ${agent.personality === p.id ? 'selected' : ''}" data-personality="${p.id}" 
            style="flex: 1; min-width: 80px; padding: 10px; border: 2px solid ${agent.personality === p.id ? p.color : '#e5e7eb'}; border-radius: 8px; cursor: pointer; text-align: center; transition: all 0.2s;">
            <div style="width: 24px; height: 24px; border-radius: 50%; background: ${p.color}; margin: 0 auto 6px;"></div>
            <div style="font-weight: 600; font-size: 11px;">${p.name}</div>
            <div style="font-size: 9px; color: #888; margin-top: 2px;">${p.description}</div>
        </div>
    `).join('');

    const h = `
        <div class="agent-editor-modal" style="padding: 20px; width: 480px;">
            <h2 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">
                ${isNew ? 'Create New Agent' : 'Edit Agent'}
            </h2>
            
            <!-- Name -->
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px;">Agent Name</label>
                <input type="text" id="agent-name" value="${agent.name}" placeholder="e.g., Support Bot, Trading Assistant"
                    style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
            </div>
            
            <!-- Model -->
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px;">AI Model</label>
                <select id="agent-model" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                    ${modelOptions}
                </select>
            </div>
            
            <!-- Personality -->
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px;">Personality</label>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    ${personalityCards}
                </div>
            </div>
            
            <!-- Custom Soul -->
            <div id="custom-soul-section" style="margin-bottom: 16px; display: ${agent.personality === 'custom' ? 'block' : 'none'};">
                <label style="display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px;">Custom Personality (SOUL.md)</label>
                <textarea id="agent-custom-soul" 
                    style="width: 100%; height: 100px; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 12px; font-family: monospace; resize: vertical;"
                    placeholder="Define your agent's core personality and values...

Example:
You are a crypto trading assistant. Be analytical and data-driven.
Always cite sources for market data. Warn about risks.">${agent.customSoul || ''}</textarea>
            </div>
            
            <!-- Permissions -->
            <div style="margin-bottom: 20px;">
                <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px;">Permissions</label>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 12px;">
                    <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
                        <input type="checkbox" id="perm-file-read" ${agent.permissions?.fileRead ? 'checked' : ''}>
                        <span style="font-size: 12px;">Read files from storage</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
                        <input type="checkbox" id="perm-file-write" ${agent.permissions?.fileWrite ? 'checked' : ''}>
                        <span style="font-size: 12px;">Write files to storage</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
                        <input type="checkbox" id="perm-wallet" ${agent.permissions?.walletAccess ? 'checked' : ''}>
                        <span style="font-size: 12px;">View wallet balances (read-only)</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; opacity: 0.5;">
                        <input type="checkbox" disabled>
                        <span style="font-size: 12px;">Execute transactions (coming soon)</span>
                    </label>
                </div>
            </div>
            
            <!-- Actions -->
            <div style="display: flex; gap: 10px; justify-content: flex-end; padding-top: 15px; border-top: 1px solid #eee;">
                <button class="button cancel-btn" style="padding: 8px 16px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 13px;">Cancel</button>
                <button class="button save-btn" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                    ${isNew ? 'Create Agent' : 'Save Changes'}
                </button>
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
        width: 520,
        dominant: true,
        onAppend: function(el_window) {
            const $win = $(el_window);
            let selectedPersonality = agent.personality || 'friendly';
            
            // Personality selection
            $win.find('.personality-card').on('click', function() {
                const personality = $(this).data('personality');
                selectedPersonality = personality;
                
                // Update visual selection
                $win.find('.personality-card').each(function() {
                    const p = $(this).data('personality');
                    const preset = personalityPresets.find(pr => pr.id === p);
                    $(this).css('border-color', p === personality ? preset.color : '#e5e7eb');
                    $(this).toggleClass('selected', p === personality);
                });
                
                // Show/hide custom soul
                if (personality === 'custom') {
                    $win.find('#custom-soul-section').slideDown();
                } else {
                    $win.find('#custom-soul-section').slideUp();
                }
            });
            
            // Cancel
            $win.find('.cancel-btn').on('click', function() {
                $win.close();
            });
            
            // Save
            $win.find('.save-btn').on('click', async function() {
                const name = $win.find('#agent-name').val().trim();
                if (!name) {
                    alert('Please enter an agent name');
                    return;
                }
                
                const newAgent = {
                    id: agentId || name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                    name,
                    model: $win.find('#agent-model').val(),
                    personality: selectedPersonality,
                    customSoul: selectedPersonality === 'custom' ? $win.find('#agent-custom-soul').val() : '',
                    permissions: {
                        fileRead: $win.find('#perm-file-read').is(':checked'),
                        fileWrite: $win.find('#perm-file-write').is(':checked'),
                        walletAccess: $win.find('#perm-wallet').is(':checked'),
                        webBrowsing: false,
                        codeExecution: false,
                    }
                };
                
                try {
                    await $.ajax({
                        url: `/api/gateway/agents/${newAgent.id}`,
                        method: 'PUT',
                        headers: { 'Authorization': `Bearer ${window.auth_token}` },
                        contentType: 'application/json',
                        data: JSON.stringify(newAgent)
                    });
                    
                    $win.close();
                    
                    if (onSave) {
                        onSave(newAgent);
                    }
                } catch (error) {
                    console.error('[AgentEditor] Save error:', error);
                    alert('Failed to save agent. Please try again.');
                }
            });
        }
    });

    return el_window;
};

export default UIAgentEditor;
