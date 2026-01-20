/**
 * Scheduled Tasks API
 * Cron-like task scheduling for automated agent actions
 */

import { Response, Router } from 'express';
import { AuthenticatedRequest, authenticate } from './middleware.js';
import { logger } from '../utils/logger.js';
import { DatabaseManager } from '../storage/index.js';
import { randomUUID } from 'crypto';

const router = Router();

/**
 * Supported cron expression formats (simplified)
 * - "* * * * *" - Every minute
 * - "0 * * * *" - Every hour
 * - "0 0 * * *" - Every day at midnight
 * - "0 0 * * 0" - Every Sunday at midnight
 * - "@hourly", "@daily", "@weekly" - Predefined schedules
 */
const CRON_PRESETS: Record<string, string> = {
  '@minutely': '* * * * *',
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
};

/**
 * Supported actions that can be scheduled
 */
const SUPPORTED_ACTIONS = [
  'terminal_exec',    // Execute a shell command
  'terminal_script',  // Execute a script
  'http_request',     // Make an HTTP request
  'git_pull',         // Pull from git repository
  'backup_create',    // Create a backup
];

interface ScheduledTask {
  id: string;
  wallet_address: string;
  name: string;
  description: string | null;
  cron_expression: string;
  action: string;
  action_params: string | null;
  enabled: number;
  last_run_at: number | null;
  last_run_status: string | null;
  last_run_result: string | null;
  next_run_at: number | null;
  run_count: number;
  error_count: number;
  created_at: number;
  updated_at: number;
}

/**
 * Parse cron expression to get next run time
 * Simplified implementation - only handles basic expressions
 */
function getNextRunTime(cronExpression: string, fromTime: number = Date.now()): number {
  // Handle presets
  const expr = CRON_PRESETS[cronExpression] || cronExpression;
  
  const parts = expr.split(' ');
  if (parts.length !== 5) {
    throw new Error('Invalid cron expression: must have 5 parts');
  }
  
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const now = new Date(fromTime);
  
  // Simple implementation for common cases
  // For production, use a proper cron parser library
  
  if (minute === '*' && hour === '*') {
    // Every minute
    const next = new Date(now);
    next.setSeconds(0);
    next.setMilliseconds(0);
    next.setMinutes(next.getMinutes() + 1);
    return next.getTime();
  }
  
  if (minute === '0' && hour === '*') {
    // Every hour
    const next = new Date(now);
    next.setSeconds(0);
    next.setMilliseconds(0);
    next.setMinutes(0);
    next.setHours(next.getHours() + 1);
    return next.getTime();
  }
  
  if (minute === '0' && hour === '0') {
    // Daily at midnight
    const next = new Date(now);
    next.setSeconds(0);
    next.setMilliseconds(0);
    next.setMinutes(0);
    next.setHours(0);
    next.setDate(next.getDate() + 1);
    return next.getTime();
  }
  
  // Default: 1 hour from now
  return fromTime + 60 * 60 * 1000;
}

interface CreateTaskRequest {
  name: string;
  description?: string;
  cron_expression: string;
  action: string;
  action_params?: Record<string, any>;
  enabled?: boolean;
}

/**
 * Create a scheduled task
 * POST /api/scheduler/tasks
 */
async function handleCreateTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const db = req.app.locals.db as DatabaseManager | undefined;
  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  const body = req.body as CreateTaskRequest;

  // Validate required fields
  if (!body.name) {
    res.status(400).json({ error: 'Missing required parameter: name' });
    return;
  }
  if (!body.cron_expression) {
    res.status(400).json({ error: 'Missing required parameter: cron_expression' });
    return;
  }
  if (!body.action) {
    res.status(400).json({ error: 'Missing required parameter: action' });
    return;
  }

  // Validate action
  if (!SUPPORTED_ACTIONS.includes(body.action)) {
    res.status(400).json({ 
      error: 'Unsupported action',
      supported_actions: SUPPORTED_ACTIONS
    });
    return;
  }

  // Validate cron expression
  try {
    getNextRunTime(body.cron_expression);
  } catch {
    res.status(400).json({ error: 'Invalid cron expression' });
    return;
  }

  const now = Date.now();
  const taskId = randomUUID();
  const nextRunAt = getNextRunTime(body.cron_expression);

  try {
    db.getDB().prepare(`
      INSERT INTO scheduled_tasks (
        id, wallet_address, name, description, cron_expression, action,
        action_params, enabled, next_run_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      taskId,
      req.user.wallet_address,
      body.name,
      body.description || null,
      CRON_PRESETS[body.cron_expression] || body.cron_expression,
      body.action,
      body.action_params ? JSON.stringify(body.action_params) : null,
      body.enabled !== false ? 1 : 0,
      nextRunAt,
      now,
      now
    );

    logger.info('[Scheduler] Task created', {
      taskId,
      name: body.name,
      action: body.action,
      wallet: req.user.wallet_address.substring(0, 10)
    });

    res.status(201).json({
      success: true,
      task: {
        id: taskId,
        name: body.name,
        description: body.description || null,
        cron_expression: CRON_PRESETS[body.cron_expression] || body.cron_expression,
        action: body.action,
        action_params: body.action_params || null,
        enabled: body.enabled !== false,
        next_run_at: nextRunAt,
        created_at: now,
      },
    });
  } catch (error) {
    logger.error('[Scheduler] Failed to create task', { error });
    res.status(500).json({ error: 'Failed to create scheduled task' });
  }
}

/**
 * List scheduled tasks
 * GET /api/scheduler/tasks
 */
async function handleListTasks(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const db = req.app.locals.db as DatabaseManager | undefined;
  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  const enabled = req.query.enabled;
  
  try {
    let query = 'SELECT * FROM scheduled_tasks WHERE wallet_address = ?';
    const params: any[] = [req.user.wallet_address];
    
    if (enabled !== undefined) {
      query += ' AND enabled = ?';
      params.push(enabled === 'true' ? 1 : 0);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const tasks = db.getDB().prepare(query).all(...params) as ScheduledTask[];
    
    // Parse action_params for each task
    const parsedTasks = tasks.map(task => ({
      ...task,
      action_params: task.action_params ? JSON.parse(task.action_params) : null,
      enabled: !!task.enabled,
    }));

    res.json({
      success: true,
      count: tasks.length,
      tasks: parsedTasks,
    });
  } catch (error) {
    logger.error('[Scheduler] Failed to list tasks', { error });
    res.status(500).json({ error: 'Failed to list scheduled tasks' });
  }
}

/**
 * Get a specific task
 * GET /api/scheduler/tasks/:id
 */
async function handleGetTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const db = req.app.locals.db as DatabaseManager | undefined;
  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  const taskId = req.params.id;

  try {
    const task = db.getDB().prepare(`
      SELECT * FROM scheduled_tasks WHERE id = ? AND wallet_address = ?
    `).get(taskId, req.user.wallet_address) as ScheduledTask | undefined;

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json({
      success: true,
      task: {
        ...task,
        action_params: task.action_params ? JSON.parse(task.action_params) : null,
        enabled: !!task.enabled,
      },
    });
  } catch (error) {
    logger.error('[Scheduler] Failed to get task', { error });
    res.status(500).json({ error: 'Failed to get scheduled task' });
  }
}

interface UpdateTaskRequest {
  name?: string;
  description?: string;
  cron_expression?: string;
  action_params?: Record<string, any>;
  enabled?: boolean;
}

/**
 * Update a scheduled task
 * PATCH /api/scheduler/tasks/:id
 */
async function handleUpdateTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const db = req.app.locals.db as DatabaseManager | undefined;
  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  const taskId = req.params.id;
  const body = req.body as UpdateTaskRequest;

  try {
    // Check task exists and belongs to user
    const task = db.getDB().prepare(`
      SELECT * FROM scheduled_tasks WHERE id = ? AND wallet_address = ?
    `).get(taskId, req.user.wallet_address) as ScheduledTask | undefined;

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (body.name !== undefined) {
      updates.push('name = ?');
      params.push(body.name);
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      params.push(body.description);
    }
    if (body.cron_expression !== undefined) {
      const cronExpr = CRON_PRESETS[body.cron_expression] || body.cron_expression;
      try {
        const nextRunAt = getNextRunTime(cronExpr);
        updates.push('cron_expression = ?', 'next_run_at = ?');
        params.push(cronExpr, nextRunAt);
      } catch {
        res.status(400).json({ error: 'Invalid cron expression' });
        return;
      }
    }
    if (body.action_params !== undefined) {
      updates.push('action_params = ?');
      params.push(JSON.stringify(body.action_params));
    }
    if (body.enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(body.enabled ? 1 : 0);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No updates provided' });
      return;
    }

    updates.push('updated_at = ?');
    params.push(Date.now());
    params.push(taskId, req.user.wallet_address);

    db.getDB().prepare(`
      UPDATE scheduled_tasks SET ${updates.join(', ')} WHERE id = ? AND wallet_address = ?
    `).run(...params);

    logger.info('[Scheduler] Task updated', { taskId });

    // Fetch updated task
    const updatedTask = db.getDB().prepare(`
      SELECT * FROM scheduled_tasks WHERE id = ?
    `).get(taskId) as ScheduledTask;

    res.json({
      success: true,
      task: {
        ...updatedTask,
        action_params: updatedTask.action_params ? JSON.parse(updatedTask.action_params) : null,
        enabled: !!updatedTask.enabled,
      },
    });
  } catch (error) {
    logger.error('[Scheduler] Failed to update task', { error });
    res.status(500).json({ error: 'Failed to update scheduled task' });
  }
}

/**
 * Delete a scheduled task
 * DELETE /api/scheduler/tasks/:id
 */
async function handleDeleteTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const db = req.app.locals.db as DatabaseManager | undefined;
  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  const taskId = req.params.id;

  try {
    const result = db.getDB().prepare(`
      DELETE FROM scheduled_tasks WHERE id = ? AND wallet_address = ?
    `).run(taskId, req.user.wallet_address);

    if (result.changes === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    logger.info('[Scheduler] Task deleted', { taskId });

    res.json({
      success: true,
      message: 'Task deleted',
    });
  } catch (error) {
    logger.error('[Scheduler] Failed to delete task', { error });
    res.status(500).json({ error: 'Failed to delete scheduled task' });
  }
}

/**
 * Trigger a task immediately (for testing)
 * POST /api/scheduler/tasks/:id/trigger
 */
async function handleTriggerTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const db = req.app.locals.db as DatabaseManager | undefined;
  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return;
  }

  const taskId = req.params.id;

  try {
    const task = db.getDB().prepare(`
      SELECT * FROM scheduled_tasks WHERE id = ? AND wallet_address = ?
    `).get(taskId, req.user.wallet_address) as ScheduledTask | undefined;

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Task execution would be handled by a separate scheduler service
    // For now, just mark it as triggered
    const now = Date.now();
    const nextRunAt = getNextRunTime(task.cron_expression, now);

    db.getDB().prepare(`
      UPDATE scheduled_tasks SET 
        last_run_at = ?, 
        last_run_status = 'triggered',
        next_run_at = ?,
        run_count = run_count + 1,
        updated_at = ?
      WHERE id = ?
    `).run(now, nextRunAt, now, taskId);

    logger.info('[Scheduler] Task triggered', { taskId, action: task.action });

    res.json({
      success: true,
      message: 'Task triggered',
      task_id: taskId,
      action: task.action,
      triggered_at: now,
      next_run_at: nextRunAt,
    });
  } catch (error) {
    logger.error('[Scheduler] Failed to trigger task', { error });
    res.status(500).json({ error: 'Failed to trigger scheduled task' });
  }
}

// Register routes
router.post('/tasks', authenticate, handleCreateTask);
router.get('/tasks', authenticate, handleListTasks);
router.get('/tasks/:id', authenticate, handleGetTask);
router.patch('/tasks/:id', authenticate, handleUpdateTask);
router.put('/tasks/:id', authenticate, handleUpdateTask);
router.delete('/tasks/:id', authenticate, handleDeleteTask);
router.post('/tasks/:id/trigger', authenticate, handleTriggerTask);

export { router as schedulerRouter, SUPPORTED_ACTIONS };
