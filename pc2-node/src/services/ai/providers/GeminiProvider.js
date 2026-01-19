/**
 * Gemini Provider (Google)
 * Provides integration with Google's Gemini API
 */
import { logger } from '../../../utils/logger.js';
export class GeminiProvider {
    apiKey;
    apiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    defaultModel = 'gemini-pro';
    constructor(config) {
        if (!config?.apiKey) {
            throw new Error('Gemini API key is required');
        }
        this.apiKey = config.apiKey;
        this.defaultModel = config.defaultModel || this.defaultModel;
    }
    /**
     * Check if Gemini API is available
     */
    async isAvailable() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/models?key=${this.apiKey}`, {
                method: 'GET',
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
        // Gemini models
        return [
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
    getDefaultModel() {
        return `gemini:${this.defaultModel}`;
    }
    /**
     * Convert messages to Gemini format
     */
    convertMessages(messages) {
        const parts = [];
        for (const msg of messages) {
            if (typeof msg.content === 'string') {
                parts.push({ text: msg.content });
            }
            else if (Array.isArray(msg.content)) {
                for (const c of msg.content) {
                    if (c.type === 'text' && c.text) {
                        parts.push({ text: c.text });
                    }
                    else if (c.type === 'image' || c.source) {
                        // Handle images - Gemini expects base64 data
                        const imageData = c.source?.data || c.data || '';
                        if (imageData.startsWith('data:')) {
                            const [header, base64] = imageData.split(',');
                            const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png';
                            parts.push({
                                inline_data: {
                                    mime_type: mimeType,
                                    data: base64,
                                },
                            });
                        }
                    }
                }
            }
        }
        return parts;
    }
    /**
     * Complete chat completion
     */
    async complete(args) {
        const model = args.model?.replace('gemini:', '') || this.defaultModel;
        const parts = this.convertMessages(args.messages);
        const temperature = args.temperature ?? 0.7;
        const maxTokens = args.max_tokens || 4096;
        const requestBody = {
            contents: [{
                    parts: parts,
                }],
            generationConfig: {
                temperature: temperature,
                maxOutputTokens: maxTokens,
            },
        };
        // Note: Gemini has function calling support but it's different from OpenAI format
        // For now, we'll skip tools for Gemini (can be added later)
        try {
            const response = await fetch(`${this.apiBaseUrl}/models/${model}:generateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
            if (!response.ok) {
                const errorText = await response.text();
                logger.error('[GeminiProvider] API error:', response.status, errorText);
                throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
            }
            const data = await response.json();
            const candidate = data.candidates?.[0];
            const content = candidate?.content?.parts?.[0]?.text || '';
            return {
                message: {
                    role: 'assistant',
                    content: content,
                },
                done: true,
                usage: data.usageMetadata ? {
                    prompt_tokens: data.usageMetadata.promptTokenCount || 0,
                    completion_tokens: data.usageMetadata.candidatesTokenCount || 0,
                    total_tokens: data.usageMetadata.totalTokenCount || 0,
                } : undefined,
            };
        }
        catch (error) {
            logger.error('[GeminiProvider] Completion error:', error);
            throw error;
        }
    }
    /**
     * Stream chat completion
     */
    async *streamComplete(args) {
        const model = args.model?.replace('gemini:', '') || this.defaultModel;
        const parts = this.convertMessages(args.messages);
        const temperature = args.temperature ?? 0.7;
        const maxTokens = args.max_tokens || 4096;
        const requestBody = {
            contents: [{
                    parts: parts,
                }],
            generationConfig: {
                temperature: temperature,
                maxOutputTokens: maxTokens,
            },
        };
        try {
            const response = await fetch(`${this.apiBaseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
            if (!response.ok) {
                const errorText = await response.text();
                logger.error('[GeminiProvider] Stream API error:', response.status, errorText);
                throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
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
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.trim() && line.startsWith('{')) {
                        try {
                            const parsed = JSON.parse(line);
                            const candidate = parsed.candidates?.[0];
                            const delta = candidate?.content?.parts?.[0]?.text;
                            if (delta) {
                                yield {
                                    message: {
                                        role: 'assistant',
                                        content: delta,
                                    },
                                    done: false,
                                };
                            }
                        }
                        catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            }
            yield {
                message: {
                    role: 'assistant',
                    content: '',
                },
                done: true,
            };
        }
        catch (error) {
            logger.error('[GeminiProvider] Stream error:', error);
            throw error;
        }
    }
}
//# sourceMappingURL=GeminiProvider.js.map