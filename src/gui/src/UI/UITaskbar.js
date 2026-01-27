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

import UITaskbarItem from './UITaskbarItem.js';
import UIPopover from './UIPopover.js';
import launch_app from '../helpers/launch_app.js';
import UIContextMenu from './UIContextMenu.js';
import UIAgentSelector from './UIAgentSelector.js';

// Debug flag for UITaskbar logging
const UITASKBAR_DEBUG = false;

async function UITaskbar (options) {
    UITASKBAR_DEBUG && UITASKBAR_DEBUG && console.log('[UITaskbar]: Starting initialization...');
    window.global_element_id++;

    options = options ?? {};
    options.content = options.content ?? '';

    let taskbar_position;

    // if first visit ever, set taskbar position to left
    if ( window.first_visit_ever ) {
        puter.kv.set('taskbar_position', 'left');
        taskbar_position = 'left';
    } else {
        taskbar_position = await puter.kv.get('taskbar_position');
        // if this is not first visit, set taskbar position to bottom since it's from a user that
        // used puter before customizing taskbar position was added and the taskbar position was set to bottom
        if ( ! taskbar_position ) {
            taskbar_position = 'bottom'; // default position
            puter.kv.set('taskbar_position', taskbar_position);
        }
    }

    // Force bottom position on mobile devices
    if ( isMobile.phone || isMobile.tablet ) {
        taskbar_position = 'bottom';
    }

    // Set global taskbar position
    window.taskbar_position = taskbar_position;

    // Ensure taskbar_height is set before creating taskbar HTML
    // If taskbar_height is 0 or undefined, use default (50px)
    if (!window.taskbar_height || window.taskbar_height === 0) {
        window.taskbar_height = window.default_taskbar_height || 50;
        UITASKBAR_DEBUG && UITASKBAR_DEBUG && console.log('[UITaskbar]: taskbar_height was 0/undefined, setting to default:', window.taskbar_height);
    }

    // get launch apps
    $.ajax({
        url: `${window.api_origin }/get-launch-apps?icon_size=64`,
        type: 'GET',
        async: true,
        contentType: 'application/json',
        headers: {
            'Authorization': `Bearer ${window.auth_token}`,
        },
        success: function (apps) {
            window.launch_apps = apps;
        },
    });

    let h = '';
    h += `<div id="ui-taskbar_${window.global_element_id}" class="taskbar taskbar-position-${taskbar_position}" style="height:${window.taskbar_height}px;">`;
    h += '<div class="taskbar-sortable" style="display: flex; justify-content: center; z-index: 99999;"></div>';
    h += '</div>';

    if ( taskbar_position === 'left' || taskbar_position === 'right' ) {
        $('.desktop').addClass(`desktop-taskbar-position-${taskbar_position}`);
    }

    // CRITICAL: For bottom position, append to body (not desktop) since we use position: fixed
    // For left/right positions, append to desktop as before
    if (taskbar_position === 'bottom') {
        UITASKBAR_DEBUG && console.log('[UITaskbar]: Appending taskbar to body (bottom position), taskbar_height:', window.taskbar_height);
        $('body').append(h);
    } else {
        UITASKBAR_DEBUG && console.log('[UITaskbar]: Appending taskbar to .desktop, desktop element exists:', $('.desktop').length > 0, 'taskbar_height:', window.taskbar_height, 'taskbar_position:', taskbar_position);
        $('.desktop').append(h);
    }
    
    // Ensure taskbar has correct height after appending (in case it was set to 0)
    const $taskbar = $('.taskbar').last();
    if ($taskbar.length > 0) {
        const currentHeight = parseInt($taskbar.css('height')) || 0;
        if (currentHeight === 0 || !currentHeight) {
            const correctHeight = window.taskbar_height || window.default_taskbar_height || 50;
            $taskbar.css('height', `${correctHeight}px`);
            UITASKBAR_DEBUG && console.log('[UITaskbar]: Fixed taskbar height from', currentHeight, 'to', correctHeight);
        }
    } else {
        UITASKBAR_DEBUG && console.error('[UITaskbar]: ❌ Taskbar element not found after append!');
    }
    
    // Explicitly show the taskbar and desktop to ensure visibility
    $('.taskbar').show();
    $('.desktop').css('display', 'grid');
    
    // CRITICAL: Ensure taskbar is positioned correctly and visible
    // For bottom position, taskbar should be at the bottom of viewport, full width
    if (taskbar_position === 'bottom') {
        const $taskbar = $('.taskbar').last();
        if ($taskbar.length === 0) {
            UITASKBAR_DEBUG && console.error('[UITaskbar]: ❌ Cannot find taskbar element to position!');
            return;
        }
        
        // Position relative to viewport, not desktop container
        // CRITICAL: Keep centered positioning (left: 50%, transform: translateX(-50%)) but ensure visibility
        $taskbar.css({
            'position': 'fixed !important', // Use fixed instead of absolute to position relative to viewport
            'bottom': '5px !important', // Match CSS default bottom position
            'left': '50% !important', // Center horizontally
            'right': 'auto !important',
            'width': 'auto !important', // Let CSS handle width based on content
            'transform': 'translateX(-50%) !important', // Center the taskbar
            'z-index': '10000 !important', // High z-index to ensure it's on top
            'display': 'flex !important', // Force display
            'flex-direction': 'row !important',
            'align-items': 'center !important',
            'justify-content': 'center !important',
            'visibility': 'visible !important', // Force visibility
            'opacity': '1 !important', // Force opacity
            'background-color': 'rgba(0, 0, 0, 0.9) !important', // Ensure taskbar has visible background
            'min-height': `${window.taskbar_height || 50}px !important`, // Ensure minimum height
            'height': `${window.taskbar_height || 50}px !important` // Force height
        });
        
        // Ensure taskbar-sortable takes available space
        $taskbar.find('.taskbar-sortable').css({
            'flex': '1',
            'display': 'flex',
            'justify-content': 'center',
            'align-items': 'center',
            'min-width': '0' // Allow flex shrinking
        });
        
        // Force show with !important to override any CSS
        $taskbar.show();
        
        UITASKBAR_DEBUG && console.log('[UITaskbar]: Taskbar positioned at bottom with fixed positioning, full width', {
            exists: $taskbar.length > 0,
            visible: $taskbar.is(':visible'),
            height: $taskbar.css('height'),
            position: $taskbar.css('position'),
            bottom: $taskbar.css('bottom'),
            zIndex: $taskbar.css('z-index')
        });
    }
    
    UITASKBAR_DEBUG && console.log('[UITaskbar]: Taskbar appended, taskbar element exists:', $('.taskbar').length > 0, 'taskbar visible:', $('.taskbar').is(':visible'), 'taskbar height:', $('.taskbar').last().css('height'), 'taskbar position:', $('.taskbar').last().css('position'), 'taskbar bottom:', $('.taskbar').last().css('bottom'));

    //---------------------------------------------
    // add `Start` to taskbar
    //---------------------------------------------
    UITaskbarItem({
        icon: window.icons['start.svg'],
        name: i18n('start'),
        sortable: false,
        keep_in_taskbar: true,
        disable_context_menu: true,
        onClick: async function (item) {
            // skip if popover already open
            if ( $(item).hasClass('has-open-popover') )
            {
                return;
            }

            // show popover
            let popover = UIPopover({
                content: '<div class="launch-popover hide-scrollbar"></div>',
                snapToElement: item,
                parent_element: item,
                width: 500,
                height: 500,
                class: 'popover-launcher',
                center_horizontally: true,
            });

            // In the rare case that launch_apps is not populated yet, get it from the server
            // then populate the popover
            if ( !window.launch_apps || !window.launch_apps.recent || window.launch_apps.recent.length === 0 ) {
                // get launch apps
                window.launch_apps = await $.ajax({
                    url: `${window.api_origin }/get-launch-apps?icon_size=64`,
                    type: 'GET',
                    async: true,
                    contentType: 'application/json',
                    headers: {
                        'Authorization': `Bearer ${window.auth_token}`,
                    },
                });
            }

            let apps_str = '';

            apps_str += '<div class="launch-search-wrapper">';
            apps_str += `<input style="background-image:url('${window.icons['magnifier-outline.svg']}');" class="launch-search">`;
            apps_str += `<img class="launch-search-clear" src="${window.icons['close.svg']}">`;
            apps_str += '</div>';

            // -------------------------------------------
            // Recent apps
            // -------------------------------------------
            if ( window.launch_apps.recent.length > 0 ) {
                // heading
                apps_str += `<h1 class="start-section-heading start-section-heading-recent">${i18n('recent')}</h1>`;

                // apps
                apps_str += '<div class="launch-apps-recent">';
                for ( let index = 0; index < window.launch_recent_apps_count && index < window.launch_apps.recent.length; index++ ) {
                    const app_info = window.launch_apps.recent[index];
                    apps_str += `<div title="${html_encode(app_info.title)}" data-name="${html_encode(app_info.name)}" class="start-app-card">`;
                    apps_str += `<div class="start-app" data-app-name="${html_encode(app_info.name)}" data-app-uuid="${html_encode(app_info.uuid)}" data-app-icon="${html_encode(app_info.icon)}" data-app-title="${html_encode(app_info.title)}">`;
                    apps_str += `<img class="start-app-icon" src="${html_encode(app_info.icon ? app_info.icon : window.icons['app.svg'])}">`;
                    apps_str += `<span class="start-app-title">${html_encode(app_info.title)}</span>`;
                    apps_str += '</div>';
                    apps_str += '</div>';
                }
                apps_str += '</div>';
            }
            // -------------------------------------------
            // Reccomended apps
            // -------------------------------------------
            if ( window.launch_apps.recommended.length > 0 ) {
                // heading
                apps_str += `<h1 class="start-section-heading start-section-heading-recommended" style="${window.launch_apps.recent.length > 0 ? 'padding-top: 30px;' : ''}">${i18n('recommended')}</h1>`;
                // apps
                apps_str += '<div class="launch-apps-recommended">';
                for ( let index = 0; index < window.launch_apps.recommended.length; index++ ) {
                    const app_info = window.launch_apps.recommended[index];
                    apps_str += `<div title="${html_encode(app_info.title)}" data-name="${html_encode(app_info.name)}" class="start-app-card">`;
                    apps_str += `<div class="start-app" data-app-name="${html_encode(app_info.name)}" data-app-uuid="${html_encode(app_info.uuid)}" data-app-icon="${html_encode(app_info.icon)}" data-app-title="${html_encode(app_info.title)}">`;
                    apps_str += `<img class="start-app-icon" src="${html_encode(app_info.icon ? app_info.icon : window.icons['app.svg'])}">`;
                    apps_str += `<span class="start-app-title">${html_encode(app_info.title)}</span>`;
                    apps_str += '</div>';
                    apps_str += '</div>';
                }
                apps_str += '</div>';
            }

            // add apps to popover
            $(popover).find('.launch-popover').append(apps_str);

            // focus on search input only if not on mobile
            if ( ! isMobile.phone )
            {
                $(popover).find('.launch-search').focus();
            }

            // make apps draggable
            $(popover).find('.start-app').draggable({
                appendTo: 'body',
                revert: 'invalid',
                connectToSortable: '.taskbar-sortable',
                zIndex: parseInt($(popover).css('z-index')) + 1,
                scroll: false,
                distance: 5,
                revertDuration: 100,
                helper: 'clone',
                cursorAt: { left: 18, top: 20 },
                start: function (event, ui) {
                },
                drag: function (event, ui) {
                },
                stop: function () {
                },
            });

            $(popover).on('click', function () {
                // close other context menus
                $('.context-menu').fadeOut(200, function () {
                    $(this).remove();
                    $('.launch-app-selected').removeClass('launch-app-selected');
                });
            });

            $(popover).on('contextmenu taphold', function (e) {
                if ( ! e.target.closest('.launch-search') ) {
                    e.preventDefault();
                }
            });

            $(document).on('contextmenu taphold', '.start-app', function (e) {
                if ( e.type === 'taphold' && !isMobile.phone && !isMobile.tablet )
                {
                    return;
                }

                e.stopImmediatePropagation();
                e.preventDefault();

                // close other context menus
                $('.context-menu').fadeOut(200, function () {
                    $(this).remove();
                });

                let items = [{
                    html: i18n('open'),
                    onClick: function () {
                        $(e.currentTarget).trigger('click');
                    },
                }];

                $('.launch-app-selected').removeClass('launch-app-selected');
                $(e.currentTarget).parent().addClass('launch-app-selected');

                // Determine pin state
                const $existingTaskbarItem = $(`.taskbar-item[data-app="${e.currentTarget.dataset.appName}"]`);
                const isPinned = $existingTaskbarItem.length > 0 && $existingTaskbarItem.attr('data-keep-in-taskbar') === 'true';

                if ( ! isPinned ) {
                    items.push({
                        html: i18n('keep_in_taskbar'),
                        onClick: function () {
                            const $taskbarItem = $(`.taskbar-item[data-app="${e.currentTarget.dataset.appName}"]`);
                            if ( $taskbarItem.length === 0 ) {
                                // No taskbar item yet: create a new pinned one
                                UITaskbarItem({
                                    icon: e.currentTarget.dataset.appIcon,
                                    app: e.currentTarget.dataset.appName,
                                    name: e.currentTarget.dataset.appTitle,
                                    keep_in_taskbar: true,
                                });
                            } else if ( $taskbarItem.attr('data-keep-in-taskbar') !== 'true' ) {
                                // mark as pinned
                                $taskbarItem.attr('data-keep-in-taskbar', 'true');
                            }
                            // Persist
                            window.update_taskbar();
                        },
                    });
                } else {
                    items.push({
                        html: i18n('remove_from_taskbar'),
                        onClick: function () {
                            const $taskbarItem = $(`.taskbar-item[data-app="${e.currentTarget.dataset.appName}"]`);
                            if ( $taskbarItem.length === 0 ) return; // nothing to do
                            // Unpin
                            $taskbarItem.attr('data-keep-in-taskbar', 'false');
                            // If no open windows for this app, remove the item
                            if ( $taskbarItem.attr('data-open-windows') === '0' ) {
                                if ( window.remove_taskbar_item ) {
                                    window.remove_taskbar_item($taskbarItem.get(0));
                                } else {
                                    $taskbarItem.remove();
                                }
                            }
                            window.update_taskbar();
                        },
                    });
                }

                UIContextMenu({
                    items: items,
                });
                return false;
            });
        },
    });

    //---------------------------------------------
    // add `Explorer` to the taskbar
    //---------------------------------------------
    UITaskbarItem({
        icon: window.icons['folders.svg'],
        app: 'explorer',
        name: 'Explorer',
        sortable: false,
        keep_in_taskbar: true,
        lock_keep_in_taskbar: true,
        onClick: function () {
            let open_window_count = parseInt($('.taskbar-item[data-app="explorer"]').attr('data-open-windows'));
            if ( open_window_count === 0 ) {
                launch_app({ name: 'explorer', path: window.home_path });
            } else {
                return false;
            }
        },
    });

    //---------------------------------------------
    // add separator before agent selector
    //---------------------------------------------
    UITaskbarItem({
        icon: '', // No icon for separator
        name: 'separator',
        app: 'separator',
        sortable: false,
        keep_in_taskbar: true,
        lock_keep_in_taskbar: true,
        disable_context_menu: true,
        style: 'pointer-events: none;', // Make it non-interactive
        onClick: function () {
            // Separator is non-interactive
            return false;
        },
    });

    //---------------------------------------------
    // add `Agent Selector` to taskbar (PC2 only)
    //---------------------------------------------
    if (window.user?.wallet_address) {
        // Inline SVG for agent icon (robot head)
        const agentIconSvg = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" ry="2"/><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="11"/><circle cx="8" cy="16" r="1" fill="white"/><circle cx="16" cy="16" r="1" fill="white"/><path d="M9 19h6"/></svg>')}`;
        
        UITaskbarItem({
            icon: agentIconSvg,
            app: 'agent-selector',
            name: 'AI Agents',
            sortable: false,
            keep_in_taskbar: true,
            lock_keep_in_taskbar: true,
            disable_context_menu: true,
            onClick: async function (item) {
                // Skip if popover already open
                if ($(item).hasClass('has-open-popover')) {
                    return;
                }
                
                // Show agent selector popover
                await UIAgentSelector({
                    snapToElement: item,
                    onSelect: function(agentId, agent) {
                        UITASKBAR_DEBUG && console.log('[UITaskbar] Agent selected:', agentId, agent?.name);
                    }
                });
            },
        });
    }

    //---------------------------------------------
    // Add other useful apps to the taskbar
    //---------------------------------------------
    if ( window.user.taskbar_items && window.user.taskbar_items.length > 0 ) {
        for ( let index = 0; index < window.user.taskbar_items.length; index++ ) {
            const app_info = window.user.taskbar_items[index];
            // add taskbar item for each app
            UITaskbarItem({
                icon: app_info.icon,
                app: app_info.name,
                name: app_info.title,
                keep_in_taskbar: true,
                onClick: function () {
                    let open_window_count = parseInt($(`.taskbar-item[data-app="${app_info.name}"]`).attr('data-open-windows'));
                    if ( open_window_count === 0 ) {
                        launch_app({
                            name: app_info.name,
                        });
                    } else {
                        return false;
                    }
                },
            });
        }
    }

    //---------------------------------------------
    // add `Trash` to the taskbar
    //---------------------------------------------
    const trash = await puter.fs.stat({ path: window.trash_path, consistency: 'eventual' });
    if ( window.socket ) {
        window.socket.emit('trash.is_empty', { is_empty: trash.is_empty });
    }

    UITaskbarItem({
        icon: trash.is_empty ? window.icons['trash.svg'] : window.icons['trash-full.svg'],
        app: 'trash',
        name: `${i18n('trash')}`,
        sortable: false,
        keep_in_taskbar: true,
        lock_keep_in_taskbar: true,
        onClick: function () {
            let open_windows = $(`.window[data-path="${html_encode(window.trash_path)}"]`);
            if ( open_windows.length === 0 ) {
                launch_app({ name: 'explorer', path: window.trash_path });
            } else {
                open_windows.focusWindow();
            }
        },
        onItemsDrop: function (items) {
            window.move_items(items, window.trash_path);
        },
    });

    //---------------------------------------------
    // add separator before trash
    //---------------------------------------------
    UITaskbarItem({
        icon: '', // No icon for separator
        name: 'separator',
        app: 'separator',
        sortable: false,
        keep_in_taskbar: true,
        lock_keep_in_taskbar: true,
        disable_context_menu: true,
        style: 'pointer-events: none;', // Make it non-interactive
        onClick: function () {
            // Separator is non-interactive
            return false;
        },
    });

    window.make_taskbar_sortable();
}

//-------------------------------------------
// Taskbar is sortable
//-------------------------------------------
window.make_taskbar_sortable = function () {
    const position = window.taskbar_position || 'bottom';
    const axis = position === 'bottom' ? 'x' : 'y';

    $('.taskbar-sortable').sortable({
        axis: axis,
        items: '.taskbar-item-sortable:not(.has-open-contextmenu):not([data-app="separator"])',
        cancel: '.has-open-contextmenu',
        placeholder: 'taskbar-item-sortable-placeholder',
        helper: 'clone',
        distance: 5,
        revert: 10,
        receive: function (event, ui) {
            if ( ! $(ui.item).hasClass('taskbar-item') ) {
                // if app is already in taskbar, cancel
                if ( $(`.taskbar-item[data-app="${$(ui.item).attr('data-app-name')}"]`).length !== 0 ) {
                    $(this).sortable('cancel');
                    $('.taskbar .start-app').remove();
                    return;
                }
            }
        },
        update: function (event, ui) {
            if ( ! $(ui.item).hasClass('taskbar-item') ) {
                // if app is already in taskbar, cancel
                if ( $(`.taskbar-item[data-app="${$(ui.item).attr('data-app-name')}"]`).length !== 0 ) {
                    $(this).sortable('cancel');
                    $('.taskbar .start-app').remove();
                    return;
                }

                let item = UITaskbarItem({
                    icon: $(ui.item).attr('data-app-icon'),
                    app: $(ui.item).attr('data-app-name'),
                    name: $(ui.item).attr('data-app-title'),
                    append_to_taskbar: false,
                    keep_in_taskbar: true,
                    onClick: function () {
                        let open_window_count = parseInt($(`.taskbar-item[data-app="${$(ui.item).attr('data-app-name')}"]`).attr('data-open-windows'));
                        if ( open_window_count === 0 ) {
                            launch_app({
                                name: $(ui.item).attr('data-app-name'),
                            });
                        } else {
                            return false;
                        }
                    },
                });
                let el = ($(item).detach());
                $(el).insertAfter(ui.item);
                $(el).show();
                $(ui.item).removeItems();
                window.update_taskbar();
            }
            // only proceed to update DB if the item sorted was a pinned item otherwise no point in updating the taskbar in DB
            else if ( $(ui.item).attr('data-keep-in-taskbar') === 'true' ) {
                window.update_taskbar();
            }
        },
    });
};

// Function to update taskbar position
window.update_taskbar_position = async function (new_position) {
    // Prevent position changes on mobile devices - always keep bottom
    if ( isMobile.phone || isMobile.tablet ) {
        return;
    }

    // Valid positions
    const valid_positions = ['left', 'bottom', 'right'];

    if ( ! valid_positions.includes(new_position) ) {
        return;
    }

    // Store the new position
    puter.kv.set('taskbar_position', new_position);
    window.taskbar_position = new_position;

    // Remove old position classes and add new one
    $('.taskbar').removeClass('taskbar-position-left taskbar-position-bottom taskbar-position-right');
    $('.taskbar').addClass(`taskbar-position-${new_position}`);

    // update desktop class, if left or right, add `desktop-taskbar-position-left` or `desktop-taskbar-position-right`
    $('.desktop').removeClass('desktop-taskbar-position-left');
    $('.desktop').removeClass('desktop-taskbar-position-right');
    $('.desktop').addClass(`desktop-taskbar-position-${new_position}`);

    // Update desktop height/width calculations based on new position
    window.update_desktop_dimensions_for_taskbar();

    // Update window positions if needed (for maximized windows)
    $('.window[data-is_maximized="1"]').each(function () {
        const el_window = this;
        window.update_maximized_window_for_taskbar(el_window);
    });

    // Re-initialize sortable with correct axis
    $('.taskbar-sortable').sortable('destroy');
    window.make_taskbar_sortable();

    // Adjust taskbar item sizes for the new position
    setTimeout(() => {
        window.adjust_taskbar_item_sizes();
    }, 10);

    // adjust position if sidepanel is open
    if ( window.taskbar_position === 'bottom' ) {
        if ( $('.window[data-is_panel="1"][data-is_visible="1"]').length > 0 ) {
            $('.taskbar.taskbar-position-bottom').css('left', `calc(50% - ${window.PANEL_WIDTH / 2}px)`);
        } else if ( $('.window[data-is_panel="1"][data-is_visible="0"]').length > 0 ) {
            $('.taskbar.taskbar-position-bottom').css('left', 'calc(50%)');
        }
    } else {

    }

    // Reinitialize all taskbar item tooltips with new position
    $('.taskbar-item').each(function () {
        const $item = $(this);
        // Destroy existing tooltip
        if ( $item.data('ui-tooltip') ) {
            $item.tooltip('destroy');
        }

        // Helper function to get tooltip position based on taskbar position
        function getTooltipPosition () {
            const taskbarPosition = window.taskbar_position || 'bottom';

            if ( taskbarPosition === 'bottom' ) {
                return {
                    my: 'center bottom-20',
                    at: 'center top',
                };
            } else if ( taskbarPosition === 'top' ) {
                return {
                    my: 'center top+20',
                    at: 'center bottom',
                };
            } else if ( taskbarPosition === 'left' ) {
                return {
                    my: 'left+20 center',
                    at: 'right center',
                };
            } else if ( taskbarPosition === 'right' ) {
                return {
                    my: 'right-20 center',
                    at: 'left center',
                };
            }
            return {
                my: 'center bottom-20',
                at: 'center top',
            }; // fallback
        }

        const tooltipPosition = getTooltipPosition();

        // Reinitialize tooltip with new position
        $item.tooltip({
            items: ".taskbar:not(.children-have-open-contextmenu) .taskbar-item:not([data-app='separator'])",
            position: {
                my: tooltipPosition.my,
                at: tooltipPosition.at,
                using: function ( position, feedback ) {
                    $(this).css( position);
                    $('<div>')
                        .addClass( 'arrow')
                        .addClass( feedback.vertical)
                        .addClass( feedback.horizontal)
                        .appendTo( this);
                },
            },
        });
    });
};

// Function to update desktop dimensions based on taskbar position
window.update_desktop_dimensions_for_taskbar = function () {
    const position = window.taskbar_position || 'bottom';

    if ( position === 'bottom' ) {
        $('.desktop').css({
            'height': `calc(100vh - ${window.taskbar_height + window.toolbar_height}px)`,
            'width': '100%',
            'left': '0',
            'top': `${window.toolbar_height}px`,
        });
    } else if ( position === 'left' ) {
        $('.desktop').css({
            'height': `calc(100vh - ${window.toolbar_height}px)`,
            'width': `calc(100% - ${window.taskbar_height}px)`,
            'left': `${window.taskbar_height}px`,
            'top': `${window.toolbar_height}px`,
        });
    } else if ( position === 'right' ) {
        $('.desktop').css({
            'height': `calc(100vh - ${window.toolbar_height}px)`,
            'width': `calc(100% - ${window.taskbar_height}px)`,
            'left': '0',
            'top': `${window.toolbar_height}px`,
        });
    }
};

//-------------------------------------------
// Dynamic taskbar item resizing for left/right positions
//-------------------------------------------
window.adjust_taskbar_item_sizes = function () {
    const position = window.taskbar_position || 'bottom';

    // Only apply to left and right positions
    if ( position !== 'left' && position !== 'right' ) {
        // Reset to default sizes for bottom position
        $('.taskbar .taskbar-item').css({
            'width': '40px',
            'height': '40px',
            'min-width': '40px',
            'min-height': '40px',
        });
        $('.taskbar-icon').css('height', '40px');
        return;
    }

    const taskbar = $('.taskbar')[0];
    const taskbarItems = $('.taskbar .taskbar-item:visible');

    if ( !taskbar || taskbarItems.length === 0 ) return;

    // Get available height (minus padding)
    const totalItemsNeeded = taskbarItems.length;
    const taskbarHeight = taskbar.clientHeight;
    const paddingTop = 20; // from CSS
    const paddingBottom = 20; // from CSS
    const availableHeight = taskbarHeight - paddingTop - paddingBottom - 180;

    // Calculate space needed with default sizes
    const defaultItemSize = 40;
    const defaultMargin = 5;
    const spaceNeededDefault = (totalItemsNeeded * defaultItemSize) + ((totalItemsNeeded - 1) * defaultMargin);

    if ( spaceNeededDefault <= availableHeight ) {
        // No overflow, use default sizes
        taskbarItems.css({
            'width': '40px',
            'height': '40px',
            'min-width': '40px',
            'min-height': '40px',
            'padding': '6px 5px 10px 5px', // default padding
        });
        $('.taskbar-icon').css('height', `${defaultItemSize }px`);
        $('.taskbar-icon').css('width', '40px');
        $('.taskbar-icon > img').css('width', 'auto');
        $('.taskbar-icon > img').css('margin', 'auto');
        $('.taskbar-icon > img').css('display', 'block');

        // Reset margins to default
        taskbarItems.css('margin-bottom', '5px');
        taskbarItems.last().css('margin-bottom', '0px');
    } else {
        // Overflow detected, calculate smaller sizes
        // Reserve some margin space (minimum 2px between items)
        const minMargin = 2;
        const marginSpace = (totalItemsNeeded - 1) * minMargin;
        const availableForItems = availableHeight - marginSpace;
        const newItemSize = Math.floor(availableForItems / totalItemsNeeded);

        // Ensure minimum size of 20px
        const finalItemSize = Math.max(20, newItemSize);

        // Calculate proportional padding based on size ratio
        const sizeRatio = finalItemSize / defaultItemSize;
        const paddingTop = Math.max(1, Math.floor(6 * sizeRatio));
        const paddingRight = Math.max(1, Math.floor(5 * sizeRatio));
        const paddingBottom = Math.max(1, Math.floor(10 * sizeRatio));
        const paddingLeft = Math.max(1, Math.floor(5 * sizeRatio));

        // Apply new sizes and padding
        taskbarItems.css({
            'width': '40px',
            'height': `${finalItemSize }px`,
            'min-width': '40px',
            'min-height': `${finalItemSize }px`,
            'padding': `${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px`,
        });
        $('.taskbar-icon').css('height', `${finalItemSize }px`);
        $('.taskbar-icon').css('width', '40px');
        $('.taskbar-icon > img').css('width', 'auto');
        $('.taskbar-icon > img').css('margin', 'auto');
        $('.taskbar-icon > img').css('display', 'block');
        // Adjust margins
        taskbarItems.css('margin-bottom', `${minMargin }px`);
        taskbarItems.last().css('margin-bottom', '0px');
    }
};

// Hook into existing taskbar functionality
$(document).ready(function () {
    // Watch for taskbar item changes
    const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if ( mutation.type === 'childList' || mutation.type === 'attributes' ) {
                // Delay to ensure DOM updates are complete
                setTimeout(() => {
                    window.adjust_taskbar_item_sizes();
                }, 10);
            }
        });
    });

    // Start observing when taskbar is available
    const checkTaskbar = setInterval(() => {
        const taskbar = document.querySelector('.taskbar-sortable');
        if ( taskbar ) {
            observer.observe(taskbar, {
                childList: true,
                attributes: true,
                subtree: true,
            });
            clearInterval(checkTaskbar);

            // Initial call
            setTimeout(() => {
                window.adjust_taskbar_item_sizes();
            }, 100);
        }
    }, 100);

    // Also watch for window resize events
    window.addEventListener('resize', () => {
        setTimeout(() => {
            window.adjust_taskbar_item_sizes();
        }, 10);
    });
});

export default UITaskbar;