# Development Workflow

## Quick Start

**For Development (Auto-reload on changes):**
```bash
cd /Users/mtk/Documents/Cursor/pc2.net/pc2-node/test-fresh-install
PORT=4202 npm run dev
```

This will:
- ✅ Run TypeScript directly (no compilation needed)
- ✅ Automatically reload when you change any `.ts` file
- ✅ No need to manually rebuild or restart
- ✅ No cached `dist/` folder issues

**For Production (Compiled):**
```bash
npm run build:backend
PORT=4202 npm start
```

## How It Works

### Development Mode (`npm run dev`)
- Uses `tsx` to run TypeScript directly from `src/`
- Watches all `.ts` files for changes
- Automatically restarts the server when files change
- **No `dist/` folder is used or needed**

### Production Mode (`npm start`)
- Compiles TypeScript to JavaScript in `dist/`
- Runs the compiled JavaScript
- Requires manual rebuild (`npm run build:backend`) after changes

## Important Notes

1. **Always use `npm run dev` for development** - it eliminates the need to rebuild
2. **Changes are picked up automatically** - just save your file and the server restarts
3. **No need to cancel/restart terminal** - `tsx watch` handles everything
4. **The `dist/` folder is ignored** - you only need it for production builds
5. **Runtime directories are ignored** - `data/`, `node_modules/`, `frontend/` are excluded from file watching to prevent unnecessary restarts when IPFS writes blocks or database updates occur

## Troubleshooting

### Old Code Running
If you see old code running:
1. Make sure you're using `npm run dev` (not `npm start`)
2. Check that `tsx` is installed: `npm list tsx`
3. Kill any old processes: `pkill -f "node.*4202"` or `pkill -f "tsx"`
4. Restart: `PORT=4202 npm run dev`

### Random Restarts
If the server restarts randomly (not when you edit code):
- **Cause**: `tsx --watch` was detecting file changes in `data/` (IPFS blocks, database writes)
- **Fix**: ✅ Already fixed - `data/`, `node_modules/`, `dist/`, `frontend/` are now ignored
- **Verification**: Server should only restart when you edit files in `src/`
