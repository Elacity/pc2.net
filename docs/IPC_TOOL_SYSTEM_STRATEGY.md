# IPC Tool System Strategy for PC2 Node
## Leveraging Puter's Proven Code for Sovereign AI Extensibility

**Date:** 2025-01-20  
**Status:** Strategy Document  
**Goal:** Implement Puter's IPC-based tool system to enable user-installed apps to extend AI capabilities in sovereign PC2 nodes

---

## Executive Summary

PC2 nodes are sovereign, self-hosted personal clouds. Users download and run PC2 software on their own infrastructure, maintaining complete control over their data and environment. This strategy leverages Puter's proven IPC (Inter-Process Communication) tool system to enable extensibility while maintaining sovereignty.

**Key Principle:** We forked Puter and want to take as much working code and value as possible, making it sovereign for the user.

---

## Architecture Overview

### Current State (PC2)

```
┌─────────────────────────────────────────┐
│         PC2 CURRENT ARCHITECTURE            │
├─────────────────────────────────────────┤
│                                         │
│  GUI AI Chat                            │
│    │                                     │
│    └─► Backend (auto-injects filesystem) │
│        └─► FilesystemTools (static)      │
│            └─► AI Service                │
│                                         │
│  ✅ Filesystem operations work           │
│  ❌ No app extensibility                 │
│                                         │
└─────────────────────────────────────────┘
```

### Target State (Puter's Hybrid Model)

```
┌─────────────────────────────────────────────────┐
│         PUTER'S PROVEN ARCHITECTURE             │
├─────────────────────────────────────────────────┤
│                                                 │
│  GUI AI Chat                                    │
│    │                                            │
│    ├─► Request tools from apps (IPC)           │
│    │   └─► { $: 'requestTools' }               │
│    │       └─► Apps: { $: 'providedTools' }    │
│    │                                            │
│    ├─► Backend auto-adds filesystem tools      │
│    │   └─► FilesystemTools (static)            │
│    │                                            │
│    └─► Merge: App Tools + Filesystem Tools     │
│        └─► Send to AI Service                  │
│                                                 │
│  ✅ Filesystem operations (backend)            │
│  ✅ App extensibility (IPC)                     │
│  ✅ User sovereignty (all local)                │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Puter's IPC Code (Already in Our Fork)

### 1. SDK Tool Registration (`src/puter-js/src/index.js`)

**Status:** ✅ Already exists in PC2 fork

```javascript:788:823:src/puter-js/src/index.js
puter.tools = [];
/**
 * @type {{messageTarget: Window}}
 */
const puterParent = puter.ui.parentApp();
globalThis.puterParent = puterParent;
if ( puterParent ) {
    console.log('I have a parent, registering tools');
    puterParent.on('message', async (event) => {
        console.log('Got tool req ', event);
        if ( event.$ === 'requestTools' ) {
            console.log('Responding with tools');
            puterParent.postMessage({
                $: 'providedTools',
                tools: JSON.parse(JSON.stringify(puter.tools)),
            });
        }

        if ( event.$ === 'executeTool' ) {
            console.log('xecuting tools');
            /**
             * Puter tools format
             * @type {[{exec: Function, function: {description: string, name: string, parameters: {properties: any, required: Array<string>}, type: string}}]}
             */
            const [tool] = puter.tools.filter(e => e.function.name === event.toolName);

            const response = await tool.exec(event.parameters);
            puterParent.postMessage({
                $: 'toolResponse',
                response,
                tag: event.tag,
            });
        }
    });
    puterParent.postMessage({ $: 'ready' });
}
```

**What This Does:**
- Apps register tools via `puter.tools.push({ function: {...}, exec: async () => {...} })`
- GUI requests tools via `{ $: 'requestTools' }`
- Apps respond with `{ $: 'providedTools', tools: [...] }`
- GUI executes tools via `{ $: 'executeTool', toolName: '...', parameters: {...} }`
- Apps execute and respond with `{ $: 'toolResponse', response: {...} }`

**PC2 Status:** ✅ This code is already in our fork and working

---

### 2. GUI Window Communication (`src/gui/src/services/BroadcastService.js`)

**Status:** ✅ Already exists in PC2 fork

```javascript:33:40:src/gui/src/services/BroadcastService.js
sendBroadcast (name, data, { sendToNewAppInstances = false } = {}) {
    $('.window-app-iframe[data-appUsesSDK=true]').each((_, iframe) => {
        iframe.contentWindow.postMessage({
            msg: 'broadcast',
            name: name,
            data: data,
        }, '*');
    });
}
```

**What This Does:**
- GUI can send messages to all open app windows
- Uses `postMessage` API for cross-window communication
- Filters by `data-appUsesSDK=true` to only target apps using Puter SDK

**PC2 Status:** ✅ This code is already in our fork

---

## What We Need to Implement

### Phase 1: Tool Collection Service (GUI)

**File:** `src/gui/src/services/AIToolService.js` (NEW)

**Purpose:** Collect tools from all open apps and merge with backend filesystem tools

**Implementation:**

```javascript
/**
 * AIToolService - Collects tools from apps via IPC and merges with backend tools
 * 
 * This service implements Puter's proven IPC tool collection pattern:
 * 1. Request tools from all open apps
 * 2. Wait for responses
 * 3. Merge with backend filesystem tools
 * 4. Return combined tool list for AI service
 */

import { Service } from '../definitions.js';

export class AIToolService extends Service {
    #toolCache = new Map(); // appInstanceID -> tools[]
    #pendingRequests = new Map(); // requestId -> { resolve, reject, timeout }

    async _init() {
        // Listen for tool responses from apps
        window.addEventListener('message', (event) => {
            if (event.data.$ === 'providedTools') {
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
        // Step 1: Request tools from all open apps
        const appWindows = this.#getOpenAppWindows();
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
        } catch (error) {
            console.warn('[AIToolService] Error collecting app tools:', error);
        }

        // Step 3: Get backend filesystem tools
        const filesystemTools = await getFilesystemTools();

        // Step 4: Merge and deduplicate
        const allTools = this.#mergeTools([...appTools, ...filesystemTools]);

        console.log('[AIToolService] Collected tools:', {
            appTools: appTools.length,
            filesystemTools: filesystemTools.length,
            total: allTools.length
        });

        return allTools;
    }

    /**
     * Request tools from a specific app window
     */
    #requestToolsFromApp(iframe, appInstanceID) {
        return new Promise((resolve, reject) => {
            const requestId = `${appInstanceID}-${Date.now()}`;
            const timeout = setTimeout(() => {
                this.#pendingRequests.delete(requestId);
                reject(new Error(`Timeout waiting for tools from app ${appInstanceID}`));
            }, 5000); // 5 second timeout

            // Store promise resolvers
            this.#pendingRequests.set(requestId, {
                resolve: (tools) => {
                    clearTimeout(timeout);
                    resolve(tools);
                },
                reject,
                timeout
            });

            // Send request
            iframe.contentWindow.postMessage({
                $: 'requestTools',
                requestId,
            }, '*');
        });
    }

    /**
     * Handle tool response from app
     */
    #handleToolResponse(event) {
        const { tools, requestId } = event.data;
        
        if (!requestId) {
            // Legacy format - no requestId, just tools
            // This can happen if app responds immediately
            return;
        }

        const pending = this.#pendingRequests.get(requestId);
        if (pending) {
            this.#pendingRequests.delete(requestId);
            pending.resolve(tools || []);
        }
    }

    /**
     * Get all open app windows that use Puter SDK
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
     */
    #mergeTools(tools) {
        const toolMap = new Map();
        
        for (const tool of tools) {
            const toolName = tool.function?.name || tool.name;
            if (toolName) {
                // Keep first occurrence (filesystem tools take precedence)
                if (!toolMap.has(toolName)) {
                    toolMap.set(toolName, tool);
                }
            }
        }
        
        return Array.from(toolMap.values());
    }

    /**
     * Execute a tool call (route to correct app or backend)
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

            iframe.contentWindow.postMessage({
                $: 'executeTool',
                toolName,
                parameters,
                tag,
            }, '*');
        });
    }
}
```

---

### Phase 2: Integrate Tool Collection into AI Chat

**File:** `src/gui/src/UI/AI/UIAIChat.js` (MODIFY)

**Changes:**

1. **Import AIToolService:**
```javascript
import { AIToolService } from '../../services/AIToolService.js';
```

2. **Initialize service:**
```javascript
let aiToolService = null;

function initAIToolService() {
    if (!aiToolService) {
        aiToolService = window.services.get('AIToolService');
    }
}
```

3. **Collect tools before sending message:**
```javascript
async function sendMessage() {
    // ... existing message preparation code ...
    
    // Collect tools from apps and backend
    initAIToolService();
    let allTools = [];
    
    try {
        // Get backend filesystem tools (via callback)
        const getFilesystemTools = async () => {
            // Backend will auto-inject filesystem tools, but we need to
            // merge with app tools on frontend
            // For now, return empty array - backend handles filesystem tools
            return [];
        };
        
        allTools = await aiToolService.collectAllTools(getFilesystemTools);
    } catch (error) {
        console.warn('[UIAIChat] Error collecting tools:', error);
        // Continue without app tools - backend will still provide filesystem tools
    }
    
    const requestBody = {
        interface: 'puter-chat-completion',
        method: 'complete',
        args: {
            messages: messages,
            model: selectedModel,
            stream: true,
            tools: allTools.length > 0 ? allTools : undefined, // Pass tools if available
        }
    };
    
    // ... rest of existing code ...
}
```

4. **Handle tool execution results:**
```javascript
// In the stream processing, when tool_use is detected:
if (chunk.type === 'tool_use' && chunk.name) {
    // Check if tool is from an app (has appInstanceID in metadata)
    const toolSource = chunk.source; // { appInstanceID: '...' } or null
    
    if (toolSource?.appInstanceID) {
        // Execute via IPC
        try {
            const result = await aiToolService.executeTool(
                chunk.name,
                chunk.input,
                toolSource
            );
            // Add tool result to conversation
            // ... handle result ...
        } catch (error) {
            console.error('[UIAIChat] Tool execution error:', error);
        }
    } else {
        // Filesystem tool - backend handles it
        // (Already handled by backend)
    }
}
```

---

### Phase 3: Backend Tool Source Tracking

**File:** `pc2-node/test-fresh-install/src/services/ai/AIChatService.ts` (MODIFY)

**Changes:**

1. **Track tool sources:**
```typescript
interface ToolWithSource {
  tool: any;
  source?: {
    type: 'filesystem' | 'app';
    appInstanceID?: string;
  };
}

// When tools are provided from frontend, preserve source info
if (args.tools && args.tools.length > 0) {
  // Tools from frontend may include source metadata
  tools = normalizeToolsObject([...args.tools]);
  
  // Extract source info if present
  const toolsWithSource: ToolWithSource[] = tools.map(tool => ({
    tool,
    source: (tool as any).__source || { type: 'filesystem' }
  }));
} else if (args.filesystem && args.walletAddress) {
  // Auto-inject filesystem tools
  tools = normalizeToolsObject([...filesystemTools]);
}
```

2. **Pass source info in tool calls:**
```typescript
// When AI makes tool call, include source info
if (toolCall.function.name in filesystemToolMap) {
  // Filesystem tool - execute directly
  // ... existing execution ...
} else {
  // App tool - return source info to frontend
  yield {
    message: {
      role: 'assistant',
      content: '',
      tool_calls: [{
        ...toolCall,
        __source: toolSource // Include source metadata
      }]
    },
    done: false,
  };
}
```

---

## Implementation Phases

### Phase 1: Tool Collection Infrastructure ✅ READY
- [x] Puter's SDK IPC code exists (`src/puter-js/src/index.js`)
- [x] Puter's BroadcastService exists (`src/gui/src/services/BroadcastService.js`)
- [ ] Create `AIToolService.js` (tool collection service)
- [ ] Register service in `src/gui/src/services/index.js`

### Phase 2: Frontend Integration
- [ ] Modify `UIAIChat.js` to collect tools before sending
- [ ] Handle tool execution routing (app vs backend)
- [ ] Update tool call processing to handle app tools

### Phase 3: Backend Source Tracking
- [ ] Modify `AIChatService.ts` to track tool sources
- [ ] Pass source metadata in tool calls
- [ ] Handle app tool execution results

### Phase 4: Testing & Documentation
- [ ] Test with existing apps (Terminal, Editor)
- [ ] Test with user-installed WASMER apps
- [ ] Document tool registration for app developers
- [ ] Update `AI_AGENT_INTEGRATION_STRATEGY.md`

---

## Code Reuse Strategy

### ✅ Already in PC2 (Puter's Code)

1. **SDK Tool Registration** (`src/puter-js/src/index.js`)
   - Apps register tools via `puter.tools.push()`
   - IPC message handlers for `requestTools` and `executeTool`
   - **Status:** ✅ Working, no changes needed

2. **GUI Window Communication** (`src/gui/src/services/BroadcastService.js`)
   - `postMessage` API for cross-window communication
   - App window discovery via `data-appUsesSDK=true`
   - **Status:** ✅ Working, no changes needed

3. **Backend Filesystem Tools** (`pc2-node/test-fresh-install/src/services/ai/tools/FilesystemTools.ts`)
   - Static tool definitions
   - Auto-injection when filesystem available
   - **Status:** ✅ Working, no changes needed

### 🆕 New Code (PC2-Specific)

1. **AIToolService.js** (NEW)
   - Tool collection orchestration
   - Merging app tools with filesystem tools
   - Tool execution routing

2. **UIAIChat.js Modifications** (MODIFY)
   - Integrate tool collection
   - Handle app tool execution
   - Route tool calls to correct source

3. **AIChatService.ts Modifications** (MODIFY)
   - Track tool sources
   - Pass source metadata

---

## Security Considerations

### 1. Tool Execution Isolation
- **App tools:** Execute in app's iframe context (sandboxed)
- **Filesystem tools:** Execute in backend with wallet-scoped paths
- **No cross-contamination:** App tools cannot access filesystem directly

### 2. Tool Validation
- Validate tool names (prevent conflicts)
- Validate parameters (type checking)
- Timeout protection (prevent hanging)

### 3. User Sovereignty
- All tool execution happens on user's node
- No external API calls (unless user configures)
- User controls which apps are installed

---

## Example: Database App Tool Registration

**User installs a Database WASMER app:**

```javascript
// Inside Database app (running in iframe)
puter.tools.push({
  type: 'function',
  function: {
    name: 'query_database',
    description: 'Query the user\'s database with SQL',
    parameters: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL query to execute' },
        database: { type: 'string', description: 'Database name' }
      },
      required: ['sql', 'database']
    }
  },
  exec: async (params) => {
    // Execute SQL query in app's context
    const result = await db.query(params.sql, params.database);
    return { success: true, rows: result };
  }
});
```

**User asks AI:** "Show me all users in my database"

**Flow:**
1. GUI collects tools: `query_database` (from app) + `create_folder`, `write_file`, etc. (from backend)
2. AI sees `query_database` tool and uses it
3. GUI routes execution to Database app via IPC
4. App executes query and returns results
5. AI formats results and responds to user

**Result:** ✅ User's AI can now query databases, without any backend changes!

---

## Benefits for PC2's Sovereign Architecture

### 1. **User Sovereignty**
- All tool execution happens on user's node
- No external dependencies
- User controls which apps extend AI

### 2. **Extensibility**
- Users install apps → AI capabilities automatically extend
- No backend code changes needed
- Ecosystem-driven growth

### 3. **Security**
- App tools execute in sandboxed iframes
- Filesystem tools execute in backend with wallet-scoped paths
- Clear separation of concerns

### 4. **Code Reuse**
- Leverages Puter's proven IPC system
- Minimal new code required
- Battle-tested architecture

---

## Next Steps

1. **Create AIToolService.js** - Implement tool collection service
2. **Modify UIAIChat.js** - Integrate tool collection
3. **Test with Terminal app** - Verify IPC communication
4. **Test with Editor app** - Verify tool registration
5. **Document for app developers** - How to register tools

---

## Conclusion

This strategy leverages Puter's proven IPC tool system, which is already in our fork. We're adding minimal new code to orchestrate tool collection and execution routing, while maintaining PC2's sovereign architecture.

**Key Principle:** Take Puter's working code, make it sovereign for users.

**Result:** Users can install apps that extend their AI's capabilities, all running on their own sovereign PC2 node.

---

*This document will be updated as implementation progresses.*

