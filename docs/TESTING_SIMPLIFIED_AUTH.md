# Testing Simplified Authentication Flow

**Date:** 2025-01-12  
**Status:** Testing Guide

---

## 🧪 Test Scenarios

### Test 1: First-Time Setup (Auto-Admin Assignment)

**Steps:**
1. Clear state file (if exists):
   ```bash
   rm /tmp/pc2-mock-state.json
   ```

2. Start mock server:
   ```bash
   node tools/mock-pc2-server.cjs
   ```

3. Open browser: `http://127.0.0.1:4200`

4. Click "Connect Wallet" and authenticate with Wallet A (e.g., `0x34DAF31B...`)

5. **Expected Result:**
   - ✅ Wallet A is automatically set as admin
   - ✅ Authentication succeeds
   - ✅ Desktop loads
   - ✅ Server logs show: "No admin wallet configured - setting [Wallet A] as admin"

**Verify:**
```bash
# Check state file
cat /tmp/pc2-mock-state.json | jq '.nodeState.ownerWallet'
# Should show: "0x34DAF31B..."
```

---

### Test 2: Admin Wallet Login (Valid)

**Steps:**
1. With Wallet A already set as admin (from Test 1)

2. Log out (if logged in)

3. Log in again with Wallet A

4. **Expected Result:**
   - ✅ Authentication succeeds
   - ✅ Desktop loads
   - ✅ Server logs show: "Authenticated admin user: [Wallet A]"

**Verify:**
```bash
# Check whoami endpoint
curl -H "Authorization: Bearer [TOKEN]" http://127.0.0.1:4200/whoami | jq '.user.wallet_address'
# Should show Wallet A address
```

---

### Test 3: Non-Admin Wallet Rejection

**Steps:**
1. With Wallet A set as admin

2. Try to authenticate with Wallet B (different wallet)

3. **Expected Result:**
   - ❌ Authentication rejected
   - ❌ Error message: "Only admin wallet can authenticate to this PC2 node"
   - ❌ Desktop does NOT load
   - ✅ Server logs show: "Authentication rejected: [Wallet B] is not the admin wallet"

**Verify:**
```bash
# Check server logs
tail -f /tmp/pc2-mock-server.log | grep "Authentication rejected"
# Should show rejection message
```

---

### Test 4: Session Validation (Admin Only)

**Steps:**
1. Create a session with Wallet A (admin)

2. Manually modify state file to change session wallet to Wallet B (non-admin)

3. Try to access `/whoami` with that session token

4. **Expected Result:**
   - ❌ Returns unauthenticated state (`user: null`)
   - ✅ Server logs show: "Session wallet [Wallet B] is not admin wallet"

---

### Test 5: Session Persistence (7 Days)

**Steps:**
1. Authenticate with admin wallet

2. Close browser

3. Reopen browser and visit `http://127.0.0.1:4200`

4. **Expected Result:**
   - ✅ Session still valid (within 7 days)
   - ✅ Auto-login works
   - ✅ Desktop loads without re-authentication

---

## 🔍 Manual Testing Commands

### Check Current Admin Wallet
```bash
cat /tmp/pc2-mock-state.json | jq '.nodeState.ownerWallet'
```

### Check Active Sessions
```bash
cat /tmp/pc2-mock-state.json | jq '.nodeState.sessions'
```

### Test Authentication Endpoint
```bash
# Replace with actual wallet address
curl -X POST http://127.0.0.1:4200/auth/particle \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0x34DAF31B99B5A59cEB18E424Dbc112FA6e5f3Dc3",
    "smartAccountAddress": "0x7Efe9dd20dAB98e28b0116aE83c9799eA653B8C5"
  }' | jq '.'
```

### Test Whoami Endpoint
```bash
# Replace with actual token from auth response
curl -H "Authorization: Bearer [TOKEN]" \
  http://127.0.0.1:4200/whoami | jq '.'
```

### Clear State (Reset to First-Time Setup)
```bash
rm /tmp/pc2-mock-state.json
# Restart server
pkill -f mock-pc2-server
node tools/mock-pc2-server.cjs
```

---

## ✅ Expected Behavior Summary

| Scenario | Wallet | Result | Error Message |
|----------|--------|--------|---------------|
| First login | Any | ✅ Auto-set as admin | None |
| Admin login | Admin | ✅ Success | None |
| Non-admin login | Non-admin | ❌ Rejected | "Only admin wallet can authenticate" |
| Admin session | Admin | ✅ Valid | None |
| Non-admin session | Non-admin | ❌ Invalid | Returns `user: null` |

---

## 🐛 Troubleshooting

### Issue: "No admin wallet configured" but wallet is rejected
**Solution:** Check state file - admin wallet might be set incorrectly. Clear state and restart.

### Issue: Session not persisting
**Solution:** Check state file location (`/tmp/pc2-mock-state.json`). Ensure server has write permissions.

### Issue: Multiple wallets can authenticate
**Solution:** Verify `/auth/particle` endpoint has admin wallet check. Check server logs for verification messages.

---

## 📝 Test Checklist

- [ ] First wallet auto-set as admin
- [ ] Admin wallet can authenticate
- [ ] Non-admin wallet rejected
- [ ] Session validation works
- [ ] 7-day session persistence
- [ ] Clear error messages
- [ ] Server logs show correct behavior























