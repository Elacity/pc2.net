/**
 * Agent Tool Registry
 * 
 * Provides a comprehensive registry of all available tools for AI agents.
 * Tools are organized by category and include full JSON Schema definitions
 * for parameters, enabling Claude Code and other agents to discover and use them.
 * 
 * Endpoints:
 * - GET /api/tools - List all available tools
 * - GET /api/tools/:name - Get detailed info about a specific tool
 * - GET /api/tools/categories - List tool categories
 */

import { Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
import { getTerminalService } from '../services/terminal/TerminalService.js';

// JSON Schema type definitions
interface JSONSchema {
  type: string;
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: string[];
  default?: any;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  minLength?: number;
}

// Tool definition
interface Tool {
  name: string;
  category: string;
  description: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  parameters: JSONSchema;
  returns: JSONSchema;
  examples?: Array<{
    description: string;
    request: any;
    response: any;
  }>;
  requiredScopes?: string[];
  notes?: string[];
}

// Tool category definition
interface ToolCategory {
  name: string;
  description: string;
  icon?: string;
}

// Define tool categories
const TOOL_CATEGORIES: ToolCategory[] = [
  {
    name: 'filesystem',
    description: 'File and directory operations',
    icon: '📁',
  },
  {
    name: 'terminal',
    description: 'Command execution and shell access',
    icon: '💻',
  },
  {
    name: 'ai',
    description: 'AI and LLM interactions',
    icon: '🤖',
  },
  {
    name: 'apps',
    description: 'Application management',
    icon: '📱',
  },
  {
    name: 'system',
    description: 'System information and management',
    icon: '⚙️',
  },
];

// Define all available tools
const TOOLS: Tool[] = [
  // ============================================================================
  // Terminal Tools
  // ============================================================================
  {
    name: 'exec',
    category: 'terminal',
    description: 'Execute a shell command and return the output. Commands run in the user\'s isolated home directory with configurable timeout.',
    endpoint: '/api/terminal/exec',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
          maxLength: 10000,
        },
        args: {
          type: 'array',
          description: 'Optional command arguments (automatically escaped)',
          items: { type: 'string' },
        },
        cwd: {
          type: 'string',
          description: 'Working directory (relative to user home)',
        },
        env: {
          type: 'object',
          description: 'Additional environment variables',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds',
          default: 30000,
          minimum: 1000,
          maximum: 300000,
        },
        shell: {
          type: 'boolean',
          description: 'Run command in shell (default true)',
          default: true,
        },
      },
      required: ['command'],
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether command succeeded (exit code 0)' },
        exitCode: { type: 'number', description: 'Exit code of the command' },
        stdout: { type: 'string', description: 'Standard output (max 5MB)' },
        stderr: { type: 'string', description: 'Standard error (max 1MB)' },
        duration: { type: 'number', description: 'Execution time in milliseconds' },
        killed: { type: 'boolean', description: 'True if killed due to timeout' },
        error: { type: 'string', description: 'Error message if command failed' },
      },
    },
    examples: [
      {
        description: 'List files in current directory',
        request: { command: 'ls -la' },
        response: { success: true, exitCode: 0, stdout: 'total 0\ndrwx...', stderr: '', duration: 15 },
      },
      {
        description: 'Run Python script',
        request: { command: 'python3', args: ['-c', 'print("Hello, Agent!")'] },
        response: { success: true, exitCode: 0, stdout: 'Hello, Agent!\n', stderr: '', duration: 120 },
      },
    ],
    requiredScopes: ['execute'],
    notes: [
      'Commands execute in user\'s isolated home directory',
      'Network access may be available depending on node configuration',
      'Resource limits (CPU, memory) may be enforced via cgroups',
    ],
  },
  {
    name: 'script',
    category: 'terminal',
    description: 'Execute a script with a specified interpreter. Useful for multi-line scripts or specific language execution.',
    endpoint: '/api/terminal/script',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'The script content to execute',
          maxLength: 1000000,
        },
        interpreter: {
          type: 'string',
          description: 'Script interpreter',
          enum: ['/bin/bash', '/bin/sh', 'python3', 'python', 'node', 'ruby', 'perl'],
          default: '/bin/bash',
        },
        cwd: {
          type: 'string',
          description: 'Working directory (relative to user home)',
        },
        env: {
          type: 'object',
          description: 'Additional environment variables',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds',
          default: 60000,
          minimum: 1000,
          maximum: 600000,
        },
      },
      required: ['script'],
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        exitCode: { type: 'number' },
        stdout: { type: 'string' },
        stderr: { type: 'string' },
        duration: { type: 'number' },
        killed: { type: 'boolean' },
        error: { type: 'string' },
      },
    },
    examples: [
      {
        description: 'Run a bash script',
        request: { 
          script: '#!/bin/bash\nfor i in 1 2 3; do\n  echo "Number: $i"\ndone',
          interpreter: '/bin/bash',
        },
        response: { success: true, exitCode: 0, stdout: 'Number: 1\nNumber: 2\nNumber: 3\n', stderr: '', duration: 25 },
      },
    ],
    requiredScopes: ['execute'],
  },

  // ============================================================================
  // Filesystem Tools
  // ============================================================================
  {
    name: 'read_file',
    category: 'filesystem',
    description: 'Read the contents of a file from the user\'s storage',
    endpoint: '/read',
    method: 'GET',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path (absolute or relative to user root)',
        },
        file: {
          type: 'string',
          description: 'Alternative parameter for file path',
        },
      },
      required: ['path'],
    },
    returns: {
      type: 'object',
      description: 'File contents as binary data or JSON',
    },
    requiredScopes: ['read'],
  },
  {
    name: 'write_file',
    category: 'filesystem',
    description: 'Write content to a file in the user\'s storage',
    endpoint: '/writeFile',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'Target file path or UUID',
        },
        content: {
          type: 'string',
          description: 'File content to write',
        },
      },
      required: ['uid', 'content'],
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
    requiredScopes: ['write'],
  },
  {
    name: 'list_directory',
    category: 'filesystem',
    description: 'List files and directories in a path',
    endpoint: '/readdir',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to list',
        },
      },
      required: ['path'],
    },
    returns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          is_dir: { type: 'boolean' },
          size: { type: 'number' },
          modified: { type: 'string' },
        },
      },
    },
    requiredScopes: ['read'],
  },
  {
    name: 'mkdir',
    category: 'filesystem',
    description: 'Create a new directory',
    endpoint: '/mkdir',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to create',
        },
        create_missing_parents: {
          type: 'boolean',
          description: 'Create parent directories if they don\'t exist',
          default: true,
        },
      },
      required: ['path'],
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        uid: { type: 'string' },
      },
    },
    requiredScopes: ['write'],
  },
  {
    name: 'delete',
    category: 'filesystem',
    description: 'Delete a file or directory',
    endpoint: '/delete',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to delete',
        },
        recursive: {
          type: 'boolean',
          description: 'Delete directories recursively',
          default: false,
        },
      },
      required: ['path'],
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
    requiredScopes: ['write'],
  },
  {
    name: 'move',
    category: 'filesystem',
    description: 'Move or rename a file or directory',
    endpoint: '/move',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Source path',
        },
        destination: {
          type: 'string',
          description: 'Destination path',
        },
      },
      required: ['source', 'destination'],
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
    requiredScopes: ['write'],
  },

  // ============================================================================
  // AI Tools
  // ============================================================================
  {
    name: 'chat',
    category: 'ai',
    description: 'Send a message to an AI model and get a response. Supports streaming.',
    endpoint: '/api/ai/chat',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          description: 'Conversation messages',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['user', 'assistant', 'system'] },
              content: { type: 'string' },
            },
          },
        },
        model: {
          type: 'string',
          description: 'Model to use (e.g., "llama3", "claude-sonnet-4-5-20250929")',
        },
        provider: {
          type: 'string',
          description: 'AI provider',
          enum: ['ollama', 'claude', 'openai', 'gemini'],
        },
        stream: {
          type: 'boolean',
          description: 'Enable streaming response',
          default: false,
        },
        temperature: {
          type: 'number',
          description: 'Sampling temperature (0.0-2.0)',
          minimum: 0,
          maximum: 2,
        },
      },
      required: ['messages'],
    },
    returns: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'AI response content' },
        model: { type: 'string' },
        usage: {
          type: 'object',
          properties: {
            input_tokens: { type: 'number' },
            output_tokens: { type: 'number' },
          },
        },
      },
    },
    requiredScopes: ['read'],
  },

  // ============================================================================
  // Apps Tools
  // ============================================================================
  {
    name: 'list_apps',
    category: 'apps',
    description: 'List available applications on this PC2 node',
    endpoint: '/get-launch-apps',
    method: 'GET',
    parameters: {
      type: 'object',
      properties: {},
    },
    returns: {
      type: 'object',
      properties: {
        recommended: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              icon: { type: 'string' },
            },
          },
        },
        recent: { type: 'array' },
      },
    },
    requiredScopes: ['read'],
  },

  // ============================================================================
  // System Tools
  // ============================================================================
  {
    name: 'terminal_status',
    category: 'system',
    description: 'Check terminal service availability and configuration',
    endpoint: '/api/terminal/status',
    method: 'GET',
    parameters: {
      type: 'object',
      properties: {},
    },
    returns: {
      type: 'object',
      properties: {
        available: { type: 'boolean' },
        isolationMode: { type: 'string' },
        isMultiUserSafe: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
    requiredScopes: [],
  },
  {
    name: 'get_user_info',
    category: 'system',
    description: 'Get information about the authenticated user',
    endpoint: '/whoami',
    method: 'GET',
    parameters: {
      type: 'object',
      properties: {},
    },
    returns: {
      type: 'object',
      properties: {
        wallet_address: { type: 'string' },
        username: { type: 'string' },
      },
    },
    requiredScopes: ['read'],
  },
];

/**
 * List all available tools
 * GET /api/tools
 */
export function handleListTools(req: AuthenticatedRequest, res: Response): void {
  const terminalService = getTerminalService();
  const terminalAvailable = terminalService.isAvailable();
  
  // Filter tools based on availability
  const availableTools = TOOLS.filter(tool => {
    // If terminal not available, hide terminal tools
    if (tool.category === 'terminal' && !terminalAvailable) {
      return false;
    }
    return true;
  });

  // Check if user has API key with scopes
  const userScopes = req.apiKey?.scopes || ['read', 'write', 'execute', 'admin'];
  
  // Add scope info to each tool
  const toolsWithAccess = availableTools.map(tool => ({
    ...tool,
    hasAccess: !tool.requiredScopes || tool.requiredScopes.length === 0 || 
      tool.requiredScopes.some(scope => userScopes.includes(scope)),
  }));

  res.json({
    success: true,
    tools: toolsWithAccess,
    categories: TOOL_CATEGORIES,
    meta: {
      totalTools: toolsWithAccess.length,
      terminalAvailable,
      userScopes: req.apiKey ? userScopes : null,
    },
  });
}

/**
 * Get detailed info about a specific tool
 * GET /api/tools/:name
 */
export function handleGetTool(req: AuthenticatedRequest, res: Response): void {
  const toolName = req.params.name;
  
  const tool = TOOLS.find(t => t.name === toolName);
  
  if (!tool) {
    res.status(404).json({
      success: false,
      error: `Tool '${toolName}' not found`,
      availableTools: TOOLS.map(t => t.name),
    });
    return;
  }

  // Check access
  const userScopes = req.apiKey?.scopes || ['read', 'write', 'execute', 'admin'];
  const hasAccess = !tool.requiredScopes || tool.requiredScopes.length === 0 ||
    tool.requiredScopes.some(scope => userScopes.includes(scope));

  res.json({
    success: true,
    tool: {
      ...tool,
      hasAccess,
    },
  });
}

/**
 * List tool categories
 * GET /api/tools/categories
 */
export function handleListCategories(req: AuthenticatedRequest, res: Response): void {
  // Count tools per category
  const categoriesWithCounts = TOOL_CATEGORIES.map(cat => ({
    ...cat,
    toolCount: TOOLS.filter(t => t.category === cat.name).length,
  }));

  res.json({
    success: true,
    categories: categoriesWithCounts,
  });
}

/**
 * Get OpenAPI/Swagger-compatible schema for all tools
 * GET /api/tools/openapi
 * 
 * This enables integration with AI agents that support OpenAPI tool definitions
 */
export function handleGetOpenAPISchema(req: AuthenticatedRequest, res: Response): void {
  const paths: Record<string, any> = {};

  for (const tool of TOOLS) {
    const pathKey = tool.endpoint;
    const methodKey = tool.method.toLowerCase();

    if (!paths[pathKey]) {
      paths[pathKey] = {};
    }

    paths[pathKey][methodKey] = {
      operationId: tool.name,
      summary: tool.description,
      tags: [tool.category],
      requestBody: tool.method !== 'GET' ? {
        required: true,
        content: {
          'application/json': {
            schema: tool.parameters,
          },
        },
      } : undefined,
      parameters: tool.method === 'GET' && tool.parameters.properties ? 
        Object.entries(tool.parameters.properties).map(([name, schema]: [string, any]) => ({
          name,
          in: 'query',
          required: tool.parameters.required?.includes(name) || false,
          schema,
        })) : undefined,
      responses: {
        '200': {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: tool.returns,
            },
          },
        },
      },
    };
  }

  const openApiSpec = {
    openapi: '3.0.0',
    info: {
      title: 'PC2 Node Agent API',
      version: '1.0.0',
      description: 'API for AI agents to interact with PC2 Node',
    },
    paths,
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
      },
    },
    security: [
      { apiKey: [] },
      { bearerAuth: [] },
    ],
  };

  res.json(openApiSpec);
}
