/**
 * Filesystem Tools Definitions
 * Tool definitions for AI function calling
 * Matches OpenAI/Claude tool format
 */
export const filesystemTools = [
    {
        type: 'function',
        function: {
            name: 'create_folder',
            description: 'Creates a new folder/directory in the user\'s filesystem. Can create folders in Desktop, Documents, Pictures, Videos, Music, Downloads, Public, or any subdirectory. Path must be relative to user root or absolute starting with /. REQUIRED: "path" parameter must be provided.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Path where folder should be created. Examples: ~/Desktop/MyFolder, ~/Pictures/Vacation, ~/Documents/Projects, ~/Videos/Movies, ~/Music/Playlists, ~/Downloads/Extracted, ~/Public/Shared. Use ~ for home directory or absolute path like /Documents/Projects. If no directory is specified (e.g., just "MyFolder"), defaults to Desktop. REQUIRED.'
                    },
                    create_parents: {
                        type: 'boolean',
                        description: 'If true, creates parent directories if they do not exist. Similar to mkdir --parents. Defaults to false.'
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
            description: 'Lists files and folders in a directory. Returns file names, paths, sizes, and types. Can show hidden files, detailed information, human-readable sizes, and filter by file type (e.g., "pdf", "jpg", "txt"). Use file_type parameter to filter for specific file types like PDFs, images, etc.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Directory path to list. Use ~ for home directory or absolute path. Defaults to home if not specified.'
                    },
                    show_hidden: {
                        type: 'boolean',
                        description: 'If true, includes files and folders starting with "." (hidden files). Defaults to false.'
                    },
                    detailed: {
                        type: 'boolean',
                        description: 'If true, returns detailed information including size, modified date, MIME type, and whether item is a directory. Defaults to false.'
                    },
                    human_readable: {
                        type: 'boolean',
                        description: 'If true, file sizes are returned in human-readable format (e.g., "12.5 KiB", "3.2 MiB") instead of bytes. Only applies when detailed=true. Defaults to false.'
                    },
                    file_type: {
                        type: 'string',
                        description: 'Filter files by type. REQUIRED when user asks for specific file types (e.g., "What PDFs do I have?" → use file_type: "pdf"). Can be file extension (e.g., "pdf", "txt", "jpg", "png") or MIME type (e.g., "application/pdf", "image/jpeg"). If specified, only returns files matching this type. Examples: For PDFs use "pdf", for images use "jpg" or "png", for text files use "txt". Defaults to null (no filtering).'
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
            description: 'Creates or overwrites a file with the specified content. Creates parent directories if needed. **CRITICAL FOR EDITING:** If the file already exists and you are editing it (e.g., "edit the file", "add to the file", "modify the file"), you MUST first use read_file to get the existing content, then modify it, then use write_file to save. Do NOT overwrite existing files without reading them first - you will lose the original content! When asked to create NEW content (e.g., "tell a story", "write about X"), GENERATE the content yourself - write creative, engaging stories, descriptions, or any requested content. Do NOT use placeholder text. REQUIRED: Both "path" and "content" parameters must be provided.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Path where file should be created or written. Use ~ for home directory or absolute path. When user says "inside it", "in it", or "inside that folder", use the path of the most recently created folder from the conversation. REQUIRED.'
                    },
                    content: {
                        type: 'string',
                        description: 'Content to write to the file. REQUIRED. When asked to generate content (e.g., "tell a story about X", "write about Y"), actually write the story/content yourself. Do NOT use placeholders like "[story content]" - generate the actual creative content. Cannot be omitted - use empty string "" if you want an empty file.'
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
    },
    {
        type: 'function',
        function: {
            name: 'grep_file',
            description: 'Searches for a text pattern in a file and returns matching lines with line numbers. Returns empty array if no matches found. REQUIRED: Both "path" and "pattern" parameters must be provided.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Path to the file to search. Must be a file, not a directory. REQUIRED.'
                    },
                    pattern: {
                        type: 'string',
                        description: 'Text pattern to search for. Can be plain text or regex pattern. The search will find lines containing this pattern. REQUIRED.'
                    },
                    case_sensitive: {
                        type: 'boolean',
                        description: 'If true, search is case-sensitive. Defaults to false.'
                    }
                },
                required: ['path', 'pattern']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'read_file_lines',
            description: 'Reads specific lines from a file. Can read first N lines (head), last N lines (tail), or a range of lines. Returns the requested lines with line numbers. REQUIRED: "path" parameter must be provided.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Path to the file to read. Must be a file, not a directory. REQUIRED.'
                    },
                    first: {
                        type: 'number',
                        description: 'Number of lines to read from the beginning of the file (head). If specified, returns first N lines. Cannot be used with "last" or "range".'
                    },
                    last: {
                        type: 'number',
                        description: 'Number of lines to read from the end of the file (tail). If specified, returns last N lines. Cannot be used with "first" or "range".'
                    },
                    range: {
                        type: 'string',
                        description: 'Line range to read in format "start:end" (e.g., "10:20" for lines 10-20, inclusive). Line numbers start at 1. Cannot be used with "first" or "last".'
                    }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'count_file',
            description: 'Counts words, lines, and characters in a file. Returns statistics about the file content. REQUIRED: "path" parameter must be provided.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Path to the file to count. Must be a file, not a directory. REQUIRED.'
                    }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_filename',
            description: 'Extracts the filename (last component) from a file path. Returns just the filename without the directory path. REQUIRED: "path" parameter must be provided.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Full file path to extract filename from. Examples: "~/Desktop/file.txt" returns "file.txt", "/Documents/project/readme.md" returns "readme.md". REQUIRED.'
                    }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_directory',
            description: 'Extracts the directory path (parent directory) from a file path. Returns the directory containing the file without the filename. REQUIRED: "path" parameter must be provided.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Full file path to extract directory from. Examples: "~/Desktop/file.txt" returns "~/Desktop", "/Documents/project/readme.md" returns "/Documents/project". REQUIRED.'
                    }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'touch_file',
            description: 'Creates a new empty file or updates the modification timestamp of an existing file. If the file exists, updates its modified time. If the file does not exist, creates an empty file. REQUIRED: "path" parameter must be provided.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Path where file should be created or timestamp updated. Use ~ for home directory or absolute path. Creates parent directories if needed. REQUIRED.'
                    }
                },
                required: ['path']
            }
        }
    }
];
//# sourceMappingURL=FilesystemTools.js.map