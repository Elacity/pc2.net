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
import { initAIChatWindow } from './AI/UIAIChat.js';

/**
 * UIWindowAIChat - Creates a windowed version of the AI Chat
 * 
 * This window wrapper allows the AI Chat to be opened as a standalone
 * application while sharing state with the sidebar version via the
 * backend conversation storage.
 */
export default async function UIWindowAIChat(options = {}) {
    // UIWindow handles single_instance internally - it will focus existing window if one exists
    const windowOptions = {
        title: 'AI Chat',
        icon: window.icons?.['ai-chat.svg'] || null,
        app: 'ai-chat',
        uid: null,
        is_dir: false,
        single_instance: false, // Disabled for now - focusWindow timing issue
        width: 500,
        height: 700,
        min_width: 400,
        min_height: 500,
        has_head: true,
        selectable_body: true,
        is_resizable: true,
        is_draggable: true,
        init_center: true,
        is_visible: true,
        show_in_taskbar: true,
        allow_native_ctxmenu: true,
        allow_user_select: true,
        backdrop: false,
        close_on_backdrop_click: false,
        window_class: 'window-ai-chat',
        body_content: `
            <div class="ai-chat-window-container">
                <div class="ai-window-panel">
                    <div class="ai-panel-header">
                        <button class="ai-menu-btn" title="Menu" style="background: none; border: none; padding: 2px; cursor: pointer; color: #666; margin-right: auto;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="3" y1="6" x2="21" y2="6"/>
                                <line x1="3" y1="12" x2="21" y2="12"/>
                                <line x1="3" y1="18" x2="21" y2="18"/>
                            </svg>
                        </button>
                        <button class="ai-new-chat-btn" title="New Chat" style="background: none; border: none; padding: 2px; cursor: pointer; color: #666; margin-right: 12px;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12h14"/>
                            </svg>
                        </button>
                    </div>
                    <div class="ai-history-menu">
                        <div class="ai-history-header">Chats</div>
                        <div class="ai-history-list"></div>
                    </div>
                    <div class="ai-chat-messages"></div>
                    <div class="ai-chat-input-container">
                        <div class="ai-chat-input-wrapper">
                            <textarea class="ai-chat-input" placeholder="Talk to ElastOS" rows="1"></textarea>
                        </div>
                        <div class="ai-attached-files"></div>
                        <div class="ai-chat-input-actions">
                            <button class="ai-attach-btn" title="Attach file">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                                </svg>
                            </button>
                            <select class="ai-model-select">
                                <option value="ollama:deepseek-r1:1.5b">Local DeepSeek</option>
                            </select>
                            <button class="btn-send-ai" title="Send">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `,
        ...options
    };

    const win = await UIWindow(windowOptions);
    
    if (win) {
        const container = win.querySelector('.ai-chat-window-container');
        if (container) {
            // Initialize AI chat in window context
            initAIChatWindow(container);
        }
    }

    return win;
}
