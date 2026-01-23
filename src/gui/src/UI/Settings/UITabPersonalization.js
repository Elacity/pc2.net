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
        const darkMode = localStorage.getItem('pc2_dark_mode') === 'true';
        const notifySound = localStorage.getItem('pc2_notify_sound') !== 'false';
        const notifyDesktop = localStorage.getItem('pc2_notify_desktop') !== 'false';
        const fontSize = localStorage.getItem('pc2_font_size') || 'medium';
        
        return `
            <style>
                .pers-section { margin-bottom: 14px; }
                .pers-section-title { font-size: 11px; font-weight: 700; color: #000; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; padding-left: 2px; }
                .pers-card { background: #f9f9f9; border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; }
                .pers-card-row { display: flex; justify-content: space-between; align-items: center; }
                .pers-card-label { font-size: 13px; font-weight: 500; color: #333; }
                .pers-card-sublabel { font-size: 10px; color: #999; }
                .pers-select { font-size: 11px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; background: #fff; width: auto; }
                .pers-btn { font-size: 11px; padding: 4px 10px; border-radius: 4px; cursor: pointer; line-height: 1.2; height: auto; }
                .pers-group { background: #f9f9f9; border-radius: 8px; border: 1px solid #d0d0d0; overflow: hidden; }
                .pers-group-row { padding: 10px 12px; border-bottom: 1px solid #e5e5e5; }
                .pers-group-row:last-child { border-bottom: none; }
                .toggle-switch { position: relative; display: inline-block; width: 36px; height: 20px; }
                .toggle-switch input { opacity: 0; width: 0; height: 0; }
                .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: 0.3s; border-radius: 20px; }
                .toggle-slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: white; transition: 0.3s; border-radius: 50%; }
                input:checked + .toggle-slider { background-color: #3b82f6; }
                input:checked + .toggle-slider:before { transform: translateX(16px); }
            </style>
            
            <!-- Appearance -->
            <div class="pers-section">
                <div class="pers-section-title">Appearance</div>
                <div class="pers-group">
                    <div class="pers-group-row"><div class="pers-card-row"><span class="pers-card-label">${i18n('background')}</span><button class="button pers-btn change-background">${i18n('change')}</button></div></div>
                    <div class="pers-group-row"><div class="pers-card-row"><span class="pers-card-label">${i18n('ui_colors')}</span><button class="button pers-btn change-ui-colors">${i18n('change')}</button></div></div>
                    <div class="pers-group-row"><div class="pers-card-row"><div><span class="pers-card-label">Dark Mode</span><div class="pers-card-sublabel">Reduce eye strain</div></div><label class="toggle-switch"><input type="checkbox" id="dark-mode-toggle" ${darkMode ? 'checked' : ''}><span class="toggle-slider"></span></label></div></div>
                </div>
            </div>
            
            <!-- Display -->
            <div class="pers-section">
                <div class="pers-section-title">Display</div>
                <div class="pers-group">
                    <div class="pers-group-row"><div class="pers-card-row"><span class="pers-card-label">${i18n('clock_visibility')}</span><select class="pers-select change-clock-visible"><option value="auto">${i18n('clock_visible_auto')}</option><option value="hide">${i18n('clock_visible_hide')}</option><option value="show">${i18n('clock_visible_show')}</option></select></div></div>
                    <div class="pers-group-row"><div class="pers-card-row"><span class="pers-card-label">Font Size</span><select id="font-size-select" class="pers-select"><option value="small" ${fontSize === 'small' ? 'selected' : ''}>Small</option><option value="medium" ${fontSize === 'medium' ? 'selected' : ''}>Medium</option><option value="large" ${fontSize === 'large' ? 'selected' : ''}>Large</option></select></div></div>
                </div>
            </div>
            
            <!-- Notifications -->
            <div class="pers-section">
                <div class="pers-section-title">Notifications</div>
                <div class="pers-group">
                    <div class="pers-group-row"><div class="pers-card-row"><div><span class="pers-card-label">Sound</span><div class="pers-card-sublabel">Play sound for alerts</div></div><label class="toggle-switch"><input type="checkbox" id="notify-sound-toggle" ${notifySound ? 'checked' : ''}><span class="toggle-slider"></span></label></div></div>
                    <div class="pers-group-row"><div class="pers-card-row"><div><span class="pers-card-label">Desktop</span><div class="pers-card-sublabel">System notifications</div></div><label class="toggle-switch"><input type="checkbox" id="notify-desktop-toggle" ${notifyDesktop ? 'checked' : ''}><span class="toggle-slider"></span></label></div></div>
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
        
        // Dark mode toggle
        $el_window.find('#dark-mode-toggle').on('change', function() {
            const isDark = this.checked;
            localStorage.setItem('pc2_dark_mode', isDark);
            
            // Apply dark mode (basic implementation)
            if (isDark) {
                document.documentElement.style.setProperty('--color-bg', '#1a1a2e');
                document.documentElement.style.setProperty('--color-text', '#eee');
                $('body').addClass('dark-mode');
            } else {
                document.documentElement.style.removeProperty('--color-bg');
                document.documentElement.style.removeProperty('--color-text');
                $('body').removeClass('dark-mode');
            }
            puter.ui.toast(isDark ? 'Dark mode enabled' : 'Dark mode disabled', { type: 'info' });
        });
        
        // Font size
        $el_window.find('#font-size-select').on('change', function() {
            const size = this.value;
            localStorage.setItem('pc2_font_size', size);
            
            const sizes = { small: '12px', medium: '14px', large: '16px' };
            document.documentElement.style.setProperty('--base-font-size', sizes[size] || '14px');
            puter.ui.toast('Font size updated', { type: 'info' });
        });
        
        // Sound notifications toggle
        $el_window.find('#notify-sound-toggle').on('change', function() {
            localStorage.setItem('pc2_notify_sound', this.checked);
            window.pc2NotifySound = this.checked;
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
                    puter.ui.toast('Desktop notifications permission denied', { type: 'warning' });
                    return;
                }
            }
            
            window.pc2NotifyDesktop = enabled;
        });
    },
};
