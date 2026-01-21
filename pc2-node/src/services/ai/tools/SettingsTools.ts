/**
 * Settings Tools Definitions
 * Tool definitions for AI settings-related function calling
 * Matches OpenAI/Claude tool format
 * 
 * Security: Only whitelisted settings can be modified
 */

import { NormalizedTool } from '../utils/FunctionCalling.js';

/**
 * Whitelist of settings that can be modified by AI
 * Security measure to prevent unauthorized changes
 */
export const ALLOWED_SETTINGS = {
  // AI Configuration
  'ai.default_provider': {
    type: 'enum',
    values: ['ollama', 'openai', 'claude', 'gemini', 'xai'],
    description: 'Default AI provider'
  },
  'ai.default_model': {
    type: 'string',
    description: 'Default model name for the selected provider'
  },
  // Personalization
  'personalization.dark_mode': {
    type: 'boolean',
    description: 'Enable dark mode'
  },
  'personalization.font_size': {
    type: 'enum',
    values: ['small', 'medium', 'large'],
    description: 'UI font size'
  },
  'personalization.desktop_bg_url': {
    type: 'string',
    description: 'Desktop background image URL'
  },
  'personalization.desktop_bg_color': {
    type: 'string',
    description: 'Desktop background color (hex or named color)'
  },
  'personalization.desktop_bg_fit': {
    type: 'enum',
    values: ['cover', 'contain', 'fill', 'none'],
    description: 'How the background image fits the screen'
  }
} as const;

export type AllowedSettingKey = keyof typeof ALLOWED_SETTINGS;

export const settingsTools: NormalizedTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_settings',
      description: 'Gets user settings and preferences. Can retrieve all settings or specific categories. Categories include: ai (AI configuration like provider and model), personalization (dark mode, font size, desktop background), storage (usage statistics - read only), and account (user account info - read only).',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Optional category to filter: "ai", "personalization", "storage", "account", or "all" for everything. Defaults to "all".',
            enum: ['ai', 'personalization', 'storage', 'account', 'all']
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_setting',
      description: `Updates a user setting. Only specific settings can be modified for security. Allowed settings: ${Object.entries(ALLOWED_SETTINGS).map(([key, config]) => `${key} (${config.type}${config.type === 'enum' ? ': ' + (config as any).values.join(', ') : ''})`).join('; ')}. Returns the updated value or an error if the setting is not allowed.`,
      parameters: {
        type: 'object',
        properties: {
          setting_key: {
            type: 'string',
            description: `The setting key to update. Must be one of: ${Object.keys(ALLOWED_SETTINGS).join(', ')}`
          },
          value: {
            type: 'string',
            description: 'The new value for the setting. For booleans use "true" or "false".'
          }
        },
        required: ['setting_key', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_file_info',
      description: 'Gets detailed metadata about a file including IPFS CID (content hash), creation date, modification date, size, MIME type, and whether it\'s public. Use this when user asks about file properties, when a file was created, its IPFS hash, or any metadata about a specific file.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file to get information about. Use ~ for home directory or absolute path.'
          }
        },
        required: ['path']
      }
    }
  }
];
