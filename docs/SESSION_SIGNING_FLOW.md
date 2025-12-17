# Session Signing Flow
## Simplified Authentication with 7-Day Sessions

**Date:** 2025-01-12  
**Status:** Implementation Guide

---

## 🎯 Core Principle

**Accessing PC2 URL = Connected by Default**

When you access your PC2 node's URL (e.g., `https://my-pc2.example.com`), you're already "connected" to that PC2. The connection status reflects your **authentication state**, not a separate connection.

---

## 🔐 Authentication & Session Flow

### Scenario 1: Valid Session (Within 7 Days)

```
1. User visits: https://my-pc2.example.com
   └───► ElastOS UI loads (served by PC2)

2. PC2 checks session:
   └───► Session token in cookie/localStorage?
   └───► Session valid? (not expired)
   └───► ✅ YES → Auto-login

3. User authenticated:
   └───► No signature needed
   └───► Desktop loads immediately
   └───► Status: "Connected"
```

**Signatures Required:** 0 (session still valid)

---

### Scenario 2: Session Expired (After 7 Days)

```
1. User visits: https://my-pc2.example.com
   └───► ElastOS UI loads

2. PC2 checks session:
   └───► Session expired?
   └───► ❌ YES → Show login

3. User clicks "Sign In":
   └───► Particle Auth modal appears

4. User signs message with wallet:
   └───► This signature does TWO things:
       ├───► 1. Authenticates wallet (verifies it's admin)
       └───► 2. Creates new session (7 days)

5. New session created:
   └───► Session token stored
   └───► Desktop loads
   └───► Status: "Connected"
```

**Signatures Required:** 1 (Particle Auth signature that authenticates wallet + creates session)

---

## 📝 Clarification: "2 Signatures"

The user mentioned "2 signatures" when session expires. Here's what actually happens:

### What User Sees:
1. **Particle Auth signature** - User signs message with wallet
2. **Session creation** - Happens automatically after signature

### What Actually Happens:
- **One signature** (Particle Auth) that:
  - Authenticates the wallet (verifies it's admin)
  - Creates a new 7-day session
  - Both happen in the same authentication flow

### Why It Feels Like "2 Signatures":
- User might think:
  - Signature 1: "I am the admin wallet"
  - Signature 2: "Create a new session"
- But in reality, it's **one signature** that does both

---

## 🔄 Updated Flow (Current Implementation)

### When Session is Valid:
```
User → PC2 URL → Auto-login (no signature) → Desktop
```

### When Session Expired:
```
User → PC2 URL → Particle Auth → Sign message (1 signature) → 
  ├───► Verify admin wallet ✅
  └───► Create new session ✅
  └───► Desktop loads
```

---

## ✅ Status Bar Behavior

### When Authenticated:
- **Status:** "Connected" (green dot)
- **Action:** "Sign Out" (logs out, clears session)

### When Not Authenticated:
- **Status:** "Not Connected" (orange dot)
- **Action:** "Sign In" (triggers Particle Auth)

---

## 🎯 Key Points

1. **Connected by Default**
   - Accessing PC2 URL = already connected
   - Status reflects authentication, not connection

2. **One Signature Flow**
   - Particle Auth signature authenticates wallet + creates session
   - No separate "session signature" needed

3. **Session Expiration**
   - After 7 days, session expires
   - User needs to sign again (one signature)
   - New session created automatically

4. **Auto-Login**
   - If session valid → no signature needed
   - Desktop loads immediately

---

## 🔧 Implementation Details

### Status Bar Logic:
```javascript
// In PC2 mode, connection status = authentication status
const isPC2Mode = window.api_origin === window.location.origin;
const isAuthenticated = window.is_auth && window.is_auth();

if (isPC2Mode) {
    if (isAuthenticated) {
        status = 'connected'; // Green dot
        action = 'Sign Out';
    } else {
        status = 'disconnected'; // Orange dot
        action = 'Sign In'; // Triggers Particle Auth
    }
}
```

### Authentication Flow:
```javascript
// When user clicks "Sign In"
UIWindowParticleLogin({ reload_on_success: false })
  └───► Particle Auth modal
  └───► User signs message
  └───► POST /auth/particle
      ├───► Verify wallet is admin ✅
      └───► Create session (7 days) ✅
  └───► Desktop loads
```

---

## 📋 Summary

**Your understanding is correct!**

- ✅ When you sign in, you're connected to PC2 by default
- ✅ Status reflects authentication (not separate connection)
- ✅ If session expired, you sign once (Particle Auth)
- ✅ That one signature authenticates wallet + creates session
- ✅ No separate "session signature" needed

**The "2 signatures" you mentioned is actually:**
- One signature (Particle Auth) that does both:
  1. Authenticates wallet (verifies admin)
  2. Creates new session (7 days)

Both happen automatically in the same authentication flow! 🎉






















