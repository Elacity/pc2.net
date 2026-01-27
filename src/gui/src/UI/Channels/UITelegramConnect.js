/**
 * Telegram Connect Modal
 * 
 * Displays a modal for entering Telegram bot token.
 */

export function showTelegramConnectModal() {
    return new Promise((resolve, reject) => {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'telegram-connect-overlay';
        overlay.innerHTML = `
            <style>
                .telegram-connect-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                }
                .telegram-connect-modal {
                    background: white;
                    border-radius: 12px;
                    padding: 24px;
                    width: 440px;
                    max-width: 90%;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                }
                .telegram-connect-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 20px;
                }
                .telegram-connect-title {
                    font-size: 18px;
                    font-weight: 600;
                    color: #0088cc;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .telegram-connect-close {
                    background: none;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: #666;
                    padding: 0;
                    line-height: 1;
                }
                .telegram-connect-close:hover {
                    color: #333;
                }
                .telegram-steps {
                    background: #f0f7ff;
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 20px;
                }
                .telegram-steps-title {
                    font-weight: 600;
                    color: #333;
                    margin-bottom: 12px;
                    font-size: 14px;
                }
                .telegram-steps ol {
                    margin: 0;
                    padding-left: 20px;
                    color: #555;
                    font-size: 13px;
                    line-height: 1.6;
                }
                .telegram-steps li {
                    margin-bottom: 6px;
                }
                .telegram-steps code {
                    background: #e3f2fd;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-family: monospace;
                    font-size: 12px;
                }
                .telegram-input-group {
                    margin-bottom: 20px;
                }
                .telegram-input-label {
                    display: block;
                    font-weight: 500;
                    color: #333;
                    margin-bottom: 8px;
                    font-size: 14px;
                }
                .telegram-input {
                    width: 100%;
                    padding: 12px;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    font-size: 14px;
                    box-sizing: border-box;
                    transition: border-color 0.2s;
                }
                .telegram-input:focus {
                    outline: none;
                    border-color: #0088cc;
                    box-shadow: 0 0 0 3px rgba(0, 136, 204, 0.1);
                }
                .telegram-input::placeholder {
                    color: #999;
                }
                .telegram-buttons {
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                }
                .telegram-btn {
                    padding: 10px 20px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    border: none;
                    transition: all 0.2s;
                }
                .telegram-btn-cancel {
                    background: #f0f0f0;
                    color: #666;
                }
                .telegram-btn-cancel:hover {
                    background: #e0e0e0;
                }
                .telegram-btn-connect {
                    background: #0088cc;
                    color: white;
                }
                .telegram-btn-connect:hover {
                    background: #006699;
                }
                .telegram-btn-connect:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                }
                .telegram-error {
                    color: #dc2626;
                    font-size: 13px;
                    margin-top: 8px;
                    display: none;
                }
                .telegram-connecting {
                    display: none;
                    align-items: center;
                    gap: 8px;
                    color: #666;
                    font-size: 13px;
                    margin-top: 8px;
                }
                .telegram-spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid #ddd;
                    border-top-color: #0088cc;
                    border-radius: 50%;
                    animation: telegram-spin 0.8s linear infinite;
                }
                @keyframes telegram-spin {
                    to { transform: rotate(360deg); }
                }
            </style>
            <div class="telegram-connect-modal">
                <div class="telegram-connect-header">
                    <div class="telegram-connect-title">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#0088cc"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                        Connect Telegram Bot
                    </div>
                    <button class="telegram-connect-close" id="telegram-close-btn">&times;</button>
                </div>
                
                <div class="telegram-steps">
                    <div class="telegram-steps-title">How to create a Telegram bot:</div>
                    <ol>
                        <li>Open Telegram and search for <code>@BotFather</code></li>
                        <li>Send <code>/newbot</code> and follow the prompts</li>
                        <li>Copy the bot token (looks like <code>123456:ABC-DEF...</code>)</li>
                        <li>Paste it below</li>
                    </ol>
                </div>
                
                <div class="telegram-input-group">
                    <label class="telegram-input-label">Bot Token</label>
                    <input 
                        type="text" 
                        class="telegram-input" 
                        id="telegram-token-input"
                        placeholder="123456789:ABCdefGHI-jklMNOpqrSTUvwxYZ"
                        autocomplete="off"
                    />
                    <div class="telegram-error" id="telegram-error"></div>
                    <div class="telegram-connecting" id="telegram-connecting">
                        <div class="telegram-spinner"></div>
                        <span>Connecting to Telegram...</span>
                    </div>
                </div>
                
                <div class="telegram-buttons">
                    <button class="telegram-btn telegram-btn-cancel" id="telegram-cancel-btn">Cancel</button>
                    <button class="telegram-btn telegram-btn-connect" id="telegram-connect-btn" disabled>Connect</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Get elements
        const closeBtn = overlay.querySelector('#telegram-close-btn');
        const cancelBtn = overlay.querySelector('#telegram-cancel-btn');
        const connectBtn = overlay.querySelector('#telegram-connect-btn');
        const tokenInput = overlay.querySelector('#telegram-token-input');
        const errorEl = overlay.querySelector('#telegram-error');
        const connectingEl = overlay.querySelector('#telegram-connecting');
        
        // Close modal function
        function closeModal(result = null) {
            overlay.remove();
            if (result) {
                resolve(result);
            } else {
                reject(new Error('Cancelled'));
            }
        }
        
        // Validate token format
        function validateToken(token) {
            // Telegram bot tokens look like: 123456789:ABCdefGHI-jklMNOpqrSTUvwxYZ
            return /^\d+:[A-Za-z0-9_-]+$/.test(token.trim());
        }
        
        // Update button state based on input
        tokenInput.addEventListener('input', () => {
            const token = tokenInput.value.trim();
            connectBtn.disabled = !validateToken(token);
            errorEl.style.display = 'none';
        });
        
        // Handle connect
        async function handleConnect() {
            const token = tokenInput.value.trim();
            
            if (!validateToken(token)) {
                errorEl.textContent = 'Invalid token format. Should be like: 123456789:ABC...';
                errorEl.style.display = 'block';
                return;
            }
            
            // Show connecting state
            connectBtn.disabled = true;
            tokenInput.disabled = true;
            connectingEl.style.display = 'flex';
            errorEl.style.display = 'none';
            
            try {
                // Get API origin and auth token
                const apiOrigin = window.api_origin || `${window.location.protocol}//${window.location.host}`;
                const authToken = window.auth_token || 
                    (puter?.auth?.getToken ? await puter.auth.getToken() : null) ||
                    localStorage.getItem('auth_token');
                
                const response = await fetch(`${apiOrigin}/api/gateway/channels/telegram/connect`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': authToken ? `Bearer ${authToken}` : '',
                    },
                    body: JSON.stringify({
                        telegram: { botToken: token },
                        dmPolicy: 'open',
                        allowFrom: [],
                    }),
                });
                
                const data = await response.json();
                
                if (!response.ok || !data.success) {
                    throw new Error(data.error || 'Failed to connect');
                }
                
                // Success
                closeModal({ success: true, token });
                
            } catch (error) {
                console.error('[Telegram Connect] Error:', error);
                errorEl.textContent = error.message || 'Failed to connect. Please check the token.';
                errorEl.style.display = 'block';
                connectBtn.disabled = false;
                tokenInput.disabled = false;
                connectingEl.style.display = 'none';
            }
        }
        
        // Event listeners
        closeBtn.addEventListener('click', () => closeModal());
        cancelBtn.addEventListener('click', () => closeModal());
        connectBtn.addEventListener('click', handleConnect);
        
        // Handle Enter key
        tokenInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !connectBtn.disabled) {
                handleConnect();
            }
        });
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal();
            }
        });
        
        // Focus input
        setTimeout(() => tokenInput.focus(), 100);
    });
}

/**
 * UITelegramConnect - wrapper for use with dynamic import
 * Supports onSuccess callback pattern
 */
const UITelegramConnect = async function(options = {}) {
    const { onSuccess, onCancel } = options;
    
    try {
        const result = await showTelegramConnectModal();
        if (result && result.success && onSuccess) {
            // Extract bot username from token by calling API
            let botUsername = '';
            try {
                const apiOrigin = window.api_origin || `${window.location.protocol}//${window.location.host}`;
                const authToken = window.auth_token;
                const statusResp = await fetch(`${apiOrigin}/api/gateway/status`, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                const statusData = await statusResp.json();
                if (statusData.success && statusData.data?.channels?.telegram) {
                    // Try to get username from connected bot
                    botUsername = statusData.data.channels.telegram.botUsername || '';
                }
            } catch (e) {
                console.warn('[TelegramConnect] Could not fetch bot username:', e);
            }
            
            onSuccess(result.token, botUsername);
        }
    } catch (e) {
        if (onCancel) onCancel();
    }
};

export default UITelegramConnect;
