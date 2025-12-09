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
                .pc2-status-indicator {
                    position: absolute;
                    bottom: -1px;
                    right: -1px;
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    border: 1px solid #222;
                    transition: all 0.3s;
                    z-index: 1;
                }

                .pc2-status-indicator.disconnected {
                    background: #f59e0b;
                }

                .pc2-status-indicator.connecting {
                    background: #f59e0b;
                    animation: pc2Pulse 1s ease-in-out infinite;
                }

                .pc2-status-indicator.connected {
                    background: #22c55e;
                }

                .pc2-status-indicator.error {
                    background: #ef4444;
                }

                @keyframes pc2Pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            </style>
        `);
    }

    // Create cloud icon SVG as data URI
    const cloudIconSvg = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h.71C7.37 7.69 9.48 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3s-1.34 3-3 3z"/></svg>')}`;

    // Create status bar element - styled to match other toolbar icons (no extra margin since inserted between existing buttons)
    const createStatusBar = () => {
        return $(`
            <div class="pc2-status-bar toolbar-btn" role="button" aria-label="PC2 Connection Status" tabindex="0" title="Personal Cloud (Not Connected)" style="background-image: url('${cloudIconSvg}'); position: relative;">
                <div class="pc2-status-indicator disconnected"></div>
            </div>
        `);
    };

    // Current status state
    let currentStatus = 'disconnected';
    let currentError = null;

    // Build menu items based on current status
    const getMenuItems = (stats = null) => {
        const items = [];
        const session = pc2Service.getSession?.() || {};

        // Status dot color: orange if not connected, green if connected
        const dotColor = currentStatus === 'connected' ? '#22c55e' : '#f59e0b';
        const statusText = currentStatus === 'connected' ? 'Connected' :
                          currentStatus === 'connecting' ? 'Connecting...' :
                          currentStatus === 'error' ? (currentError || 'Error') : 'Not Connected';

        items.push({
            html: `<span style="color: #fff;">Personal Cloud</span>`,
            icon: `<svg style="width:16px; height:16px; color: #fff;" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>`,
            disabled: true
        });

        items.push({
            html: `<span style="color: #fff;">${statusText}</span>`,
            icon: `<div style="width: 8px; height: 8px; border-radius: 50%; background: ${dotColor}; margin: 4px;"></div>`,
            disabled: true
        });

        if (currentStatus === 'connected' && session.nodeName) {
            items.push({
                html: `<span style="color: #fff;">Node: ${session.nodeName}</span>`,
                disabled: true
            });
        }

        // Show stats if connected
        if (currentStatus === 'connected' && stats) {
            items.push('-');
            
            const formatBytes = (bytes) => {
                if (!bytes || bytes === 0) return '0 B';
                const k = 1024;
                const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
            };
            
            items.push({
                html: `<span style="color: #aaa; font-size: 11px;">Storage: ${formatBytes(stats.storage?.used || 0)} / ${formatBytes(stats.storage?.limit || 0)}</span>`,
                disabled: true
            });
            
            items.push({
                html: `<span style="color: #aaa; font-size: 11px;">Files: ${stats.files || 0}</span>`,
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
                // Open Settings window with PC2 tab selected
                import('./Settings/UIWindowSettings.js').then(({ default: UIWindowSettings }) => {
                    UIWindowSettings({ tab: 'pc2' });
                }).catch((err) => {
                    logger.error('[PC2]: Failed to open settings:', err);
                });
            }
        });

        return items;
    };

    // Insert status bar into toolbar
    const insertStatusBar = () => {
        // Remove existing
        $('.pc2-status-bar').remove();
        
        // Find toolbar (top bar)
        const $toolbar = $('.toolbar');
        if ($toolbar.length === 0) {
            // Try again later
            setTimeout(insertStatusBar, 1000);
            return;
        }

        const $statusBar = createStatusBar();

        // Just use the statusBar directly (toolbar-btn has proper spacing)

        // Insert after the toolbar-spacer and before search button
        const $searchBtn = $toolbar.find('.search-btn');
        if ($searchBtn.length > 0) {
            $searchBtn.before($statusBar);
        } else {
            // Fallback: insert before clock
            const $clock = $toolbar.find('#clock');
            if ($clock.length > 0) {
                $clock.before($statusBar);
            } else {
                $toolbar.append($statusBar);
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
    $(document).on('click', '.pc2-status-bar', async function(e) {
        e.stopPropagation();
        e.preventDefault();
        
        const pos = this.getBoundingClientRect();
        
        // Close any existing PC2 menu
        if ($('.context-menu[data-id="pc2-menu"]').length > 0) {
            return;
        }

        // Fetch stats if connected
        let stats = null;
        if (currentStatus === 'connected') {
            try {
                stats = await pc2Service.getStats?.();
            } catch (err) {
                logger.log('[PC2]: Failed to get stats:', err);
            }
        }

        UIContextMenu({
            id: 'pc2-menu',
            parent_element: $(this),
            position: { 
                top: pos.bottom + 10, 
                left: pos.left + (pos.width / 2) - 100
            },
            items: getMenuItems(stats)
        });
    });

    // Auto-reconnect if we have saved config
    setTimeout(async () => {
        if (pc2Service.isConfigured?.() && !pc2Service.isConnected?.()) {
            logger.log('[PC2]: Auto-reconnecting to saved PC2 node...');
            try {
                await pc2Service.authenticate?.(pc2Service.getNodeUrl?.());
                logger.log('[PC2]: Auto-reconnect successful');
            } catch (err) {
                logger.log('[PC2]: Auto-reconnect failed:', err.message);
            }
        }
    }, 2000); // Wait 2 seconds after desktop loads
}

export default initPC2StatusBar;
