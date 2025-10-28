/**
 * Tests for Data Synchronization System
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock runtime
const createMockRuntime = () => ({
  exec: vi.fn((cmd, options) => {
    if (cmd.includes('volume inspect')) {
      return JSON.stringify([{
        Name: 'test_postgres-data',
        Driver: 'local',
        Mountpoint: '/var/lib/docker/volumes/test_postgres-data/_data',
        CreatedAt: '2024-01-01T00:00:00Z'
      }]);
    }
    return '';
  })
});

// Create mock inspector
const createMockInspector = (volumes = []) => ({
  getServicesWithVolumes: vi.fn(() => [
    {
      name: 'postgres',
      volumes: volumes.length > 0 ? volumes : ['postgres-data']
    }
  ])
});

// Mock child_process and fs
vi.mock('child_process');
vi.mock('fs');

import { execSync } from 'child_process';
import { existsSync, statSync, mkdirSync } from 'fs';
const { DataSync } = await import('./data-sync.mjs');

describe('DataSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execSync.mockReturnValue('0\t0');
  });

  describe('Volume Discovery', () => {
    it('should discover all volumes from compose file', async () => {
      const runtime = createMockRuntime();
      const inspector = createMockInspector(['postgres-data', 'redis-data', 'minio-data']);
      const dataSync = new DataSync(runtime, inspector);

      const volumes = await dataSync.listVolumes('test-worktree');

      expect(volumes).toHaveLength(3);
      expect(volumes.map(v => v.name)).toEqual(['postgres-data', 'redis-data', 'minio-data']);
    });

    it('should identify named volumes vs bind mounts', async () => {
      const runtime = createMockRuntime();
      const inspector = createMockInspector(['postgres-data', './uploads', '/var/data']);
      const dataSync = new DataSync(runtime, inspector);

      const volumes = await dataSync.listVolumes('test-worktree');

      expect(volumes[0].type).toBe('volume'); // postgres-data
      expect(volumes[1].type).toBe('bind');   // ./uploads
      expect(volumes[2].type).toBe('bind');   // /var/data
    });

    it('should deduplicate volumes used by multiple services', async () => {
      const runtime = createMockRuntime();
      const inspector = {
        getServicesWithVolumes: vi.fn(() => [
          { name: 'api', volumes: ['shared-data'] },
          { name: 'worker', volumes: ['shared-data'] },
          { name: 'db', volumes: ['postgres-data'] }
        ])
      };
      const dataSync = new DataSync(runtime, inspector);

      const volumes = await dataSync.listVolumes('test-worktree');

      expect(volumes).toHaveLength(2);
      expect(volumes.map(v => v.name)).toEqual(['shared-data', 'postgres-data']);
    });
  });

  describe('Volume Copying', () => {
    it('should copy all volumes by default', async () => {
      const runtime = createMockRuntime();
      const inspector = createMockInspector(['postgres-data', 'redis-data']);
      const dataSync = new DataSync(runtime, inspector);

      const results = await dataSync.copyVolumes('main', 'feature-auth');

      expect(results.copied).toHaveLength(2);
      expect(results.copied).toContain('postgres-data');
      expect(results.copied).toContain('redis-data');
      expect(results.skipped).toHaveLength(0);
      expect(results.errors).toHaveLength(0);
    });

    it('should skip all volumes when skipAll is true', async () => {
      const runtime = createMockRuntime();
      const inspector = createMockInspector(['postgres-data']);
      const dataSync = new DataSync(runtime, inspector);

      const results = await dataSync.copyVolumes('main', 'feature-auth', {
        skipAll: true
      });

      expect(results.copied).toHaveLength(0);
      expect(results.skipped).toHaveLength(0);
      expect(runtime.exec).not.toHaveBeenCalled();
    });

    it('should only copy included volumes', async () => {
      const runtime = createMockRuntime();
      const inspector = createMockInspector(['postgres-data', 'redis-data', 'minio-data']);
      const dataSync = new DataSync(runtime, inspector);

      const results = await dataSync.copyVolumes('main', 'feature-auth', {
        include: ['postgres-data']
      });

      expect(results.copied).toHaveLength(1);
      expect(results.copied).toContain('postgres-data');
      expect(results.skipped).toHaveLength(2);
      expect(results.skipped).toContain('redis-data');
      expect(results.skipped).toContain('minio-data');
    });

    it('should skip excluded volumes', async () => {
      const runtime = createMockRuntime();
      const inspector = createMockInspector(['postgres-data', 'redis-data', 'minio-data']);
      const dataSync = new DataSync(runtime, inspector);

      const results = await dataSync.copyVolumes('main', 'feature-auth', {
        exclude: ['redis-data']
      });

      expect(results.copied).toHaveLength(2);
      expect(results.copied).toContain('postgres-data');
      expect(results.copied).toContain('minio-data');
      expect(results.skipped).toHaveLength(1);
      expect(results.skipped).toContain('redis-data');
    });

    it('should handle both include and exclude filters', async () => {
      const runtime = createMockRuntime();
      const inspector = createMockInspector(['postgres-data', 'redis-data', 'minio-data']);
      const dataSync = new DataSync(runtime, inspector);

      const results = await dataSync.copyVolumes('main', 'feature-auth', {
        include: ['postgres-data', 'redis-data'],
        exclude: ['redis-data']
      });

      expect(results.copied).toHaveLength(1);
      expect(results.copied).toContain('postgres-data');
      expect(results.skipped).toHaveLength(2);
    });
  });

  describe('Named Volume Operations', () => {
    it('should create target volume before copying', async () => {
      const runtime = createMockRuntime();
      const inspector = createMockInspector(['postgres-data']);
      const dataSync = new DataSync(runtime, inspector);

      await dataSync.copyVolumes('main', 'feature-auth');

      expect(runtime.exec).toHaveBeenCalledWith('volume create feature-auth_postgres-data');
    });

    it('should copy data using alpine container', async () => {
      const runtime = createMockRuntime();
      const inspector = createMockInspector(['postgres-data']);
      const dataSync = new DataSync(runtime, inspector);

      await dataSync.copyVolumes('main', 'feature-auth');

      const copyCall = runtime.exec.mock.calls.find(call =>
        call[0].includes('run --rm') && call[0].includes('alpine')
      );

      expect(copyCall).toBeDefined();
      expect(copyCall[0]).toContain('main_postgres-data:/source:ro');
      expect(copyCall[0]).toContain('feature-auth_postgres-data:/target');
      expect(copyCall[0]).toContain('cp -a /source/. /target/');
    });

    it('should use read-only source volume', async () => {
      const runtime = createMockRuntime();
      const inspector = createMockInspector(['postgres-data']);
      const dataSync = new DataSync(runtime, inspector);

      await dataSync.copyVolumes('main', 'feature-auth');

      const copyCall = runtime.exec.mock.calls.find(call => call[0].includes('alpine'));
      expect(copyCall[0]).toContain(':ro'); // Read-only source
    });

    it('should handle source volume not existing', async () => {
      const runtime = {
        exec: vi.fn((cmd) => {
          if (cmd.includes('volume inspect main_postgres-data')) {
            throw new Error('Volume not found');
          }
          return '';
        })
      };
      const inspector = createMockInspector(['postgres-data']);
      const dataSync = new DataSync(runtime, inspector);

      const results = await dataSync.copyVolumes('main', 'feature-auth');

      expect(results.errors).toHaveLength(1);
      expect(results.errors[0].volume).toBe('postgres-data');
      expect(results.errors[0].error).toContain('does not exist');
    });
  });

  describe('Bind Mount Operations', () => {
    it('should copy bind mounts using filesystem commands', async () => {
      const runtime = createMockRuntime();
      const inspector = createMockInspector(['./uploads']);
      const dataSync = new DataSync(runtime, inspector);

      existsSync.mockReturnValue(true);
      execSync.mockReturnValue('');

      await dataSync.copyVolumes('main', 'feature-auth');

      // Should use rsync or cp
      expect(execSync).toHaveBeenCalledWith(
        expect.stringMatching(/rsync|cp/),
        expect.any(Object)
      );
    });

    it('should create target directory if it does not exist', async () => {
      const runtime = createMockRuntime();
      const inspector = createMockInspector(['./uploads']);
      const dataSync = new DataSync(runtime, inspector);

      // Mock: source exists, target doesn't
      existsSync.mockImplementation((path) => {
        return path.includes('main'); // Source exists
      });
      mkdirSync.mockReturnValue(undefined);
      execSync.mockReturnValue('');

      await dataSync.copyVolumes('main', 'feature-auth');

      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('uploads'),
        { recursive: true }
      );
    });

    it('should fallback to cp if rsync not available', async () => {
      const runtime = createMockRuntime();
      const inspector = createMockInspector(['./uploads']);
      const dataSync = new DataSync(runtime, inspector);

      existsSync.mockReturnValue(true);
      execSync.mockImplementation((cmd) => {
        if (cmd.includes('rsync')) {
          throw new Error('rsync not found');
        }
        return '';
      });

      await dataSync.copyVolumes('main', 'feature-auth');

      const cpCall = execSync.mock.calls.find(call => call[0].includes('cp -r'));
      expect(cpCall).toBeDefined();
    });

    it('should handle absolute bind mount paths', async () => {
      const runtime = createMockRuntime();
      const inspector = createMockInspector(['/var/data']);
      const dataSync = new DataSync(runtime, inspector);

      existsSync.mockReturnValue(true);
      execSync.mockReturnValue('');

      await dataSync.copyVolumes('main', 'feature-auth');

      const copyCall = execSync.mock.calls.find(call => call[0].includes('rsync') || call[0].includes('cp'));
      expect(copyCall[0]).toContain('/var/data');
    });
  });

  describe('Progress Reporting', () => {
    it('should call progress callback during copy', async () => {
      const runtime = createMockRuntime();
      const inspector = createMockInspector(['postgres-data']);
      const dataSync = new DataSync(runtime, inspector);

      const progressCallback = vi.fn();

      await dataSync.copyVolumes('main', 'feature-auth', {
        onProgress: progressCallback
      });

      expect(progressCallback).toHaveBeenCalledWith('postgres-data', 0, expect.any(Number));
      expect(progressCallback).toHaveBeenCalledWith('postgres-data', expect.any(Number), expect.any(Number));
    });

    it('should report 100% when copy completes', async () => {
      const runtime = createMockRuntime();
      const inspector = createMockInspector(['postgres-data']);
      const dataSync = new DataSync(runtime, inspector);

      const progressCallback = vi.fn();

      await dataSync.copyVolumes('main', 'feature-auth', {
        onProgress: progressCallback
      });

      const lastCall = progressCallback.mock.calls[progressCallback.mock.calls.length - 1];
      expect(lastCall[1]).toBe(lastCall[2]); // current === total (100%)
    });
  });

  describe('Volume Reset', () => {
    it('should remove and recreate volume', async () => {
      const runtime = createMockRuntime();
      const inspector = createMockInspector();
      const dataSync = new DataSync(runtime, inspector);

      await dataSync.resetVolume('test-worktree', 'postgres-data');

      expect(runtime.exec).toHaveBeenCalledWith(
        'volume rm test-worktree_postgres-data',
        { stdio: 'ignore' }
      );
      expect(runtime.exec).toHaveBeenCalledWith('volume create test-worktree_postgres-data');
    });

    it('should create volume even if remove fails', async () => {
      const runtime = {
        exec: vi.fn((cmd) => {
          if (cmd.includes('volume rm')) {
            throw new Error('Volume not found');
          }
          return '';
        })
      };
      const inspector = createMockInspector();
      const dataSync = new DataSync(runtime, inspector);

      await dataSync.resetVolume('test-worktree', 'postgres-data');

      expect(runtime.exec).toHaveBeenCalledWith('volume create test-worktree_postgres-data');
    });
  });

  describe('Volume Information', () => {
    it('should get volume info from runtime', async () => {
      const runtime = createMockRuntime();
      const inspector = createMockInspector();
      const dataSync = new DataSync(runtime, inspector);

      execSync.mockReturnValue('2.5G\t/path');

      const info = await dataSync.getVolumeInfo('test_postgres-data');

      expect(info.name).toBe('test_postgres-data');
      expect(info.driver).toBe('local');
      expect(info.mountpoint).toBeDefined();
    });

    it('should throw error for non-existent volume', async () => {
      const runtime = {
        exec: vi.fn(() => {
          throw new Error('Volume not found');
        })
      };
      const inspector = createMockInspector();
      const dataSync = new DataSync(runtime, inspector);

      await expect(dataSync.getVolumeInfo('nonexistent')).rejects.toThrow('Failed to get volume info');
    });
  });

  describe('Error Handling', () => {
    it('should continue copying other volumes if one fails', async () => {
      const runtime = {
        exec: vi.fn((cmd) => {
          if (cmd.includes('postgres-data')) {
            throw new Error('Copy failed');
          }
          if (cmd.includes('volume inspect')) {
            return JSON.stringify([{ Name: 'test', Driver: 'local', Mountpoint: '/path', CreatedAt: '2024-01-01' }]);
          }
          return '';
        })
      };
      const inspector = createMockInspector(['postgres-data', 'redis-data']);
      const dataSync = new DataSync(runtime, inspector);

      const results = await dataSync.copyVolumes('main', 'feature-auth');

      expect(results.errors).toHaveLength(1);
      expect(results.errors[0].volume).toBe('postgres-data');
      expect(results.copied).toContain('redis-data');
    });

    it('should provide detailed error information', async () => {
      const runtime = {
        exec: vi.fn((cmd) => {
          if (cmd.includes('volume inspect main_postgres-data')) {
            throw new Error('Volume not found');
          }
          return '';
        })
      };
      const inspector = createMockInspector(['postgres-data']);
      const dataSync = new DataSync(runtime, inspector);

      const results = await dataSync.copyVolumes('main', 'feature-auth');

      expect(results.errors[0]).toHaveProperty('volume');
      expect(results.errors[0]).toHaveProperty('error');
      expect(results.errors[0].error).toContain('does not exist');
    });
  });
});
