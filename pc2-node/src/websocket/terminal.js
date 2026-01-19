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
import { getTerminalService } from '../services/terminal/TerminalService.js';
// Re-export for convenience
export { getTerminalService, shutdownTerminalService } from '../services/terminal/TerminalService.js';
import { logger } from '../utils/logger.js';
/**
 * Initialize terminal WebSocket handlers for a connected socket
 */
export function initializeTerminalHandlers(socket, walletAddress, userHomesBase, config) {
    const normalizedWallet = walletAddress.toLowerCase();
    // Get or create terminal service with user homes base and config
    const terminalService = getTerminalService({
        userHomesBase,
        maxTerminalsPerUser: config?.maxTerminalsPerUser || 5,
        idleTimeout: config?.idleTimeout || 30 * 60 * 1000, // 30 minutes
        enableAuditLog: true,
        isolationMode: config?.isolationMode || 'none',
        allowInsecureFallback: config?.allowInsecureFallback || false,
    });
    logger.info(`[Terminal WS] Initializing terminal handlers for ${normalizedWallet} on socket ${socket.id}`);
    /**
     * Create a new terminal session
     */
    socket.on('terminal.create', async (request, callback) => {
        try {
            const cols = request?.cols || 80;
            const rows = request?.rows || 24;
            logger.info(`[Terminal WS] Creating terminal for ${normalizedWallet} (${cols}x${rows})`);
            const result = await terminalService.createSession(normalizedWallet, cols, rows);
            if (!result.success) {
                if (callback) {
                    callback({ success: false, error: result.error });
                }
                else {
                    socket.emit('terminal.error', { error: result.error });
                }
                return;
            }
            const sessionId = result.sessionId;
            // Set up output handler
            terminalService.onData(sessionId, normalizedWallet, (data) => {
                socket.emit('terminal.output', {
                    sessionId,
                    data,
                });
            });
            // Set up exit handler
            terminalService.onExit(sessionId, normalizedWallet, (exitCode, signal) => {
                socket.emit('terminal.exit', {
                    sessionId,
                    exitCode,
                    signal,
                });
            });
            if (callback) {
                callback({ success: true, sessionId });
            }
            else {
                socket.emit('terminal.created', { sessionId });
            }
            logger.info(`[Terminal WS] Terminal created: ${sessionId} for ${normalizedWallet}`);
        }
        catch (error) {
            logger.error(`[Terminal WS] Error creating terminal:`, error);
            if (callback) {
                callback({ success: false, error: error.message });
            }
            else {
                socket.emit('terminal.error', { error: error.message });
            }
        }
    });
    /**
     * Send data to terminal (user input)
     */
    socket.on('terminal.data', (request) => {
        try {
            const { sessionId, data } = request;
            if (!sessionId || typeof data !== 'string') {
                socket.emit('terminal.error', { error: 'Invalid request: sessionId and data required' });
                return;
            }
            const success = terminalService.write(sessionId, normalizedWallet, data);
            if (!success) {
                socket.emit('terminal.error', {
                    sessionId,
                    error: 'Session not found or access denied',
                });
            }
        }
        catch (error) {
            logger.error(`[Terminal WS] Error writing to terminal:`, error);
            socket.emit('terminal.error', { error: error.message });
        }
    });
    /**
     * Resize terminal
     */
    socket.on('terminal.resize', (request) => {
        try {
            const { sessionId, cols, rows } = request;
            if (!sessionId || typeof cols !== 'number' || typeof rows !== 'number') {
                socket.emit('terminal.error', { error: 'Invalid request: sessionId, cols, and rows required' });
                return;
            }
            const success = terminalService.resize(sessionId, normalizedWallet, cols, rows);
            if (!success) {
                socket.emit('terminal.error', {
                    sessionId,
                    error: 'Session not found or access denied',
                });
            }
        }
        catch (error) {
            logger.error(`[Terminal WS] Error resizing terminal:`, error);
            socket.emit('terminal.error', { error: error.message });
        }
    });
    /**
     * Destroy terminal session
     */
    socket.on('terminal.destroy', (request, callback) => {
        try {
            const { sessionId } = request;
            if (!sessionId) {
                const error = 'Invalid request: sessionId required';
                if (callback) {
                    callback({ success: false, error });
                }
                else {
                    socket.emit('terminal.error', { error });
                }
                return;
            }
            const success = terminalService.destroySession(sessionId, normalizedWallet);
            if (callback) {
                callback({ success });
            }
            if (success) {
                logger.info(`[Terminal WS] Terminal destroyed: ${sessionId}`);
            }
        }
        catch (error) {
            logger.error(`[Terminal WS] Error destroying terminal:`, error);
            if (callback) {
                callback({ success: false, error: error.message });
            }
            else {
                socket.emit('terminal.error', { error: error.message });
            }
        }
    });
    /**
     * List user's terminal sessions
     */
    socket.on('terminal.list', (callback) => {
        try {
            const sessions = terminalService.getUserSessions(normalizedWallet);
            const sessionList = sessions.map(s => ({
                id: s.id,
                createdAt: s.createdAt.toISOString(),
                lastActivity: s.lastActivity.toISOString(),
                cols: s.cols,
                rows: s.rows,
            }));
            if (callback) {
                callback({ success: true, sessions: sessionList });
            }
            else {
                socket.emit('terminal.list', { sessions: sessionList });
            }
        }
        catch (error) {
            logger.error(`[Terminal WS] Error listing terminals:`, error);
            if (callback) {
                callback({ success: false, error: error.message });
            }
            else {
                socket.emit('terminal.error', { error: error.message });
            }
        }
    });
    /**
     * Clean up on socket disconnect
     */
    socket.on('disconnect', () => {
        logger.info(`[Terminal WS] Socket disconnected: ${socket.id} (user: ${normalizedWallet})`);
        // Note: We don't destroy sessions on disconnect because user might reconnect
        // Sessions will be cleaned up by idle timeout instead
    });
}
/**
 * Setup terminal handlers on WebSocket server
 * This should be called when a socket connects and authenticates
 */
export function setupTerminalHandlers(io, userHomesBase) {
    logger.info('[Terminal WS] Terminal WebSocket handlers ready');
    // The actual handler setup happens in initializeTerminalHandlers
    // which is called after socket authentication
}
//# sourceMappingURL=terminal.js.map