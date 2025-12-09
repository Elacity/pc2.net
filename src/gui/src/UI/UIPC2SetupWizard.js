/*
 * Copyright (C) 2024-present Elacity
 *
 * PC2 Setup Wizard
 * 
 * A step-by-step wizard for connecting to a PC2 node.
 * Uses Puter's UIWindow for consistent UI/UX.
 */

import UIWindow from './UIWindow.js';
import { getPC2Service } from '../services/PC2ConnectionService.js';
import { createLogger } from '../helpers/logger.js';

const logger = createLogger('PC2Wizard');

/**
 * Opens the PC2 Setup Wizard
 * @param {Object} options
 * @param {Function} [options.onSuccess] - Called on successful connection
 * @param {Function} [options.onCancel] - Called when wizard is cancelled
 */
async function UIPC2SetupWizard(options = {}) {
    const { onSuccess, onCancel } = options;
    const pc2Service = getPC2Service();

    // Build the window content - simple white/blue like Settings/Receive
    const h = `
        <div class="pc2-wizard-content" style="padding: 24px;">
            <!-- Step 1: Enter Node URL -->
            <div class="pc2-wizard-step" data-step="1">
                <div style="text-align: center; margin-bottom: 24px;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="#3b82f6" style="margin-bottom: 12px;">
                        <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
                    </svg>
                    <h2 style="margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #333;">Connect to Your PC2</h2>
                    <p style="margin: 0; color: #666; font-size: 13px;">Connect to your personal cloud from anywhere</p>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 500; color: #333;">
                        PC2 Node URL
                    </label>
                    <input 
                        type="url" 
                        class="pc2-node-url" 
                        placeholder="https://my-pc2.example.com:4200"
                        style="width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;"
                    />
                    <div class="pc2-url-status" style="margin-top: 6px; font-size: 12px;"></div>
                </div>
            </div>

            <!-- Step 2: Setup Token -->
            <div class="pc2-wizard-step" data-step="2" style="display: none;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="#f59e0b" style="margin-bottom: 12px;">
                        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                    </svg>
                    <h2 style="margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #333;">Setup Token Required</h2>
                    <p style="margin: 0; color: #666; font-size: 13px;">This node requires first-time setup</p>
                </div>

                <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
                    <p style="margin: 0; font-size: 12px; color: #92400e;">
                        The setup token was shown on your server console when you installed PC2. It can only be used once.
                    </p>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 500; color: #333;">
                        Setup Token
                    </label>
                    <input 
                        type="text" 
                        class="pc2-setup-token" 
                        placeholder="PC2-SETUP-xxxxxxxx..."
                        style="width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; font-family: monospace; box-sizing: border-box;"
                    />
                </div>
            </div>

            <!-- Step 3: Signing -->
            <div class="pc2-wizard-step" data-step="3" style="display: none;">
                <div style="text-align: center; padding: 30px 0;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="#3b82f6" style="margin-bottom: 12px;">
                        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
                    </svg>
                    <h2 style="margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #333;">Sign to Connect</h2>
                    <p style="margin: 0; color: #666; font-size: 13px;">Please sign the message in your wallet</p>
                    <div class="pc2-wallet-address" style="margin-top: 12px; font-family: monospace; font-size: 11px; color: #888;"></div>
                </div>
            </div>

            <!-- Success -->
            <div class="pc2-wizard-step" data-step="success" style="display: none;">
                <div style="text-align: center; padding: 30px 0;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="#22c55e" style="margin-bottom: 12px;">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                    <h2 style="margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #22c55e;">Connected!</h2>
                    <p class="pc2-success-message" style="margin: 0; color: #666; font-size: 13px;">Your personal cloud is ready</p>
                </div>
            </div>

            <!-- Error -->
            <div class="pc2-wizard-step" data-step="error" style="display: none;">
                <div style="text-align: center; padding: 30px 0;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="#ef4444" style="margin-bottom: 12px;">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                    <h2 style="margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #ef4444;">Connection Failed</h2>
                    <p class="pc2-error-message" style="margin: 0; color: #666; font-size: 13px;"></p>
                </div>
            </div>
        </div>

        <div class="pc2-wizard-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid #eee; background: #fafafa;">
            <button class="pc2-btn-cancel button button-default">Cancel</button>
            <button class="pc2-btn-back button button-default" style="display: none;">Back</button>
            <button class="pc2-btn-next button button-primary">
                <span class="pc2-btn-text">Next</span>
                <span class="pc2-btn-loading" style="display: none;">...</span>
            </button>
        </div>

        <style>
            .pc2-wizard-content input:focus {
                outline: none;
                border-color: #3b82f6;
            }
        </style>
    `;

    // Create the window
    const el_window = await UIWindow({
        title: 'Connect to PC2',
        app: 'pc2-setup',
        single_instance: true,
        icon: null,
        uid: null,
        is_dir: false,
        body_content: h,
        has_head: true,
        selectable_body: false,
        allow_context_menu: false,
        is_resizable: false,
        is_droppable: false,
        init_center: true,
        allow_native_ctxmenu: true,
        allow_user_select: true,
        backdrop: true,
        width: 420,
        height: 'auto',
        dominant: true,
        show_in_taskbar: false,
        draggable_body: false,
        window_class: 'window-pc2-setup',
        body_css: {
            width: 'initial',
            height: '100%',
            overflow: 'hidden',
            padding: '0',
            'background-color': '#ffffff',
        },
    });

    const $el = $(el_window);
    let currentStep = 1;
    let nodeUrl = '';
    let requiresSetupToken = false;

    // Helper functions
    const showStep = (step) => {
        $el.find('.pc2-wizard-step').hide();
        $el.find(`.pc2-wizard-step[data-step="${step}"]`).show();
        currentStep = step;
        
        // Update buttons
        $el.find('.pc2-btn-back').toggle(step > 1 && step !== 'success' && step !== 'error');
        $el.find('.pc2-btn-next').find('.pc2-btn-text').text(
            step === 'success' ? 'Done' : 
            step === 'error' ? 'Retry' : 
            step === 3 ? 'Sign & Connect' : 'Next'
        );
    };

    const setLoading = (loading) => {
        $el.find('.pc2-btn-next').prop('disabled', loading);
        $el.find('.pc2-btn-text').toggle(!loading);
        $el.find('.pc2-btn-loading').toggle(loading);
    };

    const showError = (message) => {
        $el.find('.pc2-error-message').text(message);
        showStep('error');
    };

    const showSuccess = (message) => {
        $el.find('.pc2-success-message').text(message || 'Your personal cloud is ready');
        showStep('success');
    };

    // Event handlers
    $el.find('.pc2-btn-cancel').on('click', () => {
        $(el_window).close();
        onCancel?.();
    });

    $el.find('.pc2-btn-back').on('click', () => {
        if (currentStep === 2) showStep(1);
        else if (currentStep === 3) showStep(requiresSetupToken ? 2 : 1);
        else if (currentStep === 'error') showStep(1);
    });

    $el.find('.pc2-btn-next').on('click', async () => {
        if (currentStep === 'success') {
            $(el_window).close();
            onSuccess?.();
            return;
        }

        if (currentStep === 'error') {
            showStep(1);
            return;
        }

        if (currentStep === 1) {
            nodeUrl = $el.find('.pc2-node-url').val()?.trim();
            if (!nodeUrl) {
                $el.find('.pc2-url-status').html('<span style="color: #ef4444;">Please enter a PC2 node URL</span>');
                return;
            }

            // Ensure URL has protocol
            if (!nodeUrl.startsWith('http://') && !nodeUrl.startsWith('https://')) {
                nodeUrl = 'http://' + nodeUrl;
                $el.find('.pc2-node-url').val(nodeUrl);
            }

            setLoading(true);
            $el.find('.pc2-url-status').html('<span style="color: #666;">Checking node...</span>');
            
            try {
                // Check if node is reachable and get its status
                logger.log('[PC2Wizard]: Checking node status:', nodeUrl);
                const status = await pc2Service.checkNodeStatus(nodeUrl);
                logger.log('[PC2Wizard]: Node status:', status);
                
                // Node is reachable - check if it needs setup
                requiresSetupToken = !status.hasOwner && status.status === 'AWAITING_OWNER';
                
                $el.find('.pc2-url-status').html(`<span style="color: #22c55e;">✓ ${status.nodeName} - ${requiresSetupToken ? 'Awaiting setup' : 'Ready'}</span>`);
                
                if (requiresSetupToken) {
                    showStep(2);
                } else {
                    // Node already has owner - authenticate
                    $el.find('.pc2-wallet-address').text(window.user?.wallet_address || '');
                    showStep(3);
                }
            } catch (err) {
                logger.error('[PC2Wizard]: Check failed:', err);
                $el.find('.pc2-url-status').html(`<span style="color: #ef4444;">✗ ${err.message || 'Could not connect to node'}</span>`);
            } finally {
                setLoading(false);
            }
            return;
        }

        if (currentStep === 2) {
            const token = $el.find('.pc2-setup-token').val()?.trim();
            if (!token) {
                return;
            }
            $el.find('.pc2-wallet-address').text(window.user?.wallet_address || '');
            showStep(3);
            return;
        }

        if (currentStep === 3) {
            setLoading(true);
            try {
                if (requiresSetupToken) {
                    // First-time setup - claim ownership
                    const setupToken = $el.find('.pc2-setup-token').val()?.trim();
                    logger.log('[PC2Wizard]: Claiming ownership...');
                    await pc2Service.claimOwnership(nodeUrl, setupToken);
                    showSuccess('Ownership claimed! Your personal cloud is ready.');
                } else {
                    // Existing node - authenticate
                    logger.log('[PC2Wizard]: Authenticating...');
                    await pc2Service.authenticate(nodeUrl);
                    showSuccess('Connected to your personal cloud');
                }
            } catch (err) {
                logger.error('[PC2Wizard]: Connection failed:', err);
                showError(err.message || 'Failed to connect');
            } finally {
                setLoading(false);
            }
        }
    });

    // Focus input
    setTimeout(() => {
        $el.find('.pc2-node-url').focus();
    }, 100);
}

export default UIPC2SetupWizard;
