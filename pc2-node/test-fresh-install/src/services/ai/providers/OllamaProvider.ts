/**
 * Ollama Provider
 * Provides integration with Ollama's local AI API
 * Uses HTTP requests directly (no OpenAI SDK dependency)
 */

import { logger } from '../../../utils/logger.js';

export interface ChatModel {
  id: string;
  name: string;
  max_tokens: number;
  costs_currency: string;
  costs: {
    tokens: number;
    input_token: number;
    output_token: number;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string; [key: string]: any }>;
}

export interface CompleteArguments {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  tools?: any[];
  max_tokens?: number;
  temperature?: number;
}

export interface ChatCompletion {
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OllamaProvider {
  private apiBaseUrl: string;
  private defaultModel: string;
  private modelsCache: ChatModel[] | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(config?: { baseUrl?: string; defaultModel?: string }) {
    this.apiBaseUrl = config?.baseUrl || 'http://localhost:11434';
    this.defaultModel = config?.defaultModel || 'deepseek-r1:1.5b';
  }

  /**
   * Check if Ollama is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get available models from Ollama
   */
  async models(): Promise<ChatModel[]> {
    // Return cached models if still valid
    const now = Date.now();
    if (this.modelsCache && (now - this.cacheTimestamp) < this.CACHE_DURATION) {
      return this.modelsCache;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        logger.warn('[Ollama] Failed to fetch models:', response.statusText);
        return [];
      }

      const data = await response.json();
      const ollamaModels = data.models || [];

      if (ollamaModels.length === 0) {
        return [];
      }

      const coercedModels: ChatModel[] = ollamaModels.map((model: any) => {
        const modelName = model.name || model.model || 'unknown';
        return {
          id: `ollama:${modelName}`,
          name: `${modelName} (Ollama)`,
          max_tokens: model.size || 8192,
          costs_currency: 'usd-cents',
          costs: {
            tokens: 1_000_000,
            input_token: 0, // Free local AI
            output_token: 0, // Free local AI
          },
        };
      });

      this.modelsCache = coercedModels;
      this.cacheTimestamp = now;
      return coercedModels;
    } catch (error) {
      logger.error('[Ollama] Error fetching models:', error);
      return [];
    }
  }

  /**
   * List available model IDs
   */
  async list(): Promise<string[]> {
    const models = await this.models();
    return models.map(m => m.id);
  }

  /**
   * Get default model
   */
  getDefaultModel(): string {
    return `ollama:${this.defaultModel}`;
  }

  /**
   * Convert messages to Ollama format
   */
  private convertMessages(messages: ChatMessage[]): any[] {
    return messages.map(msg => {
      let content = '';
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        // Extract text from content array
        content = msg.content
          .filter(c => c.type === 'text' && c.text)
          .map(c => c.text)
          .join('\n');
      }

      return {
        role: msg.role === 'system' ? 'user' : msg.role, // Ollama doesn't support system role
        content: content,
      };
    });
  }

  /**
   * Complete chat completion
   */
  async complete(args: CompleteArguments): Promise<ChatCompletion> {
    const model = args.model?.replace('ollama:', '') || this.defaultModel;
    const messages = this.convertMessages(args.messages);
    const temperature = args.temperature ?? 0.7;
    const maxTokens = args.max_tokens;

    const requestBody: any = {
      model: model,
      messages: messages,
      stream: false,
      options: {
        temperature: temperature,
      },
    };

    if (maxTokens) {
      requestBody.options.num_predict = maxTokens;
    }

    // Note: Ollama doesn't support tools/function calling in the same way as OpenAI
    // We'll handle tools separately in the AIChatService

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(120000), // 2 minute timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      // Ollama returns: { message: { role, content }, done: true, ... }
      return {
        message: {
          role: data.message?.role || 'assistant',
          content: data.message?.content || '',
        },
        done: data.done ?? true,
        usage: {
          prompt_tokens: data.prompt_eval_count || 0,
          completion_tokens: data.eval_count || 0,
          total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
      };
    } catch (error) {
      logger.error('[Ollama] Chat completion error:', error);
      throw error;
    }
  }

  /**
   * Stream chat completion (for future use)
   */
  async *streamComplete(args: CompleteArguments): AsyncGenerator<ChatCompletion, void, unknown> {
    const model = args.model?.replace('ollama:', '') || this.defaultModel;
    const messages = this.convertMessages(args.messages);
    const temperature = args.temperature ?? 0.7;

    const requestBody = {
      model: model,
      messages: messages,
      stream: true,
      options: {
        temperature: temperature,
      },
    };

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          try {
            const data = JSON.parse(line);
            if (data.message) {
              yield {
                message: {
                  role: data.message.role || 'assistant',
                  content: data.message.content || '',
                },
                done: data.done ?? false,
              };
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }
    } catch (error) {
      logger.error('[Ollama] Stream completion error:', error);
      throw error;
    }
  }
}

