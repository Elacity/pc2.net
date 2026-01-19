/**
 * Ollama Provider
 * Provides integration with Ollama's local AI API
 * Uses HTTP requests directly (no OpenAI SDK dependency)
 */
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
    content: string | Array<{
        type: string;
        text?: string;
        [key: string]: any;
    }>;
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
        tool_calls?: Array<{
            id: string;
            type: 'function';
            function: {
                name: string;
                arguments: string;
            };
        }>;
    };
    done: boolean;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}
export declare class OllamaProvider {
    private apiBaseUrl;
    private defaultModel;
    private modelsCache;
    private cacheTimestamp;
    private readonly CACHE_DURATION;
    constructor(config?: {
        baseUrl?: string;
        defaultModel?: string;
    });
    /**
     * Check if Ollama is available
     */
    isAvailable(): Promise<boolean>;
    /**
     * Get available models from Ollama
     */
    models(): Promise<ChatModel[]>;
    /**
     * List available model IDs
     */
    list(): Promise<string[]>;
    /**
     * Get default model
     */
    getDefaultModel(): string;
    /**
     * Convert messages to Ollama format
     * Ollama supports multimodal content with images as base64 data URLs
     */
    private convertMessages;
    /**
     * Complete chat completion
     */
    complete(args: CompleteArguments): Promise<ChatCompletion>;
    /**
     * Stream chat completion
     * Uses OpenAI-compatible endpoint when tools are provided for native function calling
     */
    streamComplete(args: CompleteArguments): AsyncGenerator<ChatCompletion, void, unknown>;
}
//# sourceMappingURL=OllamaProvider.d.ts.map