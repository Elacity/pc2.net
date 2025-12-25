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

import UIWindow from '../UIWindow.js';
import UIContextMenu from '../UIContextMenu.js';

// Chat history storage keys (wallet-scoped for user isolation)
const CHAT_HISTORY_KEY_PREFIX = 'pc2_ai_chat_history';
const CONVERSATIONS_KEY_PREFIX = 'pc2_ai_conversations';
const CURRENT_CONVERSATION_KEY_PREFIX = 'pc2_ai_current_conversation';
const MAX_HISTORY_MESSAGES = 100;

// Current conversation ID
let currentConversationId = null;
let currentWalletAddress = null;

// Refresh wallet address from window.user (called on initialization and when panel opens)
function refreshWalletAddress() {
    const oldWallet = currentWalletAddress;
    
    // Try to get from window.user (set by whoami endpoint)
    if (window.user?.wallet_address) {
        currentWalletAddress = window.user.wallet_address;
        
        // If wallet changed, clear old conversation ID (user switched accounts)
        if (oldWallet && oldWallet !== currentWalletAddress) {
            console.log('[UIAIChat] Wallet address changed, clearing old conversation ID');
            currentConversationId = null;
        }
        
        return currentWalletAddress;
    }
    
    // Fallback: try to get from auth token or other sources
    // This should not happen in normal operation, but provides a fallback
    console.warn('[UIAIChat] Wallet address not found in window.user');
    currentWalletAddress = null;
    return null;
}

// Get current wallet address (cached or refreshed)
function getCurrentWalletAddress() {
    if (currentWalletAddress) {
        return currentWalletAddress;
    }
    
    // Try to refresh from window.user
    refreshWalletAddress();
    
    if (currentWalletAddress) {
        return currentWalletAddress;
    }
    
    // Last resort fallback (should not happen in normal operation)
    console.warn('[UIAIChat] Wallet address not available, using fallback');
    return 'unknown_wallet';
}

// Get wallet-scoped storage keys
function getConversationsKey() {
    const wallet = getCurrentWalletAddress();
    return `${CONVERSATIONS_KEY_PREFIX}_${wallet}`;
}

function getCurrentConversationKey() {
    const wallet = getCurrentWalletAddress();
    return `${CURRENT_CONVERSATION_KEY_PREFIX}_${wallet}`;
}

// Simple markdown renderer
function renderMarkdown(text) {
    if (!text) return '';
    
    let html = text;
    
    // First, protect code blocks from processing
    const codeBlocks = [];
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        const id = `__CODEBLOCK_${codeBlocks.length}__`;
        codeBlocks.push({ id, lang, code: code.trim() });
        return id;
    });
    
    // Protect inline code
    const inlineCodes = [];
    html = html.replace(/`([^`\n]+)`/g, (match, code) => {
        const id = `__INLINECODE_${inlineCodes.length}__`;
        inlineCodes.push({ id, code });
        return id;
    });
    
    // Escape HTML (for non-code content)
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Restore inline code (before other formatting)
    inlineCodes.forEach(({ id, code }) => {
        html = html.replace(id, `<code>${code}</code>`);
    });
    
    // Headers
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    
    // Bold (**text** or __text__)
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    
    // Italic (*text* or _text_) - avoid matching inside code tags
    html = html.replace(/(?<!<code[^>]*>)(?<!<\/code>)\*([^*\n]+)\*(?!<\/code>)/g, '<em>$1</em>');
    html = html.replace(/(?<!<code[^>]*>)(?<!<\/code>)_([^_\n]+)_(?!<\/code>)/g, '<em>$1</em>');
    
    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Restore code blocks (with proper escaping inside)
    codeBlocks.forEach(({ id, lang, code }) => {
        const escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const langClass = lang ? ` class="language-${lang}"` : '';
        html = html.replace(id, `<pre><code${langClass}>${escapedCode}</code></pre>`);
    });
    
    // Split into paragraphs (double newline)
    const paragraphs = html.split(/\n\n+/);
    html = paragraphs.map(p => {
        p = p.trim();
        if (!p) return '';
        // If it's already a block element, don't wrap
        if (p.startsWith('<pre>') || p.startsWith('<h1>') || p.startsWith('<h2>') || p.startsWith('<h3>')) {
            return p;
        }
        // Replace single newlines with <br>
        p = p.replace(/\n/g, '<br>');
        return `<p>${p}</p>`;
    }).filter(p => p).join('');
    
    return html;
}

// Load all conversations from localStorage (wallet-scoped)
function loadConversations() {
    try {
        const key = getConversationsKey();
        const conversations = localStorage.getItem(key);
        if (conversations) {
            return JSON.parse(conversations);
        }
    } catch (e) {
        console.error('[UIAIChat] Failed to load conversations:', e);
    }
    return {};
}

// Save all conversations to localStorage (wallet-scoped)
function saveConversations(conversations) {
    try {
        const key = getConversationsKey();
        localStorage.setItem(key, JSON.stringify(conversations));
    } catch (e) {
        console.error('[UIAIChat] Failed to save conversations:', e);
    }
}

// Get current conversation ID (wallet-scoped)
function getCurrentConversationId() {
    if (!currentConversationId) {
        const key = getCurrentConversationKey();
        const saved = localStorage.getItem(key);
        if (saved) {
            currentConversationId = saved;
        }
    }
    return currentConversationId;
}

// Set current conversation ID (wallet-scoped)
function setCurrentConversationId(id) {
    currentConversationId = id;
    const key = getCurrentConversationKey();
    if (id) {
        localStorage.setItem(key, id);
    } else {
        localStorage.removeItem(key);
    }
}

// Clear chat history for current wallet (called on logout)
function clearChatHistoryForCurrentWallet() {
    const wallet = getCurrentWalletAddress();
    if (wallet && wallet !== 'unknown_wallet') {
        const conversationsKey = getConversationsKey();
        const currentConvKey = getCurrentConversationKey();
        
        localStorage.removeItem(conversationsKey);
        localStorage.removeItem(currentConvKey);
        
        currentConversationId = null;
        currentWalletAddress = null;
        
        console.log('[UIAIChat] Cleared chat history for wallet:', wallet.substring(0, 10) + '...');
    }
}

// Load chat history for current conversation
function loadChatHistory() {
    const convId = getCurrentConversationId();
    if (!convId) return [];
    
    const conversations = loadConversations();
    return conversations[convId]?.messages || [];
}

// Save chat history for current conversation
function saveChatHistory(messages) {
    const convId = getCurrentConversationId();
    if (!convId) return;
    
    const conversations = loadConversations();
    if (!conversations[convId]) {
        conversations[convId] = {
            id: convId,
            title: getConversationTitle(messages),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: []
        };
    }
    
    // Keep only last MAX_HISTORY_MESSAGES
    conversations[convId].messages = messages.slice(-MAX_HISTORY_MESSAGES);
    conversations[convId].updatedAt = Date.now();
    conversations[convId].title = getConversationTitle(messages);
    
    saveConversations(conversations);
}

// Get conversation title from messages
function getConversationTitle(messages) {
    const firstUserMessage = messages.find(msg => msg.role === 'user');
    if (firstUserMessage) {
        const content = typeof firstUserMessage.content === 'string' 
            ? firstUserMessage.content 
            : 'Chat with files';
        return content.length > 50 ? content.substring(0, 50) + '...' : content;
    }
    return 'New Chat';
}

// Add message to current conversation history
function addToHistory(role, content, messageId = null, attachedFiles = null) {
    const history = loadChatHistory();
    const message = { 
        role, 
        content, 
        timestamp: Date.now(), 
        messageId: messageId || 'msg-' + Date.now() 
    };
    if (attachedFiles && attachedFiles.length > 0) {
        message.attachedFiles = attachedFiles;
    }
    history.push(message);
    saveChatHistory(history);
}

// Start new chat (create new conversation)
function startNewChat() {
    // Save current conversation if it has messages
    const currentHistory = loadChatHistory();
    if (currentHistory.length > 0) {
        saveChatHistory(currentHistory);
    }
    
    // Create new conversation
    const newId = 'conv-' + Date.now();
    setCurrentConversationId(newId);
    
    // Clear UI
    $('.ai-chat-messages').empty();
    $('.ai-chat-messages').removeClass('active');
    $('.ai-chat-input').val('');
    attachedFiles = [];
    updateAttachedFilesDisplay();
    
    $('.ai-chat-input').focus();
    scrollChatToBottom();
    
    // Update history menu
    updateHistoryMenu();
}

// Render a message in the chat
function renderMessage(role, content, messageId, attachedFiles = null) {
    if (role === 'user') {
        let messageDisplay = window.html_encode(typeof content === 'string' ? content : '');
        if (attachedFiles && attachedFiles.length > 0) {
            messageDisplay += '<div class="ai-message-files">';
            attachedFiles.forEach(file => {
                const fileName = file.name || file.path?.split('/').pop() || 'Unknown';
                if (file.type?.startsWith('image/') && file.read_url) {
                    messageDisplay += `<div class="ai-message-file-item ai-message-file-image"><img src="${file.read_url}" alt="${window.html_encode(fileName)}" class="ai-message-file-thumbnail"><span>${window.html_encode(fileName)}</span></div>`;
                } else {
                    const fileIcon = file.type === 'application/pdf' ? '📄' : '📎';
                    messageDisplay += `<div class="ai-message-file-item">${fileIcon} ${window.html_encode(fileName)}</div>`;
                }
            });
            messageDisplay += '</div>';
        }
        
        $('.ai-chat-messages').append(
            `<div class="ai-chat-message ai-chat-message-user-wrapper" id="${messageId}" data-message-id="${messageId}">
                <div class="ai-chat-message-user">${messageDisplay}</div>
                <div class="ai-message-actions">
                    <button class="ai-message-copy" title="Copy message"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                    <button class="ai-message-edit" title="Edit message"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                </div>
            </div>`
        );
    } else if (role === 'assistant') {
        const contentText = typeof content === 'string' ? content : '';
        $('.ai-chat-messages').append(
            `<div class="ai-chat-message" id="${messageId}">
                <div class="ai-chat-message-ai">${renderMarkdown(contentText)}</div>
            </div>`
        );
    }
}

// Load a conversation by ID
function loadConversation(convId) {
    const conversations = loadConversations();
    if (!conversations[convId]) return;
    
    setCurrentConversationId(convId);
    const messages = conversations[convId].messages || [];
    
    // Clear and render messages
    $('.ai-chat-messages').empty();
    $('.ai-chat-messages').removeClass('active');
    
    messages.forEach(msg => {
        renderMessage(msg.role, msg.content, msg.messageId, msg.attachedFiles);
    });
    
    if (messages.length > 0) {
        $('.ai-chat-messages').addClass('active');
    }
    
    scrollChatToBottom();
    updateHistoryMenu();
}

// Delete a conversation
function deleteConversation(convId) {
    const conversations = loadConversations();
    delete conversations[convId];
    saveConversations(conversations);
    
    // If deleting current conversation, start new one
    if (getCurrentConversationId() === convId) {
        setCurrentConversationId(null);
        $('.ai-chat-messages').empty();
        $('.ai-chat-messages').removeClass('active');
        startNewChat();
    } else {
        updateHistoryMenu();
    }
}

// Update history menu display
function updateHistoryMenu() {
    const conversations = loadConversations();
    const convList = Object.values(conversations).sort((a, b) => b.updatedAt - a.updatedAt);
    const currentId = getCurrentConversationId();
    
    // Update slide-out menu if it exists
    const $menu = $('.ai-history-menu');
    if ($menu.length) {
        let html = '';
        if (convList.length === 0) {
            html = '<div class="ai-history-empty">No conversations yet</div>';
        } else {
            convList.forEach(conv => {
                const isActive = conv.id === currentId;
                html += `
                    <div class="ai-history-item ${isActive ? 'active' : ''}" data-conv-id="${conv.id}">
                        <div class="ai-history-item-content">${window.html_encode(conv.title)}</div>
                        <button class="ai-history-item-delete" data-conv-id="${conv.id}" title="Delete">×</button>
                    </div>
                `;
            });
        }
        $menu.find('.ai-history-list').html(html);
    }
}

export default function UIAIChat() {
    // AI button in toolbar (next to cloud icon)
    const aiButtonSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`;
    
    // Insert AI button into toolbar (after cloud icon)
    const insertAIButton = () => {
        const $toolbar = $('.toolbar');
        if ($toolbar.length === 0) {
            setTimeout(insertAIButton, 100);
            return;
        }

        // Remove existing AI button if any
        $('.ai-toolbar-btn').remove();

        const $aiBtn = $(`
            <div class="ai-toolbar-btn toolbar-btn" role="button" aria-label="AI Assistant" tabindex="0" title="AI Assistant">
                ${aiButtonSvg}
            </div>
        `);

        // Insert after cloud icon (pc2-status-bar)
        const $cloudBtn = $('.pc2-status-bar');
        if ($cloudBtn.length > 0) {
            $cloudBtn.after($aiBtn);
        } else {
            // Fallback: insert before wallet button
            const $walletBtn = $('.wallet-btn');
            if ($walletBtn.length > 0) {
                $walletBtn.before($aiBtn);
            } else {
                $toolbar.append($aiBtn);
            }
        }
    };

    insertAIButton();

    // AI Side Panel (matching Puter's exact design)
    let h = '';
    h += `<div class="ai-panel">`;
        h += `<div class="ai-panel-header">`;
            h += `<button class="ai-menu-btn" title="Menu" style="background: none; border: none; padding: 4px; cursor: pointer; color: #666; margin-right: auto;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>`;
            h += `<button class="ai-new-chat-btn" title="New Chat" style="background: none; border: none; padding: 4px; cursor: pointer; color: #666; margin-right: 8px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button>`;
            h += `<button class="btn-hide-ai" title="Close" style="background: none; border: none; padding: 4px; cursor: pointer; color: #666; margin-right: 12px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
        h += `</div>`;
        h += `<div class="ai-history-menu">`;
            h += `<div class="ai-history-header">Chats</div>`;
            h += `<div class="ai-history-list"></div>`;
        h += `</div>`;
        h += `<div class="ai-chat-messages"></div>`;
        h += `<div class="ai-chat-input-container">`;
            h += `<div class="ai-chat-input-wrapper">`;
                h += `<textarea class="ai-chat-input" placeholder="Talk to ElastOS" rows="1"></textarea>`;
            h += `</div>`;
            h += `<div class="ai-attached-files"></div>`;
            h += `<div class="ai-chat-input-actions">`;
                h += `<button class="ai-attach-btn" title="Attach file"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>`;
                h += `<select class="ai-model-select">`;
                    h += `<option value="ollama:deepseek-r1:1.5b">Fast</option>`;
                h += `</select>`;
                h += `<button class="btn-send-ai" title="Send"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg></button>`;
            h += `</div>`;
        h += `</div>`;
    h += `</div>`;

    // Append to body
    $('body').append(h);

    // Initialize wallet address on startup
    refreshWalletAddress();
    
    // Initialize history menu (will load current conversation if exists)
    initializeHistoryMenu();

    // Auto-resize textarea
    $(document).on('input', '.ai-chat-input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    });
    
    // Setup drag and drop
    setupDragAndDrop();
    
    // Set dark mode as default (no theme toggle in AI chat)
    document.documentElement.setAttribute('data-theme', 'dark');
    
    // Load user's AI config and update model selector
    loadAIConfigForChat();
    
    // Refresh wallet address when AI panel is opened (in case user changed)
    $(document).on('click', '.ai-toolbar-btn', function() {
        refreshWalletAddress();
    });
    
    // Listen for AI config updates from Settings
    $(document).on('ai-config-updated', function() {
        console.log('[UIAIChat] AI config updated, reloading...');
        loadAIConfigForChat();
    });
}

// Load user's AI configuration and update model selector
async function loadAIConfigForChat() {
    try {
        const apiOrigin = window.api_origin || window.location.origin;
        const url = new URL('/api/ai/config', apiOrigin);
        const authToken = window.auth_token || localStorage.getItem('puter_auth_token') || localStorage.getItem('auth_token') || '';
        
        const headers = {
            'Content-Type': 'application/json'
        };
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }
        
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers
        });
        
        if (!response.ok) {
            console.warn('[UIAIChat] Failed to load AI config, using defaults');
            return;
        }
        
        const data = await response.json();
        if (!data.success || !data.result) {
            console.warn('[UIAIChat] No AI config found, using defaults');
            return;
        }
        
        const config = data.result;
        const provider = config.default_provider || 'ollama';
        let model = config.default_model || (provider === 'ollama' ? 'deepseek-r1:1.5b' : null);
        
        // If model already has a provider prefix (e.g., "ollama:llava:7b"), extract just the model name
        if (model && model.includes(':')) {
            const parts = model.split(':');
            // If it starts with a provider name, remove it
            if (parts[0] === 'ollama' || parts[0] === 'claude' || parts[0] === 'openai' || parts[0] === 'gemini') {
                model = parts.slice(1).join(':'); // Keep rest as model (handles models with colons like "deepseek-r1:1.5b")
            }
        }
        
        // Update model selector dropdown
        const $modelSelect = $('.ai-model-select');
        if ($modelSelect.length && model) {
            // Format: provider:model (e.g., "ollama:deepseek-r1:1.5b" or "claude:claude-3-5-sonnet-20240620")
            // IMPORTANT: Only use the configured provider, don't mix providers
            
            // Fix deprecated Claude model names
            let cleanModel = model;
            if (provider === 'claude') {
                const deprecatedModels = ['claude-3-5-sonnet-20241022', 'claude-3-5-sonnet-20240620'];
                if (deprecatedModels.includes(model)) {
                    cleanModel = 'claude-sonnet-4-5-20250929';
                    console.log('[UIAIChat] Fixed deprecated Claude model name:', model, '->', cleanModel);
                }
            }
            
            const modelValue = `${provider}:${cleanModel}`;
            
            // Clear existing options and add the configured one
            $modelSelect.empty();
            $modelSelect.append(`<option value="ollama:deepseek-r1:1.5b">Fast (Ollama)</option>`);
            
            // Add the configured model option
            const providerName = provider === 'ollama' ? 'Ollama' : 
                                provider === 'claude' ? 'Claude' :
                                provider === 'openai' ? 'OpenAI' :
                                provider === 'gemini' ? 'Gemini' : provider;
            $modelSelect.append(`<option value="${modelValue}">${providerName}: ${cleanModel}</option>`);
            $modelSelect.val(modelValue);
            
            console.log('[UIAIChat] Updated model selector to:', modelValue, '(provider:', provider, ', model:', cleanModel, ')');
        }
    } catch (error) {
        console.error('[UIAIChat] Error loading AI config:', error);
    }
}


// Setup drag and drop for file attachments from PC2 filesystem
function setupDragAndDrop() {
    const $textarea = $('.ai-chat-input');
    const $inputContainer = $('.ai-chat-input-container');
    
    // Prevent default drag behaviors on textarea
    $(document).on('dragover dragenter', '.ai-chat-input', function(e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).addClass('ai-drag-over');
    });
    
    // Remove drag-over class on drag leave
    $(document).on('dragleave', '.ai-chat-input', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const relatedTarget = e.relatedTarget || document.elementFromPoint(e.clientX, e.clientY);
        if (!relatedTarget || !$(this)[0].contains(relatedTarget)) {
            $(this).removeClass('ai-drag-over');
        }
    });
    
    // Handle file drop on textarea
    $(document).on('drop', '.ai-chat-input', async function(e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).removeClass('ai-drag-over');
        
        const originalEvent = e.originalEvent;
        
        // Check for PC2 filesystem files first (from event.detail or dataTransfer)
        let pc2Files = [];
        
        // Method 1: Check event.detail.items (PC2 custom event)
        if (originalEvent.detail?.items && originalEvent.detail.items.length > 0) {
            console.log('[UIAIChat] Found PC2 files in event.detail:', originalEvent.detail.items);
            pc2Files = originalEvent.detail.items;
        }
        // Method 2: Check dataTransfer for PC2 files
        else if (originalEvent.dataTransfer && originalEvent.dataTransfer.items && originalEvent.dataTransfer.items.length > 0) {
            try {
                // Use puter.ui.getEntriesFromDataTransferItems to get PC2 files
                const entries = await puter.ui.getEntriesFromDataTransferItems(originalEvent.dataTransfer.items);
                if (entries && entries.length > 0) {
                    console.log('[UIAIChat] Found PC2 files via getEntriesFromDataTransferItems:', entries);
                    pc2Files = entries;
                }
            } catch (error) {
                console.warn('[UIAIChat] Failed to get PC2 entries from dataTransfer:', error);
            }
        }
        
        // If we have PC2 files, process them
        if (pc2Files.length > 0) {
            console.log('[UIAIChat] Processing', pc2Files.length, 'PC2 filesystem files');
            
            // Sign files to get read URLs
            const itemsToSign = pc2Files.map(file => ({
                uid: file.uid || file.data?.uid,
                action: 'read',
                path: file.path || file.fullPath || file.filepath || file.data?.path
            })).filter(item => item.uid && item.path);
            
            if (itemsToSign.length === 0) {
                console.warn('[UIAIChat] No valid files to sign');
                return;
            }
            
            try {
                console.log('[UIAIChat] Signing files:', itemsToSign);
                const signedFiles = await puter.fs.sign(null, itemsToSign);
                const filesArray = Array.isArray(signedFiles.items) ? signedFiles.items : [signedFiles.items];
                
                console.log('[UIAIChat] Signed files:', filesArray);
                
                // Add files to attached list
                filesArray.forEach((file, idx) => {
                    const originalFile = pc2Files[idx];
                    const existing = attachedFiles.find(f => f.path === file.path || f.uid === file.uid);
                    if (!existing) {
                        const mergedFile = {
                            ...originalFile,
                            ...file,
                            name: file.name || originalFile?.name || file.path?.split('/').pop() || 'Unknown',
                            path: file.path || originalFile?.path || originalFile?.fullPath || originalFile?.filepath,
                            uid: file.uid || originalFile?.uid || originalFile?.data?.uid,
                            size: file.size || file.size_bytes || originalFile?.size || originalFile?.size_bytes || 0,
                            type: file.type || getFileTypeFromName(file.name || originalFile?.name || ''),
                            read_url: file.read_url || file.readURL,
                        };
                        attachedFiles.push(mergedFile);
                        console.log('[UIAIChat] ✅ Added file to attachments:', mergedFile.name);
                    }
                });
                
                console.log('[UIAIChat] Total attached files:', attachedFiles.length);
                updateAttachedFilesDisplay();
            } catch (error) {
                console.error('[UIAIChat] Failed to process dropped PC2 files:', error);
                alert('Failed to attach files. Please try using the attachment button instead.');
            }
        } else {
            // No PC2 files found - might be local OS files
            console.log('[UIAIChat] No PC2 filesystem files detected in drop event');
            // Silently ignore - user needs to upload to PC2 first
        }
    });
}

// Toggle AI panel (clicking toolbar button toggles open/close)
$(document).on('click', '.ai-toolbar-btn, .btn-show-ai', function () {
    const $panel = $('.ai-panel');
    const $btn = $('.ai-toolbar-btn');
    if ($panel.hasClass('ai-panel-open')) {
        // Close panel
        $panel.removeClass('ai-panel-open');
        $btn.removeClass('active');
    } else {
        // Open panel
        $panel.addClass('ai-panel-open');
        $btn.addClass('active');
        // Reload AI config when panel opens to sync with settings
        loadAIConfigForChat();
        $('.ai-chat-input').focus();
        scrollChatToBottom();
    }
});

// Hide AI panel (close button in header)
$(document).on('click', '.btn-hide-ai', function (e) {
    e.stopPropagation(); // Prevent triggering toolbar button click
    $('.ai-panel').removeClass('ai-panel-open');
    $('.ai-toolbar-btn').removeClass('active');
});

// Send message
$(document).on('click', '.btn-send-ai', function () {
    sendAIMessage();
});

// Send message on Enter key (Shift+Enter for new line)
$(document).on('keydown', '.ai-chat-input', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAIMessage();
    }
});

// File attachment handling
let attachedFiles = [];

// Click attachment button - open PC2 file picker as proper window
$(document).on('click', '.ai-attach-btn', async function () {
    try {
        // Get user's desktop path
        const userPath = window.user?.username 
            ? `/${window.user.username}/Desktop` 
            : `/${window.logged_in_users[0]?.username || 'user'}/Desktop`;
        
        // Open file dialog window directly (not popup)
        const fileDialogWindow = await UIWindow({
            title: 'Open',
            is_dir: true,
            is_openFileDialog: true,
            path: userPath,
            selectable_body: true, // Allow multiple selection
            allowed_file_types: 'image/*,application/pdf,.txt,.md,.json,.csv',
            center: true,
            show_maximize_button: false,
            show_minimize_button: false,
        });
        
        // Listen for file selection - we need to intercept when files are selected
        // The file_opened event is dispatched on the window, but we'll also listen on document
        const fileOpenedHandler = async function(e) {
            console.log('[UIAIChat] file_opened event received:', e);
            console.log('[UIAIChat] Event detail:', e.detail);
            
            const selectedFiles = Array.isArray(e.detail) ? e.detail : [e.detail];
            
            if (!selectedFiles || selectedFiles.length === 0) {
                console.warn('[UIAIChat] No files in event detail');
                return;
            }
            
            console.log('[UIAIChat] Processing', selectedFiles.length, 'file(s)');
            
            // Sign files to get read URLs
            const itemsToSign = selectedFiles.map(file => ({
                uid: file.uid,
                action: 'read',
                path: file.path
            }));
            
                try {
                    console.log('[UIAIChat] Signing files:', itemsToSign);
                    const signedFiles = await puter.fs.sign(null, itemsToSign);
                    const filesArray = Array.isArray(signedFiles.items) ? signedFiles.items : [signedFiles.items];
                    
                    console.log('[UIAIChat] Signed files:', filesArray);
                    
                    // Add files to attached list
                    filesArray.forEach((file, idx) => {
                        // Check if file already attached
                        const existing = attachedFiles.find(f => f.path === file.path || f.uid === file.uid);
                        if (!existing) {
                            // Merge with original file data
                            const originalFile = selectedFiles[idx];
                            const mergedFile = {
                                ...originalFile,
                                ...file,
                                // Ensure name property
                                name: file.name || originalFile?.name || file.path?.split('/').pop() || 'Unknown',
                                // Ensure path
                                path: file.path || originalFile?.path,
                                // Ensure uid
                                uid: file.uid || originalFile?.uid,
                                // Get file size if available
                                size: file.size || file.size_bytes || originalFile?.size || originalFile?.size_bytes || 0,
                                // Get file type if available
                                type: file.type || getFileTypeFromName(file.name || originalFile?.name || ''),
                                // Store read_url for images (from signed response)
                                read_url: file.read_url || file.readURL || originalFile?.read_url || originalFile?.readURL,
                            };
                            attachedFiles.push(mergedFile);
                            console.log('[UIAIChat] ✅ Added file to attachments:', mergedFile.name, 'Type:', mergedFile.type, 'Read URL:', mergedFile.read_url ? 'yes' : 'no', 'Path:', mergedFile.path);
                        } else {
                            console.log('[UIAIChat] File already attached, skipping:', file.name || file.path);
                        }
                    });
                    
                    console.log('[UIAIChat] Total attached files:', attachedFiles.length);
                    updateAttachedFilesDisplay();
                } catch (error) {
                    console.error('[UIAIChat] Failed to sign files:', error);
                }
        };
        
        // Store window reference for event handling
        const windowElement = $(fileDialogWindow).get(0);
        if (!windowElement) {
            console.warn('[UIAIChat] Window element not found for file dialog');
            return;
        }
        
        console.log('[UIAIChat] Window element found:', windowElement);
        const windowId = $(windowElement).attr('id');
        console.log('[UIAIChat] Window ID:', windowId);
        
        // Set up a global listener for file_opened events that checks if it's from our dialog
        const globalFileOpenedHandler = function(e) {
            console.log('[UIAIChat] Global file_opened event received:', e);
            const target = e.target;
            
            // Check if this event is from our file dialog window
            if (target && target.id === windowId) {
                console.log('[UIAIChat] Event is from our file dialog!');
                fileOpenedHandler(e);
                // Remove listener after handling
                document.removeEventListener('file_opened', globalFileOpenedHandler, true);
                document.removeEventListener('file_opened', globalFileOpenedHandler, false);
                windowElement.removeEventListener('file_opened', globalFileOpenedHandler, true);
                windowElement.removeEventListener('file_opened', globalFileOpenedHandler, false);
            }
        };
        
        // Listen on both document and window element with capture and bubble phases
        document.addEventListener('file_opened', globalFileOpenedHandler, true);
        document.addEventListener('file_opened', globalFileOpenedHandler, false);
        windowElement.addEventListener('file_opened', globalFileOpenedHandler, true);
        windowElement.addEventListener('file_opened', globalFileOpenedHandler, false);
        console.log('[UIAIChat] Added global file_opened listeners (all phases)');
        
        // Also set up a MutationObserver to watch for when the window closes
        // This will help us catch files even if the event doesn't fire
        // Only set up observer if windowElement is a valid DOM node
        if (windowElement && windowElement.nodeType === Node.ELEMENT_NODE) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                        const display = $(windowElement).css('display');
                        if (display === 'none') {
                            console.log('[UIAIChat] Window closed, checking for selected files...');
                            // Window closed - check if files were selected
                            const selectedEls = $(windowElement).find('.item-selected[data-is_dir="0"]');
                            if (selectedEls.length > 0) {
                                console.log('[UIAIChat] Found', selectedEls.length, 'selected files after window closed');
                                // Process files
                                processSelectedFiles(selectedEls, windowElement);
                            }
                            observer.disconnect();
                        }
                    }
                });
            });
            
            try {
                observer.observe(windowElement, {
                    attributes: true,
                    attributeFilter: ['style', 'class']
                });
                console.log('[UIAIChat] Set up MutationObserver to watch window');
            } catch (error) {
                console.warn('[UIAIChat] Failed to set up MutationObserver:', error);
            }
        } else {
            console.warn('[UIAIChat] windowElement is not a valid DOM node, skipping MutationObserver');
        }
        
        // Helper function to process selected files
        async function processSelectedFiles(selectedEls, windowEl) {
            const itemsToSign = [];
            for (let i = 0; i < selectedEls.length; i++) {
                itemsToSign.push({
                    uid: $(selectedEls[i]).attr('data-uid'),
                    action: 'read',
                    path: $(selectedEls[i]).attr('data-path')
                });
            }
            
            try {
                console.log('[UIAIChat] Signing files:', itemsToSign);
                const signedFiles = await puter.fs.sign(null, itemsToSign);
                const filesArray = Array.isArray(signedFiles.items) ? signedFiles.items : [signedFiles.items];
                
                console.log('[UIAIChat] Signed files:', filesArray);
                
                filesArray.forEach((file, idx) => {
                    const existing = attachedFiles.find(f => f.path === file.path || f.uid === file.uid);
                    if (!existing) {
                        const originalEl = selectedEls[idx];
                        const mergedFile = {
                            ...file,
                            name: file.name || $(originalEl).attr('data-name') || file.path?.split('/').pop() || 'Unknown',
                            path: file.path || $(originalEl).attr('data-path'),
                            uid: file.uid || $(originalEl).attr('data-uid'),
                            size: file.size || file.size_bytes || 0,
                            type: file.type || getFileTypeFromName(file.name || $(originalEl).attr('data-name') || ''),
                            read_url: file.read_url || file.readURL,
                        };
                        attachedFiles.push(mergedFile);
                        console.log('[UIAIChat] ✅ Added file to attachments:', mergedFile.name);
                    }
                });
                
                console.log('[UIAIChat] Total attached files:', attachedFiles.length);
                updateAttachedFilesDisplay();
            } catch (error) {
                console.error('[UIAIChat] Failed to process files:', error);
            }
        }
        
    } catch (error) {
        console.error('[UIAIChat] Failed to open file picker:', error);
    }
});

// Remove attached file
$(document).on('click', '.ai-attached-file-remove', function (e) {
    e.stopPropagation();
    const index = $(this).closest('.ai-attached-file-card').data('index');
    attachedFiles.splice(index, 1);
    updateAttachedFilesDisplay();
});

// Update attached files display - show as cards like Puter
function updateAttachedFilesDisplay() {
    const $container = $('.ai-attached-files');
    $container.empty();
    
    console.log('[UIAIChat] Updating attached files display, count:', attachedFiles.length);
    
    if (attachedFiles.length === 0) {
        $container.hide();
        return;
    }
    
    $container.show();
    
    attachedFiles.forEach((file, index) => {
        // Determine file type from name or mime type
        const fileName = file.name || file.path?.split('/').pop() || 'Unknown';
        const fileType = file.type || getFileTypeFromName(fileName);
        const fileSize = file.size || 0;
        
        // For images, show thumbnail; for others, show icon
        if (fileType.startsWith('image/') && file.read_url) {
            // Image file - show thumbnail card like Puter
            const $file = $(`
                <div class="ai-attached-file-card ai-attached-file-image" data-index="${index}">
                    <img src="${file.read_url}" alt="${window.html_encode(fileName)}" class="ai-attached-file-thumbnail">
                    <div class="ai-attached-file-label">${window.html_encode(fileName.length > 20 ? fileName.substring(0, 20) + '...' : fileName)}</div>
                    <button class="ai-attached-file-remove" title="Remove">×</button>
                </div>
            `);
            $container.append($file);
        } else {
            // Other files - show icon card
            const fileIcon = fileType === 'application/pdf' ? '📄' : '📎';
            const $file = $(`
                <div class="ai-attached-file-card" data-index="${index}">
                    <div class="ai-attached-file-icon-large">${fileIcon}</div>
                    <div class="ai-attached-file-label">${window.html_encode(fileName.length > 20 ? fileName.substring(0, 20) + '...' : fileName)}</div>
                    <button class="ai-attached-file-remove" title="Remove">×</button>
                </div>
            `);
            $container.append($file);
        }
    });
    
    console.log('[UIAIChat] Attached files displayed:', attachedFiles.length);
}

// Get file type from filename
function getFileTypeFromName(fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
        return 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
    }
    if (ext === 'pdf') {
        return 'application/pdf';
    }
    // Text file types (matching Puter's support)
    if (['txt', 'md', 'json', 'csv', 'js', 'ts', 'py', 'html', 'css', 'xml'].includes(ext)) {
        if (ext === 'md') return 'text/markdown';
        if (ext === 'json') return 'application/json';
        if (ext === 'js') return 'text/javascript';
        if (ext === 'ts') return 'text/typescript';
        if (ext === 'py') return 'text/x-python';
        if (ext === 'html') return 'text/html';
        if (ext === 'css') return 'text/css';
        if (ext === 'xml') return 'application/xml';
        if (ext === 'csv') return 'text/csv';
        return 'text/plain';
    }
    return 'application/octet-stream';
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Process files for AI (read from PC2 storage, extract text from images/PDFs, convert to base64 or text)
async function processFilesForAI(files) {
    const processedFiles = [];
    
    for (const file of files) {
        try {
            const fileName = file.name || file.path?.split('/').pop() || 'Unknown';
            const fileType = file.type || getFileTypeFromName(fileName);
            const filePath = file.path;
            
            if (!filePath) {
                console.warn('[UIAIChat] File missing path:', file);
                continue;
            }
            
            if (fileType.startsWith('image/')) {
                // For images: perform OCR to extract text, and also include the image for visual analysis
                console.log('[UIAIChat] Processing image for OCR:', fileName);
                
                try {
                    // Perform OCR on the image (optional, don't fail if it doesn't work)
                    let ocrResult = { text: '' };
                    try {
                        ocrResult = await performOCR(filePath);
                        console.log('[UIAIChat] OCR result:', ocrResult);
                    } catch (ocrError) {
                        console.warn('[UIAIChat] OCR failed (non-fatal):', ocrError);
                        // Continue without OCR text
                    }
                    
                    // Read image from PC2 storage and convert to base64
                    // Use read_url if available (from file attachment), otherwise sign the file
                    let imageData;
                    if (file.read_url) {
                        // Use existing signed URL
                        console.log('[UIAIChat] Using existing read_url for image');
                        const response = await fetch(file.read_url);
                        if (!response.ok) {
                            throw new Error(`Failed to fetch image: ${response.statusText}`);
                        }
                        imageData = await response.blob();
                    } else {
                        // Fallback: sign and read the file
                        console.log('[UIAIChat] Signing file for image read');
                        imageData = await readFileFromPC2(filePath, 'blob');
                    }
                    
                    const base64 = await blobToBase64(imageData);
                    
                    processedFiles.push({
                        type: 'image',
                        mimeType: fileType,
                        name: fileName,
                        data: base64,
                        ocrText: ocrResult?.text || '', // Include extracted text
                    });
                } catch (imageError) {
                    console.error('[UIAIChat] Failed to process image:', imageError);
                    // Don't fail completely - try to continue with just the file path
                    // The AI might be able to handle it differently
                    throw imageError; // Re-throw to be caught by outer handler
                }
            } else if (fileType === 'application/pdf') {
                // For PDFs: extract text content
                console.log('[UIAIChat] Processing PDF for text extraction:', fileName);
                
                try {
                    const pdfText = await extractPDFText(filePath);
                    console.log('[UIAIChat] Extracted PDF text length:', pdfText?.length || 0);
                    
                    processedFiles.push({
                        type: 'text',
                        mimeType: fileType,
                        name: fileName,
                        content: pdfText || 'Could not extract text from PDF',
                    });
                } catch (pdfError) {
                    console.error('[UIAIChat] PDF text extraction failed:', pdfError);
                    // Fallback: try reading as text (won't work for binary PDFs)
                    try {
                        const text = await readFileFromPC2(filePath, 'text');
                        processedFiles.push({
                            type: 'text',
                            mimeType: fileType,
                            name: fileName,
                            content: text,
                        });
                    } catch (error) {
                        processedFiles.push({
                            type: 'text',
                            mimeType: fileType,
                            name: fileName,
                            content: 'Error: Could not extract text from PDF file',
                        });
                    }
                }
            } else if (fileType.startsWith('text/') || 
                       fileType === 'application/json' || 
                       fileType === 'application/xml' ||
                       fileType === 'text/x-python' ||
                       fileType === 'text/javascript' ||
                       fileType === 'text/typescript' ||
                       fileName.endsWith('.txt') || fileName.endsWith('.md') || 
                       fileName.endsWith('.json') || fileName.endsWith('.csv') ||
                       fileName.endsWith('.js') || fileName.endsWith('.ts') ||
                       fileName.endsWith('.py') || fileName.endsWith('.html') ||
                       fileName.endsWith('.css') || fileName.endsWith('.xml')) {
                // Read text content from PC2 storage
                console.log('[UIAIChat] Processing text file:', fileName, 'Type:', fileType);
                const text = await readFileFromPC2(filePath, 'text');
                
                // Truncate very large files
                const MAX_FILE_LENGTH = 50000;
                let content = text || '';
                if (content.length > MAX_FILE_LENGTH) {
                    const truncated = content.substring(0, MAX_FILE_LENGTH);
                    const remaining = content.length - MAX_FILE_LENGTH;
                    content = `${truncated}\n\n[... ${remaining.toLocaleString()} more characters truncated. The file is very large. Please ask specific questions about the content.]`;
                }
                processedFiles.push({
                    type: 'text',
                    mimeType: fileType,
                    name: fileName,
                    content: text,
                });
            } else {
                // Unsupported file type - skip or show error
                console.warn('[UIAIChat] Unsupported file type:', fileType, fileName);
                continue;
            }
        } catch (error) {
            console.error('[UIAIChat] Failed to process file:', file, error);
            // Continue with other files
        }
    }
    
    return processedFiles;
}

// Perform OCR on an image using the backend OCR service
async function performOCR(filePath) {
    try {
        // Use puter.ai.img2txt or drivers/call with puter-ocr interface
        if (window.puter && window.puter.ai && window.puter.ai.img2txt) {
            console.log('[UIAIChat] Using puter.ai.img2txt for OCR');
            const result = await window.puter.ai.img2txt(filePath);
            return { text: result?.text || result || '' };
        } else {
            // Fallback: use drivers/call endpoint
            console.log('[UIAIChat] Using drivers/call for OCR');
            
            // Get auth token
            const authToken = window.localStorage.getItem('puter_auth_token') || 
                             window.localStorage.getItem('auth_token') ||
                             (window.logged_in_users && window.logged_in_users[0]?.token);
            
            const response = await fetch('/drivers/call', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
                },
                body: JSON.stringify({
                    interface: 'puter-ocr',
                    method: 'recognize',
                    args: {
                        source: filePath,
                    },
                }),
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('[UIAIChat] OCR error response:', errorText);
                // OCR is optional - don't throw, just return empty text
                return { text: '' };
            }
            
            const data = await response.json();
            if (data.success && data.result) {
                return { text: data.result.text || data.result || '' };
            }
            // OCR is optional - return empty text if it fails
            return { text: '' };
        }
    } catch (error) {
        console.error('[UIAIChat] OCR error:', error);
        throw error;
    }
}

// Extract text from PDF using backend service or pdfjs-dist
async function extractPDFText(filePath) {
    try {
        // Try using puter.ai API if available
        if (window.puter && window.puter.ai && window.puter.ai.pdf2txt) {
            console.log('[UIAIChat] Using puter.ai.pdf2txt for PDF extraction');
            const result = await window.puter.ai.pdf2txt(filePath);
            return result?.text || result || '';
        }
        
        // Fallback: use drivers/call endpoint
        console.log('[UIAIChat] Using drivers/call for PDF text extraction');
        
        // Get auth token
        const authToken = window.localStorage.getItem('puter_auth_token') || 
                         window.localStorage.getItem('auth_token') ||
                         (window.logged_in_users && window.logged_in_users[0]?.token);
        
        const response = await fetch('/drivers/call', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
            },
            body: JSON.stringify({
                interface: 'puter-pdf',
                method: 'extract_text',
                args: {
                    source: filePath,
                },
            }),
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[UIAIChat] PDF extraction error response:', errorText);
            throw new Error(`PDF extraction request failed: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('[UIAIChat] PDF extraction response:', data);
        
        if (data.success && data.result) {
            const extractedText = data.result.text || data.result || '';
            console.log('[UIAIChat] Extracted PDF text length:', extractedText.length);
            return extractedText;
        }
        throw new Error('PDF extraction response missing text');
    } catch (error) {
        console.error('[UIAIChat] PDF extraction error:', error);
        // Try using pdfjs-dist as last resort (if available)
        if (typeof pdfjsLib !== 'undefined') {
            console.log('[UIAIChat] Trying pdfjs-dist for PDF extraction');
            try {
                return await extractPDFTextWithPDFJS(filePath);
            } catch (pdfjsError) {
                console.error('[UIAIChat] pdfjs-dist extraction failed:', pdfjsError);
                throw error; // Throw original error
            }
        }
        throw error;
    }
}

// Extract PDF text using pdfjs-dist library (client-side fallback)
async function extractPDFTextWithPDFJS(filePath) {
    // Get the PDF file as a blob
    const readUrl = filePath.startsWith('http') 
        ? filePath 
        : await puter.fs.sign(filePath);
    
    const response = await fetch(readUrl);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    
    // Load PDF with pdfjs-dist
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    
    // Extract text from all pages
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n\n';
    }
    
    return fullText.trim();
}

// Read file from PC2 storage
async function readFileFromPC2(filePath, asType = 'text') {
    try {
        if (asType === 'text') {
            // Read as text
            const content = await puter.fs.read(filePath);
            return content;
        } else if (asType === 'blob') {
            // Read as blob for images
            const readUrl = filePath.startsWith('http') 
                ? filePath 
                : await puter.fs.sign(filePath);
            
            // Fetch the file
            const response = await fetch(readUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch file: ${response.statusText}`);
            }
            return await response.blob();
        }
    } catch (error) {
        console.error('[UIAIChat] Error reading file from PC2:', filePath, error);
        throw error;
    }
}

// Convert blob to base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Send AI message function with streaming support
async function sendAIMessage() {
    const chatInput = $('.ai-chat-input');
    const chatInputValue = chatInput.val().trim();
    
    if (!chatInputValue && attachedFiles.length === 0) {
        return;
    }
    
    // Process attached files
    let processedFiles = [];
    if (attachedFiles.length > 0) {
        try {
            processedFiles = await processFilesForAI(attachedFiles);
        } catch (error) {
            console.error('[UIAIChat] Failed to process files:', error);
            alert('Failed to process attached files. Please try again.');
            return;
        }
    }
    
    // Build message content with file attachments
    let messageContent = chatInputValue;
    if (processedFiles.length > 0) {
        const fileSections = [];
        processedFiles.forEach(f => {
            if (f.type === 'image') {
                // For images: include OCR text if available, and mention the image
                let imageInfo = `[Image attachment: ${f.name}]`;
                if (f.ocrText) {
                    imageInfo += `\n\nExtracted text from image (OCR):\n${f.ocrText}`;
                }
                imageInfo += `\n\nImage data: ${f.data}`;
                fileSections.push(imageInfo);
            } else if (f.type === 'text') {
                // For text files (including PDFs), include content
                // Truncate very large files to avoid exceeding token limits
                const MAX_FILE_LENGTH = 50000; // ~50k characters to leave room for other content
                let content = f.content;
                if (content.length > MAX_FILE_LENGTH) {
                    const truncated = content.substring(0, MAX_FILE_LENGTH);
                    const remaining = content.length - MAX_FILE_LENGTH;
                    content = `${truncated}\n\n[... ${remaining.toLocaleString()} more characters truncated. The file is very large. Please ask specific questions about the content.]`;
                    console.log(`[UIAIChat] Truncated large file ${f.name}: ${content.length} -> ${MAX_FILE_LENGTH} characters`);
                }
                fileSections.push(`[File attachment: ${f.name}]\n\nContent:\n${content}`);
            }
        });
        
        const fileInfo = fileSections.join('\n\n---\n\n');
        messageContent = messageContent 
            ? `${messageContent}\n\n---\n\nAttached files:\n\n${fileInfo}`
            : `Please analyze these files:\n\n${fileInfo}`;
    }
    
    // Append user message to chat history
    const userMessageId = 'msg-user-' + Date.now();
    let messageDisplay = window.html_encode(chatInputValue || '');
    if (attachedFiles.length > 0) {
        messageDisplay += '<div class="ai-message-files">';
        attachedFiles.forEach(file => {
            const fileName = file.name || file.path?.split('/').pop() || 'Unknown';
            if (file.type?.startsWith('image/') && file.read_url) {
                // Show image thumbnail in message
                messageDisplay += `<div class="ai-message-file-item ai-message-file-image"><img src="${file.read_url}" alt="${window.html_encode(fileName)}" class="ai-message-file-thumbnail"><span>${window.html_encode(fileName)}</span></div>`;
            } else {
                const fileIcon = file.type === 'application/pdf' ? '📄' : '📎';
                messageDisplay += `<div class="ai-message-file-item">${fileIcon} ${window.html_encode(fileName)}</div>`;
            }
        });
        messageDisplay += '</div>';
    }
    
    $('.ai-chat-messages').append(
        `<div class="ai-chat-message ai-chat-message-user-wrapper" id="${userMessageId}" data-message-id="${userMessageId}">
            <div class="ai-chat-message-user">${messageDisplay}</div>
            <div class="ai-message-actions">
                <button class="ai-message-copy" title="Copy message"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                <button class="ai-message-edit" title="Edit message"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            </div>
        </div>`
    );
    $('.ai-chat-messages').addClass('active');
    
    // Add to history (save current conversation if needed)
    const convId = getCurrentConversationId();
    if (!convId) {
        // Create new conversation if none exists
        const newId = 'conv-' + Date.now();
        setCurrentConversationId(newId);
    }
    addToHistory('user', messageContent, userMessageId, attachedFiles);
    
    // Clear the chat input, reset height, and clear attachments
    chatInput.val('');
    chatInput[0].style.height = 'auto';
    attachedFiles = [];
    updateAttachedFilesDisplay();
    
    // Disable send button and input while processing
    const sendBtn = $('.btn-send-ai');
    sendBtn.prop('disabled', true);
    chatInput.prop('disabled', true);
    
    // Get selected model
    const selectedModel = $('.ai-model-select').val() || 'ollama:deepseek-r1:1.5b';
    
    // Create AI message container for streaming
    const aiMessageId = 'msg-ai-' + Date.now();
    $('.ai-chat-messages').append(
        `<div class="ai-chat-message" id="${aiMessageId}">
            <div class="ai-chat-message-ai ai-streaming">
                <div class="ai-loading-indicator">
                    <div class="ai-loading-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <span class="ai-loading-text">Thinking...</span>
                </div>
            </div>
        </div>`
    );
    scrollChatToBottom();
    
    // Get chat history for context
    const history = loadChatHistory();
    const messages = history.map(msg => ({
        role: msg.role,
        content: msg.content
    }));
    
    // Build message content - use multimodal format if images are present
    let userMessageContent;
    if (processedFiles.some(f => f.type === 'image')) {
        // For messages with images, use multimodal content array format
        const contentArray = [];
        
        // Add text content if user typed something
        if (messageContent && messageContent.trim()) {
            contentArray.push({
                type: 'text',
                text: messageContent
            });
        }
        
        // Add images and text files
        processedFiles.forEach(f => {
            if (f.type === 'image') {
                // Add image in multimodal format
                // Base64 data should be in format: data:image/png;base64,<data>
                const base64Data = f.data.startsWith('data:') 
                    ? f.data 
                    : `data:${f.mimeType || 'image/png'};base64,${f.data}`;
                
                contentArray.push({
                    type: 'image',
                    source: {
                        type: f.mimeType || 'image/png',
                        data: base64Data
                    }
                });
                
                // Add OCR text as additional text content if available
                if (f.ocrText && f.ocrText.trim()) {
                    contentArray.push({
                        type: 'text',
                        text: `\n[Extracted text from image (OCR):\n${f.ocrText}]`
                    });
                }
            } else if (f.type === 'text') {
                // Add text file content
                const MAX_FILE_LENGTH = 50000;
                let content = f.content;
                if (content.length > MAX_FILE_LENGTH) {
                    const truncated = content.substring(0, MAX_FILE_LENGTH);
                    const remaining = content.length - MAX_FILE_LENGTH;
                    content = `${truncated}\n\n[... ${remaining.toLocaleString()} more characters truncated. The file is very large. Please ask specific questions about the content.]`;
                }
                contentArray.push({
                    type: 'text',
                    text: `\n[File attachment: ${f.name}]\n\nContent:\n${content}`
                });
            }
        });
        
        // If no text content and only images, add a default prompt
        if (contentArray.length === 0 || (contentArray.length === 1 && contentArray[0].type === 'image')) {
            contentArray.unshift({
                type: 'text',
                text: messageContent || 'Please analyze this image.'
            });
        }
        
        userMessageContent = contentArray;
    } else {
        // No images, use simple text format
        userMessageContent = messageContent;
    }
    
    // Add current user message (with file attachments if any)
    messages.push({ role: 'user', content: userMessageContent });
    
    // Collect tools from apps (backend will auto-inject filesystem tools)
    let allTools = [];
    try {
        const aiToolService = window.services?.get('ai-tool');
        if (aiToolService) {
            // Only collect app tools - backend will auto-inject filesystem tools
            // Pass empty callback since backend handles filesystem tools automatically
            const getFilesystemTools = async () => {
                // Backend auto-injects filesystem tools when tools is undefined/empty
                // We only need to collect app tools here
                return [];
            };
            
            allTools = await aiToolService.collectAllTools(getFilesystemTools);
            console.log('[UIAIChat] Collected', allTools.length, 'tools for AI request (app tools only - backend will add filesystem tools)');
        } else {
            console.warn('[UIAIChat] AIToolService not available, proceeding without app tools');
        }
    } catch (error) {
        console.warn('[UIAIChat] Error collecting tools:', error);
        // Continue without app tools - backend will still provide filesystem tools
    }
    
    const authToken = window.auth_token || localStorage.getItem('puter_auth_token') || localStorage.getItem('auth_token') || '';
    const requestBody = {
        interface: 'puter-chat-completion',
        method: 'complete',
        args: {
            messages: messages,
            model: selectedModel,
            stream: true,  // Enable streaming
            // Pass app tools if available, otherwise undefined (backend will auto-inject filesystem tools)
            tools: allTools.length > 0 ? allTools : undefined
        }
    };
    
    // Use streaming fetch
    fetch('/drivers/call', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': authToken ? `Bearer ${authToken}` : ''
        },
        body: JSON.stringify(requestBody)
    }).then(async (res) => {
        if (!res.ok) {
            let errData = {};
            try {
                const text = await res.text();
                try {
                    errData = JSON.parse(text);
                } catch (e) {
                    errData = { error: text || `HTTP ${res.status}: ${res.statusText}` };
                }
            } catch (e) {
                errData = { error: `HTTP ${res.status}: ${res.statusText}` };
            }
            
            const errorMsg = errData.error || errData.message || `HTTP ${res.status}: ${res.statusText}`;
            const errorDetails = errData.details || errData.errorName || '';
            console.error('[UIAIChat] AI request failed:', {
                status: res.status,
                statusText: res.statusText,
                error: errorMsg,
                details: errorDetails,
                errorName: errData.errorName,
                fullResponse: errData
            });
            
            // Create a more detailed error message
            let fullErrorMsg = errorMsg;
            if (errData.details) {
                fullErrorMsg += `\n\nDetails: ${errData.details.substring(0, 500)}`;
            }
            if (errData.errorName) {
                fullErrorMsg += `\n\nError Type: ${errData.errorName}`;
            }
            
            console.error('[UIAIChat] Full error data:', errData);
            
            const error = new Error(fullErrorMsg);
            error.status = res.status;
            error.response = errData;
            error.errorName = errData.errorName;
            error.details = errData.details;
            throw error;
        }
        
        // Handle streaming response - Puter's format: application/x-ndjson
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let lastChunkText = ''; // Track last chunk to detect exact duplicates
        
        const $aiMessage = $(`#${aiMessageId} .ai-chat-message-ai`);
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
                if (!line.trim()) continue;
                
                try {
                    const chunk = JSON.parse(line);
                    
                    // Puter's format: {"type": "text", "text": "chunk content"}
                    if (chunk.type === 'text' && chunk.text) {
                        const newText = chunk.text;
                        // Skip if this is the exact same chunk as the last one (duplicate detection)
                        if (newText === lastChunkText && newText.length > 0) {
                            console.warn('[UIAIChat] Skipping duplicate chunk:', newText.substring(0, 50));
                            continue;
                        }
                        lastChunkText = newText;
                        fullContent += newText;
                        // Remove loading indicator when first content arrives
                        $aiMessage.removeClass('ai-streaming');
                        $aiMessage.html(renderMarkdown(fullContent));
                        scrollChatToBottom();
                    }
                    // Handle tool_use chunks if needed (for display)
                    else if (chunk.type === 'tool_use') {
                        // Check if tool is from an app (has source metadata)
                        const toolSource = chunk.source; // { appInstanceID: '...' } or null
                        
                        if (toolSource?.appInstanceID) {
                            // App tool - execute via IPC
                            console.log('[UIAIChat] Executing app tool:', chunk.name, 'from app:', toolSource.appInstanceID);
                            try {
                                const aiToolService = window.services?.get('ai-tool');
                                if (aiToolService) {
                                    const result = await aiToolService.executeTool(
                                        chunk.name,
                                        chunk.input || {},
                                        toolSource
                                    );
                                    console.log('[UIAIChat] App tool execution result:', result);
                                    // TODO: Add tool result to conversation and continue AI response
                                    // For now, backend handles filesystem tools, app tools need result handling
                                } else {
                                    console.error('[UIAIChat] AIToolService not available for app tool execution');
                                }
                            } catch (error) {
                                console.error('[UIAIChat] App tool execution error:', error);
                                $aiMessage.html($aiMessage.html() + `<br><span style="color: #fca5a5;">Tool execution error: ${error.message}</span>`);
                            }
                        } else {
                            // Filesystem tool - backend handles it
                            console.log('[UIAIChat] Filesystem tool call detected:', chunk.name);
                        }
                    }
                    // Handle errors
                    else if (chunk.type === 'error') {
                        console.error('[UIAIChat] Stream error:', chunk.message || chunk.error || chunk);
                        const errorMsg = chunk.message || chunk.error || JSON.stringify(chunk);
                        $aiMessage.html(`<span style="color: #fca5a5;">Error: ${errorMsg}</span>`);
                        fullContent = errorMsg; // Set content so it doesn't show generic error
                    }
                    // Log any other chunk types for debugging
                    else {
                        console.log('[UIAIChat] Received chunk with type:', chunk.type, chunk);
                    }
                } catch (e) {
                    // Skip invalid JSON lines (might be partial chunks)
                    if (line.trim() && !line.startsWith('data: ')) {
                        console.warn('[UIAIChat] Failed to parse chunk:', line.substring(0, 100), e);
                    }
                }
            }
        }
        
        // Finalize message
        $aiMessage.removeClass('ai-streaming');
        if (fullContent) {
            $aiMessage.html(renderMarkdown(fullContent));
            addToHistory('assistant', fullContent);
            updateHistoryMenu();
        } else if ($aiMessage.text().trim()) {
            // If we have content in the message but fullContent is empty (edge case)
            const existingContent = $aiMessage.text();
            addToHistory('assistant', existingContent);
            updateHistoryMenu();
        } else {
            console.error('[UIAIChat] Stream completed but no content received. Full buffer:', buffer);
            $aiMessage.html('I received your message, but I\'m having trouble responding right now. Please check the console for details.');
        }
        
        scrollChatToBottom();
    }).catch(function (error) {
        // Remove streaming indicator
        $(`#${aiMessageId} .ai-chat-message-ai`).removeClass('ai-streaming');
        
        // Extract error message with full details
        let errorMsg = 'Failed to get AI response';
        if (error && typeof error === 'object') {
            // Use the error message which already contains details
            errorMsg = error.message || error.error || error.toString();
            
            // If we have direct access to details/errorName, add them
            if (error.details && !errorMsg.includes('Details:')) {
                errorMsg += '\n\nDetails: ' + error.details.substring(0, 500);
            }
            if (error.errorName && !errorMsg.includes('Error Type:')) {
                errorMsg += '\n\nError Type: ' + error.errorName;
            }
            
            // Also check response object
            if (error.response) {
                const resp = error.response;
                if (resp.details && !errorMsg.includes(resp.details.substring(0, 100))) {
                    errorMsg += '\n\nDetails: ' + resp.details.substring(0, 500);
                }
                if (resp.errorName && !errorMsg.includes('Error Type:')) {
                    errorMsg += '\n\nError Type: ' + resp.errorName;
                }
            }
        } else if (error) {
            errorMsg = String(error);
        }
        
        console.error('[UIAIChat] AI chat error:', error);
        console.error('[UIAIChat] AI chat error details:', {
            message: error?.message,
            response: error?.response,
            details: error?.details,
            errorName: error?.errorName,
            status: error?.status,
            stack: error?.stack?.substring(0, 200)
        });
        
        // Show error message with better formatting
        const errorHtml = errorMsg.split('\n').map(line => window.html_encode(line)).join('<br>');
        $(`#${aiMessageId} .ai-chat-message-ai`).html(`<span class="ai-chat-error">Error: ${errorHtml}</span>`);
        scrollChatToBottom();
    }).finally(function () {
        // Re-enable send button and input
        sendBtn.prop('disabled', false);
        chatInput.prop('disabled', false);
        chatInput.focus();
    });
}

// Scroll chat messages to bottom
function scrollChatToBottom() {
    const messagesContainer = $('.ai-chat-messages');
    if (messagesContainer.length) {
        messagesContainer.scrollTop(messagesContainer[0].scrollHeight);
    }
}

// Copy message to clipboard
$(document).on('click', '.ai-message-copy', function (e) {
    e.stopPropagation();
    const $messageWrapper = $(this).closest('.ai-chat-message-user-wrapper');
    const messageText = $messageWrapper.find('.ai-chat-message-user').text();
    
    navigator.clipboard.writeText(messageText).then(() => {
        // Visual feedback
        const $btn = $(this);
        const originalHtml = $btn.html();
        $btn.html('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>');
        setTimeout(() => {
            $btn.html(originalHtml);
        }, 1000);
    }).catch(err => {
        console.error('[UIAIChat] Failed to copy message:', err);
    });
});

// Edit message
$(document).on('click', '.ai-message-edit', function (e) {
    e.stopPropagation();
    const $messageWrapper = $(this).closest('.ai-chat-message-user-wrapper');
    const $messageContent = $messageWrapper.find('.ai-chat-message-user');
    const originalText = $messageContent.text();
    const messageId = $messageWrapper.attr('data-message-id');
    
    // Replace message content with edit input
    $messageWrapper.html(`
        <div class="ai-message-edit-mode">
            <textarea class="ai-message-edit-input">${window.html_encode(originalText)}</textarea>
            <div class="ai-message-edit-actions">
                <button class="ai-message-edit-cancel">Cancel</button>
                <button class="ai-message-edit-save">Save</button>
            </div>
        </div>
    `);
    
    // Focus and select text
    const $editInput = $messageWrapper.find('.ai-message-edit-input');
    $editInput.focus();
    $editInput[0].setSelectionRange(0, $editInput.val().length);
    
    // Cancel edit
    $messageWrapper.find('.ai-message-edit-cancel').on('click', function () {
        $messageWrapper.html(`
            <div class="ai-chat-message-user">${window.html_encode(originalText)}</div>
            <div class="ai-message-actions">
                <button class="ai-message-copy" title="Copy message"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                <button class="ai-message-edit" title="Edit message"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            </div>
        `);
    });
    
    // Save edit and resend
    $messageWrapper.find('.ai-message-edit-save').on('click', function () {
        const editedText = $messageWrapper.find('.ai-message-edit-input').val().trim();
        if (!editedText) {
            return;
        }
        
        // Update message display
        $messageWrapper.html(`
            <div class="ai-chat-message-user">${window.html_encode(editedText)}</div>
            <div class="ai-message-actions">
                <button class="ai-message-copy" title="Copy message"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                <button class="ai-message-edit" title="Edit message"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            </div>
        `);
        
        // Update history
        const history = loadChatHistory();
        const messageIndex = history.findIndex(msg => msg.messageId === messageId);
        if (messageIndex !== -1) {
            history[messageIndex].content = editedText;
            saveChatHistory(history);
        }
        
        // Remove all messages after this one (since we're resending)
        const $allMessages = $('.ai-chat-messages .ai-chat-message');
        const currentIndex = $allMessages.index($messageWrapper);
        $allMessages.slice(currentIndex + 1).remove();
        
        // Clear history after this message
        const updatedHistory = history.slice(0, messageIndex + 1);
        saveChatHistory(updatedHistory);
        
        // Resend the edited message
        const chatInput = $('.ai-chat-input');
        chatInput.val(editedText);
        sendAIMessage();
    });
    
    // Save on Enter (Ctrl/Cmd+Enter)
        $messageWrapper.find('.ai-message-edit-input').on('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            $messageWrapper.find('.ai-message-edit-save').click();
        }
    });
});

// Delete message
$(document).on('click', '.ai-message-delete', function (e) {
    e.stopPropagation();
    const $messageWrapper = $(this).closest('.ai-chat-message-user-wrapper');
    const messageId = $messageWrapper.attr('data-message-id');
    
    if (!messageId) {
        return;
    }
    
    // Remove from UI
    $messageWrapper.fadeOut(200, function() {
        $(this).remove();
        
        // Check if messages container is empty
        if ($('.ai-chat-messages .ai-chat-message').length === 0) {
            $('.ai-chat-messages').removeClass('active');
        }
    });
    
    // Remove from history
    const history = loadChatHistory();
    const filtered = history.filter(msg => msg.messageId !== messageId);
    saveChatHistory(filtered);
});

// Menu button click handler - toggle slide-out history menu
$(document).on('click', '.ai-menu-btn', function (e) {
    e.stopPropagation();
    const $menu = $('.ai-history-menu');
    if ($menu.hasClass('open')) {
        $menu.removeClass('open');
    } else {
        updateHistoryMenu();
        $menu.addClass('open');
    }
});

// Close history menu when clicking outside
$(document).on('click', function(e) {
    if (!$(e.target).closest('.ai-menu-btn, .ai-history-menu').length) {
        $('.ai-history-menu').removeClass('open');
    }
});

// New chat button handler
$(document).on('click', '.ai-new-chat-btn', function (e) {
    e.stopPropagation();
    startNewChat();
});

// History item click handler - load conversation
$(document).on('click', '.ai-history-item', function (e) {
    e.stopPropagation();
    if ($(e.target).closest('.ai-history-item-delete').length) {
        return; // Don't load if clicking delete button
    }
    const convId = $(this).attr('data-conv-id');
    if (convId) {
        loadConversation(convId);
        $('.ai-history-menu').removeClass('open');
    }
});

// History item delete button handler
$(document).on('click', '.ai-history-item-delete', function (e) {
    e.stopPropagation();
    const convId = $(this).attr('data-conv-id');
    if (convId) {
        deleteConversation(convId);
    }
});

// Initialize history menu on load
function initializeHistoryMenu() {
    updateHistoryMenu();
    
    // Load current conversation if it exists
    const currentId = getCurrentConversationId();
    if (currentId) {
        const conversations = loadConversations();
        if (conversations[currentId]) {
            loadConversation(currentId);
        }
    }
}

