/**
 * Claude Provider (Anthropic)
 * Provides integration with Anthropic's Claude API
 * Uses official @anthropic-ai/sdk like Puter does
 */
import { ChatModel, CompleteArguments, ChatCompletion } from './OllamaProvider.js';
export declare class ClaudeProvider {
    private anthropic;
    private defaultModel;
    constructor(config?: {
        apiKey?: string;
        defaultModel?: string;
    });
    /**
     * Check if Claude API is available
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
     * Convert messages to Claude format
     */
    private convertMessages;
    /**
     * Complete chat completion
     */
    complete(args: CompleteArguments): Promise<ChatCompletion>;
    /**
     * Stream chat completion
     * Uses official @anthropic-ai/sdk like Puter does
     */
    streamComplete(args: CompleteArguments): AsyncGenerator<ChatCompletion, void, unknown>;
}
//# sourceMappingURL=ClaudeProvider.d.ts.map