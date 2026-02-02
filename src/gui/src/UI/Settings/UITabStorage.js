/**
 * Copyright (C) 2024-present Puter Technologies Inc.
 *
 * Storage Usage Dashboard Tab
 * Shows storage breakdown, largest files, IPFS CID information, and storage trends
 */

import item_icon from '../../helpers/item_icon.js';

export default {
    id: 'storage',
    title_i18n_key: 'storage',
    icon: 'cube-outline.svg',
    html: () => {
        return `
            <style>
                .storage-section { margin-bottom: 14px; }
                .storage-section-title { font-size: 11px; font-weight: 700; color: #000; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; padding-left: 2px; }
                .storage-card { background: #f9f9f9; border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; }
                .storage-card-row { display: flex; justify-content: space-between; align-items: center; }
                .storage-card-label { font-size: 13px; font-weight: 500; color: #333; display: flex; align-items: center; gap: 4px; }
                .storage-card-value { font-size: 12px; color: #666; }
                .storage-select { font-size: 11px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; background: #fff; width: auto; }
                .storage-btn { font-size: 11px; padding: 4px 10px; border-radius: 4px; cursor: pointer; line-height: 1.2; height: auto; }
                .storage-group { background: #f9f9f9; border-radius: 8px; border: 1px solid #d0d0d0; overflow: hidden; }
                .storage-group-row { padding: 10px 12px; border-bottom: 1px solid #e5e5e5; }
                .storage-group-row:last-child { border-bottom: none; }
            </style>
            
            <!-- Storage Quota -->
            <div class="storage-section">
                <div class="storage-section-title">Usage</div>
                <div class="storage-group">
                    <div class="storage-group-row">
                        <div class="storage-card-row"><span class="storage-card-label">Used</span><span id="storage-quota-text" class="storage-card-value">Loading...</span></div>
                        <div class="storage-quota-track" style="height: 5px; border-radius: 3px; overflow: hidden; margin: 6px 0;">
                            <div id="storage-quota-bar" style="height: 100%; background: #3b82f6; width: 0%; transition: width 0.3s;"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #999;">
                            <span id="storage-used-label">0 B</span><span id="storage-limit-label">Unlimited</span>
                        </div>
                    </div>
                    <div class="storage-group-row"><div class="storage-card-row"><span class="storage-card-label">Limit</span><select id="storage-limit-select" class="storage-select"><option value="auto">Auto</option><option value="10GB">10 GB</option><option value="25GB">25 GB</option><option value="50GB">50 GB</option><option value="100GB">100 GB</option><option value="unlimited">Unlimited</option></select></div></div>
                    <div class="storage-group-row"><div class="storage-card-row"><span class="storage-card-label">Files</span><span id="storage-files-count" class="storage-card-value">-</span></div></div>
                    <div class="storage-group-row"><div class="storage-card-row"><span class="storage-card-label">IPFS</span><span class="storage-card-value"><span id="storage-ipfs-count">-</span> with CID</span></div></div>
                </div>
            </div>
            
            <!-- IPFS Network -->
            <div class="storage-section">
                <div class="storage-section-title">IPFS Network</div>
                <div class="storage-group">
                    <div class="storage-group-row"><div class="storage-card-row"><span class="storage-card-label">Mode <span class="tooltip-icon" title="Private/Public/Hybrid">?</span></span><span id="ipfs-network-mode" style="font-size: 11px; padding: 2px 6px; border-radius: 10px; background: #e2e3e5;">-</span></div></div>
                    <div class="storage-group-row"><div class="storage-card-row"><span class="storage-card-label">Node ID <span class="tooltip-icon" title="Your IPFS network identifier">?</span></span><div style="display: flex; align-items: center; gap: 4px;"><code id="ipfs-node-id" style="font-size: 10px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">-</code><button id="copy-node-id-btn" class="copy-icon-btn" style="padding: 2px 4px; border: 1px solid #ccc; border-radius: 3px; background: #fff; display: none; cursor: pointer;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div></div></div>
                    <div class="storage-group-row" id="ipfs-peers-card" style="display: none;"><div class="storage-card-row"><span class="storage-card-label">Peers</span><span id="ipfs-connected-peers" class="storage-card-value">0</span></div></div>
                    <div class="storage-group-row"><div class="storage-card-row"><span class="storage-card-label">Gateway</span><div style="display: flex; align-items: center; gap: 4px;"><a id="ipfs-gateway-url" href="#" target="_blank" style="font-size: 10px; color: #0066cc;">-</a><button id="copy-gateway-btn" class="copy-icon-btn" style="padding: 2px 4px; border: 1px solid #ccc; border-radius: 3px; background: #fff; display: none; cursor: pointer;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div></div></div>
                    <div class="storage-group-row"><div class="storage-card-row"><span class="storage-card-label">Public Files</span><div style="display: flex; align-items: center; gap: 6px;"><span id="ipfs-public-files" class="storage-card-value">-</span><button id="export-public-files-btn" class="button storage-btn" style="display: none;">Export</button></div></div></div>
                    <div class="storage-group-row"><div class="storage-card-row"><span class="storage-card-label">Pin Remote</span><button id="pin-remote-cid-btn" class="button storage-btn">Pin CID</button></div></div>
                </div>
            </div>
            
            <!-- IPFS Sharing -->
            <div class="storage-section">
                <div class="storage-section-title">IPFS Sharing</div>
                <div class="storage-group">
                    <div class="storage-group-row">
                        <div class="storage-card-row">
                            <span class="storage-card-label">Network Mode <span class="tooltip-icon" title="Private: Your files stay on your device only, no network connection. Hybrid (Recommended): Only files in your /Public folder are shared with the network. Private files stay private. Public: All files are shared with the IPFS network.">?</span></span>
                            <select id="ipfs-mode-select" class="storage-select">
                                <option value="private">Private</option>
                                <option value="hybrid" selected>Hybrid</option>
                                <option value="public">Public</option>
                            </select>
                        </div>
                    </div>
                    <div class="storage-group-row">
                        <div class="storage-card-row">
                            <span class="storage-card-label">Auto-Share Public Folder <span class="tooltip-icon" title="When enabled, files you add to your /Public folder are automatically announced to the IPFS network, making them discoverable and downloadable by other PC2 nodes and the wider IPFS network.">?</span></span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="ipfs-auto-announce-toggle" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="storage-group-row">
                        <div class="storage-card-row">
                            <span class="storage-card-label">Shared CIDs <span class="tooltip-icon" title="Number of unique content identifiers (CIDs) from your /Public folder that have been announced to the IPFS network.">?</span></span>
                            <span id="ipfs-shared-cids" class="storage-card-value">-</span>
                        </div>
                    </div>
                    <div class="storage-group-row">
                        <div class="storage-card-row">
                            <span class="storage-card-label">Announce Now <span class="tooltip-icon" title="Manually announce all your public files to the IPFS DHT right now. This makes your content discoverable by others on the network.">?</span></span>
                            <button id="ipfs-announce-btn" class="button storage-btn">Announce All</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Visibility -->
            <div class="storage-section">
                <div class="storage-section-title">By Visibility</div>
                <div class="storage-group" id="storage-by-visibility-list"><div style="text-align: center; padding: 10px; color: #999; font-size: 12px;">Loading...</div></div>
            </div>
            
            <!-- By Type -->
            <div class="storage-section">
                <div class="storage-section-title">By Type</div>
                <div class="storage-group" id="storage-by-type-list"><div style="text-align: center; padding: 10px; color: #999; font-size: 12px;">Loading...</div></div>
            </div>
            
            <!-- Largest Files -->
            <div class="storage-section">
                <div class="storage-section-title" style="display: flex; justify-content: space-between; align-items: center;">
                    <span>Largest Files</span>
                    <button class="button storage-btn" id="refresh-storage">Refresh</button>
                </div>
                <div class="storage-group" style="max-height: 300px; overflow-y: auto; padding: 8px;">
                    <div id="largest-files-list"><div style="text-align: center; padding: 10px; color: #999; font-size: 12px;">Loading...</div></div>
                </div>
            </div>
            
            <!-- Unused Files -->
            <div class="storage-section">
                <div class="storage-section-title">Unused (30+ days)</div>
                <div class="storage-group" style="max-height: 300px; overflow-y: auto; padding: 8px;">
                    <div id="unused-files-list"><div style="text-align: center; padding: 10px; color: #999; font-size: 12px;">Loading...</div></div>
                </div>
            </div>
            
            <style>
                .tooltip-icon { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 50%; background: #e5e7eb; color: #666; font-size: 9px; font-weight: bold; cursor: help; }
                .storage-tooltip-popup { position: fixed; background: #333; color: white; padding: 6px 10px; border-radius: 4px; font-size: 11px; max-width: 200px; z-index: 999999; }
                .visibility-badge { display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: 500; }
                .visibility-badge.public { background: #d4edda; color: #155724; }
                .visibility-badge.private { background: #e2e3e5; color: #383d41; }
                .storage-type-item { display: flex; align-items: center; padding: 10px 12px; background: transparent; border-bottom: 1px solid #e5e5e5; gap: 8px; }
                .storage-type-item:last-child { border-bottom: none; }
                .storage-type-label { display: flex; align-items: center; gap: 4px; flex-shrink: 0; width: 70px; }
                .storage-type-name { font-weight: 500; font-size: 11px; text-transform: capitalize; }
                .storage-type-bar { flex: 1; height: 5px; border-radius: 3px; overflow: hidden; }
                .storage-type-bar-fill { height: 100%; background: #3b82f6; }
                .storage-type-value { font-size: 10px; color: #666; width: 90px; text-align: right; flex-shrink: 0; }
                .storage-file-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #eee; cursor: pointer; }
                .storage-file-item:hover { background: #f5f5f5; }
                .storage-file-item:last-child { border-bottom: none; }
                .storage-file-icon { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                .storage-file-icon img { width: 24px; height: 24px; }
                .storage-file-details { flex: 1; min-width: 0; }
                .storage-file-name { font-weight: 500; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .storage-file-meta { font-size: 9px; color: #999; display: flex; gap: 6px; }
                .storage-file-cid { font-family: monospace; font-size: 8px; color: #667eea; background: #f0f4ff; padding: 1px 4px; border-radius: 2px; }
                .storage-file-size { font-weight: 600; color: #3b82f6; font-size: 10px; min-width: 50px; text-align: right; }
                /* Toggle switch styles - simple iOS style */
                .toggle-switch { position: relative; display: inline-block; width: 42px; height: 24px; }
                .toggle-switch input { display: none; }
                .toggle-switch .toggle-slider { position: absolute; top: 0; left: 0; width: 42px; height: 24px; background: #ccc; border-radius: 12px; cursor: pointer; transition: background 0.2s; }
                .toggle-switch .toggle-slider:before { display: none !important; }
                .toggle-switch .toggle-slider:after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: #fff; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.2); transition: left 0.2s; }
                .toggle-switch input:checked + .toggle-slider { background: #22c55e; }
                .toggle-switch input:checked + .toggle-slider:after { left: 20px; }
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
                $el_window.find('#storage-by-visibility-list, #storage-by-type-list, #largest-files-list, #unused-files-list').html('<div class="loading" style="text-align: center; padding: 20px;">Loading...</div>');
                
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
                
                // Update storage quota display - use limit from API (auto-detected or configured)
                const totalSize = data.total.size || 0;
                const storageLimit = data.storageLimit || data.storage?.limit || 10 * 1024 * 1024 * 1024;
                const isUnlimited = storageLimit > 100 * 1024 * 1024 * 1024 * 1024; // > 100TB = unlimited
                const usagePercentage = isUnlimited ? 0 : Math.min((totalSize / storageLimit) * 100, 100);
                
                if (isUnlimited) {
                    $el_window.find('#storage-quota-text').text(`${formatBytes(totalSize)} / Unlimited`);
                    $el_window.find('#storage-quota-bar').css('width', '0%');
                    $el_window.find('#storage-limit-label').text('Unlimited');
                } else {
                    $el_window.find('#storage-quota-text').text(`${formatBytes(totalSize)} / ${formatBytes(storageLimit)}`);
                    $el_window.find('#storage-quota-bar').css('width', `${usagePercentage}%`);
                    $el_window.find('#storage-limit-label').text(formatBytes(storageLimit));
                }
                $el_window.find('#storage-used-label').text(`${formatBytes(totalSize)} used`);
                
                // Color the bar based on usage
                if (usagePercentage > 90) {
                    $el_window.find('#storage-quota-bar').css('background', '#dc2626');
                } else if (usagePercentage > 75) {
                    $el_window.find('#storage-quota-bar').css('background', '#f59e0b');
                } else {
                    $el_window.find('#storage-quota-bar').css('background', '#3b82f6');
                }
                
                // Update overview
                $el_window.find('#storage-files-count').text(data.total.files || 0);
                $el_window.find('#storage-ipfs-count').text(`${data.ipfs.filesWithCID || 0} (${data.ipfs.percentage || 0}%)`);
                
                // Fetch public stats for visibility breakdown
                let publicStats = { publicFiles: 0, totalPublicSize: 0 };
                try {
                    const visibilityStatsUrl = new URL('/api/public/stats', apiOrigin);
                    const statsResponse = await fetch(visibilityStatsUrl.toString());
                    if (statsResponse.ok) {
                        publicStats = await statsResponse.json();
                    }
                } catch (e) {
                    console.warn('[Storage] Could not fetch public stats:', e);
                }
                
                // Render storage by visibility
                renderStorageByVisibility(
                    $el_window.find('#storage-by-visibility-list'), 
                    data.total.size, 
                    data.total.files,
                    publicStats.totalPublicSize || 0, 
                    publicStats.publicFiles || 0
                );
                
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
        
        // Render storage by visibility (Public vs Private)
        function renderStorageByVisibility($container, totalSize, totalFiles, publicSize, publicFiles) {
            $container.empty();
            
            const privateSize = totalSize - publicSize;
            const privateFiles = totalFiles - publicFiles;
            const publicPercentage = totalSize > 0 ? (publicSize / totalSize) * 100 : 0;
            const privatePercentage = totalSize > 0 ? (privateSize / totalSize) * 100 : 0;
            
            // Private storage item
            const $privateItem = $(`
                <div class="storage-type-item">
                    <div class="storage-type-label">
                        <span class="visibility-badge private">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            Private
                        </span>
                    </div>
                    <div class="storage-type-bar">
                        <div class="storage-type-bar-fill" style="width: ${privatePercentage}%; background: #3b82f6;"></div>
                    </div>
                    <div class="storage-type-value">
                        ${formatBytes(privateSize)} (${privateFiles} files)
                    </div>
                </div>
            `);
            $container.append($privateItem);
            
            // Public storage item
            const $publicItem = $(`
                <div class="storage-type-item">
                    <div class="storage-type-label">
                        <span class="visibility-badge public">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                            Public
                        </span>
                    </div>
                    <div class="storage-type-bar">
                        <div class="storage-type-bar-fill" style="width: ${publicPercentage}%; background: #22c55e;"></div>
                    </div>
                    <div class="storage-type-value">
                        ${formatBytes(publicSize)} (${publicFiles} files)
                    </div>
                </div>
            `);
            $container.append($publicItem);
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
        
        // Load IPFS network info
        async function loadIPFSNetworkInfo() {
            try {
                const apiOrigin = window.api_origin || window.location.origin;
                const authToken = getAuthToken();
                
                // Fetch network stats from public API
                const networkResponse = await fetch(`${apiOrigin}/api/public/network`, {
                    method: 'GET',
                    headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
                });
                
                // Fetch public stats
                const statsResponse = await fetch(`${apiOrigin}/api/public/stats`, {
                    method: 'GET',
                    headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
                });
                
                if (networkResponse.ok) {
                    const networkData = await networkResponse.json();
                    
                    // Update network mode with badge styling
                    const modeElement = $el_window.find('#ipfs-network-mode');
                    const mode = networkData.mode || 'private';
                    modeElement.text(mode.charAt(0).toUpperCase() + mode.slice(1));
                    
                    if (mode === 'public') {
                        modeElement.css({ 'background': '#d4edda', 'color': '#155724' });
                    } else if (mode === 'hybrid') {
                        modeElement.css({ 'background': '#fff3cd', 'color': '#856404' });
                    } else {
                        modeElement.css({ 'background': '#e2e3e5', 'color': '#383d41' });
                    }
                    
                    // Update node ID
                    const nodeId = networkData.peerId || '-';
                    const nodeIdElement = $el_window.find('#ipfs-node-id');
                    if (nodeId && nodeId !== '-') {
                        const shortNodeId = nodeId.length > 20 ? `${nodeId.slice(0, 12)}...${nodeId.slice(-8)}` : nodeId;
                        nodeIdElement.text(shortNodeId).attr('title', nodeId);
                        $el_window.find('#copy-node-id-btn').show().data('value', nodeId);
                    } else {
                        nodeIdElement.text('-');
                    }
                    
                    // Update connected peers (only show for public/hybrid mode)
                    if (mode !== 'private') {
                        $el_window.find('#ipfs-peers-card').show();
                        $el_window.find('#ipfs-connected-peers').text(networkData.totalPeers || 0);
                    }
                    
                    // Update gateway URL
                    const gatewayUrl = `${apiOrigin}/ipfs/`;
                    const gatewayElement = $el_window.find('#ipfs-gateway-url');
                    gatewayElement.text(gatewayUrl).attr('href', gatewayUrl);
                    $el_window.find('#copy-gateway-btn').show().data('value', gatewayUrl);
                }
                
                if (statsResponse.ok) {
                    const statsData = await statsResponse.json();
                    const publicCount = statsData.publicFiles || 0;
                    $el_window.find('#ipfs-public-files').text(`${publicCount} files (${formatBytes(statsData.totalPublicSize || 0)})`);
                    
                    // Show export button if there are public files
                    if (publicCount > 0) {
                        $el_window.find('#export-public-files-btn').show();
                    } else {
                        $el_window.find('#export-public-files-btn').hide();
                    }
                }
                
            } catch (error) {
                console.error('[Storage] Failed to load IPFS network info:', error);
                $el_window.find('#ipfs-network-mode').text('Unavailable').css({ 'background': '#f8d7da', 'color': '#721c24' });
                $el_window.find('#ipfs-node-id').text('-');
                $el_window.find('#ipfs-gateway-url').text('-').removeAttr('href');
                $el_window.find('#ipfs-public-files').text('-');
            }
        }
        
        // Load IPFS Sharing settings
        async function loadIPFSSharingSettings() {
            try {
                const apiOrigin = window.api_origin || window.location.origin;
                const authToken = getAuthToken();
                
                const response = await fetch(`${apiOrigin}/api/storage/ipfs/settings`, {
                    method: 'GET',
                    headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
                });
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('[Storage] IPFS settings loaded:', data);
                    
                    // Update mode select
                    $el_window.find('#ipfs-mode-select').val(data.settings?.mode || 'hybrid');
                    
                    // Update auto-announce toggle - use native DOM for reliable :checked CSS
                    const isAutoAnnounce = data.settings?.autoAnnouncePublic === true;
                    const toggleInput = document.getElementById('ipfs-auto-announce-toggle');
                    if (toggleInput) {
                        toggleInput.checked = isAutoAnnounce;
                        console.log('[Storage] Auto-announce toggle set to:', isAutoAnnounce, 'element:', toggleInput);
                    } else {
                        console.warn('[Storage] Toggle element not found!');
                    }
                    
                    // Update shared CIDs count
                    $el_window.find('#ipfs-shared-cids').text(data.publicFiles?.uniqueCIDs || 0);
                }
            } catch (error) {
                console.error('[Storage] Failed to load IPFS sharing settings:', error);
            }
        }
        
        // IPFS mode change handler
        $el_window.find('#ipfs-mode-select').on('change', async function() {
            const newMode = $(this).val();
            const select = $(this);
            select.prop('disabled', true);
            
            try {
                const apiOrigin = window.api_origin || window.location.origin;
                const authToken = getAuthToken();
                
                const response = await fetch(`${apiOrigin}/api/storage/ipfs/settings`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
                    },
                    body: JSON.stringify({ mode: newMode })
                });
                
                if (response.ok) {
                    console.log(`[Storage] IPFS mode set to ${newMode}`);
                    // Note: Mode change requires node restart to take effect
                    if (newMode !== 'private') {
                        console.log('[Storage] Restart node for mode change to take effect');
                    }
                } else {
                    throw new Error('Failed to save');
                }
            } catch (error) {
                console.error('[Storage] Failed to save IPFS mode:', error);
                alert('Failed to update IPFS mode: ' + error.message);
            } finally {
                select.prop('disabled', false);
            }
        });
        
        // Auto-announce toggle handler
        $el_window.find('#ipfs-auto-announce-toggle').on('change', async function() {
            const enabled = $(this).prop('checked');
            const toggle = $(this);
            toggle.prop('disabled', true);
            
            try {
                const apiOrigin = window.api_origin || window.location.origin;
                const authToken = getAuthToken();
                
                const response = await fetch(`${apiOrigin}/api/storage/ipfs/settings`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
                    },
                    body: JSON.stringify({ autoAnnouncePublic: enabled })
                });
                
                if (response.ok) {
                    console.log(`[Storage] Auto-share ${enabled ? 'enabled' : 'disabled'}`);
                } else {
                    throw new Error('Failed to save');
                }
            } catch (error) {
                console.error('[Storage] Failed to save auto-announce setting:', error);
                alert('Failed to update setting: ' + error.message);
                // Revert toggle
                toggle.prop('checked', !enabled);
            } finally {
                toggle.prop('disabled', false);
            }
        });
        
        // Announce button handler
        $el_window.find('#ipfs-announce-btn').on('click', async function() {
            const btn = $(this);
            btn.prop('disabled', true).text('Announcing...');
            
            try {
                const apiOrigin = window.api_origin || window.location.origin;
                const authToken = getAuthToken();
                
                const response = await fetch(`${apiOrigin}/api/storage/ipfs/announce`, {
                    method: 'POST',
                    headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    console.log(`[Storage] Announced ${result.announced || 0} CIDs to DHT`);
                    // Refresh stats
                    await loadIPFSSharingSettings();
                } else {
                    throw new Error(result.error || 'Failed to announce');
                }
            } catch (error) {
                console.error('[Storage] Announce failed:', error);
                alert('Announce failed: ' + error.message);
            } finally {
                btn.prop('disabled', false).text('Announce All');
            }
        });
        
        // Copy button handlers
        const copyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        const checkIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        
        $el_window.find('#copy-node-id-btn, #copy-gateway-btn').on('click', function() {
            const value = $(this).data('value');
            const btn = $(this);
            navigator.clipboard.writeText(value).then(() => {
                btn.html(checkIconSvg).css('background', '#d4edda');
                setTimeout(() => btn.html(copyIconSvg).css('background', '#fff'), 1500);
            }).catch(err => {
                console.error('Failed to copy:', err);
            });
        });
        
        // Export public files button
        $el_window.find('#export-public-files-btn').on('click', async function() {
            const btn = $(this);
            btn.prop('disabled', true).text('Exporting...');
            
            try {
                const apiOrigin = window.api_origin || window.location.origin;
                const walletAddress = window.user?.username || '';
                const response = await fetch(`${apiOrigin}/api/public/list/${walletAddress}`);
                
                if (response.ok) {
                    const data = await response.json();
                    const files = data.files || [];
                    
                    if (files.length === 0) {
                        alert('No public files to export');
                        return;
                    }
                    
                    // Generate CSV content
                    let csv = 'Name,Path,CID,Size,Gateway URL\\n';
                    files.forEach(file => {
                        const gatewayUrl = `${apiOrigin}/ipfs/${file.ipfs_hash}`;
                        csv += `"${file.name}","${file.path}","${file.ipfs_hash}",${file.size},"${gatewayUrl}"\\n`;
                    });
                    
                    // Download as file
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `public-files-${new Date().toISOString().split('T')[0]}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    
                    console.log(`[Storage] Exported ${files.length} public files`);
                } else {
                    throw new Error('Failed to fetch public files');
                }
            } catch (error) {
                console.error('Export failed:', error);
                alert('Export failed: ' + error.message);
            } finally {
                btn.prop('disabled', false).text('Export');
            }
        });
        
        // Pin remote CID button
        $el_window.find('#pin-remote-cid-btn').on('click', function() {
            // Create modal dialog
            const modal = document.createElement('div');
            modal.className = 'pin-cid-modal';
            modal.innerHTML = `
                <div class="pin-cid-backdrop" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 999998;"></div>
                <div class="pin-cid-dialog" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 8px; padding: 24px; width: 400px; max-width: 90vw; z-index: 999999; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <h3 style="margin: 0 0 16px; font-size: 16px;">Pin Remote IPFS Content</h3>
                    <p style="margin: 0 0 16px; font-size: 13px; color: #666;">Enter a CID to fetch and pin content from the IPFS network to your node.</p>
                    <input type="text" id="pin-cid-input" placeholder="bafkreih..." style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; box-sizing: border-box; margin-bottom: 16px;">
                    <div style="display: flex; gap: 8px; justify-content: flex-end;">
                        <button class="pin-cid-cancel button" style="padding: 0 16px; height: 32px; line-height: 32px;">Cancel</button>
                        <button class="pin-cid-confirm button button-primary" style="padding: 0 16px; height: 32px; line-height: 32px; background: #3b82f6; color: white; border: none;">Pin Content</button>
                    </div>
                    <div class="pin-cid-status" style="margin-top: 12px; font-size: 12px; display: none;"></div>
                </div>
            `;
            document.body.appendChild(modal);
            
            const input = modal.querySelector('#pin-cid-input');
            const confirmBtn = modal.querySelector('.pin-cid-confirm');
            const cancelBtn = modal.querySelector('.pin-cid-cancel');
            const backdrop = modal.querySelector('.pin-cid-backdrop');
            const statusEl = modal.querySelector('.pin-cid-status');
            
            const closeModal = () => modal.remove();
            
            cancelBtn.addEventListener('click', closeModal);
            backdrop.addEventListener('click', closeModal);
            
            confirmBtn.addEventListener('click', async () => {
                const cid = input.value.trim();
                if (!cid) {
                    statusEl.style.display = 'block';
                    statusEl.style.color = '#dc2626';
                    statusEl.textContent = 'Please enter a CID';
                    return;
                }
                
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Pinning...';
                statusEl.style.display = 'block';
                statusEl.style.color = '#666';
                statusEl.textContent = 'Fetching content from IPFS network...';
                
                try {
                    const apiOrigin = window.api_origin || window.location.origin;
                    const authToken = getAuthToken();
                    
                    const response = await fetch(`${apiOrigin}/api/pin/${cid}`, {
                        method: 'POST',
                        headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
                    });
                    
                    const result = await response.json();
                    
                    if (response.ok && result.success) {
                        statusEl.style.color = '#16a34a';
                        const sizeInfo = formatBytes(result.size || 0);
                        const typeInfo = result.type === 'directory' ? ` (${result.files} files)` : '';
                        const mimeInfo = result.mimeType ? ` • ${result.mimeType.split('/')[1] || result.mimeType}` : '';
                        if (result.savedPath) {
                            const filename = result.savedPath.split('/').pop();
                            statusEl.innerHTML = `✓ Downloaded! ${sizeInfo}${mimeInfo}${typeInfo}<br><small style="color:#666;">Saved as: <strong>${filename}</strong></small>`;
                            // Refresh the Public folder to show the new file
                            const folderPath = result.savedPath.substring(0, result.savedPath.lastIndexOf('/'));
                            if (window.refresh_item_container) {
                                // Find any open file explorer windows showing this folder
                                document.querySelectorAll(`.item-container[data-path="${folderPath}"]`).forEach(container => {
                                    window.refresh_item_container(container);
                                });
                            }
                        } else {
                            statusEl.textContent = `✓ Pinned to IPFS cache! ${sizeInfo}${typeInfo}`;
                        }
                        console.log('[Storage] Content pinned successfully:', result);
                        setTimeout(closeModal, 3000);
                    } else {
                        throw new Error(result.message || result.error || 'Failed to pin content');
                    }
                } catch (error) {
                    statusEl.style.color = '#dc2626';
                    statusEl.textContent = 'Error: ' + error.message;
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Pin Content';
                }
            });
            
            input.focus();
        });
        
        // Refresh button
        $el_window.find('#refresh-storage').on('click', () => {
            loadStorageData();
            loadIPFSNetworkInfo();
        });
        
        // JavaScript-based tooltip system (appended to body for reliable z-index)
        function initTooltips() {
            let tooltipEl = null;
            
            $el_window.find('.tooltip-icon').on('mouseenter', function(e) {
                const text = $(this).attr('title');
                if (!text) return;
                
                // Remove title to prevent native tooltip
                $(this).data('tooltip-text', text).removeAttr('title');
                
                // Create tooltip element
                tooltipEl = document.createElement('div');
                tooltipEl.className = 'storage-tooltip-popup';
                tooltipEl.textContent = text;
                document.body.appendChild(tooltipEl);
                
                // Position below the icon
                const rect = this.getBoundingClientRect();
                tooltipEl.style.left = (rect.left + rect.width / 2 - tooltipEl.offsetWidth / 2) + 'px';
                tooltipEl.style.top = (rect.bottom + 8) + 'px';
                
                // Adjust if off-screen
                const tooltipRect = tooltipEl.getBoundingClientRect();
                if (tooltipRect.right > window.innerWidth - 10) {
                    tooltipEl.style.left = (window.innerWidth - tooltipRect.width - 10) + 'px';
                }
                if (tooltipRect.left < 10) {
                    tooltipEl.style.left = '10px';
                }
            });
            
            $el_window.find('.tooltip-icon').on('mouseleave', function() {
                // Restore title attribute
                const text = $(this).data('tooltip-text');
                if (text) {
                    $(this).attr('title', text);
                }
                // Remove tooltip
                if (tooltipEl && tooltipEl.parentNode) {
                    tooltipEl.parentNode.removeChild(tooltipEl);
                    tooltipEl = null;
                }
            });
        }
        
        // Initialize tooltips
        initTooltips();
        
        // Load and handle storage limit setting
        async function loadStorageLimitSetting() {
            try {
                const apiOrigin = window.api_origin || window.location.origin;
                const authToken = getAuthToken();
                const response = await fetch(`${apiOrigin}/api/storage/limit`, {
                    headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
                });
                if (response.ok) {
                    const data = await response.json();
                    $el_window.find('#storage-limit-select').val(data.limit || 'auto');
                }
            } catch (error) {
                console.warn('[Storage] Could not load storage limit setting:', error);
            }
        }
        
        $el_window.find('#storage-limit-select').on('change', async function() {
            const newLimit = $(this).val();
            const select = $(this);
            select.prop('disabled', true);
            
            try {
                const apiOrigin = window.api_origin || window.location.origin;
                const authToken = getAuthToken();
                const response = await fetch(`${apiOrigin}/api/storage/limit`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
                    },
                    body: JSON.stringify({ limit: newLimit })
                });
                
                if (response.ok) {
                    console.log('[Storage] Storage limit updated');
                    // Refresh to show new limit
                    await loadStorageData();
                } else {
                    throw new Error('Failed to save');
                }
            } catch (error) {
                console.error('[Storage] Failed to save limit:', error);
                alert('Failed to update storage limit: ' + error.message);
            } finally {
                select.prop('disabled', false);
            }
        });
        
        // Store load functions for reuse in on_show
        this._loadStorageData = loadStorageData;
        this._loadIPFSNetworkInfo = loadIPFSNetworkInfo;
        this._loadStorageLimitSetting = loadStorageLimitSetting;
        this._loadIPFSSharingSettings = loadIPFSSharingSettings;
        
        // Initial load - run in parallel with timeout protection
        try {
            await Promise.race([
                Promise.all([
                    loadStorageData().catch(e => console.error('[Storage] loadStorageData error:', e)),
                    loadIPFSNetworkInfo().catch(e => console.error('[Storage] loadIPFSNetworkInfo error:', e)),
                    loadStorageLimitSetting().catch(e => console.error('[Storage] loadStorageLimitSetting error:', e)),
                    loadIPFSSharingSettings().catch(e => console.error('[Storage] loadIPFSSharingSettings error:', e))
                ]),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Storage tab load timeout')), 15000))
            ]);
        } catch (error) {
            console.error('[Storage] Init error or timeout:', error);
        }
    },
    on_show: async function($content) {
        // Only refresh data when tab is shown, don't re-attach event handlers
        if (this._loadStorageData && this._loadIPFSNetworkInfo) {
            try {
                await Promise.race([
                    Promise.all([
                        this._loadStorageData().catch(e => console.error('[Storage] loadStorageData error:', e)),
                        this._loadIPFSNetworkInfo().catch(e => console.error('[Storage] loadIPFSNetworkInfo error:', e)),
                        this._loadIPFSSharingSettings ? this._loadIPFSSharingSettings().catch(e => console.error('[Storage] loadIPFSSharingSettings error:', e)) : Promise.resolve()
                    ]),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Storage refresh timeout')), 10000))
                ]);
            } catch (error) {
                console.error('[Storage] Refresh error or timeout:', error);
            }
        }
    }
};

