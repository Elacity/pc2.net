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

import path from '../lib/path.js';
import UIItem from '../UI/UIItem.js';
import item_icon from './item_icon.js';

const refresh_item_container = function (el_item_container, options) {
    // start a transaction (if available)
    const transaction = window.Transaction ? new window.Transaction('refresh-item-container') : { start: () => {}, end: () => {} };
    transaction.start();

    options = options || {};

    let container_path =  $(el_item_container).attr('data-path');
    false && console.log('[refresh_item_container] Refreshing container:', container_path, 'element classes:', $(el_item_container).attr('class'));
    let el_window = $(el_item_container).closest('.window');
    let el_window_head_icon = $(el_window).find('.window-head-icon');
    const loading_spinner = $(el_item_container).find('.explorer-loading-spinner');
    const error_message = $(el_item_container).find('.explorer-error-message');
    const empty_message = $(el_item_container).find('.explorer-empty-message');

    if ( options.fadeInItems )
    {
        $(el_item_container).css('opacity', '0');
    }

    // Hide the 'This folder is empty' message to avoid the flickering effect
    // if the folder is not empty.
    $(el_item_container).find('.explorer-empty-message').hide();

    // Hide the loading spinner to avoid the flickering effect if the folder
    // is already loaded.
    $(loading_spinner).hide();

    // Hide the error message in case it's visible
    $(error_message).hide();

    // current timestamp in milliseconds
    let start_ts = new Date().getTime();

    // A timeout that will show the loading spinner if the folder is not loaded
    // after 1000ms
    let loading_timeout = setTimeout(function () {
        // make sure the same folder is still loading
        if ( $(loading_spinner).closest('.item-container').attr('data-path') !== container_path )
        {
            return;
        }

        // show the loading spinner
        $(loading_spinner).show();
        setTimeout(function () {
            $(loading_spinner).find('.explorer-loading-spinner-msg').html('Taking a little longer than usual. Please wait...');
        }, 3000);
    }, 1000);

    // --------------------------------------------------------
    // Folder's configs and properties
    // --------------------------------------------------------
    puter.fs.stat({ path: container_path, consistency: options.consistency ?? 'eventual' }).then(fsentry => {
        if ( el_window ) {
            $(el_window).attr('data-uid', fsentry.id);
            $(el_window).attr('data-sort_by', fsentry.sort_by ?? 'name');
            $(el_window).attr('data-sort_order', fsentry.sort_order ?? 'asc');
            $(el_window).attr('data-layout', fsentry.layout ?? 'icons');
            // data-name
            $(el_window).attr('data-name', html_encode(fsentry.name));
            // data-path
            $(el_window).attr('data-path', html_encode(container_path));
            $(el_window).find('.window-navbar-path-input').val(container_path);
            $(el_window).find('.window-navbar-path-input').attr('data-path', container_path);
            
            // Handle Public folder banner - remove first, then add if needed
            const windowBody = el_window.find('.window-body')[0];
            if (windowBody) {
                // Always remove existing banner first
                const existingBanner = windowBody.querySelector('.public-folder-banner');
                if (existingBanner) {
                    existingBanner.remove();
                }
                
                // Check if this is the Public folder (path ends with /Public or contains /Public/)
                const isPublicFolder = container_path && (
                    container_path.endsWith('/Public') || 
                    container_path.includes('/Public/')
                );
                
                if (isPublicFolder) {
                    const banner = document.createElement('div');
                    banner.className = 'public-folder-banner';
                    banner.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 10px 15px; margin: 10px 10px 0 10px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; font-size: 12px; color: #856404; position: relative; z-index: 10;';
                    banner.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg><span><strong>Public Folder</strong> - Files here are publicly accessible via IPFS. Anyone with the link can find them.</span>';
                    windowBody.insertBefore(banner, windowBody.firstChild);
                }
            }
        }
        $(el_item_container).attr('data-sort_by', fsentry.sort_by ?? 'name');
        $(el_item_container).attr('data-sort_order', fsentry.sort_order ?? 'asc');
        // update layout
        if ( el_window && el_window.length > 0 )
        {
            window.update_window_layout(el_window, fsentry.layout);
        }
        //
        if ( fsentry.layout === 'details' ) {
            window.update_details_layout_sort_visuals(el_window, fsentry.sort_by, fsentry.sort_order);
        }
    });

    // is_directoryPicker
    let is_directoryPicker = $(el_window).attr('data-is_directoryPicker');
    is_directoryPicker = (is_directoryPicker === 'true' || is_directoryPicker === '1') ? true : false;

    // allowed_file_types
    let allowed_file_types = $(el_window).attr('data-allowed_file_types');

    // is_directoryPicker
    let is_openFileDialog = $(el_window).attr('data-is_openFileDialog');
    is_openFileDialog = (is_openFileDialog === 'true' || is_openFileDialog === '1') ? true : false;

    // remove all existing items
    $(el_item_container).find('.item').removeItems();

    // get items
    // Use 'strong' consistency for Desktop to ensure fresh data (Desktop cache can be stale)
    const consistency = (container_path === window.desktop_path) ? 'strong' : (options.consistency ?? 'eventual');
    puter.fs.readdir({ path: container_path, consistency: consistency }).then((fsentries) => {
        console.log(`[refresh_item_container] readdir returned ${fsentries ? fsentries.length : 0} entries for: ${container_path} (consistency: ${consistency})`);
        
        // Check if the same folder is still loading since el_item_container's
        // data-path might have changed by other operations while waiting for the response to this `readdir`.
        if ( $(el_item_container).attr('data-path') !== container_path )
        {
            console.warn(`[refresh_item_container] Container path changed during readdir: ${container_path} -> ${$(el_item_container).attr('data-path')}`);
            return;
        }

        setTimeout(async function () {
            // clear loading timeout
            clearTimeout(loading_timeout);

            // hide loading spinner
            $(loading_spinner).hide();

            // if no items, show empty folder message
            if ( fsentries.length === 0 ) {
                $(el_item_container).find('.explorer-empty-message').show();
            }

            // trash icon
            if ( container_path === window.trash_path && el_window_head_icon ) {
                if ( fsentries.length > 0 ) {
                    $(el_window_head_icon).attr('src', window.icons['trash-full.svg']);
                } else {
                    $(el_window_head_icon).attr('src', window.icons['trash.svg']);
                }
            }

            // add each item to window
            for ( let index = 0; index < fsentries.length; index++ ) {
                const fsentry = fsentries[index];
                let is_disabled = false;

                // disable files if this is a showDirectoryPicker() window
                if ( is_directoryPicker && !fsentry.is_dir )
                {
                    is_disabled = true;
                }

                // if this item is not allowed because of filetype restrictions, disable it
                if ( ! window.check_fsentry_against_allowed_file_types_string(fsentry, allowed_file_types) )
                {
                    is_disabled = true;
                }

                // set visibility based on user preferences and whether file is hidden by default
                const is_hidden_file = fsentry.name.startsWith('.');
                let visible;
                if ( ! is_hidden_file ) {
                    visible = 'visible';
                } else if ( window.user_preferences.show_hidden_files ) {
                    visible = 'revealed';
                } else {
                    visible = 'hidden';
                }

                // metadata
                let metadata;
                if ( fsentry.metadata !== '' ) {
                    try {
                        metadata = JSON.parse(fsentry.metadata);
                    }
                    catch (e) {
                        // Ignored
                    }
                }

                // For desktop background, el_window is null, so use container_path instead
                const parentPath = $(el_window).attr('data-path') || container_path;
                const item_path = fsentry.path ?? path.join(parentPath, fsentry.name);
                // render any item but Trash/AppData
                if ( item_path !== window.trash_path && item_path !== window.appdata_path ) {
                    // CRITICAL: Check if item already exists to prevent duplicates (can happen if socket events fire during refresh)
                    // Use filter() instead of selector to avoid jQuery selector syntax errors with special characters
                    const existingItemByUid = $(el_item_container).find(`.item[data-uid="${fsentry.uid}"]`);
                    const existingItemByPath = $(el_item_container).find('.item').filter(function() {
                        return $(this).attr('data-path') === item_path;
                    });
                    if (existingItemByUid.length > 0 || existingItemByPath.length > 0) {
                        console.log(`[refresh_item_container]: Item already exists, skipping duplicate: ${fsentry.name} (uid: ${fsentry.uid}, path: ${item_path})`);
                        continue; // Skip this item, move to next
                    }
                    
                    // if this is trash, get original name from item metadata
                    fsentry.name = (metadata && metadata.original_name !== undefined) ? metadata.original_name : fsentry.name;
                    const position = window.desktop_item_positions[fsentry.uid] ?? undefined;
                    UIItem({
                        appendTo: el_item_container,
                        uid: fsentry.uid,
                        immutable: fsentry.immutable || fsentry.writable === false,
                        associated_app_name: fsentry.associated_app?.name,
                        path: item_path,
                        icon: await item_icon(fsentry),
                        name: (metadata && metadata.original_name !== undefined) ? metadata.original_name : fsentry.name,
                        is_dir: fsentry.is_dir,
                        multiselectable: !is_openFileDialog,
                        has_website: fsentry.has_website,
                        is_shared: fsentry.is_shared,
                        metadata: fsentry.metadata,
                        is_shortcut: fsentry.is_shortcut,
                        shortcut_to: fsentry.shortcut_to,
                        shortcut_to_path: fsentry.shortcut_to_path,
                        size: fsentry.size,
                        type: fsentry.type,
                        modified: fsentry.modified,
                        suggested_apps: fsentry.suggested_apps,
                        disabled: is_disabled,
                        visible: visible,
                        position: position,
                        ipfs_hash: fsentry.ipfs_hash,
                    });
                }
            }

            // if this is desktop, add Trash
            if ( $(el_item_container).hasClass('desktop') ) {
                try {
                    const trash = await puter.fs.stat({ path: window.trash_path, consistency: options.consistency ?? 'eventual' });
                    // CRITICAL: Check if Trash icon already exists to prevent duplicates
                    // Use filter() to avoid jQuery selector syntax errors
                    const existingTrashByUid = $(el_item_container).find(`.item[data-uid="${trash.id}"]`);
                    const existingTrashByPath = $(el_item_container).find('.item').filter(function() {
                        return $(this).attr('data-path') === window.trash_path;
                    });
                    if (existingTrashByUid.length === 0 && existingTrashByPath.length === 0) {
                        UIItem({
                            appendTo: el_item_container,
                            uid: trash.id,
                            immutable: trash.immutable,
                            path: window.trash_path,
                            icon: { image: (trash.is_empty ? window.icons['trash.svg'] : window.icons['trash-full.svg']), type: 'icon' },
                            name: trash.name,
                            is_dir: trash.is_dir,
                            sort_by: trash.sort_by,
                            type: trash.type,
                            is_trash: true,
                            sortable: false,
                        });
                        window.sort_items(el_item_container, $(el_item_container).attr('data-sort_by'), $(el_item_container).attr('data-sort_order'));
                    } else {
                        false && console.log('[refresh_item_container]: Trash icon already exists, skipping duplicate');
                    }
                } catch (e) {
                    // Log error for debugging (but don't break the UI)
                    console.warn('[refresh_item_container]: Failed to add Trash icon to desktop:', e);
                    console.warn('[refresh_item_container]: Trash path:', window.trash_path);
                }
            }
            // sort items
            window.sort_items(el_item_container,
                            $(el_item_container).attr('data-sort_by'),
                            $(el_item_container).attr('data-sort_order'));

            if ( options.fadeInItems ) {
                $(el_item_container).animate({ 'opacity': '1' }, {
                    complete: () => {
                        // Call onComplete callback when fade-in animation is done
                        if ( options.onComplete && typeof options.onComplete === 'function' ) {
                            options.onComplete();
                        }
                    },
                });
            } else {
                // If no fade-in animation, call onComplete immediately
                if ( options.onComplete && typeof options.onComplete === 'function' ) {
                    options.onComplete();
                }
            }

            // update footer item count if this is an explorer window
            if ( el_window )
            {
                window.update_explorer_footer_item_count(el_window);
            }

            // end the transaction
            transaction.end();
        },
        // This makes sure the loading spinner shows up if the request takes longer than 1 second
        // and stay there for at least 1 second since the flickering is annoying
        (Date.now() - start_ts) > 1000 ? 1000 : 1);
    }).catch(e => {
        // end the transaction
        transaction.end();

        // clear loading timeout
        clearTimeout(loading_timeout);

        // hide other messages/indicators
        $(loading_spinner).hide();
        $(empty_message).hide();

        // show error message
        $(error_message).html(`Failed to load directory${ html_encode((e && e.message ? `: ${ e.message}` : ''))}`);
        $(error_message).show();

        // Call onComplete callback even in error case, since the "loading" is technically complete
        if ( options.onComplete && typeof options.onComplete === 'function' ) {
            options.onComplete();
        }
    });
};

export default refresh_item_container;