/**
 * Memory Consolidator - MEM1-style Memory Management
 * 
 * Implements context-aware memory consolidation following the MEM1 pattern
 * from Singapore-MIT research (June 2025). Compresses conversation context
 * at each turn while preserving critical information.
 * 
 * Key principles:
 * - Merge reasoning with memory at each step
 * - Keep only what matters for the next step
 * - Maintain entity registry (files, folders, paths)
 * - Track recent actions for context continuity
 * 
 * SECURITY: All operations are wallet-scoped for user isolation
 */

import { logger } from '../../../utils/logger.js';
import { DatabaseManager } from '../../../storage/database.js';
import { ChatMessage } from '../providers/OllamaProvider.js';

/**
 * Entity extracted from conversation context
 */
export interface ContextEntity {
  type: 'file' | 'folder' | 'path' | 'content';
  name: string;
  path?: string;
  createdAt?: string;
  lastMentioned: number; // Message index where last mentioned
}

/**
 * Action recorded from tool execution
 */
export interface ContextAction {
  toolName: string;
  path?: string;
  result: 'success' | 'failure';
  timestamp: number;
  summary: string;
}

/**
 * Consolidated memory state
 * This is what gets persisted and used for context optimization
 */
export interface ConsolidatedState {
  // Compressed summary of conversation so far
  summary: string;
  
  // Entities mentioned/created in conversation
  entities: ContextEntity[];
  
  // Last N actions (tool executions)
  lastActions: ContextAction[];
  
  // Current user intent/goal
  userIntent: string;
  
  // Message count when last consolidated
  messageCount: number;
  
  // Timestamp of last consolidation
  updatedAt: number;
}

/**
 * Configuration for memory consolidation
 */
export interface MemoryConfig {
  // Max number of recent actions to keep
  maxActions: number;
  
  // Max number of entities to track
  maxEntities: number;
  
  // Consolidate after this many new messages
  consolidateThreshold: number;
  
  // Max summary length (characters)
  maxSummaryLength: number;
}

const DEFAULT_CONFIG: MemoryConfig = {
  maxActions: 5,
  maxEntities: 20,
  consolidateThreshold: 5,
  maxSummaryLength: 1000,
};

/**
 * Memory Consolidator
 * 
 * Manages context memory for AI conversations using MEM1-style consolidation.
 * All state is wallet-scoped for security isolation.
 */
export class MemoryConsolidator {
  private config: MemoryConfig;
  private state: ConsolidatedState | null = null;

  constructor(
    private db: DatabaseManager,
    private walletAddress: string,
    config: Partial<MemoryConfig> = {}
  ) {
    // SECURITY: Require wallet address for isolation
    if (!walletAddress) {
      throw new Error('MemoryConsolidator requires walletAddress for security isolation');
    }
    
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info('[MemoryConsolidator] Initialized for wallet:', walletAddress.substring(0, 10) + '...');
  }

  /**
   * Load consolidated state from database
   */
  async loadState(): Promise<ConsolidatedState | null> {
    try {
      const row = this.db.getMemoryState(this.walletAddress);
      if (row) {
        this.state = {
          summary: row.consolidated_summary || '',
          entities: JSON.parse(row.entities_json || '[]'),
          lastActions: JSON.parse(row.last_actions_json || '[]'),
          userIntent: row.user_intent || '',
          messageCount: row.message_count || 0,
          updatedAt: row.updated_at || Date.now(),
        };
        logger.info('[MemoryConsolidator] Loaded state:', {
          entities: this.state.entities.length,
          actions: this.state.lastActions.length,
          messageCount: this.state.messageCount,
        });
        return this.state;
      }
    } catch (error: any) {
      logger.error('[MemoryConsolidator] Failed to load state:', error.message);
    }
    return null;
  }

  /**
   * Save consolidated state to database
   */
  async saveState(): Promise<void> {
    if (!this.state) {
      return;
    }

    try {
      this.db.saveMemoryState(this.walletAddress, {
        consolidated_summary: this.state.summary,
        entities_json: JSON.stringify(this.state.entities),
        last_actions_json: JSON.stringify(this.state.lastActions),
        user_intent: this.state.userIntent,
        message_count: this.state.messageCount,
        updated_at: Date.now(),
      });
      logger.info('[MemoryConsolidator] Saved state');
    } catch (error: any) {
      logger.error('[MemoryConsolidator] Failed to save state:', error.message);
    }
  }

  /**
   * Extract entities from messages
   */
  private extractEntities(messages: ChatMessage[]): ContextEntity[] {
    const entities: ContextEntity[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const content = typeof msg.content === 'string' ? msg.content : '';
      
      // Extract file/folder paths (~/Desktop/..., ~/Documents/..., etc.)
      const pathPattern = /~\/[\w\-\/\.]+/g;
      const paths = content.match(pathPattern) || [];
      
      for (const path of paths) {
        if (seen.has(path)) continue;
        seen.add(path);
        
        const isFile = path.includes('.') && !path.endsWith('/');
        entities.push({
          type: isFile ? 'file' : 'folder',
          name: path.split('/').pop() || path,
          path,
          lastMentioned: i,
        });
      }
    }

    // Limit to maxEntities, keeping most recently mentioned
    return entities
      .sort((a, b) => b.lastMentioned - a.lastMentioned)
      .slice(0, this.config.maxEntities);
  }

  /**
   * Extract user intent from the last user message
   */
  private extractUserIntent(messages: ChatMessage[]): string {
    // Find the last user message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const content = messages[i].content;
        if (typeof content === 'string') {
          // Truncate long intents
          return content.length > 200 ? content.substring(0, 200) + '...' : content;
        }
      }
    }
    return '';
  }

  /**
   * Generate a summary of the conversation
   * This is a simple extractive summary - could be enhanced with AI summarization
   */
  private generateSummary(messages: ChatMessage[], existingSummary: string): string {
    const keyPoints: string[] = [];
    
    // Keep existing summary if not too long
    if (existingSummary && existingSummary.length < this.config.maxSummaryLength / 2) {
      keyPoints.push(existingSummary);
    }
    
    // Extract key actions from recent messages
    for (const msg of messages.slice(-10)) {
      const content = typeof msg.content === 'string' ? msg.content : '';
      
      // Look for action confirmations
      if (msg.role === 'assistant') {
        const actionPatterns = [
          /Created folder[:\s]+([^\n]+)/i,
          /Created file[:\s]+([^\n]+)/i,
          /Deleted[:\s]+([^\n]+)/i,
          /Moved[:\s]+([^\n]+)/i,
          /Read[:\s]+([^\n]+)/i,
        ];
        
        for (const pattern of actionPatterns) {
          const match = content.match(pattern);
          if (match) {
            keyPoints.push(match[0]);
          }
        }
      }
    }
    
    // Combine and truncate
    let summary = keyPoints.join('. ');
    if (summary.length > this.config.maxSummaryLength) {
      summary = summary.substring(0, this.config.maxSummaryLength) + '...';
    }
    
    return summary;
  }

  /**
   * Record a tool execution result
   */
  recordAction(toolName: string, args: any, result: any): void {
    if (!this.state) {
      this.state = {
        summary: '',
        entities: [],
        lastActions: [],
        userIntent: '',
        messageCount: 0,
        updatedAt: Date.now(),
      };
    }

    const action: ContextAction = {
      toolName,
      path: args?.path || args?.from_path,
      result: result?.success ? 'success' : 'failure',
      timestamp: Date.now(),
      summary: this.summarizeAction(toolName, args, result),
    };

    // Add to front of actions list
    this.state.lastActions.unshift(action);
    
    // Limit to maxActions
    if (this.state.lastActions.length > this.config.maxActions) {
      this.state.lastActions = this.state.lastActions.slice(0, this.config.maxActions);
    }

    // If action created an entity, add it
    if (result?.success && args?.path) {
      const isFile = toolName === 'write_file' || toolName === 'touch_file' || toolName === 'copy_file';
      const isFolder = toolName === 'create_folder';
      
      if (isFile || isFolder) {
        const entity: ContextEntity = {
          type: isFile ? 'file' : 'folder',
          name: args.path.split('/').pop() || args.path,
          path: args.path,
          createdAt: new Date().toISOString(),
          lastMentioned: this.state.messageCount,
        };
        
        // Remove duplicate if exists
        this.state.entities = this.state.entities.filter(e => e.path !== entity.path);
        this.state.entities.unshift(entity);
        
        // Limit entities
        if (this.state.entities.length > this.config.maxEntities) {
          this.state.entities = this.state.entities.slice(0, this.config.maxEntities);
        }
      }
    }
  }

  /**
   * Summarize an action for the action log
   */
  private summarizeAction(toolName: string, args: any, result: any): string {
    const path = args?.path || args?.from_path || '';
    const name = path.split('/').pop() || 'item';
    
    switch (toolName) {
      case 'create_folder':
        return result?.success ? `Created folder: ${name}` : `Failed to create folder: ${name}`;
      case 'write_file':
        return result?.success ? `Created/wrote file: ${name}` : `Failed to write file: ${name}`;
      case 'read_file':
        return result?.success ? `Read file: ${name}` : `Failed to read file: ${name}`;
      case 'delete_file':
        return result?.success ? `Deleted: ${name}` : `Failed to delete: ${name}`;
      case 'move_file':
        const toName = (args?.to_path || '').split('/').pop() || 'destination';
        return result?.success ? `Moved ${name} to ${toName}` : `Failed to move ${name}`;
      case 'list_files':
        return result?.success ? `Listed files in: ${path}` : `Failed to list files`;
      default:
        return result?.success ? `${toolName}: success` : `${toolName}: failed`;
    }
  }

  /**
   * Consolidate messages into optimized context
   * Returns messages that should be sent to the AI
   */
  async consolidate(messages: ChatMessage[]): Promise<{
    consolidatedMessages: ChatMessage[];
    memoryContext: string;
  }> {
    // Load existing state if not loaded
    if (!this.state) {
      await this.loadState();
    }

    // Initialize state if still null
    if (!this.state) {
      this.state = {
        summary: '',
        entities: [],
        lastActions: [],
        userIntent: '',
        messageCount: 0,
        updatedAt: Date.now(),
      };
    }

    // Extract new entities
    const newEntities = this.extractEntities(messages);
    
    // Merge with existing entities (new ones take priority)
    const entityPaths = new Set(newEntities.map(e => e.path));
    const existingEntities = this.state.entities.filter(e => !entityPaths.has(e.path));
    this.state.entities = [...newEntities, ...existingEntities].slice(0, this.config.maxEntities);

    // Extract current user intent
    this.state.userIntent = this.extractUserIntent(messages);

    // Update summary
    this.state.summary = this.generateSummary(messages, this.state.summary);

    // Update message count
    this.state.messageCount = messages.length;
    this.state.updatedAt = Date.now();

    // Build memory context string
    const memoryContext = this.buildMemoryContext();

    // Determine which messages to keep
    // Keep: system message (if any), recent messages
    const consolidatedMessages = this.pruneMessages(messages);

    // Save state periodically
    if (messages.length % this.config.consolidateThreshold === 0) {
      await this.saveState();
    }

    return {
      consolidatedMessages,
      memoryContext,
    };
  }

  /**
   * Build a memory context string to inject into the system prompt
   */
  private buildMemoryContext(): string {
    if (!this.state) {
      return '';
    }

    const parts: string[] = [];

    // Add summary if exists
    if (this.state.summary) {
      parts.push(`<MEMORY_SUMMARY>\n${this.state.summary}\n</MEMORY_SUMMARY>`);
    }

    // Add entity registry
    if (this.state.entities.length > 0) {
      const entityList = this.state.entities
        .slice(0, 10) // Show top 10
        .map(e => `- ${e.type}: ${e.path}`)
        .join('\n');
      parts.push(`<ENTITY_REGISTRY>\nRecently created/mentioned items:\n${entityList}\n</ENTITY_REGISTRY>`);
    }

    // Add recent actions
    if (this.state.lastActions.length > 0) {
      const actionList = this.state.lastActions
        .slice(0, 3) // Show last 3
        .map(a => `- ${a.summary}`)
        .join('\n');
      parts.push(`<RECENT_ACTIONS>\n${actionList}\n</RECENT_ACTIONS>`);
    }

    return parts.join('\n\n');
  }

  /**
   * Prune messages to fit within reasonable context limits
   */
  private pruneMessages(messages: ChatMessage[]): ChatMessage[] {
    // Always keep system message if present
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Keep last N message pairs (user + assistant)
    const maxPairs = 5;
    const keepCount = maxPairs * 2;
    
    const recentMessages = nonSystemMessages.slice(-keepCount);

    return [...systemMessages, ...recentMessages];
  }

  /**
   * Get the current state (for debugging/inspection)
   */
  getState(): ConsolidatedState | null {
    return this.state;
  }

  /**
   * Clear the memory state (e.g., when starting a new conversation)
   */
  async clearState(): Promise<void> {
    this.state = null;
    try {
      this.db.clearMemoryState(this.walletAddress);
      logger.info('[MemoryConsolidator] Cleared state');
    } catch (error: any) {
      logger.error('[MemoryConsolidator] Failed to clear state:', error.message);
    }
  }
}
