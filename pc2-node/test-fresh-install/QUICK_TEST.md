# Quick Test Guide

## ✅ Your Server IS Working!

Even though you see the IPFS error, **the server started successfully**! Look for this line:

```
🚀 PC2 Node running on http://localhost:4202
```

## 🧪 Test It Now (While Running)

**In a NEW terminal window**, run these commands:

### 1. Health Check
```bash
curl http://localhost:4202/health
```

### 2. Version
```bash
curl http://localhost:4202/version
```

### 3. Authentication
```bash
curl -X POST http://localhost:4202/auth/particle \
  -H "Content-Type: application/json" \
  -d '{"wallet_address":"0x1111111111111111111111111111111111111111"}'
```

### 4. Open Browser
Open: **http://localhost:4202**

You'll see a test interface where you can click buttons to test everything!

## 🔧 Fix the Crash

The crash happens because IPFS cleanup tries to use Node 22+ features. I've fixed this. To apply:

1. **Stop the server** (Ctrl+C in the terminal where it's running)

2. **Rebuild:**
```bash
cd /Users/mtk/Documents/Cursor/pc2.net/pc2-node
npm run build:backend
cp -r dist/* test-fresh-install/dist/
```

3. **Restart:**
```bash
cd test-fresh-install
PORT=4202 npm start
```

Now it should run without crashing!

## 📊 What Works Without IPFS

- ✅ All API endpoints
- ✅ Authentication
- ✅ Database operations
- ✅ File metadata (stored in SQLite)
- ⚠️ File content storage (needs IPFS or Node 22+)

The server is **fully functional** for testing everything except actual file content storage!

