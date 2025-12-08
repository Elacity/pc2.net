/*
 * Copyright (C) 2024-present Elacity
 *
 * PC2 Status Bar
 * 
 * Displays the PC2 connection status in the toolbar.
 * Shows connected/disconnected state and provides quick access to PC2 settings.
 * Uses Puter's UIContextMenu for consistent UI/UX.
 */

import { getPC2Service } from '../services/PC2ConnectionService.js';
import UIPC2SetupWizard from './UIPC2SetupWizard.js';
import UIContextMenu from './UIContextMenu.js';
import { createLogger } from '../helpers/logger.js';

const logger = createLogger('PC2StatusBar');

/**
 * Initialize the PC2 status bar component
 * This should be called once when the desktop loads
 */
function initPC2StatusBar() {
    const pc2Service = getPC2Service();
    
    // Add minimal styles for the icon
    if (!$('#pc2-status-styles').length) {
        $('head').append(`
            <style id="pc2-status-styles">
                .pc2-status-container {
                    display: flex;
                    align-items: center;
                    margin-left: 20px;
                }

                .pc2-status-bar {
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 17px;
                    height: 17px;
                    cursor: pointer;
                    transition: all 0.2s;
                    opacity: 0.8;
                }

                .pc2-status-bar:hover {
                    opacity: 1;
                }

                .pc2-status-indicator {
                    position: absolute;
                    bottom: -2px;
                    right: -2px;
                    width: 7px;
                    height: 7px;
                    border-radius: 50%;
                    border: 1.5px solid rgba(0, 0, 0, 0.3);
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
                    box-shadow: 0 0 6px rgba(74, 222, 128, 0.6);
                }

                .pc2-status-indicator.error {
                    background: #f87171;
                }

                @keyframes pc2Pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }

                .pc2-status-icon {
                    width: 17px;
                    height: 17px;
                    color: rgba(255, 255, 255, 0.8);
                }
            </style>
        `);
    }

    // Create status bar element - cloud icon with status dot
    const createStatusBar = () => {
        return $(`
            <div class="pc2-status-bar toolbar-btn" role="button" aria-label="PC2 Connection Status" tabindex="0" title="Personal Cloud (Not Connected)">
                <svg class="pc2-status-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h.71C7.37 7.69 9.48 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3s-1.34 3-3 3z"/>
                </svg>
                <div class="pc2-status-indicator disconnected"></div>
            </div>
        `);
    };

    // Current status state
    let currentStatus = 'disconnected';
    let currentError = null;

    // Build menu items based on current status
    const getMenuItems = () => {
        const items = [];
        const session = pc2Service.getSession?.() || {};
        const stats = pc2Service.getStats?.() || {};

        // Status header
        items.push({
            html: `<div style="padding: 4px 0; font-weight: 600; color: #fff;">Personal Cloud (PC2)</div>`,
            disabled: true
        });

        items.push('-');

        // Status info
        const statusColor = currentStatus === 'connected' ? '#4ade80' : 
                           currentStatus === 'connecting' ? '#fbbf24' : 
                           currentStatus === 'error' ? '#f87171' : '#6b7280';
        const statusText = currentStatus === 'connected' ? 'Connected' :
                          currentStatus === 'connecting' ? 'Connecting...' :
                          currentStatus === 'error' ? (currentError || 'Error') : 'Not Connected';

        items.push({
            html: `<div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor};"></div>
                <span style="color: ${statusColor};">${statusText}</span>
            </div>`,
            disabled: true
        });

        if (currentStatus === 'connected') {
            // Show connected info
            items.push({
                html: `<div style="font-size: 11px; color: rgba(255,255,255,0.5); padding: 4px 0;">
                    Node: ${session.nodeName || 'PC2'}<br>
                    Storage: ${stats.storage || 'IPFS'}
                </div>`,
                disabled: true
            });
        }

        items.push('-');

        // Action buttons
        if (currentStatus === 'connected') {
            items.push({
                html: 'Disconnect',
                onClick: () => {
                    pc2Service.disconnect?.();
                }
            });
        } else if (currentStatus !== 'connecting') {
            items.push({
                html: 'Connect to PC2',
                onClick: () => {
                    UIPC2SetupWizard({
                        onSuccess: () => {
                            logger.log('[PC2]: Connected via wizard');
                        },
                    });
                }
            });
        }

        items.push({
            html: 'PC2 Settings',
            onClick: () => {
                import('./UIPC2Settings.js').then(({ default: UIPC2Settings }) => {
                    UIPC2Settings();
                }).catch(() => {
                    logger.log('[PC2]: Settings panel not yet implemented');
                });
            }
        });

        return items;
    };

    // Insert status bar into toolbar
    const insertStatusBar = () => {
        // Remove existing
        $('.pc2-status-bar').remove();
        $('.pc2-status-container').remove();
        
        // Find toolbar (top bar)
        const $toolbar = $('.toolbar');
        if ($toolbar.length === 0) {
            // Try again later
            setTimeout(insertStatusBar, 1000);
            return;
        }

        const $statusBar = createStatusBar();

        // Wrap in container (for spacing)
        const $container = $('<div class="pc2-status-container"></div>');
        $container.append($statusBar);

        // Insert after the toolbar-spacer and before search button
        const $searchBtn = $toolbar.find('.search-btn');
        if ($searchBtn.length > 0) {
            $searchBtn.before($container);
        } else {
            // Fallback: insert before clock
            const $clock = $toolbar.find('#clock');
            if ($clock.length > 0) {
                $clock.before($container);
            } else {
                $toolbar.append($container);
            }
        }

        logger.log('[PC2]: Status bar inserted');

        // Update status display
        const updateStatus = (status, error) => {
            currentStatus = status;
            currentError = error;
            
            const $indicator = $statusBar.find('.pc2-status-indicator');
            $indicator.removeClass('disconnected connecting connected error');
            $indicator.addClass(status);

            const session = pc2Service.getSession?.() || {};
            const statusText = status === 'connected' ? (session.nodeName || 'Connected') :
                              status === 'connecting' ? 'Connecting...' :
                              status === 'error' ? (error || 'Error') : 'Not Connected';
            
            $statusBar.attr('title', `Personal Cloud (${statusText})`);
        };

        // Subscribe to status changes
        if (pc2Service.onStatusChange) {
            pc2Service.onStatusChange(updateStatus);
        }

        logger.log('[PC2]: Status bar initialized');
    };

    // Initialize
    insertStatusBar();

    // Use delegated event for click - opens UIContextMenu
    $(document).on('click', '.pc2-status-bar', function(e) {
        e.stopPropagation();
        e.preventDefault();
        
        const pos = this.getBoundingClientRect();
        
        // Close any existing PC2 menu
        if ($('.context-menu[data-id="pc2-menu"]').length > 0) {
            return;
        }

        UIContextMenu({
            id: 'pc2-menu',
            parent_element: $(this),
            position: { 
                top: pos.bottom + 10, 
                left: pos.left + (pos.width / 2) - 100
            },
            items: getMenuItems()
        });
    });
}

export default initPC2StatusBar;
