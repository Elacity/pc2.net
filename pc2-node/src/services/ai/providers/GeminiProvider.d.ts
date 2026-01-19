/**
 * Gemini Provider (Google)
 * Provides integration with Google's Gemini API
 */
import { ChatModel, CompleteArguments, ChatCompletion } from './OllamaProvider.js';
export declare class GeminiProvider {
    private apiKey;
    private apiBaseUrl;
    private defaultModel;
    constructor(config?: {
        apiKey?: string;
        defaultModel?: string;
    });
    /**
     * Check if Gemini API is available
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
     * Convert messages to Gemini format
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
//# sourceMappingURL=GeminiProvider.d.ts.map