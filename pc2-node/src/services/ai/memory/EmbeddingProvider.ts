/**
 * Embedding Provider
 * 
 * Multi-provider embedding service for semantic memory search.
 * Supports multiple providers with automatic fallback:
 * 1. Ollama local (default, sovereign)
 * 2. OpenAI text-embedding-3-small
 * 3. Google text-embedding-004
 * 
 * The provider detects what's available from user's AI config and uses the best option.
 */

import { logger } from '../../../utils/logger.js';
import { DatabaseManager } from '../../../storage/database.js';

/**
 * Embedding result
 */
export interface EmbeddingResult {
  embedding: number[];
  model: string;
  provider: string;
  dimensions: number;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Embedding Provider
 * 
 * Provides text embeddings using the best available provider.
 */
export class EmbeddingProvider {
  private config: ProviderConfig | null = null;
  private initialized = false;

  constructor(
    private db: DatabaseManager,
    private walletAddress: string
  ) {
    if (!walletAddress) {
      throw new Error('EmbeddingProvider requires walletAddress for config lookup');
    }
  }

  /**
   * Initialize the provider by detecting available embedding services
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return !!this.config;

    // Get user's AI configuration
    const aiConfig = this.db.getAIConfig(this.walletAddress);
    let apiKeys: Record<string, string> = {};
    
    try {
      apiKeys = aiConfig?.api_keys ? JSON.parse(aiConfig.api_keys) : {};
    } catch {
      apiKeys = {};
    }

    // Priority 1: Ollama local (always available if running)
    if (await this.checkOllamaAvailable()) {
      this.config = {
        provider: 'ollama',
        model: 'nomic-embed-text',
        baseUrl: 'http://localhost:11434',
      };
      logger.info('[EmbeddingProvider] Using Ollama (local, sovereign)');
      this.initialized = true;
      return true;
    }

    // Priority 2: OpenAI
    if (apiKeys.openai) {
      this.config = {
        provider: 'openai',
        model: 'text-embedding-3-small',
        apiKey: apiKeys.openai,
      };
      logger.info('[EmbeddingProvider] Using OpenAI');
      this.initialized = true;
      return true;
    }

    // Priority 3: Google
    if (apiKeys.google) {
      this.config = {
        provider: 'google',
        model: 'text-embedding-004',
        apiKey: apiKeys.google,
      };
      logger.info('[EmbeddingProvider] Using Google');
      this.initialized = true;
      return true;
    }

    // No embedding provider available
    logger.warn('[EmbeddingProvider] No embedding provider available - semantic search disabled');
    this.initialized = true;
    return false;
  }

  /**
   * Check if Ollama is running and has an embedding model
   */
  private async checkOllamaAvailable(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      
      if (!response.ok) return false;
      
      const data = await response.json() as { models?: Array<{ name: string }> };
      const models = data.models || [];
      
      // Check for common embedding models
      const embeddingModels = ['nomic-embed-text', 'mxbai-embed-large', 'all-minilm'];
      const hasEmbeddingModel = models.some(m => 
        embeddingModels.some(em => m.name.includes(em))
      );
      
      if (hasEmbeddingModel) {
        return true;
      }
      
      // If no embedding model, try to pull one
      logger.info('[EmbeddingProvider] No embedding model found, will attempt to pull nomic-embed-text');
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Generate embeddings for text
   */
  async embed(text: string): Promise<EmbeddingResult | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.config) {
      return null;
    }

    try {
      switch (this.config.provider) {
        case 'ollama':
          return await this.embedWithOllama(text);
        case 'openai':
          return await this.embedWithOpenAI(text);
        case 'google':
          return await this.embedWithGoogle(text);
        default:
          return null;
      }
    } catch (error: any) {
      logger.error('[EmbeddingProvider] Embedding failed:', error.message);
      return null;
    }
  }

  /**
   * Generate embeddings using Ollama
   */
  private async embedWithOllama(text: string): Promise<EmbeddingResult> {
    const response = await fetch(`${this.config!.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config!.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding failed: ${response.statusText}`);
    }

    const data = await response.json() as { embedding: number[] };
    
    return {
      embedding: data.embedding,
      model: this.config!.model,
      provider: 'ollama',
      dimensions: data.embedding.length,
    };
  }

  /**
   * Generate embeddings using OpenAI
   */
  private async embedWithOpenAI(text: string): Promise<EmbeddingResult> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config!.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config!.model,
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding failed: ${response.statusText}`);
    }

    const data = await response.json() as { 
      data: Array<{ embedding: number[] }> 
    };
    
    const embedding = data.data[0].embedding;
    
    return {
      embedding,
      model: this.config!.model,
      provider: 'openai',
      dimensions: embedding.length,
    };
  }

  /**
   * Generate embeddings using Google
   */
  private async embedWithGoogle(text: string): Promise<EmbeddingResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config!.model}:embedContent?key=${this.config!.apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
      }),
    });

    if (!response.ok) {
      throw new Error(`Google embedding failed: ${response.statusText}`);
    }

    const data = await response.json() as { 
      embedding: { values: number[] } 
    };
    
    const embedding = data.embedding.values;
    
    return {
      embedding,
      model: this.config!.model,
      provider: 'google',
      dimensions: embedding.length,
    };
  }

  /**
   * Batch embed multiple texts
   */
  async embedBatch(texts: string[]): Promise<Array<EmbeddingResult | null>> {
    // For now, embed sequentially. Can be optimized for batch APIs.
    const results: Array<EmbeddingResult | null> = [];
    
    for (const text of texts) {
      const result = await this.embed(text);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Get current provider info
   */
  getProviderInfo(): { provider: string; model: string } | null {
    if (!this.config) return null;
    return {
      provider: this.config.provider,
      model: this.config.model,
    };
  }

  /**
   * Check if embeddings are available
   */
  isAvailable(): boolean {
    return this.initialized && !!this.config;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have same dimensions');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;
    
    return dotProduct / magnitude;
  }
}
