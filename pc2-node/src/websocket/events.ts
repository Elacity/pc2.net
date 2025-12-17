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
  
  if (connectedCount > 0) {
    io.to(room).emit('item.added', item);
    console.log(`📡 Broadcasted item.added to ${room} (${connectedCount} clients): ${item.name} in ${item.dirpath}`);
  } else {
    console.warn(`⚠️  No clients connected to ${room}, item.added event queued for polling: ${item.name} in ${item.dirpath}`);
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
  const eventData = {
    path: item.path,
    descendants_only: item.descendants_only !== undefined ? item.descendants_only : false,
    ...(item.uid && { uid: item.uid }),
    ...(item.original_client_socket_id !== undefined && { original_client_socket_id: item.original_client_socket_id })
  };
  
  // Queue event for polling-based delivery (matching mock server pattern)
  if (globalPendingEvents) {
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
  
  if (connectedCount > 0) {
    io.to(room).emit('item.removed', eventData);
    console.log(`📡 Broadcasted item.removed to ${room} (${connectedCount} clients): ${item.path}`);
  } else {
    console.warn(`⚠️  No clients connected to ${room}, item.removed event queued for polling: ${item.path}`);
  }
}

/**
 * Broadcast item moved event (for file moves)
 * Frontend listens for 'item.moved' to update UI
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
  const room = `user:${walletAddress}`;
  io.to(room).emit('item.moved', item);
  console.log(`📡 Broadcasted item.moved to ${room}: ${item.old_path} → ${item.path}`);
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
  // Normalize wallet address to lowercase for room matching (rooms are created with lowercase)
  const normalizedWallet = walletAddress.toLowerCase();
  const room = `user:${normalizedWallet}`;
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

