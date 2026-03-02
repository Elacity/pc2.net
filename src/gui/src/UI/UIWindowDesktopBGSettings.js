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

async function UIWindowDesktopBGSettings (options) {
    options = options ?? {};

    return new Promise(async (resolve) => {
        let h = '';
        const original_background_css = $('body').attr('style');
        let bg_url = window.desktop_bg_url,
            bg_color = window.desktop_bg_color,
            bg_fit = window.desktop_bg_fit;
        let bg_display_url = bg_url;

        h += '<div>';

        // Wallpaper presets
        h += '<div class="desktop-bg-presets" style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">';
        const presetWallpapers = [
            { src: '/images/wallpaper-elacity.png', label: 'Elacity' },
            { src: '/images/wallpaper-elastos.jpg', label: 'ElastOS' },
            { src: '/images/wallpaper-elastos-branded.png', label: 'ElastOS Branded' },
        ];
        for (const wp of presetWallpapers) {
            h += `<div class="desktop-bg-preset" data-url="${wp.src}" title="${wp.label}" style="width: 96px; height: 60px; border-radius: 6px; overflow: hidden; cursor: pointer; border: 2px solid transparent; background: url('${wp.src}') center/cover no-repeat; flex-shrink: 0;"></div>`;
        }
        h += '</div>';

        // Browse for custom image
        h += `<button class="button button-default button-small browse" style="margin-bottom: 16px;">${i18n('browse')}...</button>`;

        // Fit
        h += `<label>${i18n('fit')}:</label>`;
        h += '<select class="desktop-bg-fit" style="width: 150px;">';
        h += `<option value="cover">${i18n('cover')}</option>`;
        h += `<option value="center">${i18n('center')}</option>`;
        h += `<option value="contain">${i18n('contain')}</option>`;
        h += `<option value="repeat">${i18n('repeat')}</option>`;
        h += '</select>';

        // Background color
        h += `<label style="margin-top: 16px;">${i18n('background')} ${i18n('color')}:</label>`;
        h += '<div class="desktop-bg-color-blocks" style="margin-bottom: 4px; overflow: hidden;">';
        h += '<div class="desktop-bg-color-block" data-color="#4F7BB5" style="background-color: #4F7BB5"></div>';
        h += '<div class="desktop-bg-color-block" data-color="#545554" style="background-color: #545554"></div>';
        h += '<div class="desktop-bg-color-block" data-color="#F5D3CE" style="background-color: #F5D3CE"></div>';
        h += '<div class="desktop-bg-color-block" data-color="#52A758" style="background-color: #52A758"></div>';
        h += '<div class="desktop-bg-color-block" data-color="#ad3983" style="background-color: #ad3983"></div>';
        h += '<div class="desktop-bg-color-block" data-color="#ffffff" style="background-color: #ffffff"></div>';
        h += '<div class="desktop-bg-color-block" data-color="#000000" style="background-color: #000000"></div>';
        h += '<div class="desktop-bg-color-block" data-color="#454545" style="background-color: #454545"></div>';
        h += `<div class="desktop-bg-color-block desktop-bg-color-block-palette" data-color="" style="background-image: url(${window.icons['palette.svg']});
                    background-repeat: no-repeat;
                    background-size: contain;
                    background-position: center;"><input type="color" style="width:25px; height: 25px; opacity:0;"></div>`;
        h += '</div>';

        h += '<div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; padding-top: 12px;">';
        h += `<button class="button button-default cancel">${i18n('cancel')}</button>`;
        h += `<button class="button button-primary apply">${i18n('apply')}</button>`;
        h += '</div>';

        h += '</div>';

        const el_window = await UIWindow({
            title: i18n('change_desktop_background'),
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
            onAppend: function (this_window) {
                $(this_window).find('.access-recipient').focus();
            },
            window_class: 'window-alert',
            center: true,
            show_in_taskbar: false,
            width: 380,
            height: 410,
            window_css: {
                height: 'initial',
            },
            body_css: {
                width: 'initial',
                padding: '20px',
                'background-color': `hsla(
                    var(--primary-hue),
                    var(--primary-saturation),
                    var(--primary-lightness),
                    var(--primary-alpha))`,
                'backdrop-filter': 'blur(3px)',
            },
            ...options.window_options,
        });

        const default_wallpaper = '/images/wallpaper-elacity.png';

        // Highlight current wallpaper in presets
        if (bg_url) {
            $(el_window).find(`.desktop-bg-preset[data-url="${bg_url}"]`).css('border-color', '#007AFF');
        }

        // Set current fit value
        if (bg_fit) {
            $(el_window).find('.desktop-bg-fit').val(bg_fit);
        }

        $(el_window).find('.desktop-bg-color-block:not(.desktop-bg-color-block-palette)').on('click', async function (e) {
            bg_url = null;
            bg_display_url = null;
            bg_color = $(this).attr('data-color');
            $(el_window).find('.desktop-bg-preset').css('border-color', 'transparent');
            window.set_desktop_background({ url: null, color: bg_color });
        });
        $(el_window).find('.desktop-bg-color-block-palette input').on('change', async function (e) {
            bg_url = null;
            bg_display_url = null;
            bg_color = $(this).val();
            $(el_window).find('.desktop-bg-preset').css('border-color', 'transparent');
            window.set_desktop_background({ url: null, color: bg_color });
        });
        $(el_window).on('file_opened', async function (e) {
            let selected_file = Array.isArray(e.detail) ? e.detail[0] : e.detail;
            const fit = $(el_window).find('.desktop-bg-fit').val();
            console.log('[UIWindowDesktopBGSettings] File opened:', selected_file);
            console.log('[UIWindowDesktopBGSettings] File properties:', Object.keys(selected_file));
            
            // Get signed read_url for immediate display (works for CSS background-image)
            let signed_url = null;
            
            // Check various possible property names for the read URL
            if (selected_file.read_url) {
                signed_url = selected_file.read_url;
                console.log('[UIWindowDesktopBGSettings] Using read_url:', signed_url);
            } else if (selected_file.readURL) {
                signed_url = selected_file.readURL;
                console.log('[UIWindowDesktopBGSettings] Using readURL:', signed_url);
            } else if (selected_file.url) {
                signed_url = selected_file.url;
                console.log('[UIWindowDesktopBGSettings] Using url:', signed_url);
            } else if (selected_file.path) {
                // If we only have a path, sign it to get a read_url
                try {
                    console.log('[UIWindowDesktopBGSettings] Signing file path:', selected_file.path);
                    // Expand ~ to full path if needed
                    let filePath = selected_file.path;
                    if (filePath.startsWith('~')) {
                        filePath = filePath.replace('~', `/${window.user?.username || window.user?.wallet_address || ''}`);
                    }
                    
                    const signed = await puter.fs.sign(undefined, { path: filePath, action: 'read' });
                    console.log('[UIWindowDesktopBGSettings] Sign response:', signed);
                    
                    // Handle different response structures - SDK transforms {signatures: [...]} to {items: [...]}
                    let items = null;
                    if (signed && signed.items) {
                        items = Array.isArray(signed.items) ? signed.items : [signed.items];
                    } else if (signed && signed.signatures) {
                        items = Array.isArray(signed.signatures) ? signed.signatures : [signed.signatures];
                    } else if (signed && Array.isArray(signed)) {
                        items = signed;
                    } else if (signed && signed.read_url) {
                        // Single item response
                        signed_url = signed.read_url;
                        console.log('[UIWindowDesktopBGSettings] Got signed URL from single item:', signed_url);
                    }
                    
                    if (items && items.length > 0) {
                        const firstItem = items[0];
                        if (firstItem.read_url) {
                            signed_url = firstItem.read_url;
                            console.log('[UIWindowDesktopBGSettings] Got signed URL from items array:', signed_url);
                        } else if (firstItem.url) {
                            signed_url = firstItem.url;
                            console.log('[UIWindowDesktopBGSettings] Got URL from items array:', signed_url);
                        } else {
                            console.warn('[UIWindowDesktopBGSettings] Sign response item missing read_url/url:', firstItem);
                        }
                    } else if (!signed_url) {
                        console.warn('[UIWindowDesktopBGSettings] Sign response has no items/signatures:', signed);
                    }
                } catch (err) {
                    console.warn('[UIWindowDesktopBGSettings] Failed to sign file:', err);
                }
            }
            
            if (signed_url) {
                bg_url = selected_file.path || null;
                bg_display_url = signed_url;
                bg_fit = fit;
                bg_color = undefined;
                window.set_desktop_background({ url: signed_url, fit: bg_fit });
            }
        });

        $(el_window).find('.desktop-bg-fit').on('change', function (e) {
            const fit = $(this).val();
            bg_fit = fit;
            if (bg_display_url) {
                window.set_desktop_background({ url: bg_display_url, fit });
            }
        });

        $(el_window).find('.apply').on('click', async function (e) {
            try {
                const urlToSave = bg_url || window.desktop_bg_url;
                const colorToSave = bg_color || null;
                const fitToSave = bg_fit || 'cover';

                $.ajax({
                    url: `${window.api_origin}/set-desktop-bg`,
                    type: 'POST',
                    data: JSON.stringify({
                        url: urlToSave,
                        color: colorToSave,
                        fit: fitToSave,
                    }),
                    async: true,
                    contentType: 'application/json',
                    headers: {
                        'Authorization': `Bearer ${window.auth_token}`,
                    },
                    success: function(response) {
                        window.desktop_bg_url = urlToSave;
                        window.desktop_bg_color = colorToSave;
                        window.desktop_bg_fit = fitToSave;
                        if (window.user) {
                            window.user.desktop_bg_url = urlToSave;
                            window.user.desktop_bg_color = colorToSave;
                            window.user.desktop_bg_fit = fitToSave;
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('[UIWindowDesktopBGSettings] Failed to save background:', error, xhr);
                    },
                    statusCode: {
                        401: function () {
                            window.logout();
                        },
                    },
                });
                $(el_window).close();
                resolve(true);
            } catch (err) {
                console.error('[UIWindowDesktopBGSettings] Error in apply handler:', err);
            }
        });

        $(el_window).find('.browse').on('click', function () {
            // open dialog
            UIWindow({
                path: `/${ window.user.username }/Desktop`,
                // this is the uuid of the window to which this dialog will return
                parent_uuid: $(el_window).attr('data-element_uuid'),
                allowed_file_types: ['image/*'],
                show_maximize_button: false,
                show_minimize_button: false,
                title: i18n('window_title_open'),
                is_dir: true,
                is_openFileDialog: true,
                selectable_body: false,
            });
        });

        $(el_window).find('.desktop-bg-preset').on('click', function () {
            const url = $(this).attr('data-url');
            bg_url = url;
            bg_display_url = url;
            bg_color = undefined;
            bg_fit = $(el_window).find('.desktop-bg-fit').val() || 'cover';
            window.set_desktop_background({ url, fit: bg_fit });
            $(el_window).find('.desktop-bg-preset').css('border-color', 'transparent');
            $(this).css('border-color', '#007AFF');
        });

        $(el_window).find('.cancel').on('click', function () {
            $('body').attr('style', original_background_css);
            $(el_window).close();
            resolve(true);
        });
    });
}

export default UIWindowDesktopBGSettings;