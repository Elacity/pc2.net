/**
 * Filesystem Tools Definitions
 * Tool definitions for AI function calling
 * Matches OpenAI/Claude tool format
 */

import { NormalizedTool } from '../utils/FunctionCalling.js';

export const filesystemTools: NormalizedTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_folder',
      description: 'Creates a new folder/directory in the user\'s filesystem. Can create folders in Desktop, Documents, Pictures, Videos, Music, Downloads, Public, or any subdirectory. Path must be relative to user root or absolute starting with /',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path where folder should be created. Examples: ~/Desktop/MyFolder, ~/Pictures/Vacation, ~/Documents/Projects, ~/Videos/Movies, ~/Music/Playlists, ~/Downloads/Extracted, ~/Public/Shared. Use ~ for home directory or absolute path like /Documents/Projects. If no directory is specified (e.g., just "MyFolder"), defaults to Desktop.'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'Lists files and folders in a directory. Returns file names, paths, sizes, and types.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path to list. Use ~ for home directory or absolute path. Defaults to home if not specified.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Reads the contents of a text file. Returns the file content as a string.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file to read. Must be a file, not a directory.'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Creates or overwrites a file with the specified content. Creates parent directories if needed. REQUIRED: Both "path" and "content" parameters must be provided.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path where file should be created or written. Use ~ for home directory or absolute path. REQUIRED.'
          },
          content: {
            type: 'string',
            description: 'Content to write to the file. REQUIRED. Cannot be omitted - use empty string "" if you want an empty file.'
          },
          mime_type: {
            type: 'string',
            description: 'Optional MIME type of the file (e.g., text/plain, text/markdown, application/json). Defaults to text/plain.'
          }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Deletes a file or folder. For folders, use recursive=true to delete all contents.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file or folder to delete.'
          },
          recursive: {
            type: 'boolean',
            description: 'If true and path is a directory, recursively delete all contents. Defaults to false.'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'move_file',
      description: 'Moves or renames a file or folder from one path to another. REQUIRED: Both "from_path" and "to_path" parameters must be provided. Use "from_path" (not "sourcePath") and "to_path" (not "destinationPath").',
      parameters: {
        type: 'object',
        properties: {
          from_path: {
            type: 'string',
            description: 'Source path of the file or folder to move. REQUIRED. Use "from_path" (not "sourcePath" or "from").'
          },
          to_path: {
            type: 'string',
            description: 'Destination path where the file or folder should be moved to. REQUIRED. Use "to_path" (not "destinationPath" or "to").'
          }
        },
        required: ['from_path', 'to_path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'copy_file',
      description: 'Copies a file or folder from one path to another. Creates a duplicate at the destination.',
      parameters: {
        type: 'object',
        properties: {
          from_path: {
            type: 'string',
            description: 'Source path of the file or folder to copy.'
          },
          to_path: {
            type: 'string',
            description: 'Destination path where the file or folder should be copied to.'
          }
        },
        required: ['from_path', 'to_path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'stat',
      description: 'Gets metadata about a file or folder (size, type, modified date, etc.).',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file or folder to get metadata for.'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rename',
      description: 'Renames a file or folder. This is a convenience function that moves the item to the same directory with a new name. REQUIRED: Both "path" and "new_name" parameters must be provided.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Current path of the file or folder to rename. REQUIRED.'
          },
          new_name: {
            type: 'string',
            description: 'New name for the file or folder (without path). REQUIRED. Cannot be omitted - you must specify what the new name should be.'
          }
        },
        required: ['path', 'new_name']
      }
    }
  }
];

