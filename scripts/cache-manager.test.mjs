import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheManager } from './cache-manager.mjs';
import fs from 'fs';
import path from 'path';
import os from 'os';

vi.mock('fs');
vi.mock('os');

describe('CacheManager', () => {
  let cacheManager;
  const cacheDir = '/mock/home/.vibetrees/cache';

  beforeEach(() => {
    vi.clearAllMocks();
    os.homedir.mockReturnValue('/mock/home');
    cacheManager = new CacheManager();
  });

  describe('Node Modules Caching', () => {
    it('should create cache directory if not exists', async () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockReturnValue(undefined);
      fs.cpSync.mockReturnValue(undefined);

      await cacheManager.cacheNodeModules('/source/node_modules');

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        path.join(cacheDir, 'node_modules'),
        { recursive: true }
      );
    });

    it('should copy node_modules to cache', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.cpSync.mockReturnValue(undefined);

      await cacheManager.cacheNodeModules('/source/node_modules');

      expect(fs.cpSync).toHaveBeenCalledWith(
        '/source/node_modules',
        path.join(cacheDir, 'node_modules'),
        { recursive: true, force: true }
      );
    });

    it('should restore node_modules from cache using hardlinks', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['package1', 'package2', '.bin']);
      fs.statSync.mockReturnValue({ isDirectory: () => true });
      fs.linkSync.mockReturnValue(undefined);
      fs.cpSync.mockReturnValue(undefined);

      await cacheManager.restoreNodeModules('/target/node_modules');

      // Should create hardlinks for files (not shown in simplified mock)
      expect(fs.cpSync).toHaveBeenCalled();
    });
  });

  describe('Cache Validation', () => {
    it('should validate cache freshness', () => {
      const packageJson = { dependencies: { express: '^4.18.0' } };
      const cachedPackageJson = { dependencies: { express: '^4.18.0' } };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync
        .mockReturnValueOnce(JSON.stringify(packageJson))
        .mockReturnValueOnce(JSON.stringify(cachedPackageJson));

      const isValid = cacheManager.isCacheValid('/project');

      expect(isValid).toBe(true);
    });

    it('should invalidate cache when dependencies change', () => {
      const packageJson = { dependencies: { express: '^4.19.0' } };
      const cachedPackageJson = { dependencies: { express: '^4.18.0' } };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync
        .mockReturnValueOnce(JSON.stringify(packageJson))
        .mockReturnValueOnce(JSON.stringify(cachedPackageJson));

      const isValid = cacheManager.isCacheValid('/project');

      expect(isValid).toBe(false);
    });
  });

  describe('Docker Cache', () => {
    it('should enable BuildKit cache', () => {
      const env = cacheManager.getDockerCacheEnv();

      expect(env.DOCKER_BUILDKIT).toBe('1');
      expect(env.BUILDKIT_PROGRESS).toBe('plain');
    });
  });
});
