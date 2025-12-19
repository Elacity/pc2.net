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

import UIAlert from './UI/UIAlert.js';
import UIWindow from './UI/UIWindow.js';
import UIWindowSignup from './UI/UIWindowSignup.js';
import UIWindowRequestPermission from './UI/UIWindowRequestPermission.js';
import UIItem from './UI/UIItem.js';
import UIWindowFontPicker from './UI/UIWindowFontPicker.js';
import UIWindowColorPicker from './UI/UIWindowColorPicker.js';
import UIPrompt from './UI/UIPrompt.js';
import download from './helpers/download.js';
import path from './lib/path.js';
import UIContextMenu from './UI/UIContextMenu.js';
import update_mouse_position from './helpers/update_mouse_position.js';
import item_icon from './helpers/item_icon.js';
import UIPopover from './UI/UIPopover.js';
import socialLink from './helpers/socialLink.js';
import UIWindowEmailConfirmationRequired from './UI/UIWindowEmailConfirmationRequired.js';
import UIWindowSaveAccount from './UI/UIWindowSaveAccount.js';

import { PROCESS_IPC_ATTACHED } from './definitions.js';

window.ipc_handlers = {};
/**
 * In Puter, apps are loaded in iframes and communicate with the graphical user interface (GUI), and each other, using the postMessage API.
 * The following sets up an Inter-Process Messaging System between apps and the GUI that enables communication
 * for various tasks such as displaying alerts, prompts, managing windows, handling file operations, and more.
 *
 * The system listens for 'message' events on the window object, handling different types of messages from the app (which is loaded in an iframe),
 * such as ALERT, createWindow, showOpenFilePicker, ...
 * Each message handler performs specific actions, including creating UI windows, handling file saves and reads, and responding to user interactions.
 *
 * Precautions are taken to ensure proper usage of appInstanceIDs and other sensitive information.
 */
const ipc_listener = async (event, handled) => {
    // Debug: Log ALL messages to see what's coming through
    if (event.data && (event.data.msg === 'showSaveFilePicker' || event.data.msg === 'showOpenFilePicker')) {
        console.log('[IPC.js]: 🔍 Message received (before filtering):', event.data.msg, 'appInstanceID:', event.data.appInstanceID, 'env:', event.data.env, 'origin:', event.origin, 'full data:', event.data);
    }
    
    const app_env = event.data?.env ?? 'app';

    // Debug: Log all messages from apps
    if (app_env === 'app' && event.data?.msg) {
        console.log('[IPC.js]: 📥 Received message:', event.data.msg, 'appInstanceID:', event.data.appInstanceID, 'full data:', event.data);
    }

    // Only process messages from apps
    if ( app_env !== 'app' )
    {
        return handled.resolve(false);
    }

    // --------------------------------------------------------
    // A response to a GUI message received from the app.
    // --------------------------------------------------------
    if ( typeof event.data.original_msg_id !== 'undefined' && typeof window.appCallbackFunctions[event.data.original_msg_id] !== 'undefined' ) {
        // Execute callback
        window.appCallbackFunctions[event.data.original_msg_id](event.data);
        // Remove this callback function since it won't be needed again
        delete window.appCallbackFunctions[event.data.original_msg_id];

        // Done
        return handled.resolve(false);
    }

    // --------------------------------------------------------
    // Message from apps
    // --------------------------------------------------------

    // `data` and `msg` are required
    if ( !event.data || !event.data.msg ) {
        return handled.resolve(false);
    }

    // `appInstanceID` is required
    if ( ! event.data.appInstanceID ) {
        console.error('appInstanceID is needed', event.data);
        console.error('Available app_instance_ids:', Array.from(window.app_instance_ids || []));
        return handled.resolve(false);
    } else if ( ! window.app_instance_ids.has(event.data.appInstanceID) ) {
        console.error('appInstanceID is invalid:', event.data.appInstanceID);
        console.error('Available app_instance_ids:', Array.from(window.app_instance_ids || []));
        return handled.resolve(false);
    }

    handled.resolve(true);

    const $el_parent_window = $(window.window_for_app_instance(event.data.appInstanceID));
    const parent_window_id = $el_parent_window.attr('data-id');
    const $el_parent_disable_mask = $el_parent_window.find('.window-disable-mask');
    const target_iframe = window.iframe_for_app_instance(event.data.appInstanceID);
    const msg_id = event.data.uuid;
    const app_name = $(target_iframe).attr('data-app');
    const app_uuid = $el_parent_window.attr('data-app_uuid');

    // New IPC handlers should be registered here.
    // Do this by calling `register_ipc_handler` of IPCService.
    if ( window.ipc_handlers.hasOwnProperty(event.data.msg) ) {
        const services = globalThis.services;
        const svc_process = services.get('process');

        // Add version info to old puter.js messages
        // (and coerce them into the format of new ones)
        if ( event.data.$ === undefined ) {
            event.data.$ = 'puter-ipc';
            event.data.v = 1;
            event.data.parameters = { ...event.data };
            delete event.data.parameters.msg;
            delete event.data.parameters.appInstanceId;
            delete event.data.parameters.env;
            delete event.data.parameters.uuid;
        }

        // The IPC context contains information about the call
        const iframe = window.iframe_for_app_instance(event.data.appInstanceID);
        const process = svc_process.get_by_uuid(event.data.appInstanceID);
        const ipc_context = {
            caller: {
                process: process,
                app: {
                    appInstanceID: event.data.appInstanceID,
                    iframe,
                    window: $el_parent_window,
                },
            },
        };

        // Registered IPC handlers are an object with a `handle()`
        // method. We call it "spec" here, meaning specification.
        const spec = window.ipc_handlers[event.data.msg];
        let retval = await spec.handler(event.data.parameters, { msg_id, ipc_context });

        puter.util.rpc.send(iframe.contentWindow, msg_id, retval);

        return;
    }

    // --------------------------------------------------------
    // Dispatch custom event so that extensions can listen to it
    // --------------------------------------------------------
    window.dispatchEvent(new CustomEvent('ipc:message', { detail: event.data }));

    // todo validate all event.data stuff coming from the client (e.g. event.data.message, .msg, ...)
    //-------------------------------------------------
    // READY
    //-------------------------------------------------
    if ( event.data.msg === 'READY' ) {
        const services = globalThis.services;
        const svc_process = services.get('process');
        const process = svc_process.get_by_uuid(event.data.appInstanceID);

        process.ipc_status = PROCESS_IPC_ATTACHED;
    }
    //-------------------------------------------------
    // windowFocused
    //-------------------------------------------------
    if ( event.data.msg === 'windowFocused' ) {
        // TODO: Respond to this
    }
    //--------------------------------------------------------
    // requestEmailConfirmation
    //--------------------------------------------------------
    else if ( event.data.msg === 'requestEmailConfirmation' ) {
        // If the user has an email and it is confirmed, respond with success
        if ( window.user.email && window.user.email_confirmed ) {
            target_iframe.contentWindow.postMessage({
                original_msg_id: msg_id,
                msg: 'requestEmailConfirmationResponded',
                response: true,
            }, '*');
        }

        // If the user is a temporary user, show the save account window
        if ( window.user.is_temp &&
            !await UIWindowSaveAccount({
                send_confirmation_code: true,
                message: 'Please create an account to proceed.',
                window_options: {
                    backdrop: true,
                    close_on_backdrop_click: false,
                },
            }) ) {
            target_iframe.contentWindow.postMessage({
                original_msg_id: msg_id,
                msg: 'requestEmailConfirmationResponded',
                response: false,
            }, '*');
            return;
        }
        else if ( !window.user.email_confirmed && !await UIWindowEmailConfirmationRequired() ) {
            target_iframe.contentWindow.postMessage({
                original_msg_id: msg_id,
                msg: 'requestEmailConfirmationResponded',
                response: false,
            }, '*');
            return;
        }

        const email_confirm_resp = await UIWindowEmailConfirmationRequired({
            email: window.user.email,
        });

        target_iframe.contentWindow.postMessage({
            original_msg_id: msg_id,
            msg: 'requestEmailConfirmationResponded',
            response: email_confirm_resp,
        }, '*');
    }
    //--------------------------------------------------------
    // ALERT
    //--------------------------------------------------------
    else if ( event.data.msg === 'ALERT' && event.data.message !== undefined ) {
        const alert_resp = await UIAlert({
            message: event.data.message,
            buttons: event.data.buttons,
            type: event.data.options?.type,
            window_options: {
                parent_uuid: event.data.appInstanceID,
                disable_parent_window: true,
            },
        });

        target_iframe.contentWindow.postMessage({
            original_msg_id: msg_id,
            msg: 'alertResponded',
            response: alert_resp,
        }, '*');
    }
    //--------------------------------------------------------
    // PROMPT
    //--------------------------------------------------------
    else if ( event.data.msg === 'PROMPT' && event.data.message !== undefined ) {
        const prompt_resp = await UIPrompt({
            message: html_encode(event.data.message),
            placeholder: html_encode(event.data.placeholder),
            window_options: {
                parent_uuid: event.data.appInstanceID,
                disable_parent_window: true,
            },
        });

        target_iframe.contentWindow.postMessage({
            original_msg_id: msg_id,
            msg: 'promptResponded',
            response: prompt_resp,
        }, '*');
    }
    //--------------------------------------------------------
    // getLanguage
    //--------------------------------------------------------
    else if ( event.data.msg === 'getLanguage' ) {
        target_iframe.contentWindow.postMessage({
            original_msg_id: msg_id,
            msg: 'languageReceived',
            language: window.locale || 'en',
        }, '*');
    }
    //--------------------------------------------------------
    // getInstancesOpen
    //--------------------------------------------------------
    else if ( event.data.msg === 'getInstancesOpen' ) {
        // count open windows of this app
        let instances_open = $(`.window-app[data-app_uuid="${app_uuid}"]`).length;

        // send number of open instances of this app
        target_iframe.contentWindow.postMessage({
            original_msg_id: msg_id,
            msg: 'instancesOpenSucceeded',
            instancesOpen: instances_open,
        }, '*');
    }
    //--------------------------------------------------------
    // socialShare
    //--------------------------------------------------------
    else if ( event.data.msg === 'socialShare' && event.data.url !== undefined ) {
        const window_position = $el_parent_window.position();

        // left position provided
        if ( event.data.options.left !== undefined ) {
            event.data.options.left = Math.abs(event.data.options.left);
            event.data.options.left += window_position.left;
        }
        // left position not provided
        else {
            // use top left of the window
            event.data.options.left = window_position.left;
        }
        if ( event.data.options.top !== undefined ) {
            event.data.options.top = Math.abs(event.data.options.top);
            event.data.options.top += window_position.top + 30;
        } else {
            // use top left of the window
            event.data.options.top = window_position.top + 30;
        }

        // top and left must be numbers
        event.data.options.top = parseFloat(event.data.options.top);
        event.data.options.left = parseFloat(event.data.options.left);

        const social_links = socialLink({ url: event.data.url, title: event.data.message, description: event.data.message });

        let h = '';
        let copy_icon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-copy" viewBox="0 0 16 16"> <path fill-rule="evenodd" d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1z"/> </svg>';

        // create html
        h += '<div style="padding: 10px 10px 2px;">';
        h += '<div style="display:flex;">';
        h += `<input type="text" style="margin-bottom:10px; font-size: 13px;" class="social-url" readonly value="${html_encode(event.data.url)}"/>`;
        h += `<button class="button copy-link" style="white-space:nowrap; text-align:center; white-space: nowrap; text-align: center; padding-left: 10px; padding-right: 10px; height: 33px; box-shadow: none; margin-left: 4px;">${(copy_icon)}</button>`;
        h += '</div>';

        h += `<p style="margin: 0; text-align: center; margin-bottom: 0px; color: #484a57; font-weight: 500; font-size: 14px;">${i18n('share_to')}</p>`;
        h += `<a class="copy-link-social-btn" target="_blank" href="${social_links.twitter}" style=""><svg viewBox="0 0 24 24" aria-hidden="true" style="opacity: 0.7;"><g><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></g></svg></a>`;
        h += `<a class="copy-link-social-btn" target="_blank" href="${social_links.whatsapp}" style=""><img src="${window.icons['logo-whatsapp.svg']}"></a>`;
        h += `<a class="copy-link-social-btn" target="_blank" href="${social_links.facebook}" style=""><img src="${window.icons['logo-facebook.svg']}"></a>`;
        h += `<a class="copy-link-social-btn" target="_blank" href="${social_links.linkedin}" style=""><img src="${window.icons['logo-linkedin.svg']}"></a>`;
        h += `<a class="copy-link-social-btn" target="_blank" href="${social_links.reddit}" style=""><img src="${window.icons['logo-reddit.svg']}"></a>`;
        h += `<a class="copy-link-social-btn" target="_blank" href="${social_links['telegram.me']}" style=""><img src="${window.icons['logo-telegram.svg']}"></a>`;
        h += '</div>';

        let po = await UIPopover({
            content: h,
            // snapToElement: this,
            parent_element: $el_parent_window,
            parent_id: parent_window_id,
            // width: 300,
            height: 100,
            left: event.data.options.left,
            top: event.data.options.top,
            position: 'bottom',
        });

        $(po).find('.copy-link').on('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const url = $(po).find('.social-url').val();
            navigator.clipboard.writeText(url);
            // set checkmark
            $(po).find('.copy-link').html('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-check2" viewBox="0 0 16 16"> <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0"/> </svg>');
            // reset checkmark
            setTimeout(function () {
                $(po).find('.copy-link').html(copy_icon);
            }, 1000);

            return false;
        });
    }

    //--------------------------------------------------------
    // env
    //--------------------------------------------------------
    else if ( event.data.msg === 'env' ) {
        target_iframe.contentWindow.postMessage({
            original_msg_id: msg_id,
        }, '*');
    }
    //--------------------------------------------------------
    // createWindow
    //--------------------------------------------------------
    else if ( event.data.msg === 'createWindow' ) {
        // todo: validate as many of these as possible
        if ( event.data.options ) {
            const win = await UIWindow({
                title: event.data.options.title,
                disable_parent_window: event.data.options.disable_parent_window,
                width: event.data.options.width,
                height: event.data.options.height,
                is_resizable: event.data.options.is_resizable,
                has_head: event.data.options.has_head,
                center: event.data.options.center,
                show_in_taskbar: event.data.options.show_in_taskbar,
                iframe_srcdoc: event.data.options.content,
                parent_uuid: event.data.appInstanceID,
            });

            // create safe window object
            const safe_win = {
                id: $(win).attr('data-element_uuid'),
            };

            // send confirmation to requester window
            target_iframe.contentWindow.postMessage({
                original_msg_id: msg_id,
                window: safe_win,
            }, '*');
        }
    }
    //--------------------------------------------------------
    // setItem
    //--------------------------------------------------------
    else if ( event.data.msg === 'setItem' && event.data.key && event.data.value ) {
        puter.kv.set({
            key: event.data.key,
            value: event.data.value,
            app_uid: app_uuid,
        }).then(() => {
            // send confirmation to requester window
            target_iframe.contentWindow.postMessage({
                original_msg_id: msg_id,
            }, '*');
        });
    }
    //--------------------------------------------------------
    // getItem
    //--------------------------------------------------------
    else if ( event.data.msg === 'getItem' && event.data.key ) {
        puter.kv.get({
            key: event.data.key,
            app_uid: app_uuid,
        }).then((result) => {
            // send confirmation to requester window
            target_iframe.contentWindow.postMessage({
                original_msg_id: msg_id,
                msg: 'getItemSucceeded',
                value: result ?? null,
            }, '*');
        });
    }
    //--------------------------------------------------------
    // removeItem
    //--------------------------------------------------------
    else if ( event.data.msg === 'removeItem' && event.data.key ) {
        puter.kv.del({
            key: event.data.key,
            app_uid: app_uuid,
        }).then(() => {
            // send confirmation to requester window
            target_iframe.contentWindow.postMessage({
                original_msg_id: msg_id,
            }, '*');
        });
    }
    //--------------------------------------------------------
    // showOpenFilePicker
    //--------------------------------------------------------
    else if ( event.data.msg === 'showOpenFilePicker' ) {
        // Auth
        if ( !window.is_auth() && !(await UIWindowSignup({ referrer: app_name })) )
        {
            return;
        }

        // Disable parent window
        $el_parent_window.addClass('window-disabled');
        $el_parent_disable_mask.show();
        $el_parent_disable_mask.css('z-index', parseInt($el_parent_window.css('z-index')) + 1);
        $(target_iframe).blur();

        // Allowed_file_types
        let allowed_file_types = '';
        if ( event.data.options && event.data.options.accept )
        {
            allowed_file_types = event.data.options.accept;
        }

        // selectable_body
        let is_selectable_body = false;
        if ( event.data.options && event.data.options.multiple && event.data.options.multiple === true )
        {
            is_selectable_body = true;
        }

        // Open dialog
        let path = event.data.options?.path ?? `/${ window.user.username }/Desktop`;
        if ( (`${path}`).toLowerCase().startsWith('%appdata%') ) {
            path = path.slice('%appdata%'.length);
            if ( path !== '' && !path.startsWith('/') ) path = `/${ path}`;
            path = `/${ window.user.username }/AppData/${ app_uuid }${path}`;
        }
        UIWindow({
            allowed_file_types: allowed_file_types,
            path,
            // this is the uuid of the window to which this dialog will return
            parent_uuid: event.data.appInstanceID,
            onDialogCancel: () => {
                target_iframe.contentWindow.postMessage({
                    msg: 'fileOpenCancelled',
                    original_msg_id: msg_id,
                }, '*');
            },
            show_maximize_button: false,
            show_minimize_button: false,
            title: 'Open',
            is_dir: true,
            is_openFileDialog: true,
            selectable_body: is_selectable_body,
            iframe_msg_uid: msg_id,
            initiating_app_uuid: app_uuid,
            center: true,
        });
    }
    //--------------------------------------------------------
    // mouseClicked
    //--------------------------------------------------------
    else if ( event.data.msg === 'mouseClicked' ) {
        // close all popovers whose parent_id is parent_window_id
        $(`.popover[data-parent_id="${parent_window_id}"]`).remove();
    }
    //--------------------------------------------------------
    // showDirectoryPicker
    //--------------------------------------------------------
    else if ( event.data.msg === 'showDirectoryPicker' ) {
        // Auth
        if ( !window.is_auth() && !(await UIWindowSignup({ referrer: app_name })) )
        {
            return;
        }

        // Disable parent window
        $el_parent_window.addClass('window-disabled');
        $el_parent_disable_mask.show();
        $el_parent_disable_mask.css('z-index', parseInt($el_parent_window.css('z-index')) + 1);
        $(target_iframe).blur();

        // allowed_file_types
        let allowed_file_types = '';
        if ( event.data.options && event.data.options.accept )
        {
            allowed_file_types = event.data.options.accept;
        }

        // selectable_body
        let is_selectable_body = false;
        if ( event.data.options && event.data.options.multiple && event.data.options.multiple === true )
        {
            is_selectable_body = true;
        }

        // open dialog
        UIWindow({
            path: `/${ window.user.username }/Desktop`,
            // this is the uuid of the window to which this dialog will return
            parent_uuid: event.data.appInstanceID,
            show_maximize_button: false,
            show_minimize_button: false,
            title: 'Open',
            is_dir: true,
            is_directoryPicker: true,
            selectable_body: is_selectable_body,
            iframe_msg_uid: msg_id,
            center: true,
            initiating_app_uuid: app_uuid,
        });
    }
    //--------------------------------------------------------
    // setWindowTitle
    //--------------------------------------------------------
    else if ( event.data.msg === 'setWindowTitle' && event.data.new_title !== undefined ) {
        let el_window;
        // specific window
        if ( event.data.window_id )
        {
            el_window = $(`.window[data-element_uuid="${html_encode(event.data.window_id)}"]`);
        }
        // app window
        else
        {
            el_window = window.window_for_app_instance(event.data.appInstanceID);
        }

        // window not found
        if ( !el_window || el_window.length === 0 )
        {
            return;
        }

        // set window title
        $(el_window).find('.window-head-title').html(html_encode(event.data.new_title));
        // send confirmation to requester window
        target_iframe.contentWindow.postMessage({
            original_msg_id: msg_id,
        }, '*');
    }
    //--------------------------------------------------------
    // showWindow
    //--------------------------------------------------------
    else if ( event.data.msg === 'showWindow' ) {
        let el_window;
        // show the app window
        el_window = window.window_for_app_instance(event.data.appInstanceID);

        // show the window
        $(el_window).makeWindowVisible();
    }
    //--------------------------------------------------------
    // hideWindow
    //--------------------------------------------------------
    else if ( event.data.msg === 'hideWindow' ) {
        let el_window;
        // hide the app window
        el_window = window.window_for_app_instance(event.data.appInstanceID);

        // hide the window
        $(el_window).makeWindowInvisible();
    }
    //--------------------------------------------------------
    // mouseMoved
    //--------------------------------------------------------
    else if ( event.data.msg === 'mouseMoved' ) {
        // Auth
        if ( !window.is_auth() && !(await UIWindowSignup({ referrer: app_name })) )
        {
            return;
        }

        // get x and y and sanitize
        let x = parseInt(event.data.x);
        let y = parseInt(event.data.y);

        // get parent window
        const el_window = window.window_for_app_instance(event.data.appInstanceID);

        // get window position
        const window_position = $(el_window).position();

        // does this window have a menubar?
        const $menubar = $(el_window).find('.window-menubar');
        if ( $menubar.length > 0 ) {
            y += $menubar.height();
        }

        // does this window have a head?
        const $head = $(el_window).find('.window-head');
        if ( $head.length > 0 && $head.css('display') !== 'none' ) {
            y += $head.height();
        }

        // update mouse position
        update_mouse_position(x + window_position.left, y + window_position.top);
    }
    //--------------------------------------------------------
    // contextMenu
    //--------------------------------------------------------
    else if ( event.data.msg === 'contextMenu' ) {
        // Auth
        if ( !window.is_auth() && !(await UIWindowSignup({ referrer: app_name })) )
        {
            return;
        }

        const hydrator = puter.util.rpc.getHydrator({
            target: target_iframe.contentWindow,
        });
        let value = hydrator.hydrate(event.data.value);

        // get parent window
        const el_window = window.window_for_app_instance(event.data.appInstanceID);

        let items = value.items ?? [];
        const sanitize_items = items => {
            return items.map(item => {
                // make sure item.icon and item.icon_active are valid base64 strings
                if ( item.icon && !item.icon.startsWith('data:image') ) {
                    item.icon = undefined;
                }
                if ( item.icon_active && !item.icon_active.startsWith('data:image') ) {
                    item.icon_active = undefined;
                }
                // Check if the item is just '-'
                if ( item === '-' ) {
                    return '-';
                }
                // Otherwise, proceed as before
                return {
                    html: html_encode(item.label),
                    icon: item.icon ? `<img style="width: 15px; height: 15px; position: absolute; top: 4px; left: 6px;" src="${html_encode(item.icon)}" />` : undefined,
                    icon_active: item.icon_active ? `<img style="width: 15px; height: 15px; position: absolute; top: 4px; left: 6px;" src="${html_encode(item.icon_active)}" />` : undefined,
                    disabled: item.disabled,
                    onClick: () => {
                        if ( item.action !== undefined ) {
                            item.action();
                        }
                        // focus the window
                        $(el_window).focusWindow();
                    },
                    items: item.items ? sanitize_items(item.items) : undefined,
                };
            });
        };

        items = sanitize_items(items);

        // Open context menu
        UIContextMenu({
            items: items,
        });

        $(target_iframe).get(0).focus({ preventScroll: true });
    }
    // --------------------------------------------------------
    // disableMenuItem
    // --------------------------------------------------------
    else if ( event.data.msg === 'disableMenuItem' ) {
        set_menu_item_prop(window.menubars[event.data.appInstanceID], event.data.value.id, 'disabled', true);
    }
    // --------------------------------------------------------
    // enableMenuItem
    // --------------------------------------------------------
    else if ( event.data.msg === 'enableMenuItem' ) {
        set_menu_item_prop(window.menubars[event.data.appInstanceID], event.data.value.id, 'disabled', false);
    }
    //--------------------------------------------------------
    // setMenuItemIcon
    //--------------------------------------------------------
    else if ( event.data.msg === 'setMenuItemIcon' ) {
        set_menu_item_prop(window.menubars[event.data.appInstanceID], event.data.value.id, 'icon', event.data.value.icon);
    }
    //--------------------------------------------------------
    // setMenuItemIconActive
    //--------------------------------------------------------
    else if ( event.data.msg === 'setMenuItemIconActive' ) {
        set_menu_item_prop(window.menubars[event.data.appInstanceID], event.data.value.id, 'icon_active', event.data.value.icon_active);
    }
    //--------------------------------------------------------
    // setMenuItemChecked
    //--------------------------------------------------------
    else if ( event.data.msg === 'setMenuItemChecked' ) {
        set_menu_item_prop(window.menubars[event.data.appInstanceID], event.data.value.id, 'checked', event.data.value.checked);
    }
    //--------------------------------------------------------
    // setMenubar
    //--------------------------------------------------------
    else if ( event.data.msg === 'setMenubar' ) {
        const el_window = window.window_for_app_instance(event.data.appInstanceID);

        const hydrator = puter.util.rpc.getHydrator({
            target: target_iframe.contentWindow,
        });
        const value = hydrator.hydrate(event.data.value);

        // Show menubar
        let $menubar;
        $menubar = $(el_window).find('.window-menubar');
        // add window-with-menubar class to the window
        $(el_window).addClass('window-with-menubar');

        $menubar.css('display', 'flex');

        // disable system context menu
        $menubar.on('contextmenu', (e) => {
            e.preventDefault();
        });

        // empty menubar
        $menubar.empty();

        if ( ! window.menubars[event.data.appInstanceID] )
        {
            window.menubars[event.data.appInstanceID] = value.items;
        }

        // disable system context menu
        $menubar.on('contextmenu', (e) => {
            e.preventDefault();
        });

        const sanitize_items = items => {
            return items.map(item => {
                // Check if the item is just '-'
                if ( item === '-' ) {
                    return '-';
                }
                // Otherwise, proceed as before
                return {
                    html: html_encode(item.label),
                    disabled: item.disabled,
                    checked: item.checked,
                    icon: item.icon ? `<img style="width: 15px; height: 15px; position: absolute; top: 4px; left: 6px;" src="${html_encode(item.icon)}" />` : undefined,
                    icon_active: item.icon_active ? `<img style="width: 15px; height: 15px; position: absolute; top: 4px; left: 6px;" src="${html_encode(item.icon_active)}" />` : undefined,
                    action: item.action,
                    items: item.items ? sanitize_items(item.items) : undefined,
                };
            });
        };

        // This array will store the menubar button elements
        const menubar_buttons = [];

        // Add menubar items
        let current = null;
        let current_i = null;
        let state_open = false;
        const open_menu = ({ i, pos, parent_element, items }) => {
            let delay = true;
            if ( state_open ) {
                // if already open, keep it open
                if ( current_i === i ) return;

                delay = false;
                current && current.cancel({ meta: 'menubar', fade: false });
            }

            // Close all other context menus
            $('.context-menu').remove();

            // Set this menubar button as active
            menubar_buttons.forEach(el => el.removeClass('active'));
            menubar_buttons[i].addClass('active');

            // Open the context menu
            const ctxMenu = UIContextMenu({
                delay: delay,
                parent_element: parent_element,
                position: { top: pos.top + 30, left: pos.left },
                css: {
                    'box-shadow': '0px 2px 6px #00000059',
                },
                items: sanitize_items(items),
            });

            state_open = true;
            current = ctxMenu;
            current_i = i;

            ctxMenu.onClose = (cancel_options) => {
                if ( cancel_options?.meta === 'menubar' ) return;
                menubar_buttons.forEach(el => el.removeClass('active'));
                ctxMenu.onClose = null;
                current_i = null;
                current = null;
                state_open = false;
            };
        };
        const add_items = (parent, items) => {
            for ( let i = 0; i < items.length; i++ ) {
                const I = i;
                const item = items[i];
                const label = html_encode(item.label);
                const el_item = $(`<div class="window-menubar-item"><span>${label}</span></div>`);
                const parent_element = el_item.get(0);

                el_item.on('mousedown', (e) => {
                    // check if it has has-open-context-menu class
                    if ( el_item.hasClass('has-open-contextmenu') ) {
                        return;
                    }
                    if ( state_open ) {
                        state_open = false;
                        current && current.cancel({ meta: 'menubar' });
                        current_i = null;
                        current = null;
                    }
                    if ( item.items ) {
                        const pos = el_item[0].getBoundingClientRect();
                        open_menu({
                            i,
                            pos,
                            parent_element,
                            items: item.items,
                        });
                        $(el_window).focusWindow(e);
                        e.stopPropagation();
                        e.preventDefault();
                        return;
                    }
                });

                // Clicking an item with an action will trigger that action
                el_item.on('click', () => {
                    if ( item.action ) {
                        item.action();
                    }
                });

                el_item.on('mouseover', () => {
                    if ( ! state_open ) return;
                    if ( ! item.items ) return;

                    const pos = el_item[0].getBoundingClientRect();
                    open_menu({
                        i,
                        pos,
                        parent_element,
                        items: item.items,
                    });
                });
                $menubar.append(el_item);
                menubar_buttons.push(el_item);
            }
        };
        add_items($menubar, window.menubars[event.data.appInstanceID]);
    }
    //--------------------------------------------------------
    // setWindowWidth
    //--------------------------------------------------------
    else if ( event.data.msg === 'setWindowWidth' && event.data.width !== undefined ) {
        let el_window;
        // specific window
        if ( event.data.window_id )
        {
            el_window = $(`.window[data-element_uuid="${html_encode(event.data.window_id)}"]`);
        }
        // app window
        else
        {
            el_window = window.window_for_app_instance(event.data.appInstanceID);
        }

        // window not found
        if ( !el_window || el_window.length === 0 )
        {
            return;
        }

        event.data.width = parseFloat(event.data.width);
        // must be at least 200
        if ( event.data.width < 200 )
        {
            event.data.width = 200;
        }
        // set window width
        $(el_window).css('width', event.data.width);
        // send confirmation to requester window
        target_iframe.contentWindow.postMessage({
            original_msg_id: msg_id,
        }, '*');
    }
    //--------------------------------------------------------
    // setWindowHeight
    //--------------------------------------------------------
    else if ( event.data.msg === 'setWindowHeight' && event.data.height !== undefined ) {
        let el_window;
        // specific window
        if ( event.data.window_id )
        {
            el_window = $(`.window[data-element_uuid="${html_encode(event.data.window_id)}"]`);
        }
        // app window
        else
        {
            el_window = window.window_for_app_instance(event.data.appInstanceID);
        }

        // window not found
        if ( !el_window || el_window.length === 0 )
        {
            return;
        }

        event.data.height = parseFloat(event.data.height);
        // must be at least 200
        if ( event.data.height < 200 )
        {
            event.data.height = 200;
        }

        // convert to number and set
        $(el_window).css('height', event.data.height);

        // send confirmation to requester window
        target_iframe.contentWindow.postMessage({
            original_msg_id: msg_id,
        }, '*');
    }
    //--------------------------------------------------------
    // setWindowSize
    //--------------------------------------------------------
    else if ( event.data.msg === 'setWindowSize' && (event.data.width !== undefined || event.data.height !== undefined) ) {
        let el_window;
        // specific window
        if ( event.data.window_id )
        {
            el_window = $(`.window[data-element_uuid="${html_encode(event.data.window_id)}"]`);
        }
        // app window
        else
        {
            el_window = window.window_for_app_instance(event.data.appInstanceID);
        }

        // window not found
        if ( !el_window || el_window.length === 0 )
        {
            return;
        }

        // convert to number and set
        if ( event.data.width !== undefined ) {
            event.data.width = parseFloat(event.data.width);
            // must be at least 200
            if ( event.data.width < 200 )
            {
                event.data.width = 200;
            }
            $(el_window).css('width', event.data.width);
        }

        if ( event.data.height !== undefined ) {
            event.data.height = parseFloat(event.data.height);
            // must be at least 200
            if ( event.data.height < 200 )
            {
                event.data.height = 200;
            }
            $(el_window).css('height', event.data.height);
        }

        // send confirmation to requester window
        target_iframe.contentWindow.postMessage({
            original_msg_id: msg_id,
        }, '*');
    }
    //--------------------------------------------------------
    // setWindowPosition
    //--------------------------------------------------------
    else if ( event.data.msg === 'setWindowPosition' && (event.data.x !== undefined || event.data.y !== undefined) ) {
        let el_window;
        // specific window
        if ( event.data.window_id )
        {
            el_window = $(`.window[data-element_uuid="${html_encode(event.data.window_id)}"]`);
        }
        // app window
        else
        {
            el_window = window.window_for_app_instance(event.data.appInstanceID);
        }

        // window not found
        if ( !el_window || el_window.length === 0 )
        {
            return;
        }

        // convert to number and set
        if ( event.data.x !== undefined ) {
            event.data.x = parseFloat(event.data.x);
            // we don't want the window to go off the left edge of the screen
            if ( event.data.x < 0 )
            {
                event.data.x = 0;
            }
            // we don't want the window to go off the right edge of the screen
            if ( event.data.x > window.innerWidth - 100 )
            {
                event.data.x = window.innerWidth - 100;
            }
            // set window left
            $(el_window).css('left', parseFloat(event.data.x));
        }

        if ( event.data.y !== undefined ) {
            event.data.y = parseFloat(event.data.y);
            // we don't want the window to go off the top edge of the screen
            if ( event.data.y < window.taskbar_height )
            {
                event.data.y = window.taskbar_height;
            }
            // we don't want the window to go off the bottom edge of the screen
            if ( event.data.y > window.innerHeight - 100 )
            {
                event.data.y = window.innerHeight - 100;
            }
            // set window top
            $(el_window).css('top', parseFloat(event.data.y));
        }

        // send confirmation to requester window
        target_iframe.contentWindow.postMessage({
            original_msg_id: msg_id,
        }, '*');
    }
    //--------------------------------------------------------
    // setWindowX
    //--------------------------------------------------------
    else if ( event.data.msg === 'setWindowX' && (event.data.x !== undefined) ) {
        let el_window;
        // specific window
        if ( event.data.window_id )
        {
            el_window = $(`.window[data-element_uuid="${html_encode(event.data.window_id)}"]`);
        }
        // app window
        else
        {
            el_window = window.window_for_app_instance(event.data.appInstanceID);
        }

        // window not found
        if ( !el_window || el_window.length === 0 )
        {
            return;
        }

        // convert to number and set
        if ( event.data.x !== undefined ) {
            event.data.x = parseFloat(event.data.x);
            // we don't want the window to go off the left edge of the screen
            if ( event.data.x < 0 )
            {
                event.data.x = 0;
            }
            // we don't want the window to go off the right edge of the screen
            if ( event.data.x > window.innerWidth - 100 )
            {
                event.data.x = window.innerWidth - 100;
            }
            // set window left
            $(el_window).css('left', parseFloat(event.data.x));
        }

        // send confirmation to requester window
        target_iframe.contentWindow.postMessage({
            original_msg_id: msg_id,
        }, '*');
    }
    //--------------------------------------------------------
    // setWindowY
    //--------------------------------------------------------
    else if ( event.data.msg === 'setWindowY' && (event.data.y !== undefined) ) {
        let el_window;
        // specific window
        if ( event.data.window_id )
        {
            el_window = $(`.window[data-element_uuid="${html_encode(event.data.window_id)}"]`);
        }
        // app window
        else
        {
            el_window = window.window_for_app_instance(event.data.appInstanceID);
        }

        // window not found
        if ( !el_window || el_window.length === 0 )
        {
            return;
        }

        // convert to number and set
        if ( event.data.y !== undefined ) {
            event.data.y = parseFloat(event.data.y);
            // we don't want the window to go off the top edge of the screen
            if ( event.data.y < window.taskbar_height )
            {
                event.data.y = window.taskbar_height;
            }
            // we don't want the window to go off the bottom edge of the screen
            if ( event.data.y > window.innerHeight - 100 )
            {
                event.data.y = window.innerHeight - 100;
            }
            // set window top
            $(el_window).css('top', parseFloat(event.data.y));
        }

        // send confirmation to requester window
        target_iframe.contentWindow.postMessage({
            original_msg_id: msg_id,
        }, '*');
    }
    //--------------------------------------------------------
    // watchItem
    //--------------------------------------------------------
    else if ( event.data.msg === 'watchItem' && event.data.item_uid !== undefined ) {
        if ( ! window.watchItems[event.data.item_uid] )
        {
            window.watchItems[event.data.item_uid] = [];
        }

        window.watchItems[event.data.item_uid].push(event.data.appInstanceID);
    }
    //--------------------------------------------------------
    // readAppDataFile
    //--------------------------------------------------------
    else if ( event.data.msg === 'readAppDataFile' && event.data.path !== undefined ) {
        // resolve path to absolute
        event.data.path = path.resolve(event.data.path);

        // join with appdata dir
        const file_path = path.join(window.appdata_path, app_uuid, event.data.path);

        puter.fs.sign(app_uuid, {
            path: file_path,
            action: 'write',
        }, function (signature) {
            signature = signature.items;
            signature.signatures = signature.signatures ?? [signature];
            if ( signature.signatures.length > 0 && signature.signatures[0].path ) {
                signature.signatures[0].path = privacy_aware_path(signature.signatures[0].path);
                // send confirmation to requester window
                target_iframe.contentWindow.postMessage({
                    msg: 'readAppDataFileSucceeded',
                    original_msg_id: msg_id,
                    item: signature.signatures[0],
                }, '*');
            } else {
                // send error to requester window
                target_iframe.contentWindow.postMessage({
                    msg: 'readAppDataFileFailed',
                    original_msg_id: msg_id,
                }, '*');
            }
        });
    }
    //--------------------------------------------------------
    // getAppData
    //--------------------------------------------------------
    // todo appdata should be provided from the /open_item api call
    else if ( event.data.msg === 'getAppData' ) {
        if ( window.appdata_signatures[app_uuid] ) {
            target_iframe.contentWindow.postMessage({
                msg: 'getAppDataSucceeded',
                original_msg_id: msg_id,
                item: window.appdata_signatures[app_uuid],
            }, '*');
        }
        // make app directory if it doesn't exist
        puter.fs.mkdir({
            path: path.join(window.appdata_path, app_uuid),
            rename: false,
            overwrite: false,
            success: function (dir) {
                puter.fs.sign(app_uuid, {
                    uid: dir.uid,
                    action: 'write',
                    success: function (signature) {
                        signature = signature.items;
                        window.appdata_signatures[app_uuid] = signature;
                        // send confirmation to requester window
                        target_iframe.contentWindow.postMessage({
                            msg: 'getAppDataSucceeded',
                            original_msg_id: msg_id,
                            item: signature,
                        }, '*');
                    },
                });
            },
            error: function (err) {
                if ( err.existing_fsentry || err.code === 'path_exists' ) {
                    puter.fs.sign(app_uuid, {
                        uid: err.existing_fsentry.uid,
                        action: 'write',
                        success: function (signature) {
                            signature = signature.items;
                            window.appdata_signatures[app_uuid] = signature;
                            // send confirmation to requester window
                            target_iframe.contentWindow.postMessage({
                                msg: 'getAppDataSucceeded',
                                original_msg_id: msg_id,
                                item: signature,
                            }, '*');
                        },
                    });
                }
            },
        });
    }
    //--------------------------------------------------------
    // requestPermission
    //--------------------------------------------------------
    else if ( event.data.msg === 'requestPermission' ) {
        // auth
        if ( !window.is_auth() && !(await UIWindowSignup({ referrer: app_name })) )
        {
            return;
        }

        // options must be an object
        if ( event.data.options === undefined || typeof event.data.options !== 'object' )
        {
            event.data.options = {};
        }

        // options.permission must be provided and be a string
        if ( !event.data.options.permission || typeof event.data.options.permission !== 'string' )
        {
            return;
        }

        let granted = await UIWindowRequestPermission({
            permission: event.data.options.permission,
            window_options: {
                parent_uuid: event.data.appInstanceID,
                disable_parent_window: true,
            },
            app_uid: app_uuid,
            app_name: app_name,
        });

        // send selected font to requester window
        target_iframe.contentWindow.postMessage({
            msg: 'permissionGranted',
            granted: granted,
            original_msg_id: msg_id,
        }, '*');
        $(target_iframe).get(0).focus({ preventScroll: true });
    }
    //--------------------------------------------------------
    // showFontPicker
    //--------------------------------------------------------
    else if ( event.data.msg === 'showFontPicker' ) {
        // auth
        if ( !window.is_auth() && !(await UIWindowSignup({ referrer: app_name })) )
        {
            return;
        }

        // set options
        event.data.options = event.data.options ?? {};

        // clear window_options for security reasons
        event.data.options.window_options = {};

        // Set app as parent window of font picker window
        event.data.options.window_options.parent_uuid = event.data.appInstanceID;

        // Open font picker
        let selected_font = await UIWindowFontPicker(event.data.options);

        // send selected font to requester window
        target_iframe.contentWindow.postMessage({
            msg: 'fontPicked',
            original_msg_id: msg_id,
            font: selected_font,
        }, '*');
        $(target_iframe).get(0).focus({ preventScroll: true });
    }
    //--------------------------------------------------------
    // showColorPicker
    //--------------------------------------------------------
    else if ( event.data.msg === 'showColorPicker' ) {
        // Auth
        if ( !window.is_auth() && !(await UIWindowSignup({ referrer: app_name })) )
        {
            return;
        }

        // set options
        event.data.options = event.data.options ?? {};

        // Clear window_options for security reasons
        event.data.options.window_options = {};

        // Set app as parent window of the font picker window
        event.data.options.window_options.parent_uuid = event.data.appInstanceID;

        // Open color picker
        let selected_color = await UIWindowColorPicker(event.data.options);

        // Send selected color to requester window
        target_iframe.contentWindow.postMessage({
            msg: 'colorPicked',
            original_msg_id: msg_id,
            color: selected_color ? selected_color.color : undefined,
        }, '*');
        $(target_iframe).get(0).focus({ preventScroll: true });
    }
    //--------------------------------------------------------
    // setWallpaper
    //--------------------------------------------------------
    else if ( event.data.msg === 'setWallpaper' ) {
        // Auth
        if ( !window.is_auth() && !(await UIWindowSignup({ referrer: app_name })) )
        {
            return;
        }

        // No options?
        if ( ! event.data.options )
        {
            event.data.options = {};
        }

        // /set-desktop-bg
        try {
            await $.ajax({
                url: `${window.api_origin }/set-desktop-bg`,
                type: 'POST',
                data: JSON.stringify({
                    url: event.data.readURL,
                    fit: event.data.options.fit ?? 'cover',
                    color: event.data.options.color,
                }),
                async: true,
                contentType: 'application/json',
                headers: {
                    'Authorization': `Bearer ${window.auth_token}`,
                },
                statusCode: {
                    401: function () {
                        window.logout();
                    },
                },
            });

            // Set wallpaper
            window.set_desktop_background({
                url: event.data.readURL,
                fit: event.data.options.fit ?? 'cover',
                color: event.data.options.color,
            });

            // Send success to app
            target_iframe.contentWindow.postMessage({
                msg: 'wallpaperSet',
                original_msg_id: msg_id,
            }, '*');
            $(target_iframe).get(0).focus({ preventScroll: true });
        } catch ( err ) {
            console.error(err);
        }
    }

    //--------------------------------------------------------
    // showSaveFilePicker
    //--------------------------------------------------------
    else if ( event.data.msg === 'showSaveFilePicker' ) {
        //auth
        if ( !window.is_auth() && !(await UIWindowSignup({ referrer: app_name })) )
        {
            return;
        }

        //disable parent window
        $el_parent_window.addClass('window-disabled');
        $el_parent_disable_mask.show();
        $el_parent_disable_mask.css('z-index', parseInt($el_parent_window.css('z-index')) + 1);
        $(target_iframe).blur();

        const tell_caller_and_update_views = async ({
            target_path,
            el_filedialog_window,
            res,
        }) => {
            // Validate response has required properties
            if (!res || typeof res !== 'object') {
                console.error('[IPC.js] Invalid response in tell_caller_and_update_views:', res);
                throw new Error('Invalid response from puter.fs.write()');
            }
            
            // Ensure res has all required properties (SDK might access these)
            if (!res.uid || typeof res.uid !== 'string') {
                console.error('[IPC.js] Response missing uid:', res);
                throw new Error('Response missing uid');
            }
            
            if (!res.name || typeof res.name !== 'string') {
                console.warn('[IPC.js] Response missing name, using basename of target_path');
                res.name = path.basename(target_path);
            }
            
            if (!res.type || typeof res.type !== 'string') {
                console.warn('[IPC.js] Response missing type, inferring from filename');
                const ext = res.name.split('.').pop()?.toLowerCase() || 'txt';
                const typeMap = {
                    'txt': 'text/plain',
                    'html': 'text/html',
                    'js': 'text/javascript',
                    'json': 'application/json',
                    'png': 'image/png',
                    'jpg': 'image/jpeg',
                    'jpeg': 'image/jpeg',
                };
                res.type = typeMap[ext] || 'text/plain';
            }
            
            if (!res.path || typeof res.path !== 'string') {
                console.warn('[IPC.js] Response missing path, using target_path');
                res.path = target_path;
            }
            
            console.log('[IPC.js] tell_caller_and_update_views - validated res:', {
                uid: res.uid,
                name: res.name,
                type: res.type,
                path: res.path,
                size: res.size
            });
            
            let file_signature = await puter.fs.sign(app_uuid, { uid: res.uid, action: 'write' });
            
            // Validate file_signature structure
            if (!file_signature || typeof file_signature !== 'object') {
                console.error('[IPC.js] Invalid file_signature from puter.fs.sign():', file_signature);
                throw new Error('Invalid file signature response');
            }
            
            // Ensure file_signature.items exists (might be nested)
            if (file_signature.items && typeof file_signature.items === 'object') {
            file_signature = file_signature.items;
            }
            
            // Validate file_signature has required properties
            if (!file_signature.fsentry_name || typeof file_signature.fsentry_name !== 'string') {
                console.warn('[IPC.js] file_signature missing fsentry_name, using res.name');
                file_signature.fsentry_name = res.name;
            }
            
            if (!file_signature.type || typeof file_signature.type !== 'string') {
                console.warn('[IPC.js] file_signature missing type, using res.type');
                file_signature.type = res.type;
            }

            target_iframe.contentWindow.postMessage({
                msg: 'fileSaved',
                original_msg_id: msg_id,
                filename: res.name,
                saved_file: {
                    name: file_signature.fsentry_name,
                    readURL: file_signature.read_url,
                    writeURL: file_signature.write_url,
                    metadataURL: file_signature.metadata_url,
                    type: file_signature.type,
                    uid: file_signature.uid,
                    path: privacy_aware_path(res.path),
                    // Include full path for reading operations (backend requires full path, not ~ format)
                    fullPath: res.path,
                },
            }, '*');

            $(target_iframe).get(0).focus({ preventScroll: true });
            // Update matching items on open windows
            // todo don't blanket-update, mostly files with thumbnails really need to be updated
            // first remove overwritten items
            $(`.item[data-uid="${res.uid}"]`).removeItems();
            // now add new items
            UIItem({
                appendTo: $(`.item-container[data-path="${html_encode(path.dirname(target_path))}" i]`),
                immutable: res.immutable || res.writable === false,
                associated_app_name: res.associated_app?.name,
                path: target_path,
                icon: await item_icon(res),
                name: path.basename(target_path),
                uid: res.uid,
                size: res.size,
                modified: res.modified,
                type: res.type,
                is_dir: false,
                is_shared: res.is_shared,
                suggested_apps: res.suggested_apps,
            });
            // sort each window
            $(`.item-container[data-path="${html_encode(path.dirname(target_path))}" i]`).each(function () {
                window.sort_items(this, $(this).attr('data-sort_by'), $(this).attr('data-sort_order'));
            });
            $(el_filedialog_window).close();
            window.show_save_account_notice_if_needed();
        };

        const tell_caller_its_cancelled = async () => {
            target_iframe.contentWindow.postMessage({
                msg: 'fileSaveCancelled',
                original_msg_id: msg_id,
            }, '*');
        };

        const write_file_tell_caller_and_update_views = async ({
            target_path, el_filedialog_window,
            file_to_upload, overwrite,
        }) => {
            // Ensure target_path is a valid string and properly formatted
            if (!target_path || typeof target_path !== 'string') {
                throw new Error('Invalid target_path: must be a non-empty string');
            }
            
            // Ensure file_to_upload is a valid File or Blob object
            if (!file_to_upload || (!(file_to_upload instanceof File) && !(file_to_upload instanceof Blob))) {
                throw new Error('Invalid file_to_upload: must be a File or Blob object');
            }
            
            // Ensure the File object has a valid name property
            if (file_to_upload instanceof File && (!file_to_upload.name || typeof file_to_upload.name !== 'string')) {
                throw new Error('Invalid File object: name property must be a non-empty string');
            }
            
            // Normalize the target_path to ensure it's properly formatted
            const normalized_path = path.normalize(target_path);
            
            // Final validation before passing to SDK
            // The SDK might call toLowerCase() on file extension or MIME type subtype
            // Ensure everything is safe for the SDK to process
            
            // Double-check filename has valid extension
            const filenameForSDK = file_to_upload.name;
            const extMatch = filenameForSDK.match(/\.([a-z0-9]+)$/i);
            if (!extMatch || !extMatch[1]) {
                console.error('[IPC.js] Filename missing valid extension for SDK:', filenameForSDK);
                throw new Error('Filename must have a valid extension');
            }
            
            // Double-check type has valid format for SDK
            const typeForSDK = file_to_upload.type;
            const typeMatch = typeForSDK && typeof typeForSDK === 'string' ? typeForSDK.match(/^([^/]+)\/([^/;]+)/) : null;
            if (!typeMatch || !typeMatch[1] || !typeMatch[2]) {
                console.error('[IPC.js] File type invalid format for SDK:', typeForSDK);
                // Extract content from existing File and recreate with valid type
                const validType = 'text/plain';
                // Read the File content as text (for text files) or keep as blob
                const fileContent = file_to_upload instanceof File ? await file_to_upload.text() : file_to_upload;
                file_to_upload = new File([fileContent], file_to_upload.name, { type: validType });
                console.warn('[IPC.js] Recreated File object with valid type:', validType);
            }
            
            const writeInfo = {
                path: normalized_path,
                fileName: file_to_upload.name,
                fileType: file_to_upload.type,
                fileSize: file_to_upload.size,
                extension: extMatch[1],
                typeSubtype: typeMatch ? typeMatch[2] : 'unknown',
                fileNameParts: filenameForSDK.split('.'),
                typeParts: typeForSDK.split('/')
            };
            console.log('[IPC.js] Calling puter.fs.write with validated File:', JSON.stringify(writeInfo, null, 2));
            console.log('[IPC.js] File object being passed:', {
                name: file_to_upload.name,
                type: file_to_upload.type,
                size: file_to_upload.size,
                constructor: file_to_upload.constructor.name
            });
            
            try {
                const res = await puter.fs.write(normalized_path,
                            file_to_upload,
                            {
                                dedupeName: false,
                                overwrite: overwrite,
                            });

                // Log the response to see what puter.fs.write() returns
                console.log('[IPC.js] puter.fs.write() raw response:', JSON.stringify({
                    hasResult: !!res.result,
                    hasSuccess: 'success' in res,
                    hasPath: !!res.path,
                    allKeys: Object.keys(res || {}),
                    resultKeys: res.result ? Object.keys(res.result) : null
                }, null, 2));
                console.log('[IPC.js] Full response object:', res);
                
                // Ensure response has required properties before processing
                if (!res || typeof res !== 'object') {
                    throw new Error('puter.fs.write() returned invalid response');
                }
                
                // Extract actual item data - SDK might return { success, path, result: { uid, name, type, ... } }
                let itemData = res;
                if (res.result && typeof res.result === 'object') {
                    console.log('[IPC.js] Response has nested result, extracting item data from res.result');
                    itemData = res.result;
                    // Preserve path from outer response if not in result
                    if (!itemData.path && res.path) {
                        itemData.path = res.path;
                    }
                }
                
                // Log extracted item data
                console.log('[IPC.js] Extracted item data:', JSON.stringify({
                    hasUid: !!itemData.uid,
                    hasName: !!itemData.name,
                    hasType: !!itemData.type,
                    hasMimeType: !!itemData.mime_type,
                    hasPath: !!itemData.path,
                    hasSize: !!itemData.size,
                    uid: itemData.uid,
                    name: itemData.name,
                    type: itemData.type,
                    mime_type: itemData.mime_type,
                    path: itemData.path,
                    size: itemData.size,
                    allKeys: Object.keys(itemData || {})
                }, null, 2));
                
                // Handle mime_type -> type mapping (backend uses mime_type, SDK expects type)
                if (itemData.mime_type && !itemData.type) {
                    console.log('[IPC.js] Converting mime_type to type:', itemData.mime_type);
                    itemData.type = itemData.mime_type;
                }
                
                // Ensure itemData.type exists and is a string (SDK might call toLowerCase on it)
                if (itemData.type === undefined || itemData.type === null) {
                    console.warn('[IPC.js] Item data missing type, setting to text/plain');
                    itemData.type = 'text/plain';
                } else if (typeof itemData.type !== 'string') {
                    console.warn('[IPC.js] Item data type is not a string, converting:', itemData.type);
                    itemData.type = String(itemData.type);
                }
                
                // Ensure itemData.name exists (SDK might extract extension from it)
                if (!itemData.name || typeof itemData.name !== 'string') {
                    console.warn('[IPC.js] Item data missing name, using filename from File object');
                    itemData.name = file_to_upload.name;
                }
                
                // Ensure itemData.path exists
                if (!itemData.path || typeof itemData.path !== 'string') {
                    console.warn('[IPC.js] Item data missing path, using normalized_path');
                    itemData.path = normalized_path;
                }
                
                // Get uid from stat if missing (backend might not return it in write response)
                if (!itemData.uid || typeof itemData.uid !== 'string') {
                    console.warn('[IPC.js] Item data missing uid, fetching from stat()');
                    try {
                        const statResult = await puter.fs.stat({ path: itemData.path, consistency: 'eventual' });
                        console.log('[IPC.js] stat() result:', JSON.stringify({
                            hasUid: !!statResult.uid,
                            uid: statResult.uid,
                            allKeys: Object.keys(statResult || {})
                        }, null, 2));
                        
                        // Extract uid from stat result (might also be nested)
                        let statUid = statResult.uid;
                        if (!statUid && statResult.result && statResult.result.uid) {
                            statUid = statResult.result.uid;
                        }
                        
                        if (statUid && typeof statUid === 'string') {
                            itemData.uid = statUid;
                            console.log('[IPC.js] ✅ Retrieved uid from stat():', itemData.uid);
                        } else {
                            throw new Error('stat() did not return uid');
                        }
                    } catch (statErr) {
                        console.error('[IPC.js] Failed to get uid from stat():', statErr);
                        // Generate a temporary uid based on path (fallback)
                        const pathParts = itemData.path.split('/');
                        const filename = pathParts[pathParts.length - 1];
                        itemData.uid = `uuid--${itemData.path.replace(/\//g, '-').replace(/^\-/, '')}`;
                        console.warn('[IPC.js] Generated fallback uid:', itemData.uid);
                    }
                }
                
                // Create a new response object with all required properties
                // Don't reassign res (might be const), create a new object instead
                const processedRes = {
                    uid: itemData.uid,
                    name: itemData.name,
                    type: itemData.type,
                    path: itemData.path,
                    size: itemData.size,
                    modified: itemData.modified || Date.now(),
                    created: itemData.created || Date.now(),
                    // Copy any other properties from itemData
                    ...itemData
                };
                
                // Use processedRes for downstream processing instead of res
                // Update res properties instead of reassigning (if res is const)
                Object.assign(res, processedRes);

                await tell_caller_and_update_views({ res, el_filedialog_window, target_path: normalized_path });
            } catch (err) {
                console.error('[IPC.js] Error in write_file_tell_caller_and_update_views:', err);
                // If error is about toLowerCase, provide more context
                if (err.message && err.message.includes('toLowerCase')) {
                    const errorInfo = {
                        name: file_to_upload.name,
                        type: file_to_upload.type,
                        nameType: typeof file_to_upload.name,
                        typeType: typeof file_to_upload.type,
                        nameParts: file_to_upload.name ? file_to_upload.name.split('.') : null,
                        typeParts: file_to_upload.type ? file_to_upload.type.split('/') : null,
                        extension: file_to_upload.name ? file_to_upload.name.split('.').pop() : null,
                        typeSubtype: file_to_upload.type ? file_to_upload.type.split('/')[1] : null,
                        errorMessage: err.message,
                        errorStack: err.stack
                    };
                    console.error('[IPC.js] toLowerCase error - File object state:', JSON.stringify(errorInfo, null, 2));
                    console.error('[IPC.js] Full error object:', err);
                }
                throw err;
            }
        };

        const handle_url_save = async ({ target_path }) => {
            // download progress tracker
            let dl_op_id = window.operation_id++;

            // upload progress tracker defaults
            window.progress_tracker[dl_op_id] = [];
            window.progress_tracker[dl_op_id][0] = {};
            window.progress_tracker[dl_op_id][0].total = 0;
            window.progress_tracker[dl_op_id][0].ajax_uploaded = 0;
            window.progress_tracker[dl_op_id][0].cloud_uploaded = 0;

            let item_with_same_name_already_exists = true;
            while ( item_with_same_name_already_exists ) {
                await download({
                    url: event.data.url,
                    name: path.basename(target_path),
                    dest_path: path.dirname(target_path),
                    auth_token: window.auth_token,
                    api_origin: window.api_origin,
                    dedupe_name: false,
                    overwrite: false,
                    operation_id: dl_op_id,
                    item_upload_id: 0,
                    success: function (res) {
                    },
                    error: function (err) {
                        UIAlert(err && err.message ? err.message : 'Download failed.');
                    },
                });
                item_with_same_name_already_exists = false;
            }
        };

        const handle_data_save = async ({ target_path, el_filedialog_window }) => {
            // Ensure content is defined and is a valid type (string, Blob, ArrayBuffer, etc.)
            // Note: Empty string is valid for text files, but undefined/null is not
            if (event.data.content === undefined || event.data.content === null) {
                console.error('[IPC.js] File content is undefined or null');
                console.error('[IPC.js] event.data keys:', Object.keys(event.data || {}));
                console.error('[IPC.js] Full event.data:', event.data);
                await UIAlert({
                    message: 'Cannot save file: content is missing. The editor may not be passing content correctly.',
                    parent_uuid: $(el_filedialog_window).attr('data-element_uuid'),
                });
                $(el_filedialog_window).find('.window-disable-mask, .busy-indicator').hide();
                return;
            }
            
            // Log content info for debugging
            const contentInfo = {
                type: typeof event.data.content,
                isString: typeof event.data.content === 'string',
                isBlob: event.data.content instanceof Blob,
                length: typeof event.data.content === 'string' ? event.data.content.length : 
                        event.data.content instanceof Blob ? event.data.content.size : 'N/A',
                preview: typeof event.data.content === 'string' ? event.data.content.substring(0, 50) : 'N/A',
                value: typeof event.data.content === 'string' ? event.data.content : 
                       event.data.content instanceof Blob ? '[Blob]' : String(event.data.content)
            };
            console.log('[IPC.js] Content received:', JSON.stringify(contentInfo, null, 2));
            console.log('[IPC.js] Content raw:', event.data.content);
            
            // Ensure target_path is a valid string
            if (!target_path || typeof target_path !== 'string') {
                console.error('[IPC.js] Invalid target_path:', target_path);
                await UIAlert({
                    message: 'Cannot save file: invalid file path.',
                    parent_uuid: $(el_filedialog_window).attr('data-element_uuid'),
                });
                $(el_filedialog_window).find('.window-disable-mask, .busy-indicator').hide();
                return;
            }
            
            // Get filename safely - ensure path.basename returns a valid string
            let filename;
            try {
                filename = path.basename(target_path);
                if (!filename || typeof filename !== 'string') {
                    throw new Error('Invalid filename');
                }
            } catch (err) {
                console.error('[IPC.js] Error getting filename from target_path:', target_path, err);
                await UIAlert({
                    message: 'Cannot save file: invalid filename.',
                    parent_uuid: $(el_filedialog_window).attr('data-element_uuid'),
                });
                $(el_filedialog_window).find('.window-disable-mask, .busy-indicator').hide();
                return;
            }
            
            // Ensure filename has a valid extension for proper type detection
            // Extract extension safely to prevent toLowerCase() errors
            let final_filename = filename;
            let file_extension = '';
            
            // Safely extract extension from filename
            const last_dot_index = final_filename.lastIndexOf('.');
            if (last_dot_index > 0 && last_dot_index < final_filename.length - 1) {
                // Valid extension exists
                file_extension = final_filename.substring(last_dot_index + 1).toLowerCase();
                // Ensure extension is valid (alphanumeric only, no special chars)
                if (!/^[a-z0-9]+$/.test(file_extension)) {
                    // Invalid extension, replace with .txt
                    final_filename = final_filename.substring(0, last_dot_index) + '.txt';
                    file_extension = 'txt';
                }
            } else {
                // No extension or invalid format, add .txt
                if (event.data.contentType) {
                    const contentType = event.data.contentType.split('/')[1]?.split(';')[0]?.toLowerCase();
                    if (contentType && /^[a-z0-9]+$/.test(contentType)) {
                        file_extension = contentType;
                        final_filename = filename + '.' + file_extension;
                    } else {
                        final_filename = filename + '.txt';
                        file_extension = 'txt';
                    }
                } else {
                    final_filename = filename + '.txt';
                    file_extension = 'txt';
                }
            }
            
            // Ensure final_filename is valid and has a proper extension
            if (!final_filename || !file_extension) {
                final_filename = filename + '.txt';
                file_extension = 'txt';
            }
            
            // Create File object with explicit type - ALWAYS set a valid type
            const fileOptions = {};
            
            // Determine MIME type based on extension or provided contentType
            let mimeType = 'text/plain'; // Default for text files
            if (event.data.contentType && typeof event.data.contentType === 'string') {
                // Validate contentType format (should be "type/subtype")
                const contentTypeParts = event.data.contentType.split('/');
                if (contentTypeParts.length === 2 && contentTypeParts[0] && contentTypeParts[1]) {
                    mimeType = event.data.contentType;
                }
            } else {
                // Infer from extension
                const ext = file_extension.toLowerCase();
                const mimeTypes = {
                    'txt': 'text/plain',
                    'html': 'text/html',
                    'css': 'text/css',
                    'js': 'text/javascript',
                    'json': 'application/json',
                    'xml': 'application/xml',
                    'pdf': 'application/pdf',
                    'png': 'image/png',
                    'jpg': 'image/jpeg',
                    'jpeg': 'image/jpeg',
                    'gif': 'image/gif',
                    'svg': 'image/svg+xml',
                };
                mimeType = mimeTypes[ext] || 'text/plain';
            }
            
            // Ensure mimeType is valid (has both type and subtype)
            if (!mimeType.includes('/') || mimeType.split('/').length !== 2) {
                mimeType = 'text/plain';
            }
            
            fileOptions.type = mimeType;
            
            // Ensure content is not empty string (convert to proper format)
            let fileContent = event.data.content;
            if (fileContent === '') {
                fileContent = ''; // Empty string is valid for text files
            } else if (typeof fileContent !== 'string' && !(fileContent instanceof Blob) && !(fileContent instanceof ArrayBuffer)) {
                // Convert to string if it's not already a valid type
                fileContent = String(fileContent);
            }
            
            let file_to_upload = new File([fileContent], final_filename, fileOptions);
            
            // Validate File object properties
            if (!file_to_upload.name || typeof file_to_upload.name !== 'string') {
                console.error('[IPC.js] File object created with invalid name:', file_to_upload.name);
                await UIAlert({
                    message: 'Cannot save file: file object creation failed.',
                    parent_uuid: $(el_filedialog_window).attr('data-element_uuid'),
                });
                $(el_filedialog_window).find('.window-disable-mask, .busy-indicator').hide();
                return;
            }
            
            // Ensure File object has a valid type property (backend might need this)
            if (!file_to_upload.type || typeof file_to_upload.type !== 'string') {
                console.warn('[IPC.js] File object missing type, setting to text/plain');
                // Recreate with explicit type
                file_to_upload = new File([fileContent], final_filename, { type: 'text/plain' });
            }
            
            // Validate File object completely before passing to backend
            const fileValidation = {
                name: file_to_upload.name,
                type: file_to_upload.type,
                size: file_to_upload.size,
                hasExtension: file_to_upload.name.includes('.'),
                nameType: typeof file_to_upload.name,
                typeType: typeof file_to_upload.type,
            };
            
            // Ensure name has extension that can be safely extracted
            const nameParts = file_to_upload.name.split('.');
            if (nameParts.length < 2 || !nameParts[nameParts.length - 1]) {
                console.error('[IPC.js] File name does not have valid extension:', file_to_upload.name);
                throw new Error('File name must have a valid extension');
            }
            
            // Ensure type has both parts (type/subtype)
            const typeParts = file_to_upload.type.split('/');
            if (typeParts.length !== 2 || !typeParts[0] || !typeParts[1]) {
                console.error('[IPC.js] File type is invalid:', file_to_upload.type);
                // Fix it
                file_to_upload = new File([fileContent], final_filename, { type: 'text/plain' });
            }
            
            console.log('[IPC.js] File object validated:', JSON.stringify(fileValidation, null, 2));
            console.log('[IPC.js] File object details:', {
                name: file_to_upload.name,
                type: file_to_upload.type,
                size: file_to_upload.size,
                nameType: typeof file_to_upload.name,
                typeType: typeof file_to_upload.type
            });
            
            const written = await window.handle_same_name_exists({
                action: async ({ overwrite }) => {
                    await write_file_tell_caller_and_update_views({
                        target_path,
                        el_filedialog_window,
                        file_to_upload,
                        overwrite,
                    });
                },
                parent_uuid: $(el_filedialog_window).attr('data-element_uuid'),
            });

            if ( written ) return true;
            $(el_filedialog_window).find('.window-disable-mask, .busy-indicator').hide();
        };

        const handle_move_save = async ({
            // when 'source_path' has a value, 'save_type' is checked to determine
            // if a fs.move() or fs.copy() needs to be performed.
            save_type,

            source_path, target_path, el_filedialog_window,
        }) => {
            // source path must be in appdata directory
            const stat_info = await puter.fs.stat({ path: source_path, consistency: 'eventual' });
            if ( !stat_info.appdata_app || stat_info.appdata_app !== app_uuid ) {
                const source_file_owner = stat_info?.appdata_app ?? 'the user';
                if ( stat_info.appdata_app && stat_info.appdata_app !== app_uuid ) {
                    await UIAlert({
                        message: 'apps are prohibited from accessing AppData of other apps',
                    });
                    return;
                }
                if ( save_type === 'move' ) {
                    await UIAlert({
                        message: `the app <b>${app_name}</b> tried to illegally move a file owned by ${source_file_owner}`,
                    });
                    return;
                }
                const FORCE_ALLOWED_APPS = [
                    'app-dc2505ed-9844-4298-92fa-b72873b8381e', // OnlyOffice Word Processor
                    'app-064a54ac-d07d-481e-b38c-ceb99345013d', // OnlyOffice Spreadsheet application
                    'app-60b1382b-3367-4968-9259-23930c6fd376', // OnlyOffice Presentation Editor
                    'app-075ddc0b-2d4e-460e-9664-a8d21b960c4a', // OnlyOffice PDF editor
                ];

                let alert_resp;
                if ( FORCE_ALLOWED_APPS.includes(app_uuid) ) {
                    alert_resp = true;
                } else {
                    alert_resp = await UIAlert({
                        message: `the app ${app_name} is trying to copy ${source_path}; is this okay?`,
                        buttons: [
                            {
                                label: i18n('yes'),
                                value: true,
                                type: 'primary',
                            },
                            {
                                label: i18n('no'),
                                value: false,
                                type: 'secondary',
                            },
                        ],
                    });
                }

                // `alert_resp` will be `"false"`, but this check is forward-compatible
                // with a version of UIAlert that returns `false`.
                if ( !alert_resp || alert_resp === 'false' ) return;
            }

            let node;
            const written = await window.handle_same_name_exists({
                action: async ({ overwrite }) => {
                    if ( overwrite ) {
                        await puter.fs.delete(target_path);
                    }

                    if ( save_type === 'copy' ) {
                        const target_dir = path.dirname(target_path);
                        const new_name = path.basename(target_path);
                        await puter.fs.copy(source_path, target_dir, {
                            newName: new_name,
                        });
                    } else {
                        await puter.fs.move(source_path, target_path);
                    }
                    node = await puter.fs.stat(target_path);
                },
                parent_uuid: $(el_filedialog_window).attr('data-element_uuid'),
            });

            if ( node ) {
                await tell_caller_and_update_views({ res: node, el_filedialog_window, target_path });
                if ( written ) return true;
            } else {
                await tell_caller_its_cancelled();
                return true;
            }

            $(el_filedialog_window).find('.window-disable-mask, .busy-indicator').hide();
        };

        await UIWindow({
            path: `/${ window.user.username }/Desktop`,
            // this is the uuid of the window to which this dialog will return
            parent_uuid: event.data.appInstanceID,
            show_maximize_button: false,
            show_minimize_button: false,
            title: i18n('Save As…'),
            is_dir: true,
            is_saveFileDialog: true,
            saveFileDialog_default_filename: (() => {
                let filename = event.data.suggestedName ?? '';
                // For editor app, ensure .txt extension if none provided
                if (app_name === 'editor' && filename && !filename.includes('.')) {
                    filename = filename + '.txt';
                }
                return filename;
            })(),
            selectable_body: false,
            iframe_msg_uid: msg_id,
            center: true,
            initiating_app_uuid: app_uuid,
            onDialogCancel: () => tell_caller_its_cancelled(),
            onSaveFileDialogSave: async function (target_path, el_filedialog_window) {
                $(el_filedialog_window).find('.window-disable-mask, .busy-indicator').show();
                let busy_init_ts = Date.now();

                // Ensure .txt extension is added if no extension provided (for editor app)
                if (app_name === 'editor' && !target_path.includes('.')) {
                    target_path = target_path + '.txt';
                    console.log('[IPC.js]: ✅ Added .txt extension to target_path:', target_path);
                }

                if ( event.data.url ) {
                    await handle_url_save({ target_path });
                } else if ( event.data.source_path ) {
                    await handle_move_save({
                        save_type: event.data.save_type,
                        source_path: event.data.source_path,
                        target_path,
                    });
                } else {
                    await handle_data_save({ target_path, el_filedialog_window });
                }

                let busy_duration = (Date.now() - busy_init_ts);
                if ( busy_duration >= window.busy_indicator_hide_delay ) {
                    $(el_filedialog_window).close();
                } else {
                    setTimeout(() => {
                        // close this dialog
                        $(el_filedialog_window).close();
                    }, Math.abs(window.busy_indicator_hide_delay - busy_duration));
                }
            },
        });
    }
    //--------------------------------------------------------
    // saveToPictures/Desktop/Documents/Videos/Audio/AppData
    //--------------------------------------------------------
    else if (( event.data.msg === 'saveToPictures' || event.data.msg === 'saveToDesktop' || event.data.msg === 'saveToAppData' ||
        event.data.msg === 'saveToDocuments' || event.data.msg === 'saveToVideos' || event.data.msg === 'saveToAudio' )) {
        let target_path;
        let create_missing_ancestors = false;

        console.warn(`The method ${event.data.msg} is deprecated - see docs.puter.com for more information.`);
        event.data.filename = path.normalize(event.data.filename)
            .replace(/(\.+\/|\.+\\)/g, '');

        if ( event.data.msg === 'saveToPictures' )
        {
            target_path = path.join(window.pictures_path, event.data.filename);
        }
        else if ( event.data.msg === 'saveToDesktop' )
        {
            target_path = path.join(window.desktop_path, event.data.filename);
        }
        else if ( event.data.msg === 'saveToDocuments' )
        {
            target_path = path.join(window.documents_path, event.data.filename);
        }
        else if ( event.data.msg === 'saveToVideos' )
        {
            target_path = path.join(window.videos_path, event.data.filename);
        }
        else if ( event.data.msg === 'saveToAudio' )
        {
            target_path = path.join(window.audio_path, event.data.filename);
        }
        else if ( event.data.msg === 'saveToAppData' ) {
            target_path = path.join(window.appdata_path, app_uuid, event.data.filename);
            create_missing_ancestors = true;
        }
        //auth
        if ( !window.is_auth() && !(await UIWindowSignup({ referrer: app_name })) )
        {
            return;
        }

        let item_with_same_name_already_exists = true;
        let overwrite = false;

        // -------------------------------------
        // URL
        // -------------------------------------
        if ( event.data.url ) {
            let overwrite = false;
            // download progress tracker
            let dl_op_id = window.operation_id++;

            // upload progress tracker defaults
            window.progress_tracker[dl_op_id] = [];
            window.progress_tracker[dl_op_id][0] = {};
            window.progress_tracker[dl_op_id][0].total = 0;
            window.progress_tracker[dl_op_id][0].ajax_uploaded = 0;
            window.progress_tracker[dl_op_id][0].cloud_uploaded = 0;

            let item_with_same_name_already_exists = true;
            while ( item_with_same_name_already_exists ) {
                const res = await download({
                    url: event.data.url,
                    name: path.basename(target_path),
                    dest_path: path.dirname(target_path),
                    auth_token: window.auth_token,
                    api_origin: window.api_origin,
                    dedupe_name: true,
                    overwrite: false,
                    operation_id: dl_op_id,
                    item_upload_id: 0,
                    success: function (res) {
                    },
                    error: function (err) {
                        UIAlert(err && err.message ? err.message : 'Download failed.');
                    },
                });
                item_with_same_name_already_exists = false;
            }
        }
        // -------------------------------------
        // File
        // -------------------------------------
        else {
            let file_to_upload = new File([event.data.content], path.basename(target_path));

            while ( item_with_same_name_already_exists ) {
                if ( overwrite )
                {
                    item_with_same_name_already_exists = false;
                }
                try {
                    const res = await puter.fs.write(target_path, file_to_upload, {
                        dedupeName: true,
                        overwrite: false,
                        createMissingAncestors: create_missing_ancestors,
                    });
                    item_with_same_name_already_exists = false;
                    let file_signature = await puter.fs.sign(app_uuid, { uid: res.uid, action: 'write' });
                    file_signature = file_signature.items;

                    target_iframe.contentWindow.postMessage({
                        msg: 'fileSaved',
                        original_msg_id: msg_id,
                        filename: res.name,
                        saved_file: {
                            name: file_signature.fsentry_name,
                            readURL: file_signature.read_url,
                            writeURL: file_signature.write_url,
                            metadataURL: file_signature.metadata_url,
                            uid: file_signature.uid,
                            path: privacy_aware_path(res.path),
                        },
                    }, '*');
                    $(target_iframe).get(0).focus({ preventScroll: true });
                }
                catch ( err ) {
                    if ( err.code === 'item_with_same_name_exists' ) {
                        const alert_resp = await UIAlert({
                            message: `<strong>${html_encode(err.entry_name)}</strong> already exists.`,
                            buttons: [
                                {
                                    label: i18n('replace'),
                                    value: 'replace',
                                    type: 'primary',
                                },
                                {
                                    label: i18n('cancel'),
                                    value: 'cancel',
                                },
                            ],
                            parent_uuid: event.data.appInstanceID,
                        });
                        if ( alert_resp === 'replace' ) {
                            overwrite = true;
                        } else if ( alert_resp === 'cancel' ) {
                            item_with_same_name_already_exists = false;
                        }
                    } else {
                        break;
                    }
                }
            }
        }
    }
    //--------------------------------------------------------
    // messageToApp
    //--------------------------------------------------------
    else if ( event.data.msg === 'messageToApp' ) {
        const { appInstanceID, targetAppInstanceID, targetAppOrigin, contents } = event.data;
        // TODO: Determine if we should allow the message
        // TODO: Track message traffic between apps
        const svc_ipc = globalThis.services.get('ipc');
        // const svc_exec = globalThis.services()

        const conn = svc_ipc.get_connection(targetAppInstanceID);
        if ( conn ) {
            conn.send(contents);
            return;
        }

        // pass on the message
        const target_iframe = window.iframe_for_app_instance(targetAppInstanceID);
        if ( ! target_iframe ) {
            console.error('Failed to send message to non-existent app', event);
            return;
        }
        target_iframe.contentWindow.postMessage({
            msg: 'messageToApp',
            appInstanceID,
            targetAppInstanceID,
            contents,
        }, targetAppOrigin);
    }
    //--------------------------------------------------------
    // closeApp
    //--------------------------------------------------------
    else if ( event.data.msg === 'closeApp' ) {
        const { appInstanceID, targetAppInstanceID } = event.data;

        const target_window = window.window_for_app_instance(targetAppInstanceID);
        if ( ! target_window ) {
            console.warn(`Failed to close non-existent app ${targetAppInstanceID}`);
            return;
        }

        // Check permissions
        const allowed = await (async () => {
            // Parents can close their children
            if ( target_window.dataset['parent_instance_id'] === appInstanceID ) {
                console.log(`⚠️ Allowing app ${appInstanceID} to close child app ${targetAppInstanceID}`);
                return true;
            }

            // God-mode apps can close anything
            const app_info = await window.get_apps(app_name);
            if ( app_info.godmode === 1 ) {
                console.log(`⚠️ Allowing GODMODE app ${appInstanceID} to close app ${targetAppInstanceID}`);
                return true;
            }

            // TODO: What other situations should we allow?
            return false;
        })();

        if ( allowed ) {
            $(target_window).close();
        } else {
            console.warn(`⚠️ App ${appInstanceID} is not permitted to close app ${targetAppInstanceID}`);
        }
    }

    //--------------------------------------------------------
    // exit
    //--------------------------------------------------------
    else if ( event.data.msg === 'exit' ) {
        // Ensure status code is a number. Convert any truthy non-numbers to 1.
        let status_code = event.data.statusCode ?? 0;
        if ( status_code && (typeof status_code !== 'number') ) {
            status_code = 1;
        }

        $(window.window_for_app_instance(event.data.appInstanceID)).close({
            bypass_iframe_messaging: true,
            status_code,
        });
    }
};

if ( ! window.when_puter_happens ) window.when_puter_happens = [];
window.when_puter_happens.push(async () => {
    // Expose ipc_listener globally for debugging/direct access
    window.ipc_listener_direct = ipc_listener;
    
    await puter.services.wait_for_init(['xd-incoming']);
    const svc_xdIncoming = puter.services.get('xd-incoming');
    svc_xdIncoming.register_filter_listener(ipc_listener);
});
