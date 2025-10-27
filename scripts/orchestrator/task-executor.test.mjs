import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskExecutor } from './task-executor.mjs';
import { StateManager } from './state-manager.mjs';
import { ClaudeCLI } from './claude-cli.mjs';
import fs from 'fs';

vi.mock('./claude-cli.mjs');

describe('TaskExecutor', () => {
  const testDbPath = './test-executor.db';
  let executor;
  let stateManager;
  let mockCli;
  let sessionId;
  let phaseId;

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    stateManager = new StateManager(testDbPath);
    sessionId = stateManager.createSession({ model: 'gpt-5' });
    phaseId = stateManager.startPhase(sessionId, 1, 'Test Phase');

    mockCli = {
      execute: vi.fn(),
      workingDir: '/test'
    };

    executor = new TaskExecutor(stateManager, mockCli, { retryDelayMs: 10 });
  });

  afterEach(() => {
    stateManager?.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should execute task successfully', async () => {
    const taskId = stateManager.createTask(phaseId, 1, 'Test task');

    mockCli.execute.mockResolvedValue({
      success: true,
      output: 'Task completed',
      sessionId: 'sess-123'
    });

    const result = await executor.executeTask(taskId, {
      prompt: 'Do the task',
      model: 'gpt-5'
    });

    expect(result.success).toBe(true);

    const task = stateManager.db.prepare(
      'SELECT * FROM tasks WHERE id = ?'
    ).get(taskId);
    expect(task.status).toBe('completed');
  });

  it('should retry on failure', async () => {
    const taskId = stateManager.createTask(phaseId, 1, 'Flaky task');

    mockCli.execute
      .mockResolvedValueOnce({ success: false, error: 'API timeout' })
      .mockResolvedValueOnce({ success: true, output: 'Success on retry' });

    const result = await executor.executeTask(taskId, {
      prompt: 'Do the task',
      model: 'gpt-5',
      maxRetries: 3
    });

    expect(result.success).toBe(true);
    expect(mockCli.execute).toHaveBeenCalledTimes(2);
  });

  it('should fail after max retries', async () => {
    const taskId = stateManager.createTask(phaseId, 1, 'Always fails');

    mockCli.execute.mockResolvedValue({
      success: false,
      error: 'Persistent error'
    });

    const result = await executor.executeTask(taskId, {
      prompt: 'Do the task',
      model: 'gpt-5',
      maxRetries: 2
    });

    expect(result.success).toBe(false);
    expect(mockCli.execute).toHaveBeenCalledTimes(3); // Initial + 2 retries

    const task = stateManager.db.prepare(
      'SELECT * FROM tasks WHERE id = ?'
    ).get(taskId);
    expect(task.status).toBe('failed');
    expect(task.retry_count).toBe(3); // Initial + 2 retries = 3 failures
  });

  it('should track session IDs across tasks', async () => {
    const task1Id = stateManager.createTask(phaseId, 1, 'Task 1');
    const task2Id = stateManager.createTask(phaseId, 2, 'Task 2');

    mockCli.execute
      .mockResolvedValueOnce({ success: true, sessionId: 'sess-123' })
      .mockResolvedValueOnce({ success: true, sessionId: 'sess-456' });

    const result1 = await executor.executeTask(task1Id, {
      prompt: 'Task 1',
      model: 'gpt-5'
    });

    expect(result1.sessionId).toBe('sess-123');

    // Second task should use continuation with previous session ID
    const result2 = await executor.executeTask(task2Id, {
      prompt: 'Task 2',
      model: 'gpt-5',
      sessionId: result1.sessionId
    });

    expect(result2.sessionId).toBe('sess-456');
  });

  it('should execute full phase with multiple tasks', async () => {
    const tasks = [
      { taskNumber: 1, description: 'Task 1', prompt: 'Do task 1' },
      { taskNumber: 2, description: 'Task 2', prompt: 'Do task 2' },
      { taskNumber: 3, description: 'Task 3', prompt: 'Do task 3' }
    ];

    mockCli.execute.mockResolvedValue({
      success: true,
      output: 'Success',
      sessionId: 'sess-123'
    });

    const result = await executor.executePhase(phaseId, tasks, {
      model: 'gpt-5'
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(3);
    expect(mockCli.execute).toHaveBeenCalledTimes(3);

    const phase = stateManager.db.prepare(
      'SELECT * FROM phases WHERE id = ?'
    ).get(phaseId);
    expect(phase.status).toBe('completed');
  });

  it('should stop phase execution on task failure', async () => {
    const tasks = [
      { taskNumber: 1, description: 'Task 1', prompt: 'Do task 1' },
      { taskNumber: 2, description: 'Task 2', prompt: 'Do task 2', maxRetries: 1 },
      { taskNumber: 3, description: 'Task 3', prompt: 'Do task 3' }
    ];

    mockCli.execute
      .mockResolvedValueOnce({ success: true, output: 'Success' })
      .mockResolvedValue({ success: false, error: 'Task 2 failed' });

    const result = await executor.executePhase(phaseId, tasks, {
      model: 'gpt-5'
    });

    expect(result.success).toBe(false);
    expect(result.failedTask).toBe(2);
    expect(result.results).toHaveLength(2);
    // Should not attempt task 3
    expect(mockCli.execute).toHaveBeenCalledTimes(3); // Task 1 + Task 2 (initial + 1 retry)
  });
});
