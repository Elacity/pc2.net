/**
 * OpenAI Provider
 * Provides integration with OpenAI's API
 */
import { ChatModel, CompleteArguments, ChatCompletion } from './OllamaProvider.js';
export declare class OpenAIProvider {
    private apiKey;
    private apiBaseUrl;
    private defaultModel;
    constructor(config?: {
        apiKey?: string;
        defaultModel?: string;
    });
    /**
     * Check if OpenAI API is available
     */
    isAvailable(): Promise<boolean>;
    /**
     * Get available models
     */
    models(): Promise<ChatModel[]>;
    /**
     * Get default model
     */
    getDefaultModel(): string;
    /**
     * Convert messages to OpenAI format
     */
    private convertMessages;
    /**
     * Complete chat completion
     */
    complete(args: CompleteArguments): Promise<ChatCompletion>;
    /**
     * Stream chat completion
     */
    streamComplete(args: CompleteArguments): AsyncGenerator<ChatCompletion, void, unknown>;
}
//# sourceMappingURL=OpenAIProvider.d.ts.map