/**
 * Copyright (C) 2024-present Puter Technologies Inc.
 *
 * This file is part of Puter.
 *
 * Puter is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import UIWindow from './UIWindow.js';

// todo do this using uid rather than item_path, since item_path is way mroe expensive on the DB
async function UIWindowItemProperties (item_name, item_path, item_uid, left, top, width, height) {
    console.log('[Properties] UIWindowItemProperties called:', { item_name, item_path, item_uid });
    let h = '';
    h += '<div class="item-props-tabview" style="display: flex; flex-direction: column; height: 100%;">';
    // tabs
    h += '<div class="item-props-tab">';
    h += `<div class="item-props-tab-btn antialiased disable-user-select item-props-tab-selected" data-tab="general">${i18n('general')}</div>`;
    h += `<div class="item-props-tab-btn antialiased disable-user-select item-props-tab-btn-versions" data-tab="versions">${i18n('versions')}</div>`;
    h += '</div>';

    h += '<div class="item-props-tab-content item-props-tab-content-selected" data-tab="general" style="border-top-left-radius:0;">';
    h += '<table class="item-props-tbl">';
    h += `<tr><td class="item-prop-label">${i18n('name')}</td><td class="item-prop-val item-prop-val-name"></td></tr>`;
    h += `<tr><td class="item-prop-label">${i18n('path')}</td><td class="item-prop-val item-prop-val-path"></td></tr>`;
    h += `<tr class="item-prop-original-name"><td class="item-prop-label">${i18n('original_name')}</td><td class="item-prop-val item-prop-val-original-name"></td></tr>`;
    h += `<tr class="item-prop-original-path"><td class="item-prop-label">${i18n('original_path')}</td><td class="item-prop-val item-prop-val-original-path"></td></tr>`;
    h += `<tr><td class="item-prop-label">${i18n('shortcut_to')}</td><td class="item-prop-val item-prop-val-shortcut-to"></td></tr>`;
    h += '<tr><td class="item-prop-label">UID</td><td class="item-prop-val item-prop-val-uid"></td></tr>';
    h += `<tr><td class="item-prop-label">${i18n('type')}</td><td class="item-prop-val item-prop-val-type"></td></tr>`;
    h += `<tr><td class="item-prop-label">${i18n('size')}</td><td class="item-prop-val item-prop-val-size"></td></tr>`;
    h += `<tr><td class="item-prop-label">${i18n('modified')}</td><td class="item-prop-val item-prop-val-modified"></td></tr>`;
    h += `<tr><td class="item-prop-label">${i18n('created')}</td><td class="item-prop-val item-prop-val-created"></td></tr>`;
    h += '<tr class="item-prop-ipfs-hash"><td class="item-prop-label">IPFS Content ID</td><td class="item-prop-val item-prop-val-ipfs-hash"></td></tr>';
    h += '<tr class="item-prop-ipfs-visibility" style="display:none;"><td class="item-prop-label">Visibility</td><td class="item-prop-val item-prop-val-ipfs-visibility"></td></tr>';
    h += '<tr class="item-prop-ipfs-gateway" style="display:none;"><td class="item-prop-label">Gateway URL</td><td class="item-prop-val item-prop-val-ipfs-gateway"></td></tr>';
    h += `<tr><td class="item-prop-label">${i18n('versions')}</td><td class="item-prop-val item-prop-val-versions"></td></tr>`;
    h += `<tr><td class="item-prop-label">${i18n('associated_websites')}</td><td class="item-prop-val item-prop-val-websites">`;
    h += '</td></tr>';
    h += `<tr><td class="item-prop-label">${i18n('access_granted_to')}</td><td class="item-prop-val item-prop-val-permissions"></td></tr>`;
    h += '</table>';
    h += '</div>';

    h += '<div class="item-props-tab-content" data-tab="versions" style="padding: 20px;">';
    h += '<div class="item-props-version-list" style="min-height: 100px;">';
    h += '<p style="color: #666;">Initializing...</p>';
    h += '</div>';
    h += '</div>';
    h += '</div>';

    const el_window = await UIWindow({
        title: `${item_name} properties`,
        app: `${item_uid}-account`,
        single_instance: true,
        icon: null,
        uid: null,
        is_dir: false,
        body_content: h,
        has_head: true,
        selectable_body: false,
        draggable_body: false,
        allow_context_menu: false,
        is_resizable: false,
        is_droppable: false,
        init_center: true,
        allow_native_ctxmenu: true,
        allow_user_select: true,
        left: left,
        top: top,
        height: height,
        width: 450,
        window_class: 'window-item-properties',
        window_css: {
            // height: 'initial',
        },
        body_css: {
            padding: '10px',
            width: 'initial',
            height: 'calc(100% - 50px)',
            'background-color': 'rgb(241 242 246)',
            'backdrop-filter': 'blur(3px)',
            'content-box': 'content-box',
        },
    });

    // item props tab click handler
    $(el_window).find('.item-props-tab-btn').click(function (e) {
        // unselect all tabs
        $(el_window).find('.item-props-tab-btn').removeClass('item-props-tab-selected');
        // select this tab
        $(this).addClass('item-props-tab-selected');
        // unselect all tab contents
        $(el_window).find('.item-props-tab-content').removeClass('item-props-tab-content-selected');
        // select this tab content
        $(el_window).find(`.item-props-tab-content[data-tab="${$(this).attr('data-tab')}"]`).addClass('item-props-tab-content-selected');
        
        // If versions tab is clicked, reload versions (in case file was edited)
        if ($(this).attr('data-tab') === 'versions') {
            console.log('[Properties] Versions tab clicked');
            const versionListEl = $(el_window).find('.item-props-version-list');
            console.log('[Properties] Version list element:', versionListEl.length, 'has entries:', versionListEl.find('.item-prop-version-entry').length);
            
            // Always try to load if we have a file path
            const filePath = $(el_window).find('.item-prop-val-path').text();
            console.log('[Properties] File path from UI:', filePath);
            
            if (filePath && typeof loadFileVersions === 'function') {
                console.log('[Properties] Calling loadFileVersions from tab click');
                loadFileVersions(el_window, filePath);
            } else if (!filePath) {
                console.error('[Properties] No file path found in UI');
            } else {
                console.error('[Properties] loadFileVersions function not available');
            }
        }
    });

    // Function to load and display file versions
    // Defined here so it's available when called from the stat callback
    const loadFileVersions = async function(windowEl, filePath) {
        console.log('[Versions] loadFileVersions called for:', filePath);
        const versionListEl = $(windowEl).find('.item-props-version-list');
        console.log('[Versions] Version list element found:', versionListEl.length);
        versionListEl.html('<p style="color: #666;">Loading versions...</p>');

        try {
            // Determine API origin with fallback
            const apiOrigin = window.api_origin || window.location.origin;
            const authToken = puter.authToken || (window.getAuthToken && window.getAuthToken());
            
            if (!authToken) {
                throw new Error('Authentication token not available');
            }

            console.log('[Versions] Loading versions for:', filePath);
            console.log('[Versions] API Origin:', apiOrigin);
            
            const response = await fetch(`${apiOrigin}/versions?path=${encodeURIComponent(filePath)}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[Versions] API Error:', response.status, errorText);
                throw new Error(`Failed to load versions: ${response.status} - ${errorText}`);
            }

            const versions = await response.json();
            console.log('[Versions] Loaded versions:', versions.length);
            
            versionListEl.html(''); // Clear loading message

            // Update version count in General tab
            const versionCount = versions.length;
            $(windowEl).find('.item-prop-val-versions').html(versionCount > 0 ? `${versionCount} version${versionCount !== 1 ? 's' : ''}` : '0 versions');

            if (versions.length === 0) {
                versionListEl.append('<p style="color: #666;">No versions available. Versions are created automatically when you edit files.</p>');
                return;
            }

            // Display versions (newest first - already sorted by API)
            versions.forEach((version, index) => {
                const isCurrent = index === 0; // First version is the most recent (before current)
                const date = new Date(version.created_at);
                const dateStr = date.toLocaleString();
                const sizeStr = window.byte_format ? window.byte_format(version.size) : `${version.size} bytes`;
                
                const versionHtml = `
                    <div class="item-prop-version-entry" style="padding: 12px; margin-bottom: 8px; border: 1px solid #ddd; border-radius: 4px; background: ${isCurrent ? '#f0f8ff' : '#fff'};">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>Version ${version.version_number}</strong>
                                ${isCurrent ? '<span style="color: #0066cc; font-size: 11px; margin-left: 8px;">(Previous)</span>' : ''}
                                <p style="font-size: 11px; color: #666; margin: 4px 0;">${dateStr} &bull; ${sizeStr}</p>
                                ${version.comment ? `<p style="font-size: 11px; color: #888; margin: 4px 0; font-style: italic;">${html_encode(version.comment)}</p>` : ''}
                                <p style="font-size: 10px; color: #999; margin: 4px 0; font-family: monospace; word-break: break-all;">CID: ${html_encode(version.ipfs_hash)}</p>
                            </div>
                            <button class="version-restore-btn" 
                                    data-version="${version.version_number}" 
                                    data-path="${html_encode(filePath)}"
                                    style="padding: 6px 12px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                                Restore
                            </button>
                        </div>
                    </div>
                `;
                versionListEl.append(versionHtml);
            });

            // Add restore button handlers
            $(windowEl).find('.version-restore-btn').on('click', async function(e) {
                const btn = $(this);
                const versionNumber = btn.attr('data-version');
                const path = btn.attr('data-path');
                
                btn.prop('disabled', true).text('Restoring...');
                
                try {
                    const apiOrigin = window.api_origin || window.location.origin;
                    const authToken = puter.authToken || (window.getAuthToken && window.getAuthToken());
                    
                    const restoreResponse = await fetch(`${apiOrigin}/versions/${versionNumber}/restore`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authToken}`,
                        },
                        body: JSON.stringify({ path: path }),
                    });

                    if (!restoreResponse.ok) {
                        const error = await restoreResponse.json();
                        throw new Error(error.error || 'Restore failed');
                    }

                    const result = await restoreResponse.json();
                    
                    // Show success message
                    btn.text('✅ Restored').css('background', '#28a745');
                    
                    // Reload versions after a short delay
                    setTimeout(() => {
                        loadFileVersions(windowEl, path);
                        // Refresh the file in the explorer
                        if (window.refresh_item_container) {
                            const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
                            window.refresh_item_container(parentPath);
                        }
                    }, 1000);
                } catch (error) {
                    console.error('[Versions] Restore error:', error);
                    btn.text('Error').css('background', '#dc3545');
                    alert(`Failed to restore version: ${error.message}`);
                    setTimeout(() => {
                        btn.prop('disabled', false).text('Restore').css('background', '#0066cc');
                    }, 2000);
                }
            });

        } catch (error) {
            console.error('[Versions] Error loading versions:', error);
            versionListEl.html(`<p style="color: #dc3545;">Failed to load versions: ${error.message}</p><p style="font-size: 11px; color: #999; margin-top: 8px;">Check browser console for details.</p>`);
        }
    };

    // /stat
    console.log('[Properties] Calling puter.fs.stat for uid:', item_uid);
    puter.fs.stat({
        uid: item_uid,
        returnSubdomains: true,
        returnPermissions: true,
        returnVersions: true,
        returnSize: true,
        consistency: 'eventual',
        success: function (fsentry) {
            console.log('[Properties] puter.fs.stat success callback called, fsentry:', fsentry);
            // hide versions tab if item is a directory
            if ( fsentry.is_dir ) {
                console.log('[Properties] Item is directory, hiding versions tab');
                $(el_window).find('[data-tab="versions"]').hide();
            }
            // name
            $(el_window).find('.item-prop-val-name').text(fsentry.name);
            // path
            $(el_window).find('.item-prop-val-path').text(item_path);
            // original name & path
            if ( fsentry.metadata ) {
                try {
                    let metadata = JSON.parse(fsentry.metadata);
                    if ( metadata.original_name ) {
                        $(el_window).find('.item-prop-val-original-name').text(metadata.original_name);
                        $(el_window).find('.item-prop-original-name').show();
                    }
                    if ( metadata.original_path ) {
                        $(el_window).find('.item-prop-val-original-path').text(metadata.original_path);
                        $(el_window).find('.item-prop-original-path').show();
                    }
                } catch (e) {
                    // Ignored
                }
            }

            // shortcut to
            if ( fsentry.shortcut_to && fsentry.shortcut_to_path ) {
                $(el_window).find('.item-prop-val-shortcut-to').text(fsentry.shortcut_to_path);
            }
            // uid
            $(el_window).find('.item-prop-val-uid').html(fsentry.id);
            // type - use mime_type for files (e.g., 'image/jpeg'), 'Directory' for directories
            // Note: fsentry.type is 'file' | 'dir', fsentry.mime_type is the actual MIME type
            const fileType = fsentry.is_dir ? 'Directory' : (fsentry.mime_type || 'Unknown');
            // size
            $(el_window).find('.item-prop-val-size').html(fsentry.size === null || fsentry.size === undefined ? '-' : window.byte_format(fsentry.size));
            // modified
            $(el_window).find('.item-prop-val-modified').html(fsentry.modified === 0 ? '-' : timeago.format(fsentry.modified * 1000));
            // created
            $(el_window).find('.item-prop-val-created').html(fsentry.created === 0 ? '-' : timeago.format(fsentry.created * 1000));
            // IPFS Content ID (CID) with copy button (using SVG icon)
            if (fsentry.ipfs_hash) {
                // Copy icon SVG (inline for reliability)
                const copyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                const checkIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                
                const cidHtml = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <code style="font-size: 11px; word-break: break-all; flex: 1;">${html_encode(fsentry.ipfs_hash)}</code>
                        <button class="copy-cid-btn" data-cid="${html_encode(fsentry.ipfs_hash)}" 
                                style="padding: 4px 6px; cursor: pointer; border: 1px solid #ccc; border-radius: 3px; background: #fff; display: flex; align-items: center; justify-content: center;"
                                title="Copy CID to clipboard">${copyIconSvg}</button>
                    </div>
                `;
                $(el_window).find('.item-prop-val-ipfs-hash').html(cidHtml);
                
                // Copy CID button handler
                $(el_window).find('.copy-cid-btn').on('click', function() {
                    const cid = $(this).attr('data-cid');
                    const btn = $(this);
                    navigator.clipboard.writeText(cid).then(() => {
                        btn.html(checkIconSvg).css('background', '#d4edda');
                        setTimeout(() => btn.html(copyIconSvg).css('background', '#fff'), 1500);
                    }).catch(err => {
                        console.error('[Properties] Failed to copy CID:', err);
                    });
                });
                
                // Determine if file is public (in /Public folder)
                const isPublic = item_path && (item_path.startsWith('/Public/') || item_path.includes('/Public/'));
                
                // Icon SVGs for visibility badges
                const worldIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
                const shieldIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`;
                
                // Show visibility row
                $(el_window).find('.item-prop-ipfs-visibility').show();
                if (isPublic) {
                    $(el_window).find('.item-prop-val-ipfs-visibility').html(`
                        <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: #d4edda; color: #155724; border-radius: 12px; font-size: 11px;">
                            ${worldIconSvg} Public
                        </span>
                    `);
                    
                    // Show gateway URL for public files
                    const apiOrigin = window.api_origin || window.location.origin;
                    const gatewayUrl = `${apiOrigin}/ipfs/${fsentry.ipfs_hash}`;
                    $(el_window).find('.item-prop-ipfs-gateway').show();
                    $(el_window).find('.item-prop-val-ipfs-gateway').html(`
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <a href="${html_encode(gatewayUrl)}" target="_blank" 
                               style="font-size: 11px; word-break: break-all; flex: 1; color: #0066cc;">
                                ${html_encode(gatewayUrl)}
                            </a>
                            <button class="copy-gateway-btn" data-url="${html_encode(gatewayUrl)}" 
                                    style="padding: 4px 6px; cursor: pointer; border: 1px solid #ccc; border-radius: 3px; background: #fff; display: flex; align-items: center; justify-content: center;"
                                    title="Copy Gateway URL">${copyIconSvg}</button>
                        </div>
                    `);
                    
                    // Copy Gateway URL button handler
                    $(el_window).find('.copy-gateway-btn').on('click', function() {
                        const url = $(this).attr('data-url');
                        const btn = $(this);
                        navigator.clipboard.writeText(url).then(() => {
                            btn.html(checkIconSvg).css('background', '#d4edda');
                            setTimeout(() => btn.html(copyIconSvg).css('background', '#fff'), 1500);
                        }).catch(err => {
                            console.error('[Properties] Failed to copy gateway URL:', err);
                        });
                    });
                } else {
                    $(el_window).find('.item-prop-val-ipfs-visibility').html(`
                        <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: #e2e3e5; color: #383d41; border-radius: 12px; font-size: 11px;">
                            ${shieldIconSvg} Private
                        </span>
                    `);
                }
            } else {
                $(el_window).find('.item-prop-val-ipfs-hash').html('-');
            }
            // subdomains
            if ( fsentry.subdomains && fsentry.subdomains.length > 0 ) {
                fsentry.subdomains.forEach(subdomain => {
                    $(el_window).find('.item-prop-val-websites').append(`<p class="item-prop-website-entry" data-uuid="${html_encode(subdomain.uuid)}" style="margin-bottom:5px; margin-top:5px;"><a target="_blank" href="${html_encode(subdomain.address)}">${html_encode(subdomain.address)}</a> (<span class="disassociate-website-link" data-uuid="${html_encode(subdomain.uuid)}" data-subdomain="${window.extractSubdomain(subdomain.address)}">disassociate</span>)</p>`);
                });
            }
            else {
                $(el_window).find('.item-prop-val-websites').append('-');
            }
            // Load versions from our new /versions API endpoint and update version count
            console.log('[Properties] File is_dir:', fsentry.is_dir, 'path:', item_path);
            if (!fsentry.is_dir) {
                console.log('[Properties] Calling loadFileVersions for file:', item_path);
                // Call loadFileVersions - it's defined below
                if (typeof loadFileVersions === 'function') {
                    loadFileVersions(el_window, item_path);
                } else {
                    console.error('[Properties] loadFileVersions function not found!');
                    $(el_window).find('.item-props-version-list').html('<p style="color: #dc3545;">Error: Version loading function not available.</p>');
                }
            } else {
                console.log('[Properties] Item is a directory, skipping versions');
                $(el_window).find('.item-props-version-list').append('<p style="color: #666;">Versions are only available for files.</p>');
                $(el_window).find('.item-prop-val-versions').html('-');
            }

            $(el_window).find('.disassociate-website-link').on('click', function (e) {
                puter.hosting.update($(e.target).attr('data-subdomain'),
                                null).then(() => {
                    $(el_window).find(`.item-prop-website-entry[data-uuid="${$(e.target).attr('data-uuid')}"]`).remove();
                    if ( $(el_window).find('.item-prop-website-entry').length === 0 ) {
                        $(el_window).find('.item-prop-val-websites').html('-');
                        // remove the website badge from all instances of the dir
                        $(`.item[data-uid="${item_uid}"]`).find('.item-has-website-badge').fadeOut(200);
                    }
                });
            });
        },
    });
}

export default UIWindowItemProperties;