/**
 * WASM Runtime Service
 * Executes WASM binaries locally on PC2 node
 * Completely self-contained - no external dependencies
 */
export interface WASMExecutionResult {
    success: boolean;
    result?: any;
    error?: string;
}
export declare class WASMRuntime {
    private memFs;
    private initialized;
    constructor();
    /**
     * Initialize WASMER runtime
     * Must be called before executing WASM binaries
     */
    initialize(): Promise<void>;
    /**
     * Execute a WASM binary
     * @param wasmBinary - The WASM binary (ArrayBuffer or Uint8Array)
     * @param functionName - Name of the function to call
     * @param args - Arguments to pass to the function
     * @returns Execution result
     */
    execute(wasmBinary: ArrayBuffer | Uint8Array, functionName: string, args?: any[]): Promise<WASMExecutionResult>;
    /**
     * Load WASM binary from file path (local to PC2 node)
     * @param filePath - Path to WASM file (relative to project root or absolute)
     * @returns WASM binary as ArrayBuffer
     */
    loadFromFile(filePath: string): Promise<ArrayBuffer>;
    /**
     * List available WASM functions in a binary
     * @param wasmBinary - The WASM binary
     * @returns Array of function names
     */
    listFunctions(wasmBinary: ArrayBuffer | Uint8Array): Promise<string[]>;
}
//# sourceMappingURL=WASMRuntime.d.ts.map