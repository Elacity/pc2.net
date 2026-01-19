/**
 * OpenAI Provider
 * Provides integration with OpenAI's API
 */
import { logger } from '../../../utils/logger.js';
export class OpenAIProvider {
    apiKey;
    apiBaseUrl = 'https://api.openai.com/v1';
    defaultModel = 'gpt-4o';
    constructor(config) {
        if (!config?.apiKey) {
            throw new Error('OpenAI API key is required');
        }
        this.apiKey = config.apiKey;
        this.defaultModel = config.defaultModel || this.defaultModel;
    }
    /**
     * Check if OpenAI API is available
     */
    async isAvailable() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                signal: AbortSignal.timeout(5000),
            });
            return response.ok;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Get available models
     */
    async models() {
        // OpenAI models
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
    getDefaultModel() {
        return `openai:${this.defaultModel}`;
    }
    /**
     * Convert messages to OpenAI format
     */
    convertMessages(messages) {
        return messages.map(msg => {
            if (typeof msg.content === 'string') {
                return {
                    role: msg.role,
                    content: msg.content,
                };
            }
            else if (Array.isArray(msg.content)) {
                // Handle multimodal content
                const content = [];
                for (const c of msg.content) {
                    if (c.type === 'text' && c.text) {
                        content.push({ type: 'text', text: c.text });
                    }
                    else if (c.type === 'image' || c.source) {
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
                return {
                    role: msg.role,
                    content: content.length > 0 ? content : [{ type: 'text', text: '' }],
                };
            }
            return {
                role: msg.role,
                content: String(msg.content || ''),
            };
        });
    }
    /**
     * Complete chat completion
     */
    async complete(args) {
        const model = args.model?.replace('openai:', '') || this.defaultModel;
        const messages = this.convertMessages(args.messages);
        const temperature = args.temperature ?? 0.7;
        const maxTokens = args.max_tokens;
        const requestBody = {
            model: model,
            messages: messages,
            temperature: temperature,
        };
        if (maxTokens) {
            requestBody.max_tokens = maxTokens;
        }
        // Add tools if provided
        if (args.tools && args.tools.length > 0) {
            requestBody.tools = args.tools;
        }
        try {
            const response = await fetch(`${this.apiBaseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
            if (!response.ok) {
                const errorText = await response.text();
                logger.error('[OpenAIProvider] API error:', response.status, errorText);
                throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
            }
            const data = await response.json();
            const choice = data.choices?.[0];
            return {
                message: {
                    role: choice.message?.role || 'assistant',
                    content: choice.message?.content || '',
                    tool_calls: choice.message?.tool_calls,
                },
                done: true,
                usage: data.usage,
            };
        }
        catch (error) {
            logger.error('[OpenAIProvider] Completion error:', error);
            throw error;
        }
    }
    /**
     * Stream chat completion
     */
    async *streamComplete(args) {
        const model = args.model?.replace('openai:', '') || this.defaultModel;
        const messages = this.convertMessages(args.messages);
        const temperature = args.temperature ?? 0.7;
        const maxTokens = args.max_tokens;
        const requestBody = {
            model: model,
            messages: messages,
            temperature: temperature,
            stream: true,
        };
        if (maxTokens) {
            requestBody.max_tokens = maxTokens;
        }
        // Add tools if provided
        if (args.tools && args.tools.length > 0) {
            requestBody.tools = args.tools;
        }
        try {
            const response = await fetch(`${this.apiBaseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
            if (!response.ok) {
                const errorText = await response.text();
                logger.error('[OpenAIProvider] Stream API error:', response.status, errorText);
                throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
            }
            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body reader available');
            }
            const decoder = new TextDecoder();
            let buffer = '';
            let toolCalls = [];
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            yield {
                                message: {
                                    role: 'assistant',
                                    content: '',
                                    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
                                },
                                done: true,
                            };
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices?.[0]?.delta;
                            if (delta?.content) {
                                yield {
                                    message: {
                                        role: 'assistant',
                                        content: delta.content,
                                    },
                                    done: false,
                                };
                            }
                            if (delta?.tool_calls) {
                                for (const toolCall of delta.tool_calls) {
                                    const index = toolCall.index || 0;
                                    if (!toolCalls[index]) {
                                        toolCalls[index] = {
                                            id: toolCall.id,
                                            type: 'function',
                                            function: {
                                                name: toolCall.function?.name || '',
                                                arguments: toolCall.function?.arguments || '',
                                            },
                                        };
                                    }
                                    else {
                                        toolCalls[index].function.arguments += toolCall.function?.arguments || '';
                                    }
                                }
                            }
                        }
                        catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            }
        }
        catch (error) {
            logger.error('[OpenAIProvider] Stream error:', error);
            throw error;
        }
    }
}
//# sourceMappingURL=OpenAIProvider.js.map