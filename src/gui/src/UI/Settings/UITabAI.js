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
            <h1>AI Assistant</h1>
            
            <!-- Current Status -->
            <div class="settings-card">
                <strong>Current Provider</strong>
                <div style="flex-grow:1; text-align: right;">
                    <span id="ai-current-provider" style="font-size: 13px;">Loading...</span>
                </div>
            </div>
            
            <div class="settings-card">
                <strong>Current Model</strong>
                <div style="flex-grow:1; text-align: right;">
                    <span id="ai-current-model" style="font-size: 13px;">Loading...</span>
                </div>
            </div>
            
            <div class="settings-card">
                <strong>Status</strong>
                <div style="flex-grow:1; text-align: right; display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
                    <span class="ai-status-dot" id="ai-status-dot"></span>
                    <span id="ai-status-text" style="font-size: 13px;">Loading...</span>
                </div>
            </div>
            
            <!-- Provider Selection -->
            <h2 style="font-size: 15px; margin: 20px 0 10px; color: #333;">Provider</h2>
            
            <div class="settings-card">
                <strong>Default Provider</strong>
                <select id="ai-provider-select" style="margin-left: 10px; max-width: 300px;">
                    <option value="ollama">Ollama (Local)</option>
                    <option value="openai">OpenAI</option>
                    <option value="claude">Claude (Anthropic)</option>
                    <option value="gemini">Gemini (Google)</option>
                </select>
            </div>
            
            <!-- API Keys Section -->
            <h2 style="font-size: 15px; margin: 20px 0 10px; color: #333;">API Keys</h2>
            
            <div class="settings-card">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <div>
                        <strong>OpenAI</strong>
                        <span id="ai-openai-status" style="font-size: 11px; color: #999; display: block; margin-top: 2px;">Not configured</span>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button class="button" id="ai-openai-key-btn" style="font-size: 12px; padding: 0 12px; height: 28px; line-height: 28px; vertical-align: middle;">Configure</button>
                        <button class="button" id="ai-openai-delete-btn" style="font-size: 12px; padding: 0 12px; height: 28px; line-height: 28px; vertical-align: middle; display: none; background: #dc2626; color: white;">Delete</button>
                    </div>
                </div>
            </div>
            
            <div class="settings-card">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <div>
                        <strong>Claude (Anthropic)</strong>
                        <span id="ai-claude-status" style="font-size: 11px; color: #999; display: block; margin-top: 2px;">Not configured</span>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button class="button" id="ai-claude-key-btn" style="font-size: 12px; padding: 0 12px; height: 28px; line-height: 28px; vertical-align: middle;">Configure</button>
                        <button class="button" id="ai-claude-delete-btn" style="font-size: 12px; padding: 0 12px; height: 28px; line-height: 28px; vertical-align: middle; display: none; background: #dc2626; color: white;">Delete</button>
                    </div>
                </div>
            </div>
            
            <div class="settings-card">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <div>
                        <strong>Gemini (Google)</strong>
                        <span id="ai-gemini-status" style="font-size: 11px; color: #999; display: block; margin-top: 2px;">Not configured</span>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button class="button" id="ai-gemini-key-btn" style="font-size: 12px; padding: 0 12px; height: 28px; line-height: 28px; vertical-align: middle;">Configure</button>
                        <button class="button" id="ai-gemini-delete-btn" style="font-size: 12px; padding: 0 12px; height: 28px; line-height: 28px; vertical-align: middle; display: none; background: #dc2626; color: white;">Delete</button>
                    </div>
                </div>
            </div>
            
            <!-- Model Information -->
            <h2 style="font-size: 15px; margin: 20px 0 10px; color: #333;">Model Information</h2>
            
            <div class="settings-card" style="flex-direction: column; align-items: flex-start;">
                <strong style="margin-bottom: 8px;">Capabilities</strong>
                <div id="ai-capabilities" style="font-size: 13px; color: #666;">
                    Loading...
                </div>
            </div>
            
            <!-- Advanced Settings -->
            <h2 style="font-size: 15px; margin: 20px 0 10px; color: #333;">Advanced</h2>
            
            <div class="settings-card">
                <strong>Ollama Base URL</strong>
                <div style="flex-grow: 1; display: flex; align-items: center; gap: 8px; justify-content: flex-end;">
                    <input type="text" id="ai-ollama-url" value="http://localhost:11434" style="max-width: 300px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; height: 28px; line-height: 28px; box-sizing: border-box;">
                    <button class="button" id="ai-ollama-url-save" style="font-size: 12px; padding: 0 12px; height: 28px; line-height: 28px; vertical-align: middle;">Save</button>
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
                
                // Update API key status
                updateAPIKeyStatus('openai', config.api_keys?.openai);
                updateAPIKeyStatus('claude', config.api_keys?.claude);
                updateAPIKeyStatus('gemini', config.api_keys?.gemini);
                
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
        function updateAPIKeyStatus(provider, maskedKey) {
            const statusEl = $el_window.find(`#ai-${provider}-status`);
            const deleteBtn = $el_window.find(`#ai-${provider}-delete-btn`);
            
            if (maskedKey && maskedKey !== '***') {
                statusEl.text(`Configured (${maskedKey})`).css('color', '#10b981');
                deleteBtn.show();
            } else {
                statusEl.text('Not configured').css('color', '#999');
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
                    z-index: 10000;
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
                            <button class="button ai-key-cancel" style="padding: 6px 16px; margin: 0; border: none; cursor: pointer; font-size: 14px; line-height: 1.4; vertical-align: middle; display: inline-flex; align-items: center; justify-content: center;">Cancel</button>
                            <button class="button ai-key-test" style="padding: 6px 16px; margin: 0; border: none; cursor: pointer; font-size: 14px; line-height: 1.4; vertical-align: middle; display: inline-flex; align-items: center; justify-content: center; background: #3b82f6; color: white;">Test & Save</button>
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
                    
                    // Reload config
                    dialog.remove();
                    await loadAIConfig();
                    
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
                } catch (error) {
                    console.error('[AI Settings] Error updating provider:', error);
                    alert('Failed to update provider: ' + error.message);
                }
            });
            
            // API key buttons
            $el_window.find('#ai-openai-key-btn').on('click', () => showAPIKeyDialog('openai', 'OpenAI'));
            $el_window.find('#ai-claude-key-btn').on('click', () => showAPIKeyDialog('claude', 'Claude'));
            $el_window.find('#ai-gemini-key-btn').on('click', () => showAPIKeyDialog('gemini', 'Gemini'));
            
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

        // Initialize
        setupEventHandlers();
        await loadAIConfig();
    },
    on_show: async function($content) {
        // Refresh config when tab is shown
        const $el_window = $content.closest('.window-settings');
        if ($el_window.length) {
            // Re-run init to refresh data
            await this.init($el_window);
        }
    }
};

