/**
 * Gemini Provider (Google)
 * Provides integration with Google's Gemini API using the official SDK
 * Migrated from raw HTTP to @google/genai package for better reliability and native function calling
 */

import { GoogleGenAI, type Content, type Part, type Tool } from '@google/genai';
import { logger } from '../../../utils/logger.js';
import { ChatModel, ChatMessage, CompleteArguments, ChatCompletion } from './OllamaProvider.js';

export class GeminiProvider {
  private client: GoogleGenAI;
  private defaultModel: string = 'gemini-1.5-flash';

  constructor(config?: { apiKey?: string; defaultModel?: string }) {
    if (!config?.apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.defaultModel = config.defaultModel || this.defaultModel;
    logger.info(`[GeminiProvider] Initialized with official SDK, model: ${this.defaultModel}`);
  }

  /**
   * Check if Gemini API is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Try a simple generation as availability check
      const response = await this.client.models.generateContent({
        model: this.defaultModel,
        contents: 'test',
        config: { maxOutputTokens: 1 },
      });
      return !!response;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get available models
   */
  async models(): Promise<ChatModel[]> {
    // Return curated list of Gemini models with pricing info
    return [
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        max_tokens: 8192,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.0001,
          output_token: 0.0004,
        },
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        max_tokens: 8192,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.00125,
          output_token: 0.005,
        },
      },
      {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        max_tokens: 8192,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.000075,
          output_token: 0.0003,
        },
      },
      {
        id: 'gemini-pro',
        name: 'Gemini Pro',
        max_tokens: 4096,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.0005,
          output_token: 0.0015,
        },
      },
    ];
  }

  /**
   * Get default model
   */
  getDefaultModel(): string {
    return `gemini:${this.defaultModel}`;
  }

  /**
   * Convert messages to Gemini SDK format
   */
  private convertMessages(messages: ChatMessage[]): Content[] {
    const contents: Content[] = [];
    
    for (const msg of messages) {
      const parts: Part[] = [];
      
      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const c of msg.content) {
          if (c.type === 'text' && c.text) {
            parts.push({ text: c.text });
          } else if (c.type === 'image' || c.source) {
            // Handle images - Gemini expects inline_data format
            const imageData = c.source?.data || c.data || '';
            if (imageData.startsWith('data:')) {
              const [header, base64] = imageData.split(',');
              const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png';
              parts.push({
                inlineData: {
                  mimeType,
                  data: base64,
                },
              });
            }
          }
        }
      }
      
      if (parts.length > 0) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts,
        });
      }
    }
    
    return contents;
  }

  /**
   * Convert tools to Gemini SDK format (function declarations in config.tools)
   */
  private convertTools(tools?: any[]): Tool[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    
    const functionDeclarations = tools.map(tool => ({
      name: tool.function?.name || tool.name,
      description: tool.function?.description || tool.description,
      parameters: tool.function?.parameters || tool.parameters || {},
    }));
    
    return [{ functionDeclarations }];
  }

  /**
   * Complete chat completion using official SDK
   */
  async complete(args: CompleteArguments): Promise<ChatCompletion> {
    const modelName = args.model?.replace('gemini:', '') || this.defaultModel;
    const contents = this.convertMessages(args.messages);
    const tools = this.convertTools(args.tools);

    try {
      const response = await this.client.models.generateContent({
        model: modelName,
        contents,
        config: {
          temperature: args.temperature ?? 0.7,
          maxOutputTokens: args.max_tokens || 4096,
          tools, // tools go inside config
        },
      });

      const text = response.text || '';
      
      // Check for function calls in response
      let toolCalls: any[] | undefined;
      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        toolCalls = functionCalls.map((fc, index) => ({
          id: `gemini-tool-${index}`,
          type: 'function' as const,
          function: {
            name: fc.name,
            arguments: JSON.stringify(fc.args || {}),
          },
        }));
      }
      
      return {
        message: {
          role: 'assistant',
          content: text,
          tool_calls: toolCalls,
        },
        done: true,
        usage: response.usageMetadata ? {
          prompt_tokens: response.usageMetadata.promptTokenCount || 0,
          completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
          total_tokens: response.usageMetadata.totalTokenCount || 0,
        } : undefined,
      };
    } catch (error: any) {
      logger.error('[GeminiProvider] Completion error:', error.message);
      throw error;
    }
  }

  /**
   * Stream chat completion using official SDK
   */
  async *streamComplete(args: CompleteArguments): AsyncGenerator<ChatCompletion, void, unknown> {
    const modelName = args.model?.replace('gemini:', '') || this.defaultModel;
    const contents = this.convertMessages(args.messages);
    const tools = this.convertTools(args.tools);

    try {
      const response = await this.client.models.generateContentStream({
        model: modelName,
        contents,
        config: {
          temperature: args.temperature ?? 0.7,
          maxOutputTokens: args.max_tokens || 4096,
          tools, // tools go inside config
        },
      });

      let toolCalls: any[] = [];

      for await (const chunk of response) {
        // Handle text content
        const text = chunk.text;
        if (text) {
          yield {
            message: {
              role: 'assistant',
              content: text,
            },
            done: false,
          };
        }

        // Handle function calls
        const functionCalls = chunk.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
          for (const fc of functionCalls) {
            toolCalls.push({
              id: `gemini-tool-${toolCalls.length}`,
              type: 'function' as const,
              function: {
                name: fc.name,
                arguments: JSON.stringify(fc.args || {}),
              },
            });
          }
        }
      }

      // Final chunk with tool calls if any
      yield {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        },
        done: true,
      };
    } catch (error: any) {
      logger.error('[GeminiProvider] Stream error:', error.message);
      throw error;
    }
  }
}
