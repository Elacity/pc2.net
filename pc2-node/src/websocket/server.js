import { Server as SocketIOServer } from 'socket.io';
import { setEventQueue } from './events.js';
export function setupWebSocket(server, options = {}) {
    const { database } = options;
    const authenticatedSessions = new Map();
    const walletSessions = new Map();
    const socketSessions = new Map();
    const pendingEvents = [];
    setEventQueue(pendingEvents);
    const io = new SocketIOServer(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
            credentials: true
        },
        path: '/socket.io/',
        transports: ['polling', 'websocket'],
        pingTimeout: 60000,
        pingInterval: 25000,
        allowEIO3: true,
        upgradeTimeout: 10000,
        maxHttpBufferSize: 1e6,
        allowRequest: (req, callback) => {
            const authHeader = req.headers['authorization'];
            const url = req.url || '';
            const isPolling = url.includes('transport=polling');
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
                        req.__authenticated_session = {
                            wallet_address: session.wallet_address,
                            token: token
                        };
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
                const storedSession = socketSessions.get(sid);
                if (storedSession) {
                    req.__authenticated_session = {
                        wallet_address: storedSession.wallet,
                        token: null
                    };
                    storedSession.lastPoll = Date.now();
                    console.log(`✅ [allowRequest] Restored session from sid: ${sid.substring(0, 10)}... (wallet: ${storedSession.wallet.slice(0, 6)}...${storedSession.wallet.slice(-4)})`);
                }
                else {
                    console.log(`⚠️  [allowRequest] Polling request WITHOUT Authorization header and no stored session: ${url.substring(0, 100)}`);
                }
            }
            callback(null, true);
        }
    });
    io.use((socket, next) => {
        const authenticatedSession = socket.request.__authenticated_session;
        const token = authenticatedSession?.token ||
            socket.handshake.auth?.token ||
            socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
            socket.handshake.query?.token ||
            socket.handshake.query?.auth_token;
        console.log(`🔌 WebSocket: Client connecting`, {
            socketId: socket.id,
            hasToken: !!token,
            hasAuthenticatedSession: !!authenticatedSession,
            tokenSource: authenticatedSession ? 'allowRequest' :
                socket.handshake.auth?.token ? 'auth.token' :
                    socket.handshake.headers?.authorization ? 'headers.authorization' :
                        socket.handshake.query?.token ? 'query.token' :
                            socket.handshake.query?.auth_token ? 'query.auth_token' : 'none',
            tokenPrefix: token ? `${token.substring(0, 8)}...` : 'none'
        });
        if (!token) {
            const storedSession = authenticatedSession;
            if (storedSession && storedSession.wallet_address && database) {
                const sessionByWallet = database.getSessionByWallet(storedSession.wallet_address);
                if (sessionByWallet && sessionByWallet.expires_at >= Date.now()) {
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
            const authHeader = socket.request.headers['authorization'];
            if (authHeader && database) {
                const headerToken = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
                if (headerToken) {
                    const session = database.getSession(headerToken);
                    if (session && session.expires_at >= Date.now()) {
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
        const session = database.getSession(token);
        if (!session) {
            console.warn(`⚠️  WebSocket: Invalid session token for ${socket.id}`);
            return next();
        }
        if (session.expires_at < Date.now()) {
            console.warn(`⚠️  WebSocket: Expired session token for ${socket.id}`);
            return next();
        }
        socket.user = {
            wallet_address: session.wallet_address,
            smart_account_address: session.smart_account_address,
            session_token: token
        };
        authenticatedSessions.set(socket.id, {
            wallet_address: session.wallet_address,
            token: token
        });
        walletSessions.set(session.wallet_address.toLowerCase(), {
            token: token,
            lastSeen: Date.now()
        });
        console.log(`✅ WebSocket: Client authenticated during handshake: ${socket.id} (wallet: ${session.wallet_address.slice(0, 6)}...${session.wallet_address.slice(-4)})`);
        next();
    });
    io.on('connection', (socket) => {
        if (!socket.user) {
            console.log(`🔌 WebSocket: Client connected without authentication: ${socket.id}`);
            const clientIP = socket.request.socket.remoteAddress || socket.handshake.address;
            const authHeader = socket.request.headers['authorization'];
            if (authHeader && database) {
                const headerToken = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
                if (headerToken) {
                    const session = database.getSession(headerToken);
                    if (session && session.expires_at >= Date.now()) {
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
                        const room = `user:${session.wallet_address}`;
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
                    }
                }
            }
            if (!socket.user) {
                socket.emit('connected', {
                    authenticated: false,
                    message: 'Connection established. Authentication required for operations.',
                    timestamp: new Date().toISOString()
                });
            }
        }
        if (socket.user) {
            const { wallet_address } = socket.user;
            const room = `user:${wallet_address}`;
            socket.join(room);
            const roomSockets = io.sockets.adapter.rooms.get(room);
            const connectedCount = roomSockets ? roomSockets.size : 0;
            console.log(`✅ WebSocket client connected: ${socket.id} (wallet: ${wallet_address.slice(0, 6)}...${wallet_address.slice(-4)}, room: ${room}, total clients in room: ${connectedCount})`);
            const normalizedWallet = wallet_address.toLowerCase();
            const queuedEvents = pendingEvents.filter(evt => {
                return !evt.wallet || evt.wallet === normalizedWallet;
            });
            if (queuedEvents.length > 0) {
                console.log(`📤 Delivering ${queuedEvents.length} queued events to ${socket.id} (wallet: ${normalizedWallet})`);
                queuedEvents.forEach(evt => {
                    socket.emit(evt.event, evt.data);
                });
                pendingEvents.splice(0, pendingEvents.length, ...pendingEvents.filter(evt => !queuedEvents.includes(evt)));
                console.log(`✅ Delivered ${queuedEvents.length} events, queue size now: ${pendingEvents.length}`);
            }
            socket.emit('connected', {
                authenticated: true,
                wallet_address: wallet_address,
                room: room,
                timestamp: new Date().toISOString()
            });
        }
        socket.on('ping', () => {
            socket.emit('pong', { timestamp: Date.now() });
        });
        const heartbeatInterval = setInterval(() => {
            if (socket.connected) {
                socket.emit('heartbeat', { timestamp: Date.now() });
            }
            else {
                clearInterval(heartbeatInterval);
            }
        }, 30000);
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
            socket.user = {
                wallet_address: session.wallet_address,
                smart_account_address: session.smart_account_address,
                session_token: token
            };
            const room = `user:${session.wallet_address}`;
            socket.join(room);
            authenticatedSessions.set(socket.id, {
                wallet_address: session.wallet_address,
                token: token
            });
            walletSessions.set(session.wallet_address.toLowerCase(), {
                token: token,
                lastSeen: Date.now()
            });
            const roomSockets = io.sockets.adapter.rooms.get(room);
            const connectedCount = roomSockets ? roomSockets.size : 0;
            console.log(`✅ WebSocket client authenticated via 'authenticate' event: ${socket.id} (wallet: ${session.wallet_address.slice(0, 6)}...${session.wallet_address.slice(-4)}, room: ${room}, total clients: ${connectedCount})`);
            const normalizedWallet = session.wallet_address.toLowerCase();
            const queuedEvents = pendingEvents.filter(evt => {
                return !evt.wallet || evt.wallet === normalizedWallet;
            });
            if (queuedEvents.length > 0) {
                console.log(`📤 Delivering ${queuedEvents.length} queued events to ${socket.id} (wallet: ${normalizedWallet})`);
                queuedEvents.forEach(evt => {
                    socket.emit(evt.event, evt.data);
                });
                pendingEvents.splice(0, pendingEvents.length, ...pendingEvents.filter(evt => !queuedEvents.includes(evt)));
                console.log(`✅ Delivered ${queuedEvents.length} events, queue size now: ${pendingEvents.length}`);
            }
            socket.emit('authenticated', { wallet_address: session.wallet_address, room });
        });
        socket.on('auth', (data) => {
            const handler = socket.listeners('authenticate')[0];
            if (handler) {
                handler(data);
            }
        });
        socket.on('file:subscribe', (data) => {
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
        socket.on('disconnect', (reason) => {
            console.log(`🔌 WebSocket client disconnected: ${socket.id} (reason: ${reason})`);
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
            }
            const session = authenticatedSessions.get(socket.id);
            if (session) {
                console.log(`🧹 Cleaning up session for ${socket.id} (wallet: ${session.wallet_address.slice(0, 6)}...${session.wallet_address.slice(-4)})`);
            }
            authenticatedSessions.delete(socket.id);
        });
        socket.on('error', (error) => {
            console.error(`❌ WebSocket error for ${socket.id}:`, error);
        });
        socket.on('connect_error', (error) => {
            console.error(`❌ WebSocket connection error for ${socket.id}:`, error);
        });
        socket.on('connect', () => {
            console.log(`✅ WebSocket socket connected: ${socket.id}`);
        });
    });
    io.database = database;
    return io;
}
let globalIO = null;
export function setGlobalIO(io) {
    globalIO = io;
}
export function getGlobalIO() {
    return globalIO;
}
//# sourceMappingURL=server.js.map