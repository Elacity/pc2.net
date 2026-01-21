/**
 * Context Retriever - RAG Foundation
 * 
 * Provides retrieval-augmented generation (RAG) capabilities for the AI chat.
 * Retrieves relevant context from:
 * - Conversation history
 * - File contents (via search)
 * - User's previous actions
 * 
 * This is a foundational implementation using keyword-based search.
 * Can be enhanced with embedding-based semantic search in the future.
 * 
 * SECURITY: All operations are wallet-scoped for user isolation.
 */

import { logger } from '../../../utils/logger.js';
import { DatabaseManager } from '../../../storage/database.js';
import { FilesystemManager } from '../../../storage/filesystem.js';

/**
 * Retrieved context chunk
 */
export interface ContextChunk {
  // Source type
  source: 'conversation' | 'file' | 'action';
  
  // Content text
  content: string;
  
  // Relevance score (0-1)
  score: number;
  
  // Source metadata
  metadata: {
    // For conversations: message index
    messageIndex?: number;
    
    // For files: file path
    filePath?: string;
    
    // For actions: action type
    actionType?: string;
    
    // Timestamp
    timestamp?: number;
  };
}

/**
 * Retrieval configuration
 */
export interface RetrievalConfig {
  // Maximum number of chunks to retrieve
  maxChunks: number;
  
  // Minimum relevance score (0-1)
  minScore: number;
  
  // Whether to search file contents
  searchFiles: boolean;
  
  // Maximum file size to search (bytes)
  maxFileSize: number;
  
  // File extensions to search
  searchableExtensions: string[];
}

const DEFAULT_CONFIG: RetrievalConfig = {
  maxChunks: 5,
  minScore: 0.3,
  searchFiles: true,
  maxFileSize: 50000, // 50KB
  searchableExtensions: ['.txt', '.md', '.json', '.yaml', '.yml', '.csv', '.log'],
};

/**
 * Context Retriever
 * 
 * Retrieves relevant context for AI queries using keyword matching.
 * All operations are wallet-scoped for security.
 */
export class ContextRetriever {
  private config: RetrievalConfig;

  constructor(
    private db: DatabaseManager,
    private filesystem: FilesystemManager,
    private walletAddress: string,
    config: Partial<RetrievalConfig> = {}
  ) {
    // SECURITY: Require wallet address for isolation
    if (!walletAddress) {
      throw new Error('ContextRetriever requires walletAddress for security isolation');
    }
    
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info('[ContextRetriever] Initialized for wallet:', walletAddress.substring(0, 10) + '...');
  }

  /**
   * Retrieve relevant context for a query
   */
  async retrieve(query: string, conversationHistory?: string[]): Promise<ContextChunk[]> {
    const chunks: ContextChunk[] = [];
    
    // Extract keywords from query
    const keywords = this.extractKeywords(query);
    
    if (keywords.length === 0) {
      logger.debug('[ContextRetriever] No keywords extracted from query');
      return [];
    }
    
    logger.info('[ContextRetriever] Retrieving context for keywords:', keywords);
    
    // Search conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      const conversationChunks = this.searchConversationHistory(
        keywords,
        conversationHistory
      );
      chunks.push(...conversationChunks);
    }
    
    // Search file contents if enabled
    if (this.config.searchFiles) {
      try {
        const fileChunks = await this.searchFiles(keywords);
        chunks.push(...fileChunks);
      } catch (error: any) {
        logger.warn('[ContextRetriever] File search failed:', error.message);
      }
    }
    
    // Search recent actions from memory state
    try {
      const actionChunks = await this.searchRecentActions(keywords);
      chunks.push(...actionChunks);
    } catch (error: any) {
      logger.warn('[ContextRetriever] Action search failed:', error.message);
    }
    
    // Sort by score and limit
    const sortedChunks = chunks
      .filter(c => c.score >= this.config.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxChunks);
    
    logger.info('[ContextRetriever] Retrieved chunks:', {
      total: chunks.length,
      filtered: sortedChunks.length,
      sources: sortedChunks.map(c => c.source),
    });
    
    return sortedChunks;
  }

  /**
   * Extract searchable keywords from query
   */
  private extractKeywords(query: string): string[] {
    // Lowercase and split
    const words = query.toLowerCase().split(/\s+/);
    
    // Remove stop words
    const stopWords = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
      'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'can', 'to',
      'of', 'in', 'on', 'at', 'for', 'with', 'about', 'from', 'by',
      'this', 'that', 'these', 'those', 'it', 'its', 'my', 'your',
      'what', 'which', 'who', 'when', 'where', 'why', 'how',
      'please', 'thanks', 'thank', 'you', 'me', 'i', 'we', 'they',
      'create', 'make', 'add', 'delete', 'move', 'copy', 'file', 'folder',
    ]);
    
    // Filter and dedupe
    const keywords = words
      .filter(w => w.length > 2 && !stopWords.has(w))
      .filter(w => !/^\d+$/.test(w)) // Remove pure numbers
      .map(w => w.replace(/[^a-z0-9]/g, '')); // Remove special chars
    
    return [...new Set(keywords)];
  }

  /**
   * Search conversation history for relevant messages
   */
  private searchConversationHistory(
    keywords: string[],
    history: string[]
  ): ContextChunk[] {
    const chunks: ContextChunk[] = [];
    
    for (let i = 0; i < history.length; i++) {
      const message = history[i];
      const score = this.calculateRelevanceScore(keywords, message);
      
      if (score > 0) {
        chunks.push({
          source: 'conversation',
          content: this.truncateContent(message, 500),
          score,
          metadata: {
            messageIndex: i,
            timestamp: Date.now() - (history.length - i) * 60000, // Estimate
          },
        });
      }
    }
    
    return chunks;
  }

  /**
   * Search files for relevant content
   * Uses database FTS if available, otherwise falls back to listing
   */
  private async searchFiles(keywords: string[]): Promise<ContextChunk[]> {
    const chunks: ContextChunk[] = [];
    
    try {
      // Try FTS search first
      const searchQuery = keywords.join(' ');
      const results = await this.searchFilesWithFTS(searchQuery);
      
      for (const result of results) {
        chunks.push({
          source: 'file',
          content: this.truncateContent(result.content, 500),
          score: result.score,
          metadata: {
            filePath: result.path,
            timestamp: result.updatedAt,
          },
        });
      }
    } catch (error: any) {
      logger.debug('[ContextRetriever] FTS search failed, using fallback:', error.message);
    }
    
    return chunks;
  }

  /**
   * Search files using SQLite FTS
   */
  private async searchFilesWithFTS(query: string): Promise<Array<{
    path: string;
    content: string;
    score: number;
    updatedAt: number;
  }>> {
    // Use database search if available
    const results = this.db.searchFiles(this.walletAddress, query, 10);
    
    return results.map(r => ({
      path: r.path,
      content: r.content_text || '',
      score: 0.7, // FTS matches are reasonably relevant
      updatedAt: r.updated_at,
    }));
  }

  /**
   * Search recent actions from memory state
   */
  private async searchRecentActions(keywords: string[]): Promise<ContextChunk[]> {
    const chunks: ContextChunk[] = [];
    
    try {
      const memoryState = this.db.getMemoryState(this.walletAddress);
      
      if (memoryState?.last_actions_json) {
        const actions = JSON.parse(memoryState.last_actions_json);
        
        for (const action of actions) {
          const actionText = `${action.toolName}: ${action.summary || ''} ${action.path || ''}`;
          const score = this.calculateRelevanceScore(keywords, actionText);
          
          if (score > 0) {
            chunks.push({
              source: 'action',
              content: actionText,
              score,
              metadata: {
                actionType: action.toolName,
                filePath: action.path,
                timestamp: action.timestamp,
              },
            });
          }
        }
      }
    } catch (error: any) {
      logger.debug('[ContextRetriever] Action search error:', error.message);
    }
    
    return chunks;
  }

  /**
   * Calculate relevance score based on keyword matches
   * Returns score between 0 and 1
   */
  private calculateRelevanceScore(keywords: string[], text: string): number {
    if (!text || keywords.length === 0) {
      return 0;
    }
    
    const lowerText = text.toLowerCase();
    let matches = 0;
    let weightedScore = 0;
    
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        matches++;
        // Boost for exact word matches
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const exactMatches = (text.match(regex) || []).length;
        weightedScore += exactMatches > 0 ? 0.2 : 0.1;
      }
    }
    
    if (matches === 0) {
      return 0;
    }
    
    // Base score from match ratio
    const matchRatio = matches / keywords.length;
    
    // Combined score
    return Math.min(matchRatio * 0.6 + weightedScore, 1);
  }

  /**
   * Truncate content to max length while preserving word boundaries
   */
  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }
    
    // Find last space before maxLength
    const truncated = content.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  }

  /**
   * Build retrieval context string for injection into prompt
   */
  buildRetrievalContext(chunks: ContextChunk[]): string {
    if (chunks.length === 0) {
      return '';
    }
    
    const sections: string[] = [];
    
    // Group by source
    const bySource = {
      conversation: chunks.filter(c => c.source === 'conversation'),
      file: chunks.filter(c => c.source === 'file'),
      action: chunks.filter(c => c.source === 'action'),
    };
    
    if (bySource.conversation.length > 0) {
      const convItems = bySource.conversation
        .map(c => `- [Message ${c.metadata.messageIndex}]: ${c.content}`)
        .join('\n');
      sections.push(`<RELEVANT_CONVERSATION>\n${convItems}\n</RELEVANT_CONVERSATION>`);
    }
    
    if (bySource.file.length > 0) {
      const fileItems = bySource.file
        .map(c => `- [${c.metadata.filePath}]: ${c.content}`)
        .join('\n');
      sections.push(`<RELEVANT_FILES>\n${fileItems}\n</RELEVANT_FILES>`);
    }
    
    if (bySource.action.length > 0) {
      const actionItems = bySource.action
        .map(c => `- ${c.content}`)
        .join('\n');
      sections.push(`<RECENT_RELATED_ACTIONS>\n${actionItems}\n</RECENT_RELATED_ACTIONS>`);
    }
    
    return sections.join('\n\n');
  }
}

export default ContextRetriever;
