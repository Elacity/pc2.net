/**
 * WebSocket Events
 *
 * Event types and broadcasting for real-time updates
 */
import { Server as SocketIOServer } from 'socket.io';
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
export declare function broadcastFileChange(io: SocketIOServer, event: FileChangeEvent): void;
/**
 * Broadcast directory change event to user's room
 */
export declare function broadcastDirectoryChange(io: SocketIOServer, event: DirectoryChangeEvent): void;
/**
 * Broadcast item renamed event (matching mock server format)
 */
export declare function broadcastItemRenamed(io: SocketIOServer, walletAddress: string, item: {
    uid: string;
    name: string;
    path: string;
    old_path: string;
    is_dir: boolean;
    type: string | null;
    thumbnail?: string | null;
    original_client_socket_id?: string;
}): void;
export declare function setEventQueue(queue: Array<{
    event: string;
    data: any;
    wallet: string | null;
    timestamp: number;
}>): void;
export declare function getEventQueue(): Array<{
    event: string;
    data: any;
    wallet: string | null;
    timestamp: number;
}> | null;
/**
 * Broadcast item added event (for file uploads/creation)
 * Frontend listens for 'item.added' to update UI immediately
 * Also queues event for polling-based delivery (matching mock server)
 */
export declare function broadcastItemAdded(io: SocketIOServer, walletAddress: string, item: {
    uid: string;
    uuid: string;
    name: string;
    path: string;
    dirpath: string;
    size: number;
    type: string | null;
    mime_type?: string;
    is_dir: boolean;
    created: string;
    modified: string;
    original_client_socket_id?: string | null;
    thumbnail?: string;
}): void;
/**
 * Broadcast item removed event (for file deletion)
 * Frontend listens for 'item.removed' to remove from UI
 * Matches mock server format: { path, descendants_only: false, uid?, original_client_socket_id? }
 * Also queues event for polling-based delivery (matching mock server)
 */
export declare function broadcastItemRemoved(io: SocketIOServer, walletAddress: string, item: {
    path: string;
    uid?: string;
    descendants_only?: boolean;
    original_client_socket_id?: string | null;
}): void;
/**
 * Broadcast item moved event (for file moves)
 * Frontend listens for 'item.moved' to update UI
 * Also queues event for polling-based delivery (matching mock server)
 */
export declare function broadcastItemMoved(io: SocketIOServer, walletAddress: string, item: {
    uid: string;
    path: string;
    old_path: string;
    name: string;
    is_dir?: boolean;
    size?: number;
    type?: string | null;
    modified?: string;
    thumbnail?: string | undefined;
    metadata?: {
        size?: number;
        mime_type?: string;
        is_dir?: boolean;
        thumbnail?: string | undefined;
    };
    original_client_socket_id?: string | null;
}): void;
/**
 * Broadcast item updated event (for file updates)
 * Frontend listens for 'item.updated' to refresh UI
 */
export declare function broadcastItemUpdated(io: SocketIOServer, walletAddress: string, item: {
    uid: string;
    name: string;
    path: string;
    old_path?: string;
    size: number;
    modified: string;
    original_client_socket_id?: string | null;
    thumbnail?: string;
    type?: string;
    is_dir?: boolean;
}): void;
/**
 * Broadcast to specific user by wallet address
 */
export declare function broadcastToUser(io: SocketIOServer, walletAddress: string, event: string, data: any): void;
/**
 * Get connected clients for a user
 */
export declare function getConnectedClients(io: SocketIOServer, walletAddress: string): number;
//# sourceMappingURL=events.d.ts.map