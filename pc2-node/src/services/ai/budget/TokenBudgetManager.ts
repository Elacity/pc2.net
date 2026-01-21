/**
 * Token Budget Manager
 * 
 * Tracks and optimizes context window usage across AI interactions.
 * Ensures prompts don't exceed model limits and optimizes token allocation.
 * 
 * Key principles:
 * - Track token usage in real-time
 * - Allocate budget across context components (system, memory, tools, conversation)
 * - Prune/compress when approaching limits
 * - Provide usage metrics for optimization
 */

import { logger } from '../../../utils/logger.js';

/**
 * Token budget allocation across context components
 */
export interface TokenBudget {
  // Total available tokens for context window
  total: number;
  
  // Reserved for system prompt
  system: number;
  
  // Reserved for tool definitions
  tools: number;
  
  // Allocated for memory context
  memory: number;
  
  // Allocated for RAG/retrieved context (future)
  retrieval: number;
  
  // Remaining for current conversation
  conversation: number;
  
  // Overhead for response generation
  responseBuffer: number;
}

/**
 * Token usage tracking
 */
export interface TokenUsage {
  system: number;
  tools: number;
  memory: number;
  retrieval: number;
  conversation: number;
  total: number;
  remaining: number;
  utilizationPercent: number;
}

/**
 * Model context window limits
 */
export interface ModelLimits {
  contextWindow: number;
  maxOutputTokens: number;
  name: string;
}

/**
 * Known model limits (conservative estimates)
 */
const MODEL_LIMITS: Record<string, ModelLimits> = {
  // Claude models
  'claude-sonnet-4-5-20250929': { contextWindow: 200000, maxOutputTokens: 8192, name: 'Claude Sonnet 4.5' },
  'claude-opus-4-20250514': { contextWindow: 200000, maxOutputTokens: 8192, name: 'Claude Opus 4' },
  'claude-3-5-sonnet-20241022': { contextWindow: 200000, maxOutputTokens: 8192, name: 'Claude 3.5 Sonnet' },
  'claude-3-5-haiku-20241022': { contextWindow: 200000, maxOutputTokens: 8192, name: 'Claude 3.5 Haiku' },
  
  // OpenAI models
  'gpt-4o': { contextWindow: 128000, maxOutputTokens: 16384, name: 'GPT-4o' },
  'gpt-4o-mini': { contextWindow: 128000, maxOutputTokens: 16384, name: 'GPT-4o Mini' },
  'gpt-4-turbo': { contextWindow: 128000, maxOutputTokens: 4096, name: 'GPT-4 Turbo' },
  'gpt-4': { contextWindow: 8192, maxOutputTokens: 4096, name: 'GPT-4' },
  'gpt-3.5-turbo': { contextWindow: 16385, maxOutputTokens: 4096, name: 'GPT-3.5 Turbo' },
  
  // Gemini models
  'gemini-2.0-flash': { contextWindow: 1000000, maxOutputTokens: 8192, name: 'Gemini 2.0 Flash' },
  'gemini-1.5-pro': { contextWindow: 2000000, maxOutputTokens: 8192, name: 'Gemini 1.5 Pro' },
  'gemini-1.5-flash': { contextWindow: 1000000, maxOutputTokens: 8192, name: 'Gemini 1.5 Flash' },
  'gemini-pro': { contextWindow: 32000, maxOutputTokens: 8192, name: 'Gemini Pro' },
  
  // xAI models
  'grok-3': { contextWindow: 131072, maxOutputTokens: 8192, name: 'Grok 3' },
  'grok-3-fast': { contextWindow: 131072, maxOutputTokens: 8192, name: 'Grok 3 Fast' },
  'grok-2': { contextWindow: 131072, maxOutputTokens: 8192, name: 'Grok 2' },
  'grok-vision-beta': { contextWindow: 8192, maxOutputTokens: 4096, name: 'Grok Vision' },
  
  // Ollama/DeepSeek local models (conservative estimates)
  'deepseek-r1:1.5b': { contextWindow: 32000, maxOutputTokens: 4096, name: 'DeepSeek R1 1.5B' },
  'deepseek-r1:7b': { contextWindow: 32000, maxOutputTokens: 4096, name: 'DeepSeek R1 7B' },
  'deepseek-r1:14b': { contextWindow: 32000, maxOutputTokens: 4096, name: 'DeepSeek R1 14B' },
  'llama3.2': { contextWindow: 128000, maxOutputTokens: 4096, name: 'Llama 3.2' },
  'llama3.1': { contextWindow: 128000, maxOutputTokens: 4096, name: 'Llama 3.1' },
  'llava': { contextWindow: 4096, maxOutputTokens: 2048, name: 'LLaVA' },
};

// Default limits for unknown models
const DEFAULT_LIMITS: ModelLimits = {
  contextWindow: 8192,
  maxOutputTokens: 2048,
  name: 'Unknown Model',
};

/**
 * Token Budget Manager
 * 
 * Manages token allocation and usage tracking for AI context.
 */
export class TokenBudgetManager {
  private modelLimits: ModelLimits;
  private budget: TokenBudget;
  private currentUsage: TokenUsage;

  constructor(model: string) {
    // Extract model name (remove provider prefix if present)
    const modelName = model.includes(':') ? model.split(':').slice(1).join(':') : model;
    
    // Get model limits
    this.modelLimits = MODEL_LIMITS[modelName] || DEFAULT_LIMITS;
    
    logger.info('[TokenBudgetManager] Initialized for model:', {
      model: modelName,
      contextWindow: this.modelLimits.contextWindow,
      maxOutput: this.modelLimits.maxOutputTokens,
    });
    
    // Initialize budget allocation
    this.budget = this.calculateBudget();
    
    // Initialize usage tracking
    this.currentUsage = {
      system: 0,
      tools: 0,
      memory: 0,
      retrieval: 0,
      conversation: 0,
      total: 0,
      remaining: this.budget.total,
      utilizationPercent: 0,
    };
  }

  /**
   * Calculate budget allocation based on model limits
   * Uses percentages of context window for each component
   */
  private calculateBudget(): TokenBudget {
    const total = this.modelLimits.contextWindow;
    const responseBuffer = this.modelLimits.maxOutputTokens;
    
    // Available for input after reserving response buffer
    const inputBudget = total - responseBuffer;
    
    // Allocation percentages (adjust based on use case)
    const systemPercent = 0.15;      // 15% for system prompt
    const toolsPercent = 0.10;       // 10% for tool definitions
    const memoryPercent = 0.10;      // 10% for memory context
    const retrievalPercent = 0.05;   // 5% for RAG (future)
    const conversationPercent = 0.60; // 60% for conversation
    
    return {
      total,
      system: Math.floor(inputBudget * systemPercent),
      tools: Math.floor(inputBudget * toolsPercent),
      memory: Math.floor(inputBudget * memoryPercent),
      retrieval: Math.floor(inputBudget * retrievalPercent),
      conversation: Math.floor(inputBudget * conversationPercent),
      responseBuffer,
    };
  }

  /**
   * Estimate token count for a string
   * Uses simple heuristic: ~4 characters per token on average
   * For production, consider using tiktoken or provider-specific tokenizers
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    // Simple heuristic: ~4 chars per token for English text
    // This is a rough estimate - actual tokenization varies by model
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate tokens for an array of messages
   */
  estimateMessagesTokens(messages: Array<{ role: string; content: string | any[] }>): number {
    let total = 0;
    
    for (const msg of messages) {
      // Add overhead for message structure (~4 tokens per message)
      total += 4;
      
      // Add role tokens
      total += this.estimateTokens(msg.role);
      
      // Add content tokens
      if (typeof msg.content === 'string') {
        total += this.estimateTokens(msg.content);
      } else if (Array.isArray(msg.content)) {
        // Multimodal content
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            total += this.estimateTokens(part.text);
          } else if (part.type === 'image') {
            // Images typically count as ~85 tokens for low-res, 765 for high-res
            total += 765;
          }
        }
      }
    }
    
    return total;
  }

  /**
   * Estimate tokens for tool definitions
   */
  estimateToolsTokens(tools: any[]): number {
    if (!tools || tools.length === 0) return 0;
    
    let total = 0;
    for (const tool of tools) {
      // Estimate based on JSON serialization
      const toolJson = JSON.stringify(tool);
      total += this.estimateTokens(toolJson);
    }
    
    return total;
  }

  /**
   * Update usage tracking
   */
  updateUsage(component: keyof Omit<TokenUsage, 'total' | 'remaining' | 'utilizationPercent'>, tokens: number): void {
    this.currentUsage[component] = tokens;
    
    // Recalculate totals
    this.currentUsage.total = 
      this.currentUsage.system +
      this.currentUsage.tools +
      this.currentUsage.memory +
      this.currentUsage.retrieval +
      this.currentUsage.conversation;
    
    this.currentUsage.remaining = Math.max(0, this.budget.total - this.currentUsage.total - this.budget.responseBuffer);
    this.currentUsage.utilizationPercent = (this.currentUsage.total / (this.budget.total - this.budget.responseBuffer)) * 100;
  }

  /**
   * Get current usage statistics
   */
  getUsage(): TokenUsage {
    return { ...this.currentUsage };
  }

  /**
   * Get budget allocation
   */
  getBudget(): TokenBudget {
    return { ...this.budget };
  }

  /**
   * Check if adding content would exceed budget
   */
  wouldExceedBudget(additionalTokens: number): boolean {
    return (this.currentUsage.total + additionalTokens) > (this.budget.total - this.budget.responseBuffer);
  }

  /**
   * Get available tokens for a specific component
   */
  getAvailableForComponent(component: keyof Pick<TokenBudget, 'system' | 'tools' | 'memory' | 'retrieval' | 'conversation'>): number {
    const budgeted = this.budget[component];
    const used = this.currentUsage[component];
    return Math.max(0, budgeted - used);
  }

  /**
   * Prune messages to fit within conversation budget
   * Keeps system messages and most recent messages
   */
  pruneMessagesToFit(
    messages: Array<{ role: string; content: string | any[] }>,
    targetTokens?: number
  ): Array<{ role: string; content: string | any[] }> {
    const target = targetTokens || this.budget.conversation;
    let currentTokens = this.estimateMessagesTokens(messages);
    
    if (currentTokens <= target) {
      return messages;
    }
    
    logger.info('[TokenBudgetManager] Pruning messages:', {
      current: currentTokens,
      target,
      messageCount: messages.length,
    });
    
    // Separate system messages from conversation
    const systemMessages = messages.filter(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');
    
    const systemTokens = this.estimateMessagesTokens(systemMessages);
    const availableForConversation = target - systemTokens;
    
    // Keep removing oldest non-system messages until we fit
    const prunedConversation = [...conversationMessages];
    
    while (this.estimateMessagesTokens(prunedConversation) > availableForConversation && prunedConversation.length > 2) {
      // Remove oldest message (keep at least last 2 for context)
      prunedConversation.shift();
    }
    
    const result = [...systemMessages, ...prunedConversation];
    
    logger.info('[TokenBudgetManager] Pruning complete:', {
      originalCount: messages.length,
      prunedCount: result.length,
      removedCount: messages.length - result.length,
      finalTokens: this.estimateMessagesTokens(result),
    });
    
    return result;
  }

  /**
   * Truncate text to fit within token limit
   */
  truncateToFit(text: string, maxTokens: number): string {
    const currentTokens = this.estimateTokens(text);
    
    if (currentTokens <= maxTokens) {
      return text;
    }
    
    // Estimate character limit (4 chars per token)
    const targetChars = maxTokens * 4 - 20; // Leave room for "..." 
    
    if (targetChars <= 0) {
      return '';
    }
    
    return text.substring(0, targetChars) + '...';
  }

  /**
   * Get a summary of current state for logging
   */
  getSummary(): string {
    const usage = this.getUsage();
    return `Tokens: ${usage.total}/${this.budget.total - this.budget.responseBuffer} (${usage.utilizationPercent.toFixed(1)}%) | ` +
           `System: ${usage.system} | Tools: ${usage.tools} | Memory: ${usage.memory} | Conv: ${usage.conversation}`;
  }

  /**
   * Check if context is approaching limit (>80% utilization)
   */
  isApproachingLimit(): boolean {
    return this.currentUsage.utilizationPercent > 80;
  }

  /**
   * Check if context is critical (>95% utilization)
   */
  isCritical(): boolean {
    return this.currentUsage.utilizationPercent > 95;
  }

  /**
   * Get model information
   */
  getModelInfo(): ModelLimits {
    return { ...this.modelLimits };
  }
}
