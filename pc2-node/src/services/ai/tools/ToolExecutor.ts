/**
 * Tool Executor
 * Executes AI function calls using FilesystemManager
 * CRITICAL: All operations are wallet-scoped for security
 */

import { FilesystemManager } from '../../../storage/filesystem.js';
import { logger } from '../../../utils/logger.js';
import { Server as SocketIOServer } from 'socket.io';
import { broadcastItemAdded, broadcastItemRemoved, broadcastItemMoved, broadcastItemUpdated } from '../../../websocket/events.js';

export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
}

export class ToolExecutor {
  constructor(
    private filesystem: FilesystemManager,
    private walletAddress: string,
    private io?: SocketIOServer
  ) {
    if (!walletAddress) {
      throw new Error('ToolExecutor requires walletAddress for security isolation');
    }
    logger.info('[ToolExecutor] Initialized with io available:', !!this.io, 'walletAddress:', this.walletAddress);
    if (!this.io) {
      logger.warn('[ToolExecutor] ⚠️ WebSocket server (io) not provided - live UI updates will be disabled!');
    }
  }

  /**
   * Resolve path to wallet-scoped absolute path
   * CRITICAL: All paths must be scoped to user's wallet
   * @param context Optional context about the user's request (e.g., "desktop" mentioned)
   */
  private resolvePath(path: string, context?: { mentionedDirectory?: string }): string {
    // CRITICAL: Fix malformed paths like "/0x34daf31b99b5a59ceb18e424dbc112fa6e5f3dc3Documents" 
    // (missing slash between wallet and directory name)
    // Pattern: /walletAddressDirectoryName -> /walletAddress/DirectoryName
    const originalPath = path;
    if (path.match(/^\/0x[a-fA-F0-9]{40}(Desktop|Documents|Pictures|Videos|Music|Downloads|Public)/)) {
      const match = path.match(/^(\/0x[a-fA-F0-9]{40})(Desktop|Documents|Pictures|Videos|Music|Downloads|Public)(.*)$/);
      if (match) {
        const walletPart = match[1];
        const dirName = match[2];
        const rest = match[3];
        path = `${walletPart}/${dirName}${rest}`;
        logger.info(`[ToolExecutor] Fixed malformed path from "${originalPath}" to "${path}" (added slash between wallet and directory)`);
      }
    }
    
    // Normalize malformed paths like "/~Desktop/" or "/~/Desktop/" or "/~Desktop"
    // Fix "~:Desktop/" -> "~/Desktop/" (colon instead of slash)
    path = path.replace(/~:/g, '~/');
    
    // Fix "~Desktop/" -> "~/Desktop/" (missing slash after ~)
    if (path.startsWith('~Desktop/')) {
      path = '~/' + path.substring(1); // Add slash after ~
      logger.info(`[ToolExecutor] Fixed path from "~Desktop/" to "${path}"`);
    }
    
    // Remove leading slash before tilde
    if (path.startsWith('/~')) {
      path = path.substring(1); // Remove leading slash, keep tilde
    }
    // Handle any remaining /~ patterns
    path = path.replace(/\/~/g, '/');
    
    // Fix "~FolderName" (missing directory) -> "~/Desktop/FolderName" (default to Desktop)
    // Only if it's a direct folder name without any slashes after ~
    // This handles cases like "~MyFolder" where user didn't specify a directory
    // EXCEPTION: "~Desktop" -> "~/Desktop" (not "~/Desktop/Desktop")
    const STANDARD_DIRS_EARLY = ['Desktop', 'Documents', 'Pictures', 'Videos', 'Music', 'Downloads', 'Public', 'Trash'];
    if (path.startsWith('~') && !path.includes('/') && path.length > 1) {
      const folderName = path.substring(1); // Get folder name after ~
      if (STANDARD_DIRS_EARLY.includes(folderName)) {
        path = `~/${folderName}`;
        logger.info(`[ToolExecutor] Fixed path from "~${folderName}" to "${path}" (standard directory)`);
      } else {
        path = `~/Desktop/${folderName}`;
        logger.info(`[ToolExecutor] Fixed path from "~${folderName}" to "${path}" (defaulted to Desktop)`);
      }
    }
    // Fix paths like "desktop/YO", "Desktop/YO", "documents/Projects", etc. (case-insensitive)
    // Normalize to "~/Desktop/YO", "~/Documents/Projects", etc.
    const standardDirPattern = /^(desktop|documents|pictures|videos|music|downloads|public|trash)\/(.+)$/i;
    const dirMatch = path.match(standardDirPattern);
    if (dirMatch && !path.startsWith('~') && !path.startsWith('/')) {
      const dirName = dirMatch[1].charAt(0).toUpperCase() + dirMatch[1].slice(1).toLowerCase(); // Capitalize first letter
      const rest = dirMatch[2];
      path = `~/${dirName}/${rest}`;
      logger.info(`[ToolExecutor] Fixed path from "${originalPath}" to "${path}" (normalized standard directory)`);
    }
    
    // If user mentioned a specific directory but path is ~/FolderName (home-level, missing directory), fix it
    if (context?.mentionedDirectory && path.match(/^~\/[^\/]+$/)) {
      // Path is like ~/555 (home-level folder, missing target directory)
      const folderName = path.substring(2); // Remove ~/
      const targetDir = context.mentionedDirectory;
      // Handle "home" or "~" as special case - keep it at home level
      if (targetDir.toLowerCase() === 'home' || targetDir === '~') {
        // Keep at home level, don't change
        logger.info(`[ToolExecutor] User mentioned home, keeping path at home level: ${path}`);
      } else {
        // Normalize directory name (capitalize first letter)
        const normalizedDir = targetDir.charAt(0).toUpperCase() + targetDir.slice(1).toLowerCase();
        path = `~/${normalizedDir}/${folderName}`;
        logger.info(`[ToolExecutor] Fixed path from "${originalPath}" to "${path}" (user mentioned ${normalizedDir}, moved from home to ${normalizedDir})`);
      }
    }
    
    // Fix "FolderName" (no ~ at all, no directory) -> "~/Desktop/FolderName" (default to Desktop)
    // This handles cases like "MyFolder" where user didn't specify a directory
    // EXCEPTION: Standard directory names like "Desktop", "Documents" should become "~/Desktop", "~/Documents"
    const STANDARD_DIRS = ['Desktop', 'Documents', 'Pictures', 'Videos', 'Music', 'Downloads', 'Public', 'Trash'];
    if (!path.startsWith('~') && !path.startsWith('/') && !path.includes('/')) {
      if (STANDARD_DIRS.includes(path)) {
        // This is a standard directory name - just add ~/
        path = `~/${path}`;
        logger.info(`[ToolExecutor] Fixed path to "${path}" (standard directory)`);
      } else {
        // This is a folder name - default to Desktop
        path = `~/Desktop/${path}`;
        logger.info(`[ToolExecutor] Fixed path to "${path}" (defaulted to Desktop)`);
      }
    }
    
    // Note: Paths like ~/Pictures/X, ~/Documents/X, ~/Videos/X, etc. are already correct
    // and will be preserved as-is. Only paths without a directory default to Desktop.
    
    // Handle ~ (home directory)
    if (path.startsWith('~')) {
      return path.replace('~', `/${this.walletAddress}`);
    }
    
    // If relative, make absolute
    if (!path.startsWith('/')) {
      return `/${this.walletAddress}/${path}`;
    }
    
    // If absolute but doesn't start with wallet, prepend wallet
    if (!path.startsWith(`/${this.walletAddress}`)) {
      // Allow root paths like /Public, /Documents, /Desktop, /Pictures, /Videos, /Music, /Downloads, etc. to be scoped to wallet
      const standardDirs = ['/Public', '/Documents', '/Desktop', '/Pictures', '/Videos', '/Music', '/Downloads', '/Trash'];
      if (standardDirs.some(dir => path.startsWith(dir))) {
        return `/${this.walletAddress}${path}`;
      }
      return `/${this.walletAddress}${path}`;
    }
    
    return path;
  }

  /**
   * Validate that path is within user's wallet scope
   * Security check to prevent path traversal
   */
  private validatePath(path: string): void {
    const resolved = this.resolvePath(path);
    if (!resolved.startsWith(`/${this.walletAddress}`)) {
      throw new Error(`Path outside wallet scope: ${path}`);
    }
    
    // Check for path traversal attempts
    if (resolved.includes('../') || resolved.includes('..\\')) {
      throw new Error(`Invalid path: ${path}`);
    }
  }

  /**
   * Execute a tool by name with arguments
   */
  async executeTool(toolName: string, args: any): Promise<ToolExecutionResult> {
    try {
      logger.info('[ToolExecutor] Executing tool:', { toolName, args, walletAddress: this.walletAddress });

      switch (toolName) {
        case 'create_folder': {
          // Validate required parameters
          if (!args.path) {
            throw new Error('create_folder requires "path" parameter');
          }
          
          const path = this.resolvePath(args.path);
          this.validatePath(path);
          
          // Note: create_parents is already handled by createDirectory (it ensures parent directories exist)
          // The create_parents option is included for API compatibility but is always true
          const metadata = await this.filesystem.createDirectory(path, this.walletAddress);
          
          // Emit WebSocket event for live UI updates
          logger.info('[ToolExecutor] Checking WebSocket - io available:', !!this.io, 'io type:', typeof this.io, 'walletAddress:', this.walletAddress);
          if (this.io) {
            const pathParts = path.split('/').filter(p => p);
            pathParts.pop(); // Remove folder name
            const dirpath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
            const folderName = path.split('/').pop() || path;
            const dirUid = `uuid-${path.replace(/\//g, '-')}`;
            
            logger.info('[ToolExecutor] Broadcasting item.added event:', {
              name: folderName,
              path: path,
              dirpath: dirpath,
              walletAddress: this.walletAddress,
              uid: dirUid
            });
            
            try {
              broadcastItemAdded(this.io, this.walletAddress, {
                uid: dirUid,
                uuid: dirUid,
                name: folderName,
                path: path,
                dirpath: dirpath,
                size: 0,
                type: null,
                mime_type: undefined,
                is_dir: true,
                created: new Date(metadata.created_at).toISOString(),
                modified: new Date(metadata.updated_at).toISOString(),
                original_client_socket_id: null // CRITICAL: Set to null for AI operations so frontend processes the event
              });
              logger.info('[ToolExecutor] ✅ Successfully broadcasted item.added event for folder creation');
            } catch (error: any) {
              logger.error('[ToolExecutor] ❌ Failed to broadcast item.added event:', error.message, error.stack);
            }
          } else {
            logger.warn('[ToolExecutor] ⚠️ Cannot broadcast item.added - io is not available');
          }
          
          return { 
            success: true, 
            result: { 
              message: `Folder created successfully at ${path}`,
              path 
            } 
          };
        }

        case 'list_files': {
          // Log the original path argument for debugging
          logger.info('[ToolExecutor] list_files called with args.path:', args.path);
          
          const path = args.path 
            ? this.resolvePath(args.path)
            : `/${this.walletAddress}`;
          
          logger.info('[ToolExecutor] list_files resolved path:', path);
          this.validatePath(path);
          
          const showHidden = args.show_hidden === true;
          const detailed = args.detailed === true;
          const humanReadable = args.human_readable === true;
          const fileType = args.file_type || null;
          
          let files = this.filesystem.listDirectory(path, this.walletAddress);
          logger.info('[ToolExecutor] list_files found files:', files.length);
          
          // Filter hidden files if show_hidden is false
          if (!showHidden) {
            files = files.filter((f: any) => {
              const name = f.path.split('/').pop() || f.path;
              return !name.startsWith('.');
            });
          }
          
          // Filter by file type if specified
          if (fileType) {
            const typeLower = fileType.toLowerCase();
            files = files.filter((f: any) => {
              // Check file extension
              const name = f.path.split('/').pop() || f.path;
              const ext = name.split('.').pop()?.toLowerCase();
              
              // Check if it matches extension (e.g., "pdf", ".pdf")
              if (ext && (ext === typeLower || ext === typeLower.replace('.', ''))) {
                return true;
              }
              
              // Check MIME type if detailed info is available
              if (f.mime_type) {
                const mimeLower = f.mime_type.toLowerCase();
                // Match exact MIME type or main type (e.g., "application/pdf" or "application")
                if (mimeLower === typeLower || mimeLower.startsWith(typeLower + '/')) {
                  return true;
                }
              }
              
              return false;
            });
          }
          
          // Format file sizes for human-readable output
          const formatSize = (bytes: number): string => {
            if (!humanReadable) {
              return bytes.toString();
            }
            const KiB = bytes / 1024;
            const MiB = KiB / 1024;
            const GiB = MiB / 1024;
            const TiB = GiB / 1024;
            if (TiB >= 1) {
              return `${TiB.toFixed(2)} TiB`;
            } else if (GiB >= 1) {
              return `${GiB.toFixed(2)} GiB`;
            } else if (MiB >= 1) {
              return `${MiB.toFixed(2)} MiB`;
            } else if (KiB >= 1) {
              return `${KiB.toFixed(2)} KiB`;
            } else {
              return `${bytes} B`;
            }
          };
          
          // Map files to result format
          const mappedFiles = files.map((f: any) => {
            const name = f.path.split('/').pop() || f.path;
            const baseResult: any = {
              name,
              path: f.path,
            };
            
            if (detailed) {
              baseResult.is_dir = f.is_dir;
              baseResult.size = humanReadable ? formatSize(f.size) : f.size;
              baseResult.mime_type = f.mime_type || null;
              baseResult.created = new Date(f.created_at).toISOString();
              baseResult.modified = new Date(f.updated_at).toISOString();
            } else {
              // Basic info only
              baseResult.is_dir = f.is_dir;
              baseResult.size = f.size;
            }
            
            return baseResult;
          });
          
          return { 
            success: true, 
            result: { 
              path,
              files: mappedFiles,
              count: mappedFiles.length
            } 
          };
        }

        case 'read_file': {
          const path = this.resolvePath(args.path);
          this.validatePath(path);
          
          const content = await this.filesystem.readFile(path, this.walletAddress);
          const contentString = content.toString('utf8');
          
          // Truncate very large files to avoid token limits
          const MAX_FILE_LENGTH = 50000;
          if (contentString.length > MAX_FILE_LENGTH) {
            const truncated = contentString.substring(0, MAX_FILE_LENGTH);
            return {
              success: true,
              result: {
                path,
                content: truncated,
                truncated: true,
                original_length: contentString.length,
                message: `File content truncated to ${MAX_FILE_LENGTH} characters. File is very large.`
              }
            };
          }
          
          return { 
            success: true, 
            result: { 
              path,
              content: contentString
            } 
          };
        }

        case 'write_file': {
          // Validate required parameters
          if (!args.path) {
            throw new Error('write_file requires "path" parameter');
          }
          if (args.content === undefined || args.content === null) {
            throw new Error('write_file requires "content" parameter. Cannot write empty file without explicit content.');
          }
          
          const path = this.resolvePath(args.path);
          this.validatePath(path);
          
          const content = args.content || '';
          const mimeType = args.mime_type || 'text/plain';
          
          const metadata = await this.filesystem.writeFile(path, content, this.walletAddress, {
            mimeType
          });
          
          // Emit WebSocket event for live UI updates
          if (this.io) {
            const pathParts = path.split('/').filter(p => p);
            pathParts.pop(); // Remove file name
            const dirpath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
            const fileName = path.split('/').pop() || path;
            const fileUid = `uuid-${path.replace(/\//g, '-')}`;
            
            broadcastItemAdded(this.io, this.walletAddress, {
              uid: fileUid,
              uuid: fileUid,
              name: fileName,
              path: path,
              dirpath: dirpath,
              size: metadata.size || content.length,
              type: mimeType,
              mime_type: mimeType,
              is_dir: false,
              created: new Date(metadata.created_at).toISOString(),
              modified: new Date(metadata.updated_at).toISOString(),
              original_client_socket_id: null // CRITICAL: Set to null for AI operations so frontend processes the event
            });
            logger.info('[ToolExecutor] Broadcasted item.added event for file write');
          }
          
          return { 
            success: true, 
            result: { 
              message: `File written successfully at ${path}`,
              path 
            } 
          };
        }

        case 'delete_file': {
          const path = this.resolvePath(args.path);
          this.validatePath(path);
          
          const recursive = args.recursive === true;
          await this.filesystem.deleteFile(path, this.walletAddress, recursive);
          
          // Emit WebSocket event for live UI updates
          if (this.io) {
            broadcastItemRemoved(this.io, this.walletAddress, {
              path: path,
              uid: `uuid-${path.replace(/\//g, '-')}`,
              original_client_socket_id: null // CRITICAL: Set to null for AI operations so frontend processes the event
            });
            logger.info('[ToolExecutor] Broadcasted item.removed event for file deletion');
          }
          
          return { 
            success: true, 
            result: { 
              message: `File deleted successfully: ${path}`,
              path 
            } 
          };
        }

        case 'move_file': {
          // Handle alternative parameter names (AI sometimes uses different names)
          const fromPath = this.resolvePath(args.from_path || args.sourcePath || args.from || args.source);
          const toPath = this.resolvePath(args.to_path || args.destinationPath || args.to || args.destination);
          
          if (!fromPath || fromPath === '/') {
            throw new Error('move_file requires "from_path" (or "sourcePath") parameter');
          }
          if (!toPath || toPath === '/') {
            throw new Error('move_file requires "to_path" (or "destinationPath") parameter');
          }
          
          this.validatePath(fromPath);
          this.validatePath(toPath);
          
          await this.filesystem.moveFile(fromPath, toPath, this.walletAddress);
          
          // Emit WebSocket event for live UI updates
          if (this.io) {
            const fileName = toPath.split('/').pop() || toPath;
            
            broadcastItemMoved(this.io, this.walletAddress, {
              old_path: fromPath,
              path: toPath,
              name: fileName,
              uid: `uuid-${toPath.replace(/\//g, '-')}`,
              original_client_socket_id: null // CRITICAL: Set to null for AI operations so frontend processes the event
            });
            logger.info('[ToolExecutor] Broadcasted item.moved event for file move');
          }
          
          return { 
            success: true, 
            result: { 
              message: `File moved from ${fromPath} to ${toPath}`,
              from_path: fromPath, 
              to_path: toPath 
            } 
          };
        }

        case 'copy_file': {
          const fromPath = this.resolvePath(args.from_path);
          const toPath = this.resolvePath(args.to_path);
          
          this.validatePath(fromPath);
          this.validatePath(toPath);
          
          const metadata = await this.filesystem.copyFile(fromPath, toPath, this.walletAddress);
          
          // Emit WebSocket event for live UI updates
          if (this.io) {
            const pathParts = toPath.split('/').filter(p => p);
            pathParts.pop(); // Remove file name
            const dirpath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
            const fileName = toPath.split('/').pop() || toPath;
            const fileUid = `uuid-${toPath.replace(/\//g, '-')}`;
            
            broadcastItemAdded(this.io, this.walletAddress, {
              uid: fileUid,
              uuid: fileUid,
              name: fileName,
              path: toPath,
              dirpath: dirpath,
              size: metadata.size || 0,
              type: metadata.mime_type,
              mime_type: metadata.mime_type || undefined,
              is_dir: metadata.is_dir,
              created: new Date(metadata.created_at).toISOString(),
              modified: new Date(metadata.updated_at).toISOString(),
              original_client_socket_id: null // CRITICAL: Set to null for AI operations so frontend processes the event
            });
            logger.info('[ToolExecutor] Broadcasted item.added event for file copy');
          }
          
          return { 
            success: true, 
            result: { 
              message: `File copied from ${fromPath} to ${toPath}`,
              from_path: fromPath, 
              to_path: toPath 
            } 
          };
        }

        case 'stat': {
          const path = this.resolvePath(args.path);
          this.validatePath(path);
          
          const metadata = this.filesystem.getFileMetadata(path, this.walletAddress);
          if (!metadata) {
            return {
              success: false,
              error: `File or folder not found: ${path}`
            };
          }
          
          return {
            success: true,
            result: {
              path: metadata.path,
              name: metadata.path.split('/').pop() || metadata.path,
              size: metadata.size,
              mime_type: metadata.mime_type,
              is_dir: metadata.is_dir,
              is_public: metadata.is_public,
              created: new Date(metadata.created_at).toISOString(),
              modified: new Date(metadata.updated_at).toISOString()
            }
          };
        }

        case 'rename': {
          // Validate required parameters
          if (!args.path) {
            throw new Error('rename requires "path" parameter');
          }
          if (!args.new_name) {
            throw new Error('rename requires "new_name" parameter. Cannot rename without specifying the new name.');
          }
          
          const path = this.resolvePath(args.path);
          const newName = args.new_name;
          
          this.validatePath(path);
          
          // Construct new path by replacing the last part (filename/foldername)
          const pathParts = path.split('/').filter(p => p);
          pathParts.pop(); // Remove old name
          const newPath = pathParts.length > 0 
            ? '/' + pathParts.join('/') + '/' + newName
            : '/' + newName;
          
          // Resolve the new path to ensure it's wallet-scoped
          const resolvedNewPath = this.resolvePath(newPath);
          this.validatePath(resolvedNewPath);
          
          await this.filesystem.moveFile(path, resolvedNewPath, this.walletAddress);
          
          // Emit WebSocket event for live UI updates
          if (this.io) {
            const fileName = resolvedNewPath.split('/').pop() || resolvedNewPath;
            
            broadcastItemMoved(this.io, this.walletAddress, {
              old_path: path,
              path: resolvedNewPath,
              name: fileName,
              uid: `uuid-${resolvedNewPath.replace(/\//g, '-')}`,
              original_client_socket_id: null // CRITICAL: Set to null for AI operations so frontend processes the event
            });
            logger.info('[ToolExecutor] Broadcasted item.moved event for rename');
          }
          
          return { 
            success: true, 
            result: { 
              message: `Renamed from ${path} to ${resolvedNewPath}`,
              old_path: path,
              new_path: resolvedNewPath 
            } 
          };
        }

        case 'grep_file': {
          // Validate required parameters
          if (!args.path) {
            throw new Error('grep_file requires "path" parameter');
          }
          if (!args.pattern) {
            throw new Error('grep_file requires "pattern" parameter');
          }
          
          const path = this.resolvePath(args.path);
          this.validatePath(path);
          
          // Read file content
          const content = await this.filesystem.readFile(path, this.walletAddress);
          const contentString = content.toString('utf8');
          const lines = contentString.split('\n');
          
          const pattern = args.pattern;
          const caseSensitive = args.case_sensitive === true;
          const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
          
          // Search for matching lines
          const matches: Array<{ line_number: number; line: string }> = [];
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const searchLine = caseSensitive ? line : line.toLowerCase();
            if (searchLine.includes(searchPattern)) {
              matches.push({
                line_number: i + 1, // Line numbers start at 1
                line: line
              });
            }
          }
          
          return {
            success: true,
            result: {
              path,
              pattern,
              case_sensitive: caseSensitive,
              matches,
              match_count: matches.length
            }
          };
        }

        case 'read_file_lines': {
          // Validate required parameters
          if (!args.path) {
            throw new Error('read_file_lines requires "path" parameter');
          }
          
          const path = this.resolvePath(args.path);
          this.validatePath(path);
          
          // Read file content
          const content = await this.filesystem.readFile(path, this.walletAddress);
          const contentString = content.toString('utf8');
          const lines = contentString.split('\n');
          
          let resultLines: Array<{ line_number: number; line: string }> = [];
          
          if (args.first !== undefined) {
            // Read first N lines
            const count = Math.max(0, Math.min(args.first, lines.length));
            resultLines = lines.slice(0, count).map((line, index) => ({
              line_number: index + 1,
              line: line
            }));
          } else if (args.last !== undefined) {
            // Read last N lines
            const count = Math.max(0, Math.min(args.last, lines.length));
            const startIndex = Math.max(0, lines.length - count);
            resultLines = lines.slice(startIndex).map((line, index) => ({
              line_number: startIndex + index + 1,
              line: line
            }));
          } else if (args.range) {
            // Parse range (format: "start:end")
            const rangeMatch = args.range.match(/^(\d+):(\d+)$/);
            if (!rangeMatch) {
              throw new Error('Invalid range format. Use "start:end" (e.g., "10:20")');
            }
            const start = parseInt(rangeMatch[1], 10) - 1; // Convert to 0-based
            const end = parseInt(rangeMatch[2], 10); // End is inclusive, so use as-is
            if (start < 0 || end < start || start >= lines.length) {
              throw new Error(`Invalid range: ${args.range}. File has ${lines.length} lines.`);
            }
            const actualEnd = Math.min(end, lines.length);
            resultLines = lines.slice(start, actualEnd).map((line, index) => ({
              line_number: start + index + 1,
              line: line
            }));
          } else {
            // No option specified, return all lines
            resultLines = lines.map((line, index) => ({
              line_number: index + 1,
              line: line
            }));
          }
          
          return {
            success: true,
            result: {
              path,
              lines: resultLines,
              total_lines: lines.length,
              returned_lines: resultLines.length
            }
          };
        }

        case 'count_file': {
          // Validate required parameters
          if (!args.path) {
            throw new Error('count_file requires "path" parameter');
          }
          
          const path = this.resolvePath(args.path);
          this.validatePath(path);
          
          // Read file content
          const content = await this.filesystem.readFile(path, this.walletAddress);
          const contentString = content.toString('utf8');
          
          // Count statistics
          const lines = contentString.split('\n');
          const lineCount = lines.length;
          // Last line might be empty if file ends with newline
          const actualLineCount = contentString.endsWith('\n') ? lineCount - 1 : lineCount;
          
          const words = contentString.trim().split(/\s+/).filter(w => w.length > 0);
          const wordCount = words.length;
          
          const charCount = contentString.length;
          const charCountNoSpaces = contentString.replace(/\s/g, '').length;
          
          return {
            success: true,
            result: {
              path,
              lines: actualLineCount,
              words: wordCount,
              characters: charCount,
              characters_no_spaces: charCountNoSpaces
            }
          };
        }

        case 'get_filename': {
          // Validate required parameters
          if (!args.path) {
            throw new Error('get_filename requires "path" parameter');
          }
          
          // Don't resolve path for this utility - we want to extract from the provided path
          // But still validate it's a valid path format
          const path = args.path;
          const filename = path.split('/').pop() || path;
          
          return {
            success: true,
            result: {
              path,
              filename
            }
          };
        }

        case 'get_directory': {
          // Validate required parameters
          if (!args.path) {
            throw new Error('get_directory requires "path" parameter');
          }
          
          // Don't resolve path for this utility - we want to extract from the provided path
          const path = args.path;
          const pathParts = path.split('/').filter((p: string) => p);
          pathParts.pop(); // Remove filename
          const directory = pathParts.length > 0 
            ? '/' + pathParts.join('/')
            : '/';
          
          return {
            success: true,
            result: {
              path,
              directory
            }
          };
        }

        case 'touch_file': {
          // Validate required parameters
          if (!args.path) {
            throw new Error('touch_file requires "path" parameter');
          }
          
          const path = this.resolvePath(args.path);
          this.validatePath(path);
          
          // Check if file exists
          const metadata = this.filesystem.getFileMetadata(path, this.walletAddress);
          
          if (metadata) {
            // File exists - update timestamp
            // For directories, we can't update timestamp directly, so we'll skip
            // For files, we'll read and re-write to update the timestamp
            if (metadata.is_dir) {
              // Directories can't be "touched" - return success but no-op
              return {
                success: true,
                result: {
                  message: `Directory exists at ${path} (directories cannot have timestamps updated)`,
                  path,
                  existed: true,
                  is_directory: true
                }
              };
            }
            
            // Read existing content and re-write to update timestamp
            const content = await this.filesystem.readFile(path, this.walletAddress);
            const mimeType = metadata.mime_type || undefined;
            
            await this.filesystem.writeFile(path, content, this.walletAddress, {
              mimeType
            });
            
            // Emit WebSocket event for live UI updates
            if (this.io) {
              const pathParts = path.split('/').filter(p => p);
              pathParts.pop(); // Remove file name
              const dirpath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
              const fileName = path.split('/').pop() || path;
              const fileUid = `uuid-${path.replace(/\//g, '-')}`;
              
              broadcastItemUpdated(this.io, this.walletAddress, {
                path: path,
                uid: fileUid,
                name: fileName,
                size: metadata.size || 0,
                type: mimeType,
                is_dir: metadata.is_dir,
                modified: new Date().toISOString(),
                original_client_socket_id: null
              });
              logger.info('[ToolExecutor] Broadcasted item.updated event for touch_file');
            }
            
            return {
              success: true,
              result: {
                message: `File timestamp updated at ${path}`,
                path,
                existed: true
              }
            };
          } else {
            // File doesn't exist - create empty file
            await this.filesystem.writeFile(path, '', this.walletAddress, {
              mimeType: 'text/plain'
            });
            
            // Emit WebSocket event for live UI updates
            if (this.io) {
              const pathParts = path.split('/').filter(p => p);
              pathParts.pop(); // Remove file name
              const dirpath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
              const fileName = path.split('/').pop() || path;
              const fileUid = `uuid-${path.replace(/\//g, '-')}`;
              
              const newMetadata = this.filesystem.getFileMetadata(path, this.walletAddress);
              if (newMetadata) {
                broadcastItemAdded(this.io, this.walletAddress, {
                  uid: fileUid,
                  uuid: fileUid,
                  name: fileName,
                  path: path,
                  dirpath: dirpath,
                  size: 0,
                  type: 'text/plain',
                  mime_type: 'text/plain',
                  is_dir: false,
                  created: new Date(newMetadata.created_at).toISOString(),
                  modified: new Date(newMetadata.updated_at).toISOString(),
                  original_client_socket_id: null
                });
                logger.info('[ToolExecutor] Broadcasted item.added event for touch_file');
              }
            }
            
            return {
              success: true,
              result: {
                message: `Empty file created at ${path}`,
                path,
                existed: false
              }
            };
          }
        }

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error: any) {
      logger.error('[ToolExecutor] Tool execution failed:', {
        toolName,
        args,
        error: error.message,
        stack: error.stack
      });
      
      return { 
        success: false, 
        error: error.message || 'Tool execution failed' 
      };
    }
  }
}

