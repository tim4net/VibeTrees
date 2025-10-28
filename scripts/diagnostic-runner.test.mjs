/**
 * Tests for DiagnosticRunner
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiagnosticRunner } from './diagnostic-runner.mjs';
import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';

vi.mock('child_process');
vi.mock('fs');
vi.mock('net');

describe('DiagnosticRunner', () => {
  let diagnostics;
  let mockPortRegistry;
  let mockRuntime;

  beforeEach(() => {
    mockPortRegistry = {
      ports: {},
      getWorktreePorts: vi.fn(() => ({ api: 3000, postgres: 5432 })),
      save: vi.fn()
    };

    mockRuntime = {
      getComposeCommand: vi.fn(() => 'docker compose'),
      getRuntime: vi.fn(() => 'docker')
    };

    diagnostics = new DiagnosticRunner('/repo', mockPortRegistry, mockRuntime);
  });

  describe('checkGitWorktree', () => {
    it('should pass for healthy worktree', async () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('gitdir: /repo/.git/worktrees/feature-test');
      execSync.mockImplementation((cmd) => {
        if (cmd.includes('git rev-parse')) return 'abc123';
        if (cmd.includes('git status')) return '';
        return '';
      });

      const result = await diagnostics.checkGitWorktree('feature-test');

      expect(result.status).toBe('ok');
      expect(result.issues).toHaveLength(0);
      expect(result.fixable).toBe(false);
    });

    it('should detect missing worktree path', async () => {
      existsSync.mockReturnValue(false);

      const result = await diagnostics.checkGitWorktree('feature-test');

      expect(result.status).toBe('error');
      expect(result.issues).toContain('Worktree path does not exist');
      expect(result.fixable).toBe(true);
      expect(result.fix).toBe('remove_from_git');
    });

    it('should detect invalid .git file', async () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('invalid content');

      const result = await diagnostics.checkGitWorktree('feature-test');

      expect(result.status).toBe('error');
      expect(result.issues).toContain('Invalid .git file format');
      expect(result.fixable).toBe(true);
    });

    it('should warn about uncommitted changes', async () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('gitdir: /repo/.git/worktrees/feature-test');
      execSync.mockImplementation((cmd) => {
        if (cmd.includes('git rev-parse')) return 'abc123';
        if (cmd.includes('git status')) return 'M file.txt\n';
        return '';
      });

      const result = await diagnostics.checkGitWorktree('feature-test');

      expect(result.status).toBe('warning');
      expect(result.issues).toContain('Uncommitted changes detected');
    });
  });

  describe('checkContainers', () => {
    it('should pass for all running containers', async () => {
      execSync.mockReturnValue(
        JSON.stringify({ Service: 'api', State: 'running' }) + '\n' +
        JSON.stringify({ Service: 'postgres', State: 'running' })
      );

      const result = await diagnostics.checkContainers('feature-test');

      expect(result.status).toBe('ok');
      expect(result.issues).toHaveLength(0);
    });

    it('should warn about stopped containers', async () => {
      execSync.mockReturnValue(
        JSON.stringify({ Service: 'api', State: 'exited' })
      );

      const result = await diagnostics.checkContainers('feature-test');

      expect(result.status).toBe('warning');
      expect(result.issues[0]).toContain('not running');
      expect(result.fixable).toBe(true);
      expect(result.fix).toBe('restart_services');
    });

    it('should handle missing containers gracefully', async () => {
      execSync.mockReturnValue('');

      const result = await diagnostics.checkContainers('feature-test');

      expect(result.status).toBe('warning');
      expect(result.issues).toContain('No containers found');
    });
  });

  describe('checkPortRegistry', () => {
    it('should pass for consistent registry', async () => {
      mockPortRegistry.ports = {
        'feature-test:api': 3000,
        'feature-test:postgres': 5432
      };

      existsSync.mockReturnValue(true);

      const result = await diagnostics.checkPortRegistry();

      expect(result.status).toBe('ok');
      expect(result.issues).toHaveLength(0);
    });

    it('should detect orphaned port allocations', async () => {
      mockPortRegistry.ports = {
        'nonexistent:api': 3000
      };

      existsSync.mockReturnValue(false);

      const result = await diagnostics.checkPortRegistry();

      expect(result.status).toBe('warning');
      expect(result.issues[0]).toContain('Orphaned port allocation');
      expect(result.fixable).toBe(true);
      expect(result.fix).toBe('cleanup_orphaned_ports');
    });

    it('should detect duplicate port allocations', async () => {
      mockPortRegistry.ports = {
        'feature-1:api': 3000,
        'feature-2:api': 3000 // Same port!
      };

      existsSync.mockReturnValue(true);

      const result = await diagnostics.checkPortRegistry();

      expect(result.status).toBe('error');
      expect(result.issues[0]).toContain('allocated 2 times');
    });
  });

  describe('checkGitConsistency', () => {
    it('should pass for consistent git worktrees', async () => {
      execSync.mockReturnValue(`
worktree /repo/.worktrees/feature-1
worktree /repo/.worktrees/feature-2
`);

      existsSync.mockReturnValue(true);

      const result = await diagnostics.checkGitConsistency();

      expect(result.status).toBe('ok');
      expect(result.issues).toHaveLength(0);
    });

    it('should detect stale git worktree references', async () => {
      execSync.mockReturnValue(`
worktree /repo/.worktrees/deleted
`);

      existsSync.mockReturnValue(false);

      const result = await diagnostics.checkGitConsistency();

      expect(result.status).toBe('warning');
      expect(result.issues[0]).toContain('missing path');
      expect(result.fixable).toBe(true);
      expect(result.fix).toBe('prune_git_worktrees');
    });
  });

  describe('checkDiskSpace', () => {
    it('should pass for normal disk usage', async () => {
      execSync.mockReturnValue(`
Filesystem     Size  Used Avail Use% Mounted on
/dev/sda1      100G   50G   50G  50% /
`);

      const result = await diagnostics.checkDiskSpace();

      expect(result.status).toBe('ok');
      expect(result.issues).toHaveLength(0);
    });

    it('should warn for high disk usage', async () => {
      execSync.mockReturnValue(`
Filesystem     Size  Used Avail Use% Mounted on
/dev/sda1      100G   85G   15G  85% /
`);

      const result = await diagnostics.checkDiskSpace();

      expect(result.status).toBe('warning');
      expect(result.issues[0]).toContain('Disk usage high: 85%');
    });

    it('should error for critical disk usage', async () => {
      execSync.mockReturnValue(`
Filesystem     Size  Used Avail Use% Mounted on
/dev/sda1      100G   95G    5G  95% /
`);

      const result = await diagnostics.checkDiskSpace();

      expect(result.status).toBe('error');
      expect(result.issues[0]).toContain('critically high: 95%');
    });
  });

  describe('autoFix', () => {
    it('should cleanup orphaned ports', async () => {
      mockPortRegistry.ports = {
        'deleted:api': 3000,
        'existing:api': 3001
      };

      existsSync.mockImplementation((path) => path.includes('existing'));

      const result = await diagnostics.autoFix('cleanup_orphaned_ports');

      expect(result.success).toBe(true);
      expect(result.details).toContain('deleted:api');
      expect(mockPortRegistry.save).toHaveBeenCalled();
    });

    it('should prune git worktrees', async () => {
      execSync.mockReturnValue('');

      const result = await diagnostics.autoFix('prune_git_worktrees');

      expect(result.success).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        'git worktree prune',
        expect.any(Object)
      );
    });

    it('should restart services', async () => {
      execSync.mockReturnValue('');

      const result = await diagnostics.autoFix('restart_services', {
        worktreeName: 'feature-test'
      });

      expect(result.success).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        'docker compose restart',
        expect.any(Object)
      );
    });

    it('should handle unknown fix types', async () => {
      const result = await diagnostics.autoFix('unknown_fix');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown fix type');
    });

    it('should handle fix errors gracefully', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Command failed');
      });

      const result = await diagnostics.autoFix('prune_git_worktrees');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Command failed');
    });
  });

  describe('runAll', () => {
    it('should run all checks and calculate health', async () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('gitdir: ...');
      execSync.mockReturnValue('');

      const report = await diagnostics.runAll('feature-test');

      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('worktree', 'feature-test');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('checks');
      expect(report.checks.length).toBeGreaterThan(0);
    });

    it('should calculate healthy status when all checks pass', async () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('gitdir: ...');
      execSync.mockReturnValue('');

      // Mock successful responses
      vi.spyOn(diagnostics, 'checkGitWorktree').mockResolvedValue({
        status: 'ok',
        issues: [],
        fixable: false
      });

      const report = await diagnostics.runAll('feature-test');

      expect(report.summary.health).toBe('healthy');
    });

    it('should calculate warning status when warnings exist', async () => {
      vi.spyOn(diagnostics, 'checkGitWorktree').mockResolvedValue({
        status: 'warning',
        issues: ['Some warning'],
        fixable: false
      });

      const report = await diagnostics.runAll('feature-test');

      expect(report.summary.health).toBe('warning');
    });

    it('should calculate critical status when errors exist', async () => {
      vi.spyOn(diagnostics, 'checkGitWorktree').mockResolvedValue({
        status: 'error',
        issues: ['Critical error'],
        fixable: true
      });

      const report = await diagnostics.runAll('feature-test');

      expect(report.summary.health).toBe('critical');
    });
  });
});
