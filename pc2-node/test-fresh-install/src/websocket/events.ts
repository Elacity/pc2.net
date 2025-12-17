/**
 * WebSocket Events
 * 
 * Event types and broadcasting for real-time updates
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { DatabaseManager } from '../storage/database.js';

export interface SocketUser {
  wallet_address: string;
  smart_account_address: string | null;
  session_token: string;
}

export interface FileChangeEvent {
  path: string;
  wallet_address: string;
  action: 'created' | 'updated' | 'deleted' | 'moved';
  metadata?: {
    size?: number;
    mime_type?: string;
    is_dir?: boolean;
  };
}

export interface DirectoryChangeEvent {
  path: string;
  wallet_address: string;
  action: 'created' | 'deleted' | 'updated';
}

/**
 * Broadcast file change event to user's room
 */
export function broadcastFileChange(
  io: SocketIOServer,
  event: FileChangeEvent
): void {
  const room = `user:${event.wallet_address}`;
  io.to(room).emit('file:changed', event);
  console.log(`📡 Broadcasted file change to ${room}: ${event.action} ${event.path}`);
}

/**
 * Broadcast directory change event to user's room
 */
export function broadcastDirectoryChange(
  io: SocketIOServer,
  event: DirectoryChangeEvent
): void {
  const room = `user:${event.wallet_address}`;
  io.to(room).emit('directory:changed', event);
  console.log(`📡 Broadcasted directory change to ${room}: ${event.action} ${event.path}`);
}

/**
 * Broadcast item renamed event (matching mock server format)
 */
export function broadcastItemRenamed(
  io: SocketIOServer,
  walletAddress: string,
  item: {
    uid: string;
    name: string;
    path: string;
    old_path: string;
    is_dir: boolean;
    type: string | null;
    original_client_socket_id?: string;
  }
): void {
  const room = `user:${walletAddress}`;
  io.to(room).emit('item.renamed', item);
  console.log(`📡 Broadcasted item.renamed to ${room}: ${item.old_path} → ${item.path}`);
}

// Global event queue (matching mock server pattern)
// This will be set by the WebSocket server
let globalPendingEvents: Array<{ event: string; data: any; wallet: string | null; timestamp: number }> | null = null;

export function setEventQueue(queue: Array<{ event: string; data: any; wallet: string | null; timestamp: number }>) {
  globalPendingEvents = queue;
}

export function getEventQueue(): Array<{ event: string; data: any; wallet: string | null; timestamp: number }> | null {
  return globalPendingEvents;
}

/**
 * Broadcast item added event (for file uploads/creation)
 * Frontend listens for 'item.added' to update UI immediately
 * Also queues event for polling-based delivery (matching mock server)
 */
export function broadcastItemAdded(
  io: SocketIOServer,
  walletAddress: string,
  item: {
    uid: string;
    uuid: string;
    name: string;
    path: string;
    dirpath: string; // CRITICAL: Parent directory path (frontend uses this)
    size: number;
    type: string | null;
    mime_type?: string;
    is_dir: boolean;
    created: string; // ISO timestamp
    modified: string; // ISO timestamp
    original_client_socket_id?: string | null;
    thumbnail?: string;
  }
): void {
  // Normalize wallet address to lowercase for room matching (rooms are created with lowercase)
  const normalizedWallet = walletAddress.toLowerCase();
  const room = `user:${normalizedWallet}`;
  const roomSockets = io.sockets.adapter.rooms.get(room);
  const connectedCount = roomSockets ? roomSockets.size : 0;
  
  // Queue event for polling-based delivery (matching mock server pattern)
  if (globalPendingEvents) {
    const normalizedWallet = walletAddress.toLowerCase();
    globalPendingEvents.push({
      event: 'item.added',
      data: item,
      wallet: normalizedWallet,
      timestamp: Date.now()
    });
    // Keep only last 100 events
    if (globalPendingEvents.length > 100) {
      globalPendingEvents.shift();
    }
    console.log(`🔔 Queued item.added event for wallet: ${normalizedWallet}, queue size: ${globalPendingEvents.length}`);
  }
  
  // Always emit to room (Socket.io will queue for polling if no WebSocket connection)
  // This ensures events are delivered even if clients are using polling
  console.log(`📡 Emitting item.added to room: ${room}, name: ${item.name}, dirpath: ${item.dirpath}, connectedCount: ${connectedCount}`);
  io.to(room).emit('item.added', item);
  console.log(`📡 Event emitted - Socket.io should deliver to ${connectedCount} WebSocket clients or via polling`);
  
  if (connectedCount > 0) {
    console.log(`📡 Broadcasted item.added to ${room} (${connectedCount} clients): ${item.name} in ${item.dirpath}`);
    
    // Also emit directly to each socket to ensure delivery
    const roomSocketsArray = Array.from(roomSockets || []);
    roomSocketsArray.forEach(socketId => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket && socket.connected) {
        console.log(`📡 Directly emitting item.added to socket ${socketId.substring(0, 10)}...`);
        socket.emit('item.added', item);
      } else {
        console.warn(`⚠️  Socket ${socketId.substring(0, 10)}... not connected, event queued for polling`);
      }
    });
  } else {
    console.log(`📡 Emitted item.added to ${room} (0 WebSocket clients, will be delivered via polling): ${item.name} in ${item.dirpath}`);
    const allRooms = Array.from(io.sockets.adapter.rooms.keys()).filter(r => r.startsWith('user:'));
    console.log(`📡 Available rooms (${allRooms.length}):`, allRooms.slice(0, 10));
  }
}

/**
 * Broadcast item removed event (for file deletion)
 * Frontend listens for 'item.removed' to remove from UI
 * Matches mock server format: { path, descendants_only: false, uid?, original_client_socket_id? }
 * Also queues event for polling-based delivery (matching mock server)
 */
export function broadcastItemRemoved(
  io: SocketIOServer,
  walletAddress: string,
  item: {
    path: string;
    uid?: string;
    descendants_only?: boolean;
    original_client_socket_id?: string | null;
  }
): void {
  // Normalize wallet address to lowercase for room matching (rooms are created with lowercase)
  const normalizedWallet = walletAddress.toLowerCase();
  const room = `user:${normalizedWallet}`;
  const roomSockets = io.sockets.adapter.rooms.get(room);
  const connectedCount = roomSockets ? roomSockets.size : 0;
  
  // Ensure descendants_only is set (mock server format)
  // Only include original_client_socket_id if it's a non-null string (to avoid null === null comparison issues)
  const eventData: any = {
    path: item.path,
    descendants_only: item.descendants_only !== undefined ? item.descendants_only : false,
    ...(item.uid && { uid: item.uid })
  };
  
  // Only include original_client_socket_id if it's a valid string (not null/undefined)
  // This prevents frontend handler from skipping events when window.socket.id is null/undefined
  if (item.original_client_socket_id && typeof item.original_client_socket_id === 'string') {
    eventData.original_client_socket_id = item.original_client_socket_id;
  }
  
  // Queue event for polling-based delivery (matching mock server pattern)
  if (globalPendingEvents) {
    const normalizedWallet = walletAddress.toLowerCase();
    globalPendingEvents.push({
      event: 'item.removed',
      data: eventData,
      wallet: normalizedWallet,
      timestamp: Date.now()
    });
    // Keep only last 100 events
    if (globalPendingEvents.length > 100) {
      globalPendingEvents.shift();
    }
    console.log(`🔔 Queued item.removed event for wallet: ${normalizedWallet}, queue size: ${globalPendingEvents.length}`);
  }
  
  // Always emit to room (Socket.io will queue for polling if no WebSocket connection)
  // This ensures events are delivered even if clients are using polling
  console.log(`📡 Emitting item.removed to room: ${room}, path: ${item.path}, connectedCount: ${connectedCount}`);
  
  // Double-check room membership right before emitting (sockets might have disconnected)
  const currentRoomSockets = io.sockets.adapter.rooms.get(room);
  const currentConnectedCount = currentRoomSockets ? currentRoomSockets.size : 0;
  if (currentConnectedCount !== connectedCount) {
    console.log(`⚠️  Room membership changed! Was ${connectedCount}, now ${currentConnectedCount}`);
  }
  
  io.to(room).emit('item.removed', eventData);
  console.log(`📡 Event emitted - Socket.io should deliver to ${currentConnectedCount} WebSocket clients or via polling`);
  
  if (currentConnectedCount > 0) {
    console.log(`📡 Broadcasted item.removed to ${room} (${currentConnectedCount} clients): ${item.path}`);
    console.log(`📡 Event data:`, JSON.stringify(eventData, null, 2));
    
    // Log all sockets in the room for debugging
    const roomSocketsArray = Array.from(currentRoomSockets || []);
    console.log(`📡 Room ${room} has ${currentConnectedCount} client(s):`, roomSocketsArray.map(sid => sid.substring(0, 10) + '...'));
    
    // Also emit directly to each socket to ensure delivery
    roomSocketsArray.forEach(socketId => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket && socket.connected) {
        console.log(`📡 Directly emitting item.removed to socket ${socketId.substring(0, 10)}... (path: ${eventData.path})`);
        socket.emit('item.removed', eventData);
        console.log(`✅ [SERVER] Emitted item.removed to socket ${socketId} - Socket.io should deliver to client`);
      } else {
        console.warn(`⚠️  Socket ${socketId.substring(0, 10)}... not connected (connected: ${socket?.connected}), event queued for polling`);
      }
    });
  } else {
    console.log(`📡 Emitted item.removed to ${room} (0 WebSocket clients, will be delivered via polling): ${item.path}`);
    const allRooms = Array.from(io.sockets.adapter.rooms.keys()).filter(r => r.startsWith('user:'));
    console.log(`📡 Available rooms (${allRooms.length}):`, allRooms.slice(0, 10));
    console.log(`📡 Looking for room: ${room}, normalized wallet: ${normalizedWallet}`);
  }
}

/**
 * Broadcast item moved event (for file moves)
 * Frontend listens for 'item.moved' to update UI
 * Also queues event for polling-based delivery (matching mock server)
 */
export function broadcastItemMoved(
  io: SocketIOServer,
  walletAddress: string,
  item: {
    uid: string;
    path: string;
    old_path: string;
    name: string;
    metadata?: {
      size?: number;
      mime_type?: string;
      is_dir?: boolean;
    };
    original_client_socket_id?: string | null;
  }
): void {
  // Normalize wallet address to lowercase for room matching (rooms are created with lowercase)
  const normalizedWallet = walletAddress.toLowerCase();
  const room = `user:${normalizedWallet}`;
  const roomSockets = io.sockets.adapter.rooms.get(room);
  const connectedCount = roomSockets ? roomSockets.size : 0;
  
  // Build event data (matching mock server format)
  // Only include original_client_socket_id if it's a non-null string (to avoid null === null comparison issues)
  const eventData: any = {
    uid: item.uid,
    path: item.path,
    old_path: item.old_path,
    name: item.name,
    ...(item.metadata && { metadata: item.metadata })
  };
  
  // Only include original_client_socket_id if it's a valid string (not null/undefined)
  // This prevents frontend handler from skipping events when window.socket.id is null/undefined
  if (item.original_client_socket_id && typeof item.original_client_socket_id === 'string') {
    eventData.original_client_socket_id = item.original_client_socket_id;
  }
  
  // Queue event for polling-based delivery (matching mock server pattern)
  if (globalPendingEvents) {
    globalPendingEvents.push({
      event: 'item.moved',
      data: eventData,
      wallet: normalizedWallet,
      timestamp: Date.now()
    });
    // Keep only last 100 events
    if (globalPendingEvents.length > 100) {
      globalPendingEvents.shift();
    }
    console.log(`🔔 Queued item.moved event for wallet: ${normalizedWallet}, queue size: ${globalPendingEvents.length}`);
  }
  
  // Always emit to room (Socket.io will queue for polling if no WebSocket connection)
  // This ensures events are delivered even if clients are using polling
  console.log(`📡 Emitting item.moved to room: ${room}, from: ${eventData.old_path}, to: ${eventData.path}, connectedCount: ${connectedCount}`);
  io.to(room).emit('item.moved', eventData);
  console.log(`📡 Event emitted - Socket.io should deliver to ${connectedCount} WebSocket clients or via polling`);
  
  if (connectedCount > 0) {
    console.log(`📡 Broadcasted item.moved to ${room} (${connectedCount} clients): ${eventData.old_path} → ${eventData.path}`);
    console.log(`📡 Event data:`, JSON.stringify(eventData, null, 2));
    
    // Log all sockets in the room for debugging
    const roomSocketsArray = Array.from(roomSockets || []);
    console.log(`📡 Room ${room} has ${connectedCount} client(s):`, roomSocketsArray.map(sid => sid.substring(0, 10) + '...'));
    
    // Also emit directly to each socket to ensure delivery
    roomSocketsArray.forEach(socketId => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket && socket.connected) {
        console.log(`📡 Directly emitting item.moved to socket ${socketId.substring(0, 10)}...`);
        socket.emit('item.moved', eventData);
      } else {
        console.warn(`⚠️  Socket ${socketId.substring(0, 10)}... not connected, event queued for polling`);
      }
    });
  } else {
    console.log(`📡 Emitted item.moved to ${room} (0 WebSocket clients, will be delivered via polling): ${eventData.old_path} → ${eventData.path}`);
    const allRooms = Array.from(io.sockets.adapter.rooms.keys()).filter(r => r.startsWith('user:'));
    console.log(`📡 Available rooms (${allRooms.length}):`, allRooms.slice(0, 10));
    console.log(`📡 Looking for room: ${room}, normalized wallet: ${normalizedWallet}`);
  }
}

/**
 * Broadcast item updated event (for file updates)
 * Frontend listens for 'item.updated' to refresh UI
 */
export function broadcastItemUpdated(
  io: SocketIOServer,
  walletAddress: string,
  item: {
    uid: string;
    name: string;
    path: string;
    old_path?: string;
    size: number;
    modified: string; // ISO timestamp
    original_client_socket_id?: string | null;
  }
): void {
  const room = `user:${walletAddress}`;
  io.to(room).emit('item.updated', item);
  console.log(`📡 Broadcasted item.updated to ${room}: ${item.path}`);
}

/**
 * Broadcast to specific user by wallet address
 */
export function broadcastToUser(
  io: SocketIOServer,
  walletAddress: string,
  event: string,
  data: any
): void {
  const room = `user:${walletAddress}`;
  io.to(room).emit(event, data);
}

/**
 * Get connected clients for a user
 */
export function getConnectedClients(
  io: SocketIOServer,
  walletAddress: string
): number {
  const room = `user:${walletAddress}`;
  const roomSockets = io.sockets.adapter.rooms.get(room);
  return roomSockets ? roomSockets.size : 0;
}

