/**
 * Ollama Provider
 * Provides integration with Ollama's local AI API
 * Uses HTTP requests directly (no OpenAI SDK dependency)
 */
import { logger } from '../../../utils/logger.js';
export class OllamaProvider {
    apiBaseUrl;
    defaultModel;
    modelsCache = null;
    cacheTimestamp = 0;
    CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    constructor(config) {
        this.apiBaseUrl = config?.baseUrl || 'http://localhost:11434';
        this.defaultModel = config?.defaultModel || 'deepseek-r1:1.5b';
    }
    /**
     * Check if Ollama is available
     */
    async isAvailable() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/tags`, {
                method: 'GET',
                signal: AbortSignal.timeout(2000),
            });
            return response.ok;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Get available models from Ollama
     */
    async models() {
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
            const coercedModels = ollamaModels.map((model) => {
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
        }
        catch (error) {
            logger.error('[Ollama] Error fetching models:', error);
            return [];
        }
    }
    /**
     * List available model IDs
     */
    async list() {
        const models = await this.models();
        return models.map(m => m.id);
    }
    /**
     * Get default model
     */
    getDefaultModel() {
        return `ollama:${this.defaultModel}`;
    }
    /**
     * Convert messages to Ollama format
     * Ollama supports multimodal content with images as base64 data URLs
     */
    convertMessages(messages) {
        return messages.map(msg => {
            // Ollama supports both string content and array content with images
            if (typeof msg.content === 'string') {
                return {
                    role: msg.role === 'system' ? 'user' : msg.role, // Ollama doesn't support system role
                    content: msg.content,
                };
            }
            else if (Array.isArray(msg.content)) {
                // Check if message contains images
                const hasImages = msg.content.some(c => c.type === 'image' || c.source);
                if (hasImages) {
                    // For multimodal messages with images, Ollama expects:
                    // - images array with base64 data
                    // - content string with text
                    const images = [];
                    const textParts = [];
                    for (const c of msg.content) {
                        if (c.type === 'image' || c.source) {
                            // Extract base64 data from image
                            let imageData = '';
                            if (c.source && c.source.data) {
                                // Remove data URL prefix if present (data:image/png;base64,)
                                const data = c.source.data;
                                if (data.startsWith('data:')) {
                                    // Full data URL: data:image/png;base64,<base64>
                                    imageData = data.includes(',') ? data.split(',')[1] : data;
                                }
                                else {
                                    // Already just base64
                                    imageData = data;
                                }
                            }
                            else if (c.data) {
                                const data = c.data;
                                if (data.startsWith('data:')) {
                                    imageData = data.includes(',') ? data.split(',')[1] : data;
                                }
                                else {
                                    imageData = data;
                                }
                            }
                            if (imageData) {
                                images.push(imageData);
                                logger.info('[Ollama] Added image to message:', {
                                    imageDataLength: imageData.length,
                                    imageDataPreview: imageData.substring(0, 50) + '...'
                                });
                            }
                        }
                        else if (c.type === 'text' && c.text) {
                            textParts.push(c.text);
                        }
                    }
                    const content = textParts.join('\n');
                    return {
                        role: msg.role === 'system' ? 'user' : msg.role,
                        content: content,
                        images: images.length > 0 ? images : undefined,
                    };
                }
                else {
                    // No images, just extract text
                    const content = msg.content
                        .filter(c => c.type === 'text' && c.text)
                        .map(c => c.text)
                        .join('\n');
                    return {
                        role: msg.role === 'system' ? 'user' : msg.role,
                        content: content,
                    };
                }
            }
            // Fallback
            return {
                role: msg.role === 'system' ? 'user' : msg.role,
                content: String(msg.content || ''),
            };
        });
    }
    /**
     * Complete chat completion
     */
    async complete(args) {
        const model = args.model?.replace('ollama:', '') || this.defaultModel;
        const messages = this.convertMessages(args.messages);
        const temperature = args.temperature ?? 0.7;
        const maxTokens = args.max_tokens;
        const requestBody = {
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
        // Use Ollama's OpenAI-compatible API for native function calling support
        // This endpoint supports tools/function calling like OpenAI
        const useOpenAICompat = args.tools && args.tools.length > 0;
        // Convert messages to OpenAI format if using OpenAI-compatible endpoint
        let openAIMessages = messages;
        if (useOpenAICompat) {
            openAIMessages = messages.map((msg) => {
                if (msg.images && msg.images.length > 0) {
                    // Multimodal message with images
                    return {
                        role: msg.role,
                        content: [
                            { type: 'text', text: msg.content || '' },
                            ...msg.images.map((img) => ({
                                type: 'image_url',
                                image_url: { url: img }
                            }))
                        ]
                    };
                }
                return {
                    role: msg.role,
                    content: msg.content
                };
            });
        }
        try {
            let requestBody;
            let endpoint;
            if (useOpenAICompat) {
                // Use OpenAI-compatible endpoint with native function calling
                endpoint = `${this.apiBaseUrl}/v1/chat/completions`;
                requestBody = {
                    model: model,
                    messages: openAIMessages,
                    temperature: temperature,
                    ...(maxTokens ? { max_tokens: maxTokens } : {}),
                    ...(args.tools ? { tools: args.tools } : {}),
                };
                logger.info('[Ollama] Using OpenAI-compatible endpoint for function calling support');
            }
            else {
                // Use raw Ollama API for backward compatibility
                endpoint = `${this.apiBaseUrl}/api/chat`;
                requestBody = {
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
            }
            const requestBodyString = JSON.stringify(requestBody);
            const requestSize = Buffer.byteLength(requestBodyString, 'utf8');
            // Check if any messages contain images
            const hasImages = messages.some((m) => m.images && m.images.length > 0);
            const imageCount = messages.reduce((sum, m) => sum + (m.images?.length || 0), 0);
            logger.info('[Ollama] Sending chat request:', {
                model,
                messageCount: messages.length,
                requestSize,
                requestSizeKB: Math.round(requestSize / 1024),
                hasImages,
                imageCount,
                endpoint: useOpenAICompat ? 'v1/chat/completions' : 'api/chat',
                hasTools: !!(args.tools && args.tools.length > 0),
            });
            if (hasImages) {
                logger.warn('[Ollama] Request contains images. Ensure model supports vision:', {
                    model,
                    imageCount,
                    note: 'Vision models: llava, llama-vision, bakllava, etc.'
                });
            }
            if (requestSize > 10 * 1024 * 1024) { // 10MB
                logger.warn('[Ollama] Very large request detected:', {
                    requestSize,
                    requestSizeMB: Math.round(requestSize / (1024 * 1024)),
                });
            }
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: requestBodyString,
                signal: AbortSignal.timeout(120000), // 2 minute timeout
            });
            if (!response.ok) {
                const errorText = await response.text();
                const errorData = JSON.parse(errorText || '{}');
                // Check if error is due to model not supporting tools
                if (useOpenAICompat &&
                    response.status === 400 &&
                    (errorText.includes('does not support tools') ||
                        errorData?.error?.message?.includes('does not support tools'))) {
                    logger.warn('[Ollama] Model does not support tools, falling back to regular endpoint without tools');
                    // Retry without tools using regular Ollama endpoint
                    const fallbackEndpoint = `${this.apiBaseUrl}/api/chat`;
                    const fallbackRequestBody = {
                        model: model,
                        messages: messages,
                        stream: false,
                        options: {
                            temperature: temperature,
                        },
                    };
                    if (maxTokens) {
                        fallbackRequestBody.options.num_predict = maxTokens;
                    }
                    const fallbackResponse = await fetch(fallbackEndpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(fallbackRequestBody),
                        signal: AbortSignal.timeout(120000),
                    });
                    if (!fallbackResponse.ok) {
                        const fallbackErrorText = await fallbackResponse.text();
                        logger.error('[Ollama] Fallback request also failed:', {
                            status: fallbackResponse.status,
                            errorText: fallbackErrorText.substring(0, 500),
                        });
                        throw new Error(`Ollama API error: ${fallbackResponse.status} ${fallbackErrorText}`);
                    }
                    const fallbackData = await fallbackResponse.json();
                    return {
                        message: {
                            role: fallbackData.message?.role || 'assistant',
                            content: fallbackData.message?.content || '',
                        },
                        done: fallbackData.done ?? true,
                        usage: {
                            prompt_tokens: fallbackData.prompt_eval_count || 0,
                            completion_tokens: fallbackData.eval_count || 0,
                            total_tokens: (fallbackData.prompt_eval_count || 0) + (fallbackData.eval_count || 0),
                        },
                    };
                }
                logger.error('[Ollama] API error response:', {
                    status: response.status,
                    statusText: response.statusText,
                    errorText: errorText.substring(0, 500), // First 500 chars
                });
                throw new Error(`Ollama API error: ${response.status} ${errorText}`);
            }
            const data = await response.json();
            // Handle OpenAI-compatible format (with tool_calls) vs raw Ollama format
            if (useOpenAICompat && data.choices && data.choices[0]) {
                const choice = data.choices[0];
                return {
                    message: {
                        role: choice.message?.role || 'assistant',
                        content: choice.message?.content || '',
                        tool_calls: choice.message?.tool_calls || undefined,
                    },
                    done: true,
                    usage: {
                        prompt_tokens: data.usage?.prompt_tokens || 0,
                        completion_tokens: data.usage?.completion_tokens || 0,
                        total_tokens: data.usage?.total_tokens || 0,
                    },
                };
            }
            // Raw Ollama format: { message: { role, content }, done: true, ... }
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
        }
        catch (error) {
            logger.error('[Ollama] Chat completion error:', error);
            throw error;
        }
    }
    /**
     * Stream chat completion
     * Uses OpenAI-compatible endpoint when tools are provided for native function calling
     */
    async *streamComplete(args) {
        const model = args.model?.replace('ollama:', '') || this.defaultModel;
        const messages = this.convertMessages(args.messages);
        const temperature = args.temperature ?? 0.7;
        const hasTools = args.tools && args.tools.length > 0;
        // Use OpenAI-compatible endpoint when tools are provided
        const useOpenAICompat = hasTools;
        let endpoint;
        let requestBody;
        if (useOpenAICompat) {
            // Use OpenAI-compatible endpoint with native function calling
            endpoint = `${this.apiBaseUrl}/v1/chat/completions`;
            // Convert tools to OpenAI format
            const tools = args.tools?.map(tool => {
                if (tool.type === 'function' && tool.function) {
                    return {
                        type: 'function',
                        function: {
                            name: tool.function.name,
                            description: tool.function.description,
                            parameters: tool.function.parameters,
                        },
                    };
                }
                return tool;
            });
            requestBody = {
                model: model,
                messages: messages,
                stream: true,
                temperature: temperature,
                tools: tools,
                tool_choice: 'auto', // Let the model decide when to use tools
            };
            logger.info('[Ollama] Using OpenAI-compatible endpoint for streaming with function calling support');
        }
        else {
            // Use traditional Ollama endpoint
            endpoint = `${this.apiBaseUrl}/api/chat`;
            requestBody = {
                model: model,
                messages: messages,
                stream: true,
                options: {
                    temperature: temperature,
                },
            };
        }
        try {
            const response = await fetch(endpoint, {
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
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                if (useOpenAICompat) {
                    // OpenAI-compatible streaming format: "data: {...}\n\n"
                    const chunks = buffer.split('\n\n');
                    buffer = chunks.pop() || '';
                    for (const chunk of chunks) {
                        if (!chunk.trim() || chunk === 'data: [DONE]')
                            continue;
                        try {
                            const jsonStr = chunk.replace(/^data: /, '');
                            const data = JSON.parse(jsonStr);
                            if (data.choices && data.choices[0]) {
                                const choice = data.choices[0];
                                const delta = choice.delta || {};
                                yield {
                                    message: {
                                        role: delta.role || 'assistant',
                                        content: delta.content || '',
                                        tool_calls: delta.tool_calls || undefined,
                                    },
                                    done: choice.finish_reason !== null,
                                };
                            }
                        }
                        catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
                else {
                    // Raw Ollama streaming format: one JSON object per line
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        if (line.trim() === '')
                            continue;
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
                        }
                        catch (e) {
                            // Skip invalid JSON lines
                        }
                    }
                }
            }
        }
        catch (error) {
            logger.error('[Ollama] Stream completion error:', error);
            throw error;
        }
    }
}
//# sourceMappingURL=OllamaProvider.js.map