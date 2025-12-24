# IPC Tool System Testing Guide

## Quick Test Checklist

### ✅ Phase 1: Service Registration
- [ ] AIToolService is registered in `initgui.js`
- [ ] Service is accessible via `window.services.get('ai-tool')`
- [ ] Service initializes without errors

### ✅ Phase 2: Tool Collection
- [ ] Open AI chat panel
- [ ] Check console for: `[AIToolService] Collecting tools from all sources...`
- [ ] Verify: `[AIToolService] Found X open app windows`
- [ ] Verify: `[AIToolService] Collected X tools from apps`
- [ ] Verify: `[AIToolService] Got X filesystem tools from backend`

### ✅ Phase 3: Tool Merging
- [ ] Check console for: `[AIToolService] Final tool collection: { appTools: X, filesystemTools: Y, total: Z }`
- [ ] Verify tools are deduplicated (filesystem tools take precedence)

### ✅ Phase 4: Tool Execution
- [ ] Send message: "Create a folder called Test"
- [ ] Verify filesystem tool executes (backend)
- [ ] Verify folder appears in UI (WebSocket update)
- [ ] Check console for: `[AIChatService] Tool separation: { filesystem: X, app: Y }`

### ✅ Phase 5: App Tool Testing (if apps are open)
- [ ] Open Terminal app
- [ ] Send message that would use terminal tools
- [ ] Verify app tool execution via IPC
- [ ] Check console for: `[AIToolService] Executing tool X in app Y`

---

## Detailed Test Scenarios

### Test 1: Basic Filesystem Tool
**Action:** "Create a folder called TestFolder on my desktop"

**Expected:**
1. Console: `[AIToolService] Collecting tools from all sources...`
2. Console: `[AIChatService] Tool execution enabled`
3. Console: `[AIChatService] Tool separation: { filesystem: 1, app: 0 }`
4. Folder appears in Desktop UI immediately (WebSocket)
5. AI responds: "I've created the folder TestFolder at ~/Desktop/TestFolder"

### Test 2: Tool Collection with Apps
**Prerequisites:** Terminal app is open

**Action:** Open AI chat, send any message

**Expected:**
1. Console: `[AIToolService] Found 1 open app windows`
2. Console: `[AIToolService] Sent tool request to app [instanceID]`
3. Console: `[AIToolService] Received tool response for requestId [id]`
4. Console: `[AIToolService] Collected X tools from apps` (X > 0 if Terminal has tools)

### Test 3: App Tool Execution
**Prerequisites:** Terminal app is open and has registered tools

**Action:** Send message that would trigger a terminal tool

**Expected:**
1. Console: `[AIChatService] Tool separation: { filesystem: 0, app: 1 }`
2. Console: `[UIAIChat] Executing app tool: [toolName] from app: [instanceID]`
3. Console: `[AIToolService] Executing tool [toolName] in app [instanceID]`
4. Console: `[AIToolService] Tool execution result from app [instanceID]: [result]`

### Test 4: Mixed Tools
**Prerequisites:** Terminal app is open

**Action:** "Create a folder, then run a terminal command"

**Expected:**
1. Console: `[AIChatService] Tool separation: { filesystem: 1, app: 1 }`
2. Filesystem tool executes (backend)
3. App tool executes (IPC)
4. Both results merged in AI response

---

## Console Log Patterns to Look For

### ✅ Success Patterns
```
[AIToolService] Collecting tools from all sources...
[AIToolService] Found X open app windows
[AIToolService] Sent tool request to app [id]
[AIToolService] Received tool response for requestId [id]
[AIToolService] Collected X tools from apps
[AIToolService] Final tool collection: { appTools: X, filesystemTools: Y, total: Z }
[AIChatService] Tool separation: { filesystem: X, app: Y }
```

### ❌ Error Patterns to Watch For
```
[AIToolService] Timeout waiting for tools from app [id]
[AIToolService] Error sending tool request to app [id]
[UIAIChat] AIToolService not available
[AIChatService] No tools available
```

---

## Manual Testing Steps

1. **Start Server**
   ```bash
   cd pc2-node/test-fresh-install
   npm start
   ```

2. **Open Browser**
   - Navigate to `http://localhost:3000`
   - Login/authenticate

3. **Open AI Chat**
   - Click AI icon in taskbar
   - Open browser console (F12)

4. **Test Basic Filesystem Tool**
   - Type: "Create a folder called TestFolder"
   - Press Enter
   - Watch console logs
   - Verify folder appears in Desktop

5. **Test with Terminal App**
   - Open Terminal app
   - Return to AI chat
   - Type: "Create a folder called Test2"
   - Watch console for tool collection logs
   - Verify tools are collected from Terminal

6. **Test App Tool Execution**
   - If Terminal has registered tools, try using them
   - Watch console for IPC communication
   - Verify tool execution results

---

## Expected Behavior

### ✅ Working Correctly
- Tools are collected from all open apps
- Filesystem tools execute via backend
- App tools execute via IPC
- Tool results are merged and sent to AI
- AI responds with natural language including tool results
- UI updates live via WebSocket

### ❌ Not Working
- No tools collected (check service registration)
- App tools not executing (check IPC communication)
- Tools not merging (check tool deduplication logic)
- No live UI updates (check WebSocket events)

---

## Debugging Tips

1. **Check Service Registration**
   ```javascript
   // In browser console
   window.services.get('ai-tool')
   // Should return AIToolService instance
   ```

2. **Check Tool Collection**
   ```javascript
   // In browser console
   const service = window.services.get('ai-tool');
   const tools = await service.collectAllTools(() => []);
   console.log('Collected tools:', tools);
   ```

3. **Check App Windows**
   ```javascript
   // In browser console
   $('.window-app-iframe[data-appUsesSDK=true]').length
   // Should return number of open apps using SDK
   ```

4. **Check IPC Communication**
   - Open Terminal app
   - Check Terminal console for: `I have a parent, registering tools`
   - Check GUI console for: `[AIToolService] Sent tool request to app`

---

## Known Issues & Limitations

1. **App Tools Not Registered**
   - Some apps may not register tools immediately
   - Wait a few seconds after opening app
   - Check app console for tool registration logs

2. **Timeout Errors**
   - Apps may take time to respond
   - Timeout is set to 5 seconds
   - If app is slow, tools may not be collected

3. **Tool Deduplication**
   - Filesystem tools take precedence over app tools with same name
   - This is by design (security)

---

## Next Steps After Testing

1. ✅ Verify all test scenarios pass
2. ✅ Check console for any errors
3. ✅ Test with multiple apps open
4. ✅ Test with custom WASMER apps (if available)
5. ✅ Document any issues found

---

*This testing guide will be updated as we discover edge cases and improvements.*

