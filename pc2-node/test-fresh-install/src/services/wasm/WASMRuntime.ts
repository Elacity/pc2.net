/**
 * WASM Runtime Service
 * Executes WASM binaries locally on PC2 node
 * Completely self-contained - no external dependencies
 */

import { logger } from '../../utils/logger.js';
import { init, WASI, MemFS } from '@wasmer/wasi';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

export interface WASMExecutionResult {
    success: boolean;
    result?: any;
    error?: string;
}

export class WASMRuntime {
    private memFs: MemFS | null = null;
    private initialized: boolean = false;

    constructor() {
        // Don't create MemFS here - wait for initialization
    }

    /**
     * Initialize WASMER runtime
     * Must be called before executing WASM binaries
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            await init();
            // Create MemFS after initialization
            this.memFs = new MemFS();
            this.initialized = true;
            logger.info('[WASMRuntime] Initialized successfully');
        } catch (error: any) {
            logger.error('[WASMRuntime] Initialization failed:', error);
            throw new Error(`Failed to initialize WASMER runtime: ${error.message}`);
        }
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
    ): Promise<WASMExecutionResult> {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.memFs) {
            throw new Error('WASMRuntime not properly initialized');
        }

        try {
            // Ensure wasmBinary is ArrayBuffer (convert Uint8Array if needed)
            let binaryBuffer: ArrayBuffer;
            if (wasmBinary instanceof Uint8Array) {
                // Create a new ArrayBuffer from Uint8Array to ensure proper type
                binaryBuffer = wasmBinary.buffer.slice(
                    wasmBinary.byteOffset,
                    wasmBinary.byteOffset + wasmBinary.byteLength
                ) as ArrayBuffer;
            } else {
                binaryBuffer = wasmBinary as ArrayBuffer;
            }

            // Compile WASM module
            const wasmModule = await WebAssembly.compile(binaryBuffer);

            // Check if module requires WASI by examining its imports
            const moduleImports = WebAssembly.Module.imports(wasmModule);
            const requiresWASI = moduleImports.some(
                (imp: any) => imp.module === 'wasi_snapshot_preview1' || 
                             imp.module === 'wasi_snapshot_preview2' ||
                             imp.module === 'wasi:cli'
            );

            logger.info(`[WASMRuntime] Module imports: ${moduleImports.map((i: any) => `${i.module}::${i.name}`).join(', ') || 'none'}`);
            logger.info(`[WASMRuntime] Module requires WASI: ${requiresWASI}`);

            // Try to instantiate with WASI first, fall back to standard WebAssembly if WASI fails
            let instance: WebAssembly.Instance;
            if (requiresWASI) {
                // Module requires WASI - must use WASI instantiation
                try {
                    // Create WASI instance
                    const wasi = new WASI({
                        env: {},
                        args: [],
                        preopens: {
                            '/': '/',
                        },
                        fs: this.memFs!,
                    });

                    // Get imports from WASI
                    const imports = wasi.getImports(wasmModule) as any;
                    logger.info(`[WASMRuntime] WASI imports provided: ${Object.keys(imports).length} import modules`);
                    logger.info(`[WASMRuntime] WASI import modules: ${Object.keys(imports).join(', ')}`);
                    
                    // Log what WASI is providing for wasi_snapshot_preview1
                    if (imports['wasi_snapshot_preview1']) {
                        const wasiImports = imports['wasi_snapshot_preview1'];
                        logger.info(`[WASMRuntime] WASI preview1 imports: ${Object.keys(wasiImports).join(', ')}`);
                    }

                    // Instantiate WASM module with WASI imports using WebAssembly.instantiate
                    // getImports() returns the import object for WebAssembly.instantiate
                    // WebAssembly.instantiate returns { instance, module }
                    const instantiationResult = await WebAssembly.instantiate(wasmModule, imports as any);
                    instance = (instantiationResult as any).instance || instantiationResult as WebAssembly.Instance;
                    logger.info('[WASMRuntime] ✅ Instantiated with WASI (module requires WASI)');
                    
                    // For WASI modules, we might need to call _start if it exists, but our calculator
                    // exports functions directly, so we don't need to call _start
                } catch (wasiError: any) {
                    // WASI instantiation failed for a WASI module - this is an error
                    logger.error('[WASMRuntime] ❌ WASI instantiation failed for WASI module:', wasiError);
                    throw new Error(`Failed to instantiate WASI module: ${wasiError.message}`);
                }
            } else {
                // Module doesn't require WASI - try standard WebAssembly instantiation
                try {
                    instance = await WebAssembly.instantiate(wasmModule, {
                        env: {},
                    });
                    logger.info('[WASMRuntime] ✅ Instantiated with standard WebAssembly (module does not require WASI)');
                } catch (stdError: any) {
                    // If standard instantiation fails, try with WASI as fallback
                    logger.info('[WASMRuntime] Standard instantiation failed, trying WASI as fallback:', stdError.message);
                    try {
                        const wasi = new WASI({
                            env: {},
                            args: [],
                            preopens: {
                                '/': '/',
                            },
                            fs: this.memFs!,
                        });
                        const imports = wasi.getImports(wasmModule);
                        const instantiationResult = await WebAssembly.instantiate(wasmModule, imports as any);
                        instance = (instantiationResult as any).instance || instantiationResult as WebAssembly.Instance;
                        logger.info('[WASMRuntime] ✅ Instantiated with WASI (fallback)');
                    } catch (wasiError: any) {
                        throw new Error(`Failed to instantiate WASM module: ${stdError.message}`);
                    }
                }
            }

            // Get the function
            const func = (instance.exports as any)[functionName];

            if (!func) {
                const availableFunctions = Object.keys(instance.exports).filter(
                    key => typeof (instance.exports as any)[key] === 'function'
                );
                throw new Error(
                    `Function "${functionName}" not found in WASM module. ` +
                    `Available functions: ${availableFunctions.join(', ')}`
                );
            }

            // Handle string arguments - if args contain strings, write them to WASM memory
            const processedArgs: any[] = [];
            let memory: WebAssembly.Memory | null = null;
            
            // Try to get memory from instance
            if (instance.exports.memory) {
                memory = instance.exports.memory as WebAssembly.Memory;
            }

            for (let i = 0; i < args.length; i++) {
                const arg = args[i];
                
                // If argument is a string and we have memory, write it to memory
                if (typeof arg === 'string' && memory) {
                    // Encode string to UTF-8 bytes
                    const encoder = new TextEncoder();
                    const bytes = encoder.encode(arg);
                    
                    // Allocate memory in WASM (we need an alloc function, or use a fixed offset)
                    // For now, try to find an alloc function or use a simple approach
                    // If the function expects (ptr, len), we'll write to a known safe location
                    // For simplicity, let's write to offset 1024 (safe area)
                    const offset = 1024;
                    const memView = new Uint8Array(memory.buffer);
                    
                    // Check if we have enough space
                    if (offset + bytes.length > memView.length) {
                        // Grow memory if needed
                        const pagesNeeded = Math.ceil((offset + bytes.length - memView.length) / 65536) + 1;
                        memory.grow(pagesNeeded);
                    }
                    
                    // Write bytes to memory
                    const newMemView = new Uint8Array(memory.buffer);
                    newMemView.set(bytes, offset);
                    
                    // Pass pointer and length
                    processedArgs.push(offset);
                    processedArgs.push(bytes.length);
                } else {
                    // Pass argument as-is
                    processedArgs.push(arg);
                }
            }

            // Execute the function with processed arguments
            const result = func(...processedArgs);

            logger.info(`[WASMRuntime] Executed function "${functionName}" with args:`, args, 'Result:', result);

            return {
                success: true,
                result: result,
            };
        } catch (error: any) {
            logger.error('[WASMRuntime] Execution failed:', error);
            return {
                success: false,
                error: error.message || 'Unknown error',
            };
        }
    }

    /**
     * Load WASM binary from file path (local to PC2 node)
     * @param filePath - Path to WASM file (relative to project root or absolute)
     * @returns WASM binary as ArrayBuffer
     */
    async loadFromFile(filePath: string): Promise<ArrayBuffer> {
        try {
            // Resolve path relative to project root (ES module compatible)
            // From dist/services/wasm/WASMRuntime.js, go up 3 levels to reach project root
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const projectRoot = path.resolve(__dirname, '../../..');
            const resolvedPath = path.isAbsolute(filePath) 
                ? filePath 
                : path.join(projectRoot, filePath);

            // Check if file exists
            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`WASM file not found: ${resolvedPath}`);
            }

            // Read file
            const buffer = fs.readFileSync(resolvedPath);
            logger.info(`[WASMRuntime] Loaded WASM binary from: ${resolvedPath} (${buffer.length} bytes)`);

            return buffer.buffer;
        } catch (error: any) {
            logger.error('[WASMRuntime] Failed to load WASM file:', error);
            throw new Error(`Failed to load WASM file: ${error.message}`);
        }
    }

    /**
     * List available WASM functions in a binary
     * @param wasmBinary - The WASM binary
     * @returns Array of function names
     */
    async listFunctions(wasmBinary: ArrayBuffer | Uint8Array): Promise<string[]> {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.memFs) {
            throw new Error('WASMRuntime not properly initialized');
        }

        try {
            // Ensure wasmBinary is ArrayBuffer (convert Uint8Array if needed)
            let binaryBuffer: ArrayBuffer;
            if (wasmBinary instanceof Uint8Array) {
                // Create a new ArrayBuffer from Uint8Array to ensure proper type
                binaryBuffer = wasmBinary.buffer.slice(
                    wasmBinary.byteOffset,
                    wasmBinary.byteOffset + wasmBinary.byteLength
                ) as ArrayBuffer;
            } else {
                binaryBuffer = wasmBinary as ArrayBuffer;
            }

            const wasmModule = await WebAssembly.compile(binaryBuffer);
            
            // Try to instantiate with WASI first, fall back to standard WebAssembly if WASI fails
            let instance: WebAssembly.Instance;
            try {
                const wasi = new WASI({
                    env: {},
                    args: [],
                    preopens: {
                        '/': '/',
                    },
                    fs: this.memFs!,
                });
                const imports = wasi.getImports(wasmModule);
                instance = wasi.instantiate(wasmModule, imports);
            } catch (wasiError: any) {
                // If WASI fails, try standard WebAssembly instantiation
                instance = await WebAssembly.instantiate(wasmModule, {
                    env: {},
                });
            }

            const functions = Object.keys(instance.exports).filter(
                key => typeof (instance.exports as any)[key] === 'function'
            );

            return functions;
        } catch (error: any) {
            logger.error('[WASMRuntime] Failed to list functions:', error);
            return [];
        }
    }
}

