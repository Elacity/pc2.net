/**
 * WebSocket Server
 *
 * Real-time communication using Socket.io
 * Replaces polling with WebSocket for instant updates
 */
import { Server as SocketIOServer } from 'socket.io';
import { setEventQueue } from './events.js';
import { initializeTerminalHandlers } from './terminal.js';
/**
 * Setup WebSocket server with authentication
 */
export function setupWebSocket(server, options = {}) {
    const { database, userHomesBase, terminalConfig } = options;
    // Track sockets with initialized terminal handlers
    const terminalInitializedSockets = new Set();
    // Store authenticated sessions by socket ID for reconnection
    const authenticatedSessions = new Map();
    // Store active sessions by wallet address (for auto-reauthentication on reconnect)
    const walletSessions = new Map();
    // Store Socket.io session IDs (sid) mapped to wallet addresses (for polling requests without auth header)
    // This matches the mock server's socketSessions pattern
    const socketSessions = new Map();
    const pendingEvents = [];
    // Make event queue available to events.ts
    setEventQueue(pendingEvents);
    const io = new SocketIOServer(server, {
        cors: {
            origin: '*', // In production, restrict to specific origins
            methods: ['GET', 'POST'],
            credentials: true
        },
        path: '/socket.io/',
        transports: ['polling', 'websocket'], // Try polling first, then upgrade to websocket
        pingTimeout: 60000, // 60 seconds - increase timeout for remote connections
        pingInterval: 25000, // 25 seconds - send ping every 25 seconds
        allowEIO3: true, // Allow Engine.IO v3 clients for compatibility
        upgradeTimeout: 10000, // 10 seconds for upgrade from polling to websocket
        maxHttpBufferSize: 1e6, // 1MB max buffer size
        // Allow requests - check Authorization header on each polling request
        allowRequest: (req, callback) => {
            // For polling requests, check Authorization header
            const authHeader = req.headers['authorization'];
            const url = req.url || '';
            const isPolling = url.includes('transport=polling');
            // Extract session ID (sid) from polling requests
            let sid = null;
            if (isPolling) {
                const urlObj = new URL(url, 'http://localhost');
                sid = urlObj.searchParams.get('sid');
            }
            if (authHeader && database) {
                const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
                if (token) {
                    const session = database.getSession(token);
                    if (session && session.expires_at >= Date.now()) {
                        // Store session info for later use in handshake
                        req.__authenticated_session = {
                            wallet_address: session.wallet_address,
                            token: token
                        };
                        // Store sid -> wallet mapping for subsequent polling requests
                        if (isPolling && sid) {
                            socketSessions.set(sid, {
                                wallet: session.wallet_address.toLowerCase(),
                                lastPoll: Date.now()
                            });
                            console.log(`🔍 [allowRequest] Polling request with auth: ${session.wallet_address.slice(0, 6)}...${session.wallet_address.slice(-4)}, sid: ${sid.substring(0, 10)}...`);
                        }
                    }
                }
            }
            else if (isPolling && sid) {
                // Polling request without auth header - check if we have a stored session for this sid
                const storedSession = socketSessions.get(sid);
                if (storedSession) {
                    // Found stored session - restore authentication
                    req.__authenticated_session = {
                        wallet_address: storedSession.wallet,
                        token: null // We don't have the token, but we have the wallet
                    };
                    storedSession.lastPoll = Date.now();
                    console.log(`✅ [allowRequest] Restored session from sid: ${sid.substring(0, 10)}... (wallet: ${storedSession.wallet.slice(0, 6)}...${storedSession.wallet.slice(-4)})`);
                }
                else {
                    console.log(`⚠️  [allowRequest] Polling request WITHOUT Authorization header and no stored session: ${url.substring(0, 100)}`);
                }
            }
            // Always allow connection (authentication happens in middleware)
            callback(null, true);
        }
    });
    // Authentication middleware (optional - allow connection without auth, require auth for operations)
    io.use((socket, next) => {
        // Check if session was authenticated in allowRequest (for polling)
        const authenticatedSession = socket.request.__authenticated_session;
        // Get session token from handshake (check multiple sources for polling/websocket compatibility)
        // Frontend sends auth_token in auth object, so check both token and auth_token
        const token = authenticatedSession?.token ||
            socket.handshake.auth?.token ||
            socket.handshake.auth?.auth_token || // Frontend sends auth_token
            socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
            socket.handshake.query?.token ||
            socket.handshake.query?.auth_token;
        console.log(`🔌 WebSocket: Client connecting`, {
            socketId: socket.id,
            hasToken: !!token,
            hasAuthenticatedSession: !!authenticatedSession,
            tokenSource: authenticatedSession ? 'allowRequest' :
                socket.handshake.auth?.token ? 'auth.token' :
                    socket.handshake.auth?.auth_token ? 'auth.auth_token' :
                        socket.handshake.headers?.authorization ? 'headers.authorization' :
                            socket.handshake.query?.token ? 'query.token' :
                                socket.handshake.query?.auth_token ? 'query.auth_token' : 'none',
            tokenPrefix: token ? `${token.substring(0, 8)}...` : 'none'
        });
        // Allow connection without token (client will authenticate later via 'authenticate' event)
        // BUT: Try to auto-authenticate if we have a stored session from allowRequest
        if (!token) {
            // Check if we have a stored session from allowRequest (for polling requests)
            const storedSession = authenticatedSession;
            if (storedSession && storedSession.wallet_address && database) {
                // We have a wallet address but no token - try to find a valid session for this wallet
                const sessionByWallet = database.getSessionByWallet(storedSession.wallet_address);
                if (sessionByWallet && sessionByWallet.expires_at >= Date.now()) {
                    // Found valid session for this wallet - use it
                    socket.user = {
                        wallet_address: sessionByWallet.wallet_address,
                        smart_account_address: sessionByWallet.smart_account_address,
                        session_token: sessionByWallet.token
                    };
                    authenticatedSessions.set(socket.id, {
                        wallet_address: sessionByWallet.wallet_address,
                        token: sessionByWallet.token
                    });
                    walletSessions.set(sessionByWallet.wallet_address.toLowerCase(), {
                        token: sessionByWallet.token,
                        lastSeen: Date.now()
                    });
                    console.log(`✅ WebSocket: Auto-authenticated from stored session: ${socket.id} (wallet: ${sessionByWallet.wallet_address.slice(0, 6)}...${sessionByWallet.wallet_address.slice(-4)})`);
                    return next();
                }
            }
            // Check if we can find a session from the request (e.g., from HTTP headers in polling)
            const authHeader = socket.request.headers['authorization'];
            if (authHeader && database) {
                const headerToken = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
                if (headerToken) {
                    const session = database.getSession(headerToken);
                    if (session && session.expires_at >= Date.now()) {
                        // Found valid session in HTTP headers - use it
                        socket.user = {
                            wallet_address: session.wallet_address,
                            smart_account_address: session.smart_account_address,
                            session_token: headerToken
                        };
                        authenticatedSessions.set(socket.id, {
                            wallet_address: session.wallet_address,
                            token: headerToken
                        });
                        walletSessions.set(session.wallet_address.toLowerCase(), {
                            token: headerToken,
                            lastSeen: Date.now()
                        });
                        console.log(`✅ WebSocket: Auto-authenticated from HTTP headers: ${socket.id} (wallet: ${session.wallet_address.slice(0, 6)}...${session.wallet_address.slice(-4)})`);
                        return next();
                    }
                }
            }
            console.log(`🔌 WebSocket: Client connecting without auth (will require auth for operations): ${socket.id}`);
            return next();
        }
        if (!database) {
            console.warn('⚠️  WebSocket: Database not available, skipping authentication');
            return next();
        }
        // Verify session token
        const session = database.getSession(token);
        if (!session) {
            // Don't reject connection - just don't attach user
            console.warn(`⚠️  WebSocket: Invalid session token for ${socket.id}`);
            return next();
        }
        // Check if session is expired
        if (session.expires_at < Date.now()) {
            console.warn(`⚠️  WebSocket: Expired session token for ${socket.id}`);
            return next();
        }
        // Attach user info to socket
        socket.user = {
            wallet_address: session.wallet_address,
            smart_account_address: session.smart_account_address,
            session_token: token
        };
        // Store authenticated session for potential reconnection
        authenticatedSessions.set(socket.id, {
            wallet_address: session.wallet_address,
            token: token
        });
        // Also store by wallet address for auto-reauthentication
        walletSessions.set(session.wallet_address.toLowerCase(), {
            token: token,
            lastSeen: Date.now()
        });
        console.log(`✅ WebSocket: Client authenticated during handshake: ${socket.id} (wallet: ${session.wallet_address.slice(0, 6)}...${session.wallet_address.slice(-4)})`);
        next();
    });
    // Connection handling
    io.on('connection', (socket) => {
        // Allow connection without auth (client will authenticate later)
        if (!socket.user) {
            console.log(`🔌 WebSocket: Client connected without authentication: ${socket.id}`);
            // Try to authenticate using stored wallet session (for reconnections)
            // Check if we have a recent session for this IP/wallet combination
            // This is a fallback for clients that reconnect without auth token
            const clientIP = socket.request.socket.remoteAddress || socket.handshake.address;
            const authHeader = socket.request.headers['authorization'];
            if (authHeader && database) {
                const headerToken = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
                if (headerToken) {
                    const session = database.getSession(headerToken);
                    if (session && session.expires_at >= Date.now()) {
                        // Found valid session in HTTP headers - use it
                        socket.user = {
                            wallet_address: session.wallet_address,
                            smart_account_address: session.smart_account_address,
                            session_token: headerToken
                        };
                        authenticatedSessions.set(socket.id, {
                            wallet_address: session.wallet_address,
                            token: headerToken
                        });
                        walletSessions.set(session.wallet_address.toLowerCase(), {
                            token: headerToken,
                            lastSeen: Date.now()
                        });
                        console.log(`✅ WebSocket: Auto-authenticated from HTTP headers on connection: ${socket.id} (wallet: ${session.wallet_address.slice(0, 6)}...${session.wallet_address.slice(-4)})`);
                        // Join room immediately
                        // Normalize wallet address to lowercase for room matching (must match broadcast functions)
                        const normalizedWallet = session.wallet_address.toLowerCase();
                        const room = `user:${normalizedWallet}`;
                        socket.join(room);
                        const roomSockets = io.sockets.adapter.rooms.get(room);
                        const connectedCount = roomSockets ? roomSockets.size : 0;
                        console.log(`✅ WebSocket client auto-authenticated and joined room: ${socket.id} (wallet: ${session.wallet_address.slice(0, 6)}...${session.wallet_address.slice(-4)}, room: ${room}, total clients: ${connectedCount})`);
                        socket.emit('connected', {
                            authenticated: true,
                            wallet_address: session.wallet_address,
                            room: room,
                            timestamp: new Date().toISOString()
                        });
                        // Initialize terminal handlers for this auto-authenticated socket
                        if (userHomesBase && !terminalInitializedSockets.has(socket.id)) {
                            try {
                                initializeTerminalHandlers(socket, session.wallet_address, userHomesBase, terminalConfig);
                                terminalInitializedSockets.add(socket.id);
                                console.log(`🖥️  [Terminal] Initialized terminal handlers for ${socket.id} (auto-auth)`);
                            }
                            catch (termError) {
                                console.error(`❌ [Terminal] Failed to initialize terminal handlers:`, termError);
                            }
                        }
                        // Continue to authenticate event handler setup below
                    }
                }
            }
            if (!socket.user) {
                // Send connection confirmation (without user info)
                socket.emit('connected', {
                    authenticated: false,
                    message: 'Connection established. Authentication required for operations.',
                    timestamp: new Date().toISOString()
                });
                // Don't return - allow client to authenticate via 'authenticate' event
                // The client might send auth token after connecting
            }
        }
        // If client already has user (authenticated during handshake), join room immediately
        if (socket.user) {
            const { wallet_address } = socket.user;
            // Normalize wallet address to lowercase for room matching (must match broadcast functions)
            const normalizedWallet = wallet_address.toLowerCase();
            const room = `user:${normalizedWallet}`;
            // Disconnect older sockets for the same user to prevent duplicate events
            const existingSockets = io.sockets.adapter.rooms.get(room);
            if (existingSockets && existingSockets.size > 0) {
                const socketsToDisconnect = [];
                for (const oldSocketId of existingSockets) {
                    if (oldSocketId !== socket.id) {
                        socketsToDisconnect.push(oldSocketId);
                    }
                }
                // Limit to max 2 concurrent connections per user (allow 1 old + 1 new during transition)
                if (socketsToDisconnect.length > 1) {
                    const oldestSockets = socketsToDisconnect.slice(0, socketsToDisconnect.length - 1);
                    for (const oldSocketId of oldestSockets) {
                        const oldSocket = io.sockets.sockets.get(oldSocketId);
                        if (oldSocket) {
                            console.log(`🧹 Disconnecting stale socket ${oldSocketId} for wallet ${normalizedWallet.slice(0, 6)}...`);
                            oldSocket.disconnect(true);
                        }
                    }
                }
            }
            // Join user's room (for per-user broadcasts)
            socket.join(room);
            // Verify room membership
            const roomSockets = io.sockets.adapter.rooms.get(room);
            const connectedCount = roomSockets ? roomSockets.size : 0;
            console.log(`✅ WebSocket client connected: ${socket.id} (wallet: ${wallet_address.slice(0, 6)}...${wallet_address.slice(-4)}, room: ${room}, total clients in room: ${connectedCount})`);
            // Deliver queued events for this wallet (matching mock server pattern)
            // normalizedWallet already declared above
            const queuedEvents = pendingEvents.filter(evt => {
                return !evt.wallet || evt.wallet === normalizedWallet;
            });
            if (queuedEvents.length > 0) {
                console.log(`📤 Delivering ${queuedEvents.length} queued events to ${socket.id} (wallet: ${normalizedWallet})`);
                queuedEvents.forEach(evt => {
                    socket.emit(evt.event, evt.data);
                });
                // Remove delivered events from queue
                pendingEvents.splice(0, pendingEvents.length, ...pendingEvents.filter(evt => !queuedEvents.includes(evt)));
                console.log(`✅ Delivered ${queuedEvents.length} events, queue size now: ${pendingEvents.length}`);
            }
            // Send connection confirmation
            socket.emit('connected', {
                authenticated: true,
                wallet_address: wallet_address,
                room: room,
                timestamp: new Date().toISOString()
            });
            // Initialize terminal handlers for this authenticated socket
            if (userHomesBase && !terminalInitializedSockets.has(socket.id)) {
                try {
                    initializeTerminalHandlers(socket, wallet_address, userHomesBase, terminalConfig);
                    terminalInitializedSockets.add(socket.id);
                    console.log(`🖥️  [Terminal] Initialized terminal handlers for ${socket.id} (handshake auth)`);
                }
                catch (termError) {
                    console.error(`❌ [Terminal] Failed to initialize terminal handlers:`, termError);
                }
            }
        }
        // Handle ping/pong for connection health (Socket.io handles this automatically, but we can add custom handling)
        socket.on('ping', () => {
            socket.emit('pong', { timestamp: Date.now() });
        });
        // Keep connection alive - send periodic heartbeat
        const heartbeatInterval = setInterval(() => {
            if (socket.connected) {
                socket.emit('heartbeat', { timestamp: Date.now() });
            }
            else {
                clearInterval(heartbeatInterval);
            }
        }, 30000); // Every 30 seconds
        // Handle authentication after connection (for clients that reconnect without token)
        // Puter SDK may send auth token after initial connection
        socket.on('authenticate', (data) => {
            const token = data.token || data.auth_token || socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
            if (!token || !database) {
                socket.emit('auth_error', { message: 'Token required' });
                return;
            }
            const session = database.getSession(token);
            if (!session || session.expires_at < Date.now()) {
                socket.emit('auth_error', { message: 'Invalid or expired token' });
                return;
            }
            // Attach user and join room
            socket.user = {
                wallet_address: session.wallet_address,
                smart_account_address: session.smart_account_address,
                session_token: token
            };
            // Normalize wallet address to lowercase for room matching (must match broadcast functions)
            const normalizedWallet = session.wallet_address.toLowerCase();
            const room = `user:${normalizedWallet}`;
            // Disconnect stale sockets for the same user
            const existingSockets = io.sockets.adapter.rooms.get(room);
            if (existingSockets && existingSockets.size > 1) {
                for (const oldSocketId of existingSockets) {
                    if (oldSocketId !== socket.id) {
                        const oldSocket = io.sockets.sockets.get(oldSocketId);
                        if (oldSocket) {
                            console.log(`🧹 [authenticate] Disconnecting stale socket ${oldSocketId} for wallet ${normalizedWallet.slice(0, 6)}...`);
                            oldSocket.disconnect(true);
                        }
                    }
                }
            }
            socket.join(room);
            // Store authenticated session
            authenticatedSessions.set(socket.id, {
                wallet_address: session.wallet_address,
                token: token
            });
            walletSessions.set(session.wallet_address.toLowerCase(), {
                token: token,
                lastSeen: Date.now()
            });
            // Verify room membership
            const roomSockets = io.sockets.adapter.rooms.get(room);
            const connectedCount = roomSockets ? roomSockets.size : 0;
            console.log(`✅ WebSocket client authenticated via 'authenticate' event: ${socket.id} (wallet: ${session.wallet_address.slice(0, 6)}...${session.wallet_address.slice(-4)}, room: ${room}, total clients: ${connectedCount})`);
            // Deliver queued events for this wallet (matching mock server pattern)
            // normalizedWallet already declared above
            const queuedEventsForAuth = pendingEvents.filter(evt => {
                return !evt.wallet || evt.wallet === normalizedWallet;
            });
            if (queuedEventsForAuth.length > 0) {
                console.log(`📤 Delivering ${queuedEventsForAuth.length} queued events to ${socket.id} (wallet: ${normalizedWallet})`);
                queuedEventsForAuth.forEach(evt => {
                    console.log(`📤 Emitting queued event: ${evt.event}`, evt.data);
                    socket.emit(evt.event, evt.data);
                });
                // Remove delivered events from queue
                pendingEvents.splice(0, pendingEvents.length, ...pendingEvents.filter(evt => !queuedEventsForAuth.includes(evt)));
                console.log(`✅ Delivered ${queuedEventsForAuth.length} events, queue size now: ${pendingEvents.length}`);
            }
            else {
                console.log(`📭 No queued events for ${socket.id} (wallet: ${normalizedWallet}), queue size: ${pendingEvents.length}`);
            }
            socket.emit('authenticated', { wallet_address: session.wallet_address, room });
            // Initialize terminal handlers for this authenticated socket
            if (userHomesBase && !terminalInitializedSockets.has(socket.id)) {
                try {
                    initializeTerminalHandlers(socket, session.wallet_address, userHomesBase, terminalConfig);
                    terminalInitializedSockets.add(socket.id);
                    console.log(`🖥️  [Terminal] Initialized terminal handlers for ${socket.id}`);
                }
                catch (termError) {
                    console.error(`❌ [Terminal] Failed to initialize terminal handlers:`, termError);
                }
            }
        });
        // Also handle 'auth' event (alternative event name)
        socket.on('auth', (data) => {
            // Forward to authenticate handler
            const handler = socket.listeners('authenticate')[0];
            if (handler) {
                handler(data);
            }
        });
        // Handle puter_is_actually_open event (frontend sends this to keep connection alive)
        socket.on('puter_is_actually_open', () => {
            if (socket.user) {
                // Ensure socket is still in the room
                const normalizedWallet = socket.user.wallet_address.toLowerCase();
                const room = `user:${normalizedWallet}`;
                socket.join(room);
                const roomSockets = io.sockets.adapter.rooms.get(room);
                const connectedCount = roomSockets ? roomSockets.size : 0;
                console.log(`💚 [puter_is_actually_open] Socket ${socket.id} confirmed open, room: ${room}, clients: ${connectedCount}`);
            }
            else {
                console.log(`💚 [puter_is_actually_open] Socket ${socket.id} confirmed open (not authenticated yet)`);
            }
        });
        // Handle client events (if needed)
        socket.on('file:subscribe', (data) => {
            // Client can subscribe to specific file changes
            if (data.path && socket.user) {
                socket.join(`file:${socket.user.wallet_address}:${data.path}`);
                console.log(`📁 Client subscribed to file: ${data.path}`);
            }
        });
        socket.on('file:unsubscribe', (data) => {
            if (data.path && socket.user) {
                socket.leave(`file:${socket.user.wallet_address}:${data.path}`);
            }
        });
        // Handle disconnection
        socket.on('disconnect', (reason) => {
            console.log(`🔌 WebSocket client disconnected: ${socket.id} (reason: ${reason})`);
            // Clean up heartbeat interval
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
            }
            // Clean up authenticated session
            const session = authenticatedSessions.get(socket.id);
            if (session) {
                console.log(`🧹 Cleaning up session for ${socket.id} (wallet: ${session.wallet_address.slice(0, 6)}...${session.wallet_address.slice(-4)})`);
            }
            authenticatedSessions.delete(socket.id);
            // Clean up terminal initialized tracking
            terminalInitializedSockets.delete(socket.id);
            // Note: We keep walletSessions even after disconnect to allow auto-reauthentication
            // They'll expire naturally when the session expires in the database
        });
        // Handle errors
        socket.on('error', (error) => {
            console.error(`❌ WebSocket error for ${socket.id}:`, error);
        });
        // Handle connection errors (transport errors)
        socket.on('connect_error', (error) => {
            console.error(`❌ WebSocket connection error for ${socket.id}:`, error);
        });
        // Log when socket is ready
        socket.on('connect', () => {
            console.log(`✅ WebSocket socket connected: ${socket.id}`);
        });
        // Listen for item.removed events to verify delivery
        socket.on('item.removed', (data) => {
            console.log(`✅ [VERIFY] Socket ${socket.id} received item.removed event:`, data);
        });
        // Listen for item.added events to verify delivery
        socket.on('item.added', (data) => {
            console.log(`✅ [VERIFY] Socket ${socket.id} received item.added event:`, data);
        });
        // Listen for item.moved events to verify delivery
        socket.on('item.moved', (data) => {
            console.log(`✅ [VERIFY] Socket ${socket.id} received item.moved event:`, data);
        });
    });
    // Make io available globally for event broadcasting
    io.database = database;
    return io;
}
/**
 * Get WebSocket server instance (for event broadcasting)
 * This will be set by setupWebSocket
 */
let globalIO = null;
export function setGlobalIO(io) {
    globalIO = io;
}
export function getGlobalIO() {
    return globalIO;
}
//# sourceMappingURL=server.js.map