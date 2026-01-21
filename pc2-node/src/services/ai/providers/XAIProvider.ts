/**
 * xAI Provider (Grok)
 * Provides integration with xAI's Grok API
 * Uses the OpenAI SDK with custom baseURL since xAI API is OpenAI-compatible
 */

import OpenAI from 'openai';
import { logger } from '../../../utils/logger.js';
import { ChatModel, ChatMessage, CompleteArguments, ChatCompletion } from './OllamaProvider.js';

export class XAIProvider {
  private client: OpenAI;
  private defaultModel: string = 'grok-3';

  constructor(config?: { apiKey?: string; defaultModel?: string }) {
    if (!config?.apiKey) {
      throw new Error('xAI API key is required');
    }
    // xAI uses OpenAI-compatible API, so we use OpenAI SDK with custom baseURL
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: 'https://api.x.ai/v1',
    });
    this.defaultModel = config.defaultModel || this.defaultModel;
    logger.info(`[XAIProvider] Initialized with OpenAI SDK (xAI baseURL), model: ${this.defaultModel}`);
  }

  /**
   * Check if xAI API is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Try to list models as availability check
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
    // Return curated list of xAI Grok models
    return [
      {
        id: 'grok-3',
        name: 'Grok 3',
        max_tokens: 131072,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.003,
          output_token: 0.015,
        },
      },
      {
        id: 'grok-3-fast',
        name: 'Grok 3 Fast',
        max_tokens: 131072,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.005,
          output_token: 0.025,
        },
      },
      {
        id: 'grok-2',
        name: 'Grok 2',
        max_tokens: 32768,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.002,
          output_token: 0.01,
        },
      },
      {
        id: 'grok-vision-beta',
        name: 'Grok Vision (Beta)',
        max_tokens: 8192,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.005,
          output_token: 0.015,
        },
      },
    ];
  }

  /**
   * Get default model
   */
  getDefaultModel(): string {
    return `xai:${this.defaultModel}`;
  }

  /**
   * Convert messages to OpenAI SDK format (same as OpenAI since xAI is compatible)
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
            // Handle images - xAI expects base64 data URLs like OpenAI
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
   * Complete chat completion using OpenAI SDK with xAI endpoint
   */
  async complete(args: CompleteArguments): Promise<ChatCompletion> {
    const model = args.model?.replace('xai:', '') || this.defaultModel;
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
      logger.error('[XAIProvider] Completion error:', error.message);
      throw error;
    }
  }

  /**
   * Stream chat completion using OpenAI SDK with xAI endpoint
   */
  async *streamComplete(args: CompleteArguments): AsyncGenerator<ChatCompletion, void, unknown> {
    const model = args.model?.replace('xai:', '') || this.defaultModel;
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
      logger.error('[XAIProvider] Stream error:', error.message);
      throw error;
    }
  }
}
