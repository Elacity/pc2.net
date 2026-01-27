/**
 * Vector Memory Store
 * 
 * Per-agent vector storage for semantic memory search.
 * Uses SQLite with sqlite-vec extension for vector similarity search.
 * Falls back to FTS5 keyword search if sqlite-vec is not available.
 * 
 * Each agent has its own isolated memory.db in their workspace.
 * 
 * SECURITY: All operations are scoped to wallet + agent for isolation.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { logger } from '../../../utils/logger.js';
import { EmbeddingProvider, EmbeddingResult } from './EmbeddingProvider.js';

/**
 * Memory chunk for storage
 */
export interface MemoryChunk {
  id?: number;
  content: string;
  source_file: string;
  category: string;
  embedding?: number[];
  created_at: number;
  updated_at: number;
}

/**
 * Search result with similarity score
 */
export interface SearchResult {
  chunk: MemoryChunk;
  score: number;
  matchType: 'vector' | 'keyword';
}

/**
 * Store configuration
 */
export interface VectorStoreConfig {
  // Maximum chunks to store per agent
  maxChunks: number;
  
  // Embedding dimensions (depends on model)
  dimensions: number;
  
  // Top-k results for search
  topK: number;
}

const DEFAULT_CONFIG: VectorStoreConfig = {
  maxChunks: 1000,
  dimensions: 768,  // nomic-embed-text default
  topK: 10,
};

/**
 * Vector Memory Store
 * 
 * Provides vector-based semantic search for agent memories.
 */
export class VectorMemoryStore {
  private db: Database.Database | null = null;
  private config: VectorStoreConfig;
  private dbPath: string;
  private hasVectorSupport = false;
  private initialized = false;

  constructor(
    private dataDir: string,
    private walletAddress: string,
    private agentId: string,
    private embeddingProvider: EmbeddingProvider,
    config: Partial<VectorStoreConfig> = {}
  ) {
    if (!walletAddress) {
      throw new Error('VectorMemoryStore requires walletAddress for security isolation');
    }
    if (!agentId) {
      throw new Error('VectorMemoryStore requires agentId for agent isolation');
    }
    
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Database path: data/agents/{walletAddress}/{agentId}/memory.db
    this.dbPath = path.join(
      dataDir,
      'agents',
      walletAddress.toLowerCase(),
      agentId,
      'memory.db'
    );
    
    logger.info('[VectorMemoryStore] Created', {
      wallet: walletAddress.substring(0, 10) + '...',
      agent: agentId,
      dbPath: this.dbPath,
    });
  }

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure directory exists
      const fs = await import('fs');
      const dir = path.dirname(this.dbPath);
      fs.mkdirSync(dir, { recursive: true });

      // Open database
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');

      // Try to load sqlite-vec extension
      try {
        // sqlite-vec extension loading would go here
        // For now, we'll use FTS5 as fallback
        this.hasVectorSupport = false;
        logger.info('[VectorMemoryStore] Using FTS5 keyword search (sqlite-vec not loaded)');
      } catch {
        this.hasVectorSupport = false;
        logger.info('[VectorMemoryStore] Using FTS5 keyword search (sqlite-vec not available)');
      }

      // Create tables
      this.createTables();
      
      this.initialized = true;
      logger.info('[VectorMemoryStore] Initialized', {
        hasVectorSupport: this.hasVectorSupport,
      });
    } catch (error: any) {
      logger.error('[VectorMemoryStore] Failed to initialize:', error.message);
      throw error;
    }
  }

  /**
   * Create database tables
   */
  private createTables(): void {
    if (!this.db) return;

    // Main chunks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        source_file TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        embedding BLOB,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_chunks_source ON memory_chunks(source_file);
      CREATE INDEX IF NOT EXISTS idx_chunks_category ON memory_chunks(category);
      CREATE INDEX IF NOT EXISTS idx_chunks_created ON memory_chunks(created_at);
    `);

    // FTS5 table for keyword search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_chunks_fts USING fts5(
        content,
        source_file,
        category,
        content='memory_chunks',
        content_rowid='id'
      );
    `);

    // Triggers to keep FTS in sync
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS memory_chunks_ai AFTER INSERT ON memory_chunks BEGIN
        INSERT INTO memory_chunks_fts(rowid, content, source_file, category)
        VALUES (new.id, new.content, new.source_file, new.category);
      END;
      
      CREATE TRIGGER IF NOT EXISTS memory_chunks_ad AFTER DELETE ON memory_chunks BEGIN
        INSERT INTO memory_chunks_fts(memory_chunks_fts, rowid, content, source_file, category)
        VALUES('delete', old.id, old.content, old.source_file, old.category);
      END;
      
      CREATE TRIGGER IF NOT EXISTS memory_chunks_au AFTER UPDATE ON memory_chunks BEGIN
        INSERT INTO memory_chunks_fts(memory_chunks_fts, rowid, content, source_file, category)
        VALUES('delete', old.id, old.content, old.source_file, old.category);
        INSERT INTO memory_chunks_fts(rowid, content, source_file, category)
        VALUES (new.id, new.content, new.source_file, new.category);
      END;
    `);
  }

  /**
   * Add a memory chunk
   */
  async addChunk(chunk: Omit<MemoryChunk, 'id' | 'embedding'>): Promise<number> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    // Generate embedding if provider is available
    let embedding: number[] | null = null;
    if (this.hasVectorSupport) {
      const result = await this.embeddingProvider.embed(chunk.content);
      if (result) {
        embedding = result.embedding;
      }
    }

    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO memory_chunks (content, source_file, category, embedding, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      chunk.content,
      chunk.source_file,
      chunk.category,
      embedding ? Buffer.from(new Float32Array(embedding).buffer) : null,
      chunk.created_at || now,
      chunk.updated_at || now
    );

    // Prune if over limit
    await this.pruneOldChunks();

    return result.lastInsertRowid as number;
  }

  /**
   * Add multiple chunks in a transaction
   */
  async addChunks(chunks: Array<Omit<MemoryChunk, 'id' | 'embedding'>>): Promise<number[]> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const ids: number[] = [];
    const now = Date.now();

    const insert = this.db.prepare(`
      INSERT INTO memory_chunks (content, source_file, category, embedding, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((chunks: Array<Omit<MemoryChunk, 'id' | 'embedding'>>) => {
      for (const chunk of chunks) {
        const result = insert.run(
          chunk.content,
          chunk.source_file,
          chunk.category,
          null, // No embedding in batch mode for performance
          chunk.created_at || now,
          chunk.updated_at || now
        );
        ids.push(result.lastInsertRowid as number);
      }
    });

    transaction(chunks);

    // Prune if over limit
    await this.pruneOldChunks();

    return ids;
  }

  /**
   * Search for similar chunks
   * Uses vector similarity if available, falls back to FTS5
   */
  async search(query: string, options?: { topK?: number; category?: string }): Promise<SearchResult[]> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const topK = options?.topK || this.config.topK;
    const category = options?.category;

    // Try vector search first
    if (this.hasVectorSupport) {
      const results = await this.vectorSearch(query, topK, category);
      if (results.length > 0) {
        return results;
      }
    }

    // Fall back to FTS5 keyword search
    return this.keywordSearch(query, topK, category);
  }

  /**
   * Vector similarity search
   */
  private async vectorSearch(
    query: string,
    topK: number,
    category?: string
  ): Promise<SearchResult[]> {
    if (!this.db) return [];

    // Get query embedding
    const queryResult = await this.embeddingProvider.embed(query);
    if (!queryResult) return [];

    // For now, we don't have sqlite-vec loaded
    // This would be the implementation if we did:
    // SELECT *, vec_distance(embedding, ?) as score
    // FROM memory_chunks
    // ORDER BY score ASC
    // LIMIT ?

    return [];
  }

  /**
   * FTS5 keyword search
   */
  private keywordSearch(
    query: string,
    topK: number,
    category?: string
  ): SearchResult[] {
    if (!this.db) return [];

    // Escape special FTS5 characters and create search query
    const searchQuery = query
      .replace(/['"]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .map(w => `"${w}"`)
      .join(' OR ');

    if (!searchQuery) return [];

    let sql = `
      SELECT mc.*, bm25(memory_chunks_fts) as score
      FROM memory_chunks_fts
      JOIN memory_chunks mc ON memory_chunks_fts.rowid = mc.id
      WHERE memory_chunks_fts MATCH ?
    `;

    const params: any[] = [searchQuery];

    if (category) {
      sql += ` AND mc.category = ?`;
      params.push(category);
    }

    sql += ` ORDER BY score LIMIT ?`;
    params.push(topK);

    try {
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params) as any[];

      return rows.map(row => ({
        chunk: {
          id: row.id,
          content: row.content,
          source_file: row.source_file,
          category: row.category,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
        score: Math.abs(row.score), // BM25 returns negative scores
        matchType: 'keyword' as const,
      }));
    } catch (error: any) {
      logger.warn('[VectorMemoryStore] FTS5 search failed:', error.message);
      return [];
    }
  }

  /**
   * Delete chunks by source file
   */
  async deleteBySource(sourceFile: string): Promise<number> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM memory_chunks WHERE source_file = ?');
    const result = stmt.run(sourceFile);
    return result.changes;
  }

  /**
   * Delete a specific chunk
   */
  async deleteChunk(id: number): Promise<boolean> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM memory_chunks WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Get chunk count
   */
  async getChunkCount(): Promise<number> {
    await this.initialize();
    if (!this.db) return 0;

    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM memory_chunks');
    const row = stmt.get() as { count: number };
    return row.count;
  }

  /**
   * Prune old chunks if over limit
   */
  private async pruneOldChunks(): Promise<void> {
    if (!this.db) return;

    const count = await this.getChunkCount();
    if (count <= this.config.maxChunks) return;

    const toDelete = count - this.config.maxChunks;
    const stmt = this.db.prepare(`
      DELETE FROM memory_chunks
      WHERE id IN (
        SELECT id FROM memory_chunks
        ORDER BY created_at ASC
        LIMIT ?
      )
    `);
    stmt.run(toDelete);

    logger.info('[VectorMemoryStore] Pruned old chunks:', { deleted: toDelete });
  }

  /**
   * Get all chunks (for export/debug)
   */
  async getAllChunks(limit = 100): Promise<MemoryChunk[]> {
    await this.initialize();
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT id, content, source_file, category, created_at, updated_at
      FROM memory_chunks
      ORDER BY created_at DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      content: row.content,
      source_file: row.source_file,
      category: row.category,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  /**
   * Check if vector support is available
   */
  hasVectors(): boolean {
    return this.hasVectorSupport;
  }

  /**
   * Get database path
   */
  getDbPath(): string {
    return this.dbPath;
  }
}
