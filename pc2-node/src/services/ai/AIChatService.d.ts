/**
 * AI Chat Service
 * Main service for handling AI chat completions
 * Supports multiple providers (Ollama default, cloud providers optional)
 */
import { ChatModel, ChatMessage, ChatCompletion } from './providers/OllamaProvider.js';
import { FilesystemManager } from '../../storage/filesystem.js';
import { DatabaseManager } from '../../storage/database.js';
export interface AIConfig {
    enabled?: boolean;
    defaultProvider?: string;
    providers?: {
        ollama?: {
            enabled?: boolean;
            baseUrl?: string;
            defaultModel?: string;
        };
        openai?: {
            enabled?: boolean;
            apiKey?: string;
        };
        claude?: {
            enabled?: boolean;
            apiKey?: string;
        };
    };
}
export interface CompleteRequest {
    messages: ChatMessage[];
    model?: string;
    stream?: boolean;
    tools?: any[];
    max_tokens?: number;
    temperature?: number;
    walletAddress?: string;
    filesystem?: FilesystemManager;
    io?: any;
}
export declare class AIChatService {
    private providers;
    private config;
    private defaultProvider;
    private initialized;
    private db?;
    constructor(config?: AIConfig, db?: DatabaseManager);
    /**
     * Initialize the service and register providers
     */
    initialize(): Promise<void>;
    /**
     * Register providers for a specific user (loads API keys from database)
     * This is called per-request to ensure user-specific API keys are used
     */
    registerUserProviders(walletAddress: string): Promise<void>;
    /**
     * Register Claude provider
     */
    private registerClaudeProvider;
    /**
     * Register OpenAI provider
     */
    private registerOpenAIProvider;
    /**
     * Register Gemini provider
     */
    private registerGeminiProvider;
    /**
     * Register Ollama provider (auto-detect if available)
     */
    private registerOllamaProvider;
    /**
     * Get available models from all providers
     */
    listModels(): Promise<ChatModel[]>;
    /**
     * List available model IDs
     */
    listModelIds(): Promise<string[]>;
    /**
     * List available providers
     */
    listProviders(): string[];
    /**
     * Get provider for a given model
     */
    private getProviderForModel;
    /**
     * Check if messages contain images
     */
    private hasImages;
    /**
     * Find a vision-capable model from available models
     */
    private findVisionModel;
    /**
     * Complete chat completion
     */
    complete(args: CompleteRequest): Promise<ChatCompletion>;
    /**
     * Execute AI completion with tool calling support
     * Since Ollama doesn't natively support function calling, we use a multi-turn approach:
     * 1. Include tools in system message as instructions
     * 2. Parse tool calls from AI response
     * 3. Execute tools and feed results back
     * 4. Continue until AI gives final response
     */
    private executeWithTools;
    /**
     * Parse tool calls from AI response
     * Looks for JSON objects with tool_calls array
     * Also tries to infer tool calls from natural language if JSON parsing fails
     */
    private parseToolCalls;
    /**
     * Stream chat completion (for future use)
     */
    streamComplete(args: CompleteRequest): AsyncGenerator<ChatCompletion, void, unknown>;
    /**
     * Ensure service is initialized
     */
    private ensureInitialized;
    /**
     * Check if service is available
     */
    isAvailable(): boolean;
}
//# sourceMappingURL=AIChatService.d.ts.map