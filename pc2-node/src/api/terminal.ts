/**
 * Terminal API Endpoints
 * 
 * REST API for terminal management and command execution.
 * Includes programmatic command execution for AI agents.
 * 
 * Endpoints:
 * - GET  /api/terminal/status - Check terminal availability
 * - GET  /api/terminal/stats - Get user's terminal sessions
 * - GET  /api/terminal/admin/stats - Get global stats (owner only)
 * - POST /api/terminal/destroy-all - Destroy all user sessions
 * - POST /api/terminal/exec - Execute a command (for agents)
 * - POST /api/terminal/script - Execute a script file (for agents)
 */

import { Request, Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
import { getTerminalService } from '../services/terminal/TerminalService.js';
import { logger } from '../utils/logger.js';
import { exec, spawn as nodeSpawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { promisify } from 'util';

const execPromise = promisify(exec);

/**
 * Get terminal stats for the current user
 * GET /api/terminal/stats
 */
export function handleTerminalStats(req: AuthenticatedRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const terminalService = getTerminalService();
    const sessions = terminalService.getUserSessions(req.user.wallet_address);
    
    res.json({
      success: true,
      sessions: sessions.map(s => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        lastActivity: s.lastActivity.toISOString(),
        cols: s.cols,
        rows: s.rows,
      })),
      count: sessions.length,
    });
  } catch (error: any) {
    logger.error('[Terminal API] Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get terminal stats' });
  }
}

/**
 * Get global terminal stats (admin only - for owner wallet)
 * GET /api/terminal/admin/stats
 */
export function handleTerminalAdminStats(req: AuthenticatedRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Check if user is the owner
  const config = req.app.locals.config;
  if (!config || config.owner.wallet_address?.toLowerCase() !== req.user.wallet_address.toLowerCase()) {
    res.status(403).json({ error: 'Forbidden - Owner access required' });
    return;
  }

  try {
    const terminalService = getTerminalService();
    const stats = terminalService.getStats();
    
    res.json({
      success: true,
      ...stats,
    });
  } catch (error: any) {
    logger.error('[Terminal API] Error getting admin stats:', error);
    res.status(500).json({ error: 'Failed to get terminal admin stats' });
  }
}

/**
 * Destroy all terminal sessions for the current user
 * POST /api/terminal/destroy-all
 */
export function handleDestroyAllTerminals(req: AuthenticatedRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const terminalService = getTerminalService();
    const count = terminalService.destroyAllUserSessions(req.user.wallet_address);
    
    logger.info(`[Terminal API] User ${req.user.wallet_address} destroyed ${count} terminal sessions`);
    
    res.json({
      success: true,
      destroyed: count,
    });
  } catch (error: any) {
    logger.error('[Terminal API] Error destroying terminals:', error);
    res.status(500).json({ error: 'Failed to destroy terminals' });
  }
}

/**
 * Check if terminal feature is available
 * GET /api/terminal/status
 */
export function handleTerminalStatus(req: Request, res: Response): void {
  try {
    // Check if node-pty is available
    let nodeptyAvailable = false;
    try {
      require.resolve('node-pty');
      nodeptyAvailable = true;
    } catch {
      nodeptyAvailable = false;
    }
    
    // Get terminal service status
    const terminalService = getTerminalService();
    const isolationMode = terminalService.getEffectiveIsolationMode();
    const isAvailable = terminalService.isAvailable();
    
    let message = '';
    if (!nodeptyAvailable) {
      message = 'Terminal service unavailable - node-pty not installed';
    } else if (!isAvailable) {
      message = 'Terminal feature is disabled on this node';
    } else if (isolationMode === 'namespace') {
      message = 'Terminal available with namespace isolation (multi-user safe)';
    } else {
      message = 'Terminal available (single-user mode - no isolation)';
    }
    
    res.json({
      available: nodeptyAvailable && isAvailable,
      nodeptyInstalled: nodeptyAvailable,
      isolationMode,
      isMultiUserSafe: isolationMode === 'namespace',
      message,
      securityWarning: isolationMode === 'none' 
        ? 'This node is running in single-user mode. Multiple users sharing this terminal have full access to each other\'s data.'
        : null,
    });
  } catch (error: any) {
    logger.error('[Terminal API] Error checking status:', error);
    res.status(500).json({ 
      available: false,
      error: 'Failed to check terminal status',
    });
  }
}

// ============================================================================
// Command Execution API (for AI Agents)
// ============================================================================

interface ExecRequest {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;  // milliseconds, default 30000
  shell?: boolean;   // run in shell, default true
}

interface ExecResponse {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  duration: number;  // milliseconds
  killed?: boolean;  // true if killed due to timeout
  error?: string;
}

/**
 * Get user's home directory for terminal operations
 */
function getUserHome(walletAddress: string, userHomesBase: string): string {
  const normalizedWallet = walletAddress.toLowerCase();
  let basePath = userHomesBase;
  if (!path.isAbsolute(basePath)) {
    basePath = path.resolve(process.cwd(), basePath);
  }
  const userHome = path.join(basePath, 'terminal-homes', normalizedWallet);
  
  // Ensure the directory exists
  if (!fs.existsSync(userHome)) {
    fs.mkdirSync(userHome, { recursive: true });
  }
  
  return userHome;
}

/**
 * Create sanitized environment for command execution
 */
function createSafeEnv(walletAddress: string, userHome: string, additionalEnv?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  
  // Copy only safe environment variables
  const safeVars = ['PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'TZ'];
  for (const varName of safeVars) {
    if (process.env[varName]) {
      env[varName] = process.env[varName]!;
    }
  }
  
  // Set secure defaults
  env['HOME'] = userHome;
  env['USER'] = walletAddress.toLowerCase().substring(0, 8);
  env['PWD'] = userHome;
  env['PC2_WALLET'] = walletAddress.toLowerCase();
  env['PC2_HOME'] = userHome;
  env['PC2_AGENT'] = '1';  // Flag for agent execution
  
  // Merge additional env vars (user-provided, filtered for safety)
  if (additionalEnv) {
    const blockedVars = ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'PATH', 'HOME', 'USER'];
    for (const [key, value] of Object.entries(additionalEnv)) {
      if (!blockedVars.includes(key.toUpperCase())) {
        env[key] = value;
      }
    }
  }
  
  return env;
}

/**
 * Execute a command and return the result
 * POST /api/terminal/exec
 * 
 * Request body:
 * {
 *   command: string,      // Command to execute
 *   args?: string[],      // Optional arguments
 *   cwd?: string,         // Working directory (relative to user home)
 *   env?: object,         // Additional environment variables
 *   timeout?: number,     // Timeout in ms (default 30000, max 300000)
 *   shell?: boolean       // Run in shell (default true)
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   exitCode: number | null,
 *   stdout: string,
 *   stderr: string,
 *   duration: number,
 *   killed?: boolean,
 *   error?: string
 * }
 */
export async function handleExecCommand(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const terminalService = getTerminalService();
  if (!terminalService.isAvailable()) {
    res.status(503).json({ error: 'Terminal service is disabled on this node' });
    return;
  }

  const body = req.body as ExecRequest;
  
  // Validate request
  if (!body.command || typeof body.command !== 'string') {
    res.status(400).json({ error: 'Command is required' });
    return;
  }

  // Limit command length
  if (body.command.length > 10000) {
    res.status(400).json({ error: 'Command too long (max 10000 chars)' });
    return;
  }

  // Set timeout (default 30s, max 5 minutes)
  const timeout = Math.min(body.timeout || 30000, 300000);
  
  // Get user's home directory
  const config = req.app.locals.config;
  const userHomesBase = config?.paths?.data || './data';
  const userHome = getUserHome(req.user.wallet_address, userHomesBase);
  
  // Determine working directory
  let cwd = userHome;
  if (body.cwd) {
    // Resolve relative to user home, prevent path traversal
    const resolvedCwd = path.resolve(userHome, body.cwd);
    if (resolvedCwd.startsWith(userHome)) {
      cwd = resolvedCwd;
    } else {
      res.status(400).json({ error: 'Invalid working directory - must be within user home' });
      return;
    }
  }
  
  // Ensure cwd exists
  if (!fs.existsSync(cwd)) {
    fs.mkdirSync(cwd, { recursive: true });
  }

  // Create environment
  const env = createSafeEnv(req.user.wallet_address, userHome, body.env);
  
  const startTime = Date.now();
  
  logger.info(`[Terminal Exec] User ${req.user.wallet_address.substring(0, 10)} executing: ${body.command.substring(0, 100)}${body.command.length > 100 ? '...' : ''}`);

  try {
    // Build full command with args
    let fullCommand = body.command;
    if (body.args && body.args.length > 0) {
      // Escape args for shell
      const escapedArgs = body.args.map(arg => `"${arg.replace(/"/g, '\\"')}"`);
      fullCommand = `${body.command} ${escapedArgs.join(' ')}`;
    }

    const result = await new Promise<ExecResponse>((resolve) => {
      exec(fullCommand, {
        cwd,
        env,
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB max output
        shell: body.shell !== false ? (os.platform() === 'win32' ? 'cmd.exe' : '/bin/bash') : undefined,
      }, (error, stdout, stderr) => {
        const duration = Date.now() - startTime;
        
        if (error) {
          // Check if it was killed due to timeout
          const killed = error.killed || false;
          resolve({
            success: false,
            exitCode: error.code || null,
            stdout: stdout?.substring(0, 5 * 1024 * 1024) || '',
            stderr: stderr?.substring(0, 1 * 1024 * 1024) || '',
            duration,
            killed,
            error: killed ? 'Command timed out' : error.message,
          });
        } else {
          resolve({
            success: true,
            exitCode: 0,
            stdout: stdout?.substring(0, 5 * 1024 * 1024) || '',
            stderr: stderr?.substring(0, 1 * 1024 * 1024) || '',
            duration,
          });
        }
      });
    });

    logger.info(`[Terminal Exec] Command completed: exitCode=${result.exitCode}, duration=${result.duration}ms`);
    res.json(result);
    
  } catch (error: any) {
    logger.error('[Terminal Exec] Error:', error);
    res.status(500).json({
      success: false,
      exitCode: null,
      stdout: '',
      stderr: '',
      duration: Date.now() - startTime,
      error: error.message,
    });
  }
}

/**
 * Execute a script file
 * POST /api/terminal/script
 * 
 * Request body:
 * {
 *   script: string,       // Script content
 *   interpreter?: string, // Interpreter (default: /bin/bash, options: /bin/sh, python3, node)
 *   cwd?: string,         // Working directory
 *   env?: object,         // Additional environment variables
 *   timeout?: number      // Timeout in ms (default 60000, max 600000)
 * }
 */
export async function handleExecScript(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const terminalService = getTerminalService();
  if (!terminalService.isAvailable()) {
    res.status(503).json({ error: 'Terminal service is disabled on this node' });
    return;
  }

  const body = req.body as {
    script: string;
    interpreter?: string;
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
  };
  
  // Validate request
  if (!body.script || typeof body.script !== 'string') {
    res.status(400).json({ error: 'Script content is required' });
    return;
  }

  // Limit script size
  if (body.script.length > 1000000) {
    res.status(400).json({ error: 'Script too large (max 1MB)' });
    return;
  }

  // Validate interpreter
  const allowedInterpreters = ['/bin/bash', '/bin/sh', 'python3', 'python', 'node', 'ruby', 'perl'];
  const interpreter = body.interpreter || '/bin/bash';
  if (!allowedInterpreters.includes(interpreter)) {
    res.status(400).json({ error: `Invalid interpreter. Allowed: ${allowedInterpreters.join(', ')}` });
    return;
  }

  // Set timeout (default 60s, max 10 minutes for scripts)
  const timeout = Math.min(body.timeout || 60000, 600000);
  
  // Get user's home directory
  const config = req.app.locals.config;
  const userHomesBase = config?.paths?.data || './data';
  const userHome = getUserHome(req.user.wallet_address, userHomesBase);
  
  // Determine working directory
  let cwd = userHome;
  if (body.cwd) {
    const resolvedCwd = path.resolve(userHome, body.cwd);
    if (resolvedCwd.startsWith(userHome)) {
      cwd = resolvedCwd;
    } else {
      res.status(400).json({ error: 'Invalid working directory' });
      return;
    }
  }

  // Create temporary script file
  const tempDir = path.join(userHome, '.tmp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const scriptId = `script_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const scriptPath = path.join(tempDir, scriptId);
  
  try {
    // Write script to temp file
    fs.writeFileSync(scriptPath, body.script, { mode: 0o700 });
    
    // Execute via the exec endpoint logic
    const execReq = {
      ...req,
      body: {
        command: interpreter,
        args: [scriptPath],
        cwd,
        env: body.env,
        timeout,
        shell: false,
      },
    } as AuthenticatedRequest;
    
    await handleExecCommand(execReq, res);
    
  } finally {
    // Clean up temp file
    try {
      if (fs.existsSync(scriptPath)) {
        fs.unlinkSync(scriptPath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * List available tools for AI agents
 * GET /api/terminal/tools
 * 
 * Returns a list of available commands/tools that agents can use.
 * This helps agents discover what capabilities are available.
 */
export function handleListTools(req: AuthenticatedRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const terminalService = getTerminalService();
  const isAvailable = terminalService.isAvailable();
  const isolationMode = terminalService.getEffectiveIsolationMode();

  // Define available tools
  const tools = [
    {
      name: 'exec',
      endpoint: 'POST /api/terminal/exec',
      description: 'Execute a shell command and return the output',
      parameters: {
        command: { type: 'string', required: true, description: 'Command to execute' },
        args: { type: 'string[]', required: false, description: 'Command arguments' },
        cwd: { type: 'string', required: false, description: 'Working directory (relative to user home)' },
        env: { type: 'object', required: false, description: 'Additional environment variables' },
        timeout: { type: 'number', required: false, description: 'Timeout in ms (default 30000, max 300000)' },
        shell: { type: 'boolean', required: false, description: 'Run in shell (default true)' },
      },
      returns: {
        success: 'boolean',
        exitCode: 'number | null',
        stdout: 'string',
        stderr: 'string',
        duration: 'number',
        killed: 'boolean (if timeout)',
        error: 'string (if error)',
      },
    },
    {
      name: 'script',
      endpoint: 'POST /api/terminal/script',
      description: 'Execute a script with a specified interpreter',
      parameters: {
        script: { type: 'string', required: true, description: 'Script content' },
        interpreter: { type: 'string', required: false, description: 'Interpreter (bash, python3, node, etc.)' },
        cwd: { type: 'string', required: false, description: 'Working directory' },
        env: { type: 'object', required: false, description: 'Environment variables' },
        timeout: { type: 'number', required: false, description: 'Timeout in ms (default 60000)' },
      },
    },
    {
      name: 'file_read',
      endpoint: 'GET /read',
      description: 'Read a file from the filesystem',
      parameters: {
        path: { type: 'string', required: true, description: 'File path' },
      },
    },
    {
      name: 'file_write',
      endpoint: 'POST /write',
      description: 'Write content to a file',
      parameters: {
        path: { type: 'string', required: true, description: 'File path' },
        content: { type: 'string', required: true, description: 'File content' },
      },
    },
    {
      name: 'file_list',
      endpoint: 'POST /readdir',
      description: 'List directory contents',
      parameters: {
        path: { type: 'string', required: true, description: 'Directory path' },
      },
    },
  ];

  res.json({
    available: isAvailable,
    isolationMode,
    tools: isAvailable ? tools : [],
    note: isAvailable 
      ? 'Commands execute in user\'s isolated home directory' 
      : 'Terminal service is disabled on this node',
  });
}
