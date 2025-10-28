/**
 * Tests for Git Sync Manager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing
vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn()
}));

vi.mock('js-yaml', () => ({
  default: {
    load: vi.fn()
  },
  load: vi.fn()
}));

// Import after mocking
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';
import { ChangeDetector, GitSyncManager } from './git-sync-manager.mjs';

describe('ChangeDetector', () => {
  const mockWorktreePath = '/test/worktree';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getChangedFiles', () => {
    it('should return empty array for no commits', async () => {
      const detector = new ChangeDetector(mockWorktreePath);
      const files = await detector.getChangedFiles([]);

      expect(files).toEqual([]);
    });

    it('should get changed files for single commit', async () => {
      execSync.mockReturnValue('file1.js\nfile2.js\nfile3.js\n');

      const detector = new ChangeDetector(mockWorktreePath);
      const files = await detector.getChangedFiles(['abc123']);

      expect(execSync).toHaveBeenCalledWith(
        'git diff --name-only abc123',
        expect.objectContaining({ cwd: mockWorktreePath })
      );
      expect(files).toEqual(['file1.js', 'file2.js', 'file3.js']);
    });

    it('should get changed files for commit range', async () => {
      execSync.mockReturnValue('src/app.js\nsrc/utils.js\n');

      const detector = new ChangeDetector(mockWorktreePath);
      const files = await detector.getChangedFiles(['abc123', 'def456', 'ghi789']);

      expect(execSync).toHaveBeenCalledWith(
        'git diff --name-only ghi789..abc123',
        expect.objectContaining({ cwd: mockWorktreePath })
      );
      expect(files).toEqual(['src/app.js', 'src/utils.js']);
    });

    it('should filter out empty file names', async () => {
      execSync.mockReturnValue('file1.js\n\nfile2.js\n\n');

      const detector = new ChangeDetector(mockWorktreePath);
      const files = await detector.getChangedFiles(['abc123']);

      expect(files).toEqual(['file1.js', 'file2.js']);
    });

    it('should handle git errors gracefully', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Git command failed');
      });

      const detector = new ChangeDetector(mockWorktreePath);
      const files = await detector.getChangedFiles(['abc123']);

      expect(files).toEqual([]);
    });

    it('should split by newline but not trim individual filenames', async () => {
      execSync.mockReturnValue('file1.js\nfile2.js\n');

      const detector = new ChangeDetector(mockWorktreePath);
      const files = await detector.getChangedFiles(['abc123']);

      expect(files).toEqual(['file1.js', 'file2.js']);
    });
  });

  describe('detectServiceChanges', () => {
    it('should detect docker-compose.yml changes', () => {
      const detector = new ChangeDetector(mockWorktreePath);
      const result = detector.detectServiceChanges(['docker-compose.yml']);

      expect(result).toBe(true);
    });

    it('should detect compose.yml changes', () => {
      const detector = new ChangeDetector(mockWorktreePath);
      const result = detector.detectServiceChanges(['compose.yml']);

      expect(result).toBe(true);
    });

    it('should detect podman-compose.yml changes', () => {
      const detector = new ChangeDetector(mockWorktreePath);
      const result = detector.detectServiceChanges(['podman-compose.yml']);

      expect(result).toBe(true);
    });

    it('should detect environment-specific compose files', () => {
      const detector = new ChangeDetector(mockWorktreePath);

      expect(detector.detectServiceChanges(['docker-compose.dev.yml'])).toBe(true);
      expect(detector.detectServiceChanges(['docker-compose.prod.yml'])).toBe(true);
      expect(detector.detectServiceChanges(['docker-compose.test.yml'])).toBe(true);
    });

    it('should detect Dockerfile changes', () => {
      const detector = new ChangeDetector(mockWorktreePath);
      const result = detector.detectServiceChanges(['Dockerfile']);

      expect(result).toBe(true);
    });

    it('should detect .env file changes', () => {
      const detector = new ChangeDetector(mockWorktreePath);

      expect(detector.detectServiceChanges(['.env'])).toBe(true);
      expect(detector.detectServiceChanges(['.env.local'])).toBe(true);
      expect(detector.detectServiceChanges(['.env.production'])).toBe(true);
    });

    it('should return false for non-service files', () => {
      const detector = new ChangeDetector(mockWorktreePath);

      expect(detector.detectServiceChanges(['src/app.js'])).toBe(false);
      expect(detector.detectServiceChanges(['README.md'])).toBe(false);
      expect(detector.detectServiceChanges(['package.json'])).toBe(false);
    });

    it('should detect service changes in mixed file list', () => {
      const detector = new ChangeDetector(mockWorktreePath);
      const files = ['src/app.js', 'docker-compose.yml', 'README.md'];

      expect(detector.detectServiceChanges(files)).toBe(true);
    });
  });

  describe('detectDependencyChanges', () => {
    it('should detect npm dependency changes', () => {
      const detector = new ChangeDetector(mockWorktreePath);

      expect(detector.detectDependencyChanges(['package.json'])).toBe(true);
      expect(detector.detectDependencyChanges(['package-lock.json'])).toBe(true);
    });

    it('should detect Python dependency changes', () => {
      const detector = new ChangeDetector(mockWorktreePath);

      expect(detector.detectDependencyChanges(['requirements.txt'])).toBe(true);
      expect(detector.detectDependencyChanges(['Pipfile'])).toBe(true);
      expect(detector.detectDependencyChanges(['poetry.lock'])).toBe(true);
    });

    it('should detect Ruby dependency changes', () => {
      const detector = new ChangeDetector(mockWorktreePath);

      expect(detector.detectDependencyChanges(['Gemfile'])).toBe(true);
      expect(detector.detectDependencyChanges(['Gemfile.lock'])).toBe(true);
    });

    it('should detect Go dependency changes', () => {
      const detector = new ChangeDetector(mockWorktreePath);

      expect(detector.detectDependencyChanges(['go.mod'])).toBe(true);
      expect(detector.detectDependencyChanges(['go.sum'])).toBe(true);
    });

    it('should detect Rust dependency changes', () => {
      const detector = new ChangeDetector(mockWorktreePath);

      expect(detector.detectDependencyChanges(['Cargo.toml'])).toBe(true);
      expect(detector.detectDependencyChanges(['Cargo.lock'])).toBe(true);
    });

    it('should detect PHP dependency changes', () => {
      const detector = new ChangeDetector(mockWorktreePath);

      expect(detector.detectDependencyChanges(['composer.json'])).toBe(true);
      expect(detector.detectDependencyChanges(['composer.lock'])).toBe(true);
    });

    it('should return false for non-dependency files', () => {
      const detector = new ChangeDetector(mockWorktreePath);

      expect(detector.detectDependencyChanges(['src/app.js'])).toBe(false);
      expect(detector.detectDependencyChanges(['README.md'])).toBe(false);
      expect(detector.detectDependencyChanges(['docker-compose.yml'])).toBe(false);
    });

    it('should detect dependency changes in mixed file list', () => {
      const detector = new ChangeDetector(mockWorktreePath);
      const files = ['src/app.js', 'package.json', 'README.md'];

      expect(detector.detectDependencyChanges(files)).toBe(true);
    });
  });

  describe('detectMigrations', () => {
    it('should detect migration folder changes', () => {
      const detector = new ChangeDetector(mockWorktreePath);

      const result = detector.detectMigrations(['migrations/001_create_users.sql']);

      expect(result.hasMigrations).toBe(true);
      expect(result.files).toEqual(['migrations/001_create_users.sql']);
      expect(result.count).toBe(1);
    });

    it('should detect various migration patterns', () => {
      const detector = new ChangeDetector(mockWorktreePath);

      expect(detector.detectMigrations(['migration/001.sql']).hasMigrations).toBe(true);
      expect(detector.detectMigrations(['db/migrate/001.rb']).hasMigrations).toBe(true);
      expect(detector.detectMigrations(['database/migrations/001.php']).hasMigrations).toBe(true);
      expect(detector.detectMigrations(['prisma/migrations/001/migration.sql']).hasMigrations).toBe(true);
      expect(detector.detectMigrations(['src/user.migration.ts']).hasMigrations).toBe(true);
      expect(detector.detectMigrations(['alembic/versions/001.py']).hasMigrations).toBe(true);
    });

    it('should return correct count for multiple migrations', () => {
      const detector = new ChangeDetector(mockWorktreePath);
      const files = [
        'migrations/001_users.sql',
        'migrations/002_posts.sql',
        'migrations/003_comments.sql'
      ];

      const result = detector.detectMigrations(files);

      expect(result.hasMigrations).toBe(true);
      expect(result.count).toBe(3);
      expect(result.files).toHaveLength(3);
    });

    it('should return empty result for no migrations', () => {
      const detector = new ChangeDetector(mockWorktreePath);
      const files = ['src/app.js', 'README.md'];

      const result = detector.detectMigrations(files);

      expect(result.hasMigrations).toBe(false);
      expect(result.files).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('should handle mixed file lists', () => {
      const detector = new ChangeDetector(mockWorktreePath);
      const files = [
        'src/app.js',
        'migrations/001.sql',
        'README.md',
        'db/migrate/002.rb'
      ];

      const result = detector.detectMigrations(files);

      expect(result.hasMigrations).toBe(true);
      expect(result.count).toBe(2);
    });
  });

  describe('getAffectedServices', () => {
    beforeEach(() => {
      existsSync.mockReturnValue(false);
    });

    it('should return _all_ for service config changes', () => {
      const detector = new ChangeDetector(mockWorktreePath);
      const services = detector.getAffectedServices(['docker-compose.yml']);

      expect(services).toContain('_all_');
    });

    it('should detect services from services/ directory', () => {
      const detector = new ChangeDetector(mockWorktreePath);
      const services = detector.getAffectedServices([
        'services/api/index.js',
        'services/worker/task.js'
      ]);

      expect(services).toContain('api');
      expect(services).toContain('worker');
    });

    it('should detect services from apps/ directory', () => {
      const detector = new ChangeDetector(mockWorktreePath);
      const services = detector.getAffectedServices([
        'apps/frontend/App.js',
        'apps/backend/server.js'
      ]);

      expect(services).toContain('frontend');
      expect(services).toContain('backend');
    });

    it('should mark all services affected for packages/ changes', () => {
      const detector = new ChangeDetector(mockWorktreePath);
      const services = detector.getAffectedServices(['packages/shared/utils.js']);

      expect(services).toContain('_all_');
    });

    it('should return empty array for unrelated files', () => {
      const detector = new ChangeDetector(mockWorktreePath);
      const services = detector.getAffectedServices(['README.md', 'docs/guide.md']);

      expect(services).toEqual([]);
    });

    it('should deduplicate service names', () => {
      const detector = new ChangeDetector(mockWorktreePath);
      const services = detector.getAffectedServices([
        'services/api/index.js',
        'services/api/routes.js',
        'services/api/models.js'
      ]);

      expect(services).toEqual(['api']);
    });

    it('should match services from docker-compose context', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(`
version: '3.8'
services:
  api:
    build:
      context: ./services/api
  worker:
    build:
      context: ./services/worker
`);

      // Mock js-yaml
      yaml.load.mockReturnValue({
        services: {
          api: { build: { context: './services/api' } },
          worker: { build: { context: './services/worker' } }
        }
      });

      const detector = new ChangeDetector(mockWorktreePath);
      const services = detector.getAffectedServices(['./services/api/index.js']);

      expect(services).toContain('api');
    });
  });

  describe('buildServiceDependencyGraph', () => {
    it('should build graph from docker-compose depends_on array', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('mock-compose-content');

      yaml.load.mockReturnValue({
        services: {
          api: { depends_on: ['db', 'redis'] },
          worker: { depends_on: ['db', 'redis'] },
          db: {},
          redis: {}
        }
      });

      const detector = new ChangeDetector(mockWorktreePath);
      const graph = detector.buildServiceDependencyGraph();

      expect(graph.get('api')).toEqual(['db', 'redis']);
      expect(graph.get('worker')).toEqual(['db', 'redis']);
      expect(graph.get('db')).toEqual([]);
      expect(graph.get('redis')).toEqual([]);
    });

    it('should build graph from docker-compose depends_on object', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('mock-compose-content');

      yaml.load.mockReturnValue({
        services: {
          api: {
            depends_on: {
              db: { condition: 'service_healthy' },
              redis: { condition: 'service_started' }
            }
          },
          db: {},
          redis: {}
        }
      });

      const detector = new ChangeDetector(mockWorktreePath);
      const graph = detector.buildServiceDependencyGraph();

      expect(graph.get('api')).toEqual(['db', 'redis']);
    });

    it('should include links as dependencies', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('mock-compose-content');

      yaml.load.mockReturnValue({
        services: {
          api: { links: ['db:database', 'redis'] },
          db: {},
          redis: {}
        }
      });

      const detector = new ChangeDetector(mockWorktreePath);
      const graph = detector.buildServiceDependencyGraph();

      expect(graph.get('api')).toEqual(['db', 'redis']);
    });

    it('should return empty graph if no compose file exists', () => {
      existsSync.mockReturnValue(false);

      const detector = new ChangeDetector(mockWorktreePath);
      const graph = detector.buildServiceDependencyGraph();

      expect(graph.size).toBe(0);
    });

    it('should handle services with no dependencies', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('mock-compose-content');

      yaml.load.mockReturnValue({
        services: {
          api: {},
          worker: {},
          db: {}
        }
      });

      const detector = new ChangeDetector(mockWorktreePath);
      const graph = detector.buildServiceDependencyGraph();

      expect(graph.get('api')).toEqual([]);
      expect(graph.get('worker')).toEqual([]);
      expect(graph.get('db')).toEqual([]);
    });
  });

  describe('getRestartOrder', () => {
    it('should return all services in dependency order for _all_', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('mock-compose-content');

      yaml.load.mockReturnValue({
        services: {
          api: { depends_on: ['db'] },
          worker: { depends_on: ['db', 'redis'] },
          db: {},
          redis: {}
        }
      });

      const detector = new ChangeDetector(mockWorktreePath);
      const order = detector.getRestartOrder(['_all_']);

      // db and redis should come before api and worker
      const flatOrder = order.flat();
      const dbIndex = flatOrder.indexOf('db');
      const redisIndex = flatOrder.indexOf('redis');
      const apiIndex = flatOrder.indexOf('api');
      const workerIndex = flatOrder.indexOf('worker');

      expect(dbIndex).toBeLessThan(apiIndex);
      expect(redisIndex).toBeLessThan(workerIndex);
    });

    it('should return specific services in dependency order', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('mock-compose-content');

      yaml.load.mockReturnValue({
        services: {
          api: { depends_on: ['db'] },
          worker: { depends_on: ['db'] },
          db: {}
        }
      });

      const detector = new ChangeDetector(mockWorktreePath);
      const order = detector.getRestartOrder(['api', 'worker']);

      expect(order).toEqual([['api', 'worker']]);
    });

    it('should handle services with no dependencies', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('mock-compose-content');

      yaml.load.mockReturnValue({
        services: {
          api: {},
          worker: {},
          db: {}
        }
      });

      const detector = new ChangeDetector(mockWorktreePath);
      const order = detector.getRestartOrder(['api', 'worker', 'db']);

      // All services have no dependencies, should be in single batch
      expect(order).toHaveLength(1);
      expect(order[0]).toEqual(expect.arrayContaining(['api', 'worker', 'db']));
    });

    it('should handle complex dependency chains', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('mock-compose-content');

      yaml.load.mockReturnValue({
        services: {
          frontend: { depends_on: ['api'] },
          api: { depends_on: ['db'] },
          db: {}
        }
      });

      const detector = new ChangeDetector(mockWorktreePath);
      const order = detector.getRestartOrder(['_all_']);

      const flatOrder = order.flat();

      // db -> api -> frontend
      expect(flatOrder.indexOf('db')).toBeLessThan(flatOrder.indexOf('api'));
      expect(flatOrder.indexOf('api')).toBeLessThan(flatOrder.indexOf('frontend'));
    });
  });

  describe('analyzeChanges', () => {
    beforeEach(() => {
      existsSync.mockReturnValue(false);
    });

    it('should analyze all aspects of changes', async () => {
      execSync.mockReturnValue(
        'docker-compose.yml\npackage.json\nmigrations/001.sql\nsrc/app.js\n'
      );

      const detector = new ChangeDetector(mockWorktreePath);
      const analysis = await detector.analyzeChanges(['abc123']);

      expect(analysis.needsServiceRestart).toBe(true);
      expect(analysis.needsDependencyInstall).toBe(true);
      expect(analysis.needsMigration.hasMigrations).toBe(true);
      expect(analysis.changedFiles).toHaveLength(4);
      expect(analysis.summary.total).toBe(4);
    });

    it('should categorize files in summary', async () => {
      execSync.mockReturnValue(
        'docker-compose.yml\npackage.json\nmigrations/001.sql\nsrc/app.js\nconfig.json\n'
      );

      const detector = new ChangeDetector(mockWorktreePath);
      const analysis = await detector.analyzeChanges(['abc123']);

      expect(analysis.summary.services).toContain('docker-compose.yml');
      expect(analysis.summary.dependencies).toContain('package.json');
      expect(analysis.summary.migrations).toContain('migrations/001.sql');
      expect(analysis.summary.source).toContain('src/app.js');
      expect(analysis.summary.config).toContain('config.json');
    });

    it('should handle no changes', async () => {
      const detector = new ChangeDetector(mockWorktreePath);
      const analysis = await detector.analyzeChanges([]);

      expect(analysis.changedFiles).toEqual([]);
      expect(analysis.summary.total).toBe(0);
      expect(analysis.needsServiceRestart).toBe(false);
      expect(analysis.needsDependencyInstall).toBe(false);
    });

    it('should identify affected services', async () => {
      execSync.mockReturnValue('services/api/index.js\nservices/worker/task.js\n');

      const detector = new ChangeDetector(mockWorktreePath);
      const analysis = await detector.analyzeChanges(['abc123']);

      expect(analysis.affectedServices).toContain('api');
      expect(analysis.affectedServices).toContain('worker');
    });
  });
});

describe('GitSyncManager', () => {
  const mockWorktreePath = '/test/worktree';
  const mockBaseBranch = 'main';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchUpstream', () => {
    it('should fetch from origin and count commits behind', async () => {
      execSync
        .mockReturnValueOnce('') // git fetch
        .mockReturnValueOnce('5\n') // rev-list count
        .mockReturnValueOnce('abc123 feat: add feature\ndef456 fix: bug\n'); // log

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const result = await manager.fetchUpstream();

      expect(result.hasUpdates).toBe(true);
      expect(result.commitCount).toBe(5);
      expect(result.commits).toHaveLength(2);
      expect(result.commits[0]).toEqual({
        sha: 'abc123',
        message: 'feat: add feature'
      });
      expect(result.baseBranch).toBe('main');
    });

    it('should handle no updates available', async () => {
      execSync
        .mockReturnValueOnce('') // git fetch
        .mockReturnValueOnce('0\n'); // rev-list count

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const result = await manager.fetchUpstream();

      expect(result.hasUpdates).toBe(false);
      expect(result.commitCount).toBe(0);
      expect(result.commits).toEqual([]);
    });

    it('should detect base branch from remote', async () => {
      execSync
        .mockReturnValueOnce('') // git fetch
        .mockReturnValueOnce('  origin/main\n  origin/develop\n') // git branch -r
        .mockReturnValueOnce('3\n') // rev-list count
        .mockReturnValueOnce('abc123 commit 1\n'); // log

      const manager = new GitSyncManager(mockWorktreePath); // No base branch specified
      const result = await manager.fetchUpstream();

      expect(result.baseBranch).toBe('main');
    });

    it('should handle git fetch errors', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Git fetch failed');
      });

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const result = await manager.fetchUpstream();

      expect(result.hasUpdates).toBe(false);
      expect(result.commitCount).toBe(0);
      expect(result.error).toBe('Git fetch failed');
    });

    it('should parse commit log correctly', async () => {
      execSync
        .mockReturnValueOnce('') // git fetch
        .mockReturnValueOnce('3\n') // rev-list count
        .mockReturnValueOnce(
          'abc123 feat: add new feature\ndef456 fix: resolve bug in authentication\nghi789 docs: update README\n'
        );

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const result = await manager.fetchUpstream();

      expect(result.commits).toHaveLength(3);
      expect(result.commits[0].message).toBe('feat: add new feature');
      expect(result.commits[1].message).toBe('fix: resolve bug in authentication');
      expect(result.commits[2].message).toBe('docs: update README');
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should return true when there are uncommitted changes', () => {
      execSync.mockReturnValue(' M src/app.js\n?? newfile.js\n');

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const hasChanges = manager.hasUncommittedChanges();

      expect(hasChanges).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        'git status --porcelain',
        expect.objectContaining({ cwd: mockWorktreePath })
      );
    });

    it('should return false when worktree is clean', () => {
      execSync.mockReturnValue('');

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const hasChanges = manager.hasUncommittedChanges();

      expect(hasChanges).toBe(false);
    });

    it('should handle git status errors', () => {
      execSync.mockImplementation(() => {
        throw new Error('Git status failed');
      });

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const hasChanges = manager.hasUncommittedChanges();

      expect(hasChanges).toBe(false);
    });

    it('should trim whitespace from status output', () => {
      execSync.mockReturnValue('   \n  \n  ');

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const hasChanges = manager.hasUncommittedChanges();

      expect(hasChanges).toBe(false);
    });
  });

  describe('syncWithMain', () => {
    it('should successfully merge with main branch', async () => {
      execSync
        .mockReturnValueOnce('abc123\n') // current commit
        .mockReturnValueOnce('') // status --porcelain (clean)
        .mockReturnValueOnce('Merge successful\n') // merge
        .mockReturnValueOnce(''); // conflicts check

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const result = await manager.syncWithMain('merge');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Sync completed successfully');
      expect(result.previousCommit).toBe('abc123');
      expect(execSync).toHaveBeenCalledWith(
        'git merge origin/main',
        expect.objectContaining({ cwd: mockWorktreePath })
      );
    });

    it('should successfully rebase with main branch', async () => {
      execSync
        .mockReturnValueOnce('abc123\n') // current commit
        .mockReturnValueOnce('') // status --porcelain (clean)
        .mockReturnValueOnce('Rebase successful\n') // rebase
        .mockReturnValueOnce(''); // conflicts check

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const result = await manager.syncWithMain('rebase');

      expect(result.success).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        'git rebase origin/main',
        expect.objectContaining({ cwd: mockWorktreePath })
      );
    });

    it('should reject sync with uncommitted changes', async () => {
      execSync
        .mockReturnValueOnce('abc123\n') // current commit
        .mockReturnValueOnce(' M src/app.js\n'); // status --porcelain (dirty)

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const result = await manager.syncWithMain('merge');

      expect(result.success).toBe(false);
      expect(result.error).toBe('uncommitted_changes');
      expect(result.message).toContain('uncommitted changes');
    });

    it('should allow force sync with uncommitted changes', async () => {
      execSync
        .mockReturnValueOnce('abc123\n') // current commit
        .mockReturnValueOnce(' M src/app.js\n') // status --porcelain (dirty)
        .mockReturnValueOnce('Merge successful\n') // merge
        .mockReturnValueOnce(''); // conflicts check

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const result = await manager.syncWithMain('merge', { force: true });

      expect(result.success).toBe(true);
    });

    it('should detect merge conflicts', async () => {
      execSync
        .mockReturnValueOnce('abc123\n') // current commit
        .mockReturnValueOnce('') // status --porcelain (clean)
        .mockReturnValueOnce('Merge conflict\n') // merge
        .mockReturnValueOnce('src/app.js\nsrc/utils.js\n'); // conflicts

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const result = await manager.syncWithMain('merge');

      expect(result.success).toBe(false);
      expect(result.conflicts).toEqual(['src/app.js', 'src/utils.js']);
      expect(result.message).toContain('2 file(s) have conflicts');
      expect(result.rollbackCommit).toBe('abc123');
    });

    it('should handle sync errors with conflict detection', async () => {
      const mockError = new Error('Merge failed');
      mockError.message = 'CONFLICT';

      execSync
        .mockReturnValueOnce('abc123\n') // current commit
        .mockReturnValueOnce('') // status --porcelain (clean)
        .mockImplementationOnce(() => {
          throw mockError;
        }) // merge throws
        .mockReturnValueOnce('src/app.js\n'); // conflicts check

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const result = await manager.syncWithMain('merge');

      expect(result.success).toBe(false);
      expect(result.conflicts).toEqual(['src/app.js']);
    });

    it('should handle sync errors without conflicts', async () => {
      const mockError = new Error('Network error');

      execSync
        .mockReturnValueOnce('abc123\n') // current commit
        .mockReturnValueOnce('') // status --porcelain (clean)
        .mockImplementationOnce(() => {
          throw mockError;
        }) // merge throws
        .mockReturnValueOnce(''); // no conflicts

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const result = await manager.syncWithMain('merge');

      expect(result.success).toBe(false);
      expect(result.error).toBe('sync_failed');
      expect(result.message).toBe('Network error');
    });
  });

  describe('rollback', () => {
    it('should rollback to specified commit', async () => {
      execSync.mockReturnValue('');

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const result = await manager.rollback('abc123');

      expect(result.success).toBe(true);
      expect(result.message).toContain('abc123');
      expect(execSync).toHaveBeenCalledWith(
        'git reset --hard abc123',
        expect.objectContaining({ cwd: mockWorktreePath })
      );
    });

    it('should handle rollback errors', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Reset failed');
      });

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const result = await manager.rollback('abc123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('rollback_failed');
      expect(result.message).toBe('Reset failed');
    });
  });

  describe('analyzeChanges', () => {
    it('should delegate to ChangeDetector', async () => {
      execSync.mockReturnValue('src/app.js\npackage.json\n');

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const analysis = await manager.analyzeChanges(['abc123']);

      expect(analysis).toHaveProperty('needsServiceRestart');
      expect(analysis).toHaveProperty('needsDependencyInstall');
      expect(analysis).toHaveProperty('needsMigration');
      expect(analysis).toHaveProperty('affectedServices');
      expect(analysis).toHaveProperty('changedFiles');
      expect(analysis).toHaveProperty('summary');
    });

    it('should pass commit SHAs to ChangeDetector', async () => {
      execSync.mockReturnValue('file1.js\nfile2.js\n');

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      await manager.analyzeChanges(['abc123', 'def456']);

      expect(execSync).toHaveBeenCalledWith(
        'git diff --name-only def456..abc123',
        expect.any(Object)
      );
    });
  });

  describe('_getBaseBranch', () => {
    it('should return configured base branch', () => {
      const manager = new GitSyncManager(mockWorktreePath, 'develop');

      // Access private method for testing
      const baseBranch = manager._getBaseBranch();

      expect(baseBranch).toBe('develop');
    });

    it('should detect main branch from remote', () => {
      execSync.mockReturnValue('  origin/main\n  origin/develop\n');

      const manager = new GitSyncManager(mockWorktreePath, null); // Pass null to trigger detection
      const baseBranch = manager._getBaseBranch();

      expect(baseBranch).toBe('main');
    });

    it('should detect master branch from remote when main is not present', () => {
      execSync.mockReturnValue('  origin/master\n  origin/develop\n');

      const manager = new GitSyncManager(mockWorktreePath, null); // Pass null to trigger detection
      const baseBranch = manager._getBaseBranch();

      expect(baseBranch).toBe('master');
    });

    it('should prefer main over master when both exist', () => {
      execSync.mockReturnValue('  origin/main\n  origin/master\n  origin/develop\n');

      const manager = new GitSyncManager(mockWorktreePath, null); // Pass null to trigger detection
      const baseBranch = manager._getBaseBranch();

      expect(baseBranch).toBe('main');
    });

    it('should default to main if detection fails', () => {
      execSync.mockImplementation(() => {
        throw new Error('Git failed');
      });

      const manager = new GitSyncManager(mockWorktreePath, null); // Pass null to trigger detection
      const baseBranch = manager._getBaseBranch();

      expect(baseBranch).toBe('main');
    });
  });

  describe('_getCurrentCommit', () => {
    it('should return current commit SHA', () => {
      execSync.mockReturnValue('abc123def456\n');

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const commit = manager._getCurrentCommit();

      expect(commit).toBe('abc123def456');
      expect(execSync).toHaveBeenCalledWith(
        'git rev-parse HEAD',
        expect.objectContaining({ cwd: mockWorktreePath })
      );
    });

    it('should return null on error', () => {
      execSync.mockImplementation(() => {
        throw new Error('Git failed');
      });

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const commit = manager._getCurrentCommit();

      expect(commit).toBeNull();
    });
  });

  describe('_getConflicts', () => {
    it('should return list of conflicted files', () => {
      execSync.mockReturnValue('src/app.js\nsrc/utils.js\nsrc/config.js\n');

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const conflicts = manager._getConflicts();

      expect(conflicts).toEqual(['src/app.js', 'src/utils.js', 'src/config.js']);
    });

    it('should return empty array when no conflicts', () => {
      execSync.mockReturnValue('');

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const conflicts = manager._getConflicts();

      expect(conflicts).toEqual([]);
    });

    it('should handle git diff errors', () => {
      execSync.mockImplementation(() => {
        throw new Error('Git diff failed');
      });

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const conflicts = manager._getConflicts();

      expect(conflicts).toEqual([]);
    });

    it('should filter out empty lines', () => {
      execSync.mockReturnValue('src/app.js\n\nsrc/utils.js\n\n');

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const conflicts = manager._getConflicts();

      expect(conflicts).toEqual(['src/app.js', 'src/utils.js']);
    });
  });

  describe('Integration with ChangeDetector', () => {
    it('should use ChangeDetector for analysis', async () => {
      execSync.mockReturnValue('docker-compose.yml\npackage.json\n');

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      const analysis = await manager.analyzeChanges(['abc123']);

      expect(analysis.needsServiceRestart).toBe(true);
      expect(analysis.needsDependencyInstall).toBe(true);
    });

    it('should share worktree path with ChangeDetector', async () => {
      execSync.mockReturnValue('src/app.js\n');

      const manager = new GitSyncManager(mockWorktreePath, mockBaseBranch);
      expect(manager.changeDetector.worktreePath).toBe(mockWorktreePath);
    });
  });
});
