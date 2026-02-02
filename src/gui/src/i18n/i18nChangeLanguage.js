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

import UIAlert from '../UI/UIAlert.js';

/**
 * Change the application language and prompt user to reload for full effect
 * @param {string} lang - Language code (e.g., 'en', 'zh', 'fr')
 */
async function changeLanguage (lang) {
    // Update locale immediately
    window.locale = lang;
    
    // CRITICAL: Save to localStorage directly as backup
    // This ensures language persists even if mutate_user_preferences fails
    try {
        const prefs = JSON.parse(localStorage.getItem('user_preferences') || '{}');
        prefs.language = lang;
        localStorage.setItem('user_preferences', JSON.stringify(prefs));
        console.log('[i18n] Language saved to localStorage:', lang);
    } catch (e) {
        console.error('[i18n] Failed to save language to localStorage:', e);
    }
    
    // Also persist via user preferences API (may use puter.kv)
    try {
        await window.mutate_user_preferences({
            language: lang,
        });
        console.log('[i18n] Language saved via mutate_user_preferences:', lang);
    } catch (e) {
        console.error('[i18n] mutate_user_preferences failed:', e);
    }
    
    // Show reload prompt for full UI refresh
    // Use the new locale for the prompt message (will use new language if available)
    const message = window.i18n('language_change_reload_prompt') || 
                    'Language changed. Reload to apply changes everywhere?';
    const reloadLabel = window.i18n('reload') || 'Reload';
    const laterLabel = window.i18n('later') || 'Later';
    
    const shouldReload = await UIAlert({
        message: message,
        buttons: [
            { label: reloadLabel, value: true, type: 'primary' },
            { label: laterLabel, value: false }
        ]
    });
    
    if (shouldReload) {
        window.location.reload();
    }
}

export default changeLanguage;