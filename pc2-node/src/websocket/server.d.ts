/**
 * WebSocket Server
 *
 * Real-time communication using Socket.io
 * Replaces polling with WebSocket for instant updates
 */
import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { DatabaseManager } from '../storage/database.js';
export interface TerminalConfigOptions {
    isolationMode?: 'none' | 'namespace' | 'disabled';
    allowInsecureFallback?: boolean;
    maxTerminalsPerUser?: number;
    idleTimeout?: number;
}
export interface WebSocketOptions {
    database?: DatabaseManager;
    userHomesBase?: string;
    terminalConfig?: TerminalConfigOptions;
}
/**
 * Setup WebSocket server with authentication
 */
export declare function setupWebSocket(server: HTTPServer, options?: WebSocketOptions): SocketIOServer;
export declare function setGlobalIO(io: SocketIOServer): void;
export declare function getGlobalIO(): SocketIOServer | null;
//# sourceMappingURL=server.d.ts.map