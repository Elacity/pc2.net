# How to Start PC2 Node

## Quick Start

```bash
cd /Users/mtk/Documents/Cursor/pc2.net/pc2-node/test-fresh-install
PORT=4202 npm start
```

**OR** use the helper script:

```bash
cd /Users/mtk/Documents/Cursor/pc2.net/pc2-node/test-fresh-install
./START_SERVER.sh
```

## What You'll See

1. ✅ Configuration loaded
2. ✅ Database initialized
3. ❌ IPFS will fail (needs Node 22+) - **THIS IS OK!**
4. ⚠️ File storage will not be available - **THIS IS OK!**
5. 🚀 **PC2 Node running on http://localhost:4202** ← **THIS IS WHAT YOU WANT!**

## Important

**The server WILL start even if IPFS fails!** 

You'll see warnings, but the server will keep running. You can test:
- ✅ All API endpoints
- ✅ Authentication
- ✅ Database operations
- ✅ Health checks

## Test It

Once you see "🚀 PC2 Node running on http://localhost:4202", open:

**http://localhost:4202**

You'll see a test interface!

## If It Crashes

If the server crashes immediately, check:
1. Is port 4202 already in use? `lsof -i :4202`
2. Check the error message - it will tell you what's wrong

## Stop the Server

Press `Ctrl+C` in the terminal where it's running.

