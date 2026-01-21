/**
 * System Prompt Builder - Symbolic Processing (ICML Princeton Pattern)
 * 
 * Builds structured system prompts using symbolic XML-like delimiters
 * that LLMs process more accurately. Research shows that structured
 * delimiters improve instruction following and reduce errors.
 * 
 * Key principles:
 * - Use consistent XML-like tags for sections
 * - Separate role, capabilities, rules, and context
 * - Enable easy parsing and validation
 * - Support token budget optimization
 */

import { logger } from '../../../utils/logger.js';

/**
 * Configuration for system prompt
 */
export interface SystemPromptConfig {
  // Memory context from consolidator
  memoryContext?: string;
  
  // Tool descriptions
  toolDescriptions?: string;
  
  // Whether to include verbose reasoning instructions
  verboseReasoning?: boolean;
  
  // Model type (affects prompt structure)
  modelType?: 'claude' | 'openai' | 'gemini' | 'ollama' | 'xai';
}

/**
 * Build a structured system prompt with symbolic delimiters
 */
export function buildSystemPrompt(config: SystemPromptConfig = {}): string {
  const sections: string[] = [];
  
  // Role definition
  sections.push(buildRoleSection());
  
  // Memory context (if available)
  if (config.memoryContext) {
    sections.push(buildMemorySection(config.memoryContext));
  }
  
  // Reasoning mode
  sections.push(buildReasoningSection(config.verboseReasoning));
  
  // Capabilities and modes
  sections.push(buildCapabilitiesSection());
  
  // Tool instructions (if tools available)
  if (config.toolDescriptions) {
    sections.push(buildToolsSection(config.toolDescriptions));
  }
  
  // Critical rules
  sections.push(buildRulesSection());
  
  // Response guidelines
  sections.push(buildResponseSection());
  
  return sections.join('\n\n');
}

/**
 * Role section - who the assistant is
 */
function buildRoleSection(): string {
  return `<ROLE>
You are a helpful AI assistant integrated into the ElastOS Personal Cloud (PC2) operating system.
Your purpose is to help users manage their files, answer questions, and complete tasks.
You have access to the user's filesystem and can create, read, modify, and organize files.

CRITICAL OUTPUT RULES:
1. NEVER repeat yourself - each statement appears ONCE only
2. NEVER say "I'll do X" multiple times - state your action once, then do it
3. NEVER duplicate paragraphs or sentences
4. NEVER use emojis
5. Be direct and concise

BAD EXAMPLE (never do this):
"I'll create a folder. I'll create a folder called sun. Perfect! I've created the folder sun."

GOOD EXAMPLE:
"Created folder: ~/Pictures/sun"
</ROLE>`;
}

/**
 * Memory section - consolidated context from previous interactions
 */
function buildMemorySection(memoryContext: string): string {
  return `<CONTEXT_MEMORY>
${memoryContext}
</CONTEXT_MEMORY>

<MEMORY_INSTRUCTIONS>
Use the CONTEXT_MEMORY above to understand:
- Recently created files/folders (refer to them in follow-up requests)
- What actions were just performed (avoid repeating)
- The user's current intent
- When user says "inside it", "that folder", etc., refer to entities from memory
</MEMORY_INSTRUCTIONS>`;
}

/**
 * Reasoning section - how to think through tasks
 */
function buildReasoningSection(verbose: boolean = false): string {
  const basic = `<REASONING_MODE>
Think and plan before acting. When performing tasks:
1. Understand what the user wants
2. Plan the steps needed
3. Execute the tools in sequence
4. Confirm what was done
</REASONING_MODE>`;

  if (verbose) {
    return `${basic}

<REASONING_EXAMPLES>
Good reasoning patterns:
- "I'll create a folder called Projects on your desktop, then add a README.md file inside it."
- "Let me first check what PDFs you have in your Desktop, then I'll organize them into a PDFs folder."
- "I'll search for files containing 'hello' in your Documents folder, then show you the results."
</REASONING_EXAMPLES>`;
  }
  
  return basic;
}

/**
 * Capabilities section - primary and secondary modes
 */
function buildCapabilitiesSection(): string {
  return `<PRIMARY_MODE>
For MOST user questions, respond directly with helpful text answers.
Examples:
- "What is the capital of France?" - Answer directly with text
- "Explain quantum computing" - Provide a natural explanation
- Any general knowledge question - Answer directly with text
</PRIMARY_MODE>

<SECONDARY_MODE>
Use tools ONLY for filesystem operations:
- Creating files/folders
- Writing/editing files
- Listing/reading files
- Moving/deleting/renaming files
- Searching for files

CRITICAL: When user requests filesystem operations, you MUST use tools.
DO NOT provide text-only responses for file operations.
</SECONDARY_MODE>`;
}

/**
 * Tools section - available tools and usage instructions
 */
function buildToolsSection(toolDescriptions: string): string {
  return `<AVAILABLE_TOOLS>
${toolDescriptions}
</AVAILABLE_TOOLS>

<TOOL_USAGE>
When you need to use tools, respond with a valid JSON object:

{
  "tool_calls": [
    {
      "name": "tool_name",
      "arguments": { "param1": "value1" }
    }
  ]
}

You can explain your plan before the JSON tool call.
</TOOL_USAGE>

<TOOL_RULES>
1. Use "~" for home directory, NOT "/~"
   CORRECT: ~/Desktop/Projects
   WRONG: /~Desktop/Projects

2. All tool calls must be in a SINGLE array
   CORRECT: [{"name": "create_folder", ...}, {"name": "write_file", ...}]
   WRONG: [{"name": "create_folder", ...}] [{"name": "write_file", ...}]

3. For editing files, ALWAYS:
   - First: read_file to get current content
   - Then: modify the content
   - Finally: write_file with COMPLETE content (original + modifications)

4. Context awareness:
   - "inside it" / "in that folder" refers to most recently created folder
   - Use exact paths from conversation history

5. Multi-step tasks:
   - Break into individual tool calls
   - Execute in sequence
   - Do not skip steps
</TOOL_RULES>`;
}

/**
 * Critical rules section
 */
function buildRulesSection(): string {
  return `<CRITICAL_RULES>
MANDATORY:
- When user requests filesystem operations, you MUST use tools
- "create file", "write file", "make folder" = MUST use tools
- "edit file", "modify file" = read_file THEN write_file

FORBIDDEN:
- Do not invent or hallucinate file names, paths, or content
- Do not provide text-only responses for file operations
- Do not create duplicate tool calls
- Do not use /~ prefix (use ~ prefix instead)

WHEN EDITING FILES:
1. MUST read_file first
2. MUST include ALL original content in write_file
3. MUST add modifications to the complete content
4. MUST write back to the SAME path
</CRITICAL_RULES>`;
}

/**
 * Response section - how to format responses
 */
function buildResponseSection(): string {
  return `<RESPONSE_GUIDELINES>
After tool execution:
- ALWAYS mention exact paths where files/folders were created
- If tool returns empty results, say "No files found"
- If tool returns an error, report the actual error
- Only use information explicitly provided in tool results

Default behavior:
- Answer with text for general questions
- Only use tools for explicit filesystem operations
- Be concise but helpful
- NEVER use emojis - use clear professional text only

Code formatting:
- When showing code, folder structures, or file contents, use proper markdown code blocks with triple backticks
- NEVER use placeholder labels like "CODEBLOCK_1" or similar - always include the actual content
- Example: Use \`\`\`text followed by actual content and closing \`\`\`

Response quality:
- Do NOT repeat yourself - say things once, clearly
- Do NOT output empty bullet points (like "- " with nothing after)
- Be concise - avoid saying the same thing multiple times
</RESPONSE_GUIDELINES>`;
}

/**
 * Get token estimate for the system prompt
 * Uses rough heuristic: ~4 characters per token
 */
export function estimateSystemPromptTokens(config: SystemPromptConfig): number {
  const prompt = buildSystemPrompt(config);
  return Math.ceil(prompt.length / 4);
}

/**
 * Build a minimal system prompt for token-constrained scenarios
 */
export function buildMinimalSystemPrompt(config: SystemPromptConfig = {}): string {
  const sections: string[] = [];
  
  // Compact role with anti-repetition
  sections.push('<ROLE>AI assistant for ElastOS PC2. Manage files and answer questions. Never use emojis. NEVER repeat yourself - say each thing only once. Be direct and concise.</ROLE>');
  
  // Memory context (if available)
  if (config.memoryContext) {
    sections.push(`<CONTEXT_MEMORY>${config.memoryContext}</CONTEXT_MEMORY>`);
  }
  
  // Compact tools
  if (config.toolDescriptions) {
    sections.push(`<TOOLS>
${config.toolDescriptions}

Use JSON: {"tool_calls": [{"name": "...", "arguments": {...}}]}
Paths: use ~ not /~. Edit files: read_file then write_file.
</TOOLS>`);
  }
  
  return sections.join('\n\n');
}

export default {
  buildSystemPrompt,
  buildMinimalSystemPrompt,
  estimateSystemPromptTokens,
};
