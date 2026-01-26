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
                    <!-- Telegram -->
                    <div class="ai-group-row channel-row" data-channel="telegram">
                        <div class="ai-card-row">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <svg class="channel-icon" width="18" height="18" viewBox="0 0 24 24" fill="#0088cc"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
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
                    
                    <!-- WhatsApp (Coming Soon) -->
                    <div class="ai-group-row channel-row channel-disabled" data-channel="whatsapp" style="opacity: 0.5; pointer-events: none;">
                        <div class="ai-card-row">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <svg class="channel-icon" width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                <div>
                                    <span class="ai-card-label">WhatsApp</span>
                                    <div class="channel-status" style="font-size: 10px; color: #666; margin-top: 2px;">
                                        <span class="channel-status-text">Coming soon</span>
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 4px;">
                                <button class="button ai-btn channel-connect-btn" style="background: #25D366; color: white;" disabled>Connect</button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Discord (Coming Soon) -->
                    <div class="ai-group-row channel-row channel-disabled" data-channel="discord" style="opacity: 0.5; pointer-events: none;">
                        <div class="ai-card-row">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <svg class="channel-icon" width="18" height="18" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/></svg>
                                <div>
                                    <span class="ai-card-label">Discord</span>
                                    <div class="channel-status" style="font-size: 10px; color: #666; margin-top: 2px;">
                                        <span class="channel-status-text">Coming soon</span>
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 4px;">
                                <button class="button ai-btn channel-connect-btn" style="background: #5865F2; color: white;" disabled>Connect</button>
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
            
            <!-- Agents Section -->
            <div class="ai-section" style="margin-top: 20px; border-top: 1px solid #e5e5e5; padding-top: 16px;">
                <div class="ai-section-title" style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span>Agents</span>
                        <span style="font-size: 9px; font-weight: 400; color: #666; text-transform: none; letter-spacing: 0;">AI personalities for your channels</span>
                    </div>
                    <button class="button ai-btn" id="create-agent-btn" style="background: #3b82f6; color: white; font-size: 11px; padding: 4px 10px;">
                        + New Agent
                    </button>
                </div>
                <div class="ai-group" id="agents-list">
                    <!-- Default Personal Agent -->
                    <div class="ai-group-row agent-row" data-agent-id="personal">
                        <div class="ai-card-row">
                            <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                                <div class="agent-avatar" style="width: 36px; height: 36px; border-radius: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 14px;">
                                    P
                                </div>
                                <div style="flex: 1;">
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <span class="ai-card-label agent-name">Personal Assistant</span>
                                        <span class="agent-badge" style="font-size: 8px; padding: 1px 4px; background: #e5e7eb; color: #666; border-radius: 2px;">Default</span>
                                    </div>
                                    <div style="font-size: 10px; color: #666; margin-top: 2px;">
                                        <span class="agent-personality">Friendly Helper</span>
                                        <span style="margin: 0 4px;">|</span>
                                        <span class="agent-model">Ollama (llama3.2)</span>
                                    </div>
                                    <div class="agent-channels" style="font-size: 9px; color: #888; margin-top: 3px;">
                                        <!-- Channel badges will be added here -->
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 4px;">
                                <button class="button ai-btn agent-edit-btn" style="font-size: 10px;">Edit</button>
                                <button class="button ai-btn agent-channels-btn" style="font-size: 10px; background: #0088cc; color: white;">Channels</button>
                            </div>
                        </div>
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
            // Provider select change (use .off() to prevent duplicates)
            $el_window.find('#ai-provider-select').off('change').on('change', async function() {
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
            
            // API key buttons - Add and Update both open the same dialog (use .off() to prevent duplicates)
            $el_window.find('#ai-openai-add-btn, #ai-openai-update-btn').off('click').on('click', () => showAPIKeyDialog('openai', 'OpenAI'));
            $el_window.find('#ai-claude-add-btn, #ai-claude-update-btn').off('click').on('click', () => showAPIKeyDialog('claude', 'Claude'));
            $el_window.find('#ai-gemini-add-btn, #ai-gemini-update-btn').off('click').on('click', () => showAPIKeyDialog('gemini', 'Gemini'));
            $el_window.find('#ai-xai-add-btn, #ai-xai-update-btn').off('click').on('click', () => showAPIKeyDialog('xai', 'xAI (Grok)'));
            
            // Delete buttons
            $el_window.find('#ai-openai-delete-btn').off('click').on('click', async () => {
                if (!confirm('Are you sure you want to delete the OpenAI API key?')) return;
                await deleteAPIKey('openai');
            });
            $el_window.find('#ai-claude-delete-btn').off('click').on('click', async () => {
                if (!confirm('Are you sure you want to delete the Claude API key?')) return;
                await deleteAPIKey('claude');
            });
            $el_window.find('#ai-gemini-delete-btn').off('click').on('click', async () => {
                if (!confirm('Are you sure you want to delete the Gemini API key?')) return;
                await deleteAPIKey('gemini');
            });
            $el_window.find('#ai-xai-delete-btn').off('click').on('click', async () => {
                if (!confirm('Are you sure you want to delete the xAI API key?')) return;
                await deleteAPIKey('xai');
            });
            
            // Ollama URL save
            $el_window.find('#ai-ollama-url-save').off('click').on('click', async () => {
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

        // Setup button handler (use .off() to prevent duplicates)
        $el_window.find('#ai-setup-local-btn').off('click').on('click', () => {
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
                if (channelType === 'telegram') {
                    showTelegramConnectModal();
                } else if (channelType === 'whatsapp') {
                    alert('WhatsApp integration coming soon!');
                } else if (channelType === 'discord') {
                    alert('Discord integration coming soon!');
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
        async function showTelegramConnectModal() {
            try {
                // Dynamically import the Telegram connect modal
                const { showTelegramConnectModal: showModal } = await import('../Channels/UITelegramConnect.js');
                const result = await showModal();
                
                if (result && result.success) {
                    // Refresh channel status
                    await loadChannelStatuses();
                }
            } catch (error) {
                if (error.message !== 'Cancelled') {
                    console.error('[AI Settings] Telegram connect error:', error);
                }
            }
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

        // Setup channel event handlers (use .off() first to prevent duplicates)
        $el_window.find('.channel-connect-btn').off('click').on('click', function() {
            const channel = $(this).closest('.channel-row').data('channel');
            connectChannel(channel);
        });

        $el_window.find('.channel-disconnect-btn').off('click').on('click', function() {
            const channel = $(this).closest('.channel-row').data('channel');
            disconnectChannel(channel);
        });

        $el_window.find('.channel-settings-btn').off('click').on('click', async function() {
            const channel = $(this).closest('.channel-row').data('channel');
            
            if (channel === 'telegram') {
                // Open Telegram settings modal
                const { default: UITelegramSettings } = await import('../Channels/UITelegramSettings.js');
                UITelegramSettings();
            } else {
                alert(`${channel} settings coming soon!`);
            }
        });

        // Agent handlers
        $el_window.find('#create-agent-btn').off('click').on('click', async function() {
            const { default: UIAgentEditor } = await import('../Channels/UIAgentEditor.js');
            UIAgentEditor({
                onSave: async () => {
                    await loadAgents();
                }
            });
        });

        $el_window.find('.agent-edit-btn').off('click').on('click', async function() {
            const agentId = $(this).closest('.agent-row').data('agent-id');
            const { default: UIAgentEditor } = await import('../Channels/UIAgentEditor.js');
            UIAgentEditor({
                agentId,
                onSave: async () => {
                    await loadAgents();
                }
            });
        });

        $el_window.find('.agent-channels-btn').off('click').on('click', async function() {
            const $row = $(this).closest('.agent-row');
            const agentId = $row.data('agent-id');
            const agentName = $row.find('.agent-name').text();
            
            const { default: UIAgentChannels } = await import('../Channels/UIAgentChannels.js');
            UIAgentChannels({
                agentId,
                agentName,
                onSave: async () => {
                    await loadAgents();
                    await loadChannelStatus();
                }
            });
        });

        // Load agents function
        async function loadAgents() {
            try {
                const response = await fetch(`${getAPIOrigin()}/api/gateway/agents`, {
                    headers: { 'Authorization': `Bearer ${getAuthToken()}` }
                });
                const data = await response.json();
                
                if (data.success && data.data) {
                    const $list = $el_window.find('#agents-list');
                    // For now, just update the default agent display
                    // Full implementation would render all agents
                }
            } catch (e) {
                console.warn('[AI Settings] Could not load agents:', e);
            }
        }

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

