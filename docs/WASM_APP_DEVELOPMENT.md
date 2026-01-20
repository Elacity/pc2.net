# WASM App Development Guide for PC2 Node

This guide explains how to develop, build, and deploy WebAssembly (WASM) applications for the PC2 node.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [WASM vs WASI Modules](#wasm-vs-wasi-modules)
3. [Building WASM Apps](#building-wasm-apps)
4. [API Endpoints](#api-endpoints)
5. [Frontend App Integration](#frontend-app-integration)
6. [File I/O with WASI](#file-io-with-wasi)
7. [Testing and Debugging](#testing-and-debugging)
8. [App Registration](#app-registration)

---

## Architecture Overview

The PC2 node includes a WASM runtime powered by [@wasmer/wasi](https://github.com/wasmerio/wasmer-js). This enables running WebAssembly modules with optional WASI (WebAssembly System Interface) support for file I/O and other system operations.

```
┌─────────────────────────────────────────────────────────┐
│                    PC2 Node                              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │ Frontend App │───▶│  WASM API    │                   │
│  │   (HTML/JS)  │    │ /api/wasm/*  │                   │
│  └──────────────┘    └──────┬───────┘                   │
│                             │                            │
│                    ┌────────▼────────┐                   │
│                    │   WASMRuntime   │                   │
│                    │  (TypeScript)   │                   │
│                    └────────┬────────┘                   │
│                             │                            │
│            ┌────────────────┴────────────────┐          │
│            │                                  │          │
│     ┌──────▼──────┐                  ┌───────▼───────┐  │
│     │ Pure WASM   │                  │  WASI Module  │  │
│     │ (No WASI)   │                  │ (File I/O)    │  │
│     └─────────────┘                  └───────┬───────┘  │
│                                              │          │
│                                      ┌───────▼───────┐  │
│                                      │    MemFS      │  │
│                                      │ (In-Memory)   │  │
│                                      └───────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Key Components

- **WASMRuntime** (`pc2-node/src/services/wasm/WASMRuntime.ts`): Core runtime service that loads and executes WASM modules
- **WASM API** (`pc2-node/src/api/wasm.ts`): REST endpoints for WASM execution
- **MemFS**: In-memory filesystem for WASI modules (populated before execution)
- **Frontend Apps** (`pc2-node/frontend/apps/`): HTML/JS apps that call the WASM API

---

## WASM vs WASI Modules

### Pure WASM (No WASI)

Pure WASM modules are self-contained and don't need external system calls. They're simpler to develop and deploy.

**Characteristics:**
- No file system access
- No environment variables
- Functions operate on primitive types (numbers, memory pointers)
- Faster to instantiate

**Use cases:**
- Mathematical calculations
- Data processing algorithms
- Cryptographic operations

**Example: Calculator**

```rust
#[no_mangle]
pub extern "C" fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[no_mangle]
pub extern "C" fn multiply(a: i32, b: i32) -> i32 {
    a * b
}
```

### WASI Modules

WASI modules can access the file system, environment variables, and other system resources through the WASI interface.

**Characteristics:**
- File I/O via `std::fs` or WASI syscalls
- Environment variable access
- Requires pre-populating MemFS with input files
- Slightly slower due to WASI overhead

**Use cases:**
- File processing
- Text analysis
- Data transformation pipelines

**Example: File Processor**

```rust
use std::fs;

#[no_mangle]
pub extern "C" fn count_words(path_ptr: *const u8, path_len: usize) -> i32 {
    let path = unsafe {
        let slice = std::slice::from_raw_parts(path_ptr, path_len);
        std::str::from_utf8(slice).unwrap_or("")
    };
    
    match fs::read_to_string(path) {
        Ok(content) => content.split_whitespace().count() as i32,
        Err(_) => -1,
    }
}
```

---

## Building WASM Apps

### Prerequisites

- Rust with `wasm32-wasip1` target: `rustup target add wasm32-wasip1`
- Or: wasi-sdk for C/C++ projects

### Building with Rust

**For Pure WASM (no WASI):**

```bash
# Create project
cargo new --lib calculator
cd calculator

# Add to Cargo.toml:
[lib]
crate-type = ["cdylib"]

[profile.release]
opt-level = "s"  # Optimize for size
lto = true

# Build
cargo build --release --target wasm32-unknown-unknown

# Output: target/wasm32-unknown-unknown/release/calculator.wasm
```

**For WASI-enabled WASM:**

```bash
# Build with WASI target
cargo build --release --target wasm32-wasip1

# Output: target/wasm32-wasip1/release/your_module.wasm
```

### Building with C (using wasi-sdk)

```bash
# Install wasi-sdk from https://github.com/WebAssembly/wasi-sdk

# Compile
/path/to/wasi-sdk/bin/clang \
    --target=wasm32-wasi \
    -O2 \
    -o output.wasm \
    source.c
```

### Required Exports

All exported functions must use `#[no_mangle]` and `extern "C"`:

```rust
#[no_mangle]
pub extern "C" fn function_name(args...) -> return_type {
    // implementation
}
```

---

## API Endpoints

### Execute WASM Function

**POST /api/wasm/execute**

Execute a function from a WASM module stored in the data directory.

```json
{
  "module": "calculator",
  "function": "add",
  "args": [5, 3]
}
```

Response:
```json
{
  "success": true,
  "result": 8,
  "executionTimeMs": 2
}
```

### Execute from File

**POST /api/wasm/execute-file**

Execute a function from a WASM file in PC2 storage.

```json
{
  "wasmPath": "/path/to/module.wasm",
  "function": "process",
  "args": [42]
}
```

### Process File (WASI)

**POST /api/wasm/process-file**

Process a text file using the file-processor module.

```json
{
  "filePath": "/documents/readme.txt",
  "operation": "all"  // "all" | "words" | "lines" | "chars"
}
```

Response:
```json
{
  "success": true,
  "filePath": "/documents/readme.txt",
  "operation": "all",
  "result": {
    "words": 1250,
    "lines": 85,
    "chars": 7420,
    "bytes": 7420
  }
}
```

### List Functions

**GET /api/wasm/list-functions?module=calculator**

List available functions in a WASM module.

Response:
```json
{
  "success": true,
  "module": "calculator",
  "functions": ["add", "subtract", "multiply", "divide"]
}
```

### Runtime Stats

**GET /api/wasm/stats**

Get WASM runtime statistics.

Response:
```json
{
  "success": true,
  "stats": {
    "activeExecutions": 0,
    "maxConcurrent": 4,
    "queueLength": 0
  }
}
```

---

## Frontend App Integration

### App Structure

```
pc2-node/frontend/apps/
└── your-app/
    └── index.html  (self-contained HTML/CSS/JS)
```

### Example Frontend App

```html
<!DOCTYPE html>
<html>
<head>
    <title>My WASM App</title>
</head>
<body>
    <button id="runBtn">Run Calculation</button>
    <div id="result"></div>
    
    <script>
        document.getElementById('runBtn').addEventListener('click', async () => {
            try {
                const response = await fetch('/api/wasm/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        module: 'calculator',
                        function: 'add',
                        args: [10, 20]
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('result').textContent = 
                        `Result: ${data.result}`;
                } else {
                    document.getElementById('result').textContent = 
                        `Error: ${data.error}`;
                }
            } catch (error) {
                console.error('Execution failed:', error);
            }
        });
    </script>
</body>
</html>
```

---

## File I/O with WASI

### How MemFS Works

WASI modules run in an isolated environment with an in-memory filesystem (MemFS). Before execution, the PC2 node copies real files into MemFS at specified paths.

```typescript
// Internal flow in WASMRuntime:
1. Clear MemFS (ensure clean state)
2. For each input file:
   - Read real file from PC2 storage
   - Write to MemFS at WASI path
3. Execute WASM module
4. Module reads from MemFS paths
```

### Using inputFiles Option

When calling `execute()` programmatically:

```typescript
await wasmRuntime.execute(binary, 'process_file', [], {
    inputFiles: {
        '/path/on/pc2/storage/input.txt': '/input.txt'  // realPath -> wasiPath
    }
});
```

### Important Limitations

1. **Read-only access**: Currently, WASI modules can only read files, not write them back
2. **In-memory only**: Files are copied to memory, so very large files may cause issues
3. **Single execution**: MemFS is cleared between executions for isolation

---

## Testing and Debugging

### Local Testing with wasmtime

```bash
# Install wasmtime
curl https://wasmtime.dev/install.sh -sSf | bash

# Test pure WASM
wasmtime run --invoke add calculator.wasm 5 3

# Test WASI module with file
wasmtime run --mapdir /::./testdir file-processor.wasm /input.txt
```

### Debugging Tips

1. **Check function exports**: Use `wasm-objdump` or the list-functions API
2. **Verify WASI compatibility**: WASI modules must be compiled with `wasm32-wasip1` target
3. **Test in isolation**: Use wasmtime locally before deploying to PC2
4. **Check logs**: WASMRuntime logs all execution attempts and errors

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Function not found | Function not exported | Add `#[no_mangle]` and `extern "C"` |
| File not found in WASI | File not pre-populated | Use `inputFiles` option |
| Execution timeout | Long-running computation | Increase `timeoutMs` option |
| Memory limit exceeded | Large data processing | Increase `maxMemoryMb` option |

---

## App Registration

To add your app to the PC2 app launcher:

### 1. Place WASM Binary

Copy your `.wasm` file to: `pc2-node/data/wasm-apps/`

### 2. Create Frontend App

Create: `pc2-node/frontend/apps/your-app/index.html`

### 3. Register in info.ts

Edit `pc2-node/src/api/info.ts`:

```typescript
// Add icon to hardcodedIcons
'your-app': 'data:image/svg+xml;base64,...'

// Add to apps array
{
    name: 'your-app',
    title: 'Your App Title',
    uuid: 'app-your-app',
    icon: loadIconAsBase64('your-app'),
    description: 'Description of your app',
    index_url: `${baseUrl}/apps/your-app/index.html`
}
```

### 4. Build and Test

```bash
cd pc2-node
npm run build
npm start

# Open PC2 desktop and launch your app from the start menu
```

---

## Example Apps

### Calculator (Pure WASM)

- **Source**: `pc2-node/data/wasm-apps/calculator.wat` (WebAssembly Text)
- **Binary**: `pc2-node/data/wasm-apps/calculator.wasm`
- **Frontend**: `pc2-node/frontend/apps/calculator/index.html`
- **Functions**: add, subtract, multiply, divide

### File Analyzer (WASI)

- **Source**: `pc2-node/data/wasm-apps/file-processor.rs`
- **Binary**: `pc2-node/data/wasm-apps/file-processor.wasm`
- **Frontend**: `pc2-node/frontend/apps/file-processor/index.html`
- **Functions**: process_file, count_words, count_lines, count_chars

---

## Resource Limits

The WASM runtime enforces the following default limits:

| Resource | Default | Configurable |
|----------|---------|--------------|
| Concurrent executions | 4 | Yes (via config) |
| Execution timeout | 30 seconds | Yes (per execution) |
| Memory limit | 512 MB | Yes (per execution) |

Configure via `pc2.json`:

```json
{
  "wasm": {
    "maxConcurrent": 4,
    "defaultTimeoutMs": 30000,
    "defaultMaxMemoryMb": 512
  }
}
```

---

## Security Considerations

1. **Sandboxed execution**: WASM modules run in a sandboxed environment
2. **No network access**: WASI modules cannot make network requests
3. **Limited file access**: Only files explicitly provided via `inputFiles` are accessible
4. **Resource limits**: CPU and memory are constrained to prevent abuse
5. **Authenticated endpoints**: All WASM APIs require authentication

---

## Future Enhancements

- [ ] Write-back support for WASI file outputs
- [ ] Persistent module caching for faster subsequent loads
- [ ] WASM component model support
- [ ] Module signing and verification
- [ ] GPU acceleration for compatible workloads
