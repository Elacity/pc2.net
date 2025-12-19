/**
 * Copyright (C) 2024-present Puter Technologies Inc.
 *
 * Storage Usage Dashboard Tab
 * Shows storage breakdown, largest files, IPFS CID information, and storage trends
 */

import item_icon from '../../helpers/item_icon.js';

export default {
    id: 'storage',
    title_i18n_key: 'Storage',
    icon: 'cube-outline.svg',
    html: () => {
        return `
            <h1>Storage</h1>
            
            <!-- Storage Overview -->
            <div class="settings-card">
                <strong>Total Storage</strong>
                <div style="flex-grow:1; text-align: right;">
                    <span id="storage-total" style="font-size: 13px;">Loading...</span>
                </div>
            </div>
            
            <div class="settings-card">
                <strong>Files Stored</strong>
                <div style="flex-grow:1; text-align: right;">
                    <span id="storage-files-count" style="font-size: 13px;">Loading...</span>
                </div>
            </div>
            
            <!-- IPFS CID Statistics -->
            <div class="settings-card">
                <strong>IPFS Storage</strong>
                <div style="flex-grow:1; text-align: right;">
                    <span id="storage-ipfs-count" style="font-size: 13px;">Loading...</span>
                    <span style="color: #999; font-size: 12px;"> files with CID</span>
                </div>
            </div>
            
            <!-- Storage by Type -->
            <h2 style="font-size: 15px; margin: 20px 0 10px; color: #333;">Storage by Type</h2>
            
            <div id="storage-by-type-list" style="margin: 0 15px;">
                <div class="loading" style="text-align: center; padding: 20px; color: #999;">Loading...</div>
            </div>
            
            <!-- Largest Files -->
            <h2 style="font-size: 15px; margin: 20px 0 10px; color: #333;">Largest Files</h2>
            
            <div class="settings-card" style="height: auto !important; min-height: 400px; flex-direction: column; align-items: flex-start; padding: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; width: 100%;">
                    <strong>Top 10 Largest</strong>
                    <button class="button" id="refresh-storage" style="font-size: 12px; padding: 0 12px; height: 28px; line-height: 28px; vertical-align: middle;">Refresh</button>
                </div>
                <div id="largest-files-list" style="width: 100%; min-height: 400px; max-height: 1000px; overflow-y: auto;">
                    <div class="loading" style="text-align: center; padding: 20px; color: #999;">Loading...</div>
                </div>
            </div>
            
            <!-- Unused Files -->
            <h2 style="font-size: 15px; margin: 20px 0 10px; color: #333;">Unused Files</h2>
            
            <div class="settings-card" style="height: auto !important; min-height: 400px; flex-direction: column; align-items: flex-start; padding: 15px;">
                <div style="margin-bottom: 12px; width: 100%;">
                    <strong>Files Not Accessed in 30 Days</strong>
                    <span style="color: #999; font-size: 12px; display: block; margin-top: 4px;">Potential cleanup candidates</span>
                </div>
                <div id="unused-files-list" style="width: 100%; min-height: 400px; max-height: 1000px; overflow-y: auto;">
                    <div class="loading" style="text-align: center; padding: 20px; color: #999;">Loading...</div>
                </div>
            </div>
            
            <style>
                .storage-type-item {
                    display: flex;
                    align-items: center;
                    padding: 12px 15px;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    margin-bottom: 8px;
                    background: #fff;
                    gap: 12px;
                }
                .storage-type-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-shrink: 0;
                    width: 80px;
                }
                .storage-type-name {
                    font-weight: 500;
                    text-transform: capitalize;
                }
                .storage-type-bar {
                    width: 150px;
                    height: 8px;
                    background: #e5e7eb;
                    border-radius: 4px;
                    overflow: hidden;
                    flex-shrink: 0;
                }
                .storage-type-bar-fill {
                    height: 100%;
                    background: #3b82f6;
                    transition: width 0.3s;
                }
                .storage-type-value {
                    font-size: 13px;
                    color: #666;
                    width: 120px;
                    text-align: right;
                    flex-shrink: 0;
                }
                .storage-file-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 10px 0;
                    border-bottom: 1px solid #e5e7eb;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .storage-file-item:hover {
                    background: #f9fafb;
                    margin: 0 -15px;
                    padding-left: 15px;
                    padding-right: 15px;
                }
                .storage-file-item:last-child {
                    border-bottom: none;
                }
                .storage-file-icon {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #f3f4f6;
                    border-radius: 4px;
                    flex-shrink: 0;
                }
                .storage-file-details {
                    flex: 1;
                    min-width: 0;
                }
                .storage-file-name {
                    font-weight: 500;
                    font-size: 13px;
                    margin-bottom: 4px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .storage-file-meta {
                    font-size: 11px;
                    color: #999;
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                .storage-file-cid {
                    font-family: monospace;
                    font-size: 10px;
                    color: #667eea;
                    background: #f0f4ff;
                    padding: 2px 6px;
                    border-radius: 3px;
                }
                .storage-file-size {
                    font-weight: 600;
                    color: #3b82f6;
                    font-size: 12px;
                    min-width: 70px;
                    text-align: right;
                }
                .loading {
                    color: #999;
                    font-size: 13px;
                }
            </style>
        `;
    },
    init: async function($el_window) {
        // Format bytes helper
        function formatBytes(bytes) {
            if (!bytes || bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        // Get auth token
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
        
        // Load storage data
        async function loadStorageData() {
            try {
                // Show loading state
                $el_window.find('#storage-total, #storage-files-count, #storage-ipfs-count').text('Loading...');
                $el_window.find('#storage-by-type-list, #largest-files-list, #unused-files-list').html('<div class="loading" style="text-align: center; padding: 20px;">Loading...</div>');
                
                // Determine API origin
                const apiOrigin = window.api_origin || window.location.origin;
                const url = new URL('/api/storage/usage', apiOrigin);
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
                    throw new Error(`Failed to load storage data: ${response.status}`);
                }
                
                const data = await response.json();
                
                // Update overview
                $el_window.find('#storage-total').text(formatBytes(data.total.size));
                $el_window.find('#storage-files-count').text(data.total.files || 0);
                $el_window.find('#storage-ipfs-count').text(`${data.ipfs.filesWithCID || 0} (${data.ipfs.percentage || 0}%)`);
                
                // Render storage by type
                renderStorageByType($el_window.find('#storage-by-type-list'), data.byType, data.total.size);
                
                // Render largest files
                await renderFilesList($el_window.find('#largest-files-list'), data.largestFiles, true);
                
                // Render unused files
                await renderFilesList($el_window.find('#unused-files-list'), data.unusedFiles, false);
                
            } catch (error) {
                console.error('[Storage Dashboard]: Error loading data:', error);
                $el_window.find('#storage-total, #storage-files-count, #storage-ipfs-count').text('-');
                $el_window.find('#storage-by-type-list, #largest-files-list, #unused-files-list').html(
                    `<div class="loading" style="text-align: center; padding: 20px; color: #dc2626;">Failed to load: ${error.message}</div>`
                );
            }
        }
        
        // Render storage by type
        function renderStorageByType($container, byType, totalSize) {
            if (!byType || byType.length === 0) {
                $container.html('<div class="loading" style="text-align: center; padding: 20px;">No data available</div>');
                return;
            }
            
            $container.empty();
            byType.forEach(item => {
                const percentage = totalSize > 0 ? (item.size / totalSize) * 100 : 0;
                // Capitalize type names properly (pdf -> PDF, etc.)
                let displayType = item.type || 'unknown';
                if (displayType === 'pdf') {
                    displayType = 'PDF';
                } else if (displayType === 'unknown') {
                    displayType = 'Unknown';
                } else {
                    // Capitalize first letter
                    displayType = displayType.charAt(0).toUpperCase() + displayType.slice(1);
                }
                const $item = $(`
                    <div class="storage-type-item">
                        <div class="storage-type-label">
                            <span class="storage-type-name">${html_encode(displayType)}</span>
                        </div>
                        <div class="storage-type-bar">
                            <div class="storage-type-bar-fill" style="width: ${percentage}%"></div>
                        </div>
                        <div class="storage-type-value">
                            ${formatBytes(item.size)} (${item.percentage}%)
                        </div>
                    </div>
                `);
                $container.append($item);
            });
        }
        
        // Render files list
        async function renderFilesList($container, files, showCID) {
            if (!files || files.length === 0) {
                $container.html('<div class="loading" style="text-align: center; padding: 20px;">No files found</div>');
                return;
            }
            
            $container.empty();
            
            // Render files with proper icons
            for (const file of files) {
                const fileName = file.name || file.path.split('/').pop() || file.path;
                // Backend returns ipfs_hash, but we use cid in the UI
                const ipfsHash = file.ipfs_hash || file.cid || null;
                const shortCID = ipfsHash ? `${ipfsHash.slice(0, 12)}...${ipfsHash.slice(-8)}` : null;
                const modifiedDate = file.modified ? new Date(file.modified).toLocaleDateString() : '-';
                
                // Get appropriate icon for this file type
                const fsentry = {
                    name: fileName,
                    path: file.path,
                    type: file.type || null,
                    is_dir: false
                };
                const iconData = await item_icon(fsentry);
                const iconUrl = iconData?.image || window.icons['file.svg'];
                
                const $item = $(`
                    <div class="storage-file-item" data-path="${html_encode(file.path)}">
                        <div class="storage-file-icon">
                            <img src="${iconUrl}" alt="${html_encode(fileName)}" style="width: 32px; height: 32px; object-fit: contain;">
                        </div>
                        <div class="storage-file-details">
                            <div class="storage-file-name">${html_encode(fileName)}</div>
                            <div class="storage-file-meta">
                                <span>${modifiedDate}</span>
                                ${showCID && ipfsHash ? `<span class="storage-file-cid" title="${html_encode(ipfsHash)}">CID: ${shortCID}</span>` : ''}
                            </div>
                        </div>
                        <div class="storage-file-size">${formatBytes(file.size)}</div>
                    </div>
                `);
                
                // Make clickable to open file
                $item.on('click', function() {
                    const path = $(this).data('path');
                    if (path) {
                        puter.fs.open(path);
                    }
                });
                
                $container.append($item);
            }
        }
        
        // Refresh button
        $el_window.find('#refresh-storage').on('click', () => {
            loadStorageData();
        });
        
        // Initial load
        await loadStorageData();
    },
    on_show: async function($content) {
        // Refresh data when tab is shown
        const $el_window = $content.closest('.window-settings');
        if ($el_window.length) {
            // Re-run init to refresh data
            await this.init($el_window);
        }
    }
};

