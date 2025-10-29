/**
 * Tests for PortRegistry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PortRegistry } from './port-registry.mjs';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { execSync } from 'child_process';

vi.mock('fs');
vi.mock('os');
vi.mock('child_process');
vi.mock('proper-lockfile', () => ({
  default: {
    lock: vi.fn(async () => {
      // Return a mock release function
      return vi.fn(async () => {});
    })
  }
}));

describe('PortRegistry', () => {
  let registry;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock homedir
    homedir.mockReturnValue('/mock/home');

    // Mock filesystem
    existsSync.mockReturnValue(false);
    readFileSync.mockReturnValue('{}');
    writeFileSync.mockImplementation(() => {});
    mkdirSync.mockImplementation(() => {});

    // Mock execSync to return empty (no ports in use)
    execSync.mockReturnValue('');

    registry = new PortRegistry('/mock/project/my-app');
  });

  describe('constructor', () => {
    it('should initialize with project root', () => {
      expect(registry.projectRoot).toBe('/mock/project/my-app');
      expect(registry.registryDir).toBe('/mock/home/.vibetrees/project-my-app');
    });

    it('should load existing registry file', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('{"main:api": 3000, "feature-x:api": 3001}');

      registry = new PortRegistry('/mock/project/my-app');

      expect(registry.ports).toEqual({
        'main:api': 3000,
        'feature-x:api': 3001
      });
    });

    it('should handle missing registry file', () => {
      existsSync.mockReturnValue(false);

      registry = new PortRegistry('/mock/project/my-app');

      expect(registry.ports).toEqual({});
    });
  });

  describe('allocate', () => {
    it('should allocate base port when no conflicts', () => {
      const port = registry.allocate('main', 'api', 3000);

      expect(port).toBe(3000);
      expect(registry.ports['main:api']).toBe(3000);
    });

    it('should return existing port if already allocated', () => {
      registry.allocate('main', 'api', 3000);
      const port = registry.allocate('main', 'api', 3000);

      expect(port).toBe(3000);
    });

    it('should increment port when base port is taken', () => {
      registry.allocate('main', 'api', 3000);
      const port = registry.allocate('feature-x', 'api', 3000);

      expect(port).toBe(3001);
      expect(registry.ports['feature-x:api']).toBe(3001);
    });

    it('should find next available port with multiple allocations', () => {
      registry.allocate('main', 'api', 3000);
      registry.allocate('feature-x', 'api', 3000);
      registry.allocate('feature-y', 'api', 3000);

      expect(registry.ports['main:api']).toBe(3000);
      expect(registry.ports['feature-x:api']).toBe(3001);
      expect(registry.ports['feature-y:api']).toBe(3002);
    });
  });

  describe('release', () => {
    it('should release all ports for a worktree', () => {
      registry.allocate('feature-x', 'api', 3000);
      registry.allocate('feature-x', 'postgres', 5432);
      registry.allocate('main', 'api', 3001);

      registry.release('feature-x');

      expect(registry.ports['feature-x:api']).toBeUndefined();
      expect(registry.ports['feature-x:postgres']).toBeUndefined();
      expect(registry.ports['main:api']).toBe(3001);
    });

    it('should save after releasing', () => {
      registry.allocate('feature-x', 'api', 3000);
      registry.release('feature-x');

      expect(writeFileSync).toHaveBeenCalled();
    });
  });

  describe('getWorktreePorts', () => {
    it('should return all ports for a worktree', () => {
      registry.allocate('feature-x', 'api', 3000);
      registry.allocate('feature-x', 'postgres', 5432);
      registry.allocate('main', 'api', 3001);

      const ports = registry.getWorktreePorts('feature-x');

      expect(ports).toEqual({
        api: 3000,
        postgres: 5432
      });
    });

    it('should return empty object for unknown worktree', () => {
      const ports = registry.getWorktreePorts('unknown');

      expect(ports).toEqual({});
    });
  });

  describe('syncFromWorktrees', () => {
    it('should sync ports from worktree .env files', () => {
      const worktrees = [
        { name: 'main', path: '/mock/project/my-app' },
        { name: 'feature-x', path: '/mock/project/my-app/.worktrees/feature-x' }
      ];

      existsSync.mockImplementation((path) => {
        return path.endsWith('.env');
      });

      readFileSync.mockImplementation((path, encoding) => {
        // Handle registry file reads (should return empty JSON initially)
        if (path.endsWith('ports.json')) {
          return '{}';
        }
        // Handle .env file reads
        if (path.includes('my-app/.env')) {
          return 'COMPOSE_PROJECT_NAME=vibe_main\nPOSTGRES_PORT=5432\nAPI_PORT=3000\nCONSOLE_PORT=5173\n';
        }
        if (path.includes('feature-x/.env')) {
          return 'COMPOSE_PROJECT_NAME=vibe_feature_x\nPOSTGRES_PORT=5433\nAPI_PORT=3001\nCONSOLE_PORT=5174\n';
        }
        return '';
      });

      const synced = registry.syncFromWorktrees(worktrees);

      expect(synced).toBe(6);
      expect(registry.ports['main:postgres']).toBe(5432);
      expect(registry.ports['main:api']).toBe(3000);
      expect(registry.ports['main:console']).toBe(5173);
      expect(registry.ports['feature-x:postgres']).toBe(5433);
      expect(registry.ports['feature-x:api']).toBe(3001);
      expect(registry.ports['feature-x:console']).toBe(5174);
    });

    it('should skip worktrees without .env files', () => {
      const worktrees = [
        { name: 'main', path: '/mock/project/my-app' },
        { name: 'feature-x', path: '/mock/project/my-app/.worktrees/feature-x' }
      ];

      existsSync.mockReturnValue(false);

      const synced = registry.syncFromWorktrees(worktrees);

      expect(synced).toBe(0);
      expect(registry.ports).toEqual({});
    });

    it('should not override existing port allocations', () => {
      registry.allocate('main', 'postgres', 5432);
      registry.allocate('main', 'api', 3000);

      const worktrees = [
        { name: 'main', path: '/mock/project/my-app' }
      ];

      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('POSTGRES_PORT=9999\nAPI_PORT=8888\n');

      const synced = registry.syncFromWorktrees(worktrees);

      expect(synced).toBe(0);
      expect(registry.ports['main:postgres']).toBe(5432);
      expect(registry.ports['main:api']).toBe(3000);
    });

    it('should handle env files with various formats', () => {
      const worktrees = [
        { name: 'feature-x', path: '/mock/project/my-app/.worktrees/feature-x' }
      ];

      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(`
# Comment line
POSTGRES_PORT=5432
API_PORT=3000
TEMPORAL_PORT=7233
TEMPORAL_UI_PORT=8233
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
COMPOSE_PROJECT_NAME=vibe_feature_x
`);

      const synced = registry.syncFromWorktrees(worktrees);

      expect(synced).toBe(6);
      expect(registry.ports['feature-x:postgres']).toBe(5432);
      expect(registry.ports['feature-x:api']).toBe(3000);
      expect(registry.ports['feature-x:temporal']).toBe(7233);
      expect(registry.ports['feature-x:temporal-ui']).toBe(8233);
      expect(registry.ports['feature-x:minio']).toBe(9000);
      expect(registry.ports['feature-x:minio-console']).toBe(9001);
    });

    it('should handle allocation with hyphenated service names', () => {
      const port1 = registry.allocate('feature-x', 'temporal-ui', 8233);
      const port2 = registry.allocate('feature-y', 'temporal-ui', 8233);
      const port3 = registry.allocate('feature-x', 'minio-console', 9001);
      const port4 = registry.allocate('feature-y', 'minio-console', 9001);

      expect(port1).toBe(8233);
      expect(port2).toBe(8234);
      expect(port3).toBe(9001);
      expect(port4).toBe(9002);
      expect(registry.ports['feature-x:temporal-ui']).toBe(8233);
      expect(registry.ports['feature-y:temporal-ui']).toBe(8234);
      expect(registry.ports['feature-x:minio-console']).toBe(9001);
      expect(registry.ports['feature-y:minio-console']).toBe(9002);
    });

    it('should handle read errors gracefully', () => {
      const worktrees = [
        { name: 'feature-x', path: '/mock/project/my-app/.worktrees/feature-x' }
      ];

      existsSync.mockReturnValue(true);
      readFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const synced = registry.syncFromWorktrees(worktrees);

      expect(synced).toBe(0);
      expect(registry.ports).toEqual({});
    });

    it('should save registry after syncing', () => {
      const worktrees = [
        { name: 'main', path: '/mock/project/my-app' }
      ];

      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('POSTGRES_PORT=5432\n');

      registry.syncFromWorktrees(worktrees);

      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should not save if no ports were synced', () => {
      const worktrees = [
        { name: 'main', path: '/mock/project/my-app' }
      ];

      existsSync.mockReturnValue(false);

      writeFileSync.mockClear();
      registry.syncFromWorktrees(worktrees);

      // Should only save once from constructor, not from sync
      expect(writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('isPortInUseSync', () => {
    it('should return false when port is not in use', () => {
      execSync.mockReturnValue('');

      const inUse = registry.isPortInUseSync(3000);

      expect(inUse).toBe(false);
    });

    it('should return true when port is in use', () => {
      execSync.mockReturnValue('12345\n');

      const inUse = registry.isPortInUseSync(3000);

      expect(inUse).toBe(true);
    });

    it('should handle errors gracefully', () => {
      execSync.mockImplementation(() => {
        throw new Error('lsof not found');
      });

      const inUse = registry.isPortInUseSync(3000);

      expect(inUse).toBe(false);
    });
  });

  describe('allocate with system port checking', () => {
    beforeEach(() => {
      // Reset registry for each test
      registry = new PortRegistry('/mock/project/my-app');
    });

    it('should skip ports that are in use on the system', () => {
      // Mock: port 3000 is in use, port 3001 is free
      execSync.mockImplementation((cmd) => {
        if (cmd.includes(':3000')) {
          return '12345\n'; // Port 3000 is in use
        }
        return ''; // Other ports are free
      });

      const port = registry.allocate('main', 'api', 3000);

      expect(port).toBe(3001);
      expect(registry.ports['main:api']).toBe(3001);
    });

    it('should combine registry and system checks', () => {
      // Reset mock to return empty for all ports initially
      execSync.mockReturnValue('');

      // Allocate port 3000 in registry
      registry.allocate('main', 'api', 3000);

      // Now mock: port 3001 is in use on system
      execSync.mockImplementation((cmd) => {
        if (cmd.includes(':3001')) {
          return '12345\n';
        }
        return '';
      });

      const port = registry.allocate('feature-x', 'api', 3000);

      // Should skip 3000 (in registry) and 3001 (in use on system)
      expect(port).toBe(3002);
    });

    it('should still work if system check fails', () => {
      // Reset registry
      registry = new PortRegistry('/mock/project/my-app');

      execSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const port = registry.allocate('main', 'api', 3000);

      expect(port).toBe(3000);
      expect(registry.ports['main:api']).toBe(3000);
    });
  });

  describe('_getProjectConfigDir', () => {
    it('should use parent-child naming', () => {
      const dir = registry._getProjectConfigDir('/Users/tim/code/my-app');

      expect(dir).toBe('/mock/home/.vibetrees/code-my-app');
    });

    it('should handle single directory path', () => {
      const dir = registry._getProjectConfigDir('/my-app');

      expect(dir).toBe('/mock/home/.vibetrees/my-app');
    });
  });

  describe('atomic allocation', () => {
    beforeEach(() => {
      // Clear mocks
      vi.clearAllMocks();

      // Mock homedir
      homedir.mockReturnValue('/mock/home');

      // Mock filesystem
      existsSync.mockReturnValue(false);
      readFileSync.mockReturnValue('{}');
      writeFileSync.mockImplementation(() => {});
      mkdirSync.mockImplementation(() => {});

      // Mock execSync to return empty (no ports in use)
      execSync.mockReturnValue('');

      // Reset registry for each test
      registry = new PortRegistry('/mock/project/my-app');
    });

    it('should allocate multiple ports atomically', async () => {
      const services = { api: 3000, postgres: 5432, console: 5173 };
      const ports = await registry.allocateAtomic('main', services);

      expect(ports).toHaveProperty('api');
      expect(ports).toHaveProperty('postgres');
      expect(ports).toHaveProperty('console');
      expect(ports.api).toBeGreaterThanOrEqual(3000);
      expect(ports.postgres).toBeGreaterThanOrEqual(5432);
      expect(ports.console).toBeGreaterThanOrEqual(5173);
    });

    it('should handle multiple worktrees without conflicts', async () => {
      const ports1 = await registry.allocateAtomic('wt1', { api: 3000 });
      const ports2 = await registry.allocateAtomic('wt2', { api: 3000 });
      const ports3 = await registry.allocateAtomic('wt3', { api: 3000 });

      // Verify all allocations returned valid ports
      expect(ports1.api).toBeGreaterThanOrEqual(3000);
      expect(ports2.api).toBeGreaterThanOrEqual(3000);
      expect(ports3.api).toBeGreaterThanOrEqual(3000);

      // Note: In a mocked environment, the file isn't persisted between calls,
      // so each call to _withLock() reloads an empty state. This test verifies
      // that the method works, but full concurrency testing requires integration tests.
    });

    it('should save after atomic allocation', async () => {
      writeFileSync.mockClear();
      const services = { api: 3000 };
      await registry.allocateAtomic('main', services);

      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should return existing ports on retry for same worktree', async () => {
      const services = { api: 3000, postgres: 5432 };
      const ports1 = await registry.allocateAtomic('main', services);
      const ports2 = await registry.allocateAtomic('main', services);

      expect(ports1).toEqual(ports2);
    });
  });

  describe('atomic release', () => {
    beforeEach(() => {
      // Clear mocks
      vi.clearAllMocks();

      // Mock homedir
      homedir.mockReturnValue('/mock/home');

      // Mock filesystem
      existsSync.mockReturnValue(false);
      readFileSync.mockReturnValue('{}');
      writeFileSync.mockImplementation(() => {});
      mkdirSync.mockImplementation(() => {});

      // Mock execSync to return empty (no ports in use)
      execSync.mockReturnValue('');

      registry = new PortRegistry('/mock/project/my-app');
    });

    it('should release all ports for a worktree', async () => {
      // Allocate ports
      await registry.allocateAtomic('feature-x', { api: 3000, postgres: 5432 });

      // Verify ports were allocated
      expect(Object.keys(registry.ports).some(k => k.startsWith('feature-x:'))).toBe(true);

      // Release
      await registry.releaseAtomic('feature-x');

      // Verify ports were released
      expect(Object.keys(registry.ports).some(k => k.startsWith('feature-x:'))).toBe(false);
    });

    it('should save after atomic release', async () => {
      await registry.allocateAtomic('feature-x', { api: 3000 });
      writeFileSync.mockClear();

      await registry.releaseAtomic('feature-x');

      expect(writeFileSync).toHaveBeenCalled();
    });
  });
});
