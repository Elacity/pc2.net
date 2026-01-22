/**
 * UIUpdateModal - Update notification toast and modal
 * 
 * Provides macOS-style update experience:
 * - Toast notification when update is available
 * - Modal with version info and install button
 * - Progress UI during update installation
 * - Auto-reconnect after server restart
 */

let updateModalInstance = null;
let updateToastInstance = null;

/**
 * Check for updates from the server
 */
async function checkForUpdates() {
    try {
        // Only check in PC2 mode
        if (!window.pc2_config?.pc2_mode) {
            return null;
        }

        const response = await fetch('/api/update/status', {
            headers: {
                'Authorization': `Bearer ${puter.authToken}`
            }
        });

        if (!response.ok) {
            console.log('[Update] Failed to check for updates:', response.status);
            return null;
        }

        const data = await response.json();
        window.latestVersionInfo = data;

        if (data.updateAvailable) {
            const lastDismissed = localStorage.getItem('updateDismissed');
            if (lastDismissed !== data.latestVersion) {
                showUpdateToast(data);
            }
        }

        return data;
    } catch (error) {
        console.log('[Update] Check failed:', error);
        return null;
    }
}

/**
 * Show update toast notification
 */
function showUpdateToast(versionInfo) {
    // Remove existing toast if any
    if (updateToastInstance) {
        $(updateToastInstance).remove();
    }

    const toastHtml = `
        <div class="update-toast" style="
            position: fixed;
            bottom: 80px;
            right: 20px;
            background: linear-gradient(135deg, #4a90d9 0%, #357abd 100%);
            color: white;
            padding: 16px 20px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
            z-index: 999999;
            display: flex;
            align-items: center;
            gap: 16px;
            max-width: 380px;
            animation: slideInRight 0.3s ease-out;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        ">
            <div style="flex-shrink: 0;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
            </div>
            <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">
                    Update Available
                </div>
                <div style="font-size: 12px; opacity: 0.9;">
                    Version ${window.html_encode(versionInfo.latestVersion || 'New')} is ready to install
                </div>
            </div>
            <div style="display: flex; gap: 8px; flex-shrink: 0;">
                <button class="update-toast-later" style="
                    background: rgba(255, 255, 255, 0.2);
                    border: none;
                    color: white;
                    padding: 8px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                ">Later</button>
                <button class="update-toast-install" style="
                    background: white;
                    border: none;
                    color: #357abd;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 600;
                ">Update Now</button>
            </div>
        </div>
        <style>
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            .update-toast-later:hover {
                background: rgba(255, 255, 255, 0.3) !important;
            }
            .update-toast-install:hover {
                background: #f0f0f0 !important;
            }
        </style>
    `;

    const $toast = $(toastHtml);
    $('body').append($toast);
    updateToastInstance = $toast[0];

    // Later button - dismiss and remember
    $toast.find('.update-toast-later').on('click', function() {
        localStorage.setItem('updateDismissed', versionInfo.latestVersion);
        $toast.fadeOut(200, function() { $(this).remove(); });
        updateToastInstance = null;
    });

    // Update Now button - show modal
    $toast.find('.update-toast-install').on('click', function() {
        $toast.fadeOut(200, function() { $(this).remove(); });
        updateToastInstance = null;
        showUpdateModal(versionInfo);
    });
}

/**
 * Show update modal with version info and install button
 */
function showUpdateModal(versionInfo) {
    // Remove existing modal if any
    if (updateModalInstance) {
        $(updateModalInstance).remove();
    }

    const releaseNotes = versionInfo.releaseNotes 
        ? window.html_encode(versionInfo.releaseNotes).substring(0, 500) 
        : 'Bug fixes and performance improvements.';

    const modalHtml = `
        <div class="update-modal-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 999998;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.2s ease-out;
        ">
            <div class="update-modal" style="
                background: white;
                border-radius: 16px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                width: 420px;
                max-width: 90vw;
                overflow: hidden;
                animation: scaleIn 0.2s ease-out;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            ">
                <div style="padding: 24px; text-align: center;">
                    <div style="
                        width: 64px;
                        height: 64px;
                        background: linear-gradient(135deg, #4a90d9 0%, #357abd 100%);
                        border-radius: 16px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 16px;
                    ">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                    </div>
                    <h2 style="margin: 0 0 8px; font-size: 20px; color: #333;">Update Available</h2>
                    <p style="margin: 0 0 16px; color: #666; font-size: 14px;">
                        A new version of PC2 is ready to install
                    </p>
                    
                    <div style="
                        background: #f5f5f5;
                        border-radius: 8px;
                        padding: 12px;
                        margin-bottom: 16px;
                        text-align: left;
                    ">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: #666; font-size: 13px;">Current Version</span>
                            <span style="font-weight: 600; color: #333; font-size: 13px;">${window.html_encode(versionInfo.currentVersion || '1.0.0')}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #666; font-size: 13px;">New Version</span>
                            <span style="font-weight: 600; color: #4a90d9; font-size: 13px;">${window.html_encode(versionInfo.latestVersion || 'Latest')}</span>
                        </div>
                    </div>
                    
                    <div class="update-modal-notes" style="
                        text-align: left;
                        font-size: 12px;
                        color: #666;
                        max-height: 100px;
                        overflow-y: auto;
                        margin-bottom: 16px;
                        padding: 8px;
                        background: #fafafa;
                        border-radius: 6px;
                        white-space: pre-wrap;
                    ">${releaseNotes}</div>
                    
                    <div class="update-progress" style="display: none; margin-bottom: 16px;">
                        <div style="
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 12px;
                            padding: 16px;
                            background: #f0f7ff;
                            border-radius: 8px;
                        ">
                            <div class="update-spinner" style="
                                width: 24px;
                                height: 24px;
                                border: 3px solid #e0e0e0;
                                border-top-color: #4a90d9;
                                border-radius: 50%;
                                animation: spin 1s linear infinite;
                            "></div>
                            <span class="update-progress-text" style="color: #357abd; font-weight: 500;">
                                Starting update...
                            </span>
                        </div>
                    </div>
                </div>
                
                <div class="update-modal-actions" style="
                    padding: 16px 24px;
                    background: #f5f5f5;
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                ">
                    <button class="update-modal-cancel" style="
                        background: white;
                        border: 1px solid #ddd;
                        color: #666;
                        padding: 10px 20px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                    ">Later</button>
                    <button class="update-modal-install" style="
                        background: linear-gradient(135deg, #4a90d9 0%, #357abd 100%);
                        border: none;
                        color: white;
                        padding: 10px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 600;
                    ">Install Update</button>
                </div>
            </div>
        </div>
        <style>
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes scaleIn {
                from { transform: scale(0.9); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            .update-modal-cancel:hover {
                background: #f5f5f5 !important;
            }
            .update-modal-install:hover {
                opacity: 0.9;
            }
            .update-modal-install:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
        </style>
    `;

    const $modal = $(modalHtml);
    $('body').append($modal);
    updateModalInstance = $modal[0];

    // Cancel button
    $modal.find('.update-modal-cancel').on('click', function() {
        localStorage.setItem('updateDismissed', versionInfo.latestVersion);
        $modal.fadeOut(200, function() { $(this).remove(); });
        updateModalInstance = null;
    });

    // Click overlay to close
    $modal.find('.update-modal-overlay').on('click', function(e) {
        if (e.target === this) {
            localStorage.setItem('updateDismissed', versionInfo.latestVersion);
            $modal.fadeOut(200, function() { $(this).remove(); });
            updateModalInstance = null;
        }
    });

    // Install button
    $modal.find('.update-modal-install').on('click', async function() {
        const $btn = $(this);
        const $cancel = $modal.find('.update-modal-cancel');
        const $progress = $modal.find('.update-progress');
        const $progressText = $modal.find('.update-progress-text');
        const $notes = $modal.find('.update-modal-notes');

        // Disable buttons
        $btn.prop('disabled', true).text('Installing...');
        $cancel.prop('disabled', true);
        $notes.hide();
        $progress.show();

        try {
            // Start the update
            const response = await fetch('/api/update/install', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${puter.authToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success) {
                $progressText.text('Downloading latest code...');
                
                // Poll for progress and wait for restart
                await waitForRestart($progressText);
            } else {
                throw new Error(result.error || 'Update failed');
            }
        } catch (error) {
            console.error('[Update] Installation failed:', error);
            $progressText.html(`<span style="color: #d9534f;">Update failed: ${window.html_encode(error.message)}</span>`);
            $btn.prop('disabled', false).text('Retry');
            $cancel.prop('disabled', false);
        }
    });
}

/**
 * Wait for server to restart and reconnect
 */
async function waitForRestart($progressText) {
    const progressMessages = [
        'Downloading latest code...',
        'Installing dependencies...',
        'Building application...',
        'Restarting server...',
    ];

    let msgIndex = 0;
    const progressInterval = setInterval(() => {
        if (msgIndex < progressMessages.length) {
            $progressText.text(progressMessages[msgIndex]);
            msgIndex++;
        }
    }, 3000);

    // Wait a bit for server to start restarting
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Try to reconnect
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
        try {
            const response = await fetch('/api/health', { 
                signal: AbortSignal.timeout(2000) 
            });
            
            if (response.ok) {
                clearInterval(progressInterval);
                $progressText.html('<span style="color: #5cb85c;">Update complete! Refreshing...</span>');
                
                // Clear dismissed flag so banner doesn't show
                localStorage.removeItem('updateDismissed');
                
                // Reload page after brief delay
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
                return;
            }
        } catch {
            // Server not ready yet
        }

        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    clearInterval(progressInterval);
    $progressText.html('<span style="color: #f0ad4e;">Restart taking longer than expected. Please refresh manually.</span>');
}

// Export to window for global access
window.checkForUpdates = checkForUpdates;
window.showUpdateToast = showUpdateToast;
window.showUpdateModal = showUpdateModal;

export { checkForUpdates, showUpdateToast, showUpdateModal };
