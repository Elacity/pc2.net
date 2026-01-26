/**
 * Copyright (C) 2024-present Elacity
 *
 * AI Assistant Settings Tab
 * 
 * Wallet-scoped AI configuration for personal PC2 nodes:
 * - View current AI model and provider
 * - Configure API keys for cloud providers
 * - Switch between local (Ollama) and cloud providers
 * - Test API key connections
 */

export default {
    id: 'ai',
    title_i18n_key: 'AI Assistant',
    icon: 'magnifier-outline.svg',
    html: () => {
        return `
            <style>
                .ai-section { margin-bottom: 14px; }
                .ai-section-title { font-size: 11px; font-weight: 700; color: #000; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; padding-left: 2px; }
                .ai-card { background: #f9f9f9; border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; }
                .ai-card-row { display: flex; justify-content: space-between; align-items: center; }
                .ai-card-label { font-size: 13px; font-weight: 500; color: #333; }
                .ai-card-value { font-size: 12px; color: #666; }
                .ai-select { font-size: 11px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; background: #fff; width: auto; }
                .ai-btn { font-size: 11px; padding: 4px 10px; border-radius: 4px; cursor: pointer; line-height: 1.2; height: auto; }
                .ai-group { background: #f9f9f9; border-radius: 8px; border: 1px solid #d0d0d0; overflow: hidden; }
                .ai-group-row { padding: 10px 12px; border-bottom: 1px solid #e5e5e5; }
                .ai-group-row:last-child { border-bottom: none; }
            </style>
            
            <!-- Status -->
            <div class="ai-section">
                <div class="ai-section-title">Status</div>
                <div class="ai-group">
                    <div class="ai-group-row"><div class="ai-card-row"><span class="ai-card-label">Provider</span><span id="ai-current-provider" class="ai-card-value">Loading...</span></div></div>
                    <div class="ai-group-row"><div class="ai-card-row"><span class="ai-card-label">Model</span><span id="ai-current-model" class="ai-card-value">Loading...</span></div></div>
                    <div class="ai-group-row"><div class="ai-card-row"><span class="ai-card-label">Status</span><div style="display: flex; align-items: center; gap: 6px;"><span class="ai-status-dot" id="ai-status-dot"></span><span id="ai-status-text" class="ai-card-value">Loading...</span></div></div></div>
                </div>
            </div>
            
            <!-- Local AI Setup -->
            <div id="ai-local-setup-section" class="ai-card" style="display: none; background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border: 1px solid #86efac;">
                <div style="margin-bottom: 8px;"><strong style="color: #166534; font-size: 12px;">Setup Local AI</strong><span style="font-size: 10px; color: #15803d; margin-left: 8px;">No cloud, no API keys</span></div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <select id="ai-model-select" class="ai-select" style="flex: 1; border-color: #86efac;">
                        <option value="deepseek-r1:1.5b" data-size="1.1">1.5B (1.1GB)</option>
                        <option value="deepseek-r1:7b" data-size="4.7">7B (4.7GB)</option>
                        <option value="deepseek-r1:8b" data-size="4.9">8B (4.9GB)</option>
                        <option value="deepseek-r1:14b" data-size="9">14B (9GB)</option>
                    </select>
                    <button class="button ai-btn" id="ai-setup-local-btn" style="background: #10b981; color: white;">Install</button>
                </div>
            </div>
            
            <!-- Installation Progress -->
            <div id="ai-install-progress" class="ai-card" style="display: none; background: #f0f9ff; border-left: 3px solid #3b82f6;">
                <div style="display: flex; align-items: center; gap: 6px;"><span class="ai-spinner"></span><strong id="ai-install-status" style="font-size: 12px;">Installing...</strong></div>
                <p id="ai-install-message" style="font-size: 10px; color: #666; margin: 4px 0 0;"></p>
            </div>
            
            <!-- Provider -->
            <div class="ai-section">
                <div class="ai-section-title">Provider</div>
                <div class="ai-group">
                    <div class="ai-group-row"><div class="ai-card-row"><span class="ai-card-label">Default</span><select id="ai-provider-select" class="ai-select"><option value="ollama">Ollama</option><option value="openai">OpenAI</option><option value="claude">Claude</option><option value="gemini">Gemini</option><option value="xai">xAI</option></select></div></div>
                </div>
            </div>
            
            <!-- API Keys -->
            <div class="ai-section">
                <div class="ai-section-title">API Keys</div>
                <div class="ai-group">
                    <div class="ai-group-row ai-key-card" data-provider="openai"><div class="ai-card-row"><div><span class="ai-card-label">OpenAI</span><span class="ai-key-badge" id="ai-openai-badge" style="display: none; font-size: 9px; padding: 1px 4px; background: #10b981; color: white; border-radius: 2px; margin-left: 4px;">Active</span><div id="ai-openai-key-display" style="font-size: 10px; color: #666; font-family: monospace; margin-top: 2px;"><span class="ai-key-status">Not configured</span></div></div><div style="display: flex; gap: 4px;"><button class="button ai-btn ai-key-add-btn" id="ai-openai-add-btn" style="background: #3b82f6; color: white;">Add</button><button class="button ai-btn ai-key-update-btn" id="ai-openai-update-btn" style="display: none;">Edit</button><button class="button ai-btn ai-key-delete-btn" id="ai-openai-delete-btn" style="display: none; background: #dc2626; color: white;">×</button></div></div></div>
                    <div class="ai-group-row ai-key-card" data-provider="claude"><div class="ai-card-row"><div><span class="ai-card-label">Claude</span><span class="ai-key-badge" id="ai-claude-badge" style="display: none; font-size: 9px; padding: 1px 4px; background: #10b981; color: white; border-radius: 2px; margin-left: 4px;">Active</span><div id="ai-claude-key-display" style="font-size: 10px; color: #666; font-family: monospace; margin-top: 2px;"><span class="ai-key-status">Not configured</span></div></div><div style="display: flex; gap: 4px;"><button class="button ai-btn ai-key-add-btn" id="ai-claude-add-btn" style="background: #3b82f6; color: white;">Add</button><button class="button ai-btn ai-key-update-btn" id="ai-claude-update-btn" style="display: none;">Edit</button><button class="button ai-btn ai-key-delete-btn" id="ai-claude-delete-btn" style="display: none; background: #dc2626; color: white;">×</button></div></div></div>
                    <div class="ai-group-row ai-key-card" data-provider="gemini"><div class="ai-card-row"><div><span class="ai-card-label">Gemini</span><span class="ai-key-badge" id="ai-gemini-badge" style="display: none; font-size: 9px; padding: 1px 4px; background: #10b981; color: white; border-radius: 2px; margin-left: 4px;">Active</span><div id="ai-gemini-key-display" style="font-size: 10px; color: #666; font-family: monospace; margin-top: 2px;"><span class="ai-key-status">Not configured</span></div></div><div style="display: flex; gap: 4px;"><button class="button ai-btn ai-key-add-btn" id="ai-gemini-add-btn" style="background: #3b82f6; color: white;">Add</button><button class="button ai-btn ai-key-update-btn" id="ai-gemini-update-btn" style="display: none;">Edit</button><button class="button ai-btn ai-key-delete-btn" id="ai-gemini-delete-btn" style="display: none; background: #dc2626; color: white;">×</button></div></div></div>
                    <div class="ai-group-row ai-key-card" data-provider="xai"><div class="ai-card-row"><div><span class="ai-card-label">xAI</span><span class="ai-key-badge" id="ai-xai-badge" style="display: none; font-size: 9px; padding: 1px 4px; background: #10b981; color: white; border-radius: 2px; margin-left: 4px;">Active</span><div id="ai-xai-key-display" style="font-size: 10px; color: #666; font-family: monospace; margin-top: 2px;"><span class="ai-key-status">Not configured</span></div></div><div style="display: flex; gap: 4px;"><button class="button ai-btn ai-key-add-btn" id="ai-xai-add-btn" style="background: #3b82f6; color: white;">Add</button><button class="button ai-btn ai-key-update-btn" id="ai-xai-update-btn" style="display: none;">Edit</button><button class="button ai-btn ai-key-delete-btn" id="ai-xai-delete-btn" style="display: none; background: #dc2626; color: white;">×</button></div></div></div>
                </div>
            </div>
            
            <!-- Model Info -->
            <div class="ai-section">
                <div class="ai-section-title">Capabilities</div>
                <div class="ai-group">
                    <div class="ai-group-row"><div id="ai-capabilities" style="font-size: 11px; color: #666;">Loading...</div></div>
                </div>
            </div>
            
            <!-- Advanced -->
            <div class="ai-section">
                <div class="ai-section-title">Advanced</div>
                <div class="ai-group">
                    <div class="ai-group-row"><div class="ai-card-row"><span class="ai-card-label">Ollama URL</span><div style="display: flex; align-items: center; gap: 4px;"><input type="text" id="ai-ollama-url" value="http://localhost:11434" style="width: 140px; padding: 4px 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 10px;"><button class="button ai-btn" id="ai-ollama-url-save">Save</button></div></div></div>
                </div>
            </div>
            
            <!-- Messaging Channels -->
            <div class="ai-section" style="margin-top: 20px; border-top: 1px solid #e5e5e5; padding-top: 16px;">
                <div class="ai-section-title" style="display: flex; align-items: center; gap: 8px;">
                    <span>Messaging Channels</span>
                    <span style="font-size: 9px; font-weight: 400; color: #666; text-transform: none; letter-spacing: 0;">Talk to your AI from anywhere</span>
                </div>
                <div class="ai-group" id="channels-list">
                    <!-- WhatsApp -->
                    <div class="ai-group-row channel-row" data-channel="whatsapp">
                        <div class="ai-card-row">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="channel-icon" style="font-size: 16px;">📱</span>
                                <div>
                                    <span class="ai-card-label">WhatsApp</span>
                                    <div class="channel-status" style="font-size: 10px; color: #666; margin-top: 2px;">
                                        <span class="channel-status-dot" style="width: 6px; height: 6px; border-radius: 50%; background: #999; display: inline-block; margin-right: 4px;"></span>
                                        <span class="channel-status-text">Not connected</span>
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 4px;">
                                <button class="button ai-btn channel-connect-btn" style="background: #25D366; color: white;">Connect</button>
                                <button class="button ai-btn channel-settings-btn" style="display: none;">Settings</button>
                                <button class="button ai-btn channel-disconnect-btn" style="display: none; background: #dc2626; color: white;">Disconnect</button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Telegram -->
                    <div class="ai-group-row channel-row" data-channel="telegram">
                        <div class="ai-card-row">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="channel-icon" style="font-size: 16px;">✈️</span>
                                <div>
                                    <span class="ai-card-label">Telegram</span>
                                    <div class="channel-status" style="font-size: 10px; color: #666; margin-top: 2px;">
                                        <span class="channel-status-dot" style="width: 6px; height: 6px; border-radius: 50%; background: #999; display: inline-block; margin-right: 4px;"></span>
                                        <span class="channel-status-text">Not connected</span>
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 4px;">
                                <button class="button ai-btn channel-connect-btn" style="background: #0088cc; color: white;">Connect</button>
                                <button class="button ai-btn channel-settings-btn" style="display: none;">Settings</button>
                                <button class="button ai-btn channel-disconnect-btn" style="display: none; background: #dc2626; color: white;">Disconnect</button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Discord -->
                    <div class="ai-group-row channel-row" data-channel="discord">
                        <div class="ai-card-row">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="channel-icon" style="font-size: 16px;">🎮</span>
                                <div>
                                    <span class="ai-card-label">Discord</span>
                                    <div class="channel-status" style="font-size: 10px; color: #666; margin-top: 2px;">
                                        <span class="channel-status-dot" style="width: 6px; height: 6px; border-radius: 50%; background: #999; display: inline-block; margin-right: 4px;"></span>
                                        <span class="channel-status-text">Not connected</span>
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 4px;">
                                <button class="button ai-btn channel-connect-btn" style="background: #5865F2; color: white;">Connect</button>
                                <button class="button ai-btn channel-settings-btn" style="display: none;">Settings</button>
                                <button class="button ai-btn channel-disconnect-btn" style="display: none; background: #dc2626; color: white;">Disconnect</button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Signal -->
                    <div class="ai-group-row channel-row" data-channel="signal">
                        <div class="ai-card-row">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="channel-icon" style="font-size: 16px;">🔒</span>
                                <div>
                                    <span class="ai-card-label">Signal</span>
                                    <div class="channel-status" style="font-size: 10px; color: #666; margin-top: 2px;">
                                        <span class="channel-status-dot" style="width: 6px; height: 6px; border-radius: 50%; background: #999; display: inline-block; margin-right: 4px;"></span>
                                        <span class="channel-status-text">Not connected</span>
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 4px;">
                                <button class="button ai-btn channel-connect-btn" style="background: #3A76F0; color: white;">Connect</button>
                                <button class="button ai-btn channel-settings-btn" style="display: none;">Settings</button>
                                <button class="button ai-btn channel-disconnect-btn" style="display: none; background: #dc2626; color: white;">Disconnect</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Pending Pairings -->
                <div id="pending-pairings-section" style="display: none; margin-top: 12px;">
                    <div class="ai-section-title" style="font-size: 10px;">Pending Approvals</div>
                    <div class="ai-group" id="pending-pairings-list">
                        <!-- Populated dynamically -->
                    </div>
                </div>
            </div>
            
            <style>
                .ai-status-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #999;
                    display: inline-block;
                }
                .ai-status-dot.available {
                    background: #10b981;
                }
                .ai-status-dot.error {
                    background: #dc2626;
                }
                .ai-status-dot.no-models {
                    background: #f59e0b;
                }
                .ai-install-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                .ai-spinner {
                    width: 14px;
                    height: 14px;
                    border: 2px solid #e5e7eb;
                    border-top-color: #3b82f6;
                    border-radius: 50%;
                    animation: ai-spin 0.8s linear infinite;
                    display: inline-block;
                }
                @keyframes ai-spin {
                    to { transform: rotate(360deg); }
                }
            </style>
        `;
    },
    init: async function($el_window) {
        // Get auth token
        function getAuthToken() {
            if (window.auth_token) {
                return window.auth_token;
            }
            try {
                const savedSession = localStorage.getItem('pc2_session');
                if (savedSession) {
                    const sessionData = JSON.parse(savedSession);
                    return sessionData.session?.token || null;
                }
            } catch (e) {
                // Ignore
            }
            return null;
        }

        // Determine API origin
        function getAPIOrigin() {
            return window.api_origin || window.location.origin;
        }

        // Load AI configuration
        async function loadAIConfig() {
            try {
                const apiOrigin = getAPIOrigin();
                const url = new URL('/api/ai/config', apiOrigin);
                const authToken = getAuthToken();
                
                const headers = {
                    'Content-Type': 'application/json'
                };
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }
                
                const response = await fetch(url.toString(), {
                    method: 'GET',
                    headers
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to load AI config: ${response.status}`);
                }
                
                const data = await response.json();
                if (!data.success) {
                    throw new Error(data.error || 'Failed to load AI config');
                }
                
                const config = data.result;
                
                // Update UI
                $el_window.find('#ai-current-provider').text(
                    config.default_provider === 'ollama' ? 'Ollama (Local)' :
                    config.default_provider === 'openai' ? 'OpenAI' :
                    config.default_provider === 'claude' ? 'Claude' :
                    config.default_provider === 'gemini' ? 'Gemini' :
                    config.default_provider === 'xai' ? 'xAI (Grok)' :
                    config.default_provider
                );
                
                $el_window.find('#ai-current-model').text(config.default_model || 'Default');
                
                // Update status
                const statusDot = $el_window.find('#ai-status-dot');
                const statusText = $el_window.find('#ai-status-text');
                
                statusDot.removeClass('available error no-models');
                if (config.provider_status === 'available') {
                    statusDot.addClass('available');
                    statusText.text('Available');
                } else if (config.provider_status === 'error') {
                    statusDot.addClass('error');
                    statusText.text('Error');
                } else if (config.provider_status === 'no_models') {
                    statusDot.addClass('no-models');
                    statusText.text('No Models');
                } else {
                    statusText.text('Unknown');
                }
                
                // Update provider select
                $el_window.find('#ai-provider-select').val(config.default_provider || 'ollama');
                
                // Update API key status (pass active provider for badge)
                const activeProvider = config.default_provider || 'ollama';
                updateAPIKeyStatus('openai', config.api_keys?.openai, activeProvider);
                updateAPIKeyStatus('claude', config.api_keys?.claude, activeProvider);
                updateAPIKeyStatus('gemini', config.api_keys?.gemini, activeProvider);
                updateAPIKeyStatus('xai', config.api_keys?.xai, activeProvider);
                
                // Update Ollama URL
                $el_window.find('#ai-ollama-url').val(config.ollama_base_url || 'http://localhost:11434');
                
                // Load capabilities
                await loadCapabilities();
                
            } catch (error) {
                console.error('[AI Settings] Error loading config:', error);
                // Show defaults even on error
                $el_window.find('#ai-current-provider').text('Ollama (Local)');
                $el_window.find('#ai-current-model').text('deepseek-r1:1.5b');
                const statusDot = $el_window.find('#ai-status-dot');
                const statusText = $el_window.find('#ai-status-text');
                statusDot.removeClass('available error no-models').addClass('no-models');
                statusText.text('Unable to connect to server');
            }
        }

        // Update API key status display
        function updateAPIKeyStatus(provider, maskedKey, activeProvider) {
            const keyDisplay = $el_window.find(`#ai-${provider}-key-display`);
            const addBtn = $el_window.find(`#ai-${provider}-add-btn`);
            const updateBtn = $el_window.find(`#ai-${provider}-update-btn`);
            const deleteBtn = $el_window.find(`#ai-${provider}-delete-btn`);
            const badge = $el_window.find(`#ai-${provider}-badge`);
            
            // Show/hide active badge
            if (activeProvider === provider) {
                badge.show();
            } else {
                badge.hide();
            }
            
            if (maskedKey && maskedKey !== '***') {
                // Key is configured
                keyDisplay.html(`<span style="color: #10b981;">Key: ${maskedKey}</span>`);
                addBtn.hide();
                updateBtn.show();
                deleteBtn.show();
            } else {
                // No key configured
                keyDisplay.html(`<span class="ai-key-status" style="color: #999;">No API key configured</span>`);
                addBtn.show();
                updateBtn.hide();
                deleteBtn.hide();
            }
        }

        // Load capabilities
        async function loadCapabilities() {
            try {
                const apiOrigin = getAPIOrigin();
                const url = new URL('/api/ai/status', apiOrigin);
                const authToken = getAuthToken();
                
                const headers = {
                    'Content-Type': 'application/json'
                };
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }
                
                const response = await fetch(url.toString(), {
                    method: 'GET',
                    headers
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to load AI status: ${response.status}`);
                }
                
                const data = await response.json();
                if (!data.success) {
                    throw new Error(data.error || 'Failed to load AI status');
                }
                
                const status = data.result;
                const capabilities = [];
                
                if (status.capabilities.vision) {
                    capabilities.push('Vision (Image Analysis)');
                }
                if (status.capabilities.function_calling) {
                    capabilities.push('Function Calling');
                }
                if (status.capabilities.streaming) {
                    capabilities.push('Streaming Responses');
                }
                
                $el_window.find('#ai-capabilities').text(
                    capabilities.length > 0 ? capabilities.join(', ') : 'Loading...'
                );
                
            } catch (error) {
                console.error('[AI Settings] Error loading capabilities:', error);
                $el_window.find('#ai-capabilities').text('Unable to load');
            }
        }

        // Show API key input dialog
        function showAPIKeyDialog(provider, providerName) {
            const dialog = $(`
                <div class="ai-key-dialog" style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 999999999;
                ">
                    <div style="
                        background: white;
                        padding: 24px;
                        border-radius: 8px;
                        max-width: 500px;
                        width: 90%;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    ">
                        <h3 style="margin: 0 0 16px 0;">Configure ${providerName} API Key</h3>
                        <p style="font-size: 13px; color: #666; margin: 0 0 16px 0;">
                            Enter your ${providerName} API key. It will be stored securely and encrypted.
                        </p>
                        <input type="password" id="ai-key-input" placeholder="Enter API key..." style="
                            width: 100%;
                            padding: 8px 12px;
                            border: 1px solid #ddd;
                            border-radius: 4px;
                            font-size: 14px;
                            margin-bottom: 16px;
                            box-sizing: border-box;
                        ">
                        <div id="ai-key-error" style="color: #dc2626; font-size: 12px; margin-bottom: 16px; display: none;"></div>
                        <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 0;">
                            <button class="button ai-key-cancel" style="height: 28px; line-height: 28px; padding: 0 12px;">Cancel</button>
                            <button class="button ai-key-test" style="height: 28px; line-height: 28px; padding: 0 12px; background: #3b82f6; color: white;">Test & Save</button>
                        </div>
                    </div>
                </div>
            `);
            
            $('body').append(dialog);
            
            // Cancel button
            dialog.find('.ai-key-cancel').on('click', () => {
                dialog.remove();
            });
            
            // Test & Save button
            dialog.find('.ai-key-test').on('click', async () => {
                const apiKey = dialog.find('#ai-key-input').val();
                if (!apiKey) {
                    dialog.find('#ai-key-error').text('API key is required').show();
                    return;
                }
                
                // Test key
                try {
                    const apiOrigin = getAPIOrigin();
                    const testUrl = new URL('/api/ai/test-key', apiOrigin);
                    const authToken = getAuthToken();
                    
                    const headers = {
                        'Content-Type': 'application/json'
                    };
                    if (authToken) {
                        headers['Authorization'] = `Bearer ${authToken}`;
                    }
                    
                    const testResponse = await fetch(testUrl.toString(), {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ provider, apiKey })
                    });
                    
                    const testData = await testResponse.json();
                    
                    if (!testData.success || !testData.result.valid) {
                        dialog.find('#ai-key-error').text(testData.result.error || 'Invalid API key format').show();
                        return;
                    }
                    
                    // Save key
                    const saveUrl = new URL('/api/ai/api-keys', apiOrigin);
                    const saveResponse = await fetch(saveUrl.toString(), {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ provider, apiKey })
                    });
                    
                    const saveData = await saveResponse.json();
                    
                    if (!saveData.success) {
                        throw new Error(saveData.error || 'Failed to save API key');
                    }
                    
                    // Close modal immediately on success
                    dialog.remove();
                    
                    // Reload config to show updated status (don't block on this)
                    loadAIConfig().catch(err => {
                        console.error('[AI Settings] Error reloading config after save:', err);
                    });
                    
                } catch (error) {
                    console.error('[AI Settings] Error saving API key:', error);
                    dialog.find('#ai-key-error').text(error.message || 'Failed to save API key').show();
                }
            });
            
            // Close on background click
            dialog.on('click', function(e) {
                if (e.target === this) {
                    dialog.remove();
                }
            });
        }

        // Setup event handlers
        function setupEventHandlers() {
            // Provider select change
            $el_window.find('#ai-provider-select').on('change', async function() {
                const provider = $(this).val();
                try {
                    const apiOrigin = getAPIOrigin();
                    const url = new URL('/api/ai/config', apiOrigin);
                    const authToken = getAuthToken();
                    
                    const headers = {
                        'Content-Type': 'application/json'
                    };
                    if (authToken) {
                        headers['Authorization'] = `Bearer ${authToken}`;
                    }
                    
                    const response = await fetch(url.toString(), {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ provider })
                    });
                    
                    const data = await response.json();
                    if (!data.success) {
                        throw new Error(data.error || 'Failed to update provider');
                    }
                    
                    await loadAIConfig();
                    
                    // Notify AI chat to reload config
                    $(document).trigger('ai-config-updated');
                } catch (error) {
                    console.error('[AI Settings] Error updating provider:', error);
                    alert('Failed to update provider: ' + error.message);
                }
            });
            
            // API key buttons - Add and Update both open the same dialog
            $el_window.find('#ai-openai-add-btn, #ai-openai-update-btn').on('click', () => showAPIKeyDialog('openai', 'OpenAI'));
            $el_window.find('#ai-claude-add-btn, #ai-claude-update-btn').on('click', () => showAPIKeyDialog('claude', 'Claude'));
            $el_window.find('#ai-gemini-add-btn, #ai-gemini-update-btn').on('click', () => showAPIKeyDialog('gemini', 'Gemini'));
            $el_window.find('#ai-xai-add-btn, #ai-xai-update-btn').on('click', () => showAPIKeyDialog('xai', 'xAI (Grok)'));
            
            // Delete buttons
            $el_window.find('#ai-openai-delete-btn').on('click', async () => {
                if (!confirm('Are you sure you want to delete the OpenAI API key?')) return;
                await deleteAPIKey('openai');
            });
            $el_window.find('#ai-claude-delete-btn').on('click', async () => {
                if (!confirm('Are you sure you want to delete the Claude API key?')) return;
                await deleteAPIKey('claude');
            });
            $el_window.find('#ai-gemini-delete-btn').on('click', async () => {
                if (!confirm('Are you sure you want to delete the Gemini API key?')) return;
                await deleteAPIKey('gemini');
            });
            $el_window.find('#ai-xai-delete-btn').on('click', async () => {
                if (!confirm('Are you sure you want to delete the xAI API key?')) return;
                await deleteAPIKey('xai');
            });
            
            // Ollama URL save
            $el_window.find('#ai-ollama-url-save').on('click', async () => {
                const url = $el_window.find('#ai-ollama-url').val();
                try {
                    const apiOrigin = getAPIOrigin();
                    const saveUrl = new URL('/api/ai/config', apiOrigin);
                    const authToken = getAuthToken();
                    
                    const headers = {
                        'Content-Type': 'application/json'
                    };
                    if (authToken) {
                        headers['Authorization'] = `Bearer ${authToken}`;
                    }
                    
                    const response = await fetch(saveUrl.toString(), {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ ollama_base_url: url })
                    });
                    
                    const data = await response.json();
                    if (!data.success) {
                        throw new Error(data.error || 'Failed to update Ollama URL');
                    }
                    
                    alert('Ollama URL updated successfully');
                } catch (error) {
                    console.error('[AI Settings] Error updating Ollama URL:', error);
                    alert('Failed to update Ollama URL: ' + error.message);
                }
            });
        }

        // Delete API key
        async function deleteAPIKey(provider) {
            try {
                const apiOrigin = getAPIOrigin();
                const url = new URL(`/api/ai/api-keys/${provider}`, apiOrigin);
                const authToken = getAuthToken();
                
                const headers = {
                    'Content-Type': 'application/json'
                };
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }
                
                const response = await fetch(url.toString(), {
                    method: 'DELETE',
                    headers
                });
                
                const data = await response.json();
                if (!data.success) {
                    throw new Error(data.error || 'Failed to delete API key');
                }
                
                await loadAIConfig();
            } catch (error) {
                console.error('[AI Settings] Error deleting API key:', error);
                alert('Failed to delete API key: ' + error.message);
            }
        }

        // Check Ollama installation status
        async function checkOllamaStatus() {
            try {
                const apiOrigin = getAPIOrigin();
                const url = new URL('/api/ai/ollama-status', apiOrigin);
                const authToken = getAuthToken();
                
                const headers = {
                    'Content-Type': 'application/json'
                };
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }
                
                const response = await fetch(url.toString(), {
                    method: 'GET',
                    headers
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to check Ollama status: ${response.status}`);
                }
                
                const data = await response.json();
                if (!data.success) {
                    throw new Error(data.error || 'Failed to check Ollama status');
                }
                
                const status = data.result;
                const setupSection = $el_window.find('#ai-local-setup-section');
                const setupBtn = $el_window.find('#ai-setup-local-btn');
                
                // Show setup section if Ollama not installed OR model not downloaded
                if (!status.installed || !status.hasDeepseek) {
                    setupSection.show();
                    
                    // Update button text based on status
                    if (!status.installed) {
                        setupBtn.text('Install Ollama & Download Model');
                    } else {
                        setupBtn.text('Download Model');
                    }
                } else {
                    // Everything is ready - hide the setup section
                    setupSection.hide();
                }
                
                return status;
            } catch (error) {
                console.error('[AI Settings] Error checking Ollama status:', error);
                // Show setup section on error so user can try to install
                $el_window.find('#ai-local-setup-section').show();
                return null;
            }
        }

        // Setup Local AI - single button that installs Ollama + selected model
        async function setupLocalAI() {
            const progressDiv = $el_window.find('#ai-install-progress');
            const statusText = $el_window.find('#ai-install-status');
            const messageText = $el_window.find('#ai-install-message');
            const setupBtn = $el_window.find('#ai-setup-local-btn');
            const setupSection = $el_window.find('#ai-local-setup-section');
            
            // Get selected model
            const modelSelect = $el_window.find('#ai-model-select');
            const selectedModel = modelSelect.val();
            const selectedOption = modelSelect.find('option:selected');
            const modelSize = selectedOption.data('size') || '1.1';
            const modelName = selectedOption.text().split(' - ')[0]; // e.g., "DeepSeek R1 7B (4.7GB)"
            
            try {
                // Check current status first
                const currentStatus = await checkOllamaStatus();
                
                // Show progress
                progressDiv.show();
                setupBtn.prop('disabled', true);
                modelSelect.prop('disabled', true);
                
                const apiOrigin = getAPIOrigin();
                const authToken = getAuthToken();
                const headers = {
                    'Content-Type': 'application/json'
                };
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }
                
                // Step 1: Install Ollama if not installed
                if (!currentStatus?.installed) {
                    statusText.text('Step 1/2: Installing Ollama...');
                    messageText.text('Downloading and installing Ollama (~500MB). This may take a few minutes.');
                    
                    const installUrl = new URL('/api/ai/install-ollama', apiOrigin);
                    const installResponse = await fetch(installUrl.toString(), {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ action: 'install-ollama' })
                    });
                    
                    const installData = await installResponse.json();
                    if (!installData.success) {
                        throw new Error(installData.error || 'Failed to install Ollama');
                    }
                    
                    // Wait for Ollama to be installed
                    messageText.text('Waiting for Ollama installation to complete...');
                    
                    let ollamaInstalled = false;
                    for (let i = 0; i < 30; i++) {
                        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
                        const status = await checkOllamaStatus();
                        messageText.text(`Waiting for Ollama installation... (${i + 1}/30)`);
                        if (status?.installed) {
                            ollamaInstalled = true;
                            break;
                        }
                    }
                    
                    if (!ollamaInstalled) {
                        throw new Error('Ollama installation timed out. Please try again.');
                    }
                }
                
                // Step 2: Download selected model
                statusText.text('Step 2/2: Downloading Model...');
                messageText.text(`Downloading ${modelName} (~${modelSize}GB). This may take several minutes.`);
                
                const pullUrl = new URL('/api/ai/install-ollama', apiOrigin);
                const pullResponse = await fetch(pullUrl.toString(), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ action: 'pull-model', model: selectedModel })
                });
                
                const pullData = await pullResponse.json();
                if (!pullData.success) {
                    throw new Error(pullData.error || 'Failed to download model');
                }
                
                // Wait for model to be downloaded (longer timeout for larger models)
                const maxPolls = Math.max(60, Math.ceil(parseFloat(modelSize) * 10)); // More time for larger models
                let modelReady = false;
                for (let i = 0; i < maxPolls; i++) {
                    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
                    
                    // Check if model exists by calling ollama-status
                    const statusUrl = new URL('/api/ai/ollama-status', apiOrigin);
                    const statusResponse = await fetch(statusUrl.toString(), { method: 'GET', headers });
                    const statusData = await statusResponse.json();
                    
                    if (statusData.success && statusData.result.models) {
                        // Check if selected model is in the list
                        const modelBase = selectedModel.split(':')[0]; // e.g., "deepseek-r1"
                        if (statusData.result.models.some(m => m.includes(modelBase))) {
                            modelReady = true;
                            break;
                        }
                    }
                    
                    messageText.text(`Downloading ${modelName}... (${i + 1}/${maxPolls})`);
                }
                
                if (modelReady) {
                    statusText.text('Setup Complete!');
                    messageText.text(`${modelName} is now ready. You can start using the AI Assistant.`);
                    
                    // Update the default model in config
                    const configUrl = new URL('/api/ai/config', apiOrigin);
                    await fetch(configUrl.toString(), {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ model: selectedModel })
                    });
                    
                    setTimeout(() => {
                        progressDiv.hide();
                        setupSection.hide();
                        loadAIConfig();
                    }, 3000);
                } else {
                    statusText.text('Download in Progress...');
                    messageText.text('Model download is still in progress. Please check back in a few minutes.');
                    setupBtn.prop('disabled', false);
                    modelSelect.prop('disabled', false);
                }
                
            } catch (error) {
                console.error('[AI Settings] Setup error:', error);
                statusText.text('Setup Failed');
                messageText.text(error.message || 'An error occurred during setup.');
                setupBtn.prop('disabled', false);
                modelSelect.prop('disabled', false);
            }
        }

        // Setup button handler
        $el_window.find('#ai-setup-local-btn').on('click', () => {
            setupLocalAI();
        });

        // ============================================================
        // MESSAGING CHANNELS HANDLERS
        // ============================================================

        // Load channel status
        async function loadChannelStatus() {
            try {
                const apiOrigin = getAPIOrigin();
                const url = new URL('/api/gateway/channels', apiOrigin);
                const authToken = getAuthToken();
                
                const headers = {
                    'Content-Type': 'application/json'
                };
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }
                
                const response = await fetch(url.toString(), {
                    method: 'GET',
                    headers
                });
                
                if (!response.ok) {
                    // Gateway API might not be available yet - silently fail
                    console.log('[AI Settings] Gateway API not available');
                    return;
                }
                
                const data = await response.json();
                if (!data.success) {
                    return;
                }
                
                // Update channel UI
                for (const channel of data.data) {
                    updateChannelUI(channel);
                }
                
            } catch (error) {
                console.log('[AI Settings] Error loading channel status:', error.message);
            }
        }

        // Update channel UI based on status
        function updateChannelUI(channel) {
            const row = $el_window.find(`.channel-row[data-channel="${channel.type}"]`);
            if (!row.length) return;
            
            const statusDot = row.find('.channel-status-dot');
            const statusText = row.find('.channel-status-text');
            const connectBtn = row.find('.channel-connect-btn');
            const settingsBtn = row.find('.channel-settings-btn');
            const disconnectBtn = row.find('.channel-disconnect-btn');
            
            if (channel.status === 'connected') {
                statusDot.css('background', '#10b981');
                
                // Show channel-specific info
                if (channel.type === 'whatsapp' && channel.info?.phoneNumber) {
                    statusText.text(`Connected (${channel.info.phoneNumber})`);
                } else if (channel.type === 'telegram' && channel.info?.botUsername) {
                    statusText.text(`Connected (@${channel.info.botUsername})`);
                } else {
                    statusText.text('Connected');
                }
                
                connectBtn.hide();
                settingsBtn.show();
                disconnectBtn.show();
            } else if (channel.status === 'connecting') {
                statusDot.css('background', '#f59e0b');
                statusText.text('Connecting...');
                connectBtn.prop('disabled', true);
            } else if (channel.status === 'error') {
                statusDot.css('background', '#dc2626');
                statusText.text('Connection error');
                connectBtn.show();
                settingsBtn.hide();
                disconnectBtn.hide();
            } else {
                statusDot.css('background', '#999');
                statusText.text('Not connected');
                connectBtn.show();
                settingsBtn.hide();
                disconnectBtn.hide();
            }
        }

        // Load pending pairings
        async function loadPendingPairings() {
            try {
                const apiOrigin = getAPIOrigin();
                const url = new URL('/api/gateway/pairings', apiOrigin);
                const authToken = getAuthToken();
                
                const headers = {
                    'Content-Type': 'application/json'
                };
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }
                
                const response = await fetch(url.toString(), {
                    method: 'GET',
                    headers
                });
                
                if (!response.ok) return;
                
                const data = await response.json();
                if (!data.success) return;
                
                const pairings = data.data;
                const section = $el_window.find('#pending-pairings-section');
                const list = $el_window.find('#pending-pairings-list');
                
                if (pairings.length === 0) {
                    section.hide();
                    return;
                }
                
                section.show();
                list.empty();
                
                for (const pairing of pairings) {
                    const expiresIn = Math.max(0, Math.floor((new Date(pairing.expiresAt) - new Date()) / 60000));
                    const row = $(`
                        <div class="ai-group-row" data-pairing-id="${pairing.id}">
                            <div class="ai-card-row">
                                <div>
                                    <span class="ai-card-label">${pairing.senderName || pairing.senderId}</span>
                                    <div style="font-size: 10px; color: #666;">
                                        ${pairing.channel} • Code: ${pairing.code} • Expires in ${expiresIn} min
                                    </div>
                                </div>
                                <div style="display: flex; gap: 4px;">
                                    <button class="button ai-btn approve-pairing-btn" style="background: #10b981; color: white;">Approve</button>
                                </div>
                            </div>
                        </div>
                    `);
                    
                    row.find('.approve-pairing-btn').on('click', async () => {
                        await approvePairing(pairing.channel, pairing.senderId);
                    });
                    
                    list.append(row);
                }
                
            } catch (error) {
                console.log('[AI Settings] Error loading pairings:', error.message);
            }
        }

        // Approve a pairing
        async function approvePairing(channel, senderId) {
            try {
                const apiOrigin = getAPIOrigin();
                const url = new URL(`/api/gateway/pairings/${channel}/${encodeURIComponent(senderId)}/approve`, apiOrigin);
                const authToken = getAuthToken();
                
                const headers = {
                    'Content-Type': 'application/json'
                };
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }
                
                const response = await fetch(url.toString(), {
                    method: 'POST',
                    headers
                });
                
                if (!response.ok) {
                    throw new Error('Failed to approve pairing');
                }
                
                // Reload pairings
                await loadPendingPairings();
                
            } catch (error) {
                console.error('[AI Settings] Error approving pairing:', error);
                alert('Failed to approve pairing: ' + error.message);
            }
        }

        // Connect channel handler
        async function connectChannel(channelType) {
            try {
                // Show appropriate connection modal based on channel type
                if (channelType === 'whatsapp') {
                    showWhatsAppConnectModal();
                } else if (channelType === 'telegram') {
                    showTelegramConnectModal();
                } else if (channelType === 'discord') {
                    showDiscordConnectModal();
                } else if (channelType === 'signal') {
                    showSignalConnectModal();
                }
            } catch (error) {
                console.error(`[AI Settings] Error connecting ${channelType}:`, error);
                alert(`Failed to connect ${channelType}: ${error.message}`);
            }
        }

        // Disconnect channel handler
        async function disconnectChannel(channelType) {
            if (!confirm(`Are you sure you want to disconnect ${channelType}?`)) {
                return;
            }
            
            try {
                const apiOrigin = getAPIOrigin();
                const url = new URL(`/api/gateway/channels/${channelType}/disconnect`, apiOrigin);
                const authToken = getAuthToken();
                
                const headers = {
                    'Content-Type': 'application/json'
                };
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }
                
                const response = await fetch(url.toString(), {
                    method: 'POST',
                    headers
                });
                
                if (!response.ok) {
                    throw new Error('Failed to disconnect');
                }
                
                await loadChannelStatus();
                
            } catch (error) {
                console.error(`[AI Settings] Error disconnecting ${channelType}:`, error);
                alert(`Failed to disconnect: ${error.message}`);
            }
        }

        // WhatsApp connection modal with QR code
        async function showWhatsAppConnectModal() {
            try {
                // Dynamically import the WhatsApp connect modal
                const { showWhatsAppConnectModal: showModal } = await import('../Channels/UIWhatsAppConnect.js');
                await showModal();
                // Refresh channel status after connection
                await loadChannelStatus();
            } catch (error) {
                if (error.message !== 'Cancelled') {
                    console.error('[AI Settings] WhatsApp connect error:', error);
                    alert('Failed to connect WhatsApp: ' + error.message);
                }
            }
        }

        // Telegram connection modal
        function showTelegramConnectModal() {
            const token = prompt(
                'Telegram Bot Setup\n\n' +
                '1. Open Telegram and search for @BotFather\n' +
                '2. Send /newbot and follow the prompts\n' +
                '3. Copy the bot token and paste it below\n\n' +
                'Bot Token:'
            );
            
            if (!token || !token.trim()) {
                return;
            }
            
            // Connect with token
            connectChannelWithConfig('telegram', {
                telegram: { botToken: token.trim() },
                dmPolicy: 'pairing',
                allowFrom: []
            });
        }

        // Discord connection modal
        function showDiscordConnectModal() {
            const token = prompt(
                'Discord Bot Setup\n\n' +
                '1. Go to discord.com/developers/applications\n' +
                '2. Create a new application and add a bot\n' +
                '3. Copy the bot token and paste it below\n\n' +
                'Bot Token:'
            );
            
            if (!token || !token.trim()) {
                return;
            }
            
            connectChannelWithConfig('discord', {
                discord: { botToken: token.trim() },
                dmPolicy: 'pairing',
                allowFrom: []
            });
        }

        // Signal connection modal
        function showSignalConnectModal() {
            alert('Signal connection coming soon!\n\nThis requires signal-cli to be installed on your PC2 node.');
        }

        // Connect channel with config
        async function connectChannelWithConfig(channelType, config) {
            try {
                const apiOrigin = getAPIOrigin();
                const url = new URL(`/api/gateway/channels/${channelType}/connect`, apiOrigin);
                const authToken = getAuthToken();
                
                const headers = {
                    'Content-Type': 'application/json'
                };
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }
                
                const response = await fetch(url.toString(), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(config)
                });
                
                if (!response.ok) {
                    throw new Error('Failed to connect');
                }
                
                const data = await response.json();
                if (!data.success) {
                    throw new Error(data.error || 'Connection failed');
                }
                
                await loadChannelStatus();
                
            } catch (error) {
                console.error(`[AI Settings] Error connecting ${channelType}:`, error);
                alert(`Failed to connect ${channelType}: ${error.message}`);
            }
        }

        // Setup channel event handlers
        $el_window.find('.channel-connect-btn').on('click', function() {
            const channel = $(this).closest('.channel-row').data('channel');
            connectChannel(channel);
        });

        $el_window.find('.channel-disconnect-btn').on('click', function() {
            const channel = $(this).closest('.channel-row').data('channel');
            disconnectChannel(channel);
        });

        $el_window.find('.channel-settings-btn').on('click', function() {
            const channel = $(this).closest('.channel-row').data('channel');
            // TODO: Open channel settings modal
            alert(`${channel} settings coming soon!`);
        });

        // Initialize
        setupEventHandlers();
        await loadAIConfig();
        await checkOllamaStatus();
        
        // Load channel status (non-blocking)
        loadChannelStatus().catch(() => {});
        loadPendingPairings().catch(() => {});
    },
    on_show: async function($content) {
        // Refresh config when tab is shown
        const $el_window = $content.closest('.window-settings');
        if ($el_window.length) {
            // Re-run init to refresh data (includes Ollama status check and channel status)
            await this.init($el_window);
        }
    }
};

