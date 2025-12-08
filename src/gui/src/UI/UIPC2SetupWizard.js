/*
 * Copyright (C) 2024-present Elacity
 *
 * PC2 Setup Wizard
 * 
 * A step-by-step wizard for:
 * 1. Connecting to an existing PC2 node
 * 2. Claiming ownership of a new PC2 node (with setup token)
 */

import { getPC2Service } from '../services/PC2ConnectionService.js';
import { logger } from '../helpers/logger.js';

/**
 * Opens the PC2 Setup Wizard
 * @param {Object} options
 * @param {'connect'|'claim'} [options.mode='connect'] - Wizard mode
 * @param {Function} [options.onSuccess] - Called on successful connection/claim
 * @param {Function} [options.onCancel] - Called when wizard is cancelled
 */
async function UIPC2SetupWizard(options = {}) {
    const { mode = 'connect', onSuccess, onCancel } = options;
    const pc2Service = getPC2Service();

    // Remove existing wizard if any
    $('.pc2-setup-wizard').remove();

    const wizardHtml = `
        <div class="pc2-setup-wizard">
            <div class="pc2-wizard-overlay"></div>
            <div class="pc2-wizard-modal">
                <div class="pc2-wizard-header">
                    <div class="pc2-wizard-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/>
                        </svg>
                    </div>
                    <h2 class="pc2-wizard-title">
                        ${mode === 'claim' ? 'Claim Your PC2 Node' : 'Connect to Your PC2'}
                    </h2>
                    <p class="pc2-wizard-subtitle">
                        ${mode === 'claim' 
                            ? 'Become the owner of your personal cloud' 
                            : 'Connect to your personal cloud from anywhere'}
                    </p>
                </div>

                <div class="pc2-wizard-body">
                    <!-- Step 1: Enter Node URL -->
                    <div class="pc2-wizard-step" data-step="1">
                        <div class="pc2-step-content">
                            <label class="pc2-input-label">
                                <span>PC2 Node URL</span>
                                <span class="pc2-input-hint">The address of your PC2 server</span>
                            </label>
                            <input 
                                type="url" 
                                class="pc2-input pc2-node-url" 
                                placeholder="https://my-pc2.example.com:4200"
                                autocomplete="off"
                                spellcheck="false"
                            />
                            <div class="pc2-url-status"></div>
                        </div>
                    </div>

                    <!-- Step 2: Setup Token (claim mode only) -->
                    <div class="pc2-wizard-step" data-step="2" style="display: none;">
                        <div class="pc2-step-content">
                            <div class="pc2-info-box">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                                </svg>
                                <span>The setup token was displayed on your server console when you first installed PC2. It can only be used once.</span>
                            </div>
                            <label class="pc2-input-label">
                                <span>Setup Token</span>
                                <span class="pc2-input-hint">One-time token from your server console</span>
                            </label>
                            <input 
                                type="text" 
                                class="pc2-input pc2-setup-token" 
                                placeholder="PC2-SETUP-xxxxxxxx..."
                                autocomplete="off"
                                spellcheck="false"
                            />
                        </div>
                    </div>

                    <!-- Step 3: Sign & Connect -->
                    <div class="pc2-wizard-step" data-step="3" style="display: none;">
                        <div class="pc2-step-content pc2-signing-step">
                            <div class="pc2-wallet-info">
                                <div class="pc2-wallet-label">Connecting with wallet:</div>
                                <div class="pc2-wallet-address"></div>
                            </div>
                            <div class="pc2-sign-prompt">
                                <div class="pc2-sign-icon">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                                    </svg>
                                </div>
                                <p>Sign the message in your wallet to prove ownership and establish a secure connection.</p>
                            </div>
                        </div>
                    </div>

                    <!-- Success State -->
                    <div class="pc2-wizard-step pc2-success-step" data-step="success" style="display: none;">
                        <div class="pc2-step-content">
                            <div class="pc2-success-icon">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                </svg>
                            </div>
                            <h3 class="pc2-success-title">Connected!</h3>
                            <p class="pc2-success-message"></p>
                        </div>
                    </div>

                    <!-- Error State -->
                    <div class="pc2-wizard-step pc2-error-step" data-step="error" style="display: none;">
                        <div class="pc2-step-content">
                            <div class="pc2-error-icon">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                                </svg>
                            </div>
                            <h3 class="pc2-error-title">Connection Failed</h3>
                            <p class="pc2-error-message"></p>
                        </div>
                    </div>
                </div>

                <div class="pc2-wizard-footer">
                    <button class="pc2-btn pc2-btn-secondary pc2-btn-cancel">Cancel</button>
                    <button class="pc2-btn pc2-btn-secondary pc2-btn-back" style="display: none;">Back</button>
                    <button class="pc2-btn pc2-btn-primary pc2-btn-next">
                        <span class="pc2-btn-text">Next</span>
                        <span class="pc2-btn-loading" style="display: none;">
                            <span class="pc2-spinner"></span>
                        </span>
                    </button>
                </div>
            </div>
        </div>
    `;

    // Add styles
    if (!$('#pc2-wizard-styles').length) {
        $('head').append(`
            <style id="pc2-wizard-styles">
                .pc2-setup-wizard {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 999999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .pc2-wizard-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(4px);
                }

                .pc2-wizard-modal {
                    position: relative;
                    background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    width: 480px;
                    max-width: 90vw;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                    overflow: hidden;
                }

                .pc2-wizard-header {
                    padding: 32px 32px 24px;
                    text-align: center;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                }

                .pc2-wizard-icon {
                    width: 64px;
                    height: 64px;
                    margin: 0 auto 16px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                }

                .pc2-wizard-title {
                    font-size: 24px;
                    font-weight: 600;
                    color: #fff;
                    margin: 0 0 8px;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                }

                .pc2-wizard-subtitle {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0;
                }

                .pc2-wizard-body {
                    padding: 24px 32px;
                    min-height: 200px;
                }

                .pc2-step-content {
                    animation: pc2FadeIn 0.3s ease;
                }

                @keyframes pc2FadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .pc2-input-label {
                    display: block;
                    margin-bottom: 8px;
                }

                .pc2-input-label span:first-child {
                    display: block;
                    font-size: 14px;
                    font-weight: 500;
                    color: #fff;
                    margin-bottom: 4px;
                }

                .pc2-input-hint {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                }

                .pc2-input {
                    width: 100%;
                    padding: 12px 16px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    color: #fff;
                    font-size: 14px;
                    font-family: 'SF Mono', 'Monaco', monospace;
                    box-sizing: border-box;
                    transition: all 0.2s;
                }

                .pc2-input:focus {
                    outline: none;
                    border-color: #667eea;
                    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
                }

                .pc2-input::placeholder {
                    color: rgba(255, 255, 255, 0.3);
                }

                .pc2-url-status {
                    margin-top: 12px;
                    font-size: 13px;
                    min-height: 20px;
                }

                .pc2-url-status.checking {
                    color: rgba(255, 255, 255, 0.5);
                }

                .pc2-url-status.success {
                    color: #4ade80;
                }

                .pc2-url-status.error {
                    color: #f87171;
                }

                .pc2-url-status.needs-claim {
                    color: #fbbf24;
                }

                .pc2-info-box {
                    display: flex;
                    gap: 12px;
                    padding: 12px 16px;
                    background: rgba(102, 126, 234, 0.1);
                    border: 1px solid rgba(102, 126, 234, 0.2);
                    border-radius: 8px;
                    margin-bottom: 20px;
                    color: rgba(255, 255, 255, 0.8);
                    font-size: 13px;
                    line-height: 1.5;
                }

                .pc2-info-box svg {
                    flex-shrink: 0;
                    color: #667eea;
                }

                .pc2-signing-step {
                    text-align: center;
                }

                .pc2-wallet-info {
                    margin-bottom: 24px;
                }

                .pc2-wallet-label {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.5);
                    margin-bottom: 8px;
                }

                .pc2-wallet-address {
                    font-family: 'SF Mono', 'Monaco', monospace;
                    font-size: 14px;
                    color: #fff;
                    padding: 8px 12px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 6px;
                    display: inline-block;
                }

                .pc2-sign-prompt {
                    padding: 24px;
                    background: rgba(255, 255, 255, 0.02);
                    border-radius: 12px;
                    border: 1px dashed rgba(255, 255, 255, 0.1);
                }

                .pc2-sign-icon {
                    color: #667eea;
                    margin-bottom: 16px;
                }

                .pc2-sign-prompt p {
                    margin: 0;
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 14px;
                    line-height: 1.5;
                }

                .pc2-success-step .pc2-step-content,
                .pc2-error-step .pc2-step-content {
                    text-align: center;
                    padding: 20px 0;
                }

                .pc2-success-icon {
                    color: #4ade80;
                    margin-bottom: 16px;
                }

                .pc2-error-icon {
                    color: #f87171;
                    margin-bottom: 16px;
                }

                .pc2-success-title,
                .pc2-error-title {
                    font-size: 20px;
                    font-weight: 600;
                    color: #fff;
                    margin: 0 0 8px;
                }

                .pc2-success-message,
                .pc2-error-message {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0;
                }

                .pc2-wizard-footer {
                    padding: 16px 32px 24px;
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                }

                .pc2-btn {
                    padding: 10px 20px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: none;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .pc2-btn-primary {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: #fff;
                    min-width: 100px;
                    justify-content: center;
                }

                .pc2-btn-primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                }

                .pc2-btn-primary:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none;
                    box-shadow: none;
                }

                .pc2-btn-secondary {
                    background: rgba(255, 255, 255, 0.05);
                    color: rgba(255, 255, 255, 0.8);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }

                .pc2-btn-secondary:hover {
                    background: rgba(255, 255, 255, 0.1);
                }

                .pc2-spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-top-color: #fff;
                    border-radius: 50%;
                    animation: pc2Spin 0.8s linear infinite;
                }

                @keyframes pc2Spin {
                    to { transform: rotate(360deg); }
                }
            </style>
        `);
    }

    // Add wizard to DOM
    $('body').append(wizardHtml);
    const $wizard = $('.pc2-setup-wizard');
    const $modal = $wizard.find('.pc2-wizard-modal');

    // State
    let currentStep = 1;
    let nodeUrl = '';
    let nodeStatus = null;
    let setupToken = '';
    let isClaimMode = mode === 'claim';

    // Helper functions
    const showStep = (step) => {
        $wizard.find('.pc2-wizard-step').hide();
        $wizard.find(`.pc2-wizard-step[data-step="${step}"]`).show();
        currentStep = step;

        // Update buttons
        const $back = $wizard.find('.pc2-btn-back');
        const $next = $wizard.find('.pc2-btn-next');
        const $cancel = $wizard.find('.pc2-btn-cancel');

        if (step === 'success') {
            $back.hide();
            $cancel.hide();
            $next.find('.pc2-btn-text').text('Done');
        } else if (step === 'error') {
            $back.show();
            $cancel.show();
            $next.find('.pc2-btn-text').text('Retry');
        } else if (step === 1) {
            $back.hide();
            $cancel.show();
            $next.find('.pc2-btn-text').text('Next');
        } else {
            $back.show();
            $cancel.hide();
            $next.find('.pc2-btn-text').text(step === 3 ? (isClaimMode ? 'Claim & Connect' : 'Connect') : 'Next');
        }
    };

    const setLoading = (loading) => {
        const $btn = $wizard.find('.pc2-btn-next');
        $btn.prop('disabled', loading);
        $btn.find('.pc2-btn-text').toggle(!loading);
        $btn.find('.pc2-btn-loading').toggle(loading);
    };

    const closeWizard = () => {
        $wizard.remove();
    };

    // Check node status
    const checkNode = async (url) => {
        const $status = $wizard.find('.pc2-url-status');
        $status.removeClass('success error needs-claim').addClass('checking');
        $status.text('Checking node...');

        try {
            nodeStatus = await pc2Service.checkNodeStatus(url);
            
            if (nodeStatus.status === 'AWAITING_OWNER') {
                $status.removeClass('checking').addClass('needs-claim');
                $status.html(`
                    <strong>${nodeStatus.nodeName || 'PC2 Node'}</strong> is ready!<br>
                    This node needs an owner. You'll need your setup token to claim it.
                `);
                isClaimMode = true;
            } else if (nodeStatus.status === 'OWNED') {
                $status.removeClass('checking').addClass('success');
                $status.html(`
                    <strong>${nodeStatus.nodeName || 'PC2 Node'}</strong> ✓<br>
                    Node is owned and ready to connect.
                `);
                isClaimMode = false;
            } else {
                $status.removeClass('checking').addClass('error');
                $status.text('Node not initialized');
            }

            return true;
        } catch (error) {
            $status.removeClass('checking').addClass('error');
            $status.text(`Unable to reach node: ${error.message}`);
            return false;
        }
    };

    // Event handlers
    $wizard.find('.pc2-btn-cancel').on('click', () => {
        closeWizard();
        onCancel?.();
    });

    $wizard.find('.pc2-wizard-overlay').on('click', () => {
        closeWizard();
        onCancel?.();
    });

    $wizard.find('.pc2-btn-back').on('click', () => {
        if (currentStep === 2 || currentStep === 3) {
            showStep(currentStep - 1);
        } else if (currentStep === 'error') {
            showStep(1);
        }
    });

    $wizard.find('.pc2-btn-next').on('click', async () => {
        if (currentStep === 'success') {
            closeWizard();
            onSuccess?.();
            return;
        }

        if (currentStep === 'error') {
            showStep(1);
            return;
        }

        if (currentStep === 1) {
            // Validate URL and check node
            nodeUrl = $wizard.find('.pc2-node-url').val().trim();
            
            if (!nodeUrl) {
                $wizard.find('.pc2-url-status').addClass('error').text('Please enter a PC2 node URL');
                return;
            }

            try {
                new URL(nodeUrl);
            } catch {
                $wizard.find('.pc2-url-status').addClass('error').text('Please enter a valid URL');
                return;
            }

            setLoading(true);
            const valid = await checkNode(nodeUrl);
            setLoading(false);

            if (valid) {
                if (isClaimMode) {
                    showStep(2);
                } else {
                    // Skip to signing step
                    showStep(3);
                    $wizard.find('.pc2-wallet-address').text(
                        window.user?.wallet_address || 'Unknown'
                    );
                }
            }
        } else if (currentStep === 2) {
            // Validate setup token
            setupToken = $wizard.find('.pc2-setup-token').val().trim();
            
            if (!setupToken) {
                return;
            }

            showStep(3);
            $wizard.find('.pc2-wallet-address').text(
                window.user?.wallet_address || 'Unknown'
            );
        } else if (currentStep === 3) {
            // Attempt connection/claim
            setLoading(true);

            try {
                if (isClaimMode) {
                    // Claim ownership
                    const result = await pc2Service.claimOwnership(nodeUrl, setupToken);
                    
                    // Now connect
                    await pc2Service.connect(nodeUrl);
                    
                    $wizard.find('.pc2-success-message').text(
                        `You are now the owner of ${result.nodeName || 'this PC2 node'}!`
                    );
                } else {
                    // Just connect
                    await pc2Service.connect(nodeUrl);
                    
                    $wizard.find('.pc2-success-message').text(
                        `Connected to ${nodeStatus?.nodeName || 'your PC2 node'}`
                    );
                }

                showStep('success');
            } catch (error) {
                logger.error('[PC2 Wizard]: Connection failed:', error);
                $wizard.find('.pc2-error-message').text(error.message);
                showStep('error');
            } finally {
                setLoading(false);
            }
        }
    });

    // URL input debounced check
    let checkTimeout = null;
    $wizard.find('.pc2-node-url').on('input', (e) => {
        clearTimeout(checkTimeout);
        const url = e.target.value.trim();
        
        if (url && url.length > 10) {
            checkTimeout = setTimeout(() => {
                try {
                    new URL(url);
                    checkNode(url);
                } catch {
                    // Invalid URL, ignore
                }
            }, 500);
        }
    });

    // Pre-fill saved URL if exists
    if (pc2Service.getNodeUrl()) {
        $wizard.find('.pc2-node-url').val(pc2Service.getNodeUrl());
        checkNode(pc2Service.getNodeUrl());
    }

    // Show first step
    showStep(1);
    $wizard.find('.pc2-node-url').focus();
}

export default UIPC2SetupWizard;

