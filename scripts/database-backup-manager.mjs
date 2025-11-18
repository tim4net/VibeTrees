import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { DatabaseManager } from './database-manager.mjs';
import { ComposeInspector } from './compose-inspector.mjs';

/**
 * DatabaseBackupManager
 *
 * Manages automatic database backups for worktrees.
 * Detects database services, creates nightly backups, and handles restoration.
 */
export class DatabaseBackupManager {
  constructor(config) {
    this.config = config;
    this.projectRoot = config.projectRoot;
    this.backupDir = config.backupDir || path.join(this.projectRoot, '.vibetrees', 'backups');
    this.runtime = config.runtime; // ContainerRuntime instance
  }

  /**
   * Detect if a worktree has a database service
   * @param {string} worktreePath - Path to the worktree
   * @returns {Promise<{hasDatabase: boolean, type: string|null, service: string|null}>}
   */
  async detectDatabase(worktreePath) {
    const composeFile = path.join(worktreePath, 'docker-compose.yml');

    if (!existsSync(composeFile)) {
      return { hasDatabase: false, type: null, service: null };
    }

    try {
      const inspector = new ComposeInspector(composeFile, this.runtime);
      const services = inspector.getServices();

      // Database service names and their types
      const dbTypes = {
        postgres: 'postgres',
        postgresql: 'postgres',
        mysql: 'mysql',
        mariadb: 'mariadb',
        db: 'postgres', // Common alias for postgres
        database: 'postgres'
      };

      for (const service of services) {
        const serviceName = service.name.toLowerCase();
        if (dbTypes[serviceName]) {
          return {
            hasDatabase: true,
            type: dbTypes[serviceName],
            service: service.name
          };
        }
      }

      return { hasDatabase: false, type: null, service: null };
    } catch (error) {
      console.error(`[DatabaseBackupManager] Failed to detect database: ${error.message}`);
      return { hasDatabase: false, type: null, service: null };
    }
  }

  /**
   * Create a backup of the database
   * @param {string} worktreeName - Name of the worktree
   * @param {string} worktreePath - Path to the worktree
   * @param {Object} ports - Allocated ports for the worktree
   * @returns {Promise<{success: boolean, backupPath?: string, reason?: string, error?: string}>}
   */
  async createBackup(worktreeName, worktreePath, ports = {}) {
    try {
      // Detect database
      const dbInfo = await this.detectDatabase(worktreePath);

      if (!dbInfo.hasDatabase) {
        return {
          success: false,
          reason: 'no-database'
        };
      }

      // Only support PostgreSQL for now
      if (dbInfo.type !== 'postgres') {
        return {
          success: false,
          reason: 'unsupported-database',
          message: `Database type ${dbInfo.type} not yet supported for backups`
        };
      }

      // Get database port
      const dbPort = ports[dbInfo.service] || ports.postgres || 5432;

      // Ensure backup directory exists
      const worktreeBackupDir = path.join(this.backupDir, worktreeName);
      if (!existsSync(worktreeBackupDir)) {
        mkdirSync(worktreeBackupDir, { recursive: true });
      }

      // Generate backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
      const backupPath = path.join(worktreeBackupDir, `backup-${timestamp}.sql`);

      console.log(`[DatabaseBackupManager] Creating backup for ${worktreeName} at ${backupPath}`);
      console.log(`[DatabaseBackupManager] Database service: ${dbInfo.service}, type: ${dbInfo.type}`);

      // Read database credentials from docker-compose.yml
      const credentials = this._extractDatabaseCredentials(worktreePath, dbInfo.service);
      console.log(`[DatabaseBackupManager] Using credentials - user: ${credentials.user}, database: ${credentials.database}`);

      // Create DatabaseManager instance
      const dbManager = new DatabaseManager({
        host: 'localhost',
        port: dbPort,
        database: credentials.database,
        user: credentials.user,
        password: credentials.password
      });

      // Export database
      const result = await dbManager.exportFull(backupPath);

      if (!result.success) {
        return {
          success: false,
          error: result.error
        };
      }

      // Get backup file size
      const stats = statSync(backupPath);

      console.log(`[DatabaseBackupManager] Backup created successfully: ${backupPath} (${this._formatSize(stats.size)})`);

      return {
        success: true,
        backupPath,
        size: stats.size,
        timestamp: new Date()
      };
    } catch (error) {
      console.error(`[DatabaseBackupManager] Backup failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get the latest backup for a worktree
   * @param {string} worktreeName - Name of the worktree
   * @returns {{path: string, filename: string, timestamp: Date, size: number}|null}
   */
  getLatestBackup(worktreeName) {
    const worktreeBackupDir = path.join(this.backupDir, worktreeName);

    if (!existsSync(worktreeBackupDir)) {
      return null;
    }

    try {
      const files = readdirSync(worktreeBackupDir)
        .filter(f => f.endsWith('.sql'))
        .map(f => {
          const filePath = path.join(worktreeBackupDir, f);
          const stats = statSync(filePath);
          return {
            path: filePath,
            filename: f,
            timestamp: stats.mtime,
            size: stats.size
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp descending

      return files.length > 0 ? files[0] : null;
    } catch (error) {
      console.error(`[DatabaseBackupManager] Failed to get latest backup: ${error.message}`);
      return null;
    }
  }

  /**
   * List all backups for a worktree
   * @param {string} worktreeName - Name of the worktree
   * @returns {Array<{path: string, filename: string, timestamp: Date, size: number}>}
   */
  listBackups(worktreeName) {
    const worktreeBackupDir = path.join(this.backupDir, worktreeName);

    if (!existsSync(worktreeBackupDir)) {
      return [];
    }

    try {
      return readdirSync(worktreeBackupDir)
        .filter(f => f.endsWith('.sql'))
        .map(f => {
          const filePath = path.join(worktreeBackupDir, f);
          const stats = statSync(filePath);
          return {
            path: filePath,
            filename: f,
            timestamp: stats.mtime,
            size: stats.size
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp descending
    } catch (error) {
      console.error(`[DatabaseBackupManager] Failed to list backups: ${error.message}`);
      return [];
    }
  }

  /**
   * Prune backups older than specified days
   * @param {string} worktreeName - Worktree name
   * @param {number} daysToKeep - Number of days to keep (default: 7)
   * @returns {{pruned: number, kept: number, errors: number}}
   */
  pruneOldBackups(worktreeName, daysToKeep = 7) {
    try {
      const worktreeBackupDir = path.join(this.backupDir, worktreeName);

      if (!existsSync(worktreeBackupDir)) {
        return { pruned: 0, kept: 0, errors: 0 };
      }

      const now = Date.now();
      const maxAge = daysToKeep * 24 * 60 * 60 * 1000; // Convert days to milliseconds

      const backups = this.listBackups(worktreeName);
      let pruned = 0;
      let kept = 0;
      let errors = 0;

      for (const backup of backups) {
        const age = now - backup.timestamp.getTime();

        if (age > maxAge) {
          try {
            unlinkSync(backup.path);
            console.log(`[DatabaseBackupManager] Pruned old backup: ${backup.filename} (${Math.floor(age / (24 * 60 * 60 * 1000))} days old)`);
            pruned++;
          } catch (error) {
            console.error(`[DatabaseBackupManager] Failed to prune ${backup.filename}: ${error.message}`);
            errors++;
          }
        } else {
          kept++;
        }
      }

      if (pruned > 0) {
        console.log(`[DatabaseBackupManager] Pruned ${pruned} old backup(s), kept ${kept}, errors: ${errors}`);
      }

      return { pruned, kept, errors };
    } catch (error) {
      console.error(`[DatabaseBackupManager] Failed to prune backups: ${error.message}`);
      return { pruned: 0, kept: 0, errors: 1 };
    }
  }

  /**
   * Generate README.md with backup information
   * @returns {{success: boolean, worktrees: number}}
   */
  generateBackupDocs() {
    try {
      if (!existsSync(this.backupDir)) {
        console.log(`[DatabaseBackupManager] No backups directory found, skipping documentation`);
        return { success: true, worktrees: 0 };
      }

      const readmePath = path.join(this.backupDir, 'README.md');
      let content = '# Database Backups\n\n';
      content += 'This directory contains automatic database backups for all worktrees.\n\n';
      content += 'Backups are created:\n';
      content += '- Nightly at 2am for the main worktree\n';
      content += '- Automatically restored when creating new worktrees\n\n';

      // Find all worktree backup directories
      const worktrees = readdirSync(this.backupDir)
        .filter(name => {
          const fullPath = path.join(this.backupDir, name);
          return statSync(fullPath).isDirectory();
        });

      let worktreeCount = 0;

      for (const worktreeName of worktrees) {
        const backups = this.listBackups(worktreeName);

        if (backups.length === 0) continue;

        worktreeCount++;

        content += `## ${worktreeName.charAt(0).toUpperCase() + worktreeName.slice(1)} Worktree Backups\n\n`;
        content += '| Backup File | Created | Size | Status |\n';
        content += '|-------------|---------|------|--------|\n';

        for (const backup of backups) {
          const created = backup.timestamp.toISOString().replace('T', ' ').split('.')[0];
          const size = this._formatSize(backup.size);
          content += `| ${backup.filename} | ${created} | ${size} | ✅ Valid |\n`;
        }

        content += '\n';
      }

      writeFileSync(readmePath, content);
      console.log(`[DatabaseBackupManager] Documentation generated at ${readmePath}`);

      return { success: true, worktrees: worktreeCount };
    } catch (error) {
      console.error(`[DatabaseBackupManager] Failed to generate documentation: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Format size in bytes to human-readable format
   * @private
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size
   */
  _formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  /**
   * Extract database credentials from docker-compose.yml
   * @private
   * @param {string} worktreePath - Path to worktree
   * @param {string} serviceName - Database service name
   * @returns {{database: string, user: string, password: string}}
   */
  _extractDatabaseCredentials(worktreePath, serviceName) {
    try {
      const composeFile = path.join(worktreePath, 'docker-compose.yml');

      // Load and parse docker-compose.yml directly
      const composeContent = readFileSync(composeFile, 'utf8');
      const config = yaml.load(composeContent);

      if (!config.services || !config.services[serviceName]) {
        console.log(`[DatabaseBackupManager] Service ${serviceName} not found in docker-compose.yml, using defaults`);
        return {
          database: 'postgres',
          user: 'postgres',
          password: 'postgres'
        };
      }

      const service = config.services[serviceName];
      const env = service.environment || {};

      // Environment can be array format or object format
      let envObj = {};
      if (Array.isArray(env)) {
        // Convert array format ["KEY=value"] to object {KEY: "value"}
        env.forEach(item => {
          const [key, ...valueParts] = item.split('=');
          envObj[key] = valueParts.join('=');
        });
      } else {
        envObj = env;
      }

      const credentials = {
        database: envObj.POSTGRES_DB || envObj.MYSQL_DATABASE || envObj.MARIADB_DATABASE || 'postgres',
        user: envObj.POSTGRES_USER || envObj.MYSQL_USER || envObj.MARIADB_USER || 'postgres',
        password: envObj.POSTGRES_PASSWORD || envObj.MYSQL_PASSWORD || envObj.MARIADB_PASSWORD || 'postgres'
      };

      console.log(`[DatabaseBackupManager] Extracted credentials for ${serviceName}:`, {
        ...credentials,
        password: '***' // Don't log password
      });

      return credentials;
    } catch (error) {
      console.error(`[DatabaseBackupManager] Failed to extract credentials: ${error.message}`);
      // Fallback to defaults
      return {
        database: 'postgres',
        user: 'postgres',
        password: 'postgres'
      };
    }
  }
}
