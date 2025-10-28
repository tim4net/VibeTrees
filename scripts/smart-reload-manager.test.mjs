/**
 * Tests for Smart Reload Manager
 *
 * Tests intelligent service restarts, dependency installs, and migrations
 * based on change analysis from git sync operations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

// Mock dependencies
vi.mock('child_process');
vi.mock('fs');

// Import after mocking
const { SmartReloadManager } = await import('./smart-reload-manager.mjs');

describe('SmartReloadManager', () => {
  const mockWorktreePath = '/test/worktree';
  let mockRuntime;
  let manager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock runtime
    mockRuntime = {
      execCompose: vi.fn()
    };

    manager = new SmartReloadManager(mockWorktreePath, mockRuntime);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with worktree path and runtime', () => {
      expect(manager.worktreePath).toBe(mockWorktreePath);
      expect(manager.runtime).toBe(mockRuntime);
    });
  });

  describe('performSmartReload', () => {
    it('should perform full reload with dependencies, migrations, and service restart', async () => {
      const analysis = {
        needsDependencyInstall: true,
        needsMigration: {
          hasMigrations: true,
          count: 2,
          files: ['20240101_create_users.sql']
        },
        needsServiceRestart: true,
        affectedServices: ['api'],
        changedFiles: ['package.json']
      };

      existsSync.mockReturnValue(true);
      execSync.mockReturnValue('Dependencies installed');

      const result = await manager.performSmartReload(analysis);

      expect(result.success).toBe(true);
      expect(result.actions).toHaveLength(3);
      expect(result.actions[0].action).toBe('reinstall_dependencies');
      expect(result.actions[1].action).toBe('run_migrations');
      expect(result.actions[2].action).toBe('restart_services');
      expect(result.errors).toHaveLength(0);
    });

    it('should skip dependencies when skipDependencies option is true', async () => {
      const analysis = {
        needsDependencyInstall: true,
        needsMigration: { hasMigrations: false },
        needsServiceRestart: true,
        affectedServices: ['api'],
        changedFiles: ['package.json']
      };

      const result = await manager.performSmartReload(analysis, {
        skipDependencies: true
      });

      expect(result.success).toBe(true);
      expect(result.actions).toHaveLength(1); // Only restart
      expect(result.actions[0].action).toBe('restart_services');
    });

    it('should skip migrations when skipMigrations option is true', async () => {
      const analysis = {
        needsDependencyInstall: false,
        needsMigration: {
          hasMigrations: true,
          count: 1
        },
        needsServiceRestart: true,
        affectedServices: ['api'],
        changedFiles: []
      };

      const result = await manager.performSmartReload(analysis, {
        skipMigrations: true
      });

      expect(result.success).toBe(true);
      expect(result.actions).toHaveLength(1); // Only restart
      expect(result.actions[0].action).toBe('restart_services');
    });

    it('should skip service restart when skipRestart option is true', async () => {
      const analysis = {
        needsDependencyInstall: false,
        needsMigration: { hasMigrations: false },
        needsServiceRestart: true,
        affectedServices: ['api'],
        changedFiles: []
      };

      const result = await manager.performSmartReload(analysis, {
        skipRestart: true
      });

      expect(result.success).toBe(true);
      expect(result.actions).toHaveLength(0);
    });

    it('should stop on first error when continueOnError is false', async () => {
      const analysis = {
        needsDependencyInstall: true,
        needsMigration: { hasMigrations: true, count: 1 },
        needsServiceRestart: true,
        affectedServices: ['api'],
        changedFiles: ['package.json']
      };

      execSync.mockImplementation(() => {
        throw new Error('npm install failed');
      });

      const result = await manager.performSmartReload(analysis, {
        continueOnError: false
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Dependency install failed');
      expect(result.actions).toHaveLength(1); // Only dependency install attempted
    });

    it('should continue after errors when continueOnError is true', async () => {
      const analysis = {
        needsDependencyInstall: true,
        needsMigration: { hasMigrations: true, count: 1 },
        needsServiceRestart: true,
        affectedServices: ['api'],
        changedFiles: ['package.json']
      };

      let callCount = 0;
      execSync.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('npm install failed');
        }
        if (callCount === 2) {
          throw new Error('migration failed');
        }
        return 'success';
      });

      existsSync.mockReturnValue(true);

      const result = await manager.performSmartReload(analysis, {
        continueOnError: true
      });

      expect(result.success).toBe(true); // Service restart succeeded
      expect(result.errors).toContain('Dependency install failed');
      expect(result.errors).toContain('Migration failed');
      expect(result.actions).toHaveLength(3); // All three attempted
    });

    it('should handle no-op case when nothing needs reloading', async () => {
      const analysis = {
        needsDependencyInstall: false,
        needsMigration: { hasMigrations: false },
        needsServiceRestart: false,
        affectedServices: [],
        changedFiles: []
      };

      const result = await manager.performSmartReload(analysis);

      expect(result.success).toBe(true);
      expect(result.actions).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should catch and return errors from exceptions', async () => {
      const analysis = {
        needsDependencyInstall: true,
        needsMigration: { hasMigrations: false },
        needsServiceRestart: false,
        affectedServices: [],
        changedFiles: ['package.json']
      };

      execSync.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await manager.performSmartReload(analysis);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('restartServices', () => {
    it('should restart all services when _all_ is in affected services', async () => {
      const analysis = {
        affectedServices: ['_all_']
      };

      const result = await manager.restartServices(analysis);

      expect(result.success).toBe(true);
      expect(result.services).toEqual(['all']);
      expect(result.message).toBe('All services restarted');
      expect(mockRuntime.execCompose).toHaveBeenCalledWith('restart', {
        cwd: mockWorktreePath,
        stdio: 'inherit'
      });
    });

    it('should restart only specific services', async () => {
      const analysis = {
        affectedServices: ['api', 'postgres']
      };

      const result = await manager.restartServices(analysis);

      expect(result.success).toBe(true);
      expect(result.services).toEqual(['api', 'postgres']);
      expect(result.message).toBe('Restarted 2 service(s)');
      expect(mockRuntime.execCompose).toHaveBeenCalledWith('restart api', {
        cwd: mockWorktreePath,
        stdio: 'inherit'
      });
      expect(mockRuntime.execCompose).toHaveBeenCalledWith('restart postgres', {
        cwd: mockWorktreePath,
        stdio: 'inherit'
      });
    });

    it('should handle partial failures when restarting multiple services', async () => {
      const analysis = {
        affectedServices: ['api', 'postgres', 'redis']
      };

      mockRuntime.execCompose.mockImplementation((cmd) => {
        if (cmd.includes('postgres')) {
          throw new Error('Failed to restart postgres');
        }
      });

      const result = await manager.restartServices(analysis);

      expect(result.success).toBe(false);
      expect(result.services).toEqual(['api', 'redis']);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('postgres');
    });

    it('should return success when no services need restart', async () => {
      const analysis = {
        affectedServices: []
      };

      const result = await manager.restartServices(analysis);

      expect(result.success).toBe(true);
      expect(result.services).toHaveLength(0);
      expect(result.message).toBe('No services need restart');
      expect(mockRuntime.execCompose).not.toHaveBeenCalled();
    });

    it('should handle runtime errors gracefully', async () => {
      const analysis = {
        affectedServices: ['api']
      };

      mockRuntime.execCompose.mockImplementation(() => {
        throw new Error('Docker daemon not running');
      });

      const result = await manager.restartServices(analysis);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.message).toContain('service');
    });
  });

  describe('reinstallDependencies', () => {
    it('should install npm dependencies for package.json', async () => {
      const analysis = {
        changedFiles: ['package.json']
      };

      execSync.mockReturnValue('npm packages installed');

      const result = await manager.reinstallDependencies(analysis);

      expect(result.success).toBe(true);
      expect(result.installed).toHaveLength(1);
      expect(result.installed[0].file).toBe('package.json');
      expect(result.message).toBe('Installed dependencies for 1 package file(s)');
      expect(execSync).toHaveBeenCalledWith('npm install', {
        cwd: mockWorktreePath,
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    });

    it('should install Python dependencies for requirements.txt', async () => {
      const analysis = {
        changedFiles: ['requirements.txt']
      };

      execSync.mockReturnValue('pip packages installed');

      const result = await manager.reinstallDependencies(analysis);

      expect(result.success).toBe(true);
      expect(result.installed[0].file).toBe('requirements.txt');
      expect(execSync).toHaveBeenCalledWith('pip install -r requirements.txt', {
        cwd: mockWorktreePath,
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    });

    it('should install Ruby dependencies for Gemfile', async () => {
      const analysis = {
        changedFiles: ['Gemfile']
      };

      execSync.mockReturnValue('bundle installed');

      const result = await manager.reinstallDependencies(analysis);

      expect(result.success).toBe(true);
      expect(result.installed[0].file).toBe('Gemfile');
      expect(execSync).toHaveBeenCalledWith('bundle install', {
        cwd: mockWorktreePath,
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    });

    it('should install Go dependencies for go.mod', async () => {
      const analysis = {
        changedFiles: ['go.mod']
      };

      execSync.mockReturnValue('go modules downloaded');

      const result = await manager.reinstallDependencies(analysis);

      expect(result.success).toBe(true);
      expect(result.installed[0].file).toBe('go.mod');
      expect(execSync).toHaveBeenCalledWith('go mod download', {
        cwd: mockWorktreePath,
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    });

    it('should install Rust dependencies for Cargo.toml', async () => {
      const analysis = {
        changedFiles: ['Cargo.toml']
      };

      execSync.mockReturnValue('cargo built');

      const result = await manager.reinstallDependencies(analysis);

      expect(result.success).toBe(true);
      expect(result.installed[0].file).toBe('Cargo.toml');
      expect(execSync).toHaveBeenCalledWith('cargo build', {
        cwd: mockWorktreePath,
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    });

    it('should install PHP dependencies for composer.json', async () => {
      const analysis = {
        changedFiles: ['composer.json']
      };

      execSync.mockReturnValue('composer installed');

      const result = await manager.reinstallDependencies(analysis);

      expect(result.success).toBe(true);
      expect(result.installed[0].file).toBe('composer.json');
      expect(execSync).toHaveBeenCalledWith('composer install', {
        cwd: mockWorktreePath,
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    });

    it('should handle multiple package managers in same project', async () => {
      const analysis = {
        changedFiles: ['package.json', 'requirements.txt', 'Gemfile']
      };

      execSync.mockReturnValue('installed');

      const result = await manager.reinstallDependencies(analysis);

      expect(result.success).toBe(true);
      expect(result.installed).toHaveLength(3);
      expect(result.message).toBe('Installed dependencies for 3 package file(s)');
    });

    it('should continue installing if one package manager fails but others succeed', async () => {
      const analysis = {
        changedFiles: ['package.json', 'requirements.txt']
      };

      execSync.mockImplementation((cmd) => {
        if (cmd.includes('npm')) {
          throw new Error('npm failed');
        }
        return 'success';
      });

      const result = await manager.reinstallDependencies(analysis);

      expect(result.success).toBe(false); // One failed
      expect(result.installed).toHaveLength(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('package.json');
    });

    it('should return success when no dependency files changed', async () => {
      const analysis = {
        changedFiles: ['src/index.js', 'README.md']
      };

      const result = await manager.reinstallDependencies(analysis);

      expect(result.success).toBe(true);
      expect(result.installed).toHaveLength(0);
      expect(result.message).toBe('No dependencies to install');
      expect(execSync).not.toHaveBeenCalled();
    });

    it('should handle install command errors', async () => {
      const analysis = {
        changedFiles: ['package.json']
      };

      const mockError = new Error('ENOENT: npm not found');
      mockError.stderr = 'npm: command not found';
      execSync.mockImplementation(() => {
        throw mockError;
      });

      const result = await manager.reinstallDependencies(analysis);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('runMigrations', () => {
    it('should detect and run Prisma migrations', async () => {
      const analysis = {
        needsMigration: {
          hasMigrations: true,
          count: 2
        }
      };

      existsSync.mockImplementation((path) => {
        return path.includes('prisma/schema.prisma');
      });

      execSync.mockReturnValue('Migrations applied');

      const result = await manager.runMigrations(analysis);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Ran 2 migration(s) with prisma');
      expect(execSync).toHaveBeenCalledWith('npx prisma migrate deploy', {
        cwd: mockWorktreePath,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: process.env
      });
    });

    it('should detect and run Sequelize migrations', async () => {
      const analysis = {
        needsMigration: {
          hasMigrations: true,
          count: 1
        }
      };

      existsSync.mockImplementation((path) => {
        return path.includes('migrations/') && !path.includes('alembic.ini');
      });

      execSync.mockReturnValue('Migrations applied');

      const result = await manager.runMigrations(analysis);

      expect(result.success).toBe(true);
      expect(execSync).toHaveBeenCalledWith('npx sequelize-cli db:migrate', {
        cwd: mockWorktreePath,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: process.env
      });
    });

    it('should detect and run TypeORM migrations', async () => {
      const analysis = {
        needsMigration: {
          hasMigrations: true,
          count: 3
        }
      };

      existsSync.mockImplementation((path) => {
        return path.includes('ormconfig.json');
      });

      execSync.mockReturnValue('Migrations applied');

      const result = await manager.runMigrations(analysis);

      expect(result.success).toBe(true);
      expect(execSync).toHaveBeenCalledWith('npx typeorm migration:run', {
        cwd: mockWorktreePath,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: process.env
      });
    });

    it('should detect and run Django migrations', async () => {
      const analysis = {
        needsMigration: {
          hasMigrations: true,
          count: 2
        }
      };

      existsSync.mockImplementation((path) => {
        return path.includes('manage.py');
      });

      execSync.mockReturnValue('Migrations applied');

      const result = await manager.runMigrations(analysis);

      expect(result.success).toBe(true);
      expect(execSync).toHaveBeenCalledWith('python manage.py migrate', {
        cwd: mockWorktreePath,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: process.env
      });
    });

    it('should detect and run Flask migrations', async () => {
      const analysis = {
        needsMigration: {
          hasMigrations: true,
          count: 1
        }
      };

      existsSync.mockImplementation((path) => {
        return path.includes('migrations/alembic.ini');
      });

      execSync.mockReturnValue('Migrations applied');

      const result = await manager.runMigrations(analysis);

      expect(result.success).toBe(true);
      expect(execSync).toHaveBeenCalledWith('flask db upgrade', {
        cwd: mockWorktreePath,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: process.env
      });
    });

    it('should detect and run Rails migrations', async () => {
      const analysis = {
        needsMigration: {
          hasMigrations: true,
          count: 4
        }
      };

      existsSync.mockImplementation((path) => {
        return path.includes('db/migrate/');
      });

      execSync.mockReturnValue('Migrations applied');

      const result = await manager.runMigrations(analysis);

      expect(result.success).toBe(true);
      expect(execSync).toHaveBeenCalledWith('bundle exec rake db:migrate', {
        cwd: mockWorktreePath,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: process.env
      });
    });

    it('should detect and run Laravel migrations', async () => {
      const analysis = {
        needsMigration: {
          hasMigrations: true,
          count: 2
        }
      };

      existsSync.mockImplementation((path) => {
        return path.includes('database/migrations/');
      });

      execSync.mockReturnValue('Migrations applied');

      const result = await manager.runMigrations(analysis);

      expect(result.success).toBe(true);
      expect(execSync).toHaveBeenCalledWith('php artisan migrate', {
        cwd: mockWorktreePath,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: process.env
      });
    });

    it('should fail gracefully when no migration framework detected', async () => {
      const analysis = {
        needsMigration: {
          hasMigrations: true,
          count: 1
        }
      };

      existsSync.mockReturnValue(false);

      const result = await manager.runMigrations(analysis);

      expect(result.success).toBe(false);
      expect(result.message).toBe('No migration framework detected');
      expect(result.errors).toContain('Unable to determine how to run migrations');
      expect(execSync).not.toHaveBeenCalled();
    });

    it('should handle migration command failures', async () => {
      const analysis = {
        needsMigration: {
          hasMigrations: true,
          count: 1
        }
      };

      existsSync.mockImplementation((path) => {
        return path.includes('prisma/schema.prisma');
      });

      const mockError = new Error('Database connection failed');
      mockError.stderr = 'Connection refused';
      execSync.mockImplementation(() => {
        throw mockError;
      });

      const result = await manager.runMigrations(analysis);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Migration failed');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle exceptions during migration execution', async () => {
      const analysis = {
        needsMigration: {
          hasMigrations: true,
          count: 1
        }
      };

      existsSync.mockImplementation(() => {
        throw new Error('File system error');
      });

      const result = await manager.runMigrations(analysis);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('notifyAgent', () => {
    let mockPtyManager;
    let mockTerminal;

    beforeEach(() => {
      mockTerminal = {
        write: vi.fn()
      };

      // Mock PTYSessionManager with _sessions Map
      const mockSessionId = 'test-session-id';
      mockPtyManager = {
        _sessions: new Map([
          [mockSessionId, {
            id: mockSessionId,
            worktreeName: 'test-worktree',
            agent: 'claude',
            pty: mockTerminal,
            connected: true
          }]
        ])
      };
    });

    it('should send formatted notification to active terminal', async () => {
      const analysis = {
        summary: {
          services: ['docker-compose.yml'],
          dependencies: ['package.json'],
          total: 5
        },
        needsMigration: {
          hasMigrations: true,
          count: 2
        },
        affectedServices: ['api', 'postgres']
      };

      const result = await manager.notifyAgent(analysis, mockPtyManager, 'test-worktree');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Agent notified of changes');
      expect(mockTerminal.write).toHaveBeenCalled();

      // Verify notification contains key information
      const allWrites = mockTerminal.write.mock.calls.map(call => call[0]).join('');
      expect(allWrites).toContain('Repository Updated');
      expect(allWrites).toContain('Service config changed');
      expect(allWrites).toContain('Dependencies updated');
      expect(allWrites).toContain('migration(s) detected');
      expect(allWrites).toContain('Affected services');
      expect(allWrites).toContain('5 file(s) changed');
    });

    it('should format notification with service changes only', async () => {
      const analysis = {
        summary: {
          services: ['docker-compose.yml'],
          dependencies: [],
          total: 1
        },
        needsMigration: { hasMigrations: false },
        affectedServices: ['api']
      };

      const result = await manager.notifyAgent(analysis, mockPtyManager, 'test-worktree');

      expect(result.success).toBe(true);
      const allWrites = mockTerminal.write.mock.calls.map(call => call[0]).join('');
      expect(allWrites).toContain('Service config changed');
      expect(allWrites).not.toContain('Dependencies updated');
      expect(allWrites).not.toContain('migration(s) detected');
    });

    it('should format notification with dependencies only', async () => {
      const analysis = {
        summary: {
          services: [],
          dependencies: ['package.json', 'requirements.txt'],
          total: 2
        },
        needsMigration: { hasMigrations: false },
        affectedServices: []
      };

      const result = await manager.notifyAgent(analysis, mockPtyManager, 'test-worktree');

      expect(result.success).toBe(true);
      const allWrites = mockTerminal.write.mock.calls.map(call => call[0]).join('');
      expect(allWrites).toContain('Dependencies updated');
      expect(allWrites).not.toContain('Service config changed');
    });

    it('should format notification with migrations only', async () => {
      const analysis = {
        summary: {
          services: [],
          dependencies: [],
          total: 1
        },
        needsMigration: {
          hasMigrations: true,
          count: 3
        },
        affectedServices: []
      };

      const result = await manager.notifyAgent(analysis, mockPtyManager, 'test-worktree');

      expect(result.success).toBe(true);
      const allWrites = mockTerminal.write.mock.calls.map(call => call[0]).join('');
      expect(allWrites).toContain('3 migration(s) detected');
    });

    it('should not show affected services when _all_ is in list', async () => {
      const analysis = {
        summary: {
          services: [],
          dependencies: [],
          total: 1
        },
        needsMigration: { hasMigrations: false },
        affectedServices: ['_all_']
      };

      const result = await manager.notifyAgent(analysis, mockPtyManager, 'test-worktree');

      expect(result.success).toBe(true);
      const allWrites = mockTerminal.write.mock.calls.map(call => call[0]).join('');
      expect(allWrites).not.toContain('Affected services');
    });

    it('should show affected services for specific services', async () => {
      const analysis = {
        summary: {
          services: [],
          dependencies: [],
          total: 1
        },
        needsMigration: { hasMigrations: false },
        affectedServices: ['api', 'postgres', 'redis']
      };

      const result = await manager.notifyAgent(analysis, mockPtyManager, 'test-worktree');

      expect(result.success).toBe(true);
      const allWrites = mockTerminal.write.mock.calls.map(call => call[0]).join('');
      expect(allWrites).toContain('Affected services');
      expect(allWrites).toContain('api');
      expect(allWrites).toContain('postgres');
      expect(allWrites).toContain('redis');
    });

    it('should handle no active terminal gracefully', async () => {
      const emptyPtyManager = {
        _sessions: new Map()
      };

      const analysis = {
        summary: { services: [], dependencies: [], total: 0 },
        needsMigration: { hasMigrations: false },
        affectedServices: []
      };

      const result = await manager.notifyAgent(analysis, emptyPtyManager, 'test-worktree');

      expect(result.success).toBe(false);
      expect(result.message).toBe('No active terminal');
    });

    it('should handle terminal write errors', async () => {
      const failingTerminal = {
        write: vi.fn(() => {
          throw new Error('Terminal write failed');
        })
      };

      const failingSessionId = 'failing-session-id';
      const failingPtyManager = {
        _sessions: new Map([
          [failingSessionId, {
            id: failingSessionId,
            worktreeName: 'test-worktree',
            agent: 'claude',
            pty: failingTerminal,
            connected: true
          }]
        ])
      };

      const analysis = {
        summary: { services: [], dependencies: [], total: 1 },
        needsMigration: { hasMigrations: false },
        affectedServices: []
      };

      const result = await manager.notifyAgent(analysis, failingPtyManager, 'test-worktree');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Terminal write failed');
    });

    it('should include ANSI color codes for terminal formatting', async () => {
      const analysis = {
        summary: {
          services: ['docker-compose.yml'],
          dependencies: ['package.json'],
          total: 2
        },
        needsMigration: { hasMigrations: false },
        affectedServices: []
      };

      await manager.notifyAgent(analysis, mockPtyManager, 'test-worktree');

      const allWrites = mockTerminal.write.mock.calls.map(call => call[0]).join('');
      // Check for ANSI color codes
      expect(allWrites).toContain('\x1b[36m'); // Cyan
      expect(allWrites).toContain('\x1b[33m'); // Yellow
      expect(allWrites).toContain('\x1b[32m'); // Green
      expect(allWrites).toContain('\x1b[0m'); // Reset
    });

    it('should format minimal notification for simple changes', async () => {
      const analysis = {
        summary: {
          services: [],
          dependencies: [],
          total: 1
        },
        needsMigration: { hasMigrations: false },
        affectedServices: []
      };

      const result = await manager.notifyAgent(analysis, mockPtyManager, 'test-worktree');

      expect(result.success).toBe(true);
      const allWrites = mockTerminal.write.mock.calls.map(call => call[0]).join('');
      expect(allWrites).toContain('Repository Updated');
      expect(allWrites).toContain('1 file(s) changed');
      // Should not have other sections
      expect(allWrites).not.toContain('Service config changed');
      expect(allWrites).not.toContain('Dependencies updated');
      expect(allWrites).not.toContain('migration(s) detected');
    });
  });

  describe('Integration - Full Workflow', () => {
    it('should handle complete reload workflow with all features', async () => {
      const analysis = {
        needsDependencyInstall: true,
        needsMigration: {
          hasMigrations: true,
          count: 2
        },
        needsServiceRestart: true,
        affectedServices: ['api', 'postgres'],
        changedFiles: ['package.json', 'requirements.txt'],
        summary: {
          services: ['docker-compose.yml'],
          dependencies: ['package.json', 'requirements.txt'],
          total: 10
        }
      };

      existsSync.mockImplementation((path) => {
        return path.includes('prisma/schema.prisma');
      });

      execSync.mockReturnValue('success');

      const result = await manager.performSmartReload(analysis);

      expect(result.success).toBe(true);
      expect(result.actions).toHaveLength(3);
      expect(result.errors).toHaveLength(0);

      // Verify dependencies were installed
      expect(execSync).toHaveBeenCalledWith('npm install', expect.any(Object));
      expect(execSync).toHaveBeenCalledWith('pip install -r requirements.txt', expect.any(Object));

      // Verify migrations were run
      expect(execSync).toHaveBeenCalledWith('npx prisma migrate deploy', expect.any(Object));

      // Verify services were restarted
      expect(mockRuntime.execCompose).toHaveBeenCalledWith('restart api', expect.any(Object));
      expect(mockRuntime.execCompose).toHaveBeenCalledWith('restart postgres', expect.any(Object));
    });

    it('should handle mixed success and failure scenarios', async () => {
      const analysis = {
        needsDependencyInstall: true,
        needsMigration: {
          hasMigrations: true,
          count: 1
        },
        needsServiceRestart: true,
        affectedServices: ['api'],
        changedFiles: ['package.json']
      };

      existsSync.mockReturnValue(true);

      // npm install succeeds, migration fails, restart succeeds
      let callCount = 0;
      execSync.mockImplementation((cmd) => {
        callCount++;
        if (cmd.includes('migrate')) {
          throw new Error('Migration failed');
        }
        return 'success';
      });

      const result = await manager.performSmartReload(analysis, {
        continueOnError: true
      });

      expect(result.success).toBe(true); // Final action succeeded
      expect(result.errors).toContain('Migration failed');
      expect(result.actions).toHaveLength(3);
    });
  });
});
