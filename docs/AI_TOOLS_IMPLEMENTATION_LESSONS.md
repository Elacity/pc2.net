# AI Tools Implementation Lessons & Best Practices

**Date:** 2025-01-20  
**Purpose:** Document lessons learned from current implementation to guide new tool development  
**Status:** Best Practices Guide

---

## Executive Summary

This document captures critical lessons learned from implementing PC2's AI filesystem tools. These patterns should be **strictly followed** when implementing new tools (text processing, path utilities, enhanced options) to avoid bugs, reduce debugging time, and ensure consistency.

---

## 1. Path Resolution & Normalization (CRITICAL)

### Lesson Learned
We encountered **extensive path malformation issues** that required multiple iterations to fix:
- `"/~Desktop/Look"` → Should be `"~/Desktop/Look"`
- `"~:Desktop/WORLD"` → Should be `"~/Desktop/WORLD"`
- `"~Desktop/WORLD"` → Should be `"~/Desktop/WORLD"`
- `"/0x...Documents"` → Should be `"/0x.../Documents"` (missing slash)
- `"~world"` → Should be `"~/Desktop/world"` (default to Desktop)
- `"world"` → Should be `"~/Desktop/world"` (default to Desktop)

### Best Practice: Always Use `resolvePath()`

**✅ DO:**
```typescript
case 'new_tool': {
  const path = this.resolvePath(args.path);  // ALWAYS use resolvePath first
  this.validatePath(path);  // Then validate
  // ... rest of implementation
}
```

**❌ DON'T:**
```typescript
case 'new_tool': {
  const path = args.path;  // NEVER use raw path
  // This will break with malformed paths
}
```

### Key Points
1. **Always call `resolvePath()` first** - Never trust AI-provided paths
2. **Then call `validatePath()`** - Security check after normalization
3. **The `resolvePath()` method handles ALL edge cases** - Don't duplicate logic
4. **Default to Desktop** - Bare folder names should default to `~/Desktop/`

### For New Tools
- All path parameters must go through `resolvePath()` and `validatePath()`
- If a tool accepts multiple paths, resolve each one individually
- Document in tool description that paths support `~` for home directory

---

## 2. WebSocket Event Broadcasting (CRITICAL)

### Lesson Learned
We discovered that AI-initiated file operations **did not show live in the UI** until we set `original_client_socket_id: null`. The frontend filters out events where `original_client_socket_id` matches the current socket ID (to prevent duplicate updates from manual operations).

### Best Practice: Always Set `original_client_socket_id: null`

**✅ DO:**
```typescript
if (this.io) {
  broadcastItemAdded(this.io, this.walletAddress, {
    uid: fileUid,
    uuid: fileUid,
    name: fileName,
    path: path,
    dirpath: dirpath,
    // ... other fields
    original_client_socket_id: null  // CRITICAL: Always null for AI operations
  });
}
```

**❌ DON'T:**
```typescript
if (this.io) {
  broadcastItemAdded(this.io, this.walletAddress, {
    // Missing original_client_socket_id - frontend will ignore this!
  });
}
```

### Key Points
1. **Always include `original_client_socket_id: null`** in all WebSocket broadcasts
2. **Check `this.io` exists** before broadcasting (graceful degradation)
3. **Use correct broadcast function** for the operation:
   - `broadcastItemAdded()` - For create operations
   - `broadcastItemRemoved()` - For delete operations
   - `broadcastItemMoved()` - For move/rename operations
   - `broadcastItemUpdated()` - For write/modify operations
4. **Calculate `dirpath` correctly** - Parent directory path (without filename)

### For New Tools
- **Every tool that modifies filesystem** must broadcast WebSocket events
- **Read-only tools** (like `list_files`, `read_file`, `stat`) don't need broadcasts
- **Text processing tools** that modify files should use `broadcastItemUpdated()`
- **Always set `original_client_socket_id: null`**

---

## 3. Parameter Validation (CRITICAL)

### Lesson Learned
We had issues where the AI would omit required parameters (e.g., `content` for `write_file`, `new_name` for `rename`). This caused cryptic errors. Early validation with clear error messages is essential.

### Best Practice: Validate Early, Fail Fast

**✅ DO:**
```typescript
case 'new_tool': {
  // Validate required parameters FIRST
  if (!args.path) {
    throw new Error('new_tool requires "path" parameter');
  }
  if (args.content === undefined || args.content === null) {
    throw new Error('new_tool requires "content" parameter. Cannot be omitted.');
  }
  
  // Then proceed with execution
  const path = this.resolvePath(args.path);
  this.validatePath(path);
  // ...
}
```

**❌ DON'T:**
```typescript
case 'new_tool': {
  const path = this.resolvePath(args.path);
  // Missing validation - will fail later with cryptic error
  const result = await this.filesystem.someOperation(path, args.content);
}
```

### Key Points
1. **Validate ALL required parameters** before any processing
2. **Check for `undefined` AND `null`** - AI sometimes sends `null`
3. **Use descriptive error messages** - Include parameter name and requirement
4. **Validate before path resolution** - Don't waste cycles on invalid input
5. **For optional parameters**, provide sensible defaults

### For New Tools
- **List all required parameters** in tool description
- **Validate each required parameter** with early return
- **Provide defaults** for optional parameters
- **Document parameter requirements** clearly in tool description

---

## 4. Tool Description Clarity (IMPORTANT)

### Lesson Learned
Vague tool descriptions led to the AI using tools incorrectly or omitting parameters. Clear, explicit descriptions with examples reduce errors.

### Best Practice: Be Explicit and Provide Examples

**✅ DO:**
```typescript
{
  type: 'function',
  function: {
    name: 'grep_file',
    description: 'Searches for a text pattern in a file and returns matching lines. Returns empty array if no matches found. REQUIRED: Both "path" and "pattern" parameters must be provided.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to search. Must be a file, not a directory. REQUIRED.'
        },
        pattern: {
          type: 'string',
          description: 'Text pattern to search for. Can be plain text or regex pattern. REQUIRED.'
        },
        case_sensitive: {
          type: 'boolean',
          description: 'If true, search is case-sensitive. Defaults to false.'
        }
      },
      required: ['path', 'pattern']
    }
  }
}
```

**❌ DON'T:**
```typescript
{
  type: 'function',
  function: {
    name: 'grep_file',
    description: 'Search in file',  // Too vague!
    parameters: {
      // Missing explicit "REQUIRED" markers
    }
  }
}
```

### Key Points
1. **Use "REQUIRED" in descriptions** - Makes it clear to the AI
2. **Provide examples** - Show expected format
3. **Explain edge cases** - What happens if file doesn't exist, etc.
4. **Document defaults** - For optional parameters
5. **Be specific about types** - File vs directory, text vs binary, etc.

### For New Tools
- **Start description with what the tool does**
- **Explicitly mark REQUIRED parameters** in description
- **Include examples** in parameter descriptions
- **Document error conditions** (file not found, etc.)

---

## 5. Error Handling Pattern (IMPORTANT)

### Lesson Learned
Consistent error handling makes debugging easier and provides better feedback to the AI. All tools should follow the same pattern.

### Best Practice: Structured Error Responses

**✅ DO:**
```typescript
async executeTool(toolName: string, args: any): Promise<ToolExecutionResult> {
  try {
    logger.info('[ToolExecutor] Executing tool:', { toolName, args, walletAddress: this.walletAddress });
    
    switch (toolName) {
      case 'new_tool': {
        // Validation
        if (!args.path) {
          throw new Error('new_tool requires "path" parameter');
        }
        
        // Execution
        const path = this.resolvePath(args.path);
        this.validatePath(path);
        const result = await this.filesystem.someOperation(path, this.walletAddress);
        
        // Success response
        return {
          success: true,
          result: {
            message: `Operation completed successfully at ${path}`,
            path,
            // ... other result data
          }
        };
      }
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error: any) {
    logger.error('[ToolExecutor] Tool execution failed:', {
      toolName,
      args,
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      error: error.message || 'Tool execution failed'
    };
  }
}
```

**❌ DON'T:**
```typescript
case 'new_tool': {
  // No try-catch - errors will bubble up unhandled
  const result = await this.filesystem.someOperation(args.path);
  return result;  // Inconsistent return format
}
```

### Key Points
1. **Wrap entire `executeTool` in try-catch** - Catch all errors
2. **Log errors with context** - Include toolName, args, error message, stack
3. **Return structured response** - Always `{ success: boolean, result?: any, error?: string }`
4. **Include helpful messages** - Success messages should include path/context
5. **Don't throw from tool cases** - Return error response instead

### For New Tools
- **Always return `ToolExecutionResult`** - Never throw exceptions
- **Include helpful success messages** - With path or context
- **Log errors before returning** - For debugging
- **Use consistent error format** - `error.message` in error field

---

## 6. File Size & Content Limits (IMPORTANT)

### Lesson Learned
Large files can cause token limit issues when returned to the AI. We implemented truncation for `read_file` to prevent this.

### Best Practice: Limit Content Size

**✅ DO:**
```typescript
case 'read_file': {
  const path = this.resolvePath(args.path);
  this.validatePath(path);
  
  const content = await this.filesystem.readFile(path, this.walletAddress);
  const contentString = content.toString('utf8');
  
  // Truncate very large files to avoid token limits
  const MAX_FILE_LENGTH = 50000;
  if (contentString.length > MAX_FILE_LENGTH) {
    const truncated = contentString.substring(0, MAX_FILE_LENGTH);
    return {
      success: true,
      result: {
        path,
        content: truncated,
        truncated: true,
        original_length: contentString.length,
        message: `File content truncated to ${MAX_FILE_LENGTH} characters. File is very large.`
      }
    };
  }
  
  return { success: true, result: { path, content: contentString } };
}
```

### Key Points
1. **Set reasonable limits** - 50KB is a good default for text content
2. **Indicate truncation** - Set `truncated: true` flag
3. **Include original size** - Helps AI understand context
4. **Provide clear message** - Explain why truncation occurred
5. **For binary files** - Don't return content, return metadata only

### For New Tools
- **Text processing tools** should handle large files gracefully
- **Set content limits** - Prevent token overflow
- **Indicate when content is truncated** - AI needs to know
- **For binary files** - Return metadata, not content

---

## 7. Tool Name Normalization (IMPORTANT)

### Lesson Learned
The AI sometimes uses variations of tool names (e.g., `createfolder` instead of `create_folder`). We implemented normalization to handle this.

### Best Practice: Normalize Tool Names

**✅ DO:**
```typescript
// In AIChatService.ts - parseToolCalls method
const normalizeToolName = (name: string): string => {
  const mappings: Record<string, string> = {
    'createfolder': 'create_folder',
    'listfiles': 'list_files',
    'readfile': 'read_file',
    'writefile': 'write_file',
    'deletefile': 'delete_file',
    'movefile': 'move_file',
    'grepfile': 'grep_file',  // Add new mappings
    'readfilelines': 'read_file_lines',
  };
  return mappings[name.toLowerCase()] || name;
};
```

### Key Points
1. **Normalize before execution** - Convert variations to canonical names
2. **Case-insensitive** - Use `.toLowerCase()`
3. **Add mappings for new tools** - Include common variations
4. **Fallback to original** - If no mapping found, use as-is

### For New Tools
- **Add normalization mappings** for common variations
- **Document canonical name** - Use consistent naming (snake_case)
- **Test with variations** - Ensure normalization works

---

## 8. System Message Updates (IMPORTANT)

### Lesson Learned
When adding new tools, the system message must be updated to include them. The AI needs to know what tools are available and when to use them.

### Best Practice: Update System Message

**✅ DO:**
```typescript
// In AIChatService.ts - executeWithTools method
const toolDescriptions = tools.map(t => {
  const fn = t.function;
  return `- ${fn.name}: ${fn.description || 'No description'}`;
}).join('\n');

const systemMessage = {
  role: 'system' as const,
  content: `... Available filesystem tools:
${toolDescriptions}

CRITICAL RULES FOR TOOL CALLS:
1. ONLY use tools when user explicitly requests filesystem operations
2. For text processing (grep, head, tail), use the appropriate tool
3. ...`
};
```

### Key Points
1. **Auto-generate tool descriptions** - Don't hardcode
2. **Include all tools** - The `tools` array should include new tools
3. **Update examples** - Add examples for new tool types
4. **Keep rules clear** - When to use tools vs. text responses

### For New Tools
- **Tools are auto-included** - If added to `filesystemTools` array
- **Update examples** - Add examples showing new tool usage
- **Document in system message** - Explain when to use new tools

---

## 9. WebSocket Event Data Structure (IMPORTANT)

### Lesson Learned
WebSocket events require specific fields. Missing or incorrect fields can cause frontend issues.

### Best Practice: Include All Required Fields

**✅ DO:**
```typescript
broadcastItemAdded(this.io, this.walletAddress, {
  uid: fileUid,                    // Required: Unique identifier
  uuid: fileUid,                    // Required: Same as uid
  name: fileName,                   // Required: Display name
  path: path,                       // Required: Full path
  dirpath: dirpath,                 // Required: Parent directory path
  size: metadata.size || 0,         // Required: File size
  type: mimeType,                   // Optional: MIME type
  mime_type: mimeType,              // Optional: MIME type (alternative)
  is_dir: false,                    // Required: Is directory?
  created: new Date(metadata.created_at).toISOString(),  // Required: Creation time
  modified: new Date(metadata.updated_at).toISOString(), // Required: Modification time
  original_client_socket_id: null   // CRITICAL: Always null for AI
});
```

### Key Points
1. **Calculate `dirpath` correctly** - Parent directory (without filename)
2. **Generate consistent UIDs** - Use `uuid-${path.replace(/\//g, '-')}` pattern
3. **Include timestamps** - Use ISO format from metadata
4. **Set `is_dir` correctly** - `true` for directories, `false` for files
5. **Include size** - Use metadata or calculate from content

### For New Tools
- **Follow the same structure** - Consistency is key
- **Calculate `dirpath`** - Split path and remove last component
- **Use metadata when available** - From filesystem operations
- **Always set `original_client_socket_id: null`**

---

## 10. Logging Best Practices (HELPFUL)

### Lesson Learned
Good logging makes debugging much easier. Log at key points with relevant context.

### Best Practice: Strategic Logging

**✅ DO:**
```typescript
async executeTool(toolName: string, args: any): Promise<ToolExecutionResult> {
  try {
    logger.info('[ToolExecutor] Executing tool:', { 
      toolName, 
      args, 
      walletAddress: this.walletAddress 
    });
    
    // ... validation and execution
    
    logger.info('[ToolExecutor] ✅ Successfully executed tool:', { 
      toolName, 
      path,
      result: 'success' 
    });
    
    return { success: true, result: {...} };
  } catch (error: any) {
    logger.error('[ToolExecutor] Tool execution failed:', {
      toolName,
      args,
      error: error.message,
      stack: error.stack
    });
    // ...
  }
}
```

### Key Points
1. **Log at entry** - Tool name, args, wallet address
2. **Log on success** - Confirm execution completed
3. **Log on error** - Full error context
4. **Use consistent prefixes** - `[ToolExecutor]` for all logs
5. **Include context** - Wallet address, paths, etc.

### For New Tools
- **Log tool execution start** - With all parameters
- **Log success** - Confirm completion
- **Log errors** - Full context for debugging
- **Use consistent format** - Match existing logging style

---

## 11. Testing Considerations

### Lesson Learned
Test with various path formats, edge cases, and AI-generated inputs.

### Best Practice: Test Edge Cases

**Test Cases to Cover:**
1. **Path variations:**
   - `"~/Desktop/file"` (normal)
   - `"~Desktop/file"` (missing slash)
   - `"~:Desktop/file"` (colon instead of slash)
   - `"/~Desktop/file"` (leading slash)
   - `"file"` (bare name - should default to Desktop)
   - `"/0x...Documents"` (missing slash between wallet and dir)

2. **Parameter validation:**
   - Missing required parameters
   - `null` values
   - `undefined` values
   - Empty strings (where not allowed)

3. **File operations:**
   - Non-existent files
   - Existing files (overwrite scenarios)
   - Large files (truncation)
   - Binary files (if applicable)

4. **WebSocket events:**
   - Verify events are broadcast
   - Verify `original_client_socket_id: null`
   - Verify all required fields present

### For New Tools
- **Test path normalization** - All edge cases
- **Test parameter validation** - Missing, null, undefined
- **Test error cases** - File not found, permission errors, etc.
- **Test WebSocket events** - Verify correct events broadcast

---

## 12. Implementation Checklist

When implementing a new tool, follow this checklist:

- [ ] **Tool Definition:**
  - [ ] Clear, explicit description with "REQUIRED" markers
  - [ ] All parameters documented with examples
  - [ ] Required parameters listed in `required` array

- [ ] **Tool Execution:**
  - [ ] Early parameter validation (before path resolution)
  - [ ] All paths go through `resolvePath()` and `validatePath()`
  - [ ] Proper error handling (try-catch, structured responses)
  - [ ] Success messages include context (path, etc.)

- [ ] **WebSocket Integration:**
  - [ ] Check `this.io` exists before broadcasting
  - [ ] Use correct broadcast function for operation type
  - [ ] Set `original_client_socket_id: null`
  - [ ] Include all required fields (uid, uuid, name, path, dirpath, etc.)

- [ ] **Content Limits:**
  - [ ] Large content truncated (if applicable)
  - [ ] Truncation indicated in response
  - [ ] Original size included

- [ ] **Tool Name:**
  - [ ] Added to normalization mappings (if needed)
  - [ ] Consistent naming (snake_case)

- [ ] **Logging:**
  - [ ] Entry logging (tool name, args, wallet)
  - [ ] Success logging
  - [ ] Error logging with full context

- [ ] **Testing:**
  - [ ] Path edge cases tested
  - [ ] Parameter validation tested
  - [ ] Error cases tested
  - [ ] WebSocket events verified

---

## 13. Common Pitfalls to Avoid

### ❌ Pitfall 1: Using Raw Paths
```typescript
// WRONG
const path = args.path;
await this.filesystem.someOperation(path);
```
**Fix:** Always use `resolvePath()` first

### ❌ Pitfall 2: Missing WebSocket Broadcast
```typescript
// WRONG
await this.filesystem.createDirectory(path, this.walletAddress);
return { success: true };
```
**Fix:** Broadcast WebSocket event with `original_client_socket_id: null`

### ❌ Pitfall 3: Missing Parameter Validation
```typescript
// WRONG
const result = await this.filesystem.writeFile(args.path, args.content);
```
**Fix:** Validate `args.path` and `args.content` first

### ❌ Pitfall 4: Inconsistent Error Handling
```typescript
// WRONG
if (!args.path) {
  return { error: 'Missing path' };  // Missing success field
}
```
**Fix:** Return `{ success: false, error: '...' }`

### ❌ Pitfall 5: Missing dirpath Calculation
```typescript
// WRONG
broadcastItemAdded(this.io, this.walletAddress, {
  path: path,
  // Missing dirpath!
});
```
**Fix:** Calculate `dirpath` by removing filename from path

---

## 14. Summary

**Critical Rules (MUST FOLLOW):**
1. ✅ Always use `resolvePath()` and `validatePath()` for all paths
2. ✅ Always set `original_client_socket_id: null` in WebSocket broadcasts
3. ✅ Always validate required parameters early
4. ✅ Always return structured `ToolExecutionResult`
5. ✅ Always include all required WebSocket event fields

**Important Rules (SHOULD FOLLOW):**
6. ✅ Write clear, explicit tool descriptions with examples
7. ✅ Implement content size limits for large files
8. ✅ Add tool name normalization mappings
9. ✅ Update system message examples
10. ✅ Log at key points with context

**Following these patterns will:**
- ✅ Prevent path normalization bugs
- ✅ Ensure live UI updates work
- ✅ Provide better error messages
- ✅ Reduce debugging time
- ✅ Maintain consistency across tools

---

*This document should be referenced when implementing any new AI tools to ensure consistency and avoid common pitfalls.*

