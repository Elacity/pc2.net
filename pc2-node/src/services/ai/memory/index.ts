/**
 * Memory Services
 * 
 * Exports for agent memory management following Clawdbot patterns.
 */

export { AgentMemoryManager } from './AgentMemoryManager.js';
export type {
  MemoryEntry,
  DailyNote,
  AgentMemoryContext,
  AgentMemoryConfig,
} from './AgentMemoryManager.js';

export { EmbeddingProvider } from './EmbeddingProvider.js';
export type {
  EmbeddingResult,
  ProviderConfig,
} from './EmbeddingProvider.js';

export { VectorMemoryStore } from './VectorMemoryStore.js';
export type {
  MemoryChunk,
  SearchResult,
  VectorStoreConfig,
} from './VectorMemoryStore.js';

export { MemoryConsolidator } from './MemoryConsolidator.js';
export type {
  ContextEntity,
  ContextAction,
  ConsolidatedState,
  MemoryConfig,
} from './MemoryConsolidator.js';
