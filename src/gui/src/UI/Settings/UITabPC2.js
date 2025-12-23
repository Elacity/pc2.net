/**
 * Copyright (C) 2024-present Elacity
 *
 * Personal Cloud (PC2) Settings Tab
 * 
 * Consolidated tab for all personal cloud functionality:
 * - Connection status & node management
 * - Storage stats
 * - Files & encryption
 * - Access control (trusted wallets)
 */

import { getPC2Service } from '../../services/PC2ConnectionService.js';
import { createLogger } from '../../helpers/logger.js';
import UIWindow from '../UIWindow.js';

const logger = createLogger('PC2Settings');

// Check if we're in PC2 mode (self-hosted) - must be at module level for access in on_show
function isPC2Mode() {
    return window.api_origin && (
        window.api_origin.includes('127.0.0.1:4200') || 
        window.api_origin.includes('localhost:4200') ||
        window.api_origin.includes('127.0.0.1:4202') ||
        window.api_origin.includes('localhost:4202') ||
        window.location.origin === window.api_origin
    );
}

export default {
    id: 'pc2',
    title_i18n_key: 'personal_cloud',
    icon: 'cloud.svg',
    html: () => {
        return `
            <h1>Personal Cloud</h1>
            
            <!-- Connection Status -->
            <div class="settings-card">
                <strong>Connection</strong>
                <div style="flex-grow:1; text-align: right; display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
                    <span class="pc2-status-dot" id="pc2-status-dot"></span>
                    <span id="pc2-status-text" style="font-size: 13px;">Not Connected</span>
                </div>
            </div>
            
            <!-- Not Connected State -->
            <div id="pc2-not-connected" style="display: none;">
                <div class="pc2-connect-card">
                    <p>
                        Connect to your Personal Cloud node to store files on your own hardware using decentralized identity.
                    </p>
                    <button class="button pc2-btn-primary" id="pc2-connect-btn">
                        Connect to PC2
                    </button>
                </div>
            </div>
            
            <!-- Connected State -->
            <div id="pc2-connected" style="display: none;">
                
                <!-- Node Info -->
                <div class="settings-card">
                    <strong>Node</strong>
                    <div style="flex-grow:1; text-align: right;">
                        <span id="pc2-node-name" style="font-size: 13px;">-</span>
                    </div>
                </div>
                
                <div class="settings-card">
                    <strong>Your Wallet</strong>
                    <div style="flex-grow:1; text-align: right;">
                        <span id="pc2-wallet" style="font-size: 12px; font-family: monospace;">-</span>
                    </div>
                </div>
                
                <!-- Storage Section -->
                <h2 style="font-size: 15px; margin: 20px 0 10px; color: #333;">Storage</h2>
                
                <div class="settings-card">
                    <strong>Used</strong>
                    <div style="flex-grow:1; text-align: right;">
                        <span id="pc2-storage-used" style="font-size: 13px;">-</span>
                        <span style="color: #999; font-size: 12px;"> of </span>
                        <span id="pc2-storage-limit" style="font-size: 13px;">-</span>
                    </div>
                </div>
                
                <div id="pc2-storage-bar-wrapper" style="padding: 0 15px; margin-bottom: 15px;">
                    <div style="background: #e5e7eb; border-radius: 4px; height: 8px; overflow: hidden;">
                        <div id="pc2-storage-bar" style="background: #3b82f6; height: 100%; width: 0%; transition: width 0.3s;"></div>
                    </div>
                </div>
                
                <div class="settings-card">
                    <strong>Files Stored</strong>
                    <div style="flex-grow:1; text-align: right;">
                        <span id="pc2-files-count" style="font-size: 13px;">-</span>
                    </div>
                </div>
                
                <div class="settings-card">
                    <strong>Encrypted Files</strong>
                    <div style="flex-grow:1; text-align: right;">
                        <span id="pc2-encrypted-count" style="font-size: 13px;">-</span>
                    </div>
                </div>
                
                <!-- Backup & Restore Section -->
                <div style="display: flex; align-items: center; gap: 8px; margin: 20px 0 10px;">
                    <h2 style="font-size: 15px; margin: 0; color: #333;">Backup & Restore</h2>
                    <span id="pc2-backup-help" style="cursor: pointer; font-size: 12px; color: #6b7280; text-decoration: underline; text-decoration-style: dotted; display: inline-flex; align-items: center; gap: 4px;" title="Click for backup help">
                        ${window.icons && window.icons['question.svg'] ? `<img src="${window.icons['question.svg']}" style="width: 14px; height: 14px; vertical-align: middle;">` : ''}
                        Help
                    </span>
                </div>
                
                <div class="pc2-backup-card">
                    <div class="pc2-backup-header">
                        <strong>Backups</strong>
                        <button class="button pc2-btn-primary" id="pc2-create-backup-btn" title="Create a new backup of your PC2 node data">
                            <span style="margin-right: 4px;">+</span> Create Backup
                        </button>
                    </div>
                    
                    <!-- Backup Status Indicator -->
                    <div id="pc2-backup-status-indicator" style="display: none; margin: 10px 0; padding: 10px; background: #f9fafb; border-radius: 4px; font-size: 12px; border-left: 3px solid #9ca3af;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <span id="pc2-backup-status-icon" style="display: inline-flex; align-items: center;">
                                ${window.icons && window.icons['warning-sign.svg'] ? `<img src="${window.icons['warning-sign.svg']}" style="width: 16px; height: 16px;">` : ''}
                            </span>
                            <strong id="pc2-backup-status-text">No backups yet</strong>
                        </div>
                        <div id="pc2-backup-status-details" style="color: #6b7280; font-size: 11px; margin-left: 24px;"></div>
                    </div>
                    
                    <!-- Off-Server Storage Warning -->
                    <div class="pc2-backup-warning" style="margin: 10px 0; padding: 10px; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 4px; font-size: 12px; color: #92400e;">
                        <div style="display: flex; align-items: start; gap: 8px;">
                            <span style="flex-shrink: 0; display: inline-flex; align-items: center;">
                                ${window.icons && window.icons['warning-sign.svg'] ? `<img src="${window.icons['warning-sign.svg']}" style="width: 18px; height: 18px;">` : ''}
                            </span>
                            <div>
                                <strong style="display: block; margin-bottom: 4px;">Important: Download Backups to External Device</strong>
                                <div style="font-size: 11px; line-height: 1.4;">
                                    Backups stored on the same server will be lost if the server fails. Always download backups to your laptop, external drive, or another server to keep them safe.
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div id="pc2-backup-status" style="display: none; margin: 10px 0; padding: 8px; background: #f0f9ff; border-radius: 4px; font-size: 12px; color: #0369a1;"></div>
                    
                    <div id="pc2-backups-list" style="margin-top: 12px;">
                        <span style="color: #888; font-size: 13px;">Loading...</span>
                    </div>
                </div>
                
                <!-- Restore from Backup Section -->
                <div class="pc2-backup-card" style="margin-top: 30px;">
                    <div class="pc2-backup-header">
                        <strong>Restore from Backup</strong>
                    </div>
                    
                    <div style="margin: 15px 0;">
                        <p style="margin: 0 0 12px; font-size: 13px; color: #4b5563; line-height: 1.5;">
                            Upload a backup file to restore your PC2 node data. This will replace all current data with the backup.
                        </p>
                        
                        <div id="pc2-restore-upload-area" style="border: 2px dashed #d1d5db; border-radius: 8px; padding: 30px; text-align: center; background: #f9fafb; cursor: pointer; transition: all 0.2s;" 
                             onmouseover="this.style.borderColor='#3b82f6'; this.style.background='#eff6ff';" 
                             onmouseout="this.style.borderColor='#d1d5db'; this.style.background='#f9fafb';">
                            <input type="file" id="pc2-restore-file-input" accept=".tar.gz" style="display: none;">
                            <div style="margin-bottom: 8px;">
                                ${window.icons && window.icons['cloud.svg'] ? `<img src="${window.icons['cloud.svg']}" style="width: 32px; height: 32px; opacity: 0.6; margin-bottom: 8px;">` : '📁'}
                            </div>
                            <div style="font-size: 14px; color: #374151; margin-bottom: 4px;">
                                <strong>Click to select backup file</strong> or drag and drop
                            </div>
                            <div style="font-size: 12px; color: #6b7280;">
                                Backup files must be .tar.gz format
                            </div>
                        </div>
                        
                        <div id="pc2-restore-file-info" style="display: none; margin-top: 12px; padding: 12px; background: #f0f9ff; border-radius: 6px; border-left: 3px solid #3b82f6;">
                            <div style="display: flex; align-items: center; justify-content: space-between;">
                                <div>
                                    <div style="font-size: 13px; font-weight: 500; color: #1e40af; margin-bottom: 4px;" id="pc2-restore-filename"></div>
                                    <div style="font-size: 11px; color: #6b7280;" id="pc2-restore-filesize"></div>
                                </div>
                                <button id="pc2-restore-clear-btn" style="background: none; border: none; color: #6b7280; cursor: pointer; font-size: 18px; padding: 0 8px;" title="Clear selection">×</button>
                            </div>
                        </div>
                        
                        <button id="pc2-restore-btn" class="button pc2-btn-primary" style="width: 100%; margin-top: 12px; display: none;" disabled>
                            <span id="pc2-restore-btn-text">Start Restore</span>
                        </button>
                        
                        <div id="pc2-restore-progress" style="display: none; margin-top: 12px;">
                            <div style="background: #e5e7eb; border-radius: 4px; height: 8px; overflow: hidden;">
                                <div id="pc2-restore-progress-bar" style="background: #3b82f6; height: 100%; width: 0%; transition: width 0.3s;"></div>
                            </div>
                            <div id="pc2-restore-progress-text" style="font-size: 12px; color: #6b7280; margin-top: 6px; text-align: center;">Uploading...</div>
                        </div>
                        
                        <div id="pc2-restore-status" style="display: none; margin-top: 12px; padding: 12px; border-radius: 6px; font-size: 13px;"></div>
                    </div>
                </div>
                
                <!-- Access Control Section -->
                <h2 style="font-size: 15px; margin: 20px 0 10px; color: #333;">Access Control</h2>
                
                <div class="pc2-access-control-card">
                    <div class="pc2-access-header">
                        <strong>Trusted Wallets</strong>
                        <button class="button" id="pc2-invite-btn">
                            <span style="margin-right: 4px;">+</span> Invite
                        </button>
                    </div>
                    
                    <!-- Inline invite form (hidden by default) -->
                    <div id="pc2-invite-form" class="pc2-invite-form">
                        <div style="margin-bottom: 8px; font-size: 13px; color: #374151;">Enter wallet address to invite:</div>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" id="pc2-invite-input" placeholder="0x..." />
                            <button class="button pc2-btn-primary" id="pc2-invite-confirm">Add</button>
                            <button class="button" id="pc2-invite-cancel">Cancel</button>
                        </div>
                        <div id="pc2-invite-error" class="pc2-error-text"></div>
                    </div>
                    
                    <div id="pc2-wallets-list">
                        <span style="color: #888; font-size: 13px;">Loading...</span>
                    </div>
                </div>
                
                <!-- Actions -->
                <div style="display: flex; gap: 10px; margin-top: 20px; padding: 0 15px 30px;">
                    <button class="button" id="pc2-disconnect-btn">Disconnect</button>
                    <button class="button" id="pc2-forget-btn" style="background: #fee2e2; color: #dc2626; border-color: #fecaca;">Forget Node</button>
                </div>
            </div>
            
            <style>
                /* Status Dot - inline next to text */
                .pc2-status-dot {
                    display: inline-block;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #9ca3af;
                }
                .pc2-status-dot.connected {
                    background: #22c55e;
                    box-shadow: 0 0 4px #22c55e;
                }
                .pc2-status-dot.disconnected {
                    background: #f59e0b;
                }
                .pc2-status-dot.connecting {
                    background: #f59e0b;
                    animation: pc2-pulse 1s infinite;
                }
                @keyframes pc2-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                
                /* Connect Card - Not Connected State */
                .pc2-connect-card {
                    margin: 0 15px 20px;
                    padding: 20px;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    background: #f9fafb;
                }
                .pc2-connect-card p {
                    margin: 0 0 15px;
                    font-size: 13px;
                    color: #666;
                    line-height: 1.5;
                }
                
                /* Access Control Card - Dynamic height */
                .pc2-access-control-card {
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    background: #fff;
                    padding: 15px;
                    margin: 0 15px;
                }
                .pc2-access-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }
                .pc2-access-header .button {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 6px 14px;
                    font-size: 13px;
                }
                
                /* Invite Form */
                .pc2-invite-form {
                    display: none;
                    margin-bottom: 12px;
                    padding: 12px;
                    background: #f3f4f6;
                    border-radius: 6px;
                }
                .pc2-invite-form input {
                    flex: 1;
                    padding: 8px 12px;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    font-size: 13px;
                    font-family: monospace;
                }
                .pc2-invite-form .button {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 8px 16px;
                    font-size: 13px;
                    min-width: 70px;
                }
                
                /* Primary Button */
                .pc2-btn-primary {
                    background: #3b82f6 !important;
                    color: white !important;
                    border: none !important;
                }
                .pc2-error-text {
                    margin-top: 8px;
                    font-size: 12px;
                    color: #dc2626;
                }
                
                /* Wallet Items */
                .pc2-wallet-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 10px 0;
                    border-bottom: 1px solid #e5e7eb;
                }
                .pc2-wallet-item:last-child {
                    border-bottom: none;
                }
                .pc2-wallet-badge {
                    font-size: 10px;
                    padding: 2px 6px;
                    border-radius: 4px;
                    background: #fef3c7;
                    color: #92400e;
                    font-weight: 600;
                    margin-left: 8px;
                }
                .pc2-wallet-revoke {
                    background: none;
                    border: none;
                    color: #dc2626;
                    cursor: pointer;
                    font-size: 12px;
                    padding: 4px 8px;
                }
                .pc2-wallet-revoke:hover {
                    background: #fee2e2;
                    border-radius: 4px;
                }
                
                /* Backup Card */
                .pc2-backup-card {
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    background: #fff;
                    padding: 15px;
                    margin: 0 15px;
                }
                .pc2-backup-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }
                .pc2-backup-header .button {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 6px 14px;
                    font-size: 13px;
                }
                .pc2-backup-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 10px 0;
                    border-bottom: 1px solid #e5e7eb;
                }
                .pc2-backup-item:last-child {
                    border-bottom: none;
                }
                .pc2-backup-info {
                    flex: 1;
                    min-width: 0;
                }
                .pc2-backup-name {
                    font-size: 13px;
                    font-weight: 500;
                    margin-bottom: 4px;
                    word-break: break-all;
                }
                .pc2-backup-meta {
                    font-size: 11px;
                    color: #6b7280;
                    display: flex;
                    gap: 12px;
                }
                .pc2-backup-actions {
                    display: flex;
                    gap: 8px;
                    margin-left: 12px;
                }
                .pc2-backup-btn {
                    padding: 6px 12px;
                    font-size: 12px;
                    border: 1px solid #d1d5db;
                    background: #fff;
                    border-radius: 4px;
                    cursor: pointer;
                }
                .pc2-backup-btn:hover {
                    background: #f9fafb;
                }
                .pc2-backup-btn.download {
                    color: #3b82f6;
                    border-color: #3b82f6;
                }
                .pc2-backup-btn.delete {
                    color: #dc2626;
                    border-color: #dc2626;
                }
                .pc2-backup-btn.delete:hover {
                    background: #fee2e2;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            </style>
        `;
    },
    init: async function($el_window) {
        const pc2Service = getPC2Service();
        
        const $statusDot = $el_window.find('#pc2-status-dot');
        const $statusText = $el_window.find('#pc2-status-text');
        const $connected = $el_window.find('#pc2-connected');
        const $notConnected = $el_window.find('#pc2-not-connected');
        
        // Format bytes helper
        function formatBytes(bytes) {
            if (!bytes || bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        // isPC2Mode is now defined at module level (above) for access in on_show
        
        // Get auth token for PC2 mode API calls
        function getAuthToken() {
            // Try window.auth_token first (most reliable - set by SDK)
            if (window.auth_token) {
                return window.auth_token;
            }
            // Try PC2 service session
            const session = pc2Service.getSession?.();
            if (session?.token) {
                return session.token;
            }
            // Fallback to localStorage
            try {
                const savedSession = localStorage.getItem('pc2_session');
                if (savedSession) {
                    const sessionData = JSON.parse(savedSession);
                    return sessionData.session?.token || null;
                }
            } catch (e) {
                // Ignore localStorage errors
            }
            return null;
        }
        
        // Update UI based on connection status
        async function updateUI() {
            // SIMPLIFIED AUTH: In PC2 mode, connection status = authentication status
            const pc2Mode = isPC2Mode();
            
            // In PC2 mode, use authentication status; otherwise use service connection status
            let isConnected;
            if (pc2Mode) {
                isConnected = window.is_auth && window.is_auth() || false;
            } else {
                isConnected = pc2Service.isConnected?.() || false;
            }
            
            const isConfigured = pc2Service.isConfigured?.() || false;
            
            if (isConnected) {
                $statusDot.removeClass('disconnected connecting').addClass('connected');
                $statusText.text('Connected');
                $connected.show();
                $notConnected.hide();
                
                // Populate node info
                const session = pc2Service.getSession?.() || {};
                // In PC2 mode, show "This PC2 Node" to match status bar
                const nodeName = pc2Mode ? 'This PC2 Node' : (session.nodeName || 'My PC2 Node');
                $el_window.find('#pc2-node-name').text(nodeName);
                $el_window.find('#pc2-wallet').text(
                    window.user?.wallet_address 
                        ? `${window.user.wallet_address.slice(0, 6)}...${window.user.wallet_address.slice(-4)}`
                        : '-'
                );
                
                // Load all data
                await Promise.all([
                    loadStorageStats(),
                    loadWallets(),
                    loadBackups()
                ]);
            } else {
                $statusDot.removeClass('connected connecting').addClass('disconnected');
                $statusText.text(isConfigured ? 'Disconnected' : 'Not Configured');
                $connected.hide();
                $notConnected.show();
            }
        }
        
        // Load storage stats from PC2
        async function loadStorageStats() {
            try {
                let stats;
                // In PC2 mode, use direct fetch (we're already on the node)
                if (isPC2Mode() && window.api_origin) {
                    try {
                        const url = new URL('/api/stats', window.api_origin);
                        const authToken = getAuthToken();
                        const headers = {
                            'Content-Type': 'application/json'
                        };
                        if (authToken) {
                            headers['Authorization'] = `Bearer ${authToken}`;
                        }
                        
                        logger.log('[PC2Tab] Fetching stats from:', url.toString());
                        const response = await fetch(url.toString(), {
                            method: 'GET',
                            headers
                        });
                        
                        if (response.ok) {
                            stats = await response.json();
                            logger.log('[PC2Tab] Stats loaded successfully:', stats);
                        } else {
                            const errorText = await response.text().catch(() => '');
                            logger.error('[PC2Tab] Stats request failed:', response.status, response.statusText, errorText);
                            // Try without auth token if first attempt failed
                            if (authToken && response.status === 401) {
                                logger.log('[PC2Tab] Retrying without auth token...');
                                const retryResponse = await fetch(url.toString(), {
                                    method: 'GET',
                                    headers: { 'Content-Type': 'application/json' }
                                });
                                if (retryResponse.ok) {
                                    stats = await retryResponse.json();
                                    logger.log('[PC2Tab] Stats loaded without auth:', stats);
                                }
                            }
                        }
                    } catch (fetchError) {
                        logger.error('[PC2Tab] Fetch error:', fetchError);
                        throw fetchError;
                    }
                } else {
                    // Legacy mode: use service method
                    stats = await pc2Service.getStats?.();
                }
                
                if (stats) {
                    const used = stats.storageUsed || stats.storage?.used || 0;
                    const limit = stats.storageLimit || stats.storage?.limit || 10 * 1024 * 1024 * 1024;
                    const files = stats.filesCount || stats.files || 0;
                    const encrypted = stats.encryptedCount || 0;
                    
                    logger.log('[PC2Tab] Parsed stats - used:', used, 'limit:', limit, 'files:', files);
                    
                    $el_window.find('#pc2-storage-used').text(formatBytes(used));
                    $el_window.find('#pc2-storage-limit').text(formatBytes(limit));
                    $el_window.find('#pc2-files-count').text(files);
                    $el_window.find('#pc2-encrypted-count').text(encrypted);
                    
                    // Update progress bar
                    const percent = Math.min(100, (used / limit) * 100);
                    $el_window.find('#pc2-storage-bar').css('width', `${percent}%`);
                } else {
                    logger.warn('[PC2Tab] No stats data received');
                }
            } catch (error) {
                logger.error('[PC2Tab] Failed to load storage stats:', error);
                $el_window.find('#pc2-storage-used').text('-');
                $el_window.find('#pc2-storage-limit').text('-');
                $el_window.find('#pc2-files-count').text('-');
                $el_window.find('#pc2-encrypted-count').text('-');
            }
        }
        
        // Update backup status indicator
        function updateBackupStatusIndicator(backups) {
            const $indicator = $el_window.find('#pc2-backup-status-indicator');
            const $icon = $el_window.find('#pc2-backup-status-icon');
            const $text = $el_window.find('#pc2-backup-status-text');
            const $details = $el_window.find('#pc2-backup-status-details');
            
            if (backups.length === 0) {
                $indicator.css('border-left-color', '#f59e0b').show();
                $icon.text('⚠️');
                $text.text('No backups yet');
                $details.text('Create your first backup to protect your data. Remember to download it to an external device.');
                return;
            }
            
            // Sort backups by date (newest first)
            const sortedBackups = [...backups].sort((a, b) => new Date(b.created) - new Date(a.created));
            const latestBackup = sortedBackups[0];
            const latestDate = new Date(latestBackup.created);
            const now = new Date();
            const daysSinceBackup = Math.floor((now - latestDate) / (1000 * 60 * 60 * 24));
            
            // Determine health status
            let statusColor = '#22c55e'; // Green
            let statusIconHtml = '';
            let statusText = 'Backup up to date';
            let statusDetails = '';
            
            // Get icon HTML helper
            const getIconHtml = (iconName, size = 16) => {
                return window.icons && window.icons[iconName] 
                    ? `<img src="${window.icons[iconName]}" style="width: ${size}px; height: ${size}px; vertical-align: middle;">`
                    : '';
            };
            
            if (daysSinceBackup === 0) {
                statusText = 'Backed up today';
                statusIconHtml = getIconHtml('checkmark.svg', 16);
                statusDetails = `Latest backup: ${latestDate.toLocaleDateString()} at ${latestDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            } else if (daysSinceBackup === 1) {
                statusText = 'Backed up yesterday';
                statusIconHtml = getIconHtml('checkmark.svg', 16);
                statusDetails = `Latest backup: ${latestDate.toLocaleDateString()} at ${latestDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            } else if (daysSinceBackup <= 7) {
                statusText = `Backed up ${daysSinceBackup} days ago`;
                statusIconHtml = getIconHtml('checkmark.svg', 16);
                statusDetails = `Latest backup: ${latestDate.toLocaleDateString()} at ${latestDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            } else if (daysSinceBackup <= 30) {
                statusColor = '#f59e0b'; // Yellow
                statusIconHtml = getIconHtml('warning-sign.svg', 16);
                statusText = `Last backup ${daysSinceBackup} days ago`;
                statusDetails = `Latest backup: ${latestDate.toLocaleDateString()}. Consider creating a new backup soon.`;
            } else {
                statusColor = '#dc2626'; // Red
                statusIconHtml = getIconHtml('danger.svg', 16);
                statusText = `Last backup ${daysSinceBackup} days ago`;
                statusDetails = `Latest backup: ${latestDate.toLocaleDateString()}. Your data may be at risk - create a backup now!`;
            }
            
            $indicator.css('border-left-color', statusColor).show();
            $icon.html(statusIconHtml);
            $text.text(statusText);
            $details.html(statusDetails);
        }
        
        // Load backups
        async function loadBackups() {
            const $list = $el_window.find('#pc2-backups-list');
            const $status = $el_window.find('#pc2-backup-status');
            $status.hide();
            
            try {
                if (!isPC2Mode() || !window.api_origin) {
                    $list.html('<span style="color: #888; font-size: 13px;">Backup management only available on PC2 nodes</span>');
                    $el_window.find('#pc2-backup-status-indicator').hide();
                    return;
                }
                
                const url = new URL('/api/backups', window.api_origin);
                const authToken = getAuthToken();
                const headers = {
                    'Content-Type': 'application/json'
                };
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }
                
                const response = await fetch(url.toString(), {
                    method: 'GET',
                    headers
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to load backups: ${response.status}`);
                }
                
                const data = await response.json();
                const backups = data.backups || [];
                
                // Update status indicator
                updateBackupStatusIndicator(backups);
                
                if (backups.length === 0) {
                    $list.html('<span style="color: #888; font-size: 13px;">No backups yet. Create your first backup to get started.</span>');
                    return;
                }
                
                $list.empty();
                // Sort backups by date (newest first)
                const sortedBackups = [...backups].sort((a, b) => new Date(b.created) - new Date(a.created));
                
                sortedBackups.forEach(backup => {
                    const size = formatBytes(backup.size);
                    const date = new Date(backup.created);
                    const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    
                    const $item = $(`
                        <div class="pc2-backup-item">
                            <div class="pc2-backup-info">
                                <div class="pc2-backup-name">${backup.filename}</div>
                                <div class="pc2-backup-meta">
                                    <span>${size}</span>
                                    <span>${dateStr}</span>
                                </div>
                            </div>
                            <div class="pc2-backup-actions">
                                <button class="pc2-backup-btn download" data-filename="${backup.filename}" title="Download backup to your local device for safe storage">Download</button>
                                <button class="pc2-backup-btn delete" data-filename="${backup.filename}" title="Delete this backup from the server">Delete</button>
                            </div>
                        </div>
                    `);
                    $list.append($item);
                });
                
                // Download handler
                $list.find('.pc2-backup-btn.download').on('click', async function() {
                    const filename = $(this).data('filename');
                    const $btn = $(this);
                    const originalText = $btn.text();
                    
                    $btn.prop('disabled', true).text('Downloading...');
                    
                    try {
                        const authToken = getAuthToken();
                        const downloadUrl = new URL(`/api/backups/download/${filename}`, window.api_origin);
                        
                        if (authToken) {
                            downloadUrl.searchParams.set('token', authToken);
                        }
                        
                        // Open download in new window/tab
                        window.open(downloadUrl.toString(), '_blank');
                        
                        // Show success message
                        const $status = $el_window.find('#pc2-backup-status');
                        $status.html(
                            '✅ <strong>Download Started</strong><br>' +
                            '<div style="margin-top: 6px; font-size: 11px; line-height: 1.4;">' +
                            'The backup file is downloading. Save it to an external device (laptop, external drive, or another server) to keep it safe from server failures.' +
                            '</div>'
                        ).css('background', '#f0fdf4').css('color', '#166534').css('border', '1px solid #86efac').show();
                        
                        // Hide message after 10 seconds
                        setTimeout(() => {
                            $status.fadeOut();
                        }, 10000);
                    } catch (error) {
                        alert('Failed to download backup: ' + error.message);
                    } finally {
                        $btn.prop('disabled', false).text(originalText);
                    }
                });
                
                // Delete handler
                $list.find('.pc2-backup-btn.delete').on('click', async function() {
                    const filename = $(this).data('filename');
                    if (!confirm(`Delete backup "${filename}"? This cannot be undone.`)) {
                        return;
                    }
                    
                    const $btn = $(this);
                    $btn.prop('disabled', true).text('Deleting...');
                    
                    try {
                        const url = new URL(`/api/backups/${filename}`, window.api_origin);
                        const authToken = getAuthToken();
                        const headers = {
                            'Content-Type': 'application/json'
                        };
                        if (authToken) {
                            headers['Authorization'] = `Bearer ${authToken}`;
                        }
                        
                        const response = await fetch(url.toString(), {
                            method: 'DELETE',
                            headers
                        });
                        
                        if (!response.ok) {
                            throw new Error(`Failed to delete: ${response.status}`);
                        }
                        
                        // Show success message
                        const $status = $el_window.find('#pc2-backup-status');
                        $status.html(
                            '✅ <strong>Backup Deleted</strong><br>' +
                            '<div style="margin-top: 6px; font-size: 11px;">' +
                            `Backup "${filename}" has been deleted from the server.` +
                            '</div>'
                        ).css('background', '#f0fdf4').css('color', '#166534').css('border', '1px solid #86efac').show();
                        
                        // Hide message after 5 seconds
                        setTimeout(() => {
                            $status.fadeOut();
                        }, 5000);
                        
                        // Reload backups list
                        loadBackups();
                    } catch (error) {
                        alert('Failed to delete backup: ' + error.message);
                    } finally {
                        $btn.prop('disabled', false).text('Delete');
                    }
                });
            } catch (error) {
                logger.error('[PC2Tab] Failed to load backups:', error);
                $list.html('<span style="color: #dc2626; font-size: 13px;">Failed to load backups: ' + error.message + '</span>');
            }
        }
        
        // Create backup
        async function createBackup() {
            const $status = $el_window.find('#pc2-backup-status');
            const $btn = $el_window.find('#pc2-create-backup-btn');
            
            if (!isPC2Mode() || !window.api_origin) {
                alert('Backup creation only available on PC2 nodes. Use the terminal command: npm run backup');
                return;
            }
            
            const loadingIcon = window.icons && window.icons['clock.svg']
                ? `<img src="${window.icons['clock.svg']}" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; display: inline-block; animation: spin 1s linear infinite;">`
                : '';
            $btn.prop('disabled', true).html(loadingIcon + 'Creating...');
            $status.hide();
            
            try {
                const url = new URL('/api/backups/create', window.api_origin);
                const authToken = getAuthToken();
                const headers = {
                    'Content-Type': 'application/json'
                };
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }
                
                const response = await fetch(url.toString(), {
                    method: 'POST',
                    headers
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: `Failed: ${response.status}` }));
                    throw new Error(errorData.error || `Failed: ${response.status}`);
                }
                
                const result = await response.json();
                
                // Show success message with clear instructions
                const successIcon = window.icons && window.icons['checkmark.svg'] 
                    ? `<img src="${window.icons['checkmark.svg']}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 6px; display: inline-block;">`
                    : '✅ ';
                const successMessage = result.message || 'Backup creation started successfully.';
                $status.html(
                    successIcon + '<strong>Backup Started</strong><br>' +
                    '<div style="margin-top: 6px; font-size: 11px; line-height: 1.4;">' +
                    successMessage + ' The backup list will update automatically when the backup is ready. ' +
                    '<strong>Remember to download the backup to an external device for safe storage.</strong>' +
                    '</div>'
                ).css('background', '#f0fdf4').css('color', '#166534').css('border', '1px solid #86efac').show();
                
                // Poll for new backup (check every 3 seconds for up to 2 minutes)
                let attempts = 0;
                const maxAttempts = 40; // 40 * 3 seconds = 2 minutes
                const pollInterval = setInterval(() => {
                    attempts++;
                    loadBackups();
                    
                    if (attempts >= maxAttempts) {
                        clearInterval(pollInterval);
                        const clockIcon = window.icons && window.icons['clock.svg']
                            ? `<img src="${window.icons['clock.svg']}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 6px; display: inline-block;">`
                            : '';
                        $status.html(clockIcon + 'Backup may still be creating. Check the backup list in a few minutes.').css('background', '#fef3c7').css('color', '#92400e').show();
                    }
                }, 3000);
                
            } catch (error) {
                logger.error('[PC2Tab] Failed to create backup:', error);
                const errorIcon = window.icons && window.icons['danger.svg']
                    ? `<img src="${window.icons['danger.svg']}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 6px; display: inline-block;">`
                    : '';
                $status.html(errorIcon + 'Failed: ' + error.message).css('background', '#fee2e2').css('color', '#dc2626').show();
            } finally {
                $btn.prop('disabled', false).html('<span style="margin-right: 4px;">+</span> Create Backup');
            }
        }
        
        // Load trusted wallets
        async function loadWallets() {
            const $list = $el_window.find('#pc2-wallets-list');
            try {
                let result;
                // In PC2 mode, use direct fetch (we're already on the node)
                if (isPC2Mode() && window.api_origin) {
                    const url = new URL('/api/wallets', window.api_origin);
                    const authToken = getAuthToken();
                    const headers = {
                        'Content-Type': 'application/json'
                    };
                    if (authToken) {
                        headers['Authorization'] = `Bearer ${authToken}`;
                    }
                    const response = await fetch(url.toString(), {
                        method: 'GET',
                        headers
                    });
                    if (response.ok) {
                        result = await response.json();
                    } else {
                        throw new Error(`Failed to load wallets: ${response.status}`);
                    }
                } else {
                    // Legacy mode: use WebSocket tunnel
                    result = await pc2Service.request?.('GET', '/api/wallets');
                }
                const wallets = result?.wallets || [];
                
                if (wallets.length === 0) {
                    // Show owner wallet at minimum
                    const ownerWallet = window.user?.wallet_address;
                    if (ownerWallet) {
                        $list.html(`
                            <div class="pc2-wallet-item">
                                <div>
                                    <span style="font-family: monospace; font-size: 12px;">${ownerWallet.slice(0, 6)}...${ownerWallet.slice(-4)}</span>
                                    <span class="pc2-wallet-badge">Owner</span>
                                </div>
                            </div>
                        `);
                    } else {
                        $list.html('<span style="color: #888; font-size: 13px;">No wallets configured</span>');
                    }
                    return;
                }
                
                $list.empty();
                wallets.forEach(wallet => {
                    const shortAddr = `${wallet.wallet_address.slice(0, 6)}...${wallet.wallet_address.slice(-4)}`;
                    const $item = $(`
                        <div class="pc2-wallet-item">
                            <div>
                                <span style="font-family: monospace; font-size: 12px;">${shortAddr}</span>
                                ${wallet.is_owner ? '<span class="pc2-wallet-badge">Owner</span>' : ''}
                            </div>
                            ${!wallet.is_owner ? `<button class="pc2-wallet-revoke" data-wallet="${wallet.wallet_address}">Revoke</button>` : ''}
                        </div>
                    `);
                    $list.append($item);
                });
                
                // Revoke handlers
                $list.find('.pc2-wallet-revoke').on('click', async function() {
                    const wallet = $(this).data('wallet');
                    if (confirm(`Revoke access for ${wallet.slice(0, 6)}...${wallet.slice(-4)}?`)) {
                        try {
                            // In PC2 mode, use direct fetch (we're already on the node)
                            if (isPC2Mode() && window.api_origin) {
                                const url = new URL('/api/revoke', window.api_origin);
                                const authToken = getAuthToken();
                                const headers = {
                                    'Content-Type': 'application/json'
                                };
                                if (authToken) {
                                    headers['Authorization'] = `Bearer ${authToken}`;
                                }
                                const response = await fetch(url.toString(), {
                                    method: 'POST',
                                    headers,
                                    body: JSON.stringify({ wallet })
                                });
                                if (!response.ok) {
                                    throw new Error(`Failed to revoke: ${response.status}`);
                                }
                            } else {
                                // Legacy mode: use WebSocket tunnel
                            await pc2Service.request?.('POST', '/api/revoke', { wallet });
                            }
                            loadWallets();
                        } catch (error) {
                            alert('Failed to revoke: ' + error.message);
                        }
                    }
                });
            } catch (error) {
                // Show owner wallet as fallback
                const ownerWallet = window.user?.wallet_address;
                if (ownerWallet) {
                    $list.html(`
                        <div class="pc2-wallet-item">
                            <div>
                                <span style="font-family: monospace; font-size: 12px;">${ownerWallet.slice(0, 6)}...${ownerWallet.slice(-4)}</span>
                                <span class="pc2-wallet-badge">Owner</span>
                            </div>
                        </div>
                    `);
                } else {
                    $list.html('<span style="color: #888; font-size: 13px;">Unable to load</span>');
                }
            }
        }
        
        // Create backup button
        $el_window.find('#pc2-create-backup-btn').on('click', createBackup);
        
        // Backup help dialog
        $el_window.find('#pc2-backup-help').on('click', function() {
            const helpContent = `
                <div style="padding: 20px; max-width: 500px;">
                    <h3 style="margin-top: 0; margin-bottom: 15px;">Backup & Restore Help</h3>
                    
                    <div style="margin-bottom: 20px;">
                        <strong style="display: block; margin-bottom: 8px; color: #1f2937;">Why Backup?</strong>
                        <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #4b5563;">
                            Backups protect your data from server failures, hardware issues, or accidental deletion. 
                            Regular backups ensure you can recover your files, settings, and user accounts.
                        </p>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <strong style="display: block; margin-bottom: 8px; color: #1f2937;">How to Backup:</strong>
                        <ol style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.8; color: #4b5563;">
                            <li>Click "Create Backup" to start a backup</li>
                            <li>Wait for the backup to complete (may take a few minutes)</li>
                            <li><strong>Download the backup</strong> to your laptop or external drive</li>
                            <li>Store the backup file in a safe location</li>
                        </ol>
                    </div>
                    
                    <div style="margin-bottom: 20px; padding: 12px; background: #fef3c7; border-left: 3px solid #f59e0b; border-radius: 4px;">
                        <strong style="display: block; margin-bottom: 6px; color: #92400e;">${window.icons && window.icons['warning-sign.svg'] ? `<img src="${window.icons['warning-sign.svg']}" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;">` : ''} Critical: Off-Server Storage</strong>
                        <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #78350f;">
                            Backups stored on the same server will be lost if the server fails. 
                            Always download backups to a separate device (laptop, external drive, or cloud storage).
                        </p>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <strong style="display: block; margin-bottom: 8px; color: #1f2937;">How to Restore (New Server Scenario):</strong>
                        <p style="margin: 0 0 12px; font-size: 13px; line-height: 1.6; color: #4b5563;">
                            <strong>Scenario:</strong> Your server was lost/died, you have a backup file on your computer, and you're setting up a <strong>brand new PC2 node</strong> on a new VPS/Raspberry Pi.
                        </p>
                        <p style="margin: 0 0 12px; font-size: 13px; line-height: 1.6; color: #4b5563;">
                            <strong>Important:</strong> You must use the <strong>same admin wallet address</strong> that created the backup. This is required for security - the restore process verifies you own the wallet that created the backup.
                        </p>
                        <div style="padding: 10px; background: #eff6ff; border-left: 3px solid #3b82f6; border-radius: 4px; margin-bottom: 12px;">
                            <strong style="display: block; margin-bottom: 4px; color: #1e40af; font-size: 12px;">👥 Multiple Accounts on PC2 Node</strong>
                            <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #1e3a8a;">
                                <strong>Yes, all accounts are restored!</strong> The backup contains the entire PC2 node database, which includes all user accounts (all wallet addresses that have connected). Each wallet can only access their own files - the admin wallet cannot access other users' files unless explicitly shared. After restore, all users can log in with their original wallet addresses and access their data.
                            </p>
                        </div>
                        <div style="padding: 10px; background: #f0fdf4; border-left: 3px solid #22c55e; border-radius: 4px; margin-bottom: 12px;">
                            <strong style="display: block; margin-bottom: 4px; color: #166534; font-size: 12px;">✅ One-Click Restore Available!</strong>
                            <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #15803d;">
                                You can now restore directly through the web interface! Scroll down to the "Restore from Backup" section, upload your backup file, and click "Start Restore". The server will stop automatically during restore.
                            </p>
                        </div>
                        <p style="margin: 0 0 12px; font-size: 13px; line-height: 1.6; color: #4b5563;">
                            <strong>After Restore - How to Restart Server:</strong>
                        </p>
                        <ol style="margin: 0 0 12px; padding-left: 20px; font-size: 13px; line-height: 1.8; color: #4b5563;">
                            <li><strong>Connect to your server via SSH</strong> (use the same method you used to install PC2 - Terminal on Mac/Linux, PuTTY on Windows, or your VPS provider's console)</li>
                            <li><strong>Navigate to PC2 directory:</strong> <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-family: monospace;">cd pc2-node/test-fresh-install</code></li>
                            <li><strong>Start the server:</strong> <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-family: monospace;">npm start</code></li>
                            <li><strong>Wait for startup</strong> - you'll see "Server listening on port 4200" (or similar) when ready</li>
                            <li><strong>Refresh this page</strong> in your browser and log in with your admin wallet</li>
                            <li><strong>All accounts restored!</strong> Other users can also log in with their wallet addresses</li>
                        </ol>
                    </div>
                    
                    <div style="margin-bottom: 0;">
                        <strong style="display: block; margin-bottom: 8px; color: #1f2937;">Best Practices:</strong>
                        <ul style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.8; color: #4b5563;">
                            <li>Create backups regularly (weekly recommended)</li>
                            <li>Keep at least 3 backups (3-2-1 rule: 3 copies, 2 different media, 1 off-site)</li>
                            <li>Test restore process periodically</li>
                            <li>Store backups in multiple locations</li>
                        </ul>
                    </div>
                </div>
            `;
            
            UIWindow({
                title: 'Backup & Restore Help',
                body_content: helpContent,
                width: 550,
                height: 600,
                is_resizable: true,
                window_options: {
                    parent_uuid: $el_window.attr('data-element_uuid'),
                    disable_parent_window: true,
                    parent_center: true,
                }
            });
        });
        
        // Restore functionality
        let selectedRestoreFile = null;
        
        // File input handler
        const $fileInput = $el_window.find('#pc2-restore-file-input');
        const $uploadArea = $el_window.find('#pc2-restore-upload-area');
        const $fileInfo = $el_window.find('#pc2-restore-file-info');
        const $restoreBtn = $el_window.find('#pc2-restore-btn');
        const $restoreProgress = $el_window.find('#pc2-restore-progress');
        const $restoreStatus = $el_window.find('#pc2-restore-status');
        
        // Click upload area to trigger file input
        $uploadArea.on('click', function() {
            $fileInput.click();
        });
        
        // Drag and drop handlers
        $uploadArea.on('dragover', function(e) {
            e.preventDefault();
            e.stopPropagation();
            $(this).css({ borderColor: '#3b82f6', background: '#eff6ff' });
        });
        
        $uploadArea.on('dragleave', function(e) {
            e.preventDefault();
            e.stopPropagation();
            $(this).css({ borderColor: '#d1d5db', background: '#f9fafb' });
        });
        
        $uploadArea.on('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            $(this).css({ borderColor: '#d1d5db', background: '#f9fafb' });
            
            const files = e.originalEvent.dataTransfer.files;
            if (files.length > 0) {
                handleFileSelect(files[0]);
            }
        });
        
        // File input change handler
        $fileInput.on('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                handleFileSelect(file);
            }
        });
        
        // Clear file selection
        $el_window.find('#pc2-restore-clear-btn').on('click', function(e) {
            e.stopPropagation();
            selectedRestoreFile = null;
            $fileInput.val('');
            $fileInfo.hide();
            $restoreBtn.hide();
            $restoreProgress.hide();
            $restoreStatus.hide();
        });
        
        // Format file size
        function formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
        }
        
        // Handle file selection
        function handleFileSelect(file) {
            // Validate file type
            if (!file.name.endsWith('.tar.gz')) {
                showRestoreStatus('error', 'Invalid file type. Please select a .tar.gz backup file.');
                return;
            }
            
            // Validate file size (10GB max)
            const maxSize = 10 * 1024 * 1024 * 1024; // 10GB
            if (file.size > maxSize) {
                showRestoreStatus('error', 'File too large. Maximum backup size is 10GB.');
                return;
            }
            
            selectedRestoreFile = file;
            
            // Show file info
            $el_window.find('#pc2-restore-filename').text(file.name);
            $el_window.find('#pc2-restore-filesize').text(formatBytes(file.size));
            $fileInfo.show();
            $restoreBtn.show().prop('disabled', false);
            $restoreStatus.hide();
        }
        
        // Show restore status message
        function showRestoreStatus(type, message) {
            $restoreStatus.removeClass().show();
            if (type === 'error') {
                $restoreStatus.css({
                    background: '#fef2f2',
                    border: '1px solid #fca5a5',
                    color: '#991b1b'
                }).text(message);
            } else if (type === 'success') {
                $restoreStatus.css({
                    background: '#f0fdf4',
                    border: '1px solid #86efac',
                    color: '#166534'
                }).text(message);
            } else {
                $restoreStatus.css({
                    background: '#f0f9ff',
                    border: '1px solid #93c5fd',
                    color: '#1e40af'
                }).text(message);
            }
        }
        
        // Restore button handler
        $restoreBtn.on('click', async function() {
            if (!selectedRestoreFile) {
                showRestoreStatus('error', 'Please select a backup file first.');
                return;
            }
            
            if (!isPC2Mode() || !window.api_origin) {
                showRestoreStatus('error', 'Restore only available on PC2 nodes.');
                return;
            }
            
            // Confirm restore (destructive operation)
            const confirmed = confirm(
                '⚠️ WARNING: This will replace all current PC2 node data with the backup.\n\n' +
                'The server will stop during restore. You will need to restart it manually.\n\n' +
                'Are you sure you want to continue?'
            );
            
            if (!confirmed) {
                return;
            }
            
            const $btn = $(this);
            const $btnText = $el_window.find('#pc2-restore-btn-text');
            const $progressBar = $el_window.find('#pc2-restore-progress-bar');
            const $progressText = $el_window.find('#pc2-restore-progress-text');
            
            // Disable button and show progress
            $btn.prop('disabled', true);
            $btnText.text('Uploading...');
            $restoreProgress.show();
            $restoreStatus.hide();
            
            // Create FormData
            const formData = new FormData();
            formData.append('file', selectedRestoreFile);
            
            // Update progress (upload phase)
            $progressBar.css('width', '30%');
            $progressText.text('Uploading backup file...');
            
            try {
                const authToken = getAuthToken();
                const url = new URL('/api/backups/restore', window.api_origin);
                
                const headers = {};
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }
                
                const response = await fetch(url.toString(), {
                    method: 'POST',
                    headers,
                    body: formData
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || `Server error: ${response.status}`);
                }
                
                // Upload complete
                $progressBar.css('width', '60%');
                $progressText.text('Processing restore...');
                
                // Show success message with important note about server restart
                $progressBar.css('width', '100%');
                $progressText.text('Restore started!');
                
                showRestoreStatus('success', 
                    '✅ Restore process started successfully!\n\n' +
                    '⚠️ IMPORTANT: The server will stop automatically during restore.\n\n' +
                    '📋 To restart the server:\n' +
                    '1. Connect to your server via SSH (same way you installed PC2)\n' +
                    '2. Navigate to PC2 directory: cd pc2-node/test-fresh-install\n' +
                    '3. Start server: npm start\n' +
                    '4. Wait for server to start (you\'ll see "Server listening on port...")\n' +
                    '5. Refresh this page and log in with your admin wallet\n\n' +
                    '💡 All accounts on the PC2 node will be restored, but each wallet can only access their own files.'
                );
                
                // Reset UI
                $btnText.text('Start Restore');
                $restoreProgress.hide();
                selectedRestoreFile = null;
                $fileInput.val('');
                $fileInfo.hide();
                $restoreBtn.hide();
                
            } catch (error) {
                console.error('[Restore] Error:', error);
                showRestoreStatus('error', 'Failed to start restore: ' + error.message);
                $btn.prop('disabled', false);
                $btnText.text('Start Restore');
                $restoreProgress.hide();
            }
        });
        
        // Connect button
        $el_window.find('#pc2-connect-btn').on('click', async function() {
            const { default: UIPC2SetupWizard } = await import('../UIPC2SetupWizard.js');
            UIPC2SetupWizard();
        });
        
        // Disconnect button
        $el_window.find('#pc2-disconnect-btn').on('click', function() {
            pc2Service.disconnect?.();
            updateUI();
        });
        
        // Forget button
        $el_window.find('#pc2-forget-btn').on('click', function() {
            if (confirm('Forget this PC2 node? You will need the setup token to reconnect.')) {
                pc2Service.clearConfig?.();
                updateUI();
            }
        });
        
        // Invite button - show inline form
        const $inviteForm = $el_window.find('#pc2-invite-form');
        const $inviteInput = $el_window.find('#pc2-invite-input');
        const $inviteError = $el_window.find('#pc2-invite-error');
        
        $el_window.on('click', '#pc2-invite-btn', function(e) {
            e.preventDefault();
            $inviteForm.slideDown(200);
            setTimeout(() => $inviteInput.val('').focus(), 50);
            $inviteError.text('');
        });
        
        // Cancel invite
        $el_window.on('click', '#pc2-invite-cancel', function(e) {
            e.preventDefault();
            $inviteForm.slideUp(200);
            $inviteInput.val('');
            $inviteError.text('');
        });
        
        // Confirm invite
        $el_window.on('click', '#pc2-invite-confirm', async function(e) {
            e.preventDefault();
            const wallet = $inviteInput.val().trim();
            $inviteError.text('');
            
            if (!wallet) {
                $inviteError.text('Please enter a wallet address');
                return;
            }
            
            if (!wallet.startsWith('0x') || wallet.length !== 42) {
                $inviteError.text('Invalid address. Must start with 0x and be 42 characters.');
                return;
            }
            
            const $btn = $(this);
            $btn.prop('disabled', true).text('Adding...');
            
            try {
                // In PC2 mode, use direct fetch (we're already on the node)
                if (isPC2Mode() && window.api_origin) {
                    const url = new URL('/api/invite', window.api_origin);
                    const authToken = getAuthToken();
                    const headers = {
                        'Content-Type': 'application/json'
                    };
                    if (authToken) {
                        headers['Authorization'] = `Bearer ${authToken}`;
                    }
                    const response = await fetch(url.toString(), {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ wallet })
                    });
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ error: `Failed: ${response.status}` }));
                        throw new Error(errorData.error || `Failed: ${response.status}`);
                    }
                } else {
                    // Legacy mode: use WebSocket tunnel
                await pc2Service.request?.('POST', '/api/invite', { wallet });
                }
                $inviteForm.slideUp(200);
                $inviteInput.val('');
                loadWallets();
            } catch (error) {
                $inviteError.text('Failed: ' + error.message);
            } finally {
                $btn.prop('disabled', false).text('Add');
            }
        });
        
        // Allow Enter key to submit
        $inviteInput.on('keypress', function(e) {
            if (e.which === 13) {
                $el_window.find('#pc2-invite-confirm').click();
            }
        });
        
        // Listen for PC2 status changes
        window.addEventListener('pc2-status-changed', updateUI);
        
        // Initial update
        await updateUI();
        
        // Refresh backups when tab is shown
        if ($el_window.find('#pc2-connected').is(':visible')) {
            loadBackups();
        }
    },
    on_show: async function($content) {
        // Refresh data when tab is shown
        const pc2Service = getPC2Service();
        const $window = $content.closest('.window-settings');
        
        if (pc2Service.isConnected?.() || (isPC2Mode() && window.is_auth && window.is_auth())) {
            // Refresh backups if connected
            if ($window.find('#pc2-connected').is(':visible')) {
                // Load backups without full re-init
                const authToken = window.auth_token || localStorage.getItem('auth_token');
                if (authToken && window.api_origin) {
                    try {
                        const url = new URL('/api/backups', window.api_origin);
                        const response = await fetch(url.toString(), {
                            headers: { 'Authorization': `Bearer ${authToken}` }
                        });
                        if (response.ok) {
                            const data = await response.json();
                            const backups = data.backups || [];
                            const $list = $window.find('#pc2-backups-list');
                            if (backups.length === 0) {
                                $list.html('<span style="color: #888; font-size: 13px;">No backups yet.</span>');
                            } else {
                                // Trigger re-render by calling loadBackups through the init context
                                // For now, just show count
                                $list.html(`<span style="color: #888; font-size: 13px;">${backups.length} backup(s) available</span>`);
                            }
                        }
                    } catch (e) {
                        // Ignore errors on quick refresh
                    }
                }
            }
            // Re-init to refresh all data
            this.init($window);
        }
    }
};
