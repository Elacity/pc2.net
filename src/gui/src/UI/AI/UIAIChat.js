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
import UIWindowSettings from '../Settings/UIWindowSettings.js';
import UIWindowAIChat from '../UIWindowAIChat.js';

// Chat history storage keys (wallet-scoped for user isolation)
const CHAT_HISTORY_KEY_PREFIX = 'pc2_ai_chat_history';
const CONVERSATIONS_KEY_PREFIX = 'pc2_ai_conversations';
const CURRENT_CONVERSATION_KEY_PREFIX = 'pc2_ai_current_conversation';
const MAX_HISTORY_MESSAGES = 100;

// Current conversation ID
let currentConversationId = null;
let currentWalletAddress = null;

// Current AI request controller for cancellation
let currentAIAbortController = null;
let currentAIRequestState = 'idle'; // 'idle' | 'connecting' | 'thinking' | 'executing' | 'generating'

// Update loading state and UI
function updateLoadingState(state, details = null) {
    currentAIRequestState = state;
    const $loadingIndicator = $('.ai-loading-indicator');
    const $loadingText = $loadingIndicator.find('.ai-loading-text');
    const $loadingDetail = $loadingIndicator.find('.ai-loading-detail');
    
    const stateConfig = {
        'connecting': { text: 'Connecting...', icon: 'connect' },
        'thinking': { text: 'Thinking...', icon: 'brain' },
        'executing': { text: details || 'Executing tool...', icon: 'tool' },
        'generating': { text: 'Generating response...', icon: 'write' },
        'idle': { text: '', icon: '' }
    };
    
    const config = stateConfig[state] || stateConfig.thinking;
    $loadingText.text(config.text);
    
    if (details && state === 'executing') {
        $loadingDetail.text(details).show();
    } else {
        $loadingDetail.hide();
    }
    
    // Update loading indicator class for different animations
    $loadingIndicator
        .removeClass('ai-loading-connecting ai-loading-thinking ai-loading-executing ai-loading-generating')
        .addClass(`ai-loading-${state}`);
}

// Parse thinking/reasoning tags from content (DeepSeek uses <think>...</think>)
function parseThinkingContent(content) {
    const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
    let thinking = '';
    let response = content;
    let match;
    
    // Extract all thinking blocks
    while ((match = thinkRegex.exec(content)) !== null) {
        thinking += match[1].trim() + '\n';
    }
    
    // Remove thinking blocks from response
    response = content.replace(thinkRegex, '').trim();
    
    // Check for unclosed thinking tag (still streaming thinking content)
    const unclosedThinkStart = response.lastIndexOf('<think>');
    const unclosedThinkEnd = response.lastIndexOf('</think>');
    
    if (unclosedThinkStart > unclosedThinkEnd) {
        // There's an unclosed <think> tag - content after it is still thinking
        const partialThinking = response.substring(unclosedThinkStart + 7);
        thinking += partialThinking;
        response = response.substring(0, unclosedThinkStart).trim();
    }
    
    return {
        thinking: thinking.trim(),
        response: response,
        isThinking: unclosedThinkStart > unclosedThinkEnd
    };
}

// SVG icons for thinking block
const THINKING_ICONS = {
    active: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    complete: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    toggle: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>'
};

// Render message with thinking block
function renderMessageWithThinking(content, isStreaming = false) {
    const parsed = parseThinkingContent(content);
    let html = '';
    
    // Add thinking block if there's thinking content
    if (parsed.thinking) {
        const thinkingStatus = parsed.isThinking ? ' ai-thinking-active' : '';
        const thinkingIcon = parsed.isThinking ? THINKING_ICONS.active : THINKING_ICONS.complete;
        const defaultOpen = parsed.isThinking ? ' open' : '';
        
        html += `<div class="ai-thinking-block${thinkingStatus}">
            <details${defaultOpen}>
                <summary class="ai-thinking-header">
                    <span class="ai-thinking-icon">${thinkingIcon}</span>
                    <span class="ai-thinking-label">${parsed.isThinking ? 'Thinking...' : 'Reasoning'}</span>
                    <span class="ai-thinking-toggle">${THINKING_ICONS.toggle}</span>
                </summary>
                <div class="ai-thinking-content">${renderMarkdown(parsed.thinking)}</div>
            </details>
        </div>`;
    }
    
    // Add response content
    if (parsed.response) {
        html += renderMarkdown(parsed.response);
    } else if (isStreaming && !parsed.thinking) {
        // Still waiting for content
        html += '';
    }
    
    return html;
}

// Track active tool executions for current message
let currentToolExecutions = [];

// Track multi-step progress
let currentProgress = {
    currentStep: 0,
    totalSteps: 0,
    label: ''
};

// Reset progress tracking
function resetProgress() {
    currentProgress = { currentStep: 0, totalSteps: 0, label: '' };
}

// Update progress
function updateProgress(current, total, label = '') {
    currentProgress = { currentStep: current, totalSteps: total, label };
}

// Track total tools from backend
let knownTotalTools = 0;

// Render progress bar with collapsible tool details
function renderProgressBar() {
    console.log('[UIAIChat] renderProgressBar called, tools:', currentToolExecutions.length, 'knownTotal:', knownTotalTools);
    
    if (currentToolExecutions.length === 0) {
        console.log('[UIAIChat] renderProgressBar returning empty - no tools');
        return '';
    }
    
    // Check if any tools are still running
    const isRunning = currentToolExecutions.some(t => t.status === 'running' || t.status === 'pending');
    const completedCount = currentToolExecutions.filter(t => t.status === 'success' || t.status === 'error').length;
    const totalCount = knownTotalTools > 0 ? knownTotalTools : currentToolExecutions.length;
    
    // Find the currently running tool for the label
    const runningTool = currentToolExecutions.find(t => t.status === 'running');
    
    console.log('[UIAIChat] renderProgressBar - isRunning:', isRunning, 'completed:', completedCount, 'total:', totalCount, 'runningTool:', runningTool?.name);
    
    // Calculate step text and progress
    let stepsText, percent;
    if (isRunning) {
        const currentStep = completedCount + 1;
        if (knownTotalTools > 0) {
            // We know the total from backend - show real progress
            stepsText = `Step ${currentStep} of ${knownTotalTools}`;
            // Progress is based on completed tools (current step - 1 completed)
            percent = Math.round((completedCount / knownTotalTools) * 100);
        } else {
            // Don't know total yet
            stepsText = `Step ${currentStep}...`;
            percent = 0;
        }
    } else {
        stepsText = `Step ${completedCount} of ${totalCount}`;
        percent = 100;
    }
    
    // Render tool cards for details section
    const toolCardsHtml = currentToolExecutions.length > 0 
        ? `<div class="ai-progress-details">${currentToolExecutions.map(renderToolCard).join('')}</div>`
        : '';
    
    const expandIcon = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
    
    // Get the current tool label - use the running tool we found above
    const labelText = runningTool ? runningTool.name.replace(/_/g, ' ') : '';
    
    return `
        <details class="ai-progress-container${isRunning ? ' ai-progress-running' : ''}">
            <summary class="ai-progress-summary">
                <div class="ai-progress-header">
                    <div class="ai-progress-info">
                        <span class="ai-progress-steps">${stepsText}</span>
                        ${labelText ? `<span class="ai-progress-label">${labelText}</span>` : ''}
                    </div>
                    <div class="ai-progress-right">
                        ${!isRunning ? `<span class="ai-progress-percent">${percent}%</span>` : ''}
                        <span class="ai-progress-expand">${expandIcon}</span>
                    </div>
                </div>
                <div class="ai-progress-bar">
                    <div class="ai-progress-fill" style="width: ${percent}%"></div>
                </div>
            </summary>
            ${toolCardsHtml}
        </details>
    `;
}

// SVG icons for tools (professional, no emojis)
const TOOL_ICONS = {
    folder: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    file: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    move: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
    copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    list: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    tool: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>'
};

// Status icons
const STATUS_ICONS = {
    pending: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    running: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    success: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
};

// Error type icons (larger, for error cards)
const ERROR_ICONS = {
    network: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/><line x1="2" y1="2" x2="22" y2="22" stroke="#ef4444"/></svg>',
    api: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="6" r="1" fill="#ef4444"/></svg>',
    auth: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><line x1="12" y1="15" x2="12" y2="18"/></svg>',
    rateLimit: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><path d="M22 22L2 2" stroke="#ef4444"/></svg>',
    tool: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/><line x1="5" y1="5" x2="19" y2="19" stroke="#ef4444"/></svg>',
    model: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    unknown: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    retry: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>'
};

// Message status icons (for user message delivery states)
const MESSAGE_STATUS_ICONS = {
    sending: '<svg class="ai-status-icon ai-status-sending" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32"><animate attributeName="stroke-dashoffset" dur="1s" values="32;0" repeatCount="indefinite"/></circle></svg>',
    sent: '<svg class="ai-status-icon ai-status-sent" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    delivered: '<svg class="ai-status-icon ai-status-delivered" width="16" height="14" viewBox="0 0 28 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/><polyline points="28 6 17 17 14 14"/></svg>',
    error: '<svg class="ai-status-icon ai-status-error" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
};

// Update user message status indicator
function updateMessageStatus(messageId, status) {
    const $statusIndicator = $(`#${messageId} .ai-message-status`);
    if ($statusIndicator.length) {
        const icon = MESSAGE_STATUS_ICONS[status] || MESSAGE_STATUS_ICONS.sent;
        $statusIndicator.html(icon);
        $statusIndicator.attr('data-status', status);
        $statusIndicator.attr('title', status.charAt(0).toUpperCase() + status.slice(1));
    }
}

// Error type definitions with patterns and recovery suggestions
const ERROR_TYPES = {
    network: {
        patterns: ['fetch', 'network', 'connection', 'ECONNREFUSED', 'ETIMEDOUT', 'ERR_CONNECTION', 'Failed to fetch', 'net::ERR'],
        title: 'Network Error',
        suggestions: [
            'Check your internet connection',
            'Try refreshing the page',
            'The server might be temporarily unavailable'
        ]
    },
    auth: {
        patterns: ['401', 'unauthorized', 'authentication', 'invalid.*key', 'api.*key', 'token.*invalid', 'token.*expired'],
        title: 'Authentication Error',
        suggestions: [
            'Check your API key in Settings',
            'Your API key may have expired',
            'Ensure your API key has the correct permissions'
        ]
    },
    rateLimit: {
        patterns: ['429', 'rate.*limit', 'too many requests', 'quota', 'exceeded', 'overloaded'],
        title: 'Rate Limit Exceeded',
        suggestions: [
            'Wait a moment before trying again',
            'Consider upgrading your API plan',
            'Reduce the frequency of requests'
        ]
    },
    model: {
        patterns: ['model.*not.*found', 'invalid.*model', 'model.*unavailable', 'does not support', 'not.*available'],
        title: 'Model Error',
        suggestions: [
            'Select a different model from the dropdown',
            'Check if Ollama is running (for local models)',
            'Verify your API key supports this model'
        ]
    },
    tool: {
        patterns: ['tool.*failed', 'tool.*error', 'execution.*failed', 'permission.*denied', 'file.*not.*found', 'ENOENT'],
        title: 'Tool Execution Error',
        suggestions: [
            'Check if the file or folder exists',
            'Verify you have permission to access the path',
            'Try a different path or operation'
        ]
    },
    api: {
        patterns: ['400', '500', '502', '503', '504', 'invalid.*request', 'bad.*request', 'internal.*error', 'server.*error'],
        title: 'API Error',
        suggestions: [
            'Try sending your message again',
            'Simplify your request if it was complex',
            'The AI service may be experiencing issues'
        ]
    }
};

// Classify an error into a category
function classifyError(error) {
    const errorStr = (error?.message || error?.error || String(error)).toLowerCase();
    const status = error?.status;
    
    // Check status codes first
    if (status === 401 || status === 403) return 'auth';
    if (status === 429) return 'rateLimit';
    if (status >= 500 && status < 600) return 'api';
    
    // Check patterns
    for (const [type, config] of Object.entries(ERROR_TYPES)) {
        for (const pattern of config.patterns) {
            if (new RegExp(pattern, 'i').test(errorStr)) {
                return type;
            }
        }
    }
    
    return 'unknown';
}

// Get recovery suggestions for an error
function getRecoverySuggestions(errorType) {
    const config = ERROR_TYPES[errorType];
    if (config) {
        return config.suggestions;
    }
    return [
        'Try sending your message again',
        'Check the browser console for more details',
        'Contact support if the issue persists'
    ];
}

// Get error title for display
function getErrorTitle(errorType) {
    const config = ERROR_TYPES[errorType];
    return config?.title || 'Something went wrong';
}

// Store last message for retry functionality
let lastUserMessage = null;
let lastAttachedFiles = [];

// Render an error card with retry button and recovery suggestions
function renderErrorCard(error, messageId) {
    const errorType = classifyError(error);
    const errorIcon = ERROR_ICONS[errorType] || ERROR_ICONS.unknown;
    const errorTitle = getErrorTitle(errorType);
    const suggestions = getRecoverySuggestions(errorType);
    
    // Extract error message
    let errorMsg = 'An unexpected error occurred';
    if (error && typeof error === 'object') {
        errorMsg = error.message || error.error || error.toString();
    } else if (error) {
        errorMsg = String(error);
    }
    
    // Clean up overly long error messages
    if (errorMsg.length > 300) {
        errorMsg = errorMsg.substring(0, 300) + '...';
    }
    
    const suggestionsHtml = suggestions.map(s => 
        `<li class="ai-error-suggestion-item">${window.html_encode(s)}</li>`
    ).join('');
    
    return `
        <div class="ai-error-card" data-error-type="${errorType}" data-message-id="${messageId}">
            <div class="ai-error-header">
                <span class="ai-error-icon">${errorIcon}</span>
                <span class="ai-error-title">${errorTitle}</span>
            </div>
            <div class="ai-error-message">${window.html_encode(errorMsg)}</div>
            <div class="ai-error-suggestions">
                <div class="ai-error-suggestions-title">What you can try:</div>
                <ul class="ai-error-suggestion-list">${suggestionsHtml}</ul>
            </div>
            <div class="ai-error-actions">
                <button class="ai-error-retry-btn" data-message-id="${messageId}">
                    ${ERROR_ICONS.retry}
                    <span>Retry</span>
                </button>
                <button class="ai-error-dismiss-btn" data-message-id="${messageId}">
                    Dismiss
                </button>
            </div>
        </div>
    `;
}

// Get icon for tool type
function getToolIcon(toolName) {
    const iconMap = {
        'create_folder': TOOL_ICONS.folder,
        'create_file': TOOL_ICONS.file,
        'write_file': TOOL_ICONS.edit,
        'read_file': TOOL_ICONS.file,
        'delete_file': TOOL_ICONS.trash,
        'delete_folder': TOOL_ICONS.trash,
        'move_file': TOOL_ICONS.move,
        'move_folder': TOOL_ICONS.move,
        'copy_file': TOOL_ICONS.copy,
        'copy_folder': TOOL_ICONS.copy,
        'list_directory': TOOL_ICONS.list,
        'search_files': TOOL_ICONS.search,
        'get_file_info': TOOL_ICONS.info,
        'rename_file': TOOL_ICONS.edit,
        'rename_folder': TOOL_ICONS.edit
    };
    return iconMap[toolName] || TOOL_ICONS.tool;
}

// Render tool execution card
function renderToolCard(tool) {
    const statusClass = `ai-tool-${tool.status}`;
    const statusIcon = STATUS_ICONS[tool.status] || STATUS_ICONS.pending;
    
    const icon = getToolIcon(tool.name);
    const displayName = tool.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    let inputPreview = '';
    if (tool.input) {
        // Show a brief preview of input
        const inputStr = typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input);
        if (inputStr.length > 60) {
            inputPreview = inputStr.substring(0, 60) + '...';
        } else {
            inputPreview = inputStr;
        }
    }
    
    let resultHtml = '';
    if (tool.status === 'success' && tool.result) {
        const resultStr = typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2);
        if (resultStr.length > 100) {
            resultHtml = `<div class="ai-tool-result"><details><summary>Result</summary><pre>${window.html_encode(resultStr)}</pre></details></div>`;
        } else {
            resultHtml = `<div class="ai-tool-result">${window.html_encode(resultStr)}</div>`;
        }
    } else if (tool.status === 'error' && tool.error) {
        resultHtml = `<div class="ai-tool-error">${window.html_encode(tool.error)}</div>`;
    }
    
    return `
        <div class="ai-tool-card ${statusClass}" data-tool-id="${tool.id}">
            <div class="ai-tool-header">
                <span class="ai-tool-icon">${icon}</span>
                <span class="ai-tool-name">${displayName}</span>
                <span class="ai-tool-status">${statusIcon}</span>
            </div>
            ${inputPreview ? `<div class="ai-tool-input">${window.html_encode(inputPreview)}</div>` : ''}
            ${resultHtml}
        </div>
    `;
}

// Render all tool cards
function renderToolCards() {
    if (currentToolExecutions.length === 0) return '';
    return `<div class="ai-tool-cards">${currentToolExecutions.map(renderToolCard).join('')}</div>`;
}

// Add or update a tool execution
function trackToolExecution(toolId, name, input, status = 'pending', result = null, error = null) {
    const existing = currentToolExecutions.find(t => t.id === toolId);
    if (existing) {
        existing.status = status;
        existing.result = result;
        existing.error = error;
    } else {
        currentToolExecutions.push({ id: toolId, name, input, status, result, error });
    }
}

// Cancel current AI request
function cancelAIRequest() {
    if (currentAIAbortController) {
        currentAIAbortController.abort();
        currentAIAbortController = null;
        currentAIRequestState = 'idle';
        
        // Re-enable input
        const sendBtn = $('.btn-send-ai');
        const chatInput = $('.ai-input');
        sendBtn.prop('disabled', false);
        chatInput.prop('disabled', false);
        
        // Update UI to show cancelled state
        const $streamingMessage = $('.ai-chat-message-ai.ai-streaming');
        if ($streamingMessage.length) {
            $streamingMessage.removeClass('ai-streaming');
            const currentContent = $streamingMessage.html();
            if (!currentContent || currentContent.includes('ai-loading-indicator')) {
                $streamingMessage.html('<span style="color: #9ca3af; font-style: italic;">Request cancelled</span>');
            }
        }
        
        return true;
    }
    return false;
}

// Refresh wallet address from window.user (called on initialization and when panel opens)
function refreshWalletAddress() {
    const oldWallet = currentWalletAddress;
    
    // Try to get from window.user (set by whoami endpoint)
    if (window.user?.wallet_address) {
        currentWalletAddress = window.user.wallet_address;
        
        // If wallet changed, clear old conversation ID (user switched accounts)
        if (oldWallet && oldWallet !== currentWalletAddress) {
            false && console.log('[UIAIChat] Wallet address changed, clearing old conversation ID');
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
    
    // Restore code blocks with enhanced wrapper (language label + copy button)
    codeBlocks.forEach(({ id, lang, code }) => {
        const escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const langClass = lang ? `language-${lang}` : '';
        const langDisplay = lang ? lang.toUpperCase() : 'CODE';
        const copyIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
        const checkIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        
        html = html.replace(id, `
            <div class="ai-code-block">
                <div class="ai-code-header">
                    <span class="ai-code-lang">${langDisplay}</span>
                    <button class="ai-code-copy" title="Copy code" data-copy-icon='${copyIcon}' data-check-icon='${checkIcon}'>
                        ${copyIcon}
                        <span>Copy</span>
                    </button>
                </div>
                <pre><code class="${langClass}">${escapedCode}</code></pre>
            </div>
        `);
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

// In-memory cache of conversations (synced with backend)
let conversationsCache = {};
let conversationsCacheLoaded = false;

// Load all conversations from backend API
async function loadConversationsFromBackend() {
    try {
        const apiOrigin = window.api_origin || window.location.origin;
        const authToken = window.auth_token || localStorage.getItem('puter_auth_token') || localStorage.getItem('auth_token') || '';
        
        // Check if we have auth token - if not, use localStorage only
        if (!authToken) {
            console.warn('[UIAIChat] No auth token available, loading from localStorage only');
            loadFromLocalStorage();
            return conversationsCache;
        }
        
        const response = await fetch(`${apiOrigin}/api/ai/conversations`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load conversations: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.success && Array.isArray(data.result)) {
            // Convert array to object keyed by id
            conversationsCache = {};
            data.result.forEach(conv => {
                conversationsCache[conv.id] = {
                    id: conv.id,
                    title: conv.title,
                    messages: conv.messages || [],
                    createdAt: conv.created_at * 1000,
                    updatedAt: conv.updated_at * 1000
                };
            });
            conversationsCacheLoaded = true;
            console.log(`[UIAIChat] Loaded ${data.result.length} conversations from backend`);
        }
    } catch (e) {
        console.error('[UIAIChat] Failed to load conversations from backend:', e);
        // Fall back to localStorage if backend fails
        loadFromLocalStorage();
    }
    return conversationsCache;
}

// Helper to load from localStorage
function loadFromLocalStorage() {
    try {
        const key = getConversationsKey();
        const localConvs = localStorage.getItem(key);
        if (localConvs) {
            conversationsCache = JSON.parse(localConvs);
            console.log(`[UIAIChat] Loaded ${Object.keys(conversationsCache).length} conversations from localStorage fallback`);
        }
    } catch (le) {
        console.error('[UIAIChat] localStorage fallback also failed:', le);
    }
}

// Get conversations (from cache, loading from backend if needed)
function loadConversations() {
    // Return cached data synchronously for backwards compatibility
    // The cache is populated on init via loadConversationsFromBackend()
    return conversationsCache;
}

// Save a single conversation to backend
async function saveConversationToBackend(convId, conversation) {
    try {
        const apiOrigin = window.api_origin || window.location.origin;
        const authToken = window.auth_token || localStorage.getItem('puter_auth_token') || localStorage.getItem('auth_token') || '';
        
        // Check if conversation exists in cache (update) or is new (create)
        const exists = conversationsCache[convId] && conversationsCacheLoaded;
        const method = exists ? 'PUT' : 'POST';
        const url = exists 
            ? `${apiOrigin}/api/ai/conversations/${convId}`
            : `${apiOrigin}/api/ai/conversations`;
        
        const body = exists
            ? { title: conversation.title, messages: conversation.messages }
            : { id: convId, title: conversation.title, messages: conversation.messages };
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to save conversation: ${response.status} - ${errorText}`);
        }
        
        // Mark cache as loaded after first successful save
        conversationsCacheLoaded = true;
        console.log(`[UIAIChat] Saved conversation ${convId} to backend (${method})`);
    } catch (e) {
        console.error('[UIAIChat] Failed to save conversation to backend:', e);
        // Note: Backend is source of truth, no localStorage backup needed
    }
}

// Delete a conversation from backend
async function deleteConversationFromBackend(convId) {
    try {
        const apiOrigin = window.api_origin || window.location.origin;
        const authToken = window.auth_token || localStorage.getItem('puter_auth_token') || localStorage.getItem('auth_token') || '';
        
        const response = await fetch(`${apiOrigin}/api/ai/conversations/${convId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok && response.status !== 404) {
            throw new Error(`Failed to delete conversation: ${response.status}`);
        }
        
        console.log(`[UIAIChat] Deleted conversation ${convId} from backend`);
    } catch (e) {
        console.error('[UIAIChat] Failed to delete conversation from backend:', e);
    }
}

// Save all conversations (updates cache and syncs to backend)
function saveConversations(conversations) {
    conversationsCache = conversations;
    // Save current conversation to backend (debounced in saveChatHistory)
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
async function clearChatHistoryForCurrentWallet() {
    const wallet = getCurrentWalletAddress();
    if (wallet && wallet !== 'unknown_wallet') {
        // Clear from backend
        try {
            const apiOrigin = window.api_origin || window.location.origin;
            const authToken = window.auth_token || localStorage.getItem('puter_auth_token') || localStorage.getItem('auth_token') || '';
            
            await fetch(`${apiOrigin}/api/ai/conversations`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                }
            });
        } catch (e) {
            console.error('[UIAIChat] Failed to clear conversations from backend:', e);
        }
        
        // Clear local cache
        conversationsCache = {};
        conversationsCacheLoaded = false;
        
        // Clear localStorage backup
        const conversationsKey = getConversationsKey();
        const currentConvKey = getCurrentConversationKey();
        localStorage.removeItem(conversationsKey);
        localStorage.removeItem(currentConvKey);
        
        currentConversationId = null;
        currentWalletAddress = null;
        
        false && console.log('[UIAIChat] Cleared chat history for wallet:', wallet.substring(0, 10) + '...');
    }
}

// Load chat history for current conversation
function loadChatHistory() {
    const convId = getCurrentConversationId();
    if (!convId) return [];
    
    const conversations = loadConversations();
    return conversations[convId]?.messages || [];
}

// Pending save data (for beforeunload)
let pendingSaveConvId = null;
let pendingSaveData = null;

// Save chat history for current conversation
function saveChatHistory(messages) {
    const convId = getCurrentConversationId();
    if (!convId) return;
    
    const conversations = loadConversations();
    const isNew = !conversations[convId];
    
    if (isNew) {
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
    
    // Update local cache
    saveConversations(conversations);
    
    // Store pending save data
    pendingSaveConvId = convId;
    pendingSaveData = conversations[convId];
    
    // Save to backend immediately (no debounce - data is important!)
    saveConversationToBackend(convId, conversations[convId]);
}

// Save pending data before page unload
window.addEventListener('beforeunload', function() {
    if (pendingSaveConvId && pendingSaveData) {
        // Use sendBeacon for reliable save on page close
        const apiOrigin = window.api_origin || window.location.origin;
        const authToken = window.auth_token || localStorage.getItem('puter_auth_token') || localStorage.getItem('auth_token') || '';
        
        const body = JSON.stringify({
            id: pendingSaveConvId,
            title: pendingSaveData.title,
            messages: pendingSaveData.messages
        });
        
        // Try sendBeacon first (most reliable for unload)
        if (navigator.sendBeacon) {
            const blob = new Blob([body], { type: 'application/json' });
            navigator.sendBeacon(`${apiOrigin}/api/ai/conversations/${pendingSaveConvId}?auth_token=${encodeURIComponent(authToken)}`, blob);
            console.log('[UIAIChat] Sent conversation via sendBeacon on unload');
        }
    }
});

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
                <div class="ai-chat-message-ai">${renderMarkdown(contentText)}<div class="ai-copy-actions"><button class="ai-copy-btn" title="Copy response"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy</span></button></div></div>
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
    
    // Delete from backend
    deleteConversationFromBackend(convId);
    
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
    // Chat bubble icon for AI assistant
    const aiButtonSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        <path d="M8 10h.01M12 10h.01M16 10h.01"/>
    </svg>`;
    
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
            h += `<button class="ai-menu-btn" title="Menu" style="background: none; border: none; padding: 2px; cursor: pointer; color: #666; margin-right: auto;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>`;
            h += `<button class="ai-open-window-btn" title="Open in Window" style="background: none; border: none; padding: 2px; cursor: pointer; color: #666; margin-right: 6px; display: flex; align-items: center;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>`;
            h += `<button class="ai-new-chat-btn" title="New Chat" style="background: none; border: none; padding: 2px; cursor: pointer; color: #666; margin-right: 6px; display: flex; align-items: center;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button>`;
            h += `<button class="btn-hide-ai" title="Close" style="background: none; border: none; padding: 2px; cursor: pointer; color: #666; margin-right: 8px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
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
                    h += `<option value="ollama:deepseek-r1:1.5b">Local DeepSeek</option>`;
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
        false && console.log('[UIAIChat] AI config updated, reloading...');
        loadAIConfigForChat();
    });
    
    // Listen for wallet ready event to reload conversations with correct wallet address
    window.addEventListener('particle-wallet.ready', async function(event) {
        console.log('[UIAIChat] Wallet ready, refreshing wallet address and loading conversations...');
        const oldWallet = currentWalletAddress;
        refreshWalletAddress();
        
        // Load conversations from backend for the real wallet
        await loadConversationsFromBackend();
        
        // Migrate conversations from 'unknown_wallet' if we had any
        if (currentWalletAddress && currentWalletAddress !== 'unknown_wallet' && oldWallet === 'unknown_wallet') {
            await migrateConversationsFromUnknownWallet();
        }
        
        // Reload history menu with correct wallet
        updateHistoryMenu();
    });
}

// Migrate conversations from 'unknown_wallet' localStorage to the real wallet's backend
async function migrateConversationsFromUnknownWallet() {
    try {
        const unknownKey = `${CONVERSATIONS_KEY_PREFIX}_unknown_wallet`;
        const unknownConvs = localStorage.getItem(unknownKey);
        
        if (!unknownConvs) {
            console.log('[UIAIChat] No conversations to migrate from unknown_wallet');
            return;
        }
        
        const unknownParsed = JSON.parse(unknownConvs);
        const convIds = Object.keys(unknownParsed);
        
        if (convIds.length === 0) return;
        
        // Reload conversations from backend for the real wallet
        await loadConversationsFromBackend();
        
        // Merge unknown conversations into backend
        let migrated = 0;
        for (const [convId, conv] of Object.entries(unknownParsed)) {
            if (!conversationsCache[convId]) {
                conversationsCache[convId] = conv;
                await saveConversationToBackend(convId, conv);
                migrated++;
            }
        }
        
        if (migrated > 0) {
            console.log(`[UIAIChat] Migrated ${migrated} conversations from unknown_wallet to backend for ${currentWalletAddress}`);
            
            // Clear the unknown_wallet localStorage after successful migration
            localStorage.removeItem(unknownKey);
            localStorage.removeItem(`${CURRENT_CONVERSATION_KEY_PREFIX}_unknown_wallet`);
        }
    } catch (e) {
        console.error('[UIAIChat] Failed to migrate conversations:', e);
    }
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
        
        // Determine default provider and model
        // Priority: Cloud providers (if API keys exist) > User's explicit non-ollama choice > Ollama fallback
        let provider = config.default_provider;
        let model = config.default_model;
        
        // Check if any cloud provider API keys are configured
        const hasCloudProvider = config.api_keys?.claude || config.api_keys?.openai || 
                                  config.api_keys?.gemini || config.api_keys?.xai;
        
        // If user hasn't explicitly chosen a cloud provider but has cloud API keys,
        // OR if no provider/model is set at all, pick the best cloud provider
        const shouldUseCloudDefault = (!provider || provider === 'ollama') && hasCloudProvider;
        
        if (shouldUseCloudDefault || !provider || !model) {
            if (config.api_keys?.claude) {
                // Claude is connected - use Claude 3.5 Sonnet as default
                provider = 'claude';
                model = 'claude-3-5-sonnet-20241022';
            } else if (config.api_keys?.openai) {
                // OpenAI is connected - use GPT-4o as default
                provider = 'openai';
                model = 'gpt-4o';
            } else if (config.api_keys?.gemini) {
                // Gemini is connected - use Gemini 2.0 Flash as default
                provider = 'gemini';
                model = 'gemini-2.0-flash';
            } else if (config.api_keys?.xai) {
                // xAI is connected - use Grok 3 as default
                provider = 'xai';
                model = 'grok-3';
            } else {
                // Fallback to local Ollama/DeepSeek
                provider = provider || 'ollama';
                model = model || 'deepseek-r1:1.5b';
            }
        }
        
        // If model already has a provider prefix (e.g., "ollama:llava:7b"), extract just the model name
        if (model && model.includes(':')) {
            const parts = model.split(':');
            // If it starts with a provider name, remove it
            if (parts[0] === 'ollama' || parts[0] === 'claude' || parts[0] === 'openai' || parts[0] === 'gemini' || parts[0] === 'xai') {
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
                    false && console.log('[UIAIChat] Fixed deprecated Claude model name:', model, '->', cleanModel);
                }
            }
            
            const modelValue = `${provider}:${cleanModel}`;
            
            // Format model name for display (shorten long names)
            function formatModelName(provider, model) {
                if (provider === 'ollama') {
                    if (model.includes('deepseek')) {
                        return 'Local DeepSeek';
                    }
                    // Extract model name without version
                    const name = model.split(':')[0];
                    return `Local ${name.charAt(0).toUpperCase() + name.slice(1)}`;
                }
                if (provider === 'claude') {
                    // "claude-sonnet-4-5-20250929" -> "Claude Sonnet 4.5"
                    if (model.includes('sonnet-4-5')) {
                        return 'Claude Sonnet 4.5';
                    }
                    if (model.includes('sonnet')) {
                        return 'Claude Sonnet';
                    }
                    if (model.includes('opus')) {
                        return 'Claude Opus';
                    }
                    if (model.includes('haiku')) {
                        return 'Claude Haiku';
                    }
                    // Fallback: capitalize and clean
                    return 'Claude ' + model.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                }
                if (provider === 'openai') {
                    // "gpt-4" -> "GPT-4", "gpt-3.5-turbo" -> "GPT-3.5 Turbo"
                    if (model.startsWith('gpt-')) {
                        const parts = model.split('-');
                        if (parts.length >= 2) {
                            const version = parts.slice(1).join(' ');
                            return `GPT-${version.charAt(0).toUpperCase() + version.slice(1)}`;
                        }
                    }
                    return model.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                }
                if (provider === 'gemini') {
                    // "gemini-pro" -> "Gemini Pro"
                    return model.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                }
                if (provider === 'xai') {
                    // "grok-3" -> "Grok 3", "grok-3-fast" -> "Grok 3 Fast"
                    if (model.includes('grok-3-fast')) {
                        return 'Grok 3 Fast';
                    }
                    if (model.includes('grok-3')) {
                        return 'Grok 3';
                    }
                    if (model.includes('grok-2')) {
                        return 'Grok 2';
                    }
                    if (model.includes('grok-vision')) {
                        return 'Grok Vision';
                    }
                    return model.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                }
                // Fallback
                return `${provider.charAt(0).toUpperCase() + provider.slice(1)}: ${model}`;
            }
            
            // Clear existing options and add available models
            $modelSelect.empty();
            
            // Always add local DeepSeek first
            $modelSelect.append(`<option value="ollama:deepseek-r1:1.5b">Local DeepSeek</option>`);
            
            // Add all models for each configured provider
            if (config.api_keys?.claude) {
                $modelSelect.append(`<option disabled>── Claude ──</option>`);
                $modelSelect.append(`<option value="claude:claude-sonnet-4-5-20250929">Claude Sonnet 4.5</option>`);
                $modelSelect.append(`<option value="claude:claude-opus-4-20250514">Claude Opus 4</option>`);
                $modelSelect.append(`<option value="claude:claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>`);
                $modelSelect.append(`<option value="claude:claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>`);
            }
            
            if (config.api_keys?.openai) {
                $modelSelect.append(`<option disabled>── OpenAI ──</option>`);
                $modelSelect.append(`<option value="openai:gpt-4o">GPT-4o</option>`);
                $modelSelect.append(`<option value="openai:gpt-4o-mini">GPT-4o Mini</option>`);
                $modelSelect.append(`<option value="openai:gpt-4-turbo">GPT-4 Turbo</option>`);
                $modelSelect.append(`<option value="openai:gpt-4">GPT-4</option>`);
                $modelSelect.append(`<option value="openai:gpt-3.5-turbo">GPT-3.5 Turbo</option>`);
            }
            
            if (config.api_keys?.gemini) {
                $modelSelect.append(`<option disabled>── Gemini ──</option>`);
                $modelSelect.append(`<option value="gemini:gemini-2.0-flash">Gemini 2.0 Flash</option>`);
                $modelSelect.append(`<option value="gemini:gemini-1.5-pro">Gemini 1.5 Pro</option>`);
                $modelSelect.append(`<option value="gemini:gemini-1.5-flash">Gemini 1.5 Flash</option>`);
                $modelSelect.append(`<option value="gemini:gemini-pro">Gemini Pro</option>`);
            }
            
            if (config.api_keys?.xai) {
                $modelSelect.append(`<option disabled>── xAI ──</option>`);
                $modelSelect.append(`<option value="xai:grok-3">Grok 3</option>`);
                $modelSelect.append(`<option value="xai:grok-3-fast">Grok 3 Fast</option>`);
                $modelSelect.append(`<option value="xai:grok-2">Grok 2</option>`);
                $modelSelect.append(`<option value="xai:grok-vision-beta">Grok Vision</option>`);
            }
            
            // Add separator and "Add Model" option
            $modelSelect.append(`<option disabled>──────────</option>`);
            $modelSelect.append(`<option value="__add_model__">+ Add Model...</option>`);
            
            $modelSelect.val(modelValue);
            
            false && console.log('[UIAIChat] [NEW CODE v2] Updated model selector to:', modelValue, 'display name:', displayName, '(provider:', provider, ', model:', cleanModel, ')');
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
            false && console.log('[UIAIChat] Found PC2 files in event.detail:', originalEvent.detail.items);
            pc2Files = originalEvent.detail.items;
        }
        // Method 2: Check dataTransfer for PC2 files
        else if (originalEvent.dataTransfer && originalEvent.dataTransfer.items && originalEvent.dataTransfer.items.length > 0) {
            try {
                // Use puter.ui.getEntriesFromDataTransferItems to get PC2 files
                const entries = await puter.ui.getEntriesFromDataTransferItems(originalEvent.dataTransfer.items);
                if (entries && entries.length > 0) {
                    false && console.log('[UIAIChat] Found PC2 files via getEntriesFromDataTransferItems:', entries);
                    pc2Files = entries;
                }
            } catch (error) {
                console.warn('[UIAIChat] Failed to get PC2 entries from dataTransfer:', error);
            }
        }
        
        // If we have PC2 files, process them
        if (pc2Files.length > 0) {
            false && console.log('[UIAIChat] Processing', pc2Files.length, 'PC2 filesystem files');
            
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
                false && console.log('[UIAIChat] Signing files:', itemsToSign);
                const signedFiles = await puter.fs.sign(null, itemsToSign);
                const filesArray = Array.isArray(signedFiles.items) ? signedFiles.items : [signedFiles.items];
                
                false && console.log('[UIAIChat] Signed files:', filesArray);
                
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
                        false && console.log('[UIAIChat] ✅ Added file to attachments:', mergedFile.name);
                    }
                });
                
                false && console.log('[UIAIChat] Total attached files:', attachedFiles.length);
                updateAttachedFilesDisplay();
            } catch (error) {
                console.error('[UIAIChat] Failed to process dropped PC2 files:', error);
                alert('Failed to attach files. Please try using the attachment button instead.');
            }
        } else {
            // No PC2 files found - might be local OS files
            false && console.log('[UIAIChat] No PC2 filesystem files detected in drop event');
            // Silently ignore - user needs to upload to PC2 first
        }
    });
}

// Toggle AI panel (clicking toolbar button toggles open/close)
$(document).on('click', '.ai-toolbar-btn, .btn-show-ai', function () {
    const $panel = $('.ai-panel');
    const $btn = $('.ai-toolbar-btn');
    if ($panel.hasClass('ai-panel-open')) {
        // Close panel with smooth animation
        $panel.removeClass('ai-panel-open');
        $btn.removeClass('active');
    } else {
        // Open panel with smooth animation
        // Use requestAnimationFrame to ensure smooth transition
        requestAnimationFrame(() => {
            $panel.addClass('ai-panel-open');
            $btn.addClass('active');
            // Reload AI config when panel opens to sync with settings
            loadAIConfigForChat();
            // Focus input after animation starts
            setTimeout(() => {
                $('.ai-chat-input').focus();
                scrollChatToBottom();
            }, 100);
        });
    }
});

// Stop button click handler - cancel current AI request
$(document).on('click', '.ai-stop-btn', function (e) {
    e.stopPropagation();
    e.preventDefault();
    cancelAIRequest();
});

// Hide AI panel (close button in header)
$(document).on('click', '.btn-hide-ai', function (e) {
    e.stopPropagation(); // Prevent triggering toolbar button click
    
    // Cancel any ongoing AI request when closing panel
    cancelAIRequest();
    
    const $panel = $('.ai-panel');
    const $btn = $('.ai-toolbar-btn');
    // Smooth close animation
    $panel.removeClass('ai-panel-open');
    $btn.removeClass('active');
});

// Send message
$(document).on('click', '.btn-send-ai', function () {
    const $container = $(this).closest('.ai-window-panel, .ai-chat-panel');
    sendAIMessage($container);
});

// Send message on Enter key (Shift+Enter for new line)
$(document).on('keydown', '.ai-chat-input', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const $container = $(this).closest('.ai-window-panel, .ai-chat-panel');
        sendAIMessage($container);
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
            false && console.log('[UIAIChat] file_opened event received:', e);
            false && console.log('[UIAIChat] Event detail:', e.detail);
            
            const selectedFiles = Array.isArray(e.detail) ? e.detail : [e.detail];
            
            if (!selectedFiles || selectedFiles.length === 0) {
                console.warn('[UIAIChat] No files in event detail');
                return;
            }
            
            false && console.log('[UIAIChat] Processing', selectedFiles.length, 'file(s)');
            
            // Sign files to get read URLs
            const itemsToSign = selectedFiles.map(file => ({
                uid: file.uid,
                action: 'read',
                path: file.path
            }));
            
                try {
                    false && console.log('[UIAIChat] Signing files:', itemsToSign);
                    const signedFiles = await puter.fs.sign(null, itemsToSign);
                    const filesArray = Array.isArray(signedFiles.items) ? signedFiles.items : [signedFiles.items];
                    
                    false && console.log('[UIAIChat] Signed files:', filesArray);
                    
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
                            false && console.log('[UIAIChat] ✅ Added file to attachments:', mergedFile.name, 'Type:', mergedFile.type, 'Read URL:', mergedFile.read_url ? 'yes' : 'no', 'Path:', mergedFile.path);
                        } else {
                            false && console.log('[UIAIChat] File already attached, skipping:', file.name || file.path);
                        }
                    });
                    
                    false && console.log('[UIAIChat] Total attached files:', attachedFiles.length);
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
        
        false && console.log('[UIAIChat] Window element found:', windowElement);
        const windowId = $(windowElement).attr('id');
        false && console.log('[UIAIChat] Window ID:', windowId);
        
        // Set up a global listener for file_opened events that checks if it's from our dialog
        const globalFileOpenedHandler = function(e) {
            false && console.log('[UIAIChat] Global file_opened event received:', e);
            const target = e.target;
            
            // Check if this event is from our file dialog window
            if (target && target.id === windowId) {
                false && console.log('[UIAIChat] Event is from our file dialog!');
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
        false && console.log('[UIAIChat] Added global file_opened listeners (all phases)');
        
        // Also set up a MutationObserver to watch for when the window closes
        // This will help us catch files even if the event doesn't fire
        // Only set up observer if windowElement is a valid DOM node
        if (windowElement && windowElement.nodeType === Node.ELEMENT_NODE) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                        const display = $(windowElement).css('display');
                        if (display === 'none') {
                            false && console.log('[UIAIChat] Window closed, checking for selected files...');
                            // Window closed - check if files were selected
                            const selectedEls = $(windowElement).find('.item-selected[data-is_dir="0"]');
                            if (selectedEls.length > 0) {
                                false && console.log('[UIAIChat] Found', selectedEls.length, 'selected files after window closed');
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
                false && console.log('[UIAIChat] Set up MutationObserver to watch window');
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
                false && console.log('[UIAIChat] Signing files:', itemsToSign);
                const signedFiles = await puter.fs.sign(null, itemsToSign);
                const filesArray = Array.isArray(signedFiles.items) ? signedFiles.items : [signedFiles.items];
                
                false && console.log('[UIAIChat] Signed files:', filesArray);
                
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
                        false && console.log('[UIAIChat] ✅ Added file to attachments:', mergedFile.name);
                    }
                });
                
                false && console.log('[UIAIChat] Total attached files:', attachedFiles.length);
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
    
    false && console.log('[UIAIChat] Updating attached files display, count:', attachedFiles.length);
    
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
    
    false && console.log('[UIAIChat] Attached files displayed:', attachedFiles.length);
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
                false && console.log('[UIAIChat] Processing image for OCR:', fileName);
                
                try {
                    // Perform OCR on the image (optional, don't fail if it doesn't work)
                    let ocrResult = { text: '' };
                    try {
                        ocrResult = await performOCR(filePath);
                        false && console.log('[UIAIChat] OCR result:', ocrResult);
                    } catch (ocrError) {
                        console.warn('[UIAIChat] OCR failed (non-fatal):', ocrError);
                        // Continue without OCR text
                    }
                    
                    // Read image from PC2 storage and convert to base64
                    // Use read_url if available (from file attachment), otherwise sign the file
                    let imageData;
                    if (file.read_url) {
                        // Use existing signed URL
                        false && console.log('[UIAIChat] Using existing read_url for image');
                        const response = await fetch(file.read_url);
                        if (!response.ok) {
                            throw new Error(`Failed to fetch image: ${response.statusText}`);
                        }
                        imageData = await response.blob();
                    } else {
                        // Fallback: sign and read the file
                        false && console.log('[UIAIChat] Signing file for image read');
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
                false && console.log('[UIAIChat] Processing PDF for text extraction:', fileName);
                
                try {
                    const pdfText = await extractPDFText(filePath);
                    false && console.log('[UIAIChat] Extracted PDF text length:', pdfText?.length || 0);
                    
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
                false && console.log('[UIAIChat] Processing text file:', fileName, 'Type:', fileType);
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
            false && console.log('[UIAIChat] Using puter.ai.img2txt for OCR');
            const result = await window.puter.ai.img2txt(filePath);
            return { text: result?.text || result || '' };
        } else {
            // Fallback: use drivers/call endpoint
            false && console.log('[UIAIChat] Using drivers/call for OCR');
            
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
            false && console.log('[UIAIChat] Using puter.ai.pdf2txt for PDF extraction');
            const result = await window.puter.ai.pdf2txt(filePath);
            return result?.text || result || '';
        }
        
        // Fallback: use drivers/call endpoint
        false && console.log('[UIAIChat] Using drivers/call for PDF text extraction');
        
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
        false && console.log('[UIAIChat] PDF extraction response:', data);
        
        if (data.success && data.result) {
            const extractedText = data.result.text || data.result || '';
            false && console.log('[UIAIChat] Extracted PDF text length:', extractedText.length);
            return extractedText;
        }
        throw new Error('PDF extraction response missing text');
    } catch (error) {
        console.error('[UIAIChat] PDF extraction error:', error);
        // Try using pdfjs-dist as last resort (if available)
        if (typeof pdfjsLib !== 'undefined') {
            false && console.log('[UIAIChat] Trying pdfjs-dist for PDF extraction');
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

// Flag to skip creating user message (used when resending edited messages)
let skipNextUserMessage = false;
let pendingEditedMessage = null;

// Resend from an edited message (no new user bubble created)
function resendFromEditedMessage(messageContent) {
    // Set flag to skip user message creation
    skipNextUserMessage = true;
    pendingEditedMessage = messageContent;
    
    // Set input and trigger send
    const chatInput = $('.ai-chat-input');
    chatInput.val(messageContent);
    sendAIMessage();
}

// Send AI message function with streaming support
async function sendAIMessage($container) {
    // Use container-scoped selectors if provided, otherwise fall back to global
    const $scope = $container && $container.length ? $container : $(document);
    const chatInput = $scope.find('.ai-chat-input').length ? $scope.find('.ai-chat-input') : $('.ai-chat-input');
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
    
    // Append user message to chat history (skip if resending an edited message)
    const userMessageId = 'msg-user-' + Date.now();
    const isResendingEdit = skipNextUserMessage;
    
    if (!isResendingEdit) {
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
    
    const $messages = $scope.find('.ai-chat-messages').length ? $scope.find('.ai-chat-messages') : $('.ai-chat-messages');
    $messages.append(
        `<div class="ai-chat-message ai-chat-message-user-wrapper" id="${userMessageId}" data-message-id="${userMessageId}">
            <div class="ai-chat-message-user">${messageDisplay}</div>
                <div class="ai-message-footer">
            <div class="ai-message-actions">
                <button class="ai-message-copy" title="Copy message"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                <button class="ai-message-edit" title="Edit message"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                    </div>
            </div>
        </div>`
    );
    }
    
    const $messagesContainer = $scope.find('.ai-chat-messages').length ? $scope.find('.ai-chat-messages') : $('.ai-chat-messages');
    $messagesContainer.addClass('active');
    
    // Add to history only if not resending an edited message
    if (!isResendingEdit) {
    const convId = getCurrentConversationId();
    if (!convId) {
        // Create new conversation if none exists
        const newId = 'conv-' + Date.now();
        setCurrentConversationId(newId);
    }
    addToHistory('user', messageContent, userMessageId, attachedFiles);
    }
    
    // Store last message for retry functionality
    lastUserMessage = chatInputValue;
    lastAttachedFiles = [...attachedFiles]; // Make a copy before clearing
    
    // Clear the chat input, reset height, and clear attachments
    chatInput.val('');
    chatInput[0].style.height = 'auto';
    attachedFiles = [];
    updateAttachedFilesDisplay();
    
    // Disable send button and input while processing
    const sendBtn = $scope.find('.btn-send-ai').length ? $scope.find('.btn-send-ai') : $('.btn-send-ai');
    sendBtn.prop('disabled', true);
    chatInput.prop('disabled', true);
    
    // Get selected model
    const $modelSelect = $scope.find('.ai-model-select').length ? $scope.find('.ai-model-select') : $('.ai-model-select');
    const selectedModel = $modelSelect.val() || 'ollama:deepseek-r1:1.5b';
    
    // Create AI message container for streaming with enhanced loading indicator
    const aiMessageId = 'msg-ai-' + Date.now();
    $messagesContainer.append(
        `<div class="ai-chat-message" id="${aiMessageId}">
            <div class="ai-chat-message-ai ai-streaming">
                <div class="ai-loading-indicator ai-loading-connecting">
                    <div class="ai-loading-grid">
                        <span></span><span></span><span></span>
                        <span></span><span></span><span></span>
                        <span></span><span></span><span></span>
                    </div>
                    <div class="ai-loading-content">
                        <span class="ai-loading-text">Connecting...</span>
                        <span class="ai-loading-detail" style="display: none;"></span>
                    </div>
                    <button class="ai-stop-btn" title="Stop generating">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="4" y="4" width="16" height="16" rx="2"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>`
    );
    scrollChatToBottom();
    
    // Set up AbortController for this request
    currentAIAbortController = new AbortController();
    currentToolExecutions = []; // Reset tool tracking for new message
    knownTotalTools = 0; // Reset known total from backend
    resetProgress(); // Reset progress tracking
    updateLoadingState('connecting');
    
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
            false && console.log('[UIAIChat] Collected', allTools.length, 'tools for AI request (app tools only - backend will add filesystem tools)');
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
    
    // Update user message status to "sent" when request begins
    updateMessageStatus(userMessageId, 'sent');
    
    // Use streaming fetch with AbortController
    fetch('/drivers/call', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': authToken ? `Bearer ${authToken}` : ''
        },
        body: JSON.stringify(requestBody),
        signal: currentAIAbortController?.signal
    }).then(async (res) => {
        // Update to thinking state once connected
        updateLoadingState('thinking');
        // Update user message status to "delivered" when AI is processing
        updateMessageStatus(userMessageId, 'delivered');
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
        let chunkCounter = 0;
        
        const $aiMessage = $(`#${aiMessageId} .ai-chat-message-ai`);
        
        console.log('[UIAIChat] Starting stream read loop...');
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                console.log('[UIAIChat] Stream ended, total chunks received:', chunkCounter);
                break;
            }
            chunkCounter++;
            
            const text = decoder.decode(value, { stream: true });
            buffer += text;
            
            // Log when tool_use chunks arrive
            if (text.includes('tool_use') || text.includes('tool_result')) {
                console.log('[UIAIChat] Chunk #' + chunkCounter + ' contains tool data:', text.substring(0, 100));
            }
            
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
                if (!line.trim()) continue;
                
                try {
                    const chunk = JSON.parse(line);
                    
                    // Debug: log all non-text chunks
                    if (chunk.type !== 'text') {
                        console.log('[UIAIChat] Received chunk type:', chunk.type, chunk);
                    }
                    
                    // Puter's format: {"type": "text", "text": "chunk content"}
                    if (chunk.type === 'text' && chunk.text) {
                        const newText = chunk.text;
                        // Skip if this is the exact same chunk as the last one (duplicate detection)
                        if (newText === lastChunkText && newText.length > 0) {
                            console.warn('[UIAIChat] Skipping duplicate chunk (exact match):', newText.substring(0, 50));
                            continue;
                        }
                        
                        // Skip if the new text is already at the end of fullContent (overlap duplication)
                        // This catches cases where the AI sends "Hello world" then sends "Hello world" again
                        if (fullContent.length > 0 && newText.length > 10) {
                            // Check if fullContent ends with the start of newText
                            const overlapCheck = Math.min(newText.length, fullContent.length);
                            if (fullContent.endsWith(newText.substring(0, overlapCheck))) {
                                console.warn('[UIAIChat] Skipping chunk - overlaps with existing content:', newText.substring(0, 50));
                                continue;
                            }
                            // Check if fullContent already contains this exact text at the end
                            if (fullContent.endsWith(newText)) {
                                console.warn('[UIAIChat] Skipping chunk - already present at end:', newText.substring(0, 50));
                                continue;
                            }
                        }
                        
                        // Skip if this chunk would create a repeated pattern
                        // (e.g., content is "ABC" and newText would make it "ABCABC")
                        if (fullContent.length > 20 && newText.length > 10) {
                            const potentialNew = fullContent + newText;
                            const halfLen = Math.floor(potentialNew.length / 2);
                            const firstHalf = potentialNew.substring(0, halfLen);
                            const secondHalf = potentialNew.substring(halfLen);
                            // Check if adding this text creates duplicate pattern
                            if (firstHalf === secondHalf) {
                                console.warn('[UIAIChat] Skipping chunk that would create duplicate pattern:', newText.substring(0, 50));
                                continue;
                            }
                        }
                        
                        lastChunkText = newText;
                        fullContent += newText;
                        
                        // Check if we're in thinking mode (DeepSeek <think> tags)
                        const parsed = parseThinkingContent(fullContent);
                        if (parsed.isThinking) {
                            updateLoadingState('thinking');
                        } else if (parsed.response) {
                            updateLoadingState('generating');
                        }
                        
                        // Remove loading indicator when first content arrives
                        $aiMessage.removeClass('ai-streaming');
                        // Render with thinking block support
                        $aiMessage.html(renderMessageWithThinking(fullContent, true));
                        scrollChatToBottom();
                    }
                    // Handle tool_use chunks - display feedback cards
                    else if (chunk.type === 'tool_use') {
                        const toolName = chunk.name || 'tool';
                        const toolId = chunk.id || `tool-${Date.now()}`;
                        const toolDisplayName = toolName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                        
                        console.log('[UIAIChat] Received tool_use chunk:', chunk.name, 'step', (chunk.tool_index || 0) + 1, 'of', chunk.total_tools);
                        
                        // Capture total tools from backend if provided
                        if (chunk.total_tools && chunk.total_tools > 0) {
                            knownTotalTools = chunk.total_tools;
                        }
                        
                        // Track tool execution as running FIRST (before progress update)
                        trackToolExecution(toolId, toolName, chunk.input, 'running');
                        
                        // Update loading state
                        updateLoadingState('executing', `Running: ${toolDisplayName}`);
                        
                        // Update progress - count running + completed tools as current step
                        const runningAndCompleted = currentToolExecutions.filter(t => 
                            t.status === 'running' || t.status === 'success' || t.status === 'error'
                        ).length;
                        // Estimate total based on running tools (will adjust as more come in)
                        const estimatedTotal = Math.max(currentToolExecutions.length, 2);
                        updateProgress(runningAndCompleted, estimatedTotal, toolDisplayName);
                        
                        // Update UI with progress bar (tool cards are inside it now)
                        const existingContent = renderMessageWithThinking(fullContent, true);
                        const progressHtml = renderProgressBar();
                        console.log('[UIAIChat] Setting HTML - existingContent length:', existingContent.length, 'progressHtml length:', progressHtml.length);
                        $aiMessage.removeClass('ai-streaming');
                        $aiMessage.html(existingContent + progressHtml);
                        scrollChatToBottom();
                        
                        // Check if tool is from an app (has source metadata)
                        const toolSource = chunk.source;
                        
                        if (toolSource?.appInstanceID) {
                            // App tool - execute via IPC
                            try {
                                const aiToolService = window.services?.get('ai-tool');
                                if (aiToolService) {
                                    const result = await aiToolService.executeTool(
                                        chunk.name,
                                        chunk.input || {},
                                        toolSource
                                    );
                                    trackToolExecution(toolId, toolName, chunk.input, 'success', result);
                                } else {
                                    trackToolExecution(toolId, toolName, chunk.input, 'error', null, 'AIToolService not available');
                                }
                            } catch (error) {
                                trackToolExecution(toolId, toolName, chunk.input, 'error', null, error.message);
                            }
                            // Update UI with result
                            $aiMessage.html(renderMessageWithThinking(fullContent, true) + renderProgressBar());
                            scrollChatToBottom();
                        }
                        // Note: Filesystem tools are handled by backend, we'll get tool_result chunks
                    }
                    // Handle tool_result chunks
                    else if (chunk.type === 'tool_result') {
                        const toolId = chunk.tool_use_id || chunk.id;
                        const tool = currentToolExecutions.find(t => t.id === toolId);
                        if (tool) {
                            if (chunk.is_error || chunk.error) {
                                trackToolExecution(toolId, tool.name, tool.input, 'error', null, chunk.content || chunk.error);
                        } else {
                                trackToolExecution(toolId, tool.name, tool.input, 'success', chunk.content || chunk.result);
                            }
                            
                            // Update progress
                            const completedTools = currentToolExecutions.filter(t => t.status === 'success' || t.status === 'error').length;
                            if (currentToolExecutions.length > 1) {
                                updateProgress(completedTools, currentToolExecutions.length);
                            }
                            
                            // Update UI with result
                            $aiMessage.html(renderMessageWithThinking(fullContent, true) + renderProgressBar());
                            scrollChatToBottom();
                        }
                        // Return to thinking state after tool completes
                        updateLoadingState('thinking');
                    }
                    // Handle status chunks (new enhanced protocol)
                    else if (chunk.type === 'status') {
                        const status = chunk.status || 'thinking';
                        console.log('[UIAIChat] Received status chunk:', status);
                        updateLoadingState(status);
                    }
                    // Handle reasoning chunks (DeepSeek thinking, parsed on backend)
                    else if (chunk.type === 'reasoning') {
                        const reasoningContent = chunk.content || '';
                        console.log('[UIAIChat] Received reasoning chunk, length:', reasoningContent.length);
                        // Wrap in <think> tags for frontend parser compatibility
                        fullContent += `<think>${reasoningContent}</think>`;
                        updateLoadingState('thinking');
                        $aiMessage.removeClass('ai-streaming');
                        $aiMessage.html(renderMessageWithThinking(fullContent, true));
                        scrollChatToBottom();
                    }
                    // Handle final_response_start - clear previous content to avoid duplication
                    else if (chunk.type === 'final_response_start') {
                        console.log('[UIAIChat] Final response starting - clearing previous text content');
                        // Clear the text content but keep tool executions
                        fullContent = '';
                        lastChunkText = '';
                    }
                    // Handle done chunks (stream complete with usage stats)
                    else if (chunk.type === 'done') {
                        console.log('[UIAIChat] Stream done, usage:', chunk.usage);
                        // Could display token usage if desired
                        // For now, just log it
                    }
                    // Handle errors
                    else if (chunk.type === 'error') {
                        console.error('[UIAIChat] Stream error:', chunk.message || chunk.error || chunk);
                        const streamError = {
                            message: chunk.message || chunk.error || JSON.stringify(chunk),
                            status: chunk.status || 500,
                            type: 'stream_error'
                        };
                        $aiMessage.html(renderErrorCard(streamError, aiMessageId));
                        fullContent = streamError.message; // Set content so it doesn't show generic error
                    }
                    // Log any other chunk types for debugging
                    else {
                        false && console.log('[UIAIChat] Received chunk with type:', chunk.type, chunk);
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
        // Update progress to 100% for final render
        if (currentToolExecutions.length > 0) {
            updateProgress(currentToolExecutions.length, currentToolExecutions.length);
        }
        if (fullContent || currentToolExecutions.length > 0) {
            // Final render with thinking block and collapsible progress bar (contains tool cards)
            const finalContent = renderMessageWithThinking(fullContent || '', false) + renderProgressBar();
            $aiMessage.html(finalContent);
        if (fullContent) {
            addToHistory('assistant', fullContent);
            updateHistoryMenu();
            }
        } else if ($aiMessage.text().trim()) {
            // If we have content in the message but fullContent is empty (edge case)
            const existingContent = $aiMessage.text();
            addToHistory('assistant', existingContent);
            updateHistoryMenu();
        } else {
            console.error('[UIAIChat] Stream completed but no content received. Full buffer:', buffer);
            $aiMessage.html('I received your message, but I\'m having trouble responding right now. Please check the console for details.');
        }
        
        // Apply syntax highlighting to any code blocks
        applyCodeHighlighting();
        
        // Add copy button INSIDE the ai-chat-message-ai div (after streaming complete)
        if ($aiMessage.find('.ai-copy-actions').length === 0) {
            $aiMessage.append(`
                <div class="ai-copy-actions">
                    <button class="ai-copy-btn" title="Copy response"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy</span></button>
                </div>
            `);
        }
        
        scrollChatToBottom();
    }).catch(function (error) {
        // Remove streaming indicator
        $(`#${aiMessageId} .ai-chat-message-ai`).removeClass('ai-streaming');
        
        // Update user message status to error
        updateMessageStatus(userMessageId, 'error');
        
        // Handle abort errors (user cancelled)
        if (error.name === 'AbortError') {
            console.log('[UIAIChat] Request was cancelled by user');
            // For cancelled requests, keep delivered status (not an error)
            updateMessageStatus(userMessageId, 'delivered');
            $(`#${aiMessageId} .ai-chat-message-ai`).html('<span style="color: #9ca3af; font-style: italic;">Request cancelled</span>');
            scrollChatToBottom();
            return;
        }
        
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
        
        // Show enhanced error card with retry button and suggestions
        const errorCard = renderErrorCard(error, aiMessageId);
        $(`#${aiMessageId} .ai-chat-message-ai`).html(errorCard);
        scrollChatToBottom();
    }).finally(function () {
        // Clean up AbortController and reset state
        currentAIAbortController = null;
        currentAIRequestState = 'idle';
        
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

// Copy message to clipboard (works for both user and assistant messages)
$(document).on('click', '.ai-message-copy', function (e) {
    e.stopPropagation();
    const $btn = $(this);
    let messageText = '';
    
    // Check if this is a user message or assistant message
    const $userWrapper = $btn.closest('.ai-chat-message-user-wrapper');
    const $assistantWrapper = $btn.closest('.ai-chat-message');
    
    if ($userWrapper.length) {
        // User message
        messageText = $userWrapper.find('.ai-chat-message-user').text();
    } else if ($assistantWrapper.length) {
        // Assistant message - get text content only (strips HTML)
        messageText = $assistantWrapper.find('.ai-chat-message-ai').text();
    }
    
    if (!messageText) return;
    
    navigator.clipboard.writeText(messageText).then(() => {
        // Visual feedback - show checkmark
        const originalHtml = $btn.html();
        $btn.html('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>');
        setTimeout(() => {
            $btn.html(originalHtml);
        }, 1000);
    }).catch(err => {
        console.error('[UIAIChat] Failed to copy message:', err);
    });
});

// Copy AI response to clipboard (new button inside message)
$(document).on('click', '.ai-copy-btn', function (e) {
    e.stopPropagation();
    const $btn = $(this);
    const $messageAi = $btn.closest('.ai-chat-message-ai');
    
    // Get text content, excluding the copy button itself
    const $clone = $messageAi.clone();
    $clone.find('.ai-copy-actions').remove();
    const messageText = $clone.text().trim();
    
    if (!messageText) return;
    
    navigator.clipboard.writeText(messageText).then(() => {
        // Visual feedback - show "Copied!"
        const originalHtml = $btn.html();
        $btn.html('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>Copied!</span>');
        setTimeout(() => {
            $btn.html(originalHtml);
        }, 1500);
    }).catch(err => {
        console.error('[UIAIChat] Failed to copy AI response:', err);
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
        
        // Clear history after this message and update the edited message
        updatedHistory[messageIndex].content = editedText;
        saveChatHistory(updatedHistory);
        
        // Resend the edited message WITHOUT creating a new user bubble
        // We pass skipUserMessage=true to avoid duplicate
        resendFromEditedMessage(editedText);
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

// Error retry button handler
$(document).on('click', '.ai-error-retry-btn', function (e) {
    e.stopPropagation();
    const $errorCard = $(this).closest('.ai-error-card');
    const messageId = $errorCard.data('message-id');
    
    // If we have a stored last message, use it to retry
    if (lastUserMessage || lastAttachedFiles.length > 0) {
        // Remove the AI message with error
        $(`#${messageId}`).closest('.ai-chat-message-ai-wrapper').remove();
        
        // Restore the message to input and resend
        const chatInput = $('.ai-chat-input');
        chatInput.val(lastUserMessage || '');
        attachedFiles = [...lastAttachedFiles];
        updateAttachedFilesDisplay();
        
        // Trigger send
        sendAIMessage();
    } else {
        // Fallback: just show a message that retry is not available
        console.warn('[UIAIChat] No message to retry');
        $errorCard.find('.ai-error-message').text('Unable to retry - original message not available. Please type your message again.');
    }
});

// Error dismiss button handler
$(document).on('click', '.ai-error-dismiss-btn', function (e) {
    e.stopPropagation();
    const $errorCard = $(this).closest('.ai-error-card');
    const messageId = $errorCard.data('message-id');
    
    // Fade out and remove the AI message with error
    const $messageWrapper = $(`#${messageId}`).closest('.ai-chat-message-ai-wrapper');
    $messageWrapper.fadeOut(200, function() {
        $(this).remove();
    });
});

// Model selector change handler - open settings when "Add Model" is selected
$(document).on('change', '.ai-model-select', function (e) {
    const selectedValue = $(this).val();
    if (selectedValue === '__add_model__') {
        // Reset to first option (don't stay on "Add Model")
        $(this).val($(this).find('option:first').val());
        
        // Open settings to AI tab with high z-index to appear above AI panel
        UIWindowSettings({ 
            tab: 'ai',
            window_options: {
                stay_on_top: true
            }
        });
    }
});

// Code block copy button handler
$(document).on('click', '.ai-code-copy', function (e) {
    e.stopPropagation();
    const $btn = $(this);
    const $codeBlock = $btn.closest('.ai-code-block');
    const code = $codeBlock.find('code').text();
    
    navigator.clipboard.writeText(code).then(() => {
        // Visual feedback - show checkmark
        const copyIcon = $btn.data('copy-icon');
        const checkIcon = $btn.data('check-icon');
        $btn.html(checkIcon + '<span>Copied</span>');
        $btn.addClass('ai-code-copied');
        
        setTimeout(() => {
            $btn.html(copyIcon + '<span>Copy</span>');
            $btn.removeClass('ai-code-copied');
        }, 2000);
    }).catch(err => {
        console.error('[UIAIChat] Failed to copy code:', err);
    });
});

// Apply syntax highlighting to code blocks
function applyCodeHighlighting() {
    if (typeof hljs !== 'undefined') {
        document.querySelectorAll('.ai-chat-message-ai pre code:not(.hljs)').forEach((block) => {
            hljs.highlightElement(block);
        });
    }
}

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
async function initializeHistoryMenu() {
    // Load conversations from backend first
    await loadConversationsFromBackend();
    
    // Migrate any localStorage conversations to backend (one-time migration)
    await migrateLocalStorageToBackend();
    
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

// One-time migration from localStorage to backend
async function migrateLocalStorageToBackend() {
    try {
        const key = getConversationsKey();
        const localConvs = localStorage.getItem(key);
        
        if (!localConvs) return;
        
        const parsed = JSON.parse(localConvs);
        const convIds = Object.keys(parsed);
        
        if (convIds.length === 0) return;
        
        console.log(`[UIAIChat] Found ${convIds.length} conversations in localStorage to migrate`);
        
        // Migrate all conversations from localStorage to backend
        let migratedCount = 0;
        let failedCount = 0;
        
        for (const convId of convIds) {
            // Always migrate from localStorage if not already in backend
            if (!conversationsCache[convId]) {
                const conv = parsed[convId];
                conversationsCache[convId] = conv;
                
                try {
                    await saveConversationToBackend(convId, conv);
                    migratedCount++;
                } catch (saveError) {
                    console.error(`[UIAIChat] Failed to save conversation ${convId} to backend:`, saveError);
                    failedCount++;
                }
            }
        }
        
        if (migratedCount > 0) {
            console.log(`[UIAIChat] Successfully migrated ${migratedCount} conversations from localStorage to backend`);
        }
        
        // Only clear localStorage if ALL migrations succeeded
        if (failedCount === 0 && migratedCount > 0) {
            // Keep a backup in a different key just in case
            localStorage.setItem(`${key}_backup_${Date.now()}`, localConvs);
            localStorage.removeItem(key);
            console.log('[UIAIChat] Cleared localStorage after successful migration (backup saved)');
        } else if (failedCount > 0) {
            console.warn(`[UIAIChat] ${failedCount} conversations failed to migrate - keeping localStorage data`);
        }
    } catch (e) {
        console.error('[UIAIChat] Failed to migrate localStorage to backend:', e);
        // Don't clear localStorage on error - keep the data safe
    }
}

// Open in Window button handler - opens AI Chat as a standalone window
$(document).on('click', '.ai-open-window-btn', async function (e) {
    e.stopPropagation();
    
    // Open the AI Chat window (statically imported to ensure jQuery plugins are available)
    await UIWindowAIChat();
    
    // Optionally close the sidebar when opening window
    const $panel = $('.ai-panel');
    const $btn = $('.ai-toolbar-btn');
    $panel.removeClass('ai-panel-open');
    $btn.removeClass('active');
});

/**
 * Initialize AI Chat in a window context
 * Called by UIWindowAIChat to set up the windowed version
 * @param {HTMLElement} container - The container element for the AI chat
 */
export function initAIChatWindow(container) {
    const $container = $(container);
    const $panel = $container.find('.ai-window-panel');
    
    // Initialize wallet address
    refreshWalletAddress();
    
    // Setup auto-resize for textarea in this container
    $container.on('input', '.ai-chat-input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    });
    
    // Load user's AI config and update model selector in this window
    loadAIConfigForChat();
    
    // Initialize history menu for this window
    (async () => {
        await loadConversationsFromBackend();
        updateHistoryMenuInContainer($container);
        
        // Load current conversation if it exists
        const currentId = getCurrentConversationId();
        if (currentId) {
            const conversations = loadConversations();
            if (conversations[currentId]) {
                loadConversationInContainer(currentId, $container);
            }
        }
    })();
    
    // Mark as window context
    $container.attr('data-context', 'window');
    
    console.log('[UIAIChat] Initialized AI Chat in window context');
}

// Helper: Update history menu in a specific container
function updateHistoryMenuInContainer($container) {
    const $historyList = $container.find('.ai-history-list');
    if ($historyList.length === 0) return;
    
    const conversations = loadConversations();
    const currentId = getCurrentConversationId();
    
    $historyList.empty();
    
    // Sort by last updated (most recent first)
    const sortedConvs = Object.entries(conversations)
        .sort((a, b) => (b[1].lastUpdated || 0) - (a[1].lastUpdated || 0));
    
    if (sortedConvs.length === 0) {
        $historyList.html('<div class="ai-history-empty">No conversations yet</div>');
        return;
    }
    
    for (const [convId, conv] of sortedConvs) {
        const isActive = convId === currentId;
        const title = conv.title || 'New Chat';
        const truncatedTitle = title.length > 30 ? title.substring(0, 30) + '...' : title;
        
        const itemHtml = `
            <div class="ai-history-item ${isActive ? 'active' : ''}" data-conv-id="${convId}">
                <span class="ai-history-item-title">${window.html_encode(truncatedTitle)}</span>
                <button class="ai-history-item-delete" data-conv-id="${convId}" title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        `;
        $historyList.append(itemHtml);
    }
}

// Helper: Load conversation in a specific container
function loadConversationInContainer(convId, $container) {
    const conversations = loadConversations();
    const conv = conversations[convId];
    if (!conv) return;
    
    currentConversationId = convId;
    saveCurrentConversationId(convId);
    
    // Clear messages in this container
    const $messages = $container.find('.ai-chat-messages');
    $messages.empty();
    
    // Render messages
    if (conv.messages && conv.messages.length > 0) {
        for (const msg of conv.messages) {
            if (msg.role === 'user') {
                const attachedFilesHtml = msg.attachedFiles && msg.attachedFiles.length > 0
                    ? `<div class="ai-message-attachments">${msg.attachedFiles.map(f => 
                        `<span class="ai-message-attachment">${window.html_encode(f.name || f.path?.split('/').pop() || 'file')}</span>`
                      ).join('')}</div>`
                    : '';
                
                $messages.append(`
                    <div class="ai-chat-message-user-wrapper" data-message-id="${msg.messageId || 'msg-' + Date.now()}">
                        <div class="ai-chat-message-user">${window.html_encode(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content))}</div>
                        ${attachedFilesHtml}
                        <div class="ai-message-actions">
                            <button class="ai-message-copy" title="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                            <button class="ai-message-edit" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                            <button class="ai-message-delete" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                        </div>
                    </div>
                `);
            } else if (msg.role === 'assistant') {
                const renderedContent = renderMessageWithThinking(msg.content);
                $messages.append(`
                    <div class="ai-chat-message-ai-wrapper">
                        <div class="ai-chat-message ai-chat-message-ai" id="${msg.messageId || 'ai-msg-' + Date.now()}">${renderedContent}
                            <div class="ai-copy-actions">
                                <button class="ai-copy-btn" title="Copy response">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `);
            }
        }
    }
    
    // Scroll to bottom
    $messages.scrollTop($messages[0]?.scrollHeight || 0);
    
    // Update history menu to show active item
    updateHistoryMenuInContainer($container);
}
