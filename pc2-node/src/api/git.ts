/**
 * Git Integration API for Agent Development Workflows
 * Provides a structured interface to git operations
 */

import { Response, Router } from 'express';
import { AuthenticatedRequest, authenticate } from './middleware.js';
import { logger } from '../utils/logger.js';
import { exec, ExecOptions } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);
const router = Router();

/**
 * Maximum allowed timeout for git operations (5 minutes)
 */
const MAX_GIT_TIMEOUT = 300000;

/**
 * Get user's terminal home directory
 */
function getUserHome(walletAddress: string): string {
  return path.join(process.cwd(), 'data', 'terminal-homes', walletAddress);
}

/**
 * Validate path is within user's home directory
 */
function isPathSafe(userHome: string, targetPath: string): boolean {
  const resolved = path.resolve(userHome, targetPath);
  return resolved.startsWith(userHome);
}

/**
 * Execute git command in user's directory
 */
async function execGit(
  command: string,
  cwd: string,
  timeout: number = 60000
): Promise<{ stdout: string; stderr: string }> {
  const options: ExecOptions = {
    cwd,
    timeout: Math.min(timeout, MAX_GIT_TIMEOUT),
    maxBuffer: 10 * 1024 * 1024, // 10MB output buffer
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0', // Disable git prompts
      GIT_SSH_COMMAND: 'ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes',
    },
  };

  try {
    const result = await execAsync(command, options);
    return { 
      stdout: String(result.stdout || ''), 
      stderr: String(result.stderr || '') 
    };
  } catch (error: any) {
    // exec throws on non-zero exit codes, but we want to return the output
    if (error.stdout !== undefined || error.stderr !== undefined) {
      return { 
        stdout: String(error.stdout || ''), 
        stderr: String(error.stderr || '') 
      };
    }
    throw error;
  }
}

interface GitCloneRequest {
  url: string;
  destination?: string;
  branch?: string;
  depth?: number;
}

/**
 * Clone a git repository
 * POST /api/git/clone
 */
async function handleGitClone(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = req.body as GitCloneRequest;
  const userHome = getUserHome(req.user.wallet_address);

  if (!body.url) {
    res.status(400).json({ error: 'Missing required parameter: url' });
    return;
  }

  // Validate URL
  if (!body.url.startsWith('https://') && !body.url.startsWith('git@')) {
    res.status(400).json({ error: 'Only HTTPS and SSH git URLs are supported' });
    return;
  }

  // Determine destination
  let destination = body.destination || '';
  if (!destination) {
    // Extract repo name from URL
    const urlParts = body.url.split('/');
    const repoName = urlParts[urlParts.length - 1].replace(/\.git$/, '');
    destination = repoName;
  }

  if (!isPathSafe(userHome, destination)) {
    res.status(400).json({ error: 'Invalid destination path' });
    return;
  }

  const fullPath = path.join(userHome, destination);

  // Build command
  let command = `git clone`;
  if (body.branch) {
    command += ` --branch ${body.branch}`;
  }
  if (body.depth && body.depth > 0) {
    command += ` --depth ${body.depth}`;
  }
  command += ` "${body.url}" "${fullPath}"`;

  logger.info('[Git] Cloning repository', {
    url: body.url,
    destination: fullPath,
    wallet: req.user.wallet_address
  });

  try {
    await fs.mkdir(userHome, { recursive: true });
    const result = await execGit(command, userHome, 120000);

    logger.info('[Git] Clone completed', {
      destination: fullPath,
      hasOutput: !!result.stdout || !!result.stderr
    });

    res.json({
      success: true,
      path: destination,
      full_path: fullPath,
      output: result.stderr || result.stdout, // git outputs to stderr
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Git] Clone failed', { error: errorMessage });
    res.status(500).json({
      error: 'Clone failed',
      message: errorMessage
    });
  }
}

interface GitStatusRequest {
  path?: string;
}

/**
 * Get git status
 * POST /api/git/status
 */
async function handleGitStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = req.body as GitStatusRequest;
  const userHome = getUserHome(req.user.wallet_address);
  const repoPath = body.path || '.';

  if (!isPathSafe(userHome, repoPath)) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  const fullPath = path.join(userHome, repoPath);

  try {
    // Get status with porcelain format for easy parsing
    const statusResult = await execGit('git status --porcelain', fullPath);
    const branchResult = await execGit('git branch --show-current', fullPath);
    const logResult = await execGit('git log -1 --format="%H|%s|%an|%ad" --date=iso', fullPath);

    // Parse porcelain status
    const changes = statusResult.stdout
      .trim()
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => ({
        status: line.substring(0, 2).trim(),
        path: line.substring(3),
      }));

    // Parse last commit
    const lastCommitParts = logResult.stdout.trim().split('|');
    const lastCommit = lastCommitParts[0] ? {
      hash: lastCommitParts[0],
      message: lastCommitParts[1] || '',
      author: lastCommitParts[2] || '',
      date: lastCommitParts[3] || '',
    } : null;

    res.json({
      success: true,
      branch: branchResult.stdout.trim(),
      clean: changes.length === 0,
      changes,
      last_commit: lastCommit,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Git] Status failed', { error: errorMessage });
    res.status(500).json({
      error: 'Status failed',
      message: errorMessage
    });
  }
}

interface GitCommitRequest {
  path?: string;
  message: string;
  add_all?: boolean;
  files?: string[];
}

/**
 * Commit changes
 * POST /api/git/commit
 */
async function handleGitCommit(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = req.body as GitCommitRequest;
  const userHome = getUserHome(req.user.wallet_address);
  const repoPath = body.path || '.';

  if (!body.message) {
    res.status(400).json({ error: 'Missing required parameter: message' });
    return;
  }

  if (!isPathSafe(userHome, repoPath)) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  const fullPath = path.join(userHome, repoPath);

  try {
    // Add files
    if (body.add_all) {
      await execGit('git add -A', fullPath);
    } else if (body.files && body.files.length > 0) {
      const filesArg = body.files.map(f => `"${f}"`).join(' ');
      await execGit(`git add ${filesArg}`, fullPath);
    }

    // Commit (escape message)
    const escapedMessage = body.message.replace(/"/g, '\\"');
    const result = await execGit(`git commit -m "${escapedMessage}"`, fullPath);

    // Get new commit hash
    const hashResult = await execGit('git rev-parse HEAD', fullPath);

    res.json({
      success: true,
      hash: hashResult.stdout.trim(),
      message: body.message,
      output: result.stdout || result.stderr,
    });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check if nothing to commit
    if (errorMessage.includes('nothing to commit')) {
      res.json({
        success: false,
        error: 'Nothing to commit',
        message: 'Working tree clean'
      });
      return;
    }

    logger.error('[Git] Commit failed', { error: errorMessage });
    res.status(500).json({
      error: 'Commit failed',
      message: errorMessage
    });
  }
}

interface GitPushRequest {
  path?: string;
  remote?: string;
  branch?: string;
  force?: boolean;
}

/**
 * Push changes
 * POST /api/git/push
 */
async function handleGitPush(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = req.body as GitPushRequest;
  const userHome = getUserHome(req.user.wallet_address);
  const repoPath = body.path || '.';

  if (!isPathSafe(userHome, repoPath)) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  const fullPath = path.join(userHome, repoPath);
  const remote = body.remote || 'origin';
  const branch = body.branch || '';

  let command = `git push ${remote}`;
  if (branch) {
    command += ` ${branch}`;
  }
  if (body.force) {
    command += ' --force';
  }

  logger.info('[Git] Pushing changes', {
    path: fullPath,
    remote,
    branch: branch || 'current',
    force: !!body.force
  });

  try {
    const result = await execGit(command, fullPath, 120000);

    res.json({
      success: true,
      remote,
      branch: branch || 'current',
      output: result.stderr || result.stdout,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Git] Push failed', { error: errorMessage });
    res.status(500).json({
      error: 'Push failed',
      message: errorMessage
    });
  }
}

interface GitPullRequest {
  path?: string;
  remote?: string;
  branch?: string;
}

/**
 * Pull changes
 * POST /api/git/pull
 */
async function handleGitPull(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = req.body as GitPullRequest;
  const userHome = getUserHome(req.user.wallet_address);
  const repoPath = body.path || '.';

  if (!isPathSafe(userHome, repoPath)) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  const fullPath = path.join(userHome, repoPath);
  const remote = body.remote || 'origin';
  const branch = body.branch || '';

  let command = `git pull ${remote}`;
  if (branch) {
    command += ` ${branch}`;
  }

  try {
    const result = await execGit(command, fullPath, 120000);

    res.json({
      success: true,
      remote,
      branch: branch || 'current',
      output: result.stdout || result.stderr,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Git] Pull failed', { error: errorMessage });
    res.status(500).json({
      error: 'Pull failed',
      message: errorMessage
    });
  }
}

interface GitLogRequest {
  path?: string;
  count?: number;
}

/**
 * Get commit log
 * POST /api/git/log
 */
async function handleGitLog(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = req.body as GitLogRequest;
  const userHome = getUserHome(req.user.wallet_address);
  const repoPath = body.path || '.';
  const count = Math.min(body.count || 10, 100);

  if (!isPathSafe(userHome, repoPath)) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  const fullPath = path.join(userHome, repoPath);

  try {
    const result = await execGit(
      `git log -${count} --format="%H|%s|%an|%ae|%ad" --date=iso`,
      fullPath
    );

    const commits = result.stdout
      .trim()
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => {
        const parts = line.split('|');
        return {
          hash: parts[0],
          message: parts[1] || '',
          author: parts[2] || '',
          email: parts[3] || '',
          date: parts[4] || '',
        };
      });

    res.json({
      success: true,
      count: commits.length,
      commits,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Git] Log failed', { error: errorMessage });
    res.status(500).json({
      error: 'Log failed',
      message: errorMessage
    });
  }
}

interface GitDiffRequest {
  path?: string;
  staged?: boolean;
}

/**
 * Get diff of changes
 * POST /api/git/diff
 */
async function handleGitDiff(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = req.body as GitDiffRequest;
  const userHome = getUserHome(req.user.wallet_address);
  const repoPath = body.path || '.';

  if (!isPathSafe(userHome, repoPath)) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  const fullPath = path.join(userHome, repoPath);
  const command = body.staged ? 'git diff --staged' : 'git diff';

  try {
    const result = await execGit(command, fullPath);

    res.json({
      success: true,
      staged: !!body.staged,
      diff: result.stdout,
      has_changes: result.stdout.trim().length > 0,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Git] Diff failed', { error: errorMessage });
    res.status(500).json({
      error: 'Diff failed',
      message: errorMessage
    });
  }
}

// Register routes
router.post('/clone', authenticate, handleGitClone);
router.post('/status', authenticate, handleGitStatus);
router.post('/commit', authenticate, handleGitCommit);
router.post('/push', authenticate, handleGitPush);
router.post('/pull', authenticate, handleGitPull);
router.post('/log', authenticate, handleGitLog);
router.post('/diff', authenticate, handleGitDiff);

export { router as gitRouter };
