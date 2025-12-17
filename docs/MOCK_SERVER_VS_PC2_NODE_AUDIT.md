# Mock Server vs PC2 Node - Deep Architecture Audit

**Date**: 2025-12-17  
**Status**: CRITICAL - User cannot use PC2 node for basic operations  
**Goal**: Identify exact differences causing functionality regression

---

## Executive Summary

The mock server (`tools/mock-pc2-server.cjs`) worked perfectly for all operations. The PC2 node (`pc2-node/test-fresh-install/`) has regressed functionality. This document provides an exact A/B comparison to identify what changed.

**Key Finding**: The mock server uses **permissive, inline authentication** while PC2 node uses **strict middleware-based authentication**. This fundamental difference breaks file reading in viewer apps.

---

## Architecture Comparison

### Mock Server Architecture

**Location**: `tools/mock-pc2-server.cjs`  
**Framework**: Native Node.js HTTP server  
**Authentication**: Inline, permissive, with fallbacks  
**Storage**: In-memory filesystem (no persistence)  
**WebSocket**: Custom HTTP polling simulation

### PC2 Node Architecture

**Location**: `pc2-node/test-fresh-install/`  
**Framework**: Express.js  
**Authentication**: Middleware-based, strict  
**Storage**: SQLite + IPFS (persistent)  
**WebSocket**: Socket.io (real WebSocket)

---

## Critical Differences

### 1. Authentication Model

#### Mock Server (`/read` endpoint - lines 2595-2780)

```javascript
// NO middleware - handles auth inline
if (path === '/read' && method === 'GET') {
    // Special case: .__puter_gui.json - NO AUTH REQUIRED
    if (filePath.endsWith('.__puter_gui.json')) {
        return res.end('{}'); // ✅ Works without auth
    }
    
    // Extract token from MULTIPLE sources:
    let token = null;
    // 1. Authorization header
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }
    // 2. URL query params (for iframes)
    const tokenParam = url.searchParams.get('token') || 
                       url.searchParams.get('puter.auth.token') || 
                       url.searchParams.get('auth_token');
    if (tokenParam) token = tokenParam;
    
    // 3. Referer header (for app iframes)
    if (!token && req.headers.referer) {
        const refererUrl = new URL(req.headers.referer);
        token = refererUrl.searchParams.get('puter.auth.token');
    }
    
    // ✅ FALLBACK: If no token but sessions exist, use first session
    if (!token && nodeState.sessions.size > 0) {
        const firstSession = Array.from(nodeState.sessions.values())[0];
        walletAddress = firstSession.wallet; // ✅ Permissive fallback
    }
    
    // ✅ NO 401 ERROR - just tries to resolve path
    // If can't resolve, returns 404 (file not found), not 401 (unauthorized)
}
```

**Key Characteristics**:
- ✅ No middleware blocking
- ✅ Multiple token sources (header, URL, Referer)
- ✅ Fallback to any existing session
- ✅ Returns 404 (not 401) if file not found
- ✅ Special case for `.__puter_gui.json` (no auth)

#### PC2 Node (`/read` endpoint)

```typescript
// ❌ STRICT middleware blocks request first
app.get('/read', authenticate, handleRead);
app.post('/read', authenticate, handleRead);

// Middleware (middleware.ts:155-171)
if (!session && (token === 'mock-token' || token.startsWith('mock-token'))) {
    // Extract wallet from path
    let mockWalletAddress = '0x0000000000000000000000000000000000000000';
    const walletMatch = pathToCheck.match(/^\/(0x[a-fA-F0-9]{40})/);
    if (walletMatch) {
        mockWalletAddress = walletMatch[1]; // ✅ Extracts from path
    }
    req.user = { wallet_address: mockWalletAddress, ... };
    return next(); // ✅ Allows request
}

// Handler (filesystem.ts:273-350)
export async function handleRead(req: AuthenticatedRequest, res: Response) {
    // Special case for .__puter_gui.json
    if (path?.endsWith('.__puter_gui.json')) {
        return res.send('{}'); // ✅ Works
    }
    
    // ❌ REQUIRES req.user (set by middleware)
    if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    
    // Uses req.user.wallet_address for file lookup
    const content = await filesystem.readFile(resolvedPath, req.user.wallet_address);
}
```

**Key Characteristics**:
- ❌ Middleware blocks before handler runs
- ✅ Mock token support (extracts wallet from path)
- ❌ Only checks Authorization header (not URL params or Referer)
- ❌ No fallback to existing sessions
- ❌ Returns 401 if no valid session (not 404)

---

### 2. Token Extraction Strategy

#### Mock Server

**Sources (in order of priority)**:
1. `Authorization: Bearer <token>` header
2. URL query param: `?token=...` or `?puter.auth.token=...` or `?auth_token=...`
3. Referer header: Parse iframe URL for `puter.auth.token` param
4. **Fallback**: Use any existing session's wallet address

**Code**:
```javascript
// Line 2620-2671
let token = null;
if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
} else {
    const tokenParam = url.searchParams.get('token') || 
                       url.searchParams.get('puter.auth.token') || 
                       url.searchParams.get('auth_token');
    if (tokenParam) token = tokenParam;
}

if (!token && req.headers.referer) {
    const refererUrl = new URL(req.headers.referer);
    token = refererUrl.searchParams.get('puter.auth.token');
}

// ✅ FALLBACK: Use any session if token not found
if (!token && nodeState.sessions.size > 0) {
    const firstSession = Array.from(nodeState.sessions.values())[0];
    walletAddress = firstSession.wallet;
}
```

#### PC2 Node

**Sources (in order of priority)**:
1. `Authorization: Bearer <token>` header
2. URL query param: `?token=...` or `?auth_token=...`
3. Request body: `body.token` or `body.auth_token`
4. ❌ **NO Referer header checking**
5. ❌ **NO fallback to existing sessions**

**Code**:
```typescript
// middleware.ts:69-92
const authHeader = req.headers.authorization;
let token: string | undefined;

if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
} else if (req.query.token) {
    token = String(req.query.token).trim();
} else if (req.query.auth_token) {
    token = String(req.query.auth_token).trim();
} else if (req.body?.token) {
    token = String(req.body.token).trim();
} else if (req.body?.auth_token) {
    token = String(req.body.auth_token).trim();
}

// ❌ NO Referer header checking
// ❌ NO fallback to existing sessions
```

---

### 3. Mock Token Handling

#### Mock Server

**Behavior**: Mock tokens are treated as **valid session tokens**
- Mock tokens stored in `nodeState.sessions` Map
- When `/open_item` generates mock token, it's added to sessions
- `/read` endpoint looks up mock token in sessions Map
- ✅ **Works seamlessly**

**Code**:
```javascript
// Line 5521-5522: Generate mock token
const token = `mock-token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Line 2652: Lookup in sessions
const session = nodeState.sessions.get(token);
if (session && session.wallet) {
    walletAddress = session.wallet; // ✅ Uses session wallet
}
```

#### PC2 Node

**Behavior**: Mock tokens are **special-cased** in middleware
- Mock tokens NOT stored in database sessions
- Middleware extracts wallet address from path
- If path doesn't contain wallet, uses dummy address `0x0000...`
- ❌ **Breaks when path doesn't have wallet address**

**Code**:
```typescript
// middleware.ts:157-171
if (!session && (token === 'mock-token' || token.startsWith('mock-token'))) {
    let mockWalletAddress = '0x0000000000000000000000000000000000000000';
    const pathToCheck = (req.query.path as string) || 
                        (req.query.file as string) ||
                        (req.body?.path as string) || 
                        (req.body?.file as string) ||
                        req.path;
    
    const walletMatch = pathToCheck.match(/^\/(0x[a-fA-F0-9]{40})/);
    if (walletMatch && walletMatch[1]) {
        mockWalletAddress = walletMatch[1]; // ✅ Extracts from path
    } else {
        // ❌ Uses dummy address if path doesn't contain wallet
        mockWalletAddress = '0x0000000000000000000000000000000000000000';
    }
    
    req.user = { wallet_address: mockWalletAddress, ... };
}
```

**Problem**: When viewer app calls `/read?file=/0x34daf31b.../Videos/Screenshot.png`, the middleware extracts wallet correctly. But if the request comes from an iframe with a different format, it might fail.

---

### 4. Error Response Codes

#### Mock Server

**Behavior**: Returns **404 (Not Found)** for missing files, not 401 (Unauthorized)

```javascript
// Line 2700-2704
if (!node || node.type === 'dir') {
    res.writeHead(404, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({ 
        error: { code: 'subject_does_not_exist', message: 'File not found' } 
    }));
}
```

**Why**: SDK expects 404 for missing files. 401 breaks the error handling flow.

#### PC2 Node

**Behavior**: Returns **401 (Unauthorized)** if authentication fails

```typescript
// middleware.ts:104-105
if (!token) {
    res.status(401).json({ error: 'Authentication required', message: 'No token provided' });
    return;
}

// filesystem.ts:300-305
if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
}
```

**Problem**: Viewer apps get 401 instead of 404, causing different error handling paths.

---

### 5. File Path Resolution

#### Mock Server

**Behavior**: Multiple fallback strategies

```javascript
// Line 2619-2683
if (filePath.startsWith('~')) {
    // Try to get token from multiple sources
    // If token found, use session wallet
    // If no token but sessions exist, use first session wallet
    // If still no wallet, return 404 (not 401)
}

// Normalize path
let normalizedPath = filePath.replace(/\/+/g, '/');
if (!normalizedPath.startsWith('/')) {
    normalizedPath = '/' + normalizedPath;
}
```

**Key**: Never returns 401 - always tries to resolve path, returns 404 if file doesn't exist.

#### PC2 Node

**Behavior**: Strict path resolution with wallet requirement

```typescript
// filesystem.ts:300-320
if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' }); // ❌ 401, not 404
    return;
}

// Handle ~ (home directory)
let resolvedPath = path;
if (path.startsWith('~')) {
    resolvedPath = path.replace('~', `/${req.user.wallet_address}`);
} else if (path.startsWith('/null')) {
    resolvedPath = path.replace('/null', `/${req.user.wallet_address}`);
}
```

**Problem**: If `req.user.wallet_address` is dummy (`0x0000...`), path resolution fails.

---

## Specific Issues Identified

### Issue #1: Viewer App Cannot Read Files

**Symptom**: `Failed to load resource: 401 (Unauthorized)` when viewer tries to read file

**Root Cause**: 
1. Viewer app uses mock token from URL params
2. Mock token passed in `Authorization: Bearer mock-token-...` header
3. Middleware extracts wallet from path: `/read?file=/0x34daf31b.../Videos/Screenshot.png`
4. ✅ Wallet extracted correctly: `0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3`
5. ❌ **BUT**: Request might not have path in query/body when middleware runs
6. Middleware uses `req.path` which is `/read` (no file path)
7. Regex doesn't match, uses dummy wallet `0x0000...`
8. File lookup fails because path belongs to different wallet

**Mock Server Solution**: 
- Checks Referer header for token
- Falls back to any existing session
- Never uses dummy wallet

**PC2 Node Fix Needed**:
- Extract wallet from `req.query.file` or `req.query.path` in middleware
- OR: Allow `/read` to handle auth inline (like mock server)
- OR: Store mock tokens in database sessions (like mock server)

---

### Issue #2: Token Not Found in Referer Header

**Symptom**: Viewer app iframe requests don't include token in Authorization header

**Root Cause**:
- Viewer app loads in iframe with `puter.auth.token` in URL params
- Viewer app makes `/read` request using `read_url` from `/open_item`
- `read_url` is: `/read?file=/0x34daf31b.../Videos/Screenshot.png`
- Viewer app doesn't add `Authorization` header automatically
- Middleware only checks header, not Referer

**Mock Server Solution**:
```javascript
// Line 2633-2646
if (!token && req.headers.referer) {
    const refererUrl = new URL(req.headers.referer);
    token = refererUrl.searchParams.get('puter.auth.token');
}
```

**PC2 Node Fix Needed**:
- Add Referer header token extraction to middleware
- OR: Make `/read` endpoint check Referer header directly

---

### Issue #3: No Fallback to Existing Sessions

**Symptom**: Even if user is authenticated in main window, viewer app can't read files

**Root Cause**:
- Main window has valid session token
- Viewer app gets mock token from `/open_item`
- Mock token not in database
- No fallback to use main window's session

**Mock Server Solution**:
```javascript
// Line 2661-2669
if (!token && nodeState.sessions.size > 0) {
    const firstSession = Array.from(nodeState.sessions.values())[0];
    walletAddress = firstSession.wallet;
}
```

**PC2 Node Fix Needed**:
- When mock token used, lookup existing session by wallet address from path
- OR: Store mock tokens in database with proper wallet mapping

---

## Recommended Fixes (Priority Order)

### Fix #1: Extract Wallet from Query Params in Middleware (CRITICAL)

**File**: `pc2-node/test-fresh-install/src/api/middleware.ts`

**Change**: When handling mock tokens, check query params for file path:

```typescript
// Current (line 157-171)
if (!session && (token === 'mock-token' || token.startsWith('mock-token'))) {
    let mockWalletAddress = '0x0000000000000000000000000000000000000000';
    const pathToCheck = (req.query.path as string) || 
                        (req.query.file as string) ||  // ✅ Already checks this
                        (req.body?.path as string) || 
                        (req.body?.file as string) ||
                        req.path; // ❌ This is just '/read', not helpful
    
    const walletMatch = pathToCheck.match(/^\/(0x[a-fA-F0-9]{40})/);
    // ...
}
```

**Problem**: `req.path` is `/read`, not the file path. The file path is in `req.query.file`.

**Fix**: Already checks `req.query.file`, but might need to also check Referer header.

---

### Fix #2: Add Referer Header Token Extraction (CRITICAL)

**File**: `pc2-node/test-fresh-install/src/api/middleware.ts`

**Change**: Extract token from Referer header (like mock server):

```typescript
// Add after line 92 (after checking body.auth_token)
// Check Referer header for token (for app iframes)
if (!token && req.headers.referer) {
    try {
        const refererUrl = new URL(req.headers.referer);
        const refererToken = refererUrl.searchParams.get('puter.auth.token') ||
                             refererUrl.searchParams.get('token') ||
                             refererUrl.searchParams.get('auth_token');
        if (refererToken) {
            token = refererToken;
            logger.info('[Auth Middleware] Found token in Referer header', {
                tokenPrefix: refererToken.substring(0, 20) + '...'
            });
        }
    } catch (e) {
        // Invalid Referer URL, continue
    }
}
```

---

### Fix #3: Fallback to Existing Session for Mock Tokens (HIGH)

**File**: `pc2-node/test-fresh-install/src/api/middleware.ts`

**Change**: When mock token used, try to find existing session for wallet:

```typescript
// After extracting wallet from path (line 171)
if (!session && (token === 'mock-token' || token.startsWith('mock-token'))) {
    // ... extract wallet from path ...
    
    // ✅ NEW: If wallet extracted, try to find existing session
    if (mockWalletAddress !== '0x0000000000000000000000000000000000000000') {
        const existingSession = db.getSessionByWallet(mockWalletAddress);
        if (existingSession) {
            logger.info('[Auth Middleware] Found existing session for mock token wallet', {
                walletPrefix: mockWalletAddress.substring(0, 10) + '...',
                sessionTokenPrefix: existingSession.token.substring(0, 8) + '...'
            });
            // Use the real session instead of mock
            req.user = {
                wallet_address: existingSession.wallet_address,
                smart_account_address: existingSession.smart_account_address,
                session_token: existingSession.token
            };
            return next();
        }
    }
    
    // Fallback to mock user
    req.user = {
        wallet_address: mockWalletAddress,
        smart_account_address: null,
        session_token: token
    };
    return next();
}
```

---

### Fix #4: Make `/read` Endpoint More Permissive (MEDIUM)

**File**: `pc2-node/test-fresh-install/src/api/filesystem.ts`

**Change**: Allow `/read` to work without strict auth (like mock server):

**Option A**: Remove `authenticate` middleware, handle auth inline
**Option B**: Add special case in middleware for `/read` endpoint

**Recommendation**: Option B (safer, maintains security for other endpoints)

```typescript
// In middleware.ts, before checking for token
// Special case: /read endpoint - more permissive auth
if (req.path === '/read' || req.path.startsWith('/read')) {
    // Allow request to proceed even without valid session
    // Handler will check auth and return appropriate error
    // This matches mock server behavior
}
```

---

## File-by-File Comparison

### Authentication Middleware

| Feature | Mock Server | PC2 Node | Status |
|---------|-------------|----------|--------|
| Token from Authorization header | ✅ | ✅ | Match |
| Token from URL query params | ✅ | ✅ | Match |
| Token from Referer header | ✅ | ❌ | **MISSING** |
| Token from request body | ✅ | ✅ | Match |
| Fallback to existing sessions | ✅ | ❌ | **MISSING** |
| Mock token support | ✅ (in sessions) | ✅ (special case) | Different |
| Returns 401 vs 404 | 404 (file not found) | 401 (unauthorized) | **DIFFERENT** |

### `/read` Endpoint

| Feature | Mock Server | PC2 Node | Status |
|---------|-------------|----------|--------|
| Special case for `.__puter_gui.json` | ✅ (no auth) | ✅ (no auth) | Match |
| Multiple token sources | ✅ | ❌ | **MISSING** |
| Referer header checking | ✅ | ❌ | **MISSING** |
| Fallback to any session | ✅ | ❌ | **MISSING** |
| Error code for missing file | 404 | 401 | **DIFFERENT** |
| Range request support | ✅ | ❌ | **MISSING** |

### `/open_item` Endpoint

| Feature | Mock Server | PC2 Node | Status |
|---------|-------------|----------|--------|
| Returns app URL | ✅ | ✅ | Match |
| Returns signature with read_url | ✅ | ✅ | Match |
| Generates mock token | ✅ | ✅ | Match |
| Stores mock token in sessions | ✅ | ❌ | **MISSING** |

---

## Implementation Priority

### 🔴 CRITICAL (Blocks all file operations)

1. **Fix Referer header token extraction** - Viewer apps pass token in iframe URL
2. **Fix wallet extraction from query params** - Ensure `req.query.file` is checked
3. **Add fallback to existing sessions** - Use real session if wallet matches

### 🟡 HIGH (Causes poor UX)

4. **Change error codes** - Return 404 (not 401) for missing files
5. **Add Range request support** - Video seeking requires this

### 🟢 MEDIUM (Nice to have)

6. **Store mock tokens in database** - Match mock server behavior exactly
7. **Add session fallback in `/read` handler** - More permissive like mock server

---

## Testing Checklist

After fixes, verify:

- [ ] Viewer app can open and display images
- [ ] Player app can play videos with seeking
- [ ] Files can be dropped on desktop
- [ ] Files can be dropped in explorer windows
- [ ] Files appear immediately after upload
- [ ] "Open With" shows app options
- [ ] Files can be opened by double-click
- [ ] No 401 errors in console
- [ ] No grey screens

---

## Next Steps

1. Implement Fix #1, #2, #3 (CRITICAL)
2. Test with viewer/player apps
3. Implement Fix #4 if still needed
4. Add Range request support for video
5. Update error codes to match mock server
