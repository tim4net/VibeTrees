/**
 * Smart Reload Manager - Phase 5.2
 *
 * Handles intelligent service restarts, dependency installs, and migrations
 * after git sync operations based on change analysis.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export class SmartReloadManager {
  constructor(worktreePath, runtime) {
    this.worktreePath = worktreePath;
    this.runtime = runtime;
  }

  /**
   * Perform smart reload based on change analysis
   * @param {Object} analysis - Change analysis from ChangeDetector
   * @param {Object} options - Reload options
   * @returns {Object} Reload results
   */
  async performSmartReload(analysis, options = {}) {
    const results = {
      success: true,
      actions: [],
      errors: []
    };

    try {
      // Step 1: Reinstall dependencies if needed
      if (analysis.needsDependencyInstall && !options.skipDependencies) {
        const depResult = await this.reinstallDependencies(analysis);
        results.actions.push(depResult);
        if (!depResult.success) {
          results.errors.push('Dependency install failed');
          if (!options.continueOnError) {
            results.success = false;
            return results;
          }
        }
      }

      // Step 2: Run migrations if needed
      if (analysis.needsMigration?.hasMigrations && !options.skipMigrations) {
        const migrationResult = await this.runMigrations(analysis);
        results.actions.push(migrationResult);
        if (!migrationResult.success) {
          results.errors.push('Migration failed');
          if (!options.continueOnError) {
            results.success = false;
            return results;
          }
        }
      }

      // Step 3: Restart services if needed
      // SAFETY: Disabled by default to prevent unwanted service interruptions.
      // Auto-restarting services can interfere with debugging, testing, or user workflows.
      // To enable auto-restart, explicitly pass `autoRestart: true` in options.
      if (analysis.needsServiceRestart && !options.skipRestart && options.autoRestart === true) {
        const restartResult = await this.restartServices(analysis);
        results.actions.push(restartResult);
        if (!restartResult.success) {
          results.errors.push('Service restart failed');
          results.success = false;
        }
      } else if (analysis.needsServiceRestart && !options.autoRestart) {
        // Log that restart was skipped (user should manually restart if needed)
        results.actions.push({
          action: 'restart_services',
          success: true,
          skipped: true,
          message: 'Service restart recommended but skipped (auto-restart disabled)'
        });
      }

      return results;
    } catch (error) {
      results.success = false;
      results.errors.push(error.message);
      return results;
    }
  }

  /**
   * Restart affected services intelligently
   * @param {Object} analysis - Change analysis
   * @returns {Object} Restart result
   */
  async restartServices(analysis) {
    const result = {
      action: 'restart_services',
      success: true,
      services: [],
      errors: []
    };

    try {
      // If all services need restart
      if (analysis.affectedServices.includes('_all_')) {
        console.log('Restarting all services...');
        this.runtime.execCompose('restart', {
          cwd: this.worktreePath,
          stdio: 'inherit'
        });
        result.services = ['all'];
        result.message = 'All services restarted';
        return result;
      }

      // Restart only affected services
      if (analysis.affectedServices.length > 0) {
        console.log(`Restarting services: ${analysis.affectedServices.join(', ')}`);

        for (const service of analysis.affectedServices) {
          try {
            this.runtime.execCompose(`restart ${service}`, {
              cwd: this.worktreePath,
              stdio: 'inherit'
            });
            result.services.push(service);
          } catch (error) {
            result.errors.push(`Failed to restart ${service}: ${error.message}`);
            result.success = false;
          }
        }

        result.message = `Restarted ${result.services.length} service(s)`;
        return result;
      }

      // No services need restart
      result.message = 'No services need restart';
      return result;
    } catch (error) {
      result.success = false;
      result.errors.push(error.message);
      result.message = 'Service restart failed';
      return result;
    }
  }

  /**
   * Reinstall dependencies based on changed files
   * @param {Object} analysis - Change analysis
   * @returns {Object} Install result
   */
  async reinstallDependencies(analysis) {
    const result = {
      action: 'reinstall_dependencies',
      success: true,
      installed: [],
      errors: []
    };

    try {
      // Check which package managers need to run
      const packageFiles = analysis.changedFiles.filter(f =>
        ['package.json', 'requirements.txt', 'Gemfile', 'go.mod', 'Cargo.toml', 'composer.json'].includes(f)
      );

      for (const file of packageFiles) {
        const installResult = await this._runDependencyInstall(file);
        result.installed.push(installResult);

        if (!installResult.success) {
          result.errors.push(`Failed to install for ${file}: ${installResult.error}`);
          result.success = false;
        }
      }

      if (result.installed.length === 0) {
        result.message = 'No dependencies to install';
      } else {
        result.message = `Installed dependencies for ${result.installed.length} package file(s)`;
      }

      return result;
    } catch (error) {
      result.success = false;
      result.errors.push(error.message);
      result.message = 'Dependency install failed';
      return result;
    }
  }

  /**
   * Run dependency install for specific package file
   * @private
   */
  async _runDependencyInstall(packageFile) {
    const result = {
      file: packageFile,
      success: true,
      output: ''
    };

    try {
      let command;

      switch (packageFile) {
        case 'package.json':
          command = 'npm install';
          break;
        case 'requirements.txt':
          command = 'pip install -r requirements.txt';
          break;
        case 'Pipfile':
          command = 'pipenv install';
          break;
        case 'poetry.lock':
          command = 'poetry install';
          break;
        case 'Gemfile':
          command = 'bundle install';
          break;
        case 'go.mod':
          command = 'go mod download';
          break;
        case 'Cargo.toml':
          command = 'cargo build';
          break;
        case 'composer.json':
          command = 'composer install';
          break;
        default:
          result.success = false;
          result.error = `Unknown package file: ${packageFile}`;
          return result;
      }

      console.log(`Running: ${command}`);
      result.output = execSync(command, {
        cwd: this.worktreePath,
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      result.message = `Installed dependencies for ${packageFile}`;
      return result;
    } catch (error) {
      result.success = false;
      result.error = error.message;
      result.output = error.stderr || error.stdout || '';
      return result;
    }
  }

  /**
   * Run database migrations
   * @param {Object} analysis - Change analysis
   * @returns {Object} Migration result
   */
  async runMigrations(analysis) {
    const result = {
      action: 'run_migrations',
      success: true,
      migrations: [],
      errors: []
    };

    try {
      // Detect migration framework
      const framework = this._detectMigrationFramework();

      if (!framework) {
        result.success = false;
        result.message = 'No migration framework detected';
        result.errors.push('Unable to determine how to run migrations');
        return result;
      }

      console.log(`Running migrations with ${framework}...`);
      const migrationResult = await this._runMigrationCommand(framework);

      result.migrations.push(migrationResult);
      result.success = migrationResult.success;

      if (migrationResult.success) {
        result.message = `Ran ${analysis.needsMigration.count} migration(s) with ${framework}`;
      } else {
        result.message = 'Migration failed';
        result.errors.push(migrationResult.error);
      }

      return result;
    } catch (error) {
      result.success = false;
      result.errors.push(error.message);
      result.message = 'Migration execution failed';
      return result;
    }
  }

  /**
   * Detect which migration framework is in use
   * @private
   */
  _detectMigrationFramework() {
    // Check for common migration frameworks
    const frameworks = [
      { name: 'prisma', indicator: 'prisma/schema.prisma' },
      { name: 'sequelize', indicator: 'migrations/' },
      { name: 'typeorm', indicator: 'ormconfig.json' },
      { name: 'django', indicator: 'manage.py' },
      { name: 'flask', indicator: 'migrations/alembic.ini' },
      { name: 'rails', indicator: 'db/migrate/' },
      { name: 'laravel', indicator: 'database/migrations/' },
      { name: 'golang-migrate', indicator: 'migrations/' },
    ];

    for (const framework of frameworks) {
      if (existsSync(join(this.worktreePath, framework.indicator))) {
        return framework.name;
      }
    }

    return null;
  }

  /**
   * Run migration command for specific framework
   * @private
   */
  async _runMigrationCommand(framework) {
    const result = {
      framework,
      success: true,
      output: ''
    };

    try {
      let command;

      switch (framework) {
        case 'prisma':
          command = 'npx prisma migrate deploy';
          break;
        case 'sequelize':
          command = 'npx sequelize-cli db:migrate';
          break;
        case 'typeorm':
          command = 'npx typeorm migration:run';
          break;
        case 'django':
          command = 'python manage.py migrate';
          break;
        case 'flask':
          command = 'flask db upgrade';
          break;
        case 'rails':
          command = 'bundle exec rake db:migrate';
          break;
        case 'laravel':
          command = 'php artisan migrate';
          break;
        case 'golang-migrate':
          command = 'migrate -path ./migrations -database "${DATABASE_URL}" up';
          break;
        default:
          result.success = false;
          result.error = `Unknown migration framework: ${framework}`;
          return result;
      }

      console.log(`Running: ${command}`);
      result.output = execSync(command, {
        cwd: this.worktreePath,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: process.env
      });

      result.message = `Migrations completed with ${framework}`;
      return result;
    } catch (error) {
      result.success = false;
      result.error = error.message;
      result.output = error.stderr || error.stdout || '';
      return result;
    }
  }

  /**
   * Notify AI agent about changes (Phase 5.2 enhancement)
   * This sends a message to the active AI agent to inform it of important changes
   */
  async notifyAgent(analysis, ptyManager, worktreeName) {
    try {
      // Find the session for this worktree (claude agent)
      let terminal = null;
      for (const [sessionId, session] of ptyManager._sessions) {
        if (session.worktreeName === worktreeName && session.agent === 'claude' && session.pty) {
          terminal = session.pty;
          break;
        }
      }

      if (!terminal) {
        console.log('No active terminal to notify');
        return { success: false, message: 'No active terminal' };
      }

      // Build notification message
      const messages = [
        '\n\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m',
        '\x1b[1;36m📢 Repository Updated\x1b[0m',
        '\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m',
      ];

      if (analysis.summary.services.length > 0) {
        messages.push(`\x1b[33m⚠️  Service config changed:\x1b[0m ${analysis.summary.services.join(', ')}`);
      }

      if (analysis.summary.dependencies.length > 0) {
        messages.push(`\x1b[32m📦 Dependencies updated:\x1b[0m ${analysis.summary.dependencies.join(', ')}`);
      }

      if (analysis.needsMigration?.hasMigrations) {
        messages.push(`\x1b[35m🗃️  ${analysis.needsMigration.count} migration(s) detected\x1b[0m`);
      }

      if (analysis.affectedServices.length > 0 && !analysis.affectedServices.includes('_all_')) {
        messages.push(`\x1b[36m🔄 Affected services:\x1b[0m ${analysis.affectedServices.join(', ')}`);
      }

      messages.push(`\x1b[90m${analysis.summary.total} file(s) changed\x1b[0m`);
      messages.push('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');

      // Send to terminal
      for (const message of messages) {
        terminal.write(message + '\r\n');
      }

      return {
        success: true,
        message: 'Agent notified of changes'
      };
    } catch (error) {
      console.error('Error notifying agent:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
