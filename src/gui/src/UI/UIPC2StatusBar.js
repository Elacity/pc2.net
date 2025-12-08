/*
 * Copyright (C) 2024-present Elacity
 *
 * PC2 Status Bar
 * 
 * Displays the PC2 connection status in the taskbar.
 * Shows connected/disconnected state and provides quick access to PC2 settings.
 */

import { getPC2Service } from '../services/PC2ConnectionService.js';
import UIPC2SetupWizard from './UIPC2SetupWizard.js';
import { createLogger } from '../helpers/logger.js';

const logger = createLogger('PC2StatusBar');

/**
 * Initialize the PC2 status bar component
 * This should be called once when the desktop loads
 */
function initPC2StatusBar() {
    const pc2Service = getPC2Service();
    
    // Add styles
    if (!$('#pc2-status-styles').length) {
        $('head').append(`
            <style id="pc2-status-styles">
                .pc2-status-bar {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 10px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.2s;
                    margin-left: 8px;
                }

                .pc2-status-bar:hover {
                    background: rgba(255, 255, 255, 0.1);
                }

                .pc2-status-indicator {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    transition: all 0.3s;
                }

                .pc2-status-indicator.disconnected {
                    background: #6b7280;
                }

                .pc2-status-indicator.connecting {
                    background: #fbbf24;
                    animation: pc2Pulse 1s ease-in-out infinite;
                }

                .pc2-status-indicator.connected {
                    background: #4ade80;
                    box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
                }

                .pc2-status-indicator.error {
                    background: #f87171;
                }

                @keyframes pc2Pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }

                .pc2-status-text {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.8);
                    white-space: nowrap;
                    max-width: 150px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .pc2-status-icon {
                    width: 16px;
                    height: 16px;
                    color: rgba(255, 255, 255, 0.6);
                }

                /* Dropdown Menu */
                .pc2-status-dropdown {
                    position: absolute;
                    bottom: 100%;
                    right: 0;
                    margin-bottom: 8px;
                    background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    min-width: 280px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                    z-index: 10000;
                    overflow: hidden;
                    display: none;
                }

                .pc2-status-dropdown.visible {
                    display: block;
                    animation: pc2SlideUp 0.2s ease;
                }

                @keyframes pc2SlideUp {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .pc2-dropdown-header {
                    padding: 16px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                }

                .pc2-dropdown-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: #fff;
                    margin-bottom: 4px;
                }

                .pc2-dropdown-subtitle {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                }

                .pc2-dropdown-body {
                    padding: 8px;
                }

                .pc2-dropdown-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 10px 12px;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: background 0.2s;
                }

                .pc2-dropdown-item:hover {
                    background: rgba(255, 255, 255, 0.05);
                }

                .pc2-dropdown-item svg {
                    width: 20px;
                    height: 20px;
                    color: rgba(255, 255, 255, 0.6);
                }

                .pc2-dropdown-item-text {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.8);
                }

                .pc2-dropdown-divider {
                    height: 1px;
                    background: rgba(255, 255, 255, 0.05);
                    margin: 4px 8px;
                }

                .pc2-connection-info {
                    padding: 16px;
                    background: rgba(74, 222, 128, 0.1);
                    border-radius: 8px;
                    margin: 8px;
                }

                .pc2-connection-info.error {
                    background: rgba(248, 113, 113, 0.1);
                }

                .pc2-connection-url {
                    font-family: 'SF Mono', 'Monaco', monospace;
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.7);
                    word-break: break-all;
                }

                .pc2-connection-status-row {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 8px;
                }

                .pc2-connection-status-text {
                    font-size: 13px;
                    font-weight: 500;
                    color: #4ade80;
                }

                .pc2-connection-info.error .pc2-connection-status-text {
                    color: #f87171;
                }
            </style>
        `);
    }

    // Create status bar element
    const createStatusBar = () => {
        return $(`
            <div class="pc2-status-bar" role="button" aria-label="PC2 Connection Status" tabindex="0">
                <div class="pc2-status-indicator disconnected"></div>
                <span class="pc2-status-text">Not Connected</span>
                <svg class="pc2-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
            </div>
        `);
    };

    // Create dropdown menu
    const createDropdown = () => {
        return $(`
            <div class="pc2-status-dropdown">
                <div class="pc2-dropdown-header">
                    <div class="pc2-dropdown-title">Personal Cloud</div>
                    <div class="pc2-dropdown-subtitle">ElastOS PC2</div>
                </div>
                <div class="pc2-connection-info" style="display: none;">
                    <div class="pc2-connection-status-row">
                        <div class="pc2-status-indicator connected"></div>
                        <span class="pc2-connection-status-text">Connected</span>
                    </div>
                    <div class="pc2-connection-url"></div>
                </div>
                <div class="pc2-dropdown-body">
                    <div class="pc2-dropdown-item pc2-connect-btn">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/>
                        </svg>
                        <span class="pc2-dropdown-item-text">Connect to PC2</span>
                    </div>
                    <div class="pc2-dropdown-item pc2-disconnect-btn" style="display: none;">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z"/>
                        </svg>
                        <span class="pc2-dropdown-item-text">Disconnect</span>
                    </div>
                    <div class="pc2-dropdown-divider"></div>
                    <div class="pc2-dropdown-item pc2-settings-btn">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                        </svg>
                        <span class="pc2-dropdown-item-text">PC2 Settings</span>
                    </div>
                </div>
            </div>
        `);
    };

    // Insert status bar into taskbar
    const insertStatusBar = () => {
        // Remove existing
        $('.pc2-status-bar').remove();
        
        // Find taskbar
        const $taskbar = $('.taskbar');
        if ($taskbar.length === 0) {
            // Try again later
            setTimeout(insertStatusBar, 1000);
            return;
        }

        const $statusBar = createStatusBar();
        const $dropdown = createDropdown();

        // Wrap in relative container
        const $container = $('<div style="position: relative;"></div>');
        $container.append($statusBar);
        $container.append($dropdown);

        // Insert before the clock if possible
        const $clock = $taskbar.find('.clock');
        if ($clock.length > 0) {
            $clock.before($container);
        } else {
            $taskbar.append($container);
        }

        // Toggle dropdown
        $statusBar.on('click', (e) => {
            e.stopPropagation();
            $dropdown.toggleClass('visible');
        });

        // Close dropdown when clicking outside
        $(document).on('click', () => {
            $dropdown.removeClass('visible');
        });

        $dropdown.on('click', (e) => {
            e.stopPropagation();
        });

        // Connect button
        $dropdown.find('.pc2-connect-btn').on('click', () => {
            $dropdown.removeClass('visible');
            UIPC2SetupWizard({
                onSuccess: () => {
                    logger.log('[PC2]: Connected via wizard');
                },
            });
        });

        // Disconnect button
        $dropdown.find('.pc2-disconnect-btn').on('click', () => {
            pc2Service.disconnect();
            $dropdown.removeClass('visible');
        });

        // Settings button
        $dropdown.find('.pc2-settings-btn').on('click', () => {
            $dropdown.removeClass('visible');
            // TODO: Open PC2 settings panel
            import('./UIPC2Settings.js').then(({ default: UIPC2Settings }) => {
                UIPC2Settings();
            }).catch(() => {
                logger.log('[PC2]: Settings panel not yet implemented');
            });
        });

        // Update status display
        const updateStatus = (status, error) => {
            const $indicator = $statusBar.find('.pc2-status-indicator');
            const $text = $statusBar.find('.pc2-status-text');
            const $connectionInfo = $dropdown.find('.pc2-connection-info');
            const $connectBtn = $dropdown.find('.pc2-connect-btn');
            const $disconnectBtn = $dropdown.find('.pc2-disconnect-btn');

            $indicator.removeClass('disconnected connecting connected error');
            $indicator.addClass(status);

            switch (status) {
                case 'connected':
                    const session = pc2Service.getSession();
                    $text.text(session?.nodeName || 'Connected');
                    $connectionInfo.show().removeClass('error');
                    $connectionInfo.find('.pc2-connection-status-text').text('Connected');
                    $connectionInfo.find('.pc2-connection-url').text(pc2Service.getNodeUrl() || '');
                    $connectionInfo.find('.pc2-status-indicator').removeClass('error').addClass('connected');
                    $connectBtn.hide();
                    $disconnectBtn.show();
                    break;
                case 'connecting':
                    $text.text('Connecting...');
                    $connectionInfo.hide();
                    $connectBtn.hide();
                    $disconnectBtn.hide();
                    break;
                case 'error':
                    $text.text('Error');
                    $connectionInfo.show().addClass('error');
                    $connectionInfo.find('.pc2-connection-status-text').text(error || 'Connection Error');
                    $connectionInfo.find('.pc2-status-indicator').removeClass('connected').addClass('error');
                    $connectBtn.show();
                    $disconnectBtn.hide();
                    break;
                default:
                    $text.text('Not Connected');
                    $connectionInfo.hide();
                    $connectBtn.show();
                    $disconnectBtn.hide();
            }
        };

        // Subscribe to status changes
        pc2Service.onStatusChange(updateStatus);

        logger.log('[PC2]: Status bar initialized');
    };

    // Initialize
    insertStatusBar();
}

export default initPC2StatusBar;

