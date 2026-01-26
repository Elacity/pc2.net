/**
 * Storage Module Exports
 * 
 * Central export point for storage-related modules
 */

import { DatabaseManager } from './database.js';

export { DatabaseManager, type User, type Session, type FileMetadata, type Setting } from './database.js';
export { runMigrations } from './migrations.js';
export { IPFSStorage, type IPFSOptions, type IPFSNetworkMode } from './ipfs.js';
export { FilesystemManager, type FileContent } from './filesystem.js';

// Global database singleton
let globalDatabase: DatabaseManager | null = null;

/**
 * Set the global database instance (called during app initialization)
 */
export function setGlobalDatabase(db: DatabaseManager): void {
  globalDatabase = db;
}

/**
 * Get the global database instance
 * @throws Error if database not initialized
 */
export function getDatabase(): DatabaseManager {
  if (!globalDatabase) {
    throw new Error('Database not initialized. Call setGlobalDatabase() first.');
  }
  return globalDatabase;
}
