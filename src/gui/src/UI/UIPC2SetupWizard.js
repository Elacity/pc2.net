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

    // Build the window content
    const h = `
        <div class="pc2-wizard-content" style="padding: 20px; background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%); color: #fff; min-height: 300px;">
            <!-- Step 1: Enter Node URL -->
            <div class="pc2-wizard-step" data-step="1">
                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
                        </svg>
                    </div>
                    <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 600;">Connect to Your PC2</h2>
                    <p style="margin: 0; color: rgba(255,255,255,0.6); font-size: 14px;">Connect to your personal cloud from anywhere</p>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px;">
                        <span style="font-weight: 500;">PC2 Node URL</span>
                        <span style="display: block; font-size: 12px; color: rgba(255,255,255,0.5);">The address of your PC2 server</span>
                    </label>
                    <input 
                        type="url" 
                        class="pc2-node-url" 
                        placeholder="https://my-pc2.example.com:4200"
                        style="width: 100%; padding: 12px 16px; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; background: rgba(255,255,255,0.05); color: #fff; font-size: 14px; box-sizing: border-box;"
                    />
                    <div class="pc2-url-status" style="margin-top: 8px; font-size: 12px;"></div>
                </div>
            </div>

            <!-- Step 2: Setup Token -->
            <div class="pc2-wizard-step" data-step="2" style="display: none;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                        </svg>
                    </div>
                    <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 600;">Setup Token Required</h2>
                    <p style="margin: 0; color: rgba(255,255,255,0.6); font-size: 14px;">This node requires first-time setup</p>
                </div>

                <div style="background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                    <p style="margin: 0; font-size: 13px; color: rgba(255,255,255,0.8);">
                        The setup token was shown on your server console when you installed PC2. It can only be used once.
                    </p>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px;">
                        <span style="font-weight: 500;">Setup Token</span>
                    </label>
                    <input 
                        type="text" 
                        class="pc2-setup-token" 
                        placeholder="PC2-SETUP-xxxxxxxx..."
                        style="width: 100%; padding: 12px 16px; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; background: rgba(255,255,255,0.05); color: #fff; font-size: 14px; font-family: monospace; box-sizing: border-box;"
                    />
                </div>
            </div>

            <!-- Step 3: Signing -->
            <div class="pc2-wizard-step" data-step="3" style="display: none;">
                <div style="text-align: center; padding: 40px 0;">
                    <div style="width: 80px; height: 80px; margin: 0 auto 24px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; animation: pulse 2s infinite;">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="white">
                            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
                        </svg>
                    </div>
                    <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 600;">Sign to Connect</h2>
                    <p style="margin: 0; color: rgba(255,255,255,0.6); font-size: 14px;">Please sign the message in your wallet</p>
                    <div class="pc2-wallet-address" style="margin-top: 16px; font-family: monospace; font-size: 12px; color: rgba(255,255,255,0.5);"></div>
                </div>
            </div>

            <!-- Success -->
            <div class="pc2-wizard-step" data-step="success" style="display: none;">
                <div style="text-align: center; padding: 40px 0;">
                    <div style="width: 80px; height: 80px; margin: 0 auto 24px; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="white">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                    </div>
                    <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #22c55e;">Connected!</h2>
                    <p class="pc2-success-message" style="margin: 0; color: rgba(255,255,255,0.6); font-size: 14px;">Your personal cloud is ready</p>
                </div>
            </div>

            <!-- Error -->
            <div class="pc2-wizard-step" data-step="error" style="display: none;">
                <div style="text-align: center; padding: 40px 0;">
                    <div style="width: 80px; height: 80px; margin: 0 auto 24px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="white">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </div>
                    <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #ef4444;">Connection Failed</h2>
                    <p class="pc2-error-message" style="margin: 0; color: rgba(255,255,255,0.6); font-size: 14px;"></p>
                </div>
            </div>
        </div>

        <div class="pc2-wizard-footer" style="display: flex; justify-content: flex-end; gap: 12px; padding: 16px 20px; background: rgba(0,0,0,0.2); border-top: 1px solid rgba(255,255,255,0.1);">
            <button class="pc2-btn-cancel button button-default" style="padding: 10px 24px;">Cancel</button>
            <button class="pc2-btn-back button button-default" style="padding: 10px 24px; display: none;">Back</button>
            <button class="pc2-btn-next button button-primary" style="padding: 10px 24px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border: none; color: white;">
                <span class="pc2-btn-text">Next</span>
                <span class="pc2-btn-loading" style="display: none;">...</span>
            </button>
        </div>

        <style>
            @keyframes pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.05); opacity: 0.8; }
            }
            .pc2-wizard-content input:focus {
                outline: none;
                border-color: #6366f1;
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
            'background-color': 'transparent',
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

            setLoading(true);
            try {
                // Check if node is reachable and get its status
                const status = await pc2Service.checkNode?.(nodeUrl) || { requiresSetup: false };
                requiresSetupToken = status.requiresSetup;
                
                if (requiresSetupToken) {
                    showStep(2);
                } else {
                    // Show wallet address
                    $el.find('.pc2-wallet-address').text(window.user?.wallet_address || '');
                    showStep(3);
                }
            } catch (err) {
                $el.find('.pc2-url-status').html(`<span style="color: #ef4444;">${err.message || 'Could not connect to node'}</span>`);
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
                const setupToken = requiresSetupToken ? $el.find('.pc2-setup-token').val()?.trim() : null;
                await pc2Service.connect?.(nodeUrl, { setupToken });
                showSuccess('Connected to your personal cloud');
            } catch (err) {
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
