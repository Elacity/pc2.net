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
  {
    name: 'copy',
    category: 'filesystem',
    description: 'Copy a file or directory to a new location',
    endpoint: '/copy',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Source file or directory path',
        },
        destination: {
          type: 'string',
          description: 'Destination directory path',
        },
        new_name: {
          type: 'string',
          description: 'Optional new name for the copied file',
        },
      },
      required: ['source', 'destination'],
    },
    returns: {
      type: 'object',
      properties: {
        uid: { type: 'string' },
        name: { type: 'string' },
        path: { type: 'string' },
        source_path: { type: 'string' },
        is_dir: { type: 'boolean' },
        type: { type: 'string' },
        size: { type: 'number' },
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
  // HTTP Client Tools
  // ============================================================================
  {
    name: 'http_request',
    category: 'http',
    description: 'Make an HTTP request to an external API. Supports GET, POST, PUT, PATCH, DELETE methods. Blocked for internal/localhost URLs for security.',
    endpoint: '/api/http',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to request (must be HTTP or HTTPS)',
        },
        method: {
          type: 'string',
          description: 'HTTP method',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
        },
        headers: {
          type: 'object',
          description: 'Request headers as key-value pairs',
        },
        body: {
          type: 'object',
          description: 'Request body (for POST, PUT, PATCH)',
        },
        timeout: {
          type: 'number',
          description: 'Request timeout in milliseconds (max 30000)',
        },
        follow_redirects: {
          type: 'boolean',
          description: 'Whether to follow redirects (default: true)',
        },
      },
      required: ['url'],
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        status: { type: 'number', description: 'HTTP status code' },
        status_text: { type: 'string' },
        headers: { type: 'object', description: 'Response headers' },
        body: { type: 'object', description: 'Response body (parsed as JSON if possible)' },
        url: { type: 'string', description: 'Final URL after redirects' },
      },
    },
    requiredScopes: ['execute'],
    notes: [
      'Requests to localhost, internal IPs, and cloud metadata services are blocked',
      'Maximum response size is 10MB',
      'Maximum timeout is 30 seconds',
    ],
  },
  {
    name: 'download',
    category: 'http',
    description: 'Download a file from a URL and save it to user storage',
    endpoint: '/api/http/download',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to download from (HTTP or HTTPS)',
        },
        destination: {
          type: 'string',
          description: 'Destination directory path in user storage',
        },
        filename: {
          type: 'string',
          description: 'Optional filename (defaults to filename from URL)',
        },
        timeout: {
          type: 'number',
          description: 'Download timeout in milliseconds (max 120000)',
        },
      },
      required: ['url', 'destination'],
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        path: { type: 'string', description: 'Full path of saved file' },
        filename: { type: 'string' },
        size: { type: 'number', description: 'File size in bytes' },
        content_type: { type: 'string' },
        source_url: { type: 'string' },
      },
    },
    requiredScopes: ['write'],
    notes: [
      'Maximum file size is 50MB',
      'Maximum timeout is 2 minutes',
      'Downloads from localhost and internal IPs are blocked',
    ],
  },

  // ============================================================================
  // Git Tools
  // ============================================================================
  {
    name: 'git_clone',
    category: 'git',
    description: 'Clone a git repository into user storage',
    endpoint: '/api/git/clone',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Repository URL (HTTPS or SSH)',
        },
        destination: {
          type: 'string',
          description: 'Destination directory name',
        },
        branch: {
          type: 'string',
          description: 'Branch to clone',
        },
        depth: {
          type: 'number',
          description: 'Shallow clone depth',
        },
      },
      required: ['url'],
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        path: { type: 'string' },
        full_path: { type: 'string' },
        output: { type: 'string' },
      },
    },
    requiredScopes: ['execute'],
  },
  {
    name: 'git_status',
    category: 'git',
    description: 'Get the status of a git repository',
    endpoint: '/api/git/status',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the repository (relative to home)',
        },
      },
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        branch: { type: 'string' },
        clean: { type: 'boolean' },
        changes: { type: 'array' },
        last_commit: { type: 'object' },
      },
    },
    requiredScopes: ['read'],
  },
  {
    name: 'git_commit',
    category: 'git',
    description: 'Commit changes to a git repository',
    endpoint: '/api/git/commit',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the repository',
        },
        message: {
          type: 'string',
          description: 'Commit message',
        },
        add_all: {
          type: 'boolean',
          description: 'Add all changes before committing',
        },
        files: {
          type: 'array',
          description: 'Specific files to add and commit',
          items: { type: 'string' },
        },
      },
      required: ['message'],
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        hash: { type: 'string' },
        message: { type: 'string' },
        output: { type: 'string' },
      },
    },
    requiredScopes: ['execute'],
  },
  {
    name: 'git_push',
    category: 'git',
    description: 'Push commits to remote repository',
    endpoint: '/api/git/push',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the repository',
        },
        remote: {
          type: 'string',
          description: 'Remote name (default: origin)',
        },
        branch: {
          type: 'string',
          description: 'Branch to push',
        },
        force: {
          type: 'boolean',
          description: 'Force push (use with caution)',
        },
      },
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        remote: { type: 'string' },
        branch: { type: 'string' },
        output: { type: 'string' },
      },
    },
    requiredScopes: ['execute'],
  },
  {
    name: 'git_pull',
    category: 'git',
    description: 'Pull changes from remote repository',
    endpoint: '/api/git/pull',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the repository',
        },
        remote: {
          type: 'string',
          description: 'Remote name (default: origin)',
        },
        branch: {
          type: 'string',
          description: 'Branch to pull',
        },
      },
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        remote: { type: 'string' },
        branch: { type: 'string' },
        output: { type: 'string' },
      },
    },
    requiredScopes: ['execute'],
  },
  {
    name: 'git_log',
    category: 'git',
    description: 'Get commit history',
    endpoint: '/api/git/log',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the repository',
        },
        count: {
          type: 'number',
          description: 'Number of commits to show (max 100)',
        },
      },
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        count: { type: 'number' },
        commits: { type: 'array' },
      },
    },
    requiredScopes: ['read'],
  },
  {
    name: 'git_diff',
    category: 'git',
    description: 'Get diff of current changes',
    endpoint: '/api/git/diff',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the repository',
        },
        staged: {
          type: 'boolean',
          description: 'Show staged changes only',
        },
      },
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        staged: { type: 'boolean' },
        diff: { type: 'string' },
        has_changes: { type: 'boolean' },
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
  {
    name: 'search',
    category: 'filesystem',
    description: 'Search for files and folders by name or content',
    endpoint: '/search',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query string',
        },
        path: {
          type: 'string',
          description: 'Directory path to search in (defaults to user root)',
        },
        type: {
          type: 'string',
          description: 'Filter by type: file, directory, or all',
          enum: ['file', 'directory', 'all'],
        },
      },
      required: ['query'],
    },
    returns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          path: { type: 'string' },
          is_dir: { type: 'boolean' },
          size: { type: 'number' },
        },
      },
    },
    requiredScopes: ['read'],
  },
  {
    name: 'get_stats',
    category: 'system',
    description: 'Get storage statistics for the authenticated user',
    endpoint: '/api/stats',
    method: 'GET',
    parameters: {
      type: 'object',
      properties: {},
    },
    returns: {
      type: 'object',
      properties: {
        storageUsed: { type: 'number', description: 'Bytes used' },
        storageLimit: { type: 'number', description: 'Storage limit in bytes' },
        filesCount: { type: 'number', description: 'Total number of files' },
      },
    },
    requiredScopes: ['read'],
  },
  {
    name: 'disk_free',
    category: 'system',
    description: 'Get disk usage information',
    endpoint: '/df',
    method: 'GET',
    parameters: {
      type: 'object',
      properties: {},
    },
    returns: {
      type: 'object',
      properties: {
        used: { type: 'number' },
        available: { type: 'number' },
        total: { type: 'number' },
        percentage: { type: 'number' },
      },
    },
    requiredScopes: ['read'],
  },
  {
    name: 'kv_get',
    category: 'system',
    description: 'Get a value from the key-value store',
    endpoint: '/kv/:key',
    method: 'GET',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'The key to retrieve',
        },
      },
      required: ['key'],
    },
    returns: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        value: { type: 'string' },
      },
    },
    requiredScopes: ['read'],
    notes: ['Key-value store is scoped to your user account'],
  },
  {
    name: 'kv_set',
    category: 'system',
    description: 'Set a value in the key-value store',
    endpoint: '/kv/:key',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'The key to set',
        },
        value: {
          type: 'string',
          description: 'The value to store',
        },
      },
      required: ['key', 'value'],
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
    name: 'list_backups',
    category: 'system',
    description: 'List available backups for this PC2 node',
    endpoint: '/api/backups',
    method: 'GET',
    parameters: {
      type: 'object',
      properties: {},
    },
    returns: {
      type: 'object',
      properties: {
        backups: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              filename: { type: 'string' },
              size: { type: 'number' },
              created: { type: 'string' },
            },
          },
        },
      },
    },
    requiredScopes: ['admin'],
  },
  {
    name: 'create_backup',
    category: 'system',
    description: 'Create a new backup of the PC2 node data',
    endpoint: '/api/backups/create',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {},
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        filename: { type: 'string' },
      },
    },
    requiredScopes: ['admin'],
  },

  // ============================================================================
  // Audit Tools
  // ============================================================================
  {
    name: 'list_audit_logs',
    category: 'system',
    description: 'List audit logs of agent/API actions for this user',
    endpoint: '/api/audit',
    method: 'GET',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum logs to return (max 200)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset',
        },
        action: {
          type: 'string',
          description: 'Filter by action type (e.g., file_write, terminal_exec)',
        },
        since: {
          type: 'number',
          description: 'Filter logs after this timestamp (ms)',
        },
        until: {
          type: 'number',
          description: 'Filter logs before this timestamp (ms)',
        },
      },
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        logs: { type: 'array' },
        pagination: { type: 'object' },
      },
    },
    requiredScopes: ['read'],
  },
  {
    name: 'get_audit_stats',
    category: 'system',
    description: 'Get audit statistics summary for this user',
    endpoint: '/api/audit/stats',
    method: 'GET',
    parameters: {
      type: 'object',
      properties: {
        since: {
          type: 'number',
          description: 'Get stats since this timestamp (default: 24h ago)',
        },
      },
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        since: { type: 'number' },
        stats: {
          type: 'object',
          properties: {
            total_actions: { type: 'number' },
            actions_by_type: { type: 'object' },
            average_duration_ms: { type: 'number' },
            success_rate: { type: 'number' },
          },
        },
      },
    },
    requiredScopes: ['read'],
  },
  {
    name: 'get_rate_limit_status',
    category: 'system',
    description: 'Get current rate limit status for this API key/session',
    endpoint: '/api/rate-limit/status',
    method: 'GET',
    parameters: {
      type: 'object',
      properties: {},
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        wallet: { type: 'string' },
        api_key_id: { type: 'string' },
        limits: {
          type: 'object',
          description: 'Rate limits by scope with remaining/limit/reset values',
        },
      },
    },
    requiredScopes: ['read'],
  },

  // ============================================================================
  // Scheduler Tools
  // ============================================================================
  {
    name: 'create_scheduled_task',
    category: 'scheduler',
    description: 'Create a scheduled task to run actions on a cron schedule',
    endpoint: '/api/scheduler/tasks',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Task name',
        },
        description: {
          type: 'string',
          description: 'Task description',
        },
        cron_expression: {
          type: 'string',
          description: 'Cron expression (e.g., "0 * * * *" for hourly) or preset (@hourly, @daily, @weekly)',
        },
        action: {
          type: 'string',
          description: 'Action to execute (terminal_exec, terminal_script, http_request, git_pull, backup_create)',
          enum: ['terminal_exec', 'terminal_script', 'http_request', 'git_pull', 'backup_create'],
        },
        action_params: {
          type: 'object',
          description: 'Parameters for the action',
        },
        enabled: {
          type: 'boolean',
          description: 'Whether the task is enabled (default: true)',
        },
      },
      required: ['name', 'cron_expression', 'action'],
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        task: { type: 'object' },
      },
    },
    requiredScopes: ['admin'],
  },
  {
    name: 'list_scheduled_tasks',
    category: 'scheduler',
    description: 'List all scheduled tasks for this user',
    endpoint: '/api/scheduler/tasks',
    method: 'GET',
    parameters: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          description: 'Filter by enabled status',
        },
      },
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        count: { type: 'number' },
        tasks: { type: 'array' },
      },
    },
    requiredScopes: ['read'],
  },
  {
    name: 'get_scheduled_task',
    category: 'scheduler',
    description: 'Get details of a specific scheduled task',
    endpoint: '/api/scheduler/tasks/:id',
    method: 'GET',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Task ID',
        },
      },
      required: ['id'],
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        task: { type: 'object' },
      },
    },
    requiredScopes: ['read'],
  },
  {
    name: 'update_scheduled_task',
    category: 'scheduler',
    description: 'Update a scheduled task',
    endpoint: '/api/scheduler/tasks/:id',
    method: 'PUT',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Task ID',
        },
        name: { type: 'string' },
        description: { type: 'string' },
        cron_expression: { type: 'string' },
        action_params: { type: 'object' },
        enabled: { type: 'boolean' },
      },
      required: ['id'],
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        task: { type: 'object' },
      },
    },
    requiredScopes: ['admin'],
  },
  {
    name: 'delete_scheduled_task',
    category: 'scheduler',
    description: 'Delete a scheduled task',
    endpoint: '/api/scheduler/tasks/:id',
    method: 'DELETE',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Task ID',
        },
      },
      required: ['id'],
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
    requiredScopes: ['admin'],
  },
  {
    name: 'trigger_scheduled_task',
    category: 'scheduler',
    description: 'Trigger a scheduled task immediately (for testing)',
    endpoint: '/api/scheduler/tasks/:id/trigger',
    method: 'POST',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Task ID',
        },
      },
      required: ['id'],
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        task_id: { type: 'string' },
        action: { type: 'string' },
        triggered_at: { type: 'number' },
        next_run_at: { type: 'number' },
      },
    },
    requiredScopes: ['admin'],
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
