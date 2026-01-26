/**
 * Telegram Settings Modal
 * 
 * Configures Telegram bot settings including:
 * - AI Model selection
 * - Agent personality (SOUL.md, AGENTS.md based)
 * - Access control
 * - Rate limits
 */

import UIWindow from '../UIWindow.js';

const UITelegramSettings = async function(options = {}) {
    const channelService = window.services?.channel;
    
    // Fetch current channel config
    let currentConfig = {};
    try {
        const status = await channelService?.getChannelStatus?.('telegram');
        currentConfig = status?.data?.config || {};
    } catch (e) {
        console.warn('[TelegramSettings] Could not fetch config:', e);
    }
    
    // Get available AI models
    let availableModels = [];
    try {
        const aiConfig = await $.ajax({
            url: '/api/ai/config',
            method: 'GET',
            headers: { 'Authorization': `Bearer ${window.auth_token}` }
        });
        if (aiConfig.providers) {
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
        // Default models if API fails
        availableModels = [
            { id: 'ollama:llama3.2', name: 'Llama 3.2 (Local)', provider: 'ollama' },
            { id: 'openai:gpt-4', name: 'GPT-4 (OpenAI)', provider: 'openai' },
            { id: 'anthropic:claude-3', name: 'Claude 3 (Anthropic)', provider: 'anthropic' }
        ];
    }
    
    // Personality presets based on SOUL.md concept
    const personalityPresets = [
        {
            id: 'professional',
            name: 'Professional Assistant',
            description: 'Formal, concise, business-focused',
            soul: 'You are a professional assistant. Be formal, concise, and focused on productivity. Avoid casual language.'
        },
        {
            id: 'friendly',
            name: 'Friendly Helper',
            description: 'Warm, conversational, approachable',
            soul: 'You are a friendly and approachable assistant. Be warm and conversational while still being helpful.'
        },
        {
            id: 'technical',
            name: 'Technical Expert',
            description: 'Detailed, precise, developer-focused',
            soul: 'You are a technical expert. Provide detailed, precise answers. Use code examples when helpful. Assume technical competence.'
        },
        {
            id: 'support',
            name: 'Support Agent',
            description: 'Patient, thorough, customer-service oriented',
            soul: 'You are a patient support agent. Be thorough and empathetic. Guide users step-by-step. Confirm understanding before moving on.'
        },
        {
            id: 'custom',
            name: 'Custom Personality',
            description: 'Define your own SOUL.md and AGENTS.md',
            soul: ''
        }
    ];
    
    const selectedModel = currentConfig.model || 'ollama:llama3.2';
    const selectedPersonality = currentConfig.personality || 'friendly';
    const customSoul = currentConfig.customSoul || '';
    const accessMode = currentConfig.accessMode || 'public';
    const rateLimit = currentConfig.rateLimit || { messagesPerMinute: 10, messagesPerHour: 100 };
    
    const modelOptions = availableModels.map(m => 
        `<option value="${m.id}" ${m.id === selectedModel ? 'selected' : ''}>${m.name}</option>`
    ).join('');
    
    const personalityOptions = personalityPresets.map(p => 
        `<option value="${p.id}" ${p.id === selectedPersonality ? 'selected' : ''}>${p.name}</option>`
    ).join('');

    const h = `
        <div class="telegram-settings-modal" style="padding: 20px; max-width: 500px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="#0088cc">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
                <h2 style="margin: 10px 0 5px 0; font-size: 18px;">Telegram Bot Settings</h2>
                <p style="color: #888; font-size: 13px; margin: 0;">Configure how your AI responds on Telegram</p>
            </div>
            
            <!-- AI Model Selection -->
            <div style="margin-bottom: 20px;">
                <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 14px;">
                    AI Model
                </label>
                <select id="telegram-model-select" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px;">
                    ${modelOptions}
                </select>
                <p style="color: #888; font-size: 12px; margin-top: 4px;">
                    Which AI model should power your Telegram bot
                </p>
            </div>
            
            <!-- Personality / SOUL -->
            <div style="margin-bottom: 20px;">
                <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 14px;">
                    Personality
                </label>
                <select id="telegram-personality-select" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px;">
                    ${personalityOptions}
                </select>
                <p id="personality-description" style="color: #888; font-size: 12px; margin-top: 4px;">
                    ${personalityPresets.find(p => p.id === selectedPersonality)?.description || ''}
                </p>
            </div>
            
            <!-- Custom Soul (shown when Custom is selected) -->
            <div id="custom-soul-section" style="margin-bottom: 20px; display: ${selectedPersonality === 'custom' ? 'block' : 'none'};">
                <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 14px;">
                    Custom SOUL.md
                </label>
                <textarea id="telegram-custom-soul" 
                    style="width: 100%; height: 120px; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 13px; font-family: monospace; resize: vertical;"
                    placeholder="Define your bot's core personality and values...

Example:
You are a PC2 support specialist. Be helpful and patient.
Always ask clarifying questions before providing solutions.
Focus on decentralization and user sovereignty.">${customSoul}</textarea>
                <p style="color: #888; font-size: 12px; margin-top: 4px;">
                    This becomes the core identity for your bot (like SOUL.md in Clawdbot)
                </p>
            </div>
            
            <!-- Access Control -->
            <div style="margin-bottom: 20px;">
                <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 14px;">
                    Access Control
                </label>
                <div style="display: flex; gap: 10px;">
                    <label style="flex: 1; padding: 12px; border: 2px solid ${accessMode === 'public' ? '#0088cc' : '#ddd'}; border-radius: 8px; cursor: pointer; text-align: center;">
                        <input type="radio" name="access-mode" value="public" ${accessMode === 'public' ? 'checked' : ''} style="display: none;">
                        <div style="font-weight: 600; margin-bottom: 4px;">Public</div>
                        <div style="font-size: 12px; color: #888;">Anyone can message</div>
                    </label>
                    <label style="flex: 1; padding: 12px; border: 2px solid ${accessMode === 'private' ? '#0088cc' : '#ddd'}; border-radius: 8px; cursor: pointer; text-align: center;">
                        <input type="radio" name="access-mode" value="private" ${accessMode === 'private' ? 'checked' : ''} style="display: none;">
                        <div style="font-weight: 600; margin-bottom: 4px;">Private</div>
                        <div style="font-size: 12px; color: #888;">Approved users only</div>
                    </label>
                </div>
            </div>
            
            <!-- Rate Limits -->
            <div style="margin-bottom: 20px;">
                <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 14px;">
                    Rate Limits
                </label>
                <div style="display: flex; gap: 15px;">
                    <div style="flex: 1;">
                        <label style="font-size: 12px; color: #666;">Per Minute</label>
                        <input type="number" id="rate-limit-minute" value="${rateLimit.messagesPerMinute}" min="1" max="60"
                            style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 6px; margin-top: 4px;">
                    </div>
                    <div style="flex: 1;">
                        <label style="font-size: 12px; color: #666;">Per Hour</label>
                        <input type="number" id="rate-limit-hour" value="${rateLimit.messagesPerHour}" min="1" max="1000"
                            style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 6px; margin-top: 4px;">
                    </div>
                </div>
                <p style="color: #888; font-size: 12px; margin-top: 4px;">
                    Limit messages to prevent abuse (per user)
                </p>
            </div>
            
            <!-- Knowledge Base Link -->
            <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#666">
                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                    </svg>
                    <span style="font-weight: 600; font-size: 14px;">Advanced: Knowledge Base</span>
                </div>
                <p style="color: #666; font-size: 13px; margin: 0 0 10px 0;">
                    For deeper customization, add files to your agent's workspace:
                </p>
                <ul style="margin: 0; padding-left: 20px; color: #666; font-size: 12px;">
                    <li><strong>AGENTS.md</strong> - Behavior rules & response style</li>
                    <li><strong>SOUL.md</strong> - Core personality & values</li>
                    <li><strong>docs/</strong> - Knowledge files the bot can read</li>
                </ul>
                <button id="open-workspace-btn" class="button" style="margin-top: 10px; padding: 6px 12px; font-size: 12px;">
                    Open Workspace Folder
                </button>
            </div>
            
            <!-- Action Buttons -->
            <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee;">
                <button class="button cancel-btn" style="padding: 10px 20px;">Cancel</button>
                <button class="button save-btn" style="padding: 10px 20px; background: #0088cc; color: white;">Save Settings</button>
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
        width: 500,
        dominant: true,
        onAppend: function(el_window) {
            const $win = $(el_window);
            
            // Personality selector
            $win.find('#telegram-personality-select').on('change', function() {
                const selectedId = $(this).val();
                const preset = personalityPresets.find(p => p.id === selectedId);
                $win.find('#personality-description').text(preset?.description || '');
                
                if (selectedId === 'custom') {
                    $win.find('#custom-soul-section').slideDown();
                } else {
                    $win.find('#custom-soul-section').slideUp();
                }
            });
            
            // Access control radio styling
            $win.find('input[name="access-mode"]').on('change', function() {
                $win.find('input[name="access-mode"]').each(function() {
                    const label = $(this).closest('label');
                    if ($(this).is(':checked')) {
                        label.css('border-color', '#0088cc');
                    } else {
                        label.css('border-color', '#ddd');
                    }
                });
            });
            
            // Open workspace
            $win.find('#open-workspace-btn').on('click', function() {
                // TODO: Open file browser to ~/pc2/agents/telegram/
                window.puter?.ui?.alert?.('Workspace folder: ~/pc2/agents/telegram/');
            });
            
            // Cancel
            $win.find('.cancel-btn').on('click', function() {
                $win.close();
            });
            
            // Save
            $win.find('.save-btn').on('click', async function() {
                const model = $win.find('#telegram-model-select').val();
                const personality = $win.find('#telegram-personality-select').val();
                const customSoul = $win.find('#telegram-custom-soul').val();
                const accessMode = $win.find('input[name="access-mode"]:checked').val();
                const rateLimitMinute = parseInt($win.find('#rate-limit-minute').val()) || 10;
                const rateLimitHour = parseInt($win.find('#rate-limit-hour').val()) || 100;
                
                // Build soul content
                let soulContent = customSoul;
                if (personality !== 'custom') {
                    const preset = personalityPresets.find(p => p.id === personality);
                    soulContent = preset?.soul || '';
                }
                
                const settings = {
                    model,
                    personality,
                    customSoul: personality === 'custom' ? customSoul : '',
                    soulContent,
                    accessMode,
                    rateLimit: {
                        messagesPerMinute: rateLimitMinute,
                        messagesPerHour: rateLimitHour
                    }
                };
                
                try {
                    // Save to backend
                    await $.ajax({
                        url: '/api/gateway/channels/telegram/settings',
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${window.auth_token}` },
                        contentType: 'application/json',
                        data: JSON.stringify(settings)
                    });
                    
                    $win.close();
                    
                    // Show success
                    if (window.puter?.ui?.alert) {
                        window.puter.ui.alert('Telegram settings saved!');
                    }
                } catch (error) {
                    console.error('[TelegramSettings] Save error:', error);
                    if (window.puter?.ui?.alert) {
                        window.puter.ui.alert('Failed to save settings. Please try again.');
                    }
                }
            });
        }
    });

    return el_window;
};

export default UITelegramSettings;
