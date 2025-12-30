# WASMER Simple Showcase: Executing WASM on PC2 Node
## Goal: Demonstrate WASMER Runtime Executing WASM Binaries

**Date:** January 25, 2025  
**Goal:** Show WASMER executing WASM binaries on PC2 node (simple showcase, no dDRM)

---

## ✅ **CONFIRMED: Strategy Aligns with PC2 Mission**

**PC2 Core Principles:**
- ✅ **Self-Contained:** Everything runs on user's PC2 node
- ✅ **Self-Hosted:** User controls hardware, data, and software
- ✅ **No External Dependencies:** No reliance on external services
- ✅ **Completely Isolated:** Runs locally on user's node

**This Strategy:**
- ✅ WASM binaries stored **locally** on user's PC2 node (`data/wasm-apps/`)
- ✅ WASMER runtime runs **locally** on user's node (Node.js package)
- ✅ Execution happens **locally** (no external API calls)
- ✅ **Zero external dependencies** (once npm package is installed)
- ✅ **Completely isolated** - works offline, no internet required

**Future Evolution (Not Now):**
- Later: Blockchain index for WASM apps
- Later: dDRM for digital rights
- Later: Tradable WASM apps
- **Now:** Just local execution = proof of concept

---

## 🎯 The Simple Goal

**What You Want:**
- Install WASMER runtime on PC2 node (local npm package)
- Store WASM binary **on user's PC2 node** (local file)
- Execute WASM **locally** on user's node
- Show it working in the PC2 environment
- Demonstrate: "PC2 can run WASM apps **completely locally**"

**What You DON'T Need (Yet):**
- ❌ dDRM system
- ❌ Marketplace
- ❌ Blockchain integration
- ❌ External services
- ❌ Internet connectivity for execution

**Just:** WASMER runtime (local) + WASM binary (local) = **completely self-contained showcase**

---

## 🏗️ How It Works (Simple Architecture)

```
┌─────────────────────────────────────────┐
│         PC2 NODE (Backend)              │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐  │
│  │  WASMER Runtime Service         │  │
│  │  - Loads WASM binary            │  │
│  │  - Executes WASM functions      │  │
│  │  - Returns results              │  │
│  └─────────────────────────────────┘  │
│                                         │
│  ┌─────────────────────────────────┐  │
│  │  API Endpoint                   │  │
│  │  POST /api/wasm/execute         │  │
│  │  - Receives WASM binary          │  │
│  │  - Calls WASMER runtime          │  │
│  │  - Returns execution result      │  │
│  └─────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
         ▲
         │
         │ HTTP Request
         │ (WASM binary + function call)
         │
┌────────┴────────┐
│  Frontend (GUI) │
│  - User clicks  │
│  - Sends WASM   │
│  - Shows result │
└─────────────────┘
```

---

## 🚀 Implementation Steps (Simple Version)

### Step 1: Install WASMER Runtime (Node.js)

**Option A: Use `@wasmer/wasi` (Recommended for Node.js)**
```bash
cd pc2-node/test-fresh-install
npm install @wasmer/wasi
```

**Option B: Use `wasmtime` (More features, Rust-based)**
```bash
# Install wasmtime CLI
curl https://wasmtime.dev/install.sh -sSfL | sh

# Or use wasmtime Node.js bindings
npm install wasmtime
```

**Option C: Use `wasmer` CLI (Cross-platform)**
```bash
curl https://get.wasmer.io -sSfL | sh
```

**Recommendation:** Start with **Option A** (`@wasmer/wasi`) - it's pure Node.js, **completely self-contained**:
- ✅ No external services required
- ✅ Works offline (once installed)
- ✅ Runs entirely on user's PC2 node
- ✅ No internet connectivity needed for execution
- ✅ Aligns perfectly with PC2's self-contained mission

---

### Step 2: Create WASM Runtime Service

**File:** `pc2-node/test-fresh-install/src/services/wasm/WASMRuntime.ts`

```typescript
import { init, WASI } from '@wasmer/wasi';
import { WasmFs } from '@wasmer/wasmfs';

export class WASMRuntime {
    private wasmFs: WasmFs;
    private wasi: WASI | null = null;

    constructor() {
        this.wasmFs = new WasmFs();
    }

    /**
     * Initialize WASMER runtime
     */
    async initialize(): Promise<void> {
        await init();
    }

    /**
     * Execute a WASM binary
     * @param wasmBinary - The WASM binary (ArrayBuffer or Uint8Array)
     * @param functionName - Name of the function to call
     * @param args - Arguments to pass to the function
     * @returns Execution result
     */
    async execute(
        wasmBinary: ArrayBuffer | Uint8Array,
        functionName: string,
        args: any[] = []
    ): Promise<any> {
        try {
            // Create WASI instance
            const wasi = new WASI({
                env: {},
                args: [],
                preopens: {
                    '/': '/',
                },
                wasmFs: this.wasmFs,
            });

            // Instantiate WASM module
            const wasmModule = await WebAssembly.instantiate(wasmBinary, {
                wasi_snapshot_preview1: wasi.wasiImport,
            });

            // Get the function
            const instance = wasmModule.instance;
            const func = (instance.exports as any)[functionName];

            if (!func) {
                throw new Error(`Function ${functionName} not found in WASM module`);
            }

            // Execute the function
            const result = func(...args);

            return {
                success: true,
                result: result,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Load WASM binary from file path
     */
    async loadFromFile(filePath: string): Promise<ArrayBuffer> {
        const fs = require('fs');
        return fs.readFileSync(filePath).buffer;
    }

    /**
     * Load WASM binary from IPFS CID
     */
    async loadFromIPFS(cid: string): Promise<ArrayBuffer> {
        // Use your IPFS service to fetch
        // const ipfs = require('./IPFSService');
        // return await ipfs.get(cid);
        throw new Error('IPFS loading not implemented yet');
    }
}
```

---

### Step 3: Create API Endpoint

**File:** `pc2-node/test-fresh-install/src/api/wasm.ts`

```typescript
import express from 'express';
import { WASMRuntime } from '../services/wasm/WASMRuntime.js';
import { authenticate } from './middleware.js';

const router = express.Router();
const wasmRuntime = new WASMRuntime();

// Initialize runtime on startup
wasmRuntime.initialize().catch(console.error);

/**
 * Execute WASM binary
 * POST /api/wasm/execute
 */
router.post('/execute', authenticate, async (req, res) => {
    try {
        const { wasmBinary, functionName, args } = req.body;

        if (!wasmBinary || !functionName) {
            return res.status(400).json({
                error: 'Missing required fields: wasmBinary, functionName',
            });
        }

        // Convert base64 to ArrayBuffer if needed
        let binary: ArrayBuffer;
        if (typeof wasmBinary === 'string') {
            // Assume base64
            const buffer = Buffer.from(wasmBinary, 'base64');
            binary = buffer.buffer;
        } else {
            binary = wasmBinary;
        }

        // Execute WASM
        const result = await wasmRuntime.execute(binary, functionName, args || []);

        if (result.success) {
            res.json({
                success: true,
                result: result.result,
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error,
            });
        }
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * Execute WASM from file path (for pre-installed apps)
 * POST /api/wasm/execute-file
 */
router.post('/execute-file', authenticate, async (req, res) => {
    try {
        const { filePath, functionName, args } = req.body;

        if (!filePath || !functionName) {
            return res.status(400).json({
                error: 'Missing required fields: filePath, functionName',
            });
        }

        // Load WASM from file
        const binary = await wasmRuntime.loadFromFile(filePath);

        // Execute
        const result = await wasmRuntime.execute(binary, functionName, args || []);

        if (result.success) {
            res.json({
                success: true,
                result: result.result,
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error,
            });
        }
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

export default router;
```

**Register in:** `pc2-node/test-fresh-install/src/api/index.ts`

```typescript
import wasmRouter from './wasm.js';
app.use('/api/wasm', wasmRouter);
```

---

### Step 4: Create Simple WASM Binary (Calculator Example)

**Option A: Use Existing WASM Binary**
- Download a simple calculator WASM from GitHub
- Or compile from Rust/C/C++

**Option B: Create Simple WASM (Rust Example)**

**File:** `tools/wasm-calculator/src/lib.rs`

```rust
#[no_mangle]
pub extern "C" fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[no_mangle]
pub extern "C" fn subtract(a: i32, b: i32) -> i32 {
    a - b
}

#[no_mangle]
pub extern "C" fn multiply(a: i32, b: i32) -> i32 {
    a * b
}

#[no_mangle]
pub extern "C" fn divide(a: i32, b: i32) -> i32 {
    if b == 0 {
        return 0; // Error handling
    }
    a / b
}
```

**Compile:**
```bash
cd tools/wasm-calculator
cargo build --target wasm32-wasi --release
# Output: target/wasm32-wasi/release/calculator.wasm
```

**Copy to PC2 (Local Storage):**
```bash
# WASM binary stored LOCALLY on user's PC2 node
# No external storage, no cloud, completely self-contained
cp target/wasm32-wasi/release/calculator.wasm \
   pc2-node/test-fresh-install/data/wasm-apps/calculator.wasm
```

**Key Point:** WASM binary is stored **locally on user's PC2 node**, not in cloud or external service. This is **completely self-contained**.

---

### Step 5: Create Frontend UI (Optional - For Showcase)

**File:** `src/gui/src/UI/Apps/UIWASMCalculator.js`

```javascript
export default async function UIWASMCalculator() {
    let h = '';
    h += `<div class="wasm-calculator-window">`;
    h += `<h1>WASMER Calculator (WASM)</h1>`;
    h += `<div class="calculator-display" id="calc-display">0</div>`;
    h += `<div class="calculator-buttons">`;
    // ... button grid
    h += `</div>`;
    h += `</div>`;

    // Event handlers
    $(document).on('click', '.calc-btn', async function() {
        const operation = $(this).data('op');
        const a = parseInt($('#calc-a').val() || '0');
        const b = parseInt($('#calc-b').val() || '0');

        // Call WASM via API
        const response = await fetch('/api/wasm/execute-file', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.user?.auth_token}`,
            },
            body: JSON.stringify({
                filePath: 'data/wasm-apps/calculator.wasm',
                functionName: operation, // 'add', 'subtract', etc.
                args: [a, b],
            }),
        });

        const result = await response.json();
        if (result.success) {
            $('#calc-display').text(result.result);
        } else {
            alert('Error: ' + result.error);
        }
    });

    return h;
}
```

---

## 📦 Quick Start: Minimal Implementation

### Minimal Setup (2-3 hours)

1. **Install WASMER:**
   ```bash
   cd pc2-node/test-fresh-install
   npm install @wasmer/wasi
   ```

2. **Create WASM Runtime Service:**
   - Copy the `WASMRuntime.ts` code above
   - Create `src/services/wasm/WASMRuntime.ts`

3. **Create API Endpoint:**
   - Copy the `wasm.ts` code above
   - Create `src/api/wasm.ts`
   - Register in `src/api/index.ts`

4. **Get a Simple WASM Binary:**
   - Download a simple WASM calculator from GitHub
   - Or use a test WASM binary
   - Place in `data/wasm-apps/calculator.wasm`

5. **Test via API:**
   ```bash
   curl -X POST http://localhost:4202/api/wasm/execute-file \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{
       "filePath": "data/wasm-apps/calculator.wasm",
       "functionName": "add",
       "args": [5, 3]
     }'
   ```

6. **Expected Response:**
   ```json
   {
     "success": true,
     "result": 8
   }
   ```

---

## 🎯 Showcase Demo Flow

**What You Can Show:**

1. **Terminal Demo:**
   ```bash
   # Show WASM binary exists
   ls -lh data/wasm-apps/calculator.wasm
   
   # Execute via API
   curl -X POST http://localhost:4202/api/wasm/execute-file ...
   
   # Show result: {"success": true, "result": 8}
   ```

2. **GUI Demo:**
   - Open calculator app in PC2
   - User enters: 5 + 3
   - Click "="
   - Shows: "8" (executed via WASMER)

3. **Code Demo:**
   - Show WASM binary file
   - Show WASMER runtime loading it
   - Show execution result
   - "This is running on your PC2 node via WASMER"

---

## 🔍 How It Works (Technical Flow)

```
1. User Action
   ↓
2. Frontend sends HTTP request to /api/wasm/execute-file
   ↓
3. Backend receives request
   ↓
4. WASMRuntime.loadFromFile() reads WASM binary from disk
   ↓
5. WASMRuntime.execute() loads WASM module
   ↓
6. WASMER runtime (WASI) instantiates WASM
   ↓
7. WASM function is called with arguments
   ↓
8. WASM executes (pure computation, sandboxed)
   ↓
9. Result returned to backend
   ↓
10. Backend sends JSON response
   ↓
11. Frontend displays result
```

---

## ✅ Success Criteria

**Minimal Showcase Works When:**
- [ ] WASMER runtime installed on PC2 node
- [ ] WASM binary can be loaded from file
- [ ] WASM function can be executed
- [ ] Result is returned correctly
- [ ] Can demonstrate: "WASMER executing WASM on PC2"

**Showcase Ready When:**
- [ ] Simple calculator WASM works
- [ ] Can execute via API
- [ ] Can show in terminal: "WASMER is running"
- [ ] Can show in GUI: "Calculator powered by WASMER"

---

## 🚀 Next Steps After Showcase

Once basic execution works:

1. **Add More WASM Apps:**
   - Notes app (WASM)
   - Clock app (WASM)
   - Unit converter (WASM)

2. **Add App Management:**
   - List installed WASM apps
   - Install new WASM apps
   - Uninstall apps

3. **Add Tool Registration:**
   - WASM apps can register tools
   - AI agents can use WASM tools

4. **Add Marketplace (Future):**
   - Browse WASM apps
   - Install from IPFS
   - dDRM integration (later)

---

## 💡 Key Points

**What WASMER Does:**
- Executes WASM binaries **locally** on user's PC2 node (Node.js)
- Provides sandboxed environment
- Allows cross-platform execution
- Enables app extensibility
- **Completely self-contained** - no external services

**What You're Showcasing:**
- "PC2 can run WASM apps **completely locally**"
- "WASMER runtime is working **on your node**"
- "Apps execute **on your hardware**"
- "**Zero external dependencies** for execution"
- "Foundation for app ecosystem"

**PC2 Mission Alignment:**
- ✅ **Self-Contained:** Everything on user's node
- ✅ **Self-Hosted:** User controls execution
- ✅ **Isolated:** No external services required
- ✅ **Sovereign:** User owns and controls everything

**Not Showing (Yet):**
- dDRM (digital rights) - future
- Marketplace - future
- Blockchain integration - future
- Complex app management - future

**Just:** Simple **local** execution = proof of concept

**Future Evolution:**
- Later: Add blockchain index (apps registered on-chain)
- Later: Add dDRM (encrypted, tradable apps)
- Later: Add marketplace (discover apps)
- **Now:** Just prove WASM executes locally = foundation

---

## 📝 Implementation Checklist

- [ ] Install `@wasmer/wasi` package
- [ ] Create `WASMRuntime.ts` service
- [ ] Create `/api/wasm/execute-file` endpoint
- [ ] Get/create simple WASM binary (calculator)
- [ ] Test execution via API
- [ ] Verify result is correct
- [ ] Document showcase demo
- [ ] **DONE: WASMER is working!**

---

**Time Estimate:** 2-3 hours for minimal showcase

**Result:** You can demonstrate WASMER executing WASM binaries on your PC2 node!

