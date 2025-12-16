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

