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
            <h1>${i18n('personalization')}</h1>
            
            <!-- Appearance -->
            <h2 style="font-size: 14px; margin: 0 0 10px; color: #333;">Appearance</h2>
            
            <div class="settings-card">
                <strong>${i18n('background')}</strong>
                <div style="flex-grow:1;">
                    <button class="button change-background" style="float:right;">${i18n('change')}</button>
                </div>
            </div>
            <div class="settings-card">
                <strong>${i18n('ui_colors')}</strong>
                <div style="flex-grow:1;">
                    <button class="button change-ui-colors" style="float:right;">${i18n('change')}</button>
                </div>
            </div>
            <div class="settings-card">
                <div>
                    <strong style="display: block;">Dark Mode</strong>
                    <span style="font-size: 12px; color: #666;">Reduce eye strain in low light</span>
                </div>
                <div style="flex-grow:1; text-align: right;">
                    <label class="toggle-switch">
                        <input type="checkbox" id="dark-mode-toggle" ${darkMode ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
            
            <!-- Display -->
            <h2 style="font-size: 14px; margin: 20px 0 10px; color: #333;">Display</h2>
            
            <div class="settings-card">
                <strong style="flex-grow:1;">${i18n('clock_visibility')}</strong>
                <select class="change-clock-visible" style="margin-left: 10px; max-width: 200px;">
                    <option value="auto">${i18n('clock_visible_auto')}</option>
                    <option value="hide">${i18n('clock_visible_hide')}</option>
                    <option value="show">${i18n('clock_visible_show')}</option>
                </select>
            </div>
            <div class="settings-card">
                <strong style="flex-grow:1;">Font Size</strong>
                <select id="font-size-select" style="margin-left: 10px; max-width: 200px;">
                    <option value="small" ${fontSize === 'small' ? 'selected' : ''}>Small</option>
                    <option value="medium" ${fontSize === 'medium' ? 'selected' : ''}>Medium (Default)</option>
                    <option value="large" ${fontSize === 'large' ? 'selected' : ''}>Large</option>
                </select>
            </div>
            
            <!-- Notifications -->
            <h2 style="font-size: 14px; margin: 20px 0 10px; color: #333;">Notifications</h2>
            
            <div class="settings-card">
                <div>
                    <strong style="display: block;">Sound Notifications</strong>
                    <span style="font-size: 12px; color: #666;">Play sound for alerts</span>
                </div>
                <div style="flex-grow:1; text-align: right;">
                    <label class="toggle-switch">
                        <input type="checkbox" id="notify-sound-toggle" ${notifySound ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
            <div class="settings-card">
                <div>
                    <strong style="display: block;">Desktop Notifications</strong>
                    <span style="font-size: 12px; color: #666;">Show system notifications</span>
                </div>
                <div style="flex-grow:1; text-align: right;">
                    <label class="toggle-switch">
                        <input type="checkbox" id="notify-desktop-toggle" ${notifyDesktop ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
            
            <style>
                .toggle-switch {
                    position: relative;
                    display: inline-block;
                    width: 44px;
                    height: 24px;
                }
                .toggle-switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }
                .toggle-slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: #ccc;
                    transition: 0.3s;
                    border-radius: 24px;
                }
                .toggle-slider:before {
                    position: absolute;
                    content: "";
                    height: 18px;
                    width: 18px;
                    left: 3px;
                    bottom: 3px;
                    background-color: white;
                    transition: 0.3s;
                    border-radius: 50%;
                }
                input:checked + .toggle-slider {
                    background-color: #3b82f6;
                }
                input:checked + .toggle-slider:before {
                    transform: translateX(20px);
                }
            </style>
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
