import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SafetyChecks } from './safety-checks.mjs';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';

vi.mock('fs');
vi.mock('os');
vi.mock('child_process');

describe('SafetyChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Disk Space Checks', () => {
    it('should check available disk space on path', async () => {
      // Mock platform and df command output (macOS/Linux)
      os.platform.mockReturnValue('darwin');
      execSync.mockReturnValue('Filesystem     1024-blocks      Used Available Capacity  Mounted on\n/dev/disk1s1    488245288 100000000 388245288    21%     /');

      const result = await SafetyChecks.checkDiskSpace('/tmp', 100 * 1024 * 1024); // 100MB

      expect(result.available).toBeGreaterThan(0);
      expect(result.required).toBe(100 * 1024 * 1024);
      expect(result.hasSpace).toBe(true);
    });

    it('should detect insufficient disk space', async () => {
      // Mock df command showing very little space
      os.platform.mockReturnValue('darwin');
      execSync.mockReturnValue('Filesystem     1024-blocks      Used Available Capacity  Mounted on\n/dev/disk1s1    488245288 487500000   745288    99%     /');

      const result = await SafetyChecks.checkDiskSpace('/tmp', 10 * 1024 * 1024 * 1024); // 10GB

      expect(result.hasSpace).toBe(false);
      expect(result.message).toContain('Insufficient disk space');
    });

    it('should include buffer in disk space calculation', async () => {
      // Mock df command
      os.platform.mockReturnValue('darwin');
      execSync.mockReturnValue('Filesystem     1024-blocks      Used Available Capacity  Mounted on\n/dev/disk1s1    488245288 100000000 388245288    21%     /');

      const result = await SafetyChecks.checkDiskSpace('/tmp', 100 * 1024 * 1024, { buffer: 0.2 }); // 20% buffer

      expect(result.requiredWithBuffer).toBe(100 * 1024 * 1024 * 1.2);
    });

    it('should estimate database size', async () => {
      const mockClient = {
        connect: vi.fn(),
        query: vi.fn().mockResolvedValue({
          rows: [{ size: '52428800' }] // 50 MB in bytes
        }),
        end: vi.fn()
      };

      const size = await SafetyChecks.estimateDatabaseSize(mockClient, 'vibe');

      expect(size).toBeGreaterThan(0);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('pg_database_size'),
        ['vibe']
      );
    });

    it('should handle disk space check errors gracefully', async () => {
      os.platform.mockReturnValue('darwin');
      execSync.mockImplementation(() => {
        throw new Error('df command failed');
      });

      const result = await SafetyChecks.checkDiskSpace('/tmp', 100);

      expect(result.hasSpace).toBe(false);
      expect(result.error).toContain('df command failed');
    });
  });

  describe('Bind Mount Validation', () => {
    it('should validate bind mount path exists', () => {
      fs.existsSync.mockReturnValue(true);
      fs.realpathSync.mockReturnValue('/home/user/data');
      fs.statSync.mockReturnValue({ isDirectory: () => true });
      fs.accessSync.mockReturnValue(undefined);

      const result = SafetyChecks.validateBindMount('/home/user/data');

      expect(result.valid).toBe(true);
      expect(result.path).toBe('/home/user/data');
    });

    it('should reject non-existent paths', () => {
      fs.existsSync.mockReturnValue(false);

      const result = SafetyChecks.validateBindMount('/nonexistent/path');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('does not exist');
    });

    it('should reject system directories', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ isDirectory: () => true });

      const systemPaths = ['/etc', '/usr', '/sys', '/proc', '/boot', '/dev'];

      for (const path of systemPaths) {
        fs.realpathSync.mockReturnValue(path);
        const result = SafetyChecks.validateBindMount(path);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('system directory');
      }
    });

    it('should check write permissions', () => {
      fs.existsSync.mockReturnValue(true);
      fs.realpathSync.mockReturnValue('/home/restricted/data'); // Not a system dir
      fs.statSync.mockReturnValue({ isDirectory: () => true });
      fs.accessSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = SafetyChecks.validateBindMount('/home/restricted/data');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('No write permission');
    });

    it('should accept paths in allowed directories', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ isDirectory: () => true });
      fs.accessSync.mockReturnValue(undefined);

      const allowedPaths = [
        '/home/user/data',
        '/Users/user/data',
        '/tmp/test',
        '/var/tmp/test'
      ];

      for (const path of allowedPaths) {
        fs.realpathSync.mockReturnValue(path);
        const result = SafetyChecks.validateBindMount(path);
        expect(result.valid).toBe(true);
      }
    });

    it('should validate path is a directory not a file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.realpathSync.mockReturnValue('/home/user/file.txt');
      fs.statSync.mockReturnValue({ isDirectory: () => false });

      const result = SafetyChecks.validateBindMount('/home/user/file.txt');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('must be a directory');
    });

    it('should normalize and resolve paths', () => {
      fs.existsSync.mockReturnValue(true);
      fs.realpathSync.mockReturnValue('/home/user/data');
      fs.statSync.mockReturnValue({ isDirectory: () => true });
      fs.accessSync.mockReturnValue(undefined);

      const result = SafetyChecks.validateBindMount('../data');

      expect(fs.realpathSync).toHaveBeenCalled();
      expect(result.path).toBe('/home/user/data');
    });
  });

  describe('Dry-Run Mode', () => {
    it('should detect dry-run from options', () => {
      expect(SafetyChecks.isDryRun({ dryRun: true })).toBe(true);
      expect(SafetyChecks.isDryRun({ dryRun: false })).toBe(false);
      expect(SafetyChecks.isDryRun({})).toBe(false);
    });

    it('should create dry-run summary', () => {
      const operations = [
        { type: 'export', target: 'database', size: 100 * 1024 * 1024 },
        { type: 'write', target: '/tmp/export.sql', size: 100 * 1024 * 1024 }
      ];

      const summary = SafetyChecks.createDryRunSummary(operations);

      expect(summary.operations).toHaveLength(2);
      expect(summary.totalDiskImpact).toBe(200 * 1024 * 1024);
      expect(summary.estimatedDuration).toContain('second');
    });

    it('should include affected files in dry-run summary', () => {
      const operations = [
        { type: 'delete', target: '/tmp/old.sql' },
        { type: 'write', target: '/tmp/new.sql' }
      ];

      const summary = SafetyChecks.createDryRunSummary(operations);

      expect(summary.affectedFiles).toContain('/tmp/old.sql');
      expect(summary.affectedFiles).toContain('/tmp/new.sql');
    });
  });

  describe('Safety Validation', () => {
    it('should run all safety checks before operation', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.realpathSync.mockReturnValue('/tmp');
      fs.statSync.mockReturnValue({ isDirectory: () => true });
      fs.accessSync.mockReturnValue(undefined);
      os.platform.mockReturnValue('darwin');
      execSync.mockReturnValue('Filesystem     1024-blocks      Used Available Capacity  Mounted on\n/dev/disk1s1    488245288 100000000 388245288    21%     /');

      const validation = await SafetyChecks.validateOperation({
        type: 'export',
        outputPath: '/tmp/export.sql',
        estimatedSize: 100 * 1024 * 1024
      });

      expect(validation.safe).toBe(true);
      expect(validation.checks).toHaveProperty('diskSpace');
      expect(validation.checks).toHaveProperty('path');
    });

    it('should fail validation if any check fails', async () => {
      fs.existsSync.mockReturnValue(false);

      const validation = await SafetyChecks.validateOperation({
        type: 'export',
        outputPath: '/nonexistent/export.sql',
        estimatedSize: 100 * 1024 * 1024
      });

      expect(validation.safe).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should provide actionable warnings', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.realpathSync.mockReturnValue('/tmp');
      fs.statSync.mockReturnValue({ isDirectory: () => true });
      fs.accessSync.mockReturnValue(undefined);
      os.platform.mockReturnValue('darwin');
      // Space that triggers warning (available < requiredWithBuffer * 1.5)
      // Required: 100MB, with 10% buffer: 110MB, warning threshold: 165MB
      // Available: 150MB (triggers warning since 150 < 165)
      execSync.mockReturnValue('Filesystem     1024-blocks      Used Available Capacity  Mounted on\n/dev/disk1s1    200000 50000 150000    25%     /');

      const validation = await SafetyChecks.validateOperation({
        type: 'export',
        outputPath: '/tmp/export.sql',
        estimatedSize: 100 * 1024 * 1024 // 100MB
      });

      expect(validation.warnings).toBeDefined();
      expect(validation.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Volume Size Estimation', () => {
    it('should estimate Docker volume size', async () => {
      execSync
        .mockReturnValueOnce('/var/lib/docker/volumes/worktree_postgres_data/_data')
        .mockReturnValueOnce('104857600\t/var/lib/docker/volumes/worktree_postgres_data/_data');

      const size = await SafetyChecks.estimateVolumeSize('worktree_postgres_data');

      expect(size).toBeGreaterThan(0);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('docker volume inspect'),
        expect.any(Object)
      );
    });

    it('should handle volume size estimation errors', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Volume not found');
      });

      const size = await SafetyChecks.estimateVolumeSize('nonexistent_volume');

      expect(size).toBe(0);
    });
  });
});
