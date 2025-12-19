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
import path from '../lib/path.js';
import UIAlert from './UIAlert.js';
import launch_app from '../helpers/launch_app.js';
import item_icon from '../helpers/item_icon.js';
import UIContextMenu from './UIContextMenu.js';

// HTML encoding helper (if not available globally)
const html_encode = window.html_encode || function(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

async function UIWindowSearch (options) {
    let h = '';

    h += '<div class="search-input-wrapper">';
    h += `<input type="text" class="search-input" placeholder="Search" style="background-image:url('${window.icons['magnifier-outline.svg']}');">`;
    h += '</div>';
    
    // Search filters UI (collapsible)
    h += '<div class="search-filters-wrapper" style="display: none; padding: 8px 12px; border-top: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.5);">';
    h += '<div class="search-filters-row" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">';
    
    // Search mode toggle
    h += '<div class="search-filter-group" style="display: flex; align-items: center; gap: 4px;">';
    h += '<label style="font-size: 12px; color: #666;">Mode:</label>';
    h += '<select class="search-mode-select" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; background: white;">';
    h += '<option value="both">Filename & Content</option>';
    h += '<option value="filename">Filename Only</option>';
    h += '<option value="content">Content Only</option>';
    h += '</select>';
    h += '</div>';
    
    // File type filter
    h += '<div class="search-filter-group" style="display: flex; align-items: center; gap: 4px;">';
    h += '<label style="font-size: 12px; color: #666;">Type:</label>';
    h += '<select class="search-filetype-select" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; background: white;">';
    h += '<option value="">All Files</option>';
    h += '<option value="image">Images</option>';
    h += '<option value="video">Videos</option>';
    h += '<option value="audio">Audio</option>';
    h += '<option value="document">Documents</option>';
    h += '<option value="text">Text Files</option>';
    h += '<option value="code">Code Files</option>';
    h += '</select>';
    h += '</div>';
    
    h += '</div>'; // search-filters-row
    h += '</div>'; // search-filters-wrapper
    
    h += '<div class="search-results" style="overflow-y: auto; flex: 1; min-height: 100px; max-height: none;"></div>';
    // Note: Toggle button is added programmatically after window creation to ensure visibility

    const el_window = await UIWindow({
        icon: null,
        single_instance: true,
        app: 'search',
        uid: null,
        is_dir: false,
        body_content: h,
        has_head: false,
        selectable_body: false,
        draggable_body: true,
        allow_context_menu: false,
        is_draggable: false,
        is_resizable: false,
        is_droppable: false,
        init_center: true,
        allow_native_ctxmenu: true,
        allow_user_select: true,
        window_class: 'window-search',
        backdrop: true,
        center: window.isMobile?.phone || false,
        width: 500,
        dominant: true,

        window_css: {
            height: 'initial',
            padding: '0',
        },
        body_css: {
            width: 'initial',
            'max-height': 'calc(100vh - 200px)',
            'background-color': 'rgb(241 246 251)',
            'backdrop-filter': 'blur(3px)',
            'padding': '0',
            'height': 'auto',
            'overflow-y': 'auto',
            'overflow-x': 'hidden',
            'min-height': '65px',
            'padding-bottom': '0',
            'display': 'flex',
            'flex-direction': 'column',
            'position': 'relative',
        },
    });

    $(el_window).find('.search-input').focus();

    // Debounce function to limit rate of API calls
    function debounce (func, wait) {
        let timeout;
        return function (...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                func.apply(context, args);
            }, wait);
        };
    }

    // State for managing loading indicator
    let isSearching = false;

    // Debounced search function
    const performSearch = debounce(async function (searchInput, resultsContainer) {
        // Don't search if input is empty
        if ( searchInput.val() === '' ) {
            resultsContainer.html('');
            resultsContainer.hide();
            return;
        }

        // Set loading state
        if ( ! isSearching ) {
            isSearching = true;
        }

        try {
            // Detect if input looks like an IPFS CID
            // IPFS CIDs typically start with 'bafkrei', 'Qm', 'bafy', 'bafz', etc.
            const searchValue = searchInput.val().trim();
            const isCID = /^(bafkrei|bafy|bafz|Qm|z[a-z0-9]+)/i.test(searchValue);
            
            // Get filter values
            const searchMode = $(el_window).find('.search-mode-select').val() || 'both';
            const fileType = $(el_window).find('.search-filetype-select').val() || '';
            
            // Build search request
            const searchRequest = isCID && searchValue.length >= 10
                ? { ipfsHash: searchValue }  // CID search
                : { 
                    text: searchValue,
                    searchMode: searchMode,
                    fileType: fileType || undefined
                  };
            
            // Perform the search
            let results = await fetch(`${window.api_origin }/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${puter.authToken}`,
                },
                body: JSON.stringify(searchRequest),
            });

            results = await results.json();

            // Hide results if there are none
            if ( results.length === 0 )
            {
                resultsContainer.hide();
            }
            else
            {
                resultsContainer.show();
            }

            // Build results HTML
            let h = '';

            for ( let i = 0; i < results.length; i++ ) {
                const result = results[i];
                // Prepare fsentry object for item_icon (includes thumbnail for proper display)
                const fsentry = {
                    path: result.path,
                    name: result.name,
                    type: result.type,
                    is_dir: result.is_dir,
                    thumbnail: result.thumbnail || null
                };
                
                const iconResult = await item_icon(fsentry);
                const isThumbnail = iconResult.type === 'thumb';
                
                h += `<div 
                        class="search-result"
                        data-path="${html_encode(result.path)}" 
                        data-uid="${html_encode(result.uid)}"
                        data-is_dir="${html_encode(result.is_dir)}"
                    >`;
                // Use thumbnail styling if it's a thumbnail, otherwise use icon styling
                if (isThumbnail) {
                    h += `<img src="${html_encode(iconResult.image)}" class="search-result-thumb" style="width: 40px; height: 40px; margin-right: 8px; object-fit: cover; border-radius: 4px;">`;
                } else {
                    h += `<img src="${html_encode(iconResult.image)}" class="search-result-icon" style="width: 20px; height: 20px; margin-right: 8px;">`;
                }
                h += html_encode(result.name);
                h += '</div>';
            }
            // Only update the inner content, don't replace the entire container
            resultsContainer.html(h);
        } catch ( error ) {
            resultsContainer.html('<div class="search-error">Search failed. Please try again.</div>');
            console.error('Search error:', error);
        } finally {
            isSearching = false;
        }
    }, 300); // Wait 300ms after last keystroke before searching

    // Event binding
    $(el_window).find('.search-input').on('input', function (e) {
        const searchInput = $(this);
        const resultsContainer = $(el_window).find('.search-results');
        performSearch(searchInput, resultsContainer);
    });
    
    
    // Set up filter change listeners
    $(el_window).find('.search-mode-select, .search-filetype-select').on('change', function () {
        const searchInput = $(el_window).find('.search-input');
        const resultsContainer = $(el_window).find('.search-results');
        performSearch(searchInput, resultsContainer);
    });
    
}

$(document).on('click', '.search-result', async function (e) {
    const fspath = $(this).data('path');
    const fsuid = $(this).data('uid');
    const is_dir = $(this).attr('data-is_dir') === 'true' || $(this).data('is_dir') === '1';
    let open_item_meta;

    if ( is_dir ) {
        UIWindow({
            path: fspath,
            title: path.basename(fspath),
            icon: await item_icon({ is_dir: true, path: fspath }),
            uid: fsuid,
            is_dir: is_dir,
            app: 'explorer',
        });

        // close search window
        $(this).closest('.window').close();

        return;
    }

    // get all info needed to open an item
    try {
        open_item_meta = await $.ajax({
            url: `${window.api_origin }/open_item`,
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                uid: fsuid ?? undefined,
                path: fspath ?? undefined,
            }),
            headers: {
                'Authorization': `Bearer ${window.auth_token}`,
            },
            statusCode: {
                401: function () {
                    window.logout();
                },
            },
        });
    } catch ( err ) {
        // Ignored
    }

    // get a list of suggested apps for this file type.
    let suggested_apps = open_item_meta?.suggested_apps ?? await window.suggest_apps_for_fsentry({ uid: fsuid, path: fspath });

    //---------------------------------------------
    // No suitable apps, ask if user would like to
    // download
    //---------------------------------------------
    if ( suggested_apps.length === 0 ) {
        //---------------------------------------------
        // If .zip file, unzip it
        //---------------------------------------------
        if ( path.extname(fspath) === '.zip' ) {
            window.unzipItem(fspath);
            return;
        }
        const alert_resp = await UIAlert('Found no suitable apps to open this file with. Would you like to download it instead?',
                        [
                            {
                                label: i18n('download_file'),
                                value: 'download_file',
                                type: 'primary',

                            },
                            {
                                label: i18n('cancel'),
                            },
                        ]);
        if ( alert_resp === 'download_file' ) {
            window.trigger_download([fspath]);
        }
        return;
    }
    //---------------------------------------------
    // First suggested app is default app to open this item
    //---------------------------------------------
    else {
        launch_app({
            name: suggested_apps[0].name,
            token: open_item_meta.token,
            file_path: fspath,
            app_obj: suggested_apps[0],
            window_title: path.basename(fspath),
            file_uid: fsuid,
            // maximized: options.maximized,
            file_signature: open_item_meta.signature,
        });
    }

    // close
    $(this).closest('.window').close();
});

// Context menu for search results
$(document).on('contextmenu', '.search-result', async function (e) {
    e.preventDefault();
    e.stopPropagation();

    const fspath = $(this).data('path');
    const fsuid = $(this).data('uid');
    const is_dir = $(this).attr('data-is_dir') === 'true' || $(this).data('is_dir') === '1';

    // Get the parent directory path
    const parent_path = path.dirname(fspath);

    // Build context menu items
    const menuItems = [
        {
            html: i18n('open'),
            onClick: async function () {
                // Trigger the same logic as clicking on the search result
                $(e.target).trigger('click');
            },
        },
    ];

    // Only add "Open enclosing folder" if we're not already at root
    if ( parent_path && parent_path !== fspath && parent_path !== '/' ) {
        menuItems.push('-'); // divider
        menuItems.push({
            html: i18n('open_containing_folder'),
            onClick: async function () {
                // Open the enclosing folder
                UIWindow({
                    path: parent_path,
                    title: path.basename(parent_path) || window.root_dirname,
                    icon: window.icons['folder.svg'],
                    is_dir: true,
                    app: 'explorer',
                });

                // Close search window
                $(e.target).closest('.window').close();
            },
        });
    }

    UIContextMenu({
        items: menuItems,
    });
});

// Make UIWindowSearch available globally for keyboard shortcuts and toolbar
if (typeof window !== 'undefined') {
    window.UIWindowSearch = UIWindowSearch;
}

export default UIWindowSearch;