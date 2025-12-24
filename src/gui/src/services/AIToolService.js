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

import { Service } from '../definitions.js';

/**
 * AIToolService - Collects tools from apps via IPC and merges with backend tools
 * 
 * This service implements Puter's proven IPC tool collection pattern:
 * 1. Request tools from all open apps
 * 2. Wait for responses
 * 3. Merge with backend filesystem tools
 * 4. Return combined tool list for AI service
 * 
 * Based on Puter's IPC system in src/puter-js/src/index.js
 */
export class AIToolService extends Service {
    // Cache of tools by app instance ID
    #toolCache = new Map(); // appInstanceID -> tools[]
    
    // Pending tool requests
    #pendingRequests = new Map(); // requestId -> { resolve, reject, timeout }

    async _init() {
        // Listen for tool responses from apps
        // Apps respond with { $: 'providedTools', tools: [...], requestId: '...' }
        window.addEventListener('message', (event) => {
            // Only process messages from app iframes
            if (event.data && event.data.$ === 'providedTools') {
                this.#handleToolResponse(event);
            }
        });
    }

    /**
     * Collect all tools from open apps and merge with backend filesystem tools
     * 
     * @param {Function} getFilesystemTools - Callback to get backend filesystem tools
     * @returns {Promise<Array>} Combined tool list
     */
    async collectAllTools(getFilesystemTools) {
        console.log('[AIToolService] Collecting tools from all sources...');
        
        // Step 1: Request tools from all open apps
        const appWindows = this.#getOpenAppWindows();
        console.log('[AIToolService] Found', appWindows.length, 'open app windows');
        
        const toolPromises = [];
        for (const { iframe, appInstanceID } of appWindows) {
            const promise = this.#requestToolsFromApp(iframe, appInstanceID);
            toolPromises.push(promise);
        }

        // Step 2: Wait for all app responses (with timeout)
        let appTools = [];
        try {
            const responses = await Promise.allSettled(toolPromises);
            appTools = responses
                .filter(r => r.status === 'fulfilled' && r.value)
                .flatMap(r => r.value);
            console.log('[AIToolService] Collected', appTools.length, 'tools from apps');
        } catch (error) {
            console.warn('[AIToolService] Error collecting app tools:', error);
        }

        // Step 3: Get backend filesystem tools
        let filesystemTools = [];
        try {
            filesystemTools = await getFilesystemTools();
            console.log('[AIToolService] Got', filesystemTools.length, 'filesystem tools from backend');
        } catch (error) {
            console.warn('[AIToolService] Error getting filesystem tools:', error);
        }

        // Step 4: Merge and deduplicate
        const allTools = this.#mergeTools([...appTools, ...filesystemTools]);

        console.log('[AIToolService] Final tool collection:', {
            appTools: appTools.length,
            filesystemTools: filesystemTools.length,
            total: allTools.length
        });

        return allTools;
    }

    /**
     * Request tools from a specific app window
     * 
     * @param {HTMLIFrameElement} iframe - The app's iframe element
     * @param {string} appInstanceID - The app instance ID
     * @returns {Promise<Array>} Array of tools from the app
     */
    #requestToolsFromApp(iframe, appInstanceID) {
        return new Promise((resolve, reject) => {
            const requestId = `${appInstanceID}-${Date.now()}-${Math.random()}`;
            const timeout = setTimeout(() => {
                this.#pendingRequests.delete(requestId);
                console.warn(`[AIToolService] Timeout waiting for tools from app ${appInstanceID}`);
                resolve([]); // Resolve with empty array instead of rejecting
            }, 5000); // 5 second timeout

            // Store promise resolvers
            this.#pendingRequests.set(requestId, {
                resolve: (tools) => {
                    clearTimeout(timeout);
                    this.#pendingRequests.delete(requestId);
                    resolve(tools || []);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    this.#pendingRequests.delete(requestId);
                    reject(error);
                },
                timeout
            });

            // Send request to app
            try {
                iframe.contentWindow.postMessage({
                    $: 'requestTools',
                    requestId,
                }, '*');
                console.log(`[AIToolService] Sent tool request to app ${appInstanceID}, requestId: ${requestId}`);
            } catch (error) {
                clearTimeout(timeout);
                this.#pendingRequests.delete(requestId);
                console.error(`[AIToolService] Error sending tool request to app ${appInstanceID}:`, error);
                resolve([]); // Resolve with empty array on error
            }
        });
    }

    /**
     * Handle tool response from app
     * 
     * @param {MessageEvent} event - The message event from the app
     */
    #handleToolResponse(event) {
        const { tools, requestId } = event.data;
        
        if (!requestId) {
            // Legacy format - no requestId, just tools
            // This can happen if app responds immediately
            console.warn('[AIToolService] Received tool response without requestId');
            return;
        }

        const pending = this.#pendingRequests.get(requestId);
        if (pending) {
            console.log(`[AIToolService] Received tool response for requestId ${requestId}, tools:`, tools?.length || 0);
            pending.resolve(tools || []);
        } else {
            console.warn(`[AIToolService] Received tool response for unknown requestId: ${requestId}`);
        }
    }

    /**
     * Get all open app windows that use Puter SDK
     * 
     * @returns {Array<{iframe: HTMLIFrameElement, appInstanceID: string}>} Array of app windows
     */
    #getOpenAppWindows() {
        const windows = [];
        $('.window-app-iframe[data-appUsesSDK=true]').each((_, iframe) => {
            const $window = $(iframe).closest('.window');
            const appInstanceID = $window.attr('data-element_uuid');
            if (appInstanceID && iframe.contentWindow) {
                windows.push({ iframe, appInstanceID });
            }
        });
        return windows;
    }

    /**
     * Merge tools and deduplicate by name
     * Filesystem tools take precedence over app tools with the same name
     * 
     * @param {Array} tools - Array of tools to merge
     * @returns {Array} Merged and deduplicated tools
     */
    #mergeTools(tools) {
        const toolMap = new Map();
        
        for (const tool of tools) {
            const toolName = tool.function?.name || tool.name;
            if (toolName) {
                // Keep first occurrence (filesystem tools are added first, so they take precedence)
                if (!toolMap.has(toolName)) {
                    toolMap.set(toolName, tool);
                } else {
                    console.warn(`[AIToolService] Duplicate tool name detected: ${toolName}, keeping first occurrence`);
                }
            } else {
                console.warn('[AIToolService] Tool missing name, skipping:', tool);
            }
        }
        
        return Array.from(toolMap.values());
    }

    /**
     * Execute a tool call (route to correct app or backend)
     * 
     * @param {string} toolName - Name of the tool to execute
     * @param {Object} parameters - Tool parameters
     * @param {Object} toolSource - Source information { appInstanceID: string } or null
     * @returns {Promise<any>} Tool execution result
     */
    async executeTool(toolName, parameters, toolSource) {
        // If tool is from an app, route via IPC
        if (toolSource?.appInstanceID) {
            return await this.#executeAppTool(toolSource.appInstanceID, toolName, parameters);
        }
        
        // Otherwise, it's a filesystem tool - backend handles it
        // (This is already handled by backend)
        throw new Error(`Tool ${toolName} execution should be handled by backend`);
    }

    /**
     * Execute tool in app via IPC
     * 
     * @param {string} appInstanceID - The app instance ID
     * @param {string} toolName - Name of the tool to execute
     * @param {Object} parameters - Tool parameters
     * @returns {Promise<any>} Tool execution result
     */
    #executeAppTool(appInstanceID, toolName, parameters) {
        return new Promise((resolve, reject) => {
            const tag = `tool-${Date.now()}-${Math.random()}`;
            const timeout = setTimeout(() => {
                window.removeEventListener('message', handler);
                reject(new Error(`Timeout executing tool ${toolName} in app ${appInstanceID}`));
            }, 30000); // 30 second timeout

            const handler = (event) => {
                if (event.data.$ === 'toolResponse' && event.data.tag === tag) {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    console.log(`[AIToolService] Tool execution result from app ${appInstanceID}:`, event.data.response);
                    resolve(event.data.response);
                }
            };

            window.addEventListener('message', handler);

            // Find app window and send execute message
            const $window = $(`.window[data-element_uuid="${appInstanceID}"]`);
            const iframe = $window.find('.window-app-iframe[data-appUsesSDK=true]').get(0);
            
            if (!iframe || !iframe.contentWindow) {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                reject(new Error(`App ${appInstanceID} window not found`));
                return;
            }

            console.log(`[AIToolService] Executing tool ${toolName} in app ${appInstanceID} with parameters:`, parameters);
            
            try {
                iframe.contentWindow.postMessage({
                    $: 'executeTool',
                    toolName,
                    parameters,
                    tag,
                }, '*');
            } catch (error) {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                reject(new Error(`Error sending tool execution message: ${error.message}`));
            }
        });
    }
}

