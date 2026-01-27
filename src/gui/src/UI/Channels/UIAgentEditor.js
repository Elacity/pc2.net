/**
 * Agent Editor Window
 * 
 * Comprehensive agent configuration including:
 * - Name and description
 * - AI Provider and Model selection
 * - Personality (SOUL.md)
 * - Knowledge base / workspace
 * - Permissions
 * - Access control
 * - Channel connections (Telegram bot, etc.)
 */

import UIWindow from '../UIWindow.js';

const UIAgentEditor = async function(options = {}) {
    const { agentId, onSave } = options;
    const isNew = !agentId || agentId === 'new';
    
    // Default agent structure
    let agent = {
        id: '',
        name: '',
        description: '',
        model: '',
        provider: 'ollama',
        personality: 'friendly',
        customSoul: '',
        workspace: '~/pc2/agents/default',
        identity: {
            displayName: '',
            emoji: '🤖',
        },
        thinkingLevel: 'fast', // fast, balanced, deep - maps to temperature
        permissions: {
            fileRead: true,
            fileWrite: false,
            walletAccess: true,
            webBrowsing: false,
            codeExecution: false,
            reminders: false,
        },
        accessControl: {
            mode: 'public',
            rateLimit: { perMinute: 10, perDay: 100 },
        },
        tetheredChannels: [], // Array of SavedChannel IDs
    };
    
    // Fetch existing agent if editing
    if (agentId && agentId !== 'new') {
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
    
    // Fetch saved channels for dropdown
    let savedChannels = [];
    try {
        const response = await $.ajax({
            url: '/api/gateway/saved-channels',
            method: 'GET',
            headers: { 'Authorization': `Bearer ${window.auth_token}` }
        });
        if (response.success && response.data) {
            savedChannels = response.data;
        }
    } catch (e) {
        console.warn('[AgentEditor] Could not fetch saved channels:', e);
    }
    
    // Fetch available AI providers and models
    let providers = {};
    try {
        const aiConfig = await $.ajax({
            url: '/api/ai/config',
            method: 'GET',
            headers: { 'Authorization': `Bearer ${window.auth_token}` }
        });
        if (aiConfig.providers) {
            providers = aiConfig.providers;
        }
    } catch (e) {
        // Default to Ollama
        providers = { ollama: { enabled: true, models: ['llama3.2'] } };
    }
    
    // Build provider options
    const providerOptions = Object.entries(providers)
        .filter(([_, config]) => config.enabled)
        .map(([id, config]) => `<option value="${id}" ${agent.provider === id ? 'selected' : ''}>${id.charAt(0).toUpperCase() + id.slice(1)}</option>`)
        .join('');
    
    // Build initial model options
    const initialModels = providers[agent.provider]?.models || ['default'];
    const modelOptions = initialModels.map(m => 
        `<option value="${m}" ${agent.model === m || (!agent.model && m === initialModels[0]) ? 'selected' : ''}>${m}</option>`
    ).join('');
    
    // Personality presets (Custom SOUL.md is always available as an extension, not a personality option)
    const personalities = [
        { id: 'professional', name: 'Professional', desc: 'Formal & business-focused', color: '#3b82f6', 
          soul: 'You are a professional assistant. Be formal, concise, and focused on productivity.' },
        { id: 'friendly', name: 'Friendly', desc: 'Warm & conversational', color: '#10b981',
          soul: 'You are a friendly and approachable assistant. Be warm and conversational while being helpful.' },
        { id: 'technical', name: 'Technical', desc: 'Precise & developer-focused', color: '#8b5cf6',
          soul: 'You are a technical expert. Provide detailed, precise answers with code examples when helpful.' },
        { id: 'support', name: 'Support', desc: 'Patient & thorough', color: '#f59e0b',
          soul: 'You are a patient support agent. Guide users step-by-step and confirm understanding.' },
    ];

    const h = `
        <div class="agent-editor" style="display: flex; flex-direction: column; height: 100%; background: #fff;">
            <!-- Header -->
            <div style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background: #f9fafb;">
                <h2 style="margin: 0; font-size: 18px; font-weight: 600;">
                    ${isNew ? 'Create New Agent' : 'Edit Agent'}
                </h2>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #666;">
                    Configure your AI agent's personality, capabilities, and channel connections
                </p>
            </div>
            
            <!-- Scrollable Content -->
            <div class="agent-editor-content" style="flex: 1; overflow-y: auto; padding: 20px;">
                
                <!-- Basic Info with Identity -->
                <div class="editor-section" style="margin-bottom: 24px;">
                    <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #374151;">Agent Identity</h3>
                    <div style="display: grid; gap: 12px;">
                        <!-- Emoji and Name Row -->
                        <div style="display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: end;">
                            <div>
                                <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #555;">Emoji</label>
                                <div id="emoji-picker-container" style="position: relative;">
                                    <button type="button" id="emoji-btn" style="width: 48px; height: 42px; padding: 0; border: 1px solid #d1d5db; border-radius: 6px; font-size: 24px; cursor: pointer; background: #fff; display: flex; align-items: center; justify-content: center;">${agent.identity?.emoji || '🤖'}</button>
                                    <div id="emoji-dropdown" style="display: none; position: absolute; top: 100%; left: 0; z-index: 1000; background: #fff; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); margin-top: 4px;">
                                        <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px;">
                                            ${['🤖', '💬', '🧠', '💡', '🔧', '💼', '🎯', '📊', '🚀', '⭐', '🔮', '🎨', '📚', '🛡️', '🌟', '🦾', '👾', '🤝'].map(e => 
                                                `<button type="button" class="emoji-option" data-emoji="${e}" style="width: 32px; height: 32px; padding: 0; border: none; background: none; font-size: 20px; cursor: pointer; border-radius: 4px; transition: background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">${e}</button>`
                                            ).join('')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #555;">Agent Name *</label>
                                <input type="text" id="agent-name" value="${agent.name}" placeholder="e.g., Support Bot, Trading Assistant"
                                    style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                            </div>
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #555;">Description</label>
                            <input type="text" id="agent-description" value="${agent.description || ''}" placeholder="What does this agent do?"
                                style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                        </div>
                    </div>
                </div>
                
                <!-- AI Model -->
                <div class="editor-section" style="margin-bottom: 24px;">
                    <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #374151;">AI Model</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #555;">Provider</label>
                            <select id="agent-provider" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                ${providerOptions}
                            </select>
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #555;">Model</label>
                            <select id="agent-model" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                ${modelOptions}
                            </select>
                        </div>
                    </div>
                    <p style="margin: 8px 0 0 0; font-size: 11px; color: #888;">
                        Add API keys in Settings > AI Assistant to enable more providers
                    </p>
                </div>
                
                <!-- Response Mode (Thinking Level) -->
                <div class="editor-section" style="margin-bottom: 24px;">
                    <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #374151;">Response Mode</h3>
                    <p style="margin: 0 0 12px 0; font-size: 12px; color: #666;">Controls how the AI responds - Fast is cheaper, Deep is more thorough</p>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;" id="thinking-level-grid">
                        ${['fast', 'balanced', 'deep'].map(level => {
                            const isSelected = (agent.thinkingLevel || 'fast') === level;
                            const config = {
                                fast: { name: 'Fast', desc: 'Quick & efficient', icon: '⚡', color: '#10b981' },
                                balanced: { name: 'Balanced', desc: 'Default reasoning', icon: '⚖️', color: '#3b82f6' },
                                deep: { name: 'Deep', desc: 'Thorough analysis', icon: '🧠', color: '#8b5cf6' },
                            }[level];
                            return `
                            <div class="thinking-option ${isSelected ? 'selected' : ''}" data-level="${level}"
                                style="padding: 12px 8px; border: 2px solid ${isSelected ? config.color : '#e5e7eb'}; border-radius: 8px; cursor: pointer; text-align: center; transition: all 0.15s; background: ${isSelected ? config.color + '10' : '#fff'};">
                                <div style="font-size: 20px; margin-bottom: 4px;">${config.icon}</div>
                                <div style="font-weight: 600; font-size: 12px; color: #374151;">${config.name}</div>
                                <div style="font-size: 10px; color: #888; margin-top: 2px;">${config.desc}</div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>
                
                <!-- Personality -->
                <div class="editor-section" style="margin-bottom: 24px;">
                    <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #374151;">Personality</h3>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;" id="personality-grid">
                        ${(() => {
                            // Handle legacy 'custom' personality - default to 'friendly'
                            const effectivePersonality = agent.personality === 'custom' ? 'friendly' : (agent.personality || 'friendly');
                            return personalities.map(p => {
                                const isSelected = effectivePersonality === p.id;
                                return `
                                <div class="personality-option ${isSelected ? 'selected' : ''}" data-id="${p.id}" data-soul="${encodeURIComponent(p.soul)}"
                                    style="padding: 12px 8px; border: 2px solid ${isSelected ? p.color : '#e5e7eb'}; border-radius: 8px; cursor: pointer; text-align: center; transition: all 0.15s;">
                                    <div style="width: 20px; height: 20px; border-radius: 50%; background: ${p.color}; margin: 0 auto 6px;"></div>
                                    <div style="font-weight: 600; font-size: 11px; color: #374151;">${p.name}</div>
                                    <div style="font-size: 9px; color: #888; margin-top: 2px;">${p.desc}</div>
                                </div>`;
                            }).join('');
                        })()}
                    </div>
                    
                    <!-- Custom SOUL.md - Always visible as an extension to any personality -->
                    <div id="custom-soul-section" style="margin-top: 16px;">
                        <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 2px; color: #555;">Custom SOUL.md</label>
                        <p style="margin: 0 0 8px 0; font-size: 11px; color: #888;">Additional context and instructions that extend the selected personality</p>
                        <textarea id="agent-soul" placeholder="Add custom instructions, domain knowledge, or behavioral guidelines...

Example:
# SOUL.md - PC2 Personal Cloud Assistant

## Identity
You are **PC2 Guide**, a knowledgeable assistant for PC2 (Personal Cloud Computer).

## Core Purpose
- Educate users about PC2 and data sovereignty
- Guide them through setup and features
- Provide technical support"
                            style="width: 100%; height: 140px; padding: 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; font-family: monospace; resize: vertical; box-sizing: border-box;">${agent.customSoul || ''}</textarea>
                    </div>
                </div>
                
                <!-- Permissions -->
                <div class="editor-section" style="margin-bottom: 24px;">
                    <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #374151;">Permissions</h3>
                    <div style="background: #f9fafb; border-radius: 8px; padding: 12px; display: grid; gap: 8px;">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" id="perm-file-read" ${agent.permissions?.fileRead ? 'checked' : ''} style="width: 16px; height: 16px;">
                            <div>
                                <div style="font-size: 13px; font-weight: 500;">Read Files</div>
                                <div style="font-size: 10px; color: #888;">Access workspace documents and knowledge base</div>
                            </div>
                        </label>
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" id="perm-file-write" ${agent.permissions?.fileWrite ? 'checked' : ''} style="width: 16px; height: 16px;">
                            <div>
                                <div style="font-size: 13px; font-weight: 500;">Write Files</div>
                                <div style="font-size: 10px; color: #888;">Create and modify files in workspace</div>
                            </div>
                        </label>
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" id="perm-wallet" ${agent.permissions?.walletAccess ? 'checked' : ''} style="width: 16px; height: 16px;">
                            <div>
                                <div style="font-size: 13px; font-weight: 500;">View Wallet</div>
                                <div style="font-size: 10px; color: #888;">Check balances and prices (read-only)</div>
                            </div>
                        </label>
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; opacity: 0.5;">
                            <input type="checkbox" disabled style="width: 16px; height: 16px;">
                            <div>
                                <div style="font-size: 13px; font-weight: 500;">Execute Transactions</div>
                                <div style="font-size: 10px; color: #888;">Coming soon - requires additional security</div>
                            </div>
                        </label>
                    </div>
                </div>
                
                <!-- Access Control -->
                <div class="editor-section" style="margin-bottom: 24px;">
                    <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #374151;">Access Control</h3>
                    <div style="display: grid; gap: 8px;">
                        <label style="display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer;">
                            <input type="radio" name="access-mode" value="public" ${agent.accessControl?.mode !== 'private' ? 'checked' : ''} style="margin-top: 2px;">
                            <div style="flex: 1;">
                                <div style="font-size: 13px; font-weight: 500;">Public</div>
                                <div style="font-size: 11px; color: #888;">Anyone can message this agent</div>
                                <div style="display: flex; gap: 12px; margin-top: 8px;">
                                    <div>
                                        <label style="font-size: 10px; color: #666;">Per minute</label>
                                        <input type="number" id="rate-per-minute" value="${agent.accessControl?.rateLimit?.perMinute || 10}" min="1" max="60"
                                            style="width: 60px; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px;">
                                    </div>
                                    <div>
                                        <label style="font-size: 10px; color: #666;">Per day</label>
                                        <input type="number" id="rate-per-day" value="${agent.accessControl?.rateLimit?.perDay || 100}" min="1" max="10000"
                                            style="width: 70px; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px;">
                                    </div>
                                </div>
                            </div>
                        </label>
                        <label style="display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer;">
                            <input type="radio" name="access-mode" value="private" ${agent.accessControl?.mode === 'private' ? 'checked' : ''} style="margin-top: 2px;">
                            <div>
                                <div style="font-size: 13px; font-weight: 500;">Private</div>
                                <div style="font-size: 11px; color: #888;">Only approved users can message</div>
                            </div>
                        </label>
                    </div>
                </div>
                
                <!-- Channel Connections -->
                <div class="editor-section" style="margin-bottom: 24px;">
                    <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #374151;">Tethered Channels</h3>
                    <p style="margin: 0 0 12px 0; font-size: 12px; color: #666;">Select existing channels or add a new Telegram bot</p>
                    
                    <!-- Existing Saved Channels -->
                    ${savedChannels.length > 0 ? `
                        <div id="channel-checkboxes" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
                            ${savedChannels.map(ch => {
                                const isChecked = (agent.tetheredChannels || []).includes(ch.id);
                                const icon = ch.type === 'telegram' 
                                    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="#0088cc"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`
                                    : ch.type === 'discord'
                                    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152z"/></svg>`
                                    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382z"/></svg>`;
                                
                                // Get display name - use bot username if available
                                let displayName = ch.name;
                                if (ch.type === 'telegram' && ch.telegram?.botUsername) {
                                    displayName = `@${ch.telegram.botUsername}`;
                                } else if (ch.type === 'discord' && ch.discord?.botUsername) {
                                    displayName = `@${ch.discord.botUsername}`;
                                }
                                
                                return `
                                    <label class="channel-checkbox" data-channel-id="${ch.id}" style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid ${isChecked ? '#3b82f6' : '#e5e7eb'}; border-radius: 8px; cursor: pointer; background: ${isChecked ? '#eff6ff' : '#fff'}; transition: all 0.15s;">
                                        <input type="checkbox" class="tether-checkbox" value="${ch.id}" ${isChecked ? 'checked' : ''} style="width: 16px; height: 16px;">
                                        ${icon}
                                        <div style="flex: 1;">
                                            <div style="font-size: 13px; font-weight: 500;">${displayName}</div>
                                            <div style="font-size: 10px; color: #888; text-transform: capitalize;">${ch.type}</div>
                                        </div>
                                    </label>
                                `;
                            }).join('')}
                        </div>
                    ` : ''}
                    
                    <!-- Add New Telegram Bot -->
                    <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="#0088cc"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                            <span style="font-size: 12px; font-weight: 500;">Add New Telegram Bot</span>
                        </div>
                        <input type="text" id="new-telegram-token" placeholder="Paste bot token from @BotFather (e.g., 123456789:ABC...)"
                            style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; font-family: monospace; box-sizing: border-box;">
                        <p style="margin: 6px 0 0 0; font-size: 10px; color: #888;">
                            If provided, this bot will be saved and tethered to this agent
                        </p>
                    </div>
                </div>
                
            </div>
            
            <!-- Footer -->
            <div style="padding: 12px 20px; border-top: 1px solid #e5e7eb; background: #f9fafb; display: flex; justify-content: flex-end; gap: 10px;">
                <button class="cancel-btn" style="display: inline-flex; align-items: center; justify-content: center; padding: 10px 20px; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 13px; line-height: 1; font-family: inherit;">Cancel</button>
                <button class="save-btn" style="display: inline-flex; align-items: center; justify-content: center; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; line-height: 1; font-family: inherit;">${isNew ? 'Create Agent' : 'Save Changes'}</button>
            </div>
        </div>
    `;

    const el_window = await UIWindow({
        title: isNew ? 'Create New Agent' : `Edit: ${agent.name || 'Agent'}`,
        icon: null,
        uid: 'agent-editor-' + (agentId || 'new'),
        is_dir: false,
        body_content: h,
        has_head: true,
        selectable_body: false,
        draggable_body: false,
        allow_context_menu: false,
        is_resizable: true,
        is_droppable: false,
        init_center: true,
        allow_native_ctxmenu: true,
        allow_user_select: true,
        backdrop: false,
        width: 580,
        height: 700,
        dominant: false,
        show_in_taskbar: false,
        on_close: function() {
            // Allow close
            return true;
        },
        onAppend: function(el_window) {
            const $win = $(el_window);
            // Handle legacy 'custom' personality - default to 'friendly'
            let selectedPersonality = agent.personality === 'custom' ? 'friendly' : (agent.personality || 'friendly');
            let selectedThinkingLevel = agent.thinkingLevel || 'fast';
            let selectedEmoji = agent.identity?.emoji || '🤖';
            
            // Helper to close window
            function closeWindow() {
                if ($win.close && typeof $win.close === 'function') {
                    $win.close();
                } else {
                    // Fallback: remove backdrop or element
                    const $backdrop = $win.closest('.window-backdrop');
                    if ($backdrop.length) {
                        $backdrop.remove();
                    } else {
                        $win.remove();
                    }
                }
            }
            
            // Also bind to window close button (in case default handler doesn't work)
            $win.find('.window-close-btn').off('click').on('click', function(e) {
                e.stopPropagation();
                closeWindow();
            });
            
            // Provider change -> update models
            $win.find('#agent-provider').on('change', function() {
                const provider = $(this).val();
                const models = providers[provider]?.models || ['default'];
                const $modelSelect = $win.find('#agent-model');
                $modelSelect.empty();
                models.forEach(m => {
                    $modelSelect.append(`<option value="${m}">${m}</option>`);
                });
            });
            
            // Emoji picker toggle
            $win.find('#emoji-btn').on('click', function(e) {
                e.stopPropagation();
                const $dropdown = $win.find('#emoji-dropdown');
                $dropdown.toggle();
            });
            
            // Emoji selection
            $win.find('.emoji-option').on('click', function() {
                selectedEmoji = $(this).data('emoji');
                $win.find('#emoji-btn').text(selectedEmoji);
                $win.find('#emoji-dropdown').hide();
            });
            
            // Close emoji dropdown when clicking outside
            $(document).on('click.emojiDropdown', function() {
                $win.find('#emoji-dropdown').hide();
            });
            
            // Thinking level selection
            $win.find('.thinking-option').on('click', function() {
                const level = $(this).data('level');
                selectedThinkingLevel = level;
                
                const colors = { fast: '#10b981', balanced: '#3b82f6', deep: '#8b5cf6' };
                $win.find('.thinking-option').each(function() {
                    const thisLevel = $(this).data('level');
                    const isSelected = thisLevel === level;
                    $(this).css({
                        'border-color': isSelected ? colors[thisLevel] : '#e5e7eb',
                        'background': isSelected ? colors[thisLevel] + '10' : '#fff'
                    });
                    $(this).toggleClass('selected', isSelected);
                });
            });
            
            // Personality selection
            $win.find('.personality-option').on('click', function() {
                const id = $(this).data('id');
                selectedPersonality = id;
                
                $win.find('.personality-option').each(function() {
                    const thisId = $(this).data('id');
                    const color = personalities.find(p => p.id === thisId)?.color || '#e5e7eb';
                    $(this).css('border-color', thisId === id ? color : '#e5e7eb');
                    $(this).toggleClass('selected', thisId === id);
                });
                // Custom SOUL.md section is always visible - no need to toggle
            });
            
            // Channel checkbox styling
            $win.find('.tether-checkbox').on('change', function() {
                const $label = $(this).closest('.channel-checkbox');
                if ($(this).is(':checked')) {
                    $label.css({ border: '1px solid #3b82f6', background: '#eff6ff' });
                } else {
                    $label.css({ border: '1px solid #e5e7eb', background: '#fff' });
                }
            });
            
            // Cancel button
            $win.find('.cancel-btn').on('click', function() {
                closeWindow();
            });
            
            // Save button
            $win.find('.save-btn').on('click', async function() {
                const name = $win.find('#agent-name').val().trim();
                if (!name) {
                    alert('Please enter an agent name');
                    return;
                }
                
                // Get soul content: base personality + custom extensions
                const preset = personalities.find(p => p.id === selectedPersonality);
                const baseSoul = preset?.soul || '';
                const customSoul = $win.find('#agent-soul').val().trim();
                
                // Combine base personality with custom extensions
                let soulContent = baseSoul;
                if (customSoul) {
                    soulContent = customSoul; // Custom SOUL replaces base if provided
                }
                
                // Gather tethered channels from checkboxes
                let tetheredChannels = $win.find('.tether-checkbox:checked').map(function() {
                    return $(this).val();
                }).get();
                
                // Check if new telegram token was provided
                const newTelegramToken = $win.find('#new-telegram-token').val().trim();
                
                try {
                    // If new token, create saved channel first
                    if (newTelegramToken && /^\d+:[A-Za-z0-9_-]+$/.test(newTelegramToken)) {
                        const saveResponse = await $.ajax({
                            url: '/api/gateway/saved-channels',
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${window.auth_token}` },
                            contentType: 'application/json',
                            data: JSON.stringify({
                                type: 'telegram',
                                name: 'Telegram Bot',
                                telegram: { botToken: newTelegramToken }
                            })
                        });
                        
                        if (saveResponse.success && saveResponse.data?.id) {
                            tetheredChannels.push(saveResponse.data.id);
                        }
                    }
                    
                    const newAgent = {
                        id: agentId && agentId !== 'new' ? agentId : name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                        name,
                        description: $win.find('#agent-description').val(),
                        identity: {
                            displayName: name,
                            emoji: selectedEmoji,
                        },
                        provider: $win.find('#agent-provider').val(),
                        model: $win.find('#agent-model').val(),
                        thinkingLevel: selectedThinkingLevel,
                        personality: selectedPersonality,
                        customSoul: customSoul, // Always save custom SOUL content
                        soulContent,
                        permissions: {
                            fileRead: $win.find('#perm-file-read').is(':checked'),
                            fileWrite: $win.find('#perm-file-write').is(':checked'),
                            walletAccess: $win.find('#perm-wallet').is(':checked'),
                            webBrowsing: false,
                            codeExecution: false,
                            reminders: false,
                        },
                        accessControl: {
                            mode: $win.find('input[name="access-mode"]:checked').val(),
                            rateLimit: {
                                perMinute: parseInt($win.find('#rate-per-minute').val()) || 10,
                                perDay: parseInt($win.find('#rate-per-day').val()) || 100,
                            },
                        },
                        tetheredChannels,
                    };
                    
                    await $.ajax({
                        url: `/api/gateway/agents/${newAgent.id}`,
                        method: 'PUT',
                        headers: { 'Authorization': `Bearer ${window.auth_token}` },
                        contentType: 'application/json',
                        data: JSON.stringify(newAgent)
                    });
                    
                    closeWindow();
                    
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
