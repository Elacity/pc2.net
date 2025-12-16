/**
 * WebSocket Server
 * 
 * Real-time communication using Socket.io
 * Replaces polling with WebSocket for instant updates
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { DatabaseManager } from '../storage/database.js';
import { SocketUser } from './events.js';

export interface WebSocketOptions {
  database?: DatabaseManager;
}

// Extend Socket interface to include user
interface AuthenticatedSocket extends Socket {
  user?: SocketUser;
}

/**
 * Setup WebSocket server with authentication
 */
export function setupWebSocket(
  server: HTTPServer,
  options: WebSocketOptions = {}
): SocketIOServer {
  const { database } = options;

  const io = new SocketIOServer(server, {
    cors: {
      origin: '*', // In production, restrict to specific origins
      methods: ['GET', 'POST'],
      credentials: true
    },
    path: '/socket.io/',
    transports: ['websocket', 'polling'] // Fallback to polling if WebSocket fails
  });

  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    // Get session token from handshake
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication required: No token provided'));
    }

    if (!database) {
      console.warn('⚠️  WebSocket: Database not available, skipping authentication');
      return next();
    }

    // Verify session token
    const session = database.getSession(token);
    if (!session) {
      return next(new Error('Authentication failed: Invalid session token'));
    }

    // Check if session is expired
    if (session.expires_at < Date.now()) {
      return next(new Error('Authentication failed: Session expired'));
    }

    // Attach user info to socket
    socket.user = {
      wallet_address: session.wallet_address,
      smart_account_address: session.smart_account_address,
      session_token: token
    };

    next();
  });

  // Connection handling
  io.on('connection', (socket: AuthenticatedSocket) => {
    if (!socket.user) {
      console.warn('⚠️  WebSocket: Client connected without authentication');
      socket.disconnect();
      return;
    }

    const { wallet_address } = socket.user;
    const room = `user:${wallet_address}`;

    // Join user's room (for per-user broadcasts)
    socket.join(room);
    console.log(`✅ WebSocket client connected: ${socket.id} (wallet: ${wallet_address.slice(0, 6)}...${wallet_address.slice(-4)})`);

    // Send connection confirmation
    socket.emit('connected', {
      wallet_address: wallet_address,
      room: room,
      timestamp: new Date().toISOString()
    });

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Handle client events (if needed)
    socket.on('file:subscribe', (data: { path?: string }) => {
      // Client can subscribe to specific file changes
      if (data.path) {
        socket.join(`file:${wallet_address}:${data.path}`);
        console.log(`📁 Client subscribed to file: ${data.path}`);
      }
    });

    socket.on('file:unsubscribe', (data: { path?: string }) => {
      if (data.path) {
        socket.leave(`file:${wallet_address}:${data.path}`);
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`🔌 WebSocket client disconnected: ${socket.id} (reason: ${reason})`);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`❌ WebSocket error for ${socket.id}:`, error);
    });
  });

  // Make io available globally for event broadcasting
  (io as any).database = database;

  return io;
}

/**
 * Get WebSocket server instance (for event broadcasting)
 * This will be set by setupWebSocket
 */
let globalIO: SocketIOServer | null = null;

export function setGlobalIO(io: SocketIOServer): void {
  globalIO = io;
}

export function getGlobalIO(): SocketIOServer | null {
  return globalIO;
}
