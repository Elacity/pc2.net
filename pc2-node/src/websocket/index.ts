/**
 * WebSocket Module Exports
 * 
 * Central export point for WebSocket-related modules
 */

export { setupWebSocket, setGlobalIO, getGlobalIO } from './server.js';
export { 
  broadcastFileChange, 
  broadcastDirectoryChange, 
  broadcastToUser,
  getConnectedClients,
  type SocketUser,
  type FileChangeEvent,
  type DirectoryChangeEvent
} from './events.js';

