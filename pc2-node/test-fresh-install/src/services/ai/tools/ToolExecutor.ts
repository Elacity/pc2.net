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
   */
  private resolvePath(path: string): string {
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
    if (path.startsWith('~') && !path.includes('/') && path.length > 1) {
      const folderName = path.substring(1); // Get folder name after ~
      path = `~/Desktop/${folderName}`;
      logger.info(`[ToolExecutor] Fixed path from "~${folderName}" to "${path}" (defaulted to Desktop)`);
    }
    // Fix "FolderName" (no ~ at all) -> "~/Desktop/FolderName" (default to Desktop)
    // This handles cases like "MyFolder" where user didn't specify a directory
    if (!path.startsWith('~') && !path.startsWith('/') && !path.includes('/')) {
      path = `~/Desktop/${path}`;
      logger.info(`[ToolExecutor] Fixed path to "${path}" (defaulted to Desktop)`);
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
          const path = this.resolvePath(args.path);
          this.validatePath(path);
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
          const path = args.path 
            ? this.resolvePath(args.path)
            : `/${this.walletAddress}`;
          this.validatePath(path);
          
          const files = this.filesystem.listDirectory(path, this.walletAddress);
          return { 
            success: true, 
            result: { 
              path,
              files: files.map((f: any) => ({
                name: f.path.split('/').pop() || f.path,
                path: f.path,
                is_dir: f.is_dir,
                size: f.size,
                mime_type: f.mime_type,
                modified: f.updated_at
              }))
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

