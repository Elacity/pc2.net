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

import path from "../lib/path.js"
import UIWindowClaimReferral from "./UIWindowClaimReferral.js"
import UIContextMenu from './UIContextMenu.js'
import UIItem from './UIItem.js'
import UIAlert from './UIAlert.js'
import UIWindow from './UIWindow.js'
import UIWindowSaveAccount from './UIWindowSaveAccount.js';
import UIWindowDesktopBGSettings from "./UIWindowDesktopBGSettings.js"
import UIWindowMyWebsites from "./UIWindowMyWebsites.js"
import UIWindowFeedback from "./UIWindowFeedback.js"
import UIWindowLogin from "./UIWindowLogin.js"
import UIWindowQR from "./UIWindowQR.js"
import UIWindowRefer from "./UIWindowRefer.js"
import UITaskbar from "./UITaskbar.js"
import new_context_menu_item from "../helpers/new_context_menu_item.js"
import refresh_item_container from "../helpers/refresh_item_container.js"
import changeLanguage from "../i18n/i18nChangeLanguage.js"
import UIWindowSettings from "./Settings/UIWindowSettings.js"
import UIWindowTaskManager from "./UIWindowTaskManager.js"
import truncate_filename from '../helpers/truncate_filename.js';
import UINotification from "./UINotification.js"
import UIWindowWelcome from "./UIWindowWelcome.js"
import launch_app from "../helpers/launch_app.js"
import item_icon from "../helpers/item_icon.js"
import UIWindowSearch from "./UIWindowSearch.js"
import UIAccountSidebar from "./UIAccountSidebar.js"
import walletService from "../services/WalletService.js"
import initPC2StatusBar from "./UIPC2StatusBar.js"

async function UIDesktop(options) {
    let h = '';

    // Initialize wallet service early if user has a wallet
    if (window.user?.wallet_address) {
        console.log('[UIDesktop]: Initializing wallet service for:', window.user.wallet_address);
        walletService.initialize();
    }

    // Set up the desktop channel for communication between different tabs in the same browser
    window.channel = new BroadcastChannel('puter-desktop-channel');
    channel.onmessage = function (e) {
    }

    // Initialize desktop icons visibility preference - move this earlier in the initialization
    // Add this near the very beginning of the UIDesktop function
    window.desktop_icons_hidden = false; // Set default value immediately

    // Initialize the preference early
    puter.kv.get('desktop_icons_hidden').then(async (val) => {
        window.desktop_icons_hidden = val === 'true';

        // Apply the setting immediately if needed
        if (window.desktop_icons_hidden) {
            hideDesktopIcons();
        }
    });

    // Initialize toolbar auto-hide preference
    window.toolbar_auto_hide_enabled = false; // Set default value - toolbar visible by default

    // Load the toolbar auto-hide preference
    let toolbar_auto_hide_enabled_val = await puter.kv.get('toolbar_auto_hide_enabled');
    if(toolbar_auto_hide_enabled_val === 'false' || toolbar_auto_hide_enabled_val === false){
        window.toolbar_auto_hide_enabled = false;
    }

    // Modify the hide/show functions to use CSS rules that will apply to all icons, including future ones
    window.hideDesktopIcons = function () {
        // Add a CSS class to the desktop container that will hide all child icons
        $('.desktop.item-container').addClass('desktop-icons-hidden');
    };

    window.showDesktopIcons = function () {
        // Remove the CSS class to show all icons
        $('.desktop.item-container').removeClass('desktop-icons-hidden');
    };

    // Add this function to the global scope
    window.toggleDesktopIcons = function () {
        window.desktop_icons_hidden = !window.desktop_icons_hidden;

        if (window.desktop_icons_hidden) {
            hideDesktopIcons();
        } else {
            showDesktopIcons();
        }

        // Save preference
        puter.kv.set('desktop_icons_hidden', window.desktop_icons_hidden.toString());
    };

    // Give Camera and Recorder write permissions to Desktop
    puter.kv.get('has_set_default_app_user_permissions').then(async (user_permissions) => {
        if (!user_permissions) {
            // Camera
            try {
                await fetch(window.api_origin + "/auth/grant-user-app", {
                    "headers": {
                        "Content-Type": "application/json",
                        "Authorization": "Bearer " + window.auth_token,
                    },
                    "body": JSON.stringify({
                        app_uid: 'app-5584fbf7-ed69-41fc-99cd-85da21b1ef51',
                        permission: `fs:${html_encode(window.desktop_path)}:write`
                    }),
                    "method": "POST",
                });
            } catch (err) {
                console.error(err);
            }

            // Recorder
            try {
                await fetch(window.api_origin + "/auth/grant-user-app", {
                    "headers": {
                        "Content-Type": "application/json",
                        "Authorization": "Bearer " + window.auth_token,
                    },
                    "body": JSON.stringify({
                        app_uid: 'app-7bdca1a4-6373-4c98-ad97-03ff2d608ca1',
                        permission: `fs:${html_encode(window.desktop_path)}:write`
                    }),
                    "method": "POST",
                });
            } catch (err) {
                console.error(err);
            }

            // Set flag to true
            puter.kv.set('has_set_default_app_user_permissions', true);
        }
    })
    // connect socket.
    window.socket = io(window.gui_origin + '/', {
        auth: {
            auth_token: window.auth_token
        }
    });

    window.socket.on('error', (error) => {
        console.error('GUI Socket Error:', error);
    });

    window.socket.on('connect', function () {
        // console.log('GUI Socket: Connected', window.socket.id);
        window.socket.emit('puter_is_actually_open');
    });

    window.socket.on('reconnect', function () {
        console.log('GUI Socket: Reconnected', window.socket.id);
    });

    window.socket.on('disconnect', () => {
        console.log('GUI Socket: Disconnected');
    });

    window.socket.on('reconnect', (attempt) => {
        console.log('GUI Socket: Reconnection', attempt);
    });

    window.socket.on('reconnect_attempt', (attempt) => {
        console.log('GUI Socket: Reconnection Attemps', attempt);
    });

    window.socket.on('reconnect_error', (error) => {
        console.log('GUI Socket: Reconnection Error', error);
    });

    window.socket.on('reconnect_failed', () => {
        console.log('GUI Socket: Reconnection Failed');
    });

    window.socket.on('error', (error) => {
        console.error('GUI Socket Error:', error);
    });

    window.socket.on('upload.progress', (msg) => {
        if (window.progress_tracker[msg.operation_id]) {
            window.progress_tracker[msg.operation_id].cloud_uploaded += msg.loaded_diff
            if (window.progress_tracker[msg.operation_id][msg.item_upload_id]) {
                window.progress_tracker[msg.operation_id][msg.item_upload_id].cloud_uploaded = msg.loaded;
            }
        }
    });

    window.socket.on('download.progress', (msg) => {
        if (window.progress_tracker[msg.operation_id]) {
            if (window.progress_tracker[msg.operation_id][msg.item_upload_id]) {
                window.progress_tracker[msg.operation_id][msg.item_upload_id].downloaded = msg.loaded;
                window.progress_tracker[msg.operation_id][msg.item_upload_id].total = msg.total;
            }
        }
    });

    window.socket.on('trash.is_empty', async (msg) => {
        $(`.item[data-path="${html_encode(window.trash_path)}" i]`).find('.item-icon > img').attr('src', msg.is_empty ? window.icons['trash.svg'] : window.icons['trash-full.svg']);
        $(`.window[data-path="${html_encode(window.trash_path)}" i]`).find('.window-head-icon').attr('src', msg.is_empty ? window.icons['trash.svg'] : window.icons['trash-full.svg']);
        // empty trash windows if needed
        if (msg.is_empty)
            $(`.window[data-path="${html_encode(window.trash_path)}" i]`).find('.item-container').empty();
    })

    /**
     * This event is triggered if a user receives a notification during
     * an active session.
     */
    window.socket.on('notif.message', async ({ uid, notification }) => {
        let icon = window.icons[notification.icon];
        let round_icon = false;

        if (notification.template === "file-shared-with-you" && notification.fields?.username) {
            let profile_pic = await get_profile_picture(notification.fields?.username);
            if (profile_pic) {
                icon = profile_pic;
                round_icon = true;
            }
        }

        UINotification({
            title: notification.title,
            text: notification.text,
            icon: icon,
            round_icon: round_icon,
            value: notification,
            uid,
            close: async () => {
                await fetch(`${window.api_origin}/notif/mark-ack`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${puter.authToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ uid }),
                });
            },
            click: async (notif) => {
                if (notification.template === "file-shared-with-you") {
                    let item_path = '/' + notification.fields.username;
                    UIWindow({
                        path: '/' + notification.fields.username,
                        title: path.basename(item_path),
                        icon: await item_icon({ is_dir: true, path: item_path }),
                        is_dir: true,
                        app: 'explorer',
                    });
                }
            },
        });
    });

    /**
     * This event is triggered at the beginning of the session, after a websocket
     * connection is established, because the backend informs the frontend of all
     * unread notifications.
     * 
     * It is not necessary to query unreads separately. If this stops working,
     * then this event should be fixed rather than querying unreads separately.
     */
    window.__already_got_unreads = false;
    window.socket.on('notif.unreads', async ({ unreads }) => {
        if (window.__already_got_unreads) return;
        window.__already_got_unreads = true;

        for (const notif_info of unreads) {
            const notification = notif_info.notification;
            let icon = window.icons[notification.icon];
            let round_icon = false;

            if (notification.template === "file-shared-with-you" && notification.fields?.username) {
                let profile_pic = await get_profile_picture(notification.fields?.username);
                if (profile_pic) {
                    icon = profile_pic;
                    round_icon = true;
                }
            }

            UINotification({
                icon,
                round_icon,
                title: notification.title,
                text: notification.text ?? notification.title,
                uid: notif_info.uid,
                close: async () => {
                    await fetch(`${window.api_origin}/notif/mark-ack`, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${puter.authToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            uid: notif_info.uid,
                        }),
                    });
                },
                click: async (notif) => {
                    if (notification.template === "file-shared-with-you") {
                        let item_path = '/' + notification.fields?.username;
                        UIWindow({
                            path: '/' + notification.fields?.username,
                            title: path.basename(item_path),
                            icon: await item_icon({ is_dir: true, path: item_path }),
                            is_dir: true,
                            app: 'explorer',
                        });
                    }
                },
            });
        }
    });

    window.socket.on('notif.ack', ({ uid }) => {
        $(`.notification[data-uid="${uid}"]`).remove();
        update_tab_notif_count_badge();
    });

    window.socket.on('app.opened', async (app) => {
        // don't update if this is the original client that initiated the action
        if (app.original_client_socket_id === window.socket.id)
            return;

        // add the app to the beginning of the array
        window.launch_apps.recent.unshift(app);

        // dedupe the array by uuid, uid, and id
        window.launch_apps.recent = _.uniqBy(window.launch_apps.recent, 'name');

        // limit to 5
        window.launch_apps.recent = window.launch_apps.recent.slice(0, window.launch_recent_apps_count);
    })

    window.socket.on('item.removed', async (item) => {
        console.log('[Frontend] ✅ Received item.removed event:', item, 'socket.id:', window.socket.id);
        
        // don't update if this is the original client that initiated the action
        if (item.original_client_socket_id === window.socket.id) {
            console.log('[Frontend] ⏭️  Skipping item.removed - same client (socket.id:', window.socket.id, 'original_client_socket_id:', item.original_client_socket_id, ')');
            return;
        }

        // don't remove items if this was a descendants_only operation
        if (item.descendants_only) {
            console.log('[Frontend] ⏭️  Skipping item.removed - descendants_only operation');
            return;
        }

        console.log('[Frontend] 🔍 Looking for items with data-path:', item.path);
        // Use html_encode for path selector (matching other handlers)
        const encodedPath = html_encode(item.path);
        const matchingItems = $(`.item[data-path="${encodedPath}" i]`);
        console.log('[Frontend] 📦 Found', matchingItems.length, 'matching items');
        
        if (matchingItems.length === 0) {
            console.warn('[Frontend] ⚠️ No items found with data-path:', item.path, '- trying without case sensitivity');
            // Try without html_encode as fallback
            const fallbackItems = $(`.item[data-path="${item.path}" i]`);
            console.log('[Frontend] 📦 Fallback search found', fallbackItems.length, 'items');
            if (fallbackItems.length > 0) {
                fallbackItems.fadeOut(150, function() {
                    $(this).remove();
                    $(`.window[data-path^="${html_encode(item.path)}/"]`).close();
                });
            }
            return;
        }
        
        // hide all UIItems with matching paths, then remove from DOM
        matchingItems.fadeOut(150, function () {
            // Actually remove from DOM after fadeout
            $(this).remove();
            // close all windows that belong to a descendant of this item
            $(`.window[data-path^="${html_encode(item.path)}/"]`).close();
            console.log('[Frontend] ✅ Removed', matchingItems.length, 'item(s) from DOM');
        });
    })

    window.socket.on('item.updated', async (item) => {
        console.log('[UIDesktop] item.updated event received', {
            uid: item.uid,
            path: item.path,
            hasThumbnail: !!item.thumbnail,
            thumbnail: item.thumbnail?.substring(0, 50) + '...',
            original_client_socket_id: item.original_client_socket_id,
            current_socket_id: window.socket.id
        });
        
        // For thumbnail updates (image saves), always update regardless of socket ID
        // This ensures thumbnails refresh immediately after save
        const isThumbnailUpdate = item.thumbnail && !item.is_dir;
        
        // Don't update if this is the original client that initiated the action (unless it's a thumbnail update)
        if (!isThumbnailUpdate && item.original_client_socket_id === window.socket.id) {
            console.log('[UIDesktop] Skipping item.updated - same client that initiated action');
            return;
        }

        // Update matching items
        // set new item name
        $(`.item[data-uid='${html_encode(item.uid)}'] .item-name`).html(html_encode(truncate_filename(item.name)));

        // Set new icon - use thumbnail directly if provided (for live updates), otherwise generate via item_icon
        let new_icon;
        if (item.thumbnail && !item.is_dir) {
            // Use provided thumbnail URL directly (includes cache-busting for live updates)
            new_icon = item.thumbnail;
            console.log('[UIDesktop] Using provided thumbnail for live update:', new_icon.substring(0, 80) + '...');
        } else {
            // Generate icon via item_icon (for non-image files or when thumbnail not provided)
            new_icon = (item.is_dir ? window.icons['folder.svg'] : (await item_icon(item)).image);
            console.log('[UIDesktop] Generated icon via item_icon:', new_icon.substring(0, 80) + '...');
        }
        
        // Find elements and force reload
        let itemElements = $(`.item[data-uid='${item.uid}']`);
        if (itemElements.length === 0) {
            console.warn('[UIDesktop] No item elements found for uid:', item.uid, '- attempting to create item or refresh container');
            
            // If this is a thumbnail update and item doesn't exist, try to find/create it
            if (isThumbnailUpdate && item.path) {
                // Try to find the container for this path
                const containerPath = path.dirname(item.path);
                const containers = $(`.item-container[data-path="${html_encode(containerPath)}" i]`);
                
                if (containers.length > 0) {
                    // Refresh the container to ensure the item is created
                    console.log('[UIDesktop] Refreshing container to create missing item:', containerPath);
                    await refresh_item_container(containers[0], { consistency: 'strong' });
                    
                    // Try to find the item again after refresh
                    itemElements = $(`.item[data-uid='${item.uid}']`);
                    if (itemElements.length === 0) {
                        console.warn('[UIDesktop] Item still not found after container refresh');
                        return;
                    }
                } else {
                    console.warn('[UIDesktop] Container not found for path:', containerPath);
                    return;
                }
            } else {
                return;
            }
        }
        
        const thumbElement = itemElements.find('.item-icon-thumb');
        const iconElement = itemElements.find('.item-icon-icon');
        
        console.log('[UIDesktop] Updating thumbnail', {
            foundElements: itemElements.length,
            foundThumb: thumbElement.length,
            foundIcon: iconElement.length,
            newIcon: new_icon.substring(0, 60) + '...'
        });
        
        // Force reload by creating a new Image object to bypass browser cache
        const updateThumbnail = (element, iconUrl) => {
            if (element.length === 0) return;
            
            const oldSrc = element.attr('src');
            // Add timestamp cache-buster if not already present
            const cacheBuster = iconUrl.includes('_cid=') || iconUrl.includes('_t=') 
                ? iconUrl 
                : iconUrl + (iconUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
            
            // Create new Image object to force browser to fetch fresh image
            const img = new Image();
            img.onload = function() {
                // Image loaded successfully, update the element
                element.attr('src', cacheBuster);
                console.log('[UIDesktop] ✅ Thumbnail image loaded and updated', {
                    old: oldSrc?.substring(0, 50),
                    new: cacheBuster.substring(0, 50)
                });
            };
            img.onerror = function() {
                // Fallback: update src directly even if preload failed
                element.attr('src', cacheBuster);
                console.warn('[UIDesktop] ⚠️ Thumbnail preload failed, updated src directly');
            };
            // Trigger load by setting src
            img.src = cacheBuster;
        };
        
        // Update both thumbnail and icon elements
        updateThumbnail(thumbElement, new_icon);
        updateThumbnail(iconElement, new_icon);
        
        // For thumbnail updates, also refresh the parent container to ensure the item is fully updated
        // This matches the behavior of item.moved which refreshes the container
        if (isThumbnailUpdate && itemElements.length > 0) {
            const parentContainer = itemElements.closest('.item-container');
            if (parentContainer.length > 0) {
                const containerPath = parentContainer.attr('data-path');
                if (containerPath) {
                    console.log('[UIDesktop] Refreshing parent container for thumbnail update:', containerPath);
                    // Trigger a lightweight refresh of just this item's container
                    // This ensures the thumbnail is fully updated
                    refresh_item_container(parentContainer[0], { consistency: 'strong' });
                }
            }
        }

        // Set new data-name
        $(`.item[data-uid='${item.uid}']`).attr('data-name', html_encode(item.name));
        $(`.window-${item.uid}`).attr('data-name', html_encode(item.name));

        // Set new title attribute
        $(`.item[data-uid='${item.uid}']`).attr('title', html_encode(item.name));
        $(`.window-${options.uid}`).attr('title', html_encode(item.name));

        // Set new value for item-name-editor
        $(`.item[data-uid='${item.uid}'] .item-name-editor`).val(html_encode(item.name));
        $(`.item[data-uid='${item.uid}'] .item-name`).attr('title', html_encode(item.name));

        // Set new data-path
        const new_path = item.path;
        $(`.item[data-uid='${item.uid}']`).attr('data-path', new_path);
        $(`.window-${item.uid}`).attr('data-path', new_path);

        // Update all elements that have matching paths
        $(`[data-path="${html_encode(oldPath)}" i]`).each(function () {
            $(this).attr('data-path', newPath);
            // Also update data-uid if this element has it
            if ($(this).attr('data-uid')) {
                $(this).attr('data-uid', newUid);
            }
            if ($(this).hasClass('window-navbar-path-dirname'))
                $(this).text(item.name);
        });

        // Update all elements whose paths start with old_path
        $(`[data-path^="${html_encode(oldPath) + '/'}"]`).each(function () {
            const new_el_path = _.replace($(this).attr('data-path'), oldPath + '/', newPath + '/');
            $(this).attr('data-path', new_el_path);
        });

        // Update all exact-matching windows
        $(`.window-${item.uid}`).each(function () {
            window.update_window_path(this, new_path);
        })
        // Set new name for matching open windows
        $(`.window-${item.uid} .window-head-title`).text(item.name);

        // Re-sort all matching item containers
        $(`.item[data-uid='${item.uid}']`).parent('.item-container').each(function () {
            window.sort_items(this, $(this).closest('.item-container').attr('data-sort_by'), $(this).closest('.item-container').attr('data-sort_order'));
        })
    })

    window.socket.on('item.moved', async (resp) => {
        try {
            console.log('[Frontend] ✅ Received item.moved event:', resp, 'socket.id:', window.socket.id);
            
            let fsentry = resp;
            
            // Validate fsentry has required fields
            if (!fsentry || !fsentry.uid || !fsentry.path) {
                console.error('[Frontend] ❌ Invalid item.moved event data:', fsentry);
                return; // Skip invalid events silently
            }
            
            // Log received fields for debugging
            console.log('[Frontend] 📦 item.moved fields:', {
                uid: fsentry.uid,
                path: fsentry.path,
                old_path: fsentry.old_path,
                name: fsentry.name,
                is_dir: fsentry.is_dir,
                size: fsentry.size,
                type: fsentry.type,
                modified: fsentry.modified,
                has_metadata: !!fsentry.metadata
            });
            
            // Notify all apps that are watching this item (with safe name access)
            const safeName = fsentry.name || fsentry.path.split('/').pop() || 'untitled';
            try {
                window.sendItemChangeEventToWatchingApps(fsentry.uid, {
                    event: 'moved',
                    uid: fsentry.uid,
                    name: safeName,
                });
            } catch (watchError) {
                console.warn('[Frontend] ⚠️  Error notifying watching apps:', watchError);
                // Continue - this is not critical
            }

        // don't update if this is the original client that initiated the action
        if (resp.original_client_socket_id === window.socket.id) {
            console.log('[Frontend] ⏭️  Skipping item.moved - same client (socket.id:', window.socket.id, 'original_client_socket_id:', resp.original_client_socket_id, ')');
            return;
        }

        let dest_path = path.dirname(fsentry.path);
        let metadata = fsentry.metadata;
        
        console.log('[Frontend] 🎯 Move destination path:', dest_path);
        console.log('[Frontend] 🔍 Looking for container with data-path:', dest_path);

        // update all shortcut_to_path
        $(`.item[data-shortcut_to_path="${html_encode(resp.old_path)}" i]`).attr(`data-shortcut_to_path`, html_encode(fsentry.path));

        // CRITICAL: Remove items by OLD PATH, not by UID
        // The UID changes when the path changes, so we need to find items by their old path
        // Use html_encode for path selector to ensure correct matching
        const encodedOldPath = html_encode(resp.old_path);
        const oldPathItems = $(`.item[data-path="${encodedOldPath}" i]`);
        console.log('[Frontend] 🗑️  Removing items from old location:', {
            old_path: resp.old_path,
            encoded_old_path: encodedOldPath,
            found_items: oldPathItems.length,
            item_uids: oldPathItems.map((i, el) => $(el).attr('data-uid')).get()
        });
        
        oldPathItems.fadeOut(150, function () {
            // find all parent windows that contain this item BEFORE removing
            const parent_windows = $(this).closest('.window');
            // remove this item
            $(this).removeItems();
            // update parent windows' item counts
            $(parent_windows).each(function (index) {
                window.update_explorer_footer_item_count(this);
                window.update_explorer_footer_selected_items_count(this)
            });
            console.log('[Frontend] ✅ Removed item from old location:', resp.old_path);
        });
        
        // Also try to remove by old UID (in case UID format is consistent)
        // Generate old UID the same way backend does: uuid-${oldPath.replace(/\//g, '-')}
        const oldUid = `uuid-${resp.old_path.replace(/\//g, '-')}`;
        const oldUidItems = $(`.item[data-uid='${oldUid}']`);
        if (oldUidItems.length > 0) {
            console.log('[Frontend] 🗑️  Also removing items by old UID:', {
                old_uid: oldUid,
                found_items: oldUidItems.length
            });
            oldUidItems.fadeOut(150, function () {
                const parent_windows = $(this).closest('.window');
                $(this).removeItems();
                $(parent_windows).each(function (index) {
                    window.update_explorer_footer_item_count(this);
                    window.update_explorer_footer_selected_items_count(this)
                });
            });
        }

        // if trashing, close windows of trashed items and its descendants
        if (dest_path === window.trash_path) {
            $(`.window[data-path="${html_encode(resp.old_path)}" i]`).close();
            // todo this has to be case-insensitive but the `i` selector doesn't work on ^=
            $(`.window[data-path^="${html_encode(resp.old_path)}/"]`).close();
        }

        // update all paths of its and its descendants' open windows
        else {
            // todo this has to be case-insensitive but the `i` selector doesn't work on ^=
            $(`.window[data-path^="${html_encode(resp.old_path)}/"], .window[data-path="${html_encode(resp.old_path)}" i]`).each(function () {
                window.update_window_path(this, $(this).attr('data-path').replace(resp.old_path, fsentry.path));
            })
        }

        if (dest_path === window.trash_path) {
            $(`.item[data-uid="${fsentry.uid}"]`).find('.item-is-shared').fadeOut(300);

            // if trashing dir... 
            if (fsentry.is_dir) {
                // remove website badge
                $(`.mywebsites-dir-path[data-uuid="${fsentry.uid}"]`).remove();
                // remove the website badge from all instances of the dir
                $(`.item[data-uid="${fsentry.uid}"]`).find('.item-has-website-badge').fadeOut(300);

                // remove File Rrequest Token
                // todo, some client-side check to see if this dir has an FR associated with it before sending a whole ajax req
            }
        }
        // if replacing an existing item, remove the old item that was just replaced
        if (fsentry.overwritten_uid !== undefined)
            $(`.item[data-uid=${fsentry.overwritten_uid}]`).removeItems();

        // if this is trash, get original name from item metadata
        fsentry.name = (metadata && metadata.original_name) ? metadata.original_name : fsentry.name;

        // create new item on matching containers
        const destContainer = $(`.item-container[data-path='${html_encode(dest_path)}' i]`);
        console.log('[Frontend] 📁 Found', destContainer.length, 'container(s) for path:', dest_path);
        
        if (destContainer.length === 0) {
            console.warn('[Frontend] ⚠️  No container found for destination path:', dest_path);
            console.warn('[Frontend] 🔍 Available containers:', Array.from($('.item-container')).map(el => $(el).attr('data-path')).filter(Boolean));
            return; // Can't add item if no container exists
        }
        
        // Use metadata fields as fallback if top-level fields are missing
        const is_dir = fsentry.is_dir !== undefined ? fsentry.is_dir : (metadata?.is_dir || false);
        const size = fsentry.size !== undefined ? fsentry.size : (metadata?.size || 0);
        const type = fsentry.type !== undefined ? fsentry.type : (metadata?.mime_type || null);
        const modified = fsentry.modified || (metadata?.modified || new Date().toISOString());
        // Get thumbnail from top level or metadata
        const thumbnail = fsentry.thumbnail || metadata?.thumbnail || undefined;
        
        // Ensure name is always defined (required for item_icon and UIItem)
        const itemName = fsentry.name || fsentry.path.split('/').pop() || 'untitled';
        
        // CRITICAL: Check if item already exists to prevent duplicates
        // This can happen when both item.added and item.moved fire (e.g., during uploads)
        // Check in ALL containers, not just destination (item might be in wrong container temporarily)
        const existingItemByUid = $(`.item[data-uid='${fsentry.uid}']`);
        const existingItemByPath = $(`.item[data-path="${html_encode(fsentry.path)}" i]`);
        
        if (existingItemByUid.length > 0 || existingItemByPath.length > 0) {
            console.log('[Frontend] ⚠️  Item already exists in item.moved, skipping duplicate creation:', {
                uid: fsentry.uid,
                path: fsentry.path,
                existing_by_uid: existingItemByUid.length,
                existing_by_path: existingItemByPath.length,
                existing_locations: existingItemByUid.map((i, el) => ({
                    uid: $(el).attr('data-uid'),
                    path: $(el).attr('data-path'),
                    container_path: $(el).closest('.item-container').attr('data-path')
                })).get()
            });
            
            // Update existing item's icon if thumbnail is now available (especially important for desktop moves)
            if (thumbnail) {
                const iconFsentry = {
                    ...fsentry,
                    thumbnail: thumbnail,
                    name: itemName,
                    is_dir: is_dir,
                    type: type,
                    path: fsentry.path
                };
                try {
                    const iconResult = await item_icon(iconFsentry);
                    existingItemByUid.find('.item-icon-thumb').attr('src', iconResult.image);
                    existingItemByUid.find('.item-icon-icon').attr('src', iconResult.image);
                    console.log('[Frontend] ✅ Updated existing item icon with thumbnail:', {
                        thumbnail: thumbnail,
                        icon_image: iconResult.image,
                        icon_type: iconResult.type
                    });
                } catch (iconError) {
                    console.error('[Frontend] ❌ Error updating icon for existing item:', iconError);
                }
            }
            
            // Also ensure item is in the correct container (move it if needed)
            const correctContainer = $(`.item-container[data-path='${html_encode(dest_path)}' i]`);
            if (correctContainer.length > 0 && existingItemByUid.length > 0) {
                const currentContainer = existingItemByUid.closest('.item-container');
                const currentContainerPath = currentContainer.attr('data-path');
                if (currentContainerPath !== dest_path) {
                    console.log('[Frontend] 🔄 Moving existing item to correct container:', {
                        from: currentContainerPath,
                        to: dest_path
                    });
                    existingItemByUid.appendTo(correctContainer);
                }
            }
            
            return; // Don't create duplicate
        }
        if (!fsentry.name) {
            console.warn('[Frontend] ⚠️  fsentry.name is undefined, using filename from path:', itemName);
            fsentry.name = itemName;
        }
        
        // Ensure fsentry has all required properties for item_icon, including thumbnail
        const iconFsentry = {
            ...fsentry,
            name: itemName,
            is_dir: is_dir,
            type: type,
            path: fsentry.path,
            thumbnail: thumbnail // Include thumbnail for proper icon display
        };
        
        console.log('[Frontend] 📝 Creating UIItem with:', {
            dest_path,
            uid: fsentry.uid,
            name: itemName,
            is_dir,
            size,
            type,
            modified,
            has_icon_data: !!iconFsentry.name
        });
        
        try {
            const iconResult = await item_icon(iconFsentry);
            console.log('[Frontend] 🎨 Icon result:', {
                has_image: !!iconResult?.image,
                icon_type: iconResult?.type
            });
            
            UIItem({
                appendTo: destContainer,
                immutable: fsentry.immutable || fsentry.writable === false,
                uid: fsentry.uid,
                path: fsentry.path,
                icon: iconResult,
                name: (dest_path === window.trash_path) ? (metadata?.original_name || itemName) : itemName,
                is_dir: is_dir,
                size: size,
                type: type,
                modified: modified,
                is_selected: false,
                is_shared: (dest_path === window.trash_path) ? false : fsentry.is_shared,
                is_shortcut: fsentry.is_shortcut,
                shortcut_to: fsentry.shortcut_to,
                shortcut_to_path: fsentry.shortcut_to_path,
                // has_website: $(el_item).attr('data-has_website') === '1',
                metadata: JSON.stringify(fsentry.metadata || {}) ?? '',
            });
            
            console.log('[Frontend] ✅ UIItem created for moved file');
        } catch (iconError) {
            console.error('[Frontend] ❌ Error creating icon for moved file:', iconError);
            // Fallback: create item with default icon
            UIItem({
                appendTo: destContainer,
                immutable: fsentry.immutable || fsentry.writable === false,
                uid: fsentry.uid,
                path: fsentry.path,
                icon: is_dir ? window.icons['folder.svg'] : window.icons['file.svg'],
                name: (dest_path === window.trash_path) ? (metadata?.original_name || itemName) : itemName,
                is_dir: is_dir,
                size: size,
                type: type,
                modified: modified,
                is_selected: false,
                is_shared: (dest_path === window.trash_path) ? false : fsentry.is_shared,
                is_shortcut: fsentry.is_shortcut,
                shortcut_to: fsentry.shortcut_to,
                shortcut_to_path: fsentry.shortcut_to_path,
                metadata: JSON.stringify(fsentry.metadata || {}) ?? '',
            });
            console.log('[Frontend] ✅ UIItem created with fallback icon');
        }

        if (fsentry && fsentry.parent_dirs_created && fsentry.parent_dirs_created.length > 0) {
            // this operation may have created some missing directories, 
            // see if any of the directories in the path of this file is new AND
            // if these new path have any open parents that need to be updated

            fsentry.parent_dirs_created.forEach(async dir => {
                let item_container = $(`.item-container[data-path='${html_encode(path.dirname(dir.path))}' i]`);
                if (item_container.length > 0 && $(`.item[data-path="${html_encode(dir.path)}" i]`).length === 0) {
                    UIItem({
                        appendTo: item_container,
                        immutable: false,
                        uid: dir.uid,
                        path: dir.path,
                        icon: await item_icon(dir),
                        name: dir.name,
                        size: dir.size,
                        type: dir.type,
                        modified: dir.modified,
                        is_dir: true,
                        is_selected: false,
                        is_shared: dir.is_shared,
                        has_website: false,
                    });
                }
                window.sort_items(item_container, $(item_container).attr('data-sort_by'), $(item_container).attr('data-sort_order'));
            });
        }
        //sort each container
        $(`.item-container[data-path='${html_encode(dest_path)}' i]`).each(function () {
            window.sort_items(this, $(this).attr('data-sort_by'), $(this).attr('data-sort_order'))
        })
        } catch (error) {
            // CRITICAL: Catch all errors to prevent error dialogs from appearing
            // Log error but don't show popup - real-time updates should be silent
            console.error('[Frontend] ❌ Error in item.moved handler:', error);
            console.error('[Frontend] ❌ Error details:', {
                error_message: error?.message,
                error_stack: error?.stack,
                fsentry: typeof fsentry !== 'undefined' ? {
                    uid: fsentry?.uid,
                    path: fsentry?.path,
                    old_path: fsentry?.old_path,
                    has_name: !!fsentry?.name,
                    has_metadata: !!fsentry?.metadata
                } : 'fsentry is undefined',
                resp: resp ? {
                    uid: resp.uid,
                    path: resp.path,
                    old_path: resp.old_path,
                    has_name: !!resp.name
                } : 'resp is null/undefined'
            });
            // Don't show UIAlert - just log and continue
            // The file move succeeded on the backend, we just failed to update the UI
            // User can refresh if needed, but most moves will work fine
        }
    });

    window.socket.on('user.email_confirmed', (msg) => {
        // don't update if this is the original client that initiated the action
        if (msg.original_client_socket_id === window.socket.id)
            return;

        window.refresh_user_data(window.auth_token);
    });

    window.socket.on('user.email_changed', (msg) => {
        // don't update if this is the original client that initiated the action
        if (msg.original_client_socket_id === window.socket.id)
            return;

        window.refresh_user_data(window.auth_token);
    });

    window.socket.on('item.renamed', async (item) => {
        // Notify all apps that are watching this item
        window.sendItemChangeEventToWatchingApps(item.uid, {
            event: 'rename',
            uid: item.uid,
            // path: item.path,
            new_name: item.name,
            // old_path: item.old_path,
        })

        // Don't update if this is the original client that initiated the action
        if (item.original_client_socket_id === window.socket.id)
            return;

        // CRITICAL: Find elements by old_path first (since data-uid hasn't been updated yet)
        // The backend sends the NEW uid, but DOM elements still have the OLD uid
        // So we need to find by old_path, update data-uid, then proceed with other updates
        const oldPath = item.old_path;
        const newUid = item.uid;
        const newPath = item.path;
        
        // Find all items with the old path
        const itemsByOldPath = $(`.item[data-path="${html_encode(oldPath)}"]`);
        
        console.log('[Frontend] 🔄 item.renamed: updating items', {
            old_path: oldPath,
            new_path: newPath,
            new_uid: newUid,
            found_items: itemsByOldPath.length,
            item_data: {
                name: item.name,
                thumbnail: item.thumbnail || 'NOT PROVIDED',
                has_thumbnail: !!item.thumbnail,
                type: item.type,
                is_dir: item.is_dir
            }
        });
        
        // Update data-uid for all matching items (CRITICAL: must happen first!)
        itemsByOldPath.attr('data-uid', newUid);
        
        // Also update any windows with the old path
        $(`.window[data-path="${html_encode(oldPath)}"]`).attr('data-uid', newUid);
        
        // Now we can use the new uid for all subsequent updates
        // Set new item name
        $(`.item[data-uid='${html_encode(newUid)}'] .item-name`).html(html_encode(truncate_filename(item.name)));

        // Set new icon - preserve thumbnail if available
        // Create proper iconFsentry object with all required fields (matching item.moved pattern)
        const iconFsentry = {
            uid: newUid,
            name: item.name,
            path: newPath,
            is_dir: item.is_dir,
            type: item.type || null,
            thumbnail: item.thumbnail || undefined, // Include thumbnail if present
            size: 0, // Size not needed for icon, but include for completeness
            modified: new Date().toISOString() // Modified not needed for icon, but include for completeness
        };
        const new_icon = (item.is_dir ? window.icons['folder.svg'] : (await item_icon(iconFsentry)).image);
        $(`.item[data-uid='${newUid}']`).find('.item-icon-thumb').attr('src', new_icon);
        $(`.item[data-uid='${newUid}']`).find('.item-icon-icon').attr('src', new_icon);
        
        console.log('[Frontend] 🔄 Updated icon after rename:', {
            uid: newUid,
            name: item.name,
            path: newPath,
            thumbnail: item.thumbnail || 'none',
            icon_image: new_icon
        });

        // Set new data-name
        $(`.item[data-uid='${newUid}']`).attr('data-name', html_encode(item.name));
        $(`.window-${newUid}`).attr('data-name', html_encode(item.name));

        // Set new title attribute
        $(`.item[data-uid='${newUid}']`).attr('title', html_encode(item.name));
        $(`.window-${newUid}`).attr('title', html_encode(item.name));

        // Set new value for item-name-editor
        $(`.item[data-uid='${newUid}'] .item-name-editor`).val(html_encode(item.name));
        $(`.item[data-uid='${newUid}'] .item-name`).attr('title', html_encode(item.name));

        // Set new data-path
        $(`.item[data-uid='${newUid}']`).attr('data-path', newPath);
        $(`.window-${newUid}`).attr('data-path', newPath);

        // Update all elements that have matching paths
        $(`[data-path="${html_encode(oldPath)}" i]`).each(function () {
            $(this).attr('data-path', newPath);
            // Also update data-uid if this element has it
            if ($(this).attr('data-uid')) {
                $(this).attr('data-uid', newUid);
            }
            if ($(this).hasClass('window-navbar-path-dirname'))
                $(this).text(item.name);
        });

        // Update all elements whose paths start with old_path
        $(`[data-path^="${html_encode(oldPath) + '/'}"]`).each(function () {
            const new_el_path = _.replace($(this).attr('data-path'), oldPath + '/', newPath + '/');
            $(this).attr('data-path', new_el_path);
        });

        // Update all exact-matching windows
        $(`.window-${newUid}`).each(function () {
            window.update_window_path(this, newPath);
        });
        // Set new name for matching open windows
        $(`.window-${newUid} .window-head-title`).text(item.name);

        // Re-sort all matching item containers
        $(`.item[data-uid='${newUid}']`).parent('.item-container').each(function () {
            window.sort_items(this, $(this).closest('.item-container').attr('data-sort_by'), $(this).closest('.item-container').attr('data-sort_order'));
        });
        
        // CRITICAL: Update properties windows that are open for this item
        // If a properties window is open, it needs to refresh with the new uid
        $(`.window[data-uid="${newUid}"], .window[data-path="${html_encode(newPath)}"]`).each(function () {
            const windowEl = $(this);
            // Check if this is a properties window (has class window-item-properties)
            if (windowEl.hasClass('window-item-properties')) {
                console.log('[Frontend] 🔄 Refreshing properties window after rename', {
                    old_path: oldPath,
                    new_path: newPath,
                    new_uid: newUid
                });
                // Re-fetch stats with the new uid
                puter.fs.stat({
                    uid: newUid,
                    returnSubdomains: true,
                    returnPermissions: true,
                    returnVersions: true,
                    returnSize: true,
                    consistency: 'eventual',
                    success: function (fsentry) {
                        // Update all the properties fields
                        windowEl.find('.item-prop-val-name').text(fsentry.name);
                        windowEl.find('.item-prop-val-path').text(newPath);
                        const fileType = fsentry.is_dir ? 'Directory' : (fsentry.mime_type || 'Unknown');
                        windowEl.find('.item-prop-val-type').html(fileType);
                        windowEl.find('.item-prop-val-size').html(fsentry.size === null || fsentry.size === undefined ? '-' : window.byte_format(fsentry.size));
                        const modifiedTime = fsentry.modified ? (fsentry.modified < 10000000000 ? fsentry.modified * 1000 : fsentry.modified) : 0;
                        windowEl.find('.item-prop-val-modified').html(modifiedTime === 0 ? '-' : timeago.format(modifiedTime));
                        const createdTime = fsentry.created ? (fsentry.created < 10000000000 ? fsentry.created * 1000 : fsentry.created) : 0;
                        windowEl.find('.item-prop-val-created').html(createdTime === 0 ? '-' : timeago.format(createdTime));
                        if (fsentry.ipfs_hash) {
                            windowEl.find('.item-prop-val-ipfs-hash').html(`<code style="font-size: 11px; word-break: break-all;">${html_encode(fsentry.ipfs_hash)}</code>`);
                        } else {
                            windowEl.find('.item-prop-val-ipfs-hash').html('-');
                        }
                        windowEl.find('.item-prop-val-uid').html(newUid);
                    }
                });
            }
        });
    });

    window.socket.on('item.added', async (item) => {
        console.log('[Frontend] ✅ Received item.added event:', item, 'socket.id:', window.socket.id);
        
        // if item is empty, don't proceed
        if (_.isEmpty(item)) {
            console.log('[Frontend] ⏭️  Skipping item.added - empty item');
            return;
        }

        // Notify all apps that are watching this item
        window.sendItemChangeEventToWatchingApps(item.uid, {
            event: 'write',
            uid: item.uid,
            // path: item.path,
            new_size: item.size,
            modified: item.modified,
            // old_path: item.old_path,
        });

        // Don't update if this is the original client that initiated the action
        if (item.original_client_socket_id === window.socket.id) {
            console.log('[Frontend] ⏭️  Skipping item.added - same client (socket.id:', window.socket.id, 'original_client_socket_id:', item.original_client_socket_id, ')');
            return;
        }

        // Update replaced items with matching uids
        if (item.overwritten_uid) {
            $(`.item[data-uid='${item.overwritten_uid}']`).attr({
                'data-immutable': item.immutable,
                'data-path': item.path,
                'data-name': item.name,
                'data-size': item.size,
                'data-modified': item.modified,
                'data-is_shared': item.is_shared,
                'data-type': item.type,
            })
            // set new icon
            const new_icon = (item.is_dir ? window.icons['folder.svg'] : (await item_icon(item)).image);
            $(`.item[data-uid="${item.overwritten_uid}"]`).find('.item-icon > img').attr('src', new_icon);

            //sort each window
            $(`.item-container[data-path='${html_encode(item.dirpath)}' i]`).each(function () {
                window.sort_items(this, $(this).attr('data-sort_by'), $(this).attr('data-sort_order'))
            })
        }
        else {
            // CRITICAL: Check if item already exists to prevent duplicates
            // This can happen when both item.added and item.moved fire (e.g., during uploads/moves)
            // Check in ALL containers, not just destination (item might be in wrong container temporarily)
            const existingItemByUid = $(`.item[data-uid='${item.uid}']`);
            const existingItemByPath = $(`.item[data-path="${html_encode(item.path)}" i]`);
            
            if (existingItemByUid.length > 0 || existingItemByPath.length > 0) {
                console.log('[Frontend] ⚠️  Item already exists in item.added, skipping duplicate creation:', {
                    uid: item.uid,
                    path: item.path,
                    existing_by_uid: existingItemByUid.length,
                    existing_by_path: existingItemByPath.length,
                    existing_locations: existingItemByUid.map((i, el) => ({
                        uid: $(el).attr('data-uid'),
                        path: $(el).attr('data-path'),
                        container_path: $(el).closest('.item-container').attr('data-path')
                    })).get()
                });
                
                // Update existing item's icon if thumbnail is now available (especially important for desktop uploads)
                if (item.thumbnail) {
                    try {
                        const iconResult = await item_icon(item);
                        existingItemByUid.find('.item-icon-thumb').attr('src', iconResult.image);
                        existingItemByUid.find('.item-icon-icon').attr('src', iconResult.image);
                        console.log('[Frontend] ✅ Updated existing item icon with thumbnail:', {
                            thumbnail: item.thumbnail,
                            icon_image: iconResult.image,
                            icon_type: iconResult.type
                        });
                    } catch (iconError) {
                        console.error('[Frontend] ❌ Error updating icon for existing item:', iconError);
                    }
                }
                
                // Also ensure item is in the correct container (move it if needed)
                const correctContainer = $(`.item-container[data-path='${html_encode(item.dirpath)}' i]`);
                if (correctContainer.length > 0 && existingItemByUid.length > 0) {
                    const currentContainer = existingItemByUid.closest('.item-container');
                    const currentContainerPath = currentContainer.attr('data-path');
                    if (currentContainerPath !== item.dirpath) {
                        console.log('[Frontend] 🔄 Moving existing item to correct container:', {
                            from: currentContainerPath,
                            to: item.dirpath
                        });
                        existingItemByUid.appendTo(correctContainer);
                    }
                }
                
                return; // Don't create duplicate
            }
            
            UIItem({
                appendTo: $(`.item-container[data-path='${html_encode(item.dirpath)}' i]`),
                uid: item.uid,
                immutable: item.immutable || item.writable === false,
                associated_app_name: item.associated_app?.name,
                path: item.path,
                icon: await item_icon(item),
                name: item.name,
                size: item.size,
                type: item.type,
                modified: item.modified,
                is_dir: item.is_dir,
                is_shared: item.is_shared,
                is_shortcut: item.is_shortcut,
                shortcut_to: item.shortcut_to,
                shortcut_to_path: item.shortcut_to_path,
            });

            //sort each window
            $(`.item-container[data-path='${html_encode(item.dirpath)}' i]`).each(function () {
                window.sort_items(this, $(this).attr('data-sort_by'), $(this).attr('data-sort_order'))
            })
        }
    });

    // Hidden file dialog
    h += `<form name="upload-form" id="upload-form" style="display:hidden;">
            <input type="hidden" name="name" id="upload-filename" value="">
            <input type="hidden" name="path" id="upload-target-path" value="">
            <input type="file" name="file" id="upload-file-dialog" style="display: none;" multiple="multiple">
        </form>`;

    h += `<div class="window-container"></div>`;

    // Desktop
    // If desktop is not in fullpage/embedded mode, we hide it until files and directories are loaded and then fade in the UI
    // This gives a calm and smooth experience for the user
    h += `<div class="desktop item-container disable-user-select" 
                data-uid="${options.desktop_fsentry.uid}" 
                data-sort_by="${!options.desktop_fsentry.sort_by ? 'name' : options.desktop_fsentry.sort_by}" 
                data-sort_order="${!options.desktop_fsentry.sort_order ? 'asc' : options.desktop_fsentry.sort_order}" 
                data-path="${html_encode(window.desktop_path)}"
            >`;
    h += `</div>`;

    // Get window sidebar width
    puter.kv.get('window_sidebar_width').then(async (val) => {
        let value = parseInt(val);
        // if value is a valid number
        if (!isNaN(value) && value > 0) {
            window.window_sidebar_width = value;
        }
    })

    // load window sidebar items from KV
    puter.kv.get("sidebar_items").then(async (val) => {
        window.sidebar_items = val;
    })

    // Remove `?ref=...` from navbar URL
    if (window.url_query_params.has('ref')) {
        window.history.pushState(null, document.title, '/');
    }

    // update local user preferences
    const showHiddenFilesVal = await puter.kv.get('user_preferences.show_hidden_files');
    let showHiddenFiles = false;
    if (showHiddenFilesVal !== null && showHiddenFilesVal !== undefined) {
        try {
            showHiddenFiles = JSON.parse(showHiddenFilesVal);
        } catch (e) {
            showHiddenFiles = showHiddenFilesVal === 'true' || showHiddenFilesVal === true;
        }
    }
    
    const user_preferences = {
        show_hidden_files: showHiddenFiles,
        language: await puter.kv.get('user_preferences.language'),
        clock_visible: await puter.kv.get('user_preferences.clock_visible'),
    };

    // update default apps
    puter.kv.list('user_preferences.default_apps.*').then(async (default_app_keys) => {
        for (let key in default_app_keys) {
            user_preferences[default_app_keys[key].substring(17)] = await puter.kv.get(default_app_keys[key]);
        }

        window.update_user_preferences(user_preferences);
    });

    // Append to <body>
    $('body').append(h);

    // Ensure taskbar_height is set before calculating desktop height
    // This prevents taskbar from being created with height: 0
    if (!window.taskbar_height || window.taskbar_height === 0) {
        window.taskbar_height = window.default_taskbar_height || 50;
        console.log('[UIDesktop]: taskbar_height was 0/undefined, setting to default before UITaskbar:', window.taskbar_height);
    }

    // Set desktop height - desktop should be full viewport height
    // Taskbar will be positioned absolutely at the bottom
    // Ensure toolbar_height is defined (default to 0 if not set)
    const toolbarHeight = window.toolbar_height || 0;
    const taskbarHeight = window.taskbar_height || 50;
    $('.desktop').css({
        'height': '100vh', // Full viewport height - taskbar overlays at bottom
        'position': 'relative', // Ensure taskbar can be positioned relative to desktop
        'overflow': 'visible', // Ensure taskbar isn't clipped
        'padding-bottom': `${taskbarHeight}px` // Add padding so desktop items don't overlap taskbar
    });
    
    // Ensure body/html allow taskbar to be visible at bottom
    $('body').css({
        'overflow': 'hidden', // Prevent body scroll
        'margin': '0',
        'padding': '0',
        'height': '100vh' // Full viewport height
    });

    console.log('[UIDesktop]: About to call UITaskbar, desktop exists:', $('.desktop').length > 0, 'taskbar_height:', window.taskbar_height);
    // ---------------------------------------------------------------
    // Taskbar - MUST await since UITaskbar is async
    // ---------------------------------------------------------------
    await UITaskbar();
    console.log('[UIDesktop]: UITaskbar completed');
    
    // Ensure taskbar is visible after initialization
    // Sometimes taskbar items don't render immediately, so force a refresh
    setTimeout(() => {
        const $taskbar = $('.taskbar').last();
        if ($taskbar.length > 0) {
            const currentHeight = parseInt($taskbar.css('height')) || 0;
            if (currentHeight === 0) {
                const correctHeight = window.taskbar_height || window.default_taskbar_height || 50;
                $taskbar.css('height', `${correctHeight}px`);
                console.log('[UIDesktop]: Post-init taskbar height fix: set to', correctHeight);
            }
            // Force show taskbar items
            $taskbar.find('.taskbar-item').show();
            $taskbar.show();
        }
    }, 100);
    
    // IMMEDIATE desktop items refresh - ensure it runs right after taskbar
    // FIXED: Only refresh once to prevent duplicate icons
    const isEmbeddedCheck = window.is_embedded || false;
    const isFullpageCheck = window.is_fullpage_mode || false;
    console.log('[UIDesktop]: Immediate desktop refresh check after taskbar...', {
        is_embedded: isEmbeddedCheck,
        is_fullpage_mode: isFullpageCheck,
        shouldRefresh: !isEmbeddedCheck && !isFullpageCheck,
        desktop_path: window.desktop_path,
        window_location: window.location.href,
        parent_location: window.parent?.location?.href,
        in_iframe: window.location !== window.parent?.location
    });
    
    // Single desktop refresh (removed duplicate refresh call to prevent duplicate icons)
    if (!isEmbeddedCheck && !isFullpageCheck) {
        setTimeout(() => {
            console.log('[UIDesktop]: Executing desktop refresh...');
            const desktopContainer = document.querySelector('.desktop.item-container') || 
                                   (document.querySelector('.desktop')?.classList.contains('item-container') ? document.querySelector('.desktop') : null);
            console.log('[UIDesktop]: Desktop container search result:', {
                found: !!desktopContainer,
                selector1: !!document.querySelector('.desktop.item-container'),
                selector2: !!document.querySelector('.desktop'),
                hasItemContainer: document.querySelector('.desktop')?.classList.contains('item-container'),
                desktop_path: window.desktop_path
            });
            
            if (desktopContainer && window.desktop_path) {
                console.log('[UIDesktop]: Refresh - found desktop container, refreshing...', {
                    container: desktopContainer,
                    data_path: $(desktopContainer).attr('data-path'),
                    desktop_path: window.desktop_path
                });
                if (!$(desktopContainer).attr('data-path') || $(desktopContainer).attr('data-path') !== window.desktop_path) {
                    $(desktopContainer).attr('data-path', window.desktop_path);
                    console.log('[UIDesktop]: Updated desktop container data-path to:', window.desktop_path);
                }
                refresh_item_container(desktopContainer, { fadeInItems: true });
            } else {
                console.warn('[UIDesktop]: Refresh - desktop container not found or desktop_path not set', {
                    container: !!desktopContainer,
                    desktop_path: window.desktop_path,
                    allDesktopElements: document.querySelectorAll('.desktop').length,
                    allItemContainers: document.querySelectorAll('.item-container').length
                });
            }
        }, 200);
    } else {
        console.warn('[UIDesktop]: Desktop refresh SKIPPED - embedded or fullpage mode', {
            is_embedded: isEmbeddedCheck,
            is_fullpage_mode: isFullpageCheck
        });
    }

    // ---------------------------------------------------------------
    // PC2 Status Bar - Shows connection status in taskbar
    // ---------------------------------------------------------------
    if (window.user?.wallet_address) {
        console.log('[UIDesktop]: Initializing PC2 status bar');
        initPC2StatusBar();
    }

    // Update desktop dimensions after taskbar is initialized with position
    window.update_desktop_dimensions_for_taskbar();

    const el_desktop = document.querySelector('.desktop');

    window.active_element = el_desktop;
    window.active_item_container = el_desktop;
    // --------------------------------------------------------
    // Dragster
    // Allow dragging of local files onto desktop.
    // --------------------------------------------------------
    $(el_desktop).dragster({
        enter: function (dragsterEvent, event) {
            $('.context-menu').remove();
        },
        leave: function (dragsterEvent, event) {
        },
        drop: async function (dragsterEvent, event) {
            const e = event.originalEvent;
            // no drop on item
            if ($(event.target).hasClass('item') || $(event.target).parent('.item').length > 0)
                return false;
            // recursively create directories and upload files
            if (e.dataTransfer?.items?.length > 0) {
                window.upload_items(e.dataTransfer.items, window.desktop_path);
            }

            e.stopPropagation();
            e.preventDefault();
            return false;
        }
    });

    // --------------------------------------------------------
    // Droppable
    // --------------------------------------------------------
    $(el_desktop).droppable({
        accept: '.item',
        tolerance: "intersect",
        drop: function (event, ui) {
            // Check if item was actually dropped on desktop and not a window
            if (window.mouseover_window !== undefined)
                return;

            // Can't drop anything but UIItems on desktop
            if (!$(ui.draggable).hasClass('item'))
                return;

            // Don't move an item to its current directory
            if (path.dirname($(ui.draggable).attr('data-path')) === window.desktop_path && !event.ctrlKey)
                return;

            // If ctrl is pressed and source is Trashed, cancel whole operation
            if (event.ctrlKey && path.dirname($(ui.draggable).attr('data-path')) === window.trash_path)
                return;

            // Unselect previously selected items
            $(el_desktop).children('.item-selected').removeClass('item-selected');

            const items_to_move = []
            // first item
            items_to_move.push(ui.draggable);

            // all subsequent items
            const cloned_items = document.getElementsByClassName('item-selected-clone');
            for (let i = 0; i < cloned_items.length; i++) {
                const source_item = document.getElementById('item-' + $(cloned_items[i]).attr('data-id'));
                if (source_item !== null)
                    items_to_move.push(source_item);
            }

            // if ctrl key is down, copy items
            if (event.ctrlKey) {
                // unless source is Trash
                if (path.dirname($(ui.draggable).attr('data-path')) === window.trash_path)
                    return;

                window.copy_items(items_to_move, window.desktop_path)
            }
            // otherwise, move items
            else {
                window.move_items(items_to_move, window.desktop_path);
            }
        }
    });

    //--------------------------------------------------
    // ContextMenu
    //--------------------------------------------------
    $(el_desktop).bind("contextmenu taphold", function (event) {
        // dismiss taphold on regular devices
        if (event.type === 'taphold' && !isMobile.phone && !isMobile.tablet)
            return;

        const $target = $(event.target);

        // elements that should retain native ctxmenu
        if ($target.is('input') || $target.is('textarea'))
            return true

        // custom ctxmenu for all other elements
        if (event.target === el_desktop) {
            event.preventDefault();
            UIContextMenu({
                items: [
                    // -------------------------------------------
                    // Sort by
                    // -------------------------------------------
                    {
                        html: i18n('sort_by'),
                        items: [
                            {
                                html: i18n('auto_arrange'),
                                icon: window.is_auto_arrange_enabled ? '✓' : '',
                                onClick: async function () {
                                    window.is_auto_arrange_enabled = !window.is_auto_arrange_enabled;
                                    window.store_auto_arrange_preference(window.is_auto_arrange_enabled);
                                    if (window.is_auto_arrange_enabled) {
                                        window.sort_items(el_desktop, $(el_desktop).attr('data-sort_by'), $(el_desktop).attr('data-sort_order'));
                                        window.set_sort_by(options.desktop_fsentry.uid, $(el_desktop).attr('data-sort_by'), $(el_desktop).attr('data-sort_order'))
                                        window.clear_desktop_item_positions(el_desktop);
                                    } else {
                                        window.set_desktop_item_positions(el_desktop)
                                    }
                                }
                            },
                            // -------------------------------------------
                            // -
                            // -------------------------------------------
                            '-',
                            {
                                html: i18n('name'),
                                disabled: !window.is_auto_arrange_enabled,
                                icon: $(el_desktop).attr('data-sort_by') === 'name' ? '✓' : '',
                                onClick: async function () {
                                    window.sort_items(el_desktop, 'name', $(el_desktop).attr('data-sort_order'));
                                    window.set_sort_by(options.desktop_fsentry.uid, 'name', $(el_desktop).attr('data-sort_order'))
                                }
                            },
                            {
                                html: i18n('date_modified'),
                                disabled: !window.is_auto_arrange_enabled,
                                icon: $(el_desktop).attr('data-sort_by') === 'modified' ? '✓' : '',
                                onClick: async function () {
                                    window.sort_items(el_desktop, 'modified', $(el_desktop).attr('data-sort_order'));
                                    window.set_sort_by(options.desktop_fsentry.uid, 'modified', $(el_desktop).attr('data-sort_order'))
                                }
                            },
                            {
                                html: i18n('type'),
                                disabled: !window.is_auto_arrange_enabled,
                                icon: $(el_desktop).attr('data-sort_by') === 'type' ? '✓' : '',
                                onClick: async function () {
                                    window.sort_items(el_desktop, 'type', $(el_desktop).attr('data-sort_order'));
                                    window.set_sort_by(options.desktop_fsentry.uid, 'type', $(el_desktop).attr('data-sort_order'))
                                }
                            },
                            {
                                html: i18n('size'),
                                disabled: !window.is_auto_arrange_enabled,
                                icon: $(el_desktop).attr('data-sort_by') === 'size' ? '✓' : '',
                                onClick: async function () {
                                    window.sort_items(el_desktop, 'size', $(el_desktop).attr('data-sort_order'));
                                    window.set_sort_by(options.desktop_fsentry.uid, 'size', $(el_desktop).attr('data-sort_order'))
                                }
                            },
                            // -------------------------------------------
                            // -
                            // -------------------------------------------
                            '-',
                            {
                                html: i18n('ascending'),
                                disabled: !window.is_auto_arrange_enabled,
                                icon: $(el_desktop).attr('data-sort_order') === 'asc' ? '✓' : '',
                                onClick: async function () {
                                    const sort_by = $(el_desktop).attr('data-sort_by')
                                    window.sort_items(el_desktop, sort_by, 'asc');
                                    window.set_sort_by(options.desktop_fsentry.uid, sort_by, 'asc')
                                }
                            },
                            {
                                html: i18n('descending'),
                                disabled: !window.is_auto_arrange_enabled,
                                icon: $(el_desktop).attr('data-sort_order') === 'desc' ? '✓' : '',
                                onClick: async function () {
                                    const sort_by = $(el_desktop).attr('data-sort_by')
                                    window.sort_items(el_desktop, sort_by, 'desc');
                                    window.set_sort_by(options.desktop_fsentry.uid, sort_by, 'desc')
                                }
                            },
                        ]
                    },
                    // -------------------------------------------
                    // Refresh
                    // -------------------------------------------
                    {
                        html: i18n('refresh'),
                        onClick: function () {
                            refresh_item_container(el_desktop);
                        }
                    },
                    // -------------------------------------------
                    // Show/Hide hidden files
                    // -------------------------------------------
                    {
                        html: i18n('show_hidden'),
                        icon: window.user_preferences.show_hidden_files ? '✓' : '',
                        onClick: function () {
                            window.mutate_user_preferences({
                                show_hidden_files: !window.user_preferences.show_hidden_files,
                            });
                            window.show_or_hide_files(document.querySelectorAll('.item-container'));
                        }
                    },
                    // -------------------------------------------
                    // Hide Desktop Icons
                    // -------------------------------------------
                    {
                        html: window.desktop_icons_hidden ? i18n('Show desktop icons') : i18n('Hide desktop icons'),
                        onClick: function () {
                            toggleDesktopIcons();
                        }
                    },
                    // -------------------------------------------
                    // -
                    // -------------------------------------------
                    '-',
                    // -------------------------------------------
                    // New File
                    // -------------------------------------------
                    new_context_menu_item(window.desktop_path, el_desktop),
                    // -------------------------------------------
                    // -
                    // -------------------------------------------
                    '-',
                    // -------------------------------------------
                    // Paste
                    // -------------------------------------------
                    {
                        html: i18n('paste'),
                        disabled: window.clipboard.length > 0 ? false : true,
                        onClick: function () {
                            if (window.clipboard_op === 'copy')
                                window.copy_clipboard_items(window.desktop_path, el_desktop);
                            else if (window.clipboard_op === 'move')
                                window.move_clipboard_items(el_desktop)
                        }
                    },
                    // -------------------------------------------
                    // Undo
                    // -------------------------------------------
                    {
                        html: i18n('undo'),
                        disabled: window.actions_history.length > 0 ? false : true,
                        onClick: function () {
                            window.undo_last_action();
                        }
                    },
                    // -------------------------------------------
                    // Upload Here
                    // -------------------------------------------
                    {
                        html: i18n('upload_here'),
                        onClick: function () {
                            window.init_upload_using_dialog(el_desktop);
                        }
                    },
                    // -------------------------------------------
                    // -
                    // -------------------------------------------
                    '-',
                    // -------------------------------------------
                    // Change Desktop Background…
                    // -------------------------------------------
                    {
                        html: i18n('change_desktop_background'),
                        onClick: function () {
                            UIWindowDesktopBGSettings();
                        }
                    },

                ]
            });
        }
    });

    //-------------------------------------------
    // Desktop Files/Folders
    // we don't need to get the desktop items if we're in embedded or fullpage mode
    // because the items aren't visible anyway and we don't need to waste bandwidth/server resources
    //-------------------------------------------
    const isEmbedded = window.is_embedded || false;
    const isFullpage = window.is_fullpage_mode || false;
    const shouldRefresh = !isEmbedded && !isFullpage;
    
    console.log('[UIDesktop] Checking desktop refresh conditions:', {
        is_embedded: isEmbedded,
        is_fullpage_mode: isFullpage,
        shouldRefresh: shouldRefresh,
        desktop_path: window.desktop_path
    });
    
    if (shouldRefresh) {
        console.log('[UIDesktop] ✅ Desktop refresh conditions met, setting up refresh...');
        // Use a function to refresh desktop items, with retry logic
        const refreshDesktopItems = () => {
            console.log('[UIDesktop] refreshDesktopItems called, desktop_path:', window.desktop_path);
            
            // Ensure el_desktop is the correct element (with .item-container class)
            // Try both selectors in case the element structure is different
            let desktopContainer = document.querySelector('.desktop.item-container');
            if (!desktopContainer) {
                // Fallback: try just .desktop and check if it has item-container class
                const el_desktop = document.querySelector('.desktop');
                if (el_desktop && $(el_desktop).hasClass('item-container')) {
                    desktopContainer = el_desktop;
                }
            }
            
            if (desktopContainer) {
                const currentDataPath = $(desktopContainer).attr('data-path');
                console.log('[UIDesktop] Desktop container found:', {
                    el_desktop: desktopContainer,
                    desktop_path: window.desktop_path,
                    data_path: currentDataPath,
                    matches: currentDataPath === window.desktop_path,
                    hasItemContainer: $(desktopContainer).hasClass('item-container'),
                    hasDesktop: $(desktopContainer).hasClass('desktop'),
                    isConnected: desktopContainer.isConnected
                });
                
                // Ensure desktop container has correct path attribute before refreshing
                if (!currentDataPath || currentDataPath !== window.desktop_path) {
                    $(desktopContainer).attr('data-path', window.desktop_path);
                    console.log('[UIDesktop] Updated desktop container data-path from', currentDataPath, 'to:', window.desktop_path);
                }
                
                // Verify container is in DOM before refreshing
                if (!desktopContainer.isConnected) {
                    console.warn('[UIDesktop] Desktop container not connected to DOM, waiting...');
                    setTimeout(refreshDesktopItems, 100);
                    return;
                }
                
                console.log('[UIDesktop] Calling refresh_item_container for desktop...');
                refresh_item_container(desktopContainer, { fadeInItems: true });
            } else {
                console.error('[UIDesktop] Desktop container not found! Tried .desktop.item-container and .desktop');
                console.error('[UIDesktop] Available .desktop elements:', document.querySelectorAll('.desktop').length);
                console.error('[UIDesktop] Available .item-container elements:', document.querySelectorAll('.item-container').length);
                console.error('[UIDesktop] Full DOM check - all .desktop:', Array.from(document.querySelectorAll('.desktop')).map(el => ({
                    classes: el.className,
                    dataPath: el.getAttribute('data-path'),
                    isConnected: el.isConnected
                })));
            }
        };
        
        // Wait for DOM to be ready, then refresh
        // Use requestAnimationFrame to ensure DOM is fully rendered
        console.log('[UIDesktop] Scheduling desktop items refresh...');
        requestAnimationFrame(() => {
            setTimeout(() => {
                console.log('[UIDesktop] Executing scheduled desktop items refresh...');
                refreshDesktopItems();
            }, 50);
        });

        // Show welcome window if user hasn't already seen it and hasn't directly navigated to an app 
        if (!window.url_paths[0]?.toLocaleLowerCase() === 'app' || !window.url_paths[1]) {
            if (!isMobile.phone && !isMobile.tablet) {
                setTimeout(() => {
                    puter.kv.get('has_seen_welcome_window').then(async (val) => {
                        if (val === null) {
                            await UIWindowWelcome();
                        }
                    })
                }, 1000);
            }
        }
    }

    // -------------------------------------------
    // Selectable
    // Only for desktop
    // -------------------------------------------
    if (!isMobile.phone && !isMobile.tablet) {
        let selected_ctrl_items = [];
        const selection = new SelectionArea({
            selectionContainerClass: '.selection-area-container',
            container: '.desktop',
            selectables: ['.desktop.item-container > .item'],
            startareas: ['.desktop'],
            boundaries: ['.desktop'],
            behaviour: {
                overlap: 'drop',
                intersect: 'touch',
                startThreshold: 10,
                scrolling: {
                    speedDivider: 10,
                    manualSpeed: 750,
                    startScrollMargins: { x: 0, y: 0 }
                }
            },
            features: {
                touch: true,
                range: true,
                singleTap: {
                    allow: true,
                    intersect: 'native'
                }
            }
        });

        selection.on('beforestart', ({ event }) => {
            selected_ctrl_items = [];
            // Returning false prevents a selection
            return $(event.target).hasClass('item-container');
        })
            .on('beforedrag', evt => {
            })
            .on('start', ({ store, event }) => {
                if (!event.ctrlKey && !event.metaKey) {
                    for (const el of store.stored) {
                        el.classList.remove('item-selected');
                    }

                    selection.clearSelection();
                }

                // mark desktop as selectable active
                $('.desktop').addClass('desktop-selectable-active');
            })
            .on('move', ({ store: { changed: { added, removed } }, event }) => {
                window.desktop_selectable_is_active = true;

                for (const el of added) {
                    // if ctrl or meta key is pressed and the item is already selected, then unselect it
                    if ((event.ctrlKey || event.metaKey) && $(el).hasClass('item-selected')) {
                        el.classList.remove('item-selected');
                        selected_ctrl_items.push(el);
                    }
                    // otherwise select it
                    else {
                        el.classList.add('item-selected');
                    }
                }

                for (const el of removed) {
                    el.classList.remove('item-selected');
                    // in case this item was selected by ctrl+click before, then reselect it again
                    if (selected_ctrl_items.includes(el))
                        $(el).not('.item-disabled').addClass('item-selected');
                }
            })
            .on('stop', evt => {
                window.desktop_selectable_is_active = false;
                $('.desktop').removeClass('desktop-selectable-active');
            });
    }
    // ----------------------------------------------------
    // Toolbar
    // ----------------------------------------------------
    // Has user seen the toolbar animation?
    window.has_seen_toolbar_animation = await puter.kv.get('has_seen_toolbar_animation') ?? false;
    
    let ht = '';
    let style = '';
    let class_name = '';
    if(window.has_seen_toolbar_animation && !isMobile.phone && !isMobile.tablet){
        style = 'top: -20px; width: 40px;';
        class_name = 'toolbar-hidden';
    }else{
        style= 'height:30px; min-height:30px; max-height:30px;';
    }

    ht += `<div class="toolbar hide-scrollbar ${class_name}" style="${style}">`;
    // logo
    ht += `<div class="toolbar-btn toolbar-puter-logo" title="ElastOS" style="margin-left: 10px; width:107px;"><img src="/images/elastos-logo.webp" draggable="false" style="display:block; width:107px; height:17px"></div>`;


    // clock spacer
    ht += `<div class="toolbar-spacer"></div>`;

    // create account button
    ht += `<div class="toolbar-btn user-options-create-account-btn ${window.user.is_temp ? '' : 'hidden'}" style="padding:0; opacity:1;" title="${i18n('toolbar.save_account')}">`;
    ht += `<svg style="width: 17px; height: 17px;" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="48px" height="48px" viewBox="0 0 48 48"><g transform="translate(0, 0)"><path d="M45.521,39.04L27.527,5.134c-1.021-1.948-3.427-2.699-5.375-1.679-.717,.376-1.303,.961-1.679,1.679L2.479,39.04c-.676,1.264-.635,2.791,.108,4.017,.716,1.207,2.017,1.946,3.42,1.943H41.993c1.403,.003,2.704-.736,3.42-1.943,.743-1.226,.784-2.753,.108-4.017ZM23.032,15h1.937c.565,0,1.017,.467,1,1.031l-.438,14c-.017,.54-.459,.969-1,.969h-1.062c-.54,0-.983-.429-1-.969l-.438-14c-.018-.564,.435-1.031,1-1.031Zm.968,25c-1.657,0-3-1.343-3-3s1.343-3,3-3,3,1.343,3,3-1.343,3-3,3Z" fill="#ffbb00"></path></g></svg>`;
    ht += `</div>`;

    // 'Show Desktop'
    ht += `<a href="/" class="show-desktop-btn toolbar-btn antialiased hidden" target="_blank" title="${i18n('desktop_show_desktop')}">${i18n('desktop_show_desktop')} <img src="${window.icons['launch-white.svg']}" style="width: 10px; height: 10px; margin-left: 5px;"></a>`;

    // refer
    /* if (window.user.referral_code) {
        ht += `<div class="toolbar-btn refer-btn" title="Refer" style="background-image:url(${window.icons['gift.svg']});"></div>`;
    } */

    // github
    // ht += `<a href="https://github.com/HeyPuter/puter" target="_blank" class="toolbar-btn" title="GitHub" style="background-image:url(${window.icons['logo-github-white.svg']});"></a>`;

    // do not show the fullscreen button on mobile devices since it's broken
    if (!isMobile.phone) {
        // fullscreen button
        ht += `<div class="toolbar-btn fullscreen-btn" title="${i18n('toolbar.enter_fullscreen')}" style="background-image:url(${window.icons['fullscreen.svg']})"></div>`;
    }

    // qr code button -- only show if not embedded
    /* if (!window.is_embedded)
        ht += `<div class="toolbar-btn qr-btn" title="QR code" style="background-image:url(${window.icons['qr.svg']})"></div>`; */

    // search button
    ht += `<div class="toolbar-btn search-btn" title="${i18n('toolbar.search')}" style="background-image:url('${window.icons['search.svg']}')"></div>`;

    // wallet button - show for all users (wallet functionality available to everyone)
    // Using data URI SVG to match other toolbar button styling
    const walletSvg = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>')}`;
    ht += `<div class="toolbar-btn wallet-btn" title="${i18n('wallet') || 'Wallet'}" style="background-image:url('${walletSvg}')"></div>`;

    //clock 
    ht += `<div id="clock" class="toolbar-clock" style="">12:00 AM Sun, Jan 01</div>`;

    // user options menu
    ht += `<div class="toolbar-btn user-options-menu-btn profile-pic" style="display:block;">`;
    ht += `<div class="profile-image ${window.user?.profile?.picture && 'profile-image-has-picture'}" style="border-radius: 50%; background-image:url(${window.user?.profile?.picture || window.icons['profile.svg']}); box-sizing: border-box; width: 17px !important; height: 17px !important; background-size: contain; background-repeat: no-repeat; background-position: center; background-position: center; background-size: cover;"></div>`;
    ht += `</div>`;
    ht += `</div>`;

    // prepend toolbar to desktop
    $(ht).insertBefore(el_desktop);

    // If auto-hide is disabled, ensure toolbar is visible on load
    if (!window.toolbar_auto_hide_enabled) {
        // Make sure toolbar is visible when auto-hide is disabled
        setTimeout(() => {
            if ($('.toolbar').hasClass('toolbar-hidden')) {
                window.show_toolbar();
            }
        }, 100); // Small delay to ensure DOM is ready
    }

    // send event
    window.dispatchEvent(new CustomEvent('toolbar:ready'));
    // init clock visibility
    window.change_clock_visible();

    // notification container
    $('body').append(`<div class="notification-container"><div class="notifications-close-all">${i18n('close_all')}</div></div>`);

    // adjust window container to take into account the toolbar height
    $('.window-container').css('top', window.toolbar_height);

    // track: checkpoint
    //-----------------------------
    // GUI is ready to launch apps!
    //-----------------------------

    globalThis.services.emit('gui:ready');

    //--------------------------------------------------------------------------------------
    // Determine if an app was launched from URL
    // i.e. https://puter.com/app/<app_name>
    //--------------------------------------------------------------------------------------
    if (window.url_paths[0]?.toLocaleLowerCase() === 'app' && window.url_paths[1]) {
        window.app_launched_from_url = window.url_paths[1];
        // get app metadata
        try {
            window.app_launched_from_url = await puter.apps.get(window.url_paths[1], { icon_size: 64 })
            window.is_fullpage_mode = window.app_launched_from_url.metadata?.fullpage_on_landing ?? window.is_fullpage_mode ?? false;

            // show 'Show Desktop' button
            if (window.is_fullpage_mode) {
                $('.show-desktop-btn').removeClass('hidden');
            }
        } catch (e) {
            console.error(e);
        }

        // get query params, any param that doesn't start with 'puter.' will be passed to the app
        window.app_query_params = {};
        for (let [key, value] of window.url_query_params) {
            if (!key.startsWith('puter.'))
                window.app_query_params[key] = value;
        }
    }
    //--------------------------------------------------------------------------------------
    // /settings will open settings in fullpage mode
    //--------------------------------------------------------------------------------------
    else if (window.url_paths[0]?.toLocaleLowerCase() === 'settings') {
        // open settings
        UIWindowSettings({
            tab: window.url_paths[1] || 'about',
            window_options: {
                is_fullpage: true,
            }
        });
    }
    // ---------------------------------------------
    // Run apps from insta-login URL
    // ---------------------------------------------
    if (window.url_query_params.has('app')) {
        let url_app_name = window.url_query_params.get('app');
        if (url_app_name === 'explorer') {
            let predefined_path = window.home_path;
            if (window.url_query_params.has('path'))
                predefined_path = window.url_query_params.get('path')
            // launch explorer
            UIWindow({
                path: predefined_path,
                title: path.basename(predefined_path),
                icon: await item_icon({ is_dir: true, path: predefined_path }),
                // todo
                // uid: $(el_item).attr('data-uid'),
                is_dir: true,
                // todo
                // sort_by: $(el_item).attr('data-sort_by'),
                app: 'explorer',
            });
        }
    }
    // ---------------------------------------------
    // load from direct app URLs: /app/app-name
    // ---------------------------------------------
    else if (window.app_launched_from_url) {
        let qparams = new URLSearchParams(window.location.search);
        if (!qparams.has('c')) {
            let posargs = undefined;
            if (window.app_query_params && window.app_query_params.posargs) {
                posargs = JSON.parse(window.app_query_params.posargs);
            }
            launch_app({
                app: window.app_launched_from_url.name,
                app_obj: window.app_launched_from_url,
                readURL: qparams.get('readURL'),
                maximized: qparams.get('maximized'),
                params: window.app_query_params ?? [],
                ...(posargs ? {
                    args: {
                        command_line: { args: posargs }
                    }
                } : {}),
                is_fullpage: window.is_fullpage_mode,
                window_options: {
                    stay_on_top: false,
                }
            });
        }
    }

    $(el_desktop).on('mousedown touchstart', { passive: true }, function (e) {
        // dimiss touchstart on regular devices
        if (e.type === 'taphold' && !isMobile.phone && !isMobile.tablet)
            return;

        // disable pointer-events for all app iframes, this is to make sure selectable works
        $('.window-app-iframe').css('pointer-events', 'none');
        $('.window').find('.item-selected').addClass('item-blurred');
        $('.desktop').find('.item-blurred').removeClass('item-blurred');
    })

    $(el_desktop).on('click', function (e) {
        // blur all windows
        $('.window-active').removeClass('window-active');
        // hide all global menubars
        $('.window-menubar-global').hide();
    })

    function display_ct() {

        var x = new Date()
        var ampm = x.getHours() >= 12 ? ' PM' : ' AM';
        let hours = x.getHours() % 12;
        hours = hours ? hours : 12;
        hours = hours.toString().length == 1 ? 0 + hours.toString() : hours;

        var minutes = x.getMinutes().toString()
        minutes = minutes.length == 1 ? 0 + minutes : minutes;

        var seconds = x.getSeconds().toString()
        seconds = seconds.length == 1 ? 0 + seconds : seconds;

        var month = x.toLocaleString('default', { month: 'short' });

        var dt = x.getDate().toString();
        dt = dt.length == 1 ? 0 + dt : dt;

        var day = x.toLocaleString('default', { weekday: 'short' });


        var x1 = day + ", " + month + " " + dt;
        x1 = hours + ":" + minutes + ampm + " " + x1;
        $('#clock').html(x1);
    }
    display_ct()
    setInterval(display_ct, 1000);

    // show referral notice window
    if (window.show_referral_notice && !window.user.email_confirmed) {
        puter.kv.get('shown_referral_notice').then(async (val) => {
            if (!val || val === 'false' || val === false) {
                setTimeout(() => {
                    UIWindowClaimReferral();
                }, 1000);
                puter.kv.set({
                    key: "shown_referral_notice",
                    value: true,
                })
            }
        })
    }

    //--------------------------------------------------------------------------------------
    // Trying to view a user's public folder?
    // i.e. https://puter.com/@<username>
    //--------------------------------------------------------------------------------------
    const url_paths = window.location.pathname.split('/').filter(element => element);
    if (url_paths[0]?.startsWith('@')) {
        const username = url_paths[0].substring(1);
        let item_path = '/' + username + '/Public';
        if ( url_paths.length > 1 ) {
            item_path += '/' + url_paths.slice(1).join('/');
        }

        // GUARD: avoid invalid user directories
        {
            if (!username.match(/^[a-z0-9_]+$/i)) {
                UIAlert({
                    message: 'Invalid username.'
                });
                return;
            }
        }

        const stat = await puter.fs.stat(item_path);
        
        // TODO: DRY everything here with open_item. Unfortunately we can't
        //       use open_item here because it's coupled with UI logic;
        //       it requires a UIItem element and cannot operate on a
        //       file path on its own.
        if ( ! stat.is_dir ) {
            if ( stat.associated_app ) {
                launch_app({ name: stat.associated_app.name });
                return;
            }
            
            const ext_pref =
                window.user_preferences[`default_apps${path.extname(item_path).toLowerCase()}`];
            
            if ( ext_pref ) {
                launch_app({
                    name: ext_pref,
                    file_path: item_path,
                });
                return;
            }
            

            const open_item_meta = await $.ajax({
                url: window.api_origin + "/open_item",
                type: 'POST',
                contentType: "application/json",
                data: JSON.stringify({
                    path: item_path,
                }),
                headers: {
                    "Authorization": "Bearer "+window.auth_token
                },
                statusCode: {
                    401: function () {
                        window.logout();
                    },
                },
            });
            const suggested_apps = open_item_meta?.suggested_apps ?? await window.suggest_apps_for_fsentry({
                path: item_path
            });

            // Note: I'm not adding unzipping logic here. We'll wait until
            //       we've refactored open_item so that Puter can have a
            //       properly-reusable open function.
            if ( suggested_apps.length !== 0 ) {
                launch_app({
                    name: suggested_apps[0].name, 
                    token: open_item_meta.token,
                    file_path: item_path,
                    app_obj: suggested_apps[0],
                    window_title: path.basename(item_path),
                    maximized: options.maximized,
                    file_signature: open_item_meta.signature,
                });
                return;
            }

            await UIAlert({
                message: 'Cannot find an app to open this file; ' +
                    'opening directory instead.'
            });
            item_path = item_path.split('/').slice(0, -1).join('/')
        }

        UIWindow({
            path: item_path,
            title: path.basename(item_path),
            icon: await item_icon({ is_dir: true, path: item_path }),
            is_dir: true,
            app: 'explorer',
        });
    }

    window.hide_toolbar = (animate = true) => {
        // Always show toolbar on mobile and tablet devices
        if (isMobile.phone || isMobile.tablet) {
            return;
        }
        
        // Don't hide toolbar if auto-hide is disabled
        if (!window.toolbar_auto_hide_enabled) {
            return;
        }
        
        if ($('.toolbar').hasClass('toolbar-hidden')) return;

        // attach hidden class to toolbar
        $('.toolbar').addClass('toolbar-hidden');

        // animate the toolbar to top = -20px;
        // animate width to 40px;
        if (animate) {
            $('.toolbar').animate({
                top: '-20px',
                width: '40px',
            }, 100);
        } else {
            $('.toolbar').css({
                top: '-20px',
                width: '40px',
            });
        }
        // animate hide toolbar-btn, toolbar-clock
        if (animate) {
            $('.toolbar-btn, #clock, .user-options-menu-btn').animate({
                opacity: 0,
            }, 10);
        } else {
            $('.toolbar-btn, #clock, .user-options-menu-btn').css({
                opacity: 0,
            });
        }

        if(!window.has_seen_toolbar_animation){
            puter.kv.set({
                key: "has_seen_toolbar_animation",
                value: true,
            })

            window.has_seen_toolbar_animation = true;
        }
    }

    window.show_toolbar = () => {
        if (!$('.toolbar').hasClass('toolbar-hidden')) return;

        // remove hidden class from toolbar
        $('.toolbar').removeClass('toolbar-hidden');

        $('.toolbar').animate({
            top: 0,
        }, 100).css('width', 'max-content');

        // animate show toolbar-btn, toolbar-clock
        $('.toolbar-btn, #clock, .user-options-menu-btn').animate({
            opacity: 0.8,
        }, 50);
    }

    // Toolbar hide/show logic with improved UX
    window.toolbarHideTimeout = null;
    let isMouseNearToolbar = false;

    // Define safe zone around toolbar (in pixels)
    const TOOLBAR_SAFE_ZONE = 30;
    const TOOLBAR_HIDE_DELAY = 100; // Base delay before hiding
    const TOOLBAR_QUICK_HIDE_DELAY = 200; // Quicker hide when mouse moves far away

    // Function to check if mouse is in the safe zone around toolbar
    window.isMouseInToolbarSafeZone = (mouseX, mouseY) => {
        const toolbar = $('.toolbar')[0];
        if (!toolbar) return false;
        
        const rect = toolbar.getBoundingClientRect();
        
        // Expand the toolbar bounds by the safe zone
        const safeZone = {
            top: rect.top - TOOLBAR_SAFE_ZONE,
            bottom: rect.bottom + TOOLBAR_SAFE_ZONE,
            left: rect.left - TOOLBAR_SAFE_ZONE,
            right: rect.right + TOOLBAR_SAFE_ZONE
        };
        
        return mouseX >= safeZone.left && 
               mouseX <= safeZone.right && 
               mouseY >= safeZone.top && 
               mouseY <= safeZone.bottom;
    };

    // Function to handle toolbar hiding with improved logic
    window.handleToolbarHiding = (mouseX, mouseY) => {
        // Always show toolbar on mobile and tablet devices
        if (isMobile.phone || isMobile.tablet) {
            return;
        }
        
        // Don't hide toolbar if auto-hide is disabled
        if (!window.toolbar_auto_hide_enabled) {
            return;
        }
        
        // Clear any existing timeout
        if (window.toolbarHideTimeout) {
            clearTimeout(window.toolbarHideTimeout);
            window.toolbarHideTimeout = null;
        }
        
        // Don't hide if toolbar is already hidden
        if ($('.toolbar').hasClass('toolbar-hidden')) return;
        
        const wasNearToolbar = isMouseNearToolbar;
        isMouseNearToolbar = window.isMouseInToolbarSafeZone(mouseX, mouseY);
        
        // If mouse is in safe zone, don't hide
        if (isMouseNearToolbar) {
            return;
        }
        
        // Determine hide delay based on mouse movement pattern
        let hideDelay = TOOLBAR_HIDE_DELAY;
        
        // If mouse was previously near toolbar and now moved far away, hide quicker
        if (wasNearToolbar && !isMouseNearToolbar) {
            // Check if mouse moved significantly away
            const toolbar = $('.toolbar')[0];
            if (toolbar) {
                const rect = toolbar.getBoundingClientRect();
                const distanceFromToolbar = Math.min(
                    Math.abs(mouseY - rect.bottom),
                    Math.abs(mouseY - rect.top)
                );
                
                // If mouse is far from toolbar, hide quicker
                if (distanceFromToolbar > TOOLBAR_SAFE_ZONE * 2) {
                    hideDelay = TOOLBAR_QUICK_HIDE_DELAY;
                }
            }
        }
        
        // Set timeout to hide toolbar
        window.toolbarHideTimeout = setTimeout(() => {
            // Double-check mouse position before hiding
            if (!window.isMouseInToolbarSafeZone(window.mouseX, window.mouseY)) {
                window.hide_toolbar();
            }
            window.toolbarHideTimeout = null;
        }, hideDelay);
    };

    // hovering over a hidden toolbar will show it
    $(document).on('mouseenter', '.toolbar-hidden', function () {
        // if a window is being dragged, don't show the toolbar
        if(window.a_window_is_being_dragged)
            return;

        // if selectable is active , don't show the toolbar
        if(window.desktop_selectable_is_active)
            return;

        if(window.is_fullpage_mode)
            $('.window-app-iframe').css('pointer-events', 'none');

        window.show_toolbar();
        // Clear any pending hide timeout
        if (window.toolbarHideTimeout) {
            clearTimeout(window.toolbarHideTimeout);
            window.toolbarHideTimeout = null;
        }
    });

    // hovering over a visible toolbar will show it and cancel hiding
    $(document).on('mouseenter', '.toolbar:not(.toolbar-hidden)', function () {
        // if a window is being dragged, don't show the toolbar
        if(window.a_window_is_being_dragged)
            return;

        // Clear any pending hide timeout when entering toolbar
        if (window.toolbarHideTimeout) {
            clearTimeout(window.toolbarHideTimeout);
            window.toolbarHideTimeout = null;
        }
        isMouseNearToolbar = true;
    });

    $(document).on('mouseenter', '.toolbar', function () {
        if(window.is_fullpage_mode)
            $('.toolbar').focus();
    });

    // any click will hide the toolbar, unless:
    // - it's on the toolbar
    // - it's the user options menu button
    // - the user options menu is open
    $(document).on('click', function(e){
        // Always show toolbar on mobile and tablet devices
        if (isMobile.phone || isMobile.tablet) {
            return;
        }
        
        // Don't hide toolbar if auto-hide is disabled
        if (!window.toolbar_auto_hide_enabled) {
            return;
        }
        
        // if the user has not seen the toolbar animation, don't hide the toolbar
        if(!window.has_seen_toolbar_animation)
            return;

        if(
            !$(e.target).hasClass('toolbar') && 
            !$(e.target).hasClass('user-options-menu-btn') && 
            $('.context-menu[data-id="user-options-menu"]').length === 0 &&
            true
        ){
            window.hide_toolbar(false);
        }
    })

    // Handle mouse leaving the toolbar
    $(document).on('mouseleave', '.toolbar', function () {
        // Always show toolbar on mobile and tablet devices
        if (isMobile.phone || isMobile.tablet) {
            return;
        }
        
        // Don't hide toolbar if auto-hide is disabled
        if (!window.toolbar_auto_hide_enabled) {
            return;
        }
        
        window.has_left_toolbar_at_least_once = true;
        // if the user options menu is open, don't hide the toolbar
        if ($('.context-menu[data-id="user-options-menu"]').length > 0)
            return;
    
        // Start the hiding logic with current mouse position
        window.handleToolbarHiding(window.mouseX, window.mouseY);
    });

    // Track mouse movement globally to update toolbar hiding logic
    $(document).on('mousemove', function(e) {
        // Always show toolbar on mobile and tablet devices
        if (isMobile.phone || isMobile.tablet) {
            return;
        }
        
        // Don't hide toolbar if auto-hide is disabled
        if (!window.toolbar_auto_hide_enabled) {
            return;
        }
        
        // if the user has not seen the toolbar animation, don't hide the toolbar
        if(!window.has_seen_toolbar_animation && !window.has_left_toolbar_at_least_once)
            return;

        // if the user options menu is open, don't hide the toolbar
        if ($('.context-menu[data-id="user-options-menu"]').length > 0)
            return;

        // Only handle toolbar hiding if toolbar is visible and mouse moved significantly
        if (!$('.toolbar').hasClass('toolbar-hidden')) {
            // Use throttling to avoid excessive calls
            if (!window.mouseMoveThrottle) {
                window.mouseMoveThrottle = setTimeout(() => {
                    window.handleToolbarHiding(window.mouseX, window.mouseY);
                    window.mouseMoveThrottle = null;
                }, 100); // Throttle to every 100ms
            }
        }
    });
}

$(document).on('contextmenu taphold', '.taskbar', function (event) {
    // dismiss taphold on regular devices
    if (event.type === 'taphold' && !isMobile.phone && !isMobile.tablet)
        return;

    event.preventDefault();
    event.stopPropagation();
    
    // Get current taskbar position
    const currentPosition = window.taskbar_position || 'bottom';
    
    // Create base menu items
    let menuItems = [];
    
    // Only show position submenu on desktop devices
    if (!isMobile.phone && !isMobile.tablet) {
        menuItems.push({
            html: i18n('desktop_position'),
            items: [
                {
                    html: i18n('desktop_position_left'),
                    checked: currentPosition === 'left',
                    onClick: function() {
                        window.update_taskbar_position('left');
                    }
                },
                {
                    html: i18n('desktop_position_bottom'),
                    checked: currentPosition === 'bottom',
                    onClick: function() {
                        window.update_taskbar_position('bottom');
                    }
                },
                {
                    html: i18n('desktop_position_right'),
                    checked: currentPosition === 'right',
                    onClick: function() {
                        window.update_taskbar_position('right');
                    }
                }
            ]
        });
        menuItems.push('-'); // divider
    }
    
    // Add the "Show open windows" option for all devices
    menuItems.push({
        html: i18n('desktop_show_open_windows'),
        onClick: function () {
            $(`.window`).showWindow();
        }
    });
    
    // Add the "Show the desktop" option for all devices
    menuItems.push({
        html: i18n('desktop_show_desktop'),
        onClick: function () {
            $(`.window`).hideWindow();
        }
    });
    
    UIContextMenu({
        parent_element: $('.taskbar'),
        items: menuItems
    });
    return false;
});

// Toolbar context menu
$(document).on('contextmenu taphold', '.toolbar', function (event) {
    // dismiss taphold on regular devices
    if (event.type === 'taphold' && !isMobile.phone && !isMobile.tablet)
        return;

    // Don't show context menu on mobile devices since toolbar auto-hide is disabled there
    if (isMobile.phone || isMobile.tablet)
        return;

    event.preventDefault();
    event.stopPropagation();
        
    UIContextMenu({
        parent_element: $('.toolbar'),
        items: [
            //--------------------------------------------------
            // Enable/Disable Auto-hide
            //--------------------------------------------------
            {
                html: window.toolbar_auto_hide_enabled ? i18n('Disable Auto-hide') : i18n('Enable Auto-hide'),
                onClick: function () {
                    // Toggle the preference
                    window.toolbar_auto_hide_enabled = !window.toolbar_auto_hide_enabled;
                    
                    // Save the preference
                    puter.kv.set('toolbar_auto_hide_enabled', window.toolbar_auto_hide_enabled.toString());
                    
                    // If auto-hide was just disabled and toolbar is currently hidden, show it
                    if (!window.toolbar_auto_hide_enabled && $('.toolbar').hasClass('toolbar-hidden')) {
                        window.show_toolbar();
                    }
                    
                    // Clear any pending hide timeout
                    if (window.toolbarHideTimeout) {
                        clearTimeout(window.toolbarHideTimeout);
                        window.toolbarHideTimeout = null;
                    }

                    // hide toolbar
                    window.hide_toolbar();
                }
            }
        ]
    });
    return false;
});

$(document).on('click', '.qr-btn', async function (e) {
    UIWindowQR({
        message_i18n_key: 'scan_qr_c2a',
        text: window.gui_origin + '?auth_token=' + window.auth_token,
    });
})

$(document).on('click', '.user-options-menu-btn', async function (e) {
    const pos = this.getBoundingClientRect();
    if ($('.context-menu[data-id="user-options-menu"]').length > 0)
        return;

    let items = [];
    let parent_element = this;
    //--------------------------------------------------
    // Save Session
    //--------------------------------------------------
    if (window.user.is_temp) {
        items.push(
            {
                html: i18n('save_session'),
                icon: `<svg style="margin-bottom: -4px; width: 16px; height: 16px;" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="48px" height="48px" viewBox="0 0 48 48"><g transform="translate(0, 0)"><path d="M45.521,39.04L27.527,5.134c-1.021-1.948-3.427-2.699-5.375-1.679-.717,.376-1.303,.961-1.679,1.679L2.479,39.04c-.676,1.264-.635,2.791,.108,4.017,.716,1.207,2.017,1.946,3.42,1.943H41.993c1.403,.003,2.704-.736,3.42-1.943,.743-1.226,.784-2.753,.108-4.017ZM23.032,15h1.937c.565,0,1.017,.467,1,1.031l-.438,14c-.017,.54-.459,.969-1,.969h-1.062c-.54,0-.983-.429-1-.969l-.438-14c-.018-.564,.435-1.031,1-1.031Zm.968,25c-1.657,0-3-1.343-3-3s1.343-3,3-3,3,1.343,3,3-1.343,3-3,3Z" fill="#ffbb00"></path></g></svg>`,
                icon_active: `<svg style="margin-bottom: -4px; width: 16px; height: 16px;" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="48px" height="48px" viewBox="0 0 48 48"><g transform="translate(0, 0)"><path d="M45.521,39.04L27.527,5.134c-1.021-1.948-3.427-2.699-5.375-1.679-.717,.376-1.303,.961-1.679,1.679L2.479,39.04c-.676,1.264-.635,2.791,.108,4.017,.716,1.207,2.017,1.946,3.42,1.943H41.993c1.403,.003,2.704-.736,3.42-1.943,.743-1.226,.784-2.753,.108-4.017ZM23.032,15h1.937c.565,0,1.017,.467,1,1.031l-.438,14c-.017,.54-.459,.969-1,.969h-1.062c-.54,0-.983-.429-1-.969l-.438-14c-.018-.564,.435-1.031,1-1.031Zm.968,25c-1.657,0-3-1.343-3-3s1.343-3,3-3,3,1.343,3,3-1.343,3-3,3Z" fill="#ffbb00"></path></g></svg>`,
                onClick: async function () {
                    UIWindowSaveAccount({
                        send_confirmation_code: false,
                        default_username: window.user.username
                    });
                }
            },
        )
        // -------------------------------------------
        // -
        // -------------------------------------------
        items.push('-')
    }

    // -------------------------------------------
    // Current user's wallet addresses (if both exist, show both)
    // -------------------------------------------
    if (window.user && (window.user.wallet_address || window.user.smart_account_address)) {
        // Show wallet_address (UAE wallet) first if it exists
        if (window.user.wallet_address) {
            const displayName = window.user.wallet_address.slice(0, 10) + '...' + window.user.wallet_address.slice(-8);
            items.push({
                html: displayName,
                icon: '✓',
                onClick: async function () {
                    // Already on this wallet, do nothing
                }
            });
        }
        
        // Show smart_account_address (UniversalX) second if it exists
        if (window.user.smart_account_address) {
            const displayName = window.user.smart_account_address.slice(0, 10) + '...' + window.user.smart_account_address.slice(-8);
            const subtitle = '<span style="display:block;font-size:10px;color:#666;margin-top:2px;margin-left:0;padding-left:0;text-align:left;">UniversalX Smart Account</span>';
            items.push({
                html: displayName + subtitle,
                icon: '',
                onClick: async function () {
                    // Already on this account, do nothing
                }
            });
        }
        
        // Add separator if there are other logged in users
        if (window.logged_in_users.length > 0) {
            items.push('-');
        }
    }

    // -------------------------------------------
    // Logged in users (other users, not current)
    // -------------------------------------------
    if (window.logged_in_users.length > 0) {
        let users_arr = window.logged_in_users;

        // bring logged in user's item to top
        users_arr.sort(function (x, y) { return x.uuid === window.user.uuid ? -1 : y.uuid == window.user.uuid ? 1 : 0; });

        // create menu items (skip current user since we already added it above)
        users_arr.forEach(l_user => {
            // Skip current user - we already added it above
            if (l_user.uuid === window.user.uuid) {
                return;
            }
            
            // For wallet users, show Smart Account address if available, else EOA
            let displayName = l_user.username;
            let subtitle = '';
            
            if (l_user.smart_account_address) {
                // Show Smart Account (truncated) with "Smart" label
                displayName = l_user.smart_account_address.slice(0, 10) + '...' + l_user.smart_account_address.slice(-8);
                subtitle = '<span style="display:block;font-size:10px;color:#666;margin-top:2px;margin-left:0;padding-left:0;text-align:left;">UniversalX Smart Account</span>';
            } else if (l_user.wallet_address) {
                // Show EOA address (truncated)
                displayName = l_user.wallet_address.slice(0, 10) + '...' + l_user.wallet_address.slice(-8);
            }
            
            items.push(
                {
                    html: displayName + subtitle,
                    icon: '',
                    onClick: async function (val) {
                        // update auth data
                        window.update_auth_data(l_user.auth_token, l_user);
                        // refresh
                        location.reload();
                    }

                },
            )
        });
        // -------------------------------------------
        // -
        // -------------------------------------------
        /* items.push('-')

        items.push(
            {
                html: i18n('add_existing_account'),
                // icon: l_user.username === user.username ? '✓' : '',
                onClick: async function (val) {
                    await UIWindowLogin({
                        reload_on_success: true,
                        send_confirmation_code: false,
                        window_options: {
                            has_head: true
                        }
                    });
                }
            },
        ) */

        // -------------------------------------------
        // -
        // -------------------------------------------
        items.push('-')

    }

    // -------------------------------------------
    // Load available languages
    // -------------------------------------------
    const supportedLanguagesItems = window.listSupportedLanguages().map(lang => {
        return {
            html: lang.name,
            icon: window.locale === lang.code ? '✓' : '',
            onClick: async function () {
                changeLanguage(lang.code);
            }
        }
    });

    UIContextMenu({
        id: 'user-options-menu',
        parent_element: parent_element,
        position: { top: pos.top + 28, left: pos.left + pos.width - 15 },
        items: [
            ...items,
            //--------------------------------------------------
            // Settings
            //--------------------------------------------------
            {
                html: i18n('settings'),
                id: 'settings',
                onClick: async function () {
                    UIWindowSettings();
                }
            },
            //--------------------------------------------------
            // My Websites
            //--------------------------------------------------
            /* {
                html: i18n('my_websites'),
                id: 'my_websites',
                onClick: async function () {
                    UIWindowMyWebsites();
                }
            }, */
            //--------------------------------------------------
            // Task Manager
            //--------------------------------------------------
            {
                html: i18n('task_manager'),
                id: 'task_manager',
                onClick: async function () {
                    UIWindowTaskManager();
                }
            },
            //--------------------------------------------------
            // Contact Us
            //--------------------------------------------------
            /* {
                html: i18n('contact_us'),
                id: 'contact_us',
                onClick: async function () {
                    UIWindowFeedback();
                }
            },*/
            // -------------------------------------------
            // -
            // -------------------------------------------
            '-',

            //--------------------------------------------------
            // Log Out
            //--------------------------------------------------
            {
                html: i18n('log_out'),
                onClick: async function () {
                    // see if there are any open windows, if yes notify user
                    if ($('.window-app').length > 0) {
                        const alert_resp = await UIAlert({
                            message: `<p>${i18n('confirm_open_apps_log_out')}</p>`,
                            buttons: [
                                {
                                    label: i18n('close_all_windows_and_log_out'),
                                    value: 'close_and_log_out',
                                    type: 'primary',
                                },
                                {
                                    label: i18n('cancel')
                                },
                            ]
                        })
                        if (alert_resp === 'close_and_log_out')
                            window.logout();
                    }
                    // no open windows
                    else
                        window.logout();
                }
            },
        ]
    });
})

$(document).on('click', '.fullscreen-btn', async function (e) {
    if (!window.is_fullscreen()) {
        var elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) { /* Safari */
            elem.webkitRequestFullscreen();
        } else if (elem.mozRequestFullScreen) { /* moz */
            elem.mozRequestFullScreen();
        } else if (elem.msRequestFullscreen) { /* IE11 */
            elem.msRequestFullscreen();
        }
    }
    else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
})

$(document).on('click', '.close-launch-popover', function () {
    $(".launch-popover").closest('.popover').fadeOut(200, function () {
        $(".launch-popover").closest('.popover').remove();
    });
});

$(document).on('click', '.search-btn', function () {
    // Use window.UIWindowSearch if available, otherwise use imported function
    if (window.UIWindowSearch) {
        window.UIWindowSearch();
    } else {
        UIWindowSearch();
    }
})

// Wallet button - opens Account Sidebar
$(document).on('click', '.wallet-btn', function () {
    UIAccountSidebar();
})

$(document).on('click', '.toolbar-puter-logo', function () {
    UIWindowSettings();
})

$(document).on('click', '.user-options-create-account-btn', async function (e) {
    UIWindowSaveAccount({
        send_confirmation_code: false,
        default_username: window.user.username,
    });
})

$(document).on('click', '.refer-btn', async function (e) {
    UIWindowRefer();
})

$(document).on('click', '.start-app', async function (e) {
    launch_app({
        name: $(this).attr('data-app-name')
    })
    // close popovers
    $(".popover").fadeOut(200, function () {
        $(".popover").remove();
    });
})

$(document).on('click', '.user-options-login-btn', async function (e) {
    const alert_resp = await UIAlert({
        message: `<strong>Save session before exiting!</strong><p>You are in a temporary session and logging into another account will erase all data in your current session.</p>`,
        buttons: [
            {
                label: i18n('save_session'),
                value: 'save-session',
                type: 'primary',
            },
            {
                label: i18n('log_into_another_account_anyway'),
                value: 'login',
            },
            {
                label: i18n('cancel')
            },
        ]
    })

    if (alert_resp === 'save-session') {
        let saved = await UIWindowSaveAccount({
            send_confirmation_code: false,
        });
        if (saved)
            UIWindowLogin({ show_signup_button: false, reload_on_success: true });
    } else if (alert_resp === 'login') {
        UIWindowLogin({
            show_signup_button: false,
            reload_on_success: true,
            window_options: {
                backdrop: true,
                close_on_backdrop_click: false,
            }
        });
    }
})

$(document).on('click mousedown', '.launch-search, .launch-popover', function (e) {
    $(this).focus();
    e.stopPropagation();
    e.preventDefault();
    // don't let click bubble up to window
    e.stopImmediatePropagation();
})

$(document).on('focus', '.launch-search', function (e) {
    // remove all selected items in start menu
    $('.launch-app-selected').removeClass('launch-app-selected');
    // scroll popover to top
    $('.launch-popover').scrollTop(0);
})

$(document).on('change keyup keypress keydown paste', '.launch-search', function (e) {
    // search window.launch_apps.recommended for query
    const query = $(this).val().toLowerCase();
    if (query === '') {
        $('.launch-search-clear').hide();
        $(`.start-app-card`).show();
        $('.launch-apps-recent').show();
        $('.start-section-heading').show();
    } else {
        $('.launch-apps-recent').hide();
        $('.start-section-heading').hide();
        $('.launch-search-clear').show();
        window.launch_apps.recommended.forEach((app) => {
            if (app.title.toLowerCase().includes(query.toLowerCase())) {
                $(`.start-app-card[data-name="${app.name}"]`).show();
            } else {
                $(`.start-app-card[data-name="${app.name}"]`).hide();
            }
        })
    }
})

$(document).on('click', '.launch-search-clear', function (e) {
    $('.launch-search').val('');
    $('.launch-search').trigger('change');
    $('.launch-search').focus();
})

document.addEventListener('fullscreenchange', (event) => {
    // document.fullscreenElement will point to the element that
    // is in fullscreen mode if there is one. If there isn't one,
    // the value of the property is null.

    if (document.fullscreenElement) {
        $('.fullscreen-btn').css('background-image', `url(${window.icons['shrink.svg']})`);
        $('.fullscreen-btn').attr('title', i18n('desktop_exit_full_screen'));
        window.user_preferences.clock_visible === 'auto' && $('#clock').show();
    } else {
        $('.fullscreen-btn').css('background-image', `url(${window.icons['fullscreen.svg']})`);
        $('.fullscreen-btn').attr('title', i18n('desktop_enter_full_screen'));
        window.user_preferences.clock_visible === 'auto' && $('#clock').hide();
    }
})

window.set_desktop_background = function (options) {
    if (options.fit) {
        let fit = options.fit;
        if (fit === 'cover' || fit === 'contain') {
            $('body').css('background-size', fit);
            $('body').css('background-repeat', `no-repeat`);
            $('body').css('background-position', `center center`);
        }
        else if (fit === 'center') {
            $('body').css('background-size', 'auto');
            $('body').css('background-repeat', `no-repeat`);
            $('body').css('background-position', `center center`);
        }

        else if (fit === 'repeat') {
            $('body').css('background-size', `auto`);
            $('body').css('background-repeat', `repeat`);
        }
        window.desktop_bg_fit = fit;
    }

    if (options.url) {
        $('body').css('background-image', `url(${options.url})`);
        window.desktop_bg_url = options.url;
        window.desktop_bg_color = undefined;
    }
    else if (options.color) {
        $('body').css({
            'background-image': `none`,
            'background-color': options.color,
        });
        window.desktop_bg_color = options.color;
        window.desktop_bg_url = undefined;
    }
}

window.update_taskbar = function () {
    let items = []
    $('.taskbar-item-sortable[data-keep-in-taskbar="true"]').each(function (index) {
        items.push({
            name: $(this).attr('data-app'),
            type: 'app',
        })
    })

    // update taskbar in the server-side
    $.ajax({
        url: window.api_origin + "/update-taskbar-items",
        type: 'POST',
        data: JSON.stringify({
            items: items,
        }),
        async: true,
        contentType: "application/json",
        headers: {
            "Authorization": "Bearer " + window.auth_token
        },
    })
}

window.remove_taskbar_item = function (item) {
    $(item).find('*').fadeOut(100, function () { });

    $(item).animate({ width: 0 }, 200, function () {
        $(item).remove();
        
        // Adjust taskbar item sizes after removing an item
        if (window.adjust_taskbar_item_sizes) {
            setTimeout(() => {
                window.adjust_taskbar_item_sizes();
            }, 10);
        }
    })
}

window.enter_fullpage_mode = (el_window) => {
    $('.taskbar').hide();
    $(el_window).find('.window-head').hide();
    $('body').addClass('fullpage-mode');
    $(el_window).css({
        width: '100%',
        height: '100%',
        top: window.toolbar_height + 'px',
        left: 0,
        'border-radius': 0,
    });
}

window.exit_fullpage_mode = (el_window) => {
    $('body').removeClass('fullpage-mode');
    window.taskbar_height = window.default_taskbar_height;
    $('.taskbar').css('height', window.taskbar_height);
    $('.taskbar').show();
    refresh_item_container($('.desktop.item-container'), { fadeInItems: true });
    $(el_window).removeAttr('data-is_fullpage');
    if (el_window) {
        window.reset_window_size_and_position(el_window)
        $(el_window).find('.window-head').show();
    }

    // reset dektop height to take into account the taskbar height
    $('.desktop').css('height', `calc(100vh - ${window.taskbar_height + window.toolbar_height}px)`);

    // hide the 'Show Desktop' button in toolbar
    $('.show-desktop-btn').hide();

    // refresh desktop background
    window.refresh_desktop_background();
}

window.reset_window_size_and_position = (el_window) => {
    $(el_window).css({
        width: 680,
        height: 380,
        'border-radius': window.window_border_radius,
        top: 'calc(50% - 190px)',
        left: 'calc(50% - 340px)',
    });
}

export default UIDesktop;