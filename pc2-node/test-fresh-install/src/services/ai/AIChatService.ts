/**
 * AI Chat Service
 * Main service for handling AI chat completions
 * Supports multiple providers (Ollama default, cloud providers optional)
 */

import { logger } from '../../utils/logger.js';
import { OllamaProvider, ChatModel, ChatMessage, CompleteArguments, ChatCompletion } from './providers/OllamaProvider.js';
import { normalizeMessages, extractText } from './utils/Messages.js';
import { normalizeToolsObject } from './utils/FunctionCalling.js';

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
    // Add other providers as needed
  };
}

export interface CompleteRequest {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  tools?: any[];
  max_tokens?: number;
  temperature?: number;
}

export class AIChatService {
  private providers: Map<string, OllamaProvider> = new Map();
  private config: AIConfig;
  private defaultProvider: string = 'ollama';
  private initialized: boolean = false;

  constructor(config: AIConfig = {}) {
    this.config = config;
    this.defaultProvider = config.defaultProvider || 'ollama';
  }

  /**
   * Initialize the service and register providers
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('[AIChatService] Initializing AI service...');

    // Register Ollama provider (default, auto-detected)
    if (this.config.providers?.ollama?.enabled !== false) {
      await this.registerOllamaProvider();
    }

    // Register cloud providers if API keys are provided
    // (For now, we only support Ollama. Cloud providers can be added later)

    this.initialized = true;
    logger.info(`[AIChatService] Initialized with ${this.providers.size} provider(s)`);
  }

  /**
   * Register Ollama provider (auto-detect if available)
   */
  private async registerOllamaProvider(): Promise<void> {
    const ollamaConfig = this.config.providers?.ollama || {};
    const baseUrl = ollamaConfig.baseUrl || 'http://localhost:11434';
    const defaultModel = ollamaConfig.defaultModel || 'deepseek-r1:1.5b';

    const provider = new OllamaProvider({
      baseUrl,
      defaultModel,
    });

    // Check if Ollama is available
    const isAvailable = await provider.isAvailable();
    if (isAvailable) {
      this.providers.set('ollama', provider);
      logger.info('[AIChatService] ✅ Ollama provider registered');
    } else {
      logger.warn('[AIChatService] ⚠️  Ollama not available (not running or not installed)');
    }
  }

  /**
   * Get available models from all providers
   */
  async listModels(): Promise<ChatModel[]> {
    await this.ensureInitialized();

    const allModels: ChatModel[] = [];
    for (const provider of this.providers.values()) {
      try {
        const models = await provider.models();
        allModels.push(...models);
      } catch (error) {
        logger.error('[AIChatService] Error listing models from provider:', error);
      }
    }
    return allModels;
  }

  /**
   * List available model IDs
   */
  async listModelIds(): Promise<string[]> {
    const models = await this.listModels();
    return models.map(m => m.id);
  }

  /**
   * List available providers
   */
  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get provider for a given model
   */
  private getProviderForModel(model?: string): OllamaProvider | null {
    if (!model) {
      // Use default provider
      const provider = this.providers.get(this.defaultProvider);
      return provider || null;
    }

    // Check if model specifies provider (e.g., "ollama:deepseek-r1:1.5b")
    if (model.includes(':')) {
      const [providerName] = model.split(':');
      const provider = this.providers.get(providerName);
      if (provider) return provider;
    }

    // Try to find provider that has this model
    for (const provider of this.providers.values()) {
      // For now, assume Ollama can handle any model
      // In the future, we can check provider.models() to match
      if (provider) return provider;
    }

    // Fallback to default provider
    return this.providers.get(this.defaultProvider) || null;
  }

  /**
   * Complete chat completion
   */
  async complete(args: CompleteRequest): Promise<ChatCompletion> {
    await this.ensureInitialized();

    if (this.providers.size === 0) {
      throw new Error('No AI providers available. Please ensure Ollama is installed and running.');
    }

    // Normalize messages
    const normalizedMessages = normalizeMessages(args.messages);

    // Normalize tools if provided
    let tools = args.tools;
    if (tools && tools.length > 0) {
      tools = normalizeToolsObject([...tools]);
    }

    // Get provider for the requested model
    const provider = this.getProviderForModel(args.model);
    if (!provider) {
      throw new Error(`No provider available for model: ${args.model || 'default'}`);
    }

    // Prepare completion arguments
    const completeArgs: CompleteArguments = {
      messages: normalizedMessages as ChatMessage[],
      model: args.model,
      stream: args.stream,
      tools: tools as any,
      max_tokens: args.max_tokens,
      temperature: args.temperature,
    };

    // Call provider
    try {
      const result = await provider.complete(completeArgs);
      return result;
    } catch (error) {
      logger.error('[AIChatService] Completion error:', error);
      throw error;
    }
  }

  /**
   * Stream chat completion (for future use)
   */
  async *streamComplete(args: CompleteRequest): AsyncGenerator<ChatCompletion, void, unknown> {
    await this.ensureInitialized();

    if (this.providers.size === 0) {
      throw new Error('No AI providers available. Please ensure Ollama is installed and running.');
    }

    const provider = this.getProviderForModel(args.model);
    if (!provider) {
      throw new Error(`No provider available for model: ${args.model || 'default'}`);
    }

    const normalizedMessages = normalizeMessages(args.messages);
    const completeArgs: CompleteArguments = {
      messages: normalizedMessages as ChatMessage[],
      model: args.model,
      stream: true,
      tools: args.tools as any,
      max_tokens: args.max_tokens,
      temperature: args.temperature,
    };

    try {
      yield* provider.streamComplete(completeArgs);
    } catch (error) {
      logger.error('[AIChatService] Stream completion error:', error);
      throw error;
    }
  }

  /**
   * Ensure service is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return this.providers.size > 0;
  }
}

