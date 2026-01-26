/**
 * Claude Provider (Anthropic)
 * Provides integration with Anthropic's Claude API
 * Uses official @anthropic-ai/sdk like Puter does
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../../utils/logger.js';
import { ChatModel, ChatMessage, CompleteArguments, ChatCompletion } from './OllamaProvider.js';

export class ClaudeProvider {
  private anthropic: Anthropic;
  private defaultModel: string = 'claude-sonnet-4-5-20250929'; // Current Claude Sonnet 4.5 model

  constructor(config?: { apiKey?: string; defaultModel?: string }) {
    if (!config?.apiKey) {
      throw new Error('Claude API key is required');
    }
    this.anthropic = new Anthropic({
      apiKey: config.apiKey,
    });
    this.defaultModel = config.defaultModel || this.defaultModel;
    logger.info(`[ClaudeProvider] Initialized with default model: ${this.defaultModel}`);
  }

  /**
   * Check if Claude API is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.anthropic.messages.create({
        model: this.defaultModel,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }],
      });
      return true;
    } catch (error: any) {
      // 400 means API key is valid but request is invalid (which is fine for availability check)
      return error.status === 400 || error.status === 401;
    }
  }

  /**
   * Get available models
   */
  async models(): Promise<ChatModel[]> {
    // Claude models - updated to current Anthropic model names (Jan 2025)
    return [
      {
        id: 'claude-sonnet-4-5-20250929',
        name: 'Claude Sonnet 4.5',
        max_tokens: 64000,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.003,
          output_token: 0.015,
        },
      },
      {
        id: 'claude-opus-4-20250514',
        name: 'Claude Opus 4',
        max_tokens: 32000,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.015,
          output_token: 0.075,
        },
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        max_tokens: 8192,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.003,
          output_token: 0.015,
        },
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        max_tokens: 8192,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.0008,
          output_token: 0.004,
        },
      },
    ];
  }

  /**
   * Get default model
   */
  getDefaultModel(): string {
    return `claude:${this.defaultModel}`;
  }

  /**
   * Convert messages to Claude format
   */
  private convertMessages(messages: ChatMessage[]): any[] {
    return messages.map(msg => {
      if (typeof msg.content === 'string') {
        return {
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        };
      } else if (Array.isArray(msg.content)) {
        // Handle multimodal content
        const content: any[] = [];
        for (const c of msg.content) {
          if (c.type === 'text' && c.text) {
            content.push({ type: 'text', text: c.text });
          } else if (c.type === 'image' || c.source) {
            // Handle images - Claude expects base64 data
            const imageData = c.source?.data || c.data || '';
            if (imageData.startsWith('data:')) {
              const [header, base64] = imageData.split(',');
              const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png';
              content.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: base64,
                },
              });
            }
          }
        }
        return {
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: content.length > 0 ? content : [{ type: 'text', text: '' }],
        };
      }
      return {
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: String(msg.content || ''),
      };
    });
  }

  /**
   * Complete chat completion
   */
  async complete(args: CompleteArguments): Promise<ChatCompletion> {
    const model = args.model?.replace('claude:', '') || this.defaultModel;
    const messages = this.convertMessages(args.messages);
    const temperature = args.temperature ?? 0.7;
    const maxTokens = args.max_tokens || 4096;

    const requestBody: any = {
      model: model,
      messages: messages,
      max_tokens: maxTokens,
      temperature: temperature,
    };

    // Add tools if provided (Claude uses tools parameter)
    if (args.tools && args.tools.length > 0) {
      requestBody.tools = args.tools.map((tool: any) => ({
        name: tool.function?.name || tool.name,
        description: tool.function?.description || tool.description,
        input_schema: tool.function?.parameters || tool.parameters || {},
      }));
    }

    try {
      logger.info('[ClaudeProvider] Starting completion with official SDK:', {
        model,
        messageCount: messages.length,
        hasTools: !!(args.tools && args.tools.length > 0),
      });
      
      const sdkParams: any = {
        model: model,
        messages: messages,
        max_tokens: maxTokens,
        temperature: temperature,
      };

      // Add tools if provided
      if (args.tools && args.tools.length > 0) {
        sdkParams.tools = args.tools.map((tool: any) => ({
          name: tool.function?.name || tool.name,
          description: tool.function?.description || tool.description,
          input_schema: tool.function?.parameters || tool.parameters || {},
        }));
      }
      
      const data = await this.anthropic.messages.create(sdkParams);
      
      // Extract tool calls if present
      let toolCalls: any[] = [];
      if (data.content) {
        for (const content of data.content) {
          if (content.type === 'tool_use') {
            toolCalls.push({
              id: content.id,
              type: 'function',
              function: {
                name: content.name,
                arguments: JSON.stringify(content.input),
              },
            });
          }
        }
      }

      return {
        message: {
          role: 'assistant',
          content: data.content
            ?.filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n') || '',
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        },
        done: true,
        usage: data.usage ? {
          prompt_tokens: data.usage.input_tokens || 0,
          completion_tokens: data.usage.output_tokens || 0,
          total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
        } : undefined,
      };
    } catch (error: any) {
      logger.error('[ClaudeProvider] Completion error:', error);
      throw error;
    }
  }

  /**
   * Stream chat completion
   * Uses official @anthropic-ai/sdk like Puter does
   */
  async *streamComplete(args: CompleteArguments): AsyncGenerator<ChatCompletion, void, unknown> {
    const model = args.model?.replace('claude:', '') || this.defaultModel;
    const messages = this.convertMessages(args.messages);
    const temperature = args.temperature ?? 0.7;
    const maxTokens = args.max_tokens || 4096;

    const sdkParams: any = {
      model: model,
      messages: messages,
      max_tokens: maxTokens,
      temperature: temperature,
    };

    // Add tools if provided
    if (args.tools && args.tools.length > 0) {
      sdkParams.tools = args.tools.map((tool: any) => ({
        name: tool.function?.name || tool.name,
        description: tool.function?.description || tool.description,
        input_schema: tool.function?.parameters || tool.parameters || {},
      }));
      // Set tool_choice to 'auto' to encourage (but not force) tool usage
      // This tells Claude to use tools when appropriate rather than just generating text
      (sdkParams as any).tool_choice = { type: 'auto' };
    }

    try {
      logger.info('[ClaudeProvider] Starting stream with official SDK:', {
        model,
        messageCount: messages.length,
        hasTools: !!(args.tools && args.tools.length > 0),
        toolChoice: (sdkParams as any).tool_choice?.type || 'none',
      });
      
      // Use official SDK streaming API like Puter does
      const stream = await this.anthropic.messages.stream(sdkParams);
      
      let accumulatedContent = '';
      let toolCalls: any[] = [];
      let currentToolCallBuffer: string = ''; // Buffer for current tool call JSON
      let currentToolCallInfo: { name: string; id: string } | null = null; // Current tool call being built

      // Iterate through events exactly like Puter does
      for await (const event of stream) {
        // Handle message_start
        if (event.type === 'message_start') {
          logger.debug('[ClaudeProvider] Message started');
          continue;
        }

        // Handle message_stop
        if (event.type === 'message_stop') {
          logger.info('[ClaudeProvider] Message stopped - tool calls count:', toolCalls.length);
          // Yield final chunk with all tool calls
          if (toolCalls.length > 0) {
            yield {
              message: {
                role: 'assistant',
                content: accumulatedContent,
                tool_calls: toolCalls,
              },
              done: true,
            };
          } else {
            yield {
              message: {
                role: 'assistant',
                content: accumulatedContent,
              },
              done: true,
            };
          }
          continue;
        }

        // Handle content_block_start - exactly like Puter
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            const toolUse = event.content_block;
            currentToolCallInfo = { name: toolUse.name, id: toolUse.id };
            currentToolCallBuffer = ''; // Initialize empty buffer
            logger.info('[ClaudeProvider] Tool use started:', toolUse.name, 'id:', toolUse.id);
          }
          continue;
        }

        // Handle content_block_stop - exactly like Puter
        if (event.type === 'content_block_stop') {
          logger.info('[ClaudeProvider] content_block_stop received - currentToolCallInfo:', currentToolCallInfo ? `${currentToolCallInfo.name} (${currentToolCallInfo.id})` : 'null', 'buffer length:', currentToolCallBuffer?.length || 0, 'buffer preview:', currentToolCallBuffer?.substring(0, 100));
          // If we have a tool call being built, finalize it (even if buffer is empty - it will be {})
          if (currentToolCallInfo) {
            let toolInput: any = {};
            try {
              const buffer = (currentToolCallBuffer || '').trim() || '{}';
              logger.info('[ClaudeProvider] Parsing tool input buffer:', buffer.substring(0, 200));
              toolInput = JSON.parse(buffer);
            } catch (e: any) {
              logger.warn('[ClaudeProvider] Failed to parse tool input JSON:', currentToolCallBuffer, e?.message || e);
              toolInput = {};
            }
            
            const toolCall = {
              id: currentToolCallInfo.id,
              type: 'function' as const,
              function: {
                name: currentToolCallInfo.name,
                arguments: JSON.stringify(toolInput),
              },
            };
            
            toolCalls.push(toolCall);
            logger.info('[ClaudeProvider] ✅ Tool call finalized:', currentToolCallInfo.name, 'args:', JSON.stringify(toolInput));
            
            // Yield the tool call immediately
            yield {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [toolCall],
              },
              done: false,
            };
            
            // Reset for next tool call
            currentToolCallInfo = null;
            currentToolCallBuffer = '';
          } else {
            logger.debug('[ClaudeProvider] content_block_stop but no currentToolCallInfo');
          }
          continue;
        }

        // Handle content_block_delta - exactly like Puter
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            const text = event.delta.text || '';
            if (text) {
              accumulatedContent += text;
              yield {
                message: {
                  role: 'assistant',
                  content: text,
                },
                done: false,
              };
            }
          } else if (event.delta.type === 'input_json_delta') {
            // Update tool_use arguments incrementally - exactly like Puter's addPartialJSON
            const partialJson = event.delta.partial_json || '';
            if (currentToolCallInfo) {
              currentToolCallBuffer += partialJson;
              logger.debug('[ClaudeProvider] Accumulated JSON for', currentToolCallInfo.name, 'buffer length:', currentToolCallBuffer.length);
            } else {
              logger.warn('[ClaudeProvider] Received input_json_delta but no currentToolCallInfo!');
            }
          }
          continue;
        }
      }
    } catch (error: any) {
      logger.error('[ClaudeProvider] Stream error:', error);
      logger.error('[ClaudeProvider] Stream error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      });
      throw error;
    }
  }
}

