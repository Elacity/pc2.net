/**
 * AI Chat Service
 * Main service for handling AI chat completions
 * Supports multiple providers (Ollama default, cloud providers optional)
 */
import { logger } from '../../utils/logger.js';
import { OllamaProvider } from './providers/OllamaProvider.js';
import { ClaudeProvider } from './providers/ClaudeProvider.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { GeminiProvider } from './providers/GeminiProvider.js';
import { normalizeMessages } from './utils/Messages.js';
import { normalizeToolsObject } from './utils/FunctionCalling.js';
import { filesystemTools } from './tools/FilesystemTools.js';
import { ToolExecutor } from './tools/ToolExecutor.js';
export class AIChatService {
    providers = new Map();
    config;
    defaultProvider = 'ollama';
    initialized = false;
    db; // For loading user API keys
    constructor(config = {}, db) {
        this.config = config;
        this.defaultProvider = config.defaultProvider || 'ollama';
        this.db = db;
    }
    /**
     * Initialize the service and register providers
     */
    async initialize() {
        if (this.initialized) {
            return;
        }
        logger.info('[AIChatService] Initializing AI service...');
        // Register Ollama provider (default, auto-detected)
        if (this.config.providers?.ollama?.enabled !== false) {
            await this.registerOllamaProvider();
        }
        // Register cloud providers if API keys are provided
        // These will be registered per-user when they have API keys configured
        // For now, we register them globally if config has API keys (for backward compatibility)
        if (this.config.providers?.claude?.apiKey) {
            await this.registerClaudeProvider(this.config.providers.claude.apiKey);
        }
        if (this.config.providers?.openai?.apiKey) {
            await this.registerOpenAIProvider(this.config.providers.openai.apiKey);
        }
        // Gemini not in config yet, but will be registered per-user
        this.initialized = true;
        logger.info(`[AIChatService] Initialized with ${this.providers.size} provider(s): ${Array.from(this.providers.keys()).join(', ')}`);
    }
    /**
     * Register providers for a specific user (loads API keys from database)
     * This is called per-request to ensure user-specific API keys are used
     */
    async registerUserProviders(walletAddress) {
        if (!this.db) {
            logger.warn('[AIChatService] registerUserProviders: No database available');
            return; // No database, can't load user config
        }
        try {
            const userConfig = this.db.getAIConfig(walletAddress);
            logger.info(`[AIChatService] registerUserProviders: Loaded config for ${walletAddress.substring(0, 10)}...`, {
                hasConfig: !!userConfig,
                hasApiKeys: !!userConfig?.api_keys
            });
            if (!userConfig?.api_keys) {
                logger.info('[AIChatService] registerUserProviders: No API keys configured for user');
                return; // No API keys configured
            }
            const apiKeys = JSON.parse(userConfig.api_keys);
            logger.info('[AIChatService] registerUserProviders: Parsed API keys', {
                hasClaude: !!apiKeys.claude,
                hasOpenAI: !!apiKeys.openai,
                hasGemini: !!apiKeys.gemini,
                currentProviders: Array.from(this.providers.keys())
            });
            // Register Claude if API key exists (always re-register to ensure latest API key is used)
            if (apiKeys.claude) {
                logger.info('[AIChatService] registerUserProviders: Registering Claude provider...');
                await this.registerClaudeProvider(apiKeys.claude);
            }
            // Register OpenAI if API key exists
            if (apiKeys.openai) {
                logger.info('[AIChatService] registerUserProviders: Registering OpenAI provider...');
                await this.registerOpenAIProvider(apiKeys.openai);
            }
            // Register Gemini if API key exists
            if (apiKeys.gemini) {
                logger.info('[AIChatService] registerUserProviders: Registering Gemini provider...');
                await this.registerGeminiProvider(apiKeys.gemini);
            }
            logger.info(`[AIChatService] registerUserProviders: Complete. Registered providers: ${Array.from(this.providers.keys()).join(', ')}`);
        }
        catch (error) {
            logger.error('[AIChatService] Failed to register user providers:', error);
            logger.error('[AIChatService] Error details:', {
                message: error?.message,
                stack: error?.stack?.substring(0, 500)
            });
        }
    }
    /**
     * Register Claude provider
     */
    async registerClaudeProvider(apiKey) {
        try {
            logger.info('[AIChatService] registerClaudeProvider: Creating provider with API key (length:', apiKey?.length || 0, ')');
            const provider = new ClaudeProvider({ apiKey });
            logger.info('[AIChatService] registerClaudeProvider: Checking availability...');
            const isAvailable = await provider.isAvailable();
            logger.info('[AIChatService] registerClaudeProvider: Availability check result:', isAvailable);
            if (isAvailable) {
                this.providers.set('claude', provider);
                logger.info('[AIChatService] ✅ Claude provider registered successfully');
            }
            else {
                logger.warn('[AIChatService] ⚠️  Claude API not available (invalid API key or network error)');
                // Still register it - let the API call fail if key is invalid
                // This allows users to see the error rather than silently failing
                this.providers.set('claude', provider);
                logger.info('[AIChatService] ⚠️  Claude provider registered anyway (will fail on API call if key invalid)');
            }
        }
        catch (error) {
            logger.error('[AIChatService] ❌ Failed to register Claude provider:', error);
            logger.error('[AIChatService] Error details:', {
                message: error?.message,
                stack: error?.stack?.substring(0, 500)
            });
            // Don't throw - allow other providers to be registered
        }
    }
    /**
     * Register OpenAI provider
     */
    async registerOpenAIProvider(apiKey) {
        try {
            const provider = new OpenAIProvider({ apiKey });
            const isAvailable = await provider.isAvailable();
            if (isAvailable) {
                this.providers.set('openai', provider);
                logger.info('[AIChatService] ✅ OpenAI provider registered');
            }
            else {
                logger.warn('[AIChatService] ⚠️  OpenAI API not available (invalid API key or network error)');
            }
        }
        catch (error) {
            logger.warn('[AIChatService] ⚠️  Failed to register OpenAI provider:', error.message);
        }
    }
    /**
     * Register Gemini provider
     */
    async registerGeminiProvider(apiKey) {
        try {
            const provider = new GeminiProvider({ apiKey });
            const isAvailable = await provider.isAvailable();
            if (isAvailable) {
                this.providers.set('gemini', provider);
                logger.info('[AIChatService] ✅ Gemini provider registered');
            }
            else {
                logger.warn('[AIChatService] ⚠️  Gemini API not available (invalid API key or network error)');
            }
        }
        catch (error) {
            logger.warn('[AIChatService] ⚠️  Failed to register Gemini provider:', error.message);
        }
    }
    /**
     * Register Ollama provider (auto-detect if available)
     */
    async registerOllamaProvider() {
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
        }
        else {
            logger.warn('[AIChatService] ⚠️  Ollama not available (not running or not installed)');
        }
    }
    /**
     * Get available models from all providers
     */
    async listModels() {
        await this.ensureInitialized();
        const allModels = [];
        for (const provider of this.providers.values()) {
            try {
                const models = await provider.models();
                allModels.push(...models);
            }
            catch (error) {
                logger.error('[AIChatService] Error listing models from provider:', error);
            }
        }
        return allModels;
    }
    /**
     * List available model IDs
     */
    async listModelIds() {
        const models = await this.listModels();
        return models.map(m => m.id);
    }
    /**
     * List available providers
     */
    listProviders() {
        return Array.from(this.providers.keys());
    }
    /**
     * Get provider for a given model
     */
    getProviderForModel(model) {
        if (!model) {
            // Use default provider
            const provider = this.providers.get(this.defaultProvider);
            logger.info(`[AIChatService] No model specified, using default provider: ${this.defaultProvider}`);
            return provider || null;
        }
        // Check if model specifies provider (e.g., "ollama:deepseek-r1:1.5b")
        if (model.includes(':')) {
            const [providerName] = model.split(':');
            logger.info(`[AIChatService] Model specifies provider: "${providerName}" (from model: "${model}")`);
            logger.info(`[AIChatService] Available providers: ${Array.from(this.providers.keys()).join(', ')}`);
            const provider = this.providers.get(providerName);
            if (provider) {
                logger.info(`[AIChatService] ✅ Found provider "${providerName}", using it`);
                return provider;
            }
            else {
                logger.error(`[AIChatService] ❌ Provider "${providerName}" not found in registered providers!`);
                logger.error(`[AIChatService] ❌ Available providers: ${Array.from(this.providers.keys()).join(', ')}`);
                logger.error(`[AIChatService] ❌ Model: ${model}`);
                // Don't fallback to Ollama for cloud provider models - return null to throw error
                return null;
            }
        }
        // If model doesn't specify provider, fallback to default provider (Ollama)
        const defaultProvider = this.providers.get(this.defaultProvider);
        logger.info(`[AIChatService] No provider specified in model, using default: ${this.defaultProvider}`);
        return defaultProvider || null;
    }
    /**
     * Check if messages contain images
     */
    hasImages(messages) {
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
    async findVisionModel() {
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
    async complete(args) {
        await this.ensureInitialized();
        // Register user-specific providers if wallet address is provided
        if (args.walletAddress) {
            await this.registerUserProviders(args.walletAddress);
        }
        if (this.providers.size === 0) {
            throw new Error('No AI providers available. Please ensure Ollama is installed and running, or add API keys for cloud providers.');
        }
        // Check if messages contain images
        const hasImages = this.hasImages(args.messages);
        if (hasImages && (!args.model || !args.model.toLowerCase().includes('llava') && !args.model.toLowerCase().includes('vision'))) {
            // Try to find a vision-capable model
            const visionModel = await this.findVisionModel();
            if (visionModel) {
                logger.info('[AIChatService] Images detected, switching to vision model:', visionModel);
                args.model = visionModel;
            }
            else {
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
        }
        catch (normalizeError) {
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
        // Track tool sources: Map<toolName, { type: 'filesystem' | 'app', appInstanceID?: string }>
        const toolSourceMap = new Map();
        let tools = args.tools;
        if (tools && tools.length > 0) {
            // Tools from frontend may include source metadata
            // Extract source info and normalize tools
            const toolsWithSource = [];
            for (const tool of tools) {
                const toolName = tool.function?.name || tool.name;
                const source = tool.__source || { type: 'filesystem' };
                // Store source mapping
                if (toolName) {
                    toolSourceMap.set(toolName, source);
                }
                // Remove source metadata before normalizing (it's not part of tool definition)
                const cleanTool = { ...tool };
                delete cleanTool.__source;
                toolsWithSource.push(cleanTool);
            }
            tools = normalizeToolsObject([...toolsWithSource]);
            logger.info('[AIChatService] Tools provided by frontend:', tools.length, 'with sources:', Array.from(toolSourceMap.entries()).map(([name, source]) => `${name}:${source.type}`).join(', '));
        }
        else if (args.filesystem && args.walletAddress) {
            // Automatically include filesystem tools if filesystem is available
            // This allows AI to perform filesystem operations without explicit tool request
            logger.info('[AIChatService] Auto-including filesystem tools - filesystemTools length:', filesystemTools.length);
            tools = normalizeToolsObject([...filesystemTools]);
            // Mark all filesystem tools
            for (const tool of tools) {
                const toolName = tool.function?.name || tool.name;
                if (toolName) {
                    toolSourceMap.set(toolName, { type: 'filesystem' });
                }
            }
            logger.info('[AIChatService] Automatically including filesystem tools:', tools.length);
        }
        else {
            logger.warn('[AIChatService] No tools available - filesystem:', !!args.filesystem, 'walletAddress:', !!args.walletAddress, 'args.tools:', args.tools);
        }
        logger.info('[AIChatService] Final tools count:', tools?.length || 0);
        // Store toolSourceMap for use in executeWithTools
        args.toolSourceMap = toolSourceMap;
        // Get provider for the requested model
        const provider = this.getProviderForModel(args.model);
        if (!provider) {
            throw new Error(`No provider available for model: ${args.model || 'default'}`);
        }
        // Extract model name (remove provider prefix if present, e.g., "ollama:deepseek-r1:1.5b" -> "deepseek-r1:1.5b")
        let modelName = args.model || '';
        if (modelName.includes(':')) {
            // Split by first colon only - model name might contain colons (e.g., "deepseek-r1:1.5b")
            const parts = modelName.split(':');
            if (parts.length > 1) {
                // Remove provider prefix, keep rest as model name
                modelName = parts.slice(1).join(':');
            }
        }
        // Prepare completion arguments
        const completeArgs = {
            messages: normalizedMessages,
            model: modelName, // Pass just the model name to provider
            stream: args.stream,
            tools: tools,
            max_tokens: args.max_tokens,
            temperature: args.temperature,
        };
        // If tools are available and filesystem is provided, implement tool execution loop
        if (args.filesystem && args.walletAddress && tools && tools.length > 0) {
            logger.info('[AIChatService] Tool execution enabled - entering executeWithTools');
            return await this.executeWithTools(normalizedMessages, completeArgs, provider, tools, args.filesystem, args.walletAddress, args.io, args.toolSourceMap // Pass tool source map
            );
        }
        else {
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
        }
        catch (error) {
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
    async executeWithTools(messages, completeArgs, provider, tools, filesystem, walletAddress, io, toolSourceMap) {
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
            role: 'system',
            content: `You are a helpful AI assistant integrated into the ElastOS personal cloud operating system.

**REASONING MODE: Think and plan before acting**

When the user asks you to perform a task, think through what needs to be done and explain your plan before executing. This helps the user understand what you're doing and builds trust.

**For simple questions:** Answer directly with helpful text.
**For tasks requiring multiple steps:** Explain your plan first, then execute step by step.

Examples of good reasoning:
- "I'll create a folder called Projects on your desktop, then add a file called README.md inside it with 'Hello World'."
- "Let me first check what PDFs you have in your Desktop, then I'll organize them into a PDFs folder."
- "I'll search for files containing 'hello' in your Documents folder, then show you the results."

**PRIMARY MODE: Answer questions naturally with text**

For MOST user questions, you should respond directly with helpful text answers. Examples:
- "What is the capital of France?" → Answer: "The capital of France is Paris."
- "Explain quantum computing" → Provide a natural explanation
- "What's the weather like?" → Answer naturally (you don't have weather tools, so just explain that)
- Any general knowledge question → Answer directly with text

**SECONDARY MODE: Use tools for filesystem operations and queries**

**CRITICAL: When the user requests filesystem operations, you MUST use tools. DO NOT provide text-only responses. You MUST execute the tool call.**

Use tools when the user asks about or requests filesystem operations, including:
- **Creating files/folders** (e.g., "create a folder", "make a file", "put this into a file", "save to desktop", "create a txt file")
- **Writing files** (e.g., "write this to a file", "put this into a txt file", "save this as", "create a file with this content")
- **Editing existing files** (e.g., "edit the robert txt", "modify the story", "add bert to the file", "update the file to include X"). **CRITICAL:** When editing an existing file, you MUST: (1) First use read_file to read the current file content, (2) Then modify the content based on the user's request, (3) Finally use write_file to save the modified content back to the same path. **DO NOT** write new content without reading the existing file first - you will overwrite the file and lose the original content!
- **Generating content for files** (e.g., "add a text file with a story about X", "create a file that tells about Y", "write a file containing Z", "include inside it a story"). When asked to create content, GENERATE it yourself - write stories, descriptions, or any requested content.
- **Listing files** (e.g., "list files", "what files do I have", "show me files in Desktop")
- **Reading files** (e.g., "read this file", "show me the content of", "what's in this file")
- **Querying files** (e.g., "What PDFs do I have?", "What files are in Desktop?", "Show me all images")
- **Searching files** (e.g., "Search for text in a file", "Find files containing X")
- **Moving/deleting/renaming** files and folders

When you need to use tools:
1. **You can optionally explain your plan** in natural language (e.g., "I'll create a folder called Projects, then add a file inside it.")
2. **You MUST execute the tools** by responding with a valid JSON object in this exact format:
{
  "tool_calls": [
    {
      "name": "tool_name",
      "arguments": { "param1": "value1", "param2": "value2" }
    }
  ]
}

**IMPORTANT:** You can explain your plan in text BEFORE the JSON tool call. The explanation helps the user understand what you're doing.

Available filesystem tools (ONLY use these when user explicitly requests filesystem operations):
${toolDescriptions}

CRITICAL RULES FOR TOOL CALLS:
1. **MANDATORY TOOL USAGE**: When user requests filesystem operations, you MUST use tools. DO NOT provide text-only responses. Key phrases that REQUIRE tool usage:
   - "put into file", "save to file", "write to file", "create a file", "make a file", "add a file", "add a text file", "create a txt file", "include inside it" → MUST USE write_file
   - **"edit file", "modify file", "update file", "add to file", "change file", "edit the [filename]", "modify the [filename]" → MUST FIRST USE read_file, THEN modify content, THEN use write_file**
   - "create folder", "make folder", "new folder" → MUST USE create_folder
   - "list files", "what files", "show files", "files in" → MUST USE list_files
   - "read file", "show content", "what's in file" → MUST USE read_file
   - "delete", "remove file" → MUST USE delete_file
   - "move", "rename" → MUST USE move_file or rename
2. **NO TEXT-ONLY RESPONSES FOR FILESYSTEM OPERATIONS**: If the user asks you to create a file, write a file, or perform any filesystem operation, you MUST execute the tool. Providing the content as text is NOT sufficient - you must actually create the file using write_file.
3. For general questions, conversations, or information requests (NOT about files), respond with normal text - DO NOT use tools
3. The JSON must be valid. All tool calls must be in a SINGLE array. Do NOT create multiple arrays like [item1], [item2]. Use [item1, item2] instead.
4. Do NOT create duplicate tool calls. Each tool should be called only once.
5. For paths, use "~" for home directory (NOT "/~"). Examples: "~/Desktop/Projects" (correct), NOT "/~Desktop/Projects" (wrong).
6. When creating a folder, ALWAYS use the path format "~/Desktop/FolderName" where FolderName is the EXACT folder name from the user's request.
7. When searching for files by type (e.g., "What PDFs do I have?"), search multiple common directories: Desktop, Documents, Downloads, Pictures, Videos. Use multiple tool calls to search each directory.
8. CONTEXT AWARENESS: 
   - When user says "inside it", "in it", "inside that folder", etc., refer to the MOST RECENTLY CREATED FOLDER from the conversation history. Use the exact folder name and path from the previous tool execution result.
   - When user says "inside the folder [NAME]" or "in the folder [NAME]", use the specific folder name mentioned. For example, "inside the folder RED" means ~/Desktop/RED (or wherever RED was created).
   - When user says "add a new folder inside [FOLDER_NAME]", create a folder with a descriptive name (e.g., "NewFolder" or based on context) inside the specified folder.
   - ALWAYS check conversation history for folder paths. If a folder was created at ~/Desktop/RED, use that exact path.
9. MULTI-STEP TASKS: When user requests multiple operations (e.g., "add a new folder inside RED and add a txt file called WOAH"), break it down:
   - Step 1: Create the folder inside RED (e.g., create_folder at ~/Desktop/RED/NewFolder or ~/Desktop/RED/[descriptive_name])
   - Step 2: Create the file inside that new folder (e.g., write_file at ~/Desktop/RED/NewFolder/WOAH.txt)
   - Execute BOTH steps in sequence. Do NOT skip steps.
10. **EDITING EXISTING FILES - CRITICAL WORKFLOW**: When user asks to edit, modify, update, or add to an existing file (e.g., "edit the robert txt", "add bert to the file", "modify the story to include X", "add more about greg"):
   - **Step 1: ALWAYS read the file first** using read_file to get the current content
   - **Step 2: After reading, you MUST continue to the next iteration** - do NOT stop after reading!
   - **Step 3: Modify the content** - take the FULL original content from the read_file result, then add/modify based on the user's request (e.g., if user says "add greg", include ALL the original text PLUS the new content about greg)
   - **Step 4: Write the COMPLETE modified content back** using write_file with the SAME path - include BOTH the original content AND your modifications
   - **CRITICAL:** The write_file content must include the ENTIRE file - original content + modifications. Do NOT write only the new parts!
   - **Example workflow:**
     - User: "edit the robert txt to include bert" → You: "I'll read the current story, add Bert, then save it back." {"tool_calls": [{"name": "read_file", "arguments": {"path": "~/Desktop/Robert.txt"}}]}
     - After read_file returns: "The Legend of Robert the Dragon\nIn the misty peaks..."
     - Then you MUST continue: {"tool_calls": [{"name": "write_file", "arguments": {"path": "~/Desktop/Robert.txt", "content": "The Legend of Robert the Dragon\nIn the misty peaks... [ALL ORIGINAL TEXT] ... and Bert the bee was Robert's friend. [NEW CONTENT ADDED]"}}]}
   - **DO NOT** write new content without reading first - you will lose the original file content!
   - **DO NOT** stop after reading - you MUST continue and write the modified file!
11. CONTENT GENERATION: When asked to create content (e.g., "tell a story about X", "write about Y", "inside tell a story"), GENERATE the content yourself. Write creative, engaging stories, descriptions, or any requested content. Do NOT use placeholder text like "[story content]" - actually write the story!

**EXECUTION FORMAT:**
For multi-step tasks, you can explain your plan first, then provide the JSON tool call. For example:

"I'll create a folder called Projects on your desktop, then add a file called README.md inside it."
{"tool_calls": [{"name": "create_folder", "arguments": {"path": "~/Desktop/Projects"}}]}

After the tool executes and returns a result, you can then execute the next step:
{"tool_calls": [{"name": "write_file", "arguments": {"path": "~/Desktop/Projects/README.md", "content": "Hello World"}}]}

Examples:
- User: "What is the capital of France?" → You: "The capital of France is Paris." (NO TOOLS - just text answer)
- User: "create a folder called Projects" → You: "I'll create a folder called Projects on your desktop." {"tool_calls": [{"name": "create_folder", "arguments": {"path": "~/Desktop/Projects"}}]} (EXPLAIN PLAN, THEN USE TOOL)
- User: "create a folder called Projects, then add a file called README.md inside it" → You: "I'll create the Projects folder first, then add README.md inside it with some content." {"tool_calls": [{"name": "create_folder", "arguments": {"path": "~/Desktop/Projects"}}]} (After tool executes, continue with next step)
- User: "put this into a txt file on my desktop" → You: {"tool_calls": [{"name": "write_file", "arguments": {"path": "~/Desktop/file.txt", "content": "[use the content from the previous conversation - the text the user wants to save]"}}]} (USE TOOL - write_file. "this" refers to content from previous messages)
- User: "save this to a file called notes.txt" → You: {"tool_calls": [{"name": "write_file", "arguments": {"path": "~/Desktop/notes.txt", "content": "[use the actual content from previous messages]"}}]} (USE TOOL - write_file)
- User: "write the story to desktop/story.txt" → You: {"tool_calls": [{"name": "write_file", "arguments": {"path": "~/Desktop/story.txt", "content": "[use the actual story content from previous messages]"}}]} (USE TOOL - write_file)
- User: "save that to a file" → You: {"tool_calls": [{"name": "write_file", "arguments": {"path": "~/Desktop/file.txt", "content": "[use the content from the previous assistant message]"}}]} (USE TOOL - "that" refers to previous content)
- User: "add a text file inside it called wow and inside tell a story about a dinosaur" → You: {"tool_calls": [{"name": "write_file", "arguments": {"path": "~/Desktop/[FOLDER_NAME]/wow.txt", "content": "Once upon a time, in a land far away, there lived a magnificent dinosaur named Rex. Rex was a friendly Tyrannosaurus who loved to explore the ancient forests..."}}]} (USE TOOL - "inside it" refers to the most recently created folder, GENERATE the story content yourself)
- User: "create a file in that folder with a story about space" → You: {"tool_calls": [{"name": "write_file", "arguments": {"path": "~/Desktop/[FOLDER_NAME]/story.txt", "content": "In the vast expanse of the cosmos, stars twinkled like diamonds scattered across a velvet sky. A brave astronaut named Alex embarked on a journey..."}}]} (USE TOOL - "that folder" refers to previous folder, GENERATE the story)
- User: "add a new folder inside the folder RED and add a txt file called WOAH, but a story about the world inside of it" → You: I'll create a new folder inside RED, then add WOAH.txt with a story about the world. {"tool_calls": [{"name": "create_folder", "arguments": {"path": "~/Desktop/RED/NewFolder"}}, {"name": "write_file", "arguments": {"path": "~/Desktop/RED/NewFolder/WOAH.txt", "content": "Once upon a time, in a world filled with wonder and beauty, there existed a planet called Earth. Earth was home to countless species, diverse ecosystems, and billions of people living in harmony with nature. The world was a place of endless possibilities, where every sunrise brought new opportunities and every sunset marked the end of another day filled with experiences. Mountains reached toward the sky, oceans stretched to the horizon, and forests teemed with life. It was a world of infinite beauty and boundless potential..."}}]} (MULTI-STEP: Create folder FIRST at ~/Desktop/RED/NewFolder, then create file INSIDE that new folder at ~/Desktop/RED/NewFolder/WOAH.txt with generated story content. DO NOT create WOAH as a folder - WOAH is the FILE name)
- User: "list files in Desktop" → You: {"tool_calls": [{"name": "list_files", "arguments": {"path": "~/Desktop"}}]} (USE TOOL)
- User: "What PDFs do I have?" → You: {"tool_calls": [{"name": "list_files", "arguments": {"path": "~/Desktop", "file_type": "pdf", "detailed": true}}, {"name": "list_files", "arguments": {"path": "~/Documents", "file_type": "pdf", "detailed": true}}, {"name": "list_files", "arguments": {"path": "~/Downloads", "file_type": "pdf", "detailed": true}}]} (USE TOOL - search Desktop, Documents, and Downloads with file_type: "pdf")
- User: "What files are in my Desktop?" → You: {"tool_calls": [{"name": "list_files", "arguments": {"path": "~/Desktop"}}]} (USE TOOL)
- User: "edit the robert txt to include bert" → You: "I'll read the current story first, then add Bert to it." {"tool_calls": [{"name": "read_file", "arguments": {"path": "~/Desktop/Robert.txt"}}]} (After read_file returns content, modify it to include Bert, then use write_file to save)
- User: "add bert the bee to the story file" → You: "I'll read the story file, add Bert the bee, then save it." {"tool_calls": [{"name": "read_file", "arguments": {"path": "~/Desktop/[story_file_name].txt"}}]} (After reading, modify content, then write back)

After I execute a tool, I will provide you with the result. Then you can respond to the user with the final answer.

**IMPORTANT: When responding after tool execution, ALWAYS mention the exact path where files/folders were created. This helps with follow-up requests.**
Examples:
- After creating a folder at ~/Desktop/Projects, say: "I've created the folder 'Projects' at ~/Desktop/Projects."
- After creating a file at ~/Documents/notes.txt, say: "I've created the file 'notes.txt' at ~/Documents/notes.txt."
- When user says "inside it" or "in that folder" in a follow-up, use the exact path from your previous response.

**CRITICAL RULES FOR USING TOOL RESULTS:**
1. ALWAYS use the ACTUAL tool results provided - DO NOT make up, invent, or hallucinate data
2. If a tool returns empty results (no files found), say "No files found" - DO NOT create fake file lists
3. If a tool returns specific files, list the ACTUAL file names and paths from the results
4. DO NOT generate fake timestamps, file names, or descriptions
5. If tool results show "success: false" or an error, report the actual error to the user
6. Only use information that is explicitly provided in the tool execution results

**CRITICAL: Default to answering with text. Only use tools when the user explicitly requests filesystem operations.**`
        };
        // Clean conversation history: Remove old assistant messages with malformed tool calls
        // This prevents the model from repeating incorrect patterns
        const cleanedMessages = [];
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
            let toolCalls = [];
            if (result.message.tool_calls && Array.isArray(result.message.tool_calls)) {
                // Native tool_calls from OpenAI-compatible API
                logger.info('[AIChatService] Found native tool_calls in response:', result.message.tool_calls.length);
                toolCalls = result.message.tool_calls
                    .map((tc) => {
                    try {
                        let args = JSON.parse(tc.function.arguments || '{}');
                        // Fix: If properties are at top level of tool call, move them to arguments
                        // (This handles cases where AI puts file_type, detailed, etc. at wrong level)
                        const argumentProperties = ['file_type', 'detailed', 'show_hidden', 'human_readable'];
                        for (const prop of argumentProperties) {
                            if (tc[prop] !== undefined && args[prop] === undefined) {
                                args[prop] = tc[prop];
                                logger.info(`[AIChatService] Moved ${prop} from tool call top level to arguments`);
                            }
                        }
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
                    }
                    catch (e) {
                        logger.error('[AIChatService] Failed to parse tool call arguments:', e);
                        return null;
                    }
                })
                    .filter((tc) => tc !== null);
            }
            else {
                // Fallback: Try to parse tool calls from text response (for models without native support)
                logger.info('[AIChatService] No native tool_calls, attempting to parse from text response');
                logger.info('[AIChatService] AI response content preview:', responseContent.substring(0, 200));
                toolCalls = this.parseToolCalls(responseContent);
            }
            // Deduplicate tool calls (remove exact duplicates)
            const seen = new Set();
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
            // CRITICAL: Check if we executed read_file in THIS iteration (editing workflow)
            // We need to check the toolResults from the PREVIOUS iteration, not current messages
            const previousIterationHadReadFile = iteration > 1;
            let wasEditingFile = false;
            if (previousIterationHadReadFile) {
                // Look for read_file in the last user message (which contains tool results)
                const lastUserMessage = currentMessages.filter(m => m.role === 'user').pop();
                if (lastUserMessage && typeof lastUserMessage.content === 'string') {
                    wasEditingFile = lastUserMessage.content.includes('read_file') &&
                        lastUserMessage.content.includes('FILE EDITING WORKFLOW');
                }
            }
            if (toolCalls.length === 0) {
                // If we were editing a file and no tool calls, force continuation
                if (wasEditingFile && iteration < MAX_TOOL_ITERATIONS) {
                    logger.warn('[AIChatService] No tool calls after read_file - forcing continuation for file editing');
                    // Add a stronger instruction to continue
                    currentMessages.push({
                        role: 'user',
                        content: `**CRITICAL: You MUST continue the file editing workflow! You read the file but did not write it back. The user asked you to EDIT the file. You MUST execute write_file now with the modified content. Do NOT respond with text only - you MUST use tools!`
                    });
                    continue; // Continue loop instead of returning
                }
                // No tool calls, return final response
                logger.info('[AIChatService] No tool calls detected, returning final response');
                return result;
            }
            // Execute tools
            logger.info(`[AIChatService] Executing ${toolCalls.length} tool call(s)`);
            const toolResults = [];
            for (const toolCall of toolCalls) {
                try {
                    const executionResult = await toolExecutor.executeTool(toolCall.name, toolCall.arguments);
                    toolResults.push({
                        name: toolCall.name,
                        result: executionResult
                    });
                    logger.info(`[AIChatService] Tool ${toolCall.name} executed:`, executionResult);
                }
                catch (error) {
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
            const toolResultsText = toolResults.map(tr => `Tool ${tr.name} result: ${JSON.stringify(tr.result, null, 2)}`).join('\n\n');
            // Check if we just read a file - if so, instruct AI to continue with modification and write
            const hasReadFile = toolResults.some(tr => tr.name === 'read_file' && tr.result?.success);
            const readFileResult = hasReadFile ? toolResults.find(tr => tr.name === 'read_file' && tr.result?.success) : null;
            let continuationInstruction = '';
            if (hasReadFile && readFileResult) {
                // Extract the file path and content from the read_file result
                // Structure: { name: 'read_file', result: { success: true, result: { path, content } } }
                const fileData = readFileResult.result?.result || {};
                const filePath = fileData.path || '';
                const fileContent = fileData.content || '';
                const contentPreview = fileContent.substring(0, 200) + (fileContent.length > 200 ? '...' : '');
                continuationInstruction = `\n\n**CRITICAL - FILE EDITING WORKFLOW - YOU MUST CONTINUE:** 
You just read the file: ${filePath}
File content (first 200 chars): "${contentPreview}"

The user asked you to EDIT this file. You MUST now:
1. Take the FULL file content shown above (from the tool result)
2. Modify it based on the user's original request (e.g., "add greg", "include bert", etc.)
3. Use write_file to save the COMPLETE modified content back to the SAME path: ${filePath}

DO NOT stop here! DO NOT just report the file content! You MUST execute write_file with the modified content!

Example: {"tool_calls": [{"name": "write_file", "arguments": {"path": "${filePath}", "content": "[FULL ORIGINAL CONTENT] + [YOUR MODIFICATIONS]"}}]}`;
            }
            currentMessages.push({
                role: 'user',
                content: `Tool execution results:\n\n${toolResultsText}${continuationInstruction}\n\nCRITICAL: Use ONLY the actual data from these tool results. DO NOT make up, invent, or hallucinate any file names, timestamps, or descriptions. If the results show no files found, say "No files found". If the results show specific files, list ONLY those exact files with their actual names and paths.`
            });
            // If we read a file, we MUST continue - don't let the loop exit
            if (hasReadFile) {
                logger.info('[AIChatService] File was read - continuing loop to wait for write_file');
                continue; // Continue to next iteration to wait for write_file
            }
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
    parseToolCalls(content) {
        const toolCalls = [];
        // Normalize tool names (e.g., "createfolder" -> "create_folder")
        const normalizeToolName = (name) => {
            const mappings = {
                'createfolder': 'create_folder',
                'listfiles': 'list_files',
                'readfile': 'read_file',
                'writefile': 'write_file',
                'deletefile': 'delete_file',
                'movefile': 'move_file',
                'copyfile': 'copy_file',
                'grepfile': 'grep_file',
                'readfilelines': 'read_file_lines',
                'countfile': 'count_file',
                'getfilename': 'get_filename',
                'getdirectory': 'get_directory',
                'touchfile': 'touch_file',
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
                // IMPORTANT: Account for string literals - don't count braces inside strings
                let braceCount = 0;
                let endIndex = startIndex;
                let inString = false;
                let escapeNext = false;
                for (let i = startIndex; i < content.length; i++) {
                    const char = content[i];
                    if (escapeNext) {
                        escapeNext = false;
                        continue;
                    }
                    if (char === '\\') {
                        escapeNext = true;
                        continue;
                    }
                    if (char === '"') {
                        inString = !inString;
                        continue;
                    }
                    // Only count braces when NOT inside a string
                    if (!inString) {
                        if (char === '{')
                            braceCount++;
                        if (char === '}') {
                            braceCount--;
                            if (braceCount === 0) {
                                endIndex = i;
                                break;
                            }
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
                            let args = call.arguments || {};
                            if (typeof args === 'string') {
                                try {
                                    args = JSON.parse(args);
                                    logger.info('[AIChatService] parseToolCalls - Parsed arguments string:', args);
                                }
                                catch (e) {
                                    logger.warn('[AIChatService] parseToolCalls - Failed to parse arguments string:', e);
                                    args = {};
                                }
                            }
                            // Fix: If file_type, detailed, show_hidden, etc. are at top level, move them to arguments
                            const argumentProperties = ['file_type', 'detailed', 'show_hidden', 'human_readable', 'create_parents', 'recursive', 'case_sensitive', 'first', 'last', 'range', 'pattern', 'content', 'mime_type', 'from_path', 'to_path', 'new_name'];
                            for (const prop of argumentProperties) {
                                if (call[prop] !== undefined && args[prop] === undefined) {
                                    args[prop] = call[prop];
                                    logger.info(`[AIChatService] parseToolCalls - Moved ${prop} from top level to arguments`);
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
                            }
                            else {
                                logger.warn('[AIChatService] parseToolCalls - Skipping call - missing name or arguments. name:', call.name, 'arguments:', call.arguments);
                            }
                        }
                        if (toolCalls.length > 0) {
                            logger.info('[AIChatService] Successfully parsed tool calls from JSON:', toolCalls.length, toolCalls);
                            return toolCalls;
                        }
                        else {
                            logger.warn('[AIChatService] parseToolCalls - No tool calls extracted from parsed JSON. Calls array:', calls);
                        }
                    }
                    else {
                        logger.warn('[AIChatService] parseToolCalls - Calls is not an array:', typeof calls, calls);
                    }
                }
                catch (parseError) {
                    logger.warn('[AIChatService] JSON match found but parsing failed, trying to extract tool calls manually:', parseError?.message || parseError);
                    logger.warn('[AIChatService] JSON string length:', jsonStr.length, 'First 500 chars:', jsonStr.substring(0, 500));
                    // Try to fix common JSON issues
                    let fixedJson = jsonStr;
                    // Fix unescaped quotes in content strings (common issue with AI-generated JSON)
                    // Replace unescaped quotes inside content values, but preserve escaped quotes
                    fixedJson = fixedJson.replace(/"content":\s*"([^"]*(?:\\.[^"]*)*)"/g, (match, content) => {
                        // If content has unescaped quotes, escape them
                        const escaped = content.replace(/(?<!\\)"/g, '\\"');
                        return `"content": "${escaped}"`;
                    });
                    // Try parsing the fixed JSON
                    try {
                        const parsed = JSON.parse(fixedJson);
                        const calls = parsed.tool_calls || parsed.toolcalls;
                        if (calls && Array.isArray(calls)) {
                            for (const call of calls) {
                                let args = call.arguments || {};
                                if (typeof args === 'string') {
                                    try {
                                        args = JSON.parse(args);
                                    }
                                    catch (e) {
                                        logger.warn('[AIChatService] Failed to parse arguments string:', e);
                                        args = {};
                                    }
                                }
                                if (call.name && args) {
                                    toolCalls.push({
                                        name: normalizeToolName(call.name),
                                        arguments: args
                                    });
                                }
                            }
                            if (toolCalls.length > 0) {
                                logger.info('[AIChatService] Successfully parsed tool calls from fixed JSON:', toolCalls.length);
                                return toolCalls;
                            }
                        }
                    }
                    catch (fixError) {
                        logger.warn('[AIChatService] Fixed JSON also failed to parse:', fixError?.message || fixError);
                    }
                    // Last resort: Try to extract using balanced brace matching for arguments
                    const nameMatch = jsonStr.match(/"name":\s*"([^"]+)"/);
                    if (nameMatch) {
                        const toolName = nameMatch[1];
                        const argsStart = jsonStr.indexOf('"arguments":');
                        if (argsStart !== -1) {
                            // Find the opening brace after "arguments":
                            let braceStart = argsStart;
                            while (braceStart < jsonStr.length && jsonStr[braceStart] !== '{') {
                                braceStart++;
                            }
                            // Find matching closing brace
                            let braceCount = 0;
                            let braceEnd = braceStart;
                            for (let i = braceStart; i < jsonStr.length; i++) {
                                if (jsonStr[i] === '{')
                                    braceCount++;
                                if (jsonStr[i] === '}') {
                                    braceCount--;
                                    if (braceCount === 0) {
                                        braceEnd = i;
                                        break;
                                    }
                                }
                            }
                            if (braceEnd > braceStart) {
                                const argsStr = jsonStr.substring(braceStart, braceEnd + 1);
                                try {
                                    const args = JSON.parse(argsStr);
                                    toolCalls.push({
                                        name: normalizeToolName(toolName),
                                        arguments: args
                                    });
                                    logger.info('[AIChatService] Successfully extracted tool call using balanced brace matching');
                                    return toolCalls;
                                }
                                catch (e) {
                                    logger.warn('[AIChatService] Failed to parse arguments using balanced braces:', e?.message || e);
                                }
                            }
                        }
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
                    }
                    catch (e) {
                        // Continue trying other matches
                    }
                }
            }
        }
        catch (error) {
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
    async *streamComplete(args) {
        await this.ensureInitialized();
        // Register user-specific providers if wallet address is provided
        if (args.walletAddress) {
            await this.registerUserProviders(args.walletAddress);
        }
        if (this.providers.size === 0) {
            throw new Error('No AI providers available. Please ensure Ollama is installed and running, or add API keys for cloud providers.');
        }
        // Get provider for model BEFORE checking images (need provider to determine vision support)
        // But first, extract provider name from model to ensure it's registered
        let requestedProvider = this.defaultProvider;
        if (args.model && args.model.includes(':')) {
            const [providerName] = args.model.split(':');
            requestedProvider = providerName;
            logger.info(`[AIChatService] streamComplete - Model specifies provider: "${providerName}"`);
        }
        // Ensure the requested provider is registered (especially for user-specific API keys)
        if (requestedProvider !== 'ollama' && args.walletAddress) {
            await this.registerUserProviders(args.walletAddress);
        }
        // Check if messages contain images
        const hasImages = this.hasImages(args.messages);
        if (hasImages && (!args.model || !args.model.toLowerCase().includes('llava') && !args.model.toLowerCase().includes('vision'))) {
            // Try to find a vision-capable model
            const visionModel = await this.findVisionModel();
            if (visionModel) {
                logger.info('[AIChatService] Images detected, switching to vision model:', visionModel);
                args.model = visionModel;
            }
            else {
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
        // Track tool sources: Map<toolName, { type: 'filesystem' | 'app', appInstanceID?: string }>
        const toolSourceMap = new Map();
        let tools = args.tools;
        // Check if tools is provided and not empty
        if (tools && Array.isArray(tools) && tools.length > 0) {
            // Tools from frontend may include source metadata
            const toolsWithSource = [];
            for (const tool of tools) {
                const toolName = tool.function?.name || tool.name;
                const source = tool.__source || { type: 'filesystem' };
                // Store source mapping
                if (toolName) {
                    toolSourceMap.set(toolName, source);
                }
                // Remove source metadata before normalizing
                const cleanTool = { ...tool };
                delete cleanTool.__source;
                toolsWithSource.push(cleanTool);
            }
            tools = normalizeToolsObject([...toolsWithSource]);
            logger.info('[AIChatService] streamComplete - Tools provided by frontend:', tools.length, 'with sources:', Array.from(toolSourceMap.entries()).map(([name, source]) => `${name}:${source.type}`).join(', '));
        }
        else if (args.filesystem && args.walletAddress) {
            // CRITICAL: Auto-inject filesystem tools when no tools provided
            // This ensures AI always has filesystem tools available
            logger.info('[AIChatService] streamComplete - ✅ Auto-including filesystem tools - filesystemTools length:', filesystemTools.length);
            logger.info('[AIChatService] streamComplete - filesystem available:', !!args.filesystem, 'walletAddress:', args.walletAddress?.substring(0, 10) + '...');
            tools = normalizeToolsObject([...filesystemTools]);
            // Mark all filesystem tools
            for (const tool of tools) {
                const toolName = tool.function?.name || tool.name;
                if (toolName) {
                    toolSourceMap.set(toolName, { type: 'filesystem' });
                }
            }
            logger.info('[AIChatService] streamComplete - ✅ Automatically included', tools.length, 'filesystem tools');
        }
        else {
            logger.error('[AIChatService] streamComplete - ⚠️ CRITICAL: No tools available!');
            logger.error('[AIChatService] streamComplete - filesystem:', !!args.filesystem, 'walletAddress:', !!args.walletAddress, 'args.tools:', args.tools);
            logger.error('[AIChatService] streamComplete - AI will NOT be able to execute filesystem operations');
            tools = undefined; // Explicitly set to undefined
        }
        logger.info('[AIChatService] streamComplete - Final tools count:', tools?.length || 0);
        // Store toolSourceMap for use in tool execution
        args.toolSourceMap = toolSourceMap;
        // Extract model name (remove provider prefix if present, e.g., "ollama:deepseek-r1:1.5b" -> "deepseek-r1:1.5b")
        let modelName = args.model || '';
        if (modelName.includes(':')) {
            // Split by first colon only - model name might contain colons (e.g., "deepseek-r1:1.5b")
            const parts = modelName.split(':');
            if (parts.length > 1) {
                // Remove provider prefix, keep rest as model name
                modelName = parts.slice(1).join(':');
            }
        }
        const completeArgs = {
            messages: normalizedMessages,
            model: modelName, // Pass just the model name to provider
            stream: true,
            tools: tools,
            max_tokens: args.max_tokens,
            temperature: args.temperature,
        };
        // If tools are available, we need to collect the full response to check for tool calls
        logger.info('[AIChatService] streamComplete - Tool execution check - tools:', tools?.length || 0, 'filesystem:', !!args.filesystem, 'walletAddress:', !!args.walletAddress, 'io:', !!args.io);
        try {
            if (tools && tools.length > 0 && args.filesystem && args.walletAddress) {
                // Collect the complete streamed response while also streaming chunks
                let fullContent = '';
                let toolCalls = []; // Accumulate all tool calls across chunks
                let streamedChunks = [];
                let hasToolCalls = false;
                for await (const chunk of provider.streamComplete(completeArgs)) {
                    streamedChunks.push(chunk);
                    // Accumulate content
                    if (chunk.message?.content) {
                        fullContent += chunk.message.content;
                    }
                    // Accumulate tool_calls from chunks (Claude yields them incrementally)
                    if (chunk.message?.tool_calls && Array.isArray(chunk.message.tool_calls)) {
                        // Merge new tool calls with existing ones (avoid duplicates by ID)
                        for (const newToolCall of chunk.message.tool_calls) {
                            const existingIndex = toolCalls.findIndex(tc => tc.id === newToolCall.id);
                            if (existingIndex >= 0) {
                                // Update existing tool call (arguments might have been updated)
                                toolCalls[existingIndex] = newToolCall;
                                logger.debug('[AIChatService] streamComplete - Updated existing tool call:', newToolCall.function?.name);
                            }
                            else {
                                // Add new tool call
                                toolCalls.push(newToolCall);
                                logger.debug('[AIChatService] streamComplete - Added new tool call:', newToolCall.function?.name);
                            }
                        }
                        hasToolCalls = true;
                        logger.info('[AIChatService] streamComplete - Accumulated tool calls so far:', toolCalls.length, toolCalls.map(tc => tc.function?.name));
                    }
                    // ALWAYS yield chunks for streaming, even when tools are available
                    // This allows the user to see the response in real-time
                    // If tool calls are detected later, we'll execute them and stream the final response
                    yield chunk;
                }
                // After stream completes, check if we have tool calls to execute
                // First check native tool_calls, then parse from content
                if (toolCalls.length === 0 && fullContent && tools && tools.length > 0) {
                    // Try to parse tool calls from the accumulated content
                    logger.info('[AIChatService] streamComplete - No native tool_calls, parsing from content. Full content length:', fullContent.length);
                    logger.info('[AIChatService] streamComplete - Full content preview (first 1000 chars):', fullContent.substring(0, 1000));
                    const parsedToolCalls = this.parseToolCalls(fullContent);
                    if (parsedToolCalls && parsedToolCalls.length > 0) {
                        logger.info('[AIChatService] streamComplete - ✅ Parsed', parsedToolCalls.length, 'tool calls from content');
                        for (const tc of parsedToolCalls) {
                            logger.info('[AIChatService] streamComplete - Tool call:', {
                                name: tc.name,
                                hasContent: !!tc.arguments?.content,
                                contentLength: tc.arguments?.content?.length || 0,
                                contentPreview: tc.arguments?.content ? tc.arguments.content.substring(0, 200) : 'NO CONTENT',
                                allArgs: Object.keys(tc.arguments || {})
                            });
                        }
                        // Convert parsed tool calls to the format expected by tool executor
                        toolCalls = parsedToolCalls.map((tc, idx) => ({
                            id: `call_${Date.now()}_${idx}`,
                            type: 'function',
                            function: {
                                name: tc.name,
                                arguments: JSON.stringify(tc.arguments)
                            }
                        }));
                    }
                    else {
                        logger.warn('[AIChatService] streamComplete - ⚠️ No tool calls parsed from content');
                        logger.warn('[AIChatService] streamComplete - Content that failed to parse:', fullContent.substring(0, 1000));
                    }
                }
                if (toolCalls && toolCalls.length > 0) {
                    logger.info('[AIChatService] streamComplete - Found tool calls, executing:', toolCalls.length, toolCalls);
                    // Get tool source map
                    const toolSourceMap = args.toolSourceMap || new Map();
                    // Separate filesystem tools from app tools
                    const filesystemToolCalls = [];
                    const appToolCalls = [];
                    for (const toolCall of toolCalls) {
                        const toolName = toolCall.function?.name;
                        const source = toolSourceMap.get(toolName);
                        if (source?.type === 'app' && source.appInstanceID) {
                            appToolCalls.push({ ...toolCall, __source: source });
                        }
                        else {
                            filesystemToolCalls.push(toolCall);
                        }
                    }
                    logger.info('[AIChatService] streamComplete - Tool separation:', {
                        filesystem: filesystemToolCalls.length,
                        app: appToolCalls.length,
                        total: toolCalls.length
                    });
                    // For app tools, yield them with source info so frontend can handle them
                    // For filesystem tools, execute them here
                    if (appToolCalls.length > 0) {
                        // Yield app tool calls with source info
                        for (const toolCall of appToolCalls) {
                            const args = typeof toolCall.function.arguments === 'string'
                                ? JSON.parse(toolCall.function.arguments)
                                : toolCall.function.arguments;
                            yield {
                                message: {
                                    role: 'assistant',
                                    content: '',
                                    tool_calls: [{
                                            ...toolCall,
                                            __source: toolCall.__source
                                        }]
                                },
                                done: false
                            };
                        }
                    }
                    // Execute filesystem tools using ToolExecutor
                    if (filesystemToolCalls.length > 0) {
                        logger.info('[AIChatService] streamComplete - Creating ToolExecutor with io:', !!args.io, 'walletAddress:', args.walletAddress);
                        const toolExecutor = new ToolExecutor(args.filesystem, args.walletAddress, args.io);
                        const normalizedMessages = normalizeMessages(args.messages);
                        // Add the assistant's message with filesystem tool calls to the conversation
                        const assistantMessage = {
                            role: 'assistant',
                            content: fullContent,
                            tool_calls: filesystemToolCalls
                        };
                        const updatedMessages = [...normalizedMessages, assistantMessage];
                        // Check if user mentioned a specific directory in their request
                        const userMessage = args.messages.find((m) => m.role === 'user');
                        let userText = '';
                        if (userMessage?.content) {
                            if (typeof userMessage.content === 'string') {
                                userText = userMessage.content;
                            }
                            else if (Array.isArray(userMessage.content)) {
                                // Extract text from multimodal content
                                userText = userMessage.content
                                    .filter((c) => c.type === 'text' && c.text)
                                    .map((c) => c.text)
                                    .join(' ');
                            }
                        }
                        // Detect which directory the user mentioned (desktop, documents, pictures, videos, music, downloads, public, home)
                        const directoryMatch = userText.match(/(?:on|in|at)\s+(?:my\s+)?(desktop|documents|pictures|videos|music|downloads|public|home|~)/i);
                        const mentionedDirectory = directoryMatch ? directoryMatch[1].toLowerCase() : null;
                        // Normalize directory name (capitalize first letter)
                        const targetDirectory = mentionedDirectory
                            ? mentionedDirectory.charAt(0).toUpperCase() + mentionedDirectory.slice(1)
                            : null;
                        // Execute each filesystem tool call
                        const toolResults = [];
                        for (const toolCall of filesystemToolCalls) {
                            try {
                                const args = typeof toolCall.function.arguments === 'string'
                                    ? JSON.parse(toolCall.function.arguments)
                                    : toolCall.function.arguments;
                                // Normalize path if present
                                if (args.path && typeof args.path === 'string') {
                                    let path = args.path;
                                    logger.info('[AIChatService] streamComplete - Original path:', path, 'User mentioned directory:', targetDirectory);
                                    // If user mentioned a specific directory but path is just ~/FolderName (missing directory), fix it
                                    if (targetDirectory && path.match(/^~\/[^\/]+$/)) {
                                        // Path is like ~/555 (home-level folder, missing target directory)
                                        const folderName = path.substring(2); // Remove ~/
                                        // Handle "home" or "~" as special case - keep it at home level
                                        if (targetDirectory.toLowerCase() === 'home' || targetDirectory === '~') {
                                            // Keep at home level, don't change
                                            logger.info('[AIChatService] streamComplete - User mentioned home, keeping path at home level:', path);
                                        }
                                        else {
                                            path = `~/${targetDirectory}/${folderName}`;
                                            logger.info('[AIChatService] streamComplete - Fixed path from home to', targetDirectory, '(user mentioned directory):', args.path, '->', path);
                                        }
                                    }
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
                                    // If user mentioned a specific directory but path is just ~/FolderName (missing directory), fix it
                                    if (targetDirectory && path.match(/^~\/[^\/]+$/)) {
                                        // Path is like ~/555 (home-level folder, missing target directory)
                                        const folderName = path.substring(2); // Remove ~/
                                        // Handle "home" or "~" as special case - keep it at home level
                                        if (targetDirectory.toLowerCase() === 'home' || targetDirectory === '~') {
                                            // Keep at home level, don't change
                                            logger.info('[AIChatService] streamComplete - User mentioned home, keeping path at home level:', path);
                                        }
                                        else {
                                            path = `~/${targetDirectory}/${folderName}`;
                                            logger.info('[AIChatService] streamComplete - Fixed path from home to', targetDirectory, '(user mentioned directory):', args.path, '->', path);
                                        }
                                    }
                                    if (path.startsWith('~') && !path.includes('/') && path.length > 1) {
                                        const folderName = path.substring(1);
                                        path = `~/Desktop/${folderName}`;
                                        logger.info('[AIChatService] streamComplete - Fixed path from ~FolderName to:', path);
                                    }
                                    // Fix paths like "desktop/YO", "Desktop/YO", "documents/Projects", etc. (case-insensitive)
                                    // Normalize to "~/Desktop/YO", "~/Documents/Projects", etc.
                                    const standardDirPattern = /^(desktop|documents|pictures|videos|music|downloads|public|trash)\/(.+)$/i;
                                    const dirMatch = path.match(standardDirPattern);
                                    if (dirMatch && !path.startsWith('~') && !path.startsWith('/')) {
                                        const dirName = dirMatch[1].charAt(0).toUpperCase() + dirMatch[1].slice(1).toLowerCase(); // Capitalize first letter
                                        const rest = dirMatch[2];
                                        path = `~/${dirName}/${rest}`;
                                        logger.info('[AIChatService] streamComplete - Fixed path (standard directory) from:', args.path, 'to:', path);
                                    }
                                    if (!path.startsWith('~') && !path.startsWith('/') && !path.includes('/')) {
                                        path = `~/Desktop/${path}`;
                                        logger.info('[AIChatService] streamComplete - Fixed path (no prefix) to:', path);
                                    }
                                    args.path = path;
                                    logger.info('[AIChatService] streamComplete - Normalized path:', path);
                                }
                                logger.info('[AIChatService] streamComplete - Executing tool:', toolCall.function.name, 'with args:', JSON.stringify(args, null, 2));
                                if (toolCall.function.name === 'write_file' && args.content) {
                                    logger.info('[AIChatService] streamComplete - write_file content length:', args.content.length, 'preview:', args.content.substring(0, 100));
                                }
                                const result = await toolExecutor.executeTool(toolCall.function.name, args);
                                logger.info('[AIChatService] streamComplete - Tool execution result:', JSON.stringify(result, null, 2));
                                toolResults.push({
                                    tool_call_id: toolCall.id,
                                    role: 'tool',
                                    name: toolCall.function.name,
                                    content: JSON.stringify(result)
                                });
                            }
                            catch (error) {
                                logger.error('[AIChatService] streamComplete - Tool execution error:', error);
                                toolResults.push({
                                    tool_call_id: toolCall.id,
                                    role: 'tool',
                                    name: toolCall.function.name,
                                    content: JSON.stringify({ success: false, error: error.message })
                                });
                            }
                        }
                        // Add tool results to conversation and get final response
                        const finalMessages = [...updatedMessages, ...toolResults];
                        // Build tool summary for context (this will be included in the AI's response)
                        const toolSummary = toolResults.map(tr => {
                            try {
                                const result = JSON.parse(tr.content);
                                if (tr.name === 'create_folder' && result.success && result.result?.path) {
                                    return `Created folder: ${result.result.path}`;
                                }
                                else if (tr.name === 'write_file' && result.success && result.result?.path) {
                                    return `Created file: ${result.result.path}`;
                                }
                                else if (tr.name === 'list_files' && result.success) {
                                    return `Listed files in: ${result.result?.path || 'directory'}`;
                                }
                                else if (tr.name === 'read_file' && result.success) {
                                    return `Read file: ${result.result?.path || 'file'}`;
                                }
                            }
                            catch (e) {
                                // Ignore parse errors
                            }
                            return null;
                        }).filter(Boolean).join(', ');
                        // Add context message that will be included in the AI's response
                        if (toolSummary) {
                            const contextMessage = {
                                role: 'user',
                                content: `Tool execution completed. Results: ${toolSummary}. Please confirm what was created and ALWAYS mention the exact paths in your response. When the user says "inside it", "in that folder", or similar in follow-up requests, they are referring to the most recently created folder/file. Your response will be saved to conversation history, so make sure to include the paths clearly.`
                            };
                            finalMessages.push(contextMessage);
                        }
                        const finalArgs = {
                            messages: finalMessages,
                            model: args.model,
                            stream: true,
                            tools: undefined, // Don't pass tools again
                            max_tokens: args.max_tokens,
                            temperature: args.temperature,
                        };
                        // Stream the final response (AI will see tool results and context message)
                        yield* provider.streamComplete(finalArgs);
                    }
                }
            }
            else {
                // No tools, just stream normally
                yield* provider.streamComplete(completeArgs);
            }
        }
        catch (error) {
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
                }
                catch (fallbackError) {
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
    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }
    /**
     * Check if service is available
     */
    isAvailable() {
        return this.providers.size > 0;
    }
}
//# sourceMappingURL=AIChatService.js.map