/**
 * OpenAI Provider
 * Provides integration with OpenAI's API using the official SDK
 * Migrated from raw HTTP to official openai package for better reliability
 */

import OpenAI from 'openai';
import { logger } from '../../../utils/logger.js';
import type { ChatModel, ChatMessage, CompleteArguments, ChatCompletion } from './types.js';

export class OpenAIProvider {
  private client: OpenAI;
  private defaultModel: string = 'gpt-4o';

  constructor(config?: { apiKey?: string; defaultModel?: string; baseURL?: string }) {
    if (!config?.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL, // Allows override for xAI compatibility
    });
    this.defaultModel = config.defaultModel || this.defaultModel;
    logger.info(`[OpenAIProvider] Initialized with official SDK, model: ${this.defaultModel}`);
  }

  /**
   * Check if OpenAI API is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Use SDK to list models as availability check
      await this.client.models.list();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get available models
   */
  async models(): Promise<ChatModel[]> {
    // Return curated list of OpenAI models with pricing info
    return [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        max_tokens: 16384,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.0025,
          output_token: 0.01,
        },
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        max_tokens: 16384,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.00015,
          output_token: 0.0006,
        },
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        max_tokens: 128000,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.01,
          output_token: 0.03,
        },
      },
      {
        id: 'gpt-4',
        name: 'GPT-4',
        max_tokens: 8192,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.03,
          output_token: 0.06,
        },
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        max_tokens: 16385,
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
    return `openai:${this.defaultModel}`;
  }

  /**
   * Convert messages to OpenAI SDK format
   */
  private convertMessages(messages: ChatMessage[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map(msg => {
      if (typeof msg.content === 'string') {
        if (msg.role === 'system') {
          return { role: 'system' as const, content: msg.content };
        } else if (msg.role === 'assistant') {
          return { role: 'assistant' as const, content: msg.content };
        }
        return { role: 'user' as const, content: msg.content };
      } else if (Array.isArray(msg.content)) {
        // Handle multimodal content - only user messages support array content
        const content: OpenAI.ChatCompletionContentPart[] = [];
        for (const c of msg.content) {
          if (c.type === 'text' && c.text) {
            content.push({ type: 'text', text: c.text });
          } else if (c.type === 'image' || c.source) {
            // Handle images - OpenAI expects base64 data URLs
            const imageData = c.source?.data || c.data || '';
            if (imageData.startsWith('data:')) {
              content.push({
                type: 'image_url',
                image_url: { url: imageData },
              });
            }
          }
        }
        // Multimodal content only works with user role
        return {
          role: 'user' as const,
          content: content.length > 0 ? content : [{ type: 'text' as const, text: '' }],
        };
      }
      // Default to user for any other case
      return { role: 'user' as const, content: String(msg.content || '') };
    });
  }

  /**
   * Convert tools to OpenAI SDK format
   */
  private convertTools(tools?: any[]): OpenAI.ChatCompletionTool[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.function?.name || tool.name,
        description: tool.function?.description || tool.description,
        parameters: tool.function?.parameters || tool.parameters || {},
      },
    }));
  }

  /**
   * Complete chat completion using official SDK
   */
  async complete(args: CompleteArguments): Promise<ChatCompletion> {
    const model = args.model?.replace('openai:', '') || this.defaultModel;
    const messages = this.convertMessages(args.messages);
    const temperature = args.temperature ?? 0.7;
    const maxTokens = args.max_tokens;
    const tools = this.convertTools(args.tools);

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        tools,
      });

      const choice = response.choices[0];
      
      // Extract tool calls if present
      let toolCalls: any[] | undefined;
      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        toolCalls = choice.message.tool_calls.map((tc: any) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function?.name || '',
            arguments: tc.function?.arguments || '{}',
          },
        }));
      }
      
      return {
        message: {
          role: choice.message.role,
          content: choice.message.content || '',
          tool_calls: toolCalls,
        },
        done: true,
        usage: response.usage ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        } : undefined,
      };
    } catch (error: any) {
      logger.error('[OpenAIProvider] Completion error:', error.message);
      throw error;
    }
  }

  /**
   * Stream chat completion using official SDK
   */
  async *streamComplete(args: CompleteArguments): AsyncGenerator<ChatCompletion, void, unknown> {
    const model = args.model?.replace('openai:', '') || this.defaultModel;
    const messages = this.convertMessages(args.messages);
    const temperature = args.temperature ?? 0.7;
    const maxTokens = args.max_tokens;
    const tools = this.convertTools(args.tools);

    try {
      const stream = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        tools,
        stream: true,
      });

      let toolCalls: any[] = [];

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        
        // Handle content streaming
        if (delta?.content) {
          yield {
            message: {
              role: 'assistant',
              content: delta.content,
            },
            done: false,
          };
        }

        // Handle tool calls streaming
        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index;
            if (!toolCalls[index]) {
              toolCalls[index] = {
                id: toolCall.id || '',
                type: 'function',
                function: {
                  name: toolCall.function?.name || '',
                  arguments: toolCall.function?.arguments || '',
                },
              };
            } else {
              // Accumulate arguments
              if (toolCall.function?.arguments) {
                toolCalls[index].function.arguments += toolCall.function.arguments;
              }
              if (toolCall.function?.name) {
                toolCalls[index].function.name = toolCall.function.name;
              }
              if (toolCall.id) {
                toolCalls[index].id = toolCall.id;
              }
            }
          }
        }

        // Check if stream is done
        if (chunk.choices[0]?.finish_reason) {
          yield {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
            },
            done: true,
          };
        }
      }
    } catch (error: any) {
      logger.error('[OpenAIProvider] Stream error:', error.message);
      throw error;
    }
  }
}
