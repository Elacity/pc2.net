/**
 * Claude Provider (Anthropic)
 * Provides integration with Anthropic's Claude API
 */

import { logger } from '../../../utils/logger.js';
import { ChatModel, ChatMessage, CompleteArguments, ChatCompletion } from './OllamaProvider.js';

export class ClaudeProvider {
  private apiKey: string;
  private apiBaseUrl: string = 'https://api.anthropic.com';
  private defaultModel: string = 'claude-sonnet-4-5-20250929'; // Current Claude Sonnet 4.5 model

  constructor(config?: { apiKey?: string; defaultModel?: string }) {
    if (!config?.apiKey) {
      throw new Error('Claude API key is required');
    }
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel || this.defaultModel;
  }

  /**
   * Check if Claude API is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.defaultModel,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }],
        }),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok || response.status === 400; // 400 means API key is valid but request is invalid (which is fine for availability check)
    } catch (error) {
      return false;
    }
  }

  /**
   * Get available models
   */
  async models(): Promise<ChatModel[]> {
    // Claude models
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
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        max_tokens: 4096,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.015,
          output_token: 0.075,
        },
      },
      {
        id: 'claude-3-sonnet-20240229',
        name: 'Claude 3 Sonnet',
        max_tokens: 4096,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.003,
          output_token: 0.015,
        },
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        max_tokens: 4096,
        costs_currency: 'USD',
        costs: {
          tokens: 0,
          input_token: 0.00025,
          output_token: 0.00125,
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
      const response = await fetch(`${this.apiBaseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[ClaudeProvider] API error:', response.status, errorText);
        throw new Error(`Claude API error: ${response.status} - ${errorText}`);
      }

      const data: any = await response.json();
      
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
   */
  async *streamComplete(args: CompleteArguments): AsyncGenerator<ChatCompletion, void, unknown> {
    const model = args.model?.replace('claude:', '') || this.defaultModel;
    const messages = this.convertMessages(args.messages);
    const temperature = args.temperature ?? 0.7;
    const maxTokens = args.max_tokens || 4096;

    const requestBody: any = {
      model: model,
      messages: messages,
      max_tokens: maxTokens,
      temperature: temperature,
      stream: true,
    };

    // Add tools if provided
    if (args.tools && args.tools.length > 0) {
      requestBody.tools = args.tools.map((tool: any) => ({
        name: tool.function?.name || tool.name,
        description: tool.function?.description || tool.description,
        input_schema: tool.function?.parameters || tool.parameters || {},
      }));
    }

    try {
      logger.info('[ClaudeProvider] Starting stream request:', {
        model,
        messageCount: messages.length,
        hasTools: !!(args.tools && args.tools.length > 0),
        apiBaseUrl: this.apiBaseUrl,
      });
      
      const response = await fetch(`${this.apiBaseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      logger.info('[ClaudeProvider] Stream response status:', response.status, response.statusText);
      logger.info('[ClaudeProvider] Stream response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[ClaudeProvider] Stream API error:', response.status, errorText);
        throw new Error(`Claude API error: ${response.status} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        logger.error('[ClaudeProvider] No response body reader available');
        throw new Error('No response body reader available');
      }

      logger.info('[ClaudeProvider] Stream reader obtained, starting to read chunks...');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';
      let toolCalls: any[] = [];
      let toolCallBuffers: Map<string, string> = new Map(); // Track JSON buffers for each tool call
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          logger.info('[ClaudeProvider] Stream reader done. Total chunks:', chunkCount, 'Accumulated content length:', accumulatedContent.length);
          break;
        }
        
        chunkCount++;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          
          logger.debug('[ClaudeProvider] Processing line:', line.substring(0, 200));
          
          // Anthropic uses SSE format with "data: " prefix
          let data = '';
          if (line.startsWith('data: ')) {
            data = line.slice(6);
          } else if (line.trim().startsWith('{')) {
            // Sometimes Anthropic sends JSON directly without "data: " prefix
            data = line.trim();
          } else {
            // Log skipped lines for debugging
            logger.debug('[ClaudeProvider] Skipping non-data line:', line.substring(0, 100));
            continue;
          }
          
          if (data === '[DONE]') {
            yield {
              message: {
                role: 'assistant',
                content: accumulatedContent,
                tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
              },
              done: true,
            };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            logger.info('[ClaudeProvider] Stream event type:', parsed.type, 'delta type:', parsed.delta?.type, 'content_block type:', parsed.content_block?.type);
            
            // Handle text content deltas (Anthropic uses 'text_delta' not 'text')
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              const text = parsed.delta.text || '';
              if (text) {
                accumulatedContent += text;
                logger.debug('[ClaudeProvider] Yielding text chunk:', text.substring(0, 50));
                yield {
                  message: {
                    role: 'assistant',
                    content: text,
                  },
                  done: false,
                };
              }
            } else if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
              // Tool use started - initialize buffer for this tool call
              const toolUse = parsed.content_block;
              const toolId = toolUse.id;
              toolCallBuffers.set(toolId, ''); // Initialize empty buffer
              logger.info('[ClaudeProvider] Tool use started:', toolUse.name, 'id:', toolId);
            } else if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
              // Update tool_use arguments incrementally
              const toolId = parsed.content_block?.id;
              if (toolId && toolCallBuffers.has(toolId)) {
                const currentBuffer = toolCallBuffers.get(toolId) || '';
                const partialJson = parsed.delta.partial_json || '';
                toolCallBuffers.set(toolId, currentBuffer + partialJson);
                logger.debug('[ClaudeProvider] Updated tool call buffer for', toolId, 'buffer length:', (currentBuffer + partialJson).length);
              }
            } else if (parsed.type === 'content_block_stop') {
              // Content block ended - if it's a tool_use, finalize it
              const toolId = parsed.content_block?.id;
              if (toolId && toolCallBuffers.has(toolId)) {
                // Parse the complete JSON buffer
                let toolInput: any = {};
                const jsonBuffer = toolCallBuffers.get(toolId) || '{}';
                try {
                  toolInput = JSON.parse(jsonBuffer);
                } catch (e) {
                  logger.warn('[ClaudeProvider] Failed to parse tool input JSON:', jsonBuffer, e);
                  toolInput = {};
                }
                
                // Find the tool call by ID or create new one
                let toolCall = toolCalls.find(tc => tc.id === toolId);
                if (!toolCall) {
                  // Create new tool call
                  const toolName = parsed.content_block?.name || 'unknown';
                  toolCall = {
                    id: toolId,
                    type: 'function',
                    function: {
                      name: toolName,
                      arguments: JSON.stringify(toolInput),
                    },
                  };
                  toolCalls.push(toolCall);
                } else {
                  // Update existing tool call with complete arguments
                  toolCall.function.arguments = JSON.stringify(toolInput);
                }
                
                logger.info('[ClaudeProvider] Tool call finalized:', toolCall.function.name, 'args:', JSON.stringify(toolInput));
                
                // Yield the complete tool call immediately
                yield {
                  message: {
                    role: 'assistant',
                    content: '', // No text content for tool_use
                    tool_calls: [toolCall], // Yield the complete tool call
                  },
                  done: false,
                };
                
                // Clean up buffer
                toolCallBuffers.delete(toolId);
              } else {
                logger.debug('[ClaudeProvider] Content block stopped (not a tool_use)');
              }
            } else if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'text') {
              // Text content block started - nothing to do yet, wait for deltas
              logger.debug('[ClaudeProvider] Text content block started');
            } else if (parsed.type === 'message_start') {
              // Message started
              logger.debug('[ClaudeProvider] Message started');
            } else if (parsed.type === 'message_stop' || parsed.type === 'message_delta') {
              // Stream ended - yield final chunk with tool calls if any
              // The frontend has already accumulated all the delta chunks
              logger.info('[ClaudeProvider] Message stop/delta - tool calls count:', toolCalls.length);
              if (toolCalls.length > 0) {
                logger.info('[ClaudeProvider] Yielding final chunk with tool calls:', toolCalls.map(tc => tc.function?.name));
              }
              yield {
                message: {
                  role: 'assistant',
                  content: '', // Empty content - frontend already has it all
                  tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
                },
                done: true,
              };
              if (parsed.type === 'message_stop') {
                return;
              }
            } else if (parsed.type === 'error') {
              logger.error('[ClaudeProvider] Stream error from API:', parsed);
              throw new Error(parsed.error?.message || 'Claude API streaming error');
            }
          } catch (e) {
            // Log parsing errors for debugging
            if (data.trim() && !data.includes('[DONE]')) {
              logger.warn('[ClaudeProvider] Failed to parse stream line:', data.substring(0, 200), e);
            }
          }
        }
      }
      
      // Stream ended without message_stop - only yield if we have content that wasn't streamed
      // If we've been streaming deltas, the frontend already has all the content
      logger.info('[ClaudeProvider] Stream loop ended. Final state:', {
        chunkCount,
        accumulatedContentLength: accumulatedContent.length,
        toolCallsCount: toolCalls.length,
        bufferLength: buffer.length,
      });
      
      // Only yield final content if we have tool calls (they need to be sent)
      // For text content, if we've been streaming deltas, don't send it again
      if (toolCalls.length > 0) {
        logger.info('[ClaudeProvider] Yielding final chunk with tool calls');
        yield {
          message: {
            role: 'assistant',
            content: '', // Don't duplicate text content
            tool_calls: toolCalls,
          },
          done: true,
        };
      } else if (accumulatedContent && chunkCount === 0) {
        // Only send full content if we never streamed any deltas (edge case)
        logger.info('[ClaudeProvider] Yielding accumulated content (no deltas were streamed)');
        yield {
          message: {
            role: 'assistant',
            content: accumulatedContent,
          },
          done: true,
        };
      } else {
        // Stream completed - frontend already has all content from deltas
        logger.info('[ClaudeProvider] Stream completed, frontend already has all content');
        yield {
          message: {
            role: 'assistant',
            content: '', // Empty - frontend already accumulated all deltas
          },
          done: true,
        };
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

