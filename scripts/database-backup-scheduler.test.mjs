import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseBackupScheduler } from './database-backup-scheduler.mjs';
import { DatabaseBackupManager } from './database-backup-manager.mjs';

// Mock dependencies
vi.mock('./database-backup-manager.mjs');

describe('DatabaseBackupScheduler', () => {
  let scheduler;
  let mockBackupManager;
  let mockWorktreeManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock DatabaseBackupManager
    mockBackupManager = {
      createBackup: vi.fn().mockResolvedValue({ success: true }),
      generateBackupDocs: vi.fn().mockReturnValue({ success: true })
    };

    vi.mocked(DatabaseBackupManager).mockImplementation(function() {
      return mockBackupManager;
    });

    // Mock WorktreeManager
    mockWorktreeManager = {
      listWorktrees: vi.fn().mockReturnValue([
        {
          name: 'main',
          path: '/test/project',
          ports: { postgres: 5432 }
        }
      ])
    };

    scheduler = new DatabaseBackupScheduler({
      worktreeManager: mockWorktreeManager,
      projectRoot: '/test/project'
    });
  });

  afterEach(() => {
    if (scheduler) {
      scheduler.stop();
    }
    vi.useRealTimers();
  });

  describe('start', () => {
    it('should schedule nightly backups at 2am', () => {
      scheduler.start();

      expect(scheduler.isRunning()).toBe(true);
    });

    it('should not start if already running', () => {
      scheduler.start();
      const firstInterval = scheduler.intervalId;

      scheduler.start(); // Try to start again

      // Should still be the same interval
      expect(scheduler.intervalId).toBe(firstInterval);
    });
  });

  describe('stop', () => {
    it('should stop the scheduler', () => {
      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);

      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('should do nothing if not running', () => {
      expect(() => scheduler.stop()).not.toThrow();
    });
  });

  describe('runBackup', () => {
    it('should create backup for main worktree', async () => {
      await scheduler.runBackup();

      expect(mockBackupManager.createBackup).toHaveBeenCalledWith(
        'main',
        '/test/project',
        { postgres: 5432 }
      );
      expect(mockBackupManager.generateBackupDocs).toHaveBeenCalled();
    });

    it('should skip if no main worktree found', async () => {
      mockWorktreeManager.listWorktrees.mockReturnValue([
        {
          name: 'feature-branch',
          path: '/test/project/.worktrees/feature-branch',
          ports: {}
        }
      ]);

      await scheduler.runBackup();

      expect(mockBackupManager.createBackup).not.toHaveBeenCalled();
    });

    it('should handle backup errors gracefully', async () => {
      mockBackupManager.createBackup.mockResolvedValue({
        success: false,
        error: 'Connection failed'
      });

      await expect(scheduler.runBackup()).resolves.toEqual({
        success: false,
        error: 'Connection failed'
      });
    });

    it('should generate documentation after successful backup', async () => {
      await scheduler.runBackup();

      expect(mockBackupManager.generateBackupDocs).toHaveBeenCalledAfter(
        mockBackupManager.createBackup
      );
    });
  });

  describe('getNextBackupTime', () => {
    it('should return next 2am', () => {
      // Set current time to 1am
      vi.setSystemTime(new Date('2025-11-17T01:00:00'));

      const nextBackup = scheduler.getNextBackupTime();

      expect(nextBackup.getHours()).toBe(2);
      expect(nextBackup.getMinutes()).toBe(0);
      expect(nextBackup.getDate()).toBe(17); // Same day
    });

    it('should return next day 2am if past 2am', () => {
      // Set current time to 3am
      vi.setSystemTime(new Date('2025-11-17T03:00:00'));

      const nextBackup = scheduler.getNextBackupTime();

      expect(nextBackup.getHours()).toBe(2);
      expect(nextBackup.getMinutes()).toBe(0);
      expect(nextBackup.getDate()).toBe(18); // Next day
    });
  });

  describe('getStatus', () => {
    it('should return scheduler status', () => {
      const status = scheduler.getStatus();

      expect(status).toEqual({
        running: false,
        nextBackup: expect.any(Date),
        lastBackup: null
      });
    });

    it('should return last backup time after running', async () => {
      await scheduler.runBackup();

      const status = scheduler.getStatus();

      expect(status.lastBackup).toBeInstanceOf(Date);
    });
  });

  describe('integration - time-based scheduling', () => {
    it('should run backup at scheduled time', async () => {
      // Set current time to 1:59am
      vi.setSystemTime(new Date('2025-11-17T01:59:00'));

      scheduler.start();

      // Fast-forward 2 minutes to 2:01am
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);

      // Backup should have been triggered
      expect(mockBackupManager.createBackup).toHaveBeenCalled();
    });
  });
});
