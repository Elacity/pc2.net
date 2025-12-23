/**
 * AI Chat Service
 * Main service for handling AI chat completions
 * Supports multiple providers (Ollama default, cloud providers optional)
 */

import { logger } from '../../utils/logger.js';
import { OllamaProvider, ChatModel, ChatMessage, CompleteArguments, ChatCompletion } from './providers/OllamaProvider.js';
import { normalizeMessages, extractText } from './utils/Messages.js';
import { normalizeToolsObject } from './utils/FunctionCalling.js';
import { filesystemTools } from './tools/FilesystemTools.js';
import { ToolExecutor } from './tools/ToolExecutor.js';
import { FilesystemManager } from '../../storage/filesystem.js';

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
  walletAddress?: string; // For tool execution isolation
  filesystem?: FilesystemManager; // For tool execution
  io?: any; // Socket.IO server instance for WebSocket events
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
   * Check if messages contain images
   */
  private hasImages(messages: ChatMessage[]): boolean {
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        continue;
      }
      if (Array.isArray(msg.content)) {
        for (const c of msg.content) {
          if (c.type === 'image' || c.source) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Find a vision-capable model from available models
   */
  private async findVisionModel(): Promise<string | null> {
    const models = await this.listModels();
    // Common vision model names
    const visionModelPatterns = ['llava', 'bakllava', 'vision', 'multimodal'];
    for (const model of models) {
      const modelId = model.id.toLowerCase();
      if (visionModelPatterns.some(pattern => modelId.includes(pattern))) {
        logger.info('[AIChatService] Found vision-capable model:', model.id);
        return model.id;
      }
    }
    return null;
  }

  /**
   * Complete chat completion
   */
  async complete(args: CompleteRequest): Promise<ChatCompletion> {
    await this.ensureInitialized();

    if (this.providers.size === 0) {
      throw new Error('No AI providers available. Please ensure Ollama is installed and running.');
    }

    // Check if messages contain images
    const hasImages = this.hasImages(args.messages);
    if (hasImages && (!args.model || !args.model.toLowerCase().includes('llava') && !args.model.toLowerCase().includes('vision'))) {
      // Try to find a vision-capable model
      const visionModel = await this.findVisionModel();
      if (visionModel) {
        logger.info('[AIChatService] Images detected, switching to vision model:', visionModel);
        args.model = visionModel;
      } else {
        logger.warn('[AIChatService] Images detected but no vision-capable model found. Current model may not support vision:', args.model);
        logger.warn('[AIChatService] To use vision, install a vision model: ollama pull llava');
      }
    }

    // Normalize messages
    logger.info('[AIChatService] Starting complete, normalizing messages...');
    logger.info('[AIChatService] Input messages sample:', {
      count: args.messages.length,
      firstMessageRole: args.messages[0]?.role,
      firstMessageContentLength: typeof args.messages[0]?.content === 'string' 
        ? args.messages[0].content.length 
        : 'not a string',
      firstMessageContentPreview: typeof args.messages[0]?.content === 'string'
        ? args.messages[0].content.substring(0, 200)
        : 'not a string',
    });
    
    let normalizedMessages;
    try {
      normalizedMessages = normalizeMessages(args.messages);
      logger.info('[AIChatService] Messages normalized:', {
        originalCount: args.messages.length,
        normalizedCount: normalizedMessages.length,
      });
    } catch (normalizeError: any) {
      logger.error('[AIChatService] Message normalization failed:', normalizeError);
      logger.error('[AIChatService] Normalization error details:', {
        message: normalizeError?.message,
        stack: normalizeError?.stack?.substring(0, 500),
      });
      throw new Error(`Failed to normalize messages: ${normalizeError?.message || 'Unknown error'}`);
    }

    // Normalize tools if provided
    // If tools are requested and filesystem is available, automatically include filesystem tools
    logger.info('[AIChatService] Checking tools - args.tools:', args.tools, 'args.filesystem:', !!args.filesystem, 'args.walletAddress:', !!args.walletAddress);
    
    let tools = args.tools;
    if (tools && tools.length > 0) {
      tools = normalizeToolsObject([...tools]);
      logger.info('[AIChatService] Tools provided by user:', tools.length);
    } else if (args.filesystem && args.walletAddress) {
      // Automatically include filesystem tools if filesystem is available
      // This allows AI to perform filesystem operations without explicit tool request
      logger.info('[AIChatService] Auto-including filesystem tools - filesystemTools length:', filesystemTools.length);
      tools = normalizeToolsObject([...filesystemTools]);
      logger.info('[AIChatService] Automatically including filesystem tools:', tools.length);
    } else {
      logger.warn('[AIChatService] No tools available - filesystem:', !!args.filesystem, 'walletAddress:', !!args.walletAddress, 'args.tools:', args.tools);
    }
    
    logger.info('[AIChatService] Final tools count:', tools?.length || 0);

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

    // If tools are available and filesystem is provided, implement tool execution loop
    if (args.filesystem && args.walletAddress && tools && tools.length > 0) {
      logger.info('[AIChatService] Tool execution enabled - entering executeWithTools');
      return await this.executeWithTools(
        normalizedMessages,
        completeArgs,
        provider,
        tools,
        args.filesystem!,
        args.walletAddress!,
        args.io
      );
    } else {
      logger.info('[AIChatService] Tool execution disabled - filesystem:', !!args.filesystem, 'walletAddress:', !!args.walletAddress, 'tools:', tools?.length || 0);
    }

    // Call provider without tool execution
    try {
      logger.info('[AIChatService] Calling provider.complete:', {
        model: args.model,
        messageCount: normalizedMessages.length,
        hasTools: !!tools && tools.length > 0,
      });
      const result = await provider.complete(completeArgs);
      return result;
    } catch (error: any) {
      logger.error('[AIChatService] Completion error:', error);
      logger.error('[AIChatService] Completion error details:', {
        message: error?.message,
        name: error?.name,
        stack: error?.stack?.substring(0, 500),
      });
      throw error;
    }
  }

  /**
   * Execute AI completion with tool calling support
   * Since Ollama doesn't natively support function calling, we use a multi-turn approach:
   * 1. Include tools in system message as instructions
   * 2. Parse tool calls from AI response
   * 3. Execute tools and feed results back
   * 4. Continue until AI gives final response
   */
  private async executeWithTools(
    messages: any[],
    completeArgs: CompleteArguments,
    provider: OllamaProvider,
    tools: any[],
    filesystem: FilesystemManager,
    walletAddress: string,
    io?: any
  ): Promise<ChatCompletion> {
    const toolExecutor = new ToolExecutor(filesystem, walletAddress, io);
    const MAX_TOOL_ITERATIONS = 5; // Prevent infinite loops
    let iteration = 0;
    let currentMessages = [...messages];

    // Add system message with tool instructions
    const toolDescriptions = tools.map(t => {
      const fn = t.function;
      return `- ${fn.name}: ${fn.description || 'No description'}`;
    }).join('\n');

    const systemMessage = {
      role: 'system' as const,
      content: `You are a helpful AI assistant integrated into the ElastOS personal cloud operating system.

**PRIMARY MODE: Answer questions naturally with text**

For MOST user questions, you should respond directly with helpful text answers. Examples:
- "What is the capital of France?" → Answer: "The capital of France is Paris."
- "Explain quantum computing" → Provide a natural explanation
- "What's the weather like?" → Answer naturally (you don't have weather tools, so just explain that)
- Any general knowledge question → Answer directly with text

**SECONDARY MODE: Use tools ONLY for explicit filesystem operations**

ONLY when the user explicitly asks you to perform a filesystem operation (create folder, list files, read file, write file, move file, delete file, rename file, etc.), you MUST respond with ONLY a valid JSON object in this exact format:
{
  "tool_calls": [
    {
      "name": "tool_name",
      "arguments": { "param1": "value1", "param2": "value2" }
    }
  ]
}

Available filesystem tools (ONLY use these when user explicitly requests filesystem operations):
${toolDescriptions}

CRITICAL RULES FOR TOOL CALLS:
1. ONLY use tools when user explicitly requests filesystem operations (create, list, read, write, move, delete, rename files/folders)
2. For general questions, conversations, or information requests, respond with normal text - DO NOT use tools
3. The JSON must be valid. All tool calls must be in a SINGLE array. Do NOT create multiple arrays like [item1], [item2]. Use [item1, item2] instead.
4. Do NOT create duplicate tool calls. Each tool should be called only once.
5. For paths, use "~" for home directory (NOT "/~"). Examples: "~/Desktop/Projects" (correct), NOT "/~Desktop/Projects" (wrong).
6. When creating a folder, ALWAYS use the path format "~/Desktop/FolderName" where FolderName is the EXACT folder name from the user's request.

DO NOT provide instructions or explanations when making tool calls. Just output the JSON tool call.

Examples:
- User: "What is the capital of France?" → You: "The capital of France is Paris." (NO TOOLS - just text answer)
- User: "create a folder called Projects" → You: {"tool_calls": [{"name": "create_folder", "arguments": {"path": "~/Desktop/Projects"}}]} (USE TOOL)
- User: "list files in Desktop" → You: {"tool_calls": [{"name": "list_files", "arguments": {"path": "~/Desktop"}}]} (USE TOOL)

After I execute a tool, I will provide you with the result. Then you can respond to the user with the final answer.

**CRITICAL: Default to answering with text. Only use tools when the user explicitly requests filesystem operations.**`
    };

    // Clean conversation history: Remove old assistant messages with malformed tool calls
    // This prevents the model from repeating incorrect patterns
    const cleanedMessages: ChatMessage[] = [];
    for (let i = 0; i < currentMessages.length; i++) {
      const msg = currentMessages[i];
      if (msg.role === 'assistant' && typeof msg.content === 'string') {
        // Check if this is a malformed tool call (contains "/~Desktop/" or wrong folder names)
        const content = msg.content.toLowerCase();
        if (content.includes('/~desktop/') || content.includes('"/~')) {
          logger.warn('[AIChatService] Skipping malformed assistant message from history:', msg.content.substring(0, 100));
          continue; // Skip malformed messages
        }
      }
      cleanedMessages.push(msg);
    }
    currentMessages = cleanedMessages;
    
    // Insert system message at the beginning
    currentMessages.unshift(systemMessage);

    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;
      logger.info(`[AIChatService] Tool execution iteration ${iteration}`);

      // Call AI
      const aiArgs = { ...completeArgs, messages: currentMessages };
      const result = await provider.complete(aiArgs);
      const responseContent = result.message.content;

      // Check for native tool_calls in response (OpenAI-compatible format)
      let toolCalls: Array<{ name: string; arguments: any }> = [];
      
      if (result.message.tool_calls && Array.isArray(result.message.tool_calls)) {
        // Native tool_calls from OpenAI-compatible API
        logger.info('[AIChatService] Found native tool_calls in response:', result.message.tool_calls.length);
        toolCalls = result.message.tool_calls
          .map((tc: any) => {
            try {
              const args = JSON.parse(tc.function.arguments || '{}');
              
              // Normalize path arguments to fix malformed paths
              if (args.path && typeof args.path === 'string') {
                let path = args.path;
                // Fix "/~Desktop/" -> "~/Desktop/"
                if (path.startsWith('/~')) {
                  path = path.substring(1);
                }
                // Fix "/Desktop/" -> "~/Desktop/"
                if (path.startsWith('/Desktop/') && !path.startsWith('~/')) {
                  path = '~' + path;
                }
                // Fix "~FolderName" (missing /Desktop/) -> "~/Desktop/FolderName"
                if (path.startsWith('~') && !path.includes('/') && path.length > 1) {
                  const folderName = path.substring(1);
                  path = `~/Desktop/${folderName}`;
                }
                // Fix "FolderName" (no ~ at all) -> "~/Desktop/FolderName"
                if (!path.startsWith('~') && !path.startsWith('/') && !path.includes('/')) {
                  path = `~/Desktop/${path}`;
                }
                args.path = path;
              }
              
              return {
                name: tc.function.name,
                arguments: args
              };
            } catch (e) {
              logger.error('[AIChatService] Failed to parse tool call arguments:', e);
              return null;
            }
          })
          .filter((tc: any): tc is { name: string; arguments: any } => tc !== null);
      } else {
        // Fallback: Try to parse tool calls from text response (for models without native support)
        logger.info('[AIChatService] No native tool_calls, attempting to parse from text response');
        logger.info('[AIChatService] AI response content preview:', responseContent.substring(0, 200));
        toolCalls = this.parseToolCalls(responseContent);
      }
      
      // Deduplicate tool calls (remove exact duplicates)
      const seen = new Set<string>();
      const uniqueToolCalls = toolCalls.filter(tc => {
        const key = `${tc.name}:${JSON.stringify(tc.arguments)}`;
        if (seen.has(key)) {
          logger.warn('[AIChatService] Removing duplicate tool call:', key);
          return false;
        }
        seen.add(key);
        return true;
      });
      toolCalls = uniqueToolCalls;
      
      logger.info('[AIChatService] Final tool calls (after deduplication):', toolCalls.length, toolCalls);
      
      if (toolCalls.length === 0) {
        // No tool calls, return final response
        logger.info('[AIChatService] No tool calls detected, returning final response');
        return result;
      }

      // Execute tools
      logger.info(`[AIChatService] Executing ${toolCalls.length} tool call(s)`);
      const toolResults: any[] = [];

      for (const toolCall of toolCalls) {
        try {
          const executionResult = await toolExecutor.executeTool(
            toolCall.name,
            toolCall.arguments
          );
          toolResults.push({
            name: toolCall.name,
            result: executionResult
          });
          logger.info(`[AIChatService] Tool ${toolCall.name} executed:`, executionResult);
        } catch (error: any) {
          logger.error(`[AIChatService] Tool ${toolCall.name} execution failed:`, error);
          toolResults.push({
            name: toolCall.name,
            result: { success: false, error: error.message }
          });
        }
      }

      // Add AI response and tool results to conversation
      currentMessages.push({
        role: 'assistant',
        content: responseContent
      });

      // Add tool results as user message for next iteration
      const toolResultsText = toolResults.map(tr => 
        `Tool ${tr.name} result: ${JSON.stringify(tr.result)}`
      ).join('\n\n');

      currentMessages.push({
        role: 'user',
        content: `Tool execution results:\n\n${toolResultsText}\n\nPlease respond to the user based on these results.`
      });
    }

    // Max iterations reached, return last response
    logger.warn('[AIChatService] Max tool execution iterations reached');
    const finalArgs = { ...completeArgs, messages: currentMessages };
    return await provider.complete(finalArgs);
  }

  /**
   * Parse tool calls from AI response
   * Looks for JSON objects with tool_calls array
   * Also tries to infer tool calls from natural language if JSON parsing fails
   */
  private parseToolCalls(content: string): Array<{ name: string; arguments: any }> {
    const toolCalls: Array<{ name: string, arguments: any }> = [];

    // Normalize tool names (e.g., "createfolder" -> "create_folder")
    const normalizeToolName = (name: string): string => {
      const mappings: Record<string, string> = {
        'createfolder': 'create_folder',
        'listfiles': 'list_files',
        'readfile': 'read_file',
        'writefile': 'write_file',
        'deletefile': 'delete_file',
        'movefile': 'move_file',
      };
      return mappings[name.toLowerCase()] || name;
    };

    // First, try to find JSON in the response
    try {
      // Look for { "tool_calls": [...] } or { "toolcalls": [...] } pattern
      // Use a more robust approach: find the opening brace, then match balanced braces
      let jsonMatch = null;
      const toolCallsPattern = /"tool[_]?calls"\s*:\s*\[/i;
      const toolCallsIndex = content.search(toolCallsPattern);
      
      if (toolCallsIndex !== -1) {
        // Find the opening brace before "tool_calls"
        let startIndex = toolCallsIndex;
        while (startIndex > 0 && content[startIndex] !== '{') {
          startIndex--;
        }
        
        // Now find the matching closing brace
        let braceCount = 0;
        let endIndex = startIndex;
        for (let i = startIndex; i < content.length; i++) {
          if (content[i] === '{') braceCount++;
          if (content[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
              endIndex = i;
              break;
            }
          }
        }
        
        if (endIndex > startIndex) {
          jsonMatch = [content.substring(startIndex, endIndex + 1)];
        }
      }
      
      // Fallback to simple regex if balanced brace matching fails
      if (!jsonMatch) {
        jsonMatch = content.match(/\{[\s\S]*?"tool[_]?calls"[\s\S]*?\}/i);
      }
      
      if (jsonMatch) {
        let jsonStr = jsonMatch[0];
        logger.info('[AIChatService] parseToolCalls - Found JSON match:', jsonStr.substring(0, 200));
        
        // Try to fix common JSON malformations
        // Fix: [item], [item2] -> [item, item2]
        jsonStr = jsonStr.replace(/\]\s*,\s*\[/g, ', ');
        
        // Fix: multiple closing brackets
        jsonStr = jsonStr.replace(/\}\s*\]\s*\]\s*\}/g, '}]}');
        
        try {
          const parsed = JSON.parse(jsonStr);
          logger.info('[AIChatService] parseToolCalls - Parsed JSON successfully, looking for tool_calls');
          // Try both tool_calls and toolcalls (with/without underscore)
            const calls = parsed.tool_calls || parsed.toolcalls;
            logger.info('[AIChatService] parseToolCalls - Found calls:', calls ? calls.length : 0, calls);
            if (calls && Array.isArray(calls)) {
              logger.info('[AIChatService] parseToolCalls - Processing', calls.length, 'tool calls');
              for (const call of calls) {
                logger.info('[AIChatService] parseToolCalls - Processing call:', JSON.stringify(call));
                logger.info('[AIChatService] parseToolCalls - call.name:', call.name, 'call.arguments:', call.arguments, 'typeof arguments:', typeof call.arguments);
                
                // Handle arguments as string (JSON) or object
                let args = call.arguments;
                if (typeof args === 'string') {
                  try {
                    args = JSON.parse(args);
                    logger.info('[AIChatService] parseToolCalls - Parsed arguments string:', args);
                  } catch (e) {
                    logger.warn('[AIChatService] parseToolCalls - Failed to parse arguments string:', e);
                    continue;
                  }
                }
                
                if (call.name && args) {
                  // Normalize path arguments to fix malformed paths
                  if (args.path && typeof args.path === 'string') {
                    let path = call.arguments.path;
                    
                    // Fix "~:Desktop/" -> "~/Desktop/" (colon instead of slash)
                    path = path.replace(/~:/g, '~/');
                    
                    // Fix "~Desktop/" -> "~/Desktop/" (missing slash after ~)
                    if (path.startsWith('~Desktop/')) {
                      path = '~/' + path.substring(1); // Add slash after ~
                    }
                    
                    // Fix "/~Desktop/" -> "~/Desktop/"
                    if (path.startsWith('/~')) {
                      path = path.substring(1); // Remove leading slash
                    }
                    // Fix "/Desktop/" -> "~/Desktop/"
                    if (path.startsWith('/Desktop/') && !path.startsWith('~/')) {
                      path = '~' + path;
                    }
                    // Fix "~FolderName" (missing /Desktop/) -> "~/Desktop/FolderName"
                    // Only if it's a direct folder name without any slashes after ~
                    if (path.startsWith('~') && !path.includes('/') && path.length > 1) {
                      const folderName = path.substring(1); // Get folder name after ~
                      path = `~/Desktop/${folderName}`;
                    }
                    // Fix "FolderName" (no ~ at all) -> "~/Desktop/FolderName"
                    if (!path.startsWith('~') && !path.startsWith('/') && !path.includes('/')) {
                      path = `~/Desktop/${path}`;
                    }
                    
                    args.path = path;
                  }
                  
                  toolCalls.push({
                    name: normalizeToolName(call.name),
                    arguments: args
                  });
                  logger.info('[AIChatService] parseToolCalls - Added tool call:', normalizeToolName(call.name), args);
                } else {
                  logger.warn('[AIChatService] parseToolCalls - Skipping call - missing name or arguments. name:', call.name, 'arguments:', call.arguments);
                }
              }
              if (toolCalls.length > 0) {
                logger.info('[AIChatService] Successfully parsed tool calls from JSON:', toolCalls.length, toolCalls);
                return toolCalls;
              } else {
                logger.warn('[AIChatService] parseToolCalls - No tool calls extracted from parsed JSON. Calls array:', calls);
              }
            } else {
              logger.warn('[AIChatService] parseToolCalls - Calls is not an array:', typeof calls, calls);
            }
        } catch (parseError) {
          logger.warn('[AIChatService] JSON match found but parsing failed, trying to extract tool calls manually:', parseError);
          
          // Fallback: Try to extract tool calls manually from malformed JSON
          const toolCallMatches = jsonStr.matchAll(/\{"name":\s*"([^"]+)",\s*"arguments":\s*(\{[^}]+\})\}/g);
          for (const match of toolCallMatches) {
            try {
              const name = match[1];
              const argsStr = match[2];
              const arguments_ = JSON.parse(argsStr);
              toolCalls.push({
                name: normalizeToolName(name),
                arguments: arguments_
              });
            } catch (e) {
              logger.debug('[AIChatService] Failed to parse individual tool call:', e);
            }
          }
          
          if (toolCalls.length > 0) {
            logger.info('[AIChatService] Successfully extracted tool calls from malformed JSON');
            return toolCalls;
          }
        }
      }

      // Try to find any JSON object that might contain tool calls
      const allJsonMatches = content.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
      if (allJsonMatches) {
        for (const jsonStr of allJsonMatches) {
          try {
            const parsed = JSON.parse(jsonStr);
            // Try both tool_calls and toolcalls (with/without underscore)
            const calls = parsed.tool_calls || parsed.toolcalls;
            if (calls && Array.isArray(calls)) {
              for (const call of calls) {
                if (call.name && call.arguments) {
                  toolCalls.push({
                    name: normalizeToolName(call.name),
                    arguments: call.arguments
                  });
                }
              }
              if (toolCalls.length > 0) {
                logger.info('[AIChatService] Successfully parsed tool calls from alternative JSON');
                return toolCalls;
              }
            }
          } catch (e) {
            // Continue trying other matches
          }
        }
      }
    } catch (error) {
      logger.debug('[AIChatService] JSON parsing error:', error);
    }

    // If no JSON found, only try natural language inference if content is very short and clearly a tool request
    // This prevents false positives from long text responses
    const trimmedContent = content.trim();
    const lowerContent = trimmedContent.toLowerCase();
    
    // Only use natural language fallback if:
    // 1. Content is short (less than 200 chars) - likely a direct tool call, not a long explanation
    // 2. Contains clear tool request keywords
    // 3. Does NOT contain explanatory text like "here are", "follow these", "steps", etc.
    if (trimmedContent.length < 200 && 
        !lowerContent.includes('here are') && 
        !lowerContent.includes('follow these') && 
        !lowerContent.includes('steps') &&
        !lowerContent.includes('additional') &&
        lowerContent.includes('create') && 
        (lowerContent.includes('folder') || lowerContent.includes('directory'))) {
      
      const folderMatch = trimmedContent.match(/(?:folder|directory)\s+(?:called|named|with name)?\s*["']?([^"'\n]+)["']?/i);
      const pathMatch = trimmedContent.match(/(?:in|on|at)\s+(?:my\s+)?(desktop|documents|home|~)/i);
      
      if (folderMatch || pathMatch) {
        const folderName = folderMatch ? folderMatch[1].trim() : 'New Folder';
        // Clean up folder name - remove trailing punctuation and extra words
        const cleanFolderName = folderName.split(/[,\s]+/)[0].replace(/[.,;:!?]+$/, '');
        const basePath = pathMatch ? (pathMatch[1] === 'desktop' ? '~/Desktop' : pathMatch[1] === 'documents' ? '~/Documents' : '~') : '~';
        const fullPath = `${basePath}/${cleanFolderName}`;
        
        logger.info('[AIChatService] Inferred create_folder tool call from natural language');
        return [{
          name: 'create_folder',
          arguments: { path: fullPath }
        }];
      }
    }

    logger.debug('[AIChatService] No tool calls found in response');
    return toolCalls;
  }

  /**
   * Stream chat completion (for future use)
   */
  async *streamComplete(args: CompleteRequest): AsyncGenerator<ChatCompletion, void, unknown> {
    await this.ensureInitialized();

    if (this.providers.size === 0) {
      throw new Error('No AI providers available. Please ensure Ollama is installed and running.');
    }

    // Check if messages contain images
    const hasImages = this.hasImages(args.messages);
    if (hasImages && (!args.model || !args.model.toLowerCase().includes('llava') && !args.model.toLowerCase().includes('vision'))) {
      // Try to find a vision-capable model
      const visionModel = await this.findVisionModel();
      if (visionModel) {
        logger.info('[AIChatService] Images detected, switching to vision model:', visionModel);
        args.model = visionModel;
      } else {
        logger.warn('[AIChatService] Images detected but no vision-capable model found. Current model may not support vision:', args.model);
        logger.warn('[AIChatService] To use vision, install a vision model: ollama pull llava');
      }
    }

    const provider = this.getProviderForModel(args.model);
    if (!provider) {
      throw new Error(`No provider available for model: ${args.model || 'default'}`);
    }

    const normalizedMessages = normalizeMessages(args.messages);
    
    // Normalize tools if provided
    // If tools are requested and filesystem is available, automatically include filesystem tools
    logger.info('[AIChatService] streamComplete - Checking tools - args.tools:', args.tools, 'args.filesystem:', !!args.filesystem, 'args.walletAddress:', !!args.walletAddress);
    
    let tools = args.tools;
    if (tools && tools.length > 0) {
      tools = normalizeToolsObject([...tools]);
      logger.info('[AIChatService] streamComplete - Tools provided by user:', tools.length);
    } else if (args.filesystem && args.walletAddress) {
      // Automatically include filesystem tools if filesystem is available
      logger.info('[AIChatService] streamComplete - Auto-including filesystem tools - filesystemTools length:', filesystemTools.length);
      tools = normalizeToolsObject([...filesystemTools]);
      logger.info('[AIChatService] streamComplete - Automatically including filesystem tools:', tools.length);
    } else {
      logger.warn('[AIChatService] streamComplete - No tools available - filesystem:', !!args.filesystem, 'walletAddress:', !!args.walletAddress, 'args.tools:', args.tools);
    }
    
    logger.info('[AIChatService] streamComplete - Final tools count:', tools?.length || 0);
    
    const completeArgs: CompleteArguments = {
      messages: normalizedMessages as ChatMessage[],
      model: args.model,
      stream: true,
      tools: tools as any,
      max_tokens: args.max_tokens,
      temperature: args.temperature,
    };

    try {
      // If tools are available, we need to collect the full response to check for tool calls
      logger.info('[AIChatService] streamComplete - Tool execution check - tools:', tools?.length || 0, 'filesystem:', !!args.filesystem, 'walletAddress:', !!args.walletAddress, 'io:', !!args.io);
      if (tools && tools.length > 0 && args.filesystem && args.walletAddress) {
        // Collect the complete streamed response
        let fullContent = '';
        let toolCalls: any[] | undefined = undefined;
        let streamedChunks: ChatCompletion[] = [];
        
        for await (const chunk of provider.streamComplete(completeArgs)) {
          streamedChunks.push(chunk);
          
          // Accumulate content
          if (chunk.message?.content) {
            fullContent += chunk.message.content;
          }
          
          // Check for tool_calls in the chunk (if Ollama returns them in stream)
          if (chunk.message?.tool_calls) {
            toolCalls = chunk.message.tool_calls;
          }
          
          // DON'T yield tool call chunks - we'll yield final response after execution
          // Only yield if there are no tools (normal chat response)
          if (!tools || tools.length === 0) {
            yield chunk;
          }
        }
        
        // After stream completes, check if we have tool calls to execute
        // First check native tool_calls, then parse from content
        if (!toolCalls && fullContent && tools && tools.length > 0) {
          // Try to parse tool calls from the accumulated content
          logger.info('[AIChatService] streamComplete - No native tool_calls, parsing from content:', fullContent.substring(0, 200));
          const parsedToolCalls = this.parseToolCalls(fullContent);
          if (parsedToolCalls && parsedToolCalls.length > 0) {
            logger.info('[AIChatService] streamComplete - Parsed tool calls from content:', parsedToolCalls.length);
            // Convert parsed tool calls to the format expected by tool executor
            toolCalls = parsedToolCalls.map((tc, idx) => ({
              id: `call_${Date.now()}_${idx}`,
              type: 'function',
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments)
              }
            }));
          } else {
            logger.warn('[AIChatService] streamComplete - No tool calls parsed from content');
          }
        }
        
        if (toolCalls && toolCalls.length > 0) {
          logger.info('[AIChatService] streamComplete - Found tool calls, executing:', toolCalls.length, toolCalls);
          
          // Execute tools using the same logic as executeWithTools
          logger.info('[AIChatService] streamComplete - Creating ToolExecutor with io:', !!args.io, 'walletAddress:', args.walletAddress);
          const toolExecutor = new ToolExecutor(args.filesystem, args.walletAddress, args.io);
          const normalizedMessages = normalizeMessages(args.messages);
          
          // Add the assistant's message with tool calls to the conversation
          const assistantMessage: any = {
            role: 'assistant',
            content: fullContent,
            tool_calls: toolCalls
          };
          
          const updatedMessages = [...normalizedMessages, assistantMessage];
          
          // Execute each tool call
          const toolResults: any[] = [];
          for (const toolCall of toolCalls) {
            try {
              const args = typeof toolCall.function.arguments === 'string' 
                ? JSON.parse(toolCall.function.arguments) 
                : toolCall.function.arguments;
              
              // Normalize path if present
              if (args.path && typeof args.path === 'string') {
                let path = args.path;
                logger.info('[AIChatService] streamComplete - Original path:', path);
                
                // Fix "~:Desktop/" -> "~/Desktop/" (colon instead of slash)
                path = path.replace(/~:/g, '~/');
                
                // Fix "~Desktop/" -> "~/Desktop/" (missing slash after ~)
                if (path.startsWith('~Desktop/')) {
                  path = '~/' + path.substring(1); // Add slash after ~
                  logger.info('[AIChatService] streamComplete - Fixed path from ~Desktop/ to:', path);
                }
                
                if (path.startsWith('/~')) {
                  path = path.substring(1);
                }
                path = path.replace(/\/~/g, '/');
                if (path.startsWith('~') && !path.includes('/') && path.length > 1) {
                  const folderName = path.substring(1);
                  path = `~/Desktop/${folderName}`;
                  logger.info('[AIChatService] streamComplete - Fixed path from ~FolderName to:', path);
                }
                if (!path.startsWith('~') && !path.startsWith('/') && !path.includes('/')) {
                  path = `~/Desktop/${path}`;
                  logger.info('[AIChatService] streamComplete - Fixed path (no prefix) to:', path);
                }
                args.path = path;
                logger.info('[AIChatService] streamComplete - Normalized path:', path);
              }
              
              logger.info('[AIChatService] streamComplete - Executing tool:', toolCall.function.name, 'with args:', args);
              const result = await toolExecutor.executeTool(toolCall.function.name, args);
              logger.info('[AIChatService] streamComplete - Tool execution result:', result);
              toolResults.push({
                tool_call_id: toolCall.id,
                role: 'tool' as const,
                name: toolCall.function.name,
                content: JSON.stringify(result)
              });
            } catch (error: any) {
              logger.error('[AIChatService] streamComplete - Tool execution error:', error);
              toolResults.push({
                tool_call_id: toolCall.id,
                role: 'tool' as const,
                name: toolCall.function.name,
                content: JSON.stringify({ success: false, error: error.message })
              });
            }
          }
          
          // Add tool results to conversation and get final response
          const finalMessages = [...updatedMessages, ...toolResults];
          
          // Get final response from AI
          const finalArgs: CompleteArguments = {
            messages: finalMessages as ChatMessage[],
            model: args.model,
            stream: true,
            tools: undefined, // Don't pass tools again
            max_tokens: args.max_tokens,
            temperature: args.temperature,
          };
          
          // Stream the final response
          yield* provider.streamComplete(finalArgs);
        }
      } else {
        // No tools, just stream normally
        yield* provider.streamComplete(completeArgs);
      }
    } catch (error: any) {
      // Check if error is due to model not supporting tools
      const errorMessage = error?.message || '';
      const errorString = JSON.stringify(error);
      
      if ((errorMessage.includes('does not support tools') || 
           errorString.includes('does not support tools')) &&
          tools && tools.length > 0 && 
          args.filesystem && args.walletAddress) {
        // Model doesn't support tools, fall back to non-streaming mode with tool execution loop
        logger.warn('[AIChatService] Model does not support tools, falling back to non-streaming mode with natural language tool parsing');
        
        try {
          // Use complete() which has the tool execution loop that can parse natural language tool calls
          // Don't pass tools to the provider, but still pass filesystem/walletAddress so the tool execution loop can work
          const result = await this.complete({
            messages: args.messages,
            model: args.model,
            tools: undefined, // Don't pass tools to provider since it doesn't support them
            max_tokens: args.max_tokens,
            temperature: args.temperature,
            filesystem: args.filesystem,
            walletAddress: args.walletAddress,
            io: args.io, // CRITICAL: Pass io for WebSocket live updates
          });
          
          // Stream the result as if it were a streaming response
          // Just yield the complete result once to avoid garbled text
          yield {
            message: {
              role: result.message?.role || 'assistant',
              content: result.message?.content || '',
              tool_calls: result.message?.tool_calls,
            },
            done: true,
            usage: result.usage,
          };
          
          return;
        } catch (fallbackError: any) {
          logger.error('[AIChatService] Fallback to non-streaming also failed:', fallbackError);
          throw error; // Throw original error
        }
      }
      
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

