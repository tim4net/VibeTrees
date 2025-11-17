import { DatabaseBackupManager } from './database-backup-manager.mjs';

/**
 * DatabaseBackupScheduler
 *
 * Schedules automatic nightly backups for the main worktree.
 * Runs at 2am daily to create database backups.
 */
export class DatabaseBackupScheduler {
  constructor(config) {
    this.config = config;
    this.worktreeManager = config.worktreeManager;
    this.projectRoot = config.projectRoot;
    this.backupManager = new DatabaseBackupManager({
      projectRoot: this.projectRoot,
      runtime: config.runtime
    });

    this.intervalId = null;
    this.lastBackupTime = null;
  }

  /**
   * Start the scheduler
   * Checks every minute if it's time to run backup
   */
  start() {
    if (this.intervalId) {
      console.log('[DatabaseBackupScheduler] Already running');
      return;
    }

    console.log('[DatabaseBackupScheduler] Starting nightly backup scheduler (2am daily)');

    // Check every minute if it's time to backup
    this.intervalId = setInterval(() => {
      this._checkAndRunBackup();
    }, 60 * 1000); // Check every minute

    // Also check immediately on start
    this._checkAndRunBackup();
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[DatabaseBackupScheduler] Stopped');
    }
  }

  /**
   * Check if it's time to run backup and run if needed
   * @private
   */
  async _checkAndRunBackup() {
    const now = new Date();

    // Run at 2am daily
    if (now.getHours() === 2 && now.getMinutes() === 0) {
      // Check if we already ran backup in the last hour to prevent duplicates
      if (this.lastBackupTime) {
        const timeSinceLastBackup = now - this.lastBackupTime;
        if (timeSinceLastBackup < 60 * 60 * 1000) { // Less than 1 hour
          return;
        }
      }

      console.log('[DatabaseBackupScheduler] Running scheduled backup at 2am');
      await this.runBackup();
    }
  }

  /**
   * Run backup for main worktree
   * @returns {Promise<{success: boolean, backupPath?: string, error?: string}>}
   */
  async runBackup() {
    try {
      console.log('[DatabaseBackupScheduler] Starting backup process');

      // Find main worktree
      const worktrees = this.worktreeManager.listWorktrees();
      const mainWorktree = worktrees.find(wt => {
        // Main worktree is the one not in .worktrees directory
        return !wt.path.includes('.worktrees');
      });

      if (!mainWorktree) {
        console.log('[DatabaseBackupScheduler] No main worktree found, skipping backup');
        return { success: false, reason: 'no-main-worktree' };
      }

      console.log(`[DatabaseBackupScheduler] Found main worktree: ${mainWorktree.name} at ${mainWorktree.path}`);

      // Create backup
      const result = await this.backupManager.createBackup(
        mainWorktree.name,
        mainWorktree.path,
        mainWorktree.ports || {}
      );

      if (result.success) {
        console.log(`[DatabaseBackupScheduler] Backup completed successfully: ${result.backupPath}`);
        this.lastBackupTime = new Date();

        // Generate documentation
        this.backupManager.generateBackupDocs();
      } else {
        console.error(`[DatabaseBackupScheduler] Backup failed: ${result.error || result.reason}`);
      }

      return result;
    } catch (error) {
      console.error(`[DatabaseBackupScheduler] Backup error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get the next scheduled backup time
   * @returns {Date} Next backup time (next 2am)
   */
  getNextBackupTime() {
    const now = new Date();
    const next = new Date(now);

    // Set to 2am
    next.setHours(2, 0, 0, 0);

    // If 2am has already passed today, schedule for tomorrow
    if (now.getHours() >= 2) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }

  /**
   * Get scheduler status
   * @returns {{running: boolean, nextBackup: Date, lastBackup: Date|null}}
   */
  getStatus() {
    return {
      running: this.isRunning(),
      nextBackup: this.getNextBackupTime(),
      lastBackup: this.lastBackupTime
    };
  }

  /**
   * Check if scheduler is running
   * @returns {boolean}
   */
  isRunning() {
    return this.intervalId !== null;
  }
}
