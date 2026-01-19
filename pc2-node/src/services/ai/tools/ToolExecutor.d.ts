/**
 * Tool Executor
 * Executes AI function calls using FilesystemManager
 * CRITICAL: All operations are wallet-scoped for security
 */
import { FilesystemManager } from '../../../storage/filesystem.js';
import { Server as SocketIOServer } from 'socket.io';
export interface ToolExecutionResult {
    success: boolean;
    result?: any;
    error?: string;
}
export declare class ToolExecutor {
    private filesystem;
    private walletAddress;
    private io?;
    constructor(filesystem: FilesystemManager, walletAddress: string, io?: SocketIOServer | undefined);
    /**
     * Resolve path to wallet-scoped absolute path
     * CRITICAL: All paths must be scoped to user's wallet
     * @param context Optional context about the user's request (e.g., "desktop" mentioned)
     */
    private resolvePath;
    /**
     * Validate that path is within user's wallet scope
     * Security check to prevent path traversal
     */
    private validatePath;
    /**
     * Execute a tool by name with arguments
     */
    executeTool(toolName: string, args: any): Promise<ToolExecutionResult>;
}
//# sourceMappingURL=ToolExecutor.d.ts.map