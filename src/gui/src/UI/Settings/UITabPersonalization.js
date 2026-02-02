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

import UIWindowThemeDialog from '../UIWindowThemeDialog.js';
import UIWindowDesktopBGSettings from '../UIWindowDesktopBGSettings.js';

// About
export default {
    id: 'personalization',
    title_i18n_key: 'personalization',
    icon: 'palette-outline.svg',
    html: () => {
        // Check for saved preferences
        // Dark mode is default - only light mode if explicitly set to 'false'
        const darkMode = localStorage.getItem('pc2_dark_mode') !== 'false';
        const notifySound = localStorage.getItem('pc2_notify_sound') !== 'false';
        const notifyDesktop = localStorage.getItem('pc2_notify_desktop') !== 'false';
        const fontSize = localStorage.getItem('pc2_font_size') || 'medium';
        
        return `
            <style>
                .pers-section { margin-bottom: 14px; }
                .pers-section-title { font-size: 11px; font-weight: 700; color: var(--color-text-primary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; padding-left: 2px; }
                .pers-card { background: var(--color-bg-secondary); border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; }
                .pers-card-row { display: flex; justify-content: space-between; align-items: center; }
                .pers-card-label { font-size: 13px; font-weight: 500; color: var(--color-text-primary); }
                .pers-card-sublabel { font-size: 10px; color: var(--color-text-muted); }
                .pers-select { font-size: 11px; padding: 4px 8px; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-input-bg); color: var(--color-input-text); width: auto; }
                .pers-btn { font-size: 11px; padding: 4px 10px; border-radius: 4px; cursor: pointer; line-height: 1.2; height: auto; }
                .pers-group { background: var(--color-bg-secondary); border-radius: 8px; border: 1px solid var(--color-border); overflow: hidden; }
                .pers-group-row { padding: 10px 12px; border-bottom: 1px solid var(--color-border); }
                .pers-group-row:last-child { border-bottom: none; }
                .toggle-switch { position: relative; display: inline-block; width: 36px; height: 20px; }
                .toggle-switch input { opacity: 0; width: 0; height: 0; }
                .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--color-border); transition: 0.3s; border-radius: 20px; }
                .toggle-slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: white; transition: 0.3s; border-radius: 50%; }
                input:checked + .toggle-slider { background-color: #3b82f6; }
                input:checked + .toggle-slider:before { transform: translateX(16px); }
            </style>
            
            <!-- Appearance -->
            <div class="pers-section">
                <div class="pers-section-title">${i18n('appearance')}</div>
                <div class="pers-group">
                    <div class="pers-group-row"><div class="pers-card-row"><span class="pers-card-label">${i18n('background')}</span><button class="button pers-btn change-background">${i18n('change')}</button></div></div>
                    <div class="pers-group-row"><div class="pers-card-row"><span class="pers-card-label">${i18n('ui_colors')}</span><button class="button pers-btn change-ui-colors">${i18n('change')}</button></div></div>
                    <div class="pers-group-row"><div class="pers-card-row"><div><span class="pers-card-label">${i18n('dark_mode')}</span><div class="pers-card-sublabel">${i18n('reduce_eye_strain')}</div></div><label class="toggle-switch"><input type="checkbox" id="dark-mode-toggle" ${darkMode ? 'checked' : ''}><span class="toggle-slider"></span></label></div></div>
                </div>
            </div>
            
            <!-- Display -->
            <div class="pers-section">
                <div class="pers-section-title">${i18n('display')}</div>
                <div class="pers-group">
                    <div class="pers-group-row"><div class="pers-card-row"><span class="pers-card-label">${i18n('clock_visibility')}</span><select class="pers-select change-clock-visible" style="width: auto; min-width: 100px;"><option value="auto">${i18n('clock_visible_auto')}</option><option value="hide">${i18n('clock_visible_hide')}</option><option value="show">${i18n('clock_visible_show')}</option></select></div></div>
                </div>
            </div>
            
            <!-- Notifications -->
            <div class="pers-section">
                <div class="pers-section-title">${i18n('notifications')}</div>
                <div class="pers-group">
                    <div class="pers-group-row"><div class="pers-card-row"><div><span class="pers-card-label">${i18n('desktop_notifications')}</span><div class="pers-card-sublabel">${i18n('system_notifications')}</div></div><label class="toggle-switch"><input type="checkbox" id="notify-desktop-toggle" ${notifyDesktop ? 'checked' : ''}><span class="toggle-slider"></span></label></div></div>
                </div>
            </div>
            `;
    },
    init: ($el_window) => {
        $el_window.find('.change-ui-colors').on('click', function (e) {
            UIWindowThemeDialog({
                window_options: {
                    parent_uuid: $el_window.attr('data-element_uuid'),
                    disable_parent_window: true,
                    parent_center: true,
                },
            });
        });
        $el_window.find('.change-background').on('click', function (e) {
            UIWindowDesktopBGSettings({
                window_options: {
                    parent_uuid: $el_window.attr('data-element_uuid'),
                    disable_parent_window: true,
                    parent_center: true,
                },
            });
        });

        $el_window.on('change', 'select.change-clock-visible', function (e) {
            window.change_clock_visible(this.value);
        });

        window.change_clock_visible();
        
        // Dark mode toggle - switches between light and dark themes
        // Note: PC2 defaults to dark mode. Light mode is toggled OFF (unchecked).
        $el_window.find('#dark-mode-toggle').on('change', function() {
            const isDark = this.checked;
            
            // IMPORTANT: Save as explicit string 'true' or 'false'
            localStorage.setItem('pc2_dark_mode', isDark ? 'true' : 'false');
            
            // Apply theme using data-theme attribute
            // Dark mode = no attribute (default) or data-theme="dark"
            // Light mode = data-theme="light"
            if (isDark) {
                document.documentElement.removeAttribute('data-theme');
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
            }
            
            console.log('[Theme] Saved preference:', isDark ? 'dark' : 'light', '| localStorage:', localStorage.getItem('pc2_dark_mode'));
            puter.ui.toast(isDark ? i18n('dark_mode_enabled') : i18n('light_mode_enabled'), { type: 'info' });
        });
        
        // Desktop notifications toggle
        $el_window.find('#notify-desktop-toggle').on('change', async function() {
            const enabled = this.checked;
            localStorage.setItem('pc2_notify_desktop', enabled);
            
            if (enabled && Notification.permission === 'default') {
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    this.checked = false;
                    localStorage.setItem('pc2_notify_desktop', false);
                    puter.ui.toast(i18n('notifications_denied'), { type: 'warning' });
                    return;
                }
            }
            
            window.pc2NotifyDesktop = enabled;
        });
    },
};
