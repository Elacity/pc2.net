# AuthProvider Interface

This document describes the authentication flow between the Elastos Cloud OS frontend and your DePIN backend.

## Current Implementation

The frontend uses **Particle Network** for decentralized wallet authentication. This is already implemented and working.

## Authentication Flow

```
┌──────────────┐     ┌─────────────────┐     ┌───────────────────┐
│   User       │     │  Elastos OS     │     │  DePIN Backend    │
│   (Wallet)   │     │  (Frontend)     │     │  (Your Hardware)  │
└──────┬───────┘     └────────┬────────┘     └─────────┬─────────┘
       │                      │                        │
       │  1. Click Login      │                        │
       │─────────────────────>│                        │
       │                      │                        │
       │  2. Particle Auth    │                        │
       │<────────────────────>│                        │
       │                      │                        │
       │  3. Return wallet    │                        │
       │      + smart account │                        │
       │─────────────────────>│                        │
       │                      │                        │
       │                      │  4. POST /auth/particle│
       │                      │  (wallet data)         │
       │                      │───────────────────────>│
       │                      │                        │
       │                      │                        │  5. Verify signature
       │                      │                        │     Create/find user
       │                      │                        │     Initialize IPFS folders
       │                      │                        │
       │                      │  6. Return session     │
       │                      │<───────────────────────│
       │                      │                        │
       │  7. Desktop loads    │                        │
       │<─────────────────────│                        │
       │                      │                        │
```

## API Endpoints

### POST /auth/particle

Authenticate a user via Particle Network wallet.

**Request:**
```json
{
  "address": "0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3",
  "chainId": 20,
  "smartAccountAddress": "0x7efe9dd20dab98e28b0116ae83c9799ea653b8c5",
  "particleUuid": "550e8400-e29b-41d4-a716-446655440000",
  "particleEmail": "user@example.com"
}
```

**Response (Success):**
```json
{
  "token": "session_token_here",
  "user": {
    "uuid": "user-uuid",
    "username": "0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3",
    "email": "user@example.com",
    "wallet_address": "0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3",
    "smart_account_address": "0x7efe9dd20dab98e28b0116ae83c9799ea653b8c5",
    "auth_type": "universalx",
    "is_temp": false,
    "email_confirmed": true
  }
}
```

**Response (Error):**
```json
{
  "error": {
    "code": "auth_failed",
    "message": "Invalid wallet signature"
  }
}
```

### GET /whoami

Get current authenticated user info.

**Request:**
```
GET /whoami
Authorization: Bearer {session_token}
```

**Response:**
```json
{
  "uuid": "user-uuid",
  "username": "0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3",
  "email": "user@example.com",
  "wallet_address": "0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3",
  "smart_account_address": "0x7efe9dd20dab98e28b0116ae83c9799ea653b8c5",
  "auth_type": "universalx",
  "is_temp": false,
  "email_confirmed": true,
  "taskbar_items": []
}
```

### POST /auth/logout

End user session.

**Request:**
```
POST /auth/logout
Authorization: Bearer {session_token}
```

**Response:**
```json
{
  "success": true
}
```

## Backend Implementation

### 1. Verify Wallet (Optional Extra Security)

For additional security, you can require a signed message:

```javascript
// Frontend would sign a message
const message = `Login to Elastos Cloud OS\nTimestamp: ${Date.now()}`;
const signature = await wallet.signMessage(message);

// Backend verifies
const recoveredAddress = ethers.verifyMessage(message, signature);
if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
  throw new Error('Invalid signature');
}
```

### 2. User Management

```javascript
// Create or find user by wallet address
async function findOrCreateUser(walletData) {
  let user = await db.users.findOne({ 
    wallet_address: walletData.address.toLowerCase() 
  });
  
  if (!user) {
    user = await db.users.create({
      uuid: generateUUID(),
      username: walletData.address,
      wallet_address: walletData.address.toLowerCase(),
      smart_account_address: walletData.smartAccountAddress?.toLowerCase(),
      email: walletData.particleEmail,
      auth_type: walletData.smartAccountAddress ? 'universalx' : 'wallet',
      created_at: new Date()
    });
    
    // Initialize IPFS folders for new user
    await initializeUserFolders(user.wallet_address);
  }
  
  return user;
}
```

### 3. Initialize User Folders

When a new user is created, set up their IPFS directory structure:

```javascript
async function initializeUserFolders(walletAddress) {
  const basePath = `/${walletAddress}`;
  const folders = [
    'Desktop',
    'Documents', 
    'Pictures',
    'Videos',
    'Public',
    'AppData',
    'Trash'
  ];
  
  // Create root
  await ipfs.files.mkdir(basePath, { parents: true });
  
  // Create subfolders
  for (const folder of folders) {
    await ipfs.files.mkdir(`${basePath}/${folder}`, { parents: true });
  }
}
```

### 4. Session Management

```javascript
// Generate session token
function createSession(user) {
  return jwt.sign(
    { 
      userId: user.uuid,
      wallet: user.wallet_address 
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Verify session token (middleware)
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

## Integration with Existing Particle Auth

The frontend Particle authentication is already set up in:
- `submodules/particle-auth/` - Particle SDK integration
- `src/gui/src/UI/UIWindowParticleLogin.js` - Login UI
- `src/backend/src/routers/auth/particle.js` - Backend endpoint

Your backend just needs to implement the same `/auth/particle` endpoint format.

## Wallet Login (Your Implementation)

If you want to add direct wallet login (without Particle), you can:

1. Add a "Connect Wallet" button
2. Use ethers.js or viem to connect
3. Sign a login message
4. Send to your backend for verification

```javascript
// Example direct wallet login
async function walletLogin() {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  
  const message = `Login to Elastos Cloud OS\nTimestamp: ${Date.now()}`;
  const signature = await signer.signMessage(message);
  
  const response = await fetch('/auth/wallet', {
    method: 'POST',
    body: JSON.stringify({ address, message, signature })
  });
  
  return response.json();
}
```

This can work alongside the existing Particle authentication.
