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

                /* In topbar (single bar mode) keep dot fully inside to avoid clipping */
                .topbar .pc2-status-indicator {
                    bottom: 0;
                    right: 0;
                }

                /* In floating toolbar (smaller top bar) same fix */
                .toolbar .pc2-status-indicator {
                    bottom: 0;
                    right: 0;
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

                .pc2-tip {
                    display: inline-flex;
                    align-items: center;
                    margin-left: 6px;
                    cursor: help;
                }
                #pc2-floating-tip {
                    position: fixed;
                    background: #1a1a1a;
                    color: #ddd;
                    padding: 8px 10px;
                    border-radius: 6px;
                    font-size: 11px;
                    line-height: 1.4;
                    max-width: 240px;
                    z-index: 2147483647;
                    pointer-events: none;
                    border: 1px solid #555;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                }
            </style>
        `);
    }

    // Create cloud icon SVG as data URI
    const cloudIconSvg = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h.71C7.37 7.69 9.48 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3s-1.34 3-3 3z"/></svg>')}`;

    // Create status bar element - styled to match other toolbar icons (no extra margin since inserted between existing buttons)
    const createStatusBar = () => {
        return $(`
            <div class="pc2-status-bar toolbar-btn" role="button" aria-label="PC2 Connection Status" tabindex="0" title="${i18n('personal_cloud_status')} (${i18n('not_connected')})" style="background-image: url('${cloudIconSvg}'); position: relative;">
                <div class="pc2-status-indicator disconnected"></div>
            </div>
        `);
    };

    // Current status state
    let currentStatus = 'disconnected';
    let currentError = null;

    const copyIcon = `<svg style="width:12px;height:12px;vertical-align:middle;cursor:pointer;opacity:0.6;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
    let privacyHidden = true;
    if (!window._pc2Stealth) window._pc2Stealth = { stealth: false, vless: false, initialized: false };
    let stealthModeEnabled = window._pc2Stealth.stealth;
    let vlessEnabled = window._pc2Stealth.vless;

    const maskValue = (val) => privacyHidden ? val.replace(/[a-zA-Z0-9]/g, '•') : val;

    // Build menu items based on current status
    const getMenuItems = (stats = null, nodeInfo = null, connectivity = null) => {
        const items = [];
        const session = pc2Service.getSession?.() || {};
        
        const isAuthenticated = window.is_auth && window.is_auth();
        const isPC2Mode = window.api_origin && (
            window.api_origin.includes('127.0.0.1:4200') || 
            window.api_origin.includes('localhost:4200') ||
            window.location.origin === window.api_origin
        );
        
        let effectiveStatus = currentStatus;
        let effectiveStatusText = currentStatus === 'connected' ? i18n('connected') :
                                 currentStatus === 'connecting' ? i18n('connecting') :
                                 currentStatus === 'error' ? (currentError || i18n('error')) : i18n('not_connected');
        
        if (isPC2Mode) {
            if (isAuthenticated) {
                effectiveStatus = 'connected';
                effectiveStatusText = i18n('connected');
            } else {
                effectiveStatus = 'disconnected';
                effectiveStatusText = i18n('not_connected');
            }
        }

        const dotColor = effectiveStatus === 'connected' ? '#22c55e' : '#f59e0b';

        items.push({
            html: `<span style="color: #fff;">${i18n('personal_cloud_status')}</span>`,
            icon: `<svg style="width:16px; height:16px; vertical-align:middle; color:#fff;" viewBox="0 0 24 24" fill="#fff"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>`,
            disabled: true
        });

        items.push({
            html: `<span data-pc2-status style="color: #fff;">${effectiveStatusText}</span>`,
            icon: `<span data-pc2-status-dot style="display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; vertical-align:middle;"><span style="width:8px; height:8px; border-radius:50%; background:${dotColor};"></span></span>`,
            disabled: true
        });

        // Domain, IP, and connection method
        if (effectiveStatus === 'connected' && nodeInfo) {
            items.push('-');

            const domainDisplay = privacyHidden ? maskValue(nodeInfo.publicUrl || '') : (nodeInfo.publicUrl || '');
            const ipDisplay = privacyHidden ? maskValue(nodeInfo.localIp || '') : (nodeInfo.localIp || '');

            if (nodeInfo.publicUrl) {
                items.push({
                    html: `<span style="color:#ccc; font-size:12px;"><span class="pc2-masked-value" data-real="${nodeInfo.publicUrl}">${domainDisplay}</span> <span class="pc2-copy-icon">${copyIcon}</span></span>`,
                    icon: `<svg style="width:14px;height:14px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`,
                    onClick: () => {
                        navigator.clipboard.writeText(nodeInfo.publicUrl);
                    }
                });
            }

            if (nodeInfo.localIp) {
                const localUrl = `http://${nodeInfo.localIp}:${window.location.port || '4200'}`;
                items.push({
                    html: `<span style="color:#ccc; font-size:12px;">IP: <span class="pc2-masked-value" data-real="${nodeInfo.localIp}">${ipDisplay}</span> <span class="pc2-copy-icon">${copyIcon}</span></span>`,
                    icon: `<svg style="width:14px;height:14px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
                    onClick: () => {
                        navigator.clipboard.writeText(localUrl);
                    }
                });
            }

            if (connectivity) {
                const natType = connectivity.natType || 'unknown';
                const isWireGuard = natType === 'wireguard';
                const isAmneziaWG = natType === 'amnezia-wireguard';
                const isVLESSReality = natType === 'vless-reality';
                const methodLabel = isVLESSReality ? 'VLESS Reality' : (isAmneziaWG ? 'AmneziaWG (Stealth)' : (isWireGuard ? 'WireGuard' : (natType === 'relay' ? 'Active Proxy' : (natType === 'direct' ? 'Direct' : natType))));
                const methodColor = isVLESSReality ? '#3b82f6' : (isAmneziaWG ? '#a78bfa' : (isWireGuard ? '#22c55e' : (natType === 'relay' ? '#f59e0b' : '#fff')));
                items.push({
                    html: `<span data-pc2-access style="color:#ccc; font-size:12px;">Access: <span style="color:${methodColor}; font-weight:500;">${methodLabel}</span></span>`,
                    icon: `<svg style="width:14px;height:14px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="${methodColor}" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
                    disabled: true
                });
            }
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
                html: `<span style="color: #aaa; font-size: 11px;">${i18n('storage_usage')}: ${formatBytes(stats.storage?.used || 0)} / ${formatBytes(stats.storage?.limit || 0)}</span>`,
                disabled: true
            });
            
            items.push({
                html: `<span style="color: #aaa; font-size: 11px;">${i18n('files_count')}: ${stats.files || 0}</span>`,
                disabled: true
            });
        }

        items.push('-');

        // Action buttons
        // SIMPLIFIED AUTH: In PC2 mode, "Connect" = Sign In (authentication)
        // Note: Sign Out removed - users can use Log Out from profile dropdown instead
        if (isPC2Mode) {
            if (effectiveStatus !== 'connected') {
                // Not authenticated - show sign in (triggers Particle Auth)
                items.push({
                    html: i18n('sign_in'),
                    onClick: () => {
                        // Trigger Particle Auth login
                        import('./UIWindowParticleLogin.js').then(({ default: UIWindowParticleLogin }) => {
                            UIWindowParticleLogin({ reload_on_success: true });
                        }).catch((err) => {
                            logger.error('[PC2]: Failed to open login:', err);
                        });
                    }
                });
            }
        } else {
            // Legacy mode: separate PC2 connection
            if (effectiveStatus === 'connected') {
                items.push({
                    html: i18n('disconnect'),
                    onClick: () => {
                        pc2Service.disconnect?.();
                    }
                });
            } else if (effectiveStatus !== 'connecting') {
                items.push({
                    html: i18n('connect_to_pc2'),
                    onClick: () => {
                        UIPC2SetupWizard({
                            onSuccess: () => {
                                logger.log('[PC2]: Connected via wizard');
                            },
                        });
                    }
                });
            }
        }

        items.push({
            html: i18n('pc2_settings'),
            icon: `<svg style="width:14px;height:14px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
            onClick: () => {
                import('./Settings/UIWindowSettings.js').then(({ default: UIWindowSettings }) => {
                    UIWindowSettings({ tab: 'pc2' });
                }).catch((err) => {
                    logger.error('[PC2]: Failed to open settings:', err);
                });
            }
        });

        return items;
    };

    // Insert status bar into toolbar and topbar
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

        // Insert before wallet button (to the left of wallet icon)
        const $walletBtn = $toolbar.find('.wallet-btn');
        if ($walletBtn.length > 0) {
            $walletBtn.before($statusBar);
        } else {
            // Fallback: insert before search button
        const $searchBtn = $toolbar.find('.search-btn');
        if ($searchBtn.length > 0) {
            $searchBtn.before($statusBar);
        } else {
                // Final fallback: insert before clock
            const $clock = $toolbar.find('#clock');
            if ($clock.length > 0) {
                $clock.before($statusBar);
            } else {
                $toolbar.append($statusBar);
                }
            }
        }

        // Also insert into top bar (full-width mode)
        const $topbar = $('.topbar');
        if ($topbar.length > 0) {
            const $topbarStatusBar = createStatusBar();
            const $topbarWallet = $topbar.find('.topbar-right .wallet-btn');
            if ($topbarWallet.length > 0) {
                $topbarWallet.before($topbarStatusBar);
            } else {
                $topbar.find('.topbar-right').prepend($topbarStatusBar);
            }
        }

        logger.log('[PC2]: Status bar inserted');

        // Update status display (updates all instances across toolbar and topbar)
        const updateStatus = (status, error) => {
            currentStatus = status;
            currentError = error;
            
            // SIMPLIFIED AUTH: In PC2 mode, check authentication status
            const isPC2Mode = window.api_origin && (
                window.api_origin.includes('127.0.0.1:4200') || 
                window.api_origin.includes('localhost:4200') ||
                window.location.origin === window.api_origin
            );
            
            let effectiveStatus = status;
            if (isPC2Mode && window.is_auth) {
                // In PC2 mode, use authentication status
                effectiveStatus = window.is_auth() ? 'connected' : 'disconnected';
            }
            
            const $allIndicators = $('.pc2-status-bar .pc2-status-indicator');
            $allIndicators.removeClass('disconnected connecting connected error');
            $allIndicators.addClass(effectiveStatus);

            const session = pc2Service.getSession?.() || {};
            let statusText = effectiveStatus === 'connected' ? (session.nodeName || i18n('connected')) :
                            effectiveStatus === 'connecting' ? i18n('connecting') :
                            effectiveStatus === 'error' ? (error || i18n('error')) : i18n('not_connected');
            
            // In PC2 mode, show authentication-based status
            if (isPC2Mode) {
                statusText = window.is_auth && window.is_auth() ? i18n('connected') : i18n('not_connected');
            }
            
            $('.pc2-status-bar').attr('title', `${i18n('personal_cloud_status')} (${statusText})`);
        };
        
        // Also listen for authentication changes in PC2 mode
        if (window.is_auth) {
            // Check auth status periodically and update
            const checkAuthStatus = () => {
                const isPC2Mode = window.api_origin && (
                    window.api_origin.includes('127.0.0.1:4200') || 
                    window.api_origin.includes('localhost:4200') ||
                    window.location.origin === window.api_origin
                );
                if (isPC2Mode) {
                    const isAuth = window.is_auth();
                    updateStatus(isAuth ? 'connected' : 'disconnected');
                }
            };
            
            // Check immediately
            checkAuthStatus();
            
            // Check on user object changes (login/logout events)
            const originalUser = window.user;
            const checkUserChange = setInterval(() => {
                if (window.user !== originalUser) {
                    checkAuthStatus();
                }
            }, 1000);
            
            // Also listen for login event
            $(document).on('login', checkAuthStatus);
            $(document).on('logout', checkAuthStatus);
        }

        // Subscribe to status changes
        if (pc2Service.onStatusChange) {
            pc2Service.onStatusChange(updateStatus);
        }

        logger.log('[PC2]: Status bar initialized');
    };

    // Initialize
    insertStatusBar();

    // Privacy toggle: update masked values and switch in-place
    $(document).on('click', '.pc2-privacy-toggle', function(e) {
        e.stopPropagation();
        e.preventDefault();
        privacyHidden = !privacyHidden;
        const $menu = $(this).closest('.context-menu');
        $menu.find('.pc2-masked-value').each(function() {
            const real = $(this).attr('data-real');
            $(this).text(privacyHidden ? maskValue(real) : real);
        });
        const $track = $(this).find('.pc2-toggle-track');
        const $knob = $track.children('span');
        $track.css('background', privacyHidden ? '#555' : '#22c55e');
        $knob.css({ left: privacyHidden ? '2px' : 'auto', right: privacyHidden ? 'auto' : '2px' });
    });

    const tLabels = { 'wireguard': ['WireGuard', '#22c55e'], 'amnezia-wireguard': ['AmneziaWG (Stealth)', '#a78bfa'], 'vless-reality': ['VLESS Reality', '#3b82f6'], 'relay': ['Active Proxy', '#f59e0b'] };

    // Floating tooltip for .pc2-tip elements (avoids overflow clipping)
    $(document).on('mouseenter', '.pc2-tip', function() {
        const tip = $(this).attr('data-tip');
        if (!tip) return;
        const rect = this.getBoundingClientRect();
        const $tip = $('<div id="pc2-floating-tip"></div>').text(tip).appendTo('body');
        const tipW = $tip.outerWidth();
        let left = rect.left + rect.width / 2 - tipW / 2;
        if (left < 8) left = 8;
        if (left + tipW > window.innerWidth - 8) left = window.innerWidth - 8 - tipW;
        $tip.css({ top: rect.top - $tip.outerHeight() - 6, left });
    });
    $(document).on('mouseleave', '.pc2-tip', function() {
        $('#pc2-floating-tip').remove();
    });

    // Prevent info icon clicks from toggling the parent switch
    $(document).on('click', '.pc2-info-icon', function(e) {
        e.stopPropagation();
        e.preventDefault();
    });

    async function applyStealthFromDropdown($menu) {
        if (!window.api_origin) return;
        const vlessOn = !!$menu.find('.pc2-vless-toggle').data('on');
        const transport = stealthModeEnabled ? (vlessOn ? 'vless-reality' : 'amnezia-wireguard') : undefined;
        $menu.find('[data-pc2-access]').html(`Access: <span style="color:#f59e0b; font-weight:500;">Switching...</span>`);
        $menu.find('[data-pc2-status]').html(`<span style="color:#f59e0b;">Reconnecting...</span>`);
        $menu.find('[data-pc2-status-dot] span').css('background', '#f59e0b');

        try {
            const resp = await fetch(`${window.api_origin}/api/boson/stealth-mode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.auth_token}` },
                body: JSON.stringify({ enabled: stealthModeEnabled, transport }),
            });
            if (!resp.ok) return;

            const expectedType = transport || 'wireguard';
            for (let i = 0; i < 10; i++) {
                await new Promise(r => setTimeout(r, 2000));
                try {
                    const r = await fetch(`${window.api_origin}/api/boson/connectivity`, {
                        headers: { 'Authorization': `Bearer ${window.auth_token}` }
                    });
                    if (r.ok) {
                        const d = await r.json();
                        if (d.natType === expectedType) {
                            const [label, color] = tLabels[d.natType] || [d.natType, '#fff'];
                            $menu.find('[data-pc2-access]').html(`Access: <span style="color:${color}; font-weight:500;">${label}</span>`);
                            $menu.find('[data-pc2-status]').html(`<span style="color:#fff;">Connected</span>`);
                            $menu.find('[data-pc2-status-dot] span').css('background', '#22c55e');
                            return;
                        }
                    }
                } catch {}
            }
            const fb = await fetch(`${window.api_origin}/api/boson/connectivity`, {
                headers: { 'Authorization': `Bearer ${window.auth_token}` }
            }).then(r => r.ok ? r.json() : null);
            if (fb) {
                const [label, color] = tLabels[fb.natType] || [fb.natType, '#fff'];
                $menu.find('[data-pc2-access]').html(`Access: <span style="color:${color}; font-weight:500;">${label}</span>`);
                $menu.find('[data-pc2-status]').html(`<span style="color:#fff;">${fb.connected ? 'Connected' : 'Disconnected'}</span>`);
                $menu.find('[data-pc2-status-dot] span').css('background', fb.connected ? '#22c55e' : '#ef4444');
            }
        } catch {}
    }

    // Stealth mode toggle handler
    $(document).on('click', '.pc2-stealth-toggle', function(e) {
        e.stopPropagation();
        e.preventDefault();
        stealthModeEnabled = !stealthModeEnabled;
        window._pc2Stealth.stealth = stealthModeEnabled;
        const $track = $(this).find('.pc2-stealth-track');
        const $knob = $(this).find('.pc2-stealth-knob');
        $track.css('background', stealthModeEnabled ? '#a78bfa' : '#555');
        $knob.css({ left: stealthModeEnabled ? 'auto' : '2px', right: stealthModeEnabled ? '2px' : 'auto' });

        if (!stealthModeEnabled) {
            vlessEnabled = false;
            window._pc2Stealth.vless = false;
        }

        const $menu = $(this).closest('.context-menu');
        $menu.find('.pc2-vless-row').toggle(stealthModeEnabled);
        applyStealthFromDropdown($menu);
    });

    // VLESS Reality sub-toggle handler
    $(document).on('click', '.pc2-vless-toggle', function(e) {
        e.stopPropagation();
        e.preventDefault();
        const isOn = !$(this).data('on');
        $(this).data('on', isOn);
        vlessEnabled = isOn;
        window._pc2Stealth.vless = isOn;
        const $track = $(this).find('.pc2-vless-track');
        const $knob = $(this).find('.pc2-vless-knob');
        $track.css('background', isOn ? '#3b82f6' : '#555');
        $knob.css({ left: isOn ? 'auto' : '2px', right: isOn ? '2px' : 'auto' });
        applyStealthFromDropdown($(this).closest('.context-menu'));
    });

    // Use delegated event for click - opens UIContextMenu
    $(document).on('click', '.pc2-status-bar', async function(e) {
        e.stopPropagation();
        e.preventDefault();
        
        const pos = this.getBoundingClientRect();
        
        // Close any existing PC2 menu
        if ($('.context-menu[data-id="pc2-menu"]').length > 0) {
            return;
        }

        // Fetch stats, node info, and connectivity in parallel
        let stats = null;
        let nodeInfo = null;
        let connectivity = null;

        const fetches = [];
        fetches.push(
            fetch(`${window.api_origin}/api/boson/full-identity`, {
                headers: { 'Authorization': `Bearer ${window.auth_token}` }
            }).then(r => r.ok ? r.json() : null).then(d => { nodeInfo = d; }).catch(() => {})
        );
        fetches.push(
            fetch(`${window.api_origin}/api/boson/connectivity`, {
                headers: { 'Authorization': `Bearer ${window.auth_token}` }
            }).then(r => r.ok ? r.json() : null).then(d => { connectivity = d; }).catch(() => {})
        );
        if (currentStatus === 'connected') {
            fetches.push(
                Promise.resolve(pc2Service.getStats?.()).then(s => { stats = s; }).catch(() => {})
            );
        }
        await Promise.all(fetches);

        UIContextMenu({
            id: 'pc2-menu',
            parent_element: $(this),
            position: { 
                top: pos.bottom + 10, 
                left: pos.left + (pos.width / 2) - 100
            },
            items: getMenuItems(stats, nodeInfo, connectivity)
        });

        // Read stealth state from connectivity on first open only
        if (connectivity && !window._pc2Stealth.initialized) {
            stealthModeEnabled = !!connectivity.stealthMode;
            vlessEnabled = connectivity.forcedTransport === 'vless-reality';
            window._pc2Stealth.stealth = stealthModeEnabled;
            window._pc2Stealth.vless = vlessEnabled;
            window._pc2Stealth.initialized = true;
        }

        // Inject toggles directly into the menu DOM (not as menu items)
        requestAnimationFrame(() => {
            const $menu = $('.context-menu[data-id="pc2-menu"]');
            if (!$menu.length) return;

            const $lastDivider = $menu.find('.context-menu-divider').last();

            if (nodeInfo) {
                const toggleOn = !privacyHidden;
                const privacyHtml = `<div class="pc2-privacy-toggle" style="display:flex; align-items:center; justify-content:space-between; padding:6px 12px; cursor:pointer; user-select:none;">
                    <span style="color:#fff; font-size:12px;">Show details</span>
                    <span class="pc2-toggle-track" style="width:34px; height:18px; border-radius:9px; background:${toggleOn ? '#22c55e' : '#555'}; position:relative; display:inline-flex; align-items:center; flex-shrink:0;">
                        <span class="pc2-toggle-knob" style="width:14px; height:14px; border-radius:50%; background:#fff; position:absolute; top:2px; ${toggleOn ? 'right:2px;' : 'left:2px;'} transition:all 0.2s;"></span>
                    </span>
                </div>`;
                if ($lastDivider.length) {
                    $lastDivider.before(privacyHtml);
                } else {
                    $menu.append(privacyHtml);
                }
            }

            const stealthOn = stealthModeEnabled;
            const vlessOn = vlessEnabled;
            const stealthTip = 'Routes traffic through obfuscated tunnels to bypass Deep Packet Inspection (DPI). Auto-detects blocking and selects the best stealth transport.';
            const vlessTip = 'Wraps your connection in a TLS tunnel that mimics HTTPS traffic to legitimate websites (e.g. microsoft.com). Use when all UDP is blocked.';

            const stealthHtml = `<div class="pc2-stealth-toggle" style="display:flex; align-items:center; justify-content:space-between; padding:6px 12px; cursor:pointer; user-select:none;">
                <span style="color:#fff; font-size:12px; display:flex; align-items:center;">Stealth Mode<span class="pc2-tip pc2-info-icon" data-tip="${stealthTip}"><svg style="width:12px;height:12px;opacity:0.4;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></span></span>
                <span class="pc2-stealth-track" style="width:34px; height:18px; border-radius:9px; background:${stealthOn ? '#a78bfa' : '#555'}; position:relative; display:inline-flex; align-items:center; flex-shrink:0;">
                    <span class="pc2-stealth-knob" style="width:14px; height:14px; border-radius:50%; background:#fff; position:absolute; top:2px; ${stealthOn ? 'right:2px;' : 'left:2px;'} transition:all 0.2s;"></span>
                </span>
            </div>`;

            const vlessHtml = `<div class="pc2-vless-row" style="display:${stealthOn ? 'flex' : 'none'}; align-items:center; justify-content:space-between; padding:6px 12px; cursor:pointer; user-select:none;">
                <div class="pc2-vless-toggle" data-on="${vlessOn ? 'true' : ''}" style="display:flex; align-items:center; justify-content:space-between; width:100%;">
                    <span style="color:#fff; font-size:12px; display:flex; align-items:center;">VLESS Reality<span class="pc2-tip pc2-info-icon" data-tip="${vlessTip}"><svg style="width:12px;height:12px;opacity:0.4;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></span></span>
                    <span class="pc2-vless-track" style="width:34px; height:18px; border-radius:9px; background:${vlessOn ? '#3b82f6' : '#555'}; position:relative; display:inline-flex; align-items:center; flex-shrink:0;">
                        <span class="pc2-vless-knob" style="width:14px; height:14px; border-radius:50%; background:#fff; position:absolute; top:2px; ${vlessOn ? 'right:2px;' : 'left:2px;'} transition:all 0.2s;"></span>
                    </span>
                </div>
            </div>`;

            if ($lastDivider.length) {
                $lastDivider.before(stealthHtml);
                $lastDivider.before(vlessHtml);
            } else {
                $menu.append(stealthHtml);
                $menu.append(vlessHtml);
            }
        });
    });

    // Auto-reconnect if we have saved config (silent mode - no signature prompts)
    setTimeout(async () => {
        if (pc2Service.isConfigured?.() && !pc2Service.isConnected?.()) {
            logger.log('[PC2]: Auto-reconnecting to saved PC2 node (silent mode)...');
            try {
                // Use silentMode=true so we don't prompt for signatures
                // If session is invalid, user will need to manually reconnect
                const result = await pc2Service.authenticate?.(pc2Service.getNodeUrl?.(), true, true);
                if (result?.success) {
                    logger.log('[PC2]: Auto-reconnect successful');
                } else {
                    logger.log('[PC2]: Auto-reconnect skipped - session expired, manual reconnect needed');
                }
            } catch (err) {
                logger.log('[PC2]: Auto-reconnect failed:', err.message);
            }
        }
    }, 2000); // Wait 2 seconds after desktop loads
}

export default initPC2StatusBar;
