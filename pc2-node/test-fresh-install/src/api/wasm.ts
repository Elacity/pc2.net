/**
 * WASM API Endpoints
 * 
 * Execute WASM binaries locally on PC2 node
 * Completely self-contained - no external dependencies
 */

import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from './middleware.js';
import { logger } from '../utils/logger.js';
import { WASMRuntime } from '../services/wasm/WASMRuntime.js';

const router = Router();
const wasmRuntime = new WASMRuntime();

// Initialize runtime on startup
wasmRuntime.initialize().catch((error) => {
    logger.error('[WASM API] Failed to initialize WASMER runtime:', error);
});

/**
 * POST /api/wasm/execute-file
 * Execute a WASM function from a local file
 * 
 * Body:
 * {
 *   "filePath": "data/wasm-apps/calculator.wasm",
 *   "functionName": "add",
 *   "args": [5, 3]
 * }
 */
router.post('/execute-file', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { filePath, functionName, args } = req.body;

        if (!filePath || !functionName) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: filePath, functionName',
            });
        }

        logger.info(`[WASM API] Execute request: filePath=${filePath}, functionName=${functionName}, args=${JSON.stringify(args)}`);

        // Load WASM from file (local to PC2 node)
        const binary = await wasmRuntime.loadFromFile(filePath);

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
        logger.error('[WASM API] Execute error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Unknown error',
        });
    }
});

/**
 * POST /api/wasm/execute
 * Execute a WASM function from binary data (base64 or ArrayBuffer)
 * 
 * Body:
 * {
 *   "wasmBinary": "<base64 string or ArrayBuffer>",
 *   "functionName": "add",
 *   "args": [5, 3]
 * }
 */
router.post('/execute', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { wasmBinary, functionName, args } = req.body;

        if (!wasmBinary || !functionName) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: wasmBinary, functionName',
            });
        }

        // Convert base64 to ArrayBuffer if needed
        let binary: ArrayBuffer;
        if (typeof wasmBinary === 'string') {
            // Assume base64
            const buffer = Buffer.from(wasmBinary, 'base64');
            binary = buffer.buffer;
        } else if (wasmBinary instanceof ArrayBuffer) {
            binary = wasmBinary;
        } else if (Array.isArray(wasmBinary)) {
            // Convert array to Uint8Array
            binary = new Uint8Array(wasmBinary).buffer;
        } else {
            return res.status(400).json({
                success: false,
                error: 'Invalid wasmBinary format. Expected base64 string, ArrayBuffer, or array',
            });
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
        logger.error('[WASM API] Execute error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Unknown error',
        });
    }
});

/**
 * GET /api/wasm/list-functions
 * List available functions in a WASM binary
 * 
 * Query params:
 *   filePath: Path to WASM file
 */
router.get('/list-functions', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { filePath } = req.query;

        if (!filePath || typeof filePath !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Missing required query parameter: filePath',
            });
        }

        // Load WASM from file
        const binary = await wasmRuntime.loadFromFile(filePath);

        // List functions
        const functions = await wasmRuntime.listFunctions(binary);

        res.json({
            success: true,
            functions: functions,
        });
    } catch (error: any) {
        logger.error('[WASM API] List functions error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Unknown error',
        });
    }
});

export default router;

