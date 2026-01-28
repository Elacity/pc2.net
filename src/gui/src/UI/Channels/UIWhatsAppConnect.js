/**
 * WhatsApp Connect Modal
 * 
 * Displays QR code for linking WhatsApp to PC2.
 * Polls the backend for QR code updates.
 */

export function showWhatsAppConnectModal() {
    return new Promise((resolve, reject) => {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'whatsapp-connect-overlay';
        overlay.innerHTML = `
            <style>
                .whatsapp-connect-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 999999;
                }
                .whatsapp-connect-modal {
                    background: white;
                    border-radius: 12px;
                    padding: 24px;
                    width: 400px;
                    max-width: 90%;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                }
                .whatsapp-connect-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 16px;
                }
                .whatsapp-connect-title {
                    font-size: 18px;
                    font-weight: 600;
                    color: #25D366;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .whatsapp-connect-close {
                    background: none;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: #666;
                    padding: 0;
                    line-height: 1;
                }
                .whatsapp-connect-close:hover {
                    color: #333;
                }
                .whatsapp-qr-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 20px;
                    background: #f9f9f9;
                    border-radius: 8px;
                    margin-bottom: 16px;
                }
                .whatsapp-qr-code {
                    font-family: monospace;
                    font-size: 4px;
                    line-height: 4px;
                    white-space: pre;
                    background: white;
                    padding: 10px;
                    border-radius: 4px;
                }
                .whatsapp-qr-loading {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 12px;
                    padding: 40px;
                }
                .whatsapp-qr-spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid #e5e7eb;
                    border-top-color: #25D366;
                    border-radius: 50%;
                    animation: whatsapp-spin 0.8s linear infinite;
                }
                @keyframes whatsapp-spin {
                    to { transform: rotate(360deg); }
                }
                .whatsapp-connect-instructions {
                    font-size: 13px;
                    color: #666;
                    line-height: 1.5;
                }
                .whatsapp-connect-instructions ol {
                    margin: 8px 0;
                    padding-left: 20px;
                }
                .whatsapp-connect-instructions li {
                    margin: 4px 0;
                }
                .whatsapp-connect-warning {
                    background: #fef3c7;
                    border: 1px solid #f59e0b;
                    border-radius: 6px;
                    padding: 10px 12px;
                    font-size: 12px;
                    color: #92400e;
                    margin-top: 12px;
                }
                .whatsapp-connect-success {
                    background: #d1fae5;
                    border: 1px solid #10b981;
                    border-radius: 6px;
                    padding: 16px;
                    text-align: center;
                    color: #065f46;
                }
                .whatsapp-connect-success-icon {
                    font-size: 48px;
                    margin-bottom: 8px;
                }
                .whatsapp-connect-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                    margin-top: 16px;
                }
                .whatsapp-connect-btn {
                    padding: 8px 16px;
                    border-radius: 6px;
                    font-size: 13px;
                    cursor: pointer;
                    border: none;
                }
                .whatsapp-connect-btn-cancel {
                    background: #f3f4f6;
                    color: #374151;
                }
                .whatsapp-connect-btn-cancel:hover {
                    background: #e5e7eb;
                }
            </style>
            <div class="whatsapp-connect-modal">
                <div class="whatsapp-connect-header">
                    <div class="whatsapp-connect-title">
                        <span>📱</span>
                        Connect WhatsApp
                    </div>
                    <button class="whatsapp-connect-close">&times;</button>
                </div>
                
                <div class="whatsapp-qr-container" id="whatsapp-qr-area">
                    <div class="whatsapp-qr-loading">
                        <div class="whatsapp-qr-spinner"></div>
                        <div>Initializing WhatsApp connection...</div>
                        <div style="font-size: 11px; color: #999;">This may take a few seconds</div>
                    </div>
                </div>
                
                <div class="whatsapp-connect-instructions">
                    <strong>To link your WhatsApp:</strong>
                    <ol>
                        <li>Open WhatsApp on your phone</li>
                        <li>Go to <strong>Settings → Linked Devices</strong></li>
                        <li>Tap <strong>Link a Device</strong></li>
                        <li>Point your camera at the QR code above</li>
                    </ol>
                </div>
                
                <div class="whatsapp-connect-warning">
                    <strong>Tip:</strong> We recommend using a separate phone number for your AI assistant. 
                    This keeps your personal chats private.
                </div>
                
                <div class="whatsapp-connect-footer">
                    <button class="whatsapp-connect-btn whatsapp-connect-btn-cancel">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        let pollingInterval = null;
        let connected = false;
        
        // Close modal function
        function closeModal(success = false) {
            if (pollingInterval) {
                clearInterval(pollingInterval);
            }
            overlay.remove();
            if (success) {
                resolve(true);
            } else {
                reject(new Error('Cancelled'));
            }
        }
        
        // Close button handler
        overlay.querySelector('.whatsapp-connect-close').addEventListener('click', () => closeModal(false));
        overlay.querySelector('.whatsapp-connect-btn-cancel').addEventListener('click', () => closeModal(false));
        
        // Click outside to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal(false);
            }
        });
        
        // Get API origin and auth token
        function getAPIOrigin() {
            return window.api_origin || window.location.origin;
        }
        
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
        
        // Start WhatsApp connection on backend
        async function startConnection() {
            try {
                const apiOrigin = getAPIOrigin();
                const authToken = getAuthToken();
                
                const response = await fetch(`${apiOrigin}/api/gateway/channels/whatsapp/connect`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': authToken ? `Bearer ${authToken}` : '',
                    },
                    body: JSON.stringify({
                        enabled: true,
                        dmPolicy: 'pairing',
                        allowFrom: [],
                    }),
                });
                
                if (!response.ok) {
                    throw new Error('Failed to start WhatsApp connection');
                }
                
                // Start polling for QR code
                startPolling();
                
            } catch (error) {
                console.error('[WhatsApp Connect] Error:', error);
                const qrArea = overlay.querySelector('#whatsapp-qr-area');
                qrArea.innerHTML = `
                    <div style="color: #dc2626; text-align: center; padding: 20px;">
                        <div style="font-size: 24px; margin-bottom: 8px;">❌</div>
                        <div>Failed to connect</div>
                        <div style="font-size: 12px; color: #666; margin-top: 4px;">${error.message}</div>
                    </div>
                `;
            }
        }
        
        // Poll for QR code and connection status
        function startPolling() {
            pollingInterval = setInterval(async () => {
                try {
                    const apiOrigin = getAPIOrigin();
                    const authToken = getAuthToken();
                    
                    // Check channel status
                    const statusResponse = await fetch(`${apiOrigin}/api/gateway/channels/whatsapp`, {
                        headers: {
                            'Authorization': authToken ? `Bearer ${authToken}` : '',
                        },
                    });
                    
                    if (statusResponse.ok) {
                        const statusData = await statusResponse.json();
                        
                        if (statusData.data?.status === 'connected') {
                            // Connected!
                            connected = true;
                            const qrArea = overlay.querySelector('#whatsapp-qr-area');
                            qrArea.innerHTML = `
                                <div class="whatsapp-connect-success">
                                    <div class="whatsapp-connect-success-icon">✅</div>
                                    <div style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">Connected!</div>
                                    <div style="font-size: 13px;">WhatsApp has been linked to your PC2 node.</div>
                                </div>
                            `;
                            
                            // Close after 2 seconds
                            setTimeout(() => closeModal(true), 2000);
                            return;
                        }
                    }
                    
                    // Poll for QR code
                    const qrResponse = await fetch(`${apiOrigin}/api/gateway/channels/whatsapp/qr`, {
                        headers: {
                            'Authorization': authToken ? `Bearer ${authToken}` : '',
                        },
                    });
                    
                    if (qrResponse.ok) {
                        const qrData = await qrResponse.json();
                        
                        if (qrData.data?.available && qrData.data?.qrDataUrl) {
                            const qrArea = overlay.querySelector('#whatsapp-qr-area');
                            qrArea.innerHTML = `
                                <img src="${qrData.data.qrDataUrl}" alt="WhatsApp QR Code" style="width: 256px; height: 256px; border-radius: 8px;" />
                            `;
                        }
                    }
                    
                } catch (error) {
                    console.error('[WhatsApp Connect] Polling error:', error);
                }
            }, 2000);
        }
        
        // Escape HTML for safe display
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // Start connection process
        startConnection();
    });
}

export default showWhatsAppConnectModal;
