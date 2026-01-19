/**
 * Terminal WebSocket Handlers
 *
 * Handles real-time terminal I/O over WebSocket
 *
 * Events:
 * - terminal.create: Create a new terminal session
 * - terminal.data: Send data to terminal
 * - terminal.resize: Resize terminal
 * - terminal.destroy: Destroy terminal session
 * - terminal.output: Terminal output (server -> client)
 * - terminal.exit: Terminal exited (server -> client)
 * - terminal.error: Error occurred (server -> client)
 */
import { Socket, Server as SocketIOServer } from 'socket.io';
export { getTerminalService, shutdownTerminalService } from '../services/terminal/TerminalService.js';
export interface TerminalHandlerConfig {
    isolationMode?: 'none' | 'namespace' | 'disabled';
    allowInsecureFallback?: boolean;
    maxTerminalsPerUser?: number;
    idleTimeout?: number;
}
/**
 * Initialize terminal WebSocket handlers for a connected socket
 */
export declare function initializeTerminalHandlers(socket: Socket, walletAddress: string, userHomesBase: string, config?: TerminalHandlerConfig): void;
/**
 * Setup terminal handlers on WebSocket server
 * This should be called when a socket connects and authenticates
 */
export declare function setupTerminalHandlers(io: SocketIOServer, userHomesBase: string): void;
//# sourceMappingURL=terminal.d.ts.map