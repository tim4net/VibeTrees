import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthChecker } from './health-checker.mjs';
import { execSync } from 'child_process';

// Mock execSync
vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

describe('HealthChecker', () => {
  let checker;
  let mockRuntime;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRuntime = {
      runtime: 'docker',
      needsSudo: false,
      exec: vi.fn((cmd, opts) => execSync(`docker ${cmd}`, opts))
    };

    checker = new HealthChecker({
      runtime: mockRuntime,
      projectRoot: '/test/project',
      vibeDir: '/test/.vibetrees'
    });
  });

  describe('Container Runtime Check', () => {
    it('should return healthy when docker is running', async () => {
      execSync.mockImplementation(cmd => {
        if (cmd.includes('--version')) {
          return 'Docker version 24.0.6, build ed223bc';
        }
        if (cmd.includes('info')) {
          return 'Server Version: 24.0.6';
        }
      });

      const result = await checker.checkContainerRuntime();

      expect(result.status).toBe('healthy');
      expect(result.runtime).toBe('docker');
      expect(result.version).toContain('Docker version');
    });

    it('should return unhealthy when docker daemon is not running', async () => {
      execSync.mockImplementation(cmd => {
        if (cmd.includes('--version')) {
          return 'Docker version 24.0.6';
        }
        if (cmd.includes('info')) {
          throw new Error('Cannot connect to the Docker daemon');
        }
      });

      const result = await checker.checkContainerRuntime();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain('daemon is not running');
    });

    it('should return healthy for podman without daemon check', async () => {
      mockRuntime.runtime = 'podman';
      execSync.mockReturnValue('podman version 4.6.0');

      const result = await checker.checkContainerRuntime();

      expect(result.status).toBe('healthy');
      expect(result.runtime).toBe('podman');
    });

    it('should return unknown when runtime not configured', async () => {
      checker.runtime = null;

      const result = await checker.checkContainerRuntime();

      expect(result.status).toBe('unknown');
      expect(result.message).toContain('not configured');
    });
  });

  describe('Git Repository Check', () => {
    it('should return healthy when in a git repository', async () => {
      execSync.mockImplementation(cmd => {
        if (cmd.includes('git --version')) {
          return 'git version 2.42.0';
        }
        if (cmd.includes('show-toplevel')) {
          return '/test/project';
        }
        if (cmd.includes('abbrev-ref')) {
          return 'main';
        }
        if (cmd.includes('worktree list')) {
          return 'worktree /test/project\nworktree /test/project/.worktrees/feature-1';
        }
      });

      const result = await checker.checkGit();

      expect(result.status).toBe('healthy');
      expect(result.version).toContain('git version');
      expect(result.repository).toBe('/test/project');
      expect(result.branch).toBe('main');
      expect(result.worktreeCount).toBe(2);
    });

    it('should return warning when not in a git repository', async () => {
      execSync.mockImplementation(cmd => {
        if (cmd.includes('git --version')) {
          return 'git version 2.42.0';
        }
        if (cmd.includes('show-toplevel')) {
          throw new Error('not a git repository');
        }
      });

      const result = await checker.checkGit();

      expect(result.status).toBe('warning');
      expect(result.message).toContain('Not a git repository');
    });

    it('should return unhealthy when git is not installed', async () => {
      execSync.mockImplementation(() => {
        throw new Error('git: command not found');
      });

      const result = await checker.checkGit();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain('not installed');
    });
  });

  describe('Service Health Check', () => {
    it('should return healthy with running containers', async () => {
      execSync.mockReturnValue('container-1\ncontainer-2\ncontainer-3');

      const result = await checker.checkServices();

      expect(result.status).toBe('healthy');
      expect(result.containers).toHaveLength(3);
      expect(result.count).toBe(3);
      expect(result.message).toContain('3 containers running');
    });

    it('should return healthy with no containers', async () => {
      execSync.mockReturnValue('');

      const result = await checker.checkServices();

      expect(result.status).toBe('healthy');
      expect(result.containers).toHaveLength(0);
      expect(result.count).toBe(0);
    });

    it('should return warning on error', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = await checker.checkServices();

      expect(result.status).toBe('warning');
      expect(result.message).toContain('Could not check services');
    });
  });

  describe('Overall Health Check', () => {
    it('should return healthy when all checks pass', async () => {
      execSync.mockImplementation(cmd => {
        if (cmd.includes('docker')) {
          return 'Docker version 24.0.6';
        }
        if (cmd.includes('git')) {
          return 'git version 2.42.0';
        }
        return '';
      });

      // Mock statfs for disk check
      const originalStatfs = require('fs').statfs;
      vi.spyOn(require('fs'), 'statfs').mockImplementation((path, callback) => {
        callback(null, {
          bavail: 10000000, // 10M blocks available
          bsize: 4096, // 4KB block size
          blocks: 20000000 // 20M total blocks
        });
      });

      const result = await checker.check();

      expect(result.status).toBe('healthy');
      expect(result.checks).toHaveProperty('runtime');
      expect(result.checks).toHaveProperty('git');
      expect(result.checks).toHaveProperty('disk');
      expect(result.checks).toHaveProperty('services');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('duration');

      vi.restoreAllMocks();
    });

    it('should return unhealthy if any check is unhealthy', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Command failed');
      });

      const result = await checker.check();

      expect(result.status).toBe('unhealthy');
    });
  });

  describe('Format Bytes', () => {
    it('should format bytes correctly', () => {
      expect(checker._formatBytes(1024)).toBe('1.00 KB');
      expect(checker._formatBytes(1024 * 1024)).toBe('1.00 MB');
      expect(checker._formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
      expect(checker._formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1.00 TB');
    });
  });

  describe('Is Healthy', () => {
    it('should return true when healthy', async () => {
      execSync.mockReturnValue('');

      // Mock successful checks
      vi.spyOn(checker, 'check').mockResolvedValue({
        status: 'healthy',
        checks: {},
        timestamp: new Date().toISOString(),
        duration: 100
      });

      const result = await checker.isHealthy();

      expect(result).toBe(true);
    });

    it('should return false when unhealthy', async () => {
      vi.spyOn(checker, 'check').mockResolvedValue({
        status: 'unhealthy',
        checks: {},
        timestamp: new Date().toISOString(),
        duration: 100
      });

      const result = await checker.isHealthy();

      expect(result).toBe(false);
    });
  });
});
